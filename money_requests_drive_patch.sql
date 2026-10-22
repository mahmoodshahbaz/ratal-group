-- ============================================================
--  ACCSYS — Money Requests — Drive URL patch
--  Adds drive_url column to store the Google Drive PDF link.
--  Run ONCE in Supabase SQL Editor.
-- ============================================================

ALTER TABLE money_requests
  ADD COLUMN IF NOT EXISTS drive_url TEXT;

COMMENT ON COLUMN money_requests.drive_url IS
  'Google Drive view URL of the saved PDF (set automatically when Print window uploads)';

-- Verify
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'money_requests'
  AND column_name = 'drive_url';
