-- 0058_broadcast_kind_template_history.sql
-- Perluasan broadcast email (0057): jenis marketing + template + riwayat detail.
--   kind            → jenis broadcast (announcement/promo/newsletter/event/system)
--   template_key    → template HTML brutalist yang dipakai saat render
--   recipients      → tambah name (nama penerima), provider_message_id (id Resend),
--                     resend_count, last_sent_at, last_error (riwayat kirim jelas).

alter table broadcast_campaigns
  add column if not exists kind text not null default 'announcement'
    check (kind in ('announcement', 'promo', 'newsletter', 'event', 'system'));

alter table broadcast_campaigns
  add column if not exists template_key text not null default 'default'
    check (template_key in ('default', 'announcement', 'promo', 'newsletter', 'event', 'system'));

alter table broadcast_recipients
  add column if not exists name text;

alter table broadcast_recipients
  add column if not exists provider_message_id text;

alter table broadcast_recipients
  add column if not exists resend_count integer not null default 0;

alter table broadcast_recipients
  add column if not exists last_sent_at timestamptz;

alter table broadcast_recipients
  add column if not exists last_error text;

create index if not exists idx_broadcast_recipients_kind on broadcast_recipients (kind);
