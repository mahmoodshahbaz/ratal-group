import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.Operations
/**
 * ACCSYS — Template Library
 * Browse, preview, and manage all HTML document templates.
 * Categories: Invoices | Business Events | Field Operations
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { buildDocumentHtml, printDocument } from '../lib/templatePrint'

// ─── Category config ──────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'ALL',            label: '📋 All Templates',      color: '#0D5C4E' },
  { key: 'INVOICE',        label: '🧾 Invoices',            color: '#1565c0' },
  { key: 'BUSINESS_EVENT', label: '📝 Business Events',     color: '#6a1b9a' },
  { key: 'FIELD_OPS',      label: '🏗️ Field Operations',   color: '#2e7d32' },
  { key: 'HR',             label: '👤 HR',                   color: '#e65100' },
  { key: 'PROCUREMENT',    label: '🛒 Procurement',          color: '#00838f' },
  { key: 'FINANCE',        label: '💳 Finance',              color: '#c62828' },
]

const CAT_COLOR = Object.fromEntries(CATEGORIES.map(c => [c.key, c.color]))

// ─── Built-in Finance templates (not yet in Supabase — injected client-side) ─
const BUILTIN_EXTRA = [
  {
    id:            '__builtin_monthly_expense_claim',
    template_key:  'monthly_expense_claim',
    template_name: 'Expense Claim',
    category:      'FINANCE',
    language:      'EN',
    description:   'Monthly expense reimbursement — multi-sheet, food allowance row, rejection history, Drive PDF',
    compiled_html: null,
    drive_folder:  'expense-claims',
    sort_order:    10,
  },
  {
    id:            '__builtin_monthly_food_allowance',
    template_key:  'monthly_food_allowance',
    template_name: 'Food Allowance Claim',
    category:      'FINANCE',
    language:      'EN',
    description:   'Daily food allowance table by date / location / persons, Drive PDF',
    compiled_html: null,
    drive_folder:  'food-allowance-claims',
    sort_order:    11,
  },
  {
    id:            '__builtin_overtime_report',
    template_key:  'overtime_report',
    template_name: 'Overtime Report',
    category:      'FINANCE',
    language:      'EN',
    description:   'Overtime log — date / job / work type / hours, Drive PDF',
    compiled_html: null,
    drive_folder:  'overtime-reports',
    sort_order:    12,
  },
  // ── New templates (not yet seeded in Supabase) ────────────────────────────
  {
    id:            '__builtin_cash_payment_voucher',
    template_key:  'cash_payment_voucher',
    template_name: 'Cash Payment Voucher',
    category:      'FINANCE',
    language:      'EN',
    description:   'Payment voucher for any party — company, individual, or informal. Captures Iqama number, encodes all data in a scannable QR code, supports no-receipt payments with DH justification box',
    compiled_html: null,
    drive_folder:  'payment-vouchers',
    sort_order:    14,
  },
  {
    id:            '__builtin_expense_voucher',
    template_key:  'expense_record_voucher',
    template_name: 'Expense Record Voucher (with Photo)',
    category:      'FINANCE',
    language:      'EN',
    description:   'Per-expense printable voucher — embeds receipt photo, shows invoice date vs submission date, late reason callout',
    compiled_html: null,
    drive_folder:  'expense-vouchers',
    sort_order:    13,
  },
  {
    id:            '__builtin_subcon_statement',
    template_key:  'subcon_statement',
    template_name: 'Sub-Contractor Statement',
    category:      'FINANCE',
    language:      'EN',
    description:   'Statement of account for a sub-contractor — all claims, payments, and outstanding balance',
    compiled_html: null,
    drive_folder:  'subcon-statements',
    sort_order:    20,
  },
  {
    id:            '__builtin_supplier_statement',
    template_key:  'supplier_statement',
    template_name: 'Supplier Statement',
    category:      'FINANCE',
    language:      'EN',
    description:   'Statement of account for a supplier — POs raised, invoices received, payments made, outstanding',
    compiled_html: null,
    drive_folder:  'supplier-statements',
    sort_order:    21,
  },
  {
    id:            '__builtin_project_statement',
    template_key:  'project_statement',
    template_name: 'Project Statement',
    category:      'FINANCE',
    language:      'EN',
    description:   'Project financial summary — invoices raised, payments received, expenses, and balance',
    compiled_html: null,
    drive_folder:  'project-statements',
    sort_order:    22,
  },
  {
    id:            '__builtin_employee_profile',
    template_key:  'employee_profile_letter',
    template_name: 'Employee Profile Letter',
    category:      'HR',
    language:      'EN',
    description:   'Official HR employee profile — personal info, designation, contract terms, GOSI, IBAN, for visas / banks / official use',
    compiled_html: null,
    drive_folder:  'employee-profiles',
    sort_order:    20,
  },
]

// Sample data for preview by template key
const PREVIEW_DATA = {
  money_request: {
    request_number: 'MR-2026-09-001',
    request_date:   '2026-09-22',
    department:     'IT Infrastructure',
    purpose:        'Team Expenses',
    project_list:   'P-260101',
    recipient_name: 'Mahmood Shahbaz',
    recipient_title:'The General Manager',
    recipient_company:'Ratal Advanced Technologies',
    requested_by_name: 'Ahmed Al-Rashidi',
    requested_by_role:  'Department Head',
    lines: [
      { party_type:'Employee', party_name:'Khalid Al-Zahrani', expense_type:'Team Travelling Expenses', payment_type:'Bank-Transfer', project_number:'P-260101', amount:2500, iban:'SA0310000000000012345601', remarks:'Riyadh trip' },
      { party_type:'Supplier', party_name:'HITECH Steel Co.',   expense_type:'Material Purchases',        payment_type:'Cheque',        project_number:'P-260101', amount:8750, iban:'SA0310000000000098765402', remarks:'Site materials' },
      { party_type:'Employee', party_name:'Faisal Al-Otaibi',   expense_type:'Per Diem / Daily Allowance',payment_type:'Cash',          project_number:'P-260102', amount:1200, iban:'SA0310000000000055555503', remarks:'Daily allowance' },
    ],
  },
  new_project_form: {
    project_number:  'P-260101',
    project_name_en: 'SABIC Fiber Backbone Expansion — Phase 2',
    project_type:    'NETWORK',
    client_name_en:  'Saudi Basic Industries Corporation (SABIC)',
    contractor_po:   'PO-2026-SABIC-00442',
    contractor_pm:   'Eng. Tariq Al-Ghamdi',
    contract_value:  2850000,
    department:      'TISU',
    dept_head_en:    'Hafiz Shahzad Amjad Hussain',
    pm_name:         'Mohammad Al-Rashidi',
    generated_date:  '2026-09-23',
  },
  payment_instruction: {
    dept_head_en:          'Hafiz Shahzad Amjad Hussain',
    requested_by_dept_en:  'TISU',
    payment_date:          '2026-09-23',
    request_number:        'MR-2026-0017',
    payment_reference:     'TRN240923001',
    from_account:          'ANB-15',
    payment_method:        'BANK_TRANSFER',
    total_amount:          2000,
    initiated_by_name_en:  'Mohammed Rashad',
    lines: [
      { party_type:'Employee', supplier_name:'Abdul Rehman Bezar Khan', iban:'SA6945000000181323205001', account_code:'TEAM_TRAVEL', amount:1000, trn:'TRN240923001' },
      { party_type:'Employee', supplier_name:'Khalid Al-Zahrani',       iban:'SA0310000000000012345601', account_code:'TEAM_TRAVEL', amount:1000, trn:'TRN240923002' },
    ],
  },
  new_vehicle_request: {
    vehicle_plate:            'ZYR 2022',
    vehicle_assigned_to_en:   'Khalid Khamis Adam',
    vehicle_driver_license:   '2163513100',
    vehicle_assigned_phone:   '+966 50 123 4567',
    generated_date:           '2026-09-23',
    reference_number:         'VH-ZYR2022-230926',
    vehicle_assigned_dept:    'NISU',
    vehicle_make:             'MAZDA',
    vehicle_model:            'Mazda Pickup',
    vehicle_vin:              'JMYUNY0W200123456',
    vehicle_reg_expiry:       '2027-03-15',
    vehicle_insurance_expiry: '2027-01-20',
    vehicle_odometer:         47250,
    handover_by_name_en:      'Mohammed Rashad',
  },
  vehicle_handover: {
    vehicle_plate:            'ZYR 2022',
    vehicle_assigned_to_en:   'Khalid Khamis Adam',
    vehicle_driver_license:   '2163513100',
    vehicle_assigned_phone:   '+966 50 123 4567',
    generated_date:           '2026-09-23',
    reference_number:         'VH-ZYR2022-230926',
    vehicle_assigned_dept:    'NISU',
    vehicle_make:             'MAZDA',
    vehicle_model:            'Mazda Pickup',
    vehicle_vin:              'JMYUNY0W200123456',
    vehicle_reg_expiry:       '2027-03-15',
    vehicle_insurance_expiry: '2027-01-20',
    vehicle_odometer:         47250,
    handover_by_name_en:      'Mohammed Rashad',
  },
  invoice_accsys_bilingual: {
    invoice_number: 'M-INV-2026-09-0001',
    invoice_date:   '22/09/2026',
    due_date:       '22/10/2026',
    po_number:      '4049608',
    total_net:      '281,750.00',
    vat_amount:     '42,262.50',
    total_incl_vat: '324,012.50',
  },
  salary_slip: {
    employee_code:       'EMP-001',
    employee_name:       'Mahmood Shahbaz',
    employee_phone:      '+966 50 410 5827',
    employee_email:      'mahmood@accsyscom.com',
    department:          'Management',
    designation:         'General Manager',
    nationality:         'Pakistani',
    hr_signatory:        '',   // leave blank — HR manager signs by hand
    iban:                'SA45450000000032829511150',
    bank_name:           'Saudi British Bank (SABB)',
    hire_date:           '2022-01-01',
    basic_salary:        18000,
    bank_portion:        14500,
    cash_portion:        3500,
    housing_allowance:   3000,
    transport_allowance: 1000,
    other_allowance:     1500,
    food_allowance:      500,
    ot_amount:           1200,
    gross_salary:        25200,
    gosi_amount:         756,
    gosi_rate:           0.03,
    loan_deduction:      500,
    penalty_deduction:   0,
    leave_deduction:     0,
    advance_deduction:   0,
    other_deduction:     0,
    unpaid_days:         0,
    net_salary:          24700,
    payroll_month:       '2026-09',
    pay_date:            '11 October 2026',
    pay_slip_serial:     '0001',
    entity_name:         'RATAL Advanced Technologies',
    entity_address:      'Building 4812, Aghadeer Street Malaz',
    entity_vat:          '310680651700003',
  },
  outgoing_po: {
    po_number:          'PO-2026-09-001',
    po_date:            '2026-09-22',
    job_type:           'SUBCONTRACTOR',
    vendor_name:        'Al-Faris Contracting Co.',
    vendor_address:     'Riyadh, Kingdom of Saudi Arabia',
    vendor_vat:         '300112233445566',
    scope_of_work:      'Civil works and site preparation for SABIC Fiber Backbone Phase 2',
    total_amount:       125000,
    vat_amount:         18750,
    total_with_vat:     143750,
    currency:           'SAR',
    prepared_by:        'Mohammed Rashad',
    approved_by:        'Hafiz Shahzad Amjad Hussain',
    entity_name:        'RATAL Advanced Technologies',
    entity_vat:         '310680651700003',
    lines: [
      { description: 'Site preparation and excavation works', qty: 1, unit: 'LS', unit_price: 75000, total: 75000 },
      { description: 'Cable trenching — 2.4km dual route',    qty: 2400, unit: 'LM', unit_price: 20.83, total: 50000 },
    ],
  },

  // ── Cash Payment Voucher ─────────────────────────────────────────────────
  cash_payment_voucher: {
    voucher_number:    'CPV-2026-10-0031',
    payment_date:      '2026-10-10',
    entity_name:       'Ratal Advanced Technologies',
    department:        'TISU',
    project_no:        'P-260101',
    project_name:      'SABIC Fiber Backbone Expansion — Phase 2',
    paid_by:           'Mohammed Rashad',
    approved_by:       'Hafiz Shahzad Amjad Hussain',
    // Payee — Individual with Iqama
    party_type:        'INDIVIDUAL',
    payee_name:        'Ahmed Salim Al-Balushi',
    iqama_number:      '2083456781',
    payee_mobile:      '+966 55 234 5678',
    iban:              'SA0310000000000055555503',
    payee_bank_name:   'Alinma Bank',
    // Payment
    amount:            3500,
    payment_method:    'CASH',
    reference_number:  'CPV-REF-2026-0031',
    account_code:      'SITE_LABOUR',
    // Purpose
    purpose:           'Daily labour wages for cable pulling and site preparation works at SABIC HQ compound — 7 days × SAR 500/day',
    notes:             'Worker provided Iqama copy on site. No formal receipt available.',
    // Receipt
    receipt_type:      'INFORMAL_RECEIPT',
    justification:     'Day labourer engaged directly at site. Formal company invoice not applicable. Iqama copy retained on file. Payment confirmed by site supervisor.',
    // Photos (empty for preview — filled from real submissions)
    iqama_photo_url:   '',
    document_url:      '',
  },

  // ── SubCon Payment Certificate ───────────────────────────────────────────
  subcon_payment_cert: {
    claim_number:     'SPC-2026-10-0023',
    claim_date:       '2026-10-10',
    contractor_name:  'Al-Faris Contracting Company',
    contractor_vat:   '300112233445566',
    site_name:        'SABIC HQ — Fiber Backbone Phase 2',
    site_number:      'S-2260042',
    scope_type:       'ACTIVE_INSTALLATION',
    claim_type:       'MILESTONE',
    claim_month:      'October',
    claim_year:       2026,
    work_description: 'Installation of fiber optic cable along 2.4km dual route, splicing and testing at SABIC HQ compound.',
    milestones_done:  ['Civil Works Complete','Cable Pulling 100%','Splicing Complete','OTDR Testing Passed'],
    materials_used:   [
      { item:'Fiber Optic Cable OS2 SM', qty:2400, unit_cost:18.5, total:44400 },
      { item:'Splice Enclosures',        qty:12,   unit_cost:320,  total:3840  },
    ],
    claim_amount:     125000,
    vat_pct:          15,
    vat_amount:       18750,
    total_amount:     143750,
    entity_name:      'Ratal Advanced Technologies',
    employee_name:    'Mohammed Rashad',
    approved_by:      'Hafiz Shahzad Amjad Hussain',
    notes:            'All testing certificates attached. Final milestone sign-off required.',
  },

  // ── Expense Record Voucher (with photo) ──────────────────────────────────
  expense_record_voucher: {
    record_number:    'EXP-REC-2026-10-0047',
    employee_name:    'Khalid Al-Zahrani',
    department:       'TISU',
    project_no:       'P-260101',
    site_no:          'SITE-SABIC-04',
    job_no:           'J-260101-04',
    project_name:     'SABIC Fiber Backbone Expansion — Phase 2',
    expense_date:     '2026-10-08',
    invoice_date:     '2026-09-30',
    submitted_at:     '2026-10-08T09:30:00Z',
    vendor:           'HITECH Steel & Supplies Co.',
    invoice_number:   'INV-2026-09-4421',
    vat_number:       '300998877665544',
    category:         'Tools / Materials',
    net_amount:       2170,
    vat_amount:       325.5,
    total:            2495.5,
    photo_url:        '',   // real submissions have Google Drive URL
    notes:            'Site materials for conduit installation. Approved by DH verbally on site.',
    dh_name:          'Hafiz Shahzad Amjad Hussain',
    entity_name:      'Ratal Advanced Technologies',
  },

  // ── Invoice ACCSYS bilingual ──────────────────────────────────────────────
  invoice_accsys_bilingual: {
    invoice_number:  'M-INV-2026-10-0003',
    invoice_date:    '10/10/2026',
    due_date:        '10/11/2026',
    po_number:       '4049608',
    entity_name:     'Ratal Advanced Technologies',
    entity_vat:      '310680651700003',
    entity_address:  'Building 4812, Aghadeer Street, Malaz, Riyadh',
    client_name:     'Saudi Basic Industries Corporation (SABIC)',
    client_address:  'SABIC HQ, King Fahd Road, Riyadh',
    client_vat:      '300112233000001',
    currency:        'SAR',
    language:        'BILINGUAL',
    total_net:       281750,
    vat_amount:      42262.5,
    total_incl_vat:  324012.5,
    prepared_by:     'Mohammed Rashad',
    approved_by:     'Mahmood Shahbaz',
    lines: [
      { description:'Fiber Backbone Phase 2 — Mobilization & Civil Works', qty:1, unit:'LS', unit_price:150000, total:150000 },
      { description:'Cable Pulling & Installation — 2,400m OS2 Dual Route', qty:2400, unit:'LM', unit_price:35, total:84000 },
      { description:'Splicing, Testing & Commissioning', qty:1, unit:'LS', unit_price:47750, total:47750 },
    ],
  },
  invoice_accsys_en:     { invoice_number:'A-INV-2026-10-0001', invoice_date:'10/10/2026', due_date:'10/11/2026', entity_name:'Ratal Advanced Technologies', entity_vat:'310680651700003', client_name:'STC Enterprise', total_net:75000, vat_amount:11250, total_incl_vat:86250, lines:[{ description:'Network Infrastructure Services — Q4', qty:1, unit:'LS', unit_price:75000, total:75000 }] },
  invoice_rat_standard:  { invoice_number:'RAT-INV-2026-10-0001', invoice_date:'10/10/2026', due_date:'10/11/2026', entity_name:'Ratal Tours & Travels', entity_vat:'310680651700004', client_name:'Saudi Aramco Travel', total_net:45000, vat_amount:6750, total_incl_vat:51750, lines:[{ description:'Corporate Travel Services — October 2026', qty:1, unit:'LS', unit_price:45000, total:45000 }] },
  invoice_gwt_standard:  { invoice_number:'GWT-INV-2026-10-0001', invoice_date:'10/10/2026', due_date:'10/11/2026', entity_name:'Green Wings Travel & Tourism', entity_vat:'310680651700005', client_name:'Al-Faris Group', total_net:22000, vat_amount:3300, total_incl_vat:25300, lines:[{ description:'Travel & Tourism Services Package', qty:1, unit:'LS', unit_price:22000, total:22000 }] },

  // Field Ops aliases — same preview data as Finance equivalents
  expense_claim:        { claim_number:'EXP-2026-10-TISU-001', employee_name:'Khalid Al-Zahrani', department:'TISU', project_name:'SABIC Fiber Backbone', project_no:'P-260101', from_date:'2026-09-26', to_date:'2026-10-25', generated_date:'2026-10-25', sheet_number:1, total_sheets:1, grand_total:4850, food_allowance:{amount:900,show:true}, lines:[{ date:'2026-09-28', job_no:'P-260101', category:'Transportation', vendor:'SAPTCO', vat_number:'', net_amount:350, vat_amount:0, total:350 }], rejections:[], submission_round:1 },
  food_allowance_claim: { claim_number:'FOOD-2026-10-TISU-001', employee_name:'Khalid Al-Zahrani', department:'TISU', project_name:'SABIC Fiber Backbone', project_no:'P-260101', from_date:'2026-09-26', to_date:'2026-10-25', generated_date:'2026-10-25', daily_rate:30, total_days:30, total_amount:900, lines:[{ date:'2026-09-26', location:'Riyadh — SABIC HQ Site', persons:1, rate:30, amount:30 }], rejections:[], submission_round:1 },
  ot_summary:           { report_number:'OT-2026-10-TISU-001', employee_name:'Khalid Al-Zahrani', department:'TISU', project_name:'SABIC Fiber Backbone', project_no:'P-260101', from_date:'2026-09-26', to_date:'2026-10-25', generated_date:'2026-10-25', hourly_rate:45, total_hours:24, total_amount:1080, lines:[{ date:'2026-09-27', job_no:'P-260101', work_type:'Cable Pulling', start:'18:00', end:'22:00', hours:4, amount:180 }], rejections:[], submission_round:1 },

  // ── Statement templates ───────────────────────────────────────────────────
  subcon_statement: {
    statement_number: 'SC-STMT-2026-10-001',
    statement_date:   '13/10/2026',
    entity_name:      'Ratal Advanced Technologies',
    entity_vat:       '310680651700003',
    subcon_name:      'Al-Farouk Network Solutions',
    subcon_cr:        '1010234567',
    subcon_vat:       '300765432100003',
    project_name:     'SABIC Fiber Backbone — Phase 2',
    from_date:        '01/07/2026',
    to_date:          '30/09/2026',
    total_claimed:    187500,
    total_paid:       125000,
    outstanding:      62500,
    lines: [
      { date:'15/07/2026', cert_number:'SPC-001', description:'Civil Works — Phase 2A Trenching',         claimed:62500,  payment_amount:62500,  balance:0      },
      { date:'10/08/2026', cert_number:'SPC-002', description:'Cable Pulling — Backbone Sections 1–5',   claimed:75000,  payment_amount:62500,  balance:12500  },
      { date:'05/09/2026', cert_number:'SPC-003', description:'Splicing & Testing — 48F Single Mode',    claimed:50000,  payment_amount:0,       balance:62500  },
    ],
  },

  supplier_statement: {
    statement_number: 'SUP-STMT-2026-10-001',
    statement_date:   '13/10/2026',
    entity_name:      'Ratal Advanced Technologies',
    entity_vat:       '310680651700003',
    supplier_name:    'HITECH Steel & Materials Co.',
    supplier_vat:     '300112233445566',
    supplier_cr:      '1010987654',
    from_date:        '01/08/2026',
    to_date:          '30/09/2026',
    total_invoiced:   234800,
    total_paid:       195000,
    outstanding:      39800,
    lines: [
      { date:'05/08/2026', ref:'PO-2026-0081', description:'Steel Cable Trays & Supports — Project P-260101', invoice_amount:89500,  payment_amount:89500, balance:0     },
      { date:'18/08/2026', ref:'PO-2026-0092', description:'Conduit & Fittings — 50mm & 32mm',               invoice_amount:45300,  payment_amount:45300, balance:0     },
      { date:'02/09/2026', ref:'PO-2026-0104', description:'Fiber Optic Accessories & Tools',                invoice_amount:60000,  payment_amount:60200, balance:39800 },
      { date:'20/09/2026', ref:'PO-2026-0115', description:'Consumables & Site Safety Materials',            invoice_amount:40000,  payment_amount:0,     balance:39800 },
    ],
  },

  project_statement: {
    statement_date:   '13/10/2026',
    entity_name:      'Ratal Advanced Technologies',
    entity_vat:       '310680651700003',
    project_name:     'SABIC Fiber Backbone Expansion — Phase 2',
    project_number:   'P-260101',
    client_name:      'Saudi Basic Industries Corporation (SABIC)',
    from_date:        '01/04/2026',
    to_date:          '30/09/2026',
    po_value:         2850000,
    total_billed:     1425000,
    total_received:   1250000,
    total_expenses:   387500,
    invoices: [
      { date:'30/04/2026', invoice_number:'A-INV-2026-04-001', description:'Mobilization & Phase 1 Completion',          amount:450000,  paid_amount:450000  },
      { date:'30/05/2026', invoice_number:'A-INV-2026-05-001', description:'Phase 2A — Civil Works & Cable Pulling',     amount:375000,  paid_amount:375000  },
      { date:'30/06/2026', invoice_number:'A-INV-2026-06-001', description:'Phase 2B — Splicing, Testing, Commissioning',amount:350000,  paid_amount:300000  },
      { date:'31/07/2026', invoice_number:'A-INV-2026-07-001', description:'Phase 3A Milestone — Partial',               amount:250000,  paid_amount:125000  },
      { date:'30/09/2026', invoice_number:'A-INV-2026-09-001', description:'Q3 Progress Claim — Sections 12–18',         amount:0,       paid_amount:0       },
    ],
    expenses: [
      { date:'30/04/2026', category:'SubCon',        description:'Al-Farouk — Phase 1 civil works',   amount:125000 },
      { date:'31/05/2026', category:'Materials',     description:'HITECH Steel — Cable trays & conduit',amount:89500 },
      { date:'30/06/2026', category:'SubCon',        description:'Al-Farouk — Phase 2 pulling works', amount:75000  },
      { date:'31/07/2026', category:'Field Expenses',description:'Team expenses Jul — P-260101',       amount:48000  },
      { date:'31/08/2026', category:'Equipment',     description:'Crane hire — heavy lifts sections 12+',amount:50000},
    ],
  },

  employee_profile_letter: {
    entity_name:     'Ratal Advanced Technologies',
    entity_vat:      '310680651700003',
    entity_address:  'Al-Olaya District, Riyadh 12214, Kingdom of Saudi Arabia',
    letter_ref:      'HR-PROFILE-2026-10-0042',
    letter_date:     '13 October 2026',
    employee_name:   'Khalid Hassan Al-Zahrani',
    nationality:     'Saudi Arabian',
    iqama_number:    '1085432109',
    designation:     'Senior Network Engineer',
    department:      'TISU — Telecom Infrastructure & Survey Unit',
    employment_type: 'Full-Time',
    contract_type:   'Open-Ended',
    join_date:       '01 March 2023',
    basic_salary:    12500,
    gosi_number:     'GOSI-310680-004422',
    iban:            'SA0310000000000012345601',
    bank_name:       'Arab National Bank (ANB)',
    hr_manager:      'Hafiz Shahzad Amjad Hussain',
    gm_name:         'Mahmood Shahbaz',
  },

  // ── Finance claim templates ───────────────────────────────────────────────
  monthly_expense_claim: {
    claim_number:    'EXP-2026-10-TISU-001',
    employee_name:   'Khalid Al-Zahrani',
    department:      'TISU',
    project_name:    'SABIC Fiber Backbone Expansion — Phase 2',
    project_no:      'P-260101',
    from_date:       '2026-09-26',
    to_date:         '2026-10-25',
    generated_date:  '2026-10-25',
    sheet_number:    1,
    total_sheets:    1,
    grand_total:     4850,
    food_allowance:  { amount: 900, show: true },
    lines: [
      { date:'2026-09-28', job_no:'P-260101', category:'Transportation', vendor:'SAPTCO',           vat_number:'',                  net_amount:350,  vat_amount:0,    total:350  },
      { date:'2026-10-02', job_no:'P-260101', category:'Accommodation',  vendor:'Novotel Riyadh',   vat_number:'300112233445566',    net_amount:869,  vat_amount:130,  total:999  },
      { date:'2026-10-05', job_no:'P-260101', category:'Tools/Materials',vendor:'HITECH Steel',     vat_number:'300998877665544',    net_amount:2170, vat_amount:325,  total:2495 },
      { date:'2026-10-10', job_no:'P-260101', category:'Communication',  vendor:'STC Business',     vat_number:'300112233445566',    net_amount:87,   vat_amount:13,   total:100  },
      { date:'2026-10-15', job_no:'P-260101', category:'Printing/Copies',vendor:'Quick Print',      vat_number:'',                  net_amount:26,   vat_amount:4,    total:30   },
    ],
    rejections:        [],
    submission_round:  1,
  },

  monthly_food_allowance: {
    claim_number:    'FOOD-2026-10-TISU-001',
    employee_name:   'Khalid Al-Zahrani',
    department:      'TISU',
    project_name:    'SABIC Fiber Backbone Expansion — Phase 2',
    project_no:      'P-260101',
    from_date:       '2026-09-26',
    to_date:         '2026-10-25',
    generated_date:  '2026-10-25',
    daily_rate:      30,
    total_days:      30,
    total_amount:    900,
    lines: [
      { date:'2026-09-26', location:'Riyadh — SABIC HQ Site',    persons:1, rate:30, amount:30  },
      { date:'2026-09-27', location:'Riyadh — SABIC HQ Site',    persons:1, rate:30, amount:30  },
      { date:'2026-09-28', location:'Dammam — Eastern Province', persons:1, rate:30, amount:30  },
      { date:'2026-09-29', location:'Dammam — Eastern Province', persons:1, rate:30, amount:30  },
      { date:'2026-09-30', location:'Riyadh — SABIC HQ Site',    persons:1, rate:30, amount:30  },
    ],
    rejections:        [],
    submission_round:  1,
  },

  overtime_report: {
    report_number:   'OT-2026-10-TISU-001',
    employee_name:   'Khalid Al-Zahrani',
    department:      'TISU',
    project_name:    'SABIC Fiber Backbone Expansion — Phase 2',
    project_no:      'P-260101',
    from_date:       '2026-09-26',
    to_date:         '2026-10-25',
    generated_date:  '2026-10-25',
    hourly_rate:     45,
    total_hours:     24,
    total_amount:    1080,
    lines: [
      { date:'2026-09-27', job_no:'P-260101', work_type:'Cable Pulling',     start:'18:00', end:'22:00', hours:4, amount:180 },
      { date:'2026-09-28', job_no:'P-260101', work_type:'Splicing Works',    start:'17:00', end:'23:00', hours:6, amount:270 },
      { date:'2026-10-04', job_no:'P-260101', work_type:'Testing & Comm.',   start:'18:00', end:'22:00', hours:4, amount:180 },
      { date:'2026-10-05', job_no:'P-260101', work_type:'Weekend Coverage',  start:'08:00', end:'18:00', hours:10,amount:450 },
    ],
    rejections:        [],
    submission_round:  1,
  },
}

const S = {
  page:   { padding:'24px 28px', maxWidth:1200, margin:'0 auto' },
  hdr:    { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 },
  title:  { fontSize:22, fontWeight:900, color:'#1a2e3d' },
  sub:    { fontSize:13, color:'#6b7c93', marginTop:2 },
  tabs:   { display:'flex', gap:6, marginBottom:24, flexWrap:'wrap' },
  tab:    (active, color) => ({
    padding:'8px 16px', borderRadius:8, border:'none', cursor:'pointer', fontSize:13, fontWeight:700,
    background: active ? color : '#f0f4f8',
    color:      active ? '#fff'  : '#4a5568',
    boxShadow:  active ? `0 2px 8px ${color}44` : 'none',
    transition: 'all .15s',
  }),
  grid:   { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16 },
  card:   { background:'#fff', borderRadius:12, boxShadow:'0 2px 10px rgba(0,0,0,0.08)', overflow:'hidden', display:'flex', flexDirection:'column' },
  cardTop:(color) => ({ background:color, padding:'14px 16px', color:'#fff' }),
  cardName: { fontSize:14, fontWeight:900, marginBottom:4 },
  cardDesc: { fontSize:11, opacity:0.85, lineHeight:1.4 },
  cardBody: { padding:'14px 16px', flex:1, display:'flex', flexDirection:'column', gap:10 },
  badge:  (bg, color) => ({ display:'inline-block', background:bg, color, borderRadius:5, padding:'2px 8px', fontSize:10, fontWeight:700 }),
  status: (compiled) => ({
    display:'inline-flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700,
    color: compiled ? '#2e7d32' : '#e65100',
  }),
  actions:{ display:'flex', gap:8, marginTop:'auto', paddingTop:8, borderTop:'1px solid #f0f4f8' },
  btn:    (bg, color) => ({ background:bg, color, border:'none', borderRadius:7, padding:'7px 14px', cursor:'pointer', fontSize:12, fontWeight:700, flex:1, fontFamily:"'Poppins',sans-serif" }),
  // Modal
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modal:  { background:'#fff', borderRadius:14, padding:0, width:860, maxWidth:'100%', maxHeight:'94vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.22)', display:'flex', flexDirection:'column' },
  mhdr:   { padding:'18px 24px', background:'#0D5C4E', borderRadius:'14px 14px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' },
  mbody:  { padding:24, flex:1 },
  inp:    { width:'100%', fontFamily:'monospace', fontSize:12, padding:12, borderRadius:8, border:'1px solid #dde3ec', resize:'vertical', minHeight:400, outline:'none' },
  label:  { fontSize:11, fontWeight:700, color:'#6b7c93', display:'block', marginBottom:6 },
}

export default function TemplateLibrary({ entityId }) {
  const [templates, setTemplates] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [activeTab, setActiveTab] = useState('ALL')
  const [editing,    setEditing]   = useState(null)   // template being edited
  const [htmlDraft,  setHtmlDraft] = useState('')
  const [saving,     setSaving]    = useState(false)
  const [saveMsg,    setSaveMsg]   = useState('')
  const [previewHtml, setPreviewHtml] = useState(null)  // inline preview

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('document_templates')
      .select('*')
      .order('category').order('sort_order')
    // Merge client-side built-ins (Finance claim templates) — skip any that
    // already exist as a real Supabase row so we don't show duplicates.
    const supabaseKeys = new Set((data || []).map(t => t.template_key))
    const extras = BUILTIN_EXTRA.filter(e => !supabaseKeys.has(e.template_key))
    setTemplates([...(data || []), ...extras])
    setLoading(false)
  }

  // ── Filter ────────────────────────────────────────────────────────────────
  const visible = activeTab === 'ALL'
    ? templates
    : templates.filter(t => t.category === activeTab)

  // ── Count per category ────────────────────────────────────────────────────
  const countFor = key => key === 'ALL'
    ? templates.length
    : templates.filter(t => t.category === key).length

  // ── Preview — renders inline in a full-screen overlay (no popup) ─────────
  async function handlePreview(tpl, overrideHtml) {
    const data = PREVIEW_DATA[tpl.template_key] || { request_number: 'PREVIEW' }
    const html = overrideHtml !== undefined
      ? overrideHtml   // "Preview Draft" passes the textarea HTML
      : await buildDocumentHtml(tpl.template_key, data)
    if (!html) { alert('No template HTML found.'); return }
    setPreviewHtml(html)
  }

  // ── Open edit modal ───────────────────────────────────────────────────────
  function openEdit(tpl) {
    setEditing(tpl)
    setHtmlDraft(tpl.compiled_html || '')
    setSaveMsg('')
  }

  // ── Save HTML ─────────────────────────────────────────────────────────────
  async function saveHtml() {
    if (!editing) return
    setSaving(true)
    const { error } = await supabase
      .from('document_templates')
      .update({ compiled_html: htmlDraft || null })
      .eq('id', editing.id)
    setSaving(false)
    if (error) { setSaveMsg('❌ Save failed: ' + error.message); return }
    setSaveMsg('✅ Template saved!')
    setTemplates(prev => prev.map(t => t.id === editing.id
      ? { ...t, compiled_html: htmlDraft || null }
      : t
    ))
    setTimeout(() => setSaveMsg(''), 3000)
  }

  // ── Clear HTML (revert to built-in) ──────────────────────────────────────
  async function clearHtml() {
    if (!editing) return
    if (!window.confirm('Clear stored HTML and revert to built-in template?')) return
    setSaving(true)
    await supabase.from('document_templates').update({ compiled_html: null }).eq('id', editing.id)
    setSaving(false)
    setHtmlDraft('')
    setTemplates(prev => prev.map(t => t.id === editing.id ? { ...t, compiled_html: null } : t))
    setSaveMsg('✅ Reverted to built-in')
    setTimeout(() => setSaveMsg(''), 3000)
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>

      {/* Page header */}
      <div style={S.hdr}>
        <div>
        </div>
        <div style={{ fontSize:12, color:'#6b7c93' }}>
          {templates.filter(t => t.compiled_html).length} / {templates.length} templates compiled
        </div>
      </div>

      {/* Category tabs */}
      <div style={S.tabs}>
        {CATEGORIES.filter(c => countFor(c.key) > 0 || c.key === 'ALL').map(c => (
          <button
            key={c.key}
            style={S.tab(activeTab === c.key, c.color)}
            onClick={() => setActiveTab(c.key)}
          >
            {c.label}
            <span style={{ marginLeft:6, fontSize:10, opacity:0.8 }}>({countFor(c.key)})</span>
          </button>
        ))}
      </div>

      {/* Template grid */}
      {loading
        ? <div style={{ textAlign:'center', padding:60, color:'#aab2bd' }}>Loading templates…</div>
        : <div style={S.grid}>
            {visible.map(tpl => {
              const color    = CAT_COLOR[tpl.category] || '#1a2e3d'
              const compiled = !!tpl.compiled_html
              const hasBuiltin = [
                'money_request', 'project_initiation', 'new_project_form',
                'payment_instruction', 'vehicle_handover', 'new_vehicle_request',
                'outgoing_po', 'salary_slip',
                'monthly_expense_claim', 'monthly_food_allowance', 'overtime_report',
                // Field Ops aliases
                'expense_claim', 'food_allowance_claim', 'ot_summary',
                // New builders
                'cash_payment_voucher', 'subcon_payment_cert', 'expense_record_voucher',
                'invoice_accsys_bilingual', 'invoice_accsys_en',
                'invoice_rat_standard', 'invoice_gwt_standard',
                'subcon_statement', 'supplier_statement',
                'employee_profile_letter', 'project_statement',
              ].includes(tpl.template_key)

              return (
                <div key={tpl.id} style={S.card}>
                  {/* Coloured top band */}
                  <div style={S.cardTop(color)}>
                    <div style={S.cardName}>{tpl.template_name}</div>
                    <div style={S.cardDesc}>{tpl.description || ''}</div>
                  </div>

                  <div style={S.cardBody}>
                    {/* Badges */}
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      <span style={S.badge('#e8f0fe','#1565c0')}>{tpl.category.replace('_',' ')}</span>
                      <span style={S.badge('#f3e5f5','#6a1b9a')}>{tpl.language}</span>
                    </div>

                    {/* Status */}
                    <div style={S.status(compiled || hasBuiltin)}>
                      {compiled
                        ? '✅ Custom HTML stored'
                        : hasBuiltin
                          ? '⚡ Built-in template ready'
                          : '⏳ HTML not yet configured'}
                    </div>

                    {/* Drive folder */}
                    {tpl.drive_folder && (
                      <div style={{ fontSize:10, color:'#aab2bd' }}>
                        📁 {tpl.drive_folder}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={S.actions}>
                      <button
                        style={S.btn(compiled || hasBuiltin ? '#e8f5e9' : '#f0f4f8',
                                     compiled || hasBuiltin ? '#2e7d32' : '#aab2bd')}
                        onClick={() => handlePreview(tpl)}
                        disabled={!compiled && !hasBuiltin}
                        title={!compiled && !hasBuiltin ? 'Configure HTML first' : 'Preview with sample data'}
                      >
                        👁️ Preview
                      </button>
                      <button
                        style={S.btn('#e3f2fd','#1565c0')}
                        onClick={() => openEdit(tpl)}
                      >
                        ✏️ Edit HTML
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
      }

      {/* ── Inline Preview Overlay ── */}
      {previewHtml && (
        <div style={{
          position:'fixed', inset:0, background:'rgba(0,0,0,0.72)',
          zIndex:3000, display:'flex', flexDirection:'column',
        }}>
          {/* Toolbar */}
          <div style={{
            background:'#0D5C4E', padding:'10px 20px',
            display:'flex', alignItems:'center', gap:12, flexShrink:0,
          }}>
            <span style={{ color:'#fff', fontWeight:800, fontSize:15 }}>👁️ Template Preview</span>
            <span style={{ color:'rgba(255,255,255,0.4)', fontSize:12 }}>— sample data</span>
            <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
              <button
                onClick={() => {
                  const win = window.open('', '_blank', 'width=900,height=1200')
                  if (win) { win.document.write(previewHtml); win.document.close() }
                }}
                style={{ background:'#0D5C4E', color:'#fff', border:'none', borderRadius:7, padding:'7px 16px', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:"'Poppins',sans-serif" }}
              >🖨️ Open for Print</button>
              <button
                onClick={() => setPreviewHtml(null)}
                style={{ background:'rgba(255,255,255,0.12)', color:'#fff', border:'none', borderRadius:7, padding:'7px 16px', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:"'Poppins',sans-serif" }}
              >✕ Close</button>
            </div>
          </div>
          {/* iframe */}
          <iframe
            srcDoc={previewHtml}
            title="Template Preview"
            style={{ flex:1, border:'none', background:'#e0e0e0' }}
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}

      {/* ── Edit HTML Modal ── */}
      {editing && (
        <div style={S.overlay} onClick={() => setEditing(null)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>

            {/* Modal header */}
            <div style={S.mhdr}>
              <div>
                <div style={{ color:'#fff', fontWeight:900, fontSize:16 }}>
                  ✏️ {editing.template_name}
                </div>
                <div style={{ color:'rgba(255,255,255,0.6)', fontSize:12, marginTop:2 }}>
                  Key: <code style={{ background:'rgba(255,255,255,0.1)', padding:'1px 6px', borderRadius:4 }}>{editing.template_key}</code>
                  &nbsp;·&nbsp; Paste your A4 HTML below. Use <code style={{ background:'rgba(255,255,255,0.1)', padding:'1px 4px', borderRadius:4 }}>{'{{placeholder}}'}</code> for dynamic values.
                </div>
              </div>
              <button
                onClick={() => setEditing(null)}
                style={{ background:'none', border:'none', color:'rgba(255,255,255,0.6)', fontSize:22, cursor:'pointer' }}
              >✕</button>
            </div>

            {/* Modal body */}
            <div style={S.mbody}>

              {/* Placeholder hint */}
              {editing.placeholders && (
                <div style={{ marginBottom:12, padding:'8px 12px', background:'#f0f4f8', borderRadius:8, fontSize:11, color:'#4a5568' }}>
                  <strong>Placeholders:</strong>{' '}
                  {(editing.placeholders || []).map(p => (
                    <code key={p} style={{ background:'#e2e8f0', padding:'1px 5px', borderRadius:3, marginRight:4 }}>
                      {`{{${p}}}`}
                    </code>
                  ))}
                </div>
              )}

              <label style={S.label}>
                HTML Template &nbsp;
                <span style={{ fontWeight:400, color:'#aab2bd' }}>
                  ({htmlDraft.length.toLocaleString()} chars)
                  {!htmlDraft && ' — currently using built-in fallback'}
                </span>
              </label>
              <textarea
                style={S.inp}
                value={htmlDraft}
                onChange={e => setHtmlDraft(e.target.value)}
                placeholder={`Paste full A4 HTML here.\n\nLeave empty to use the built-in template.\n\nExample placeholder: {{request_number}}, {{request_date}}, {{line_items}}`}
                spellCheck={false}
              />

              {/* Actions */}
              <div style={{ display:'flex', gap:10, marginTop:14, alignItems:'center' }}>
                <button
                  onClick={saveHtml}
                  disabled={saving}
                  style={{ background:'#1565c0', color:'#fff', border:'none', borderRadius:8, padding:'10px 24px', cursor:'pointer', fontSize:13, fontWeight:700 }}
                >
                  {saving ? 'Saving…' : '💾 Save to Supabase'}
                </button>
                <button
                  onClick={clearHtml}
                  disabled={saving || !editing.compiled_html}
                  style={{ background:'#fff3e0', color:'#e65100', border:'1px solid #ffcc80', borderRadius:8, padding:'10px 16px', cursor:'pointer', fontSize:13, fontWeight:700 }}
                >
                  🗑️ Revert to Built-in
                </button>
                <button
                  onClick={() => handlePreview(editing, htmlDraft)}
                  disabled={!htmlDraft}
                  style={{ background:'#e8f5e9', color:'#2e7d32', border:'none', borderRadius:8, padding:'10px 16px', cursor:'pointer', fontSize:13, fontWeight:700 }}
                >
                  👁️ Preview Draft
                </button>
                {saveMsg && (
                  <span style={{ fontSize:13, fontWeight:700,
                    color: saveMsg.startsWith('✅') ? '#2e7d32' : '#c62828' }}>
                    {saveMsg}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
