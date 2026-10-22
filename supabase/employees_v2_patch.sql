-- ══════════════════════════════════════════════════════════════════
-- RATAL GROUP — Employees v2 Schema Patch
-- Adds missing columns that Employees.jsx needs
-- Run this FIRST, then run employees_bulk_insert_v2.sql
-- Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS guards)
-- ══════════════════════════════════════════════════════════════════

-- Core identity columns
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_type  VARCHAR(50);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_code  VARCHAR(50);

-- Department FK (the app uses department_id, not the old department TEXT column)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_id  UUID REFERENCES departments(id) ON DELETE SET NULL;

-- Dependent flags (original schema had has_dependent/dependent_count; app uses has_dependents/num_dependents)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS has_dependents BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS num_dependents INT DEFAULT 0;

-- Eligibility flags (original used loan_allowed/ot_allowed/food_allowance_eligible; app uses new names)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS loan_eligible  BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS ot_eligible    BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS fa_eligible    BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS fa_amount      NUMERIC(10,2) DEFAULT 0;

-- is_active (should already exist but guard it)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_active      BOOLEAN DEFAULT TRUE;

-- Unique constraint on employee_number (required for ON CONFLICT)
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_employee_number_key;
ALTER TABLE employees ADD CONSTRAINT employees_employee_number_key UNIQUE (employee_number);

-- Fix departments unique constraint so two entities can share dept_code (e.g. both have 'TRAVELS')
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_dept_code_key;
ALTER TABLE departments ADD CONSTRAINT IF NOT EXISTS departments_entity_dept_code_unique UNIQUE (entity_id, dept_code);

SELECT 'employees_v2_patch applied ✅' AS status;
