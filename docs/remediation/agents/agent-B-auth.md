# Remediation Report — Agent B (Authentication, Authorization & Session Security)

## 1. Scope
AUTH-01, AUTH-02, AUTH-05, AUTH-06, AUTH-07, AUTH-11; verifikasi AUTH-03,
AUTH-04, AUTH-08, AUTH-09, AUTH-17, AUTH-21.

## 2. Findings Verified
- AUTH-01: tidak ada change/reset password.
- AUTH-02: session 30 hari tanpa idle timeout.
- AUTH-05: create business tidak idempotent.
- AUTH-06: hapus staff tidak mencabut session.
- AUTH-07: fallback rate limit in-memory per instance.
- AUTH-11: `AUTH_URL` localhost (`.env.example` sudah https; auth memakai Host).
- AUTH-04/AUTH-08/AUTH-17 sudah tertutup kode.

## 3. Root Cause
Session hanya punya batas absolut; mutasi membership tidak menyentuh
`auth_sessions`; create business tidak punya kunci idempotensi.

## 4. Changes Implemented
- `src/lib/constants.ts`: `SESSION_IDLE_SECONDS` (12 jam) +
  `SESSION_IDLE_REFRESH_MS` (5 menit).
- `src/lib/auth.ts`: klaim `lastSeen`, idle check, throttle update.
- `src/server/business.ts`: idempotensi owner+nama; tangani 23505.
- `src/server/staff.ts`: cabut `auth_sessions` saat staff dihapus (tanpa
  membership tersisa) dan saat role berubah; audit log.
- `src/server/auth-actions.ts`: `changePasswordAction` (verifikasi password
  lama, hash argon2 baru).
- `src/lib/validators.ts`: `changePasswordSchema`.
- `src/components/dashboard/PasswordChangeForm.tsx` + settings page.

## 5. Files Changed
`src/lib/auth.ts`, `src/lib/constants.ts`, `src/lib/validators.ts`,
`src/server/auth-actions.ts`, `src/server/business.ts`, `src/server/staff.ts`,
`src/components/dashboard/PasswordChangeForm.tsx`,
`src/app/(dashboard)/dashboard/settings/page.tsx`.

## 6. Tests Executed
`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## 7. Test Results
PASS semua.

## 8. Before & After
Sebelum: session hidup 30 hari tanpa aktivitas; staff dihapus masih punya
session; double submit membuat dua workspace; tidak ada ganti password.
Sesudah: idle 12 jam; session dicabut; create business idempotent; ganti
password terverifikasi.

## 9. Remaining Issues
- AUTH-01 reset via email belum ada (butuh token + email).
- AUTH-03 undangan staff tanpa token/consent.
- AUTH-07 multi-instance butuh Redis.
- S-001 user multi-role via PIN masih dapat session penuh.
- AUTH-21 CSRF logout belum diuji.

## 10. Risks
Idle timeout dapat mengakhiri sesi kiosk/operator yang lama idle; nilai 12 jam
dipilih konservatif. Revoke session saat role berubah memaksa login ulang.

## 11. Finding Status
AUTH-01 PARTIALLY FIXED; AUTH-02 FIXED; AUTH-05 FIXED; AUTH-06 FIXED;
AUTH-07 PARTIALLY FIXED; AUTH-11 FIXED (already in code); AUTH-03 BLOCKED;
AUTH-04/AUTH-08/AUTH-17 FIXED (already in code).

## 12. Handover
Integration Lead: pastikan `auth_sessions` cleanup cron (AUTH-25) ditambahkan
sebelum production.
