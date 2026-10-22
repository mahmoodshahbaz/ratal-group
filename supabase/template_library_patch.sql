-- ══════════════════════════════════════════════════════════════════════════
-- Template Library — Missing built-in templates registration
--
-- The following templates have built-in JS builders in templatePrint.js
-- but were never inserted into document_templates, so they are invisible
-- in the Template Library UI.
--
-- Run this in Supabase SQL Editor (Project → SQL Editor → New Query → Run)
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO document_templates (
  template_key, template_name, category, language,
  description, drive_folder, sort_order, is_active
)
VALUES
  -- G5: Salary Slip
  (
    'salary_slip',
    'Employee Salary Slip',
    'HR',
    'EN',
    'Monthly payslip — earnings, deductions, net salary, bank/cash split, GOSI notice. Auto-saves to Payroll → Year → Month in Google Drive.',
    'payslips',
    10,
    true
  ),

  -- G5: Outgoing Purchase Order (was also missing)
  (
    'outgoing_po',
    'Outgoing Purchase Order',
    'PROCUREMENT',
    'EN',
    'Purchase order issued to vendors, suppliers, sub-contractors, or equipment rental providers. Auto-saves to the matching PO subfolder in Google Drive.',
    'po-vendors',
    20,
    true
  )

ON CONFLICT (template_key) DO NOTHING;
-- ^^^ safe to re-run: skips if already registered
