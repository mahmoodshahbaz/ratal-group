-- ================================================================
-- PART 1: CREATE MISSING TABLES (safe to re-run — IF NOT EXISTS)
-- ================================================================

CREATE TABLE IF NOT EXISTS contractors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id),
  contractor_code TEXT, contractor_name TEXT NOT NULL,
  contact_person TEXT, contact_email TEXT, contact_phone TEXT,
  address TEXT, vat_number TEXT, payment_terms INT DEFAULT 30,
  status TEXT DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id),
  job_no TEXT, project_id UUID REFERENCES projects(id),
  department TEXT, contractor_id UUID REFERENCES contractors(id),
  customer_id UUID REFERENCES customers(id),
  job_type TEXT, description TEXT,
  unit_price NUMERIC(12,2) DEFAULT 0, quantity NUMERIC(10,2) DEFAULT 1,
  total_job_value NUMERIC(14,2) DEFAULT 0,
  site_no TEXT, site_name TEXT, status TEXT DEFAULT 'PENDING',
  completion_date DATE, remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS money_request_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  money_request_id UUID NOT NULL REFERENCES money_requests(id) ON DELETE CASCADE,
  line_type TEXT DEFAULT 'TEAM_EXPENSES',
  supplier_name TEXT, job_no TEXT, site_no TEXT, iban TEXT,
  amount NUMERIC(12,2) DEFAULT 0, remarks TEXT, sort_order INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS po_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_number INT DEFAULT 1, job_type TEXT, description TEXT,
  quantity NUMERIC(10,2) DEFAULT 1, unit_price NUMERIC(12,2) DEFAULT 0,
  line_amount NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  remarks TEXT
);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  line_number INT DEFAULT 1, description TEXT NOT NULL,
  quantity NUMERIC(10,2) DEFAULT 1, unit_price NUMERIC(12,2) DEFAULT 0,
  vat_rate NUMERIC(5,2) DEFAULT 15,
  line_subtotal NUMERIC(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  vat_amount NUMERIC(14,2) DEFAULT 0, line_total NUMERIC(14,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id),
  request_number TEXT, expense_date DATE DEFAULT CURRENT_DATE,
  department TEXT, employee_id UUID REFERENCES employees(id),
  project_id UUID REFERENCES projects(id),
  job_no TEXT, site_no TEXT, contractor_id UUID REFERENCES contractors(id),
  expense_mode TEXT DEFAULT 'EXPENSE', expense_category TEXT,
  vat_paid BOOLEAN DEFAULT FALSE,
  amount NUMERIC(12,2) DEFAULT 0, vat_amount NUMERIC(12,2) DEFAULT 0,
  total_amount NUMERIC(12,2) DEFAULT 0,
  vendor_name TEXT, photo_url TEXT,
  gps_lat NUMERIC(10,6), gps_lng NUMERIC(10,6),
  status TEXT DEFAULT 'SUBMITTED', remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id),
  payroll_month TEXT NOT NULL, employee_id UUID NOT NULL REFERENCES employees(id),
  department TEXT,
  basic NUMERIC(12,2) DEFAULT 0, hra NUMERIC(12,2) DEFAULT 0,
  conveyance NUMERIC(12,2) DEFAULT 0, technical_allowance NUMERIC(12,2) DEFAULT 0,
  overtime_amount NUMERIC(12,2) DEFAULT 0, bonus NUMERIC(12,2) DEFAULT 0,
  gross_salary NUMERIC(12,2) DEFAULT 0,
  loan_deduction NUMERIC(12,2) DEFAULT 0, penalty_deduction NUMERIC(12,2) DEFAULT 0,
  total_deductions NUMERIC(12,2) DEFAULT 0,
  net_salary NUMERIC(12,2) DEFAULT 0,
  bank_portion NUMERIC(12,2) DEFAULT 0, cash_portion NUMERIC(12,2) DEFAULT 0,
  gosi_rate NUMERIC(5,2) DEFAULT 0, gosi_amount NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'DRAFT', payment_date DATE, remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, payroll_month, employee_id)
);

