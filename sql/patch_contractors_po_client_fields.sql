-- ============================================================
-- PATCH: Add PO-client billing fields to contractors table
-- Run once in Supabase SQL Editor
-- ============================================================

ALTER TABLE contractors
  ADD COLUMN IF NOT EXISTS currency        TEXT    NOT NULL DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS portal_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_name     TEXT,
  ADD COLUMN IF NOT EXISTS billing_notes   TEXT;

-- Update existing records: Cisco → USD
UPDATE contractors
SET currency = 'USD'
WHERE LOWER(contractor_name) LIKE '%cisco%';

-- Update existing records: stc → portal required (Oracle iSupplier)
UPDATE contractors
SET portal_required = true,
    portal_name     = 'Oracle iSupplier'
WHERE LOWER(contractor_name) LIKE '%solutions by stc%'
   OR LOWER(contractor_name) LIKE '%arabian internet%'
   OR contractor_code = 'STCS';
