-- Migration: add allow_fa / allow_ot / allow_others to site_assignments
-- Run this once in Supabase SQL Editor

ALTER TABLE site_assignments
  ADD COLUMN IF NOT EXISTS allow_fa     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_ot     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_others boolean NOT NULL DEFAULT true;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
