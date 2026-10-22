-- ═══════════════════════════════════════════════════════════════════════
-- FIELD PAYMENT — ANON GRANTS & RLS POLICIES
-- Allows the shareable /forms/field-payment page (no login) to:
--   • READ money_requests (to pick the linked MR and show balance)
--   • READ employees + contractors (party dropdowns)
--   • INSERT field_payment_sessions + field_payment_lines
-- Also allows authenticated Accounts staff to SELECT + UPDATE sessions
-- (INSERT policies for anon are already in field_payments_schema.sql;
--  this file grants anon READ on the reference tables it also needs.)
-- ═══════════════════════════════════════════════════════════════════════

-- ── GRANTs ──────────────────────────────────────────────────────────────
-- Reference tables the form must read
GRANT SELECT ON TABLE money_requests          TO anon;
GRANT SELECT ON TABLE money_request_lines     TO anon;   -- needed to find ATM-bound lines
GRANT SELECT ON TABLE employees               TO anon;
GRANT SELECT ON TABLE contractors             TO anon;

-- Field-payment tables anon must INSERT into
GRANT INSERT ON TABLE field_payment_sessions          TO anon;
GRANT INSERT ON TABLE field_payment_lines             TO anon;
GRANT INSERT ON TABLE field_payment_mr_allocations    TO anon;

-- Authenticated staff can read + update sessions (for Accounts admin page)
GRANT SELECT, UPDATE ON TABLE field_payment_sessions TO authenticated;
GRANT SELECT          ON TABLE field_payment_lines   TO authenticated;

-- ── RLS POLICIES (safe DO block) ────────────────────────────────────────
DO $$ BEGIN

  -- Allow anon to READ money_requests (non-cancelled, non-draft)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='money_requests' AND policyname='anon read money_requests') THEN
    EXECUTE 'CREATE POLICY "anon read money_requests" ON money_requests FOR SELECT TO anon USING (status NOT IN (''CANCELLED'',''DRAFT'',''REJECTED''))';
  END IF;

  -- Allow anon to READ employees (is_active = true)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='employees' AND policyname='anon read employees') THEN
    EXECUTE 'CREATE POLICY "anon read employees" ON employees FOR SELECT TO anon USING (is_active = true)';
  END IF;

  -- Allow anon to READ contractors (active/open)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contractors' AND policyname='anon read contractors') THEN
    EXECUTE 'CREATE POLICY "anon read contractors" ON contractors FOR SELECT TO anon USING (status IN (''ACTIVE'',''OPEN''))';
  END IF;

  -- Allow anon to READ money_request_lines (to identify ANB-77/ANB-39 lines)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='money_request_lines' AND policyname='anon read money_request_lines') THEN
    EXECUTE 'CREATE POLICY "anon read money_request_lines" ON money_request_lines FOR SELECT TO anon USING (true)';
  END IF;

  -- Allow anon to INSERT field_payment_sessions (already in schema file — safe to repeat)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='field_payment_sessions' AND policyname='anon insert field_payment_sessions') THEN
    EXECUTE 'CREATE POLICY "anon insert field_payment_sessions" ON field_payment_sessions FOR INSERT TO anon WITH CHECK (true)';
  END IF;

  -- Allow anon to INSERT field_payment_lines (already in schema file — safe to repeat)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='field_payment_lines' AND policyname='anon insert field_payment_lines') THEN
    EXECUTE 'CREATE POLICY "anon insert field_payment_lines" ON field_payment_lines FOR INSERT TO anon WITH CHECK (true)';
  END IF;

  -- Allow authenticated users to read all sessions (Accounts admin)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='field_payment_sessions' AND policyname='auth read field_payment_sessions') THEN
    EXECUTE 'CREATE POLICY "auth read field_payment_sessions" ON field_payment_sessions FOR SELECT TO authenticated USING (true)';
  END IF;

  -- Allow authenticated users to update sessions (acknowledge / close / post JE)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='field_payment_sessions' AND policyname='auth update field_payment_sessions') THEN
    EXECUTE 'CREATE POLICY "auth update field_payment_sessions" ON field_payment_sessions FOR UPDATE TO authenticated USING (true)';
  END IF;

  -- Allow authenticated users to read all lines
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='field_payment_lines' AND policyname='auth read field_payment_lines') THEN
    EXECUTE 'CREATE POLICY "auth read field_payment_lines" ON field_payment_lines FOR SELECT TO authenticated USING (true)';
  END IF;

END $$;

NOTIFY pgrst, 'reload schema';
