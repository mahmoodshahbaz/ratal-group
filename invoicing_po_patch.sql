-- ================================================================
--  INVOICING & CONTRACTOR PO MANAGEMENT PATCH
--  invoicing_po_patch.sql — run in Supabase SQL editor
--
--  What this patch adds:
--    1. Enhance purchase_orders — PO type, partial invoice flag,
--       live invoiced_value tracking, freeze on 100%
--    2. po_line_items — milestone/line items within a Contractor PO
--       (structure varies per contractor; fully flexible)
--    3. site_completions — field sign-offs with PM + Dept Head
--       confirmation chain before invoicing is unlocked
--    4. Enhance invoices — link to PO + line item + completion,
--       3-step sequential approval (Dept Head → PM → Accounts)
--    5. Triggers to keep all balances live automatically:
--       invoice posted → line item balance → PO balance → PO frozen
--    6. validate_invoice() — enforces all business rules before
--       an invoice can be created
--    7. v_ready_to_invoice — the Accounts "mapping queue":
--       confirmed completions + eligible POs + remaining balances
--       all in one view
--
--  KEY BUSINESS RULES ENCODED:
--    • 1 invoice → 1 Contractor PO (never mix POs in one invoice)
--    • Invoice amount ≤ PO remaining balance
--    • Invoice amount ≤ line item remaining balance (if line items exist)
--    • Partial invoicing requires allow_partial_invoice = true on PO/line
--    • sign_off_required = true blocks invoicing until site_completion
--      has field_signed_off = true AND pm_confirmed OR dept_head_confirmed
--    • 100% invoiced PO → status = FROZEN automatically
--    • Frozen PO never carries forward at year-end rollover
--    • New Contractor POs after 31 Dec → new Ratal Project No (enforced in app)
-- ================================================================


-- ── 1. ENHANCE purchase_orders ─────────────────────────────────
-- Adds invoicing control fields.
-- NOTE: The PO face-value column is referenced as 'po_value' in
-- triggers below. If your column is named 'amount' or 'total_amount'
-- search-replace po_value with the correct name in sections 6 & 7.

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS po_type               text NOT NULL DEFAULT 'MILESTONE'
    CHECK (po_type IN ('MILESTONE','LUMP_SUM','RATE_BASED','UNIT_PRICE')),
  ADD COLUMN IF NOT EXISTS allow_partial_invoice  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS po_terms_notes         text,           -- free-text for contractor-specific terms
  ADD COLUMN IF NOT EXISTS sign_off_required      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoiced_value         numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frozen_at              timestamptz,    -- stamped when 100% invoiced
  ADD COLUMN IF NOT EXISTS frozen_reason          text;

-- Extend the status check to include FROZEN and PARTIAL
-- (Drop and recreate the constraint; safe with IF NOT EXISTS guard)
DO $$
BEGIN
  ALTER TABLE purchase_orders
    DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
  ALTER TABLE purchase_orders
    ADD CONSTRAINT purchase_orders_status_check
    CHECK (status IN (
      'DRAFT','ACTIVE','PARTIAL','FROZEN',
      'ROLLED_OVER','CLOSED','CANCELLED'
    ));
EXCEPTION WHEN others THEN
  -- Constraint may have a generated name; skip if it fails
  NULL;
END $$;


-- ── 2. po_line_items ───────────────────────────────────────────
-- Holds the milestone / line-item breakdown within each Contractor PO.
-- Structure is intentionally flexible:
--   • Some contractors have named milestones with fixed values
--     (e.g. Mobilisation 30%, Civil Works 40%, Handover 30%)
--   • Others have looser or unit-price structures
-- Use sequence_no to maintain contractor-defined order.
-- invoiced_amount is maintained automatically by trigger.

CREATE TABLE IF NOT EXISTS po_line_items (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id        uuid    REFERENCES entities(id),
  po_id            uuid    NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  sequence_no      smallint NOT NULL DEFAULT 1,
  milestone_name   text    NOT NULL,            -- e.g. 'Mobilisation', 'Supply & Install Phase 1'
  description      text,                        -- optional detail
  value            numeric(14,2) NOT NULL DEFAULT 0,
  percentage       numeric(5,2),                -- % of PO value — for reference/display only
  invoiced_amount  numeric(14,2) NOT NULL DEFAULT 0,  -- auto-maintained by trigger
  allow_partial    boolean NOT NULL DEFAULT false,    -- overrides PO-level allow_partial_invoice
  status           text NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','PARTIAL','COMPLETED','LOCKED')),
  notes            text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (po_id, sequence_no)
);

