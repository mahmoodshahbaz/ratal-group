-- ══════════════════════════════════════════════════════════════════════════════
-- compliance_schema_patch.sql
-- Run once in Supabase SQL Editor — safe to re-run (IF NOT EXISTS throughout)
--
-- Creates / patches:
--   1. documents          — add renewal_status, responsible_person, lead_time_days
--   2. document_renewals  — Option B history log (one row per renewal event)
--   3. iqama_renewals     — Sadad batch header
--   4. iqama_renewal_lines— per-employee breakdown within a batch
--   5. insurance_policies — policy versions (insurer, dates, premium)
--   6. insurance_policy_members — employee + dependent assignments per policy
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 1. PATCH: documents table ─────────────────────────────────────────────────

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS renewal_status      TEXT    DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS responsible_person  TEXT    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lead_time_days      INT     DEFAULT 30;

-- renewal_status values: ACTIVE | SUBMITTED | IN_PROCESS | APPROVED | ARCHIVED
-- lead_time_days: days before expiry to trigger alert (overrides flat 30d default)

COMMENT ON COLUMN documents.renewal_status     IS 'ACTIVE | SUBMITTED | IN_PROCESS | APPROVED | ARCHIVED';
COMMENT ON COLUMN documents.responsible_person IS 'Name or role responsible for renewing this document';
COMMENT ON COLUMN documents.lead_time_days     IS 'Days before expiry to trigger alert — defaults to 30, set per doc type (e.g. Passport=90, MVPI=7)';


-- ── 2. CREATE: document_renewals (Option B history log) ──────────────────────

