# 2. Business Model & Subscription

## 2.1 Business Model

SnapyOS menggunakan model **SaaS subscription**. Owner membayar subscription per siklus (harian, mingguan, bulanan, atau tahunan) untuk menggunakan SnapyOS. Harga default di bawah adalah **placeholder** dan harus **configurable** melalui admin dashboard (bukan hardcode).

Admin dapat mengubah: price, billing cycle, feature limits, outlet limit, **concurrent session limit**, user/staff limit, storage limit.

## 2.1b Model Sesi Konkuren (Kunci Billing)

> **REDEFINISI SEAT (plan camera-sdk §B, 2026-09):** "sesi" dihitung dari
> **jumlah device aktif terpairing + online (heartbeat)** — bukan jumlah sesi
> foto konkuren. Booth yang device-nya offline TIDAK menghabiskan seat.

- Setiap account UMKM default = **1 outlet**, dan **1 perangkat online** (1 seat) pada satu waktu.
- **Seat** = device aktif (`devices.status='active'`) + online (`last_seen_at`/`last_heartbeat_at` dalam window default 90 detik).
- Limit di-enforce **server-side**: `assertSessionCapacity` membandingkan jumlah device online terhadap `max_concurrent_sessions` → tolak (`SESSION_LIMIT_REACHED`).
- Batas per-booth 1 sesi foto aktif (partial unique index `uq_sessions_active_per_photobox`) tetap berlaku — aturan throughput, bukan kuota billing.
- Untuk menambah seat (perangkat online), owner membeli **add-on sesi** (`extra_session`), sekarang berarti "device online tambahan".

## 2.2 Pricing Plans (default)

> **Model perangkat (revisi):** jumlah perangkat (outlet / photobox /
> perangkat online) **TIDAK** dibedakan antar plan. Semua plan base = **1
> perangkat**. Tambahan perangkat dibeli via add-on (`extra_session`, docs/02
> §2.9). Yang membedakan plan hanyalah **fitur** (`features` jsonb).

### STARTER — Rp99.000/month

Target: **New Photobox Owner**.

Fitur (base):

- 1 business workspace
- 1 outlet, 1 Photobox, 1 perangkat online
- Basic templates
- Basic branding
- Transaction tracking
- Revenue dashboard

### GROWTH — Rp249.000/month

Target: **Growing UMKM**.

Fitur (semua Starter +):

- Payment gateway direct-merchant (`direct_payment`)
- Finance / settlement
- Staff management (`staff`)
- POS (add-on terpisah, ditampilkan sebagai fitur tersedia)

### BUSINESS — Rp499.000+/month

Target: **Multi-outlet / agency**.

Fitur (semua Growth + Starter +):

- Storage (`storage`)
- Reports / laporan (`reports`)
- Voucher (`voucher`)
- Custom domain
- White-label
- Advanced event functionality

> Harga & fitur di atas adalah default seed. Semua nilai dibaca dari table
> `plans` (lihat `07-database-schema.md`), bukan dari konfigurasi client.

## 2.3 Plan Config (data per plan)

Field pada `plans`:

| Field                     | Type                    | Contoh                                                                            |
| ------------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| `code`                    | text unique             | `starter`, `growth`, `business`                                                   |
| `name`                    | text                    | `STARTER`                                                                         |
| `price`                   | integer (IDR)           | `99000` — harga **per siklus** (0093)                                             |
| `billing_cycle`           | enum                    | `daily`, `weekly`, `monthly`, `yearly`                                            |
| `max_businesses`          | integer                 | `1`                                                                               |
| `max_outlets`             | integer                 | `1` (base; tambah via add-on)                                                     |
| `max_photoboxes`          | integer                 | `1` (base; tambah via add-on)                                                     |
| `max_concurrent_sessions` | integer                 | `1` (base; tambah via add-on)                                                     |
| `max_staff`               | integer                 | `0` starter / `5` growth / `20` business                                          |
| `storage_limit_mb`        | integer                 | `512`                                                                             |
| `platform_fee_percent`    | numeric                 | `0` (fee per plan, configurable)                                                  |
| `platform_fee_flat`       | integer                 | `0`                                                                               |
| `features`                | jsonb                   | list fitur & flag (voucher, reports, custom_domain, white_label, event_mode, ...) |
| `is_active`               | boolean                 | `true`                                                                            |

