-- APPLY_0061_0062_combined.sql
-- One-time consolidation of db/migrations/0061_plan_device_addon_model.sql
-- and db/migrations/0062_storage_usage_accounting.sql, preserved in order,
-- wrapped in a single transaction. Additive/idempotent: no data dropped.
-- Apply via Supabase SQL Editor or: psql "$SUPABASE_DB_URL" -f APPLY_0061_0062_combined.sql

begin;

-- ===== 0061_plan_device_addon_model.sql =====
-- 0061 — Model perangkat = add-on (docs/02 §2.2).
-- SEMUA plan base 1 outlet / 1 photobox / 1 perangkat online; tambahan
-- perangkat dibeli via add-on (extra_session). Yang membedakan plan hanyalah
-- fitur (features jsonb):
--   Starter : base saja.
--   Growth  : + payment gateway (direct_payment), finance, staff.
--   Business: + storage, reports, voucher, custom_domain, white_label, dsb.
--
-- Rollback: kembalikan nilai lama bila perlu (starter 1/1/1, growth 5/5/3,
-- business 20/20/10) + features lama.


update plans set
  max_outlets = 1,
  max_photoboxes = 1,
  max_concurrent_sessions = 1,
  max_staff = case when code = 'starter' then 0 when code = 'growth' then 5 else max_staff end
where code in ('starter', 'growth', 'business');

-- Feature flag: staff hanya growth & business; storage & reports & voucher
-- hanya business; cash_payment hanya growth & business (docs/02 §2.2).
-- Idempotent (|| tidak duplikasi key); pwa_kiosk sengaja TIDAK disentuh
-- (nilai lama dipertahankan).
update plans set features = features || '{"staff": false, "storage": false, "reports": false, "voucher": false, "finance": false, "direct_payment": false, "cash_payment": false}'::jsonb
where code = 'starter';

update plans set features = features || '{"staff": true, "finance": true, "direct_payment": true, "cash_payment": true, "storage": false, "reports": false, "voucher": false}'::jsonb
where code = 'growth';

update plans set features = features || '{"staff": true, "finance": true, "direct_payment": true, "cash_payment": true, "storage": true, "reports": true, "voucher": true}'::jsonb
where code = 'business';


-- ===== 0062_storage_usage_accounting.sql =====
-- 0062 — Storage usage accounting (per-business byte counter, O(1) hot-path).
--
-- LATAR: sebelumnya pemakaian storage per business dihitung dengan recursive
-- listing dua bucket Supabase (src/server/storage-usage.ts) pada SETIAP
-- upload/finalize. Biaya tumbuh linear terhadap jumlah objek → tidak scalable.
--
-- SOLUSI: ledger objek + counter agregat, diperbarui atomik via RPC saat
-- upload/delete sukses. Hot-path (assertStorageAvailable / getStorageUsage)
-- hanya membaca satu baris counter — tanpa listing bucket.
--
-- MODEL:
--   storage_objects (object_key pk)  = ledger per objek (sumber kebenaran delta)
--   storage_usage   (business_id pk) = counter agregat bytes (dibaca hot-path)
-- Keduanya diperbarui dalam SATU transaksi RPC:
--   storage_account_add(business, key, bucket, bytes) → insert ledger ON CONFLICT
--       DO NOTHING (idempotent; retry upload tak menggandakan) + counter += bytes
--       HANYA bila ledger benar-benar bertambah.
--   storage_account_sub(business, keys[])             → hitung bytes ledger yang
--       AKAN dihapus, delete baris ledger (idempotent; key yang tak ada = no-op),
--       lalu counter -= bytes aktual dengan clamp greatest(0, ...) → usage tak
--       pernah negatif.
--
-- Idempotency key pada ledger = `object_key` (key unik per objek di storage).
-- Retry upload yang sama atau delete ganda tidak mengubah counter. Race
-- concurrent upload key berbeda: dua insert ledger berhasil → dua delta (benar).
-- Race upload key sama: satu menang, lainnya DO NOTHING (benar).
--
-- Kompatibel retention: cron retention memanggil storage_account_sub dengan key
-- yang benar-benar dihapus → counter turun mantap; marker media_cleaned_at tetap
-- menjaga sesi tak diproses ulang.
--
-- Backfill initial usage: TIDAK bisa dari SQL murni (ukuran objek hanya ada di
-- storage). Jalankan `scripts/backfill-storage-usage.mjs` SEKALI setelah
-- migrasi ini — script melakukan listing bucket sekali (bukan per-upload) dan
-- menulis ledger + counter.


