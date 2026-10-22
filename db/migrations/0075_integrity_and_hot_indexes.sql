-- 0075: integritas referensi + index jalur panas.
--
-- 1. photoboxes.default_template_id tidak punya FK padahal docs/07 menyebut
--    `uuid → templates.id`. Tanpa FK, template yang dihapus meninggalkan id
--    menggantung di booth. Tabel templates dibuat (372) setelah photoboxes
--    (210), jadi FK-nya tertunda seperti payments.credential_id (0027).
-- 2. Index FK payments.credential_id: Postgres tidak membuat index otomatis
--    untuk kolom FK, sehingga ON DELETE SET NULL memindai seluruh payments.
-- 3. Index parsial payments(expires_at) untuk cron payment-recovery yang
--    memindai `status = 'pending' and expires_at < now()` tiap menit.

begin;

alter table photoboxes
  add constraint photoboxes_default_template_id_fkey
  foreign key (default_template_id) references templates (id) on delete set null;

create index if not exists idx_photoboxes_default_template
  on photoboxes (default_template_id)
  where default_template_id is not null;

create index if not exists idx_payments_credential
  on payments (credential_id)
  where credential_id is not null;

create index if not exists idx_payments_pending_expiry
  on payments (expires_at)
  where status = 'pending';

commit;
