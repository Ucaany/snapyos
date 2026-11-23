# 6. Checkout & Payment System

## Status Implementasi (audit 2026-08-30)

SESUAI (inti): checkout session + voucher apply + QRIS create/poll/webhook + transitionPaymentToPaid single-winner + side effects idempotent (transaction, voucher usage TOCTOU re-check, result_token, creditBalance fee platform) + settlement recovery + Rp0 synthetic paid + duplicate-QR prevention + rate limit. **Hardening:** webhook invoice Tripay fail-closed (signature + wajib server-to-server, C2), credential per-business (H2), idempotency state-aware `received`→`processed` (H3).

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

## 6.3 QRIS Checkout (Tripay)

Sumber: dokumentasi Tripay Closed Payment (`https://tripay.co.id/developer`).

**Model dana (direct merchant):** Customer membayar → dana masuk ke **merchant
owner** (credential per business). Gateway platform (Tripay env `TRIPAY_*`)
hanya dipakai untuk **invoice subscription SnapyOS**; dana langganan masuk akun
Tripay platform, bukan akun tenant. Pakasir sudah dihapus total.

**Flow:** setelah `[ PAY WITH QRIS ]`, backend membuat transaksi Tripay closed
payment, lalu QR ditampilkan pada halaman checkout.

**Autentikasi request:**

- Header `Authorization: Bearer {api_key}`.
- `merchant_code` milik credential business (atau platform untuk invoice).

**Base URL:**

- Sandbox: `https://tripay.co.id/api-sandbox`
- Production: `https://tripay.co.id/api`

**1. Create Transaction — `POST /transaction/create`**

Body (JSON): `method` (`QRIS`), `merchant_ref` (= `payments.order_id`),
`amount`, `customer_name`, `customer_email`, `order_items`, `callback_url`,
`return_url`, `expired_time`, dan `signature` HMAC-SHA256 dari
`merchant_code + merchant_ref + amount` memakai private key.

Response sukses:

| Field          | Ket                                                                    |
| -------------- | ---------------------------------------------------------------------- |
| `reference`    | id transaksi Tripay — disimpan `payments.provider_ref`                  |
| `merchant_ref` | harus sama dengan `order_id` server                                    |
| `amount`       | nominal dasar                                                          |
| `qr_string`    | string QRIS mentah — render sebagai QR code                            |
| `qr_url`       | URL gambar QR (bila ada)                                               |
| `checkout_url` | halaman pembayaran Tripay (fallback redirect)                          |
| `pay_code`     | nomor VA/kode bayar (bila metode VA/retail)                            |
| `expired_time` | waktu kedaluwarsa (Unix detik)                                         |

**2. Check Status — `GET /transaction/detail?reference=...`** (fallback
`merchant_ref=...`) → response `status`: `UNPAID` / `PAID` / `EXPIRED` /
`FAILED` / `REFUND`. Endpoint ini dipakai verifikasi server-to-server sebelum
settlement; signature webhook saja tidak cukup.

**3. History — riwayat transaksi untuk rekonsiliasi** tersedia di dashboard
Tripay merchant; aplikasi tidak memanggil endpoint history.

**Webhook — `POST /api/webhooks/payment/tripay`** (header
`X-Callback-Signature`): HMAC-SHA256 raw body memakai private key credential
(atau `TRIPAY_PRIVATE_KEY` platform untuk invoice subscription). Fail-closed:
signature tidak valid → 401.

**Urutan (server-side):**

1. Buat `checkout_session` (package, voucher, business/outlet/photobox).
2. Hitung final amount backend.
3. Kiosk memilih `method_id`; `POST /payments/create` memvalidasi metode terhadap credential direct aktif Tripay/Midtrans owner. **Tanpa credential aktif, metode online tidak tersedia** — kiosk hanya menawarkan voucher + tunai (dana transaksi masuk rekening owner, bukan platform).
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
5. Verify authenticity: Tripay memakai HMAC-SHA256 `X-Callback-Signature` dari raw body + private key; Midtrans memakai SHA512 signature key. Setelah itu status diverifikasi server-to-server (`GET /transaction/detail` Tripay / status Midtrans) sebelum settle.
6. Verify amount
7. Verify transaction (reference cocok)
8. Update payment status
9. Create/confirm business transaction (`transactions` row → source of truth)
10. Unlock sesi foto (pay-first) + issue `result_token`

