-- 0055 — Per-booth payment channel (gateway vs voucher).
-- `payment_mode` null = keduanya aktif (default, backward compatible).
-- 'gateway' = hanya metode payment gateway (+ tunai), voucher disembunyikan.
-- 'voucher' = hanya voucher (+ tunai), payment gateway disembunyikan.

alter table photoboxes
  add column payment_mode text check (payment_mode in ('gateway', 'voucher'));

comment on column photoboxes.payment_mode is
  'Saluran pembayaran per-booth (null = gateway + voucher; gateway = hanya gateway; voucher = hanya voucher).';
