# plan.md — Parity & Improvisasi SnapyOS vs PhotoboothProject & photobooth-app

> Dokumen ini adalah **rencana eksekusi**. Baca §B dulu (rekomendasi + dampak) sebelum
> menyentuh fitur. §C mencatat yang sudah dikerjakan di sesi ini dan sudah lulus verifikasi.

Referensi eksternal yang diaudit:

- `https://photoboothproject.github.io` — PhotoboothProject/photobooth `dev` v4.99.0 (PHP 8.4 + JS)
- `https://github.com/photobooth-app/photobooth-app` — photobooth-app `main` v9.0.0 (Python + Vue 3)

Prinsip yang dipakai sepanjang plan: **backend adalah sumber kebenaran**, **uang selalu integer IDR**,
**satu bahasa visual (Neo-Brutalism)**, dan **tidak menambah abstraksi yang belum dibutuhkan**
(plugin penuh ditolak — lihat F9).

---

## A. Ringkasan posisi

| Lapisan | SnapyOS | PhotoboothProject | photobooth-app |
|---|---|---|---|
| Model | SaaS multi-tenant + commerce | appliance 1 booth | appliance 1 booth |
| Render gambar | klien (`canvas`) | server (GD) | server (Pillow/OpenCV) |
| Kamera | `getUserMedia` + bridge gphoto2/digiCamControl | gphoto2 / digiCamControl / Pi / webcam | gphoto2 / picamera2 / digicamcontrol / webcamv4l / webcampyav / wigglecam / virtual |
| Video | tidak ada | MP4 + GIF dari frame | `JobModelVideo` + `JobModelAnimation` |
| Print | browser / BLE ESC-POS / CUPS | shell command + print DB + limit + QR-on-print | plugin `commander` |
| i18n | id-ID saja | 20+ bahasa | 20+ bahasa |

**Kesimpulan arah:** SnapyOS tidak perlu mengejar appliance-parity. Yang perlu diambil adalah
(a) pipeline media server-side, (b) kanal print yang lebih matang, (c) multi-kamera dan video,
(d) i18n. Yang **tidak** perlu ditiru: plugin `pluggy` dan konfigurasi shell-command bebas.

---

## B. Rekomendasi sebelum perubahan — yang akan diubah & dihapus

### B.1 Yang dihapus / dibersihkan

| # | Item | Alasan | Dampak | Status |
|---|---|---|---|---|
| 1 | Import `Button` tak terpakai di `src/components/dashboard/SubscriptionPanel.tsx` | dead import | nol (tidak dipakai) | **selesai** |
| 2 | `.audit-run/**` bocor ke ESLint | temp dir gitignored tapi tetap dilintasi | −2 warning, lebih cepat | **selesai** |
| 3 | Klaim rate limit usang di `AGENTS.md` + `docs/09-security-storage.md` | dokumen ≠ kode (Redis sudah ada) | keputusan arsitektur tidak lagi salah basis | **selesai** |
| 4 | `capture_mode: "burst"` sebagai no-op senyap | enum disimpan/ditampilkan tapi berperilaku = `single` | sekarang berperilaku nyata (lewati layar review) | **selesai** |
| 5 | Duplikasi `src/components/kiosk-simulation.tsx` (543 baris: harga hardcode `:19-23`, filter/frame sendiri `:25-36`) | mock marketing bisa menampilkan harga/fitur palsu | **akan diubah**: pindah ke satu modul data `src/lib/kiosk-demo-data.ts` yang dipakai bersama; butuh cek ulang visual landing | Phase 0.3 |
| 6 | — | `vitest` **JANGAN dihapus** | dipakai 3 test lewat dual-runner (`process.env.VITEST ? vitest : node:test`) | — |

### B.2 Yang akan diubah (dengan dampak yang harus diterima)

