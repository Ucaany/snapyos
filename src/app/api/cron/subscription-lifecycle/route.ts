import { createServerClient } from "@/lib/supabase/server";
import { bearerMatches } from "@/lib/cron-auth";
import { PAST_DUE_GRACE_DAYS } from "@/lib/subscription-math";

/**
 * Cron subscription lifecycle — docs/02 §2.4.
 * Transisi status subscription yang sudah kedaluwarsa secara waktu.
 * Dijalankan harian `0 0 * * *` UTC (vercel.json cron; lihat deploy/cron/snapyos.cron).
 * Autentikasi: Bearer CRON_SECRET.
 *
 * Transisi:
 *   trial   + trial_ends_at < now                           → expired
 *   active  + cancel_at_period_end + current_period_end < now → cancelled
 *   active  + current_period_end < now (tanpa cancel flag)  → past_due
 *   past_due + current_period_end + grace < now             → expired
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret && secret.startsWith("change-me")) return false;
  if (!secret) {
    if (process.env.NODE_ENV === "production") return false;
    return process.env.SUBSCRIPTION_CRON_OPEN === "1";
  }
  return bearerMatches(request.headers.get("authorization"), secret);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    console.error("[cron/subscription-lifecycle] CRON_SECRET tidak diset");
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
  const now = new Date().toISOString();
  const graceDate = new Date(Date.now() - PAST_DUE_GRACE_DAYS * 86_400_000).toISOString();

  let trialExpired = 0;
  let cancelledAtEnd = 0;
  let activeToPastDue = 0;
  let pastDueExpired = 0;
  const failures: string[] = [];

  // 1. trial + trial_ends_at < now → expired
  {
    const { data, error } = await supabase
      .from("subscriptions")
      .update({ status: "expired" })
      .eq("status", "trial")
      .lt("trial_ends_at", now)
      .select("id");
    if (error) failures.push(`trial_expired: ${error.message}`);
    trialExpired = data?.length ?? 0;
  }

  // 2. active + cancel_at_period_end + current_period_end < now → cancelled
  {
    const { data, error } = await supabase
      .from("subscriptions")
      .update({ status: "cancelled" })
      .eq("status", "active")
      .eq("cancel_at_period_end", true)
      .lt("current_period_end", now)
      .select("id");
    if (error) failures.push(`cancelled_at_end: ${error.message}`);
    cancelledAtEnd = data?.length ?? 0;
  }

  // 3. active + current_period_end < now (no cancel flag) → past_due
  {
    const { data, error } = await supabase
      .from("subscriptions")
      .update({ status: "past_due" })
      .eq("status", "active")
      .eq("cancel_at_period_end", false)
      .lt("current_period_end", now)
      .select("id");
    if (error) failures.push(`active_to_past_due: ${error.message}`);
    activeToPastDue = data?.length ?? 0;
  }

  // 4. past_due + current_period_end + grace < now → expired
  //    graceDate = now - PAST_DUE_GRACE_DAYS; rows with period_end < graceDate
  //    are past the grace window.
  {
    const { data, error } = await supabase
      .from("subscriptions")
      .update({ status: "expired" })
      .eq("status", "past_due")
      .lt("current_period_end", graceDate)
      .select("id");
    if (error) failures.push(`past_due_expired: ${error.message}`);
    pastDueExpired = data?.length ?? 0;
  }

  // 5. Cancel add-ons marked cancel_at_period_end on subscriptions whose
  //    period has ended (active→past_due or cancelled/expired already transitioned).
  //    We match subscriptions where current_period_end < now.
  let addOnsCancelled = 0;
  {
    // Get subscriptions whose period has ended and have add-ons pending cancel.
    const { data: subIds, error: subIdsError } = await supabase
      .from("subscriptions")
      .select("id")
      .lt("current_period_end", now)
      .in("status", ["past_due", "cancelled", "expired"]);
    if (subIdsError) failures.push(`addon_sub_ids: ${subIdsError.message}`);
    const ids = (subIds ?? []).map((r: { id: string }) => r.id);
    if (ids.length > 0) {
      const { data: cancelled, error: cancelError } = await supabase
        .from("subscription_add_ons")
        .update({ status: "cancelled", cancel_at_period_end: false })
        .eq("status", "active")
        .eq("cancel_at_period_end", true)
        .in("subscription_id", ids)
        .select("id");
      if (cancelError) failures.push(`addon_cancel: ${cancelError.message}`);
      addOnsCancelled = cancelled?.length ?? 0;
    }
  }

  const total = trialExpired + cancelledAtEnd + activeToPastDue + pastDueExpired + addOnsCancelled;
  if (total > 0) {
    console.log(
      `[cron/subscription-lifecycle] transitioned ${total}: ` +
        `trial→expired=${trialExpired}, active→cancelled=${cancelledAtEnd}, ` +
        `active→past_due=${activeToPastDue}, past_due→expired=${pastDueExpired}, ` +
        `add_ons_cancelled=${addOnsCancelled}`
    );
  }
  if (failures.length > 0) {
    console.error("[cron/subscription-lifecycle] query gagal:", failures.join("; "));
    return Response.json(
      {
        error: { code: "INTERNAL", message: "Sebagian transisi gagal", details: failures },
        data: { trialExpired, cancelledAtEnd, activeToPastDue, pastDueExpired, addOnsCancelled },
      },
      { status: 500 }
    );
  }

  return Response.json({
    data: { trialExpired, cancelledAtEnd, activeToPastDue, pastDueExpired, addOnsCancelled },
  });
}
