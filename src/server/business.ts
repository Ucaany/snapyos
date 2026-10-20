/**
 * Business logic + tenant isolation — docs/08 §8.4, docs/02 (trial), docs/12 Phase 1.
 * Setiap operasi wajib membership check (server-side, docs/03 §3.5).
 */

import "server-only";
import { unstable_cache, updateTag } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can } from "@/lib/rbac";
import { getMembership, getUserMemberships, type Membership } from "@/lib/tenant";
import { isValidSlug, slugify } from "@/lib/slug";
import { isSubscriptionEffective, nextPeriod } from "@/lib/subscription-math";
import { brandingCacheTag } from "@/server/branding";
import { sendWelcomeEmail } from "@/server/lifecycle-email";

/** Tag data-cache business_settings (STEP 14). Dipakai getSettings + updateTag pada updateSettings (Next 16). */
export const settingsCacheTag = (businessId: string) => `business:${businessId}:settings`;

/** Sub-schemas JSONB (semua optional — kolom nullable di DB). */
export type CheckoutSettings = {
  qris_expiry_minutes?: number;
  offline_enabled?: boolean;
  [key: string]: unknown;
};

export type BusinessSettingsRow = {
  branding: Record<string, unknown> | null;
  camera: Record<string, unknown> | null;
  checkout: CheckoutSettings | null;
  retention_days: number | null;
};

/** DB read business_settings di-cache per business (tag `business:<id>:settings`). */
function loadSettingsRow(businessId: string): Promise<BusinessSettingsRow | null> {
  return unstable_cache(
    async () => {
      const supabase = createServerClient();
      const { data } = await supabase
        .from("business_settings")
        .select("branding, camera, checkout, retention_days")
        .eq("business_id", businessId)
        .maybeSingle();
      return (data as BusinessSettingsRow | null) ?? null;
    },
    ["settings-row", businessId],
    { tags: [settingsCacheTag(businessId)] }
  )();
}
import {
  businessCreateSchema,
  businessSettingsUpdateSchema,
  businessUpdateSchema,
  normalizeWhatsapp,
  type BusinessCreateInput,
  type BusinessSettingsUpdateInput,
  type BusinessUpdateInput,
} from "@/lib/validators";
import { mergeCheckout } from "@/lib/form-state";

export type Business = Membership["business"];

const TRIAL_DAYS_DEFAULT = 14;

