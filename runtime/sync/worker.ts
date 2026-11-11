/**
 * Sync worker — mengirim sesi lokal yang selesai ke cloud (Phase 7).
 *
 * Booth harus tetap jualan saat internet mati, jadi sesi ditutup lokal lebih
 * dulu lalu dikirim belakangan. Urutannya penting:
 *
 * 1. `POST /api/v1/public/:slug/sessions` — buat sesi cloud, simpan `cloud_id`
 *    SEGERA. Crash setelah langkah ini tidak boleh menghasilkan sesi kedua.
 * 2. `POST .../sessions/:cloud_id/finalize` — foto dari disk. Cloud menjawab
 *    hasil yang sama untuk sesi `completed`, jadi ulangan aman.
 * 3. Tandai `synced_at`.
 *
 * `410`/`SESSION_EXPIRED` berarti cloud sudah tidak menerima sesi ini. Media
 * disalin ke `data/quarantine/` SEBELUM baris lokal dihapus: foto pelanggan
 * yang sudah dibayar tidak boleh hilang hanya karena sync terlambat.
 *
 * Backoff `min(2^n × 1 s, 5 m)` ± 20 % — jitter mencegah semua booth di satu
 * outlet menghantam cloud serentak setelah internet pulih.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { RuntimeConfig } from "../config.ts";
import { activeSettings, cloudSyncedSettings, type SettingsShape } from "../settings/index.ts";
import { insertEvent, setMeta } from "../db/index.ts";
export const MAX_BACKOFF_MS = 5 * 60_000;
export const BASE_BACKOFF_MS = 1_000;
export const DEFAULT_SYNC_INTERVAL_MS = 15_000;

export type SyncContext = {
  db: DatabaseSync;
  config: RuntimeConfig;
  /** `fetch` yang bisa diganti di tes. */
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** `Math.random` yang bisa diganti supaya jitter deterministik di tes. */
  random?: () => number;
  log?: (message: string) => void;
  /** Optional heartbeat snapshot provider; absent keeps legacy sync-only behavior. */
  heartbeat?: () => Promise<HeartbeatSnapshot>;
};

export type HeartbeatSnapshot = {
  runtime_version: string;
  db_version: number;
  camera: { adapter: string; connected: boolean };
  printer: { adapter: string; ok: boolean };
  queue: { pending: number; retrying: number };
  lockdown: {
    local_pin_configured: boolean;
    local_pin_locked: boolean;
    cloud_kiosk_locked: boolean | null;
  };
};

type SyncSessionRow = {
  id: string;
  cloud_id: string | null;
  business_slug: string;
  photobox_slug: string;
  package_id: string;
  template_id: string | null;
  retake_count: number;
  client_created_at: string;
  state: string;
  synced_at: string | null;
};

type QueueRow = {
  session_id: string;
  payload_path: string;
  attempts: number;
  next_attempt_at: string;
};

type FinalizePayload = {
  photos?: string[];
  gif_photos?: string[];
  retake_count?: number;
  template_id?: string | null;
};

export type SessionSyncOutcome = "synced" | "retry" | "quarantined" | "skipped";

export type SyncReport = {
  synced: number;
  retrying: number;
  quarantined: number;
  settings: "pushed" | "unchanged" | "skipped" | "failed";
  heartbeat: "sent" | "skipped" | "failed";
};

/** `min(2^n × 1 s, 5 m)` ± 20 %. `n` = jumlah percobaan yang sudah gagal. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const safeAttempt = Number.isFinite(attempt) ? Math.max(0, Math.floor(attempt)) : 0;
  // 2^20 × 1 s sudah jauh melewati cap; jepit eksponen supaya tidak overflow.
  const exponential = BASE_BACKOFF_MS * 2 ** Math.min(safeAttempt, 20);
  const base = Math.min(exponential, MAX_BACKOFF_MS);
  const jitter = 0.8 + 0.4 * random();
  return Math.round(base * jitter);
}

/**
 * Kunci idempotensi untuk pembuatan sesi cloud: satu sesi lokal hanya boleh
 * menjadi satu sesi cloud, berapa kali pun worker mengulang.
 */
export function idempotencyKey(session: { photobox_slug: string; id: string }): string {
  return `${session.photobox_slug}:${session.id}`;
}

function nowIso(ctx: SyncContext): string {
  return new Date(ctx.now?.() ?? Date.now()).toISOString();
}

