-- Step 1: Add cash_portion column (if not already done)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS cash_portion NUMERIC(10,2) DEFAULT 0;

-- Step 2: Backfill cash_portion for all employees
-- Cash Portion = (Basic + Housing + Transport + Allowances) - Bank Portion
-- Only updates employees where components sum > bank_portion (meaning some salary is paid in cash)
UPDATE employees
SET cash_portion = GREATEST(0,
  COALESCE(basic_salary,0)
  + COALESCE(housing_allowance,0)
  + COALESCE(transport_allowance,0)
  + COALESCE(mobile_allowance,0)
  + COALESCE(medical_allowance,0)
  + COALESCE(technical_allowance,0)
  + COALESCE(other_allowance,0)
  - COALESCE(bank_portion,0)
)
WHERE COALESCE(bank_portion,0) > 0
  AND (
    COALESCE(basic_salary,0)
    + COALESCE(housing_allowance,0)
    + COALESCE(transport_allowance,0)
    + COALESCE(mobile_allowance,0)
    + COALESCE(medical_allowance,0)
    + COALESCE(technical_allowance,0)
    + COALESCE(other_allowance,0)
  ) > COALESCE(bank_portion,0);

-- Verify results
SELECT employee_number, full_name_en,
  COALESCE(basic_salary,0)+COALESCE(housing_allowance,0)+COALESCE(transport_allowance,0)+COALESCE(mobile_allowance,0)+COALESCE(medical_allowance,0)+COALESCE(technical_allowance,0)+COALESCE(other_allowance,0) AS component_total,
  bank_portion, cash_portion,
  bank_portion + cash_portion AS payable_total
FROM employees
WHERE bank_portion > 0
ORDER BY full_name_en;