async function uniqueSlug(base: string): Promise<string> {
  const supabase = createServerClient();
  const { data } = await supabase.from("businesses").select("slug").like("slug", `${base}%`);

  const taken = new Set((data ?? []).map((row) => row.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i <= 20; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new ApiError("VALIDATION_ERROR", "Slug sudah dipakai, tentukan slug lain");
}

export async function createBusiness(userId: string, input: BusinessCreateInput) {
  const parsed = businessCreateSchema.parse(input);

  const base = parsed.slug ?? slugify(parsed.name);
  if (!isValidSlug(base)) {
    throw new ApiError("VALIDATION_ERROR", "Slug tidak valid atau kata terlarang", {
      slug: ["Slug minimal 3 karakter, hanya huruf kecil/angka/tanda hubung"],
    });
  }

  const supabase = createServerClient();

  // Plan limit: max_businesses (docs/02 §2.3) — starter = 1 workspace.
  // Subscription aktif terbaru (trial/active/past_due) menentukan limit owner —
  // owner paid juga dibatasi (bukan hanya trial) — H3 audit.
  const memberships = await getUserMemberships(userId);
  if (memberships.length > 0) {
    const ownedIds = memberships.map((m) => m.business.id);
    const { data } = await supabase
      .from("subscriptions")
      .select("plans ( max_businesses )")
      .in("business_id", ownedIds)
      .in("status", ["trial", "active", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1);
    const rows = (data ?? []) as {
      plans: { max_businesses: number } | { max_businesses: number }[] | null;
    }[];
    const plan = rows[0]?.plans;
    const max = plan && !Array.isArray(plan) ? (plan.max_businesses as number) : null;
    if (max !== null && memberships.length >= max) {
      throw new ApiError("PLAN_LIMIT_REACHED", "Batas jumlah business untuk plan Anda tercapai");
    }
  }

  let slug = await uniqueSlug(base);

  let business: {
    id: string;
    slug: string;
    name: string;
    status: string;
    timezone: string;
    currency: string;
  };
  for (let attempt = 0; ; attempt++) {
    const { data, error } = await supabase
      .from("businesses")
      .insert({ owner_id: userId, name: parsed.name, slug })
      .select("id, slug, name, status, timezone, currency")
      .single();
    if (!error) {
      business = data;
      break;
    }
    if (error.code !== "23505") throw new ApiError("INTERNAL", "Gagal membuat business");
    if (attempt >= 3) {
      throw new ApiError("VALIDATION_ERROR", "Nama terlalu umum, coba nama lain");
    }
    slug = await uniqueSlug(base);
  }

  // Baris lanjutan (membership owner, settings, trial) WAJIB berhasil. Sebelum
  // ini error-nya diabaikan, sehingga kegagalan di tengah meninggalkan tenant
  // yatim (business tanpa owner) sementara action tetap redirect ke /dashboard.
  // Semua tabel anak memakai `on delete cascade` ke businesses, jadi rollback
  // cukup menghapus baris business bila salah satu insert gagal.
  async function rollbackBusiness() {
    const { error } = await supabase.from("businesses").delete().eq("id", business.id);
    if (error) {
      console.error("[business] rollback business gagal:", business.id, error.code, error.message);
    }
  }

  const { error: memberError } = await supabase.from("business_members").insert({
    business_id: business.id,
    user_id: userId,
    role: "owner",
  });
  if (memberError) {
    await rollbackBusiness();
    throw new ApiError("INTERNAL", "Gagal membuat business");
  }

  const { error: settingsError } = await supabase
    .from("business_settings")
    .insert({ business_id: business.id });
  if (settingsError) {
    await rollbackBusiness();
    throw new ApiError("INTERNAL", "Gagal membuat business");
  }

  // Trial subscription (docs/02 §2.4) — plan starter + trial_days dari platform_settings.
  const { data: plan } = await supabase
    .from("plans")
    .select("id")
    .eq("code", "starter")
    .eq("is_active", true)
    .maybeSingle();
  if (plan) {
    const { data: setting } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "trial_days")
      .maybeSingle();
    const trialDays =
      setting && typeof setting.value === "number"
        ? setting.value
        : Number(setting?.value ?? TRIAL_DAYS_DEFAULT) || TRIAL_DAYS_DEFAULT;

    const now = new Date();
    const trialEnd = nextPeriod(now, trialDays).end;
    const period = nextPeriod(now);
    const { error: subError } = await supabase.from("subscriptions").insert({
      business_id: business.id,
      plan_id: plan.id,
      status: "trial",
      trial_ends_at: trialEnd,
      current_period_start: period.start,
      current_period_end: period.end,
    });
    // Tanpa subscription, tenant tidak punya entitlement: gagalkan + rollback
    // daripada membiarkan workspace yang tidak bisa dipakai.
    if (subError) {
      await rollbackBusiness();
      throw new ApiError("INTERNAL", "Gagal membuat business");
    }
  }

  // Email selamat datang (best-effort, non-blocking — tidak boleh gagalkan
  // onboarding). Idempoten via lifecycle_emails (email, kind, ref=business.id).
  const { data: owner } = await supabase
    .from("users")
    .select("email, name")
    .eq("id", userId)
    .maybeSingle();
  const ownerRow = (owner ?? null) as { email: string; name: string | null } | null;
  if (ownerRow?.email) {
    await sendWelcomeEmail({
      email: ownerRow.email,
      name: ownerRow.name ?? ownerRow.email,
      businessName: business.name,
      businessId: business.id,
    });
  }

  return business;
}

export async function listBusinesses(userId: string) {
  const memberships = await getUserMemberships(userId);
  return memberships.map((m) => ({ ...m.business, member_role: m.role }));
}

export async function updateBusiness(
  userId: string,
  businessId: string,
  input: BusinessUpdateInput
) {
  const parsed = businessUpdateSchema.parse(input);
  if (parsed.whatsapp) parsed.whatsapp = normalizeWhatsapp(parsed.whatsapp);
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, "business:update")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin mengubah business ini");
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("businesses")
    .update(parsed)
    .eq("id", businessId)
    .select("id, slug, name, status, timezone, currency")
    .single();
  if (error || !data) throw new ApiError("INTERNAL", "Gagal memperbarui business");
  return data;
}

/** Profil bisnis (0053) untuk form Pengaturan owner — membership-gated. */
export async function getBusinessProfile(
  userId: string,
  businessId: string
): Promise<{
  name: string;
  whatsapp: string | null;
  owner_name: string | null;
  contact_email: string | null;
  address: string | null;
}> {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("businesses")
    .select("name, whatsapp, owner_name, contact_email, address")
    .eq("id", businessId)
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memuat profil bisnis");
  const row = (data ?? null) as {
    name: string;
    whatsapp: string | null;
    owner_name: string | null;
    contact_email: string | null;
    address: string | null;
  } | null;
  return {
    name: row?.name ?? membership.business.name,
    whatsapp: row?.whatsapp ?? null,
    owner_name: row?.owner_name ?? null,
    contact_email: row?.contact_email ?? null,
    address: row?.address ?? null,
  };
}

export async function getSettings(
  userId: string,
  businessId: string
): Promise<BusinessSettingsRow> {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");

  // Row settings dari data-cache (tag business:<id>:settings). Membership tetap live per-request.
  const data = await loadSettingsRow(businessId);
  if (!data) throw new ApiError("NOT_FOUND", "Settings tidak ditemukan");
  return data;
}

/** Mode offline kiosk aktif? (business_settings.checkout.offline_enabled, default false). */
export async function getOfflineEnabled(businessId: string): Promise<boolean> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("business_settings")
    .select("checkout")
    .eq("business_id", businessId)
    .maybeSingle();
  const checkout = (data as { checkout?: { offline_enabled?: boolean } } | null)?.checkout;
  return checkout?.offline_enabled === true;
}

