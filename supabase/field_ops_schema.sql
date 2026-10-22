-- ============================================================
-- ACCSYS FIELD OPERATIONS SCHEMA  — Phase A
-- Run this AFTER accounting_schema.sql
-- Safe to re-run: all statements are idempotent
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- SECTION 1 — Add is_active to every table that might have
--             an existing RLS policy referencing it.
--             Must run FIRST before any other ALTER TABLE.
--             All safe to re-run (IF NOT EXISTS).
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- SECTION 0 — Drop our new tables completely (clean slate)
-- These tables have no production data — created by previous
-- failed runs and may carry stale/broken policies.
-- DROP CASCADE removes all dependent policies, indexes, FKs.
-- ────────────────────────────────────────────────────────────

DROP TABLE IF EXISTS expense_claims      CASCADE;
DROP TABLE IF EXISTS expense_records     CASCADE;
DROP TABLE IF EXISTS employee_advances   CASCADE;
DROP TABLE IF EXISTS notifications       CASCADE;
DROP TABLE IF EXISTS site_assignments    CASCADE;
DROP TABLE IF EXISTS qr_tokens          CASCADE;

-- ────────────────────────────────────────────────────────────
-- SECTION 1 — Add is_active to existing tables FIRST
-- (before any ALTER TABLE triggers policy re-validation)
-- ────────────────────────────────────────────────────────────

ALTER TABLE entities            ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE employees           ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE projects            ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE departments         ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE contractors         ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE bank_accounts       ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE journal_entries     ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE journal_entry_lines ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- ────────────────────────────────────────────────────────────
-- SECTION 2 — Remaining employee field-ops columns
-- ────────────────────────────────────────────────────────────

ALTER TABLE employees ADD COLUMN IF NOT EXISTS employment_type         varchar(20)  DEFAULT 'STAFF';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS status                  varchar(20)  DEFAULT 'ACTIVE';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS overtime_eligible       boolean      DEFAULT true;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS food_allowance_eligible boolean      DEFAULT true;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS qr_token_id             uuid;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS phone_number            varchar(30);

