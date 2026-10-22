-- ══════════════════════════════════════════════════════════════════
-- RATAL GROUP — Departments missing columns patch
-- Run in Supabase → SQL Editor
-- Safe to run multiple times (IF NOT EXISTS guards)
-- ══════════════════════════════════════════════════════════════════

-- Approval hierarchy FKs (optional — filled after employees are created)
ALTER TABLE departments ADD COLUMN IF NOT EXISTS dept_head_id   UUID REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS pm_id          UUID REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE departments ADD COLUMN IF NOT EXISTS supervisor_id  UUID REFERENCES employees(id) ON DELETE SET NULL;

-- Department description / activity notes
ALTER TABLE departments ADD COLUMN IF NOT EXISTS description    TEXT;

-- ─── DONE ───────────────────────────────────────────────────────
-- After running this:
-- 1. You can create departments without errors
-- 2. Dept Head / PM / Supervisor can be left blank for now
-- 3. Once employee list is complete, come back and assign accordingly
