/**
 * Recovery settlement — docs/06 §6.8 (getPaymentStatus self-heal).
 * Penentu apakah runPaidSideEffects perlu (di)jalankan ulang untuk payment
 * ber-status paid: side effects dianggap lengkap hanya bila transaksi sudah
 * tercatat (transaction_id terisi) DAN checkout sudah paid.
 * Pure — dipakai tests/settlement-recovery.test.ts.
 * Dipindah dari `src/lib/settlement-recovery.ts` (Fase 5).
 */

export type SettlementRecoveryInput = {
  transaction_id: string | null | undefined;
  checkout_status: string | null | undefined;
};

/** true = side effects belum lengkap → jalankan ulang (idempotent). */
export function needsSettlementRecovery(input: SettlementRecoveryInput): boolean {
  const hasTransaction =
    typeof input.transaction_id === "string" && input.transaction_id.length > 0;
  return !hasTransaction || input.checkout_status !== "paid";
}
