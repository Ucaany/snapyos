# 7. Database Schema

>
> **RLS (C1, migrasi 0064):** setiap tabel `public.*` punya `alter table ... enable row level security` + policy `svc_all` (`for all to service_role using (true) with check (true)`); `anon`/`authenticated` di-revoke, `service_role` di-grant. Tidak ada policy `to public/anon/authenticated`.
>
> **RPC privilege (H1, migrasi 0065):** setiap fungsi aplikasi di `db/schema.sql` di-lock `revoke execute from public, anon, authenticated` + `grant execute to service_role` (fungsi trigger `set_updated_at`/`tg_*` dikecualikan).
>
> **RPC search_path (0071):** seluruh RPC aplikasi di-pin `set search_path = public, pg_temp` (defense-in-depth; 0065 sudah menutup EXECUTE). Migrasi `0071` **belum dijalankan** di Supabase (keputusan pemilik). RPC yang lahir dari `0073`/`0074` sudah memakai `set search_path` langsung di definisinya, jadi tidak bergantung pada `0071`.

PostgreSQL (Supabase). Konvensi:

- Semua PK `uuid` (default `gen_random_uuid()`), kecuali disebutkan lain.
- `created_at`/`updated_at` `timestamptz default now()`.
- Uang = `integer` (IDR, tanpa desimal).
- Multi-tenant: entity bisnis selalu punya `business_id`.
- Foreign keys `on delete` dipilih per tabel (umumnya `cascade` untuk child, `restrict`/`set null` untuk referensi penting).
- Tambahkan index pada kolom filter umum (`business_id`, status, tanggal, FK).

## 7.0b DDL / Migration (wajib saat implementasi)

Tabel-tabel di dokumen ini adalah **spesifikasi**, bukan SQL. Saat implementasi (Phase 0), seluruh schema di sini **wajib** direalisasikan sebagai migrasi SQL nyata (`db/schema.sql` atau migration Supabase) yang mencakup:

- `CREATE TABLE` lengkap dengan constraint (`NOT NULL`, `UNIQUE`, `CHECK`, `FOREIGN KEY ... ON DELETE`).
- **Index lengkap** per tabel — minimal composite index untuk query filter umum: `(business_id, status)`, `(business_id, created_at)`, `(business_id, outlet_id)`, unique `(provider, payment_reference)`, unique `(business_id, code)` untuk vouchers, unique `slug` per business untuk `photoboxes`.
- `ENUM`/`CHECK` untuk kolom status (mis. `sessions.status`, `payments.status`, `subscriptions.status`).
- Seed data: 3 `plans` (STARTER/GROWTH/BUSINESS) + `add_ons` default + `platform_settings` default.
- `trigger`/`updated_at` otomatis.

Gap yang ditutup: §7 hanya deskripsi kolom per tabel; DDL nyata + index lengkap + seed adalah deliverable Phase 0 (lihat `12-roadmap-mvp.md`).

---

## 7.1 Global / Auth

### users

| kolom                   | tipe                 | ket                                                         |
| ----------------------- | -------------------- | ----------------------------------------------------------- |
| id                      | uuid PK              |                                                             |
| email                   | text unique not null |                                                             |
| email_verified          | timestamptz          |                                                             |
| password_hash           | text                 | dari Auth.js credential (jika pakai DB strategy)            |
| name                    | text                 |                                                             |
| avatar_url              | text                 |                                                             |
| role                    | text                 | `user` (default) / `admin`                                  |
| status                  | text                 | `active`/`suspended` (0015 — user suspended diblokir login) |
| whatsapp                | text                 | nullable — profil registrasi (0017), read-only admin        |
| acquisition_source      | text                 | nullable — profil registrasi (0017)                         |
| planned_devices         | integer              | nullable — profil registrasi (0017)                         |
| signup_ip               | text                 | nullable — profil registrasi (0017)                         |
| signup_user_agent       | text                 | nullable — profil registrasi (0017)                         |
| created_at / updated_at | timestamptz          |                                                             |

### auth_sessions (revocation JWT — dipakai, bukan opsional)

Implementasi aktual memakai **JWT transport + DB revocation** (bukan DB session penuh): setiap refresh JWT cek baris sesi masih ada (fail-closed); signOut menghapus baris. RLS aktif tanpa policy → hanya service-role.

| kolom         | tipe            | ket               |
| ------------- | --------------- | ----------------- |
| id            | uuid PK         |                   |
| user_id       | uuid → users.id | on delete cascade |
| session_token | text unique     |                   |
| expires       | timestamptz     |                   |
| created_at    | timestamptz     |                   |

### accounts / sessions (Auth.js)

Tidak dipakai (JWT strategy + `auth_sessions` di atas); `users` tetap source of truth identitas.

---

## 7.2 Tenant & Subscription

### businesses

| kolom                   | tipe            | ket                                |
| ----------------------- | --------------- | ---------------------------------- |
| id                      | uuid PK         | tenant id                          |
| owner_id                | uuid → users.id | owner utama                        |
| slug                    | text unique     | untuk URL customer app `/p/[slug]` |
| name                    | text            | contoh "KLIK FOTO"                 |
| logo_url                | text            |                                    |
| timezone                | text            | default `Asia/Jakarta`             |
| currency                | text            | default `IDR`                      |
| status                  | text            | `active` / `suspended`             |
| created_at / updated_at | timestamptz     |                                    |

### business_members (user ↔ business)

| kolom       | tipe                 | ket                           |
| ----------- | -------------------- | ----------------------------- |
| id          | uuid PK              |                               |
| business_id | uuid → businesses.id |                               |
| user_id     | uuid → users.id      |                               |
| role        | text                 | `owner` / `manager` / `staff` |
| created_at  | timestamptz          |                               |

> `staff_roles` di brief disederhanakan menjadi `business_members` (single table untuk membership + role). Jika perlu role granular per fitur, tambah `permissions jsonb`.

### business_settings

