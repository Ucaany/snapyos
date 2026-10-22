begin;

drop index if exists idx_payments_pending_expiry;
drop index if exists idx_payments_credential;
drop index if exists idx_photoboxes_default_template;
alter table photoboxes drop constraint if exists photoboxes_default_template_id_fkey;

commit;
