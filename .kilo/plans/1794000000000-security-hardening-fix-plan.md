# Plan: Security Hardening — C1 → C2/C4 → C3/H1 → H2/H3 → M1/M2

Status: ready-for-implementation
Audience: developer
Last updated: 2026-10-08
Source of truth: audit arsitektur 2026-10-08 (temuan terverifikasi, bukan spekulasi)

## Tujuan

Menutup 8 temuan audit berprioritas sesuai urutan yang diminta user. Setiap phase
menyertakan: file & line target, perubahan minimum, dan **test yang membuktikan**.
Tidak ada phase yang boleh dianggap selesai tanpa test hijau + `npm run typecheck`
+ `npm run lint`.

Aturan wajib (AGENTS.md):
- Uang integer IDR, tanpa floating point.
- Backend = source of truth harga/voucher/payment; frontend tidak dipercaya.
- `db/schema.sql` = kontrak DB. Migrasi forward-only, sertakan rollback untuk DDL destruktif.
- Lifecycle subscription HANYA lewat `isSubscriptionEffective()` (`src/lib/subscription-math.ts`).
- Neo-Brutalism satu-satunya bahasa visual UI.

## Prasyarat

1. Baseline hijau dulu: `npm run typecheck && npm run lint && npm test`. Commit baseline bila belum.
2. Konfirmasi lingkungan Supabase: apakah project diakses publik (anon key aktif di client)?
   Jika anon key TIDAK pernah dipakai client, RLS tetap wajib (defense-in-depth) tetapi
   blast radius lebih kecil.
3. Siapkan env test: `PAKASIR_WEBHOOK_SECRET`, satu business dengan credential direct merchant.

---

## PHASE 1 — C1 (CRITICAL): Enable RLS di semua tabel

**Temuan**: `db/schema.sql:49` — hanya 2/55 tabel punya `enable row level security`
(`auth_sessions:59`, `subscription_intent_failures:1731`). `payment_credentials.server_key_encrypted`,
`business_members.pin_hash`, `photoboxes.exit_pin_hash`, `transactions`, `payments` world-readable via PostgREST.

**Target perubahan**:
1. Buat migrasi baru `db/migrations/0064_enable_rls_all_tables.sql`:
   - Loop `alter table <t> enable row level security;` untuk SEMUA tabel `public.*`
     (kecuali dua yang sudah enable — idempoten dengan `alter table if exists`).
   - Untuk setiap tabel, `create policy svc_all on <t> for all to service_role using (true) with check (true);`
     dan `revoke all on <t> from anon, authenticated;` + `grant all on <t> to service_role;`
   - Ikuti pola persis `subscription_intent_failures` (`db/schema.sql:1731`): RLS ON + TANPA policy `to public`.
   - Rollback `db/migrations/0064_rollback.sql`: `drop policy if exists svc_all on <t>; alter table <t> disable row level security;`
2. Replikasi blok yang sama ke `db/schema.sql` (baseline harus mencerminkan migrasi; AGENTS.md §Resolusi Konflik).
3. Verifikasi TIDAK ada `create policy ... to public` / `to anon` / `to authenticated` di seluruh repo.

**Test**:
- `tests/rls-coverage.test.ts` (baru): baca `db/schema.sql`, ekstrak daftar `create table public.<t>`,
  assert setiap nama muncul pada baris `enable row level security`. Gagal bila ada yang terlewat.
- Manual (wajib dicatat di PR): dengan anon key, `select` dari `payment_credentials` harus 0 baris / permission denied.
- `npm test`.

**Definition of done**: migrasi + schema selaras, test RLS coverage hijau, anon tak bisa baca tabel bisnis.

---

## PHASE 2 — C2 + C4 (CRITICAL): Webhook invoice auth + offline-queue data loss

### C2 — Webhook invoice Pakasir tanpa autentikasi kriptografik
**Temuan**: `src/server/payment/invoice.ts:559-561` — `signatureValid = payment.provider_signature === null || ...`.
Karena `provider_signature` tak pernah ditulis, cabang ini SELALU lolos. Gate tunggal = header X-Secret
yang fallback ke satu `PAKASIR_WEBHOOK_SECRET` global (`src/app/api/webhooks/payment/pakasir/route.ts:52-57`).

**Target perubahan**:
1. `invoice.ts:559` — hapus short-circuit `=== null`. Bila `payment.provider_signature === null` maka
   signatureInvalid → JANGAN settlement lewat jalur signature; WAJIB lulus server-to-server re-verify
   (blok yang sudah ada di `invoice.ts:606-623`).
2. Wajibkan verifikasi `verifyPakasirPaid` untuk SEMUA invoice Pakasir sebelum `transitionToPaid`,
   tanpa pengecualian `credential_id is null` bila credential ada.
3. `route.ts:52-57` — bila `credential_id is not null` dan credential tidak punya `webhook_secret_encrypted`,
   TOLAK (jangan fallback ke secret global untuk settlement tenant).