| ID | Perubahan | Dampak positif | Dampak/risiko yang harus ditanggung |
|---|---|---|---|
| F1 | Komposisi final dipindah ke server (`sharp`), klien hanya preview | anti-tamper, hasil cetak identik antar device, prasyarat print server | output berubah halus → **butuh parity test** template lama; +CPU server; +1 round-trip di finalize |
| F2 | Tambah backend kamera: picamera2/libcamera, webcamv4l, wigglecam, virtual | jangkauan hardware (Pi, webcam USB, 3D wigglegram) | dependensi OS booth bertambah; installer (`scripts/install-photobooth-bridge.sh`, `build-booth.ps1`) harus diperbarui; kontrak bridge **tidak** berubah (`/capture`, `/preview`) |
| F3 | Video MP4 + boomerang + GIF from frames | parity fitur; paket "video booth" | storage & CPU naik → `storage_usage` ledger + `retention_days` wajib ikut; `MediaRecorder` tidak ada di WebView lama → fallback wajib |
| F4 | Print DB + print limit + QR-on-print + auto-print delay | parity print PhotoboothProject; kontrol biaya cetak | migrasi tabel `print_jobs`; laporan & limit harus konsisten; retry cetak idempotent |
| F5 | Multi-kamera (stills + stream terpisah) | kualitas still DSLR + live stream webcam | `camera_settings` berubah bentuk → migrasi data + validasi; UI pemilihan 2 sumber |
| F6 | Collage layout generator (layout kustom) | parity "Collage layout generator" | slot editor + penyimpanan layout; isolasi path (jangan ulangi celah traversal seperti `Collage.php` yang menambal `normalizeLayoutId`) |
| F7 | Hardware input: GPIO button/rotary, WLED, commander | parity hardware | **permukaan serangan**: command eksekusi bebas. Wajib allowlist + tanpa shell string |
| F8 | Realtime SSE + remote control | parity realtime; monitoring booth | kanal kontrol butuh auth kuat (device token + audit) |
| F9 | ~~Plugin architecture (pluggy)~~ **DITOLAK** | — | menambah permukaan serangan + abstraksi tanpa pembeli; cukup extension point sempit bila perlu |
| F10 | i18n (`next-intl`), default id-ID | buka pasar EN; parity 20+ bahasa | diff menyentuh **seluruh UI copy** → freeze window + review Neo-Brutalism; menambah route/SEO |

### B.3 Yang tidak berubah (dikunci)

- Gate subscription tetap **satu**: `isSubscriptionEffective()` (`src/lib/subscription-math.ts`).
- Uang tetap integer IDR; schema tetap `integer` + `check >= 0`.
- `/pos/*` tetap offline-cash, tanpa role baru.
- Satu bahasa visual: Neo-Brutalism saja.

---

## C. Sudah dikerjakan di sesi ini (verifikasi: hijau)

Semua di bawah ini **sudah diterapkan** dan lulus `lint` (0 error), `typecheck`, dan `test` (1154/1154).

| # | Temuan | Perbaikan | Berkas |
|---|---|---|---|
| C1 | **P1** staff tak bisa konfirmasi tunai (403) | guard `transaction:write` → `payment:confirm` (owner+manager+staff lolos) | `src/app/api/v1/public/[businessSlug]/payments/cash-confirm/route.ts:29` |
| C2 | **P1** checkout paid bisa berakhir `result_token: null` | cek `error` saat link checkout↔session; rollback sesi + lempar `INTERNAL` | `src/server/kiosk-sessions.ts:373` |
| C3 | **P2** tunai kedua → 500 | map `23505` → `PAYMENT_ALREADY_PROCESSED` | `src/server/payment/payment-create.ts:120` |
| C4 | **P2** poll status 60/menit per IP → 429 di 3 booth 1 NAT | limit IP 600/menit + limit per device 120/menit | `.../payments/[paymentRef]/status/route.ts` |
| C5 | **P2** nomor TX hardcode `Asia/Jakarta` | helper `getBusinessTimezone()`; dipakai settlement + voucher | `src/server/payment/checkout-shared.ts`, `settlement.ts`, `payment-create.ts` |
| C6 | **P2** foto pelanggan bisa hilang dari antrian offline | grace yatim 1 jam → 24 jam | `src/components/kiosk/offline-queue.ts:127` |
| C7 | **P3** drift dokumen rate limit | AGENTS.md + docs/09 + tabel residual disinkronkan | `AGENTS.md:53`, `docs/09-security-storage.md` |
| C8 | **P3** dead code | hapus import `Button`; ESLint abaikan `.audit-run/**` | `SubscriptionPanel.tsx`, `eslint.config.mjs` |
| C9 | **P3** `capture_mode:"burst"` no-op senyap | burst kini melewati layar review antar shot | `src/components/kiosk/CameraCapture.tsx`, `KioskApp.tsx` |

Perintah verifikasi (jalankan sebelum merge):

```bash
npm run lint && npm run typecheck && npm test
npm run verify   # + next build (wajib sebelum rilis)
```

---

## D. TODO LIST

### Phase 0 — Bersih-bersih & pemantapan (P0, kecil, aman)
- [x] C1 staff cash-confirm
- [x] C2 link checkout↔session
- [x] C3 tunai 23505
- [x] C4 limit poll status
- [x] C5 timezone nomor TX
- [x] C6 grace antrian offline
- [x] C7 sinkron dokumen rate limit
- [x] C8 hapus dead code (import, eslint ignore)
- [x] C9 implementasi burst
- [ ] 0.1 Jalankan `npm run verify` penuh di CI lokal
- [ ] 0.2 Tambah test regresi: tunai kedua → 409; staff boleh cash-confirm; burst `photoCount` langkah
- [ ] 0.3 Konsolidasi `kiosk-simulation.tsx` → `src/lib/kiosk-demo-data.ts` (satu sumber harga/filter)
- [ ] 0.4 Satukan 6 loader subscription → `getEffectiveSubscriptionRow()`
- [ ] 0.5 Naikkan `bridge-token` dari `localStorage` ke rotasi per-boot / cookie HttpOnly
- [ ] 0.6 `rateLimitByDevice` juga untuk `checkout-create` dan `finalize`

