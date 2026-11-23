# 01 — Admin/CEO Platform Flow

**Role**: `users.role = 'admin'` (atau email di `ADMIN_EMAILS`)

**Route Group**: `(admin)` → `/admin/*`

**Purpose**: Mengelola platform SnapyOS secara global — users, businesses, plans, add-ons, promos, subscriptions, payments, withdrawals, templates, settings.

---

## 1. Overview Dashboard

**Page**: `/admin` → `src/app/(admin)/admin/page.tsx`

**Server Actions**: `src/server/admin/overview.ts`

**Data**:

- Total businesses (active/suspended)
- Active subscribers (trial/active/past_due)
- Total subscriptions
- Monthly recurring revenue (MRR)
- Total outlets
- Total photoboxes
- Total sessions
- Total transactions

**API**: `GET /api/v1/admin/overview`

**Metrics Cards**: SSR via server component → panggil langsung `getAdminOverview()`.

**Components**: `Card` brutalist, `MetricCard`, simple table top businesses.

---

## 2. Users Management

**Page**: `/admin/users` → `src/app/(admin)/admin/users/page.tsx`

**Server Actions**: `src/server/admin-actions.ts`

- `createUserAction` — buat user baru (email, password, name, role)
- `updateUserAction` — ubah name, role, status (active/suspended)
- `deleteUserAction` — hapus user (CASCADE ke businesses owned)

**API**:

- `GET /api/v1/admin/users?page=&limit=&search=&role=&status=`
- `GET /api/v1/admin/users/:id`
- `PATCH /api/v1/admin/users/:id`
- `DELETE /api/v1/admin/users/:id`

**Features**:

- List users + pagination (20/page)
- Search by email/name
- Filter by role (`user`/`admin`), status (`active`/`suspended`)
- Suspend/reactivate user → suspended user diblokir login
- Change role user ↔ admin
- Create user manual (pendaftaran publik ditutup)
- Delete user + CASCADE businesses

**Security**:

- Guard `requireAdmin()` di server action + API
- Audit log setiap perubahan user
- Suspended user dapat `ACCOUNT_SUSPENDED` error saat login

**Components**: `BrutalistSelect` (role/status filter), `DataTable`, `StatusBadge`, form brutalist.

---

## 3. Businesses Management

**Page**: `/admin/businesses` → `src/app/(admin)/admin/businesses/page.tsx`

**Server Actions**: `src/server/admin-actions.ts`

- `updateBusinessAction` — ubah status (active/suspended)

**API**:

- `GET /api/v1/admin/businesses?page=&limit=&search=&status=`
- `GET /api/v1/admin/businesses/:id` → detail + subscription + usage
- `PATCH /api/v1/admin/businesses/:id`

**Features**:

- List businesses + pagination
- Search by name/slug
- Filter by status
- Suspend/reactivate business → suspended business tidak bisa buat sesi/checkout baru (dicek server-side)
- View detail: owner, subscription, plan, add-ons, usage (outlets/photoboxes/sessions)
- **Usage guard**: `getBusinessUsage()` sekarang `requireAdmin()` (K5 audit 2026-09-16)

**Security**:

- Suspended business → `POST /checkout`, `POST /sessions` throw `BUSINESS_SUSPENDED`
- Middleware memeriksa `businesses.status='active'` untuk tenant scope
- Audit log setiap suspend/reactivate

---

## 4. Plans Management

**Page**: `/admin/plans` → `src/app/(admin)/admin/plans/page.tsx`

**Server Actions**: `src/server/admin-actions.ts`

- `createPlanAction` — buat plan baru (`price` per siklus, `billing_cycle` harian/mingguan/bulanan/tahunan, limits, features, platform_fee, is_active)
- `updatePlanAction` — ubah price, limits, features, active/inactive

**API**:

- `GET /api/v1/admin/plans`
- `POST /api/v1/admin/plans`
- `PATCH /api/v1/admin/plans/:id`

**Features**:

