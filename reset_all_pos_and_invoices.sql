-- ============================================================
--  ACCSYS — Full Reset: All Incoming POs + All Invoices
--  Run ONE TIME in Supabase SQL Editor.
--
--  This wipes ALL imported POs (SBM, ZTE, Mobiserve, etc.)
--  and ALL invoices/AR so you can re-import POs clean.
--
--  Order matters — FK constraints require children deleted first.
-- ============================================================

-- ── Step 1: AR allocations (FK → payment_receipts + invoices) ──
DELETE FROM payment_allocations;

-- ── Step 2: Payment receipts ─────────────────────────────────
DELETE FROM payment_receipts;

-- ── Step 3: Invoice line items (FK → invoices + po_items) ────
DELETE FROM invoice_lines;

-- ── Step 4: Invoices (FK → incoming_pos) ─────────────────────
DELETE FROM invoices;

-- ── Step 5: Invoice journal entries (JE lines first, then JEs)
DELETE FROM journal_entry_lines
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries
  WHERE source_type IN ('INVOICE', 'INVOICE_REVERSAL')
);

DELETE FROM journal_entries
WHERE source_type IN ('INVOICE', 'INVOICE_REVERSAL');

-- ── Step 6: PO line items (FK → incoming_pos) ────────────────
DELETE FROM incoming_po_items;

-- ── Step 7: PO headers ───────────────────────────────────────
DELETE FROM incoming_pos;

-- ── Done ──────────────────────────────────────────────────────
-- All POs and invoices cleared.
-- Re-import POs fresh via Incoming PO → Import PDF.
SELECT
  'Reset complete ✅' AS result,
  (SELECT COUNT(*) FROM incoming_pos)      AS pos_remaining,
  (SELECT COUNT(*) FROM incoming_po_items) AS po_items_remaining,
  (SELECT COUNT(*) FROM invoices)          AS invoices_remaining;
