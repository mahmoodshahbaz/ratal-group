-- ═══════════════════════════════════════════════════════════════════
-- Budget Module Patch — Ratal Group
-- Creates: budgets table, RLS, indexes
-- Run once in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. budgets table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS budgets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id        UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  year             INTEGER NOT NULL,
  month            INTEGER,           -- NULL = annual budget; 1-12 = monthly
  account_code     TEXT NOT NULL,
  account_name     TEXT,
  account_type     TEXT,              -- INCOME | EXPENSE (cached from COA)
  department       TEXT DEFAULT 'ALL',
  budgeted_amount  NUMERIC(15,2) NOT NULL DEFAULT 0,
  notes            TEXT,
  created_by       UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),

  -- One budget row per account × period × department
  UNIQUE (entity_id, year, month, account_code, department)
);

-- ── 2. RLS ────────────────────────────────────────────────────────
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='budgets' AND policyname='entity_scope'
  ) THEN
    CREATE POLICY entity_scope ON budgets
      USING (entity_id IN (
        SELECT entity_id FROM user_profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

-- ── 3. Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_budgets_entity_year
  ON budgets(entity_id, year);

CREATE INDEX IF NOT EXISTS idx_budgets_entity_year_month
  ON budgets(entity_id, year, month);

CREATE INDEX IF NOT EXISTS idx_budgets_account
  ON budgets(entity_id, account_code);

-- ── 4. updated_at trigger ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS budgets_updated_at ON budgets;
CREATE TRIGGER budgets_updated_at
  BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Done ✓
SELECT 'Budget patch applied successfully' AS result;
