# Plan: Aplikasi Kiosk Windows (SDK Kamera Native) + Remote Staff Mobile + Seat Counting by Online Pairing

## Ringkasan Keputusan (dikonfirmasi user)

1. **Arsitektur kamera**: Desktop Windows = SDK native (Canon EDSDK / Sony Camera Remote SDK / Nikon PTP). Mobile = remote/operator via dashboard staff (bukan connect kamera langsung). Browser TIDAK bisa memuat SDK native.
2. **Arti "sesi"**: dihitung dari **jumlah device aktif terpairing + online (heartbeat)**, menggantikan batas `max_concurrent_sessions` berbasis sesi foto konkuren.
3. **Aplikasi teknisi**: via **dashboard web** (`/dashboard` owner) saja — bukan mode console Electron, bukan app terpisah.
4. **Mobile Android/iOS**: via **dashboard staff** existing (`/staff/*`) responsive/PWA — bukan native app baru.

## Klaim SDK — sudah diverifikasi (fakta)

- **Canon EDSDK v13.20.11** — rilis 2026-03-02 (benar; ada versi lebih baru 13.20.21 rilis 2026-05-12). Native C++, Windows/macOS, butuh lisensi developer Canon.
- **Sony Camera Remote SDK v2.02.00** — rilis 2026-06-10 (benar). Native C++, Windows/Linux, butuh lisensi Sony.
- **Nikon** — TIDAK merilis SDK tether publik; kontrol kamera Nikon hanya via PTP/MTP driver (klaim user benar).
- **Konsekuensi keras**: EDSDK & Sony Remote SDK = library native yang hanya bisa dimuat di desktop (Windows). Mobile/browser hanya bisa jadi remote control, bukan connect kamera.

---

## Konteks Codebase (sudah ada — jangan dibuat ulang)

- `hardware-agent/` (Rust) — loopback service `127.0.0.1:17931`, discovery-only, 22 camera profile (12 Canon + 10 Sony) di `hardware-agent/src/devices/cameras.rs`, printer profiles di `printers.rs`. Framework lengkap tapi TIDAK ada provider capture/control (semua `BLOCKED`/`NOT_READY`). Bukan target runtime produksi.
- `docs/electron-kiosk-plan.md` — plan existing 11 phase (Electron desktop + direct merchant payment). **Phase 9 (Camera SDK) & Phase 10 (Printer) & Phase 5–7 (Electron shell) tetap relevan** sebagai sumber, tapi plan ini mengganti arsitektur kontrol kamera ke SDK resmi daftar user, dan memindahkan console teknisi ke web dashboard.
- `devices` table (`db/schema.sql:244`) — sudah punya `last_seen_at` (heartbeat throttled 60s, `src/server/devices.ts:117`), `status` active/revoked, `last_heartbeat_at`, `camera_config`, `printer_config`, `diagnostics`.
- `plans.max_concurrent_sessions` (`schema.sql:112`) + `src/server/session-capacity.ts` + `src/server/plan-limits.ts` = seat limit saat ini.
- `photoboxes.camera_settings`, `.print_settings`, `.session_settings` (jsonb) = konfigurasi teknisi yang sudah tersimpan per booth, disinkron ke kiosk via `GET /api/v1/public/...` + `verifyDevice`.
- `(staff)/staff/*` = shell staff read-only existing (outlets, packages, photoboxes, templates).

---

## Perubahan Utama

### A. Kontrol Kamera: SDK Native di Desktop Windows

Pakai **gPhoto2/PTP sebagai jalur primer lintas-brand**, **Canon EDSDK v13.20.11** dan **Sony Camera Remote SDK v2.02.00** sebagai jalur native per-brand (bukan fallback sekunder), **Nikon via PTP** (tanpa SDK proprietary). Ini menggantikan strategi "gPhoto2 utama, EDSDK/Sony fallback" di plan lama — user ingin daftar SDK resmi jadi jalur connect utama.

Hierarki resolusi (per brand, saat device terdeteksi):

```
Deteksi kamera USB (PTP/MTP)
├── Canon → Canon EDSDK v13.20.11 (native, primary)
│           └── EDSDK gagal/tidak tersedia → gPhoto2/PTP
├── Sony  → Sony Camera Remote SDK v2.02.00 (native, primary)
│           └── Sony SDK gagal/tidak tersedia → gPhoto2/PTP
├── Nikon → PTP driver (tidak ada SDK proprietary)
└── tidak terdeteksi → webcam getUserMedia (existing fallback)
```

