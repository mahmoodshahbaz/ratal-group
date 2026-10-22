-- ================================================================
--  phase_i_patch.sql
--  ACCSYS — Sub-Con Claims: add rejection reason column
--  Run ONCE in Supabase SQL Editor
-- ================================================================

-- Add rejection reason (safe to run if already exists)
ALTER TABLE subcon_claims
  ADD COLUMN IF NOT EXISTS dh_rejection_reason text;

-- Ensure DH_APPROVED status is covered (schema had REJECTED, not DH_APPROVED)
-- If your constraint needs updating, drop and recreate it:
--   ALTER TABLE subcon_claims DROP CONSTRAINT IF EXISTS subcon_claims_status_check;
--   ALTER TABLE subcon_claims ADD CONSTRAINT subcon_claims_status_check
--     CHECK (status IN ('SUBMITTED','DH_APPROVED','FINANCE_APPROVED','PAID','REJECTED'));
-- Run the above two lines if you get a constraint violation on approval.
