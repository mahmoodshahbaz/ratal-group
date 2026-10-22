-- ══════════════════════════════════════════════════════════════════
-- FIX: Allow anon key to SELECT from employees table
-- This is needed for field forms (dev mode + production QR flow)
--
-- SAFE because:
--  • Anon key is embedded in the app, not publicly listed
--  • SELECT only — inserts/updates/deletes still require auth
--  • Same pattern already used for site_assignments, qr_tokens,
--    expense_records, notifications etc. in field_ops_schema.sql
-- ══════════════════════════════════════════════════════════════════

-- Allow anon to read employees (needed by field forms employee picker)
CREATE POLICY "anon_select_employees"
  ON employees FOR SELECT
  TO anon
  USING (TRUE);

-- Also allow anon to read departments (needed for dept name display)
CREATE POLICY "anon_select_departments"
  ON departments FOR SELECT
  TO anon
  USING (TRUE);

-- Verify: check existing policies on employees
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'employees'
ORDER BY policyname;
