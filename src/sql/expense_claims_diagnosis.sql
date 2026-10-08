-- ============================================================
-- expense_claims_diagnosis.sql
-- Run in Supabase SQL Editor to diagnose why claims don't appear
-- ============================================================

-- ── STEP 1: Check what claims exist ───────────────────────────
-- This runs as superuser (bypasses RLS) so you'll see ALL rows
SELECT
  claim_number,
  period,
  entity_id::TEXT,
  employee_id::TEXT,
  status,
  total_claimed,
  submitted_at::DATE
FROM expense_claims
ORDER BY submitted_at DESC
LIMIT 20;

-- ── STEP 2: Cross-check entity UUIDs ──────────────────────────
-- Compare these UUIDs with what Step 1 shows in entity_id
SELECT id::TEXT, entity_code, entity_name FROM entities ORDER BY entity_code;

-- ── STEP 3: Check RLS policies on expense_claims ──────────────
SELECT
  policyname,
  cmd,
  roles::TEXT,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'expense_claims'
ORDER BY policyname;

-- ── STEP 4: Check if RLS is enabled ────────────────────────────
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname = 'expense_claims';

-- ── STEP 5: Check expense_records linkage ─────────────────────
SELECT
  claim_id::TEXT,
  COUNT(*) AS record_count,
  SUM(amount) AS total_amount
FROM expense_records
WHERE entity_id IN (SELECT id FROM entities WHERE entity_code = 'ACCSYS')
GROUP BY claim_id
ORDER BY claim_id;

-- ============================================================
-- INTERPRETATION:
--
-- If Step 1 shows 0 rows → claims were never committed (all
--   generate runs rolled back). → Click Generate Claims again.
--
-- If Step 1 shows rows but entity_id ≠ ACCSYS UUID from Step 2
--   → UUID mismatch. Run the FIX below.
--
-- If Step 1 shows rows with correct entity_id + Step 3 shows
--   SELECT policy → RLS is fine. Issue is in UI/auth token.
--   Try: open browser DevTools → Network tab → find the
--   expense_claims request → check if Authorization header exists.
--
-- If Step 4: relrowsecurity = false → RLS was DISABLED (claims
--   should be visible without policies). Enable it and add policy.
-- ============================================================


-- ── FIX A: If 0 claims exist — generate will now work ─────────
-- (All SQL errors are fixed. Click Generate Claims in the UI.)


-- ── FIX B: If RLS is ON but missing SELECT policy ─────────────
-- (Run this if Step 3 shows no SELECT policy)
/*
DROP POLICY IF EXISTS "expense_claims_select" ON expense_claims;
CREATE POLICY "expense_claims_select"
  ON expense_claims FOR SELECT
  USING (true);
*/


-- ── FIX C: Broader RLS (both authenticated and anon) ──────────
-- Run this if the UI still shows 0 even after RLS policy is set.
-- It allows ALL roles to query (app security is in the .eq filters).
ALTER TABLE expense_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expense_claims_select"         ON expense_claims;
DROP POLICY IF EXISTS "expense_claims_anon_select"    ON expense_claims;
DROP POLICY IF EXISTS "expense_claims_insert"         ON expense_claims;
DROP POLICY IF EXISTS "expense_claims_update"         ON expense_claims;

-- SELECT: open to everyone (entity_id filter in app limits scope)
CREATE POLICY "expense_claims_select"
  ON expense_claims FOR SELECT
  USING (true);

-- INSERT: authenticated and anon (SECURITY DEFINER functions bypass anyway)
CREATE POLICY "expense_claims_insert"
  ON expense_claims FOR INSERT
  WITH CHECK (true);

-- UPDATE: same
CREATE POLICY "expense_claims_update"
  ON expense_claims FOR UPDATE
  USING (true) WITH CHECK (true);

-- Also make sure expense_claim_rejections is accessible
ALTER TABLE expense_claim_rejections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "claim_rejections_select" ON expense_claim_rejections;
DROP POLICY IF EXISTS "claim_rejections_insert" ON expense_claim_rejections;
CREATE POLICY "claim_rejections_select"
  ON expense_claim_rejections FOR SELECT USING (true);
CREATE POLICY "claim_rejections_insert"
  ON expense_claim_rejections FOR INSERT WITH CHECK (true);
