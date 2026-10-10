-- 0052_admin_bootstrap.sql
-- Bootstrap admin platform (fix "fitur di admin tidak ada").
--
-- Masalah: guard admin (docs/10 §10.5) hanya menerima `users.role = 'admin'`
-- ATAU email di allowlist `ADMIN_EMAILS`. Pada install fresh keduanya kosong:
--   - `users.role` default 'user'
--   - `ADMIN_EMAILS` belum di-set
--   - `requireAdmin()` sendiri menutup jalur promosi lewat UI (admin users CRUD)
-- Akibatnya `/admin/*` selalu redirect ke `/dashboard` → admin tampak "tidak ada".
--
-- Solusi (idempotent, aman re-run):
--   1. RPC `bootstrap_admin(email)` — promosi eksplisit satu user ke role admin.
--      Hanya boleh dijalankan service_role (bukan public/anon/authenticated).
--   2. Seed: bila TIDAK ada user ber-role admin sama sekali, promosikan user
--      paling awal terdaftar (fallback bootstrap pertama).
--
-- Rollback: 0052_admin_bootstrap_rollback.sql.

-- 1. RPC eksplisit — dipanggil dari script bootstrap / SQL editor.
create or replace function bootstrap_admin(p_email text)
returns table (user_id uuid, user_email text, user_role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_email is null or p_email = '' then
    raise exception 'EMAIL_WAJIB: bootstrap_admin butuh email user';
  end if;

  update users set role = 'admin', updated_at = now()
   where email = lower(p_email)
  returning id, email, role into user_id, user_email, user_role;

  if not found then
    raise exception 'USER_TIDAK_DITEMUKAN: %', p_email;
  end if;

  return next;
end;
$$;

revoke execute on function bootstrap_admin(text) from public, anon, authenticated;
grant execute on function bootstrap_admin(text) to service_role;

-- 2. Fallback seed: promosikan user paling awal bila belum ada admin sama sekali.
--    Idempotent — hanya berjalan saat kolom admin kosong.
do $$
declare
  v_first uuid;
begin
  if not exists (select 1 from users where role = 'admin') then
    select id into v_first from users order by created_at asc limit 1;
    if v_first is not null then
      update users set role = 'admin', updated_at = now() where id = v_first;
    end if;
  end if;
end;
$$;
