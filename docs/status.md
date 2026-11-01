# Feature Status

Status: active
Audience: owner, staff, admin, developer, operator
Last updated: 2026-10-26
Last verified: 2026-10-26
Source of truth: `src/`, `runtime/`, `db/schema.sql`, `README.md`

## Active

| Area                                    | Status                                                  | Canonical source                                                   |
| --------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------ |
| Auth.js credential auth                 | Active                                                  | `src/lib/auth.ts`, `auth_sessions`                                 |
| Multi-tenant business                   | Active                                                  | `businesses`, `business_members`, tenant helpers                   |
| Owner dashboard                         | Active                                                  | `src/app/(dashboard)/dashboard/`                                   |
| Staff shell                             | Active, operational read-only                           | `src/app/(staff)/staff/`                                           |
| Admin platform                          | Active                                                  | `src/app/(admin)/admin/`                                           |
| Customer kiosk                          | Active, pay-first                                       | `src/app/p/[businessSlug]/[photoboxSlug]/`                         |
| Online result                           | Active                                                  | `src/app/r/[token]/`                                               |
| Direct merchant payment                 | Active                                                  | Pakasir, Midtrans, Tripay credentials per business                 |
| Voucher payment                         | Active                                                  | public checkout actions and voucher server logic                   |
| Offline cash kiosk                      | Active when owner enables it                            | `business_settings.checkout.offline_enabled`                       |
| POS add-on                              | Active, offline-only                                    | `src/server/pos-actions.ts`, `photoboxes.pos_enabled`              |
| Template builder                        | Active                                                  | `src/components/dashboard/TemplateBuilder.tsx`                     |
| Storage quota                           | Active when plan feature is enabled                     | `src/server/storage-usage.ts` (jumlah kedua provider)              |
| Dual storage (R2 write + Supabase read) | Active — Fase 3                                         | `src/server/storage` (`getWriteStorage`, `resolveStorage`)         |
| Kiosk offline runtime (lokal)           | Active — sesi lokal + sync ke cloud                     | `runtime/` (`node:sqlite`, `/v1/*` loopback, token bridge)         |
| Setelan device dan kustomisasi booth | Active — panel lokal, `appearance_settings` menang atas cloud | `src/components/kiosk/BoothSettingsPanel.tsx`, `src/lib/appearance-merge.ts` |

## Partial or constrained

| Area              | Constraint                                                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Camera control    | Dua provider: browser `getUserMedia` (default) dan DSLR via bridge lokal `gphoto2`. Bridge wajib token; hardware fisik belum diuji di mesin ini.                                     |
| Printing          | Tiga jalur: dialog OS (`window.print()`), thermal ESC/POS (Web Bluetooth / Web Serial), dan CUPS via bridge lokal. Tidak ada antrean server; "terkirim" bukan konfirmasi kertas.     |
| Subscription REST | Subscription actions use server actions and dashboard pages. No public REST contract is exposed.                                                                                     |
| Owner CRUD REST   | Most owner CRUD uses server actions. Only documented device, customer detail, report, and activation routes remain.                                                                  |
| Runtime offline   | Boot offline hanya setelah satu kunjungan online sukses (cache SW + `meta` slug). Tanpa `SNAPYOS_CLOUD_URL`/`SNAPYOS_DEVICE_TOKEN`, sesi menumpuk lokal dan tidak pernah tersinkron. |

## Security hardening (2026-10-08)

Selesai (migrasi `0064`–`0066`, commit per phase):