### Phase 1 — Pipeline media server-side (F1)
- [ ] 1.1 Modul `src/server/media/compose.ts` (sharp: slot clip, frame overlay, filter preset, teks/stiker)
- [ ] 1.2 Parity test: hasil klien vs server (toleransi RMSE) untuk tiap `FILTER_PRESETS` + layout
- [ ] 1.3 Flag per-business `render_authority: "client"|"server"` (default `client`, opt-in `server`)
- [ ] 1.4 Migrasi bertahap: finalize mengirim blob mentah, server memproduksi `photos.file_key` final

### Phase 2 — Backend kamera (F2)
- [ ] 2.1 `runtime/camera/picamera2.ts` (libcamera still/`--capture-preview`)
- [ ] 2.2 `runtime/camera/webcamv4l.ts` (v4l2/ffmpeg) + `virtual.ts`
- [ ] 2.3 `wigglecam.ts` (multi-frame wiggle) — boleh menyusul
- [ ] 2.4 Perbarui `CameraKind` di `runtime/config.ts` + autodetect (`--auto-detect`, `/dev/video*`)
- [ ] 2.5 Perbarui `scripts/install-photobooth-bridge.sh` + `build-booth.ps1` + dokumentasi booth

### Phase 3 — Video & boomerang (F3)
- [ ] 3.1 `MediaRecorder` di `CameraCapture` (deteksi dukungan, fallback ke GIF still)
- [ ] 3.2 `JobModel`-lite di server: `src/server/media/video.ts` (transcode MP4 + GIF/boomerang)
- [ ] 3.3 Skema: `photos.media_type`, `sessions.result_video_key`, retensi & `storage_usage`
- [ ] 3.4 UI result: pemutar video + unduh MP4 di `/r/[token]`

### Phase 4 — Print parity (F4)
- [ ] 4.1 Tabel `print_jobs` (status, idempotency key, printer, copies, quantum)
- [ ] 4.2 `print_limit` per sesi/hari + `print_count` package ditegakkan server
- [ ] 4.3 QR-on-print (token di area cetak) + `auto_print_delay_ms`
- [ ] 4.4 Tombol cetak independen (muncul di galeri/result) sesuai PhotoboothProject

### Phase 5 — Multi-kamera (F5)
- [ ] 5.1 `camera_settings.stills` + `camera_settings.stream` (migrasi + validator)
- [ ] 5.2 `AcquisitionService`-lite: pilih sumber still vs preview
- [ ] 5.3 UI admin: pilih 2 sumber + indikator status masing-masing

### Phase 6 — Collage layout generator (F6)
- [ ] 6.1 Editor layout slot (reuse `TemplateBuilder`) + simpan ke `templates.layout`
- [ ] 6.2 Validasi ketat: id layout tanpa `/`, `\`, `\0`; path di bawah direktori layout

### Phase 7 — Hardware input (F7)
- [ ] 7.1 GPIO button/rotary di runtime (event → event kiosk, bukan shell)
- [ ] 7.2 WLED signalling (HTTP JSON, tanpa command)
- [ ] 7.3 "commander" versi aman: allowlist aksi (print, lights, copy) — **tanpa shell string**

### Phase 8 — Realtime (F8)
- [ ] 8.1 SSE `/api/v1/business/booths/stream` (status sesi, pembayaran, printer)
- [ ] 8.2 Remote action (reset/abort/print) lewat device token + audit log

### Phase 9 — i18n (F10)
- [ ] 9.1 `next-intl` + `messages/id.json` sebagai default
- [ ] 9.2 Ekstraksi string UI per area (marketing, auth, dashboard, staff, kiosk, POS, result)
- [ ] 9.3 Locale routing + hreflang; fallback id-ID

---

## E. Prompt eksekusi siap pakai

> Copy-paste satu blok per sesi. Setiap prompt sudah memuat konteks, batasan, dan DoD.

### E.0 — Verifikasi & regresi Phase 0

```
Baca plan.md §C dan §D Phase 0. Kerjakan hanya item 0.1–0.6.

Konteks: /Users/ucaany/Downloads/PT SNAPY OS, branch feat/landing-operational-value.
Aturan repo: uang integer IDR; backend source of truth; Neo-Brutalism satu-satunya UI;
jangan tambah dependency baru; jangan ubah db/schema.sql kecuali diminta.

Tugas:
1. 0.1 jalankan `npm run verify` dan laporkan hasil apa adanya.
2. 0.2 tambah test di tests/ (node:test, pola file yang ada):
   - tunai kedua pada checkout sama → 409 PAYMENT_ALREADY_PROCESSED
   - staff (rbac "staff") boleh `payment:confirm` (assert can("staff","payment:confirm"))
   - burst: photoCount=3 melewati review (uji helper murni bila perlu, ekstrak logika
     commit ke fungsi yang bisa diuji tanpa DOM)
