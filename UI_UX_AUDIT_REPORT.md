# UI/UX AUDIT REPORT — SNAPY OS

Tanggal: 2026-11-13
Environment: Next.js 16 dev (`http://localhost:3000`), Playwright Chromium 1254, Supabase dev, data `KLIK FOTO DEV`.
Metode: crawler DOM (`scripts/ui-audit.mjs`) + interaksi Playwright + inspeksi kode. 116 page-view (4 role × 2 viewport × 29 route) + flow kiosk 1080×1920.
Keterbatasan: model tidak dapat membaca gambar; audit visual memakai pengukuran DOM (bounding box, computed style, contrast ratio, overflow, accessible name). Screenshot tetap disimpan sebagai bukti untuk manusia.

## 1. Inventaris area

| Area | Route utama | Status audit |
|---|---|---|
| Landing & marketing | `/`, `/docs`, `/docs/perangkat`, `/kamera`, `/kontak`, `/tentang-kami`, `/kebijakan-*`, `/subscribe` | Desktop + mobile |
| Auth & onboarding | `/login`, `/forgot-password`, `/register`, `/welcome`, `/onboarding/create-business`, `/invite/[token]` | Desktop + mobile; invite tidak diuji (butuh token email) |
| Owner dashboard | 20 route `/dashboard/*` | Desktop + mobile + tablet |
| Admin dashboard | 15 route `/admin/*` | Desktop + mobile |
| Staff shell | 5 route `/staff/*` | Desktop + mobile |
| POS | `/pos`, `/pos/terminal` | Desktop (owner + staff), alur terminal belum diuji penuh |
| Kiosk | `/p/klik-foto-dev/booth-02` | Aktivasi → setup → welcome → paket → checkout → cash; capture/print tidak diuji |
| Result online | `/r/[token]` | NOT VERIFIED (tidak ada token valid) |

## 2. Ringkasan temuan

