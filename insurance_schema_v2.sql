-- ══════════════════════════════════════════════════════════════════════════════
-- insurance_schema_v2.sql
-- Full insurance module: Health · Vehicle · Shipment
-- Run once in Supabase SQL Editor (safe to re-run — uses IF NOT EXISTS)
--
-- Architecture:
--   insurance_policies      — master record per insurer per period (any type)
--   insurance_members       — Health: one row per employee OR dependent
--   insurance_vehicles      — Vehicle: one row per vehicle
--   insurance_shipments     — Shipment: one row per shipment certificate
--   vehicles table patch    — add fleet_value column
-- ══════════════════════════════════════════════════════════════════════════════


-- ── 0. Add fleet_value to vehicles ───────────────────────────────────────────
-- Own Fleet vehicles need a declared value for insurance purposes.

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS fleet_value NUMERIC DEFAULT 0;

COMMENT ON COLUMN vehicles.fleet_value IS
  'Declared market/purchase value of the vehicle in SAR. Used for comprehensive insurance premium calculation. Own Fleet only.';


-- ── 1. insurance_policies — master record ────────────────────────────────────
-- One row per insurer-period-type combination.
-- Members/vehicles/shipments link back to this via policy_id.

CREATE TABLE IF NOT EXISTS insurance_policies (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  -- Classification
  policy_type         TEXT        NOT NULL CHECK (policy_type IN ('HEALTH', 'VEHICLE', 'SHIPMENT')),

  -- Insurer details
  insurer_name        TEXT        NOT NULL,
  master_policy_number TEXT,                  -- insurer's reference for the whole policy
  broker_name         TEXT,                   -- insurance broker if used

  -- Period
  inception_date      DATE        NOT NULL,
  expiry_date         DATE        NOT NULL,

  -- Financials
  total_premium       NUMERIC     DEFAULT 0,
  currency            TEXT        DEFAULT 'SAR',

  -- Status
  status              TEXT        DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'CANCELLED', 'RENEWED')),
  renewal_of          UUID        REFERENCES insurance_policies(id),  -- links to previous year's policy

  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE insurance_policies IS
  'Master insurance policy record. One row per insurer + period + type. Members, vehicles, or shipments link to this.';

-- Patch for tables that already existed without these columns
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS policy_type         TEXT DEFAULT 'HEALTH';
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS master_policy_number TEXT;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS broker_name         TEXT;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS inception_date      DATE;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS expiry_date         DATE;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS total_premium       NUMERIC DEFAULT 0;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS currency            TEXT DEFAULT 'SAR';
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS status              TEXT DEFAULT 'ACTIVE';
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS renewal_of          UUID;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS notes               TEXT;
ALTER TABLE insurance_policies ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT NOW();

COMMENT ON COLUMN insurance_policies.renewal_of IS
  'Points to the previous year policy this is a renewal of. Enables full history chain.';


-- ── 2. insurance_members — Health: per-employee and per-dependent ─────────────
-- Each employee gets their own individual policy certificate number.
-- Dependents inherit the employee/sponsor coverage class (locked).

