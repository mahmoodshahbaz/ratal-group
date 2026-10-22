-- Site Assignment Permissions Patch
-- Run once in Supabase SQL Editor
-- Adds FA / OT / Others allowance flags to site_assignments

ALTER TABLE site_assignments
  ADD COLUMN IF NOT EXISTS allow_fa     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_ot     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_others BOOLEAN DEFAULT false;

-- Confirm
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'site_assignments'
  AND column_name IN ('allow_fa','allow_ot','allow_others')
ORDER BY column_name;