Kemampuan wajib per jalur: discovery, connect, capture, live view, image transfer, get/set settings (ISO/aperture/shutter/WB). Lihat `docs/electron-kiosk-plan.md` Phase 9A–9D untuk kontrak capability.

### B. Seat Counting: Sesi = Device Online (bukan sesi foto)

- **Definisi "online"**: `devices.status='active'` DAN `last_seen_at` dalam window (default 90 detik; heartbeat kiosk tiap ~30–60s). `last_heartbeat_at` (0027) jadi kanonik bila ada; `last_seen_at` tetap fallback.
- **Ganti gate kuota**: `assertSessionCapacity`/`enforceBusinessCapacityAfterInsert` dan `getPlanLimits` membandingkan **jumlah device online** terhadap `max_concurrent_sessions`, bukan jumlah `sessions.status='active'`.
- **Batas per-booth 1 sesi foto aktif tetap berlaku** (partial unique index `uq_sessions_active_per_photobox`) — ini aturan throughput, BUKAN kuota billing. Jangan diganggu.
- **Add-on `extra_session`** tetap menambah `max_concurrent_sessions` (seat), sekarang berarti "device online tambahan".
- **Konsekuensi**: bisnis dengan 3 booth tapi hanya 1 device online → 1 seat terpakai. Booth yang device-nya offline tidak menghabiskan seat.

### C. Halaman List Kamera & Printer Support (baru)

Halaman publik `/supported-devices` + section di dashboard `/dashboard/hardware`:

- Daftar kamera support: Canon (EDSDK v13.20.11 — daftar model dari compatibility sheet resmi), Sony (Camera Remote SDK v2.02.00 — daftar model), Nikon (PTP — model umum), + status evidence per model (`Known`/`LabVerified`/`ProductionVerified`).
- Daftar printer support: Generic, Epson (incl. L120), Canon, HP, Brother, DNP DS620/DS-RX1, HiTi P520L, Canon Selphy — dari `printers.rs` + paper size + cut mode.
- **Source of truth**: ekstrak profile dari `cameras.rs`/`printers.rs` ke sumber data yang bisa di-render web (mis. JSON statis di `src/lib/device-catalog.ts` atau endpoint API). Jangan duplikasi manual; satu sumber.

### D. Aplikasi Teknisi = Dashboard Web (owner)

- Extend `/dashboard/photoboxes/[id]/camera` (existing) menjadi **"Kamera & Cetak"** penuh: settings kamera (device, kalibrasi rotasi/zoom/mirror, countdown), printer (pilih, paper size, cut mode, copies, margins), print size, template.
- Semua setting disimpan ke `photoboxes.camera_settings`/`print_settings`/`session_settings` (server actions existing) → otomatis sinkron ke kiosk via config sync yang sudah ada (`use-config-sync.ts`).
- TIDAK ada console teknisi di app kiosk; teknisi login ke dashboard web.

### E. Mobile = Dashboard Staff Responsive

- Staff (`/staff/*`) mengakses monitoring + konfirmasi pembayaran cash + restart kiosk dari Android/iOS via browser (PWA/installable). Tidak ada app native baru.
- Perlu audit: staff saat ini `read-only` (`rbac.ts` staff: hanya read + pos:sell/read). Konfirmasi cash operator membutuhkan permission baru (mis. `session:confirm-cash`) — putuskan apakah staff atau manager.
- Operator panel QR (`docs/electron-kiosk-plan.md` Phase 6 Tab D) tetap jadi mekanisme link operator↔device; akses lewat `/staff` bukan console Electron.

---

## Fase Implementasi (urutan)

### Phase 0 — Device Catalog & SDK Version Constant

- Buat `src/lib/device-catalog.ts`: struktur typed `CameraSupport`/`PrinterSupport` berisi daftar resmi (Canon EDSDK v13.20.11 model list, Sony v2.02.00 model list, Nikon PTP, printer matrix) + `sdkVersion` constant (`EDSDK_VERSION="13.20.11"`, `SONY_SDK_VERSION="2.02.00"`).
- Sinkronkan dengan `cameras.rs` (22 model) dan tambah Nikon + model resmi dari compatibility sheet (mark evidence = `Known`, `production_ready=false` — jangan klaim dukungan).
- Validasi: unit test — setiap model di catalog punya brand/model/strategy/evidence yang valid; SDK version literal benar.

