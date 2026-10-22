-- ============================================================
--  MASTER FIX PATCH — Ratal Group ERP
--  Run this entire file in Supabase SQL Editor (one shot).
--  Safe to re-run — all statements are idempotent.
--
--  Fixes found during codebase audit (August 2026):
--   §1  overtime_requests table (was called overtime_submissions in schema.sql
--       but ALL app code uses overtime_requests — table was missing)
--   §2  payroll_runs + payroll_items tables (Payroll.jsx needs them)
--   §3  employee column gaps (mobile_allowance, medical_allowance,
--       employee_number uniqueness, cash_portion backfill guard)
--   §4  Chart of Accounts — missing ledger codes (ANB-13, CLR, INT,
--       EXP-005/006, GOV-001→010)
--   §5  leave_balances table (LeaveBalance.jsx page)
--   §6  notifications table (in-app notification system)
--   §7  ot_authorizations table (ADM-OTA — pre-approval for >40 hrs OT)
--   §8  system_config table (ADM-CFG — food rate, USD rate, OT cap, etc.)
--   §9  Retention columns on purchase_orders and invoices
--   §10 RLS — chart_of_accounts was missing UPDATE/DELETE policies
--   §11 Auto-number sequence for overtime_requests
--   §12 Indexes
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- §1  OVERTIME REQUESTS
--     Base schema.sql created "overtime_submissions" but every
--     page (Overtime.jsx, Approvals.jsx, Payroll.jsx, CashFlow.jsx,
--     SelfService.jsx, FormOvertime.jsx) uses "overtime_requests".
--     Create the correct table; leave overtime_submissions intact
--     in case it has data.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS overtime_requests (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id        UUID REFERENCES entities(id) ON DELETE CASCADE,
  request_number   TEXT,
  ot_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Employee
  employee_id      UUID REFERENCES employees(id),
  department_id    UUID REFERENCES departments(id),
  department_name  TEXT,
  contact_number   TEXT,
  -- Project / Job
  project_id       UUID REFERENCES projects(id),
  project_number   TEXT,
  project_name     TEXT,
  job_number       TEXT,
  job_type         TEXT,
  -- Time
  work_type        TEXT,                   -- FIELD WORK | OFFICE WORK | REMOTE | ON-CALL | TRAVEL DAY
  ot_type          TEXT DEFAULT 'NORMAL',  -- NORMAL | FRIDAY | HOLIDAY | TRAVEL
  from_time        TIME,
  to_time          TIME,
  hours            NUMERIC(5,2) DEFAULT 0,
  -- Calculation  (multiplier is always 1.5 per design — all categories)
  ot_rate          NUMERIC(12,2) DEFAULT 0,   -- Basic ÷ 30 ÷ 8 (hourly base)
  multiplier       NUMERIC(4,2)  DEFAULT 1.5,  -- 1.0 for TRAVEL category, 1.5 for all others
  total_amount     NUMERIC(12,2) DEFAULT 0,    -- hours × ot_rate × multiplier
  -- Location
  gps_lat          NUMERIC(10,6),
  gps_lng          NUMERIC(10,6),
  -- Admin
  reason           TEXT,
  remarks          TEXT,
  status           TEXT DEFAULT 'SUBMITTED',   -- SUBMITTED | PENDING | APPROVED | REJECTED
  approved_by      UUID REFERENCES employees(id),
  approved_date    DATE,
  -- Payroll link
  payroll_month    TEXT,                        -- YYYY-MM
  payroll_included BOOLEAN DEFAULT FALSE,
  -- Site link
  site_master_id   UUID REFERENCES site_masters(id),
  sm_id            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE overtime_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'auth_ot_requests' AND tablename = 'overtime_requests'
  ) THEN
    CREATE POLICY "auth_ot_requests" ON overtime_requests
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ALTER TABLE guards for overtime_requests:
-- The table likely exists from an earlier migration but may be missing these columns.
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS entity_id        UUID REFERENCES entities(id) ON DELETE CASCADE;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS request_number   TEXT;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS ot_date          DATE DEFAULT CURRENT_DATE;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS employee_id      UUID REFERENCES employees(id);
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS department_id    UUID REFERENCES departments(id);
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS department_name  TEXT;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS contact_number   TEXT;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS project_id       UUID REFERENCES projects(id);
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS project_number   TEXT;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS project_name     TEXT;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS job_number       TEXT;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS job_type         TEXT;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS work_type        TEXT;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS ot_type          TEXT DEFAULT 'NORMAL';
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS from_time        TIME;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS to_time          TIME;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS hours            NUMERIC(5,2) DEFAULT 0;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS ot_rate          NUMERIC(12,2) DEFAULT 0;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS multiplier       NUMERIC(4,2) DEFAULT 1.5;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS total_amount     NUMERIC(12,2) DEFAULT 0;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS gps_lat          NUMERIC(10,6);
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS gps_lng          NUMERIC(10,6);
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS reason           TEXT;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS remarks          TEXT;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'SUBMITTED';
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS approved_by      UUID REFERENCES employees(id);
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS approved_date    DATE;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS payroll_month    TEXT;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS payroll_included BOOLEAN DEFAULT FALSE;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS site_master_id   UUID;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS sm_id            TEXT;
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS created_at       TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ot_req_entity_date ON overtime_requests(entity_id, ot_date DESC);
CREATE INDEX IF NOT EXISTS idx_ot_req_employee     ON overtime_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_ot_req_status       ON overtime_requests(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_ot_req_payroll      ON overtime_requests(entity_id, payroll_month, payroll_included);

-- Auto-number trigger
CREATE SEQUENCE IF NOT EXISTS seq_ot_request START 1;

CREATE OR REPLACE FUNCTION gen_ot_request_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.request_number IS NULL THEN
    NEW.request_number := 'OT-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                          LPAD(nextval('seq_ot_request')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ot_request_number ON overtime_requests;
CREATE TRIGGER trg_ot_request_number
  BEFORE INSERT ON overtime_requests
  FOR EACH ROW EXECUTE FUNCTION gen_ot_request_number();

-- ────────────────────────────────────────────────────────────
-- §2  PAYROLL RUNS + PAYROLL ITEMS
--     Payroll.jsx creates a payroll_runs header then inserts
--     per-employee payroll_items rows.  Neither table existed.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_runs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  payroll_month         TEXT NOT NULL,            -- YYYY-MM
  run_date              DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Totals (denormalised for quick dashboard reads)
  total_basic           NUMERIC(14,2) DEFAULT 0,
  total_allowances      NUMERIC(14,2) DEFAULT 0,
  total_ot              NUMERIC(14,2) DEFAULT 0,
  total_gosi            NUMERIC(14,2) DEFAULT 0,
  total_loan_deductions NUMERIC(14,2) DEFAULT 0,
  total_penalties       NUMERIC(14,2) DEFAULT 0,
  total_deductions      NUMERIC(14,2) DEFAULT 0,
  total_net             NUMERIC(14,2) DEFAULT 0,
  employee_count        INT DEFAULT 0,
  status                TEXT DEFAULT 'DRAFT',     -- DRAFT | APPROVED | PAID | CANCELLED
  approved_by           UUID REFERENCES employees(id),
  approved_at           TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, payroll_month)
);