-- Ledger objek: satu baris per objek fisik yang menyumbang storage.
create table if not exists storage_objects (
  object_key text primary key,
  business_id uuid not null references businesses (id) on delete cascade,
  bucket text not null,
  bytes bigint not null check (bytes >= 0),
  created_at timestamptz not null default now()
);
create index if not exists idx_storage_objects_business on storage_objects (business_id);
create index if not exists idx_storage_objects_bucket on storage_objects (bucket);

-- Counter agregat: satu baris per business, dibaca hot-path.
create table if not exists storage_usage (
  business_id uuid primary key references businesses (id) on delete cascade,
  used_bytes bigint not null default 0 check (used_bytes >= 0),
  updated_at timestamptz not null default now()
);

-- Tambah akuntansi objek (idempotent per object_key) + naikkan counter.
-- Return: used_bytes setelah operasi (untuk observability/assert optional).
create or replace function storage_account_add(
  p_business uuid, p_key text, p_bucket text, p_bytes bigint
)
returns bigint
language plpgsql as $$
declare
  inserted int;
  current_bytes bigint;
begin
  if p_bytes is null or p_bytes < 0 then
    p_bytes := 0;
  end if;

  -- Pastikan baris counter ada (idempotent), agar UPDATE di bawah selalu kena.
  insert into storage_usage (business_id, used_bytes, updated_at)
  values (p_business, 0, now())
  on conflict (business_id) do nothing;

  insert into storage_objects (object_key, business_id, bucket, bytes)
  values (p_key, p_business, p_bucket, p_bytes)
  on conflict (object_key) do nothing;
  get diagnostics inserted = row_count;

  if inserted > 0 and p_bytes > 0 then
    update storage_usage
       set used_bytes = used_bytes + p_bytes,
           updated_at = now()
     where business_id = p_business
     returning used_bytes into current_bytes;
  else
    select used_bytes into current_bytes
      from storage_usage where business_id = p_business;
  end if;

  return coalesce(current_bytes, 0);
end;
$$;

-- Kurangi akuntansi objek (idempotent; key yang sudah tak ada = no-op) +
-- turunkan counter sebesar bytes AKTUAL yang benar-benar terhapus dari ledger.
-- Clamp greatest(0, ...) → usage tak pernah negatif walau delta tak sinkron.
create or replace function storage_account_sub(
  p_business uuid, p_keys text[]
)
returns bigint
language plpgsql as $$
declare
  freed bigint;
  current_bytes bigint;
begin
  insert into storage_usage (business_id, used_bytes, updated_at)
  values (p_business, 0, now())
  on conflict (business_id) do nothing;

  -- Jumlahkan bytes ledger yang AKAN dihapus (sebelum delete), scoped business.
  select coalesce(sum(bytes), 0) into freed
    from storage_objects
   where business_id = p_business
     and object_key = any(p_keys);

  delete from storage_objects
   where business_id = p_business
     and object_key = any(p_keys);

  if freed > 0 then
    update storage_usage
       set used_bytes = greatest(0, used_bytes - freed),
           updated_at = now()
     where business_id = p_business
     returning used_bytes into current_bytes;
  else
    select used_bytes into current_bytes
      from storage_usage where business_id = p_business;
  end if;

  return coalesce(current_bytes, 0);
end;
$$;


commit;
