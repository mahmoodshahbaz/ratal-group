-- ══════════════════════════════════════════════════════════════════
-- SITE ASSIGNMENT ENHANCEMENT PATCH
-- Run in Supabase SQL Editor → SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE site_assignments
  ADD COLUMN IF NOT EXISTS project_id    UUID REFERENCES projects(id),
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS assignment_start DATE,
  ADD COLUMN IF NOT EXISTS assignment_end   DATE,
  ADD COLUMN IF NOT EXISTS period_type      TEXT DEFAULT 'DAILY';

-- Backfill existing daily records so new query logic works on old data
UPDATE site_assignments
SET
  assignment_start = assignment_date,
  assignment_end   = assignment_date,
  period_type      = 'DAILY'
WHERE assignment_start IS NULL
  AND assignment_date  IS NOT NULL;

-- Index for date-range lookups (speeds up "who is assigned on date X")
CREATE INDEX IF NOT EXISTS idx_site_assignments_start ON site_assignments(entity_id, assignment_start);
CREATE INDEX IF NOT EXISTS idx_site_assignments_end   ON site_assignments(entity_id, assignment_end);
