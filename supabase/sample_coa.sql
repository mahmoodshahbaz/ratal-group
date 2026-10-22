-- ============================================================
-- ACCSYS — Sample Chart of Accounts
-- 9-digit account code structure:
--   X  YY  ZZ  XXXX
--   │  │   │   └── Detail account (0001-9999)
--   │  │   └────── Sub-category (01-99)
--   │  └────────── Category (10-99)
--   └────────────── Type: 1=Asset 2=Liability 3=Equity 4=Revenue 5=COGS 6=Expense
--
-- Example: 260010001
--   2  60  01  0001
--   Liability → Other Payables → Sub-01 → Account 0001
--
-- REPLACE these codes with Mr. Hamdy's actual 9-digit codes.
-- The account_code column is VARCHAR(20) — any length works.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- Replace :entity_id with your ACCSYS entity UUID, e.g.:
--   SELECT id FROM entities WHERE entity_code = 'ACCSYS';
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE
  eid uuid;
BEGIN
  SELECT id INTO eid FROM entities WHERE entity_code = 'ACCSYS' LIMIT 1;
  IF eid IS NULL THEN
    RAISE EXCEPTION 'ACCSYS entity not found. Update entity_code to match your entities table.';
  END IF;

  -- ────────────────────────────────────────────────────────────
  -- 1. ASSETS  (1YYZZXXXX)
  -- ────────────────────────────────────────────────────────────

  -- Current Assets — Cash & Bank
  INSERT INTO chart_of_accounts (entity_id, account_code, account_name, account_name_ar, account_type, account_subtype, normal_balance, is_system, sort_order) VALUES
    (eid,'110010001','Cash in Hand (Petty Cash)','النقدية في الصندوق','ASSET','CURRENT_ASSET','DEBIT',true,1001),
    (eid,'110020001','ANB-15 — Main Operating Account','البنك الأهلي 15 — حساب العمليات','ASSET','CURRENT_ASSET','DEBIT',true,1002),
    (eid,'110020002','ANB-18 — Main Secondary Account','البنك الأهلي 18 — حساب ثانوي','ASSET','CURRENT_ASSET','DEBIT',true,1003),
    (eid,'110020003','ANB-39 — Field Petty Cash','البنك الأهلي 39 — نقدية ميدانية','ASSET','CURRENT_ASSET','DEBIT',true,1004),
    (eid,'110020004','ANB-77 — Field Petty Cash','البنك الأهلي 77 — نقدية ميدانية','ASSET','CURRENT_ASSET','DEBIT',true,1005),

  -- Current Assets — Receivables
    (eid,'120010001','Accounts Receivable — Trade','ذمم مدينة — تجارية','ASSET','CURRENT_ASSET','DEBIT',true,1010),
    (eid,'120010002','Retention Receivable','محتجزات مستحقة','ASSET','CURRENT_ASSET','DEBIT',true,1011),
    (eid,'120010003','VAT Recoverable (Input VAT)','ضريبة القيمة المضافة — مدخلات','ASSET','CURRENT_ASSET','DEBIT',true,1012),

  -- Current Assets — Advances & Prepayments
    (eid,'130010001','Employee Advances Receivable','سلف موظفين','ASSET','CURRENT_ASSET','DEBIT',true,1020),
    (eid,'130010002','Supplier Advance Payments','دفعات مقدمة للموردين','ASSET','CURRENT_ASSET','DEBIT',false,1021),
    (eid,'130010003','Prepaid Expenses','مصروفات مدفوعة مقدماً','ASSET','CURRENT_ASSET','DEBIT',false,1022),

  -- Fixed Assets
    (eid,'160010001','Vehicles & Equipment — Cost','مركبات ومعدات — التكلفة','ASSET','FIXED_ASSET','DEBIT',false,1030),
    (eid,'160010002','Accumulated Depreciation — Vehicles','مجمع إهلاك المركبات','ASSET','FIXED_ASSET','CREDIT',false,1031),
    (eid,'160020001','Office Furniture & Equipment — Cost','أثاث ومعدات مكتبية — التكلفة','ASSET','FIXED_ASSET','DEBIT',false,1032),
    (eid,'160020002','Accumulated Depreciation — Office Equip','مجمع إهلاك الأثاث','ASSET','FIXED_ASSET','CREDIT',false,1033)

  ON CONFLICT (entity_id, account_code) DO NOTHING;

  -- ────────────────────────────────────────────────────────────
  -- 2. LIABILITIES  (2YYZZXXXX)
  -- ────────────────────────────────────────────────────────────

  INSERT INTO chart_of_accounts (entity_id, account_code, account_name, account_name_ar, account_type, account_subtype, normal_balance, is_system, sort_order) VALUES
    (eid,'210010001','Accounts Payable — Trade','ذمم دائنة — تجارية','LIABILITY','CURRENT_LIABILITY','CREDIT',true,2001),
    (eid,'210010002','Accounts Payable — Subcontractors','ذمم دائنة — مقاولون من الباطن','LIABILITY','CURRENT_LIABILITY','CREDIT',false,2002),
    (eid,'210020001','Accrued Expenses','مصروفات مستحقة','LIABILITY','CURRENT_LIABILITY','CREDIT',false,2003),
    (eid,'210030001','Salaries Payable','رواتب مستحقة الدفع','LIABILITY','CURRENT_LIABILITY','CREDIT',false,2004),
    (eid,'220010001','VAT Payable (Output VAT)','ضريبة القيمة المضافة — مخرجات','LIABILITY','CURRENT_LIABILITY','CREDIT',true,2010),
    (eid,'220010002','GOSI Payable (Employer)','نظام التأمينات الاجتماعية — صاحب عمل','LIABILITY','CURRENT_LIABILITY','CREDIT',false,2011),
    (eid,'220010003','GOSI Payable (Employee)','نظام التأمينات الاجتماعية — موظف','LIABILITY','CURRENT_LIABILITY','CREDIT',false,2012),
    (eid,'230010001','Income Tax Payable','ضريبة الدخل المستحقة','LIABILITY','CURRENT_LIABILITY','CREDIT',false,2020),
    (eid,'260010001','Other Payables','ذمم دائنة أخرى','LIABILITY','CURRENT_LIABILITY','CREDIT',false,2030),
    (eid,'260010002','Advances Received from Clients','دفعات مقدمة من العملاء','LIABILITY','CURRENT_LIABILITY','CREDIT',false,2031),
    (eid,'260010003','Employee Deductions Payable','استقطاعات موظفين','LIABILITY','CURRENT_LIABILITY','CREDIT',false,2032),
    (eid,'270010001','Long-term Loan — Bank','قرض طويل الأجل — بنك','LIABILITY','LONG_TERM_LIABILITY','CREDIT',false,2040)

  ON CONFLICT (entity_id, account_code) DO NOTHING;

  -- ────────────────────────────────────────────────────────────
  -- 3. EQUITY  (3YYZZXXXX)
  -- ────────────────────────────────────────────────────────────

  INSERT INTO chart_of_accounts (entity_id, account_code, account_name, account_name_ar, account_type, account_subtype, normal_balance, is_system, sort_order) VALUES
    (eid,'310010001','Share Capital','رأس المال','EQUITY','EQUITY','CREDIT',true,3001),
    (eid,'310010002','Additional Paid-in Capital','علاوة إصدار','EQUITY','EQUITY','CREDIT',false,3002),
    (eid,'320010001','Retained Earnings','الأرباح المحتجزة','EQUITY','EQUITY','CREDIT',true,3003),
    (eid,'320010002','Current Year Profit / (Loss)','صافي ربح / خسارة السنة الحالية','EQUITY','EQUITY','CREDIT',true,3004)

  ON CONFLICT (entity_id, account_code) DO NOTHING;

  -- ────────────────────────────────────────────────────────────
  -- 4. REVENUE  (4YYZZXXXX)
  -- ────────────────────────────────────────────────────────────

  INSERT INTO chart_of_accounts (entity_id, account_code, account_name, account_name_ar, account_type, account_subtype, normal_balance, is_system, sort_order) VALUES
    (eid,'410010001','Project Revenue — Tower Installation','إيرادات مشاريع — تركيب أبراج','REVENUE','OPERATING_REVENUE','CREDIT',true,4001),
    (eid,'410010002','Project Revenue — Active Installation','إيرادات مشاريع — تركيب إلكتروني','REVENUE','OPERATING_REVENUE','CREDIT',false,4002),
    (eid,'410010003','Project Revenue — Civil Works','إيرادات مشاريع — أعمال مدنية','REVENUE','OPERATING_REVENUE','CREDIT',false,4003),
    (eid,'410010004','Project Revenue — Fibre Optic','إيرادات مشاريع — ألياف ضوئية','REVENUE','OPERATING_REVENUE','CREDIT',false,4004),
    (eid,'410010005','Project Revenue — Maintenance & O&M','إيرادات — صيانة وتشغيل','REVENUE','OPERATING_REVENUE','CREDIT',false,4005),
    (eid,'420010001','Retention Revenue Released','إيرادات محتجزات محررة','REVENUE','OPERATING_REVENUE','CREDIT',false,4010),
    (eid,'430010001','Other Income','إيرادات أخرى','REVENUE','OTHER_REVENUE','CREDIT',false,4020)

  ON CONFLICT (entity_id, account_code) DO NOTHING;

  -- ────────────────────────────────────────────────────────────
  -- 5. DIRECT COSTS / COGS  (5YYZZXXXX)
  -- ────────────────────────────────────────────────────────────

  INSERT INTO chart_of_accounts (entity_id, account_code, account_name, account_name_ar, account_type, account_subtype, normal_balance, is_system, sort_order) VALUES
    (eid,'510010001','Direct Labour — Field Staff','عمالة مباشرة — كوادر ميدانية','EXPENSE','COGS','DEBIT',false,5001),
    (eid,'510010002','Outsourced Labour','عمالة مستأجرة','EXPENSE','COGS','DEBIT',false,5002),
    (eid,'510020001','Subcontractor Payments','مدفوعات المقاولين من الباطن','EXPENSE','COGS','DEBIT',true,5010),
    (eid,'510030001','Materials & Equipment Purchased','مواد ومعدات مشتراة','EXPENSE','COGS','DEBIT',true,5020),
    (eid,'510040001','Site & Field Expenses','مصروفات موقع وميدانية','EXPENSE','COGS','DEBIT',true,5030),
    (eid,'510050001','Transport & Logistics — Field','نقل ولوجستيات ميدانية','EXPENSE','COGS','DEBIT',false,5040)

  ON CONFLICT (entity_id, account_code) DO NOTHING;

  -- ────────────────────────────────────────────────────────────
  -- 6. OPERATING EXPENSES  (6YYZZXXXX)
  -- ────────────────────────────────────────────────────────────

  INSERT INTO chart_of_accounts (entity_id, account_code, account_name, account_name_ar, account_type, account_subtype, normal_balance, is_system, sort_order) VALUES
  -- Payroll
    (eid,'610010001','Staff Salaries — ACCSYS','رواتب الموظفين','EXPENSE','OPERATING_EXPENSE','DEBIT',true,6001),
    (eid,'610010002','Housing Allowance','بدل السكن','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6002),
    (eid,'610010003','Transportation Allowance','بدل المواصلات','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6003),
    (eid,'610010004','Food Allowance','بدل الطعام','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6004),
    (eid,'610010005','Overtime Payments','مكافآت العمل الإضافي','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6005),
    (eid,'610020001','GOSI Contributions — Employer Share','اشتراكات التأمينات — حصة صاحب العمل','EXPENSE','OPERATING_EXPENSE','DEBIT',true,6010),
    (eid,'610020002','End of Service Benefits (Provision)','مخصص مكافأة نهاية الخدمة','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6011),
    (eid,'610020003','Visa & Work Permit Costs','رسوم التأشيرة وتصاريح العمل','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6012),
  -- Occupancy
    (eid,'620010001','Office Rent','إيجار المكتب','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6020),
    (eid,'620010002','Utilities (Electric, Water, Gas)','المرافق (كهرباء، ماء، غاز)','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6021),
  -- Admin & Office
    (eid,'630010001','Office Supplies & Stationery','مستلزمات المكتب والقرطاسية','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6030),
    (eid,'630020001','Communication & Telecom','اتصالات وتليكوم','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6031),
    (eid,'630030001','Professional Fees (Audit & Legal)','رسوم مهنية (تدقيق وقانونية)','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6032),
    (eid,'630040001','Travel & Accommodation','سفر وإقامة','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6033),
    (eid,'630050001','Government & Licensing Fees','رسوم حكومية وتراخيص','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6034),
    (eid,'630060001','Insurance Premiums','أقساط التأمين','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6035),
  -- Finance & Bank
    (eid,'640010001','Bank Charges & SCF Fees','رسوم بنكية وخدمات التمويل','EXPENSE','OPERATING_EXPENSE','DEBIT',true,6040),
    (eid,'640010002','Foreign Exchange Losses','خسائر فروق العملات','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6041),
  -- Depreciation
    (eid,'650010001','Depreciation — Vehicles & Equipment','إهلاك المركبات والمعدات','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6050),
    (eid,'650010002','Depreciation — Office Equipment','إهلاك معدات المكتب','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6051),
  -- Other
    (eid,'660010001','Miscellaneous Expenses','مصروفات متنوعة','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6060),
    (eid,'660010002','Penalties & Fines','غرامات وجزاءات','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6061),
    (eid,'660010003','Charitable Donations','تبرعات','EXPENSE','OPERATING_EXPENSE','DEBIT',false,6062)

  ON CONFLICT (entity_id, account_code) DO NOTHING;

END $$;

-- ──────────────────────────────────────────────────────────────
-- Verify: check inserted accounts
-- ──────────────────────────────────────────────────────────────
-- SELECT account_code, account_name, account_type, normal_balance
-- FROM chart_of_accounts
-- WHERE entity_id = (SELECT id FROM entities WHERE entity_code = 'ACCSYS')
-- ORDER BY account_code;
