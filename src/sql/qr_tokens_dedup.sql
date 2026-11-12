-- QR Token Deduplication
-- Keeps only the latest token per employee (by generated_at),
-- marks all older ones as revoked.
-- Run once in Supabase SQL Editor to clean up duplicates from bulk generation.

UPDATE qr_tokens
SET is_active  = false,
    revoked_at = now()
WHERE id NOT IN (
  -- latest token per employee
  SELECT DISTINCT ON (employee_id) id
  FROM qr_tokens
  WHERE employee_id IS NOT NULL
  ORDER BY employee_id, generated_at DESC
)
AND employee_id IS NOT NULL
AND is_active = true;
