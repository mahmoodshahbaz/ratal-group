-- ═══════════════════════════════════════════════════════════════════
-- Phase 3 Patch #2 — Entity Settings table
-- Safe to run multiple times (all IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS entity_settings (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id             UUID        NOT NULL UNIQUE REFERENCES entities(id) ON DELETE CASCADE,
  -- Company info
  company_name_en       VARCHAR(200),
  company_name_ar       VARCHAR(200),
  vat_number            VARCHAR(20),
  cr_number             VARCHAR(20),
  address_en            TEXT,
  address_ar            TEXT,
  city                  VARCHAR(100) DEFAULT 'Riyadh',
  country               VARCHAR(100) DEFAULT 'Saudi Arabia',
  phone                 VARCHAR(30),
  email                 VARCHAR(200),
  website               VARCHAR(200),
  -- Banking / WPS
  default_bank_code     VARCHAR(10)  DEFAULT '1060',
  wps_entity_name       VARCHAR(200),
  iban                  VARCHAR(34),
  -- Payroll
  payroll_cutoff_day    SMALLINT     DEFAULT 25,
  salary_day            SMALLINT     DEFAULT 1,
  fiscal_year_start     VARCHAR(2)   DEFAULT '01',
  gosi_company_saudi    NUMERIC(5,2) DEFAULT 9.00,
  gosi_company_expat    NUMERIC(5,2) DEFAULT 3.00,
  annual_leave_days     SMALLINT     DEFAULT 21,
  sick_leave_days       SMALLINT     DEFAULT 30,
  emergency_leave_days  SMALLINT     DEFAULT 3,
  -- System
  currency              VARCHAR(3)   DEFAULT 'SAR',
  date_format           VARCHAR(20)  DEFAULT 'DD/MM/YYYY',
  timezone              VARCHAR(50)  DEFAULT 'Asia/Riyadh',
  invoice_prefix        VARCHAR(10)  DEFAULT 'INV',
  po_prefix             VARCHAR(10)  DEFAULT 'PO',
  sm_prefix             VARCHAR(10)  DEFAULT 'SM',
  -- Telegram
  telegram_chat_id      VARCHAR(50),
  -- Note: telegram_bot_token goes in Edge Function secrets, not here
  updated_at            TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE entity_settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'auth_entity_settings' AND tablename = 'entity_settings'
  ) THEN
    CREATE POLICY "auth_entity_settings" ON entity_settings FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;
