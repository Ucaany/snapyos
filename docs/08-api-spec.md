# 8. API Specification

> **Status implementasi per audit 2026-08-30:** endpoint yang dijanjikan tapi belum ada ditandai **[BELUM DIIMPLEMENTASI]**; endpoint yang ada di kode tapi belum terdokumentasi tercantum di §8.20. POS add-on TIDAK punya REST — dijalankan via server actions (`src/server/pos-actions.ts`) + RPC `pos_decrement_stock` (lihat `docs/pos/`).
>
> **UPDATE:** owner CRUD REST telah dihapus. Owner dashboard memakai server actions eksklusif (`src/server/*`). Route REST aktif dipakai untuk device, activation, customer detail, report, public kiosk, webhook, dan admin. Payment kiosk memakai direct merchant credential business, voucher, atau offline cash. Pakasir platform hanya menangani invoice subscription SnapyOS.

## 8.1 Konvensi

- Base: `https://<host>/api/v1`
- Format: JSON. Uang integer IDR.
- Auth (owner/admin): header `Authorization: Bearer <token>` (JWT dari Auth.js) atau session cookie. MVP: session cookie dari Auth.js; API dibaca server-to-server/route handlers yang memakai sesi.
- Public (customer app): `POST/GET /api/v1/public/:businessSlug/...` tanpa login.
- Webhook: `POST /api/webhooks/payment/{pakasir,midtrans,tripay}`.

## 8.2 Response Envelope

Sukses:

```json
{ "data": { ... } }
```

Error:

```json
{
  "error": {
    "code": "PLAN_LIMIT_REACHED",
    "message": "Batas photobox untuk plan STARTER tercapai.",
    "details": {}
  }
}
```

### Kode error standar

| code                        | HTTP | ket                                                  |
| --------------------------- | ---- | ---------------------------------------------------- |
| `UNAUTHORIZED`              | 401  | belum login / token invalid                          |
| `FORBIDDEN`                 | 403  | tidak punya izin / lintas tenant                     |
| `NOT_FOUND`                 | 404  | resource tidak ada / bukan milik user                |
| `VALIDATION_ERROR`          | 422  | input invalid                                        |
| `PLAN_LIMIT_REACHED`        | 422  | limit subscription tercapai                          |
| `SESSION_LIMIT_REACHED`     | 422  | limit sesi aktif bersamaan tercapai                  |
| `SESSION_EXPIRED`           | 410  | v2: timer sesi habis (reset Welcome / auto-finalize) |
| `FEATURE_DISABLED`          | 403  | fitur tidak termasuk plan                            |
| `VOUCHER_INVALID`           | 422  | voucher tidak valid/kadaluarsa                       |
| `VOUCHER_EXPIRED`           | 422  | voucher expired                                      |
| `VOUCHER_LIMIT_REACHED`     | 422  | usage limit tercapai                                 |
| `VOUCHER_MIN_NOT_MET`       | 422  | minimum transaksi belum terpenuhi                    |
| `PAYMENT_ALREADY_PROCESSED` | 409  | idempotency: sudah diproses                          |
| `PAYMENT_EXPIRED`           | 409  | payment expired                                      |
| `PAYMENT_NOT_FOUND`         | 404  |                                                      |
| `RATE_LIMITED`              | 429  |                                                      |
| `PAYLOAD_TOO_LARGE`         | 413  | body request melebihi batas ukuran                   |
| `INTERNAL`                  | 500  |                                                      |

## 8.3 Auth

- `POST /api/auth/register` — **DITUTUP**; selalu HTTP 403 `REGISTRATION_CLOSED`. Akun dibuat admin platform; `/register` publik adalah halaman konsultasi.
- `GET/POST /api/auth/[...nextauth]` — Auth.js handlers
- `GET /api/auth/session` — sesi saat ini
- `POST /api/auth/logout`

## 8.4 Business & Workspace

- `GET /api/v1/me/businesses` — daftar business user (owner-only session).
- `POST /api/v1/businesses` — create business (onboarding). Daftar business hanya melalui endpoint canonical `GET /api/v1/me/businesses`.

