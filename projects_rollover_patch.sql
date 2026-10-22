-- ============================================================
--  PROJECT CARRY-FORWARD SYSTEM  — run in Supabase SQL editor
--  Project numbering:  P-[YY][D][SEQ]
--    D = 0  → new project (born this year)
--    D = 9  → 1st carry-forward  (10-1)
--    D = 8  → 2nd carry-forward  (10-2)
--    D = 7  → 3rd carry-forward  (10-3)  … and so on
--    SEQ    → 2-digit sequence, stays same for life of project
--  Example chain:  P-26001 → P-27901 → P-28801 → P-29701
-- ============================================================

-- ── 1. NEW COLUMNS ON projects ──────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_year        smallint,          -- 26, 27 …
  ADD COLUMN IF NOT EXISTS project_seq         smallint,          -- 1-99, never changes
  ADD COLUMN IF NOT EXISTS carry_forward_count smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_carry_forward    boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_project_number text,          -- always P-YY0## origin
  ADD COLUMN IF NOT EXISTS parent_project_id   uuid REFERENCES projects(id),
  ADD COLUMN IF NOT EXISTS next_project_id     uuid REFERENCES projects(id),
  ADD COLUMN IF NOT EXISTS carry_forward_value numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoiced_amount     numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rolled_over_at      timestamptz;

-- ── 2. NEW COLUMNS ON purchase_orders ───────────────────────
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS revision_number  smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_carry_forward boolean  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_po_id  uuid REFERENCES purchase_orders(id);

-- ── 3. BACKFILL EXISTING PROJECTS with new fields ───────────
--  Pattern expected: P-26001 (length=7, format P-YYDDSS)
UPDATE projects
SET
  project_year = CASE
    WHEN project_number ~ '^P-[0-9]{5}$'
    THEN SUBSTRING(project_number, 3, 2)::smallint
    ELSE NULL
  END,
  project_seq = CASE
    WHEN project_number ~ '^P-[0-9]{5}$'
    THEN SUBSTRING(project_number, 6, 2)::smallint
    ELSE NULL
  END,
  carry_forward_count = CASE
    WHEN project_number ~ '^P-[0-9]{5}$'
    THEN CASE SUBSTRING(project_number, 5, 1)
      WHEN '0' THEN 0
      WHEN '9' THEN 1
      WHEN '8' THEN 2
      WHEN '7' THEN 3
      WHEN '6' THEN 4
      WHEN '5' THEN 5
      ELSE 0
    END
    ELSE 0
  END,
  is_carry_forward = CASE
    WHEN project_number ~ '^P-[0-9]{5}$'
      AND SUBSTRING(project_number, 5, 1) != '0'
    THEN true
    ELSE false
  END,
  original_project_number = COALESCE(original_project_number, project_number)
WHERE project_number IS NOT NULL;

-- ── 4. TRIGGER: keep projects.invoiced_amount in sync with invoices ──
CREATE OR REPLACE FUNCTION sync_project_invoiced_amount()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  affected_project_id uuid;
BEGIN
  -- Determine which project_id was affected
  IF TG_OP = 'DELETE' THEN
    affected_project_id := OLD.project_id;
  ELSE
    affected_project_id := NEW.project_id;
    -- If project_id changed, also update the old project
    IF TG_OP = 'UPDATE' AND OLD.project_id IS DISTINCT FROM NEW.project_id
       AND OLD.project_id IS NOT NULL THEN
      UPDATE projects
      SET invoiced_amount = (
        SELECT COALESCE(SUM(total_amount), 0)
        FROM invoices
        WHERE project_id = OLD.project_id
      )
      WHERE id = OLD.project_id;
    END IF;
  END IF;

  IF affected_project_id IS NOT NULL THEN
    UPDATE projects
    SET invoiced_amount = (
      SELECT COALESCE(SUM(total_amount), 0)
      FROM invoices
      WHERE project_id = affected_project_id
    )
    WHERE id = affected_project_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_invoiced_amount ON invoices;
CREATE TRIGGER trg_sync_invoiced_amount
  AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION sync_project_invoiced_amount();

-- Also initialise invoiced_amount for all existing projects right now
UPDATE projects p
SET invoiced_amount = (
  SELECT COALESCE(SUM(i.total_amount), 0)
  FROM invoices i
  WHERE i.project_id = p.id
);

