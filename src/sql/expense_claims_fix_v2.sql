-- ============================================================
-- expense_claims_fix_v2.sql
-- Wraps all notification INSERTs in EXCEPTION blocks so a
-- notification failure NEVER blocks the claim status update.
-- Run this in Supabase SQL Editor.
-- ============================================================

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
    RETURN jsonb_build_object('error', 'Employee record not found for your account. Ask admin to check your name in Employees matches your login name exactly.');
  END IF;

  SELECT * INTO v_claim FROM expense_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Claim not found'); END IF;
  IF v_claim.status <> 'SUBMITTED'
  THEN RETURN jsonb_build_object('error','Claim must be SUBMITTED to approve'); END IF;

  SELECT * INTO v_emp FROM employees WHERE id = p_dh_employee_id;
  v_name := COALESCE(v_emp.full_name_en, 'DH Approver');

  UPDATE expense_claims SET
    status              = 'DH_APPROVED',
    dh_approved_at      = now(),
    dh_approved_by      = p_dh_employee_id,
    dh_approved_by_name = v_name
  WHERE id = p_claim_id;

  -- Notification — wrapped in EXCEPTION so it never blocks the approval
  BEGIN
    INSERT INTO notifications
      (entity_id, type, title, message, priority, reference_type, reference_id)
    VALUES
      (v_claim.entity_id,
       'CLAIM_DH_APPROVED',
       'Claim approved by DH — ' || COALESCE(v_claim.claim_number,''),
       v_name || ' approved claim ' || COALESCE(v_claim.claim_number,'')
         || ' (' || COALESCE(v_claim.period,'') || '). Ready for Accounts review.',
       'MEDIUM', 'expense_claim', p_claim_id);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- notification failed silently; claim is still approved
  END;

  RETURN jsonb_build_object('ok', true, 'status','DH_APPROVED');
END; $$;

-- ─────────────────────────────────────────────────────────────

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
    RETURN jsonb_build_object('error', 'Employee record not found for your account.');
  END IF;

  SELECT * INTO v_claim FROM expense_claims WHERE id = p_claim_id;
  IF v_claim.status <> 'SUBMITTED'
  THEN RETURN jsonb_build_object('error','Claim must be SUBMITTED'); END IF;

  SELECT * INTO v_emp FROM employees WHERE id = p_dh_employee_id;
  v_name  := COALESCE(v_emp.full_name_en, 'DH Reviewer');
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

  BEGIN
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
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('ok', true, 'status','REJECTED', 'round', v_round);
END; $$;

-- ─────────────────────────────────────────────────────────────

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
    RETURN jsonb_build_object('error', 'Employee record not found for your account.');
  END IF;

  SELECT * INTO v_claim FROM expense_claims WHERE id = p_claim_id;
  SELECT * INTO v_emp   FROM employees       WHERE id = p_accounts_employee_id;
  v_name := COALESCE(v_emp.full_name_en, 'Accounts');

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

  BEGIN
    IF v_claim.employee_id IS NOT NULL THEN
      INSERT INTO notifications
        (entity_id, employee_id, type, title, message, priority, reference_type, reference_id)
      VALUES
        (v_claim.entity_id, v_claim.employee_id,
         'CLAIM_ACCOUNTS_APPROVED',
         'Expense claim approved — ' || COALESCE(v_claim.period,''),
         'Your expense claim ' || COALESCE(v_claim.claim_number,'')
           || ' for ' || COALESCE(v_claim.period,'')
           || ' has been approved by Accounts.',
         'MEDIUM', 'expense_claim', p_claim_id);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('ok', true, 'status','ACCOUNTS_APPROVED',
    'approved_by', v_name, 'at', now()::TEXT);
END; $$;

-- ─────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION dh_approve_claim(UUID,UUID)         TO authenticated, anon;
GRANT EXECUTE ON FUNCTION dh_reject_claim(UUID,UUID,TEXT)     TO authenticated, anon;
GRANT EXECUTE ON FUNCTION accounts_approve_claim(UUID,UUID)   TO authenticated, anon;
