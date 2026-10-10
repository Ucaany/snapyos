# POS Add-on — Phase 0: Project Audit

> Status: **SELESAI — 2026-08-26; persetujuan diberikan, arah revisi v2 (lihat catatan revisi di bawah).**
> Tidak ada kode, migration, API, atau UI yang diubah pada fase ini.
> Tanggal audit: 2026-08-26. Scope: seluruh repository SnapyOS.

> **⚠️ CATATAN REVISI v2 (2026-08-27) — arahan owner mengubah desain POS.**
> Dokumen audit ini tetap valid sebagai inventaris sistem existing, TAPI keputusan berikut di-supersede oleh `docs/pos/01-architecture.md` REVISI v2:
>
> 1. **Pembayaran POS = offline-only** (cash/bank_transfer/other) — TANPA integrasi `payments`/Pakasir/webhook/`creditBalance`. Rekomendasi §1.3 (reuse payments+webhook) dan Phase 4 v1 **DIBATALKAN**.
> 2. **POS per-booth**: `pos_orders.photobox_id NOT NULL` + toggle `photoboxes.pos_enabled`. Karena `photoboxes.outlet_id` NOT NULL (schema.sql:209), `transactions.outlet_id/photobox_id` selalu terisi dari booth → relax NOT NULL (§4.4, risiko R1/R11) **TIDAK DIPERLUKAN**.
> 3. **Tanpa role `cashier`** — role `staff` existing mendapat permission `pos:sell`/`pos:read` (§1.6, R3 gugur).
> 4. Migration = `0019_pos_addon.sql` (`0018` sudah terpakai `member-photoboxes`).
>    Risiko yang gugur: R1, R2, R3, R7, R11. Risiko aktif: R4, R5, R6, R8, R10.
>    Rincian: `docs/pos/01-architecture.md` §1 (A1–A16), `docs/pos/04-payment-qris.md` (batal).

> **✅ UPDATE 2026-08-30: Phase 2/3/5 (+ kontrol security Phase 7 & sebagian test Phase 8) TELAH dieksekusi** (migration `0019_pos_addon.sql` committed 2026-08-28, 203/203 test pass saat audit); lihat status per dokumen phase (`docs/pos/01..03,05,07,08`).

---

## Daftar Isi

1. Ringkasan Eksekutif
2. Hasil Audit Sistem Existing
3. Inventaris Entity/Service yang WAJIB Digunakan Ulang
4. Entity Baru yang Benar-Benar Diperlukan
5. Keputusan Desain POS (Rekomendasi)
6. Subdomain: Temuan & Rekomendasi
7. Risiko & Regresi Teridentifikasi
8. Security Audit Temuan Awal
9. Roadmap Implementasi Phase 1–9
10. Larangan Eksplisit (Guardrails)

---

## 1. Ringkasan Eksekutif

SnapyOS adalah SaaS Photo Booth yang sudah menyeluruh: Next.js 16 (App Router) + Supabase (service-role, tenant scoping app-level) + Auth.js v5 (JWT + DB revocation) + payment gateway **Pakasir** (QRIS, webhook + polling + recovery) + finance penuh (`transactions` → `creditBalance` → `balances`/`balance_ledger` → `withdrawals`) + admin platform lengkap (plans, add-ons, subscriptions, withdrawals).

Kesimpulan utama audit untuk POS:

1. **Semua primitif yang dibutuhkan POS sudah ada**: payment QRIS + webhook idempotent, transaksi integer-IDR dengan snapshot amount, balance/ledger/withdrawal, voucher, outlet, RBAC 3 role (owner/manager/staff), subscription add-on catalog (`add_ons` + `subscription_add_ons`), admin CRUD harga add-on.
2. **POS dibangun sebagai add-on ber-entitlement**: 1 baris baru di `add_ons` (`code='pos'`, unit baru `feature`) yang harganya dikustomisasi admin via UI `/admin/add-ons` **yang sudah ada** — tanpa hardcode harga di frontend.
3. **Jalur pembayaran POS memakai ulang `payments` + webhook `handlePakasirWebhook` + `transitionPaymentToPaid` + `creditBalance`** — hanya butuh migration kecil: `payments.checkout_session_id` → nullable + kolom `pos_order_id`. Dengan ini webhook signature check, idempotency, duplicate-webhook prevention, polling recovery didapat gratis.
4. **`transactions` tetap single source of truth financial reporting** — setiap POS order PAID insert ke `transactions` (payment_method existing, tambah kolom `cashier_user_id` nullable).
5. **Tidak ada middleware, tidak ada hostname handling, tidak ada konfigurasi subdomain.** Routing strictly path-based single-domain (sesuai AGENTS.md). Rekomendasi: POS **path-based** (`/pos/*` route group baru, guard layout) sebagai primary; subdomain `pos.domain.com` hanya **opsional Phase 6** karena menuntut perubahan cookie domain Auth.js yang berdampak ke seluruh auth.
6. **Tidak ada role `cashier`** — tambah 1 value role `cashier` di `business_members.role` + permission `pos:*` di `src/lib/rbac.ts`. Tidak ada per-user permission table (role-based saja) — konsisten dengan arsitektur existing.
7. **Outlet sudah ada** (`outlets` + `transactions.outlet_id`) — POS pakai `outlet_id` nullable di order, tanpa arsitektur baru.

---

## 2. Hasil Audit Sistem Existing

### 2.1 Stack & Konfigurasi

| Aspek      | Temuan                                                                                                                                                                   | Referensi                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Framework  | Next.js 16.3.1 App Router, React 19, TS strict                                                                                                                           | `package.json`                                                   |
| Database   | Supabase Postgres via service-role key (bypass RLS); tenant scoping di-enforce di kode aplikasi                                                                          | `src/lib/supabase/server.ts`, `docs/03-architecture.md` §3.5-3.6 |
| Migration  | `db/migrations/0002`–`0017` + baseline `db/schema.sql` (40 tabel)                                                                                                        | `db/`                                                            |
| Config     | `next.config.ts` minimal (hanya bodySizeLimit 8mb); tidak ada rewrites/headers/domains                                                                                   | `next.config.ts`                                                 |
| Deployment | Vercel; `vercel.json` hanya 1 cron (`/api/cron/retention` 20:00 UTC, Bearer `CRON_SECRET`)                                                                               | `vercel.json`                                                    |
| Env        | `SUPABASE_URL/SERVICE_ROLE_KEY/ANON_KEY`, `AUTH_SECRET/AUTH_URL`, `PAKASIR_API_KEY/PROJECT_SLUG/BASE_URL/WEBHOOK_URL`, `ADMIN_EMAILS`, `CRON_SECRET`, `DEV_SKIP_PAYMENT` | `.env.example`                                                   |
| Testing    | `node --test tests/*.test.ts` — 14 file unit test murni untuk `src/lib/*` (zod schema, math, RBAC, token, CSV, idempotency)                                              | `tests/`                                                         |
| UI lib     | shadcn/ui style "base-nova" di atas `@base-ui/react` (bukan Radix); Tailwind v4; framer-motion; recharts; lucide                                                         | `components.json`                                                |

### 2.2 Authentication

- Auth.js v5 credentials email/password, argon2id (`@node-rs/argon2`).
- **JWT cookie + DB-backed revocation**: tabel `auth_sessions` (RLS on, tanpa policy = service-role only); setiap refresh JWT cek row masih ada (fail-closed); signOut hapus row. `src/lib/auth.ts:35-156`, `src/server/auth.ts`.
- Rate limit login 5/menit/IP + lockout 5 gagal/15 menit/email (`src/server/auth-actions.ts:91-113`). User suspended diblokir.
- Platform role `users.role`: `user | admin` (bootstrap via `ADMIN_EMAILS`).
- Cookie default Auth.js (`authjs.session-token` / `__Secure-*`) — **host-only** (implikasi subdomain, lihat §6).
- Cookie tambahan `snapyos_active_business` untuk active tenant (`src/lib/tenant.ts:13`).

