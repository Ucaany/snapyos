-- Rollback 0094 — kembalikan skema Pakasir.
--
-- PERINGATAN: HANYA STRUKTUR/DEFAULT/CONSTRAINT yang dipulihkan. Migrasi 0094
-- menghapus data keuangan Pakasir secara permanen; data tidak kembali lewat
-- rollback ini. Pulihkan dari backup bila data diperlukan.
--
-- Idempoten.

begin;

alter table payments alter column provider set default 'pakasir';
alter table invoice_payments alter column provider set default 'pakasir';

-- invoice_payments sebelumnya tidak punya check provider.
alter table invoice_payments drop constraint if exists invoice_payments_provider_check;

alter table payment_credentials drop constraint if exists payment_credentials_provider_check;
alter table payment_credentials add constraint payment_credentials_provider_check
  check (provider in ('midtrans', 'tripay', 'pakasir'));

insert into platform_settings (key, value) values
  ('gateway_pakasir_enabled', 'true'::jsonb)
on conflict (key) do nothing;

commit;
