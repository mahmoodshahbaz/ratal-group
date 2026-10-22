-- ============================================================
--  RATAL GROUP — COMPLETE DATABASE SCHEMA
--  Version: 1.0 | July 2026
--  Run this entire file in Supabase SQL Editor
--  Order matters — parent tables before child tables
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. ENTITIES (RAT / GWT / ACCSYS)
-- ============================================================
CREATE TABLE IF NOT EXISTS entities (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_code   TEXT NOT NULL UNIQUE,           -- RAT / GWT / ACCSYS
  entity_name   TEXT NOT NULL,
  entity_name_ar TEXT,
  entity_type   TEXT NOT NULL DEFAULT 'TRAVEL', -- TRAVEL | CORPORATE
  vat_number    TEXT,
  color         TEXT DEFAULT '#1565C0',
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Seed entities
INSERT INTO entities (entity_code, entity_name, entity_name_ar, entity_type, vat_number, color)
VALUES
  ('RAT',    'Ratal Tours and Travels',       'رتال للسفر والسياحة',     'TRAVEL',    '300000000000001', '#1565C0'),
  ('GWT',    'Green Wings Travel',            'الأجنحة الخضراء للسفر',   'TRAVEL',    '300000000000002', '#2E7D32'),
  ('ACCSYS', 'Ratal Advanced Technologies',  'رتال للتقنيات المتقدمة',   'CORPORATE', '300000000000003', '#5A32D4')
ON CONFLICT (entity_code) DO NOTHING;

-- ============================================================
-- 2. USER PROFILES (linked to Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id     UUID REFERENCES entities(id),
  entity_code   TEXT,                           -- RAT | GWT | ACCSYS | ALL (superadmin)
  full_name     TEXT,
  role          TEXT NOT NULL DEFAULT 'VIEWER', -- SUPERADMIN | ADMIN | DEPT_HEAD | PROJECT_MANAGER | TRAVEL_AGENT | FIELD_EMPLOYEE | VIEWER
  department    TEXT,                           -- CISU | NISU | TISU | ITSU | OFFICE | TRAVELS | ACCOUNTS
  telegram_chat_id TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. EMPLOYEES
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  employee_id           TEXT,                   -- EMP-001 format
  full_name_en          TEXT NOT NULL,
  full_name_ar          TEXT,
  designation           TEXT,
  department            TEXT,                   -- CISU|NISU|TISU|ITSU|OFFICE|TRAVELS|SAUDIS|ACCOUNTS
  category              TEXT DEFAULT 'RATAL_SPONSORED', -- RATAL_SPONSORED|TRAVELS|SAUDIS|OUTSOURCE
  status                TEXT DEFAULT 'ACTIVE',  -- ACTIVE|INACTIVE|LEFT
  -- Eligibility flags
  ot_allowed            BOOLEAN DEFAULT FALSE,
  loan_allowed          BOOLEAN DEFAULT FALSE,
  has_car               BOOLEAN DEFAULT FALSE,
  car_number            TEXT,
  has_dependent         BOOLEAN DEFAULT FALSE,
  dependent_count       INT DEFAULT 0,
  food_allowance_eligible BOOLEAN DEFAULT FALSE,
  wps_allowed           BOOLEAN DEFAULT TRUE,
  -- Salary
  basic                 NUMERIC(12,2) DEFAULT 0,
  hra                   NUMERIC(12,2) DEFAULT 0,
  conveyance            NUMERIC(12,2) DEFAULT 0,
  technical_allowance   NUMERIC(12,2) DEFAULT 0,
  salary_package        NUMERIC(12,2) GENERATED ALWAYS AS (basic + hra + conveyance + technical_allowance) STORED,
  bank_portion          NUMERIC(12,2) DEFAULT 0,
  payment_type          TEXT DEFAULT 'CASH_BANK', -- CASH_BANK|BANK_ONLY|CASH_ONLY
  -- Contact & IDs
  nationality           TEXT,
  mobile_number         TEXT,
  telegram_chat_id      TEXT,
  email_address         TEXT,
  -- Dates
  date_of_joining       DATE,
  contract_end_date     DATE,
  date_of_leaving       DATE,
  -- Sponsor info
  sponsor               TEXT,
  sponsor_id            TEXT,
  -- Bank info
  bank_name             TEXT,
  account_number        TEXT,
  iban                  TEXT,
  -- ID documents
  national_id           TEXT,
  national_id_expiry    DATE,
  qiwa_validity         DATE,
  sce_expiry            DATE,
  gender                TEXT DEFAULT 'MALE',
  photo_path            TEXT,
  passport_number       TEXT,
  passport_expiry       DATE,
  insurance_policy_no   TEXT,
  insurance_expiry      DATE,
  -- Ticket benefit
  ticket_eligible       BOOLEAN DEFAULT FALSE,
  ticket_cycle_months   INT DEFAULT 24,
  default_ticket_amount NUMERIC(10,2) DEFAULT 0,
  family_ticket_eligible BOOLEAN DEFAULT FALSE,
  family_ticket_limit   INT DEFAULT 0,
  default_destination   TEXT,
  -- Audit
  is_active             BOOLEAN DEFAULT TRUE,
  remarks               TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  created_by            TEXT
);

-- ============================================================
-- 4. CUSTOMERS (Travel agencies + ACCSYS end clients)
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id       UUID NOT NULL REFERENCES entities(id),
  account_no      TEXT,
  name_en         TEXT NOT NULL,
  name_ar         TEXT,
  customer_type   TEXT DEFAULT 'REGULAR',  -- REGULAR|TELECOM|GOVERNMENT|ENTERPRISE|BANK
  payment_type    TEXT DEFAULT 'CASH',     -- CASH|CREDIT
  credit_limit    NUMERIC(14,2) DEFAULT 0,
  balance         NUMERIC(14,2) DEFAULT 0,
  contact_person  TEXT,
  telephone       TEXT,
  email           TEXT,
  address         TEXT,
  vat_number      TEXT,
  status          TEXT DEFAULT 'ACTIVE',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. CONTRACTORS (ACCSYS Tier-2 — Nokia, Cisco, Huawei etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS contractors (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id       UUID NOT NULL REFERENCES entities(id),
  contractor_code TEXT,
  contractor_name TEXT NOT NULL,
  contact_person  TEXT,
  contact_email   TEXT,
  contact_phone   TEXT,
  address         TEXT,
  vat_number      TEXT,
  payment_terms   INT DEFAULT 30,
  status          TEXT DEFAULT 'ACTIVE',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed contractors for ACCSYS
-- (entity_id will be filled in by trigger/app — adjust UUID after entities are created)

-- ============================================================
-- 6. AIRLINES (Travel only)
-- ============================================================
CREATE TABLE IF NOT EXISTS airlines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id       UUID REFERENCES entities(id),  -- NULL = global
  airline_code    TEXT NOT NULL,                  -- IATA 2-char
  numeric_code    TEXT,                           -- 3-digit BSP code
  airline_name    TEXT NOT NULL,
  route_type      TEXT DEFAULT 'INT',             -- INT | DOM
  comm_tier_1     NUMERIC(5,2) DEFAULT 0,         -- First class %
  comm_tier_2     NUMERIC(5,2) DEFAULT 0,         -- Business %
  comm_tier_3     NUMERIC(5,2) DEFAULT 0,         -- Economy %
  comm_tier_4     NUMERIC(5,2) DEFAULT 0,         -- Special %
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. TICKETS (Travel)
-- ============================================================
CREATE TABLE IF NOT EXISTS tickets (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id          UUID NOT NULL REFERENCES entities(id),
  ticket_number      TEXT NOT NULL,
  ticket_type        TEXT DEFAULT 'NORMAL',     -- NORMAL|EXCHANGE|DIRECT_REFUND
  value_type         TEXT,
  exchange_order_no  TEXT,
  passenger_name     TEXT,
  routing            TEXT,                       -- e.g. RUH-LHR-RUH
  class              TEXT DEFAULT 'Y',           -- F|C|Y|W
  route_type         TEXT DEFAULT 'INT',         -- INT|DOM
  ticket_value       NUMERIC(12,2) DEFAULT 0,
  tax                NUMERIC(12,2) DEFAULT 0,
  net_to_carrier     NUMERIC(12,2) DEFAULT 0,
  discount_pct       NUMERIC(5,2) DEFAULT 0,
  selling_fare       NUMERIC(12,2) DEFAULT 0,
  duty_value         NUMERIC(12,2) DEFAULT 0,
  earned_commission  NUMERIC(12,2) DEFAULT 0,
  vat_amount         NUMERIC(12,2) DEFAULT 0,
  payment_type       TEXT DEFAULT 'CASH',        -- CASH|CREDIT
  ticket_status      TEXT DEFAULT 'ISSUED',      -- ISSUED|REFUNDED|VOID|REISSUED
  ticket_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  invoice_number     TEXT,
  order_number       TEXT,
  customer_id        UUID REFERENCES customers(id),
  airline_id         UUID REFERENCES airlines(id),
  agent_id           UUID REFERENCES employees(id),
  remarks            TEXT,
  comm1_pct          NUMERIC(5,2) DEFAULT 0,
  comm2_pct          NUMERIC(5,2) DEFAULT 0,
  credit_comm        NUMERIC(12,2) DEFAULT 0,
  branch             TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  created_by         TEXT
);

-- ============================================================
-- 8. BSP REMITTANCES
-- ============================================================
CREATE TABLE IF NOT EXISTS bsp_remittances (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id        UUID NOT NULL REFERENCES entities(id),
  bsp_period       TEXT NOT NULL,   -- e.g. "2026-07"
  bsp_number       TEXT,
  gross_sales      NUMERIC(14,2) DEFAULT 0,
  gross_refunds    NUMERIC(14,2) DEFAULT 0,
  commission_earned NUMERIC(14,2) DEFAULT 0,
  adjustments      NUMERIC(14,2) DEFAULT 0,
  net_remittance   NUMERIC(14,2) DEFAULT 0,
  due_date         DATE,
  paid_date        DATE,
  status           TEXT DEFAULT 'PENDING',  -- PENDING|PAID|DISPUTED
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 9. REFUNDS (Travel)
-- ============================================================
CREATE TABLE IF NOT EXISTS refunds (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id              UUID NOT NULL REFERENCES entities(id),
  original_ticket_number TEXT,
  ticket_id              UUID REFERENCES tickets(id),
  refund_date            DATE DEFAULT CURRENT_DATE,
  passenger_name         TEXT,
  gross_refund           NUMERIC(12,2) DEFAULT 0,
  penalty_amount         NUMERIC(12,2) DEFAULT 0,
  net_refund             NUMERIC(12,2) DEFAULT 0,
  vat_refund             NUMERIC(12,2) DEFAULT 0,
  credit_note_number     TEXT,
  customer_id            UUID REFERENCES customers(id),
  status                 TEXT DEFAULT 'PENDING',  -- PENDING|PROCESSED|CANCELLED
  processed_date         DATE,
  remarks                TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  created_by             TEXT
);

-- ============================================================
-- 10. PROJECTS (ACCSYS)
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id           UUID NOT NULL REFERENCES entities(id),
  project_number      TEXT,              -- P-00234 format
  project_name        TEXT NOT NULL,
  department          TEXT,              -- CISU|NISU|TISU|ITSU
  contractor_id       UUID REFERENCES contractors(id),
  customer_id         UUID REFERENCES customers(id),  -- End Customer (Tier 1)
  contractor_po_no    TEXT,             -- Contractor's PO number (REQUIRED for invoicing)
  contractor_po_date  DATE,
  contractor_po_value NUMERIC(14,2) DEFAULT 0,
  end_customer_ref    TEXT,             -- STC/Mobily/Zain job# (optional)
  start_date          DATE,
  end_date            DATE,
  contract_value      NUMERIC(14,2) DEFAULT 0,
  budget              NUMERIC(14,2) DEFAULT 0,
  cost_to_date        NUMERIC(14,2) DEFAULT 0,
  status              TEXT DEFAULT 'ACTIVE',  -- ACTIVE|COMPLETED|ON_HOLD|CANCELLED
  project_manager     TEXT,
  description         TEXT,
  remarks             TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  created_by          TEXT
);

-- ============================================================
-- 11. JOBS (within Projects — ACCSYS)
-- ============================================================
CREATE TABLE IF NOT EXISTS jobs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id         UUID NOT NULL REFERENCES entities(id),
  job_no            TEXT,
  project_id        UUID REFERENCES projects(id),
  department        TEXT,
  contractor_id     UUID REFERENCES contractors(id),
  customer_id       UUID REFERENCES customers(id),
  job_type          TEXT,
  model_name        TEXT,
  model_description TEXT,
  unit_price        NUMERIC(12,2) DEFAULT 0,
  quantity          NUMERIC(10,2) DEFAULT 1,
  total_job_value   NUMERIC(14,2) DEFAULT 0,
  assigned_site_no  TEXT,
  site_name         TEXT,
  status            TEXT DEFAULT 'PENDING',  -- PENDING|IN_PROGRESS|COMPLETED|INVOICED
  completion_date   DATE,
  completed_by_dh   TEXT,
  invoice_no        TEXT,
  remarks           TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  created_by        TEXT
);

-- ============================================================
-- 12. MONEY REQUESTS (ACCSYS — 8-stage workflow)
-- ============================================================
CREATE TABLE IF NOT EXISTS money_requests (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id           UUID NOT NULL REFERENCES entities(id),
  request_number      TEXT,             -- auto-generated: MR-2026-001
  request_date        DATE DEFAULT CURRENT_DATE,
  department          TEXT,
  project_id          UUID REFERENCES projects(id),
  contractor_id       UUID REFERENCES contractors(id),
  purpose             TEXT,
  amount              NUMERIC(14,2) DEFAULT 0,
  requested_by        UUID REFERENCES employees(id),
  needed_by_date      DATE,
  -- Approval workflow
  dh_approved_by      UUID REFERENCES employees(id),
  dh_approval_date    DATE,
  fin_approved_by     UUID REFERENCES employees(id),
  fin_approval_date   DATE,
  paid_date           DATE,
  payment_reference   TEXT,
  -- 8-stage status
  status              TEXT DEFAULT 'PENDING',
  -- PENDING|DH_PENDING|DH_APPROVED|FIN_PENDING|FUNDS_SENT|
  -- SUPPLIER_PAYMENT_REQUESTED|SUPPLIER_PAYMENT_COMPLETED|DISTRIBUTION|CLOSED|REJECTED
  remarks             TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  created_by          TEXT
);

-- Money Request Lines
CREATE TABLE IF NOT EXISTS money_request_lines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  money_request_id  UUID NOT NULL REFERENCES money_requests(id) ON DELETE CASCADE,
  line_type         TEXT DEFAULT 'TEAM_EXPENSES', -- TEAM_EXPENSES|SUPPLIER_PAYMENT|PETTY_CASH|OTHER
  supplier_name     TEXT,
  contractor_ref    TEXT,
  project_id        UUID REFERENCES projects(id),
  job_no            TEXT,
  site_no           TEXT,
  iban              TEXT,
  amount            NUMERIC(12,2) DEFAULT 0,
  received_amount   NUMERIC(12,2) DEFAULT 0,
  received_date     DATE,
  remarks           TEXT,
  sort_order        INT DEFAULT 0
);

-- ============================================================
-- 13. PURCHASE ORDERS (ACCSYS internal PO requests)
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id        UUID NOT NULL REFERENCES entities(id),
  po_number        TEXT,
  department       TEXT,
  contractor_id    UUID REFERENCES contractors(id),
  customer_id      UUID REFERENCES customers(id),
  contractor_po_no TEXT,
  request_date     DATE DEFAULT CURRENT_DATE,
  loi_date         DATE,
  loi_reference    TEXT,
  total_amount     NUMERIC(14,2) DEFAULT 0,
  status           TEXT DEFAULT 'DRAFT',  -- DRAFT|APPROVED|ACTIVE|CLOSED|REJECTED
  approved_by      UUID REFERENCES employees(id),
  approved_date    DATE,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  created_by       TEXT
);

