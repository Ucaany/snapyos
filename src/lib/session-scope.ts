/**
 * Aturan scope sesi (S-001). Sesi PIN staff hanya boleh memakai membership
 * staff; ia tidak pernah mewarisi role owner/manager atau admin.
 *
 * Murni (tanpa server-only) supaya invariant ini bisa diuji langsung.
 */

export type SessionScope = "staff" | undefined;

export function membershipVisibleToScope(
  role: "owner" | "manager" | "staff",
  scope: SessionScope
): boolean {
  return scope === "staff" ? role === "staff" : true;
}

export function scopeCanBeAdmin(scope: SessionScope): boolean {
  return scope !== "staff";
}