> **REMOVED (Fase 5):** `GET/PATCH /api/v1/business/:businessId`, `GET/PATCH /api/v1/business/:businessId/settings`, `GET/PATCH /api/v1/business/:businessId/settings/branding`, `POST /api/v1/business/:businessId/settings/branding/logo`. Semua CRUD business/settings/branding sekarang via server actions (`src/server/business-actions.ts`, `src/server/branding-actions.ts`). Dashboard `/dashboard/settings` + `KioskBrandingEditor` memanggilnya langsung dengan `useActionState`.

## 8.5 Dashboard & Analytics

> **REMOVED (Fase 5):** seluruh `GET /api/v1/business/:businessId/{dashboard,metrics,analytics/**}`. Server actions: `src/server/dashboard.ts`, `src/server/metrics.ts`, `src/server/analytics.ts` — dipanggil langsung oleh page components di `/dashboard/*`.

## 8.6 Outlets / Photoboxes

- `GET /api/v1/business/:businessId/photoboxes/:id/activation` — generate kode+QR aktivasi (dipakai `DeviceDialog`).
- `GET /api/v1/business/:businessId/devices` — daftar device teraktivasi (dipakai `DeviceDialog`).
- `DELETE /api/v1/business/:businessId/devices/:id` — revoke device.
- `GET /api/v1/business/:businessId/storage` — kuota & pemakaian storage (indikator topbar). **M1 (hardening 2026-10-08):** wajib membership — `getMembership(user.id, businessId)` + permission `business:read`; cross-tenant → `404 NOT_FOUND` (bukan 403). Sebelumnya auth-only (IDOR).

> **REMOVED (Fase 5):** `GET/POST /api/v1/business/:businessId/outlets`, `PATCH/DELETE /:id`, `GET /:id/analytics`, `GET/POST/PATCH/DELETE /photoboxes`. Server actions: `src/server/outlets.ts`, `src/server/photoboxes.ts`.

## 8.7 Payment Credentials (Owner only — Phase 2)

> **REST REMOVED (Fase 5); UI RESTORED via server actions (2026-09-18):** `/api/v1/business/:businessId/payment-credentials/**` tidak kembali sebagai REST. UI `/dashboard/settings/payment` aktif kembali dengan model **direct merchant sebagai jalan utama** (credential Pakasir/Midtrans/Tripay owner; aggregator Pakasir platform dihapus dari alur kiosk; tanpa credential aktif kiosk = voucher + tunai). Wiring: `src/server/payment-credential-actions.ts` (server actions) → `src/server/payment-credentials.ts` → `src/server/payment/providers/*`; webhook `/api/webhooks/payment/{midtrans,tripay,pakasir}` aktif. Kontrak legacy di bawah tidak lagi ada sebagai REST.

## 8.7a Packages / Templates / Stickers

> **REMOVED (Fase 5):** `GET/POST/PATCH/DELETE /packages(/:id)`, `GET/POST/PATCH/DELETE /templates(/:id)`, `POST /templates/upload`. Server actions: `src/server/catalog-actions.ts` (packages), `src/server/templates.ts` (CRUD + upload; wrapper action di `src/server/hardware-actions.ts` / grid). Aturan assign template↔package tetap: ditolak kecuali `slot_count == packages.photo_count`. Public template endpoint (`/api/v1/public/:businessSlug/templates?package=`) tidak berubah — masih dipakai kiosk.

## 8.8 Vouchers

> **REMOVED (Fase 5):** `GET/POST/PATCH/DELETE /vouchers(/:id)`, `GET /vouchers/:id/analytics`. Server actions: `src/server/vouchers.ts`.

## 8.9 Transactions / Finance / Reports

- `GET /api/v1/business/:businessId/reports?type=&from=&to=&format=csv|xlsx` — download report (dipakai `<form action>` di `/dashboard/reports`; tidak fetch client-side karena butuh binary + Content-Disposition). `pdf` belum tersedia.

