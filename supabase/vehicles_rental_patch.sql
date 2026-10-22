-- ══════════════════════════════════════════════════════════════════
-- VEHICLES — Rental & Ownership fields patch
-- Run in Supabase SQL Editor → New Query → Run
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS ownership_type  TEXT NOT NULL DEFAULT 'OWN',  -- OWN | RENT
  ADD COLUMN IF NOT EXISTS rental_company  TEXT,
  ADD COLUMN IF NOT EXISTS rental_vat_no   TEXT,
  ADD COLUMN IF NOT EXISTS rent_start      DATE,
  ADD COLUMN IF NOT EXISTS rent_end        DATE,
  ADD COLUMN IF NOT EXISTS rate_daily      NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rate_monthly    NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS km_per_day      INT           DEFAULT 0,
  ADD COLUMN IF NOT EXISTS km_per_month    INT           DEFAULT 0;

-- Index for filtering by type
CREATE INDEX IF NOT EXISTS idx_vehicles_ownership ON vehicles(entity_id, ownership_type);
