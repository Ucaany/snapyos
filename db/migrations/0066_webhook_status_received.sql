-- 0066 — H3 (HIGH): status `received` pada payment_webhooks untuk idempotency
-- state-aware.
--
-- Latar: `persist({status:'processed'})` dipanggil SEBELUM server-to-server
-- re-verify (direct-webhook.ts:131, invoice.ts). Bila verify gagal, baris
-- `processed` sudah ada → redelivery event_id yang sama dianggap
-- `duplicate_event` → paid TIDAK pernah tersettle. Perbaikan: catat
-- non-authoritative `received` dulu, promosikan ke `processed` HANYA setelah
-- settlement sukses; deteksi duplikat sadar-status (received/error boleh retry).
--
-- Forward-only + rollback: menambah nilai enum, lalu (rollback) menyempitkan
-- kembali (perlu tidak ada baris 'received').

begin;

alter table payment_webhooks drop constraint if exists payment_webhooks_status_check;
alter table payment_webhooks add constraint payment_webhooks_status_check
  check (status in ('received', 'processed', 'ignored', 'error'));

commit;
