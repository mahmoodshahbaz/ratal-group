-- ═══════════════════════════════════════════════════════════════════════
-- VEHICLE MAINTENANCE TABLE — ALTER-SAFE PATCH
-- Table already exists — adds all missing columns with ADD COLUMN IF NOT EXISTS.
-- Safe to re-run; every statement is idempotent.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Add ALL new columns (safe — IF NOT EXISTS on each) ────────────────
ALTER TABLE vehicle_maintenance
  ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ  DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS source                TEXT         DEFAULT 'FIELD',
  ADD COLUMN IF NOT EXISTS status                TEXT         DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS notes_field           TEXT,
  ADD COLUMN IF NOT EXISTS urgency               TEXT         DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS photo_url_2           TEXT,
  ADD COLUMN IF NOT EXISTS photo_url_3           TEXT,
  ADD COLUMN IF NOT EXISTS fuel_liters           NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS fuel_amount           NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS fuel_station          TEXT,
  ADD COLUMN IF NOT EXISTS fuel_override_reason  TEXT,
  ADD COLUMN IF NOT EXISTS workshop_name         TEXT,
  ADD COLUMN IF NOT EXISTS trip_direction        TEXT,
  ADD COLUMN IF NOT EXISTS inspection_checklist  JSONB,
  ADD COLUMN IF NOT EXISTS location              TEXT,
  ADD COLUMN IF NOT EXISTS accident_datetime     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS najm_report_no        TEXT,
  ADD COLUMN IF NOT EXISTS police_report_no      TEXT,
  ADD COLUMN IF NOT EXISTS has_injuries          BOOLEAN      DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS injury_description    TEXT,
  ADD COLUMN IF NOT EXISTS third_party_type      TEXT         DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS third_party_name      TEXT,
  ADD COLUMN IF NOT EXISTS third_party_plate     TEXT,
  ADD COLUMN IF NOT EXISTS third_party_phone     TEXT,
  ADD COLUMN IF NOT EXISTS third_party_insurance TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by           UUID,
  ADD COLUMN IF NOT EXISTS resolution_notes      TEXT;

-- ── 2. Auto-update updated_at trigger ───────────────────────────────────
CREATE OR REPLACE FUNCTION update_vm_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_vehicle_maintenance_updated_at ON vehicle_maintenance;
CREATE TRIGGER trg_vehicle_maintenance_updated_at
  BEFORE UPDATE ON vehicle_maintenance
  FOR EACH ROW EXECUTE FUNCTION update_vm_updated_at();

-- ── 3. RLS ───────────────────────────────────────────────────────────────
ALTER TABLE vehicle_maintenance ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='vehicle_maintenance' AND policyname='anon insert vehicle log'
  ) THEN
    EXECUTE '
      CREATE POLICY "anon insert vehicle log"
        ON vehicle_maintenance FOR INSERT TO anon WITH CHECK (true)
    ';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='vehicle_maintenance' AND policyname='anon select vehicle logs'
  ) THEN
    EXECUTE '
      CREATE POLICY "anon select vehicle logs"
        ON vehicle_maintenance FOR SELECT TO anon USING (true)
    ';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='vehicle_maintenance' AND policyname='anon update vehicle log'
  ) THEN
    EXECUTE '
      CREATE POLICY "anon update vehicle log"
        ON vehicle_maintenance FOR UPDATE TO anon
        USING (status IN (''OPEN'',''IN_PROGRESS''))
        WITH CHECK (true)
    ';
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON TABLE vehicle_maintenance TO anon;

-- ── 4. Indexes ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_vm_vehicle_id    ON vehicle_maintenance (vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vm_submitted_by  ON vehicle_maintenance (submitted_by);
CREATE INDEX IF NOT EXISTS idx_vm_service_date  ON vehicle_maintenance (service_date DESC);
CREATE INDEX IF NOT EXISTS idx_vm_log_type      ON vehicle_maintenance (log_type);
CREATE INDEX IF NOT EXISTS idx_vm_status        ON vehicle_maintenance (status);
CREATE INDEX IF NOT EXISTS idx_vm_fuel_weekly   ON vehicle_maintenance (vehicle_id, service_date DESC)
  WHERE log_type = 'FUEL';

-- ── 5. Vehicles — add assigned_to if missing ─────────────────────────────
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vehicles_assigned_to ON vehicles (assigned_to)
  WHERE assigned_to IS NOT NULL;

-- ── 6. Notifications — extend type CHECK if one exists ───────────────────
-- Uncomment ONLY if your notifications table has a CHECK constraint on type:
-- ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
-- ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
--   CHECK (type IN (
--     'GENERAL','FIELD_PAYMENT','MONEY_REQUEST',
--     'VEHICLE_MAINTENANCE','VEHICLE_INCIDENT','VEHICLE_ACCIDENT',
--     'OVERTIME','SITE_COMPLETION'
--   ));

NOTIFY pgrst, 'reload schema';
