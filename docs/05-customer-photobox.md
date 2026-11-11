# 5. Customer Photobox Application

## Status Implementasi (audit 2026-08-30)

SESUAI (inti): alur pay-first (package → pilih metode pembayaran → paid → template → capture → review/retake → edit → finalize → auto-print → QR result `/r/[token]` + GIF), device pairing/activation, exit PIN, kiosk fullscreen lock, offline sync (IndexedDB), retention cron.

BELUM / TIDAK SESUAI:

- Filter `?event=` pada pilih package — event mode belum ada.
- ZIP download hasil — belum (hanya GIF + foto berframe per file).
- Background kustom halaman result — belum.
- Sticker per-business (§ terkait) — diganti **emoji API global** `GET /api/v1/emoji` (sticker table tidak dipakai di jalur ini).
- Konflik retensi: PRD menulis 7 hari default; UI owner membatasi 1–3 hari (`RetentionSettingsEditor`).
- Exit PIN: diimplementasikan **lebih kuat** dari spec (server-side verify hash `photoboxes.exit_pin_hash` + `POST /api/v1/public/devices/exit`) — tidak terdokumentasi di dokumen ini.
- Checkout resume yang claimable saat reload — ada (recover via `payments/[ref]/status`) tapi tidak terdokumentasi.

> **REVISI v2 — PAY-FIRST (acuan urutan resmi).** Alur customer: pilih package → pilih metode pembayaran → paid → pilih frame/template → sesi foto → edit → finalize → auto-print → QR result online (unduh GIF + foto berframe). Metode online adalah gateway merchant owner (Pakasir/Midtrans/Tripay) bila credential direct aktif; tanpa credential aktif kiosk hanya menawarkan voucher + tunai (fallback aggregator platform dihapus 2026-09-18); voucher 100% menghasilkan paid sintetik; tunai selalu menunggu konfirmasi operator terautentikasi. Pembayaran terjadi **sebelum** sesi foto. Setup permission kamera/printer dilakukan **sekali** saat device pairing, tersembunyi dari customer.

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

**Data:** dari `business_settings.branding` (global) + `photoboxes.branding` (override per-booth, 0045). Booth mewarisi branding global; override per-booth di-merge di atas global (field override menang, `kiosk.pages` di-merge per-layar).

**Components:** `Card`, `Button` besar, `Image` logo.

**State:** loading brand config → skeleton; error → fallback generic.

### Kontrak branding kompatibilitas

Konfigurasi kiosk (`branding.kiosk`) tetap dibaca runtime, tetapi tidak lagi menjadi write surface dashboard. Import/migrasi WPF belum selesai, jadi field lama tidak dihapus.

Konfigurasi kiosk (`branding.kiosk`) mencakup:

- **Override per-layar** (`pages.welcome/guide/package/payment/template/capture/edit/result`): warna bg/teks, skala font, radius tombol, padding, perataan konten — menimpa nilai global.
- **Tutorial custom** (`guide_steps`): langkah ditampilkan sebelum pemilihan paket, dapat ditambah/dihapus/diurutkan (max 8). Kosong = dilewati.
- **Video promo** (`video_key` global + `pages.*.video_key` per-layar): looping muted; layar kamera awal bisa menampilkan video attract di latar panel preview.
- **Kontrol interaksi**: `show_mirror_toggle` (tampilkan tombol mirror di layar kamera) dan `allow_zoom_pan` (izinkan customer zoom/pan foto di editor).
- **Override per-booth**: dua lapis, dan urutannya menentukan pemenang.
  1. **Data cloud lama** (`photoboxes.branding`) tetap dibaca sebagai fallback saat booth belum dikustomisasi di mesin. Dashboard baru tidak menulis snapshot ini.
  2. **Aplikasi booth** (panel **Setelan booth** → grup `appearance_settings`) menyimpan kustomisasi di store lokal mesin. Nilai ini menang atas branding cloud, dan **tidak** dikirim ke cloud supaya tidak menimpa booth lain.

  Kiosk me-merge keduanya lewat `src/lib/appearance-merge.ts`: identitas brand (logo, `primary_color`, `secondary_color`, `video_url`) selalu dari cloud; warna/teks/tata letak boleh ditimpa booth. Runtime mati → branding cloud dipakai apa adanya.

---

## 5.3 Choose Package

