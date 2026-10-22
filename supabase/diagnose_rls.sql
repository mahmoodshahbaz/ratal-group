-- ══════════════════════════════════════════════════════════════════
-- DIAGNOSTIC: Check RLS policies and employee data
-- Run in Supabase SQL editor
-- ══════════════════════════════════════════════════════════════════

-- 1. How many employees exist and what are their status/is_active values?
SELECT
  status,
  is_active,
  COUNT(*) as count
FROM employees
GROUP BY status, is_active
ORDER BY status, is_active;

-- 2. What RLS policies exist on employees table?
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE tablename = 'employees'
ORDER BY policyname;

-- 3. What RLS policies exist on departments table?
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE tablename = 'departments'
ORDER BY policyname;

-- 4. Simulate what anon user would see (SET ROLE anon)
SET ROLE anon;
SELECT id, full_name_en, designation, is_active, status
FROM employees
LIMIT 5;
RESET ROLE;
