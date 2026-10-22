-- =====================================================================
-- ACCSYS Payroll Schema v2.0
-- ─────────────────────────────────────────────────────────────────────
-- Covers:
--   1.  employees — category, payment mode, bank split, GOSI, SCE
--   2.  employment_periods — full history log, mandatory dates
--   3.  eosb_records — EOSB calculation & approval tracking
--   4.  payroll_records — slip_type, pay dates, pro-rata, Drive URLs
--   5.  wps_submissions — ANB WPS file log + 200K split tracking
--   6.  mudad_submissions — WPS + GOSI Mudad upload log
--   7.  gosi_monthly_records — per-employee GOSI monthly snapshot
--   8.  payroll_calendar — payment dates with weekend adjustment
--   9.  calculate_eosb() — tiered EOSB function (EXPAT only)
--  10.  calculate_pro_rata() — OUTSOURCED/CONTRACT pro-rata
--  11.  validate_mudad_gosi_count() — pre-submission count check
--  12.  sce_expiry_alerts VIEW
--  13.  iqama_expiry_alerts VIEW
--
-- Run in Supabase SQL Editor (safe to re-run — uses IF NOT EXISTS)
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. EMPLOYEES TABLE — New Columns
-- ─────────────────────────────────────────────────────────────────────

-- Employee category
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_category TEXT DEFAULT '02'
    CHECK (employee_category IN ('01','02','03','04'));

COMMENT ON COLUMN employees.employee_category IS
  '01=ACCSYS-LOCAL  02=ACCSYS-EXPAT  03=OUTSOURCED  04=CONTRACT';

-- Multi-entity
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS entity_code TEXT DEFAULT 'RATAL'
    CHECK (entity_code IN ('RATAL','GREENWINGS','RTT'));

-- WPS eligibility (auto-derived — LOCAL + EXPAT only)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS wps_eligible BOOLEAN
    GENERATED ALWAYS AS (employee_category IN ('01','02')) STORED;

-- Payment mode (EXPAT-relevant; stored for all for consistency)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS payment_mode TEXT DEFAULT 'BANK_ONLY'
    CHECK (payment_mode IN ('BANK_ONLY','CASH_ONLY','BANK_CASH_SPLIT'));

COMMENT ON COLUMN employees.payment_mode IS
  'BANK_ONLY: full net to bank.  CASH_ONLY: full cash.  BANK_CASH_SPLIT: use bank_fixed_amount or bank_portion_pct';

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS bank_fixed_amount  NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS bank_portion_pct   NUMERIC(5,2);

COMMENT ON COLUMN employees.bank_fixed_amount IS 'Fixed SAR amount sent to bank monthly (overrides pct if set)';
COMMENT ON COLUMN employees.bank_portion_pct  IS 'Percentage of net sent to bank (e.g. 60.00 = 60%)';

-- Initial basic salary at joining (required for EOSB 3-year rule)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS initial_basic_salary NUMERIC(12,2);

COMMENT ON COLUMN employees.initial_basic_salary IS 'Basic salary at time of first joining — frozen, used for EOSB <3yr tier';

-- ── GOSI Fields ───────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS gosi_number       TEXT,
  ADD COLUMN IF NOT EXISTS gosi_start_date   DATE,
  ADD COLUMN IF NOT EXISTS gosi_end_date     DATE;

-- GOSI eligibility (auto — LOCAL + EXPAT only)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS gosi_eligible BOOLEAN
    GENERATED ALWAYS AS (employee_category IN ('01','02')) STORED;

-- GOSI rate type (auto — Saudi vs Expat contribution rates)
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS gosi_rate_type TEXT
    GENERATED ALWAYS AS (
      CASE
        WHEN nationality ILIKE 'Saudi' OR nationality ILIKE 'SA'
          OR nationality ILIKE 'Saudi Arabian' THEN 'SAUDI'
        ELSE 'EXPAT'
      END
    ) STORED;

COMMENT ON COLUMN employees.gosi_rate_type IS
  'SAUDI: 9% employer + 9% employee.  EXPAT: 2% employer only (hazard insurance)';

-- ── SCE — Saudi Engineering Council ───────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS sce_required    BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS sce_number      TEXT,
  ADD COLUMN IF NOT EXISTS sce_category    TEXT,
  ADD COLUMN IF NOT EXISTS sce_issue_date  DATE,
  ADD COLUMN IF NOT EXISTS sce_expiry_date DATE,
  ADD COLUMN IF NOT EXISTS sce_status      TEXT DEFAULT 'NOT_APPLICABLE'
    CHECK (sce_status IN ('NOT_APPLICABLE','VALID','EXPIRED','RENEWAL_IN_PROGRESS'));

COMMENT ON COLUMN employees.sce_required IS 'true for engineers — SCE expiry blocks Iqama renewal';

-- ── OUTSOURCED / CONTRACT Specific ────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS outsource_agency   TEXT,
  ADD COLUMN IF NOT EXISTS contract_end_date  DATE;

COMMENT ON COLUMN employees.outsource_agency  IS 'Staffing agency name for category 03 (OUTSOURCED)';
COMMENT ON COLUMN employees.contract_end_date IS 'Contract expiry for category 04 (CONTRACT)';


