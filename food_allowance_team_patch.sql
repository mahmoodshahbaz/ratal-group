-- ============================================================
-- FOOD ALLOWANCE — TEAM MODE PATCH
-- Adds: self_rate, self_amount, team_amount, beneficiaries
-- Run once in Supabase SQL editor
-- ============================================================

ALTER TABLE food_allowances
  ADD COLUMN IF NOT EXISTS self_rate     NUMERIC(8,2)  DEFAULT 30,
  ADD COLUMN IF NOT EXISTS self_amount   NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS team_amount   NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS beneficiaries JSONB         DEFAULT '[]'::jsonb;

-- beneficiaries structure per item:
-- {
--   "employee_id": "uuid",
--   "name":        "Full Name",
--   "amount":      20,
--   "ack_status":  "PENDING" | "CONFIRMED",
--   "ack_at":      null | "2026-10-09T10:30:00Z"
-- }

-- Index for querying pending acknowledgements
CREATE INDEX IF NOT EXISTS idx_fa_beneficiaries
  ON food_allowances USING gin(beneficiaries);

-- Trigger: auto-generate request_number if null on insert
CREATE OR REPLACE FUNCTION generate_food_allowance_number()
RETURNS TRIGGER AS $$
DECLARE
  yr   TEXT := TO_CHAR(NOW(), 'YYYY');
  seq  INT;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(request_number FROM 'FA-\d{4}-(\d+)') AS INT)
  ), 0) + 1
  INTO seq
  FROM food_allowances
  WHERE request_number LIKE 'FA-' || yr || '-%';

  NEW.request_number := 'FA-' || yr || '-' || LPAD(seq::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_food_allowance_number ON food_allowances;
CREATE TRIGGER trg_food_allowance_number
  BEFORE INSERT ON food_allowances
  FOR EACH ROW
  WHEN (NEW.request_number IS NULL OR NEW.request_number = '')
  EXECUTE FUNCTION generate_food_allowance_number();

-- RPC: acknowledge food allowance beneficiary
-- Called when outsourced worker taps confirm on their notification
CREATE OR REPLACE FUNCTION acknowledge_food_allowance(
  p_allowance_id  UUID,
  p_employee_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_beneficiaries JSONB;
  v_updated       JSONB;
  v_item          JSONB;
  v_idx           INT := 0;
  v_found         BOOLEAN := false;
BEGIN
  SELECT beneficiaries INTO v_beneficiaries
  FROM food_allowances WHERE id = p_allowance_id;

  IF v_beneficiaries IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Record not found');
  END IF;

  v_updated := '[]'::jsonb;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_beneficiaries)
  LOOP
    IF (v_item->>'employee_id') = p_employee_id::TEXT AND (v_item->>'ack_status') = 'PENDING' THEN
      v_item := v_item
        || jsonb_build_object('ack_status', 'CONFIRMED')
        || jsonb_build_object('ack_at', NOW()::TEXT);
      v_found := true;
    END IF;
    v_updated := v_updated || jsonb_build_array(v_item);
  END LOOP;

  UPDATE food_allowances
    SET beneficiaries = v_updated
  WHERE id = p_allowance_id;

  RETURN jsonb_build_object('ok', true, 'found', v_found);
END;
$$;
