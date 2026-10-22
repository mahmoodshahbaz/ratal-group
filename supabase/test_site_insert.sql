-- ═══════════════════════════════════════════════════════════════
-- DIAGNOSTIC: Test if site_masters accepts inserts
-- Run each section one at a time in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- STEP 1: Check the table structure and policies
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'site_masters'
ORDER BY ordinal_position;

-- ═══════════════════════════════════════════════════════════════

-- STEP 2: Check RLS policies (run separately)
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE tablename = 'site_masters';

-- ═══════════════════════════════════════════════════════════════

-- STEP 3: Try a direct insert bypassing RLS — if this works,
--         the table is fine, problem is in React auth.
--         (Run separately)
INSERT INTO site_masters (service_unit, job_no, status, milestones)
VALUES ('TISU', 'TEST-DIRECT-001', 'PENDING', '[]')
RETURNING id, sm_id, entity_id, service_unit, job_no;

-- If STEP 3 works → delete the test row:
-- DELETE FROM site_masters WHERE job_no = 'TEST-DIRECT-001';
