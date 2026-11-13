# E2E EXECUTION REPORT

Tanggal: 2026-11-13. Runner: `@playwright/test` 1.65.0, Chromium, `npm run test:e2e`.
Web server: `npm run dev` (Next 16.4.2) di `http://127.0.0.1:3000`.

## Hasil

**12/12 lulus** (11.0s), 0 gagal.

| Spec | Uji | Hasil |
|---|---|---|
| `e2e/smoke.spec.ts` | Landing hero tampil | PASS |
| `e2e/smoke.spec.ts` | Halaman login tampil | PASS |
| `e2e/auth-isolation.spec.ts` | `/dashboard` tanpa sesi → `/login` | PASS |
| `e2e/auth-isolation.spec.ts` | `/dashboard/staff` tanpa sesi → `/login` | PASS |
| `e2e/auth-isolation.spec.ts` | `/admin` tanpa sesi → `/login` | PASS |
| `e2e/auth-isolation.spec.ts` | `/staff` tanpa sesi → `/login` | PASS |
| `e2e/auth-isolation.spec.ts` | `/pos` tanpa sesi → `/login` | PASS |
| `e2e/auth-isolation.spec.ts` | `GET /api/v1/me/businesses` tanpa sesi → 401 `UNAUTHORIZED` | PASS |
| `e2e/auth-isolation.spec.ts` | Halaman lupa password tampil | PASS |
| `e2e/auth-isolation.spec.ts` | Token reset tidak valid → pesan invalid, tanpa form | PASS |
| `e2e/auth-isolation.spec.ts` | Token undangan tidak valid → ditolak | PASS |
| `e2e/auth-isolation.spec.ts` | Kiosk slug tidak dikenal → **HTTP 404** | PASS |

## Temuan runtime yang diperbaiki

- Kiosk slug invalid sebelumnya **HTTP 200** (body 404) karena `loading.tsx` membuat
  Suspense boundary. Diperbaiki dengan gate `notFound()` di `layout.tsx` (di luar
  boundary) dan validasi `manifest.webmanifest`. E2E sekarang membuktikan 404.
- Manifest kiosk sebelumnya selalu 200 untuk slug apa pun; sekarang 404.

## Yang TIDAK dijalankan

Alur ber-login Owner/Admin/Staff/Kiosk (dashboard, subscription, feature gate,
payment credential, reports, staff management, PIN login, workspace switching,
booth assignment, kiosk payment/capture/print) **NOT VERIFIED**:

- Tidak ada kredensial uji yang diberikan.
- Tidak ada staging database; membuat user/business di `.env.local` berisiko
  menyentuh database yang bukan milik sesi ini.

Spec ber-login sengaja tidak ditulis sebagai "pass palsu". Untuk menutup blocker ini,
sediakan `E2E_OWNER_EMAIL/PASSWORD`, `E2E_ADMIN_EMAIL/PASSWORD`,
`E2E_STAFF_EMAIL/PIN`, dan URL kiosk staging, lalu jalankan alur tersebut.

## Artefak

- `test-results/` (hanya kegagalan; run terakhir tidak ada).
- `playwright-report/` bila reporter HTML diaktifkan.
- Console/network failure: tidak ada uncaught error pada 12 uji. Log server memuat
  401 yang memang diharapkan dari uji `/admin` tanpa sesi.
