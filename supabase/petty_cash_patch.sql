-- ═══════════════════════════════════════════════════════════════════
-- Petty Cash Module Patch — Ratal Group
-- Creates:
--   petty_cash_accounts — one float per entity × department
--   petty_cash_entries  — individual cash transactions
-- Run once in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. petty_cash_accounts (float definitions) ────────────────────
-- One row per cash box. Tracks the authorised float ceiling
-- and which GL account the cash sits in.
CREATE TABLE IF NOT EXISTS petty_cash_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  account_name    TEXT NOT NULL,            -- e.g. "Head Office Petty Cash"
  department      TEXT,                     -- owning department
  custodian_name  TEXT,                     -- responsible employee name
  float_limit     NUMERIC(15,2) DEFAULT 500,-- authorised max float (SAR)
  gl_account_code TEXT,                     -- e.g. "1010 Petty Cash"
  is_active       BOOLEAN DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE petty_cash_accounts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='petty_cash_accounts' AND policyname='entity_scope'
  ) THEN
    CREATE POLICY entity_scope ON petty_cash_accounts
      USING (entity_id IN (
        SELECT entity_id FROM user_profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pca_entity ON petty_cash_accounts(entity_id);

-- ── 2. petty_cash_entries (cash transactions) ─────────────────────
CREATE TABLE IF NOT EXISTS petty_cash_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  account_id      UUID NOT NULL REFERENCES petty_cash_accounts(id) ON DELETE CASCADE,

  transaction_date DATE NOT NULL,
  entry_type      TEXT NOT NULL,
  -- OPENING       : initial float balance
  -- OUT           : cash payment (reduces balance)
  -- IN            : cash received / returned (increases balance)
  -- REPLENISHMENT : top-up from bank/main account
  -- ADJUSTMENT    : correction entry

  amount          NUMERIC(15,2) NOT NULL,
  description     TEXT,
  category        TEXT,    -- e.g. Stationery, Transport, Meals, Office
  reference       TEXT,    -- receipt number / vendor name
  approved_by     TEXT,    -- approver name
  voucher_number  TEXT,    -- auto-generated or manual
  gl_posted       BOOLEAN DEFAULT FALSE,
  gl_entry_id     UUID,    -- reference to ledger_entries if posted

  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE petty_cash_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='petty_cash_entries' AND policyname='entity_scope'
  ) THEN
    CREATE POLICY entity_scope ON petty_cash_entries
      USING (entity_id IN (
        SELECT entity_id FROM user_profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pce_entity      ON petty_cash_entries(entity_id);
CREATE INDEX IF NOT EXISTS idx_pce_account     ON petty_cash_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_pce_date        ON petty_cash_entries(entity_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_pce_gl_posted   ON petty_cash_entries(entity_id, gl_posted);

-- Done ✓
SELECT 'Petty cash patch applied successfully' AS result;
