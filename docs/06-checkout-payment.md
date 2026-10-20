# 6. Checkout & Payment System

## Status Implementasi (audit 2026-08-30)

SESUAI (inti): checkout session + voucher apply + QRIS create/poll/webhook + transitionPaymentToPaid single-winner + side effects idempotent (transaction, voucher usage TOCTOU re-check, result_token, creditBalance fee platform) + settlement recovery + Rp0 synthetic paid + duplicate-QR prevention + rate limit. **Hardening 2026-10-08:** webhook invoice Pakasir fail-closed (wajib server-to-server, C2), secret per-credential (H2), idempotency state-aware `received`→`processed` (H3), freshness ±24 jam.

BELUM / TIDAK SESUAI:

- `GET /qris/history` — belum ada endpoint.
- Transisi `refund`/`failed`/`cancelled` pada payments — state machine belum penuh (backlog refund).
- Voucher `usage_per_customer` — TIDAK di-enforce (ponytail: skip; butuh identitas customer stabil — dikerjakan bila voucher abuse nyata).
- Kontradiksi §6.6: dokumen menyatakan "GENERATE NEW QRIS" saat expiry; implementasi = **void stale + reuse pending unexpired** (anti double-QR) — spec kalah oleh kode, jadikan realita acuan.

## 6.1 Checkout UI

**Layout:**

```
ORDER SUMMARY
Package        Rp35.000
Voucher        [ ________ ] [ APPLY ]
Discount       -Rp3.500
TOTAL          Rp31.500

[ PAY WITH QRIS ]
```

**Saat QRIS muncul:**

```
SCAN QRIS
[ QR CODE ]
Rp31.500
Waiting for payment...
Expires in 04:32   (timer)
Status indicator
```

**UI/Components:** `Card` order summary, `Input` + `Button` voucher, `QRCode`, `CountdownTimer`, `StatusBadge`. Neo-Brutalism di seluruh checkout.

---

## 6.2 Voucher Checkout

**Flow UI:**

```
"Have a voucher?"
[ ENTER VOUCHER CODE ] [ APPLY ]
```

- Valid → `✓ Voucher applied` + `Discount -Rp5.000`
- Invalid → `"Voucher is invalid or expired."`

**Backend validation (server-side, source of truth):**

- Voucher exists
- Business ownership (voucher milik business yang sedang transaksi)
- Active status
- Date validity (start/end)
- Usage limit (total)
- Usage per customer (limit per customer)
- Minimum transaction
- Maximum discount
- Package eligibility
- Outlet eligibility
- Customer usage limit

**API:**

- `POST /api/v1/public/:businessSlug/checkout/apply-voucher` → `{ voucher, discount_amount, final_amount, checkout_session_id }`

**Rule:** frontend **tidak** boleh jadi source of truth; final amount dihitung ulang backend (lihat 6.5).

---

## 6.3 QRIS Checkout (Pakasir)

Sumber dokumentasi: `https://pakasir.com/p/docs` (API **v2**).

> **API v2 (dipakai kode saat ini).** Dokumen lama semula menuliskan v1
> (`POST /transactioncreate/qris`, `payment_number`, auth body). Kode sudah
> migrasi ke v2 — v2 adalah kenyataan yang diacu di bawah.

**Model dana (direct merchant):** Customer membayar → dana masuk ke **project
merchant owner** (credential per business). Aggregator platform (dana → akun
SnapyOS → saldo owner → withdrawal) **dihapus** (docs/README v1.7/v1.8). Flow lama
`14-settlement-withdrawal.md` historis.

**Flow:** setelah `[ PAY WITH QRIS ]`, backend membuat transaksi QRIS dinamis via
Pakasir, lalu QR ditampilkan pada halaman checkout.

**Autentikasi request:**

- `X-Api-Key` header — API key project Pakasir owner.
- `project` slug — dipakai sebagai path param, bukan body.

**Base URL:**

- Produksi & Sandbox: `https://app.pakasir.com` (dikonfigurasi via `PAKASIR_BASE_URL`; default tanpa `/api`).

**1. Create Transaction — `POST /api/v2/create-transaction/{project}/{order_id}`**

Request header: `X-Api-Key`. Body (JSON): `{ "method": "qris", "amount": <integer> }`.

Response sukses:

