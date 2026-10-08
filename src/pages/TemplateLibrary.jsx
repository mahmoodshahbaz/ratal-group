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
