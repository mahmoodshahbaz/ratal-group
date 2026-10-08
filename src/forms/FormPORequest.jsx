/**
 * FIELD PO REQUEST FORM  — /forms/po-request
 * Theme: Orange (#e65100) — mirrors the Desktop "New Outgoing PO" modal exactly
 *
 * Shareable without login. Entity is derived from the department the user picks.
 * Saves to outgoing_pos + outgoing_po_items (same tables as Desktop OPO).
 * Approval status: PENDING_DH  ·  Source: FIELD
 *
 * Field layout mirrors Desktop OPO:
 *   Row 1 : PO Date | Department | Department Head (auto)
 *   Row 2 : Requested By | Project No. (optional) | Site # (optional)
 *   Row 3 : Category | Supplier / Vendor / Sub-Con / Local Supplier
 *   Row 4 : Payment Terms | PO Number (auto-generated display)
 *   Items : Job Type | Description | Qty | Unit Price | Total
 *   Notes / Terms & Conditions
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { printDocument } from '../lib/templatePrint'
import {
  THEMES, FormPage, Section, Row, Field,
  inp, inpRo, SubmitBar, LangBtn, ErrorBanner, SuccessScreen,
} from './formTheme'

// ── Theme: orange to match Desktop OPO ───────────────────────────────────────
const T = THEMES.po_request  // teal #0097a7

const devMode = new URLSearchParams(window.location.search).get('dev') === '1' ||
                localStorage.getItem('accsys_dev_mode') === '1'

const YEAR = new Date().getFullYear()
const TODAY = new Date().toISOString().split('T')[0]

const CATEGORIES = [
  { value:'SUB_CONTRACTOR',   label:'Sub-Contractor',  labelAr:'مقاول من الباطن' },
  { value:'SUPPLIER',         label:'Supplier',         labelAr:'مورد'            },
  { value:'VENDOR',           label:'Vendor',           labelAr:'بائع'            },
  { value:'LOCAL_SUPPLIER',   label:'Local Supplier',   labelAr:'مورد محلي'       },
  { value:'EQUIPMENT_RENTAL', label:'Equipment Rental', labelAr:'تأجير معدات'     },
]

const PAYMENT_TERMS = [
  { value:'CREDIT',       label:'Credit',          labelAr:'آجل'              },
  { value:'ADVANCE',      label:'Advance Payment', labelAr:'دفعة مقدمة'       },
  { value:'PARTIAL',      label:'Partial Payment', labelAr:'دفعة جزئية'       },
  { value:'MOBILIZATION', label:'Mobilization',    labelAr:'تعبئة'            },
]

const emptyItem = () => ({ _id: Math.random().toString(36).slice(2), jobType:'', description:'', qty:'1', unitPrice:'' })

// ── Disabled select style ─────────────────────────────────────────────────────
const inpDis = { ...inp, background:'#f4f6f8', color:'#aab2bd', cursor:'not-allowed' }

export default function FormPORequest() {

  // ── Master data ───────────────────────────────────────────────────────────
  const [formEntityId,  setFormEntityId]  = useState('')
  const [departments,   setDepartments]   = useState([])
  const [deptEmps,      setDeptEmps]      = useState([])
  const [deptLoading,   setDeptLoading]   = useState(false)
  const [allProjects,   setAllProjects]   = useState([])
  const [sites,         setSites]         = useState([])
  const [sitesLoading,  setSitesLoading]  = useState(false)
  const [allContractors,setAllContractors]= useState([])
  const [allJobTypes,   setAllJobTypes]   = useState([])

  // ── UI ─────────────────────────────────────────────────────────────────────
  const [lang,      setLang]      = useState('en')
  const [loading,   setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [poNumber,  setPoNumber]  = useState('')
  const [error,     setError]     = useState('')
  const isAr = lang === 'ar'

  // ── Form values ────────────────────────────────────────────────────────────
  const [poDate,       setPoDate]       = useState(TODAY)
  const [deptId,       setDeptId]       = useState('')
  const [deptCode,     setDeptCode]     = useState('')
  const [deptHeadId,   setDeptHeadId]   = useState('')
  const [deptHeadName, setDeptHeadName] = useState('')
  const [requestedBy,  setRequestedBy]  = useState('')
  const [contact,      setContact]      = useState('')
  const [projectId,    setProjectId]    = useState('')
  const [siteId,       setSiteId]       = useState('')
  const [category,     setCategory]     = useState('')
  const [supplierId,   setSupplierId]   = useState('')
  const [paymentTerms, setPaymentTerms] = useState('CREDIT')
  const [notes,        setNotes]        = useState('')
  const [items,        setItems]        = useState([emptyItem()])

  // ── Derived ────────────────────────────────────────────────────────────────
  const deptProjects      = allProjects.filter(p => p.department_id === deptId)
  const filteredSuppliers = category
    ? allContractors.filter(c => c.vendor_type === category)
    : []
  const filteredJobTypes  = category
    ? allJobTypes.filter(j => j.contractor_type === category)
                 .sort((a,b) => (a.sort_order||99) - (b.sort_order||99))
                 .map(j => j.job_type_name)
    : []
  const totalValue = items.reduce((s,r) =>
    s + (parseFloat(r.qty)||0) * (parseFloat(r.unitPrice)||0), 0)

  // ── Initial data load — no entity filter (anon-safe) ─────────────────────
  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [
      { data: deps },
      { data: projs },
      { data: cons },
      { data: jts  },
    ] = await Promise.all([
      supabase.from('departments')
        .select('id,dept_code,dept_name,dept_head_id,pm_id,supervisor_id,entity_id')
        .eq('is_active', true).order('dept_code'),
      supabase.from('projects')
        .select('id,project_number,project_name,department_id,entity_id')
        .in('status', ['OPEN','ACTIVE']).order('project_number'),
      supabase.from('contractors')
        .select('id,contractor_name,contractor_code,vendor_type,specialization,entity_id')
        .in('status', ['ACTIVE','OPEN']).order('contractor_name'),
      supabase.from('po_job_types')
        .select('contractor_type,job_type_name,sort_order')
        .eq('is_active', true).order('sort_order'),
    ])
    setDepartments(deps  || [])
    setAllProjects(projs || [])
    setAllContractors(cons || [])
    setAllJobTypes(jts || [])
  }

  // ── Fetch dept employees (DH/PM/Supervisor → all-in-dept fallback) ─────────
  useEffect(() => {
    if (!deptId) { setDeptEmps([]); return }
    const dept = departments.find(d => d.id === deptId)
    if (!dept) { setDeptEmps([]); return }
    setDeptLoading(true)
    setDeptEmps([])
    ;(async () => {
      const roleMap = [
        { id: dept.dept_head_id,  roleLabel: 'Dept Head'    },
        { id: dept.pm_id,         roleLabel: 'Proj Manager' },
        { id: dept.supervisor_id, roleLabel: 'Supervisor'   },
      ]
      const fkIds = roleMap.map(r => r.id).filter(Boolean)

      if (fkIds.length > 0) {
        const { data: byFk } = await supabase.from('employees')
          .select('id,full_name_en,phone').in('id', fkIds)
        if (byFk?.length) {
          setDeptEmps(roleMap.filter(r=>r.id).map(r => {
            const e = byFk.find(x => x.id === r.id)
            return e ? { id:e.id, full_name_en:e.full_name_en, phone:e.phone||'', roleLabel:r.roleLabel } : null
          }).filter(Boolean))
          setDeptLoading(false)
          return
        }
      }
      const { data: byDept } = await supabase.from('employees')
        .select('id,full_name_en,phone').eq('department_id', deptId).order('full_name_en')
      setDeptEmps((byDept||[]).map(e => ({ id:e.id, full_name_en:e.full_name_en, phone:e.phone||'', roleLabel:'' })))
      setDeptLoading(false)
    })()
  }, [deptId, departments])

  // ── Fetch sites when project changes ──────────────────────────────────────
  useEffect(() => {
    if (!projectId) { setSites([]); return }
    setSitesLoading(true)
    supabase.from('site_masters').select('id,sm_id,site_name')
      .eq('project_id', projectId).order('sm_id')
      .then(({ data }) => { setSites(data||[]); setSitesLoading(false) })
  }, [projectId])

  // ── Cascade handlers ──────────────────────────────────────────────────────
  function onDept(id) {
    setDeptId(id)
    const d = departments.find(x => x.id === id) || {}
    setDeptCode(d.dept_code || '')
    setFormEntityId(d.entity_id || '')
    setDeptHeadId(d.dept_head_id || '')
    setDeptHeadName('')   // will be found in deptEmps once loaded; show placeholder
    // Reset downstream
    setRequestedBy(''); setContact('')
    setProjectId(''); setSiteId(''); setSites([])
    setCategory(''); setSupplierId('')
  }

  // DH name lookup once deptEmps are ready
  useEffect(() => {
    if (!deptHeadId) { setDeptHeadName(''); return }
    const emp = deptEmps.find(e => e.id === deptHeadId)
    if (emp) setDeptHeadName(emp.full_name_en)
    else {
      // Fetch directly if not in deptEmps list
      supabase.from('employees').select('full_name_en').eq('id', deptHeadId).single()
        .then(({ data }) => setDeptHeadName(data?.full_name_en || ''))
    }
  }, [deptHeadId, deptEmps])

  function onRequester(id) {
    setRequestedBy(id)
    const e = deptEmps.find(x => x.id === id)
    setContact(e?.phone || '')
  }

  function onProject(id) {
    setProjectId(id)
    setSiteId('')
  }

  function onCategory(val) {
    setCategory(val)
    setSupplierId('')
  }

  // ── Items ─────────────────────────────────────────────────────────────────
  function updateItem(id, field, val) {
    setItems(prev => prev.map(r => r._id === id ? { ...r, [field]: val } : r))
  }
  function addItem()    { setItems(prev => [...prev, emptyItem()]) }
  function removeItem(id) { if (items.length > 1) setItems(prev => prev.filter(r => r._id !== id)) }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function submit(ev) {
    ev.preventDefault()
    if (!deptId)     { setError(isAr ? 'يرجى اختيار القسم'         : 'Select a department'); return }
    if (!requestedBy){ setError(isAr ? 'يرجى اختيار مقدم الطلب'    : 'Select the requester'); return }
    if (!category)   { setError(isAr ? 'يرجى اختيار الفئة'         : 'Select a category'); return }
    if (!supplierId) { setError(isAr ? 'يرجى اختيار المورد'         : 'Select a supplier'); return }
    const validItems = items.filter(r => r.description?.trim())
    if (!validItems.length) { setError(isAr ? 'أضف عنصراً واحداً على الأقل' : 'Add at least one item with a description'); return }
    setLoading(true); setError('')

    // Generate PO number
    const sup = allContractors.find(s => s.id === supplierId)
    const supCode = (sup?.contractor_code || 'SUP').replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(0,6)
    let generatedPO = `FIELD-${YEAR}-${supCode}-PENDING`
    let poSeq = null; let poYear = YEAR
    try {
      const { data: seqData } = await supabase.rpc('next_po_sequence', { p_entity_id: formEntityId, p_year: YEAR })
      if (seqData) {
        const seq = String(seqData).padStart(3,'0')
        generatedPO = `RAT-PO-${YEAR}-${supCode}-${seq}`
        poSeq = seqData
      }
    } catch {}

    const dept = departments.find(d => d.id === deptId) || {}
    const project = allProjects.find(p => p.id === projectId)
    const site = sites.find(s => s.id === siteId)
    const requesterEmp = deptEmps.find(e => e.id === requestedBy)
    const subtotal = validItems.reduce((s,r) => s + (parseFloat(r.qty)||0)*(parseFloat(r.unitPrice)||0), 0)

    const payload = {
      entity_id:       formEntityId || null,
      po_date:         poDate,
      department_id:   deptId,
      dept_head_id:    deptHeadId || null,
      requested_by:    requestedBy,
      project_id:      projectId || null,
      site_id:         siteId || null,
      supplier_id:     supplierId,
      supplier_code:   sup?.contractor_code || null,
      category,
      payment_terms:   paymentTerms,
      notes:           notes || null,
      po_number:       generatedPO,
      po_seq:          poSeq,
      po_year:         poYear,
      subtotal,
      total_value:     subtotal,
      approval_status: 'PENDING_DH',
      source:          'FIELD',
    }

    const { data: opoData, error: opoErr } = await supabase
      .from('outgoing_pos').insert(payload).select('id').single()

    if (opoErr) { setError(opoErr.message); setLoading(false); return }

    const opoId = opoData?.id
    if (opoId) {
      const itemRows = validItems.map((r,i) => ({
        outgoing_po_id: opoId,
        sort_order:     i,
        job_type:       r.jobType || '',
        description:    r.description,
        qty:            parseFloat(r.qty)||1,
        unit_price:     parseFloat(r.unitPrice)||0,
        line_total:     (parseFloat(r.qty)||1) * (parseFloat(r.unitPrice)||0),
      }))
      await supabase.from('outgoing_po_items').insert(itemRows)
    }

    // Print the PO document (same template as desktop)
    try {
      printDocument('outgoing_po', {
        po_number:         generatedPO,
        po_date:           poDate,
        vendor_name_en:    sup?.contractor_name || '',
        vendor_code:       sup?.contractor_code || '',
        vendor_type:       CATEGORIES.find(c=>c.value===category)?.label || category,
        ship_to_dept:      dept.dept_code || dept.dept_name || '',
        requested_by_name: requesterEmp?.full_name_en || '',
        dept_head_name:    deptHeadName || '',
        project_number:    project ? `${project.project_number} — ${project.project_name}` : '',
        site_number:       site ? `${site.sm_id}${site.site_name ? ' — '+site.site_name : ''}` : '',
        payment_terms:     paymentTerms,
        notes:             notes || '',
        category:          CATEGORIES.find(c=>c.value===category)?.label || category,
        lines: validItems.map(r => ({
          job_type:    r.jobType || '',
          description: r.description,
          qty:         parseFloat(r.qty)||1,
          unit_price:  parseFloat(r.unitPrice)||0,
          line_total:  (parseFloat(r.qty)||1)*(parseFloat(r.unitPrice)||0),
        })),
      })
    } catch {}

    setLoading(false)
    setPoNumber(generatedPO)
    setSubmitted(true)
  }

  function reset() {
    setSubmitted(false)
    setDeptId(''); setDeptCode(''); setFormEntityId(''); setDeptHeadId(''); setDeptHeadName('')
    setRequestedBy(''); setContact('')
    setProjectId(''); setSiteId(''); setSites([])
    setCategory(''); setSupplierId('')
    setPaymentTerms('CREDIT'); setNotes('')
    setItems([emptyItem()])
  }

  const langBtn = <LangBtn isAr={isAr} toggle={() => setLang(l => l === 'en' ? 'ar' : 'en')} />

  if (submitted) return (
    <FormPage theme={T} isAr={isAr} langToggle={langBtn}>
      <SuccessScreen theme={T} reqNumber={poNumber} isAr={isAr} onAnother={reset} />
    </FormPage>
  )

  return (
    <FormPage theme={T} isAr={isAr} langToggle={langBtn}>

      {devMode && (
        <div style={{ background:'#fff3e0', border:'2px dashed #e65100', borderRadius:8, margin:'12px 12px 0', padding:'10px 14px' }}>
          <div style={{ fontWeight:700, color:'#bf360c', fontSize:13, fontFamily:'Arial,sans-serif' }}>
            🛠️ TESTING MODE — not visible in production
          </div>
          <div style={{ fontSize:12, color:'#e65100', marginTop:4, fontFamily:'Arial,sans-serif' }}>
            Select any department to begin. In production, PM/Supervisor opens this link directly.
          </div>
        </div>
      )}

      <form onSubmit={submit}>
        <ErrorBanner msg={error} />

        {/* ── SECTION 1: PO DATE / DEPARTMENT / DEPT HEAD ──────── */}
        <Section title={isAr ? 'معلومات الطلب' : 'PO information'}>
          <Row>
            <Field label={isAr ? 'تاريخ الطلب *' : 'PO Date *'} flex={1}>
              <input type="date" style={inp} value={poDate}
                onChange={e => setPoDate(e.target.value)} required />
            </Field>
            <Field label={isAr ? 'القسم *' : 'Department *'} flex={2}>
              <select style={inp} value={deptId} onChange={e => onDept(e.target.value)} required>
                <option value="">— {isAr ? 'اختر القسم' : 'Select Department'} —</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.dept_code || d.dept_name}</option>
                ))}
              </select>
            </Field>
            <Field label={isAr ? 'رئيس القسم' : 'Department Head'} flex={1.5}>
              <input style={inpRo}
                value={deptHeadName || (deptId && !deptHeadName ? '(loading…)' : '')}
                readOnly
                placeholder={isAr ? '— تلقائي —' : '— Auto-filled —'}
              />
            </Field>
          </Row>

          {/* ── SECTION 2: REQUESTED BY / PROJECT / SITE ────────── */}
          <Row last>
            <Field label={isAr ? 'مقدم الطلب *' : 'Requested By *'} flex={1.5}>
              <select
                style={deptId && !deptLoading ? inp : inpDis}
                value={requestedBy}
                onChange={e => onRequester(e.target.value)}
                required disabled={!deptId || deptLoading}
              >
                <option value="">
                  {!deptId      ? (isAr ? 'اختر القسم أولاً' : 'Select department first')
                  : deptLoading ? (isAr ? 'جارٍ التحميل…'    : 'Loading…')
                  :               (isAr ? '— اختر —'          : '— Select —')}
                </option>
                {deptEmps.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.full_name_en}{e.roleLabel ? `  ·  ${e.roleLabel}` : ''}
                  </option>
                ))}
              </select>
              {deptId && !deptLoading && deptEmps.length === 0 && (
                <div style={{ fontSize:11, color:'#e65100', marginTop:4, fontFamily:'Arial,sans-serif' }}>
                  No staff found — assign DH/PM/Supervisor in Departments master
                </div>
              )}
            </Field>
            <Field label={isAr ? 'رقم المشروع' : `Project No. (${isAr ? 'اختياري' : 'Optional'})`} flex={2}>
              <select
                style={deptId ? inp : inpDis}
                value={projectId} onChange={e => onProject(e.target.value)}
                disabled={!deptId}
              >
                <option value="">
                  {deptId ? (isAr ? '— اختياري —' : '— Optional —') : (isAr ? 'اختر القسم أولاً' : 'Select dept first')}
                </option>
                {deptProjects.map(p => (
                  <option key={p.id} value={p.id}>{p.project_number} — {p.project_name}</option>
                ))}
              </select>
              {deptId && deptProjects.length === 0 && (
                <div style={{ fontSize:10, color:'#aab2bd', marginTop:3, fontFamily:'Arial,sans-serif' }}>No active projects</div>
              )}
            </Field>
            <Field label={isAr ? 'رقم الموقع' : `Site # (${isAr ? 'اختياري' : 'Optional'})`} flex={1}>
              <select
                style={projectId && !sitesLoading ? inp : inpDis}
                value={siteId} onChange={e => setSiteId(e.target.value)}
                disabled={!projectId || sitesLoading}
              >
                <option value="">
                  {!projectId    ? (isAr ? 'اختر المشروع أولاً' : 'Select project first')
                  : sitesLoading ? (isAr ? 'جارٍ التحميل…'      : 'Loading…')
                  :                (isAr ? '— اختياري —'         : '— Optional —')}
                </option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.sm_id}{s.site_name ? ` — ${s.site_name}` : ''}</option>
                ))}
              </select>
            </Field>
          </Row>
        </Section>

        {/* ── SECTION 3: CATEGORY + SUPPLIER ───────────────────── */}
        <Section title={isAr ? 'المورد والفئة' : 'Category & supplier'}>
          <Row>
            <Field label={isAr ? 'الفئة *' : 'Category *'} flex={1}>
              <select style={inp} value={category} onChange={e => onCategory(e.target.value)} required>
                <option value="">— {isAr ? 'اختر الفئة' : 'Select Category'} —</option>
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{isAr ? c.labelAr : c.label}</option>
                ))}
              </select>
            </Field>
            <Field label={isAr ? 'المورد / المقاول *' : 'Supplier / Vendor / Sub-Con / Local Supplier *'} flex={2}>
              <select
                style={category ? inp : inpDis}
                value={supplierId} onChange={e => setSupplierId(e.target.value)}
                required disabled={!category}
              >
                <option value="">
                  {category ? (isAr ? '— اختر —' : '— Select Supplier —') : (isAr ? 'اختر الفئة أولاً' : '— Select Category First —')}
                </option>
                {filteredSuppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.contractor_name}{s.specialization ? ` · ${s.specialization}` : ''}
                  </option>
                ))}
              </select>
              <div style={{ fontSize:10, color:'#aab2bd', marginTop:3, fontFamily:'Arial,sans-serif' }}>
                ⚠ {isAr ? 'مورد واحد لكل طلب — الأنشطة المتعددة عبر البنود أدناه' : 'One supplier per PO — multiple activities handled via line items below'}
              </div>
            </Field>
          </Row>

          <Row last>
            <Field label={isAr ? 'شروط الدفع' : 'Payment Terms'} flex={1}>
              <select style={inp} value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}>
                {PAYMENT_TERMS.map(t => (
                  <option key={t.value} value={t.value}>{isAr ? t.labelAr : t.label}</option>
                ))}
              </select>
            </Field>
            <Field label={isAr ? 'رقم طلب الشراء' : 'PO Number'} flex={2}>
              <div style={{ ...inpRo, display:'flex', alignItems:'center', fontSize:12, fontFamily:'monospace', color:'#aab2bd' }}>
                Auto-generated on save — RAT-PO-{YEAR}-[SUPPLIER_CODE]-001
              </div>
            </Field>
          </Row>
        </Section>

        {/* ── SECTION 4: LINE ITEMS ─────────────────────────────── */}
        <Section title={isAr ? 'البنود' : 'Line items'}>
          {!category && (
            <div style={{ fontSize:12, color:'#f57f17', fontWeight:700, marginBottom:10,
              padding:'7px 12px', background:'#fff8e1', borderRadius:6, fontFamily:'Arial,sans-serif' }}>
              ⚠ {isAr ? 'اختر الفئة أعلاه لتحميل أنواع الأعمال' : 'Select a Category above to load job types'}
            </div>
          )}

          {/* Table header */}
          <div style={{
            background:'#1a2e4a',
            display:'grid',
            gridTemplateColumns:'1.4fr 2fr 0.6fr 0.9fr 0.9fr 28px',
            gap:0,
            borderRadius:'6px 6px 0 0',
          }}>
            {[
              isAr?'نوع العمل':'Job Type',
              isAr?'البيان':'Description *',
              isAr?'الكمية':'Qty',
              isAr?'سعر الوحدة':'Unit Price (SAR)',
              isAr?'الإجمالي':'Total',
              '',
            ].map((h,i) => (
              <div key={i} style={{ padding:'8px 8px', color:'#fff', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.3px' }}>
                {h}
              </div>
            ))}
          </div>

          {/* Rows */}
          {items.map((item, idx) => {
            const lineTotal = (parseFloat(item.qty)||0) * (parseFloat(item.unitPrice)||0)
            return (
              <div key={item._id} style={{
                display:'grid',
                gridTemplateColumns:'1.4fr 2fr 0.6fr 0.9fr 0.9fr 28px',
                gap:0,
                borderBottom:'1px solid #f0f4f8',
                background: idx % 2 === 0 ? '#fffbf0' : '#fff',
              }}>
                <div style={{ padding:'5px 5px' }}>
                  <select
                    style={{ ...inp, padding:'5px 6px', fontSize:12 }}
                    value={item.jobType}
                    onChange={e => updateItem(item._id, 'jobType', e.target.value)}
                  >
                    <option value="">--</option>
                    {filteredJobTypes.map(jt => <option key={jt} value={jt}>{jt}</option>)}
                  </select>
                </div>
                <div style={{ padding:'5px 4px' }}>
                  <input
                    style={{ ...inp, padding:'5px 7px', fontSize:12 }}
                    value={item.description}
                    onChange={e => updateItem(item._id, 'description', e.target.value)}
                    placeholder={isAr ? 'وصف البند' : 'Item / service description'}
                    required
                  />
                </div>
                <div style={{ padding:'5px 4px' }}>
                  <input
                    type="number" min="0" step="any"
                    style={{ ...inp, padding:'5px 4px', fontSize:12, textAlign:'right' }}
                    value={item.qty}
                    onChange={e => updateItem(item._id, 'qty', e.target.value)}
                    placeholder="1"
                  />
                </div>
                <div style={{ padding:'5px 4px' }}>
                  <input
                    type="number" min="0" step="0.01"
                    style={{ ...inp, padding:'5px 4px', fontSize:12, textAlign:'right' }}
                    value={item.unitPrice}
                    onChange={e => updateItem(item._id, 'unitPrice', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div style={{ padding:'5px 4px', display:'flex', alignItems:'center',
                  fontSize:12, fontWeight:700, color:'#1a2e4a' }}>
                  {lineTotal > 0 ? `SAR ${lineTotal.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—'}
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(item._id)}
                      style={{ background:'none', border:'none', color:'#e65100', cursor:'pointer', fontSize:18, lineHeight:1, padding:'2px' }}>
                      ×
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* Footer: add + total */}
          <div style={{ padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center',
            background:'#fff', borderTop:'2px solid #e8edf2', borderRadius:'0 0 6px 6px' }}>
            <button type="button" onClick={addItem}
              style={{
                background:'#fff', color:'#e65100',
                border:'1.5px solid #e65100',
                borderRadius:6, padding:'7px 16px',
                fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:'Arial,sans-serif',
              }}>
              + {isAr ? 'إضافة بند' : 'Add Line'}
            </button>
            {totalValue > 0 && (
              <span style={{ fontSize:14, fontWeight:900, color:'#e65100', fontFamily:'Arial,sans-serif' }}>
                {isAr ? 'الإجمالي التقديري' : 'Overall Total'}:&nbsp;
                SAR {totalValue.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
              </span>
            )}
          </div>
        </Section>

        {/* ── SECTION 5: NOTES ─────────────────────────────────── */}
        <Section title={isAr ? 'الشروط والملاحظات' : 'Notes / Terms & Conditions'}>
          <Row last>
            <Field label={isAr ? 'ملاحظات إضافية' : 'Additional terms, payment instructions, or conditions'}>
              <textarea
                style={{ ...inp, minHeight:80, resize:'vertical' }}
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder={isAr ? 'أي شروط أو ملاحظات إضافية…' : 'Any additional terms or notes…'}
              />
            </Field>
          </Row>
        </Section>

        <SubmitBar
          theme={T}
          label={isAr ? 'إرسال طلب الشراء' : 'Submit PO Request'}
          loading={loading}
        />
      </form>
    </FormPage>
  )
}
