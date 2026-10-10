-- 0029: Reservation `creating` mencegah request paralel menerbitkan dua QR
-- provider untuk invoice maupun checkout kiosk yang sama.

alter table invoice_payments drop constraint if exists invoice_payments_status_check;
alter table invoice_payments add constraint invoice_payments_status_check
  check (status in ('creating', 'pending', 'paid', 'expired'));

alter table payments drop constraint if exists payments_status_check;
alter table payments add constraint payments_status_check
  check (status in ('creating', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'refunded'));

-- Data lama: sisakan attempt aktif terbaru per invoice sebelum index dibuat.
with ranked as (
  select id,
         row_number() over (partition by invoice_id order by created_at desc, id desc) as position
    from invoice_payments
   where status in ('creating', 'pending')
)
update invoice_payments p
   set status = 'expired'
  from ranked r
 where p.id = r.id
   and r.position > 1;

create unique index if not exists uq_invpay_active_per_invoice
  on invoice_payments (invoice_id)
  where status in ('creating', 'pending');

-- Data lama: sisakan QR aktif terbaru per checkout sebelum index dibuat.
with ranked as (
  select id,
         row_number() over (partition by checkout_session_id order by created_at desc, id desc) as position
    from payments
   where status in ('creating', 'pending')
)
update payments p
   set status = 'expired'
  from ranked r
 where p.id = r.id
   and r.position > 1;

create unique index if not exists uq_payment_active_per_checkout
  on payments (checkout_session_id)
  where status in ('creating', 'pending');