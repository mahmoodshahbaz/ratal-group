-- ═══════════════════════════════════════════════════════════════════
-- Cheque Register Patch — Ratal Group
-- Creates: cheques table (issued + received)
-- Run once in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cheques (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  -- Direction
  cheque_type       TEXT NOT NULL DEFAULT 'ISSUED',
    -- ISSUED   : we wrote a cheque to pay someone (liability / payable)
    -- RECEIVED : we received a cheque from a customer (receivable)

  -- Cheque details
  cheque_number     TEXT NOT NULL,
  cheque_date       DATE NOT NULL,       -- date printed on cheque
  due_date          DATE NOT NULL,       -- maturity / value date
  amount            NUMERIC(15,2) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'SAR',

  -- Parties
  bank_name         TEXT,               -- bank the cheque is drawn on (or deposited to)
  bank_account      TEXT,               -- our bank account number
  payee_name        TEXT,               -- (ISSUED) who we're paying
  drawer_name       TEXT,               -- (RECEIVED) who gave us the cheque
  party_account_code TEXT,              -- GL account for payee / drawer

  -- Status
  status            TEXT NOT NULL DEFAULT 'PENDING',
    -- PENDING     : not yet deposited / cleared
    -- DEPOSITED   : received cheque deposited into bank (RECEIVED only)
    -- CLEARED     : cheque has cleared the bank
    -- BOUNCED     : returned unpaid
    -- CANCELLED   : voided before deposit
    -- REPLACED    : replaced by new cheque (link via replaced_by)

  status_date       DATE,               -- date of last status change
  bounce_reason     TEXT,               -- if BOUNCED
  replaced_by       UUID REFERENCES cheques(id),  -- replacement cheque

  -- GL linkage
  gl_account_code   TEXT,              -- e.g. bank/cash account for clearing
  gl_posted         BOOLEAN DEFAULT FALSE,
  gl_entry_ref      TEXT,              -- voucher number if posted

  -- Reference
  reference         TEXT,              -- invoice / PO / expense number
  description       TEXT,
  department        TEXT,

  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE cheques ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cheques' AND policyname = 'entity_scope'
  ) THEN
    CREATE POLICY entity_scope ON cheques
      USING (entity_id IN (
        SELECT entity_id FROM user_profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

-- ── Indexes ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cheques_entity       ON cheques(entity_id);
CREATE INDEX IF NOT EXISTS idx_cheques_type_status  ON cheques(entity_id, cheque_type, status);
CREATE INDEX IF NOT EXISTS idx_cheques_due          ON cheques(entity_id, due_date);
CREATE INDEX IF NOT EXISTS idx_cheques_number       ON cheques(entity_id, cheque_number);

-- ── updated_at trigger (idempotent) ───────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cheques_updated_at ON cheques;
CREATE TRIGGER cheques_updated_at
  BEFORE UPDATE ON cheques
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Done ✓
SELECT 'Cheques patch applied successfully' AS result;