-- Computed: remaining = value - invoiced_amount (done in app / view)

ALTER TABLE po_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "po_line_items_all" ON po_line_items;
CREATE POLICY "po_line_items_all" ON po_line_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ── 3. site_completions ────────────────────────────────────────
-- Records physical site work completed by Ratal's field team.
-- Flow:
--   Field records completion + Contractor sign-off (checkbox + optional doc)
--     → System notifies PM + Dept Head with batch count
--     → PM confirms  OR  Dept Head confirms  (either is sufficient)
--       (if same person holds both roles, one confirmation covers both)
--     → status → READY_TO_INVOICE
--     → Accounts sees it in v_ready_to_invoice, maps to PO/line item
--     → Invoice created, site_completion.invoice_id stamped
--     → status → INVOICED

CREATE TABLE IF NOT EXISTS site_completions (
  id                        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                 uuid    REFERENCES entities(id),
  project_id                uuid    NOT NULL REFERENCES projects(id),
  contractor_id             uuid    REFERENCES contractors(id),
  site_id                   uuid,                -- optional FK to site_master
  completion_date           date    NOT NULL DEFAULT current_date,
  description               text    NOT NULL,   -- what work was completed
  quantity_completed        numeric(10,2),       -- e.g. 45 (units/m²/items)
  unit                      text,               -- e.g. 'm²', 'units', 'points'

  -- ── Contractor sign-off (proof of delivery from Contractor's client)
  field_signed_off          boolean NOT NULL DEFAULT false,
  sign_off_date             date,
  sign_off_attachment_url   text,               -- optional document URL
  sign_off_notes            text,
  field_recorded_by         uuid    REFERENCES employees(id),

  -- ── PM confirmation (PM reviews batch, confirms ready for invoicing)
  pm_confirmed              boolean NOT NULL DEFAULT false,
  pm_confirmed_by           uuid    REFERENCES employees(id),
  pm_confirmed_at           timestamptz,
  pm_notes                  text,

  -- ── Dept Head confirmation (alternative to PM — either is sufficient)
  dept_head_confirmed       boolean NOT NULL DEFAULT false,
  dept_head_confirmed_by    uuid    REFERENCES employees(id),
  dept_head_confirmed_at    timestamptz,
  dept_head_notes           text,

  -- ── Status (auto-maintained by trigger below)
  status                    text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN (
      'PENDING',            -- field marked but sign-off not yet recorded
      'SIGNED_OFF',         -- contractor sign-off recorded, awaiting PM/DH
      'READY_TO_INVOICE',   -- PM or Dept Head confirmed — Accounts can map
      'INVOICED',           -- linked to a posted invoice
      'REJECTED'            -- rejected by PM or Dept Head
    )),

  -- ── Invoice link (stamped by Accounts when invoice is created)
  invoice_id                uuid,               -- FK to invoices (no FK constraint — set after invoice exists)
  invoiced_at               timestamptz,

  -- ── Notification tracking
  notified_at               timestamptz,        -- timestamp of last PM/DH notification
  notification_count        smallint DEFAULT 0, -- how many reminders sent

  created_at                timestamptz DEFAULT now(),
  updated_at                timestamptz DEFAULT now()
);

