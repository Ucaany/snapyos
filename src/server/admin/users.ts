/**
 * Admin Users — docs/10 §10.2 (data layer).
 */

import "server-only";
import { hash } from "@node-rs/argon2";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import {
  adminUserCreateSchema,
  adminUserUpdateSchema,
  type AdminUserCreateInput,
  type AdminUserUpdateInput,
} from "@/lib/validators";
import { requireAdmin, audit } from "./guard";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  role: "user" | "admin";
  status: "active" | "suspended";
  created_at: string;
  whatsapp: string | null;
  acquisition_source: string | null;
  planned_devices: number | null;
  signup_ip: string | null;
  signup_user_agent: string | null;
  email_verified: string | null;
};

export type AdminUserWithBusiness = AdminUserRow & {
  businesses: { id: string; name: string; slug: string }[];
};

const ADMIN_USER_COLUMNS =
  "id, email, email_verified, name, role, status, created_at, whatsapp, acquisition_source, planned_devices, signup_ip, signup_user_agent";

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export type AdminUserListResult = {
  items: AdminUserWithBusiness[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

/**
 * True bila error PostgREST menandakan offset melewati jumlah baris
 * (PGRST103 / HTTP 416 "Requested range not satisfiable"). Ini bukan kegagalan
 * server — halaman kosong adalah hasil yang benar (mis. deep-link / bookmark).
 */
function isRangeNotSatisfiable(error: { code?: string; message?: string }): boolean {
  if (String(error.code ?? "") === "PGRST103") return true;
  return /requested range not satisfiable|range not satisfiable/i.test(String(error.message ?? ""));
}

export async function listUsers(query: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<AdminUserListResult> {
  await requireAdmin();
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));

  const supabase = createServerClient();
  const searchLike = query.search ? `%${query.search.replace(/[%_]/g, "")}%` : null;
  let req = supabase
    .from("users")
    .select(ADMIN_USER_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (searchLike) {
    req = req.or(`email.ilike.${searchLike},name.ilike.${searchLike}`);
  }
  let { data, error, count } = await req;

  // Halaman melampaui jumlah baris → offset tak terjangkau (PGRST103/416).
  // Kembalikan daftar kosong + total sebenarnya, bukan 500.
  if (error && isRangeNotSatisfiable(error)) {
    data = [];
    error = null;
    let countReq = supabase.from("users").select("id", { count: "exact", head: true });
    if (searchLike) {
      countReq = countReq.or(`email.ilike.${searchLike},name.ilike.${searchLike}`);
    }
    const recount = await countReq;
    count = recount.count ?? 0;
  }
  if (error) throw new ApiError("INTERNAL", "Gagal memuat users");

  // Batch business owner (anti N+1) — satu query untuk seluruh halaman.
  const rows = (data ?? []) as AdminUserRow[];
  const ids = rows.map((r) => r.id);
  const businessesByOwner = new Map<string, { id: string; name: string; slug: string }[]>();
  if (ids.length > 0) {
    const { data: biz } = await supabase
      .from("businesses")
      .select("id, owner_id, name, slug")
      .in("owner_id", ids)
      .order("created_at", { ascending: false });
    for (const b of (biz ?? []) as { id: string; owner_id: string; name: string; slug: string }[]) {
      const list = businessesByOwner.get(b.owner_id) ?? [];
      list.push({ id: b.id, name: b.name, slug: b.slug });
      businessesByOwner.set(b.owner_id, list);
    }
  }

  const items = rows.map((r) => ({
    ...r,
    businesses: businessesByOwner.get(r.id) ?? [],
  }));
  const total = count ?? 0;
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

// ---------------------------------------------------------------------------
// User detail + riwayat (invoices, transaksi, payment) — docs/10 §10.2
// ---------------------------------------------------------------------------

export type UserDetailBusiness = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan_name: string | null;
  subscription_status: string | null;
};

export type UserDetailInvoice = {
  id: string;
  number: string;
  amount: number;
  status: string;
  paid_at: string | null;
  business_name: string;
  created_at: string;
};

export type UserDetailTransaction = {
  id: string;
  number: string;
  final_amount: number;
  status: string;
  paid_at: string | null;
  business_name: string;
  created_at: string;
};

export type UserDetail = {
  user: AdminUserRow;
  businesses: UserDetailBusiness[];
  invoices: UserDetailInvoice[];
  transactions: UserDetailTransaction[];
  sessions: number;
  payments: number;
};

export async function getUserDetail(userId: string): Promise<UserDetail> {
  await requireAdmin();
  const supabase = createServerClient();

  const { data: user } = await supabase
    .from("users")
    .select(ADMIN_USER_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (!user) throw new ApiError("NOT_FOUND", "User tidak ditemukan");

  const { data: biz } = await supabase
    .from("businesses")
    .select("id, name, slug, status, subscriptions ( status, plans ( name ) )")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  type BizRow = {
    id: string;
    name: string;
    slug: string;
    status: string;
    subscriptions:
      | { status: string; plans: { name: string } | { name: string }[] | null }[]
      | { status: string; plans: { name: string } | { name: string }[] | null }
      | null;
  };
  const bizRows = (biz ?? []) as unknown as BizRow[];
  const bizIds = bizRows.map((b) => b.id);

  const businesses: UserDetailBusiness[] = bizRows.map((b) => {
    const subs = Array.isArray(b.subscriptions)
      ? b.subscriptions
      : [b.subscriptions].filter(Boolean);
    const latest = subs[0];
    const plan = latest && !Array.isArray(latest.plans) ? latest.plans : null;
    return {
      id: b.id,
      name: b.name,
      slug: b.slug,
      status: b.status,
      plan_name: plan?.name ?? null,
      subscription_status: latest?.status ?? null,
    };
  });

  const [invoices, transactions, sessions, payments] = await Promise.all([
    bizIds.length
      ? supabase
          .from("invoices")
          .select(
            "id, number, amount, status, paid_at, business_id, created_at, businesses ( name )"
          )
          .in("business_id", bizIds)
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as unknown[] }),
    bizIds.length
      ? supabase
          .from("transactions")
          .select(
            "id, number, final_amount, status, paid_at, business_id, created_at, businesses ( name )"
          )
          .in("business_id", bizIds)
          .order("created_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] as unknown[] }),
    bizIds.length
      ? supabase
          .from("sessions")
          .select("id", { count: "exact", head: true })
          .in("business_id", bizIds)
      : Promise.resolve({ count: 0 }),
    bizIds.length
      ? supabase
          .from("payments")
          .select("id", { count: "exact", head: true })
          .in("business_id", bizIds)
      : Promise.resolve({ count: 0 }),
  ]);

  type InvoiceRow = {
    id: string;
    number: string;
    amount: number;
    status: string;
    paid_at: string | null;
    business_id: string;
    created_at: string;
    businesses: { name: string } | { name: string }[] | null;
  };
  type TxRow = {
    id: string;
    number: string;
    final_amount: number;
    status: string;
    paid_at: string | null;
    business_id: string;
    created_at: string;
    businesses: { name: string } | { name: string }[] | null;
  };

  return {
    user: user as AdminUserRow,
    businesses,
    invoices: ((invoices.data ?? []) as unknown as InvoiceRow[]).map((i) => ({
      id: i.id,
      number: i.number,
      amount: i.amount,
      status: i.status,
      paid_at: i.paid_at,
      business_name: (Array.isArray(i.businesses) ? i.businesses[0] : i.businesses)?.name ?? "-",
      created_at: i.created_at,
    })),
    transactions: ((transactions.data ?? []) as unknown as TxRow[]).map((t) => ({
      id: t.id,
      number: t.number,
      final_amount: t.final_amount,
      status: t.status,
      paid_at: t.paid_at,
      business_name: (Array.isArray(t.businesses) ? t.businesses[0] : t.businesses)?.name ?? "-",
      created_at: t.created_at,
    })),
    sessions: sessions.count ?? 0,
    payments: payments.count ?? 0,
  };
}

export async function updateUser(userId: string, input: AdminUserUpdateInput) {
  const admin = await requireAdmin();
  const parsed = adminUserUpdateSchema.parse(input);
  if (userId === admin.id && (parsed.status === "suspended" || parsed.role === "user")) {
    throw new ApiError("VALIDATION_ERROR", "Tidak bisa menurunkan/mensuspend akun sendiri");
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("users")
    .update(parsed)
    .eq("id", userId)
    .select("id, email, name, role, status, created_at")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal memperbarui user");
  if (!data) throw new ApiError("NOT_FOUND", "User tidak ditemukan");

  if (parsed.status === "suspended") {
    // Revoke semua sesi aktif — suspend langsung mematikan akses (docs/09 §10).
    await supabase.from("auth_sessions").delete().eq("user_id", userId);
  }
  await audit(admin.id, "admin.user.update", userId, { ...parsed });
  return data as AdminUserRow;
}

/**
 * Admin CEO membuat user langsung — pendaftaran mandiri publik ditutup.
 * Password argon2id (params default @node-rs/argon2, sama dengan registerUser).
 */
export async function createUser(input: AdminUserCreateInput): Promise<AdminUserRow> {
  const admin = await requireAdmin();
  const parsed = adminUserCreateSchema.parse(input);
  const passwordHash = await hash(parsed.password);

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("users")
    .insert({
      email: parsed.email,
      name: parsed.name,
      password_hash: passwordHash,
      role: parsed.role,
      acquisition_source: "admin",
    })
    .select(ADMIN_USER_COLUMNS)
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new ApiError("VALIDATION_ERROR", "Email sudah terdaftar", {
        email: ["Email sudah terdaftar"],
      });
    }
    throw new ApiError("INTERNAL", "Gagal membuat user");
  }
  await audit(admin.id, "admin.user.create", data.id, { email: parsed.email, role: parsed.role });
  return data as AdminUserRow;
}

/**
 * Hapus user permanen. FK restrict (businesses.owner_id)
 * menolak user yang masih terkait — audit trail finansial tidak boleh yatim.
 */
export async function deleteUser(userId: string) {
  const admin = await requireAdmin();
  if (userId === admin.id) {
    throw new ApiError("VALIDATION_ERROR", "Tidak bisa menghapus akun sendiri");
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("users")
    .delete()
    .eq("id", userId)
    .select("id, email")
    .maybeSingle();
  if (error) {
    if (error.code === "23503") {
      throw new ApiError(
        "VALIDATION_ERROR",
        "User masih terkait data (owner business): suspend sebagai gantinya, atau hapus/pindahkan business-nya dulu"
      );
    }
    throw new ApiError("INTERNAL", "Gagal menghapus user");
  }
  if (!data) throw new ApiError("NOT_FOUND", "User tidak ditemukan");
  await audit(admin.id, "admin.user.delete", userId, { email: data.email });
  return data;
}
