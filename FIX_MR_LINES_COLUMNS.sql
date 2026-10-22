-- ============================================================
-- FIX: money_request_lines — add ALL missing columns
-- Run in Supabase SQL Editor
-- ============================================================

ALTER TABLE money_request_lines
  ADD COLUMN IF NOT EXISTS party_type   TEXT,
  ADD COLUMN IF NOT EXISTS party_id     UUID,
  ADD COLUMN IF NOT EXISTS project_id   UUID REFERENCES projects(id),
  ADD COLUMN IF NOT EXISTS account_code TEXT,
  ADD COLUMN IF NOT EXISTS sort_order   INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_type    TEXT,
  ADD COLUMN IF NOT EXISTS supplier_name TEXT,
  ADD COLUMN IF NOT EXISTS iban         TEXT,
  ADD COLUMN IF NOT EXISTS amount       NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remarks      TEXT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- Confirm all columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'money_request_lines'
ORDER BY ordinal_position;
