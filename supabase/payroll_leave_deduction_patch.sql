-- ══════════════════════════════════════════════════════════════
-- N1: Add leave_deduction and unpaid_days columns to payroll_items
-- Run once in Supabase SQL Editor.
-- Safe to run multiple times (IF NOT EXISTS guards).
-- ══════════════════════════════════════════════════════════════

ALTER TABLE payroll_items
  ADD COLUMN IF NOT EXISTS leave_deduction NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unpaid_days     NUMERIC(5,1)  DEFAULT 0;

COMMENT ON COLUMN payroll_items.leave_deduction IS 'Salary deducted for unpaid leave this pay period: (basic_salary/30) * unpaid_days';
COMMENT ON COLUMN payroll_items.unpaid_days     IS 'Number of approved UNPAID leave days falling within this pay period';