-- PO Lines
CREATE TABLE IF NOT EXISTS po_lines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id           UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_number     INT DEFAULT 1,
  job_type        TEXT,
  description     TEXT,
  quantity        NUMERIC(10,2) DEFAULT 1,
  unit_price      NUMERIC(12,2) DEFAULT 0,
  line_amount     NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  job_id          UUID REFERENCES jobs(id),
  remarks         TEXT
);

-- ============================================================
-- 14. INVOICES (all entities — ZATCA compliant)
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id        UUID NOT NULL REFERENCES entities(id),
  invoice_number   TEXT NOT NULL,
  invoice_date     DATE DEFAULT CURRENT_DATE,
  customer_id      UUID REFERENCES customers(id),
  contractor_id    UUID REFERENCES contractors(id),    -- ACCSYS only
  project_id       UUID REFERENCES projects(id),       -- ACCSYS only
  job_id           UUID REFERENCES jobs(id),           -- ACCSYS only
  department       TEXT,
  contractor_po_no TEXT,                               -- Required for ACCSYS
  end_customer_ref TEXT,
  invoice_type     TEXT DEFAULT 'TAX',                 -- TAX|SIMPLIFIED|CREDIT_NOTE
  subtotal         NUMERIC(14,2) DEFAULT 0,
  vat_amount       NUMERIC(14,2) DEFAULT 0,
  total_amount     NUMERIC(14,2) DEFAULT 0,
  paid_to_date     NUMERIC(14,2) DEFAULT 0,
  balance          NUMERIC(14,2) DEFAULT 0,
  qr_code          TEXT,                               -- ZATCA TLV Base64
  description      TEXT,
  notes            TEXT,
  status           TEXT DEFAULT 'DRAFT',               -- DRAFT|ISSUED|PAID|CANCELLED
  payment_date     DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  created_by       TEXT
);

