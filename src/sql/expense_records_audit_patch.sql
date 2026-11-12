-- ─────────────────────────────────────────────────────────────────────────────
-- expense_records_audit_patch.sql  v2
-- RUN THIS IN SUPABASE SQL EDITOR BEFORE DEPLOYING THE UPDATED CODE.
--
-- Adds missing columns to expense_records:
--   • project_no, project_name, site_no, site_name  — from site assignment
--   • job_no                                         — optional job reference
--   • entry_source                                   — 'FIELD' | 'ADMIN'
--   • recorded_by_name                               — who entered it
--   • admin_note                                     — optional admin comment
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Project & Site (auto-populated from site_assignments on save) ─────────────
ALTER TABLE expense_records
  ADD COLUMN IF NOT EXISTS project_no   VARCHAR(50)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS project_name VARCHAR(200) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS site_no      VARCHAR(50)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS site_name    VARCHAR(200) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS job_no       VARCHAR(50)  DEFAULT NULL;   -- optional

-- ── Audit trail ───────────────────────────────────────────────────────────────
ALTER TABLE expense_records
  ADD COLUMN IF NOT EXISTS entry_source      VARCHAR(10)  DEFAULT 'FIELD',
  ADD COLUMN IF NOT EXISTS recorded_by_name  VARCHAR(200) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS admin_note        TEXT         DEFAULT NULL;

-- ── Back-fill existing field records ─────────────────────────────────────────
UPDATE expense_records
  SET entry_source = 'FIELD'
  WHERE entry_source IS NULL;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_expense_records_entry_source ON expense_records(entry_source);
CREATE INDEX IF NOT EXISTS idx_expense_records_project_no   ON expense_records(project_no);
CREATE INDEX IF NOT EXISTS idx_expense_records_site_no      ON expense_records(site_no);
