-- Rollback 0064 — matikan RLS & policy svc_all yang ditambahkan.
--
-- PERINGATAN: rollback ini membuka kembali akses anon/authenticated ke seluruh
-- tabel (kembali ke kondisi pra-hardening). Jalankan hanya bila benar-benar
-- akan mengembalikan eksposur PostgREST. auth_sessions &
-- subscription_intent_failures sengaja dikembalikan ke kondisi "RLS ON tanpa
-- svc_all" karena keduanya sudah RLS ON sebelum 0064.

begin;

do $$
declare
  t text;
  tbls text[] := array[
    'users','auth_sessions','businesses','business_members','business_settings',
    'plans','subscriptions','invoices','add_ons','subscription_add_ons','outlets',
    'photoboxes','member_photoboxes','devices','activation_codes','packages',
    'template_categories','templates','stickers','package_templates',
    'package_outlets','package_photoboxes','business_template_purchases','sessions',
    'photos','pos_products','pos_orders','pos_order_items','transactions',
    'checkout_sessions','payments','invoice_payments','payment_webhooks','customers',
    'bookings','expenses','vouchers','voucher_packages','voucher_outlets',
    'voucher_usages','events','event_templates','platform_settings','audit_logs',
    'support_tickets','support_ticket_replies','broadcast_campaigns',
    'broadcast_recipients','lifecycle_emails','subscription_promos',
    'payment_credentials','device_logs','subscription_intent_failures',
    'storage_objects','storage_usage'
  ];
begin
  foreach t in array tbls loop
    execute format('drop policy if exists svc_all on %I', t);
  end loop;
end $$;

-- auth_sessions & subscription_intent_failures tetap RLS ON (memang sudah).
-- Tabel lain dikembalikan ke RLS OFF (kondisi pra-0064).
do $$
declare
  t text;
  tbls text[] := array[
    'users','businesses','business_members','business_settings','plans',
    'subscriptions','invoices','add_ons','subscription_add_ons','outlets',
    'photoboxes','member_photoboxes','devices','activation_codes','packages',
    'template_categories','templates','stickers','package_templates',
    'package_outlets','package_photoboxes','business_template_purchases','sessions',
    'photos','pos_products','pos_orders','pos_order_items','transactions',
    'checkout_sessions','payments','invoice_payments','payment_webhooks','customers',
    'bookings','expenses','vouchers','voucher_packages','voucher_outlets',
    'voucher_usages','events','event_templates','platform_settings','audit_logs',
    'support_tickets','support_ticket_replies','broadcast_campaigns',
    'broadcast_recipients','lifecycle_emails','subscription_promos',
    'payment_credentials','device_logs','storage_objects','storage_usage'
  ];
begin
  foreach t in array tbls loop
    execute format('alter table if exists %I disable row level security', t);
  end loop;
end $$;

-- grant/revoke anon/tidak dikembalikan (tidak melacak state pra-0064 per tabel).
-- Bila perlu eksposur lagi, lakukan eksplisit via Supabase dashboard.

commit;
