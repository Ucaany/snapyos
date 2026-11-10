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

| Nomor    | File                                                | Deskripsi                                                                                |
| -------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| baseline | `schema.sql`                                        | Accumulated schema (49+ tabel, RPC, seed)                                                |
| 0002     | `0002-outlets-province.sql`                         | Outlets province column                                                                  |
| 0003     | `0003-owner-dashboard-indexes.sql`                  | Dashboard query indexes                                                                  |
| …        | …                                                   | …                                                                                        |
| 0026     | `0026_session_timer_pos_atomicity.sql`              | Session timer + atomic POS payment                                                       |
| 0027     | `0027_direct_merchant_payment.sql`                  | Payment credentials + device logs                                                        |
| 0053     | `0053_business_profile_storage.sql`                 | Profil bisnis (whatsapp/owner/kontak/alamat) + add-on storage                            |
| 0054     | `0054_plan_storage_feature.sql`                     | Feature flag `storage` per plan + data migration default on                              |
| 0058     | `0058_broadcast_kind_template_history.sql`          | Broadcast email kind + template history                                                  |
| 0059     | `0059_payment_settlement_hardening.sql`             | Partial unique 1 payment aktif/checkout + settle RPC hardening + exit-PIN atomic lockout |
| 0060     | `0060_subscription_lifecycle_email.sql`             | Subscription lifecycle email otomatis (Resend)                                           |
| 0061     | `0061_plan_device_addon_model.sql`                  | Perangkat base 1 semua plan (tambah via add-on); fitur pembeda plan                      |
| 0072     | `0072_storage_addon_mb_label.sql`                   | Label add-on storage memakai MB (bukan GB) — **diterapkan 2026-10-27**                   |
| 0073     | `0073_pos_receipt_snapshot_and_untracked_stock.sql` | Snapshot setting struk + RPC order/item & toggle booth atomic — **diterapkan**           |
| 0074     | `0074_pos_payment_idempotency_race.sql`             | Tutup race retry pembayaran vs decrement stok — **diterapkan**                           |
| 0075     | `0075_integrity_and_hot_indexes.sql`                | FK `photoboxes.default_template_id` + index hot path — **diterapkan 2026-10-27**         |
| 0076     | `0076_pos_stock_batch.sql`                          | RPC `pos_decrement_stock_batch` — **diterapkan 2026-10-27**                              |
| 0077     | `0077_plan_limits_packages_templates.sql`           | `plans.max_packages` / `max_templates` — **diterapkan**                                  |
| 0078     | `0078_webhook_hot_path_indexes.sql`                 | Tiga index webhook/payment — **diterapkan** (katalog Postgres)                           |
| 0079     | `0079_customer_fk_restrict.sql`                     | FK customers → `ON DELETE RESTRICT` — **diterapkan** (katalog Postgres)                  |
| 0080     | `0080_fix_circular_fk_transactions_payments.sql`    | Hapus FK `transactions.payment_id` — **diterapkan**                                      |
| 0081     | `0081_installer_catalog.sql`                        | Katalog installer Windows private + metadata kompatibilitas                              |

Status di atas diverifikasi 2026-10-27 dengan dua lapis: probe PostgREST
(`node scripts/probe-migration-status.mjs`, semua panggilan no-op) untuk objek
yang diekspos, dan katalog Postgres (`supabase db query --linked`) untuk index,
aksi FK, serta signature fungsi. Jalankan ulang keduanya; jangan mengandalkan
tabel ini.
