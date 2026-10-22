-- ─────────────────────────────────────────────────────────────────
-- Patch: Add po_type to incoming_pos
-- Run once in Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────

-- PO type enum
DO $$ BEGIN
  CREATE TYPE incoming_po_type AS ENUM (
    'ORIGINAL',       -- Standard PO received from contractor
    'CHANGE_ORDER',   -- Modifies an existing PO (scope / value change)
    'MODEL',          -- Nokia/Huawei: initial model PO before PAT
    'AS_BUILT',       -- Nokia/Huawei: final PO after PAT (replaces MODEL)
    'DIFFERENCE',     -- Nokia/Huawei: top-up PO when AS_BUILT > MODEL
    'BLANKET',        -- stc: budget envelope PO (parent)
    'RELEASE'         -- stc: executable release against a BLANKET PO
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add po_type column (defaults to ORIGINAL for all existing records)
ALTER TABLE incoming_pos
  ADD COLUMN IF NOT EXISTS po_type incoming_po_type NOT NULL DEFAULT 'ORIGINAL';

-- Add parent_po_id for linking: CHANGE_ORDER→ORIGINAL, AS_BUILT→MODEL,
--   DIFFERENCE→MODEL, RELEASE→BLANKET
ALTER TABLE incoming_pos
  ADD COLUMN IF NOT EXISTS parent_po_id UUID REFERENCES incoming_pos(id) ON DELETE SET NULL;

-- Add revision_number for soft-duplicate detection (e.g. "Rev 1", "R2")
ALTER TABLE incoming_pos
  ADD COLUMN IF NOT EXISTS revision_number TEXT;

-- Index for duplicate check queries
CREATE INDEX IF NOT EXISTS idx_incoming_pos_dup_check
  ON incoming_pos (entity_id, contractor_id, contractor_po_number);

-- Index for parent linkage lookups
CREATE INDEX IF NOT EXISTS idx_incoming_pos_parent
  ON incoming_pos (parent_po_id);
