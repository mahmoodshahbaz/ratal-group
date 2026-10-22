-- ─────────────────────────────────────────────────────────────────────────────
-- SBM Option B: is_header column
-- Adds is_header boolean to incoming_po_items and invoice_lines.
-- Header rows represent the top-level SBM "N 1 Activ." section label —
-- they carry a description only (qty=0, price=0, not invoiced).
-- Run once in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE incoming_po_items
  ADD COLUMN IF NOT EXISTS is_header boolean NOT NULL DEFAULT false;

ALTER TABLE invoice_lines
  ADD COLUMN IF NOT EXISTS is_header boolean NOT NULL DEFAULT false;