-- Invoice Lines
CREATE TABLE IF NOT EXISTS invoice_lines (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_number     INT DEFAULT 1,
  description     TEXT NOT NULL,
  quantity        NUMERIC(10,2) DEFAULT 1,
  unit_price      NUMERIC(12,2) DEFAULT 0,
  vat_rate        NUMERIC(5,2) DEFAULT 15,
  line_subtotal   NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  vat_amount      NUMERIC(14,2) DEFAULT 0,
  line_total      NUMERIC(14,2) DEFAULT 0
);

-- ============================================================
-- 15. PAYMENTS (Outgoing)
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id          UUID NOT NULL REFERENCES entities(id),
  ref_no             TEXT,
  payment_date       DATE DEFAULT CURRENT_DATE,
  department         TEXT,
  project_id         UUID REFERENCES projects(id),
  job_no             TEXT,
  contractor_id      UUID REFERENCES contractors(id),
  payee_name         TEXT,
  payee_category     TEXT,                              -- SUPPLIER|EMPLOYEE|CONTRACTOR|VENDOR
  paid_from          TEXT,                              -- Bank account code: ANB-15, ANB-39 etc.
  cash_or_bank       TEXT DEFAULT 'BANK',
  amount             NUMERIC(14,2) DEFAULT 0,
  expense_type       TEXT,
  payment_mode       TEXT DEFAULT 'BANK_TRANSFER',      -- BANK_TRANSFER|CASH|CHEQUE
  cheque_no          TEXT,
  cheque_date        DATE,
  issued_to          TEXT,
  invoice_id         UUID REFERENCES invoices(id),
  notes              TEXT,
  file_url           TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  created_by         TEXT
);

