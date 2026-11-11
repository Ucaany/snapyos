# SnapyOS Documentation

SnapyOS Photobox Business Operating System.

> Status: active. Audience: owner, staff, admin, developer, operator. Last updated: 2026-10-08. Last verified: 2026-10-08. Source of truth: running code, `db/schema.sql`, then active references in this directory.

## Mulai

| Kebutuhan                | Dokumen                                                | Hasil                                                             |
| ------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------- |
| Memahami produk          | [`01-product-overview.md`](./01-product-overview.md)   | Ruang lingkup, pengguna, tujuan, batasan                          |
| Menyiapkan development   | [`03-architecture.md`](./03-architecture.md)           | Route, tenancy, data access, struktur kode                        |
| Menjalankan local setup  | [`../README.md`](../README.md)                         | Install, environment, script, cron                                |
| Memahami status fitur    | [`status.md`](./status.md)                             | Aktif, sebagian, backlog, arsip                                   |
| Memahami istilah         | [`glossary.md`](./glossary.md)                         | Vocabulary canonical                                              |

## Referensi API

| Topik                | Dokumen                                              | Cakupan                                    |
| -------------------- | ---------------------------------------------------- | ------------------------------------------ |
| Konvensi API         | [`08-api-spec.md`](./08-api-spec.md)                 | Envelope, auth, error, rate limit          |
| API aktif per route  | [`api/README.md`](./api/README.md)                   | Request, response, validation, error       |
| Checkout dan webhook | [`06-checkout-payment.md`](./06-checkout-payment.md) | Direct merchant, voucher, offline cash     |
| Database             | [`07-database-schema.md`](./07-database-schema.md)   | Entity, enum, constraint, index            |

## Konsep Produk

| Topik                    | Dokumen                                                        |
| ------------------------ | -------------------------------------------------------------- |
| Architecture dan route   | [`03-architecture.md`](./03-architecture.md)                   |
| Owner dashboard          | [`04-owner-dashboard.md`](./04-owner-dashboard.md)             |
| Customer kiosk           | [`05-customer-photobox.md`](./05-customer-photobox.md)         |
| Subscription dan billing | [`02-business-subscription.md`](./02-business-subscription.md) |
| Admin platform           | [`10-admin-platform.md`](./10-admin-platform.md)               |
| Design system            | [`11-design-system.md`](./11-design-system.md)                 |
| Template builder         | [`15-template-builder.md`](./15-template-builder.md)           |

## Integrasi

| Topik                    | Dokumen                                              |
| ------------------------ | ---------------------------------------------------- |
| POS add-on               | [`pos/01-architecture.md`](./pos/01-architecture.md) |
| Flow owner, staff, admin | [`flow-maps/00-INDEX.md`](./flow-maps/00-INDEX.md)   |

## Status Dokumen

- Dokumen produk aktif tetap harus dibandingkan dengan kode dan schema sebelum perubahan.
- API aktif dipisahkan dari route yang telah dihapus.
- POS add-on terimplementasi dan memakai server actions, bukan REST owner.
- Dokumen arsip: [`14-settlement-withdrawal.md`](./14-settlement-withdrawal.md), serta kontrak legacy yang diberi banner arsip.

## Cara Membaca

1. Buka `status.md` untuk mengetahui fitur aktif.
2. Buka `glossary.md` sebelum menulis endpoint, schema, UI copy, atau migration.
3. Untuk backend, cek `db/schema.sql` sebelum PRD.
4. Untuk route, cek `api/README.md` dan `08-api-spec.md`.
5. Untuk UI, cek `DESIGN.md`, `11-design-system.md`, dan `13-skill-anti-slop.md`.

## Source of Truth

Urutan resolusi konflik:

1. Kode berjalan di `src/`.
2. `db/schema.sql` dan migration aktif.
3. Dokumen API aktif.
4. PRD produk.
5. Dokumen design system.
6. Dokumen audit dan arsip sebagai konteks sejarah.

Uang selalu integer IDR. `transactions` adalah source of truth laporan finansial. `payments` adalah detail settlement provider. Lifecycle subscription memakai `isSubscriptionEffective()`.

## Format Halaman

Dokumen aktif memakai metadata berikut:

```md
Status: active | partial | backlog | archive
Audience: owner | staff | admin | developer | operator
Last updated: YYYY-MM-DD
Last verified: YYYY-MM-DD
Source of truth: code path, schema, atau dokumen canonical
```

Dokumen prosedural mengikuti urutan: ringkasan, prasyarat, langkah, expected result, error dan recovery, referensi.

