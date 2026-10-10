/**
 * Admin guard + audit helpers — docs/10 §10.5.
 * Shared across all admin modules.
 */

import "server-only";
import { ApiError } from "@/lib/api-errors";
import { requireUser, type AppUser } from "@/lib/tenant";
import { insertAudit } from "@/server/audit";

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allow.includes(email.toLowerCase());
}

/** Admin API: throw UNAUTHORIZED/FORBIDDEN. */
export async function requireAdmin(): Promise<AppUser> {
  const user = await requireUser();
  if (!user) throw new ApiError("UNAUTHORIZED", "Silakan login");
  if (user.role !== "admin" && !isAdminEmail(user.email)) {
    throw new ApiError("FORBIDDEN", "Akses khusus admin platform");
  }
  return user;
}

/** Admin page: null → redirect. */
export async function getAdminUser(): Promise<AppUser | null> {
  const user = await requireUser();
  if (!user) return null;
  return user.role === "admin" || isAdminEmail(user.email) ? user : null;
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