-- ─────────────────────────────────────────────────────────────────────
-- 2. EMPLOYMENT PERIODS — Full History Log
-- ─────────────────────────────────────────────────────────────────────
-- Every active/inactive event is a row here.
-- employee.is_active is derived from whether an ACTIVE period exists.
-- Employees are NEVER deleted or given new IDs on re-joining.

CREATE TABLE IF NOT EXISTS employment_periods (
  id           UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id  UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  start_date   DATE        NOT NULL,
  end_date     DATE,                       -- NULL = currently active
  status       TEXT        NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','CLOSED')),
  end_reason   TEXT
    CHECK (end_reason IN (
      'RESIGNATION','CONTRACT_END','TERMINATION',
      'SUSPENSION','TRANSFER','RETIREMENT',NULL
    )),
  rejoined_from_period UUID REFERENCES employment_periods(id),  -- link to previous period
  notes        TEXT,
  created_by   UUID        REFERENCES employees(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE employment_periods IS
  'Full employment history per employee. One ACTIVE row = currently employed. Re-joining adds a new row — never a new employee ID.';

-- Only one active (open) period per employee at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_one_active_period_per_employee
  ON employment_periods (employee_id)
  WHERE end_date IS NULL;

-- RLS
ALTER TABLE employment_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HR Finance Admin see all employment_periods" ON employment_periods;
CREATE POLICY "HR Finance Admin see all employment_periods"
  ON employment_periods FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('admin','hr','finance')
    )
  );


-- ─────────────────────────────────────────────────────────────────────
-- 3. EOSB RECORDS
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eosb_records (
  id                     UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id            UUID         NOT NULL REFERENCES employees(id),
  employee_name          TEXT         NOT NULL,
  employee_category      TEXT         NOT NULL,
  calculated_on          DATE         NOT NULL DEFAULT CURRENT_DATE,
  leaving_date           DATE         NOT NULL,
  join_date              DATE         NOT NULL,
  years_of_service       NUMERIC(6,2) NOT NULL,
  tenure_band            TEXT         NOT NULL
    CHECK (tenure_band IN ('<3Y','3Y','3-5Y','5-10Y','10-15Y','15-25Y')),
  initial_basic_salary   NUMERIC(12,2),
  current_basic_salary   NUMERIC(12,2) NOT NULL,
  current_housing        NUMERIC(12,2) DEFAULT 0,
  current_transport      NUMERIC(12,2) DEFAULT 0,
  current_package        NUMERIC(12,2) NOT NULL,  -- basic+housing+transport
  eosb_amount            NUMERIC(14,2) NOT NULL,
  calculation_breakdown  JSONB,                    -- tier-by-tier detail
  status                 TEXT         DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','PENDING_APPROVAL','APPROVED','PAID','CANCELLED')),
  approved_by            UUID         REFERENCES employees(id),
  approved_at            TIMESTAMPTZ,
  paid_date              DATE,
  payment_reference      TEXT,
  drive_url              TEXT,                     -- EOSB letter PDF in Drive
  notes                  TEXT,
  created_by             UUID         REFERENCES employees(id),
  created_at             TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE eosb_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HR Finance Admin see EOSB" ON eosb_records;
CREATE POLICY "HR Finance Admin see EOSB"
  ON eosb_records FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('admin','hr','finance')
    )
  );


-- ─────────────────────────────────────────────────────────────────────
-- 4. PAYROLL RECORDS — Extended Columns
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE payroll_records
  ADD COLUMN IF NOT EXISTS employee_category TEXT,         -- snapshot at payroll time
  ADD COLUMN IF NOT EXISTS entity_code       TEXT DEFAULT 'RATAL',
  ADD COLUMN IF NOT EXISTS slip_type         TEXT DEFAULT 'BANK_ONLY'
    CHECK (slip_type IN ('FULL_BANK','BANK','CASH','CASH_ONLY')),
  ADD COLUMN IF NOT EXISTS bank_pay_date     DATE,
  ADD COLUMN IF NOT EXISTS cash_pay_date     DATE,
  ADD COLUMN IF NOT EXISTS cash_run_serial   INT  DEFAULT 1,
  ADD COLUMN IF NOT EXISTS pro_rata_days     INT,          -- working days this month
  ADD COLUMN IF NOT EXISTS pro_rata_applied  BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS bank_slip_drive_url  TEXT,
  ADD COLUMN IF NOT EXISTS cash_slip_drive_url  TEXT;

COMMENT ON COLUMN payroll_records.slip_type IS
  'FULL_BANK=LOCAL or EXPAT full-bank. BANK=EXPAT bank portion. CASH=EXPAT cash portion. CASH_ONLY=OUTSOURCED/CONTRACT';
COMMENT ON COLUMN payroll_records.cash_run_serial IS
  'Increments per cash payment run within the same month (e.g. 2 = second cash run)';


