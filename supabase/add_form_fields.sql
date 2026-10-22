-- ─── DEPARTMENTS TABLE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id    UUID REFERENCES entities(id) ON DELETE CASCADE,
  dept_code    VARCHAR(20) UNIQUE,
  dept_name    VARCHAR(100) NOT NULL,
  dept_head_id UUID REFERENCES employees(id),
  pm_id        UUID REFERENCES employees(id),
  supervisor_id UUID REFERENCES employees(id),
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_departments" ON departments;
CREATE POLICY "auth_read_departments" ON departments FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "auth_write_departments" ON departments;
CREATE POLICY "auth_write_departments" ON departments FOR ALL USING (auth.uid() IS NOT NULL);

-- ─── EXPENSES TABLE (add missing columns) ──────────────────────
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS request_number  VARCHAR(30);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS department_id   UUID REFERENCES departments(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS department_name VARCHAR(100);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS requester_name  VARCHAR(150);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS contact_number  VARCHAR(30);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS project_number  VARCHAR(50);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS project_name    VARCHAR(200);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS job_number      VARCHAR(50);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_type    VARCHAR(50);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_category VARCHAR(80);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vat_paid        BOOLEAN DEFAULT FALSE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount          NUMERIC(14,2) DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vat_amount      NUMERIC(14,2) DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS total_amount    NUMERIC(14,2) DEFAULT 0;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vat_number      VARCHAR(50);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS company_name    VARCHAR(200);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS document_url    TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS remarks         TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status         VARCHAR(20) DEFAULT 'PENDING';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS entity_id       UUID REFERENCES entities(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS employee_id     UUID REFERENCES employees(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_date    DATE DEFAULT CURRENT_DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ DEFAULT NOW();

-- RLS on expenses
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_read_expenses" ON expenses;
CREATE POLICY "auth_read_expenses" ON expenses FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "auth_write_expenses" ON expenses;
CREATE POLICY "auth_write_expenses" ON expenses FOR ALL USING (auth.uid() IS NOT NULL);

-- ─── MONEY REQUESTS — add missing columns ──────────────────────
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS request_number    VARCHAR(30);
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS department_id     UUID REFERENCES departments(id);
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS department_name   VARCHAR(100);
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS project_name      VARCHAR(200);
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS po_reference      VARCHAR(80);
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS mr_type           VARCHAR(30) DEFAULT 'CASH';
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS transaction_type  VARCHAR(40);
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS receiver_name     VARCHAR(150);
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS receiver_iban     VARCHAR(34);
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS document_url      TEXT;
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS requester_name    VARCHAR(150);
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS contact_number    VARCHAR(30);
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS needed_by_date    DATE;
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS approved_date     DATE;
ALTER TABLE money_requests ADD COLUMN IF NOT EXISTS paid_date         DATE;

-- ─── OVERTIME REQUESTS — add missing columns ───────────────────
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS department_id   UUID REFERENCES departments(id);
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS department_name VARCHAR(100);
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS requester_name  VARCHAR(150);
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS contact_number  VARCHAR(30);
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS project_number  VARCHAR(50);
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS project_name    VARCHAR(200);
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS job_number      VARCHAR(50);
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS job_type        VARCHAR(50);
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS work_type       VARCHAR(50);
ALTER TABLE overtime_requests ADD COLUMN IF NOT EXISTS request_number  VARCHAR(30);

-- ─── FOOD ALLOWANCES — add missing columns ─────────────────────
ALTER TABLE food_allowances ADD COLUMN IF NOT EXISTS department_id   UUID REFERENCES departments(id);
ALTER TABLE food_allowances ADD COLUMN IF NOT EXISTS department_name VARCHAR(100);
ALTER TABLE food_allowances ADD COLUMN IF NOT EXISTS requester_name  VARCHAR(150);
ALTER TABLE food_allowances ADD COLUMN IF NOT EXISTS contact_number  VARCHAR(30);
ALTER TABLE food_allowances ADD COLUMN IF NOT EXISTS project_number  VARCHAR(50);
ALTER TABLE food_allowances ADD COLUMN IF NOT EXISTS project_name    VARCHAR(200);
ALTER TABLE food_allowances ADD COLUMN IF NOT EXISTS job_number      VARCHAR(50);
ALTER TABLE food_allowances ADD COLUMN IF NOT EXISTS job_type        VARCHAR(50);
ALTER TABLE food_allowances ADD COLUMN IF NOT EXISTS location        VARCHAR(200);
ALTER TABLE food_allowances ADD COLUMN IF NOT EXISTS coverage_type   VARCHAR(20) DEFAULT 'SINGLE';
ALTER TABLE food_allowances ADD COLUMN IF NOT EXISTS no_of_persons   INTEGER DEFAULT 1;
ALTER TABLE food_allowances ADD COLUMN IF NOT EXISTS request_number  VARCHAR(30);
ALTER TABLE food_allowances ADD COLUMN IF NOT EXISTS request_date    DATE DEFAULT CURRENT_DATE;
ALTER TABLE food_allowances ADD COLUMN IF NOT EXISTS approved_date   DATE;
ALTER TABLE food_allowances ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ DEFAULT NOW();

-- ─── PROJECTS — add missing columns ────────────────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_type         VARCHAR(50);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS department_id        UUID REFERENCES departments(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pm_id                UUID REFERENCES employees(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS supervisor_id        UUID REFERENCES employees(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS supervisor_name      VARCHAR(150);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pm_email             VARCHAR(150);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pm_phone             VARCHAR(30);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractor_id        UUID REFERENCES contractors(id);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractor_pm_name   VARCHAR(150);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractor_pm_phone  VARCHAR(30);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractor_pm_email  VARCHAR(150);

-- ─── EMPLOYEES — add missing columns ───────────────────────────
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_type        VARCHAR(20) DEFAULT 'REGULAR';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS designation          VARCHAR(100);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_id        UUID REFERENCES departments(id);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_account_number  VARCHAR(50);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_portion         NUMERIC(14,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS technical_allowance  NUMERIC(14,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS has_car              BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS has_dependents       BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS num_dependents       INTEGER DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS loan_eligible        BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS ot_eligible          BOOLEAN DEFAULT TRUE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS fa_eligible          BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS fa_amount            NUMERIC(14,2) DEFAULT 0;
