-- ============================================================================
-- SnapyOS — APPLY 0085-0088 (migrasi tertunda ke Supabase cloud)
-- Digabung dari db/migrations: 0085, 0086, 0087, 0088
--
--   0085  trigger kuota paket & template (N8)
--   0086  tabel installer_catalog (katalog installer Windows)
--   0087  business_settings.output (GIF) + print_mode 'cups'
--   0088  pos_orders.amount_received/change_amount + pos_complete_payment 12 arg
--
-- Sifat: aditif & idempoten. Aman dijalankan ulang.
-- Satu transaksi: bila satu blok gagal, semuanya dibatalkan (tidak ada
-- keadaan separuh jadi).
--
-- Cara pakai: Supabase -> SQL Editor -> New query -> tempel semua -> Run.
-- Hasil yang diharapkan: "Success. No rows returned".
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0085_security_package_template_quota_triggers.sql
--
-- N8: kuota paket & template dicek dengan count-then-insert di aplikasi, tanpa
-- lock. Dua request bersamaan sama-sama melihat hitungan di bawah batas lalu
-- sama-sama insert → jumlah melewati max_packages / max_templates.
--
-- Perbaikan di database: trigger BEFORE INSERT mengambil advisory lock per
-- (business, jenis) lalu menghitung ulang di dalam lock. Aplikasi tidak perlu
-- diubah; error P0001 dipetakan ke PLAN_LIMIT_REACHED.
-- ---------------------------------------------------------------------------

create or replace function enforce_resource_quota()
returns trigger
language plpgsql
as $$
declare
  v_limit integer;
  v_count integer;
  v_resource text := tg_argv[0];
  v_business uuid := new.business_id;
begin
  -- Lock per business+jenis: dua INSERT paralel antre di sini.
  perform pg_advisory_xact_lock(hashtext(v_business::text || ':' || v_resource)::bigint);

  select case v_resource
           when 'packages' then p.max_packages
           when 'templates' then p.max_templates
         end
    into v_limit
    from subscriptions s
    join plans p on p.id = s.plan_id
   where s.business_id = v_business
     and s.status in ('trial', 'active', 'past_due')
   order by s.created_at desc
   limit 1;

  if v_limit is null then
    return new; -- tanpa langganan efektif / tanpa batas: aplikasi yang menolak
  end if;

  if v_resource = 'packages' then
    select count(*) into v_count from packages where business_id = v_business;
  else
    select count(*) into v_count from templates where business_id = v_business;
  end if;

  if v_count >= v_limit then
    raise exception 'PLAN_LIMIT_REACHED: kuota % untuk business ini sudah penuh (% / %)',
      v_resource, v_count, v_limit
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_package_quota on packages;
create trigger trg_enforce_package_quota
  before insert on packages
  for each row execute function enforce_resource_quota('packages');

drop trigger if exists trg_enforce_template_quota on templates;
create trigger trg_enforce_template_quota
  before insert on templates
  for each row execute function enforce_resource_quota('templates');

-- 0086 — private Windows installer catalog (nomor 0081 sudah dipakai
-- app_releases di cloud; jangan disamakan).
-- Artifact bytes live in private business-assets storage; URLs are signed at read time.

create table if not exists installer_catalog (
  id uuid primary key default gen_random_uuid(),
  version text not null,
  channel text not null check (channel in ('stable', 'beta', 'internal')),
  min_windows_version text not null check (min_windows_version in ('10', '11')),
  architecture text not null check (architecture in ('x64', 'x86', 'arm64', 'universal')),
  file_name text not null,
  object_key text not null unique,
  content_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  changelog text,
  compatibility_notes text,
  is_active boolean not null default true,
  is_deprecated boolean not null default false,
  published_at timestamptz,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (version, channel, architecture)
);
create index if not exists idx_installer_catalog_published
  on installer_catalog (published_at, channel, is_active, is_deprecated, created_at desc);
drop trigger if exists trg_installer_catalog_updated_at on installer_catalog;
create trigger trg_installer_catalog_updated_at before update on installer_catalog
  for each row execute function set_updated_at();

alter table installer_catalog enable row level security;
revoke all on installer_catalog from anon, authenticated;
grant all on installer_catalog to service_role;
drop policy if exists svc_all on installer_catalog;
create policy svc_all on installer_catalog for all to service_role using (true) with check (true);

-- 0087 — output digital per bisnis (GIF hasil sesi) + jalur cetak bertingkat.
--
-- 1. `business_settings.output` menampung setelan output digital; untuk saat
--    ini hanya `gif` (`enabled`, `frame_delay_ms`, `max_width`). Bentuknya
--    jsonb supaya penambahan output berikutnya tidak butuh migrasi kolom.
-- 2. `photoboxes.print_settings` sudah jsonb sehingga grup `photo`/`thermal`/
--    `receipt` tidak butuh kolom baru; migrasi ini hanya memastikan nilai lama
--    yang masih datar tetap utuh (tidak ada rewrite, tidak ada backfill).
--
-- 3. `pos_orders.print_mode` menerima `cups`: struk POS boleh memakai bridge
--    lokal, bukan hanya dialog OS / Bluetooth. Tanpa ini order dengan struk
--    CUPS ditolak check constraint (23514) walau setelan booth sah.
--
-- Aditif & idempoten: baris lama tanpa `output` tetap jalan.


alter table business_settings
  add column if not exists output jsonb;

comment on column business_settings.output is
  'Output digital bisnis (jsonb): { gif: { enabled, frame_delay_ms, max_width } }.';

