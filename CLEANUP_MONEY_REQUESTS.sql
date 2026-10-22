-- ============================================================
-- CLEANUP: Delete all Money Request data
-- Deletes in dependency order to avoid FK violations
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Distributions (depends on money_requests)
DELETE FROM money_distributions;

-- 2. Lines (depends on money_requests — also covered by CASCADE but explicit is safer)
DELETE FROM money_request_lines;

-- 3. Received payments (depends on money_requests)
DELETE FROM money_received;

-- 4. Money Requests (parent)
DELETE FROM money_requests;

-- Confirm counts (should all be 0)
SELECT 'money_requests'      AS tbl, COUNT(*) FROM money_requests
UNION ALL
SELECT 'money_request_lines' AS tbl, COUNT(*) FROM money_request_lines
UNION ALL
SELECT 'money_received'      AS tbl, COUNT(*) FROM money_received
UNION ALL
SELECT 'money_distributions' AS tbl, COUNT(*) FROM money_distributions;
