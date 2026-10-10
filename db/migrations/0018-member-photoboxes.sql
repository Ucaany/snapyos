-- 0018: akses photobox per member — owner mengatur booth mana yang bisa diakses staff.
-- Junction member_photoboxes (pola sama dengan package_photoboxes).
-- Semantik: kosong = belum ada akses booth. Owner selalu akses penuh (RBAC), tidak perlu baris.
-- ponytail: enforcement di shell /staff menyusul; fase ini data + UI owner saja.

create table member_photoboxes (
  user_id uuid not null references users (id) on delete cascade,
  business_id uuid not null references businesses (id) on delete cascade,
  photobox_id uuid not null references photoboxes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, photobox_id)
);
create index idx_member_photoboxes_business on member_photoboxes (business_id);