-- ALTER TABLE guards: if payroll_runs already existed without these columns, add them now
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS entity_id             UUID REFERENCES entities(id) ON DELETE CASCADE;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS payroll_month         TEXT;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS run_date              DATE DEFAULT CURRENT_DATE;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS total_basic           NUMERIC(14,2) DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS total_allowances      NUMERIC(14,2) DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS total_ot              NUMERIC(14,2) DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS total_gosi            NUMERIC(14,2) DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS total_loan_deductions NUMERIC(14,2) DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS total_penalties       NUMERIC(14,2) DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS total_deductions      NUMERIC(14,2) DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS total_net             NUMERIC(14,2) DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS employee_count        INT DEFAULT 0;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS status                TEXT DEFAULT 'DRAFT';
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS approved_by           UUID REFERENCES employees(id);
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS approved_at           TIMESTAMPTZ;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS notes                 TEXT;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS created_at            TIMESTAMPTZ DEFAULT NOW();

-- Add unique constraint only if both columns exist and no duplicates
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payroll_runs_entity_id_payroll_month_key'
  ) THEN
    BEGIN
      ALTER TABLE payroll_runs ADD CONSTRAINT payroll_runs_entity_id_payroll_month_key
        UNIQUE (entity_id, payroll_month);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not add unique constraint on payroll_runs — duplicate data exists. Clean up first.';
    END;
  END IF;