**Purpose:** Customer memilih layanan — package menentukan **harga**, kuota foto legacy (`photo_count`), dan jumlah cetak (`print_count`). Jika customer memilih frame ber-slot, jumlah capture mengikuti jumlah slot frame.

**UI:** daftar `Card` package (nama, harga, detail foto/print/digital). Package yang `active` dan berlaku untuk photobox/outlet yang sedang dipakai saja yang tampil.

**Data:** `packages` + eligibility outlet/photobox.

**API:** `GET /api/v1/public/:businessSlug/packages?photobox=&event=`

> v2: setelah package dipilih, customer langsung ke **Checkout** (bayar dulu — §5.12), bukan ke template.

---

## 5.4 Choose Template

**Purpose:** Customer memilih frame/template. Semua template aktif berlaku untuk semua paket.

> v2: tahap ini terjadi **setelah pembayaran sukses (paid)** — bagian dari sesi foto yang sudah dibayar.

**UI:** grid preview template — thumbnail = **preview frame dengan slot terisi foto sample** (render engine composite, `15-template-builder.md`). Semua template aktif tampil untuk paket mana pun. Bila template memiliki slot, jumlah capture mengikuti `template.slot_count`; template legacy tanpa slot memakai `package.photo_count`. Slot yang perlu mengulang foto diisi bergiliran (`src/lib/template-fit.ts`).

**Data:** `templates` (+ `layout` slot). Tidak ada lagi join `package_templates` — tabel dorman sejak 2026-11-11.

**API:** `GET /api/v1/public/:businessSlug/templates` (kiosk memanggil tanpa `?package`; `?package` tetap diterima tetapi diabaikan, tidak memfilter).

**Cache & offline (2026-11-08, PWA Android/web):**

- Boot booth (idle + online) mengunduh **semua thumbnail** + **frame penuh** ke Cache Storage (`snapyos-template-assets-v1`), budget 250 MB atau 25% kuota; `saveData` → thumbnail saja.
- Daftar template disimpan sebagai snapshot `localStorage` (`snapyos.templates.<businessSlug>`); layar ini **render dari snapshot** — tanpa skeleton saat cache sudah terisi.
- Revalidasi daftar di-throttle 5 menit (bukan per request); fetch gagal + snapshot ada → grid tetap tampil dengan chip **"Dari cache"**, bukan kartu error.
- Key aset stabil `templateId:version` (`version` = `templates.updated_at`), bukan signed URL; ganti frame di dashboard → key baru, key lama dipangkas.
- Offline setelah satu kunjungan online sukses: HTML dari service worker, daftar dari snapshot, gambar dari Cache Storage.
- Batas: install baru yang belum pernah online tetap tidak bisa boot (bukan regresi).

---

## 5.5 Camera System

**Purpose:** Capture foto via kamera browser atau DSLR GPhoto2. Target: **Chrome kiosk** (mini PC + USB webcam/DSLR).

**Target platform:** Chrome/Chromium browser (versi 80+) di kiosk mode (`--kiosk --kiosk-printing`). Semua API MediaDevices & Canvas tersedia penuh.

**Kamera yang didukung:** semua USB webcam standar yang terdeteksi OS kiosk (Logitech C920/C270/C922, Razer Kiyo, ELGATO Facecam, kamera laptop/tablet), atau DSLR yang didukung `gphoto2`. Rekomendasi webcam minimum **720p**, ideal **1080p**.

> v2: **deteksi kamera, grant permission, dan pemilihan device terjadi di Setup Wizard (§5.0.1), sekali**, bukan di flow customer. Saat sesi berjalan, app langsung membuka stream memakai `preferred_device_id` tersimpan. Error runtime (kamera dicabut/dipakai app lain) tetap ditangani dengan pesan retry (tabel §5.5.3) dan dilaporkan ke `device_status`.

### 5.5.1 Camera Detection Flow (berjalan saat Setup Wizard)

Jika `camera_settings.provider = "gphoto2"`, Setup Wizard memeriksa bridge lokal (`GET /health`) dan `gphoto2 --auto-detect`. Runtime memakai `POST /camera/capture`; preview DSLR memakai `--capture-preview --stdout` bila kamera mendukungnya. Bridge mengunci request kamera agar preview dan capture tidak berjalan bersamaan. Bila kamera tidak mendukung live preview, capture tetap dapat dipakai dan UI menampilkan status siap tanpa memblokir tombol foto.

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
3. Browser: getUserMedia({ video: { width: { ideal: 1920 }, height: { ideal: 1080 } } })
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

