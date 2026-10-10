# SnapyOS — Ringkasan Komprehensif PRD (Pemetaan SaaS yang Akan Dibangun)

> Dokumen ini adalah **ringkasan analisis** dari seluruh isi folder `docs/` (README + 14 modul PRD). Bukan rencana eksekusi — hanya pemetaan produk. Source of truth tetap file PRD bernomor.

---

## 1. Apa itu SnapyOS

**SnapyOS** = SaaS **"Photobox Business Operating System"** — *"Shopify for Photobox Businesses"* untuk UMKM/pemilik bisnis photobox/photo booth Indonesia.

- **Tagline:** *"Build your own Photobox. Run your business in one place."*
- **Konsep kunci:** SnapyOS adalah **infrastruktur di balik brand owner**. Customer melihat brand owner (mis. "KLIK FOTO"), bukan merek SnapyOS.
- **Menggabungkan:** customer-facing photobox app, photo capture, template/frame, branding, package, online payment QRIS, voucher, transaksi, revenue dashboard, finance, customer management, multi-outlet, multi-photobox, staff, booking, event mode, reporting, subscription — satu sistem.
- **Masalah yang diselesaikan:** fragmentasi tool (photobooth software + spreadsheet + catatan manual + payment terpisah), tidak ada branding sendiri, pencatatan manual rentan error, tidak ada visibilitas revenue, payment offline, sulit scale multi-outlet.

### Prioritas produk (urutan)
1. Photobox Experience → 2. Business Dashboard → 3. Payment & Checkout → 4. Revenue Tracking → 5. Templates & Branding → 6. Voucher → 7. Transaction Management → 8. Multi Outlet → 9. Finance → 10. Operational Management

### Non-Goals (di luar scope)
Referral, loyalty points, marketing automation, email marketing, social media scheduler, template marketplace.

### Target & Persona
Target: pemilik baru, UMKM existing, multi-outlet owner, studio foto, photobox mall/kafe/kampus, wedding/birthday/graduation, event organizer/agency/brand activation.
Persona: (1) New Owner — takut teknis, butuh setup cepat; (2) Existing UMKM — masih spreadsheet; (3) Multi-Outlet Owner — butuh visibilitas & kontrol staff; (4) Event/Agency — butuh branding berbeda per event.

---

## 2. Tech Stack (keputusan final)

| Layer | Teknologi |
|---|---|
| Frontend | Next.js App Router, React, TypeScript, Tailwind CSS |
| UI | **shadcn/ui dikustomisasi Neo-Brutalism**, shadcn/ui Charts (Recharts wrapper), Lucide Icons |
| Backend | Next.js Route Handlers + Server Actions (satu repo, native) |
| Data | **Supabase** — PostgreSQL + Storage + Realtime; client `@supabase/supabase-js` **server-only (service-role)** |
| Auth | **Auth.js v5 (NextAuth)** — credential email/password, hashing **argon2id**, **database session (revocable)** — bukan JWT |
| Camera | MediaDevices API (`getUserMedia`), Canvas API |
| Payment | **Klik QRIS** (`klikqris.com`) — model aggregator, dana masuk akun utama SnapyOS |
| QR render | `qrcode` / `qrcode.react` |
| Export | CSV (native), XLSX (`exceljs`/`xlsx`), PDF (future) |
| Deploy | Vercel |
| Validasi | zod (semua input server-side) |

Uang **selalu integer IDR** — tidak ada floating-point.

---

## 3. Arsitektur & 4 Aplikasi dalam Satu Repo

### 3.1 Multi-tenancy
- **Business = tenant.** Semua entity bisnis punya `business_id`, kecuali entity global (`users`, `plans`, `template_categories`, `platform_settings`).
- Service-role key bypass RLS Supabase → **tenant scoping wajib di-enforce di kode** via helper `getScopedClient(userId)`.
- Isolasi server-side: setiap query scoped `business_id` + cek membership user (`business_members`).
- Akses lintas tenant → return **404** (bukan 403) agar tidak bocor keberadaan data.

### 3.2 Hierarki entity kunci
```
Business ─┬─ Outlet ── Photobox ── Session ── Transaction ── Payment
          ├─ Package ── PackageTemplate ── Template
          ├─ Voucher ── VoucherUsage
          ├─ Customer ── Booking
          ├─ Expense / Event
          ├─ Staff (business_members)
          ├─ Balance ── BalanceLedger ── Withdrawal
          └─ Subscription ── Plan (+ Add-ons)
```
- `transactions` = **source of truth** seluruh financial reporting.
- `payments` = detail settlement provider.

### 3.3 Empat area aplikasi (route groups)
1. **`(marketing)`** — landing page publik (hero "BUILD YOUR OWN PHOTOBOX", sections: Problem → Solution → How it works → Customer experience → Dashboard → Analytics → Multi-outlet → Payment → Voucher → Pricing → FAQ → CTA).
2. **`(auth)`** — login/register.
3. **`(dashboard)`** — Owner Platform (protected, tenant-scoped).
4. **`(admin)`** — SnapyOS Admin Platform (role `admin`).
5. **`p/[businessSlug]/[photoboxSlug]`** — Customer Photobox public app (tanpa login, kiosk).

---

## 4. Aplikasi 1 — Customer Photobox (tanpa login, kiosk-first) — **REVISI v2: PAY-FIRST**

> **Keputusan revisi (confirmed):** alur dibalik — bayar SEBELUM sesi foto. Package tetap penentu harga & jumlah foto. Timer per photobox, mulai saat PAID, timeout post-paid = auto-finalize. GIF slideshow di result online. Email = future/out of scope.

**Target platform:** Chrome kiosk mode (`--kiosk --kiosk-printing`) di mini PC + USB webcam (min 720p ideal 1080p).

### Device Activation & Setup (pairing) — dilakukan SEKALI, tersembunyi dari customer
- Device buka URL photobox → layar aktivasi (belum aktif).
- Owner dari dashboard generate **kode aktivasi sekali pakai + QR** (expire ~5 menit).
- Device masukkan kode / scan QR → server terbitkan **device_token persisten** (hash di server, token asli di localStorage) → **Setup Wizard sekali**: grant permission kamera (persistent di Chrome kiosk), pilih kamera, print test, konfirmasi printer default OS.
- Setelah setup: **TIDAK ADA lagi UI permission/settings di flow customer** — customer & alur kiosk tidak pernah melihat hal teknis. Dashboard owner hanya melihat `device_status` + tombol "ulangi setup" (revoke → re-pair).
- Token valid sampai di-revoke. Setiap request device diverifikasi (token + photobox + business). Rate-limit anti brute-force.

### Alur customer v2 (PAY-FIRST)
```
[SETUP SEKALI: permission kamera+printer, tersembunyi]
WELCOME (branding custom owner)
  → [ MULAI ] → PILIH PACKAGE (harga, jumlah foto, print_count)
  → CHECKOUT: voucher (opsional) → BAYAR QRIS → tunggu paid
  → [TIMER MULAI saat webhook PAID]
  → PILIH FRAME/TEMPLATE (hanya template milik package)
  → SESI FOTO per slot (jumlah = photo_count package):
       countdown → capture → review → RETAKE (unlimited, dibatasi timer) / LANJUT
  → EDIT: zoom, posisi/pan, filter, penyesuaian lain
  → [ SELESAI ] → AUTO-PRINT (trigger otomatis sesuai print_settings + print_count)
  → RESULT KIOSK: QR CODE → halaman result online
  → ONLINE RESULT: unduh GIF animasi slideshow + foto berframe
  → (future: kirim ke email — OUT OF SCOPE sekarang)
```

### Timer sesi (baru)
- Durasi **config per photobox**: `photoboxes.session_settings.jsonb` → `{ timer_seconds: 300, warning_seconds: 60, max_retakes: null }` (default 5 menit; owner atur di dashboard).
- Mulai saat **payment paid** (waktu menunggu QRIS tidak dihitung).
- UI kiosk: countdown terlihat + warning di sisa waktu terakhir.
- **Server-side enforcement**: `sessions.expires_at` di-set saat session create (post-paid); semua API sesi cek expiry → error `SESSION_EXPIRED` (kode error baru). Client countdown = UX saja.
- Habis SEBELUM bayar → reset ke welcome, checkout_session expired, tidak reuse (bayar baru = attempt baru).
- Habis SETELAH bayar → **AUTO-FINALIZE**: pakai foto terakhir ter-capture (skip edit yang belum selesai) → tetap print + QR result. Customer sudah bayar = tetap dapat produk.
- Sesi one-shot: setelah finalize/timeout kiosk kembali ke welcome, tidak bisa diulang.
- Edge case terbuka untuk implementasi: timeout post-paid dengan **0 foto ter-capture** → result page pesan "sesi berakhir" + penanganan manual owner (kompenasi/re-entry via dashboard).

