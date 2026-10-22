-- ═══════════════════════════════════════════════════════════════════════
-- FIELD PAYMENT SESSIONS & LINES
-- Purpose : Track micro-distribution of Money Request funds in the field
--           DH/custodian uses ATM cards (ANB-77 / ANB-39) to distribute
--           funds to employees, sub-contractors, local suppliers, etc.
--           Proxy transfers (IBAN substitution) are tracked separately.
-- ═══════════════════════════════════════════════════════════════════════

-- ── 1. field_payment_sessions ───────────────────────────────────────────
--   One session = one card-use batch (typically one day, max 25K SAR limit)
--   A single Money Request can have multiple sessions spread over days.
CREATE TABLE IF NOT EXISTS field_payment_sessions (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id          UUID,                          -- from money_request.entity_id
  money_request_id   UUID          REFERENCES money_requests(id) ON DELETE SET NULL,
  request_number     TEXT,                          -- denormalized for display without JOIN
  session_date       DATE          NOT NULL DEFAULT CURRENT_DATE,
  card_used          TEXT          NOT NULL,        -- ANB77_C1/C2/C3 | ANB39_C1/C2
  bank_account       TEXT          NOT NULL,        -- 'ANB-77' | 'ANB-39'
  department_id      UUID,
  department_name    TEXT,
  mr_approved_amount NUMERIC(12,2) DEFAULT 0,       -- snapshot of MR amount at submit time
  session_total      NUMERIC(12,2) DEFAULT 0,       -- sum of lines
  proxy_count        INT           DEFAULT 0,       -- count of proxy transfers in this session
  status             TEXT          NOT NULL DEFAULT 'SUBMITTED',
  -- SUBMITTED → ACKNOWLEDGED → CLOSED
  -- (no DRAFT — field form submits directly; DH can re-open via admin if needed)
  submitted_by_name  TEXT,                          -- free text — anon form
  submitted_at       TIMESTAMPTZ   DEFAULT NOW(),
  acknowledged_by    UUID,                          -- employee id of accounts staff
  acknowledged_at    TIMESTAMPTZ,
  closed_by          UUID,
  closed_at          TIMESTAMPTZ,
  je_posted          BOOLEAN       DEFAULT FALSE,
  je_id              UUID,                          -- link to journal_entries if auto-posted
  notes              TEXT,
  created_at         TIMESTAMPTZ   DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   DEFAULT NOW()
);

-- ── 2. field_payment_lines ──────────────────────────────────────────────
--   One row per micro-transaction within a session.
--   Tracks BOTH the accountable party (who it's FOR) and
--   the transfer agent (who physically received it — proxy).
CREATE TABLE IF NOT EXISTS field_payment_lines (
  id                       UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               UUID          NOT NULL REFERENCES field_payment_sessions(id) ON DELETE CASCADE,
  sort_order               INT           DEFAULT 0,

  -- Transaction classification
  line_type                TEXT          NOT NULL,
  -- TRANSFER         = ATM bank transfer
  -- POS              = point-of-sale card purchase
  -- CASH             = cash withdrawal from ATM
  -- CUSTODIAN_EXPENSE= custodian running cost (petrol, food, etc.)

  purpose                  TEXT,
  -- EMPLOYEE_SALARY / EMPLOYEE_ADVANCE / SUBCON_PAYMENT
  -- LOCAL_PURCHASE  / MATERIAL_PURCHASE / PETTY_CASH / FIELD_RUNNING_COST

  -- Accountable Party — who the money is FOR (drives the journal entry)
  accountable_party_type   TEXT,         -- EMPLOYEE | CONTRACTOR | ONE_TIME
  accountable_party_id     UUID,         -- FK to employees or contractors (nullable)
  accountable_party_name   TEXT NOT NULL,-- always filled: from system or free text

  -- Transfer Agent / Proxy — who PHYSICALLY received the ATM transfer
  -- Only relevant for line_type = 'TRANSFER' when IBAN substitution occurred
  transfer_agent_id        UUID,         -- FK to employees (nullable)
  transfer_agent_name      TEXT,         -- free text fallback or from system
  is_proxy                 BOOLEAN       DEFAULT FALSE,
  -- TRUE when transfer_agent_id / transfer_agent_name ≠ accountable party
  -- Accounts gets alerted: "Sent to [agent] on behalf of [accountable]"

  amount                   NUMERIC(12,2) NOT NULL,
  reference_no             TEXT,         -- ATM slip / POS receipt / transaction ID
  notes                    TEXT,

  -- JE posting fields (filled when Accounts posts)
  je_debit_account         TEXT,         -- GL account code for DR
  je_credit_account        TEXT,         -- GL account code for CR (bank account)

  created_at               TIMESTAMPTZ  DEFAULT NOW()
);

-- ── Indexes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_fps_money_request  ON field_payment_sessions(money_request_id);
CREATE INDEX IF NOT EXISTS idx_fps_entity         ON field_payment_sessions(entity_id);
CREATE INDEX IF NOT EXISTS idx_fps_status         ON field_payment_sessions(status);
CREATE INDEX IF NOT EXISTS idx_fps_date           ON field_payment_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_fps_dept           ON field_payment_sessions(department_id);
CREATE INDEX IF NOT EXISTS idx_fpl_session        ON field_payment_lines(session_id);
CREATE INDEX IF NOT EXISTS idx_fpl_proxy          ON field_payment_lines(is_proxy) WHERE is_proxy = TRUE;
CREATE INDEX IF NOT EXISTS idx_fpl_acct_party     ON field_payment_lines(accountable_party_id);

-- ── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE field_payment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_payment_lines    ENABLE ROW LEVEL SECURITY;

-- Authenticated users (Accounts / Admin) can read all
CREATE POLICY "auth read field_payment_sessions"
  ON field_payment_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read field_payment_lines"
  ON field_payment_lines FOR SELECT TO authenticated USING (true);

-- Authenticated users can update (acknowledge / close / post JE)
CREATE POLICY "auth update field_payment_sessions"
  ON field_payment_sessions FOR UPDATE TO authenticated USING (true);

-- Anon can INSERT sessions and lines (field form — no login)
CREATE POLICY "anon insert field_payment_sessions"
  ON field_payment_sessions FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon insert field_payment_lines"
  ON field_payment_lines FOR INSERT TO anon WITH CHECK (true);

-- ── Helper: updated_at trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_fps_updated_at ON field_payment_sessions;
CREATE TRIGGER trg_fps_updated_at
  BEFORE UPDATE ON field_payment_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

NOTIFY pgrst, 'reload schema';
