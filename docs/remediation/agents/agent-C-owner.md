# Remediation Report — Agent C (Owner Dashboard, Subscription & Business Logic)

## 1. Scope
O-001, O-010, O-011, O-013, O-015, O-018; verifikasi O-002, O-003, O-005,
O-012.

## 2. Findings Verified
- O-001: layout dashboard memakai `getActiveBusinessForRoles(["owner","manager"])`
  tetapi 24 page memakai `getActiveBusiness` (semua role) → context bisa beda
  untuk user multi-role.
- O-010/O-011/O-013/O-015: gate fitur hanya di server action/API, UI tidak
  menjelaskan.
- O-018: profil/settings bisa diedit saat subscription expired.

## 3. Root Cause
Dua resolver context berbeda; gate plan tidak konsisten antara UI dan server.

## 4. Changes Implemented
- Codemod 25 file dashboard: `getActiveBusinessForRoles(user.id, ["owner","manager"])`.
- Reports: inline `hasFeature("reports")` + `FeatureLockedPanel`.
- Staff: inline `hasFeature("staff")`.
- Finance: inline `hasFeature("finance")`.
- Payment: inline `hasFeature("direct_payment")` sebelum memuat credential.
- `updateBusiness`/`updateSettings`: `requirePlanLimits` (O-018).

## 5. Files Changed
25 file `src/app/(dashboard)/**`, `src/server/business.ts`.

## 6. Tests Executed
`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## 7. Test Results
PASS semua.

## 8. Before & After
Sebelum: user staff di A + owner di B bisa melihat data A di shell owner;
halaman berbayar terbuka tanpa penjelasan; profil bisa diedit saat expired.
Sesudah: context konsisten; gate inline; mutasi diblokir saat expired.

## 9. Remaining Issues
- O-002 label subscription belum diubah.
- O-005/K-011 voucher per-customer butuh identitas.
- O-012 race credential aktif butuh constraint DB.
- O-003 read-only fallback Starter dipertahankan (intentional).

## 10. Risks
Codemod mengubah 25 file; sudah diverifikasi typecheck/build. Page dashboard
yang membutuhkan role staff tidak ada (shell staff terpisah).

## 11. Finding Status
O-001 FIXED; O-010 FIXED; O-011 FIXED; O-013 FIXED; O-015 FIXED; O-018 FIXED;
O-002 NOT VERIFIED; O-003 NOT APPLICABLE; O-005 BLOCKED; O-012 NOT VERIFIED.

## 12. Handover
Integration Lead: pastikan tidak ada page dashboard baru yang memakai
`getActiveBusiness` tanpa roles.
