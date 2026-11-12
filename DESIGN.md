# Design System: SnapyOS — Neo-Brutalism

> Semantic design system (tokens, typography, components, motion, bans). Source of truth pendamping `docs/11-design-system.md` & `docs/13-skill-anti-slop.md`. PRD SnapyOS menang atas skill mana pun bila konflik.

> **DEFAULT AESTHETIC = Neo-Brutalism** (`industrial-brutalist-ui`) — bahasa visual **seluruh** UI SnapyOS: marketing, auth, kiosk customer, result page, dashboard owner/admin/staff, dan semua API response. Skill lain hanya menyumbang perilaku interaksi, bukan tampilan.
>
> **Koreksi (2026-10-29):** tema kedua `modern` **tidak dikirim**. Verifikasi kode: tidak ada `src/styles/theme-modern.css`, tidak ada cookie `snapyos_dashboard_theme`, dan `/admin/settings` maupun `/dashboard/settings` tidak punya pemilih tema. Satu-satunya bahasa visual yang berlaku adalah Neo-Brutalism di seluruh shell.

## 1. Visual Theme & Atmosphere

Interface **Neo-Brutalist** — Swiss Industrial Print + aksen Tactical Telemetry. Datar, tegas, high-contrast, "declassified blueprint / tactical telemetry" namun tetap usable, accessible, dan konsisten. Satu accent dominan per halaman (color consistency lock).

- **Density:** Daily App Balanced (4–7) → Cockpit Dense (8) untuk tabel/finance.
- **Variance:** Offset Asymmetric (6–7) — hindari centered hero di landing.
- **Motion:** Fluid CSS (4–6) — spring `stiffness:100, damping:20`, tanpa linear easing.

Dilarang tampak seperti: generic Tailwind dashboard, generic AI SaaS, Linear/Stripe/Notion clone.

## 2. Color Palette & Roles

| Token            | Hex       | Peran                                                   |
| ---------------- | --------- | ------------------------------------------------------- |
| Paper White (bg) | `#FFFDF5` | Latar utama (off-white kertas, bukan pure white)        |
| Surface          | `#FFFFFF` | Kartu/container                                         |
| Ink              | `#111111` | Teks utama + border tebal (bukan `#000`)                |
| Border           | `#111111` | Border solid 2–4px                                      |
| Accent Yellow    | `#FFD400` | Accent dominan (default) — CTA, active state, highlight |
| Accent Pink      | `#FF5C8A` | Accent alternatif                                       |
| Accent Green     | `#38D9A9` | Accent alternatif                                       |
| Accent Blue      | `#4D6BFF` | Accent alternatif                                       |

- **Satu accent dominan per halaman.** Sisanya netral. Saturation terkontrol (< 80%).
- Shadow: `--shadow-hard: 4px 4px 0 #111111`; `--shadow-hard-sm: 2px 2px 0 #111111` (hard offset, **no blur**).
- Radius: `0px` (default) atau `4px` maksimal. Bukan pill untuk kartu/button utama.

## 3. Typography Rules

- **Display/Headline:** Archivo Black / Space Grotesk — uppercase, `tracking -0.03em s/d -0.06em`, `leading 0.85–0.95`, `clamp(4rem, 10vw, 15rem)` untuk macro type.
- **Body:** Inter / IBM Plex Sans — `leading-relaxed`, `max-w-[65ch]`, kontras tinggi.
- **Mono (angka/metadata):** Space Mono / JetBrains Mono — ID transaksi, harga, metric cards, timestamps; `tracking 0.05–0.1em`, uppercase, 10–14px.
- **Banned:** serif acak di headline sans (emphasis pakai bold/italic font yang sama); `Fraunces` / `Instrument_Serif` sebagai default.

## 4. Component Stylings

