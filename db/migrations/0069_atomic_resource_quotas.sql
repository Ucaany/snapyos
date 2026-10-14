-- 0069 — kuota resource atomik (outlet, photobox, member) — audit lintas-potong.
--
-- Latar: `createOutlet`/`createPhotobox`/`inviteStaff` menghitung jumlah row
-- lalu insert di dua round-trip terpisah. Dua request bersamaan dapat sama-sama
-- melihat count di bawah limit lalu sama-sama insert → kuota plan terlampaui.
--
-- Perbaikan: RPC SECURITY DEFINER yang mengambil advisory transaction lock per
-- (business, jenis resource), menghitung SETELAH lock, memeriksa limit, lalu
-- insert dalam transaksi yang sama. Limit dikirim pemanggil (dari plan aktif)
-- agar keputusan entitlement tetap di aplikasi.
--
-- Kuota staff menghitung role manager + staff, BUKAN owner: plan boleh punya
-- max_staff = 0 sementara owner tetap wajib ada.
--
-- Idempotent: create or replace + revoke/grant aman diulang.

begin;

create or replace function create_outlet_with_quota(
  p_business_id uuid,
  p_max_outlets integer,
  p_name text,
  p_address text,
  p_city text,
  p_province text,
  p_status text
) returns outlets
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_row outlets;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':outlets', 0));

  select count(*) into v_count from outlets where business_id = p_business_id;
  if v_count >= p_max_outlets then
    raise exception 'PLAN_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  insert into outlets (business_id, name, address, city, province, status)
  values (p_business_id, p_name, p_address, p_city, p_province, coalesce(p_status, 'active'))
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function create_photobox_with_quota(
  p_business_id uuid,
  p_max_photoboxes integer,
  p_payload jsonb
) returns photoboxes
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_row photoboxes;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':photoboxes', 0));

  select count(*) into v_count from photoboxes where business_id = p_business_id;
  if v_count >= p_max_photoboxes then
    raise exception 'PLAN_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  insert into photoboxes (
    business_id, outlet_id, slug, name, status, camera, printer, display,
    camera_settings, print_settings, session_settings, exit_pin_hash, payment_mode
  ) values (
    p_business_id,
    (p_payload->>'outlet_id')::uuid,
    p_payload->>'slug',
    p_payload->>'name',
    coalesce(p_payload->>'status', 'offline'),
    p_payload->>'camera',
    p_payload->>'printer',
    p_payload->>'display',
    p_payload->'camera_settings',
    p_payload->'print_settings',
    p_payload->'session_settings',
    p_payload->>'exit_pin_hash',
    p_payload->>'payment_mode'
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function add_business_member_with_quota(
  p_business_id uuid,
  p_max_staff integer,
  p_user_id uuid,
  p_role text
) returns business_members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_row business_members;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text || ':members', 0));

  -- Owner tidak dihitung: plan dapat memakai max_staff = 0 dan owner tetap ada.
  select count(*) into v_count
    from business_members
   where business_id = p_business_id
     and role in ('manager', 'staff');

  if v_count >= p_max_staff then
    raise exception 'PLAN_LIMIT_REACHED' using errcode = 'P0001';
  end if;

  insert into business_members (business_id, user_id, role)
  values (p_business_id, p_user_id, coalesce(p_role, 'staff'))
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function create_outlet_with_quota(uuid, integer, text, text, text, text, text) from public, anon, authenticated;
grant execute on function create_outlet_with_quota(uuid, integer, text, text, text, text, text) to service_role;

revoke execute on function create_photobox_with_quota(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function create_photobox_with_quota(uuid, integer, jsonb) to service_role;

revoke execute on function add_business_member_with_quota(uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function add_business_member_with_quota(uuid, integer, uuid, text) to service_role;

commit;
