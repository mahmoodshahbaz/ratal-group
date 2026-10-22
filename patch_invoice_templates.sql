-- ============================================================
-- PATCH: invoice_templates — dynamic template registry
-- Run in Supabase SQL Editor
-- Safe to re-run (uses IF NOT EXISTS / ON CONFLICT DO NOTHING)
-- ============================================================

CREATE TABLE IF NOT EXISTS invoice_templates (
  id          TEXT PRIMARY KEY,          -- e.g. 'RAT-INV'
  label       TEXT NOT NULL,             -- display name (two lines OK with \n)
  description TEXT,                      -- subtitle shown in picker
  file        TEXT NOT NULL,             -- DOCX file in /public/templates/
  entity      TEXT NOT NULL DEFAULT 'ACCSYS',  -- ACCSYS | RAT | GWT
  loop        BOOLEAN DEFAULT false,     -- uses {{#lines}} loop
  icon        TEXT DEFAULT '📄',
  sort_order  INT DEFAULT 0,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Seed the 4 current templates
INSERT INTO invoice_templates (id, label, description, file, entity, loop, icon, sort_order)
VALUES
  ('RAT-INV', 'Ratal Advanced Technologies' || chr(10) || 'Invoice Template-1',
   'Tax invoice — Ratal Advanced Technologies', 'RAT_Tax_Invoice.docx', 'ACCSYS', true,  '📄', 1),
  ('RAT-CN',  'Ratal Advanced Technologies' || chr(10) || 'Credit Note Template',
   'Credit note — Ratal Advanced Technologies', 'T8_Credit_Note.docx',  'ACCSYS', false, '📋', 2),
  ('RTT-INV', 'Ratal Tours and Travels' || chr(10) || 'Invoice Template-1',
   'Tax invoice — Ratal Tours & Travels',        'RAT_Tax_Invoice.docx', 'RAT',   true,  '📄', 3),
  ('GWT-INV', 'Green Wings Travels' || chr(10) || 'Invoice Template-1',
   'Tax invoice — Green Wings Travel & Tourism',  'RAT_Tax_Invoice.docx', 'GWT',   true,  '📄', 4)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS (authenticated users can read, only service role can write)
ALTER TABLE invoice_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_read" ON invoice_templates
  FOR SELECT USING (auth.role() = 'authenticated');

-- Verify
SELECT id, label, entity, file, active FROM invoice_templates ORDER BY sort_order;
