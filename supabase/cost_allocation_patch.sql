-- ═══════════════════════════════════════════════════════════════════
-- Cost Center Allocation Patch — Ratal Group
-- Creates:
--   allocation_rules    — % split keys by department/project
--   allocation_runs     — header record per allocation batch
--   allocation_entries  — generated journal lines per run
-- Run once in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- ── 1. allocation_rules ───────────────────────────────────────────
-- Defines how a shared cost account is split across cost centers
CREATE TABLE IF NOT EXISTS allocation_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,
  description     TEXT,
  is_active       BOOLEAN DEFAULT TRUE,

  -- Source: which account's balance to allocate
  source_account_code TEXT NOT NULL,
  source_account_name TEXT,

  -- Period type
  frequency       TEXT DEFAULT 'MONTHLY',  -- MONTHLY | QUARTERLY | MANUAL

  -- Allocation basis
  basis           TEXT DEFAULT 'FIXED_PCT',
  -- FIXED_PCT: fixed percentages below must sum to 100
  -- HEADCOUNT:  future — auto-calculate from employee count per dept
  -- EQUAL:      split equally among all lines

  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE allocation_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='allocation_rules' AND policyname='entity_scope') THEN
    CREATE POLICY entity_scope ON allocation_rules
      USING (entity_id IN (SELECT entity_id FROM user_profiles WHERE id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ar_entity ON allocation_rules(entity_id, is_active);

DROP TRIGGER IF EXISTS allocation_rules_updated_at ON allocation_rules;
CREATE TRIGGER allocation_rules_updated_at
  BEFORE UPDATE ON allocation_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2. allocation_rule_lines ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS allocation_rule_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id         UUID NOT NULL REFERENCES allocation_rules(id) ON DELETE CASCADE,

  -- Target cost center
  cost_center_type TEXT NOT NULL DEFAULT 'DEPARTMENT', -- DEPARTMENT | PROJECT | ENTITY
  cost_center_name TEXT NOT NULL,   -- department name, project name, entity code

  -- Target GL account to receive the allocation
  target_account_code TEXT NOT NULL,
  target_account_name TEXT,

  percentage      NUMERIC(7,4) NOT NULL,  -- e.g. 33.33 = 33.33%
  sort_order      INTEGER DEFAULT 0
);

ALTER TABLE allocation_rule_lines ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='allocation_rule_lines' AND policyname='entity_scope') THEN
    CREATE POLICY entity_scope ON allocation_rule_lines
      USING (rule_id IN (SELECT id FROM allocation_rules
        WHERE entity_id IN (SELECT entity_id FROM user_profiles WHERE id = auth.uid())));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_arl_rule ON allocation_rule_lines(rule_id);

-- ── 3. allocation_runs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS allocation_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  rule_id         UUID NOT NULL REFERENCES allocation_rules(id) ON DELETE CASCADE,

  run_date        DATE NOT NULL,
  period_year     INTEGER NOT NULL,
  period_month    INTEGER NOT NULL,
  voucher_number  TEXT,

  source_balance  NUMERIC(14,2) NOT NULL,   -- amount being allocated
  status          TEXT DEFAULT 'POSTED',     -- POSTED | REVERSED
  notes           TEXT,

  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE allocation_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='allocation_runs' AND policyname='entity_scope') THEN
    CREATE POLICY entity_scope ON allocation_runs
      USING (entity_id IN (SELECT entity_id FROM user_profiles WHERE id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_run_entity ON allocation_runs(entity_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_run_rule   ON allocation_runs(rule_id);

SELECT 'Cost allocation patch applied successfully' AS result;
