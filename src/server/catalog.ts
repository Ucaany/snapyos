/**
 * Katalog publik — plans & add-ons aktif untuk landing page / halaman harga.
 * Tanpa requireAdmin (public read), tapi tetap service-role (bypass RLS):
 * data ini memang konsumsi publik (harga & nama), bukan data tenant.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";

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
      .select("id, code, name, price_monthly, unit")
      .eq("is_active", true)
      .order("price_monthly", { ascending: true });
    if (error) return [];
    return (data ?? []) as PublicAddOn[];
  } catch {
    return [];
  }
}
