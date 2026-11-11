# Dashboard Themes — Brutalis (default) + Modern (shadcn/efferd) — DIHAPUS

> **Status: DIHAPUS 2026-10-28.** Tema `modern` dan seluruh pendukungnya sudah
> dihapus dari kode: `src/components/efferd/*`, `src/components/theme/*`,
> `src/lib/dashboard-theme.ts`, `src/lib/dashboard-theme-server.ts`,
> `src/styles/theme-modern.css`, `src/components/ui/modern-classes.ts`, dan
> `tests/dashboard-theme.test.ts`. Shell owner/admin/staff sekarang brutalist
> saja (`Topbar` + `CollapsibleShell` + `Sidebar`), tanpa cookie
> `snapyos_dashboard_theme`. Dokumen ini disimpan sebagai catatan historis;
> sumber kebenaran gaya ada di `docs/11-design-system.md`.
>
> Isi di bawah menggambarkan desain yang **sudah tidak berlaku**.

## Ringkas

|          | Brutalis (default)                               | Modern                                                        |
| -------- | ------------------------------------------------ | ------------------------------------------------------------- |
| Shell    | `Topbar` + `CollapsibleShell` + `Sidebar`        | `EfferdShell` (`@efferd/app-shell-3`)                         |
| Token    | `src/styles/tokens.css` (Neo-Brutalism)          | `src/styles/theme-modern.css` (shadcn neutral, oklch)         |
| Primitif | `src/components/ui/*` (border 2px, shadow keras) | kelas default shadcn di `src/components/ui/modern-classes.ts` |
| Chart    | garis hitam 2px, bar kotak, font mono            | grid `--border`, bar radius 4, font sans                      |
| Cakupan  | seluruh app                                      | shell owner/admin/staff (`/dashboard`, `/admin`, `/staff`)    |

Marketing, auth, kiosk, POS, dan result page tetap **brutalis saja**.

## Cara kerja

Dua tema hidup di route yang sama, jadi markup halaman tidak diduplikasi.
Tiga lapisan:

1. **Context** — `src/components/theme/dashboard-theme-context.tsx`.
   Default `"brutalist"`, jadi pemakaian primitif di luar shell dashboard
   otomatis tetap brutalis.
2. **Primitif theme-aware** — `card`, `table`, `badge`, `button`, `input`,
   `textarea`, `select`, `page-header`, `MetricCard`, `StatStrip`,
   `DateRangeFilter`, `TxInsightsPanel`, dan chart (`chart-style.ts`) memilih
   kelas brutalis atau kelas default shadcn berdasarkan context.
3. **Scope CSS** — `src/styles/theme-modern.css` menetralkan sisa kelas
   brutalis yang ditulis langsung di halaman (border 2px, hard shadow,
   radius 0, mono/uppercase, `gap-[2px] bg-ink`, header tabel, chart SVG).

## State

Cookie `snapyos_dashboard_theme` = `modern` | `brutalist` (selain itu
fallback brutalis). Ditulis client di halaman Pengaturan
(`src/components/theme/ThemeSwitcher.tsx`), dibaca server lewat
`getDashboardTheme()` (`src/lib/dashboard-theme-server.ts`).

Sidebar ciut punya cookie sendiri (`sidebar_state` untuk shell modern,
`snapyos_sidebar_collapsed` untuk brutalis) — dua state independen.

## Menambah UI baru

- Pakai primitif `src/components/ui/*` (Card/Table/Badge/Button/Input).
  Keduanya otomatis benar di dua tema; jangan hardcode `border-2 border-ink`
  atau `shadow-[...]` di halaman baru.
- Kalau tetap butuh kelas brutalis langsung (mis. markup kustom), tambahkan
  pola normalisasinya ke `theme-modern.css` agar tema modern tidak bocor.
- Jangan menambah warna SnapyOS baru tanpa memetakannya di scope
  `.theme-modern` — palet modern sengaja netral (shadcn neutral).

## Riwayat

- **2026-08-30** — dual-shell Dashboard-01 dihapus; satu estetika brutalis.
- **2026-10-25** — tema kedua dihidupkan lagi dengan `@efferd/app-shell-3`,
  cakupan owner/admin/staff, pilihan per-browser di halaman Pengaturan.
  Isi halaman tidak ditulis ulang; primitif dibuat theme-aware.
