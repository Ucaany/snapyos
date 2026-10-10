# 9. Security, Authorization & Storage

## Status Implementasi (audit 2026-08-30, diperbarui hardening 2026-10-09)

SESUAI (inti): server-side authorization penuh (`getMembership` → 404 non-member, `can()` RBAC, composite `.eq(business_id)`), argon2id + rate limit login + lockout, JWT + DB revocation (`auth_sessions`), webhook signature + idempotency, upload validation (SVG dihapus, guard path-traversal), formula-injection guard export, retention cron, **RLS di semua tabel publik (migrasi 0064)**.

Security hardening 2026-10-09 (audit keamanan) — lihat §9.12 dan `docs/README.md` changelog: dependency critical dibersihkan (next di-upgrade, xlsx→exceljs), injeksi key storage via `page` kiosk ditutup, SVG dihapus dari logo, rate limit pindah ke backend shared opsional (Upstash).

Security hardening 2026-10-08 (C1–M2) — lihat `docs/README.md` changelog v1.15:

- **C1** RLS aktif di SELURUH tabel `public.*` (migrasi `0064_enable_rls_all_tables.sql`), policy `svc_all` untuk `service_role` saja; `anon`/`authenticated` di-revoke.
- **C2** webhook invoice Pakasir fail-closed: `provider_signature` null tidak lagi auto-pass; wajib server-to-server re-verify.
- **C3** konfirmasi tunai kiosk gated `requireEffectiveSubscription` (lifecycle tunggal).
- **C4** antrian offline IndexedDB survive reload (migrasi sekali-jalan).
- **H1** semua RPC aplikasi `revoke execute from public/anon/authenticated` + `grant to service_role` (migrasi `0065`).
- **H2** secret webhook per-credential wajib untuk order tenant; freshness window ±24 jam.
- **H3** idempotency state-aware (`received` → `processed`).
- **M1** route `/api/v1/business/:id/storage` tenant-scoped (404 cross-tenant).
- **M2** guard admin di lapisan route (`adminRoute`/`adminRawRoute`).

TIDAK SESUAI / tak terdokumentasi:

- `authorize()` callback Auth.js sebagaimana dibayangkan spec — implementasi nyata: `can()` + `getMembership()` per server function/route.
- Guard auth dashboard tetap via **layout server component** + per-action check. `src/proxy.ts` hanya meng-enforce maintenance mode global; tidak menggantikan RBAC route/action.
- Session = **JWT + DB revocation** (bukan database session penuh).
- Security headers (HSTS, X-Frame-Options, dsb.) terimplementasi tapi tidak terdokumentasi di sini.
- Bucket `public-assets` (public) dipakai (asset publik marketing/kiosk) — spec hanya menyebut bucket private.

## 9.1 Prinsip

- **Server-side authorization** — frontend route protection saja TIDAK cukup.
- **Tenant isolation** — semua query scoped `business_id`; cek membership user.
- **No secrets in client** — semua kredensial (Supabase service key, Pakasir secret) di env server.
- **Secure sessions** — Auth.js v5, cookie httpOnly/secure, session expiry & rotation.
- **RLS enabled on all tables; policy service_role-only** (migrasi 0064). Aplikasi hanya memakai `service_role` (`src/lib/supabase/server.ts`) yang bypass RLS, jadi scoping tetap di kode; RLS + revoke `anon`/`authenticated` = jaring terhadap PostgREST bila anon key bocor/dipakai. `anon` key tidak dipakai client.
- **Route guard wrapper** — `apiRoute` TIDAK ada auth (caller WAJIB guard: `requireUser`/`requireAdmin`/`getMembership`); `authRoute`/`authRawRoute` inject session user; `adminRoute`/`adminRawRoute` memanggil `requireAdmin()` di lapisan route.

## 9.2 RBAC Matrix