-- projects: operational columns
ALTER TABLE projects ADD COLUMN IF NOT EXISTS phase           varchar(30)   DEFAULT 'ACTIVE';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS completion_pct  numeric(5,2)  DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget_total    numeric(15,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cost_to_date    numeric(15,2) DEFAULT 0;

-- bank_accounts: type to distinguish main vs petty cash
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_type           varchar(20) DEFAULT 'MAIN';
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS custodian_employee_id  uuid REFERENCES employees(id);

-- ────────────────────────────────────────────────────────────
-- SECTION 2 — QR Authentication
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS qr_tokens (
  id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  token            varchar(64)  UNIQUE NOT NULL,
  employee_id      uuid         REFERENCES employees(id) ON DELETE CASCADE,
  entity_id        uuid         REFERENCES entities(id),
  role             varchar(30)  NOT NULL,
  employment_type  varchar(20)  NOT NULL DEFAULT 'STAFF',
  is_active        boolean      DEFAULT true,
  last_used_at     timestamptz,
  generated_at     timestamptz  DEFAULT now(),
  generated_by     uuid         REFERENCES employees(id),
  notes            text
);

CREATE INDEX IF NOT EXISTS idx_qr_tokens_token    ON qr_tokens(token);
CREATE INDEX IF NOT EXISTS idx_qr_tokens_employee ON qr_tokens(employee_id);

ALTER TABLE qr_tokens ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- SECTION 3 — Site Assignments
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS site_assignments (
  id              uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id     uuid         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  project_id      uuid         REFERENCES projects(id) ON DELETE CASCADE,
  site_number     varchar(50),
  site_name       varchar(200),
  scope_type      varchar(30),
  role_on_site    varchar(30)  DEFAULT 'SUPPORT',
  contractor_id   uuid         REFERENCES contractors(id),
  assigned_from   date         DEFAULT CURRENT_DATE,
  assigned_to     date,
  is_active       boolean      DEFAULT true,
  notes           text,
  created_at      timestamptz  DEFAULT now(),
  created_by      uuid         REFERENCES employees(id)
);

CREATE INDEX IF NOT EXISTS idx_sa_employee ON site_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_sa_project  ON site_assignments(project_id);
CREATE INDEX IF NOT EXISTS idx_sa_active   ON site_assignments(employee_id, is_active);

ALTER TABLE site_assignments ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- SECTION 4 — Notifications
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id        uuid         REFERENCES entities(id),
  employee_id      uuid         REFERENCES employees(id) ON DELETE CASCADE,
  triggered_by     uuid         REFERENCES employees(id),
  type             varchar(50)  NOT NULL,
  title            varchar(200) NOT NULL,
  message          text         NOT NULL,
  amount           numeric(15,2),
  action_url       text,
  reference_type   varchar(50),
  reference_id     uuid,
  is_read          boolean      DEFAULT false,
  priority         varchar(10)  DEFAULT 'NORMAL',
  created_at       timestamptz  DEFAULT now(),
  read_at          timestamptz,
  expires_at       timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notif_employee ON notifications(employee_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_created  ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- SECTION 5 — Employee Advances (structure only — Phase B wires logic)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employee_advances (
  id                     uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id              uuid         REFERENCES entities(id),
  employee_id            uuid         NOT NULL REFERENCES employees(id),
  issued_by              uuid         REFERENCES employees(id),
  advance_date           date         NOT NULL,
  amount                 numeric(15,2) NOT NULL,
  source_bank_account_id uuid         REFERENCES bank_accounts(id),
  reference              varchar(100),
  txn_type               varchar(30)  NOT NULL DEFAULT 'ADVANCE_IN',
  status                 varchar(20)  DEFAULT 'ISSUED',
  journal_entry_id       uuid         REFERENCES journal_entries(id),
  notes                  text,
  created_at             timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_emp_adv_employee ON employee_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_adv_date     ON employee_advances(advance_date);

ALTER TABLE employee_advances ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- SECTION 6 — Expense Records (structure only — Phase C wires logic)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expense_records (
  id              uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id       uuid         REFERENCES entities(id),
  employee_id     uuid         NOT NULL REFERENCES employees(id),
  expense_date    date         NOT NULL,
  project_id      uuid         REFERENCES projects(id),
  site_number     varchar(50),
  category        varchar(50)  NOT NULL,
  coa_account_code varchar(20),
  amount          numeric(15,2) NOT NULL,
  vat_paid        boolean      DEFAULT false,
  vat_amount      numeric(15,2) DEFAULT 0,
  vendor_name     varchar(200),
  vendor_vat_number varchar(50),
  receipt_url     text,
  gps_lat         numeric(10,7),
  gps_lng         numeric(10,7),
  remarks         text,
  status          varchar(20)  DEFAULT 'RECORDED',
  claim_id        uuid,
  submitted_at    timestamptz  DEFAULT now(),
  created_at      timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exp_rec_employee ON expense_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_exp_rec_project  ON expense_records(project_id);
CREATE INDEX IF NOT EXISTS idx_exp_rec_date     ON expense_records(expense_date);
CREATE INDEX IF NOT EXISTS idx_exp_rec_status   ON expense_records(status);

ALTER TABLE expense_records ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- SECTION 7 — Expense Claims (structure only — Phase C wires logic)
-- ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS expense_claims (
  id                      uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_number            varchar(30)  UNIQUE,
  entity_id               uuid         REFERENCES entities(id),
  employee_id             uuid         NOT NULL REFERENCES employees(id),
  period                  varchar(7)   NOT NULL,
  total_advances_received numeric(15,2) DEFAULT 0,
  total_claimed           numeric(15,2) DEFAULT 0,
  total_vat_recoverable   numeric(15,2) DEFAULT 0,
  balance_with_employee   numeric(15,2) DEFAULT 0,
  status                  varchar(30)  DEFAULT 'DRAFT',
  submitted_at            timestamptz,
  dh_approved_at          timestamptz,
  dh_approved_by          uuid         REFERENCES employees(id),
  finance_approved_at     timestamptz,
  finance_approved_by     uuid         REFERENCES employees(id),
  paid_at                 timestamptz,
  journal_entry_id        uuid         REFERENCES journal_entries(id),
  notes                   text,
  created_at              timestamptz  DEFAULT now(),
  updated_at              timestamptz  DEFAULT now(),
  UNIQUE (employee_id, period)
);

CREATE INDEX IF NOT EXISTS idx_exp_claims_employee ON expense_claims(employee_id);
CREATE INDEX IF NOT EXISTS idx_exp_claims_period   ON expense_claims(period);
CREATE INDEX IF NOT EXISTS idx_exp_claims_status   ON expense_claims(status);

ALTER TABLE expense_claims ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- SECTION 8 — RLS Policies
-- Tables are freshly created above so no pre-existing policies
-- ────────────────────────────────────────────────────────────

-- qr_tokens: SELECT only for anon (field forms validate tokens with anon key)
CREATE POLICY "anon_sel_qr_tokens"
  ON qr_tokens FOR SELECT TO anon USING (true);

CREATE POLICY "anon_all_site_assignments"
  ON site_assignments FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_notifications"
  ON notifications FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_employee_advances"
  ON employee_advances FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_expense_records"
  ON expense_records FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "anon_all_expense_claims"
  ON expense_claims FOR ALL TO anon USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- DONE
-- ────────────────────────────────────────────────────────────