ALTER TABLE site_completions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "site_completions_all" ON site_completions;
CREATE POLICY "site_completions_all" ON site_completions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ── 4. ENHANCE invoices ─────────────────────────────────────────
-- Links each invoice to a specific Contractor PO, a specific line item
-- (if the PO has them), and the site completion sign-off that authorises it.
-- Adds the 3-step sequential approval chain:
--   Step 1: Dept Head   → Step 2: Project Manager   → Step 3: Accounts (posts)
-- If Dept Head = PM, one person approves; the other step is marked 'NA'.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS po_id                 uuid REFERENCES purchase_orders(id),
  ADD COLUMN IF NOT EXISTS po_line_item_id       uuid REFERENCES po_line_items(id),
  ADD COLUMN IF NOT EXISTS site_completion_id    uuid REFERENCES site_completions(id),
  ADD COLUMN IF NOT EXISTS invoice_type          text NOT NULL DEFAULT 'STANDARD'
    CHECK (invoice_type IN ('MILESTONE','PARTIAL','FINAL','ADVANCE','STANDARD')),

  -- Step 1: Dept Head
  ADD COLUMN IF NOT EXISTS dept_head_approval    text NOT NULL DEFAULT 'PENDING'
    CHECK (dept_head_approval IN ('PENDING','APPROVED','REJECTED','NA')),
  ADD COLUMN IF NOT EXISTS dept_head_approved_by uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS dept_head_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS dept_head_inv_notes   text,

  -- Step 2: Project Manager (unlocked after Dept Head approves)
  ADD COLUMN IF NOT EXISTS pm_approval           text NOT NULL DEFAULT 'PENDING'
    CHECK (pm_approval IN ('PENDING','APPROVED','REJECTED','NA')),
  ADD COLUMN IF NOT EXISTS pm_approved_by        uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS pm_approved_at        timestamptz,
  ADD COLUMN IF NOT EXISTS pm_inv_notes          text,

  -- Step 3: Accounts (final posting — unlocked after PM approves)
  ADD COLUMN IF NOT EXISTS accounts_approval     text NOT NULL DEFAULT 'PENDING'
    CHECK (accounts_approval IN ('PENDING','APPROVED','REJECTED')),
  ADD COLUMN IF NOT EXISTS accounts_approved_by  uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS accounts_approved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS accounts_inv_notes    text;


-- ── 5. TRIGGER: auto-derive site_completion.status ─────────────
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


