-- ══════════════════════════════════════════════════════════════════
-- RATAL GROUP — Employees + Departments schema patch
-- Run this in Supabase → SQL Editor
-- Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS guards)
-- ══════════════════════════════════════════════════════════════════

-- ─── STEP 1: Make dept_code unique PER ENTITY (not globally) ───
-- The original add_form_fields.sql had UNIQUE on dept_code alone,
-- which would block two entities both having an "IT" department.
-- Drop the global unique constraint if it exists, add a composite one.
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_dept_code_key;
ALTER TABLE departments
  ADD CONSTRAINT departments_entity_dept_code_unique
  UNIQUE (entity_id, dept_code);

-- ─── STEP 2: EMPLOYEES — add every column the form needs ────────

-- Identity
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_number     VARCHAR(30);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_title           VARCHAR(150);

-- Contact
ALTER TABLE employees ADD COLUMN IF NOT EXISTS email               VARCHAR(150);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone               VARCHAR(30);

-- Salary (the original schema used basic/hra/conveyance;
--          Employees.jsx uses basic_salary/housing_allowance/transport_allowance)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS basic_salary        NUMERIC(14,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS housing_allowance   NUMERIC(14,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS transport_allowance NUMERIC(14,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS food_allowance      NUMERIC(14,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS other_allowance     NUMERIC(14,2) DEFAULT 0;

-- Employment dates
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hire_date           DATE;

-- ID documents
ALTER TABLE employees ADD COLUMN IF NOT EXISTS iqama_number        VARCHAR(30);
-- iqama_expiry was already added by phase1_missing_tables.sql — guarded:
ALTER TABLE employees ADD COLUMN IF NOT EXISTS iqama_expiry        DATE;

-- Banking
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_code           VARCHAR(20) DEFAULT '1060';

-- Denormalised full name used by some reports/selects
ALTER TABLE employees ADD COLUMN IF NOT EXISTS full_name           TEXT;

-- ─── STEP 3: Back-fill full_name from full_name_en ──────────────
UPDATE employees SET full_name = full_name_en WHERE full_name IS NULL;

-- ─── DONE ───────────────────────────────────────────────────────
-- After running this script:
-- 1. Go to Departments → create your departments (IT, Finance, HR, Operations, etc.)
-- 2. Then go to Employees → Add Employee (the Department dropdown will now be populated)
