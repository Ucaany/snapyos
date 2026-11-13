/**
 * Staff management (RBAC) — docs/04 §4.13, docs/08 §8.11.
 * Entity: business_members (docs/07 §7.2 — staff_roles disederhanakan).
 * ponytail: invite hanya untuk akun SnapyOS yang sudah terdaftar (tidak membuat
 * akun sistem); upgrade ke undangan email + token saat auth flows lengkap.
 */

import "server-only";
import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { getMembership } from "@/lib/tenant";
import { isPlanLimitError, requirePlanLimits } from "@/server/plan-limits";
import { startOfDayTz, todayISO } from "@/lib/dashboard-math";
import { buildStaffDirectory, type StaffDirectoryRow } from "@/lib/staff-directory";
import {
  staffInviteSchema,
  staffPinSchema,
  staffUpdateSchema,
  type StaffInviteInput,
  type StaffUpdateInput,
} from "@/lib/validators";
import { hashDevicePin } from "@/lib/device-token";
import { requireFeature } from "@/server/feature-gate";
import { insertAudit } from "@/server/audit";

async function requireOwner(userId: string, businessId: string) {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  // Kelola staff = owner saja (docs/09: manager tanpa staff/billing/settings).
  if (membership.role !== "owner") {
    throw new ApiError("FORBIDDEN", "Hanya owner yang mengelola staff");
  }
  return membership;
}

async function countOwners(businessId: string): Promise<number> {
  const supabase = createServerClient();
  const { count } = await supabase
    .from("business_members")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("role", "owner");
  return count ?? 0;
}

type MemberRow = {
  user_id: string;
  role: string;
  created_at: string;
  users:
    | { email: string | null; name: string | null }
    | { email: string | null; name: string | null }[]
    | null;
};

/**
 * Daftar photobox_id yang di-assign ke user via member_photoboxes (0018).
 * Return null = tidak dibatasi (owner/manager akses semua booth).
 * Return [] = staff tanpa akses booth sama sekali.
 */
export async function listAssignedPhotoboxIds(
  userId: string,
  businessId: string
): Promise<string[] | null> {
  const membership = await getMembership(userId, businessId);
  if (!membership || membership.role !== "staff") return null;
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("member_photoboxes")
    .select("photobox_id")
    .eq("business_id", businessId)
    .eq("user_id", userId);
  if (error) throw new ApiError("INTERNAL", "Gagal memuat akses booth");
  return (data ?? []).map((row: { photobox_id: string }) => row.photobox_id);
}

/**
 * Direktori staff untuk halaman owner: member + akses booth (member_photoboxes)
 * + transaksi PAID hari ini (zona waktu business) per booth yang di-assign.
 * Transaksi tidak punya kolom aktor, jadi atribusi per staff via booth (0018).
 */
export async function listStaffDirectory(
  userId: string,
  businessId: string,
  timeZone: string,
  photoboxes: { id: string; name: string; status: string }[]
): Promise<{ rows: StaffDirectoryRow[]; totals: { count: number; revenue: number } }> {
  await requireOwner(userId, businessId);
  const supabase = createServerClient();

  const todayStart = startOfDayTz(todayISO(timeZone), timeZone);
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;

  const [memberRes, assignRes, txRes] = await Promise.all([
    supabase
      .from("business_members")
      .select("user_id, role, created_at, users ( email, name )")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true }),
    supabase.from("member_photoboxes").select("user_id, photobox_id").eq("business_id", businessId),
    // Agregat per booth via RPC (migrasi 0037) — tanpa transfer baris tx.
    supabase.rpc("staff_directory_today", {
      p_business: businessId,
      p_start: new Date(todayStart).toISOString(),
      p_end: new Date(todayEnd).toISOString(),
    }),
  ]);
  if (memberRes.error || assignRes.error || txRes.error) {
    throw new ApiError("INTERNAL", "Gagal memuat direktori staff");
  }

  const members = ((memberRes.data ?? []) as unknown as MemberRow[]).flatMap((row) => {
    const user = Array.isArray(row.users) ? row.users[0] : row.users;
    if (!user) return [];
    return [
      {
        userId: row.user_id,
        name: user.name,
        email: user.email,
        role: row.role,
        joinedAt: row.created_at,
      },
    ];
  });

  const todayTx = (
    (txRes.data ?? []) as {
      photobox_id: string;
      revenue: number | string;
      tx_count: number | string;
    }[]
  ).map((r) => ({
    photobox_id: r.photobox_id,
    revenue: Number(r.revenue ?? 0),
    tx_count: Number(r.tx_count ?? 0),
  }));

  return buildStaffDirectory({
    members,
    assignments: (assignRes.data ?? []) as { user_id: string; photobox_id: string }[],
    photoboxes,
    todayTx,
  });
}