| kolom          | tipe                    | ket                                                                                                    |
| -------------- | ----------------------- | ------------------------------------------------------------------------------------------------------ |
| business_id    | uuid PK → businesses.id |                                                                                                        |
| branding       | jsonb                   | `{ primary_color, secondary_color, background, typography, welcome_title, welcome_tagline, logo_url }` |
| camera         | jsonb                   | `{ countdown_seconds, capture_mode, mirror, fullscreen }`                                              |
| checkout       | jsonb                   | `{ currency, expiry_minutes }`                                                                         |
| retention_days | integer                 | retensi hasil foto (default 3, max 3 hari — migrasi 0034)                                              |

### plans

| kolom                   | tipe        | ket                                                                |
| ----------------------- | ----------- | ------------------------------------------------------------------ |
| id                      | uuid PK     |                                                                    |
| code                    | text unique | `starter`/`growth`/`business`                                      |
| name                    | text        |                                                                    |
| price_monthly           | integer     |                                                                    |
| price_yearly            | integer     | nullable                                                           |
| billing_cycle           | text        | `monthly`/`yearly`                                                 |
| max_businesses          | integer     |                                                                    |
| max_outlets             | integer     |                                                                    |
| max_photoboxes          | integer     |                                                                    |
| max_concurrent_sessions | integer     | perangkat online bersamaan / seat (default 1) — plan camera-sdk §B |
| max_staff               | integer     |                                                                    |
| storage_limit_mb        | integer     |                                                                    |
| platform_fee_percent    | numeric     | default 0                                                          |
| platform_fee_flat       | integer     | default 0                                                          |
| features                | jsonb       | flags fitur                                                        |
| is_active               | boolean     |                                                                    |
| created_at / updated_at | timestamptz |                                                                    |

### subscriptions

| kolom                      | tipe                 | ket                                               |
| -------------------------- | -------------------- | ------------------------------------------------- |
| id                         | uuid PK              |                                                   |
| business_id                | uuid → businesses.id |                                                   |
| plan_id                    | uuid → plans.id      |                                                   |
| status                     | text                 | `trial`/`active`/`past_due`/`cancelled`/`expired` |
| trial_ends_at              | timestamptz          | nullable                                          |
| current_period_start / end | timestamptz          |                                                   |
| cancel_at_period_end       | boolean              |                                                   |
| created_at / updated_at    | timestamptz          |                                                   |

> **Dihapus (0042, 2026-09-18):** `subscriptions.provider`, `subscriptions.provider_subscription_id` — billing internal, tidak pernah dipakai kode.

### invoices

| kolom           | tipe                    | ket                                                                              |
| --------------- | ----------------------- | -------------------------------------------------------------------------------- |
| id              | uuid PK                 |                                                                                  |
| business_id     | uuid → businesses.id    |                                                                                  |
| subscription_id | uuid → subscriptions.id | nullable                                                                         |
| number          | text                    | unique **per business** (`unique(business_id, number)` — 0008, seq per-business) |
| amount          | integer                 |                                                                                  |
| status          | text                    | `pending`/`paid`/`void`                                                          |
| paid_at         | timestamptz             |                                                                                  |

> **Dihapus (0042, 2026-09-18):** `invoices.due_at` — payment-first, due date tidak dipakai.
> | intent | jsonb | nullable — intent pembayaran-first (0012): plan_change/add_on diaktifkan saat paid (flag `intent.applied`) |
> | created_at | timestamptz | |

### add_ons

| kolom                   | tipe        | ket                                           |
| ----------------------- | ----------- | --------------------------------------------- |
| id                      | uuid PK     |                                               |
| code                    | text unique | `extra_session`, `pos` (unit `feature`, 0019) |
| name                    | text        | "Add-on +1 Sesi" / "POS Kasir"                |
| price_monthly           | integer     |                                               |
| unit                    | text        | `session` / `feature` (default `session`)     |
| is_active               | boolean     |                                               |
| created_at / updated_at | timestamptz |                                               |

### subscription_promos (0014 — promo kode platform billing)

| kolom                 | tipe        | ket                           |
| --------------------- | ----------- | ----------------------------- |
| id                    | uuid PK     |                               |
| code                  | text unique |                               |
| type                  | text        | `percentage`/`fixed`          |
| amount                | integer     | persen 1–100 atau nominal IDR |
| min_transaction       | integer     | default 0                     |
| max_discount          | integer     | nullable                      |
| start_date / end_date | timestamptz | nullable                      |
| usage_limit           | integer     | nullable (null = unlimited)   |
| used_count            | integer     | default 0                     |
| is_active             | boolean     |                               |
| created_at            | timestamptz |                               |

### subscription_add_ons (m2m)

| kolom                   | tipe                    | ket                                                                                           |
| ----------------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| id                      | uuid PK                 |                                                                                               |
| subscription_id         | uuid → subscriptions.id |                                                                                               |
| add_on_id               | uuid → add_ons.id       |                                                                                               |
| quantity                | integer                 | default 1                                                                                     |
| status                  | text                    | `active`/`cancelled`                                                                          |
| cancel_at_period_end    | boolean                 | default false; jika true, add-on akan dibatalkan di akhir periode (konsisten dgn plan cancel) |
| created_at / updated_at | timestamptz             |                                                                                               |

---

## 7.3 Operational

### outlets

| kolom                   | tipe                 | ket                                     |
| ----------------------- | -------------------- | --------------------------------------- |
| id                      | uuid PK              |                                         |
| business_id             | uuid → businesses.id |                                         |
| name                    | text                 | "Malioboro"                             |
| address                 | text                 | nullable                                |
| city                    | text                 | nullable — kabupaten/kota (API wilayah) |
| province                | text                 | nullable — provinsi (API wilayah)       |
| status                  | text                 | `active`/`inactive`                     |
| created_at / updated_at | timestamptz          |                                         |

### photoboxes

