-- ============================================================================
-- 0028 ROLLBACK: Revert balance_ledger source CHECK to pre-0028
-- ============================================================================
DROP INDEX IF EXISTS uq_ledger_platform_fee_source;
ALTER TABLE balance_ledger DROP CONSTRAINT IF EXISTS balance_ledger_source_check;
ALTER TABLE balance_ledger ADD CONSTRAINT balance_ledger_source_check
  CHECK (source IN ('payment', 'withdrawal', 'refund', 'adjustment'));
ALTER TABLE balance_ledger DROP CONSTRAINT IF EXISTS balance_ledger_type_check;
ALTER TABLE balance_ledger ADD CONSTRAINT balance_ledger_type_check
  CHECK (type IN ('credit', 'debit'));