### Phase 1 — Seat Counting by Online Device

- Tambah helper `countOnlineDevices(businessId)` (server-only) — hitung `devices` active + `last_seen_at`/`last_heartbeat_at` dalam window.
- Ubah `src/server/session-capacity.ts`: ganti cek `sessions.status='active'` level business dengan `countOnlineDevices >= max_concurrent_sessions`. Pertahankan cek per-booth (1 sesi foto aktif) apa adanya.
- Ubah `getPlanLimits`/billing metrics yang menampilkan "sesi aktif" agar konsisten.
- Update `docs/02-business-subscription.md` + `docs/07-database-schema.md` untuk definisi seat baru.
- Validasi: test — 2 device online vs limit 1 → tolak; 1 online + 1 offline vs limit 1 → lolos.

### Phase 2 — Halaman List Kamera & Printer

- Buat route `/supported-devices` (publik, marketing) + section di `/dashboard/hardware`.
- Render dari `device-catalog.ts`. Neo-Brutalism. Tanpa klaim dukungan palsu (evidence column).
- Validasi: halaman render, daftar kamera/printer muncul, link SDK version benar.

### Phase 3 — Technis via Dashboard Web

- Extend `/dashboard/photoboxes/[id]/camera` → "Kamera & Cetak": kamera, printer, ukuran, template settings (persist ke jsonb existing).
- Sync ke kiosk via mekanisme config existing (tanpa perubahan runtime kiosk).
- Validasi: setting tersimpan, muncul di `verifyDevice`/config sync.

### Phase 4 — Mobile Staff Operator

- Audit RBAC; tambah permission minimal untuk konfirmasi cash/restart (jika diperlukan).
- Staff dashboard responsive/PWA untuk monitoring + operator actions.
- Validasi: staff bisa akses dari mobile viewport; aksi operator terjaga tenant.

### Phase 5 — Desktop Kiosk (SDK Native) — [HARDWARE_GATE]

- Scaffold app kiosk Windows (Electron/Tauri) — memuat EDSDK/Sony/PTP binding native.
- Kontrak capability penuh (discovery/connect/capture/live view/transfer/settings) di belakang feature flag.
- **[LAB_REQUIRED]** verifikasi dengan kamera fisik + kabel data. Jangan tandai production-ready tanpa test matrix fisik.
- Validasi: `[STUB_OK]` interface + fallback hierarchy via mock; `[LAB_REQUIRED]` hardware fisik.

---

## Risiko & Batasan

1. **SDK lisensi**: EDSDK & Sony Remote SDK butuh persetujuan developer + lisensi. Bundling redistributabel SDK ke installer wajib mengikuti lisensi masing-masing vendor (umumnya tidak boleh redistribusi arbitrary). Verifikasi legal sebelum bundle.
2. **SDK tidak bisa di mobile/browser**: kendala fisik. Arsitektur yang dipilih mengatasi ini (mobile = remote).
3. **Nikon**: tidak ada SDK tether — hanya PTP. Live view Nikon via PTP terbatas/tidak didukung di beberapa model. Dokumentasikan sebagai "PTP support, bukan native tether".
4. **Evidence gate**: model Canon/Sony di catalog = metadata (`Known`), bukan bukti capture. Jangan klaim "supported" sebelum lab test.
5. **Seat redefinition** mengubah arti `max_concurrent_sessions` — migrasi data/billing tenant existing perlu dicek (business yang sudah punya beberapa booth).

## Open Questions (untuk dikonfirmasi sebelum implementasi)

1. **Framework desktop**: Electron (matches plan existing) vs Tauri (lebih ringan, Rust-native, selaras dengan hardware-agent Rust). Rekomendasi: **Tauri** karena hardware-agent sudah Rust + ukuran installer kecil, tapi Electron lebih matang untuk print/serial. Perlu keputusan user.
2. **Redistribusi SDK**: apakah sudah punya lisensi Canon/Sony developer? Jika belum, jalur gPhoto2/PTP harus jadi default sementara.
3. **Window "online"**: 90 detik default OK, atau butuh konfigurasi per business?

## Validasi Final

- `npm run lint` + `npm run typecheck` + `npm test`.
- Pre-flight `docs/13` §13.6 sebelum declare done.
- Update source of truth docs: `docs/02`, `docs/03-architecture.md`, `docs/05`, `docs/07`, `docs/08`, `docs/hardware/*` (ADR baru untuk SDK native + seat counting).