> **REMOVED (Fase 5):** `GET /transactions`, `GET /transactions/:id`, `POST /transactions` (manual), `GET /finance/summary`, `GET/POST /expenses`, `PATCH/DELETE /expenses/:id`. Server actions: `src/server/transactions.ts` (`listTransactions`, `getTransaction`, `createManualTransaction`), `src/server/finance.ts`, `src/server/finance-actions.ts`.

## 8.10 Customers / Bookings

- `GET /api/v1/business/:businessId/customers/:id` — detail customer (dipakai `CustomersTable` toggle).

> **REMOVED (Fase 5):** `GET /customers` (list). Server actions: `src/server/customers.ts`.
>
> Bookings tetap **[BELUM DIIMPLEMENTASI]** (backlog): endpoint `GET/PATCH /api/v1/business/:businessId/bookings` + `POST /api/v1/public/:businessSlug/bookings` belum ada; kalau nanti diaktifkan, kontrak: `starts_at`/`ends_at` ISO 8601, backend UTC, tolak overlap → 409 `BOOKING_SLOT_CONFLICT`, rentang `[from, to)`.

## 8.11 Staff

> **REMOVED (Fase 5):** `GET /staff`, `POST /staff/invite`, `PATCH/DELETE /staff/:userId`. Server actions: `src/server/staff-actions.ts` (invite, ubah role, revoke).

## 8.12 Events

- `GET/POST /api/v1/business/:businessId/events` — **[BELUM DIIMPLEMENTASI]** (backlog: event mode)
- `GET/PATCH/DELETE /api/v1/business/:businessId/events/:id` — **[BELUM DIIMPLEMENTASI]**

## 8.13 Subscription

> **Seluruh section ini [BELUM DIIMPLEMENTASI] sebagai REST.** Alur subscription berjalan via server actions + halaman dashboard (`/dashboard/subscription`) + invoice QRIS (`invoice_payments`, webhook bercabang). Tidak ada endpoint REST subscription yang di-expose.

## 8.13a Add-on Sesi

> **[BELUM DIIMPLEMENTASI] sebagai REST** — pembelian add-on (termasuk POS) via alur invoice subscription existing (server actions). Admin mengelola katalog add-on via `/api/v1/admin/add-ons` (§8.20).

## 8.13b Finance — Saldo & Penarikan (lihat `14-settlement-withdrawal.md`)

> **REMOVED (Fase 5):** `GET /balance`, `POST /withdrawals`, `GET /withdrawals`. Server actions: `src/server/balance.ts`, `src/server/withdrawals.ts`, `src/server/withdrawal-actions.ts`. Ledger tampil di halaman `/dashboard/finance` (tanpa REST); RPC `withdrawable_payments_sum` tetap sebagai source of truth ceiling penarikan (invariant docs/07 §7).

## 8.14 Public (Customer Photobox)

