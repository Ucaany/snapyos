/**
 * Pure helpers Tx Insights — agregasi transaksi SEMUA status untuk owner
 * (docs/04 §4.1 dashboard, docs/04 §4.2 analytics).
 * Dipisah dari server module agar bisa di-unit-test tanpa Supabase
 * (pola sama staff-directory).
 * Uang SELALU integer IDR; jam ramai = jam lokal business tz.
 */

export type TxStatus = "pending" | "paid" | "failed" | "cancelled" | "refunded";

export type TxInsightRow = {
  status: string;
  final_amount: number;
  paid_at: string | null;
  created_at: string;
  outlet_id: string | null;
  outlet_name: string | null;
};

export type OutletInsight = {
  outletId: string;
  name: string;
  count: number;
  paidCount: number;
  failedCount: number;
  net: number;
};

export type TxInsights = {
  statusCounts: Record<TxStatus, number> & { total: number };
  /** 24 slot: index = jam lokal 0–23, value = jumlah transaksi. */
  hourly: number[];
  peakHour: number | null;
  peakCount: number;
  outlets: OutletInsight[];
  net: number;
};

/** Jam lokal (0–23) dari ISO timestamp di timeZone. */
function localHour(iso: string, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hour: "2-digit",
  }).format(new Date(iso));
  return Number(hour) % 24;
}

/** Timestamp acak analitik: paid_at bila ada, selain itu created_at. */
function effectiveIso(row: TxInsightRow): string {
  return row.paid_at ?? row.created_at;
}

export function buildTxInsights(rows: readonly TxInsightRow[], timeZone: string): TxInsights {
  const statusCounts = { pending: 0, paid: 0, failed: 0, cancelled: 0, refunded: 0, total: 0 };
  const hourly = Array.from({ length: 24 }, () => 0);
  const outletAgg = new Map<string, OutletInsight>();
  let net = 0;

  for (const row of rows) {
    statusCounts.total += 1;
    if (
      row.status === "pending" ||
      row.status === "paid" ||
      row.status === "failed" ||
      row.status === "cancelled" ||
      row.status === "refunded"
    ) {
      statusCounts[row.status] += 1;
    }
    hourly[localHour(effectiveIso(row), timeZone)]! += 1;
    if (row.status === "paid") net += Math.max(0, Math.trunc(row.final_amount));

    const outletId = row.outlet_id ?? "none";
    const item = outletAgg.get(outletId) ?? {
      outletId,
      name: row.outlet_name ?? "Tanpa outlet",
      count: 0,
      paidCount: 0,
      failedCount: 0,
      net: 0,
    };
    item.count += 1;
    if (row.status === "paid") {
      item.paidCount += 1;
      item.net += Math.max(0, Math.trunc(row.final_amount));
    }
    if (row.status === "failed") item.failedCount += 1;
    outletAgg.set(outletId, item);
  }

  let peakHour: number | null = null;
  let peakCount = 0;
  for (let h = 0; h < 24; h++) {
    if (hourly[h]! > peakCount) {
      peakCount = hourly[h]!;
      peakHour = h;
    }
  }

  const outlets = [...outletAgg.values()].sort(
    (a, b) => b.count - a.count || b.net - a.net || a.name.localeCompare(b.name)
  );

  return { statusCounts, hourly, peakHour, peakCount, outlets, net };
}

/** Satu grup hasil RPC tx_insights_summary (agregat SQL per status/jam/outlet). */
export type TxInsightGroup = {
  status: string;
  hr: number;
  outlet_id: string | null;
  outlet_name: string;
  amount: number;
  tx_count: number;
};

function isKnownStatus(status: string): status is TxStatus {
  return (
    status === "pending" ||
    status === "paid" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "refunded"
  );
}

/**
 * Rakit TxInsights dari grup SQL — ekuivalen buildTxInsights() tanpa
 * transfer baris (jam lokal + filter paid sudah dihitung di database).
 */
export function buildTxInsightsFromGroups(groups: readonly TxInsightGroup[]): TxInsights {
  const statusCounts = { pending: 0, paid: 0, failed: 0, cancelled: 0, refunded: 0, total: 0 };
  const hourly = Array.from({ length: 24 }, () => 0);
  const outletAgg = new Map<string, OutletInsight>();
  let net = 0;

  for (const group of groups) {
    const count = Math.max(0, Math.trunc(group.tx_count));
    const amount = Math.max(0, Math.trunc(group.amount));
    statusCounts.total += count;
    if (isKnownStatus(group.status)) {
      statusCounts[group.status] += count;
    }
    const hr = Math.trunc(group.hr);
    if (hr >= 0 && hr < 24) hourly[hr]! += count;
    if (group.status === "paid") net += amount;

    const outletId = group.outlet_id ?? "none";
    const item = outletAgg.get(outletId) ?? {
      outletId,
      name: group.outlet_name ?? "Tanpa outlet",
      count: 0,
      paidCount: 0,
      failedCount: 0,
      net: 0,
    };
    item.count += count;
    if (group.status === "paid") {
      item.paidCount += count;
      item.net += amount;
    }
    if (group.status === "failed") item.failedCount += count;
    outletAgg.set(outletId, item);
  }

  let peakHour: number | null = null;
  let peakCount = 0;
  for (let h = 0; h < 24; h++) {
    if (hourly[h]! > peakCount) {
      peakCount = hourly[h]!;
      peakHour = h;
    }
  }

  const outlets = [...outletAgg.values()].sort(
    (a, b) => b.count - a.count || b.net - a.net || a.name.localeCompare(b.name)
  );

  return { statusCounts, hourly, peakHour, peakCount, outlets, net };
}