### 2.3 RBAC & Multi-Tenancy

- **Dua sumbu role**: platform (`users.role`: user/admin) dan bisnis (`business_members.role`: `owner | manager | staff`).
- Permission matrix `src/lib/rbac.ts`: owner `["*"]`; manager hampir semua kecuali staff-write & billing; staff read-only. **Belum ada permission `pos:*`, belum ada role `cashier`.**
- Enforcement server-side (bukan sekadar sembunyikan menu):
  - `getMembership(userId, businessId)` → non-member = 404 (anti existence-leak) — `src/lib/tenant.ts:77-93`
  - `can(role, permission)` — `src/lib/rbac.ts:36`
  - Guard composite `.eq("id", entityId).eq("business_id", businessId)` → cross-tenant id = 0 rows = 404 (pola di `src/server/outlets.ts:124-125`, `assertPhotoboxOwned` di `src/server/devices.ts:46-62`)
  - `requireAdmin()` (throw) / `requireAdminPage()` (redirect) — `src/server/admin.ts:55-69`
- **RLS tidak dipakai** (kecuali `auth_sessions`) — keputusan desain terdokumentasi; keamanan = service-role key + disiplin scoping di kode.
  > **DIPERBARUI 2026-10-08 (C1, hardening):** klaim ini tidak berlaku lagi. RLS kini ON di SELURUH tabel `public.*` + policy `svc_all` untuk `service_role` saja (`anon`/`authenticated` di-revoke, migrasi `0064_enable_rls_all_tables.sql`). Lihat `docs/09-security-storage.md` §9.1 & `docs/07-database-schema.md`.
- Route guard via layout server component (redirect), **tidak ada `middleware.ts` sama sekali**. (Catatan: sejak maintenance-mode, `src/proxy.ts` ada — hanya enforce maintenance, bukan RBAC. Lihat `docs/10-admin-platform.md` §10.4.)

### 2.4 Routing (single-domain, saling eksklusif — sesuai AGENTS.md)

- `(marketing)/`: `/`, `/harga`, `/kontak`, `/bantuan`
- `(auth)/`: `/login`, `/register`
- `(dashboard)/dashboard/*`: 17 halaman (root, analytics, customers, finance, metrics, outlets, packages, photoboxes, reports, staff, subscription, templates, transactions, vouchers, settings)
- `(admin)/admin/*`: root, add-ons, businesses, payments, plans, settings, subscriptions, templates, users, withdrawals
- Kiosk publik: `/p/[businessSlug]/[photoboxSlug]`; hasil online: `/r/[token]`
- API: `/api/auth/*`, `/api/health`, `/api/cron/retention`, `/api/webhooks/payment/pakasir`, `/api/v1/admin/*` (17 route), `/api/v1/business/[businessId]/*` (~43 route), `/api/v1/public/[businessSlug]/*` (kiosk), `/api/v1/public/devices/*`, `/api/v1/public/results/[resultToken]`
- Pola data dashboard: **server component + panggil langsung `src/server/*`**; mutasi via server actions (`*-actions.ts`) + REST mirror `/api/v1` untuk kiosk/device.

### 2.5 Payment Gateway (Pakasir)

- Provider tunggal `pakasir`, abstraksi `PaymentProvider` interface — `src/server/payment/pakasir.ts` + utilitas `src/server/payment/pakasir-utils.ts` (path lama sebelum Fase 5: `src/lib/pakasir.ts`).
- `POST /transactioncreate/qris` (auth via param `api_key`+`project`) → `{order_id, amount, amount_uniq, total_amount, status, qris_url, qris_image, expired_at, signature}`; `GET /transactiondetail` (auth via param `api_key`+`project`) → `SUCCESS|PENDING|EXPIRED`.
- **Flow kiosk (pay-first)**: `checkout_sessions` (open) → `payments` (pending; `order_id` uniq, `provider_signature`, `amount_uniq`, `total_amount`) → QRIS → webhook/polling → `transitionPaymentToPaid` (atomic conditional UPDATE `.in("status", ["pending","expired"])`, single winner) → `runPaidSideEffects` (`src/server/payment/checkout.ts:463-572`):
  1. insert `transactions` (paid) — idempotent via `transaction_id` check
  2. `voucher_usages` + TOCTOU re-check kuota (`checkout.ts:515-551`)
  3. checkout → paid + `result_token`
  4. `creditBalance` (`checkout.ts:575-659`): fee platform dari plan (percent+flat, floor, capped), credit = final − fee, CAS-guarded `balances` mutation, ledger dedup `source='payment', source_id=payment.id`, snapshot `balance_after`
  5. audit log
- **Webhook** `POST /api/webhooks/payment/pakasir` selalu 200; verifikasi = server-to-server status check via `GET /transactiondetail` (Pakasir) + `amount` match; idempotency via `payment_webhooks.event_id` unique (`order_id:STATUS:payment_date`; 23505 = duplicate); semua event dilog. Branching: lookup `order_id` di `payments` → miss → `invoice_payments` branch.
- **Polling** `useQrisPolling` (3s) + `getPaymentStatus` server-side poll provider + self-heal `settlement-recovery.ts`.
- Rp0 → synthetic paid + side effects langsung (`checkout.ts:718-759`).
- Duplicate-QR prevention: void stale checkout/pending; reuse pending unexpired.
- Batasan struktural: `payments.checkout_session_id` **NOT NULL** — semua payment kiosk terikat checkout session.

### 2.6 Subscription & Add-on

- Tabel: `plans` (price_monthly/yearly int IDR, max_* limits, `platform_fee_percent/flat`, `features jsonb`), `subscriptions` (trial/active/past_due/cancelled/expired; periode 30 hari, tanpa proration), `add_ons` (`code` uniq, `price_monthly`, `unit` — saat ini hanya `session`), `subscription_add_ons` (quantity, status active/cancelled, uniq pair), `invoices` (`intent jsonb`, apply atomic via flag `intent.applied`), `subscription_promos`.
- Seed: starter 99k / growth 249k / business 499k; add-on `extra_session` 49k/unit.
- **Admin sudah bisa CRUD harga add-on tanpa deploy**: `createAddOn`/`updateAddOn` (`src/server/admin.ts:478-509`) + UI `/admin/add-ons` + API `/api/v1/admin/add-ons`. Tidak ada hardcode harga di frontend.
- Owner checkout add-on: `createSubscriptionInvoice` → invoice QRIS → `markInvoicePaid` → `applyInvoiceIntent` upsert `subscription_add_ons` (atomic claim + idempotent).
- **Gap**: `plans.features` jsonb ada tapi belum ada runtime feature gate (`FEATURE_DISABLED` didefinisikan di `src/lib/api-errors.ts:14` tapi tidak pernah di-throw). Entitlement add-on ber-basis quantity sudah first-class (`effectiveSessions`); **entitlement add-on ber-basis feature perlu gate function baru** — tidak butuh schema change.

### 2.7 Finance, Balance, Withdrawal, Reporting

