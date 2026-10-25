# 3. Architecture

## 3.1 Tech Stack (Keputusan)

| Layer         | Teknologi                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend      | Next.js (App Router), React, TypeScript, Tailwind CSS                                                                                              |
| UI Components | shadcn/ui (dikustomisasi Neo-Brutalism), shadcn/ui Charts, Lucide Icons                                                                            |
| Backend       | Next.js Route Handlers + Server Actions (native, satu repo)                                                                                        |
| Data          | **Supabase** — PostgreSQL + Supabase Storage (Realtime TIDAK dipakai — lihat §3.6)                                                                 |
| Data client   | `@supabase/supabase-js` server-only (service-role)                                                                                                 |
| Auth          | **Auth.js v5 (NextAuth)** — credential email/password, **JWT + DB revocation** (`auth_sessions`, lihat §3.6)                                       |
| Camera        | MediaDevices API (`getUserMedia`), Canvas API — kamera internal perangkat (kiosk PWA)                                                              |
| Payment       | Direct merchant owner-first: Pakasir, Midtrans, atau Tripay melalui credential business. Pakasir platform hanya untuk invoice subscription SnapyOS |
| QR render     | `qrcode` / `qrcode.react`                                                                                                                          |
| Export        | CSV (bawaan), XLSX (`exceljs`/`xlsx`), PDF (future)                                                                                                |
| Deploy        | **Vercel**                                                                                                                                         |

## 3.2 System Context (diagram)

```
                    +-------------------------------------------------+
                    |                    SnapyOS (Next.js)               |
+----------+        |  +---------------+   +---------------------+    |
|  Owner   +------->|  | Owner Platform |   |  Admin Platform     |   |
| (browser)|        |  | (dashboard, dll)|  | (superadmin)        |    |
+----------+        |  +-------+-------+   +----------+----------+    |
                    |          |                      |               |
+----------+        |  +-------v--------+             |               |
| Customer +------->|  | Customer       |             |               |
| (kiosk/  |        |  | Photobox App   |             |               |
|  phone)  |        |  +-------+--------+             |               |
+----------+        |          |                      |               |
                    |  +-------v------------------------v----------+  |
                     |  |      Server: Auth, RBAC, Tenant scope,     |  |
                     |  |  PaymentService, Webhooks, Settlement,     |  |
                     |  |  Storage                                   |  |
                    |  +-------+----------------------+-------------+  |
                    +----------|----------------------|----------------+
                               |                      |
                      +---------v--------+   +---------v---------+
                        |  Supabase        |   | Merchant gateways |
                        |  (Postgres/      |   | Pakasir, Midtrans,|
                        |   Storage)       |   | Tripay            |
                        +------------------+   +-------------------+
```

## 3.3 Information Architecture

**Customer Photobox App** (public, tanpa login — **v2 pay-first**):
(Setup device sekali: permission kamera/printer, §5.0.1 doc 05) → Welcome → Package → Checkout → Voucher → QRIS → **PAID** (timer mulai) → Template/Frame → Camera → Capture → Review/Retake → Edit → Finalize → Auto-Print → QR Result → Online Result (unduh GIF + foto berframe)

**Owner Platform** (login, per business):

- Dashboard
- Photobox
- Outlets
- Templates
- Packages
- Vouchers
- Transactions
- Customers
- Bookings
- Finance
- Reports
- Staff
- Subscription
- Settings
- Bantuan (Help Center)

**Admin Platform** (role admin — 17 item nav, `src/components/admin/nav.ts`):

- Overview
- Users
- Businesses
- Plans
- Add-ons
- Promos
- Subscriptions
- Antrian Aktivasi Manual
- Payments
- Gateways
- Templates & Categories
- Katalog Aplikasi
- Tiket Bantuan
- Platform Settings
- Audit Log
- Broadcast Email
- Buka Dashboard Bisnis (keluar ke shell owner)

### 3.3.1 Route Separation (single domain)

Seluruh aplikasi berjalan di **satu domain** yang sama. Setiap area punya **prefix route berbeda** sehingga tidak ada tabrakan:

