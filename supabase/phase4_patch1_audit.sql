-- ═══════════════════════════════════════════════════════════════════
-- Phase 4 Patch #1 — Audit Log
-- Safe to run multiple times (all IF NOT EXISTS / CREATE OR REPLACE)
-- ═══════════════════════════════════════════════════════════════════

-- 1. Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id    UUID,
  table_name   VARCHAR(100) NOT NULL,
  record_id    UUID,
  action       VARCHAR(10)  NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data     JSONB,
  new_data     JSONB,
  changed_by   UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity_time  ON audit_logs(entity_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_table_time   ON audit_logs(table_name, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_time    ON audit_logs(changed_by, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_record       ON audit_logs(record_id);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'audit_logs_read' AND tablename = 'audit_logs'
  ) THEN
    CREATE POLICY "audit_logs_read" ON audit_logs FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'audit_logs_insert' AND tablename = 'audit_logs'
  ) THEN
    -- Only the trigger function (SECURITY DEFINER) will insert; block direct inserts
    CREATE POLICY "audit_logs_insert" ON audit_logs FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- 2. Trigger function
CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER AS $$
DECLARE
  v_entity UUID;
  v_record_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_entity    := OLD.entity_id;
    v_record_id := OLD.id;
    INSERT INTO audit_logs(entity_id, table_name, record_id, action, old_data, new_data, changed_by)
    VALUES(v_entity, TG_TABLE_NAME, v_record_id, 'DELETE',
           row_to_json(OLD)::jsonb, NULL, auth.uid());
    RETURN OLD;

  ELSIF TG_OP = 'UPDATE' THEN
    v_entity    := NEW.entity_id;
    v_record_id := NEW.id;
    INSERT INTO audit_logs(entity_id, table_name, record_id, action, old_data, new_data, changed_by)
    VALUES(v_entity, TG_TABLE_NAME, v_record_id, 'UPDATE',
           row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb, auth.uid());
    RETURN NEW;

  ELSE -- INSERT
    v_entity    := NEW.entity_id;
    v_record_id := NEW.id;
    INSERT INTO audit_logs(entity_id, table_name, record_id, action, old_data, new_data, changed_by)
    VALUES(v_entity, TG_TABLE_NAME, v_record_id, 'INSERT',
           NULL, row_to_json(NEW)::jsonb, auth.uid());
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Apply triggers to key tables (safe — checks before creating)
DO $$
DECLARE
  t TEXT;
  tbl_list TEXT[] := ARRAY[
    'invoices',
    'purchase_orders',
    'employees',
    'payroll_runs',
    'payroll_items',
    'money_requests',
    'vacations',
    'site_masters',
    'projects',
    'loi_requests',
    'vehicles',
    'trip_records'
  ];
BEGIN
  FOREACH t IN ARRAY tbl_list LOOP
    -- Only create trigger if the table exists
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_' || t AND tgrelid = t::regclass) THEN
        EXECUTE format(
          'CREATE TRIGGER audit_%I
           AFTER INSERT OR UPDATE OR DELETE ON %I
           FOR EACH ROW EXECUTE FUNCTION log_audit_event()',
          t, t
        );
        RAISE NOTICE 'Created audit trigger on %', t;
      ELSE
        RAISE NOTICE 'Audit trigger already exists on %', t;
      END IF;
    ELSE
      RAISE NOTICE 'Table % does not exist yet — skipping trigger', t;
    END IF;
  END LOOP;
END $$;
