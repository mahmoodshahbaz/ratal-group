-- ═══════════════════════════════════════════════════════════════════
-- Phase 5B Patch — Leave Balance + Trial Balance DB support
-- Run once in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Add annual_leave_days to employees ─────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS annual_leave_days INTEGER DEFAULT 21;

-- ── 2. Add annual_leave_days to entity_settings ───────────────────
-- (create table if not already present from prior patches)
CREATE TABLE IF NOT EXISTS entity_settings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id  UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  key        TEXT NOT NULL,
  value      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, key)
);

-- If entity_settings is key-value, add a typed column alternative.
-- Some apps use a flat-column approach instead; support both styles:
ALTER TABLE entity_settings
  ADD COLUMN IF NOT EXISTS annual_leave_days   INTEGER DEFAULT 21,
  ADD COLUMN IF NOT EXISTS vat_number          TEXT,
  ADD COLUMN IF NOT EXISTS bank_name           TEXT,
  ADD COLUMN IF NOT EXISTS bank_iban           TEXT,
  ADD COLUMN IF NOT EXISTS bank_swift          TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_year_start   INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS currency            TEXT DEFAULT 'SAR';

-- ── 3. Ensure vacations has days_requested ────────────────────────
ALTER TABLE vacations
  ADD COLUMN IF NOT EXISTS days_requested  NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS return_date     DATE,
  ADD COLUMN IF NOT EXISTS rejection_note  TEXT,
  ADD COLUMN IF NOT EXISTS approved_by     UUID REFERENCES user_profiles(id);

-- Back-fill days_requested from start_date/end_date where missing
UPDATE vacations
SET days_requested = (end_date - start_date + 1)
WHERE days_requested IS NULL
  AND start_date IS NOT NULL
  AND end_date IS NOT NULL;

-- ── 4. Ensure journal_entries table exists ────────────────────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id    UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  entry_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  voucher_type TEXT NOT NULL DEFAULT 'JOURNAL',  -- JOURNAL | CONTRA | PAYMENT | RECEIPT | PAYROLL | INVOICE
  status       TEXT NOT NULL DEFAULT 'DRAFT',    -- DRAFT | POSTED | VOIDED
  reference    TEXT,
  narration    TEXT,
  created_by   UUID REFERENCES user_profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  posted_at    TIMESTAMPTZ,
  posted_by    UUID REFERENCES user_profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_je_entity_date  ON journal_entries(entity_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_je_entity_status ON journal_entries(entity_id, status);

-- ── 5. Ensure journal_entry_lines table exists ────────────────────
CREATE TABLE IF NOT EXISTS journal_entry_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id  UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id        UUID NOT NULL REFERENCES chart_of_accounts(id),
  debit             NUMERIC(15,2) DEFAULT 0,
  credit            NUMERIC(15,2) DEFAULT 0,
  narration         TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jel_entry     ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jel_account   ON journal_entry_lines(account_id);

-- ── 6. Ensure chart_of_accounts has entity_id ────────────────────
ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS is_active     BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS opening_debit  NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_credit NUMERIC(15,2) DEFAULT 0;

-- ── 7. RLS policies ───────────────────────────────────────────────
ALTER TABLE journal_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines  ENABLE ROW LEVEL SECURITY;

-- journal_entries: entity-scoped read
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='journal_entries' AND policyname='entity_scope'
  ) THEN
    CREATE POLICY entity_scope ON journal_entries
      USING (entity_id IN (
        SELECT entity_id FROM user_profiles WHERE id = auth.uid()
        UNION SELECT entity_id FROM entities WHERE id IN (
          SELECT entity_id FROM user_profiles WHERE id = auth.uid() AND entity_code = 'ALL'
        )
      ));
  END IF;
END $$;

-- journal_entry_lines: inherit via join
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='journal_entry_lines' AND policyname='entity_scope'
  ) THEN
    CREATE POLICY entity_scope ON journal_entry_lines
      USING (journal_entry_id IN (
        SELECT id FROM journal_entries WHERE entity_id IN (
          SELECT entity_id FROM user_profiles WHERE id = auth.uid()
        )
      ));
  END IF;
END $$;

-- ── 8. index on employees.annual_leave_days for quick queries ─────
CREATE INDEX IF NOT EXISTS idx_emp_leave_days ON employees(entity_id, annual_leave_days);

-- Done ✓
