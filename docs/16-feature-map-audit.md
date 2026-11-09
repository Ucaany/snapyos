# SnapyOS — Peta Fitur Menyeluruh (Audit Kode 2026-10-11, angka disegarkan 2026-10-21)

> **Status**: audit berbasis kode berjalan (`src/`, `db/schema.sql`, `tests/`) + knowledge graph
> `codebase-memory` (proyek `Users-ucaany-Downloads-PT-SNAPY-OS`, mode `moderate`, generasi 2026-10-11).
> **Metode**: Scout→Verify. Graf (4.167 node / 14.341 edge, snapshot 2026-10-11), 56 tabel `create table`, 32 fungsi SQL,
> 66 route API, 66 page, 8 layout, 17 modul `"use server"` (102 aksi ter-export), 189 komponen, 119 berkas uji (`tests/*.test.ts`).
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
| 3   | [Dashboard Owner](#3-dashboard-owner-bisnis) — O1–O26                                                                                    |
| 4   | [Dashboard Staff](#4-dashboard-staff-shell-operasional-read-only) — S1–S8                                                                |
| 5   | [Kiosk Customer](#5-kiosk-customer-photobox-publik) — K1–K16                                                                             |
| 6   | [Hasil Online](#6-hasil-online-result-page)                                                                                              |
| 7   | [POS Terminal](#7-pos-terminal-add-on) — P1–P5                                                                                           |
| 8   | [Marketing & Publik](#8-marketing--publik) — M1–M5                                                                                       |
| 9   | [Autentikasi & Onboarding](#9-autentikasi--onboarding) — A–E                                                                             |
| 10  | [Pembayaran & Webhook](#10-pembayaran--webhook)                                                                                          |
| 11  | [API Routes](#11-api-routes-66) — daftar ekshaustif 66 route                                                                             |
| 12  | [Cron & Lifecycle](#12-cron--lifecycle-verceljson)                                                                                       |
| 13  | [Database](#13-database-56-tabel--32-fungsi)                                                                                             |
| 14  | [Storage](#14-storage-dual-provider)                                                                                                     |
| 15  | [Ringkasan Audit](#15-ringkasan-audit) — temuan, backlog, batasan                                                                        |

---

## 0. Ringkasan Angka (Audit 2026-10-11, angka disegarkan 2026-10-25)

| Dimensi                     | Jumlah                   | Catatan                                                                                         |
| --------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| Halaman (`page.tsx`)        | 66                       | 5 route group + kiosk/result/onboarding/welcome                                                 |
| Layout (`layout.tsx`)       | 8                        | root, auth, dashboard, admin, staff, pos, onboarding, result                                    |
| Route API (`route.ts`)      | 66                       | 24 admin, 8 business, 18 public, 3 webhook, 5 cron, health, auth×3, me, emoji, help, businesses |
| Modul server action         | 17                       | `"use server"` · 102 aksi ter-export                                                            |
| Modul server (`src/server`) | 111                      | data layer                                                                                      |
| Modul lib (`src/lib`)       | 99                       | pure/util (81 di akar + `r2/` 6 + `supabase/` 2 + subfolder lain)                               |
| Komponen (`src/components`) | 189 `.tsx` (+17 `.ts`)   | 67 dashboard, 29 kiosk, 3 pos, 7 admin, 5 staff, 33 ui, 8 efferd                                |
| Tabel DB                    | 56                       | `db/schema.sql`                                                                                 |
| Fungsi SQL/RPC              | 32                       | 30 dipakai app (4 SECURITY DEFINER) + 2 trigger                                                 |
| Berkas uji                  | 119                      | `node --test`                                                                                   |
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
- **Template cache kiosk (2026-11-08):** `GET /templates` 120/menit/IP, `GET /frame` 180/menit/IP (warm mengunduh ±40–80 aset sekali boot). Cache penulis = klien (`localStorage` snapshot/index + Cache Storage `snapyos-template-assets-v1`); SW hanya membaca.

### 1.7 Desain (Neo-Brutalism — satu-satunya bahasa visual)

- `src/styles/tokens.css` + `src/app/globals.css` §`@layer base`.
- Primitif UI: `src/components/ui/*` (card, button, input, select, table, dialog, badge, chart, empty-state, page-header, date-input, multi-select, confirm-dialog, …).
- Eyebrow mono uppercase (tanpa prefix `///`), `font-display` uppercase, border 2px ink, hard shadow, radius 0.
- Shell: `src/components/layout/CollapsibleShell.tsx`, `dashboard/Sidebar.tsx`, `dashboard/Topbar.tsx`, `admin/AdminSidebar.tsx`, `staff/StaffSidebar.tsx`.
- **Aset brand** (diganti 2026-10-16): `public/snapyos-icon-192.png`, `public/snapyos-icon-512.png`, `public/snapyos-icon-maskable-512.png`, `public/apple-touch-icon.png`, `public/snapyos-mark.png` (mark topbar/header/footer/auth), `src/app/favicon.ico` (multi-ukuran 16–256). Dirujuk `src/app/layout.tsx` (`icons`) + `src/app/manifest.ts`. Mark lama `public/avatar-snappy/4.svg` (raster 1,1 MB) dihapus; ilustrasi marketing `public/avatars/*` dan `public/fiture-avatar/*` dipertahankan.

---

## 2. DASHBOARD ADMIN (Platform / CEO)

**Route group**: `(admin)` → `/admin/*` · **Layout**: `src/app/(admin)/layout.tsx` (guard `getAdminUser()` → redirect `/dashboard` atau `/login`).
**Shell**: `AdminTopbar` + `AdminSidebar` (7 grup, 17 item) + `CollapsibleShell`.
**Navigasi** (`src/components/admin/nav.ts`): Utama (1) · Tenant (2) · Monetisasi (5) · Keuangan (2) · Konten & Sistem (5, termasuk Katalog Aplikasi) · Pemasaran (1) · Sisi Owner (1) = 17 item.

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
- **Actions**: `createCategoryAction`, `deleteCategoryAction`, `createGlobalTemplateAction`, `updateGlobalTemplateAction`, `toggleTemplateAction`, `saveGlobalTemplateLayoutAction`.
- **Data**: `listTemplateCategories`, `createTemplateCategory`, `deleteTemplateCategory`, `listGlobalTemplates`, `createGlobalTemplate`, `updateGlobalTemplate`, `setGlobalTemplateActive`, `getGlobalTemplate`, `updateGlobalTemplateLayout`, `deleteGlobalTemplate`, `listTemplatePurchases`.
- **API**: `GET/POST /api/v1/admin/templates`, `PATCH/DELETE /api/v1/admin/templates/[id]`, `GET/POST /api/v1/admin/template-categories`, `DELETE /api/v1/admin/template-categories/[id]`.
- **Field**: kategori (nama, harga), template (nama, `category_id`, file frame / `file_url`, thumbnail, price, `is_premium`, is_active).
- **Builder**: `TemplateBuilderCanvas` (`src/components/dashboard/TemplateBuilderCanvas.tsx`) dengan `saveAction=saveGlobalTemplateLayoutAction` — slot drag/resize/rotate + input numerik di atas frame PNG (`layout` jsonb, divalidasi `layoutSchema`). Tidak ada thumbnail otomatis dari preview; thumbnail dari frame WebP upload. Tidak ada server-side compose.
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

---

## 16. Design Builder per Booth (2026-11-08)

- **Route**: `/dashboard/branding` (nav `Design Builder`, ikon `Palette`) — dipulihkan sebagai builder; `/dashboard/devices` tetap pairing/diagnostik.
- **Page**: `src/app/(dashboard)/dashboard/branding/page.tsx` memuat `listPhotoboxes` + `getBranding`, signed URL batch untuk global + seluruh override, lalu merender `DesignBuilder`.
- **Client**: `src/components/dashboard/DesignBuilder.tsx` — selector booth, toggle `Booth ini`/`Global`, tabs Merek/Sambutan/Tampilan/Per Layar, status inherit, simpan/reset, upload logo/video. `DesignBuilderPreview.tsx` merender `WelcomeScreen`/`KioskScreenRenderer` asli.
- **Server**: `src/server/design-builder-actions.ts` (`saveBrandingAction`, `uploadBrandAssetAction`, `resetBoothBrandingAction`); `src/server/branding.ts` (`uploadPhotoboxLogo`, `uploadPhotoboxKioskVideo`, `signBrandingAssets`); `src/server/photoboxes.ts` (`updatePhotoboxBranding` mode `merge`/`replace`).
- **Merge**: `src/lib/branding-merge.ts` (`mergeBranding`, `brandingHasOverride`, `resolveBoothOverride`) dipakai `buildPublicConfig` + builder + kontras efektif.
- **UI primitives**: `src/components/ui/neo/{tabs,slider,alert}.tsx` (adaptasi neobrutalism.dev ke token SnapyOS; tanpa dependency baru).
- **Tes**: `tests/design-builder.test.ts` (merge/pages/replace/contrast + regresi logo `business_settings` dan purge blob booth).
