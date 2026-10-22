-- ============================================================
--  Outgoing PO — Job Types & Equipment Rental contractor type
--  Run in Supabase SQL editor
-- ============================================================

-- 1. Add EQUIPMENT_RENTAL to contractor type (if using an enum)
--    If contractor_type is a plain text column this block is safe to skip.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'contractor_type_enum'
  ) THEN
    ALTER TYPE contractor_type_enum ADD VALUE IF NOT EXISTS 'EQUIPMENT_RENTAL';
  END IF;
END$$;

-- 2. Create po_job_types table
CREATE TABLE IF NOT EXISTS po_job_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       uuid REFERENCES entities(id) ON DELETE CASCADE,
  contractor_type text NOT NULL,   -- SUB_CONTRACTOR | SUPPLIER | VENDOR | LOCAL_SUPPLIER | EQUIPMENT_RENTAL
  job_type_name   text NOT NULL,
  sort_order      int  NOT NULL DEFAULT 99,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (entity_id, contractor_type, job_type_name)
);

-- RLS: open for authenticated users (tighten per your auth setup if needed)
ALTER TABLE po_job_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated users can manage job types"
  ON po_job_types FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. Seed job types (entity_id = NULL → global defaults, visible to all entities)
--    These are templates; per-entity additions will have entity_id set.
INSERT INTO po_job_types (entity_id, contractor_type, job_type_name, sort_order) VALUES

-- Sub-Contractor
(NULL, 'SUB_CONTRACTOR', 'Civil',             1),
(NULL, 'SUB_CONTRACTOR', 'Fencing',           2),
(NULL, 'SUB_CONTRACTOR', 'Excavation',        3),
(NULL, 'SUB_CONTRACTOR', 'Lean Concrete',     4),
(NULL, 'SUB_CONTRACTOR', 'Compaction',        5),
(NULL, 'SUB_CONTRACTOR', 'Commissioning',     6),
(NULL, 'SUB_CONTRACTOR', 'UTP Cabling',       7),
(NULL, 'SUB_CONTRACTOR', 'Fiber Cabling',     8),
(NULL, 'SUB_CONTRACTOR', 'Fiber Pulling',     9),
(NULL, 'SUB_CONTRACTOR', 'Trenching',        10),
(NULL, 'SUB_CONTRACTOR', 'Transportation',   11),

-- Supplier
(NULL, 'SUPPLIER', 'Cement',   1),
(NULL, 'SUPPLIER', 'Steel',    2),
(NULL, 'SUPPLIER', 'Gravel',   3),
(NULL, 'SUPPLIER', 'Concrete', 4),
(NULL, 'SUPPLIER', 'Water',    5),

-- Vendor
(NULL, 'VENDOR', 'Router',             1),
(NULL, 'VENDOR', 'Switches',           2),
(NULL, 'VENDOR', 'Servers',            3),
(NULL, 'VENDOR', 'SFPs',               4),
(NULL, 'VENDOR', 'Line Cards',         5),
(NULL, 'VENDOR', 'Licenses',           6),
(NULL, 'VENDOR', 'Mobiles',            7),
(NULL, 'VENDOR', 'Laptops',            8),
(NULL, 'VENDOR', 'Printers',           9),
(NULL, 'VENDOR', 'Printer Cartridges',10),
(NULL, 'VENDOR', 'Scanners',          11),
(NULL, 'VENDOR', 'Computers',         12),

-- Local Supplier
(NULL, 'LOCAL_SUPPLIER', 'Tea Bags',         1),
(NULL, 'LOCAL_SUPPLIER', 'Coffee',           2),
(NULL, 'LOCAL_SUPPLIER', 'Coffee Mate',      3),
(NULL, 'LOCAL_SUPPLIER', 'Milk',             4),
(NULL, 'LOCAL_SUPPLIER', 'Sugar',            5),
(NULL, 'LOCAL_SUPPLIER', 'Trash Bags',       6),
(NULL, 'LOCAL_SUPPLIER', 'Washing Liquid',   7),
(NULL, 'LOCAL_SUPPLIER', 'Tissues',          8),
(NULL, 'LOCAL_SUPPLIER', 'Stationery',       9),

-- Equipment Rentals
(NULL, 'EQUIPMENT_RENTAL', 'UTP Testers',        1),
(NULL, 'EQUIPMENT_RENTAL', 'Fiber Testers',       2),
(NULL, 'EQUIPMENT_RENTAL', 'Splicing Machines',   3),
(NULL, 'EQUIPMENT_RENTAL', 'Jumpoles',            4),
(NULL, 'EQUIPMENT_RENTAL', 'Cars',                5),
(NULL, 'EQUIPMENT_RENTAL', 'Pickups',             6),
(NULL, 'EQUIPMENT_RENTAL', 'Crane',               7)

ON CONFLICT (entity_id, contractor_type, job_type_name) DO NOTHING;

-- 4. Add job_type column to outgoing_po_items (if not already there)
ALTER TABLE outgoing_po_items
  ADD COLUMN IF NOT EXISTS job_type text;