**Webhook endpoint:**

```
POST /api/webhooks/payment/tripay
POST /api/webhooks/payment/midtrans
```

Webhook harus merespons **HTTP 200 OK** untuk konfirmasi penerimaan callback. Jika tidak, provider mengulang pengiriman.

**Validasi authenticity (Tripay):** signature `X-Callback-Signature` = HMAC-SHA256 dari **raw body string** memakai private key credential (atau `TRIPAY_PRIVATE_KEY` platform untuk invoice subscription). Fail-closed: signature kosong/tidak valid → **401**. Jangan re-serialize JSON sebelum verifikasi.

Model credential:

- Order **tenant** (payment punya `credential_id` = direct merchant): verifikasi memakai private key credential business.
- Order **non-tenant** (invoice subscription platform): verifikasi memakai env `TRIPAY_PRIVATE_KEY` platform. Tidak ada fallback ke credential tenant.

Setelah itu, backend memverifikasi status transaksi secara server-to-server via Tripay (`GET /transaction/detail`) sebelum memproses payment sebagai paid. Signature webhook saja **tidak** cukup.

### 6.7.1 Aturan amount (`final_amount` vs `total_amount` + admin fee Tripay)

Nominal yang diterima webhook diverifikasi terhadap nilai yang tercatat di
`payments` (`src/lib/direct-webhook.ts`):

- `final_amount` = nominal yang diminta ke customer (dihitung ulang backend).
- `total_amount` = `final_amount` + fee provider. **Tripay menambahkan admin
  fee** ke nominal yang dibayar customer, sehingga `total_amount` callback
  (`total_amount`) bisa > `amount` yang diminta.
- **Aturan:** nominal webhook diterima **hanya bila == `final_amount` ATAU
  == `total_amount`** (bila `total_amount` tercatat; jika null, fallback ke
  `final_amount`). Selebihnya, termasuk nominal null pada jalur direct →
  **reject `amount_mismatch`** (fail-closed). Tidak ada penerimaan rentang/ambang.
- Field yang dibaca: Midtrans `gross_amount`, Tripay `total_amount` (fallback
  `amount`).
- Settlement tetap di-gate **server-to-server re-verify** status provider —
  signature + amount body saja tidak cukup.
- **Uang selalu integer IDR**; tidak ada perubahan logika uang tanpa keputusan eksplisit.

**Payload callback Tripay (sample):**

```json
{
  "reference": "T1234567890",
  "merchant_ref": "SnapyOS-abc123",
  "status": "PAID",
  "total_amount": 31500,
  "amount": 31000,
  "payment_method": "QRIS",
  "paid_at": 1786936081
}
```

**Schema payload webhook Tripay (field & tipe):**

| Field          | Tipe    | Ket                                                                    |
| -------------- | ------- | ---------------------------------------------------------------------- |
| `merchant_ref` | string  | harus cocok `payments.order_id`                                        |
| `reference`    | string  | id transaksi provider (disimpan `provider_ref`)                        |
| `status`       | string  | `UNPAID` / `PAID` / `EXPIRED` / `FAILED` / `REFUND`                    |
| `total_amount` | integer | nominal yang dibayar (termasuk fee)                                    |
| `amount`       | integer | nominal dasar (fallback bila `total_amount` absen)                     |

Webhook harus:

- Verifikasi `X-Callback-Signature` (fail-closed 401)
- Verifikasi server-to-server: `GET /transaction/detail` ke Tripay (WAJIB untuk event `paid`)
- Validate `merchant_ref` → `payments.order_id` (reference cocok)
- Validate amount (cocok dengan `payments.final_amount` atau `payments.total_amount`)
- Validate business (dari payment yang ditemukan)
- Update payment status
- Create transaction confirmation (`transactions` row)
- Prevent duplicate processing (**idempotent state-aware**, H3): event diklaim `received` sebelum re-verify, dipromosikan `processed` setelah settlement sukses; `received`/`error` tidak memblokir redelivery, `processed`/`ignored` memblokir
- Log webhook events (`payment_webhooks` table)

