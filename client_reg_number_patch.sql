-- client_reg_number_patch.sql
-- Adds client_reg_number column to contractors table
-- This stores the registration / vendor code the party has assigned to Ratal
-- Run once in Supabase SQL Editor

ALTER TABLE contractors
  ADD COLUMN IF NOT EXISTS client_reg_number text;

COMMENT ON COLUMN contractors.client_reg_number IS
  'Registration number or vendor code assigned to Ratal by this contractor/supplier — e.g. the supplier number they use when issuing invoices to us.';
