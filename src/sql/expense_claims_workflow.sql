-- ============================================================
-- expense_claims_workflow.sql
-- Full workflow: role-based approvals, corrections, 3-day escalation
-- Run AFTER expense_claims_rls_open.sql
-- ============================================================

-- ── 1. New columns on expense_claims ──────────────────────────
ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS dh_approved_by        UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS dh_approved_by_name   TEXT,
  ADD COLUMN IF NOT EXISTS corrected_by          UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS corrected_by_name     TEXT,
  ADD COLUMN IF NOT EXISTS corrected_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS correction_note       TEXT,
  ADD COLUMN IF NOT EXISTS dh_notified_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dh_escalation_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dh_escalation_task_id TEXT,
  ADD COLUMN IF NOT EXISTS dh_correction_status  TEXT CHECK (dh_correction_status IN ('PENDING','ACKNOWLEDGED','OBJECTED','AUTO_APPROVED')),
  ADD COLUMN IF NOT EXISTS accounts_approved_by      UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS accounts_approved_by_name TEXT,
  ADD COLUMN IF NOT EXISTS accounts_approved_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_at                 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS generated_by_name         TEXT;

-- ── 2. RPC: DH approves claim (normal flow) ────────────────────
CREATE OR REPLACE FUNCTION dh_approve_claim(
  p_claim_id       UUID,
  p_dh_employee_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_claim expense_claims%ROWTYPE;
  v_emp   employees%ROWTYPE;
BEGIN
  SELECT * INTO v_claim FROM expense_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Claim not found'); END IF;
  IF v_claim.status <> 'SUBMITTED'
  THEN RETURN jsonb_build_object('error','Claim must be SUBMITTED'); END IF;

  SELECT * INTO v_emp FROM employees WHERE id = p_dh_employee_id;

  UPDATE expense_claims SET
    status              = 'DH_APPROVED',
    dh_approved_at      = now(),
    dh_approved_by      = p_dh_employee_id,
    dh_approved_by_name = v_emp.full_name_en
  WHERE id = p_claim_id;

  -- Notify Accounts team (no specific employee — entity-wide)
  INSERT INTO notifications
    (entity_id, type, title, message, priority, reference_type, reference_id)
  VALUES
    (v_claim.entity_id,
     'CLAIM_DH_APPROVED',
     'Claim approved by DH — ' || v_claim.claim_number,
     v_emp.full_name_en || ' approved claim ' || v_claim.claim_number
       || ' (' || v_claim.period || '). Ready for Accounts review.',
     'MEDIUM', 'expense_claim', p_claim_id);

  RETURN jsonb_build_object('ok', true, 'status','DH_APPROVED');
END; $$;

-- ── 3. RPC: DH rejects claim (normal flow) ────────────────────
CREATE OR REPLACE FUNCTION dh_reject_claim(
  p_claim_id       UUID,
  p_dh_employee_id UUID,
  p_reason         TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_claim expense_claims%ROWTYPE;
  v_emp   employees%ROWTYPE;
  v_round INTEGER;
BEGIN
  SELECT * INTO v_claim FROM expense_claims WHERE id = p_claim_id;
  IF v_claim.status <> 'SUBMITTED'
  THEN RETURN jsonb_build_object('error','Claim must be SUBMITTED'); END IF;

  SELECT * INTO v_emp FROM employees WHERE id = p_dh_employee_id;
  v_round := COALESCE(v_claim.rejection_round, 0) + 1;

  UPDATE expense_claims SET
    status           = 'REJECTED',
    rejection_reason = p_reason,
    rejection_round  = v_round
  WHERE id = p_claim_id;

  INSERT INTO expense_claim_rejections
    (claim_id, rejected_by, rejected_by_name, reason, round)
  VALUES
    (p_claim_id, p_dh_employee_id, v_emp.full_name_en, p_reason, v_round);

  -- Notify Finance Admin (generated_by)
  IF v_claim.generated_by IS NOT NULL THEN
    INSERT INTO notifications
      (entity_id, employee_id, type, title, message, priority, reference_type, reference_id)
    VALUES
      (v_claim.entity_id, v_claim.generated_by,
       'CLAIM_DH_REJECTED',
       'DH rejected claim — ' || v_claim.claim_number,
       v_emp.full_name_en || ' rejected claim ' || v_claim.claim_number
         || ': ' || p_reason,
       'HIGH', 'expense_claim', p_claim_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'status','REJECTED', 'round', v_round);
END; $$;

-- ── 4. RPC: Admin zeros out a single expense record ────────────
-- Called by Finance Admin or Accounts before approving
CREATE OR REPLACE FUNCTION admin_zero_expense_record(
  p_record_id         UUID,
  p_admin_employee_id UUID,
  p_note              TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_original NUMERIC;
BEGIN
  SELECT amount INTO v_original FROM expense_records WHERE id = p_record_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Record not found'); END IF;

  UPDATE expense_records SET
    original_amount  = CASE WHEN original_amount IS NULL THEN amount ELSE original_amount END,
    amount           = 0,
    vat_amount       = 0,
    adjusted_by      = p_admin_employee_id,
    adjusted_at      = now(),
    adjustment_note  = p_note,
    status           = 'VOID'
  WHERE id = p_record_id;

  RETURN jsonb_build_object('ok', true, 'original_amount', v_original);
END; $$;

-- ── 5. RPC: Submit correction + start 3-day DH timer ──────────
-- Called AFTER admin has zeroed the needed records
CREATE OR REPLACE FUNCTION submit_claim_correction(
  p_claim_id          UUID,
  p_admin_employee_id UUID,
  p_correction_note   TEXT,
  p_task_id           TEXT   -- scheduled-task ID (created by JS before calling this)
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_claim    expense_claims%ROWTYPE;
  v_admin    employees%ROWTYPE;
  v_new_total NUMERIC;
BEGIN
  SELECT * INTO v_claim FROM expense_claims WHERE id = p_claim_id;
  SELECT * INTO v_admin FROM employees WHERE id = p_admin_employee_id;

  -- Recalculate total from non-void records
  SELECT COALESCE(SUM(amount),0)
  INTO   v_new_total
  FROM   expense_records
  WHERE  claim_id = p_claim_id AND status <> 'VOID';

  UPDATE expense_claims SET
    total_claimed           = v_new_total,
    balance_with_employee   = total_advances_received - v_new_total,
    corrected_by            = p_admin_employee_id,
    corrected_by_name       = v_admin.full_name_en,
    corrected_at            = now(),
    correction_note         = p_correction_note,
    dh_notified_at          = now(),
    dh_escalation_deadline  = now() + INTERVAL '3 days',
    dh_escalation_task_id   = p_task_id,
    dh_correction_status    = 'PENDING'
  WHERE id = p_claim_id;

  -- Sticky notification to DH (doesn't auto-dismiss until action taken)
  IF v_claim.dh_approved_by IS NOT NULL THEN
    INSERT INTO notifications
      (entity_id, employee_id, type, title, message, priority, reference_type, reference_id)
    VALUES
      (v_claim.entity_id, v_claim.dh_approved_by,
       'CLAIM_CORRECTION_PENDING',
       'Correction made — ' || v_claim.claim_number,
       'A correction was applied to '
         || (SELECT full_name_en FROM employees WHERE id = v_claim.employee_id)
         || '''s claim by Accounts. You have 3 days to acknowledge or object. After that it proceeds automatically.',
       'HIGH', 'expense_claim', p_claim_id);
  END IF;

  RETURN jsonb_build_object(
    'ok',               true,
    'new_total',        v_new_total,
    'deadline',         (now() + INTERVAL '3 days')::TEXT
  );
END; $$;

-- ── 6. RPC: DH acknowledges correction (kills timer) ──────────
CREATE OR REPLACE FUNCTION dh_acknowledge_correction(
  p_claim_id       UUID,
  p_dh_employee_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_task_id TEXT;
BEGIN
  SELECT dh_escalation_task_id INTO v_task_id
  FROM   expense_claims WHERE id = p_claim_id;

  UPDATE expense_claims SET
    dh_correction_status   = 'ACKNOWLEDGED',
    dh_escalation_task_id  = NULL,
    dh_escalation_deadline = NULL
  WHERE id = p_claim_id;

  -- Return the task ID so JS can cancel the scheduled task
  RETURN jsonb_build_object('ok', true, 'cancel_task_id', v_task_id);
END; $$;

-- ── 7. RPC: DH objects to correction (timer keeps running) ────
CREATE OR REPLACE FUNCTION dh_object_correction(
  p_claim_id       UUID,
  p_dh_employee_id UUID,
  p_reason         TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_emp employees%ROWTYPE;
  v_deadline TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_emp FROM employees WHERE id = p_dh_employee_id;
  SELECT dh_escalation_deadline INTO v_deadline FROM expense_claims WHERE id = p_claim_id;

  UPDATE expense_claims SET
    dh_correction_status = 'OBJECTED',
    notes = COALESCE(notes,'') || E'\n[DH Objection ' || NOW()::DATE
          || ' by ' || v_emp.full_name_en || ']: ' || p_reason
  WHERE id = p_claim_id;

  -- Notify Finance Admin — timer still running
  INSERT INTO notifications
    (entity_id, type, title, message, priority, reference_type, reference_id)
  SELECT entity_id,
    'CLAIM_DH_OBJECTION',
    'DH raised concern — ' || claim_number,
    v_emp.full_name_en || ' objected: "' || p_reason
      || '". 3-day timer still running — deadline: ' || v_deadline::DATE || '.',
    'HIGH', 'expense_claim', p_claim_id
  FROM expense_claims WHERE id = p_claim_id;

  RETURN jsonb_build_object('ok', true, 'timer_still_running', true, 'deadline', v_deadline::TEXT);
END; $$;

-- ── 8. RPC: Auto-escalate (called when 3-day timer fires) ─────
CREATE OR REPLACE FUNCTION auto_escalate_expense_claim(p_claim_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_claim expense_claims%ROWTYPE;
BEGIN
  SELECT * INTO v_claim FROM expense_claims WHERE id = p_claim_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Claim not found'); END IF;

  -- Only escalate if still unresolved
  IF v_claim.dh_correction_status NOT IN ('PENDING','OBJECTED') THEN
    RETURN jsonb_build_object('skipped', true, 'status', v_claim.dh_correction_status);
  END IF;

  UPDATE expense_claims SET
    dh_correction_status   = 'AUTO_APPROVED',
    dh_escalation_task_id  = NULL,
    dh_escalation_deadline = NULL,
    notes = COALESCE(notes,'') || E'\n[System auto-escalation ' || NOW()::DATE
          || ']: DH was notified on ' || v_claim.dh_notified_at::DATE
          || ' but did not act within 3 days. Correction approved automatically.'
  WHERE id = p_claim_id;

  -- Notify DH
  IF v_claim.dh_approved_by IS NOT NULL THEN
    INSERT INTO notifications
      (entity_id, employee_id, type, title, message, priority, reference_type, reference_id)
    VALUES
      (v_claim.entity_id, v_claim.dh_approved_by,
       'CLAIM_AUTO_ESCALATED',
       'Claim auto-escalated — ' || v_claim.claim_number,
       'You did not respond to the correction on ' || v_claim.claim_number
         || ' within 3 days. It has been automatically approved and returned to Accounts.',
       'MEDIUM', 'expense_claim', p_claim_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'auto_approved', true);
END; $$;

-- ── 9. RPC: Process ALL expired escalations (pg_cron calls this) ─
CREATE OR REPLACE FUNCTION process_expired_claim_escalations()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_claim  expense_claims%ROWTYPE;
  v_count  INTEGER := 0;
BEGIN
  FOR v_claim IN
    SELECT * FROM expense_claims
    WHERE  dh_correction_status IN ('PENDING','OBJECTED')
      AND  dh_escalation_deadline IS NOT NULL
      AND  dh_escalation_deadline < NOW()
  LOOP
    PERFORM auto_escalate_expense_claim(v_claim.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('processed', v_count, 'at', NOW()::TEXT);
END; $$;

-- Schedule: run every hour (requires pg_cron extension enabled in Supabase)
-- Enable pg_cron in Supabase Dashboard → Database → Extensions → pg_cron
-- Then uncomment:
/*
SELECT cron.schedule(
  'process-expired-claim-escalations',
  '0 * * * *',
  $$ SELECT process_expired_claim_escalations() $$
);
*/

-- ── 10. RPC: Accounts approves claim → post journal ───────────
CREATE OR REPLACE FUNCTION accounts_approve_claim(
  p_claim_id              UUID,
  p_accounts_employee_id  UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_claim expense_claims%ROWTYPE;
  v_emp   employees%ROWTYPE;
BEGIN
  SELECT * INTO v_claim FROM expense_claims WHERE id = p_claim_id;
  SELECT * INTO v_emp   FROM employees       WHERE id = p_accounts_employee_id;

  IF v_claim.status <> 'DH_APPROVED'
  THEN RETURN jsonb_build_object('error','Claim must be DH_APPROVED'); END IF;

  -- Block if correction is still pending DH response
  IF v_claim.dh_correction_status = 'PENDING'
  THEN RETURN jsonb_build_object('error','Waiting for DH to acknowledge the correction (3-day window)'); END IF;

  UPDATE expense_claims SET
    status                    = 'ACCOUNTS_APPROVED',
    accounts_approved_at      = now(),
    accounts_approved_by      = p_accounts_employee_id,
    accounts_approved_by_name = v_emp.full_name_en
  WHERE id = p_claim_id;

  -- Notify employee
  INSERT INTO notifications
    (entity_id, employee_id, type, title, message, priority, reference_type, reference_id)
  VALUES
    (v_claim.entity_id, v_claim.employee_id,
     'CLAIM_ACCOUNTS_APPROVED',
     'Expense claim approved — ' || v_claim.period,
     'Your expense claim ' || v_claim.claim_number
       || ' for ' || v_claim.period
       || ' has been approved by Accounts. It will now be posted to the payroll ledger.',
     'MEDIUM', 'expense_claim', p_claim_id);

  RETURN jsonb_build_object('ok', true, 'status','ACCOUNTS_APPROVED',
    'approved_by', v_emp.full_name_en, 'at', now()::TEXT);
END; $$;

-- ── 11. RPC: Accounts rejects claim ───────────────────────────
CREATE OR REPLACE FUNCTION accounts_reject_claim(
  p_claim_id              UUID,
  p_accounts_employee_id  UUID,
  p_reason                TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_claim expense_claims%ROWTYPE;
  v_emp   employees%ROWTYPE;
  v_round INTEGER;
BEGIN
  SELECT * INTO v_claim FROM expense_claims WHERE id = p_claim_id;
  SELECT * INTO v_emp   FROM employees       WHERE id = p_accounts_employee_id;
  v_round := COALESCE(v_claim.rejection_round,0) + 1;

  UPDATE expense_claims SET
    status           = 'REJECTED',
    rejection_reason = p_reason,
    rejection_round  = v_round
  WHERE id = p_claim_id;

  INSERT INTO expense_claim_rejections
    (claim_id, rejected_by, rejected_by_name, reason, round)
  VALUES
    (p_claim_id, p_accounts_employee_id, v_emp.full_name_en, p_reason, v_round);

  -- Notify Finance Admin to correct
  IF v_claim.generated_by IS NOT NULL THEN
    INSERT INTO notifications
      (entity_id, employee_id, type, title, message, priority, reference_type, reference_id)
    VALUES
      (v_claim.entity_id, v_claim.generated_by,
       'CLAIM_ACCOUNTS_REJECTED',
       'Accounts rejected claim — ' || v_claim.claim_number,
       v_emp.full_name_en || ' rejected ' || v_claim.claim_number
         || ': ' || p_reason || '. Please review and correct.',
       'HIGH', 'expense_claim', p_claim_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'status','REJECTED', 'round', v_round);
END; $$;

-- ── 12. Grant execute on all new functions ─────────────────────
GRANT EXECUTE ON FUNCTION dh_approve_claim(UUID,UUID)               TO authenticated, anon;
GRANT EXECUTE ON FUNCTION dh_reject_claim(UUID,UUID,TEXT)           TO authenticated, anon;
GRANT EXECUTE ON FUNCTION admin_zero_expense_record(UUID,UUID,TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION submit_claim_correction(UUID,UUID,TEXT,TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION dh_acknowledge_correction(UUID,UUID)      TO authenticated, anon;
GRANT EXECUTE ON FUNCTION dh_object_correction(UUID,UUID,TEXT)      TO authenticated, anon;
GRANT EXECUTE ON FUNCTION auto_escalate_expense_claim(UUID)         TO authenticated, anon;
GRANT EXECUTE ON FUNCTION accounts_approve_claim(UUID,UUID)         TO authenticated, anon;
GRANT EXECUTE ON FUNCTION accounts_reject_claim(UUID,UUID,TEXT)     TO authenticated, anon;
GRANT EXECUTE ON FUNCTION process_expired_claim_escalations()       TO authenticated, anon;
