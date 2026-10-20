# POS Add-on — Phase 4: Payment QRIS — **DIBATALKAN (REVISI v2)**

> Status: **DIBATALKAN — 2026-08-27.**
> Arahan owner: pembayaran POS = **offline saja** (cash/bank_transfer/other), "tidak ada kaitannya dengan pembayaran yang ada, tidak bentrok".
> Seluruh isi dokumen v1 (integrasi Pakasir, `payments`, webhook branch, polling, `creditBalance`, `settlement-recovery`) **tidak berlaku** dan tidak boleh dieksekusi.

---

## Pengganti

- Pembayaran POS offline diimplement di **Phase 3** (`payPosOrderManually` — lihat `docs/pos/03-pos-core.md` §4).
- Keputusan dibekukan sebagai **A2/A3** di `docs/pos/01-architecture.md` REVISI v2:
  - Tidak ada integrasi `payments` / `payment_webhooks` / Pakasir / polling / `creditBalance` untuk POS.
  - Semua payment POS → insert `transactions` (reporting only, tanpa kredit saldo).
- Bila suatu saat pembayaran online POS dibutuhkan: buka dokumen spesifikasi baru — **jangan menghidupkan dokumen ini**.

## Konsekuensi yang hilang bersama pembatalan ini

| Risiko v1                                    | Status                                          |
| -------------------------------------------- | ----------------------------------------------- |
| R1 — `payments.checkout_session_id` nullable | GUGUR (tidak ada perubahan `payments`)          |
| R2 — branch webhook pecah kiosk              | GUGUR (tidak ada branch webhook)                |
| R7 — double credit webhook replay            | GUGUR (tidak ada credit dari POS)               |
| R3 — role `cashier` baru                     | GUGUR (staff pakai permission `pos:*` — A6)     |
| R11 — relax NOT NULL `transactions`          | GUGUR (outlet/photobox terisi dari booth — A13) |

Idempotency/race kini ditangani di level order (`docs/pos/03` §4): conditional UPDATE single-winner + exists-check `transactions.pos_order_id`.

**STATUS: DIBATALKAN. Fase berikutnya setelah Phase 3 = Phase 5 (Finance & Reporting).**
