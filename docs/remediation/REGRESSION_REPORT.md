# REGRESSION REPORT

Tanggal: 2026-11-13.

## Cakupan regresi sesi ini

Perubahan menyentuh: token undangan/reset, email auth, scope sesi PIN, rate limit
produksi, trigger credential, gate 404 kiosk, dan baseline `schema.sql`.

## Regression checklist

| Area | Skenario | Status |
|---|---|---|
| Auth | Login password tetap berfungsi (typecheck/build + smoke login page) | PASS (kode) |
| Auth | Login PIN tetap membuat sesi, kini ber-scope staff | PASS (kode) |
| Auth | Change password terautentikasi tidak berubah | PASS (kode) |
| Auth | Reset password: token sekali pakai, sesi lama dicabut | PASS (kode + DB) |
| Auth | Permintaan reset untuk email tak dikenal tetap generik | PASS (kode) |
| Staff | Undangan tidak langsung memberi membership | PASS (kode + DB) |
| Staff | Accept undangan menghormati kuota plan | PASS (kode) |
| Staff | Owner/manager tidak bisa diberi PIN | PASS (kode lama) |
| Staff | Sesi PIN tidak melihat membership owner/manager | PASS (unit test) |
| Staff | Sesi PIN ditolak admin guard | PASS (unit test + kode) |
| Rate limit | Login/checkout fail-closed tanpa Redis di production | PASS (kode) |
| Rate limit | Webhook/read-only tetap jalan saat Redis outage | PASS (kode) |
| Payment | Maksimal 2 credential aktif | PASS (DB concurrency) |
| Payment | Credential lama tidak hilang saat aktivasi ditolak | PASS (DB) |
| Kiosk | Slug valid tetap render (build + layout cache) | PASS (kode) |
| Kiosk | Slug invalid → 404 | PASS (E2E) |
| Kiosk | Manifest booth valid tetap 200 | PASS (kode) |
| DB | `schema.sql` dari nol | PASS (Postgres 16) |
| DB | Rollback 0091 | PASS |

## Yang belum diregresi

- E2E alur ber-login seluruh role.
- Hardware fisik.
- Redis multi-instance.
- Migrasi staging/production.

## Kesimpulan

Tidak ada regresi yang terdeteksi oleh typecheck, lint, 58 unit test, build, 12 E2E,
audit dependency, dan validasi DB ephemeral. Regresi runtime ber-login dan hardware
belum dapat dibuktikan tanpa environment tersebut.