- **Revenue path**: payment paid → `transactions` (paid, source of truth reporting; partial index `(business_id, paid_at) where status='paid'`) → `creditBalance` → `balances` (1 row/tenant: available/pending/lifetime_earned/lifetime_withdrawn) + `balance_ledger` append-only (type credit/debit, source payment/withdrawal/refund/adjustment, `source_id` loose uuid, `balance_after` snapshot).
- Semua mutasi balance via `mutateBalanceGuarded` (CAS optimistic, 3 retry) — `src/server/balance.ts:27`.
- **Kebijakan penting**: saldo HANYA dari jalur QRIS via `creditBalance`. Transaksi manual (cash/bank_transfer/other) dan offline dicatat untuk reporting tapi tidak mengisi saldo (migration 0016). **POS cash mengikuti kebijakan ini** (reporting only, tidak kredit saldo).
- **Withdrawal**: owner request (validasi nama rekening == nama profil, min amount, jadwal hari, CAS available→pending) → admin process (paid) / reject (refund + ledger credit). Temuan minor existing: transisi withdrawal `paid` tidak menulis ledger entry (dicatat sebagai temuan, di luar scope POS).
- **Discount**: `vouchers` (percentage/fixed, min_transaction, max_discount, usage_limit, scope m2m package/outlet) — terikat alur kiosk checkout; discount tercatat di `checkout_sessions`/`payments`/`transactions` (gross/discount/final).
- **Reporting**: `finance/summary`, `metrics`, `analytics/revenue{,/by-outlet,/by-package,/by-photobox,/by-payment-method}`, `reports` export CSV/XLSX (RFC4180, formula-injection guard). Semua agregasi dari `transactions` — **POS otomatis masuk semua report ini begitu insert ke `transactions`**.
- **Audit trail**: `audit_logs` (best-effort) untuk payment.paid, transaction.manual_create, withdrawal, admin actions, subscription.

### 2.8 Design System (WAJIB dipakai POS)

- **Neo-Brutalism single aesthetic lock** (Swiss Industrial Print + Tactical Telemetry): tokens `src/styles/tokens.css`, aturan `docs/11-design-system.md`, `DESIGN.md`, `docs/13-skill-anti-slop.md`.
- Font: Archivo Black (display uppercase), IBM Plex Sans (body), Space Mono (semua angka/harga/ID/label).
- Warna: bg `#FFFDF5`, ink `#111111` (teks + border), accent dominan `#FFD400` + pink/green/blue, destructive `#FF2A2A`. Radius 0. Shadow hard offset `4px 4px 0 #111`. Border 2–4px solid. Grid lines via `gap-[2px] bg-ink`. Grain overlay global. Satu accent dominan per halaman.
- Komponen shadcn/ui tersedia: button, card, input, popover, sheet, sidebar, dropdown-menu, tooltip, skeleton, calendar, chart, live-search, collapsible, breadcrumb, avatar. **Tidak ada toast/dialog/select/table/tabs/badge** — tabel hand-rolled `<table>`, dialog hand-rolled, badge via `StatusBadge`.
- Pola halaman: `/// EYEBROW` mono label → H1 display uppercase → filter row → metric grid → bordered table; empty state dashed `/// BELUM ADA X`; loading skeleton per route.
- Kiosk UI (`src/components/kiosk/*`) adalah referensi terdekat untuk layar kasir full-screen.

### 2.9 Outlet

- `outlets` (business_id, name, address, city, province, status active/inactive) — ada dan dipakai: `photoboxes.outlet_id`, `transactions.outlet_id` (**NOT NULL** — juga `transactions.photobox_id` NOT NULL), `sessions.outlet_id`, m2m package/voucher. Plan limit `max_outlets` di-enforce. **Staff TIDAK di-scope per outlet** (`business_members` hanya business_id+role). POS pakai `outlet_id` nullable pada order — tetapi insert ke `transactions` menuntut `outlet_id`+`photobox_id` di-relax jadi nullable dulu (migration 0018, lihat §4.4 dan risiko R11).

## 3. Inventaris Entity/Service yang WAJIB Digunakan Ulang

| Kebutuhan POS           | Entity/Service Existing                                                                   | Lokasi                                                                              | Catatan                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Pembayaran QRIS         | `pakasirProvider`, `payments`, `payment_webhooks`                                         | `src/server/payment/pakasir.ts`, `src/server/payment/pakasir-utils.ts`              | Tidak bikin gateway baru                                                                                                            |
| Konfirmasi pembayaran   | `transitionPaymentToPaid`, `handlePakasirWebhook`                                         | `src/server/payment/checkout.ts:431-444,921-1019`                                   | POS branch berdasarkan `pos_order_id`                                                                                               |
| Kredit saldo + fee      | `creditBalance`, `computePlatformFee`, `mutateBalanceGuarded`                             | `checkout.ts:575-659`, `src/lib/checkout-math.ts:31-38`, `src/server/balance.ts:27` | Reuse apa adanya                                                                                                                    |
| Source of truth laporan | `transactions` (gross/discount/final, payment_method, outlet_id, customer_id)             | `db/schema.sql:383`, `src/server/transactions.ts`                                   | POS PAID insert ke sini. **PERHATIAN: `outlet_id` & `photobox_id` NOT NULL** → migration POS wajib relax jadi nullable (lihat §4.4) |
| Withdrawal              | `withdrawals` + flow existing                                                             | `src/server/withdrawals.ts`, `src/server/admin.ts:874-950`                          | Tidak disentuh; saldo POS otomatis withdrawable                                                                                     |
| Entitlement add-on      | `add_ons` + `subscription_add_ons` + admin CRUD                                           | `src/server/admin.ts:478-509`, `src/server/subscription.ts`                         | Baris `code='pos'` via seed/admin UI                                                                                                |
| Limit/plan pattern      | `getPlanLimits`, `planLimitError`                                                         | `src/server/plan-limits.ts:12-64`                                                   | Pattern untuk gate POS                                                                                                              |
| Auth + revocation       | Auth.js + `auth_sessions`                                                                 | `src/lib/auth.ts`                                                                   | Tidak diubah                                                                                                                        |
| Tenant scoping          | `getMembership`, `can`, pola composite `.eq(business_id)`                                 | `src/lib/tenant.ts`, `src/lib/rbac.ts`                                              | Semua query POS wajib ikuti pola ini                                                                                                |
| Audit                   | `insertAudit`                                                                             | `src/server/audit.ts`                                                               | `pos.*` actions                                                                                                                     |
| Kalkulasi uang          | integer IDR, `computeFinalAmount` pattern, `formatIDR`                                    | `src/lib/checkout-math.ts`, `src/lib/dashboard-math.ts:145`                         | Tanpa floating-point                                                                                                                |
| Error contract          | `ApiError`, `apiRoute` wrapper                                                            | `src/lib/api-errors.ts`, `src/lib/api-route.ts`                                     | Tambah kode error POS jika perlu                                                                                                    |
| Polling QRIS client     | `useQrisPolling`                                                                          | `src/hooks/use-qris-polling.ts`                                                     | Reuse di layar bayar POS                                                                                                            |
| Upload gambar           | `image_url` string URL eksternal (`z.string().max(500)`)                                 | `src/lib/validators.ts`                                                             | Untuk product image (TIDAK diupload ke Supabase storage)                                                                             |
| UI                      | tokens.css, shadcn/ui set, `StatusBadge`, pola tabel/form dashboard, kiosk screen pattern | `src/components/`                                                                   | Tidak ada design system baru                                                                                                        |
| Customer                | `customers`                                                                               | `src/server/customers.ts`                                                           | Opsional attach ke order                                                                                                            |

## 4. Entity Baru yang Benar-Benar Diperlukan