function cloudBase(ctx: SyncContext): string {
  return ctx.config.cloudUrl.replace(/\/+$/, "");
}

function canSync(ctx: SyncContext): boolean {
  return Boolean(cloudBase(ctx) && ctx.config.deviceToken);
}

function getFetch(ctx: SyncContext): typeof fetch {
  return ctx.fetchImpl ?? fetch;
}

function log(ctx: SyncContext, message: string): void {
  (ctx.log ?? console.warn)(`[snapyos-sync] ${message}`);
}

function dueSessions(ctx: SyncContext): QueueRow[] {
  return ctx.db
    .prepare(
      `select q.session_id, q.payload_path, q.attempts, q.next_attempt_at
         from finalize_queue q
         join sessions s on s.id = q.session_id
        where s.synced_at is null
          and s.state = 'finalized'
          and q.next_attempt_at <= ?
        order by q.created_at asc`
    )
    .all(nowIso(ctx)) as QueueRow[];
}

function loadSession(db: DatabaseSync, id: string): SyncSessionRow | null {
  return (
    (db
      .prepare(
        `select id, cloud_id, business_slug, photobox_slug, package_id, template_id,
                retake_count, client_created_at, state, synced_at
           from sessions where id = ?`
      )
      .get(id) as SyncSessionRow | undefined) ?? null
  );
}

function readPayload(path: string): FinalizePayload | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as FinalizePayload;
  } catch {
    return null;
  }
}

type CloudAnswer = {
  ok: boolean;
  status: number;
  code: string | null;
  data: Record<string, unknown> | null;
};

async function readAnswer(response: Response): Promise<CloudAnswer> {
  const body = (await response.json().catch(() => null)) as {
    data?: Record<string, unknown>;
    error?: { code?: string };
  } | null;
  return {
    ok: response.ok,
    status: response.status,
    code: body?.error?.code ?? null,
    data: body?.data ?? null,
  };
}

/** 410 atau `SESSION_EXPIRED` = cloud menolak permanen. */
function isExpired(answer: CloudAnswer): boolean {
  return answer.status === 410 || answer.code === "SESSION_EXPIRED";
}

/**
 * Kegagalan create yang TIDAK akan berubah kalau diulang dengan body yang sama:
 * 422 (payload ditolak — mis. client_created_at > 24 jam) dan 404 (business
 * tidak dikenal). Dulu keduanya di-retry selamanya, sehingga sesi berbayar
 * tidak pernah sampai ke cloud dan medianya tertahan di booth.
 */
function isPermanentCreateFailure(answer: CloudAnswer): boolean {
  return isExpired(answer) || answer.status === 422 || answer.status === 404;
}

