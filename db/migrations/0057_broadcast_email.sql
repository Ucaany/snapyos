-- Migration 0057 — Broadcast/marketing email admin (Resend) + resend limit.
-- Admin full-control: kirim pengumuman/marketing email ke users & businesses,
-- lacak status per penerima, dan kirim ulang (resend) dengan batas maksimum
-- per kampanye. Delivery via Resend (env RESEND_API_KEY / RESEND_FROM).

create table broadcast_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (char_length(subject) between 1 and 200),
  body text not null check (char_length(body) >= 1),
  audience text not null default 'all'
    check (audience in ('all', 'users', 'owners')),
  status text not null default 'draft'
    check (status in ('draft', 'sending', 'sent', 'partial', 'failed')),
  max_resend integer not null default 3 check (max_resend between 0 and 10),
  resend_count integer not null default 0 check (resend_count >= 0),
  created_by uuid references users (id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_broadcast_campaigns_status on broadcast_campaigns (status, created_at desc);

create table broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references broadcast_campaigns (id) on delete cascade,
  email text not null check (char_length(email) between 3 and 254),
  kind text not null check (kind in ('user', 'business')),
  user_id uuid references users (id) on delete set null,
  business_id uuid references businesses (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_broadcast_recipients_campaign on broadcast_recipients (campaign_id, status);
create index idx_broadcast_recipients_email on broadcast_recipients (email);

create trigger trg_broadcast_campaigns_updated_at before update on broadcast_campaigns
  for each row execute function set_updated_at();