-- ── 5. ROLLOVER FUNCTION ─────────────────────────────────────
--  Call: SELECT * FROM rollover_projects();           ← uses current year
--  Call: SELECT * FROM rollover_projects(2027);       ← force a specific year (admin override)
CREATE OR REPLACE FUNCTION rollover_projects(target_year int DEFAULT NULL)
RETURNS TABLE (
  old_project_number text,
  new_project_number text,
  project_name_out   text,
  carry_value        numeric,
  pos_count          int       -- purchase orders moved
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  curr_year     int  := COALESCE(target_year, EXTRACT(YEAR FROM NOW())::int);
  curr_yr_2     text := RIGHT(curr_year::text, 2);
  proj          RECORD;
  new_cf_count  int;
  new_d_digit   int;
  new_seq_pad   text;
  new_proj_num  text;
  new_proj_id   uuid;
  remain_val    numeric;
  po_moved      int;
BEGIN
  FOR proj IN
    SELECT *
    FROM   projects
    WHERE  status           = 'ACTIVE'
      AND  project_year     IS NOT NULL          -- only new-numbering projects
      AND  project_year     < curr_year          -- belongs to an earlier year
      AND  next_project_id  IS NULL              -- not already rolled over
    ORDER BY project_number
  LOOP
    -- ── Remaining value ──────────────────────────────────────
    remain_val := COALESCE(proj.carry_forward_value, 0)
                + COALESCE(proj.contract_value, 0)
                - COALESCE(proj.invoiced_amount, 0);

    IF remain_val <= 0 THEN
      -- Fully invoiced — just mark completed, no carry needed
      UPDATE projects SET status = 'COMPLETED', rolled_over_at = NOW()
      WHERE  id = proj.id;
      CONTINUE;
    END IF;

    -- ── New project number ────────────────────────────────────
    new_cf_count := COALESCE(proj.carry_forward_count, 0) + 1;
    new_d_digit  := 10 - new_cf_count;   -- 9 on 1st carry, 8 on 2nd …
    new_seq_pad  := LPAD(COALESCE(proj.project_seq, 1)::text, 2, '0');
    new_proj_num := 'P-' || curr_yr_2 || new_d_digit::text || new_seq_pad;

    -- ── Insert carry-forward project ──────────────────────────
    INSERT INTO projects (
      entity_id,
      project_number,    project_name,   project_type,
      contractor_id,     client_name,    department_id,
      pm_id,             supervisor_id,  project_manager,  supervisor_name,
      pm_email,          pm_phone,
      contractor_pm_name, contractor_pm_phone, contractor_pm_email,
      start_date,        description,
      -- carry-forward specific
      original_project_number, parent_project_id,
      carry_forward_count, project_seq, project_year,
      carry_forward_value, contract_value, invoiced_amount,
      is_carry_forward,
      status
    ) VALUES (
      proj.entity_id,
      new_proj_num,       proj.project_name,  proj.project_type,
      proj.contractor_id, proj.client_name,   proj.department_id,
      proj.pm_id,         proj.supervisor_id, proj.project_manager, proj.supervisor_name,
      proj.pm_email,      proj.pm_phone,
      proj.contractor_pm_name, proj.contractor_pm_phone, proj.contractor_pm_email,
      NOW()::date,        proj.description,
      COALESCE(proj.original_project_number, proj.project_number), proj.id,
      new_cf_count, proj.project_seq, curr_year,
      remain_val,   0,                0,
      true,
      'ACTIVE'
    )
    RETURNING id INTO new_proj_id;

    -- ── Mark old project ROLLED_OVER ──────────────────────────
    UPDATE projects
    SET    status          = 'ROLLED_OVER',
           rolled_over_at  = NOW(),
           next_project_id = new_proj_id
    WHERE  id = proj.id;

    -- ── Move active POs to new project + increment REV# ───────
    UPDATE purchase_orders
    SET    project_id      = new_proj_id,
           revision_number = COALESCE(revision_number, 0) + 1,
           is_carry_forward = true,
           original_po_id   = COALESCE(original_po_id, id)
    WHERE  project_id = proj.id
      AND  status NOT IN ('CLOSED','CANCELLED','COMPLETED');

    GET DIAGNOSTICS po_moved = ROW_COUNT;

    -- ── Return summary row ────────────────────────────────────
    old_project_number := proj.project_number;
    new_project_number := new_proj_num;
    project_name_out   := proj.project_name;
    carry_value        := remain_val;
    pos_count          := po_moved;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- ── 6. RLS on any new tables (projects already has RLS) ──────
-- purchase_orders should already have RLS; add policy if missing:
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'purchase_orders' AND policyname = 'po_all'
  ) THEN
    EXECUTE 'CREATE POLICY "po_all" ON purchase_orders FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- ── 7. pg_cron SCHEDULE (runs 00:01 on 1 January every year) ─
--  Requires pg_cron extension to be enabled in Supabase:
--  Dashboard → Database → Extensions → enable pg_cron
--
--  Then run these two lines:
--
--  SELECT cron.schedule(
--    'annual-project-rollover',
--    '1 0 1 1 *',
--    $$ SELECT rollover_projects(); $$
--  );
--
--  To verify it is registered:
--  SELECT * FROM cron.job WHERE jobname = 'annual-project-rollover';
--
--  To remove it:
--  SELECT cron.unschedule('annual-project-rollover');
--
--  NOTE: Supabase runs pg_cron in UTC. If your business operates in
--  AST (UTC+3), schedule at '1 21 31 12 *' to fire at 00:01 AST Jan 1.
