# SnapyOS — Peta Fitur Menyeluruh (Audit Kode 2026-10-11, angka disegarkan 2026-10-21)

> **Status**: audit berbasis kode berjalan (`src/`, `db/schema.sql`, `tests/`) + knowledge graph
> `codebase-memory` (proyek `Users-ucaany-Downloads-PT-SNAPY-OS`, mode `moderate`, generasi 2026-10-11).
> **Metode**: Scout→Verify. Graf (4.167 node / 14.341 edge, snapshot 2026-10-11), 55 tabel `create table`, 31 fungsi SQL,
> 63 route API, 65 page, 7 layout, 17 modul `"use server"` (99 aksi ter-export), 159 komponen, 86 berkas uji (`tests/*.test.ts`).
> **Bukan** dokumen PRD — dokumen ini merekam **apa yang benar-benar terpasang** di kode.
> Sumber kebenaran tetap `src/`, lalu `db/schema.sql`, lalu `docs/07`+`docs/08`.
> **Cakupan**: seluruh fitur per kategori (Admin, Owner, Staff, Kiosk, POS, Marketing/Auth, Result, API, Cron, DB).
>
> **Segarkan angka 2026-10-21:** hitungan §0/§11/§13 diukur ulang dari kode (lihat `docs/18-audit-report.md`).
> Angka lama (26 fungsi / 61 route / 160 komponen / 60 uji) tertinggal oleh migrasi 0069 dan route
> `device-cleanup` + `/v1/public/frame` yang masuk setelah audit 2026-10-11.

---

## Daftar Isi

