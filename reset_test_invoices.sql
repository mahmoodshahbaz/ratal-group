-- ============================================================
--  ACCSYS — Reset All Test Invoices
--  Run this ONE TIME in Supabase SQL Editor.
--  Deletes all invoices and resets PO billing to zero.
-- ============================================================

-- ── Step 1: Remove AR allocations (linked to invoices) ───────
DELETE FROM payment_allocations;

-- ── Step 2: Remove payment receipts ─────────────────────────
DELETE FROM payment_receipts;

-- ── Step 3: Remove invoice line items ────────────────────────
DELETE FROM invoice_lines;

-- ── Step 4: Remove all invoices ──────────────────────────────
DELETE FROM invoices;

-- ── Step 5: Remove invoice journal entries ───────────────────
-- Deletes lines first (FK), then the entries themselves.
-- All invoice JEs use source_type = 'INVOICE' (including credit notes & retention).
DELETE FROM journal_entry_lines
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries
  WHERE source_type IN ('INVOICE', 'INVOICE_REVERSAL')
);
DELETE FROM journal_entries
WHERE source_type IN ('INVOICE', 'INVOICE_REVERSAL');

-- ── Step 6: Reset PO line-item billing ───────────────────────
-- qty_invoiced → 0, line_status → PENDING, milestone done → false
UPDATE incoming_po_items
SET
  qty_invoiced      = 0,
  line_status       = 'PENDING',
  is_milestone_done = false;

-- ── Step 7: Reset PO header billing ──────────────────────────
-- total_invoiced → 0, pct_invoiced → 0, billing_status → PENDING
-- Status: if PO was CLOSED (by full invoicing) → revert to APPROVED
UPDATE incoming_pos
SET
  total_invoiced_ex_vat = 0,
  pct_invoiced          = 0,
  billing_status        = 'PENDING',
  status                = CASE WHEN status = 'CLOSED' THEN 'APPROVED' ELSE status END;

-- ── Done ──────────────────────────────────────────────────────
-- All invoices deleted. POs reset to unbilled.
-- Invoice numbers auto-reset to /0001 on the next new invoice
-- (the sequence is derived from the invoices table, not a separate counter).
SELECT 'Reset complete ✅' AS result;
