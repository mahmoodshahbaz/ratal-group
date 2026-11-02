-- employees_entity_code_patch.sql
-- Adds entity_code column to employees table
-- Run once in Supabase SQL Editor

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS entity_code text DEFAULT 'RATAL';

COMMENT ON COLUMN employees.entity_code IS
  'Legal entity the employee belongs to (e.g. RATAL, ACCSYS) — used for multi-entity payroll';
