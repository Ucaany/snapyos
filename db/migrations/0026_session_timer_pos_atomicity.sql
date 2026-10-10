-- ============================================================================
-- 0026: Session timer from payment paid_at + POS payment atomicity
--
-- Bug 1: Session timer starts at createSession() (Date.now()), not at
--         payment paid_at. Customer can pay, wait, then get full duration.
--         Fix: application-level — no schema change needed (computeExpiresAt
--         receives paid_at timestamp). No migration required.
--
-- Bug 2a: POS payment non-atomic: UPDATE pos_orders + INSERT transactions
--          are separate operations. Server crash between them leaves order
--          paid without financial record. Fix: atomic RPC.
--
-- Bug 2b: transactions.pos_order_id has no UNIQUE constraint. App-level
--          idempotency guard can race. Fix: partial unique index.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Atomic POS payment: conditional UPDATE pos_orders + INSERT transactions
-- in one DB transaction. Stock decrement stays app-level (shortfall is
-- non-blocking by design — docs/pos/03 §4).
-- Returns NULL on failure (order not found, not pending, or tx already exists).
-- Returns the new transaction id on success.
-- ---------------------------------------------------------------------------
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
as $$
declare
  v_tx_id uuid;
  v_existing uuid;
begin
  -- Idempotency: transaction already exists for this POS order → return it.
  select id into v_existing
    from transactions
   where pos_order_id = p_order_id
   limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Conditional UPDATE: pending → paid (single winner).
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

  -- Insert transaction atomically in same DB transaction.
  insert into transactions (
    business_id, outlet_id, photobox_id, session_id, package_id,
    payment_method, gross_amount, discount_amount, final_amount,
    status, number, pos_order_id, cashier_user_id, paid_at
  ) values (
    p_business, p_outlet_id, p_photobox_id, null, null,
    p_method, p_gross, p_discount, p_final,
    'paid', p_tx_number, p_order_id, p_cashier, now()
  )
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Partial unique index: one transaction per POS order (safety net for
-- app-level idempotency guard). Rows with pos_order_id IS NULL (kiosk
-- transactions) are unaffected.
-- ---------------------------------------------------------------------------
create unique index if not exists idx_tx_pos_order_unique
  on transactions (pos_order_id)
  where pos_order_id is not null;