### Konsekuensi pay-first ke arsitektur
- Foto baru di-upload **setelah paid** → hemat storage, tidak ada foto tanpa bayar, `result_token` di-issue saat paid.
- Payment failed/expired → sesi tidak pernah dibuat → state machine lebih sederhana.
- `POST /public/:slug/sessions` kini **mensyaratkan checkout_session berstatus paid** (pembalikan dari PRD lama).
- Retake unlimited (tetap dicatat `retake_count`); `max_retakes` opsional via config.
- Editor: zoom, pan/posisi, filter (Original/Film/Warm/Cool/B&W/Retro/Vintage/Y2K), adjust brightness/contrast/saturation — Canvas API. Sticker/text tool tetap tersedia sesuai PRD.

### Printing (auto-trigger)
- Saat customer tekan [SELESAI] (atau auto-finalize) → render layout canvas → `window.print()` otomatis (Chrome kiosk `--kiosk-printing`), jumlah sesuai `package.print_count` + `print_settings`.
- Print test hanya di device setup wizard & dashboard owner — bukan di flow customer.

### Result online & GIF (baru)
- High-quality result hanya via `result_token` (issue saat paid).
- QR di kiosk → halaman result online: **unduh GIF animasi slideshow** (semua foto berframe bergantian) + **unduh foto berframe statis**.
- GIF digenerate **server-side saat finalize**, disimpan di bucket `generated-photos` (key di `sessions.result_gif_key`).
- Signed link + `expires_at`; retention per business (default 7 hari).
- Kirim ke email: **future, jangan diproses** (cukup placeholder slot UI di result page bila dimau).

---

## 5. Aplikasi 2 — Owner Platform (dashboard, login)

Layout: sidebar (14 item) + topbar (search, notifikasi, workspace switcher, user menu). Modul:

| Modul | Inti |
|---|---|
| **Dashboard** | Metric cards: Revenue Today/Month, Gross, Net, Sessions, Paid Tx, Customers, Avg Transaction, Active Booth/Outlet. Aggregate server-side (SQL) |
| **Revenue Analytics** | Chart (shadcn/ui Charts) + filter tanggal + breakdown by day/outlet/package/photobox/payment-method |
| **Business Metrics** | Revenue, transactions by status, sessions (retakes, duration), customers new/returning, per-booth performa |
| **Finance** | Income (dari transactions) vs Expenses (CRUD manual, 10 kategori) → Estimated Profit + margin. Plus **Saldo & Penarikan** (lihat §7) |
| **Transactions** | DataTable lengkap: filter (date/outlet/booth/package/method/status), search, detail dialog; catat manual cash/transfer |
| **Photobox** | CRUD, status online/offline/maintenance, **`session_settings` (timer sesi, warning, max retake)**, device status + tombol ulangi setup (permission kamera/printer hidup di setup wizard device, bukan di flow customer), kode/QR aktivasi, devices list + revoke, cek limit plan |
| **Outlets** | CRUD multi-outlet, assign booth/staff, outlet analytics |
| **Photobox Builder (Branding)** | Logo, warna, background, typography, welcome title/tagline + live preview → tersimpan `business_settings.branding` jsonb |
| **Packages** | CRUD: nama, harga IDR, photo_count, print_count, digital_output, capture_mode, assign templates/outlets/booths |
| **Templates** | Upload frame sendiri (PNG/SVG transparan dari Canva/Figma), kategorisasi (Minimal/Cute/Retro/Y2K/Wedding/Birthday/Graduation/Event/Custom), assign ke package. MVP = upload; Phase 2 = builder in-app |
| **Vouchers** | CRUD: percentage/fixed, periode, usage limit (total & per customer), min transaction, max discount, eligibility package/outlet + voucher analytics (usage, total discount, revenue generated) |
| **Customers** | List + detail (riwayat transaksi/sesi/booking, total spending). Minimal data pribadi |
| **Staff (RBAC)** | Invite, ubah role, hapus. Roles: OWNER / MANAGER / STAFF |
| **Bookings** | Booking sederhana customer (public POST) + kelola status owner |
| **Event Mode** | Event CRUD + `event_code` → customer app `?event=<code>` override branding/template |
| **Reports** | Daily/Weekly/Monthly/Revenue/Transactions/Outlet/Photobox/Expenses/Voucher → export CSV/XLSX (PDF future) |
| **Settings** | Business profile, branding, payment, staff, danger zone |
| **Subscription** | Plan saat ini, usage vs limit, invoice history, upgrade/downgrade/cancel, beli add-on sesi |
| **Bantuan** | Help Center: sidebar artikel + accordion FAQ + search; konten MDX di repo (bukan CMS); public `/bantuan` + dari dashboard |

**Workspace switching:** user bisa punya banyak business; `activeBusinessId` di cookie/session; switch hanya ke business tempat user member.

---

## 6. Business Model & Subscription

### Plans (default seed, semuanya configurable via admin — bukan hardcode)
| Plan | Harga | Target | Limit |
|---|---|---|---|
| **STARTER** | Rp99.000/bln | New owner | 1 outlet, 1 booth, 1 sesi konkuren, basic template/branding, transaksi & revenue |
| **GROWTH** | Rp249.000/bln | Growing UMKM | multi booth/outlet, custom branding, advanced templates, customer mgmt, analytics, reports, voucher, finance |
| **BUSINESS** | Rp499.000+/bln | Multi-outlet/agency | staff mgmt, advanced analytics/reports, custom domain, white-label, event advanced |

### Kunci billing: sesi konkuren
- Default 1 sesi aktif bersamaan (1 booth jalan).
- Enforced **server-side**: `POST /sessions` hitung sesi `active`; ≥ limit → `SESSION_LIMIT_REACHED`.
- **Add-on +1 Sesi (Rp49.000/bln)** — add_ons + subscription_add_ons; limit efektif = plan + sum add-on aktif.

### Lifecycle & enforcement
- Status: `trial → active → past_due → cancelled/expired`.
- MVP renewal: **manual QRIS invoice** per periode (auto-debit future).
- Semua limit (outlet/booth/staff/storage/sesi) & feature flags (`features` jsonb: voucher, finance, reports, custom_domain, white_label, staff, event_mode, booking, qr_delivery, dll) dicek server-side → `PLAN_LIMIT_REACHED` / `FEATURE_DISABLED`.

### Platform fee
- Configurable per plan (`platform_fee_percent` + `platform_fee_flat`, default 0) — dipotong saat kredit saldo owner.

---

## 7. Payment — Klik QRIS (aggregator) & Settlement

### Model dana aggregator
```
Customer bayar QRIS → dana masuk AKUN UTAMA SnapyOS (In-House QRIS)
→ webhook PAID → Payment(paid) + Transaction(paid)
→ kredit Balance owner (final_amount − platform fee)
→ owner request Withdrawal (pending)
→ admin proses transfer → paid → rekening owner
```

### Integrasi Klik QRIS
- Auth header: `x-api-key` + `id_merchant`. Base: prod `/api`, sandbox `/api/sandbox`.
- `POST /qris/create` → response penting: `amount_uniq` (kode unik), **`total_amount` (= amount + uniq — WAJIB ditampilkan ke pembeli)**, `qris_url`/`qris_image`, `expired_at`, `signature` (simpan untuk validasi webhook).
- `GET /qris/status/{order_id}`, `GET /qris/history`, Snap overlay (Phase 2).
- `PaymentService` abstraction (interface createQris/getStatus/verifyWebhook/refund) + `KlikQRISProvider` — provider-agnostic, sandbox URL diisolasi env.

### Webhook & keamanan pembayaran
- Endpoint: `POST /api/webhooks/payment/klik-qris`, harus balas HTTP 200.
- Validasi: `signature` payload == `payments.provider_signature` (bukan HMAC terpisah), `order_id` cocok, `total_amount` cocok.
- **Idempotent**: payment sudah `paid` → return 200 tanpa transaksi baru. Log semua event di `payment_webhooks`.
- State machine: `pending → paid/expired/failed/cancelled`, `paid → refunded`. `paid` tidak bisa mundur.
- Backend selalu **source of truth harga**: final = package_price − voucher discount, dihitung & diverifikasi ulang server-side; frontend tidak pernah dipercaya.
- Recovery: status payment bisa dipulihkan via reference saat reload/disconnect (`GET /payments/:ref/status`).
- Method lain: `cash`, `bank_transfer`, `other` (dicatat manual owner).

### Saldo & Penarikan (withdrawal)
- `balances` per business: available / pending / lifetime_earned / lifetime_withdrawn.
- `balance_ledger`: setiap mutasi (credit/debit) dengan `balance_after` snapshot.
- Flow penarikan: validasi (≤ available, ≥ min Rp10.000, rekening lengkap) → withdrawal `pending` + debit ledger → admin `processing` → `paid` (input reference) atau `rejected`/`failed` (saldo kembali). Semua di `audit_logs`.

