import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { computeVoucherDiscount } from "@/lib/checkout-math";

/**
 * Promo code pembayaran invoice subscription platform — docs/02 §2.5,
 * migration 0014. Backend = source of truth: validasi + hitung diskon
 * selalu server-side; layar konfirmasi hanya menampilkan pratinjau.
 */

type PromoRow = {
  id: string;
  code: string;
  type: "percentage" | "fixed";
  amount: number;
  min_transaction: number;
  max_discount: number | null;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  usage_limit: number | null;
  used_count: number;
};

async function loadPromo(code: string): Promise<PromoRow> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("subscription_promos")
    .select(
      "id, code, type, amount, min_transaction, max_discount, is_active, start_date, end_date, usage_limit, used_count"
    )
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();
  const row = (data ?? null) as PromoRow | null;
  if (!row) throw new ApiError("NOT_FOUND", "Kode promo tidak ditemukan");
  if (!row.is_active) throw new ApiError("VALIDATION_ERROR", "Promo tidak aktif");
  const now = Date.now();
  if (row.start_date && now < new Date(row.start_date).getTime()) {
    throw new ApiError("VALIDATION_ERROR", "Promo belum berlaku");
  }
  if (row.end_date && now > new Date(row.end_date).getTime()) {
    throw new ApiError("VALIDATION_ERROR", "Promo sudah kedaluwarsa");
  }
  if (row.usage_limit !== null && row.used_count >= row.usage_limit) {
    throw new ApiError("VALIDATION_ERROR", "Kuota promo sudah habis");
  }
  return row;
}

function discountFor(promo: PromoRow, grossAmount: number): number {
  if (grossAmount < promo.min_transaction) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Minimum transaksi promo ${promo.code}: ${promo.min_transaction}`
    );
  }
  const discount = computeVoucherDiscount({
    gross_amount: grossAmount,
    type: promo.type,
    amount: promo.amount,
    max_discount: promo.max_discount,
  });
  if (discount <= 0) throw new ApiError("VALIDATION_ERROR", "Promo tidak menghasilkan diskon");
  return discount;
}

/** Pratinjau diskon (tanpa mengurangi kuota) — layar konfirmasi. */
export async function previewSubscriptionPromo(code: string, grossAmount: number) {
  if (!code.trim()) throw new ApiError("VALIDATION_ERROR", "Kode promo wajib diisi");
  const promo = await loadPromo(code);
  return {
    code: promo.code,
    discount: discountFor(promo, grossAmount),
    type: promo.type,
    amount: promo.amount,
  };
}

/** Klaim pakai promo saat invoice terbit — increment atomik dengan gate kuota. */
export async function consumeSubscriptionPromo(code: string, grossAmount: number) {
  const promo = await loadPromo(code);
  const discount = discountFor(promo, grossAmount);
  const supabase = createServerClient();
  const { data } = await supabase
    .from("subscription_promos")
    .update({ used_count: promo.used_count + 1 })
    .eq("id", promo.id)
    .eq("used_count", promo.used_count)
    .select("id")
    .maybeSingle();
  if (!data) throw new ApiError("VALIDATION_ERROR", "Kuota promo sudah habis");
  return { code: promo.code, discount };
}

/**
 * Lepas kuota promo saat invoice ber-promo di-void (checkout ditinggalkan).
 * Decrement atomik CAS floor 0; best-effort — kegagalan tidak membatalkan void.
 */
export async function releaseSubscriptionPromo(code: string): Promise<void> {
  const supabase = createServerClient();
  const { data: promo } = await supabase
    .from("subscription_promos")
    .select("id, used_count")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();
  const row = (promo ?? null) as { id: string; used_count: number } | null;
  if (!row || row.used_count <= 0) return;
  await supabase
    .from("subscription_promos")
    .update({ used_count: row.used_count - 1 })
    .eq("id", row.id)
    .eq("used_count", row.used_count);
}
