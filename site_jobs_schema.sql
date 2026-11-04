-- ============================================================
-- RATAL GROUP — Site Jobs & Milestone System
-- Run this in Supabase SQL Editor (single pass)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1.  WORKFLOW TEMPLATES
--     PM can create / clone / edit templates per service unit.
--     One template = one job type (e.g. NISU-BIG, TISU-TOWER).
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_templates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     uuid        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  service_unit  text        NOT NULL,   -- NISU | TISU | CISU | ITSU
  job_type      text        NOT NULL,   -- e.g. NI-BIG, NI-MED, SWP, UPG, SFP, MIG, TWR, PKG, FREE
  label         text        NOT NULL,   -- Human name shown in UI
  description   text,
  is_active     bool        NOT NULL DEFAULT true,
  created_by    uuid        REFERENCES employees(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_id, service_unit, job_type)
);

-- ─────────────────────────────────────────────────────────────
-- 2.  WORKFLOW TEMPLATE MILESTONES
--     Ordered list of milestones for each template.
--     Phase: 1=Pre-Site (office), 2=Field (on-site), 3=Closeout
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workflow_template_milestones (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     uuid    NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  milestone_order int     NOT NULL,
  milestone_name  text    NOT NULL,
  phase           int     NOT NULL CHECK (phase IN (1,2,3)),
  is_optional     bool    NOT NULL DEFAULT false,
  notes_prompt    text,   -- helper text shown to field user
  UNIQUE (template_id, milestone_order)
);

