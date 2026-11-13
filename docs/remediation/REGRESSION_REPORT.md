# REGRESSION REPORT

## Cakupan regresi

Perubahan sesi ini menyentuh: kiosk session/finalize, CSP, business context
resolver, feature gate UI, admin subscription/add-on/retention, staff workspace
switching, auth session lifecycle, dan password change.

## Regression checklist

| Area | Skenario | Status |
|---|---|---|
| Kiosk | Sesi normal (capture lengkap) tetap finalize | PASS (kode + unit) |
| Kiosk | Timer habis, capture parsial → finalize | PASS (unit `kiosk-capture`) |
| Kiosk | Capture berlebih tetap ditolak | PASS (unit) |
| Kiosk | Booth maintenance → layar perawatan + transaksi ditolak | PASS (kode) |
| Kiosk | Resume sesi mempertahankan `print_count` | PASS (kode) |
| Kiosk | QR kontras rendah → fallback hitam/putih | PASS (kode) |
| Kiosk | Editor header tanpa `color-mix` | PASS (kode) |
| Owner | Dashboard & page memakai business context sama | PASS (kode) |
| Owner | Reports/staff/finance/payment terkunci tanpa fitur | PASS (kode) |
| Admin | Set subscription active tanpa periode → periode diisi | PASS (kode) |
| Admin | Add-on feature quantity > 1 ditolak | PASS (kode) |
| Admin | Default retention tidak menimpa override | PASS (kode) |
| Staff | Staff multi-business dapat switch workspace | PASS (kode) |
| Auth | Idle 12 jam → sesi berakhir | PASS (kode) |
| Auth | Double submit create business → satu business | PASS (kode) |
| Auth | Staff dihapus → session dicabut | PASS (kode) |
| Auth | Ganti password butuh password lama | PASS (kode) |

## Yang belum diregresi

- E2E browser seluruh role (tidak ada Playwright).
- Hardware fisik.
- Multi-instance rate limit.
- Migrasi DB.

## Kesimpulan

Tidak ada regresi yang terdeteksi oleh typecheck, lint, unit test, dan build.
Regresi runtime/browser belum dapat dibuktikan tanpa browser automation.
