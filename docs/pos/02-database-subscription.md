# POS Add-on — Phase 2: Database & Subscription (REVISI v2)

> Status: **SELESAI — dieksekusi 2026-08-28.**
> Prasyarat: `docs/pos/01-architecture.md` REVISI v2 disetujui.
> Revisi v2: pembayaran offline-only + per-booth + tanpa role baru → **tanpa sentuhan ke `payments`, `business_members`, atau NOT NULL apa pun**. Migration renumber ke `0019` (0018 sudah terpakai `member-photoboxes`).
> Prinsip migration: additive-only, reversible, idempotent seed, tanpa mengubah data existing.

---

## Status Eksekusi

Dieksekusi 2026-08-28. Yang jadi, sesuai DDL §2:

- `db/migrations/0019_pos_addon.sql` applied + `0019_pos_addon_rollback.sql` tersedia: 3 tabel `pos_products`/`pos_orders`/`pos_order_items`, `photoboxes.pos_enabled`, kolom `transactions.pos_order_id`/`cashier_user_id`, seed `add_ons code='pos'` (`on conflict do nothing`).
- Entitlement gate: `src/server/pos-entitlement.ts` (`hasPosEntitlement`, `requirePosAccess`) + evaluator pure `src/lib/pos-entitlement.ts` (`evaluatePosEntitlement`) — diekstrak ke lib agar unit-testable tanpa DB (deviasi kecil dari §4, tanpa ubah kontrak).
- RBAC: `pos:manage/sell/read` untuk manager + `pos:sell/read` untuk staff di `src/lib/rbac.ts` — tanpa role baru, tanpa perubahan DB role.
- Validator POS di `src/lib/validators.ts` (posProduct/posOrderCreate/posManualPay/posBoothToggle); error POS di `src/lib/api-errors.ts`.
- Test: `tests/pos-entitlement.test.ts`, `tests/pos-validators.test.ts`, extend `tests/rbac.test.ts`.
- `db/schema.sql` baseline disinkronkan (49 tabel).
- Terverifikasi: nol diff di `payments`/`business_members`/`checkout_sessions` (S11 — docs/pos/07 §4).

---

## Daftar Isi

1. Objective & Scope
2. DDL Lengkap — `db/migrations/0019_pos_addon.sql`
3. Baseline Sync — `db/schema.sql`
4. Kode: Entitlement Gate
5. Kode: RBAC & Validator
6. UI Subscription Existing (nol perubahan kode — verifikasi)
7. Security
8. Testing
9. Risk & Mitigasi
10. Rollback
11. Acceptance Criteria

---

## 1. Objective & Scope

- Migration `0019_pos_addon.sql`: 3 tabel baru (`pos_products`, `pos_orders`, `pos_order_items`), kolom `photoboxes.pos_enabled`, kolom additive `transactions.pos_order_id` + `transactions.cashier_user_id`, seed `add_ons` `code='pos'`.
- Kode: `src/server/pos-entitlement.ts` (gate tunggal), update `src/lib/rbac.ts` + `src/lib/validators.ts` + `src/lib/api-errors.ts`.
- **TIDAK ada**: perubahan `payments`/`checkout_sessions` (POS offline-only tidak menyentuh payment existing), perubahan CHECK `business_members.role` (tanpa role baru — A6), relax NOT NULL `transactions` (outlet_id & photobox_id selalu terisi dari booth — A13), endpoint POS, halaman POS (Phase 3).

---

## 2. DDL Lengkap — `db/migrations/0019_pos_addon.sql`

