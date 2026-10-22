-- Grant anon (field form) read access to tables used by Field PO Request form
GRANT SELECT ON TABLE departments     TO anon;
GRANT SELECT ON TABLE employees       TO anon;
GRANT SELECT ON TABLE projects        TO anon;
GRANT SELECT ON TABLE site_masters    TO anon;
GRANT SELECT ON TABLE contractors     TO anon;
GRANT SELECT ON TABLE po_job_types    TO anon;

-- Allow anon to INSERT outgoing POs (field form submissions)
GRANT INSERT ON TABLE outgoing_pos      TO anon;
GRANT INSERT ON TABLE outgoing_po_items TO anon;

-- Allow anon to call the PO sequence RPC
GRANT EXECUTE ON FUNCTION next_po_sequence(uuid, int) TO anon;

-- RLS policies (safe: each wrapped in DO block to avoid duplicate errors)
DO $$ BEGIN
  -- departments
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='departments' AND policyname='anon read departments') THEN
    EXECUTE 'CREATE POLICY "anon read departments" ON departments FOR SELECT TO anon USING (is_active = true)';
  END IF;

  -- employees
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='employees' AND policyname='anon read employees') THEN
    EXECUTE 'CREATE POLICY "anon read employees" ON employees FOR SELECT TO anon USING (is_active = true)';
  END IF;

  -- projects
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='anon read projects') THEN
    EXECUTE 'CREATE POLICY "anon read projects" ON projects FOR SELECT TO anon USING (status IN (''OPEN'',''ACTIVE''))';
  END IF;

  -- site_masters
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='site_masters' AND policyname='anon read site_masters') THEN
    EXECUTE 'CREATE POLICY "anon read site_masters" ON site_masters FOR SELECT TO anon USING (true)';
  END IF;

  -- contractors
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contractors' AND policyname='anon read contractors') THEN
    EXECUTE 'CREATE POLICY "anon read contractors" ON contractors FOR SELECT TO anon USING (status IN (''ACTIVE'',''OPEN''))';
  END IF;

  -- po_job_types
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='po_job_types' AND policyname='anon read po_job_types') THEN
    EXECUTE 'CREATE POLICY "anon read po_job_types" ON po_job_types FOR SELECT TO anon USING (is_active = true)';
  END IF;

  -- outgoing_pos insert
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='outgoing_pos' AND policyname='anon insert outgoing_pos') THEN
    EXECUTE 'CREATE POLICY "anon insert outgoing_pos" ON outgoing_pos FOR INSERT TO anon WITH CHECK (true)';
  END IF;

  -- outgoing_po_items insert
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='outgoing_po_items' AND policyname='anon insert outgoing_po_items') THEN
    EXECUTE 'CREATE POLICY "anon insert outgoing_po_items" ON outgoing_po_items FOR INSERT TO anon WITH CHECK (true)';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
