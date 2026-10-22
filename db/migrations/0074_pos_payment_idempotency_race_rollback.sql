begin;

-- Jangan membalikkan invariant finansial POS: transaksi offline tetap
-- non-withdrawable walaupun body RPC dikembalikan ke perilaku sebelum 0074.

create or replace function pos_complete_payment(
  p_order_id uuid,
  p_business uuid,
  p_method text,
  p_cashier uuid,
  p_tx_number text,
  p_outlet_id uuid,
  p_photobox_id uuid,
  p_gross integer,
  p_discount integer,
  p_final integer
) returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_tx_id uuid;
  v_existing uuid;
begin
  select id into v_existing
    from transactions
   where pos_order_id = p_order_id
   limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  update pos_orders
     set status = 'paid',
         paid_at = now(),
         payment_method = p_method
   where id = p_order_id
     and business_id = p_business
     and status = 'pending';

  if not found then
    return null;
  end if;

  insert into transactions (
    business_id, outlet_id, photobox_id, session_id, package_id,
    payment_method, gross_amount, discount_amount, final_amount,
    status, number, pos_order_id, cashier_user_id, paid_at, withdrawable
  ) values (
    p_business, p_outlet_id, p_photobox_id, null, null,
    p_method, p_gross, p_discount, p_final,
    'paid', p_tx_number, p_order_id, p_cashier, now(), false
  )
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

commit;
