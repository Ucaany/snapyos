/**
 * Phase 7 — sync worker runtime lokal + tulis balik setelan.
 *
 * Yang diuji hanya janji yang mahal kalau salah: cloud 500 lalu 200 tidak
 * menghasilkan dua sesi cloud, backoff benar-benar menunggu makin lama, sesi
 * yang ditolak cloud (410) tidak menghapus foto pelanggan tanpa menyalinnya
 * dulu, dan laporan device tidak bisa menghapus `copies` milik cloud.
 *
 * Run: npm test
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, type RuntimeConfig } from "../runtime/config.ts";
import { closeDatabase, insertSession, openDatabase, setMeta } from "../runtime/db/index.ts";
import {
  backoffDelay,
  idempotencyKey,
  MAX_BACKOFF_MS,
  quarantineDir,
  runSyncOnce,
  type SyncContext,
} from "../runtime/sync/worker.ts";
import {
  deviceSettingsPatchSchema,
  foreignSettingKeys,
  mergeDeviceSettings,
} from "../src/lib/validators.ts";

const DEVICE_TOKEN = "test-device-token-0123456789abcdef";
const BUSINESS_SLUG = "snapy-demo";
const PHOTOBOX_SLUG = "booth-01";

/** Dibangun lewat `loadConfig` supaya field baru tidak mematahkan fixture. */
function baseConfig(dataDir: string): RuntimeConfig {
  return loadConfig({
    PHOTOBOOTH_BRIDGE_TOKEN: "test-bridge-token-0123456789",
    SNAPYOS_CAMERA: "mock",
    SNAPYOS_PRINTER: "mock",
    SNAPYOS_ALLOW_MOCK: "1",
    SNAPYOS_DATA_DIR: dataDir,
    SNAPYOS_CLOUD_URL: "https://cloud.test",
    SNAPYOS_DEVICE_TOKEN: DEVICE_TOKEN,
  });
}

type Fixture = {
  dir: string;
  db: ReturnType<typeof openDatabase>;
  ctx: SyncContext;
  clock: { value: number };
  sessionId: string;
  payloadPath: string;
  photoPath: string;
};

/** Sesi lokal yang sudah difinalisasi dan siap dikirim. */
function makeFixture(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), "snapyos-sync-"));
  const db = openDatabase(dir);
  setMeta(db, "business_slug", BUSINESS_SLUG);
  setMeta(db, "photobox_slug", PHOTOBOX_SLUG);

  const clock = { value: Date.parse("2026-10-25T02:00:00.000Z") };
  const sessionId = "local_testsession";
  insertSession(
    db,
    {
      id: sessionId,
      businessSlug: BUSINESS_SLUG,
      photoboxSlug: PHOTOBOX_SLUG,
      packageId: "11111111-1111-4111-8111-111111111111",
      packageSnapshot: { package_id: "11111111-1111-4111-8111-111111111111", price: 25000 },
      timerSeconds: 300,
      clientCreatedAt: "2026-10-25T01:58:00.000Z",
    },
    clock.value
  );

  const mediaDir = join(dir, "media", sessionId);
  const payloadPath = join(mediaDir, "finalize.json");
  const photoPath = join(mediaDir, "final-0.jpg");
  const at = new Date(clock.value).toISOString();

  // `openDatabase` membuat direktori data; media ditulis seperti finalize lokal.
  db.prepare("select 1").get();
  mkdirSync(mediaDir, { recursive: true });
  writeFileSync(photoPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  writeFileSync(
    payloadPath,
    JSON.stringify({
      session_id: sessionId,
      retake_count: 1,
      template_id: null,
      photos: [photoPath],
      gif_photos: [],
      finalized_at: at,
    })
  );
  db.prepare("update sessions set state = 'finalized', retake_count = 1 where id = ?").run(
    sessionId
  );
  db.prepare(
    `insert into finalize_queue (id, session_id, payload_path, attempts, next_attempt_at, last_error, created_at)
     values (?, ?, ?, 0, ?, null, ?)`
  ).run(`fq_${sessionId}`, sessionId, payloadPath, at, at);

  return {
    dir,
    db,
    clock,
    sessionId,
    payloadPath,
    photoPath,
    ctx: {
      db,
      config: baseConfig(dir),
      now: () => clock.value,
      random: () => 0.5,
      log: () => undefined,
    },
  };
}

