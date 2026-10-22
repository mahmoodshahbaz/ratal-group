-- ═══════════════════════════════════════════════════════════════════════
-- ACCSYS Complete Accounting Schema
-- Double-entry bookkeeping with auto-posting from transactions
-- Run this in Supabase SQL Editor (Settings → SQL Editor)
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. Chart of Accounts ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id         uuid        REFERENCES entities(id) ON DELETE CASCADE,
  account_code      varchar(20) NOT NULL,
  account_name      varchar(200) NOT NULL,
  account_name_ar   varchar(200),
  account_type      varchar(30) NOT NULL
    CHECK (account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
  account_subtype   varchar(50),
  -- ASSET:     CURRENT_ASSET | FIXED_ASSET | OTHER_ASSET
  -- LIABILITY: CURRENT_LIABILITY | LONG_TERM_LIABILITY
  -- EQUITY:    EQUITY
  -- REVENUE:   OPERATING_REVENUE | OTHER_REVENUE
  -- EXPENSE:   COGS | OPERATING_EXPENSE | OTHER_EXPENSE
  normal_balance    varchar(10) NOT NULL CHECK (normal_balance IN ('DEBIT','CREDIT')),
  parent_account_id uuid        REFERENCES chart_of_accounts(id),
  opening_balance   numeric(15,2) DEFAULT 0,
  opening_date      date,
  is_active         boolean     DEFAULT true,
  is_system         boolean     DEFAULT false,  -- system accounts cannot be deleted
  description       text,
  sort_order        int         DEFAULT 0,
  created_at        timestamptz DEFAULT now(),
  UNIQUE (entity_id, account_code)
);

-- ─── 2. Journal Entries — Header ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id       uuid        REFERENCES entities(id) ON DELETE CASCADE,
  entry_number    varchar(50) NOT NULL,    -- JE-2026-0001
  entry_date      date        NOT NULL,
  period          varchar(7)  NOT NULL,    -- YYYY-MM
  narration       text,
  reference       varchar(200),
  status          varchar(20) DEFAULT 'POSTED'
    CHECK (status IN ('DRAFT','POSTED','REVERSED')),
  source_type     varchar(50),
  -- INVOICE | PAYMENT_RECEIPT | PAYMENT_OUT | EXPENSE
  -- PAYROLL | VAT_PAYMENT | MANUAL | OPENING_BALANCE
  source_id       uuid,                   -- FK to originating transaction (no FK constraint — cross-table)
  reversed_by     uuid        REFERENCES journal_entries(id),
  created_by      varchar(200),
  posted_at       timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now(),
  UNIQUE (entity_id, entry_number)
);

-- ─── 3. Journal Entry Lines — Dr / Cr ───────────────────────────────────
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id               uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  journal_entry_id uuid          NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id       uuid          REFERENCES chart_of_accounts(id),
  account_code     varchar(20)   NOT NULL,
  account_name     varchar(200)  NOT NULL,
  debit_amount     numeric(15,2) DEFAULT 0 CHECK (debit_amount  >= 0),
  credit_amount    numeric(15,2) DEFAULT 0 CHECK (credit_amount >= 0),
  description      text,
  created_at       timestamptz   DEFAULT now(),
  CHECK (NOT (debit_amount > 0 AND credit_amount > 0))  -- one side only per line
);

-- ─── 4. Bank Accounts Master ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_accounts (
  id               uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id        uuid         REFERENCES entities(id) ON DELETE CASCADE,
  coa_account_id   uuid         REFERENCES chart_of_accounts(id),
  account_name     varchar(200) NOT NULL,    -- e.g. "ANB Main Operations"
  bank_name        varchar(200),             -- "Arab National Bank"
  account_number   varchar(100),             -- IBAN / account number
  account_type     varchar(50)  DEFAULT 'BANK',  -- BANK | CASH | PETTY_CASH
  currency         varchar(10)  DEFAULT 'SAR',
  opening_balance  numeric(15,2) DEFAULT 0,
  opening_date     date,
  is_active        boolean      DEFAULT true,
  sort_order       int          DEFAULT 0,
  notes            text,
  created_at       timestamptz  DEFAULT now()
);

