-- 0040 — Fix settle_paid_payment_atomically: remove 'gateway' enum value.
--
-- Bug: migration 0031 created settle_paid_payment_atomically with a three-way
-- CASE that writes payment_method='gateway' for direct-merchant payments
-- (credential_id IS NOT NULL). Migration 0036 dropped 'gateway' from the
-- transactions.payment_method CHECK constraint and emitted a NEW function
-- settle_qris_payment with the correct two-way CASE ('cash'/'qris') — but
-- never patched the ORIGINAL function the app actually calls.
--
-- Result: any webhook settlement for a direct-merchant payment violates the
-- CHECK constraint → entire settlement rolls back → production error.
--
-- Fix:
--   1. CREATE OR REPLACE settle_paid_payment_atomically with the corrected
--      payment_method CASE (cash | qris) while preserving the ORIGINAL return
--      signature (transaction_number, result_token, settled_now), idempotency
--      (ON CONFLICT DO NOTHING), FOR UPDATE ordering, and balance ledger logic
--      that settle_qris_payment omitted.
--   2. DROP settle_qris_payment (dead code — never called by app).
--
-- Rollback: re-create old settle_paid_payment_atomically from 0031 (accepts
-- 'gateway') and re-add 'gateway' to CHECK; but this is a bug — rolling back
-- means re-introducing the broken enum value.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Patch settle_paid_payment_atomically
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Drop dead function settle_qris_payment (0036 — never called by app code).
-- ═══════════════════════════════════════════════════════════════════════════════

drop function if exists settle_qris_payment(uuid, text, text);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Post-check: verify no 'gateway' in function body.
-- ═══════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_body text;
begin
  select pg_get_functiondef(oid) into v_body
    from pg_proc
   where proname = 'settle_paid_payment_atomically';
  if v_body is null then
    raise exception '[0040] settle_paid_payment_atomically not found';
  end if;
  if v_body ilike '%gateway%' then
    raise exception '[0040] ASSERT FAIL: settle_paid_payment_atomically still contains gateway: %', v_body;
  end if;

  -- settle_qris_payment must not exist
  perform 1 from pg_proc where proname = 'settle_qris_payment';
  if found then
    raise exception '[0040] ASSERT FAIL: settle_qris_payment still exists after DROP';
  end if;

  raise notice '[0040] settle_paid_payment_atomically patched OK; settle_qris_payment dropped.';
end$$;
