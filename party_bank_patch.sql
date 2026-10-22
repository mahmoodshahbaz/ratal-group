-- ============================================================
-- party_bank_patch.sql
-- Run this in Supabase SQL Editor
-- Adds bank accounts support + compliance fields to parties
-- ============================================================

-- 1. New columns on contractors table
ALTER TABLE contractors
  ADD COLUMN IF NOT EXISTS cr_number       TEXT,
  ADD COLUMN IF NOT EXISTS national_id     TEXT,
  ADD COLUMN IF NOT EXISTS vat_reg_status  TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS specializations JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. party_bank_accounts table
CREATE TABLE IF NOT EXISTS party_bank_accounts (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id       UUID        NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
  entity_id           UUID        REFERENCES entities(id),
  account_holder_name TEXT        NOT NULL,
  bank_name           TEXT        NOT NULL,
  account_number      TEXT,
  iban                TEXT,
  swift_code          TEXT,
  currency            TEXT        NOT NULL DEFAULT 'SAR',
  is_primary          BOOLEAN     NOT NULL DEFAULT FALSE,
  notes               TEXT,
  status              TEXT        NOT NULL DEFAULT 'ACTIVE',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. RLS
ALTER TABLE party_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pba_all_authenticated" ON party_bank_accounts;
CREATE POLICY "pba_all_authenticated" ON party_bank_accounts
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Helpful index for lookups by contractor
CREATE INDEX IF NOT EXISTS idx_pba_contractor ON party_bank_accounts (contractor_id);
CREATE INDEX IF NOT EXISTS idx_pba_entity     ON party_bank_accounts (entity_id);