-- ============================================================
-- 16. EXPENSES (Field submissions — ACCSYS)
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id        UUID NOT NULL REFERENCES entities(id),
  request_number   TEXT,
  expense_date     DATE DEFAULT CURRENT_DATE,
  department       TEXT,
  employee_id      UUID REFERENCES employees(id),
  contact_number   TEXT,
  project_id       UUID REFERENCES projects(id),
  job_no           TEXT,
  site_no          TEXT,
  contractor_id    UUID REFERENCES contractors(id),
  customer_id      UUID REFERENCES customers(id),
  expense_mode     TEXT DEFAULT 'EXPENSE',              -- EXPENSE|RECEIVING
  expense_category TEXT,
  vat_paid         BOOLEAN DEFAULT FALSE,
  amount           NUMERIC(12,2) DEFAULT 0,
  vat_amount       NUMERIC(12,2) DEFAULT 0,
  total_amount     NUMERIC(12,2) DEFAULT 0,
  vendor_vat_no    TEXT,
  vendor_name      TEXT,
  photo_url        TEXT,
  gps_lat          NUMERIC(10,6),
  gps_lng          NUMERIC(10,6),
  status           TEXT DEFAULT 'SUBMITTED',            -- SUBMITTED|APPROVED|REJECTED|POSTED
  approved_by      UUID REFERENCES employees(id),
  approved_date    DATE,
  remarks          TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 17. FOOD ALLOWANCES