| kolom                   | tipe                       | ket                                                                                                                                              |
| ----------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| id                      | uuid PK                    |                                                                                                                                                  |
| business_id             | uuid → businesses.id       |                                                                                                                                                  |
| outlet_id               | uuid → outlets.id          |                                                                                                                                                  |
| slug                    | text                       | unique per business, untuk URL `/p/[businessSlug]/[photoboxSlug]`                                                                                |
| name                    | text                       | "Booth 01"                                                                                                                                       |
| status                  | text                       | `online`/`offline`/`maintenance`                                                                                                                 |
| camera                  | text                       | nullable                                                                                                                                         |
| printer                 | text                       | nullable                                                                                                                                         |
| display                 | text                       | nullable                                                                                                                                         |
| default_template_id     | uuid → templates.id        | nullable                                                                                                                                         |
| camera_settings         | jsonb                      | nullable (`{ countdown_seconds, mirror_preview, fullscreen, facingMode, capture_width, capture_height, jpeg_quality }`)                          |
| print_settings          | jsonb                      | nullable (`{ enabled, paper_size, layout, orientation, auto_print, copies }`)                                                                    |
| session_settings        | jsonb                      | nullable (v2: `{ timer_seconds: 300, warning_seconds: 60, max_retakes: null }`)                                                                  |
| exit_pin_hash           | text                       | nullable — PIN keluar kiosk, verifikasi server-side (hash)                                                                                       |
| exit_pin_failed_count   | integer not null default 0 | migrasi 0034 — throttle brute-force PIN exit kiosk (counter percobaan gagal beruntun)                                                            |
| exit_pin_locked_until   | timestamptz nullable       | migrasi 0034 — 5 gagal beruntun → lock 5 menit (server-side, tidak dapat di-bypass client)                                                       |
| pos_enabled             | boolean                    | not null default false — toggle POS add-on per booth (0019)                                                                                      |
| branding                | jsonb                      | nullable (0045) — override branding kiosk per-booth; null = inherit `business_settings.branding`. Deep-merge di app layer saat render.           |
| created_at / updated_at | timestamptz                |                                                                                                                                                  |

### member_photoboxes (akses booth per member — 0018)

Owner mengatur booth mana yang bisa diakses staff; PK `(user_id, photobox_id)`.

| kolom       | tipe                 | ket                                                              |
| ----------- | -------------------- | ---------------------------------------------------------------- |
| user_id     | uuid → users.id      | on delete cascade                                                |
| business_id | uuid → businesses.id | on delete cascade                                                |
| photobox_id | uuid → photoboxes.id | on delete cascade                                                |
| pin_hash    | text nullable        | argon2id hash PIN login staff per booth (0043); null = tanpa PIN |
| created_at  | timestamptz          |                                                                  |

### devices (perangkat teraktivasi)

| kolom                   | tipe                 | ket                                                                                    |
| ----------------------- | -------------------- | -------------------------------------------------------------------------------------- |
| id                      | uuid PK              |                                                                                        |
| business_id             | uuid → businesses.id |                                                                                        |
| photobox_id             | uuid → photoboxes.id |                                                                                        |
| name                    | text                 | "Kiosk Malioboro"                                                                      |
| device_token_hash       | text                 | hash dari token yang disimpan device                                                   |
| status                  | text                 | `active`/`revoked`                                                                     |
| last_seen_at            | timestamptz          |                                                                                        |
| os_info                 | jsonb                | nullable — `{ platform, arch, version }` (0027)                                        |
| display_orientation     | text                 | `portrait`/`landscape` (0027)                                                          |
| display_style           | text                 | `classic`/`compact`/`receipt` (0027)                                                   |
| camera_config           | jsonb                | `{ type, deviceId, calibration: { rotation, zoom, mirror } }` (0027)                   |
| printer_config          | jsonb                | `{ printerName, paperSize, cutMode, orientation, copies, margins, driverType }` (0027) |
| kiosk_locked            | boolean              | default false — apakah kiosk dalam mode terkunci (0027)                                |
| last_heartbeat_at       | timestamptz          | nullable — timestamp heartbeat terakhir (0027)                                         |
| diagnostics             | jsonb                | `{ camera_ok, network_ok, printer_ok, sync_ok, last_check }` (0027)                    |
| operator_user_id        | uuid → users.id      | nullable — operator yang terhubung saat ini (0027)                                     |
| operator_connected_at   | timestamptz          | nullable (0027)                                                                        |
| created_at / updated_at | timestamptz          |                                                                                        |

### activation_codes (sekali pakai)

| kolom       | tipe                 | ket                |
| ----------- | -------------------- | ------------------ |
| id          | uuid PK              |                    |
| photobox_id | uuid → photoboxes.id |                    |
| business_id | uuid → businesses.id |                    |
| code        | text                 | random short-lived |
| expires_at  | timestamptz          | (~5 menit)         |
| used_at     | timestamptz          | nullable           |
| created_at  | timestamptz          |                    |

### packages

| kolom                   | tipe                 | ket                           |
| ----------------------- | -------------------- | ----------------------------- |
| id                      | uuid PK              |                               |
| business_id             | uuid → businesses.id |                               |
| name                    | text                 |                               |
| price                   | integer              | IDR                           |
| photo_count             | integer              | default 1                     |
| print_count             | integer              | default 0                     |
| digital_output          | boolean              | default false                 |
| capture_mode            | text                 | `single`/`burst`/`photostrip` |
| description             | text                 |                               |
| is_active               | boolean              |                               |
| created_at / updated_at | timestamptz          |                               |

### package_templates (m2m)

| kolom                        | tipe                | ket |
| ---------------------------- | ------------------- | --- |
| package_id                   | uuid → packages.id  |     |
| template_id                  | uuid → templates.id |     |
| PK (package_id, template_id) |                     |     |

### package_outlets (m2m)

| kolom      | tipe               | ket |
| ---------- | ------------------ | --- |
| package_id | uuid → packages.id |     |
| outlet_id  | uuid → outlets.id  |     |

### package_photoboxes (m2m)

| kolom       | tipe                 | ket |
| ----------- | -------------------- | --- |
| package_id  | uuid → packages.id   |     |
| photobox_id | uuid → photoboxes.id |     |

### templates

