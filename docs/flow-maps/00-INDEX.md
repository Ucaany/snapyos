# SnapyOS — Flow Maps & Feature Integration

**Dokumentasi komprehensif per role, fitur, alur pembayaran, dan migrasi.**

Dokumen ini adalah hasil audit lengkap struktur routing, API, server actions, dan database schema SnapyOS per 2026-09-30.

---

## Daftar Isi

| #   | File                                          | Status      | Isi                                                                     |
| --- | --------------------------------------------- | ----------- | ----------------------------------------------------------------------- |
| 00  | `00-INDEX.md`                                 | ✅ ada      | Indeks (dokumen ini)                                                    |
| 01  | `01-ADMIN-CEO-FLOW.md`                        | ✅ ada      | Alur lengkap Admin/CEO platform                                         |
| 02  | `02-OWNER-DASHBOARD-FLOW.md`                  | ✅ ada      | Alur lengkap Owner dashboard & fitur bisnis                             |
| 03  | `03-STAFF-FLOW.md`                            | ✅ ada      | Alur Staff (read-only shell)                                            |
| 04  | `04-KIOSK-CUSTOMER-FLOW.md`                   | ⛔ backlog  | Alur customer kiosk (pay-first, device activation, capture, result)     |
| 05  | `05-POS-TERMINAL-FLOW.md`                     | ⛔ backlog  | Alur POS terminal (add-on, offline cash, product management)            |
| 06  | `06-PAYMENT-INTEGRATION.md`                   | ⛔ backlog  | Payment gateway integration (Pakasir/Midtrans/Tripay, webhook, polling) |
| 07  | `07-SUBSCRIPTION-LIFECYCLE.md`                | ⛔ backlog  | Subscription, invoice, add-on, promo, entitlement                       |
| 08  | `08-DATABASE-MIGRATIONS.md`                   | ⛔ backlog  | Inventaris migrasi lengkap & changelog schema                           |
| 09  | `09-API-ROUTING-MAP.md`                       | ⛔ backlog  | Map lengkap API endpoints (63 routes) + HTTP methods                    |
| 10  | `10-SERVER-ACTIONS-MAP.md`                    | ⛔ backlog  | Map lengkap server actions per domain (99 actions)                      |
| 11  | `11-FEATURE-FILE-LOCATION.md`                 | ⛔ backlog  | Mapping fitur → file location (pages, actions, API, components)         |
| 12  | `12-SETTINGS-CONFIGURATION.md`                | ⛔ backlog  | Settings owner (branding, payment, retention, checkout, session timer)  |
| 13  | `13-FINANCE-WITHDRAWAL-FLOW.md`               | ⛔ obsolete | Finance, balance, ledger, withdrawal, settlement — **alur withdrawal dihapus migrasi `0044`** |
| 14  | `14-TEMPLATE-BUILDER-FLOW.md`                 | ⛔ backlog  | Template & Frame Builder upload + composite engine                      |
| 15  | `15-SECURITY-RBAC-ENFORCEMENT.md`             | ⛔ backlog  | Security, RBAC matrix, tenant isolation, audit log                      |

> **CATATAN AUDIT 2026-10-16**: berkas `04`–`15` pada tabel di atas **tidak ada** di direktori ini
> (hanya `01`–`03` yang terpasang). Baris bertanda ⛔ adalah **backlog eksplisit** — jangan
> diperlakukan sebagai dokumen yang bisa dirujuk. Angka pada baris `09`/`10` adalah target isi bila
> dokumen itu ditulis, bukan klaim bahwa dokumennya ada.
>
> Peta fitur terkini ada di [`../16-feature-map-audit.md`](../16-feature-map-audit.md) (per dashboard:
> admin, owner, staff, kiosk, POS, result, marketing/auth, API, cron, DB). Inventaris migrasi ada di
> [`../../db/README.md`](../../db/README.md).

---

## Cara Membaca

1. **Per Role**: baca `01-ADMIN`, `02-OWNER`, `03-STAFF`, `04-KIOSK`, `05-POS` untuk flow spesifik role.
2. **Per Fitur**: baca `06-PAYMENT`, `07-SUBSCRIPTION`, `13-FINANCE`, `14-TEMPLATE` untuk domain spesifik.
3. **Per Teknikal**: baca `08-MIGRATIONS`, `09-API`, `10-ACTIONS`, `11-FEATURE-FILE` untuk inventaris kode.
4. **Per Konfigurasi**: baca `12-SETTINGS`, `15-SECURITY` untuk setup & keamanan.

