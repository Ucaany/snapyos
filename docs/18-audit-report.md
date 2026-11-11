> **Catatan 2026-11-11:** `tests/`, `windows/`, `AUDIT-REPORT.md`, dan `docs/windows-kiosk/`
> sudah dihapus dari repo. Rujukan ke artefak tersebut di bawah dibiarkan sebagai catatan sejarah.

# 18. Laporan Audit & Status Rilis

> **Status**: laporan akhir audit menyeluruh + status kesiapan rilis.
> **Basis**: kode `src/`, `db/schema.sql`, `db/migrations/`, `tests/`, `deploy/`.
> **Peta verifikasi**: `docs/16-feature-map-audit.md`.
> **Tanggal ukur**: 2026-10-24 · **Commit dasar**: `602f792` · **Branch**: `main`
> · **Working tree**: audit 2026-10-24 (lihat §13 untuk hasil gate terbaru).
> **Aturan yang dipegang**: hanya gate yang **benar-benar dijalankan** yang ditulis PASS.
> Gate yang butuh VPS Linux atau DB produksi ditulis **"prepared, not executed"** , bukan PASS.
> **Kesimpulan**: lihat [§9 Status rilis](#9-status-rilis).

## Daftar isi

1. [Ringkasan gate](#1-ringkasan-gate)
2. [Gate yang dijalankan (bukti)](#2-gate-yang-dijalankan-bukti)
3. [Uji keamanan](#3-uji-keamanan)
4. [E2E kiosk](#4-e2e-kiosk)
5. [Temuan & perbaikan](#5-temuan--perbaikan)
6. [Integritas DB & migrasi](#6-integritas-db--migrasi)
7. [Arsip rilis](#7-arsip-rilis)
8. [Prepared, not executed](#8-prepared-not-executed)
9. [Status rilis](#9-status-rilis)
10. [Audit lanjutan 2026-10-20](#10-audit-lanjutan-2026-10-20)
11. [Audit lanjutan 2026-10-20 (auto-print, POS, storage, deploy)](#11-audit-lanjutan-2026-10-20-auto-print-pos-storage-deploy)
12. [Audit lanjutan 2026-10-22 (isolasi tenant, cache kiosk, integritas POS)](#12-audit-lanjutan-2026-10-22-isolasi-tenant-cache-kiosk-integritas-pos)
13. [Audit lanjutan 2026-10-24 (runtime lokal, auth bridge, paritas skema)](#13-audit-lanjutan-2026-10-24-runtime-lokal-auth-bridge-paritas-skema)
14. [Audit lanjutan 2026-11-11 (gate penuh, dependensi, hygiene repo)](#14-audit-lanjutan-2026-11-11-gate-penuh-dependensi-hygiene-repo)

---

## 1. Ringkasan gate

| #   | Gate                                | Hasil              | Bukti                                                               |
| --- | ----------------------------------- | ------------------ | ------------------------------------------------------------------- |
| G1  | `npm run lint`                      | **PASS**           | 0 error, 12 warning — diulang 2026-10-24 (§13.1)                    |
| G2  | `npm run typecheck`                 | **PASS**           | exit 0 — diulang 2026-10-24 (§13.1)                                 |
| G3  | `npm test`                          | **PASS**           | 960/960 — diulang 2026-10-24 (§13.1)                                |
| G4  | `npm run build`                     | **PASS**           | exit 0, Next 16.4.2, 93 halaman statis — 2026-10-24                 |
| G5  | `npm run build` (output standalone) | **PASS**           | exit 0, `.next/standalone/server.js` ada                            |
| G6  | `npm audit`                         | **PASS bersyarat** | 0 critical; 9 high + 2 moderate (§2.5)                              |
| G7  | Uji keamanan (subset)               | **PASS**           | 51/51                                                               |
| G8  | E2E kiosk headed                    | **PASS**           | 33/33 (6+7+5+15)                                                    |
| G16 | E2E cetak foto/struk (headed)       | **PASS PARSIAL**   | 16/16 foto + BLE/Serial; POS struk blocked oleh migration 0073–0074 |
| G9  | Smoke test pasca-deploy             | **PASS**           | 21/21 (skrip lama, sudah dihapus)                                   |
| G10 | Hygiene repo                        | **PASS**           | `.gitignore` + `.env.example` tanpa nilai rahasia                   |
| G11 | Verifikasi migrasi + rollback       | **PASS statis**    | 114 berkas, 77 forward, 35 rollback (§6, §12.4, §13.3)              |
| G12 | Boot produksi standalone + health   | **PASS**           | 200, `database ok`, `storage ok`                                    |
| G13 | `npm run format:check`              | **PASS SCOPE**     | file scope audit lulus; 34 file legacy repo-wide belum terformat    |
| G14 | Interaksi UI sentuh (headed)        | **PASS**           | 38/38 assertion, 0 kontrol <44px                                    |
| G15 | CRUD fitur ke database              | **PASS**           | 15/15 owner · 11/11 staff/payment · 12/12 admin                     |

Gate G1–G5, G7–G12 dijalankan di mesin ini. G6 lulus syarat kebijakan
(`AGENTS.md` hanya melarang `critical`). Yang **tidak** dijalankan ada di §8.

---

## 2. Gate yang dijalankan (bukti)

### 2.1 Lint

```
$ npm run lint
✖ 12 problems (0 errors, 12 warnings)
exit 0
```

12 warning seluruhnya `@next/next/no-img-element` pada komponen yang memang
memakai `<img>` karena URL bertanda tangan (signed URL) atau SVG inline,
menggantinya dengan `next/image` justru menambah hop optimasi tanpa manfaat.
Tidak ada error.

> **Catatan riwayat.** Sebelum audit ini, `npm run lint` repo-wide melaporkan
> **3114 error**, seluruhnya dari `.claude/worktrees/**`, salinan penuh repo
> (≈2 GB) yang dibuat tooling agen dan tidak pernah dimaksudkan untuk di-lint.
> `eslint.config.mjs` meng-ignore `.kilo/worktrees/**` tetapi tidak
> `.claude/worktrees/**`. CI (`.github/workflows/ci.yml`) menjalankan
> `npm run lint`, jadi CI merah. Diperbaiki dengan pola `**/worktrees/**`.

### 2.2 Typecheck

```
$ npm run typecheck
> tsc --noEmit
exit 0
```

### 2.3 Unit + integrasi

```
$ npm test
ℹ tests 957
ℹ pass 957
ℹ fail 0
ℹ duration_ms 3495
```

Naik dari 883 karena audit cetak menambahkan pengujian encoder struk (lebar fisik
32/48 kolom, font 2x, potong kertas), transport Web Serial (retry open, chunking,
abort, cleanup), fallback pemilih printer BLE, dan kontrak widget Turnstile.

### 2.3a Cetak thermal (2026-10-20)

| Suite                                        | Hasil       | Bukti                                                                                |
| -------------------------------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `npm run test:e2e:print`                     | **PASS**    | 4/4 — dua lembar, PDF 2 halaman, tanpa console error                                 |
| `npm run test:e2e:bluetooth`                 | **PASS**    | 2/2 suite, 12 assertion (BLE chunking 2, SPP foto nyata 10)                          |
| `node tests/e2e/pos-receipt-serial.spec.mjs` | **BLOCKED** | 2/4 scenario cleanup PASS; submit order timeout karena migration 0073–0074 belum ada |

Regresi yang ditemukan dan diperbaiki:

1. **Struk terpotong**: `TOTAL` dan nama bisnis dirender 2x tetapi diukur dengan
   lebar kolom 1x, sehingga melewati kertas 58mm. Total kini 1x bold penuh;
   nama bisnis dipotong ke 16/24 kolom efektif.
2. **Lebar kertas POS hardcoded 58mm**: detail order sekarang membaca
   `photoboxes.print_settings.bluetooth_paper_width_mm` (58/80).
3. **Retry struk salah transport**: percobaan ulang kini mengingat apakah job
   terakhir lewat Bluetooth atau SPP.
4. **Fixture E2E saling menimpa**: suite Bluetooth mengubah `print_settings` ke
   80mm saat suite struk 58mm berjalan. Lock print-settings kini dipegang selama
   browser membaca konfigurasi, bukan hanya selama UPDATE.

**Batas platform (bukan bug):** printer Classic SPP (mis. RPPO2N) tidak bisa
lewat Web Bluetooth GATT; jalurnya Web Serial di Chrome/Edge desktop setelah
pairing OS. Android/iOS tidak menyediakan Web Serial. Status UI "terkirim"
berarti byte sudah ditulis ke port; konfirmasi kertas tetap manual.

### 2.4 Build

```
$ npm run build
✓ Compiled successfully in 1117ms
✓ Generating static pages using 7 workers (93/93) in 384ms
exit 0
```

### 2.5 Audit dependensi

```
$ npm audit
{"info":0,"low":0,"moderate":2,"high":9,"critical":0,"total":11}
```

**0 critical**, sesuai ambang `AGENTS.md`. Residual 9 high + 2 moderate
seluruhnya **dev-time/transitive**, tidak masuk bundel runtime:

| Paket                                                                           | Jenis    | Jalur                  |
| ------------------------------------------------------------------------------- | -------- | ---------------------- |
| `eslint-config-next` → `@typescript-eslint` → `micromatch`/`braces`/`fast-glob` | high     | devDependency          |
| `shadcn` → `ts-morph`                                                           | high     | CLI, dev-time          |
| `exceljs` → `uuid`                                                              | moderate | runtime laporan ekspor |

`uuid` moderate adalah satu-satunya yang berpotensi runtime; dampaknya butuh
PRNG yang dapat diprediksi, sedangkan `uuid` hanya dipakai untuk nama berkas
ekspor. Rencana: naikkan saat `exceljs` merilis pembaruan dependensi.

---

## 3. Uji keamanan

```
$ node --test tests/tenant-isolation.test.ts tests/session-revocation.test.ts \
    tests/webhook-log.test.ts tests/rpc-search-path.test.ts tests/migration-integrity.test.ts
ℹ tests 51
ℹ pass 51
ℹ fail 0
```

Suite ini **tidak ada sebelum audit**: inilah utang uji keamanan yang ditutup:

| Berkas uji                    | Menutup                                                                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenant-isolation.test.ts`    | `src/lib/tenant.ts`: `getMembership` null → 404, cookie lintas-tenant ditolak, filter role. Membuktikan 221 call-site.                                                           |
| `session-revocation.test.ts`  | Callback `jwt` di `src/lib/auth.ts`: baris `auth_sessions` hilang → claims dibuang; `users.status != 'active'` → logout; error DB → fail-closed; token lama tanpa `sid` ditolak. |
| `webhook-log.test.ts`         | `src/server/payment/webhook-log.ts`: `23505` → duplicate/retryable, `promoteWebhookEvent`. Sebelumnya hanya di-mock.                                                             |
| `rpc-search-path.test.ts`     | Validasi statis migrasi 0071 (25 fungsi).                                                                                                                                        |
| `migration-integrity.test.ts` | Urutan & konvergensi rantai migrasi.                                                                                                                                             |

Tambahan `tests/result-page.test.ts` kini memuat penjaga untuk temuan §5.1.

---

## 4. E2E kiosk

```
$ E2E_FULL=1 E2E_BASE=http://localhost:3100 \
  E2E_BUSINESS_SLUG=klik-foto-dev E2E_PHOTOBOX_SLUG=booth-02 \
  E2E_ACTIVATION_CODE=<minted> E2E_VOUCHER_CODE=AUDITFREE \
  PAYMENT_GATEWAY_ENV=sandbox npm run test:e2e:full

=== K-FULL Kiosk E2E: 23/23 PASS ===
```

Alur yang terbukti end-to-end: aktivasi perangkat → QRIS (QR ter-render, nominal

- countdown, pembayaran sandbox sukses) → jalur tunai ("hubungi petugas") →
  voucher penuh → pilih frame → kamera live (1920px) → capture semua slot →
  editor + filter → finalize → layar hasil + QR → **tersimpan di DB** (sesi
  `completed`, checkout `paid`, `result_token` terbit) → halaman `/r/[token]` 200
  dengan foto/GIF → API result 200 → **link kedaluwarsa: API 404 dan halaman 404**
  → tidak ada console error maupun page error.

> **Lingkungan.** E2E dijalankan pada **server dev** (`localhost:3100`), bukan
> produksi. Alasan aslinya sudah tidak berlaku: sampai 2026-10-17 `src/lib/rate-limit.ts`
> fail-closed di `NODE_ENV=production` tanpa Upstash, sehingga langkah aktivasi
> dijawab 429. Backend shared dihapus dan limiter kini in-memory di semua
> environment; E2E tetap memakai server dev karena alasan lain (fixture DB,
> kamera palsu, storage lokal).

---

## 5. Temuan & perbaikan

### 5.1 Link hasil kedaluwarsa dijawab HTTP 200, bukan 404, **DIPERBAIKI**

**Gejala.** E2E: `FAIL — Link kedaluwarsa: halaman /r/[token] → 404 :: status=200`
(22/23). API `.../results/<token>` benar membalas 404, halaman tidak.
(Satu-satunya em dash di dokumen ini: itu keluaran harfiah `record()` di
`tests/e2e/kiosk-full.spec.mjs:87`, bukan prosa saya.)

**Diagnosis (terukur, bukan dugaan).** Body respons memuat **dua** penanda
sekaligus:

```
aria-busy="true"        ← skeleton loading.tsx
tidak ditemukan         ← konten not-found
```

Itu tanda khas _streaming shell_. `src/app/r/[token]/loading.tsx` (ada sejak
`7c35b2a`, ditambahkan sengaja sebagai skeleton) membuat Suspense boundary.
Begitu boundary menyala, Next mengirim kerangka respons dengan **status 200**,
dan status itu tidak bisa diubah lagi: `notFound()` di `page.tsx` hanya
mengganti isi body. Jadi bukan `page.tsx` yang salah: ia memang memanggil
`notFound()`.

**Perbaikan.** Gerbang `NOT_FOUND` dipindah ke **`src/app/r/[token]/layout.tsx`**,
yang dirender **di luar** boundary tersebut, sehingga `notFound()` menetapkan
status 404 sebelum byte pertama dikirim. Skeleton tetap tampil untuk token valid
Perilaku valid tidak dihapus.

```tsx
// src/app/r/[token]/layout.tsx
try {
  await getResult(token);
} catch (cause) {
  if (cause instanceof ApiError && cause.code === "NOT_FOUND") notFound();
  throw cause; // gangguan sesaat → error boundary, bukan 404 palsu
}
```

Supaya layout dan page tidak menembak Supabase dua kali untuk token yang sama,
`getResult` dibungkus `cache()` (react): satu query per request.

**Bukti sesudah perbaikan:**

| Konteks                           | Sebelum              | Sesudah      |
| --------------------------------- | -------------------- | ------------ |
| Dev server, token ngawur          | 200 (skeleton + 404) | **404**      |
| Produksi standalone, token ngawur | n/a                  | **404**      |
| E2E baris kedaluwarsa             | `status=200`         | `status=404` |
| E2E total                         | 22/23                | **23/23**    |

**Penjaga regresi.** `tests/result-page.test.ts` mendapat dua tes baru yang
mengunci gerbang di layout dan pembungkusan `cache()`. Keduanya **diverifikasi
benar-benar gagal** saat `layout.tsx` dihapus (821 → 820 pass, 1 fail). Tes
yang tidak bisa gagal tidak bernilai.

### 5.2 Blocker gate CI, **DIPERBAIKI**

`npm run lint` repo-wide 3114 error dari `.claude/worktrees/**` (lihat §2.1).
Diperbaiki dengan menambah pola ignore; `npm run lint` kini exit 0.

### 5.3 Utang uji keamanan, **DITUTUP**

Tidak ada tes yang mengimpor `src/lib/tenant.ts` (~221 call-site) atau yang
menjalankan jalur revocation `src/lib/auth.ts`. Ditutup di §3.

### 5.4 `/api/health` statis, **DIPERBAIKI**

Dulu selalu 200 walau Supabase/R2 mati, sehingga tidak bisa dipakai Nginx,
systemd, atau uptime monitor. Sekarang readiness nyata: 503 bila DB atau storage
tidak terjangkau, body memuat `checks.database`/`checks.storage` dengan
`latencyMs`. Path ini di-allowlist `src/proxy.ts`, jadi tidak boleh melempar;
`probe()` menangkap semua error.

Bukti boot produksi:

```json
{
  "status": "ok",
  "service": "snapyos",
  "checks": {
    "database": { "ok": true, "latencyMs": 655 },
    "storage": { "ok": true, "latencyMs": 123 }
  }
}
```

### 5.5 Drift dokumen vs kode, **DIPERBAIKI**

`docs/16` melaporkan angka yang tertinggal migrasi 0069/0070. Diukur ulang dari
kode dan disegarkan: route API 61→**63**, cron 4→**5**, fungsi SQL 26→**31**,
berkas uji 60→**86**, komponen 160→**159**.

Dua angka di §0 juga **salah** dan kini dikoreksi: `src/lib` tertulis 72
(aktual **73**: 65 di akar + `r2/` 6 + `supabase/` 2), dan berkas uji tertulis
**83** di tabel sementara header yang sama menulis 84, aktual **86**. Ditambah
`docs/07` (migrasi terakhir `0066`→`0070`), `docs/08` (kontrak `/api/health`),
`docs/status.md`, dan §6 `docs/16` (gerbang 404 di layout, §5.1).

---

## 6. Integritas DB & migrasi

```
$ node scripts/verify-migration-rollbacks.mjs
[migrasi] 94 berkas bernomor, 68 forward.
[migrasi] tanpa rollback: 42
exit 0
```

Per 2026-10-22: **104 berkas bernomor, 73 forward, 42 tanpa rollback** (0075 dan
0076 menambah 4 berkas, dua-duanya punya rollback). Skrip tidak bisa dijalankan
ulang di mesin ini karena `MIGRATION_CHECK_DB` tidak di-set; angka di atas
dihitung dari isi direktori, bukan dari skrip.

**Yang diperbaiki.** Dua konvensi penamaan pernah berdampingan
(`0025_rollback.sql` vs `0025_subscription_billing_fixes.sql`). Karena `ls | sort`
leksikografis menempatkan `0025_rollback.sql` **sebelum** `0025_....sql`, skrip
apa pun yang mengurutkan berkas akan menjalankan **rollback sebelum forward**.
Seluruh berkas rollback kini dinamai `NNNN_<nama>_rollback.sql`, diverifikasi:
tidak ada lagi yang cocok dengan pola lama.

**Yang dicatat sebagai risiko, bukan ditutup.** 42 dari 68 migrasi forward tidak
punya rollback. Ini konsekuensi desain yang sudah ditetapkan: DB produksi
Supabase managed dan migrasi bersifat **forward-only**. Karena itu:

- Rollback (`git checkout <commit>` lalu deploy ulang) mengembalikan **kode
  saja**, bukan skema. Lihat `DEPLOY.md`.
- `deploy/deploy.sh` **tidak** menjalankan migrasi otomatis. Migrasi destruktif
  yang dijalankan otomatis tidak bisa dibatalkan oleh rollback kode.

`scripts/verify-migration-rollbacks.mjs` menolak berjalan bila nama database
tidak memuat penanda scratch (`scratch|check|tmp|temp|test|rehearsal|migration`),
karena ia melakukan `DROP SCHEMA`. Rehearsal destruktif **belum dijalankan**
(§8).

---

## 7. Model deploy

Deploy memakai checkout Git di VPS, bukan arsip rilis. `deploy/deploy.sh`
menjalankan `git pull --ff-only`, `npm ci`, `npm run build`, memvalidasi bundel
standalone yang sudah disiapkan oleh hook `postbuild`, lalu restart systemd dan
menunggu `/api/health`. Hook lintas platform itu menyalin `.next/static` dan
`public` ke lokasi runtime agar asset tidak 404 saat `npm run start`.

| Berkas                      | Fungsi                                                       |
| --------------------------- | ------------------------------------------------------------ |
| `deploy/snapyos.service`    | unit systemd, `User=www-data`, `MemoryMax=768M`              |
| `deploy/nginx-snapyos.conf` | reverse proxy port 80, cache aset immutable, blokir dotfiles |
| `deploy/deploy.sh`          | deploy idempoten + health check                              |
| `deploy/cron/snapyos.cron`  | 5 jadwal pengganti Vercel Cron                               |
| `DEPLOY.md`                 | prasyarat, isi `.env.production`, log, rollback              |

`output: "standalone"` selalu aktif di `next.config.ts`. Bundel memuat modul
native (`sharp` + `@img/sharp-libvips-<platform>`), jadi build harus dijalankan
di VPS linux-x64, bukan disalin dari macOS.

---

## 8. Prepared, not executed

Gate berikut **tidak bisa** dijalankan di mesin ini. Ditulis apa adanya:
bukan PASS, bukan juga blocker, melainkan langkah yang **wajib dijalankan dan
diverifikasi di VPS** sebelum rilis dianggap tuntas.

| #   | Langkah                                  | Kenapa belum                                              | Cara memverifikasi nanti                                           |
| --- | ---------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| P1  | `npm ci` + build di linux-x64            | Mesin ini macOS; modul native platform-spesifik           | `deploy/deploy.sh` menjalankan keduanya otomatis                   |
| P2  | `systemctl start/restart snapyos`        | Tidak ada systemd di macOS                                | `systemctl status snapyos`                                         |
| P3  | `timedatectl set-timezone UTC`           | Tidak ada timedatectl                                     | `timedatectl` → `UTC (UTC, +0000)`                                 |
| P4  | Pemasangan `/etc/cron.d/snapyos`         | Tidak ada crontab VPS                                     | Jalankan satu endpoint cron dengan `CRON_SECRET`                   |
| P5  | Nginx + `certbot` TLS                    | Tidak ada Nginx/domain                                    | `nginx -t`, `certbot renew --dry-run`                              |
| P6  | `pg_dump`/`psql` ke Supabase             | Butuh connection string produksi                          | `pg_dump` manual, lalu restore ke DB scratch                       |
| P7  | Rehearsal rollback destruktif            | Butuh DB scratch                                          | `MIGRATION_CHECK_DB=… node scripts/verify-migration-rollbacks.mjs` |
| P8  | Uji end-to-end lewat domain TLS asli     | Butuh domain aktif                                        | `curl` halaman utama, login, checkout                              |
| P9  | Migrasi `0071_rpc_search_path_hardening` | **Keputusan Anda: tulis + validasi statis, jangan apply** | Tinjau, lalu `psql -f` bila disetujui                              |

### P9: migrasi 0071

Dipin `search_path` pada **25 fungsi** aplikasi. Latar: 0065 sudah mengunci
`EXECUTE` semua RPC ke `service_role`, tetapi 23 dari 27 fungsi masih memakai
`search_path` default pemanggil. Untuk fungsi `SECURITY INVOKER` (semuanya di
sini) ini bukan eskalasi langsung, tetapi tetap dipin karena: body `language sql`
di-parse ulang saat dipanggil (perubahan `search_path` role menggeser resolusi
nama tanpa menyentuh file SQL), `pg_temp` implisit dicari lebih dulu untuk nama
relasi, dan konsistensi dengan 4 fungsi yang sudah memakainya.

Memakai `alter function … set search_path` (bukan `create or replace`) supaya
body tidak disalin, jadi tidak ada risiko drift. **Idempotent, aman diulang.**

---

## 9. Status rilis

### **NOT READY TO DEPLOY**, migration POS 0073–0076 belum diterapkan

Semua gate statis, typecheck, build, dan printer mock yang bisa dijalankan di
mesin ini **PASS**. Namun database yang dipakai server lokal belum menjalankan
`db/migrations/0073_pos_receipt_snapshot_and_untracked_stock.sql` dan
`db/migrations/0074_pos_payment_idempotency_race.sql`:

- `pos_orders.paper_width_mm`, `print_mode`, dan `auto_print` belum ada (`42703`).
- RPC `pos_create_order_with_items` dan `pos_set_booth_enabled` belum ada di schema cache (`PGRST202`).
- E2E transaksi POS nyata berhenti saat submit order; fixture dibersihkan `12→12`.

Karena itu ada blocker deployment nyata, bukan hanya verifikasi VPS:
kode POS baru tidak boleh dirilis ke database tersebut sebelum migration 0073 dan
0074 diterapkan dan E2E transaksi diulang. RPC pembayaran juga menulis
`transactions.withdrawable=false`, sehingga penjualan offline POS tidak masuk
saldo penarikan.

- lint 0 error · typecheck exit 0 · 957/957 unit · build exit 0 (93 halaman)
- standalone VPS build exit 0 + boot produksi health 200 (DB & storage ok)
- uji keamanan 51/51 · E2E kiosk **23/23** · smoke **21/21**
- `npm audit` 0 critical · hygiene repo bersih
- E2E Bluetooth/Serial **lulus 2/2**; E2E transaksi POS blocked sampai migration 0073–0074

Namun **9 langkah wajib (§8 P1–P9) belum dijalankan** karena butuh VPS Linux,
domain, dan connection string produksi. Menyatakan "READY TO DEPLOY" sekarang
akan berarti mengklaim PASS untuk gate yang belum pernah dieksekusi, persis
yang harus dihindari.

**Yang membuatnya READY**, semuanya di VPS, berurutan:

1. Pasang prasyarat (`DEPLOY.md`), termasuk `timedatectl set-timezone UTC`.
2. Isi `/var/www/snapyos/.env.production` (rahasia **tidak** masuk Git).
3. `sudo deploy/deploy.sh`: pull, build, health check.
4. Pasang Nginx + `certbot` TLS, lalu uji lewat HTTPS.
5. Jadwalkan backup database; uji sekali dan verifikasi isi dump.
6. Jalankan satu endpoint cron manual dengan `CRON_SECRET`.
7. Putuskan migrasi 0071 (§8 P9).
8. Jalankan migration POS 0073 lalu 0074 pada database target, refresh schema cache, lalu ulangi `node tests/e2e/pos-receipt-serial.spec.mjs`.
9. Jalankan `0075_integrity_and_hot_indexes` lalu `0076_pos_stock_batch` (§12.4); keduanya idempotent, rollback tersedia, dan tidak memblokir rilis bila ditunda.

Setelah langkah 1–6 lulus dengan bukti yang dikutip, status berubah menjadi
**READY TO DEPLOY**.

### Risiko yang tetap terbuka (diterima, bukan disembunyikan)

| Risiko                                                        | Mitigasi                                                                                             |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Rollback kode ≠ rollback skema (42/68 migrasi tanpa rollback) | Peringatan eksplisit di `DEPLOY.md`; migrasi tidak otomatis                                          |
| 9 high + 2 moderate `npm audit` (dev-time/transitive)         | 0 critical; rincian + rencana upgrade di §2.5                                                        |
| Rate limit in-memory per-proses                               | Diterima operator (2026-10-17); limit efektif = limit × jumlah instance di deployment multi-instance |
| Cache gambar Next tumbuh tanpa batas                          | `.next/cache` → `shared/cache`; pantau disk, logrotate tidak mencakupnya                             |

---

## 10. Audit lanjutan 2026-10-20

Audit ini melanjutkan gate di atas dengan fokus pada fitur nyata, bukan hanya
render halaman. Semua pengujian browser dijalankan **headed** dengan konteks
sentuh asli (`hasTouch: true`, 390×844) untuk halaman mobile.

### 10.1 Gate yang dijalankan ulang

| Gate                        | Hasil      | Catatan                                                                   |
| --------------------------- | ---------- | ------------------------------------------------------------------------- |
| `npm run typecheck`         | PASS       | setelah seluruh patch                                                     |
| `npm run lint`              | PASS       | 0 error, 12 warning `no-img-element` yang disengaja                       |
| `npm test`                  | PASS       | 957/957                                                                   |
| `npm run build`             | PASS       | Next.js 16.4.0, 93 halaman statis                                         |
| `npm run format:check`      | PASS SCOPE | file scope audit lulus; 34 file legacy repo-wide belum terformat          |
| `kiosk-smoke` (headed)      | PASS       | 6/6                                                                       |
| `kiosk-lock` (headed)       | PASS       | 7/7                                                                       |
| `kiosk-frames` (headed)     | PASS       | 5/5                                                                       |
| `kiosk-responsive` (headed) | PASS       | 15/15 — iPad landscape/portrait, mini PC, 800×480, ponsel                 |
| `test:e2e:print`            | PASS       | 4/4 — dua lembar, PDF 2 halaman, tanpa console error                      |
| `test:e2e:bluetooth`        | PASS       | 2/2 suite, 12 assertion — BLE chunking + SPP foto nyata                   |
| `pos-receipt-serial`        | BLOCKED    | 2/4 cleanup checks pass; 58/80mm submit menunggu migration 0073–0074      |
| `npm audit --omit=dev`      | PASS       | 0 critical, 0 high, 2 moderate                                            |
| `npm audit` (penuh)         | Bersyarat  | 9 high + 2 moderate, seluruhnya dev-time (`eslint`, `shadcn`, `ts-morph`) |

### 10.2 Bug yang ditemukan dan diperbaiki

| #   | Temuan                                                          | Dampak                                                            | Perbaikan                                                        |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | CTA menu mobile marketing dirender `<a role="button">`          | Semantik link hilang; sulit dinavigasi sebagai tautan             | Menu diubah menjadi dialog terkontrol; CTA memakai `<Link>` asli |
| 2   | Trigger menu menjadi inert saat dialog terbuka                  | Pengguna hanya bisa menutup dengan Escape; tidak ada tombol tutup | Tombol tutup 44px di dalam panel + close saat navigasi           |
| 3   | Trigger form collapsible 40px (`h-10`) di 6 halaman             | Target sentuh di bawah 44px                                       | `min-h-11` pada seluruh trigger                                  |
| 4   | Paginator admin 32px                                            | Sulit ditekan di tablet                                           | `min-h-11 min-w-11` pada semua sel paginasi                      |
| 5   | Tautan tabel user/business admin 17px                           | Target sentuh sangat kecil                                        | `inline-flex min-h-11 items-center`                              |
| 6   | Tautan "Bukti", "Dokumentasi", tab analitik, back-link 28–36px  | Target sentuh di bawah 44px                                       | `min-h-11` pada masing-masing kontrol                            |
| 7   | Tautan artikel dokumentasi & auth 19px                          | Target sentuh di bawah 44px                                       | `min-h-11` hanya pada pointer kasar                              |
| 8   | Select role staff `sm:h-9` (36px)                               | Menyusut di desktop/tablet sentuh                                 | Dihapus; tetap 44px                                              |
| 9   | `FeatureError` tanpa `<h1>`                                     | Halaman feature-gated tidak punya heading utama                   | `<h1>` ditambahkan pada kedua state                              |
| 10  | `.prettierrc` `semi: false` vs 334/400 berkas memakai semicolon | `format:check` gagal repo-wide                                    | Config diselaraskan ke `semi: true`; seluruh repo diformat       |
| 11  | Tes `downloadName` mencocokkan teks tanpa semicolon             | Tes gagal setelah format                                          | Regex dibuat toleran terhadap `;` opsional                       |
| 12  | Import `cn` dari paket eksternal di 7 primitive UI              | Dua sumber util; paket root tidak terpakai                        | Import ke `@/lib/utils`; dependency root `cn` dihapus            |
| 13  | `AUTH_URL` `.env.local` menunjuk port 4321                      | Login sukses tetapi redirect loop ke `/login`                     | Diset ke origin dev `http://localhost:3000` (tidak di-commit)    |
| 14  | Kontrol native (select/textarea/checkbox) <44px di layar sentuh | Sulit digunakan di tablet kiosk                                   | Aturan `@media (pointer: coarse)` di `globals.css`               |

### 10.3 Verifikasi fitur (bukan hanya UI)

| Fitur                | Bukti                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------- |
| Owner outlet CRUD    | Create + edit tersimpan di DB; nama kosong ditolak; 1/1 kuota plan dihormati            |
| Owner package CRUD   | Create Rp27.000 tersimpan integer; harga negatif ditolak                                |
| Owner photobox       | Create tersimpan dengan outlet relasi benar                                             |
| Owner support ticket | Tiket tersimpan status `open`                                                           |
| Owner settings       | Nama bisnis tersimpan                                                                   |
| Staff invite/role    | Invite role manager tersimpan; email invalid ditolak; ubah role ke staff tersimpan      |
| Payment credential   | Create Midtrans sandbox tersimpan; server key terenkripsi (bukan plaintext); toggle off |
| Admin plan           | Create tersimpan; kode duplikat ditolak                                                 |
| Admin promo          | Create persentase tersimpan; nilai >100 ditolak                                         |
| Admin user           | Create dengan password; suspend tersimpan status `suspended`                            |
| Admin settings       | `maintenance_message` tersimpan di `platform_settings`                                  |
| Admin audit log      | Aksi admin tercatat (`admin.plan.create`, `admin.user.update`, dst.)                    |
| POS terminal         | Tambah produk → bayar tunai → struk `POS-20261020-0001`; subtotal DB benar              |
| Login Auth.js        | Cookie sesi terpasang, baris `auth_sessions` dibuat, redirect ke `/dashboard`           |
| Kiosk invalid token  | `/r/invalid-token` → 404 sesuai kontrak                                                 |

### 10.4 Dead code & dependensi

- `getBusiness`, `getPhotoboxBranding`, `listStaff`, `VoucherAnalytics`: 0 referensi di `src/` dan `tests/`.
- Root dependency `cn` dihapus dari `package.json`; sisa entri `cn` hanya milik
  `@shadcn/registry` dan `shadcn` (transitive dev, bukan runtime).
- Tidak ada import `from "cn"` tersisa.

### 10.5 Risiko residual (jujur)

| Risiko                                             | Status                                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Advisory dev-time (`eslint`, `shadcn`, `ts-morph`) | 9 high + 2 moderate; 0 critical/high pada runtime (`--omit=dev`). Menunggu upstream.         |
| Rate limit in-memory per proses                    | Diterima operator; efektif = limit × jumlah instance.                                        |
| Migrasi `0071_rpc_search_path_hardening.sql`       | Belum diterapkan; keputusan pemilik. Tidak memblokir fitur saat ini.                         |
| Printer fisik                                      | E2E memverifikasi layout cetak + Bluetooth mock; uji printer fisik tetap manual.             |
| `R2_*` di produksi Vercel                          | Tidak diset; storage jatuh ke Supabase Storage (fallback terdokumentasi).                    |
| `npm run test:e2e` gabungan                        | Suite dijalankan satu per satu (headed) agar stabil; belum ada runner gabungan sekali jalan. |

---

## 11. Audit lanjutan 2026-10-20 (auto-print, POS, storage, deploy)

Lanjutan §10 pada working tree yang sama. Fokus: cetak ganda, idempotensi
pembayaran POS, satuan storage, teks artefak, dan verifikasi deploy produksi.

### 11.1 Gate yang dijalankan ulang

| Gate                         | Hasil      | Bukti                                                     |
| ---------------------------- | ---------- | --------------------------------------------------------- |
| `npm run typecheck`          | PASS       | exit 0                                                    |
| `npm run lint`               | PASS       | 0 error, 12 warning `no-img-element` (pre-existing)       |
| `npm test`                   | PASS       | 957/957                                                   |
| `npm run build`              | PASS       | Next.js 16.4.0, 93 halaman statis                         |
| `npm run format:check`       | PASS SCOPE | file scope audit lulus; 34 file legacy belum terformat    |
| `npm run test:e2e:print`     | PASS       | 4/4                                                       |
| `npm run test:e2e:bluetooth` | PASS       | 2/2 suite (BLE 2/2 + SPP 10/10)                           |
| `npm run test:e2e:kiosk`     | PASS       | 4/4 suite (smoke, lock, frames, responsive 15/15)         |
| `pos-receipt-serial`         | BLOCKED    | 58mm/80mm submit timeout; fixture tetap bersih 12→12      |
| `npm audit`                  | Bersyarat  | 0 critical, 9 high + 2 moderate (dev-time)                |
| Responsive owner/admin/POS   | PASS       | 108/108 — 390/768/1440, tanpa overflow atau console error |
| Responsive staff             | PASS       | 15/15 — sesi staff nyata, 390/768/1440                    |

### 11.2 Bug yang diperbaiki

| #   | Temuan                                                            | Dampak                                                           | Perbaikan                                                                  |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | Auto-print kiosk tidak punya guard per job                        | Strict Mode/remount/refresh dapat mencetak lembar ganda          | Claim `sessionStorage` + ref sebelum job dikirim; reprint eksplisit bypass |
| 2   | Tombol "Cetak ulang" diblokir guard auto-print                    | Customer menekan cetak ulang tetapi tidak ada kertas keluar      | `reprintRequested` di `KioskApp` diteruskan ke jalur cetak                 |
| 3   | Claim terpakai tetap menampilkan "permintaan cetak dikirim"       | UI mengklaim sukses padahal `window.print()` tidak dipanggil     | State `autoBlocked` → tampil "Siap dicetak" + tombol manual                |
| 4   | Retry manual setelah auto-print gagal ikut terblokir              | Tidak ada jalan pulih tanpa reload                               | `manualRetryRef` mengizinkan retry eksplisit                               |
| 5   | Auto-print POS memanggil chooser yang butuh gestur                | Auto-print tidak pernah jalan setelah pairing                    | `writeEscPosSerialGranted()` memakai port yang sudah diizinkan             |
| 6   | Pembayaran manual POS mengecek status sebelum transaksi existing  | Retry setelah timeout jaringan → 409 padahal uang sudah diterima | `classifyPosManualPay()`: transaksi existing menang, retry idempoten       |
| 7   | Label add-on storage seed masih "1 GB"                            | UI menampilkan GB meski produk memakai MB                        | Normalisasi baca + migrasi `0072`; schema seed memakai MB                  |
| 8   | Konversi MB tersebar (dua definisi)                               | Risiko selisih kuota vs tampilan                                 | `src/lib/storage-units.ts` = satu sumber 1 MB = 1.048.576 bytes            |
| 9   | Tally kuota add-on diduplikasi tanpa test                         | Regresi kuota tidak tertangkap                                   | `sumStorageAddOnMb()` + test (multi-baris, non-storage, qty invalid)       |
| 10  | `/dashboard/vouchers` melempar FEATURE_DISABLED ke error boundary | Plan tanpa voucher mencatat console error pada state normal      | Cek `hasFeature()` sebelum query → `FeatureLockedPanel` inline             |
| 11  | Prefix `///` tampil sebagai teks di eyebrow/empty state/email     | Artefak teks pada UI                                             | Prefix dihapus dari seluruh copy yang dirender                             |
| 12  | `BrowserPrintSheet.tsx` hanya re-export tanpa pemakai             | Dead code                                                        | Dihapus; komentar `print-layout.ts` dikoreksi                              |
| 13  | Tes `extendIsoDays` membandingkan dua `Date.now()`                | Flaky bila beda milidetik                                        | Diubah ke pemeriksaan jendela waktu                                        |
| 14  | Matcher harga E2E kiosk tidak menerima NBSP                       | `kiosk-frames` gagal palsu                                       | Regex `/Rp\s*\d/`                                                          |

### 11.3 Verifikasi deploy produksi

| Item                          | Hasil                                                                       |
| ----------------------------- | --------------------------------------------------------------------------- |
| Branch / commit               | `main` @ `ffa7508` (kode; commit dokumen setelahnya tidak mengubah runtime) |
| Push                          | `origin/main` sinkron dengan HEAD lokal                                     |
| Vercel deployment             | `READY`, alias `https://snapyos.vercel.app`                                 |
| `/api/health`                 | `status: ok`, database & storage `ok`                                       |
| `/`, `/login`, `/register`    | HTTP 200, tanpa console error, tanpa overflow                               |
| `/p/demo/demo` (kiosk publik) | HTTP 200, tanpa console error, tanpa overflow                               |
| Runtime log Vercel            | 0 error pada jendela log yang diperiksa                                     |

### 11.4 Residual & yang belum diverifikasi

| Item                                  | Status                                                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Printer Bluetooth fisik               | **BLOCKED / NOT VERIFIED** — tidak ada printer thermal terkonfirmasi; hanya mock BLE + SPP                                                                |
| Kamera fisik                          | **PARTIAL** — FaceTime HD Camera (3A71:F4B5): capture `getUserMedia` 1280×720 OK, tetapi frame gelap total (mean 2,71) → kualitas **BELUM TERVERIFIKASI** |
| Migrasi `0072_storage_addon_mb_label` | Ditulis + rollback tersedia; **belum diterapkan ke DB produksi**                                                                                          |
| Advisory dev-time                     | 9 high + 2 moderate; 0 critical (`npm audit`)                                                                                                             |
| Rate limit in-memory                  | Efektif = limit × jumlah instance (diterima operator)                                                                                                     |

---

## 12. Audit lanjutan 2026-10-22 (isolasi tenant, cache kiosk, integritas POS)

Lanjutan §11 pada working tree yang sama. Fokus: isolasi tenant pada jalur baca
publik, invalidasi cache kiosk, integritas referensi template, dan hot path POS.
Setiap temuan di bawah diverifikasi langsung di sumber sebelum diubah; klaim
laporan otomatis yang tidak terbukti **ditolak**, bukan dikutip.

### 12.1 Gate yang dijalankan ulang

```
$ npm run typecheck              exit 0
$ npm run lint                   exit 0  (0 error, 12 warning no-img-element)
$ npm test                       exit 0  (958/958, 0 fail)
$ npm run build                  exit 0  (Next.js 16.4.2, 93 halaman, standalone assets prepared)
$ npx prettier --check <file scope audit>   All matched files use Prettier code style!
$ npm audit --omit=dev           0 critical, 0 high, 2 moderate (runtime)
$ npm audit                      0 critical, 9 high, 2 moderate (seluruhnya dev-time)
```

Tidak ada gate yang ditandai PASS tanpa dijalankan pada working tree ini.

### 12.2 Temuan & perbaikan

| #   | Temuan                                                                                                     | Dampak                                                                | Perbaikan                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | `createPackage`/`updatePackage` tidak memvalidasi kepemilikan `template_ids`, `outlet_ids`, `photobox_ids` | Owner bisa menautkan template/outlet/photobox tenant lain ke paketnya | `assertIdsOwned()` untuk ketiga relasi; template global (`business_id is null`) tetap diizinkan           |
| 2   | Mutasi paket tidak menginvalidasi cache public-config kiosk                                                | Perubahan paket tidak tampil di kiosk sampai TTL 30 detik habis       | `invalidatePublicConfig(businessId)` di create/update/delete paket                                        |
| 3   | `updateSettings` mengubah `branding`/`checkout` tanpa invalidasi public-config                             | Branding & mode offline kiosk basi                                    | Invalidasi saat `branding` atau `checkout` berubah                                                        |
| 4   | ETag public-config meng-hash signed URL                                                                    | ETag berubah tiap 30 detik → klien selalu mengunduh ulang             | Signed URL dinormalisasi (query dibuang) sebelum hash; isi berubah tetap mengubah ETag                    |
| 5   | `loadResult` tidak membandingkan `business_id` sesi dengan baris result                                    | Token result bisa membuka sesi tenant lain bila relasi menyimpang     | Guard `session.business_id !== row.business_id` → `NOT_FOUND`; query foto di-scope `business_id`          |
| 6   | `photoboxes.default_template_id` tanpa FK (docs/07 sudah menyebutnya)                                      | Template terhapus meninggalkan id menggantung di booth                | Migrasi `0075`: FK `on delete set null` + index parsial                                                   |
| 7   | Decrement stok POS = satu RPC per item (N+1)                                                               | Order 10 baris = 10 round-trip ke DB                                  | RPC batch `pos_decrement_stock_batch` (migrasi `0076`), hasil per produk tetap dilaporkan                 |
| 8   | Video per halaman branding hanya divalidasi ukuran, bukan durasi                                           | Video >5 detik lolos di editor halaman                                | `probeVideo()` dipakai kedua jalur; `VIDEO_MAX_SECONDS` satu sumber di `src/lib/upload-validation.ts`     |
| 9   | `color-mix()` tanpa fallback di WelcomeScreen                                                              | Overlay transparan hilang di Chromium <111                            | `hexToRgba()` di `src/lib/color.ts`                                                                       |
| 10  | Cleanup effect pan foto tidak membatalkan `requestAnimationFrame`                                          | RAF yatim menulis ke canvas setelah unmount                           | `cancelAnimationFrame` di cleanup, ref di-null-kan                                                        |
| 11  | Sanitizer LIKE ad-hoc di admin hanya membuang `%_`                                                         | `,()` memecah ekspresi PostgREST `.or()`                              | `likePattern()` (`src/lib/postgrest-search.ts`) di audit/users/businesses/pos-products                    |
| 12  | `persistRecipients` menghapus penerima sebelum insert pengganti                                            | Insert gagal → riwayat penerima & `resend_count` hilang               | Urutan dibalik: insert dulu, hapus penerima yang benar-benar keluar audiens                               |
| 13  | `uuidList()` tanpa batas                                                                                   | Form dengan ribuan checkbox menghasilkan URL filter melebihi batas    | `.slice(0, 200)`, sama dengan `idArray` di validators                                                     |
| 14  | Transaksi manual tidak memeriksa booth berada di outlet yang dipilih                                       | Data transaksi bisa menunjuk kombinasi outlet/booth yang tidak ada    | `assertBoothInOutlet()` → `VALIDATION_ERROR` bila beda outlet; dikunci `tests/manual-transaction.test.ts` |

### 12.3 Klaim laporan otomatis yang ditolak

`AUDIT-REPORT.md` (hasil pemindaian otomatis) memuat 21 temuan. Yang berikut
**tidak** diterapkan karena tidak terbukti saat diverifikasi di sumber:

| Klaim                                             | Alasan ditolak                                                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| "Webhook lookup tanpa `business_id`" (4 lokasi)   | `payments.order_id` `UNIQUE`; lookup per order_id tidak bisa lintas tenant. Filter tambahan tidak menambah keamanan                |
| "63 route tanpa auth"                             | Grep tidak mengenali wrapper `authRawRoute`; route publik memang publik                                                            |
| "`.or()` injection di checkout-shared"            | Sudah dijaga regex sebelum `.or()`                                                                                                 |
| "FK customer/event `SET NULL` memutus relasi"     | Tidak ada alur hapus customer/event di aplikasi                                                                                    |
| "Sempitkan `WEBHOOK_FRESHNESS_HOURS`"             | Akan menolak retry gateway yang sah (24 jam adalah jendela retry nyata)                                                            |
| "Kuota plan untuk paket/template"                 | Tabel `plans` tidak punya kolom kuota tersebut; menambahkannya mengubah semantik billing                                           |
| "Mismatch outlet/booth POS"                       | Outlet diturunkan server-side dari booth pada jalur POS                                                                            |
| "Index `checkout_sessions(expires_at)`"           | Cron memfilter `payments`/`sessions`, bukan `checkout_sessions`                                                                    |
| "Index `transactions(business_id, pos_order_id)`" | Partial unique index yang ada sudah melayani pola query tersebut                                                                   |
| "Race di `KioskApp`"                              | Sudah dijaga `busy`/`session`/`paidHandledRef`                                                                                     |
| "Circular reference `transactions.payment_id`"    | Kolom diisi oleh trigger settlement `0031` dan dibaca untuk rekonsiliasi; `on delete set null` di kedua arah, tidak ada alur hapus |

### 12.4 Migrasi baru

| Migrasi                              | Isi                                                                                                                                          | Status                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `0075_integrity_and_hot_indexes.sql` | FK `photoboxes_default_template_id_fkey`, `idx_photoboxes_default_template`, `idx_payments_credential`, `idx_payments_pending_expiry`        | Ditulis + rollback; **belum diterapkan** |
| `0076_pos_stock_batch.sql`           | `pos_decrement_stock_batch(uuid, jsonb) returns table(product_id, ok)`; `revoke` dari `public/anon/authenticated`, `grant` ke `service_role` | Ditulis + rollback; **belum diterapkan** |

`db/schema.sql` sudah dicerminkan untuk keduanya, jadi schema acuan dan migrasi
tidak drift. Keduanya idempotent (`if not exists` / `create or replace`) dan
aman diulang.

### 12.5 Dead code

Tidak ada berkas yang dihapus pada ronde ini: tidak ditemukan modul tanpa
referensi tambahan di luar yang sudah tercatat di §10.4. `AUDIT-REPORT.md` di
root adalah keluaran pemindaian otomatis, bukan dokumentasi produk; isinya yang
terbukti sudah diserap ke sini.

### 12.6 Risiko residual (jujur)

| Item                    | Status                                                                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Migrasi `0075` & `0076` | **BLOCKED** — butuh DB scratch/produksi ber-otorisasi; `verify-migration-rollbacks.mjs` menolak jalan tanpa `MIGRATION_CHECK_DB` |
| Printer thermal fisik   | **BLOCKED** — tidak ada perangkat terkonfirmasi; hanya mock BLE/SPP                                                              |
| Kamera fisik            | **BLOCKED** — frame gelap total pada perangkat uji (§11.4); kualitas capture belum terverifikasi                                 |
| Payment gateway nyata   | **NOT TESTED** — tidak ada transaksi finansial nyata (sesuai batasan tugas); hanya sandbox/kode                                  |
| E2E kiosk penuh         | **NOT TESTED** pada ronde ini — butuh fixture DB + server dev; gate terakhir yang tercatat §11.1                                 |
| Advisory dependensi     | Dev-time (`eslint`, `shadcn`, `ts-morph`); 0 critical/high runtime                                                               |

---

## 13. Audit lanjutan 2026-10-24 (runtime lokal, auth bridge, paritas skema)

Ronde ini berbeda dari §10–§12: yang diaudit adalah **kesiapan arsitektur
hybrid** (cloud control plane + runtime lokal yang menguasai kamera/printer),
bukan lagi fitur dashboard. Tidak ada artefak lama yang dipakai sebagai bukti;
setiap klaim di bawah berasal dari eksekusi pada working tree ini atau dari
pembacaan sumber yang dirujuk.

### 13.1 Gate yang dijalankan ulang

```
$ npm run lint                   exit 0  (0 error, 12 warning no-img-element)
$ npm run typecheck              exit 0
$ npm test                       exit 0  (971/971, 0 fail)
$ npm run build                  exit 0  (Next.js 16.4.2, standalone assets prepared)
$ npm audit --omit=dev           0 critical, 0 high, 2 moderate (uuid via exceljs)
$ npm audit                      0 critical, 5 high, 4 moderate (semua dev-time)
```

Jumlah tes naik dari 958 → 971 karena tiga berkas baru (§13.4). Dua tes lama
yang gagal pada ronde sebelumnya (`pakasir-webhook-credential`, `phase3`) sudah
diperbaiki ke kontrak aktual — **bukan** dilonggarkan: keduanya dulu mengunci
perilaku yang sudah sengaja diubah (jendela webhook 24 jam → 5 menit; plan
limits 4 field → 6 field).

### 13.2 Temuan & perbaikan

| #   | Prioritas | Temuan                                                                                                                                                                                                             | Dampak                                                                                                                        | Perbaikan                                                                                                                                                                                     |
| --- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **P0**    | `scripts/photobooth-bridge.mjs` tidak punya autentikasi sama sekali. Hanya ada allowlist `Origin`, dan request **tanpa** header Origin tetap diloloskan.                                                           | Proses lokal mana pun — dan seluruh LAN bila `PHOTOBOOTH_BRIDGE_HOST` diubah — bisa memicu shutter kamera dan mencetak struk. | Token wajib (`PHOTOBOOTH_BRIDGE_TOKEN`, ≥16 char): bridge menolak start tanpa token; setiap rute selain `/health` memverifikasi `X-Bridge-Token` via sha256 + `timingSafeEqual`.              |
| 2   | **P0**    | Token bridge tidak punya tempat penyimpanan di sisi kiosk.                                                                                                                                                         | Fitur baru di #1 tidak bisa dipakai tanpa jalur konfigurasi.                                                                  | `src/lib/bridge-token.ts` (localStorage perangkat) + `BridgeTokenField` di Setup Perangkat, muncul di mode `gphoto2` dan `cups`. Disimpan di perangkat, **bukan** di `camera_settings` cloud. |
| 3   | **P0**    | `db/schema.sql` (baseline DB baru) tidak memuat DDL dari migrasi `0063`, `0077`, `0078`, `0079`, `0080`.                                                                                                           | `psql -f db/schema.sql` menghasilkan DB tanpa `plans.max_packages` → `plan-limits.ts` gagal 42703 pada instalasi baru.        | Schema diselaraskan: `max_packages`/`max_templates`, tiga index hot path, FK customer `RESTRICT`, `transactions.payment_id` tanpa FK (siklus 0080), FK `invoice_payments.credential_id`.      |
| 4   | **P1**    | `/api/cron/reconcile-storage` ada, tapi tidak terjadwal di `vercel.json` maupun `deploy/cron/snapyos.cron`.                                                                                                        | `storage_usage` drift terhadap isi bucket tumbuh tanpa koreksi; kuota storage salah.                                          | Dijadwalkan `23 2 * * *` UTC di kedua mekanisme deploy.                                                                                                                                       |
| 5   | **P1**    | `.env.example` tidak memuat variabel yang benar-benar dibaca kode: `PHOTOBOOTH_BRIDGE_*`, `GPHOTO2_*`, `LP_BIN`, `LPSTAT_BIN`, `UPSTASH_REDIS_REST_*`, `PAYMENT_ENCRYPTION_KEY_V2`, `RECONCILE_STORAGE_CRON_OPEN`. | Operator VPS tidak tahu variabel mana yang wajib; bridge jalan tanpa token atau rate limit jatuh ke in-memory tanpa disadari. | Semua didokumentasikan dengan default, sifat wajib/opsional, dan konsekuensi bila kosong.                                                                                                     |
| 6   | **P1**    | `zod@4.4.3` rentan GHSA-mrhx-c7xc-m3w5 (memory exhaustion saat memvalidasi koleksi besar ber-constraint).                                                                                                          | Endpoint publik yang mem-parse body besar bisa dihabiskan memorinya.                                                          | Upgrade ke `zod@^4.6.7` (patch). Typecheck + 971 tes tetap hijau.                                                                                                                             |
| 7   | **P2**    | `docs/16` dan `docs/07` menyebut 31 fungsi SQL dan migrasi terakhir `0074`; aktual 32 fungsi dan `0080`.                                                                                                           | Dokumen acuan salah; operator salah menilai apa yang sudah ada.                                                               | Angka dan rentang migrasi diperbarui; paritas dijaga tes baru.                                                                                                                                |
| 8   | **P2**    | `docs/17-thermal-printing.md` §17.3–17.9 mendeskripsikan tabel `print_jobs`/`print_agents`, `src/server/print-jobs.ts`, `/dashboard/printers` — tidak satu pun ada.                                                | Rencana terbaca sebagai fitur selesai.                                                                                        | §17.1 ditulis ulang sesuai implementasi (tiga mode, tanpa antrian); §17.3–17.9 diberi banner "rancangan, belum dibangun".                                                                     |

### 13.3 Peta dependensi (runtime lokal ↔ cloud)

```
┌──────────────────────────── kiosk device (browser) ────────────────────────────┐
│  KioskApp (Step union, bukan FSM — lihat §13.6)                                 │
│    ├── CameraCapture ──► camera-provider.ts ─┬─► getUserMedia (browser)         │
│    │                                          └─► bridge /camera/capture        │
│    ├── PrintFlow ──► print-layout.ts ─┬─► window.print()                        │
│    │                                   ├─► Web Bluetooth (BLE ESC/POS)          │
│    │                                   ├─► Web Serial (Classic SPP)             │
│    │                                   └─► print/cups.ts ──► bridge /print      │
│    ├── offline-queue.ts (IndexedDB; token TIDAK dipersist)                       │
│    └── bridge-token.ts (localStorage: X-Bridge-Token)                            │
└────────────────────────────────────┬───────────────────────────────────────────┘
                                     │ HTTP 127.0.0.1:17777 (token wajib)
┌────────────────────────────────────▼───────────────────────────────────────────┐
│  scripts/photobooth-bridge.mjs  (node:http, bukan Next.js)                      │
│    ├── gphoto2 (child_process, argumen array — tanpa shell)                      │
│    ├── CUPS: lp / lpstat                                                         │
│    └── pdfkit → PDF per lembar                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                     │ HTTPS (cloud, tidak wajib saat offline)
┌────────────────────────────────────▼───────────────────────────────────────────┐
│  Next.js 16 (standalone) — control plane                                        │
│    67 route handler · 65 page · 109 modul src/server · 78 modul src/lib         │
│    Auth.js v5 (JWT + auth_sessions) · Supabase service-role (RLS inert)          │
│    R2 / Supabase Storage · Pakasir/Midtrans/Tripay (AES-256-GCM)                │
│    55 tabel · 32 fungsi SQL · 114 berkas migrasi (77 forward / 35 rollback)     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

Isolasi tenant tetap 100% di application code (`getMembership` → null → 404),
karena service-role melewati RLS. Runtime lokal **tidak** menyimpan keputusan
tenant sendiri: setiap finalize tetap divalidasi server.

### 13.4 Tes baru

| Berkas                                        | Menjaga                                                                                                                                                           |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/photobooth-bridge.test.ts` (diperluas) | Rute perangkat menolak request tanpa token dan dengan token salah (401); `/health` tetap terbuka; bridge keluar kode 1 bila `PHOTOBOOTH_BRIDGE_TOKEN` kosong.     |
| `tests/schema-migration-parity.test.ts`       | Setiap DDL `0063/0077/0078/0079/0080` ada di `db/schema.sql` **dan** di berkas migrasinya; FK customer tidak lagi `SET NULL`; `transactions.payment_id` tanpa FK. |
| `tests/cron-schedule.test.ts`                 | Setiap direktori `src/app/api/cron/*` terjadwal di `vercel.json` **dan** `deploy/cron/snapyos.cron`, dan kedua daftar identik.                                    |

Tidak ada tes lama yang dihapus pada ronde ini.

### 13.5 Kesiapan hybrid — status jujur

| Area                  | Status      | Keterangan                                                                                                                                                               |
| --------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth bridge lokal     | **DONE**    | Token wajib + constant-time compare; teruji otomatis                                                                                                                     |
| Abstraksi kamera      | **PARTIAL** | Dua provider (`browser`, `gphoto2`) dengan kontrak fetch yang sama; **tidak ada antarmuka adapter formal**, tidak ada mock kamera                                        |
| State machine sesi    | **BELUM**   | Masih `type Step` union + `useState` ad-hoc; tidak ada job ID, idempotency key, atau persistensi state untuk recovery restart                                            |
| Pipeline media        | **PARTIAL** | Render frame/crop/filter di klien (`photo-render.ts`, `chroma-key.ts`, `compose-frame.ts`); tidak ada job queue, tidak ada pemisahan original vs final eksplisit di disk |
| Printer service       | **PARTIAL** | Tiga jalur; **tanpa antrian**, tanpa status fisik. "Terkirim ke CUPS" ≠ kertas tercetak                                                                                  |
| Offline-first         | **PARTIAL** | Antrian IndexedDB + retry ada, tetapi item yatim **dihapus** saat reload penuh (token tidak dipersist — tradeoff keamanan sadar)                                         |
| Kiosk UI              | **PARTIAL** | Layar penuh, kontrol ≥44px, state loading/error ada; belum ada idle timeout yang mengosongkan media pelanggan sebelumnya                                                 |
| Installer/auto-launch | **BELUM**   | Hanya `photobooth-bridge.service.example`; tidak ada installer, tidak ada auto-launch kiosk setelah boot                                                                 |
| Paritas skema         | **DONE**    | Dijaga tes otomatis                                                                                                                                                      |

### 13.6 Temuan yang **belum** diperbaiki (backlog P0–P3)

| Prioritas | Temuan                                                                                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0**    | Tidak ada state machine sesi tervalidasi. `Step` union di `KioskApp.tsx` tidak mencegah double-capture, tidak punya job ID, dan state hilang saat restart.                                                  |
| **P0**    | Tidak ada antrian cetak. `submitCupsPrint` resolve saat CUPS menerima job — bukan saat kertas keluar. Tidak ada rekonsiliasi status fisik.                                                                  |
| **P1**    | Tidak ada mock kamera in-app; pengembangan tanpa hardware bergantung pada `getUserMedia` palsu di level browser.                                                                                            |
| **P1**    | Lima tabel schema tanpa satu pun referensi kode: `stickers`, `bookings`, `event_templates`, `device_logs`, `events`.                                                                                        |
| **P1**    | `src/proxy.ts` hanya menegakkan maintenance mode; gating auth/role sepenuhnya bergantung pada layout (`(dashboard)`, `(admin)`). Route baru yang lupa memakai wrapper `authRawRoute` tidak akan tertangkap. |
| **P1**    | Migrasi `0071`, `0073`, `0074`, `0077`, `0078`, `0079`, `0080` belum diterapkan ke cloud — butuh DB ber-otorisasi, tidak dijalankan di sini.                                                                |
| **P2**    | `.e2e-tmp/` (32 MB, 60 berkas terlacak) dan `.audit/` (136 MB) adalah scratch. `.e2e-tmp` di-gitignore tetapi berkas lama masih terlacak.                                                                   |
| **P2**    | `npm audit` masih 5 high di dev-time (`eslint`, `shadcn`, `ts-morph`); 0 high runtime setelah zod di-upgrade.                                                                                               |
| **P3**    | `docs/07` §7.4–7.7 masih menyebut FK tertunda yang sudah dipindah ke blok "FK tertunda" di `schema.sql`; perlu penyelarasan penomoran.                                                                      |

### 13.7 Risiko residual

| Item                           | Status                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Kamera fisik (DSLR/USB)        | **NOT TESTED** — tidak ada perangkat terhubung pada ronde ini; seluruh uji capture memakai bridge/mock       |
| Printer fisik                  | **NOT TESTED** — tidak ada printer terkonfirmasi                                                             |
| Bridge di Linux                | **NOT TESTED** — `gphoto2`/CUPS hanya diverifikasi sebagai kode; service unit belum dijalankan               |
| Migrasi ke DB sungguhan        | **BLOCKED** — tidak ada `psql`/docker di mesin ini; paritas dijaga secara statis, bukan dengan eksekusi      |
| Instalasi baru dari schema.sql | **NOT EXECUTED** — DDL sudah diselaraskan dan diuji literal, tapi belum pernah dijalankan ke Postgres kosong |

## 14. Audit lanjutan 2026-11-11 (gate penuh, dependensi, hygiene repo)

Ronde ini dijalankan pada working tree `feat/landing-operational-value` sebelum
commit. Semua angka di bawah berasal dari eksekusi pada working tree ini.

### 14.1 Gate yang dijalankan

| Gate                     | Hasil              | Bukti                                                   |
| ------------------------ | ------------------ | ------------------------------------------------------- |
| `npm run lint`           | **PASS**           | exit 0, 0 error, 11 warning `@next/next/no-img-element` |
| `npm run typecheck`      | **PASS**           | exit 0                                                  |
| `npm test`               | **PASS**           | 1384/1384, 0 fail                                       |
| `npm run build`          | **PASS**           | exit 0, 99 halaman statis, standalone assets prepared   |
| `npx prettier --check .` | **PASS**           | exit 0, seluruh berkas sumber terformat                 |
| `npm audit`              | **PASS bersyarat** | 0 critical, 0 high; 12 moderate + 2 low (dev-time)      |
| `npm audit --omit=dev`   | **PASS bersyarat** | 0 critical, 0 high; 2 moderate (`exceljs` → `uuid`)     |

### 14.2 Temuan & perbaikan

| #   | Temuan                                                                                                                                               | Dampak                                                                                    | Perbaikan                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | `vitest@3.2.7` terpasang sebagai devDependency tetapi **nol** impor di `src/` dan `tests/` (test runner repo = `node --test`)                        | Dua advisory **critical** (`vitest` → `@vitest/mocker`, `tinypool`) tanpa manfaat apa pun | Dependency dihapus; `npm audit` critical 2 → 0                                                                |
| 2   | `shadcn@4.21.4` menarik 4 advisory high (`@shadcn/registry`, `deepmerge`, `ts-morph`, `zod`)                                                         | Tooling dev rentan                                                                        | Naik ke `shadcn@^4.23.0`; high 6 → 0                                                                          |
| 3   | `undici@7.30.0` + `systeminformation@5.33.4` (transitive dev)                                                                                        | 8 + 3 advisory                                                                            | Terselesaikan oleh bump `shadcn`; tanpa override tambahan                                                     |
| 4   | 190 berkas tidak sesuai Prettier (124 `src`, 31 `tests`, 15 `docs`, 10 `runtime`, 3 `windows`, `db`, `plan.md`, `AUDIT-REPORT.md`)                   | `format:check` gagal repo-wide                                                            | `prettier --write` pada seluruh berkas sumber; `format:check` exit 0                                          |
| 5   | `.e2e-tmp/` (32 MB, 60 berkas), `.audit-out/` (13), `.audit-security/` (7) terlacak padahal scratch                                                  | Repo membengkak; diff audit bercampur artefak                                             | `git rm -r --cached` (berkas tetap di disk) + masuk `.gitignore`/`.prettierignore`                            |
| 6   | 7 arsip rilis `windows/*.zip` (~506 MB) tidak di-gitignore                                                                                           | Satu `git add -A` akan mendorong setengah gigabyte biner                                  | `windows/*.zip` di-gitignore                                                                                  |
| 7   | `tests/gif-e2e.test.ts` menolak literal `photos.map((p) => p.blob) : final.map((p) => p.blob)` yang kini menjadi **argumen** `resolveGifFrames(...)` | 1 tes gagal padahal implementasi benar (render berframe lewat `composeFrame`)             | Penjaga diubah: wajib `const gifSource = await resolveGifFrames(` dan menolak assignment langsung bentuk lama |
| 8   | `scripts/r2-lifecycle.mjs` punya konstanta `DAY` tak terpakai                                                                                        | 1 warning lint                                                                            | Konstanta dihapus                                                                                             |

### 14.3 Migrasi baru (ditulis, belum diterapkan ke cloud)

| Migrasi                                     | Isi                                                                                             | Status                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `0082_print_paths_and_output_settings.sql`  | `business_settings.output` (jsonb, GIF), `pos_orders.print_mode` menerima `cups`                | Ditulis + rollback; **belum diterapkan** |
| `0083_pos_receipt_cups_and_cash_change.sql` | `pos_orders.amount_received`/`change_amount` + CHECK turunan, `pos_complete_payment` 12 argumen | Ditulis + rollback; **belum diterapkan** |
| `0084_payment_enabled_methods_cleanup.sql`  | Pembersihan `payment_credentials.metadata.enabled_methods` (data-only, idempoten)               | Ditulis + rollback; **belum diterapkan** |

`db/schema.sql` sudah mencerminkan DDL 0082/0083 (kolom, CHECK, signature RPC,
`search_path`), jadi baseline dan migrasi tidak drift. 0084 tidak menambah DDL.

### 14.4 Risiko residual (jujur)

| Item                                                                              | Status                                                                                                                        |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `exceljs` → `uuid` moderate (runtime)                                             | Dibiarkan: satu-satunya "fix" adalah downgrade semver-major ke `exceljs@3.4.0`; `uuid` hanya dipakai untuk nama berkas ekspor |
| Advisory dev-time low/moderate (`shadcn` chain, `typescript-eslint`, `minimatch`) | 0 critical/high; menunggu rilis upstream                                                                                      |
| Migrasi 0082–0084                                                                 | **BLOCKED** — butuh DB ber-otorisasi; paritas dijaga statis                                                                   |
| Printer/kamera fisik, build `.exe`/`.msi`                                         | **NOT TESTED** — butuh Windows x64 dan perangkat nyata                                                                        |
