-- ============================================================
-- late_invoice_controls.sql
-- Invoice date, late-submission controls, admin audit trail,
-- VAT period locking
-- ============================================================

-- ── 1. New columns on expense_records ──────────────────────

ALTER TABLE expense_records
  -- The date printed on the invoice (mandatory from this patch onward)
  ADD COLUMN IF NOT EXISTS invoice_date       DATE,
  -- Invoice / receipt number (for duplicate detection)
  ADD COLUMN IF NOT EXISTS invoice_number     TEXT,
  -- Mandatory when invoice_date is > 30 days before submission
  ADD COLUMN IF NOT EXISTS late_reason        TEXT,
  -- Days between invoice_date and submitted_at (computed on insert)
  ADD COLUMN IF NOT EXISTS late_days          INTEGER,

  -- Admin adjustment audit trail
  -- When admin zeros or adjusts an entry, original amount is captured here
  ADD COLUMN IF NOT EXISTS original_amount    NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS adjusted_by        UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS adjusted_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS adjustment_note    TEXT,

  -- Cross-period VAT override (when invoice falls in a locked VAT quarter)
  ADD COLUMN IF NOT EXISTS vat_period_override_by   UUID REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS vat_period_override_note TEXT,
  ADD COLUMN IF NOT EXISTS vat_period_override_at   TIMESTAMPTZ;

-- ── 2. Backfill late_days for existing records ──────────────
UPDATE expense_records
SET late_days = (created_at::date - expense_date)::INTEGER
WHERE late_days IS NULL
  AND expense_date IS NOT NULL
  AND created_at IS NOT NULL;

-- ── 3. vat_periods — track locked VAT quarters ─────────────
-- Drop & recreate to ensure entity_id is UUID (old version used TEXT)
DROP TABLE IF EXISTS vat_periods CASCADE;
CREATE TABLE vat_periods (
  id             UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id      UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  quarter_label  TEXT        NOT NULL,          -- e.g. 'Q3-2026'
  period_start   DATE        NOT NULL,
  period_end     DATE        NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'OPEN'
                             CHECK (status IN ('OPEN','LOCKED')),
  vat_return_id  UUID,                          -- link to vat_returns.id when locked
  locked_by      UUID        REFERENCES employees(id),
  locked_at      TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE (entity_id, quarter_label)
);

-- ── 4. Seed VAT periods for 2025–2027 (all entities) ───────
-- Looks up entity UUIDs from entities table by entity_code
DO $$
DECLARE
  ent_row RECORD;
  yr   INT;
  q    INT;
  qs   TEXT[]   := ARRAY['Q1','Q2','Q3','Q4'];
  ms   INT[][]  := ARRAY[ARRAY[1,3], ARRAY[4,6], ARRAY[7,9], ARRAY[10,12]];
BEGIN
  FOR ent_row IN SELECT id FROM entities LOOP
    FOR yr IN 2025..2027 LOOP
      FOR q IN 1..4 LOOP
        INSERT INTO vat_periods (entity_id, quarter_label, period_start, period_end)
        VALUES (
          ent_row.id,
          qs[q] || '-' || yr,
          make_date(yr, ms[q][1], 1),
          (make_date(yr, ms[q][2], 1) + INTERVAL '1 month - 1 day')::DATE
        )
        ON CONFLICT (entity_id, quarter_label) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- ── 5. Function: check_invoice_vat_period(invoice_date, entity_id) ──
-- Returns: 'OK' | 'LOCKED' | 'WARN'
CREATE OR REPLACE FUNCTION check_invoice_vat_period(
  p_invoice_date DATE,
  p_entity_id    UUID
)
RETURNS TEXT
LANGUAGE SQL STABLE AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN vp.status = 'LOCKED' THEN 'LOCKED' ELSE 'OK' END
     FROM   vat_periods vp
     WHERE  vp.entity_id   = p_entity_id
       AND  p_invoice_date BETWEEN vp.period_start AND vp.period_end
     LIMIT 1),
    'OK'
  );
$$;

-- ── 6. Update submit_expense_record RPC to accept new fields ─
-- Drop old version first (parameter list changed)
DROP FUNCTION IF EXISTS submit_expense_record(JSONB);