/**
 * Ganti seluruh set akses booth seorang member (owner only).
 * Ids harus photobox milik business; array kosong = hapus semua akses.
 * ponytail: delete+insert non-atomic (supabase-js tanpa transaction) —
 * worst case akses kosong sesaat; upgrade ke RPC bila jadi masalah.
 */
export async function setStaffPhotoboxes(
  userId: string,
  businessId: string,
  targetUserId: string,
  photoboxIds: string[]
) {
  await requireOwner(userId, businessId);
  const supabase = createServerClient();

  const { data: member } = await supabase
    .from("business_members")
    .select("id")
    .eq("business_id", businessId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!member) throw new ApiError("NOT_FOUND", "Member tidak ditemukan");

  const ids = [...new Set(photoboxIds)];
  if (ids.length > 0) {
    const { data: owned } = await supabase
      .from("photoboxes")
      .select("id")
      .eq("business_id", businessId)
      .in("id", ids);
    if ((owned ?? []).length !== ids.length) {
      throw new ApiError("VALIDATION_ERROR", "Ada photobox yang bukan milik business ini");
    }
  }

  const { error: delError } = await supabase
    .from("member_photoboxes")
    .delete()
    .eq("business_id", businessId)
    .eq("user_id", targetUserId);
  if (delError) throw new ApiError("INTERNAL", "Gagal menyimpan akses booth");

  if (ids.length > 0) {
    const { error: insError } = await supabase
      .from("member_photoboxes")
      .insert(
        ids.map((photobox_id) => ({ business_id: businessId, user_id: targetUserId, photobox_id }))
      );
    if (insError) throw new ApiError("INTERNAL", "Gagal menyimpan akses booth");
  }
  return { userId: targetUserId, photoboxIds: ids };
}

export async function inviteStaff(userId: string, businessId: string, input: StaffInviteInput) {
  const parsed = staffInviteSchema.parse(input);
  await requireFeature(businessId, "staff");
  await requireOwner(userId, businessId);

  const supabase = createServerClient();

  const { data: target } = await supabase
    .from("users")
    .select("id, email, name")
    .eq("email", parsed.email)
    .maybeSingle();
  if (!target) {
    throw new ApiError(
      "NOT_FOUND",
      "Akun belum terdaftar di SnapyOS. Hubungi admin platform untuk membuatkan akun, lalu coba lagi.",
      {
        email: ["Belum terdaftar"],
      }
    );
  }

  const { data: existing } = await supabase
    .from("business_members")
    .select("id")
    .eq("business_id", businessId)
    .eq("user_id", target.id)
    .maybeSingle();
  if (existing) {
    throw new ApiError("VALIDATION_ERROR", "User sudah menjadi member business ini", {
      email: ["Sudah tergabung"],
    });
  }

  const limits = await requirePlanLimits(businessId);

  // Kuota + insert atomik (0069) — owner tidak dihitung (plan boleh max_staff 0).
  const { data, error } = await supabase.rpc("add_business_member_with_quota", {
    p_business_id: businessId,
    p_max_staff: limits.max_staff,
    p_user_id: target.id,
    p_role: parsed.role,
  });
  if (error) {
    if (isPlanLimitError(error)) {
      throw new ApiError(
        "PLAN_LIMIT_REACHED",
        `Plan Anda dibatasi ${limits.max_staff} anggota manager/staff. Upgrade untuk menambah.`
      );
    }
    throw new ApiError("INTERNAL", "Gagal menambahkan staff");
  }
  const inserted = data as { id: string } | null;
  if (!inserted) throw new ApiError("INTERNAL", "Gagal menambahkan staff");
  await insertAudit({
    actorId: userId,
    businessId,
    action: "staff.invite",
    target: inserted.id,
    meta: { user_id: target.id, role: parsed.role },
  });
  return { id: inserted.id, userId: target.id, email: target.email, role: parsed.role };
}

