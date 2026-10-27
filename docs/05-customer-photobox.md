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

### Kustomisasi penuh (Branding & Kiosk)

Konfigurasi kiosk (`branding.kiosk`) mencakup:

- **Override per-layar** (`pages.welcome/guide/package/payment/template/capture/edit/result`): warna bg/teks, skala font, radius tombol, padding, perataan konten — menimpa nilai global.
- **Tutorial custom** (`guide_steps`): langkah ditampilkan sebelum pemilihan paket, dapat ditambah/dihapus/diurutkan (max 8). Kosong = dilewati.
- **Video promo** (`video_key` global + `pages.*.video_key` per-layar): looping muted; layar kamera awal bisa menampilkan video attract di latar panel preview.
- **Kontrol interaksi**: `show_mirror_toggle` (tampilkan tombol mirror di layar kamera) dan `allow_zoom_pan` (izinkan customer zoom/pan foto di editor).
- **Override per-booth**: dua lapis, dan urutannya menentukan pemenang.
  1. **Website** (`/dashboard/branding`) menyimpan snapshot override di `photoboxes.branding` — dipakai saat booth belum dikustomisasi di mesin.
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

**Purpose:** Customer memilih frame/template sesuai package.

> v2: tahap ini terjadi **setelah pembayaran sukses (paid)** — bagian dari sesi foto yang sudah dibayar.

**UI:** grid preview template — thumbnail = **preview frame dengan slot terisi foto sample** (render engine composite, `15-template-builder.md`). Semua template aktif tampil untuk paket mana pun. Bila template memiliki slot, jumlah capture mengikuti `template.slot_count`; template legacy tanpa slot memakai `package.photo_count`. Slot yang perlu mengulang foto diisi bergiliran (`src/lib/template-fit.ts`).

**Data:** `templates` (+ `layout` slot) via `package_templates` join.

**API:** `GET /api/v1/public/:businessSlug/templates?package=`

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
[ PRINTING... / PRINT DONE ✓ ]     (auto-print ter-trigger, lihat §5.15)
SCAN TO GET YOUR PHOTOS:
[ QR CODE → halaman result online ]
[ CREATE ANOTHER ] → reset ke Welcome (sesi one-shot)
```

### Online Result Page (`result_token`)

**URL (route customer-facing):** `GET /r/[token]` — halaman Next.js publik pendek (tanpa login). Halaman ini me-fetch data via endpoint `GET /api/v1/public/results/:resultToken` dan merender konten. QR di kiosk mengarah ke `/r/[token]`.

**UI (layout):**

```
[ Header: nama business (BACKLOG: logo owner) ]
YOUR PHOTOS ARE READY!
[ PREVIEW GIF animasi slideshow — autoplay loop ]
[ GRID thumbnail foto berframe (1..N) ]
[ UNDUH GIF ]   [ unduh per foto ]   (BACKLOG: [ UNDUH SEMUA (ZIP) ])
( Slot future: [ KIRIM KE EMAIL ] — OUT OF SCOPE sekarang )
```

Menyediakan:

- **Unduh GIF animasi slideshow** — semua foto berframe bergantian otomatis; digenerate **server-side saat finalize**; storage key di `sessions.result_gif_key`. Preview GIF autoplay loop di atas halaman.
- **Unduh foto berframe** (statis, per foto — hasil edit + frame pilihan customer), tampil sebagai grid thumbnail, bisa diunduh per foto. **BACKLOG: unduh semua (ZIP)** — belum diimplementasi (lihat blok Status Implementasi).
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

**Pendekatan:** **Browser print / OS printer** (`window.print()` + `@media print`), target Chrome kiosk mode (`--kiosk-printing` untuk auto-print tanpa dialog). Fleksibel untuk printer foto umum (DNP dye-sublimation, Citizen, Canon Selphy, inkjet) yang terpasang sebagai printer default OS. Di tablet Android/iPad dialog print sistem selalu muncul (browser tidak bisa silent-print); hanya Chrome desktop `--kiosk-printing` yang senyap.

### 5.15.1 Print Flow (v2: auto-trigger saat finalize)

```
Customer tekan [ SELESAI ] di editor  ATAU  auto-finalize (timeout post-paid)
   ↓
Finalize → upload foto final → generate result + GIF
   ↓
App render print layout (canvas):
   - 1 foto 4x6"  ATAU  2 strip 2x6" (photostrip dari satu kertas 4x6")
   - Gambar + template frame + branding owner
   ↓
print_count menentukan jumlah lembar cetak. `copies` pada konfigurasi booth menggandakan set lembar bila diperlukan.
   ↓
Bridge CUPS lokal mencetak PDF langsung tanpa dialog; `window.print()` tetap tersedia sebagai fallback (Chrome kiosk `--kiosk-printing` dapat silent-print).
   ↓
[ PRINT TEST ] tersedia di Setup Wizard (§5.0.1) & dashboard owner
   ↓
Status printer: tercatat di photoboxes.device_status (owner lihat di dashboard)
```

### 5.15.2 Print Settings (owner-configurable, per photobox)

`photoboxes.print_settings` jsonb:

```json
{
  "enabled": true,
  "paper_size": "4x6",
  "layout": "single",
  "orientation": "portrait",
  "auto_print": true,
  "copies": 1,
  "margins_mm": 0,
  "mode": "cups",
  "bridge_url": "http://127.0.0.1:17777",
  "printer_name": ""
}
```

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

1. **Print Test di Setup Wizard (§5.0.1)** & dashboard owner → mode CUPS mengirim PDF langsung ke bridge lokal, mode browser membuka `window.print()`, mode thermal mengirim ESC/POS → owner konfirmasi fisik ("Test print berhasil?" Ya/Tidak).
2. **Printer default OS** harus di-set di kiosk, atau isi `printer_name` CUPS. Bridge CUPS memakai `lp`/`lpstat` dan opsi media custom sesuai ukuran kertas, orientasi, margin, serta `fit-to-page`.
   Ukuran `4x6` = `101.6 × 152.4 mm`, `A6` = `105 × 148 mm`; driver harus menerima media custom atau profile kertas yang ekuivalen. Print Test menggambar kotak batas pada margin aktif, sehingga ukuran, orientasi, dan area aman bisa diverifikasi secara fisik.
3. Status disimpan ke `photoboxes.device_status.printer = { status, last_test_at, confirmed }`.

### 5.15.5 Error Handling (print)

| Kondisi                             | Pesan / Aksi                                            |
| ----------------------------------- | ------------------------------------------------------- |
| Printer tidak tersedia              | "Printer tidak terdeteksi. Jalankan [ PRINT TEST ]."    |
| Kertas habis                        | deteksi tidak memungkinkan via web → panduan di Bantuan |
| print gagal (onbeforeprint/onerror) | "Gagal mencetak." + [ CETAK ULANG ]                     |
| package tanpa print                 | langsung ke result (download/QR)                        |

### 5.15.6 Components

`PrintLayoutRenderer` (canvas → printable DOM), `PrintButton`, `PrintTestButton` (setup wizard & owner), `PrintStatusIndicator`, `FinalizeButton` ([ SELESAI ] — trigger print + result).

**Acceptance:** (AC 60) finalize memicu auto-print (Chrome kiosk); print test tersedia di setup wizard & dashboard; auto-print berjalan di kiosk mode.

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