| #   | Bagian                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | [Ringkasan Angka](#0-ringkasan-angka-audit-2026-10-11-angka-disegarkan-2026-10-16)                                                       |
| 1   | [Lapisan Lintas-Potong](#1-lapisan-lintas-potong-cross-cutting) — routing, RBAC, tenant, gate langganan, API wrapper, rate limit, desain |
| 2   | [Dashboard Admin](#2-dashboard-admin-platform--ceo) — A1–A16                                                                             |
| 3   | [Dashboard Owner](#3-dashboard-owner-bisnis) — O1–O25                                                                                    |
| 4   | [Dashboard Staff](#4-dashboard-staff-shell-operasional-read-only) — S1–S8                                                                |
| 5   | [Kiosk Customer](#5-kiosk-customer-photobox-publik) — K1–K16                                                                             |
| 6   | [Hasil Online](#6-hasil-online-result-page)                                                                                              |
| 7   | [POS Terminal](#7-pos-terminal-add-on) — P1–P5                                                                                           |
| 8   | [Marketing & Publik](#8-marketing--publik) — M1–M5                                                                                       |
| 9   | [Autentikasi & Onboarding](#9-autentikasi--onboarding) — A–E                                                                             |
| 10  | [Pembayaran & Webhook](#10-pembayaran--webhook)                                                                                          |
| 11  | [API Routes](#11-api-routes-63) — daftar ekshaustif 63 route                                                                             |
| 12  | [Cron & Lifecycle](#12-cron--lifecycle-verceljson)                                                                                       |
| 13  | [Database](#13-database-55-tabel--31-fungsi)                                                                                             |
| 14  | [Storage](#14-storage-dual-provider)                                                                                                     |
| 15  | [Ringkasan Audit](#15-ringkasan-audit) — temuan, backlog, batasan                                                                        |

---

## 0. Ringkasan Angka (Audit 2026-10-11, angka disegarkan 2026-10-16)

| Dimensi                     | Jumlah                   | Catatan                                                                                         |
| --------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| Halaman (`page.tsx`)        | 65                       | 5 route group + kiosk/result/onboarding/welcome                                                 |
| Layout (`layout.tsx`)       | 7                        | root, auth, dashboard, admin, staff, pos, onboarding                                            |
| Route API (`route.ts`)      | 63                       | 23 admin, 7 business, 17 public, 3 webhook, 5 cron, health, auth×3, me, emoji, help, businesses |
| Modul server action         | 17                       | `"use server"` · 99 aksi ter-export                                                             |
| Modul server (`src/server`) | 106                      | data layer                                                                                      |
| Modul lib (`src/lib`)       | 73                       | pure/util (65 di akar + `r2/` 6 + `supabase/` 2)                                                |
| Komponen (`src/components`) | 159 `.tsx`               | 64 dashboard, 24 kiosk (+7 `.ts`), 3 pos, 7 admin                                               |
| Tabel DB                    | 55                       | `db/schema.sql`                                                                                 |
| Fungsi SQL/RPC              | 31                       | 29 dipakai app (4 SECURITY DEFINER) + 2 trigger                                                 |
| Berkas uji                  | 86                       | `node --test` (naik dari 83 setelah suite keamanan ditambahkan — `docs/18` §3)                  |
| Knowledge graph             | 4.167 node / 14.341 edge | snapshot 2026-10-11                                                                             |

**Route group & domain** (single-domain, saling eksklusif):

| Prefix                             | Group         | Guard                                            |
| ---------------------------------- | ------------- | ------------------------------------------------ |
| `/`                                | `(marketing)` | publik                                           |
| `/login` `/register`               | `(auth)`      | publik / redirect bila login                     |
| `/welcome`                         | `welcome`     | login, tanpa membership                          |
| `/onboarding/create-business`      | `onboarding`  | login                                            |
| `/dashboard/*`                     | `(dashboard)` | membership owner/manager (staff-only → `/staff`) |
| `/admin/*`                         | `(admin)`     | `role=admin` atau `ADMIN_EMAILS`                 |
| `/staff/*`                         | `(staff)`     | membership staff-only                            |
| `/pos/*`                           | `(pos)`       | login + business + entitlement POS               |
| `/p/[businessSlug]/[photoboxSlug]` | kiosk         | publik (device token)                            |
| `/r/[token]`                       | result        | publik (result token)                            |
| `/api/*`                           | API           | per-route                                        |

---

## 1. Lapisan Lintas-Potong (Cross-Cutting)

### 1.1 Routing & Redirect

- `src/lib/destination.ts` — `destinationFor(memberships)`: tanpa membership → `/welcome`; semua role `staff` → `/staff`; ada owner/manager → `/dashboard`.
- `src/lib/nav-active.ts` — `isNavActive(pathname, href, rootHref)` (root item hanya aktif saat path sama persis).
- `src/proxy.ts` — **proxy Next 16 (dulu middleware)**, Node runtime, enforce `platform_settings.maintenance_mode`:
  - Non-admin → rewrite `/maintenance` (503 browser) / JSON 503 (`/api/*`).
  - Admin lolos. Allowlist: `/maintenance`, `/login`, `/api/health`, `/api/auth`, `/api/webhooks`, `/admin/*`, `/_next`, favicon.
  - Flag dibaca fresh per request (`src/lib/maintenance.ts`); DB error → fail-closed 503.
  - Admin dengan `users.role = 'admin'` atau email di `ADMIN_EMAILS` sama-sama lolos; resolver tujuan pasca-login memakai kontrak yang sama.
- `next.config.ts` — security headers (CSP, HSTS, X-Frame-Options, Permissions-Policy camera self), `allowedDevOrigins` ngrok, `serverExternalPackages: pdfkit, @node-rs/argon2`, `outputFileTracingIncludes` pdfkit untuk route receipt.
- `src/app/robots.ts` — disallow `/dashboard /admin /staff /pos /api /p /r /onboarding /welcome /login /register`.
- `src/app/sitemap.ts` — 8 path marketing. `src/app/manifest.ts` — PWA kiosk (standalone/fullscreen).

### 1.2 RBAC

- `src/lib/rbac.ts` — 3 role bisnis: `owner` (`*`), `manager` (17 izin termasuk `pos:manage/sell/read`), `staff` (read + `pos:sell/read` + `payment:confirm`).
- Admin platform = `users.role='admin'` ATAU email di `ADMIN_EMAILS` (`src/server/admin/guard.ts`).
- Guard: `requireAdmin()` (throw), `getAdminUser()` (null→redirect), `audit()`.
- Cross-tenant selalu **404** (bukan 403).

### 1.3 Tenant & Sesi

- `src/lib/tenant.ts` — `requireUser`, `getUserMemberships`, `getActiveBusiness` (cookie `snapyos_active_business`), `getMembership` (React `cache`).
- `src/lib/auth.ts` - Auth.js v5 credential (email+password argon2 / email+PIN), JWT + revocation tabel `auth_sessions`, Turnstile CAPTCHA di `authorize()`.
- `src/server/staff-pin.ts` - `verifyStaffPin` (tanpa enumerasi booth).

### 1.4 Gerbang Langganan & Fitur

- `src/lib/subscription-math.ts` — `isSubscriptionEffective(status, trialEndsAt, periodEnd)` = **satu-satunya** gate lifecycle (status + tanggal).
- `src/server/require-subscription.ts` — `requireEffectiveSubscription(businessId, "read"|"write")` → throw `SUBSCRIPTION_EXPIRED` (410).
- `src/server/plan-limits.ts` — `getPlanLimits()`: plan aktif + add-on `unit='session'` → `max_outlets/photoboxes/concurrent_sessions/staff` + `storage_limit_mb`.
- `src/lib/feature-gate.ts` + `src/server/feature-gate.ts` — key di-gate runtime: `voucher, finance, reports, staff, direct_payment, storage, cash_payment, pwa_kiosk`. `hasFeature` / `requireFeature`.
- `src/server/pos-entitlement.ts` — `hasPosEntitlement` (subscription efektif + add-on `code='pos'`), `requirePosAccess`, `getPosAddOnInfo`.

### 1.5 API Wrapper & Error

- `src/lib/api-route.ts` — `adminRoute`, `adminRawRoute`, `authRoute`, `authRawRoute`, `parseUuidParam`, `searchParamsToObject`, `toErrorResponse`.
- `src/lib/api-errors.ts` — envelope sukses `{data}` / error `{error:{code,message,details}}`. Kode termasuk `SESSION_EXPIRED` (410), `RATE_LIMITED`, `SUBSCRIPTION_EXPIRED`, `FEATURE_DISABLED`, `POS_BOOTH_DISABLED`.
- `src/lib/error-redaction.ts`: sanitasi log (secret → `[REDACTED]`, email → `***@domain`).

### 1.6 Rate Limit & Keamanan Input

- `src/lib/rate-limit.ts` — `rateLimit(key, limit, windowMs)` async; counter in-memory per proses (tanpa backend shared). `rateLimitByDevice` lapis kedua per booth.
- `src/lib/upload-validation.ts` — logo PNG/JPG/WebP maks 2 MB (SVG **dilarang**), foto 10 MB, video 15 MB; sniff magic bytes.
- `src/lib/validators.ts` (~1.094 baris) — semua skema Zod: auth, bisnis, branding, kamera, cetak, sesi, outlet, photobox, package, template, voucher, expense, tx manual, staff, POS, kiosk (`KIOSK_PAGE_IDS` allowlist).
- `src/lib/uuid-param.ts` — `parseUuidParam` (non-UUID → 404 sebelum query).
- `src/lib/r2/` — `areas.ts` (2 bucket: business-assets, generated-photos), `r2Key()` guard path-traversal, `provider.ts`, `resolver.ts` (resolve provider pemilik objek via `head()` + cache).

### 1.7 Desain (Neo-Brutalism — satu-satunya bahasa visual)

- `src/styles/tokens.css` + `src/app/globals.css` §`@layer base`.
- Primitif UI: `src/components/ui/*` (card, button, input, select, table, dialog, badge, chart, empty-state, page-header, date-input, multi-select, confirm-dialog, …).
- Eyebrow mono uppercase (tanpa prefix `///`), `font-display` uppercase, border 2px ink, hard shadow, radius 0.
- Shell: `src/components/layout/CollapsibleShell.tsx`, `dashboard/Sidebar.tsx`, `dashboard/Topbar.tsx`, `admin/AdminSidebar.tsx`, `staff/StaffSidebar.tsx`.
- **Aset brand** (diganti 2026-10-16): `public/snapyos-icon-192.png`, `public/snapyos-icon-512.png`, `public/snapyos-icon-maskable-512.png`, `public/apple-touch-icon.png`, `public/snapyos-mark.png` (mark topbar/header/footer/auth), `src/app/favicon.ico` (multi-ukuran 16–256). Dirujuk `src/app/layout.tsx` (`icons`) + `src/app/manifest.ts`. Mark lama `public/avatar-snappy/4.svg` (raster 1,1 MB) dihapus; ilustrasi marketing `public/avatars/*` dan `public/fiture-avatar/*` dipertahankan.

---

## 2. DASHBOARD ADMIN (Platform / CEO)

**Route group**: `(admin)` → `/admin/*` · **Layout**: `src/app/(admin)/layout.tsx` (guard `getAdminUser()` → redirect `/dashboard` atau `/login`).
**Shell**: `AdminTopbar` + `AdminSidebar` (6 grup, 16 item) + `CollapsibleShell`.
**Navigasi** (`src/components/admin/AdminSidebar.tsx`): Utama (1) · Tenant (2) · Monetisasi (5) · Keuangan (2) · Konten & Sistem (4) · Pemasaran (1) · Sisi Owner (1) = 16 item.

### A1. Overview Platform

- **Page**: `src/app/(admin)/admin/page.tsx` (eyebrow `ADMIN - PLATFORM CONTROL`).
- **Data**: `getAdminOverviewGuarded()` + `getAdminAnalytics(30)` + `getDatabaseHealth()` + `getPaymentsSummary()` + `getPlatformSettings()` (`src/server/admin/overview.ts`, `settings.ts`).
- **API**: `GET /api/v1/admin/overview` (adminRawRoute).
- **Metrik (8)**: total businesses, active subscribers, total subscriptions, MRR, total outlets, total photoboxes, total sessions, total transactions.
- **UI**: `MetricCard`, `AdminTrendChart`, `RevenueChart`, `BreakdownChart`; kartu "Kesehatan Database", "Rincian User", "Monitoring Pembayaran", "Pembayaran per Provider", "Revenue Harian", "Transaksi & Sesi".
- **DB**: `businesses, subscriptions, plans, outlets, photoboxes, sessions, transactions, payments, payment_webhooks, subscription_intent_failures, users`.
- **Dampak**: MRR dihitung dari snapshot `plans.price_monthly` subscription `status='active'` (dokumentasi `ponytail:` — upgrade saat invoice history dipakai). Banner maintenance aktif bila `platform_settings.maintenance_mode`.

### A2. Users Management

- **Page**: `/admin/users` (`ADMIN - USERS`) + `/admin/users/[id]` (`ADMIN - USERS / DETAIL`).
- **Server actions**: `createUserAction`, `updateUserAction`, `deleteUserAction` (`src/server/admin-actions.ts`).
- **Data**: `listUsers`, `getUser`, `getUserDetail`, `createUser`, `updateUser`, `deleteUser` (`src/server/admin/users.ts`).
- **API**: `GET/POST /api/v1/admin/users`, `GET/PATCH/DELETE /api/v1/admin/users/[id]`.
- **Form fields**: nama, email, password (min 8), role.
- **Detail**: profil + daftar bisnis + invoice + transaksi + sesi + payment user (tabel + `StatusBadge`).
- **DB**: `users, businesses, auth_sessions, business_members, invoices, payments, sessions, transactions`.
- **Dampak**: delete user → CASCADE ke businesses owned; `auth_sessions` dicabut (revocation). Semua aksi ter-audit.

### A3. Businesses Management

- **Page**: `/admin/businesses` (`ADMIN - BUSINESSES`).
- **Actions**: `updateBusinessAction`. **Data**: `listBusinesses`, `getBusinessUsage`, `updateBusiness`, `deleteBusiness`.
- **API**: `GET/PATCH/DELETE /api/v1/admin/businesses/[id]`, `GET /api/v1/admin/businesses`.
- **Fitur**: cari (search slug/nama), filter status, lihat usage (outlets/photoboxes/sessions/transactions), suspend/aktifkan, hapus.
- **DB**: `businesses, business_members, outlets, photoboxes, sessions, transactions, auth_sessions`.
- **Dampak**: suspend → alur kiosk/dashboard owner tertahan; hapus → CASCADE seluruh data tenant.

### A4. Plans Management

- **Page**: `/admin/plans` (`ADMIN - PLANS`).
- **Actions**: `createPlanAction`, `updatePlanAction`. **Data**: `listPlans`, `createPlan`, `updatePlan`.
- **API**: `GET/POST /api/v1/admin/plans`, `PATCH /api/v1/admin/plans/[id]`.
- **Field**: kode, nama, harga/bln, harga/thn, max_businesses/outlets/photoboxes/concurrent_sessions/staff, `storage_limit_mb`, `platform_fee_percent`, `platform_fee_flat`, `features` (jsonb), is_active.
- **DB**: `plans`. **Dampak**: mengubah limit → `getPlanLimits()` semua tenant plan itu; `features` → gerbang `requireFeature` (voucher, finance, reports, staff, direct_payment, storage, cash_payment, pwa_kiosk); fee → perhitungan settlement.

### A5. Add-ons Management

- **Page**: `/admin/add-ons` (`ADMIN - ADD-ONS`).
- **Actions**: `createAddOnAction`, `updateAddOnAction`. **Data**: `listAddOns`, `createAddOn`, `updateAddOn`.
- **API**: `GET/POST /api/v1/admin/add-ons`, `PATCH /api/v1/admin/add-ons/[id]`.
- **Field**: kode, nama, `price_monthly`, `unit` (session/feature/…), `storage_mb`, is_active.
- **DB**: `add_ons, subscription_add_ons`.
- **Dampak**: `add_ons.code='pos'` → entitlement POS; `unit='session'` + `quantity` → tambah `max_concurrent_sessions`; `storage_mb` → kuota storage. Harga dari DB (tanpa hardcode di frontend).

### A6. Promos Management (subscription)

- **Page**: `/admin/promos` (`ADMIN - SUBSCRIPTION PROMOS`).
- **Actions**: `createPromoAction`, `updatePromoAction`. **Data**: `listPromos`, `createPromo`, `updatePromo`.
- **API**: `GET/POST /api/v1/admin/promos`, `PATCH /api/v1/admin/promos/[id]`.
- **Field**: kode, tipe (percentage/fixed), amount, `min_transaction`, `max_discount`, start/end date, `usage_limit`, is_active.
- **DB**: `subscription_promos`. **Dampak**: dipakai `previewSubscriptionPromo`/`consumeSubscriptionPromo` (`src/server/subscription-promo.ts`) saat checkout invoice subscription.

### A7. Subscriptions Management

- **Page**: `/admin/subscriptions` (`ADMIN - SUBSCRIPTIONS`).
- **Actions**: `updateSubscriptionAction`, `attachAddOnAction`, `cancelAddOnAction`.
- **Data**: `listSubscriptions`, `updateSubscription`, `attachSubscriptionAddOn`, `cancelSubscriptionAddOn` (`src/server/admin/subscriptions.ts`).
- **API**: `GET/PATCH /api/v1/admin/subscriptions/[id]`, `POST /api/v1/admin/subscriptions/[id]/add-ons`, `PATCH/DELETE /api/v1/admin/subscription-add-ons/[id]`.
- **Field**: status (trial/active/past_due/cancelled/expired), mode manual cancel + alasan, `extend_days`, attach add-on + quantity.
- **DB**: `subscriptions, invoices, subscription_add_ons, add_ons`.
- **Dampak**: status → gerbang `isSubscriptionEffective`; extend → `current_period_end`; attach/cancel add-on → POS entitlement, kuota sesi, storage.

### A8. Antrian Aktivasi Manual (Subscription Intent Failures)

- **Page**: `/admin/subscriptions/pending-review` (`ADMIN - SUBSCRIPTIONS / PENDING REVIEW`).
- **Actions**: `activateIntentFailureAction`, `refundIntentFailureAction`, `dismissIntentFailureAction`.
- **Data**: `listIntentFailures`, `activateManually`, `markRefunded`, `dismissFailure` (`src/server/admin/subscription-failures.ts`).
- **Tab status**: PENDING / ACTIVATED / REFUNDED / DISMISSED. Alasan: `SUBSCRIPTION_NOT_ACTIVE`, `UPDATE_NO_ROW`, `MISSING_SUBSCRIPTION_ID`, `INTENT_EXCEPTION`.
- **DB**: `subscription_intent_failures, invoices, subscriptions, audit_logs`.
- **Dampak**: kasus invoice `paid` tapi `applyInvoiceIntent` gagal (owner cancel → cron flip → webhook telat) → uang settled, plan tidak aktif. Resolusi: aktivasi manual / refund / dismiss.

### A9. Payments Monitoring

- **Page**: `/admin/payments` (`ADMIN - PAYMENT MONITORING`).
- **Data**: `listPayments`, `getPaymentsSummary`, `adminPosRevenueSummary` (`src/server/admin/overview.ts`, `pos.ts`).
- **API**: `GET /api/v1/admin/payments`, `GET /api/v1/admin/payments/summary`, `GET /api/v1/admin/payments/pos-revenue`.
- **UI**: filter rentang tanggal, kartu "Ringkasan", tabel "Gross / Fee / Net per Tenant", kartu "Revenue POS per Tenant" (revenue dari `transactions`, breakdown dari `pos_orders`).
- **DB**: `payments, transactions, pos_orders, businesses`.
- **Dampak**: fee platform dihitung dari plan (`platform_fee_percent`/`flat`); POS revenue lintas tenant read-only.

### A10. Gateways (Payment Gateway Global)

- **Page**: `/admin/gateways` (`ADMIN - PAYMENT GATEWAYS`).
- **Actions**: `toggleGatewayAction`. **Data**: `getGatewayState`, `setGatewayEnabled`, `GATEWAY_PROVIDERS` (`src/server/admin/gateways.ts`).
- **API**: (via `platform_settings` + `payment_credentials`) — halaman + action.
- **UI**: tabel credential seluruh tenant **redacted** (merchant_id saja, tanpa secret) + toggle global per provider (pakasir/midtrans/tripay).
- **DB**: `payment_credentials, platform_settings` (key `gateway_<provider>_enabled`).
- **Dampak**: toggle → `platform_settings`; `invalidateMaintenanceCache`. Owner tetap mengelola credential sendiri; admin hanya enable/disable global + visibilitas.

### A11. Templates Global & Kategori

- **Page**: `/admin/templates` (`ADMIN - TEMPLATES & CATEGORIES`) + `/admin/templates/builder/[id]`.
- **Actions**: `createCategoryAction`, `deleteCategoryAction`, `createGlobalTemplateAction`, `updateGlobalTemplateAction`, `toggleTemplateAction`, `saveGlobalTemplateBuilderAction`.
- **Data**: `listTemplateCategories`, `createTemplateCategory`, `deleteTemplateCategory`, `listGlobalTemplates`, `createGlobalTemplate`, `updateGlobalTemplate`, `setGlobalTemplateActive`, `getGlobalTemplate`, `updateGlobalTemplateLayout`, `uploadGlobalTemplateThumbnail`, `replaceGlobalTemplateFrame`, `deleteGlobalTemplate`, `listTemplatePurchases`.
- **API**: `GET/POST /api/v1/admin/templates`, `PATCH/DELETE /api/v1/admin/templates/[id]`, `GET/POST /api/v1/admin/template-categories`, `DELETE /api/v1/admin/template-categories/[id]`.
- **Field**: kategori (nama, harga), template (nama, `category_id`, file frame / `file_url`, thumbnail, price, `is_premium`, is_active).
- **Builder**: `TemplateBuilder` dengan `saveAction=saveGlobalTemplateBuilderAction` — slot drag/resize/rotate di atas frame PNG (`layout` jsonb).
- **DB**: `templates (business_id NULL = global), template_categories, business_template_purchases`.
- **Dampak**: template global + `is_premium` → marketplace owner (`listPremiumTemplates`); pembelian → invoice `intent.type='template_purchase'`.

### A12. Tiket Bantuan (Support lintas tenant)

- **Page**: `/admin/support` (`ADMIN - SUPPORT TICKETS`).
- **Actions**: `updateSupportTicketStatusAction`. **Data**: `listSupportTicketsAdmin`, `updateSupportTicketStatus` (`src/server/admin/support.ts`).
- **UI**: filter status (open/needs_action/resolved), tabel lintas tenant, ubah status.
- **DB**: `support_tickets, support_ticket_replies, businesses, users`.
- **Dampak**: status sinkron ke panel owner `/dashboard/support`.

### A13. Platform Settings

- **Page**: `/admin/settings` (`ADMIN - PLATFORM SETTINGS`).
- **Actions**: `updateSettingsAction`. **Data**: `getPlatformSettings`, `updatePlatformSettings` (`src/server/admin/settings.ts`).
- **API**: `GET/PATCH /api/v1/admin/settings`.
- **Field**: `platform_fee_percent`, `platform_fee_flat`, `default_retention_days`, `trial_days`, `maintenance_message`, `maintenance_mode`, `chroma_key_default_enabled`, `gateway_<provider>_enabled`.
- **DB**: `platform_settings, business_settings, photoboxes`.
- **Dampak**: `maintenance_mode` → `src/proxy.ts` (503 non-admin, admin lolos); fee default hanya tampilan (fee efektif per-plan); retention default → kiosk.

### A14. Audit Log

- **Page**: `/admin/audit` (`ADMIN - AUDIT LOG`).
- **Actions**: `deleteAuditLogsAction`. **Data**: `listAuditLogs`, `deleteAuditLogs` (`src/server/admin/audit.ts`).
- **UI**: filter tanggal (required `before`) + action + search, paginator, hapus log lama.
- **DB**: `audit_logs`.
- **Dampak**: `audit()` (`src/server/audit.ts`) menulis dari seluruh aksi admin & operasi sensitif.

### A15. Broadcast Email

- **Page**: `/admin/broadcasts` (`ADMIN - BROADCAST EMAIL`).
- **Actions**: `createBroadcastAction`, `sendBroadcastAction`, `resendBroadcastAction`.
- **Data**: `listBroadcasts`, `getBroadcastStats`, `listBroadcastRecipients`, `getBroadcast`, `createBroadcast`, `sendBroadcast`, `resendBroadcast` (`src/server/admin/broadcast.ts`).
- **Field**: jenis (announcement/promo/newsletter/event/system), template, audiens (all/users/owners), subject, body.
- **DB**: `broadcast_campaigns, broadcast_recipients, businesses, business_members, users`.
- **Integrasi**: Resend (`src/lib/broadcast-email.ts`, `src/lib/resend.ts`). Status: draft/sending/sent/partial/failed; riwayat per penerima.

### A16. Lintas-Admin

- **Aksi**: `Buka Dashboard Bisnis` → `/dashboard` (admin juga bisa jadi owner).
- **Semua modul admin** memanggil `requireAdmin()` (`src/server/admin/guard.ts`); API memakai `adminRoute`/`adminRawRoute`.

---

## 3. DASHBOARD OWNER (Bisnis)

**Route group**: `(dashboard)` → `/dashboard/*` · **Layout**: `src/app/(dashboard)/layout.tsx`.
**Guard layout**: `requireUser` → `/login`; `destinationFor` ≠ `/dashboard` → redirect; `getActiveBusiness`.
**Shell**: `Topbar` (WorkspaceSwitcher + StorageIndicator + link admin bila admin) + `Sidebar` (5 grup) + `CollapsibleShell` + `CashPaymentNotifier` (bila `payment:confirm` + fitur `cash_payment`) + `InstallPWA`.
**Sidebar** (`src/components/dashboard/Sidebar.tsx`): Utama (Dashboard, Analitik, Metrik) · Operasional (Photobox, Branding & Kiosk, Outlet, Template, Paket, Voucher, POS*, Unduh PWA*) · Keuangan (Transaksi, Keuangan, Payment Gateway, Laporan) · Pelanggan & Tim (Pelanggan, Tim) · Langganan & Akun (Langganan, Pengaturan, Tiket Bantuan, Dokumentasi). `*` = kondisional entitlement/fitur.

### O1. Dashboard Overview

- **Page**: `src/app/(dashboard)/dashboard/page.tsx` · eyebrow `DASHBOARD: <ROLE>` · title = nama bisnis.
- **Data**: `getDashboardSummary`, `getRevenueSeries`, `getOperationalMetrics` (`src/server/dashboard.ts`), `getTxInsights` (`src/server/analytics.ts`), `getActiveSubscription` (`src/server/business.ts`).
- **Komponen**: `DateRangeFilter`, `MetricCard` (hero+sm), `RevenueChart`, `TxInsightsPanel`, `EmptyState`.
- **DB/RPC**: `transactions, sessions, customers, photoboxes` via RPC `dashboard_tx_summary`, `dashboard_daily_revenue`, `operational_metrics`, `tx_insights_summary`.
- **Akses**: semua role dengan membership; insight finansial butuh `transaction:read`.

### O2. Analitik Pendapatan

- **Page**: `/dashboard/analytics` · eyebrow `ANALITIK: PENDAPATAN` · guard `transaction:read`.
- **Data**: `getRevenueBreakdown` (`revenue_breakdown` RPC), `getRevenueSeries` (`src/server/dashboard.ts`).
- **Komponen**: `DateRangeFilter`, `BreakdownChart`, `RevenueChart`, `EmptyState`.
- **DB**: `transactions` (+bucket tanpa package = transaksi POS non-paket).
- **Dampak**: breakdown per package/outlet/payment_method.

### O3. Metrik Operasional

- **Page**: `/dashboard/metrics` · guard `transaction:read`.
- **Data**: `getBusinessMetrics` (`src/server/metrics.ts`) → 9 RPC: `dashboard_tx_summary`, `metrics_tx_status`, `metrics_returning_customers`, `metrics_revenue_per_booth`, `metrics_sessions_per_booth`, `metrics_session_summary`, `metrics_popular_package`, `metrics_popular_template`.
- **DB**: `transactions, customers, photoboxes`.
- **Output**: `formatBp` (basis point) & `formatIDR`.

### O4. Keuangan (Finance)

- **Page**: `/dashboard/finance` · guard `finance:read` + `requireFeature(businessId,'finance')`.
- **Data**: `getFinanceSummary`, `listExpenses` (`src/server/finance.ts`); `listOutlets`.
- **Actions**: `createExpenseAction`, `updateExpenseAction`, `deleteExpenseAction` (`src/server/finance-actions.ts`).
- **Komponen**: `DateRangeFilter`, `MetricCard`, `ExpensesPanel`, `ExpenseFields`, `ExpenseEditForm`.
- **Field expense**: category (rent/electricity/internet/paper/ink/maintenance/staff/equipment/advertising/other), amount, expense_date, outlet_id, note.
- **DB/RPC**: `expenses, outlets` via `dashboard_tx_summary`, `finance_expense_summary`.
- **Output**: gross, discount, net, expenses (per kategori), profit, marginBp. Uang integer IDR.

### O5. Transaksi

- **Page**: `/dashboard/transactions` · eyebrow `TRANSAKSI: <total> TOTAL` · guard `transaction:read`.
- **Data**: `listTransactions` (`src/server/transactions.ts`); `listOutlets`, `listPhotoboxes`, `listPackages`.
- **Actions**: `createManualTxAction` (`src/server/finance-actions.ts`) — **owner-only** (`transaction:manual-create`), non-withdrawable.
- **Komponen**: `DateRangeFilter`, `TransactionsView`, `PreserveSearchParams`.
- **Filter**: rentang tanggal, status, outlet, photobox, package.
- **DB**: `transactions, customers` (+`payment_id`, `pos_order_id`, `cashier_user_id`).
- **Dampak**: `transactions` = **source of truth** financial reporting; `payment_method` ∈ qris/cash/bank_transfer/other/offline/manual/voucher; `withdrawable` false untuk manual & offline.

### O6. Outlet

- **Page**: `/dashboard/outlets` · eyebrow `OUTLET: <ROLE>` · guard server `outlet:read` (halaman tanpa gate baca eksplisit; write: `outlet:write`).
- **Data**: `listOutlets` (`src/server/outlets.ts`), `getPlanLimits`.
- **Actions**: `createOutletAction`, `updateOutletAction`, `deleteOutletAction` (`src/server/booth-actions.ts`).
- **Komponen**: `OutletsTable`, `OutletEditForm`.
- **Field**: name, address, city, province, status (active/inactive).
- **DB**: `outlets, photoboxes`.
- **Dampak**: limit `max_outlets` dari plan; delete **ditolak** bila outlet masih berisi photobox (`VALIDATION_ERROR`); cascade DB tidak pernah terpicu dari aplikasi.

### O7. Photobox

- **Page**: `/dashboard/photoboxes` · eyebrow `PHOTOBOX: <ROLE>` · guard server `photobox:read` (halaman tanpa gate baca eksplisit; write: `photobox:write`).
- **Data**: `listPhotoboxes` (`src/server/photoboxes.ts`), `listOutlets`, `getPlanLimits`, `hasFeature`.
- **Actions**: `savePhotoboxAction`, `deletePhotoboxAction` (`src/server/booth-actions.ts`).
- **Komponen**: `PhotoboxesTable`, `PhotoboxForm`, `DeviceDialog`, `DeleteConfirmForm`.
- **Field**: name, slug, outlet_id, status, exit_pin, `chroma_key_enabled`, `payment_mode` (gateway/voucher), session_settings (`timer_seconds`, `warning_seconds`, `max_retakes`, unlimited), camera_settings, print_settings, `pos_enabled`.
- **DB**: `photoboxes, outlets, devices, activation_codes, member_photoboxes`.
- **Dampak**: `pos_enabled` → POS per-booth + unique index satu booth POS aktif per bisnis; `payment_mode` → kanal bayar kiosk; `exit_pin_hash` → keluar kiosk.
- **Sub: Device pairing** (`DeviceDialog`) — `POST /api/v1/business/:id/photoboxes/:id/activation` (generate kode 6 karakter), `GET /api/v1/business/:id/devices`, `DELETE /api/v1/business/:id/devices/[id]` (revoke); server `generateActivation`, `listDevices`, `revokeDevice` (`src/server/devices.ts`).

### O8. Kamera & Cetak (per photobox)

- **Page**: `/dashboard/photoboxes/[id]/camera` · eyebrow `KAMERA & CETAK — <ROLE>` · guard `photobox:read` (write: `photobox:write`).
- **Data**: `getPhotoboxCameraConfig`, `updatePhotoboxCameraConfig` (`src/server/photoboxes.ts`).
- **Actions**: `setPhotoboxMirrorAction` (`src/server/booth-actions.ts`).
- **Komponen**: `CameraTest` (live preview `getUserMedia`, ambil foto, retake, mirror toggle).
- **DB**: `photoboxes.camera_settings, print_settings`.
- **Catatan**: tanpa kontrol kamera USB native — browser camera PWA saja.

### O9. Paket

- **Page**: `/dashboard/packages` · eyebrow `PAKET: <ROLE>` · guard server `package:read` (halaman tanpa gate baca eksplisit; write: `package:write`).
- **Data**: `listPackages` (`src/server/packages.ts`); `listTemplates`, `listOutlets`, `listPhotoboxes`.
- **Actions**: `createPackageAction`, `updatePackageAction`, `deletePackageAction` (`src/server/catalog-actions.ts`).
- **Komponen**: `PackagesTable`, `PackageFields`, `PackageEditForm` (form create inline di `PackagesTable`).
- **Field**: name, price, photo_count, print_count, digital_output, capture_mode (single/burst/photostrip), description, template_ids, outlet_ids, photobox_ids, is_active.
- **DB**: `packages, package_templates, package_outlets, package_photoboxes, transactions`.
- **Dampak**: menentukan kuota foto/print sesi kiosk + eligibility (outlet/booth) yang dibaca `public-config`.

### O10. Template & Frame

- **Page**: `/dashboard/templates` (+ blok "Template Premium (Marketplace)") · guard server `template:read` (halaman tanpa gate baca eksplisit; write: `template:write`).
- **Data**: `listTemplates`, `getTemplate` (`src/server/templates.ts`); `listPremiumTemplates`, `listPurchasedTemplates` (`src/server/template-purchase.ts`).
- **Actions**: `uploadTemplateAction`, `updateTemplateAction`, `deleteTemplateAction`, `saveTemplateBuilderAction` (`src/server/catalog-actions.ts`); `purchaseTemplateAction` (`src/server/template-purchase-actions.ts`).
- **Komponen**: `TemplatesGrid`, `TemplateEditForm`, `PremiumTemplatesGrid`, `TemplateBuilder`.
- **Field**: name, category, `category_id`, file (PNG chroma-key), thumbnail, video_url, price, `is_premium`, layout (jsonb), is_active.
- **DB**: `templates, template_categories, business_template_purchases, invoices`.
- **Dampak**: frame + layout dipakai engine `composeFrame`/`slotClipPath` (`src/lib/compose-frame.ts`, `template-layout.ts`) saat kiosk finalize. Beli premium → invoice `intent.type='template_purchase'` (void invoice pending lama).

### O11. Template Builder (Slot Editor)

- **Page**: `/dashboard/templates/builder/[id]` (+ admin mirror `/admin/templates/builder/[id]`).
- **Komponen**: `src/components/dashboard/TemplateBuilder.tsx` (~996 baris): drag/resize/rotate slot di atas frame PNG, z-order, clip-path, preview `composeFrame`, upload frame/thumbnail, chroma-key.
- **Lib**: `src/lib/template-layout.ts` (`layoutSchema`, `slotCount`, `slotsByZ`), `src/lib/template-cleanup.ts`.
- **DB**: `templates.layout` (jsonb).
- **Catatan status**: god-component terdaftar sebagai known-issue (H7).

### O12. Voucher

- **Page**: `/dashboard/vouchers` · eyebrow `VOUCHER: <ROLE>` · guard server `voucher:read` (+`requireFeature('voucher')`); halaman tanpa gate baca eksplisit, write: `voucher:write`.
- **Data**: `listVouchers`, `getVoucherAnalyticsBatch` (`src/server/vouchers.ts`); `listPackages`, `listOutlets`.
- **Actions**: `createVoucherAction`, `updateVoucherAction`, `deleteVoucherAction` (`src/server/catalog-actions.ts`).
- **Komponen**: `VouchersTable`, `VoucherFields`, `VoucherEditForm` (form create inline di `VouchersTable`).
- **Field**: code, type (percentage/fixed), amount, min_transaction, max_discount, usage_limit, usage_per_customer, start/end date, package_ids, outlet_ids, is_active.
- **DB**: `vouchers, voucher_packages, voucher_outlets, voucher_usages`.
- **Dampak**: validasi server-side saat checkout kiosk (`validateVoucherForCheckout`); usage dicatat di `voucher_usages` (unique per payment/transaction).

### O13. Tim (Staff Management)

- **Page**: `/dashboard/staff` · eyebrow `TIM: AKSES BOOTH`.
- **Data**: `listStaff`, `listAssignedPhotoboxIds`, `listStaffDirectory` (`src/server/staff.ts`); `listPhotoboxes`, `getPlanLimits`.
- **Actions**: `inviteStaffAction`, `updateStaffRoleAction`, `removeStaffAction`, `updateStaffBoothsAction`, `setStaffPinAction` (`src/server/staff-actions.ts`).
- **Komponen**: `StaffPanel`.
- **Field**: email, role (manager/staff), user_id, photobox_ids, pin.
- **DB**: `business_members, member_photoboxes, photoboxes, users`.
- **Dampak**: limit `max_staff`; `member_photoboxes.pin_hash` → login PIN staff + akses booth; role → RBAC.

### O14. Pelanggan

- **Page**: `/dashboard/customers` · guard `customer:read`.
- **Data**: `listCustomers`, `getCustomer` (`src/server/customers.ts`, RPC `customer_spending`).
- **API**: `GET /api/v1/business/:businessId/customers/[id]`.
- **Komponen**: `CustomersTable`, `PreserveSearchParams` (search + pagination).
- **DB**: `customers, sessions, transactions`.
- **Dampak**: detail menampilkan total spending + riwayat.

### O15. Laporan (Export)

- **Page**: `/dashboard/reports` · eyebrow `LAPORAN: EXPORT` · guard `report:read`.
- **Data**: `generateReport` (`src/server/reports.ts`), diunduh via `GET /api/v1/business/:businessId/reports?type=&from=&to=&format=`.
- **Tipe**: daily, weekly, monthly, revenue, transactions, outlet, photobox, expenses, voucher.
- **Format**: CSV & XLSX (ExcelJS; bukan xlsx).
- **Lib**: `src/lib/report-csv.ts` (`toCSV`, `reportFilename`).
- **DB**: `transactions, expenses, voucher_usages`.

### O16. Pengaturan (Settings)

- **Page**: `/dashboard/settings` · guard `business:update` untuk write (owner + manager).
- **Komponen**: `BusinessProfileEditor`, `CheckoutSettingsEditor`, `RetentionSettingsEditor`, `StorageUsageCard`.
- **Actions**: `updateBusinessProfileAction` (`src/server/business-actions.ts`); `updateRetentionSettingsAction`, `updateCheckoutSettingsAction` (`src/server/branding-actions.ts`).
- **Field**: name, owner_name, whatsapp, contact_email, address; `qris_expiry_minutes`; `retention_days` (1–3 hari); storage usage.
- **DB**: `businesses, business_settings, platform_settings`.
- **Dampak**: retention → cron retention; QRIS expiry → checkout kiosk; storage penuh → CTA upgrade.

### O17. Branding & Kiosk

- **Page**: `/dashboard/branding` · guard `business:update` (owner + manager).
- **Data**: `getBranding` (`src/server/branding.ts`); `listPhotoboxes`.
- **Actions**: `saveBrandingKioskAction`, `uploadLogoAction`, `deleteLogoAction`, `uploadKioskVideoAction`, `deleteKioskVideoAction`, `uploadKioskPageVideoAction`, `deleteKioskPageVideoAction` (`src/server/branding-actions.ts`); `savePhotoboxBrandingAction` (`src/server/booth-actions.ts`).
- **Komponen**: `KioskBrandingEditor` (~1.550 baris, god-component known-issue).
- **Field**: welcome_title/tagline/button, primary/secondary color, logo, font_family/scale, button_radius, padding, align, welcome_layout, payment_align/result_layout, judul+hint tiap layar (welcome/guide/package/payment/template/capture/editor/result), guide_steps, video per layar, `show_mirror_toggle`, `allow_zoom_pan`; override per booth.
- **DB**: `business_settings.branding, photoboxes.branding`.
- **Dampak**: dibaca `getPublicConfig` → `PublicConfig.branding` → `kioskVisualStyle` di seluruh layar kiosk. **Single source of truth** kustomisasi kiosk.
- **Catatan**: `updateBrandingAction` (dipakai form branding lama di `/dashboard/settings`) sudah tidak punya pemanggil di UI; jangan dihapus tanpa memeriksa ulang; `saveBrandingKioskAction` adalah jalur aktif.

### O18. Payment Gateway (Credential Owner)

- **Page**: `/dashboard/payment` · guard owner (credential).
- **Data**: `listCredentials` dll (`src/server/payment-credentials.ts`).
- **Actions**: `createCredentialAction`, `updateCredentialAction`, `deleteCredentialAction`, `toggleCredentialAction`, `testCredentialAction` (`src/server/payment-credential-actions.ts`).
- **Komponen**: `PaymentGatewaySettings`, `PaymentCredentialCard`, `PaymentCredentialForm`, `PaymentMethodSelector`.
- **Field**: provider (pakasir/midtrans/tripay), environment (sandbox/production), label, merchant_id, server_key, client_key, private_key (Tripay), webhook_secret, enabled_methods, is_active.
- **DB**: `payment_credentials` (server_key & private_key **terenkripsi**, `PAYMENT_ENCRYPTION_KEY`).
- **Dampak**: kredensial ini → `listKioskPaymentMethods` → metode bayar kiosk; webhook diverifikasi per credential. Dana langsung ke rekening owner (direct merchant). `requireFeature('direct_payment')`.

### O19. POS Management (Add-on)

- **Page**: `/dashboard/pos` · guard `pos:read` + entitlement (halaman tanpa gate baca eksplisit; aksi bergerbang `pos:manage`/`pos:sell`).
- **Data**: `listPosProducts`, `listPosCategories`, `listPosBooths` (`src/server/pos-products.ts`); `posRevenueReport`, `posBreakdownReport`, `posVsKioskSplit` (`src/server/pos-reports.ts`); `getPosAddOnInfo`, `hasPosEntitlement`.
- **Actions**: `posCreateProductAction`, `posUpdateProductAction`, `posDeactivateProductAction`, `posToggleBoothAction` (`src/server/pos-actions.ts`).
- **Komponen**: `PosProductsTable`, `PosProductFields`, `PosProductEditForm`, `PosBoothsTable`, `PosReportsPanel`, `PosReportsDayChartInner`.
- **Field produk**: category, name, sku, price, cost, stock (null=tanpa tracking), description, image, is_active.
- **DB**: `pos_products, pos_orders, pos_order_items, photoboxes, transactions`.
- **Tanpa entitlement**: halaman aktivasi (harga dari `getPosAddOnInfo`, bukan hardcode).

### O20. Unduh PWA (Kiosk)

- **Page**: `/dashboard/pwa` · guard `photobox:write` + `hasFeature('pwa_kiosk')`.
- **Konten**: panduan pasang PWA (Android Chrome / iOS Safari), langkah pairing, link ke URL kiosk.
- **DB**: tidak ada. **Dampak**: memudahkan owner memasang kiosk di tablet.

### O21. Langganan (Subscription)

- **Page**: `/dashboard/subscription` · guard **owner-only**: role lain melihat kartu "Hanya owner"; detail invoice non-owner → not-found. Server: `requireOwner` + `subscription:write`.
- **Data**: `getSubscriptionOverview` (`src/server/subscription.ts`).
- **Actions**: `confirmSubscriptionCheckoutAction`, `previewSubscriptionPromoAction`, `cancelSubscriptionAction`, `resumeSubscriptionAction`, `cancelAddOnAction`, `createInvoiceQrisAction`, `invoicePaymentStatusAction` (`src/server/subscription-actions.ts`).
- **Komponen**: `SubscriptionPanel`, `SubscriptionCheckout`, `SubscriptionCheckoutTrigger`.
- **Isi**: plan aktif, status + periode, kuota (outlets/photoboxes/sessions/staff/devices), daftar plan (ubah), add-on (attach/cancel), riwayat invoice (20 terakhir).
- **DB**: `subscriptions, plans, invoices, add_ons, subscription_add_ons, outlets, photoboxes, business_members, devices`.
- **Dampak**: `cancelSubscription` → `cancel_at_period_end`; `resume` → false; invoice QRIS → `invoice_payments` + webhook Pakasir.

### O22. Invoice Subscription (Bayar)

- **Page**: `/dashboard/subscription/invoice/[id]` + `receipt/route.ts`.
- **Data**: `getInvoiceDetail`, `getInvoiceReceipt`, `createInvoiceQris`, `getInvoicePaymentStatus` (`src/server/payment/invoice.ts`).
- **Komponen**: `InvoicePayClient` (QRIS + polling status), `pdfkit` untuk receipt PDF (A4, brutalist).
- **DB**: `invoices, invoice_payments`.
- **Integrasi**: Pakasir aggregator (dana → SnapyOS) — env `PAKASIR_API_KEY`/`PAKASIR_PROJECT_SLUG`; webhook `/api/webhooks/payment/pakasir` bercabang pada `order_id` invoice.
- **Dampak**: paid → `applyInvoiceIntent` (aktivasi plan/add-on/template purchase) atau `subscription_intent_failures` bila gagal.

### O23. Tiket Bantuan (Owner)

- **Page**: `/dashboard/support` + `/dashboard/support/[id]`.
- **Data**: `listSupportTickets`, `getSupportTicket`, `submitSupportTicket`, `replySupportTicket` (`src/server/support-tickets.ts`).
- **Actions**: `submitSupportTicketAction`, `replySupportTicketAction` (`src/server/support-ticket-actions.ts`).
- **Komponen**: `SupportTicketsPanel`, `SupportTicketDetail`.
- **Field**: subject, category, area, description, reply body.
- **DB**: `support_tickets, support_ticket_replies, businesses, users`.
- **Akses**: semua anggota boleh membuat/membalas tiketnya sendiri; **daftar & detail lintas-anggota hanya owner**; non-owner hanya melihat tiket yang ia buat (sisanya 404).
- **Dampak**: muncul di `/admin/support`; admin ubah status → owner lihat.

### O24. Topbar & Workspace

- **Komponen**: `Topbar`, `WorkspaceSwitcher`, `StorageIndicator`.
- **Actions**: `switchWorkspaceAction` (`src/server/business-actions.ts`) — validasi membership, set cookie.
- **API**: `GET /api/v1/business/:businessId/storage` (tenant-scoped 404), `GET /api/v1/me/businesses`.
- **Dampak**: `activeBusinessId` cookie menggerakkan seluruh dashboard; indicator fetch on-mount tanpa blok SSR.

### O25. Konfirmasi Tunai (Cash Notifier)

- **Komponen**: `CashPaymentNotifier` (dipasang di layout dashboard & staff).
- **API**: `GET /api/v1/business/:businessId/cash-payments` (polling 5s).
- **Actions**: `confirmCashPaymentAction` (`src/server/cash-payment-actions.ts`) → `confirmCashPaymentByOperator` (`src/server/cash-payment.ts`).
- **Gate**: `can(role,'payment:confirm')` + `hasFeature('cash_payment')` + `requireEffectiveSubscription('write')` (C3).
- **DB**: `payments, checkout_sessions, transactions`.
- **Dampak**: konfirmasi → `settleCashPayment` → transaksi paid + sesi bisa dibuka kiosk.

---

## 4. DASHBOARD STAFF (Shell Operasional Read-Only)

**Route group**: `(staff)` → `/staff/*` · **Layout**: `src/app/(staff)/staff/layout.tsx`.
**Guard layout**: `requireUser` → `/login`; `destinationFor` ≠ `/staff` → redirect (owner/manager → `/dashboard`).
**Shell**: `StaffTopbar` (tanpa workspace switcher) + `StaffSidebar` (5 modul) + `CashPaymentNotifier` (bila fitur `cash_payment`).
**Sidebar** (`src/components/staff/StaffSidebar.tsx`): Overview · Booth · Outlet · Package · Template.

### S1. Staff Overview

- **Page**: `src/app/(staff)/staff/page.tsx` · eyebrow `STATION.CTL · <ONLINE/OFFLINE>`.
- **Data**: `getStaffOverview` (`src/server/staff-overview.ts`).
- **Guard internal**: bila `can(role,'transaction:read')` → redirect `/dashboard` (staff tidak lihat finansial).
- **Komponen**: kartu status booth (online/offline/maintenance), sesi aktif + elapsed, link cepat ke 5 modul, jam live zona bisnis (`StationClock` + `LiveSessionMeta`; tick 15 dtk, label WIB/WITA/WIT ikut `businesses.timezone`).
- **DB**: `businesses, outlets, packages, photoboxes, sessions, templates`.
- **Catatan**: staff **tanpa** akses write, finansial, subscription, settings, admin.

### S2. Booth (Read-Only)

- **Page**: `/staff/photoboxes` · **Data**: `listPhotoboxes`, `listOutlets`, `getPlanLimits`.
- **Komponen**: `PhotoboxesTable` (mode read-only), `PageHeader`.
- **DB**: `photoboxes, outlets, devices`.

### S3. Outlet (Read-Only)

- **Page**: `/staff/outlets` · **Data**: `listOutlets`, `listPhotoboxes`, `getPlanLimits`.
- **Komponen**: `OutletsTable` (read-only), `PageHeader`.
- **DB**: `outlets, photoboxes`.

### S4. Package (Read-Only)

- **Page**: `/staff/packages` · **Data**: `listPackages`, `listTemplates`, `listOutlets`, `listPhotoboxes`.
- **Komponen**: `PackagesTable` (read-only).
- **DB**: `packages, package_templates, package_outlets, package_photoboxes`.

### S5. Template (Read-Only)

- **Page**: `/staff/templates` · **Data**: `listTemplates` (hanya `is_active`, frame yang benar-benar bisa dipilih customer).
- **Komponen**: `TemplatesGrid` (read-only; empty state khusus tanpa ajakan upload/assign).
- **DB**: `templates`.

### S6. Login PIN Staff (Per Booth, Tanpa Enumerasi)

- **Jalur**: `loginAction` (`src/server/auth-actions.ts`) menerima `email + pin` (tanpa `photobox_id`).
- **Verifikasi**: `verifyStaffPin(email, pin)` (`src/server/staff-pin.ts`) → `member_photoboxes.pin_hash` (argon2id), maks `MAX_PIN_CANDIDATES` hash per percobaan.
- **Lockout**: `login:pin:<email>` 5 gagal / 15 menit (di atas limit IP 5/menit).
- **DB**: `member_photoboxes, photoboxes, users`.
- **Dampak**: PIN tetap berlaku per (staff × booth) di DB, tapi halaman login tidak pernah menerima/mengembalikan daftar booth, jadi tidak ada enumerasi booth pra-sesi. Shell staff menentukan business dari membership.

### S7. Konfirmasi Tunai (Staff sebagai Kasir Kiosk)

- **Komponen**: `CashPaymentNotifier` di layout staff.
- **Gate**: `can('staff','payment:confirm')` = **ya** + `hasFeature('cash_payment')`.
- **Actions/API**: `confirmCashPaymentAction`, `POST /api/v1/public/:businessSlug/payments/cash-confirm` (memerlukan `transaction:write` — staff **tidak** punya via API; jalur staff = server action).
- **DB**: `payments, checkout_sessions, transactions`.
- **Dampak**: staff bisa membuka sesi kiosk yang menunggu bayar tunai.

### S8. POS sebagai Kasir (tanpa role baru)

- **Akses**: staff punya `pos:sell` + `pos:read` → bisa buka `/pos/*` (route group terpisah, bukan bagian shell `/staff`).
- **Gate**: `hasPosEntitlement(businessId)` di `src/app/(pos)/pos/layout.tsx` (UX) + `requirePosAccess` per action (keamanan).
- **Dampak**: staff/manager/owner semua bisa menjadi kasir POS per-booth.

---

## 5. KIOSK CUSTOMER (Photobox Publik)

**Route**: `/p/[businessSlug]/[photoboxSlug]` (`?code=<6-char>` untuk pairing ulang) · **Page**: `src/app/p/[businessSlug]/[photoboxSlug]/page.tsx`.
**Komponen root**: `KioskErrorBoundary` → `KioskApp` (`src/components/kiosk/KioskApp.tsx`, ~813 baris).
**Config awal**: `getPublicConfig(businessSlug, photoboxSlug)` (`src/server/public-config.ts`).
**Bootstrap dev/offline**: `devSkipPayment` (`DEV_SKIP_PAYMENT=true`), `offlineEnabled` (`business_settings.checkout.offline_enabled`).

**State machine** (`KioskApp` `Step`): `activation → setup → welcome → guide → package → checkout → template → capture → editor → printing → result`.

### K1. Activation (Pairing Device)

- **Komponen**: `ActivationScreen` (input 6 karakter, auto-submit bila `?code=`).
- **API**: `POST /api/v1/public/devices/activate` (rate limit 10/menit/IP).
- **Server**: `activateDevice` → RPC `activate_device_atomically` (kode sekali pakai, hapus device lama booth yang sama).
- **DB**: `activation_codes, devices, photoboxes, businesses`.
- **Dampak**: menyimpan `snapyos_device_token` di `localStorage`; `?code=` eksplisit membuang token lama (pairing ulang) lalu membersihkan query.

### K2. Setup Wizard (Kamera & Printer)

- **Komponen**: `SetupWizard` — pilih kamera (`enumerateDevices` + `getUserMedia`), tes kamera, konfirmasi printer.
- **API**: `POST /api/v1/public/devices/report` (laporan diagnostik/status).
- **DB**: `devices.camera_config, printer_config, diagnostics, last_heartbeat_at`.
- **Dampak**: menandai `snapyos_device_setup_done:<photoboxSlug>` (per booth — browser yang sama tidak mewarisi status setup booth lain); tanpa ini welcome tidak muncul.

### K3. Boot & Resume Sesi

- **API**: `POST /api/v1/public/devices/verify` (device token → config + `active_session` + `claimable_checkout_id`).
- **Server**: `verifyDevice` (`src/server/devices.ts`).
- **Dampak**: sesi aktif (mis. reload pasca-bayar) → **resume** ke `template` tanpa bayar ulang; package yang sudah dinonaktifkan disintetis dengan `photo_count` dari server.

### K4. Welcome Screen

- **Komponen**: `WelcomeScreen` + `OnScreenKeyboard` (opsional).
- **Data**: `liveConfig.business`, `liveConfig.branding` (title/tagline/button, video attract screen).
- **Dampak**: tombol mulai → `guide` (bila `guide_steps` ada) atau `package`.

### K5. Guide Screen (Tutorial)

- **Komponen**: `GuideScreen` (langkah dari `kiosk.guide_steps`).
- **Dampak**: tampil hanya bila owner mengisi langkah; bisa kembali ke welcome.

### K6. Package Picker

- **Komponen**: `PackagePicker` (nama, harga, jumlah foto/cetak, digital).
- **Data**: `liveConfig.packages` (dari `listPublicPackages`).
- **Dampak**: pilih paket → cek sesi aktif (resume) → `checkout` (atau langsung sesi bila dev/offline).

### K7. Checkout (Pay-First)

- **Komponen**: `CheckoutScreen` + `PaymentMethodPicker` + `QrisPayment`/`VaPayment`/`CashPayment`/`VoucherPayment` + `PaidNotice`.
- **API**:
  - `POST /api/v1/public/:businessSlug/checkout` (rate limit 30/menit/IP) → `createCheckout`.
  - `POST /api/v1/public/:businessSlug/checkout/apply-voucher` → `applyVoucherToCheckout`.
  - `POST /api/v1/public/:businessSlug/payments/create` (rate limit IP + device) → `createPayment`.
  - `GET /api/v1/public/:businessSlug/payments/:paymentRef/status` → recovery status.
  - `POST /api/v1/public/:businessSlug/payments/cash-confirm` (operator session).
- **Hook**: `useQrisPolling` (`src/hooks/use-qris-polling.ts`, polling 3 detik).
- **Server**: `src/server/payment/checkout-create.ts`, `payment-create.ts`, `qris.ts`, `kiosk-payment.ts`, `payment-methods.ts`.
- **DB**: `checkout_sessions, payments, payment_credentials, voucher_usages, business_settings`.
- **Reservasi**: payment `creating` + partial unique index satu payment aktif per checkout; expiry QRIS dari `business_settings.checkout.qris_expiry_minutes`.
- **Metode**: `qris` (Pakasir/Midtrans/Tripay), `va`, `redirect`, `voucher`, `cash`; difilter `payment_mode` booth (gateway/voucher/null).
- **Mode offline**: tombol "Lanjut offline" di ringkasan pesanan bila `offline_enabled` → `startDirectSession` (transaksi `payment_method='offline'`, non-withdrawable). Server yang memutuskan (dev gate / `offline_enabled`), klien tidak dipercaya.

### K8. Template Picker (Frame)

- **Komponen**: `TemplatePicker`.
- **API**: `GET /api/v1/public/:businessSlug/templates?package=<packageId>`.
- **Data**: `listPublicTemplates` (package_templates + business_template_purchases).
- **Cache**: `prefetchTemplatesForPackages` (prefetch saat idle) + `template-cache.ts`.
- **Dampak**: memilih frame/layout yang dipakai editor & compose.

### K9. Capture (Kamera)

- **Komponen**: `CameraCapture` (dynamic import `ssr:false`), countdown, mirror toggle, retake, progress.
- **Lib**: `src/lib/camera-capture.ts`, `camera-provider.ts`, `camera-errors.ts`, `photo-render.ts`.
- **API**: `POST /api/v1/public/devices/report` (status).
- **DB**: tidak langsung; hasil disimpan di state sampai finalize.
- **Batasan**: `camera_settings` (deviceId, mirror, countdown, resolution, rotasi/zoom kalibrasi, chroma key); frame ber-slot menentukan kuota capture, template legacy memakai `package.photo_count`; slot lebih banyak dari foto yang tersedia diisi bergiliran; finalize memvalidasi capture mentah terhadap frame/paket dan menyimpan composite final; `max_retakes` opsional dari `session_settings` (tidak diset = retake tak terbatas, docs/05 §5.5.2).

### K10. Editor (Edit Foto)

- **Komponen**: `Editor` (dynamic import) + `StickerPicker`.
- **Fitur**: filter preset (`FILTER_PRESETS`), adjust (brightness/contrast/saturation/…), overlay teks/sticker, drag/zoom/pan, compose frame (`composeFrame`), layout slot (`slotClipPath`).
- **Lib**: `src/lib/compose-frame.ts`, `template-layout.ts`, `src/components/kiosk/photo-render.ts`.
- **Dampak**: menghasilkan `FinalPhoto[]` untuk finalize + print.

### K11. Printing

- **Komponen**: `PrintLayoutRenderer` (dynamic import) — layout cetak dari `print_settings` + `package.print_count`.
- **Lib**: `src/lib/print-layout.ts` (`printPlan`).
- **Dampak**: `window.print()` (media print); tanpa printer SDK native.

### K12. Finalize (Sesi → Hasil)

- **API**: `POST /api/v1/public/:businessSlug/sessions` (mulai sesi, rate limit IP+device) → `createSession`.
- **API**: `POST /api/v1/public/:businessSlug/sessions/:id/finalize` (multipart foto) → `finalizeSession`.
- **API**: `POST /api/v1/public/:businessSlug/sessions/:id/abort` → `abortSession`.
- **Server**: `src/server/kiosk-sessions.ts`.
- **Validasi finalize**: device↔sesi cocok; status `completed` → idempotent return; expired + grace offline; jumlah foto ≤ `package.photo_count`; retake ≤ `max_retakes`; `assertStorageAvailable`; hapus photos lama (retry-safe); upload ke storage (R2 write, Supabase read); GIF slideshow (`generateSlideshowGif`, `src/server/gif.ts`); insert `photos`; `accountStorageAdd`; update `sessions.status='completed'`, `result_gif_key`.
- **DB**: `sessions, photos, transactions, payments, checkout_sessions, packages, photoboxes, business_settings`.
- **Dampak**: membuat `transactions` (source of truth) + `result_token` untuk hasil online.

### K13. Result Screen (di Kiosk)

- **Komponen**: `ResultScreen` — QR/link hasil, GIF, download foto, cetak ulang, reset.
- **Data**: `result.result_token`, `gif_url`, `finalPhotos`.
- **Dampak**: `onReset` kembali ke welcome; `pendingSync`/`syncFailed` untuk mode offline.

### K14. Offline Queue (Kiosk Mati/Offline)

- **Lib**: `src/components/kiosk/offline-queue.ts` (`enqueueFinalize`, `drainQueue`, `purgeOrphaned`, `buildFinalizeForm`).
- **Perilaku**: foto disimpan lokal (IndexedDB), finalisasi disinkronkan saat online (retry 30s + event `online`); purge sekali-jalan store lawas (C4, flag-gated); token diambil dari `localStorage` (antrian tidak menyimpan bearer).
- **Dampak**: antrian survive reload; `SESSION_EXPIRED` grace `OFFLINE_FINALIZE_GRACE_MS`.

### K15. Kiosk Lock & Exit PIN

- **Hook**: `useKioskLock`, `useHoldExit` (`src/components/kiosk/use-kiosk-lock.ts`).
- **Komponen**: `ExitPinDialog` — keluar via PIN petugas (server-verified, `exit_pin_register_failure` RPC, 5 gagal → lock 5 menit).
- **DB**: `photoboxes.exit_pin_hash, exit_pin_failed_count, exit_pin_locked_until`.
- **Dampak**: fullscreen lock dari setup s/d akhir; keluar **tidak** reset sesi/step.

### K16. Config Sync (Live Update)

- **Hook**: `useConfigSync` (poll ETag/304 3s saat idle) + `use-object-url`.
- **API**: `GET /api/v1/public/:businessSlug?photobox=<slug>` (ETag `W/"…"`, 304 tanpa body, `Cache-Control: no-store`).
- **Dampak**: perubahan owner (timer, retake, branding, paket) tersinkron tanpa reload; sesi berjalan tidak disentuh.

---

## 6. HASIL ONLINE (Result Page)

**Route**: `/r/[token]` · **Page**: `src/app/r/[token]/page.tsx` · **Data**: `getResult(resultToken)` (`src/server/kiosk-sessions.ts`).
**API padanan**: `GET /api/v1/public/results/:resultToken` (rate limit IP 60/60s).
**Isi**: nama bisnis, judul "Foto kamu siap!", GIF slideshow (`result_gif_key`), foto berframe (signed URL), unduh — tombol unduh memakai signed URL `Content-Disposition: attachment` (`gif_download_url`, `photos[].download_url`) karena atribut `download` pada `<a>` cross-origin diabaikan browser.
**DB**: `checkout_sessions (result_token), sessions, photos, businesses, business_settings (retention_days)`. (Dokumen sebelumnya menulis `templates` — salah; `photos.template_id` tidak pernah dibaca di jalur ini.)
**Dampak**: token publik (`checkout_sessions.result_token`); media dibersihkan cron retention setelah `retention_days` → link kedaluwarsa (404). Error transien (DB/storage down) → error boundary, bukan 404.
**Gerbang 404 ada di `layout.tsx`, bukan `page.tsx`** — `loading.tsx` di segmen ini membuat Suspense boundary; begitu boundary menyala, Next mengirim kerangka respons dengan status 200 dan status itu tidak bisa diubah lagi, sehingga `notFound()` di page hanya mengganti body. Layout dirender di luar boundary itu, jadi `notFound()` di sana menetapkan 404 sebelum byte pertama. `getResult` dibungkus `cache()` supaya gerbang dan render berbagi satu query. Dijaga `tests/result-page.test.ts` (docs/18 §5.1).
**Gap backlog (disengaja, docs/05 §5.13)**: UNDUH SEMUA (ZIP), logo owner di header, background kustom owner — belum diimplementasi.

---

## 7. POS TERMINAL (Add-on)

**Route group**: `(pos)` → `/pos/*` · **Layout**: `src/app/(pos)/pos/layout.tsx` (guard: user → business aktif → `hasPosEntitlement`).
**Model**: offline-only cash/bank_transfer/other; per-booth (`photoboxes.pos_enabled`); tanpa role baru (staff punya `pos:sell`).

### P1. Pos Gate (Pilih Booth)

- **Page**: `/pos` · **Data**: `listPosBooths` (filter `pos_enabled`).
- **UI**: kartu booth → `/pos/terminal?photobox=<id>`; empty-state bila tidak ada booth aktif.
- **DB**: `photoboxes, outlets`.

### P2. Terminal Kasir

- **Page**: `/pos/terminal?photobox=<id>` · **Komponen**: `src/components/pos/PosTerminal.tsx`.
- **Guard**: booth wajib milik tenant + `pos_enabled` (server-side); `listPosProducts({activeOnly})`.
- **Fitur**: katalog produk (kategori, harga, stok, gambar), keranjang (qty, batas stok), total, submit order → `pending`.
- **Actions**: `posSubmitOrderAction` → `createPosOrder`; `posPayOrderAction` → `payPosOrderManually`; `posCancelOrderAction` → `cancelPosOrder`.
- **Komponen**: `PayMethodDialog` (pilih cash/bank_transfer/other).
- **DB/RPC**: `pos_orders, pos_order_items, pos_products, photoboxes, transactions` via RPC `pos_complete_payment`, `pos_decrement_stock`.
- **Dampak**: order paid → insert `transactions` (payment_method cash/bank_transfer/other, `cashier_user_id`, `pos_order_id`; unique per order); stok berkurang; struk.

### P3. Struk POS

- **Page**: `/pos/receipt/[orderId]` · **Komponen**: `ReceiptView` (`window.print`, media print).
- **Data**: `getPosOrder` (`src/server/pos-orders.ts`). Riwayat dan laporan POS dibaca melalui halaman laporan (`posRevenueReport`, `posBreakdownReport`, `posVsKioskSplit`); tidak ada export `listPosOrders` yang aktif.
- **DB**: `pos_orders, pos_order_items, pos_products, photoboxes, outlets, users, transactions`.
- **Isi**: nomor order, metode, booth, outlet, kasir, waktu, item, subtotal.

### P4. POS Reports (Owner)

- **Data**: `posRevenueReport`, `posBreakdownReport`, `posVsKioskSplit` (`src/server/pos-reports.ts`).
- **Komponen**: `PosReportsPanel`, `PosReportsDayChartInner` (di `/dashboard/pos`).
- **Lib**: `src/lib/pos-math.ts`, `pos-reports-math.ts`.
- **DB**: `pos_orders, pos_order_items, transactions`.
- **Dampak**: revenue dari `transactions`; breakdown dari snapshot nama produk di `pos_order_items`.

### P5. Entitlement & Gate POS

- **Gate tunggal**: `hasPosEntitlement` + `requirePosAccess` (`src/server/pos-entitlement.ts`) — dipanggil baris pertama semua action POS.
- **Kriteria**: subscription efektif (`isSubscriptionEffective`) + add-on `code='pos'` aktif.
- **DB**: `subscriptions, subscription_add_ons, add_ons`.
- **Kode error**: `POS_BOOTH_DISABLED`, `POS_NOT_SUBSCRIBED` (via `ApiError`).

---

## 8. MARKETING & PUBLIK

**Route group**: `(marketing)` — tidak ada layout bersama; tiap page merakit `Header`/`SiteFooter` sendiri.

### M1. Landing `/`

- **Page**: `src/app/(marketing)/page.tsx`.
- **Komponen**: `HeroSection`, `Header`, `LogosSection`, `FeatureSection` (kartu Setup/UserBasedSecurity/Reports/Dashboard/Presence + SVG kustom), `Integrations`, `Pricing`, `SectionHeader`, `TestimonialsSection`, `CTAWithVerticalMarquee`, `Faqs01`, `KioskSimulation`, `SiteFooter`, `CallToAction`.
- **Data**: `getPublicPlans`, `getPublicAddOns` (`src/server/catalog.ts`) → harga/plan dari DB (tanpa hardcode).
- **DB**: `plans, add_ons`.
- **Dampak**: tombol plan → `/subscribe?plan=<code>&addons=<codes>`.

### M2. Berlangganan `/subscribe`

- **Page**: `src/app/(marketing)/subscribe/page.tsx` + `SubscribeForm`.
- **Data**: `getPublicPlans`, `getPublicAddOns`.
- **Action**: `submitSubscribeAction` (`src/server/subscribe-action.ts`) — rate limit 3/10 menit/IP; validasi nama, `+62` phone, email, source (allowlist `ACQUISITION_SOURCES`), booths 0–1000, lokasi; menghasilkan link WhatsApp.
- **DB**: `plans, add_ons, platform_settings` (nomor konsultasi).
- **Dampak**: lead konsultasi via WhatsApp (tidak menulis DB).

### M3. Kontak `/kontak`

- **Page**: `src/app/(marketing)/kontak/page.tsx` + `ContactForm`.
- **Action**: `contact-action.ts` — rate limit 3/10 menit/IP; validasi nama/email/pesan; link WhatsApp.
- **DB**: `platform_settings` (nomor konsultasi via `getConsultWhatsApp`).

### M4. Dokumentasi `/docs` + `/docs/[group]`

- **Page**: `src/app/(marketing)/docs/page.tsx`, `docs/[group]/page.tsx`.
- **Data**: `HELP_ARTICLES` (~1.453 baris di `src/server/help.ts`), `DOC_GROUPS`, `getDocBySlug`, `getGroupBySlug`, `getPrevNextGroup`, `articleHref`.
- **Grup**: Mulai · Customer · Owner · Pembayaran · Perangkat · Bantuan.
- **API**: `GET /api/v1/help?category=&q=` (publik).
- **Komponen**: `CategoryBrowser`, `DocArticleBlock`.
- **Dampak**: sumber artikel juga dipakai panel bantuan dashboard (search).

### M5. Halaman Legal

- `/ketentuan-layanan`, `/kebijakan-privasi`, `/kebijakan-refund`, `/tentang-kami` — `MarketingPage`/`MarketingCard`/`MarketingLinks`.

---

## 9. AUTENTIKASI & ONBOARDING

### A. Login `/login`

- **Page**: `src/app/(auth)/login/page.tsx` → `AuthPage` (`src/components/auth-block.tsx`, satu komponen client; tidak ada `AuthUI`/`AuthForm` terpisah).
- **Action**: `loginAction` (`src/server/auth-actions.ts`).
- **Mekanisme**: Auth.js v5 `signIn("credentials")`; rate limit + verifikasi di `authorize()` (`src/lib/auth.ts`) = single source of truth; Turnstile CAPTCHA; dua mode (email+password, email+PIN).
- **Redirect**: `destinationForUser` (`src/lib/destination.ts`): admin → `/admin`, tanpa membership → `/welcome`, staff-only → `/staff`, selain itu → `/dashboard`.
- **DB**: `users, auth_sessions, business_members, member_photoboxes` (auth tidak menyentuh `devices`).
- **API**: `GET/POST /api/auth/[...nextauth]`, `POST /api/auth/logout`.

### B. Register `/register` (Konsultasi)

- **Page**: `src/app/(auth)/register/page.tsx` — **pendaftaran mandiri ditutup**; menampilkan nomor WhatsApp konsultasi.
- **Data**: `getConsultWhatsApp` (`src/server/consult.ts`).
- **DB**: `platform_settings`.
- **Catatan**: tidak ada server action register (satu-satunya stub penolakan ada di API `POST /api/auth/register`, `REGISTRATION_CLOSED` 403); akun hanya dibuat admin via `/admin/users`. User yang sudah login di-redirect lewat resolver kanonis `destinationForUser`.

### C. Welcome `/welcome`

- **Page**: `src/app/welcome/page.tsx` — pemilih peran (owner buat bisnis / staff tunggu undangan).
- **Data**: `getUserMemberships`, `destinationFor`.
- **Action**: `logoutToLoginAction`.
- **DB**: `business_members`.
- **Dampak**: redirect bila destination bukan `/welcome` (sudah punya peran).

### D. Onboarding `/onboarding/create-business`

- **Page**: `src/app/onboarding/create-business/page.tsx` + `CreateBusinessForm`.
- **Action**: `createBusinessAction` (`src/server/business-actions.ts`).
- **Field**: nama bisnis, slug (opsional; auto dari nama). Field profil (owner_name, whatsapp, contact_email, address) dan timezone diisi belakangan dari `/dashboard/settings`, bukan di onboarding.
- **Server**: `createBusiness` (`src/server/business.ts`): insert lanjutan (membership owner, settings, trial) diperiksa; gagal di tengah → business di-rollback, bukan meninggalkan tenant yatim.
- **DB**: `businesses, business_members, business_settings, subscriptions, plans, platform_settings`.
- **Dampak**: membuat tenant + membership owner + subscription trial (`trial_days` dari platform_settings).

### E. Workspace Switching

- **Action**: `switchWorkspaceAction` (`src/server/business-actions.ts`) — set cookie `snapyos_active_business`, validasi membership.
- **API**: `GET /api/v1/me/businesses` (daftar kanonis); `POST /api/v1/businesses` (create, bukan GET).
- **DB**: `business_members, businesses`.

---

## 10. PEMBAYARAN & WEBHOOK

### 10.1 Kiosk (Customer → Owner Merchant)

- **Reservasi**: `checkout_sessions` (status open/paid/expired/cancelled; unique satu open per booth) → `payments` (`creating` → `pending` → `paid`) dengan partial unique index satu payment aktif per checkout.
- **Provider direct**: credential owner `payment_credentials` (pakasir/midtrans/tripay) — `src/server/payment/providers/*` (`registry`, `gateway-factory`, `midtrans`, `tripay`, `pakasir`, `encrypt`, `types`).
- **createPayment**: `src/server/payment/payment-create.ts` (voucher-only via RPC `create_voucher_payment_atomically`).
- **Settlement**: `transitionPaymentToPaid` → RPC `settle_paid_payment_atomically` (`src/server/payment/settlement.ts`) → `runPaidSideEffects` (transaksi + voucher usage + session).
- **Polling**: `getPaymentStatus` (`src/server/payment/qris.ts`) + `useQrisPolling` (3s).
- **Cash**: `confirmCashPayment`/`settleCashPayment` (operator) di `src/server/payment/qris.ts`, `src/server/cash-payment.ts` + `src/server/cash-payment-actions.ts`.
- **Recovery**: cron `payment-recovery` (`src/server/payment/settlement-recovery.ts`) — paid-but-unsettled (idempotent), expire checkout basi.

### 10.2 Webhook Provider

- **Route**: `/api/webhooks/payment/{pakasir,midtrans,tripay}` (`POST`).
- **Handler**: `handleMidtransWebhook` (SHA-512 signature), `handleTripayWebhook` (HMAC-SHA256 callback signature), `handlePakasirWebhook` (wajib server-to-server status check).
- **Server**: `src/server/payment/webhook-handler.ts`, `webhook-log.ts`, `src/lib/direct-webhook.ts`.
- **Aturan**: payload tidak dipercaya untuk tenant/credential/payment ID; lookup via provider reference tersimpan, validasi nominal/order (`final_amount` atau `total_amount`; Tripay mengirim `total_amount`), provider match, transition idempotent (state-aware `received`→`processed`, `payment_webhooks.event_id` unik).
- **DB**: `payment_webhooks, payments, checkout_sessions, payment_credentials, invoice_payments, transactions`.
- **Invoice cabang**: webhook Pakasir bercabang saat `order_id` invoice (subscription) → `handleInvoiceWebhookEvent` / `handleDirectInvoiceWebhook` (`src/server/payment/invoice.ts`).

### 10.3 Invoice Subscription (credential owner, fallback Pakasir aggregator)

- **Alur**: owner buat invoice → `createInvoiceQris` → `invoice_payments` (QRIS) → webhook paid → `applyInvoiceIntent` → plan/add-on/template aktif. Gateway diutamakan dari credential per-business (migrasi 0047); aggregator env dipakai bila tidak ada credential aktif.
- **Env**: `PAKASIR_API_KEY`, `PAKASIR_PROJECT_SLUG`, `PAKASIR_WEBHOOK_SECRET` (dana → SnapyOS; URL webhook dibangun dari `SnapyOS_PUBLIC_BASE_URL`).
- **Fallback**: gagal → `subscription_intent_failures` → admin `/admin/subscriptions/pending-review`.
- **Promo**: `previewSubscriptionPromo`/`consumeSubscriptionPromo`/`releaseSubscriptionPromo` (`src/server/subscription-promo.ts`).
- **DB**: `invoices, invoice_payments, subscription_promos, subscription_intent_failures`.

---

## 11. API ROUTES (63)

### Admin (23, `requireAdmin`)

`GET /api/v1/admin/overview` · `users` (GET/POST) · `users/[id]` (GET/PATCH/DELETE) · `businesses` (GET/POST) · `businesses/[id]` (GET/PATCH/DELETE) · `plans` (GET/POST) · `plans/[id]` (PATCH) · `add-ons` (GET/POST) · `add-ons/[id]` (PATCH) · `promos` (GET/POST) · `promos/[id]` (PATCH) · `subscriptions` (GET) · `subscriptions/[id]` (GET/PATCH) · `subscriptions/[id]/add-ons` (POST) · `subscription-add-ons/[id]` (PATCH/DELETE) · `template-categories` (GET/POST) · `template-categories/[id]` (DELETE) · `templates` (GET/POST) · `templates/[id]` (PATCH/DELETE) · `settings` (GET/PATCH) · `payments` (GET) · `payments/summary` (GET) · `payments/pos-revenue` (GET).

### Business / Me (8, auth)

`GET /api/v1/me/businesses` · `GET/POST /api/v1/businesses` · `GET /api/v1/business/[id]/customers/[id]` · `GET/POST /api/v1/business/[id]/devices` · `DELETE /api/v1/business/[id]/devices/[id]` · `POST /api/v1/business/[id]/photoboxes/[id]/activation` · `GET /api/v1/business/[id]/reports` · `GET /api/v1/business/[id]/storage` · `GET /api/v1/business/[id]/cash-payments`.

> Hitungan: 23 admin + 9 business/me (8 berkas `route.ts`; `businesses` melayani GET+POST) + 17 public + 3 webhook + 5 cron + 1 health + 3 auth + 1 emoji + 1 help = **63 berkas `route.ts`**.
> Dua yang masuk setelah audit 2026-10-11: `GET /api/v1/public/frame` (proxy frame R2/allowlist) dan `GET /api/cron/device-cleanup`.

### Public Kiosk (17)

`GET /api/v1/public/[businessSlug]?photobox=` (ETag/304) · `GET .../packages` · `GET .../templates?package=` · `POST .../checkout` · `POST .../checkout/apply-voucher` · `POST .../payments/create` · `POST .../payments/cash-confirm` · `GET .../payments/[paymentRef]/status` · `POST .../sessions` · `POST .../sessions/[id]/finalize` · `POST .../sessions/[id]/abort` · `POST /api/v1/public/devices/activate` · `verify` · `exit` · `report` · `GET /api/v1/public/frame` (proxy allowlist R2) · `GET /api/v1/public/results/[resultToken]`.

### Webhook (3), Cron (5), Misc (3)

`POST /api/webhooks/payment/{pakasir,midtrans,tripay}` · `GET /api/cron/{retention,subscription-lifecycle,subscription-expiry-reminder,payment-recovery,device-cleanup}` · `GET /api/health` · `GET/POST /api/auth/[...nextauth]` · `POST /api/auth/logout` · `POST /api/auth/register` (stub) · `GET /api/v1/emoji` (proxy emoji-api.com, rate limit 60/menit) · `GET /api/v1/help`.

---

### 11.1 Daftar Lengkap 63 Route (ekshaustif)

| Route                                                        | Method                                               |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| `/api/auth/[...nextauth]`                                    | GET, POST (NextAuth)                                 |
| `/api/auth/logout`                                           | POST                                                 |
| `/api/auth/register`                                         | POST (stub — pendaftaran mandiri ditutup)            |
| `/api/health`                                                | GET (readiness DB + storage; 503 saat gagal)         |
| `/api/v1/help`                                               | GET                                                  |
| `/api/v1/emoji`                                              | GET                                                  |
| `/api/v1/me/businesses`                                      | GET                                                  |
| `/api/v1/businesses`                                         | POST                                                 |
| `/api/v1/admin/overview`                                     | GET                                                  |
| `/api/v1/admin/users`                                        | GET, POST                                            |
| `/api/v1/admin/users/[id]`                                   | GET, PATCH, DELETE                                   |
| `/api/v1/admin/businesses`                                   | GET                                                  |
| `/api/v1/admin/businesses/[id]`                              | GET, PATCH, DELETE                                   |
| `/api/v1/admin/plans`                                        | GET, POST                                            |
| `/api/v1/admin/plans/[id]`                                   | PATCH                                                |
| `/api/v1/admin/add-ons`                                      | GET, POST                                            |
| `/api/v1/admin/add-ons/[id]`                                 | PATCH                                                |
| `/api/v1/admin/promos`                                       | GET, POST                                            |
| `/api/v1/admin/promos/[id]`                                  | PATCH                                                |
| `/api/v1/admin/subscriptions`                                | GET                                                  |
| `/api/v1/admin/subscriptions/[id]`                           | GET, PATCH                                           |
| `/api/v1/admin/subscriptions/[id]/add-ons`                   | POST                                                 |
| `/api/v1/admin/subscription-add-ons/[id]`                    | PATCH, DELETE                                        |
| `/api/v1/admin/template-categories`                          | GET, POST                                            |
| `/api/v1/admin/template-categories/[id]`                     | DELETE                                               |
| `/api/v1/admin/templates`                                    | GET, POST                                            |
| `/api/v1/admin/templates/[id]`                               | PATCH                                                |
| `/api/v1/admin/settings`                                     | GET, PATCH                                           |
| `/api/v1/admin/payments`                                     | GET                                                  |
| `/api/v1/admin/payments/summary`                             | GET                                                  |
| `/api/v1/admin/payments/pos-revenue`                         | GET                                                  |
| `/api/v1/business/[businessId]/devices`                      | GET                                                  |
| `/api/v1/business/[businessId]/devices/[id]`                 | DELETE                                               |
| `/api/v1/business/[businessId]/photoboxes/[id]/activation`   | GET                                                  |
| `/api/v1/business/[businessId]/customers/[id]`               | GET                                                  |
| `/api/v1/business/[businessId]/reports`                      | GET                                                  |
| `/api/v1/business/[businessId]/storage`                      | GET                                                  |
| `/api/v1/business/[businessId]/cash-payments`                | GET                                                  |
| `/api/v1/public/[businessSlug]`                              | GET                                                  |
| `/api/v1/public/[businessSlug]/packages`                     | GET                                                  |
| `/api/v1/public/[businessSlug]/templates`                    | GET                                                  |
| `/api/v1/public/[businessSlug]/checkout`                     | POST                                                 |
| `/api/v1/public/[businessSlug]/checkout/apply-voucher`       | POST                                                 |
| `/api/v1/public/[businessSlug]/payments/create`              | POST                                                 |
| `/api/v1/public/[businessSlug]/payments/cash-confirm`        | POST                                                 |
| `/api/v1/public/[businessSlug]/payments/[paymentRef]/status` | GET                                                  |
| `/api/v1/public/[businessSlug]/sessions`                     | POST                                                 |
| `/api/v1/public/[businessSlug]/sessions/[id]/finalize`       | POST                                                 |
| `/api/v1/public/[businessSlug]/sessions/[id]/abort`          | POST                                                 |
| `/api/v1/public/devices/activate`                            | POST                                                 |
| `/api/v1/public/devices/verify`                              | POST                                                 |
| `/api/v1/public/devices/exit`                                | POST                                                 |
| `/api/v1/public/devices/report`                              | POST                                                 |
| `/api/v1/public/frame`                                       | GET (proxy allowlist R2; path-style + custom domain) |
| `/api/v1/public/results/[resultToken]`                       | GET                                                  |
| `/api/webhooks/payment/pakasir`                              | POST                                                 |
| `/api/webhooks/payment/midtrans`                             | POST                                                 |
| `/api/webhooks/payment/tripay`                               | POST                                                 |
| `/api/cron/retention`                                        | GET                                                  |
| `/api/cron/subscription-lifecycle`                           | GET                                                  |
| `/api/cron/subscription-expiry-reminder`                     | GET                                                  |
| `/api/cron/payment-recovery`                                 | GET                                                  |
| `/api/cron/device-cleanup`                                   | GET                                                  |

**Total: 63 route.**

## 12. CRON & LIFECYCLE (vercel.json)

| Cron                                     | Jadwal       | Tugas                                                                                                                                                      |
| ---------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/cron/retention`                    | `0 20 * * *` | auto-expire sesi aktif lewat `expires_at` (+grace offline), hapus media sesi completed/expired melewati `retention_days` (storage sub), `media_cleaned_at` |
| `/api/cron/subscription-lifecycle`       | `0 0 * * *`  | trial habis → expired; active + cancel_at_period_end → cancelled; active lewat period → past_due; past_due lewat grace → expired                           |
| `/api/cron/subscription-expiry-reminder` | `0 6 * * *`  | email pengingat ke owner (subscription habis <3 hari) via Resend                                                                                           |
| `/api/cron/payment-recovery`             | `0 21 * * *` | paid-but-unsettled → jalankan ulang side effects (idempotent, jendela 7 hari); expire checkout basi                                                        |
| `/api/cron/device-cleanup`               | `0 3 * * *`  | hapus device basi/tak aktif (heartbeat lewat batas) + `device_logs` lama; fail-closed tanpa `CRON_SECRET`                                                  |

- **Auth cron**: `CRON_SECRET` (`src/lib/cron-auth.ts`) — tolak placeholder `change-me`; `*_CRON_OPEN` hanya di luar production (fail-closed).
- **DB**: `sessions, photos, storage_usage, storage_objects, subscriptions, invoices, payments, checkout_sessions, lifecycle_emails`.
- **Email**: `src/server/lifecycle-email.ts` (`sendWelcomeEmail`, `sendSubscriptionStartedEmail`, `sendExpiryReminderEmail`), `src/lib/resend.ts`.

---

## 13. DATABASE (55 tabel + 31 fungsi)

**Identity & Tenant**: `users`, `auth_sessions`, `businesses`, `business_members`, `business_settings`.
**Billing**: `plans`, `subscriptions`, `invoices`, `add_ons`, `subscription_add_ons`, `subscription_promos`, `subscription_intent_failures`, `lifecycle_emails`, `payment_credentials`.
**Operasional**: `outlets`, `photoboxes`, `member_photoboxes`, `devices`, `activation_codes`, `device_logs`, `packages`, `template_categories`, `templates`, `stickers`, `package_templates`, `package_outlets`, `package_photoboxes`, `business_template_purchases`.
**Sesi & Foto**: `sessions`, `photos`.
**Transaksi & Pembayaran**: `transactions`, `checkout_sessions`, `payments`, `invoice_payments`, `payment_webhooks`.
**POS**: `pos_products`, `pos_orders`, `pos_order_items`.
**Orang & Data Bisnis**: `customers`, `bookings`, `expenses`.
**Voucher**: `vouchers`, `voucher_packages`, `voucher_outlets`, `voucher_usages`.
**Event**: `events`, `event_templates`.
**Platform**: `platform_settings`, `audit_logs`.
**Support & Marketing**: `support_tickets`, `support_ticket_replies`, `broadcast_campaigns`, `broadcast_recipients`.
**Storage**: `storage_objects`, `storage_usage`.

**Fungsi SQL/RPC (31)**:
`set_updated_at` (trigger) · `activate_device_atomically` · `pos_complete_payment` · `pos_decrement_stock` · `pos_decrement_stock_batch` · `pos_create_order_with_items` · `pos_set_booth_enabled` · `settle_paid_payment_atomically` · `create_voucher_payment_atomically` · `exit_pin_register_failure` · `dashboard_tx_summary` · `dashboard_daily_revenue` · `finance_expense_summary` · `revenue_breakdown` · `tx_insights_summary` · `metrics_tx_status` · `metrics_returning_customers` · `metrics_revenue_per_booth` · `metrics_sessions_per_booth` · `metrics_session_summary` · `metrics_popular_package` · `metrics_popular_template` · `staff_directory_today` · `customer_spending` · `operational_metrics` · `tg_subscription_intent_failures_touch` · `storage_account_add` · `storage_account_sub` · `bootstrap_admin` (promosi eksplisit satu user ke role admin, migration 0052; service_role-only) · **`create_outlet_with_quota` · `create_photobox_with_quota` · `add_business_member_with_quota`** (kuota atomik 0069 — advisory lock per `(business, jenis)`, `SECURITY DEFINER`, `PLAN_LIMIT_REACHED` bila lewat limit).

**Konvensi**: uang integer IDR; RLS + policy `svc_all` service_role di semua tabel publik (0064); semua RPC `revoke` anon/authenticated + `grant` service_role (0065); `search_path` dipin `public, pg_temp` pada seluruh RPC aplikasi (0071 — **ditulis & diuji statis, BELUM di-apply**); migration POS 0073 menambah snapshot setting struk, RPC order/item atomic, dan RPC toggle booth atomic; 0074 menutup race retry pembayaran terhadap decrement stok.

**Tabel tanpa UI aktif** (dormant/backlog): `bookings` (+anti-overlap gist), `events`, `event_templates`, `stickers`, `device_logs`, `storage_objects` (dipakai akuntansi).

---

## 14. STORAGE (Dual Provider)

- **Write**: R2 (`getWriteStorage()`), override `STORAGE_WRITE_PROVIDER` → `STORAGE_PROVIDER` → `r2`.
- **Read/Delete**: `resolveStorage(bucket, key)` — write-provider dulu, lalu fallback (Supabase↔R2) via `head()` + cache per-proses.
- **Area**: `business-assets` (branding, template, global/templates), `generated-photos` (sessions photo/GIF, retensi 3 hari).
- **Guard**: `r2Key()` tolak `..`/backslash; bucket PRIVATE → signed URL satu-satunya jalur baca.
- **Kuota**: `storage_usage` + RPC `storage_account_add/sub`; `assertStorageAvailable` memblokir finalize saat penuh; limit dari plan `storage_limit_mb` + add-on `storage_mb`.
- **Konsumen**: `src/server/branding.ts`, `templates.ts`, `admin/templates.ts`, `kiosk-sessions.ts`, `storage-usage.ts`, `template-cleanup.ts`, cron retention.

---

## 15. RINGKASAN AUDIT

### 15.1 Cakupan yang sudah dipetakan

- **Admin**: 15 fitur + lintas-admin (overview, users, businesses, plans, add-ons, promos, subscriptions, pending-review, payments, gateways, templates+categories+builder, support, settings, audit, broadcasts) — 23 route API + 26 server action.
- **Owner**: 25 modul (dashboard, analytics, metrics, finance, transactions, outlets, photoboxes+camera, packages, templates+builder, vouchers, staff, customers, reports, settings, branding, payment, POS, PWA, subscription, invoice+receipt, support, topbar/workspace, cash notifier).
- **Staff**: 8 modul (overview, booth, outlet, package, template, login PIN, cash confirm, POS kasir).
- **Kiosk**: 16 modul (activation → setup → welcome → guide → package → checkout → template → capture → editor → printing → result, offline queue, lock/PIN, config sync).
- **POS**: 5 modul (gate, terminal, struk, reports, entitlement).
- **Result online**: 1 halaman + 1 API.
- **Marketing**: 9 halaman + form subscribe/kontak + docs.
- **Auth/Onboarding**: 5 alur (login, register-konsultasi, welcome, create-business, workspace switch).
- **Pembayaran/Webhook**: 3 provider + invoice aggregator + recovery.
- **Cron**: 5 job.
- **API**: 63 route.
- **DB**: 55 tabel, 31 fungsi.

### 15.2 Temuan (kode = kenyataan)

| #   | Temuan                                                                           | Bukti                                                                    | Dampak                                                                                                                |
| --- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| T1  | Pendaftaran mandiri ditutup; akun hanya via admin                                | `src/app/api/auth/register/route.ts` (`REGISTRATION_CLOSED` 403)         | `/register` = halaman konsultasi WhatsApp; tidak ada action register                                                  |
| T2  | `user.role='admin'` **dan** allowlist `ADMIN_EMAILS` dua-duanya sah              | `src/server/admin/guard.ts:11-24`                                        | Admin email env bisa naik tanpa ubah DB                                                                               |
| T3  | MRR dihitung dari snapshot `plans.price_monthly` (bukan histori invoice)         | `src/server/admin/overview.ts:71` (`ponytail:`)                          | MRR bergeser bila admin ubah harga plan                                                                               |
| T4  | `photoboxes.pos_enabled` dibatasi unique index satu booth POS aktif per business | `db/schema.sql:237`                                                      | Owner tidak bisa aktifkan POS di >1 booth sekaligus                                                                   |
| T5  | `transactions.payment_method` mencakup `manual` & `offline` = non-withdrawable   | `db/schema.sql:647`                                                      | Uang manual/offline hanya reporting (`withdrawable=false`, 0033); alur saldo/penarikan sendiri sudah **dihapus 0044** |
| T6  | Payment webhook state-aware `received`→`processed`                               | migrasi 0066                                                             | Replay window berbasis `event_id` unik                                                                                |
| T7  | Kuota sesi konkuren efektif = plan + add-on `unit='session'`                     | `src/server/plan-limits.ts:58`                                           | Add-on menambah `max_concurrent_sessions`                                                                             |
| T8  | Kiosk finalize punya grace offline (`OFFLINE_FINALIZE_GRACE_MS`)                 | `src/server/kiosk-sessions.ts:402`                                       | Foto ter-capture sebelum expiry tetap diproses                                                                        |
| T9  | Kredensial payment dienkripsi (`server_key`, `private_key`)                      | `src/server/payment/providers/encrypt.ts`                                | Wajib `PAYMENT_ENCRYPTION_KEY`                                                                                        |
| T10 | Rate limit fixed-window per proses                                               | `src/lib/rate-limit.ts`                                                  | Counter di memori; batas `>` bukan `>=`                                                                               |
| T11 | Storage dual-provider (R2 write / resolve read)                                  | `src/server/storage/index.ts`                                            | Key identik antar provider → resolusi via `head()`                                                                    |
| T12 | `bookings`/`events`/`event_templates`/`stickers` ada di schema tanpa UI          | `db/schema.sql`                                                          | Backlog (booking, event mode, sticker)                                                                                |
| T13 | God-components terdaftar known-issue                                             | `KioskBrandingEditor` 1.642, `TemplateBuilder` 996, `KioskApp` 813 baris | Refactor kandidat                                                                                                     |
| T14 | `docs/flow-maps/` hanya memuat 01–03; 04–15 belum ada                            | `docs/flow-maps/00-INDEX.md`                                             | Referensi flow kiosk/POS/payment berbasis dokumen ini                                                                 |

### 15.2b Temuan yang SUDAH diperbaiki (verifikasi kode 2026-10-16)

| #   | Temuan lama                                                                                                                                                                                                     | Status       | Bukti                                                                                                                                                                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T15 | React #441 (input uncontrolled `defaultValue` berubah di POS)                                                                                                                                                   | **FIXED**    | `src/components/dashboard/PosProductFields.tsx` — state terkontrol `useState`; diverifikasi E2E 5 skenario (`newErrs=0`)                                                                                                                                                                                                  |
| T16 | `listTransactions` bisa melempar saat `searchParams` non-objek                                                                                                                                                  | **FIXED**    | `src/server/transactions.ts` — `safeParse` + fallback default; 3 tes regresi di `tests/phase5.test.ts`                                                                                                                                                                                                                    |
| T17 | `getTransaction` dead export; `TransactionListInput` dead type                                                                                                                                                  | **FIXED**    | dihapus (0 caller repo-wide)                                                                                                                                                                                                                                                                                              |
| T18 | `collapsible` pada Accordion (no-op Base UI)                                                                                                                                                                    | **FIXED**    | `src/components/ui/accordion.tsx` — prop dibuang; `faq.tsx` diselaraskan                                                                                                                                                                                                                                                  |
| T19 | ESLint repo-wide 3114 error dari `.claude/worktrees/**`                                                                                                                                                         | **FIXED**    | `eslint.config.mjs` — ignore `**/worktrees/**`; CI hijau                                                                                                                                                                                                                                                                  |
| T20 | Dua konvensi nama rollback → `sort` menjalankan rollback sebelum forward (0019/0025/0026/0027/0028/0041/0056/0064)                                                                                              | **FIXED**    | diseragamkan ke `NNNN_nama_rollback.sql`; dijaga `tests/migration-integrity.test.ts`                                                                                                                                                                                                                                      |
| T21 | Tanpa tes untuk isolasi tenant / revocation sesi / idempotensi webhook                                                                                                                                          | **FIXED**    | `tests/tenant-isolation.test.ts`, `session-revocation.test.ts`, `webhook-log.test.ts`                                                                                                                                                                                                                                     |
| T22 | 23 RPC aplikasi tanpa `search_path` terpin                                                                                                                                                                      | **PREPARED** | migrasi `0071` + rollback ditulis & diuji statis (`tests/rpc-search-path.test.ts`); **belum di-apply** ke Supabase                                                                                                                                                                                                        |
| T23 | `/api/health` statis — selalu 200 walau Supabase/R2 mati                                                                                                                                                        | **FIXED**    | `src/app/api/health/route.ts` + `src/lib/health.ts` — readiness DB + storage, timeout 4s, **503** saat gagal, `checks` aditif; `tests/health.test.ts`                                                                                                                                                                     |
| T24 | Komentar cron `subscription-lifecycle` bilang "setiap jam", jadwal aktual `0 0 * * *` harian                                                                                                                    | **FIXED**    | komentar `src/app/api/cron/subscription-lifecycle/route.ts` diselaraskan dengan `vercel.json`                                                                                                                                                                                                                             |
| T25 | `docs/flow-maps/00-INDEX.md` mencantumkan `04`–`15` seolah ada, `13` masih mengklaim alur withdrawal                                                                                                            | **FIXED**    | baris `04`–`15` ditandai backlog eksplisit, `13` ditandai obsolete (`0044`)                                                                                                                                                                                                                                               |
| T26 | Aset brand lama (SVG ikon "P" kuning + `avatar-snappy/4.svg` raster 1,1 MB) tidak mencerminkan logo produk                                                                                                      | **FIXED**    | diganti logo baru: `snapyos-icon-{192,512}.png`, `snapyos-icon-maskable-512.png`, `apple-touch-icon.png`, `snapyos-mark.png` (topbar), `src/app/favicon.ico` multi-ukuran 16–256; `snapyos-icon.svg`, `snapyos-icon-maskable.svg`, `avatar-snappy/4.svg` dihapus; 9 call-site dialihkan ke `/snapyos-mark.png`            |
| T27 | **Service worker cache-first atas URL `public/` yang stabil** → mengganti aset apa pun (logo, ilustrasi) tidak pernah terlihat di klien terpasang; kiosk PWA menyajikan berkas lama **selamanya**               | **FIXED**    | `public/sw.js` → stale-while-revalidate (sajikan cache, revalidasi di latar), cache `snapyos-kiosk-v4`; direproduksi di browser (entri cache `6fbf1645…` → `120dc20f…` setelah satu muat, tanpa bersihkan cache manual); dijaga `tests/service-worker-assets.test.ts`                                                     |
| T28 | Aset `public/` membengkak: `dashboard-preview.png` 1,8 MB @3024px (tampil ≤988px), `pakasir.png` 248 KB @1080px (tampil 20–24px), 5 ilustrasi marketing 5,46 MB (raster tertanam di dalam SVG, tampil 44–128px) | **FIXED**    | `dashboard-preview.png` → 562 KB palette @2048px (mean diff 0.32, 0,0012% px terdampak); `pakasir.png` → 7,8 KB @192px (flatten 24px: mean 0,65, 0 px >32); 5 SVG → 463 KB total (render 256px identik: mean ≤0,42, 0 px >32); `public/` 7,5 MB → 1,4 MB; dimensi intrinsik `hero.tsx`/`feature-section.tsx` disinkronkan |

### 15.3 Fitur tanpa UI (backlog kode)

- Booking & event mode (tabel ada, tanpa page/action).
- Refund state machine (hanya status `refunded` di enum).
- ZIP download hasil foto.
- Session settings owner-configurable UI penuh (sebagian via PhotoboxForm).
- Print test dari dashboard (ada CameraTest, tanpa print test terpisah).
- REST subscription & add-on publik.
- Topbar global search & notifikasi.

### 15.4 Batasan audit ini

- Graf diindeks mode `moderate` (semantic + AST), `parse_partial` pada `db/schema.sql` (ranges dilaporkan) → klaim tabel/kolom diverifikasi langsung dari sumber.
- `docs/flow-maps/04..15` tidak ada; pemetaan kiosk/POS/payment/DB di dokumen ini dari kode.
- ~~Tidak ada klaim dead-code ekshaustif; 60 berkas uji ada, suite tidak dijalankan dalam audit ini.~~
  **Diperbarui 2026-10-16:** suite **dijalankan** (`npm test` → 809 lulus, 0 gagal; 84 berkas uji)
  dan gate lain (lint/typecheck/build) diukur di `docs/18-audit-report.md`. Angka suite di sini
  mencakup tes keamanan baru (isolasi tenant, revocation sesi, idempotensi webhook, privilege RPC).
