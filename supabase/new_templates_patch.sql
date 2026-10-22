-- ══════════════════════════════════════════════════════════════════════════════
-- ACCSYS — New Templates Registration Patch
-- Run in Supabase SQL Editor → New Query → Run
--
-- Registers:
--   1. expense_record_voucher  — per-expense printable with photo + late reason
--   2. subcon_statement        — SubCon Statement of Account
--   3. supplier_statement      — Supplier Statement of Account
--   4. project_statement       — Project Financial Statement
--   5. employee_profile_letter — Employee Profile Letter (HR)
--
-- All 5 have built-in JS builders in templatePrint.js (no compiled_html needed).
-- Also fixes any Field Ops templates that may have been registered as FIELD_OPS
-- category to ensure they show correctly in the library.
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO document_templates (
  template_key, template_name, category, language,
  description, drive_folder, sort_order, is_active
)
VALUES

  -- ── Cash Payment Voucher ─────────────────────────────────────────────────
  (
    'cash_payment_voucher',
    'Cash Payment Voucher',
    'FINANCE',
    'EN',
    'Payment voucher for any party — registered company, individual, or informal. Captures Iqama number, encodes all payment data (payee, Iqama, amount, purpose, DH) in a scannable QR code. Supports no-receipt payments with mandatory DH justification block.',
    'payment-vouchers',
    14,
    true
  ),

  -- ── Expense Record Voucher (Finance) ──────────────────────────────────────
  (
    'expense_record_voucher',
    'Expense Record Voucher (with Photo)',
    'FINANCE',
    'EN',
    'Per-expense printable voucher — embeds receipt photo from Google Drive, shows invoice date vs submission date with a prominent late-submission banner and reason callout. Auto-saves to Drive.',
    'expense-vouchers',
    13,
    true
  ),

  -- ── SubCon Statement of Account ───────────────────────────────────────────
  (
    'subcon_statement',
    'Sub-Contractor Statement',
    'FINANCE',
    'EN',
    'Statement of account for a sub-contractor — all claims submitted, amounts approved, payments made, and outstanding balance for any period.',
    'subcon-statements',
    20,
    true
  ),

  -- ── Supplier Statement of Account ─────────────────────────────────────────
  (
    'supplier_statement',
    'Supplier Statement',
    'FINANCE',
    'EN',
    'Statement of account for a supplier — purchase orders raised, invoices received, payments made, and outstanding balance.',
    'supplier-statements',
    21,
    true
  ),

  -- ── Project Financial Statement ───────────────────────────────────────────
  (
    'project_statement',
    'Project Statement',
    'FINANCE',
    'EN',
    'Project financial summary — invoices raised vs PO value (billing utilisation), payments received, field expenses charged, and net balance.',
    'project-statements',
    22,
    true
  ),

  -- ── Employee Profile Letter (HR) ──────────────────────────────────────────
  (
    'employee_profile_letter',
    'Employee Profile Letter',
    'HR',
    'EN',
    'Official HR employee profile — personal details, designation, contract type, GOSI registration, IBAN, employment dates. Used for visa applications, bank letters, government purposes.',
    'employee-profiles',
    20,
    true
  )

ON CONFLICT (template_key) DO NOTHING;
-- ^^^ safe to re-run multiple times

-- Verify registration
SELECT
  id,
  category,
  template_key,
  template_name,
  CASE WHEN compiled_html IS NOT NULL THEN 'Custom HTML' ELSE 'Built-in builder' END AS html_source,
  is_active
FROM document_templates
WHERE template_key IN (
  'expense_record_voucher',
  'subcon_statement',
  'supplier_statement',
  'project_statement',
  'employee_profile_letter'
)
ORDER BY category, sort_order;