> **Siklus billing (0093):** satu plan = satu siklus. Panjang periode fixed
> dalam hari: `daily=1`, `weekly=7`, `monthly=30`, `yearly=365`. Harga plan
> adalah harga per siklus tersebut; tidak ada kolom harga terpisah per siklus.
> `subscriptions.billing_cycle` menyimpan **snapshot** siklus saat aktivasi,
> sehingga admin mengubah siklus/harga plan tidak mengubah periode yang sudah
> dibayar.

## 2.4 Subscription Lifecycle

`subscriptions` status enum: `trial`, `active`, `past_due`, `cancelled`, `expired`.

Transisi:

- **Trial** → (pilih plan + bayar) → **Active**
- **Active** → (gagal bayar renewal) → **Past Due**
- **Past Due** → (bayar) → **Active** | (lewat grace period) → **Expired/Cancelled**
- **Active** → (owner cancel, berlaku sampai akhir periode) → **Cancelled**
- **Trial** → (tidak upgrade sampai masa trial habis) → **Expired**

**Recovery expired (self-service):**

```
Expired ──(owner klik "Aktifkan Kembali" di /dashboard/subscription)──▶ invoice
      pending (plan_change, harga plan penuh, periode baru)──(bayar QRIS)──▶ Active
      (current_period_start = now(), current_period_end = cyclePeriod(now(), billing_cycle))
```

- Hanya `expired` (sudah lewat grace `min(7 hari, panjang siklus)`) yang dapat
  recovery self-service. **`past_due` dalam grace TIDAK menembus jalur ini** —
  periode tetap extend dari `current_period_end` lama (pro-rated cycle).
- **Grace `past_due` (0093):** `min(7 hari, panjang periode)`. Plan harian
  mendapat grace 1 hari, mingguan/bulanan/tahunan 7 hari. Cron lifecycle
  memakai cutoff per siklus.
- Recovery memakai `status='expired'` yang diterima di `createSubscriptionInvoice`
  dan `applyInvoiceIntent` (`src/lib/subscription-intent-apply.ts`): invoice
  recovery **selalu memuat `plan_change`** (reactivasi plan lama maupun ganti
  plan), dan saat paid periode ditetapkan **baru dari `now()`**, bukan extend
  dari periode yang sudah mati.
- `cancelled` TETAP gagal di aktivasi (`SUBSCRIPTION_NOT_ACTIVE`,
  docs/02 §2.4b) — keputusan manusia (refund/aktivasi manual) tetap wajib.

**Gate mutasi finansial (C3, hardening 2026-10-08):** SEMUA mutasi finansial —
termasuk **konfirmasi tunai kiosk** (`confirmCashPaymentAction`, `src/server/cash-payment-actions.ts`), expense finance, transaksi manual, POS, dan booth —
gated lewat `requireEffectiveSubscription(businessId, "write")`
(`src/server/require-subscription.ts`), yang memakai
`isSubscriptionEffective()` (`src/lib/subscription-math.ts`) sebagai gate
date-aware tunggal. Status string saja tidak cukup: trial/`past_due` bisa
kedaluwarsa secara waktu sebelum cron mentransisikan status DB. Bisnis
kedaluwarsa → `SUBSCRIPTION_EXPIRED` (HTTP 410) dan tidak bisa menghasilkan
`transactions` baru.

### 2.4b Kegagalan Aktivasi Post-Payment (invoice paid, plan tidak aktif)

Alur payment-first berarti invoice ditandai `paid` **sebelum** intent
(plan change / add-on) diterapkan. Aktivasi dijalankan oleh
`applyInvoiceIntent(businessId, invoiceId)` (`src/server/subscription.ts`,
core di `src/lib/subscription-intent-apply.ts`) yang mengklaim baris
invoice secara atomik via `intent.applied=true` (idempotensi: retry
webhook/polling/recovery tidak pernah mengeksekusi intent dua kali).

