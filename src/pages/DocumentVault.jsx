import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import FormShell from '../components/FormShell'

// ═══════════════════════════════════════════════════════════════════
// Document Vault — v2
//
// Redesigned with:
//  - Left sidebar: entity type sections → doc type list (click to filter)
//  - Modal: Link To first → entity → doc type (no manual title needed)
//  - Title auto-generated from doc type
// ═══════════════════════════════════════════════════════════════════

// ── Palette (Administration = indigo) ────────────────────────────────
const PRI = '#454D9B'
const L1  = '#AAAED0'
const L2  = '#F0F1FA'
const PP  = "'Poppins','Segoe UI',sans-serif"

// ── Sidebar category config ───────────────────────────────────────────
const SIDEBAR_CATS = [
  { key:'EMPLOYEE',       label:'Employee',        icon:'👤', color:'#6a1b9a', light:'#f3e5f5' },
  { key:'VEHICLE',        label:'Fleet',           icon:'🚗', color:'#e65100', light:'#fff3e0' },
  { key:'CONTRACTOR',     label:'Contractor',      icon:'🏗️', color:'#2e7d32', light:'#e8f5e9' },
  { key:'SUBCONTRACTOR',  label:'Sub-contractor',  icon:'🔧', color:'#6d4c41', light:'#efebe9' },
  { key:'SUPPLIER',       label:'Supplier',        icon:'📦', color:'#1565c0', light:'#e3f2fd' },
  { key:'LOCAL_SUPPLIER', label:'Local Supplier',  icon:'🛒', color:'#00695c', light:'#e0f2f1' },
  { key:'VENDOR',         label:'Vendor',          icon:'🤝', color:'#5d4037', light:'#efebe9' },
  { key:'PROJECT',        label:'Project',         icon:'📁', color:'#37474f', light:'#eceff1' },
  { key:'COMPANY',        label:'Company',         icon:'🏢', color:'#1565c0', light:'#e3f2fd' },
]

// ── Doc type taxonomy ─────────────────────────────────────────────────
const DOC_CATEGORIES = {
  EMPLOYEE: [
    'IQAMA','DRIVING_LICENSE','PASSPORT','NATIONAL_ID','QIWA','SCE',
    'MEDICAL_INSURANCE','WORK_PERMIT','EMPLOYMENT_CONTRACT',
    'SALARY_CERTIFICATE','TRAINING_CERTIFICATE','GOSI_CERTIFICATE',
    'DEPENDENT_IQAMA','DEPENDENT_PASSPORT','DEPENDENT_INSURANCE',
    'OTHER',
  ],
  VEHICLE: [
    'ISTIMARA','INSURANCE','INSPECTION','DRIVING_LICENSE','LEASING_CONTRACT','OTHER',
  ],
  CONTRACTOR: [
    'CR','VAT_CERTIFICATE','CHAMBER_OF_COMMERCE','GOSI_CERTIFICATE',
    'SAUDIZATION','ISO_CERTIFICATE','VENDOR_APPROVAL','MOI_LICENSE',
    'CONTRACT','MOU','BANK_GUARANTEE','INSURANCE','OTHER',
  ],
  SUBCONTRACTOR: [
    'IQAMA','DRIVING_LICENSE','PASSPORT','NATIONAL_ID','QIWA','SCE','MEDICAL_INSURANCE',
    'CR','VAT_CERTIFICATE','CHAMBER_OF_COMMERCE','GOSI_CERTIFICATE','SAUDIZATION',
    'VENDOR_APPROVAL','MOI_LICENSE','CONTRACT','PERFORMANCE_BOND','INSURANCE','OTHER',
  ],
  SUPPLIER: [
    'CR','VAT_CERTIFICATE','CHAMBER_OF_COMMERCE','GOSI_CERTIFICATE',
    'SAUDIZATION','ISO_CERTIFICATE','VENDOR_APPROVAL','MOI_LICENSE',
    'CONTRACT','MOU','BANK_GUARANTEE','INSURANCE','INVOICE','OTHER',
  ],
  LOCAL_SUPPLIER: [
    'CR','VAT_CERTIFICATE','CHAMBER_OF_COMMERCE','MOI_LICENSE',
    'CONTRACT','INVOICE','INSURANCE','OTHER',
  ],
  VENDOR: [
    'CR','VAT_CERTIFICATE','CHAMBER_OF_COMMERCE','GOSI_CERTIFICATE',
    'SAUDIZATION','ISO_CERTIFICATE','VENDOR_APPROVAL','MOI_LICENSE',
    'CONTRACT','MOU','BANK_GUARANTEE','INSURANCE','OTHER',
  ],
  PROJECT: [
    'CONTRACT','MOU','PURCHASE_ORDER','BANK_GUARANTEE','INSURANCE',
    'COMPLETION_CERTIFICATE','HANDOVER_CERTIFICATE','VARIATION_ORDER','OTHER',
  ],
  COMPANY: [
    'CR','VAT_CERTIFICATE','CHAMBER_OF_COMMERCE','GOSI_CERTIFICATE',
    'SAUDIZATION','MOI_LICENSE','ARAMCO_APPROVAL','SABIC_APPROVAL','ISO_CERTIFICATE','OTHER',
  ],
}

const ALL_CAT_KEYS = [...new Set(Object.values(DOC_CATEGORIES).flat())]

const CAT_LABELS = {
  IQAMA:'Iqama (Residency Permit)',
  DRIVING_LICENSE:'Driving Licence',
  PASSPORT:'Passport',
  NATIONAL_ID:'National ID (Saudi)',
  QIWA:'QIWA Certificate',
  SCE:'SCE Certificate',
  MEDICAL_INSURANCE:'Medical Insurance',
  WORK_PERMIT:'Work Permit',
  EMPLOYMENT_CONTRACT:'Employment Contract',
  SALARY_CERTIFICATE:'Salary Certificate',
  TRAINING_CERTIFICATE:'Training Certificate',
  GOSI_CERTIFICATE:'GOSI Certificate',
  CR:'CR (Commercial Registration)',
  VAT_CERTIFICATE:'VAT Registration Certificate',
  CHAMBER_OF_COMMERCE:'Chamber of Commerce',
  SAUDIZATION:'Saudization / Nitaqat',
  ISO_CERTIFICATE:'ISO Certificate',
  VENDOR_APPROVAL:'Vendor / Client Approval',
  MOI_LICENSE:'MOI License',
  BANK_GUARANTEE:'Bank Guarantee',
  ARAMCO_APPROVAL:'Aramco Approval',
  SABIC_APPROVAL:'SABIC Approval',
  PERFORMANCE_BOND:'Performance Bond',
  ISTIMARA:'Istimara (Vehicle Registration)',
  INSPECTION:'Inspection / Fahas Certificate',
  LEASING_CONTRACT:'Leasing / Rental Contract',
  PURCHASE_ORDER:'Purchase Order',
  COMPLETION_CERTIFICATE:'Completion Certificate',
  HANDOVER_CERTIFICATE:'Handover Certificate',
  VARIATION_ORDER:'Variation Order',
  MOU:'MOU',
  CONTRACT:'Contract',
  CERTIFICATE:'Certificate',
  LICENSE:'License',
  INVOICE:'Invoice',
  LEGAL:'Legal Document',
  INSURANCE:'Insurance',
  DEPENDENT_IQAMA:'Dependent Iqama',
  DEPENDENT_PASSPORT:'Dependent Passport',
  DEPENDENT_INSURANCE:'Dependent Medical Insurance',
  OTHER:'Other',
}

