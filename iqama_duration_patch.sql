-- iqama_duration_patch.sql
-- Adds renewal_duration_months to iqama_renewals
-- Safe to re-run (IF NOT EXISTS)

ALTER TABLE iqama_renewals
  ADD COLUMN IF NOT EXISTS renewal_duration_months INT DEFAULT 12;

-- 3 | 6 | 9 | 12 — Hijri lunar months
-- New expiry = current expiry + Hijri-equivalent days (89 / 177 / 266 / 354)
-- This is a hint only; PRO enters actual Gregorian date from Absher after renewal.

COMMENT ON COLUMN iqama_renewals.renewal_duration_months IS
  '3, 6, 9 or 12 Hijri months. Used to auto-suggest new expiry dates: 89/177/266/354 days respectively. Actual date confirmed by PRO from Absher portal.';
