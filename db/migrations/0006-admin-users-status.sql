-- Admin platform (docs/10 §10.2): suspend/reactivate user.
alter table users
  add column if not exists status text not null default 'active'
    check (status in ('active', 'suspended'));