3. 0.3 konsolidasi src/components/kiosk-simulation.tsx:
   - buat src/lib/kiosk-demo-data.ts berisi demoPackages/demoFilters/demoFrames
   - kiosk-simulation.tsx mengimpor dari sana; hapus duplikasi
   - JANGAN ubah tampilan; verifikasi visual manual dijelaskan langkahnya
4. 0.4 satukan loader subscription: buat satu `getEffectiveSubscriptionRow(businessId)`
   di src/server/subscription/require-subscription.ts dan pakai di
   plan-limits.ts, pos-entitlement.ts, feature-gate.ts, storage-usage.ts, business.ts.
   Perilaku harus identik (termasuk grace past_due) — buktikan dengan grep pemakaian.
5. 0.5 pindahkan bridge-token dari localStorage:
   - runtime mengeluarkan token per-boot (perulangan saat proses hidup)
   - simpan di cookie HttpOnly + endpoint penukar; klien tidak pernah melihat token mentah
   - perbarui runtime/http.ts (CORS) dan src/lib/bridge-token.ts
6. 0.6 tambah rateLimitByDevice pada checkout-create dan finalize.

Output: diff ringkas + bukti menjalankan lint/typecheck/test. Jangan commit.
```

### E.1 — Pipeline media server-side (F1)

```
Baca plan.md §B.2 F1 dan §D Phase 1.

Target: server menjadi otoritas komposisi, klien hanya preview.
Berkas acuan yang WAJIB dibaca dulu: src/lib/compose-frame.ts, src/components/kiosk/photo-render.ts,
src/lib/chroma-key.ts, src/lib/kiosk-types.ts (FILTER_PRESETS), src/server/kiosk-sessions.ts
(finalizeSession), src/lib/template-layout.ts.

Tugas:
1. Buat src/server/media/compose.ts memakai `sharp` (sudah ada dependency):
   - slot clip-path dari TemplateLayout, frame PNG overlay, filter preset, teks/stiker.
   - Semua input divalidasi: dimensi maksimum, jumlah slot, ukuran file.
2. Buat src/server/media/filters.ts: port preset FILTER_PRESETS ke operasi sharp
   (modulate/linear/tint/gamma) agar hasil ~= kanvas klien.
3. Tambah field `business_settings.render.render_authority: "client"|"server"` (default "client"),
   dibaca server-side; JANGAN percaya nilai dari klien.
4. finalizeSession: bila "server", terima blob mentah per slot, komposisi di server,
   lalu unggah hasil ke R2 dengan key yang sama seperti sekarang.
5. Test parity: tests/media-compose.test.ts — fixture JPEG kecil, bandingkan hasil
   klien (dipanggil sebagai fungsi murni) vs server, toleransi dinyatakan eksplisit.

Batasan: jangan ubah db/schema.sql; jangan hapus jalur klien (harus tetap default).
DoD: npm run lint && npm run typecheck && npm test hijau; dijelaskan cara mengaktifkan per-business.
```

### E.2 — Backend kamera (F2)

```
Baca plan.md §B.2 F2, runtime/camera/types.ts (kontrak CameraAdapter), runtime/camera/index.ts,
runtime/config.ts, runtime/http.ts.

Tugas:
1. Tambah `picamera2` ke CameraKind + runtime/camera/picamera2.ts:
   - status() dari `libcamera-still --list-cameras` (cache 10 s)
   - preview() via `libcamera-still -n --width 640 --timeout 1 -o -` (buffer JPEG)
   - capture() via `libcamera-still -n --quality 95 -o -`
   - aturan kontrak: kegagalan preview TIDAK membatalkan capture.
2. Tambah webcamv4l.ts (ffmpeg `-f v4l2` satu frame) dan virtual.ts (fixture untuk test).
3. Autodetect di createCamera(): urutan gphoto2 → picamera2 → digicamcontrol → webcamv4l → mock,
   dengan override env (SNAPYOS_CAMERA).
4. Perbarui scripts/install-photobooth-bridge.sh dan build-booth.ps1 (paket opsional).
5. Test: tests/runtime-camera-select.test.ts — pemilihan adapter dari config tanpa menjalankan kamera.

DoD: lint/typecheck/test hijau; `runtime/camera/*` tidak menambah dependency npm baru.
```

### E.3 — Video & boomerang (F3)

```
Baca plan.md §B.2 F3, src/components/kiosk/CameraCapture.tsx, src/server/kiosk-sessions.ts (finalize),
db/schema.sql (sessions/photos), src/server/storage/.

