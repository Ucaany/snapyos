# BLOCKER CLOSURE REPORT

Tanggal: 2026-11-13. Basis: kode repository saat ini (bukan status lama).

| Blocker | Status | Bukti | Residual |
|---|---|---|---|
| AUTH-03 undangan staff tanpa token/consent | **FIXED** | `db/migrations/0091_*`, `src/server/auth-tokens.ts`, `src/server/staff.ts`, `src/app/invite/[token]` | Pengiriman email nyata **NOT VERIFIED** (tidak ada inbox uji) |
| AUTH-01 reset password via email | **FIXED** | `src/server/auth-actions.ts`, `src/server/auth-tokens.ts`, `src/lib/auth-emails.ts`, halaman forgot/reset | Pengiriman email nyata **NOT VERIFIED** |
| S-001 PIN staff = full session | **FIXED** | JWT `scope=staff` (`src/lib/auth.ts`), filter membership (`src/lib/tenant.ts`), admin guard, unit test `auth-tokens.test.ts` | E2E login PIN lintas-role **NOT VERIFIED** (butuh kredensial) |
| AUTH-07 rate limit multi-instance | **FIXED** | `src/lib/rate-limit.ts` fail-closed produksi, opt-in fail-open read-only/webhook, health check | Uji 2 instance + Redis nyata **NOT VERIFIED** |
| O-012 race credential aktif | **FIXED** | Trigger + advisory lock migrasi 0091; uji konkurensi Postgres 16 | — |
| AUTH-17 kiosk slug invalid 200 | **FIXED** | Layout gate 404 + manifest validation; E2E lulus | — |
| `npm audit` belum dijalankan | **FIXED** | 0 critical, 0 high, 12 moderate, 2 low | 1 moderate runtime (`exceljs`→`uuid`) dimitigasi |
| Migrasi DB belum diverifikasi | **PARTIALLY FIXED** | Baseline + 0091 + rollback diuji di Postgres 16 ephemeral | Staging/production **NOT VERIFIED** (tidak ada akses) |
| E2E browser seluruh role | **PARTIALLY FIXED** | 12/12 E2E auth/isolation lulus | Alur Owner/Admin/Staff/Kiosk ber-login **NOT VERIFIED** |
| Hardware kamera/printer | **NOT VERIFIED** | Tidak ada perangkat | Wajib uji booth fisik |

## Detail keputusan

- Token disimpan sebagai SHA-256; plaintext hanya di email. Tidak ada password/PIN di email.
- Undangan: expiry 7 hari, sekali pakai, email penerima harus sama, penerima harus menekan
  "Terima undangan". Kuota plan dicek ulang saat accept (atomik via RPC).
- Reset password: expiry 1 jam, sekali pakai, semua `auth_sessions` user dihapus setelah
  password berubah, respons permintaan selalu generik (anti-enumerasi).
- Sesi PIN: `scope=staff` di JWT; `getUserMemberships`/`getMembership` hanya mengembalikan
  membership `staff`; `isAdminUser` menolak scope staff. Owner/manager di business lain
  tidak terlihat dan tidak bisa dipakai lewat sesi PIN.
- Rate limit produksi: tanpa Redis, default **deny** (fail-closed). Hanya endpoint
  read-only/webhook yang eksplisit `failOpen: true`. Health melaporkan `degraded`.
- Credential aktif: trigger DB memakai `pg_advisory_xact_lock` per business; dua request
  paralel tidak bisa menghasilkan credential aktif ketiga.

## Status akhir

**NOT READY** — bukan karena build, tetapi karena bukti runtime eksternal belum ada:
E2E role ber-login, pengiriman email nyata, Redis multi-instance, dan hardware booth.