| kolom                   | tipe                                              | ket                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                      | uuid PK                                           |                                                                                                                                                                                                                                     |
| business_id             | uuid → businesses.id                              | nullable (global platform template)                                                                                                                                                                                                 |
| name                    | text                                              |                                                                                                                                                                                                                                     |
| category                | text                                              | **DEPRECATED (migration 0039)** — display fallback bebas, tidak lagi CHECK enum. Konsumer baru pakai `category_id`.                                                                                                                 |
| category_id             | uuid → template_categories(id) ON DELETE RESTRICT | **BARU (migration 0039)** — FK canonical ke kategori. Backfill dari `category` text saat migrasi.                                                                                                                                   |
| file_url                | text                                              | storage key (PNG frame, alpha = lubang slot)                                                                                                                                                                                        |
| thumbnail_url           | text                                              | thumbnail WebP dari frame yang diunggah (fallback: frame)                                                                                                                                                                            |
| layout                  | jsonb                                             | NOT NULL default `'{}'` — canvas size + array slot foto; kosong = template legacy full-canvas. Contract & validasi: `15-template-builder.md` §15.2 (slot max 8, dalam batas canvas; assign lintas paket tidak dibatasi jumlah slot) |
| video_url               | text                                              | nullable — video frame (0020)                                                                                                                                                                                                       |
| is_active               | boolean                                           |                                                                                                                                                                                                                                     |
| created_at / updated_at | timestamptz                                       |                                                                                                                                                                                                                                     |

### template_categories

| kolom     | tipe        | ket |
| --------- | ----------- | --- |
| id        | uuid PK     |     |
| name      | text unique |     |
| is_global | boolean     |     |

### stickers

| kolom       | tipe                 | ket                                                          |
| ----------- | -------------------- | ------------------------------------------------------------ |
| id          | uuid PK              |                                                              |
| business_id | uuid → businesses.id |                                                              |
| name        | text                 |                                                              |
| category    | text                 | `hearts`/`stars`/`sparkles`/`emoji`/`doodles`/`event`/`text` |
| file_url    | text                 |                                                              |
| is_active   | boolean              |                                                              |

---

## 7.4 Session & Photo

### sessions

| kolom            | tipe                 | ket                                                                           |
| ---------------- | -------------------- | ----------------------------------------------------------------------------- |
| id               | uuid PK              |                                                                               |
| business_id      | uuid → businesses.id |                                                                               |
| outlet_id        | uuid → outlets.id    |                                                                               |
| photobox_id      | uuid → photoboxes.id |                                                                               |
| event_id         | uuid → events.id     | nullable                                                                      |
| package_id       | uuid → packages.id   |                                                                               |
| customer_id      | uuid → customers.id  | nullable                                                                      |
| status           | text                 | `active`/`completed`/`cancelled`/`expired` (v2: timer habis)                  |
| retake_count     | integer              | default 0 (retake unlimited dibatasi timer; `max_retakes` opsional)           |
| started_at       | timestamptz          |                                                                               |
| completed_at     | timestamptz          |                                                                               |
| expires_at       | timestamptz          | v2 pay-first: timer sesi — di-set saat session dibuat (post-paid)             |
| finalized_at     | timestamptz          | v2: saat customer finalize / auto-finalize timeout                            |
| result_gif_key   | text                 | nullable — GIF slideshow hasil sesi (storage key)                             |
| media_cleaned_at | timestamptz          | nullable — marker retention cron (0009); null = media hasil belum dibersihkan |
| created_at       | timestamptz          |                                                                               |

### photos

| kolom         | tipe                 | ket                |
| ------------- | -------------------- | ------------------ |
| id            | uuid PK              |                    |
| session_id    | uuid → sessions.id   |                    |
| business_id   | uuid → businesses.id |                    |
| template_id   | uuid → templates.id  | nullable           |
| file_key      | text                 | storage object key |
| thumbnail_key | text                 | nullable           |
| order_index   | integer              |                    |
| created_at    | timestamptz          |                    |

---

## 7.5 Transaction & Payment

### transactions (SOURCE OF TRUTH untuk finance)

| kolom                   | tipe                          | ket                                                                                                                                                                                                                                          |
| ----------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                      | uuid PK                       |                                                                                                                                                                                                                                              |
| business_id             | uuid → businesses.id          |                                                                                                                                                                                                                                              |
| outlet_id               | uuid → outlets.id             |                                                                                                                                                                                                                                              |
| photobox_id             | uuid → photoboxes.id          |                                                                                                                                                                                                                                              |
| session_id              | uuid → sessions.id            | nullable                                                                                                                                                                                                                                     |
| event_id                | uuid → events.id              | nullable                                                                                                                                                                                                                                     |
| customer_id             | uuid → customers.id           | nullable                                                                                                                                                                                                                                     |
| package_id              | uuid → packages.id            | nullable                                                                                                                                                                                                                                     |
| payment_method          | text                          | `qris`/`cash`/`bank_transfer`/`other`/`offline`/`manual` (`offline` = kiosk offline non-withdrawable 0016; `manual` = pencatatan manual owner non-withdrawable 0033). Enum `gateway` DIHAPUS 0036 — direct-merchant QRIS collapse ke `qris`. |
| withdrawable            | boolean not null default true | Fase 3 STEP 4 / migrasi 0033. `manual` & `offline` → `false` (tidak masuk saldo penarikan); QRIS Pakasir → `true`. Row lama pra-0033 (`null`-legacy) diperlakukan `true` oleh loader (backward-compat).                                      |
| gross_amount            | integer                       |                                                                                                                                                                                                                                              |
| discount_amount         | integer                       | default 0                                                                                                                                                                                                                                    |
| final_amount            | integer                       |                                                                                                                                                                                                                                              |
| voucher_id              | uuid → vouchers.id            | nullable                                                                                                                                                                                                                                     |
| status                  | text                          | `pending`/`paid`/`failed`/`cancelled`/`refunded`                                                                                                                                                                                             |
| number                  | text unique                   | global-unique (bukan per-business)                                                                                                                                                                                                           |
| pos_order_id            | uuid → pos_orders.id          | nullable — traceability POS (0019); **unique per non-null** (partial unique index `idx_tx_pos_order_unique`, 0026)                                                                                                                           |
| cashier_user_id         | uuid → users.id               | nullable — kasir POS (0019)                                                                                                                                                                                                                  |
| paid_at                 | timestamptz                   |                                                                                                                                                                                                                                              |
| created_at / updated_at | timestamptz                   |                                                                                                                                                                                                                                              |

