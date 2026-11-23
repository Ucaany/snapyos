/**
 * Admin Payment Gateways — overview credential seluruh tenant + toggle global
 * per provider. Owner mengelola credential-nya sendiri (docs/06 §6.5);
 * admin platform hanya melihat redacted + men-toggle enable/disable global.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { requireAdmin, audit } from "./guard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const GATEWAY_PROVIDERS = ["midtrans", "tripay"] as const;
export type GatewayProviderKey = (typeof GATEWAY_PROVIDERS)[number];

export type AdminGatewayCredentialRow = {
  id: string;
  business_id: string;
  business_name: string;
  provider: string;
  label: string | null;
  merchant_id: string;
  environment: "sandbox" | "production";
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminGatewayState = {
  providers: Record<
    GatewayProviderKey,
    { enabled: boolean; credentialCount: number; activeCount: number }
  >;
  credentials: AdminGatewayCredentialRow[];
  total: number;
};

const SETTINGS_KEY = {
  midtrans: "gateway_midtrans_enabled",
  tripay: "gateway_tripay_enabled",
} as const;

/**
 * True bila error PostgREST menandakan offset melewati jumlah baris
 * (PGRST103 / HTTP 416 "Requested range not satisfiable"). Halaman kosong
 * adalah hasil yang benar, bukan kegagalan server (deep-link / bookmark).
 */
function isRangeNotSatisfiable(error: { code?: string; message?: string }): boolean {
  if (String(error.code ?? "") === "PGRST103") return true;
  return /requested range not satisfiable|range not satisfiable/i.test(String(error.message ?? ""));
}

/** Susun status global per provider dari settings + hitungan credential. */
function providerState(
  settingsData: { key: string; value: unknown }[] | null,
  providerCounts: number[],
  activeRows: { provider: string; is_active: boolean }[] | null
): AdminGatewayState["providers"] {
  const settings = new Map<string, unknown>();
  for (const row of settingsData ?? []) settings.set(row.key, row.value);
  const providers = {} as AdminGatewayState["providers"];
  GATEWAY_PROVIDERS.forEach((p, i) => {
    const raw = settings.get(SETTINGS_KEY[p]);
    providers[p] = {
      enabled: raw === undefined ? true : raw === true,
      credentialCount: providerCounts[i] ?? 0,
      activeCount: 0,
    };
  });
  for (const r of activeRows ?? []) {
    if (r.provider in providers && r.is_active) {
      providers[r.provider as GatewayProviderKey].activeCount++;
    }
  }
  return providers;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function getGatewayState(query: {
  provider?: string;
  page?: number;
  limit?: number;
}): Promise<AdminGatewayState> {
  await requireAdmin();
  const supabase = createServerClient();
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));

  // Credential seluruh tenant (redacted: hanya merchant_id, tanpa secret).
  let req = supabase
    .from("payment_credentials")
    .select(
      "id, business_id, provider, label, merchant_id, environment, is_active, created_at, updated_at, businesses ( name )",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (query.provider) req = req.eq("provider", query.provider);

  const [{ data, error, count }, settingsRows, providerCounts] = await Promise.all([
    req,
    supabase.from("platform_settings").select("key, value"),
    Promise.all(
      GATEWAY_PROVIDERS.map((p) =>
        supabase
          .from("payment_credentials")
          .select("id, is_active", { count: "exact", head: true })
          .eq("provider", p)
          .then(({ count: c }) => c ?? 0)
      )
    ),
  ]);
  // Halaman melampaui jumlah baris → offset tak terjangkau (PGRST103/416).
  // Anggap daftar kosong, bukan error boundary.
  if (error && isRangeNotSatisfiable(error)) {
    return {
      providers: providerState(settingsRows.data, providerCounts, []),
      credentials: [],
      total: count ?? 0,
    };
  }
  if (error) throw new ApiError("INTERNAL", "Gagal memuat payment gateway");

  // activeCount per provider (dari full credential list, bukan halaman ter-filter).
  const { data: activeRows } = await supabase
    .from("payment_credentials")
    .select("provider, is_active");
  const providers = providerState(settingsRows.data, providerCounts, activeRows);

  type Row = {
    id: string;
    business_id: string;
    provider: string;
    label: string | null;
    merchant_id: string;
    environment: "sandbox" | "production";
    is_active: boolean;
    created_at: string;
    updated_at: string;
    businesses: { name: string } | { name: string }[] | null;
  };
  const credentials: AdminGatewayCredentialRow[] = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    business_id: r.business_id,
    business_name: (Array.isArray(r.businesses) ? r.businesses[0] : r.businesses)?.name ?? "-",
    provider: r.provider,
    label: r.label,
    merchant_id: r.merchant_id,
    environment: r.environment,
    is_active: r.is_active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));

  return { providers, credentials, total: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function setGatewayEnabled(provider: string, enabled: boolean) {
  const admin = await requireAdmin();
  if (!(GATEWAY_PROVIDERS as readonly string[]).includes(provider)) {
    throw new ApiError("VALIDATION_ERROR", "Provider tidak dikenal");
  }
  const supabase = createServerClient();
  const key = SETTINGS_KEY[provider as GatewayProviderKey];
  const { error } = await supabase
    .from("platform_settings")
    .upsert({ key, value: enabled }, { onConflict: "key" });
  if (error) throw new ApiError("INTERNAL", "Gagal mengubah status provider");
  // Gate dibaca fresh per-checkout (registry) — tidak perlu invalidasi.
  await audit(admin.id, "admin.gateway.toggle", provider, { enabled });
  return { provider, enabled };
}
