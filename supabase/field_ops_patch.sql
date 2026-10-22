-- ═══════════════════════════════════════════════════════════════════════
-- FIELD OPERATIONS PATCH — Run in Supabase SQL Editor
-- Covers: MR distribution redesign, site assignments, payment vouchers,
--         QR identity, food allowance rate, SubCon enhancements
-- ═══════════════════════════════════════════════════════════════════════

-- ─── 1. EMPLOYEES — add QR token + food allowance rate ───────────────

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS qr_token          TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS food_allowance_rate NUMERIC(8,2) DEFAULT 30;

-- Generate QR tokens for existing employees who don't have one
UPDATE employees
SET qr_token = 'EMP-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8))
WHERE qr_token IS NULL;

CREATE INDEX IF NOT EXISTS idx_employees_qr ON employees(qr_token);

-- ─── 2. CONTRACTORS — add type + QR token for SubCons ────────────────

ALTER TABLE contractors
  ADD COLUMN IF NOT EXISTS contractor_type  TEXT DEFAULT 'SUPPLIER',
  -- SUPPLIER | SUBCON | CONTRACTOR
  ADD COLUMN IF NOT EXISTS qr_token         TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS department       TEXT,
  -- Which dept uses this subcon: NISU|TISU|CISU|ITSU
  ADD COLUMN IF NOT EXISTS specialization   TEXT,
  ADD COLUMN IF NOT EXISTS bank_name        TEXT,
  ADD COLUMN IF NOT EXISTS iban             TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_no  TEXT;

-- Generate QR tokens for existing contractors
UPDATE contractors
SET qr_token = 'SUB-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 8))
WHERE qr_token IS NULL;

CREATE INDEX IF NOT EXISTS idx_contractors_qr   ON contractors(qr_token);
CREATE INDEX IF NOT EXISTS idx_contractors_type ON contractors(contractor_type);

-- ─── 3. MONEY REQUESTS — add acknowledgement + paid_from ─────────────

ALTER TABLE money_requests
  ADD COLUMN IF NOT EXISTS paid_from              TEXT,
  -- ANB-15 | ANB-39 | ANB-77 | ANB-18
  ADD COLUMN IF NOT EXISTS dh_acknowledged        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dh_acknowledged_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dh_acknowledged_by     UUID REFERENCES employees(id),
  -- person who triggered acknowledgement (DH or Accounts on behalf)
  ADD COLUMN IF NOT EXISTS dh_on_behalf_of        UUID REFERENCES employees(id),
  -- original DH if Accounts did it; NULL if DH did it themselves
  ADD COLUMN IF NOT EXISTS total_distributed      NUMERIC(14,2) DEFAULT 0;
  -- auto-updated by trigger when mr_distributions rows change

-- ─── 4. MONEY REQUEST LINES — add employee + funding tracking ────────

ALTER TABLE money_request_lines
  ADD COLUMN IF NOT EXISTS employee_id     UUID REFERENCES employees(id),
  -- planned recipient (optional at request time, can be filled later)
  ADD COLUMN IF NOT EXISTS funded_status   TEXT DEFAULT 'PENDING',
  -- PENDING | FUNDS_SENT
  ADD COLUMN IF NOT EXISTS funded_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS funded_by       UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS paid_from       TEXT,
  -- ANB-15 | ANB-39 | ANB-77 | ANB-18 (which account this line came from)
  ADD COLUMN IF NOT EXISTS bank_ref        TEXT;

CREATE INDEX IF NOT EXISTS idx_mrl_employee ON money_request_lines(employee_id);
CREATE INDEX IF NOT EXISTS idx_mrl_funded   ON money_request_lines(funded_status);

-- ─── 5. MR DISTRIBUTIONS — actual distribution (may differ from lines) ──

CREATE TABLE IF NOT EXISTS mr_distributions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  money_request_id  UUID NOT NULL REFERENCES money_requests(id) ON DELETE CASCADE,
  employee_id       UUID NOT NULL REFERENCES employees(id),
  amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Who created this distribution entry
  distributed_by    UUID REFERENCES employees(id),
  -- If Accounts acted on behalf of DH, store the DH here
  on_behalf_of_dh   UUID REFERENCES employees(id),
  distributed_at    TIMESTAMPTZ DEFAULT NOW(),
  -- Acknowledgement via QR
  status            TEXT DEFAULT 'PENDING',
  -- PENDING | NOTIFIED | ACKNOWLEDGED
  notified_at       TIMESTAMPTZ,
  acknowledged_at   TIMESTAMPTZ,
  acknowledged_via  TEXT DEFAULT 'QR',
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE mr_distributions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'auth_mr_dist' AND tablename = 'mr_distributions'
  ) THEN
    CREATE POLICY "auth_mr_dist" ON mr_distributions
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mrd_request    ON mr_distributions(money_request_id);
CREATE INDEX IF NOT EXISTS idx_mrd_employee   ON mr_distributions(employee_id, status);

