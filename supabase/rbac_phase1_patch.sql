-- ══════════════════════════════════════════════════════════════════════════════
-- ACCSYS RBAC Phase 1 — Schema Patch
-- Run this ONCE in Supabase SQL editor
-- ══════════════════════════════════════════════════════════════════════════════
--
-- What this patch does:
--  1. Adds employee_category (ACCSYS-LOCAL | ACCSYS-EXPAT | OUTSOURCED | CONTRACT)
--     and system_role to employees table
--  2. Extends qr_tokens with: expires_at, revoked_at, revoked_by,
--     bound_mobile, binding_verified_at, site_master_id, pin_hash
--  3. Creates qr_token_forms — per-token form permission delta overrides
--  4. Refreshes qr_tokens_view to expose new columns
--
-- SAFE TO RUN MULTIPLE TIMES — all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
-- ══════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- PART 1 — employees table additions
-- ────────────────────────────────────────────────────────────────────────────

-- Employee category (how they are employed)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_category  VARCHAR(20)  DEFAULT 'ACCSYS-LOCAL';
-- Valid values: ACCSYS-LOCAL, ACCSYS-EXPAT, OUTSOURCED, CONTRACT
-- CONTRACT employees → created as Sub-Contractors, no system access

-- System role (the permanent role this person holds; inherited by new QR tokens)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS system_role  VARCHAR(30);
-- Valid values match ROLES in useFieldAuth.js:
--   STAFF_TECH | STAFF_SUPERVISOR | STAFF_PM | STAFF_DH
--   OUTSOURCED | DRIVER | FINANCE
-- Sub-Contractors assigned in contractors table — they use SUBCONTRACTOR role on qr_tokens

-- Add a check constraint so only known values are stored
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_employee_category_check'
  ) THEN
    ALTER TABLE employees ADD CONSTRAINT employees_employee_category_check
      CHECK (employee_category IN ('ACCSYS-LOCAL','ACCSYS-EXPAT','OUTSOURCED','CONTRACT'));
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- PART 2 — qr_tokens table additions
-- ────────────────────────────────────────────────────────────────────────────

-- Token expiry — if set, token is invalid after this time
ALTER TABLE qr_tokens
  ADD COLUMN IF NOT EXISTS expires_at             TIMESTAMPTZ;

-- Revocation — if set, token is denied regardless of is_active
ALTER TABLE qr_tokens
  ADD COLUMN IF NOT EXISTS revoked_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by             UUID  REFERENCES employees(id);

-- Mobile binding — for PIN-on-first-use security
-- bound_mobile stores the IMEI or mobile number confirmed on first scan
ALTER TABLE qr_tokens
  ADD COLUMN IF NOT EXISTS bound_mobile           VARCHAR(30),
  ADD COLUMN IF NOT EXISTS binding_verified_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pin_hash               TEXT;    -- bcrypt hash of PIN (optional)

-- Site scope — if set, token is only valid when the form selects this site
ALTER TABLE qr_tokens
  ADD COLUMN IF NOT EXISTS site_master_id         UUID  REFERENCES site_masters(id);

-- ────────────────────────────────────────────────────────────────────────────
-- PART 3 — qr_token_forms (per-token form permission delta overrides)
-- ────────────────────────────────────────────────────────────────────────────
-- Purpose: grant or deny specific forms for a token, overriding the role default
-- is_granted = true  → force-add this form even if the role does not have it
-- is_granted = false → force-remove this form even if the role includes it

CREATE TABLE IF NOT EXISTS qr_token_forms (
  id          UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  token_id    UUID    NOT NULL REFERENCES qr_tokens(id) ON DELETE CASCADE,
  form_key    VARCHAR(50) NOT NULL,
  is_granted  BOOLEAN NOT NULL DEFAULT true,
  granted_by  UUID    REFERENCES employees(id),
  granted_at  TIMESTAMPTZ DEFAULT now(),
  notes       TEXT,
  UNIQUE(token_id, form_key)
);

CREATE INDEX IF NOT EXISTS idx_qtf_token ON qr_token_forms(token_id);

ALTER TABLE qr_token_forms ENABLE ROW LEVEL SECURITY;

-- Allow anon to read (needed by useFieldAuth to load overrides with anon key)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'qr_token_forms' AND policyname = 'anon_sel_qr_token_forms'
  ) THEN
    CREATE POLICY "anon_sel_qr_token_forms"
      ON qr_token_forms FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- Authenticated users (Admin) can manage overrides
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'qr_token_forms' AND policyname = 'auth_all_qr_token_forms'
  ) THEN
    CREATE POLICY "auth_all_qr_token_forms"
      ON qr_token_forms FOR ALL TO authenticated USING (true);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- PART 4 — Refresh qr_tokens_view