| Temuan                | Perbaikan                                                                            | Migrasi/Test                               |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------ |
| C1 RLS                | RLS + policy `svc_all` service_role di semua tabel publik; revoke anon/authenticated | `0064`; `tests/rls-coverage.test.ts`       |
| C2 webhook invoice    | `provider_signature` null tidak auto-pass; Pakasir wajib server-to-server            | `tests/pakasir-invoice-webhook.test.ts`    |
| C3 cash gate          | `confirmCashPaymentAction` gated `requireEffectiveSubscription(write)`               | `tests/subscription-gate.test.ts`          |
| C4 offline queue      | purge sekali-jalan (flag), antrian survive reload                                    | `tests/kiosk-offline-queue.test.ts`        |
| H1 RPC lock           | semua RPC aplikasi service_role-only                                                 | `0065`; `tests/rpc-privilege.test.ts`      |
| H2 secret + freshness | secret per-credential wajib; freshness ±5 menit (`WEBHOOK_FRESHNESS_MINUTES`)        | `tests/pakasir-webhook-credential.test.ts` |
| H3 idempotency        | state-aware `received`→`processed`                                                   | `0066`; `tests/webhook-direct.test.ts`     |
| M1 IDOR storage       | route storage tenant-scoped (404 cross-tenant)                                       | `tests/parse-uuid-param.test.ts`           |
| M2 adminRoute         | guard admin di lapisan route                                                         | `tests/admin.test.ts`                      |

## Hardening lanjutan (2026-10-16, audit rilis VPS)

| Temuan                                  | Perbaikan                                                                                                                          | Bukti                               |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Isolasi tenant tanpa tes                | tes yang benar-benar mengimpor `src/lib/tenant.ts` (404 membership null, cookie lintas-tenant ditolak, filter role)                | `tests/tenant-isolation.test.ts`    |
| Revocation sesi tanpa tes               | tes jalur `resolveTokenAfterRevocationCheck` (row hilang/kedaluwarsa → claims dibuang; suspended → logout; DB error → fail-closed) | `tests/session-revocation.test.ts`  |
| Idempotensi webhook hanya di-mock       | tes langsung `src/server/payment/webhook-log.ts` (`23505` → duplicate/retryable, non-unik → THROW)                                 | `tests/webhook-log.test.ts`         |
| RPC tanpa `search_path`                 | migrasi `0071_rpc_search_path_hardening.sql` (+ rollback) — **ditulis & diuji statis, BELUM di-apply ke Supabase**                 | `tests/rpc-search-path.test.ts`     |
| Rollback sebelum forward (`ls \| sort`) | 8 berkas rollback di-rename ke `NNNN_nama_rollback.sql`; guard statis                                                              | `tests/migration-integrity.test.ts` |
| `/api/health` statis (selalu 200)       | readiness nyata (DB + storage, timeout 4s, **503** saat gagal, `checks` aditif)                                                    | `tests/health.test.ts`              |

## Aset brand (2026-10-16)

Logo dan favicon diganti dengan mark produk baru; berkas lama dihapus.

| Berkas                                                        | Status      | Dipakai di                                                                                                                    |
| ------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `public/snapyos-icon-192.png`                                 | diganti     | `src/app/layout.tsx` (icons), `src/app/manifest.ts`                                                                           |
| `public/snapyos-icon-512.png`                                 | diganti     | idem                                                                                                                          |
| `public/snapyos-icon-maskable-512.png`                        | diganti     | `src/app/manifest.ts` (`purpose: maskable`)                                                                                   |
| `public/apple-touch-icon.png`                                 | diganti     | `src/app/layout.tsx` (`icons.apple`)                                                                                          |
| `public/snapyos-mark.png`                                     | **baru**    | 9 call-site mark: `header`, `footer`, `auth-block`, `subscribe-form` (2×), `register`, `Topbar`, `AdminTopbar`, `StaffTopbar` |
| `src/app/favicon.ico`                                         | diganti     | konvensi Next (multi-ukuran 16/32/48/64/128/256)                                                                              |
| `public/snapyos-icon.svg`, `public/snapyos-icon-maskable.svg` | **dihapus** | tidak ada lagi rujukan                                                                                                        |
| `public/avatar-snappy/4.svg` (raster 1,1 MB)                  | **dihapus** | digantikan `snapyos-mark.png`                                                                                                 |