const CAT_ICONS = {
  IQAMA:'🪪', DRIVING_LICENSE:'🚗', PASSPORT:'✈️', NATIONAL_ID:'🪪',
  QIWA:'💼', SCE:'🏗️', MEDICAL_INSURANCE:'🏥', WORK_PERMIT:'📋',
  EMPLOYMENT_CONTRACT:'📄', SALARY_CERTIFICATE:'💰', TRAINING_CERTIFICATE:'🏅',
  CR:'🏢', VAT_CERTIFICATE:'💹', CHAMBER_OF_COMMERCE:'🏛️',
  GOSI_CERTIFICATE:'🛡️', SAUDIZATION:'🇸🇦', ISO_CERTIFICATE:'✅',
  VENDOR_APPROVAL:'👍', MOI_LICENSE:'⚖️', BANK_GUARANTEE:'🏦',
  ARAMCO_APPROVAL:'⛽', SABIC_APPROVAL:'🧪', PERFORMANCE_BOND:'📑',
  ISTIMARA:'🚘', INSPECTION:'🔍', LEASING_CONTRACT:'🔑',
  PURCHASE_ORDER:'📦', COMPLETION_CERTIFICATE:'✔️', HANDOVER_CERTIFICATE:'🤝',
  VARIATION_ORDER:'🔄', MOU:'🤝', CONTRACT:'📄', CERTIFICATE:'🏅',
  LICENSE:'🪪', INVOICE:'🧾', LEGAL:'⚖️', INSURANCE:'🛡️',
  DEPENDENT_IQAMA:'👨‍👩‍👧', DEPENDENT_PASSPORT:'🛂', DEPENDENT_INSURANCE:'👪',
  OTHER:'📁',
}

// Auto-fill issuing authority
const ISSUING_AUTHORITY = {
  IQAMA:'Ministry of Interior (MOI)',
  DRIVING_LICENSE:'General Directorate of Traffic (MOI)',
  PASSPORT:'General Directorate of Passports (MOI)',
  NATIONAL_ID:'National Information Center (NIC)',
  QIWA:'Ministry of Human Resources (MHRSD) — QIWA',
  SCE:'Saudi Council of Engineers (SCE)',
  WORK_PERMIT:'Ministry of Human Resources (MHRSD)',
  GOSI_CERTIFICATE:'General Organization for Social Insurance (GOSI)',
  CR:'Ministry of Commerce (MOC)',
  VAT_CERTIFICATE:'Zakat, Tax and Customs Authority (ZATCA)',
  CHAMBER_OF_COMMERCE:'Chamber of Commerce',
  SAUDIZATION:'Ministry of Human Resources (MHRSD)',
  MOI_LICENSE:'Ministry of Interior (MOI)',
  ARAMCO_APPROVAL:'Saudi Aramco',
  SABIC_APPROVAL:'SABIC',
  ISTIMARA:'General Directorate of Traffic (MOI)',
  INSPECTION:'General Directorate of Traffic (MOI)',
  ISO_CERTIFICATE:'ISO Certification Body',
  DEPENDENT_IQAMA:'General Directorate of Passports (JAWAZAT)',
  DEPENDENT_PASSPORT:'Home Country Embassy / Consulate',
  DEPENDENT_INSURANCE:'Insurance Provider',
}

// Who bears responsibility — 'COMPANY' = on us, 'EMPLOYEE' = employee's own obligation
const DOC_RESPONSIBLE = {
  DEPENDENT_IQAMA:      'COMPANY',   // sponsored + paid by employer
  DEPENDENT_INSURANCE:  'COMPANY',   // covered by employer
  DEPENDENT_PASSPORT:   'EMPLOYEE',  // employee's personal responsibility
}

// Static company list (entities in this ACCSYS installation)
const COMPANY_LIST = [
  { id:'ACCSYS', name:'Ratal Advanced Technologies' },
  { id:'RAT',    name:'Ratal Tours & Travels' },
  { id:'GWT',    name:'Green Wings Travel' },
]

