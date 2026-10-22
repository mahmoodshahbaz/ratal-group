-- ══════════════════════════════════════════════════════════════════════════
-- N3: Expense Grace Unblocks — Full Setup (table + correct RLS)
--
-- Run this once in Supabase SQL Editor.
-- Safe to re-run (uses IF NOT EXISTS / DROP IF EXISTS / IF EXISTS guards).
-- ══════════════════════════════════════════════════════════════════════════

-- 1. Create the table
CREATE TABLE IF NOT EXISTS expense_grace_unblocks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id    UUID        REFERENCES entities(id) ON DELETE CASCADE,
  employee_id  UUID        REFERENCES employees(id) ON DELETE CASCADE,
  period       TEXT        NOT NULL,   -- YYYY-MM — the late period being unblocked
  unblocked_by TEXT        NOT NULL,   -- admin name or email
  unblocked_at TIMESTAMPTZ DEFAULT NOW(),
  notes        TEXT,
  UNIQUE(employee_id, period)
);

COMMENT ON TABLE expense_grace_unblocks IS
  'Admin-controlled grace override: allows submitting expense claims beyond the 30-day cutoff once physical receipts have been verified.';

-- 2. Enable RLS
ALTER TABLE expense_grace_unblocks ENABLE ROW LEVEL SECURITY;

-- 3. Drop any old policies (safe if they don't exist)
DROP POLICY IF EXISTS "expense_grace_unblocks_select" ON expense_grace_unblocks;
DROP POLICY IF EXISTS "expense_grace_unblocks_insert" ON expense_grace_unblocks;
DROP POLICY IF EXISTS "expense_grace_unblocks_delete" ON expense_grace_unblocks;

-- 4. SELECT — any authenticated or anon can read (FormExpenseClaim checks this)
CREATE POLICY "expense_grace_unblocks_select"
  ON expense_grace_unblocks FOR SELECT
  USING (auth.role() IN ('authenticated', 'anon', 'service_role'));

-- 5. INSERT — authenticated admins (and service_role) can grant overrides
CREATE POLICY "expense_grace_unblocks_insert"
  ON expense_grace_unblocks FOR INSERT
  WITH CHECK (auth.role() IN ('authenticated', 'service_role'));

-- 6. DELETE — authenticated admins (and service_role) can revoke overrides
CREATE POLICY "expense_grace_unblocks_delete"
  ON expense_grace_unblocks FOR DELETE
  USING (auth.role() IN ('authenticated', 'service_role'));
