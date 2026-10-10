-- ============================================================================
-- db/seed-dev.sql — data dummy Phase 2 (docs/12 DoD: "dashboard berfungsi
-- dengan data dummy transaksi"). KHUSUS DATABASE DEV.
-- Jalankan: psql -v SnapyOS_ALLOW_DEV_SEED=1 -v ON_ERROR_STOP=1 -f db/seed-dev.sql
-- Undo:     delete from businesses where id = '11111111-1111-4111-8111-111111111111';
-- Uang SELALU integer IDR.
-- ============================================================================

\if :{?SnapyOS_ALLOW_DEV_SEED}
\else
\echo 'REFUSED: seed dev-only. Jalankan dengan: psql -v SnapyOS_ALLOW_DEV_SEED=1 -f db/seed-dev.sql'
\quit
\endif

begin;

delete from businesses
where slug = 'klik-foto-dev'
  and id = '11111111-1111-4111-8111-111111111111';

-- Business + member (pakai user dev yang sudah register; sesuaikan email)
insert into businesses (id, owner_id, name, slug, timezone, currency, status)
values (
  '11111111-1111-4111-8111-111111111111',
  (select id from users order by created_at asc limit 1),
  'KLIK FOTO DEV', 'klik-foto-dev', 'Asia/Jakarta', 'IDR', 'active'
)
on conflict (slug) do nothing;

insert into business_members (business_id, user_id, role)
values (
  '11111111-1111-4111-8111-111111111111',
  (select id from users order by created_at asc limit 1),
  'owner'
)
on conflict do nothing;

insert into business_settings (business_id) values
  ('11111111-1111-4111-8111-111111111111')
on conflict do nothing;

-- Subscription trial starter (agar header dashboard menampilkan plan)
insert into subscriptions (business_id, plan_id, status, trial_ends_at,
                           current_period_start, current_period_end)
select '11111111-1111-4111-8111-111111111111', id, 'trial',
       now() + interval '14 days', now(), now() + interval '30 days'
from plans where code = 'starter' and is_active
on conflict do nothing;

-- Struktur operasional
insert into outlets (id, business_id, name, city, province, status) values
  ('22222222-2222-4222-8222-222222222221', '11111111-1111-4111-8111-111111111111', 'Outlet Malioboro', 'KOTA YOGYAKARTA', 'DI YOGYAKARTA', 'active'),
  ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Outlet Grand Senja', 'SURAKARTA', 'JAWA TENGAH', 'active');

insert into photoboxes (id, business_id, outlet_id, slug, name, status) values
  ('33333333-3333-4333-8333-333333333331', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222221', 'booth-01', 'Booth 01 Mall', 'online'),
  ('33333333-3333-4333-8333-333333333332', '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'booth-02', 'Booth 02 Kafe', 'offline');

insert into packages (id, business_id, name, price, photo_count, print_count, digital_output, capture_mode) values
  ('44444444-4444-4444-8444-444444444441', '11111111-1111-4111-8111-111111111111', 'Strip Klasik', 25000, 3, 1, true, 'photostrip'),
  ('44444444-4444-4444-8444-444444444442', '11111111-1111-4111-8111-111111111111', 'Single Basic', 20000, 1, 1, false, 'single'),
  ('44444444-4444-4444-8444-444444444443', '11111111-1111-4111-8111-111111111111', 'Paket Duo', 45000, 2, 2, true, 'single');

-- Sesi (30 hari terakhir) — jumlah bervariasi per hari
insert into sessions (id, business_id, outlet_id, photobox_id, package_id, status, started_at, completed_at, created_at)
select
  gen_random_uuid(),
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222221',
  '33333333-3333-4333-8333-333333333331',
  '44444444-4444-4444-8444-444444444441',
  'completed',
  d.ts, d.ts + interval '5 minutes', d.ts
from generate_series(now() - interval '29 days', now(), interval '1 day') as d(ts);

-- Customers
insert into customers (id, business_id, name, phone) values
  ('55555555-5555-4555-8555-555555555551', '11111111-1111-4111-8111-111111111111', 'Rina', '081200000001'),
  ('55555555-5555-4555-8555-555555555552', '11111111-1111-4111-8111-111111111111', 'Dedi',  '081200000002'),
  ('55555555-5555-4555-8555-555555555553', '11111111-1111-4111-8111-111111111111', 'Sari',  '081200000003');

-- Transaksi paid 30 hari terakhir (gross − discount = final, integer IDR)
insert into transactions (business_id, outlet_id, photobox_id, package_id, customer_id,
                          payment_method, gross_amount, discount_amount, final_amount,
                          status, number, paid_at, created_at)
select
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222221',
  '33333333-3333-4333-8333-333333333331',
  '44444444-4444-4444-8444-444444444441',
  (array['55555555-5555-4555-8555-555555555551','55555555-5555-4555-8555-555555555552','55555555-5555-4555-8555-555555555553'])[1 + (extract(day from d.ts)::int % 3)],
  'qris',
  25000,
  case when extract(dow from d.ts) = 0 then 5000 else 0 end, -- diskon Minggu
  25000 - case when extract(dow from d.ts) = 0 then 5000 else 0 end,
  'paid',
  'TX-DEV-' || to_char(d.ts, 'YYYYMMDD'),
  d.ts + interval '2 minutes', d.ts
from generate_series(now() - interval '29 days', now(), interval '1 day') as d(ts);

-- Beberapa hari ekstra: 2 transaksi (variasi chart)
insert into transactions (business_id, outlet_id, photobox_id, package_id, customer_id,
                          payment_method, gross_amount, discount_amount, final_amount,
                          status, number, paid_at, created_at)
values
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333332','44444444-4444-4444-8444-444444444442','55555555-5555-4555-8555-555555555552','qris',20000,0,20000,'paid','TX-DEV-EXTRA-1', now() - interval '3 days', now() - interval '3 days'),
  ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222221','33333333-3333-4333-8333-333333333331','44444444-4444-4444-8444-444444444443','55555555-5555-4555-8555-555555555553','cash',45000,5000,40000,'paid','TX-DEV-EXTRA-2', now() - interval '1 day', now() - interval '1 day');

-- Promo subscription (dev) — 10% max 50k, dipakai di layar konfirmasi checkout.
insert into subscription_promos (code, type, amount, max_discount, is_active)
values ('SnapyOS10', 'percentage', 10, 50000, true)
on conflict (code) do nothing;

commit;
