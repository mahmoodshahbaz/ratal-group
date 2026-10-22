-- ============================================================================
--  SITE ASSIGNMENT SCHEMA
--  Ratal Advanced Technologies — ACCSYS Field Operations Platform
--
--  Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
--  Tables:
--    site_assignments       — one record per generated document (incl. corrections)
--    site_assignment_lines  — one row per employee per assignment
--    system_notifications   — alerts pushed to UI when corrections happen
-- ============================================================================

-- ── SITE ASSIGNMENTS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_assignments (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_ref       TEXT        UNIQUE NOT NULL,           -- e.g. SA-CISU-20260902, SA-CISU-20260902-v2
  department           TEXT        NOT NULL,
  assignment_date      DATE        NOT NULL,
  period_type          TEXT        NOT NULL DEFAULT 'Daily',  -- Daily | Weekly
  coordinator_id       UUID        REFERENCES employees(id),
  coordinator_name     TEXT        NOT NULL,
  general_project_no   TEXT,                                  -- e.g. P-CISU-2026 for idle employees
  status               TEXT        NOT NULL DEFAULT 'draft',
    -- draft | published | superseded
    -- 'superseded' = a newer correction version exists; kept for audit only
  version              INTEGER     NOT NULL DEFAULT 1,
  parent_id            UUID        REFERENCES site_assignments(id),  -- set on corrections
  correction_reason    TEXT,                                  -- required when version > 1
  requires_dh_approval BOOLEAN     NOT NULL DEFAULT FALSE,    -- TRUE if correction is for a past date
  approved_by          UUID        REFERENCES employees(id),  -- DH who approved (for late corrections)
  pdf_url              TEXT,                                  -- Google Drive webViewLink
  drive_file_id        TEXT,                                  -- Google Drive file ID (for updates/deletes)
  generated_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index: quickly find all versions for a dept+date
CREATE INDEX IF NOT EXISTS idx_sa_dept_date
  ON site_assignments (department, assignment_date);

-- Index: find correction chain from parent
CREATE INDEX IF NOT EXISTS idx_sa_parent
  ON site_assignments (parent_id)
  WHERE parent_id IS NOT NULL;

-- Prevent two active (non-superseded) records for the same dept+date
CREATE UNIQUE INDEX IF NOT EXISTS idx_sa_active_unique
  ON site_assignments (department, assignment_date)
  WHERE status != 'superseded';

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_sa_updated_at ON site_assignments;
CREATE TRIGGER trg_sa_updated_at
  BEFORE UPDATE ON site_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ── SITE ASSIGNMENT LINES ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_assignment_lines (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id    UUID    NOT NULL REFERENCES site_assignments(id) ON DELETE CASCADE,
  employee_id      UUID    REFERENCES employees(id),
  employee_name_en TEXT    NOT NULL,
  employment_type  TEXT    NOT NULL,   -- 'sponsored' | 'outsourced'
  project_no       TEXT,               -- NULL when idle/leave/absent
  site_no          TEXT,               -- NULL when idle/leave/absent
  status           TEXT    NOT NULL DEFAULT 'IDLE',
    -- ASSIGNED | IDLE | LEAVE | ABSENT
  remarks          TEXT,
  sort_order       INTEGER NOT NULL,   -- sponsored rows first, then outsourced
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sal_assignment
  ON site_assignment_lines (assignment_id);

CREATE INDEX IF NOT EXISTS idx_sal_employee_date
  ON site_assignment_lines (employee_id, assignment_id);


-- ── SYSTEM NOTIFICATIONS ─────────────────────────────────────────────────────
-- Used to alert coordinators when a correction affects downstream forms (FA, OT, Expenses)
CREATE TABLE IF NOT EXISTS system_notifications (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type         TEXT        NOT NULL,   -- 'site_assignment_corrected' | 'invoice_pending' | etc.
  department   TEXT,
  related_date DATE,
  message      TEXT        NOT NULL,
  resolved     BOOLEAN     NOT NULL DEFAULT FALSE,
  resolved_by  UUID        REFERENCES employees(id),
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_dept_unresolved
  ON system_notifications (department, resolved)
  WHERE resolved = FALSE;


-- ── USEFUL VIEWS ─────────────────────────────────────────────────────────────

-- Latest active assignment per department per date (excludes superseded)
CREATE OR REPLACE VIEW v_active_site_assignments AS
SELECT * FROM site_assignments
WHERE status != 'superseded'
ORDER BY department, assignment_date DESC, version DESC;

-- Full audit trail — all versions for any dept+date
CREATE OR REPLACE VIEW v_site_assignment_history AS
SELECT
  sa.*,
  (SELECT COUNT(*) FROM site_assignment_lines sal WHERE sal.assignment_id = sa.id)  AS total_employees,
  (SELECT COUNT(*) FROM site_assignment_lines sal WHERE sal.assignment_id = sa.id AND sal.status = 'ASSIGNED') AS count_assigned,
  (SELECT COUNT(*) FROM site_assignment_lines sal WHERE sal.assignment_id = sa.id AND sal.status = 'IDLE')     AS count_idle,
  (SELECT COUNT(*) FROM site_assignment_lines sal WHERE sal.assignment_id = sa.id AND sal.status = 'LEAVE')    AS count_leave,
  (SELECT COUNT(*) FROM site_assignment_lines sal WHERE sal.assignment_id = sa.id AND sal.status = 'ABSENT')   AS count_absent
FROM site_assignments sa
ORDER BY department, assignment_date DESC, version DESC;


-- ── ROW LEVEL SECURITY (recommended) ────────────────────────────────────────
-- Enable RLS — adjust policies to match your roles
ALTER TABLE site_assignments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_assignment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_notifications  ENABLE ROW LEVEL SECURITY;

-- Allow service role (backend) full access
CREATE POLICY "service_role_all_sa"
  ON site_assignments FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "service_role_all_sal"
  ON site_assignment_lines FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

CREATE POLICY "service_role_all_notif"
  ON system_notifications FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- Allow authenticated users to READ their own department's assignments
-- (Adjust 'department' matching to your auth setup — this is an example)
CREATE POLICY "auth_read_sa"
  ON site_assignments FOR SELECT TO authenticated
  USING (status != 'superseded');   -- superseded records visible only to service role / admin

CREATE POLICY "auth_read_sal"
  ON site_assignment_lines FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY "auth_read_notif"
  ON system_notifications FOR SELECT TO authenticated
  USING (resolved = FALSE);
