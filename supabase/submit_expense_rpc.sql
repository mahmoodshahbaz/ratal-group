-- ══════════════════════════════════════════════════════════════════
-- RPC: submit_expense_record()
-- Inserts a daily expense record, bypassing RLS (SECURITY DEFINER)
-- Called in dev mode (anon key) and production (QR token auth)
-- ══════════════════════════════════════════════════════════════════

-- Drop old version if it exists with different signature
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
    entity_id,
    employee_id,
    expense_date,
    project_id,
    site_number,
    category,
    coa_account_code,
    amount,
    vat_paid,
    vat_amount,
    vendor_name,
    receipt_url,
    remarks,
    status
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

-- ══════════════════════════════════════════════════════════════════
-- RLS: Allow anon to INSERT into expense_records
-- (dev mode + QR-token field forms use anon key)
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE expense_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_insert_expense_records" ON expense_records;
CREATE POLICY "anon_insert_expense_records"
  ON expense_records FOR INSERT TO anon
  WITH CHECK (true);

DROP POLICY IF EXISTS "anon_select_expense_records" ON expense_records;
CREATE POLICY "anon_select_expense_records"
  ON expense_records FOR SELECT TO anon
  USING (true);
