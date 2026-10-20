# 12. Roadmap, Scope & Definition of Done

## 12.1 MVP Scope

**OWNER:**

- Authentication
- Business onboarding
- Dashboard
- Revenue
- Transactions
- Photobox management
- Outlet management
- Package management
- Template management (upload frame sendiri + kelola + assign)
- Voucher management
- Basic finance
- Saldo & Penarikan (withdrawal)
- Bantuan / Help Center
- Subscription (1 outlet, 1 sesi aktif; add-on sesi)

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

**ADMIN:**

- User management
- Business management
- Plan management
- Subscription management
- Template management
- Platform analytics

**PAYMENT:**

- Pakasir QRIS
- Create payment
- QR display
- Payment status
- Webhook
- Verification
- Expiration
- Failed payment
- Idempotency
- Settlement → saldo owner (aggregator)
- Penarikan (withdrawal) owner

## 12.2 Phase 2 (setelah MVP stabil)

- Multi-outlet improvements
- Advanced analytics
- Advanced reporting
- Staff management improvements
- Booking
- Event mode
- Custom domain
- White-label
- Printer integration (native/ESC-POS/thermal, driver control, auto paper status — di luar browser print)
- Camera/device management (advanced: remote control, hardware health)
- Better template builder (ekstensi Phase 12: shape path/custom mask, layer frame z-configurable, reusable block — lihat `15-template-builder.md` §15.8 Tahap B)

## 12.3 Phase 3 (future)

- AI enhancement
- AI background
- Hardware monitoring
- API (public)
- Advanced device management
- Enterprise
- Advanced white-label

## 12.4 Development Roadmap (Phase 0–11)

Format per fase: **Objective, Features, Database changes, API requirements, UI requirements, Components, Dependencies, Acceptance criteria, Testing, Definition of Done.**

### 12.4.0 Status Ringkasan (per kondisi kode saat ini — 2026-08-19)

Legenda status:

- `[SELESAI]` — implementasi ada & **ter-commit** di git (lolos lint/typecheck, ada test unit bila relevan).
- - `[SELESAI]` — implementasi ada & ter-commit di git.
- `[SEBAGIAN]` — sebagian fitur ada, sisanya belum / belum diverifikasi.
- `[BELUM DIMULAI]` — belum ada implementasi (hanya rancangan/dependency).

