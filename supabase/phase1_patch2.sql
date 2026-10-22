-- ═══════════════════════════════════════════════════════════════════
-- Phase 1 Patch #2 — Run ONLY this file in Supabase SQL Editor
-- Safe to run multiple times (all IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════

-- ─── Employees: new columns for GOSI + WPS ────────────────────────
ALTER TABLE employees ADD COLUMN IF NOT EXISTS nationality     VARCHAR(30)   DEFAULT 'EXPAT';   -- SAUDI|EXPAT
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_portion    NUMERIC(10,2) DEFAULT 0;         -- WPS & GOSI base
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_no     VARCHAR(30);                     -- e.g. ACC-0001
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_type   VARCHAR(20)   DEFAULT 'DIRECT';  -- DIRECT|OUTSOURCE
ALTER TABLE employees ADD COLUMN IF NOT EXISTS full_name       VARCHAR(200);                    -- alias for full_name_en

-- Backfill full_name from full_name_en if it exists
UPDATE employees SET full_name = full_name_en WHERE full_name IS NULL AND full_name_en IS NOT NULL;

-- ─── Payroll Items: GOSI + deduction columns ─────────────────────
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS gosi_amount       NUMERIC(10,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS loan_deduction    NUMERIC(10,2) DEFAULT 0;
ALTER TABLE payroll_items ADD COLUMN IF NOT EXISTS penalty_deduction NUMERIC(10,2) DEFAULT 0;

-- ─── Payroll Runs: GOSI total ────────────────────────────────────
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS total_gosi NUMERIC(12,2) DEFAULT 0;

-- ─── Notices (Employee Engagement / Notice Board) ─────────────────
CREATE TABLE IF NOT EXISTS notices (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id   UUID REFERENCES entities(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  body        TEXT,
  category    VARCHAR(30) DEFAULT 'ANNOUNCEMENT', -- ANNOUNCEMENT|POLICY|REMINDER|CELEBRATION|TRAINING|GENERAL
  priority    VARCHAR(10) DEFAULT 'MEDIUM',        -- HIGH|MEDIUM|LOW
  pinned      BOOLEAN DEFAULT FALSE,
  expires_at  DATE,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'auth_notices' AND tablename = 'notices'
  ) THEN
    CREATE POLICY "auth_notices" ON notices FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notices_entity ON notices(entity_id, created_at DESC);
