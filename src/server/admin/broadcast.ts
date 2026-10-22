/**
 * Admin broadcast email (marketing/pengumuman) — migration 0057.
 * Full-control admin: buat draft, kirim ke audiens (users & businesses),
 * lacak status per penerima, dan resend (kirim ulang) dengan batas max_resend.
 * Delivery via Resend (src/lib/resend.ts); template brutalist di
 * src/lib/broadcast-email.ts.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import {
  renderBroadcastHtml,
  renderBroadcastText,
  type BroadcastKind,
  type BroadcastTemplateKey,
} from "@/lib/broadcast-email";
import { sendEmailWithResend, hasResendKey } from "@/lib/resend";
import { requireAdmin, audit } from "./guard";
import { broadcastCreateSchema, type BroadcastCreateInput } from "@/lib/validators";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BroadcastAudience = "all" | "users" | "owners";
export type BroadcastStatus = "draft" | "sending" | "sent" | "partial" | "failed";
export type { BroadcastTemplateKey };

export type AdminBroadcastRow = {
  id: string;
  subject: string;
  body: string;
  kind: BroadcastKind;
  template_key: BroadcastTemplateKey;
  audience: BroadcastAudience;
  status: BroadcastStatus;
  max_resend: number;
  resend_count: number;
  created_by: string | null;
  sent_at: string | null;
  created_at: string;
};

export type AdminBroadcastStats = {
  campaign_id: string;
  total: number;
  sent: number;
  failed: number;
  pending: number;
};

export type AdminBroadcastRecipientRow = {
  id: string;
  campaign_id: string;
  email: string;
  kind: "user" | "business";
  name: string | null;
  user_id: string | null;
  business_id: string | null;
  status: "pending" | "sent" | "failed";
  error: string | null;
  provider_message_id: string | null;
  resend_count: number;
  last_sent_at: string | null;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
};

const CAMPAIGN_COLUMNS =
  "id, subject, body, kind, template_key, audience, status, max_resend, resend_count, created_by, sent_at, created_at";

const RECIPIENT_COLUMNS =
  "id, campaign_id, email, kind, name, user_id, business_id, status, error, provider_message_id, resend_count, last_sent_at, last_error, sent_at, created_at";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listBroadcasts(): Promise<AdminBroadcastRow[]> {
  await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("broadcast_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new ApiError("INTERNAL", "Gagal memuat broadcast");
  return (data ?? []) as AdminBroadcastRow[];
}

export async function getBroadcastStats(campaignIds: string[]): Promise<AdminBroadcastStats[]> {
  if (campaignIds.length === 0) return [];
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("broadcast_recipients")
    .select("campaign_id, status")
    .in("campaign_id", campaignIds);
  if (error) return [];
  const map = new Map<string, AdminBroadcastStats>();
  for (const r of data ?? []) {
    const s = map.get(r.campaign_id) ?? {
      campaign_id: r.campaign_id,
      total: 0,
      sent: 0,
      failed: 0,
      pending: 0,
    };
    s.total += 1;
    if (r.status === "sent") s.sent += 1;
    else if (r.status === "failed") s.failed += 1;
    else s.pending += 1;
    map.set(r.campaign_id, s);
  }
  return [...map.values()];
}

/** Riwayat detail semua penerima satu kampanye (untuk halaman detail). */
export async function listBroadcastRecipients(
  campaignId: string
): Promise<AdminBroadcastRecipientRow[]> {
  await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("broadcast_recipients")
    .select(RECIPIENT_COLUMNS)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  if (error) throw new ApiError("INTERNAL", "Gagal memuat riwayat penerima");
  return (data ?? []) as AdminBroadcastRecipientRow[];
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createBroadcast(input: BroadcastCreateInput): Promise<AdminBroadcastRow> {
  const admin = await requireAdmin();
  const parsed = broadcastCreateSchema.parse(input);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("broadcast_campaigns")
    .insert({
      subject: parsed.subject,
      body: parsed.body,
      kind: parsed.kind,
      template_key: parsed.template_key,
      audience: parsed.audience,
      max_resend: parsed.max_resend,
    })
    .select(CAMPAIGN_COLUMNS)
    .single();
  if (error) throw new ApiError("INTERNAL", "Gagal membuat broadcast");
  await audit(admin.id, "admin.broadcast.create", data.id, {
    kind: parsed.kind,
    template_key: parsed.template_key,
    audience: parsed.audience,
    subject: parsed.subject,
  });
  return data as AdminBroadcastRow;
}

// ---------------------------------------------------------------------------
// Audience resolution
// ---------------------------------------------------------------------------

type Recipient = {
  email: string;
  kind: "user" | "business";
  name: string;
  user_id: string | null;
  business_id: string | null;
};

async function resolveAudience(audience: BroadcastAudience): Promise<Recipient[]> {
  const supabase = createServerClient();
  const recipients: Recipient[] = [];
  const seen = new Set<string>();

  const push = (r: Recipient) => {
    const key = `${r.kind}:${r.email.toLowerCase()}`;
    if (!r.email || seen.has(key)) return;
    seen.add(key);
    recipients.push(r);
  };

  if (audience === "all" || audience === "users") {
    const { data: users } = await supabase
      .from("users")
      .select("id, email, name")
      .eq("status", "active");
    for (const u of users ?? []) {
      push({
        email: u.email,
        kind: "user",
        name: u.name ?? u.email,
        user_id: u.id,
        business_id: null,
      });
    }
  }

  if (audience === "all" || audience === "owners") {
    const { data: owners } = await supabase
      .from("business_members")
      .select("business_id, user:users(email, name)")
      .eq("role", "owner");
    const seenBusiness = new Set<string>();
    for (const o of owners ?? []) {
      const u = o.user as unknown as { email: string; name: string | null };
      if (!u?.email) continue;
      push({
        email: u.email,
        kind: "business",
        name: u.name ?? u.email,
        user_id: null,
        business_id: o.business_id,
      });
      seenBusiness.add(o.business_id);
    }
    // Bisnis tanpa owner di business_members: fallback ke businesses.contact_email.
    const { data: businesses } = await supabase
      .from("businesses")
      .select("id, name, contact_email");
    for (const b of businesses ?? []) {
      if (seenBusiness.has(b.id) || !b.contact_email) continue;
      push({
        email: b.contact_email,
        kind: "business",
        name: b.name ?? b.contact_email,
        user_id: null,
        business_id: b.id,
      });
    }
  }

  return recipients;
}

// ---------------------------------------------------------------------------
// Send / Resend
// ---------------------------------------------------------------------------

/**
 * Sinkronkan penerima tanpa menghapus riwayat. Penerima lama yang masih ada di
 * audiens dipertahankan (id & resend_count tetap); hanya baris yang keluar dari
 * audiens yang dibuang, lalu email baru ditambahkan.
 */
async function persistRecipients(campaignId: string, recipients: Recipient[]) {
  const supabase = createServerClient();
  const byEmail = new Map<string, Recipient>();
  for (const r of recipients) byEmail.set(r.email.toLowerCase(), r);
  const wanted = [...byEmail.values()];
  const wantedEmails = new Set(wanted.map((r) => r.email.toLowerCase()));

  const { data: existing, error: readError } = await supabase
    .from("broadcast_recipients")
    .select("id, email")
    .eq("campaign_id", campaignId);
  if (readError) throw new ApiError("INTERNAL", "Gagal memuat penerima broadcast");
  const existingEmails = new Set((existing ?? []).map((r) => r.email.toLowerCase()));

  // Tambah dulu, hapus belakangan: bila insert gagal, penerima lama (beserta
  // resend_count) tetap utuh. Urutan sebaliknya menghapus riwayat sebelum
  // tahu insert-nya berhasil.
  const toInsert = wanted
    .filter((r) => !existingEmails.has(r.email.toLowerCase()))
    .map((r) => ({
      campaign_id: campaignId,
      email: r.email,
      kind: r.kind,
      name: r.name,
      user_id: r.user_id,
      business_id: r.business_id,
    }));
  if (toInsert.length > 0) {
    const { error } = await supabase.from("broadcast_recipients").insert(toInsert);
    if (error) throw new ApiError("INTERNAL", "Gagal menyiapkan penerima broadcast");
  }

  // Buang penerima yang tidak lagi masuk audiens.
  const staleIds = (existing ?? [])
    .filter((r) => !wantedEmails.has(r.email.toLowerCase()))
    .map((r) => r.id);
  if (staleIds.length > 0) {
    await supabase.from("broadcast_recipients").delete().in("id", staleIds);
  }
}

async function deliverCampaign(campaign: AdminBroadcastRow, onlyFailed: boolean) {
  const supabase = createServerClient();

  type DeliveryRow = {
    id: string;
    email: string;
    name: string | null;
    resend_count: number;
    sent_at: string | null;
  };

  let rows: DeliveryRow[];

  if (!onlyFailed) {
    const recipients = await resolveAudience(campaign.audience);
    // Sinkronkan audiens tanpa menghapus riwayat penerima yang masih berlaku.
    await persistRecipients(campaign.id, recipients);
    const { data } = await supabase
      .from("broadcast_recipients")
      .select("id, email, name, resend_count, sent_at")
      .eq("campaign_id", campaign.id);
    rows = (data ?? []) as DeliveryRow[];
  } else {
    const { data } = await supabase
      .from("broadcast_recipients")
      .select("id, email, name, resend_count, sent_at")
      .eq("campaign_id", campaign.id)
      .eq("status", "failed");
    rows = (data ?? []) as DeliveryRow[];
  }

  if (rows.length === 0) {
    throw new ApiError("VALIDATION_ERROR", "Tidak ada penerima email untuk dikirim");
  }
  if (!hasResendKey()) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "RESEND_API_KEY belum dikonfigurasi: email tidak dapat dikirim"
    );
  }

  const kind = campaign.kind ?? "announcement";
  const templateKey = campaign.template_key;
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const html = renderBroadcastHtml({
      subject: campaign.subject,
      body: campaign.body,
      recipientName: row.name ?? row.email,
      kind,
      templateKey,
    });
    const text = renderBroadcastText({
      subject: campaign.subject,
      body: campaign.body,
      kind,
      templateKey,
    });
    const result = await sendEmailWithResend({
      to: row.email,
      subject: campaign.subject,
      html,
      text,
    });
    const now = new Date().toISOString();
    if (result.ok) {
      await supabase
        .from("broadcast_recipients")
        .update({
          status: "sent",
          error: null,
          provider_message_id: result.id ?? null,
          resend_count: row.resend_count + 1,
          last_sent_at: now,
          last_error: null,
          sent_at: row.sent_at ?? now,
        })
        .eq("id", row.id);
      sent += 1;
    } else {
      await supabase
        .from("broadcast_recipients")
        .update({
          status: "failed",
          error: result.error ?? "Gagal mengirim",
          resend_count: row.resend_count + 1,
          last_error: result.error ?? "Gagal mengirim",
        })
        .eq("id", row.id);
      failed += 1;
    }
  }

  return { sent, failed, total: rows.length };
}

