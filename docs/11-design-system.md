# 11. Design System — Neo-Brutalism + shadcn/ui

## Status Implementasi (audit 2026-08-30)

Dokumen ini = sumber kebenaran gaya brutalist untuk SELURUH UI SnapyOS. **Dual-shell Dashboard-01 pernah ada dan DIHAPUS 2026-08-30**, lalu dihidupkan kembali 2026-10-25 sebagai tema `modern` (`@efferd/app-shell-3` + primitif shadcn `base-nova`), dan **DIHAPUS LAGI 2026-10-28**: `src/components/efferd/*`, `src/components/theme/*`, `src/lib/dashboard-theme*.ts`, `src/styles/theme-modern.css`, dan `src/components/ui/modern-classes.ts` sudah tidak ada. Brutalis sekarang satu-satunya tema untuk marketing, auth, kiosk, POS, result page, dan seluruh shell dashboard owner/admin/staff. Catatan historis: `docs/dashboard-redesign.md`.

## 11.1 Prinsip

Seluruh aplikasi SnapyOS **wajib** menggunakan **Full Neo-Brutalism**: landing page, login, register, onboarding, dashboard, tables, cards, forms, dialog, modal, buttons, charts, navigation, settings, customer photobox, editor, checkout, payment, result page.

Dilarang tampil seperti: generic Tailwind dashboard, generic AI SaaS, Linear clone, Stripe clone, Notion clone, minimal SaaS template.

## 11.2 Visual Language

**Gunakan:**

- Bold typography
- Thick borders (2–4px, warna solid gelap)
- Hard shadows (offset, no blur) — misal `box-shadow: 4px 4px 0 #000`
- Offset shadows
- High contrast
- Flat surfaces
- Strong geometric shapes
- Large buttons
- Chunky UI
- Bright accent colors **secara terkontrol**
- Strong visual hierarchy

**Hindari:**

- Soft blurry shadows
- Excessive glassmorphism
- Excessive gradients
- Generic rounded SaaS cards (gunakan radius kecil/0)
- Excessive whitespace tanpa fungsi
- AI-slop UI

**Bukan berarti berantakan.** Interface tetap: usable, structured, accessible, professional, consistent.

## 11.3 Design Tokens (Tailwind)

```css
--color-bg: #fffdf5; /* off-white kertas */
--color-surface: #ffffff;
--color-ink: #111111; /* teks utama */
--color-border: #111111; /* border tebal */
--color-accent: #ffd400; /* kuning */
--color-accent-2: #ff5c8a; /* pink */
--color-accent-3: #38d9a9; /* hijau */
--color-accent-4: #4d6bff; /* biru */

--radius: 0px; /* atau 4px untuk beberapa elemen */
--shadow-hard: 4px 4px 0 #111111;
--shadow-hard-sm: 2px 2px 0 #111111;
--border: 2px solid #111111;
```

Font: display bold (misal "Space Grotesk"/"Archivo Black" untuk heading), body readable (misal "Inter"/"IBM Plex Sans"). Tetapkan satu pairing.

## 11.4 shadcn/ui Component Mapping

| shadcn/ui                         | Penggunaan SnapyOS                                                            |
| --------------------------------- | ----------------------------------------------------------------------------- |
| Button                            | Primary (bg accent, border tebal, hard shadow), secondary, destructive, ghost |
| Card                              | Metric cards, package/template cards (border 2px + hard shadow)               |
| Input                             | Form (border tebal, focus ring solid)                                         |
| Select / DropdownMenu / Command   | Filter, workspace switcher                                                    |
| Dialog / Sheet                    | Form create/edit, detail                                                      |
| Tabs                              | Breakdown analytics, settings                                                 |
| Badge                             | Status (paid/pending/expired, photobox online/offline)                        |
| Table / DataTable                 | Transactions, customers, vouchers                                             |
| RecordCollection / RecordCard     | Daftar owner: toggle list (tabel) / grid (kartu); default mobile = kartu      |
| IconButton / IconLink             | Aksi berulang: ikon 36px visual, hit area 44px, tooltip + aria-label          |
| Form + zod                        | Semua form                                                                    |
| Calendar / Popover                | Date range filter                                                             |
| Tooltip                           | Info                                                                          |
| Toast / Sonner                    | Feedback                                                                      |
| Alert                             | Error/empty state                                                             |
| Sidebar / Breadcrumb / Pagination | Navigasi                                                                      |
| Skeleton                          | Loading state                                                                 |
| Chart (Recharts wrapper)          | Revenue analytics                                                             |

**Aturan:** shadcn/ui = component foundation; Neo-Brutalism = visual identity. Jangan pakai default styling shadcn tanpa kustomisasi. Override variabel/`cn` agar semua komponen konsisten Neo-Brutalism.