- **Buttons:** Flat, border 2px solid ink, hard shadow, tactile `:active` → `-translate-y-[1px]` / `scale-[0.98]`. Primary = bg accent; secondary = ghost/outline. Label ≤ 3 kata, tidak wrap, WCAG AA kontras.
- **Cards:** Border 2px + hard shadow. Hanya bila elevation menyampaikan hierarki. High-density (tabel/finance) → ganti dengan `divide-y` / `border-t`.
- **Inputs:** Label di atas, helper di atas, error di bawah. Focus ring solid ink/accent. Placeholder bukan label.
- **Loaders:** Skeletal shimmer matching layout. Bukan spinner generik.
- **Empty States:** Composed + cara mengisi (CTA).
- **Error States:** Inline/contextual.
- **Syntax decoration:** `[ ... ]`, `>>>`, markers `®`/`™`/`+`, barcode stripes, `REV x.x` sebagai dekorasi struktural.
- **Motif yang disengaja (punya alasan, bukan default tanpa tujuan):**
  - **Eyebrow `LABEL`** di setiap `PageHeader` + panel (`font-mono`, uppercase, `tracking 0.2em`, warna muted). Alasan: penanda seksi ala print teknis yang konsisten di seluruh dashboard; ini motif identitas, bukan eyebrow dekoratif yang mengulang headline. Prefix literal `///` **tidak** dirender — ia terbaca sebagai artefak teks, bukan dekorasi.
  - **Panah `→` / `ArrowRight` pada CTA navigasi** ("Buka halaman transaksi →", "Upgrade Plan"). Alasan: menandai aksi yang meninggalkan halaman/panel saat ini. Bukan dipasang di setiap tombol; hanya pada CTA lintas-section.
  - **Role 4 warna non-netral** (R-29): kuning `--accent` (aksi/highlight), hijau `--accent-3` (status berhasil, mis. paid), merah `--destructive` (error/hapus), pink `--accent-2` (aksen identitas sekunder). Keempatnya punya peran fungsional; tidak boleh dipakai sebagai dekorasi bebas.
- **Icons:** Lucide (wajib, per PRD). Aksi berulang memakai `IconButton`/`IconLink`: ikon 36px visual dengan hit area 44px, `aria-label` + `title` + tooltip brutalist. Aksi uang/legal berkonsekuensi tinggi tetap memakai label teks.
- **Kiosk icon rationale:** camera, printer, download, QR, banknote, tag, frame, and film icons directly identify capture, output, payment, or frame choices. Omit icons where the text already gives sufficient recognition.
- **Kiosk payment hierarchy:** first available payment method receives accent fill as the default path; alternatives use surface fill so customer choice remains clear without implying equal operational priority.
- **Kiosk branding contrast:** custom foreground/background pairs require WCAG AA contrast before save; invalid pairs are rejected at the validator boundary.
- **Kiosk mobile overflow:** full-screen capture, editor, template, and result views scroll on narrow or short viewports; desktop retains bounded panels for camera and editor focus.
- **Kiosk type rule:** display font is reserved for customer instructions and actions; mono remains metadata-only. Custom mono headings are not a supported readability choice.
- **Owner dashboard finance/payment:** data SSR dan server actions menjadi default; client polling hanya untuk QR aktif, berhenti saat final/unmount, menampilkan nominal provider `total_amount` serta error inline. Credential gateway dirender redacted; secret tidak pernah kembali ke browser.
- **Divider & sub-divider (aturan opacity):** garis struktur penuh pakai `border-ink` (2-4px). Sub-pemisah di dalam panel memakai opacity bertingkat tetap: `border-ink/10` untuk baris tabel, `border-ink/20` untuk pemisah grup di dalam kartu, `border-ink/40` hanya untuk outline dashed empty state. Alasan: header tabel/section tetap ink penuh (18.9:1), sedangkan garis berulang diredupkan agar tidak bersaing dengan border utama; 3 tingkat saja supaya ada satu kontrak visual, bukan pilihan acak per halaman.
- **Owner add-on:** katalog global hanya admin. Owner melihat entitlement, memilih quantity, mengonfirmasi invoice, membayar QRIS, lalu mengelola cancellation akhir-periode.
- **Dashboard-01 (HISTORIS — dihapus v1.4):** dual-shell `.snapyos-d01` sudah di-remove 2026-08-30. Seluruh dashboard memakai token brutalist dari `src/styles/tokens.css`.

