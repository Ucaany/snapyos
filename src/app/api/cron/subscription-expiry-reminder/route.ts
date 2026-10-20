import { createServerClient } from "@/lib/supabase/server";
import { bearerMatches } from "@/lib/cron-auth";
import { sendExpiryReminderEmail } from "@/server/lifecycle-email";

/**
 * Cron pengingat masa habis berlangganan — H-3 sebelum current_period_end.
 * Dijalankan harian (vercel.json cron). Autentikasi: Bearer CRON_SECRET.
 *
 * Menjangkau subscription active/trial yang current_period_end berada dalam
 * window [now, now+3 hari). Idempoten via lifecycle_emails (email, kind,
 * ref=business_id) sehingga pengiriman harian tidak menduplikasi email.
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
    console.error("[cron/subscription-expiry-reminder] CRON_SECRET tidak diset");
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
  const windowEnd = new Date(now.getTime() + 3 * 86_400_000);
  const nowIso = now.toISOString();
  const windowEndIso = windowEnd.toISOString();

  // Subscription aktif (active/trial) yang akan habis dalam <3 hari.
  const { data: subs, error } = await supabase
    .from("subscriptions")
    .select("business_id, current_period_end, businesses ( owner_id )")
    .in("status", ["active", "trial"])
    .gte("current_period_end", nowIso)
    .lt("current_period_end", windowEndIso);

  if (error) {
    console.error("[cron/subscription-expiry-reminder] query failed: %s", error.message);
    return Response.json(
      { error: { code: "INTERNAL", message: "Gagal memuat subscription" } },
      { status: 500 }
    );
  }

  let sent = 0;
  for (const sub of (subs ?? []) as {
    business_id: string;
    current_period_end: string | null;
    businesses: { owner_id: string } | { owner_id: string }[] | null;
  }[]) {
    if (!sub.current_period_end) continue;
    const business = sub.businesses && !Array.isArray(sub.businesses) ? sub.businesses : null;
    if (!business?.owner_id) continue;

    const { data: owner } = await supabase
      .from("users")
      .select("email, name")
      .eq("id", business.owner_id)
      .maybeSingle();
    const ownerRow = (owner ?? null) as { email: string; name: string | null } | null;
    if (!ownerRow?.email) continue;

    const result = await sendExpiryReminderEmail({
      email: ownerRow.email,
      name: ownerRow.name ?? ownerRow.email,
      businessId: sub.business_id,
      expiresAt: sub.current_period_end,
    });
    if (result === "sent") sent += 1;
  }

  return Response.json({ data: { remindersSent: sent } });
}