`public/avatars/5.svg`, `8.svg` dan `public/fiture-avatar/12–14.svg` **dipertahankan** — itu
ilustrasi karakter marketing, bukan mark brand (isinya dioptimalkan, lihat bawah).

### Service worker: cache-first → stale-while-revalidate (T27)

Ditemukan saat penggantian aset di atas: `public/sw.js` memakai **cache-first** atas URL
`public/` yang **stabil** (tidak content-hashed, berbeda dengan keluaran build Next).
Akibatnya mengganti isi aset apa pun tidak pernah terlihat di klien yang sudah terpasang —
kiosk PWA menyimpan salinan lama **selamanya**. Direproduksi di browser: setelah berkas di
server diganti, entri cache tetap `6fbf1645…`; setelah perbaikan, entri cache berpindah ke
`120dc20f…` dalam satu muat tanpa bersihkan cache manual.

`public/sw.js` sekarang menyajikan salinan cache seketika lalu **merevalidasi di latar**
(stale-while-revalidate), cache naik ke `snapyos-kiosk-v4`. HTML navigasi, `/api/`,
Supabase, dan URL bertanda tangan tetap tidak pernah di-cache. Dijaga
`tests/service-worker-assets.test.ts`.

### Optimasi aset (T28)

| Aset                                                | Sebelum                               | Sesudah                     | Bukti kualitas                                  |
| --------------------------------------------------- | ------------------------------------- | --------------------------- | ----------------------------------------------- |
| `dashboard-preview.png`                             | 1,85 MB @3024×1716                    | 562 KB @2048×1162 (palette) | mean diff 0,32/255; 0,0012% px beda >32         |
| `payment-logos/pakasir.png`                         | 248 KB @1080×1080                     | 7,8 KB @192×192             | flatten 24px: mean 0,65, 0 px beda >32          |
| `avatars/5.svg`, `8.svg`, `fiture-avatar/12–14.svg` | 5,46 MB (raster 1235–1536px tertanam) | 463 KB (raster 512px)       | render 256px identik: mean ≤0,42, 0 px beda >32 |

Total `public/` turun dari ~7,5 MB ke 1,4 MB. Dimensi intrinsik di `hero.tsx` dan
`feature-section.tsx` disinkronkan ke ukuran berkas baru (2048×1162).

Deferred (known-issue, TIDAK diimplementasikan):

- L1 rate-limit in-memory (single-instance). Backend shared dihapus 2026-10-17 atas permintaan operator; lihat `docs/09` §9.5.
- M4 nomor migrasi duplikat/gap (`0024`, `0051`).
- M7 unbounded select (vouchers, photoboxes, staff, support-tickets, subscription devices).
- H7 god-components (`KioskBrandingEditor` ~1419, `TemplateBuilder` ~955, `KioskApp` ~722).
- P3 replay-window penuh (dedup event_id berbasis waktu) di luar window set-based.
- **0071 belum di-apply** ke Supabase (keputusan pemilik: tulis + validasi statis saja).
- Rehearsal migrasi destruktif (`scripts/verify-migration-rollbacks.mjs`) belum dijalankan:
  butuh Postgres; tidak tersedia di mesin ini.

### Status migrasi cloud (diverifikasi 2026-10-21)

Probe PostgREST terhadap DB cloud mengonfirmasi `0061`, `0062`, `0063`, `0068`,
`0069`, dan `0070` **sudah diterapkan**. Khusus `0069`, ketiga RPC kuota atomik
terekspos dan diuji langsung: pemanggilan dengan kuota `0` mengembalikan
`P0001 PLAN_LIMIT_REACHED`, pemanggilan dengan kuota cukup berhasil membuat row
lalu row uji dihapus kembali.

`0071` belum di-apply (keputusan pemilik).

### Status migrasi cloud (DITERAPKAN & terverifikasi 2026-10-27)

