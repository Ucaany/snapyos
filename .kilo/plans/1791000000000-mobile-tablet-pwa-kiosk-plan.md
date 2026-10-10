# Plan: Kiosk Android/iOS (Tablet) via PWA — Tanpa App Native

> **Tujuan**: Menjalankan kiosk photobox SnapyOS di tablet Android/iOS **tanpa
> aplikasi native** — cukup buka URL, `Add to Home Screen` (PWA), masuk kode
> aktivasi → langsung pairing. Target UMKM yang tidak mau setup ribet
> (tanpa kabel USB ke kamera DSLR, tanpa install `.apk`/App Store).

## Ringkasan Keputusan (dikonfirmasi user)

1. **Tanpa app native** — PWA (Progressive Web App) di browser tablet.
2. **gPhoto2/libgphoto2 tetap jalan** — jalur kamera aktif ditentukan runtime:
   booth desktop (Tauri webview) memakai gPhoto2 (PTP, kontrol USB DSLR);
   tablet PWA murni memakai `getUserMedia` (kamera internal). Satu abstraksi
   `camera-provider.ts` (`isTauriRuntime()` → `gphoto2` | `getusermedia`).
3. **Connect = pairing** — kode aktivasi 6 karakter (flow existing), bukan
   setup USB/PC mode.
4. **Satu codebase** — kiosk existing (`src/components/kiosk/*`) sudah
   berjalan di browser; PWA hanya menambah manifest + instalabilitas +
   lock sentuh. Tidak ada duplikasi UI.

## Status Implementasi Sebelumnya (verifikasi 2026-10-01)

| Item                                          | Status |
| --------------------------------------------- | ------ |
| `npm test` (489 test)                         | ✅ PASS |
| `npm run typecheck`                           | ✅ PASS |
| `npm run lint`                                | ✅ PASS |
| `cargo test` (tauri-kiosk, 8 test)            | ✅ PASS |
| Kontrol kamera gPhoto2 (plan v1.11)           | ✅ PASS |
| GIF e2e (`tests/gif-e2e.test.ts`, 5 test)     | ✅ PASS |

Tidak ada code tumpang tindih: jalur DSLR (gPhoto2/Tauri) dan jalur webcam
(`getUserMedia`) hidup berdampingan lewat hierarki resolusi — tablet memakai
jalur webcam, booth desktop memakai jalur gPhoto2.

## Prinsip Kunci

- **Kiosk sudah browser-native** — seluruh alur customer (welcome → package →
  bayar → kamera → edit → frame → result QR → GIF) berjalan di `src/app/p/*`.
  Tablet hanya butuh **instalabilitas PWA** + **lock layar sentuh**, bukan engine baru.
- **Camera = gPhoto2 (booth) / getUserMedia (tablet)** — `camera-provider.ts`
  memilih jalur berdasarkan runtime. Booth desktop (Tauri) kontrol kamera USB
  via gPhoto2; tablet PWA memakai kamera internal.
- **Zero dependency baru** — manifest adalah file statis Next.js bawaan. Tidak
  tambah library.
- **Print = `window.print()`** (existing) atau print via dashboard staff. Printer
  thermal diarahkan lewat spooler device booth; tablet customer tidak perlu
  akses printer langsung.

## Perubahan

### A. PWA Manifest + Instalabilitas

- `src/app/manifest.ts` (baru) — `name`, `short_name`, `start_url: "/p"`,
  `display: "standalone"`, `orientation: "landscape"` (kiosk), icon SVG/PNG
  (brutalist), `background_color`/`theme_color` dari `tokens.css`.
- `src/app/layout.tsx` — daftarkan `<link rel="manifest">` + meta `apple-mobile-web-app-capable`
  (`yes`), `apple-mobile-web-app-status-bar-style` (`black-translucent`), `viewport-fit=cover`.
- Service worker (opsional, fase 1 ditunda — lihat Risiko 3): cache shell
  minimal agar kiosk tahan jaringan lemah. `offline-queue.ts` existing sudah
  handle transaksi offline.

### B. Lock Layar Sentuh (Tablet)

- Extend `use-kiosk-lock.ts` — saat ini pakai `requestFullscreen()` + `Ctrl+Alt+X`.
  Tablet tidak punya keyboard fisik. Tambah:
  - `add to home screen` PWA sudah `standalone` (tanpa address bar).
  - `onExitRequest` via **tap-tahan 3 detik** di overlay re-engage (bukan
    shortcut keyboard) → dialog PIN petugas (existing `ExitPinDialog`).
  - Block gesture navigasi (swipe back) via `touch-action` + `overscroll-behavior`.
- Tidak mengubah flow PIN (server-verified, existing).

### C. Pairing Tanpa USB

