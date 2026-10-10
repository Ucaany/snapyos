/**
 * POS report aggregation — docs/pos/05 §4. Pure, integer IDR (pola tx-insights:
 * zero import agar unit-testable tanpa path alias). Aturan anti double-count:
 * REVENUE selalu dari transactions; pos_orders hanya untuk breakdown detail
 * (docs/pos/05 §9).
 */

import { localDayKey } from "./dashboard-math.ts";

export type PosRevenueRow = {
  gross_amount: number;
  discount_amount: number;
  final_amount: number;
  payment_method: string;
};

export type PosRevenueReport = {
  totalGross: number;
  totalDiscount: number;
  totalFinal: number;
  count: number;
  average: number;
  byMethod: { key: string; amount: number; count: number }[];
  byStatus: { key: string; count: number }[];
};

export function buildPosRevenue(
  paidRows: ReadonlyArray<PosRevenueRow>,
  statusRows: ReadonlyArray<{ status: string }>
): PosRevenueReport {
  let gross = 0;
  let discount = 0;
  let final = 0;
  const method = new Map<string, { amount: number; count: number }>();
  for (const r of paidRows) {
    gross += r.gross_amount;
    discount += r.discount_amount;
    final += r.final_amount;
    const cur = method.get(r.payment_method) ?? { amount: 0, count: 0 };
    cur.amount += r.final_amount;
    cur.count += 1;
    method.set(r.payment_method, cur);
  }
  const status = new Map<string, number>();
  for (const r of statusRows) {
    status.set(r.status, (status.get(r.status) ?? 0) + 1);
  }
  return {
    totalGross: gross,
    totalDiscount: discount,
    totalFinal: final,
    count: paidRows.length,
    average: paidRows.length > 0 ? Math.round(final / paidRows.length) : 0,
    byMethod: [...method.entries()]
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => b.amount - a.amount),
    byStatus: [...status.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count),
  };
}

export type PosBreakdownRow = {
  label: string;
  amount: number;
  qty?: number;
};

/** Breakdown by product — pakai name_snapshot (A9), Σ qty + Σ subtotal. */
export function buildPosProductBreakdown(
  items: ReadonlyArray<{ name_snapshot: string; quantity: number; subtotal: number }>
): PosBreakdownRow[] {
  const agg = new Map<string, { amount: number; qty: number }>();
  for (const item of items) {
    const cur = agg.get(item.name_snapshot) ?? { amount: 0, qty: 0 };
    cur.amount += item.subtotal;
    cur.qty += item.quantity;
    agg.set(item.name_snapshot, cur);
  }
  return [...agg.entries()]
    .map(([label, v]) => ({ label, amount: v.amount, qty: v.qty }))
    .sort((a, b) => b.amount - a.amount);
}

/** Breakdown order-level generic (cashier/outlet/booth) — Σ final per label. */
export function buildPosLabelBreakdown(
  orders: ReadonlyArray<{ label: string; final_amount: number }>
): PosBreakdownRow[] {
  const agg = new Map<string, number>();
  for (const o of orders) {
    agg.set(o.label, (agg.get(o.label) ?? 0) + o.final_amount);
  }
  return [...agg.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** Breakdown by day — hari lokal tz dari paid_at (pola localDayKey). */
export function buildPosDayBreakdown(
  orders: ReadonlyArray<{ paid_at: string; final_amount: number }>,
  tz = "UTC"
): PosBreakdownRow[] {
  const agg = new Map<string, number>();
  for (const o of orders) {
    const key = localDayKey(Date.parse(o.paid_at), tz);
    agg.set(key, (agg.get(key) ?? 0) + o.final_amount);
  }
  return [...agg.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export type PosVsKioskSplit = {
  pos: { final: number; count: number };
  kiosk: { final: number; count: number };
  total: { final: number; count: number };
};

/** Split POS vs kiosk dari transactions paid — pos_order_id IS NOT NULL (docs/pos/05 §4). */
export function buildPosVsKioskSplit(
  rows: ReadonlyArray<{ pos_order_id: string | null; final_amount: number }>
): PosVsKioskSplit {
  let posFinal = 0;
  let posCount = 0;
  let kioskFinal = 0;
  let kioskCount = 0;
  for (const r of rows) {
    if (r.pos_order_id !== null) {
      posFinal += r.final_amount;
      posCount += 1;
    } else {
      kioskFinal += r.final_amount;
      kioskCount += 1;
    }
  }
  return {
    pos: { final: posFinal, count: posCount },
    kiosk: { final: kioskFinal, count: kioskCount },
    total: { final: posFinal + kioskFinal, count: posCount + kioskCount },
  };
}
