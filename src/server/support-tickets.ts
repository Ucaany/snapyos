import "server-only";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { isMissingRelation } from "@/lib/supabase/errors";
import { ApiError } from "@/lib/api-errors";
import { requireActiveBusiness } from "@/server/action-utils";
import {
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_AREAS,
  type SupportTicketStatus,
} from "@/lib/support-ticket-constants";

export {
  SUPPORT_TICKET_STATUSES,
  SUPPORT_TICKET_CATEGORIES,
  SUPPORT_TICKET_AREAS,
  STATUS_LABEL,
  type SupportTicketStatus,
} from "@/lib/support-ticket-constants";

/**
 * Tiket bantuan owner — docs/04 §4.20 (migration 0050).
 * Owner submit masalah (subjek, kategori, area/bagian, deskripsi) dan memantau
 * status: open / needs_action / resolved. Admin platform meninjau lintas tenant
 * (lihat server/admin/support.ts).
 */

export type SupportTicket = {
  id: string;
  subject: string;
  category: string;
  area: string;
  description: string;
  status: SupportTicketStatus;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export async function listSupportTickets(): Promise<SupportTicket[]> {
  const ctx = await requireActiveBusiness();
  if (!ctx) throw new ApiError("UNAUTHORIZED", "Sesi berakhir. Silakan masuk kembali.");

  const supabase = createServerClient();
  // Owner melihat seluruh tiket business; anggota lain hanya tiket yang
  // mereka buat sendiri (semua role boleh membuat tiket).
  let req = supabase
    .from("support_tickets")
    .select("id, subject, category, area, description, status, resolved_at, created_at, updated_at")
    .eq("business_id", ctx.businessId)
    .order("created_at", { ascending: false });
  if (ctx.role !== "owner") req = req.eq("created_by", ctx.user.id);
  const { data, error } = await req;

  if (error && isMissingRelation(error)) return [];
  if (error) throw new ApiError("INTERNAL", "Gagal memuat tiket bantuan");
  return (data ?? []) as unknown as SupportTicket[];
}

export type SupportTicketDetail = SupportTicket & {
  replies: { id: string; body: string; created_at: string; author_name: string | null }[];
};

export async function getSupportTicket(ticketId: string): Promise<SupportTicketDetail> {
  const ctx = await requireActiveBusiness();
  if (!ctx) throw new ApiError("UNAUTHORIZED", "Sesi berakhir. Silakan masuk kembali.");

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("support_tickets")
    .select(
      "id, created_by, subject, category, area, description, status, resolved_at, created_at, updated_at, support_ticket_replies ( id, body, created_at, users ( name ) )"
    )
    .eq("id", ticketId)
    .eq("business_id", ctx.businessId)
    .maybeSingle();

  if (error) throw new ApiError("INTERNAL", "Gagal memuat tiket");
  // Owner melihat semua tiket business; anggota lain hanya tiket miliknya.
  if (data && ctx.role !== "owner" && (data as { created_by?: string }).created_by !== ctx.user.id) {
    throw new ApiError("NOT_FOUND", "Tiket tidak ditemukan");
  }
  if (!data) throw new ApiError("NOT_FOUND", "Tiket tidak ditemukan");

  type Row = SupportTicket & {
    support_ticket_replies: { id: string; body: string; created_at: string; users: { name: string | null } | null }[] | null;
  };
  const row = data as unknown as Row;
  return {
    ...(row as SupportTicket),
    replies: (row.support_ticket_replies ?? []).map((r) => ({
      id: r.id,
      body: r.body,
      created_at: r.created_at,
      author_name: r.users?.name ?? null,
    })),
  };
}

export async function submitSupportTicket(input: {
  subject: string;
  category: string;
  area: string;
  description: string;
}): Promise<{ id: string }> {
  const ctx = await requireActiveBusiness();
  if (!ctx) throw new ApiError("UNAUTHORIZED", "Sesi berakhir. Silakan masuk kembali.");

  const subject = input.subject.trim();
  const description = input.description.trim();
  if (!subject || subject.length > 200) throw new ApiError("VALIDATION_ERROR", "Subjek wajib diisi (maks 200 karakter).");
  if (!description || description.length > 4000) throw new ApiError("VALIDATION_ERROR", "Deskripsi wajib diisi (maks 4000 karakter).");
  if (!(SUPPORT_TICKET_CATEGORIES as readonly string[]).includes(input.category))
    throw new ApiError("VALIDATION_ERROR", "Kategori tidak valid.");
  if (!(SUPPORT_TICKET_AREAS as readonly string[]).includes(input.area))
    throw new ApiError("VALIDATION_ERROR", "Area tidak valid.");

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      business_id: ctx.businessId,
      created_by: ctx.user.id,
      subject,
      category: input.category,
      area: input.area,
      description,
    })
    .select("id")
    .single();

  if (error) {
    if (isMissingRelation(error)) {
      throw new ApiError("FEATURE_DISABLED", "Fitur tiket belum diaktifkan. Terapkan migration 0050_support_tickets.sql.");
    }
    throw new ApiError("INTERNAL", "Gagal membuat tiket");
  }
  revalidatePath("/dashboard/support");
  return { id: data.id as string };
}

export async function replySupportTicket(ticketId: string, body: string): Promise<void> {
  const ctx = await requireActiveBusiness();
  if (!ctx) throw new ApiError("UNAUTHORIZED", "Sesi berakhir. Silakan masuk kembali.");

  const text = body.trim();
  if (!text || text.length > 4000) throw new ApiError("VALIDATION_ERROR", "Balasan wajib diisi (maks 4000 karakter).");

  const supabase = createServerClient();
  const { error: ownedErr, data: owned } = await supabase
    .from("support_tickets")
    .select("id, created_by")
    .eq("id", ticketId)
    .eq("business_id", ctx.businessId)
    .maybeSingle();
  if (ownedErr || !owned) throw new ApiError("NOT_FOUND", "Tiket tidak ditemukan");
  // Anggota non-owner hanya boleh membalas tiket miliknya sendiri.
  if (ctx.role !== "owner" && (owned as { created_by: string }).created_by !== ctx.user.id) {
    throw new ApiError("NOT_FOUND", "Tiket tidak ditemukan");
  }

  const { error } = await supabase.from("support_ticket_replies").insert({
    ticket_id: ticketId,
    author_id: ctx.user.id,
    body: text,
  });
  if (error) throw new ApiError("INTERNAL", "Gagal mengirim balasan");

  // Balasan owner membuka kembali tiket yang sudah `resolved` → `open`.
  await supabase
    .from("support_tickets")
    .update({ status: "open", resolved_at: null, updated_at: new Date().toISOString() })
    .eq("id", ticketId)
    .eq("status", "resolved");
  revalidatePath(`/dashboard/support/${ticketId}`);
  revalidatePath("/dashboard/support");
}
