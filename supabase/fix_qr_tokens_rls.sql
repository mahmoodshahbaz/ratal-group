-- ══════════════════════════════════════════════════════════════════
-- Fix: qr_tokens RLS — allow anon INSERT + UPDATE
-- Error: "new row violates row-level security policy for table qr_tokens"
-- Cause: Only SELECT policy existed for anon; INSERT/UPDATE were missing
-- ══════════════════════════════════════════════════════════════════

-- INSERT (generating new tokens)
DROP POLICY IF EXISTS "anon insert qr_tokens" ON qr_tokens;
CREATE POLICY "anon insert qr_tokens"
  ON qr_tokens FOR INSERT TO anon
  WITH CHECK (true);

-- UPDATE (revoking, re-activating, updating last_used_at)
DROP POLICY IF EXISTS "anon update qr_tokens" ON qr_tokens;
CREATE POLICY "anon update qr_tokens"
  ON qr_tokens FOR UPDATE TO anon
  USING (true);

-- Also cover authenticated role (if app ever uses a logged-in session)
DROP POLICY IF EXISTS "auth all qr_tokens" ON qr_tokens;
CREATE POLICY "auth all qr_tokens"
  ON qr_tokens FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Verify
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'qr_tokens'
ORDER BY cmd;