-- ============================================================
CREATE TABLE IF NOT EXISTS food_allowances (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id        UUID NOT NULL REFERENCES entities(id),
  request_number   TEXT,
  allowance_date   DATE DEFAULT CURRENT_DATE,
  department       TEXT,
  employee_id      UUID REFERENCES employees(id),
  contact_number   TEXT,
  project_id       UUID REFERENCES projects(id),
  job_no           TEXT,
  job_type         TEXT,
  location         TEXT,
  is_remote        BOOLEAN DEFAULT TRUE,
  single_multiple  TEXT DEFAULT 'SINGLE',               -- SINGLE|MULTIPLE
  no_of_persons    INT DEFAULT 1,
  daily_rate       NUMERIC(8,2) DEFAULT 30,
  no_of_days       INT DEFAULT 1,
  total_amount     NUMERIC(12,2) DEFAULT 0,
  status           TEXT DEFAULT 'SUBMITTED',
  approved_by      UUID REFERENCES employees(id),
  approved_date    DATE,
  gps_lat          NUMERIC(10,6),
  gps_lng          NUMERIC(10,6),
  remarks          TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 18. OVERTIME SUBMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS overtime_submissions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id        UUID NOT NULL REFERENCES entities(id),
  request_number   TEXT,
  ot_date          DATE DEFAULT CURRENT_DATE,
  department       TEXT,
  employee_id      UUID REFERENCES employees(id),
  contact_number   TEXT,
  project_id       UUID REFERENCES projects(id),
  job_no           TEXT,
  job_type         TEXT,
  work_type        TEXT DEFAULT 'NORMAL',               -- NORMAL|HOLIDAY|FRIDAY
  start_time       TIME,
  end_time         TIME,
  total_hours      NUMERIC(5,2) DEFAULT 0,
  ot_rate          NUMERIC(12,2) DEFAULT 0,             -- Basic÷30÷8×1.5
  ot_amount        NUMERIC(12,2) DEFAULT 0,
  status           TEXT DEFAULT 'SUBMITTED',
  approved_by      UUID REFERENCES employees(id),
  approved_date    DATE,
  payroll_month    TEXT,                                -- YYYY-MM
  payroll_included BOOLEAN DEFAULT FALSE,
  gps_lat          NUMERIC(10,6),
  gps_lng          NUMERIC(10,6),
  remarks          TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 19. PAYROLL RECORDS (monthly per employee)
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_records (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  payroll_month         TEXT NOT NULL,                  -- YYYY-MM
  employee_id           UUID NOT NULL REFERENCES employees(id),
  department            TEXT,
  -- Earnings
  basic                 NUMERIC(12,2) DEFAULT 0,
  hra                   NUMERIC(12,2) DEFAULT 0,
  conveyance            NUMERIC(12,2) DEFAULT 0,
  technical_allowance   NUMERIC(12,2) DEFAULT 0,
  overtime_amount       NUMERIC(12,2) DEFAULT 0,
  bonus                 NUMERIC(12,2) DEFAULT 0,
  other_additions       NUMERIC(12,2) DEFAULT 0,
  gross_salary          NUMERIC(12,2) DEFAULT 0,
  -- Deductions
  loan_deduction        NUMERIC(12,2) DEFAULT 0,
  penalty_deduction     NUMERIC(12,2) DEFAULT 0,
  other_deductions      NUMERIC(12,2) DEFAULT 0,
  total_deductions      NUMERIC(12,2) DEFAULT 0,
  -- Net
  net_salary            NUMERIC(12,2) DEFAULT 0,
  bank_portion          NUMERIC(12,2) DEFAULT 0,
  cash_portion          NUMERIC(12,2) DEFAULT 0,
  -- GOSI
  gosi_rate             NUMERIC(5,2) DEFAULT 0,
  gosi_amount           NUMERIC(12,2) DEFAULT 0,
  -- Status
  status                TEXT DEFAULT 'DRAFT',           -- DRAFT|APPROVED|PAID
  processed_by          TEXT,
  processed_date        DATE,
  payment_date          DATE,
  payment_reference     TEXT,
  remarks               TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, payroll_month, employee_id)
);

