/**
 * Perhitungan checkout — docs/06 §6.2/§6.5 (backend = source of truth).
 * Uang integer IDR; diskon percentage di-floor, dipatok max_discount & gross.
 */

export type VoucherCalcInput = {
  gross_amount: number;
  type: "percentage" | "fixed";
  amount: number;
  max_discount: number | null;
};

/** Diskon voucher dalam IDR (integer, ≥ 0, ≤ gross). */
export function computeVoucherDiscount(input: VoucherCalcInput): number {
  const gross = Math.max(0, Math.floor(input.gross_amount));
  let discount =
    input.type === "percentage"
      ? Math.floor((gross * input.amount) / 100)
      : Math.floor(input.amount);
  if (input.type === "percentage" && input.max_discount !== null) {
    discount = Math.min(discount, Math.floor(input.max_discount));
  }
  return Math.max(0, Math.min(discount, gross));
}

export function computeFinalAmount(grossAmount: number, discountAmount: number): number {
  return Math.max(0, Math.floor(grossAmount) - Math.floor(discountAmount));
}

/** Platform fee (docs/06 §6.6): floor(pct) + flat, dipatok final_amount. */
export function computePlatformFee(
  finalAmount: number,
  percent: number,
  flat: number
): number {
  const fee = Math.floor((finalAmount * percent) / 100) + Math.floor(flat);
  return Math.max(0, Math.min(fee, finalAmount));
}