> **Invarian saldo (Fase 3 → dihapus 0044):** alur saldo/penarikan (`balances`, `balance_ledger`, `withdrawals`, RPC `withdrawable_payments_sum`) **sudah dihapus** oleh migrasi `0044_drop_withdrawal_flow.sql`; tidak ada satu pun objek itu di `db/schema.sql`. Yang tersisa adalah kolom penanda `transactions.withdrawable`: `manual`/`offline` → `false` (dibuat 0033), QRIS Pakasir → `true`. Kolom itu kini **murni reporting** — ditampilkan di `/dashboard/finance` dan `TransactionsView.tsx`, tidak menggerakkan saldo apa pun. Manual/offline tetap tidak meng-insert baris `payments` (`src/server/transactions.ts` createManualTransaction; `src/server/kiosk-sessions.ts` offline insert).

### payments

| kolom                                | tipe                          | ket                                                                                                                                       |
| ------------------------------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| id                                   | uuid PK                       |                                                                                                                                           |
| business_id                          | uuid → businesses.id          |                                                                                                                                           |
| transaction_id                       | uuid → transactions.id        | nullable (link setelah konfirmasi)                                                                                                        |
| checkout_session_id                  | uuid → checkout_sessions.id   |                                                                                                                                           |
| session_id                           | uuid → sessions.id            | nullable                                                                                                                                  |
| outlet_id / photobox_id / package_id | uuid                          | nullable                                                                                                                                  |
| gross_amount                         | integer                       |                                                                                                                                           |
| discount_amount                      | integer                       | default 0                                                                                                                                 |
| voucher_id                           | uuid → vouchers.id            | nullable                                                                                                                                  |
| final_amount                         | integer                       | nominal yang diminta ke provider                                                                                                          |
| order_id                             | text unique                   | ID dikirim ke provider                                                                                                                    |
| amount_uniq                          | integer                       | kode unik dari provider (informasional; gate amount memakai `final_amount`/`total_amount`)                                                |
| total_amount                         | integer                       | nominal dibayar pembeli (final + uniq)                                                                                                    |
| provider_signature                   | text                          | signature dari create provider (dipakai `invoice_payments`; jalur kiosk tidak memakainya, Pakasir tanpa signature)                        |
| provider                             | text                          | `pakasir`/`midtrans`/`tripay`                                                                                                             |
| payment_reference                    | text                          | unique ref dari provider                                                                                                                  |
| status                               | text                          | `creating`/`pending`/`paid`/`failed`/`expired`/`cancelled`/`refunded`; `creating` adalah reservation singkat sebelum QR provider dibuat   |
| qr_string                            | text                          | nullable (url/base64 QR)                                                                                                                  |
| credential_id                        | uuid → payment_credentials.id | nullable — Direct Merchant credential (0027); NULL = aggregator mode (legacy in-flight saja; kiosk tidak lagi membuat payment aggregator) |
| expires_at                           | timestamptz                   |                                                                                                                                           |
| paid_at                              | timestamptz                   |                                                                                                                                           |
| created_at / updated_at              | timestamptz                   |                                                                                                                                           |

> **Dihapus (0042, 2026-09-18):** tabel `payment_providers` — katalog legacy tanpa konsumen; credential merchant per-business ada di `payment_credentials`.

### payment_webhooks

| kolom           | tipe               | ket                                                                                                                                                                                             |
| --------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id              | uuid PK            |                                                                                                                                                                                                 |
| provider        | text               |                                                                                                                                                                                                 |
| event_id        | text unique        | idempotency key                                                                                                                                                                                 |
| event_type      | text               |                                                                                                                                                                                                 |
| payload         | jsonb              | payload diagnostik ter-redaksi; field secret tidak dipersist plaintext                                                                                                                          |
| signature_valid | boolean            | `true`/`false` = provider bersignature (Midtrans/Tripay); `null` = provider tanpa signature (Pakasir)                                                                                           |
| status          | text               | `received`/`processed`/`ignored`/`error` (H3: `received` non-authoritative sebelum verify, dipromosikan `processed` setelah settle (migrasi 0066); default kolom `received` sejak migrasi 0070) |
| payment_id      | uuid → payments.id | nullable                                                                                                                                                                                        |
| error           | text               | nullable                                                                                                                                                                                        |
| received_at     | timestamptz        |                                                                                                                                                                                                 |

### checkout_sessions

| kolom                                         | tipe                 | ket                                 |
| --------------------------------------------- | -------------------- | ----------------------------------- |
| id                                            | uuid PK              |                                     |
| business_id                                   | uuid → businesses.id |                                     |
| outlet_id / photobox_id / session_id          | uuid                 | nullable                            |
| package_id                                    | uuid → packages.id   |                                     |
| voucher_id                                    | uuid → vouchers.id   | nullable                            |
| gross_amount / discount_amount / final_amount | integer              |                                     |
| currency                                      | text                 | `IDR`                               |
| status                                        | text                 | `open`/`paid`/`expired`/`cancelled` |
| result_token                                  | text unique          | untuk akses result                  |
| expires_at                                    | timestamptz          |                                     |
| created_at / updated_at                       | timestamptz          |                                     |

### payment_credentials (0027 — Direct Merchant Integration)

Kredensial payment gateway per business. Owner memasukkan merchant_id + server_key dari gateway masing-masing. `server_key_encrypted` dienkripsi AES-256-GCM di app layer (key: `PAYMENT_ENCRYPTION_KEY`).

| kolom                | tipe                 | ket                                                                |
| -------------------- | -------------------- | ------------------------------------------------------------------ |
| id                   | uuid PK              |                                                                    |
| business_id          | uuid → businesses.id | on delete cascade                                                  |
| provider             | text                 | `midtrans`/`tripay`/`pakasir`                                      |
| label                | text                 | nullable — nama tampilan ("Midtrans Prod")                         |
| merchant_id          | text                 | merchant/client ID dari gateway                                    |
| server_key_encrypted | text                 | AES-256-GCM encrypted server key                                   |
| client_key           | text                 | nullable — client key publik                                       |
| environment          | text                 | `sandbox`/`production`                                             |
| is_active            | boolean              | default true                                                       |
| metadata             | jsonb                | default `{}` — provider-specific config (`enabled_methods[]`, dll) |

