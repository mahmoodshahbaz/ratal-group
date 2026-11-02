-- employees_master_columns_patch.sql
-- Adds ALL columns referenced by Employees.jsx save payload
-- Safe to run multiple times — all use IF NOT EXISTS
-- Run once in Supabase SQL Editor

-- ── IDENTITY & CONTACT ──────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS date_of_birth          date,
  ADD COLUMN IF NOT EXISTS telegram_chat_id       text;

-- ── EMPLOYMENT ──────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS employee_category      text    DEFAULT '02',
  ADD COLUMN IF NOT EXISTS entity_code            text    DEFAULT 'RATAL',
  ADD COLUMN IF NOT EXISTS outsource_agency       text,
  ADD COLUMN IF NOT EXISTS contract_end_date      date;

-- ── PAYROLL / PAYMENT ────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS payment_mode           text    DEFAULT 'BANK_ONLY',
  ADD COLUMN IF NOT EXISTS bank_fixed_amount      numeric,
  ADD COLUMN IF NOT EXISTS bank_portion_pct       numeric,
  ADD COLUMN IF NOT EXISTS initial_basic_salary   numeric,
  ADD COLUMN IF NOT EXISTS fa_eligible            boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS fa_amount              numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wps_allowed            boolean DEFAULT true;

-- ── GOSI ────────────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS gosi_number            text,
  ADD COLUMN IF NOT EXISTS gosi_start_date        date,
  ADD COLUMN IF NOT EXISTS gosi_end_date          date;

-- ── SCE ─────────────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS sce_required           boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sce_registered         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sce_number             text,
  ADD COLUMN IF NOT EXISTS sce_expiry             date,
  ADD COLUMN IF NOT EXISTS sce_expiry_date        date,
  ADD COLUMN IF NOT EXISTS sce_category           text,
  ADD COLUMN IF NOT EXISTS sce_issue_date         date,
  ADD COLUMN IF NOT EXISTS sce_status             text    DEFAULT 'NOT_APPLICABLE';

-- ── QIWA ────────────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS qiwa_registered        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS qiwa_expiry            date;

-- ── INSURANCE ────────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS insurance_policy_no    text,
  ADD COLUMN IF NOT EXISTS insurance_expiry_date  date;

-- ── COMMENTS ─────────────────────────────────────────────────────────────
COMMENT ON COLUMN employees.employee_category   IS '01=ACCSYS-LOCAL, 02=ACCSYS-EXPAT, 03=OUTSOURCED, 04=CONTRACT';
COMMENT ON COLUMN employees.entity_code         IS 'Legal entity (RATAL, ACCSYS, etc.) — multi-entity payroll';
COMMENT ON COLUMN employees.payment_mode        IS 'BANK_ONLY | CASH_ONLY | BANK_CASH_SPLIT';
COMMENT ON COLUMN employees.bank_fixed_amount   IS 'Fixed SAR bank transfer (BANK_CASH_SPLIT mode)';
COMMENT ON COLUMN employees.bank_portion_pct    IS 'Percentage of salary to bank (BANK_CASH_SPLIT mode)';
COMMENT ON COLUMN employees.initial_basic_salary IS 'Basic at joining — EOSB base';
COMMENT ON COLUMN employees.gosi_end_date       IS 'Date GOSI coverage ended (resignations / offboarding)';
COMMENT ON COLUMN employees.sce_status          IS 'NOT_APPLICABLE | VALID | EXPIRING | EXPIRED';
COMMENT ON COLUMN employees.insurance_policy_no IS 'Medical insurance policy number';
COMMENT ON COLUMN employees.insurance_expiry_date IS 'Insurance policy expiry — update each renewal';
