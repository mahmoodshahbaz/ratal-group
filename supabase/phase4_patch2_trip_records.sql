-- ═══════════════════════════════════════════════════════════════════
-- Phase 4 Patch #2 — Trip Records (daily CSV import) + Import Sessions
-- Safe to run multiple times (all IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════

-- 1. Import sessions — tracks each CSV upload
CREATE TABLE IF NOT EXISTS import_sessions (
  id            UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id     UUID         NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  import_type   VARCHAR(50)  NOT NULL DEFAULT 'trip_bookings',
  -- e.g. trip_bookings | employees | contractors | projects
  import_date   DATE         NOT NULL DEFAULT CURRENT_DATE,
  file_name     VARCHAR(300),
  total_rows    INTEGER      DEFAULT 0,
  new_rows      INTEGER      DEFAULT 0,
  updated_rows  INTEGER      DEFAULT 0,
  skipped_rows  INTEGER      DEFAULT 0,
  error_rows    INTEGER      DEFAULT 0,
  imported_by   UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  imported_at   TIMESTAMPTZ  DEFAULT NOW(),
  notes         TEXT
);

ALTER TABLE import_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'auth_import_sessions' AND tablename = 'import_sessions'
  ) THEN
    CREATE POLICY "auth_import_sessions" ON import_sessions FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- 2. Trip records — core daily booking data for GWT and RAT
CREATE TABLE IF NOT EXISTS trip_records (
  id              UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id       UUID          NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  import_session_id UUID        REFERENCES import_sessions(id) ON DELETE SET NULL,

  -- Booking identity (unique per entity)
  booking_ref     VARCHAR(150)  NOT NULL,

  -- Core booking fields
  client_name     VARCHAR(300),
  traveler_name   VARCHAR(300),
  service_type    VARCHAR(100),   -- Air | Hotel | Transfer | Visa | Insurance | Package | Rail
  destination     VARCHAR(300),
  travel_date     DATE,
  return_date     DATE,
  pax_count       SMALLINT       DEFAULT 1,
  ticket_no       VARCHAR(150),
  supplier        VARCHAR(200),
  remarks         TEXT,

  -- Financials
  cost_amount     NUMERIC(14,2)  DEFAULT 0,  -- buy price / net
  sale_amount     NUMERIC(14,2)  DEFAULT 0,  -- sell price / gross
  currency        VARCHAR(3)     DEFAULT 'SAR',

  -- Status
  status          VARCHAR(50)    DEFAULT 'CONFIRMED',
  -- CONFIRMED | CANCELLED | REFUNDED | AMENDED | PENDING

  -- Invoice linkage (set when billed)
  invoice_id      UUID           REFERENCES invoices(id) ON DELETE SET NULL,
  invoiced_at     TIMESTAMPTZ,

  -- Full raw CSV row kept for reference / re-import
  raw_data        JSONB,

  -- Timestamps
  created_at      TIMESTAMPTZ    DEFAULT NOW(),
  updated_at      TIMESTAMPTZ    DEFAULT NOW(),

  -- Unique: one booking_ref per entity
  UNIQUE (entity_id, booking_ref)
);

CREATE INDEX IF NOT EXISTS idx_trip_entity_date     ON trip_records(entity_id, travel_date DESC);
CREATE INDEX IF NOT EXISTS idx_trip_entity_client   ON trip_records(entity_id, client_name);
CREATE INDEX IF NOT EXISTS idx_trip_entity_import   ON trip_records(entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_entity_invoiced ON trip_records(entity_id, invoiced_at) WHERE invoiced_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_trip_service         ON trip_records(entity_id, service_type);

ALTER TABLE trip_records ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'auth_trip_records' AND tablename = 'trip_records'
  ) THEN
    CREATE POLICY "auth_trip_records" ON trip_records FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_trip_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trip_records_updated_at') THEN
    CREATE TRIGGER trip_records_updated_at
      BEFORE UPDATE ON trip_records
      FOR EACH ROW EXECUTE FUNCTION update_trip_timestamp();
  END IF;
END $$;

-- 3. Add employee_loans table if not present (needed by SelfService)
CREATE TABLE IF NOT EXISTS employee_loans (
  id                  UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id           UUID          NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  employee_id         UUID          NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  loan_type           VARCHAR(100)  DEFAULT 'Personal Loan',
  loan_amount         NUMERIC(14,2) NOT NULL,
  outstanding_balance NUMERIC(14,2),
  monthly_deduction   NUMERIC(14,2),
  total_installments  SMALLINT,
  installments_paid   SMALLINT      DEFAULT 0,
  issue_date          DATE,
  expected_end_date   DATE,
  status              VARCHAR(30)   DEFAULT 'ACTIVE',  -- ACTIVE | SETTLED | WRITTEN_OFF
  notes               TEXT,
  created_at          TIMESTAMPTZ   DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   DEFAULT NOW()
);

ALTER TABLE employee_loans ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'auth_employee_loans' AND tablename = 'employee_loans'
  ) THEN
    CREATE POLICY "auth_employee_loans" ON employee_loans FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
END $$;
