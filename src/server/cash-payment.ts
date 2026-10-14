/**
 * Pembayaran tunai kiosk "bayar di kasir" — operator side.
 * Staff/manager/owner melihat permintaan tunai pending & mengonfirmasi.
 * RBAC: payment:confirm (staff+manager; owner via wildcard). Staff dibatasi
 * ke booth yang di-assign (member_photoboxes) — pola listAssignedPhotoboxIds.
 */

import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can } from "@/lib/rbac";
import { getMembership } from "@/lib/tenant";
import { listAssignedPhotoboxIds } from "@/server/staff";
import { requireFeature } from "@/server/feature-gate";
import { loadPaymentByReference } from "@/server/payment/checkout-shared";
import { settleCashPayment } from "@/server/payment/qris";

export type PendingCashPayment = {
  payment_reference: string;
  amount: number;
  photobox_name: string;
  outlet_name: string | null;
  created_at: string;
};

async function assertCashConfirm(userId: string, businessId: string) {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, "payment:confirm")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin mengonfirmasi tunai");
  }
  return membership;
}

export async function listPendingCashPayments(
  userId: string,
  businessId: string
): Promise<PendingCashPayment[]> {
  const membership = await assertCashConfirm(userId, businessId);
  // Sama dengan jalur konfirmasi: tunai hanya untuk plan yang mengaktifkan
  // fitur cash_payment (docs/02 §2.7). Tanpa gate ini endpoint list tetap
  // membocorkan data saat fitur dimatikan.
  await requireFeature(businessId, "cash_payment");
  const restrictTo =
    membership.role === "staff"
      ? await listAssignedPhotoboxIds(userId, businessId)
      : null;
  if (restrictTo !== null && restrictTo.length === 0) return [];

  const supabase = createServerClient();
  let req = supabase
    .from("payments")
    .select(
      "payment_reference, final_amount, photobox_id, created_at, photoboxes ( name ), outlets ( name )"
    )
    .eq("business_id", businessId)
    .eq("provider", "cash")
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true });
  if (restrictTo) req = req.in("photobox_id", restrictTo);
  const { data, error } = await req;
  if (error) throw new ApiError("INTERNAL", "Gagal memuat permintaan tunai");

  type Row = {
    payment_reference: string;
    final_amount: number;
    created_at: string;
    photoboxes: { name: string } | { name: string }[] | null;
    outlets: { name: string } | { name: string }[] | null;
  };
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    payment_reference: row.payment_reference,
    amount: row.final_amount,
    photobox_name: Array.isArray(row.photoboxes)
      ? row.photoboxes[0]?.name ?? "—"
      : row.photoboxes?.name ?? "—",
    outlet_name: Array.isArray(row.outlets)
      ? row.outlets[0]?.name ?? null
      : row.outlets?.name ?? null,
    created_at: row.created_at,
  }));
}

export async function confirmCashPaymentByOperator(
  userId: string,
  businessId: string,
  paymentReference: string
) {
  const membership = await assertCashConfirm(userId, businessId);
  await requireFeature(businessId, "cash_payment");
  const payment = await loadPaymentByReference(businessId, paymentReference);
  if (payment.provider !== "cash") {
    throw new ApiError("PAYMENT_NOT_FOUND", "Permintaan tunai tidak ditemukan");
  }
  if (membership.role === "staff") {
    const assigned = await listAssignedPhotoboxIds(userId, businessId);
    if (!assigned || !payment.photobox_id || !assigned.includes(payment.photobox_id)) {
      throw new ApiError("PAYMENT_NOT_FOUND", "Permintaan tunai tidak ditemukan");
    }
  }
  return settleCashPayment(payment);
}