---

## 8. Database Schema (PostgreSQL/Supabase)

~30 tabel, PK `uuid` (`gen_random_uuid()`), uang integer IDR, semua entity bisnis scoped `business_id`:

- **Global/Auth:** `users` (role user/admin), `accounts`/`sessions`/`verification_tokens` (Auth.js DB adapter)
- **Tenant & Subscription:** `businesses` (slug untuk URL public), `business_members` (owner/manager/staff), `business_settings` (branding/camera/checkout jsonb, retention_days), `plans`, `subscriptions`, `invoices`, `add_ons`, `subscription_add_ons`
- **Operasional:** `outlets`, `photoboxes` (slug per business, camera_settings/print_settings/device_status jsonb), `devices`, `activation_codes`, `packages`, `package_templates`/`package_outlets`/`package_photoboxes`, `templates` (business_id nullable = template global platform), `template_categories`, `stickers`
- **Session & Foto:** `sessions` (+ revisi v2: `expires_at` timer, `finalized_at`, `result_gif_key`, status `expired`), `photos`; `photoboxes` + `session_settings jsonb` (`timer_seconds`, `warning_seconds`, `max_retakes`)
- **Transaksi & Payment:** `transactions` (source of truth), `payments` (order_id, amount_uniq, total_amount, provider_signature, status), `payment_providers`, `payment_webhooks` (event_id unique = idempotency), `checkout_sessions` (result_token)
- **People:** `customers`, `bookings`, `expenses`
- **Voucher:** `vouchers` (unique per business+code), `voucher_packages`, `voucher_outlets`, `voucher_usages`
- **Event:** `events` (event_code unique), `event_templates`
- **Admin/Platform:** `platform_settings`, `reports`, `audit_logs`
- **Settlement:** `balances`, `balance_ledger`, `withdrawals`
- Index rekomendasi pada `(business_id, status/date/outlet)`, unique `(provider, payment_reference)`.

---

## 9. API Specification

