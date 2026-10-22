-- ══════════════════════════════════════════════════════════════════
-- RATAL GROUP — Employees additional columns + photo storage
-- Run this in Supabase → SQL Editor AFTER employees_dept_patch.sql
-- ══════════════════════════════════════════════════════════════════

-- Additional salary columns
ALTER TABLE employees ADD COLUMN IF NOT EXISTS technical_allowance  NUMERIC(14,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS mobile_allowance     NUMERIC(14,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS medical_allowance    NUMERIC(14,2) DEFAULT 0;

-- Employee photo
ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo_url           TEXT;

-- Banking
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(50);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS iban                VARCHAR(34);
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_portion        NUMERIC(14,2) DEFAULT 0;

-- Employment
ALTER TABLE employees ADD COLUMN IF NOT EXISTS contract_end_date   DATE;

-- ─── Create employee-photos storage bucket ──────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('employee-photos', 'employee-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Drop old policies first (safe — they may not exist yet)
DROP POLICY IF EXISTS "Auth users can upload employee photos"  ON storage.objects;
DROP POLICY IF EXISTS "Employee photos are publicly readable"  ON storage.objects;
DROP POLICY IF EXISTS "Auth users can update employee photos"  ON storage.objects;

-- Recreate clean
CREATE POLICY "Auth users can upload employee photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-photos');

CREATE POLICY "Employee photos are publicly readable"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'employee-photos');

CREATE POLICY "Auth users can update employee photos"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'employee-photos');

-- ─── DONE ───────────────────────────────────────────────────────
-- After running:
-- 1. Storage bucket 'employee-photos' is created and public
-- 2. Photo upload button in employee form will work
-- 3. Photo displays as avatar in list and view modal
