-- ============================================================================
-- 0028: Extend balance_ledger source CHECK for platform_fee (Direct Merchant)
-- Direct merchant mode: dana langsung ke owner, platform fee dicatat sebagai
-- receivable di balance_ledger (source='platform_fee'). Ditagih terpisah via
-- invoice manual (Phase 1 MVP — plan §C1).
-- ============================================================================
ALTER TABLE balance_ledger DROP CONSTRAINT IF EXISTS balance_ledger_type_check;
ALTER TABLE balance_ledger ADD CONSTRAINT balance_ledger_type_check
  CHECK (type IN ('credit', 'debit', 'receivable'));
ALTER TABLE balance_ledger DROP CONSTRAINT IF EXISTS balance_ledger_source_check;
ALTER TABLE balance_ledger ADD CONSTRAINT balance_ledger_source_check
  CHECK (source IN ('payment', 'withdrawal', 'refund', 'adjustment', 'platform_fee'));

-- Atomic idempotency: one direct-merchant fee receivable per payment.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_platform_fee_source
  ON balance_ledger (source, source_id)
  WHERE source = 'platform_fee';
