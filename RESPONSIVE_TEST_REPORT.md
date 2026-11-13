# RESPONSIVE TEST REPORT — SNAPY OS

Tanggal: 2026-11-13
Viewport diuji: desktop 1440×900, tablet 768×1024, mobile 390×844, kiosk 1080×1920 (portrait).
Metode: Playwright `setViewportSize` + pengukuran `documentElement.scrollWidth`, bounding box elemen, screenshot.

## 1. Hasil ringkas

| Area | 1440 | 768 | 390 | Catatan |
|---|---|---|---|---|
| Landing / marketing | PASS | — | PASS (no page scroll) | Preview hero terpotong intentional `-mr-56` |
| Auth (login/forgot/register) | PASS | — | PASS | Satu kolom, tanpa overflow |
| Owner dashboard | PASS | PASS | PASS | Sidebar → drawer <md; tabel scroll horizontal |
| Admin dashboard | PASS | — | PASS | Tabel pengguna membungkus email |
| Staff shell | PASS | — | PASS | Tanpa temuan |
| POS | PASS | — | NOT VERIFIED | Terminal butuh pilih booth |
| Kiosk | — | — | — | 1080×1920; layout fullscreen, tombol besar |

## 2. Detail pengukuran

- 116 page-view: `documentElement.scrollWidth === innerWidth` untuk semua halaman (tidak ada horizontal page scroll).
- Elemen yang keluar viewport hanya:
  - Dekoratif footer band/dots (di dalam `overflow-hidden`).
  - Preview hero landing mobile (clipped by section `overflow-hidden`).
  - Tabel lebar di dalam `overflow-x-auto` (scroll internal, bukan page overflow).
  - Canvas WebGL dekoratif landing.
- Tabel dashboard pada 768px: `TABLE` lebih lebar dari viewport tetapi berada di container scroll; kolom sekunder disembunyikan sesuai breakpoint.

## 3. Touch target

- Crawler melaporkan banyak kontrol 36×36. Verifikasi kode: `size="icon-compact"` menambahkan `after:-inset-1` → area sentuh efektif 44×44.
- Kontrol utama (logout admin, mobile nav trigger, tombol kiosk) memakai `min-h-11` atau `min-h-14`.
- Link teks inline (email admin, footer) tetap <44px; ini link dalam paragraf, bukan kontrol primer.

## 4. Kiosk 1080×1920

- Tombol paket, START, metode bayar, dan “Kembali ke kiosk” berukuran besar (≥56px tinggi pada CTA utama).
- Layar checkout muat tanpa scroll horizontal.
- Overlay fullscreen menutupi layar sampai gesture; lihat catatan UX-006.

## 5. Kesimpulan

Responsive layout **PASS** untuk halaman yang diuji pada desktop/tablet/mobile. Kiosk dan POS terminal belum lengkap diuji pada perangkat nyata → **PARTIALLY VERIFIED**.