- Flow existing `activate → verify → report` (`src/server/devices.ts`) dipakai
  apa adanya. Tablet membuka `base_url` kiosk, masukkan kode aktivasi 6 karakter
  dari dashboard owner → `pair_device` → `device_token` → siap.
- `SetupWizard.tsx` kamera memakai `getUserMedia` internal (existing) — tanpa
  langkah USB/PC mode. Tambah indikator "tablet mode" bila `navigator.userAgent`
  mobile, supaya copy setup tidak menyebut kabel USB.

### D. Orientasi & Safe Area (Tablet)

- `orientation: any` di manifest; `viewport-fit=cover` + safe-area padding
  (`env(safe-area-inset-*)`) di layout kiosk agar notch/home indicator tidak
  menutupi tombol.
- **Orientasi layar per booth** (`camera_settings.screen_orientation`) —
  landscape/portrait, dikunci runtime via Screen Orientation API (Chrome);
  iOS PWA mengikuti manifest.
- Responsive existing (`lg:` breakpoint) sudah menangani layout 2-panel → 1-panel
  di layar sempit.

## Fase Implementasi (urutan)

### Phase 0 — Manifest + Instalabilitas PWA

- `src/app/manifest.ts` + link manifest di `layout.tsx`.
- Icon SVG (brutalist) + maskable.
- Validasi: `curl /manifest.webmanifest` mengembalikan JSON valid; Lighthouse
  PWA installable; typecheck/lint/test hijau.

### Phase 1 — Camera Provider Bridge (gPhoto2 / getUserMedia)

- `src/lib/camera-provider.ts` — `isTauriRuntime()` pilih jalur; `captureViaGphoto2`
  (`invoke("capture_photo")`) di booth, getUserMedia di tablet.
- Validasi: `tests/camera-provider.test.ts` (runtime murni vs Tauri).

### Phase 2 — Install Prompt di Dashboard

- `src/components/dashboard/InstallPWA.tsx` — `beforeinstallprompt` → tombol
  "Pasang Aplikasi" brutalist; wire ke `(dashboard)/layout.tsx`.
- Validasi: unit/manual — prompt muncul di Android Chrome, tidak muncul di iOS
  (pakai `apple-mobile-web-app` meta sebagai jalur manual).

### Phase 3 — Lock Layar Sentuh + Safe Area

- Extend `use-kiosk-lock.ts` (tap-tahan exit, block swipe, safe-area).
- **Status: DONE (v1.13)** — tap-tahan 3 detik, blokir Escape/F11/Alt+Tab/Ctrl+W,
  auto re-engage fullscreen, orientasi per booth (`screen_orientation`), error
  boundary auto-restart (`KioskErrorBoundary.tsx`).

### Phase 4 — Pairing UX Tablet (copy)

- `SetupWizard.tsx` + `ActivationScreen.tsx`: copy "tablet mode" (tanpa sebut
  USB bila getUserMedia), indikator mobile.
- Validasi: alur activate→verify→report dari tablet emulator.

### Phase 5 — Service Worker (opsional, deferred)

- Cache shell + `offline-queue.ts` integrasi. Hanya bila UMKM butuh offline
  capture; online-first default.

## Risiko & Batasan

1. **iOS Safari PWA** — dukungan `display: standalone` + instalabilitas lebih
   terbatas (butuh user manual "Add to Home Screen"); `requestFullscreen`
   **tidak didukung iOS**. Tablet Android (Chrome) = jalur utama; iOS =
   "Add to Home Screen" + layout tanpa fullscreen (safe-area sudah handle).
2. **Kamera internal** — kualitas di bawah DSLR; cukup untuk UMKM entry-level.
   Booth butuh kualitas DSLR tetap pakai gPhoto2/Tauri (tidak berubah).
3. **Service worker** — deferred; jangan blokir PWA installable tanpa itu.
   `offline-queue.ts` sudah menutupi transaksi offline di fase sekarang.
4. **Print** — tablet customer tidak cetak langsung; auto-print tetap lewat
   device booth (spooler). Tablet = capture/edit/result/QR.

## Open Questions

1. Target utama Android atau iOS? (iOS punya batasan fullscreen; Android lebih
   mulus untuk kiosk standalone).
2. Service worker/offline wajib di fase awal, atau deferred?
3. Orientasi kiosk: landscape tetap, atau perlu portrait untuk template 4x6?

## Validasi Final

- `npm run lint` + `npm run typecheck` + `npm test` + `cargo test`.
- Pre-flight `docs/13` §13.6.
- Update source of truth: `docs/03-architecture.md` (jalur PWA/tablet),
  `docs/05-customer-photobox.md` (setup tablet), `docs/README.md` changelog,
  `docs/hardware/02-adr.md` (ADR-021 PWA tablet).
