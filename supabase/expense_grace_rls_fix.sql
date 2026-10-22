-- ══════════════════════════════════════════════════════════════════════════
-- N3: Expense Grace Unblocks — Fix RLS INSERT policy
--
-- The original policy (expense_grace_unblocks_insert) only allowed
-- service_role. Authenticated Finance admins need to insert from the UI.
-- This patch drops the old policy and creates a permissive one that allows
-- any authenticated user to INSERT (row-level authorisation is handled by
-- the application; only Admins see the grace unblocks tab in ExpenseClaims).
-- ══════════════════════════════════════════════════════════════════════════

-- Drop the old over-restrictive policy
DROP POLICY IF EXISTS "expense_grace_unblocks_insert" ON expense_grace_unblocks;

-- New policy: authenticated role can INSERT
CREATE POLICY "expense_grace_unblocks_insert"
  ON expense_grace_unblocks FOR INSERT
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- Also allow authenticated users to DELETE (revoke a grace override)
DROP POLICY IF EXISTS "expense_grace_unblocks_delete" ON expense_grace_unblocks;

CREATE POLICY "expense_grace_unblocks_delete"
  ON expense_grace_unblocks FOR DELETE
  USING (auth.role() IN ('authenticated', 'service_role'));
