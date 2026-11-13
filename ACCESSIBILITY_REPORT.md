# ACCESSIBILITY REPORT — SNAPY OS

Tanggal: 2026-11-13
Standar acuan: WCAG 2.2 AA (kontras, nama aksesibel, heading, fokus, touch target).
Metode: pengukuran DOM Playwright (bukan axe-core penuh) + review kode.

## 1. Yang sudah baik

- Satu H1 per halaman pada seluruh 116 page-view.
- Landmark: `header`, `nav`, `main`, `footer`; dashboard punya “Lewati ke konten”.
- Tombol ikon memakai `aria-label`/`title`; `IconButton` menyediakan tooltip.
- Dialog mobile nav: `role="dialog"`, `aria-modal`, focus trap, Escape, focus return.
- Form: input punya label/aria-label; error field memakai `aria-invalid` dan pesan teks.
- Status pembayaran tunai: `role="status"` + `aria-live="polite"`.
- Gambar marketing punya `alt`; gambar dekoratif `aria-hidden`.

## 2. Temuan dan status

| ID | Severity | Temuan | Status |
|---|---|---|---|
| A11Y-001 | P2 | Link email privasi kuning di putih 1.43:1 | FIXED → `text-ink` |
| A11Y-002 | P3 | Hover link auth kuning di putih | FIXED → `hover:text-accent-4` |
| A11Y-003 | P3 | Duplicate `id` pada select admin membuat label ambigu | FIXED |
| A11Y-004 | P3 | Heading skip H1→H3 pada kartu tiket | FIXED → H2 |
| A11Y-005 | P2 | Pesan validasi teknis bahasa Inggris membingungkan pembaca layar | FIXED → locale Indonesia + pesan field |
| A11Y-006 | Info | Watermark footer rasio 1:1 | BUKAN TEMUAN (aria-hidden, dekoratif) |
| A11Y-007 | Info | Checkbox/radio tanpa `label[for]` | BUKAN TEMUAN (dibungkus label) |

## 3. Keyboard & fokus

- Date-range popover: Escape menutup (verified).
- Mobile nav: focus trap, Escape, focus kembali ke trigger (verified via DOM).
- Dialog edit paket: inline form (bukan modal) — tidak ada focus trap yang diperlukan.
- `:focus-visible` ring 2px ink tersedia di button/input/select.

## 4. Kontras terukur (setelah fix)

| Pasangan | Rasio | Ambang | Status |
|---|---|---|---|
| Ink `#111` / bg `#fffdf5` | ±18.6:1 | 4.5 | PASS |
| Muted `#555` / surface `#fff` | ±7.4:1 | 4.5 | PASS |
| Destructive `#c81e1e` / white | ±5.6:1 | 4.5 | PASS |
| Privacy link `#111` / white | ±18.9:1 | 4.5 | PASS |
| Accent-4 `#3a56e0` / white | ±4.5:1 | 4.5 | PASS |
| Accent `#ffd400` / white | 1.43:1 | 4.5 | DILARANG untuk teks |

## 5. Belum diverifikasi

- axe-core/WAVE penuh (tidak dipasang; pengukuran DOM terbatas).
- Screen reader nyata (NVDA/VoiceOver).
- Kontras state disabled/placeholder pada semua komponen.
- Touch target link inline pada perangkat sentuh nyata.
- Kiosk dengan pembaca layar (kiosk visual-first, tetapi tombol memiliki teks).

## 6. Kesimpulan

Tidak ada blocker aksesibilitas P0/P1 yang tersisa pada halaman yang diuji. Status: **PARTIALLY VERIFIED** (otomatis DOM PASS; audit axe dan screen reader belum dijalankan).
