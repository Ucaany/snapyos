# SnapyOS — Build your own Photobox

**"Build your own Photobox. Run your business in one place."**

Platform SaaS untuk UMKM & pemilik bisnis Photobox / Photo Booth. Photobox Business Operating System: customer-facing photobox app, photo capture, template & frame, branding, package, QRIS, voucher, transaksi, revenue dashboard, finance, multi-outlet, staff, dan subscription — satu sistem.

## Dokumentasi

PRD dan dokumentasi teknis ada di [`docs/`](./docs/README.md). Panduan development: [`AGENTS.md`](./AGENTS.md) dan design system [`DESIGN.md`](./DESIGN.md).

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Neo-Brutalism), Lucide — kiosk berjalan sebagai **PWA** (Android/iOS tablet & phone)
- **Backend:** Next.js Route Handlers + Server Actions
- **Data:** Supabase (PostgreSQL + Storage; Realtime tidak dipakai — status payment via polling 3s), server-only service-role client
- **Auth:** Auth.js v5 (NextAuth) — credential email/password, argon2id, JWT + DB revocation (`auth_sessions`)
- **Payment:** Pakasir (pakasir.com — QRIS aggregator)
- **Visual:** Full Neo-Brutalism (single aesthetic lock — satu dashboard brutalist)

## Struktur Kunci

```
src/
  app/           # route groups: (marketing), (auth), (dashboard), (admin), (staff), (pos),
                 # p/[businessSlug]/[photoboxSlug], r/[token], welcome/, onboarding/, api/
  components/ui/ # shadcn/ui — dikustomisasi Neo-Brutalism
  lib/           # auth, supabase, utils
  styles/        # tokens.css — single source of truth design token
db/schema.sql    # DDL lengkap + index + seed (docs/07)
db/migrations/   # migrasi inkremental untuk DB yang sudah jalan
```

## Setup

```bash
npm install
cp .env.example .env.local   # isi SUPABASE_*, AUTH_SECRET, dll.
npm run dev
```


## Database (Supabase cloud) & Migrasi

Produksi memakai **Supabase cloud Postgres** (`https://fdpgmkznhduhxwvohlev.supabase.co`), diakses lewat PostgREST via `@supabase/supabase-js` — **tidak ada driver `pg` langsung**. Media storage (foto) disimpan di **Cloudflare R2** (objek, bukan database) dengan fallback Supabase Storage — **Cloudflare R2 ≠ database**, hanya penyimpanan objek.

```bash
# Bootstrap fresh DB (dev)
psql -f db/schema.sql

# DB existing: jalankan db/migrations/ berurutan ascending
# Untuk DB cloud tanpa psql → dua opsi:
#  a) Supabase SQL Editor: paste isi db/migrations/APPLY_0061_0062_combined.sql
#  b) psql:
psql "postgresql://postgres.<ref>:<DB_PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
  -f db/migrations/APPLY_0061_0062_combined.sql

# Backfill setelah 0062 (sekali, idempotent)
node scripts/backfill-storage-usage.mjs
```

- **Belum diterapkan ke cloud (audit 2026-10-07): `0061`, `0062`.** Setelah apply, verifikasi via `GET /rest/v1/storage_usage?select=business_id&limit=1` — harus `200`, bukan `PGRST205`.
- `0061` = plan device/addon model (DML UPDATE pada `plans`); `0062` = storage_usage accounting (`storage_objects` + `storage_usage` + RPC `storage_account_add`/`storage_account_sub`).
- Migrasi `0062` **WAJIB diterapkan sebelum mengaktifkan enforcement kuota storage / deploy rilis accounting ini**: jalur tulis (`accountStorageAdd`/`accountStorageSub`) fail-open (error di-log, lanjut), tetapi jalur baca enforcement (`assertStorageAvailable` → `getBusinessUsedBytes(id, failOpen=false)`) **fail-closed — melempar** saat query gagal, dan pemanggilnya (`src/server/branding.ts`, `src/server/kiosk-sessions.ts:402`, `src/server/templates.ts`) `await` tanpa try/catch, sehingga upload/finalize bisa 500 di DB tanpa `0062`.

## Scripts

```bash
npm run dev          # dev server
npm run build        # production build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run test         # unit tests (node:test)
npm run format       # prettier --write
```

## Cron retention (verifikasi dev)

`/api/cron/retention` membersihkan media hasil foto lewat `retention_days`
(docs/09) & auto-expire sesi stagnan. Auth: Bearer `CRON_SECRET`
(fail-closed; kosong = tolak, kecuali dev `RETENTION_CRON_OPEN=1`).

```bash
# .env.local: CRON_SECRET=<random> (openssl rand -hex 32) — jangan commit asli
npm run dev
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/retention
# → 200 {"data":{"cleanedSessions":0,"removedObjects":0}}
```

## Status Fase (docs/12-roadmap-mvp.md — update 2026-08-30)

- **Phase 0–12: SELESAI.** Auth + multi-tenant, dashboard, photobox builder, kiosk pay-first, checkout + voucher, Pakasir QRIS (webhook + polling + recovery), transactions/finance, reports/analytics, staff multi-outlet, subscription (+ promos), polish/security (audit log, retention cron, e2e script ringan), Template & Frame Builder (`composeFrame`, layout slot).
- **POS add-on: SELESAI** (`docs/pos/`) — kasir offline-only (cash/bank_transfer/other) per booth (`photoboxes.pos_enabled`), dipakai staff tanpa role baru; tanpa QRIS; migration `0019`.
- **Test:** jalankan `npm test` untuk hasil current; angka historis bukan status current.
- **Sisa backlog (jujur):** bookings UI, event mode, refund state machine, e2e Playwright formal, load test, REST subscription/addons.

## Decisions (Phase 0)

- **State management (realita):** Server Components + Server Actions; TanStack Query & Supabase Realtime tidak dipakai; status payment = polling 3s (`useQrisPolling`).
- **i18n:** Indonesia-only, hardcode string (tanpa framework).
- **Uang:** selalu integer IDR, tidak ada floating-point.
- **Backend = source of truth** harga/voucher/payment.