| Capability                      | OWNER | MANAGER |     STAFF      | ADMIN |
| ------------------------------- | :---: | :-----: | :------------: | :---: |
| Dashboard & revenue             |  ✅   |   ✅    |   ⚠️ subset    |  ✅   |
| Photobox / Outlet mgmt          |  ✅   |   ✅    | ⚠️ operasional |  ✅   |
| Templates / Packages / Vouchers |  ✅   |   ✅    |       ❌       |  ✅   |
| Transactions (view)             |  ✅   |   ✅    |    ⚠️ basic    |  ✅   |
| Full financial info             |  ✅   |   ✅    |       ❌       |  ✅   |
| Customers                       |  ✅   |   ✅    |       ⚠️       |  ✅   |
| Finance / Expenses              |  ✅   |   ✅    |       ❌       |  ✅   |
| Reports                         |  ✅   |   ✅    |       ❌       |  ✅   |
| Staff mgmt                      |  ✅   |   ❌    |       ❌       |  ✅   |
| Subscription / Billing          |  ✅   |   ❌    |       ❌       |  ✅   |
| Settings                        |  ✅   |   ❌    |       ❌       |  ✅   |
| Platform admin                  |  ❌   |   ❌    |       ❌       |  ✅   |

`⚠️` = subset terbatas (misal STAFF hanya melihat transaksi outlet sendiri, tanpa net profit).

Implementasi: helper `authorize(businessId, permission)` di server; return `403 FORBIDDEN` jika tidak memenuhi. Jangan hanya `if` di UI.

## 9.3 Tenant Isolation

- `business_members` menentukan user mana yang bisa akses business mana.
- Setiap query entity bisnis menambahkan `business_id = <current>`.
- Saat akses `:id` resource, verifikasi resource itu milik business user (bukan hanya cek format UUID) → return `404` (bukan `403`) untuk menghindari kebocoran keberadaan data.
- Workspace switching hanya ke business yang user menjadi member.

## 9.4 Authentication (Auth.js v5) — Rekomendasi Aman

**Rekomendasi (secure default): database session strategy.**

- Provider: `credentials` (email + password).
- Password hashing: **argon2id** (via `argon2`/`@node-rs/argon2`). Jangan bcrypt default lemah; set memory/iterations memadai.
- **Session strategy: `database`** (bukan JWT) — session tersimpan di DB (`sessions` table via adapter), sehingga **revocable**: logout/ubah password/admin force-logout langsung membatalkan sesi. Ini lebih aman untuk SaaS finansial multi-tenant.
- Adapter: `@auth/supabase-adapter` (atau Prisma/PG adapter) untuk menyimpan `users`, `accounts`, `sessions`, `verification_tokens` di Postgres.
- Session cookie: `httpOnly`, `secure`, `sameSite=lax`.
- **Session timeout:** absolute 30 hari max + idle timeout (opsional).
- **Login throttling & lockout:** rate-limit login (5/menit/IP), lockout sementara setelah N gagal (misal 5) per email.
- **Multi-device sign-out:** daftar & hapus session aktif (karena DB strategy).
- Middleware memproteksi route `(dashboard)` & `(admin)`.
- Future: OAuth Google opsional; 2FA (TOTP) di Phase 2.

Catatan tradeoff: DB strategy butuh query session tiap request (overhead kecil, bisa di-cache). JWT lebih cepat tapi tidak revocable. Untuk domain finansial, pilih **database session**.

## 9.5 Input Validation & Security Controls

