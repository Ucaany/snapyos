/**
 * Katalog publik — plans & add-ons aktif untuk landing page / halaman harga.
 * Tanpa requireAdmin (public read), tapi tetap service-role (bypass RLS):
 * data ini memang konsumsi publik (harga & nama), bukan data tenant.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { storageAddOnDisplayName } from "@/lib/storage-units";

export type PublicPlan = {
  id: string;
  code: string;
  name: string;
  price_monthly: number;
  price_yearly: number | null;
  features: Record<string, boolean>;
};

export type PublicAddOn = {
  id: string;
  code: string;
  name: string;
  price_monthly: number;
  unit: string;
  storage_mb: number | null;
};

export async function getPublicPlans(): Promise<PublicPlan[]> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("plans")
      .select("id, code, name, price_monthly, price_yearly, features")
      .eq("is_active", true)
      .order("price_monthly", { ascending: true });
    if (error) return [];
    return (data ?? []) as PublicPlan[];
  } catch {
    return [];
  }
}

export async function getPublicAddOns(): Promise<PublicAddOn[]> {
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("add_ons")
      .select("id, code, name, price_monthly, unit, storage_mb")
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

/** Harga plan termurah untuk badge hero; null bila katalog kosong. */
export async function getCheapestPlanPrice(): Promise<number | null> {
  const plans = await getPublicPlans();
  return plans[0]?.price_monthly ?? null;
}
