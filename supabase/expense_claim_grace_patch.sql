-- ══════════════════════════════════════════════════════════════════════════
-- N3: Expense Claim Grace Period — Schema Patch
--
-- Adds the expense_grace_unblocks table so admins can allow employees
-- to submit a claim for a period that is >30 days old (after collecting
-- physical receipts).
--
-- Flow:
--   FormExpenseClaim checks: if employee has RECORDED expenses for the
--   period BEFORE the current claim period, and that period ended >30 days
--   ago → blocked. Admin inserts a row here to unblock one employee+period.
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS expense_grace_unblocks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id    UUID        REFERENCES entities(id) ON DELETE CASCADE,
  employee_id  UUID        REFERENCES employees(id) ON DELETE CASCADE,
  period       TEXT        NOT NULL,   -- YYYY-MM — the late period being unblocked
  unblocked_by TEXT        NOT NULL,   -- admin name or email
  unblocked_at TIMESTAMPTZ DEFAULT NOW(),
  notes        TEXT,                   -- reason (e.g. "Physical receipts collected")
  UNIQUE(employee_id, period)
);

-- RLS: only service role / authenticated admin can insert
ALTER TABLE expense_grace_unblocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_grace_unblocks_select"
  ON expense_grace_unblocks FOR SELECT
  USING (auth.role() IN ('authenticated','anon','service_role'));

CREATE POLICY "expense_grace_unblocks_insert"
  ON expense_grace_unblocks FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE expense_grace_unblocks IS
  'Admin-controlled grace override: allows submitting expense claims beyond the 30-day cutoff once physical receipts have been verified.';

-- Quick admin helper to unblock (run in SQL Editor):
-- INSERT INTO expense_grace_unblocks (entity_id, employee_id, period, unblocked_by, notes)
-- VALUES (
--   '<entity-uuid>',
--   '<employee-uuid>',
--   '2025-11',                      -- the late period, e.g. November 2025
--   'admin@ratal.net',
--   'Physical receipts verified on 2026-01-15'
-- )
-- ON CONFLICT (employee_id, period) DO NOTHING;