Minimalis — semua uang integer IDR, uuid PK `gen_random_uuid()`, `business_id` scoping, `created_at/updated_at`, mengikuti konvensi `docs/07`:

1. **`pos_products`** — katalog produk per tenant: `business_id`, `name`, `sku` (nullable, uniq per business saat non-null), `category` (text; kategori default: keychain, gantungan, additional_print, merchandise, lainnya — dikelola sebagai data, bukan enum DB), `description` (nullable), `price` (int > 0), `cost` (int nullable — HPP; sistem existing tidak punya tabel inventory jadi cost bersifat opsional untuk margin analysis), `stock` (int nullable — **null = tidak ditrack**; opsional per produk karena arsitektur existing tidak berbasis inventory), `is_active` (default true), `image_url` (nullable), timestamps.
2. **`pos_orders`** — header transaksi kasir: `business_id`, `outlet_id` (nullable → outlets), `cashier_user_id` (→ users), `customer_id` (nullable → customers), `number` (uniq per business — pola per-business `invoices.number` migration 0008; catatan: `transactions.number` global-unique, bukan per-business), `status` (`pending | paid | cancelled | expired` — subset status existing yang benar-benar dipakai kode; `failed`/`refunded` tidak dipakai POS v1 karena kode existing pun tidak memakainya), `gross_amount`, `discount_amount`, `final_amount` (int ≥ 0, server-computed), `payment_method` (`qris | cash | bank_transfer | other` — reuse enum `transactions.payment_method` minus `offline`), `payment_reference` (nullable), `paid_at` (nullable), timestamps.
3. **`pos_order_items`** — snapshot line item (anti perubahan harga di masa depan): `pos_order_id`, `pos_product_id` (nullable — produk boleh diubah/di-nonaktifkan tanpa merusak riwayat), `name_snapshot`, `sku_snapshot` (nullable), `unit_price_snapshot` (int), `cost_snapshot` (int nullable), `quantity` (> 0), `subtotal` (= unit_price × qty, server-computed).
4. **Perubahan kolom (migration 0018+, additive-only)**:
   - `payments.checkout_session_id` → **nullable**; tambah `pos_order_id` uuid nullable (indexed). Flow kiosk existing tetap selalu mengisi kolom — tidak ada perubahan behavior.
   - `transactions` tambah `pos_order_id` uuid nullable (traceability POS ↔ reporting; `session_id`/`package_id` tetap NULL untuk POS) dan `cashier_user_id` uuid nullable.
   - `transactions.outlet_id` → **nullable** dan `transactions.photobox_id` → **nullable** (keduanya saat ini NOT NULL — POS order tidak memiliki photobox dan boleh tanpa outlet; tanpa relax ini insert POS gagal). Insert existing (kiosk & manual `createManualTransaction`) tetap mengisi keduanya — tidak ada perubahan behavior; hanya tipe TS join `outlets(name)/photoboxes(name)` di `src/server/transactions.ts` yang harus null-safe.
   - `business_members.role` CHECK: tambah value `cashier`. Ikut disinkronkan: `z.enum` role di `src/lib/validators.ts:350,354` dan matrix `src/lib/rbac.ts`.
   - `add_ons.unit`: **tidak ada CHECK constraint** (hanya `default 'session'` — temuan revisi audit; R9 tidak berlaku) → tidak perlu perubahan constraint, cukup seed.
   - Seed: `add_ons` row `code='pos'`, `unit='feature'`, `price_monthly` default platform (admin bebas ubah via `/admin/add-ons`; frontend tidak hardcode).

**Tidak dibuat**: wallet/ledger/withdrawal baru, payment provider baru, tabel outlet baru, design system baru, per-user permission table, tabel kategori terpisah (category = text + daftar unik; upgrade path ke tabel `pos_categories` jika butuh ordering/icon).

## 5. Keputusan Desain POS (Rekomendasi)

### 5.1 Isolasi

- POS = modul additive: tabel baru `pos_*`, route group baru `(pos)`, server files baru (`src/server/pos-products.ts`, `src/server/pos-orders.ts`, `src/server/payment/pos-checkout.ts`, `src/server/pos-actions.ts`). **Tidak mengubah** booking, photobox, kiosk session, customer, subscription dashboard, checkout kiosk, voucher kiosk.
- Satu-satunya sentuhan ke existing (semua additive, reversible): (a) kolom nullable di `payments`/`transactions`, (b) branch `pos_order_id` di webhook/paid-side-effects, (c) role CHECK `cashier`, (d) matrix `rbac.ts`, (e) seed `add_ons`, (f) entri nav POS di sidebar dashboard (hanya render jika entitlement aktif).

### 5.2 Entitlement (subscription POS aktif)

```
hasPosEntitlement(businessId):
  subscription terakhir business (status trial|active|past_due)
  → exists subscription_add_ons (status='active')
    join add_ons (code='pos', is_active=true)
```

- Gate di 3 lapis: layout POS (redirect jika tidak berhak), setiap server action/API POS (throw `POS_NOT_SUBSCRIBED`), dan saat owner membuka halaman aktivasi POS.
- Harga add-on dibaca server-side dari `add_ons`; admin ubah kapan pun via `/admin/add-ons` (existing); frontend hanya menampilkan angka dari server. Tidak ada harga POS di kode frontend.
- Owner mengaktifkan POS lewat alur subscription existing: `createSubscriptionInvoice` dengan add-on `pos` qty 1 → bayar invoice QRIS → `applyInvoiceIntent` → entitlement aktif. Nol alur billing baru.

### 5.3 Alur pembayaran (server-side, backend = source of truth)

```
cart (client — hanya display)
→ POST create order: entitlement + membership + role cashier
   + produk di-fetch ulang dari DB by (id, business_id, is_active)
   + harga/qty/subtotal/discount dihitung server-side
   → pos_orders(pending) + pos_order_items (snapshot)
→ payment:
   a) QRIS: insert payments(pending, pos_order_id, checkout_session_id=NULL)
      → provider create → QRIS display → webhook ATAU polling (reuse)
      → transitionPaymentToPaid (reuse) → POS paid side-effects:
         pos_orders→paid + insert transactions(paid, pos_order_id, cashier_user_id)
         + creditBalance (reuse; fee platform dari plan)
         + stock decrement guarded (hanya jika stock ditrack)
   b) CASH/bank_transfer/other: langsung paid server-side
      + insert transactions(paid) — REPORTING ONLY, tanpa creditBalance
      (konsisten kebijakan existing migration 0016: saldo hanya dari QRIS)
→ reporting: otomatis via transactions (finance/metrics/analytics/reports)
```

- **Anti-manipulasi**: client tidak pernah mengirim harga/total — hanya `[{productId, qty}]` (+ optional discount yang divalidasi/di-cap server-side); semua amount dihitung ulang server; snapshot tersimpan di `pos_order_items` sehingga perubahan harga produk di masa depan tidak mengubah transaksi lama.
- **Idempotency**: order number uniq per business; payment idempotent via `payments` + `payment_webhooks.event_id` unique + `creditBalance` ledger dedup (semua existing).
- **Expiry**: reuse pola `computeQrisExpiresAt` (setting `business_settings` / default 3 menit; cap provider).
- **Race condition**: transisi status via conditional UPDATE single-winner (pola `transitionPaymentToPaid`); stock decrement via guarded UPDATE `stock = stock - qty WHERE id=? AND business_id=? AND stock >= qty`.

### 5.4 RBAC POS

