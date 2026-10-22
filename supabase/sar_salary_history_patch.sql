-- ================================================================
-- PATCH: Staff Action Requests (SAR) + Salary History
-- Run this in Supabase → SQL Editor
-- ================================================================

-- ── 1. staff_action_requests ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS staff_action_requests (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id            UUID        NOT NULL REFERENCES entities(id),
  employee_id          UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  submitted_by_name    TEXT,
  submitted_by_email   TEXT,
  department_name      TEXT,

  action_type          TEXT        NOT NULL
    CHECK (action_type IN ('RELEASE','PAYROLL_HOLD','TRANSFER','CONTRACT_EXTENSION','TYPE_CHANGE')),

  -- Release / Termination fields
  notice_given_date    DATE,
  last_working_day     DATE,
  notice_period        TEXT
    CHECK (notice_period IN ('IMMEDIATE','1_WEEK','2_WEEKS','1_MONTH','OTHER')),

  -- Payroll Hold fields
  hold_month           TEXT,           -- YYYY-MM

  -- Transfer fields
  transfer_to_dept_id  UUID REFERENCES departments(id),
  transfer_to_dept_name TEXT,

  -- Common fields
  reason               TEXT,
  notes                TEXT,

  -- Workflow status
  status               TEXT        NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','ACKNOWLEDGED','PROCESSED','CANCELLED')),
  acknowledged_by      TEXT,
  acknowledged_at      TIMESTAMPTZ,
  payroll_notes        TEXT,
  processed_by         TEXT,
  processed_at         TIMESTAMPTZ,

  created_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE staff_action_requests ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'staff_action_requests' AND policyname = 'anon_all'
  ) THEN
    CREATE POLICY "anon_all" ON staff_action_requests
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sar_entity_status ON staff_action_requests(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_sar_employee      ON staff_action_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_sar_email         ON staff_action_requests(submitted_by_email);


-- ── 2. salary_history ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_history (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID        NOT NULL REFERENCES entities(id),
  employee_id       UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  effective_date    DATE        NOT NULL,
  change_type       TEXT        NOT NULL
    CHECK (change_type IN ('INITIAL','INCREMENT','PROMOTION','CORRECTION','MARKET_ADJUSTMENT','OTHER')),

  -- Old values
  old_basic         NUMERIC(14,2) DEFAULT 0,
  old_housing       NUMERIC(14,2) DEFAULT 0,
  old_transport     NUMERIC(14,2) DEFAULT 0,
  old_bank_portion  NUMERIC(14,2) DEFAULT 0,
  old_package       NUMERIC(14,2) DEFAULT 0,

  -- New values
  new_basic         NUMERIC(14,2) DEFAULT 0,
  new_housing       NUMERIC(14,2) DEFAULT 0,
  new_transport     NUMERIC(14,2) DEFAULT 0,
  new_bank_portion  NUMERIC(14,2) DEFAULT 0,
  new_package       NUMERIC(14,2) DEFAULT 0,

  -- Summary
  increment_amount  NUMERIC(14,2) GENERATED ALWAYS AS (new_package - old_package) STORED,
  increment_pct     NUMERIC(6,2),

  reason            TEXT,
  approved_by       TEXT,
  notes             TEXT,
  recorded_by_email TEXT,

  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE salary_history ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'salary_history' AND policyname = 'anon_all'
  ) THEN
    CREATE POLICY "anon_all" ON salary_history
      FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sal_hist_emp ON salary_history(employee_id, effective_date DESC);


-- ── 3. Verify ───────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('staff_action_requests','salary_history')
ORDER BY table_name;

SELECT tablename, policyname FROM pg_policies
WHERE tablename IN ('staff_action_requests','salary_history');
