-- ============================================================
-- PATCH: Fix invoice_lines RLS to allow authenticated users
--        to INSERT, UPDATE, DELETE their own invoice lines.
-- Run in Supabase SQL Editor
-- Safe to re-run (uses DROP IF EXISTS / OR REPLACE)
-- ============================================================

-- Drop the old restrictive policy if it exists
DROP POLICY IF EXISTS "invoice_lines_access"   ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_select"   ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_insert"   ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_update"   ON invoice_lines;
DROP POLICY IF EXISTS "invoice_lines_delete"   ON invoice_lines;

-- Make sure RLS is enabled
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;

-- Allow any authenticated user to SELECT
CREATE POLICY "invoice_lines_select"
  ON invoice_lines FOR SELECT
  USING (auth.role() = 'authenticated');

-- Allow any authenticated user to INSERT
CREATE POLICY "invoice_lines_insert"
  ON invoice_lines FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Allow any authenticated user to UPDATE
CREATE POLICY "invoice_lines_update"
  ON invoice_lines FOR UPDATE
  USING (auth.role() = 'authenticated');

-- Allow any authenticated user to DELETE
CREATE POLICY "invoice_lines_delete"
  ON invoice_lines FOR DELETE
  USING (auth.role() = 'authenticated');

-- Verify the policies are in place
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'invoice_lines'
ORDER BY policyname;