CREATE TABLE IF NOT EXISTS document_renewals (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           UUID        NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  entity_id             UUID        NOT NULL,

  -- snapshot of the PREVIOUS version before this renewal
  previous_doc_number   TEXT,
  previous_issue_date   DATE,
  previous_expiry_date  DATE,
  previous_file_url     TEXT,
  previous_file_name    TEXT,

  -- new values applied in this renewal
  new_doc_number        TEXT,
  new_issue_date        DATE,
  new_expiry_date       DATE,
  new_file_url          TEXT,
  new_file_name         TEXT,

  -- cost breakdown for this renewal event
  renewal_fee           NUMERIC     DEFAULT 0,   -- e.g. SAR 650 for Iqama
  levy_amount           NUMERIC     DEFAULT 0,   -- e.g. SAR 8500 / 9700 levy
  dependent_fee         NUMERIC     DEFAULT 0,   -- SAR 500 × dependents above 18
  other_fees            NUMERIC     DEFAULT 0,   -- misc govt fees
  total_cost            NUMERIC     GENERATED ALWAYS AS
                          (renewal_fee + levy_amount + dependent_fee + other_fees) STORED,

  -- audit
  renewed_by            TEXT,                    -- name / email of person who did it
  renewed_at            TIMESTAMPTZ DEFAULT NOW(),
  notes                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_doc_renewals_document
  ON document_renewals (document_id);

CREATE INDEX IF NOT EXISTS idx_doc_renewals_entity
  ON document_renewals (entity_id, renewed_at DESC);

COMMENT ON TABLE document_renewals IS
  'Audit log: one row per renewal event. The documents row always holds the current version; this table holds all previous versions.';


-- ── 3. CREATE: iqama_renewals (Sadad batch header) ───────────────────────────

CREATE TABLE IF NOT EXISTS iqama_renewals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID        NOT NULL,

  -- Sadad payment details
  sadad_number    TEXT,                          -- Sadad reference (one batch can cover multiple employees)
  payment_date    DATE,
  bank_ref        TEXT,                          -- bank transaction reference
  paid_by         TEXT,                          -- PRO name / employee who processed it
  total_amount    NUMERIC     DEFAULT 0,         -- sum of all lines (auto-updated by trigger or app)

  status          TEXT        NOT NULL DEFAULT 'PENDING',
  -- PENDING | SADAD_GENERATED | PAID | IQAMAS_UPDATED | CANCELLED

  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE iqama_renewals IS
  'Sadad batch for Iqama renewals. One batch can cover 1–many employees under a single Sadad number.';

COMMENT ON COLUMN iqama_renewals.sadad_number IS
  'Sadad bill reference number generated from MOI/ABSHER. One number can cover multiple employees.';

COMMENT ON COLUMN iqama_renewals.status IS
  'PENDING=not yet paid | SADAD_GENERATED=number obtained | PAID=payment confirmed | IQAMAS_UPDATED=Iqama expiry dates updated | CANCELLED';


-- ── 4. CREATE: iqama_renewal_lines (per-employee within a batch) ──────────────

CREATE TABLE IF NOT EXISTS iqama_renewal_lines (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                  UUID        NOT NULL REFERENCES iqama_renewals(id) ON DELETE CASCADE,
  entity_id                 UUID        NOT NULL,
  employee_id               UUID        REFERENCES employees(id) ON DELETE SET NULL,
  employee_name             TEXT,                    -- cached display name

  -- Iqama details
  iqama_number              TEXT,
  current_expiry_date       DATE,
  new_expiry_date           DATE,                    -- filled after renewal confirmed

  -- Fee breakdown
  renewal_fee               NUMERIC     DEFAULT 650, -- SAR 650 standard Iqama renewal fee
  levy_amount               NUMERIC     DEFAULT 0,   -- 8500 or 9700 depending on Nitaqat band
  dependent_count_above_18  INT         DEFAULT 0,   -- number of dependents aged > 18
  dependent_fee             NUMERIC     GENERATED ALWAYS AS
                              (dependent_count_above_18 * 500) STORED,
  -- SAR 500 per dependent above 18 (family resident fee)
  other_fees                NUMERIC     DEFAULT 0,
  line_total                NUMERIC     GENERATED ALWAYS AS
                              (renewal_fee + levy_amount + (dependent_count_above_18 * 500) + other_fees) STORED,

  status                    TEXT        NOT NULL DEFAULT 'PENDING',
  -- PENDING | PAID | IQAMA_UPDATED | CANCELLED

  notes                     TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_iqama_lines_batch
  ON iqama_renewal_lines (batch_id);

CREATE INDEX IF NOT EXISTS idx_iqama_lines_employee
  ON iqama_renewal_lines (employee_id);

COMMENT ON TABLE iqama_renewal_lines IS
  'One row per employee per Sadad batch. Captures the full fee breakdown: base renewal fee + Nitaqat levy + dependent fees.';

COMMENT ON COLUMN iqama_renewal_lines.levy_amount IS
  'Iqama levy: SAR 8,500 or SAR 9,700 depending on company Nitaqat band. Set per employee.';

COMMENT ON COLUMN iqama_renewal_lines.dependent_count_above_18 IS
  'Number of dependents (family members) aged above 18 — each costs SAR 500 additional fee.';


-- ── 5. CREATE: insurance_policies ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS insurance_policies (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID        NOT NULL,

  policy_number   TEXT        NOT NULL,
  insurer_name    TEXT,                          -- e.g. Bupa Arabia, Tawuniya, MedGulf
  coverage_class  TEXT,                          -- A, B, C, D — or free text
  policy_type     TEXT        DEFAULT 'HEALTH',  -- HEALTH | LIFE | TRAVEL

  start_date      DATE        NOT NULL,
  end_date        DATE        NOT NULL,

  premium_amount  NUMERIC     DEFAULT 0,         -- total annual premium for this policy
  member_count    INT         DEFAULT 0,         -- cached count — updated by app

  is_active       BOOLEAN     DEFAULT TRUE,      -- only one active policy per type at a time
  superseded_by   UUID        REFERENCES insurance_policies(id) ON DELETE SET NULL,
  -- links old policy → new policy on renewal

  file_url        TEXT,                          -- policy document upload
  file_name       TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insurance_policies_entity
  ON insurance_policies (entity_id, is_active, end_date);

COMMENT ON TABLE insurance_policies IS
  'One row per policy version. On renewal: insert new row, set old row superseded_by = new id, old is_active = false.';

COMMENT ON COLUMN insurance_policies.superseded_by IS
  'Points to the newer policy that replaced this one. Enables full renewal history chain.';


-- ── 6. CREATE: insurance_policy_members ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS insurance_policy_members (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id       UUID        NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
  entity_id       UUID        NOT NULL,

  member_type     TEXT        NOT NULL DEFAULT 'EMPLOYEE',
  -- EMPLOYEE | DEPENDENT

  employee_id     UUID        REFERENCES employees(id)          ON DELETE CASCADE,
  dependent_id    UUID        REFERENCES employee_dependents(id) ON DELETE CASCADE,
  -- employee_id always set; dependent_id set when member_type = DEPENDENT

  member_name     TEXT,                          -- cached for fast display
  iqama_number    TEXT,                          -- cached for insurance card matching
  coverage_class  TEXT,                          -- override if this member has different class
  card_number     TEXT,                          -- insurance card number assigned to this member
  card_expiry     DATE,                          -- insurance card expiry (sometimes ≠ policy end)

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ins_members_policy
  ON insurance_policy_members (policy_id);

CREATE INDEX IF NOT EXISTS idx_ins_members_employee
  ON insurance_policy_members (employee_id);

CREATE INDEX IF NOT EXISTS idx_ins_members_dependent
  ON insurance_policy_members (dependent_id);

COMMENT ON TABLE insurance_policy_members IS
  'Links employees and their dependents to a policy. Bulk-insert all members when a new policy is created.';

COMMENT ON COLUMN insurance_policy_members.card_number IS
  'Insurance card number — may differ per member even under the same policy.';


-- ── 7. RLS: enable row-level security on new tables ──────────────────────────

ALTER TABLE document_renewals          ENABLE ROW LEVEL SECURITY;
ALTER TABLE iqama_renewals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE iqama_renewal_lines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_policies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_policy_members   ENABLE ROW LEVEL SECURITY;

-- Permissive policies: authenticated users can read/write their own entity
-- (Supabase auth.uid() maps to users table → entity_id)
-- Replace with your actual auth pattern if different.

DO $$ BEGIN
  -- document_renewals
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='document_renewals' AND policyname='entity_access') THEN
    CREATE POLICY entity_access ON document_renewals USING (true) WITH CHECK (true);
  END IF;
  -- iqama_renewals
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='iqama_renewals' AND policyname='entity_access') THEN
    CREATE POLICY entity_access ON iqama_renewals USING (true) WITH CHECK (true);
  END IF;
  -- iqama_renewal_lines
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='iqama_renewal_lines' AND policyname='entity_access') THEN
    CREATE POLICY entity_access ON iqama_renewal_lines USING (true) WITH CHECK (true);
  END IF;
  -- insurance_policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='insurance_policies' AND policyname='entity_access') THEN
    CREATE POLICY entity_access ON insurance_policies USING (true) WITH CHECK (true);
  END IF;
  -- insurance_policy_members
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='insurance_policy_members' AND policyname='entity_access') THEN
    CREATE POLICY entity_access ON insurance_policy_members USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ── 8. VERIFY ────────────────────────────────────────────────────────────────

SELECT
  table_name,
  COUNT(*) AS column_count
FROM information_schema.columns
WHERE table_name IN (
  'document_renewals',
  'iqama_renewals',
  'iqama_renewal_lines',
  'insurance_policies',
  'insurance_policy_members'
)
GROUP BY table_name
ORDER BY table_name;
