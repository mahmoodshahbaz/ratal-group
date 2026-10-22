-- ================================================================
--  FIX: use total_amount as PO face value
--  purchase_orders columns confirmed: total_amount (numeric)
--  Run this in Supabase SQL editor
-- ================================================================

-- ── Fix fn_update_po_totals (uses total_amount now) ────────────
CREATE OR REPLACE FUNCTION fn_update_po_totals(p_po_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_invoiced numeric;
  v_face     numeric;
BEGIN
  SELECT COALESCE(SUM(i.total_amount), 0)
  INTO v_invoiced
  FROM invoices i
  WHERE i.po_id = p_po_id
    AND i.status NOT IN ('CANCELLED','REJECTED','DRAFT');

  SELECT COALESCE(po.total_amount, 0)
  INTO v_face
  FROM purchase_orders po WHERE id = p_po_id;

  UPDATE purchase_orders
  SET invoiced_value = v_invoiced,
      status = CASE
        WHEN v_invoiced >= v_face AND v_face > 0 THEN 'FROZEN'
        WHEN v_invoiced > 0                       THEN 'PARTIAL'
        ELSE status
      END,
      frozen_at = CASE
        WHEN v_invoiced >= v_face AND v_face > 0 THEN COALESCE(frozen_at, NOW())
        ELSE NULL
      END,
      frozen_reason = CASE
        WHEN v_invoiced >= v_face AND v_face > 0 THEN '100% invoiced — PO closed'
        ELSE NULL
      END,
      updated_at = NOW()
  WHERE id = p_po_id;
END;
$$;

-- ── Fix validate_invoice (uses total_amount now) ───────────────
CREATE OR REPLACE FUNCTION validate_invoice(
  p_po_id          uuid,
  p_line_item_id   uuid,
  p_invoice_amount numeric,
  p_completion_id  uuid DEFAULT NULL
)
RETURNS TABLE (valid boolean, message text)
LANGUAGE plpgsql AS $$
DECLARE
  v_po        RECORD;
  v_line      RECORD;
  v_comp      RECORD;
  v_po_face   numeric;
  v_remaining numeric;
  v_line_rem  numeric;
BEGIN
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Contractor PO not found'; RETURN;
  END IF;
  IF v_po.status IN ('FROZEN','CANCELLED','CLOSED') THEN
    RETURN QUERY SELECT false, 'Contractor PO is ' || v_po.status || ' — no further invoicing'; RETURN;
  END IF;

  v_po_face   := COALESCE(v_po.total_amount, 0);
  v_remaining := v_po_face - COALESCE(v_po.invoiced_value, 0);
  IF p_invoice_amount > v_remaining THEN
    RETURN QUERY SELECT false,
      'Invoice SAR ' || p_invoice_amount || ' exceeds PO remaining SAR ' || v_remaining; RETURN;
  END IF;

  IF v_po.sign_off_required THEN
    IF p_completion_id IS NULL THEN
      RETURN QUERY SELECT false, 'Sign-off required — no site completion linked'; RETURN;
    END IF;
    SELECT * INTO v_comp FROM site_completions WHERE id = p_completion_id;
    IF NOT FOUND OR NOT v_comp.field_signed_off THEN
      RETURN QUERY SELECT false, 'Contractor sign-off not recorded'; RETURN;
    END IF;
    IF v_comp.status NOT IN ('READY_TO_INVOICE','SIGNED_OFF') THEN
      RETURN QUERY SELECT false, 'Completion not confirmed by PM or Dept Head'; RETURN;
    END IF;
    IF v_comp.invoice_id IS NOT NULL THEN
      RETURN QUERY SELECT false, 'This completion is already invoiced'; RETURN;
    END IF;
  END IF;

  IF p_line_item_id IS NOT NULL THEN
    SELECT * INTO v_line FROM po_line_items WHERE id = p_line_item_id AND po_id = p_po_id;
    IF NOT FOUND THEN
      RETURN QUERY SELECT false, 'Line item does not belong to this PO'; RETURN;
    END IF;
    IF v_line.status IN ('COMPLETED','LOCKED') THEN
      RETURN QUERY SELECT false, 'Line item is ' || v_line.status; RETURN;
    END IF;
    v_line_rem := v_line.value - COALESCE(v_line.invoiced_amount, 0);
    IF p_invoice_amount > v_line_rem THEN
      RETURN QUERY SELECT false,
        'Invoice SAR ' || p_invoice_amount || ' exceeds line item remaining SAR ' || v_line_rem; RETURN;
    END IF;
    IF NOT v_line.allow_partial AND NOT v_po.allow_partial_invoice AND p_invoice_amount < v_line_rem THEN
      RETURN QUERY SELECT false,
        'Partial invoicing not permitted — full amount SAR ' || v_line_rem || ' required'; RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT true, 'Valid — all checks passed';
END;
$$;

-- ── Fix v_ready_to_invoice (uses total_amount now) ─────────────
DROP VIEW IF EXISTS v_ready_to_invoice;

CREATE VIEW v_ready_to_invoice AS
SELECT
  sc.id                                       AS completion_id,
  sc.completion_date,
  sc.description                              AS work_completed,
  sc.quantity_completed,
  sc.unit,
  sc.field_signed_off,
  sc.sign_off_date,
  sc.sign_off_attachment_url,
  sc.pm_confirmed,
  sc.dept_head_confirmed,
  sc.status                                   AS completion_status,
  sc.notified_at,
  sc.project_id,
  p.project_number,
  p.project_name,
  p.contractor_id,
  c.contractor_name,
  c.contractor_code,
  po.id                                       AS po_id,
  po.po_number,
  po.revision_number,
  po.is_carry_forward                         AS po_is_cf,
  po.po_type,
  po.allow_partial_invoice,
  po.sign_off_required,
  po.po_terms_notes,
  COALESCE(po.total_amount, 0)                AS po_face_value,
  COALESCE(po.invoiced_value, 0)              AS po_invoiced,
  COALESCE(po.total_amount, 0)
    - COALESCE(po.invoiced_value, 0)          AS po_remaining,
  po.status                                   AS po_status,
  li.id                                       AS line_item_id,
  li.sequence_no,
  li.milestone_name,
  li.description                              AS line_description,
  li.value                                    AS line_value,
  li.percentage                               AS line_percentage,
  li.invoiced_amount                          AS line_invoiced,
  li.value - li.invoiced_amount               AS line_remaining,
  li.allow_partial                            AS line_allow_partial,
  li.status                                   AS line_status
FROM site_completions sc
JOIN  projects       p  ON p.id = sc.project_id
LEFT JOIN contractors c  ON c.id = p.contractor_id
JOIN purchase_orders po
  ON  po.project_id = sc.project_id
  AND po.status NOT IN ('FROZEN','CANCELLED','CLOSED')
  AND (COALESCE(po.total_amount, 0) - COALESCE(po.invoiced_value, 0)) > 0
LEFT JOIN po_line_items li
  ON  li.po_id = po.id
  AND li.status NOT IN ('COMPLETED','LOCKED')
  AND (li.value - li.invoiced_amount) > 0
WHERE sc.status    = 'READY_TO_INVOICE'
  AND sc.invoice_id IS NULL
ORDER BY sc.completion_date, po.po_number, li.sequence_no;

-- ── Backfill: freeze any POs already 100% invoiced ─────────────
UPDATE purchase_orders
SET status        = 'FROZEN',
    frozen_at     = NOW(),
    frozen_reason = '100% invoiced — PO closed'
WHERE invoiced_value > 0
  AND invoiced_value >= COALESCE(total_amount, 0)
  AND COALESCE(total_amount, 0) > 0
  AND status NOT IN ('FROZEN','CANCELLED','CLOSED');