### Calendar / DateRange / Booking Rules

- Kalender selalu memakai data server. Booking memakai `starts_at`/`ends_at`; transaksi `created_at`; expense `expense_date`; semua ditampilkan dalam `businesses.timezone`.
- Date range inklusif pada tanggal pilihan, dikirim sebagai `[from 00:00, day-after-to 00:00)`.
- Toolbar navigasi/filter berada di row terpisah dari header bulan dan grid, dengan jarak vertikal minimum 16px desktop dan 12px mobile. Event memakai inset minimum 4px dari garis cell; tombol hit area minimum 44px; tidak boleh overlap garis atau keluar cell.
- Grid memakai satu sumber garis saja, tanpa border container + cell ganda. Mobile beralih ke agenda list, bukan kalender yang dipaksa menyempit.
- Wajib tersedia keyboard focus, `aria-label`, loading, empty, error, disabled. Konflik slot ditentukan backend, bukan UI.

Chart: gunakan `shadcn/ui Charts` (ChartContainer, AreaChart, BarChart, LineChart, PieChart). Jangan buat chart dari nol.

## 11.5 Landing Page

**Hero:**

```
BUILD YOUR OWN PHOTOBOX.
"Run your Photobox business, manage your booths, track your revenue,
and create a branded photo experience — all in one place."
[ START YOUR PHOTOBOX ]  [ SEE HOW IT WORKS ]
```

**Sections:** Hero → Problem → Solution → How it works → Customer Photobox experience → Owner dashboard → Revenue analytics → Multi-outlet → Payment → Voucher → Pricing → FAQ → Final CTA.

## 11.6 Dashboard UI

- Sidebar navigation (14 item), topbar (search, notifications, workspace switcher, user menu).
- Cards: thick border + hard shadow + bold typography.
- Charts: shadcn/ui Charts.
- Tables: shadcn Table + Data Table patterns.
- Forms: shadcn Form. Dialogs: shadcn Dialog. Date: Calendar/DatePicker.

## 11.7 Customer Photobox UI

Neo-Brutalism lebih **playful**. Prioritas: camera → capture → countdown → template → result. Capture button = primary interaction, besar. Jangan tampak seperti admin dashboard.

## 11.8 Checkout UI

Order summary (package, voucher input, discount, total), `[ PAY WITH QRIS ]`, lalu layar QRIS (QR, harga, waiting, timer, status). Neo-Brutalism penuh.

## 11.9 Responsive

- Desktop, tablet, mobile.
- Owner dashboard: desktop, tablet, dan mobile. Daftar memakai `RecordCollection`: desktop default list/tabel, mobile default grid/kartu. Preferensi per fitur disimpan di `localStorage` dengan kunci `snapyos.view.<feature>`.
- Aksi berulang memakai `IconButton`/`IconLink` (ikon Lucide relevan, `aria-label` + `title` + tooltip). Ukuran visual 36px di desktop dengan hit area 44px; pada pointer kasar target tetap 44px. Aksi uang/legal berkonsekuensi tinggi tetap memakai label teks.
- Navigasi mobile memakai panel menu di topbar, bukan strip horizontal panjang. Konten dashboard dibatasi `max-w-[1400px]` oleh shell.
- Customer app: mobile/tablet/desktop, kamera responsif terhadap aspect ratio.

## 11.10 Accessibility

- High contrast (kontras teks/bg memenuhi WCAG AA)
- Keyboard navigation
- Visible focus state (outline solid)
- Accessible labels (form labels, aria-label)
- Error states, loading states, disabled states
- Screen reader-friendly structure (semantic HTML, heading order)

## 11.11 Design Token Implementation (wajib saat implementasi)

§11.3 hanya snippet CSS variable. Saat Phase 0, token wajib direalisasikan sebagai **file token tunggal** (bukan tersebar inline), dipakai konsisten oleh Tailwind + shadcn/ui:

- **Lokasi:** `src/styles/tokens.css` (atau `app/globals.css` bagian `@theme`) — satu sumber kebenaran warna/radius/shadow/typography.
- **Isi minimal:** semua var §11.3 (`--color-bg`, `--color-surface`, `--color-ink`, `--color-border`, 4 accent, `--radius`, `--shadow-hard`, `--shadow-hard-sm`, `--border`), font family display/body/mono, dan mapping ke utility Tailwind (`colors.ink`, `colors.accent`, `borderRadius`, `boxShadow`).
- **shadcn/ui:** override variabel tema (CSS variables) + `cn()` agar semua komponen default berubah jadi Neo-Brutalism — **jangan** ship styling default shadcn.
- **Satu accent dominan per halaman** di-enforce lewat token, bukan hardcode hex tersebar di komponen.
- Token file = bagian dari DoD Phase 0 (lihat `12-roadmap-mvp.md`).