**Masalah (bug yang diperbaiki):** bila di tengah aktivasi subscription
sudah tidak berada pada status `{trial, active, past_due}`, fungsi dulu
`return` diam-diam **tanpa** melepas klaim `intent.applied`. Akibatnya:
uang sudah masuk ke provider, invoice `paid`, tapi plan/add-on tidak
pernah aktif, klaim terkunci sehingga retry mustahil, dan tidak ada jejak
audit. Contoh nyata: owner cancel → cron transisi ke `cancelled` → webhook
`paid` tiba terlambat → uang hilang tanpa terdeteksi.

**Aturan (source of truth):** setiap early-return non-sukses **setelah**
klaim atomik wajib memanggil `recordActivationFailure` yang melakukan tiga
hal:

1. **Rollback klaim** — tulis ulang `intent` dengan `applied=false` dan
   `applied_at=null` (filter `intent->>applied = 'true'` agar tidak menimpa
   apply sukses konkuren), sehingga retry berikutnya lolos CAS
   (`intent->>applied.neq.true`) kembali. Sukses path **tidak**
   diubah: `applied=true` dibiarkan permanen sebagai penanda idempotensi.
   Snapshot `intent_snapshot` yang disimpan ke antrean justru membuang kedua
   flag tersebut — snapshot mendokumentasikan apa yang dibeli, bukan status
   klaim.
2. **Audit** — `audit_logs` dengan `action = subscription.intent_activation_failed`,
   memuat `invoice`, `reason`, `message`, `amount`, `subscription_id`.
3. **Antrean review manual** — baris di `subscription_intent_failures`
   (reason + snapshot intent + amount) agar admin dapat **refund** atau
   **aktivasi manual**. Partial unique index `(invoice_id, reason) WHERE
status='pending'` menggabungkan retry berulang menjadi satu tiket;
   retry dengan reason berbeda membuat tiket terpisah.

**Reason yang dikenali** (`INTENT_FAILURE_REASON`):

| Reason                    | Kapan                                                                                                                                                                                        | Tindakan                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `SUBSCRIPTION_NOT_ACTIVE` | SELECT subscription `{trial,active,past_due,expired}` → null; kasus owner cancel + cron flip sebelum webhook paid (`cancelled` tidak masuk daftar — expired kini recovery self-service §2.4) | Refund atau aktivasi manual                                |
| `UPDATE_NO_ROW`           | SELECT lolos tapi UPDATE `.in(status).select()` nol baris (race cron/admin di sela SELECT–UPDATE)                                                                                            | Refund atau aktivasi manual                                |
| `MISSING_SUBSCRIPTION_ID` | Invoice berisi add-on tetapi `subscription_id` null                                                                                                                                          | Refund atau attach manual                                  |
| `INTENT_EXCEPTION`        | Throw tak terduga (mis. insert add-on gagal); klaim dilepas agar retry aman                                                                                                                  | Retry otomatis webhook berikutnya; tiket untuk visibilitas |

**Jaminan uang tidak dilepas:** kegagalan aktivasi **tidak** mengubah
`invoices.status` (tetap `paid`) dan **tidak** memicu refund otomatis.
Dana tetap berada di akun provider sampai admin memutuskan lewat
`/admin/subscriptions/pending-review`. Bila retry berikutnya berhasil,
baris pending invoice tersebut otomatis di-`dismissed`
(auto-dismiss, best-effort).

**Flow:**

1. Webhook `PAID` tiba → `markInvoicePaid` menandai invoice `paid` →
   `applyInvoiceIntent` mengklaim.
2. Subscription tidak aktif → `recordActivationFailure` (rollback klaim +
   audit + tiket `pending`), fungsi kembali tanpa melempar.
3. Admin membuka `/admin/subscriptions/pending-review` (tab `PENDING`)
   melihat reason, snapshot intent, amount, dan `subscription_id`.
