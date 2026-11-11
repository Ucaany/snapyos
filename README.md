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
- **Kiosk:** PWA browser untuk tablet/phone; kamera, printer, dan sesi memakai bridge lokal opsional

## Struktur Kunci

```
src/
  app/           # route groups: (marketing), (auth), (dashboard), (admin), (staff), (pos),
                 # p/[businessSlug]/[photoboxSlug], r/[token], welcome/, onboarding/, api/
  components/ui/ # shadcn/ui — dikustomisasi Neo-Brutalism
  lib/           # auth, supabase, utils
  styles/        # tokens.css — single source of truth design token
runtime/         # bridge lokal (node:sqlite + HTTP /v1/* di loopback, token bridge)
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

Status migrasi cloud **diterapkan dan diverifikasi 2026-10-27**. Jalankan `node scripts/probe-migration-status.mjs` (exit 0 = cocok); skrip itu memakai probe PostgREST plus katalog Postgres via `supabase db query --linked` untuk index, aksi `ON DELETE`, dan signature fungsi. Hasil akhir: **13 applied, 0 not applied, 0 unverifiable, 0 error**.

- **Sudah diterapkan (terukur):** `0061`, `0062`, `0063`, `0068`, `0069`, `0070`, **`0072`**, **`0073`**, **`0074`**, **`0075`**, **`0076`**, **`0077`**, **`0078`**, **`0079`**, **`0080`**. `0069` menghadirkan RPC kuota atomik (`create_outlet_with_quota`, `create_photobox_with_quota`, `add_business_member_with_quota`) yang dipanggil `src/server/outlets.ts`, `photoboxes.ts`, dan `staff.ts`.
- **`0072`/`0075`/`0076` diterapkan 2026-10-27** lewat `db/migrations/APPLY_0072_0075_0076_combined.sql` (idempotent, tiga blok transaksi terpisah). Verifikasi: label add-on menjadi `Tambah Storage 1.024 MB`; FK `photoboxes_default_template_id_fkey` ada dengan `on delete set null`; RPC `pos_decrement_stock_batch` ada, `service_role`-only, `search_path` ter-pin, dan diuji fungsional (decrement normal, shortfall tidak mengubah stok, stok `null` selalu `ok`, qty 0 diabaikan, isolasi tenant menolak bisnis lain).
- **Belum diterapkan (sengaja):** `0071_rpc_search_path_hardening.sql`. Ini keputusan pemilik, lihat `docs/status.md`. Catatan: `0073`, `0074`, dan `0076` sudah memakai `set search_path = public, pg_temp` di definisinya, jadi RPC tersebut sudah ter-pin tanpa `0071`.
- **`0075`/`0078`/`0079` diverifikasi lewat katalog Postgres** (PostgREST tidak mengekspos index maupun aksi FK): 3 index `0075` + 3 index `0078` ada; keempat FK `customers` di `sessions`/`transactions`/`pos_orders`/`voucher_usages` memakai `confdeltype = 'r'` (RESTRICT) sesuai `0079`.
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
npm run verify           # lint + typecheck + build (gate rilis)
npm run format           # prettier --write
npm run format:check     # prettier --check (gate rilis)
npm run bridge:local     # runtime booth lokal di 127.0.0.1:17777 (butuh PHOTOBOOTH_BRIDGE_TOKEN)
npm run bridge:gphoto2   # sama, adapter kamera DSLR via gphoto2
```

### Audit rilis (2026-10-21)

Gate yang diverifikasi di mesin pengembang sebelum deploy:

```bash
npm run typecheck        # PASS (exit 0)
npm run lint             # PASS, 0 error, 12 warning <img> yang disengaja
npm run build            # PASS (Next.js 16, 93 static pages + standalone)
node scripts/probe-migration-status.mjs    # PASS 13/13 applied, exit 0
```

