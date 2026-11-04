-- ── site_assignments FINAL comprehensive patch ───────────────────────────────
-- The original table (field_ops_schema.sql) only has:
--   id, employee_id, project_id, site_number, site_name, scope_type,
--   role_on_site, contractor_id, assigned_from, assigned_to,
--   is_active, notes, created_at, created_by
--
-- This patch adds every column the SiteAssignment.jsx UI now expects.
-- ALL statements use IF NOT EXISTS — safe to run multiple times.
-- Run in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE site_assignments
  -- Entity scoping
  ADD COLUMN IF NOT EXISTS entity_id       UUID    REFERENCES entities(id)    ON DELETE CASCADE,

  -- FK to site_masters (replaces the old denormalised site_number/site_name)
  ADD COLUMN IF NOT EXISTS site_master_id  UUID    REFERENCES site_masters(id) ON DELETE SET NULL,

  -- Who is being assigned: 'EMPLOYEE' | 'SUBCON'
  ADD COLUMN IF NOT EXISTS assignee_type   TEXT    NOT NULL DEFAULT 'EMPLOYEE',

  -- Sub-contractor link (employee_id already exists for the employee side)
  ADD COLUMN IF NOT EXISTS subcon_id       UUID    REFERENCES contractors(id) ON DELETE SET NULL,

  -- Department
  ADD COLUMN IF NOT EXISTS department_id   UUID    REFERENCES departments(id) ON DELETE SET NULL,

  -- Single assignment date (the UI uses this for daily assignments)
  ADD COLUMN IF NOT EXISTS assignment_date DATE    DEFAULT CURRENT_DATE,

  -- Remote flag
  ADD COLUMN IF NOT EXISTS is_remote       BOOLEAN NOT NULL DEFAULT false,

  -- Record status: 'ACTIVE' | 'CANCELLED'
  ADD COLUMN IF NOT EXISTS status          TEXT    NOT NULL DEFAULT 'ACTIVE',

  -- Per-assignment form permissions
  ADD COLUMN IF NOT EXISTS allow_fa        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_ot        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_others    BOOLEAN NOT NULL DEFAULT true;

-- Index on the new FK
CREATE INDEX IF NOT EXISTS idx_sa_site_master  ON site_assignments (site_master_id);
CREATE INDEX IF NOT EXISTS idx_sa_entity_date  ON site_assignments (entity_id, assignment_date);
CREATE INDEX IF NOT EXISTS idx_sa_status       ON site_assignments (status);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
