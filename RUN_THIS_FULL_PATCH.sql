-- ================================================================
--  FULL PATCH — run this entire file in Supabase SQL editor
--  Creates: po_line_items, site_completions, all triggers,
--           validate_invoice(), and v_ready_to_invoice view
-- ================================================================

-- ── 1. ENHANCE purchase_orders ─────────────────────────────────
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS po_type               text NOT NULL DEFAULT 'MILESTONE'
    CHECK (po_type IN ('MILESTONE','LUMP_SUM','RATE_BASED','UNIT_PRICE')),
  ADD COLUMN IF NOT EXISTS allow_partial_invoice  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS po_terms_notes         text,
  ADD COLUMN IF NOT EXISTS sign_off_required      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoiced_value         numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frozen_at              timestamptz,
  ADD COLUMN IF NOT EXISTS frozen_reason          text;

-- ── 2. po_line_items table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS po_line_items (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id        uuid    REFERENCES entities(id),
  po_id            uuid    NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  sequence_no      smallint NOT NULL DEFAULT 1,
  milestone_name   text    NOT NULL,
  description      text,
  value            numeric(14,2) NOT NULL DEFAULT 0,
  percentage       numeric(5,2),
  invoiced_amount  numeric(14,2) NOT NULL DEFAULT 0,
  allow_partial    boolean NOT NULL DEFAULT false,
  status           text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','PARTIAL','COMPLETED','LOCKED')),
  notes            text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (po_id, sequence_no)
);

