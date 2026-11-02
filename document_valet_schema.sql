-- document_valet_schema.sql
-- Patches the documents table for Document Valet
-- Safe to run multiple times (IF NOT EXISTS / IF EXISTS)
-- Run once in Supabase SQL Editor

-- ── ADD MISSING COLUMNS ──────────────────────────────────────────────────
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS notes         text,
  ADD COLUMN IF NOT EXISTS uploaded_by   uuid REFERENCES employees(id) ON DELETE SET NULL;

COMMENT ON COLUMN documents.notes        IS 'Free-text notes about this document (renewal reminders, issuer contact, etc.)';
COMMENT ON COLUMN documents.uploaded_by  IS 'Employee who uploaded this document';

-- ── INDEX for Document Valet cross-entity expiry queries ─────────────────
CREATE INDEX IF NOT EXISTS idx_documents_entity_expiry
  ON documents (entity_id, linked_type, expiry_date)
  WHERE expiry_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_linked
  ON documents (entity_id, linked_type, linked_id);

-- ── ENSURE linked_type values are consistent (uppercase) ─────────────────
-- Documents may have been inserted with mixed case — normalise
UPDATE documents SET linked_type = UPPER(linked_type) WHERE linked_type != UPPER(linked_type);
