-- ================================================================
--  ACCSYS — Add payment_method to money_request_lines
--  Run once in Supabase SQL editor
-- ================================================================
--  Each wire/transfer line can have its own payment method:
--  BANK_TRANSFER (default), CHEQUE, or CASH.
--  The per-line method is also used to derive the overall
--  money_received.payment_method (majority-vote).
-- ================================================================

ALTER TABLE money_request_lines
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'BANK_TRANSFER';

COMMENT ON COLUMN money_request_lines.payment_method
  IS 'Payment method for this specific wire: BANK_TRANSFER | CHEQUE | CASH. Defaults to BANK_TRANSFER.';
