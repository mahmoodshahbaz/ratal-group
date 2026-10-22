-- ══════════════════════════════════════════════════════════════════════
-- RATAL GROUP — Opening Balances table
-- Run once in Supabase → SQL Editor before going live.
-- Safe to run multiple times (all IF NOT EXISTS / ON CONFLICT DO NOTHING)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS opening_balances (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id       UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  entity_code     TEXT,

  -- Party identification (one of these will be filled)
  party_type      TEXT,       -- EMPLOYEE | CONTRACTOR | SUB_CONTRACTOR | VENDOR |
                              --   SUPPLIER | LOCAL_SUPPLIER | RENTAL
  party_id        UUID,       -- FK to employees.id or contractors.id (resolved on upload)
  party_code      TEXT,       -- Human code: EMP-001, SUBCON-001, etc.
  party_name      TEXT,       -- Display name for journal description

  -- Balance details
  balance_type    TEXT NOT NULL,
  -- ADVANCE_GIVEN | LOAN_GIVEN | PETTY_CASH_FLOAT | AR_OUTSTANDING  → DR (asset)
  -- SALARY_PAYABLE | AP_OUTSTANDING | RETENTION_HELD                → CR (liability)
  -- OTHER → see notes

  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency        TEXT DEFAULT 'SAR',

  -- Go-live date (e.g. 2026-12-31)
  as_of_date      DATE NOT NULL DEFAULT '2026-12-31',

  notes           TEXT,

  -- Journal posting status
  je_id           UUID,       -- populated after journal entry is created
  je_posted       BOOLEAN     DEFAULT FALSE,
  posted_at       TIMESTAMPTZ,
  posted_by       UUID REFERENCES auth.users(id),

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  created_by      UUID REFERENCES auth.users(id)
);

-- Unique constraint: one balance entry per party+type on a given date
-- (prevents duplicate uploads)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ob_unique
  ON opening_balances(entity_id, party_code, balance_type, as_of_date)
  WHERE party_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ob_entity   ON opening_balances(entity_id, as_of_date DESC);
CREATE INDEX IF NOT EXISTS idx_ob_party    ON opening_balances(party_id) WHERE party_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ob_unposted ON opening_balances(entity_id, je_posted) WHERE je_posted = FALSE;

ALTER TABLE opening_balances ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'auth_opening_balances' AND tablename = 'opening_balances'
  ) THEN
    CREATE POLICY "auth_opening_balances"
      ON opening_balances FOR ALL
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- ── Reference view: what each balance_type means for the journal ──
-- DR  = company has the asset (money owed TO the company)
-- CR  = company owes (liability)
COMMENT ON COLUMN opening_balances.balance_type IS
$$ADVANCE_GIVEN      → DR Employee/Contractor Advance Account
LOAN_GIVEN          → DR Employee Loan Account
PETTY_CASH_FLOAT    → DR Petty Cash - [Custodian Name]
AR_OUTSTANDING      → DR Accounts Receivable
SALARY_PAYABLE      → CR Salary Payable
AP_OUTSTANDING      → CR Accounts Payable
RETENTION_HELD      → CR Retention Payable
OTHER               → See notes column$$;

-- ─── DONE ────────────────────────────────────────────────────────────
-- After running:
-- 1. Table opening_balances is created
-- 2. Upload the Opening Balances sheet from the Master Template via
--    ACCSYS → Administration → Bulk Data Upload
-- 3. The upload page will INSERT rows and POST journal entries:
--      DR/CR the relevant ledger account
--      CR/DR Opening Balance Equity
-- 4. Run "Post Opening Balances" button in BulkUpload to create JEs