export async function sendBroadcast(
  campaignId: string
): Promise<{ sent: number; failed: number; total: number }> {
  const admin = await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("broadcast_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("id", campaignId)
    .single();
  if (error || !data) throw new ApiError("NOT_FOUND", "Broadcast tidak ditemukan");
  const campaign = data as AdminBroadcastRow;

  // Kirim penuh hanya untuk draft (atau sisa status "sending"). Kampanye yang
  // sudah terminal (sent/partial/failed) tidak boleh di-relaunch penuh lewat
  // tombol ini — itu menghapus riwayat & melewati batas resend.
  if (campaign.status !== "draft" && campaign.status !== "sending") {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Broadcast sudah pernah dikirim. Gunakan Kirim Ulang untuk penerima yang gagal."
    );
  }

  await supabase.from("broadcast_campaigns").update({ status: "sending" }).eq("id", campaignId);

  let result: { sent: number; failed: number; total: number };
  try {
    result = await deliverCampaign(campaign, false);
  } catch (err) {
    await supabase
      .from("broadcast_campaigns")
      .update({ status: campaign.status })
      .eq("id", campaignId);
    throw err;
  }

  const status = result.failed === 0 ? "sent" : result.sent > 0 ? "partial" : "failed";
  await supabase
    .from("broadcast_campaigns")
    .update({ status, sent_at: new Date().toISOString() })
    .eq("id", campaignId);

  await audit(admin.id, "admin.broadcast.send", campaignId, {
    audience: campaign.audience,
    sent: result.sent,
    failed: result.failed,
  });

  return result;
}