```sql
-- 0019_pos_addon.sql — POS add-on v2 offline-only, per-booth (docs/pos/02).
-- Additive-only. Reversible (lihat rollback di docs/pos/02 §10).
-- TIDAK menyentuh payments / business_members / NOT NULL existing.

-- ============================================================================
-- 1. Tabel POS
-- ============================================================================

create table pos_products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  name text not null,
  sku text,
  category text not null default 'lainnya',
  description text,
  price integer not null check (price > 0),
  cost integer check (cost is null or cost >= 0),
  stock integer check (stock is null or stock >= 0),  -- NULL = tidak ditrack
  is_active boolean not null default true,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_products_business_sku_key unique (business_id, sku)
);
create index idx_pos_products_business on pos_products (business_id, is_active);
create trigger trg_pos_products_updated_at before update on pos_products
  for each row execute function set_updated_at();

create table pos_orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  photobox_id uuid not null references photoboxes (id) on delete restrict,  -- per-booth (A13)
  outlet_id uuid references outlets (id) on delete set null,                -- diisi dari photobox.outlet_id
  cashier_user_id uuid not null references users (id) on delete restrict,   -- staff/manager/owner yang menjual
  customer_id uuid references customers (id) on delete set null,
  number text not null,                                                     -- POS-YYYYMMDD-#### zona Asia/Jakarta (A14)
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled')),                     -- TANPA 'expired' (A15)
  gross_amount integer not null check (gross_amount >= 0),
  discount_amount integer not null default 0 check (discount_amount >= 0),
  final_amount integer not null check (final_amount >= 0),
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'bank_transfer', 'other')),           -- offline-only (A2)
  payment_reference text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pos_orders_business_number_key unique (business_id, number),
  constraint pos_orders_amounts_valid check (final_amount = gross_amount - discount_amount)
);
create index idx_pos_orders_business_status on pos_orders (business_id, status);
create index idx_pos_orders_business_paid on pos_orders (business_id, paid_at) where status = 'paid';
create index idx_pos_orders_cashier on pos_orders (business_id, cashier_user_id);
create index idx_pos_orders_photobox on pos_orders (photobox_id);
create trigger trg_pos_orders_updated_at before update on pos_orders
  for each row execute function set_updated_at();

create table pos_order_items (
  id uuid primary key default gen_random_uuid(),
  pos_order_id uuid not null references pos_orders (id) on delete cascade,
  pos_product_id uuid references pos_products (id) on delete set null,
  name_snapshot text not null,
  sku_snapshot text,
  unit_price_snapshot integer not null check (unit_price_snapshot >= 0),
  cost_snapshot integer check (cost_snapshot is null or cost_snapshot >= 0),
  quantity integer not null check (quantity > 0),
  subtotal integer not null check (subtotal >= 0),
  created_at timestamptz not null default now()
);
create index idx_pos_order_items_order on pos_order_items (pos_order_id);
create index idx_pos_order_items_product on pos_order_items (pos_product_id);

-- ============================================================================
-- 2. Toggle POS per booth (A13)
-- ============================================================================

alter table photoboxes add column pos_enabled boolean not null default false;

-- ============================================================================
-- 3. Kolom additive di transactions (traceability POS ↔ reporting)
--    TIDAK ada relax NOT NULL: outlet_id & photobox_id selalu terisi dari booth
--    (photoboxes.outlet_id NOT NULL — schema.sql:209).
-- ============================================================================

alter table transactions add column pos_order_id uuid references pos_orders (id) on delete set null;
alter table transactions add column cashier_user_id uuid references users (id) on delete set null;
create index idx_tx_pos_order on transactions (pos_order_id);

-- ============================================================================
-- 4. Seed add-on POS (harga default platform; admin bebas ubah via /admin/add-ons)
-- ============================================================================

insert into add_ons (code, name, price_monthly, unit, is_active)
values ('pos', 'POS Kasir', 99000, 'feature', true)
on conflict (code) do nothing;
```

Catatan keputusan DDL:

