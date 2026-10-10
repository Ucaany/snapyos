# Plan: Update Seluruh Docs Setelah Security Hardening

Status: ready-for-implementation
Audience: developer
Last updated: 2026-10-08
Source of truth: `.kilo/plans/1794000000000-security-hardening-fix-plan.md` + audit 2026-10-08

## Tujuan

Mendokumentasikan setiap perubahan dari plan hardening agar docs = kenyataan kode
(AGENTS.md §Resolusi Konflik: kode berjalan menang, docs harus dicerminkan).

## Aturan penulisan docs (AGENTS.md / docs/README.md §Format Halaman)

- Setiap dokumen aktif pakai metadata:
  ```md
  Status: active | partial | backlog | archive
  Audience: owner | staff | admin | developer | operator
  Last updated: YYYY-MM-DD
  Last verified: YYYY-MM-DD
  Source of truth: code path, schema, atau dokumen canonical
  ```
- Update `Last updated` + `Last verified` ke tanggal implementasi.
- Changelog: tambah baris baru di `docs/README.md` §Changelog Keputusan Terbaru (versi berikutnya, mis. 1.15).
- Nama entity konsisten: `business_members` (bukan `staff_roles`), `transactions` = source of truth finansial,
  `payments` = detail settlement; error `SESSION_EXPIRED` = HTTP 410.
- Bahasa: Indonesia teknis. Jangan hapus klaim benar lama; perbaiki yang jadi tidak akurat.

## File docs yang WAJIB di-update (petakan per phase)

### Phase 1 — C1 RLS
- `docs/09-security-storage.md`
  - §9.1 Prinsip: tambah butir "RLS enabled on all tables; policy service_role-only".
  - Ganti baris "RLS `auth_sessions`" di §Status Implementasi → "RLS di semua tabel (migrasi 0064)".
  - Dokumentasikan model akses: service-role bypass RLS → scoping di kode (sudah ada), PLUS RLS sebagai jaring PostgREST.
- `docs/03-architecture.md`: di bagian DB/Supabase, catat RLS-on + policy service_role + revoke anon/authenticated.
- `docs/07-database-schema.md`: tambah catatan "semua tabel public: RLS on, policy `svc_all` to service_role".
- `docs/README.md`: changelog.

### Phase 2 — C2 + C4
- `docs/06-checkout-payment.md`: dokumentasikan webhook invoice Pakasir WAJIB server-to-server verify;
  `provider_signature` null TIDAK lagi auto-pass; secret per-credential.
- `docs/09-security-storage.md`:
  - §webhook: koreksi klaim "webhook signature + idempotency" → rinci (signature Midtrans/Tripay timing-safe;
    Pakasir X-Secret; invoice Pakasir re-verify).
  - Tambah "secret webhook per-tenant; fallback global hanya aggregator/invoice platform".
- `docs/05-customer-photobox.md` §5.1b offline: dokumentasikan migrasi sekali-jalan antrian IndexedDB +
  flag `snapyos_kiosk_migrated_v1`; antrian survive reload (koreksi tradeoff lama "reload kehilangan finalize").
- `docs/08-api-spec.md`: webhook invoice — syarat auth & idempotency state-aware.

### Phase 3 — C3 + H1
- `docs/02-business-subscription.md` §2.4: dokumentasikan bahwa SEMUA mutasi finansial (termasuk konfirmasi
  tunai kiosk) gated `requireEffectiveSubscription` / `isSubscriptionEffective()`.
- `docs/09-security-storage.md`: tambah §RPC privilege — semua RPC finansial `revoke execute from public,anon,authenticated`
  + `grant to service_role`; sebut `pos_complete_payment`, `storage_account_add/sub`, RPC dashboard 0032/0037.
- `docs/07-database-schema.md`: daftar RPC + status privilege.
- `docs/pos/07-security.md`: sinkronkan untuk RPC POS (`pos_complete_payment`, `pos_decrement_stock`).

### Phase 4 — H2 + H3
- `docs/06-checkout-payment.md`: dokumentasikan model secret per-credential + freshness/replay window +
  status webhook `received` → `processed` (state-aware idempotency).
- `docs/08-api-spec.md`: enum/status webhook event bila berubah + aturan retry.
- `docs/09-security-storage.md`: §webhook diperbarui.
- `docs/07-database-schema.md`: kolom/enum status webhook baru (migrasi).

### Phase 5 — M1 + M2
- `docs/08-api-spec.md`:
  - `/api/v1/business/:businessId/storage` — tambah syarat membership + 404 cross-tenant.
  - Semua `/api/v1/admin/*` — dokumentasikan `adminRoute` (guard di lapisan route).
- `docs/09-security-storage.md`: catat `apiRoute` TIDAK auth (caller guard) vs `authRoute`/`adminRoute` (auth).
- `docs/10-admin-platform.md`: catat enforcement admin di route + data layer (defense-in-depth).

### Cross-cutting
- `docs/status.md`: tandai item hardening selesai + tanggal.
- `docs/README.md`: changelog versi berikutnya merangkum 8 fix + status migrasi 0064/0065.
- `docs/glossary.md`: tambah istilah (RLS policy `svc_all`, `requireEffectiveSubscription`, `adminRoute`,
  webhook state `received`/`processed`) bila belum ada.
- `docs/03-architecture.md`: bila ada diagram/daftar middleware, tambahkan `src/proxy.ts` (maintenance-only,
  bukan RBAC) — sudah disebut di docs/09, pastikan konsisten.

## Test docs (verifikasi klaim)

- Grep konsistensi: setiap klaim "RLS di semua tabel" harus cocok dgn `tests/rls-coverage.test.ts`.
- Pastikan tidak ada docs yang masih bilang "provider_signature null → skip validasi" setelah C2.
- Pastikan `docs/05` tidak lagi menyatakan "reload penuh kehilangan finalize" setelah C4.
- Pastikan `docs/08` mendaftar `adminRoute` untuk tiap route `/api/v1/admin/*` yang nyata di `src/app/api`.

## Definition of done

1. Semua file di atas di-update dengan metadata tanggal baru.
2. `docs/README.md` changelog punya entri versi baru.
3. Tidak ada inkonsistensi antara docs dan `db/schema.sql` + `src/**` (spot-check path yang disebut).
4. Satu commit `docs: document security hardening (C1–M2)`.

## Catatan known-issue (dokumentasikan, JANGAN implementasi di sini)

Sebutkan di `docs/status.md` sebagai deferred:
- L1 rate-limit in-memory (single-instance) → Redis/Upstash.
- M4 nomor migrasi duplikat/gap (0024, 0051).
- M7 unbounded select (vouchers, photoboxes, staff, support-tickets, subscription devices).
- H7 god-components (KioskBrandingEditor 1419, TemplateBuilder 955, KioskApp 722).
- P3 replay-window penuh (bila belum dituntaskan di Phase 4).