CREATE TABLE IF NOT EXISTS loans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  department TEXT, loan_date DATE DEFAULT CURRENT_DATE, start_month TEXT,
  principal_amount NUMERIC(12,2) DEFAULT 0, emi_amount NUMERIC(12,2) DEFAULT 0,
  number_of_emi INT DEFAULT 12, paid_emis INT DEFAULT 0,
  balance_amount NUMERIC(12,2) DEFAULT 0, status TEXT DEFAULT 'ACTIVE',
  remarks TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loan_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id),
  emi_number INT NOT NULL, due_month TEXT NOT NULL,
  emi_amount NUMERIC(12,2) DEFAULT 0, paid_amount NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'PENDING', paid_date DATE
);

CREATE TABLE IF NOT EXISTS penalties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  department TEXT, penalty_date DATE DEFAULT CURRENT_DATE,
  car_number TEXT, penalty_type TEXT, borne_by TEXT DEFAULT 'EMPLOYEE',
  amount NUMERIC(10,2) DEFAULT 0, paid_amount NUMERIC(10,2) DEFAULT 0,
  status TEXT DEFAULT 'PENDING', remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vacations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  department TEXT, vacation_type TEXT DEFAULT 'ANNUAL',
  vacation_status TEXT DEFAULT 'PENDING',
  start_date DATE, end_date DATE, total_days INT DEFAULT 0,
  ticket_eligible BOOLEAN DEFAULT FALSE, ticket_amount NUMERIC(10,2) DEFAULT 0,
  approved_by TEXT, remarks TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id),
  site_no TEXT NOT NULL, site_name TEXT,
  project_id UUID REFERENCES projects(id),
  contractor_id UUID REFERENCES contractors(id),
  customer_id UUID REFERENCES customers(id),
  department TEXT, location TEXT,
  gps_lat NUMERIC(10,6), gps_lng NUMERIC(10,6),
  notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contra_vouchers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_id UUID NOT NULL REFERENCES entities(id),
  contra_date DATE DEFAULT CURRENT_DATE,
  from_ledger_no TEXT, to_ledger_no TEXT,
  amount NUMERIC(14,2) DEFAULT 0, department TEXT,
  project_id UUID REFERENCES projects(id),
  bank_ref_no TEXT, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recreate user_profiles clean
DROP TABLE IF EXISTS user_profiles CASCADE;
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id UUID REFERENCES entities(id),
  entity_code TEXT DEFAULT 'RAT',
  full_name TEXT, role TEXT NOT NULL DEFAULT 'VIEWER',
  department TEXT, telegram_chat_id TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, full_name, role, entity_code)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', 'VIEWER', 'RAT')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Auto-number triggers
CREATE SEQUENCE IF NOT EXISTS seq_money_request START 1;
CREATE SEQUENCE IF NOT EXISTS seq_purchase_order START 1;

CREATE OR REPLACE FUNCTION gen_money_request_number() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.request_number IS NULL THEN
    NEW.request_number := 'MR-' || TO_CHAR(NOW(),'YYYY') || '-' || LPAD(nextval('seq_money_request')::TEXT,4,'0');
  END IF; RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_money_request_number ON money_requests;
CREATE TRIGGER trg_money_request_number
  BEFORE INSERT ON money_requests FOR EACH ROW EXECUTE FUNCTION gen_money_request_number();

CREATE OR REPLACE FUNCTION gen_po_number() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.po_number IS NULL THEN
    NEW.po_number := 'PO-' || TO_CHAR(NOW(),'YYYY') || '-' || LPAD(nextval('seq_purchase_order')::TEXT,4,'0');
  END IF; RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_po_number ON purchase_orders;
CREATE TRIGGER trg_po_number
  BEFORE INSERT ON purchase_orders FOR EACH ROW EXECUTE FUNCTION gen_po_number();

SELECT 'Tables created ✅' AS status;
SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;