-- ============================================================
-- 20. LOANS
-- ============================================================
CREATE TABLE IF NOT EXISTS loans (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id        UUID NOT NULL REFERENCES entities(id),
  employee_id      UUID NOT NULL REFERENCES employees(id),
  department       TEXT,
  loan_date        DATE DEFAULT CURRENT_DATE,
  start_month      TEXT,                                -- YYYY-MM
  principal_amount NUMERIC(12,2) DEFAULT 0,
  max_allowed      NUMERIC(12,2) DEFAULT 0,
  emi_amount       NUMERIC(12,2) DEFAULT 0,
  number_of_emi    INT DEFAULT 12,
  paid_emis        INT DEFAULT 0,
  balance_amount   NUMERIC(12,2) DEFAULT 0,
  status           TEXT DEFAULT 'ACTIVE',               -- ACTIVE|COMPLETED|CANCELLED
  approved_by      TEXT,
  remarks          TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  created_by       TEXT
);

-- Loan EMI Schedule
CREATE TABLE IF NOT EXISTS loan_schedules (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id          UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  employee_id      UUID NOT NULL REFERENCES employees(id),
  emi_number       INT NOT NULL,
  due_month        TEXT NOT NULL,                       -- YYYY-MM
  emi_amount       NUMERIC(12,2) DEFAULT 0,
  paid_amount      NUMERIC(12,2) DEFAULT 0,
  balance_amount   NUMERIC(12,2) DEFAULT 0,
  status           TEXT DEFAULT 'PENDING',              -- PENDING|PAID|SKIPPED
  paid_reference   TEXT,
  paid_date        DATE
);

-- ============================================================
-- 21. PENALTIES & TRAFFIC VIOLATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS penalties (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id        UUID NOT NULL REFERENCES entities(id),
  violation_id     TEXT,
  employee_id      UUID NOT NULL REFERENCES employees(id),
  department       TEXT,
  penalty_date     DATE DEFAULT CURRENT_DATE,
  car_number       TEXT,
  car_type         TEXT,
  car_make         TEXT,
  penalty_type     TEXT,
  borne_by         TEXT DEFAULT 'EMPLOYEE',             -- EMPLOYEE|COMPANY
  amount           NUMERIC(10,2) DEFAULT 0,
  paid_amount      NUMERIC(10,2) DEFAULT 0,
  balance_amount   NUMERIC(10,2) DEFAULT 0,
  carried_balance  NUMERIC(10,2) DEFAULT 0,
  status           TEXT DEFAULT 'PENDING',              -- PENDING|PARTIAL|PAID|CARRIED
  paid_date        DATE,
  remarks          TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 22. JOURNAL VOUCHERS (double-entry)
-- ============================================================
CREATE TABLE IF NOT EXISTS journal_vouchers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id        UUID NOT NULL REFERENCES entities(id),
  ref_no           TEXT,
  voucher_type     TEXT,                                -- PAYMENT|RECEIPT|JOURNAL|CONTRA
  voucher_date     DATE DEFAULT CURRENT_DATE,
  from_ledger      TEXT,
  to_ledger        TEXT,
  net_amount       NUMERIC(14,2) DEFAULT 0,
  vat_type         TEXT,
  vat_rate         NUMERIC(5,2) DEFAULT 0,
  vat_amount       NUMERIC(12,2) DEFAULT 0,
  gross_amount     NUMERIC(14,2) DEFAULT 0,
  particular       TEXT,
  narration        TEXT,
  department       TEXT,
  project_id       UUID REFERENCES projects(id),
  job_no           TEXT,
  contractor_id    UUID REFERENCES contractors(id),
  source_type      TEXT,
  source_ref_no    TEXT,
  customer_po      TEXT,
  file_url         TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  created_by       TEXT
);

-- ============================================================
-- 23. CHART OF ACCOUNTS
-- ============================================================
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id        UUID REFERENCES entities(id),       -- NULL = shared
  account_code     TEXT NOT NULL,                      -- ANB-15, EXP-001, etc.
  account_name     TEXT NOT NULL,
  account_name_ar  TEXT,
  account_type     TEXT,                               -- BANK|CASH|EXPENSE|INTERNAL|CLEARING|GOVERNMENT|CUSTOMER|EMPLOYEE|SUPPLIER|SUBCON|CONTRACTOR
  is_active        BOOLEAN DEFAULT TRUE,
  opening_balance  NUMERIC(14,2) DEFAULT 0,
  current_balance  NUMERIC(14,2) DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Seed common accounts
