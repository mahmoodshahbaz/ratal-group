-- ============================================================
-- ACCSYS PHASE J SCHEMA — QR Code Manager
-- Run after field_ops_schema.sql
-- Safe to re-run (IF NOT EXISTS / OR REPLACE)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- qr_tokens already exists from field_ops_schema.sql
-- We just need to add admin (anon) INSERT + UPDATE policies
-- so the admin UI (which uses anon key) can generate & revoke
-- ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "anon insert qr_tokens"  ON qr_tokens;
CREATE POLICY "anon insert qr_tokens" ON qr_tokens
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon update qr_tokens"  ON qr_tokens;
CREATE POLICY "anon update qr_tokens" ON qr_tokens
  FOR UPDATE TO anon USING (true);

-- ────────────────────────────────────────────────────────────
-- Add expires_at column (optional per-token expiry)
-- NULL = never expires
-- ────────────────────────────────────────────────────────────
ALTER TABLE qr_tokens ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE qr_tokens ADD COLUMN IF NOT EXISTS revoked_at  timestamptz;
ALTER TABLE qr_tokens ADD COLUMN IF NOT EXISTS revoked_by  uuid REFERENCES employees(id);

-- Index for fast active-token lookups
CREATE INDEX IF NOT EXISTS idx_qr_tokens_active ON qr_tokens(is_active, employee_id);

-- ────────────────────────────────────────────────────────────
-- View: enriched token list for the admin panel
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW qr_tokens_view AS
SELECT
  qt.id,
  qt.token,
  qt.role,
  qt.employment_type,
  qt.is_active,
  qt.last_used_at,
  qt.generated_at,
  qt.expires_at,
  qt.revoked_at,
  qt.notes,
  -- Employee
  e.id           AS employee_id,
  e.full_name_en AS employee_name,
  e.full_name_ar AS employee_name_ar,
  e.designation,
  -- Entity
  qt.entity_id,
  -- Generator
  g.full_name_en AS generated_by_name,
  -- Revoker
  r.full_name_en AS revoked_by_name
FROM qr_tokens qt
LEFT JOIN employees e ON e.id = qt.employee_id
LEFT JOIN employees g ON g.id = qt.generated_by
LEFT JOIN employees r ON r.id = qt.revoked_by
ORDER BY qt.generated_at DESC;

-- ────────────────────────────────────────────────────────────
-- DONE
-- ────────────────────────────────────────────────────────────