- List plans (starter/growth/business/custom)
- Create plan: nama, harga bulanan/tahunan (integer IDR), limits (`max_outlets`, `max_photoboxes`, `max_concurrent_sessions`, `max_storage_mb`, `max_staff`), features jsonb, platform_fee_percent/flat, is_active
- Update price/limits/features kapan saja (perubahan TIDAK retroaktif ke subscription existing — hanya subscription baru)
- Active/inactive toggle
- **Bug fix K1** (audit 2026-09-16): Form create plan sekarang menerima `features` + `is_active` (sebelumnya plan baru "kosong fitur")

**Limits di-enforce**:

- `max_outlets` — `createOutlet` throw `OUTLET_LIMIT_REACHED`
- `max_photoboxes` — `createPhotobox` throw `PHOTOBOX_LIMIT_REACHED`
- `max_concurrent_sessions` — `POST /checkout` + `POST /sessions` throw `SESSION_LIMIT_REACHED`
- `max_staff` — `inviteStaff` throw `STAFF_LIMIT_REACHED`
- `max_storage_mb` — cek usage vs limit saat upload

**Platform Fee**:

- `platform_fee_percent` + `platform_fee_flat` (default 0)
- Fee dihitung saat `creditBalance` (`src/server/payment/checkout.ts:575-659`)
- Fee = `(final_amount * percent / 100) + flat`, dibulatkan floor, capped by amount
- Credit owner = final_amount − fee
- Fee masuk `transactions` kolom `platform_fee_amount`

---

## 5. Add-ons Management

**Page**: `/admin/add-ons` → `src/app/(admin)/admin/add-ons/page.tsx`

**Server Actions**: `src/server/admin-actions.ts`

- `createAddOnAction`
- `updateAddOnAction`

**API**:

- `GET /api/v1/admin/add-ons` (implicit di admin server)
- `POST /api/v1/admin/add-ons`
- `PATCH /api/v1/admin/add-ons/:id`

**Features**:

- List add-ons (`extra_session`, `pos`)
- Create add-on: code (unique), name, description, harga per siklus (`price_monthly` wajib; `price_daily`/`price_weekly`/`price_yearly` opsional, null = tidak dijual), unit (`session`/`feature`), is_active
- Update price/name/description/active kapan saja (tanpa deploy)
- Active/inactive toggle

**Add-on Types**:

- **Quantity-based** (`unit='session'`): `extra_session` (quantity × harga siklus plan)
- **Feature-based** (`unit='feature'`): `pos` (enable/disable; quantity diabaikan, harga flat per siklus plan)

**Entitlement**:

- Quantity: `effectiveSessions = plan.max_concurrent_sessions + sum(addon.quantity where code='extra_session')`
- Feature: `hasPosEntitlement()` check `subscription_add_ons.status='active' join add_ons (code='pos', is_active=true)`

**Owner Flow**:

- Owner pilih add-on + quantity di `/dashboard/subscription`
- `createSubscriptionInvoice` generate invoice QRIS
- Owner bayar → webhook paid → `applyInvoiceIntent` upsert `subscription_add_ons` (atomic + idempotent)
- Owner cancel add-on → `cancelAddOn` set `cancel_at_period_end=true` (deferred) atau immediate (audit reason)

**Admin Flow**:

- `POST /api/v1/admin/subscriptions/:id/add-ons` — attach add-on ke subscription (reaktivasi jika status='cancelled')
- `DELETE /api/v1/admin/subscription-add-ons/:id?mode=deferred|immediate` — cancel add-on (default deferred)

**Seed**: `add_ons` row `code='pos'`, `unit='feature'`, `price_monthly` default (admin ubah via UI).

---

## 6. Promos Management

**Page**: `/admin/promos` → `src/app/(admin)/admin/promos/page.tsx`

**Server Actions**: `src/server/admin-actions.ts`

- `createPromoAction`
- `updatePromoAction`

**API**:

- `GET /api/v1/admin/promos`
- `POST /api/v1/admin/promos`
- `PATCH /api/v1/admin/promos/:id`

**Features**:

