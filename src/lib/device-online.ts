/**
 * Definisi "device online" untuk seat counting — plan camera-sdk §B.
 * Seat = jumlah device aktif terpairing + online (heartbeat dalam window),
 * menggantikan jumlah sesi foto konkuren sebagai gate kuota billing.
 *
 * Murni (tanpa supabase) agar unit-testable — pola src/lib/*.
 */

/** Window default "online" (ms). Heartbeat kiosk tiap ~30–60s. */
export const DEVICE_ONLINE_WINDOW_MS = 90_000;

/**
 * Device dianggap online bila:
 * - status active, dan
 * - last_heartbeat_at (kanonik, 0027) ATAU last_seen_at (fallback)
 *   berada dalam window.
 */
export function isDeviceOnline(
  status: string,
  lastSeenAt: string | Date | null,
  lastHeartbeatAt: string | Date | null,
  now: number = Date.now(),
  windowMs: number = DEVICE_ONLINE_WINDOW_MS
): boolean {
  if (status !== "active") return false;

  const heartbeat = lastHeartbeatAt
    ? new Date(lastHeartbeatAt).getTime()
    : lastSeenAt
      ? new Date(lastSeenAt).getTime()
      : 0;
  if (!heartbeat) return false;

  return now - heartbeat <= windowMs;
}

/** Hitung jumlah device online dari baris devices (bukan query — pure). */
export function countOnline(
  rows: { status: string; last_seen_at: string | null; last_heartbeat_at?: string | null }[],
  now: number = Date.now(),
  windowMs: number = DEVICE_ONLINE_WINDOW_MS
): number {
  return rows.filter((r) =>
    isDeviceOnline(r.status, r.last_seen_at, r.last_heartbeat_at ?? null, now, windowMs)
  ).length;
}