## Changelog Keputusan Terbaru

| Versi | Keputusan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.20  | Bersih-bersih 2026-11-11: artefak audit (`.audit-out/`, `.audit-security/`), cache `.vercel/`, `tsconfig.tsbuildinfo`, skrip PowerShell packaging Windows, `docs/16-feature-map-audit.md`, dan `docs/18-audit-report.md` dihapus. Tabel Supabase tak terpakai (`bookings`, `device_logs`, `event_templates`, `package_templates`, `stickers`) di-drop lewat migrasi `0085`. |
| 1.19  | Tests suite dihapus (2026-11-11): `tests/`, `AUDIT-REPORT.md`, dan artefak audit dibersihkan; gate CI tinggal lint + typecheck + build. |
| 1.18  | Design Builder per booth dipulihkan (2026-11-08): `/dashboard/branding` kembali sebagai builder (bukan redirect), cakupan booth/global, override `photoboxes.branding`, reset inherit, upload logo/video per booth, pratinjau in-page memakai komponen kiosk asli. Merge branding disatukan di `src/lib/branding-merge.ts`; kontras divalidasi pada branding efektif. `/dashboard/devices` tetap pairing/diagnostik.                                                                                                                                                                                     |
| 1.17  | Rate limiter kembali **in-memory per proses** (2026-10-17): backend shared Upstash dihapus dari `src/lib/rate-limit.ts` beserta perilaku fail-closed di production yang membuat semua login ditolak saat `UPSTASH_*` kosong. Env `UPSTASH_*` dihapus dari `.env.example`; `tests/rate-limit-production-fallback.test.ts` dihapus. Konsekuensi didokumentasikan: limit efektif = limit × jumlah instance di deployment multi-instance.                                                                                                                                                                    |
| 1.16  | Security hardening (audit 2026-10-09): `next` di-upgrade ke ^16.3.8 (RCE next/og, SSRF image opt, cache poisoning SSG/ISR → 0 critical), `xlsx` (prototype pollution + ReDoS, no-fix) diganti `exceljs` (generate-only), injeksi key storage via `page` kiosk ditutup (`KIOSK_PAGE_IDS` allowlist + guard path-traversal `r2Key`), SVG dihapus dari allowlist logo, rate limiter pindah ke backend shared opsional (Upstash) + fallback in-memory (fail-closed prod), secret webhook Pakasir dikonfirmasi timing-safe, aturan amount `final_amount` vs `total_amount`+admin fee Tripay didokumentasikan. |
| 1.15  | Security hardening C1–M2: RLS semua tabel (0064), webhook invoice fail-closed + secret per-credential + freshness (C2/H2), cash gate subscription (C3), offline queue survive reload (C4), RPC service_role-only (0065, H1), idempotency state-aware `received`→`processed` (0066, H3), IDOR storage 404 (M1), `adminRoute` guard (M2).                                                                                                                                                                                                                                                                  |
| 1.14  | Kiosk tablet PWA selesai: icon PNG installable + SW offline, facingMode per booth, print presisi (ukuran/orientasi/margin/salinan/auto-print), panduan printer tablet jujur, exit-PIN iPad + safe-area.                                                                                                                                                                                                                                                                                                                                                                                                  |
| 1.13  | Kiosk lock penuh, orientasi per booth, auto-restart error boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 1.12  | Kiosk tablet memakai PWA dan kamera browser.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 1.10  | Profil bisnis dan storage add-on ditambahkan.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 1.9   | Support ticket owner dan monitoring payment per tenant ditambahkan.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 1.8   | Withdrawal kiosk dihapus; branding override per booth ditambahkan.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 1.7   | Direct merchant owner-first, voucher, dan offline cash menjadi metode kiosk.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 1.4   | Dashboard tunggal brutalist; Dashboard-01 dihapus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 1.1   | Customer flow resmi menjadi pay-first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Detail perubahan ada di git history dan dokumen fitur terkait. Jangan memakai changelog ini sebagai pengganti kontrak aktif.

## Arsip dan Referensi Internal

- [`13-skill-anti-slop.md`](./13-skill-anti-slop.md): kebijakan engineering internal untuk anti-slop.
- [`component-contract.md`](./component-contract.md): kontrak komponen UI.
- [`12-roadmap-mvp.md`](./12-roadmap-mvp.md): roadmap dan acceptance criteria (rujukan `tests/` di dalamnya historis).
- [`pos/`](./pos/): referensi POS add-on.