-- ─────────────────────────────────────────────────────────────
-- 3.  SITE JOBS
--     The missing layer between site_masters and site_assignments.
--     One job = one contract work order on one site.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_jobs (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           uuid        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  site_master_id      uuid        NOT NULL REFERENCES site_masters(id),
  template_id         uuid        REFERENCES workflow_templates(id),   -- NULL = free-form
  job_ref             text,       -- client Job# (NISU/TISU); system may generate for CISU/ITSU
  service_unit        text        NOT NULL,  -- NISU | TISU | CISU | ITSU
  job_type            text        NOT NULL,  -- mirrors template.job_type
  status              text        NOT NULL DEFAULT 'NOT_STARTED'
                                  CHECK (status IN ('NOT_STARTED','IN_PROGRESS','COMPLETE','ON_HOLD','CANCELLED')),
  completion_pct      int         NOT NULL DEFAULT 0 CHECK (completion_pct BETWEEN 0 AND 100),
  milestones_locked   bool        NOT NULL DEFAULT false, -- true once first Phase-2 milestone ticked
  notes               text,
  created_by          uuid        REFERENCES employees(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────
-- 4.  SITE JOB MILESTONES
--     One row per milestone per job.
--     Seeded from the template when the job is created,
--     then locked once Phase-2 starts.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_job_milestones (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            uuid        NOT NULL REFERENCES site_jobs(id) ON DELETE CASCADE,
  template_milestone_id uuid    REFERENCES workflow_template_milestones(id),
  milestone_order   int         NOT NULL,
  milestone_name    text        NOT NULL,
  phase             int         NOT NULL CHECK (phase IN (1,2,3)),
  is_optional       bool        NOT NULL DEFAULT false,
  is_active         bool        NOT NULL DEFAULT true,  -- PM can toggle optional milestones off
  completed         bool        NOT NULL DEFAULT false,
  completed_date    date,
  completed_by      uuid        REFERENCES employees(id),
  photo_url         text,       -- Google Drive URL or Supabase Storage path
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, milestone_order)
);

-- ─────────────────────────────────────────────────────────────
-- 5.  ALTER site_assignments — add optional job_id
--     Keeps backward compatibility (nullable).
-- ─────────────────────────────────────────────────────────────
ALTER TABLE site_assignments
  ADD COLUMN IF NOT EXISTS job_id uuid REFERENCES site_jobs(id);

-- ─────────────────────────────────────────────────────────────
-- 6.  INDEXES
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_site_jobs_entity        ON site_jobs(entity_id);
CREATE INDEX IF NOT EXISTS idx_site_jobs_site_master   ON site_jobs(site_master_id);
CREATE INDEX IF NOT EXISTS idx_site_jobs_status        ON site_jobs(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_job_milestones_job      ON site_job_milestones(job_id);
CREATE INDEX IF NOT EXISTS idx_job_milestones_phase    ON site_job_milestones(job_id, phase);
CREATE INDEX IF NOT EXISTS idx_assignments_job         ON site_assignments(job_id);

-- ─────────────────────────────────────────────────────────────
-- 7.  RLS — ENABLE
-- ─────────────────────────────────────────────────────────────
ALTER TABLE workflow_templates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_template_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_jobs                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_job_milestones          ENABLE ROW LEVEL SECURITY;

-- Allow authenticated and anon to read everything in their entity
CREATE POLICY "entity_read_workflow_templates" ON workflow_templates
  FOR SELECT USING (true);
CREATE POLICY "entity_read_template_milestones" ON workflow_template_milestones
  FOR SELECT USING (true);
CREATE POLICY "entity_read_site_jobs" ON site_jobs
  FOR SELECT USING (true);
CREATE POLICY "entity_read_job_milestones" ON site_job_milestones
  FOR SELECT USING (true);

-- Writes go through SECURITY DEFINER RPCs below
-- ─────────────────────────────────────────────────────────────
-- 8.  RPC: create_site_job
--     Creates the job and seeds milestones from the template.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_site_job(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id      uuid;
  v_template_id uuid;
  v_ms_count    int := 0;
BEGIN
  v_template_id := (payload->>'template_id')::uuid;

  -- Insert the job
  INSERT INTO site_jobs (
    entity_id, site_master_id, template_id, job_ref,
    service_unit, job_type, notes, created_by
  ) VALUES (
    (payload->>'entity_id')::uuid,
    (payload->>'site_master_id')::uuid,
    v_template_id,
    payload->>'job_ref',
    payload->>'service_unit',
    payload->>'job_type',
    payload->>'notes',
    (payload->>'created_by')::uuid
  )
  RETURNING id INTO v_job_id;

  -- Seed milestones from template (if template provided)
  IF v_template_id IS NOT NULL THEN
    INSERT INTO site_job_milestones (
      job_id, template_milestone_id, milestone_order,
      milestone_name, phase, is_optional
    )
    SELECT
      v_job_id,
      id,
      milestone_order,
      milestone_name,
      phase,
      is_optional
    FROM workflow_template_milestones
    WHERE template_id = v_template_id
    ORDER BY milestone_order;

    GET DIAGNOSTICS v_ms_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'job_id',          v_job_id,
    'milestones_seeded', v_ms_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION create_site_job(jsonb) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 9.  RPC: tick_milestone
--     Marks a milestone complete/incomplete.
--     Auto-locks milestone list on first Phase-2 tick.
--     Recalculates job.completion_pct and job.status.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tick_milestone(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_milestone_id  uuid  := (payload->>'milestone_id')::uuid;
  v_completed     bool  := (payload->>'completed')::bool;
  v_completed_by  uuid  := (payload->>'completed_by')::uuid;
  v_photo_url     text  := payload->>'photo_url';
  v_notes         text  := payload->>'notes';
  v_job_id        uuid;
  v_phase         int;
  v_locked        bool;
  v_total         int;
  v_done          int;
  v_pct           int;
  v_new_status    text;
BEGIN
  -- Get context
  SELECT m.job_id, m.phase, j.milestones_locked
  INTO v_job_id, v_phase, v_locked
  FROM site_job_milestones m
  JOIN site_jobs j ON j.id = m.job_id
  WHERE m.id = v_milestone_id;

  IF v_job_id IS NULL THEN
    RETURN jsonb_build_object('error', 'milestone not found');
  END IF;

  -- Block structural changes after Phase-2 starts (only completion state allowed)
  -- The milestone list itself is frozen but ticking is still allowed

  -- Lock milestones list on first Phase-2 completion
  IF v_completed AND v_phase = 2 AND NOT v_locked THEN
    UPDATE site_jobs SET milestones_locked = true, updated_at = now()
    WHERE id = v_job_id;
  END IF;

  -- Update the milestone
  UPDATE site_job_milestones SET
    completed      = v_completed,
    completed_date = CASE WHEN v_completed THEN CURRENT_DATE ELSE NULL END,
    completed_by   = CASE WHEN v_completed THEN v_completed_by ELSE NULL END,
    photo_url      = COALESCE(v_photo_url, photo_url),
    notes          = COALESCE(v_notes, notes),
    updated_at     = now()
  WHERE id = v_milestone_id;

  -- Recalculate completion_pct (active milestones only)
  SELECT
    COUNT(*) FILTER (WHERE is_active),
    COUNT(*) FILTER (WHERE is_active AND completed)
  INTO v_total, v_done
  FROM site_job_milestones
  WHERE job_id = v_job_id;

  v_pct := CASE WHEN v_total = 0 THEN 0 ELSE ROUND(v_done * 100.0 / v_total) END;

  -- Derive status
  v_new_status := CASE
    WHEN v_done = 0     THEN 'NOT_STARTED'
    WHEN v_done = v_total THEN 'COMPLETE'
    ELSE 'IN_PROGRESS'
  END;

  UPDATE site_jobs SET
    completion_pct = v_pct,
    status         = v_new_status,
    updated_at     = now()
  WHERE id = v_job_id;

  RETURN jsonb_build_object(
    'job_id',         v_job_id,
    'completion_pct', v_pct,
    'status',         v_new_status,
    'milestones_done', v_done,
    'milestones_total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION tick_milestone(jsonb) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 10. RPC: toggle_milestone_active
--     PM can enable/disable optional milestones (before lock).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION toggle_milestone_active(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_milestone_id uuid := (payload->>'milestone_id')::uuid;
  v_is_active    bool := (payload->>'is_active')::bool;
  v_job_id       uuid;
  v_locked       bool;
BEGIN
  SELECT m.job_id, j.milestones_locked
  INTO v_job_id, v_locked
  FROM site_job_milestones m
  JOIN site_jobs j ON j.id = m.job_id
  WHERE m.id = v_milestone_id;

  IF v_locked THEN
    RETURN jsonb_build_object('error', 'milestone list is locked — Phase 2 has started');
  END IF;

  UPDATE site_job_milestones
  SET is_active = v_is_active, updated_at = now()
  WHERE id = v_milestone_id;

  RETURN jsonb_build_object('ok', true, 'job_id', v_job_id);
END;
$$;

GRANT EXECUTE ON FUNCTION toggle_milestone_active(jsonb) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 11. SEED DATA — Workflow Templates & Milestones
--     Uses DO block so it's idempotent and entity-agnostic.
--     Templates are seeded once per entity via the app,
--     but here we seed "system defaults" for entity_id = NULL
--     as a reference — the app copies them on first use.
--
--     NOTE: Replace 'YOUR_ENTITY_ID' with your actual entity UUID
--     before running, OR let the app clone these at runtime.
-- ─────────────────────────────────────────────────────────────

-- Helper function: seed one template + its milestones
CREATE OR REPLACE FUNCTION _seed_template(
  p_entity_id   uuid,
  p_unit        text,
  p_type        text,
  p_label       text,
  p_milestones  jsonb   -- [{name, phase, optional}]
) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_tid uuid;
  v_ms  jsonb;
  v_ord int := 1;
BEGIN
  INSERT INTO workflow_templates (entity_id, service_unit, job_type, label)
  VALUES (p_entity_id, p_unit, p_type, p_label)
  ON CONFLICT (entity_id, service_unit, job_type) DO NOTHING
  RETURNING id INTO v_tid;

  IF v_tid IS NULL THEN RETURN; END IF;  -- already seeded

  FOR v_ms IN SELECT * FROM jsonb_array_elements(p_milestones)
  LOOP
    INSERT INTO workflow_template_milestones
      (template_id, milestone_order, milestone_name, phase, is_optional)
    VALUES (
      v_tid, v_ord,
      v_ms->>'name',
      (v_ms->>'phase')::int,
      COALESCE((v_ms->>'optional')::bool, false)
    );
    v_ord := v_ord + 1;
  END LOOP;
END;
$$;

-- ── NISU: New Installation — Big Chassis (Data Center)
-- SELECT _seed_template('YOUR_ENTITY_ID', 'NISU', 'NI-BIG', 'NISU — New Install (Big Chassis / Data Center)', '[
SELECT _seed_template(
  (SELECT id FROM entities LIMIT 1),
  'NISU', 'NI-BIG', 'NISU — New Install (Big Chassis / Data Center)',
  '[
    {"name":"LOI / Work Order Received",            "phase":1},
    {"name":"Site Survey Completed (TSSR)",          "phase":1},
    {"name":"Design Drawing Approved",               "phase":1},
    {"name":"Material Procurement Confirmed",        "phase":1},
    {"name":"Equipment Delivered to Warehouse",      "phase":1},
    {"name":"Civil / Power Readiness Confirmed",     "phase":1},
    {"name":"Transportation to Site",                "phase":2},
    {"name":"Unpacking & Inspection",                "phase":2},
    {"name":"Rack / Cabinet Installation",           "phase":2},
    {"name":"Equipment Rack-In (Switches & Routers)","phase":2},
    {"name":"ODF / MDF Installation",                "phase":2},
    {"name":"Power Cable Laying & Connection",       "phase":2},
    {"name":"Ethernet Cable Laying & Labelling",     "phase":2},
    {"name":"Fiber Pigtail Termination",             "phase":2},
    {"name":"Power-On & Equipment Self-Test",        "phase":2},
    {"name":"Commissioning & Configuration",         "phase":2},
    {"name":"Hardware Cutover",                      "phase":2, "optional":true},
    {"name":"PAT (Pre-Acceptance Test)",             "phase":2},
    {"name":"Site Cleanup",                          "phase":2},
    {"name":"As-Built Documentation",                "phase":3},
    {"name":"Customer Acceptance Sign-Off",          "phase":3},
    {"name":"Invoice Submitted",                     "phase":3}
  ]'
);

-- ── NISU: New Installation — Medium Chassis (Data Room)
SELECT _seed_template(
  (SELECT id FROM entities LIMIT 1),
  'NISU', 'NI-MED', 'NISU — New Install (Medium Chassis / Data Room)',
  '[
    {"name":"LOI / Work Order Received",         "phase":1},
    {"name":"Site Survey Completed (TSSR)",       "phase":1},
    {"name":"Design Drawing Approved",            "phase":1},
    {"name":"Material Procurement Confirmed",     "phase":1},
    {"name":"Equipment Delivered to Warehouse",   "phase":1},
    {"name":"Civil / Power Readiness Confirmed",  "phase":1},
    {"name":"Transportation to Site",             "phase":2},
    {"name":"Unpacking & Inspection",             "phase":2},
    {"name":"Rack Installation",                  "phase":2, "optional":true},
    {"name":"Equipment Rack-In (Switches & Router)","phase":2},
    {"name":"ODF Installation",                   "phase":2},
    {"name":"Power Cable Laying & Connection",    "phase":2},
    {"name":"Ethernet Cable Laying & Labelling",  "phase":2},
    {"name":"Fiber Pigtail Termination",          "phase":2},
    {"name":"Power-On & Equipment Self-Test",     "phase":2},
    {"name":"Commissioning & Configuration",      "phase":2},
    {"name":"PAT (Pre-Acceptance Test)",          "phase":2},
    {"name":"Site Cleanup",                       "phase":2},
    {"name":"As-Built Documentation",             "phase":3},
    {"name":"Customer Acceptance Sign-Off",       "phase":3},
    {"name":"Invoice Submitted",                  "phase":3}
  ]'
);

-- ── NISU: New Installation — Small Chassis (POP / UPE)
SELECT _seed_template(
  (SELECT id FROM entities LIMIT 1),
  'NISU', 'NI-SML', 'NISU — New Install (Small Chassis / POP-UPE)',
  '[
    {"name":"LOI / Work Order Received",         "phase":1},
    {"name":"Site Survey Completed",             "phase":1},
    {"name":"Material Procurement Confirmed",    "phase":1},
    {"name":"Equipment Delivered to Warehouse",  "phase":1},
    {"name":"Transportation to Site",            "phase":2},
    {"name":"Unpacking & Inspection",            "phase":2},
    {"name":"Rack Installation",                 "phase":2, "optional":true},
    {"name":"Equipment Installation",            "phase":2},
    {"name":"ODF Installation",                  "phase":2},
    {"name":"Power Cable Connection",            "phase":2},
    {"name":"Cable Laying & Labelling",          "phase":2},
    {"name":"Fiber Pigtail Termination",         "phase":2},
    {"name":"Power-On & Self-Test",              "phase":2},
    {"name":"Commissioning",                     "phase":2},
    {"name":"PAT",                               "phase":2},
    {"name":"Site Cleanup",                      "phase":2},
    {"name":"As-Built Documentation",            "phase":3},
    {"name":"Customer Acceptance Sign-Off",      "phase":3},
    {"name":"Invoice Submitted",                 "phase":3}
  ]'
);

-- ── NISU: New Installation — ACCESS / Mini
SELECT _seed_template(
  (SELECT id FROM entities LIMIT 1),
  'NISU', 'NI-ACC', 'NISU — New Install (ACCESS / Mini)',
  '[
    {"name":"LOI / Work Order Received",        "phase":1},
    {"name":"Material Procurement Confirmed",   "phase":1},
    {"name":"Equipment Delivered to Warehouse", "phase":1},
    {"name":"Transportation to Site",           "phase":2},
    {"name":"Unpacking & Inspection",           "phase":2},
    {"name":"Equipment Installation",           "phase":2},
    {"name":"Power Cable Connection",           "phase":2},
    {"name":"Cable Laying & Labelling",         "phase":2},
    {"name":"Power-On & Self-Test",             "phase":2},
    {"name":"PAT",                              "phase":2},
    {"name":"Site Cleanup",                     "phase":2},
    {"name":"As-Built Documentation",           "phase":3},
    {"name":"Customer Acceptance Sign-Off",     "phase":3},
    {"name":"Invoice Submitted",                "phase":3}
  ]'
);

-- ── NISU: Card Upgrade
SELECT _seed_template(
  (SELECT id FROM entities LIMIT 1),
  'NISU', 'UPG', 'NISU — Card Upgrade',
  '[
    {"name":"Work Order / Change Request Received", "phase":1},
    {"name":"Card / Part Ordered & Confirmed",      "phase":1},
    {"name":"Slot Availability Verified",           "phase":1},
    {"name":"Maintenance Window Scheduled",         "phase":1},
    {"name":"Configuration Backup Taken",           "phase":2},
    {"name":"Card Installation",                    "phase":2},
    {"name":"Power-On & Board Self-Test",           "phase":2},
    {"name":"Optical Power Test",                   "phase":2},
    {"name":"Service Verification",                 "phase":2},
    {"name":"Customer Sign-Off",                    "phase":3},
    {"name":"Documentation Updated",                "phase":3},
    {"name":"Invoice Submitted",                    "phase":3}
  ]'
);

-- ── NISU: Card SWAP
SELECT _seed_template(
  (SELECT id FROM entities LIMIT 1),
  'NISU', 'SWP', 'NISU — Card SWAP',
  '[
    {"name":"Fault Report / Work Order Received",  "phase":1},
    {"name":"Replacement Card Confirmed & Ready",  "phase":1},
    {"name":"Maintenance Window Agreed",           "phase":1},
    {"name":"Configuration Backup Taken",          "phase":2},
    {"name":"Faulty Card Removed",                 "phase":2},
    {"name":"Replacement Card Installed",          "phase":2},
    {"name":"Power-On & Board Self-Test",          "phase":2},
    {"name":"Service Restoration Verified",        "phase":2},
    {"name":"Old Card Returned / Disposed",        "phase":2},
    {"name":"Customer Sign-Off",                   "phase":3},
    {"name":"Documentation Updated",               "phase":3},
    {"name":"Invoice Submitted",                   "phase":3}
  ]'
);

-- ── NISU: SFP Replacement
SELECT _seed_template(
  (SELECT id FROM entities LIMIT 1),
  'NISU', 'SFP', 'NISU — SFP Replacement',
  '[
    {"name":"Fault Report / Work Order Received", "phase":1},
    {"name":"Replacement SFP Confirmed & Ready",  "phase":1},
    {"name":"Site Visit Arranged",                "phase":1},
    {"name":"Old SFP Removed",                    "phase":2},
    {"name":"New SFP Installed",                  "phase":2},
    {"name":"Optical Power Tested",               "phase":2},
    {"name":"Port Link Verified",                 "phase":2},
    {"name":"Customer Sign-Off",                  "phase":3},
    {"name":"Documentation Updated",              "phase":3},
    {"name":"Invoice Submitted",                  "phase":3}
  ]'
);

