-- ============================================================
-- PATCH: Add sort_order and part_no to invoice_lines
-- Run in Supabase SQL Editor
-- Safe to re-run: uses IF NOT EXISTS
-- ============================================================

ALTER TABLE invoice_lines
  ADD COLUMN IF NOT EXISTS sort_order   INT     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS part_no      TEXT;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'invoice_lines'
ORDER BY ordinal_position;
