-- Add site_master_id to food_allowances (links submission to the site it was claimed for)
ALTER TABLE food_allowances
  ADD COLUMN IF NOT EXISTS site_master_id UUID REFERENCES site_masters(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