function cleanup(fixture: Fixture): void {
  closeDatabase(fixture.db);
  rmSync(fixture.dir, { recursive: true, force: true });
}

type Answer = { status: number; body: unknown };

/** `fetch` palsu: setiap request dicatat, jawaban diambil dari antrean. */
function fakeFetch(plan: (request: { url: string; method: string; body: unknown }) => Answer) {
  const calls: { url: string; method: string; body: unknown }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body;
    calls.push({ url, method, body });
    const answer = plan({ url, method, body });
    return new Response(JSON.stringify(answer.body), {
      status: answer.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

test("cloud 500 lalu 200 menghasilkan satu sesi cloud yang sukses", async () => {
  const fixture = makeFixture();
  try {
    let createAttempts = 0;
    let finalizeAttempts = 0;
    const { impl, calls } = fakeFetch(({ url, method }) => {
      if (url.endsWith("/devices/settings") && method === "PATCH") {
        return { status: 200, body: { data: { ok: true } } };
      }
      if (url.endsWith(`/${BUSINESS_SLUG}/sessions`) && method === "POST") {
        createAttempts += 1;
        // Percobaan pertama gagal di sisi server — worker wajib mengulang,
        // bukan menyerah dan bukan membuat sesi kedua.
        return createAttempts === 1
          ? { status: 500, body: { error: { code: "INTERNAL", message: "boom" } } }
          : { status: 201, body: { data: { session_id: "22222222-2222-4222-8222-222222222222" } } };
      }
      finalizeAttempts += 1;
      return {
        status: 200,
        body: { data: { session_id: "22222222-2222-4222-8222-222222222222" } },
      };
    });
    fixture.ctx.fetchImpl = impl;

    const first = await runSyncOnce(fixture.ctx);
    assert.equal(first.synced, 0);
    assert.equal(first.retrying, 1);
    assert.equal(createAttempts, 1);

    // Belum jatuh tempo: putaran berikutnya tidak boleh menembak cloud lagi.
    await runSyncOnce(fixture.ctx);
    assert.equal(createAttempts, 1, "backoff harus menahan percobaan berikutnya");

    // Lewati jendela backoff (attempt 1 → 2 s × jitter 1.0).
    fixture.clock.value += backoffDelay(1, () => 0.5) + 1;
    const second = await runSyncOnce(fixture.ctx);
    assert.equal(second.synced, 1);
    assert.equal(createAttempts, 2);
    assert.equal(finalizeAttempts, 1);

    const row = fixture.db
      .prepare("select cloud_id, synced_at from sessions where id = ?")
      .get(fixture.sessionId) as { cloud_id: string | null; synced_at: string | null };
    assert.equal(row.cloud_id, "22222222-2222-4222-8222-222222222222");
    assert.ok(row.synced_at, "synced_at wajib terisi setelah finalize sukses");

    // Kunci idempotensi memuat slug booth: dua booth tidak bisa bertabrakan.
    const createCall = calls.find(
      (call) => call.method === "POST" && call.url.endsWith(`/${BUSINESS_SLUG}/sessions`)
    );
    assert.ok(createCall);
    const sentBody = JSON.parse(String(createCall.body)) as Record<string, unknown>;
    assert.equal(sentBody.package_id, "11111111-1111-4111-8111-111111111111");
    assert.equal(sentBody.client_created_at, "2026-10-25T01:58:00.000Z");
    assert.equal(
      idempotencyKey({ photobox_slug: PHOTOBOX_SLUG, id: fixture.sessionId }),
      `${PHOTOBOX_SLUG}:${fixture.sessionId}`
    );
  } finally {
    cleanup(fixture);
  }
});

test("sesi yang sudah tersinkron tidak pernah dikirim dua kali", async () => {
  const fixture = makeFixture();
  try {
    const { impl, calls } = fakeFetch(({ url, method }) => {
      if (url.endsWith("/devices/settings") && method === "PATCH") {
        return { status: 200, body: { data: { ok: true } } };
      }
      if (method === "POST" && url.endsWith(`/${BUSINESS_SLUG}/sessions`)) {
        return {
          status: 201,
          body: { data: { session_id: "33333333-3333-4333-8333-333333333333" } },
        };
      }
      return { status: 200, body: { data: { ok: true } } };
    });
    fixture.ctx.fetchImpl = impl;

    await runSyncOnce(fixture.ctx);
    fixture.clock.value += 60 * 60_000;
    await runSyncOnce(fixture.ctx);

    const sessionCalls = calls.filter((call) => call.url.includes("/sessions"));
    assert.equal(sessionCalls.length, 2, "satu create + satu finalize, tidak lebih");
  } finally {
    cleanup(fixture);
  }
});

test("backoff monoton dan berhenti di 5 menit ± 20 %", () => {
  const delays = Array.from({ length: 14 }, (_, attempt) => backoffDelay(attempt, () => 0.5));
  for (let i = 1; i < delays.length; i += 1) {
    assert.ok(
      delays[i]! >= delays[i - 1]!,
      `backoff harus monoton: attempt ${i} (${delays[i]}) < attempt ${i - 1} (${delays[i - 1]})`
    );
  }
  assert.equal(delays[0], 1_000);
  assert.equal(delays[1], 2_000);
  assert.equal(delays[2], 4_000);

  // Jitter ±20 % di sekitar cap 5 menit, jadi paling lama 6 menit.
  const low = backoffDelay(20, () => 0);
  const high = backoffDelay(20, () => 0.999_999);
  assert.equal(low, Math.round(MAX_BACKOFF_MS * 0.8));
  assert.equal(high, Math.round(MAX_BACKOFF_MS * 1.2));
  assert.ok(high <= 6 * 60_000);
});

test("410 SESSION_EXPIRED menyalin media ke karantina sebelum menghapus baris", async () => {
  const fixture = makeFixture();
  try {
    const { impl } = fakeFetch(({ url, method }) => {
      if (url.endsWith("/devices/settings") && method === "PATCH") {
        return { status: 200, body: { data: { ok: true } } };
      }
      return {
        status: 410,
        body: { error: { code: "SESSION_EXPIRED", message: "Sesi sudah berakhir" } },
      };
    });
    fixture.ctx.fetchImpl = impl;

    const report = await runSyncOnce(fixture.ctx);
    assert.equal(report.quarantined, 1);

    const row = fixture.db
      .prepare("select id from sessions where id = ?")
      .get(fixture.sessionId) as { id: string } | undefined;
    assert.equal(row, undefined, "baris lokal dihapus setelah media aman");

    const dir = quarantineDir(fixture.dir, fixture.sessionId);
    assert.ok(existsSync(dir), "media wajib disalin ke data/quarantine/<id>/");
    const files = readdirSync(dir).sort();
    assert.ok(files.includes("final-0.jpg"), `foto hilang: ${files.join(", ")}`);
    assert.ok(files.includes("finalize.json"));
    assert.equal(readFileSync(join(dir, "final-0.jpg")).length, 4);

    const event = fixture.db
      .prepare("select kind, detail_json from events where kind = 'session_quarantined'")
      .get() as { kind: string; detail_json: string } | undefined;
    assert.ok(event, "kejadian karantina wajib tercatat");
    assert.match(event.detail_json, /SESSION_EXPIRED/);
  } finally {
    cleanup(fixture);
  }
});

test("410 saat finalize juga dikarantina, bukan diulang selamanya", async () => {
  const fixture = makeFixture();
  try {
    const { impl } = fakeFetch(({ url, method }) => {
      if (url.endsWith("/devices/settings") && method === "PATCH") {
        return { status: 200, body: { data: { ok: true } } };
      }
      if (method === "POST" && url.endsWith(`/${BUSINESS_SLUG}/sessions`)) {
        return {
          status: 201,
          body: { data: { session_id: "44444444-4444-4444-8444-444444444444" } },
        };
      }
      return { status: 410, body: { error: { code: "SESSION_EXPIRED" } } };
    });
    fixture.ctx.fetchImpl = impl;

    const report = await runSyncOnce(fixture.ctx);
    assert.equal(report.quarantined, 1);
    assert.ok(existsSync(join(quarantineDir(fixture.dir, fixture.sessionId), "final-0.jpg")));
  } finally {
    cleanup(fixture);
  }
});

test("setelan dengan field milik cloud ditolak, bukan dibuang diam-diam", () => {
  const foreign = foreignSettingKeys({
    print_settings: { paper_size: "A6", copies: 3 },
    payment_mode: "voucher",
  });
  assert.deepEqual(foreign.sort(), ["payment_mode", "print_settings.copies"]);

  // `copies` sah secara bentuk (ia field print_settings), jadi schema saja
  // tidak menolaknya — route memakai `foreignSettingKeys` lebih dulu. Yang
  // dijaga schema adalah kunci asing di tingkat atas.
  const knownShape = deviceSettingsPatchSchema.safeParse({
    device_token: DEVICE_TOKEN,
    settings: { print_settings: { copies: 3 } },
  });
  assert.equal(knownShape.success, true);
  assert.ok(foreignSettingKeys({ print_settings: { copies: 3 } }).length === 1);

  const unknownGroup = deviceSettingsPatchSchema.safeParse({
    device_token: DEVICE_TOKEN,
    settings: { pricing: { price: 1000 } },
  });
  assert.equal(unknownGroup.success, false, "grup asing ditolak schema");

  const accepted = deviceSettingsPatchSchema.safeParse({
    device_token: DEVICE_TOKEN,
    settings: { print_settings: { paper_size: "A6", printer_name: "DNP QW410" } },
  });
  assert.equal(accepted.success, true);
});

test("merge mempertahankan copies milik cloud saat device mengirim paper_size", () => {
  const merged = mergeDeviceSettings(
    {
      print_settings: { copies: 2, layout: "strip", printer_name: "Cloud" },
      payment_mode: "gateway",
    },
    { print_settings: { paper_size: "A6", printer_name: "Booth" } }
  ) as Record<string, unknown>;

  const print = merged.print_settings as Record<string, unknown>;
  assert.equal(print.copies, 2, "copies milik cloud tidak boleh hilang");
  assert.equal(print.layout, "strip");
  assert.equal(print.paper_size, "A6");
  assert.equal(print.printer_name, "Booth", "field device menang");
  assert.equal(merged.payment_mode, "gateway", "field di luar grup tidak tersentuh");
});

test("appearance_settings tidak pernah ikut PATCH ke cloud", async () => {
  const fixture = makeFixture();
  try {
    // Booth mengkustomisasi tampilannya sendiri.
    setMeta(fixture.db, "photobox_slug", PHOTOBOX_SLUG);
    fixture.db
      .prepare(
        `insert into device_settings (key, value_json, updated_at)
         values (?, ?, ?)
         on conflict (key) do update set value_json = excluded.value_json`
      )
      .run(
        "appearance_settings",
        JSON.stringify({ bg_color: "#101820", padding: 40 }),
        new Date(fixture.clock.value).toISOString()
      );
    fixture.db
      .prepare(
        `insert into device_settings (key, value_json, updated_at)
         values (?, ?, ?)
         on conflict (key) do update set value_json = excluded.value_json`
      )
      .run(
        "print_settings",
        JSON.stringify({ paper_size: "A6", printer_name: "DNP QW410" }),
        new Date(fixture.clock.value).toISOString()
      );

    const { impl, calls } = fakeFetch(({ url, method }) => {
      if (url.endsWith("/devices/settings") && method === "PATCH") {
        return { status: 200, body: { data: { ok: true } } };
      }
      return { status: 200, body: { data: {} } };
    });
    fixture.ctx.fetchImpl = impl;

    await runSyncOnce(fixture.ctx);

    const patch = calls.find(
      (c) => c.method === "PATCH" && c.url.endsWith("/devices/settings")
    );
    assert.ok(patch, "worker harus melaporkan setelan mesin ke cloud");

    const sent = JSON.parse(String(patch.body)) as {
      settings: Record<string, unknown>;
    };
    // Setelan mesin ikut — dashboard owner butuh nilai ini.
    assert.ok(sent.settings.print_settings, "print_settings harus ikut");
    // Kustomisasi tampilan TIDAK ikut: kalau ikut, satu booth akan menimpa
    // baris photoboxes yang dibaca seluruh booth di business yang sama.
    assert.equal(
      sent.settings.appearance_settings,
      undefined,
      "appearance_settings tidak boleh naik ke cloud"
    );
  } finally {
    cleanup(fixture);
  }
});
