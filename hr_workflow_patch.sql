-- ============================================================
-- ACCSYS HR Workflow Patch
-- Covers:
--   1. Departmental Transfer — acknowledgment + payroll routing
--   2. Termination → immediate Accounts notification
--   3. Outsource tenure enforcement (< 1 month vs ≥ 1 month)
--   4. Daily Labour as expense line item type
-- Run in Supabase SQL editor
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. PATCH employees TABLE
--    Add effective_department_id for payroll cost-centre routing
--    (stays NULL = home dept is used; set during active transfer)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS effective_department_id  UUID REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS home_department_id        UUID REFERENCES departments(id) ON DELETE SET NULL;

-- Back-fill home_department_id from existing department_id
UPDATE employees
  SET home_department_id = department_id
  WHERE home_department_id IS NULL AND department_id IS NOT NULL;

COMMENT ON COLUMN employees.home_department_id       IS 'Original (home) department — permanent record';
COMMENT ON COLUMN employees.effective_department_id  IS 'Current billing dept during a transfer; NULL = use home_department_id for payroll cost-centre';

-- ─────────────────────────────────────────────────────────────
-- 2. PATCH staff_action_requests TABLE
--    Add fields for transfer acknowledgment lifecycle
-- ─────────────────────────────────────────────────────────────
ALTER TABLE staff_action_requests
  ADD COLUMN IF NOT EXISTS transfer_status         TEXT DEFAULT 'PENDING'
      CHECK (transfer_status IN ('PENDING','RECEIVING_ACKNOWLEDGED','ACTIVE','RELEASED_BY_RECEIVING','RETURNED_TO_ORIGIN','COMPLETED')),
  ADD COLUMN IF NOT EXISTS transfer_effective_date DATE,
  ADD COLUMN IF NOT EXISTS transfer_received_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transfer_received_by    TEXT,
  ADD COLUMN IF NOT EXISTS transfer_released_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS transfer_released_by    TEXT,
  ADD COLUMN IF NOT EXISTS transfer_return_reason  TEXT,
  ADD COLUMN IF NOT EXISTS payroll_dept_id         UUID REFERENCES departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accounts_notified_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accounts_notified       BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN staff_action_requests.transfer_status IS
  'PENDING = submitted by origin DH
   RECEIVING_ACKNOWLEDGED = receiving DH confirmed acceptance
   ACTIVE = employee officially on loan to receiving dept
   RELEASED_BY_RECEIVING = receiving DH ended the loan
   RETURNED_TO_ORIGIN = origin DH confirmed return
   COMPLETED = fully resolved';

COMMENT ON COLUMN staff_action_requests.payroll_dept_id IS
  'Which department to charge payroll to during the transfer period. Defaults to transfer_to_dept_id on acknowledgment.';