-- ── NISU: Migration
SELECT _seed_template(
  (SELECT id FROM entities LIMIT 1),
  'NISU', 'MIG', 'NISU — Migration / Cutover',
  '[
    {"name":"Migration Plan Approved",            "phase":1},
    {"name":"Configuration Export from Old Node", "phase":1},
    {"name":"New Node Pre-Config Complete",       "phase":1},
    {"name":"Cable Prep & Labelling",             "phase":1},
    {"name":"Customer Notification Sent",         "phase":1},
    {"name":"Maintenance Window Started",         "phase":2},
    {"name":"Old Node Traffic Drained",           "phase":2},
    {"name":"Cable Migration Completed",          "phase":2},
    {"name":"New Node Activated",                 "phase":2},
    {"name":"Service Verification (All Links Up)","phase":2},
    {"name":"Old Node Decommissioned",            "phase":2, "optional":true},
    {"name":"Customer Sign-Off",                  "phase":3},
    {"name":"As-Built Documentation",             "phase":3},
    {"name":"Invoice Submitted",                  "phase":3}
  ]'
);

-- ── TISU: Tower / PKG Package (17 milestones)
SELECT _seed_template(
  (SELECT id FROM entities LIMIT 1),
  'TISU', 'TWR-PKG', 'TISU — Tower Package (Full PKG)',
  '[
    {"name":"PKG-01 — LOI / Contract Issued",             "phase":1},
    {"name":"PKG-02 — Site Survey (TSSR Submitted)",      "phase":1},
    {"name":"PKG-03 — Design Drawing Approved",           "phase":1},
    {"name":"PKG-04 — Material Procurement Confirmed",    "phase":1},
    {"name":"PKG-05 — Civil Works Completed",             "phase":2},
    {"name":"PKG-06 — Equipment Delivered to Site",       "phase":2},
    {"name":"PKG-07 — Equipment Installation",            "phase":2},
    {"name":"PKG-08 — Power Installation",                "phase":2},
    {"name":"PKG-09 — Feeder Cable Installation",         "phase":2},
    {"name":"PKG-10 — Antenna Installation",              "phase":2},
    {"name":"PKG-11 — Grounding & Earthing",              "phase":2},
    {"name":"PKG-12 — Power-On",                         "phase":2},
    {"name":"PKG-13 — Commissioning & Integration",       "phase":2},
    {"name":"PKG-14 — Drive Test",                        "phase":2},
    {"name":"PKG-15 — RF Optimization",                   "phase":2, "optional":true},
    {"name":"PKG-16 — PAT / Customer Acceptance",         "phase":3},
    {"name":"PKG-17 — As-Built Documentation & Invoice",  "phase":3}
  ]'
);

