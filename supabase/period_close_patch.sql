-- ═══════════════════════════════════════════════════════════════════
-- Period Close Patch — Ratal Group
-- Creates:
--   period_locks                — which entity+year+month is locked
--   period_checklist_items      — task definitions per entity
--   period_checklist_completions— per-period tick-off records
-- Also:
--   check_period_lock() trigger — blocks ledger_entries INSERT into locked periods
-- Run once in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. period_locks ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS period_locks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  status        TEXT NOT NULL DEFAULT 'LOCKED',   -- LOCKED | UNLOCKED

  locked_by     UUID REFERENCES auth.users(id),
  locked_at     TIMESTAMPTZ,
  lock_notes    TEXT,

  unlocked_by   UUID REFERENCES auth.users(id),
  unlocked_at   TIMESTAMPTZ,
  unlock_reason TEXT,

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (entity_id, year, month)
);

ALTER TABLE period_locks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='period_locks' AND policyname='entity_scope'
  ) THEN
    CREATE POLICY entity_scope ON period_locks
      USING (entity_id IN (
        SELECT entity_id FROM user_profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pl_entity      ON period_locks(entity_id);
CREATE INDEX IF NOT EXISTS idx_pl_entity_ym   ON period_locks(entity_id, year, month);
CREATE INDEX IF NOT EXISTS idx_pl_status      ON period_locks(entity_id, status);

-- ── 2. period_checklist_items ────────────────────────────────────
-- Reusable task definitions that apply to every period for this entity
CREATE TABLE IF NOT EXISTS period_checklist_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  title         TEXT NOT NULL,
  description   TEXT,
  category      TEXT,       -- GL | HR | VAT | BANK | RECON | REVIEW | OTHER
  is_required   BOOLEAN DEFAULT TRUE,   -- required before locking
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE period_checklist_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='period_checklist_items' AND policyname='entity_scope'
  ) THEN
    CREATE POLICY entity_scope ON period_checklist_items
      USING (entity_id IN (
        SELECT entity_id FROM user_profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pci_entity ON period_checklist_items(entity_id, is_active, sort_order);

-- ── 3. period_checklist_completions ──────────────────────────────
-- One row per (entity, item, year, month) — records who ticked what
CREATE TABLE IF NOT EXISTS period_checklist_completions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  item_id       UUID NOT NULL REFERENCES period_checklist_items(id) ON DELETE CASCADE,
  year          INTEGER NOT NULL,
  month         INTEGER NOT NULL,

  completed     BOOLEAN DEFAULT FALSE,
  completed_by  UUID REFERENCES auth.users(id),
  completed_at  TIMESTAMPTZ,
  notes         TEXT,

  UNIQUE (entity_id, item_id, year, month)
);

ALTER TABLE period_checklist_completions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename='period_checklist_completions' AND policyname='entity_scope'
  ) THEN
    CREATE POLICY entity_scope ON period_checklist_completions
      USING (entity_id IN (
        SELECT entity_id FROM user_profiles WHERE id = auth.uid()
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pcc_entity_ym ON period_checklist_completions(entity_id, year, month);

-- ── 4. updated_at trigger on period_locks (idempotent) ───────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS period_locks_updated_at ON period_locks;
CREATE TRIGGER period_locks_updated_at
  BEFORE UPDATE ON period_locks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 5. GL guard trigger — blocks INSERT into locked periods ───────
-- Any INSERT into ledger_entries whose entry_date falls in a LOCKED
-- period for that entity will raise an exception and be rejected.
CREATE OR REPLACE FUNCTION check_period_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_year  INTEGER;
  v_month INTEGER;
  v_locked BOOLEAN;
BEGIN
  v_year  := EXTRACT(YEAR  FROM NEW.entry_date::DATE)::INTEGER;
  v_month := EXTRACT(MONTH FROM NEW.entry_date::DATE)::INTEGER;

  SELECT EXISTS (
    SELECT 1 FROM period_locks
    WHERE entity_id = NEW.entity_id
      AND year  = v_year
      AND month = v_month
      AND status = 'LOCKED'
  ) INTO v_locked;

  IF v_locked THEN
    RAISE EXCEPTION
      'Period %/% is closed. Unlock the period before posting entries.',
      v_year, LPAD(v_month::TEXT, 2, '0');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ledger_entries_period_lock_check ON ledger_entries;
CREATE TRIGGER ledger_entries_period_lock_check
  BEFORE INSERT ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION check_period_lock();

-- Done ✓
SELECT 'Period close patch applied successfully' AS result;
