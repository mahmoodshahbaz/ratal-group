-- employee_dependents_insurance_patch.sql
-- Adds insurance columns to employee_dependents table
-- Run once in Supabase SQL Editor

ALTER TABLE employee_dependents
  ADD COLUMN IF NOT EXISTS insurance_policy_no    text,
  ADD COLUMN IF NOT EXISTS insurance_expiry_date  date;

COMMENT ON COLUMN employee_dependents.insurance_policy_no IS
  'Insurance policy number assigned to this dependent under the bulk corporate scheme';

COMMENT ON COLUMN employee_dependents.insurance_expiry_date IS
  'Expiry date of the dependent''s current insurance policy';