-- ── CISU: Free-form (no predefined milestones — PM adds manually)
SELECT _seed_template(
  (SELECT id FROM entities LIMIT 1),
  'CISU', 'FREE', 'CISU — Civil / Infrastructure (Free-form)',
  '[
    {"name":"Work Order Received",           "phase":1},
    {"name":"Site Access Arranged",          "phase":1},
    {"name":"Works Commenced",               "phase":2},
    {"name":"Works Completed",               "phase":2},
    {"name":"Site Cleanup",                  "phase":2},
    {"name":"Customer Acceptance",           "phase":3},
    {"name":"Invoice Submitted",             "phase":3}
  ]'
);

-- ── ITSU: Free-form
SELECT _seed_template(
  (SELECT id FROM entities LIMIT 1),
  'ITSU', 'FREE', 'ITSU — IT / Support (Free-form)',
  '[
    {"name":"Work Order Received",           "phase":1},
    {"name":"Remote Assessment Done",        "phase":1, "optional":true},
    {"name":"On-Site Visit",                 "phase":2},
    {"name":"Issue Resolved / Work Done",    "phase":2},
    {"name":"Testing & Verification",        "phase":2},
    {"name":"Customer Sign-Off",             "phase":3},
    {"name":"Invoice Submitted",             "phase":3}
  ]'
);