- `GET /api/v1/public/:businessSlug?photobox=<photoboxSlug>` — konfigurasi publik untuk booth: business, branding/welcome, checkout settings, photobox, dan packages. Parameter `photobox` wajib.
- `GET /api/v1/public/:businessSlug/packages?photobox=<photoboxSlug>` — daftar package aktif untuk booth; parameter `photobox` wajib.
- `GET /api/v1/public/:businessSlug/templates?package=`
- `GET /api/v1/public/:businessSlug/stickers` — **[BELUM DIIMPLEMENTASI]** (stiker = emoji API global `GET /api/v1/emoji`, lihat §8.20)
- `POST /api/v1/public/devices/activate` — aktivasi device `{ code }` → `{ device_token }`
- `POST /api/v1/public/devices/verify` — `{ device_token }` → status device (boot/reload)
- `POST /api/v1/public/:businessSlug/checkout` — buat checkout **(v2 pay-first: SEBELUM sesi foto)** (`{ package_id, voucher_code?, device_token }`) → `{ checkout_session_id, final_amount }`. Photobox berasal dari `device_token` terverifikasi; client tidak mengirim `photobox_id`.
- `POST /api/v1/public/:businessSlug/checkout/apply-voucher` — validasi voucher
- `POST /api/v1/public/:businessSlug/payments/create`: buat payment ternormalisasi (`{ checkout_session_id, device_token, method_id }`). Reservation `creating` + partial unique index menjamin satu payment aktif per checkout. Metode hanya berasal dari credential aktif owner (Pakasir/Midtrans/Tripay direct merchant; tanpa credential direct tidak ada fallback aggregator; kiosk hanya menawarkan voucher + tunai); response display-only berisi `display`, QR/VA/redirect data, total integer, reference, dan expiry.
- `POST /api/v1/public/:businessSlug/payments/cash-confirm`: konfirmasi tunai lewat API oleh operator terautentikasi dengan membership `transaction:write` (jalur staff di dashboard memakai server action dengan `payment:confirm`); body `{ payment_reference, device_token }`. Customer kiosk tidak dapat self-confirm.
- `GET /api/v1/public/:businessSlug/payments/:paymentRef/status` — status payment (recover saat reload)
- `POST /api/v1/public/:businessSlug/sessions` — mulai sesi (**syarat: checkout_session paid**) (`{ checkout_session_id, device_token }`) → `{ session_id, expires_at }`; semua endpoint sesi cek `expires_at` → `SESSION_EXPIRED`. Development-only: ketika `DEV_SKIP_PAYMENT` aktif, server juga menerima `{ package_id, device_token }` untuk checkout paid sintetis; jalur ini tidak aktif di production.
- `POST /api/v1/public/:businessSlug/sessions/:id/finalize` — selesai (trigger auto-print + generate result & GIF)
- `GET /api/v1/public/results/:resultToken` — akses result online (unduh GIF slideshow + foto berframe; `gif_url`/`photos[].url` untuk preview + `gif_download_url`/`photos[].download_url` untuk unduh); diakses dari halaman publik `/r/[token]`

## 8.15 Webhook

- `POST /api/webhooks/payment/pakasir` — aggregator Pakasir, **termasuk invoice subscription**. Auth: header `X-Secret` (timing-safe). Order tenant (punya `credential_id`) WAJIB secret per-credential → tanpa itu **401** (tanpa fallback global, H2). Freshness ±24 jam. Event `paid` wajib server-to-server re-verify (C2).
- `POST /api/webhooks/payment/midtrans` — direct merchant only. JSON wajib memuat `order_id`, `status_code`, `gross_amount`, `signature_key`, `transaction_status`; `fraud_status='accept'` wajib untuk `capture`/`settlement`. Server lookup hanya `payments.order_id`, lalu `payments.credential_id`; SHA512 diverifikasi dengan server key credential terdekripsi.
- `POST /api/webhooks/payment/tripay`: direct merchant only. Raw request body dibaca sebelum JSON parse; header `X-Callback-Signature` diverifikasi HMAC-SHA256 dengan private key credential terdekripsi. JSON wajib memuat `merchant_ref`, `status`, dan `total_amount` (fallback `amount`); lookup hanya `merchant_ref` ke `payments.order_id`.

Webhook direct mengabaikan seluruh business/provider/credential/payment ID dari payload, membandingkan nominal provider dengan `payments.final_amount` atau `payments.total_amount`, menolak credential null atau provider mismatch, lalu mencatat `payment_webhooks.event_id` provider-prefixed sebelum state transition. Respons aman hanya `{ "received": true|false }`; secret, credential, tenant, payload, dan error detail tidak dikembalikan.

**Idempotency state-aware (H3, hardening 2026-10-08):** event diklaim `payment_webhooks.status='received'` (non-authoritative) SEBELUM server-to-server re-verify, lalu dipromosikan `processed` HANYA setelah settlement sukses. Enum status: `received` | `processed` | `ignored` | `error` (migrasi `0066_webhook_status_received.sql`; default kolom `received` sejak `0070_webhook_status_default.sql`). Redelivery: `received`/`error` → diproses ulang (boleh settle); `processed`/`ignored` → `duplicate_event`. Recovery polling tetap jaring terakhir.

## 8.16 Admin (Platform)

Prefix `/api/v1/admin` (role `admin`, guard `requireAdmin()` = role='admin' ATAU email di `ADMIN_EMAILS`):

