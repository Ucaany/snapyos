-- One activation code may create exactly one device. Lock the selected code,
-- replace the booth device, and consume the code in one transaction.
create or replace function activate_device_atomically(
  p_code text,
  p_device_token_hash text
) returns table (device_id uuid, photobox_id uuid, reason text)
language plpgsql
as $$
declare
  v_code activation_codes%rowtype;
begin
  select * into v_code
    from activation_codes
   where code = p_code
   order by created_at desc
   limit 1
   for update;

  if not found then
    return query select null::uuid, null::uuid, 'NOT_FOUND'::text;
    return;
  end if;
  if v_code.used_at is not null then
    return query select null::uuid, v_code.photobox_id, 'USED'::text;
    return;
  end if;
  if v_code.expires_at <= now() then
    return query select null::uuid, v_code.photobox_id, 'EXPIRED'::text;
    return;
  end if;

  delete from devices where devices.photobox_id = v_code.photobox_id;

  return query
    with inserted as (
      insert into devices (business_id, photobox_id, name, device_token_hash, status, last_seen_at)
      values (v_code.business_id, v_code.photobox_id, 'Kiosk', p_device_token_hash, 'active', now())
      returning id
    ), consumed as (
      update activation_codes set used_at = now() where id = v_code.id
    )
    select inserted.id, v_code.photobox_id, 'OK'::text from inserted;
end;
$$;

revoke execute on function activate_device_atomically(text, text) from public, anon, authenticated;
grant execute on function activate_device_atomically(text, text) to service_role;