Tugas:
1. Kamera klien: tambah perekaman `MediaRecorder` dengan deteksi dukungan
   (MediaRecorder.isTypeSupported) — bila tidak ada, fallback ke GIF still yang sudah jalan.
2. Server: src/server/media/video.ts memakai ffmpeg (biner sistem, BUKAN dependency npm)
   untuk transcode ke MP4 + GIF; tolak bila ffmpeg tidak ada dengan error yang jelas.
3. Skema (butuh persetujuan pemilik dulu — tampilkan DDL, jangan jalankan):
   ALTER sessions ADD result_video_key text;
   ALTER photos ADD media_type text not null default 'image' check (media_type in ('image','video','gif'));
4. Retensi & storage_usage harus menghitung video (byte) — perbarui cron retention.
5. UI result /r/[token]: pemutar video + unduh MP4.

DoD: lint/typecheck/test hijau; DDL disajikan sebagai migrasi baru bernomor (db/00xx_*.sql),
tidak mengedit schema.sql yang sudah dirilis.
```

### E.4 — Print parity (F4)

```
Baca plan.md §B.2 F4, src/lib/print-mode.ts, src/lib/print/*, src/components/kiosk/PrintFlow.tsx,
src/lib/print-layout.ts, runtime/print/*.

Tugas:
1. Tabel baru print_jobs (id, business_id, photobox_id, session_id, idempotency_key unique,
   printer, copies, slots jsonb, status queued|printing|done|failed, attempts, last_error, created_at).
2. print_limit: pakai print_count package + kebijakan harian per booth; ditegakkan server
   (bukan hanya UI). Sertakan test batas.
3. QR-on-print: render token /r/<token> di area cetak (browser + CUPS); ukuran/margin dari print_settings.
4. auto_print_delay_ms + tombol cetak independen (bisa muncul di galeri/result).
5. Semua jalur cetak (browser, bluetooth, cups) memakai print_jobs yang sama agar tidak drift.

DoD: lint/typecheck/test hijau; cetak ulang idempotent (tidak dobel job untuk sesi+copies sama).
```

### E.5 — Multi-kamera (F5)

```
Baca plan.md §B.2 F5, src/lib/validators.ts (camera_settings), src/lib/camera-provider.ts,
runtime/http.ts, src/components/kiosk/CameraCapture.tsx.

Tugas:
1. Bentuk baru: camera_settings.stills + camera_settings.stream (masing-masing {provider, ...}).
   Muat migrasi data dari bentuk lama (provider tunggal) → stills=stream=provider lama.
2. resolveCameraProvider mengembalikan {stills, stream}; preview memakai stream, capture memakai stills.
3. UI admin: pilih dua sumber + tampilkan status koneksi masing-masing.
4. Test: validator menolak kombinasi tidak valid; migrasi data idempotent.

DoD: lint/typecheck/test hijau; booth lama tetap jalan tanpa perubahan konfigurasi.
```

### E.6 — Collage layout generator (F6)

```
Baca plan.md §B.2 F6, src/components/dashboard/TemplateBuilder.tsx, src/lib/template-layout.ts,
db/schema.sql (templates), contoh keamanan path di src/lib/r2/areas.ts dan PhotoboothProject src/Collage.php.

Tugas:
1. Editor layout slot (grid + ukuran + margin) yang menulis templates.layout (jsonb).
2. Validasi ketat: id layout hanya [a-z0-9_-]; tolak '/', '\\', '\0'; path selalu di bawah
   direktori layout milik business.
3. Preview langsung memakai FramePreviewPanel yang sudah ada.
4. Test: penolakan id berbahaya + round-trip layout.

DoD: lint/typecheck/test hijau; tidak ada akses filesystem di luar direktori business.
```

### E.7 — Hardware input (F7)

```
Baca plan.md §B.2 F7, runtime/main.ts, runtime/http.ts, runtime/settings/*.

Tugas:
1. GPIO button/rotary di runtime: emit event ke kiosk (SSE/poll), BUKAN menjalankan shell.
2. WLED: HTTP JSON API (full_lights/wled) dengan timeout + retry kecil; tanpa command.
3. "commander" versi aman: allowlist aksi tetap (print, lights_on, lights_off, copy_to_usb);
   TIDAK boleh menerima string perintah dari klien.
4. Test: allowlist menolak aksi tak dikenal; tidak ada string shell yang dibentuk dari input.

DoD: lint/typecheck/test hijau; tidak ada pemanggilan shell dengan input pengguna.
```

### E.8 — Realtime (F8)

```
Baca plan.md §B.2 F8, src/app/api/v1/business/**, src/lib/device-token.ts, src/server/audit.ts.

Tugas:
1. SSE /api/v1/business/booths/stream: kirim status sesi, pembayaran, printer per business
   (auth: membership + tenant scoping).
2. Remote action (reset/abort/print) memakai device token + ditulis ke audit_logs.
3. Test: cross-tenant 404; aksi tanpa izin 403.

DoD: lint/typecheck/test hijau.
```

### E.9 — i18n (F10)

```
Baca plan.md §B.2 F10. Ini perubahan besar — kerjakan per area, satu PR per area.

Tugas:
1. Pasang next-intl; locale default id-ID, tambah en.
2. Ekstraksi string per area: marketing → auth → dashboard → staff → POS → kiosk → result.
3. Pertahankan estetika Neo-Brutalism; periksa ulang tipografi (teks EN lebih panjang).
4. Test: tidak ada string UI yang tersisa hardcoded pada area yang diselesaikan.

DoD: lint/typecheck/test/build hijau per area; tidak ada regresi visual di area yang dikerjakan.
```

---

## F. Risiko, rollback, dan Definition of Done

| Risiko | Mitigasi | Rollback |
|---|---|---|
| F1 mengubah hasil foto pelanggan | flag `render_authority` default `client`; parity test wajib | matikan flag per business |
| F2/F3 menambah beban CPU & storage booth | batas ukuran, transcode opsional, retensi lebih pendek untuk video | nonaktifkan per booth |
| F3 video gagal di WebView lama | deteksi `MediaRecorder` + fallback GIF | tetap GIF |
| F4 print job dobel | `idempotency_key` unique + status machine | tandai job `failed` manual |
| F7 command injection | allowlist aksi, tanpa shell string | hapus modul commander |
| F10 diff raksasa | satu PR per area, freeze window | revert per area |

**Definition of Done (semua fase):**

1. `npm run lint` → 0 error.
2. `npm run typecheck` → bersih.
3. `npm test` → semua lulus (baseline sesi ini: 1154 lulus).
4. `npm run verify` (termasuk `next build`) hijau sebelum rilis.
5. Tidak ada `TODO`/placeholder/`// ...` baru.
6. Tidak ada dependency baru tanpa persetujuan eksplisit pemilik.
7. Migrasi DB bernomor baru (`db/00xx_*.sql`), `db/schema.sql` tidak diedit retroaktif.
8. Estetika Neo-Brutalism tidak berubah untuk perubahan UI.

---

## G. Feasibility — bisakah diimplementasikan di SnapyOS?

**Ya**, dengan tiga catatan struktural yang tidak bisa dilewati:

1. **Cloud ≠ booth.** `vercel.json` ada (region `sin1`, `maxDuration` 30–60 s) **dan** `next.config.ts`
   memakai `output: "standalone"` untuk VPS. Artinya: pekerjaan berat dan semua yang butuh
   *system binary* atau perangkat fisik (kamera, printer, GPIO) **tidak boleh** direncanakan di
   fungsi cloud — harus di **booth runtime** (`runtime/`, Node + SQLite + Tauri), yang memang
   sudah ada dan sudah memanggil binary sistem (`runtime/print/index.ts` → `runCommand(cupsBin, …)`).
2. **Pillow / OpenCV / pilgram2 / GD / marvinj tidak bisa dipasang di app Next.js.** Tidak ada
   jalur resmi Python di proses Node. Yang benar: **substitusi ke padanan Node-native**
   (`sharp` + `ffmpeg` + `gifenc` yang sudah jadi dependency) — bukan memaksakan runtime kedua.
3. **Tiga hal ditolak** karena bertentangan dengan prinsip repo (lihat §B.2 F9 dan §G.3).

### G.1 Peta substitusi teknis (mereka → kita)

| Fitur di repo asal | Padanan teknis yang dipakai SnapyOS | Bisa? | Letak |
|---|---|---|---|
| GD server-side (`src/Image.php`, `src/Collage.php`) | **`sharp`** (sudah dipakai di `src/app/api/v1/public/frame/route.ts`) untuk compose/overlay/resize | ✅ | cloud + booth |
| Filter `marvinj` (JS, server) | port rumus preset ke operasi `sharp` (`modulate`/`linear`/`gamma`/`tint`); kanvas klien tetap jadi acuan visual | ✅ | cloud |
| Pillow + pilgram2 (filter) | `sharp` + tabel LUT/curve; **tidak** menjalankan Python | ✅ | cloud |
| OpenCV (`opencv-python-headless`) | hanya dipakai untuk CV lanjutan (matting/face). Bila nanti perlu → **sidecar di booth runtime**, bukan cloud | ⚠️ | booth (opsional) |
| gphoto2 / digiCamControl | **sudah terpasang** (`runtime/camera/gphoto2.ts`, `digicamcontrol.ts`) | ✅ sudah | booth |
| picamera2 / libcamera | `runtime/camera/picamera2.ts` memanggil `libcamera-still` (binary), pola sama seperti `cups` | ✅ (Linux/Pi saja) | booth |
| webcamv4l / webcampyav | `runtime/camera/webcamv4l.ts` memanggil `ffmpeg -f v4l2` satu frame | ✅ | booth |
| wigglecam / camera virtual | `wigglecam.ts` (rangkaian frame → wiggle) + `virtual.ts` (fixture) | ✅ | booth |
| MP4 + GIF from video frames | klien `MediaRecorder` (dengan deteksi dukungan) → transcode **ffmpeg** di booth; GIF via `gifenc` | ✅ **diputuskan** | booth |
| Print shell command + print DB + limit + QR-on-print | tabel `print_jobs` + `qrcode` (sudah ada) + `pdfkit` (sudah ada) + adapter `cups`/`windows`/`mock` yang sudah ada | ✅ | cloud + booth |
| Plugin `commander` (command bebas) | **allowlist aksi** (`print`, `lights_on`, `lights_off`, `copy_to_usb`) — tanpa string shell dari klien | ✅ versi aman | booth |
| Realtime (socket.io / SSE) | **SSE** (`/api/v1/business/booths/stream`) — tanpa dependency baru | ✅ | cloud |
| Plugin framework (`pluggy`) | **ditolak** — cukup extension point sempit | ❌ | — |
| Multi-camera (stills + stream) | `camera_settings.stills` + `.stream` (migrasi bentuk lama) | ✅ | booth + cloud |
| Collage layout generator | editor slot di `TemplateBuilder` + `templates.layout` (jsonb) | ✅ | cloud |
| GPIO / hardware button | booth: binary `gpiod`/sysfs → event kiosk; **bukan** shell dari input pengguna | ✅ (Linux) | booth |
| Pi camera | `libcamera-still` di booth | ✅ (Linux/Pi) | booth |
| i18n 20+ bahasa | `next-intl`, default id-ID | ✅ (diff besar) | cloud |

### G.2 Konsekuensi arsitektur yang harus diterima

- **F1 (compose server-side)** aman di cloud: murni `sharp`, tidak ada binary.
- **F2/F3/F4/F7** punya bagian yang **wajib** jalan di booth karena butuh kamera/printer/GPIO/ffmpeg.
  Cloud tetap jadi sumber kebenaran (harga, sesi, pembayaran, retensi) — booth hanya eksekutor media.
- **F3 (video)** — **KEPUTUSAN: opsi (a) transcode `ffmpeg` di booth** (MP4 penuh + GIF/boomerang
  dari frame). Konsekuensi yang diterima:
  - `ffmpeg` menjadi **prasyarat installer booth** (Linux + Windows) → `scripts/install-photobooth-bridge.sh`
    dan `scripts/build-booth.ps1` harus memeriksa & memasang; gagal-ffmpeg harus *degradasi bersih*
    ke GIF (`gifenc`), bukan menjatuhkan sesi.
  - Transcode **tidak** boleh di cloud: `vercel.json` (serverless) tidak punya binary, dan
    `maxDuration` 30 s tidak cukup untuk video.
  - Bitrate/resolusi maksimum + durasi maksimum wajib dibatasi (batas keras), lalu dihitung
    ke `storage_usage` dan `retention_days`.
  - Butuh uji di perangkat nyata (Windows + Pi) sebelum diaktifkan per booth.
- **Storage**: video/GIF menambah byte → `storage_usage` + `retention_days` wajib ikut dihitung
  (cron `retention` sudah ada).
- **DDL**: F3/F4/F5 butuh kolom/tabel baru → migrasi bernomor baru (`db/00xx_*.sql`),
  `db/schema.sql` yang sudah dirilis **tidak** diedit retroaktif (§F.7).

### G.3 Yang ditolak (jangan diimplementasikan)

| Ditolak | Alasan |
|---|---|
| Plugin framework `pluggy` | menambah permukaan serangan + abstraksi tanpa pembeli; extension point sempit cukup |
| Plugin `commander` yang menerima perintah bebas | command injection; diganti allowlist aksi |
| Menjalankan Pillow/OpenCV/pilgram2 sebagai runtime kedua di cloud | packaging & biaya; padanan `sharp`+`ffmpeg` sudah menutupi kebutuhan |

### G.4 Jawaban ringkas

| Pertanyaan | Jawaban |
|---|---|
| Bisakah semua fitur itu masuk SnapyOS? | **Ya, ~90%** — 6 dari 7 kelompok fitur bisa penuh |
| Yang tidak bisa apa? | plugin framework penuh; Python runtime di cloud; command bebas — semua **ditolak by design** |
| Yang butuh keputusan dulu? | **F3 video**: ffmpeg di booth (MP4) vs GIF-only |
| Yang butuh persetujuan DDL? | F3 (`media_type`, `result_video_key`), F4 (`print_jobs`), F5 (bentuk `camera_settings`) |
| Berapa fase aman untuk mulai sekarang? | Phase 0 (selesai) → **Phase 1 (F1, `sharp`, nol dependency baru)** → Phase 4 (F4, print DB) |

---

## H. Status implementasi (sesi ini)

Verifikasi: `npm run verify` hijau — lint **0 error**, typecheck bersih, **1184/1184** tes lulus, `next build` sukses.

### H.1 Sudah LIVE (dipakai kode berjalan)

| Bagian | Berkas | Dipakai oleh |
|---|---|---|
| Adapter kamera Raspberry Pi (`libcamera-still` / `rpicam-still`) | `runtime/camera/libcamera.ts` | `runtime/camera/index.ts` → `runtime/main.ts` |
| Adapter webcam USB V4L2 (`ffmpeg`) | `runtime/camera/v4l2.ts` | idem |
| Adapter PyAV (`python3` + `av` + Pillow) | `runtime/camera/pyav.ts` | idem |
| Peran ganda stills + stream | `runtime/camera/index.ts` (`createCameraRoles`) | `runtime/main.ts` (`/camera/capture` = stills, `/camera/preview` = stream) |
| Pemilihan adapter dari setelan booth | `runtime/settings/index.ts` (`effectiveConfig`) | `runtime/main.ts` saat start |
| Kontrak "browser vs bridge" untuk 6 adapter | `src/lib/camera-provider.ts`, `src/lib/validators.ts`, `src/lib/kiosk-types.ts` | kiosk + Panel Setelan Booth |
| Nama fungsi bridge yang tidak lagi bohong | `captureFromBridge`, `fetchBridgePreview` | `CameraCapture.tsx`, `SetupWizard.tsx` |

Perilaku booth lama **tidak berubah**: tanpa `SNAPYOS_CAMERA_STREAM`, stills dan preview memakai instance
adapter yang sama (`tests/runtime-camera-roles.test.ts`).

Konfigurasi baru (semua opsional):

```bash
SNAPYOS_CAMERA=gphoto2|digicamcontrol|libcamera|v4l2|pyav|mock
SNAPYOS_CAMERA_STREAM=                # kosong = satu kamera (perilaku lama)
LIBCAMERA_BIN=libcamera-still
RPICAM_BIN=rpicam-still
LIBCAMERA_SIZE=3280x2464
LIBCAMERA_SIZE_STREAM=1280x720
FFMPEG_BIN=ffmpeg
V4L2_DEVICE=/dev/video0
V4L2_DEVICE_STREAM=/dev/video0
V4L2_SIZE=1280x720
V4L2_SIZE_STREAM=640x480
PYAV_PYTHON=python3
```

### H.2 Sudah ADA + teruji, tetapi BELUM disambungkan ke alur finalize

| Bagian | Berkas | Status |
|---|---|---|
| Katalog filter server (padanan marvinj/pilgram2) | `src/server/media/filters.ts` | live di level library + 8 tes |
| Compose server (slot, clip, cover-fit, frame, overlay, chroma) | `src/server/media/compose.ts` | live di level library + 11 tes |

**Kenapa belum disambungkan (jujur, bukan lupa):** komposisi server butuh **metadata edit per foto**
(zoom/pan, filter, overlay) yang sekarang hanya hidup di state `Editor` klien dan tidak ikut terkirim ke
`finalize`. Memaksa compose tanpa metadata itu akan **membuang hasil edit pelanggan** — lebih buruk
daripada tidak sama sekali. Jadi penyambungannya = Phase 1.4, dan butuh keputusan kontrak payload
(lihat §E.1 langkah 4).

### H.3 Keputusan teknis yang diambil (dan alasannya)

| Keputusan | Alasan |
|---|---|
| `fswebcam` **tidak** dipakai | cara menulis ke stdout beda antar versi; `ffmpeg` sudah prasyarat F3 di booth |
| PyAV **tidak** fallback ke ffmpeg | biar operator tahu paketnya kurang; fallback diam-diam = preview dari jalur lain |
| `digicamcontrol` ditambahkan ke daftar provider | sebelumnya provider tak dikenal jatuh ke `browser` → kamera yang salah dipakai tanpa pesan |
| Satu tes parity untuk 3 daftar adapter | mencegah drift klien/validators/runtime (`tests/camera-provider-parity.test.ts`) |
| Satu tes parity ID filter klien↔server | mencegah filter baru lolos di klien lalu diabaikan server |

### H.4 Temuan baru yang dicatat, belum diperbaiki

- `SetupWizard` mengirim `camera.provider/status/capture_test/bridge_url` ke laporan device, tetapi
  `deviceReportSchema` (`src/lib/validators.ts:1116`) tidak memuat field itu → **dibuang diam-diam**.
  Perlu keputusan kontrak (docs/05 §5.0.1) sebelum ditambahkan; sengaja tidak diubah di sesi ini agar
  docs dan kode tidak drift.
- Runtime belum menyimpan `SNAPYOS_CAMERA_STREAM` di store setelan (masih env-only). Bila nanti perlu
  diubah dari Panel Setelan, tambahkan field di `camera_settings` + schema runtime sekaligus.
