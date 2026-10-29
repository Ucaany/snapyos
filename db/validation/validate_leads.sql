-- ---------------------------------------------------------------------------
-- validate_leads.sql — bukti untuk lead N3 (voucher usage_limit dilewati saat
-- settlement). Jalankan di database DISPOSABLE (bukan produksi):
--
--   createdb snapyos_verify
--   psql -d snapyos_verify -f db/schema.sql
--   psql -d snapyos_verify -f db/validation/validate_leads.sql
--
-- Script membungkus semuanya dalam transaksi dan diakhiri ROLLBACK, jadi tidak
-- meninggalkan data walau dijalankan di database bersama.
--
-- Hasil dibaca dari NOTICE: "PASS ..." berarti perilaku AMAN, "FAIL ..."
-- berarti lead terkonfirmasi (voucher bisa dipakai melebihi usage_limit).
-- ---------------------------------------------------------------------------

begin;

-- --------------------------- fixture ---------------------------------------
-- Owner user wajib ada: businesses.owner_id punya FK ke users.
insert into users (id, email, name, status)
values ('11111111-1111-4111-8111-111111111112', 'owner@verify.test', 'Owner Verify', 'active')
on conflict (id) do nothing;

insert into businesses (id, owner_id, slug, name, status)
values ('11111111-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111112',
        'verify-biz', 'Verify Biz', 'active')
on conflict (id) do nothing;

insert into plans (id, code, name, price_monthly, billing_cycle,
                   max_businesses, max_outlets, max_photoboxes,
                   max_concurrent_sessions, max_staff, max_packages,
                   max_templates, storage_limit_mb, features)
values ('22222222-2222-4222-8222-222222222222', 'verify-pro', 'Verify Pro', 0, 'monthly',
        5, 5, 5, 5, 5, 50, 50, 100, '{}'::jsonb)
on conflict (id) do nothing;