-- ─────────────────────────────────────────────────────────────────────
-- 5. PAYROLL CALENDAR
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payroll_calendar (
  id                   UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_month        TEXT         NOT NULL UNIQUE,   -- '2026-09'
  processing_date      DATE         NOT NULL,          -- 28th adjusted for weekends
  wps_payment_date     DATE         NOT NULL,          -- 30th adjusted for weekends/Feb
  cash_run_1_date      DATE,                           -- first cash run
  cash_run_2_date      DATE,                           -- second cash run if any
  mudad_due_date       DATE         NOT NULL,          -- 5th next month (next Sunday if weekend)
  payroll_status       TEXT         DEFAULT 'OPEN'
    CHECK (payroll_status IN ('OPEN','PROCESSING','WPS_READY','WPS_SUBMITTED','MUDAD_SUBMITTED','CLOSED')),
  total_bank_amount    NUMERIC(14,2) DEFAULT 0,
  total_cash_amount    NUMERIC(14,2) DEFAULT 0,
  total_payroll_amount NUMERIC(14,2) DEFAULT 0,
  employee_count_bank  INT           DEFAULT 0,
  employee_count_cash  INT           DEFAULT 0,
  wps_file_count       INT           DEFAULT 1,        -- 1 or 2 when >200K
  notes                TEXT,
  created_at           TIMESTAMPTZ  DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  DEFAULT NOW()
);

COMMENT ON TABLE payroll_calendar IS
  'One row per payroll month. Tracks all payment dates adjusted for Saudi weekends (Fri-Sat) and February.';
COMMENT ON COLUMN payroll_calendar.wps_payment_date IS
  'Rule: 30th of month, except Feb (last day). If Fri → Thu. If Sat → Thu.';
COMMENT ON COLUMN payroll_calendar.mudad_due_date IS
  'Rule: 5th of following month. If Fri or Sat → following Sunday.';


-- ─────────────────────────────────────────────────────────────────────
-- 6. WPS SUBMISSIONS LOG
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wps_submissions (
  id                    UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_month         TEXT         NOT NULL,
  entity_code           TEXT         NOT NULL DEFAULT 'RATAL',
  file_type             TEXT         NOT NULL DEFAULT 'COMBINED'
    CHECK (file_type IN ('COMBINED','EXPAT_ONLY','LOCAL_ONLY')),
  file_name             TEXT         NOT NULL,         -- WPY28092026001.xlsx
  sequence_no           INT          NOT NULL DEFAULT 1,  -- 001, 002 for split
  total_amount          NUMERIC(14,2) NOT NULL,
  employee_count        INT          NOT NULL,
  processing_date       DATE         NOT NULL,
  payment_date          DATE         NOT NULL,
  anb_submitted_at      TIMESTAMPTZ,
  anb_confirmation_url  TEXT,                          -- Drive: bank receipt PDF
  drive_file_url        TEXT,                          -- Drive: WPS xlsx
  status                TEXT         DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','READY','SUBMITTED','CONFIRMED','FAILED')),
  submitted_by          UUID         REFERENCES employees(id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ  DEFAULT NOW()
);

COMMENT ON TABLE wps_submissions IS
  '200K rule: total_bank ≤200K → one COMBINED row. >200K → two rows: EXPAT_ONLY (seq 001) + LOCAL_ONLY (seq 002).';

ALTER TABLE wps_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Finance Admin WPS" ON wps_submissions;
CREATE POLICY "Finance Admin WPS"
  ON wps_submissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('admin','finance')
    )
  );


-- ─────────────────────────────────────────────────────────────────────
-- 7. MUDAD SUBMISSIONS LOG
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS mudad_submissions (
  id                      UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_month           TEXT         NOT NULL,
  submission_type         TEXT         NOT NULL
    CHECK (submission_type IN ('WPS','GOSI')),
  due_date                DATE         NOT NULL,
  wps_employee_count      INT,                         -- count in WPS file
  gosi_employee_count     INT,                         -- count in GOSI list
  count_matched           BOOLEAN,
  mismatch_details        JSONB,                       -- [{employee_id, name, reason}]
  statement_file_name     TEXT,                        -- .txt file from ANB
  statement_drive_url     TEXT,                        -- Drive: bank statement
  confirmation_drive_url  TEXT,                        -- Drive: Mudad confirmation
  submitted_at            TIMESTAMPTZ,
  submitted_by            UUID         REFERENCES employees(id),
  status                  TEXT         DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','VALIDATED','SUBMITTED','CONFIRMED','REJECTED')),
  rejection_reason        TEXT,
  notes                   TEXT,
  created_at              TIMESTAMPTZ  DEFAULT NOW()
);

COMMENT ON TABLE mudad_submissions IS
  'Log every Mudad upload. Validate GOSI vs WPS count before submission to avoid SMS rejection cycle.';
COMMENT ON COLUMN mudad_submissions.statement_file_name IS
  'The .txt file downloaded from ANB — upload to Mudad without opening. Format: WPS_Statement_Sep2026.txt';

ALTER TABLE mudad_submissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Finance Admin Mudad" ON mudad_submissions;
CREATE POLICY "Finance Admin Mudad"
  ON mudad_submissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('admin','finance')
    )
  );


