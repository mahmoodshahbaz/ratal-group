-- ══════════════════════════════════════════════════════════════════
-- PO REQUEST PATCH — Run in Supabase → SQL Editor
-- Adds supplier_type + site_master_id to po_requests
-- Safe to run multiple times (IF NOT EXISTS guards)
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE po_requests
  ADD COLUMN IF NOT EXISTS supplier_type    TEXT,
  -- SUPPLIER | VENDOR | SUB_CONTRACTOR | LOCAL_SUPPLIER
  ADD COLUMN IF NOT EXISTS site_master_id   UUID REFERENCES site_masters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_po_req_site     ON po_requests(site_master_id);
CREATE INDEX IF NOT EXISTS idx_po_req_sup_type ON po_requests(supplier_type);

-- Ensure vendor_type column exists on contractors with LOCAL_SUPPLIER option
-- (add_vendor_type.sql already added CONTRACTOR|VENDOR|SUPPLIER|SUB_CONTRACTOR)
-- This just extends the comment; no ALTER needed since it's a free-text column.

-- ─── DONE ──────────────────────────────────────────────────────
-- po_requests.supplier_type  — TEXT (SUPPLIER|VENDOR|SUB_CONTRACTOR|LOCAL_SUPPLIER)
-- po_requests.site_master_id — UUID FK → site_masters
-- ───────────────────────────────────────────────────────────────
