-- 0009: marker cleanup retention — session yang sudah dibersihkan tidak boleh
-- kembali match query cron (backlog > limit tidak pernah tersalirkan).
-- Idempotent — aman dijalankan berulang / pada baseline schema baru.

alter table sessions add column if not exists media_cleaned_at timestamptz;

create index if not exists idx_sessions_media_pending
  on sessions (business_id, finalized_at)
  where media_cleaned_at is null and status in ('completed', 'expired');