| Role                    | Permission baru                                              | Kemampuan                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| owner                   | `*` (otomatis)                                               | Aktifkan POS (subscription), kelola produk/kategori/harga, kelola staff kasir, lihat semua report POS                                     |
| manager                 | `pos:manage`, `pos:read`, `pos:sell` (ditambahkan ke matrix) | Kelola produk + laporan + bisa jualan                                                                                                     |
| **cashier (role baru)** | `pos:sell`, `pos:read`, `business:read`, `outlet:read`       | Hanya aktivitas kasir: buka POS terminal, buat order, terima pembayaran. Tanpa akses produk-write, staff, finance, subscription, settings |
| staff                   | tidak ada permission POS                                     | Tidak melihat POS sama sekali                                                                                                             |

- Enforcement: semua server-side (`getMembership` + `can`). UI sidebar dashboard hanya menampilkan menu POS jika role punya permission DAN entitlement aktif — penyembunyian menu bukan pengaman, hanya UX.
- Owner menambah cashier via halaman staff existing (invite dengan role `cashier`).

### 5.5 UI/UX POS (mengikuti design system existing)

- **Owner — manajemen**: halaman `/dashboard/pos` (produk CRUD, kategori, aktivasi add-on + link ke subscription existing) memakai pola halaman dashboard existing: eyebrow `/// POS`, tabel hand-rolled, `StatusBadge`, form server action.
- **Cashier — terminal kasir**: route group `(pos)` → `/pos` (pilih/aktifkan business, reuse cookie `snapyos_active_business`) → `/pos/terminal` full-screen seperti kiosk: grid produk (search + kategori), panel cart (qty +/-, hapus, subtotal/discount/total dalam Space Mono), tombol bayar besar, layar QRIS (reuse pola `Checkout` kiosk + `useQrisPolling`), konfirmasi cetak/struk. **Keputusan fix (menghapus ambiguitas)**: TIDAK pakai `/pos/[businessSlug]/terminal` — active-business cookie sudah menjadi pola dashboard existing; slug di path menambah duplikasi state. Semua Neo-Brutalism: border 2-4px, shadow hard, radius 0, accent `#FFD400`, grain, uppercase display.

## 6. Subdomain: Temuan & Rekomendasi

**Temuan faktual dari audit:**

1. Tidak ada `middleware.ts`/`proxy.ts` di seluruh codebase. Tidak ada satu pun referensi `hostname`/`x-forwarded-host`/custom domain di `src/`. Routing strictly path-based single-domain — sesuai aturan AGENTS.md ("Route single-domain").
2. Deployment Vercel single project, tanpa konfigurasi domain di `vercel.json`.
3. Cookie Auth.js **host-only** (tidak diset `cookies.domain`): session yang dibuat di `app.domain.com` **tidak terbaca** di `pos.domain.com`. Subdomain menuntut perubahan `cookies.domain = .domain.com` pada konfigurasi Auth.js + `AUTH_URL`/`trustHost` — berdampak ke SEMUA auth (logout menyeluruh, CSRF baseline, dan berpotensi memecah kiosk tablet yang sudah login device-token — device token tidak pakai cookie, aman, tapi owner/staff semua kena).
4. Multi-tenancy existing tidak berbasis subdomain (businessSlug di path), jadi `pos.domain.com` tidak membawa identitas tenant — tetap perlu memilih tenant setelah login.

**Rekomendasi (diputuskan berdasarkan project aktual, bukan asumsi):**

- **Primary: path-based** `/pos/*` — route group `(pos)` dengan guard layout (requireUser + membership + role cashier/owner/manager + entitlement). Nol perubahan auth, nol risiko regresi cookie, konsisten AGENTS.md.
- **Opsional Phase 6**: subdomain `pos.domain.com` sebagai **alias yang me-rewrite ke `/pos`** via middleware baru yang membaca `x-forwarded-host`, plus perubahan cookie domain Auth.js (`domain: .domain.com`) dan verifikasi dampaknya (login shared, logout shared, tidak ada session leak antar subdomain karena verification tetap server-side). Hanya dikerjakan jika owner platform memang menginginkan branding subdomain; tidak dibutuhkan untuk keamanan atau isolasi.
- **Tenant-based subdomain (`tenant.domain.com`) DITOLAK**: bertentangan dengan arsitektur single-domain + businessSlug existing, menuntut perubahan terbesar dengan keuntungan nilai.

## 7. Risiko & Regresi Teridentifikasi

| #   | Risiko                                                                                                                                                                                | Dampak                                      | Mitigasi                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `payments.checkout_session_id` → nullable: flow kiosk/invoice salah baca NULL                                                                                                         | Payment kiosk rusak                         | Migration additive; semua query existing filter by order_id/checkout_id eksplisit; audit call-site `checkout_session_id` sebelum change; test regression phase kiosk                                                                               |
| R2  | Branch POS di `handlePakasirWebhook`/`runPaidSideEffects` mengubah jalur kiosk                                                                                                        | Double side-effect / side-effect hilang     | Branch strictly by `pos_order_id IS NOT NULL`; kiosk path tidak disentuh logikanya; unit test idempotency existing dipertahankan                                                                                                                   |
| R3  | Role `cashier` baru menembus permission existing (mis. staff page menganggap non-owner = staff)                                                                                       | Privilege escalation                        | Audit semua `role === "staff"`/`role !== "owner"` hard-check (mis. `requireOwner` aman); matrix `rbac.ts` cashier minimal; unit test RBAC diperluas                                                                                                |
| R4  | Entitlement gate terlewat di satu endpoint                                                                                                                                            | POS dipakai tanpa bayar                     | Gate di helper tunggal `requirePosAccess()` yang dipanggil SEMUA server action/API POS; layout hanya UX                                                                                                                                            |
| R5  | Stock race (dua kasir jual item terakhir)                                                                                                                                             | Oversell                                    | Guarded UPDATE `stock >= qty`; gagal → error `INSUFFICIENT_STOCK`; stock opsional                                                                                                                                                                  |
| R6  | Insert `transactions` POS mencemari laporan yang mengasumsikan `session_id`/`package_id` terisi                                                                                       | Laporan existing berubah makna              | Audit semua agregasi `transactions`: filter existing by status='paid' + business (POS compliant); agregasi by-package harus null-safe (POS row package NULL) — verifikasi di Phase 5                                                               |
| R7  | Webhook POS replay/duplicate → double credit                                                                                                                                          | Kehilangan uang                             | Reuse penuh `payment_webhooks.event_id` unique + `creditBalance` dedup; tanpa kode baru di jalur ini                                                                                                                                               |
| R8  | Frontend mengirim total palsu                                                                                                                                                         | Manipulasi harga                            | Server hitung ulang semua; payload order hanya productId+qty; discount server-validated                                                                                                                                                            |
| R9  | ~~Perubahan `add_ons.unit` CHECK~~ **REVISI: tidak ada CHECK di `add_ons.unit`** (hanya default) — tidak ada risiko migration; cukup seed idempotent                                  | n/a                                         | Seed `on conflict (code) do nothing`                                                                                                                                                                                                               |
| R10 | Sidebar dashboard bertambah untuk tenant tanpa POS                                                                                                                                    | Noise UI                                    | Item nav POS conditional render by entitlement                                                                                                                                                                                                     |
| R11 | `transactions.outlet_id`/`photobox_id` jadi nullable: agregasi/join existing mengasumsikan non-null (mis. `src/server/transactions.ts` tipe `outlet_id: string`, analytics by-outlet) | Laporan existing berubah makna / type error | Audit semua pembaca `outlet_id`/`photobox_id` transactions → null-safe (tipe `string \| null`, join name → fallback label `POS`); regression test analytics dengan data campuran kiosk+POS; verifikasi di Phase 2 (typecheck) + Phase 5 (agregasi) |

