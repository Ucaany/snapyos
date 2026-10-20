# Database — Bootstrap & Migration Strategy

## Konvensi

1. **`db/schema.sql`** = **accumulated baseline**. Berisi keseluruhan schema final
   (semua tabel, trigger, index, seed, RPC) seolah database baru dibuat dari nol.
   Environment baru menjalankan `schema.sql` saja — tidak perlu migration apapun.

2. **`db/migrations/NNNN-*.sql`** = **incremental delta**. Dijalankan hanya pada
   database existing yang sudah punya state sebelumnya. Diaplikasikan berurutan
   berdasarkan nomor (`0002` → `0003` → … → `NNNN`).

3. **Tidak ada migration `0001`** — `schema.sql` IS the implicit 0001 baseline.

4. **Setiap migration WAJIB** disertai update `schema.sql` agar baseline
   mencerminkan akumulasi seluruh migration.

5. **Aturan konvergensi**: `schema.sql` yang dijalankan dari nol **WAJIB**
   menghasilkan schema identik dengan database yang menjalankan seluruh migration
   `0002..NNNN` di atas baseline awal.

## Bootstrap Environment Baru

```bash
# Fresh database — jalankan baseline saja:
psql -f db/schema.sql

# Opsional: seed data development:
psql -f db/seed-dev.sql
```

## Migrasi Database Existing

```bash
# Jalankan migration yang belum diaplikasikan (urutan ascending):
# 0002, 0003, ..., 0026, 0027, ...
psql -f db/migrations/0027_direct_merchant_payment.sql
```

## Rollback

Setiap migration yang mengubah schema secara destruktif (DROP, ALTER column type)
**WAJIB** punya rollback yang bisa mengembalikan state.

**Konvensi nama (sejak 2026-10-16):** `NNNN_nama_rollback.sql` — mengikuti nama
file forward. Sebelumnya ada dua konvensi (`NNNN_rollback.sql` vs
`NNNN_nama_rollback.sql`); dengan `ls | sort`, bentuk lama membuat rollback
berjalan SEBELUM forward untuk nomor 0019/0025/0026/0027/0028/0041/0056/0064.
Semua sudah diseragamkan; `tests/migration-integrity.test.ts` menjaga agar tidak
kambuh.

```bash
# Rollback migration 0027:
psql -f db/migrations/0027_direct_merchant_payment_rollback.sql
```

## Migration Chain

| Nomor    | File                                       | Deskripsi                                                                                |
| -------- | ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| baseline | `schema.sql`                               | Accumulated schema (49+ tabel, RPC, seed)                                                |
| 0002     | `0002-outlets-province.sql`                | Outlets province column                                                                  |
| 0003     | `0003-owner-dashboard-indexes.sql`         | Dashboard query indexes                                                                  |
| …        | …                                          | …                                                                                        |
| 0026     | `0026_session_timer_pos_atomicity.sql`     | Session timer + atomic POS payment                                                       |
| 0027     | `0027_direct_merchant_payment.sql`         | Payment credentials + Electron device config + device_logs                               |
| 0053     | `0053_business_profile_storage.sql`        | Profil bisnis (whatsapp/owner/kontak/alamat) + add-on storage                            |
| 0054     | `0054_plan_storage_feature.sql`            | Feature flag `storage` per plan + data migration default on                              |
| 0058     | `0058_broadcast_kind_template_history.sql` | Broadcast email kind + template history                                                  |
| 0059     | `0059_payment_settlement_hardening.sql`    | Partial unique 1 payment aktif/checkout + settle RPC hardening + exit-PIN atomic lockout |
| 0060     | `0060_subscription_lifecycle_email.sql`    | Subscription lifecycle email otomatis (Resend)                                           |
| 0061     | `0061_plan_device_addon_model.sql`         | Perangkat base 1 semua plan (tambah via add-on); fitur pembeda plan                      |
| 0072     | `0072_storage_addon_mb_label.sql`          | Label add-on storage memakai MB (bukan GB)                                               |