**Idempotency (state-aware, H3):** setiap event memakai `merchant_ref` + `status` + reference unik. Event dicatat status `received` (non-authoritative) SEBELUM verifikasi provider; dipromosikan ke `processed` HANYA setelah `transitionPaymentToPaid` sukses. Redelivery event yang sebelumnya gagal (`received`/`error`) BOLEH diproses ulang dan settle; event yang sudah `processed`/`ignored` tidak double-settle. Recovery polling (`qris.ts`, `invoice.ts`) tetap jaring terakhir.

**Acceptance:** (AC 26–28) webhook diproses, idempotent, tidak duplikat.

### Direct Merchant Webhook (Phase 3)

Route global: `POST /api/webhooks/payment/midtrans`, `POST /api/webhooks/payment/tripay`.

- Midtrans: validasi JSON `order_id`, `status_code`, `gross_amount`, `signature_key`, `transaction_status`; verifikasi SHA512(`order_id + status_code + gross_amount + server_key`). Hanya `capture`/`settlement` dengan `fraud_status='accept'` menjadi paid.
- Tripay: baca raw text sebelum parse JSON; validasi `merchant_ref`, `status`, `total_amount` (fallback `amount`); verifikasi `X-Callback-Signature` sebagai HMAC-SHA256 raw body memakai private key.
- Lookup hanya memakai Midtrans `order_id` atau Tripay `merchant_ref` terhadap `payments.order_id`. `business_id`, provider, credential ID, payment ID dari webhook tidak dipercaya.
- Setelah payment ditemukan, server hanya memakai `payments.credential_id`. Credential null, credential hilang, atau provider route tidak cocok ditolak — kecuali invoice subscription platform (`invoice_payments.credential_id` null → gateway platform Tripay).
- Event provider-prefixed di-klaim ke `payment_webhooks.event_id` (status `received`) sebelum verifikasi/re-verify, lalu dipromosikan `processed` setelah transisi sukses (H3). Replay sukses tanpa transaction, ledger, balance credit, atau audit tambahan; event gagal-verify tetap bisa di-redeliver.
- Direct merchant memakai `transitionPaymentToPaid()` dan `runPaidSideEffects()`: transaction `payment_method='qris'`, tanpa `creditBalance`, platform fee menjadi receivable idempotent.
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
  ├── TripayProvider    (tripay.co.id)
  └── MidtransProvider  (midtrans.com)