- Validasi semua input (zod schema) di server.
- Rate limiting (login, public checkout, aktivasi device). Backend **shared**
  (Upstash Redis REST) bila `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
  di-set; fallback **in-memory** bila kosong. Fail-closed di production saat
  backend error; fail-open hanya di non-production. Interface
  `rateLimit(key, limit, windowMs)` async (`src/lib/rate-limit.ts`).
- CSRF protection untuk mutasi berbasis cookie (Next.js server actions sudah menangani sebagian; tambahkan token bila perlu).
- Sanitasi output (hindari XSS) — React escape default; hati-hati render HTML kustom.
- Parameterized queries (supabase-js) → hindari SQL injection.
- **Audit logging** untuk aksi finansial/admin (`audit_logs`): refund, ubah plan, hapus voucher, suspend business, dll.

### Device Activation Security

- `activation_codes` random + short-lived (~5 menit) + **sekali pakai** (`used_at`).
- `device_token` disimpan sebagai **hash** di server; device menyimpan token asli di `localStorage`.
- Setiap request device memverifikasi `device_token` + `photobox_id` + `business_id` (bukan hanya saat aktivasi).
- Owner bisa **revoke** device (status `revoked`) → request device ditolak.
- Rate limit endpoint aktivasi (cegah brute-force kode).

## 9.6 File Upload Security

- Validasi file type (allowlist PNG/JPG/WebP — **SVG DIHAPUS** dari allowlist logo; lihat Security Hardening).
- Validasi size (per plan `storage_limit_mb`, default cap per file misal 5MB).
- Validasi dimensi (opsional untuk template/logo).
- Rename file server-side (generate key acak) — jangan pakai nama asli user.
- Scan/strip metadata bila memungkinkan.
- **Guard path-traversal key** (`src/lib/r2/areas.ts` `r2Key`): key yang mengandung
  segmen `..` atau backslash ditolak (throw), mencegah key lolos dari prefix/bucket.
- **Allowlist id layar kiosk** (`KIOSK_PAGE_IDS` di `src/lib/validators.ts`):
  `page` yang dipakai sebagai segmen key upload per-layar
  (`kiosk-page-${page}`) wajib salah satu id enum; divalidasi di
  `uploadKioskPageVideo` (sink) dan `uploadKioskPageVideoAction`.

## 9.7 Storage (Supabase Storage + Cloudflare R2 — dual-storage Fase 3)

Semua akses storage lewat abstraksi `src/server/storage` (`getStorage`,
`getWriteStorage`, `resolveStorage`, `signedUrlMap`, `removeResolved`).
Business logic TIDAK menyentuh `supabase.storage` / S3Client langsung.

**Buckets (Supabase):**

- `business-assets` (private) — logo, template, sticker, event assets.
- `generated-photos` (private) — hasil foto (dengan retention).
- `public-assets` (public) — asset global platform (bila perlu).

**R2:** dua private bucket terpisah per area (`R2_BUCKET_BUSINESS_ASSETS`,
`R2_BUCKET_GENERATED_PHOTOS`) — lihat `src/lib/r2/areas.ts`. Key DB existing
dipakai apa adanya (relatif bucket, **bukan** URL, tanpa prefix area).

**Dual-storage (masa migrasi):**

- **Upload baru** → R2 bila env R2 lengkap (bucket per-area + kredensial +
  `R2_ACCOUNT_ID`/`R2_ENDPOINT`) dan `STORAGE_WRITE_PROVIDER` tak di-set;
  bila env R2 absen → otomatis turun ke Supabase (deploy tanpa R2 env TIDAK
  500). `STORAGE_WRITE_PROVIDER=r2|supabase` memaksa pilihan. Key TIDAK berubah.
- **Objek lama** di provider non-write. `resolveStorage(bucket,key)` memilih
  provider yang benar-benar menyimpan objek (`head()` + cache per-proses),
  sehingga signed URL & delete selalu menunjuk provider yang tepat. Fallback
  = **provider non-write**: write=R2 → Supabase; write=Supabase & R2
  terkonfigurasi → R2 (objek era R2 tidak stranded); write=Supabase & R2 absen
  → Supabase (single-provider). `resolveOutcome` membedakan `present` (hapus di
  provider itu), `absent` (kedua provider tegas tidak ada → aman), `unknown`
  (provider error → JANGAN hapus baris DB; retry), mencegah orphan media saat
  cron retention.
- **Usage accounting** (`storage-usage.ts`) menjumlahkan SEMUA provider
  terkonfigurasi (write + fallback, R2 bila dikonfigurasi).
- Tidak ada bucket public; baca tetap hanya via signed URL.

**Batasan (Phase berikutnya — direct-to-R2 upload):** upload server-action
dibatasi `serverActions.bodySizeLimit = "8mb"` (Next), sedangkan
`VIDEO_MAX_BYTES = 15 MB` dan `PHOTO_MAX_BYTES = 10 MB`. Validasi server-side
tidak dihapus, tetapi request >8 MB via server action ditolak Next **sebelum**
action jalan. Foto finalize lewat API route (`request.formData`) sehingga tidak
terkena batas ini. Bila perlu video/template >8 MB via server action, implement
**direct-to-R2 upload** (presigned PUT dari kiosk/dashboard) — Phase berikutnya.

**Access:** foto & asset pribadi diakses via **signed URL** (expiry pendek) atau token result. Tidak ada public URL permanen untuk foto pribadi.

## 9.8 Retention & Lifecycle

Configurable per business (`business_settings.retention_days`, default 3 hari, max 3 — migrasi 0034).

- **Session temporary files** — dibersihkan setelah sesi selesai/singkat.
- **Generated results** — dihapus setelah `retention_days` (job terjadwal / cron).
- **Event photos** — mengikuti retention event.
- Owner/Admin dapat mengubah konfigurasi retention sesuai subscription.

## 9.9 Webhook Security (Pakasir / Midtrans / Tripay)

- Validasi webhook **tidak** mengandalkan stored-signature matching sebagai gate tunggal. Handler memvalidasi dengan:
  (a) Parse payload — ekstrak `order_id`, `amount`, `status`, dan field relevan lainnya.
  (b) Verifikasi header `X-Secret` (Pakasir webhook secret v2, timing-safe) — fail-closed 401. Secret per-credential tenant; fallback ke `PAKASIR_WEBHOOK_SECRET` global **hanya** untuk order non-tenant (aggregator/invoice platform). Order tenant TANPA secret per-credential → 401 (tanpa fallback global).
  (c) Verifikasi jumlah — cocokkan `amount` dari payload dengan nilai di DB (`payments.final_amount` / `invoice_payments.amount`).
  (d) Untuk event `paid`: WAJIB **server-to-server status check** ke provider sebelum settlement. Signature webhook (Midtrans/Tripay, timing-safe HMAC) valid pun tetap di-re-verify. `provider_signature` null (Pakasir) **TIDAK** auto-pass.
- **Freshness (H2):** tolak webhook dengan `payment_date` di luar jendela ±24 jam (`isWebhookEventFresh`) — anti replay/clock-skew.
- **Idempotency state-aware (H3):** event dicatat `received` (non-authoritative) sebelum re-verify, dipromosikan `processed` HANYA setelah settlement sukses. Baris `received`/`error` TIDAK memblokir redelivery; `processed`/`ignored` memblokir (anti double-settle). Recovery polling (`qris.ts`, `invoice.ts`) tetap jaring terakhir.
- Log seluruh event (`payment_webhooks`) untuk audit.

## 9.9b RPC Privilege Lock (H1)

Semua fungsi aplikasi (RPC) di `db/schema.sql` di-lock `revoke execute from public, anon, authenticated` + `grant execute to service_role` (migrasi `0065_lock_priviledged_rpcs.sql`, idempoten). Fungsi trigger (`set_updated_at`, `tg_*`) dikecualikan — bukan RPC.

Yang di-lock: `pos_complete_payment`, `pos_decrement_stock` (insert `transactions`), `storage_account_add/sub`, dan RPC dashboard/finance/metrics (`dashboard_tx_summary`, `dashboard_daily_revenue`, `finance_expense_summary`, `revenue_breakdown`, `tx_insights_summary`, `metrics_*`, `staff_directory_today`, `customer_spending`, `operational_metrics`). RPC yang sudah ter-lock lebih dulu: `activate_device_atomically`, `settle_paid_payment_atomically`, `create_voucher_payment_atomically`, `exit_pin_register_failure`, `bootstrap_admin`.

## 9.10 Environment Variables (daftar minimal)

```
# Supabase
SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY
# Auth.js
AUTH_SECRET / AUTH_URL
# Pakasir (pakasir.com — https://pakasir.com/p/docs)
PAKASIR_API_KEY
PAKASIR_PROJECT_SLUG
PAKASIR_WEBHOOK_SECRET
PAKASIR_WEBHOOK_URL
PAKASIR_BASE_URL          # https://app.pakasir.com (default)
# Payment encryption (direct merchant)
PAYMENT_ENCRYPTION_KEY
# Storage (Fase 3: provider upload + R2)
STORAGE_WRITE_PROVIDER    # "r2" (default) | "supabase"
STORAGE_PROVIDER          # legacy; hanya "r2" dihormati sebagai write override
R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY
R2_BUCKET_BUSINESS_ASSETS / R2_BUCKET_GENERATED_PHOTOS  # bucket per area
R2_BUCKET                 # legacy/opsional: satu bucket fallback semua area
R2_ENDPOINT               # endpoint opsional (default turun dari account id)
# Rate limiting (backend shared opsional)
UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  # kosong = fallback in-memory
# Admin
ADMIN_EMAILS
# Cron retention
CRON_SECRET
```

Tidak ada satupun yang boleh di-import ke client component/bundle.

## 9.11 Cron Retention — Runbook Verifikasi (dev)

Cron harian `/api/cron/retention` (schedule `vercel.json`) butuh Bearer
`CRON_SECRET`; fail-closed di production. Verifikasi lokal:

```bash
# 1. .env.local: CRON_SECRET=<random> (openssl rand -hex 32). JANGAN commit secret asli.
npm run dev
# 2. Jalankan manual:
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/retention
# → 200 {"data":{"cleanedSessions":0,"removedObjects":0}}
```

Tanpa/`Authorization` salah → `401 {"error":{"code":"UNAUTHORIZED",...}}`.
`CRON_SECRET` kosong di production → `500` + log `[cron/retention] CRON_SECRET tidak diset`.

## 9.12 Security Hardening (audit 2026-10-09)

Sumber: audit keamanan 2026-10-09. Status: **fixed**, **documented-residual**, atau
**needs-decision**. Bukti = kode + test yang lulus.

### Temuan terkonfirmasi (fixed)

| ID | Severity | Temuan | Status | Bukti |
| --- | --- | --- | --- | --- |
| P0-1 | critical | `next` 16.3.3 rentan RCE `next/og` ImageResponse, SSRF Image Optimization, cache poisoning SSG/ISR, metadata dynamicParams bypass | **fixed** — `next` ^16.3.8 (terpasang 16.4.0) | `npm audit` (0 critical next) |
| P0-2 | high | `xlsx@0.18.5` prototype pollution + ReDoS (no-fix). Hanya dipakai **generate** (bukan parse input tak terpercaya) | **fixed** — diganti `exceljs@^4.4.0` di `src/server/reports.ts` | `tests/` + build |
| P1-a | high | Injeksi key storage via `page` kiosk → `kiosk-page-${page}` (`src/server/branding.ts:309`) | **fixed** — allowlist `KIOSK_PAGE_IDS` divalidasi di sink + action | `tests/phase3.test.ts` |
| P1-b | high | Path traversal key R2 | **fixed** — guard `..`/backslash di `r2Key` (`src/lib/r2/areas.ts`) | `tests/storage-abstraction.test.ts` |
| P1-c | medium (laten) | SVG lolos sebagai logo → XSS bila disajikan inline | **fixed** — SVG dihapus dari `LOGO_ALLOWED_TYPES` + `sniffImageType` | `tests/upload-magic.test.ts`, `tests/phase3.test.ts` |
| P2-a | medium | Rate limiter in-memory (hanya 1 instance) | **fixed** — backend shared Upstash opsional + fallback in-memory, fail-closed prod | `tests/rate-limit.test.ts` |
| P2-b | medium | Verifikasi secret webhook Pakasir | **sudah** `timingSafeEqual` + fail-closed; ditambah test eksplisit | `tests/pakasir-webhook-credential.test.ts` |

### Potensial / defense-in-depth (documented-residual)

- **Direct-webhook amount fallback** (`src/lib/direct-webhook.ts`): amount webhook
  diterima jika == `final_amount` ATAU == `total_amount` (Tripay menambahkan admin
  fee). Kedua nilai eksak, fail-closed selain itu; settlement tetap di-gate
  server-to-server re-verify. **Tidak ada perubahan logika uang.** Lihat §6.7.
- **Dependency transitive sisa (`npm audit`)**: `eslint-config-next`/`shadcn` →
  `fast-glob` → `micromatch` → `braces` (high, dev/build-time); `exceljs` → `uuid`
  (moderate, jalur `buf` yang tidak dipakai generation kita). Tidak ada jalur
  runtime yang terekspos; menunggu upstream.
- **Cron `*_CRON_OPEN`**: sudah fail-closed di production (dijaga `NODE_ENV`),
  hanya opt-in dev/test.

### Residual risk

- `next` terpasang via `^16.3.8` → resolve ke 16.4.0; advisory baru pasca-16.4.0
  harus ditinjau berkala (`npm audit`).
- Rate limit shared **memerlukan** env Upstash di production multi-instance;
  tanpa env, limiter per-instance (didokumentasikan, bukan bug).
