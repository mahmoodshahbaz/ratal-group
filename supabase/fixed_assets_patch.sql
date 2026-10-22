-- ═══════════════════════════════════════════════════════════════════
-- Fixed Assets Register Patch — Ratal Group
-- Creates: fixed_assets table, RLS, indexes
-- Run once in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. fixed_assets table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fixed_assets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  -- Identification
  asset_code            TEXT NOT NULL,
  asset_name            TEXT NOT NULL,
  category              TEXT NOT NULL DEFAULT 'EQUIPMENT',
    -- VEHICLE | EQUIPMENT | FURNITURE | IT | BUILDING | LAND | OTHER

  -- Acquisition
  purchase_date         DATE NOT NULL,
  purchase_cost         NUMERIC(15,2) NOT NULL DEFAULT 0,
  residual_value        NUMERIC(15,2) NOT NULL DEFAULT 0,
  supplier_name         TEXT,
  invoice_reference     TEXT,

  -- Depreciation
  depreciation_method   TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    -- STRAIGHT_LINE | DECLINING_BALANCE | NONE
  useful_life_months    INTEGER NOT NULL DEFAULT 60,
  depreciation_rate     NUMERIC(6,4),  -- for declining balance (e.g. 0.2000 = 20%)

  -- Location / Assignment
  department            TEXT,
  location              TEXT,
  assigned_to           TEXT,
  serial_number         TEXT,

  -- GL linkage
  asset_account_code    TEXT,  -- e.g. 1500 Fixed Assets
  accum_depr_account    TEXT,  -- e.g. 1590 Accumulated Depreciation
  depr_expense_account  TEXT,  -- e.g. 6100 Depreciation Expense

  -- Status
  status                TEXT NOT NULL DEFAULT 'ACTIVE',
    -- ACTIVE | FULLY_DEPRECIATED | DISPOSED | IDLE
  disposal_date         DATE,
  disposal_proceeds     NUMERIC(15,2) DEFAULT 0,
  disposal_notes        TEXT,

  notes                 TEXT,
  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. RLS ────────────────────────────────────────────────────────
ALTER TABLE fixed_assets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'fixed_assets' AND policyname = 'entity_scope'
  ) THEN
    CREATE POLICY entity_scope ON fixed_assets
      USING (entity_id IN (
        SELECT entity_id FROM user_profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

-- ── 3. Indexes ────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fa_entity        ON fixed_assets(entity_id);
CREATE INDEX IF NOT EXISTS idx_fa_entity_status ON fixed_assets(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_fa_entity_cat    ON fixed_assets(entity_id, category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fa_code   ON fixed_assets(entity_id, asset_code);

-- ── 4. set_updated_at helper (idempotent — safe to run even if already exists) ──
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── 5. updated_at trigger ─────────────────────────────────────────
DROP TRIGGER IF EXISTS fixed_assets_updated_at ON fixed_assets;
CREATE TRIGGER fixed_assets_updated_at
  BEFORE UPDATE ON fixed_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Done ✓
SELECT 'Fixed assets patch applied successfully' AS result;
