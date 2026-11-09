# 10. SnapyOS Platform Admin

> **CATATAN (2026-10-16):** seluruh alur penarikan saldo (`withdrawals`, `balances`,
> `balance_ledger`, halaman `/admin/withdrawals`, `processWithdrawal`/`rejectWithdrawal`,
> setelan `withdrawal_days`/`withdrawal_sla_hours`) **sudah dihapus** oleh migrasi
> `0044_drop_withdrawal_flow.sql` — lihat `docs/14-settlement-withdrawal.md`.
> Penyebutan withdrawal di changelog di bawah adalah **catatan historis** audit
> 2026-09-16, bukan status terkini.

## Status Implementasi (audit 2026-09-16)

SESUAI (inti): dashboard admin lengkap (overview, users, businesses, plans, subscriptions, add-ons, **promos**, templates, payments + summary, settings), overview MRR/metrics, suspend/reactivate business.

EKSTRA (audit 2026-09-16, semua sudah terdokumentasi):

- `createUser`/`deleteUser` admin (REST + UI).
- Platform settings `withdrawal_days` (multi-hari), `withdrawal_sla_hours`.
- `maintenance_mode` di-**enforce** di middleware (bukan hanya display).
- Subscription Promos CRUD (§10.2 baru, tabel `subscription_promos` migration 0014).
- Template global create/upload (owner + FK `templates.category_id`, migration 0039).
- POS revenue per tenant (§10.3 payments summary).

BELUM: —

## Changelog 2026-09-16 (Audit Admin Dashboard)

- **Fase 1** — Dead code:
  - Hapus `getTemplateUsageStats` (0 caller).
  - Normalize style `admin/withdrawals/page.tsx`.
- **Fase 2A** — Drop tabel `reports` (0 query, migration 0038).
- **Fase 2B** — Bangun UI + REST `/admin/promos` untuk `subscription_promos`.
- **Fase 2C** — Next.js Proxy `src/proxy.ts` + halaman `/maintenance` (503) untuk enforce `platform_settings.maintenance_mode`. Flag dibaca fresh per request (fail-closed saat DB error).
- **Fase 2D** — Migration 0039: `templates.category_id` FK ke `template_categories`. Drop CHECK enum; kolom `category` text kept as display fallback (deprecated).
- **Fase 2E** — REST endpoint baru: `DELETE /admin/users/:id`, `POST /admin/subscriptions/:id/add-ons`, `DELETE /admin/subscription-add-ons/:id`, `GET /admin/payments/pos-revenue`, `GET/POST /admin/templates` + `:id`, `GET/POST /admin/template-categories` + `DELETE :id`, `GET/POST /admin/promos` + `PATCH :id`.
- **Fase 3** — Bug fix:
  - K1: Form Create Plan sekarang menerima `features` + `is_active` (sebelumnya plan baru "kosong fitur").
  - K2: `withdrawal_days` multi-day (7 checkbox Min–Sab), bukan single input.
  - K3: `payments` provider filter → `<select>` enum.
  - K4: Form upload template global baru + `createGlobalTemplateAction`.
  - K5: `getBusinessUsage()` sekarang guard `requireAdmin()`.
  - K6: `GET /admin/businesses/:id` return 404 untuk ID tak dikenal.
  - K7: `rejectWithdrawal` tidak lagi bocorkan `db_code`/`db_message` ke client.
  - K8: `processWithdrawal` menulis `balance_ledger` entry (`type=debit source=withdrawal`), simetri dengan reject.
- **Fase 4** — Komponen shared `<BrutalistSelect>` + `<BrutalistCheckbox>`. Refactor `users/subscriptions/payments/withdrawals/settings/promos/templates`. Pagination `<a>` → `next/link` di semua halaman admin.

## 10.1 Overview

Admin SnapyOS memiliki dashboard terpisah untuk mengelola platform.

**Metrics:**

- Total businesses
- Active subscribers
- Total subscriptions
- Monthly recurring revenue (MRR)
- Total outlets
- Total Photobox
- Total sessions
- Total transactions

## 10.2 Management Modules

| Modul                  | Kemampuan                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users                  | list, detail, suspend/reactivate, ubah role admin, **create/delete** (pendaftaran mandiri publik ditutup)                                                     |
| Businesses             | list, detail, suspend/reactivate, lihat subscription & usage                                                                                                  |
| Plans                  | create/edit price, billing cycle, limits (incl. `max_concurrent_sessions`), **feature flags + is_active langsung saat create**, platform fee, active/inactive |
| Add-ons                | create/edit add-on (harga, unit), active/inactive                                                                                                             |
| Promos                 | create/edit `subscription_promos` (kode diskon plan-level, %/fixed, jadwal, batas pemakaian)                                                                  |
| Subscriptions          | list (detail periode/trial/invoice), ubah status, perpanjang, cancel, kelola add-on aktif                                                                     |
| Templates & Categories | kelola template global (`business_id NULL`) + upload URL frame/thumbnail/video + FK `category_id` + **harga/premium (jualan)**                                |
| Katalog Aplikasi       | daftar rilis installer booth sebagai **tautan** (Google Drive/host lain), ukuran + SHA-256 opsional diisi manual, aktif/nonaktif, hapus baris                 |
| Payment Gateways       | overview credential seluruh tenant (redacted) + **enable/disable global per provider** (`gateway_*_enabled`)                                                  |
| Audit Log              | view seluruh `audit_logs` + filter aksi/search + **hapus riwayat (retensi)**                                                                                  |
| Platform settings      | konfigurasi global (fee, retention default, maintenance_mode + **maintenance_message kustom**, gateway toggle, dll.)                                          |