// Entity tables for lookup
// filter: optional { col, val } applied as .eq(col, val)
// selectCols: override the auto-built select string
// displayFn: custom option label builder fn(row) → string
const LINK_TABLE = {
  EMPLOYEE:       { table:'employees',   labelCol:'full_name_en',  numberCol:'employee_number' },
  PROJECT:        { table:'projects',    labelCol:'project_name',  numberCol:'project_number' },
  VEHICLE:        {
    table:'vehicles',
    labelCol:'plate_number',
    numberCol:'make',
    selectCols:'id,plate_number,vehicle_type,make,model',
    displayFn: r => [r.plate_number, [r.vehicle_type,r.make,r.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
  },
  CONTRACTOR:     { table:'contractors', labelCol:'company_name',  numberCol:'cr_number', filter:{ col:'vendor_type', val:'CONTRACTOR' } },
  SUBCONTRACTOR:  { table:'contractors', labelCol:'company_name',  numberCol:'cr_number', filter:{ col:'vendor_type', val:'SUB_CONTRACTOR' } },
  SUPPLIER:       { table:'contractors', labelCol:'company_name',  numberCol:'cr_number', filter:{ col:'vendor_type', val:'SUPPLIER' } },
  LOCAL_SUPPLIER: { table:'contractors', labelCol:'company_name',  numberCol:'cr_number', filter:{ col:'vendor_type', val:'LOCAL_SUPPLIER' } },
  VENDOR:         { table:'contractors', labelCol:'company_name',  numberCol:'cr_number', filter:{ col:'vendor_type', val:'VENDOR' } },
}

const STATUSES    = ['ACTIVE','EXPIRING_SOON','EXPIRED','RENEWED','CANCELLED']
const LINK_TYPES  = ['EMPLOYEE','PROJECT','CONTRACTOR','SUBCONTRACTOR','VEHICLE','COMPANY','OTHER']

const STATUS_COLORS = {
  ACTIVE:        { bg:'#e8f5e9', color:'#2e7d32', border:'#a5d6a7' },
  EXPIRING_SOON: { bg:'#fff8e1', color:'#f57f17', border:'#ffe082' },
  EXPIRED:       { bg:'#ffebee', color:'#c62828', border:'#ef9a9a' },
  RENEWED:       { bg:'#e3f2fd', color:'#1565C0', border:'#90caf9' },
  CANCELLED:     { bg:'#f5f5f5', color:'#757575', border:'#e0e0e0' },
}

const fmtD = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'

function daysUntil(expiry_date) {
  if (!expiry_date) return null
  return Math.ceil((new Date(expiry_date) - new Date()) / 86400000)
}

function computeStatus(doc) {
  if (!doc.expiry_date) return doc.status||'ACTIVE'
  const d = daysUntil(doc.expiry_date)
  if (d < 0) return 'EXPIRED'
  if (d <= (doc.alert_days||30)) return 'EXPIRING_SOON'
  return (doc.status==='EXPIRED'||doc.status==='RENEWED'||doc.status==='CANCELLED') ? doc.status : 'ACTIVE'
}

// ── Add / Edit modal ─────────────────────────────────────────────────
// Redesigned flow: Link To → Entity → Doc Type → number/notes → dates + file

const STEP_NAMES = ['Who & What', 'Dates & Attachments']

function DocModal({ entityId, item, preLinkedType, preCategory, onClose, onSaved }) {
  const { user } = useAuth()
  const isEdit = !!(item?.id)

  const [step, setStep] = useState(1)
  const [linkedType, setLinkedType] = useState(item?.linked_type || preLinkedType || '')
  const [linkedId,   setLinkedId]   = useState(item?.linked_id   || '')
  const [linkedName, setLinkedName] = useState(item?.linked_name  || '')
  const [category,   setCategory]   = useState(item?.category     || preCategory || '')
  const [docNumber,  setDocNumber]  = useState(item?.doc_number   || '')
  const [issuedBy,   setIssuedBy]   = useState(item?.issued_by    || '')
  const [counterparty, setCounterparty] = useState(item?.counterparty || '')
  const [notes,      setNotes]      = useState(item?.description  || item?.notes || '')
  const [issueDate,  setIssueDate]  = useState(item?.issue_date   || '')
  const [effectiveDate, setEffDate] = useState(item?.effective_date || '')
  const [expiryDate, setExpiryDate] = useState(item?.expiry_date  || '')
  const [alertDays,  setAlertDays]  = useState(item?.alert_days   || 30)
  const [renewable,  setRenewable]  = useState(item?.is_renewable || false)
  const [status,     setStatusV]    = useState(item?.status       || 'ACTIVE')
  const [department, setDepartment] = useState(item?.department   || '')
  const [ownerName,  setOwnerName]  = useState(item?.owner_name   || '')
  const [file,       setFile]       = useState(null)
  const [fileUrl,    setFileUrl]    = useState(item?.file_url     || '')
  const [fileName,   setFileName]   = useState(item?.file_name    || '')

  const [lookupList,    setLookupList]    = useState([])
  const [lookupLoading, setLookupLoading] = useState(false)
  const [deptMap,       setDeptMap]       = useState({})
  const [saving,        setSaving]        = useState(false)
  const [uploading,     setUploading]     = useState(false)
  const [err,           setErr]           = useState('')

  // Dependent selector (for DEPENDENT_* doc types under EMPLOYEE)
  const [depList,    setDepList]    = useState([])
  const [depLoading, setDepLoading] = useState(false)
  const [depId,      setDepId]      = useState(item?.dependent_id || '')
  const [depName,    setDepName]    = useState(item?.dependent_name || '')

  const DEPENDENT_DOC_TYPES = ['DEPENDENT_IQAMA','DEPENDENT_PASSPORT','DEPENDENT_INSURANCE']
  const isDepType = DEPENDENT_DOC_TYPES.includes(category ?? '')

  // Available doc types for this linked type
  const docTypes = DOC_CATEGORIES[linkedType] || []

  // Load entity lookup when linked type changes
  useEffect(() => {
    const cfg = LINK_TABLE[linkedType]
    if (!cfg || !entityId) { setLookupList([]); return }
    setLookupLoading(true)
    const selectStr = cfg.selectCols || `id,${cfg.labelCol}${cfg.numberCol ? ','+cfg.numberCol : ''}`
    let q = supabase.from(cfg.table)
      .select(selectStr)
      .eq('entity_id', entityId)
    if (cfg.filter) q = q.eq(cfg.filter.col, cfg.filter.val)
    q.order(cfg.labelCol)
      .then(({ data }) => { setLookupList(data||[]); setLookupLoading(false) })
    if (linkedType === 'EMPLOYEE') {
      supabase.from('departments').select('id,dept_code,dept_name').eq('entity_id', entityId)
        .then(({ data }) => {
          const m = {}; (data||[]).forEach(d=>{m[d.id]=d}); setDeptMap(m)
        })
    }
  }, [linkedType, entityId])

  // Auto-set first doc type when linked type changes (only if category doesn't fit)
  useEffect(() => {
    const types = DOC_CATEGORIES[linkedType] || []
    if (types.length && !types.includes(category)) setCategory(types[0])
  }, [linkedType])

  // Auto-fill issuing authority + responsibility when doc type changes
  useEffect(() => {
    const auth = ISSUING_AUTHORITY[category]
    if (auth) { setIssuedBy(auth); setCounterparty(auth) }
    // Override ownerName for dependent doc types
    const resp = DOC_RESPONSIBLE[category]
    if (resp === 'EMPLOYEE') setOwnerName('Employee (Personal Responsibility)')
    else if (resp === 'COMPANY') setOwnerName('') // will be set by entity lookup below
  }, [category])

  // Load dependent list when employee is selected and doc type is a dependent type
  useEffect(() => {
    if (linkedType !== 'EMPLOYEE' || !linkedId || !isDepType) {
      setDepList([]); return
    }
    setDepLoading(true)
    supabase.from('employee_dependents')
      .select('id,full_name,relationship,iqama_expiry,insurance_expiry')
      .eq('employee_id', linkedId)
      .eq('entity_id', entityId)
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => { setDepList(data||[]); setDepLoading(false) })
  }, [linkedId, isDepType])

  // Auto-fill dept/owner when employee selected
  useEffect(() => {
    if (linkedType !== 'EMPLOYEE' || !linkedId) return
    supabase.from('employees').select('id,department_id,employee_category,entity_code').eq('id', linkedId).maybeSingle()
      .then(({ data: emp }) => {
        if (!emp) return
        const dept = deptMap[emp.department_id]
        if (dept) setDepartment(dept.dept_code || dept.dept_name)
        const ENTITY_CO = { ACCSYS:'Ratal Advanced Technologies', RAT:'Ratal Group', GWT:'GWT' }
        const cat = emp.employee_category || ''
        setOwnerName(cat === '03' ? 'Self' : (ENTITY_CO[emp.entity_code] || ENTITY_CO.ACCSYS))
      })
  }, [linkedId, deptMap])

  const autoTitle = CAT_LABELS[category] || category

  async function uploadFile(f) {
    if (!f) return null
    setUploading(true)
    const path = `${entityId}/${Date.now()}_${f.name}`
    const { error } = await supabase.storage.from('documents').upload(path, f, { upsert:true })
    setUploading(false)
    if (error) throw new Error('Upload failed: ' + error.message)
    const { data:{ publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
    return { url: publicUrl, name: f.name, type: f.name.split('.').pop().toUpperCase(), size: Math.round(f.size/1024) }
  }

  async function save() {
    if (!category)  { setErr('Select a document type'); return }
    setSaving(true); setErr('')
    let fileData = {}
    if (file) {
      try { const up = await uploadFile(file); if (up) fileData = { file_url:up.url, file_name:up.name, file_type:up.type, file_size_kb:up.size } }
      catch(e) { setErr(e.message); setSaving(false); return }
    }
    const row = {
      entity_id: entityId,
      title: autoTitle,
      doc_number: docNumber||null,
      category,
      description: notes||null,
      counterparty: counterparty||null,
      issued_by: issuedBy||null,
      issue_date: issueDate||null,
      effective_date: effectiveDate||null,
      expiry_date: expiryDate||null,
      alert_days: +alertDays||30,
      is_renewable: renewable,
      status,
      linked_type: linkedType||null,
      linked_id: linkedId||null,
      linked_name: linkedName||null,
      dependent_id: (isDepType && depId) ? depId : null,
      dependent_name: (isDepType && depName) ? depName : null,
      department: department||null,
      owner_name: ownerName||null,
      owner_user_id: user?.id||null,
      notes: notes||null,
      created_by: user?.id||null,
      ...fileData,
    }
    const { error } = isEdit
      ? await supabase.from('documents').update(row).eq('id', item.id)
      : await supabase.from('documents').insert(row)
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  const inp = (extra={}) => ({ padding:'9px 11px', borderRadius:8, border:`1.5px solid ${PRI}33`, fontSize:13, outline:'none', background:'#fff', width:'100%', boxSizing:'border-box', fontFamily:PP, ...extra })
  const lbl = { display:'block', fontSize:10, fontWeight:700, color:'#6b7c93', marginBottom:5, textTransform:'uppercase', letterSpacing:0.5 }
  const mb  = { marginBottom:14 }

  // Linked type meta for step 1 header
  const ltMeta = SIDEBAR_CATS.find(c=>c.key===linkedType)

  return (
    <FormShell
      isOpen={true}
      onClose={onClose}
      chapterName="Administration"
      title={isEdit ? ['Edit', 'Document', 'Record'] : ['New', 'Document', 'Record']}
      description={isEdit ? 'Update document details and attachment.' : 'Select who this document belongs to, then the document type.'}
      steps={STEP_NAMES}
      currentStep={step}
      onBack={step===1 ? onClose : () => setStep(1)}
      backLabel={step===1 ? 'Cancel' : 'Back'}
      onNext={step < 2
        ? () => { if (!linkedType) { setErr('Select entity type'); return }; if (!category) { setErr('Select document type'); return }; setErr(''); setStep(2) }
        : save
      }
      nextLabel={step < 2 ? 'Next →' : (saving ? 'Saving…' : (isEdit ? 'Update' : 'Save Document'))}
      nextDisabled={saving || uploading}
    >
      <div style={{ fontFamily:PP }}>

        {/* ── STEP 1: Who & What ── */}
        {step === 1 && (
          <>
            {/* Entity type strip */}
            <div style={mb}>
              <label style={lbl}>This document belongs to *</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
                {SIDEBAR_CATS.map(cat => (
                  <button key={cat.key}
                    onClick={() => { setLinkedType(cat.key); setLinkedId(''); setLinkedName('') }}
                    style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 13px', borderRadius:20,
                      border:`2px solid ${linkedType===cat.key ? cat.color : cat.color+'44'}`,
                      background: linkedType===cat.key ? cat.color : cat.light,
                      color: linkedType===cat.key ? '#fff' : cat.color,
                      fontFamily:PP, fontSize:12, fontWeight:700, cursor:'pointer', transition:'all .12s' }}>
                    <span>{cat.icon}</span> {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Entity + Doc Type  — single row, two dropdowns ── */}
            {linkedType && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>

                {/* LEFT — entity selector */}
                <div>
                  <label style={lbl}>
                    {linkedType==='EMPLOYEE'       ? 'Employee *'
                    : linkedType==='PROJECT'       ? 'Project *'
                    : linkedType==='VEHICLE'       ? 'Vehicle (Fleet) *'
                    : linkedType==='CONTRACTOR'    ? 'Contractor *'
                    : linkedType==='SUBCONTRACTOR' ? 'Sub-contractor *'
                    : linkedType==='SUPPLIER'      ? 'Supplier *'
                    : linkedType==='LOCAL_SUPPLIER'? 'Local Supplier *'
                    : linkedType==='VENDOR'        ? 'Vendor *'
                    : linkedType==='COMPANY'       ? 'Company / Entity Name'
                    : 'Linked To (optional)'}
                  </label>

                  {linkedType === 'COMPANY' ? (
                    <select style={inp()} value={linkedId}
                      onChange={e => {
                        const co = COMPANY_LIST.find(c => c.id === e.target.value)
                        setLinkedId(e.target.value)
                        setLinkedName(co ? co.name : '')
                      }}>
                      <option value="">— Select company —</option>
                      {COMPANY_LIST.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>

                  ) : lookupLoading ? (
                    <div style={{ ...inp(), color:'#6b7c93', display:'flex', alignItems:'center' }}>Loading…</div>

                  ) : lookupList.length > 0 ? (
                    <select style={inp()} value={linkedId}
                      onChange={e => {
                        const rec = lookupList.find(r => String(r.id)===e.target.value)
                        const cfg = LINK_TABLE[linkedType]
                        setLinkedId(e.target.value)
                        setLinkedName(rec ? rec[cfg.labelCol] : '')
                      }}>
                      <option value="">— Select —</option>
                      {lookupList.map(r => {
                        const cfg = LINK_TABLE[linkedType]
                        const label = cfg.displayFn
                          ? cfg.displayFn(r)
                          : `${r[cfg.labelCol]||'—'}${r[cfg.numberCol] ? ` · ${r[cfg.numberCol]}` : ''}`
                        return <option key={r.id} value={r.id}>{label}</option>
                      })}
                    </select>

                  ) : (
                    <input style={inp()} value={linkedName}
                      onChange={e=>setLinkedName(e.target.value)}
                      placeholder="Type name manually" />
                  )}
                </div>

                {/* RIGHT — document type dropdown */}
                <div>
                  <label style={lbl}>Document Type *</label>
                  <select style={inp()} value={category} onChange={e=>setCategory(e.target.value)}>
                    <option value="">— Select type —</option>
                    {docTypes.map(t => (
                      <option key={t} value={t}>{CAT_ICONS[t]||'📄'} {CAT_LABELS[t]||t.replace(/_/g,' ')}</option>
                    ))}
                  </select>
                  {DOC_RESPONSIBLE[category] && (
                    <div style={{ marginTop:5, display:'flex', alignItems:'center', gap:5, fontSize:11 }}>
                      {DOC_RESPONSIBLE[category]==='COMPANY'
                        ? <span style={{ background:'#e3f2fd', color:'#1565c0', border:'1px solid #90caf9', borderRadius:10, padding:'2px 8px', fontWeight:700 }}>🏢 Company Responsibility</span>
                        : <span style={{ background:'#fff8e1', color:'#f57f17', border:'1px solid #ffe082', borderRadius:10, padding:'2px 8px', fontWeight:700 }}>👤 Employee Responsibility</span>
                      }
                    </div>
                  )}
                </div>

              </div>
            )}

            {/* ── Dependent selector (shows when a DEPENDENT_* doc type is chosen) ── */}
            {linkedType === 'EMPLOYEE' && linkedId && isDepType && (
              <div style={{ marginBottom:14, background:'#fce4ec', border:'1.5px solid #f48fb1', borderRadius:10, padding:'10px 14px' }}>
                <label style={{ ...lbl, color:'#c62828' }}>
                  👨‍👩‍👧 Select Dependent *
                  <span style={{ fontSize:10, fontWeight:400, marginLeft:6, color:'#e57373' }}>
                    — this document belongs to which family member?
                  </span>
                </label>
                {depLoading ? (
                  <div style={{ ...inp(), color:'#9e9e9e' }}>Loading dependents…</div>
                ) : depList.length === 0 ? (
                  <div style={{ fontSize:12, color:'#e57373', padding:'8px 0' }}>
                    ⚠️ No dependents registered for this employee. Add them in the Employees → Dependents tab first.
                  </div>
                ) : (
                  <select style={{ ...inp(), borderColor:'#f48fb1' }} value={depId}
                    onChange={e => {
                      const dep = depList.find(d => d.id === e.target.value)
                      setDepId(e.target.value)
                      setDepName(dep ? dep.full_name : '')
                    }}>
                    <option value="">— Select dependent —</option>
                    {depList.map(dep => (
                      <option key={dep.id} value={dep.id}>
                        {dep.full_name} ({dep.relationship})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Auto-generated title preview */}
            {category && (
              <div style={{ ...mb, background:L2, border:`1px solid ${L1}`, borderRadius:9, padding:'9px 13px', display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:18 }}>{CAT_ICONS[category]||'📄'}</span>
                <div>
                  <div style={{ fontSize:10, color:'#6b7c93', fontWeight:700, letterSpacing:.5, textTransform:'uppercase' }}>Document title (auto)</div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1a2332' }}>{autoTitle}</div>
                </div>
              </div>
            )}

            {/* Doc number + issuing authority */}
            {category && (
              <>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                  <div>
                    <label style={lbl}>Document Number / Ref</label>
                    <input style={inp()} value={docNumber} onChange={e=>setDocNumber(e.target.value)} placeholder="Iqama#, policy#, CR#…" />
                  </div>
                  <div>
                    <label style={lbl}>Issued By {ISSUING_AUTHORITY[category]&&<span style={{ color:'#2e7d32', fontWeight:500, textTransform:'none' }}> ✓ auto</span>}</label>
                    <input style={inp()} value={issuedBy} onChange={e=>setIssuedBy(e.target.value)} placeholder="Issuing authority" />
                  </div>
                </div>
                <div style={mb}>
                  <label style={lbl}>Notes</label>
                  <textarea style={{ ...inp(), minHeight:56, resize:'vertical' }} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Renewal notes, contact…" />
                </div>
              </>
            )}
          </>
        )}

        {/* ── STEP 2: Dates & Attachments ── */}
        {step === 2 && (
          <>
            {/* Summary chip */}
            <div style={{ ...mb, background:L2, border:`1px solid ${L1}`, borderRadius:9, padding:'9px 13px', display:'flex', gap:10, alignItems:'center' }}>
              <span style={{ fontSize:20 }}>{CAT_ICONS[category]||'📄'}</span>
              <div>
                <div style={{ fontWeight:700, fontSize:13, color:'#1a2332' }}>{autoTitle}</div>
                <div style={{ fontSize:11, color:'#6b7c93' }}>{ltMeta?.icon} {linkedName||ltMeta?.label}</div>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div>
                <label style={lbl}>Issue Date</label>
                <input type="date" style={inp()} value={issueDate} onChange={e=>setIssueDate(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Effective Date</label>
                <input type="date" style={inp()} value={effectiveDate} onChange={e=>setEffDate(e.target.value)} />
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div>
                <label style={lbl}>Expiry Date</label>
                <input type="date" style={inp()} value={expiryDate} onChange={e=>setExpiryDate(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Alert before expiry (days)</label>
                <input type="number" style={inp()} value={alertDays} min={1} onChange={e=>setAlertDays(e.target.value)} />
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div>
                <label style={lbl}>Department {linkedType==='EMPLOYEE'&&department&&<span style={{ color:'#2e7d32', fontWeight:500, textTransform:'none' }}> ✓ auto</span>}</label>
                {Object.keys(deptMap).length > 0
                  ? <select style={inp()} value={department} onChange={e=>setDepartment(e.target.value)}>
                      <option value="">— Select —</option>
                      {Object.values(deptMap).sort((a,b)=>(a.dept_code||'').localeCompare(b.dept_code||'')).map(d=>(
                        <option key={d.id} value={d.dept_code||d.dept_name}>{d.dept_code} — {d.dept_name}</option>
                      ))}
                    </select>
                  : <input style={inp()} value={department} onChange={e=>setDepartment(e.target.value)} placeholder="e.g. TISU, NIS…" />
                }
              </div>
              <div>
                <label style={lbl}>Owner / Responsible</label>
                <input style={inp()} value={ownerName} onChange={e=>setOwnerName(e.target.value)} placeholder="Responsible for renewal" />
              </div>
            </div>
            <div style={mb}>
              <label style={lbl}>File Attachment</label>
              {fileUrl && !file && (
                <div style={{ fontSize:12, color:'#2e7d32', marginBottom:6 }}>
                  📎 Current: <a href={fileUrl} target="_blank" rel="noreferrer" style={{ color:PRI }}>{fileName||'View file'}</a>
                </div>
              )}
              <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls"
                onChange={e=>setFile(e.target.files[0])} style={{ ...inp(), padding:'7px' }} />
              {file && <div style={{ fontSize:11, color:'#546e7a', marginTop:4 }}>📎 {file.name} ({Math.round(file.size/1024)} KB)</div>}
              {uploading && <div style={{ fontSize:11, color:PRI, marginTop:4 }}>Uploading…</div>}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div>
                <label style={lbl}>Status</label>
                <select style={inp()} value={status} onChange={e=>setStatusV(e.target.value)}>
                  {STATUSES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', alignItems:'center', paddingTop:22 }}>
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, cursor:'pointer' }}>
                  <input type="checkbox" checked={renewable} onChange={e=>setRenewable(e.target.checked)} />
                  Document is renewable
                </label>
              </div>
            </div>
          </>
        )}

        {err && <div style={{ color:'#c62828', fontSize:12, marginTop:6, padding:'6px 10px', background:'#ffebee', borderRadius:7 }}>{err}</div>}
      </div>
    </FormShell>
  )
}

// ── Document card ─────────────────────────────────────────────────────
function DocCard({ doc, onEdit, onDelete }) {
  const st  = computeStatus(doc)
  const sc  = STATUS_COLORS[st] || STATUS_COLORS.ACTIVE
  const days = daysUntil(doc.expiry_date)

  return (
    <div style={{ background:'#fff', borderRadius:12, padding:'13px 15px',
      boxShadow:'0 2px 8px rgba(0,0,0,0.07)', borderLeft:`4px solid ${sc.border}` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:7 }}>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontSize:16 }}>{CAT_ICONS[doc.category]||'📁'}</span>
          <span style={{ background:sc.bg, color:sc.color, border:`1px solid ${sc.border}`, borderRadius:20, padding:'2px 9px', fontSize:10, fontWeight:700 }}>{st}</span>
        </div>
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={()=>onEdit(doc)} style={{ background:'transparent', color:PRI, border:`1px solid ${PRI}`, borderRadius:6, padding:'3px 8px', fontSize:10, cursor:'pointer' }}>Edit</button>
          <button onClick={()=>onDelete(doc)} style={{ background:'transparent', color:'#c62828', border:'1px solid #ef9a9a', borderRadius:6, padding:'3px 8px', fontSize:10, cursor:'pointer' }}>Del</button>
        </div>
      </div>
      <div style={{ fontWeight:700, fontSize:13, color:'#1a2e3d', marginBottom:3 }}>{doc.title}</div>
      {doc.linked_name && <div style={{ fontSize:11, color:'#546e7a', marginBottom:3 }}>🔗 {doc.linked_name}</div>}
      {doc.doc_number   && <div style={{ fontSize:11, color:'#6b7c93', fontFamily:'monospace' }}>#{doc.doc_number}</div>}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', fontSize:11, color:'#6b7c93', marginTop:7 }}>
        {doc.expiry_date && (
          <span style={{ color:sc.color, fontWeight:700 }}>
            {days !== null && days < 0 ? `Expired ${Math.abs(days)}d ago` :
             days !== null && days <= 30 ? `Expires in ${days}d` :
             `Exp: ${fmtD(doc.expiry_date)}`}
          </span>
        )}
        {doc.owner_name && <span>👤 {doc.owner_name}</span>}
      </div>
      {doc.file_url && (
        <div style={{ marginTop:7 }}>
          <a href={doc.file_url} target="_blank" rel="noreferrer"
            style={{ fontSize:11, color:PRI, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:4 }}>
            📎 {doc.file_name||'View attachment'}
          </a>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main page
// ═══════════════════════════════════════════════════════════════════
// Layout model:
//  Outer  = flex row, fixed height (100vh - chrome), overflow:hidden
//  Sidebar = 240px, own overflowY:auto
//  Main    = flex:1, own overflowY:auto  ← THE SCROLL OWNER
//    Sticky strip (position:sticky top:0) = KPI cards + filter bar
//    Table with <thead position:sticky top:STRIP_HEIGHT>
//
// STRIP_HEIGHT ≈ 114px  (KPI row 62px + filter row 52px)
// ═══════════════════════════════════════════════════════════════════

const STRIP_H = 114  // px — must match sticky strip rendered height

export default function DocumentVault({ entityId }) {
  const [docs,          setDocs]          = useState([])
  const [loading,       setLoading]       = useState(true)
  const [modal,         setModal]         = useState(null)
  const [preLinked,     setPreLinked]     = useState('')
  const [preCat,        setPreCat]        = useState('')
  const [search,        setSearch]        = useState('')
  const [filterLinked,  setFilterLinked]  = useState('')
  const [filterCat,     setFilterCat]     = useState('')
  const [tableOpen,       setTableOpen]       = useState(true)
  const [groupByEntity,   setGroupByEntity]   = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState({})
  const [expandedRows,    setExpandedRows]    = useState({})
  const [filterSt,      setFilterSt]      = useState('')

  const load = useCallback(async () => {
    if (!entityId) return
    setLoading(true)
    const { data } = await supabase.from('documents').select('*')
      .eq('entity_id', entityId)
      .order('expiry_date', { ascending:true, nullsFirst:false })
    setDocs(data||[])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  // doc types available for the selected linked type (or all)
  const availableCatKeys = filterLinked ? (DOC_CATEGORIES[filterLinked] || ALL_CAT_KEYS) : ALL_CAT_KEYS

  async function handleDelete(doc) {
    if (!window.confirm(`Delete "${doc.title}"?`)) return
    await supabase.from('documents').delete().eq('id', doc.id)
    load()
  }

  function openNewModal(lt='', cat='') {
    setPreLinked(lt); setPreCat(cat); setModal('new')
  }

  const enriched = docs.map(d=>({ ...d, _st: computeStatus(d) }))
  const expired  = enriched.filter(d=>d._st==='EXPIRED').length
  const expiring = enriched.filter(d=>d._st==='EXPIRING_SOON').length
  const active   = enriched.filter(d=>d._st==='ACTIVE').length

  const visible = enriched
    .filter(d => !filterLinked || d.linked_type === filterLinked)
    .filter(d => !filterCat    || d.category    === filterCat)
    .filter(d => !filterSt     || d._st          === filterSt)
    .filter(d => !search ||
      (d.title||'').toLowerCase().includes(search.toLowerCase()) ||
      (d.doc_number||'').toLowerCase().includes(search.toLowerCase()) ||
      (d.linked_name||'').toLowerCase().includes(search.toLowerCase()) ||
      (d.counterparty||'').toLowerCase().includes(search.toLowerCase()))

  const TH = { padding:'10px 12px', textAlign:'left', fontSize:10, fontWeight:700, color:'#fff',
               textTransform:'uppercase', letterSpacing:.8, whiteSpace:'nowrap', fontFamily:PP,
               background:'#454D9B', borderBottom:'2px solid #353d82' }

  return (
    // ── Outer shell ─ fixed height, clips overflow so main can scroll ──
    // chrome = 52px topbar + 1 border + 58px chapter header + 1 border = 112px
    // App.jsx content wrapper bottom padding = 22px  →  total offset = 134px
    <div style={{ fontFamily:PP, height:'calc(100vh - 134px)', overflow:'hidden' }}>

      {/* ── MAIN (full-width, scroll owner) ── */}
      <div style={{ height:'100%', overflowY:'auto', overflowX:'hidden', display:'flex', flexDirection:'column', background:'#f8f9fb' }}>

        {/* ── STICKY STRIP (KPI + filters) ── */}
        <div style={{ position:'sticky', top:0, zIndex:30, background:'#f8f9fb',
          borderBottom:`1px solid ${L1}88`, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>

          {/* Row 1 — KPI cards + Add button */}
          <div style={{ display:'flex', gap:8, alignItems:'center', padding:'10px 22px 8px' }}>
            {[
              { label:'Total',    val:docs.length, color:'#454D9B', st:'' },
              { label:'Active',   val:active,      color:'#2e7d32', st:'ACTIVE' },
              { label:'Expiring', val:expiring,    color:'#e65100', st:'EXPIRING_SOON' },
              { label:'Expired',  val:expired,     color:'#c62828', st:'EXPIRED' },
            ].map(k=>(
              <div key={k.label} onClick={()=>setFilterSt(filterSt===k.st?'':k.st)}
                style={{ background:`linear-gradient(135deg,${k.color}cc,${k.color})`,
                  borderRadius:9, padding:'6px 16px', cursor:'pointer', minWidth:80,
                  boxShadow:filterSt===k.st?`0 0 0 2px #fff,0 0 0 4px ${k.color}`:`0 2px 6px ${k.color}44` }}>
                <div style={{ fontSize:9, color:'rgba(255,255,255,0.85)', fontWeight:700, textTransform:'uppercase', letterSpacing:.8 }}>{k.label}</div>
                <div style={{ fontSize:22, fontWeight:900, color:'#fff', lineHeight:1.2 }}>{k.val}</div>
              </div>
            ))}
            {expiring > 0 && !filterSt && (
              <div style={{ fontSize:11, color:'#f57f17', background:'#fff8e1', border:'1px solid #ffe082',
                borderRadius:8, padding:'5px 10px', whiteSpace:'nowrap', fontWeight:700 }}>
                ⏳ {expiring} expiring soon
              </div>
            )}
            <div style={{ flex:1 }} />
            <button onClick={()=>openNewModal(filterLinked||'', filterCat||'')}
              style={{ padding:'8px 20px', borderRadius:9, border:'none',
                background:`linear-gradient(135deg,${PRI},#6a72c1)`, color:'#fff',
                fontFamily:PP, fontSize:13, fontWeight:700, cursor:'pointer',
                boxShadow:`0 2px 6px ${PRI}55`, whiteSpace:'nowrap' }}>
              + Add Document
            </button>
          </div>

          {/* Row 2 — Entity type · Doc type · Status · Search */}
          <div style={{ display:'flex', gap:8, alignItems:'center', padding:'0 22px 10px', flexWrap:'wrap' }}>

            {/* Entity type filter */}
            <select value={filterLinked}
              onChange={e=>{ setFilterLinked(e.target.value); setFilterCat('') }}
              style={{ padding:'7px 10px', borderRadius:8, border:`1.5px solid ${filterLinked?PRI:PRI+'33'}`,
                fontSize:12, background: filterLinked?L2:'#fff', fontFamily:PP, cursor:'pointer', outline:'none',
                color: filterLinked?PRI:'#546e7a', fontWeight: filterLinked?700:400 }}>
              <option value=''>All entity types</option>
              {SIDEBAR_CATS.map(c=><option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
            </select>

            {/* Doc type filter — scoped to selected entity type */}
            <select value={filterCat} onChange={e=>setFilterCat(e.target.value)}
              style={{ padding:'7px 10px', borderRadius:8, border:`1.5px solid ${filterCat?PRI:PRI+'33'}`,
                fontSize:12, background: filterCat?L2:'#fff', fontFamily:PP, cursor:'pointer', outline:'none',
                color: filterCat?PRI:'#546e7a', fontWeight: filterCat?700:400 }}>
              <option value=''>All doc types</option>
              {availableCatKeys.map(k=><option key={k} value={k}>{CAT_ICONS[k]} {CAT_LABELS[k]||k}</option>)}
            </select>

            {/* Status filter */}
            <select value={filterSt} onChange={e=>setFilterSt(e.target.value)}
              style={{ padding:'7px 10px', borderRadius:8, border:`1.5px solid ${filterSt?PRI:PRI+'33'}`,
                fontSize:12, background: filterSt?L2:'#fff', fontFamily:PP, cursor:'pointer', outline:'none',
                color: filterSt?PRI:'#546e7a', fontWeight: filterSt?700:400 }}>
              <option value=''>All statuses</option>
              {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
            </select>

            {/* Search */}
            <input style={{ flex:'1 1 180px', minWidth:0, padding:'7px 12px', borderRadius:8,
              border:`1.5px solid ${PRI}33`, fontSize:13, outline:'none', background:'#fff', fontFamily:PP }}
              value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search title, number, entity…" />

            {(filterLinked||filterCat||filterSt||search) && (
              <button onClick={()=>{ setFilterLinked(''); setFilterCat(''); setFilterSt(''); setSearch('') }}
                style={{ padding:'7px 12px', borderRadius:8, border:'1px solid #ddd', background:'#fff',
                  fontSize:12, cursor:'pointer', fontFamily:PP, flexShrink:0 }}>✕ Clear</button>
            )}
            {/* Group by Entity toggle */}
            <button onClick={()=>{ setGroupByEntity(g=>!g); setCollapsedGroups({}) }}
              style={{ padding:'7px 13px', borderRadius:8, border:`1.5px solid ${groupByEntity ? '#454D9B' : '#c5cae9'}`,
                background: groupByEntity ? '#454D9B' : '#fff', color: groupByEntity ? '#fff' : '#454D9B',
                fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:PP, whiteSpace:'nowrap', flexShrink:0 }}>
              {groupByEntity ? '⊞ Grouped' : '⊞ Group by Entity'}
            </button>
          </div>
        </div>

        {/* ── TABLE ── */}
        <div style={{ flex:1, padding:'0 22px 24px' }}>
          {loading ? (
            <div style={{ textAlign:'center', padding:80, color:'#6b7c93' }}>
              <div style={{ fontSize:32, marginBottom:10 }}>🗄️</div>Loading…
            </div>
          ) : visible.length === 0 ? (
            <div style={{ textAlign:'center', padding:80, color:'#6b7c93', background:'#fff', borderRadius:12, marginTop:16 }}>
              <div style={{ fontSize:40, marginBottom:10 }}>📂</div>
              <div style={{ fontSize:14, fontWeight:600, color:'#37474f', marginBottom:6 }}>No documents found</div>
              <div style={{ fontSize:12, marginBottom:14 }}>
                {filterLinked
                  ? `No ${filterCat ? (CAT_LABELS[filterCat]||filterCat) : filterLinked} documents yet.`
                  : 'Click "+ Add Document" to attach the first document.'}
              </div>
              <button onClick={()=>openNewModal(filterLinked, filterCat)}
                style={{ padding:'9px 22px', borderRadius:20, border:'none', background:PRI,
                  color:'#fff', fontFamily:PP, fontSize:13, fontWeight:700, cursor:'pointer' }}>
                + Add Document
              </button>
            </div>
          ) : (() => {
            // ── shared column widths & row renderer ──────────────────
            const colgroup = (
              <colgroup>
                <col style={{ width:'36px'  }} />{/* chevron only */}
                <col style={{ width:'32%'   }} />{/* icon + doc type + number */}
                <col style={{ width:'20%'   }} />{/* entity */}
                <col style={{ width:'16%'   }} />{/* expiry */}
                <col style={{ width:'120px' }} />{/* status */}
                <col style={{ width:'160px' }} />{/* actions */}
              </colgroup>
            )

            const renderRow = (doc, i) => {
              const sc      = STATUS_COLORS[doc._st] || STATUS_COLORS.ACTIVE
              const days    = daysUntil(doc.expiry_date)
              const isOpen  = !!expandedRows[doc.id]
              const rowBg   = doc._st==='EXPIRED' ? '#fff5f5' : doc._st==='EXPIRING_SOON' ? '#fffdf0' : i%2===0 ? '#fff' : '#fafbfc'
              const detailBg = doc._st==='EXPIRED' ? '#fff0f0' : doc._st==='EXPIRING_SOON' ? '#fffae8' : '#f4f6ff'

              const toggleRow = () => setExpandedRows(prev => ({ ...prev, [doc.id]: !prev[doc.id] }))

              const expiryLabel = doc.expiry_date
                ? days !== null && days < 0
                  ? `${fmtD(doc.expiry_date)} · ${Math.abs(days)}d ago`
                  : days !== null && days <= 30
                    ? `${fmtD(doc.expiry_date)} · ${days}d left`
                    : fmtD(doc.expiry_date)
                : '—'

              return (
                <>
                  {/* ── Summary row (always visible) ── */}
                  <tr key={doc.id} onClick={toggleRow}
                    style={{ cursor:'pointer', transition:'background .15s' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#eef0fb'}
                    onMouseLeave={e=>e.currentTarget.style.background=''}>

                    {/* Chevron only */}
                    <td style={{ padding:'10px 6px', textAlign:'center', background:rowBg,
                      borderBottom: isOpen ? 'none' : '1px solid #f0f4f8', verticalAlign:'middle' }}>
                      <span style={{ fontSize:11, color:'#9e9e9e' }}>{isOpen ? '▾' : '▸'}</span>
                    </td>

                    {/* Icon + doc type + number */}
                    <td style={{ padding:'10px 12px 10px 4px', background:rowBg,
                      borderBottom: isOpen ? 'none' : '1px solid #f0f4f8', verticalAlign:'middle' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:18, flexShrink:0, lineHeight:1 }}>{CAT_ICONS[doc.category]||'📄'}</span>
                        <div style={{ minWidth:0, flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:12, color:'#1a2e3d',
                            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.title}</div>
                          {doc.doc_number && (
                            <div style={{ fontSize:10, color:'#78909c', fontFamily:'monospace', marginTop:1 }}>{doc.doc_number}</div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Entity */}
                    <td style={{ padding:'10px 12px', background:rowBg,
                      borderBottom: isOpen ? 'none' : '1px solid #f0f4f8', verticalAlign:'middle' }}>
                      <div style={{ fontSize:12, color:'#546e7a', whiteSpace:'nowrap' }}>{doc.linked_name||'—'}</div>
                    </td>

                    {/* Expiry */}
                    <td style={{ padding:'10px 12px', background:rowBg,
                      borderBottom: isOpen ? 'none' : '1px solid #f0f4f8', verticalAlign:'middle' }}>
                      <div style={{ fontSize:12, fontWeight: days!==null && days<=30 ? 700 : 400,
                        color: sc.color, whiteSpace:'nowrap' }}>{expiryLabel}</div>
                    </td>

                    {/* Status badge */}
                    <td style={{ padding:'10px 12px', background:rowBg,
                      borderBottom: isOpen ? 'none' : '1px solid #f0f4f8', verticalAlign:'middle' }}>
                      <span style={{ background:sc.bg, color:sc.color, border:`1px solid ${sc.border}`,
                        borderRadius:20, padding:'3px 10px', fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>
                        {doc._st}
                      </span>
                    </td>

                    {/* Quick actions always visible */}
                    <td style={{ padding:'10px 12px', background:rowBg,
                      borderBottom: isOpen ? 'none' : '1px solid #f0f4f8', verticalAlign:'middle', textAlign:'right' }}>
                      <div style={{ display:'flex', gap:6, justifyContent:'flex-end', flexWrap:'nowrap' }}>
                        <button onClick={e=>{ e.stopPropagation(); setModal(doc) }}
                          style={{ background:'#454D9B', color:'#fff', border:'none',
                            borderRadius:6, padding:'5px 12px', fontSize:11, fontWeight:700,
                            cursor:'pointer', fontFamily:PP, whiteSpace:'nowrap' }}>✏ Edit</button>
                        <button onClick={e=>{ e.stopPropagation(); handleDelete(doc) }}
                          style={{ background:'#fff0f0', color:'#c62828', border:'1px solid #ffcdd2',
                            borderRadius:6, padding:'5px 12px', fontSize:11, fontWeight:700,
                            cursor:'pointer', fontFamily:PP, whiteSpace:'nowrap' }}>🗑 Del</button>
                      </div>
                    </td>
                  </tr>

                  {/* ── Expanded detail panel ── */}
                  {isOpen && (
                    <tr key={doc.id+'-detail'}>
                      <td colSpan={6} style={{ padding:0, background:detailBg,
                        borderBottom:'2px solid #c5cae9', borderTop:'1px solid #c5cae9' }}>
                        <div style={{ padding:'14px 20px', display:'grid',
                          gridTemplateColumns:'repeat(auto-fill, minmax(180px, 1fr))', gap:'10px 24px' }}>

                          {/* Field helper */}
                          {[
                            { label:'Doc Type',    val: doc.title },
                            { label:'Category',    val: `${CAT_ICONS[doc.category]||''} ${CAT_LABELS[doc.category]||doc.category||'—'}` },
                            { label:'Number / Ref',val: doc.doc_number||'—' },
                            { label:'Entity',      val: doc.linked_name||'—' },
                            { label:'Entity Type', val: doc.linked_type||'—' },
                            { label:'Issued By',   val: doc.counterparty||doc.issued_by||'—' },
                            { label:'Issue Date',  val: fmtD(doc.issue_date)||'—' },
                            { label:'Effective',   val: fmtD(doc.effective_date)||'—' },
                            { label:'Expiry Date', val: fmtD(doc.expiry_date)||'—', highlight: days!==null && days<=30 },
                            { label:'Alert (days)',val: doc.alert_before_expiry_days ?? '30' },
                            { label:'Department',  val: doc.department||'—' },
                            { label:'Owner',       val: doc.owner_responsible||'—' },
                            { label:'Status',      val: doc._st },
                            { label:'Renewable',   val: doc.is_renewable ? '✅ Yes' : 'No' },
                            { label:'Notes',       val: doc.notes||'—' },
                          ].map(f => (
                            <div key={f.label}>
                              <div style={{ fontSize:9, fontWeight:700, color:'#7986cb',
                                textTransform:'uppercase', letterSpacing:.6, marginBottom:2 }}>{f.label}</div>
                              <div style={{ fontSize:12, color: f.highlight ? sc.color : '#1a2e3d',
                                fontWeight: f.highlight ? 700 : 400, wordBreak:'break-word' }}>{f.val}</div>
                            </div>
                          ))}

                          {/* Attachment link */}
                          {doc.file_url && (
                            <div style={{ gridColumn:'1/-1', marginTop:4, display:'flex', gap:8, alignItems:'center' }}>
                              <span style={{ fontSize:9, fontWeight:700, color:'#7986cb',
                                textTransform:'uppercase', letterSpacing:.6 }}>Attachment</span>
                              <a href={doc.file_url} target="_blank" rel="noreferrer"
                                style={{ fontSize:12, color:'#454D9B', fontWeight:700,
                                  textDecoration:'none', border:'1px solid #c5cae9',
                                  borderRadius:6, padding:'4px 12px', background:'#fff',
                                  display:'inline-flex', alignItems:'center', gap:5 }}>
                                📎 View / Download
                              </a>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            }

            const thead = (
              <thead>
                <tr style={{ position:'sticky', top:STRIP_H, zIndex:20, cursor:'pointer' }}
                    onClick={()=>setTableOpen(o=>!o)}>
                  <th style={{ ...TH, textAlign:'center', fontSize:13, width:36 }}>{tableOpen ? '▾' : '▸'}</th>
                  <th style={TH}>Document Type &amp; Reference</th>
                  <th style={TH}>Entity</th>
                  <th style={TH}>Expiry</th>
                  <th style={TH}>Status</th>
                  <th style={{ ...TH, textAlign:'right' }}>Actions</th>
                </tr>
              </thead>
            )

            // ── FLAT view ────────────────────────────────────────────
            if (!groupByEntity) return (
              <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'auto', marginTop:8 }}>
                {colgroup}
                {thead}
                <tbody style={{ display: tableOpen ? 'table-row-group' : 'none' }}>
                  {visible.map((doc, i) => renderRow(doc, i))}
                </tbody>
              </table>
            )

            // ── GROUPED view ─────────────────────────────────────────
            // Build ordered map: entityKey → { label, type, docs[] }
            const groups = {}
            visible.forEach(doc => {
              const key = doc.linked_id || doc.linked_name || 'unlinked'
              if (!groups[key]) {
                const typeInfo = SIDEBAR_CATS.find(c=>c.key===doc.linked_type) || {}
                groups[key] = {
                  key,
                  label: doc.linked_name || 'Unlinked',
                  icon:  typeInfo.icon || '📎',
                  type:  doc.linked_type || '',
                  linkedId: doc.linked_id,
                  docs: []
                }
              }
              groups[key].docs.push(doc)
            })
            const groupList = Object.values(groups)

            return (
              <div style={{ marginTop:8 }}>
                {groupList.map(grp => {
                  const isOpen = !collapsedGroups[grp.key]
                  const expired  = grp.docs.filter(d=>d._st==='EXPIRED').length
                  const expiring = grp.docs.filter(d=>d._st==='EXPIRING_SOON').length
                  return (
                    <div key={grp.key} style={{ marginBottom:12, borderRadius:10, overflow:'hidden',
                      boxShadow:'0 1px 4px rgba(0,0,0,0.07)', border:'1px solid #e8eaf6' }}>
                      {/* Group header row */}
                      <div onClick={()=>setCollapsedGroups(prev=>({ ...prev, [grp.key]: !prev[grp.key] }))}
                        style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px',
                          background:'linear-gradient(90deg,#454D9B,#5c64b3)', cursor:'pointer',
                          userSelect:'none' }}>
                        <span style={{ fontSize:16 }}>{isOpen ? '▾' : '▸'}</span>
                        <span style={{ fontSize:14 }}>{grp.icon}</span>
                        <span style={{ fontFamily:PP, fontWeight:700, fontSize:13, color:'#fff', flex:1 }}>
                          {grp.label}
                        </span>
                        {/* Doc count badge */}
                        <span style={{ background:'rgba(255,255,255,0.2)', color:'#fff', borderRadius:20,
                          padding:'2px 10px', fontSize:11, fontWeight:700 }}>
                          {grp.docs.length} doc{grp.docs.length!==1?'s':''}
                        </span>
                        {expired > 0 && (
                          <span style={{ background:'#c62828', color:'#fff', borderRadius:20,
                            padding:'2px 9px', fontSize:10, fontWeight:700 }}>
                            {expired} expired
                          </span>
                        )}
                        {expiring > 0 && (
                          <span style={{ background:'#e65100', color:'#fff', borderRadius:20,
                            padding:'2px 9px', fontSize:10, fontWeight:700 }}>
                            {expiring} expiring
                          </span>
                        )}
                        {/* Quick Add for this entity */}
                        <button onClick={e=>{ e.stopPropagation(); openNewModal(grp.type, '') }}
                          style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.4)',
                            borderRadius:7, padding:'3px 10px', fontSize:11, fontWeight:700,
                            cursor:'pointer', fontFamily:PP, flexShrink:0 }}>
                          + Add
                        </button>
                      </div>
                      {/* Group table */}
                      {isOpen && (
                        <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'auto' }}>
                          {colgroup}
                          <tbody>
                            {grp.docs.map((doc, i) => renderRow(doc, i))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <DocModal
          entityId={entityId}
          item={modal === 'new' ? null : modal}
          preLinkedType={modal === 'new' ? preLinked : undefined}
          preCategory={modal === 'new' ? preCat : undefined}
          onClose={()=>setModal(null)}
          onSaved={()=>{ setModal(null); load() }}
        />
      )}
    </div>
  )
}