| Area                                   | Route prefix                       | Login                                      | Contoh                             |
| -------------------------------------- | ---------------------------------- | ------------------------------------------ | ---------------------------------- |
| Marketing / Landing                    | `/`                                | tidak                                      | `/`                                |
| Auth                                   | `/login`, `/register`              | —                                          | `/login`                           |
| Pemilih peran (tanpa membership)       | `/welcome`                         | ya                                         | `/welcome`                         |
| Onboarding buat bisnis                 | `/onboarding/create-business`      | ya                                         | `/onboarding/create-business`      |
| Owner Platform (dashboard photobox)    | `/dashboard/*`                     | ya (OWNER/MANAGER/STAFF)                   | `/dashboard`                       |
| Staff shell operasional (read-only)    | `/staff/*`                         | ya (STAFF)                                 | `/staff`                           |
| POS terminal (add-on)                  | `/pos/*`                           | ya (OWNER/MANAGER/STAFF + entitlement POS) | `/pos/terminal`                    |
| Admin Platform (CEO / pemilik SnapyOS) | `/admin/*`                         | ya (role `admin`)                          | `/admin`                           |
| Customer Photobox (kiosk)              | `/p/[businessSlug]/[photoboxSlug]` | tidak                                      | `/p/klik-foto/booth-01`            |
| Result online                          | `/r/[token]`                       | tidak                                      | `/r/abc123`                        |
| API & webhook                          | `/api/*`                           | bervariasi                                 | `/api/v1/...`, `/api/webhooks/...` |

Aturan:

- **Prefix `p/`, `r/`, `dashboard`, `admin`, `pos`, `staff`, `api` saling eksklusif** — tidak ada yang tumpang tindih. `dashboard`/`admin`/`api`/`pos`/`staff` tidak pernah dipakai sebagai `businessSlug`.
- `(marketing)`, `(auth)`, `(dashboard)`, `(admin)`, `(pos)` adalah **route group tanpa segment URL** (hanya layout); `p/[businessSlug]/`, `r/[token]/`, `api/` adalah **segment nyata** di URL.
- Owner Platform & Admin Platform **wajib login** + guard server-side (RBAC, lihat `09-security-storage.md`); `p/` & `r/` **tanpa login** (validasi `device_token` / `result_token`).
- Akses lintas area dicegah: `admin` hanya untuk `role=admin`; `dashboard` hanya untuk member business; `p/` & `r/` hanya valid bila token/slug terdaftar di DB (404 jika tidak).

## 3.4 User Flows

### Owner onboarding journey

Register → Pilih plan (trial) → Buat business → Onboarding → Buat outlet → Buat photobox → Konfigurasi branding → Buat package → Upload template → Buat voucher → Hubungkan payment → Launch → Customer mulai sesi → Transaksi → Payment → Revenue → Dashboard analytics.

### Customer journey

Open Photobox → Welcome → Pilih package → Checkout → Apply voucher → Pay QRIS → Verify (PAID, timer mulai) → Pilih template/frame → Countdown → Capture → Review → Retake/Continue → Edit → Finalize → Auto-print → QR result online (GIF + foto berframe). Timeout: pre-paid → reset Welcome; post-paid → auto-finalize (tetap print + result).

### Business flow

Setup: Business → Outlet → Photobox → Package → Template → Voucher.
Transaksi (v2 pay-first): Checkout → Voucher → Payment (paid) → Session → Finalize → Transaction.
Analytics: Transaction → Revenue → Expenses → Estimated Profit → Reports.

## 3.5 Multi-Tenancy Model

- Setiap **Business = tenant**.
- Semua entity bisnis memiliki kolom `business_id` (tenant scoping), kecuali entity global (`users`, `plans`, `template_categories` global, `platform_settings`).
- Isolasi dijamin di **lapisan server** (setiap query di-scope `business_id` + cek membership user pada business).
- **Jangan** mengandalkan hanya proteksi route frontend. Otorisasi di backend/server-side wajib.
- Helper `getScopedClient(userId)` menghasilkan client yang selalu menyaring `business_id` milik user (satu atau banyak business).

### Hubungan kepemilikan kunci (untuk payment & report)

```
Business
  ├─ Outlet
  │    └─ Photobox
  │         └─ Session
  │              └─ Transaction
  │                   └─ Payment
  └─ PaymentCredential
```

`Transaction` adalah **source of truth** untuk financial reporting. `Payment` adalah detail settlement dari provider. Direct merchant settlement masuk ke rekening merchant owner. Tidak ada withdrawal kiosk aktif.

## 3.6 Data Access Pattern (Supabase + Auth.js)