Bagian sebelumnya sempat menyatakan `0072`/`0075`/`0076` "BELUM". Ketiganya
**kini sudah diterapkan** ke cloud memakai
`db/migrations/APPLY_0072_0075_0076_combined.sql` (idempotent, tiga blok
transaksi terpisah). Verifikasi dilakukan dua lapis, bukan asumsi:

1. **Probe** `node scripts/probe-migration-status.mjs` — semua panggilan no-op,
   exit code 0. Hasil akhir: **13 applied, 0 not applied, 0 unverifiable, 0 error**.
2. Skrip yang sama memakai **katalog Postgres** via `supabase db query --linked`
   (role `postgres`) untuk yang tidak diekspos PostgREST: index, aksi `ON DELETE`,
   dan signature fungsi. Bila CLI tidak tersedia, item tersebut dilaporkan
   `UNVERIFIABLE` (bukan PASS).

| Migrasi | Status akhir   | Bukti verifikasi                                                                                               |
| ------- | -------------- | -------------------------------------------------------------------------------------------------------------- |
| `0072`  | **DITERAPKAN** | `add_ons.name` = `Tambah Storage 1.024 MB`, `storage_mb` tetap 1024                                            |
| `0073`  | **DITERAPKAN** | kolom snapshot struk ada; `pos_set_booth_enabled` 200; `pos_create_order_with_items` 409 FK (fungsi ada)       |
| `0074`  | **DITERAPKAN** | `pos_complete_payment` mengembalikan `null` untuk order yang sudah punya transaksi                             |
| `0075`  | **DITERAPKAN** | `photoboxes_default_template_id_fkey` ada, `confdeltype='n'` (SET NULL); 3 index ada (`idx75`=3)               |
| `0076`  | **DITERAPKAN** | `to_regprocedure` = `pos_decrement_stock_batch(uuid,jsonb)`; `prosecdef=false`; `search_path=public, pg_temp`  |
| `0077`  | **DITERAPKAN** | kolom `plans.max_packages/max_templates` ada                                                                   |
| `0078`  | **DITERAPKAN** | ketiga index ada (`idx78`=3), terverifikasi via katalog Postgres                                               |
| `0079`  | **DITERAPKAN** | keempat FK `customers` `confdeltype='r'` (RESTRICT) di `sessions`/`transactions`/`pos_orders`/`voucher_usages` |
| `0080`  | **DITERAPKAN** | hint `transactions_payment_id_fkey` → `PGRST200` (FK sudah dihapus)                                            |

**Uji fungsional `0076`** (di dalam transaksi yang di-`rollback`, tidak ada data
berubah): decrement normal 10→7 `ok=true`; permintaan melebihi stok `ok=false`
dan stok **tidak** berubah; stok `null` (tidak dilacak) `ok=true`; `qty=0`
diabaikan (0 baris); bisnis lain ditolak `ok=false` tanpa mengubah stok; `anon`
mendapat `42501 permission denied`. Hak eksekusi hanya `service_role` + owner.

**`0071` tetap belum di-apply** (keputusan pemilik). Tidak memblokir: `0073`,
`0074`, dan `0076` sudah memakai `set search_path = public, pg_temp` di
definisinya sendiri.

#### Bug yang tersingkap setelah `0076` masuk

E2E `pos-receipt-serial` yang sebelumnya BLOCKED kini berjalan dan menemukan bug
nyata: dua jalur cetak (auto-print dan tombol manual) menulis ke port Web Serial
yang sama **tanpa antrean**. Chunk 256-byte dari dua job saling menyisip,
sehingga struk keluar rusak — teks tergabung (`WaktKLIK FOTO DEV`) dan baris
melewati lebar kolom. Perbaikan: antrean tulis per-port di
`src/lib/print/serial.ts` (`writeChains` + `writeJobToPort`, sekaligus
menghapus duplikasi dua fungsi tulis). Dijaga
`tests/print-serial.test.ts` → "dua job bersamaan ke port yang sama tidak
bercampur"; test ini **gagal pada kode lama** dan lulus pada kode baru.