---

## Singkatan & Konvensi

- **SA** = Server Action (`src/server/*-actions.ts`)
- **API** = REST endpoint (`src/app/api/**/route.ts`)
- **Page** = Next.js page component (`src/app/**/page.tsx`)
- **RG** = Route Group (misal: `(dashboard)`, `(admin)`, `(pos)`)
- **FK** = Foreign Key
- **IDR** = Integer Rupiah (tidak ada floating-point untuk uang)
- **SSR** = Server-Side Render
- **CSR** = Client-Side Render (via server action)

---

## Status Implementasi Global

**TERIMPLEMENTASI PENUH**:
- Admin dashboard (overview, users, businesses, plans, add-ons, promos, subscriptions, payments, templates, settings, support tickets)
- Owner dashboard (branding, outlets, photoboxes, packages, templates, vouchers, staff, transactions, analytics, subscription, reports)
- Template Builder (Phase 12)
- POS add-on (Phase 2/3/5/7/8 — offline cash, per-booth toggle, staff permission)
- Payment gateway (Pakasir/Midtrans/Tripay direct merchant + webhook + polling + recovery)
- Kiosk customer (pay-first: package → payment → template → capture → edit → finalize → print → result online)
- Device activation (pairing + setup wizard)
- Subscription lifecycle (trial, active, past_due, cancelled, expired + add-on attach/cancel)
- Settlement & platform fee (dana langsung ke gateway merchant owner; **tanpa** saldo/ledger/withdrawal — dihapus migrasi `0044`)
- Staff read-only shell
- Neo-Brutalism design system (single aesthetic)

**BACKLOG** (belum ada):
- Booking (§4.14)
- Event mode (§4.15)
- Business profile edit + danger zone (§4.17)
- Topbar global search & notifications
- ZIP download hasil foto
- Session settings owner-configurable UI
- Print test dari dashboard

---

## Source of Truth Hierarchy

1. **Kode berjalan** (`src/`, `db/schema.sql`, `tests/`) = realita aktual
2. **`db/schema.sql`** = kontrak database
3. **`docs/07-database-schema.md` + `docs/08-api-spec.md`** = kontrak entity/enum/endpoint
4. **PRD fitur** (`docs/01`–`docs/06`, `docs/09`, `docs/10`, `docs/14`, `docs/15`) = aturan bisnis
5. **Design system** (`docs/11`, `docs/13`, `DESIGN.md`) = gaya visual
6. **`docs/pos/00-audit.md`** = inventaris POS

Konflik? Lihat `AGENTS.md` §Resolusi Konflik.

---

## Tech Stack

- **Frontend**: Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui (base-nova), Lucide Icons
- **Backend**: Supabase (PostgreSQL + Storage), service-role client
- **Auth**: Auth.js v5 (NextAuth) — JWT + DB revocation (`auth_sessions`)
- **Payment**: Pakasir (aggregator invoice subscription) + direct merchant Pakasir/Midtrans/Tripay (owner credential)
- **Visual**: Neo-Brutalism full stack (marketing, auth, dashboard, kiosk, POS, result page)
- **Testing**: Node native test runner (`node --test`)

---

## Versi Dokumen

- **v1.8** (2026-10-16): Audit kode 2026-10-16 — alur withdrawal ditandai obsolete (`0044`), baris `04`–`15` ditandai backlog eksplisit, angka route/action disegarkan (63 route / 99 action).
- **v1.7** (2026-09-18): Direct merchant first-class + restore settings/payment + drop kolom nol-konsumen.
- **v1.6** (2026-09-17): Admin add-on cancel/attach parity owner.
- **v1.5** (2026-09-16): Dashboard cleanup + backend hardening (Fase 5).
- **v1.4** (2026-08-30): Single dashboard brutalist + docs sync.
- **v1.3**: Dashboard-01 dual-shell (HISTORIS, dihapus di v1.4) + POS add-on scope.
- **v1.2**: Template & Frame Builder.
- **v1.1**: Revisi alur customer PAY-FIRST.
- **v1.0**: Draft baseline.

Flow maps ini mencerminkan **v1.8** (2026-10-16); `01`–`03` disinkronkan dengan kode,
`04`–`15` masih backlog (lihat catatan di atas).