CREATE TABLE IF NOT EXISTS insurance_members (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id               UUID        NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
  entity_id               UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  -- Who
  member_type             TEXT        NOT NULL CHECK (member_type IN ('EMPLOYEE', 'DEPENDENT')),
  employee_id             UUID        REFERENCES employees(id),          -- always set
  dependent_id            UUID        REFERENCES employee_dependents(id), -- set only if DEPENDENT
  sponsor_member_id       UUID        REFERENCES insurance_members(id),   -- dependent → points to employee's row

  -- Certificate
  individual_policy_number TEXT,      -- each person's own cert # from insurer
  coverage_class          TEXT        NOT NULL DEFAULT 'B'
                            CHECK (coverage_class IN ('A', 'B', 'C', 'D', 'E')),

  -- Status
  is_active               BOOLEAN     DEFAULT TRUE,
  added_date              DATE,       -- date added to policy (mid-term addition)
  removed_date            DATE,       -- date removed (mid-term deletion / leaver)

  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE insurance_members IS
  'Health insurance members. One row per employee, one per dependent. Dependents inherit sponsor coverage class — cannot be changed independently.';

-- Patch for insurance_members if it already existed without some columns
ALTER TABLE insurance_members ADD COLUMN IF NOT EXISTS dependent_id        UUID REFERENCES employee_dependents(id);
ALTER TABLE insurance_members ADD COLUMN IF NOT EXISTS sponsor_member_id   UUID REFERENCES insurance_members(id);
ALTER TABLE insurance_members ADD COLUMN IF NOT EXISTS individual_policy_number TEXT;
ALTER TABLE insurance_members ADD COLUMN IF NOT EXISTS added_date          DATE;
ALTER TABLE insurance_members ADD COLUMN IF NOT EXISTS removed_date        DATE;
ALTER TABLE insurance_members ADD COLUMN IF NOT EXISTS notes               TEXT;
COMMENT ON COLUMN insurance_members.individual_policy_number IS
  'Each person gets their own cert number from the insurer. Populated via CSV upload or manual entry.';
COMMENT ON COLUMN insurance_members.sponsor_member_id IS
  'For DEPENDENT rows: FK to the employee insurance_members row. Confirms class inheritance chain.';
COMMENT ON COLUMN insurance_members.coverage_class IS
  'A=Premium, B=Enhanced, C=Standard, D=Basic, E=Minimum. Dependents must match their sponsor.';


-- ── 3. insurance_vehicles — Vehicle: per-vehicle certificate ──────────────────
-- Each vehicle in the fleet gets its own certificate number from the insurer.
-- Fleet value is pulled from vehicles.fleet_value but can be overridden per policy year.

CREATE TABLE IF NOT EXISTS insurance_vehicles (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id               UUID        NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
  entity_id               UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  -- Vehicle reference
  vehicle_id              UUID        REFERENCES vehicles(id),           -- FK to fleet
  plate_number            TEXT,       -- denormalised snapshot (vehicle may be disposed)
  vehicle_make_model      TEXT,       -- snapshot
  vehicle_year            INT,        -- snapshot

  -- Certificate
  individual_cert_number  TEXT,       -- each vehicle's own cert # from insurer

  -- Value & premium
  declared_value          NUMERIC     DEFAULT 0,  -- pulled from fleet_value, can override
  individual_premium      NUMERIC     DEFAULT 0,

  -- Status
  is_active               BOOLEAN     DEFAULT TRUE,
  removed_date            DATE,       -- if mid-term removal (vehicle disposed)

  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE insurance_vehicles IS
  'Vehicle insurance — one row per vehicle per policy. Cert number, declared value, and premium per vehicle.';
COMMENT ON COLUMN insurance_vehicles.declared_value IS
  'Pulled from vehicles.fleet_value at the time of policy creation. Can be overridden for this specific policy year.';

-- Patch for insurance_vehicles if it already existed without some columns
ALTER TABLE insurance_vehicles ADD COLUMN IF NOT EXISTS vehicle_make_model  TEXT;
ALTER TABLE insurance_vehicles ADD COLUMN IF NOT EXISTS vehicle_year        INT;
ALTER TABLE insurance_vehicles ADD COLUMN IF NOT EXISTS individual_cert_number TEXT;
ALTER TABLE insurance_vehicles ADD COLUMN IF NOT EXISTS declared_value      NUMERIC DEFAULT 0;
ALTER TABLE insurance_vehicles ADD COLUMN IF NOT EXISTS individual_premium  NUMERIC DEFAULT 0;
ALTER TABLE insurance_vehicles ADD COLUMN IF NOT EXISTS is_active           BOOLEAN DEFAULT TRUE;
ALTER TABLE insurance_vehicles ADD COLUMN IF NOT EXISTS removed_date        DATE;
ALTER TABLE insurance_vehicles ADD COLUMN IF NOT EXISTS notes               TEXT;


-- ── 4. insurance_shipments — per-shipment certificate ─────────────────────────
-- Each shipment gets its own insurance certificate.
-- Can be standalone or drawn against an open-cover master policy.

CREATE TABLE IF NOT EXISTS insurance_shipments (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id               UUID        NOT NULL REFERENCES insurance_policies(id) ON DELETE CASCADE,
  entity_id               UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  -- Certificate
  certificate_number      TEXT,

  -- Cargo
  cargo_description       TEXT        NOT NULL,
  cargo_category          TEXT        CHECK (cargo_category IN ('EQUIPMENT','MATERIALS','GOODS','DOCUMENTS','OTHER')),
  quantity_units          TEXT,       -- e.g. "3 crates / 500 kg"

  -- Route
  origin_country          TEXT,
  origin_city             TEXT,
  destination_country     TEXT,
  destination_city        TEXT,
  transport_mode          TEXT        CHECK (transport_mode IN ('SEA','AIR','LAND','MULTIMODAL')),

  -- Shipment references
  shipment_date           DATE,
  vessel_flight_ref       TEXT,       -- vessel name / flight number / truck plate
  bol_awb_number          TEXT,       -- bill of lading or airway bill number
  container_number        TEXT,

  -- Value & coverage
  invoice_value           NUMERIC     DEFAULT 0,
  currency                TEXT        DEFAULT 'SAR',
  coverage_amount         NUMERIC     DEFAULT 0,  -- typically 110% of invoice (CIF+10%)
  coverage_type           TEXT        DEFAULT 'ALL_RISK'
                            CHECK (coverage_type IN ('ALL_RISK','NAMED_PERILS','TOTAL_LOSS')),
  deductible              NUMERIC     DEFAULT 0,
  premium                 NUMERIC     DEFAULT 0,

  -- Status
  status                  TEXT        DEFAULT 'OPEN'
                            CHECK (status IN ('OPEN','IN_TRANSIT','ARRIVED','CLAIMED','CLOSED')),
  arrival_date            DATE,
  claim_amount            NUMERIC,
  claim_notes             TEXT,

  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE insurance_shipments IS
  'Shipment insurance certificates. One row per shipment. Linked to a master open-cover policy or standalone.';
COMMENT ON COLUMN insurance_shipments.coverage_amount IS
  'Typically 110% of invoice value (CIF value + 10% for incidental costs). Enter manually or auto-calculated.';

-- Patch for insurance_shipments if it already existed without some columns
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS certificate_number  TEXT;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS cargo_category      TEXT;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS quantity_units      TEXT;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS origin_country      TEXT;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS origin_city         TEXT;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS destination_country TEXT;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS destination_city    TEXT;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS transport_mode      TEXT;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS shipment_date       DATE;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS vessel_flight_ref   TEXT;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS bol_awb_number      TEXT;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS container_number    TEXT;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS invoice_value       NUMERIC DEFAULT 0;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS currency            TEXT DEFAULT 'SAR';
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS coverage_amount     NUMERIC DEFAULT 0;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS coverage_type       TEXT DEFAULT 'ALL_RISK';
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS deductible          NUMERIC DEFAULT 0;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS premium             NUMERIC DEFAULT 0;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS status              TEXT DEFAULT 'OPEN';
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS arrival_date        DATE;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS claim_amount        NUMERIC;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS claim_notes         TEXT;
ALTER TABLE insurance_shipments ADD COLUMN IF NOT EXISTS notes               TEXT;


-- ── 5. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_ins_policies_entity   ON insurance_policies  (entity_id, policy_type, status);
CREATE INDEX IF NOT EXISTS idx_ins_members_policy    ON insurance_members   (policy_id);
CREATE INDEX IF NOT EXISTS idx_ins_members_employee  ON insurance_members   (employee_id);
CREATE INDEX IF NOT EXISTS idx_ins_members_dependent ON insurance_members   (dependent_id);
CREATE INDEX IF NOT EXISTS idx_ins_vehicles_policy   ON insurance_vehicles  (policy_id);
CREATE INDEX IF NOT EXISTS idx_ins_vehicles_vehicle  ON insurance_vehicles  (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_ins_shipments_policy  ON insurance_shipments (policy_id);


-- ── 6. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE insurance_policies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_vehicles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurance_shipments ENABLE ROW LEVEL SECURITY;

-- Authenticated users only (same pattern as rest of ACCSYS app)
-- (DO blocks used because CREATE POLICY has no IF NOT EXISTS)
DO $$ BEGIN
  CREATE POLICY "entity_access" ON insurance_policies
    FOR ALL USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "entity_access" ON insurance_members
    FOR ALL USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "entity_access" ON insurance_vehicles
    FOR ALL USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "entity_access" ON insurance_shipments
    FOR ALL USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 7. VERIFY ────────────────────────────────────────────────────────────────

SELECT
  t.table_name,
  COUNT(c.column_name) AS column_count
FROM information_schema.tables t
JOIN information_schema.columns c ON c.table_name = t.table_name
WHERE t.table_name IN (
  'insurance_policies', 'insurance_members',
  'insurance_vehicles', 'insurance_shipments'
)
AND t.table_schema = 'public'
GROUP BY t.table_name
ORDER BY t.table_name;