Hasil E2E struk POS: **16/16 PASS** (58mm + 80mm).

## Baseline gate (2026-10-16, commit `a56483b`)

Titik nol audit rilis VPS. Diukur di mesin pengembang (macOS, Node 24), bukan
di VPS; gate yang butuh Linux/VPS dicatat terpisah di `docs/18-audit-report.md`.

| Gate                         | Perintah            | Hasil                                                |
| ---------------------------- | ------------------- | ---------------------------------------------------- |
| Lint (repo-wide, dipakai CI) | `npm run lint`      | **PASS** 0 error, 12 warning                         |
| Typecheck                    | `npm run typecheck` | **PASS**                                             |
| Unit/integration             | `npm test`          | **PASS** 957/957                                     |
| Build produksi               | `npm run build`     | **PASS**                                             |
| Dependency audit             | `npm audit`         | 0 critical, 9 high, 2 moderate (dev-time/transitive) |

Angka suite terkini setelah audit POS/cetak 2026-10-21: **957 tes lulus, 0 gagal, 0 skip**.
Penambahan mencakup encoder struk 58/80mm (`tests/print-receipt.test.ts`), transport
Web Serial (`tests/print-serial.test.ts`), fallback pemilih printer BLE, dan kontrak
Turnstile. Laporan gate lengkap ada di `docs/18-audit-report.md`.

### Gate rilis (2026-10-20)

Diukur ulang di mesin pengembang sebelum deploy. Semua gate lulus:

| Gate             | Perintah                     | Hasil                                                                                     |
| ---------------- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| Lint             | `npm run lint`               | **PASS** 0 error, 12 warning (`no-img-element`, sengaja: aset kiosk butuh `<img>` mentah) |
| Typecheck        | `npm run typecheck`          | **PASS**                                                                                  |
| Unit/integration | `npm test`                   | **PASS** 957/957, 0 gagal, 0 skip                                                         |
| Build produksi   | `npm run build`              | **PASS**                                                                                  |
| Format           | `npm run format:check`       | **PASS SCOPE**; 34 file legacy repo-wide belum terformat                                  |
| E2E kiosk smoke  | `kiosk-smoke.spec.mjs`       | **PASS** 6/6 (headed)                                                                     |
| E2E kiosk lock   | `kiosk-lock.spec.mjs`        | **PASS** 7/7 (headed)                                                                     |
| E2E kiosk frames | `kiosk-frames.spec.mjs`      | **PASS** 5/5 (headed)                                                                     |
| E2E responsif    | `kiosk-responsive.spec.mjs`  | **PASS** 15/15 (5 viewport, headed)                                                       |
| E2E cetak        | `npm run test:e2e:print`     | **PASS** 4/4                                                                              |
| E2E Bluetooth    | `npm run test:e2e:bluetooth` | **PASS** 2/2 assertion                                                                    |

Temuan UI yang diperbaiki pada gate ini: target sentuh di bawah 44px
(antislop R-03) pada pointer kasar. Perbaikan: aturan `@media (pointer: coarse)`
di `src/app/globals.css` untuk tombol, kontrol ber-peran tombol, select/textarea/
input native, dan label checkbox/radio; `min-h-11`/`min-w-11` pada CTA, brand,
topbar, paginator admin, tautan tabel admin, toggle analitik, tombol unduh bukti,
serta trigger form collapsible. Menu mobile marketing diubah menjadi dialog
terkontrol dengan tombol tutup di dalam panel (sebelumnya trigger menjadi inert
saat dialog terbuka sehingga hanya Escape yang bisa menutup).