Untuk DSLR GPhoto2, pastikan JPG/JPEG aktif, kamera tidak sedang dipakai proses lain, baterai/USB stabil, dan SD card serta capture target siap bila model kamera membutuhkannya. Bila `--capture-image-and-download` gagal, bridge mencoba urutan kompatibel `--capture-image-and-download` lalu `--trigger-capture --wait-event-and-download=FILEADDED`. Set `GPHOTO2_CAPTURE_TARGET` hanya jika kamera memerlukan `capturetarget` tertentu.
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

| Error                       | Pesan                                                                       | Aksi                        |
| --------------------------- | --------------------------------------------------------------------------- | --------------------------- |
| `NotAllowedError`           | "Izinkan akses kamera untuk mulai berfoto."                                 | [ AKTIFKAN KAMERA ]         |
| `NotFoundError`             | "Tidak ada kamera terdeteksi. Hubungkan webcam USB ke perangkat ini."       | [ COBA LAGI ]               |
| `NotReadableError`          | "Kamera sedang dipakai aplikasi lain. Tutup aplikasi lain, lalu coba lagi." | [ COBA LAGI ]               |
| `OverconstrainedError`      | "Resolusi kamera tidak didukung. Mencoba resolusi standar..."               | otomatis fallback           |
| `AbortError`                | "Permintaan kamera dibatalkan."                                             | [ COBA LAGI ]               |
| `isSecureContext === false` | "Harus diakses via HTTPS agar kamera berfungsi."                            | info teknis                 |
| 0 device terdeteksi         | "Tidak ada kamera terdeteksi. Periksa koneksi USB webcam."                  | [ PERIKSA KAMERA ]          |
| Resolusi < 480p             | "Kualitas kamera rendah. Disarankan webcam HD (720p+)."                     | warning (tetap bisa lanjut) |

### 5.5.4 Components

`CameraView` (video + canvas hidden), `CameraControls`, `CameraSelector` (setup wizard), `MirrorToggle`, `FullscreenToggle`, `CameraStatusBar` (resolusi, FPS opsional), `SetupWizard` (§5.0.1).

**Acceptance:** (AC 13, 56, 62) customer pakai kamera tanpa pernah melihat setup; ada fallback saat gagal; resolusi terdeteksi & dilaporkan.

---

## 5.6 Capture Mode

**Minimal modes:** Single Photo, Multiple Photo / Burst, Photostrip (3/4/5 foto).

Jumlah foto mengikuti **template terpilih** — jumlah slot pada `templates.layout`; template legacy tanpa slot memakai `package.photo_count`. `photos.order_index` → slot sesuai urutan `z` (lihat `15-template-builder.md`).

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

- Transform: crop, rotate, **zoom & pan/posisi** — menyesuaikan foto **di dalam slot** template terpilih (bukan full canvas); zoom minimal = cover-fit, clamp per slot (`15-template-builder.md` §15.4). Template legacy (tanpa slot) = perilaku lama full-canvas.
- Adjust: brightness, contrast, saturation, blur, grain, vignette
- **Filters:** Original, Film, Warm, Cool, Black & White, Retro, Vintage, Y2K
- **Area hijau frame = slot foto.** Tidak ada kontrol chroma di editor kiosk. Owner mengubah area hijau pada frame menjadi slot lewat tombol deteksi di builder (`docs/15-template-builder.md` §15.3); slot itu terisi foto otomatis seperti slot lain, dan piksel transparan menampilkan `templates.layout.canvas.background` (JPEG final, bukan transparan).
- **Layer teks/stiker:** digambar di atas frame, bukan di dalam foto, agar tidak terpotong clip slot.

