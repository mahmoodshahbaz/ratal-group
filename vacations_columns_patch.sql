-- ══════════════════════════════════════════════════════════════════
-- Vacations columns patch — run in Supabase SQL Editor
-- Adds Annual Leave extra fields + overstay tracking
-- Safe to run multiple times (IF NOT EXISTS / DO NOTHING)
-- ══════════════════════════════════════════════════════════════════

-- 1. Extra columns on vacations table
ALTER TABLE vacations
  ADD COLUMN IF NOT EXISTS actual_return_date DATE    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS home_address       TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS telephone          TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS replacement_name   TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS entitlement_cycle  TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS overstay_days      INT     DEFAULT 0,
  -- Past Availed Vacation History (3 rows, manually entered on the application form)
  ADD COLUMN IF NOT EXISTS prev1_from         DATE    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prev1_to           DATE    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prev1_days         INT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prev2_from         DATE    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prev2_to           DATE    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prev2_days         INT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prev3_from         DATE    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prev3_to           DATE    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prev3_days         INT     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS prev_rejoin_date   DATE    DEFAULT NULL;

-- 2. Extra columns on employees table (if not already added)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS vacation_ticket_eligible BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS home_address             TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mobile                   TEXT    DEFAULT NULL;

-- 3. Confirm
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('vacations', 'employees')
  AND column_name IN (
    'home_address', 'telephone', 'replacement_name', 'entitlement_cycle',
    'overstay_days', 'vacation_ticket_eligible', 'mobile'
  )
ORDER BY table_name, column_name;
