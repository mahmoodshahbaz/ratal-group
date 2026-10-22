-- ═══════════════════════════════════════════════════════════════════════
-- DH MONEY REQUEST ACKNOWLEDGMENT
-- When Accounts disburses a money request, the DH must acknowledge
-- receipt before they can access any field forms.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. Add DH acknowledgment columns to money_requests ───────────────────
ALTER TABLE money_requests
  ADD COLUMN IF NOT EXISTS dh_ack_status  TEXT          DEFAULT NULL,
  -- NULL = not yet disbursed, 'PENDING' = disbursed, DH hasn't confirmed,
  -- 'CONFIRMED' = DH confirmed receipt
  ADD COLUMN IF NOT EXISTS dh_ack_at      TIMESTAMPTZ,
  -- when DH confirmed
  ADD COLUMN IF NOT EXISTS dh_ack_by      UUID REFERENCES employees(id) ON DELETE SET NULL;
  -- employee who confirmed (should match requested_by)

-- ── 2. When Accounts sets status → DISBURSED, auto-set dh_ack_status ────
-- This trigger ensures every disbursed request gets a PENDING DH ack gate.
CREATE OR REPLACE FUNCTION trg_mr_dh_ack_on_disburse()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- When transitioning to DISBURSED for the first time, set dh_ack_status
  IF NEW.status = 'DISBURSED' AND (OLD.status IS DISTINCT FROM 'DISBURSED') THEN
    IF NEW.dh_ack_status IS NULL THEN
      NEW.dh_ack_status := 'PENDING';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_mr_dh_ack_on_disburse ON money_requests;
CREATE TRIGGER tr_mr_dh_ack_on_disburse
  BEFORE UPDATE ON money_requests
  FOR EACH ROW
  EXECUTE FUNCTION trg_mr_dh_ack_on_disburse();

-- ── 3. RLS — allow anon UPDATE on dh_ack_status columns ─────────────────
-- DH logs in via QR (anon role) and needs to write the acknowledgment.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'money_requests'
      AND policyname = 'anon dh ack money_requests'
  ) THEN
    EXECUTE '
      CREATE POLICY "anon dh ack money_requests"
        ON money_requests
        FOR UPDATE TO anon
        USING  (dh_ack_status = ''PENDING'')
        WITH CHECK (dh_ack_status = ''CONFIRMED'')
    ';
  END IF;
END $$;

GRANT UPDATE (dh_ack_status, dh_ack_at, dh_ack_by) ON TABLE money_requests TO anon;

-- ── 4. Anon SELECT on money_requests (for reading pending ones) ───────────
-- The existing 'anon read money_requests' policy covers this — no change needed.
-- Just verify:
-- SELECT policyname FROM pg_policies WHERE tablename = 'money_requests' AND roles @> '{anon}';

NOTIFY pgrst, 'reload schema';