- Base `/api/v1`, envelope `{ data }` / `{ error: { code, message, details } }`, 17 kode error standar (`UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `PLAN_LIMIT_REACHED`, `SESSION_LIMIT_REACHED`, `FEATURE_DISABLED`, `VOUCHER_*`, `PAYMENT_*`, **`SESSION_EXPIRED` (baru v2: timer sesi habis)**, `RATE_LIMITED`, `INTERNAL`).
- Pagination `page`/`limit` (default 20 max 100) + `meta`.
- **Grup endpoint:**
  - Auth: register, `[...nextauth]`, session, logout
  - Business/workspace: `me/businesses`, CRUD business + settings + branding
  - Dashboard/analytics: dashboard, revenue + 4 breakdown, metrics
  - Outlets/Photoboxes: CRUD + activation code + devices + revoke
  - Packages/Templates/Stickers: CRUD + upload multipart
  - Vouchers: CRUD + analytics
  - Transactions/Finance/Reports: list/filter/detail/manual-create, expenses CRUD, finance summary, export
  - Customers/Bookings, Staff, Events
  - Subscription: status+usage, plans, upgrade/cancel, invoices, addons
  - Balance/Withdrawals: balance, ledger, create/list withdrawal
  - **Public** (`/public/:businessSlug/...`): config, packages, templates, stickers, devices activate/verify, checkout, apply-voucher, **payments/qris (SEBELUM sesi — pay-first)**, payments status, `sessions` (syarat: checkout_session **paid**; semua endpoint sesi cek `expires_at`), `POST /sessions/:id/finalize` (customer selesai / auto-finalize), results/:resultToken (sertakan GIF + foto berframe)
  - Webhook: `/api/webhooks/payment/klik-qris`
  - Admin (`/admin`): overview (MRR dll), users, businesses, plans, subscriptions, templates, payments + summary, withdrawals process/reject, settings
- Rate limiting: login ketat (5/mnt/IP), public checkout/voucher moderate (30/mnt), webhook via signature+idempotency.

---

## 10. Security & RBAC

- Server-side authorization wajib (helper `authorize(businessId, permission)`); proteksi route frontend saja tidak cukup.
- **RBAC matrix:** OWNER (full) / MANAGER (operasional+finance, tanpa staff/billing/settings) / STAFF (subset operasional, TANPA full financial) / ADMIN (platform).
- Auth.js v5: argon2id, **database session** (revocable, httpOnly/secure/sameSite=lax), absolute timeout 30 hari, login throttling + lockout, multi-device sign-out. OAuth Google & 2FA TOTP = Phase 2.
- Upload security: allowlist tipe (PNG/JPG/WebP/SVG), size cap per plan, rename server-side random key.
- Storage buckets: `business-assets` (private), `generated-photos` (private + retention default 7 hari, cron cleanup), `public-assets`. Akses via signed URL pendek / result token — tidak ada public URL permanen untuk foto.
- Audit log semua aksi finansial/admin.
- Env vars minimal: `SUPABASE_*`, `AUTH_SECRET/URL`, `KLIK_QRIS_*` (api key, merchant id, base/sandbox URL, webhook URL), `ADMIN_EMAILS` — tidak boleh masuk client bundle.

---

## 11. Design System — Full Neo-Brutalism (wajib seluruh aplikasi)

- **Wajib di:** landing, login/register, dashboard, tables, forms, charts, customer photobox, editor, checkout, result — semua.
- **Dilarang tampak seperti:** generic Tailwind dashboard, AI SaaS template, Linear/Stripe/Notion clone.
- **Visual:** border tebal 2–4px `#111111`, hard offset shadow `4px 4px 0 #111111` (no blur), flat, radius 0–4px, high contrast, chunky buttons, bold typography.
- **Tokens:** bg off-white kertas `#FFFDF5`, ink `#111111`, accents kuning `#FFD400` / pink `#FF5C8A` / hijau `#38D9A9` / biru `#4D6BFF` — **satu accent dominan per halaman** (color consistency lock).
- **Font:** display bold Archivo Black / Space Grotesk (heading, uppercase, tracking tight, leading 0.85–0.95) + Inter/IBM Plex Sans (body) + Space Mono/JetBrains Mono (angka, ID transaksi, metadata).
- shadcn/ui = foundation, Neo-Brutalism = identity (override variabel, jangan pakai default). Chart wajib shadcn/ui Charts.
- **Anti-slop rules (doc 13):** no AI-purple gradient, no glassmorphism, no 3 equal cards, hero muat viewport, nav ≤ 80px, bento grid tanpa cell kosong, max 2 zigzag split berurutan, max 1 eyebrow per 3 section, loading = skeleton matching layout, empty = composed + CTA, error = inline, `:active` tactile translate, CTA ≤ 3 kata tidak wrap, WCAG AA, copy audit, no `// TODO`/placeholder (full-output-enforcement).
- **Skill wajib di-load sebelum development frontend:** `design-taste-frontend`, `industrial-brutalist-ui`, `full-output-enforcement`, `high-end-visual-design` (bagian non-konflik). Prioritas konflik: PRD SnapyOS menang (hard shadow & thick border wajib, radius 0–4px, Lucide wajib).
- Customer app: Neo-Brutalism lebih **playful**, kamera = prioritas, capture button besar, "jangan seperti admin dashboard".
- Responsive: dashboard desktop-first; customer app mobile/tablet/desktop. A11y: WCAG AA, keyboard nav, focus visible, semantic HTML.

---

## 12. Admin Platform (SnapyOS)

- Metrics: total businesses, active subscribers, MRR, outlets, booths, sessions, transactions.
- Modul: Users (suspend/role), Businesses (suspend/reactivate — business suspended tidak bisa sesi/checkout baru), Plans (harga/cycle/limits/feature flags/platform fee), Add-ons, Subscriptions, Templates & kategori global, Platform settings (`platform_fee`, `default_retention_days`, `trial_days` 14, `maintenance_mode`, `min_withdrawal_amount`).
- Payment monitoring: volume, success/fail/pending/expired/refund, breakdown provider, gross/fee/net.
- Payout/withdrawal monitoring: proses (pending → processing → paid + reference) / reject (saldo kembali). Semua ter-audit.
- Akses: hanya `role=admin` / `ADMIN_EMAILS`.

---

## 13. Roadmap — Phase 0–11

| Phase | Isi | AC kunci |
|---|---|---|
| 0 Foundation | Next.js+TS+Tailwind+shadcn (tokens NB), Supabase client, Auth config, env, CI, migrasi awal + seed 3 plan | dev jalan, lint/typecheck hijau |
| 1 Auth + Multi-tenant | register/login/logout, business CRUD, workspace switching, tenant isolation aktif | AC 1–3 |
| 2 Owner Dashboard | metric cards, revenue chart, filter | AC 35–38 |
| 3 Photobox Builder | outlet/photobox CRUD, branding + preview, limit plan | AC 4–6 |
| 4 Customer Photobox | device activation **+ setup wizard (permission kamera/printer sekali)**, welcome→package→**bayar**→frame→capture→editor, camera detection pindah ke setup, **timer sesi + auto-finalize**, **auto-print**, GIF result | AC 10–18, 56 (revisi urutan) |
| 5 Checkout + Voucher | checkout session **sebelum sesi foto (pay-first)**, validasi voucher server-side, final amount backend | AC 19–23 |
| 6 Klik QRIS Payment | PaymentService, QR, webhook+signature+idempotency, recovery | AC 24–30 |
| 7 Transactions + Finance | auto-create transaction, list/filter, manual cash, expenses, profit | AC 34, 39–41 |
| 8 Reports + Analytics | breakdown, metrics, export CSV/XLSX | AC 43–44, 49 |
| 9 Staff + Multi-Outlet | RBAC enforcement, outlet analytics | AC 47 |
| 10 Subscription | plan/upgrade/cancel/invoice, limit & feature gate global | AC 45 |
| 11 Polish + Security | audit log, rate limit, a11y, retention job, e2e, performance | AC 48–57, siap produksi |

**MVP scope** = Owner (auth→finance→saldo/withdrawal→bantuan→subscription), Customer (activation→result→QR delivery), Admin (users/businesses/plans/subscriptions/templates/analytics), Payment (QRIS end-to-end + settlement + withdrawal).
**Phase 2:** booking, event mode, custom domain, white-label, printer native ESC-POS, template builder in-app. **Phase 3:** AI, hardware monitoring, public API, enterprise.

**57 Acceptance Criteria MVP** + **Definition of Done global 10 poin** (spec-compliant, server-side authz, backend source of truth, 3 UI states, Neo-Brutalism konsisten, responsive+a11y, test hijau, lint/typecheck hijau, no client secret, audit log).

**Testing strategy:** unit (harga/voucher/profit/RBAC/canvas), integration (webhook→payment→transaction idempotency, plan limit, tenant isolation), e2e (owner onboarding & customer flow dengan payment mock), security (signature, lintas tenant, secret scan, upload), a11y.

---

## 14. Peta Ketergantungan Build (ringkas)

1. **Fondasi wajib duluan:** Auth DB-session + tenant scoping helper → semua modul lain bergantung ini.
2. **Tulang punggung finansial:** checkout_session → payment (Klik QRIS) → webhook idempotent → transaction → balance/ledger → withdrawal. Semua report/analytics baca dari sini.
3. **Customer app butuh (v2 pay-first):** device activation + setup wizard → package config → payment QRIS → frame/template → session (ber expiry) → finalize → auto-print + GIF result. Payment (no. 2) jadi prasyarat sesi, bukan sesudahnya.
4. **Subscription enforcement** menyentuh semua endpoint pembuatan resource (outlet/booth/staff/sesi) — helper limit/feature flag terpusat.
5. **Design system Neo-Brutalism** diterapkan sejak Phase 0 (tokens + base components) agar tidak retrofit.
6. **Skill anti-slop** (doc 13) di-load sebelum menulis kode frontend apa pun.

## 15. Catatan Konsistensi / Risiko Dokumen

- **REVISI v2 (confirmed user):** alur customer = pay-first (package → bayar → frame → foto → edit → auto-print → QR result + GIF). PRD doc 05/06 (urutan lama foto-dulu-bayar) **kalah vs revisi ini** — doc 05 §5.1, §5.3–5.4, §5.8, §5.13, doc 06 urutan checkout perlu ditulis ulang saat implementasi. Keputusan: package penentu harga/jumlah foto; timer per photobox mulai saat paid; timeout post-paid = auto-finalize (0 foto = edge case manual); GIF slideshow server-side; email = out of scope; setup permission kamera/printer sekali di device pairing, hidden dari customer.
- Aturan konflik antar file: **file bernomor lebih rendah menang**; entity/enum/endpoint mengikuti doc 07 & 08.
- `staff_roles` (doc 04) sudah disederhanakan menjadi `business_members` (doc 07) — pakai yang terakhir.
- Harga plan = placeholder seed, harus dibaca dari table `plans` (jangan hardcode).
- `total_amount` Klik QRIS (amount + kode unik) ≠ `final_amount` internal — hati-hati di UI & rekonsiliasi.
- Print detection & printer status = keterbatasan web (manual confirm), camera error handling = dokumen paling detail (doc 05 §5.5).

---

# BAGIAN B — PRD SYNC v1.1 (task list eksekusi untuk implementation agent)

> Tujuan: sinkronkan seluruh `docs/` PRD ke alur customer v2 pay-first. User sudah memutuskan semua keputusan desain (lihat §15). Eksekusi berurutan B1→B10, lalu validasi B11. Edit harus EXACT sesuai spesifikasi di bawah.

## B1. `docs/README.md` — catatan versi

Ganti baris:
```
- Versi: 1.0 (draft baseline — source of truth selama development)
```
menjadi:
```
- Versi: **1.1 — revisi alur customer PAY-FIRST**: pilih package → bayar QRIS → pilih frame → sesi foto → edit → finalize → auto-print → QR result online (unduh GIF + foto berframe) + timer sesi per photobox + setup kamera/printer sekali di device pairing (tersembunyi dari customer). Acuan urutan: `05-customer-photobox.md` & `06-checkout-payment.md` — urutan lama (foto dulu baru bayar) di file lain dikalahkan revisi ini (override aturan "file bernomor rendah menang" khusus urutan alur customer).
- Versi 1.0 (draft baseline — source of truth selama development)
```

## B2. `docs/01-product-overview.md` — 2 edit

**Edit A** (goal #2):
- OLD: `| 2 | Customer bisa mengambil foto & membayar via QRIS tanpa login | alur mulus, kamera-first |`
- NEW: `| 2 | Customer bisa membayar via QRIS lalu mengambil foto tanpa login | alur mulus pay-first: pilih package → bayar → foto |`

**Edit B** (ganti blok 6 baris customer stories):
- OLD:
```
- Sebagai customer, saya bisa memilih template & mengambil foto dengan kamera.
- Sebagai customer, saya bisa retake & edit foto (filter, stiker, teks).
- Sebagai customer, saya bisa masuk checkout, memasukkan voucher, dan membayar dengan QRIS.
- Sebagai customer, saya bisa melihat status pembayaran & menerima hasil foto.
- Sebagai customer, saya bisa mendownload / membagikan hasil via QR/tautan.
```
- NEW:
```
- Sebagai customer, saya bisa memasukkan voucher dan membayar via QRIS SEBELUM sesi foto (pay-first).
- Sebagai customer, setelah pembayaran berhasil saya bisa memilih frame/template sesuai package.
- Sebagai customer, saya bisa mengambil foto sesuai jumlah frame, dengan retake (dibatasi timer sesi).
- Sebagai customer, saya bisa mengedit foto (zoom, posisi, filter, stiker, teks).
- Sebagai customer, setelah selesai hasil foto otomatis diprint dan saya mendapat QR ke halaman result online.
- Sebagai customer, saya bisa mengunduh GIF animasi & foto berframe dari halaman result online.
```
(baris pertama blok lama — "membuka Photobox brand… memilih package" — dipertahankan.)

## B3. `docs/03-architecture.md` — 3 edit

**Edit A** (§3.3):
- OLD:
```
**Customer Photobox App** (public, tanpa login):
Welcome → Package → Template → Camera → Capture → Review/Retake → Edit → Checkout → Voucher → QRIS → Result → QR/Download/Share
```
- NEW:
```
**Customer Photobox App** (public, tanpa login — **v2 pay-first**):
(Setup device sekali: permission kamera/printer, §5.0.1 doc 05) → Welcome → Package → Checkout → Voucher → QRIS → **PAID** (timer mulai) → Template/Frame → Camera → Capture → Review/Retake → Edit → Finalize → Auto-Print → QR Result → Online Result (unduh GIF + foto berframe)
```

**Edit B** (§3.4 customer journey):
- OLD: `Open Photobox → Welcome → Pilih package → Pilih template → Camera permission → Countdown → Capture → Review → Retake/Continue → Edit → Checkout → Apply voucher → Pay QRIS → Verify → Generate result → QR/Download/Share.`
- NEW: `Open Photobox → Welcome → Pilih package → Checkout → Apply voucher → Pay QRIS → Verify (PAID, timer mulai) → Pilih template/frame → Countdown → Capture → Review → Retake/Continue → Edit → Finalize → Auto-print → QR result online (GIF + foto berframe). Timeout: pre-paid → reset Welcome; post-paid → auto-finalize (tetap print + result).`

**Edit C** (§3.4 business flow):
- OLD: `Transaksi: Session → Checkout → Voucher → Payment → Transaction.`
- NEW: `Transaksi (v2 pay-first): Checkout → Voucher → Payment (paid) → Session → Finalize → Transaction.`

## B4. `docs/04-owner-dashboard.md` — 2 edit

**Edit A** (§4.6 Fields):
- OLD: `**Fields:** Name, Slug, Outlet, Status, Camera, Printer, Display, Default template, Available packages.`
- NEW: `**Fields:** Name, Slug, Outlet, Status, Camera, Printer, Display, Default template, Available packages, Session settings (timer sesi — lihat §4.6.1).`

**Edit B** (§4.6.1 — tambah 2 bullet setelah bullet `[ TAMPILKAN KODE/QR ]`):
```
- **Session settings** (`session_settings`): `timer_seconds` (default 300), `warning_seconds` (default 60), `max_retakes` (null = unlimited). Timer mulai saat payment paid; timeout post-paid → auto-finalize (`05-customer-photobox.md` §5.1b).
- **Setup wizard (v2):** permission kamera/printer, pemilihan kamera, dan print test dilakukan **sekali saat device pairing** (`05-customer-photobox.md` §5.0.1) — tidak muncul di flow customer. Halaman detail photobox menampilkan `device_status` + tombol **[ ULANGI SETUP ]** (revoke → re-pair).
```

## B5. `docs/06-checkout-payment.md` — 2 edit

**Edit A** (§6.3 — tambah setelah baris `5. Render QR dari \`qris_url\`/\`qris_image\`.`):
```

> **v2 pay-first:** checkout & payment terjadi **sebelum sesi foto**. Setelah webhook `paid` → `transactions.paid` + sesi boleh dibuat (`POST /public/:slug/sessions` syarat checkout_session **paid**) + timer sesi mulai + `result_token` di-issue. Foto baru di-upload setelah paid.
```

**Edit B** (§6.7 langkah 10):
- OLD: `10. Unlock final result`
- NEW: `10. Unlock sesi foto (pay-first) + issue \`result_token\``

## B6. `docs/07-database-schema.md` — 2 edit

**Edit A** (tabel `sessions` — ganti blok):
- OLD:
```
| status | text | `active`/`completed`/`cancelled` |
| retake_count | integer | default 0 |
| started_at | timestamptz | |
| completed_at | timestamptz | |
| created_at | timestamptz | |
```
- NEW:
```
| status | text | `active`/`completed`/`cancelled`/`expired` (v2: timer habis) |
| retake_count | integer | default 0 (retake unlimited dibatasi timer; `max_retakes` opsional) |
| started_at | timestamptz | |
| completed_at | timestamptz | |
| expires_at | timestamptz | v2 pay-first: timer sesi — di-set saat session dibuat (post-paid) |
| finalized_at | timestamptz | v2: saat customer finalize / auto-finalize timeout |
| result_gif_key | text | nullable — GIF slideshow hasil sesi (storage key) |
| created_at | timestamptz | |
```

**Edit B** (tabel `photoboxes` — insert setelah baris `print_settings`):
```
| session_settings | jsonb | nullable (v2: `{ timer_seconds: 300, warning_seconds: 60, max_retakes: null }`) |
```

## B7. `docs/08-api-spec.md` — 2 edit

**Edit A** (tabel error — insert setelah baris `SESSION_LIMIT_REACHED`):
```
| `SESSION_EXPIRED` | 410 | v2: timer sesi habis (reset Welcome / auto-finalize) |
```

**Edit B** (§8.14 — ganti blok):
- OLD:
```
- `POST /api/v1/public/:businessSlug/sessions` — mulai sesi (`{ photobox_id, package_id, event_code, device_token }`)
- `POST /api/v1/public/:businessSlug/checkout` — buat checkout (`{ session_id, package_id, voucher_code? }`) → `{ checkout_session_id, final_amount }`
- `POST /api/v1/public/:businessSlug/checkout/apply-voucher` — validasi voucher
- `POST /api/v1/public/:businessSlug/payments/qris` — buat payment QRIS (`{ checkout_session_id }`) → `{ qr_image, qr_url, order_id, total_amount, expires_at }`
- `GET /api/v1/public/:businessSlug/payments/:paymentRef/status` — status payment (recover saat reload)
- `GET /api/v1/public/results/:resultToken` — akses result (setelah paid)
```
- NEW:
```
- `POST /api/v1/public/:businessSlug/checkout` — buat checkout **(v2 pay-first: SEBELUM sesi foto)** (`{ photobox_id, package_id, voucher_code?, device_token }`) → `{ checkout_session_id, final_amount }`
- `POST /api/v1/public/:businessSlug/checkout/apply-voucher` — validasi voucher
- `POST /api/v1/public/:businessSlug/payments/qris` — buat payment QRIS (`{ checkout_session_id }`) → `{ qr_image, qr_url, order_id, total_amount, expires_at }`
- `GET /api/v1/public/:businessSlug/payments/:paymentRef/status` — status payment (recover saat reload)
- `POST /api/v1/public/:businessSlug/sessions` — mulai sesi (**syarat: checkout_session paid**) (`{ checkout_session_id, device_token }`) → `{ session_id, expires_at }`; semua endpoint sesi cek `expires_at` → `SESSION_EXPIRED`
- `POST /api/v1/public/:businessSlug/sessions/:id/finalize` — selesai (trigger auto-print + generate result & GIF)
- `GET /api/v1/public/results/:resultToken` — akses result online (unduh GIF slideshow + foto berframe)
```

## B8. `docs/12-roadmap-mvp.md` — 5 edit

**Edit A** (MVP scope CUSTOMER — ganti seluruh blok):
- NEW:
```
**CUSTOMER (v2 pay-first):**
- Device activation + **setup wizard sekali** (permission kamera/printer, pilih kamera, print test) — tersembunyi dari customer
- Welcome
- Package selection
- **Checkout + Voucher + QRIS (SEBELUM sesi foto)**
- Payment status
- **Session timer (per photobox, mulai saat paid; timeout pre-paid reset / post-paid auto-finalize)**
- Template/frame selection (setelah paid)
- Camera
- Countdown
- Capture
- Retake (unlimited, dibatasi timer)
- Photostrip
- Basic editing (zoom, posisi, filter)
- **Finalize → auto-print**
- Result
- **QR → online result: unduh GIF + foto berframe**
- (Email delivery — future, OUT OF SCOPE)
```

**Edit B** (Phase 4 Features):
- OLD: `- **Features:** welcome, package select, template select, **camera detection flow (getUserMedia → enumerateDevices → getCapabilities → resolusi)**, camera permission/preview, countdown, capture, retake, photostrip, basic editor (crop/rotate/filter), sticker & text dasar, **printing (window.print + print layout + print test)**.`
- NEW:
```
- **Features:** device activation + **setup wizard sekali (permission kamera/printer + camera detection flow + print test)**, welcome, package select, template select (post-paid), camera runtime, countdown, capture, **retake unlimited (timer-bound)**, photostrip, basic editor (crop/rotate/zoom/pan/filter), sticker & text dasar, **session timer + auto-finalize**, **finalize → auto-print + GIF result**.
- **Catatan v2 (pay-first):** wiring final = sesi membutuhkan checkout paid (Phase 5–6); selama dev gunakan bypass flag `DEV_SKIP_PAYMENT`.
```

**Edit C** (Phase 5 Features — append kalimat):
- OLD: `- **Features:** checkout summary, apply voucher, hitung discount & final amount, validasi voucher lengkap, checkout session.`
- NEW: `- **Features:** checkout summary, apply voucher, hitung discount & final amount, validasi voucher lengkap, checkout session. Checkout dibuat **sebelum sesi foto (pay-first)** — acuan urutan: \`05-customer-photobox.md\` v2.`

**Edit D** (Phase 6 DoD):
- OLD: `- **DoD:** payment sukses via sandbox menghasilkan \`payments.paid\` + \`transactions.paid\` sekali saja.`
- NEW: `- **DoD:** payment sukses via sandbox menghasilkan \`payments.paid\` + \`transactions.paid\` sekali saja; **paid → sesi ter-unlock + timer mulai + \`result_token\` di-issue**.`

**Edit E** (append sebelum `## 12.7`):
```
58. Pembayaran terjadi sebelum sesi foto (pay-first).
59. Timer sesi di-enforce server-side; timeout sebelum bayar → reset Welcome; timeout setelah bayar → auto-finalize (tetap print + QR result).
60. Finalisasi sesi memicu auto-print otomatis (Chrome kiosk).
61. Halaman result online menyediakan unduh GIF animasi + foto berframe.
62. Setup permission kamera/printer hanya sekali saat device pairing — tidak muncul di flow customer.

> Catatan v2: AC 10–33 dijalankan dalam urutan **pay-first** (pilih package → bayar → frame → foto → edit → print → result). Acuan urutan: `05-customer-photobox.md`.
```
Dan update judul `## 12.6 Acceptance Criteria (MVP — 57 items)` → `## 12.6 Acceptance Criteria (MVP — 62 items)`.

## B9. `docs/05-customer-photobox.md` — FULL REWRITE

Ganti seluruh isi file dengan dokumen di **BAGIAN C** di bawah.

## B10. File yang TIDAK diubah

`02` (billing tidak berubah), `09` (device security tetap berlaku; `SESSION_EXPIRED` sudah tercakup prinsip server-side), `10`, `11` (design system netral terhadap urutan), `13`, `14` (settlement flow tidak berubah — webhook paid tetap kredit saldo).

## B11. Validasi pasca-edit

```bash
# urutan lama tidak boleh tersisa:
grep -rn "Session → Checkout → Voucher → Payment" docs/          # expect 0
grep -rn "Unlock final result" docs/                              # expect 0
grep -rn "PACKAGE → REVIEW" docs/                                 # expect 0
grep -rn "session_id, package_id, voucher_code" docs/08-api-spec.md  # expect 0
grep -rn "Camera permission → Countdown" docs/                    # expect 0
# penanda v2 harus ada:
grep -c "pay-first" docs/05-customer-photobox.md                  # expect ≥3
grep -n "SESSION_EXPIRED" docs/08-api-spec.md                     # expect ≥1
grep -n "session_settings" docs/07-database-schema.md             # expect ≥1
grep -n "expires_at" docs/07-database-schema.md                   # expect ≥2
grep -n "58\." docs/12-roadmap-mvp.md                             # expect 1
```

---

# BAGIAN C — Isi final `docs/05-customer-photobox.md` (v2)

```markdown
# 5. Customer Photobox Application

> **REVISI v2 — PAY-FIRST (acuan urutan resmi).** Alur customer: pilih package → bayar QRIS → pilih frame/template → sesi foto → edit → finalize → auto-print → QR result online (unduh GIF + foto berframe). Pembayaran terjadi **sebelum** sesi foto. Setup permission kamera/printer dilakukan **sekali** saat device pairing, tersembunyi dari customer. Jika bagian PRD lain masih menggambarkan urutan lama (foto dulu baru bayar), urutan pay-first di dokumen ini yang menang.

Customer **tidak perlu login**. Aplikasi ini adalah pengalaman photobox milik brand owner (misal "KLIK FOTO"), dengan SnapyOS sebagai infrastruktur di belakangnya.

## 5.0 Device Activation (Pairing) & Setup Wizard — Keamanan Perangkat

Sebelum customer app bisa dipakai, **perangkat (device/kiosk) harus diaktifkan/dipasangkan** ke photobox milik owner. Ini mencegah orang tak berwenang menjalankan booth.

### Konsep
- Setiap photobox punya **slug URL khusus**: `GET /p/[businessSlug]/[photoboxSlug]`.
- Device membuka URL → melihat layar aktivasi (kode + QR belum aktif).
- Owner (di dashboard) membuka halaman Photobox → menampilkan **kode aktivasi + QR code** (sekali pakai, kedaluwarsa beberapa menit).
- Device **memasukkan kode** ATAU **scan QR** (yang berisi kode + URL pairing).
- Server memverifikasi → menerbitkan **device token** (persisten) → device langsung aktif otomatis.
- Token persisten **sampai dicabut/reset owner** (device diingat; tidak perlu aktif ulang tiap boot, selama token valid).

### Flow
```
Device buka /p/[slug]/[photoboxSlug]
   ↓ (belum aktif)
Layar aktivasi: [ MASUKKAN KODE ]  /  [ SCAN QR ]
   ↓
Owner dashboard → Photobox → [ TAMPILKAN KODE/QR ]  (sekali pakai, expire ~5 menit)
   ↓
Device kirim kode / scan QR → POST /devices/activate
   ↓
Server verifikasi kode → buat device_token (persisten) → simpan device
   ↓
Setup Wizard sekali (§5.0.1) → Device aktif → Welcome Screen otomatis (branding owner)
```

### 5.0.1 Setup Wizard (sekali — tersembunyi dari customer)

Permission kamera & printer, pemilihan kamera, dan print test adalah urusan **device setup**, bukan bagian dari pengalaman customer.

Setelah aktivasi sukses (sebelum Welcome Screen pertama), device menjalankan **Setup Wizard sekali**:

1. **Grant permission kamera** — izin kamera Chrome kiosk (persist di profil kiosk; dokumentasi di Bantuan).
2. **Camera detection flow penuh (§5.5.1)** — deteksi kamera, pilih kamera (`preferred_device_id`), cek resolusi, laporkan hasil ke `device_status` (owner melihat di dashboard).
3. **Print test** — generate halaman test → cetak di kiosk → owner konfirmasi fisik ("Test print berhasil?" Ya/Tidak). Printer default OS harus sudah di-set.
4. **Selesai** → langsung Welcome Screen.

Aturan:
- Customer **tidak pernah** melihat UI permission, pemilihan kamera, atau print test — flow customer murni pengalaman brand.
- Owner dashboard hanya menampilkan `device_status` + tombol **[ ULANGI SETUP ]** (revoke device → re-pair → wizard jalan lagi).
- Runtime kamera gagal (kamera dicabut, dipakai app lain) → pesan retry sederhana + lapor ke `device_status` (tabel error §5.5.3).

### Entity (tambahan `07-database-schema.md`)
- `devices` — `{ id, business_id, photobox_id, name, device_token (hash), status (active/revoked), last_seen_at, created_at }`
- `activation_codes` — `{ id, photobox_id, code, expires_at, used_at, created_at }` (sekali pakai)

### API
- `GET /api/v1/business/:businessId/photoboxes/:id/activation` — owner: generate kode+QR (return `code`, `qr_url`)
- `POST /api/v1/public/devices/activate` — `{ code }` (atau payload QR) → `{ device_token }`
- `POST /api/v1/public/devices/verify` — `{ device_token }` → status device (dipakai saat device boot/reload)
- `DELETE /api/v1/business/:businessId/devices/:id` — owner: cabut (revoke) device

### Keamanan
- Kode aktivasi: random, short-lived (expire ~5 menit), **sekali pakai** (`used_at`).
- `device_token` disimpan **hash** di server; device menyimpan token di `localStorage` (public app, tanpa login).
- Server memverifikasi `device_token` + `photobox_id` + `business_id` pada setiap request device (bukan hanya saat aktivasi).
- Owner bisa **revoke** device kapan saja (misal device hilang/rusak).
- Aktivasi gagal → error jelas ("Kode tidak valid atau kedaluwarsa") + tombol coba lagi.

### Acceptance
- Device hanya bisa masuk customer app setelah aktivasi berhasil.
- Kode/QR dari dashboard sekali pakai & kedaluwarsa.
- Device aktif otomatis setelah scan/kode sukses.
- Device persisten (reload tidak perlu aktif ulang) selama tidak di-revoke.
- Revoke membuat device langsung terkunci kembali.
- Setup wizard berjalan sekali setelah pairing; flow customer bebas UI teknis (permission/printer/kamera).

---

## 5.1 Customer Flow (v2 — pay-first)

```
WELCOME → CHOOSE PACKAGE → CHECKOUT → VOUCHER → QRIS PAYMENT → PAID (timer mulai)
→ CHOOSE TEMPLATE/FRAME → CAMERA → COUNTDOWN → CAPTURE → REVIEW → RETAKE/CONTINUE
→ EDIT → FINALIZE → AUTO-PRINT → RESULT (QR) → ONLINE RESULT (GIF + FOTO BERFRAME)
```

URL publik: `GET /p/[businessSlug]/[photoboxSlug]` (opsional `?event=<event_code>`). Device yang sudah aktif menyimpan `device_token` dan langsung masuk welcome screen.

Prinsip pay-first:
- Harga & jumlah foto ditentukan **package** (dipilih sebelum bayar).
- **Sesi foto hanya bisa dimulai setelah payment `paid`** (`POST /sessions` syarat: checkout_session paid).
- Foto di-upload ke storage **setelah paid** — tidak ada foto tersimpan tanpa pembayaran.
- Timeout: sebelum bayar → reset ke Welcome (checkout expired); setelah bayar → **auto-finalize** (§5.1b).

## 5.1b Session Timer & Auto-Finalize

**Purpose:** menjaga throughput booth — customer tidak menempati booth terlalu lama.

**Konfigurasi (per photobox, owner-configurable)** — `photoboxes.session_settings` jsonb:
```json
{
  "timer_seconds": 300,
  "warning_seconds": 60,
  "max_retakes": null
}
```

**Aturan:**
- Timer mulai saat **webhook PAID** (waktu menunggu QRIS tidak dihitung).
- `sessions.expires_at` di-set server-side saat session dibuat (post-paid). **Semua endpoint sesi mengecek expiry** → error `SESSION_EXPIRED` jika lewat. Countdown di kiosk hanya UX; server adalah enforcer.
- UI kiosk: countdown terlihat + warning di sisa waktu terakhir (`warning_seconds`).
- **Timeout sebelum bayar** → reset ke Welcome; `checkout_session` expired; tidak reuse (bayar baru = attempt baru).
- **Timeout setelah bayar** → **AUTO-FINALIZE**: sistem memakai foto terakhir yang ter-capture (edit yang belum selesai diabaikan) → tetap print + QR result. Customer sudah bayar = tetap mendapat produk.
- **Timeout post-paid dengan 0 foto ter-capture** → result page menampilkan "sesi berakhir" + penanganan manual owner (kompenasi/re-entry via dashboard).
- Sesi **one-shot**: setelah finalize/timeout, kiosk kembali ke Welcome; sesi tidak bisa dilanjutkan/diulang.

**Acceptance:** timer di-enforce server-side; timeout pre-paid reset; timeout post-paid tetap menghasilkan print + result.

---

## 5.2 Welcome Screen

**Purpose:** Identitas brand + ajakan mulai.

**UI:** business name, logo, tagline ("Capture your moment."), tombol `[ START ]`. Style Neo-Brutalism playful.

**Data:** dari `business_settings.branding`.

**Components:** `Card`, `Button` besar, `Image` logo.

**State:** loading brand config → skeleton; error → fallback generic.

---

## 5.3 Choose Package

**Purpose:** Customer memilih layanan — package menentukan **harga**, **jumlah foto** (`photo_count`) & cetak (`print_count`).

**UI:** daftar `Card` package (nama, harga, detail foto/print/digital). Package yang `active` dan berlaku untuk photobox/outlet yang sedang dipakai saja yang tampil.

**Data:** `packages` + eligibility outlet/photobox.

**API:** `GET /api/v1/public/:businessSlug/packages?photobox=&event=`

> v2: setelah package dipilih, customer langsung ke **Checkout** (bayar dulu — §5.12), bukan ke template.

---

## 5.4 Choose Template

**Purpose:** Customer memilih frame/template sesuai package.

> v2: tahap ini terjadi **setelah pembayaran sukses (paid)** — bagian dari sesi foto yang sudah dibayar.

**UI:** grid preview template (thumbnail). Hanya template yang di-assign ke package yang tampil.

**Data:** `templates` via `package_templates` join.

**API:** `GET /api/v1/public/:businessSlug/templates?package=`

---

## 5.5 Camera System

**Purpose:** Capture foto via kamera browser. Target: **Chrome kiosk** (mini PC + USB webcam).

**Target platform:** Chrome/Chromium browser (versi 80+) di kiosk mode (`--kiosk --kiosk-printing`). Semua API MediaDevices & Canvas tersedia penuh.

**Kamera yang didukung:** semua USB webcam standar yang terdeteksi OS kiosk (Logitech C920/C270/C922, Razer Kiyo, ELGATO Facecam, kamera laptop/tablet). Rekomendasi minimum **720p**, ideal **1080p**.

> v2: **deteksi kamera, grant permission, dan pemilihan device terjadi di Setup Wizard (§5.0.1), sekali**, bukan di flow customer. Saat sesi berjalan, app langsung membuka stream memakai `preferred_device_id` tersimpan. Error runtime (kamera dicabut/dipakai app lain) tetap ditangani dengan pesan retry (tabel §5.5.3) dan dilaporkan ke `device_status`.

### 5.5.1 Camera Detection Flow (berjalan saat Setup Wizard)

```
Setup Wizard (§5.0.1) setelah aktivasi device
   ↓
1. Feature check: 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices?
   ├─ Tidak → "Browser tidak mendukung kamera. Gunakan Chrome terbaru."
   └─ Ya → lanjut
   ↓
2. Secure context check: window.isSecureContext?
   ├─ Tidak → "Harus diakses via HTTPS (localhost ok untuk development)."
   └─ Ya → lanjut
   ↓
3. getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } } })
   ├─ NotAllowedError → "Izinkan akses kamera untuk mulai berfoto." + [ AKTIFKAN KAMERA ]
   ├─ NotFoundError → "Tidak ada kamera terdeteksi. Hubungkan USB webcam."
   ├─ NotReadableError → "Kamera sedang dipakai aplikasi lain. Tutup aplikasi lain."
   ├─ OverconstrainedError → coba lagi tanpa constraint (fallback)
   ├─ AbortError → "Permintaan kamera dibatalkan." + retry
   └─ Sukses → stream aktif, preview tampil di <video>
   ↓
