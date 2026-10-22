-- ═══════════════════════════════════════════════════════════════════
-- CRM Patch — Ratal Group
-- Creates:
--   crm_leads        — enquiries and prospects in a pipeline
--   crm_interactions — call/email/meeting log per lead
-- Run once in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- ── 1. crm_leads ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,

  -- Contact info
  contact_name    TEXT NOT NULL,
  company_name    TEXT,
  email           TEXT,
  phone           TEXT,
  nationality     TEXT,
  city            TEXT,
  country         TEXT DEFAULT 'Saudi Arabia',

  -- Lead details
  lead_source     TEXT DEFAULT 'DIRECT',
  -- DIRECT | REFERRAL | WALK_IN | PHONE | EMAIL | WEBSITE | SOCIAL_MEDIA | BSP | OTHER

  lead_type       TEXT DEFAULT 'INDIVIDUAL',
  -- INDIVIDUAL | CORPORATE | GROUP | AIRLINE_CREW | GOVERNMENT

  travel_type     TEXT,
  -- FLIGHT | HOTEL | PACKAGE | VISA | UMRAH | HAJJ | CORPORATE | OTHER

  destination     TEXT,
  travel_date     DATE,
  return_date     DATE,
  pax_count       INTEGER DEFAULT 1,

  -- Pipeline stage
  stage           TEXT NOT NULL DEFAULT 'NEW',
  -- NEW | CONTACTED | QUALIFIED | QUOTED | NEGOTIATING | WON | LOST | DORMANT

  -- Value
  estimated_value NUMERIC(14,2) DEFAULT 0,
  currency        TEXT DEFAULT 'SAR',
  won_amount      NUMERIC(14,2),    -- actual booking value if WON

  -- Assignment
  assigned_to     UUID REFERENCES employees(id) ON DELETE SET NULL,
  assigned_name   TEXT,
  department      TEXT,

  -- Follow-up
  next_follow_up  DATE,
  last_contact_at TIMESTAMPTZ,

  -- Outcome
  won_lost_reason TEXT,
  customer_id     UUID,            -- link to customers table if converted

  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE crm_leads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_leads' AND policyname='entity_scope') THEN
    CREATE POLICY entity_scope ON crm_leads
      USING (entity_id IN (SELECT entity_id FROM user_profiles WHERE id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_entity   ON crm_leads(entity_id);
CREATE INDEX IF NOT EXISTS idx_crm_stage    ON crm_leads(entity_id, stage);
CREATE INDEX IF NOT EXISTS idx_crm_assigned ON crm_leads(entity_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_followup ON crm_leads(entity_id, next_follow_up);
CREATE INDEX IF NOT EXISTS idx_crm_source   ON crm_leads(entity_id, lead_source);

DROP TRIGGER IF EXISTS crm_leads_updated_at ON crm_leads;
CREATE TRIGGER crm_leads_updated_at
  BEFORE UPDATE ON crm_leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 2. crm_interactions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_interactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  lead_id         UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,

  interaction_type TEXT NOT NULL DEFAULT 'CALL',
  -- CALL | EMAIL | WHATSAPP | MEETING | QUOTE_SENT | FOLLOW_UP | NOTE | OTHER

  interaction_date TIMESTAMPTZ DEFAULT NOW(),
  summary         TEXT NOT NULL,
  outcome         TEXT,
  -- INTERESTED | NOT_INTERESTED | CALLBACK | QUOTED | BOOKED | NO_ANSWER | OTHER

  next_action     TEXT,
  next_action_date DATE,

  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE crm_interactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='crm_interactions' AND policyname='entity_scope') THEN
    CREATE POLICY entity_scope ON crm_interactions
      USING (entity_id IN (SELECT entity_id FROM user_profiles WHERE id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crmi_entity ON crm_interactions(entity_id);
CREATE INDEX IF NOT EXISTS idx_crmi_lead   ON crm_interactions(lead_id);
CREATE INDEX IF NOT EXISTS idx_crmi_date   ON crm_interactions(entity_id, interaction_date DESC);

SELECT 'CRM patch applied successfully' AS result;