- `unique (business_id, sku)` — NULL sku tidak collide (NULL ≠ NULL) → beberapa produk tanpa SKU legal.
- `check (final_amount = gross_amount - discount_amount)` — invariant uang di-enforce DB (rung 3: DB constraint over app code).
- `photobox_id NOT NULL` + `on delete restrict` — setiap order terikat booth (A13); booth tidak bisa dihapus jika masih punya riwayat order.
- `cashier_user_id NOT NULL` — setiap order PUNYA operator (auditability); `on delete restrict`.
- `payment_method` default `'cash'` (bukan `'qris'` seperti revisi v1) — offline-only.
- Tidak ada CHECK baru di `business_members.role`, tidak ada perubahan `payments` — verifikasi grep pasca-migration: `\d payments` identik.

---

## 3. Baseline Sync — `db/schema.sql`

Setelah migration disusun, `db/schema.sql` disinkronkan (konvensi repo: baseline = akumulasi migration):

1. Tambah 3 blok tabel POS + trigger + index (urutan §2).
2. `photoboxes` + `pos_enabled boolean not null default false`.
3. `transactions` + `pos_order_id` + `cashier_user_id` + `idx_tx_pos_order`.
4. `add_ons` — tidak ada perubahan struktur (seed bukan bagian baseline schema).
5. `payments` / `business_members` / `checkout_sessions` — **tidak ada diff**.

---

## 4. Kode: Entitlement Gate — `src/server/pos-entitlement.ts`

```
hasPosEntitlement(businessId): Promise<boolean>
  1. subscription terakhir business (order created_at desc, status in trial|active|past_due)
     → tidak ada / status lain → false
  2. join: exists subscription_add_ons(subscription_id, status='active')
     join add_ons(code='pos', is_active=true) → true, else false

requirePosAccess(userId, businessId): Promise<{ membership }>
  1. getMembership(userId, businessId)  → non-member throw 404 (pola tenant.ts)
  2. !can(membership.role, "pos:read") → throw 404 (anti existence-leak, konsisten existing)
  3. !hasPosEntitlement(businessId) → throw ApiError("POS_NOT_SUBSCRIBED", 403)
  return membership
```

- Semua action POS (Phase 3/5) memanggil `requirePosAccess` — layout hanya UX.
- `businessId` untuk action terminal diambil dari cookie `snapyos_active_business` di layer action (A8) — `requirePosAccess` tetap menerima businessId eksplisit agar testable.

---

## 5. Kode: RBAC & Validator

### 5.1 `src/lib/rbac.ts` — tanpa role baru

```ts
const PERMISSIONS: Record<BusinessRole, readonly string[]> = {
  owner:   ["*"],
  manager: [ /* existing... */, "pos:manage", "pos:sell", "pos:read" ],
  staff:   [ /* existing read-only... */, "pos:sell", "pos:read" ],
};
```

Tipe `BusinessRole` TIDAK berubah. **Tidak ada** perubahan `src/server/staff.ts` atau UI `/dashboard/staff`.

### 5.2 `src/lib/validators.ts`

- Enum role existing TIDAK berubah.
- Baru (dipakai Phase 3): `posProductSchema`, `posOrderCreateSchema` (`photoboxId uuid`, `items: [{productId uuid, qty int 1..999}]`), `posManualPaySchema` (`method: z.enum(["cash","bank_transfer","other"])`), `posBoothToggleSchema` (`{photoboxId uuid, enabled boolean}`).

### 5.3 `src/lib/api-errors.ts`

Tambah: `POS_NOT_SUBSCRIBED: 403`, `INSUFFICIENT_STOCK: 409`, `POS_ORDER_NOT_PAYABLE: 409`, `POS_PRODUCT_INACTIVE: 400`, `POS_BOOTH_DISABLED: 409`.

---

## 6. UI Subscription Existing (nol perubahan kode — verifikasi saja)

- `/dashboard/subscription` sudah render daftar `add_ons` generik dari server → baris POS muncul otomatis setelah seed.
- Alur beli: `createSubscriptionInvoice` (add-on pos qty 1) → invoice QRIS → `markInvoicePaid` → `applyInvoiceIntent` → upsert `subscription_add_ons`. **Verifikasi manual di dev** — tidak ada edit kode.
- `/admin/add-ons` sudah bisa ubah harga POS tanpa deploy.
- Toggle per-booth (`pos_enabled`) dikelola owner di `/dashboard/pos` (Phase 3), bukan di subscription.

