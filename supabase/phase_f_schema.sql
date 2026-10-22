-- ============================================================
-- ACCSYS PHASE F SCHEMA — Field Notifications
-- Run AFTER phase_d_schema.sql
-- Safe to re-run (IF NOT EXISTS / OR REPLACE)
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- Patch notifications: add delivered_at column
-- Lets the edge function mark successful Telegram delivery
-- ────────────────────────────────────────────────────────────
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- ────────────────────────────────────────────────────────────
-- Ensure employees has telegram_chat_id (should already exist)
-- ────────────────────────────────────────────────────────────
ALTER TABLE employees ADD COLUMN IF NOT EXISTS telegram_chat_id text;

-- ────────────────────────────────────────────────────────────
-- Index for fast employee lookup in the edge function
-- ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_emp_telegram ON employees(telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notif_employee_unread
  ON notifications(employee_id, is_read)
  WHERE is_read = false;

-- ────────────────────────────────────────────────────────────
-- RLS for notifications (anon can insert, employee can read own)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "anon insert notifications" ON notifications;
CREATE POLICY "anon insert notifications" ON notifications
  FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS "anon select notifications" ON notifications;
CREATE POLICY "anon select notifications" ON notifications
  FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "anon update notifications" ON notifications;
CREATE POLICY "anon update notifications" ON notifications
  FOR UPDATE TO anon USING (true);

-- ────────────────────────────────────────────────────────────
-- DATABASE WEBHOOK SETUP (run in Supabase Dashboard)
-- Dashboard → Database → Webhooks → Create Webhook
--
-- Name:    field-notify
-- Table:   public.notifications
-- Events:  INSERT
-- Method:  POST
-- URL:     https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/field-notify
-- Headers:
--   Content-Type: application/json
--   Authorization: Bearer <YOUR_ANON_KEY>
--
-- The service_role key is accessed inside the function via
-- Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') — Supabase injects
-- it automatically. You do NOT need to put it in the webhook header.
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- OPTIONAL: test the function manually from Supabase SQL Editor
-- Insert a test notification for an employee who has a telegram_chat_id set:
--
-- INSERT INTO notifications (entity_id, employee_id, type, title, body, metadata)
-- SELECT
--   e.entity_id,
--   e.id,
--   'GENERAL',
--   'Test Notification',
--   'This is a test from the field-notify edge function.',
--   '{}'::jsonb
-- FROM employees e
-- WHERE e.telegram_chat_id IS NOT NULL
-- LIMIT 1;
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- HOW TO SET EMPLOYEE TELEGRAM CHAT IDs
-- ────────────────────────────────────────────────────────────
-- Each employee must send /start to your Telegram bot once.
-- The bot returns their chat ID. Update it in the employees table:
--
-- UPDATE employees SET telegram_chat_id = '123456789' WHERE id = '<employee-uuid>';
--
-- Or add a "Telegram Chat ID" field in the Employees page of the system.
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- DONE
-- ────────────────────────────────────────────────────────────
