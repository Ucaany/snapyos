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

- **Sudah diterapkan ke cloud** (diverifikasi 2026-10-20 lewat probe PostgREST): `0061`, `0062`, `0063`, `0068`, `0069`, `0070`. `0069` menghadirkan RPC kuota atomik (`create_outlet_with_quota`, `create_photobox_with_quota`, `add_business_member_with_quota`) yang dipanggil `src/server/outlets.ts`, `photoboxes.ts`, dan `staff.ts`.
- **Belum diterapkan:** `0073_pos_receipt_snapshot_and_untracked_stock.sql` lalu `0074_pos_payment_idempotency_race.sql` — wajib sebelum deploy kode POS terbaru; menambah kolom snapshot struk, RPC order/item atomic, RPC toggle booth atomic, mencegah pembayaran retry mengurangi stok dua kali, dan menandai transaksi POS offline `withdrawable=false`. Setelah menjalankan SQL, refresh schema cache PostgREST lalu ulangi E2E transaksi POS.
- **Belum diterapkan (sengaja):** `0071_rpc_search_path_hardening.sql`. Ini keputusan pemilik, lihat `docs/status.md`. Jalankan sebelum mengaktifkan hardening `search_path` di produksi.
- `0061` = plan device/addon model (DML UPDATE pada `plans`); `0062` = storage_usage accounting (`storage_objects` + `storage_usage` + RPC `storage_account_add`/`storage_account_sub`).
- Jalur baca enforcement storage (`assertStorageAvailable` → `getBusinessUsedBytes(id, failOpen=false)`) **fail-closed: melempar** saat query gagal. Pemanggilnya (`src/server/branding.ts`, `src/server/kiosk-sessions.ts`, `src/server/templates.ts`) `await` tanpa try/catch, jadi `0062` wajib ada di setiap environment sebelum upload/finalize dipakai.

## Scripts

```bash
npm run dev              # dev server
npm run build            # production build
npm run start            # jalankan hasil build (standalone; memuat .env.local bila ada)
# `build` otomatis menyiapkan `.next/standalone` beserta asset static/public
npm run lint             # eslint
npm run typecheck        # tsc --noEmit
npm run test             # unit tests (node:test)
npm run verify           # lint + typecheck + test + build (gate rilis)
npm run test:e2e         # seluruh suite E2E Playwright
npm run test:e2e:kiosk   # E2E kiosk (aktivasi, kamera, bayar, hasil, responsif)
npm run test:e2e:bluetooth  # E2E printer Bluetooth
npm run test:e2e:print   # E2E cetak standalone
npm run format           # prettier --write
npm run format:check     # prettier --check (gate rilis)
```

### Audit rilis (2026-10-21)

Gate yang diverifikasi di mesin pengembang sebelum deploy:

```bash
npm run typecheck        # PASS
npm run lint             # PASS, 0 error, 12 warning <img> yang disengaja
npm test                 # PASS 957/957
npm run build            # PASS (Next.js 16, 93 static pages)
npm run format:check     # PASS untuk file scope audit; repo-wide masih memiliki 34 file legacy tidak terformat
npm run test:e2e:print   # PASS 4/4
npm run test:e2e:bluetooth # PASS 2/2 suite (12 assertion: BLE 2, SPP/foto 10)
node tests/e2e/pos-receipt-serial.spec.mjs # BLOCKED sampai migration 0073–0074 diterapkan
```

### Cetak thermal Bluetooth (2026-10-20)

- **BLE (Web Bluetooth)** untuk printer ESC/POS yang mengiklankan GATT service.
  Chrome/Edge desktop dan Android; iOS/iPadOS tidak mendukung Web Bluetooth.
- **Classic SPP (Web Serial)** untuk printer seperti RPPO2N yang hanya punya
  profil SPP. Pair di OS, lalu pilih **Printer Classic (SPP) · Web Serial**.
  Web Serial hanya tersedia di Chrome/Edge desktop, bukan Android/iOS.
- Struk POS mengikuti `print_settings.bluetooth_paper_width_mm` per booth:
  58mm = 32 kolom, 80mm = 48 kolom. Setiap baris diuji agar lebar fisiknya
  (termasuk font 2x) tidak melewati kolom.
- Panel uji printer menyediakan sampel **Foto nyata** (raster 1-bit) selain pola
  teks, sehingga hasil cetak foto dan struk dapat diverifikasi terpisah.
- Status "terkirim" berarti byte ESC/POS sudah ditulis ke port, bukan konfirmasi
  kertas. Hasil fisik tetap harus diperiksa petugas.

E2E kiosk dijalankan headed satu suite pada satu waktu:

```bash
E2E_HEADED=1 node tests/e2e/kiosk-smoke.spec.mjs       # 6/6
E2E_HEADED=1 node tests/e2e/kiosk-lock.spec.mjs        # 7/7
E2E_HEADED=1 node tests/e2e/kiosk-frames.spec.mjs      # 5/5
E2E_HEADED=1 node tests/e2e/kiosk-responsive.spec.mjs  # 15/15
```

Audit fitur juga mencakup CRUD owner (outlet, paket, photobox, tiket bantuan),
staff (invite/role), payment credential (enkripsi secret, toggle), dan aksi admin
(plan, promo, user, settings) — semuanya diverifikasi ke database dan dibersihkan
setelah tes. Ringkasan temuan ada di `docs/18-audit-report.md`.

Catatan environment: `AUTH_URL` di `.env.local` harus sama dengan origin dev
(`http://localhost:3000`); jika tidak, login berhasil tetapi redirect kembali ke
halaman login. `DEV_SKIP_PAYMENT=true` hanya untuk jalur E2E kiosk lokal.

E2E memerlukan dev server berjalan dan data seed booth; lihat `tests/e2e/README.md`.

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
