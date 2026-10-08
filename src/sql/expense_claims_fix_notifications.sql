-- ============================================================
-- expense_claims_fix_notifications.sql
-- Fix: null employee name causes NOT NULL violation on notifications.message
-- Root cause: if p_dh_employee_id is NULL or not in employees,
--   v_emp.full_name_en is NULL, and NULL || 'text' = NULL in PostgreSQL
-- Run this in Supabase SQL Editor to replace the 3 affected functions.
-- ============================================================

-- ── 1. dh_approve_claim (safe version) ────────────────────────
CREATE OR REPLACE FUNCTION dh_approve_claim(
  p_claim_id       UUID,
  p_dh_employee_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_claim expense_claims%ROWTYPE;
  v_emp   employees%ROWTYPE;
  v_name  TEXT;
BEGIN
  IF p_dh_employee_id IS NULL THEN
    RETURN jsonb_build_object('error', 'DH employee ID is required — employee record not found for this user');
  END IF;

  SELECT * INTO v_claim FROM expense_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Claim not found'); END IF;
  IF v_claim.status <> 'SUBMITTED'
  THEN RETURN jsonb_build_object('error','Claim must be SUBMITTED'); END IF;

  SELECT * INTO v_emp FROM employees WHERE id = p_dh_employee_id;
  v_name := COALESCE(v_emp.full_name_en, 'Unknown');

  UPDATE expense_claims SET
    status              = 'DH_APPROVED',
    dh_approved_at      = now(),
    dh_approved_by      = p_dh_employee_id,
    dh_approved_by_name = v_name
  WHERE id = p_claim_id;

  -- Notify Accounts team (entity-wide, no specific employee)
  INSERT INTO notifications
    (entity_id, type, title, message, priority, reference_type, reference_id)
  VALUES
    (v_claim.entity_id,
     'CLAIM_DH_APPROVED',
     'Claim approved by DH — ' || COALESCE(v_claim.claim_number, ''),
     v_name || ' approved claim ' || COALESCE(v_claim.claim_number, '')
       || ' (' || COALESCE(v_claim.period, '') || '). Ready for Accounts review.',
     'MEDIUM', 'expense_claim', p_claim_id);

  RETURN jsonb_build_object('ok', true, 'status','DH_APPROVED');
END; $$;

-- ── 2. dh_reject_claim (safe version) ──────────────────────────
CREATE OR REPLACE FUNCTION dh_reject_claim(
  p_claim_id       UUID,
  p_dh_employee_id UUID,
  p_reason         TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_claim expense_claims%ROWTYPE;
  v_emp   employees%ROWTYPE;
  v_name  TEXT;
  v_round INTEGER;
BEGIN
  IF p_dh_employee_id IS NULL THEN
    RETURN jsonb_build_object('error', 'DH employee ID is required');
  END IF;

  SELECT * INTO v_claim FROM expense_claims WHERE id = p_claim_id;
  IF v_claim.status <> 'SUBMITTED'
  THEN RETURN jsonb_build_object('error','Claim must be SUBMITTED'); END IF;

  SELECT * INTO v_emp FROM employees WHERE id = p_dh_employee_id;
  v_name  := COALESCE(v_emp.full_name_en, 'Unknown');
  v_round := COALESCE(v_claim.rejection_round, 0) + 1;

  UPDATE expense_claims SET
    status           = 'REJECTED',
    rejection_reason = p_reason,
    rejection_round  = v_round
  WHERE id = p_claim_id;

  INSERT INTO expense_claim_rejections
    (claim_id, rejected_by, rejected_by_name, reason, round)
  VALUES
    (p_claim_id, p_dh_employee_id, v_name, p_reason, v_round);

  -- Notify Finance Admin (generated_by)
  IF v_claim.generated_by IS NOT NULL THEN
    INSERT INTO notifications
      (entity_id, employee_id, type, title, message, priority, reference_type, reference_id)
    VALUES
      (v_claim.entity_id, v_claim.generated_by,
       'CLAIM_DH_REJECTED',
       'DH rejected claim — ' || COALESCE(v_claim.claim_number,''),
       v_name || ' rejected claim ' || COALESCE(v_claim.claim_number,'')
         || ': ' || COALESCE(p_reason,''),
       'HIGH', 'expense_claim', p_claim_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'status','REJECTED', 'round', v_round);
END; $$;

-- ── 3. accounts_approve_claim (safe version) ──────────────────
CREATE OR REPLACE FUNCTION accounts_approve_claim(
  p_claim_id              UUID,
  p_accounts_employee_id  UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_claim expense_claims%ROWTYPE;
  v_emp   employees%ROWTYPE;
  v_name  TEXT;
BEGIN
  IF p_accounts_employee_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Accounts employee ID is required');
  END IF;

  SELECT * INTO v_claim FROM expense_claims WHERE id = p_claim_id;
  SELECT * INTO v_emp   FROM employees       WHERE id = p_accounts_employee_id;
  v_name := COALESCE(v_emp.full_name_en, 'Unknown');

  IF v_claim.status <> 'DH_APPROVED'
  THEN RETURN jsonb_build_object('error','Claim must be DH_APPROVED'); END IF;

  IF v_claim.dh_correction_status = 'PENDING'
  THEN RETURN jsonb_build_object('error','Waiting for DH to acknowledge the correction (3-day window)'); END IF;

  UPDATE expense_claims SET
    status                    = 'ACCOUNTS_APPROVED',
    accounts_approved_at      = now(),
    accounts_approved_by      = p_accounts_employee_id,
    accounts_approved_by_name = v_name
  WHERE id = p_claim_id;

  -- Notify employee
  IF v_claim.employee_id IS NOT NULL THEN
    INSERT INTO notifications
      (entity_id, employee_id, type, title, message, priority, reference_type, reference_id)
    VALUES
      (v_claim.entity_id, v_claim.employee_id,
       'CLAIM_ACCOUNTS_APPROVED',
       'Expense claim approved — ' || COALESCE(v_claim.period,''),
       'Your expense claim ' || COALESCE(v_claim.claim_number,'')
         || ' for ' || COALESCE(v_claim.period,'')
         || ' has been approved by Accounts. It will now be posted to the payroll ledger.',
       'MEDIUM', 'expense_claim', p_claim_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'status','ACCOUNTS_APPROVED',
    'approved_by', v_name, 'at', now()::TEXT);
END; $$;

-- ── Re-grant (in case grants were lost) ───────────────────────
GRANT EXECUTE ON FUNCTION dh_approve_claim(UUID,UUID)         TO authenticated, anon;
GRANT EXECUTE ON FUNCTION dh_reject_claim(UUID,UUID,TEXT)     TO authenticated, anon;
GRANT EXECUTE ON FUNCTION accounts_approve_claim(UUID,UUID)   TO authenticated, anon;