- List subscription promos (`subscription_promos`)
- Create promo: code (unique uppercase), discount_type (`percentage`/`fixed`), discount_value (int), applicable_to (`all_plans`/`specific_plans`), plan_ids (array uuid), max_uses (nullable), valid_from/valid_until (nullable), is_active
- Update promo kapan saja
- Active/inactive toggle

**Promo Flow**:

- Owner input promo code di `/dashboard/subscription` (preview invoice)
- `previewSubscriptionPromo` validasi + hitung discount
- Promo tercatat di `invoices.promo_code` + `discount_amount`

**Validation**:

- Code uppercase, unique
- Date validity
- Max uses global
- Plan eligibility
- Active status

---

## 7. Subscriptions Management

**Page**: `/admin/subscriptions` → `src/app/(admin)/admin/subscriptions/page.tsx`

**Sub-page**: `/admin/subscriptions/pending-review` (intent failures)

**Server Actions**: `src/server/admin-actions.ts`

- `updateSubscriptionAction` — ubah status, extend period
- `attachAddOnAction` — attach add-on ke subscription (reaktivasi jika cancelled)
- `cancelAddOnAction` — cancel add-on (deferred/immediate)
- `activateIntentFailureAction` — manual aktivasi intent gagal
- `refundIntentFailureAction` — refund payment + void intent
- `dismissIntentFailureAction` — dismiss tanpa aksi

**API**:

- `GET /api/v1/admin/subscriptions?page=&status=&business=`
- `PATCH /api/v1/admin/subscriptions/:id`
- `POST /api/v1/admin/subscriptions/:id/add-ons` — attach
- `DELETE /api/v1/admin/subscription-add-ons/:id?mode=deferred|immediate` — cancel

**Features**:

- List subscriptions + pagination
- Filter by status (`trial`/`active`/`past_due`/`cancelled`/`expired`)
- View detail: business, plan, period, add-ons, invoices
- Update status manual (darurat)
- Extend period (perpanjang `current_period_end`)
- Attach add-on → upsert `subscription_add_ons` (reset `status='active'` + `cancel_at_period_end=false` jika row cancelled)
- Cancel add-on:
  - **Deferred** (default): `cancel_at_period_end=true` (cron transition at period end) — parity owner `cancelAddOn`
  - **Immediate** (darurat): `status='cancelled'` seketika + fitur off + audit reason wajib (`manual_cancel_reason`)
- Intent failures (`invoices.intent.applied=false` karena conflict/limit) — manual resolve via `/admin/subscriptions/pending-review`

**UI**:

- Cancel dropdown: `Akhir periode` / `Segera (audit)`
- Attach dropdown: label `REAKTIVASI` jika row cancelled
- Status badge brutalist

**Logic**: `src/lib/admin-addon-ops.ts`.

---

## 8. Templates Management

**Page**: `/admin/templates` → `src/app/(admin)/admin/templates/page.tsx`

**Server Actions**: `src/server/admin-actions.ts`

- `createGlobalTemplateAction` — upload template global (`business_id=NULL`)
- `toggleTemplateAction` — active/inactive
- `createCategoryAction` — buat kategori baru
- `deleteCategoryAction` — hapus kategori (CASCADE ke templates)

**API**:

- `GET /api/v1/admin/templates`
- `POST /api/v1/admin/templates`
- `PATCH /api/v1/admin/templates/:id`
- `GET /api/v1/admin/template-categories`
- `POST /api/v1/admin/template-categories`
- `DELETE /api/v1/admin/template-categories/:id`

**Features**:

- List templates global (`business_id=NULL`) + owner templates
- Upload template global: frame PNG + thumbnail + video (opsional) + FK `category_id`
- Toggle active/inactive
- CRUD kategori (`template_categories`) — owner + FK migration 0039
- **Bug fix K4** (audit 2026-09-16): Form upload template global baru + `createGlobalTemplateAction`

**Migration 0039**:

- `templates.category_id` FK ke `template_categories`
- Drop CHECK enum; kolom `category` text kept as display fallback (deprecated)

