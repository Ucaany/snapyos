-- Migration 0060 — Subscription lifecycle email otomatis (Resend).
-- Idempotensi pengiriman: satu email per (email, kind, ref). ref = business_id
-- untuk welcome/expiry, invoice_id untuk subscription_started. Partial unique
-- index hanya menahan baris yang belum dikirim (status='pending') agar retry
-- tidak diblokir oleh baris gagal yang sudah final.

create table lifecycle_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 3 and 254),
  kind text not null
    check (kind in ('welcome', 'subscription_started', 'expiry_reminder')),
  ref text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  subject text not null,
  provider_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index idx_lifecycle_emails_pending_unique
  on lifecycle_emails (email, kind, ref)
  where status = 'pending';

create index idx_lifecycle_emails_ref on lifecycle_emails (kind, ref);
