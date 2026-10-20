# Dashboard Redesign — shadcn Dashboard-01

> **Status: DIBATALKAN / DIHAPUS 2026-08-30 — catatan historis.**
> Dual-shell (brutalist default + Dashboard-01 alternatif via `DashboardThemeSwitcher`) pernah terimplementasi penuh, lalu dihapus atas keputusan owner: **satu dashboard brutalist saja**. File ini dipertahankan sebagai histori keputusan; TIDAK berlaku lagi sebagai kontrak aktif.
>
> Yang dihapus pada 2026-08-30:
>
> - `src/components/shadcn-theme/` (OwnerShadcnShell, AdminShadcnShell, SiteHeader, NavUser, WorkspaceMenu, ShadcnNav, D01ThemeToggle) — seluruh folder.
> - `src/components/theme/DashboardThemeSwitcher.tsx`, `src/server/theme-actions.ts`, `src/lib/dashboard-theme.ts`.
> - Scope CSS `.snapyos-d01` (light + dark + normalisasi utilitas brutalist) dari `src/app/globals.css`.
> - Branch `getDashboardTheme() === "shadcn"` di `src/app/(dashboard)/layout.tsx` + `src/app/(admin)/layout.tsx`; render switcher di `/dashboard/settings`.
>
> Cookie `snapyos_dashboard_theme` lama di browser user jadi tidak terbaca (harmless; tidak ada kode membacanya lagi).
>
> Estetika aktif: **Neo-Brutalism single** (`docs/11-design-system.md`, `DESIGN.md`, AGENTS.md "KUNCI ESTETIKA").

## Histori (sebelum penghapusan)

Dokumen ini semula kontrak redesign dashboard memakai `npx shadcn@latest add dashboard-01` (registry resmi) sebagai referensi struktur & visual shell alternatif:

- **Struktur** = page.tsx block dashboard-01: `SidebarProvider` + `Sidebar variant="inset" collapsible="offcanvas"` + `SidebarInset` → `SiteHeader` → konten `@container/main`.
- **Token**: scope `.snapyos-d01` = nilai default registry shadcn (zinc + `--radius: 0.625rem` + font stack default Tailwind); di luar scope, palet Neo-Brutalism tetap.
- **Default theme** = `brutalist`; shell Dashboard-01 via `DashboardThemeSwitcher` (cookie `snapyos_dashboard_theme`).
- Normalisasi utilitas brutalist (border-2→1px, shadow→none, font-mono→sans) di dalam scope — tanpa rewrite komponen.

Alur audit shell yang dulu dipakai dual-shell tetap relevan sebagai referensi struktur halaman (`/dashboard/*` widget + gating per route); tabel itu di bawah tetap dipertahankan sebagai inventaris halaman (shell kolom "Gating" tetap akurat untuk shell brutalist tunggal).

## 1. Struktur dashboard existing (audit)

Owner dashboard `/dashboard/*` (layout `src/app/(dashboard)/layout.tsx`):

| Route                     | Judul                      | Widget                                                                                                                          | Gating                         |
| ------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `/dashboard`              | Business name / onboarding | MetricCard hero, dl-grid 8 metrik, RevenueChart, DateRangeFilter, CreateBusinessForm                                            | `transaction:read`             |
| `/dashboard/analytics`    | Revenue Analytics          | RevenueChart, BreakdownChart, DateRangeFilter                                                                                   | `transaction:read`             |
| `/dashboard/metrics`      | Business Metrics           | MetricCard grid, DateRangeFilter                                                                                                | `transaction:read`             |
| `/dashboard/photoboxes`   | Photobox                   | PhotoboxesTable (+PhotoboxForm, DeviceDialog)                                                                                   | `photobox:write`               |
| `/dashboard/outlets`      | Outlet                     | OutletsTable (+WilayahPicker)                                                                                                   | `outlet:write`                 |
| `/dashboard/templates`    | Templates                  | TemplatesGrid; `/templates/builder/[id]` full-bleed TemplateBuilder                                                             | `template:write`               |
| `/dashboard/packages`     | Package                    | PackagesTable                                                                                                                   | `package:write`                |
| `/dashboard/vouchers`     | Voucher                    | VouchersTable                                                                                                                   | `voucher:write`                |
| `/dashboard/transactions` | Transaksi                  | TransactionsView, DateRangeFilter, LiveSearch                                                                                   | `transaction:read/write`       |
| `/dashboard/finance`      | Finance                    | MetricCard, ExpensesPanel, WithdrawalPanel, DateRangeFilter                                                                     | `finance:read`                 |
| `/dashboard/reports`      | Reports                    | form GET → export API                                                                                                           | `report:read`                  |
| `/dashboard/customers`    | Customer                   | CustomersTable, LiveSearch                                                                                                      | `customer:read`                |
| `/dashboard/staff`        | Staff & Role               | StaffPanel                                                                                                                      | owner only                     |
| `/dashboard/subscription` | Subscription               | SubscriptionPanel (+SubscriptionCheckout); `/invoice/[id]` InvoicePayClient; `/invoice/[id]/receipt` = route.ts (bukan halaman) | `subscription:write`           |
| `/dashboard/settings`     | Settings                   | CheckoutSettingsEditor, RetentionSettingsEditor                                                                                 | `business:update` (read semua) |
| `/dashboard/pos`          | POS                        | PosProductsTable, PosBoothsTable, PosReportsPanel                                                                               | `pos:read` + entitlement       |

Admin platform `/admin/*` (layout `src/app/(admin)/layout.tsx`): overview, users, businesses, plans, subscriptions, add-ons, templates, payments, withdrawals, settings (nav 10 item, `src/components/admin/AdminSidebar.tsx`).