END $$;

ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'auth_payroll_runs' AND tablename = 'payroll_runs'
  ) THEN
    CREATE POLICY "auth_payroll_runs" ON payroll_runs
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payroll_runs_entity  ON payroll_runs(entity_id, payroll_month DESC);

-- ─── Payroll Items ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id        UUID NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id           UUID NOT NULL REFERENCES employees(id),
  -- Earnings
  basic_salary          NUMERIC(12,2) DEFAULT 0,   -- bank portion (WPS)
  cash_portion          NUMERIC(12,2) DEFAULT 0,   -- cash salary amount
  housing_allowance     NUMERIC(12,2) DEFAULT 0,
  transport_allowance   NUMERIC(12,2) DEFAULT 0,
  mobile_allowance      NUMERIC(12,2) DEFAULT 0,
  medical_allowance     NUMERIC(12,2) DEFAULT 0,
  technical_allowance   NUMERIC(12,2) DEFAULT 0,
  food_allowance        NUMERIC(12,2) DEFAULT 0,
  other_allowance       NUMERIC(12,2) DEFAULT 0,
  ot_amount             NUMERIC(12,2) DEFAULT 0,
  gross_salary          NUMERIC(12,2) DEFAULT 0,
  -- GOSI
  gosi_amount           NUMERIC(12,2) DEFAULT 0,
  -- Deductions
  loan_deduction        NUMERIC(12,2) DEFAULT 0,
  penalty_deduction     NUMERIC(12,2) DEFAULT 0,
  deductions            NUMERIC(12,2) DEFAULT 0,
  -- Net
  net_salary            NUMERIC(12,2) DEFAULT 0,
  -- Banking (snapshot at time of run)
  bank_name             TEXT,
  iban                  TEXT,
  -- Status
  status                TEXT DEFAULT 'DRAFT',   -- DRAFT | PAID
  payment_date          DATE,
  payment_reference     TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ALTER TABLE guards: if payroll_items already existed without these columns, add them now
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS payroll_run_id      UUID REFERENCES payroll_runs(id) ON DELETE CASCADE;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS employee_id         UUID REFERENCES employees(id);
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS basic_salary        NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS cash_portion        NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS housing_allowance   NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS transport_allowance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS mobile_allowance    NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS medical_allowance   NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS technical_allowance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS food_allowance      NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS other_allowance     NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS ot_amount           NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS gross_salary        NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS gosi_amount         NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS loan_deduction      NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS penalty_deduction   NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS deductions          NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS net_salary          NUMERIC(12,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS bank_name           TEXT;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS iban                TEXT;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS status              TEXT DEFAULT 'DRAFT';
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS payment_date        DATE;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS payment_reference   TEXT;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'auth_payroll_items' AND tablename = 'payroll_items'
  ) THEN
    CREATE POLICY "auth_payroll_items" ON payroll_items
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payroll_items_run      ON payroll_items(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_employee ON payroll_items(employee_id);

-- ────────────────────────────────────────────────────────────
-- §3  EMPLOYEE COLUMN GAPS
-- ────────────────────────────────────────────────────────────

-- Salary breakdown columns (Payroll.jsx reads all of these)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS mobile_allowance    NUMERIC(12,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS medical_allowance   NUMERIC(12,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS other_allowance     NUMERIC(12,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS cash_portion        NUMERIC(12,2) DEFAULT 0;

-- employee_number uniqueness (employees_dept_patch may or may not have added it)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_number     VARCHAR(30);

-- OT / food eligibility flags (forms used these for filtering — default TRUE = everyone eligible)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS ot_allowed              BOOLEAN DEFAULT TRUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS ot_eligible             BOOLEAN DEFAULT TRUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS food_allowance_eligible BOOLEAN DEFAULT TRUE;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employees_employee_number_key'
  ) THEN
    -- Only add unique constraint if there are no duplicates
    IF (SELECT COUNT(*) FROM (
          SELECT employee_number FROM employees
          WHERE employee_number IS NOT NULL
          GROUP BY employee_number HAVING COUNT(*) > 1
        ) dups) = 0 THEN
      ALTER TABLE employees ADD CONSTRAINT employees_employee_number_key UNIQUE (employee_number);
    END IF;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- §4  CHART OF ACCOUNTS — missing ledger codes
--     Per agreed design: ANB-13 (RAT), CLR-001/002 (cash custodian
--     clearing), INT-001→005 (intercompany), EXP-005/006, GOV-001→010
-- ────────────────────────────────────────────────────────────

-- Find the ACCSYS, RAT, GWT entity IDs for entity-scoped accounts
-- We insert NULL entity_id = shared / visible to all entities
-- Entity-specific bank accounts have entity_id set

-- Use WHERE NOT EXISTS instead of ON CONFLICT because the unique constraint is on
-- (entity_id, account_code) and entity_id IS NULL for shared accounts.
-- NULL != NULL in unique constraints so ON CONFLICT (account_code) won't match.

DO $$ BEGIN

  -- ANB-13 (RAT secondary account — missing from original seed)
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = 'ANB-13' AND entity_id IS NULL) THEN
    INSERT INTO chart_of_accounts (account_code, account_name, account_name_ar, account_type, is_active)
    VALUES ('ANB-13', 'ANB Account - RAT Secondary', 'حساب البنك الأهلي - رتال (ثانوي)', 'BANK', TRUE);
  END IF;

  -- Clearing accounts (cash custodian — Ahmed & Rashad)
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = 'CLR-001' AND entity_id IS NULL) THEN
    INSERT INTO chart_of_accounts (account_code, account_name, account_name_ar, account_type, is_active)
    VALUES ('CLR-001', 'Cash Custodian Clearing - Ahmed', 'حساب تسوية الأمين النقدي - أحمد', 'CLEARING', TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = 'CLR-002' AND entity_id IS NULL) THEN
    INSERT INTO chart_of_accounts (account_code, account_name, account_name_ar, account_type, is_active)
    VALUES ('CLR-002', 'Cash Custodian Clearing - Rashad', 'حساب تسوية الأمين النقدي - رشاد', 'CLEARING', TRUE);
  END IF;

  -- Intercompany accounts
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = 'INT-001' AND entity_id IS NULL) THEN
    INSERT INTO chart_of_accounts (account_code, account_name, account_name_ar, account_type, is_active)
    VALUES ('INT-001', 'Intercompany - RAT / GWT', 'حساب بيني - رتال / أجنحة خضراء', 'INTERNAL', TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = 'INT-002' AND entity_id IS NULL) THEN
    INSERT INTO chart_of_accounts (account_code, account_name, account_name_ar, account_type, is_active)
    VALUES ('INT-002', 'Intercompany - RAT / ACCSYS', 'حساب بيني - رتال / أكسيس', 'INTERNAL', TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = 'INT-003' AND entity_id IS NULL) THEN
    INSERT INTO chart_of_accounts (account_code, account_name, account_name_ar, account_type, is_active)
    VALUES ('INT-003', 'Intercompany - GWT / ACCSYS', 'حساب بيني - أجنحة / أكسيس', 'INTERNAL', TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = 'INT-004' AND entity_id IS NULL) THEN
    INSERT INTO chart_of_accounts (account_code, account_name, account_name_ar, account_type, is_active)
    VALUES ('INT-004', 'Intercompany - Group Treasury', 'خزينة المجموعة', 'INTERNAL', TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = 'INT-005' AND entity_id IS NULL) THEN
    INSERT INTO chart_of_accounts (account_code, account_name, account_name_ar, account_type, is_active)
    VALUES ('INT-005', 'Intercompany - Suspense', 'حساب بيني معلق', 'INTERNAL', TRUE);
  END IF;

  -- Expense accounts (EXP-005/006 were missing)
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = 'EXP-005' AND entity_id IS NULL) THEN
    INSERT INTO chart_of_accounts (account_code, account_name, account_name_ar, account_type, is_active)
    VALUES ('EXP-005', 'Petty Cash Expenses', 'مصروفات الصندوق النثري', 'EXPENSE', TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = 'EXP-006' AND entity_id IS NULL) THEN
    INSERT INTO chart_of_accounts (account_code, account_name, account_name_ar, account_type, is_active)
    VALUES ('EXP-006', 'General & Administrative', 'مصروفات عمومية وإدارية', 'EXPENSE', TRUE);
  END IF;

  -- Government / regulatory accounts (GOV-001→006 and GOV-010 were missing)
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = 'GOV-001' AND entity_id IS NULL) THEN
    INSERT INTO chart_of_accounts (account_code, account_name, account_name_ar, account_type, is_active)
    VALUES ('GOV-001', 'GOSI Payable - Saudi', 'مستحقات التأمينات - سعودي', 'GOVERNMENT', TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = 'GOV-002' AND entity_id IS NULL) THEN
    INSERT INTO chart_of_accounts (account_code, account_name, account_name_ar, account_type, is_active)
    VALUES ('GOV-002', 'GOSI Payable - Expat', 'مستحقات التأمينات - وافد', 'GOVERNMENT', TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = 'GOV-003' AND entity_id IS NULL) THEN
    INSERT INTO chart_of_accounts (account_code, account_name, account_name_ar, account_type, is_active)
    VALUES ('GOV-003', 'Iqama Renewal Reserve', 'احتياطي تجديد الإقامة', 'GOVERNMENT', TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = 'GOV-004' AND entity_id IS NULL) THEN
    INSERT INTO chart_of_accounts (account_code, account_name, account_name_ar, account_type, is_active)
    VALUES ('GOV-004', 'Exit / Re-entry Reserve', 'احتياطي تأشيرة الخروج والعودة', 'GOVERNMENT', TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = 'GOV-005' AND entity_id IS NULL) THEN
    INSERT INTO chart_of_accounts (account_code, account_name, account_name_ar, account_type, is_active)
    VALUES ('GOV-005', 'Work Permit Reserve', 'احتياطي تصاريح العمل', 'GOVERNMENT', TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = 'GOV-006' AND entity_id IS NULL) THEN
    INSERT INTO chart_of_accounts (account_code, account_name, account_name_ar, account_type, is_active)
    VALUES ('GOV-006', 'Muqeem / QIWA Fees', 'رسوم مقيم وقوى', 'GOVERNMENT', TRUE);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE account_code = 'GOV-010' AND entity_id IS NULL) THEN
    INSERT INTO chart_of_accounts (account_code, account_name, account_name_ar, account_type, is_active)
    VALUES ('GOV-010', 'End-of-Service Provision', 'مخصص مكافأة نهاية الخدمة', 'GOVERNMENT', TRUE);
  END IF;

