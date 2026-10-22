-- ═══════════════════════════════════════════════════════════════════
-- Phase 5B Fix Patch — Add missing columns to existing tables
-- Run this AFTER phase5b_patch.sql fails on "column status does not exist"
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Add missing columns to journal_entries (table already exists) ─
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS voucher_type TEXT DEFAULT 'JOURNAL',
  ADD COLUMN IF NOT EXISTS status       TEXT DEFAULT 'POSTED',
  ADD COLUMN IF NOT EXISTS reference    TEXT,
  ADD COLUMN IF NOT EXISTS narration    TEXT,
  ADD COLUMN IF NOT EXISTS posted_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS posted_by    UUID;

-- Back-fill status for any existing entries (assume they are posted)
UPDATE journal_entries
SET status = 'POSTED'
WHERE status IS NULL;

-- ── 2. Add narration to journal_entry_lines if missing ───────────────
ALTER TABLE journal_entry_lines
  ADD COLUMN IF NOT EXISTS narration TEXT;

-- ── 3. Add indexes if not yet created ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_je_entity_date   ON journal_entries(entity_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_je_entity_status ON journal_entries(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_jel_entry        ON journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_jel_account      ON journal_entry_lines(account_id);

-- ── 4. Enable RLS on journal tables (safe to run if already enabled) ──
ALTER TABLE journal_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entry_lines ENABLE ROW LEVEL SECURITY;

-- ── 5. RLS policies (idempotent) ─────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'journal_entries' AND policyname = 'entity_scope'
  ) THEN
    CREATE POLICY entity_scope ON journal_entries
      USING (entity_id IN (
        SELECT entity_id FROM user_profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'journal_entry_lines' AND policyname = 'entity_scope'
  ) THEN
    CREATE POLICY entity_scope ON journal_entry_lines
      USING (journal_entry_id IN (
        SELECT id FROM journal_entries WHERE entity_id IN (
          SELECT entity_id FROM user_profiles WHERE id = auth.uid()
        )
      ));
  END IF;
END $$;

-- ── 6. chart_of_accounts missing columns ─────────────────────────────
ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS opening_debit  NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_credit NUMERIC(15,2) DEFAULT 0;

-- Back-fill is_active
UPDATE chart_of_accounts SET is_active = TRUE WHERE is_active IS NULL;

-- ── 7. employees.annual_leave_days ───────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS annual_leave_days INTEGER DEFAULT 21;

-- ── 8. vacations table additions ─────────────────────────────────────
ALTER TABLE vacations
  ADD COLUMN IF NOT EXISTS days_requested NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS return_date    DATE,
  ADD COLUMN IF NOT EXISTS rejection_note TEXT,
  ADD COLUMN IF NOT EXISTS approved_by    UUID;

UPDATE vacations
SET days_requested = (end_date - start_date + 1)
WHERE days_requested IS NULL
  AND start_date IS NOT NULL
  AND end_date   IS NOT NULL;

-- ── 9. entity_settings columns (table was created with RLS in patch 1) ─
ALTER TABLE entity_settings
  ADD COLUMN IF NOT EXISTS annual_leave_days INTEGER DEFAULT 21,
  ADD COLUMN IF NOT EXISTS vat_number        TEXT,
  ADD COLUMN IF NOT EXISTS bank_name         TEXT,
  ADD COLUMN IF NOT EXISTS bank_iban         TEXT,
  ADD COLUMN IF NOT EXISTS bank_swift        TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_year_start INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS currency          TEXT DEFAULT 'SAR';

-- ── 10. Index on employees leave days ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_emp_leave_days
  ON employees(entity_id, annual_leave_days);

-- Done ✓
SELECT 'Phase 5B fix patch applied successfully' AS result;
