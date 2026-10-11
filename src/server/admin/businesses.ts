/**
 * Admin Businesses — docs/10 §10.2 (data layer).
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { adminBusinessUpdateSchema } from "@/lib/validators";
import { requireAdmin, audit } from "./guard";
import { getStorageUsageBatch } from "@/server/storage-usage";
import { activeStorageProviders } from "@/server/storage";
import type { StorageBucket } from "@/server/storage/types";

const STORAGE_BUCKETS: StorageBucket[] = ["business-assets", "generated-photos"];
/** Batas aman iterasi listing per direktori (cegah loop tak berujung). */
const SWEEP_MAX_PAGES = 2000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminBusinessRow = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  created_at: string;
  owner_email: string | null;
  plan_name: string | null;
  subscription_status: string | null;
  usage: { outlets: number; photoboxes: number; sessions: number; transactions: number };
  storage: { usedMb: number; limitMb: number; percent: number; isFull: boolean };
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listBusinesses(query: {
  search?: string;
  status?: "active" | "suspended";
  page?: number;
  limit?: number;
}): Promise<{ items: AdminBusinessRow[]; total: number }> {
  await requireAdmin();
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));

  const supabase = createServerClient();
  let req = supabase
    .from("businesses")
    .select(
      "id, name, slug, status, created_at, users ( email ), subscriptions ( status, plans ( name ) )",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (query.status) {
    req = req.eq("status", query.status);
  }
  if (query.search) {
    const like = `%${query.search.replace(/[%_]/g, "")}%`;
    req = req.or(`name.ilike.${like},slug.ilike.${like}`);
  }
  const { data, error, count } = await req;
  if (error) throw new ApiError("INTERNAL", "Gagal memuat businesses");

  type Row = {
    id: string;
    name: string;
    slug: string;
    status: "active" | "suspended";
    created_at: string;
    users: { email: string } | { email: string }[] | null;
    subscriptions:
      | { status: string; plans: { name: string } | { name: string }[] | null }[]
      | { status: string; plans: { name: string } | { name: string }[] | null }
      | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  // Batch usage seluruh halaman — 4 query agregat (bukan 4 per baris, anti N+1).
  const ids = rows.map((r) => r.id);
  const usageById = new Map<string, AdminBusinessRow["usage"]>();
  if (ids.length > 0) {
    const [outlets, photoboxes, sessions, transactions] = await Promise.all([
      supabase.from("outlets").select("business_id").in("business_id", ids),
      supabase.from("photoboxes").select("business_id").in("business_id", ids),
      supabase.from("sessions").select("business_id").in("business_id", ids),
      supabase.from("transactions").select("business_id").in("business_id", ids),
    ]);
    const tally = (res: { data: { business_id: string }[] | null }) => {
      const m = new Map<string, number>();
      for (const r of res.data ?? []) m.set(r.business_id, (m.get(r.business_id) ?? 0) + 1);
      return m;
    };
    const o = tally(outlets);
    const p = tally(photoboxes);
    const s = tally(sessions);
    const t = tally(transactions);
    for (const id of ids) {
      usageById.set(id, {
        outlets: o.get(id) ?? 0,
        photoboxes: p.get(id) ?? 0,
        sessions: s.get(id) ?? 0,
        transactions: t.get(id) ?? 0,
      });
    }
  }

  // Storage usage (0053/0062) — satu query batch counter + satu query batch
  // kuota (anti N+1). TIDAK merekonsiliasi dari listing R2 di list page —
  // backfill/cron yang mengisi baris counter bisnis lama.
  const storageById = new Map<string, AdminBusinessRow["storage"]>();
  if (ids.length > 0) {
    const batch = await getStorageUsageBatch(ids);
    for (const [id, s] of batch) {
      storageById.set(id, { usedMb: s.usedMb, limitMb: s.limitMb, percent: s.percent, isFull: s.isFull });
    }
  }

  const items: AdminBusinessRow[] = [];
  for (const row of rows) {
    const owner = Array.isArray(row.users) ? row.users[0] : row.users;
    const subs = Array.isArray(row.subscriptions) ? row.subscriptions : [row.subscriptions].filter(Boolean);
    const latest = subs[0];
    const plan = latest && !Array.isArray(latest.plans) ? latest.plans : null;
    items.push({
      id: row.id,
      name: row.name,
      slug: row.slug,
      status: row.status,
      created_at: row.created_at,
      owner_email: owner?.email ?? null,
      plan_name: plan?.name ?? null,
      subscription_status: latest?.status ?? null,
      usage: usageById.get(row.id) ?? { outlets: 0, photoboxes: 0, sessions: 0, transactions: 0 },
      storage: storageById.get(row.id) ?? { usedMb: 0, limitMb: 0, percent: 0, isFull: false },
    });
  }
  return { items, total: count ?? 0 };
}

export async function getBusinessUsage(businessId: string) {
  // K5: guard admin (audit 2026-09-16). Sebelumnya fungsi ini di-invoke lewat
  // GET /api/v1/admin/businesses/:id tanpa auth check apa pun.
  await requireAdmin();
  const supabase = createServerClient();
  // K6: pastikan business exists — kembalikan 404, jangan zeros palsu.
  const { data: exists, error: existsErr } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .maybeSingle();
  if (existsErr) throw new ApiError("INTERNAL", "Gagal memuat business");
  if (!exists) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");

  const [outlets, photoboxes, sessions, transactions] = await Promise.all([
    supabase.from("outlets").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("photoboxes").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase.from("sessions").select("id", { count: "exact", head: true }).eq("business_id", businessId),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("business_id", businessId),
  ]);
  return {
    outlets: outlets.count ?? 0,
    photoboxes: photoboxes.count ?? 0,
    sessions: sessions.count ?? 0,
    transactions: transactions.count ?? 0,
  };
}

/**
 * Hapus SEMUA object business dari setiap provider/bucket yang terkonfigurasi
 * (R2 baru + Supabase legacy). Rekursif di bawah prefix `<businessId>/`.
 *
 * Storage-first: dipanggil SEBELUM menghapus baris `businesses` supaya tak ada
 * object tertinggal. Idempotent — object yang sudah absen tak masalah.
 * Mengumpulkan key per-provider lalu satu `remove()` batch per provider.
 * Aman di-log: hanya jumlah key + pesan error (tanpa signed URL/kredensial).
 */
async function purgeBusinessStorage(
  businessId: string
): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;
  for (const provider of activeStorageProviders()) {
    for (const bucket of STORAGE_BUCKETS) {
      const keys: string[] = [];
      const stack: string[] = [businessId];
      let pages = 0;
      while (stack.length > 0 && pages < SWEEP_MAX_PAGES) {
        pages++;
        const dir = stack.pop()!;
        let offset = 0;
        for (;;) {
          const { data, error } = await provider.list(bucket, dir, { limit: 1000, offset });
          if (error) {
            // Listing gagal → tandai gagal; JANGAN lanjut hapus DB agar object
            // tidak tertinggal. Caller menahan deletion & retry.
            console.error(
              `[admin/businesses] list gagal bucket=${bucket} dir=${dir}:`,
              error.message
            );
            throw new ApiError("INTERNAL", "Gagal menyapu storage business");
          }
          const items = data ?? [];
          for (const it of items) {
            if (it.id) keys.push(`${dir}/${it.name}`);
            else stack.push(`${dir}/${it.name}`);
          }
          offset += items.length;
          if (items.length < 1000) break;
        }
      }
      if (keys.length > 0) {
        const { error } = await provider.remove(bucket, keys);
        if (error) {
          console.error(`[admin/businesses] remove gagal bucket=${bucket}:`, error.message);
          failed += keys.length;
        } else {
          removed += keys.length;
        }
      }
    }
  }
  return { removed, failed };
}