-- ─────────────────────────────────────────────────────────────────────
-- 8. GOSI MONTHLY RECORDS
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS gosi_monthly_records (
  id                     UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  payroll_month          TEXT         NOT NULL,
  employee_id            UUID         NOT NULL REFERENCES employees(id),
  employee_name          TEXT         NOT NULL,
  employee_category      TEXT,
  gosi_number            TEXT,
  nationality            TEXT,
  gosi_rate_type         TEXT,
  basic_salary           NUMERIC(12,2),
  employer_contribution  NUMERIC(12,2),
  employee_contribution  NUMERIC(12,2),
  total_contribution     NUMERIC(12,2),
  employment_status      TEXT         DEFAULT 'ACTIVE'
    CHECK (employment_status IN ('ACTIVE','TERMINATED','NEW_JOINER','TRANSFERRED')),
  created_at             TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (payroll_month, employee_id)
);

COMMENT ON TABLE gosi_monthly_records IS
  'Monthly GOSI snapshot used for Mudad count validation. SAUDI: 9%+9%, EXPAT: 2% employer hazard only.';

ALTER TABLE gosi_monthly_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "HR Finance Admin GOSI monthly" ON gosi_monthly_records;
CREATE POLICY "HR Finance Admin GOSI monthly"
  ON gosi_monthly_records FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = auth.uid()
        AND e.role IN ('admin','hr','finance')
    )
  );


-- ─────────────────────────────────────────────────────────────────────
-- 9. EOSB CALCULATION FUNCTION
-- ─────────────────────────────────────────────────────────────────────
-- Tiered rules (ACCSYS-EXPAT only):
--   <3 years       → not eligible
--   3 years        → 50% × initial_basic × 3
--   3–5 years      → 50% × current_basic × years
--   5–10 years     → (50% × basic × 5) + (100% × basic × years_over_5)
--   10–15 years    → (50% × basic × 5) + (100% × basic × years_over_5)
--   15–25 years    → 100% × current_package × MIN(years, 25)