**Components:** `EditorCanvas` (canvas-based, memakai `composeFrame`), `FilterRow`, `AdjustSlider`, `CropTool`, `RotateButton`, `ZoomSlider`, `PanTool`.

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
[ GRID semua foto hasil (bukan hanya foto pertama) + GIF jika ada ]
[ PRINTING... / PRINT DONE ✓ ]     (auto-print ter-trigger, lihat §5.15)
SCAN TO GET YOUR PHOTOS:
[ QR CODE → halaman result online ]
[ CETAK / CETAK ULANG ] [ UNDUH ZIP ] [ SALIN LINK ] [ WHATSAPP ] [ SELESAI ]
[ Berlaku sampai <tanggal> ]
( CREATE ANOTHER = tombol SELESAI → reset ke Welcome; sesi one-shot )
```

### Online Result Page (`result_token`)

**URL (route customer-facing):** `GET /r/[token]` — halaman Next.js publik pendek (tanpa login). Halaman ini me-fetch data via endpoint `GET /api/v1/public/results/:resultToken` dan merender konten. QR di kiosk mengarah ke `/r/[token]`.

**UI (layout):**

```
[ Header sticky: logo bisnis (signed URL) + nama business ]
YOUR PHOTOS ARE READY!
[ PREVIEW GIF animasi slideshow — autoplay loop ]
[ GRID thumbnail foto berframe (1..N) ]
[ UNDUH GIF ]  [ unduh per foto ]  [ UNDUH SEMUA (ZIP) ]
[ SALIN LINK ]  [ KIRIM VIA WHATSAPP ]  [ Berlaku sampai <tanggal> ]
( Slot future: [ KIRIM KE EMAIL ] — OUT OF SCOPE sekarang )
```

Menyediakan:

- **Unduh GIF animasi slideshow** — foto bergantian otomatis; digenerate **server-side saat finalize**; storage key di `sessions.result_gif_key`. Template ber-slot: klien merender **satu JPEG berframe per foto capture** lewat `composeFrame` (slot milik foto itu terisi, slot lain kosong, kanvas + frame = template) — `renderFramePerPhotoBlobs` → `gif_photos`; GIF lalu memperlihatkan template ber-slot bergantian. Template legacy memakai foto final apa adanya. Klien yang gagal memuat frame jatuh ke foto mentah (GIF tetap ada). Delay & lebar GIF dari `business_settings.output.gif` (`frame_delay_ms` 100–3000, `max_width` 240–1080, default 800/480; `enabled: false` = tanpa GIF). Preview GIF autoplay loop di atas halaman.
- **Unduh foto berframe** (statis, per foto — hasil edit + frame pilihan customer), tampil sebagai grid thumbnail, bisa diunduh per foto.
- **Unduh semua (ZIP)** — `GET /api/v1/public/results/:resultToken/zip`: ZIP store-only tanpa dependensi baru, batas 50 berkas / 100 MB, rate limit 10/menit/IP, validasi retention + tenant lewat `getResult`. Isi: GIF slideshow + semua foto berframe.
- **Salin link & kirim via WhatsApp** — tombol di kiosk `/r` dan `ResultScreen`; teks menyebut tanggal berlaku (`finalized_at + retention_days`, dikirim sebagai `expires_at` dari `getResult`/finalize).
- **Link kedaluwarsa** — `/r/[token]/not-found.tsx` menampilkan "Link kedaluwarsa / tidak ditemukan. Hubungi petugas booth." tanpa membocorkan token.
- Tombol unduh bekerja lintas origin: URL unduh membawa `Content-Disposition: attachment` (`gif_download_url`, `photos[].download_url` dari `getResult`) — atribut `download` pada `<a>` cross-origin diabaikan browser.
- (Slot future: kirim ke email — **OUT OF SCOPE sekarang, jangan diproses**.)

**Design system & konsistensi:** Halaman result memakai **design system yang sama** dengan halaman lain (landing, dashboard, checkout) — Full Neo-Brutalism, komponen & token dari `11-design-system.md`, **konsisten** di seluruh aplikasi. Layout **tetap/standar, tidak bisa diubah**.

**Kustomisasi owner (terbatas):** Owner **hanya** bisa mengubah **background** halaman result (via `business_settings.branding` — mis. warna latar / pola / gambar). **Posisi, tata letak, dan komponen tidak bisa diubah** — struktur halaman tetap sama untuk semua business, demi konsistensi brand & pengalaman. **BACKLOG: background kustom belum diimplementasi** (lihat blok Status Implementasi) — halaman saat ini memakai background standar design system.

**Rule:** `result_token` di-issue saat payment `paid`; akses divalidasi server-side; expiration mengikuti retention policy (default **3 hari**, rentang 1–3 hari; lihat catatan konflik retensi di §Ringkasan atas). Halaman wajib Neo-Brutalism (lihat `11-design-system.md`).

**Format token:** 12 karakter base36 lowercase (`src/lib/device-token.ts`) — tanpa huruf besar karena URL ini juga diketik manual dari layar kiosk saat QR gagal dipindai. Token lama 32 hex tetap valid; kolom `checkout_sessions.result_token` bertipe `text` tanpa constraint panjang.

**Acceptance:** (AC 31–33, 61) setelah payment sukses & finalize, customer mendapat print otomatis + QR ke halaman online dengan GIF & foto berframe.

---

## 5.14 QR Photo Delivery

**Purpose:** Membagikan hasil via QR/tautan.

**UI:**

```
SCAN TO GET YOUR PHOTO
[ QR CODE ]
```

QR mengarah ke secure online result page (GIF + foto berframe, §5.13). Result memiliki **expiration policy configurable** (per business/subscription, default 3 hari, rentang 1–3 hari).

**Technical:** QR mengarah ke route `/r/[token]` (halaman publik, §5.13). Akses divalidasi server-side via `result_token`; expired mengikuti retention policy (default 3 hari, rentang 1–3 hari) → halaman menampilkan pesan "link kedaluwarsa".

**Acceptance:** (AC 33) customer mendapat QR photo; link expire sesuai kebijakan.

---

## 5.15 Printing System

**Purpose:** Mencetak hasil foto (bila package include print) via printer OS kiosk.

**Pendekatan:** **dua jalur cetak hasil foto**, keduanya lewat perangkat kiosk sendiri:

1. **`photo` — printer foto** (DNP/Citizen/Selphy/inkjet). Transport: dialog OS `window.print()` (+ `--kiosk-printing` untuk silent-print desktop) atau **CUPS via bridge lokal** (`POST /print` ke `http://127.0.0.1:17777`). Di tablet Android/iPad dialog print sistem selalu muncul (browser tidak bisa silent-print).
2. **`thermal` — printer thermal 1-bit ESC/POS** (kertas 58/80 mm), lewat Web Bluetooth atau Web Serial. Jalur ini **selalu** `mode = bluetooth` (`resolvePrintMode` memaksa), dan struk POS punya jalur ketiga `receipt` (§5.15.2) — bukan bagian cetak hasil foto.

