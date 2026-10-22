-- ================================================================
--  ACCSYS — Add attachment_url to money_received
--  Run once in Supabase SQL editor
-- ================================================================
--  Stores the Google Drive view URL of the bank transfer receipt
--  PDF that was uploaded when Accounts marks an MR as paid.
--  Column is nullable — not every payment has a PDF receipt.
-- ================================================================

ALTER TABLE money_received
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

COMMENT ON COLUMN money_received.attachment_url
  IS 'Google Drive view URL of the uploaded bank transfer receipt PDF (uploaded via drive-upload edge function to the Bank Transfer Receipts folder).';
