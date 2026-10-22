-- ═══════════════════════════════════════════════════════════════════════
-- FIELD PAYMENT SCHEMA V2
-- Changes:
--   • Sessions no longer locked to one MR (card-level sessions)
--   • Lines get dept_code so ANB-39 can serve NISU/CISU/ITSU in one session
--   • New field_payment_mr_allocations: FIFO record of which MR each session consumed
--   • Bank charges tracked at session level + as custodian expense lines
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. field_payment_sessions patches ───────────────────────────────────
ALTER TABLE field_payment_sessions
  ALTER COLUMN money_request_id DROP NOT NULL;   -- no longer required (card-level session)

ALTER TABLE field_payment_sessions
  ADD COLUMN IF NOT EXISTS card_pool_total      NUMERIC(12,2) DEFAULT 0,
  -- snapshot of total available across all dept pools at submit time
  ADD COLUMN IF NOT EXISTS bank_charges_total   NUMERIC(12,2) DEFAULT 0,
  -- sum of CUSTODIAN_EXPENSE BANK_CHARGES lines in this session
  ADD COLUMN IF NOT EXISTS over_distributed     NUMERIC(12,2) DEFAULT 0;
  -- amount distributed beyond available pool (variance for Accounts)

-- ── 2. field_payment_lines patches ──────────────────────────────────────
ALTER TABLE field_payment_lines
  ADD COLUMN IF NOT EXISTS dept_code            TEXT,
  -- TISU | NISU | CISU | ITSU — which dept this line belongs to
  ADD COLUMN IF NOT EXISTS is_bank_charge       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS bank_charge_amount   NUMERIC(10,2) DEFAULT 0;
  -- bank transfer charge incurred specifically for THIS line (not a separate line)

-- ── 3. field_payment_mr_allocations (new) ───────────────────────────────
--   One row per MR consumed by a session (FIFO auto-calculated on submit)
CREATE TABLE IF NOT EXISTS field_payment_mr_allocations (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID          NOT NULL REFERENCES field_payment_sessions(id) ON DELETE CASCADE,
  money_request_id      UUID          REFERENCES money_requests(id) ON DELETE SET NULL,
  request_number        TEXT,                       -- denormalised for display
  dept_code             TEXT,                       -- which dept pool this drew from
  allocated_amount      NUMERIC(12,2) NOT NULL,     -- how much was consumed from this MR
  is_over_distributed   BOOLEAN       DEFAULT FALSE, -- true when beyond MR ATM budget
  created_at            TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fpma_session ON field_payment_mr_allocations(session_id);
CREATE INDEX IF NOT EXISTS idx_fpma_mr      ON field_payment_mr_allocations(money_request_id);
CREATE INDEX IF NOT EXISTS idx_fpma_dept    ON field_payment_mr_allocations(dept_code);

-- ── RLS on new table ─────────────────────────────────────────────────────
ALTER TABLE field_payment_mr_allocations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='field_payment_mr_allocations' AND policyname='auth read field_payment_mr_allocations') THEN
    EXECUTE 'CREATE POLICY "auth read field_payment_mr_allocations" ON field_payment_mr_allocations FOR SELECT TO authenticated USING (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='field_payment_mr_allocations' AND policyname='anon insert field_payment_mr_allocations') THEN
    EXECUTE 'CREATE POLICY "anon insert field_payment_mr_allocations" ON field_payment_mr_allocations FOR INSERT TO anon WITH CHECK (true)';
  END IF;
END $$;

GRANT SELECT           ON TABLE field_payment_mr_allocations TO authenticated;
GRANT INSERT           ON TABLE field_payment_mr_allocations TO anon;
GRANT SELECT, UPDATE   ON TABLE field_payment_sessions       TO authenticated;

NOTIFY pgrst, 'reload schema';
