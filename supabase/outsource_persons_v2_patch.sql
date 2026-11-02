-- ============================================================
-- outsource_persons v2 schema patch
-- Run once in Supabase SQL Editor
-- ============================================================

ALTER TABLE outsource_persons
  -- Classification
  ADD COLUMN IF NOT EXISTS person_type        text DEFAULT 'CON',         -- 'CON' | 'OUT'
  ADD COLUMN IF NOT EXISTS person_code        text,                        -- CON-0001 | OUT-0001

  -- Arabic name
  ADD COLUMN IF NOT EXISTS full_name_ar       text,

  -- Nationality
  ADD COLUMN IF NOT EXISTS nationality        text,

  -- Cost allocation
  ADD COLUMN IF NOT EXISTS dept_id            uuid REFERENCES departments(id),
  ADD COLUMN IF NOT EXISTS project_id         uuid REFERENCES projects(id),

  -- Engagement dates
  ADD COLUMN IF NOT EXISTS start_date         date,
  ADD COLUMN IF NOT EXISTS end_date           date,

  -- Rates
  ADD COLUMN IF NOT EXISTS daily_rate         numeric(12,2),
  ADD COLUMN IF NOT EXISTS monthly_rate       numeric(12,2),

  -- Payment
  ADD COLUMN IF NOT EXISTS payment_channel    text DEFAULT 'CASH',         -- 'CASH' | 'BANK_TRANSFER'

  -- Scope
  ADD COLUMN IF NOT EXISTS scope              text,

  -- ID documents
  ADD COLUMN IF NOT EXISTS iqama_expiry       date,

  -- CON → OUT conversion workflow
  ADD COLUMN IF NOT EXISTS conversion_status          text,                -- 'PENDING' | null
  ADD COLUMN IF NOT EXISTS conversion_reason          text,
  ADD COLUMN IF NOT EXISTS conversion_requested_at    timestamptz;

-- Backfill person_type for existing rows that have no type set
UPDATE outsource_persons SET person_type = 'OUT' WHERE person_type IS NULL;

-- Add index for faster filtering by type and entity
CREATE INDEX IF NOT EXISTS idx_outsource_persons_type      ON outsource_persons(person_type);
CREATE INDEX IF NOT EXISTS idx_outsource_persons_entity    ON outsource_persons(entity_id);
CREATE INDEX IF NOT EXISTS idx_outsource_persons_dept      ON outsource_persons(dept_id);
CREATE INDEX IF NOT EXISTS idx_outsource_persons_project   ON outsource_persons(project_id);
