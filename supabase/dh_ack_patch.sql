-- ════════════════════════════════════════════════════════════════
-- G6 + N4: DH Acknowledgment — Schema Patch
-- Adds tracking columns to money_requests for DH acknowledgment
-- escalation (0-15d reminders, 15-30d warning, 30d+ block).
-- ════════════════════════════════════════════════════════════════

-- Track when funds were actually sent and when DH acknowledged
ALTER TABLE money_requests
  ADD COLUMN IF NOT EXISTS funds_sent_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dh_acked_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dh_acked_by     TEXT,        -- employee name or user email
  ADD COLUMN IF NOT EXISTS dh_blocked      BOOLEAN DEFAULT FALSE;  -- set when party is blocked

-- Backfill funds_sent_at for existing FUNDS_SENT rows (use updated_at as proxy)
UPDATE money_requests
   SET funds_sent_at = updated_at
 WHERE status IN ('FUNDS_SENT','DH_ACKNOWLEDGED','SETTLED','CLOSED')
   AND funds_sent_at IS NULL
   AND updated_at IS NOT NULL;

-- Index for fast escalation queries
CREATE INDEX IF NOT EXISTS idx_mr_funds_sent_unacked
  ON money_requests(entity_id, funds_sent_at)
  WHERE status = 'FUNDS_SENT' AND dh_acked_at IS NULL;

COMMENT ON COLUMN money_requests.funds_sent_at IS 'Timestamp when Accounts marked the MR as FUNDS_SENT — starts the DH ack clock';
COMMENT ON COLUMN money_requests.dh_acked_at   IS 'Timestamp when DH (or admin on DH behalf) confirmed receipt of funds';
COMMENT ON COLUMN money_requests.dh_acked_by   IS 'Name/email of who recorded the DH acknowledgment';
COMMENT ON COLUMN money_requests.dh_blocked     IS 'Set to TRUE when DH ack is >30 days overdue — blocks new MRs for this party';
