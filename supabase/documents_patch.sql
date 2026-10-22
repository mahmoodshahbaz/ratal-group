-- ═══════════════════════════════════════════════════════════════════
-- Document Vault Patch — Ratal Group
-- Creates:
--   documents  — contract / license / MOU / certificate metadata
-- Supabase Storage bucket 'documents' handles actual files.
-- Run once in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ── 0. Idempotent updated_at trigger ─────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── 1. documents ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  -- Document identity
  title           TEXT NOT NULL,
  doc_number      TEXT,                -- contract number, license number, etc.
  category        TEXT NOT NULL DEFAULT 'OTHER',
  -- CONTRACT | LICENSE | MOU | INSURANCE | VISA | CERTIFICATE | INVOICE | LEGAL | OTHER

  description     TEXT,
  tags            TEXT[],             -- free tags for search

  -- Storage
  file_url        TEXT,               -- Supabase Storage public URL
  file_name       TEXT,               -- original filename
  file_size_kb    INTEGER,
  file_type       TEXT,               -- PDF, DOCX, JPG, etc.

  -- Parties
  counterparty    TEXT,               -- other company / authority name
  issued_by       TEXT,               -- issuing authority

  -- Dates
  issue_date      DATE,
  effective_date  DATE,
  expiry_date     DATE,               -- for alerts

  -- Alert thresholds (days before expiry to warn)
  alert_days      INTEGER DEFAULT 30,
  is_renewable    BOOLEAN DEFAULT FALSE,

  -- Status
  status          TEXT NOT NULL DEFAULT 'ACTIVE',
  -- ACTIVE | EXPIRED | EXPIRING_SOON | RENEWED | CANCELLED

  -- Links (optional — link to related records)
  linked_type     TEXT,   -- EMPLOYEE | PROJECT | SUPPLIER | VEHICLE | OTHER
  linked_id       UUID,
  linked_name     TEXT,

  -- Department
  department      TEXT,
  owner_user_id   UUID REFERENCES auth.users(id),
  owner_name      TEXT,

  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='documents' AND policyname='entity_scope'
  ) THEN
    CREATE POLICY entity_scope ON documents
      USING (entity_id IN (SELECT entity_id FROM user_profiles WHERE id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_doc_entity   ON documents(entity_id);
CREATE INDEX IF NOT EXISTS idx_doc_category ON documents(entity_id, category);
CREATE INDEX IF NOT EXISTS idx_doc_status   ON documents(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_doc_expiry   ON documents(entity_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_doc_linked   ON documents(entity_id, linked_type, linked_id);

DROP TRIGGER IF EXISTS documents_updated_at ON documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2. Auto-update status based on expiry_date ────────────────────
-- Optional: run this as a scheduled function or call manually.
-- Updates documents whose expiry_date has passed to EXPIRED,
-- and those within alert_days to EXPIRING_SOON.
CREATE OR REPLACE FUNCTION refresh_document_statuses()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE documents
    SET status = 'EXPIRED', updated_at = NOW()
  WHERE expiry_date IS NOT NULL
    AND expiry_date < CURRENT_DATE
    AND status NOT IN ('EXPIRED','CANCELLED','RENEWED');

  UPDATE documents
    SET status = 'EXPIRING_SOON', updated_at = NOW()
  WHERE expiry_date IS NOT NULL
    AND expiry_date >= CURRENT_DATE
    AND expiry_date <= CURRENT_DATE + (alert_days || ' days')::INTERVAL
    AND status = 'ACTIVE';
END;
$$;

-- Done ✓
SELECT 'Documents patch applied successfully' AS result;
