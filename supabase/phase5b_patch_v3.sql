-- ═══════════════════════════════════════════════════════════════════
-- Phase 5B Final Patch — clean, safe, matches actual schema
-- Actual GL table is ledger_entries (flat), NOT journal_entries
-- Run this in a fresh SQL Editor tab
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. chart_of_accounts — add missing columns ────────────────────
ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS is_active      BOOLEAN       DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS opening_debit  NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_credit NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes          TEXT;

UPDATE chart_of_accounts SET is_active = TRUE WHERE is_active IS NULL;

-- ── 2. ledger_entries — indexes for Trial Balance / Balance Sheet ──
CREATE INDEX IF NOT EXISTS idx_le_entity_date
  ON ledger_entries(entity_id, entry_date);

CREATE INDEX IF NOT EXISTS idx_le_account
  ON ledger_entries(entity_id, account_code);

CREATE INDEX IF NOT EXISTS idx_le_voucher
  ON ledger_entries(entity_id, voucher_type);

-- ── 3. employees — annual leave entitlement per employee ──────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS annual_leave_days INTEGER DEFAULT 21;

-- ── 4. vacations — add days_requested and supporting columns ──────
ALTER TABLE vacations
  ADD COLUMN IF NOT EXISTS days_requested  NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS return_date     DATE,
  ADD COLUMN IF NOT EXISTS rejection_note  TEXT,
  ADD COLUMN IF NOT EXISTS approved_by     UUID;

-- Back-fill days_requested from date range where missing
UPDATE vacations
SET days_requested = (end_date - start_date + 1)
WHERE days_requested IS NULL
  AND start_date IS NOT NULL
  AND end_date   IS NOT NULL;

-- ── 5. entity_settings — add typed config columns ─────────────────
-- (table was created in phase5b_patch.sql with RLS enabled)
ALTER TABLE entity_settings
  ADD COLUMN IF NOT EXISTS annual_leave_days   INTEGER DEFAULT 21,
  ADD COLUMN IF NOT EXISTS vat_number          TEXT,
  ADD COLUMN IF NOT EXISTS bank_name           TEXT,
  ADD COLUMN IF NOT EXISTS bank_iban           TEXT,
  ADD COLUMN IF NOT EXISTS bank_swift          TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_year_start   INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS currency            TEXT DEFAULT 'SAR';

-- ── 6. Helpful indexes ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_emp_leave_days
  ON employees(entity_id, annual_leave_days);

CREATE INDEX IF NOT EXISTS idx_vac_employee_year
  ON vacations(entity_id, employee_id, start_date);

-- Done ✓
SELECT 'Phase 5B patch v3 applied successfully' AS result;
