-- Rollback 0069 — hapus RPC kuota atomik (kembali ke count-then-insert aplikasi).

begin;

revoke execute on function create_outlet_with_quota(uuid, integer, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function create_photobox_with_quota(uuid, integer, jsonb) from public, anon, authenticated;
revoke execute on function add_business_member_with_quota(uuid, integer, uuid, text) from public, anon, authenticated;

drop function if exists create_outlet_with_quota(uuid, integer, text, text, text, text, text);
drop function if exists create_photobox_with_quota(uuid, integer, jsonb);
drop function if exists add_business_member_with_quota(uuid, integer, uuid, text);

commit;