export async function resendBroadcast(
  campaignId: string
): Promise<{ sent: number; failed: number; total: number }> {
  const admin = await requireAdmin();
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("broadcast_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("id", campaignId)
    .single();
  if (error || !data) throw new ApiError("NOT_FOUND", "Broadcast tidak ditemukan");
  const campaign = data as AdminBroadcastRow;

  if (campaign.status !== "partial" && campaign.status !== "failed") {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Kirim ulang hanya berlaku untuk broadcast yang sebagian/gagal terkirim."
    );
  }
  if (campaign.resend_count >= campaign.max_resend) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `Batas resend tercapai (${campaign.resend_count}/${campaign.max_resend})`
    );
  }

  await supabase.from("broadcast_campaigns").update({ status: "sending" }).eq("id", campaignId);

  let result: { sent: number; failed: number; total: number };
  try {
    result = await deliverCampaign(campaign, true);
  } catch (err) {
    await supabase
      .from("broadcast_campaigns")
      .update({ status: campaign.status })
      .eq("id", campaignId);
    throw err;
  }

  // Status akhir harus mencerminkan SELURUH penerima, bukan hanya subset yang
  // di-resend (penerima lain mungkin masih "failed" dari percobaan sebelumnya).
  const stats = await getBroadcastStats([campaignId]);
  const s = stats[0];
  const status: BroadcastStatus = !s
    ? "failed"
    : s.failed === 0
      ? "sent"
      : s.sent > 0
        ? "partial"
        : "failed";
  await supabase
    .from("broadcast_campaigns")
    .update({
      status,
      sent_at: new Date().toISOString(),
      resend_count: campaign.resend_count + 1,
    })
    .eq("id", campaignId);

  await audit(admin.id, "admin.broadcast.resend", campaignId, {
    sent: result.sent,
    failed: result.failed,
    resend_count: campaign.resend_count + 1,
  });

  return result;
}