## 8. Security Audit Temuan Awal

**Ancaman → kontrol yang sudah ada / yang ditambah POS:**

| Ancaman                                                  | Kontrol                                                                                                                                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IDOR cross-tenant (product/order/payment id tenant lain) | Pola composite `.eq("id").eq("business_id")` → 404; semua query POS wajib ikuti; ditambah test                                                                                           |
| Tenant A akses data tenant B via API                     | `getMembership` di setiap handler (404 non-member); entitlement check per business                                                                                                       |
| Privilege escalation cashier → owner                     | Role dari `business_members` (DB), bukan client; `can()` server-side; `requireOwner` untuk manajemen produk? → **keputusan**: produk = owner+manager (`pos:manage`), cashier tidak punya |
| Payment/price manipulation                               | Semua amount server-computed dari DB; snapshot; webhook `total_amount` match (existing)                                                                                                  |
| Quantity manipulation                                    | qty divalidasi zod (int 1–999), subtotal server, stock guarded                                                                                                                           |
| Webhook spoofing                                         | Stored-signature match + order_id lookup + amount match (existing, desain provider); POS tidak melemahkan ini                                                                            |
| Replay/duplicate webhook                                 | `payment_webhooks.event_id` unique + conditional status transition (existing)                                                                                                            |
| Duplicate transaction/payment                            | `number` uniq per business; `creditBalance` ledger dedup (existing)                                                                                                                      |
| Unauthorized withdrawal                                  | Tidak ada withdrawal baru; saldo POS masuk jalur existing dengan fee & audit yang sama                                                                                                   |
| XSS                                                      | React escaping; CSV export formula-injection guard existing (report POS pakai generator sama)                                                                                            |
| CSRF                                                     | Server actions + Auth.js CSRF default (existing pattern)                                                                                                                                 |
| Session hijacking                                        | JWT + DB revocation existing; cookie host-only (dipertahankan selama path-based)                                                                                                         |

**Temuan security existing (dicatat, di luar scope POS, tidak diubah):** ledger tidak punya unique index `(source, source_id)` (dedup query-based); transisi withdrawal `paid` tidak menulis ledger; verifikasi webhook bukan HMAC (limitasi desain Pakasir). POS **tidak menambah** permukaan baru di ketiga titik ini karena memakai jalur yang sama.

## 9. Roadmap Implementasi Phase 1–9

> Aturan: satu phase per iterasi. Setiap phase selesai → audit + test + **persetujuan user** sebelum phase berikutnya. Setiap phase punya dokumen masing-masing di `docs/pos/`.

### Phase 0 — Project Audit (DOKUMEN INI) ✅

- **Objective**: audit menyeluruh, identifikasi integration point, entity reuse vs baru, risiko, keputusan arsitektur.
- **Deliverable**: `docs/pos/00-audit.md` (file ini). Tanpa sentuhan kode.
- **Acceptance criteria**: user menyetujui dokumen ini.

### Phase 1 — Architecture

- **Objective**: froze keputusan desain §4–§6 menjadi kontrak teknis: diagram alur order/payment POS, kontrak API, struktur route, pemetaan file.
- **Existing dipakai**: pola layering `src/server/*` + server actions; route groups; `docs/03-architecture.md` sebagai format.
- **File**: create `docs/pos/01-architecture.md`. Tidak ada kode.
- **DB/API/UI changes**: none (spesifikasi saja).
- **Security**: definisi `requirePosAccess()` sebagai satu-satunya gerbang entitlement; daftar endpoint + matriks role×endpoint.
- **Testing**: review dokumen.
- **Risk**: keputusan salah berbekas — mitigasi: semua keputusan tertulis + bisa dibatalkan sebelum Phase 2.
- **Rollback**: n/a (dokumen).
- **Acceptance**: arsitektur disetujui; kontrak API fix; daftar file fix.

### Phase 2 — Database & Subscription

- **Objective**: migration additive (tabel `pos_products`, `pos_orders`, `pos_order_items`; kolom nullable `payments`/`transactions`; role `cashier`; `add_ons.unit='feature'`; seed add-on `pos`) + gate entitlement `hasPosEntitlement` + integrasi UI subscription existing.
- **Existing dipakai**: konvensi migration `db/migrations/00XX`; `getPlanLimits` pattern; `createSubscriptionInvoice`/`applyInvoiceIntent` (nol perubahan — add-on POS adalah baris `add_ons` biasa); UI `/dashboard/subscription` menampilkan add-on POS otomatis dari server.
- **File**:
  - create `docs/pos/02-database-subscription.md` (spesifikasi phase ini)
  - create `db/migrations/0018_pos_addon.sql`
  - modify `db/schema.sql` (baseline sync)
  - create `src/server/pos-entitlement.ts` (`hasPosEntitlement`, `requirePosAccess`)
  - modify `src/lib/rbac.ts` (role `cashier` + permission `pos:*`)
  - modify `src/server/staff.ts` (invite dengan role `cashier` diperbolehkan)
  - modify `src/lib/api-errors.ts` (`POS_NOT_SUBSCRIBED`, `INSUFFICIENT_STOCK` jika belum ada)
- **DB changes**: seperti §4. **API/UI**: belum ada endpoint POS; UI subscription existing menampilkan add-on `pos` (sudah generik).
- **Security**: entitlement gate di server; harga add-on dari DB (admin-configurable); role CHECK additive.
- **Testing**: unit test `hasPosEntitlement` (active/trial/cancelled/past-due × add-on active/cancelled), RBAC matrix baru; `npm run test` + `typecheck` hijau; verifikasi migration di DB dev (up + rollback dry).
- **Risk**: R1, R3, R9 (lihat §7).
- **Rollback**: migration reversible (drop tabel/kolom/CHECK; hapus seed row); kode additive.
- **Acceptance**: owner bisa membeli add-on POS lewat alur subscription existing (invoice QRIS → entitlement aktif) di DB dev; tenant tanpa add-on → `POS_NOT_SUBSCRIBED`.

### Phase 3 — POS Core (Product/Category Management + Cart)

- **Objective**: CRUD produk owner + terminal cart cashier (tanpa payment — order pending saja atau dengan payment cash sederhana sesuai keputusan Phase 1).
- **Existing dipakai**: pola `*-actions.ts`, tabel dashboard hand-rolled, `LiveSearch`, `StatusBadge`, upload pattern (`upload-validation.ts`), `OutletRow` untuk pilih outlet.
- **File**:
  - create `docs/pos/03-pos-core.md` (spesifikasi phase ini)
  - create `src/server/pos-products.ts`, `src/server/pos-orders.ts` (create/void order, cart math server-side)
  - create `src/lib/pos-math.ts` (subtotal/discount/final — integer, floor)
  - create `src/lib/validators.ts` tambahan schema pos (atau file validator pos)
  - create route `(pos)/pos/...` + `(dashboard)/dashboard/pos/page.tsx`
  - create components `src/components/pos/*` (ProductForm, ProductsTable, PosTerminal, CartPanel, ProductGrid)
  - modify sidebar dashboard (nav POS conditional entitlement+role)
