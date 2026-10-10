-- Rollback 0065 — buka kembali grant execute ke public.
--
-- PERINGATAN: rollback ini mengembalikan RPC finansial/metrics ke default
-- (public dapat execute) — yaitu kondisi pra-hardening yang memungkinkan
-- pemanggilan via PostgREST anon/authenticated. Jalankan hanya untuk
-- mengembalikan perilaku lama secara sadar.
--
-- Catatan: fungsi trigger (set_updated_at, tg_*) tidak pernah di-lock.

begin;

grant execute on function pos_complete_payment(uuid, uuid, text, uuid, text, uuid, uuid, integer, integer, integer) to public;
grant execute on function pos_decrement_stock(uuid, uuid, integer) to public;
grant execute on function storage_account_add(uuid, text, text, bigint) to public;
grant execute on function storage_account_sub(uuid, text[]) to public;
grant execute on function dashboard_tx_summary(uuid, timestamptz, timestamptz) to public;
grant execute on function dashboard_daily_revenue(uuid, timestamptz, timestamptz, text) to public;
grant execute on function finance_expense_summary(uuid, date, date) to public;
grant execute on function revenue_breakdown(uuid, timestamptz, timestamptz, text) to public;
grant execute on function tx_insights_summary(uuid, timestamptz, timestamptz, text) to public;
grant execute on function metrics_tx_status(uuid, timestamptz, timestamptz) to public;
grant execute on function metrics_returning_customers(uuid, timestamptz, timestamptz) to public;
grant execute on function metrics_revenue_per_booth(uuid, timestamptz, timestamptz) to public;
grant execute on function metrics_sessions_per_booth(uuid, timestamptz, timestamptz) to public;
grant execute on function metrics_session_summary(uuid, timestamptz, timestamptz) to public;
grant execute on function metrics_popular_package(uuid, timestamptz, timestamptz) to public;
grant execute on function metrics_popular_template(uuid, timestamptz, timestamptz) to public;
grant execute on function staff_directory_today(uuid, timestamptz, timestamptz) to public;
grant execute on function customer_spending(uuid, uuid[]) to public;
grant execute on function operational_metrics(uuid, timestamptz, timestamptz) to public;

commit;