Jalur aktif dihitung `availablePrintPaths(print_settings)` dari grup `photo`/`thermal` (fallback field datar untuk baris lama). Satu jalur aktif → langsung dipakai; dua jalur aktif → `PrintChoice` meminta customer memilih; nol jalur aktif → layar "printer tidak tersedia" (bukan diam-diam membuka dialog OS).

### 5.15.1 Print Flow (v2: auto-trigger saat finalize)

```
Customer tekan [ SELESAI ] di editor  ATAU  auto-finalize (timeout post-paid)
   ↓
Finalize → upload foto final → generate result + GIF
   ↓
App render print layout (canvas), sesuai jalur aktif:
   - photo  : 1 foto 4x6" ATAU 2 strip 2x6" (photostrip dari satu kertas 4x6")
   - thermal: raster 1-bit per foto, lebar 384 dot (58 mm) / 576 dot (80 mm)
   - Gambar + template frame + branding owner
   ↓
print_count menentukan jumlah lembar cetak. `copies` pada konfigurasi booth
menggandakan set lembar bila diperlukan (`printSheets`, batas 20).
   ↓
photo→CUPS: bridge lokal mencetak PDF tanpa dialog. photo→browser: `window.print()`
(Chrome kiosk `--kiosk-printing` silent-print). thermal: job ESC/POS ke Web
Bluetooth / Web Serial; tanpa Web Bluetooth layar Bluetooth menawarkan tombol
eksplisit "Cetak lewat dialog" — tidak pernah pindah jalur diam-diam.
   ↓
[ PRINT TEST ] tersedia di Setup Wizard (§5.0.1) & dashboard owner
   ↓
Status printer: tercatat di photoboxes.device_status (owner lihat di dashboard)
```

### 5.15.2 Print Settings (owner-configurable, per photobox)

`photoboxes.print_settings` jsonb. Bentuk lama (datar) tetap dibaca; bentuk baru memakai **grup per jalur** `photo` / `thermal` / `receipt`, dan `resolvePurposeSettings` menjatuhkan grup ke field datar sehingga renderer tidak perlu tahu bentuk mana yang dipakai.

