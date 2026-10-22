-- ══════════════════════════════════════════════════════════════════
-- VEHICLE ASSIGNMENTS — tracks who holds which vehicle + when
-- Used for traffic penalty assignment to the responsible employee
-- Run in Supabase SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vehicle_assignments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id        UUID NOT NULL REFERENCES entities(id),
  assignment_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  return_date      DATE,
  department_id    UUID REFERENCES departments(id),
  employee_id      UUID REFERENCES employees(id),
  iqama_dl         TEXT,                        -- snapshot from employee record at time of assignment
  vehicle_type     TEXT,
  plate_number     TEXT NOT NULL,
  make             TEXT,
  color            TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  created_by       UUID
);

-- Index for penalty lookup by plate + date range
CREATE INDEX IF NOT EXISTS idx_va_plate      ON vehicle_assignments(entity_id, plate_number, assignment_date);
CREATE INDEX IF NOT EXISTS idx_va_employee   ON vehicle_assignments(entity_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_va_dept       ON vehicle_assignments(entity_id, department_id);

ALTER TABLE vehicle_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entity_access_va" ON vehicle_assignments;
CREATE POLICY "entity_access_va" ON vehicle_assignments
  FOR ALL USING (auth.uid() IS NOT NULL);
