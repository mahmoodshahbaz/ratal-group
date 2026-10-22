-- ═══════════════════════════════════════════════════════════════════════
-- FIELD PAYMENT LINE CONFIRMATION
-- Adds acknowledgment columns to field_payment_lines so each recipient
-- can confirm receipt via a unique shareable QR link.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Schema patch ──────────────────────────────────────────────────────
ALTER TABLE field_payment_lines
  ADD COLUMN IF NOT EXISTS ack_status  TEXT          DEFAULT 'PENDING',
  -- PENDING | CONFIRMED
  ADD COLUMN IF NOT EXISTS ack_at      TIMESTAMPTZ;
  -- timestamp when recipient confirmed receipt

-- ── 2. Anon SELECT — needed so the public /forms/payment-confirm page
--       can look up a line by ID without a login session ─────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'field_payment_lines'
      AND policyname = 'anon read field_payment_lines by id'
  ) THEN
    EXECUTE '
      CREATE POLICY "anon read field_payment_lines by id"
        ON field_payment_lines
        FOR SELECT TO anon
        USING (true)
    ';
  END IF;
END $$;

GRANT SELECT ON TABLE field_payment_lines TO anon;

-- ── 3. Anon UPDATE — allow confirmation write-back ───────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'field_payment_lines'
      AND policyname = 'anon confirm field_payment_lines'
  ) THEN
    EXECUTE '
      CREATE POLICY "anon confirm field_payment_lines"
        ON field_payment_lines
        FOR UPDATE TO anon
        USING (ack_status = ''PENDING'')
        WITH CHECK (ack_status = ''CONFIRMED'')
    ';
  END IF;
END $$;

GRANT UPDATE (ack_status, ack_at) ON TABLE field_payment_lines TO anon;

-- ── 4. Anon SELECT on sessions — to show session date + reference ────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'field_payment_sessions'
      AND policyname = 'anon read field_payment_sessions by id'
  ) THEN
    EXECUTE '
      CREATE POLICY "anon read field_payment_sessions by id"
        ON field_payment_sessions
        FOR SELECT TO anon
        USING (true)
    ';
  END IF;
END $$;

GRANT SELECT ON TABLE field_payment_sessions TO anon;

NOTIFY pgrst, 'reload schema';
