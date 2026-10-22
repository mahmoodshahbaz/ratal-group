-- ══════════════════════════════════════════════════════════════════
-- Add vat_number column to expense_records
-- Update submit_expense_record RPC to include it
-- ══════════════════════════════════════════════════════════════════

-- 1. Add column (safe — does nothing if already exists)
ALTER TABLE expense_records
  ADD COLUMN IF NOT EXISTS vat_number TEXT;

-- 2. Update RPC to accept and store vat_number
DROP FUNCTION IF EXISTS submit_expense_record CASCADE;

CREATE OR REPLACE FUNCTION submit_expense_record(payload JSONB)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO expense_records (
    entity_id, employee_id, expense_date, project_id, site_number,
    category, coa_account_code, amount, vat_paid, vat_amount,
    vendor_name, vat_number, receipt_url, remarks, status
  ) VALUES (
    (payload->>'entity_id')::UUID,
    (payload->>'employee_id')::UUID,
    (payload->>'expense_date')::DATE,
    NULLIF(payload->>'project_id', '')::UUID,
    payload->>'site_number',
    payload->>'category',
    payload->>'coa_account_code',
    (payload->>'amount')::NUMERIC,
    COALESCE((payload->>'vat_paid')::BOOLEAN, false),
    COALESCE((payload->>'vat_amount')::NUMERIC, 0),
    payload->>'vendor_name',
    payload->>'vat_number',
    payload->>'receipt_url',
    payload->>'remarks',
    'RECORDED'
  )
  RETURNING id INTO v_id;

  RETURN json_build_object('id', v_id, 'status', 'RECORDED');
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION submit_expense_record(JSONB) TO anon;
GRANT EXECUTE ON FUNCTION submit_expense_record(JSONB) TO authenticated;

-- Verify
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'expense_records' ORDER BY ordinal_position;