## 5. Layout Principles

- **Grid-first:** CSS Grid deterministik; `gap:1px` + background kontras untuk garis tipis. Tanpa flexbox percentage math (`calc()`).
- Contain: `max-w-[1400px] mx-auto`.
- **Hero:** muat viewport awal; headline max 2 baris; subtext max 20 kata; CTA terlihat tanpa scroll; top padding max `pt-24`.
- **Nav:** satu baris desktop, tinggi ≤ 80px.
- **Bento grid:** jumlah cell = jumlah konten (tanpa cell kosong); minimal 2–3 cell punya variasi visual nyata.
- **Zigzag alternation cap:** max 2 section image+text split berurutan.
- **Eyebrow restraint:** max 1 per 3 section.
- **Section repetition ban:** layout family sama max 1x per halaman.
- Full-height: `min-h-[100dvh]`, bukan `h-screen`.
- **Mobile collapse:** semua multi-column → single column di < 768px, eksplisit per section.
- **Daftar owner:** desktop default list/tabel, mobile default grid/kartu lewat `RecordCollection`; preferensi per fitur di `localStorage` (`snapyos.view.<feature>`).
- **Navigasi mobile:** panel menu di topbar (bukan strip horizontal panjang). Konten dashboard dibatasi `max-w-[1400px]` oleh shell.
- **Skala spacing (kontrak):** container `p-6 md:p-10`; jarak antar section `gap-6 md:gap-8`; panel `p-4`; kartu `p-5`; sel metrik `p-3`; chip `px-3 py-2`. Nilai baru harus menambah level di daftar ini, bukan angka ad-hoc per halaman.
- **Kolom aksi tabel:** tombol aksi memakai ikon 44px (`size="icon"`) dengan `aria-label` + `title`; label teks panjang hanya di dialog konfirmasi dan form, bukan di baris tabel.

## 6. Motion & Interaction

- Spring physics default `stiffness:100, damping:20`. Tanpa linear easing.
- Animate hanya `transform` + `opacity`. Tanpa `top/left/width/height`.
- Wajib honor `prefers-reduced-motion`.
- Staggered cascade reveal (`staggerChildren` / CSS delay), bukan mount instan.
- Noise/grain global di fixed `pointer-events-none` pseudo-element, bukan scrolling container.

## 7. Anti-Patterns (Banned)

- AI-purple/blue gradient, neon glow, glassmorphism berlebihan.
- Pure black `#000000` / pure white default.
- Soft blurry drop shadow (wajib hard offset shadow). Tidak ada scope non-brutalist yang diizinkan.
- 3 equal feature cards; centered hero (landing).
- Oversized H1 yang "scream"; inject serif acak di headline sans.
- Emoji (kecuali diminta eksplisit).
- `// TODO` / `// ...` / placeholder / skeleton (full-output-enforcement).
- **Copy AI-cute/template-y ("Elevate", "Seamless", "Unleash", "Next-Gen"); angka presisi palsu tanpa sumber.**
- **Konvensi bahasa (ID/EN):** label UI, judul halaman, dan aksi memakai **Bahasa Indonesia** ("Keuangan", "Laporan", "Pendapatan Net", "Biaya"). Istilah finansial baku yang lazim dipakai tim finance Indonesia boleh tetap EN huruf kecil: `gross`, `net`, `paid`, `pending`. Jangan campur judul EN dengan isi ID ("Business Metrics" ❌ → "Metrik Bisnis" ✅).
- Duplicate CTA intent dalam satu halaman.
- Custom mouse cursor.
