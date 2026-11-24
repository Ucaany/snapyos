/**
 * Tenant scoping helpers — docs/03 §3.5–3.6, docs/09.
 * Service-role bypass RLS → SEMUA query bisnis wajib lewat sini.
 * Akses lintas tenant = 404 (bukan 403) agar tidak bocor keberadaan data.
 */

import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import type { BusinessRole } from "@/lib/rbac";
import { membershipVisibleToScope, staffScopeAllowsBusiness } from "@/lib/session-scope";

export const ACTIVE_BUSINESS_COOKIE = "snapyos_active_business";

export type AppUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: "user" | "admin";
  /** Sesi PIN staff: tidak boleh mewarisi role owner/manager (S-001). */
  scope?: "staff";
  /** Business penerbit PIN; sesi staff hanya sah untuk business ini. */
  pinBusiness?: string;
};

export type Membership = {
  business: {
    id: string;
    slug: string;
    name: string;
    status: string;
    timezone: string;
    currency: string;
  };
  role: BusinessRole;
};

/** User terautentikasi dari session (role di-enrich di callback session).
 *  Di-memo per-request via React.cache: route guard (requireAdmin) + callee
 *  sering memanggilnya untuk request yang sama → `auth()`/query session 1×. */
export const requireUser = cache(async (): Promise<AppUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role ?? "user",
    ...(session.user.scope ? { scope: session.user.scope } : {}),
    ...(session.user.pinBusiness ? { pinBusiness: session.user.pinBusiness } : {}),
  };
});

/** Daftar business tempat user menjadi member (tenant miliknya).
 *  Di-memo per-request via React.cache: layout + page + getActiveBusiness
 *  memanggil fungsi ini beberapa kali, tapi query Supabase hanya 1×. */
export const getUserMemberships = cache(async (userId: string): Promise<Membership[]> => {
  const sessionUser = await requireUser();
  const staffScoped = sessionUser?.scope === "staff";
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("business_members")
    .select("role, businesses ( id, slug, name, status, timezone, currency )")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new ApiError("INTERNAL", "Gagal memuat membership user");
  }

  type BusinessRow = Membership["business"];
  return (data ?? []).flatMap((row) => {
    const business = row.businesses as BusinessRow | BusinessRow[] | null;
    if (!business || Array.isArray(business)) return [];
    // Business yang ditangguhkan platform tidak boleh muncul sebagai workspace
    // yang bisa dipakai. Ini keputusan otorisasi, bukan sekadar kosmetik:
    // tanpa filter ini, suspend hanya menghapus session sekali dan tenant
    // masuk lagi pada login berikutnya.
    if (business.status !== "active") return [];
    const role = row.role as BusinessRole;
    // Sesi PIN hanya melihat dan memakai membership staff. Owner/manager di
    // business lain tidak pernah masuk ke shell/token ini.
    if (!membershipVisibleToScope(role, staffScoped ? "staff" : undefined)) return [];
    // ...dan hanya untuk business penerbit PIN itu sendiri.
    if (
      staffScoped &&
      !staffScopeAllowsBusiness(true, (sessionUser as { pinBusiness?: string }).pinBusiness, business.id)
    ) {
      return [];
    }
    return [{ business, role }];
  });
});

/**
 * Business aktif: cookie activeBusinessId (docs/04 §4.16) divalidasi terhadap
 * membership; fallback ke business pertama. Null = user belum punya business.
 */
export async function getActiveBusiness(userId: string): Promise<Membership | null> {
  return getActiveBusinessForRoles(userId, ["owner", "manager", "staff"]);
}

/** Pilih business aktif hanya dari role yang valid untuk shell pemanggil. */
export async function getActiveBusinessForRoles(
  userId: string,
  allowedRoles: readonly BusinessRole[]
): Promise<Membership | null> {
  const memberships = (await getUserMemberships(userId)).filter((membership) =>
    allowedRoles.includes(membership.role)
  );
  if (memberships.length === 0) return null;

  const store = await cookies();
  const activeId = store.get(ACTIVE_BUSINESS_COOKIE)?.value;
  return (
    memberships.find((membership) => membership.business.id === activeId) ?? memberships[0] ?? null
  );
}

/** Membership user pada business tertentu; null = bukan miliknya (→404).
 *  Di-memo per-request via React.cache: layout + page + server actions kerap
 *  memanggil fungsi ini untuk (user, business) yang sama → query DB 1×. */
export const getMembership = cache(
  async (userId: string, businessId: string): Promise<Membership | null> => {
    const supabase = createServerClient();
    const sessionUser = await requireUser();
    const staffScoped = sessionUser?.scope === "staff";

    // Sesi staff dari PIN hanya sah untuk business penerbit PIN (fail-closed:
    // token lama tanpa klaim pinBusiness ditolak sampai login ulang).
    if (staffScoped) {
      const pinned = (sessionUser as { pinBusiness?: string } | null)?.pinBusiness;
      if (!staffScopeAllowsBusiness(true, pinned, businessId)) return null;
    }

    const { data, error } = await supabase
      .from("business_members")
      .select("role, businesses ( id, slug, name, status, timezone, currency )")
      .eq("user_id", userId)
      .eq("business_id", businessId)
      .maybeSingle();

    if (error) {
      throw new ApiError("INTERNAL", "Gagal memeriksa membership business");
    }
    if (staffScoped && (!data || !membershipVisibleToScope(data.role as BusinessRole, "staff")))
      return null;

    const business = data?.businesses as Membership["business"] | Membership["business"][] | null;
    if (!data || !business || Array.isArray(business)) return null;
    // Fail-closed di lapisan otorisasi: semua server function memakai helper
    // ini, jadi business yang ditangguhkan tidak bisa dipakai lagi walau
    // session-nya masih hidup.
    if (business.status !== "active") return null;
    return { business, role: data.role as BusinessRole };
  }
);
