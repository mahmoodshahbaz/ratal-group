-- ============================================================
-- ACCSYS Form Audit Fix 01
-- Adds dept_code to expense_records (W-06 from audit report)
-- Run once in Supabase SQL Editor
-- ============================================================

-- ── Step 1: Add dept_code column ─────────────────────────────
ALTER TABLE expense_records
  ADD COLUMN IF NOT EXISTS dept_code TEXT;

-- ── Step 2: Back-fill from employee → departments ────────────
UPDATE expense_records er
SET dept_code = d.dept_code
FROM employees emp
JOIN departments d ON d.id = emp.department_id
WHERE er.employee_id = emp.id
  AND er.dept_code IS NULL;

-- ── Step 3: Update validate_field_qr_token RPC to return dept_code ──
-- This allows mobile forms to read emp.dept_code from useFieldAuth
-- Only replaces the employee jsonb_build_object part — all other logic unchanged.

-- NOTE: The full RPC function body is recreated here.
-- Original is in supabase/migrations/qr_otp_activation.sql
-- This patch adds dept_code and food_allowance_eligible to the employee payload.

CREATE OR REPLACE FUNCTION public.validate_field_qr_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_qt  qr_tokens%ROWTYPE;
  v_emp employees%ROWTYPE;
  v_dept_code TEXT;
BEGIN
  SELECT * INTO v_qt FROM qr_tokens WHERE token = p_token LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;

  IF v_qt.is_active = false THEN
    RETURN jsonb_build_object('error', 'token_inactive');
  END IF;

  IF v_qt.expires_at IS NOT NULL AND v_qt.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'token_expired');
  END IF;

  SELECT * INTO v_emp FROM employees WHERE id = v_qt.employee_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_token');
  END IF;

  IF v_emp.status IS NOT NULL AND v_emp.status != 'ACTIVE' THEN
    RETURN jsonb_build_object('error', 'employee_inactive');
  END IF;

  -- Resolve dept_code from departments
  SELECT dept_code INTO v_dept_code
  FROM departments WHERE id = v_emp.department_id LIMIT 1;

  RETURN jsonb_build_object(
    'token_id',       v_qt.id,
    'role',           v_qt.role,
    'employment_type',v_qt.employment_type,
    'entity_id',      v_qt.entity_id,
    'site_master_id', v_qt.site_master_id,
    'bound_mobile',   v_qt.bound_mobile,
    'expires_at',     v_qt.expires_at,
    'activated_at',   v_qt.activated_at,
    'employee', jsonb_build_object(
      'id',                     v_emp.id,
      'full_name_en',           v_emp.full_name_en,
      'full_name',              v_emp.full_name_ar,
      'employee_number',        v_emp.employee_number,
      'department_id',          v_emp.department_id,
      'dept_code',              v_dept_code,
      'designation',            v_emp.designation,
      'nationality',            v_emp.nationality,
      'iqama_number',           v_emp.iqama_number,
      'hire_date',              v_emp.hire_date,
      'basic_salary',           v_emp.basic_salary,
      'phone',                  v_emp.phone,
      'entity_id',              v_emp.entity_id,
      'status',                 v_emp.status,
      'food_allowance_eligible',v_emp.food_allowance_eligible,
      'fa_eligible',            v_emp.fa_eligible,
      'overtime_eligible',      v_emp.overtime_eligible
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_field_qr_token(text) TO anon, authenticated;

-- ── Step 4: Rebuild submit_expense_record to include dept_code ──
DROP FUNCTION IF EXISTS submit_expense_record CASCADE;

CREATE OR REPLACE FUNCTION submit_expense_record(payload JSONB)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO expense_records (
    entity_id,
    employee_id,
    expense_date,
    invoice_date,
    invoice_number,
    project_id,
    site_number,
    category,
    coa_account_code,
    amount,
    vat_paid,
    vat_amount,
    vendor_name,
    vat_number,
    receipt_url,
    remarks,
    late_reason,
    dept_code,
    status
  ) VALUES (
    (payload->>'entity_id')::UUID,
    (payload->>'employee_id')::UUID,
    (payload->>'expense_date')::DATE,
    NULLIF(payload->>'invoice_date', '')::DATE,
    NULLIF(payload->>'invoice_number', ''),
    NULLIF(payload->>'project_id', '')::UUID,
    payload->>'site_number',
    payload->>'category',
    payload->>'coa_account_code',
    (payload->>'amount')::NUMERIC,
    COALESCE((payload->>'vat_paid')::BOOLEAN, false),
    COALESCE((payload->>'vat_amount')::NUMERIC, 0),
    payload->>'vendor_name',
    payload->>'vat_number',
    payload->>'receipt_url',
    payload->>'remarks',
    NULLIF(payload->>'late_reason', ''),
    NULLIF(payload->>'dept_code', ''),
    'RECORDED'
  )
  RETURNING id INTO v_id;

  RETURN json_build_object('id', v_id, 'status', 'RECORDED');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION submit_expense_record(JSONB) TO anon;
GRANT EXECUTE ON FUNCTION submit_expense_record(JSONB) TO authenticated;