```json
{
  "enabled": true,
  "mode": "cups",
  "printer_name": "",
  "paper_size": "4x6",
  "layout": "single",
  "orientation": "auto",
  "fit": "auto",
  "strip_2up": false,
  "media_name": "",
  "auto_print": true,
  "copies": 1,
  "margins_mm": 0,
  "bridge_url": "http://127.0.0.1:17777",
  "bluetooth_paper_width_mm": 80,
  "bluetooth_device_name": "",
  "photo": { "enabled": true, "mode": "cups" },
  "thermal": { "enabled": true, "paper_width_mm": 80, "printer_name": "" },
  "receipt": { "enabled": true, "mode": "browser", "paper_width_mm": 58 }
}
```

**Field baru (grup `photo`)** — `src/lib/validators.ts` `printPhotoSettingsSchema`:

| Field          | Nilai                                    | Arti                                                                               |
| -------------- | ---------------------------------------- | ---------------------------------------------------------------------------------- |
| `enabled`      | boolean                                  | Jalur printer foto ditawarkan ke customer                                          |
| `mode`         | `browser` \| `bluetooth` \| `cups`       | Transport: dialog OS, ESC/POS thermal, atau bridge CUPS                            |
| `printer_name` | string ≤128                              | Nama printer CUPS; kosong = default OS                                             |
| `paper_size`   | `4x6` \| `2x6` \| `5x7` \| `6x8` \| `A6` | Preset kertas fisik (mm: 101.6×152.4, 50.8×152.4, 127×177.8, 152.4×203.2, 105×148) |
| `orientation`  | `portrait` \| `landscape` \| `auto`      | `auto` = landscape bila rasio kanvas > 1, selain itu portrait                      |
| `fit`          | `auto` \| `contain` \| `cover`           | `auto`: frame/strip → `contain` (bingkai tak terpotong), foto tunggal → `cover`    |
| `margins_mm`   | integer 0–20                             | Margin cetak                                                                       |
| `media_name`   | string ≤120                              | Override nama media CUPS; kosong = `Custom.WxHmm`                                  |
| `strip_2up`    | boolean                                  | Dua salinan strip pada satu kertas 4x6 landscape (hanya layout strip, kanvas ±1:3) |
| `auto_print`   | boolean                                  | Cetak langsung setelah finalize                                                    |
| `bridge_url`   | URL ≤300                                 | URL bridge lokal; kosong = `http://127.0.0.1:17777`                                |

**Grup `thermal`** (`printThermalSettingsSchema`): `enabled`, `paper_width_mm` (`58`|`80`), `printer_name`, `bluetooth_device_name` (≤60, informasi petugas bukan kredensial), `auto_print`. Grup ini **tidak** menyimpan `mode` — `resolvePrintMode` memaksa `bluetooth` untuk semua cetak thermal.

**Grup `receipt`** (`printReceiptSettingsSchema`, struk POS): `enabled`, `mode` (`browser`|`bluetooth`|`cups`), `paper_width_mm` (`58`|`80`), `printer_name`, `auto_print`. Snapshot-nya ikut tersimpan di `pos_orders` (`paper_width_mm`, `print_mode`, `auto_print`) saat order dibuat.

### 5.15.2a Kepemilikan Setelan: owner menulis, booth menimpa

Dua penulis menyentuh jsonb yang sama, jadi kepemilikan field eksplisit di `src/lib/device-settings-contract.ts` (`CLOUD_OWNED_SETTING_FIELDS`) dan ditegakkan server, bukan hanya UI:

| Pemilik                     | Field                                                                                                                                                                                                                 | Kenapa                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Cloud (owner/dashboard)** | `print_settings.copies`, `print_settings.layout`                                                                                                                                                                      | Keduanya mengubah **biaya & produk** yang dijual (jumlah lembar, strip vs single) — tidak boleh diubah dari mesin booth |
| **Device (aplikasi booth)** | sisanya: `mode`, `printer_name`, `paper_size`, `orientation`, `fit`, `margins_mm`, `media_name`, `strip_2up`, `auto_print`, `bridge_url`, `paper_width_mm`, `bluetooth_device_name`, grup `photo`/`thermal`/`receipt` | Hanya mesin di lokasi yang tahu printer apa yang terpasang                                                              |

Aturan penegakan:

