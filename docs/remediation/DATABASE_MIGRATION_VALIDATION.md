# DATABASE MIGRATION VALIDATION

Tanggal: 2026-11-13. Metode: PostgreSQL 16 ephemeral di Docker (`snapy-pg`), bukan
database production/staging pengguna. Container dihapus setelah validasi.

## 1. Baseline `db/schema.sql`

Dijalankan dari database kosong (dengan stub `storage.buckets` milik Supabase).

| Uji | Hasil |
|---|---|
| `psql -v ON_ERROR_STOP=1 -f db/schema.sql` | **PASS** (exit 0) |
| Tabel baru `staff_invitations`, `password_reset_tokens` | Ada |
| Trigger `trg_payment_credentials_active_limit` | Ada |
| RLS + grant service_role untuk tabel baru | Ada |

### Cacat baseline yang ditemukan dan diperbaiki

`schema.sql` **tidak bisa dijalankan dari nol** sebelum sesi ini:

1. `staff_invitations` (baru) sempat ditempatkan sebelum `businesses` → dipindah setelah
   `business_members`.
2. `pos_orders.customer_id` mereferensikan `customers` yang baru dibuat jauh di bawahnya
   (pre-existing). Blok `customers` dipindah sebelum `pos_orders`.

Tanpa dua perbaikan ini, bootstrap environment baru gagal. Ini temuan nyata, bukan
perubahan kosmetik.

## 2. Migrasi 0091 pada state pra-0091

Database terpisah `snapy_pre` dengan tabel minimal (`users`, `businesses`,
`payment_credentials`) lalu `0091_auth_tokens_and_credential_limit.sql`.

| Uji | Hasil |
|---|---|
| Apply migrasi | **PASS** |
| Insert 2 credential aktif | **PASS** |
| Insert credential aktif ke-3 | **DITOLAK** (`ACTIVE_PAYMENT_CREDENTIAL_LIMIT`) |
| Nonaktifkan satu → insert lagi | **PASS**, total aktif = 2 |
| Dua insert paralel saat 1 aktif | Satu sukses, satu gagal; total aktif = 2 |
| Rollback 0091 | **PASS**; tabel & fungsi hilang, data credential lama tetap |

## 3. Integritas token

| Uji | Hasil |
|---|---|
| Undangan pending ganda (email beda kapital) | **DITOLAK** oleh `uq_staff_invitation_pending` |
| Undangan lama di-accept → undangan baru | **DIIZINKAN** |
| Token hash unik | Constraint `unique` |

## 4. Yang TIDAK diverifikasi

- Aplikasi migrasi ke **staging/production** — tidak ada akses; production tidak disentuh.
- Drift schema database existing vs `schema.sql` — butuh koneksi DB existing.
- Backup/restore production — di luar environment ini.

## Rekomendasi rilis

1. Backup penuh + uji restore sebelum apply 0091.
2. Apply 0091 di staging, lalu bandingkan `information_schema.columns` untuk
   `staff_invitations`, `password_reset_tokens`, dan trigger credential.
3. Jalankan smoke: invite staff, accept, reset password, aktivasi credential ke-3.
4. Rollback tersedia di `0091_auth_tokens_and_credential_limit_rollback.sql`.
