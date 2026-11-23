import { createServerClient } from "@/lib/supabase/server";
import { bearerMatches } from "@/lib/cron-auth";
import { sendExpiryReminderEmail } from "@/server/lifecycle-email";

/**
 * Cron pengingat masa habis berlangganan — H-3.
 * Trial memakai `trial_ends_at`; active memakai `current_period_end`.
 * Dijalankan harian (vercel.json cron). Autentikasi: Bearer CRON_SECRET.
 *
 * Window [now, now+3 hari). Idempoten via lifecycle_emails
 * (email, kind, ref=business_id:expires_at) — satu email per periode.
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

  // Trial: pengingat berbasis `trial_ends_at` (periode trial berbeda dari
  // siklus plan). Active: berbasis `current_period_end`.
  const [trialRes, activeRes] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("business_id, trial_ends_at, businesses ( owner_id )")
      .eq("status", "trial")
      .gte("trial_ends_at", nowIso)
      .lt("trial_ends_at", windowEndIso),
    supabase
      .from("subscriptions")
      .select("business_id, current_period_end, businesses ( owner_id )")
      .eq("status", "active")
      .gte("current_period_end", nowIso)
      .lt("current_period_end", windowEndIso),
  ]);
  const error = trialRes.error ?? activeRes.error;
  if (error) {
    console.error("[cron/subscription-expiry-reminder] query failed: %s", error.message);
    return Response.json(
      { error: { code: "INTERNAL", message: "Gagal memuat subscription" } },
      { status: 500 }
    );
  }

  type Row = {
    business_id: string;
    expires_at: string | null;
    businesses: { owner_id: string } | { owner_id: string }[] | null;
  };
  const subs: Row[] = [
    ...((
      trialRes.data ?? []
    ) as unknown as {
      business_id: string;
      trial_ends_at: string | null;
      businesses: { owner_id: string } | { owner_id: string }[] | null;
    }[]).map((s) => ({
      business_id: s.business_id,
      expires_at: s.trial_ends_at,
      businesses: s.businesses,
    })),
    ...((
      activeRes.data ?? []
    ) as unknown as {
      business_id: string;
      current_period_end: string | null;
      businesses: { owner_id: string } | { owner_id: string }[] | null;
    }[]).map((s) => ({
      business_id: s.business_id,
      expires_at: s.current_period_end,
      businesses: s.businesses,
    })),
  ];

  let sent = 0;
  for (const sub of subs) {
    if (!sub.expires_at) continue;
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
      expiresAt: sub.expires_at,
    });
    if (result === "sent") sent += 1;
  }

  return Response.json({ data: { remindersSent: sent } });
}