---

## 7. Security

- Semua perubahan additive — tidak ada kolom existing yang berubah tipe/nullability → risiko R1/R2/R3/R11 dari audit v1 **gugur seluruhnya**.
- Seed harga default 99.000 ada di migration; bukan hardcode frontend (admin-configurable).
- Entitlement gate server-side; toggle booth divalidasi server (`POS_BOOTH_DISABLED`) — menyembunyikan booth di UI bukan pengaman.

---

## 8. Testing

| Test | File | Kasus |
|---|---|---|
| RBAC matrix baru | `tests/rbac.test.ts` (extend) | staff: pos:sell/pos:read ✅, pos:manage ❌; manager + pos:*; owner wildcard |
| Entitlement | `tests/pos-entitlement.test.ts` (mock supabase pola test existing) | trial+active-addon ✅; active+cancelled-addon ❌; past_due ✅; tanpa subscription ❌; add_ons inactive ❌ |
| Migration | manual di DB dev | `up` bersih; jalankan 2× (idempotent seed); `rollback` (§10) bersih; `db/schema.sql` diff = hanya §3; `\d payments` + `\d business_members` identik |

Perintah: `npm run test && npm run typecheck && npm run lint` (semua hijau).

---

## 9. Risk & Mitigasi

| Risiko | Mitigasi |
|---|---|
| ~~R1 NULL checkout_session_id~~ | GUGUR — tidak menyentuh `payments` |
| ~~R2/R7 webhook~~ | GUGUR — tidak ada integrasi webhook |
| ~~R3 role cashier~~ | GUGUR — tanpa role baru; hanya tambah permission di matrix |
| ~~R11 nullable outlet/photobox~~ | GUGUR — tidak ada relax; tipe kolom TIDAK berubah |
| R4 gate terlewat | `requirePosAccess` baris pertama semua export pos-* (checklist review Phase 3) |
| R5 stock race | Guarded UPDATE `stock >= qty` → `INSUFFICIENT_STOCK`; stock opsional |
| R6 laporan berubah makna | POS row tetap masuk `transactions`; verifikasi agregasi by-package/by-photobox di Phase 5 |
| R10 sidebar noise | Nav POS conditional by entitlement+permission |
| Migration gagal mid-way | Postgres DDL transactional — bungkus `begin/commit` |

---

## 10. Rollback

```sql
-- 0019_pos_addon_rollback.sql (simpan berdampingan, jangan dijalankan otomatis)
alter table transactions drop column if exists cashier_user_id;
alter table transactions drop column if exists pos_order_id;
alter table photoboxes drop column if exists pos_enabled;
drop table if exists pos_order_items;
drop table if exists pos_orders;
drop table if exists pos_products;
delete from add_ons where code = 'pos';  -- opsional; cukup is_active=false utk matikan fitur
```

Tanpa kondisi data (semua kolom/ tabel murni additive, tak ada kolom existing yang di-relax) — rollback selalu aman. Kode: revert commit Phase 2.

---

## 11. Acceptance Criteria

1. Migration up + rollback bersih di DB dev; jalankan 2× tanpa error (seed idempotent).
2. `\d payments`, `\d business_members`, `\d checkout_sessions` identik sebelum/sesudah migration.
3. Owner membeli add-on POS via alur subscription existing (dev): invoice QRIS → paid → `subscription_add_ons` row aktif → `hasPosEntitlement` true.
4. Tenant tanpa add-on: `requirePosAccess` → `POS_NOT_SUBSCRIBED` (unit test — belum ada UI).
5. `npm run test`, `typecheck`, `lint` hijau; test RBAC + entitlement baru lulus.

**STATUS: PHASE 2 — SELESAI. Dieksekusi 2026-08-28 (migration 0019 applied; lihat Status Eksekusi di atas).**