**Owner Templates**: owner upload via `/dashboard/templates` (scoped `business_id`).

---

## 9. Payments Monitoring

**Page**: `/admin/payments` → `src/app/(admin)/admin/payments/page.tsx`

**Server Actions**: `src/server/admin/payments.ts`

**API**:

- `GET /api/v1/admin/payments?page=&status=&provider=&from=&to=`
- `GET /api/v1/admin/payments/summary`
- `GET /api/v1/admin/payments/pos-revenue` — revenue POS per tenant

**Features**:

- List payments semua tenant + pagination
- Filter by status (`pending`/`paid`/`expired`/`failed`/`cancelled`/`refunded`)
- Filter by provider (`midtrans`/`tripay`/`voucher`/`offline`)
- Filter by date range
- Summary metrics:
  - Total payment volume
  - Successful payments
  - Failed/expired/pending
  - Refunds
  - Provider breakdown
  - Gross payment volume
  - Platform fee
  - Net amount (gross − fee)
- **POS revenue** per tenant (`GET /api/v1/admin/payments/pos-revenue`) — agregasi `transactions where pos_order_id IS NOT NULL`

**Bug fix K3** (audit 2026-09-16): Provider filter → `<select>` enum (bukan free-text input).

**Security**:

- Admin guard
- `rejectWithdrawal` tidak bocorkan `db_code`/`db_message` ke client (K7 audit 2026-09-16)

---

## 10. Withdrawals Management

**Page**: `/admin/withdrawals` → `src/app/(admin)/admin/withdrawals/page.tsx`

**Server Actions**: `src/server/admin-actions.ts`

- `processWithdrawalAction` — tandai processing → paid (input reference)
- `rejectWithdrawalAction` — reject + kembalikan saldo

**API**:

- `GET /api/v1/admin/withdrawals?page=&status=&business=`
- `POST /api/v1/admin/withdrawals/:id/process`
- `POST /api/v1/admin/withdrawals/:id/reject`

**Features**:

- List withdrawals semua tenant + pagination
- Filter by status (`pending`/`processing`/`paid`/`rejected`/`failed`)
- Filter by business
- **Process**: admin tandai `processing` → lakukan transfer bank → input `payment_reference` → `paid`
- **Reject**: kembalikan saldo ke `available` + input `admin_notes`
- Audit log setiap aksi

**Ledger Simetris** (K8 audit 2026-09-16):

- **Process**: `processWithdrawal` menulis `balance_ledger` entry (`type=debit source=withdrawal source_id=withdrawal.id`)
- **Reject**: `rejectWithdrawal` menulis `balance_ledger` entry (`type=credit source=adjustment`) + refund `available`
- Sebelum K8: process tidak menulis ledger entry (inconsistency)

**Validation**:

- Nama rekening == nama profil business owner
- Min amount (platform settings)
- Jadwal hari withdrawal (platform settings `withdrawal_days` array 0–6)
- Available balance cukup

**Security**:

- CAS mutation balance (optimistic 3 retry)
- Audit log
- Admin guard

---

## 11. Platform Settings

**Page**: `/admin/settings` → `src/app/(admin)/admin/settings/page.tsx`

**Server Actions**: `src/server/admin-actions.ts`

- `updateSettingsAction`

**API**:

- `GET /api/v1/admin/settings` (implicit)
- `PATCH /api/v1/admin/settings`

**Settings (`platform_settings` jsonb)**:

```json
{
  "platform_fee_percent": 0,
  "platform_fee_flat": 0,
  "default_retention_days": 3,
  "trial_days": 14,
  "maintenance_mode": false,
  "min_withdrawal_amount": 10000,
  "withdrawal_days": [0, 1, 2, 3, 4, 5, 6],
  "withdrawal_sla_hours": 24
}
```

**Features**:

- Update platform settings global
- **Maintenance mode enforcement** (audit 2026-09-16):
  - Proxy `src/proxy.ts` (Next 16, Node runtime) membaca flag fresh per request (`src/lib/maintenance.ts`); DB error → fail-closed 503
  - Saat `true`: non-admin diblokir
    - Browser → rewrite ke `/maintenance` (503)
    - API `/api/*` → JSON `MAINTENANCE_MODE` (503, `Retry-After: 60`)
  - Allowlist selalu lolos: `/admin/*`, `/login`, `/api/health`, `/api/auth/*`, `/api/webhooks/*` (settlement in-flight jangan diblokir)
- **Bug fix K2** (audit 2026-09-16): `withdrawal_days` multi-day (7 checkbox Min–Sab), bukan single input

**Security**:

- Admin guard
- Audit log setiap perubahan settings
- Maintenance mode dibaca fresh per request (tanpa cache lintas-request; DB error fail-closed 503)

---

## 12. Audit Logs

**Implicit**: Semua admin actions tercatat di `audit_logs`:

- User CRUD
- Business suspend/reactivate
- Plan/add-on/promo CRUD
- Subscription status change
- Withdrawal process/reject
- Platform settings change
- Template global upload

**Schema**: `audit_logs` (`user_id`, `business_id` nullable, `action`, `entity_type`, `entity_id`, `details` jsonb, `ip_address`, `created_at`)

---

## 13. Security & RBAC

**Guard**: `requireAdmin()` / `requireAdminPage()`

- Check `users.role='admin'` OR `email` di `ADMIN_EMAILS` env
- Throw `FORBIDDEN` jika bukan admin
- Redirect ke `/login` jika tidak autentikasi

**Audit**: Setiap admin action tercatat ke `audit_logs`.

**Suspended User**: diblokir login via `src/server/auth-actions.ts:loginAction`.

**Suspended Business**: dicek server-side di `POST /checkout`, `POST /sessions`, etc. → throw `BUSINESS_SUSPENDED`.

**Admin Permissions**: `["*"]` (semua akses).

---

## 14. Components

**Shared Brutalist**:

- `BrutalistSelect` (role/status/provider filter)
- `BrutalistCheckbox` (multi-day withdrawal)
- `StatusBadge` (status subscriptions/payments/withdrawals)
- `DataTable` hand-rolled
- `Card` brutalist (thick border 4px, hard shadow 4px)
- Form inputs brutalist (border 2px, radius 0, focus accent)

**Layout**: `(admin)/layout.tsx` → sidebar admin + topbar + guard `requireAdminPage()`.

---

## 15. Navigation

**Sidebar** (`src/components/admin/nav.ts`, dirender `AdminSidebar.tsx`) — 7 grup, 17 item:

- **Utama**: Overview
- **Tenant**: Users, Businesses
- **Monetisasi**: Plans, Add-ons, Promos, Subscriptions (+ badge pending-review jika ada intent failures), Antrian Aktivasi Manual
- **Keuangan**: Payments, Gateways
- **Konten & Sistem**: Templates & Categories, Katalog Aplikasi, Tiket Bantuan, Platform Settings, Audit Log
- **Pemasaran**: Broadcast Email
- **Sisi Owner**: Buka Dashboard Bisnis

**Topbar**: user avatar + dropdown logout.

**Active state**: `src/lib/nav-active.ts` shared helper.

---

## 16. API Routes Summary

