# Plan: Kiosk SnapyOS untuk Semua Perangkat Mobile — iPad, Tablet Android, Android Phone, iOS Phone

> **Tujuan**: Menjalankan kiosk photobox SnapyOS di **semua** perangkat mobile — iPad,
> tablet Android, Android phone, iOS phone — **tanpa aplikasi native**. Satu codebase,
> satu PWA, empat kelas perangkat. Target UMKM/event yang pakai perangkat apa pun yang
> sudah mereka punya.

## Ringkasan Keputusan

1. **Tanpa app native** — satu PWA (Progressive Web App) yang dipasang dari browser.
2. **Satu codebase** — kiosk existing (`src/app/p/*`, `src/components/kiosk/*`) sudah
   browser-native; perangkat hanya beda **runtime + form factor + fitur kamera/print**.
3. **Matriks perangkat** menentukan fitur, bukan engine terpisah — lihat tabel §1.
4. **Camera provider** — abstraksi `camera-provider.ts` existing memilih jalur runtime:
   `getUserMedia` (semua mobile) vs gPhoto2 (booth desktop/Tauri). Tablet/phone = webcam internal.
5. **Print** — `window.print()` (PWA) atau auto-print lewat device booth; phone/tablet customer
   tidak cetak langsung.

---

## 1. Matriks Perangkat & Fitur

| Perangkat | OS / Browser | Kamera | Fullscreen | Install (PWA) | Print | Orientasi | Peran utama |
|---|---|---|---|---|---|---|---|
| **iPad** | iPadOS Safari | getUserMedia (kamera depan/belakang) | ❌ `requestFullscreen` tidak didukung | Manual "Add to Home Screen" | `window.print()` (AirPrint) | landscape/portrait | Kiosk tetap di meja/stand |
| **Tablet Android** | Android Chrome | getUserMedia | ✅ `requestFullscreen` | ✅ `beforeinstallprompt` | `window.print()` (Google Cloud Print/manual) | landscape (kiosk) | **Kiosk utama** |
| **Android Phone** | Android Chrome | getUserMedia | ✅ | ✅ | ❌ (layar kecil) | portrait | Event/counter kecil, selfie cepat |
| **iOS Phone (iPhone)** | iOS Safari | getUserMedia | ❌ | Manual "Add to Home Screen" | ❌ | portrait | Event/counter kecil |

**Aturan kunci**:
- **Tablet Android = jalur utama kiosk** (fullscreen penuh + install prompt native).
- **iPad/iPhone** = "Add to Home Screen" manual + layout tanpa fullscreen (safe-area handle).
- **Phone (Android/iOS)** = mode counter/event, portrait-first, tanpa print langsung.

---

## 2. Konteks Codebase (sudah ada — jangan dibuat ulang)

- `src/app/p/[businessSlug]/[photoboxSlug]` — kiosk customer (welcome → package → pay → frame → capture → edit → result QR → GIF).
- `src/app/manifest.ts` — PWA manifest existing (`display: standalone`, `orientation`).
- `src/lib/camera-provider.ts` — jalur kamera (`isTauriRuntime()` → gPhoto2 vs getUserMedia).
- `src/lib/use-kiosk-lock.ts` — lock layar sentuh (tap-tahan exit, blokir Escape/F11, safe-area) — **DONE v1.13**.
- `src/server/devices.ts` — activation/pairing (kode 6 karakter) — dipakai apa adanya.
- `docs/electron-kiosk-plan.md` Phase 4 — jalur offline cash + `business_settings.checkout.offline_enabled`.

Referensi plan lama yang digabungkan/direvisi:
- `1791000000000-mobile-tablet-pwa-kiosk-plan.md` (tablet PWA) — fase A–D di-merge ke sini.
- `1790750937891-camera-sdk-mobile-seat-plan.md` (camera SDK + seat) — bagian mobile = remote staff; **tidak** dipakai untuk kiosk mobile (kiosk mobile = getUserMedia, bukan SDK native).

---

## 3. Perubahan

### A. PWA Manifest Per-Device + Instalabilitas

- `src/app/manifest.ts` — perpanjang dengan `shortcuts`, `icons` maskable + `screenshots`
  (optional, untuk instalabilitas Android), `display_override: ["standalone", "fullscreen"]`,
  `orientation: "any"` (device-specific lock runtime via Screen Orientation API).
- `src/app/layout.tsx` — meta `apple-mobile-web-app-capable` (`yes`),
  `apple-mobile-web-app-status-bar-style` (`black-translucent`), `apple-touch-icon`,
  `viewport-fit=cover`, `theme-color` media query (light/dark).
- `src/lib/device-profile.ts` (baru) — deteksi kelas perangkat (iPad/tablet-Android/phone)
  via `navigator.userAgent` + `navigator.maxTouchPoints` + `screen.width` + `matchMedia('(display-mode: standalone)')`.
  Return `{ kind, isPwaInstalled, supportsFullscreen, isTablet, isPhone, defaultOrientation }`.

### B. Camera Provider — Semua Mobile = getUserMedia

