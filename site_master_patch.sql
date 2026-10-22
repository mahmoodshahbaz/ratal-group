-- Site Master Schema Patch
-- Run this in Supabase SQL Editor

ALTER TABLE site_masters
  ADD COLUMN IF NOT EXISTS site_no          TEXT,
  ADD COLUMN IF NOT EXISTS wf_code          TEXT,
  ADD COLUMN IF NOT EXISTS uom              TEXT DEFAULT 'Lump Sum',
  ADD COLUMN IF NOT EXISTS quantity         NUMERIC,
  ADD COLUMN IF NOT EXISTS contract_value   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_team_pct      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_supplier_pct  NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_subcon_pct    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_food_pct      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_overtime_pct  NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_petty_pct     NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_misc_pct      NUMERIC DEFAULT 0;

-- Confirm
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'site_masters'
  AND column_name IN ('site_no','wf_code','uom','quantity','contract_value',
                      'budget_team_pct','budget_supplier_pct','budget_subcon_pct',
                      'budget_food_pct','budget_overtime_pct','budget_petty_pct','budget_misc_pct')
ORDER BY column_name;
