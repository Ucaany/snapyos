-- Agregasi tambahan STEP 13 (docs/04 §4.12 customer, §4.13 staff, §4.3 operational).
-- Melengkapi 0032_dashboard_aggregates.sql — memindahkan sisa loop TS ke SQL:
--   • customers.listCustomers → customer_spending() menggantikan .in(customer_id, ids) + reduce.
--   • staff.listStaffDirectory → staff_directory_today() (agregat per booth via created_at).
--   • dashboard.getOperationalMetrics → operational_metrics() menggabungkan 4 head-count menjadi 1 RPC.
--
-- Catatan cakupan (jangan duplikat, sudah ada di 0032):
--   • revenue_series harian  → gunakan dashboard_daily_revenue(p_business, p_start, p_end, p_tz).
--   • revenue_breakdown_by_* → gunakan revenue_breakdown(p_business, p_start, p_end, p_dim)
--     dengan p_dim ∈ {'outlet','package','photobox','payment_method'}.
--
-- Semua fungsi language sql stable + p_ prefix (konvensi 0032).
-- FUNGSI INI WAJIB dicerminkan di db/schema.sql (baseline akumulasi).

-- Direktori staff hari ini — atribusi paid tx per photobox (created_at window),
-- karena transactions tidak punya kolom aktor (docs/07 §7.5). Sinkron dengan
-- src/lib/staff-directory.ts:buildStaffDirectory yang menggabungkan per booth
-- ke setiap staff sesuai member_photoboxes (0018). Bedanya dengan
-- metrics_revenue_per_booth: filter created_at, bukan paid_at (jendela "hari ini"
-- diukur dari waktu transaksi terjadi, bukan waktu settlement).
create or replace function staff_directory_today(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns table (photobox_id uuid, revenue bigint, tx_count bigint)
language sql stable as $$
  select photobox_id,
         coalesce(sum(greatest(final_amount, 0)), 0)::bigint as revenue,
         count(*)::bigint as tx_count
    from transactions
   where business_id = p_business
     and status = 'paid'
     and created_at >= p_start
     and created_at < p_end
     and photobox_id is not null
   group by photobox_id;
$$;

-- Ringkasan spending per customer (list customer paginated) — menggantikan
-- .in("customer_id", ids) yang mentransfer seluruh baris paid tx per customer.
-- Dipakai src/server/customers.ts:listCustomers dengan p_customer_ids berisi
-- id-id customer pada halaman aktif (bounded).
create or replace function customer_spending(
  p_business uuid, p_customer_ids uuid[]
)
returns table (
  customer_id uuid,
  total_spending bigint,
  tx_count bigint,
  last_active timestamptz
)
language sql stable as $$
  select customer_id,
         coalesce(sum(greatest(final_amount, 0)), 0)::bigint as total_spending,
         count(*)::bigint as tx_count,
         max(paid_at) as last_active
    from transactions
   where business_id = p_business
     and status = 'paid'
     and customer_id = any(p_customer_ids)
   group by customer_id;
$$;

-- Metrik operasional pada rentang (sessions, customers, active_photoboxes,
-- active_outlets). Menggantikan 4× head-count paralel di getOperationalMetrics.
-- customers dihitung total (bukan window) sesuai perilaku eksisting.
create or replace function operational_metrics(
  p_business uuid, p_start timestamptz, p_end timestamptz
)
returns table (
  sessions bigint,
  customers bigint,
  active_photoboxes bigint,
  active_outlets bigint
)
language sql stable as $$
  select
    (select count(*)::bigint
       from sessions
      where business_id = p_business
        and created_at >= p_start
        and created_at < p_end) as sessions,
    (select count(*)::bigint
       from customers
      where business_id = p_business) as customers,
    (select count(*)::bigint
       from photoboxes
      where business_id = p_business
        and status = 'online') as active_photoboxes,
    (select count(*)::bigint
       from outlets
      where business_id = p_business
        and status = 'active') as active_outlets;
$$;

-- Index pendukung customer_spending: filter (business_id, customer_id) + status
-- selektif untuk agregasi list customer. idx_tx_paid_at (business_id, status,
-- paid_at) DILEWATI karena redundan dengan partial index existing
-- idx_tx_business_paid (business_id, paid_at) WHERE status='paid' yang sudah
-- meng-cover semua query rentang paid tx di codebase.
create index if not exists idx_tx_customer
  on transactions (business_id, customer_id)
  where customer_id is not null;
