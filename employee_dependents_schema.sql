-- ============================================================
-- ACCSYS — Employee Dependents Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── 1. Main table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_dependents (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id        UUID        NOT NULL,
  employee_id      UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- Identity
  full_name        VARCHAR(200) NOT NULL,
  gender           VARCHAR(10)  CHECK (gender IN ('Male','Female')),
  relationship     VARCHAR(30)  NOT NULL
                   CHECK (relationship IN ('Wife','Husband','Son','Daughter','Father','Mother','Other')),

  -- ID document
  id_type          VARCHAR(20)  NOT NULL DEFAULT 'Iqama'
                   CHECK (id_type IN ('Iqama','National Id','Passport')),
  id_number        VARCHAR(60),

  -- Demographics
  nationality      VARCHAR(100),
  birth_date       DATE,
  marital_status   VARCHAR(20)  DEFAULT 'Single',
  mobile           VARCHAR(20),

  -- Insurance
  insurance_scheme VARCHAR(5),   -- A / B / C / D

  -- Document expiry tracking
  iqama_expiry     DATE,
  passport_number  VARCHAR(60),
  passport_expiry  DATE,
  insurance_expiry DATE,

  -- Flags
  is_active        BOOLEAN      NOT NULL DEFAULT true,
  notes            TEXT,

  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 1b. Patch — add any columns that may be missing if table pre-existed ─
ALTER TABLE employee_dependents
  ADD COLUMN IF NOT EXISTS gender           VARCHAR(10),
  ADD COLUMN IF NOT EXISTS relationship     VARCHAR(30),
  ADD COLUMN IF NOT EXISTS id_type          VARCHAR(20) DEFAULT 'Iqama',
  ADD COLUMN IF NOT EXISTS id_number        VARCHAR(60),
  ADD COLUMN IF NOT EXISTS nationality      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS birth_date       DATE,
  ADD COLUMN IF NOT EXISTS marital_status   VARCHAR(20) DEFAULT 'Single',
  ADD COLUMN IF NOT EXISTS mobile           VARCHAR(20),
  ADD COLUMN IF NOT EXISTS insurance_scheme VARCHAR(5),
  ADD COLUMN IF NOT EXISTS iqama_expiry     DATE,
  ADD COLUMN IF NOT EXISTS passport_number  VARCHAR(60),
  ADD COLUMN IF NOT EXISTS passport_expiry  DATE,
  ADD COLUMN IF NOT EXISTS insurance_expiry DATE,
  ADD COLUMN IF NOT EXISTS is_active        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS entity_id        UUID,
  ADD COLUMN IF NOT EXISTS employee_id      UUID;

-- ── 2. Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_emp_deps_employee  ON employee_dependents(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_deps_entity    ON employee_dependents(entity_id);
CREATE INDEX IF NOT EXISTS idx_emp_deps_id_number ON employee_dependents(id_number);

-- ── 3. updated_at trigger ────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_emp_deps_updated_at ON employee_dependents;
CREATE TRIGGER trg_emp_deps_updated_at
  BEFORE UPDATE ON employee_dependents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 4. RLS ───────────────────────────────────────────────────
ALTER TABLE employee_dependents ENABLE ROW LEVEL SECURITY;

-- Authenticated users scoped to their entity
CREATE POLICY "entity_read"   ON employee_dependents FOR SELECT USING (true);
CREATE POLICY "entity_insert" ON employee_dependents FOR INSERT WITH CHECK (true);
CREATE POLICY "entity_update" ON employee_dependents FOR UPDATE USING (true);
CREATE POLICY "entity_delete" ON employee_dependents FOR DELETE USING (true);

-- ── 5. Helper view — dependents joined to their sponsor employee ─
CREATE OR REPLACE VIEW v_dependents_with_sponsor AS
SELECT
  d.id,
  d.entity_id,
  d.employee_id,
  d.full_name,
  d.gender,
  d.relationship,
  d.id_type,
  d.id_number,
  d.nationality,
  d.birth_date,
  d.marital_status,
  d.mobile,
  d.insurance_scheme,
  d.iqama_expiry,
  d.passport_number,
  d.passport_expiry,
  d.insurance_expiry,
  d.is_active,
  d.notes,
  -- Sponsor info from parent employee
  e.full_name_en    AS sponsor_name,
  e.iqama_number    AS sponsor_id,        -- this IS the Sponsor ID on insurance lists
  e.employee_number AS sponsor_emp_no,
  e.department_id   AS sponsor_dept_id
FROM employee_dependents d
JOIN employees e ON e.id = d.employee_id;

-- ── 6. Expiry summary view (for compliance dashboard) ─────────
CREATE OR REPLACE VIEW v_dependent_expiry_alerts AS
SELECT
  d.id,
  d.entity_id,
  d.employee_id,
  e.full_name_en    AS employee_name,
  e.iqama_number    AS sponsor_id,
  d.full_name       AS dependent_name,
  d.relationship,
  d.id_number,
  d.iqama_expiry,
  d.passport_expiry,
  d.insurance_expiry,
  LEAST(d.iqama_expiry, d.passport_expiry, d.insurance_expiry) AS earliest_expiry,
  CASE
    WHEN LEAST(d.iqama_expiry, d.passport_expiry, d.insurance_expiry) < CURRENT_DATE          THEN 'EXPIRED'
    WHEN LEAST(d.iqama_expiry, d.passport_expiry, d.insurance_expiry) < CURRENT_DATE + 30     THEN 'EXPIRING_SOON'
    ELSE 'ACTIVE'
  END AS alert_status
FROM employee_dependents d
JOIN employees e ON e.id = d.employee_id
WHERE d.is_active = true
ORDER BY earliest_expiry NULLS LAST;

-- ── 7. Grant view access ─────────────────────────────────────
GRANT SELECT ON v_dependents_with_sponsor   TO authenticated, anon;
GRANT SELECT ON v_dependent_expiry_alerts   TO authenticated, anon;

-- ── 8. Patch documents table — add dependent columns ─────────
-- Run this in Supabase SQL Editor after the above
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS dependent_id   UUID REFERENCES employee_dependents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dependent_name VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_docs_dependent ON documents(dependent_id);
