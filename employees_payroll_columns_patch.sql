-- employees_payroll_columns_patch.sql
-- Adds missing payroll + insurance columns to employees table
-- Run once in Supabase SQL Editor

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS bank_fixed_amount      numeric,
  ADD COLUMN IF NOT EXISTS bank_portion_pct       numeric,
  ADD COLUMN IF NOT EXISTS initial_basic_salary   numeric,
  ADD COLUMN IF NOT EXISTS insurance_policy_no    text,
  ADD COLUMN IF NOT EXISTS insurance_expiry_date  date;

COMMENT ON COLUMN employees.bank_fixed_amount IS
  'Fixed SAR amount transferred to bank each month (BANK_CASH_SPLIT mode)';
COMMENT ON COLUMN employees.bank_portion_pct IS
  'Percentage of salary transferred to bank (BANK_CASH_SPLIT mode)';
COMMENT ON COLUMN employees.initial_basic_salary IS
  'Basic salary at time of joining — used for EOSB base calculations';
COMMENT ON COLUMN employees.insurance_policy_no IS
  'Current medical insurance policy number under the bulk corporate scheme';
COMMENT ON COLUMN employees.insurance_expiry_date IS
  'Expiry date of the current insurance policy — update each renewal cycle';