| Phase | Fokus                      | Status            | Catatan singkat                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | -------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Foundation                 | `[SELESAI]`       | committed `18a57a1`; `src/styles/tokens.css`, `db/schema.sql`, Auth.js, `ui/*` + `ThemeProvider` ada.                                                                                                                                                                                                                                                                                                     |
| 1     | Auth + Multi-tenant        | `[SELESAI]`       | committed `d1ab1ec`; register/login/logout, businesses CRUD, RBAC, tenant scope.                                                                                                                                                                                                                                                                                                                          |
| 2     | Owner Dashboard            | `[SELESAI]`       | committed `f35ab5e`; metric cards, revenue chart, date filter.                                                                                                                                                                                                                                                                                                                                            |
| 3     | Photobox Builder           | `[SELESAI]`       | committed `3765672`; outlet/photobox CRUD, branding + logo upload.                                                                                                                                                                                                                                                                                                                                        |
| 4     | Customer Photobox          | `[SELESAI]`       | committed `3765672`,`e5a71d2`; kiosk + setup wizard + camera + editor + auto-print + GIF + `/r/[token]`. Wiring pay-first via Phase 5–6.                                                                                                                                                                                                                                                                  |
| 5     | Checkout + Voucher         | `[SELESAI]`       | routes `checkout`, `apply-voucher`, `CheckoutScreen`, `checkout-math`, `tests/phase5`. Hardening: limit sesi dicek pre-payment (`SESSION_LIMIT_REACHED` di checkout + qris), anti double-payment (1 QR hidup/booth), expiry QR configurable default 3 mnt (`business_settings.checkout`), rate-limit retry-after lock, kiosk fit-1-layar + fullscreen lock (Ctrl+Alt+X 2 dtk) + offline sync (IndexedDB). |
| 6     | Pakasir Payment (QRIS)     | `[SELESAI]`       | routes `payments/create`, `payments/[paymentRef]/status`, `webhooks/payment/pakasir`, `src/server/payment/pakasir-utils.ts`, `src/server/payment/pakasir.ts`, UI QRIS di `CheckoutScreen`; teruji sandbox.                                                                                                                                                                                                |
| 7     | Transactions + Finance     | `[SELESAI]`       | committed `04d51b3`; auto-transaction, list/filter, expenses, finance summary.                                                                                                                                                                                                                                                                                                                            |
| 8     | Reports + Analytics        | `[SELESAI]`       | committed `04d51b3`; revenue breakdown (outlet/package/photobox/method) + export CSV **& XLSX**.                                                                                                                                                                                                                                                                                                          |
| 9     | Staff + Multi-Outlet       | `[SELESAI]`       | committed `04d51b3`; staff invite/role, RBAC matrix, outlet analytics; multi-outlet CRUD dari Phase 3.                                                                                                                                                                                                                                                                                                    |
| 10    | Subscription               | `[SELESAI]`       | `src/server/subscription.ts` + actions, halaman `/dashboard/subscription` (status, usage vs limit, plan cards upgrade/downgrade, cancel/resume, invoice list), invoice manual periode baru, audit log. Test: `tests/phase10.test.ts`. Trial auto-provision sudah dari Phase 1.                                                                                                                            |
| 11    | Polish + Security          | `[SEBAGIAN→SIAP]` | audit logging kini di alur finansial/admin (`src/server/audit.ts`: expense CRUD, transaksi manual, payment paid webhook, subscription, admin), retention cron harian (`/api/cron/retention` + `vercel.json`, `CRON_SECRET`), rate-limit + UI states + a11y dasar (label/aria/semantik) ada. E2E script ringan dihapus. **Belum**: load test.                                                              |
| 12    | Template & Frame Builder   | `[SELESAI]`       | `/dashboard/templates/builder/[id]`, engine composite `src/lib/compose-frame.ts`, migration `0010-template-layout.sql` (+ `0020-template-video.sql` video frame), validasi layout server-side, kiosk slot-fit, filter `slot_count == photo_count`, template legacy tetap jalan.                                                                                                                           |
| POS   | POS Add-on (offline kasir) | `[SELESAI]`       | Migration `0019_pos_addon.sql` (2026-08-28): offline-only cash/bank_transfer/other, per-booth `photoboxes.pos_enabled`, staff tanpa role baru, tanpa QRIS. Lengkap di `docs/pos/` (status per phase di tiap dokumen).                                                                                                                                                                                     |

Test: `npm run test` → **251/251 pass** (29 file; update 2026-09-14, termasuk POS math/validators/entitlement/reports/orders + rbac extend + hardware + kiosk-visual).

---

### PHASE 0 — Project Foundation

> **Status (2026-08-19):** `[SELESAI]` — committed `18a57a1`. `src/styles/tokens.css` (neo-brutalism tokens), `db/schema.sql` (DDL + seed 3 plan), Auth.js config, base `ui/*` + `ThemeProvider`, lint/typecheck hijau.

- **Objective:** Repo & tooling siap, deployable skeleton.
- **Features:** Next.js App Router + TypeScript + Tailwind, shadcn/ui init (neo-brutalism tokens), Supabase client (server-only), Auth.js config, env, lint/format, CI dasar.
- **Database:** supabase project + bucket setup, migrasi awal `users`, `businesses`, `business_members`, `plans` (seed 3 plan).
- **API:** `/api/auth/*`, health check.
- **UI:** design tokens, base Button/Card/Input variants neo-brutal.
- **Components:** `ui/*` (dasar), `ThemeProvider`.
- **Dependencies:** Next.js, Tailwind, shadcn/ui, `@supabase/supabase-js`, `next-auth@beta`, `zod`, `lucide-react`.
- **Acceptance:** `npm run dev` jalan, lint/typecheck hijau, token visual tampil.
- **Testing:** lint + typecheck + basic build CI.
- **DoD:** repo runnable, .env ter-dokumentasi, base components ter-custom.

**Penutup gap (wajib dikerjakan di Phase 0):**

- **Token file tunggal** `src/styles/tokens.css` (warna/radius/shadow/font + mapping Tailwind + override shadcn) — `11-design-system.md` §11.11.
- **DDL/migrasi nyata** `db/schema.sql` (CREATE TABLE + constraint + index lengkap + seed 3 plan) — `07-database-schema.md` §7.0b.
- **State management** (keputusan aktual, sync `03-architecture.md` §3.8.1): Server Components + Server Actions; TanStack Query & Realtime tidak dipakai; status payment = polling 3s.
- **Component contract** dimulai untuk komponen dasar (`ui/*`) — `03-architecture.md` §3.8.2.
- **i18n:** Indonesia-only (hardcode), tanpa framework — `03-architecture.md` §3.8.3.

