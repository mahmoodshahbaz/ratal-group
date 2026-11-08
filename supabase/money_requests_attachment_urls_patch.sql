-- ══════════════════════════════════════════════════════════════════
-- Money Requests — Attachment URLs Column Patch
-- Adds attachment_urls (TEXT[]) for Drive file links.
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS).
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE money_requests
  ADD COLUMN IF NOT EXISTS attachment_urls TEXT[] DEFAULT '{}';

-- Verify:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'money_requests' AND column_name = 'attachment_urls';

NOTIFY pgrst, 'reload schema';
