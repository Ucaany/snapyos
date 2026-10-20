/**
 * Phase 6 — retention & cleanup checks (node:test, tanpa framework).
 * Menguji bagian PURE: cutoff retention, cleanup batch provider-aware
 * (normal expiry, R2, Supabase legacy, missing object, partial failure,
 * retry cron), dan aturan key basi pada penggantian/penghapusan template.
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { retentionCutoff, cleanupSessionMedia, type SessionMedia } from "../src/lib/retention.ts";
import {
  staleTemplateKeys,
  staleThumbnailKeys,
  storageKeysOnly,
} from "../src/lib/template-cleanup.ts";
import { StorageResolver } from "../src/lib/r2/resolver.ts";

// --- helpers ---------------------------------------------------------------

function fakeRemove(behavior: { fail?: string[]; ok?: string[] }) {
  const failSet = new Set(behavior.fail ?? []);
  const calls: string[][] = [];
  return {
    calls,
    remove: async (keys: string[]) => {
      calls.push(keys);
      const ok: string[] = [];
      const failures: { key: string; message: string }[] = [];
      for (const k of keys) {
        if (failSet.has(k)) failures.push({ key: k, message: "provider error" });
        else ok.push(k);
      }
      return { ok, failures };
    },
  };
}

type Finalize = { ids: string[]; at: string };

function collectDeps(
  storage: ReturnType<typeof fakeRemove>,
  accountSubResult?: { ok: boolean; error?: string; missing?: boolean }
) {
  const subs: string[] = [];
  const finalizes: Finalize[] = [];
  const logs: string[] = [];
  return {
    subs,
    finalizes,
    logs,
    deps: {
      storage: { remove: storage.remove },
      accountSub: async (keys: string[]) => {
        subs.push(...keys);
        // Default { ok:true } (tes lama). Override untuk menguji jalur gagal.
        return accountSubResult ?? { ok: true };
      },
      finalize: async (ids: string[], at: string) => void finalizes.push({ ids, at }),
      log: (m: string) => void logs.push(m),
    },
  };
}

// --- cutoff ----------------------------------------------------------------

test("retentionCutoff: 3 hari, integer ms tepat", () => {
  const now = Date.UTC(2026, 0, 10, 0, 0, 0);
  assert.equal(retentionCutoff(3, now), new Date(now - 3 * 86_400_000).toISOString());
});

test("retentionCutoff: nilai tidak valid → default 3 hari", () => {
  const now = Date.UTC(2026, 0, 10);
  assert.equal(retentionCutoff(0, now), retentionCutoff(3, now));
  assert.equal(retentionCutoff(-5, now), retentionCutoff(3, now));
});

// --- 1. normal expiration --------------------------------------------------

test("cleanup: sesi expired normal → media dihapus, DB difinalisasi", async () => {
  const storage = fakeRemove({});
  const h = collectDeps(storage);
  const sessions: SessionMedia[] = [
    { id: "s1", keys: ["a.jpg", "a-thumb.jpg", "g.gif"] },
    { id: "s2", keys: ["b.jpg"] },
  ];
  const res = await cleanupSessionMedia(sessions, "2026-01-01T00:00:00.000Z", h.deps);

  assert.equal(res.cleanedSessions, 2);
  assert.equal(res.removedObjects, 4);
  assert.equal(res.deferredSessions, 0);
  assert.deepEqual(
    h.finalizes[0]!.ids.sort(),
    ["s1", "s2"],
    "semua sesi difinalisasi dalam satu panggilan"
  );
  assert.equal(h.finalizes[0]!.at, "2026-01-01T00:00:00.000Z");
  // Akuntansi hanya untuk key yang benar-benar terhapus.
  assert.deepEqual(h.subs.sort(), ["a-thumb.jpg", "a.jpg", "b.jpg", "g.gif"]);
});

test("cleanup: key duplikat lintas sesi di-dedup (satu delete)", async () => {
  const storage = fakeRemove({});
  const h = collectDeps(storage);
  await cleanupSessionMedia(
    [
      { id: "s1", keys: ["shared.jpg"] },
      { id: "s2", keys: ["shared.jpg"] },
    ],
    "t",
    h.deps
  );
  assert.deepEqual(storage.calls, [["shared.jpg"]]);
});

// --- 2. R2 vs 3. Supabase legacy: routing provider --------------------------

test("provider-aware: objek R2 + objek Supabase legacy dihapus di provider masing-masing", async () => {
  // Resolver menentukan owner via head(): R2 untuk objek baru, Supabase untuk legacy.
  const r2Keys = new Set(["new-1.jpg", "new-2.jpg"]);
  const sbKeys = new Set(["legacy-1.jpg"]);
  const removed: { r2: string[]; supabase: string[] } = { r2: [], supabase: [] };
  const headCalls: { r2: string[]; supabase: string[] } = { r2: [], supabase: [] };

  const r2 = {
    name: "r2",
    head: async (_b: string, k: string) => {
      headCalls.r2.push(k);
      return r2Keys.has(k) ? true : false;
    },
    remove: async (_b: string, keys: string[]) => {
      removed.r2.push(...keys);
      return { data: null, error: null };
    },
  };
  const sb = {
    name: "supabase",
    head: async (_b: string, k: string) => {
      headCalls.supabase.push(k);
      return sbKeys.has(k) ? true : false;
    },
    remove: async (_b: string, keys: string[]) => {
      removed.supabase.push(...keys);
      return { data: null, error: null };
    },
  };

  const resolver = new StorageResolver(r2, sb);
  const groups = new Map<string, string[]>();
  for (const key of ["new-1.jpg", "new-2.jpg", "legacy-1.jpg"]) {
    const outcome = await resolver.resolveOutcome("generated-photos", key);
    assert.equal(outcome.status, "present");
    const provider = outcome.status === "present" ? outcome.provider.name : "";
    const list = groups.get(provider) ?? [];
    list.push(key);
    groups.set(provider, list);
  }
  for (const [providerName, keys] of groups) {
    const provider = providerName === "r2" ? r2 : sb;
    await provider.remove("generated-photos", keys);
  }

  assert.deepEqual(removed.r2.sort(), ["new-1.jpg", "new-2.jpg"]);
  assert.deepEqual(removed.supabase, ["legacy-1.jpg"]);
});

// --- 4. missing object (idempotent) ----------------------------------------

test("missing object: resolver absent → dianggap sukses (idempotent), sesi tetap dibersihkan", async () => {
  const r2 = { name: "r2", head: async () => false };
  const sb = { name: "supabase", head: async () => false };
  const resolver = new StorageResolver(r2, sb);
  const outcome = await resolver.resolveOutcome("generated-photos", "gone.jpg");
  assert.equal(outcome.status, "absent");

  // Simulasi: object absen sudah masuk `ok` (tidak perlu remove).
  const h = collectDeps(fakeRemove({}));
  const res = await cleanupSessionMedia([{ id: "s1", keys: ["gone.jpg"] }], "t", h.deps);
  assert.equal(res.cleanedSessions, 1);
  assert.equal(res.deferredSessions, 0);
});

// --- 5. partial failure ----------------------------------------------------

test("partial failure: satu object gagal → sesi terkait ditahan, sisanya lanjut", async () => {
  const storage = fakeRemove({ fail: ["bad.jpg"] });
  const h = collectDeps(storage);
  const res = await cleanupSessionMedia(
    [
      { id: "s1", keys: ["good1.jpg", "bad.jpg"] }, // gagal → ditahan
      { id: "s2", keys: ["good2.jpg"] }, // sukses
    ],
    "t",
    h.deps
  );

  assert.equal(res.cleanedSessions, 1);
  assert.equal(res.deferredSessions, 1);
  // Sesi gagal TIDAK difinalisasi; session history aman.
  assert.deepEqual(h.finalizes[0]!.ids, ["s2"]);
  // good1.jpg (sesi gagal) + good2.jpg tetap terhapus & akuntansi tercatat.
  assert.equal(res.removedObjects, 2);
  // Log tidak membocorkan URL/kredensial — hanya key + pesan.
  assert.ok(h.logs[0]!.includes("bad.jpg"));
});

test("partial failure: batch TIDAK membatalkan object yang sukses", async () => {
  const storage = fakeRemove({ fail: ["x2"] });
  const h = collectDeps(storage);
  await cleanupSessionMedia([{ id: "s1", keys: ["x1", "x2", "x3"] }], "t", h.deps);
  // x1 & x3 tercatat di akuntansi meski x2 gagal.
  assert.deepEqual(h.subs.sort(), ["x1", "x3"]);
});

// --- 5b. akuntansi gagal: transient vs misconfig ---------------------------

test("accountSub gagal transient → finalize DITAHAN, deferredAccounting diisi", async () => {
  const storage = fakeRemove({});
  const h = collectDeps(storage, { ok: false, error: "network timeout" });
  const sessions: SessionMedia[] = [
    { id: "s1", keys: ["a.jpg"] },
    { id: "s2", keys: ["b.jpg"] },
  ];
  const res = await cleanupSessionMedia(sessions, "t", h.deps);

  assert.equal(res.cleanedSessions, 0);
  assert.equal(res.deferredAccounting, 2, "semua sesi bersih ditahan karena akuntansi transien");
  assert.equal(h.finalizes.length, 0, "finalize TIDAK dipanggil saat akuntansi transien gagal");
  assert.ok(h.logs.some((m) => m.includes("accountSub gagal")));
});

test("accountSub missing (fungsi/tabel absen) → fail-open, finalize TETAP jalan", async () => {
  const storage = fakeRemove({});
  const h = collectDeps(storage, {
    ok: false,
    error: "Could not find the function",
    missing: true,
  });
  const sessions: SessionMedia[] = [
    { id: "s1", keys: ["a.jpg"] },
    { id: "s2", keys: ["b.jpg"] },
  ];
  const res = await cleanupSessionMedia(sessions, "t", h.deps);

  assert.equal(res.cleanedSessions, 2, "misconfig akuntansi tidak menahan cleanup media");
  assert.equal(h.finalizes.length, 1, "finalize dijalankan (fail-open)");
  assert.deepEqual(h.finalizes[0]!.ids.sort(), ["s1", "s2"]);
  assert.equal(res.deferredAccounting, 0, "misconfig bukan deferral akuntansi");
});

// --- 6. retry cron ---------------------------------------------------------

test("retry cron: object yang gagal lalu tersedia → sesi tertinggal akhirnya bersih", async () => {
  // Run pertama: g.gif gagal → s1 ditahan.
  let gifAvailable = false;
  const storage1 = {
    remove: async (keys: string[]) => {
      const ok: string[] = [];
      const failures: { key: string; message: string }[] = [];
      for (const k of keys) {
        if (k === "g.gif" && !gifAvailable) failures.push({ key: k, message: "timeout" });
        else ok.push(k);
      }
      return { ok, failures };
    },
  };
  const h1 = collectDeps(fakeRemove({}));
  const res1 = await cleanupSessionMedia([{ id: "s1", keys: ["p.jpg", "g.gif"] }], "t1", {
    storage: { remove: storage1.remove },
    accountSub: h1.deps.accountSub,
    finalize: h1.deps.finalize,
  });
  assert.equal(res1.deferredSessions, 1);
  assert.deepEqual(h1.finalizes, [], "sesi ditahan, tidak difinalisasi di run 1");

  // Run kedua: gagal hilang → sukses.
  gifAvailable = true;
  const h2 = collectDeps(fakeRemove({}));
  const res2 = await cleanupSessionMedia([{ id: "s1", keys: ["p.jpg", "g.gif"] }], "t2", h2.deps);
  assert.equal(res2.cleanedSessions, 1);
  assert.deepEqual(h2.finalizes[0]!.ids, ["s1"]);
});

// --- 7 & 8. template replacement / deletion (stale key rules) ---------------

test("template replacement: frame lama + thumbnail lama dibersihkan, key baru disimpan", () => {
  const stale = staleTemplateKeys({
    oldFile: "biz/templates/frame-old.png",
    oldThumbnail: "biz/templates/thumb-old.png",
    newKey: "biz/templates/frame-new.png",
  });
  assert.deepEqual(stale.sort(), ["biz/templates/frame-old.png", "biz/templates/thumb-old.png"]);
});

test("template replacement: thumbnail === frame lama → dedup (hapus sekali)", () => {
  const stale = staleTemplateKeys({
    oldFile: "biz/templates/frame.png",
    oldThumbnail: "biz/templates/frame.png",
    newKey: "biz/templates/frame-new.png",
  });
  assert.deepEqual(stale, ["biz/templates/frame.png"]);
});

test("template replacement: key baru tidak ikut dihapus", () => {
  const stale = staleTemplateKeys({
    oldFile: "biz/templates/a.png",
    oldThumbnail: "biz/templates/a.png",
    newKey: "biz/templates/a.png",
  });
  assert.deepEqual(stale, []);
});

test("template deletion: frame + thumbnail dihapus, null diabaikan", () => {
  const keys = staleTemplateKeys({
    oldFile: "biz/templates/frame.png",
    oldThumbnail: "biz/templates/thumb.png",
  });
  assert.deepEqual(keys.sort(), ["biz/templates/frame.png", "biz/templates/thumb.png"]);
});

test("template deletion: thumbnail null/undefined diabaikan", () => {
  const keys = staleTemplateKeys({
    oldFile: "biz/templates/frame.png",
    oldThumbnail: null,
  });
  assert.deepEqual(keys, ["biz/templates/frame.png"]);
});

test("uploadThumbnail: thumbnail lama = frame (default upload) → frame TIDAK dihapus", () => {
  const keys = staleThumbnailKeys({
    oldThumbnail: "biz/templates/frame.png",
    newThumbnail: "biz/templates/thumb-new.png",
    currentFrame: "biz/templates/frame.png",
  });
  assert.deepEqual(keys, []);
});

test("uploadThumbnail: thumbnail lama beda dari frame → thumbnail lama dihapus", () => {
  const keys = staleThumbnailKeys({
    oldThumbnail: "biz/templates/thumb-old.png",
    newThumbnail: "biz/templates/thumb-new.png",
    currentFrame: "biz/templates/frame.png",
  });
  assert.deepEqual(keys, ["biz/templates/thumb-old.png"]);
});

test("uploadThumbnail: thumbnail baru tidak pernah dihapus", () => {
  const keys = staleThumbnailKeys({
    oldThumbnail: "biz/templates/thumb-new.png",
    newThumbnail: "biz/templates/thumb-new.png",
    currentFrame: "biz/templates/frame.png",
  });
  assert.deepEqual(keys, []);
});

test("storageKeysOnly: URL absolut dibuang, key storage dipertahankan", () => {
  assert.deepEqual(
    storageKeysOnly([
      "global/templates/frame.png",
      "https://cdn.snapyos.biz.id/templates/frame.png",
      "http://example.com/x.jpg",
      "global/templates/thumb.webp",
    ]),
    ["global/templates/frame.png", "global/templates/thumb.webp"]
  );
});

test("storageKeysOnly: hanya URL eksternal → hasil kosong (tanpa probe storage)", () => {
  assert.deepEqual(storageKeysOnly(["https://cdn.snapyos.biz.id/a.png"]), []);
});
