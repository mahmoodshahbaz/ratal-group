-- vehicles_rental_patch.sql
-- Adds rental tracking columns to vehicles table
-- Run once in Supabase SQL Editor

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS km_extra_rate        numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rental_contractor_id uuid          REFERENCES contractors(id) ON DELETE SET NULL;

COMMENT ON COLUMN vehicles.km_extra_rate        IS 'Extra mileage rate in SAR per km beyond the allowed daily/monthly limit (rental vehicles only)';
COMMENT ON COLUMN vehicles.rental_contractor_id IS 'FK to contractors table — links rental vehicle to payable party for AP tracking';

-- Index for payables lookups
CREATE INDEX IF NOT EXISTS idx_vehicles_rental_contractor ON vehicles(rental_contractor_id)
  WHERE rental_contractor_id IS NOT NULL;