-- ────────────────────────────────────────────────────────────────────────────
-- Adds new columns: expires_at, revoked_at, bound_mobile, site_master_id,
-- plus employee_name, department_name, entity_name for admin display

DROP VIEW IF EXISTS qr_tokens_view;

CREATE VIEW qr_tokens_view AS
SELECT
  qt.id,
  qt.token,
  qt.role,
  qt.employment_type,
  qt.is_active,
  qt.last_used_at,
  qt.generated_at,
  qt.notes,
  qt.expires_at,
  qt.revoked_at,
  qt.bound_mobile,
  qt.binding_verified_at,
  qt.site_master_id,
  -- is token currently valid?
  (
    qt.is_active = true
    AND qt.revoked_at IS NULL
    AND (qt.expires_at IS NULL OR qt.expires_at > now())
  ) AS is_valid,
  -- Employee info
  qt.employee_id,
  emp.full_name_en    AS employee_name,
  emp.designation     AS employee_designation,
  emp.system_role     AS employee_system_role,
  emp.employee_category,
  -- Department
  dept.dept_name      AS department_name,
  dept.dept_code      AS department_code,
  -- Entity
  qt.entity_id,
  ent.entity_name,
  ent.entity_code,
  -- Site scope
  sm.site_no          AS site_number_scope,
  sm.site_name        AS site_name_scope,
  -- Generated by
  qt.generated_by,
  gen.full_name_en    AS generated_by_name
FROM qr_tokens qt
LEFT JOIN employees  emp   ON emp.id   = qt.employee_id
LEFT JOIN departments dept ON dept.id  = emp.department_id
LEFT JOIN entities   ent   ON ent.id   = qt.entity_id
LEFT JOIN site_masters sm  ON sm.id    = qt.site_master_id
LEFT JOIN employees  gen   ON gen.id   = qt.generated_by;

-- Grant anon SELECT on the view so field forms can validate tokens
GRANT SELECT ON qr_tokens_view TO anon;
GRANT SELECT ON qr_tokens_view TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- PART 5 — Helper RPC: upsert_token_form_override
-- ────────────────────────────────────────────────────────────────────────────
-- Called by QRManager to grant or deny a form for a specific token.
-- Pass is_granted = true to grant, false to deny, null to delete the override.

CREATE OR REPLACE FUNCTION upsert_token_form_override(
  p_token_id  UUID,
  p_form_key  TEXT,
  p_granted   BOOLEAN,   -- NULL = delete the override (revert to role default)
  p_admin_id  UUID  DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_granted IS NULL THEN
    -- Delete = revert to role default
    DELETE FROM qr_token_forms
    WHERE token_id = p_token_id AND form_key = p_form_key;
    RETURN json_build_object('action', 'deleted', 'form_key', p_form_key);
  ELSE
    INSERT INTO qr_token_forms (token_id, form_key, is_granted, granted_by)
    VALUES (p_token_id, p_form_key, p_granted, p_admin_id)
    ON CONFLICT (token_id, form_key)
    DO UPDATE SET
      is_granted = EXCLUDED.is_granted,
      granted_by = EXCLUDED.granted_by,
      granted_at = now();
    RETURN json_build_object('action', 'upserted', 'form_key', p_form_key, 'is_granted', p_granted);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_token_form_override(UUID, TEXT, BOOLEAN, UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- PART 6 — Helper RPC: revoke_qr_token (sets revoked_at + is_active = false)
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION revoke_qr_token(
  p_token_id  UUID,
  p_admin_id  UUID DEFAULT NULL
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE qr_tokens
  SET revoked_at = now(),
      revoked_by = p_admin_id,
      is_active  = false
  WHERE id = p_token_id;
  RETURN json_build_object('revoked', true);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION revoke_qr_token(UUID, UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- VERIFICATION
-- ────────────────────────────────────────────────────────────────────────────

-- Run this to confirm everything was created:
SELECT
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='qr_tokens' AND column_name='expires_at')    AS qr_expires_at_ok,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='qr_tokens' AND column_name='revoked_at')   AS qr_revoked_at_ok,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='qr_tokens' AND column_name='bound_mobile') AS qr_bound_mobile_ok,
  (SELECT COUNT(*) FROM information_schema.tables  WHERE table_name='qr_token_forms')                           AS qr_token_forms_ok,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='employees' AND column_name='employee_category') AS emp_category_ok,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='employees' AND column_name='system_role')       AS emp_role_ok;
-- All values should be 1