END $$;

-- Also ensure the COA unique constraint is on (entity_id, account_code)
-- The base schema had no unique constraint at all; phase1 added UNIQUE(entity_id, account_code)
-- phase6 attempted to normalise but may conflict. Make it safe:
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chart_of_accounts_account_code_key'
      AND contype = 'u'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chart_of_accounts_entity_id_account_code_key'
  ) THEN
    -- Add a partial unique on account_code where entity_id IS NULL (shared codes)
    -- Entity-specific codes use (entity_id, account_code)
    CREATE UNIQUE INDEX IF NOT EXISTS idx_coa_code_unique
      ON chart_of_accounts(account_code)
      WHERE entity_id IS NULL;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- §5  LEAVE BALANCES TABLE
--     LeaveBalance.jsx exists but there was no backing table.
--     We track per-employee per-year leave balance.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_balances (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  employee_id       UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_year        INT NOT NULL,                    -- calendar year e.g. 2026
  -- Annual Leave
  annual_entitlement NUMERIC(5,1) DEFAULT 30,        -- 30 days per agreed design
  annual_used        NUMERIC(5,1) DEFAULT 0,
  annual_balance     NUMERIC(5,1) GENERATED ALWAYS AS (annual_entitlement - annual_used) STORED,
  -- Emergency Leave
  emergency_entitlement NUMERIC(5,1) DEFAULT 15,
  emergency_used        NUMERIC(5,1) DEFAULT 0,
  emergency_balance     NUMERIC(5,1) GENERATED ALWAYS AS (emergency_entitlement - emergency_used) STORED,
  -- Carry-over (manually added by Admin for exceptional cases)
  carry_over_days    NUMERIC(5,1) DEFAULT 0,
  carry_over_note    TEXT,
  carry_over_added_by UUID REFERENCES employees(id),
  carry_over_added_at TIMESTAMPTZ,
  -- Metadata
  last_recalculated  TIMESTAMPTZ DEFAULT NOW(),
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, employee_id, leave_year)
);

ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'auth_leave_balances' AND tablename = 'leave_balances'
  ) THEN
    CREATE POLICY "auth_leave_balances" ON leave_balances
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leave_bal_entity_year ON leave_balances(entity_id, leave_year);
CREATE INDEX IF NOT EXISTS idx_leave_bal_employee    ON leave_balances(employee_id, leave_year);

