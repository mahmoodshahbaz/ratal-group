-- ══════════════════════════════════════════════════════════════════
-- DUMMY EMPLOYEES FOR TESTING — Daily Expense form dev mode
-- Run in Supabase SQL editor
-- ══════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_entity_id   UUID;
  v_dept_id     UUID;
BEGIN

  -- Get the first available entity (RAT, GWT, or whatever exists)
  SELECT id INTO v_entity_id FROM entities LIMIT 1;
  IF v_entity_id IS NULL THEN
    RAISE EXCEPTION 'No entities found. Please create at least one entity first.';
  END IF;

  -- Ensure a test department exists
  INSERT INTO departments (entity_id, dept_code, dept_name)
  VALUES (v_entity_id, 'OPS', 'Operations')
  ON CONFLICT (entity_id, dept_code) DO NOTHING;

  SELECT id INTO v_dept_id FROM departments
  WHERE entity_id = v_entity_id AND dept_code = 'OPS';

  -- ── Insert 5 dummy test employees ────────────────────────────────

  INSERT INTO employees (
    entity_id, employee_number, employee_code,
    full_name_en, full_name_ar, full_name,
    designation, job_title, department_id,
    mobile_number, employment_type, status,
    overtime_eligible, food_allowance_eligible,
    hire_date, is_active
  ) VALUES

  (v_entity_id, 'TEST-001', 'TEST-001',
   'Mohammed Al-Rashidi', 'محمد الرشيدي', 'Mohammed Al-Rashidi',
   'Senior Technician', 'Electrical Technician', v_dept_id,
   '0501112233', 'STAFF', 'ACTIVE',
   true, true, '2023-01-01', true),

  (v_entity_id, 'TEST-002', 'TEST-002',
   'Ahmed Abdullah Said', 'أحمد عبدالله سعيد', 'Ahmed Abdullah Said',
   'Supervisor', 'Site Supervisor', v_dept_id,
   '0502223344', 'STAFF', 'ACTIVE',
   true, true, '2022-06-15', true),

  (v_entity_id, 'TEST-003', 'TEST-003',
   'Khalid Ibrahim Hassan', 'خالد إبراهيم حسن', 'Khalid Ibrahim Hassan',
   'Project Manager', 'Project Manager', v_dept_id,
   '0503334455', 'STAFF', 'ACTIVE',
   false, false, '2021-03-10', true),

  (v_entity_id, 'TEST-004', 'TEST-004',
   'Faisal Omar Al-Ghamdi', 'فيصل عمر الغامدي', 'Faisal Omar Al-Ghamdi',
   'Technician', 'HVAC Technician', v_dept_id,
   '0504445566', 'STAFF', 'ACTIVE',
   true, true, '2023-08-20', true),

  (v_entity_id, 'TEST-005', 'TEST-005',
   'Saeed Nasser Al-Qahtani', 'سعيد ناصر القحطاني', 'Saeed Nasser Al-Qahtani',
   'Driver', 'Company Driver', v_dept_id,
   '0505556677', 'STAFF', 'ACTIVE',
   false, true, '2022-11-01', true)

  ON CONFLICT (employee_number) DO UPDATE SET
    full_name_en          = EXCLUDED.full_name_en,
    status                = EXCLUDED.status,
    is_active             = EXCLUDED.is_active;

  RAISE NOTICE '✓ 5 dummy employees inserted/updated successfully.';
END $$;
