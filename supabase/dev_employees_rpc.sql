-- ══════════════════════════════════════════════════════════════════
-- RPC: get_dev_employees()
-- Returns active employees for dev/testing mode only
-- SECURITY DEFINER = runs as DB owner, bypasses RLS entirely
-- Called via: supabase.rpc('get_dev_employees')
-- ══════════════════════════════════════════════════════════════════

-- First: check actual column names in employees table
-- Run this line alone to see what's available:
-- SELECT column_name FROM information_schema.columns WHERE table_name='employees' ORDER BY column_name;

CREATE OR REPLACE FUNCTION get_dev_employees()
RETURNS TABLE(
  id                      UUID,
  full_name_en            TEXT,
  designation             TEXT,
  phone                   TEXT,
  status                  TEXT,
  entity_id               UUID,
  department              TEXT,
  basic_salary            NUMERIC,
  employment_type         TEXT,
  overtime_eligible       BOOLEAN,
  food_allowance_eligible BOOLEAN
)
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT
    e.id,
    e.full_name_en,
    e.designation,
    COALESCE(e.phone, e.phone_number)            AS phone,
    e.status,
    e.entity_id,
    COALESCE(d.dept_name, d.dept_code)           AS department,
    e.basic_salary,
    e.employment_type,
    e.overtime_eligible,
    e.food_allowance_eligible
  FROM employees e
  LEFT JOIN departments d ON d.id = e.department_id
  WHERE e.is_active = true
  ORDER BY e.full_name_en;
$$;

-- Allow the anon key to call this function
GRANT EXECUTE ON FUNCTION get_dev_employees() TO anon;

-- Test it
SELECT * FROM get_dev_employees() LIMIT 5;
