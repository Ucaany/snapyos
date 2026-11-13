-- 0091: token undangan staff, token reset password, dan batas keras 2
-- credential pembayaran aktif per business.
--
-- Token disimpan sebagai SHA-256 hex (bukan plaintext). Plaintext hanya ada di
-- email/link yang dikirim ke penerima; database tidak pernah menyimpannya.

create table if not exists staff_invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  email text not null,
  role text not null check (role in ('manager', 'staff')),
  token_hash text not null unique,
  invited_by uuid not null references users (id) on delete cascade,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references users (id) on delete set null,
  revoked_at timestamptz,
  delivery_status text not null default 'pending'
    check (delivery_status in ('pending', 'sent', 'failed')),
  delivery_error text,
  created_at timestamptz not null default now()
);
create index if not exists idx_staff_invitations_business
  on staff_invitations (business_id, created_at desc);
create index if not exists idx_staff_invitations_expires
  on staff_invitations (expires_at)
  where accepted_at is null and revoked_at is null;
-- Satu undangan pending per (business, email). Undangan lama wajib direvoke
-- aplikasi sebelum membuat yang baru (lihat src/server/staff.ts).
create unique index if not exists uq_staff_invitation_pending
  on staff_invitations (business_id, lower(email))
  where accepted_at is null and revoked_at is null;

create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  requested_ip text,
  created_at timestamptz not null default now()
);
create index if not exists idx_password_reset_user
  on password_reset_tokens (user_id, created_at desc);
create index if not exists idx_password_reset_expires
  on password_reset_tokens (expires_at)
  where used_at is null;

alter table staff_invitations enable row level security;
alter table password_reset_tokens enable row level security;

-- Batas 2 credential aktif tidak bisa dinyatakan sebagai partial unique index
-- (butuh agregat). Trigger + advisory lock per business membuat cek dan tulis
-- atomik terhadap request konkuren dari instance mana pun.
create or replace function enforce_active_payment_credential_limit()
returns trigger
language plpgsql
as $$
declare
  active_count integer;
begin
  if new.is_active then
    perform pg_advisory_xact_lock(hashtext('payment_credentials:' || new.business_id::text));
    select count(*) into active_count
      from payment_credentials
     where business_id = new.business_id
       and is_active
       and id <> new.id;
    if active_count >= 2 then
      raise exception 'ACTIVE_PAYMENT_CREDENTIAL_LIMIT'
        using errcode = 'P0001',
              hint = 'Nonaktifkan salah satu credential sebelum mengaktifkan yang lain';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payment_credentials_active_limit on payment_credentials;
create trigger trg_payment_credentials_active_limit
before insert or update of is_active, business_id on payment_credentials
for each row execute function enforce_active_payment_credential_limit();
