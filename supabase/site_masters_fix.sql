-- ══════════════════════════════════════════════════════════════════
-- SITE MASTERS FIX — Add missing columns (dept_id, contractor_id)
-- Run in Supabase SQL Editor → safe to re-run (IF NOT EXISTS)
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE site_masters
  ADD COLUMN IF NOT EXISTS dept_id       UUID REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS contractor_id UUID REFERENCES contractors(id);

-- Add FK on pm_id so PostgREST can do joins (fixes 400 error on load)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
    WHERE tc.table_name = 'site_masters' AND tc.constraint_type = 'FOREIGN KEY' AND ccu.column_name = 'pm_id'
  ) THEN
    ALTER TABLE site_masters ADD CONSTRAINT fk_sm_pm FOREIGN KEY (pm_id) REFERENCES employees(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sm_dept       ON site_masters(dept_id);
CREATE INDEX IF NOT EXISTS idx_sm_contractor ON site_masters(contractor_id);
CREATE INDEX IF NOT EXISTS idx_sm_pm         ON site_masters(pm_id);
