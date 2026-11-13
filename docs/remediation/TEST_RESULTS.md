# TEST RESULTS

Tanggal: 2026-11-13. Environment: macOS (darwin), Node >= 22.18, Next 16.4.2.

## Gate yang dijalankan

| Gate | Perintah | Hasil | Bukti |
|---|---|---|---|
| TypeScript | `npm run typecheck` | **PASS** | exit 0 |
| ESLint | `npm run lint` | **PASS** | 0 error, 10 warning `no-img-element` (pre-existing) |
| Unit test | `npm test` | **PASS** | 58/58 |
| Production build | `npm run build` | **PASS** | exit 0, standalone siap |
| E2E Playwright | `npm run test:e2e` | **PASS** | 12/12 (lihat `E2E_EXECUTION_REPORT.md`) |
| `npm audit` | `npm audit --json` | **PASS (critical/high)** | 0 critical, 0 high |
| Migrasi DB | Postgres 16 ephemeral | **PASS** | lihat `DATABASE_MIGRATION_VALIDATION.md` |

## Unit test baru

- `src/lib/auth-tokens.test.ts` — 4 test: bentuk token, expiry/one-time/revoke,
  pencocokan email undangan, isolasi scope staff.
- `src/lib/payment-credentials.test.ts` — 2 test: pemetaan error trigger DB dan
  penolakan credential aktif ke-3.

Total naik dari 52 → **58**.

## Gate yang TIDAK dijalankan

| Gate | Alasan | Status |
|---|---|---|
| E2E alur ber-login Owner/Admin/Staff/Kiosk | Tidak ada kredensial/staging | NOT VERIFIED |
| Pengiriman email undangan/reset nyata | Tidak ada inbox uji | NOT VERIFIED |
| Redis multi-instance | Tidak ada instance Redis | NOT VERIFIED |
| Kamera/printer fisik | Tidak ada perangkat | NOT VERIFIED |
| Migrasi staging/production | Tidak ada akses; production tidak disentuh | NOT VERIFIED |

## Catatan

- Build menghasilkan seluruh route lama + `/invite/[token]`, `/forgot-password`,
  `/reset-password/[token]`.
- Warning lint hanya `@next/next/no-img-element` pada komponen marketing lama.
