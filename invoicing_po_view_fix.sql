-- ================================================================
--  FIX: v_ready_to_invoice — corrected version
--  Run this in Supabase SQL editor (the main patch already applied;
--  only the view failed because purchase_orders has no contractor_id —
--  contractor is on the projects table instead)
-- ================================================================

DROP VIEW IF EXISTS v_ready_to_invoice;

CREATE OR REPLACE VIEW v_ready_to_invoice AS
SELECT
  -- Site completion
  sc.id                         AS completion_id,
  sc.completion_date,
  sc.description                AS work_completed,
  sc.quantity_completed,
  sc.unit,
  sc.field_signed_off,
  sc.sign_off_date,
  sc.sign_off_attachment_url,
  sc.pm_confirmed,
  sc.dept_head_confirmed,
  sc.status                     AS completion_status,
  sc.notified_at,

  -- Project
  sc.project_id,
  p.project_number,
  p.project_name,

  -- Contractor (from project — purchase_orders has no contractor_id)
  p.contractor_id,
  c.contractor_name,
  c.contractor_code,

  -- Eligible Contractor PO (same project, not frozen, has remaining balance)
  po.id                         AS po_id,
  po.po_number,
  po.revision_number,
  po.is_carry_forward           AS po_is_cf,
  po.po_type,
  po.allow_partial_invoice,
  po.sign_off_required,
  po.po_terms_notes,
  COALESCE(po.po_value, po.amount, po.total_amount, po.contract_value, 0)
                                AS po_face_value,
  po.invoiced_value             AS po_invoiced,
  COALESCE(po.po_value, po.amount, po.total_amount, po.contract_value, 0)
    - po.invoiced_value         AS po_remaining,
  po.status                     AS po_status,

  -- Line item (NULL if PO has no line items — LEFT JOIN keeps PO visible)
  li.id                         AS line_item_id,
  li.sequence_no,
  li.milestone_name,
  li.description                AS line_description,
  li.value                      AS line_value,
  li.percentage                 AS line_percentage,
  li.invoiced_amount            AS line_invoiced,
  li.value - li.invoiced_amount AS line_remaining,
  li.allow_partial              AS line_allow_partial,
  li.status                     AS line_status

FROM site_completions sc
JOIN  projects        p  ON p.id = sc.project_id
LEFT JOIN contractors c  ON c.id = p.contractor_id

-- purchase_orders joined on project only (no contractor_id on PO table)
JOIN purchase_orders  po
  ON  po.project_id = sc.project_id
  AND po.status NOT IN ('FROZEN','CANCELLED','CLOSED')
  AND (
    COALESCE(po.po_value, po.amount, po.total_amount, po.contract_value, 0)
    - po.invoiced_value
  ) > 0

LEFT JOIN po_line_items li
  ON  li.po_id = po.id
  AND li.status NOT IN ('COMPLETED','LOCKED')
  AND (li.value - li.invoiced_amount) > 0

WHERE sc.status    = 'READY_TO_INVOICE'
  AND sc.invoice_id IS NULL

ORDER BY
  sc.completion_date,
  po.po_number,
  li.sequence_no;