---

### PHASE 1 — Authentication + Multi-tenant Business

> **Status (2026-08-19):** `[SELESAI]` — committed `d1ab1ec`. Register/login/logout, session revocable (DB session), create/list business, workspace switching, onboarding; tenant isolation via `business_id` server-scope. Test: `tests/phase1.test.ts`.

- **Objective:** User register/login, workspace business terisolasi.
- **Features:** register, login (credentials), logout, session; create business, business list, workspace switching, onboarding dasar (buat business pertama).
- **Database:** `users`, `businesses`, `business_members`, `business_settings`; migration + index.
- **API:** `/api/auth/*`, `POST /api/v1/businesses`, `GET /api/v1/me/businesses`, settings.
- **UI:** login/register page, onboarding, layout dashboard dengan sidebar+topbar, workspace switcher.
- **Components:** `AuthForm`, `Sidebar`, `Topbar`, `WorkspaceSwitcher`.
- **Dependencies:** Auth.js v5, zod.
- **Acceptance:** (AC 1–3) user register, buat business; tenant isolation aktif (server-scope `business_id`).
- **Testing:** unit auth, integration RBAC/tenant scope.
- **DoD:** semua mutasi business di-scope tenant; tanpa login → redirect.

---

### PHASE 2 — Owner Dashboard

> **Status (2026-08-19):** `[SELESAI]` — committed `f35ab5e`. Metric cards, revenue AreaChart/BarChart, date-range filter, empty state. Gross/net konsisten dengan Phase 7. Test: `tests/phase2.test.ts`.

- **Objective:** Revenue overview.
- **Features:** metric cards, revenue chart, filter tanggal, breakdown dasar.
- **Database:** aggregate query `transactions` (belum ada data → empty state).
- **API:** `GET /dashboard`, `/analytics/revenue`, `/metrics`.
- **UI:** metric cards, AreaChart/BarChart.
- **Components:** `MetricCard`, `RevenueChart`, `DateRangeFilter`.
- **Acceptance:** (AC 35–38) gross/net tampil benar saat ada data; empty state.
- **Testing:** unit perhitungan aggregate (gross − discount = net).
- **DoD:** dashboard berfungsi dengan data dummy transaksi.

---

### PHASE 3 — Photobox Builder

> **Status (2026-08-19):** `[SELESAI]` — committed `3765672`. Outlet CRUD, photobox CRUD, branding config + `LogoUpload`, assign package/template; plan limit ditegakkan. Test: `tests/phase3.test.ts`.

- **Objective:** Owner bisa konfigurasi branding & struktur booth.
- **Features:** outlet CRUD, photobox CRUD, branding config (warna/logo/welcome), assign package/template.
- **Database:** `outlets`, `photoboxes`, `business_settings.branding`.
- **API:** outlets, photoboxes, branding endpoints.
- **UI:** outlet & photobox management, branding form + live preview.
- **Components:** `OutletsTable`, `PhotoboxForm`, `BrandingEditor`, `LogoUpload`.
- **Acceptance:** (AC 4–6) buat outlet, photobox, atur branding; limit plan ditegakkan.
- **Testing:** plan limit enforcement, upload validation.
- **DoD:** owner bisa setup booth & branding lengkap.

---

### PHASE 4 — Customer Photobox (Camera-first)

> **Status (2026-08-19):** `[SELESAI]` — committed `3765672`, `e5a71d2`. Device activation + setup wizard sekali, welcome, package/template select, camera runtime, countdown, capture, retake, photostrip, editor (zoom/posisi/filter/sticker/text), session timer + auto-finalize, auto-print, GIF, `/r/[token]`. Pay-first: sesi ter-unlock setelah Phase 5–6 paid (dev bypass `DEV_SKIP_PAYMENT`). Test: `tests/phase4.test.ts`.