| Field           | Ket                                                                                   |
| --------------- | ------------------------------------------------------------------------------------- |
| `order_id`      | sama dengan request                                                                   |
| `txn_id`        | id transaksi provider — disimpan `payments.provider_ref`, dipakai status endpoint     |
| `amount`        | nominal diminta                                                                       |
| `total_payment` | `amount + fee` — **TAMPILKAN ini ke pembeli** (kode menyimpan sebagai `total_amount`) |
| `qr_string`     | string QRIS mentah — render sebagai QR code di frontend                               |
| `expired_at`    | waktu kedaluwarsa (ISO)                                                               |

> **PENTING:** Sistem Pakasir menambahkan fee (kode unik) ke nominal. Selalu
> gunakan `total_payment` dari response sebagai angka yang ditampilkan ke
> pembeli. Kode menyimpan: `amount` (asli), `amount_uniq` (`total_payment −
amount`), `total_amount` (= `total_payment`) ke table `payments`.

**2. Check Status — `GET /api/v2/transaction-status/{project}/{txn_id}`** (header
`X-Api-Key`) → response `status`: `pending` / `completed` / `canceled` (v2,
kecil; kanonikalisasi toleran terhadap `SUCCESS`/`PAID`/`COMPLETED` legacy).
`txn_id` diambil dari `payments.provider_ref`; fallback ke `order_id` untuk
payment legacy in-flight. Endpoint ini dipakai verifikasi server-to-server
sebagai pengganti validasi signature webhook.

**3. History — riwayat transaksi untuk rekonsiliasi** tersedia di dashboard
Pakasir (proyek owner); tidak ada endpoint history yang dipanggil aplikasi.

**Webhook — `POST /api/webhooks/payment/pakasir`** (header `X-Secret`):
verifikasi secret timing-safe terhadap `metadata.webhook_secret_encrypted` per
credential owner, atau `PAKASIR_WEBHOOK_SECRET` env untuk invoice aggregator.
Fail-closed: secret tidak dikenal → 401.

**Urutan (server-side):**

1. Buat `checkout_session` (package, voucher, business/outlet/photobox).
2. Hitung final amount backend.
3. Kiosk memilih `method_id`; `POST /payments/create` memvalidasi metode terhadap credential direct aktif Pakasir/Midtrans/Tripay owner. **Tanpa credential aktif, metode online tidak tersedia** — kiosk hanya menawarkan voucher + tunai (fallback QRIS Pakasir aggregator platform dihapus 2026-09-18; dana transaksi masuk rekening owner, bukan platform).
4. Untuk voucher 100%, buat payment paid sintetik. Untuk cash, buat payment `pending` menunggu operator. Untuk gateway, buat transaksi provider dan simpan data tampilan QR/VA/redirect.
5. Simpan `payment` row dengan status, `order_id`, `payment_reference`, `total_amount`, `expires_at`, dan `credential_id` bila direct merchant. Response hanya berisi data tampilan yang aman untuk kiosk.

> **v2 pay-first:** checkout & payment terjadi **sebelum sesi foto**. Setelah webhook `paid` → `transactions.paid` + sesi boleh dibuat (`POST /public/:slug/sessions` syarat checkout_session **paid**) + timer sesi mulai + `result_token` di-issue. Foto baru di-upload setelah paid.

> **Hardening (implementasi):**
>
> - **Limit sesi diperketat**: kapasitas sesi (plan `max_concurrent_sessions` + 1 sesi aktif per photobox) dicek di `POST /checkout` dan `POST /payments/create` — customer tidak bisa membayar untuk sesi yang tidak akan bisa dimulai (`SESSION_LIMIT_REACHED`).
> - **Anti double payment**: checkout baru untuk sebuah photobox menghanguskan semua checkout `open` + payment `creating`/`pending` photobox tsb → hanya ada **satu QR hidup per booth**. Reservation `creating` + partial unique index juga menahan dua POST paralel pada checkout yang sama. Payment pending yang masih hidup dicek dulu ke provider (bila ternyata sudah dibayar → transisi paid + side effects, bukan di-void). QR yang sudah di-void tapi tetap dibayar customer **tetap diakui**: webhook `paid` bisa transisi `expired → paid` (amount valid) — tidak ada uang terpotong tanpa transaksi.
> - **Expiry QR owner-configurable**: `business_settings.checkout.qris_expiry_minutes` (default **3 menit**, rentang 1–60, diatur dari dashboard Settings). Expiry efektif = min(expiry provider, setting). Selama QR hidup, customer tidak bisa membuat QR baru — satu-satunya jalan adalah kembali ke halaman package (QR lama otomatis hangus).
> - **RATE_LIMITED (429)** membawa `details.retry_after` (detik) — kiosk mengunci tombol bayar sampai retry-after habis (anti spam → double pay).
> - **Offline**: sesi kiosk tetap berjalan tanpa koneksi; foto difinalisasi ke antrian lokal (IndexedDB) lalu disinkronkan otomatis saat online kembali (grace window server 10 menit). Pembayaran tetap bisa diproses sampai sesi selesai — status di-recover via polling saat reconnect.

