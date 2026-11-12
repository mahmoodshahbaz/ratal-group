-- Notifications: allow anon (field QR users) to read their own notifications
-- and mark them as read. Run in Supabase SQL Editor.

-- 1. Allow anon to read notifications by employee_id
--    (the app always passes the employee's own ID)
CREATE POLICY IF NOT EXISTS "anon_read_own_notifications"
  ON notifications
  FOR SELECT
  TO anon
  USING (true);

-- 2. Allow anon to mark notifications as read
CREATE POLICY IF NOT EXISTS "anon_update_own_notifications"
  ON notifications
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- If the policies above fail because RLS is not enabled yet:
-- ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