- **Objective:** Alur capture customer berjalan.
- **Features:** device activation + **setup wizard sekali (permission kamera/printer + camera detection flow + print test)**, welcome, package select, template select (post-paid), camera runtime, countdown, capture, **retake unlimited (timer-bound)**, photostrip, basic editor (crop/rotate/zoom/pan/filter), sticker & text dasar, **session timer + auto-finalize**, **finalize → auto-print + GIF result**.
- **Catatan v2 (pay-first):** wiring final = sesi membutuhkan checkout paid (Phase 5–6); selama dev gunakan bypass flag `DEV_SKIP_PAYMENT`.
- **Database:** `sessions`, `photos`, `stickers`, `photoboxes.camera_settings`, `photoboxes.print_settings`; public config endpoint.
- **API:** `GET /public/:slug`, packages/templates/stickers, `POST /sessions`, `GET /photoboxes/:id/activation`, `POST /devices/activate`.
- **UI:** public app route `p/[slug]/[photoboxSlug]`, camera UI, editor, print layout, device activation screen.
- **Components:** `CameraView`, `CameraSelector`, `CameraStatusBar`, `Countdown`, `FlashOverlay`, `PackagePicker`, `TemplatePicker`, `EditorCanvas`, `StickerLayer`, `TextTool`, `PrintLayoutRenderer`, `PrintButton`, `ActivationScreen`.
- **Acceptance:** (AC 10–18) alur sampai editing; camera failure fallback (AC 56); resolusi terdeteksi; print berjalan di Chrome kiosk.
- **Testing:** unit canvas helper, e2e camera mock (getUserMedia stub), error states, print layout snapshot.
- **DoD:** customer bisa mengambil foto sampai siap checkout (tanpa bayar); kamera & printer terdeteksi/berjalan.

---

### PHASE 5 — Checkout + Voucher

> **Status (2026-08-19):** `[SELESAI]` — ter-commit di git. Backend: routes `checkout`, `checkout/apply-voucher` (`src/server/payment/checkout.ts`, `src/lib/checkout-math.ts`). Frontend: `CheckoutScreen` (summary + voucher + price breakdown). Final amount selalu dihitung backend. Test: `tests/phase5.test.ts`.

- **Objective:** Voucher & perhitungan harga server-side.
- **Features:** checkout summary, apply voucher, hitung discount & final amount, validasi voucher lengkap, checkout session. Checkout dibuat **sebelum sesi foto (pay-first)** — acuan urutan: `05-customer-photobox.md` v2.
- **Database:** `vouchers`, `voucher_usages`, `voucher_packages`, `voucher_outlets`, `checkout_sessions`.
- **API:** `POST /checkout`, `/checkout/apply-voucher`.
- **UI:** checkout UI, voucher input, order summary.
- **Components:** `CheckoutSummary`, `VoucherInput`, `PriceBreakdown`.
- **Acceptance:** (AC 19–23) apply voucher, validasi server-side, final amount benar.
- **Testing:** unit voucher validation (semua rule), error states.
- **DoD:** final amount selalu dihitung backend; frontend tidak jadi source of truth.

---

### PHASE 6 — Pakasir Payment (QRIS)

> **Status (2026-08-19; path disinkronkan Fase 5 2026-09-16):** `[SELESAI]` — Backend: `POST payments/create`, `GET payments/[paymentRef]/status`, webhook `POST /api/webhooks/payment/pakasir` (`src/server/payment/pakasir-utils.ts`, `src/lib/qris-helpers.ts`). Frontend: QRIS + timer + status polling + expired/failed di `CheckoutScreen`. Paid → `sessions` unlock + timer start + `result_token` issue (wiring di Phase 4). Test: `tests/phase5.test.ts`.

- **Objective:** Pembayaran QRIS nyata (sandbox).
- **Features:** PaymentService + PakasirProvider, create QRIS, render QR, status, expiry, recovery via reference, webhook endpoint + idempotency.
- **Database:** `payments`, `payment_webhooks`, `payment_providers`.
- **API:** `POST /payments/qris`, `GET /payments/:ref/status`, `POST /api/webhooks/payment/pakasir`.
- **UI:** QRIS screen (QR, harga, timer, status), hasil payment.
- **Components:** `QrisScreen`, `CountdownTimer`, `PaymentStatus`.
- **Acceptance:** (AC 24–30) QRIS tampil, status terverifikasi, webhook idempotent, expired/failed tertangani.
- **Testing:** mock provider unit test, webhook idempotency test, signature validation test.
- **DoD:** payment sukses via sandbox menghasilkan `payments.paid` + `transactions.paid` sekali saja; **paid → sesi ter-unlock + timer mulai + `result_token` di-issue**.

