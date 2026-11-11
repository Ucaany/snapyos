import { createServerClient } from "@/lib/supabase/server";
import { bearerMatches } from "@/lib/cron-auth";
import { reconcileBusinessStorage } from "@/server/storage-usage";

/**
 * Cron reconcile storage — docs/09 (storage), Bug #12.
 * Dijalankan harian (vercel.json cron). Autentikasi: Bearer CRON_SECRET.
 * Rekonsiliasi used_bytes per business dari listing bucket — mengoreksi
 * drift antara counter atomik dan isi bucket sesungguhnya.
 * Batch: proses semua business yang punya baris storage_usage.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && secret.startsWith("change-me")) return false;
  if (!secret) {
    if (process.env.NODE_ENV === "production") return false;
    return process.env.RECONCILE_STORAGE_CRON_OPEN === "1";
  }
  return bearerMatches(request.headers.get("authorization"), secret);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    console.error("[cron/reconcile-storage] CRON_SECRET tidak diset (misconfig)");
    return Response.json(
      { error: { code: "INTERNAL", message: "CRON_SECRET not configured" } },
      { status: 500 }
    );
  }
  if (!authorized(request)) {
    return Response.json(
      { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 }
    );
  }

  const supabase = createServerClient();
  const { data: rows, error } = await supabase
    .from("storage_usage")
    .select("business_id")
    .order("business_id");
  if (error) {
    console.error("[cron/reconcile-storage] gagal memuat daftar business:", error.message);
    return Response.json(
      { error: { code: "INTERNAL", message: "Failed to load businesses" } },
      { status: 500 }
    );
  }

  const ids = (rows ?? []).map((r) => (r as { business_id: string }).business_id);
  let reconciled = 0;
  let errors = 0;

  for (const businessId of ids) {
    try {
      await reconcileBusinessStorage(businessId);
      reconciled++;
    } catch (err) {
      errors++;
      console.error(
        `[cron/reconcile-storage] gagal business=${businessId}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  console.log(
    `[cron/reconcile-storage] selesai: ${reconciled} reconciled, ${errors} error, ${ids.length} total`
  );
  return Response.json({ reconciled, errors, total: ids.length });
}