4. Tambah test forgery: POST webhook invoice dengan order_id valid + `provider_signature` null +
   secret global yang benar, tetapi provider server-to-server mengembalikan "unpaid" → HARUS ditolak.

**Test**: `tests/pakasir-invoice-webhook.test.ts` (perluas) — kasus `signature null` + provider not-paid
harus `rejected`, bukan settled. `tests/pakasir-webhook-credential.test.ts` — tenant tanpa secret per-credential ditolak.

### C4 — Offline-queue terhapus tiap boot
**Temuan**: `src/components/kiosk/offline-queue.ts:85-88` `purgeLegacyDeviceTokenStore()`
memanggil `indexedDB.deleteDatabase("snapyos-kiosk")` — DB yang SAMA dengan antrian live
(`STORE="finalize-queue"`, `DB_VERSION=1`). Dipanggil tiap mount di `KioskApp.tsx:277`.

**Target perubahan**:
1. Ubah migrasi jadi sekali-jalan: flag `localStorage["snapyos_kiosk_migrated_v1"]`.
   Bila flag belum ada → jalankan purge → set flag. Bila sudah ada → no-op total (jangan sentuh DB).
2. `purgeOrphaned` (`offline-queue.ts:94-98`) tetap, tetapi hanya setelah drain selesai (bukan race dengan interval 30s).
3. Naikkan `DB_VERSION` bila skema berubah; pindahkan logika ke `onupgradeneeded`.

**Test**: `tests/kiosk-offline-queue.test.ts` (baru, logic-only via mock indexedDB/localStorage):
- Boot pertama → purge dipanggil sekali.
- Boot kedua (flag ada) → `deleteDatabase` TIDAK dipanggil.
- Item ter-enqueue → tetap ada setelah boot kedua.

**Definition of done**: webhook invoice fail-closed; antrian offline survive reload; kedua test hijau.

---

## PHASE 3 — C3 + H1 (CRITICAL/HIGH): Cash gate + RPC privilege lock

### C3 — Cash confirm tanpa gate subscription
**Temuan**: `src/server/cash-payment-actions.ts:10-16` → `src/server/cash-payment.ts:81`
tak memanggil `requireEffectiveSubscription()`.

**Target perubahan**:
1. `cash-payment-actions.ts:13` — setelah `requireActiveBusiness()`, tambah
   `await requireEffectiveSubscription(ctx.businessId, "write")` (import dari `src/server/require-subscription.ts`).
2. Bungkus dengan try/catch → return `{ ok:false, error }` bila `SUBSCRIPTION_EXPIRED` (konsisten pola action).
3. Audit: pastikan SEMUA action mutasi finansial lain (finance-actions, template-purchase-actions,
   subscription-actions) juga sudah/gate — daftar di temuan: hanya 7/12 file ter-gate. Tambahkan gate
   yang hilang di action yang menyentuh uang/sesi.

**Test**: `tests/subscription-gate.test.ts` (perluas) — confirm cash saat subscription expired → ditolak.

### H1 — RPC tidak di-lock ke service_role
**Temuan**: `db/schema.sql:558-631` `pos_complete_payment`, `pos_decrement_stock` (dan `storage_account_add/sub`,
RPC dashboard `0032/0037`) TANPA `revoke execute`/`grant to service_role`. RPC ini insert `transactions` —
callable via PostgREST anon/authenticated.

**Target perubahan**:
1. Migrasi `db/migrations/0065_lock_priviledged_rpcs.sql` (dan rollback): untuk setiap RPC yang belum:
   `revoke execute on function <sig> from public, anon, authenticated; grant execute on function <sig> to service_role;`
   Signature lengkap (tipe argumen persis) — jangan asal nama.
2. Sinkronkan ke `db/schema.sql`.
3. Audit semua `create function` — daftar lengkap + status lock, pastikan tak ada yang terlewat.

**Test**: `tests/rpc-privilege.test.ts` (baru) — grep schema untuk tiap `create function` assert ada
blok revoke/grant setelahnya (pola konsisten `settle_paid_payment_atomically`).
Manual: panggil `pos_complete_payment` via anon key → harus denied.

**Definition of done**: cash ter-gate; semua RPC finansial service_role-only; test hijau.

---

## PHASE 4 — H2 + H3 (HIGH): Secret per-credential + idempotency ordering

### H2 — Secret webhook global lintas-tenant
**Temuan**: `src/app/api/webhooks/payment/pakasir/route.ts:52-57` + `src/server/payment/webhook-handler.ts:203-228`.
Fallback ke satu secret platform bila credential tak punya `webhook_secret_encrypted`.

**Target perubahan**:
1. Enforcement: settlement tenant (`credential_id is not null`) WAJIB secret per-credential terdekripsi;
   fallback global hanya untuk alur legacy aggregator/invoice platform (dokumentasikan jelas).
