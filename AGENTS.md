# AGENTS.md — SnapyOS Project Instructions

Repositori ini berisi PRD (`docs/*.md` = source of truth keputusan produk) **dan** implementasi Next.js yang sudah berjalan (`src/`, `db/`, `tests/`). Docs-only hanyalah sejarah awal; kode sekarang adalah kenyataan yang harus diaudit sebelum diubah (lihat `docs/pos/00-audit.md`).

## Skill Wajib (load SEBELUM menulis kode frontend/UI apa pun)

Sebelum menulis komponen, halaman, styling, atau markup visual apa pun, WAJIB memanggil tool `skill` untuk nama-nama berikut (urutan prioritas konflik — PRD SnapyOS selalu menang):

1. `industrial-brutalist-ui` — **default & satu-satunya bahasa visual UI/UX SnapyOS** (Neo-Brutalism, Swiss Industrial Print + Tactical Telemetry) untuk marketing, auth, kiosk customer, result page, shell dashboard owner/admin/staff, dan seluruh API response — lihat `KUNCI ESTETIKA` di bawah.
2. `design-taste-frontend` — anti-slop: brief inference, anti-default discipline, typography, layout diversification, AI-tells ban, copy audit.
3. `full-output-enforcement` — output lengkap, larangan `// ...` / `// TODO` / placeholder / skeleton.
4. `high-end-visual-design` — **HANYA** dipakai untuk standar interaksi (motion, state, feedback) yang **tidak mengubah estetika**; bagian visual/aesthetic-nya **TIDAK dipakai** dan kalah total dari Neo-Brutalism.

Detail & resolusi konflik: `docs/13-skill-anti-slop.md` (skill mapping §13.1, prioritas §13.2, override table §13.2, pre-flight §13.6).

## KUNCI ESTETIKA (single aesthetic — brutalist)

- **Neo-Brutalism adalah satu-satunya bahasa visual untuk seluruh UI SnapyOS** — marketing, auth, kiosk customer, result page, shell dashboard owner/admin/staff — `src/styles/tokens.css` + `globals.css` §`@layer base`.
- **Dilarang** estetika lain: minimalist-ui, glassmorphism, "premium luxury", soft/rounded SaaS, dark-mesh AI landing, shell shadcn default. (Dual-shell Dashboard-01 pernah ada, **dihapus 2026-08-30** — satu dashboard brutalist saja.)
- Scope brutalist **wajib** untuk: `(marketing)/*`, `(auth)/*`, `(dashboard)/*`, `(staff)/*`, `(pos)/*`, `app/p/**` (kiosk publik), `app/r/**` (result online), `app/api/**` (response), seluruh `globals.css`.
- Skill desain lain (mis. `high-end-visual-design`) hanya menyumbang perilaku interaksi, bukan tampilan.

## Source of Truth (urutan prioritas)

1. `docs/11-design-system.md` + `docs/13-skill-anti-slop.md` — design system & aturan anti-slop (sumber kebenaran gaya brutalist).
2. `DESIGN.md` — semantic design system (tokens, typography, components, motion, bans).
3. `docs/pos/00-audit.md` — ruang lingkup & status POS add-on.
4. `docs/07-database-schema.md` + `docs/08-api-spec.md` — nama entity, enum, endpoint.

## Resolusi Konflik (Conflict Resolution)

Hierarki deterministik saat sumber berbeda:

1. **Kode berjalan** (`src/`, `db/schema.sql`, `tests/`) = kenyataan aktual. Audit dulu, baru ubah kode ATAU perbarui docs jika kode ternyata benar.
2. **`db/schema.sql`** = kontrak database. Kode aplikasi harus konsisten dengan schema; jika berbeda, schema menang.
3. **`docs/07-database-schema.md` + `docs/08-api-spec.md`** = kontrak nama entity, enum, endpoint. Harus cerminkan schema.sql; jika drift, perbarui docs.
4. **PRD fitur** (`docs/01`–`docs/06`, `docs/09`, `docs/10`, `docs/14`, `docs/15`) = aturan bisnis. File bernomor lebih rendah menang **kecuali** ada override eksplisit di changelog `docs/README.md` (contoh: v1.1 pay-first override).
5. **Design system** (`docs/11`, `docs/13`, `DESIGN.md`) = gaya visual & anti-slop.
6. **`docs/pos/00-audit.md`** = inventaris historis POS; sudah terimplementasi, bersifat referensi.

Aturan resolusi:

- **Kode ≠ PRD**: kode adalah kenyataan; buat audit item, lalu ubah kode (atau ubah PRD jika kode benar).
- **PRD ≠ PRD**: file bernomor rendah menang, kecuali override eksplisit di `docs/README.md` changelog.
- **Schema ≠ kode**: `db/schema.sql` menang — kode harus ikuti kontrak DB.
- **Lifecycle subscription**: `isSubscriptionEffective()` di `src/lib/subscription-math.ts` adalah gate satu-satunya; status DB + tanggal kedaluwarsa harus diperiksa bersama — status string saja **tidak cukup**.

## Aturan kunci

- **Neo-Brutalism (industrial-brutalist-ui) = satu-satunya bahasa visual UI/UX SnapyOS** untuk marketing/auth/kiosk/result/shell dashboard/API. Tidak ada estetika UI/UX lain (Dashboard-01 dual-shell dihapus 2026-08-30).
- **Uang selalu integer IDR** (tidak ada floating-point).
- **Upload logo tanpa SVG** — allowlist logo hanya PNG/JPG/WebP (`src/lib/upload-validation.ts`); SVG berisiko XSS. Key storage wajib lewat guard path-traversal `r2Key`; id layar kiosk (`page`) wajib allowlist `KIOSK_PAGE_IDS`.
- **Rate limit pakai shared store di production** — `src/lib/rate-limit.ts` memakai Upstash (`UPSTASH_REDIS_REST_URL`+`UPSTASH_REDIS_REST_TOKEN`) bila di-set; fallback in-memory. Fail-closed di production saat backend error. Interface async `rateLimit(key, limit, windowMs)`.
- **Dependency audit hijau** — tidak boleh ada advisory `critical` (`npm audit`); transitive dev-time boleh tercatat residual.
- **Backend = source of truth** harga/voucher/payment; frontend tidak pernah dipercaya. Payment QRIS memakai reservation `creating` + partial unique index satu payment aktif per checkout/invoice; webhook paid wajib validasi amount/order serta server-to-server status provider sebelum settlement.
- **Route single-domain** (saling eksklusif, tidak ada tabrakan):
  - `/` landing · `/login` `/register` auth · `/welcome` pemilih peran (tanpa membership) · `/onboarding/create-business` buat bisnis · `/dashboard/*` owner · `/staff/*` shell operasional staff (read-only) · `/admin/*` admin (CEO) · `/pos/*` terminal POS (add-on — **TERIMPLEMENTASI** sesuai REVISI v2 `docs/pos/`: offline-only cash, per-booth `photoboxes.pos_enabled`, dipakai staff tanpa role baru) · `/p/[businessSlug]/[photoboxSlug]` kiosk · `/r/[token]` result online · `/api/*` API/webhook.
- Alur customer = **pay-first** (bayar via gateway merchant owner: Pakasir/Midtrans/Tripay credential direct; tanpa credential aktif kiosk hanya voucher + tunai) — `docs/05-customer-photobox.md`, `docs/06-checkout-payment.md`. Aggregator QRIS Pakasir platform (dana → akun SaaS) **dihapus dari alur kiosk 2026-09-18**; env `PAKASIR_*` tinggal untuk invoice subscription (dana → SnapyOS). **Exception resmi**: mode offline kiosk (`business_settings.checkout.offline_enabled`, default false) — owner opt-in via dashboard, server-gated, transaksi offline `payment_method='offline'` non-withdrawable by design (tidak masuk saldo owner). Cash payment juga sah untuk kiosk PWA.
- **Payment provider: direct merchant owner-first** — credential Pakasir/Midtrans/Tripay per business dikelola owner di `/dashboard/settings/payment` (server actions `src/server/payment-credential-actions.ts`); env `PAKASIR_API_KEY`, `PAKASIR_PROJECT_SLUG`, `PAKASIR_WEBHOOK_URL` hanya untuk invoice subscription aggregator. Webhook aktif: `/api/webhooks/payment/{pakasir,midtrans,tripay}`.
- Pre-flight checklist `docs/13` §13.6 wajib sebelum declare done.

## Nama yang harus konsisten

- `business_members` (bukan `staff_roles`).
- `transactions` = source of truth financial reporting; `payments` = detail settlement.
- Error standar termasuk `SESSION_EXPIRED` (HTTP 410).

<!-- antislop:start -->
## antislop

For UI, copy, people, mobile layout, or code comments work, read `~/.agents/skills/antislop/SKILL.md` (core) and then the skill for the task:
- UI / visual: `~/.agents/skills/antislop-ui/SKILL.md`
- Copy & text: `~/.agents/skills/antislop-copywriting/SKILL.md`
- People: `~/.agents/skills/antislop-human/SKILL.md`
- Mobile / responsive: `~/.agents/skills/antislop-layoutmobile/SKILL.md`
- Code comments: `~/.agents/skills/antislop-code/SKILL.md`
Before starting, ask the user when antislop applies: during the work, or after it is done.
<!-- antislop:end -->

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
