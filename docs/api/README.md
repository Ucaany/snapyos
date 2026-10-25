# Active API Reference

Status: active
Audience: developer, operator, integration owner
Last updated: 2026-10-05
Last verified: 2026-10-05
Source of truth: route handlers in `src/app/api/`, server actions in `src/server/`, `docs/08-api-spec.md`

## Contract boundary

Server actions adalah jalur utama untuk owner dashboard CRUD. REST hanya dipakai bila client, device, browser download, public kiosk, webhook, atau admin membutuhkan HTTP contract. POS owner tidak memiliki REST API.

Katalog aplikasi (`/admin/apps`, tabel `app_releases`) **tidak** punya REST route: hanya server action. Tidak ada konsumen eksternal yang butuh HTTP contract untuk daftar rilis, dan file installer tidak pernah melewati server SNAPY OS (hanya tautan eksternal).

## Public kiosk

| Method | Route                                                           | Auth             | Purpose                             |
| ------ | --------------------------------------------------------------- | ---------------- | ----------------------------------- |
| GET    | `/api/v1/public/:businessSlug?photobox=<photoboxSlug>`          | Device context   | Ambil konfigurasi kiosk dan package |
| GET    | `/api/v1/public/:businessSlug/packages?photobox=<photoboxSlug>` | Device context   | Ambil package aktif                 |
| GET    | `/api/v1/public/:businessSlug/templates?package=<packageId>`    | Device context   | Ambil template yang cocok           |
| POST   | `/api/v1/public/devices/activate`                               | Activation code  | Pair device sekali pakai            |
| POST   | `/api/v1/public/devices/verify`                                 | Device token     | Verifikasi device saat boot/reload  |
| POST   | `/api/v1/public/:businessSlug/checkout`                         | Device token     | Buat checkout pay-first             |
| POST   | `/api/v1/public/:businessSlug/checkout/apply-voucher`           | Device token     | Validasi voucher                    |
| POST   | `/api/v1/public/:businessSlug/payments/create`                  | Device token     | Reserve payment provider            |
| POST   | `/api/v1/public/:businessSlug/payments/cash-confirm`            | Operator session | Konfirmasi cash                     |
| GET    | `/api/v1/public/:businessSlug/payments/:paymentRef/status`      | Device token     | Recovery status payment             |
| POST   | `/api/v1/public/:businessSlug/sessions`                         | Device token     | Mulai sesi setelah paid             |
| POST   | `/api/v1/public/:businessSlug/sessions/:id/finalize`            | Device token     | Generate result dan print           |
| GET    | `/api/v1/public/results/:resultToken`                           | Public token     | Ambil hasil online                  |

## Request and response rules

Semua nominal adalah integer IDR. Success memakai `{ "data": ... }`. Error memakai `{ "error": { "code": "...", "message": "...", "details": {} } }`. Input divalidasi server-side. Client tidak boleh mengirim `business_id` atau `photobox_id` untuk menggantikan scope yang ditentukan dari device token.

### Create checkout

```json
POST /api/v1/public/klik-foto/checkout
{
  "package_id": "uuid",
  "voucher_code": "PROMO-2026",
  "device_token": "opaque-device-token"
}
```

Response:

```json
{
  "data": {
    "checkout_session_id": "uuid",
    "final_amount": 50000,
    "status": "pending"
  }
}
```

Possible errors: `VALIDATION_ERROR`, `NOT_FOUND`, `VOUCHER_INVALID`, `VOUCHER_EXPIRED`, `VOUCHER_LIMIT_REACHED`, `VOUCHER_MIN_NOT_MET`, `PLAN_LIMIT_REACHED`, `SESSION_LIMIT_REACHED`.

### Create payment

```json
POST /api/v1/public/klik-foto/payments/create
{
  "checkout_session_id": "uuid",
  "device_token": "opaque-device-token",
  "method_id": "credential-or-method-id"
}
```

Response contains display-only payment data: `payment_reference`, `display`, `total_amount`, `expiry_at`, and provider-specific QR, VA, or redirect fields. Secret credentials never return to browser.

Possible errors: `VALIDATION_ERROR`, `NOT_FOUND`, `PAYMENT_ALREADY_PROCESSED`, `PAYMENT_EXPIRED`, `FEATURE_DISABLED`, `RATE_LIMITED`.

### Start session

```json
POST /api/v1/public/klik-foto/sessions
{
  "checkout_session_id": "uuid",
  "device_token": "opaque-device-token"
}
```

Response:

```json
{ "data": { "session_id": "uuid", "expires_at": "2026-10-05T09:00:00Z" } }
```

Possible errors: `NOT_FOUND`, `FORBIDDEN`, `SESSION_EXPIRED`, `SESSION_LIMIT_REACHED`, `VALIDATION_ERROR`.

## Webhooks

| Method | Route                            | Verification                                         |
| ------ | -------------------------------- | ---------------------------------------------------- |
| POST   | `/api/webhooks/payment/pakasir`  | Provider status check and idempotency                |
| POST   | `/api/webhooks/payment/midtrans` | SHA-512 signature, order, amount, credential         |
| POST   | `/api/webhooks/payment/tripay`   | HMAC-SHA256 callback signature, merchant ref, amount |

Webhook payload tidak dipercaya untuk tenant, credential, atau payment ID. Server lookup memakai provider reference yang sudah tersimpan, validasi nominal, provider match, lalu menjalankan transition idempotent.

## Remaining owner and admin routes

Aktif owner REST terbatas pada device activation, device listing/revoke, customer detail, dan report download. Admin routes ada di `/api/v1/admin/*` dan memakai `requireAdmin()`. Detail lengkap dan error global ada di [`../08-api-spec.md`](../08-api-spec.md).

## Removed routes

Owner CRUD REST, withdrawal, balance, subscription REST, dan POS REST bukan API aktif. Gunakan server actions atau flow invoice yang didokumentasikan. Jangan menyalin contoh route legacy dari dokumen arsip.