---

### PHASE 7 — Transactions + Finance

> **Status (2026-08-19):** `[SELESAI]` — committed `04d51b3`. Auto-transaction saat payment sukses (idempoten), list/filter/search, manual cash, expense CRUD, finance summary (profit/margin). `transactions` jadi single source of truth. Test: `tests/phase7.test.ts`.

- **Objective:** Source of truth finansial.
- **Features:** auto-create transaction saat payment sukses; transaction list/filter/search; manual cash transaction; expense CRUD; finance summary (profit/margin).
- **Database:** `transactions`, `expenses`, `customers`.
- **API:** transactions, expenses, finance summary.
- **UI:** transactions DataTable, expense form, finance summary cards.
- **Components:** `TransactionsTable`, `ExpenseForm`, `FinanceSummary`.
- **Acceptance:** (AC 34, 39–41) transaksi otomatis, gross/net benar, expenses & profit tampil.
- **Testing:** integrasi webhook→transaction; unit profit calc.
- **DoD:** transaction jadi sumber semua report.

---

### PHASE 8 — Reports + Analytics

> **Status (2026-08-19):** `[SELESAI]` — committed `04d51b3`. Revenue breakdown (outlet/package/photobox/payment-method), metrics, reports + export **CSV & XLSX** (`src/server/reports.ts`, `src/lib/report-csv.ts`). PDF = future.

- **Objective:** Analitik & export.
- **Features:** revenue breakdown (outlet/package/photobox/method), metrics, reports + export CSV/XLSX.
- **Database:** (baca aggregate); `reports` untuk job export.
- **API:** analytics endpoints, reports export.
- **UI:** analytics tabs, report page.
- **Components:** chart (shadcn/ui), report selector, export button.
- **Acceptance:** (AC 43–44, 49) outlet & photobox performance; export jalan.
- **Testing:** unit aggregate query, export format.
- **DoD:** report konsisten dengan dashboard.

---

### PHASE 9 — Staff + Multi-Outlet

> **Status (2026-08-19):** `[SELESAI]` — committed `04d51b3`. Staff invite/role (`staff`, `staff/invite`, `staff/[userId]`), RBAC matrix (`src/lib/rbac.ts`), outlet analytics (`outlets/[id]/analytics`). Multi-outlet CRUD dari Phase 3. Test: `tests/phase7.test.ts` (RBAC matrix).

- **Objective:** RBAC & skala outlet.
- **Features:** staff invite/role, RBAC enforcement, outlet analytics, multi-outlet management penuh.
- **Database:** `business_members` (role), outlet analytics.
- **API:** staff endpoints, outlet analytics.
- **UI:** staff table, outlet analytics.
- **Acceptance:** (AC 47) RBAC berjalan; staff tidak otomatis lihat finance penuh.
- **Testing:** RBAC matrix test per role.
- **DoD:** setiap endpoint enforce RBAC server-side.

---

### PHASE 10 — Subscription

> **Status (2026-08-19):** `[SELESAI]` — `src/server/subscription.ts` + `subscription-actions.ts`, halaman `/dashboard/subscription` (status langganan, usage meter vs limit, plan cards pilih plan, cancel di akhir periode / resume, invoice list). Invoice manual periode baru saat ubah plan (renewal MVP). Audit log semua mutasi subscription. Test: `tests/phase10.test.ts`. **Update 2026-09-14:** feature-flag runtime gate `requireFeature()` diimplementasi (`src/server/feature-gate.ts` + `src/lib/feature-gate.ts`); diterapkan di vouchers/finance/reports/staff. Test: `tests/feature-gate.test.ts`.

- **Objective:** Monetisasi SaaS.
- **Features:** plan list, subscription status, upgrade/downgrade/cancel, invoice history, plan limit enforcement global, trial.
- **Database:** `subscriptions`, `invoices`, `plans` (admin-manageable).
- **API:** subscription, plans, invoices.
- **UI:** subscription page, plan cards, invoice list.
- **Acceptance:** (AC 45) subscription status terlihat; upgrade/downgrade/cancel berfungsi.
- **Testing:** plan limit + feature flag enforcement.
- **DoD:** limit & feature gate konsisten di seluruh API.

---

### PHASE 11 — Polish + Security + Testing

