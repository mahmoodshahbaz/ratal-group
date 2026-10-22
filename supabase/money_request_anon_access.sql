-- Grant anon (field form) read access to tables used by Money Request form
GRANT SELECT ON TABLE departments        TO anon;
GRANT SELECT ON TABLE employees          TO anon;
GRANT SELECT ON TABLE contractors        TO anon;
GRANT SELECT ON TABLE projects           TO anon;
GRANT SELECT ON TABLE party_bank_accounts TO anon;
GRANT SELECT ON TABLE chart_of_accounts  TO anon;

-- Allow anon to INSERT money requests (field form submissions)
GRANT INSERT ON TABLE money_requests      TO anon;
GRANT INSERT ON TABLE money_request_lines TO anon;

-- RLS policies (all wrapped in DO block — CREATE POLICY IF NOT EXISTS is not valid SQL)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='departments' AND policyname='anon read departments') THEN
    EXECUTE 'CREATE POLICY "anon read departments" ON departments FOR SELECT TO anon USING (is_active = true)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='employees' AND policyname='anon read employees') THEN
    EXECUTE 'CREATE POLICY "anon read employees" ON employees FOR SELECT TO anon USING (is_active = true)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contractors' AND policyname='anon read contractors') THEN
    EXECUTE 'CREATE POLICY "anon read contractors" ON contractors FOR SELECT TO anon USING (status IN (''ACTIVE'',''OPEN''))';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='projects' AND policyname='anon read projects') THEN
    EXECUTE 'CREATE POLICY "anon read projects" ON projects FOR SELECT TO anon USING (status IN (''OPEN'',''ACTIVE''))';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='party_bank_accounts' AND policyname='anon read party_bank_accounts') THEN
    EXECUTE 'CREATE POLICY "anon read party_bank_accounts" ON party_bank_accounts FOR SELECT TO anon USING (true)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='chart_of_accounts' AND policyname='anon read chart_of_accounts') THEN
    EXECUTE 'CREATE POLICY "anon read chart_of_accounts" ON chart_of_accounts FOR SELECT TO anon USING (is_active = true)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='money_requests' AND policyname='anon insert money_requests') THEN
    EXECUTE 'CREATE POLICY "anon insert money_requests" ON money_requests FOR INSERT TO anon WITH CHECK (true)';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='money_request_lines' AND policyname='anon insert money_request_lines') THEN
    EXECUTE 'CREATE POLICY "anon insert money_request_lines" ON money_request_lines FOR INSERT TO anon WITH CHECK (true)';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
