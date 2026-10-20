import "server-only";

import { revalidatePath } from "next/cache";
import { createServerClient } from "@/lib/supabase/server";
import { isMissingRelation } from "@/lib/supabase/errors";
import { ApiError } from "@/lib/api-errors";
import { requireAdmin, audit } from "./guard";
import type { SupportTicketStatus } from "@/server/support-tickets";

/**
 * Admin support tickets — docs/10 §10.6 (baru). Admin platform meninjau tiket
 * lintas tenant dan mengubah status (open → needs_action → resolved).
 */

export type AdminSupportTicketRow = {
  id: string;
  business_name: string;
  subject: string;
  category: string;
  area: string;
  status: SupportTicketStatus;
  created_at: string;
  updated_at: string;
};

export async function listSupportTicketsAdmin(query: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{ items: AdminSupportTicketRow[]; total: number }> {
  await requireAdmin();
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));

  const supabase = createServerClient();
  let req = supabase
    .from("support_tickets")
    .select("id, subject, category, area, status, created_at, updated_at, businesses ( name )", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (query.status) req = req.eq("status", query.status);

  const { data, error, count } = await req;
  if (error && isMissingRelation(error)) return { items: [], total: 0 };
  if (error) throw new ApiError("INTERNAL", "Gagal memuat tiket");

  type Row = AdminSupportTicketRow & { businesses: { name: string } | { name: string }[] | null };
  const items = ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    business_name: (Array.isArray(r.businesses) ? r.businesses[0] : r.businesses)?.name ?? "-",
    subject: r.subject,
    category: r.category,
    area: r.area,
    status: r.status,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
  return { items, total: count ?? 0 };
}

export async function updateSupportTicketStatus(
  ticketId: string,
  status: SupportTicketStatus
): Promise<void> {
  const admin = await requireAdmin();
  if (!["open", "needs_action", "resolved"].includes(status))
    throw new ApiError("VALIDATION_ERROR", "Status tidak valid");

  const supabase = createServerClient();
  const patch: Record<string, unknown> = { status };
  if (status === "resolved") patch.resolved_at = new Date().toISOString();
  else patch.resolved_at = null;

  const { error } = await supabase.from("support_tickets").update(patch).eq("id", ticketId);
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui status tiket");

  await audit(admin.id, "support_ticket.update_status", ticketId, { status });
  revalidatePath("/admin/support");
}
