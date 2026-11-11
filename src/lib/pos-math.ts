/**
 * POS math — docs/pos/03 §2. Pure, integer IDR, tanpa float.
 * Hanya penomoran order yang memakai zona Asia/Jakarta (A14);
 * reporting existing tetap UTC.
 */

export type PosTotalsItem = { unitPrice: number; qty: number };

/** subtotal per item = unitPrice × qty; gross = Σ; final = gross − discount (v1 discount = 0 — A11). */
export function computePosTotals(
  items: ReadonlyArray<PosTotalsItem>,
  discountAmount = 0
): { gross: number; discount: number; final: number } {
  let gross = 0;
  for (const item of items) {
    gross += Math.trunc(item.unitPrice) * Math.trunc(item.qty);
  }
  const discount = Math.max(0, Math.trunc(discountAmount));
  const final = Math.max(0, gross - discount);
  return { gross, discount, final };
}

const JAKARTA_OFFSET_MS = 7 * 3_600_000;

/** Kunci hari operasional kasir (YYYY-MM-DD, zona WIB) — A14. */
export function posDayKey(now: Date = new Date()): string {
  return new Date(now.getTime() + JAKARTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Batas [start, end) UTC untuk satu hari operasional WIB — untuk count order hari itu. */
export function posDayRange(now: Date = new Date()): { start: Date; end: Date } {
  const dayStartUtcMs = Date.parse(posDayKey(now) + "T00:00:00Z") - JAKARTA_OFFSET_MS;
  return {
    start: new Date(dayStartUtcMs),
    end: new Date(dayStartUtcMs + 86_400_000),
  };
}

/** Nomor order `POS-YYYYMMDD-####` (seq mulai 1, zona WIB) — A14. */
export function posOrderNumber(seq: number, now: Date = new Date()): string {
  const key = posDayKey(now).replace(/-/g, "");
  return `POS-${key}-${String(Math.max(1, Math.trunc(seq))).padStart(4, "0")}`;
}

export type PosManualPayDecision = "settle" | "already-settled" | "not-payable";

/**
 * Urutan keputusan pembayaran manual POS.
 *
 * Transaksi yang sudah ada SELALU menang atas status order. Retry setelah RPC
 * sukses (order sudah `paid`, transaksi sudah tercatat) harus idempoten; kalau
 * status dicek lebih dulu, klien menerima 409 untuk uang yang sudah diterima.
 */
export function classifyPosManualPay(input: {
  status: string;
  hasExistingTransaction: boolean;
}): PosManualPayDecision {
  if (input.hasExistingTransaction) return "already-settled";
  if (input.status !== "pending") return "not-payable";
  return "settle";
}

/**
 * Kembalian tunai = uang diterima − total. `null` bila kasir tidak mengisi
 * uang diterima (non-tunai / baris lama). Server memakai ini, bukan klien.
 */
export function posCashChange(
  finalAmount: number,
  amountReceived: number | null | undefined
): number | null {
  if (amountReceived === null || amountReceived === undefined) return null;
  return Math.trunc(amountReceived) - Math.trunc(finalAmount);
}
