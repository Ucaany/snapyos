-- ============================================================================
-- MIGRATION 0005 — bookings interval contract (docs/07 §7.6)
-- PRD sync: doc 04 §Bookings, doc 08:118, doc 11:79 — booking memakai
-- starts_at/ends_at timestamptz (UTC); `date`+`time` DILARANG; overlap pada
-- resource sama ditolak DB (status pending/confirmed/completed).
-- Idempotent — aman dijalankan berulang. Tabel bookings belum dipakai kode
-- (booking = fase dashboard calendar), jadi backfill bersifat defensif.
-- ============================================================================

create extension if not exists btree_gist;

-- 1) Kolom baru
alter table bookings add column if not exists starts_at timestamptz;
alter table bookings add column if not exists ends_at timestamptz;
alter table bookings add column if not exists photobox_id uuid references photoboxes (id) on delete set null;

-- 2) Backfill defensif dari legacy date/time (jika masih ada kolomnya)
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'bookings' and column_name = 'date') then
    update bookings
      set starts_at = (date::timestamp + coalesce(time, time '10:00'))::timestamptz,
          ends_at   = (date::timestamp + coalesce(time, time '10:00') + interval '1 hour')::timestamptz
      where starts_at is null;
    alter table bookings drop column if exists date;
    alter table bookings drop column if exists time;
  end if;
end $$;

-- Fallback baris tanpa legacy (hasil backfill tetap null → pakai created_at)
update bookings
  set starts_at = created_at,
      ends_at   = created_at + interval '1 hour'
  where starts_at is null or ends_at is null;

alter table bookings alter column starts_at set not null;
alter table bookings alter column ends_at set not null;

-- 3) Constraint interval + resource wajib
alter table bookings drop constraint if exists bookings_interval_valid;
alter table bookings add constraint bookings_interval_valid check (ends_at > starts_at);

alter table bookings drop constraint if exists bookings_resource_required;
alter table bookings add constraint bookings_resource_required
  check (photobox_id is not null or outlet_id is not null);

-- 4) Anti-overlap per resource (lintas level outlet-vs-photobox = server-side)
alter table bookings drop constraint if exists bookings_no_overlap_photobox;
alter table bookings add constraint bookings_no_overlap_photobox
  exclude using gist (photobox_id with =, tstzrange(starts_at, ends_at) with &&)
  where (photobox_id is not null and status in ('pending', 'confirmed', 'completed'));

alter table bookings drop constraint if exists bookings_no_overlap_outlet;
alter table bookings add constraint bookings_no_overlap_outlet
  exclude using gist (outlet_id with =, tstzrange(starts_at, ends_at) with &&)
  where (photobox_id is null and status in ('pending', 'confirmed', 'completed'));

-- 5) Index query kalender
create index if not exists idx_bookings_business_date on bookings (business_id, starts_at);

-- 6) FK tertunda (docs/07 §7.4–7.7) — idempotent
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_event_id_fkey') then
    alter table sessions add constraint sessions_event_id_fkey
      foreign key (event_id) references events (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sessions_customer_id_fkey') then
    alter table sessions add constraint sessions_customer_id_fkey
      foreign key (customer_id) references customers (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_event_id_fkey') then
    alter table transactions add constraint transactions_event_id_fkey
      foreign key (event_id) references events (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_customer_id_fkey') then
    alter table transactions add constraint transactions_customer_id_fkey
      foreign key (customer_id) references customers (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_voucher_id_fkey') then
    alter table transactions add constraint transactions_voucher_id_fkey
      foreign key (voucher_id) references vouchers (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'checkout_sessions_voucher_id_fkey') then
    alter table checkout_sessions add constraint checkout_sessions_voucher_id_fkey
      foreign key (voucher_id) references vouchers (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_voucher_id_fkey') then
    alter table payments add constraint payments_voucher_id_fkey
      foreign key (voucher_id) references vouchers (id) on delete set null;
  end if;
end $$;
