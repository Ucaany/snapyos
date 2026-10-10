-- Rollback 0066 — kembalikan CHECK tanpa 'received'.
--
-- AMAN (bukan destruktif): baris berstatus 'received' DIPROMOSIKAN ke 'error'
-- (bukan dihapus) — mempertahankan jejak audit + baris idempotency event_id.
-- Redelivery event error tetap boleh diproses ulang, jadi settlement tidak
-- hilang. Setelah tidak ada baris 'received', CHECK dipersempit kembali.

begin;

update payment_webhooks set status = 'error' where status = 'received';

alter table payment_webhooks drop constraint if exists payment_webhooks_status_check;
alter table payment_webhooks add constraint payment_webhooks_status_check
  check (status in ('processed', 'ignored', 'error'));

commit;