export async function updateSettings(
  userId: string,
  businessId: string,
  input: BusinessSettingsUpdateInput
) {
  const parsed = businessSettingsUpdateSchema.parse(input);
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, "business:update")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin mengubah settings ini");
  }

  const supabase = createServerClient();

  // `checkout` adalah jsonb kolom — `.update({checkout})` mengganti seluruh objek,
  // sehingga update parsial (mis. hanya qris_expiry_minutes) akan wipe key lain
  // seperti offline_enabled. Merge field-level dulu (pola sama dengan updateBranding).
  const patch: Record<string, unknown> = { ...parsed };
  if (parsed.checkout !== undefined) {
    const { data: existing } = await supabase
      .from("business_settings")
      .select("checkout")
      .eq("business_id", businessId)
      .maybeSingle();
    const current = (existing as { checkout?: Record<string, unknown> } | null)?.checkout ?? {};
    patch.checkout = mergeCheckout(current, parsed.checkout);
  }

  const { data, error } = await supabase
    .from("business_settings")
    .update(patch)
    .eq("business_id", businessId)
    .select("branding, camera, checkout, retention_days")
    .single();
  if (error || !data) throw new ApiError("INTERNAL", "Gagal memperbarui settings");

  // Invalidate data-cache settings (STEP 14) — updateTag = read-your-writes
  // (Next 16): mutasi dari server action tampil segera di request yang sama.
  // Jika update menyentuh branding pula (mis. lewat admin), invalidate keduanya.
  updateTag(settingsCacheTag(businessId));
  if (parsed.branding !== undefined) {
    updateTag(brandingCacheTag(businessId));
  }
  return data;
}

/** Info subscription aktif untuk display owner (read-only Phase 1). */
export async function getActiveSubscription(businessId: string) {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("status, trial_ends_at, current_period_end, plans ( code, name )")
    .eq("business_id", businessId)
    .in("status", ["trial", "active", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  const row = data as {
    status: string;
    trial_ends_at: string | null;
    current_period_end: string | null;
    plans: { code: string; name: string } | { code: string; name: string }[] | null;
  };
  const plan = Array.isArray(row.plans) ? null : row.plans;
  return {
    status: row.status,
    trial_ends_at: row.trial_ends_at,
    current_period_end: row.current_period_end,
    plan: plan ? { code: plan.code, name: plan.name } : null,
    /** Date-aware effectiveness — false = subscription sudah expired secara waktu meski status belum ter-transisi oleh cron. */
    isEffective: isSubscriptionEffective(row.status, row.trial_ends_at, row.current_period_end),
  };
}
