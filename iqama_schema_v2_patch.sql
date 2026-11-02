-- ══════════════════════════════════════════════════════════════════════════════
-- iqama_schema_v2_patch.sql
-- Run once in Supabase SQL Editor (safe to re-run — uses IF EXISTS / DO blocks)
--
-- Changes:
--   1. iqama_renewals       — rename paid_by → generated_by
--                           — add sadad_total_amount (levy validation ceiling)
--                           — add iqama_count (drives auto-line generation in UI)
--   2. iqama_renewal_lines  — drop old dependent_fee (was dep × 500, wrong)
--                           — drop old line_total (included dep fee, wrong)
--                           — add family_fee_annual = dep_count × 4800 (SAR 400/mo × 12)
--                             (employee's OWN cost — informational only, NOT company cost)
--                           — add line_total = renewal_fee + levy_amount + other_fees
--                             (company cost only)
--                           — add confirmation_status + confirmed_at
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 1. iqama_renewals: rename paid_by → generated_by ─────────────────────────

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'iqama_renewals' AND column_name = 'paid_by'
  ) THEN
    ALTER TABLE iqama_renewals RENAME COLUMN paid_by TO generated_by;
  END IF;
END $$;

-- ── 2. iqama_renewals: add new columns ───────────────────────────────────────

ALTER TABLE iqama_renewals
  ADD COLUMN IF NOT EXISTS sadad_total_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iqama_count        INT     DEFAULT 1;

COMMENT ON COLUMN iqama_renewals.generated_by IS
  'PRO / HR officer who generated the Sadad reference from MOI / ABSHER. NOT the payer — Accounts pays the Sadad.';

COMMENT ON COLUMN iqama_renewals.sadad_total_amount IS
  'Total declared on the Sadad bill. Sum of levy amounts across lines must not exceed this.';

COMMENT ON COLUMN iqama_renewals.iqama_count IS
  'Number of Iqamas covered by this batch. Drives the auto-generation of employee lines in the UI.';


-- ── 3. iqama_renewal_lines: fix generated columns ────────────────────────────
-- PostgreSQL does not allow ALTER on GENERATED columns — must drop + recreate.

-- 3a. Drop old incorrect generated columns (they may not exist if this is a fresh DB)
ALTER TABLE iqama_renewal_lines DROP COLUMN IF EXISTS dependent_fee;
ALTER TABLE iqama_renewal_lines DROP COLUMN IF EXISTS line_total;

-- 3b. Add family_fee_annual — employee's own annual cost (SAR 400/month × 12 × dep count)
--     This is INFORMATIONAL only. The company does NOT pay this.
ALTER TABLE iqama_renewal_lines
  ADD COLUMN IF NOT EXISTS family_fee_annual NUMERIC
    GENERATED ALWAYS AS (dependent_count_above_18 * 4800) STORED;

-- 3c. Add line_total — company cost only: renewal fee + levy + other fees
ALTER TABLE iqama_renewal_lines
  ADD COLUMN IF NOT EXISTS line_total NUMERIC
    GENERATED ALWAYS AS (renewal_fee + levy_amount + other_fees) STORED;

COMMENT ON COLUMN iqama_renewal_lines.family_fee_annual IS
  'Employee''s own annual family residency fee: SAR 400/month × 12 × dependents above 18. NOT included in company payment.';

COMMENT ON COLUMN iqama_renewal_lines.line_total IS
  'Company cost for this employee: renewal_fee (650) + levy_amount (8500/9700) + other_fees. Excludes employee''s family fee.';


-- ── 4. iqama_renewal_lines: add confirmation columns ─────────────────────────

ALTER TABLE iqama_renewal_lines
  ADD COLUMN IF NOT EXISTS confirmation_status TEXT        DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS confirmed_at        TIMESTAMPTZ DEFAULT NULL;

-- confirmation_status values:
--   PENDING      — employee has dependents, awaiting their confirmation
--   CONFIRMED    — employee confirmed family residency fees are settled
--   FLAGGED      — employee raised an issue (can't pay / dispute)
--   AUTO_CLEARED — employee has no dependents, no confirmation needed

COMMENT ON COLUMN iqama_renewal_lines.confirmation_status IS
  'PENDING=awaiting employee confirmation | CONFIRMED=family fees cleared | FLAGGED=employee raised issue | AUTO_CLEARED=no dependents';


-- ── 5. VERIFY ────────────────────────────────────────────────────────────────

SELECT
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_name IN ('iqama_renewals', 'iqama_renewal_lines')
  AND column_name IN (
    'generated_by', 'sadad_total_amount', 'iqama_count',
    'family_fee_annual', 'line_total', 'confirmation_status', 'confirmed_at'
  )
ORDER BY table_name, column_name;
