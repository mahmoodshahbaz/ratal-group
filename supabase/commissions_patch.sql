-- ═══════════════════════════════════════════════════════════════════
-- Commissions Patch — Ratal Group
-- Creates:
--   commission_rates  — rate cards (airline / type / agent based)
--   commissions       — actual commission records (earned + paid)
-- Run once in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 0. Idempotent updated_at trigger ─────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── 1. commission_rates ───────────────────────────────────────────
-- Rate cards that drive auto-calculation when a commission is logged
CREATE TABLE IF NOT EXISTS commission_rates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  -- What this rate applies to
  commission_type TEXT NOT NULL DEFAULT 'AIRLINE',
  -- AIRLINE | HOTEL | CAR | INSURANCE | PACKAGE | STAFF | OTHER

  -- Supplier / airline this rate is for (null = applies to all)
  supplier_code   TEXT,   -- e.g. 'SV', 'EK', 'XY' or hotel chain code
  supplier_name   TEXT,

  -- Agent this rate applies to (null = agency-level, not staff)
  agent_id        UUID REFERENCES employees(id) ON DELETE SET NULL,
  agent_name      TEXT,

  -- Rate definition
  rate_type       TEXT NOT NULL DEFAULT 'PERCENTAGE',  -- PERCENTAGE | FIXED_PER_TICKET | FIXED_PER_PAX
  rate_value      NUMERIC(10,4) NOT NULL DEFAULT 0,    -- % or fixed SAR amount
  min_commission  NUMERIC(12,2),                        -- floor per transaction
  max_commission  NUMERIC(12,2),                        -- cap per transaction
  currency        TEXT NOT NULL DEFAULT 'SAR',

  -- Validity
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to    DATE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,

  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE commission_rates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='commission_rates' AND policyname='entity_scope'
  ) THEN
    CREATE POLICY entity_scope ON commission_rates
      USING (entity_id IN (SELECT entity_id FROM user_profiles WHERE id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cr_entity      ON commission_rates(entity_id, is_active);
CREATE INDEX IF NOT EXISTS idx_cr_type        ON commission_rates(entity_id, commission_type, supplier_code);
CREATE INDEX IF NOT EXISTS idx_cr_agent       ON commission_rates(entity_id, agent_id);

DROP TRIGGER IF EXISTS commission_rates_updated_at ON commission_rates;
CREATE TRIGGER commission_rates_updated_at
  BEFORE UPDATE ON commission_rates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2. commissions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  -- Direction
  direction       TEXT NOT NULL DEFAULT 'RECEIVED',
  -- RECEIVED = earned from supplier (airline, hotel, etc.)
  -- PAID     = owed to staff agent or sub-agent

  -- Type
  commission_type TEXT NOT NULL DEFAULT 'AIRLINE',
  -- AIRLINE | HOTEL | CAR | INSURANCE | PACKAGE | STAFF | REFERRAL | OTHER

  -- Period (for BSP-style monthly settlement)
  period_year     INTEGER NOT NULL,
  period_month    INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),

  -- Booking / ticket link
  booking_ref     TEXT,    -- from booking_register or trip_records
  ticket_number   TEXT,
  travel_date     DATE,
  pax_name        TEXT,
  route           TEXT,    -- e.g. 'RUH-DXB'
  pax_count       INTEGER DEFAULT 1,

  -- Supplier / airline
  supplier_code   TEXT,
  supplier_name   TEXT,
  bsp_file_ref    TEXT,    -- BSP debit/credit memo reference

  -- Staff agent (only for PAID direction or STAFF type)
  agent_id        UUID REFERENCES employees(id) ON DELETE SET NULL,
  agent_name      TEXT,
  department      TEXT,

  -- Amounts
  booking_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,   -- ticket/booking value (gross)
  rate_id         UUID REFERENCES commission_rates(id) ON DELETE SET NULL,
  commission_rate NUMERIC(10,4) DEFAULT 0,             -- % applied
  commission_amount NUMERIC(14,2) NOT NULL DEFAULT 0,  -- earned / payable SAR
  currency        TEXT NOT NULL DEFAULT 'SAR',
  exchange_rate   NUMERIC(14,6) DEFAULT 1,
  commission_sar  NUMERIC(14,2),                        -- SAR equivalent (auto-set)

  -- Status workflow
  status          TEXT NOT NULL DEFAULT 'PENDING',
  -- PENDING → CONFIRMED → RECEIVED / PAID → REVERSED | WRITTEN_OFF

  -- Settlement
  settlement_date DATE,
  settlement_ref  TEXT,
  payment_method  TEXT,   -- BANK | BSP | CASH | OFFSET

  -- GL
  gl_posted       BOOLEAN DEFAULT FALSE,
  gl_entry_ref    TEXT,   -- voucher_number from ledger_entries
  gl_account_income TEXT,  -- income account code (auto or manual)
  gl_account_bank  TEXT,   -- bank/BSP settlement account code

  -- Reversal
  is_reversed     BOOLEAN DEFAULT FALSE,
  reversed_by_id  UUID,    -- references the reversal commission row
  reversal_reason TEXT,

  notes           TEXT,
  reference       TEXT,

  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='commissions' AND policyname='entity_scope'
  ) THEN
    CREATE POLICY entity_scope ON commissions
      USING (entity_id IN (SELECT entity_id FROM user_profiles WHERE id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_com_entity       ON commissions(entity_id);
CREATE INDEX IF NOT EXISTS idx_com_period       ON commissions(entity_id, period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_com_status       ON commissions(entity_id, status, direction);
CREATE INDEX IF NOT EXISTS idx_com_type         ON commissions(entity_id, commission_type, direction);
CREATE INDEX IF NOT EXISTS idx_com_agent        ON commissions(entity_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_com_supplier     ON commissions(entity_id, supplier_code);
CREATE INDEX IF NOT EXISTS idx_com_booking      ON commissions(entity_id, booking_ref);
CREATE INDEX IF NOT EXISTS idx_com_ticket       ON commissions(entity_id, ticket_number);

DROP TRIGGER IF EXISTS commissions_updated_at ON commissions;
CREATE TRIGGER commissions_updated_at
  BEFORE UPDATE ON commissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Done ✓
SELECT 'Commissions patch applied successfully' AS result;
