# FINAL PRODUCTION READINESS

Status akhir: **NOT READY**.

Alasan: seluruh blocker kode yang dapat dikerjakan di environment ini sudah ditutup,
tetapi bukti runtime eksternal yang diwajibkan belum ada. Status READY tidak diberikan
hanya karena build/lint/test lulus.

## Yang sudah siap (diverifikasi)

- **AUTH-03** undangan staff: token 7 hari, SHA-256, sekali pakai, consent penerima,
  email harus cocok, kuota dicek saat accept.
- **AUTH-01** reset password: token 1 jam, sekali pakai, anti-enumerasi, semua sesi
  dicabut setelah password berubah.
- **S-001** sesi PIN staff: `scope=staff`, membership difilter, admin ditolak,
  `getMembership` fail-closed.
- **AUTH-07** rate limit: produksi fail-closed tanpa Redis; read-only/webhook opt-in
  fail-open; health check `degraded`; log tanpa secret.
- **O-012** maksimal 2 credential aktif: trigger DB + advisory lock; uji konkurensi.
- **AUTH-17** kiosk slug invalid: HTTP 404 (E2E).
- **DB baseline** `schema.sql` kini dapat dijalankan dari nol (dua bug ordering
  pre-existing diperbaiki).
- Gate: typecheck PASS, lint PASS (0 error), unit 58/58 PASS, build PASS,
  E2E 12/12 PASS, `npm audit` 0 critical/high.

## Blocker menuju READY

| Blocker | Dampak | Tindakan |
|---|---|---|
| E2E alur ber-login Owner/Admin/Staff/Kiosk belum dijalankan | Tidak ada bukti runtime UI/otorisasi ber-login | Sediakan kredensial staging, jalankan alur penuh |
| Pengiriman email undangan/reset belum diuji ke inbox | Undangan/reset bisa gagal terkirim | Kirim ke inbox uji, cek Resend log |
| Redis multi-instance belum diuji | Konsistensi limit lintas instance belum terbukti | Jalankan 2 instance + Redis, uji limit |
| Hardware kamera/printer belum divalidasi | Cetak/capture bisa gagal di booth | Jalankan `HARDWARE_VALIDATION.md` |
| Migrasi staging/production belum dijalankan | Risiko drift/operasional | Backup, apply 0091 di staging, verifikasi |

## Syarat untuk mengubah status

1. Semua critical/high FIXED atau punya mitigasi tertulis. **Terpenuhi di kode.**
2. E2E staging Owner/Admin/Staff/Kiosk lulus. **Belum.**
3. Hardware tervalidasi di minimal satu booth. **Belum.**
4. `npm audit` tanpa critical. **Terpenuhi.**
5. Security review final tanpa high terbuka. **Terpenuhi di kode.**
6. Email auth terkirim nyata. **Belum.**
7. Redis multi-instance terbukti. **Belum.**

## Catatan

Status ini sengaja konservatif. Tidak ada klaim READY untuk komponen yang hanya
diinspeksi statis atau diuji dengan mock.
