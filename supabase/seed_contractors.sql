-- ============================================================
--  SEED DATA — Contractors & Airlines
--  Run AFTER schema.sql
--  Adjust entity_id for ACCSYS after schema is applied
-- ============================================================

-- Get ACCSYS entity ID
DO $$
DECLARE
  accsys_id UUID;
  rat_id UUID;
  gwt_id UUID;
BEGIN
  SELECT id INTO accsys_id FROM entities WHERE entity_code = 'ACCSYS';
  SELECT id INTO rat_id    FROM entities WHERE entity_code = 'RAT';
  SELECT id INTO gwt_id    FROM entities WHERE entity_code = 'GWT';

  -- ─── CONTRACTORS (Tier 2) for ACCSYS ───
  INSERT INTO contractors (entity_id, contractor_code, contractor_name)
  VALUES
    (accsys_id, 'NOKIA',    'Nokia Solutions and Networks'),
    (accsys_id, 'CISCO',    'Cisco Systems'),
    (accsys_id, 'HUAWEI',   'Huawei Technologies'),
    (accsys_id, 'ZTE',      'ZTE Corporation'),
    (accsys_id, 'SBM',      'SBM Networks'),
    (accsys_id, 'BMC',      'BMC Solutions'),
    (accsys_id, 'MIS',      'MIS Arabia'),
    (accsys_id, 'SOLS',     'Solutions by STC'),
    (accsys_id, 'MOBI',     'Mobi Serve'),
    (accsys_id, 'SHBK',     'Shbakath'),
    (accsys_id, 'JNPR',     'Juniper Networks'),
    (accsys_id, 'ERIC',     'Ericsson')
  ON CONFLICT DO NOTHING;

  -- ─── END CUSTOMERS (Tier 1) for ACCSYS ───
  INSERT INTO customers (entity_id, name_en, customer_type)
  VALUES
    (accsys_id, 'STC - Saudi Telecom Company',     'TELECOM'),
    (accsys_id, 'Mobily - Etihad Etisalat',        'TELECOM'),
    (accsys_id, 'Zain Saudi Arabia',               'TELECOM'),
    (accsys_id, 'TAWAL',                           'TELECOM'),
    (accsys_id, 'Ministry of Interior',            'GOVERNMENT'),
    (accsys_id, 'Ministry of Health',              'GOVERNMENT'),
    (accsys_id, 'Ministry of Education',           'GOVERNMENT')
  ON CONFLICT DO NOTHING;

  -- ─── AIRLINES (shared — linked to RAT) ───
  INSERT INTO airlines (entity_id, airline_code, numeric_code, airline_name, route_type, comm_tier_1, comm_tier_2, comm_tier_3, comm_tier_4)
  VALUES
    (rat_id, 'SV', '065', 'Saudia',                    'INT', 5.0, 4.0, 3.0, 3.0),
    (rat_id, 'EK', '176', 'Emirates',                  'INT', 5.0, 4.0, 2.0, 2.0),
    (rat_id, 'EY', '607', 'Etihad Airways',            'INT', 5.0, 4.0, 2.0, 2.0),
    (rat_id, 'QR', '157', 'Qatar Airways',             'INT', 5.0, 4.0, 2.0, 2.0),
    (rat_id, 'GF', '072', 'Gulf Air',                  'INT', 4.0, 3.0, 2.0, 2.0),
    (rat_id, 'FZ', '141', 'flydubai',                  'INT', 3.0, 2.0, 1.0, 1.0),
    (rat_id, 'G9', '375', 'Air Arabia',                'INT', 3.0, 2.0, 1.0, 1.0),
    (rat_id, 'PK', '214', 'Pakistan International',    'INT', 5.0, 4.0, 3.0, 3.0),
    (rat_id, 'AI', '098', 'Air India',                 'INT', 5.0, 4.0, 3.0, 3.0),
    (rat_id, 'BA', '125', 'British Airways',           'INT', 5.0, 4.0, 2.0, 2.0),
    (rat_id, 'LH', '220', 'Lufthansa',                'INT', 5.0, 4.0, 2.0, 2.0),
    (rat_id, 'TK', '235', 'Turkish Airlines',          'INT', 5.0, 4.0, 2.0, 2.0),
    (rat_id, 'MS', '077', 'EgyptAir',                  'INT', 5.0, 4.0, 3.0, 3.0),
    (rat_id, 'XY', '512', 'flynas',                    'DOM', 0.0, 0.0, 0.0, 0.0),
    (rat_id, 'F3', '726', 'flyadeal',                  'DOM', 0.0, 0.0, 0.0, 0.0)
  ON CONFLICT DO NOTHING;

  -- Copy airlines to GWT too
  INSERT INTO airlines (entity_id, airline_code, numeric_code, airline_name, route_type, comm_tier_1, comm_tier_2, comm_tier_3, comm_tier_4)
  SELECT gwt_id, airline_code, numeric_code, airline_name, route_type, comm_tier_1, comm_tier_2, comm_tier_3, comm_tier_4
  FROM airlines WHERE entity_id = rat_id
  ON CONFLICT DO NOTHING;

END $$;
