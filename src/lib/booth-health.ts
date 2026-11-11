/**
 * Ambang + agregasi kesehatan booth untuk dashboard owner.
 * Murni (tanpa supabase) agar unit-testable — pola src/lib/*.
 */

/** Booth dianggap bermasalah bila heartbeat terakhir lebih tua dari ini. */
export const BOOTH_STALE_MINUTES = 10;
/** Alert storage mulai muncul pada persentase pemakaian ini. */
export const STORAGE_ALERT_PERCENT = 80;
/** Alert langganan muncul bila sisa masa aktif ≤ jumlah hari ini. */
export const SUBSCRIPTION_ALERT_DAYS = 7;

export type BoothHealthInput = {
  id: string;
  name: string;
  slug: string;
  outletName: string | null;
  status: string;
  /** Heartbeat device terbaru (last_heartbeat_at ?? last_seen_at), null = belum pernah. */
  lastHeartbeatAt: string | null;
  hasDefaultTemplate: boolean;
};

export type BoothHealthItem = BoothHealthInput & {
  offlineMinutes: number | null;
  needsDefaultTemplate: boolean;
  isStale: boolean;
};

export type BoothHealth = {
  total: number;
  online: number;
  offline: number;
  maintenance: number;
  items: BoothHealthItem[];
  /** Booth non-maintenance dengan heartbeat lebih tua dari BOOTH_STALE_MINUTES. */
  stale: BoothHealthItem[];
};

/** Menit sejak `iso`; 0 bila timestamp kosong/invalid. */
export function minutesSince(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor((nowMs - ms) / 60_000));
}

/** Sisa hari sampai tanggal (dibulatkan ke atas); null bila tanggal kosong/invalid. */
export function daysUntil(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return Math.ceil((ms - nowMs) / 86_400_000);
}

/**
 * Booth tanpa heartbeat sama sekali TIDAK dianggap stale — booth baru yang
 * belum pernah di-pairing tidak boleh membanjiri alert operasional.
 */
export function buildBoothHealth(rows: BoothHealthInput[], nowMs: number): BoothHealth {
  const counts = { online: 0, offline: 0, maintenance: 0 };
  const items: BoothHealthItem[] = rows.map((row) => {
    const offlineMinutes = minutesSince(row.lastHeartbeatAt, nowMs);
    return {
      ...row,
      offlineMinutes,
      needsDefaultTemplate: !row.hasDefaultTemplate,
      isStale:
        row.status !== "maintenance" &&
        offlineMinutes !== null &&
        offlineMinutes >= BOOTH_STALE_MINUTES,
    };
  });

  for (const item of items) {
    if (item.status === "maintenance") counts.maintenance += 1;
    else if (item.status === "online") counts.online += 1;
    else counts.offline += 1;
  }

  return {
    total: items.length,
    ...counts,
    items,
    stale: items.filter((item) => item.isStale),
  };
}
