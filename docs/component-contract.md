# Component Contract — ui/* (base)

> Kontrak implementasi komponen dasar. Acuan: `docs/03-architecture.md` §3.8.2.
> Aturan: setiap komponen wajib punya loading/empty/error state **bila relevan** (komponen atom presentational di bawah tidak punya state async, jadi N/A).

## Konvensi umum

- Semua komponen di `src/components/ui/` — **presentational**, import dari `@/lib/utils` (`cn`).
- **Server Component by default.** Tidak ada `"use client"` kecuali disebut. Komponen yang butuh interaktivitas (state/hooks) ditandai Client.
- **Variants** via `class-variance-authority` (`cva`); styling Neo-Brutalism dari `src/styles/tokens.css`.
- Props mengikuti primitif (Base UI / HTML) — komponen tidak menambah state internal.

## Button

- **File:** `src/components/ui/button.tsx` — **Client** (Base UI `ButtonPrimitive`).
- **Props:** `ButtonPrimitive.Props & VariantProps<typeof buttonVariants>` + `variant`, `size`, `className`.
- **Variants:** `default` (accent kuning) · `secondary` (surface) · `outline` · `destructive` · `ghost` · `link`.
- **Sizes:** `default` (h-11) · `sm` · `lg` · `icon` · `icon-sm`.
- **State:** `disabled:opacity-50`, `focus-visible:outline-2 outline-ink`, tactile `active:translate/shadow-none`.
- **Data fetch:** tidak ada. **Loading/empty/error:** N/A (atom).
- **Aksesibilitas:** kontras AA (ink di atas accent), label ≤ 3 kata, fokus terlihat.

## Card

- **File:** `src/components/ui/card.tsx` — **Server** (murni `div`).
- **Ekspor:** `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`.
- **Props:** `React.ComponentProps<"div">`.
- **Style:** border-2 ink + hard shadow + radius 0; `CardFooter` pakai `border-t-2`.
- **Data fetch:** tidak ada. **Loading/empty/error:** N/A.
- **Catatan:** untuk tabel/finance high-density, ganti dengan `divide-y`/`border-t` (bukan Card).

## Input

- **File:** `src/components/ui/input.tsx` — **Server** (murni `<input>`).
- **Props:** `React.ComponentProps<"input">` + `className`.
- **Style:** border-2 ink + hard shadow-sm, `focus-visible:outline-2 outline-ink`, `aria-invalid:border-destructive`.
- **State:** `disabled`, `aria-invalid` (error di-render oleh parent, di bawah input — lihat `docs/13` §13.3.6).
- **Data fetch:** tidak ada. **Loading/empty/error:** N/A (parent yang render error).

## Keputusan terkait

- **ThemeProvider:** tidak dibuat — SnapyOS single aesthetic light (Neo-Brutalism), tanpa dark mode. Dual-shell Dashboard-01 (toggle shell alternatif) pernah ada, **dihapus 2026-08-30** — satu dashboard brutalist saja.
- **State management (realita):** Server Components + Server Actions; TanStack Query & Realtime tidak dipakai (status payment = polling 3s `useQrisPolling`).
- **i18n:** Indonesia-only, hardcode string, tanpa framework.