-- ─────────────────────────────────────────────────────────────
-- 3. TRANSFER ACKNOWLEDGMENT RPC
--    Called by receiving DH to accept a transfer
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION acknowledge_transfer(
  p_sar_id              UUID,
  p_received_by_email   TEXT,
  p_effective_date      DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sar  staff_action_requests%ROWTYPE;
  v_emp  employees%ROWTYPE;
BEGIN
  SELECT * INTO v_sar FROM staff_action_requests WHERE id = p_sar_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SAR not found');
  END IF;
  IF v_sar.action_type <> 'TRANSFER' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a TRANSFER SAR');
  END IF;
  IF v_sar.transfer_status NOT IN ('PENDING') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SAR is not in PENDING state');
  END IF;

  -- Update SAR
  UPDATE staff_action_requests SET
    transfer_status       = 'RECEIVING_ACKNOWLEDGED',
    transfer_effective_date = p_effective_date,
    transfer_received_at  = NOW(),
    transfer_received_by  = p_received_by_email,
    payroll_dept_id       = v_sar.transfer_to_dept_id,  -- receiving dept pays
    status                = 'ACKNOWLEDGED'
  WHERE id = p_sar_id;

  -- Move employee to new department (for reporting/org chart)
  SELECT * INTO v_emp FROM employees WHERE id = v_sar.employee_id;
  IF FOUND THEN
    UPDATE employees SET
      department_id            = v_sar.transfer_to_dept_id,
      effective_department_id  = v_sar.transfer_to_dept_id
    WHERE id = v_sar.employee_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'transfer_status', 'RECEIVING_ACKNOWLEDGED');
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 4. TRANSFER RELEASE RPC
--    Called by receiving DH to send employee back
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION release_transfer(
  p_sar_id            UUID,
  p_released_by_email TEXT,
  p_reason            TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sar  staff_action_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_sar FROM staff_action_requests WHERE id = p_sar_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SAR not found');
  END IF;
  IF v_sar.transfer_status NOT IN ('RECEIVING_ACKNOWLEDGED','ACTIVE') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Transfer not active');
  END IF;

  -- Mark as released — employee NOT yet returned (origin DH must confirm)
  UPDATE staff_action_requests SET
    transfer_status     = 'RELEASED_BY_RECEIVING',
    transfer_released_at = NOW(),
    transfer_released_by = p_released_by_email,
    transfer_return_reason = p_reason,
    status              = 'PENDING'   -- reopens for origin DH attention
  WHERE id = p_sar_id;

  -- Move employee back to home department
  UPDATE employees SET
    department_id           = v_sar.department_id_from,  -- see NOTE below
    effective_department_id = NULL
  WHERE id = v_sar.employee_id;

  -- NOTE: v_sar.department_id_from must be stored at transfer creation time
  -- See patch below that adds department_id_from column

  RETURN jsonb_build_object('ok', true, 'transfer_status', 'RELEASED_BY_RECEIVING');
END;
$$;

-- Store origin dept at time of TRANSFER submission
ALTER TABLE staff_action_requests
  ADD COLUMN IF NOT EXISTS department_id_from UUID REFERENCES departments(id) ON DELETE SET NULL;

-- Back-fill from join (best effort)
UPDATE staff_action_requests sar
  SET department_id_from = e.home_department_id
  FROM employees e
  WHERE sar.employee_id = e.id
    AND sar.action_type = 'TRANSFER'
    AND sar.department_id_from IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 5. TERMINATION → ACCOUNTS NOTIFICATION
--    Trigger: when SAR action_type = RELEASE and status → ACKNOWLEDGED or PROCESSED
--    Inserts a record into notifications table for Accounts team
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_accounts_on_termination()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_emp  RECORD;
BEGIN
  -- Fire only on RELEASE SARs being ACKNOWLEDGED or PROCESSED
  IF NEW.action_type = 'RELEASE'
     AND NEW.status IN ('ACKNOWLEDGED', 'PROCESSED')
     AND (OLD.status IS NULL OR OLD.status NOT IN ('ACKNOWLEDGED', 'PROCESSED'))
     AND NEW.accounts_notified = FALSE THEN

    -- Get employee name
    SELECT full_name, full_name_en, employee_number INTO v_emp
      FROM employees WHERE id = NEW.employee_id;

    -- Insert notification for Accounts
    INSERT INTO notifications (
      entity_id, type, title, body, target_role, reference_id, reference_type
    ) VALUES (
      NEW.entity_id,
      'TERMINATION_ALERT',
      '⚠️ Employee Termination — Action Required',
      FORMAT(
        'Employee %s (%s) has been released from %s effective %s. Please process final settlement (EOSB, final salary, leave encashment) and close payroll.',
        COALESCE(v_emp.full_name, v_emp.full_name_en, 'Unknown'),
        COALESCE(v_emp.employee_number, ''),
        COALESCE(NEW.department_name, ''),
        COALESCE(NEW.last_working_day::TEXT, 'TBD')
      ),
      'ACCOUNTS',   -- target_role: Accounts will see this in FieldNotifications
      NEW.id,
      'staff_action_requests'
    );

    -- Mark as notified
    UPDATE staff_action_requests
      SET accounts_notified = TRUE, accounts_notified_at = NOW()
      WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_accounts_termination ON staff_action_requests;
CREATE TRIGGER trg_notify_accounts_termination
  AFTER UPDATE ON staff_action_requests
  FOR EACH ROW EXECUTE FUNCTION notify_accounts_on_termination();

-- Also fire on INSERT (Accounts notified as soon as RELEASE SAR is submitted)
CREATE OR REPLACE FUNCTION notify_accounts_on_release_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_emp RECORD;
BEGIN
  IF NEW.action_type = 'RELEASE' THEN
    SELECT full_name, full_name_en, employee_number INTO v_emp
      FROM employees WHERE id = NEW.employee_id;

    INSERT INTO notifications (
      entity_id, type, title, body, target_role, reference_id, reference_type
    ) VALUES (
      NEW.entity_id,
      'TERMINATION_ALERT',
      '🔔 Release Request — Employee ' || COALESCE(v_emp.full_name, v_emp.full_name_en, ''),
      FORMAT(
        'A release SAR has been submitted for %s (%s) by %s. Last working day: %s. Please prepare for final settlement.',
        COALESCE(v_emp.full_name, v_emp.full_name_en, ''),
        COALESCE(v_emp.employee_number, ''),
        COALESCE(NEW.submitted_by_name, NEW.submitted_by_email, ''),
        COALESCE(NEW.last_working_day::TEXT, 'Not set')
      ),
      'ACCOUNTS',
      NEW.id,
      'staff_action_requests'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_accounts_release_insert ON staff_action_requests;
CREATE TRIGGER trg_notify_accounts_release_insert
  AFTER INSERT ON staff_action_requests
  FOR EACH ROW EXECUTE FUNCTION notify_accounts_on_release_insert();

-- ─────────────────────────────────────────────────────────────
-- 6. OUTSOURCE ENGAGEMENTS — tenure enforcement column
--    OutsourceEmployees.jsx records engagements with start/end date
--    If end_date - start_date >= 30 days, flag for conversion to full Employee
-- ─────────────────────────────────────────────────────────────
ALTER TABLE outsource_engagements
  ADD COLUMN IF NOT EXISTS tenure_days           INTEGER GENERATED ALWAYS AS
      (CASE WHEN end_date IS NOT NULL THEN (end_date - start_date) ELSE NULL END) STORED,
  ADD COLUMN IF NOT EXISTS conversion_flagged    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS conversion_flagged_at TIMESTAMPTZ;

-- Function to flag engagements >= 30 days for full employee conversion
CREATE OR REPLACE FUNCTION flag_long_outsource_engagements()
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE outsource_engagements
    SET conversion_flagged    = TRUE,
        conversion_flagged_at = NOW()
  WHERE tenure_days >= 30
    AND conversion_flagged = FALSE
    AND status = 'ACTIVE';
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- 7. DAILY LABOUR — add type to expense_types if table exists
--    (If your expense_categories is a lookup, add here)
-- ─────────────────────────────────────────────────────────────
-- Add DAILY_LABOUR as a recognized expense category in expense_records
-- The FormDailyExpense.jsx will use this category with a free-text worker name
ALTER TABLE expense_records
  ADD COLUMN IF NOT EXISTS daily_labour_name TEXT,   -- free-text worker name (not in Employee DB)
  ADD COLUMN IF NOT EXISTS daily_labour_days NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS daily_labour_rate NUMERIC(12,2);

COMMENT ON COLUMN expense_records.daily_labour_name IS 'Name of daily wage worker (free text, not in employees table)';
COMMENT ON COLUMN expense_records.daily_labour_days IS 'Number of days worked (e.g. 0.5 for half-day)';
COMMENT ON COLUMN expense_records.daily_labour_rate IS 'Rate per day in SAR';

-- ─────────────────────────────────────────────────────────────
-- 8. TRANSFER HISTORY VIEW
--    Audit trail of where an employee has been and for how long
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_employee_transfer_history AS
SELECT
  sar.entity_id,
  sar.employee_id,
  e.full_name                                           AS employee_name,
  e.employee_number,
  d_from.dept_name                                       AS from_department,
  d_to.dept_name                                         AS to_department,
  sar.transfer_effective_date                           AS transfer_date,
  sar.transfer_released_at::DATE                        AS return_date,
  COALESCE(
    (sar.transfer_released_at::DATE - sar.transfer_effective_date),
    (CURRENT_DATE - sar.transfer_effective_date)
  )                                                     AS days_on_loan,
  sar.transfer_status,
  sar.submitted_by_name                                 AS initiated_by,
  sar.transfer_received_by                              AS acknowledged_by,
  sar.transfer_released_by                              AS released_by,
  sar.transfer_return_reason                            AS return_reason,
  sar.payroll_dept_id IS NOT NULL                       AS payroll_charged_to_receiving,
  d_pay.dept_name                                        AS payroll_charged_to_dept,
  sar.created_at
FROM staff_action_requests sar
LEFT JOIN employees    e      ON e.id      = sar.employee_id
LEFT JOIN departments  d_from ON d_from.id = sar.department_id_from
LEFT JOIN departments  d_to   ON d_to.id   = sar.transfer_to_dept_id
LEFT JOIN departments  d_pay  ON d_pay.id  = sar.payroll_dept_id
WHERE sar.action_type = 'TRANSFER'
ORDER BY sar.created_at DESC;

-- ─────────────────────────────────────────────────────────────
-- SUMMARY OF WHAT THIS PATCH DOES:
-- ─────────────────────────────────────────────────────────────
-- employees:
--   + home_department_id      (permanent home dept)
--   + effective_department_id (current dept during loan; NULL = home)
--
-- staff_action_requests:
--   + transfer_status         (PENDING → RECEIVING_ACKNOWLEDGED → ACTIVE → RELEASED → RETURNED)
--   + transfer_effective_date, transfer_received_at/by, transfer_released_at/by
--   + department_id_from      (origin dept, captured at SAR creation)
--   + payroll_dept_id         (receiving dept pays during loan)
--   + accounts_notified, accounts_notified_at
--
-- RPCs:
--   acknowledge_transfer(sar_id, received_by_email, effective_date)
--   release_transfer(sar_id, released_by_email, reason)
--   flag_long_outsource_engagements()
--
-- Triggers:
--   AFTER INSERT on RELEASE SAR → notify Accounts immediately
--   AFTER UPDATE to ACKNOWLEDGED/PROCESSED on RELEASE SAR → notify Accounts
--
-- Views:
--   v_employee_transfer_history — full audit trail per employee
--
-- expense_records:
--   + daily_labour_name / daily_labour_days / daily_labour_rate
--     for recording daily wage workers without an Employee record
