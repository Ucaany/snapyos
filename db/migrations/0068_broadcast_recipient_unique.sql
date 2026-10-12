-- 0068_broadcast_recipient_unique.sql
-- Broadcast email: satu penerima unik per kampanye (campaign_id, email).
-- Dibutuhkan agar persistRecipients() dapat upsert tanpa menggandakan baris
-- dan tanpa menghapus riwayat (id/resend_count) saat re-send.
-- Dedup data lama lebih dulu; simpan baris terbaru (created_at DESC).

with ranked as (
  select id,
         row_number() over (
           partition by campaign_id, lower(email)
           order by created_at desc, id desc
         ) as rn
  from broadcast_recipients
)
delete from broadcast_recipients br
using ranked r
where br.id = r.id and r.rn > 1;

create unique index if not exists uq_broadcast_recipients_campaign_email
  on broadcast_recipients (campaign_id, lower(email));