async function createCloudSession(ctx: SyncContext, session: SyncSessionRow): Promise<CloudAnswer> {
  const response = await getFetch(ctx)(
    `${cloudBase(ctx)}/api/v1/public/${session.business_slug}/sessions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Cloud boleh memakai ini untuk dedupe; worker sendiri tidak bergantung
        // padanya karena `cloud_id` disimpan segera setelah sukses.
        "Idempotency-Key": idempotencyKey(session),
      },
      body: JSON.stringify({
        package_id: session.package_id,
        client_created_at: session.client_created_at,
        device_token: ctx.config.deviceToken,
      }),
    }
  );
  return readAnswer(response);
}

async function finalizeCloudSession(
  ctx: SyncContext,
  session: SyncSessionRow,
  cloudId: string,
  payload: FinalizePayload
): Promise<CloudAnswer> {
  const form = new FormData();
  form.append("device_token", ctx.config.deviceToken);
  form.append("retake_count", String(payload.retake_count ?? session.retake_count ?? 0));
  const templateId = payload.template_id ?? session.template_id;
  if (templateId) form.append("template_id", templateId);

  for (const file of payload.photos ?? []) {
    form.append("photos", new Blob([readFileSync(file)], { type: "image/jpeg" }), "photo.jpg");
  }
  for (const file of payload.gif_photos ?? []) {
    form.append(
      "gif_photos",
      new Blob([readFileSync(file)], { type: "image/jpeg" }),
      "gif-photo.jpg"
    );
  }

  const response = await getFetch(ctx)(
    `${cloudBase(ctx)}/api/v1/public/${session.business_slug}/sessions/${cloudId}/finalize`,
    {
      method: "POST",
      body: form,
    }
  );
  return readAnswer(response);
}

/**
 * Salin media sesi ke karantina, lalu hapus baris lokal. Salinan SELALU
 * didahulukan: kalau penyalinan gagal, baris tetap ada dan sync dicoba lagi
 * (lebih baik mengulang daripada kehilangan foto yang sudah dibayar).
 */
function quarantineSession(ctx: SyncContext, session: SyncSessionRow, payloadPath: string): void {
  const payload = readPayload(payloadPath);
  const dir = join(ctx.config.dataDir, "quarantine", session.id);
  mkdirSync(dir, { recursive: true });

  const files = [...(payload?.photos ?? []), ...(payload?.gif_photos ?? [])];
  for (const file of files) {
    const target = join(dir, file.slice(file.lastIndexOf("/") + 1));
    writeFileSync(target, readFileSync(file));
  }
  // Payload finalize ikut disimpan: tanpa itu isi karantina tidak bisa
  // direkonstruksi jadi sesi (template, retake, urutan foto).
  writeFileSync(join(dir, "finalize.json"), readFileSync(payloadPath));

  ctx.db.prepare("delete from sessions where id = ?").run(session.id);
  insertEvent(ctx.db, "session_quarantined", session.id, {
    reason: "SESSION_EXPIRED",
    files: files.length,
    dir,
  });
  log(ctx, `sesi ${session.id} kedaluwarsa di cloud; media disalin ke ${dir}`);
}

function scheduleRetry(ctx: SyncContext, queue: QueueRow, message: string): void {
  const attempts = queue.attempts + 1;
  const next = new Date(
    (ctx.now?.() ?? Date.now()) + backoffDelay(attempts, ctx.random)
  ).toISOString();
  ctx.db
    .prepare(
      "update finalize_queue set attempts = ?, next_attempt_at = ?, last_error = ? where session_id = ?"
    )
    .run(attempts, next, message.slice(0, 500), queue.session_id);
}

/** Kirim satu sesi. Aman dipanggil berkali-kali untuk sesi yang sama. */
export async function syncSession(ctx: SyncContext, queue: QueueRow): Promise<SessionSyncOutcome> {
  const session = loadSession(ctx.db, queue.session_id);
  if (!session) return "skipped";
  if (session.synced_at) return "skipped";

  const payload = readPayload(queue.payload_path);
  if (!payload) {
    scheduleRetry(ctx, queue, "payload finalize tidak terbaca");
    return "retry";
  }

  let cloudId = session.cloud_id;
  if (!cloudId) {
    const created = await createCloudSession(ctx, session);
    if (!created.ok) {
      if (isPermanentCreateFailure(created)) {
        quarantineSession(ctx, session, queue.payload_path);
        return "quarantined";
      }
      scheduleRetry(ctx, queue, `create ${created.status} ${created.code ?? ""}`.trim());
      return "retry";
    }
    const id = created.data?.session_id;
    if (typeof id !== "string" || id.length === 0) {
      scheduleRetry(ctx, queue, "create tidak mengembalikan session_id");
      return "retry";
    }
    cloudId = id;
    // Simpan segera: crash setelah titik ini tidak boleh membuat sesi kedua.
    ctx.db
      .prepare("update sessions set cloud_id = ?, updated_at = ? where id = ?")
      .run(cloudId, nowIso(ctx), session.id);
  }

  const finalized = await finalizeCloudSession(ctx, session, cloudId, payload);
  if (!finalized.ok) {
    if (isExpired(finalized)) {
      quarantineSession(ctx, session, queue.payload_path);
      return "quarantined";
    }
    scheduleRetry(ctx, queue, `finalize ${finalized.status} ${finalized.code ?? ""}`.trim());
    return "retry";
  }

  const at = nowIso(ctx);
  ctx.db
    .prepare("update sessions set synced_at = ?, updated_at = ? where id = ?")
    .run(at, at, session.id);
  ctx.db
    .prepare("update finalize_queue set attempts = 0, last_error = null where session_id = ?")
    .run(session.id);
  return "synced";
}

/**
 * Tulis balik setelan device ke cloud. `lastPushed` di memori cukup: setelah
 * restart satu kiriman tambahan tidak merugikan, sedangkan menyimpannya di
 * disk menambah state yang harus dijaga.
 */
export async function pushSettings(
  ctx: SyncContext,
  lastPushed: { value: string | null } = { value: null }
): Promise<SyncReport["settings"]> {
  if (!canSync(ctx)) return "skipped";
  // `appearance_settings` sengaja dibuang: kustomisasi tampilan milik satu
  // booth dan tidak boleh menimpa baris photoboxes milik seluruh booth.
  const settings: SettingsShape = cloudSyncedSettings(activeSettings(ctx.db, ctx.config));
  const serialized = JSON.stringify(settings);
  if (serialized === lastPushed.value) return "unchanged";

  const response = await getFetch(ctx)(`${cloudBase(ctx)}/api/v1/public/devices/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_token: ctx.config.deviceToken,
      settings,
    }),
  }).catch(() => null);

  if (!response) return "failed";
  const answer = await readAnswer(response);
  if (!answer.ok) {
    log(ctx, `tulis balik setelan ditolak: ${answer.status} ${answer.code ?? ""}`.trim());
    return "failed";
  }
  lastPushed.value = serialized;
  return "pushed";
}