CREATE OR REPLACE FUNCTION submit_expense_record(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_invoice_date   DATE;
  v_late_days      INTEGER;
  v_orig_amount    NUMERIC(12,2);
  v_new_id         UUID;
  v_vat_status     TEXT;
BEGIN
  -- Parse invoice_date (falls back to expense_date if not provided)
  v_invoice_date := COALESCE(
    (payload->>'invoice_date')::DATE,
    (payload->>'expense_date')::DATE
  );

  -- Compute late_days
  v_late_days := (CURRENT_DATE - v_invoice_date)::INTEGER;

  -- Hard block: > 90 days without override flag
  IF v_late_days > 90 AND (payload->>'admin_override') IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object('error', 'HARD_BLOCK_90',
      'message', 'Invoice is more than 90 days old. Contact Accounts to process.');
  END IF;

  -- Soft block 31–60: late_reason required
  IF v_late_days > 30 AND (payload->>'late_reason') IS NULL THEN
    RETURN jsonb_build_object('error', 'LATE_REASON_REQUIRED',
      'message', 'Invoice is over 30 days old. A reason for late submission is required.');
  END IF;

  -- Check VAT period
  v_vat_status := check_invoice_vat_period(v_invoice_date, (payload->>'entity_id')::UUID);

  INSERT INTO expense_records (
    entity_id, employee_id, expense_date, invoice_date, invoice_number,
    project_id, site_number, category, coa_account_code,
    amount, vat_paid, vat_amount, vendor_name, vat_number,
    receipt_url, remarks, late_reason, late_days, status
  ) VALUES (
    payload->>'entity_id',
    (payload->>'employee_id')::UUID,
    (payload->>'expense_date')::DATE,
    v_invoice_date,
    payload->>'invoice_number',
    (payload->>'project_id')::UUID,
    payload->>'site_number',
    payload->>'category',
    payload->>'coa_account_code',
    (payload->>'amount')::NUMERIC,
    (payload->>'vat_paid')::BOOLEAN,
    (payload->>'vat_amount')::NUMERIC,
    payload->>'vendor_name',
    payload->>'vat_number',
    payload->>'receipt_url',
    payload->>'remarks',
    payload->>'late_reason',
    v_late_days,
    'RECORDED'
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'id',          v_new_id,
    'late_days',   v_late_days,
    'vat_status',  v_vat_status
  );
END;
$$;

-- ── 7. Admin adjust function ────────────────────────────────
CREATE OR REPLACE FUNCTION admin_adjust_expense(
  p_record_id     UUID,
  p_new_amount    NUMERIC(12,2),
  p_note          TEXT,
  p_admin_emp_id  UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_original NUMERIC(12,2);
BEGIN
  -- Capture original (only on first adjustment — don't overwrite original_amount twice)
  SELECT amount INTO v_original FROM expense_records WHERE id = p_record_id;
  IF v_original IS NULL THEN
    RETURN jsonb_build_object('error', 'Record not found');
  END IF;

  UPDATE expense_records SET
    original_amount = CASE WHEN original_amount IS NULL THEN v_original ELSE original_amount END,
    amount          = p_new_amount,
    adjusted_by     = p_admin_emp_id,
    adjusted_at     = now(),
    adjustment_note = p_note
  WHERE id = p_record_id;

  RETURN jsonb_build_object('ok', true, 'original', v_original, 'new', p_new_amount);
END;
$$;

-- ── 8. Lock a VAT period (call from VATReturn.jsx after posting) ──
CREATE OR REPLACE FUNCTION lock_vat_period(
  p_entity_id    UUID,
  p_quarter      TEXT,   -- e.g. 'Q3-2026'
  p_locked_by    UUID,
  p_return_id    UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE vat_periods SET
    status        = 'LOCKED',
    locked_by     = p_locked_by,
    locked_at     = now(),
    vat_return_id = COALESCE(p_return_id, vat_return_id)
  WHERE entity_id     = p_entity_id
    AND quarter_label = p_quarter;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Period not found: ' || p_quarter);
  END IF;

  RETURN jsonb_build_object('ok', true, 'locked', p_quarter);
END;
$$;

-- ── 9. Duplicate invoice check ──────────────────────────────
-- Returns existing record if same invoice_number + vendor + employee found in last 90 days
CREATE OR REPLACE FUNCTION check_duplicate_invoice(
  p_employee_id    UUID,
  p_invoice_number TEXT,
  p_vendor_name    TEXT
)
RETURNS JSONB
LANGUAGE SQL STABLE AS $$
  SELECT CASE
    WHEN COUNT(*) > 0 THEN jsonb_build_object(
      'duplicate', true,
      'existing_id', (array_agg(id))[1],
      'existing_date', (array_agg(invoice_date ORDER BY created_at DESC))[1],
      'existing_amount', (array_agg(amount ORDER BY created_at DESC))[1]
    )
    ELSE jsonb_build_object('duplicate', false)
  END
  FROM expense_records
  WHERE employee_id    = p_employee_id
    AND invoice_number = p_invoice_number
    AND vendor_name    ILIKE '%' || COALESCE(p_vendor_name,'') || '%'
    AND created_at     > now() - INTERVAL '90 days'
    AND amount         > 0;
$$;