-- Trigger: keep money_requests.total_distributed in sync
CREATE OR REPLACE FUNCTION sync_mr_total_distributed()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE money_requests
  SET total_distributed = (
    SELECT COALESCE(SUM(amount), 0)
    FROM mr_distributions
    WHERE money_request_id = COALESCE(NEW.money_request_id, OLD.money_request_id)
  )
  WHERE id = COALESCE(NEW.money_request_id, OLD.money_request_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_mr_distributed ON mr_distributions;
CREATE TRIGGER trg_sync_mr_distributed
  AFTER INSERT OR UPDATE OR DELETE ON mr_distributions
  FOR EACH ROW EXECUTE FUNCTION sync_mr_total_distributed();

-- ─── 6. SITE ASSIGNMENTS — PM assigns employees/SubCons to sites daily ──

CREATE TABLE IF NOT EXISTS site_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID REFERENCES entities(id),
  site_master_id  UUID NOT NULL REFERENCES site_masters(id) ON DELETE CASCADE,
  sm_id           VARCHAR(30),                -- denormalised for quick lookup
  assignment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Assignee — either employee OR subcon, not both
  assignee_type   TEXT NOT NULL DEFAULT 'EMPLOYEE',
  -- EMPLOYEE | SUBCON
  employee_id     UUID REFERENCES employees(id),
  subcon_id       UUID REFERENCES contractors(id),
  -- Site characteristics for this assignee
  is_remote       BOOLEAN DEFAULT TRUE,
  -- TRUE = food allowance eligible; FALSE = local, form disabled
  scope_type      TEXT,
  -- Drives milestone list for SubCon:
  -- TOWER_INSTALLATION | ACTIVE_INSTALLATION | CIVIL | FIBRE | DOCUMENTATION | TESTING
  -- PM / Accounts who created the assignment
  assigned_by     UUID REFERENCES employees(id),
  status          TEXT DEFAULT 'ACTIVE',
  -- ACTIVE | COMPLETED | CANCELLED
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE site_assignments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'auth_site_assign' AND tablename = 'site_assignments'
  ) THEN
    CREATE POLICY "auth_site_assign" ON site_assignments
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sa_site     ON site_assignments(site_master_id, assignment_date);
CREATE INDEX IF NOT EXISTS idx_sa_employee ON site_assignments(employee_id, assignment_date);
CREATE INDEX IF NOT EXISTS idx_sa_subcon   ON site_assignments(subcon_id, assignment_date);
CREATE INDEX IF NOT EXISTS idx_sa_date     ON site_assignments(assignment_date, status);

-- ─── 7. PAYMENT VOUCHERS — SubCon payment acknowledgement ────────────

CREATE TABLE IF NOT EXISTS payment_vouchers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID REFERENCES entities(id),
  voucher_number    TEXT UNIQUE,             -- PV-2026-001
  subcon_id         UUID NOT NULL REFERENCES contractors(id),
  po_id             UUID REFERENCES purchase_orders(id),
  site_master_id    UUID REFERENCES site_masters(id),
  sm_id             VARCHAR(30),
  amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_type      TEXT DEFAULT 'MILESTONE',
  -- ADVANCE | MILESTONE | FINAL
  milestone_ref     TEXT,
  -- Which milestone this payment is for
  -- One-time acknowledgement token
  token             TEXT UNIQUE DEFAULT 'PV-' || gen_random_uuid()::TEXT,
  token_used        BOOLEAN DEFAULT FALSE,
  -- Status
  status            TEXT DEFAULT 'PENDING',
  -- PENDING | ACKNOWLEDGED | RELEASED | CANCELLED
  -- Acknowledgement details
  acknowledged_at   TIMESTAMPTZ,
  acknowledged_mode TEXT,
  -- DIGITAL | WITNESSED | PHOTO
  witnessed_by      UUID REFERENCES employees(id),
  photo_url         TEXT,
  -- Release (money sent after acknowledgement)
  released_at       TIMESTAMPTZ,
  released_by       UUID REFERENCES employees(id),
  paid_from         TEXT,
  -- ANB-15 | ANB-39 | ANB-77
  bank_ref          TEXT,
  -- Generation
  generated_by      UUID REFERENCES employees(id),
  generated_at      TIMESTAMPTZ DEFAULT NOW(),
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE payment_vouchers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'auth_pv' AND tablename = 'payment_vouchers'
  ) THEN
    CREATE POLICY "auth_pv" ON payment_vouchers
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Auto-generate voucher number
CREATE SEQUENCE IF NOT EXISTS seq_payment_voucher START 1;

