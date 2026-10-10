-- Transaksi manual non-withdrawable — Fase 3 STEP 4.
-- Uang manual/offline tercatat untuk reporting tapi TIDAK PERNAH masuk
-- saldo withdrawable (balances hanya dikredit dari settlement QRIS Pakasir).
-- DICERMINKAN di db/schema.sql (baseline akumulasi).

-- Enum payment_method baru 'manual' (pengganti cash/bank_transfer generik
-- untuk pencatatan manual owner).
alter table transactions drop constraint if exists transactions_payment_method_check;
alter table transactions add constraint transactions_payment_method_check
  check (payment_method in ('qris', 'cash', 'bank_transfer', 'other', 'offline', 'gateway', 'manual'));

-- Flag withdrawable: manual & offline → false; QRIS Pakasir → true (default).
alter table transactions
  add column if not exists withdrawable boolean not null default true;

-- Total gross payments withdrawable (join ke transactions) — ceiling
-- tambahan penarikan + transparansi overview (migrasi 0032 § RPC agregasi).
create or replace function withdrawable_payments_sum(p_business uuid)
returns bigint
language sql stable as $$
  select coalesce(sum(p.final_amount), 0)::bigint
    from payments p
    join transactions t on t.id = p.transaction_id
   where p.business_id = p_business
     and p.status = 'paid'
     and t.withdrawable is true;
$$;
