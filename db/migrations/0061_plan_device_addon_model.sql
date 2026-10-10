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

begin;

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

commit;