INSERT INTO chart_of_accounts (account_code, account_name, account_type) VALUES
  ('ANB-15',   'ANB Account - ACCSYS Main',     'BANK'),
  ('ANB-18',   'ANB Account - Salary WPS',      'BANK'),
  ('ANB-29',   'ANB Account - RAT',             'BANK'),
  ('ANB-11',   'ANB Account - GWT',             'BANK'),
  ('ANB-39',   'ANB Account - NISU/ITSU/CISU',  'BANK'),
  ('ANB-77',   'ANB Account - TISU',            'BANK'),
  ('CASH-001', 'Main Cash',                     'CASH'),
  ('EXP-001',  'Government Expenses',           'EXPENSE'),
  ('EXP-002',  'External Expenses',             'EXPENSE'),
  ('EXP-003',  'Employee Expenses',             'EXPENSE'),
  ('EXP-004',  'Sub-Contractor Expenses',       'EXPENSE'),
  ('GOV-007',  'VAT Input',                     'GOVERNMENT'),
  ('GOV-008',  'VAT Output',                    'GOVERNMENT'),
  ('GOV-009',  'GOSI Payable',                  'GOVERNMENT')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 24. VACATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS vacations (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id             UUID NOT NULL REFERENCES entities(id),
  employee_id           UUID NOT NULL REFERENCES employees(id),
  department            TEXT,
  vacation_type         TEXT DEFAULT 'ANNUAL',          -- ANNUAL|EMERGENCY|SICK|UNPAID|BUSINESS
  vacation_status       TEXT DEFAULT 'PENDING',         -- PENDING|APPROVED|REJECTED|COMPLETED
  start_date            DATE,
  end_date              DATE,
  actual_return_date    DATE,
  total_days            INT DEFAULT 0,
  paid_days             INT DEFAULT 0,
  unpaid_days           INT DEFAULT 0,
  deduction_amount      NUMERIC(12,2) DEFAULT 0,
  levy_amount           NUMERIC(12,2) DEFAULT 0,
  ticket_eligible       BOOLEAN DEFAULT FALSE,
  ticket_paid           BOOLEAN DEFAULT FALSE,
  ticket_amount         NUMERIC(10,2) DEFAULT 0,
  family_included       BOOLEAN DEFAULT FALSE,
  approved_by           TEXT,
  remarks               TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 25. SITES (Job Activator — ACCSYS)
-- ============================================================
CREATE TABLE IF NOT EXISTS sites (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id         UUID NOT NULL REFERENCES entities(id),
  site_no           TEXT NOT NULL,
  site_name         TEXT,
  project_id        UUID REFERENCES projects(id),
  job_id            UUID REFERENCES jobs(id),
  contractor_id     UUID REFERENCES contractors(id),
  customer_id       UUID REFERENCES customers(id),
  department        TEXT,
  site_type         TEXT,
  location          TEXT,
  gps_lat           NUMERIC(10,6),
  gps_lng           NUMERIC(10,6),
  gps_status        TEXT DEFAULT 'UNCONFIRMED',          -- UNCONFIRMED|CONFIRMED|ADMIN_CONFIRMED
  confirmation_count INT DEFAULT 0,
  radius_outdoor    INT DEFAULT 500,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 26. CONTRA VOUCHERS (inter-bank transfers)
-- ============================================================
CREATE TABLE IF NOT EXISTS contra_vouchers (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id              UUID NOT NULL REFERENCES entities(id),
  contra_date            DATE DEFAULT CURRENT_DATE,
  from_ledger_no         TEXT,
  to_ledger_no           TEXT,
  amount                 NUMERIC(14,2) DEFAULT 0,
  department             TEXT,
  project_id             UUID REFERENCES projects(id),
  related_money_request  UUID REFERENCES money_requests(id),
  bank_ref_no            TEXT,
  notes                  TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  created_by             TEXT
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Enable RLS on all tables and add policies
-- ============================================================

ALTER TABLE entities              ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees             ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractors           ENABLE ROW LEVEL SECURITY;
ALTER TABLE airlines              ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE bsp_remittances       ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds               ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects              ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE money_request_lines   ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_lines              ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices              ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses              ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_allowances       ENABLE ROW LEVEL SECURITY;
ALTER TABLE overtime_submissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_schedules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalties             ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_vouchers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacations             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE contra_vouchers       ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user's role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper function: get current user's entity_code
CREATE OR REPLACE FUNCTION get_user_entity_code()
RETURNS TEXT AS $$
  SELECT entity_code FROM user_profiles WHERE id = auth.uid()
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- POLICY: entities — everyone can read
CREATE POLICY "entities_read" ON entities FOR SELECT USING (TRUE);

-- POLICY: user_profiles — own profile only (unless superadmin)
CREATE POLICY "user_profiles_own" ON user_profiles
  FOR ALL USING (
    id = auth.uid() OR get_user_role() = 'SUPERADMIN'
  );

-- POLICY macro for entity-filtered tables
-- SuperAdmin sees all. Others see only their entity.
CREATE OR REPLACE FUNCTION user_can_access_entity(row_entity_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
  v_entity_code TEXT;
  v_entity_id UUID;
BEGIN
  SELECT role, entity_code INTO v_role, v_entity_code
  FROM user_profiles WHERE id = auth.uid();

  IF v_role = 'SUPERADMIN' THEN RETURN TRUE; END IF;

  SELECT id INTO v_entity_id FROM entities WHERE entity_code = v_entity_code;
  RETURN row_entity_id = v_entity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Apply entity-filter policy to all main tables
DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'employees','customers','contractors','airlines','tickets',
    'bsp_remittances','refunds','projects','jobs','money_requests',
    'purchase_orders','invoices','payments','expenses','food_allowances',
    'overtime_submissions','payroll_records','loans','penalties',
    'journal_vouchers','vacations','sites','contra_vouchers'
  ]) LOOP
    EXECUTE format('
      CREATE POLICY "entity_filter_%s" ON %I
        FOR ALL USING (user_can_access_entity(entity_id));
    ', tbl, tbl);
  END LOOP;
END $$;

-- Child table policies (no entity_id — inherit from parent)
CREATE POLICY "money_request_lines_access" ON money_request_lines
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM money_requests mr
      WHERE mr.id = money_request_lines.money_request_id
        AND user_can_access_entity(mr.entity_id)
    )
  );

CREATE POLICY "po_lines_access" ON po_lines
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM purchase_orders po
      WHERE po.id = po_lines.po_id
        AND user_can_access_entity(po.entity_id)
    )
  );