CREATE OR REPLACE FUNCTION calculate_eosb(
  p_employee_id  UUID,
  p_leaving_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_emp        RECORD;
  v_join_date  DATE;
  v_years      NUMERIC(8,4);
  v_eosb       NUMERIC(14,2) := 0;
  v_band       TEXT;
  v_breakdown  JSONB;
  v_package    NUMERIC(12,2);
BEGIN
  SELECT
    e.*,
    ep.start_date AS join_date
  INTO v_emp
  FROM employees e
  JOIN employment_periods ep ON ep.employee_id = e.id
  WHERE e.id = p_employee_id
  ORDER BY ep.start_date ASC          -- use very first joining date
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Employee not found');
  END IF;

  IF v_emp.employee_category != '02' THEN
    RETURN jsonb_build_object(
      'error',    'EOSB only applies to ACCSYS-EXPAT (category 02)',
      'category', v_emp.employee_category
    );
  END IF;

  v_join_date := v_emp.join_date;
  v_years     := ROUND(
    EXTRACT(EPOCH FROM (p_leaving_date - v_join_date)) / (365.25 * 86400),
    4
  );
  v_package   := COALESCE(v_emp.basic_salary, 0)
               + COALESCE(v_emp.housing_allowance, 0)
               + COALESCE(v_emp.transport_allowance, 0);

  -- ── Tier logic ──────────────────────────────────────────────────
  IF v_years < 3 THEN
    v_band  := '<3Y';
    v_eosb  := 0;
    v_breakdown := jsonb_build_array(
      jsonb_build_object('tier','<3 years','eligible',false,'amount',0)
    );

  ELSIF v_years >= 3 AND v_years < 3.01 THEN
    -- Exactly 3 years: 50% of initial basic × 3
    v_band  := '3Y';
    v_eosb  := ROUND(COALESCE(v_emp.initial_basic_salary, v_emp.basic_salary) * 0.5 * 3, 2);
    v_breakdown := jsonb_build_array(
      jsonb_build_object(
        'tier','3 years exactly',
        'basis','50% × initial_basic × 3',
        'initial_basic', COALESCE(v_emp.initial_basic_salary, v_emp.basic_salary),
        'amount', v_eosb
      )
    );

  ELSIF v_years < 5 THEN
    v_band  := '3-5Y';
    v_eosb  := ROUND(v_emp.basic_salary * 0.5 * v_years, 2);
    v_breakdown := jsonb_build_array(
      jsonb_build_object(
        'tier','3–5 years',
        'basis','50% × current_basic × years',
        'years', v_years,
        'current_basic', v_emp.basic_salary,
        'amount', v_eosb
      )
    );

  ELSIF v_years < 10 THEN
    v_band  := '5-10Y';
    v_eosb  := ROUND(
      (v_emp.basic_salary * 0.5 * 5) +
      (v_emp.basic_salary * 1.0 * (v_years - 5)),
    2);
    v_breakdown := jsonb_build_array(
      jsonb_build_object('tier','First 5 years','basis','50% × basic × 5',
        'amount', ROUND(v_emp.basic_salary * 0.5 * 5, 2)),
      jsonb_build_object('tier','Years 5 to service end','basis','100% × basic × extra_years',
        'extra_years', ROUND(v_years - 5, 4),
        'amount', ROUND(v_emp.basic_salary * 1.0 * (v_years - 5), 2))
    );

  ELSIF v_years < 15 THEN
    v_band  := '10-15Y';
    -- First 5 years at 50% basic, remaining at 100% basic
    v_eosb  := ROUND(
      (v_emp.basic_salary * 0.5 * 5) +
      (v_emp.basic_salary * 1.0 * (v_years - 5)),
    2);
    v_breakdown := jsonb_build_array(
      jsonb_build_object('tier','First 5 years','basis','50% × basic × 5',
        'amount', ROUND(v_emp.basic_salary * 0.5 * 5, 2)),
      jsonb_build_object('tier','Remaining years','basis','100% × basic × remaining',
        'remaining_years', ROUND(v_years - 5, 4),
        'amount', ROUND(v_emp.basic_salary * 1.0 * (v_years - 5), 2))
    );

  ELSE
    -- 15+ years: 100% of full package × years, capped at 25
    v_band  := '15-25Y';
    v_eosb  := ROUND(v_package * LEAST(v_years, 25), 2);
    v_breakdown := jsonb_build_array(
      jsonb_build_object(
        'tier','15–25 years',
        'basis','100% × current_package × MIN(years,25)',
        'current_package', v_package,
        'years_used', ROUND(LEAST(v_years, 25), 4),
        'amount', v_eosb
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'employee_id',          p_employee_id,
    'employee_name',        v_emp.full_name,
    'employee_category',    v_emp.employee_category,
    'join_date',            v_join_date,
    'leaving_date',         p_leaving_date,
    'years_of_service',     v_years,
    'tenure_band',          v_band,
    'current_basic',        v_emp.basic_salary,
    'current_housing',      COALESCE(v_emp.housing_allowance, 0),
    'current_transport',    COALESCE(v_emp.transport_allowance, 0),
    'current_package',      v_package,
    'initial_basic',        COALESCE(v_emp.initial_basic_salary, v_emp.basic_salary),
    'eosb_amount',          v_eosb,
    'breakdown',            v_breakdown
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────
-- 10. PRO-RATA CALCULATION FUNCTION
-- ─────────────────────────────────────────────────────────────────────
-- Used for OUTSOURCED (03) and CONTRACT (04).
-- Standard month = 30 days (not calendar days per your rule).
-- Handles: join mid-month, leave mid-month, join+leave same month.

CREATE OR REPLACE FUNCTION calculate_pro_rata(
  p_package    NUMERIC,
  p_month      TEXT    DEFAULT TO_CHAR(CURRENT_DATE, 'YYYY-MM'),
  p_join_date  DATE    DEFAULT NULL,
  p_leave_date DATE    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_month_start  DATE := TO_DATE(p_month || '-01', 'YYYY-MM-DD');
  v_month_end    DATE := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
  v_from         DATE;
  v_to           DATE;
  v_days         INT;
  v_amount       NUMERIC(12,2);
BEGIN
  -- Clamp to month boundaries
  v_from  := GREATEST(COALESCE(p_join_date,  v_month_start), v_month_start);
  v_to    := LEAST   (COALESCE(p_leave_date, v_month_end),   v_month_end);

  IF v_to < v_from THEN
    RETURN jsonb_build_object('error','No active days in this month','days',0,'amount',0);
  END IF;

  v_days   := (v_to - v_from) + 1;
  v_amount := ROUND(p_package / 30.0 * v_days, 2);

  RETURN jsonb_build_object(
    'month',         p_month,
    'package',       p_package,
    'active_from',   v_from,
    'active_to',     v_to,
    'days',          v_days,
    'daily_rate',    ROUND(p_package / 30.0, 4),
    'amount',        v_amount,
    'full_month',    (v_days = 30 OR (p_join_date IS NULL AND p_leave_date IS NULL))
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────
-- 11. MUDAD GOSI COUNT VALIDATION
-- ─────────────────────────────────────────────────────────────────────
-- Run before every Mudad submission.
-- Returns WPS count vs GOSI count with mismatch details.
-- Finance resolves gaps before uploading to avoid SMS rejection.

CREATE OR REPLACE FUNCTION validate_mudad_gosi_count(p_month TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wps_count   INT;
  v_gosi_count  INT;
  v_in_wps_not_gosi  JSONB;
  v_in_gosi_not_wps  JSONB;
BEGIN
  -- WPS employees: category 01+02, bank_portion > 0
  SELECT COUNT(DISTINCT pr.employee_id)
  INTO v_wps_count
  FROM payroll_records pr
  JOIN employees e ON e.id = pr.employee_id
  WHERE pr.payroll_month = p_month
    AND e.employee_category IN ('01','02')
    AND COALESCE(pr.bank_portion, 0) > 0;

  -- GOSI list for this month
  SELECT COUNT(*)
  INTO v_gosi_count
  FROM gosi_monthly_records
  WHERE payroll_month = p_month;

  -- In WPS but NOT in GOSI (potential over-count)
  SELECT jsonb_agg(jsonb_build_object(
    'employee_id',   pr.employee_id,
    'name',          e.full_name,
    'category',      e.employee_category,
    'bank_portion',  pr.bank_portion,
    'issue',         'In WPS file but no GOSI record — new joiner not yet registered?'
  ))
  INTO v_in_wps_not_gosi
  FROM payroll_records pr
  JOIN employees e ON e.id = pr.employee_id
  WHERE pr.payroll_month = p_month
    AND e.employee_category IN ('01','02')
    AND COALESCE(pr.bank_portion, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM gosi_monthly_records g
      WHERE g.payroll_month = p_month AND g.employee_id = pr.employee_id
    );

  -- In GOSI but NOT in WPS (Mudad will SMS them asking to confirm)
  SELECT jsonb_agg(jsonb_build_object(
    'employee_id', g.employee_id,
    'name',        g.employee_name,
    'gosi_number', g.gosi_number,
    'issue',       'In GOSI list but missing from WPS — resigned, unpaid leave, or cash-only employee?'
  ))
  INTO v_in_gosi_not_wps
  FROM gosi_monthly_records g
  WHERE g.payroll_month = p_month
    AND NOT EXISTS (
      SELECT 1 FROM payroll_records pr
      JOIN employees e ON e.id = pr.employee_id
      WHERE pr.payroll_month = p_month
        AND pr.employee_id = g.employee_id
        AND COALESCE(pr.bank_portion, 0) > 0
    );

  RETURN jsonb_build_object(
    'month',               p_month,
    'wps_count',           COALESCE(v_wps_count, 0),
    'gosi_count',          COALESCE(v_gosi_count, 0),
    'matched',             COALESCE(v_wps_count, 0) = COALESCE(v_gosi_count, 0),
    'in_wps_not_gosi',     COALESCE(v_in_wps_not_gosi, '[]'::JSONB),
    'in_gosi_not_wps',     COALESCE(v_in_gosi_not_wps, '[]'::JSONB),
    'ready_to_submit',     COALESCE(v_wps_count, 0) = COALESCE(v_gosi_count, 0)
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────
-- 12. EXPAT JOINING / LEAVING PRO-RATA FUNCTION
-- ─────────────────────────────────────────────────────────────────────
-- Returns salary breakdown applying EXPAT-specific rules:
--   Joining before 10th  → deduct Basic for join-days only; Housing+Transport full
--   Joining on/after 10th → all components pro-rated
--   Leaving: depends on tenure tier (see rules below)

CREATE OR REPLACE FUNCTION calculate_expat_salary(
  p_employee_id   UUID,
  p_month         TEXT    DEFAULT TO_CHAR(CURRENT_DATE, 'YYYY-MM'),
  p_join_date     DATE    DEFAULT NULL,
  p_leave_date    DATE    DEFAULT NULL,
  p_years_service NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_emp          RECORD;
  v_month_start  DATE := TO_DATE(p_month || '-01', 'YYYY-MM-DD');
  v_month_end    DATE := (v_month_start + INTERVAL '1 month - 1 day')::DATE;
  v_basic        NUMERIC(12,2);
  v_housing      NUMERIC(12,2);
  v_transport    NUMERIC(12,2);
  v_basic_days   INT   := 30;
  v_pay_basic    NUMERIC(12,2);
  v_pay_housing  NUMERIC(12,2);
  v_pay_transport NUMERIC(12,2);
  v_rule_applied TEXT;
BEGIN
  SELECT * INTO v_emp FROM employees WHERE id = p_employee_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','Employee not found');
  END IF;

  v_basic     := COALESCE(v_emp.basic_salary, 0);
  v_housing   := COALESCE(v_emp.housing_allowance, 0);
  v_transport := COALESCE(v_emp.transport_allowance, 0);

  -- ── JOINING MID-MONTH ────────────────────────────────────────────
  IF p_join_date IS NOT NULL AND p_leave_date IS NULL THEN
    v_basic_days := (v_month_end - p_join_date) + 1;

    IF EXTRACT(DAY FROM p_join_date) < 10 THEN
      -- Joined before 10th: only Basic is deducted for join days; Housing+Transport full
      v_pay_basic     := ROUND(v_basic     / 30.0 * v_basic_days, 2);
      v_pay_housing   := v_housing;
      v_pay_transport := v_transport;
      v_rule_applied  := 'JOIN_BEFORE_10TH: Basic pro-rated, Housing+Transport full';
    ELSE
      -- Joined on/after 10th: all components pro-rated
      v_pay_basic     := ROUND(v_basic     / 30.0 * v_basic_days, 2);
      v_pay_housing   := ROUND(v_housing   / 30.0 * v_basic_days, 2);
      v_pay_transport := ROUND(v_transport / 30.0 * v_basic_days, 2);
      v_rule_applied  := 'JOIN_ON_OR_AFTER_10TH: All components pro-rated';
    END IF;

  -- ── LEAVING MID-MONTH ────────────────────────────────────────────
  ELSIF p_leave_date IS NOT NULL AND p_join_date IS NULL THEN
    v_basic_days := (p_leave_date - v_month_start) + 1;

    IF COALESCE(p_years_service, 0) >= 10 THEN
      -- 10+ years: full month regardless of leave date
      v_pay_basic     := v_basic;
      v_pay_housing   := v_housing;
      v_pay_transport := v_transport;
      v_rule_applied  := 'LEAVING_10PLUS_YEARS: Full month salary regardless of date';

    ELSIF COALESCE(p_years_service, 0) >= 5 THEN
      -- 5–10 years, leaving after 10th: only Basic deducted
      v_pay_basic     := ROUND(v_basic / 30.0 * v_basic_days, 2);
      v_pay_housing   := v_housing;
      v_pay_transport := v_transport;
      v_rule_applied  := 'LEAVING_5_10_YEARS: Basic pro-rated only; Housing+Transport full';

    ELSE
      -- Under 5 years: Basic+Transport merged and pro-rated; Housing full
      v_pay_basic     := ROUND((v_basic + v_transport) / 30.0 * v_basic_days, 2);
      v_pay_housing   := v_housing;
      v_pay_transport := 0;   -- merged into basic above
      v_rule_applied  := 'LEAVING_UNDER_5_YEARS: (Basic+Transport) pro-rated; Housing full; Transport merged';
    END IF;

  -- ── FULL MONTH ───────────────────────────────────────────────────
  ELSE
    v_pay_basic     := v_basic;
    v_pay_housing   := v_housing;
    v_pay_transport := v_transport;
    v_rule_applied  := 'FULL_MONTH: No pro-rata';
  END IF;

  RETURN jsonb_build_object(
    'employee_id',     p_employee_id,
    'month',           p_month,
    'rule_applied',    v_rule_applied,
    'days',            v_basic_days,
    'basic_pay',       v_pay_basic,
    'housing_pay',     v_pay_housing,
    'transport_pay',   v_pay_transport,
    'total',           v_pay_basic + v_pay_housing + v_pay_transport
  );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────
-- 13. PAYMENT DATE HELPER FUNCTION
-- ─────────────────────────────────────────────────────────────────────
-- Saudi weekend: Friday (5) and Saturday (6)
-- Working days: Sunday (0) through Thursday (4)

CREATE OR REPLACE FUNCTION saudi_working_date(
  p_date      DATE,
  p_direction TEXT DEFAULT 'BEFORE'   -- 'BEFORE' moves to prev working day, 'AFTER' to next
)
RETURNS DATE
LANGUAGE plpgsql AS $$
DECLARE
  v_dow  INT;
  v_date DATE := p_date;
BEGIN
  LOOP
    v_dow := EXTRACT(DOW FROM v_date);  -- 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
    IF v_dow NOT IN (5, 6) THEN        -- not Fri or Sat → working day
      RETURN v_date;
    END IF;
    IF p_direction = 'BEFORE' THEN
      v_date := v_date - 1;
    ELSE
      v_date := v_date + 1;
    END IF;
  END LOOP;
END;
$$;

-- Helper: get WPS payment date for a given month (30th adjusted)
CREATE OR REPLACE FUNCTION wps_payment_date(p_month TEXT)
RETURNS DATE
LANGUAGE plpgsql AS $$
DECLARE
  v_year   INT := EXTRACT(YEAR  FROM TO_DATE(p_month || '-01', 'YYYY-MM-DD'));
  v_mon    INT := EXTRACT(MONTH FROM TO_DATE(p_month || '-01', 'YYYY-MM-DD'));
  v_target DATE;
BEGIN
  -- Payment = last day of month (handles Feb naturally)
  v_target := (DATE_TRUNC('month', TO_DATE(p_month || '-01', 'YYYY-MM-DD'))
               + INTERVAL '1 month - 1 day')::DATE;
  -- Adjust for weekends: move BEFORE to Thursday if Fri/Sat
  RETURN saudi_working_date(v_target, 'BEFORE');
END;
$$;

-- Helper: get Mudad due date for a given payroll month
-- Due 5th of FOLLOWING month; if Fri/Sat → next Sunday (AFTER)
CREATE OR REPLACE FUNCTION mudad_due_date(p_month TEXT)
RETURNS DATE
LANGUAGE plpgsql AS $$
DECLARE
  v_next_month DATE := (TO_DATE(p_month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month')::DATE;
  v_fifth      DATE := v_next_month + 4;  -- 5th of next month
  v_dow        INT  := EXTRACT(DOW FROM v_fifth);
BEGIN
  IF v_dow IN (5, 6) THEN
    RETURN saudi_working_date(v_fifth, 'AFTER');  -- next Sunday
  END IF;
  RETURN v_fifth;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────
-- 14. SCE EXPIRY ALERTS VIEW
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW sce_expiry_alerts AS
SELECT
  e.id,
  e.employee_code,
  e.full_name,
  e.department,
  e.employee_category,
  e.sce_number,
  e.sce_category,
  e.sce_expiry_date,
  e.sce_status,
  (e.sce_expiry_date - CURRENT_DATE)               AS days_until_expiry,
  CASE
    WHEN e.sce_expiry_date < CURRENT_DATE           THEN 'EXPIRED'
    WHEN (e.sce_expiry_date - CURRENT_DATE) <= 60   THEN 'CRITICAL'
    WHEN (e.sce_expiry_date - CURRENT_DATE) <= 90   THEN 'WARNING'
    ELSE                                                  'OK'
  END                                              AS alert_level,
  'SCE expiry blocks Iqama renewal'               AS blocker_note
FROM employees e
WHERE e.sce_required = true
  AND e.is_active = true
ORDER BY e.sce_expiry_date ASC;


-- ─────────────────────────────────────────────────────────────────────
-- 15. IQAMA + SCE COMBINED EXPIRY ALERTS VIEW
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW iqama_expiry_alerts AS
SELECT
  e.id,
  e.employee_code,
  e.full_name,
  e.department,
  e.nationality,
  e.employee_category,
  e.iqama_number,
  e.iqama_expiry_date,
  (e.iqama_expiry_date - CURRENT_DATE)             AS iqama_days_left,
  CASE
    WHEN e.iqama_expiry_date < CURRENT_DATE         THEN 'EXPIRED'
    WHEN (e.iqama_expiry_date - CURRENT_DATE) <= 30 THEN 'CRITICAL'
    WHEN (e.iqama_expiry_date - CURRENT_DATE) <= 60 THEN 'WARNING'
    WHEN (e.iqama_expiry_date - CURRENT_DATE) <= 90 THEN 'NOTICE'
    ELSE                                                  'OK'
  END                                              AS iqama_alert,
  -- SCE blocker check
  e.sce_required,
  e.sce_expiry_date,
  e.sce_status,
  CASE
    WHEN e.sce_required AND e.sce_expiry_date < CURRENT_DATE
      THEN 'BLOCKER: SCE expired — Iqama cannot be renewed until SCE renewed'
    WHEN e.sce_required AND (e.sce_expiry_date - CURRENT_DATE) <= 60
      THEN 'WARNING: SCE expiring soon — renew before Iqama renewal'
    ELSE NULL
  END                                              AS sce_blocker
FROM employees e
WHERE e.is_active = true
  AND e.employee_category IN ('01','02')
ORDER BY e.iqama_expiry_date ASC;


-- ─────────────────────────────────────────────────────────────────────
-- 16. SEED PAYROLL CALENDAR — Sep–Dec 2026
-- ─────────────────────────────────────────────────────────────────────

INSERT INTO payroll_calendar
  (payroll_month, processing_date, wps_payment_date, mudad_due_date)
VALUES
  -- Sep 2026: 30th is Wed ✓ / 5th Oct is Mon ✓
  ('2026-09', '2026-09-28', wps_payment_date('2026-09'), mudad_due_date('2026-09')),
  -- Oct 2026: 30th is Fri → Thu 29th / 5th Nov is Thu ✓
  ('2026-10', '2026-10-28', wps_payment_date('2026-10'), mudad_due_date('2026-10')),
  -- Nov 2026: 30th is Mon ✓ / 5th Dec is Sat → Sun 6th
  ('2026-11', '2026-11-28', wps_payment_date('2026-11'), mudad_due_date('2026-11')),
  -- Dec 2026: 31st is Thu ✓ / 5th Jan is Tue ✓
  ('2026-12', '2026-12-28', wps_payment_date('2026-12'), mudad_due_date('2026-12'))
ON CONFLICT (payroll_month) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────
-- 17. INDEXES FOR PERFORMANCE
-- ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_emp_category   ON employees (employee_category);
CREATE INDEX IF NOT EXISTS idx_emp_entity     ON employees (entity_code);
CREATE INDEX IF NOT EXISTS idx_emp_sce_expiry ON employees (sce_expiry_date) WHERE sce_required = true;
CREATE INDEX IF NOT EXISTS idx_emp_iqama_exp  ON employees (iqama_expiry_date) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_emp_periods    ON employment_periods (employee_id, status);
CREATE INDEX IF NOT EXISTS idx_gosi_month     ON gosi_monthly_records (payroll_month);
CREATE INDEX IF NOT EXISTS idx_wps_month      ON wps_submissions (payroll_month);
CREATE INDEX IF NOT EXISTS idx_mudad_month    ON mudad_submissions (payroll_month);
CREATE INDEX IF NOT EXISTS idx_eosb_emp       ON eosb_records (employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_cat    ON payroll_records (employee_category, payroll_month);

-- ─────────────────────────────────────────────────────────────────────
-- END OF MIGRATION
-- ─────────────────────────────────────────────────────────────────────
-- Quick verification queries (run after migration):
--
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'employees' AND column_name LIKE '%gosi%';
--
-- SELECT * FROM sce_expiry_alerts LIMIT 5;
-- SELECT * FROM iqama_expiry_alerts LIMIT 5;
--
-- SELECT calculate_eosb('<employee-uuid>', '2026-09-30');
-- SELECT calculate_pro_rata(3500, '2026-09', '2026-09-11', NULL);
-- SELECT validate_mudad_gosi_count('2026-09');
-- SELECT wps_payment_date('2026-09'), mudad_due_date('2026-09');
-- =====================================================================
