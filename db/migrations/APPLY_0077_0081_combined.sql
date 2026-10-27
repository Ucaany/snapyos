-- ============================================================================
-- SnapyOS — APPLY gabungan migrasi 0077–0081
-- Tempel seluruh isi file ini ke Supabase → SQL Editor → Run.
-- Semua aditif/konservatif: TIDAK ada DELETE/TRUNCATE, tidak ada tabel atau baris
-- yang dihapus. Satu-satunya perubahan destruktif-schema adalah DROP CONSTRAINT
-- FK lalu CREATE ulang dengan aturan lebih ketat (0079) dan pelepasan FK
-- transactions.payment_id (0080, kolomnya tetap ada).
-- Rollback tiap migrasi ada di db/migrations/*_rollback.sql
-- ============================================================================


-- ############################################################################
-- ## 0077_plan_limits_packages_templates.sql
-- ############################################################################

-- 0077: tambah max_packages & max_templates ke tabel plans.
--
-- Bug #7 & #9: plan system tidak membatasi jumlah packages dan templates
-- yang bisa dibuat per-business. Kolom baru mengikuti pola existing
-- (max_outlets, max_staff, dsb). Default konservatif: 50 package, 20 template.

begin;

alter table plans
  add column if not exists max_packages integer not null default 50,
  add column if not exists max_templates integer not null default 20;

commit;


-- ############################################################################
-- ## 0078_webhook_hot_path_indexes.sql
-- ############################################################################

-- 0078: webhook hot-path indexes.
--
-- Bug #6: payment_webhooks hanya di-index pada payment_id.
-- Webhook handler sering query berdasarkan:
--   1. status + received_at (admin dashboard, retry cron)
--   2. provider + status (provider-specific monitoring)
--   3. event_id (idempotency check — sudah UNIQUE, tapi eksplisit partial
--      index untuk status lookup)
-- Tambahan: payments.status + created_at untuk payment monitoring dashboard.

begin;

-- Webhook status monitoring & retry cron
create index if not exists idx_payment_webhooks_status_received
  on payment_webhooks (status, received_at desc);

-- Provider-specific webhook monitoring
create index if not exists idx_payment_webhooks_provider_status
  on payment_webhooks (provider, status);

-- Payment status + created_at untuk dashboard & reporting hot-path
create index if not exists idx_payments_status_created
  on payments (status, created_at desc);

commit;


-- ############################################################################
-- ## 0079_customer_fk_restrict.sql
-- ############################################################################

-- 0079: fix ON DELETE SET NULL → ON DELETE RESTRICT pada FK ke customers.
--
-- Bug #5: customer yang dihapus menyebabkan data historis kehilangan
-- referensi (customer_id jadi NULL). Bisnis seharusnya tidak bisa
-- menghapus customer yang masih punya data terkait.
--
-- Tabel yang terdampak:
--   sessions.customer_id       — named constraint sessions_customer_id_fkey
--   transactions.customer_id   — named constraint transactions_customer_id_fkey
--   pos_orders.customer_id     — inline FK (auto-named pos_orders_customer_id_fkey)
--   voucher_usages.customer_id — inline FK (auto-named voucher_usages_customer_id_fkey)

begin;

-- 1. sessions
alter table sessions
  drop constraint if exists sessions_customer_id_fkey;
alter table sessions
  add constraint sessions_customer_id_fkey
  foreign key (customer_id) references customers (id) on delete restrict;

-- 2. transactions
alter table transactions
  drop constraint if exists transactions_customer_id_fkey;
alter table transactions
  add constraint transactions_customer_id_fkey
  foreign key (customer_id) references customers (id) on delete restrict;

-- 3. pos_orders
alter table pos_orders
  drop constraint if exists pos_orders_customer_id_fkey;
alter table pos_orders
  add constraint pos_orders_customer_id_fkey
  foreign key (customer_id) references customers (id) on delete restrict;

-- 4. voucher_usages
alter table voucher_usages
  drop constraint if exists voucher_usages_customer_id_fkey;
alter table voucher_usages
  add constraint voucher_usages_customer_id_fkey
  foreign key (customer_id) references customers (id) on delete restrict;

commit;


-- ############################################################################
-- ## 0080_fix_circular_fk_transactions_payments.sql
-- ############################################################################

-- 0080: fix circular FK transactions ↔ payments.
--
-- Bug #2: dua FK membentuk siklus:
--   payments.transaction_id  → transactions(id) ON DELETE SET NULL
--   transactions.payment_id  → payments(id)     ON DELETE SET NULL
--
-- Circular FK mencegah pg_dump --serializable-deferrable, mempersulit
-- DELETE, dan membuat CASCADE tidak deterministik.
--
-- Strategi: hapus FK di sisi transactions.payment_id. Kolom tetap ada
-- (dipakai settle RPC & unique index uq_transaction_payment), tetapi
-- integritas referensial dijaga di level aplikasi (settle RPC selalu
-- INSERT transaction + UPDATE payment dalam satu transaksi).
--
-- payments.transaction_id FK tetap ada — arah ini paling penting
-- untuk ON DELETE SET NULL saat transaction dihapus (admin cleanup).

begin;

-- Cari nama constraint; Postgres auto-name: transactions_payment_id_fkey.
alter table transactions
  drop constraint if exists transactions_payment_id_fkey;

commit;


-- ############################################################################
-- ## 0081_app_releases.sql
-- ############################################################################

-- 0081 — Katalog aplikasi (admin / CEO): tabel app_releases.
--
-- Hanya TAUTAN yang disimpan. File APK/EXE diunggah admin ke Google Drive (atau
-- host lain); tidak ada upload ke storage SNAPY OS, tidak ada bucket baru,
-- tidak ada presigned PUT. Karena itu tidak ada kolom storage_key/object_id.
--
-- file_size_bytes & sha256 nullable dan diisi MANUAL: server tidak boleh
-- HEAD/GET URL sembarang (SSRF), jadi tidak ada yang bisa memverifikasinya.
-- Check `^https://` adalah garis pertahanan terakhir, bukan satu-satunya —
-- validasi Zod (appReleaseSchema) tetap wajib dan lebih ketat.
--
-- Additive-only. Rollback: 0081_app_releases_rollback.sql.

begin;

create table if not exists app_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  download_url text not null check (download_url ~ '^https://'),
  file_name text not null,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes > 0),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  release_notes text,
  is_active boolean not null default true,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_app_releases_active on app_releases (is_active, created_at desc);

drop trigger if exists trg_app_releases_updated_at on app_releases;
create trigger trg_app_releases_updated_at before update on app_releases
  for each row execute function set_updated_at();

-- Pola 0064: RLS ON, tutup anon/authenticated, izinkan penuh service_role.
alter table app_releases enable row level security;
revoke all on app_releases from anon, authenticated;
grant all on app_releases to service_role;
drop policy if exists svc_all on app_releases;
create policy svc_all on app_releases for all to service_role using (true) with check (true);

commit;