export async function updateStaffRole(
  userId: string,
  businessId: string,
  targetUserId: string,
  input: StaffUpdateInput
) {
  const parsed = staffUpdateSchema.parse(input);
  await requireOwner(userId, businessId);

  const supabase = createServerClient();
  const { data: member } = await supabase
    .from("business_members")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!member) throw new ApiError("NOT_FOUND", "Member tidak ditemukan");

  // Owner hanya dibuat saat pembuatan business; tidak boleh dipromosikan ke
  // owner lewat aksi ini (anti escalation lewat update role).
  if (parsed.role === "owner") {
    throw new ApiError("VALIDATION_ERROR", "Role owner tidak dapat diubah lewat sini");
  }

  // Tidak boleh kehilangan owner terakhir (docs/09 RBAC).
  const memberRole = (member as { role?: string }).role ?? "";
  if (memberRole === "owner" && (await countOwners(businessId)) <= 1) {
    throw new ApiError("VALIDATION_ERROR", "Business harus punya minimal satu owner");
  }

  const { data, error } = await supabase
    .from("business_members")
    .update({ role: parsed.role })
    .eq("business_id", businessId)
    .eq("user_id", targetUserId)
    .select("id")
    .maybeSingle();
  if (error) throw new ApiError("INTERNAL", "Gagal mengubah role");
  if (!data) throw new ApiError("NOT_FOUND", "Member tidak ditemukan");
  // Privilege berubah → paksa login ulang agar token lama tidak membawa
  // permission lama (AUTH-02/AUTH-06).
  await supabase.from("auth_sessions").delete().eq("user_id", targetUserId);
  await insertAudit({
    actorId: userId,
    businessId,
    action: "staff.role.update",
    target: targetUserId,
    meta: { from: memberRole, to: parsed.role },
  });
  return { userId: targetUserId, role: parsed.role };
}

export async function removeStaff(userId: string, businessId: string, targetUserId: string) {
  await requireOwner(userId, businessId);

  const supabase = createServerClient();
  const { data: member } = await supabase
    .from("business_members")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!member) throw new ApiError("NOT_FOUND", "Member tidak ditemukan");
  if (member.role === "owner" && (await countOwners(businessId)) <= 1) {
    throw new ApiError("VALIDATION_ERROR", "Business harus punya minimal satu owner");
  }

  const { error } = await supabase
    .from("business_members")
    .delete()
    .eq("business_id", businessId)
    .eq("user_id", targetUserId);
  if (error) throw new ApiError("INTERNAL", "Gagal menghapus member");

  // AUTH-06: bila user tidak lagi menjadi member business mana pun, cabut
  // seluruh session DB-nya. Session lama tidak boleh tetap hidup setelah
  // akses dicabut.
  const { count } = await supabase
    .from("business_members")
    .select("id", { count: "exact", head: true })
    .eq("user_id", targetUserId);
  if ((count ?? 0) === 0) {
    await supabase.from("auth_sessions").delete().eq("user_id", targetUserId);
  }
  await insertAudit({
    actorId: userId,
    businessId,
    action: "staff.remove",
    target: targetUserId,
    meta: { role: (member as { role?: string }).role ?? null },
  });
}

/** Owner set PIN login staff untuk (member × booth). pin kosong = hapus PIN. */
export async function setStaffPin(
  userId: string,
  businessId: string,
  targetUserId: string,
  photoboxId: string,
  pin: string
) {
  await requireOwner(userId, businessId);
  const parsed = staffPinSchema.parse({
    user_id: targetUserId,
    photobox_id: photoboxId,
    pin,
  });

  const supabase = createServerClient();
  const { data: assignment, error: assignmentError } = await supabase
    .from("member_photoboxes")
    .select("photobox_id")
    .eq("business_id", businessId)
    .eq("user_id", parsed.user_id)
    .eq("photobox_id", parsed.photobox_id)
    .maybeSingle();
  if (assignmentError) throw new ApiError("INTERNAL", "Gagal memuat akses booth");
  if (!assignment) throw new ApiError("NOT_FOUND", "Booth belum di-assign ke staff ini");

  // PIN hanya untuk akun staff. Manager/owner memakai password; memberi mereka
  // PIN (4-6 digit, dibagikan antar-shift) berarti kredensial tingkat akun
  // dengan assurance jauh lebih rendah.
  const { data: targetMembership } = await supabase
    .from("business_members")
    .select("role")
    .eq("business_id", businessId)
    .eq("user_id", parsed.user_id)
    .maybeSingle();
  if ((targetMembership as { role?: string } | null)?.role !== "staff") {
    throw new ApiError("VALIDATION_ERROR", "PIN hanya bisa diberikan ke akun staff", {
      user_id: ["Pilih akun dengan role staff"],
    });
  }

  const pinHash = pin ? await hashDevicePin(pin) : null;
  const { error } = await supabase
    .from("member_photoboxes")
    .update({ pin_hash: pinHash })
    .eq("business_id", businessId)
    .eq("user_id", parsed.user_id)
    .eq("photobox_id", parsed.photobox_id);
  if (error) throw new ApiError("INTERNAL", "Gagal menyimpan PIN");
  // Jangan pernah mencatat PIN/hash ke audit — hanya fakta set/clear.
  await insertAudit({
    actorId: userId,
    businessId,
    action: "staff.pin.set",
    target: parsed.user_id,
    meta: { photobox_id: parsed.photobox_id, cleared: !pin },
  });
}
