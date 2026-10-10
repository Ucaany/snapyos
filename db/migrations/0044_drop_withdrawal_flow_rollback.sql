-- 0044_drop_withdrawal_flow_rollback.sql
-- Kembalikan flow withdrawal bila migration 0044 harus di-revert.
--
-- Membuat ulang:
--   - Tabel `balances`, `balance_ledger`, `withdrawals`.
--   - RPC `withdrawable_payments_sum`.
--   - Setting platform `min_withdrawal_amount`, `withdrawal_days`,
--     `withdrawal_sla_hours`.
--   - Branch balance-credit di `settle_paid_payment_atomically`.
--
-- Catatan: data saldo/withdrawal yang sudah ter-drop TIDAK bisa dipulihkan
-- (rollback hanya memulihkan struktur + logika, bukan data historis).

-- 1. Buat ulang tabel settlement & withdrawal.
create table if not exists balances (
  business_id uuid primary key references businesses (id) on delete cascade,
  available integer not null default 0 check (available >= 0),
  pending integer not null default 0 check (pending >= 0),
  lifetime_earned integer not null default 0 check (lifetime_earned >= 0),
  lifetime_withdrawn integer not null default 0 check (lifetime_withdrawn >= 0),
  updated_at timestamptz not null default now()
);
create trigger trg_balances_updated_at before update on balances
  for each row execute function set_updated_at();

create table if not exists balance_ledger (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  type text not null check (type in ('credit', 'debit', 'receivable')),
  amount integer not null check (amount > 0),
  source text not null default 'adjustment'
    check (source in ('payment', 'withdrawal', 'refund', 'adjustment', 'platform_fee')),
  source_id uuid,
  balance_after integer not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_ledger_business on balance_ledger (business_id, created_at);
create unique index if not exists uq_ledger_platform_fee_source
  on balance_ledger (source, source_id) where source = 'platform_fee';
create unique index if not exists uq_ledger_payment_source
  on balance_ledger (source, source_id) where source = 'payment';

create table if not exists withdrawals (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  requested_by uuid not null references users (id) on delete restrict,
  amount integer not null check (amount > 0),
  bank_name text not null,
  bank_account_number text not null,
  bank_account_name text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'rejected', 'failed')),
  reference text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_withdrawals_business on withdrawals (business_id, status);
create trigger trg_withdrawals_updated_at before update on withdrawals
  for each row execute function set_updated_at();

-- 2. Buat ulang RPC withdrawable_payments_sum.
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

-- 3. Pulihkan setting withdrawal.
insert into platform_settings (key, value) values
  ('min_withdrawal_amount', '10000'::jsonb),
  ('withdrawal_days', '[0,1,2,3,4,5,6]'::jsonb),
  ('withdrawal_sla_hours', '24'::jsonb)
on conflict (key) do nothing;

-- 4. Pulihkan branch balance-credit di settle_paid_payment_atomically.
create or replace function settle_paid_payment_atomically(
  p_payment_id uuid,
  p_transaction_number text,
  p_result_token text
) returns table (transaction_number text, result_token text, settled_now boolean)
language plpgsql
as $$
declare
  v_payment payments%rowtype;
  v_checkout checkout_sessions%rowtype;
  v_transaction_id uuid;
  v_balance_after integer;
  v_fee integer;
  v_credit integer;
  v_percent numeric;
  v_flat integer;
  v_settled_now boolean := false;
begin
  select * into v_payment from payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'paid' then raise exception 'paid payment not found'; end if;
  select * into v_checkout from checkout_sessions where id = v_payment.checkout_session_id for update;
  if not found then raise exception 'checkout not found'; end if;

  v_transaction_id := v_payment.transaction_id;
  if v_transaction_id is null then
    insert into transactions (
      business_id, outlet_id, photobox_id, package_id, payment_id, payment_method,
      gross_amount, discount_amount, final_amount, voucher_id, status, number, paid_at
    ) values (
      v_payment.business_id, v_payment.outlet_id, v_payment.photobox_id, v_payment.package_id,
      v_payment.id,
      case when v_payment.provider = 'cash' then 'cash' else 'qris' end,
      v_payment.gross_amount, v_payment.discount_amount, v_payment.final_amount,
      v_payment.voucher_id, 'paid', p_transaction_number, coalesce(v_payment.paid_at, now())
    ) returning id into v_transaction_id;
    update payments set transaction_id = v_transaction_id where id = v_payment.id;
    v_settled_now := true;
  end if;

  if v_payment.voucher_id is not null then
    insert into voucher_usages (voucher_id, business_id, transaction_id, payment_id, discount_amount)
    values (v_payment.voucher_id, v_payment.business_id, v_transaction_id, v_payment.id, v_payment.discount_amount)
    on conflict (payment_id) where payment_id is not null do nothing;
  end if;

  if v_checkout.status <> 'paid' then
    update checkout_sessions
       set status = 'paid', result_token = coalesce(v_checkout.result_token, p_result_token)
     where id = v_checkout.id;
  end if;

  if v_payment.credential_id is not null and v_payment.final_amount > 0 then
    select plans.platform_fee_percent, plans.platform_fee_flat into v_percent, v_flat
      from subscriptions join plans on plans.id = subscriptions.plan_id
     where subscriptions.business_id = v_payment.business_id
       and subscriptions.status in ('trial', 'active', 'past_due')
     order by subscriptions.created_at desc limit 1;
    v_fee := least(v_payment.final_amount, greatest(0, floor(v_payment.final_amount * coalesce(v_percent, 0) / 100)::integer + coalesce(v_flat, 0)));
    if v_fee > 0 then
      insert into balance_ledger (business_id, type, amount, source, source_id, balance_after)
      values (v_payment.business_id, 'receivable', v_fee, 'platform_fee', v_payment.id, 0)
      on conflict (source, source_id) where source = 'platform_fee' do nothing;
    end if;
  elsif v_payment.provider <> 'cash' and v_payment.final_amount > 0
    and not exists (
      select 1 from balance_ledger where source = 'payment' and source_id = v_payment.id
    ) then
    select plans.platform_fee_percent, plans.platform_fee_flat into v_percent, v_flat
      from subscriptions join plans on plans.id = subscriptions.plan_id
     where subscriptions.business_id = v_payment.business_id
       and subscriptions.status in ('trial', 'active', 'past_due')
     order by subscriptions.created_at desc limit 1;
    v_fee := least(v_payment.final_amount, greatest(0, floor(v_payment.final_amount * coalesce(v_percent, 0) / 100)::integer + coalesce(v_flat, 0)));
    v_credit := v_payment.final_amount - v_fee;
    insert into balances (business_id, available, lifetime_earned)
    values (v_payment.business_id, v_credit, v_credit)
    on conflict (business_id) do update
      set available = balances.available + excluded.available,
          lifetime_earned = balances.lifetime_earned + excluded.lifetime_earned
    returning available into v_balance_after;
    insert into balance_ledger (business_id, type, amount, source, source_id, balance_after)
    values (v_payment.business_id, 'credit', v_credit, 'payment', v_payment.id, v_balance_after)
    on conflict (source, source_id) where source = 'payment' do nothing;
  end if;

  return query select (
    select number from transactions where id = v_transaction_id
  ), coalesce(v_checkout.result_token, p_result_token), v_settled_now;
end;
$$;
