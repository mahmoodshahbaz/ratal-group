-- ─────────────────────────────────────────────────────────────────────────────
-- OUTSOURCE PATCH — Outsource persons, engagements, device binding, geo-fence
-- Run this in Supabase SQL Editor (safe to re-run — idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Outsource Persons — permanent record, never deleted ───────────────────
CREATE TABLE IF NOT EXISTS outsource_persons (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id             TEXT NOT NULL,
  person_code           TEXT UNIQUE,                 -- OUT-0001
  full_name_en          TEXT NOT NULL,
  full_name_ar          TEXT,
  nationality           TEXT,
  iqama_number          TEXT,
  iqama_expiry          DATE,
  mobile_number         TEXT,
  emergency_contact     TEXT,
  photo_url             TEXT,
  trade                 TEXT,  -- Fiber Splicer, Excavation, Civil, UTP, etc.
  qr_token              TEXT UNIQUE,                 -- OUT-XXXXXXXX, never regenerated
  device_token          TEXT,                        -- registered device UUID
  device_registered_at  TIMESTAMPTZ,
  device_registered_by  UUID,                        -- HR officer who registered
  device_otp            TEXT,                        -- 6-digit code, plain text, short-lived
  device_otp_expires    TIMESTAMPTZ,
  is_active             BOOLEAN DEFAULT FALSE,        -- TRUE when engagement is active
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. Outsource Engagements — one per hiring period ────────────────────────
CREATE TABLE IF NOT EXISTS outsource_engagements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         TEXT NOT NULL,
  person_id         UUID REFERENCES outsource_persons(id) ON DELETE CASCADE,
  engagement_number TEXT UNIQUE,                      -- OE-0001
  project_id        UUID REFERENCES projects(id),
  department_id     UUID REFERENCES departments(id),
  start_date        DATE NOT NULL,
  end_date          DATE,
  rate_type         TEXT DEFAULT 'DAILY',             -- DAILY | MONTHLY | PACKAGE
  daily_rate        NUMERIC(10,2),
  package_amount    NUMERIC(10,2),
  scope             TEXT,                             -- brief work description
  status            TEXT DEFAULT 'ACTIVE',            -- ACTIVE | COMPLETED | TERMINATED
  terminated_reason TEXT,
  engaged_by        UUID,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── 3. Device binding — add to employees table ──────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS device_token           TEXT,
  ADD COLUMN IF NOT EXISTS device_registered_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS device_registered_by   UUID,
  ADD COLUMN IF NOT EXISTS device_otp             TEXT,
  ADD COLUMN IF NOT EXISTS device_otp_expires     TIMESTAMPTZ;

-- ── 4. Geo-fence — add to site_masters ──────────────────────────────────────
ALTER TABLE site_masters
  ADD COLUMN IF NOT EXISTS latitude         NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude        NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS geo_radius_m     INTEGER DEFAULT 200,
  ADD COLUMN IF NOT EXISTS geo_confirmed    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS geo_source       TEXT,    -- MANUAL | AUTO_CLUSTER
  ADD COLUMN IF NOT EXISTS proposed_lat     NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS proposed_lng     NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS proposed_count   INTEGER DEFAULT 0;

-- ── 5. Geo submissions log — for cluster auto-coordinate ────────────────────
CREATE TABLE IF NOT EXISTS site_geo_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       UUID REFERENCES site_masters(id),
  qr_token      TEXT NOT NULL,
  person_type   TEXT,              -- employee | outsource | subcon
  latitude      NUMERIC(10,7) NOT NULL,
  longitude     NUMERIC(10,7) NOT NULL,
  geo_flagged   BOOLEAN DEFAULT FALSE,
  distance_m    INTEGER,           -- distance from site center, null if site had no coords
  submitted_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 6. Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_outsource_persons_entity   ON outsource_persons(entity_id);
CREATE INDEX IF NOT EXISTS idx_outsource_persons_qr       ON outsource_persons(qr_token);
CREATE INDEX IF NOT EXISTS idx_outsource_engagements_person ON outsource_engagements(person_id);
CREATE INDEX IF NOT EXISTS idx_site_geo_site              ON site_geo_submissions(site_id);
CREATE INDEX IF NOT EXISTS idx_site_geo_submitted         ON site_geo_submissions(submitted_at);

-- ── 7. RPC: check_device ─────────────────────────────────────────────────────
-- Returns: {"status": "ok"|"otp_pending"|"never_registered"|"unregistered"|"inactive"|"not_found"}
CREATE OR REPLACE FUNCTION check_device(p_token TEXT, p_device_uuid TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE rec RECORD;
BEGIN
  -- Try employees first
  SELECT device_token, device_otp_expires, is_active
  INTO rec FROM employees WHERE qr_token = p_token LIMIT 1;

  IF FOUND THEN
    IF rec.device_token IS NULL THEN
      -- Never been registered
      IF rec.device_otp_expires IS NOT NULL AND rec.device_otp_expires > NOW() THEN
        RETURN '{"status":"otp_pending"}'::JSONB;
      END IF;
      RETURN '{"status":"never_registered"}'::JSONB;
    END IF;
    -- Device registered
    IF NOT rec.is_active THEN RETURN '{"status":"inactive"}'::JSONB; END IF;
    IF rec.device_token = p_device_uuid THEN RETURN '{"status":"ok"}'::JSONB; END IF;
    -- Different device
    IF rec.device_otp_expires IS NOT NULL AND rec.device_otp_expires > NOW() THEN
      RETURN '{"status":"otp_pending"}'::JSONB;
    END IF;
    RETURN '{"status":"unregistered"}'::JSONB;
  END IF;

  -- Try outsource persons
  SELECT device_token, device_otp_expires, is_active
  INTO rec FROM outsource_persons WHERE qr_token = p_token LIMIT 1;

  IF FOUND THEN
    IF rec.device_token IS NULL THEN
      IF rec.device_otp_expires IS NOT NULL AND rec.device_otp_expires > NOW() THEN
        RETURN '{"status":"otp_pending"}'::JSONB;
      END IF;
      RETURN '{"status":"never_registered"}'::JSONB;
    END IF;
    IF NOT rec.is_active THEN RETURN '{"status":"inactive"}'::JSONB; END IF;
    IF rec.device_token = p_device_uuid THEN RETURN '{"status":"ok"}'::JSONB; END IF;
    IF rec.device_otp_expires IS NOT NULL AND rec.device_otp_expires > NOW() THEN
      RETURN '{"status":"otp_pending"}'::JSONB;
    END IF;
    RETURN '{"status":"unregistered"}'::JSONB;
  END IF;

  -- Try subcons (no device binding — they always pass)
  PERFORM 1 FROM vendors WHERE qr_token = p_token LIMIT 1;
  IF FOUND THEN RETURN '{"status":"ok"}'::JSONB; END IF;

  RETURN '{"status":"not_found"}'::JSONB;
END;
$$;

-- ── 8. RPC: register_device ──────────────────────────────────────────────────
-- Called when employee enters OTP on their device
-- Returns: {"ok":true} | {"ok":false,"reason":"invalid_otp"|"otp_expired"|"not_found"}
CREATE OR REPLACE FUNCTION register_device(p_token TEXT, p_otp TEXT, p_device_uuid TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE rec RECORD;
BEGIN
  -- Try employees
  SELECT id, device_otp, device_otp_expires
  INTO rec FROM employees WHERE qr_token = p_token LIMIT 1;

  IF FOUND THEN
    IF rec.device_otp IS NULL OR rec.device_otp <> p_otp THEN
      RETURN '{"ok":false,"reason":"invalid_otp"}'::JSONB;
    END IF;
    IF rec.device_otp_expires < NOW() THEN
      RETURN '{"ok":false,"reason":"otp_expired"}'::JSONB;
    END IF;
    UPDATE employees SET
      device_token         = p_device_uuid,
      device_registered_at = NOW(),
      device_otp           = NULL,
      device_otp_expires   = NULL
    WHERE id = rec.id;
    RETURN '{"ok":true}'::JSONB;
  END IF;

  -- Try outsource persons
  SELECT id, device_otp, device_otp_expires
  INTO rec FROM outsource_persons WHERE qr_token = p_token LIMIT 1;

  IF FOUND THEN
    IF rec.device_otp IS NULL OR rec.device_otp <> p_otp THEN
      RETURN '{"ok":false,"reason":"invalid_otp"}'::JSONB;
    END IF;
    IF rec.device_otp_expires < NOW() THEN
      RETURN '{"ok":false,"reason":"otp_expired"}'::JSONB;
    END IF;
    UPDATE outsource_persons SET
      device_token         = p_device_uuid,
      device_registered_at = NOW(),
      device_otp           = NULL,
      device_otp_expires   = NULL
    WHERE id = rec.id;
    RETURN '{"ok":true}'::JSONB;
  END IF;

  RETURN '{"ok":false,"reason":"not_found"}'::JSONB;
END;
$$;

-- ── 9. RPC: get_outsource_by_qr ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_outsource_by_qr(p_token TEXT)
RETURNS TABLE (
  id UUID, entity_id TEXT, person_code TEXT, full_name_en TEXT, full_name_ar TEXT,
  mobile_number TEXT, trade TEXT, is_active BOOLEAN,
  qr_token TEXT, nationality TEXT,
  engagement_id UUID, project_id UUID, department_id UUID,
  daily_rate NUMERIC, rate_type TEXT, start_date DATE, end_date DATE,
  engagement_status TEXT, scope TEXT,
  department_name TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    op.id, op.entity_id, op.person_code, op.full_name_en, op.full_name_ar,
    op.mobile_number, op.trade, op.is_active, op.qr_token, op.nationality,
    oe.id, oe.project_id, oe.department_id,
    oe.daily_rate, oe.rate_type, oe.start_date, oe.end_date,
    oe.status, oe.scope,
    d.name
  FROM outsource_persons op
  LEFT JOIN outsource_engagements oe ON oe.person_id = op.id AND oe.status = 'ACTIVE'
  LEFT JOIN departments d ON d.id = oe.department_id
  WHERE op.qr_token = p_token
  LIMIT 1;
END;
$$;

-- ── 10. Enable RLS (allow anon to call these RPCs) ───────────────────────────
-- Note: SECURITY DEFINER functions bypass RLS automatically.
-- For tables, set appropriate policies:
ALTER TABLE outsource_persons    ENABLE ROW LEVEL SECURITY;
ALTER TABLE outsource_engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_geo_submissions  ENABLE ROW LEVEL SECURITY;

-- Authenticated users can do everything on outsource tables
DROP POLICY IF EXISTS "outsource_persons_auth"        ON outsource_persons;
DROP POLICY IF EXISTS "outsource_engagements_auth"    ON outsource_engagements;
DROP POLICY IF EXISTS "geo_submissions_insert_anon"   ON site_geo_submissions;
DROP POLICY IF EXISTS "geo_submissions_auth"          ON site_geo_submissions;

CREATE POLICY "outsource_persons_auth" ON outsource_persons
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "outsource_engagements_auth" ON outsource_engagements
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon can insert geo submissions (field portal is public)
CREATE POLICY "geo_submissions_insert_anon" ON site_geo_submissions
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "geo_submissions_auth" ON site_geo_submissions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
