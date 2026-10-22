-- ================================================================
-- PATCH: Employee Dependents + DOB / SCE / QIWA Columns
-- Run this in Supabase → SQL Editor
-- ================================================================

-- ── 1. New columns on the employees table ───────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS date_of_birth       DATE,
  ADD COLUMN IF NOT EXISTS sce_registered      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sce_number          TEXT,
  ADD COLUMN IF NOT EXISTS sce_expiry          DATE,
  ADD COLUMN IF NOT EXISTS qiwa_registered     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS qiwa_expiry         DATE;

-- ── 2. employee_dependents table ────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_dependents (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  entity_id        UUID        NOT NULL REFERENCES entities(id),
  full_name        TEXT        NOT NULL,
  gender           TEXT        CHECK (gender IN ('Male','Female')),
  relation         TEXT        CHECK (relation IN ('Son','Daughter','Wife','Other')),
  date_of_birth    DATE,
  iqama_number     TEXT,
  passport_number  TEXT,
  passport_expiry  DATE,
  nationality      TEXT,
  sort_order       INTEGER     DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. RLS ──────────────────────────────────────────────────────
ALTER TABLE employee_dependents ENABLE ROW LEVEL SECURITY;

-- Allow anon (same policy pattern as other HR tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'employee_dependents' AND policyname = 'anon_all'
  ) THEN
    CREATE POLICY "anon_all" ON employee_dependents
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 4. Verify ───────────────────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'employees'
  AND column_name IN ('date_of_birth','sce_registered','sce_number','sce_expiry','qiwa_registered','qiwa_expiry')
ORDER BY column_name;

SELECT tablename, policyname FROM pg_policies WHERE tablename = 'employee_dependents';