- `camera-provider.ts` — pastikan jalur getUserMedia support **kamera depan/belakang**
  (`facingMode: "user" | "environment"`) untuk phone selfie; tablet kiosk tetap
  `facingMode: "environment"` (kamera belakang = kualitas lebih baik).
- Tambah `selectFacingMode()` di setup wizard: tablet default belakang, phone default depan.

### C. Orientasi & Safe Area Per-Device

- Screen Orientation API: lock `landscape` untuk tablet kiosk, `portrait` untuk phone;
  iPad/iPhone fallback ke manifest (iOS PWA ikut manifest, `requestFullscreen`/orientation
  lock runtime tidak didukung penuh).
- Safe-area padding `env(safe-area-inset-*)` di layout kiosk (notch/home indicator iPhone).
- Responsive existing (`lg:` breakpoint) handle 1-panel di phone, 2-panel di tablet.

### D. Lock Layar Sentuh — Diferensiasi Fullscreen

- `use-kiosk-lock.ts` sudah ada (tap-tahan 3 detik exit + PIN petugas). Tambah:
  - Tablet Android: `requestFullscreen()` aktif (full kiosk).
  - iPad/iPhone: **skip fullscreen** (tidak didukung) — andalkan `standalone` PWA + `touch-action: none`
    + block overscroll, tanpa `requestFullscreen`.
  - Phone: `preventDefault` gesture back/swipe via `overscroll-behavior` + `touch-action`.

### E. Print Per-Device

- Tablet Android: `window.print()` (existing) — orientasi landscape, `@media print` layout.
- iPad: `window.print()` → AirPrint dialog.
- Phone: **nonaktif** tombol print di flow customer; arahkan ke QR result (digital-only).
- Auto-print tetap lewat device booth (spooler) — phone/tablet customer tidak cetak thermal.

### F. Pairing & Setup Wizard Copy Per-Device

- `SetupWizard.tsx` + `ActivationScreen.tsx` — copy dinamis sesuai `device-profile.ts`:
  - Tablet kiosk: "tablet mode" (tanpa sebut USB).
  - Phone: "selfie mode" + kamera depan default.
  - iPad: "Add to Home Screen" instruction manual.
- Flow activation (kode 6 karakter) existing tidak berubah.

---

## 4. Fase Implementasi (urutan)

### Phase 0 — Device Profile Detection + Manifest

- `src/lib/device-profile.ts` (deteksi kelas perangkat) + manifest multi-device + meta apple.
- Validasi: unit test `device-profile` (4 kelas device dikenali); Lighthouse PWA installable;
  typecheck/lint/test hijau.

### Phase 1 — Camera Provider Facing Mode

- `camera-provider.ts` + `selectFacingMode()` depan/belakang; default per device-profile.
- Validasi: `tests/camera-provider.test.ts` (facing mode per kelas device).

### Phase 2 — Orientasi & Safe Area Per-Device

- Orientation lock runtime (tablet landscape / phone portrait) + safe-area padding.
- Validasi: manual emulator viewport Android tablet (1280×800) & iPhone (390×844).

### Phase 3 — Lock Layar Sentuh Diferensiasi Fullscreen

- `use-kiosk-lock.ts`: fullscreen hanya tablet Android; iPad/iPhone skip + block gesture.
- Validasi: tap-tahan exit tetap jalan di semua device; iPad tanpa fullscreen tetap terkunci gesture.

### Phase 4 — Print Per-Device

- Tablet/iPad `window.print()`; phone nonaktif + arahkan QR result.
- Validasi: tombol print tersembunyi di phone; AirPrint muncul di iPad.

### Phase 5 — Pairing & Setup Wizard Copy Per-Device

- Copy dinamis per device-profile (tablet/phone/iPad).
- Validasi: alur activate→verify→report dari emulator 4 kelas device.

---

## 5. Risiko & Batasan

1. **iOS Safari PWA** — instalabilitas manual, `requestFullscreen` & Screen Orientation
   runtime tidak didukung penuh. Tablet Android = jalur utama; iOS = layout tanpa fullscreen.
2. **Kamera internal** — kualitas di bawah DSLR; cukup untuk UMKM/event entry-level. Booth
   tetap pakai gPhoto2/Tauri (tidak berubah).
3. **Print phone** — layar kecil + tidak ada printer langsung; digital-only (QR result).
4. **Deteksi device** — `userAgent` bisa di-spoof, hanya UX hint; fitur kamera/orientasi tetap
   dicek capability (bukan UA) untuk keputusan runtime sebenarnya.

---

## 6. Open Questions

1. Prioritas device: tablet Android dulu (jalur utama), atau iPad perlu jadi target equal?
2. Phone selfie mode: apakah perlu masuk scope MVP, atau tablet-only dulu?
3. Service worker/offline cache: wajib fase awal (event venue jaringan lemah), atau deferred?

---

## 7. Validasi Final

- `npm run lint` + `npm run typecheck` + `npm test` + `cargo test`.
- Pre-flight `docs/13` §13.6.
- Update source of truth: `docs/03-architecture.md` (jalur PWA per-device),
  `docs/05-customer-photobox.md` (setup per-device), `docs/README.md` changelog,
  `docs/hardware/02-adr.md` (ADR PWA multi-device).
