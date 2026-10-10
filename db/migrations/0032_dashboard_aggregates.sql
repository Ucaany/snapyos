-- Dashboard owner agregasi SQL — Fase 3 (docs/04 §4.1–§4.4, docs/08 §8.5).
-- Memindahkan SUM/COUNT/GROUP BY dari loop TS (O(n) row transfer) ke database.
-- Semua fungsi STABLE + filter business_id + status/paid_at agar memakai
-- partial index idx_tx_business_paid / idx_tx_business_date / idx_expenses_business.
-- FUNGSI INI WAJIB dicerminkan di db/schema.sql (baseline akumulasi).

-- Ringkasan transaksi paid pada rentang paid_at (dipakai dashboard + finance).
create or replace function dashboard_tx_summary(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns table (gross bigint, discount bigint, net bigint, paid_tx bigint)
language sql stable as $$
  select coalesce(sum(gross_amount), 0)::bigint,
         coalesce(sum(discount_amount), 0)::bigint,
         coalesce(sum(final_amount), 0)::bigint,
         count(*)::bigint
    from transactions
   where business_id = p_business
     and status = 'paid'
     and paid_at >= p_start
     and paid_at < p_end;
$$;

-- Deret harian revenue (bucket tanggal lokal business tz; zero-fill tetap di TS).
create or replace function dashboard_daily_revenue(
  p_business uuid, p_start timestamptz, p_end timestamptz, p_tz text
)
returns table (day date, amount bigint, tx_count bigint)
language sql stable as $$
  select (timezone(p_tz, paid_at))::date as day,
         sum(greatest(final_amount, 0))::bigint as amount,
         count(*)::bigint as tx_count
    from transactions
   where business_id = p_business
     and status = 'paid'
     and paid_at >= p_start
     and paid_at < p_end
   group by 1
   order by 1;
$$;

-- Ringkasan expenses per kategori pada rentang expense_date.
create or replace function finance_expense_summary(
  p_business uuid, p_from date, p_to date
)
returns table (category text, amount bigint)
language sql stable as $$
  select category, sum(greatest(amount, 0))::bigint as amount
    from expenses
   where business_id = p_business
     and expense_date >= p_from
     and expense_date <= p_to
   group by category
   order by sum(amount) desc;
$$;

-- Breakdown revenue per dimensi (outlet | package | photobox | payment_method).
create or replace function revenue_breakdown(
  p_business uuid, p_start timestamptz, p_end timestamptz, p_dim text
)
returns table (dim_key text, label text, amount bigint, tx_count bigint)
language sql stable as $$
  select
    case p_dim
      when 'outlet' then coalesce(t.outlet_id::text, 'none')
      when 'package' then coalesce(t.package_id::text, 'none')
      when 'photobox' then coalesce(t.photobox_id::text, 'none')
      else coalesce(t.payment_method, '—')
    end as dim_key,
    case p_dim
      when 'outlet' then coalesce(o.name, 'Tanpa outlet')
      when 'package' then coalesce(p.name, 'Tanpa package')
      when 'photobox' then coalesce(b.name, 'Tanpa photobox')
      else upper(coalesce(t.payment_method, '—'))
    end as label,
    sum(greatest(t.final_amount, 0))::bigint as amount,
    count(*)::bigint as tx_count
    from transactions t
    left join outlets o on o.id = t.outlet_id
    left join packages p on p.id = t.package_id
    left join photoboxes b on b.id = t.photobox_id
   where t.business_id = p_business
     and t.status = 'paid'
     and t.paid_at >= p_start
     and t.paid_at < p_end
   group by 1, 2
   order by 3 desc;
$$;

-- Insights transaksi SEMUA status: grup (status, jam lokal, outlet).
-- Jam memakai coalesce(paid_at, created_at) — sama dengan buildTxInsights().
create or replace function tx_insights_summary(
  p_business uuid, p_start timestamptz, p_end timestamptz, p_tz text
)
returns table (
  status text, hr int, outlet_id uuid, outlet_name text,
  amount bigint, tx_count bigint
)
language sql stable as $$
  select t.status,
         extract(hour from timezone(p_tz, coalesce(t.paid_at, t.created_at)))::int as hr,
         t.outlet_id,
         coalesce(o.name, 'Tanpa outlet') as outlet_name,
         sum(case when t.status = 'paid' then greatest(t.final_amount, 0) else 0 end)::bigint as amount,
         count(*)::bigint as tx_count
    from transactions t
    left join outlets o on o.id = t.outlet_id
   where t.business_id = p_business
     and t.created_at >= p_start
     and t.created_at < p_end
   group by 1, 2, 3, 4;
$$;

-- Hitung status transaksi pada rentang created_at (metrics).
create or replace function metrics_tx_status(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns table (status text, tx_count bigint)
language sql stable as $$
  select status, count(*)::bigint as tx_count
    from transactions
   where business_id = p_business
     and created_at >= p_start
     and created_at < p_end
   group by status;
$$;

-- Customer returning: ≥2 transaksi paid pada rentang (skalar, tanpa transfer rows).
create or replace function metrics_returning_customers(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns bigint
language sql stable as $$
  select count(*)::bigint from (
    select 1
      from transactions
     where business_id = p_business
       and status = 'paid'
       and paid_at >= p_start
       and paid_at < p_end
       and customer_id is not null
     group by customer_id
    having count(*) >= 2
  ) t;
$$;

-- Revenue paid per booth pada rentang.
create or replace function metrics_revenue_per_booth(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns table (booth_id uuid, revenue bigint, paid_tx bigint)
language sql stable as $$
  select photobox_id as booth_id,
         sum(greatest(final_amount, 0))::bigint as revenue,
         count(*)::bigint as paid_tx
    from transactions
   where business_id = p_business
     and status = 'paid'
     and paid_at >= p_start
     and paid_at < p_end
   group by photobox_id;
$$;

-- Jumlah sesi per booth pada rentang created_at.
create or replace function metrics_sessions_per_booth(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns table (booth_id uuid, sessions bigint)
language sql stable as $$
  select photobox_id as booth_id, count(*)::bigint as sessions
    from sessions
   where business_id = p_business
     and created_at >= p_start
     and created_at < p_end
   group by photobox_id;
$$;

-- Ringkasan sesi: total/completed/cancelled/retakes + durasi (detik) untuk rata-rata.
create or replace function metrics_session_summary(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns table (
  total bigint, completed bigint, cancelled bigint, retakes bigint,
  done_count bigint, total_seconds numeric
)
language sql stable as $$
  select count(*)::bigint as total,
         count(*) filter (where status = 'completed')::bigint as completed,
         count(*) filter (where status = 'cancelled')::bigint as cancelled,
         coalesce(sum(retake_count), 0)::bigint as retakes,
         count(*) filter (
           where status = 'completed'
             and started_at is not null
             and completed_at is not null
         )::bigint as done_count,
         coalesce(sum(
           extract(epoch from (completed_at - started_at))
           ) filter (
           where status = 'completed'
             and started_at is not null
             and completed_at is not null
         ), 0) as total_seconds
    from sessions
   where business_id = p_business
     and created_at >= p_start
     and created_at < p_end;
$$;

-- Package terpopuler (semua package + count, TS ambil [0]).
create or replace function metrics_popular_package(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns table (package_id uuid, name text, tx_count bigint)
language sql stable as $$
  select t.package_id,
         coalesce(max(p.name), '—') as name,
         count(*)::bigint as tx_count
    from transactions t
    left join packages p on p.id = t.package_id
   where t.business_id = p_business
     and t.status = 'paid'
     and t.paid_at >= p_start
     and t.paid_at < p_end
     and t.package_id is not null
   group by t.package_id
   order by count(*) desc, max(p.name) asc;
$$;

-- Template terpopuler (semua template + count, TS ambil [0]).
create or replace function metrics_popular_template(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns table (template_id uuid, name text, photo_count bigint)
language sql stable as $$
  select ph.template_id,
         coalesce(max(t.name), '—') as name,
         count(*)::bigint as photo_count
    from photos ph
    left join templates t on t.id = ph.template_id
   where ph.business_id = p_business
     and ph.created_at >= p_start
     and ph.created_at < p_end
     and ph.template_id is not null
   group by ph.template_id
   order by count(*) desc, max(t.name) asc;
$$;

-- Index pelengkap agregasi (gap audit Fase 3).
create index if not exists idx_voucher_usages_business_used
  on voucher_usages (business_id, used_at);
create index if not exists idx_customers_business_created
  on customers (business_id, created_at);
create index if not exists idx_sessions_business_created
  on sessions (business_id, created_at);
