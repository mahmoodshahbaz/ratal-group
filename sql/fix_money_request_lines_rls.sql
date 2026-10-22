-- Fix: allow authenticated users to INSERT/SELECT money_request_lines
-- Run each block separately if one already exists

DO $$
BEGIN
  -- INSERT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'money_request_lines'
      AND policyname = 'auth users can insert money_request_lines'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "auth users can insert money_request_lines"
        ON money_request_lines
        FOR INSERT
        TO authenticated
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM money_requests
            WHERE id = money_request_id
              AND entity_id IS NOT NULL
          )
        )
    $pol$;
  END IF;

  -- SELECT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'money_request_lines'
      AND policyname = 'auth users can select money_request_lines'
  ) THEN
    EXECUTE $pol$
      CREATE POLICY "auth users can select money_request_lines"
        ON money_request_lines
        FOR SELECT
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM money_requests
            WHERE id = money_request_id
          )
        )
    $pol$;
  END IF;
END
$$;