4. Admin memilih resolusi:
   - **AKTIVASI MANUAL** — perbaiki entitlement via `/admin/subscriptions`
     atau langsung, lalu tutup tiket (`status='activated'`).
   - **MARK REFUNDED** — issue refund via dashboard Pakasir (out-of-band),
     lalu tutup tiket (`status='refunded'`); invoice tetap `paid` sebagai
     fakta historis.
   - **DISMISS** — false alarm/duplikat/teratasi retry (`status='dismissed'`).
5. Setiap resolusi menulis `audit_logs` admin dan CAS `status='pending'`
   untuk mencegah dua admin menimpa keputusan satu sama lain.

**Implementasi terkait:**

- Core: `src/lib/subscription-intent-apply.ts`
  (`applyInvoiceIntentWithDeps`, `recordActivationFailure`,
  `INTENT_FAILURE_REASON`, `buildReleasedIntent`).
- Adaptor produksi: `applyInvoiceIntent` di `src/server/subscription.ts`.
- Tabel: `subscription_intent_failures` (migrasi `0041`, cermin `db/schema.sql`).
- Data layer admin: `src/server/admin/subscription-failures.ts`
  (`listIntentFailures`, `activateManually`, `markRefunded`, `dismissFailure`).
- UI: `src/app/(admin)/admin/subscriptions/pending-review/page.tsx`.

## 2.5 Owner Subscription View

Owner dapat melihat:

- Current plan
- Price
- Billing cycle
- Next billing date
- Subscription status
- Usage (outlet/booth/staff/storage terpakai vs limit)
- Invoice history

Owner dapat melakukan:

- **Upgrade** (langsung prorata atau mulai periode baru)
- **Downgrade** (efektif periode berikutnya)
- **Cancel** (aktif sampai akhir periode berjalan)

## 2.6 Subscription Architecture

Subscription harus **payment-provider agnostic**, konsisten dengan abstraction layer payment (lihat `06-checkout-payment.md`).

Komponen:

- `plan` — definisi paket & limit
- `subscription` — relasi business ↔ plan + status + periode
- `invoice` — tagihan per periode (MVP: record, bukan PDF formal)
- `billing` — integrasi provider subscription (future)

Karena MVP online payment fokus pada QRIS (Pakasir) yang transaksional, **renewal subscription** pada MVP awal dapat menggunakan:

1. **Manual renewal** — owner membayar QRIS invoice tiap periode (paling sederhana, realistis untuk MVP).
2. **Auto-debit** — future enhancement saat provider subscription tersedia.

Penegakan limit (enforcement) terjadi **server-side** saat resource dibuat (contoh: membuat outlet ke-2 pada plan STARTER ditolak dengan error `PLAN_LIMIT_REACHED`).

## 2.7 Feature Flags (per plan)

`features` jsonb contoh:

```json
{
  "voucher": true,
  "finance": true,
  "reports": true,
  "analytics_advanced": false,
  "custom_domain": false,
  "white_label": false,
  "staff": false,
  "event_mode": false,
  "booking": false,
  "qr_delivery": true,
  "custom_branding": false,
  "advanced_templates": false
}
```

Setiap fitur yang di-gate harus dicek server-side (bukan hanya disembunyikan di UI). Middleware/helper `assertFeature(businessId, "voucher")` dipakai pada endpoint terkait.

> **Realita implementasi (update 2026-09-14):** feature-flag runtime gate `assertFeature` **DIIMPLEMENTASI** sebagai `requireFeature(businessId, feature)` di `src/server/feature-gate.ts`. Membaca `plans.features` jsonb dari subscription aktif business, lalu throw `FEATURE_DISABLED` (403) jika fitur tidak aktif. Gate diterapkan di: `src/server/vouchers.ts` (semua fungsi publik), `src/server/finance.ts` (requireFinance + getFinanceSummary), `src/server/reports.ts` (requireReport), `src/server/staff.ts` (inviteStaff — invite baru saja, bukan list/read existing). Pure evaluator di `src/lib/feature-gate.ts` (`isFeatureEnabled`). Gating kuantitatif tetap di `getPlanLimits`/`planLimitError`; entitlement add-on POS tetap di `requirePosAccess`. Fitur `storage` (0054) di-gate di `getStorageLimit` (`src/server/storage-usage.ts`): nonaktif → kuota BASE plan 0, tetapi add-on `extra_storage` aktif tetap dihitung. Tanpa kuota apa pun (base 0 + add-on 0) → upload/finalize di-block `STORAGE_UNAVAILABLE` (pesan "storage tidak termasuk plan", bukan "penuh"); kuota aktif tapi habis → `STORAGE_FULL`.

