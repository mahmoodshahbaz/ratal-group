-- ============================================================
-- ACCSYS HR: Penalties table — new columns for v2 form
-- Run in Supabase SQL editor
-- ============================================================

ALTER TABLE employee_penalties
  ADD COLUMN IF NOT EXISTS dept_id          UUID    REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS department_name  TEXT,
  ADD COLUMN IF NOT EXISTS penalty_category TEXT
      CHECK (penalty_category IN (
        'SPEEDING','PARKING','SIGNAL','MISCONDUCT',
        'ISTEMARA','INSURANCE','PLATE','OTHER'
      )),
  ADD COLUMN IF NOT EXISTS violation_ref    TEXT,
  ADD COLUMN IF NOT EXISTS violation_date   DATE,
  ADD COLUMN IF NOT EXISTS vehicle_plate    TEXT;

COMMENT ON COLUMN employee_penalties.dept_id          IS 'Department of the penalised employee';
COMMENT ON COLUMN employee_penalties.department_name  IS 'Dept abbreviation (dept_code) snapshotted at save time';
COMMENT ON COLUMN employee_penalties.penalty_category IS 'SPEEDING|PARKING|SIGNAL|MISCONDUCT|ISTEMARA|INSURANCE|PLATE|OTHER';
COMMENT ON COLUMN employee_penalties.violation_ref    IS 'Saher / traffic authority reference number';
COMMENT ON COLUMN employee_penalties.violation_date   IS 'Date the violation was issued (may differ from penalty_date)';
COMMENT ON COLUMN employee_penalties.vehicle_plate    IS 'Plate number of the assigned vehicle at the time of penalty (from vehicle_assignments)';

-- ============================================================
-- Fix legacy loan_eligible data
-- The column was added with DEFAULT FALSE which zeroed out old employees.
-- This updates employees whose wizard had it checked but the column defaulted to false.
-- Safe to run multiple times — only touches records where loan_eligible IS FALSE
-- and the employee has a loan on file (proof they were eligible).
-- ============================================================

-- Option A: Bulk-set any employee who already has a loan in employee_loans → must have been eligible
UPDATE employees e
SET loan_eligible = TRUE
WHERE loan_eligible = FALSE
  AND EXISTS (
    SELECT 1 FROM employee_loans l
    WHERE l.employee_id = e.id
      AND l.entity_id   = e.entity_id
  );

-- Option B (manual): Run this per employee if you know which ones to fix
-- UPDATE employees SET loan_eligible = TRUE WHERE entity_id = '<entity_id>' AND employee_number = 'ACC-023';

COMMENT ON COLUMN employees.loan_eligible IS 'Set by wizard Compliance step. DEFAULT FALSE was applied to legacy records — run hr_penalties_schema_patch.sql to fix.';
