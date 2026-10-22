-- ============================================================
-- ACCSYS PHASE I SCHEMA — Sub-Contractor Claim
-- Run AFTER phase_h_schema.sql
-- Safe to re-run (IF NOT EXISTS / OR REPLACE)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Sequence for human-readable claim numbers
-- ────────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS subcon_claim_seq START 1 INCREMENT 1;

-- ────────────────────────────────────────────────────────────
-- subcon_claims — one row per subcontractor claim submission
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subcon_claims (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         varchar(10),                           -- RAT / GWT / ACCSYS
  -- claim_number is set by trigger before insert (GENERATED AS is not allowed with volatile fns)
  claim_number      text UNIQUE,

  -- Who submitted
  employee_id       uuid REFERENCES employees(id),
  contractor_id     uuid REFERENCES contractors(id),       -- subcon company

  -- Which site / scope
  assignment_id     uuid REFERENCES site_assignments(id),
  site_name         text,                                  -- denormalised for speed
  scope_type        text,                                  -- from assignment

  -- Claim period
  claim_month       integer CHECK (claim_month BETWEEN 1 AND 12),
  claim_year        integer CHECK (claim_year >= 2020),

  -- Work description
  claim_type        varchar(20) DEFAULT 'LUMPSUM'          -- LUMPSUM | HOURLY | MILESTONE
                    CHECK (claim_type IN ('LUMPSUM','HOURLY','MILESTONE')),
  work_description  text NOT NULL,
  milestones_done   text[],                                -- milestone keys completed this claim
  hours_worked      numeric(8,2),                          -- if HOURLY
  hourly_rate       numeric(10,2),                         -- if HOURLY

  -- Amounts (SAR) — vat_amount + total_amount set by trigger
  claim_amount      numeric(12,2) NOT NULL,
  vat_pct           numeric(5,2) DEFAULT 15,
  vat_amount        numeric(12,2),
  total_amount      numeric(12,2),

  -- Materials / expenses breakdown (optional JSONB array)
  -- [{ item, qty, unit_cost, total }]
  materials_used    jsonb,

  -- Evidence
  photo_url         text,                                  -- primary completion photo
  photo_url_2       text,                                  -- secondary
  document_url      text,                                  -- signed delivery note / BOQ

  -- Notes
  notes             text,

  -- Workflow status
  status            varchar(20) DEFAULT 'SUBMITTED'
                    CHECK (status IN ('SUBMITTED','DH_APPROVED','FINANCE_APPROVED','PAID','REJECTED')),

  -- DH approval
  dh_approved_by    uuid REFERENCES employees(id),
  dh_approved_at    timestamptz,
  dh_notes          text,

  -- Finance
  finance_approved_by uuid REFERENCES employees(id),
  finance_approved_at timestamptz,
  payment_ref       text,
  paid_at           timestamptz,

  -- Audit
  submitted_at      timestamptz DEFAULT now(),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- Trigger: auto-set claim_number, vat_amount, total_amount
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION subcon_claims_before_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Claim number: SC-YYYYMM-NNNN
  IF NEW.claim_number IS NULL THEN
    NEW.claim_number := 'SC-' || to_char(now(), 'YYYYMM') || '-' ||
                        lpad(nextval('subcon_claim_seq')::text, 4, '0');
  END IF;
  -- VAT & total
  NEW.vat_amount  := round(NEW.claim_amount * COALESCE(NEW.vat_pct, 15) / 100, 2);
  NEW.total_amount := round(NEW.claim_amount * (1 + COALESCE(NEW.vat_pct, 15) / 100), 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subcon_claims_before_insert ON subcon_claims;
CREATE TRIGGER trg_subcon_claims_before_insert
  BEFORE INSERT ON subcon_claims
  FOR EACH ROW EXECUTE FUNCTION subcon_claims_before_insert();

-- ────────────────────────────────────────────────────────────
-- RLS — anon key can insert (field workers) and select
-- ────────────────────────────────────────────────────────────
ALTER TABLE subcon_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon insert subcon_claims" ON subcon_claims;
CREATE POLICY "anon insert subcon_claims" ON subcon_claims
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon select subcon_claims" ON subcon_claims;
CREATE POLICY "anon select subcon_claims" ON subcon_claims
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon update subcon_claims" ON subcon_claims;
CREATE POLICY "anon update subcon_claims" ON subcon_claims
  FOR UPDATE TO anon USING (true);

-- ────────────────────────────────────────────────────────────
-- Indexes
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sc_employee    ON subcon_claims(employee_id);
CREATE INDEX IF NOT EXISTS idx_sc_assignment  ON subcon_claims(assignment_id);
CREATE INDEX IF NOT EXISTS idx_sc_status      ON subcon_claims(status);
CREATE INDEX IF NOT EXISTS idx_sc_entity      ON subcon_claims(entity_id);
CREATE INDEX IF NOT EXISTS idx_sc_period      ON subcon_claims(claim_year, claim_month);

-- ────────────────────────────────────────────────────────────
-- View: enriched claim list for DH review panel
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW subcon_claims_view AS
SELECT
  sc.id,
  sc.entity_id,
  sc.claim_number,
  sc.claim_type,
  sc.claim_month,
  sc.claim_year,
  sc.work_description,
  sc.milestones_done,
  sc.hours_worked,
  sc.hourly_rate,
  sc.claim_amount,
  sc.vat_amount,
  sc.total_amount,
  sc.materials_used,
  sc.photo_url,
  sc.photo_url_2,
  sc.document_url,
  sc.notes,
  sc.status,
  sc.dh_notes,
  sc.dh_approved_at,
  sc.payment_ref,
  sc.paid_at,
  sc.submitted_at,
  -- Employee
  e.full_name_en    AS employee_name,
  e.designation     AS employee_designation,
  -- Contractor
  c.contractor_name,
  -- Assignment / site
  sa.site_name,
  sa.scope_type,
  p.project_number,
  p.project_name,
  -- DH approver
  dh.full_name_en   AS dh_approver_name
FROM subcon_claims sc
LEFT JOIN employees    e   ON e.id  = sc.employee_id
LEFT JOIN contractors  c   ON c.id  = sc.contractor_id
LEFT JOIN site_assignments sa ON sa.id = sc.assignment_id
LEFT JOIN projects     p   ON p.id  = sa.project_id
LEFT JOIN employees    dh  ON dh.id = sc.dh_approved_by
ORDER BY sc.submitted_at DESC;

-- ────────────────────────────────────────────────────────────
-- DONE
-- ────────────────────────────────────────────────────────────
