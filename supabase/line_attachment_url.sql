-- ================================================================
--  ACCSYS — Add attachment_url to money_request_lines
--  Run once in Supabase SQL editor
-- ================================================================
--  Each individual wire/transfer gets its own bank receipt PDF
--  saved in Google Drive. The Drive view URL is stored here.
--  Filename convention on Drive:
--    {MR-2026-0023}-{BeneficiaryName}-{Amount}.pdf
-- ================================================================

ALTER TABLE money_request_lines
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

COMMENT ON COLUMN money_request_lines.attachment_url
  IS 'Google Drive view URL for the per-wire bank transfer receipt PDF. Filename: {request_number}-{beneficiary_name}-{amount}.pdf';
