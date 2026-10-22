-- ============================================================
--  DATABASE WEBHOOKS — Telegram Notifications
--  Run this in Supabase SQL Editor AFTER deploying the Edge Function
--
--  Replace YOUR_EDGE_FUNCTION_URL with:
--  https://<your-project-ref>.supabase.co/functions/v1/telegram-notify
-- ============================================================

-- NOTE: Supabase webhooks are configured via Dashboard UI:
-- Dashboard → Database → Webhooks → Create new webhook

-- OR use pg_net (if available) to call the function directly from triggers:

-- First, enable pg_net extension:
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── WEBHOOK TRIGGER FUNCTION ──────────────────────────────────
-- Replace the URL below with your actual Edge Function URL
CREATE OR REPLACE FUNCTION notify_telegram()
RETURNS TRIGGER AS $$
DECLARE
  edge_function_url TEXT := 'https://qjwqoqvbfygmymtiqfnt.supabase.co/functions/v1/telegram-notify';
  payload JSONB;
BEGIN
  payload := jsonb_build_object(
    'type',   TG_OP,
    'table',  TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', row_to_json(NEW),
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
  );

  -- Only fire on meaningful status changes
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM net.http_post(
      url     := edge_function_url,
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.service_role_key', TRUE) || '"}'::jsonb,
      body    := payload::text
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── TRIGGERS ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_telegram_money_request  ON money_requests;
DROP TRIGGER IF EXISTS trg_telegram_purchase_order ON purchase_orders;
DROP TRIGGER IF EXISTS trg_telegram_expense        ON expenses;
DROP TRIGGER IF EXISTS trg_telegram_overtime       ON overtime_submissions;
DROP TRIGGER IF EXISTS trg_telegram_food           ON food_allowances;

CREATE TRIGGER trg_telegram_money_request
  AFTER INSERT OR UPDATE OF status ON money_requests
  FOR EACH ROW EXECUTE FUNCTION notify_telegram();

CREATE TRIGGER trg_telegram_purchase_order
  AFTER INSERT OR UPDATE OF status ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION notify_telegram();

CREATE TRIGGER trg_telegram_expense
  AFTER INSERT ON expenses
  FOR EACH ROW EXECUTE FUNCTION notify_telegram();

CREATE TRIGGER trg_telegram_overtime
  AFTER INSERT ON overtime_submissions
  FOR EACH ROW EXECUTE FUNCTION notify_telegram();

CREATE TRIGGER trg_telegram_food
  AFTER INSERT ON food_allowances
  FOR EACH ROW EXECUTE FUNCTION notify_telegram();

-- ============================================================
-- ALTERNATIVE: Use Supabase Dashboard UI
-- Dashboard → Database → Webhooks → Create Webhook
-- Name: telegram-notify
-- Table: money_requests
-- Events: INSERT, UPDATE
-- Type: HTTP Request
-- URL: https://qjwqoqvbfygmymtiqfnt.supabase.co/functions/v1/telegram-notify
-- Headers: Authorization: Bearer <service_role_key>
-- Repeat for: purchase_orders, expenses, overtime_submissions, food_allowances
-- ============================================================