CREATE OR REPLACE FUNCTION gen_voucher_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.voucher_number IS NULL THEN
    NEW.voucher_number := 'PV-' || TO_CHAR(NOW(), 'YYYY') || '-' ||
                          LPAD(nextval('seq_payment_voucher')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_voucher_number ON payment_vouchers;
CREATE TRIGGER trg_voucher_number
  BEFORE INSERT ON payment_vouchers
  FOR EACH ROW EXECUTE FUNCTION gen_voucher_number();

CREATE INDEX IF NOT EXISTS idx_pv_subcon  ON payment_vouchers(subcon_id, status);
CREATE INDEX IF NOT EXISTS idx_pv_site    ON payment_vouchers(site_master_id);
CREATE INDEX IF NOT EXISTS idx_pv_token   ON payment_vouchers(token);
CREATE INDEX IF NOT EXISTS idx_pv_po      ON payment_vouchers(po_id);

-- ─── 8. EXPENSES — add RECEIVING mode columns (already has expense_mode) ─

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS received_from_employee UUID REFERENCES employees(id),
  -- If RECEIVING mode: who handed over the cash (DH/PM)
  ADD COLUMN IF NOT EXISTS mr_distribution_id     UUID REFERENCES mr_distributions(id),
  -- Links this expense receipt to the specific distribution
  ADD COLUMN IF NOT EXISTS site_master_id          UUID REFERENCES site_masters(id),
  ADD COLUMN IF NOT EXISTS sm_id                   VARCHAR(30);

-- ─── 9. FOOD ALLOWANCES — add site_master link ───────────────────────

ALTER TABLE food_allowances
  ADD COLUMN IF NOT EXISTS site_master_id UUID REFERENCES site_masters(id),
  ADD COLUMN IF NOT EXISTS sm_id          VARCHAR(30),
  ADD COLUMN IF NOT EXISTS daily_rate     NUMERIC(8,2) DEFAULT 30;

-- ─── 10. OVERTIME REQUESTS — ensure site link exists ─────────────────

ALTER TABLE overtime_requests
  ADD COLUMN IF NOT EXISTS site_master_id UUID REFERENCES site_masters(id),
  ADD COLUMN IF NOT EXISTS sm_id          VARCHAR(30);

-- ─── 11. VIEW: pending distributions for QR portal ───────────────────

CREATE OR REPLACE VIEW v_pending_distributions AS
SELECT
  d.id,
  d.money_request_id,
  mr.request_number,
  d.employee_id,
  e.full_name_en    AS employee_name,
  e.qr_token,
  dep.dept_code     AS department,
  d.amount,
  d.distributed_by,
  db.full_name_en   AS distributed_by_name,
  d.on_behalf_of_dh,
  dh.full_name_en   AS dh_name,
  d.status,
  d.distributed_at,
  mr.paid_from,
  mr.request_date
FROM mr_distributions d
JOIN money_requests mr        ON mr.id  = d.money_request_id
JOIN employees e              ON e.id   = d.employee_id
LEFT JOIN departments dep     ON dep.id = e.department_id
LEFT JOIN employees db        ON db.id  = d.distributed_by
LEFT JOIN employees dh        ON dh.id  = d.on_behalf_of_dh
WHERE d.status IN ('PENDING', 'NOTIFIED');

-- ─── 12. VIEW: today's site assignment for QR lookup ─────────────────

CREATE OR REPLACE VIEW v_today_assignment AS
SELECT
  sa.id              AS assignment_id,
  sa.site_master_id,
  sa.sm_id,
  sm.site_name,
  sm.location,
  sm.service_unit,
  sm.gps_lat,
  sm.gps_lng,
  sa.assignee_type,
  sa.employee_id,
  e.full_name_en     AS employee_name,
  e.qr_token         AS employee_qr,
  dep.dept_code      AS department,
  e.food_allowance_rate,
  e.food_eligible    AS food_allowance_eligible,
  e.ot_allowed,
  sa.subcon_id,
  c.contractor_name  AS subcon_name,
  c.qr_token         AS subcon_qr,
  sa.is_remote,
  sa.scope_type,
  sa.assignment_date,
  sa.status
FROM site_assignments sa
JOIN site_masters sm      ON sm.id  = sa.site_master_id
LEFT JOIN employees e     ON e.id   = sa.employee_id
LEFT JOIN departments dep ON dep.id = e.department_id
LEFT JOIN contractors c   ON c.id   = sa.subcon_id
WHERE sa.assignment_date = CURRENT_DATE
  AND sa.status = 'ACTIVE';

-- ─── 13. VIEW: MR distribution balance check ─────────────────────────

CREATE OR REPLACE VIEW v_mr_distribution_balance AS
SELECT
  mr.id,
  mr.request_number,
  mr.amount          AS requested_amount,
  mr.dh_acknowledged,
  mr.total_distributed,
  (mr.amount - mr.total_distributed) AS unallocated,
  CASE
    WHEN mr.total_distributed > mr.amount THEN 'OVER_DISTRIBUTED'
    WHEN mr.total_distributed = mr.amount THEN 'FULLY_DISTRIBUTED'
    WHEN mr.total_distributed > 0         THEN 'PARTIAL'
    ELSE 'NOT_STARTED'
  END AS distribution_status,
  COUNT(d.id)              AS distribution_count,
  COUNT(CASE WHEN d.status = 'ACKNOWLEDGED' THEN 1 END) AS acknowledged_count
FROM money_requests mr
LEFT JOIN mr_distributions d ON d.money_request_id = mr.id
WHERE mr.status NOT IN ('REJECTED', 'CLOSED')
GROUP BY mr.id, mr.request_number, mr.amount,
         mr.dh_acknowledged, mr.total_distributed;

-- ─── 14. SECURITY: public access for QR portal (field routes) ────────

-- Drop first — return type changed (adding entity_id, basic_salary columns)
DROP FUNCTION IF EXISTS get_employee_by_qr(TEXT);
DROP FUNCTION IF EXISTS get_subcon_by_qr(TEXT);

CREATE OR REPLACE FUNCTION get_employee_by_qr(p_token TEXT)
RETURNS TABLE (
  id                      UUID,
  entity_id               UUID,
  employee_id             TEXT,
  full_name_en            TEXT,
  department              TEXT,
  food_allowance_eligible BOOLEAN,
  food_allowance_rate     NUMERIC,
  ot_allowed              BOOLEAN,
  basic_salary            NUMERIC
) SECURITY DEFINER SET search_path = public AS $$
  SELECT
    e.id,
    e.entity_id,
    e.employee_no,
    e.full_name_en,
    d.dept_code        AS department,
    e.food_eligible    AS food_allowance_eligible,
    e.food_allowance_rate,
    e.ot_allowed,
    e.basic_salary
  FROM employees e
  LEFT JOIN departments d ON d.id = e.department_id
  WHERE e.qr_token = p_token AND e.is_active = TRUE;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION get_subcon_by_qr(p_token TEXT)
RETURNS TABLE (
  id               UUID,
  contractor_name  TEXT,
  contractor_type  TEXT,
  department       TEXT
) SECURITY DEFINER SET search_path = public AS $$
  SELECT id, contractor_name, contractor_type, department
  FROM contractors
  WHERE qr_token = p_token AND status = 'ACTIVE';
$$ LANGUAGE sql;

-- ─── Done ──────────────────────────────────────────────────────────────
-- Tables created:  mr_distributions, site_assignments, payment_vouchers
-- Tables altered:  money_requests, money_request_lines, employees,
--                  contractors, expenses, food_allowances, overtime_submissions
-- Views created:   v_pending_distributions, v_today_assignment,
--                  v_mr_distribution_balance
-- Functions:       get_employee_by_qr, get_subcon_by_qr
-- ──────────────────────────────────────────────────────────────────────