insert into subscriptions (id, business_id, plan_id, status, current_period_end)
values ('33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        'active', now() + interval '30 days')
on conflict (id) do nothing;

insert into outlets (id, business_id, name, status)
values ('44444444-4444-4444-8444-444444444444',
        '11111111-1111-4111-8111-111111111111', 'Outlet Verify', 'active')
on conflict (id) do nothing;

insert into photoboxes (id, business_id, outlet_id, slug, name, status)
values ('55555555-5555-4555-8555-555555555551',
        '11111111-1111-4111-8111-111111111111',
        '44444444-4444-4444-8444-444444444444', 'booth-a', 'Booth A', 'online'),
       ('55555555-5555-4555-8555-555555555552',
        '11111111-1111-4111-8111-111111111111',
        '44444444-4444-4444-8444-444444444444', 'booth-b', 'Booth B', 'online')
on conflict (id) do nothing;

insert into packages (id, business_id, name, price, photo_count, print_count, is_active)
values ('66666666-6666-4666-8666-666666666666',
        '11111111-1111-4111-8111-111111111111', 'Paket Verify', 100000, 1, 1, true)
on conflict (id) do nothing;

-- Voucher 50% dengan kuota 1 pemakaian.
insert into vouchers (id, business_id, code, type, amount, usage_limit, min_transaction, is_active)
values ('77777777-7777-4777-8777-777777777777',
        '11111111-1111-4111-8111-111111111111', 'VERIFY50', 'percentage', 50, 1, 0, true)
on conflict (id) do nothing;

-- Dua checkout dari DUA booth berbeda, keduanya membawa voucher yang sama.
-- Inilah precondition N3: keputusan voucher dibekukan saat apply, tidak
-- divalidasi ulang saat settle.
insert into checkout_sessions (id, business_id, outlet_id, photobox_id, package_id,
                               voucher_id, gross_amount, discount_amount, final_amount,
                               status, result_token)
values ('88888888-8888-4888-8888-888888888881',
        '11111111-1111-4111-8111-111111111111',
        '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555551',
        '66666666-6666-4666-8666-666666666666',
        '77777777-7777-4777-8777-777777777777',
        100000, 50000, 50000, 'open', 'tok-verify-1'),
       ('88888888-8888-4888-8888-888888888882',
        '11111111-1111-4111-8111-111111111111',
        '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555552',
        '66666666-6666-4666-8666-666666666666',
        '77777777-7777-4777-8777-777777777777',
        100000, 50000, 50000, 'open', 'tok-verify-2')
on conflict (id) do nothing;

insert into payments (id, business_id, checkout_session_id, outlet_id, photobox_id,
                      package_id, gross_amount, discount_amount, voucher_id, final_amount,
                      order_id, payment_reference, provider, status)
values ('99999999-9999-4999-8999-999999999991',
        '11111111-1111-4111-8111-111111111111',
        '88888888-8888-4888-8888-888888888881',
        '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555551',
        '66666666-6666-4666-8666-666666666666',
        100000, 50000, '77777777-7777-4777-8777-777777777777', 50000,
        'SnapyOS-VERIFY0001', 'VERIFY0001', 'pakasir', 'paid'),
       ('99999999-9999-4999-8999-999999999992',
        '11111111-1111-4111-8111-111111111111',
        '88888888-8888-4888-8888-888888888882',
        '44444444-4444-4444-8444-444444444444',
        '55555555-5555-4555-8555-555555555552',
        '66666666-6666-4666-8666-666666666666',
        100000, 50000, '77777777-7777-4777-8777-777777777777', 50000,
        'SnapyOS-VERIFY0002', 'VERIFY0002', 'pakasir', 'paid')
on conflict (id) do nothing;

-- --------------------------- N3: settle dua kali ----------------------------
-- Kalau fungsi settlement membaca vouchers.usage_limit, panggilan kedua harus
-- gagal/rollback. Kalau tidak, dua baris voucher_usages muncul untuk kuota 1.
do $$
declare
  v_first  record;
  v_second record;
  v_used   integer;
begin
  select * into v_first from settle_paid_payment_atomically(
    '99999999-9999-4999-8999-999999999991', 'TX-VERIFY-1', 'tok-verify-1');
  select * into v_second from settle_paid_payment_atomically(
    '99999999-9999-4999-8999-999999999992', 'TX-VERIFY-2', 'tok-verify-2');

  select count(*) into v_used
    from voucher_usages
   where voucher_id = '77777777-7777-4777-8777-777777777777';

  if v_used > 1 then
    raise notice 'FAIL N3: voucher usage_limit=1 tetapi tercatat % pemakaian (settlement tidak membaca usage_limit)', v_used;
  else
    raise notice 'PASS N3: pemakaian voucher = % (kuota dihormati)', v_used;
  end if;
end $$;

-- --------------------------- N7: dedupe by client_created_at ----------------
-- Dua sesi berbeda dengan started_at identik tidak boleh dianggap replay satu
-- sama lain. Constraint unik parsial hanya menjaga status='active', bukan
-- (photobox_id, started_at).
do $$
declare
  v_dupes integer;
begin
  insert into sessions (id, business_id, outlet_id, photobox_id, package_id,
                        status, started_at, created_at)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
          '11111111-1111-4111-8111-111111111111',
          '44444444-4444-4444-8444-444444444444',
          '55555555-5555-4555-8555-555555555551',
          '66666666-6666-4666-8666-666666666666',
          'expired', timestamptz '2026-10-28 04:00:00+00',
          timestamptz '2026-10-28 04:00:00+00'),
         ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
          '11111111-1111-4111-8111-111111111111',
          '44444444-4444-4444-8444-444444444444',
          '55555555-5555-4555-8555-555555555551',
          '66666666-6666-4666-8666-666666666666',
          'expired', timestamptz '2026-10-28 04:00:00+00',
          timestamptz '2026-10-28 04:00:00+00');

  select count(*) into v_dupes
    from sessions
   where photobox_id = '55555555-5555-4555-8555-555555555551'
     and started_at = timestamptz '2026-10-28 04:00:00+00';

  if v_dupes > 1 then
    raise notice 'FAIL N7: dua sesi dengan started_at identik diterima (dedupe cloud akan menyatukan keduanya)';
  else
    raise notice 'PASS N7: DB menolak started_at duplikat';
  end if;
exception when unique_violation then
  raise notice 'INFO N7: constraint menolak baris duplikat (lead tidak berlaku)';
end $$;

rollback;

-- Catatan: N6 (langganan lapse tetap berjualan), N8 (race kuota paket) dan N9
-- (invoice void tetap bisa dibayar) tidak bisa dibuktikan lewat SQL saja —
-- ketiganya keputusan di lapisan aplikasi (getPlanLimits fail-open, count-then-
-- insert, markInvoicePaid yang early-return). Untuk tiga lead itu perlu harness
-- Node yang memanggil src/server/* dengan PostgREST lokal.
