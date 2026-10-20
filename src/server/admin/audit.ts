/**
 * Admin Audit Log — docs/10 §10.5 (semua aksi admin tercatat audit_logs).
 * View + hapus riwayat (retensi) dari panel admin.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { requireAdmin, audit } from "./guard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminAuditRow = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  actor_name: string | null;
  business_id: string | null;
  business_name: string | null;
  action: string;
  target: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listAuditLogs(query: {
  action?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: AdminAuditRow[]; total: number }> {
  await requireAdmin();
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 50));

  const supabase = createServerClient();
  let req = supabase
    .from("audit_logs")
    .select(
      "id, actor_id, business_id, action, target, meta, created_at, users ( email, name ), businesses ( name )",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  // Dropdown UI berlabel "Prefix aksi" (mis. `admin.user` mencakup
  // admin.user.create/update/delete) → pencocokan prefix, bukan exact.
  // Hanya `%` yang di-escape; `_` adalah bagian sah nama action (admin.audit_log).
  if (query.action) req = req.like("action", `${query.action.replace(/%/g, "")}%`);
  if (query.search) {
    const like = `%${query.search.replace(/[%_]/g, "")}%`;
    req = req.or(`action.ilike.${like},target.ilike.${like}`);
  }

  const { data, error, count } = await req;
  if (error) throw new ApiError("INTERNAL", "Gagal memuat audit log");

  type Row = {
    id: string;
    actor_id: string | null;
    business_id: string | null;
    action: string;
    target: string | null;
    meta: Record<string, unknown>;
    created_at: string;
    users:
      | { email: string | null; name: string | null }
      | { email: string | null; name: string | null }[]
      | null;
    businesses: { name: string } | { name: string }[] | null;
  };

  const items: AdminAuditRow[] = ((data ?? []) as unknown as Row[]).map((r) => {
    const actor = Array.isArray(r.users) ? r.users[0] : r.users;
    const biz = Array.isArray(r.businesses) ? r.businesses[0] : r.businesses;
    return {
      id: r.id,
      actor_id: r.actor_id,
      actor_email: actor?.email ?? null,
      actor_name: actor?.name ?? null,
      business_id: r.business_id,
      business_name: biz?.name ?? null,
      action: r.action,
      target: r.target,
      meta: r.meta ?? {},
      created_at: r.created_at,
    };
  });

  return { items, total: count ?? 0 };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/**
 * Hapus riwayat audit — retensi (mis. hapus log sebelum tanggal tertentu).
 * Opsional `before` (ISO datetime): hanya hapus entry lebih tua dari itu.
 * Bila `ids` diberikan, hapus entry spesifik. Maksimal satu dari dua mode.
 */
export async function deleteAuditLogs(input: { ids?: string[]; before?: string | null }) {
  const admin = await requireAdmin();
  const supabase = createServerClient();

  let deleted = 0;
  if (input.ids && input.ids.length > 0) {
    const { error, count } = await supabase
      .from("audit_logs")
      .delete({ count: "exact" })
      .in("id", input.ids);
    if (error) throw new ApiError("INTERNAL", "Gagal menghapus audit log");
    deleted = count ?? 0;
  } else if (input.before) {
    const { error, count } = await supabase
      .from("audit_logs")
      .delete({ count: "exact" })
      .lt("created_at", input.before);
    if (error) throw new ApiError("INTERNAL", "Gagal menghapus audit log");
    deleted = count ?? 0;
  } else {
    throw new ApiError("VALIDATION_ERROR", "Pilih entry atau tanggal batas untuk dihapus");
  }

  await audit(admin.id, "admin.audit_log.delete", "audit_logs", {
    ids: input.ids,
    before: input.before,
    deleted,
  });
  return { deleted };
}
