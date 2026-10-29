-- ---------------------------------------------------------------------------
-- 0085_security_package_template_quota_triggers.sql
--
-- N8: kuota paket & template dicek dengan count-then-insert di aplikasi, tanpa
-- lock. Dua request bersamaan sama-sama melihat hitungan di bawah batas lalu
-- sama-sama insert → jumlah melewati max_packages / max_templates.
--
-- Perbaikan di database: trigger BEFORE INSERT mengambil advisory lock per
-- (business, jenis) lalu menghitung ulang di dalam lock. Aplikasi tidak perlu
-- diubah; error P0001 dipetakan ke PLAN_LIMIT_REACHED.
-- ---------------------------------------------------------------------------

create or replace function enforce_resource_quota()
returns trigger
language plpgsql
as $$
declare
  v_limit integer;
  v_count integer;
  v_resource text := tg_argv[0];
  v_business uuid := new.business_id;
begin
  -- Lock per business+jenis: dua INSERT paralel antre di sini.
  perform pg_advisory_xact_lock(hashtext(v_business::text || ':' || v_resource)::bigint);

  select case v_resource
           when 'packages' then p.max_packages
           when 'templates' then p.max_templates
         end
    into v_limit
    from subscriptions s
    join plans p on p.id = s.plan_id
   where s.business_id = v_business
     and s.status in ('trial', 'active', 'past_due')
   order by s.created_at desc
   limit 1;

  if v_limit is null then
    return new; -- tanpa langganan efektif / tanpa batas: aplikasi yang menolak
  end if;

  if v_resource = 'packages' then
    select count(*) into v_count from packages where business_id = v_business;
  else
    select count(*) into v_count from templates where business_id = v_business;
  end if;

  if v_count >= v_limit then
    raise exception 'PLAN_LIMIT_REACHED: kuota % untuk business ini sudah penuh (% / %)',
      v_resource, v_count, v_limit
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_package_quota on packages;
create trigger trg_enforce_package_quota
  before insert on packages
  for each row execute function enforce_resource_quota('packages');

drop trigger if exists trg_enforce_template_quota on templates;
create trigger trg_enforce_template_quota
  before insert on templates
  for each row execute function enforce_resource_quota('templates');
