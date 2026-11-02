-- iqama_line_duration_patch.sql
-- Adds renewal_duration_months to iqama_renewal_lines (per-employee, not per-batch)
-- Safe to re-run (IF NOT EXISTS)
--
-- WHY: A single Sadad batch can contain employees with different renewal durations.
--      e.g. Employee A renews for 3 months, Employee B renews for 12 months.
--      The batch-level renewal_duration_months (in iqama_renewals) becomes a
--      "default" that pre-fills the Step 2 form; each line stores the actual duration.

ALTER TABLE iqama_renewal_lines
  ADD COLUMN IF NOT EXISTS renewal_duration_months INT DEFAULT 12;

-- 3 | 6 | 9 | 12 — Hijri lunar months per employee
-- Hijri-equivalent days: 89 / 177 / 266 / 354
-- Auto-suggests new expiry = current expiry + these days. PRO confirms actual from Absher.

COMMENT ON COLUMN iqama_renewal_lines.renewal_duration_months IS
  'Per-employee Hijri renewal period: 3, 6, 9 or 12 months (89/177/266/354 days). Each employee in the same batch can have a different duration. Actual expiry confirmed by PRO from Absher portal.';
