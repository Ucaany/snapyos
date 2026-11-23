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
| Payment       | Direct merchant owner-first: Tripay atau Midtrans melalui credential business. Tripay platform (env `TRIPAY_*`) untuk invoice subscription SnapyOS |
| QR render     | `qrcode` / `qrcode.react`                                                                                                                          |
| Export        | CSV (bawaan), XLSX (`exceljs`/`xlsx`), PDF (future)                                                                                                |
| Deploy        | **Vercel**                                                                                                                                         |

### 3.1.1 Penyimpanan Cache Kiosk (PWA, 2026-11-08)

| Penyimpanan                                    | Isi                                                                        | Penulis                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `localStorage` `snapyos.templates.<slug>`      | snapshot JSON daftar template (`schema: 1`, `fetchedAt`, `templates[]`)    | klien (`src/components/kiosk/template-cache.ts`)                                     |
| `localStorage` `snapyos.template-index.<slug>` | index aset `{ key, bytes, lastUsed }` — sumber kebenaran daftar key + LRU  | klien                                                                                |
| Cache Storage `snapyos-template-assets-v1`     | biner thumbnail `templateId:version@480` + frame `templateId:version@full` | klien; **SW hanya membaca** (`cache-first` untuk proxy frame dengan `?cache=` valid) |

Rate limit publik: `GET /api/v1/public/:slug/templates` 120/menit/IP, `GET /api/v1/public/frame` 180/menit/IP. Detail perilaku: `docs/05` §5.4.

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
                        |   Storage)       |   | Tripay, Midtrans  |
                        |   Storage)       |   | Tripay            |
                        +------------------+   +-------------------+
