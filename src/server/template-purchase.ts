import "server-only";

/**
 * Pembelian template premium (global) — docs/15 §15.9b.
 * Owner melihat template global premium (is_premium=true, business_id NULL),
 * membeli via invoice QRIS (alur subscription invoice existing), saat paid
 * `applyInvoiceIntent` menulis kepemilikan ke `business_template_purchases`.
 */

import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can } from "@/lib/rbac";
import { getMembership } from "@/lib/tenant";
import { invoiceNumber } from "@/lib/subscription-math";
import { insertAudit } from "@/server/audit";
import { signedUrlMap } from "@/server/storage";
import { SIGNED_URL_TTL_SECONDS as SIGNED_URL_TTL } from "@/lib/constants";

const BUCKET = "business-assets";

export type PremiumTemplateRow = {
  id: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  /** Signed URL frame penuh — hanya untuk template yang sudah dibeli. */
  file_url: string | null;
  thumbnail_url: string | null;
  price: number;
  is_active: boolean;
  purchased: boolean;
};

export type OwnedTemplateRow = {
  template_id: string;
  name: string;
  price: number;
  purchased_at: string;
};

async function requireOwner(userId: string, businessId: string) {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, "subscription:write")) {
    throw new ApiError("FORBIDDEN", "Hanya owner yang dapat membeli template premium");
  }
  return membership;
}

/** Read template premium — owner/manager (subscription:read), bukan staff. */
async function requireSubscriptionRead(userId: string, businessId: string) {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, "subscription:read")) {
    throw new ApiError("FORBIDDEN", "Anda tidak punya izin melihat template premium");
  }
  return membership;
}

/**
 * Template global premium (berbayar) + status kepemilikan business.
 * Hanya template premium (is_premium=true) dengan harga > 0; template
 * gratis global tetap otomatis tersedia (tanpa pembelian).
 */
export async function listPremiumTemplates(
  userId: string,
  businessId: string
): Promise<PremiumTemplateRow[]> {
  await requireSubscriptionRead(userId, businessId);
  const supabase = createServerClient();
  const [{ data: templates }, { data: owned }] = await Promise.all([
    supabase
      .from("templates")
      .select(
        "id, name, category_id, file_url, thumbnail_url, price, is_active, template_categories(name)"
      )
      .is("business_id", null)
      .eq("is_premium", true)
      .gt("price", 0)
      .order("created_at", { ascending: false }),
    supabase
      .from("business_template_purchases")
      .select("template_id")
      .eq("business_id", businessId),
  ]);
  const ownedIds = new Set(((owned ?? []) as { template_id: string }[]).map((o) => o.template_id));
  type Row = {
    id: string;
    name: string;
    category_id: string | null;
    file_url: string;
    thumbnail_url: string | null;
    price: number;
    is_active: boolean;
    template_categories: { name: string } | { name: string }[] | null;
  };
  const rows = (templates ?? []) as unknown as Row[];
  // Bucket private → signed URL (docs/09 §9). Tanpa ini, <Image src> memakai
  // key mentah sebagai path relatif → 404 dan marketplace tampil tanpa preview.
  //
  // Frame PENUH hanya di-sign untuk template yang sudah dibeli: kalau tidak,
  // marketplace membagikan aset berbayar (frame resolusi penuh) ke setiap
  // tenant sebelum ada pembayaran. Thumbnail tetap di-sign untuk semua baris
  // karena itulah yang ditampilkan grid.
  const thumbKeys = rows.map((t) => t.thumbnail_url).filter((k): k is string => !!k);
  const frameKeys = rows
    .filter((t) => ownedIds.has(t.id))
    .map((t) => t.file_url)
    .filter((k): k is string => !!k);
  const urlByKey = await signedUrlMap(
    BUCKET,
    Array.from(new Set([...thumbKeys, ...frameKeys])),
    SIGNED_URL_TTL
  );
  return rows.map((t) => {
    const purchased = ownedIds.has(t.id);
    return {
      id: t.id,
      name: t.name,
      category_id: t.category_id,
      category_name:
        (Array.isArray(t.template_categories) ? t.template_categories[0] : t.template_categories)
          ?.name ?? null,
      file_url: purchased ? (urlByKey.get(t.file_url) ?? null) : null,
      thumbnail_url: t.thumbnail_url ? (urlByKey.get(t.thumbnail_url) ?? null) : null,
      price: t.price,
      is_active: t.is_active,
      purchased,
    };
  });
}

