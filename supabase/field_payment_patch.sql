-- ══════════════════════════════════════════════════════════════════
-- FIELD PAYMENT DISTRIBUTIONS PATCH
-- Run in Supabase SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════

-- ── Main distributions table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS field_payment_distributions (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID    NOT NULL REFERENCES entities(id),

  -- Source
  from_account      TEXT    NOT NULL,          -- ANB-77 | ANB-39 | ANB-15 | etc.
  dept_bucket       TEXT,                       -- TISU | NISU | CISU | ITSU  (ANB-39 split tracking)
  department_id     UUID    REFERENCES departments(id),
  money_request_id  UUID    REFERENCES money_requests(id),  -- optional link to MR

  -- Payment details
  payment_date      DATE    NOT NULL DEFAULT CURRENT_DATE,
  recipient_type    TEXT    NOT NULL CHECK (recipient_type IN ('EMPLOYEE','SUBCON','SUPPLIER')),
  recipient_id      UUID,                       -- employee or contractor id
  recipient_name    TEXT    NOT NULL,
  po_id             UUID    REFERENCES projects(id),  -- sub-con PO reference
  amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  purpose           TEXT,

  -- Status lifecycle
  -- EMPLOYEE/SUBCON: PENDING_ACK → ACKNOWLEDGED → COMPLETE
  -- SUPPLIER:        INVOICE_PENDING → INVOICE_RECEIVED → COMPLETE
  status            TEXT    NOT NULL DEFAULT 'PENDING_ACK',

  -- Acknowledgment (Employee & SubCon)
  acknowledged_at   TIMESTAMPTZ,
  acknowledged_by   UUID,                       -- who tapped acknowledge

  -- Invoice (SubCon & Supplier)
  invoice_url       TEXT,
  invoice_number    TEXT,
  invoice_date      DATE,
  invoice_amount    NUMERIC(12,2),
  vat_amount        NUMERIC(12,2) DEFAULT 0,
  invoice_uploaded_by UUID,                     -- could be staff on behalf
  invoice_uploaded_at TIMESTAMPTZ,

  -- Audit
  submitted_by      UUID,
  submitted_on_behalf_of UUID,                  -- if admin uploaded for someone
  notes             TEXT,
  reminder_count    INT DEFAULT 0,
  last_reminder_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Cash top-up reports (Sarzameen paid on company's behalf) ──────
CREATE TABLE IF NOT EXISTS cash_topup_reports (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID    NOT NULL REFERENCES entities(id),
  reported_by       UUID    REFERENCES employees(id),
  paid_to           TEXT    NOT NULL,            -- free text: who received the cash
  paid_to_type      TEXT    DEFAULT 'SUPPLIER',  -- EMPLOYEE | SUBCON | SUPPLIER | TRANSPORTER
  amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  purpose           TEXT,
  payment_date      DATE    NOT NULL DEFAULT CURRENT_DATE,
  money_request_id  UUID    REFERENCES money_requests(id),
  field_payment_id  UUID    REFERENCES field_payment_distributions(id),
  status            TEXT    DEFAULT 'PENDING_APPROVAL',  -- PENDING_APPROVAL | APPROVED | REIMBURSED | REJECTED
  approved_by       UUID,
  approved_at       TIMESTAMPTZ,
  reimbursed_at     TIMESTAMPTZ,
  invoice_url       TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fpd_entity     ON field_payment_distributions(entity_id);
CREATE INDEX IF NOT EXISTS idx_fpd_status     ON field_payment_distributions(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_fpd_recipient  ON field_payment_distributions(entity_id, recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_fpd_account    ON field_payment_distributions(entity_id, from_account, payment_date);
CREATE INDEX IF NOT EXISTS idx_fpd_dept       ON field_payment_distributions(entity_id, dept_bucket);
CREATE INDEX IF NOT EXISTS idx_ctr_entity     ON cash_topup_reports(entity_id);
CREATE INDEX IF NOT EXISTS idx_ctr_status     ON cash_topup_reports(entity_id, status);

-- ── RLS ───────────────────────────────────────────────────────────
ALTER TABLE field_payment_distributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_topup_reports          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entity_access_fpd" ON field_payment_distributions;
CREATE POLICY "entity_access_fpd" ON field_payment_distributions
  FOR ALL USING (
    entity_id IN (
      SELECT entity_id FROM user_entities WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "entity_access_ctr" ON cash_topup_reports;
CREATE POLICY "entity_access_ctr" ON cash_topup_reports
  FOR ALL USING (
    entity_id IN (
      SELECT entity_id FROM user_entities WHERE user_id = auth.uid()
    )
  );