## 10.3 Payment Monitoring

Admin melihat:

- Payment volume
- Successful payments
- Failed payments
- Pending payments
- Expired payments
- Refunds
- Payment provider breakdown

Jika SnapyOS mengenakan **platform fee** (per plan, configurable), admin melihat:

- Gross payment volume
- Platform fee
- Net amount

Rincian **per tenant** tersedia: tabel `Gross / Fee / Net per Tenant` menghitung
fee per bisnis sesuai policy fee plan aktif, lalu net = gross − fee.

**API:** `GET /api/v1/admin/payments?status=&provider=&from=&to=` + summary endpoint.
`provider` menerima `pakasir`, `midtrans`, `tripay` (direct merchant + aggregator).

**Data:** agregasi `payments` (semua tenant) + `payment_webhooks` untuk integritas.

## 10.3b Payout / Withdrawal Monitoring

Admin memproses penarikan (dana aggregator → rekening owner):

- Daftar `withdrawals` seluruh tenant (filter status: `pending`/`processing`/`paid`/`rejected`/`failed`).
- **Process:** tandai `processing` → lakukan transfer → `paid` (input `reference`).
- **Reject:** kembalikan saldo ke `available`.
- Semua aksi tercatat di `audit_logs`.

**API:** `GET /api/v1/admin/withdrawals`, `POST .../process`, `POST .../reject`.

## 10.4 Platform Settings

Contoh key di `platform_settings`:

```json
{
  "platform_fee_percent": 0,
  "platform_fee_flat": 0,
  "default_retention_days": 3,
  "trial_days": 14,
  "maintenance_mode": false,
  "maintenance_message": "Platform sedang perawatan sistem. Coba lagi beberapa saat.",
  "min_withdrawal_amount": 10000,
  "withdrawal_days": [0, 1, 2, 3, 4, 5, 6],
  "withdrawal_sla_hours": 24,
  "gateway_pakasir_enabled": true,
  "gateway_midtrans_enabled": true,
  "gateway_tripay_enabled": true
}
```

**`maintenance_mode` enforcement (audit 2026-09-16, diperbarui audit lintas-potong):**
Proxy `src/proxy.ts` (Next 16 rename dari `middleware`, Node runtime)
membaca flag langsung dari DB setiap request (`src/lib/maintenance.ts`,
`getMaintenanceState()`), tanpa cache lintas-request. Saat
`true`: non-admin diblokir — browser rewrite ke `/maintenance` (503),
API `/api/*` return JSON `MAINTENANCE_MODE` (503, `Retry-After: 60`).
Saat pembacaan flag gagal (DB error), proxy fail-closed: 503 untuk trafik
non-allowlist, sementara jalur operasional tetap lolos.
Allowlist selalu lolos: `/admin/*`, `/login`, `/api/health`, `/api/auth/*`,
`/api/webhooks/*` (settlement in-flight jangan diblokir).

## 10.5 Security (Admin)

- Hanya user dengan `role = admin` (atau email di `ADMIN_EMAILS`).
- **Enforcement dua lapis (M2, hardening 2026-10-08):** (1) lapisan **route** — semua `/api/v1/admin/*` dibungkus `adminRoute`/`adminRawRoute` yang memanggil `requireAdmin()` sebelum handler; (2) lapisan **data** — fungsi `*Guarded`/`requireAdmin()` di `src/server/admin/guard.ts` dan callee (mis. `getBusinessUsage()`). Route tanpa session admin → `401`; role salah → `403`. `apiRoute` polos TIDAK auth (caller WAJIB guard).
- Semua aksi admin dicatat ke `audit_logs`.
- Suspended business tidak bisa membuat sesi/checkout baru (dicek server-side).
- `getBusinessUsage()` guard `requireAdmin()` (K5 audit 2026-09-16).
- `rejectWithdrawal`/`processWithdrawal` tidak membocorkan `db_code`/`db_message` ke client (K7 audit 2026-09-16).

## 10.6 Support Tickets (bantuan lintas tenant)

Admin meninjau tiket bantuan yang dikirim owner (lihat `04-owner-dashboard.md` §4.20):

- Daftar `support_tickets` seluruh tenant (filter `status`: `open`/`needs_action`/`resolved`).
- Ubah status tiket: `open` → `needs_action` → `resolved` (aksi tercatat di `audit_logs`).
- Status `resolved` mengisi `resolved_at`; status lain menghapusnya.

**Data:** tabel `support_tickets` + `support_ticket_replies` (migration 0050).

**UI:** `/admin/support` — tabel tiket dengan dropdown status inline per baris.
