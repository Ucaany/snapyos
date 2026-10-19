-- 0071 rollback — lepas pin `search_path` dari RPC aplikasi.
--
-- Mengembalikan 23 fungsi ke perilaku sebelum 0071: `search_path` mengikuti
-- default role/sesi (`reset search_path`). Fungsi yang sudah punya
-- `set search_path = public, pg_temp` di definisi aslinya (create_outlet_with_quota,
-- create_photobox_with_quota, add_business_member_with_quota) TIDAK disentuh —
-- mereset-nya akan mengubah perilaku yang bukan berasal dari 0071.
--
-- `bootstrap_admin` istimewa: definisi aslinya (0052) memakai
-- `set search_path = public` TANPA pg_temp. 0071 menambahkannya; rollback
-- mengembalikannya persis ke `public` — BUKAN `reset` (yang akan menghapus
-- pin aslinya juga).
--
-- Idempotent: `reset`/`set` aman diulang.

begin;

alter function bootstrap_admin(text) set search_path = public;

alter function activate_device_atomically(text, text) reset search_path;
alter function pos_complete_payment(uuid, uuid, text, uuid, text, uuid, uuid, integer, integer, integer) reset search_path;
alter function pos_decrement_stock(uuid, uuid, integer) reset search_path;
alter function settle_paid_payment_atomically(uuid, text, text) reset search_path;
alter function create_voucher_payment_atomically(uuid, uuid, text, text, text, text) reset search_path;
alter function exit_pin_register_failure(uuid, integer, bigint) reset search_path;

alter function dashboard_tx_summary(uuid, timestamptz, timestamptz) reset search_path;
alter function dashboard_daily_revenue(uuid, timestamptz, timestamptz, text) reset search_path;
alter function finance_expense_summary(uuid, date, date) reset search_path;
alter function revenue_breakdown(uuid, timestamptz, timestamptz, text) reset search_path;
alter function tx_insights_summary(uuid, timestamptz, timestamptz, text) reset search_path;
alter function metrics_tx_status(uuid, timestamptz, timestamptz) reset search_path;
alter function metrics_returning_customers(uuid, timestamptz, timestamptz) reset search_path;
alter function metrics_revenue_per_booth(uuid, timestamptz, timestamptz) reset search_path;
alter function metrics_sessions_per_booth(uuid, timestamptz, timestamptz) reset search_path;
alter function metrics_session_summary(uuid, timestamptz, timestamptz) reset search_path;
alter function metrics_popular_package(uuid, timestamptz, timestamptz) reset search_path;
alter function metrics_popular_template(uuid, timestamptz, timestamptz) reset search_path;
alter function staff_directory_today(uuid, timestamptz, timestamptz) reset search_path;
alter function customer_spending(uuid, uuid[]) reset search_path;
alter function operational_metrics(uuid, timestamptz, timestamptz) reset search_path;

alter function storage_account_add(uuid, text, text, bigint) reset search_path;
alter function storage_account_sub(uuid, text[]) reset search_path;

commit;