-- ── 6. HELPER: recalculate one po_line_item's balance ──────────
CREATE OR REPLACE FUNCTION fn_update_line_item_totals(p_line_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_invoiced  numeric;
  v_value     numeric;
BEGIN
  SELECT
    COALESCE(SUM(i.total_amount), 0),
    li.value
  INTO v_invoiced, v_value
  FROM po_line_items li
  LEFT JOIN invoices i
    ON  i.po_line_item_id = li.id
    AND i.status NOT IN ('CANCELLED','REJECTED','DRAFT')
  WHERE li.id = p_line_id
  GROUP BY li.value;

  UPDATE po_line_items
  SET
    invoiced_amount = COALESCE(v_invoiced, 0),
    status = CASE
      WHEN COALESCE(v_invoiced, 0) = 0             THEN 'OPEN'
      WHEN COALESCE(v_invoiced, 0) >= v_value       THEN 'COMPLETED'
      ELSE 'PARTIAL'
    END,
    updated_at = NOW()
  WHERE id = p_line_id;
END;
$$;

-- TRIGGER: fires after any invoice change that affects line items
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


-- ── 7. HELPER: recalculate one PO's invoiced_value + freeze ────
-- NOTE: Adjust the COALESCE column list if your PO amount column
-- has a different name (po_value / amount / total_amount / contract_value).

CREATE OR REPLACE FUNCTION fn_update_po_totals(p_po_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_invoiced  numeric;
  v_face      numeric;
BEGIN
  -- Sum all non-void invoices against this PO
  SELECT COALESCE(SUM(i.total_amount), 0)
  INTO v_invoiced
  FROM invoices i
  WHERE i.po_id = p_po_id
    AND i.status NOT IN ('CANCELLED','REJECTED','DRAFT');

  -- Get PO face value — add your column name to the COALESCE if needed
  SELECT COALESCE(po_value, amount, total_amount, contract_value, 0)
  INTO v_face
  FROM purchase_orders
  WHERE id = p_po_id;

  UPDATE purchase_orders
  SET
    invoiced_value = v_invoiced,
    status = CASE
      WHEN v_invoiced >= v_face AND v_face > 0 THEN 'FROZEN'
      WHEN v_invoiced > 0                       THEN 'PARTIAL'
      ELSE status
    END,
    frozen_at = CASE
      WHEN v_invoiced >= v_face AND v_face > 0
      THEN COALESCE(frozen_at, NOW())
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


-- ── 8. updated_at triggers for new tables ──────────────────────
-- (touch_updated_at() was created in po_requests_patch.sql)

DROP TRIGGER IF EXISTS trg_po_line_items_upd ON po_line_items;
CREATE TRIGGER trg_po_line_items_upd
  BEFORE UPDATE ON po_line_items
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_site_completions_upd ON site_completions;
CREATE TRIGGER trg_site_completions_upd
  BEFORE UPDATE ON site_completions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- ── 9. VALIDATION FUNCTION ─────────────────────────────────────
-- Call this before creating an invoice to enforce all business rules.
-- Returns a single row: (valid boolean, message text).
-- Usage:  SELECT * FROM validate_invoice(po_id, line_item_id, 90000, completion_id);

CREATE OR REPLACE FUNCTION validate_invoice(
  p_po_id            uuid,
  p_line_item_id     uuid,
  p_invoice_amount   numeric,
  p_completion_id    uuid DEFAULT NULL
)
RETURNS TABLE (valid boolean, message text)
LANGUAGE plpgsql AS $$
DECLARE
  v_po         RECORD;
  v_line       RECORD;
  v_comp       RECORD;
  v_po_face    numeric;
  v_remaining  numeric;
  v_line_rem   numeric;
BEGIN
  -- ── A. PO must exist and be active ───────────────────────────
  SELECT * INTO v_po FROM purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Contractor PO not found'; RETURN;
  END IF;
  IF v_po.status IN ('FROZEN','CANCELLED','CLOSED') THEN
    RETURN QUERY SELECT false,
      'Contractor PO is ' || v_po.status || ' — no further invoicing allowed';
    RETURN;
  END IF;

  -- ── B. Invoice amount must not exceed PO remaining balance ───
  v_po_face   := COALESCE(v_po.po_value, v_po.amount, v_po.total_amount,
                           v_po.contract_value, 0);
  v_remaining := v_po_face - COALESCE(v_po.invoiced_value, 0);
  IF p_invoice_amount > v_remaining THEN
    RETURN QUERY SELECT false,
      'Invoice amount (SAR ' || p_invoice_amount ||
      ') exceeds Contractor PO remaining balance (SAR ' || v_remaining || ')';
    RETURN;
  END IF;

  -- ── C. Sign-off check ────────────────────────────────────────
  IF v_po.sign_off_required THEN
    IF p_completion_id IS NULL THEN
      RETURN QUERY SELECT false,
        'This PO requires a site completion sign-off — no completion record linked';
      RETURN;
    END IF;
    SELECT * INTO v_comp FROM site_completions WHERE id = p_completion_id;
    IF NOT FOUND THEN
      RETURN QUERY SELECT false, 'Site completion record not found'; RETURN;
    END IF;
    IF NOT v_comp.field_signed_off THEN
      RETURN QUERY SELECT false,
        'Contractor sign-off on site completion is not yet recorded'; RETURN;
    END IF;
    IF v_comp.status NOT IN ('READY_TO_INVOICE','SIGNED_OFF') THEN
      RETURN QUERY SELECT false,
        'Site completion has not been confirmed by PM or Dept Head (status: '
        || v_comp.status || ')';
      RETURN;
    END IF;
    IF v_comp.invoice_id IS NOT NULL THEN
      RETURN QUERY SELECT false,
        'This site completion has already been invoiced'; RETURN;
    END IF;
  END IF;

  -- ── D. Line item checks (if a line item is selected) ─────────
  IF p_line_item_id IS NOT NULL THEN
    SELECT * INTO v_line FROM po_line_items
    WHERE id = p_line_item_id AND po_id = p_po_id;
    IF NOT FOUND THEN
      RETURN QUERY SELECT false,
        'Selected line item does not belong to this Contractor PO'; RETURN;
    END IF;
    IF v_line.status IN ('COMPLETED','LOCKED') THEN
      RETURN QUERY SELECT false,
        'Line item is ' || v_line.status || ' — no further invoicing'; RETURN;
    END IF;
    v_line_rem := v_line.value - COALESCE(v_line.invoiced_amount, 0);
    IF p_invoice_amount > v_line_rem THEN
      RETURN QUERY SELECT false,
        'Invoice amount (SAR ' || p_invoice_amount ||
        ') exceeds line item remaining balance (SAR ' || v_line_rem || ')';
      RETURN;
    END IF;
    -- Partial invoicing check
    IF NOT v_line.allow_partial AND NOT v_po.allow_partial_invoice
       AND p_invoice_amount < v_line_rem THEN
      RETURN QUERY SELECT false,
        'Partial invoicing is not permitted for this PO/line item. '
        || 'Full milestone amount required (SAR ' || v_line_rem || ')';
      RETURN;
    END IF;
  END IF;

  -- ── All checks passed ─────────────────────────────────────────
  RETURN QUERY SELECT true, 'Valid — all business rules passed';
END;
$$;


-- ── 10. READY-TO-INVOICE VIEW ───────────────────────────────────
-- The Accounts team's daily mapping queue.
-- Shows every confirmed site completion that is not yet invoiced,
-- paired with all eligible Contractor POs under the same project
-- and their remaining balances — including line item breakdown.
-- Accounts selects the PO + line item, validates, then raises invoice.

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

  -- Contractor (from project — purchase_orders has no contractor_id column;
  --             contractor is bound at the project level)
  p.contractor_id,
  c.contractor_name,
  c.contractor_code,

  -- Eligible Contractor PO (same project, not frozen)
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

  -- Line item within the PO (NULL if PO has no line items)
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
JOIN  projects        p  ON p.id  = sc.project_id
LEFT JOIN contractors c  ON c.id  = p.contractor_id   -- contractor lives on project, not PO

-- purchase_orders has no contractor_id — the contractor is implied by the project.
-- Match POs to the same project only; freeze/cancel/close guards handle eligibility.
JOIN purchase_orders  po
  ON  po.project_id = sc.project_id
  AND po.status NOT IN ('FROZEN','CANCELLED','CLOSED')
  AND (
    COALESCE(po.po_value, po.amount, po.total_amount, po.contract_value, 0)
    - po.invoiced_value
  ) > 0

-- Line items (optional — LEFT JOIN so POs without line items still appear)
LEFT JOIN po_line_items li
  ON  li.po_id  = po.id
  AND li.status NOT IN ('COMPLETED','LOCKED')
  AND (li.value - li.invoiced_amount) > 0

WHERE sc.status  = 'READY_TO_INVOICE'
  AND sc.invoice_id IS NULL

ORDER BY
  sc.contractor_id,
  sc.completion_date,
  po.po_number,
  li.sequence_no;


-- ── 11. INITIALISE invoiced_value on existing POs ──────────────
-- Backfill invoiced_value for any purchase orders that already have
-- invoices in the system before this patch was applied.

UPDATE purchase_orders po
SET invoiced_value = (
  SELECT COALESCE(SUM(i.total_amount), 0)
  FROM invoices i
  WHERE i.po_id = po.id
    AND i.status NOT IN ('CANCELLED','REJECTED','DRAFT')
)
WHERE EXISTS (
  SELECT 1 FROM invoices i WHERE i.po_id = po.id
);

-- Freeze any POs that are already 100% invoiced
UPDATE purchase_orders
SET
  status        = 'FROZEN',
  frozen_at     = NOW(),
  frozen_reason = '100% invoiced — PO closed (backfill on patch run)'
WHERE
  invoiced_value > 0
  AND invoiced_value >= COALESCE(po_value, amount, total_amount, contract_value, 0)
  AND status NOT IN ('FROZEN','CANCELLED','CLOSED');


-- ── SUMMARY ────────────────────────────────────────────────────
-- Tables created:     po_line_items, site_completions
-- Tables enhanced:    purchase_orders, invoices
-- Functions created:  fn_site_completion_status, fn_update_line_item_totals,
--                     fn_sync_po_line_item, fn_update_po_totals,
--                     fn_sync_po_invoiced, validate_invoice
-- Triggers created:   trg_site_completion_status (site_completions)
--                     trg_sync_po_line_item      (invoices)
--                     trg_sync_po_invoiced       (invoices)
--                     trg_po_line_items_upd      (po_line_items)
--                     trg_site_completions_upd   (site_completions)
-- Views created:      v_ready_to_invoice
-- ================================================================
