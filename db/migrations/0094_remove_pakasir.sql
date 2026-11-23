-- 0094 — Hapus total ekosistem Pakasir; Tripay menjadi gateway platform.
--
-- Konteks (2026-11-23): keputusan owner memindahkan invoice subscription
-- SnapyOS ke Tripay (credential platform dari env TRIPAY_*) dan menghapus
-- Pakasir dari seluruh produk. Purge ini SENGAJA menghapus riwayat keuangan
-- Pakasir (payments, invoice_payments, invoices terkait, transactions,
-- voucher_usages, payment_webhooks, payment_credentials, audit_logs terkait).
--
-- PERINGATAN: destruktif dan TIDAK BISA dibatalkan. Rollback hanya
-- mengembalikan struktur/constraint/default — data yang sudah dihapus tidak
-- kembali. Wajib backup tabel terdampak sebelum menjalankan migrasi ini.
--
-- Sesi foto dan data customer TIDAK dihapus; hanya status checkout yang masih
-- `open` dan terhubung ke payment Pakasir yang di-expire agar booth tidak
-- menggantung tanpa payment.
--
-- Idempoten: aman dijalankan ulang (delete/alter bersifat idempotent).

begin;

-- ---------------------------------------------------------------------------
-- 1. Kumpulkan ID target SEBELUM ada yang dihapus.
-- ---------------------------------------------------------------------------
create temp table tmp_pakasir_payments on commit drop as
  select id, order_id, transaction_id, checkout_session_id
    from payments
   where provider = 'pakasir';

create temp table tmp_pakasir_invoice_payments on commit drop as
  select id, invoice_id, order_id
    from invoice_payments
   where provider = 'pakasir';

create temp table tmp_pakasir_invoice_ids on commit drop as
  select distinct invoice_id as id from tmp_pakasir_invoice_payments;

create temp table tmp_pakasir_tx_ids on commit drop as
  select id from transactions
   where payment_id in (select id from tmp_pakasir_payments)
  union
  select transaction_id from tmp_pakasir_payments where transaction_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Laporkan cakupan purge (terlihat di log migrasi).
-- ---------------------------------------------------------------------------
do $$
declare
  n_pay bigint;
  n_invpay bigint;
  n_inv bigint;
  n_tx bigint;
begin
  select count(*) into n_pay from tmp_pakasir_payments;
  select count(*) into n_invpay from tmp_pakasir_invoice_payments;
  select count(*) into n_inv from tmp_pakasir_invoice_ids;
  select count(*) into n_tx from tmp_pakasir_tx_ids;
  raise notice '0094: purge Pakasir — payments=%, invoice_payments=%, invoices=%, transactions=%',
    n_pay, n_invpay, n_inv, n_tx;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Hapus turunan dulu, lalu induk.
-- ---------------------------------------------------------------------------
delete from voucher_usages v
 using tmp_pakasir_payments p
 where v.payment_id = p.id;

delete from voucher_usages v
 using tmp_pakasir_tx_ids t
 where v.transaction_id = t.id;

delete from payment_webhooks w
 where w.provider = 'pakasir'
    or w.payment_id in (select id from tmp_pakasir_payments);

delete from transactions t
 using tmp_pakasir_tx_ids x
 where t.id = x.id;

delete from payments p
 using tmp_pakasir_payments x
 where p.id = x.id;

update checkout_sessions c
   set status = 'expired'
 where c.status = 'open'
   and c.id in (
     select checkout_session_id
       from tmp_pakasir_payments
      where checkout_session_id is not null
   );

delete from invoice_payments ip
 using tmp_pakasir_invoice_payments x
 where ip.id = x.id;

-- invoices: cascade subscription_intent_failures; business_template_purchases
-- .invoice_id menjadi NULL (entitlement tetap).
delete from invoices i
 using tmp_pakasir_invoice_ids x
 where i.id = x.id;

-- ---------------------------------------------------------------------------
-- 4. Hapus jejak audit Pakasir (target/order/provider/setting).
-- ---------------------------------------------------------------------------
delete from audit_logs a
 where a.target in (
         select id::text from tmp_pakasir_payments
         union
         select id::text from tmp_pakasir_invoice_payments
         union
         select id::text from tmp_pakasir_invoice_ids
       )
    or a.meta->>'order_id' in (
         select order_id from tmp_pakasir_payments where order_id is not null
         union
         select order_id from tmp_pakasir_invoice_payments where order_id is not null
       )
    or (a.action = 'admin.gateway.toggle' and a.target = 'pakasir')
    or (a.action = 'admin.settings.update' and a.meta ? 'gateway_pakasir_enabled');

-- ---------------------------------------------------------------------------
-- 5. Hapus konfigurasi Pakasir.
-- ---------------------------------------------------------------------------
delete from payment_credentials
 where provider = 'pakasir';

delete from platform_settings
 where key = 'gateway_pakasir_enabled';

-- ---------------------------------------------------------------------------
-- 6. Skema pasca-purge: tidak ada default Pakasir, provider dibatasi.
-- ---------------------------------------------------------------------------
alter table payments alter column provider drop default;
alter table invoice_payments alter column provider drop default;

alter table invoice_payments drop constraint if exists invoice_payments_provider_check;
alter table invoice_payments add constraint invoice_payments_provider_check
  check (provider in ('midtrans', 'tripay'));

alter table payment_credentials drop constraint if exists payment_credentials_provider_check;
alter table payment_credentials add constraint payment_credentials_provider_check
  check (provider in ('midtrans', 'tripay'));

-- ---------------------------------------------------------------------------
-- 7. Post-check: gagal keras bila masih ada jejak Pakasir.
-- ---------------------------------------------------------------------------
do $$
declare
  sisa text;
begin
  select string_agg(source || '=' || n, ', ')
    into sisa
    from (
      select 'payments' as source, count(*) as n from payments where provider = 'pakasir'
      union all
      select 'invoice_payments', count(*) from invoice_payments where provider = 'pakasir'
      union all
      select 'payment_credentials', count(*) from payment_credentials where provider = 'pakasir'
      union all
      select 'payment_webhooks', count(*) from payment_webhooks where provider = 'pakasir'
      union all
      select 'platform_settings', count(*) from platform_settings where key = 'gateway_pakasir_enabled'
    ) s
   where n > 0;

  if sisa is not null then
    raise exception '0094 gagal: masih ada jejak Pakasir: %', sisa;
  end if;

  raise notice '0094 selesai: seluruh jejak Pakasir dihapus';
end;
$$;

commit;