- **DB changes**: none (Phase 2 selesai). **API**: server actions (+ REST mirror `/api/v1/business/[id]/pos/products` opsional mengikuti kontrak Phase 1).
- **UI**: penuh Neo-Brutalism per §2.8 — dilarang design system baru.
- **Security**: `requirePosAccess` + `pos:manage` vs `pos:sell`; semua query `.eq(business_id)`; harga hanya dari DB; discount server-validated.
- **Testing**: unit test `pos-math` (qty, discount cap, snapshot), validator; manual test terminal di dev.
- **Risk**: R4, R8; UI menyimpang dari design system → pre-flight `docs/13` §13.6 sebelum declare done.
- **Rollback**: hapus route/components/server files; nav kembali.
- **Acceptance**: owner CRUD produk (keychain/gantungan/additional print/merchandise); cashier buat cart → order pending tersimpan dengan snapshot; tenant B tidak bisa melihat produk tenant A (verifikasi manual + test).

### Phase 4 — Payment/QRIS

- **Objective**: POS order dibayar via Pakasir existing: order → `payments(pending, pos_order_id)` → QRIS → webhook/polling → paid side-effects POS.
- **Existing dipakai**: `pakasirProvider`, `transitionPaymentToPaid`, `handlePakasirWebhook`, `useQrisPolling`, `settlement-recovery`, pola expiry `computeQrisExpiresAt`.
- **File**:
  - create `docs/pos/04-payment-qris.md` (spesifikasi phase ini)
  - create `src/server/payment/pos-checkout.ts` (create POS payment, paid side-effects: pos_orders→paid, insert transactions, creditBalance reuse, stock decrement guarded, audit)
  - modify `src/server/payment/checkout.ts` **minimal** — branch `pos_order_id` di webhook handler (lookup & delegasi), TIDAK mengubah logika kiosk
  - modify `src/server/payment/checkout.ts` `getPaymentStatus` (dukung poll status payment POS) atau tambah fungsi paralel di `pos-checkout.ts`
  - create komponen layar bayar QRIS POS (reuse pola kiosk Checkout)
- **DB changes**: none. **API**: action/status poll untuk POS.
- **Security**: signature match + amount match + idempotency + duplicate prevention (semua reuse); race via conditional UPDATE; manipulasi total mustahil (server compute).
- **Testing**: unit test side-effects idempotent (double webhook → satu credit); test transisi pending→paid→(replay ignored); manual sandbox Pakasir.
- **Risk**: R2, R7 — mitigasi: branch ketat by `pos_order_id IS NOT NULL`; regression test kiosk checkout existing.
- **Rollback**: hapus `pos-checkout.ts` + revert branch webhook (kecil); payments POS row tidak mengganggu kiosk.
- **Acceptance**: order POS dibayar QRIS di sandbox → `pos_orders` paid, `transactions` paid row + `cashier_user_id`, `creditBalance` jalan (fee dari plan), audit log; replay webhook tidak double.

### Phase 5 — Finance & Reporting

- **Objective**: POS masuk reporting existing + laporan spesifik POS (revenue POS, jumlah transaksi, status, by tenant/outlet/produk/cashier/tanggal).
- **Existing dipakai**: `finance/summary`, `metrics`, `analytics/*`, `reports.ts` export CSV/XLSX, admin `payments/summary` — semuanya berbasis `transactions` sehingga POS otomatis terhitung; tambah breakdown POS dari `pos_orders`+`pos_order_items`.
- **File**:
  - create `docs/pos/05-finance-reporting.md` (spesifikasi phase ini)
  - modify `src/server/analytics.ts` / `metrics.ts` (breakdown by cashier / pos vs kiosk split — null-safe `package_id`, R6)
  - create `src/server/pos-reports.ts` (by product/cashier/outlet/status)
  - modify UI `/dashboard/finance` & `/dashboard/transactions` (badge sumber POS) + halaman report POS
  - modify admin (revenue POS per tenant) — cukup dari `transactions` + filter
- **DB changes**: none (indeks opsional `(business_id, paid_at)` sudah ada via transactions).
- **Security**: `report:read`/`pos:read` RBAC; export formula-injection guard reuse.
- **Testing**: unit test agregasi (data campuran kiosk+POS, null package); export CSV POS.
- **Risk**: R6.
- **Rollback**: revert analytics changes (additive breakdown); pos-reports.ts bisa dihapus.
- **Acceptance**: admin melihat revenue POS per tenant/tanggal; owner melihat revenue POS per outlet/produk/cashier; angka konsisten dengan `transactions` (rekon silang manual di dev).

### Phase 6 — Subdomain (OPSIONAL — keputusan user)

- **Objective**: (hanya jika disetujui) `pos.domain.com` → rewrite `/pos` via middleware + cookie domain `.domain.com`.
- **Existing dipakai**: Vercel domain config; Auth.js `cookies` config; **new** `middleware.ts` (dibuat baru — saat ini tidak ada).
- **File**: create `src/middleware.ts` (hostname match `pos.*` → rewrite `/pos`), modify `src/lib/auth.ts` (cookies.domain cond by env `ROOT_DOMAIN`), modify `.env.example`/vercel.json (domain wildcard).
- **Security**: host validation strict (hanya host `pos.<root>` yang di-rewrite — cegah Host-header spoofing); verifikasi dampak cookie domain ke semua auth; kiosk device-token tidak pakai cookie (aman).
- **Testing**: test cookie lintas subdomain di preview; regression login/logout dashboard+kiosk.
- **Risk**: tertinggi dari semua phase (menyentuh auth global) — karena itu opsional dan terakhir sebelum security hardening; default tetap path-based.
- **Rollback**: hapus middleware + revert cookies.domain (deploy ulang).
- **Acceptance**: `pos.domain.com` menampilkan terminal POS dengan sesi login shared; tidak ada regresi login di domain utama; jika user menolak subdomain → phase ini SKIP dan didokumentasikan di `docs/pos/06-subdomain.md`.

### Phase 7 — Security

- **Objective**: audit keamanan menyeluruh hasil Phase 2–6 + perbaikan temuan.
- **Cakupan**: IDOR produk/order/payment POS cross-tenant; entitlement bypass; cashier escalation; manipulasi payload order (harga/qty/discount); webhook replay POS; race stock & double-settle; XSS di nama produk (react escaping + export CSV); session/cookie (dan subdomain jika Phase 6 jalan).
- **File**: create `docs/pos/07-security.md` + perbaikan kode atas temuan.
- **Testing**: unit test negatif per endpoint (wrong tenant, wrong role, tampered payload); skenario double-webhook; script verifikasi manual.
- **Risk**: perbaikan menyentuh jalur payment → selalu regression test kiosk.
- **Rollback**: per perbaikan.
- **Acceptance**: checklist security §8 terverifikasi semua ✅; tidak ada temuan kritikal terbuka.

### Phase 8 — Testing

- **Objective**: konsolidasi test POS + regression existing.
- **File**: create `docs/pos/08-testing.md` (inventory test + hasil eksekusi); create `tests/pos-*.test.ts` (pos-math, entitlement, RBAC cashier, snapshot order, webhook idempotency POS, stock guard); jalankan full `npm run test`, `npm run lint`, `npm run typecheck`, `npm run build`.
- **Cakupan regression**: kiosk checkout, invoice subscription, withdrawal math, settlement-recovery (existing tests tidak boleh merah).
- **Risk**: test flaky di jalur network — semua unit test tetap murni (pola existing: no network).
- **Rollback**: n/a.
- **Acceptance**: semua suite hijau; laporan coverage manual per alur POS.

### Phase 9 — Deployment