> **Dihapus (0042, 2026-09-18):** `payment_credentials.webhook_url` — URL callback dihitung dari `SnapyOS_PUBLIC_BASE_URL` (`paymentWebhookUrl()`), tidak pernah disimpan.
> | created_at / updated_at | timestamptz | |

Constraint: `unique(business_id, provider, environment)` — satu credential per provider per environment per business. Constraint ini **tidak** membatasi jumlah provider aktif pada environment yang sama; registry memilih credential aktif terbaru secara deterministik.

### device_logs (0027 — riwayat per device)

Log perangkat Electron. Auto-cleanup 30 hari via cron retention. **TIDAK** menyimpan token, serial number, USB path, atau secret.

| kolom      | tipe              | ket                                                                |
| ---------- | ----------------- | ------------------------------------------------------------------ |
| id         | uuid PK           |                                                                    |
| device_id  | uuid → devices.id | on delete cascade                                                  |
| level      | text              | `debug`/`info`/`warn`/`error`                                      |
| category   | text              | default `system` — extensible tanpa migration (validasi app layer) |
| message    | text              |                                                                    |
| metadata   | jsonb             | nullable                                                           |
| created_at | timestamptz       |                                                                    |

---

## 7.5b POS Add-on (0019 — offline-only, per booth; detail `docs/pos/`)

### pos_products

| kolom                   | tipe                 | ket                                                |
| ----------------------- | -------------------- | -------------------------------------------------- |
| id                      | uuid PK              |                                                    |
| business_id             | uuid → businesses.id | katalog per business                               |
| name                    | text                 |                                                    |
| sku                     | text                 | nullable; `unique(business_id, sku)` — NULL ≠ NULL |
| category                | text                 | default `lainnya` (data, bukan enum DB)            |
| description             | text                 | nullable                                           |
| price                   | integer              | check > 0                                          |
| cost                    | integer              | nullable — HPP opsional                            |
| stock                   | integer              | nullable — NULL = tidak ditrack                    |
| is_active               | boolean              | default true (soft delete)                         |
| image_url               | text                 | nullable                                           |
| created_at / updated_at | timestamptz          |                                                    |

### pos_orders

| kolom                                         | tipe                 | ket                                                           |
| --------------------------------------------- | -------------------- | ------------------------------------------------------------- |
| id                                            | uuid PK              |                                                               |
| business_id                                   | uuid → businesses.id |                                                               |
| photobox_id                                   | uuid → photoboxes.id | NOT NULL, on delete restrict — per booth                      |
| outlet_id                                     | uuid → outlets.id    | diisi dari photobox.outlet_id                                 |
| cashier_user_id                               | uuid → users.id      | NOT NULL, on delete restrict                                  |
| customer_id                                   | uuid → customers.id  | nullable                                                      |
| number                                        | text                 | `POS-YYYYMMDD-####` WIB; `unique(business_id, number)`        |
| status                                        | text                 | `pending`/`paid`/`cancelled` (tanpa `expired` — offline)      |
| gross_amount / discount_amount / final_amount | integer              | check `final = gross − discount`                              |
| payment_method                                | text                 | `cash`/`bank_transfer`/`other` (offline-only)                 |
| payment_reference                             | text                 | nullable                                                      |
| paid_at                                       | timestamptz          | nullable                                                      |
| paper_width_mm                                | integer              | `58`/`80`; snapshot lebar printer thermal saat order dibuat   |
| print_mode                                    | text                 | `browser`/`bluetooth`; snapshot jalur cetak saat order dibuat |
| auto_print                                    | boolean              | snapshot izin auto-print saat order dibuat                    |
| created_at / updated_at                       | timestamptz          |                                                               |

### pos_order_items (snapshot)

| kolom                               | tipe                   | ket                                                   |
| ----------------------------------- | ---------------------- | ----------------------------------------------------- |
| id                                  | uuid PK                |                                                       |
| pos_order_id                        | uuid → pos_orders.id   | on delete cascade                                     |
| pos_product_id                      | uuid → pos_products.id | nullable (produk boleh berubah tanpa merusak riwayat) |
| name_snapshot / sku_snapshot        | text                   | harga/nama beku saat order                            |
| unit_price_snapshot / cost_snapshot | integer                | snapshot; cost nullable                               |
| quantity                            | integer                | check > 0                                             |
| subtotal                            | integer                | = unit_price × qty                                    |
| created_at                          | timestamptz            |                                                       |

RPC `pos_decrement_stock(p_business, p_product, p_qty)` — decrement atomic `stock >= qty`, return false saat shortfall. Dipakai jalur satu-produk.

RPC `pos_decrement_stock_batch(p_business, p_items jsonb)` — 0076. Satu UPDATE ter-guard untuk seluruh baris order; return `table(product_id, ok)`. Baris yang stoknya kurang tidak diubah dan dilaporkan `ok = false`; order tetap paid. Dipakai `src/server/pos-orders.ts`.

RPC `pos_complete_payment(p_order_id, p_business, p_method, p_cashier, p_tx_number, p_outlet_id, p_photobox_id, p_gross, p_discount, p_final)` — atomic UPDATE pos_orders pending→paid + INSERT transactions dalam satu DB transaction (0026). Return UUID transaction baru atau NULL (order bukan pending / sudah diproses). Menulis `transactions.withdrawable=false` untuk penjualan POS offline, menghilangkan window kegagalan parsial dimana order paid tanpa baris transactions, dan dibuat idempoten terhadap retry.

---

### invoice_payments (0011 — pembayaran invoice subscription via QRIS)

Terpisah dari `payments` (checkout kiosk); webhook Pakasir bercabang saat `order_id` bukan payment.

