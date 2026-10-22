-- ============================================================
-- ACCSYS PHASE D SCHEMA — Site Completion / Status Logs
-- Run AFTER phase_c_schema.sql
-- Safe to re-run (IF NOT EXISTS / OR REPLACE)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Patch site_assignments: add progress tracking columns
-- ────────────────────────────────────────────────────────────
ALTER TABLE site_assignments ADD COLUMN IF NOT EXISTS completion_pct   integer      DEFAULT 0;
ALTER TABLE site_assignments ADD COLUMN IF NOT EXISTS last_status_at   timestamptz;
ALTER TABLE site_assignments ADD COLUMN IF NOT EXISTS completed_milestones text[]   DEFAULT '{}';

-- ────────────────────────────────────────────────────────────
-- Site Status Logs — one row per update submission
-- Accumulates all milestone updates per assignment
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_status_logs (
  id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           uuid         REFERENCES entities(id),
  assignment_id       uuid         REFERENCES site_assignments(id) ON DELETE CASCADE,
  employee_id         uuid         REFERENCES employees(id),
  scope_type          text,
  milestones_newly_done text[]     DEFAULT '{}',   -- milestones ticked in THIS update
  all_milestones      jsonb,                        -- full snapshot [{name, done, date, notes}]
  completion_pct      integer      DEFAULT 0,
  photo_url           text,
  notes               text,
  submitted_at        timestamptz  DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ssl_assignment ON site_status_logs(assignment_id);
CREATE INDEX IF NOT EXISTS idx_ssl_employee   ON site_status_logs(employee_id);

-- RLS
ALTER TABLE site_status_logs ENABLE ROW LEVEL SECURITY;

-- Field employees can insert their own logs
DROP POLICY IF EXISTS "anon insert site_status_logs"  ON site_status_logs;
CREATE POLICY "anon insert site_status_logs" ON site_status_logs
  FOR INSERT TO anon WITH CHECK (true);

-- Anyone (anon) can read to load previous logs
DROP POLICY IF EXISTS "anon select site_status_logs" ON site_status_logs;
CREATE POLICY "anon select site_status_logs" ON site_status_logs
  FOR SELECT TO anon USING (true);

-- ────────────────────────────────────────────────────────────
-- View: latest status per assignment (for DH dashboard)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW site_assignment_progress AS
SELECT
  sa.id                         AS assignment_id,
  sa.site_number,
  sa.site_name,
  sa.scope_type,
  sa.completion_pct,
  sa.completed_milestones,
  sa.last_status_at,
  sa.employee_id,
  e.full_name_en,
  e.full_name_ar,
  p.project_number,
  p.project_name,
  COUNT(ssl.id)                 AS update_count,
  MAX(ssl.submitted_at)         AS last_update_at
FROM site_assignments sa
LEFT JOIN employees   e   ON e.id  = sa.employee_id
LEFT JOIN projects    p   ON p.id  = sa.project_id
LEFT JOIN site_status_logs ssl ON ssl.assignment_id = sa.id
GROUP BY
  sa.id, sa.site_number, sa.site_name, sa.scope_type,
  sa.completion_pct, sa.completed_milestones, sa.last_status_at,
  sa.employee_id, e.full_name_en, e.full_name_ar,
  p.project_number, p.project_name;

-- ────────────────────────────────────────────────────────────
-- DONE
-- ────────────────────────────────────────────────────────────
