-- Add custodian_purpose + one_time_purpose columns to field_payment_lines
-- (safe to run multiple times)
ALTER TABLE field_payment_lines
  ADD COLUMN IF NOT EXISTS custodian_purpose TEXT,   -- sub-type for CUSTODIAN_EXPENSE lines
  ADD COLUMN IF NOT EXISTS one_time_purpose  TEXT;   -- free-text purpose for ONE_TIME payees

NOTIFY pgrst, 'reload schema';
