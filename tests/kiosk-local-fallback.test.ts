/**
 * Phase 6: fallback kiosk hanya pada kegagalan JARINGAN + perbaikan data loss.
 *
 * Yang dijaga di sini adalah aturan yang mahal kalau dilanggar:
 * - 4xx/5xx cloud TIDAK boleh jatuh ke jalur lokal (bug server tidak boleh
 *   tersembunyi di balik booth yang tetap menjual),
 * - `PIN_LOCKED` tidak boleh jatuh ke PIN darurat (itu membatalkan rate-limit
 *   cloud — cukup cabut kabel untuk membuka booth),
 * - sesi `local_*` tidak boleh disapu `purgeOrphaned` (fotonya masih bisa
 *   disinkronkan runtime),
 * - reload singkat tidak boleh menghapus finalize yang belum terkirim.
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { KioskError } from "../src/components/kiosk/api.ts";
import { submitExit } from "../src/components/kiosk/exit-fallback.ts";

// ---------------------------------------------------------------- exit fallback

type Calls = { cloud: number; local: number };

function run(input: {
  cloud: () => Promise<unknown>;
  local?: () => Promise<unknown>;
}): Promise<{ calls: Calls; ok: number; errors: string[] }> {
  const calls: Calls = { cloud: 0, local: 0 };
  const errors: string[] = [];
  let ok = 0;
  return submitExit({
    cloud: () => {
      calls.cloud += 1;
      return input.cloud() as Promise<{ ok: boolean }>;
    },
    local: () => {
      calls.local += 1;
      return (input.local?.() ?? Promise.resolve({ ok: true })) as Promise<{ ok: boolean }>;
    },
    onSuccess: () => {
      ok += 1;
    },
    onError: (message) => errors.push(message),
  }).then(() => ({ calls, ok, errors }));
}

const networkDown = () => Promise.reject(new KioskError("NETWORK", "Tidak dapat terhubung."));

test("cloud 500: TIDAK fallback ke runtime lokal", async () => {
  const r = await run({
    cloud: () => Promise.reject(new KioskError("INTERNAL", "Terjadi kesalahan")),
  });
  assert.equal(r.calls.cloud, 1);
  assert.equal(r.calls.local, 0, "error server tidak boleh jadi jalur lokal");
  assert.equal(r.ok, 0);
  assert.deepEqual(r.errors, ["Terjadi kesalahan"]);
});

test("cloud timeout: fallback ke PIN darurat lokal", async () => {
  const r = await run({
    cloud: () => Promise.reject(new KioskError("TIMEOUT", "Terlalu lambat")),
    local: () => Promise.resolve({ ok: true, emergency: true }),
  });
  assert.equal(r.calls.local, 1, "jaringan mati harus jatuh ke runtime lokal");
  assert.equal(r.ok, 1);
  assert.deepEqual(r.errors, []);
});

test("PIN_LOCKED cloud: TIDAK fallback (rate-limit cloud tetap berlaku)", async () => {
  const r = await run({
    cloud: () => Promise.reject(new KioskError("PIN_LOCKED", "PIN terkunci")),
    local: () => Promise.resolve({ ok: true }),
  });
  assert.equal(r.calls.local, 0);
  assert.equal(r.ok, 0);
  assert.deepEqual(r.errors, ["PIN terkunci"]);
});

test("cloud sukses: PIN darurat tidak pernah dicoba", async () => {
  const r = await run({ cloud: () => Promise.resolve({ ok: true, pin_required: true }) });
  assert.equal(r.calls.cloud, 1);
  assert.equal(r.calls.local, 0);
  assert.equal(r.ok, 1);
});

test("PIN darurat salah 5x: terkunci lokal, onSuccess tidak dipanggil", async () => {
  // Stub kontrak `/v1/exit` (runtime): 5 gagal → 429 PIN_LOCKED, lalu benar pun ditolak.
  const PIN = "4821";
  let failed = 0;
  let locked = false;
  const localExit = (pin: string) => {
    if (locked) return Promise.reject(new KioskError("PIN_LOCKED", "PIN terkunci 5 menit."));
    if (pin === PIN) {
      failed = 0;
      return Promise.resolve({ ok: true, emergency: true });
    }
    failed += 1;
    if (failed >= 5) {
      locked = true;
      return Promise.reject(new KioskError("PIN_LOCKED", "PIN salah 5x. Terkunci 5 menit."));
    }
    return Promise.reject(new KioskError("PIN_EMERGENCY_REJECTED", "PIN darurat salah."));
  };

  const attempts: Awaited<ReturnType<typeof run>>[] = [];
  for (const pin of ["0000", "1111", "2222", "3333", "4444"]) {
    attempts.push(await run({ cloud: networkDown, local: () => localExit(pin) }));
  }
  assert.equal(attempts.filter((a) => a.ok === 1).length, 0, "tidak ada percobaan yang lolos");
  assert.ok(
    attempts.every((a) => a.calls.local === 1),
    "semua percobaan lewat runtime lokal"
  );
  assert.equal(locked, true, "5 gagal harus mengunci");
  assert.match(attempts[4]!.errors[0] ?? "", /Terkunci/);

  const afterLock = await run({ cloud: networkDown, local: () => localExit(PIN) });
  assert.equal(afterLock.ok, 0, "PIN benar pun ditolak selama terkunci");
  assert.match(afterLock.errors[0] ?? "", /terkunci/i);
});

test("PIN darurat benar: onSuccess dipanggil", async () => {
  const r = await run({
    cloud: networkDown,
    local: () => Promise.resolve({ ok: true, emergency: true }),
  });
  assert.equal(r.calls.local, 1);
  assert.equal(r.ok, 1);
  assert.deepEqual(r.errors, []);
});

// ---------------------------------------------------------------- purgeOrphaned

type Store = Map<string, unknown>;

function installIndexedDb() {
  const items: Store = new Map();
  const request = <T>(result: T) => {
    const req: { result?: T; onsuccess?: () => void; onerror?: () => void } = { result };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  };
  (globalThis as Record<string, unknown>).indexedDB = {
    open: () => {
      const req = {
        result: {
          objectStoreNames: { contains: () => true },
          transaction: () => ({
            objectStore: () => ({
              put: (v: { sessionId: string }) => {
                items.set(v.sessionId, v);
                return request(undefined);
              },
              getAll: () => request([...items.values()]),
              delete: (k: string) => {
                items.delete(k);
                return request(undefined);
              },
            }),
            oncomplete: null as unknown,
          }),
          close: () => {},
        },
        onupgradeneeded: null as unknown,
        onsuccess: null as unknown,
        onerror: null as unknown,
      };
      queueMicrotask(() => (req as { onsuccess?: () => void }).onsuccess?.());
      return req;
    },
  };
  return items;
}

const queued = (sessionId: string, queuedAt: number) => ({
  sessionId,
  businessSlug: "demo",
  templateId: null,
  retakeCount: 0,
  photos: [],
  queuedAt,
});

test("purgeOrphaned mempertahankan sesi local_ walau tanpa token", async () => {
  const items = installIndexedDb();
  const mod = await import("../src/components/kiosk/offline-queue.ts");
  const old = Date.now() - 24 * 60 * 60 * 1000;

  await mod.enqueueFinalize(queued("local_abc", old));
  await mod.enqueueFinalize(queued("cloud-uuid", old));

  await mod.purgeOrphaned(null);

  assert.equal(items.has("local_abc"), true, "sesi runtime lokal tidak pernah disapu");
  assert.equal(items.has("cloud-uuid"), false, "sesi cloud yatim lewat grace dibuang");
});

test("purgeOrphaned mempertahankan sesi cloud selama grace belum habis", async () => {
  const items = installIndexedDb();
  const mod = await import("../src/components/kiosk/offline-queue.ts");
  const now = Date.now();

  await mod.enqueueFinalize(queued("cloud-fresh", now));
  await mod.enqueueFinalize(queued("cloud-stale", now - mod.ORPHAN_GRACE_MS - 1));

  await mod.purgeOrphaned(null, now);

  assert.equal(items.has("cloud-fresh"), true, "reload singkat tidak boleh menghapus foto");
  assert.equal(items.has("cloud-stale"), false);
});

test("purgeOrphaned tidak menyapu apa pun saat token masih hidup", async () => {
  const items = installIndexedDb();
  const mod = await import("../src/components/kiosk/offline-queue.ts");
  const old = Date.now() - 24 * 60 * 60 * 1000;

  await mod.enqueueFinalize(queued("cloud-old", old));
  await mod.purgeOrphaned("device-token");

  assert.equal(items.has("cloud-old"), true);
});