**UI/Components:** method picker, `QRCode` bila gateway memberi QR, VA display/copy, redirect action, voucher input, cash-waiting, `CountdownTimer` (dari `expired_at`), `PaymentStatus`.

---

## 6.4 Payment Status

**Status enum:** `pending`, `paid`, `failed`, `expired`, `cancelled`, `refunded`.

**Customer experience:**

| Status  | UI                                                   |
| ------- | ---------------------------------------------------- |
| Pending | "Waiting for payment." + timer                       |
| Paid    | "Payment successful." → generate result              |
| Failed  | "Payment failed." + `[ TRY AGAIN ]`                  |
| Expired | "Payment session expired." + `[ GENERATE NEW QRIS ]` |

**Acceptance:** (AC 25–31) QRIS tampil, status terverifikasi, expired/failed tertangani.

---

## 6.5 Transaction Pricing (Backend Source of Truth)

**Backend selalu menghitung final amount.**

Contoh:

```
Package   Rp35.000
Voucher   -Rp3.500
Final     Rp31.500
```

Perhitungan backend:

```
final = package_price + applicable_pricing − valid_voucher_discount
```

- Frontend **tidak** mengirim final amount sebagai source of truth.
- Payment gateway menerima final amount **dari backend**.
- Server-side memverifikasi ulang pada saat webhook (validasi amount).

---

## 6.6 Payment Expiration

QRIS transaction memiliki expiration dari payment gateway.

- Expired → `"Payment expired."` + `[ GENERATE NEW QRIS ]`.
- **Jangan reuse** transaksi QRIS lama jika provider mensyaratkan transaksi baru. Buat payment baru (`expired` → buat baru dengan reference baru).

---

## 6.7 Payment Verification & Webhook

**Backend memverifikasi payment server-side.** Jangan percaya: frontend payment status, frontend amount, frontend discount, frontend voucher validation.

**Alur backend:**

1. Create payment transaction
2. Generate unique transaction ID
3. Store payment reference
4. Receive webhook/callback
5. Verify authenticity: Pakasir memverifikasi header `X-Secret` (webhook secret v2) lalu status server-to-server via `GET /api/v2/transaction-status/{project}/{txn_id}` (tidak ada signature field — verifikasi via polling status endpoint).
6. Verify amount
7. Verify transaction (reference cocok)
8. Update payment status
9. Create/confirm business transaction (`transactions` row → source of truth)
10. Unlock sesi foto (pay-first) + issue `result_token`

**Webhook endpoint:**

```
POST /api/webhooks/payment/pakasir
```

Webhook harus merespons **HTTP 200 OK** untuk konfirmasi penerimaan callback. Jika tidak, Pakasir mengulang pengiriman.

**Validasi authenticity (Pakasir v2):** Pakasir **tidak** menggunakan signature field. Autentikasi memakai header `X-Secret` yang dibandingkan **timing-safe** (`timingSafeEqual`, `verifyPakasirWebhookSecret` di `src/server/payment/pakasir-utils.ts`; meniru `src/lib/cron-auth.ts`). Fail-closed: `expected` atau `received` kosong → **false**. Model secret (H2, hardening 2026-10-08):

- Order **tenant** (payment punya `credential_id` = direct merchant): secret WAJIB dari `metadata.webhook_secret_encrypted` credential business. Credential tanpa secret per-credential → **401** — TIDAK ada fallback ke secret global platform.
- Order **non-tenant** (aggregator legacy / invoice subscription platform): fallback ke env `PAKASIR_WEBHOOK_SECRET`.

Setelah itu, backend memverifikasi status transaksi secara server-to-server via `GET /api/v2/transaction-status/{project}/{txn_id}` sebelum memproses payment sebagai paid. `provider_signature` null (Pakasir) **TIDAK** auto-pass — verifikasi server-to-server adalah gate wajib (C2).

### 6.7.1 Aturan amount (`final_amount` vs `total_amount` + admin fee Tripay)

Nominal yang diterima webhook diverifikasi terhadap nilai yang tercatat di
`payments` (`src/lib/direct-webhook.ts`):