/** Template premium yang sudah dibeli business (riwayat). */
export async function listPurchasedTemplates(
  userId: string,
  businessId: string
): Promise<OwnedTemplateRow[]> {
  await requireSubscriptionRead(userId, businessId);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("business_template_purchases")
    .select("template_id, price, created_at, templates(name)")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  if (error) throw new ApiError("INTERNAL", "Gagal memuat riwayat pembelian template");
  type Row = {
    template_id: string;
    price: number;
    created_at: string;
    templates: { name: string } | { name: string }[] | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    template_id: r.template_id,
    name: (Array.isArray(r.templates) ? r.templates[0] : r.templates)?.name ?? "-",
    price: r.price,
    purchased_at: r.created_at,
  }));
}

/**
 * Buat invoice pending dengan intent template_purchase (satu template).
 * Reuse alur QRIS invoice subscription: owner bayar → webhook paid →
 * applyInvoiceIntent → baris kepemilikan ditulis.
 */
export async function purchaseTemplate(
  userId: string,
  businessId: string,
  templateId: string
): Promise<{ invoiceId: string; invoiceNumber: string; amount: number; templateName: string }> {
  await requireOwner(userId, businessId);
  const supabase = createServerClient();

  const { data: tpl } = await supabase
    .from("templates")
    .select("id, name, price, is_premium, is_active")
    .eq("id", templateId)
    .is("business_id", null)
    .maybeSingle();
  const template = (tpl ?? null) as {
    id: string;
    name: string;
    price: number | null;
    is_premium: boolean;
    is_active: boolean;
  } | null;
  if (!template) throw new ApiError("NOT_FOUND", "Template premium tidak ditemukan");
  if (!template.is_premium || !template.price || template.price <= 0) {
    throw new ApiError("VALIDATION_ERROR", "Template ini tidak berbayar");
  }
  if (!template.is_active) {
    throw new ApiError("VALIDATION_ERROR", "Template sedang tidak tersedia");
  }

  // Sudah dimiliki → tidak perlu beli lagi.
  const { data: existing } = await supabase
    .from("business_template_purchases")
    .select("id")
    .eq("business_id", businessId)
    .eq("template_id", templateId)
    .maybeSingle();
  if (existing) throw new ApiError("VALIDATION_ERROR", "Template ini sudah Anda miliki");

  const amount = template.price;

  // Invoice pending (template purchase) — void invoice template-purchase lama.
  await supabase
    .from("invoices")
    .update({ status: "void" })
    .eq("business_id", businessId)
    .eq("status", "pending")
    .eq("intent->>type", "template_purchase");

  // Nomor invoice (anti race — retry pada unique violation).
  const now = new Date();
  let invoiceId = "";
  let number = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const { count } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId);
    number = invoiceNumber((count ?? 0) + 1, now);
    const { data: inv, error } = await supabase
      .from("invoices")
      .insert({
        business_id: businessId,
        subscription_id: null,
        number,
        amount,
        status: "pending",
        intent: {
          type: "template_purchase",
          items: [
            {
              type: "template_purchase",
              template_id: template.id,
              name: template.name,
              amount,
              qty: 1,
            },
          ],
        },
      })
      .select("id, number")
      .single();
    if (inv && !error) {
      invoiceId = (inv as { id: string }).id;
      break;
    }
    if (error && error.code !== "23505") {
      throw new ApiError("INTERNAL", "Gagal membuat invoice pembelian template");
    }
  }
  if (!invoiceId) throw new ApiError("INTERNAL", "Gagal membuat invoice (kolisi nomor berulang)");

  await insertAudit({
    actorId: userId,
    businessId,
    action: "template.purchase_initiated",
    target: template.id,
    meta: { invoice: number, amount, template: template.name },
  });

  return { invoiceId, invoiceNumber: number, amount, templateName: template.name };
}
