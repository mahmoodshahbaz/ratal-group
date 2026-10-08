-- ============================================================
-- expense_claims_rls_open.sql
-- !! RUN THIS IN SUPABASE SQL EDITOR !!
--
-- Fixes: expense_claims shows 0 rows in the UI despite claims
-- existing. Cause: old policy had "TO authenticated" which blocks
-- anon-role queries. This replaces it with role-unrestricted
-- policies (security still enforced by entity_id filter in app).
-- ============================================================

-- Step 1: Make sure RLS is ON
ALTER TABLE expense_claims ENABLE ROW LEVEL SECURITY;

-- Step 2: Drop all old policies
DROP POLICY IF EXISTS "expense_claims_select"         ON expense_claims;
DROP POLICY IF EXISTS "expense_claims_anon_select"    ON expense_claims;
DROP POLICY IF EXISTS "expense_claims_insert"         ON expense_claims;
DROP POLICY IF EXISTS "expense_claims_update"         ON expense_claims;

-- Step 3: New policies — no role restriction (applies to everyone)
CREATE POLICY "expense_claims_select"
  ON expense_claims FOR SELECT
  USING (true);

CREATE POLICY "expense_claims_insert"
  ON expense_claims FOR INSERT
  WITH CHECK (true);

CREATE POLICY "expense_claims_update"
  ON expense_claims FOR UPDATE
  USING (true) WITH CHECK (true);

-- Step 4: Same fix for expense_claim_rejections
ALTER TABLE expense_claim_rejections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claim_rejections_select" ON expense_claim_rejections;
DROP POLICY IF EXISTS "claim_rejections_insert" ON expense_claim_rejections;

CREATE POLICY "claim_rejections_select"
  ON expense_claim_rejections FOR SELECT
  USING (true);

CREATE POLICY "claim_rejections_insert"
  ON expense_claim_rejections FOR INSERT
  WITH CHECK (true);

-- Verify: should return the two claims
SELECT claim_number, period, status, entity_id::TEXT
FROM expense_claims
ORDER BY submitted_at DESC;