- `final_amount` = nominal yang diminta ke customer (dihitung ulang backend).
- `total_amount` = `final_amount` + fee provider. Pakasir v2 mengembalikan
  `total_payment` (`amount + fee`) saat create; **Tripay menambahkan admin fee**
  ke nominal yang dibayar customer, sehingga `total_amount` callback Tripay
  (`total_amount`) bisa > `amount` yang diminta.
- **Aturan:** nominal webhook diterima **hanya bila == `final_amount` ATAU
  == `total_amount`** (bila `total_amount` tercatat; jika null, fallback ke
  `final_amount`). Selebihnya, termasuk nominal null pada jalur direct →
  **reject `amount_mismatch`** (fail-closed). Tidak ada penerimaan rentang/ambang.
- Field yang dibaca berbeda per provider: Midtrans `gross_amount`, Tripay
  `total_amount` (fallback `amount`), Pakasir `amount`.
- Settlement tetap di-gate **server-to-server re-verify** (`verifyPakasirPaid` /
  status provider) — signature + amount body saja tidak cukup.
- **Uang selalu integer IDR**; tidak ada perubahan logika uang tanpa keputusan eksplisit.

**Payload callback Pakasir v2 (sample):**

```json
{
  "order_id": "SnapyOS-abc123",
  "txn_id": "vwiqpcriq",
  "status": "completed",
  "amount": 31500,
  "is_sandbox": false,
  "completed_at": "2026-08-16T21:48:01.678Z"
}
```

**Schema payload webhook (field & tipe):**

| Field          | Tipe            | Ket                                                                                   |
| -------------- | --------------- | ------------------------------------------------------------------------------------- |
| `order_id`     | string          | harus cocok `payments.order_id`                                                       |
| `txn_id`       | string?         | id transaksi provider (opsional)                                                      |
| `status`       | string          | v2: `pending` / `completed` / `canceled` (kanonikalisasi toleran `SUCCESS`/`PAID`)    |
| `amount`       | integer         | nominal DASAR (opsional; wajib cocok `final_amount` atau `total_amount` bila dikirim) |
| `completed_at` | string ISO-8601 | waktu bayar v2 (opsional)                                                             |
| `payment_date` | string datetime | waktu bayar v1/legacy (opsional; dipakai bila `completed_at` absen)                   |

Webhook harus:

- Verifikasi header `X-Secret` (fail-closed 401; secret per-credential untuk order tenant)
- Verifikasi server-to-server: `GET /api/v2/transaction-status/{project}/{txn_id}` ke Pakasir (WAJIB untuk event `paid`; signature null tidak cukup)
- Freshness: tolak bila `completed_at` (fallback `payment_date`) di luar jendela ±24 jam (anti replay/clock-skew, H2)
- Validate `order_id` → `payments.order_id` (reference cocok)
- Validate amount (cocok dengan `payments.final_amount` atau `payments.total_amount`)
- Validate business (dari payment yang ditemukan)
- Update payment status
- Create transaction confirmation (`transactions` row)
- Prevent duplicate processing (**idempotent state-aware**, H3): event diklaim `received` sebelum re-verify, dipromosikan `processed` setelah settlement sukses; `received`/`error` tidak memblokir redelivery, `processed`/`ignored` memblokir
- Log webhook events (`payment_webhooks` table)

**Idempotency (state-aware, H3):** setiap event memakai `order_id` + `status` unik. Event dicatat status `received` (non-authoritative) SEBELUM verifikasi provider; dipromosikan ke `processed` HANYA setelah `transitionPaymentToPaid` sukses. Redelivery event yang sebelumnya gagal (`received`/`error`) BOLEH diproses ulang dan settle; event yang sudah `processed`/`ignored` tidak double-settle. Recovery polling (`qris.ts`, `invoice.ts`) tetap jaring terakhir.

**Acceptance:** (AC 26–28) webhook diproses, idempotent, tidak duplikat.

### Direct Merchant Webhook (Phase 3)

Route global: `POST /api/webhooks/payment/midtrans`, `POST /api/webhooks/payment/tripay`, dan Pakasir aggregator (`POST /api/webhooks/payment/pakasir`).