- Auth.js v5 menerbitkan **JWT + DB revocation**: session token = JWT cookie; tabel `auth_sessions` menyimpan baris sesi yang dicek pada setiap refresh (fail-closed) dan dihapus saat signOut — bukan database session penuh.
- Server-side menggunakan **service-role key** hanya di `server` (tidak pernah diekspos ke client). Karena service-role bypass RLS, **tenant scoping wajib di-enforce di kode** via helper query builder.
- **RLS sebagai jaring PostgREST (C1, migrasi 0064):** SELURUH tabel `public.*` RLS ON + policy `svc_all` hanya untuk `service_role`; `anon`/`authenticated` di-revoke (anon key tidak dipakai client). Aplikasi tetap scoped di kode (service_role bypass), RLS menutup akses langsung PostgREST bila key bocor. RPC aplikasi juga di-lock `service_role`-only (H1, migrasi 0065) — lihat `09-security-storage.md` §9.9b.
- Status payment di UI checkout kiosk di-update via **polling 3 detik** (`useQrisPolling` — `src/hooks/use-qris-polling.ts`) + self-heal `src/server/payment/settlement-recovery.ts`; Supabase Realtime **tidak dipakai**.
- Supabase **Storage** untuk logo, template, sticker, asset event, dan hasil foto (dengan retention — lihat `09-security-storage.md`).
- **Proxy ≠ RBAC:** `src/proxy.ts` (Next 16 rename dari `middleware`) hanya meng-enforce maintenance mode global (`platform_settings.maintenance_mode`, dibaca fresh per request via `getMaintenanceState()`; DB error fail-closed 503); TIDAK menggantikan RBAC route/action. Guard auth/kepemilikan tetap via layout server component + `getMembership()`/`can()`/`requireAdmin()` per action/route — lihat `09-security-storage.md` §9.1 & `10-admin-platform.md` §10.4.

> Catatan: Jika di masa depan migrasi ke Supabase Auth penuh untuk memanfaatkan RLS native, sesi bisa dipetakan via `supabase_jwt` claims. MVP tetap Auth.js v5.

## 3.7 Struktur Kode Aktual

Status: active. Last updated: 2026-10-08. Last verified: 2026-10-08. Source of truth: repository `src/`.

```
src/
  app/
    (marketing)/            # route group → landing di "/"
      page.tsx              # "/"
    (auth)/
      login/page.tsx        # "/login"
      register/page.tsx     # "/register"
    (dashboard)/            # owner platform (protected, tenant-scoped)
      dashboard/            # "/dashboard/*"
    (admin)/                # admin platform (role admin)
      admin/                # "/admin/*"
    p/[businessSlug]/[photoboxSlug]/   # "/p/..." customer photobox public app
    r/[token]/              # "/r/..." result online page
    api/
      auth/[...nextauth]/
      webhooks/payment/pakasir/
      v1/                   # REST API (owner/admin)
  components/
    ui/                     # shadcn/ui (neo-brutalism)
    photobox/               # camera, countdown, editor, sticker, checkout
    dashboard/              # metric cards, charts, data tables
    landing/
  lib/
    auth.ts                 # Auth.js config
    supabase/server.ts      # service-role client (server-only)
    tenant.ts               # scoping helpers + RBAC
    rbac.ts
    payment/                # PaymentService abstraction + PakasirProvider
    qr.ts
    storage.ts
  server/                   # server actions & business logic
  db/
    schema.sql              # migrasi (source: 07-database-schema.md)
```

## 3.8 Frontend Implementation Contract (wajib saat implementasi)

Dokumen PRD menetapkan **flow & design system**, tapi detail berikut **belum didefinisikan** dan wajib ditetapkan saat Phase 0–1 (bukan "ditentukan nanti"):

### 3.8.1 State Management (keputusan aktual)

- **Server state (data dari API): Server Components + Server Actions.** TanStack Query / SWR **tidak dipakai** di codebase. Dashboard = server component panggil langsung `src/server/*`; mutasi via server actions (`*-actions.ts`); REST `/api/v1` hanya untuk kiosk/device/mirror.
- **Client state** (UI lokal, mis. cart POS, form): `useState`/form actions — tanpa Zustand/Jotai.
- **Status payment kiosk:** polling 3s (`useQrisPolling`), bukan realtime (lihat §3.6).
- **Continuous values** (camera preview, countdown, pointer): `useMotionValue`/`useTransform` atau ref, **bukan** `useState` (hindari re-render tiap frame).

### 3.8.2 Component Contract (belum didefinisikan)

Setiap halaman/section di `04`/`05`/`10`/`11.5–11.8` wajib dijabarkan menjadi **component tree + props + state** sebelum coding, minimal:

- Nama komponen, lokasi file, apakah Server/Client Component.
- Props (tipe), state internal, data yang di-fetch (endpoint mana).
- Loading/empty/error state per komponen (sesuai `docs/13` §13.3.6).

### 3.8.3 i18n (belum diputuskan)

- Seluruh copy UI saat ini **bahasa Indonesia** (hardcoded di PRD). Belum ada requirement lokalisasi multi-bahasa.
- Keputusan: MVP **Indonesia-only** (hardcode string, tanpa framework i18n). Tambah `next-intl`/`i18next` **hanya jika** kebutuhan multi-bahasa muncul (mis. target pasar non-ID). Jangan pasang framework i18n "untuk nanti".