/** Satu putaran: sesi yang jatuh tempo, lalu setelan. */
async function sendHeartbeat(ctx: SyncContext): Promise<SyncReport["heartbeat"]> {
  if (!canSync(ctx) || !ctx.heartbeat) return "skipped";
  const snapshot = await ctx.heartbeat().catch(() => null);
  if (!snapshot) return "failed";
  const response = await getFetch(ctx)(`${cloudBase(ctx)}/api/v1/public/devices/heartbeat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_token: ctx.config.deviceToken, ...snapshot }),
  }).catch(() => null);
  if (!response) return "failed";
  const answer = await readAnswer(response);
  if (!answer.ok) return "failed";
  if (answer.data && typeof answer.data === "object" && "kiosk_locked" in answer.data) {
    setMeta(
      ctx.db,
      "cloud_kiosk_locked",
      String(Boolean((answer.data as { kiosk_locked?: unknown }).kiosk_locked))
    );
    setMeta(ctx.db, "cloud_paired", "true");
  }
  return "sent";
}

export async function runSyncOnce(
  ctx: SyncContext,
  state: { lastPushed: string | null } = { lastPushed: null }
): Promise<SyncReport> {
  const report: SyncReport = {
    synced: 0,
    retrying: 0,
    quarantined: 0,
    settings: "skipped",
    heartbeat: "skipped",
  };
  if (!canSync(ctx)) return report;

  for (const queue of dueSessions(ctx)) {
    let outcome: SessionSyncOutcome;
    try {
      outcome = await syncSession(ctx, queue);
    } catch (error) {
      // Jaringan putus di tengah jalan: tetap di antrean, coba lagi nanti.
      scheduleRetry(ctx, queue, error instanceof Error ? error.message : String(error));
      outcome = "retry";
    }
    if (outcome === "synced") report.synced += 1;
    else if (outcome === "retry") report.retrying += 1;
    else if (outcome === "quarantined") report.quarantined += 1;
  }

  const pushed = { value: state.lastPushed };
  report.settings = await pushSettings(ctx, pushed);
  state.lastPushed = pushed.value;
  try {
    report.heartbeat = await sendHeartbeat(ctx);
  } catch {
    report.heartbeat = "failed";
  }
  return report;
}

/**
 * Jalankan worker berkala. `stop()` menghentikan timer; putaran yang sedang
 * berjalan diselesaikan lebih dulu agar tidak ada baris setengah tertulis.
 */
export function startSyncWorker(
  ctx: SyncContext,
  options: { intervalMs?: number } = {}
): () => void {
  const intervalMs = options.intervalMs ?? DEFAULT_SYNC_INTERVAL_MS;
  const state = { lastPushed: null as string | null };
  let stopped = false;
  let running = false;

  if (!canSync(ctx)) {
    log(ctx, "SNAPYOS_CLOUD_URL / SNAPYOS_DEVICE_TOKEN kosong — sesi hanya tersimpan lokal.");
    return () => undefined;
  }

  const tick = async (): Promise<void> => {
    if (stopped || running) return;
    running = true;
    try {
      await runSyncOnce(ctx, state);
    } catch (error) {
      log(ctx, `putaran sync gagal: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      running = false;
    }
  };

  // Putaran pertama ditunda satu interval: kamera/printer sudah harus siap
  // sebelum runtime mengurus jaringan.
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

/** Direktori karantina sesi — tempat media yang ditolak cloud disalin. */
export function quarantineDir(dataDir: string, sessionId: string): string {
  return join(dataDir, "quarantine", sessionId);
}