- Midtrans: validasi JSON `order_id`, `status_code`, `gross_amount`, `signature_key`, `transaction_status`; verifikasi SHA512(`order_id + status_code + gross_amount + server_key`). Hanya `capture`/`settlement` dengan `fraud_status='accept'` menjadi paid.
- Tripay: baca raw text sebelum parse JSON; validasi `merchant_ref`, `status`, `total_amount` (fallback `amount`); verifikasi `X-Callback-Signature` sebagai HMAC-SHA256 raw body memakai private key.
- Lookup hanya memakai Midtrans `order_id` atau Tripay `merchant_ref` terhadap `payments.order_id`. `business_id`, provider, credential ID, payment ID dari webhook tidak dipercaya.
- Setelah payment ditemukan, server hanya memakai `payments.credential_id`. Credential null, credential hilang, atau provider route tidak cocok ditolak. Nominal provider harus sama dengan `payments.final_amount` atau `payments.total_amount`.
- Event provider-prefixed di-klaim ke `payment_webhooks.event_id` (status `received`) sebelum verifikasi/re-verify, lalu dipromosikan `processed` setelah transisi sukses (H3). Replay sukses tanpa transaction, ledger, balance credit, atau audit tambahan; event gagal-verify tetap bisa di-redeliver.
- Direct merchant memakai `transitionPaymentToPaid()` dan `runPaidSideEffects()`: transaction `payment_method='gateway'`, tanpa `creditBalance`, platform fee menjadi receivable idempotent. `credential_id IS NULL` tetap aggregator mode Pakasir.
- Respons webhook aman: hanya acknowledgement. Payload, secret, credential, tenant, dan error internal tidak dikembalikan; payload log meredaksi field secret.

---

## 6.8 Payment Failure Handling

Handle kasus:

- QRIS creation failure
- Network timeout
- Pending payment
- Expired payment
- Failed payment
- Duplicate webhook
- Customer refresh
- Customer closes checkout
- Payment succeeds but browser disconnects
- Delayed webhook
- Payment succeeds after browser reload

**Prinsip:** status payment harus dapat **dipulihkan** menggunakan secure transaction reference. Endpoint status:

- `GET /api/v1/public/:businessSlug/payments/:paymentRef/status` → mengembalikan status terakhir dari provider/DB (recover saat reload).
- Saat result diakses dengan token valid & payment `paid` → result tersedia.

---

## 6.9 Payment Abstraction Layer

```
PaymentService (interface)
  ├── PakasirProvider   (pakasir.com)
  └── FutureProvider
```

Interface minimal (`PaymentGateway` — `src/server/payment/providers/types.ts`):

```
createTransaction(input): GatewayCreateResult  // { orderId, amount, totalAmount, qrString, qrImageUrl, paymentUrl, vaNumber, expiresAt, providerRef }
getStatus(orderId, amount?, providerRef?): GatewayStatus
verifyWebhook(payload, signature): boolean     // Midtrans SHA512 / Tripay HMAC / Pakasir true (server-to-server)
cancelTransaction?(orderId): boolean           // hanya Midtrans (dipakai test sandbox)
```

Business logic **tidak** tightly coupled ke implementasi provider. Provider dipilih dari credential DB (registry) atau fallback aggregator env; mudah ditambah di masa depan. Base URL diisolasi di provider config (`PAKASIR_BASE_URL`, default: `https://app.pakasir.com`).

**Env vars (invoice subscription aggregator saja):**

| Var                      | Keterangan                                                |
| ------------------------ | --------------------------------------------------------- |
| `PAKASIR_API_KEY`        | API key akun Pakasir SnapyOS (invoice subscription)       |
| `PAKASIR_PROJECT_SLUG`   | Project slug Pakasir SnapyOS                              |
| `PAKASIR_WEBHOOK_SECRET` | Webhook secret v2 (Detail Proyek Pakasir)                 |
| `PAKASIR_BASE_URL`       | Base URL API Pakasir (default: `https://app.pakasir.com`) |

Credential direct merchant (Pakasir/Midtrans/Tripay per business) disimpan di
`payment_credentials` — bukan env — dan dana masuk project owner.

---

## 6.10 Payment Methods

Kiosk menampilkan metode yang diaktifkan owner pada credential direct Pakasir/Midtrans/Tripay: QRIS, VA, dan metode redirect yang didukung adapter. Bila tidak ada credential direct aktif, kiosk hanya menawarkan voucher + tunai (fallback aggregator dihapus 2026-09-18). Voucher 100% membuat payment paid sintetik tanpa gateway. Voucher parsial kembali ke method picker untuk melunasi sisa. Cash membuat payment `pending` dan hanya operator dengan Auth.js session + membership `payment:confirm` yang dapat mengonfirmasi; kiosk customer tidak pernah self-confirm. Cash tidak mengkredit saldo owner.

