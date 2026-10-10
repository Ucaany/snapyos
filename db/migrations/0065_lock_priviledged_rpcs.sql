-- 0065 — H1 (HIGH): lock privileged RPC ke service_role.
--
-- Latar: audit 2026-10-08 — banyak `create function` tanpa `revoke execute`/
-- `grant to service_role`. RPC seperti `pos_complete_payment` (insert
-- transactions) dan `storage_account_add/sub` (mutasi kuota) callable via
-- PostgREST anon/authenticated → eskalasi. Hanya sebagian kecil RPC yang sudah
-- di-lock (activate_device_atomically, settle_paid_payment_atomically,
-- create_voucher_payment_atomically, exit_pin_register_failure, bootstrap_admin).
--
-- File ini men-lock SEMUA fungsi aplikasi yang belum: revoke dari public/anon/
-- authenticated + grant execute ke service_role. Fungsi trigger (set_updated_at,
-- tg_*) dilewati — tidak dipanggil sebagai RPC. Signature persis (tipe argumen)
-- agar tidak salah fungsi overload.
--
-- Idempotent: `revoke`/`grant` aman diulang.

begin;

-- Transaksi / stok / settlement (paling sensitif — insert transactions).
revoke execute on function pos_complete_payment(uuid, uuid, text, uuid, text, uuid, uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function pos_complete_payment(uuid, uuid, text, uuid, text, uuid, uuid, integer, integer, integer) to service_role;

revoke execute on function pos_decrement_stock(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function pos_decrement_stock(uuid, uuid, integer) to service_role;

-- Storage accounting (mutasi kuota tenant).
revoke execute on function storage_account_add(uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function storage_account_add(uuid, text, text, bigint) to service_role;

revoke execute on function storage_account_sub(uuid, text[]) from public, anon, authenticated;
grant execute on function storage_account_sub(uuid, text[]) to service_role;

-- Dashboard / finance / metrics RPC (agregat lintas-tenant bila terbuka).
revoke execute on function dashboard_tx_summary(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function dashboard_tx_summary(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function dashboard_daily_revenue(uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function dashboard_daily_revenue(uuid, timestamptz, timestamptz, text) to service_role;

revoke execute on function finance_expense_summary(uuid, date, date) from public, anon, authenticated;
grant execute on function finance_expense_summary(uuid, date, date) to service_role;

revoke execute on function revenue_breakdown(uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function revenue_breakdown(uuid, timestamptz, timestamptz, text) to service_role;

revoke execute on function tx_insights_summary(uuid, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function tx_insights_summary(uuid, timestamptz, timestamptz, text) to service_role;

revoke execute on function metrics_tx_status(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function metrics_tx_status(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function metrics_returning_customers(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function metrics_returning_customers(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function metrics_revenue_per_booth(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function metrics_revenue_per_booth(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function metrics_sessions_per_booth(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function metrics_sessions_per_booth(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function metrics_session_summary(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function metrics_session_summary(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function metrics_popular_package(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function metrics_popular_package(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function metrics_popular_template(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function metrics_popular_template(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function staff_directory_today(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function staff_directory_today(uuid, timestamptz, timestamptz) to service_role;

revoke execute on function customer_spending(uuid, uuid[]) from public, anon, authenticated;
grant execute on function customer_spending(uuid, uuid[]) to service_role;

revoke execute on function operational_metrics(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function operational_metrics(uuid, timestamptz, timestamptz) to service_role;

-- Sudah ter-lock sebelum 0065 (idempotent re-assert agar konsisten).
revoke execute on function activate_device_atomically(text, text) from public, anon, authenticated;
grant execute on function activate_device_atomically(text, text) to service_role;

revoke execute on function settle_paid_payment_atomically(uuid, text, text) from public, anon, authenticated;
grant execute on function settle_paid_payment_atomically(uuid, text, text) to service_role;

revoke execute on function create_voucher_payment_atomically(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function create_voucher_payment_atomically(uuid, uuid, text, text, text, text) to service_role;

revoke execute on function exit_pin_register_failure(uuid, int, bigint) from public, anon, authenticated;
grant execute on function exit_pin_register_failure(uuid, int, bigint) to service_role;

revoke execute on function bootstrap_admin(text) from public, anon, authenticated;
grant execute on function bootstrap_admin(text) to service_role;

commit;