- **Objective**: rilis aman ke produksi.
- **Langkah**: migration DB di produksi (additive, aman sebelum deploy kode — kolom nullable & tabel baru tidak dipakai kode lama); deploy Vercel; seed add-on `pos` (atau admin create via UI); verifikasi: entitlement gating, satu order QRIS sandbox→produksi kecil, webhook terima, balance tercatat, report muncul; monitoring `payment_webhooks` error.
- **File**: create `docs/pos/09-deployment.md` (runbook + rollback).
- **Rollback**: kode = redeploy versi lama; DB = tabel/kolom POS dibiarkan (harmless) atau drop sesuai runbook; add-on row bisa dinonaktifkan (entitlement off = fitur off global tanpa deploy).
- **Acceptance**: runbook tereksekusi bersih; POS live untuk tenant ber-add-on; kiosk & subscription existing terverifikasi tidak berubah behavior.

## 10. Larangan Eksplisit (Guardrails)

- ❌ Tidak rewrite project, tidak ganti framework/DB/auth/payment gateway.
- ❌ Tidak membuat duplicate entity/service (wallet, ledger, withdrawal, payment provider, outlet, design system).
- ❌ Tidak hardcode harga POS di frontend.
- ❌ Tidak memercayai amount/total dari client.
- ❌ Tidak mengubah behavior kiosk/booking/subscription/finance existing tanpa alasan teknis terdokumentasi di dokumen phase terkait.
- ❌ Satu phase per iterasi, menunggu audit + test + persetujuan user.

---

**STATUS: PHASE 0 SELESAI (historis; persetujuan diberikan → REVISI v2 → Phase 2/3/5 dieksekusi, lihat catatan UPDATE 2026-08-30 di atas).**

---

## 11. Perubahan Pasca-Audit — Fase 5 Dashboard Cleanup (2026-09-16)

> Bukan bagian dari audit POS awal; dicatat di sini karena mengubah surface API + struktur `src/lib` yang di-inventarisasi §3.

### 11.1 REST endpoint `/api/v1/business/*` — dihapus (dashboard-only)

Owner dashboard sudah 100% memakai **server actions** (`src/server/*`) sejak Fase 3–4. Route REST paralelnya (yang dulu direncanakan untuk client fetch) menjadi orphan (0 konsumen di `src/**`) dan **dihapus** untuk mengurangi surface area + hindari drift kontrak:

- **Dihapus (38 route file owner-dashboard)**: `[businessId]/route.ts`, `analytics/revenue/**` (5), `balance`, `customers` (list), `dashboard`, `expenses` (+ `[id]`), `finance/summary`, `metrics`, `outlets` (+ `[id]` + `[id]/analytics`), `packages` (+ `[id]`), `photoboxes` (+ `[id]`), `settings` (+ `branding` + `branding/logo`), `staff` (+ `[userId]` + `invite`), `templates` (+ `[id]` + `upload`), `transactions` (+ `[id]`), `vouchers` (+ `[id]` + `[id]/analytics`), `withdrawals`. Tiga route file `payment-credentials/**` dihitung terpisah di §11.2.
- **Dipertahankan (dikonsumsi client fetch atau form action)**:
  - `devices/route.ts` + `devices/[id]/route.ts` — `DeviceDialog`.
  - `photoboxes/[id]/activation/route.ts` — `DeviceDialog` QR aktivasi.
  - `customers/[id]/route.ts` — `CustomersTable` (toggle).
  - `reports/route.ts` — `<form action>` download CSV/XLSX.

**Efek**: `src/app/api/v1/business/[businessId]/**` turun dari **43 → 5 file** (–38).

### 11.2 Direct-merchant Midtrans/Tripay UI — dihapus Fase 5, di-restore 2026-09-18 (direct merchant = jalan utama)

- **Dihapus (Fase 5)**: `/dashboard/settings/payment/page.tsx`, `PaymentGatewaySettings`/`PaymentCredentialCard`/`PaymentCredentialForm`/`PaymentMethodSelector`, `payment-credentials-actions.ts`, 3 REST `payment-credentials/**`.
- **RESTORE (2026-09-18, keputusan owner — arah produk: 3 jenis pembayaran)**: UI `/dashboard/settings/payment` aktif kembali via server actions (`src/server/payment-credential-actions.ts` → `src/server/payment-credentials.ts`), komponen `PaymentGatewaySettings`/`PaymentCredentialCard`/`PaymentCredentialForm`/`PaymentMethodSelector` dibuat ulang (brutalist, `src/components/dashboard/`). Pakasir masuk `listKioskCredentials` (sebelumnya filter hanya midtrans/tripay); fallback QRIS Pakasir aggregator (dana → akun SaaS) **dihapus** — tanpa credential aktif kiosk hanya voucher + tunai. Model: credential merchant owner (merchant id + key sendiri, dana langsung ke rekening owner) + voucher + offline tunai. Env `PAKASIR_*` tetap untuk invoice subscription (dana → SnapyOS). Kolom `payment_credentials.webhook_url` + `payment_providers` + kolom nol-konsumen lain di-drop via migration 0042. Keputusan penghapusan menyeluruh direct-merchant dibatalkan — intent revive resmi.

### 11.3 `authRoute` helper + refactor 9 route

- `src/lib/api-route.ts`: tambah `authRoute<T, P>` (JSON envelope) + `authRawRoute<P>` (binary/CSV) — inject `user`, `params` (awaited), `request`; auto-throw `UNAUTHORIZED`.
- Refactor: 5 route `[businessId]/**` tersisa + `businesses`, `me/businesses`, `public/[businessSlug]/payments/cash-confirm`.
- **DoD**: grep `requireUser` di `src/app/api/**` = 0 hit.

### 11.4 Restrukturisasi `src/lib/*` payment → `src/server/payment/*`

Utilitas 100% server-only dipindah supaya boundary `lib` (universal) vs `server` (server-only) tegas:

- `src/lib/pakasir.ts` → `src/server/payment/pakasir-utils.ts`
- `src/lib/midtrans.ts` → `src/server/payment/midtrans-utils.ts`
- `src/lib/tripay.ts` → `src/server/payment/tripay-utils.ts`
- `src/lib/kiosk-payment.ts` → `src/server/payment/kiosk-payment.ts`
- `src/lib/settlement-recovery.ts` → `src/server/payment/settlement-recovery.ts`
- `src/lib/use-qris-polling.ts` → `src/hooks/use-qris-polling.ts` (folder baru `src/hooks/`).

Suffix `-utils` dipakai untuk file utilitas murni supaya tidak menabrak `providers/{midtrans,tripay,pakasir}.ts` (impl adapter gateway).

### 11.5 Governance & polish lain

- `src/lib/nav-active.ts` — helper `isNavActive(pathname, href, rootHref)` shared di 3 sidebar (dashboard/admin/staff).
- Error boundary brutalist: `/dashboard/{analytics,finance,subscription,pos,templates/builder/[id]}/error.tsx`.
- `<img>` → `next/image` untuk asset Supabase Storage (logo branding, template preview, result page); `next.config.ts` menambah `images.remotePatterns` untuk `*.supabase.co` + `*.supabase.in`. Data URL (QR aktivasi, hasil kamera, invoice QRIS) tetap `<img>`.
- Icon size standarisasi: `size-3.5` → `size-4` (2 hit).
- `src/lib/constants.ts` — `SIGNED_URL_TTL_SECONDS`, `SESSION_MAX_AGE_SECONDS`, `REVALIDATE_ONE_HOUR` (dedup magic number di 6 file).
- Validators: hapus 6 type export zero-konsumen (`CashConfirmInput`, `PaymentStatusQueryInput`, `LoginInput`, `CheckoutSettingsInput`, `KioskBrandingInput`, `AdminBusinessUpdateInput`).
- Tambah 4 test: `rbac-matrix`, `subscription-gate`, `manual-transaction`, `rate-limit`.