> **Status (update 2026-08-30):** `[SEBAGIAN→SIAP]`. Audit logging via `src/server/audit.ts` terpasang di alur finansial/admin (expense CRUD, transaksi manual, `payment.paid` webhook, subscription change/cancel/resume, semua aksi admin). Retention cron harian `/api/cron/retention` (Bearer `CRON_SECRET`) + `vercel.json` schedule. Rate limiting + UI states + a11y dasar ada. E2E script ringan dihapus. **Belum**: load test — dijadwalkan pasca-MVP.

- **Objective:** Hardening & rilis.
- **Features:** audit logging, rate limiting, a11y pass, error/empty/loading state audit, retention job, e2e coverage, performance.
- **Database:** `audit_logs`, retention cron.
- **API:** audit, rate limit.
- **UI:** polish neo-brutalism konsisten.
- **Acceptance:** (AC 48–57) seluruh acceptance criteria terpenuhi.
- **Testing:** e2e penuh, security review, load test dasar.
- **DoD:** siap produksi.

---

### PHASE 12 — Template & Frame Builder (slot foto owner-designed)

> **Status (update 2026-08-30):** `[SELESAI]`. Implementasi aktual: builder di `/dashboard/templates/builder/[id]` (route `src/app/(dashboard)/dashboard/templates/builder/[id]/`), engine composite tunggal `src/lib/compose-frame.ts` (dipakai preview builder + editor kiosk + print), migration `0010-template-layout.sql` (`templates.layout jsonb NOT NULL DEFAULT '{}'` + `0020-template-video.sql` `templates.video_url`), validasi layout server-side (max 8 slot, dalam canvas, `slot_count == package.photo_count`), template legacy (layout kosong) backward compatible. Spec penuh `15-template-builder.md`.

- **Objective:** Owner upload frame PNG transparan + definisikan slot foto (kotak/shape) via builder; hasil foto customer otomatis ter-composite pas ke slot.
- **Features:** Template Builder drag-and-drop (`/dashboard/templates/builder/[id]`), shape `rect`/`rounded`/`circle`/`ellipse` + rotate + fit cover/contain, preview dengan foto sample, engine composite tunggal `composeFrame` (builder-preview + editor kiosk + print), kiosk slot-fit (zoom/pan clamp per slot), filter assign `slot_count == package.photo_count`, backward compatible template legacy (layout kosong).
- **Database:** `ALTER TABLE templates ADD COLUMN layout jsonb NOT NULL DEFAULT '{}'` + validasi schema server-side (max 8 slot, dalam batas canvas).
- **API:** `POST/PATCH templates` menerima `layout`; `GET /public/:slug/templates?package=` memfilter `slot_count` & return layout + signed URL.
- **UI:** `TemplateBuilder`, `SlotShape`, `SlotPropertiesPanel`, `TemplatePreview`; update `TemplatePicker` (thumbnail preview slot terisi) & `EditorCanvas` (slot-fit).
- **Components dependencies:** `EditorCanvas`, `PrintLayoutRenderer` refactor ke `composeFrame`.
- **Acceptance:** (AC 63–68) lihat §12.6.
- **Testing:** unit — validasi layout, matematika cover-fit, composite deterministik; e2e — owner buat template ber-slot → customer sesi → foto pas slot.
- **DoD:** satu engine composite dipakai semua renderer; template lama tetap jalan.

---

- **Unit:** perhitungan harga (final amount, voucher discount, profit), validasi voucher, RBAC matrix, canvas helper.
- **Integration:** webhook → payment → transaction (idempotency), plan limit, tenant isolation.
- **E2E:** alur owner (onboarding→launch) & alur customer (capture→checkout→result) dengan payment mock.
- **Security:** signature validation, unauthorized access lintas tenant, secret leak scan, upload validation.
- **Accessibility:** a11y lint (axe), keyboard nav manual check.

## 12.6 Acceptance Criteria (MVP — 68 items)