ALTER TABLE po_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "po_line_items_all" ON po_line_items;
CREATE POLICY "po_line_items_all" ON po_line_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 3. site_completions table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS site_completions (
  id                        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                 uuid    REFERENCES entities(id),
  project_id                uuid    NOT NULL REFERENCES projects(id),
  contractor_id             uuid    REFERENCES contractors(id),
  site_id                   uuid,
  completion_date           date    NOT NULL DEFAULT current_date,
  description               text    NOT NULL,
  quantity_completed        numeric(10,2),
  unit                      text,
  field_signed_off          boolean NOT NULL DEFAULT false,
  sign_off_date             date,
  sign_off_attachment_url   text,
  sign_off_notes            text,
  field_recorded_by         uuid    REFERENCES employees(id),
  pm_confirmed              boolean NOT NULL DEFAULT false,
  pm_confirmed_by           uuid    REFERENCES employees(id),
  pm_confirmed_at           timestamptz,
  pm_notes                  text,
  dept_head_confirmed       boolean NOT NULL DEFAULT false,
  dept_head_confirmed_by    uuid    REFERENCES employees(id),
  dept_head_confirmed_at    timestamptz,
  dept_head_notes           text,
  status                    text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','SIGNED_OFF','READY_TO_INVOICE','INVOICED','REJECTED')),
  invoice_id                uuid,
  invoiced_at               timestamptz,
  notified_at               timestamptz,
  notification_count        smallint DEFAULT 0,
  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

ALTER TABLE site_completions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "site_completions_all" ON site_completions;
CREATE POLICY "site_completions_all" ON site_completions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── 4. ENHANCE invoices ────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS po_id                 uuid REFERENCES purchase_orders(id),
  ADD COLUMN IF NOT EXISTS po_line_item_id       uuid REFERENCES po_line_items(id),
  ADD COLUMN IF NOT EXISTS site_completion_id    uuid REFERENCES site_completions(id),
  ADD COLUMN IF NOT EXISTS invoice_type          text NOT NULL DEFAULT 'STANDARD'
    CHECK (invoice_type IN ('MILESTONE','PARTIAL','FINAL','ADVANCE','STANDARD')),
  ADD COLUMN IF NOT EXISTS dept_head_approval    text NOT NULL DEFAULT 'PENDING'
    CHECK (dept_head_approval IN ('PENDING','APPROVED','REJECTED','NA')),
  ADD COLUMN IF NOT EXISTS dept_head_approved_by uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS dept_head_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS dept_head_inv_notes   text,
  ADD COLUMN IF NOT EXISTS pm_approval           text NOT NULL DEFAULT 'PENDING'
    CHECK (pm_approval IN ('PENDING','APPROVED','REJECTED','NA')),
  ADD COLUMN IF NOT EXISTS pm_approved_by        uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS pm_approved_at        timestamptz,
  ADD COLUMN IF NOT EXISTS pm_inv_notes          text,
  ADD COLUMN IF NOT EXISTS accounts_approval     text NOT NULL DEFAULT 'PENDING'
    CHECK (accounts_approval IN ('PENDING','APPROVED','REJECTED')),
  ADD COLUMN IF NOT EXISTS accounts_approved_by  uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS accounts_approved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS accounts_inv_notes    text;

-- ── 5. TRIGGER: site_completion status ────────────────────────
CREATE OR REPLACE FUNCTION fn_site_completion_status()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN
    NEW.status := 'INVOICED';
  ELSIF NEW.pm_confirmed = true OR NEW.dept_head_confirmed = true THEN
    NEW.status := 'READY_TO_INVOICE';
  ELSIF NEW.field_signed_off = true THEN
    NEW.status := 'SIGNED_OFF';
  ELSE
    NEW.status := 'PENDING';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_site_completion_status ON site_completions;
CREATE TRIGGER trg_site_completion_status
  BEFORE INSERT OR UPDATE ON site_completions
  FOR EACH ROW EXECUTE FUNCTION fn_site_completion_status();

-- ── 6. HELPER: recalculate po_line_item balance ───────────────
CREATE OR REPLACE FUNCTION fn_update_line_item_totals(p_line_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_invoiced numeric;
  v_value    numeric;
BEGIN
  SELECT COALESCE(SUM(i.total_amount), 0), li.value
  INTO v_invoiced, v_value
  FROM po_line_items li
  LEFT JOIN invoices i ON i.po_line_item_id = li.id
    AND i.status NOT IN ('CANCELLED','REJECTED','DRAFT')
  WHERE li.id = p_line_id
  GROUP BY li.value;

  UPDATE po_line_items
  SET invoiced_amount = COALESCE(v_invoiced, 0),
      status = CASE
        WHEN COALESCE(v_invoiced, 0) = 0           THEN 'OPEN'
        WHEN COALESCE(v_invoiced, 0) >= v_value    THEN 'COMPLETED'
        ELSE 'PARTIAL'
      END,
      updated_at = NOW()
  WHERE id = p_line_id;
END;
$$;

CREATE OR REPLACE FUNCTION fn_sync_po_line_item()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_new_line uuid;
  v_old_line uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old_line := OLD.po_line_item_id;
  ELSE
    v_new_line := NEW.po_line_item_id;
    IF TG_OP = 'UPDATE' AND OLD.po_line_item_id IS DISTINCT FROM NEW.po_line_item_id THEN
      v_old_line := OLD.po_line_item_id;
    END IF;
  END IF;
  IF v_old_line IS NOT NULL THEN PERFORM fn_update_line_item_totals(v_old_line); END IF;
  IF v_new_line IS NOT NULL THEN PERFORM fn_update_line_item_totals(v_new_line); END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_po_line_item ON invoices;
CREATE TRIGGER trg_sync_po_line_item
  AFTER INSERT OR UPDATE OF total_amount, po_line_item_id, status
  OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION fn_sync_po_line_item();

-- ── 7. HELPER: recalculate PO invoiced_value + freeze ─────────
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

  SELECT COALESCE(po_value, amount, total_amount, contract_value, 0)
  INTO v_face
  FROM purchase_orders WHERE id = p_po_id;

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

CREATE OR REPLACE FUNCTION fn_sync_po_invoiced()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_new_po uuid;
  v_old_po uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old_po := OLD.po_id;
  ELSE
    v_new_po := NEW.po_id;
    IF TG_OP = 'UPDATE' AND OLD.po_id IS DISTINCT FROM NEW.po_id THEN
      v_old_po := OLD.po_id;
    END IF;
  END IF;
  IF v_old_po IS NOT NULL THEN PERFORM fn_update_po_totals(v_old_po); END IF;
  IF v_new_po IS NOT NULL THEN PERFORM fn_update_po_totals(v_new_po); END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_po_invoiced ON invoices;
CREATE TRIGGER trg_sync_po_invoiced
  AFTER INSERT OR UPDATE OF total_amount, po_id, status
  OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION fn_sync_po_invoiced();

-- ── 8. updated_at triggers ─────────────────────────────────────
DROP TRIGGER IF EXISTS trg_po_line_items_upd ON po_line_items;
CREATE TRIGGER trg_po_line_items_upd
  BEFORE UPDATE ON po_line_items
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_site_completions_upd ON site_completions;
CREATE TRIGGER trg_site_completions_upd
  BEFORE UPDATE ON site_completions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ── 9. VALIDATE INVOICE FUNCTION ──────────────────────────────
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

  v_po_face   := COALESCE(v_po.po_value, v_po.amount, v_po.total_amount, v_po.contract_value, 0);
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

-- ── 10. READY-TO-INVOICE VIEW ──────────────────────────────────
DROP VIEW IF EXISTS v_ready_to_invoice;

CREATE VIEW v_ready_to_invoice AS
SELECT
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
  sc.project_id,
  p.project_number,
  p.project_name,
  p.contractor_id,
  c.contractor_name,
  c.contractor_code,
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
JOIN  projects       p  ON p.id = sc.project_id
LEFT JOIN contractors c  ON c.id = p.contractor_id
JOIN purchase_orders po
  ON  po.project_id = sc.project_id
  AND po.status NOT IN ('FROZEN','CANCELLED','CLOSED')
  AND (COALESCE(po.po_value, po.amount, po.total_amount, po.contract_value, 0) - po.invoiced_value) > 0
LEFT JOIN po_line_items li
  ON  li.po_id = po.id
  AND li.status NOT IN ('COMPLETED','LOCKED')
  AND (li.value - li.invoiced_amount) > 0
WHERE sc.status    = 'READY_TO_INVOICE'
  AND sc.invoice_id IS NULL
ORDER BY sc.completion_date, po.po_number, li.sequence_no;
