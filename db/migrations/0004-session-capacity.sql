-- 0004-session-capacity.sql
-- Limit sesi diperketat: 1 sesi AKTIF per photobox, ditegakkan atomik oleh DB
-- (anti TOCTOU race antar booth — docs/05 §5.1b, docs/02 §2.3).
-- Insert sesi 'active' kedua untuk photobox yang sama gagal dengan 23505;
-- server memetakan error itu ke SESSION_LIMIT_REACHED (kiosk-sessions.ts).
create unique index if not exists uq_sessions_active_per_photobox
  on sessions (photobox_id)
  where status = 'active';

-- Index pendukung cek kapasitas business (plan max_concurrent_sessions).
create index if not exists idx_sessions_business_active
  on sessions (business_id, status, expires_at);
