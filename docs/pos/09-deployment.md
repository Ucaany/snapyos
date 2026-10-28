# POS Add-on — Phase 9: Deployment Runbook (REVISI v2)

> Status: **RUNBOOK — eksekusi setelah Phase 8 hijau.**
> Revisi v4: migration `0019_pos_addon.sql` (0018 terpakai) + migration `0073_pos_receipt_snapshot_and_untracked_stock.sql` + `0074_pos_payment_idempotency_race.sql`; tanpa integrasi payment → tidak ada monitoring webhook; off-switch ganda (add-on + per booth).
> Prinsip: migration additive aman sebelum deploy kode; fitur off-switch tanpa deploy.

---

## Daftar Isi

1. Pra-Deploy
2. Urutan Eksekusi
3. Verifikasi Pasca-Deploy
4. Monitoring
5. Rollback
6. Acceptance Criteria

---

## 1. Pra-Deploy

- [ ] Phase 8 hijau (test/lint/typecheck/build).
- [ ] Backup DB produksi (snapshot Supabase) — rutin, meski migration murni additive.
- [ ] Verifikasi migration hanya additive: grep `drop\|alter column .* not null` di `0019_pos_addon.sql` → nol hasil (kecuali default).
- [ ] Pastikan migration `0073_pos_receipt_snapshot_and_untracked_stock.sql` dan `0074_pos_payment_idempotency_race.sql` siap diterapkan setelah `0019`–`0072`; keduanya wajib untuk kode POS terbaru.
- [ ] **Verifikasi status migrasi dengan `node scripts/probe-migration-status.mjs`** sebelum deploy, jangan mengandalkan dokumen.
- [x] **`0076_pos_stock_batch.sql` SUDAH diterapkan 2026-10-27.** RPC `pos_decrement_stock_batch` terverifikasi ada, `service_role`-only, `search_path` ter-pin, dan diuji fungsional (normal/shortfall/stok `null`/qty 0/isolasi tenant). Tanpa migrasi ini checkout POS menandai order `paid` lalu gagal decrement stok tanpa kompensasi.
- [ ] `ROOT_DOMAIN` env TIDAK diset (Phase 6 skip default).

---

## 2. Urutan Eksekusi

```
0. (Baru, 2026-10-27) Jalankan `node scripts/probe-migration-status.mjs` dan catat hasilnya.
   → `0073` dan `0074` terukur SUDAH diterapkan, jadi langkah 2 dan 3 di bawah
     bersifat idempotent (aman diulang, tidak wajib bila probe sudah APPLIED).
1. Terapkan `db/migrations/0019_pos_addon.sql` di produksi
   → additive: tabel baru + kolom photoboxes.pos_enabled + kolom transactions POS + seed.
     Kode lama tidak membaca kolom/tabel baru → aman sebelum deploy.
2. Terapkan `db/migrations/0073_pos_receipt_snapshot_and_untracked_stock.sql` di produksi.
   → menambah snapshot struk, RPC order/item atomic, dan RPC toggle booth atomic.
   → STATUS 2026-10-27: SUDAH diterapkan (probe APPLIED). Lewati bila probe setuju.
3. Terapkan `db/migrations/0074_pos_payment_idempotency_race.sql` di produksi.
   → mencegah retry pembayaran mengurangi stok dua kali, memaksa transaksi POS `withdrawable=false`; refresh schema cache PostgREST.
   → STATUS 2026-10-27: SUDAH diterapkan (probe APPLIED). Lewati bila probe setuju.
3b. (SELESAI 2026-10-27) `db/migrations/0076_pos_stock_batch.sql` sudah diterapkan.
   → RPC `pos_decrement_stock_batch` terverifikasi ada. Tanpa migrasi ini checkout
     POS membayar order lalu gagal decrement stok tanpa kompensasi.
4. Deploy Vercel (branch → production).
5. Admin: verifikasi add-on POS muncul di /admin/add-ons; set harga final produksi.
6. (Tenant pilot) Owner: aktifkan add-on POS via /dashboard/subscription → bayar invoice QRIS
   (billing add-on tetap pakai alur subscription existing — ini BUKAN pembayaran POS).
7. (Tenant pilot) Owner: toggle pos_enabled=true pada booth pilot di /dashboard/pos.
```

---

## 3. Verifikasi Pasca-Deploy

Smoke produksi (tenant pilot, checklist tertulis):

1. Login owner → `/dashboard/pos` → CRUD 2 produk (1 stok-tracked, 1 tidak) + toggle booth pilot.
2. Staff (role staff existing) login → `/pos` → booth pilot muncul → buka terminal.
3. Transaksi tunai kecil: order → bayar → `pos_orders` paid, `transactions` row (photobox_id/outlet_id/cashier_user_id/pos_order_id terisi), struk tercetak.
4. Verifikasi transaksi POS bersifat reporting-only: row `transactions` memiliki
   `pos_order_id` dan `withdrawable=false`, tidak membuat row `payments`, dan
   tidak memanggil settlement/payment gateway.
5. Toggle booth off → terminal menolak submit (`POS_BOOTH_DISABLED`); gate page booth hilang.
6. Tenant lain (tanpa add-on): menu POS tidak tampil; akses langsung → redirect aktivasi; action → 403.
7. Kiosk regresi: satu sesi kiosk end-to-end (checkout → QRIS → paid) normal; `\d payments` di produksi identik (POS tidak menyentuhnya).
8. Admin: revenue POS muncul di summary per tenant.
9. Jalankan `node tests/e2e/pos-receipt-serial.spec.mjs` terhadap DB target; 58mm dan 80mm harus lulus.

---

## 4. Monitoring

- `audit_logs` action `pos.*` — pastikan create/paid/toggle tercatat 24 jam pertama.
- Vercel logs: error route `/pos/*`.
- Rekon silang harian-1: `Σ pos_orders.paid = Σ transactions(pos_order_id)`; saldo/ledger stabil.
- ~~`payment_webhooks`~~ — tidak relevan (POS v2 offline-only).

---

## 5. Rollback

| Situasi                         | Aksi                                                                                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bug fitur POS (non-finance)     | Redeploy versi lama — tabel/kolom dibiarkan (harmless, tak dibaca kode lama)                                                                                                 |
| Matikan POS global TANPA deploy | Admin: `add_ons.is_active=false` utk `code='pos'` → semua `requirePosAccess` → `POS_NOT_SUBSCRIBED`                                                                          |
| Matikan POS per tenant          | Admin: `subscription_add_ons.status='cancelled'` utk tenant itu                                                                                                              |
| Matikan POS per booth           | Owner: toggle `pos_enabled=false` di `/dashboard/pos` (atau admin via DB)                                                                                                    |
| Migration 0073/0074 bermasalah  | Hentikan deploy, ambil snapshot DB, lalu rollback hanya setelah review operator; 0074 melakukan backfill `transactions.withdrawable=false` yang tidak boleh dibalik otomatis |

---

## 6. Acceptance Criteria

1. Checklist §3 lulus semua (tercatat tanggal + eksekutor).
2. Nol regresi kiosk/subscription/withdrawal (verifikasi 3+24 jam).
3. Monitoring bersih 24 jam.
4. Runbook ini dilampirkan hasil eksekusi (§Lampiran diisi).

**STATUS: RUNBOOK REVISI v4 — migration 0073, 0074, dan E2E transaksi POS wajib lulus sebelum rilis.**