1. User dapat register.
2. User dapat memilih subscription.
3. User dapat membuat business.
4. User dapat membuat outlet.
5. User dapat membuat Photobox.
6. User dapat mengatur branding.
7. User dapat membuat package.
8. User dapat upload template.
9. User dapat membuat voucher.
10. Customer dapat membuka Photobox.
11. Customer dapat memilih package.
12. Customer dapat memilih template.
13. Customer dapat menggunakan camera.
14. Customer dapat melakukan countdown.
15. Customer dapat mengambil foto.
16. Customer dapat retake.
17. Customer dapat membuat photostrip.
18. Customer dapat melakukan basic editing.
19. Customer dapat masuk checkout.
20. Customer dapat memasukkan voucher.
21. Backend dapat memvalidasi voucher.
22. Backend dapat menghitung discount.
23. Backend dapat menghitung final amount.
24. Customer dapat membayar melalui QRIS.
25. QRIS dapat ditampilkan pada checkout.
26. Payment status dapat diverifikasi.
27. Webhook dapat diproses.
28. Duplicate webhook tidak menghasilkan duplicate transaction.
29. Payment expired dapat ditangani.
30. Payment failed dapat ditangani.
31. Setelah payment berhasil, customer mendapatkan result.
32. Customer dapat download.
33. Customer dapat memperoleh QR photo.
34. Transaction tercatat otomatis.
35. Revenue masuk ke dashboard.
36. Discount tidak dihitung sebagai revenue.
37. Owner dapat melihat gross revenue.
38. Owner dapat melihat net revenue.
39. Owner dapat melihat expenses.
40. Owner dapat melihat estimated profit.
41. Owner dapat melihat transaction history.
42. Owner dapat melihat voucher usage.
43. Owner dapat melihat outlet performance.
44. Owner dapat melihat Photobox performance.
45. Subscription status dapat dilihat.
46. Data setiap business terisolasi.
47. RBAC berjalan.
48. Dashboard menggunakan shadcn/ui.
49. Chart menggunakan shadcn/ui Charts.
50. Seluruh interface menggunakan Neo-Brutalism.
51. Landing page menggunakan Neo-Brutalism.
52. Customer Photobox menggunakan Neo-Brutalism.
53. Checkout menggunakan Neo-Brutalism.
54. Responsive.
55. Accessible.
56. Camera failure memiliki fallback.
57. Payment secrets tidak terekspos ke frontend.
58. Pembayaran terjadi sebelum sesi foto (pay-first).
59. Timer sesi di-enforce server-side; timeout sebelum bayar → reset Welcome; timeout setelah bayar → auto-finalize (tetap print + QR result).
60. Finalisasi sesi memicu auto-print otomatis (Chrome kiosk).
61. Halaman result online menyediakan unduh GIF animasi + foto berframe.
62. Setup permission kamera/printer hanya sekali saat device pairing — tidak muncul di flow customer.
63. Owner dapat menambahkan slot foto (kotak/shape) pada frame yang di-upload via Template Builder, lalu publish.
64. Customer memilih frame → hasil foto ter-composite pas ke setiap slot (cover-fit, rasio tidak terdistorsi).
65. Template dengan `slot_count ≠ package.photo_count` tidak bisa di-assign dan tidak muncul di pilihan customer.
66. Hasil print & result online identik dengan preview builder (satu engine composite).
67. Template lama (layout kosong) tetap berfungsi (backward compatible).
68. `layout` divalidasi server-side — request invalid ditolak 4xx.

> Catatan v2: AC 10–33 dijalankan dalam urutan **pay-first** (pilih package → bayar → frame → foto → edit → print → result). Acuan urutan: `05-customer-photobox.md`.

## 12.7 Definition of Done (global)

Suatu fitur dianggap selesai jika:

1. Implementasi sesuai spec (PRD) & konsisten nama entity/endpoint.
2. Server-side authorization & tenant scope diterapkan (bukan hanya UI).
3. Backend jadi source of truth untuk harga/voucher/payment.
4. Error, loading, empty state tersedia.
5. Neo-Brutalism & shadcn/ui konsisten.
6. Responsive & accessible.
7. Unit/integration test ditulis & hijau.
8. Lint & typecheck hijau.
9. Tidak ada secret/credential di client.
10. Audit log untuk aksi finansial/admin (bila relevan).

## 12.8 Future Scalability

Arsitektur mendukung pertumbuhan ke: multi-tenant, multi-outlet, multi-photobox, multi-staff, multi-payment-provider, multi-plan subscription, tanpa rewrite besar:

- Payment via `PaymentService` abstraction (tambah provider = tambah adapter).
- Plan/limit/feature via data (`plans`) bukan hardcode.
- Tenant scope terpusat pada helper (bukan tersebar).
- Storage terpisah & retention configurable.
- Report/analytics dibaca dari `transactions` (single source of truth).
