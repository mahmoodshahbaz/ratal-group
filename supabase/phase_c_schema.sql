-- ============================================================
-- ACCSYS PHASE C SCHEMA — Expense Records & Claims
-- Run AFTER phase_b_schema.sql
-- Safe to re-run (IF NOT EXISTS / OR REPLACE)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Patch expense_records: add FK to expense_claims properly
-- claim_id was created as bare uuid in Phase A — add index
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_exp_rec_claim    ON expense_records(claim_id);
CREATE INDEX IF NOT EXISTS idx_exp_rec_emp_date ON expense_records(employee_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_exp_claims_emp   ON expense_claims(employee_id, period);

-- ────────────────────────────────────────────────────────────
-- Expense summary per employee per period (for DH review)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW expense_claim_summary AS
SELECT
  ec.id                                          AS claim_id,
  ec.claim_number,
  ec.employee_id,
  e.full_name_en,
  e.full_name_ar,
  d.dept_name,
  ec.period,
  ec.status,
  ec.total_advances_received,
  ec.total_claimed,
  ec.total_vat_recoverable,
  ec.balance_with_employee,
  ec.submitted_at,
  ec.dh_approved_at,
  ec.finance_approved_at,
  ec.paid_at,
  COUNT(er.id)                                   AS record_count
FROM expense_claims ec
JOIN  employees   e  ON e.id  = ec.employee_id
LEFT JOIN departments d  ON d.id  = e.department_id
LEFT JOIN expense_records er ON er.claim_id = ec.id
GROUP BY
  ec.id, ec.claim_number, ec.employee_id, e.full_name_en, e.full_name_ar,
  d.dept_name, ec.period, ec.status, ec.total_advances_received,
  ec.total_claimed, ec.total_vat_recoverable, ec.balance_with_employee,
  ec.submitted_at, ec.dh_approved_at, ec.finance_approved_at, ec.paid_at;

-- ────────────────────────────────────────────────────────────
-- DONE
-- ────────────────────────────────────────────────────────────
