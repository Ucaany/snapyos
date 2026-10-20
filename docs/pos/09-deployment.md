# POS Add-on — Phase 9: Deployment Runbook (REVISI v2)

> Status: **RUNBOOK — eksekusi setelah Phase 8 hijau.**
> Revisi v2: migration `0019_pos_addon.sql` (0018 terpakai); tanpa integrasi payment → tidak ada monitoring webhook; off-switch ganda (add-on + per booth).
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
- [ ] `ROOT_DOMAIN` env TIDAK diset (Phase 6 skip default).

---

## 2. Urutan Eksekusi

```
1. Terapkan db/migrations/0019_pos_addon.sql di produksi
   → additive: tabel baru + kolom photoboxes.pos_enabled + kolom transactions POS + seed.
     Kode lama tidak membaca kolom/tabel baru → aman sebelum deploy.
2. Deploy Vercel (branch → production).
3. Admin: verifikasi add-on POS muncul di /admin/add-ons; set harga final produksi.
4. (Tenant pilot) Owner: aktifkan add-on POS via /dashboard/subscription → bayar invoice QRIS
   (billing add-on tetap pakai alur subscription existing — ini BUKAN pembayaran POS).
5. (Tenant pilot) Owner: toggle pos_enabled=true pada booth pilot di /dashboard/pos.
```

---

## 3. Verifikasi Pasca-Deploy

Smoke produksi (tenant pilot, checklist tertulis):

1. Login owner → `/dashboard/pos` → CRUD 2 produk (1 stok-tracked, 1 tidak) + toggle booth pilot.
2. Staff (role staff existing) login → `/pos` → booth pilot muncul → buka terminal.
3. Transaksi tunai kecil: order → bayar → `pos_orders` paid, `transactions` row (photobox_id/outlet_id/cashier_user_id/pos_order_id terisi), struk tercetak.
4. Verifikasi saldo: `balances` + `balance_ledger` TIDAK berubah setelah transaksi POS (kebijakan 0016/A3).
5. Toggle booth off → terminal menolak submit (`POS_BOOTH_DISABLED`); gate page booth hilang.
6. Tenant lain (tanpa add-on): menu POS tidak tampil; akses langsung → redirect aktivasi; action → 403.
7. Kiosk regresi: satu sesi kiosk end-to-end (checkout → QRIS → paid) normal; `\d payments` di produksi identik (POS tidak menyentuhnya).
8. Admin: revenue POS muncul di summary per tenant.

---

## 4. Monitoring

- `audit_logs` action `pos.*` — pastikan create/paid/toggle tercatat 24 jam pertama.
- Vercel logs: error route `/pos/*`.
- Rekon silang harian-1: `Σ pos_orders.paid = Σ transactions(pos_order_id)`; saldo/ledger stabil.
- ~~`payment_webhooks`~~ — tidak relevan (POS v2 offline-only).

---

## 5. Rollback

| Situasi                         | Aksi                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Bug fitur POS (non-finance)     | Redeploy versi lama — tabel/kolom dibiarkan (harmless, tak dibaca kode lama)                                                                |
| Matikan POS global TANPA deploy | Admin: `add_ons.is_active=false` utk `code='pos'` → semua `requirePosAccess` → `POS_NOT_SUBSCRIBED`                                         |
| Matikan POS per tenant          | Admin: `subscription_add_ons.status='cancelled'` utk tenant itu                                                                             |
| Matikan POS per booth           | Owner: toggle `pos_enabled=false` di `/dashboard/pos` (atau admin via DB)                                                                   |
| Migration bermasalah            | Jalankan `0019_pos_addon_rollback.sql` (docs/pos/02 §10) — aman kapan pun (semua objek murni additive, tak ada kolom existing yang berubah) |

---

## 6. Acceptance Criteria

1. Checklist §3 lulus semua (tercatat tanggal + eksekutor).
2. Nol regresi kiosk/subscription/withdrawal (verifikasi 3+24 jam).
3. Monitoring bersih 24 jam.
4. Runbook ini dilampirkan hasil eksekusi (§Lampiran diisi).

**STATUS: RUNBOOK REVISI v2 — eksekusi terakhir setelah semua fase hijau.**