```

Interface minimal (`PaymentGateway` — `src/server/payment/providers/types.ts`):

```
createTransaction(input): GatewayCreateResult  // { orderId, amount, totalAmount, qrString, qrImageUrl, paymentUrl, vaNumber, expiresAt, providerRef }
getStatus(orderId, amount?, providerRef?): GatewayStatus
verifyWebhook(payload, signature): boolean     // Midtrans SHA512 / Tripay HMAC
cancelTransaction?(orderId): boolean           // hanya Midtrans (dipakai test sandbox)
```

Business logic **tidak** tightly coupled ke implementasi provider. Provider dipilih dari credential DB (registry). Untuk invoice subscription, `credential_id` null berarti gateway platform Tripay (env `TRIPAY_*`); tidak ada fallback ke credential tenant.

**Env vars (invoice subscription platform saja):**

| Var                    | Keterangan                                              |
| ---------------------- | ------------------------------------------------------- |
| `TRIPAY_MERCHANT_CODE` | Merchant code akun Tripay SnapyOS (invoice subscription) |
| `TRIPAY_API_KEY`       | API key akun Tripay SnapyOS                             |
| `TRIPAY_PRIVATE_KEY`   | Private key untuk signature create + webhook            |

Credential direct merchant (Tripay/Midtrans per business) disimpan di
`payment_credentials` — bukan env — dan dana masuk rekening owner.

---

## 6.10 Payment Methods

Kiosk menampilkan metode yang diaktifkan owner pada credential direct Tripay/Midtrans: QRIS, VA, dan metode redirect yang didukung adapter. Bila tidak ada credential direct aktif, kiosk hanya menawarkan voucher + tunai. Voucher 100% membuat payment paid sintetik tanpa gateway. Voucher parsial kembali ke method picker untuk melunasi sisa. Cash membuat payment `pending` dan hanya operator dengan Auth.js session + membership `payment:confirm` yang dapat mengonfirmasi; kiosk customer tidak pernah self-confirm. Cash tidak mengkredit saldo owner.

Transaction system tetap mendukung method: `qris`, `cash`, `bank_transfer`, `other`, `offline`, `manual`, `voucher`.

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
- **provider_ref** (transaction_id Midtrans / reference Tripay)
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

Dua provider terintegrasi penuh (create → tampil → webhook → settlement). Owner
mengelola credential di `/dashboard/payment` (server actions
`src/server/payment-credential-actions.ts`); webhook & log tercatat otomatis.

| Provider     | Metode kiosk                                               | Verifikasi webhook                                                                                                 | Webhook route                         |
| ------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| **Midtrans** | QRIS, GoPay, ShopeePay, VA (BCA/BNI/BRI/Permata)           | SHA512(`order_id`+`status_code`+`gross_amount`+`server_key`); hanya `capture`/`settlement` + `fraud_status=accept` | `POST /api/webhooks/payment/midtrans` |
| **Tripay**   | QRIS, VA (BCA/BNI/BRI/Mandiri/Permata), Alfamart/Indomaret | HMAC-SHA256 raw body via private key (`X-Callback-Signature`)                                                      | `POST /api/webhooks/payment/tripay`   |

**Alur umum (semua provider):**

1. Kiosk pilih metode → `POST /payments/create` memvalidasi metode terhadap
   credential direct aktif (gate `direct_payment` plan Growth/Business).
2. Backend buat transaksi provider → simpan `payment` (status, `order_id`,
   `total_amount`, `credential_id`) → tampilkan QR/VA/redirect.
3. Provider kirim webhook → server verifikasi (server-to-server/signature) → cocokkan
   `order_id`/`merchant_ref` → validasi amount → `transitionPaymentToPaid()` +
   `runPaidSideEffects()` (transaction `payment_method='qris'`, platform fee receivable).
4. Setiap event tercatat di `payment_webhooks` (`event_id` unik, idempotent); payload
   diredaksi (`src/lib/error-redaction.ts`). Log bisa dipantau admin di `/admin/payments`.

**Tanpa credential aktif:** kiosk hanya menawarkan voucher + tunai. Voucher 100% =
payment `paid` sintetik tanpa gateway; tunai = payment `pending` menunggu operator
(server-gated, non-withdrawable).

**Env (invoice subscription platform saja):** `TRIPAY_MERCHANT_CODE`,
`TRIPAY_API_KEY`, `TRIPAY_PRIVATE_KEY`.
URL webhook yang dikirim ke provider dibangun dari `SnapyOS_PUBLIC_BASE_URL`
(`paymentWebhookUrl()`), bukan env terpisah. Credential
direct merchant disimpan per business, bukan env.

---

## 6.14 Wizard Kredensial Gateway (dashboard owner)

Halaman `/dashboard/payment` (`PaymentGatewaySettings` → `PaymentCredentialCard` → `PaymentCredentialForm`). Hanya **owner** (`assertPaymentCredentialOwner`); manager/staff ditolak `FORBIDDEN`.

**Langkah wizard (satu form, field dinamis per provider):**

1. **Provider** — `tripay` | `midtrans`. Tidak bisa diubah saat mengedit (credential = satu provider).
2. **Environment** — `sandbox` | `production`. Credential dipakai kiosk hanya bila `environment` = `gatewayEnvironment()` (`PAYMENT_GATEWAY_ENV`, else `NODE_ENV`).
3. **Label** (opsional, ≤80) — nama tampilan, mis. "Gateway utama".
4. **Field rahasia** per provider (`PAYMENT_FIELD_LABELS`) — label mengikuti provider, bukan generik:

   | Provider | `merchant_id` | `server_key` | `client_key` | `private_key` |
   | -------- | ------------- | ------------ | ------------ | ------------- |
   | Midtrans | Merchant ID   | Server Key   | Client Key   | —             |
   | Tripay   | Merchant Code | API Key      | —            | Private Key   |

   Kewajiban saat **create** (`REQUIRED_ON_CREATE`): Midtrans `server_key`; Tripay `server_key` + `private_key`. Saat **edit**, field rahasia kosong berarti **nilai lama dipertahankan** (tidak pernah ditampilkan kembali).

5. **Metode pembayaran** (`PaymentMethodSelector`) — checkbox dari `PAYMENT_METHODS`, **minimal satu**:

   | Provider | Metode                                                                               |
   | -------- | ------------------------------------------------------------------------------------ |
   | Midtrans | `qris`, `gopay`, `shopeepay`, `bca`, `bni`, `bri`, `permata`                         |
   | Tripay   | `QRIS`, `BCAVA`, `BNIVA`, `BRIVA`, `MANDIRIVA`, `PERMATAVA`, `ALFAMART`, `INDOMARET` |

6. **Aktifkan** (`is_active`) — maksimum **2 credential aktif** per business (`MAX_ACTIVE_PAYMENT_CREDENTIALS`); melebihi batas ditolak `VALIDATION_ERROR`.
7. **Simpan** → `createCredentialAction` / `updateCredentialAction`. Secret dienkripsi AES-256-GCM di app layer; projection publik hanya mengembalikan `merchant_id`, `client_key`, `enabled_methods`, `webhook_url`/`webhook_reason`.

**Tes koneksi** (`testCredentialAction` → `canTestCredentialInEnvironment`):

- Midtrans: membuat transaksi uji lalu membatalkannya — **hanya sandbox**, tombol nonaktif di production dengan alasan eksplisit.
- Tripay: probe status non-destruktif (tidak membuat transaksi yatim), aman di environment apa pun.

**Normalisasi metode (backend sumber kebenaran):**

- Tulis: `assertEnabledPaymentMethods(provider, methods)` menolak metode asing (**bukan** dibuang diam-diam) dengan pesan berisi daftar valid; minimal satu setelah dedup.
- Baca publik: `allowedPaymentMethods` menyaring ulang terhadap daftar yang didukung. `normalizePaymentMethod(provider, method)` memetakan ejaan ke bentuk kanonik via `trim().toUpperCase()` (mis. `qris` → `QRIS` untuk Tripay), dan metode tak dikenal dibuang oleh `kioskSupported` — tidak pernah dipaksa menjadi `qris`.
- ID metode yang dikirim kiosk: `<provider>:<canonicalMethod>` (`paymentMethodId`). Kiosk **tidak** memilih credential dari payload; server me-resolve credential dari `payments.credential_id`.

**Syarat webhook URL** (`paymentWebhookStatus` di `src/lib/payment-credentials.ts`):

Webhook URL **tidak disimpan** di DB (`payment_credentials.webhook_url` dihapus migrasi `0042`); nilainya dihitung dari `SnapyOS_PUBLIC_BASE_URL` + `/api/webhooks/payment/<provider>`. URL hanya valid bila:

1. `SnapyOS_PUBLIC_BASE_URL` **terisi** — kosong → `webhook_url = null`, alasan "SnapyOS_PUBLIC_BASE_URL kosong".
2. Nilainya **URL valid** — gagal parse → `null`, alasan "bukan URL valid".
3. Protokolnya **HTTPS** — `http://` ditolak, alasan "webhook wajib HTTPS".

Selama salah satu gagal, dashboard menampilkan `webhook_reason` dan tombol **Salin webhook URL** disembunyikan. Kiosk juga tidak menawarkan metode online selama webhook belum aktif (`listKioskCredentials` menyaring `!paymentWebhookUrl(provider)`).

**Registrasi di sisi provider:** salin URL hasil hitung ke dashboard provider (Midtrans: Settings → Payment Notification URL; Tripay: Callback URL). Signature yang dipakai verifikasi adalah nilai yang tersimpan pada credential, bukan env platform.
