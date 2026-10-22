-- ============================================================
-- PATCH: Add currency / exchange rate fields to invoices table
-- Run once in Supabase SQL Editor
-- ============================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS currency          TEXT    NOT NULL DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS exchange_rate_sar NUMERIC(12,6) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_amount_sar  NUMERIC(15,2);

-- Back-fill existing SAR invoices
UPDATE invoices
SET currency          = 'SAR',
    exchange_rate_sar = 1,
    total_amount_sar  = total_amount
WHERE currency IS NULL OR currency = '';

-- Index for currency filtering
CREATE INDEX IF NOT EXISTS idx_invoices_currency ON invoices(currency);
