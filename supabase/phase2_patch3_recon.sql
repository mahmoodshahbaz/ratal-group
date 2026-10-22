-- ═══════════════════════════════════════════════════════════════════
-- Phase 2 Patch #3 — Bank Reconciliation table
-- Safe to run multiple times (all IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bank_reconciliations (
  id                UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id         UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  bank_account      VARCHAR(20) NOT NULL,        -- ANB-15 etc.
  recon_month       VARCHAR(7)  NOT NULL,         -- YYYY-MM
  opening_balance   NUMERIC(14,2) DEFAULT 0,
  closing_balance   NUMERIC(14,2) DEFAULT 0,
  matched_count     INT DEFAULT 0,
  unmatched_count   INT DEFAULT 0,
  reconciled_count  INT DEFAULT 0,
  statement_rows    JSONB,                         -- full parsed rows stored for audit
  status            VARCHAR(20) DEFAULT 'DRAFT',  -- DRAFT|RECONCILED
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, bank_account, recon_month)
);

CREATE INDEX IF NOT EXISTS idx_recon_entity ON bank_reconciliations(entity_id, recon_month DESC);

ALTER TABLE bank_reconciliations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'auth_bank_reconciliations' AND tablename = 'bank_reconciliations'
  ) THEN
    CREATE POLICY "auth_bank_reconciliations" ON bank_reconciliations FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;
