-- ═══════════════════════════════════════════════════════════════════════════
-- DH ACKNOWLEDGMENT — FULL PATCH  (Task #115 / G6+N4)
-- Run this ONCE in Supabase SQL Editor (all statements use IF NOT EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- What this patch does:
--   1. Adds all DH-ack columns to money_requests (safe ADD IF NOT EXISTS)
--   2. Trigger: status → FUNDS_SENT  → auto-sets funds_sent_at + dh_ack_status=PENDING
--   3. Trigger: dh_ack_status → CONFIRMED → syncs dh_acked_at (admin view)
--   4. RLS policies for field (anon) UPDATE on ack columns
--   5. Grant anon UPDATE on the new columns
--   6. pg_cron registration SQL (commented — run manually after deploy)
--
-- Deploy the edge function first:
--   npx supabase functions deploy dh-escalate
--
-- Then run this file in Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. ADD COLUMNS ───────────────────────────────────────────────────────────

ALTER TABLE money_requests
  -- Mobile MR reference number (from FormMoneyRequest)
  ADD COLUMN IF NOT EXISTS mr_number       TEXT,

  -- Generic party fields (edge function uses these for display)
  ADD COLUMN IF NOT EXISTS party_id        UUID,
  ADD COLUMN IF NOT EXISTS party_name      TEXT,
  ADD COLUMN IF NOT EXISTS title           TEXT,

  -- Department FK (for DH lookup in escalation)
  ADD COLUMN IF NOT EXISTS department_id   UUID REFERENCES departments(id) ON DELETE SET NULL,

  -- Disbursement clock (admin sets when marking FUNDS_SENT)
  ADD COLUMN IF NOT EXISTS funds_sent_at   TIMESTAMPTZ,

  -- Field DH gate columns (anon-writable via field app)
  ADD COLUMN IF NOT EXISTS dh_ack_status   TEXT,
  -- NULL = not disbursed yet | 'PENDING' = awaiting field DH ack | 'CONFIRMED' = field DH confirmed
  ADD COLUMN IF NOT EXISTS dh_ack_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dh_ack_by       UUID REFERENCES employees(id) ON DELETE SET NULL,

  -- Admin-side acknowledgment (desktop MoneyRequests.jsx)
  ADD COLUMN IF NOT EXISTS dh_acked_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dh_acked_by     TEXT,

  -- Escalation block flag (set by dh-escalate edge function at 30 days)
  ADD COLUMN IF NOT EXISTS dh_blocked      BOOLEAN DEFAULT FALSE;

-- ── 2. TRIGGER: FUNDS_SENT → start the clock ────────────────────────────────

CREATE OR REPLACE FUNCTION trg_mr_funds_sent()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- When transitioning INTO FUNDS_SENT for the first time:
  --   • Lock in funds_sent_at (don't overwrite if already set)
  --   • Set dh_ack_status = PENDING so the field gate activates
  IF NEW.status = 'FUNDS_SENT' AND (OLD.status IS DISTINCT FROM 'FUNDS_SENT') THEN
    NEW.funds_sent_at := COALESCE(NEW.funds_sent_at, now());
    NEW.dh_ack_status := COALESCE(NEW.dh_ack_status, 'PENDING');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_mr_funds_sent ON money_requests;
CREATE TRIGGER tr_mr_funds_sent
  BEFORE UPDATE ON money_requests
  FOR EACH ROW
  EXECUTE FUNCTION trg_mr_funds_sent();

-- ── 3. TRIGGER: field DH confirms → sync dh_acked_at ───────────────────────

CREATE OR REPLACE FUNCTION trg_mr_ack_sync()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- When field DH changes dh_ack_status to CONFIRMED:
  --   • Set dh_acked_at so the admin page and edge function both see it
  IF NEW.dh_ack_status = 'CONFIRMED' AND
     (OLD.dh_ack_status IS DISTINCT FROM 'CONFIRMED') THEN
    NEW.dh_acked_at := COALESCE(NEW.dh_acked_at, NEW.dh_ack_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_mr_ack_sync ON money_requests;
CREATE TRIGGER tr_mr_ack_sync
  BEFORE UPDATE ON money_requests
  FOR EACH ROW
  EXECUTE FUNCTION trg_mr_ack_sync();

-- ── 4. RLS — anon can UPDATE the ack columns (field DH gate) ────────────────

DO $$ BEGIN
  -- Allow anon to change dh_ack_status from PENDING → CONFIRMED
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

-- ── 5. GRANT: anon can write the ack columns ─────────────────────────────────

GRANT UPDATE (dh_ack_status, dh_ack_at, dh_ack_by) ON TABLE money_requests TO anon;

-- Also ensure SELECT on money_requests for anon (gate read)
-- (The 'anon read money_requests' policy from field_payment_anon_access.sql
--  already covers this — just verify it's deployed.)

-- ── 6. RELOAD SCHEMA ─────────────────────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

-- ── 7. REGISTER CRON JOB (run after edge function is deployed) ───────────────
--
-- Open Supabase Dashboard → Database → Extensions → enable pg_cron
-- Then run this in SQL Editor:
--
-- SELECT cron.schedule(
--   'dh-escalate-daily',
--   '0 6 * * *',   -- 09:00 AST = 06:00 UTC — runs daily
--   $$
--     SELECT net.http_post(
--       url     => 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/dh-escalate',
--       headers => '{"Authorization":"Bearer <YOUR_SERVICE_ROLE_KEY>"}'::jsonb,
--       body    => '{}'::jsonb
--     ) AS request_id;
--   $$
-- );
--
-- To verify:  SELECT * FROM cron.job WHERE jobname = 'dh-escalate-daily';
-- To remove:  SELECT cron.unschedule('dh-escalate-daily');

-- ── 8. VERIFY (run separately to confirm patch succeeded) ────────────────────
--
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_name = 'money_requests'
--   AND column_name IN (
--     'funds_sent_at','dh_ack_status','dh_ack_at','dh_ack_by',
--     'dh_acked_at','dh_acked_by','dh_blocked','department_id',
--     'mr_number','party_name','party_id','title'
--   )
-- ORDER BY column_name;