```

## 3.3 Information Architecture

**Customer Photobox App** (public, tanpa login — **v2 pay-first**):
(Setup device sekali: permission kamera/printer, §5.0.1 doc 05) → Welcome → Package → Checkout → Voucher → QRIS → **PAID** (timer mulai) → Template/Frame → Camera → Capture → Review/Retake → Edit → Finalize → Auto-Print → QR Result → Online Result (unduh GIF + foto berframe)

**Owner Platform** (login, per business — 20 item nav tetap + 2 kondisional, `src/components/dashboard/nav.ts`):

- **Utama**: Dashboard, Analitik, Metrik
- **Keuangan**: Transaksi, Keuangan, Payment Gateway, Laporan
- **Pelanggan & Tim**: Pelanggan, Tim
- **Langganan & Akun**: Langganan, Pengaturan, Tiket Bantuan, Dokumentasi

`*` = kondisional entitlement/fitur (`pos`, `pwa_kiosk`).

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
- Owner Platform & Admin Platform **wajib login** + guard server-side (RBAC, lihat §3.6); `p/` & `r/` **tanpa login** (validasi `device_token` / `result_token`).
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
- **RLS sebagai jaring PostgREST (C1, migrasi 0064):** SELURUH tabel `public.*` RLS ON + policy `svc_all` hanya untuk `service_role`; `anon`/`authenticated` di-revoke (anon key tidak dipakai client). Aplikasi tetap scoped di kode (service_role bypass), RLS menutup akses langsung PostgREST bila key bocor. RPC aplikasi juga di-lock `service_role`-only (H1, migrasi 0065).
- Status payment di UI checkout kiosk di-update via **polling 3 detik** (`useQrisPolling` — `src/hooks/use-qris-polling.ts`) + self-heal `src/server/payment/settlement-recovery.ts`; Supabase Realtime **tidak dipakai**.
- Supabase **Storage** untuk logo, template, sticker, asset event, dan hasil foto (dengan retention — lihat §3.9).
- **Proxy ≠ RBAC:** `src/proxy.ts` (Next 16 rename dari `middleware`) hanya meng-enforce maintenance mode global (`platform_settings.maintenance_mode`, dibaca fresh per request via `getMaintenanceState()`; DB error fail-closed 503); TIDAK menggantikan RBAC route/action. Guard auth/kepemilikan tetap via layout server component + `getMembership()`/`can()`/`requireAdmin()` per action/route — lihat `10-admin-platform.md` §10.4.

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
      webhooks/payment/tripay/
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
    payment/                # PaymentService abstraction + TripayProvider
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

## 3.9 Storage Lifecycle (R2 + Supabase, retention, orphan sweep, reconcile)

> Catatan: dokumen security-storage terpisah tidak ada di repo. Bagian ini adalah
> padanan storage yang berlaku; sumber kebenaran tetap kode (`src/server/storage/`,
> `src/lib/r2/`, `src/app/api/cron/`). RBAC/tenant ada di §3.6.

### 3.9.1 Dua bucket, dua umur

| Area (R2)          | Env bucket                   | Isi                                          | Umur                      |
| ------------------ | ---------------------------- | -------------------------------------------- | ------------------------- |
| `business-assets`  | `R2_BUCKET_BUSINESS_ASSETS`  | logo/branding, template, sticker, aset event | jangka panjang            |
| `generated-photos` | `R2_BUCKET_GENERATED_PHOTOS` | `sessions/<id>/photo-NN.jpg`, `result.gif`   | dibatasi `retention_days` |

`R2_BUCKET` (legacy single-bucket) tetap dibaca sebagai fallback nama bucket per area.
Kredensial `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` hanya di server
(`src/lib/r2/config.ts` meng-`import "server-only"`), endpoint diturunkan dari account id
kecuali `R2_ENDPOINT` diisi. `r2Key()` menolak segmen `..` dan backslash (guard
path-traversal), dan pemanggil tetap wajib allowlist id yang masuk key.

### 3.9.2 Dual provider (tulis vs baca)

- **Tulis** = `getWriteStorage()` (R2 default), **baca/hapus** = `resolveStorage(bucket, key)`
  yang mencoba provider pemilik key lalu fallback. Objek era Supabase tidak boleh stranded.
- `activeStorageProviders()` = write + fallback (dedup) — dipakai kuota dan sweep supaya
  byte R2 tidak hilang saat provider tulis di-set ke Supabase.
- `signedUrlMap()` mengelompokkan key per provider lalu satu panggilan batch per provider;
  `downloadBy` memaksa presign per-key karena nama unduhan berbeda.
- Akuntansi kuota atomik lewat RPC `storage_account_add` / `storage_account_sub`
  (`src/server/storage-usage.ts`), bukan hitung ulang per request.

### 3.9.3 Retention media hasil foto — `GET /api/cron/retention`

Jadwal `0 20 * * *`, `maxDuration = 60`, auth `Bearer CRON_SECRET` **fail-closed**
(secret kosong di production = tolak; dev opt-in `RETENTION_CRON_OPEN=1`).

- Rentang `retention_days` 1–3 hari (`RETENTION_MIN_DAYS`/`MAX_DAYS`), default 3; satu sumber
  untuk jalur tenant (`businessSettingsUpdateSchema`) dan admin (`adminSettingsUpdateSchema`).
- Yang dihapus hanya **media** (photos + `result_gif_key`). Baris `sessions`,
  `transactions`, dan `payments` DIPERTAHANKAN — sumber kebenaran finansial tidak boleh ikut hilang.
- `retentionCutoff()` = `now − retention_days`; kandidat = sesi finalized sebelum cutoff
  yang `media_cleaned_at` masih null.
- Batch per business + marker `media_cleaned_at` agar backlog tersalirkan dan kegagalan
  storage di-retry run berikutnya. `media_cleaned_at` HANYA di-set bila semua object sesi
  berhasil dihapus atau sudah absen (satu failure = sesi ditahan).
- Cron yang sama juga **auto-expire** sesi aktif stagnan lewat `expires_at + grace` offline
  (`OFFLINE_FINALIZE_GRACE_MS`): tanpa itu partial unique index "1 sesi aktif per photobox"
  mengunci booth selamanya.
- `accountSub` gagal → sesi **ditahan** (media + `media_cleaned_at` tetap) supaya akuntansi
  diulang; `missing:true` (migrasi akuntansi belum ada) → fail-open, media tetap dibersihkan
  agar backlog tidak menumpuk.

### 3.9.4 Orphan sweep — `GET /api/cron/orphan-sweep`

Jadwal `40 2 * * *`, `maxDuration = 60`. Menghapus objek `generated-photos` yang **tidak
direferensikan** `photos.file_key` / `sessions.result_gif_key` (mis. finalize gagal setelah
upload) dan tetap menagih storage selamanya.

| Batas                  | Nilai                                                      |
| ---------------------- | ---------------------------------------------------------- |
| Umur minimum objek     | 24 jam (`MIN_AGE_MS`) — upload berjalan tidak ikut tersapu |
| Objek dipindai per run | 2000 (`MAX_SCAN_PER_RUN`), paginated per business          |
| Objek dihapus per run  | 500 (`MAX_DELETE_PER_RUN`) — backlog tersalirkan harian    |
| Dry run                | `?dry_run=1` atau `ORPHAN_SWEEP_DRY_RUN=1`                 |

- Fail-closed: error query referensi berarti kita **tidak tahu** apa yang direferensikan →
  run berhenti, bukan menghapus buta.
- Akuntansi: `used_bytes` hanya dikurangi untuk key yang dilaporkan **berhasil** (atau sudah
  absen) — HTTP 200 DeleteObjects bukan bukti sukses (`splitRemoveOutcome`).
- Scan rekursif dari folder level-1 (business id) lintas `activeStorageProviders()`.

### 3.9.5 Reconcile kuota — `GET /api/cron/reconcile-storage`

Jadwal `23 2 * * *`, `maxDuration = 120`. **Mengoreksi drift**, bukan sekadar seed awal:
ledger `storage_objects` vs listing bucket dibandingkan `planStorageReconcile()`
(`src/lib/storage-reconcile.ts`, murni sehingga bisa diuji):

| Delta                                            | Aksi                                     |
| ------------------------------------------------ | ---------------------------------------- |
| Ada di bucket, tidak di ledger (atau bytes beda) | `add` / `resize` → `storage_account_add` |
| Ada di ledger, tidak di bucket                   | `remove` → `storage_account_sub`         |

- Rencana hanya berisi delta; ledger == listing → rencana kosong, cron aman diulang.
- Byte tidak valid (`NaN`/negatif) dinormalkan 0, sama seperti RPC.
- Bucket yang listing-nya **gagal** di-skip dari koreksi `remove` (jangan menghapus akuntansi
  berdasarkan listing parsial).

### 3.9.6 Cron terkait

`vercel.json` menjadwalkan tujuh cron: `retention` (0 20), `subscription-lifecycle` (0 0),
`subscription-expiry-reminder` (0 6), `payment-recovery` (0 21), `device-cleanup` (0 3),
`reconcile-storage` (23 2), `orphan-sweep` (40 2) — semua UTC. `deploy/cron/snapyos.cron`
memuat jadwal yang sama untuk deployment non-Vercel.