> **M2 (hardening 2026-10-08):** SEMUA route `/api/v1/admin/*` dibungkus `adminRoute`/`adminRawRoute` (`src/lib/api-route.ts`) yang memanggil `requireAdmin()` di **lapisan route** sebelum handler — tidak lagi bergantung pada callee kebetulan memanggil `requireAdmin()`. Tanpa session admin → `401 UNAUTHORIZED`; role bukan admin → `403 FORBIDDEN`. `apiRoute` diberi komentar tegas "TIDAK ADA AUTH" (caller WAJIB guard).

- `GET /api/v1/admin/overview` — total business, active subscribers, MRR, outlets, photoboxes, sessions, transactions
- `GET/POST /api/v1/admin/users` , `GET/PATCH/DELETE /users/:id` (POST + GET detail + riwayat ditambahkan 2026-10-05; DELETE ditambahkan 2026-09-16)
- `GET /api/v1/admin/businesses` , `GET/PATCH /businesses/:id` (suspend/reactivate)
- `GET/POST /api/v1/admin/plans` , `PATCH /plans/:id` (semua limit editable 2026-10-05)
- `GET/POST /api/v1/admin/add-ons` , `PATCH /add-ons/:id`
- `GET/POST /api/v1/admin/promos` , `PATCH /promos/:id` (subscription promo, ditambahkan 2026-09-16; refine update parity create 2026-10-05)
- `GET /api/v1/admin/subscriptions` , `GET/PATCH /subscriptions/:id` (GET detail ditambahkan 2026-10-13)
- `POST /api/v1/admin/subscriptions/:id/add-ons` (attach add-on, reaktivasi row cancelled) + `PATCH/DELETE /api/v1/admin/subscription-add-ons/:id` (PATCH update quantity aktif ditambahkan 2026-10-13; DELETE cancel — body opsional `{ mode?: "deferred"|"immediate", manual_cancel_reason?: string }` — default deferred parity owner, immediate = darurat + reason wajib audit) — ditambahkan 2026-09-16
- `GET/POST /api/v1/admin/templates` + `PATCH/DELETE /admin/templates/:id` — ditambahkan 2026-09-16 (upload template global + toggle is_active; update nama/harga/premium via server action; DELETE hapus template global + blob, cascade purchases 2026-10-12)
- `GET/POST /api/v1/admin/template-categories` + `DELETE /admin/template-categories/:id` — ditambahkan 2026-09-16 (POST teruskan `price` 2026-10-05)
- `GET /api/v1/admin/payments?status=&provider=&from=&to=` + summary
- `GET /api/v1/admin/payments/pos-revenue?from=&to=` — POS revenue per tenant (ditambahkan 2026-09-16)
- > **REMOVED (Fase 5, direct-merchant):** `GET /api/v1/admin/withdrawals`, `POST .../process`, `POST .../reject` — dana kiosk masuk rekening owner langsung, tidak ada ledger penarikan. Lihat §8.13b.
- `GET/PATCH /api/v1/admin/settings`

**Error khusus middleware:**

- `503 MAINTENANCE_MODE` — dikembalikan Next.js Proxy (`src/proxy.ts`) saat `platform_settings.maintenance_mode = true` untuk request `/api/*` non-admin. Header `Retry-After: 60`. Path yang tidak diblokir: session admin aktif (`role=admin` / `ADMIN_EMAILS`) + `/api/health`, `/api/auth/*`, `/api/webhooks/*`. Tidak ada allowlist prefix `/api/v1/admin/*` tanpa session — klaim lama diperbaiki 2026-10-05. Ditambahkan audit 2026-09-16.

## 8.17 Pagination & Sorting

- Query: `page`, `limit` (default 20, max 100), `sort` (`created_at:desc`).
- Response list:

```json
{ "data": [...], "meta": { "page": 1, "limit": 20, "total": 128, "totalPages": 7 } }
```

## 8.18 Rate Limiting

