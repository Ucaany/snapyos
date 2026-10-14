/**
 * Server queries shell /staff — operasional booth, bukan finansial.
 * Dokumen: docs/04 §4.6 (photobox), docs/04 RBAC §4.13.
 * Hanya permission yang staff miliki: business:read, outlet:read,
 * photobox:read, package:read, template:read (docs/09).
 * Letak terpisah dari staff management (src/server/staff.ts) yang meng-handle
 * CRUD anggota tim dengan role owner/manager/staff.
 */

import "server-only";

import { createServerClient } from "@/lib/supabase/server";
import { ApiError } from "@/lib/api-errors";
import { can, type BusinessRole } from "@/lib/rbac";
import { getMembership } from "@/lib/tenant";
import { todayISO, startOfDayTz } from "@/lib/dashboard-math";
import { listAssignedPhotoboxIds } from "@/server/staff";

export type BoothStatus = "online" | "offline" | "maintenance";

export type ActiveSessionRow = {
  id: string;
  photobox_id: string;
  photobox_name: string;
  outlet_name: string | null;
  package_name: string | null;
  started_at: string;
  expires_at: string | null;
};

export type StaffOverview = {
  businessId: string;
  businessName: string;
  businessSlug: string;
  timeZone: string;
  role: BusinessRole;
  boothCounts: { online: number; offline: number; maintenance: number; total: number };
  activeSessions: ActiveSessionRow[];
  todayCount: number;
  packageCount: number;
  templateCount: number;
  outletCount: number;
  /** Server-side timestamp (epoch ms) — dipakai render untuk elapsed timer. */
  nowMs: number;
};

/** Membership + business:read (staff termasuk). */
async function assertStaffMembership(userId: string, businessId: string) {
  const membership = await getMembership(userId, businessId);
  if (!membership) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  if (!can(membership.role, "business:read")) {
    throw new ApiError("FORBIDDEN", "Tidak punya akses ke business ini");
  }
  return membership;
}

export async function getStaffOverview(userId: string, businessId: string): Promise<StaffOverview> {
  const membership = await assertStaffMembership(userId, businessId);
  const supabase = createServerClient();

  // Akses booth per member (0018): staff hanya melihat booth yang di-assign
  // owner; owner/manager melihat semua.
  const restrictTo =
    membership.role === "staff"
      ? ((await listAssignedPhotoboxIds(userId, businessId)) ?? [])
      : null;
  const hasBoothAccess = restrictTo === null || restrictTo.length > 0;
  // .in() dengan array kosong tidak aman di PostgREST — skip query saat tanpa akses.
  const empty = Promise.resolve({ data: null, error: null, count: null });

  const { data: business } = await supabase
    .from("businesses")
    .select("id, name, slug, timezone")
    .eq("id", businessId)
    .maybeSingle();
  if (!business) throw new ApiError("NOT_FOUND", "Business tidak ditemukan");
  const timeZone = business.timezone || "Asia/Jakarta";
  const todayKey = todayISO(timeZone);
  const todayStart = startOfDayTz(todayKey, timeZone);
  const todayEnd = todayStart + 24 * 60 * 60 * 1000;

  const [boothRes, activeRes, todayCountRes, outletCountRes, packageCountRes, templateCountRes] =
    await Promise.all([
      !hasBoothAccess
        ? empty
        : (() => {
            let req = supabase
              .from("photoboxes")
              .select("id, name, slug, status, outlet_id, outlets ( name )")
              .eq("business_id", businessId);
            if (restrictTo) req = req.in("id", restrictTo);
            return req;
          })(),
      !hasBoothAccess
        ? empty
        : (() => {
            let req = supabase
              .from("sessions")
              .select(
                "id, photobox_id, started_at, expires_at, photoboxes ( name, outlet_id, outlets ( name ) ), packages ( name )"
              )
              .eq("business_id", businessId)
              .eq("status", "active");
            if (restrictTo) req = req.in("photobox_id", restrictTo);
            return req.order("started_at", { ascending: false }).limit(20);
          })(),
      !hasBoothAccess
        ? empty
        : (() => {
            let req = supabase
              .from("sessions")
              .select("id", { count: "exact", head: true })
              .eq("business_id", businessId)
              .gte("started_at", new Date(todayStart).toISOString())
              .lt("started_at", new Date(todayEnd).toISOString());
            if (restrictTo) req = req.in("photobox_id", restrictTo);
            return req;
          })(),
      restrictTo
        ? empty
        : supabase
            .from("outlets")
            .select("id", { count: "exact", head: true })
            .eq("business_id", businessId),
      supabase
        .from("packages")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId),
      // Kartu overview berlabel "Frame aktif" dan halaman /staff/templates
      // read-only hanya menampilkan `is_active`, jadi hitungannya disamakan.
      supabase
        .from("templates")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("is_active", true),
    ]);

  type PhotoboxListRow = {
    id: string;
    name: string;
    slug: string;
    status: string;
    outlet_id: string;
    outlets: { name: string } | { name: string }[] | null;
  };
  const boothRows = ((boothRes.data ?? []) as unknown as PhotoboxListRow[]);
  const counts = { online: 0, offline: 0, maintenance: 0, total: boothRows.length };
  for (const row of boothRows) {
    if (row.status === "online") counts.online += 1;
    else if (row.status === "offline") counts.offline += 1;
    else counts.maintenance += 1;
  }
  // Outlet yang relevan = outlet dari booth yang bisa diakses (0018).
  const outletCount = restrictTo
    ? new Set(boothRows.map((row) => row.outlet_id)).size
    : outletCountRes.count ?? 0;

  type SessionRow = {
    id: string;
    photobox_id: string;
    started_at: string;
    expires_at: string | null;
    photoboxes:
      | { name: string; outlet_id: string; outlets: { name: string } | { name: string }[] | null }
      | { name: string; outlet_id: string; outlets: { name: string } | { name: string }[] | null }[]
      | null;
    packages: { name: string } | { name: string }[] | null;
  };
  const activeRows = ((activeRes.data ?? []) as unknown as SessionRow[]).map((row) => {
    const photobox = Array.isArray(row.photoboxes) ? row.photoboxes[0] : row.photoboxes;
    const outlets = photobox?.outlets;
    const outletName = Array.isArray(outlets) ? outlets[0]?.name ?? null : outlets?.name ?? null;
    return {
      id: row.id,
      photobox_id: row.photobox_id,
      photobox_name: photobox?.name ?? "-",
      outlet_name: outletName,
      package_name: Array.isArray(row.packages)
        ? row.packages[0]?.name ?? null
        : row.packages?.name ?? null,
      started_at: row.started_at,
      expires_at: row.expires_at,
    } satisfies ActiveSessionRow;
  });

  return {
    businessId,
    businessName: business.name,
    businessSlug: business.slug,
    timeZone,
    role: membership.role,
    boothCounts: counts,
    activeSessions: activeRows,
    todayCount: hasBoothAccess ? (todayCountRes.count ?? 0) : 0,
    packageCount: packageCountRes.count ?? 0,
    templateCount: templateCountRes.count ?? 0,
    outletCount,
    nowMs: Date.now(),
  };
}
