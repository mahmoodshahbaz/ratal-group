-- Check which columns actually exist on the employees table
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'employees'
  AND table_schema = 'public'
ORDER BY ordinal_position;
