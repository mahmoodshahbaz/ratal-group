-- ============================================================
-- PROGRESSIVE INVOICING SCHEMA PATCH
-- Run in Supabase SQL Editor (Table Editor → SQL)
-- Safe to re-run: uses IF NOT EXISTS / DO NOTHING
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. INCOMING_POS  — billing mode, retention, currency, tracking
-- ────────────────────────────────────────────────────────────
ALTER TABLE incoming_pos
  ADD COLUMN IF NOT EXISTS billing_mode         TEXT    DEFAULT 'QTY',
  ADD COLUMN IF NOT EXISTS retention_pct        NUMERIC(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retention_basis      TEXT    DEFAULT 'EX_VAT',   -- EX_VAT | INCL_VAT
  ADD COLUMN IF NOT EXISTS original_currency    TEXT    DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS fx_rate              NUMERIC(10,4) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS payment_terms_days   INT     DEFAULT 30,
  ADD COLUMN IF NOT EXISTS total_invoiced_ex_vat NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_retention_held NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pct_invoiced         NUMERIC(5,2)  DEFAULT 0,    -- for PERCENTAGE mode
  ADD COLUMN IF NOT EXISTS billing_status       TEXT    DEFAULT 'OPEN';     -- OPEN | PARTIALLY_INVOICED | FULLY_INVOICED

-- ────────────────────────────────────────────────────────────
-- 2. INCOMING_PO_ITEMS  — qty tracking per line
-- ────────────────────────────────────────────────────────────
-- NOTE: `total` is already a GENERATED column (qty * unit_price) — do NOT add or update it
ALTER TABLE incoming_po_items
  ADD COLUMN IF NOT EXISTS qty_invoiced         NUMERIC(10,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pct_invoiced         NUMERIC(5,2)  DEFAULT 0,    -- for PERCENTAGE mode
  ADD COLUMN IF NOT EXISTS is_milestone_done    BOOLEAN       DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS line_status          TEXT    DEFAULT 'OPEN';     -- OPEN | PARTIAL | INVOICED

-- ────────────────────────────────────────────────────────────
-- 3. INVOICES  — PO linkage, retention, net payable
-- ────────────────────────────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS incoming_po_id       UUID    REFERENCES incoming_pos(id),
  ADD COLUMN IF NOT EXISTS billing_mode         TEXT,
  ADD COLUMN IF NOT EXISTS retention_pct        NUMERIC(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retention_amount     NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_payable          NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS discount_amount      NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_amount       NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS department_id        UUID,
  ADD COLUMN IF NOT EXISTS project_id           UUID,
  ADD COLUMN IF NOT EXISTS contractor_id        UUID    REFERENCES contractors(id),  -- B2B client (invoices to contractors)
  ADD COLUMN IF NOT EXISTS po_number            TEXT;    -- contractor PO# reference

-- ────────────────────────────────────────────────────────────
-- 4. INVOICE_LINES  — PO line reference
-- ────────────────────────────────────────────────────────────
ALTER TABLE invoice_lines
  ADD COLUMN IF NOT EXISTS po_line_id           UUID    REFERENCES incoming_po_items(id),
  ADD COLUMN IF NOT EXISTS pct_billed           NUMERIC(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_billed           NUMERIC(10,3);

-- ────────────────────────────────────────────────────────────
-- 5. PAYMENT_RECEIPTS  — Accounts Receivable (client payments)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_receipts (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID    NOT NULL,
  receipt_date        DATE    NOT NULL,
  contractor_id       UUID    REFERENCES contractors(id),  -- client who paid
  customer_name       TEXT,
  gross_amount        NUMERIC(15,2) NOT NULL,
  payment_mode        TEXT    DEFAULT 'BANK_TRANSFER',  -- BANK_TRANSFER | CHEQUE | INVOICE_DISCOUNTING | CASH
  bank_reference      TEXT,
  bank_account        TEXT,
  discounting_charge  NUMERIC(15,2) DEFAULT 0,          -- Nokia/Citibank SCF fee
  net_received        NUMERIC(15,2),                    -- gross_amount - discounting_charge
  allocated_amount    NUMERIC(15,2) DEFAULT 0,          -- sum of allocations
  unallocated_amount  NUMERIC(15,2),                    -- gross - allocated
  notes               TEXT,
  status              TEXT    DEFAULT 'POSTED',         -- POSTED | FULLY_ALLOCATED | VOIDED
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 6. PAYMENT_ALLOCATIONS  — which invoices a receipt covers
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_allocations (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id          UUID    NOT NULL REFERENCES payment_receipts(id) ON DELETE CASCADE,
  invoice_id          UUID    NOT NULL REFERENCES invoices(id),
  invoice_number      TEXT,
  amount_allocated    NUMERIC(15,2) NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 7. INDEXES for performance
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_invoices_incoming_po_id   ON invoices(incoming_po_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer_id      ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_entity   ON payment_receipts(entity_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_customer ON payment_receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_rcpt  ON payment_allocations(receipt_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_inv   ON payment_allocations(invoice_id);

-- ────────────────────────────────────────────────────────────
-- 8. RLS — enable and add open policies (adjust for production)
-- ────────────────────────────────────────────────────────────
ALTER TABLE payment_receipts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users (tighten per entity_id in production)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payment_receipts' AND policyname = 'allow_all_auth'
  ) THEN
    CREATE POLICY allow_all_auth ON payment_receipts
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'payment_allocations' AND policyname = 'allow_all_auth'
  ) THEN
    CREATE POLICY allow_all_auth ON payment_allocations
      FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END
$$;

-- ============================================================
-- DONE. Verify with:
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'incoming_pos' ORDER BY ordinal_position;
-- ============================================================
