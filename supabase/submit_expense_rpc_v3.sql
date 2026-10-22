-- ══════════════════════════════════════════════════════════════════
-- submit_expense_record() — v3
-- Adds invoice_date, invoice_number, late_reason, vat_number
-- Run this in Supabase SQL editor to fix the "entity_id uuid vs text" error
-- ══════════════════════════════════════════════════════════════════

-- 1. Ensure all columns exist (safe — no-op if already present)
ALTER TABLE expense_records
  ADD COLUMN IF NOT EXISTS vat_number     TEXT,
  ADD COLUMN IF NOT EXISTS invoice_date   DATE,
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS late_reason    TEXT;

-- 2. Replace the RPC (drops old version regardless of signature)
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
    invoice_date,
    invoice_number,
    project_id,
    site_number,
    category,
    coa_account_code,
    amount,
    vat_paid,
    vat_amount,
    vendor_name,
    vat_number,
    receipt_url,
    remarks,
    late_reason,
    status
  ) VALUES (
    (payload->>'entity_id')::UUID,
    (payload->>'employee_id')::UUID,
    (payload->>'expense_date')::DATE,
    NULLIF(payload->>'invoice_date', '')::DATE,
    NULLIF(payload->>'invoice_number', ''),
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
    NULLIF(payload->>'late_reason', ''),
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
