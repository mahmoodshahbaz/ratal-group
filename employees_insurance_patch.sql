-- employees_insurance_patch.sql
-- Adds insurance snapshot columns to employees table
-- Run once in Supabase SQL Editor

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS insurance_policy_no    text,
  ADD COLUMN IF NOT EXISTS insurance_expiry_date  date;

COMMENT ON COLUMN employees.insurance_policy_no IS
  'Current insurance policy number for this employee under the bulk corporate scheme';

COMMENT ON COLUMN employees.insurance_expiry_date IS
  'Expiry date of the current insurance policy — update each renewal cycle';