CREATE POLICY "invoice_lines_access" ON invoice_lines
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM invoices inv
      WHERE inv.id = invoice_lines.invoice_id
        AND user_can_access_entity(inv.entity_id)
    )
  );

CREATE POLICY "loan_schedules_access" ON loan_schedules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM loans l
      WHERE l.id = loan_schedules.loan_id
        AND user_can_access_entity(l.entity_id)
    )
  );

CREATE POLICY "chart_of_accounts_read" ON chart_of_accounts
  FOR SELECT USING (
    entity_id IS NULL OR user_can_access_entity(entity_id)
  );

CREATE POLICY "chart_of_accounts_write" ON chart_of_accounts
  FOR INSERT WITH CHECK (get_user_role() IN ('SUPERADMIN','ADMIN'));

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'employees','customers','contractors','tickets','projects','jobs',
    'money_requests','purchase_orders','invoices','payments',
    'payroll_records','user_profiles'
  ]) LOOP
    EXECUTE format('
      CREATE TRIGGER trg_updated_at_%s
        BEFORE UPDATE ON %I
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    ', tbl, tbl);
  END LOOP;
END $$;

-- ============================================================
-- AUTO-GENERATE REQUEST NUMBERS
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS seq_money_request START 1;
CREATE SEQUENCE IF NOT EXISTS seq_purchase_order START 1;
CREATE SEQUENCE IF NOT EXISTS seq_invoice START 1;

CREATE OR REPLACE FUNCTION gen_money_request_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.request_number IS NULL THEN
    NEW.request_number := 'MR-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                          LPAD(nextval('seq_money_request')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_money_request_number
  BEFORE INSERT ON money_requests
  FOR EACH ROW EXECUTE FUNCTION gen_money_request_number();

CREATE OR REPLACE FUNCTION gen_po_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.po_number IS NULL THEN
    NEW.po_number := 'PO-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                    LPAD(nextval('seq_purchase_order')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_po_number
  BEFORE INSERT ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION gen_po_number();

-- ============================================================
-- USER PROFILE AUTO-CREATE ON SIGNUP
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, full_name, role, entity_code)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', 'VIEWER', 'RAT')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tickets_entity_date    ON tickets(entity_id, ticket_date DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_customer       ON tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status         ON tickets(ticket_status);
CREATE INDEX IF NOT EXISTS idx_employees_entity       ON employees(entity_id, is_active);
CREATE INDEX IF NOT EXISTS idx_money_req_entity       ON money_requests(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_entity_date   ON invoices(entity_id, invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_entity        ON expenses(entity_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_projects_entity        ON projects(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_month          ON payroll_records(entity_id, payroll_month);
CREATE INDEX IF NOT EXISTS idx_ot_entity_date         ON overtime_submissions(entity_id, ot_date DESC);
CREATE INDEX IF NOT EXISTS idx_food_entity_date       ON food_allowances(entity_id, allowance_date DESC);

-- ============================================================
-- END OF SCHEMA
-- ============================================================
-- NEXT STEP: Run this file in Supabase → SQL Editor → New Query
-- Then run seed_contractors.sql to pre-load Nokia, Cisco, Huawei etc.
-- ============================================================