| Endpoint                                  | Method | Purpose                        |
| ----------------------------------------- | ------ | ------------------------------ |
| `/api/v1/admin/overview`                  | GET    | Platform metrics               |
| `/api/v1/admin/users`                     | GET    | List users                     |
| `/api/v1/admin/users/:id`                 | GET    | User detail                    |
| `/api/v1/admin/users/:id`                 | PATCH  | Update user                    |
| `/api/v1/admin/users/:id`                 | DELETE | Delete user                    |
| `/api/v1/admin/businesses`                | GET    | List businesses                |
| `/api/v1/admin/businesses/:id`            | GET    | Business detail + usage        |
| `/api/v1/admin/businesses/:id`            | PATCH  | Update business                |
| `/api/v1/admin/plans`                     | GET    | List plans                     |
| `/api/v1/admin/plans`                     | POST   | Create plan                    |
| `/api/v1/admin/plans/:id`                 | PATCH  | Update plan                    |
| `/api/v1/admin/add-ons`                   | POST   | Create add-on                  |
| `/api/v1/admin/add-ons/:id`               | PATCH  | Update add-on                  |
| `/api/v1/admin/promos`                    | POST   | Create promo                   |
| `/api/v1/admin/promos/:id`                | PATCH  | Update promo                   |
| `/api/v1/admin/subscriptions`             | GET    | List subscriptions             |
| `/api/v1/admin/subscriptions/:id`         | PATCH  | Update subscription            |
| `/api/v1/admin/subscriptions/:id/add-ons` | POST   | Attach add-on                  |
| `/api/v1/admin/subscription-add-ons/:id`  | DELETE | Cancel add-on (deferred/immed) |
| `/api/v1/admin/templates`                 | POST   | Upload template global         |
| `/api/v1/admin/templates/:id`             | PATCH  | Toggle template active         |
| `/api/v1/admin/template-categories`       | POST   | Create category                |
| `/api/v1/admin/template-categories/:id`   | DELETE | Delete category                |
| `/api/v1/admin/payments`                  | GET    | List payments + summary        |
| `/api/v1/admin/payments/summary`          | GET    | Payment summary metrics        |
| `/api/v1/admin/payments/pos-revenue`      | GET    | POS revenue per tenant         |
| `/api/v1/admin/withdrawals`               | GET    | List withdrawals               |
| `/api/v1/admin/withdrawals/:id/process`   | POST   | Process withdrawal             |
| `/api/v1/admin/withdrawals/:id/reject`    | POST   | Reject withdrawal              |
| `/api/v1/admin/settings`                  | PATCH  | Update platform settings       |

Total: **28 admin API endpoints**.

---

## 17. Migration Impact

**Admin features tidak memerlukan migration baru** (semua tabel sudah ada):

- `users`, `businesses`, `plans`, `add_ons`, `subscription_promos`, `subscriptions`, `subscription_add_ons`, `templates`, `template_categories`, `payments`, `withdrawals`, `platform_settings`, `audit_logs`.

**Migration historis terkait admin**:

- `0008`: per-business invoice numbering
- `0014`: `subscription_promos`
- `0016`: balance kebijakan (QRIS only)
- `0038`: drop tabel `reports` (0 query)
- `0039`: `templates.category_id` FK
- `0042`: drop kolom nol-konsumen (`subscriptions.provider`+`provider_subscription_id`, `invoices.due_at`, `payment_credentials.webhook_url`, tabel `payment_providers`)

---

## 18. Testing

**Cakupan kode** terkait admin:

- `src/lib/admin-addon-ops.ts` — attach/cancel add-on logic
- `src/lib/rbac.ts` — admin permission `["*"]`
- Cron transisi subscription lifecycle
- Audit transaksi manual

**E2E** (backlog): admin flow end-to-end.

---

## Ringkasan Flow Admin

```
LOGIN (admin) → /admin
  ↓
OVERVIEW (MRR, subscribers, metrics)
  ↓
USERS (CRUD, suspend, role change)
  ↓
BUSINESSES (suspend, reactivate, view usage)
  ↓
PLANS (CRUD price/limits/features/fee)
  ↓
ADD-ONS (CRUD price/unit)
  ↓
PROMOS (CRUD discount subscription)
  ↓
SUBSCRIPTIONS (status, extend, attach/cancel add-on, intent failures)
  ↓
TEMPLATES (upload global, categories, toggle active)
  ↓
PAYMENTS (monitor, filter, summary, POS revenue)
  ↓
WITHDRAWALS (process, reject, ledger simetris)
  ↓
SETTINGS (platform global, maintenance mode)
  ↓
AUDIT LOGS (semua admin actions tercatat)
```

---

**Next**: `02-OWNER-DASHBOARD-FLOW.md` — alur lengkap Owner dashboard & fitur bisnis.
