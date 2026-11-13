# SECURITY REVIEW

Fokus: perubahan remediasi sesi ini + verifikasi kontrol yang sudah ada.

## Kontrol yang diverifikasi

| Kontrol | Status | Bukti |
|---|---|---|
| Authorization server-side | PASS (inspeksi) | `requireOwner`, `requireAdmin`, `getMembership` dipakai di action |
| Tenant isolation | PASS (inspeksi) | `getMembership` fail-closed untuk business non-active |
| Feature gate backend | PASS | `requireFeature` di voucher, finance, reports, staff, direct_payment, cash |
| Feature gate UI | PASS | inline `hasFeature` di reports/staff/finance/payment |
| Session revocation | PASS | `auth_sessions` dicek tiap request; logout menghapus baris |
| Idle timeout | PASS (baru) | `SESSION_IDLE_SECONDS` di JWT callback |
| Staff removal revoke | PASS (baru) | `auth_sessions` dihapus bila membership habis |
| Privilege change revoke | PASS (baru) | `auth_sessions` dihapus saat role berubah |
| Password change | PASS (baru) | verifikasi password lama + argon2 hash baru |
| PIN staff scope | PARTIAL | PIN hanya untuk membership role `staff`; user multi-role tetap dapat session penuh |
| Rate limit | PARTIAL | Redis sliding window + fallback in-memory; multi-instance butuh Redis |
| CSP | PASS (baru) | `media-src` ditambahkan; `default-src 'self'` dipertahankan |
| Frame proxy allowlist | PASS | origin + path objek divalidasi |
| Upload validation | PASS | PNG/JPG/WebP, tanpa SVG |
| Secret exposure | PASS (inspeksi) | credential tidak dikembalikan setelah disimpan |

## Risiko residual

1. **AUTH-03** — undangan staff masih direct membership tanpa token/consent.
   Perlu desain produk + email.
2. **AUTH-01 reset password** — belum ada reset via email; hanya change
   password untuk user login.
3. **K-011/O-005** — `usage_per_customer` voucher tidak dapat ditegakkan tanpa
   identitas customer di kiosk.
4. **O-012** — batas 2 credential aktif masih count-then-write; butuh constraint
   DB/transaksi untuk menutup race sepenuhnya.
5. **A-033** — idempotensi broadcast belum diverifikasi.
6. **S-001** — user yang staff di satu business dan owner di business lain tetap
   mendapat session penuh lewat PIN; perlu session ber-scope.

## Rekomendasi sebelum production

- Aktifkan Redis (`UPSTASH_*`) di deployment multi-instance.
- Tambah partial unique index untuk batas credential aktif.
- Tambah token undangan staff + expiry.
- Tambah reset password berbasis token sekali pakai + email.
- Jalankan `npm audit` dan Strix/OWASP scan pada environment staging.
