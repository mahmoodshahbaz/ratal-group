-- Add vendor_type to contractors table
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS vendor_type VARCHAR(20) DEFAULT 'CONTRACTOR';
ALTER TABLE contractors ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);

-- Copy contractor_name → company_name for existing rows
UPDATE contractors SET company_name = contractor_name WHERE company_name IS NULL;

-- vendor_type values: CONTRACTOR | VENDOR | SUPPLIER | SUB_CONTRACTOR
