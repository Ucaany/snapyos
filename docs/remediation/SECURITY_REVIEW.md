# SECURITY REVIEW

Tanggal: 2026-11-13. Fokus: blocker yang ditutup sesi ini + regresi kontrol lama.

## Kontrol yang diverifikasi

| Kontrol | Status | Bukti |
|---|---|---|
| Undangan staff berbasis token | PASS (kode + DB) | SHA-256, expiry 7 hari, sekali pakai, email harus cocok, consent eksplisit |
| Undangan tidak bisa dipakai dua kali | PASS (DB) | `accepted_at` diklaim atomik; unique pending index |
| Reset password sekali pakai | PASS (kode + DB) | `used_at` diklaim atomik; expiry 1 jam |
| Reset tidak membocorkan akun | PASS | Respons permintaan selalu generik |
| Password tidak dikirim via email | PASS | Email hanya berisi tautan token |
| Sesi lama dicabut setelah reset | PASS | `auth_sessions` dihapus untuk user |
| PIN staff tidak menghasilkan session penuh | PASS (kode) | JWT `scope=staff`; membership difilter; admin guard menolak |
| Privilege escalation via PIN | PASS (kode) | `getMembership` fail-closed untuk role non-staff pada scope staff |
| Rate limit produksi | PASS (kode) | Tanpa Redis → deny; read-only/webhook opt-in fail-open |
| Observability rate limit | PASS | `/api/health` `checks.rateLimit`; log tanpa URL/token |
| Batas 2 credential aktif | PASS (DB) | Trigger + advisory lock; uji konkurensi |
| Error credential jelas | PASS | `ACTIVE_PAYMENT_CREDENTIAL_LIMIT` → pesan validasi |
| Kiosk slug invalid | PASS (E2E) | HTTP 404 |
| Authorization server-side | PASS (inspeksi + E2E tanpa sesi) | `requireUser`, `requireAdmin`, `getMembership` |
| Tenant isolation | PASS (inspeksi) | Business non-active → null/404 |
| Session revocation | PASS | `auth_sessions` dicek tiap request |
| Idle timeout | PASS | `SESSION_IDLE_SECONDS` |
| CSP | PASS | `media-src` dipertahankan |
| Upload validation | PASS | PNG/JPG/WebP, tanpa SVG |
| Secret exposure | PASS | Credential tidak dikembalikan setelah disimpan; log rate limit tidak memuat secret |

## Risiko residual

1. **Email delivery** undangan/reset belum diuji ke inbox nyata. Kode menangani
   kegagalan Resend dan tidak meninggalkan undangan hidup saat kirim gagal.
2. **E2E role ber-login** belum dijalankan; isolasi PIN dibuktikan lewat kode + unit
   test, bukan browser.
3. **Redis multi-instance** belum diuji dengan dua instance nyata.
4. **K-011/O-005** `usage_per_customer` voucher tetap BLOCKED (butuh identitas customer).
5. **A-033/A-034** idempotensi/history broadcast tetap NOT VERIFIED (di luar scope sprint).
6. `exceljs` → `uuid` moderate: mitigasi tertulis di `DEPENDENCY_SECURITY_REPORT.md`.

## Temuan high terbuka

Tidak ada temuan high yang terbuka di kode. Yang tersisa adalah **bukti runtime**
(email, E2E role, Redis, hardware), bukan kontrol keamanan yang belum diimplementasi.
