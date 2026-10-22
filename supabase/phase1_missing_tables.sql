-- ═══════════════════════════════════════════════════════════════════
-- Phase 1 Missing Tables — Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ─── LEDGER ENTRIES (auto-posts from every transaction) ────────────
CREATE TABLE IF NOT EXISTS ledger_entries (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id       UUID REFERENCES entities(id) ON DELETE CASCADE,
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  voucher_type    VARCHAR(30) NOT NULL,  -- JOURNAL|CONTRA|PAYMENT|RECEIPT|PAYROLL|INVOICE
  voucher_number  VARCHAR(50),
  account_code    VARCHAR(30) NOT NULL,
  account_name    VARCHAR(150),
  account_type    VARCHAR(30),           -- BANK|CASH|EXPENSE|INCOME|ASSET|LIABILITY|EQUITY
  debit           NUMERIC(14,2) DEFAULT 0,
  credit          NUMERIC(14,2) DEFAULT 0,
  description     TEXT,
  ref_type        VARCHAR(50),           -- money_request|invoice|payroll_run|payment|receipt
  ref_id          UUID,
  project_no      VARCHAR(30),
  job_no          VARCHAR(30),
  dept_code       VARCHAR(20),
  contractor_id   UUID,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_ledger' AND tablename = 'ledger_entries') THEN
    CREATE POLICY "auth_ledger" ON ledger_entries FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_ledger_entity   ON ledger_entries(entity_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_account  ON ledger_entries(entity_id, account_code, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_ref      ON ledger_entries(ref_type, ref_id);

-- ─── CHART OF ACCOUNTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id       UUID REFERENCES entities(id) ON DELETE CASCADE,
  account_code    VARCHAR(30) NOT NULL,
  account_name    VARCHAR(150) NOT NULL,
  account_name_ar VARCHAR(150),
  account_type    VARCHAR(30) NOT NULL,  -- BANK|CASH|EXPENSE|INCOME|ASSET|LIABILITY|EQUITY|EMPLOYEE|CUSTOMER|CONTRACTOR|SUPPLIER|SUBCON|GOVERNMENT|INTERNAL|CLEARING
  parent_code     VARCHAR(30),
  is_active       BOOLEAN DEFAULT TRUE,
  opening_balance NUMERIC(14,2) DEFAULT 0,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, account_code)
);
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_coa' AND tablename = 'chart_of_accounts') THEN
    CREATE POLICY "auth_coa" ON chart_of_accounts FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ─── RECEIPTS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS receipts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id       UUID REFERENCES entities(id) ON DELETE CASCADE,
  receipt_number  VARCHAR(30) UNIQUE,
  receipt_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  received_from   VARCHAR(200),
  party_type      VARCHAR(30),    -- CONTRACTOR|CUSTOMER|OTHER
  contractor_id   UUID,
  customer_id     UUID,
  amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  payment_method  VARCHAR(30) DEFAULT 'BANK_TRANSFER',  -- BANK_TRANSFER|CASH|CHEQUE|SADAD
  bank_account    VARCHAR(30),    -- ANB-15|ANB-13|ANB-11|ANB-29
  reference       VARCHAR(100),   -- bank ref / cheque#
  invoice_ids     TEXT[],         -- array of invoice IDs this receipt covers
  notes           TEXT,
  status          VARCHAR(20) DEFAULT 'CONFIRMED',
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_receipts' AND tablename = 'receipts') THEN
    CREATE POLICY "auth_receipts" ON receipts FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ─── SITE MASTERS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_masters (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id       UUID REFERENCES entities(id) ON DELETE CASCADE,
  sm_id           VARCHAR(30) UNIQUE,   -- SM-NISU-26-001
  service_unit    VARCHAR(10) NOT NULL, -- NISU|TISU|CISU|ITSU
  work_type       VARCHAR(30),          -- CISU only: MW|NODE|CAMERA|DOOR|DC
  project_id      UUID REFERENCES projects(id),
  project_no      VARCHAR(30),
  job_no          VARCHAR(80),          -- Job#/Site#/Charter# from contractor
  site_name       VARCHAR(200),
  location        VARCHAR(200),
  gps_lat         NUMERIC(10,7),
  gps_lng         NUMERIC(10,7),
  contractor_po   VARCHAR(100),
  contractor_po_value NUMERIC(14,2) DEFAULT 0,
  -- Budget (locked after approval)
  budget_team_expenses  NUMERIC(14,2) DEFAULT 0,
  budget_supplier_pos   NUMERIC(14,2) DEFAULT 0,
  budget_subcon_pos     NUMERIC(14,2) DEFAULT 0,
  budget_food           NUMERIC(14,2) DEFAULT 0,
  budget_overtime       NUMERIC(14,2) DEFAULT 0,
  budget_petty_cash     NUMERIC(14,2) DEFAULT 0,
  budget_misc           NUMERIC(14,2) DEFAULT 0,
  budget_total          NUMERIC(14,2) GENERATED ALWAYS AS (
    budget_team_expenses + budget_supplier_pos + budget_subcon_pos +
    budget_food + budget_overtime + budget_petty_cash + budget_misc
  ) STORED,
  budget_locked   BOOLEAN DEFAULT FALSE,
  budget_locked_at TIMESTAMPTZ,
  budget_locked_by UUID,
  -- Actuals (auto-accumulated)
  actual_team_expenses  NUMERIC(14,2) DEFAULT 0,
  actual_supplier_pos   NUMERIC(14,2) DEFAULT 0,
  actual_subcon_pos     NUMERIC(14,2) DEFAULT 0,
  actual_food           NUMERIC(14,2) DEFAULT 0,
  actual_overtime       NUMERIC(14,2) DEFAULT 0,
  actual_petty_cash     NUMERIC(14,2) DEFAULT 0,
  actual_misc           NUMERIC(14,2) DEFAULT 0,
  actual_total          NUMERIC(14,2) GENERATED ALWAYS AS (
    actual_team_expenses + actual_supplier_pos + actual_subcon_pos +
    actual_food + actual_overtime + actual_petty_cash + actual_misc
  ) STORED,
  -- Revenue
  invoiced_amount NUMERIC(14,2) DEFAULT 0,
  -- Milestones stored as JSONB array: [{name, status, date, notes, doc_url}]
  milestones      JSONB DEFAULT '[]',
  -- Team
  pm_id           UUID,
  supervisor_ids  UUID[],
  -- Status
  status          VARCHAR(30) DEFAULT 'PENDING', -- PENDING|MOBILISED|IN_PROGRESS|MATERIAL_WAITING|COMPLETED|SNAGGING|HANDED_OVER|INVOICED
  start_date      DATE,
  end_date        DATE,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE site_masters ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_sm' AND tablename = 'site_masters') THEN
    CREATE POLICY "auth_sm" ON site_masters FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_sm_entity  ON site_masters(entity_id, service_unit);
CREATE INDEX IF NOT EXISTS idx_sm_project ON site_masters(project_id);

-- ─── DAILY ALLOCATIONS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_allocations (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id       UUID REFERENCES entities(id) ON DELETE CASCADE,
  alloc_date      DATE NOT NULL,
  site_master_id  UUID REFERENCES site_masters(id) ON DELETE CASCADE,
  sm_id           VARCHAR(30),
  project_no      VARCHAR(30),
  employee_id     UUID REFERENCES employees(id),
  employee_name   VARCHAR(150),
  allocation_pct  NUMERIC(5,2) DEFAULT 100, -- % of day on this SM
  work_type       VARCHAR(50),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE daily_allocations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_alloc' AND tablename = 'daily_allocations') THEN
    CREATE POLICY "auth_alloc" ON daily_allocations FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ─── VACATIONS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vacations (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id       UUID REFERENCES entities(id) ON DELETE CASCADE,
  employee_id     UUID REFERENCES employees(id) ON DELETE CASCADE,
  employee_name   VARCHAR(150),
  leave_type      VARCHAR(30) NOT NULL, -- ANNUAL|EMERGENCY|SICK|SICK_MAJOR|UNPAID|HAJJ|MATERNITY
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  days            INTEGER GENERATED ALWAYS AS (end_date - start_date + 1) STORED,
  status          VARCHAR(20) DEFAULT 'PENDING', -- PENDING|APPROVED|REJECTED|CANCELLED
  approved_by     UUID,
  approved_at     TIMESTAMPTZ,
  return_date     DATE,
  actual_return   DATE,
  overstay_days   INTEGER DEFAULT 0,
  levy_amount     NUMERIC(14,2) DEFAULT 0,  -- SAR 800/month for overstay
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE vacations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_vacations' AND tablename = 'vacations') THEN
    CREATE POLICY "auth_vacations" ON vacations FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ─── LOANS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_loans (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id       UUID REFERENCES entities(id) ON DELETE CASCADE,
  employee_id     UUID REFERENCES employees(id) ON DELETE CASCADE,
  employee_name   VARCHAR(150),
  loan_amount     NUMERIC(14,2) NOT NULL,
  tenure_months   INTEGER NOT NULL,          -- max 24
  monthly_emi     NUMERIC(14,2),             -- auto-calc
  start_month     VARCHAR(7),                -- YYYY-MM
  paid_months     INTEGER DEFAULT 0,
  paid_amount     NUMERIC(14,2) DEFAULT 0,
  outstanding     NUMERIC(14,2),
  status          VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE|COMPLETED|CANCELLED
  approved_by     UUID,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE employee_loans ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_loans' AND tablename = 'employee_loans') THEN
    CREATE POLICY "auth_loans" ON employee_loans FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ─── PENALTIES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_penalties (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id       UUID REFERENCES entities(id) ON DELETE CASCADE,
  employee_id     UUID REFERENCES employees(id) ON DELETE CASCADE,
  employee_name   VARCHAR(150),
  penalty_date    DATE DEFAULT CURRENT_DATE,
  penalty_type    VARCHAR(30),  -- EMPLOYEE_BORNE|COMPANY_BORNE
  offence         VARCHAR(200),
  amount          NUMERIC(14,2) NOT NULL,
  deduction_month VARCHAR(7),   -- YYYY-MM (which payroll month to deduct)
  carried_forward NUMERIC(14,2) DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'PENDING', -- PENDING|DEDUCTED|CARRIED
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE employee_penalties ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_penalties' AND tablename = 'employee_penalties') THEN
    CREATE POLICY "auth_penalties" ON employee_penalties FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ─── COMPLIANCE DOCUMENTS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compliance_docs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id       UUID REFERENCES entities(id) ON DELETE CASCADE,
  category        VARCHAR(30) NOT NULL,   -- EMPLOYEE|VEHICLE|COMPANY
  ref_id          UUID,                   -- employee_id or vehicle_id or NULL for company
  ref_name        VARCHAR(200),
  doc_type        VARCHAR(50) NOT NULL,   -- IQAMA|PASSPORT|HEALTH_INS|QIWA|SCE|INSURANCE|MVPI|REGISTRATION|CR|GOSI|MUNICIPALITY|CITC
  expiry_date     DATE NOT NULL,
  alert_days      INTEGER DEFAULT 30,     -- alert this many days before expiry
  doc_number      VARCHAR(100),
  notes           TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE compliance_docs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_compliance' AND tablename = 'compliance_docs') THEN
    CREATE POLICY "auth_compliance" ON compliance_docs FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_compliance_expiry ON compliance_docs(entity_id, expiry_date, is_active);

-- ─── Add SM# column to expense-related tables ─────────────────────
ALTER TABLE expenses         ADD COLUMN IF NOT EXISTS site_master_id UUID REFERENCES site_masters(id);
ALTER TABLE expenses         ADD COLUMN IF NOT EXISTS sm_id VARCHAR(30);
ALTER TABLE food_allowances  ADD COLUMN IF NOT EXISTS site_master_id UUID REFERENCES site_masters(id);
ALTER TABLE food_allowances  ADD COLUMN IF NOT EXISTS sm_id VARCHAR(30);
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS site_master_id UUID REFERENCES site_masters(id);
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS sm_id VARCHAR(30);
ALTER TABLE money_requests   ADD COLUMN IF NOT EXISTS site_master_id UUID REFERENCES site_masters(id);
ALTER TABLE money_requests   ADD COLUMN IF NOT EXISTS sm_id VARCHAR(30);

-- ─── Enhance employees table ──────────────────────────────────────
ALTER TABLE employees ADD COLUMN IF NOT EXISTS designation         VARCHAR(80);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS ticket_eligible     BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS ticket_cycle_months INTEGER DEFAULT 24;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS ticket_amount       NUMERIC(10,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS last_ticket_date    DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS has_family          BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS iqama_expiry        DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS passport_expiry     DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS health_ins_expiry   DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS qiwa_expiry         DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS sce_expiry          DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS ot_allowed          BOOLEAN DEFAULT TRUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS food_eligible       BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS wps_allowed         BOOLEAN DEFAULT TRUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS loan_allowed        BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS join_date           DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS left_date           DATE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name           VARCHAR(80);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_code           VARCHAR(20);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS annual_leave_bal    NUMERIC(6,1) DEFAULT 30;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS emergency_leave_bal NUMERIC(6,1) DEFAULT 15;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nationality          VARCHAR(30)  DEFAULT 'EXPAT';  -- SAUDI|EXPAT
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_portion         NUMERIC(10,2) DEFAULT 0;       -- WPS cash amount
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_no          VARCHAR(30);                   -- e.g. EMP-0042
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_type        VARCHAR(20)  DEFAULT 'DIRECT'; -- DIRECT|OUTSOURCE

-- ─── Enhance payroll_items table ─────────────────────────────────────────
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS gosi_amount       NUMERIC(10,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS loan_deduction    NUMERIC(10,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS penalty_deduction NUMERIC(10,2) DEFAULT 0;

-- ─── Enhance payroll_runs table ──────────────────────────────────────────
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS total_gosi         NUMERIC(12,2) DEFAULT 0;

-- ─── NOTICES (Employee Engagement / Notice Board) ────────────────────────
CREATE TABLE IF NOT EXISTS notices (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id    UUID REFERENCES entities(id) ON DELETE CASCADE,
  title        VARCHAR(200) NOT NULL,
  body         TEXT,
  category     VARCHAR(30) DEFAULT 'ANNOUNCEMENT', -- ANNOUNCEMENT|POLICY|REMINDER|CELEBRATION|TRAINING|GENERAL
  priority     VARCHAR(10) DEFAULT 'MEDIUM',        -- HIGH|MEDIUM|LOW
  pinned       BOOLEAN DEFAULT FALSE,
  expires_at   DATE,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'auth_notices' AND tablename = 'notices') THEN
    CREATE POLICY "auth_notices" ON notices FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_notices_entity ON notices(entity_id, created_at DESC);

-- ─── Set entity_id scope on all relevant tables ───────────────────────────
-- If employees table doesn't yet have entity_id, uncomment:
-- ALTER TABLE employees ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entities(id);
-- CREATE INDEX IF NOT EXISTS idx_employees_entity ON employees(entity_id);