- Auth/login: ketat (misal 5/menit per IP).
- Public checkout & apply-voucher: moderate (misal 30/menit per IP/session).
- Webhook: tidak di-limit oleh IP, tapi diverifikasi provider-side, amount/order, serta idempotency. Pakasir tidak menyediakan signature callback; event `paid` wajib server-to-server status check sebelum settlement.
- Backend limiter (`src/lib/rate-limit.ts`, interface async `rateLimit(key, limit, windowMs)`):
  pakai **Upstash Redis REST** bila `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
  di-set (counter shared lintas instance); fallback **in-memory** bila kosong.
  Fail-closed di production saat backend error; fail-open hanya di non-production.
- Melampaui limit → `429 RATE_LIMITED` dengan `details.retry_after` (detik).
  Diterapkan di handler (`/api/*`), bukan middleware.

### Validasi `page` kiosk

Upload video per-layar kiosk menerima `page` yang **wajib** salah satu id allowlist
(`KIOSK_PAGE_IDS`: `welcome|guide|package|payment|template|capture|edit|result`).
Nilai lain (mis. `../../evil`) → `VALIDATION_ERROR`; mencegah injeksi key storage
(`kiosk-page-${page}`). Divalidasi di server action dan di `uploadKioskPageVideo`.

## 8.19 Request/Response Schema per Endpoint (wajib saat implementasi)

Setiap endpoint di §8.3–§8.16 **wajib** memiliki definisi schema eksplisit saat implementasi (bukan hanya daftar endpoint):

1. **Request body/query/param** — zod schema server-side, dengan tipe field, required/optional, dan aturan validasi (format, range, enum). Contoh: `amount` integer > 0; `status` enum; `from`/`to` ISO date.
2. **Response body** — bentuk `data` per endpoint (field + tipe), tidak hanya envelope generik.
3. **Error yang mungkin muncul** per endpoint (bukan cuma daftar global §8.2).

Format acuan per endpoint (tulis lengkap saat Phase implementasi terkait):

```jsonc
// POST /api/v1/public/:businessSlug/checkout
// request:  { "package_id": "uuid", "voucher_code": "PROMO-2026", "device_token": "opaque-device-token" }
// zod:      package_id: z.string().guid(); voucher_code: z.string().trim().min(1).optional(); device_token: z.string().min(1)
// response: { "data": { "checkout_session_id": "uuid", "final_amount": 50000, "status": "pending" } }
// errors:   VALIDATION_ERROR | NOT_FOUND | VOUCHER_INVALID | VOUCHER_EXPIRED | VOUCHER_LIMIT_REACHED | VOUCHER_MIN_NOT_MET | SESSION_LIMIT_REACHED
```

Ini menutup gap: §8.3–§8.16 hanya mencantumkan route + param ringkas; detail schema menjadi bagian wajib dari implementasi endpoint (bukan "bisa ditentukan nanti").

## 8.20 Endpoint Ada tapi Belum Terdokumentasi (audit 2026-08-30)

Endpoint berikut ada di kode namun belum tercantum di section di atas:

- `POST /api/v1/public/devices/exit` — verifikasi PIN keluar kiosk (server-side, `photoboxes.exit_pin_hash`).
- `POST /api/v1/public/devices/report` — heartbeat/status report device kiosk.
- `GET/POST /api/v1/admin/add-ons` + `PATCH /api/v1/admin/add-ons/:id` — CRUD katalog add-on platform (termasuk POS).
- `GET /api/health` — health check.
- `GET /api/v1/emoji` — katalog emoji/stiker global untuk kiosk & template builder (menggantikan stickers REST per-business).
- `GET /api/v1/help` — konten halaman bantuan.
- `GET /api/cron/retention` — cron pembersihan media (Bearer `CRON_SECRET`, vercel.json).
- `GET /api/cron/subscription-lifecycle` — cron transisi lifecycle subscription (Bearer `CRON_SECRET`).
- **POS add-on: TANPA REST** — seluruh operasi POS via server actions (`src/server/pos-actions.ts`) + RPC `pos_decrement_stock` (kontrak `docs/pos/01` §5: "REST mirror: TIDAK dibuat").
