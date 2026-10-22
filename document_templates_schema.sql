-- ============================================================
--  ACCSYS — Document Templates Schema
--  Run in Supabase SQL Editor ONCE.
--  Creates the unified template store for all HTML documents.
-- ============================================================

CREATE TABLE IF NOT EXISTS document_templates (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id      UUID        REFERENCES entities(id) ON DELETE CASCADE,
  category       TEXT        NOT NULL CHECK (category IN (
                               'INVOICE','BUSINESS_EVENT','FIELD_OPS','HR','PROCUREMENT','FINANCE'
                             )),
  template_key   TEXT        NOT NULL,
  template_name  TEXT        NOT NULL,
  language       TEXT        NOT NULL DEFAULT 'EN'
                             CHECK (language IN ('EN','AR','BILINGUAL')),
  description    TEXT,
  compiled_html  TEXT,                         -- stored A4 HTML with {{placeholders}}
  drive_folder   TEXT,                         -- target Google Drive subfolder for PDFs
  placeholders   JSONB,                        -- list of placeholder keys for UI hints
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  sort_order     INT         NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_id, template_key),
  UNIQUE (template_key)                        -- global keys, entity_id nullable for shared
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_document_templates_ts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_doc_tpl_ts ON document_templates;
CREATE TRIGGER trg_doc_tpl_ts
  BEFORE UPDATE ON document_templates
  FOR EACH ROW EXECUTE FUNCTION update_document_templates_ts();

-- ── Seed: all template keys (compiled_html populated later via Template Library) ──
INSERT INTO document_templates
  (category, template_key, template_name, language, description, drive_folder, sort_order)
VALUES
  -- ── INVOICES ─────────────────────────────────────────────────────────────
  ('INVOICE',       'invoice_accsys_bilingual',  'ACCSYS Tax Invoice — Bilingual',   'BILINGUAL', 'Bilingual EN+AR invoice for Ratal Advanced Technologies',        'invoices/ACCSYS',      10),
  ('INVOICE',       'invoice_accsys_en',         'ACCSYS Tax Invoice — English',     'EN',        'English-only invoice for Ratal Advanced Technologies',           'invoices/ACCSYS',      20),
  ('INVOICE',       'invoice_rat_standard',      'Ratal Tours Invoice',              'EN',        'Standard invoice for Ratal Tours & Travels',                     'invoices/RAT',         30),
  ('INVOICE',       'invoice_gwt_standard',      'Green Wings Invoice',              'EN',        'Standard invoice for Green Wings Travel & Tourism',              'invoices/GWT',         40),

  -- ── BUSINESS EVENTS ──────────────────────────────────────────────────────
  ('BUSINESS_EVENT','money_request',             'Money Request',                    'EN',        'Internal money / cash request memo',                             'business-events/money-requests', 10),
  ('BUSINESS_EVENT','outgoing_po',              'Outgoing Purchase Order',           'EN',        'Client-facing or vendor PO document',                            'business-events/pos',  20),
  ('BUSINESS_EVENT','payment_instruction',      'Payment Instruction',              'EN',        'Payment instruction letter to bank / finance',                   'business-events/payments', 30),
  ('BUSINESS_EVENT','new_vehicle_request',      'New Vehicle Request',              'EN',        'Vehicle requisition form',                                       'business-events/vehicles', 40),
  ('BUSINESS_EVENT','new_project_form',         'New Project Form',                 'EN',        'Project creation / onboarding document',                         'business-events/projects', 50),

  -- ── FIELD OPERATIONS ─────────────────────────────────────────────────────
  ('FIELD_OPS',     'subcon_payment_cert',       'SubCon Payment Certificate',       'EN',        'Sub-contractor payment certificate signed off per milestone',     'field-ops/subcon',     10),
  ('FIELD_OPS',     'ot_summary',               'OT Summary',                       'EN',        'Monthly overtime summary sheet per employee / site',             'field-ops/ot',         20),
  ('FIELD_OPS',     'food_allowance_claim',      'Food Allowance Summary',           'EN',        'Monthly food allowance claim summary',                           'field-ops/food',       30),
  ('FIELD_OPS',     'expense_claim',             'Expense Claim',                    'EN',        'Employee expense reimbursement claim form',                       'field-ops/expenses',   40)

ON CONFLICT (template_key) DO NOTHING;

-- RLS: allow authenticated users to read, restrict writes to service role
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_templates_read" ON document_templates
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "doc_templates_write" ON document_templates
  FOR ALL USING (auth.role() = 'service_role');

-- Grant SELECT to authenticated
GRANT SELECT ON document_templates TO authenticated;
GRANT ALL    ON document_templates TO service_role;

SELECT
  category,
  COUNT(*) AS templates,
  SUM(CASE WHEN compiled_html IS NOT NULL THEN 1 ELSE 0 END) AS compiled
FROM document_templates
GROUP BY category
ORDER BY category;