4. enumerateDevices() → filter kind: 'videoinput'
   ├─ 0 devices → "Tidak ada kamera terdeteksi. Periksa koneksi USB."
   ├─ 1 device → langsung pakai (deviceId disimpan)
   ├─ 2+ devices → Camera Selector (dropdown deviceId + label)
   └─ Front/back switch (jika facingMode tersedia: 'user'/'environment')
   ↓
5. getCapabilities() (Chrome) atau getSettings() → cek resolusi
   ├─ width ≥ 1920 → FULL HD (1080p) — kualitas terbaik
   ├─ width ≥ 1280 → HD (720p) — OK
   ├─ width < 1280 → warning "Kualitas kamera rendah. Gunakan webcam HD."
   └─ Catat di device_status (report ke owner dashboard)
   ↓
6. SELESAI SETUP — preferred_device_id tersimpan di camera_settings
   (customer tidak pernah melihat langkah-langkah ini)
```

Runtime sesi (di flow customer):
```
Ambil preferred_device_id → getUserMedia → preview siap
   ├─ Gagal (NotFound/NotReadable runtime) → pesan retry §5.5.3 + lapor device_status
   └─ Sukses → lanjut capture
Mirror preview & fullscreen mengikuti owner settings (camera_settings)
```

### 5.5.2 Camera Settings (owner-configurable, per photobox)

`photoboxes.camera_settings` jsonb:
```json
{
  "countdown_seconds": 3,
  "mirror_preview": true,
  "fullscreen": true,
  "facingMode": "environment",
  "preferred_device_id": null,
  "capture_width": 1920,
  "capture_height": 1080,
  "jpeg_quality": 0.92
}
```

### 5.5.3 Camera Error Handling (user-friendly, full bahasa Indonesia)

| Error | Pesan | Aksi |
|-------|-------|------|
| `NotAllowedError` | "Izinkan akses kamera untuk mulai berfoto." | [ AKTIFKAN KAMERA ] |
| `NotFoundError` | "Tidak ada kamera terdeteksi. Hubungkan webcam USB ke perangkat ini." | [ COBA LAGI ] |
| `NotReadableError` | "Kamera sedang dipakai aplikasi lain. Tutup aplikasi lain, lalu coba lagi." | [ COBA LAGI ] |
| `OverconstrainedError` | "Resolusi kamera tidak didukung. Mencoba resolusi standar..." | otomatis fallback |
| `AbortError` | "Permintaan kamera dibatalkan." | [ COBA LAGI ] |
| `isSecureContext === false` | "Harus diakses via HTTPS agar kamera berfungsi." | info teknis |
| 0 device terdeteksi | "Tidak ada kamera terdeteksi. Periksa koneksi USB webcam." | [ PERIKSA KAMERA ] |
| Resolusi < 480p | "Kualitas kamera rendah. Disarankan webcam HD (720p+)." | warning (tetap bisa lanjut) |

### 5.5.4 Components

`CameraView` (video + canvas hidden), `CameraControls`, `CameraSelector` (setup wizard), `MirrorToggle`, `FullscreenToggle`, `CameraStatusBar` (resolusi, FPS opsional), `SetupWizard` (§5.0.1).

**Acceptance:** (AC 13, 56, 62) customer pakai kamera tanpa pernah melihat setup; ada fallback saat gagal; resolusi terdeteksi & dilaporkan.

---

## 5.6 Capture Mode

**Minimal modes:** Single Photo, Multiple Photo / Burst, Photostrip (3/4/5 foto).

Jumlah foto mengikuti **package** (`photo_count`) — jumlah slot sesi = jumlah frame yang dipilih/dibayar.

**UI/Components:** `ModeSelector` (jika package mengizinkan), `PhotostripPreview` (grid slot).

**Data:** package `photo_count`, `mode`.

---

## 5.7 Countdown

**Options:** 3 sec, 5 sec, 10 sec (dari setting package/business).

**Flow:** tampil `3 → 2 → 1 → CAPTURE`, dengan animasi + **simulated flash effect** (overlay putih cepat) saat capture.

**UI/Components:** `Countdown` (angka besar, animasi), `FlashOverlay`.

**Acceptance:** (AC 14–15) countdown berjalan & foto ter-capture.

---

## 5.8 Review & Retake

**UI:** preview foto hasil capture; tombol `Retake` / `Continue`.

**v2:** Retake **unlimited** — dibatasi oleh timer sesi (§5.1b); `max_retakes` opsional via `session_settings`. Setiap retake tercatat `sessions.retake_count`.

**Data:** foto disimpan di state/local (blob) sampai finalisasi; di-upload ke storage saat finalize (post-paid).

---

## 5.9 Photo Editor

**Purpose:** Edit sebelum finalize — tahap terakhir sebelum print.

**Features:**
- Transform: crop, rotate, **zoom & pan/posisi** (fit ke frame)
- Adjust: brightness, contrast, saturation, blur, grain, vignette
- **Filters:** Original, Film, Warm, Cool, Black & White, Retro, Vintage, Y2K

**Components:** `EditorCanvas` (canvas-based), `FilterRow`, `AdjustSlider`, `CropTool`, `RotateButton`, `ZoomSlider`, `PanTool`.

**Technical:** manipulasi via Canvas API (`ctx.filter`, `drawImage`); hasil akhir dirender ke canvas dan diekspor sebagai blob (JPEG/PNG).

**Acceptance:** (AC 18) basic editing berfungsi (zoom, posisi, filter).

---

## 5.10 Sticker System

**Purpose:** Menambah elemen dekoratif.

**Sticker types:** Hearts, Stars, Sparkles, Emoji, Doodles, Event stickers, Text stickers.

**Interaksi:** move, resize, rotate, delete.

**Components:** `StickerLayer`, `StickerItem` (drag/resize/rotate), `StickerPanel`.

**Data:** `stickers` (asset yang diaktifkan owner) → `GET /api/v1/public/:businessSlug/stickers`.

**Owner control:** owner mengatur sticker yang tersedia (lihat `04-owner-dashboard.md`).

---

## 5.11 Text Tool

**Purpose:** Menambah teks pada foto.

**Properties:** font, size, color, alignment, rotation, opacity.

**Components:** `TextToolbar`, `TextItem` (canvas text, editable).

---

## 5.12 Checkout (Pay-First — sebelum sesi foto)

Lihat `06-checkout-payment.md` untuk detail penuh (order summary, voucher, QRIS, payment status).

> v2: checkout terjadi **setelah pilih package, sebelum sesi foto**. Sesi foto ter-unlock setelah payment `paid`.

Ringkas flow checkout:
```
PACKAGE → VOUCHER (opsional) → FINAL PRICE → CHECKOUT → QRIS → VERIFY → PAID
→ (lanjut: pilih template §5.4 → sesi foto)
```

---

## 5.13 Result — Kiosk & Online

### Kiosk Result Screen (setelah finalize)

**UI:**
```
YOUR PHOTO IS READY!
[ PHOTO PREVIEW ]
[ PRINTING... / PRINT DONE ✓ ]     (auto-print ter-trigger, lihat §5.15)
SCAN TO GET YOUR PHOTOS:
[ QR CODE → halaman result online ]
[ CREATE ANOTHER ] → reset ke Welcome (sesi one-shot)
```

### Online Result Page (`result_token`)

Menyediakan:
- **Unduh GIF animasi slideshow** — semua foto berframe bergantian otomatis; digenerate **server-side saat finalize**; storage key di `sessions.result_gif_key`.
- **Unduh foto berframe** (statis, per foto — hasil edit + frame pilihan customer).
- (Slot future: kirim ke email — **OUT OF SCOPE sekarang, jangan diproses**.)

**Rule:** `result_token` di-issue saat payment `paid`; akses divalidasi server-side; expiration mengikuti retention policy (default 7 hari).

**Acceptance:** (AC 31–33, 61) setelah payment sukses & finalize, customer mendapat print otomatis + QR ke halaman online dengan GIF & foto berframe.

---

## 5.14 QR Photo Delivery

**Purpose:** Membagikan hasil via QR/tautan.

**UI:**
```
SCAN TO GET YOUR PHOTO
[ QR CODE ]
```

QR mengarah ke secure online result page (GIF + foto berframe, §5.13). Result memiliki **expiration policy configurable** (per business/subscription, default misal 7 hari).

**Technical:** result URL berbentuk signed link dengan `expires_at`; akses divalidasi server-side.

**Acceptance:** (AC 33) customer mendapat QR photo; link expire sesuai kebijakan.

---

## 5.15 Printing System

**Purpose:** Mencetak hasil foto (bila package include print) via printer OS kiosk.

**Pendekatan:** **Browser print / OS printer** (`window.print()` + `@media print`), target Chrome kiosk mode (`--kiosk-printing` untuk auto-print tanpa dialog). Fleksibel untuk printer foto umum (DNP dye-sublimation, Citizen, Canon Selphy, inkjet) yang terpasang sebagai printer default OS.

### 5.15.1 Print Flow (v2: auto-trigger saat finalize)

```
Customer tekan [ SELESAI ] di editor  ATAU  auto-finalize (timeout post-paid)
   ↓
