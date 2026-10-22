-- ============================================================
-- RATAL GROUP — VARCHAR FIX v3 (skips view-dependent columns)
-- Run in Supabase SQL Editor.
-- ============================================================

-- STEP 1: Try to widen every short VARCHAR — skip columns blocked by views
DO $$
DECLARE
  col RECORD;
BEGIN
  FOR col IN
    SELECT c.table_name, c.column_name, c.character_maximum_length
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON  t.table_schema = c.table_schema
      AND t.table_name   = c.table_name
      AND t.table_type   = 'BASE TABLE'
    WHERE c.table_schema             = 'public'
      AND c.data_type                = 'character varying'
      AND c.character_maximum_length IS NOT NULL
      AND c.character_maximum_length <= 30
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN %I TYPE VARCHAR(100)',
        col.table_name, col.column_name
      );
      RAISE NOTICE 'FIXED: %.% VARCHAR(%) → VARCHAR(100)',
        col.table_name, col.column_name, col.character_maximum_length;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'SKIPPED (view dep): %.% — %',
        col.table_name, col.column_name, SQLERRM;
    END;
  END LOOP;
END $$;

-- STEP 2: Confirm what (if anything) is still short
SELECT c.table_name, c.column_name, c.character_maximum_length
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
WHERE c.table_schema = 'public'
  AND c.data_type = 'character varying'
  AND c.character_maximum_length <= 30
ORDER BY c.character_maximum_length, c.table_name;

-- STEP 3: Show triggers on employees table
SELECT trigger_name, event_manipulation, action_timing, action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public' AND event_object_table = 'employees';

-- STEP 4: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
