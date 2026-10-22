-- ============================================================
-- ACCSYS PHASE B SCHEMA — Cash & Advance Management
-- Run AFTER field_ops_schema.sql
-- Safe to re-run (CREATE OR REPLACE, IF NOT EXISTS)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Patch bank_accounts — link to COA for auto-posting
-- ────────────────────────────────────────────────────────────
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS coa_account_code varchar(20);

-- ────────────────────────────────────────────────────────────
-- Employee Advance Running Balance (per employee)
-- txn_type IN:  ADVANCE_IN, TRANSFER_IN
-- txn_type OUT: CLAIM_SETTLED, RETURN_TO_DH
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW employee_advance_balances AS
SELECT
  ea.employee_id,
  e.full_name_en,
  e.full_name_ar,
  e.designation,
  e.department_id,
  d.dept_name,
  COUNT(*)                              FILTER (WHERE ea.txn_type = 'ADVANCE_IN')           AS advance_count,
  COALESCE(SUM(ea.amount)               FILTER (WHERE ea.txn_type IN ('ADVANCE_IN','TRANSFER_IN')),      0) AS total_received,
  COALESCE(SUM(ea.amount)               FILTER (WHERE ea.txn_type IN ('CLAIM_SETTLED','RETURN_TO_DH')),  0) AS total_settled,
  COALESCE(SUM(ea.amount)               FILTER (WHERE ea.txn_type IN ('ADVANCE_IN','TRANSFER_IN')),      0)
  - COALESCE(SUM(ea.amount)             FILTER (WHERE ea.txn_type IN ('CLAIM_SETTLED','RETURN_TO_DH')),  0) AS current_balance,
  MAX(ea.advance_date)                  FILTER (WHERE ea.txn_type = 'ADVANCE_IN')           AS last_advance_date,
  MIN(ea.advance_date)                  FILTER (WHERE ea.txn_type = 'ADVANCE_IN' AND ea.status = 'ISSUED') AS oldest_advance_date
FROM employee_advances ea
JOIN  employees   e ON e.id = ea.employee_id
LEFT JOIN departments d ON d.id = e.department_id
GROUP BY ea.employee_id, e.full_name_en, e.full_name_ar, e.designation, e.department_id, d.dept_name;

-- ────────────────────────────────────────────────────────────
-- DH Cash Accountability — Track A summary per DH
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW dh_cash_accountability AS
SELECT
  ea.issued_by                                                                              AS dh_employee_id,
  COUNT(DISTINCT ea.employee_id)                                                            AS employee_count,
  COUNT(*)                        FILTER (WHERE ea.txn_type = 'ADVANCE_IN')                AS transfer_count,
  COALESCE(SUM(ea.amount)         FILTER (WHERE ea.txn_type IN ('ADVANCE_IN','TRANSFER_IN')),     0) AS total_issued,
  COALESCE(SUM(ea.amount)         FILTER (WHERE ea.txn_type IN ('CLAIM_SETTLED','RETURN_TO_DH')), 0) AS total_recovered,
  COALESCE(SUM(ea.amount)         FILTER (WHERE ea.txn_type IN ('ADVANCE_IN','TRANSFER_IN')),     0)
  - COALESCE(SUM(ea.amount)       FILTER (WHERE ea.txn_type IN ('CLAIM_SETTLED','RETURN_TO_DH')), 0) AS outstanding_balance,
  MIN(ea.advance_date)            FILTER (WHERE ea.txn_type = 'ADVANCE_IN' AND ea.status = 'ISSUED') AS oldest_open_advance
FROM employee_advances ea
WHERE ea.issued_by IS NOT NULL
GROUP BY ea.issued_by;

-- ────────────────────────────────────────────────────────────
-- DONE
-- ────────────────────────────────────────────────────────────