Diverifikasi dengan konteks sentuh nyata (`hasTouch: true`, 390×844) di seluruh
halaman publik, owner, admin, dan staff: 0 kontrol di bawah 44px, tanpa overflow
horizontal, tanpa console/page error. Interaksi menu marketing, menu admin,
kategori dokumentasi, dan toggle Grid/List diuji langsung (38/38 assertion).

Audit fitur ke database (bukan hanya render): CRUD outlet/paket/photobox/tiket
owner 15/15, staff + payment credential 11/11, aksi admin plan/promo/user/
settings 12/12. Semua fixture dibersihkan setelah tes; tidak ada data audit yang
tertinggal. Dead code: ekspor `getBusiness`, `getPhotoboxBranding`, `listStaff`,
dan `VoucherAnalytics` tidak lagi direferensikan; dependency root `cn` dihapus
(sisa entri hanya transitive milik `shadcn` dev).

Blocker CI yang ditemukan dan diperbaiki pada titik nol ini:
`eslint.config.mjs` hanya meng-ignore `.kilo/worktrees/**`, bukan
`.claude/worktrees/**` (salinan repo 2,0 GB). `npm run lint` melaporkan
**3114 error** dari kode yang bukan milik app, sehingga CI
(`.github/workflows/ci.yml` menjalankan `npm run lint`) merah. Pola ignore
diganti menjadi `**/worktrees/**`.

### Gate aktual (2026-10-24, mesin pengembang macOS, Node 24)

Diukur ulang dari nol setelah audit: hasil lama tidak dipakai sebagai bukti.

| Gate             | Perintah            | Hasil                                                      |
| ---------------- | ------------------- | ---------------------------------------------------------- |
| Lint             | `npm run lint`      | **PASS** 0 error, 12 warning (`no-img-element`, disengaja) |
| Typecheck        | `npm run typecheck` | **PASS**                                                   |
| Unit/integration | `npm test`          | **PASS** 960/960, 0 gagal, 0 skip                          |
| Build produksi   | `npm run build`     | **PASS**                                                   |

Dua tes yang sebelumnya gagal adalah tes usang yang mengunci kontrak lama, bukan
bug implementasi: jendela freshness webhook (24 jam → 5 menit) dan
`DEFAULT_PLAN_LIMITS` (4 → 6 field). Keduanya diperbarui ke kontrak sekarang.

## Backlog

- Bookings UI and booking endpoints.
- Event mode.
- Refund state machine.
- Load test.
- Public REST subscription and add-on API.
- Antrean cetak persisten + konfirmasi hasil fisik per penjualan (`print_jobs`) — dirancang di `docs/17`, belum dibangun.
- Sinkronisasi `db/schema.sql` dengan migrasi `0077`–`0080` (lihat `docs/18-audit-report.md`).

## Removed or archived

| Item                              | Replacement or reason                                                                                                                                                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kiosk aggregator withdrawal flow  | Direct merchant owner-first, voucher, and offline cash.                                                                                                                                                                                                           |
| Owner withdrawal and balance flow | Removed in v1.8. Payment settles to owner gateway.                                                                                                                                                                                                                |
| Dashboard-01 dual shell           | Single Neo-Brutalist dashboard.                                                                                                                                                                                                                                   |
| Owner CRUD REST routes            | Server actions.                                                                                                                                                                                                                                                   |
| Supabase Realtime                 | Payment status polling every 3 seconds.                                                                                                                                                                                                                           |
| Hardware agent terpisah           | Diganti bridge lokal Node (`scripts/photobooth-bridge.mjs`) yang dipanggil kiosk PWA; direktori `hardware-agent/`, `tauri-kiosk/`, `docs/hardware/` dihapus. Kamera DSLR (gphoto2) dan cetak CUPS **aktif** lewat bridge ini — lihat `docs/photobooth-bridge.md`. |

## Reading rule

`Active` means code path exists and is intended for current use. `Partial` means only the stated subset is supported. `Backlog` means do not expose route or UI as available. `Archived` means historical context only.
