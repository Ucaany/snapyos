# DESIGN SYSTEM AUDIT — SNAPY OS

Tanggal: 2026-11-13
Sumber: `src/styles/tokens.css`, `src/app/globals.css`, `src/components/ui/**`, `docs/11-design-system.md`, `DESIGN.md`.

## 1. Token global

| Kategori | Implementasi | Status |
|---|---|---|
| Warna | Off-white `#fffdf5`, surface `#fff`, ink `#111`, accent `#ffd400`, accent-2/3/4, destructive `#c81e1e` | Konsisten |
| Semantic bridge | `--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--border`, `--ring`, chart 1–5 | Konsisten |
| Radius | `--radius: 0px`; semua skala turunan 0 | Konsisten (Neo-Brutalism) |
| Shadow | Hard offset tanpa blur: 1/2/3/4/6px | Konsisten |
| Motion | `--ease-snap` / `--ease-brutal` cubic-bezier(0.32,0.72,0,1) | Konsisten |
| Font | Archivo Black (display), IBM Plex Sans (body), Space Mono (mono) | Konsisten |
| Spacing | Tailwind scale + utilitas `gap/p`; tidak ada token spacing terpisah | Konsisten secara praktik |

Tidak ada token duplikat atau nilai warna hardcode baru di komponen yang diaudit. Hardcode yang tersisa adalah bayangan `#111111` pada beberapa shadow arbitrary (`shadow-[4px_4px_0_0_#111111]`) — setara `--shadow-hard`, tetapi belum diseragamkan.

## 2. Tipografi

- H1 dashboard memakai `PageHeader` dengan dua ukuran: `page` (2xl→4xl) dan `hero` (3xl→5xl). Satu H1 per halaman terverifikasi di 116 page-view.
- Eyebrow mono uppercase 11px, body sans 14–16px, metadata mono 10–11px.
- Temuan: `/dashboard/support` melompat H1 → H3 pada kartu tiket. **FIXED** menjadi H2.

## 3. Warna & kontras

- Pasangan aman: ink di bg/surface (19:1), muted-foreground `#555` di surface (7.4:1), destructive `#c81e1e` (5.6:1).
- Accent kuning hanya untuk background, bukan teks di atas putih. Dua pelanggaran ditemukan:
  - Link email di halaman kebijakan privasi memakai `text-primary` (1.43:1) → **FIXED** ke `text-ink`.
  - Hover link auth memakai `hover:text-primary` → **FIXED** ke `hover:text-accent-4` (4.5:1+).
- Watermark footer besar `SnapyOS` rasio 1:1 tetapi berada dalam `aria-hidden="true"` dan `pointer-events-none` → dekoratif, bukan konten.

## 4. Button

- Satu sumber varian: `button-variants.ts` (`default`, `outline`, `secondary`, `ghost`, `destructive`, `link`; size default/sm/lg/icon/icon-compact/icon-sm).
- `IconButton`/`IconLink` memakai `icon-compact` 36px visual + `after:-inset-1` → hit area 44px. Ini menjelaskan temuan crawler “36×36”; bukan pelanggaran touch target.
- Admin logout memakai `size-11` eksplisit.

## 5. Form

- `Input`, `Textarea`, `Select` native, `InputGroup` konsisten border 2px ink, radius 0, focus ring 2px.
- Checkbox/radio sering dibungkus `<label>` sehingga accessible name benar; crawler menandainya “unnamed” karena hanya memeriksa `label[for]`/aria. False positive.
- Validasi: schema Zod global kini memakai locale Indonesia; field paket diberi pesan spesifik (“Harga harus berupa angka”). **FIXED**.
- `num()` menolak desimal/format ribuan tidak valid dengan pesan Indonesia.

## 6. Dropdown & select

- Dua implementasi select: `ui/select.tsx` (form server-action) dan `admin/BrutalistSelect.tsx` (admin). Gaya visual sama; duplikasi kecil dan disengaja karena kebutuhan label/wrapper admin.
- `BrutalistSelect` sebelumnya memakai `id=bs-${name}` sehingga dua form dengan name sama menghasilkan id duplikat. **FIXED** dengan suffix `useId()`.

## 7. Modal/dialog

- `ui/dialog.tsx`: Base UI, overlay ink 60%, tanpa blur, `max-h-[90dvh]` + scroll, close button.
- Date-range popover, mobile nav (role dialog + focus trap), edit forms berfungsi; Escape menutup.
- Tidak ditemukan dialog tanpa label atau tanpa close.

## 8. Tabel & pagination

- Tabel memakai `<table>` semantik dengan `<caption>` pada tabel ranking; header `scope="col"`.
- Tabel lebar dibungkus `overflow-x-auto`; tidak memecahkan dokumen.
- Pagination admin memiliki `AdminPaginator`; owner transactions/packages memakai filter dan daftar.

## 9. Toast/notification

- `CashPaymentNotifier` memakai `role="status"` + `aria-live="polite"`, tombol tutup 44px, konfirmasi per item.
- Alert operasional dashboard memakai `role="alert"`/`status`.
- Tidak ada sistem toast global terpusat; notifikasi kontekstual per fitur. Bukan inkonsistensi yang menghalangi.

## 10. Breakpoint & responsif

- Tailwind default: `sm 640`, `md 768`, `lg 1024`, `xl 1280`.
- Shell dashboard: sidebar desktop → mobile drawer pada `<md`; topbar sticky.
- Tabel: kolom sekunder disembunyikan (`hidden md:table-cell`, `lg:table-cell`) dan detail dipindah ke kartu/list.
- Tidak ada horizontal overflow dokumen pada 390, 768, 1440 untuk 116 page-view.

## 11. Rekomendasi tertunda (tidak dikerjakan)

1. Seragamkan arbitrary shadow `#111111` menjadi token `shadow-hard-*` (P3, mekanis).
2. Satukan `BrutalistSelect` ke `ui/select` bila tidak ada kebutuhan label khusus (P3).
3. Audit axe-core penuh untuk nama aksesibel kontrol yang dibungkus label (butuh dependency tambahan).
