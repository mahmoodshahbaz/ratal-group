-- ============================================================
-- RATAL GROUP — Site Master V2 Schema Patch
-- Run this in Supabase SQL Editor (safe to re-run — all IF NOT EXISTS)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Add dept_id to workflow_templates
--    (currently only has service_unit text — we want FK to departments)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE workflow_templates
  ADD COLUMN IF NOT EXISTS dept_id      uuid REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS wf_heading   text,
  ADD COLUMN IF NOT EXISTS budget_pct   jsonb NOT NULL DEFAULT '{
    "team":0,"supplier":0,"subcon":0,"food":0,"overtime":0,"petty":0,"misc":0
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS wf_name      text; -- auto-generated: dept_code + " — " + wf_heading

-- Back-fill wf_name from existing label where null
UPDATE workflow_templates SET wf_name = label WHERE wf_name IS NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. Milestone Library — per-department suggestion bank
--    PM picks from these when designing a workflow
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS milestone_library (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     uuid    NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  dept_id       uuid    REFERENCES departments(id),
  service_unit  text,                     -- NISU | TISU | CISU | ITSU (denorm for quick filter)
  phase         int     NOT NULL CHECK (phase IN (1,2,3)),  -- 1=Pre-Site, 2=Field, 3=Closeout
  milestone_name text   NOT NULL,
  sort_order    int     NOT NULL DEFAULT 0,
  is_active     bool    NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_milestone_lib_entity ON milestone_library(entity_id);
CREATE INDEX IF NOT EXISTS idx_milestone_lib_dept   ON milestone_library(dept_id);

-- ─────────────────────────────────────────────────────────────
-- 3. Job Number Sequence table (atomic counter)
--    One row per dept_code + year — increments on each call
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_number_seq (
  dept_code text  NOT NULL,
  yr        int   NOT NULL,
  last_seq  int   NOT NULL DEFAULT 0,
  PRIMARY KEY (dept_code, yr)
);

-- ─────────────────────────────────────────────────────────────
-- 4. RPC: generate_job_number(dept_code, yr)
--    Returns next job number string e.g. 'JOB-NISU-2026-0001'
--    Atomic — uses INSERT ... ON CONFLICT ... RETURNING
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION generate_job_number(p_dept_code text, p_yr int)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_seq int;
BEGIN
  INSERT INTO job_number_seq (dept_code, yr, last_seq)
  VALUES (p_dept_code, p_yr, 1)
  ON CONFLICT (dept_code, yr)
  DO UPDATE SET last_seq = job_number_seq.last_seq + 1
  RETURNING last_seq INTO v_seq;

  RETURN 'JOB-' || p_dept_code || '-' || p_yr::text || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

-- Grant execute to anon + authenticated (Supabase default roles)
GRANT EXECUTE ON FUNCTION generate_job_number(text, int) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 5. Seed milestone_library with common milestones
--    Uses ACCSYS entity id — update if yours differs
--    Entity: 558d78a5-e444-40e6-9569-e48aa7f57daa
-- ─────────────────────────────────────────────────────────────

-- Get dept IDs inline using subqueries (safe if dept_code doesn't exist → NULL = skipped by FK)
-- NISU milestones
INSERT INTO milestone_library (entity_id, service_unit, phase, milestone_name, sort_order)
SELECT '558d78a5-e444-40e6-9569-e48aa7f57daa', 'NISU', 1, m.name, m.ord
FROM (VALUES
  ('Site Survey Completed',          10),
  ('Design Drawings Approved',       20),
  ('Material List Submitted',        30),
  ('Material Procurement Completed', 40),
  ('Work Permit Obtained',           50),
  ('Access Permission Confirmed',    60)
) AS m(name, ord)
ON CONFLICT DO NOTHING;

INSERT INTO milestone_library (entity_id, service_unit, phase, milestone_name, sort_order)
SELECT '558d78a5-e444-40e6-9569-e48aa7f57daa', 'NISU', 2, m.name, m.ord
FROM (VALUES
  ('Mobilization to Site',         110),
  ('Civil Works Completed',        120),
  ('Cable Pulling Completed',       130),
  ('Equipment Installation Done',  140),
  ('Termination Completed',        150),
  ('Power-On & Testing',           160),
  ('Handover to Client',           170)
) AS m(name, ord)
ON CONFLICT DO NOTHING;

INSERT INTO milestone_library (entity_id, service_unit, phase, milestone_name, sort_order)
SELECT '558d78a5-e444-40e6-9569-e48aa7f57daa', 'NISU', 3, m.name, m.ord
FROM (VALUES
  ('As-Built Drawings Submitted',  210),
  ('Commissioning Report Issued',  220),
  ('Snag List Closed',             230),
  ('Final Invoice Submitted',      240),
  ('Payment Received',             250)
) AS m(name, ord)
ON CONFLICT DO NOTHING;

-- TISU milestones
INSERT INTO milestone_library (entity_id, service_unit, phase, milestone_name, sort_order)
SELECT '558d78a5-e444-40e6-9569-e48aa7f57daa', 'TISU', 1, m.name, m.ord
FROM (VALUES
  ('Site Acquisition Completed',   10),
  ('Tower Design Approved',        20),
  ('Foundation Permit Obtained',   30),
  ('Materials Delivered to Site',  40)
) AS m(name, ord)
ON CONFLICT DO NOTHING;

INSERT INTO milestone_library (entity_id, service_unit, phase, milestone_name, sort_order)
SELECT '558d78a5-e444-40e6-9569-e48aa7f57daa', 'TISU', 2, m.name, m.ord
FROM (VALUES
  ('Foundation Works Done',        110),
  ('Tower Erection Completed',     120),
  ('Antenna Installation Done',    130),
  ('Power & Earthing Completed',   140),
  ('RF Testing Passed',            150),
  ('Handover to Client',           160)
) AS m(name, ord)
ON CONFLICT DO NOTHING;

INSERT INTO milestone_library (entity_id, service_unit, phase, milestone_name, sort_order)
SELECT '558d78a5-e444-40e6-9569-e48aa7f57daa', 'TISU', 3, m.name, m.ord
FROM (VALUES
  ('As-Built Package Submitted',   210),
  ('NOC Obtained',                 220),
  ('Final Invoice Submitted',      230),
  ('Payment Received',             240)
) AS m(name, ord)
ON CONFLICT DO NOTHING;

-- CISU milestones
INSERT INTO milestone_library (entity_id, service_unit, phase, milestone_name, sort_order)
SELECT '558d78a5-e444-40e6-9569-e48aa7f57daa', 'CISU', 1, m.name, m.ord
FROM (VALUES
  ('Scope of Work Defined',        10),
  ('Bill of Quantities Prepared',  20),
  ('Client PO Received',           30)
) AS m(name, ord)
ON CONFLICT DO NOTHING;

INSERT INTO milestone_library (entity_id, service_unit, phase, milestone_name, sort_order)
SELECT '558d78a5-e444-40e6-9569-e48aa7f57daa', 'CISU', 2, m.name, m.ord
FROM (VALUES
  ('Civil Works Started',          110),
  ('Civil Works Completed',        120),
  ('Inspection Passed',            130),
  ('Handover to Client',           140)
) AS m(name, ord)
ON CONFLICT DO NOTHING;

INSERT INTO milestone_library (entity_id, service_unit, phase, milestone_name, sort_order)
SELECT '558d78a5-e444-40e6-9569-e48aa7f57daa', 'CISU', 3, m.name, m.ord
FROM (VALUES
  ('Final Report Submitted',       210),
  ('Invoice Submitted',            220),
  ('Payment Received',             230)
) AS m(name, ord)
ON CONFLICT DO NOTHING;

-- ITSU milestones
INSERT INTO milestone_library (entity_id, service_unit, phase, milestone_name, sort_order)
SELECT '558d78a5-e444-40e6-9569-e48aa7f57daa', 'ITSU', 1, m.name, m.ord
FROM (VALUES
  ('IT Scope Defined',             10),
  ('Hardware Procured',            20),
  ('Network Design Approved',      30)
) AS m(name, ord)
ON CONFLICT DO NOTHING;

INSERT INTO milestone_library (entity_id, service_unit, phase, milestone_name, sort_order)
SELECT '558d78a5-e444-40e6-9569-e48aa7f57daa', 'ITSU', 2, m.name, m.ord
FROM (VALUES
  ('Hardware Installation Done',   110),
  ('Network Configuration Done',   120),
  ('User Acceptance Testing',      130),
  ('Go-Live Completed',            140)
) AS m(name, ord)
ON CONFLICT DO NOTHING;

INSERT INTO milestone_library (entity_id, service_unit, phase, milestone_name, sort_order)
SELECT '558d78a5-e444-40e6-9569-e48aa7f57daa', 'ITSU', 3, m.name, m.ord
FROM (VALUES
  ('Handover Document Issued',     210),
  ('Invoice Submitted',            220),
  ('Payment Received',             230)
) AS m(name, ord)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 6. Enable RLS on new tables
-- ─────────────────────────────────────────────────────────────
ALTER TABLE milestone_library   ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_number_seq      ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read/write milestone_library
-- (DROP first so this is safe to re-run)
DROP POLICY IF EXISTS "milestone_library_read"  ON milestone_library;
DROP POLICY IF EXISTS "milestone_library_write" ON milestone_library;
DROP POLICY IF EXISTS "job_seq_deny_direct"     ON job_number_seq;

CREATE POLICY "milestone_library_read"
  ON milestone_library FOR SELECT TO authenticated USING (true);

CREATE POLICY "milestone_library_write"
  ON milestone_library FOR ALL TO authenticated USING (true);

-- job_number_seq is managed only by the SECURITY DEFINER function above
CREATE POLICY "job_seq_deny_direct"
  ON job_number_seq FOR ALL TO authenticated USING (false);

-- ─────────────────────────────────────────────────────────────
-- DONE — verify with:
-- SELECT routine_name FROM information_schema.routines WHERE routine_name = 'generate_job_number';
-- SELECT COUNT(*) FROM milestone_library;
-- ─────────────────────────────────────────────────────────────
