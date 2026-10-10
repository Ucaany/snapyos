# 14. Settlement & Withdrawal (Penarikan)

> **SUPERSEDED (2026-09-30) — migration 0044.** Seluruh flow penarikan saldo owner
> (`withdrawals`/`balances`/`balance_ledger`) dihapus. Owner kini connect payment
> gateway direct (Pakasir/Midtrans/Tripay) atau pakai voucher — bukan tarik saldo.
> Dokumen ini dipertahankan sebagai referensi historis; lihat `docs/README.md` v1.8.

## Status Implementasi (audit 2026-08-30)

SESUAI (inti): aggregator model, `creditBalance` fee platform per plan, `balances`/`balance_ledger` (CAS-guarded), withdrawal request → admin process/reject (reject = refund + ledger credit), rekon silang.

LEBIH KETAT / tak terdokumentasi:

- Permintaan withdrawal = **owner-only** (bukan sekadar `finance:write`).
- Validasi **nama rekening harus sama dengan nama profil** (normalisasi).
- **Jadwal hari** penarikan (`platform_settings.withdrawal_days`) + **SLA** (`withdrawal_sla_hours`).
- Path recovery settlement: `src/server/payment/settlement-recovery.ts` (dipindah pada Fase 5 untuk menegaskan boundary server-only).

Model dana SnapyOS adalah **aggregator / marketplace**: dana customer masuk ke **akun utama SnapyOS** (In-House QRIS Pakasir), lalu owner UMKM menarik dana (penarikan/withdrawal) ke rekeningnya. Alur ini **terdeteksi di dashboard** (owner & admin).

---

## 14.1 Model Dana

```
Customer bayar QRIS
   ↓ (dana masuk akun utama SnapyOS)
Pakasir — In-House QRIS (api_key + project milik SnapyOS)
   ↓ webhook PAID
Payment (paid) + Transaction (paid)
   ↓ sistem kredit saldo owner
Balance (saldo business bertambah, dikurangi platform fee)
   ↓ owner request penarikan
Withdrawal (pending → paid)
   ↓ admin/auto proses transfer ke rekening owner
Rekening bank owner
```

Penting: `amount` transaksi adalah **net revenue owner** (`final_amount`). Platform fee (jika ada, per plan — lihat `02-business-subscription.md`) dipotong saat kredit saldo, bukan dihitung sebagai revenue owner.

---

## 14.2 Entity (tambahan ke `07-database-schema.md`)

### balances

| kolom              | tipe                    | ket                                         |
| ------------------ | ----------------------- | ------------------------------------------- |
| business_id        | uuid PK → businesses.id | satu baris per business                     |
| available          | integer                 | saldo tersedia (bisa ditarik)               |
| pending            | integer                 | saldo tertahan (withdrawal berjalan / hold) |
| lifetime_earned    | integer                 | total kredit seumur hidup                   |
| lifetime_withdrawn | integer                 | total penarikan seumur hidup                |
| updated_at         | timestamptz             |                                             |

### balance_ledger (mutasi saldo)

| kolom         | tipe                 | ket                                                                             |
| ------------- | -------------------- | ------------------------------------------------------------------------------- |
| id            | uuid PK              |                                                                                 |
| business_id   | uuid → businesses.id |                                                                                 |
| type          | text                 | `credit` / `debit` / `receivable`                                               |
| amount        | integer              |                                                                                 |
| source        | text                 | `payment` / `withdrawal` / `refund` / `adjustment` / `platform_fee`             |
| source_id     | uuid                 | FK longgar ke sumber (payment/withdrawal id)                                    |
| balance_after | integer              | snapshot saldo setelah mutasi; `0` untuk `receivable` yang tidak mengubah saldo |
| created_at    | timestamptz          |                                                                                 |

Direct merchant platform fee dicatat sebagai `receivable` ber-source `platform_fee`, bukan sebagai kredit saldo owner. Unique partial index `(source, source_id) WHERE source='platform_fee'` menjaga idempotensi replay paralel.

### withdrawals (penarikan)

| kolom                   | tipe                 | ket                                                       |
| ----------------------- | -------------------- | --------------------------------------------------------- |
| id                      | uuid PK              |                                                           |
| business_id             | uuid → businesses.id |                                                           |
| requested_by            | uuid → users.id      |                                                           |
| amount                  | integer              | nominal penarikan                                         |
| bank_name               | text                 |                                                           |
| bank_account_number     | text                 |                                                           |
| bank_account_name       | text                 |                                                           |
| status                  | text                 | `pending` / `processing` / `paid` / `rejected` / `failed` |
| reference               | text                 | ref transfer dari admin/bank                              |
| requested_at            | timestamptz          |                                                           |
| processed_at            | timestamptz          |                                                           |
| created_at / updated_at | timestamptz          |                                                           |

---

## 14.3 Owner Flow — Penarikan

1. Owner buka halaman **Finance → Saldo & Penarikan**.
2. Melihat: saldo tersedia, saldo tertahan, riwayat penarikan.
3. Klik `[ TARIK DANA ]` → form: nominal (≤ saldo), rekening tujuan (bank/nomor/nama).
4. Sistem: validasi saldo cukup → buat `withdrawal` (status `pending`) + `balance_ledger` debit → saldo `available` berkurang, `pending` bertambah.
5. Admin SnapyOS memproses transfer (manual/auto) → status `paid` (saldo `pending` berkurang, `lifetime_withdrawn` bertambah). Jika gagal → `failed` (saldo dikembalikan ke `available`).

**Validasi:**

- Nominal > 0, integer.
- Nominal ≤ `balances.available`.
- Rekening lengkap & valid (nama/nomor/bank).
- Batas minimum penarikan (configurable, default misal Rp10.000).

**Permission:** OWNER (dan MANAGER jika diizinkan). STAFF tidak.

---

## 14.4 Owner Dashboard — Penarikan

Metrics pada Finance/Dashboard:

- Saldo tersedia
- Saldo tertahan
- Total ditarik
- Riwayat penarikan (status, tanggal, nominal, rekening)

---

## 14.5 Admin — Payout Monitoring

Admin melihat daftar `withdrawals` seluruh tenant + aksi proses/reject:

- `GET /api/v1/admin/withdrawals?status=`
- `POST /api/v1/admin/withdrawals/:id/process` → `processing` → `paid` (input `reference`)
- `POST /api/v1/admin/withdrawals/:id/reject` → `rejected` (saldo kembali)

Semua aksi dicatat di `audit_logs`.

---

## 14.6 Platform Fee

- Default 0 (tidak ada fee). Configurable **per plan** (`plans.platform_fee_percent`, `plans.platform_fee_flat`) atau global (`platform_settings`).
- Saat kredit saldo dari payment `paid`: `credit = final_amount − platform_fee`.
- Admin melihat: gross payment volume, platform fee, net amount.

---

## 14.7 Acceptance Criteria (tambahan)

- Payment `paid` otomatis mengkredit saldo owner (minus platform fee).
- Owner melihat saldo & riwayat penarikan.
- Penarikan tidak boleh melebihi saldo.
- Penarikan `rejected`/`failed` mengembalikan saldo.
- Admin dapat proses/reject penarikan; semua tercatat audit.
