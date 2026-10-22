-- ═══════════════════════════════════════════════════════════════════
-- Recurring Journal Templates Patch — Ratal Group
-- Creates:
--   recurring_templates       — template header (frequency, schedule)
--   recurring_template_lines  — DR/CR lines per template
-- Run once in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. recurring_templates ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,          -- e.g. "Monthly Office Rent"
  description     TEXT,                   -- narration used in posted JV
  voucher_type    TEXT NOT NULL DEFAULT 'JV',
    -- JV | ACR | RCL | ADJ

  frequency       TEXT NOT NULL DEFAULT 'MONTHLY',
    -- MONTHLY | QUARTERLY | ANNUAL | WEEKLY | CUSTOM

  -- Scheduling
  start_date      DATE NOT NULL,          -- first run date
  next_run_date   DATE NOT NULL,          -- calculated next posting date
  last_run_date   DATE,                   -- date of most recent posting
  end_date        DATE,                   -- optional: stop after this date

  -- For CUSTOM frequency
  interval_days   INTEGER,                -- e.g. 14 for fortnightly

  is_active       BOOLEAN DEFAULT TRUE,

  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE recurring_templates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='recurring_templates' AND policyname='entity_scope'
  ) THEN
    CREATE POLICY entity_scope ON recurring_templates
      USING (entity_id IN (
        SELECT entity_id FROM user_profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rt_entity        ON recurring_templates(entity_id);
CREATE INDEX IF NOT EXISTS idx_rt_entity_active ON recurring_templates(entity_id, is_active, next_run_date);

-- ── 2. recurring_template_lines ──────────────────────────────────
CREATE TABLE IF NOT EXISTS recurring_template_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     UUID NOT NULL REFERENCES recurring_templates(id) ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,

  account_code    TEXT NOT NULL,
  account_name    TEXT,
  description     TEXT,   -- line-level narration (overrides template description if set)
  debit           NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit          NUMERIC(15,2) NOT NULL DEFAULT 0
);

ALTER TABLE recurring_template_lines ENABLE ROW LEVEL SECURITY;

-- Lines inherit entity scope via their template
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='recurring_template_lines' AND policyname='entity_scope'
  ) THEN
    CREATE POLICY entity_scope ON recurring_template_lines
      USING (template_id IN (
        SELECT id FROM recurring_templates
        WHERE entity_id IN (
          SELECT entity_id FROM user_profiles WHERE id = auth.uid()
        )
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rtl_template ON recurring_template_lines(template_id);

-- ── 3. updated_at trigger (idempotent) ───────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recurring_templates_updated_at ON recurring_templates;
CREATE TRIGGER recurring_templates_updated_at
  BEFORE UPDATE ON recurring_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Done ✓
SELECT 'Recurring templates patch applied successfully' AS result;