- `PATCH /api/v1/public/devices/settings` menolak field cloud dengan **`403 FIELD_NOT_DEVICE_OWNED`** (bukan membuang diam-diam), dan menolak `appearance_settings` dengan `403 LOCAL_ONLY_SETTING` — grup tampilan tidak pernah naik ke `photoboxes`.
- Merge **per-key**, bukan replace (`mergeDeviceSettings`): laporan booth yang hanya tahu `paper_size` tidak boleh menghapus `copies` milik cloud. Grup bersarang (`photo`/`thermal`/`receipt`) digabung satu level lagi.
- Dashboard owner menyimpan grup lewat `savePhotoboxHardwareAction`; action itu mem-_mirror_ nilai grup ke field datar (`mode`, `printer_name`, `paper_size`, …) karena kiosk, `PrintTestPanel`, dan `print-layout` membaca bentuk datar.
- `appearance_settings` (tampilan booth) menang atas branding cloud tapi tidak pernah disinkronkan ke cloud (`LOCAL_ONLY_DEVICE_GROUPS`).

### 5.15.3 Print Layout Mapping

| package.print_count | Hasil                                                  |
| ------------------- | ------------------------------------------------------ |
| 0                   | digital only (download/QR)                             |
| 1                   | 1 lembar 4x6" single (atau 1 strip)                    |
| 2                   | 2 lembar (single atau photostrip, sesuai layout booth) |
| 3                   | 3 lembar (single atau photostrip, sesuai layout booth) |

Layout ditentukan `print_settings.layout` + `package.print_count`.

### 5.15.4 Printer Detection (keterbatasan & solusi)

Browser **tidak bisa** enumerate printer (standar web). Jadi "deteksi" dilakukan:

1. **Print Test di Setup Wizard (§5.0.1)** & dashboard owner → mode CUPS mengirim PDF langsung ke bridge lokal, mode browser membuka `window.print()`, mode thermal mengirim ESC/POS → owner konfirmasi fisik ("Test print berhasil?" Ya/Tidak). Hasil dikirim `reportPrintTestAction` dan tersimpan sebagai `device_status.printer.confirmed`.
   1b. **Deteksi lewat bridge** (`HardwareDetectButton`, dashboard `/dashboard/photoboxes/[id]/hardware`): `GET /health` (kamera + model), `GET /printer/health` dengan header `X-Bridge-Token` (nama printer aktif / `ok` untuk printer default OS), `GET /v1/camera/status`. Bridge mati adalah keadaan normal di komputer owner — hasil kosong berarti isi nama manual, bukan error. `GET /printer/list` (fitur `listCupsPrinters`) mengembalikan daftar printer CUPS + penanda default.
2. **Printer default OS** harus di-set di kiosk, atau isi `printer_name` CUPS. Bridge CUPS memakai `lp`/`lpstat` dan opsi media sesuai `media_name` (fallback `Custom.WxHmm`), plus `fit-to-page`.
   Ukuran preset: `4x6` = `101.6 × 152.4 mm`, `2x6` = `50.8 × 152.4 mm`, `5x7` = `127 × 177.8 mm`, `6x8` = `152.4 × 203.2 mm`, `A6` = `105 × 148 mm`; driver harus menerima media custom atau profile kertas yang ekuivalen. Print Test menggambar kotak batas pada margin aktif, sehingga ukuran, orientasi, dan area aman bisa diverifikasi secara fisik.
3. Status disimpan ke `photoboxes.device_status.printer = { status, last_test_at, confirmed, mode, job }`. `job` = `{ status, last_error, queue_pending, queue_retrying, last_job_at }` dari heartbeat runtime; semua field opsional agar runtime lama tetap lolos validasi.
4. **Antrean cetak runtime lokal**: SQLite `print_jobs` adalah sumber kebenaran (offline-first). Status `queued → printing → submitted → done|failed`; `submitted` berarti spooler menerima, **bukan** kertas keluar. `done` hanya dari konfirmasi operator (`POST /print/jobs/:id/confirm`). Dedupe `session_id + sheet_hash` mencegah auto-print ganda; retry memakai `POST /print/jobs/:id/retry`.
5. **Health check sebelum submit** (`lpstat -p`, default destination) dan error `lp` menyertakan stderr + saran `lpstat -p` / `lpoptions -d`.

### 5.15.5 Error Handling (print)

