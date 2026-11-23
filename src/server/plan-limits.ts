/**
 * Plan limits aktif business — docs/02 §2.3, docs/12 Phase 3.
 * Enforcement server-side di setiap endpoint pembuatan resource.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { effectiveSessions, isSubscriptionEffective } from "@/lib/subscription-math";
import { DEFAULT_PLAN_LIMITS, type PlanLimits } from "@/lib/plan-limits";

/**
 * Limit plan untuk MUTASI — fail-closed.
 * Subscription tidak efektif, query error, atau join plan rusak tidak boleh
 * diam-diam memberi kuota Starter (audit lintas-potong). Read-only tetap
 * memakai getPlanLimits() agar owner expired masih bisa melihat data.
 */
export async function requirePlanLimits(businessId: string): Promise<PlanLimits> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "status, trial_ends_at, current_period_end, billing_cycle, plans ( max_outlets, max_photoboxes, max_concurrent_sessions, max_staff, max_packages, max_templates )"
    )
    .eq("business_id", businessId)
    .in("status", ["trial", "active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new ApiError("INTERNAL", "Gagal memuat limit plan");

  const row = data as {
    id?: string;
    status: string;
    trial_ends_at: string | null;
    current_period_end: string | null;
    billing_cycle: string | null;
    plans:
      | {
          max_outlets: number;
          max_photoboxes: number;
          max_concurrent_sessions: number;
          max_staff: number;
          max_packages: number;
          max_templates: number;
        }
      | {
          max_outlets: number;
          max_photoboxes: number;
          max_concurrent_sessions: number;
          max_staff: number;
          max_packages: number;
          max_templates: number;
        }[]
      | null;
  } | null;

  if (
    !row ||
    !isSubscriptionEffective(
      row.status,
      row.trial_ends_at,
      row.current_period_end,
      new Date(),
      row.billing_cycle
    )
  ) {
    throw new ApiError(
      "SUBSCRIPTION_EXPIRED",
      "Langganan bisnis ini sudah kedaluwarsa. Perpanjang langganan untuk melanjutkan."
    );
  }

  const plan = row.plans;
  if (!plan || Array.isArray(plan)) {
    throw new ApiError("INTERNAL", "Plan langganan tidak valid");
  }

  return {
    max_outlets: Number(plan.max_outlets ?? DEFAULT_PLAN_LIMITS.max_outlets),
    max_photoboxes: Number(plan.max_photoboxes ?? DEFAULT_PLAN_LIMITS.max_photoboxes),
    max_concurrent_sessions: Number(
      plan.max_concurrent_sessions ?? DEFAULT_PLAN_LIMITS.max_concurrent_sessions
    ),
    max_staff: Number(plan.max_staff ?? DEFAULT_PLAN_LIMITS.max_staff),
    max_packages: Number(plan.max_packages ?? DEFAULT_PLAN_LIMITS.max_packages),
    max_templates: Number(plan.max_templates ?? DEFAULT_PLAN_LIMITS.max_templates),
  };
}

/** Deteksi error kuota dari RPC atomik (0069) — pesan deterministik PLAN_LIMIT_REACHED. */
export function isPlanLimitError(error: { message?: string | null } | null): boolean {
  return Boolean(error?.message?.includes("PLAN_LIMIT_REACHED"));
}

/** Limit plan dari subscription aktif terbaru (trial/active/past_due) + add-on sesi (docs/02 §2.9). */
export async function getPlanLimits(businessId: string): Promise<PlanLimits> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("subscriptions")
      .select(
        "id, status, trial_ends_at, current_period_end, billing_cycle, plans ( max_outlets, max_photoboxes, max_concurrent_sessions, max_staff, max_packages, max_templates )"
      )
    .eq("business_id", businessId)
    .in("status", ["trial", "active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = data as {
    id: string;
    status: string;
    trial_ends_at: string | null;
    current_period_end: string | null;
    billing_cycle: string | null;
    plans:
      | {
          max_outlets: number;
          max_photoboxes: number;
          max_concurrent_sessions: number;
          max_staff: number;
          max_packages: number;
          max_templates: number;
        }
      | {
          max_outlets: number;
          max_photoboxes: number;
          max_concurrent_sessions: number;
          max_staff: number;
          max_packages: number;
          max_templates: number;
        }[]
      | null;
  } | null;

  // Date check: status string saja tidak cukup (AGENTS.md §Resolusi Konflik).
  if (
    !row ||
    !isSubscriptionEffective(
      row.status,
      row.trial_ends_at,
      row.current_period_end,
      new Date(),
      row.billing_cycle
    )
  ) {
    return DEFAULT_PLAN_LIMITS;
  }

  const plan = row.plans;
  if (!plan || Array.isArray(plan)) return DEFAULT_PLAN_LIMITS;

  let sessions =
    (plan.max_concurrent_sessions as number) ?? DEFAULT_PLAN_LIMITS.max_concurrent_sessions;
  if (row.id) {
    const { data: addOns } = await supabase
      .from("subscription_add_ons")
      .select("quantity, add_ons!inner(code, unit)")
      .eq("subscription_id", row.id)
      .eq("status", "active");
    sessions = effectiveSessions(
      sessions,
      (
        (addOns ?? []) as unknown as {
          quantity: number;
          add_ons: { code: string; unit: string } | { code: string; unit: string }[];
        }[]
      )
        .filter((a) => {
          const addOn = Array.isArray(a.add_ons) ? a.add_ons[0] : a.add_ons;
          return addOn?.code === "extra_session";
        })
        .map((a) => a.quantity)
    );
  }

  return {
    max_outlets: (plan.max_outlets as number) ?? DEFAULT_PLAN_LIMITS.max_outlets,
    max_photoboxes: (plan.max_photoboxes as number) ?? DEFAULT_PLAN_LIMITS.max_photoboxes,
    max_concurrent_sessions: sessions,
    max_staff: (plan.max_staff as number) ?? DEFAULT_PLAN_LIMITS.max_staff,
    max_packages: (plan.max_packages as number) ?? DEFAULT_PLAN_LIMITS.max_packages,
    max_templates: (plan.max_templates as number) ?? DEFAULT_PLAN_LIMITS.max_templates,
  };
}
