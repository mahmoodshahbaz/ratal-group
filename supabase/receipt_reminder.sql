-- ═══════════════════════════════════════════════════════════════════════
-- RECEIPT REMINDER SYSTEM
-- Tracks whether a payment line has a receipt attached.
-- Receipts are collected AFTER payment (especially for suppliers/subcons),
-- so this is a reminder system, NOT a blocking validation.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Add has_receipt flag to field_payment_lines ───────────────────────
ALTER TABLE field_payment_lines
  ADD COLUMN IF NOT EXISTS has_receipt       BOOLEAN  DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS receipt_photo_url TEXT     DEFAULT NULL;
  -- has_receipt: set to TRUE at submission time if receipt was attached,
  --              or later when DH marks it as "received" in the reminder panel.
  -- receipt_photo_url: future use — Drive URL once post-payment upload is built.

-- ── 2. Backfill existing rows that stored receipt info in notes ──────────
-- Lines with "Receipt:..." in notes already had a receipt at submission time.
UPDATE field_payment_lines
SET has_receipt = TRUE
WHERE notes IS NOT NULL
  AND notes LIKE '%Receipt:%'
  AND has_receipt = FALSE;

-- ── 3. RLS — allow anon to update has_receipt (DH marks receipt received) ─
-- The DH uses the anon key via QR form access.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'field_payment_lines'
      AND policyname = 'anon mark receipt done'
  ) THEN
    EXECUTE '
      CREATE POLICY "anon mark receipt done"
        ON field_payment_lines
        FOR UPDATE TO anon
        USING  (has_receipt = FALSE)
        WITH CHECK (has_receipt = TRUE)
    ';
  END IF;
END $$;

-- Extend the anon UPDATE grant to include the new columns
GRANT UPDATE (has_receipt, receipt_photo_url) ON TABLE field_payment_lines TO anon;

-- ── 4. Index for fast pending-receipt queries ─────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fpl_pending_receipt
  ON field_payment_lines (accountable_party_type, has_receipt)
  WHERE has_receipt = FALSE;

NOTIFY pgrst, 'reload schema';
