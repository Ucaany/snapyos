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

/**
 * Sesi PIN staff terikat ke SATU business: business tempat PIN itu diterbitkan
 * (klaim `pinBusiness`). Tanpa pemeriksaan ini, PIN yang dibuat owner A untuk
 * staff yang juga bekerja di business B memberi akses ke workspace B, karena
 * filter scope hanya berbasis role.
 *
 * Fail-closed: sesi staff tanpa klaim `pinBusiness` (token lama) tidak diberi
 * akses ke business mana pun dan harus login ulang.
 */
export function staffScopeAllowsBusiness(
  staffScoped: boolean,
  pinBusiness: string | undefined,
  businessId: string
): boolean {
  if (!staffScoped) return true;
  return Boolean(pinBusiness) && pinBusiness === businessId;
}