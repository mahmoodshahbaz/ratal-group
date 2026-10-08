-- ============================================================
-- duplicate_guard_constraints.sql
-- Run once in Supabase SQL Editor
--
-- Adds uniqueness rules for:
--   1. food_allowances  → one entry per (employee, date, job_type)
--   2. overtime_records → one entry per (employee, work_date, project_id)
-- ============================================================

-- ── 1. Food Allowances ────────────────────────────────────────
-- One row per employee per date per job_type.
-- Allows Abdul Hakeem to have both 'travel' (his own) and
-- 'outsource' (group entry) on the same day, but not two 'travel' rows.
-- job_type may be NULL — NULLS are treated as distinct in standard
-- unique indexes, so use a partial coalesce approach via expression index.

-- Drop if re-running
DROP INDEX IF EXISTS idx_food_allowances_emp_date_jobtype;

CREATE UNIQUE INDEX idx_food_allowances_emp_date_jobtype
  ON food_allowances (employee_id, allowance_date, COALESCE(job_type, ''));

-- Friendly error message via constraint check (optional — index is the real guard)
-- The DB will return code 23505 on violation; the app shows a clear message.


-- ── 2. Overtime Records ───────────────────────────────────────
-- One row per employee per work_date per project.
-- NULL project_id is treated as a single "no project" slot.

DROP INDEX IF EXISTS idx_overtime_records_emp_date_project;

CREATE UNIQUE INDEX idx_overtime_records_emp_date_project
  ON overtime_records (employee_id, work_date, COALESCE(project_id::TEXT, ''));


-- ── Verify ────────────────────────────────────────────────────
SELECT indexname, indexdef
FROM   pg_indexes
WHERE  tablename IN ('food_allowances', 'overtime_records')
  AND  indexname IN (
    'idx_food_allowances_emp_date_jobtype',
    'idx_overtime_records_emp_date_project'
  );
