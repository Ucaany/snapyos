import { createServerClient } from "@/lib/supabase/server";
import { bearerMatches } from "@/lib/cron-auth";
import {
  markInvoicePaid,
  resolvePaymentGateway,
  type InvoicePaymentRow,
} from "@/server/payment/invoice";

/**
 * Cron invoice recovery — subscription invoice (invoice_payments/invoices).
 * Dijalankan harian `0 21 * * *` UTC (vercel.json + deploy/cron/snapyos.cron).
 * Autentikasi: Bearer CRON_SECRET, FAIL-CLOSED (secret kosong = tolak; dev
 * opt-in INVOICE_RECOVERY_CRON_OPEN=1).
 *
 * 1. invoice_payments pending/expired dengan order_id → verifikasi status ke
 *    provider, settle via markInvoicePaid bila provider bilang paid.
 * 2. invoices pending yang SEMUA payment-nya sudah paid → settle (crash window).
 * Batch 100 + try/catch per baris.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_LIMIT = 100;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && secret.startsWith("change-me")) return false;
  if (!secret) {
    if (process.env.NODE_ENV === "production") return false;
    return process.env.INVOICE_RECOVERY_CRON_OPEN === "1";
  }
  return bearerMatches(request.headers.get("authorization"), secret);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    console.error("[cron/invoice-recovery] CRON_SECRET tidak diset");
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
  const log = (message: string) => console.error(`[cron/invoice-recovery] ${message}`);

  let settled = 0;
  let expired = 0;
  let failed = 0;
  const queryFailures: string[] = [];

  // -------------------------------------------------------------------------
  // 1. Verifikasi status provider untuk invoice_payments yang belum final.
  // -------------------------------------------------------------------------
  const { data: rows, error: rowsError } = await supabase
    .from("invoice_payments")
    .select("*")
    .in("status", ["pending", "expired"])
    .not("order_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (rowsError) {
    queryFailures.push(`invoice_payments: ${rowsError.message}`);
    log(`gagal memuat invoice_payments: ${rowsError.message}`);
  }

  for (const row of (rows ?? []) as unknown as InvoicePaymentRow[]) {
    try {
      const gateway = await resolvePaymentGateway(row);
      const providerStatus = await gateway.getStatus(row.order_id, row.amount, row.provider_ref);
      if (providerStatus === "paid") {
        const { data } = await supabase
          .from("invoice_payments")
          .update({ status: "paid", paid_at: new Date().toISOString() })
          .eq("id", row.id)
          .in("status", ["pending", "expired"])
          .select("id")
          .maybeSingle();
        if (data) {
          await markInvoicePaid({ ...row, status: "paid" });
          settled += 1;
        }
      } else if (row.status === "pending" && providerStatus === "expired") {
        const { data } = await supabase
          .from("invoice_payments")
          .update({ status: "expired" })
          .eq("id", row.id)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();
        if (data) expired += 1;
      }
    } catch (error) {
      failed += 1;
      log(`gagal verifikasi payment ${row.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // -------------------------------------------------------------------------
  // 2. Invoice pending yang seluruh payment-nya sudah paid (crash window).
  // -------------------------------------------------------------------------
  const { data: pendingInvoices, error: invoicesError } = await supabase
    .from("invoices")
    .select("id")
    .eq("status", "pending")
    .limit(BATCH_LIMIT);
  if (invoicesError) {
    queryFailures.push(`invoices: ${invoicesError.message}`);
    log(`gagal memuat invoices: ${invoicesError.message}`);
  }

  const invoiceIds = (pendingInvoices ?? []).map((r: { id: string }) => r.id);
  if (invoiceIds.length > 0) {
    const { data: payments, error: paymentsError } = await supabase
      .from("invoice_payments")
      .select("*")
      .in("invoice_id", invoiceIds);
    if (paymentsError) {
      queryFailures.push(`invoice_payments_by_invoice: ${paymentsError.message}`);
      log(`gagal memuat payments invoice: ${paymentsError.message}`);
    } else {
      const byInvoice = new Map<string, InvoicePaymentRow[]>();
      for (const p of (payments ?? []) as unknown as InvoicePaymentRow[]) {
        const list = byInvoice.get(p.invoice_id) ?? [];
        list.push(p);
        byInvoice.set(p.invoice_id, list);
      }
      for (const invoiceId of invoiceIds) {
        const list = byInvoice.get(invoiceId) ?? [];
        if (list.length === 0 || !list.every((p) => p.status === "paid")) continue;
        const payment = list[0];
        if (!payment) continue;
        try {
          await markInvoicePaid(payment);
          settled += 1;
        } catch (error) {
          failed += 1;
          log(
            `gagal settle invoice ${invoiceId}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  }

  if (queryFailures.length > 0) {
    return Response.json(
      {
        error: {
          code: "INTERNAL",
          message: "Sebagian query invoice recovery gagal",
          details: queryFailures,
        },
        data: { settled, expired, failed },
      },
      { status: 500 }
    );
  }

  return Response.json({ data: { settled, expired, failed } });
}
