# Feature Status

Status: active
Audience: owner, staff, admin, developer, operator
Last updated: 2026-10-08
Last verified: 2026-10-08
Source of truth: `src/`, `db/schema.sql`, `README.md`

## Active

| Area | Status | Canonical source |
| --- | --- | --- |
| Auth.js credential auth | Active | `src/lib/auth.ts`, `auth_sessions` |
| Multi-tenant business | Active | `businesses`, `business_members`, tenant helpers |
| Owner dashboard | Active | `src/app/(dashboard)/dashboard/` |
| Staff shell | Active, operational read-only | `src/app/(staff)/staff/` |
| Admin platform | Active | `src/app/(admin)/admin/` |
| Customer kiosk | Active, pay-first | `src/app/p/[businessSlug]/[photoboxSlug]/` |
| Online result | Active | `src/app/r/[token]/` |
| Direct merchant payment | Active | Pakasir, Midtrans, Tripay credentials per business |
| Voucher payment | Active | public checkout actions and voucher server logic |
| Offline cash kiosk | Active when owner enables it | `business_settings.checkout.offline_enabled` |
| POS add-on | Active, offline-only | `src/server/pos-actions.ts`, `photoboxes.pos_enabled` |
| Template builder | Active | `src/components/dashboard/TemplateBuilder.tsx` |
| Storage quota | Active when plan feature is enabled | `src/server/storage-usage.ts` (jumlah kedua provider) |
| Dual storage (R2 write + Supabase read) | Active — Fase 3 | `src/server/storage` (`getWriteStorage`, `resolveStorage`) |

## Partial or constrained

| Area | Constraint |
| --- | --- |
| Camera control | Browser camera (PWA, `getUserMedia`) — kamera internal tablet. Tanpa kontrol kamera USB native. |
| Printing | Browser print fallback (`window.print()` / media print). Tanpa kontrol printer native. |
| Subscription REST | Subscription actions use server actions and dashboard pages. No public REST contract is exposed. |
| Owner CRUD REST | Most owner CRUD uses server actions. Only documented device, customer detail, report, and activation routes remain. |

## Security hardening (2026-10-08)

Selesai (migrasi `0064`–`0066`, commit per phase):

| Temuan | Perbaikan | Migrasi/Test |
| --- | --- | --- |
| C1 RLS | RLS + policy `svc_all` service_role di semua tabel publik; revoke anon/authenticated | `0064`; `tests/rls-coverage.test.ts` |
| C2 webhook invoice | `provider_signature` null tidak auto-pass; Pakasir wajib server-to-server | `tests/pakasir-invoice-webhook.test.ts` |
| C3 cash gate | `confirmCashPaymentAction` gated `requireEffectiveSubscription(write)` | `tests/subscription-gate.test.ts` |
| C4 offline queue | purge sekali-jalan (flag), antrian survive reload | `tests/kiosk-offline-queue.test.ts` |
| H1 RPC lock | semua RPC aplikasi service_role-only | `0065`; `tests/rpc-privilege.test.ts` |
| H2 secret + freshness | secret per-credential wajib; freshness ±24 jam | `tests/pakasir-webhook-credential.test.ts` |
| H3 idempotency | state-aware `received`→`processed` | `0066`; `tests/webhook-direct.test.ts` |
| M1 IDOR storage | route storage tenant-scoped (404 cross-tenant) | `tests/parse-uuid-param.test.ts` |
| M2 adminRoute | guard admin di lapisan route | `tests/admin.test.ts` |

Deferred (known-issue, TIDAK diimplementasikan):

- L1 rate-limit in-memory (single-instance) → Redis/Upstash.
- M4 nomor migrasi duplikat/gap (`0024`, `0051`).
- M7 unbounded select (vouchers, photoboxes, staff, support-tickets, subscription devices).
- H7 god-components (`KioskBrandingEditor` ~1419, `TemplateBuilder` ~955, `KioskApp` ~722).
- P3 replay-window penuh (dedup event_id berbasis waktu) di luar window set-based.

## Backlog

- Bookings UI and booking endpoints.
- Event mode.
- Refund state machine.
- Formal Playwright end-to-end suite.
- Load test.
- Public REST subscription and add-on API.

## Removed or archived

| Item | Replacement or reason |
| --- | --- |
| Kiosk aggregator withdrawal flow | Direct merchant owner-first, voucher, and offline cash. |
| Owner withdrawal and balance flow | Removed in v1.8. Payment settles to owner gateway. |
| Dashboard-01 dual shell | Single Neo-Brutalist dashboard. |
| Owner CRUD REST routes | Server actions. |
| Supabase Realtime | Payment status polling every 3 seconds. |
| Hardware agent / Tauri kiosk / USB camera (gPhoto2) | Kiosk berjalan sebagai PWA dengan kamera internal; direktori `hardware-agent/`, `tauri-kiosk/`, `docs/hardware/` dihapus. |

## Reading rule

`Active` means code path exists and is intended for current use. `Partial` means only the stated subset is supported. `Backlog` means do not expose route or UI as available. `Archived` means historical context only.