| Kondisi                             | Pesan / Aksi                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------- |
| Printer tidak tersedia              | "Printer tidak terdeteksi. Jalankan [ PRINT TEST ]."                                         |
| Tidak ada jalur cetak aktif         | `PrintUnavailable` — berhenti dengan pesan, bukan membuka dialog OS yang tidak dikonfigurasi |
| Kertas habis                        | deteksi tidak memungkinkan via web → panduan di Bantuan                                      |
| print gagal (onbeforeprint/onerror) | "Gagal mencetak." + [ CETAK ULANG ]                                                          |
| Web Bluetooth/Serial tidak tersedia | layar Bluetooth menampilkan tombol eksplisit "Cetak lewat dialog"                            |
| package tanpa print                 | langsung ke result (download/QR)                                                             |

### 5.15.6 Components

`src/components/kiosk/PrintFlow.tsx` memilih renderer dari `availablePrintPaths` + `resolvePrintMode`:

| Komponen               | Jalur                                                                 |
| ---------------------- | --------------------------------------------------------------------- |
| `PrintLayoutRenderer`  | `photo` + `mode = browser` (canvas → DOM printable, `window.print()`) |
| `CupsPrintScreen`      | `photo` + `mode = cups` (bridge lokal)                                |
| `BluetoothPrintScreen` | `thermal` (ESC/POS raster, Web Bluetooth / Web Serial)                |
| `PrintChoice`          | dua jalur aktif — pilihan eksplisit customer                          |
| `PrintUnavailable`     | nol jalur aktif                                                       |

Pendukung: `PrintTestPanel` (setup wizard & dashboard owner), `HardwareDetectButton`, `printPlan`/`printSheets` (`src/lib/print-layout.ts`, dipakai bersama jalur browser dan thermal), `FinalizeButton` ([ SELESAI ] — trigger print + result).

**Acceptance:** (AC 60) finalize memicu auto-print pada jalur aktif; dua jalur aktif memunculkan pilihan eksplisit; print test tersedia di setup wizard & dashboard; tidak ada jalur aktif berarti pesan, bukan cetak diam-diam.

---

## 5.16 Customer UI Character

Customer app tetap **Neo-Brutalism** namun lebih playful. Prioritas: Package → Pay → Frame → Camera → Capture → Result. Capture button = primary interaction, besar & jelas. Jangan terlihat seperti admin dashboard. Timer countdown terlihat jelas namun tidak mengganggu.

**Kiosk lock (implementasi):** setelah Setup Wizard, layar masuk **fullscreen lock** — tidak bisa keluar kecuali shortcut petugas (**Ctrl+Alt+X ditahan 2 detik**); Esc/F11/context menu diblokir; bila fullscreen lepas, tampil overlay "kembali ke kiosk" (kecuali mode `--kiosk` Chrome yang sudah mengunci sejak awal).

**Fit satu layar (implementasi):** seluruh screen kiosk (welcome, package, checkout/QRIS, frame, kamera, editor, result) didesain muat **1 viewport tanpa scroll** pada perangkat kiosk (1366×768), tablet, dan mobile — heading & padding kompak, konten `flex-1 min-h-0`.

**Offline (implementasi):** sesi tetap berjalan tanpa koneksi — capture/edit lokal, finalize masuk **antrian lokal (IndexedDB)** dan disinkronkan otomatis saat online (grace window server 10 menit). Pembayaran tetap bisa diproses sampai sesi selesai; status payment di-recover via polling saat reconnect.

**Antrian offline & migrasi (C4, hardening 2026-10-08):** antrian finalize IndexedDB (`snapyos-kiosk`/`finalize-queue`, `DB_VERSION=2`) **survive reload** — antrian tidak menyimpan `device_token` (bearer diambil dari live state `localStorage` saat sinkron), jadi item yang belum terkirim tetap ada setelah boot berikutnya. Purge store lawas pra-fix (`device_token` plaintext) kini **sekali-jalan** via flag `localStorage["snapyos_kiosk_migrated_v1"]` — boot pertama purge + set flag, boot berikutnya no-op (sebelumnya `deleteDatabase` tiap mount menghapus antrian live = data loss). `purgeOrphaned` dijalankan hanya setelah drain untuk menghindari race dengan retry 30 dtk. Item yatim (tanpa token hidup) disapu saat sync; `SESSION_EXPIRED` (410) dibuang permanen.

## 5.17 Responsive & Accessibility (customer)

- Mobile/tablet/desktop compatible.
- Kamera responsif terhadap berbagai aspect ratio.
- Kontras tinggi, fokus terlihat, label form jelas, error state informatif.