Finalize → upload foto final → generate result + GIF
   ↓
App render print layout (canvas):
   - 1 foto 4x6"  ATAU  2 strip 2x6" (photostrip dari satu kertas 4x6")
   - Gambar + template frame + branding owner
   ↓
print_count menentukan jumlah cetak (loop)
   ↓
window.print() otomatis (Chrome kiosk --kiosk-printing → langsung cetak tanpa dialog)
   ↓
[ PRINT TEST ] tersedia di Setup Wizard (§5.0.1) & dashboard owner
   ↓
Status printer: tercatat di photoboxes.device_status (owner lihat di dashboard)
```

### 5.15.2 Print Settings (owner-configurable, per photobox)

`photoboxes.print_settings` jsonb:
```json
{
  "enabled": true,
  "paper_size": "4x6",
  "layout": "single",
  "orientation": "portrait",
  "auto_print": true,
  "copies": 1,
  "margins_mm": 0
}
```

### 5.15.3 Print Layout Mapping

| package.print_count | Hasil |
|---------------------|-------|
| 0 | digital only (download/QR) |
| 1 | 1 lembar 4x6" single (atau 1 strip) |
| 2 | 2 cetak (2 lembar single ATAU 1 lembar berisi 2 strip) |
| 3 | 3 cetak / photostrip 3 kolom |

Layout ditentukan `print_settings.layout` + `package.print_count`.

### 5.15.4 Printer Detection (keterbatasan & solusi)

Browser **tidak bisa** enumerate printer (standar web). Jadi "deteksi" dilakukan:
1. **Print Test di Setup Wizard (§5.0.1)** & dashboard owner → generate halaman test → `window.print()` di kiosk → owner konfirmasi fisik ("Test print berhasil?" Ya/Tidak).
2. **Printer default OS** harus di-set di kiosk (dokumentasi di Bantuan).
3. Status disimpan ke `photoboxes.device_status.printer = { status, last_test_at, confirmed }`.

### 5.15.5 Error Handling (print)

| Kondisi | Pesan / Aksi |
|---------|--------------|
| Printer tidak tersedia | "Printer tidak terdeteksi. Jalankan [ PRINT TEST ]." |
| Kertas habis | deteksi tidak memungkinkan via web → panduan di Bantuan |
| print gagal (onbeforeprint/onerror) | "Gagal mencetak." + [ CETAK ULANG ] |
| package tanpa print | langsung ke result (download/QR) |

### 5.15.6 Components

`PrintLayoutRenderer` (canvas → printable DOM), `PrintButton`, `PrintTestButton` (setup wizard & owner), `PrintStatusIndicator`, `FinalizeButton` ([ SELESAI ] — trigger print + result).

**Acceptance:** (AC 60) finalize memicu auto-print (Chrome kiosk); print test tersedia di setup wizard & dashboard; auto-print berjalan di kiosk mode.

---

## 5.16 Customer UI Character

Customer app tetap **Neo-Brutalism** namun lebih playful. Prioritas: Package → Pay → Frame → Camera → Capture → Result. Capture button = primary interaction, besar & jelas. Jangan terlihat seperti admin dashboard. Timer countdown terlihat jelas namun tidak mengganggu.

## 5.17 Responsive & Accessibility (customer)

- Mobile/tablet/desktop compatible.
- Kamera responsif terhadap berbagai aspect ratio.
- Kontras tinggi, fokus terlihat, label form jelas, error state informatif.
```

