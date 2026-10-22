-- ============================================================
-- ACCSYS PHASE H SCHEMA — Car & Fleet Field Reporting
-- Run AFTER phase_g_schema.sql
-- Safe to re-run (IF NOT EXISTS / OR REPLACE)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Extend vehicle_maintenance for field-submitted reports
-- Existing admin records have source = NULL (treated as ADMIN)
-- ────────────────────────────────────────────────────────────
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS submitted_by   uuid REFERENCES employees(id);
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS source         varchar(10)  DEFAULT 'ADMIN';  -- ADMIN | FIELD
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS log_type       varchar(20)  DEFAULT 'MAINTENANCE'; -- FUEL | MAINTENANCE | INCIDENT | INSPECTION
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS fuel_liters    numeric(8,2);
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS fuel_amount    numeric(10,2); -- SAR cost of fuel
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS location       text;
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS urgency        varchar(10)  DEFAULT 'LOW'; -- LOW | MEDIUM | HIGH | CRITICAL
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS photo_url      text;
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS photo_url_2    text;
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS status         varchar(20)  DEFAULT 'OPEN'; -- OPEN | ACKNOWLEDGED | RESOLVED | CLOSED
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS acknowledged_by uuid REFERENCES employees(id);
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz;
-- Inspection checklist stored as JSONB {tyres, lights, oil, brakes, wipers, ...}
ALTER TABLE vehicle_maintenance ADD COLUMN IF NOT EXISTS inspection_checklist jsonb;

-- RLS: allow anon to insert (field workers use anon key)
ALTER TABLE vehicle_maintenance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon insert vehicle_maintenance" ON vehicle_maintenance;
CREATE POLICY "anon insert vehicle_maintenance" ON vehicle_maintenance
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon select vehicle_maintenance" ON vehicle_maintenance;
CREATE POLICY "anon select vehicle_maintenance" ON vehicle_maintenance
  FOR SELECT TO anon USING (true);

-- Index for fast field log queries
CREATE INDEX IF NOT EXISTS idx_vm_source   ON vehicle_maintenance(source);
CREATE INDEX IF NOT EXISTS idx_vm_vehicle  ON vehicle_maintenance(vehicle_id, service_date DESC);
CREATE INDEX IF NOT EXISTS idx_vm_submitter ON vehicle_maintenance(submitted_by);

-- RLS on vehicles table (allow anon to read — needed for form vehicle picker)
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon select vehicles" ON vehicles;
CREATE POLICY "anon select vehicles" ON vehicles
  FOR SELECT TO anon USING (true);

-- ────────────────────────────────────────────────────────────
-- View: field-submitted logs for admin review panel
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW field_vehicle_logs AS
SELECT
  vm.id,
  vm.entity_id,
  vm.vehicle_id,
  v.plate_number,
  v.make,
  v.model,
  vm.log_type,
  vm.maintenance_type,
  vm.service_date,
  vm.odometer_at_service,
  vm.fuel_liters,
  vm.fuel_amount,
  vm.cost,
  vm.description,
  vm.location,
  vm.urgency,
  vm.photo_url,
  vm.photo_url_2,
  vm.status,
  vm.source,
  vm.submitted_by,
  e.full_name_en   AS submitted_by_name,
  vm.acknowledged_at,
  vm.workshop_name,
  vm.next_service_date,
  vm.inspection_checklist
FROM vehicle_maintenance vm
LEFT JOIN vehicles  v ON v.id = vm.vehicle_id
LEFT JOIN employees e ON e.id = vm.submitted_by
WHERE vm.source = 'FIELD'
ORDER BY vm.service_date DESC;

-- ────────────────────────────────────────────────────────────
-- DONE
-- ────────────────────────────────────────────────────────────
