/**
 * Katalog publik — plans & add-ons aktif untuk landing page / halaman harga.
 * Tanpa requireAdmin (public read), tapi tetap service-role (bypass RLS):
 * data ini memang konsumsi publik (harga & nama), bukan data tenant.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { storageAddOnDisplayName } from "@/lib/storage-units";
import {
  monthlyEquivalent,
  normalizeCycle,
  type BillingCycle,
  type CyclePrices,
} from "@/lib/subscription-math";

export type PublicPlan = {
  id: string;
  code: string;
  name: string;
  price: number;
  billing_cycle: BillingCycle;
  features: Record<string, boolean>;
};

export type PublicAddOn = CyclePrices & {
  id: string;
  code: string;
  name: string;
  unit: string;
  storage_mb: number | null;
};

export async function getPublicPlans(): Promise<PublicPlan[]> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("plans")
      .select("id, code, name, price, billing_cycle, features")
      .eq("is_active", true);
    if (error) return [];
    return ((data ?? []) as unknown as {
      id: string;
      code: string;
      name: string;
      price: number;
      billing_cycle: string | null;
      features: Record<string, boolean> | null;
    }[])
      .map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        price: p.price,
        billing_cycle: normalizeCycle(p.billing_cycle),
        features: p.features ?? {},
      }))
      .sort(
        (a, b) =>
          monthlyEquivalent(a.price, a.billing_cycle) -
          monthlyEquivalent(b.price, b.billing_cycle)
      );
  } catch {
    return [];
  }
}

export async function getPublicAddOns(): Promise<PublicAddOn[]> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("add_ons")
      .select(
        "id, code, name, price_monthly, price_daily, price_weekly, price_yearly, unit, storage_mb"
      )
      .eq("is_active", true)
      .order("price_monthly", { ascending: true });
    if (error) return [];
    return ((data ?? []) as PublicAddOn[]).map((addOn) => ({
      ...addOn,
      name: storageAddOnDisplayName({
        name: addOn.name,
        unit: addOn.unit,
        storageMb: addOn.storage_mb,
      }),
    }));
  } catch {
    return [];
  }
}

/** Harga plan termurah (setara bulanan) untuk badge hero; null bila kosong. */
export async function getCheapestPlanPrice(): Promise<number | null> {
  const plans = await getPublicPlans();
  return plans[0] ? monthlyEquivalent(plans[0].price, plans[0].billing_cycle) : null;
}
