/**
 * Admin guard + audit helpers — docs/10 §10.5.
 * Shared across all admin modules.
 */

import "server-only";
import { ApiError } from "@/lib/api-errors";
import { requireUser, type AppUser } from "@/lib/tenant";
import { insertAudit } from "@/server/audit";
import { scopeCanBeAdmin } from "@/lib/session-scope";

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().includes(email.toLowerCase());
}

/**
 * Kontrak admin platform: role DB `admin` ATAU email di allowlist.
 * Dipakai routing pasca-login dan proxy agar keduanya identik.
 */
export function isAdminUser(
  user: { role?: string | null; email?: string | null; scope?: string | null } | null | undefined
): boolean {
  if (!user) return false;
  // Sesi PIN staff tidak pernah menjadi admin, walau akunnya punya role admin.
  if (!scopeCanBeAdmin(user.scope === "staff" ? "staff" : undefined)) return false;
  return user.role === "admin" || isAdminEmail(user.email ?? null);
}

/** Admin API: throw UNAUTHORIZED/FORBIDDEN. */
export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser();
  if (!user) throw new ApiError("UNAUTHORIZED", "Silakan login");
  if (!isAdminUser(user)) {
    throw new ApiError("FORBIDDEN", "Akses khusus admin platform");
  }
  return user;
}

/** Admin page: null → redirect. */
export async function getAdminUser(): Promise<AppUser | null> {
  const user = await requireUser();
  if (!user) return null;
  return isAdminUser(user) ? user : null;
}

export async function audit(
  actorId: string,
  action: string,
  target: string | null,
  meta: Record<string, unknown> = {},
  businessId: string | null = null
) {
  await insertAudit({ actorId, action, target, meta, businessId });
}