| kolom                   | tipe                 | ket                         |
| ----------------------- | -------------------- | --------------------------- |
| id                      | uuid PK              |                             |
| business_id             | uuid → businesses.id |                             |
| invoice_id              | uuid → invoices.id   | on delete cascade           |
| amount / total_amount   | integer              | nominal + nominal+kode unik |
| order_id                | text unique          | ID ke Pakasir               |
| payment_reference       | text unique          |                             |
| provider_signature      | text                 | validasi webhook            |
| provider                | text                 | default `pakasir`           |
| status                  | text                 | `pending`/`paid`/`expired`  |
| qr_string               | text                 | nullable                    |
| expires_at / paid_at    | timestamptz          | nullable                    |
| created_at / updated_at | timestamptz          |                             |

---

## 7.6 People & Business Data

### customers

| kolom                   | tipe                 | ket      |
| ----------------------- | -------------------- | -------- |
| id                      | uuid PK              |          |
| business_id             | uuid → businesses.id |          |
| name                    | text                 | nullable |
| phone                   | text                 | nullable |
| email                   | text                 | nullable |
| created_at / updated_at | timestamptz          |          |

### bookings

| kolom                   | tipe                 | ket                                                  |
| ----------------------- | -------------------- | ---------------------------------------------------- |
| id                      | uuid PK              |                                                      |
| business_id             | uuid → businesses.id |                                                      |
| customer_name           | text                 |                                                      |
| customer_contact        | text                 | nullable                                             |
| starts_at               | timestamptz          | waktu mulai; ditampilkan dalam `businesses.timezone` |
| ends_at                 | timestamptz          | waktu selesai; wajib `ends_at > starts_at`           |
| package_id              | uuid → packages.id   | nullable                                             |
| outlet_id               | uuid → outlets.id    | nullable                                             |
| photobox_id             | uuid → photoboxes.id | nullable                                             |
| status                  | text                 | `pending`/`confirmed`/`completed`/`cancelled`        |
| created_at / updated_at | timestamptz          |                                                      |

Booking wajib memiliki resource (`photobox_id` atau `outlet_id`) dan interval waktu. `date` + `time` dilarang karena kehilangan timezone dan durasi. Database/API wajib menolak interval overlap pada resource yang sama untuk status `pending`/`confirmed`/`completed`; pembatalan membebaskan slot.

### expenses

| kolom                   | tipe                 | ket                                                                                                   |
| ----------------------- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| id                      | uuid PK              |                                                                                                       |
| business_id             | uuid → businesses.id |                                                                                                       |
| outlet_id               | uuid → outlets.id    | nullable                                                                                              |
| category                | text                 | `rent`/`electricity`/`internet`/`paper`/`ink`/`maintenance`/`staff`/`equipment`/`advertising`/`other` |
| amount                  | integer              |                                                                                                       |
| note                    | text                 |                                                                                                       |
| expense_date            | date                 |                                                                                                       |
| created_at / updated_at | timestamptz          |                                                                                                       |

---

## 7.7 Voucher

### vouchers

| kolom                   | tipe                 | ket                                               |
| ----------------------- | -------------------- | ------------------------------------------------- |
| id                      | uuid PK              |                                                   |
| business_id             | uuid → businesses.id |                                                   |
| code                    | text                 | unique per business (`unique(business_id, code)`) |
| type                    | text                 | `percentage`/`fixed`                              |
| amount                  | integer              | persen (1–100) atau nominal IDR                   |
| start_date              | timestamptz          |                                                   |
| end_date                | timestamptz          |                                                   |
| usage_limit             | integer              | nullable (null = unlimited)                       |
| usage_per_customer      | integer              | default 1                                         |
| min_transaction         | integer              | default 0                                         |
| max_discount            | integer              | nullable                                          |
| is_active               | boolean              |                                                   |
| created_at / updated_at | timestamptz          |                                                   |

### voucher_packages (m2m)

| kolom      | tipe               | ket |
| ---------- | ------------------ | --- |
| voucher_id | uuid → vouchers.id |     |
| package_id | uuid → packages.id |     |

### voucher_outlets (m2m)

| kolom      | tipe               | ket |
| ---------- | ------------------ | --- |
| voucher_id | uuid → vouchers.id |     |
| outlet_id  | uuid → outlets.id  |     |

### voucher_usages

| kolom           | tipe                   | ket      |
| --------------- | ---------------------- | -------- |
| id              | uuid PK                |          |
| voucher_id      | uuid → vouchers.id     |          |
| business_id     | uuid → businesses.id   |          |
| customer_id     | uuid → customers.id    | nullable |
| transaction_id  | uuid → transactions.id | nullable |
| discount_amount | integer                |          |
| used_at         | timestamptz            |          |

---

## 7.8 Event

### events

| kolom                   | tipe                 | ket               |
| ----------------------- | -------------------- | ----------------- |
| id                      | uuid PK              |                   |
| business_id             | uuid → businesses.id |                   |
| name                    | text                 |                   |
| event_code              | text unique          |                   |
| date                    | date                 |                   |
| branding                | jsonb                | override branding |
| logo_url                | text                 |                   |
| is_active               | boolean              |                   |
| created_at / updated_at | timestamptz          |                   |

### event_templates (m2m)

| kolom       | tipe                | ket |
| ----------- | ------------------- | --- |
| event_id    | uuid → events.id    |     |
| template_id | uuid → templates.id |     |

---

## 7.9 Admin / Platform

### platform_settings

| kolom      | tipe        | ket |
| ---------- | ----------- | --- |
| key        | text PK     |     |
| value      | jsonb       |     |
| updated_at | timestamptz |     |

### reports (DIHAPUS — migration 0038, audit 2026-09-16)

Tabel `reports` dihapus karena 0 caller di kode aplikasi. Fitur export report (CSV/XLSX) ditangani ad-hoc oleh `src/server/reports.ts` tanpa persistensi ke tabel. Scheduling laporan berkala akan didesain ulang bila kebutuhan konkret muncul.

### audit_logs

| kolom       | tipe                 | ket                                             |
| ----------- | -------------------- | ----------------------------------------------- |
| id          | uuid PK              |                                                 |
| actor_id    | uuid → users.id      |                                                 |
| business_id | uuid → businesses.id | nullable                                        |
| action      | text                 | `refund`, `update_plan`, `delete_voucher`, dll. |
| target      | text                 | entity id                                       |
| meta        | jsonb                |                                                 |
| created_at  | timestamptz          |                                                 |


