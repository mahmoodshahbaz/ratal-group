-- ══════════════════════════════════════════════════════════════════
-- FIX: Set status = 'ACTIVE' for all employees where is_active = true
-- Run in Supabase SQL editor
-- This is safe to run multiple times (idempotent)
-- ══════════════════════════════════════════════════════════════════

-- Step 1: Set ACTIVE for all is_active = true employees with missing status
UPDATE employees
SET status = 'ACTIVE'
WHERE (status IS NULL OR status = '')
  AND is_active = true;

-- Step 2: Set INACTIVE for all is_active = false employees with missing status
UPDATE employees
SET status = 'INACTIVE'
WHERE (status IS NULL OR status = '')
  AND is_active = false;

-- Step 3: Verify — show counts
SELECT
  status,
  COUNT(*) as employee_count
FROM employees
GROUP BY status
ORDER BY status;