-- ── NISU: Board Expansion (add boards to existing frame)
SELECT _seed_template(
  (SELECT id FROM entities LIMIT 1),
  'NISU', 'BRD-EXP', 'NISU — Board Expansion',
  '[
    {"name":"Expansion Work Order Received",       "phase":1},
    {"name":"Board(s) Ordered & Confirmed",        "phase":1},
    {"name":"Frame Capacity Verified",             "phase":1},
    {"name":"Maintenance Window Scheduled",        "phase":1},
    {"name":"Configuration Backup Taken",          "phase":2},
    {"name":"Board Installation (1-3 boards)",     "phase":2},
    {"name":"Cable Connections (Ethernet/Fiber)",  "phase":2},
    {"name":"Power-On & Self-Test",                "phase":2},
    {"name":"Labelling",                           "phase":2},
    {"name":"Service Verification",                "phase":2},
    {"name":"Customer Sign-Off",                   "phase":3},
    {"name":"Documentation Updated",               "phase":3},
    {"name":"Invoice Submitted",                   "phase":3}
  ]'
);

-- ── NISU: New ODF Installation
SELECT _seed_template(
  (SELECT id FROM entities LIMIT 1),
  'NISU', 'ODF', 'NISU — New ODF Installation',
  '[
    {"name":"Work Order Received",               "phase":1},
    {"name":"ODF Equipment Delivered",           "phase":1},
    {"name":"Cabinet Mounting",                  "phase":2},
    {"name":"Connector Array Installation",      "phase":2},
    {"name":"Cable Routing & Termination",       "phase":2},
    {"name":"Self-Test & Verification",          "phase":2},
    {"name":"Customer Sign-Off",                 "phase":3},
    {"name":"Documentation Updated",             "phase":3},
    {"name":"Invoice Submitted",                 "phase":3}
  ]'
);

