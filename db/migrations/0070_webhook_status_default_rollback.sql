-- Rollback 0070: kembalikan default `payment_webhooks.status` ke 'processed'.
--
-- AMAN (bukan destruktif): hanya mengubah DEFAULT kolom, tidak menyentuh baris
-- yang sudah ada. Baris yang tersimpan tetap membawa status masing-masing.

begin;

alter table payment_webhooks alter column status set default 'processed';

commit;
