# 18. Laporan Audit & Status Rilis

> **Status**: laporan akhir audit menyeluruh + status kesiapan rilis.
> **Basis**: kode `src/`, `db/schema.sql`, `db/migrations/`, `tests/`, `deploy/`.
> **Peta verifikasi**: `docs/16-feature-map-audit.md`.
> **Tanggal ukur**: 2026-10-20 · **Commit dasar**: `8d4e995` · **Branch**: `main`
> · **Working tree**: audit 2026-10-20 (lihat §10 untuk hasil gate terbaru).
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

---

## 1. Ringkasan gate

| #   | Gate                                | Hasil              | Bukti                                              |
| --- | ----------------------------------- | ------------------ | -------------------------------------------------- |
| G1  | `npm run lint`                      | **PASS**           | 0 error, 12 warning (pre-existing)                 |
| G2  | `npm run typecheck`                 | **PASS**           | exit 0                                             |
| G3  | `npm test`                          | **PASS**           | 910/910 (audit cetak 2026-10-20)                   |
| G4  | `npm run build`                     | **PASS**           | exit 0, 93 halaman statis                          |
| G5  | `npm run build` (output standalone) | **PASS**           | exit 0, `.next/standalone/server.js` ada           |
| G6  | `npm audit`                         | **PASS bersyarat** | 0 critical; 9 high + 2 moderate (§2.5)             |
| G7  | Uji keamanan (subset)               | **PASS**           | 51/51                                              |
| G8  | E2E kiosk headed                    | **PASS**           | 33/33 (6+7+5+15)                                   |
| G16 | E2E cetak foto/struk (headed)       | **PASS**           | 30/30 (4 browser + 2 BLE + 10 SPP foto + 16 struk) |
| G9  | Smoke test pasca-deploy             | **PASS**           | 21/21 (skrip lama, sudah dihapus)                  |
| G10 | Hygiene repo                        | **PASS**           | `.gitignore` + `.env.example` tanpa nilai rahasia  |
| G11 | Verifikasi migrasi + rollback       | **PASS statis**    | 94 berkas, 42 tanpa rollback (§6)                  |
| G12 | Boot produksi standalone + health   | **PASS**           | 200, `database ok`, `storage ok`                   |
| G13 | `npm run format:check`              | **PASS**           | seluruh repo, setelah `.prettierrc` `semi: true`   |
| G14 | Interaksi UI sentuh (headed)        | **PASS**           | 38/38 assertion, 0 kontrol <44px                   |
| G15 | CRUD fitur ke database              | **PASS**           | 15/15 owner · 11/11 staff/payment · 12/12 admin    |

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
ℹ tests 910
ℹ pass 910
ℹ fail 0
ℹ duration_ms 3495
```

Naik dari 883 karena audit cetak menambahkan pengujian encoder struk (lebar fisik
32/48 kolom, font 2x, potong kertas), transport Web Serial (retry open, chunking,
abort, cleanup), fallback pemilih printer BLE, dan kontrak widget Turnstile.

### 2.3a Cetak thermal (2026-10-20)

| Suite                                        | Hasil    | Bukti                                                       |
| -------------------------------------------- | -------- | ----------------------------------------------------------- |
| `npm run test:e2e:print`                     | **PASS** | 4/4 — dua lembar, PDF 2 halaman, tanpa console error        |
| `npm run test:e2e:bluetooth`                 | **PASS** | 2/2 suite, 12 assertion (BLE chunking 2, SPP foto nyata 10) |
| `node tests/e2e/pos-receipt-serial.spec.mjs` | **PASS** | 16/16 — transaksi nyata, 58mm ≤32 kolom, 80mm ≤48 kolom     |

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
kode dan disegarkan: route API 61→**63**, cron 4→**5**, fungsi SQL 26→**29**,
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
menjalankan `git pull --ff-only`, `npm ci`, `npm run build`, menyalin
`.next/static` dan `public` ke bundel standalone, lalu restart systemd dan
menunggu `/api/health`.

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

### **NOT READY TO DEPLOY**, belum diverifikasi di VPS

Semua gate yang **bisa** dijalankan di mesin ini **PASS**, dan tidak ada blocker
kode yang tersisa:

- lint 0 error · typecheck exit 0 · 821/821 unit · build exit 0 (93 halaman)
- standalone VPS build exit 0 + boot produksi health 200 (DB & storage ok)
- uji keamanan 51/51 · E2E kiosk **23/23** · smoke **21/21**
- `npm audit` 0 critical · hygiene repo bersih
- satu-satunya temuan E2E (404 vs 200) **diperbaiki** + dijaga tes regresi

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

| Gate                        | Hasil     | Catatan                                                                   |
| --------------------------- | --------- | ------------------------------------------------------------------------- |
| `npm run typecheck`         | PASS      | setelah seluruh patch                                                     |
| `npm run lint`              | PASS      | 0 error, 12 warning `no-img-element` yang disengaja                       |
| `npm test`                  | PASS      | 910/910                                                                   |
| `npm run build`             | PASS      | Next.js 16.4.0, 93 halaman statis                                         |
| `npm run format:check`      | PASS      | repo-wide; 520+ berkas diformat ulang, tes regex diselaraskan             |
| `kiosk-smoke` (headed)      | PASS      | 6/6                                                                       |
| `kiosk-lock` (headed)       | PASS      | 7/7                                                                       |
| `kiosk-frames` (headed)     | PASS      | 5/5                                                                       |
| `kiosk-responsive` (headed) | PASS      | 15/15 — iPad landscape/portrait, mini PC, 800×480, ponsel                 |
| `test:e2e:print`            | PASS      | 4/4 — dua lembar, PDF 2 halaman, tanpa console error                      |
| `test:e2e:bluetooth`        | PASS      | 2/2 suite, 12 assertion — BLE chunking + SPP foto nyata                   |
| `pos-receipt-serial`        | PASS      | 16/16 — struk 58mm/80mm, lebar fisik, cleanup fixture                     |
| `npm audit --omit=dev`      | PASS      | 0 critical, 0 high, 2 moderate                                            |
| `npm audit` (penuh)         | Bersyarat | 9 high + 2 moderate, seluruhnya dev-time (`eslint`, `shadcn`, `ts-morph`) |

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
