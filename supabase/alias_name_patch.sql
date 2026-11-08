-- ════════════════════════════════════════════════════════════
-- Alias Name Patch — money_request_lines
-- Adds alias_name: the IBAN account holder's name when it
-- differs from the actual payee (transfer routed via
-- a same-bank account to avoid inter-bank charges).
-- ════════════════════════════════════════════════════════════

ALTER TABLE money_request_lines
  ADD COLUMN IF NOT EXISTS alias_name TEXT;

COMMENT ON COLUMN money_request_lines.alias_name IS
  'IBAN holder name when different from the actual payee. '
  'Used when payment is routed via a same-bank account to '
  'save inter-bank transfer charges. Books record the actual '
  'payee (supplier_name); alias_name records who received '
  'the bank transfer on their behalf.';
