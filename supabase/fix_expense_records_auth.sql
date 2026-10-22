-- ══════════════════════════════════════════════════════════════════
-- Fix: Allow authenticated (admin) users to read expense_records
-- The previous RLS policy only covered anon (field form users).
-- Admin dashboard is logged in = authenticated role = needs its own policy.
-- ══════════════════════════════════════════════════════════════════

-- Grant table access to authenticated role
GRANT SELECT, UPDATE ON TABLE expense_records TO authenticated;

-- RLS policy: authenticated users can SELECT all expense_records
DROP POLICY IF EXISTS "auth_select_expense_records" ON expense_records;
CREATE POLICY "auth_select_expense_records"
  ON expense_records FOR SELECT TO authenticated
  USING (true);

-- RLS policy: authenticated users can UPDATE status (for approval workflow)
DROP POLICY IF EXISTS "auth_update_expense_records" ON expense_records;
CREATE POLICY "auth_update_expense_records"
  ON expense_records FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Verify: should return your test rows
SELECT id, employee_id, expense_date, category, amount, status
FROM expense_records
ORDER BY created_at DESC
LIMIT 10;