> **Pembaruan 2026-10-28 — audit template & chroma.** Empat jalur render
> (builder preview, editor kiosk, cetak, GIF) dirapikan agar satu kontrak:
>
> - **Chroma key tidak lagi menghitam.** Piksel yang dihapus chroma key
>   sebelumnya jatuh ke transparan, lalu di-encode JPEG (tanpa alpha) menjadi
>   hitam. Kini `composeFrame` mengisi `layout.canvas.background` (default
>   `#ffffff`) sebelum slot, dan jalur legacy mengisi hal yang sama di
>   `drawPhoto`. Builder punya pemilih **warna dasar**; `layoutSchema` menolak
>   nilai bukan hex. Detail: `docs/15-template-builder.md` §15.2/§15.4.
> - **Teks & stiker kini di atas frame.** Sebelumnya overlay digambar di dalam
>   foto (ter-clip slot, lalu tertutup frame). Sekarang `composeFrame` menerima
>   `options.overlays` dan menggambarnya setelah frame; jalur legacy memakai
>   `drawOverlayLayer` setelah `drawFrameOverlay`.
> - **Layout template global admin divalidasi** dengan `layoutSchema`
>   (`updateGlobalTemplateLayout`). Sebelumnya JSON mentah tersimpan apa adanya
>   dan layout rusak diam-diam terbaca sebagai legacy (`slotCount` = 0).
> - **GIF sesuai tipe template.** Frame ber-slot menghasilkan satu composite,
>   jadi GIF memakai capture mentah; template legacy memakai foto berframe.
>   Validasi jumlah capture hanya jalan bila `gif_photos` dikirim, sehingga
>   klien lama tanpa field itu tetap bisa finalize.
> - **Chroma key per booth kini bisa dinyalakan owner** dari Setelan Booth
>   (`BoothSettingsPanel` → grup Kamera), bukan hanya default global admin.
> - **Builder:** pembulatan slot dilakukan sebelum clamp (sebelumnya
>   `x=0.5,w=1199.5` bisa jadi `1+1200 > 1200` dan ditolak server); editor
>   memetakan slot aktif ke indeks foto lewat `fillSlots`.
>
> Gate setelah perubahan: `typecheck` PASS, `lint` PASS (0 error), `build`
> PASS. Risiko residual (jujur): `sessions` belum menyimpan `template_id` — lihat
> `docs/15-template-builder.md` §15.10.
>
> Audit Cloudflare/R2 (checklist cloud & deployment): bucket privat dengan
> signed URL TTL 1 jam (`SIGNED_URL_TTL_SECONDS`), `r2Key()` menolak path
> traversal, CORS hanya origin aplikasi dan metode `GET`/`HEAD`
> (`scripts/configure-r2-cors.mjs`), kredensial `server-only` tanpa prefix
> `NEXT_PUBLIC_` (`src/lib/r2/config.ts`). Tidak ada temuan baru; eksposur
> bucket/CORS live tetap `needs_validation` karena itu keputusan akun.

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

Audit fitur juga mencakup CRUD owner (outlet, paket, photobox, tiket bantuan),
staff (invite/role), payment credential (enkripsi secret, toggle), dan aksi admin
(plan, promo, user, settings) — semuanya diverifikasi ke database dan dibersihkan
setelah tes.

Catatan environment: `AUTH_URL` di `.env.local` harus sama dengan origin dev
(`http://localhost:3000`); jika tidak, login berhasil tetapi redirect kembali ke
halaman login. `DEV_SKIP_PAYMENT=true` hanya untuk jalur E2E kiosk lokal.

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
- **Sisa backlog (jujur):** bookings UI, event mode, refund state machine, e2e Playwright formal, load test, REST subscription/addons.

## Decisions (Phase 0)

- **State management (realita):** Server Components + Server Actions; TanStack Query & Supabase Realtime tidak dipakai; status payment = polling 3s (`useQrisPolling`).
- **i18n:** Indonesia-only, hardcode string (tanpa framework).
- **Uang:** selalu integer IDR, tidak ada floating-point.
- **Backend = source of truth** harga/voucher/payment.