### installer_catalog (0081 — katalog installer Windows)

| kolom | tipe | ket |
| --- | --- | --- |
| id | uuid PK | |
| version | text | versi rilis, uniqueness bersama channel + architecture |
| channel | text | `stable` / `beta` / `internal` |
| min_windows_version | text | `10` / `11` |
| architecture | text | `x64` / `x86` / `arm64` / `universal` |
| file_name / content_type | text | metadata artifact |
| object_key | text UNIQUE | key private `business-assets`, bukan URL publik |
| file_size_bytes | bigint | dihitung server, > 0 |
| sha256 | text | dihitung server, 64 hex lowercase |
| changelog / compatibility_notes | text | catatan rilis dan kompatibilitas |
| is_active / is_deprecated | boolean | publik hanya bila aktif, tidak deprecated, dan published_at terisi |
| published_at | timestamptz | null = draft |
| created_by / timestamps | uuid / timestamptz | |

Artifact installer diunggah admin ke private storage. URL unduhan dibuat sebagai signed URL
berumur pendek, sehingga tidak ada URL eksternal atau fetch server-side. Instalasi tetap manual,
tanpa auto-update.

### support_tickets (0050)

| kolom                   | tipe                 | ket                                                   |
| ----------------------- | -------------------- | ----------------------------------------------------- |
| id                      | uuid PK              |                                                       |
| business_id             | uuid → businesses.id |                                                       |
| created_by              | uuid → users.id      |                                                       |
| subject                 | text                 | maks 200 karakter                                     |
| category                | text                 | enum bebas: Pembayaran, Kiosk/Photobox, dst.          |
| area                    | text                 | bagian bermasalah                                     |
| description             | text                 | maks 4000 karakter                                    |
| status                  | text                 | `open` / `needs_action` / `resolved` (default `open`) |
| resolved_at             | timestamptz          | nullable                                              |
| created_at / updated_at | timestamptz          |                                                       |

### support_ticket_replies (0050)

| kolom      | tipe                      | ket                |
| ---------- | ------------------------- | ------------------ |
| id         | uuid PK                   |                    |
| ticket_id  | uuid → support_tickets.id | on delete cascade  |
| author_id  | uuid → users.id           |                    |
| body       | text                      | maks 4000 karakter |
| created_at | timestamptz               |                    |

---

## 7.9b Settlement & Withdrawal (lihat `14-settlement-withdrawal.md`)

### balances

| kolom              | tipe                    | ket            |
| ------------------ | ----------------------- | -------------- |
| business_id        | uuid PK → businesses.id |                |
| available          | integer                 | saldo tersedia |
| pending            | integer                 | saldo tertahan |
| lifetime_earned    | integer                 |                |
| lifetime_withdrawn | integer                 |                |
| updated_at         | timestamptz             |                |

### balance_ledger

| kolom         | tipe                 | ket                                                              |
| ------------- | -------------------- | ---------------------------------------------------------------- |
| id            | uuid PK              |                                                                  |
| business_id   | uuid → businesses.id |                                                                  |
| type          | text                 | `credit`/`debit`/`receivable` (direct merchant platform fee)     |
| amount        | integer              |                                                                  |
| source        | text                 | `payment`/`withdrawal`/`refund`/`adjustment`/`platform_fee`      |
| source_id     | uuid                 |                                                                  |
| balance_after | integer              | snapshot saldo; `0` untuk `receivable` yang tidak mengubah saldo |
| created_at    | timestamptz          |                                                                  |

`platform_fee` direct merchant memakai `type='receivable'`, `balance_after=0`, dan unique partial index `(source, source_id) WHERE source='platform_fee'`; ini piutang SnapyOS, bukan mutasi `balances.available`.

### withdrawals

| kolom                   | tipe                 | ket                                               |
| ----------------------- | -------------------- | ------------------------------------------------- |
| id                      | uuid PK              |                                                   |
| business_id             | uuid → businesses.id |                                                   |
| requested_by            | uuid → users.id      |                                                   |
| amount                  | integer              |                                                   |
| bank_name               | text                 |                                                   |
| bank_account_number     | text                 |                                                   |
| bank_account_name       | text                 |                                                   |
| status                  | text                 | `pending`/`processing`/`paid`/`rejected`/`failed` |
| reference               | text                 |                                                   |
| requested_at            | timestamptz          |                                                   |
| processed_at            | timestamptz          |                                                   |
| created_at / updated_at | timestamptz          |                                                   |

---

## 7.10 Key Relations Recap

```
Business ─┬─ Outlet ── Photobox ── Session ── Transaction ── Payment
          ├─ Package ── PackageTemplate ── Template
          ├─ Voucher ── VoucherUsage
          ├─ Customer ── Booking
          ├─ Expense
          ├─ Event
          ├─ Staff (business_members)
          ├─ Balance ── BalanceLedger
          ├─ Withdrawal
          ├─ PaymentCredential ── Payment (0027: direct merchant)
          └─ Subscription ── Plan

Device ── DeviceLog (0027)
CheckoutSession ── Package ── Voucher ── Payment ── Transaction
```

**Aturan:** `transactions` adalah source of truth untuk seluruh financial reporting. `payments` menyimpan detail settlement provider. Discount selalu tercatat terpisah (`discount_amount`) dan **tidak** dihitung sebagai revenue.

---

## 7.11 Index Rekomendasi

```sql
-- transactions
CREATE INDEX idx_tx_business_status ON transactions(business_id, status);
CREATE INDEX idx_tx_business_date ON transactions(business_id, created_at);
CREATE INDEX idx_tx_business_outlet ON transactions(business_id, outlet_id);

-- payments
CREATE INDEX idx_pay_business_status ON payments(business_id, status);
CREATE UNIQUE INDEX idx_pay_reference ON payments(provider, payment_reference);

-- sessions
CREATE INDEX idx_sessions_business ON sessions(business_id, status);

-- voucher usages
CREATE INDEX idx_vu_voucher ON voucher_usages(voucher_id);
CREATE INDEX idx_vu_business ON voucher_usages(business_id);
```
