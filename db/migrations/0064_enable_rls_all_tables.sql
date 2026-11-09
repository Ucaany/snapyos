-- 0064 — C1 (CRITICAL): Enable Row Level Security pada SEMUA tabel publik.
--
-- Latar: audit 2026-10-08 — hanya 2/55 tabel punya `enable row level security`
-- (auth_sessions, subscription_intent_failures). Tabel sensitif
-- (payment_credentials.server_key_encrypted, business_members.pin_hash,
-- photoboxes.exit_pin_hash, transactions, payments) world-readable lewat
-- PostgREST bila anon/authenticated dapat menjangkau skema public.
--
-- Aplikasi HANYA memakai service_role (src/lib/supabase/server.ts); anon key
-- tidak dipakai client. Migrasi ini menutup blast radius PostgREST
-- (defense-in-depth): RLS ON + satu policy `svc_all` untuk service_role +
-- revoke dari anon/authenticated. Pola mengikuti `subscription_intent_failures`
-- (schema.sql, cari "alter table subscription_intent_failures enable row level
-- security"): RLS ON, TANPA policy `to public`/`anon`/`authenticated`.
--
-- Idempotent: `alter table if exists ... enable row level security` aman diulang;
-- `drop policy if exists` lalu `create policy` untuk memastikan bentuk final.

begin;

-- Setiap tabel: RLS ON, tutup jalur anon/authenticated, izinkan penuh service_role.
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
    'storage_objects','storage_usage','installer_catalog'
  ];
begin
  foreach t in array tbls loop
    execute format('alter table if exists %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('grant all on %I to service_role', t);
    execute format('drop policy if exists svc_all on %I', t);
    execute format(
      'create policy svc_all on %I for all to service_role using (true) with check (true)',
      t
    );
  end loop;
end $$;

commit;
