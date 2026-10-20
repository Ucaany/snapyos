import { createServerClient } from "@/lib/supabase/server";
import { bearerMatches } from "@/lib/cron-auth";
import { needsSettlementRecovery } from "@/server/payment/settlement-recovery";
import { runPaidSideEffects, transitionPaymentToExpired } from "@/server/payment/settlement";
import type { CheckoutRow, PaymentRow } from "@/server/payment/checkout-shared";

/**
 * Cron payment recovery — docs/06 §6.8 (getPaymentStatus self-heal).
 * Dijalankan berkala (vercel.json). Autentikasi: Bearer CRON_SECRET,
 * FAIL-CLOSED (secret kosong = tolak; dev opt-in PAYMENT_RECOVERY_CRON_OPEN=1).
 *
 * Dua tugas, keduanya BUKAN pembuatan sesi (session creation = gate client
 * terpisah pay-first):
 *  1. paid-but-unsettled — payment status='paid' yang transaksi/checkout-nya
 *     belum lengkap → jalankan ulang `runPaidSideEffects` (idempotent).
 *  2. pending-terlewat — payment 'pending' lewat `expires_at` → 'expired' +
 *     checkout di-expire (cermin qris.ts, tanpa panggilan gateway).
 * Batch dibatasi (limit 200) + tiap payment dibungkus try/catch agar satu
 * kegagalan tidak membatalkan seluruh batch.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_LIMIT = 200;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Tolak jika CRON_SECRET dimulai dengan "change-me" (placeholder .env.example).
  if (secret && secret.startsWith("change-me")) return false;
  // PAYMENT_RECOVERY_CRON_OPEN hanya boleh aktif di luar production (fail-closed).
  if (!secret) {
    if (process.env.NODE_ENV === "production") return false;
    return process.env.PAYMENT_RECOVERY_CRON_OPEN === "1";
  }
  return bearerMatches(request.headers.get("authorization"), secret);
}

async function expireCheckout(id: string) {
  await createServerClient()
    .from("checkout_sessions")
    .update({ status: "expired" })
    .eq("id", id)
    .eq("status", "open");
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    console.error("[cron/payment-recovery] CRON_SECRET tidak diset: recovery mati (misconfig)");
    return Response.json(
      { error: { code: "INTERNAL", message: "CRON_SECRET not configured" } },
      { status: 500 }
    );
  }
  if (!authorized(request)) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Forbidden" } },
      { status: 401 }
    );
  }

  const supabase = createServerClient();
  const now = new Date();
  const log = (message: string) => console.error(`[cron/payment-recovery] ${message}`);

  let recovered = 0;
  let expired = 0;
  let failed = 0;
  const queryFailures: string[] = [];

  // -------------------------------------------------------------------------
  // 1. paid-but-unsettled → jalankan ulang side effects (idempotent)
  //    H6: filter transaction_id is null (hanya yang belum settled) + jendela
  //    paid_at — tanpa ini query selalu mengambil 200 tertua & kasus baru
  //    tak tersentuh (starvation). Jendela 7 hari = jauh lebih panjang dari
  //    retensi operasional; recovery berjalan tiap 10 menit.
  // -------------------------------------------------------------------------
  const settledWindowStart = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const { data: paidRows, error: paidError } = await supabase
    .from("payments")
    .select("*, checkout_sessions!inner(status)")
    .eq("status", "paid")
    .is("transaction_id", null)
    .gte("paid_at", settledWindowStart)
    .order("paid_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (paidError) {
    queryFailures.push(`paid_unsettled: ${paidError.message}`);
    log(`gagal memuat paid-but-unsettled: ${paidError.message}`);
  }

  for (const raw of (paidRows ?? []) as unknown as (PaymentRow & {
    checkout_sessions: { status: string | null } | null;
  })[]) {
    try {
      const checkoutStatus = raw.checkout_sessions?.status ?? null;
      const { checkout_sessions: _ctx, ...payment } = raw;
      if (
        !needsSettlementRecovery({
          transaction_id: payment.transaction_id,
          checkout_status: checkoutStatus,
        })
      ) {
        continue;
      }
      const { data: checkoutRow } = await supabase
        .from("checkout_sessions")
        .select("*")
        .eq("id", payment.checkout_session_id)
        .eq("business_id", payment.business_id)
        .maybeSingle();
      if (!checkoutRow) {
        failed += 1;
        log(`checkout hilang untuk payment ${payment.id}`);
        continue;
      }
      await runPaidSideEffects(payment as PaymentRow, checkoutRow as unknown as CheckoutRow);
      recovered += 1;
    } catch (error) {
      failed += 1;
      log(`gagal recover payment: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // -------------------------------------------------------------------------
  // 2. pending-terlewat → expired + expire checkout (cermin qris.ts)
  // -------------------------------------------------------------------------
  const { data: staleRows, error: staleError } = await supabase
    .from("payments")
    .select("*")
    .eq("status", "pending")
    .lt("expires_at", now.toISOString())
    .order("expires_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (staleError) {
    queryFailures.push(`pending_stale: ${staleError.message}`);
    log(`gagal memuat pending-terlewat: ${staleError.message}`);
  }

  for (const raw of (staleRows ?? []) as unknown as PaymentRow[]) {
    try {
      const transitioned = await transitionPaymentToExpired(raw.id);
      if (!transitioned) continue;
      await expireCheckout(raw.checkout_session_id);
      expired += 1;
    } catch (error) {
      failed += 1;
      log(`gagal expire payment: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (queryFailures.length > 0) {
    return Response.json(
      {
        error: {
          code: "INTERNAL",
          message: "Sebagian query recovery gagal",
          details: queryFailures,
        },
        data: { recovered, expired, failed },
      },
      { status: 500 }
    );
  }

  return Response.json({ data: { recovered, expired, failed } });
}
