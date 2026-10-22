-- ============================================================
-- ACCSYS PHASE G SCHEMA — Payment Validation (Receipt Confirmation)
-- Run AFTER phase_f_schema.sql
-- Safe to re-run (IF NOT EXISTS / OR REPLACE)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Patch employee_advances: add confirmation tracking columns
-- ────────────────────────────────────────────────────────────
ALTER TABLE employee_advances ADD COLUMN IF NOT EXISTS confirmed_at      timestamptz;
ALTER TABLE employee_advances ADD COLUMN IF NOT EXISTS receipt_photo_url text;
ALTER TABLE employee_advances ADD COLUMN IF NOT EXISTS confirmed_by      uuid REFERENCES employees(id);
ALTER TABLE employee_advances ADD COLUMN IF NOT EXISTS recipient_notes   text;

-- ────────────────────────────────────────────────────────────
-- View: advances pending confirmation (status = ISSUED, txn_type = ADVANCE_IN)
-- Used by FormPaymentValidation to show what needs sign-off
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW pending_advance_confirmations AS
SELECT
  ea.id,
  ea.entity_id,
  ea.employee_id,
  ea.advance_date,
  ea.amount,
  ea.txn_type,
  ea.status,
  ea.reference,
  ea.notes,
  ea.confirmed_at,
  ea.receipt_photo_url,
  -- Who issued it
  ea.issued_by,
  issuer.full_name_en   AS issued_by_name,
  issuer.full_name_ar   AS issued_by_name_ar,
  issuer.designation    AS issuer_designation,
  -- Recipient
  recip.full_name_en    AS employee_name,
  recip.full_name_ar    AS employee_name_ar,
  recip.department_id,
  dept.dept_name
FROM employee_advances ea
LEFT JOIN employees issuer ON issuer.id = ea.issued_by
LEFT JOIN employees recip  ON recip.id  = ea.employee_id
LEFT JOIN departments dept  ON dept.id   = recip.department_id
WHERE ea.txn_type = 'ADVANCE_IN'
  AND ea.status   = 'ISSUED';

-- ────────────────────────────────────────────────────────────
-- DONE
-- ────────────────────────────────────────────────────────────
