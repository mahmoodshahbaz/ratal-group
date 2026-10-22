-- ══════════════════════════════════════════════════════════════════════
-- RATAL GROUP — Purchase Orders Redesign
-- Incoming POs (Receivable) + Outgoing POs (Payable)
-- Run in Supabase SQL Editor → New Query → Run
-- Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS guards)
-- ══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 1: OUTGOING PO SEQUENCE (auto-number per entity per year)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS po_sequences (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   UUID NOT NULL REFERENCES entities(id),
  year        INT  NOT NULL,
  last_seq    INT  NOT NULL DEFAULT 0,
  UNIQUE (entity_id, year)
);

ALTER TABLE po_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "entity_access_po_seq" ON po_sequences;
CREATE POLICY "entity_access_po_seq" ON po_sequences FOR ALL USING (auth.uid() IS NOT NULL);

-- Helper function: atomically increment and return next PO sequence number
CREATE OR REPLACE FUNCTION next_po_sequence(p_entity_id UUID, p_year INT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE v_seq INT;
BEGIN
  INSERT INTO po_sequences (entity_id, year, last_seq)
    VALUES (p_entity_id, p_year, 1)
    ON CONFLICT (entity_id, year)
    DO UPDATE SET last_seq = po_sequences.last_seq + 1
    RETURNING last_seq INTO v_seq;
  RETURN v_seq;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 2: INCOMING POs (from Main Contractors — Accounts Receivable)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incoming_pos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID NOT NULL REFERENCES entities(id),

  -- Header
  po_date             DATE NOT NULL DEFAULT CURRENT_DATE,
  department_id       UUID REFERENCES departments(id),
  dept_head_id        UUID REFERENCES employees(id),   -- auto-filled from dept
  project_id          UUID REFERENCES projects(id),
  site_id             UUID REFERENCES site_masters(id),  -- optional

  -- Contractor (who issued this PO to us)
  contractor_id       UUID REFERENCES contractors(id),
  contractor_po_number TEXT NOT NULL,  -- their PO ref — used in all invoices

  -- Job
  job_type            TEXT,            -- see JOB_TYPES constant in app
  description         TEXT,

  -- Financial summary (denormalised from items for quick queries)
  subtotal            NUMERIC(14,2) DEFAULT 0,
  vat_amount          NUMERIC(14,2) DEFAULT 0,
  total_value         NUMERIC(14,2) DEFAULT 0,

  -- Terms
  payment_terms       TEXT DEFAULT 'CREDIT',
  -- CREDIT | ADVANCE | PARTIAL | MOBILIZATION

  -- Attachment (original PO document from contractor)
  attachment_url      TEXT,
  attachment_name     TEXT,

  -- Status
  status              TEXT DEFAULT 'ACTIVE',
  -- ACTIVE | INVOICED | CLOSED | CANCELLED

  -- Change order tracking
  has_change_orders   BOOLEAN DEFAULT FALSE,
  original_value      NUMERIC(14,2),   -- locked when first CO is created

  -- Audit
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  created_by          UUID REFERENCES employees(id),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ipo_entity     ON incoming_pos(entity_id, po_date DESC);
CREATE INDEX IF NOT EXISTS idx_ipo_contractor ON incoming_pos(entity_id, contractor_id);
CREATE INDEX IF NOT EXISTS idx_ipo_project    ON incoming_pos(entity_id, project_id);
CREATE INDEX IF NOT EXISTS idx_ipo_dept       ON incoming_pos(entity_id, department_id);
CREATE INDEX IF NOT EXISTS idx_ipo_con_pono   ON incoming_pos(entity_id, contractor_po_number);

ALTER TABLE incoming_pos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "entity_access_ipo" ON incoming_pos;
CREATE POLICY "entity_access_ipo" ON incoming_pos FOR ALL USING (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 3: INCOMING PO LINE ITEMS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incoming_po_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incoming_po_id UUID NOT NULL REFERENCES incoming_pos(id) ON DELETE CASCADE,
  sort_order    INT DEFAULT 0,
  job_type      TEXT,
  description   TEXT NOT NULL,
  qty           NUMERIC(10,2) DEFAULT 1,
  unit_price    NUMERIC(14,2) DEFAULT 0,
  total         NUMERIC(14,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ipo_items ON incoming_po_items(incoming_po_id);

ALTER TABLE incoming_po_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "entity_access_ipo_items" ON incoming_po_items;
CREATE POLICY "entity_access_ipo_items" ON incoming_po_items FOR ALL USING (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 4: CHANGE ORDERS (against Incoming POs)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS incoming_po_change_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID NOT NULL REFERENCES entities(id),
  incoming_po_id      UUID NOT NULL REFERENCES incoming_pos(id) ON DELETE CASCADE,

  -- CO reference
  co_number           TEXT NOT NULL,    -- CO-001, CO-002 (auto-generated, sequential per PO)
  co_date             DATE NOT NULL DEFAULT CURRENT_DATE,
  contractor_po_number TEXT,            -- inherited from parent PO (sometimes COs have their own ref)

  -- Scope
  job_type            TEXT,
  description         TEXT NOT NULL,
  qty                 NUMERIC(10,2) DEFAULT 1,
  unit_price          NUMERIC(14,2) DEFAULT 0,
  co_value            NUMERIC(14,2) DEFAULT 0,  -- total value of this CO

  -- Running totals (denormalised for display)
  original_po_value   NUMERIC(14,2),    -- snapshot of parent PO value at time of CO
  cumulative_value    NUMERIC(14,2),    -- original + all COs up to this one

  -- Attachment
  attachment_url      TEXT,
  attachment_name     TEXT,

  -- Status
  status              TEXT DEFAULT 'ACTIVE',
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  created_by          UUID REFERENCES employees(id)
);

CREATE INDEX IF NOT EXISTS idx_co_ipo ON incoming_po_change_orders(incoming_po_id);
CREATE INDEX IF NOT EXISTS idx_co_entity ON incoming_po_change_orders(entity_id);

ALTER TABLE incoming_po_change_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "entity_access_co" ON incoming_po_change_orders;
CREATE POLICY "entity_access_co" ON incoming_po_change_orders FOR ALL USING (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 5: OUTGOING POs (to Suppliers/Vendors/Sub-Cons — Accounts Payable)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outgoing_pos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID NOT NULL REFERENCES entities(id),

  -- Auto-generated PO number: RAT-PO-2026-[SUPPLIER_CODE]-001
  po_number           TEXT,             -- set on save, immutable after
  po_year             INT,
  po_seq              INT,

  -- Header
  po_date             DATE NOT NULL DEFAULT CURRENT_DATE,
  department_id       UUID REFERENCES departments(id),
  dept_head_id        UUID REFERENCES employees(id),   -- auto-filled from dept
  requested_by        UUID REFERENCES employees(id),   -- employee who raised request

  -- Project / Site (optional)
  project_id          UUID REFERENCES projects(id),
  site_id             UUID REFERENCES site_masters(id),

  -- Supplier (Vendor / Sub-Con / Local Supplier — vendor_type != CONTRACTOR)
  supplier_id         UUID REFERENCES contractors(id),
  supplier_code       TEXT,            -- snapshot at time of PO (for PO number)

  -- Category & Job
  category            TEXT,
  -- MATERIALS | LABOUR | TRANSPORTATION | EQUIPMENT_RENTAL | SUB_CONTRACT_WORKS
  job_type            TEXT,

  -- Financial summary
  subtotal            NUMERIC(14,2) DEFAULT 0,
  vat_amount          NUMERIC(14,2) DEFAULT 0,
  total_value         NUMERIC(14,2) DEFAULT 0,

  -- Terms
  payment_terms       TEXT DEFAULT 'CREDIT',
  -- CREDIT | ADVANCE | PARTIAL | MOBILIZATION

  -- Approval workflow
  approval_status     TEXT DEFAULT 'PENDING_DH',
  -- PENDING_DH | DH_APPROVED | ISSUED | REJECTED
  approved_by         UUID REFERENCES employees(id),
  approved_at         TIMESTAMPTZ,
  issued_at           TIMESTAMPTZ,
  rejection_reason    TEXT,

  -- Source: desktop DH or field shareable form
  source              TEXT DEFAULT 'DESKTOP',
  -- DESKTOP | FIELD_FORM

  -- Audit
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  created_by          UUID REFERENCES employees(id),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opo_entity   ON outgoing_pos(entity_id, po_date DESC);
CREATE INDEX IF NOT EXISTS idx_opo_supplier ON outgoing_pos(entity_id, supplier_id);
CREATE INDEX IF NOT EXISTS idx_opo_project  ON outgoing_pos(entity_id, project_id);
CREATE INDEX IF NOT EXISTS idx_opo_dept     ON outgoing_pos(entity_id, department_id);
CREATE INDEX IF NOT EXISTS idx_opo_status   ON outgoing_pos(entity_id, approval_status);
CREATE INDEX IF NOT EXISTS idx_opo_pono     ON outgoing_pos(entity_id, po_number);

ALTER TABLE outgoing_pos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "entity_access_opo" ON outgoing_pos;
CREATE POLICY "entity_access_opo" ON outgoing_pos FOR ALL USING (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 6: OUTGOING PO LINE ITEMS
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outgoing_po_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outgoing_po_id  UUID NOT NULL REFERENCES outgoing_pos(id) ON DELETE CASCADE,
  sort_order      INT DEFAULT 0,
  job_type        TEXT,
  description     TEXT NOT NULL,
  qty             NUMERIC(10,2) DEFAULT 1,
  unit_price      NUMERIC(14,2) DEFAULT 0,
  total           NUMERIC(14,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_opo_items ON outgoing_po_items(outgoing_po_id);

ALTER TABLE outgoing_po_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "entity_access_opo_items" ON outgoing_po_items;
CREATE POLICY "entity_access_opo_items" ON outgoing_po_items FOR ALL USING (auth.uid() IS NOT NULL);

-- ─────────────────────────────────────────────────────────────────────
-- SECTION 7: Add vendor_type values to contractors if not already added
-- (Contractors table already has vendor_type from add_vendor_type.sql)
-- Ensure LOCAL_SUPPLIER is a valid option (we just use it as a TEXT value)
-- ─────────────────────────────────────────────────────────────────────
-- No schema change needed — vendor_type is already TEXT on contractors table
-- Values: CONTRACTOR | VENDOR | SUPPLIER | SUB_CONTRACTOR | LOCAL_SUPPLIER

-- ─────────────────────────────────────────────────────────────────────
-- DONE — Tables created:
--   incoming_pos            → Accounts Receivable
--   incoming_po_items       → Line items for incoming
--   incoming_po_change_orders → COs linked to incoming POs
--   outgoing_pos            → Accounts Payable
--   outgoing_po_items       → Line items for outgoing
--   po_sequences            → Auto-increment PO numbering per entity/year
-- ─────────────────────────────────────────────────────────────────────
