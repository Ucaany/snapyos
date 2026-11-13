/**
 * Health check readiness (pure, tanpa `server-only`) — dipakai
 * `src/app/api/health/route.ts` dan diuji langsung via node:test.
 *
 * Kontrak (docs/08 §8.20):
 *   - Bentuk lama dipertahankan: `status`, `service`, `time`.
 *   - Field `checks` bersifat ADITIF (monitor lama yang hanya membaca `status`
 *     tidak rusak).
 *   - `status` = `"ok"` hanya bila SEMUA probe lulus; selain itu `"degraded"`.
 *
 * Kenapa dipisah dari route: route Next tidak bisa diimpor di harness node:test
 * (menarik `next/server`), sedangkan logika probe/timeout/klasifikasi error
 * justru bagian yang perlu diuji. Route tinggal menyuplai dua closure probe.
 */

/** Batas waktu satu probe. Health check harus selesai jauh sebelum timeout monitor. */
export const HEALTH_PROBE_TIMEOUT_MS = 4000;

/** Batas panjang `detail` supaya respons health tidak membocorkan stack/URL panjang. */
const DETAIL_MAX = 200;

export type HealthCheck = {
  /** `true` bila probe selesai tanpa error dan tanpa timeout. */
  ok: boolean;
  latencyMs: number;
  /** Alasan singkat saat gagal. Tidak diisi saat sukses. */
  detail?: string;
};

export type HealthReport = {
  status: "ok" | "degraded";
  service: string;
  time: string;
  checks: {
    database: HealthCheck;
    storage: HealthCheck;
    /** AUTH-07: produksi wajib Redis; tanpa Redis status degraded. */
    rateLimit: HealthCheck;
  };
};

/**
 * Ringkas pesan error agar layak ditampilkan di endpoint publik: potong
 * kredensial bergaya `scheme://user:pass@host` dan batasi panjangnya.
 */
export function sanitizeDetail(message: string): string {
  const withoutCredentials = message.replace(/\/\/[^/@\s]*@/g, "//");
  const collapsed = withoutCredentials.replace(/\s+/g, " ").trim();
  return collapsed.length > DETAIL_MAX ? `${collapsed.slice(0, DETAIL_MAX)}…` : collapsed;
}

/**
 * Jalankan satu probe dengan timeout. TIDAK pernah melempar: kegagalan
 * dikembalikan sebagai `{ ok: false }` supaya pemanggil (route yang ada di
 * allowlist proxy) tidak pernah 500 karena health check itu sendiri.
 *
 * @param fn — probe; sukses = resolve, gagal = reject.
 * @param opts.timeoutMs — default `HEALTH_PROBE_TIMEOUT_MS`.
 * @param opts.now — injeksi jam untuk tes deterministik.
 */
export async function probe(
  fn: () => Promise<void>,
  opts: { timeoutMs?: number; now?: () => number } = {}
): Promise<HealthCheck> {
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? HEALTH_PROBE_TIMEOUT_MS;
  const started = now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    return { ok: true, latencyMs: now() - started };
  } catch (error) {
    return {
      ok: false,
      latencyMs: now() - started,
      detail: sanitizeDetail(error instanceof Error ? error.message : String(error)),
    };
  } finally {
    // Timer yang menang tetap hidup sampai batasnya; bersihkan agar proses
    // (systemd/PM2 atau tes) tidak tertahan event loop.
    if (timer) clearTimeout(timer);
  }
}

/** Susun laporan akhir. `degraded` bila salah satu probe gagal. */
export function buildHealthReport(args: {
  database: HealthCheck;
  storage: HealthCheck;
  rateLimit: HealthCheck;
  now?: () => number;
  service?: string;
}): HealthReport {
  const now = args.now ?? Date.now;
  return {
    status:
      args.database.ok && args.storage.ok && args.rateLimit.ok ? "ok" : "degraded",
    service: args.service ?? "snapyos",
    time: new Date(now()).toISOString(),
    checks: { database: args.database, storage: args.storage, rateLimit: args.rateLimit },
  };
}