alter table pos_orders drop constraint if exists pos_orders_print_mode_check;
alter table pos_orders
  add constraint pos_orders_print_mode_check
  check (print_mode in ('browser', 'bluetooth', 'cups'));

-- 0088 — struk POS jalur CUPS + uang kembali tunai.
--
-- 1. `pos_orders.print_mode` menerima `cups` — ditangani blok 0087 di atas,
--    tidak diulang di sini.
-- 2. `amount_received`/`change_amount` adalah kolom uang tunai yang nyata —
--    BUKAN menumpang `payment_reference` (itu referensi settlement provider).
--    Keduanya nullable: pembayaran non-tunai dan baris lama tidak punya nilai.
--    `change_amount` WAJIB turunan `amount_received - final_amount`, dan
--    `amount_received` tidak boleh di bawah total order.
--
-- Aditif & idempoten.



alter table pos_orders add column if not exists amount_received integer;
alter table pos_orders add column if not exists change_amount integer;

comment on column pos_orders.amount_received is
  'Uang tunai yang diterima kasir (IDR). NULL untuk non-tunai / baris lama.';
comment on column pos_orders.change_amount is
  'Kembalian = amount_received - final_amount. NULL bila amount_received NULL.';

alter table pos_orders drop constraint if exists pos_orders_cash_change_valid;
alter table pos_orders
  add constraint pos_orders_cash_change_valid
  check (
    (amount_received is null and change_amount is null)
    or (
      amount_received >= final_amount
      and change_amount = amount_received - final_amount
    )
  );

-- RPC pembayaran menulis uang tunai + kembalian dalam transaksi yang sama
-- dengan UPDATE status → tidak ada order paid tanpa catatan tunai.
-- Signature lama (10 argumen) dibuang agar tidak ada overload ambigu.
drop function if exists pos_complete_payment(
  uuid, uuid, text, uuid, text, uuid, uuid, integer, integer, integer
);

create or replace function pos_complete_payment(
  p_order_id uuid,
  p_business uuid,
  p_method text,
  p_cashier uuid,
  p_tx_number text,
  p_outlet_id uuid,
  p_photobox_id uuid,
  p_gross integer,
  p_discount integer,
  p_final integer,
  p_amount_received integer default null,
  p_change_amount integer default null
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tx_id uuid;
  v_existing uuid;
begin
  select id into v_existing
    from transactions
   where pos_order_id = p_order_id
   limit 1;
  if v_existing is not null then
    return null;
  end if;

  update pos_orders
     set status = 'paid',
         paid_at = now(),
         payment_method = p_method,
         amount_received = p_amount_received,
         change_amount = p_change_amount
   where id = p_order_id
     and business_id = p_business
     and status = 'pending';

  if not found then
    return null;
  end if;

  insert into transactions (
    business_id, outlet_id, photobox_id, session_id, package_id,
    payment_method, gross_amount, discount_amount, final_amount,
    status, number, pos_order_id, cashier_user_id, paid_at, withdrawable
  ) values (
    p_business, p_outlet_id, p_photobox_id, null, null,
    p_method, p_gross, p_discount, p_final,
    'paid', p_tx_number, p_order_id, p_cashier, now(), false
  )
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

revoke execute on function pos_complete_payment(
  uuid, uuid, text, uuid, text, uuid, uuid, integer, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function pos_complete_payment(
  uuid, uuid, text, uuid, text, uuid, uuid, integer, integer, integer, integer, integer
) to service_role;

commit;

-- ============================================================================
-- VERIFIKASI — jalankan terpisah setelah Run di atas.
-- Semua baris harus berstatus ADA / TIDAK (benar).
-- ============================================================================
select 'installer_catalog (0086)' as objek,
       case when to_regclass('public.installer_catalog') is not null then 'ADA' else 'TIDAK' end as status
union all
select 'business_settings.output (0087)',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='business_settings' and column_name='output')
            then 'ADA' else 'TIDAK' end
union all
select 'pos_orders.amount_received (0088)',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='pos_orders' and column_name='amount_received')
            then 'ADA' else 'TIDAK' end
union all
select 'pos_orders.change_amount (0088)',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='pos_orders' and column_name='change_amount')
            then 'ADA' else 'TIDAK' end
union all
select 'pos_complete_payment 12 argumen (0088)',
       case when to_regprocedure('public.pos_complete_payment(uuid,uuid,text,uuid,text,uuid,uuid,integer,integer,integer,integer,integer)') is not null
            then 'ADA' else 'TIDAK' end
union all
select 'pos_complete_payment 10 argumen (0088: harus hilang)',
       case when to_regprocedure('public.pos_complete_payment(uuid,uuid,text,uuid,text,uuid,uuid,integer,integer,integer)') is null
            then 'TIDAK (benar)' else 'MASIH ADA (salah)' end
union all
select 'check print_mode menerima cups (0087)',
       case when exists (select 1 from pg_constraint
                          where conname='pos_orders_print_mode_check'
                            and pg_get_constraintdef(oid) like '%cups%')
            then 'ADA' else 'TIDAK' end
union all
select 'check amount_received/change_amount (0088)',
       case when exists (select 1 from pg_constraint where conname='pos_orders_cash_change_valid')
            then 'ADA' else 'TIDAK' end
union all
select 'trigger kuota paket (0085)',
       case when exists (select 1 from pg_trigger where tgname='trg_enforce_package_quota')
            then 'ADA' else 'TIDAK' end
union all
select 'trigger kuota template (0085)',
       case when exists (select 1 from pg_trigger where tgname='trg_enforce_template_quota')
            then 'ADA' else 'TIDAK' end;
