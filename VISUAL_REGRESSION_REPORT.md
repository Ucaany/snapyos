# VISUAL REGRESSION REPORT — SNAPY OS

Tanggal: 2026-11-13
Tool: Playwright Chromium, screenshot ke `audit-screenshots/`.

## 1. Artefak

| Folder | Isi |
|---|---|
| `audit-screenshots/before/` | 116 screenshot page-view dari audit crawl + 7 screenshot flow kiosk (`kiosk-*.png`) |
| `audit-screenshots/after/` | Screenshot setelah perbaikan: `package-validation.png`, `privacy.png`, `admin-promos.png`, `support.png` |
| `.playwright-mcp/` | Screenshot landing desktop awal |

Catatan: crawl kedua menimpa nama file di `before/` dengan state pasca-fix. Pasangan before/after yang benar-benar independen tersedia untuk alur kiosk dan untuk temuan yang diverifikasi lewat DOM/computed style. Tidak ada klaim visual yang tidak dapat dibuktikan.

## 2. Perubahan visual yang diverifikasi

| Temuan | Sebelum (bukti) | Sesudah (bukti) | Hasil |
|---|---|---|---|
| UX-001 validasi paket | Teks alert Inggris (tercatat di output audit) | `audit-screenshots/after/package-validation.png`; alert Indonesia | PASS |
| UX-002 privacy link | Rasio 1.43:1 (computed style) | `after/privacy.png`; computed `rgb(17,17,17)` | PASS |
| UX-003 auth hover | `hover:text-primary` (kode) | `hover:text-accent-4` (kode) | PASS |
| UX-004 duplicate id | 2× `bs-type`/`bs-status` (DOM) | `ADMIN DUP IDS: []` | PASS |
| UX-005 heading support | H1→H3 (DOM) | `after/support.png`; H2 ada | PASS |

## 3. Regression check

- 116 page-view setelah perubahan: semua status 200 (kecuali `/p/.../booth-01` 404 karena data booth-01 sudah dihapus dari DB dev, bukan regresi kode).
- 0 console error / pageerror pada crawl.
- 0 horizontal overflow dokumen pada 390/768/1440.
- Typecheck dan eslint file yang diubah PASS.
- Alur kiosk (aktivasi → setup → welcome → paket → checkout → cash → konfirmasi owner) tetap berjalan setelah perubahan.

## 4. Tidak dapat diverifikasi

- Perbandingan pixel-diff otomatis (tidak ada baseline visual tersimpan sebelum sprint).
- Tampilan kamera live, hasil foto, editor, print fisik.
- Halaman result `/r/[token]`.
- Tema gelap (aplikasi single aesthetic, tanpa dark mode).

## 5. Kesimpulan

Tidak ada regresi visual/layout yang terdeteksi oleh pengukuran DOM dan screenshot pasca-fix. Baseline pixel-diff belum tersedia; status **PARTIALLY VERIFIED**.
