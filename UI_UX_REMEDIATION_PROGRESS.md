# UI/UX REMEDIATION PROGRESS — SNAPY OS

Tanggal: 2026-11-13
Prinsip: perbaikan kecil, tidak menyentuh business logic/authorization/API/database.

## Ringkasan status

| Prioritas | Ditemukan | Fixed | Partial | Not verified |
|---|---|---|---|---|
| P0 (transaksi/operasional) | 0 | 0 | 0 | 0 |
| P1 (navigasi/interaksi rusak) | 1 | 1 | 0 | 0 |
| P2 (visual/responsif/a11y) | 5 | 1 | 1 | 3 |
| P3 (polish) | 5 | 3 | 0 | 2 |

## Detail perbaikan

### UX-001 — P1 — Pesan validasi teknis berbahasa Inggris
- Halaman: `/dashboard/packages`, form “Paket baru”.
- Bukti sebelum: submit kosong → alert `NAMA PACKAGE WAJIB DIISI`, `INVALID INPUT: EXPECTED NUMBER, RECEIVED NAN`.
- Perbaikan:
  - `src/lib/validators.ts`: `z.config(z.locales.id())` untuk pesan default Indonesia.
  - Field `price`, `photo_count`, `print_count` pada `packageCreateSchema` diberi pesan spesifik.
- Sesudah: `NAMA PACKAGE WAJIB DIISI`, `HARGA HARUS BERUPA ANGKA`.
- File: `src/lib/validators.ts`.
- Test: typecheck PASS, eslint PASS, Playwright submit kosong PASS.

### UX-002 — P2 — Kontras link email kebijakan privasi
- Halaman: `/kebijakan-privasi`.
- Sebelum: `text-primary` (#ffd400) di atas putih, rasio 1.43:1.
- Perbaikan: `text-ink` (#111) — rasio ±18:1.
- File: `src/app/(marketing)/kebijakan-privasi/page.tsx`.
- Test: computed color `rgb(17,17,17)`.

### UX-003 — P3 — Kontras hover link auth
- Halaman: `/login`.
- Sebelum: `hover:text-primary` (kuning di putih).
- Perbaikan: `hover:text-accent-4` (biru, ≥4.5:1).
- File: `src/components/auth-block.tsx`.

### UX-004 — P3 — Duplicate ID select admin
- Halaman: `/admin/promos`, `/admin/support`.
- Sebelum: `id="bs-type"` dan `id="bs-status"` muncul >1 karena form create + edit.
- Perbaikan: `id = bs-${name}-${useId()}`.
- File: `src/components/admin/BrutalistSelect.tsx`.
- Test: evaluasi DOM duplicate ids → `[]`.

### UX-005 — P3 — Heading skip support
- Halaman: `/dashboard/support`.
- Sebelum: H1 → H3.
- Perbaikan: heading kartu tiket menjadi H2.
- File: `src/components/dashboard/SupportTicketsPanel.tsx`.
- Test: DOM `h2` berisi subjek tiket.

## Temuan yang belum diperbaiki / tidak diverifikasi

| ID | Alasan | Tindakan berikut |
|---|---|---|
| UX-006 | Overlay fullscreen kiosk by design; headless menolak `requestFullscreen` | Uji di tablet/PC kiosk fisik; pastikan gesture pertama mengaktifkan fullscreen |
| UX-007 | Tidak ada perangkat tanpa kamera | Uji cabut kamera; tambahkan timeout jika terbukti menggantung |
| UX-008 | Tidak ada printer/CUPS | Uji printer fisik; review copy teknis untuk operator |
| UX-012 | Tidak ada token result valid | Buat sesi uji lalu buka `/r/[token]` |
| UX-013 | Terminal POS butuh pilih booth | Uji alur pilih booth → transaksi → struk |
| UX-009/010 | Perilaku desain intentional | Dokumentasikan, tidak diubah |

## Gate yang dijalankan

- `npx tsc --noEmit` → PASS.
- `npx eslint` pada 5 file yang diubah → PASS.
- `node scripts/ui-audit.mjs` → 116 page-view, 0 error runtime, 0 horizontal overflow dokumen.
- `node scripts/verify-fixes.mjs` → validasi Indonesia, privacy color, duplicate ids, H2.
- Kiosk flow Playwright → aktivasi, setup, welcome, paket, checkout, cash, konfirmasi owner PASS.
