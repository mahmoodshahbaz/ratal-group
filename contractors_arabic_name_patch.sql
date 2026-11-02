-- contractors_arabic_name_patch.sql
-- Adds Arabic name column to contractors table
-- Run once in Supabase SQL Editor

ALTER TABLE contractors
  ADD COLUMN IF NOT EXISTS contractor_name_ar text;

COMMENT ON COLUMN contractors.contractor_name_ar IS 'Arabic name of the contractor / party — displayed in RTL collapsible detail view';
