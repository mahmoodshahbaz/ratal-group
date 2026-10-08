-- ============================================================
-- expense_claims_debug_reset.sql
-- Run sections individually in Supabase SQL Editor
-- ============================================================

-- ── SECTION 1: DIAGNOSE — why aren't claims generating? ────────────────────
-- Run this first to see what's happening

-- 1a. How many expense_records exist and what's their claim status?
SELECT
  COUNT(*)                                          AS total_records,
  COUNT(*) FILTER (WHERE claim_id IS NULL)          AS unlinked_ready_to_claim,
  COUNT(*) FILTER (WHERE claim_id IS NOT NULL)      AS already_linked_to_a_claim,
  COUNT(*) FILTER (WHERE status = 'RECORDED')       AS status_recorded,
  COUNT(*) FILTER (WHERE status = 'SUBMITTED')      AS status_submitted,
  COUNT(*) FILTER (WHERE amount = 0)                AS zero_amount_excluded,
  MIN(expense_date)                                 AS earliest_date,
  MAX(expense_date)                                 AS latest_date
FROM expense_records
WHERE entity_id = (SELECT id FROM entities ORDER BY created_at LIMIT 1);

-- 1b. Check the expense_claims table — what periods have been generated?
SELECT
  period,
  COUNT(*)                                         AS claim_count,
  STRING_AGG(status, ', ' ORDER BY status)         AS statuses,
  MIN(created_at)::DATE                            AS first_generated
FROM expense_claims
GROUP BY period
ORDER BY period DESC;

-- 1c. Check if the expense_claims table has the new columns (from v3 patch)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'expense_claims'
  AND column_name IN ('project_id', 'project_no', 'project_name',
                       'dh_acknowledged_at', 'dh_acknowledged_by', 'dh_acknowledged_by_name')
ORDER BY column_name;

-- 1d. Check if the new RPCs exist
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('generate_expense_claims', 'preview_expense_claims',
                       'dh_acknowledge_claim', 'dh_approve_claim');


-- ── SECTION 2: RESET — clear old claims so you can re-generate ─────────────
-- ⚠ ONLY run this if you want to reset for testing.
-- This unlinks expense_records from old claims, then deletes the claims.
-- Replace '2026-09' and '2026-10' with the period(s) you want to reset.

/*
-- Step 2a: Unlink expense_records from claims for a given period
UPDATE expense_records
SET    claim_id = NULL,
       status   = 'RECORDED'
WHERE  claim_id IN (
  SELECT id FROM expense_claims
  WHERE  period IN ('2026-09', '2026-10')
);

-- Step 2b: Delete the claims themselves
DELETE FROM expense_claims
WHERE  period IN ('2026-09', '2026-10');

-- Step 2c: Verify reset
SELECT COUNT(*) AS unlinked FROM expense_records WHERE claim_id IS NULL;
SELECT COUNT(*) AS remaining_claims FROM expense_claims WHERE period IN ('2026-09','2026-10');
*/


-- ── SECTION 3: FULL RESET (all claims, all records) ────────────────────────
-- ⚠ Nuclear option — only for a completely fresh start during dev/testing

/*
UPDATE expense_records SET claim_id = NULL, status = 'RECORDED';
DELETE FROM expense_claims;
-- Optionally reset the sequence
ALTER SEQUENCE IF EXISTS expense_claim_seq RESTART WITH 1;
*/