-- ─── 5. Fixed Asset Register ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_accounts (
  id                  uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id           uuid          REFERENCES entities(id) ON DELETE CASCADE,
  coa_account_id      uuid          REFERENCES chart_of_accounts(id),
  asset_code          varchar(50),
  asset_name          varchar(200)  NOT NULL,
  asset_category      varchar(100),
  -- COMPUTER_EQUIPMENT | FURNITURE | VEHICLE | MACHINERY | OTHER
  asset_date          date,
  purchase_value      numeric(15,2) DEFAULT 0,
  depreciation_rate   numeric(5,2)  DEFAULT 0,   -- % per annum (straight-line)
  useful_life_years   int           DEFAULT 0,
  salvage_value       numeric(15,2) DEFAULT 0,
  current_value       numeric(15,2) DEFAULT 0,   -- net book value
  accumulated_dep     numeric(15,2) DEFAULT 0,
  status              varchar(50)   DEFAULT 'ACTIVE',
  -- ACTIVE | DISPOSED | FULLY_DEPRECIATED
  disposal_date       date,
  disposal_value      numeric(15,2),
  notes               text,
  created_at          timestamptz   DEFAULT now()
);

-- ─── 6. Capital Accounts (Owner's Equity) ───────────────────────────────
CREATE TABLE IF NOT EXISTS capital_accounts (
  id               uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id        uuid          REFERENCES entities(id) ON DELETE CASCADE,
  coa_account_id   uuid          REFERENCES chart_of_accounts(id),
  capital_name     varchar(200)  NOT NULL,
  opening_balance  numeric(15,2) DEFAULT 0,
  notes            text,
  created_at       timestamptz   DEFAULT now()
);

-- ─── 7. Loan Accounts ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_accounts (
  id                  uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id           uuid          REFERENCES entities(id) ON DELETE CASCADE,
  coa_account_id      uuid          REFERENCES chart_of_accounts(id),
  loan_name           varchar(200)  NOT NULL,
  lender_name         varchar(200),
  loan_amount         numeric(15,2) DEFAULT 0,
  outstanding_balance numeric(15,2) DEFAULT 0,
  interest_rate       numeric(5,2)  DEFAULT 0,   -- % per annum
  start_date          date,
  maturity_date       date,
  status              varchar(50)   DEFAULT 'ACTIVE',  -- ACTIVE | SETTLED | WRITTEN_OFF
  notes               text,
  created_at          timestamptz   DEFAULT now()
);

-- ─── 8. VAT Payments to ZATCA ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vat_payments (
  id                uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id         uuid          REFERENCES entities(id) ON DELETE CASCADE,
  payment_date      date          NOT NULL,
  period_from       date          NOT NULL,
  period_to         date          NOT NULL,
  vat_period        varchar(20),               -- "2026-07" or "2026-Q3"
  output_vat        numeric(15,2) DEFAULT 0,
  input_vat         numeric(15,2) DEFAULT 0,
  net_vat_payable   numeric(15,2) DEFAULT 0,
  amount_paid       numeric(15,2) NOT NULL,
  bank_account_id   uuid          REFERENCES bank_accounts(id),
  reference_number  varchar(200),
  filing_number     varchar(200),
  status            varchar(50)   DEFAULT 'PAID',  -- PAID | REFUND_CLAIMED
  journal_entry_id  uuid          REFERENCES journal_entries(id),
  notes             text,
  created_at        timestamptz   DEFAULT now()
);

-- ─── Patch existing tables (adds columns if tables already exist) ────────
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS period       varchar(7);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS narration    text;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reference    varchar(200);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS status       varchar(20) DEFAULT 'POSTED';
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS source_type  varchar(50);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS source_id    uuid;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS reversed_by  uuid;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS created_by   varchar(200);
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS posted_at    timestamptz DEFAULT now();

ALTER TABLE journal_entry_lines ADD COLUMN IF NOT EXISTS account_id    uuid;
ALTER TABLE journal_entry_lines ADD COLUMN IF NOT EXISTS account_code   varchar(20);
ALTER TABLE journal_entry_lines ADD COLUMN IF NOT EXISTS account_name   varchar(200);
ALTER TABLE journal_entry_lines ADD COLUMN IF NOT EXISTS debit_amount   numeric(15,2) DEFAULT 0;
ALTER TABLE journal_entry_lines ADD COLUMN IF NOT EXISTS credit_amount  numeric(15,2) DEFAULT 0;
ALTER TABLE journal_entry_lines ADD COLUMN IF NOT EXISTS description     text;

ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS account_name_ar   varchar(200);
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS account_subtype   varchar(50);
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS normal_balance     varchar(10);
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS parent_account_id  uuid;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS opening_balance    numeric(15,2) DEFAULT 0;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS opening_date       date;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS is_active          boolean DEFAULT true;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS is_system          boolean DEFAULT false;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS description        text;
ALTER TABLE chart_of_accounts ADD COLUMN IF NOT EXISTS sort_order         int DEFAULT 0;

ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS coa_account_id   uuid;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_number    varchar(100);
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS account_type      varchar(50) DEFAULT 'BANK';
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS currency          varchar(10) DEFAULT 'SAR';
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS opening_balance   numeric(15,2) DEFAULT 0;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS opening_date      date;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS is_active         boolean DEFAULT true;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS sort_order        int DEFAULT 0;
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS notes             text;

-- ─── Indexes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_je_entity_date    ON journal_entries(entity_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_je_period         ON journal_entries(entity_id, period);
CREATE INDEX IF NOT EXISTS idx_je_source         ON journal_entries(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_jel_entry         ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jel_account       ON journal_entry_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_coa_entity_code   ON chart_of_accounts(entity_id, account_code);
CREATE INDEX IF NOT EXISTS idx_bank_entity       ON bank_accounts(entity_id);

-- ─── Bank Reconciliation ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bank_recon_items (
  id                uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id         uuid         REFERENCES entities(id) ON DELETE CASCADE,
  bank_account_id   uuid         REFERENCES bank_accounts(id) ON DELETE CASCADE,
  journal_line_id   uuid         REFERENCES journal_entry_lines(id) ON DELETE CASCADE,
  period            varchar(7)   NOT NULL,          -- YYYY-MM
  is_cleared        boolean      DEFAULT false,
  statement_date    date,
  statement_balance numeric(15,2),
  created_at        timestamptz  DEFAULT now(),
  updated_at        timestamptz  DEFAULT now(),
  UNIQUE (bank_account_id, journal_line_id, period)
);
ALTER TABLE bank_recon_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bri_account_period ON bank_recon_items(bank_account_id, period);

-- ─── Row Level Security ─────────────────────────────────────────────────
ALTER TABLE chart_of_accounts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE vat_payments         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_coa" ON chart_of_accounts;
DROP POLICY IF EXISTS "anon_all_je"  ON journal_entries;
DROP POLICY IF EXISTS "anon_all_jel" ON journal_entry_lines;
DROP POLICY IF EXISTS "anon_all_ba"  ON bank_accounts;
DROP POLICY IF EXISTS "anon_all_aa"  ON asset_accounts;
DROP POLICY IF EXISTS "anon_all_ca"  ON capital_accounts;
DROP POLICY IF EXISTS "anon_all_la"  ON loan_accounts;
DROP POLICY IF EXISTS "anon_all_vp"  ON vat_payments;
DROP POLICY IF EXISTS "anon_all_bri" ON bank_recon_items;

CREATE POLICY "anon_all_coa"  ON chart_of_accounts   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_je"   ON journal_entries      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_jel"  ON journal_entry_lines  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_ba"   ON bank_accounts        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_aa"   ON asset_accounts       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_ca"   ON capital_accounts     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_la"   ON loan_accounts        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_vp"   ON vat_payments         FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_bri"  ON bank_recon_items     FOR ALL TO anon USING (true) WITH CHECK (true);


-- ═══════════════════════════════════════════════════════════════════════
-- SEED: Default Chart of Accounts for ACCSYS entity
-- Adjust the entity_id WHERE clause if your entity code differs
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_entity_id uuid;
BEGIN
  -- Get ACCSYS entity id
  SELECT id INTO v_entity_id FROM entities WHERE entity_code = 'ACCSYS' LIMIT 1;
  IF v_entity_id IS NULL THEN
    RAISE NOTICE 'ACCSYS entity not found — skipping COA seed';
    RETURN;
  END IF;

  -- ── ASSETS (1xxx) ──────────────────────────────────────────────────
  INSERT INTO chart_of_accounts (entity_id,account_code,account_name,account_name_ar,account_type,account_subtype,normal_balance,is_system,sort_order) VALUES
  -- Current Assets
  (v_entity_id,'1000','Current Assets','الأصول المتداولة','ASSET','CURRENT_ASSET','DEBIT',true,100),
  (v_entity_id,'1100','Cash & Bank Accounts','النقد والبنوك','ASSET','CURRENT_ASSET','DEBIT',true,110),
  (v_entity_id,'1110','ANB – Main Operations (ANB-15)','بنك الأهلي – الحساب الرئيسي','ASSET','CURRENT_ASSET','DEBIT',true,111),
  (v_entity_id,'1120','ANB – Contra Distribution (ANB-39)','بنك الأهلي – توزيع كونترا 39','ASSET','CURRENT_ASSET','DEBIT',true,112),
  (v_entity_id,'1130','ANB – Contra Distribution (ANB-77)','بنك الأهلي – توزيع كونترا 77','ASSET','CURRENT_ASSET','DEBIT',true,113),
  (v_entity_id,'1140','Petty Cash','النقدية الصغيرة','ASSET','CURRENT_ASSET','DEBIT',false,114),
  (v_entity_id,'1200','Accounts Receivable','ذمم مدينة','ASSET','CURRENT_ASSET','DEBIT',true,120),
  (v_entity_id,'1210','Trade Receivables – Contractors','مستحقات العملاء','ASSET','CURRENT_ASSET','DEBIT',true,121),
  (v_entity_id,'1220','Retention Receivable','مستحقات الضمان المحتجزة','ASSET','CURRENT_ASSET','DEBIT',false,122),
  (v_entity_id,'1300','Other Current Assets','أصول متداولة أخرى','ASSET','CURRENT_ASSET','DEBIT',false,130),
  (v_entity_id,'1310','Prepaid Expenses','مصروفات مدفوعة مقدماً','ASSET','CURRENT_ASSET','DEBIT',false,131),
  (v_entity_id,'1320','VAT Recoverable (Input VAT)','ضريبة القيمة المضافة قابلة للاسترداد','ASSET','CURRENT_ASSET','DEBIT',true,132),
  (v_entity_id,'1330','Advances to Employees','سلف الموظفين','ASSET','CURRENT_ASSET','DEBIT',false,133),
  (v_entity_id,'1340','Advances to Subcontractors','سلف المقاولين من الباطن','ASSET','CURRENT_ASSET','DEBIT',false,134),
  -- Fixed Assets
  (v_entity_id,'1400','Fixed Assets','الأصول الثابتة','ASSET','FIXED_ASSET','DEBIT',false,140),
  (v_entity_id,'1410','Computer Equipment','أجهزة الكمبيوتر','ASSET','FIXED_ASSET','DEBIT',false,141),
  (v_entity_id,'1420','Furniture & Fixtures','الأثاث والتجهيزات','ASSET','FIXED_ASSET','DEBIT',false,142),
  (v_entity_id,'1430','Vehicles','المركبات','ASSET','FIXED_ASSET','DEBIT',false,143),
  (v_entity_id,'1440','Office Equipment','المعدات المكتبية','ASSET','FIXED_ASSET','DEBIT',false,144),
  (v_entity_id,'1490','Accumulated Depreciation','مجمع الاستهلاك','ASSET','FIXED_ASSET','CREDIT',false,149)
  ON CONFLICT (entity_id, account_code) DO NOTHING;

  -- ── LIABILITIES (2xxx) ─────────────────────────────────────────────
  INSERT INTO chart_of_accounts (entity_id,account_code,account_name,account_name_ar,account_type,account_subtype,normal_balance,is_system,sort_order) VALUES
  (v_entity_id,'2000','Current Liabilities','الالتزامات المتداولة','LIABILITY','CURRENT_LIABILITY','CREDIT',true,200),
  (v_entity_id,'2100','Accounts Payable','ذمم دائنة','LIABILITY','CURRENT_LIABILITY','CREDIT',true,210),
  (v_entity_id,'2110','Trade Payables – Subcontractors','مستحقات المقاولين الفرعيين','LIABILITY','CURRENT_LIABILITY','CREDIT',false,211),
  (v_entity_id,'2120','Trade Payables – Suppliers','مستحقات الموردين','LIABILITY','CURRENT_LIABILITY','CREDIT',false,212),
  (v_entity_id,'2200','Tax Liabilities','الالتزامات الضريبية','LIABILITY','CURRENT_LIABILITY','CREDIT',true,220),
  (v_entity_id,'2210','VAT Payable (Output VAT)','ضريبة القيمة المضافة المستحقة','LIABILITY','CURRENT_LIABILITY','CREDIT',true,221),
  (v_entity_id,'2220','Employee Tax Withholding','ضريبة الموظفين المحتجزة','LIABILITY','CURRENT_LIABILITY','CREDIT',false,222),
  (v_entity_id,'2300','Accrued Liabilities','مصروفات مستحقة','LIABILITY','CURRENT_LIABILITY','CREDIT',false,230),
  (v_entity_id,'2310','Accrued Salaries','رواتب مستحقة','LIABILITY','CURRENT_LIABILITY','CREDIT',false,231),
  (v_entity_id,'2320','Accrued Leave','إجازات مستحقة','LIABILITY','CURRENT_LIABILITY','CREDIT',false,232),
  (v_entity_id,'2330','GOSI Payable','مستحقات التأمينات الاجتماعية','LIABILITY','CURRENT_LIABILITY','CREDIT',false,233),
  (v_entity_id,'2340','Retention Payable','ضمان محتجز – مستحق للعملاء','LIABILITY','CURRENT_LIABILITY','CREDIT',false,234),
  (v_entity_id,'2400','Long-Term Liabilities','الالتزامات طويلة الأجل','LIABILITY','LONG_TERM_LIABILITY','CREDIT',false,240),
  (v_entity_id,'2410','Bank Loans','قروض بنكية','LIABILITY','LONG_TERM_LIABILITY','CREDIT',false,241),
  (v_entity_id,'2420','End-of-Service Liability','مخصص مكافأة نهاية الخدمة','LIABILITY','LONG_TERM_LIABILITY','CREDIT',false,242)
  ON CONFLICT (entity_id, account_code) DO NOTHING;

  -- ── EQUITY (3xxx) ──────────────────────────────────────────────────
  INSERT INTO chart_of_accounts (entity_id,account_code,account_name,account_name_ar,account_type,account_subtype,normal_balance,is_system,sort_order) VALUES
  (v_entity_id,'3000','Equity','حقوق الملكية','EQUITY','EQUITY','CREDIT',true,300),
  (v_entity_id,'3100','Share Capital','رأس المال المدفوع','EQUITY','EQUITY','CREDIT',true,310),
  (v_entity_id,'3200','Retained Earnings','الأرباح المحتجزة','EQUITY','EQUITY','CREDIT',true,320),
  (v_entity_id,'3300','Current Year Profit / Loss','أرباح وخسائر السنة الحالية','EQUITY','EQUITY','CREDIT',true,330)
  ON CONFLICT (entity_id, account_code) DO NOTHING;

  -- ── REVENUE (4xxx) ─────────────────────────────────────────────────
  INSERT INTO chart_of_accounts (entity_id,account_code,account_name,account_name_ar,account_type,account_subtype,normal_balance,is_system,sort_order) VALUES
  (v_entity_id,'4000','Revenue','الإيرادات','REVENUE','OPERATING_REVENUE','CREDIT',true,400),
  (v_entity_id,'4100','Service Revenue','إيرادات الخدمات','REVENUE','OPERATING_REVENUE','CREDIT',true,410),
  (v_entity_id,'4110','Project Revenue','إيرادات المشاريع','REVENUE','OPERATING_REVENUE','CREDIT',true,411),
  (v_entity_id,'4120','Consulting Revenue','إيرادات الاستشارات','REVENUE','OPERATING_REVENUE','CREDIT',false,412),
  (v_entity_id,'4130','Maintenance Revenue','إيرادات الصيانة','REVENUE','OPERATING_REVENUE','CREDIT',false,413),
  (v_entity_id,'4140','Managed Services Revenue','إيرادات الخدمات المُدارة','REVENUE','OPERATING_REVENUE','CREDIT',false,414),
  (v_entity_id,'4200','Other Income','إيرادات أخرى','REVENUE','OTHER_REVENUE','CREDIT',false,420),
  (v_entity_id,'4210','Interest Income','إيرادات الفوائد','REVENUE','OTHER_REVENUE','CREDIT',false,421),
  (v_entity_id,'4220','Miscellaneous Income','إيرادات متنوعة','REVENUE','OTHER_REVENUE','CREDIT',false,422)
  ON CONFLICT (entity_id, account_code) DO NOTHING;

  -- ── COST OF REVENUE (5xxx) ─────────────────────────────────────────
  INSERT INTO chart_of_accounts (entity_id,account_code,account_name,account_name_ar,account_type,account_subtype,normal_balance,is_system,sort_order) VALUES
  (v_entity_id,'5000','Cost of Revenue','تكلفة الإيرادات','EXPENSE','COGS','DEBIT',true,500),
  (v_entity_id,'5100','Direct Labor','العمالة المباشرة','EXPENSE','COGS','DEBIT',false,510),
  (v_entity_id,'5200','Subcontractor Costs','تكاليف المقاولين من الباطن','EXPENSE','COGS','DEBIT',false,520),
  (v_entity_id,'5300','Direct Materials & Supplies','مواد ومستلزمات مباشرة','EXPENSE','COGS','DEBIT',false,530),
  (v_entity_id,'5400','Site & Field Expenses','مصاريف المواقع','EXPENSE','COGS','DEBIT',false,540),
  (v_entity_id,'5500','Project Travel','سفر المشاريع','EXPENSE','COGS','DEBIT',false,550)
  ON CONFLICT (entity_id, account_code) DO NOTHING;

  -- ── OPERATING EXPENSES (6xxx) ──────────────────────────────────────
  INSERT INTO chart_of_accounts (entity_id,account_code,account_name,account_name_ar,account_type,account_subtype,normal_balance,is_system,sort_order) VALUES
  (v_entity_id,'6000','Operating Expenses','المصروفات التشغيلية','EXPENSE','OPERATING_EXPENSE','DEBIT',true,600),
  -- Employee Costs
  (v_entity_id,'6100','Employee Costs','تكاليف الموظفين','EXPENSE','OPERATING_EXPENSE','DEBIT',false,610),
  (v_entity_id,'6110','Salaries & Wages','الرواتب والأجور','EXPENSE','OPERATING_EXPENSE','DEBIT',true,611),
  (v_entity_id,'6120','GOSI – Employer Contribution','مساهمة صاحب العمل في التأمينات','EXPENSE','OPERATING_EXPENSE','DEBIT',false,612),
  (v_entity_id,'6130','Housing Allowance','بدل السكن','EXPENSE','OPERATING_EXPENSE','DEBIT',false,613),
  (v_entity_id,'6140','Transportation Allowance','بدل المواصلات','EXPENSE','OPERATING_EXPENSE','DEBIT',false,614),
  (v_entity_id,'6150','Food Allowance','بدل الطعام','EXPENSE','OPERATING_EXPENSE','DEBIT',false,615),
  (v_entity_id,'6160','Overtime Expense','مكافأة العمل الإضافي','EXPENSE','OPERATING_EXPENSE','DEBIT',false,616),
  (v_entity_id,'6170','End-of-Service Expense','مصروف مكافأة نهاية الخدمة','EXPENSE','OPERATING_EXPENSE','DEBIT',false,617),
  (v_entity_id,'6180','Leave Salary Expense','مصروف رواتب الإجازات','EXPENSE','OPERATING_EXPENSE','DEBIT',false,618),
  -- Occupancy
  (v_entity_id,'6200','Occupancy','مصاريف المقر','EXPENSE','OPERATING_EXPENSE','DEBIT',false,620),
  (v_entity_id,'6210','Rent','الإيجار','EXPENSE','OPERATING_EXPENSE','DEBIT',false,621),
  (v_entity_id,'6220','Utilities (Electricity, Water)','المرافق','EXPENSE','OPERATING_EXPENSE','DEBIT',false,622),
  -- Administrative
  (v_entity_id,'6300','Administrative Expenses','المصروفات الإدارية','EXPENSE','OPERATING_EXPENSE','DEBIT',false,630),
  (v_entity_id,'6310','Office Supplies','مستلزمات المكتب','EXPENSE','OPERATING_EXPENSE','DEBIT',false,631),
  (v_entity_id,'6320','Communication (Phone, Internet)','الاتصالات','EXPENSE','OPERATING_EXPENSE','DEBIT',false,632),
  (v_entity_id,'6330','Professional Fees (Legal, Audit)','رسوم مهنية','EXPENSE','OPERATING_EXPENSE','DEBIT',false,633),
  (v_entity_id,'6340','Travel & Accommodation','السفر والإقامة','EXPENSE','OPERATING_EXPENSE','DEBIT',false,634),
  (v_entity_id,'6350','Visa & Government Fees','رسوم التأشيرة والحكومة','EXPENSE','OPERATING_EXPENSE','DEBIT',false,635),
  (v_entity_id,'6360','Insurance','التأمين','EXPENSE','OPERATING_EXPENSE','DEBIT',false,636),
  -- Financial
  (v_entity_id,'6400','Financial Expenses','المصروفات المالية','EXPENSE','OTHER_EXPENSE','DEBIT',false,640),
  (v_entity_id,'6410','Bank Charges & Discounting','رسوم بنكية وخصم','EXPENSE','OTHER_EXPENSE','DEBIT',false,641),
  (v_entity_id,'6420','Interest Expense','مصروفات الفوائد','EXPENSE','OTHER_EXPENSE','DEBIT',false,642),
  -- Depreciation & Other
  (v_entity_id,'6500','Depreciation & Amortisation','الاستهلاك والإطفاء','EXPENSE','OPERATING_EXPENSE','DEBIT',false,650),
  (v_entity_id,'6510','Depreciation – Equipment','استهلاك المعدات','EXPENSE','OPERATING_EXPENSE','DEBIT',false,651),
  (v_entity_id,'6520','Depreciation – Furniture','استهلاك الأثاث','EXPENSE','OPERATING_EXPENSE','DEBIT',false,652),
  (v_entity_id,'6530','Depreciation – Vehicles','استهلاك المركبات','EXPENSE','OPERATING_EXPENSE','DEBIT',false,653),
  (v_entity_id,'6600','Miscellaneous Expenses','مصروفات متنوعة','EXPENSE','OPERATING_EXPENSE','DEBIT',false,660)
  ON CONFLICT (entity_id, account_code) DO NOTHING;

  RAISE NOTICE 'ACCSYS Chart of Accounts seeded successfully (% accounts)',
    (SELECT COUNT(*) FROM chart_of_accounts WHERE entity_id = v_entity_id);
END $$;


-- ═══════════════════════════════════════════════════════════════════════
-- SEED: Default Bank Accounts for ACCSYS
-- ═══════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_entity_id  uuid;
  v_coa_1110   uuid;
  v_coa_1120   uuid;
  v_coa_1130   uuid;
  v_coa_1140   uuid;
BEGIN
  SELECT id INTO v_entity_id FROM entities WHERE entity_code = 'ACCSYS' LIMIT 1;
  IF v_entity_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_coa_1110 FROM chart_of_accounts WHERE entity_id = v_entity_id AND account_code = '1110';
  SELECT id INTO v_coa_1120 FROM chart_of_accounts WHERE entity_id = v_entity_id AND account_code = '1120';
  SELECT id INTO v_coa_1130 FROM chart_of_accounts WHERE entity_id = v_entity_id AND account_code = '1130';
  SELECT id INTO v_coa_1140 FROM chart_of_accounts WHERE entity_id = v_entity_id AND account_code = '1140';

  INSERT INTO bank_accounts (entity_id, coa_account_id, account_name, bank_name, account_type, currency, sort_order, notes)
  VALUES
    (v_entity_id, v_coa_1110, 'ANB Main Operations',          'Arab National Bank', 'BANK',       'SAR', 1, 'ANB-15 — primary operations account'),
    (v_entity_id, v_coa_1120, 'ANB Contra Distribution (39)', 'Arab National Bank', 'BANK',       'SAR', 2, 'ANB-39 — contra/distribution account'),
    (v_entity_id, v_coa_1130, 'ANB Contra Distribution (77)', 'Arab National Bank', 'BANK',       'SAR', 3, 'ANB-77 — contra/distribution account'),
    (v_entity_id, v_coa_1140, 'Petty Cash',                   NULL,                 'PETTY_CASH', 'SAR', 4, 'Office petty cash float')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'ACCSYS bank accounts seeded.';
END $$;
