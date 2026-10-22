-- ═══════════════════════════════════════════════════════════════════
-- Phase 2 Patch #1 — LOI (Letter of Intent) table
-- Safe to run multiple times (all IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS loi_requests (
  id                    UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id             UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  loi_number            VARCHAR(30) NOT NULL,           -- LOI-YYMM-001
  internal_ref          VARCHAR(100),                   -- Client's ref e.g. STC/SCP/2026/001
  client_name           VARCHAR(200) NOT NULL,
  client_type           VARCHAR(20)  DEFAULT 'CONTRACTOR', -- CONTRACTOR|CUSTOMER|OTHER
  contractor_id         UUID         REFERENCES contractors(id),
  customer_id           UUID,                           -- FK to customers if applicable
  service_unit          VARCHAR(10)  DEFAULT 'NISU',    -- NISU|TISU|CISU|ITSU|ALL
  work_type             VARCHAR(100),                   -- e.g. MW Links, Node B
  scope_description     TEXT,
  estimated_value       NUMERIC(14,2) DEFAULT 0,
  received_date         DATE          NOT NULL DEFAULT CURRENT_DATE,
  response_deadline     DATE,
  status                VARCHAR(20)  DEFAULT 'RECEIVED', -- RECEIVED|RESPONDED|CONVERTED|REJECTED|EXPIRED
  notes                 TEXT,
  converted_project_id  UUID,                           -- set when CONVERTED
  converted_project_no  VARCHAR(30),                    -- set when CONVERTED
  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ  DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  DEFAULT NOW()
);

-- Unique LOI number per entity
CREATE UNIQUE INDEX IF NOT EXISTS idx_loi_number_entity ON loi_requests(entity_id, loi_number);
CREATE INDEX IF NOT EXISTS idx_loi_entity_status        ON loi_requests(entity_id, status);
CREATE INDEX IF NOT EXISTS idx_loi_entity_date          ON loi_requests(entity_id, received_date DESC);

-- RLS
ALTER TABLE loi_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'auth_loi_requests' AND tablename = 'loi_requests'
  ) THEN
    CREATE POLICY "auth_loi_requests" ON loi_requests FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_loi_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_loi_updated_at ON loi_requests;
CREATE TRIGGER trg_loi_updated_at
  BEFORE UPDATE ON loi_requests
  FOR EACH ROW EXECUTE FUNCTION update_loi_timestamp();

-- ─── Also add loi_ref column to projects if it doesn't exist ───────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS loi_ref VARCHAR(30);
