-- 0050_support_tickets.sql
-- Tiket bantuan owner — docs/04 §4.20 (baru). Owner submit masalah (kategori +
-- deskripsi + bagian mana), sistem mencatat status perjalanan:
--   open         → tiket baru, menunggu ditinjau tim SnapyOS.
--   needs_action → tim butuh info/tindakan tambahan dari owner.
--   resolved     → masalah selesai.
-- Admin platform melihat seluruh tiket lintas tenant dan mengubah status.
--
-- Additive-only. Rollback: 0050_support_tickets_rollback.sql.

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  created_by uuid not null references users (id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 200),
  category text not null check (char_length(category) between 1 and 60),
  area text not null check (char_length(area) between 1 and 60),
  description text not null check (char_length(description) between 1 and 4000),
  status text not null default 'open'
    check (status in ('open', 'needs_action', 'resolved')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_support_tickets_business on support_tickets (business_id, created_at desc);
create index if not exists idx_support_tickets_status on support_tickets (status);

create table if not exists support_ticket_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets (id) on delete cascade,
  author_id uuid not null references users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists idx_support_ticket_replies_ticket on support_ticket_replies (ticket_id, created_at);

drop trigger if exists trg_support_tickets_updated_at on support_tickets;
create trigger trg_support_tickets_updated_at before update on support_tickets
  for each row execute function set_updated_at();
