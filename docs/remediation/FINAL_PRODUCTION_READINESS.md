# FINAL PRODUCTION READINESS

Status akhir: **NOT READY**.

Alasan: masih ada critical/high yang belum selesai atau belum diverifikasi di
environment ini, dan validasi hardware/E2E belum dijalankan.

## Yang sudah siap

- P0 kiosk: CSP `media-src`, sesi paid tidak stuck saat capture parsial,
  status maintenance ditegakkan backend + UI, `print_count` bertahan saat
  resume, fallback `color-mix`, QR kontras aman.
- Owner: business context konsisten, feature gate inline (reports/staff/
  finance/payment).
- Admin: subscription active selalu punya periode, add-on feature quantity
  divalidasi, retention default tidak menimpa override, MRR/fee memakai periode
  efektif, broadcast stats di-guard.
- Staff: workspace switching, audit log mutasi staff.
- Auth: idle timeout, workspace creation idempotent, session dicabut saat staff
  dihapus/role berubah, change password terautentikasi.
- Gate: typecheck PASS, lint PASS (0 error), unit test 52/52 PASS, build PASS.

## Blocker menuju READY

| Blocker | Dampak | Tindakan |
|---|---|---|
| E2E browser seluruh role belum dijalankan | Tidak ada bukti runtime UI | Jalankan Playwright/staging E2E |
| Hardware kamera/printer belum divalidasi | Cetak/capture bisa gagal di booth | Jalankan `HARDWARE_VALIDATION.md` |
| AUTH-03 undangan staff tanpa token/consent | Akses bisa diberikan tanpa persetujuan | Desain token + expiry |
| AUTH-01 reset password via email belum ada | User lupa password tidak bisa pulih | Token reset + email |
| S-001 user multi-role via PIN | Potensi session penuh dari PIN | Session ber-scope staff |
| AUTH-07 rate limit multi-instance | Limit berlipat tanpa Redis | Wajibkan Redis produksi |
| O-012 race credential aktif | Bisa > 2 aktif | Constraint DB/transaksi |
| `npm audit` belum dijalankan | Advisory unknown | Jalankan di CI |
| Migrasi DB belum diverifikasi | Risiko schema drift | Jalankan migrasi staging |

## Syarat untuk mengubah status

1. Semua critical/high FIXED atau punya mitigasi tertulis.
2. E2E staging untuk Owner/Admin/Staff/Kiosk lulus.
3. Hardware tervalidasi di minimal satu booth.
4. `npm audit` tanpa critical.
5. Security review final (Strix/OWASP) tanpa temuan high terbuka.

## Catatan

Status ini sengaja konservatif. Tidak ada klaim READY untuk komponen yang hanya
diinspeksi statis.