/**
 * Hapus business beserta seluruh data terkait (admin). Urutan:
 *  1. Sapu storage (semua provider/bucket) — jangan tinggalkan orphan object.
 *  2. Hapus baris `businesses` → cascade seluruh tabel anak (sessions,
 *     transactions, photos, members, settings, dst.).
 * Bila penyapuan storage gagal (`failed>0`) → batalkan (throw) agar admin
 * bisa retry; baris DB TIDAK dihapus selama object masih ada.
 */
export async function deleteBusiness(businessId: string) {
  const admin = await requireAdmin();
  const supabase = createServerClient();
  const { data: exists } = await supabase
    .from("businesses")
    .select("id, name")
    .eq("id", businessId)
    .maybeSingle();
  if (!exists) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");

  const { removed, failed } = await purgeBusinessStorage(businessId);
  if (failed > 0) {
    throw new ApiError(
      "INTERNAL",
      "Sebagian object storage gagal dihapus. Coba lagi (idempotent)."
    );
  }

  const { error } = await supabase.from("businesses").delete().eq("id", businessId);
  if (error) throw new ApiError("INTERNAL", "Gagal menghapus business");

  await audit(admin.id, "admin.business.delete", businessId, {
    name: (exists as { name: string }).name,
    removedObjects: removed,
  });
  return { id: businessId, removedObjects: removed };
}

export async function updateBusiness(
  businessId: string,
  input: { status: "active" | "suspended" }
) {
  const admin = await requireAdmin();
  const parsed = adminBusinessUpdateSchema.parse(input);
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("businesses")
    .update(parsed)
    .eq("id", businessId)
    .select("id, name, slug, status, created_at")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui business");
  if (!data) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");

  if (parsed.status === "suspended") {
    // Revoke sesi semua member business (owner + staff) — suspend langsung
    // mematikan akses dashboard (docs/09 §10, pola sama dengan updateUser).
    const { data: members } = await supabase
      .from("business_members")
      .select("user_id")
      .eq("business_id", businessId);
    const userIds = (members ?? []).map((m) => m.user_id);
    if (userIds.length > 0) {
      await supabase.from("auth_sessions").delete().in("user_id", userIds);
    }
  }
  await audit(admin.id, "admin.business.update", businessId, { ...parsed }, businessId);
  return data;
}