-- ────────────────────────────────────────────────────────────
-- §6  NOTIFICATIONS TABLE (in-app notification system)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     UUID REFERENCES entities(id) ON DELETE CASCADE,
  -- Recipient
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id   UUID REFERENCES employees(id),
  -- Content
  title         TEXT NOT NULL,
  body          TEXT,
  icon          TEXT DEFAULT '🔔',
  link_type     TEXT,          -- module key: 'money_requests' | 'overtime' | 'loans' etc.
  link_id       UUID,          -- record UUID to navigate to
  -- Delivery channels
  channel       TEXT DEFAULT 'IN_APP',   -- IN_APP | TELEGRAM | EMAIL
  -- State
  is_read       BOOLEAN DEFAULT FALSE,
  read_at       TIMESTAMPTZ,
  -- Telegram
  telegram_sent BOOLEAN DEFAULT FALSE,
  telegram_sent_at TIMESTAMPTZ,
  -- Source
  triggered_by  UUID REFERENCES auth.users(id),
  event_type    TEXT,          -- LOAN_APPROVED | OT_APPROVED | MR_PAID | PAYSLIP_READY etc.
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'auth_notifications_own' AND tablename = 'notifications'
  ) THEN
    CREATE POLICY "auth_notifications_own" ON notifications
      FOR ALL USING (
        user_id = auth.uid()
        OR (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('SUPERADMIN','ADMIN')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notif_user_unread ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_entity      ON notifications(entity_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- §7  OT AUTHORIZATIONS (ADM-OTA)
--     Pre-approval required when an employee's OT exceeds 40 hrs
--     in a given OT period (resets 25th each month, Dec→31 Dec).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ot_authorizations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  auth_number     TEXT,                             -- OTA-YYYY-NNNN
  ot_period       TEXT NOT NULL,                    -- YYYY-MM (period the auth covers)
  employee_id     UUID NOT NULL REFERENCES employees(id),
  department_id   UUID REFERENCES departments(id),
  department_name TEXT,
  -- Current period hours already consumed
  hours_used      NUMERIC(5,2) DEFAULT 0,
  -- Additional hours being authorized (above 40-hr cap)
  hours_requested NUMERIC(5,2) NOT NULL,
  hours_approved  NUMERIC(5,2) DEFAULT 0,
  -- Justification
  reason          TEXT NOT NULL,
  project_id      UUID REFERENCES projects(id),
  project_name    TEXT,
  -- Approvals
  requested_by    UUID REFERENCES employees(id),
  dh_approved_by  UUID REFERENCES employees(id),
  dh_approved_at  TIMESTAMPTZ,
  pm_approved_by  UUID REFERENCES employees(id),
  pm_approved_at  TIMESTAMPTZ,
  -- Status
  status          TEXT DEFAULT 'PENDING',  -- PENDING | DH_APPROVED | APPROVED | REJECTED
  rejection_note  TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ot_authorizations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'auth_ot_auth' AND tablename = 'ot_authorizations'
  ) THEN
    CREATE POLICY "auth_ot_auth" ON ot_authorizations
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS seq_ot_authorization START 1;

CREATE OR REPLACE FUNCTION gen_ot_auth_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.auth_number IS NULL THEN
    NEW.auth_number := 'OTA-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                       LPAD(nextval('seq_ot_authorization')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ot_auth_number ON ot_authorizations;
CREATE TRIGGER trg_ot_auth_number
  BEFORE INSERT ON ot_authorizations
  FOR EACH ROW EXECUTE FUNCTION gen_ot_auth_number();

CREATE INDEX IF NOT EXISTS idx_ota_entity_period ON ot_authorizations(entity_id, ot_period);
CREATE INDEX IF NOT EXISTS idx_ota_employee      ON ot_authorizations(employee_id, ot_period);

-- ────────────────────────────────────────────────────────────
-- §8  SYSTEM CONFIG TABLE (ADM-CFG)
--     entity_settings was added in phase5b but the agreed design
--     needs specific named config columns.
--     Add all agreed fields if not already present.
-- ────────────────────────────────────────────────────────────

-- Create entity_settings if it somehow doesn't exist yet
CREATE TABLE IF NOT EXISTS entity_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             UUID NOT NULL UNIQUE REFERENCES entities(id) ON DELETE CASCADE,
  -- Food Allowance
  food_daily_rate       NUMERIC(8,2)  DEFAULT 30,     -- SAR/day default (admin-configurable)
  -- Currency
  usd_rate              NUMERIC(8,4)  DEFAULT 3.75,   -- Fixed SAR/USD rate
  -- Overtime
  ot_monthly_cap        INT           DEFAULT 40,      -- hours per OT period before OTA required
  ot_period_reset_day   INT           DEFAULT 25,      -- day of month OT period resets
  -- Payroll
  payroll_cutoff_day    INT           DEFAULT 26,      -- salary cut-off day
  deduction_cap_pct     NUMERIC(5,2)  DEFAULT 25,      -- max deduction = 25% of total package
  -- Working hours
  work_start_time       TIME          DEFAULT '08:00',
  work_end_time         TIME          DEFAULT '17:00',
  -- VAT
  vat_rate              NUMERIC(5,2)  DEFAULT 15,
  -- Google Drive integration
  gdrive_folder_id      TEXT,                           -- folder ID for "Save to Drive" PDFs
  gdrive_credentials    JSONB,                          -- service-account JSON (encrypted at rest)
  -- Expense alerts
  expense_alert_petrol  NUMERIC(10,2) DEFAULT 600,     -- SAR/day alert threshold for petrol
  expense_alert_default NUMERIC(10,2) DEFAULT 500,     -- SAR/day for other categories
  -- Annual leave
  annual_leave_days     INT           DEFAULT 30,
  -- Entity info
  vat_number            TEXT,
  bank_name             TEXT,
  bank_iban             TEXT,
  bank_swift            TEXT,
  -- Audit
  updated_by            UUID REFERENCES auth.users(id),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns that may be missing from earlier version of entity_settings
ALTER TABLE entity_settings ADD COLUMN IF NOT EXISTS food_daily_rate       NUMERIC(8,2)  DEFAULT 30;
ALTER TABLE entity_settings ADD COLUMN IF NOT EXISTS usd_rate              NUMERIC(8,4)  DEFAULT 3.75;
ALTER TABLE entity_settings ADD COLUMN IF NOT EXISTS ot_monthly_cap        INT           DEFAULT 40;
ALTER TABLE entity_settings ADD COLUMN IF NOT EXISTS ot_period_reset_day   INT           DEFAULT 25;
ALTER TABLE entity_settings ADD COLUMN IF NOT EXISTS payroll_cutoff_day    INT           DEFAULT 26;
ALTER TABLE entity_settings ADD COLUMN IF NOT EXISTS deduction_cap_pct     NUMERIC(5,2)  DEFAULT 25;
ALTER TABLE entity_settings ADD COLUMN IF NOT EXISTS work_start_time       TIME          DEFAULT '08:00';
ALTER TABLE entity_settings ADD COLUMN IF NOT EXISTS work_end_time         TIME          DEFAULT '17:00';
ALTER TABLE entity_settings ADD COLUMN IF NOT EXISTS vat_rate              NUMERIC(5,2)  DEFAULT 15;
ALTER TABLE entity_settings ADD COLUMN IF NOT EXISTS gdrive_folder_id      TEXT;
ALTER TABLE entity_settings ADD COLUMN IF NOT EXISTS gdrive_credentials    JSONB;
ALTER TABLE entity_settings ADD COLUMN IF NOT EXISTS expense_alert_petrol  NUMERIC(10,2) DEFAULT 600;
ALTER TABLE entity_settings ADD COLUMN IF NOT EXISTS expense_alert_default NUMERIC(10,2) DEFAULT 500;

ALTER TABLE entity_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'auth_entity_settings' AND tablename = 'entity_settings'
  ) THEN
    CREATE POLICY "auth_entity_settings" ON entity_settings
      FOR SELECT USING (auth.uid() IS NOT NULL);
    CREATE POLICY "auth_entity_settings_write" ON entity_settings
      FOR ALL USING ((SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('SUPERADMIN','ADMIN'));
  END IF;
END $$;

-- Seed default settings for all 3 entities if not already present
INSERT INTO entity_settings (entity_id)
SELECT e.id FROM entities e
WHERE NOT EXISTS (
  SELECT 1 FROM entity_settings es WHERE es.entity_id = e.id
);

-- ────────────────────────────────────────────────────────────
-- §9  RETENTION COLUMNS ON PURCHASE ORDERS AND INVOICES
--     Agreed: PO-level retention, 10% standard,
--     incoming (contractor holds from us) + outgoing (we hold from sub-cons)
-- ────────────────────────────────────────────────────────────
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS retention_pct          NUMERIC(5,2) DEFAULT 10,
  ADD COLUMN IF NOT EXISTS retention_incoming      NUMERIC(14,2) DEFAULT 0,   -- contractor holds from us
  ADD COLUMN IF NOT EXISTS retention_outgoing      NUMERIC(14,2) DEFAULT 0,   -- we hold from sub-cons
  ADD COLUMN IF NOT EXISTS retention_released_in   NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retention_released_out  NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_invoiceable_pct     NUMERIC(5,2) DEFAULT 90;   -- 90% before retention release

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS retention_applied       NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_after_retention     NUMERIC(14,2) DEFAULT 0;

-- ────────────────────────────────────────────────────────────
-- §10  CHART OF ACCOUNTS RLS — add missing UPDATE/DELETE policies
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'coa_update' AND tablename = 'chart_of_accounts'
  ) THEN
    CREATE POLICY "coa_update" ON chart_of_accounts
      FOR UPDATE USING ((SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('SUPERADMIN','ADMIN'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'coa_delete' AND tablename = 'chart_of_accounts'
  ) THEN
    CREATE POLICY "coa_delete" ON chart_of_accounts
      FOR DELETE USING ((SELECT role FROM user_profiles WHERE id = auth.uid()) = 'SUPERADMIN');
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- §11  AUDIT LOG — add overtime_requests to audit triggers
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='audit_logs') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_overtime_requests') THEN
      EXECUTE '
        CREATE TRIGGER audit_overtime_requests
          AFTER INSERT OR UPDATE OR DELETE ON overtime_requests
          FOR EACH ROW EXECUTE FUNCTION log_audit_event()';
      RAISE NOTICE 'Created audit trigger on overtime_requests';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_payroll_runs') THEN
      EXECUTE '
        CREATE TRIGGER audit_payroll_runs
          AFTER INSERT OR UPDATE OR DELETE ON payroll_runs
          FOR EACH ROW EXECUTE FUNCTION log_audit_event()';
      RAISE NOTICE 'Created audit trigger on payroll_runs';
    END IF;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- §12  ADDITIONAL INDEXES
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_user  ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_leave_bal_year       ON leave_balances(entity_id, leave_year, employee_id);

-- ════════════════════════════════════════════════════════════
-- END OF MASTER FIX PATCH
-- ════════════════════════════════════════════════════════════
SELECT 'MASTER_FIX.sql applied successfully ✅' AS result;
