-- ═══════════════════════════════════════════════════════════════════
-- Phase 2 Patch #2 — Vehicles + Maintenance tables
-- Safe to run multiple times (all IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════

-- ─── Vehicles register ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicles (
  id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id            UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  plate_number         VARCHAR(30) NOT NULL,
  vehicle_type         VARCHAR(30) DEFAULT 'SUV',        -- SEDAN|SUV|PICKUP|VAN|BUS|TRUCK|MOTORCYCLE|HEAVY EQUIPMENT|OTHER
  make                 VARCHAR(60),                       -- Toyota, Ford, Isuzu…
  model                VARCHAR(60),                       -- Land Cruiser, Ranger…
  year                 SMALLINT,
  color                VARCHAR(30),
  chassis_no           VARCHAR(60),
  engine_no            VARCHAR(60),
  fuel_type            VARCHAR(20) DEFAULT 'PETROL',      -- PETROL|DIESEL|ELECTRIC|HYBRID
  driver_name          VARCHAR(200),
  driver_id_no         VARCHAR(50),
  assigned_department  VARCHAR(100),
  odometer_reading     NUMERIC(10,0) DEFAULT 0,           -- km
  status               VARCHAR(20) DEFAULT 'ACTIVE',      -- ACTIVE|INACTIVE|SCRAPPED
  -- Document expiry dates (also synced to compliance_docs)
  ins_expiry           DATE,
  mvpi_expiry          DATE,
  reg_expiry           DATE,
  saher_expiry         DATE,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_plate ON vehicles(entity_id, plate_number);
CREATE INDEX IF NOT EXISTS idx_vehicles_entity       ON vehicles(entity_id, status);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'auth_vehicles' AND tablename = 'vehicles'
  ) THEN
    CREATE POLICY "auth_vehicles" ON vehicles FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ─── Vehicle Maintenance Log ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_maintenance (
  id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id            UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  vehicle_id           UUID        NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  maintenance_type     VARCHAR(40) DEFAULT 'OIL_CHANGE',
  -- OIL_CHANGE|TYRE_CHANGE|BRAKE_SERVICE|AC_SERVICE|BATTERY|ACCIDENT_REPAIR|PERIODIC_SERVICE|MAJOR_REPAIR|OTHER
  description          TEXT,
  cost                 NUMERIC(10,2) DEFAULT 0,
  odometer_at_service  NUMERIC(10,0) DEFAULT 0,
  service_date         DATE        NOT NULL DEFAULT CURRENT_DATE,
  next_service_date    DATE,
  workshop_name        VARCHAR(200),
  invoice_ref          VARCHAR(100),
  created_by           UUID REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vmaint_vehicle  ON vehicle_maintenance(vehicle_id, service_date DESC);
CREATE INDEX IF NOT EXISTS idx_vmaint_entity   ON vehicle_maintenance(entity_id, service_date DESC);

ALTER TABLE vehicle_maintenance ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'auth_vehicle_maintenance' AND tablename = 'vehicle_maintenance'
  ) THEN
    CREATE POLICY "auth_vehicle_maintenance" ON vehicle_maintenance FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ─── Add ref_id to compliance_docs if not already present ─────────
-- (used to link vehicle documents back to the vehicle record)
ALTER TABLE compliance_docs ADD COLUMN IF NOT EXISTS ref_id UUID;
CREATE INDEX IF NOT EXISTS idx_compliance_ref ON compliance_docs(ref_id) WHERE ref_id IS NOT NULL;