-- Drop the helper function (no longer needed at runtime)
DROP FUNCTION IF EXISTS _seed_template(uuid, text, text, text, jsonb);

-- ─────────────────────────────────────────────────────────────
-- 12. HELPER VIEW: jobs with progress summary
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_site_jobs AS
SELECT
  j.id,
  j.entity_id,
  j.site_master_id,
  sm.sm_id,
  sm.site_name,
  j.job_ref,
  j.service_unit,
  j.job_type,
  j.status,
  j.completion_pct,
  j.milestones_locked,
  -- milestone counts
  COUNT(m.id)                                             AS total_milestones,
  COUNT(m.id) FILTER (WHERE m.is_active)                 AS active_milestones,
  COUNT(m.id) FILTER (WHERE m.completed AND m.is_active) AS done_milestones,
  -- phase breakdown
  COUNT(m.id) FILTER (WHERE m.phase = 1 AND m.is_active AND m.completed) AS phase1_done,
  COUNT(m.id) FILTER (WHERE m.phase = 1 AND m.is_active)                 AS phase1_total,
  COUNT(m.id) FILTER (WHERE m.phase = 2 AND m.is_active AND m.completed) AS phase2_done,
  COUNT(m.id) FILTER (WHERE m.phase = 2 AND m.is_active)                 AS phase2_total,
  COUNT(m.id) FILTER (WHERE m.phase = 3 AND m.is_active AND m.completed) AS phase3_done,
  COUNT(m.id) FILTER (WHERE m.phase = 3 AND m.is_active)                 AS phase3_total,
  j.created_at,
  j.updated_at
FROM site_jobs j
JOIN site_masters sm ON sm.id = j.site_master_id
LEFT JOIN site_job_milestones m ON m.job_id = j.id
GROUP BY j.id, sm.sm_id, sm.site_name;

-- ─────────────────────────────────────────────────────────────
-- DONE. Run this entire file once in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────
