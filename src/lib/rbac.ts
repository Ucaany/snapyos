/**
 * RBAC matrix — docs/09-security-storage.md.
 * Enforcement penuh di Phase 9; Phase 1 memakai business:read/update.
 * Cross-tenant selalu 404 (bukan 403) — docs/03 §3.5.
 */

export type BusinessRole = "owner" | "manager" | "staff";

export const PERMISSIONS: Record<BusinessRole, readonly string[]> = {
  // Wildcard = semua permission incl. yang owner-only di bawah.
  // String owner-only dicantumkan eksplisit agar typo-test
  // (semua can() harus terdaftar) tetap berlaku + intent terdokumentasi.
  owner: [
    "*",
    "expense:write",
    "subscription:write",
    "transaction:manual-create",
  ],
  manager: [
    "business:read",
    "business:update",
    "outlet:read",
    "outlet:write",
    "photobox:read",
    "photobox:write",
    "transaction:read",
    "transaction:write",
    // Konfirmasi pembayaran tunai kiosk (bayar di kasir) — operasional kasir.
    "payment:confirm",
    // Catat manual = owner-only (keputusan #6: uang manual non-withdrawable).
    "finance:read",
    "expense:read",
    "package:read",
    "package:write",
    "template:read",
    "template:write",
    "voucher:read",
    "voucher:write",
    "customer:read",
    "staff:read",
    "report:read",
    "subscription:read",
    // POS add-on — docs/pos/01 §6 (tanpa role baru).
    "pos:manage",
    "pos:sell",
    "pos:read",
  ],
  staff: [
    "business:read",
    "outlet:read",
    "photobox:read",
    "package:read",
    "template:read",
    // POS add-on — kasir (docs/pos/01 §6 A6).
    "pos:sell",
    "pos:read",
    // Konfirmasi pembayaran tunai kiosk (bayar di kasir).
    "payment:confirm",
  ],
};

export function can(role: BusinessRole, permission: string): boolean {
  const perms = PERMISSIONS[role];
  return perms.includes("*") || perms.includes(permission);
}
