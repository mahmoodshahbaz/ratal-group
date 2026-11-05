-- ─────────────────────────────────────────────────────────────────────────────
-- QR Token OTP Activation Patch
-- Run once in Supabase SQL Editor (or via supabase db push)
--
-- Adds four columns to qr_tokens:
--   otp_code        — bcrypt hash of the 6-digit OTP (never store plain-text OTP)
--   otp_expires_at  — 15-minute window; NULL after activation
--   otp_sent_at     — timestamp when OTP email was sent
--   activated_at    — NULL = not yet activated; set on successful OTP entry
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE qr_tokens
  ADD COLUMN IF NOT EXISTS otp_code       text,
  ADD COLUMN IF NOT EXISTS otp_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS otp_sent_at    timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at   timestamptz;

-- Index for fast lookup during activation
CREATE INDEX IF NOT EXISTS idx_qr_tokens_activated_at ON qr_tokens (activated_at)
  WHERE activated_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Update validate_field_qr_token RPC to return activated_at
-- Must DROP first because return type (jsonb) may differ from existing function
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.validate_field_qr_token(text);

CREATE OR REPLACE FUNCTION public.validate_field_qr_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qt        qr_tokens%ROWTYPE;
  v_emp       employees%ROWTYPE;
  v_result    jsonb;
BEGIN
  -- Look up the token
  SELECT * INTO v_qt
  FROM qr_tokens
  WHERE token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'token_not_found');
  END IF;

  IF NOT v_qt.is_active THEN
    RETURN jsonb_build_object('error', 'token_inactive');
  END IF;

  IF v_qt.expires_at IS NOT NULL AND v_qt.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'token_expired');
  END IF;

  IF v_qt.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'token_inactive');
  END IF;

  -- Look up the employee
  SELECT * INTO v_emp
  FROM employees
  WHERE id = v_qt.employee_id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'employee_not_found');
  END IF;

  IF v_emp.status IS NOT NULL AND v_emp.status != 'ACTIVE' THEN
    RETURN jsonb_build_object('error', 'employee_inactive');
  END IF;

  -- Build the result — includes activated_at so the mobile OTP gate can check it
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
      'id',              v_emp.id,
      'full_name_en',    v_emp.full_name_en,
      'full_name',       v_emp.full_name_ar,
      'employee_number', v_emp.employee_number,
      'department_id',   v_emp.department_id,
      'designation',     v_emp.designation,
      'nationality',     v_emp.nationality,
      'iqama_number',    v_emp.iqama_number,
      'hire_date',       v_emp.hire_date,
      'basic_salary',    v_emp.basic_salary,
      'phone',           v_emp.phone,
      'entity_id',       v_emp.entity_id,
      'status',          v_emp.status
    )
  );
END;
$$;

-- Grant execute to anon + authenticated (PostgREST needs this)
GRANT EXECUTE ON FUNCTION public.validate_field_qr_token(text) TO anon, authenticated;

COMMENT ON COLUMN qr_tokens.otp_code IS 'SHA-256 hash of 6-digit OTP; NULL after activation';
COMMENT ON COLUMN qr_tokens.otp_expires_at IS '15-minute OTP expiry window';
COMMENT ON COLUMN qr_tokens.otp_sent_at IS 'When the OTP email was dispatched';
COMMENT ON COLUMN qr_tokens.activated_at IS 'NULL = not activated. Set on first successful OTP entry.';
