-- Rollback 0092: kembalikan ke perilaku sebelumnya (kuota voucher hanya dijaga
-- trigger di payments; storage add tanpa predikat limit).
drop trigger if exists trg_enforce_voucher_usage_limit on voucher_usages;
drop function if exists enforce_voucher_usage_limit();
drop function if exists storage_account_add_limited(uuid, text, text, bigint, bigint);