| ID | Severity | Halaman/komponen | Temuan | Status |
|---|---|---|---|---|
| UX-001 | P1 | `/dashboard/packages` form paket | Pesan validasi default Zod berbahasa Inggris dan teknis (`INVALID INPUT: EXPECTED NUMBER, RECEIVED NAN`) | FIXED |
| UX-002 | P2 | `/kebijakan-privasi` email link | `text-primary` (kuning #ffd400) di atas putih, rasio 1.43:1 | FIXED |
| UX-003 | P3 | `/login` link “Pelajari cara mendaftar” | Hover `text-primary` kuning di atas putih, kontras hover rendah | FIXED |
| UX-004 | P3 | Admin promos/support selects | Duplikasi `id` (`bs-type`, `bs-status`) karena dua form memakai `name` sama | FIXED |
| UX-005 | P3 | `/dashboard/support` daftar tiket | Heading melompat H1 → H3 | FIXED |
| UX-006 | P2 | Kiosk aktivasi/setup | Overlay “MODE KIOSK TERKUNCI” menutup layar sampai tombol “KEMBALI KE KIOSK” ditekan; di headless fullscreen ditolak sehingga overlay muncul lagi tiap transisi layar | NOT VERIFIED (by design + environment) |
| UX-007 | P2 | Kiosk setup kamera | Tanpa kamera, status dapat bertahan “Menyiapkan kamera...” tanpa batas waktu | NOT VERIFIED (butuh perangkat tanpa kamera) |
| UX-008 | P2 | Kiosk setup printer | Setup tidak bisa selesai tanpa uji cetak; jalur “Lewati uji cetak” ada tetapi copy teknis (CUPS/bridge) | NOT VERIFIED (butuh printer) |
| UX-009 | P3 | Landing hero mobile | Preview dashboard `-mr-56` terpotong di viewport 390px (by design bleed, tidak menimbulkan scroll halaman) | ACCEPTED |
| UX-010 | P3 | `/docs` mobile | Strip kategori horizontal scroll (intentional, `overflow-x-auto`) | ACCEPTED |
| UX-011 | Info | Banyak icon button 36×36 terukur | Hit area efektif 44×44 via `after:-inset-1` (`icon-compact`) | BUKAN BUG (verified code) |
| UX-012 | P2 | `/r/[token]` | Belum diuji tanpa token valid | NOT VERIFIED |
| UX-013 | P2 | `/pos/terminal` staff | Render kosong tanpa parameter booth; alur pilih booth → terminal belum diuji penuh | PARTIALLY VERIFIED |

## 3. Hasil per area

### Landing & marketing
- Landing desktop/mobile render, tanpa console error.
- Tidak ada horizontal scroll halaman pada 390px; elemen dekoratif (canvas/footer band) keluar viewport tetapi di dalam `overflow-hidden`.
- Kontras teks nyata lolos; satu-satunya rasio <4.5 adalah watermark footer `SnapyOS` yang berada di container `aria-hidden` (dekoratif).
- Touch target nav marketing 36px tinggi visual; beberapa CTA punya aturan `min-h-11` pada pointer kasar. Icon hit area diperluas.
- Temuan UX-002 dan UX-003 diperbaiki.

### Authentication
- Login desktop/mobile: form jelas, error generik “Email atau password salah.” tampil sebagai alert.
- Forgot password, register (konsultasi), welcome, onboarding render.
- Setelah reset cache `.next`, login kembali normal. Kegagalan render skeleton yang terjadi saat audit adalah cache dev korup, bukan bug produk.
- Rate limit login per IP/email bekerja (setelah beberapa percobaan, login ditolak sementara).

### Owner dashboard
- 20 halaman status 200, satu H1 per halaman, tanpa overflow dokumen di desktop/mobile/tablet.
- Tabel lebar (photoboxes/packages/transactions) memakai container `overflow-x-auto`; tidak memecahkan layout.
- Modal date-range membuka/menutup dengan Escape; form paket menampilkan error per field; workspace switcher hanya satu opsi pada data uji.
- Mobile nav membuka panel `role="dialog"` dengan focus trap; tertutup saat Escape.
- Temuan UX-001, UX-004, UX-005 diperbaiki.

### Admin dashboard
- 15 halaman status 200, tanpa console error, satu H1.
- Select admin kini memakai id unik (UX-004).
- Tabel pengguna di mobile membungkus teks email; link inline tetap kecil tetapi merupakan teks dalam paragraf (bukan kontrol utama).

### Staff shell
- 5 halaman status 200, tanpa temuan layout; read-only dan tanpa target sentuh bermasalah.
- POS owner/staff dapat dibuka; terminal butuh pemilihan booth.

### Kiosk
Flow yang berhasil diuji (dengan fake camera + data dev):
1. Aktivasi kode 6 karakter.
2. Setup kamera (resolusi FULL HD) → lanjut uji cetak.
3. Lewati uji cetak → Welcome “KF / KLIK FOTO DEV / Abadikan momenmu.”
4. START → pilih paket (3 paket, harga integer IDR).
5. Checkout (subtotal, diskon, total) → pilih pembayaran.
6. Metode: QRIS Pakasir, Voucher, Bayar di Kasir.
7. Bayar di Kasir → layar “HUBUNGI PETUGAS” + countdown; owner mengonfirmasi dari dashboard → payment `paid`.

Tidak diuji: capture foto nyata, editor, print fisik, hasil online, kamera/printer rusak.
Overlay fullscreen muncul pada headless karena `requestFullscreen` ditolak; di perangkat kiosk dengan gesture nyata perlu verifikasi. Kode memang memaksa fullscreen di semua layar (bukan regresi).

## 4. Kesimpulan Phase 1

- Tidak ditemukan blocker transaksi baru di alur yang diuji.
- 5 temuan nyata diperbaiki (1 P1, 1 P2, 3 P3).
- Temuan kiosk hardware/fullscreen dan result page dinyatakan NOT VERIFIED, bukan PASS.
- Status keseluruhan: **PARTIALLY VERIFIED** sampai uji perangkat kiosk fisik, printer, kamera, dan result token dilakukan.