## 2.7b Subscription Promos (kode promo platform billing — 0014)

Tabel `subscription_promos` + `src/server/subscription-promo.ts`: kode promo yang diterapkan saat owner checkout invoice subscription (upgrade plan / beli add-on).

- Field: `code` (uniq), `type` `percentage|fixed`, `amount`, `min_transaction`, `max_discount` (cap), `start_date`/`end_date`, `usage_limit` (null = unlimited), `used_count`, `is_active`.
- Validasi server-side: aktif, dalam periode, min transaction terpenuhi, cap max_discount (percentage), sisa kuota; diskon integer IDR, dihitung setelah proration-free amount invoice.
- Kegunaan: akuisisi/campaign platform (mis. potongan upgrade GROWTH); tidak berlaku untuk transaksi kiosk customer.

## 2.8 Platform Fee (per plan)

SnapyOS mengenakan **platform fee** configurable per plan (default 0). Field: `plans.platform_fee_percent` + `plans.platform_fee_flat`.

- Dipotong saat sistem mengkredit saldo owner dari payment `paid` (lihat `14-settlement-withdrawal.md`).
- Tidak dihitung sebagai revenue owner; tercatat sebagai pendapatan platform.
- Admin melihat gross / fee / net pada payment monitoring.

## 2.9 Add-on Sesi (Concurrent Session Add-on)

**Purpose:** Menambah limit perangkat online (seat) tanpa upgrade plan penuh.

- Add-on dijual berulang mengikuti siklus plan, dengan harga terpisah per
  siklus: `price_daily`, `price_weekly`, `price_monthly`, `price_yearly`
  (0093). `NULL` = add-on tidak dijual untuk siklus itu.
- Contoh: `Add-on +1 Sesi — Rp49.000/bulan`, `Rp10.000/hari`.
- Checkout hanya menampilkan/menagih add-on yang punya harga untuk siklus plan
  yang dipilih. Plan change/renewal ditolak bila add-on aktif (yang tidak
  dijadwalkan batal) tidak punya harga untuk siklus tujuan; owner harus
  membatalkan add-on itu dulu. Add-on yang sudah `cancel_at_period_end`
  otomatis di-`cancelled` saat pindah siklus agar tidak terbawa gratis.
- Masing-masing add-on menambah `+1` ke `max_concurrent_sessions` efektif (= seat / device online).
- `max_concurrent_sessions` efektif = `plans.max_concurrent_sessions + sum(add-ons aktif)`.

**Entity:**

- `add_ons` — `{ id, code, name, price_monthly, price_daily, price_weekly, price_yearly, unit (session), is_active }`
- `subscription_add_ons` — m2m `{ subscription_id, add_on_id, quantity, status }`

**Flow:**

1. Owner di halaman Subscription melihat "Perangkat online: 1/3".
2. Klik `[ TAMBAH SESI ]` → pilih add-on → konfirmasi (langsung efektif, tagihan bulanan).
3. Saat customer mulai sesi, server cek jumlah device online vs limit efektif.

**Enforcement (server-side):** saat `POST /sessions`, hitung `COUNT(sessions WHERE business_id=X AND status='active')`; jika ≥ limit efektif → `SESSION_LIMIT_REACHED`.

**Acceptance:**

- Owner default bisa jalan 1 sesi.
- Membeli add-on menambah limit sesi bersamaan.
- Memulai sesi melebihi limit ditolak.
- Add-on ditagihkan bulanan & bisa dibatalkan.