Transaction system tetap mendukung method: `qris`, `gateway`, `cash`, `bank_transfer`, `other`, `offline`.

---

## 6.11 Payment Data Entity

Field minimal (`payments`, detail di `07-database-schema.md`):

- Payment ID
- Transaction ID (link ke `transactions`)
- Business ID
- Outlet ID
- Photobox ID
- Session ID
- Package ID
- Gross amount
- Discount amount
- Voucher ID
- Final amount
- **order_id** (dikirim ke provider; format `SnapyOS-<ref>`)
- **provider_ref** (txn_id Pakasir / transaction_id Midtrans / reference Tripay)
- **qr_string** (payload tampilan terenkode untuk kiosk)
- **amount_uniq** (kode unik dari provider)
- **total_amount** (nominal yang dibayar pembeli = final + uniq)
- Payment provider
- Payment reference
- Payment status
- Created at
- Paid at
- Expired at

---

## 6.12 Payment State Machine

```
creating ── QR dibuat ──▶ pending ── pay success ──▶ paid ── refund ──▶ refunded
    │                         │
    └── provider gagal ───────┴── expire ─────────▶ expired
```

- `creating` adalah reservation DB singkat sebelum request gateway; partial unique index menjamin satu payment aktif per checkout.
- `creating`/`pending` → `paid` hanya setelah webhook atau polling gateway terverifikasi.
- `creating`/`pending` → `expired` saat provider gagal atau timeout.
- `pending` → `failed` (declined)
- `paid` → `refunded`
- `pending` → `cancelled` (user abandon / admin cancel)

Transisi hanya diizinkan dalam arah valid; `paid` tidak bisa kembali ke `pending`.

---

## 6.13 Integrasi Gateway (ringkasan)

Tiga provider terintegrasi penuh (create → tampil → webhook → settlement). Owner
mengelola credential di `/dashboard/payment` (server actions
`src/server/payment-credential-actions.ts`); webhook & log tercatat otomatis.

| Provider     | Metode kiosk                                               | Verifikasi webhook                                                                                                 | Webhook route                         |
| ------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| **Pakasir**  | QRIS dinamis (+kode unik)                                  | header `X-Secret` + server-to-server `GET /api/v2/transaction-status/{project}/{txn_id}`                           | `POST /api/webhooks/payment/pakasir`  |
| **Midtrans** | QRIS, GoPay, ShopeePay, VA (BCA/BNI/BRI/Permata)           | SHA512(`order_id`+`status_code`+`gross_amount`+`server_key`); hanya `capture`/`settlement` + `fraud_status=accept` | `POST /api/webhooks/payment/midtrans` |
| **Tripay**   | QRIS, VA (BCA/BNI/BRI/Mandiri/Permata), Alfamart/Indomaret | HMAC-SHA256 raw body via private key (`X-Callback-Signature`)                                                      | `POST /api/webhooks/payment/tripay`   |

**Alur umum (semua provider):**

1. Kiosk pilih metode → `POST /payments/create` memvalidasi metode terhadap
   credential direct aktif (gate `direct_payment` plan Growth/Business).
2. Backend buat transaksi provider → simpan `payment` (status, `order_id`,
   `total_amount`, `credential_id`) → tampilkan QR/VA/redirect.
3. Provider kirim webhook → server verifikasi (server-to-server/signature) → cocokkan
   `order_id`/`merchant_ref` → validasi amount → `transitionPaymentToPaid()` +
   `runPaidSideEffects()` (transaction `payment_method='gateway'`, platform fee receivable).
4. Setiap event tercatat di `payment_webhooks` (`event_id` unik, idempotent); payload
   diredaksi (`src/lib/error-redaction.ts`). Log bisa dipantau admin di `/admin/payments`.

**Tanpa credential aktif:** kiosk hanya menawarkan voucher + tunai (fallback aggregator
Pakasir dihapus 2026-09-18). Voucher 100% = payment `paid` sintetik tanpa gateway;
tunai = payment `pending` menunggu operator (server-gated, non-withdrawable).

**Env (invoice subscription aggregator saja):** `PAKASIR_API_KEY`,
`PAKASIR_PROJECT_SLUG`, `PAKASIR_WEBHOOK_SECRET`, `PAKASIR_BASE_URL`.
URL webhook yang dikirim ke provider dibangun dari `SnapyOS_PUBLIC_BASE_URL`
(`paymentWebhookUrl()`), bukan env terpisah. Credential
direct merchant disimpan per business, bukan env.
