-- ══════════════════════════════════════════════════════════════════
-- LOI Attachment URLs — Column Patch
-- Adds attachment_urls (TEXT[]) to loi_requests for Drive file links.
-- Safe to run multiple times (ADD IF NOT EXISTS).
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE loi_requests
  ADD COLUMN IF NOT EXISTS attachment_urls TEXT[] DEFAULT '{}';

-- Verify:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'loi_requests' AND column_name = 'attachment_urls';

NOTIFY pgrst, 'reload schema';