2. Tambah validasi freshness: tolak webhook dengan timestamp/`payment_date` di luar jendela (mis. ±24 jam),
   bila provider mengirim timestamp.
3. Tambah `event_id` replay window berbasis waktu (bukan hanya exact-match dedup) bila provider punya event id.

**Test**: `tests/pakasir-webhook-credential.test.ts` (perluas) — tenant tanpa secret per-credential ditolak;
webhook stale ditolak.

### H3 — Idempotency dipersist sebelum verify provider
**Temuan**: `src/server/payment/webhook-handler.ts:324-347`, `src/lib/direct-webhook.ts:131-140`.
Event ditandai `processed` sebelum re-verify; bila verify gagal, retry di-swallow (`webhook-log.ts:32`)
→ paid tak tersettle tanpa jalur retry.

**Target perubahan**:
1. Persist status non-authoritative dulu (`received`), promote ke `processed` HANYA setelah
   `transitionToPaid` sukses. Tambah kolom/enum status bila perlu (migrasi forward-only + rollback).
2. Ubah deteksi duplikat agar sadar-status: baris `provider_not_paid` TIDAK memblokir retry redelivery.
3. Pastikan recovery polling (`qris.ts`, `invoice.ts`) tetap jadi jaring terakhir — jangan dihapus.

**Test**: `tests/payment-atomicity.test.ts` (perluas) — event verify-gagal tetap bisa di-redeliver & settle;
event sudah `processed` tidak double-settle.

**Definition of done**: secret per-credential wajib; idempotency state-aware; test hijau.

---

## PHASE 5 — M1 + M2 (MEDIUM): IDOR storage + adminRoute wrapper

### M1 — IDOR kuota storage
**Temuan**: `src/app/api/v1/business/[businessId]/storage/route.ts:5-9` — `authRoute` hanya auth;
`getStorageUsage(businessId)` (`src/server/storage-usage.ts:256`) tanpa `getMembership`. User tenant mana pun baca kuota tenant lain.

**Target perubahan**:
1. Di handler, ambil `user` dari ctx (`authRoute` sudah inject), panggil `getMembership(user.id, businessId)`;
   bila null → `throw new ApiError("NOT_FOUND", ...)` (404, bukan 403 — AGENTS.md cross-tenant = 404).
2. Tambah cek `can(role, "business:read")`.
3. Pertimbangkan guard di primitive `getStorageUsage`/`getStorageLimit`/`getBusinessUsedBytes` (komentar
   "internal-only, businessId harus server-derived") atau buat wrapper ber-membership.

**Test**: perluas test API — user tenant A akses storage tenant B → 404.

### M2 — apiRoute tanpa auth; admin route tanpa guard lapisan route
**Temuan**: `src/lib/api-route.ts:55-66` `apiRoute` TIDAK auth; route `/api/v1/admin/*` aman hanya karena
callee kebetulan `requireAdmin()`.

**Target perubahan**:
1. Buat `adminRoute` wrapper di `src/lib/api-route.ts` (atau `src/server/admin/route.ts`) yang memanggil
   `requireAdmin()` sebelum handler, dengan envelope + error handling konsisten.
2. Migrasikan semua route `/api/v1/admin/*` yang saat ini pakai `apiRoute`/handler mentah ke `adminRoute`.
3. Beri komentar tegas pada `apiRoute`: "TIDAK ADA AUTH — caller WAJIB guard."
4. Opsional: `adminRawRoute` untuk endpoint non-JSON.

**Test**: `tests/admin.test.ts` (perluas) — route admin tanpa session admin → 401/403; dengan admin → ok.
`tests/parse-uuid-param` / API inventory test — assert semua route `/api/v1/admin/*` memakai `adminRoute`.

**Definition of done**: IDOR storage tertutup; admin guard ada di lapisan route; test hijau.

---

## Verifikasi akhir (semua phase)

```
npm run typecheck
npm run lint
npm test
```
- Update `docs/` (lihat prompt dokumentasi terpisah: `.kilo/plans/1795000000000-docs-update-after-hardening.md`).
- Pre-flight checklist `docs/13` §13.6 sebelum declare done.
- Satu commit per phase, pesan konvensional (`fix(security): ...` / `feat(security): ...`).

## Urutan dependensi

C1 (RLS) harus lebih dulu — ia menutup blast radius C2/H1 (eksposur PostgREST).
C2 & C4 independen, bisa paralel. C3 & H1 sebaiknya setelah C1. H2 & H3 setelah C2.
M1 & M2 terakhir.

## Done / Deferred

- **In scope**: 8 temuan + test + sinkronisasi schema + docs.
- **Deferred** (catat di docs sebagai known-issue, jangan implementasi di sini):
  rate-limit down ke Redis (L1), replay-window penuh, rate-limit storage (`getStorageUsage` reconcile-on-read),
  nomor migrasi duplikat (M4), unbounded select (M7), god-components (H7).
