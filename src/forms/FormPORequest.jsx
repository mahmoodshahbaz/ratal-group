/**
 * FIELD PO REQUEST FORM  — /forms/po-request  (v4 wizard)
 * Mobile-first 4-screen wizard (same pattern as FormMoneyRequest / FormOvertime)
 * Theme: Emerald / Teal  —  distinct from navy (Money), black (OT), pink (Food)
 *
 * Screen 1 — PO Info       (date · dept · requestor · project · site)
 * Screen 2 — Supplier      (category · supplier · payment terms)
 * Screen 3 — Line Items    (job type · description · qty · unit price + notes)
 * Screen 4 — Success
 *
 * Saves to outgoing_pos + outgoing_po_items.  Status: PENDING_DH. Source: FIELD.
 */
import { useState, useEffect } from 'react'
import { supabase }            from '../lib/supabase'
import { printDocument }       from '../lib/templatePrint'

// ── Dev mode ─────────────────────────────────────────────────────────────────
const devMode = new URLSearchParams(window.location.search).get('dev') === '1' ||
                localStorage.getItem('accsys_dev_mode') === '1'

const YEAR  = new Date().getFullYear()
const TODAY = new Date().toISOString().split('T')[0]

// ── Theme — Emerald / Teal ────────────────────────────────────────────────────
const TH = {
  emerald:     '#00695c',
  emeraldDark: '#004d40',
  emeraldMid:  '#00796b',
  tealLight:   '#b2dfdb',
  amber:       '#ff8f00',
  amberLight:  '#fff3e0',
  amberDark:   '#e65100',
  cream:       '#f0fdf4',
  bg:          '#f1f5f9',
  white:       '#ffffff',
  text:        '#0f172a',
  sub:         '#475569',
  muted:       '#94a3b8',
  red:         '#b91c1c',
  green:       '#15803d',
  greenBg:     '#dcfce7',
  navy:        '#1e3a5f',
}

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORIES = [
  { value:'SUB_CONTRACTOR',   label:'Sub-Contractor',  icon:'👷', labelAr:'مقاول من الباطن' },
  { value:'SUPPLIER',         label:'Supplier',         icon:'🏭', labelAr:'مورد'            },
  { value:'VENDOR',           label:'Vendor',           icon:'🛒', labelAr:'بائع'            },
  { value:'LOCAL_SUPPLIER',   label:'Local Supplier',   icon:'🏪', labelAr:'مورد محلي'       },
  { value:'EQUIPMENT_RENTAL', label:'Equipment Rental', icon:'🚜', labelAr:'تأجير معدات'     },
]
const PAYMENT_TERMS = [
  { value:'CREDIT',       label:'Credit',          labelAr:'آجل'         },
  { value:'ADVANCE',      label:'Advance Payment', labelAr:'دفعة مقدمة'  },
  { value:'PARTIAL',      label:'Partial Payment', labelAr:'دفعة جزئية'  },
  { value:'MOBILIZATION', label:'Mobilization',    labelAr:'تعبئة'       },
]
const emptyItem = () => ({ _id:Math.random().toString(36).slice(2), jobType:'', description:'', qty:'1', unitPrice:'' })

// ── Style helpers ─────────────────────────────────────────────────────────────
const page = (bg='#f1f5f9') => ({
  minHeight:'100vh', background:bg, display:'flex', flexDirection:'column',
  fontFamily:"'Segoe UI',Arial,sans-serif", maxWidth:480, margin:'0 auto',
})
const headerStyle = {
  background: TH.emeraldDark,
  padding:'16px 18px 14px',
  display:'flex', alignItems:'center', justifyContent:'space-between',
}
const pill = (active) => ({
  width:28, height:8, borderRadius:4,
  background: active ? TH.amber : 'rgba(255,255,255,0.25)',
  transition:'background 0.2s',
})
const card = {
  background:TH.white, borderRadius:14, margin:'10px 14px 0',
  padding:'16px 16px', boxShadow:'0 1px 6px rgba(0,0,0,0.08)',
  border:'1px solid #e2e8f0',
}
const lbl = {
  fontSize:10, color:TH.sub, fontWeight:700,
  textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:5, display:'block',
}
const inp = (extra={}) => ({
  width:'100%', padding:'12px 13px', background:'#fff',
  border:'1.5px solid #e2e8f0', borderRadius:10,
  fontSize:14, color:TH.text, boxSizing:'border-box',
  fontFamily:'inherit', ...extra,
})
const inpDark = (extra={}) => ({
  ...inp(), background:'#0f172a', color:'#f1f5f9',
  border:'1.5px solid #334155', ...extra,
})
const btnRow = {
  display:'flex', gap:10, padding:'14px 14px 20px',
  marginTop:'auto',
}
const btn = (bg, color='#fff') => ({
  flex:1, height:52, background:bg, color, border:'none',
  borderRadius:12, fontSize:15, fontWeight:800,
  cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.3px',
})

// ── Shared header ─────────────────────────────────────────────────────────────
function Header({ step, sub, lang, setLang }) {
  return (
    <div style={headerStyle}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ fontSize:26 }}>📦</div>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:'#fff', letterSpacing:'0.5px' }}>
            PO REQUEST
          </div>
          {sub && <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:1 }}>{sub}</div>}
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
        <button onClick={()=>setLang(l=>l==='en'?'ar':'en')} style={{
          background:'rgba(255,255,255,0.15)', border:'none', color:'#fff',
          borderRadius:6, padding:'4px 10px', fontSize:11, cursor:'pointer',
        }}>
          {lang==='en' ? 'عربي' : 'EN'}
        </button>
        <div style={{ display:'flex', gap:5 }}>
          {[1,2,3].map(s=><div key={s} style={pill(step>=s)} />)}
        </div>
      </div>
    </div>
  )
}

function SecTitle({ icon, title }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, margin:'14px 14px 2px',
      borderBottom:`2px solid ${TH.amber}`, paddingBottom:8 }}>
      <span style={{ fontSize:16 }}>{icon}</span>
      <span style={{ fontSize:12, fontWeight:800, color:TH.emeraldDark, textTransform:'uppercase', letterSpacing:'0.7px' }}>
        {title}
      </span>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FormPORequest() {
  const [step, setStep] = useState(1)

  // Reference data
  const [departments,    setDepartments]    = useState([])
  const [deptEmps,       setDeptEmps]       = useState([])
  const [deptLoading,    setDeptLoading]    = useState(false)
  const [allProjects,    setAllProjects]    = useState([])
  const [sites,          setSites]          = useState([])
  const [sitesLoading,   setSitesLoading]   = useState(false)
  const [allContractors, setAllContractors] = useState([])
  const [allJobTypes,    setAllJobTypes]    = useState([])
  const [dataLoading,    setDataLoading]    = useState(true)

  // UI
  const [lang,      setLang]      = useState('en')
  const [submitting,setSubmitting]= useState(false)
  const [poNumber,  setPoNumber]  = useState('')
  const [error,     setError]     = useState('')
  const isAr = lang === 'ar'

  // Form fields
  const [poDate,       setPoDate]       = useState(TODAY)
  const [deptId,       setDeptId]       = useState('')
  const [deptCode,     setDeptCode]     = useState('')
  const [formEntityId, setFormEntityId] = useState('')
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

  // Derived
  const deptProjects      = allProjects.filter(p=>p.department_id===deptId)
  const filteredSuppliers = category ? allContractors.filter(c=>c.vendor_type===category) : []
  const filteredJobTypes  = category
    ? allJobTypes.filter(j=>j.contractor_type===category)
                 .sort((a,b)=>(a.sort_order||99)-(b.sort_order||99))
                 .map(j=>j.job_type_name)
    : []
  const totalValue = items.reduce((s,r)=>s+(parseFloat(r.qty)||0)*(parseFloat(r.unitPrice)||0), 0)
  const selectedSupplier = allContractors.find(s=>s.id===supplierId)
  const selectedRequester = deptEmps.find(e=>e.id===requestedBy)
  const selectedCat = CATEGORIES.find(c=>c.value===category)

  // ── Data load ────────────────────────────────────────────────────────────────
  useEffect(()=>{
    async function load() {
      setDataLoading(true)
      const [{ data:deps },{ data:projs },{ data:cons },{ data:jts }] = await Promise.all([
        supabase.from('departments').select('id,dept_code,dept_name,dept_head_id,pm_id,supervisor_id,entity_id').eq('is_active',true).order('dept_code'),
        supabase.from('projects').select('id,project_number,project_name,department_id,entity_id').in('status',['OPEN','ACTIVE']).order('project_number'),
        supabase.from('contractors').select('id,contractor_name,contractor_code,vendor_type,specialization,entity_id').in('status',['ACTIVE','OPEN']).order('contractor_name'),
        supabase.from('po_job_types').select('contractor_type,job_type_name,sort_order').eq('is_active',true).order('sort_order'),
      ])
      // Deduplicate by dept_code — guard against duplicate DB rows
      const seen = new Set()
      setDepartments((deps||[]).filter(d=>{ const k=d.dept_code||d.dept_name; return seen.has(k)?false:seen.add(k) }))
      setAllProjects(projs||[])
      setAllContractors(cons||[])
      setAllJobTypes(jts||[])
      setDataLoading(false)
    }
    load()
  },[])

  // ── Dept employees ────────────────────────────────────────────────────────────
  useEffect(()=>{
    if (!deptId) { setDeptEmps([]); return }
    const dept = departments.find(d=>d.id===deptId)
    if (!dept)  { setDeptEmps([]); return }
    setDeptLoading(true); setDeptEmps([])
    ;(async()=>{
      const roleMap=[
        {id:dept.dept_head_id,  roleLabel:'Dept Head'},
        {id:dept.pm_id,         roleLabel:'Proj Manager'},
        {id:dept.supervisor_id, roleLabel:'Supervisor'},
      ]
      const fkIds=roleMap.map(r=>r.id).filter(Boolean)
      if (fkIds.length) {
        const {data:byFk}=await supabase.from('employees').select('id,full_name_en,phone').in('id',fkIds)
        if (byFk?.length) {
          setDeptEmps(roleMap.filter(r=>r.id).map(r=>{
            const e=byFk.find(x=>x.id===r.id)
            return e?{id:e.id,full_name_en:e.full_name_en,phone:e.phone||'',roleLabel:r.roleLabel}:null
          }).filter(Boolean))
          setDeptLoading(false); return
        }
      }
      const {data:byDept}=await supabase.from('employees').select('id,full_name_en,phone').eq('department_id',deptId).order('full_name_en')
      setDeptEmps((byDept||[]).map(e=>({id:e.id,full_name_en:e.full_name_en,phone:e.phone||'',roleLabel:''})))
      setDeptLoading(false)
    })()
  },[deptId,departments])

  // ── DH name lookup ────────────────────────────────────────────────────────────
  useEffect(()=>{
    if (!deptHeadId) { setDeptHeadName(''); return }
    const emp=deptEmps.find(e=>e.id===deptHeadId)
    if (emp) setDeptHeadName(emp.full_name_en)
    else supabase.from('employees').select('full_name_en').eq('id',deptHeadId).single()
      .then(({data})=>setDeptHeadName(data?.full_name_en||''))
  },[deptHeadId,deptEmps])

  // ── Sites cascade ─────────────────────────────────────────────────────────────
  useEffect(()=>{
    if (!projectId) { setSites([]); return }
    setSitesLoading(true)
    supabase.from('site_masters').select('id,sm_id,site_name').eq('project_id',projectId).order('sm_id')
      .then(({data})=>{ setSites(data||[]); setSitesLoading(false) })
  },[projectId])

  // ── Cascade handlers ──────────────────────────────────────────────────────────
  function onDept(id) {
    setDeptId(id)
    const d=departments.find(x=>x.id===id)||{}
    setDeptCode(d.dept_code||''); setFormEntityId(d.entity_id||'')
    setDeptHeadId(d.dept_head_id||''); setDeptHeadName('')
    setRequestedBy(''); setContact(''); setProjectId(''); setSiteId(''); setSites([])
  }
  function onRequester(id) {
    setRequestedBy(id)
    const e=deptEmps.find(x=>x.id===id); setContact(e?.phone||'')
  }
  function onProject(id) { setProjectId(id); setSiteId('') }
  function onCategory(val) { setCategory(val); setSupplierId('') }

  // ── Items ─────────────────────────────────────────────────────────────────────
  function updateItem(id,field,val) { setItems(prev=>prev.map(r=>r._id===id?{...r,[field]:val}:r)) }
  function addItem()        { setItems(prev=>[...prev,emptyItem()]) }
  function removeItem(id)   { if(items.length>1) setItems(prev=>prev.filter(r=>r._id!==id)) }

  // ── Validation ────────────────────────────────────────────────────────────────
  function validateStep1() {
    if (!deptId)      { setError(isAr?'الرجاء اختيار القسم':'Select a department'); return false }
    if (!requestedBy) { setError(isAr?'الرجاء اختيار مقدم الطلب':'Select the requester'); return false }
    setError(''); return true
  }
  function validateStep2() {
    if (!category)    { setError(isAr?'الرجاء اختيار الفئة':'Select a category'); return false }
    if (!supplierId)  { setError(isAr?'الرجاء اختيار المورد':'Select a supplier'); return false }
    setError(''); return true
  }
  function validateStep3() {
    const valid=items.filter(r=>r.description?.trim())
    if (!valid.length) { setError(isAr?'أضف بنداً واحداً على الأقل':'Add at least one item'); return false }
    setError(''); return true
  }

  // ── Submit ────────────────────────────────────────────────────────────────────
  async function submit() {
    setSubmitting(true); setError('')
    const validItems=items.filter(r=>r.description?.trim())

    const sup = allContractors.find(s=>s.id===supplierId)
    const supCode=(sup?.contractor_code||'SUP').replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(0,6)
    let generatedPO=`FIELD-${YEAR}-${supCode}-PENDING`
    let poSeq=null
    try {
      const {data:seqData}=await supabase.rpc('next_po_sequence',{p_entity_id:formEntityId,p_year:YEAR})
      if (seqData) {
        const seq=String(seqData).padStart(3,'0')
        generatedPO=`RAT-PO-${YEAR}-${supCode}-${seq}`
        poSeq=seqData
      }
    } catch {}

    const project=allProjects.find(p=>p.id===projectId)
    const site=sites.find(s=>s.id===siteId)
    const subtotal=validItems.reduce((s,r)=>s+(parseFloat(r.qty)||0)*(parseFloat(r.unitPrice)||0),0)

    const {data:opoData,error:opoErr}=await supabase.from('outgoing_pos').insert({
      entity_id:       formEntityId||null,
      po_date:         poDate,
      department_id:   deptId,
      dept_head_id:    deptHeadId||null,
      requested_by:    requestedBy,
      project_id:      projectId||null,
      site_id:         siteId||null,
      supplier_id:     supplierId,
      supplier_code:   sup?.contractor_code||null,
      category,
      payment_terms:   paymentTerms,
      notes:           notes||null,
      po_number:       generatedPO,
      po_seq:          poSeq,
      po_year:         YEAR,
      subtotal,
      total_value:     subtotal,
      approval_status: 'PENDING_DH',
      source:          'FIELD',
    }).select('id').single()

    if (opoErr) { setError(opoErr.message); setSubmitting(false); return }

    if (opoData?.id) {
      await supabase.from('outgoing_po_items').insert(
        validItems.map((r,i)=>({
          outgoing_po_id: opoData.id,
          sort_order:     i,
          job_type:       r.jobType||'',
          description:    r.description,
          qty:            parseFloat(r.qty)||1,
          unit_price:     parseFloat(r.unitPrice)||0,
          line_total:     (parseFloat(r.qty)||1)*(parseFloat(r.unitPrice)||0),
        }))
      )
    }

    try {
      const dept=departments.find(d=>d.id===deptId)||{}
      printDocument('outgoing_po',{
        po_number:         generatedPO,
        po_date:           poDate,
        vendor_name_en:    sup?.contractor_name||'',
        vendor_code:       sup?.contractor_code||'',
        vendor_type:       selectedCat?.label||category,
        ship_to_dept:      dept.dept_code||dept.dept_name||'',
        requested_by_name: selectedRequester?.full_name_en||'',
        dept_head_name:    deptHeadName||'',
        project_number:    project?`${project.project_number} — ${project.project_name}`:'',
        site_number:       site?`${site.sm_id}${site.site_name?' — '+site.site_name:''}`:'',
        payment_terms:     paymentTerms,
        notes:             notes||'',
        category:          selectedCat?.label||category,
        lines: validItems.map(r=>({
          job_type:    r.jobType||'',
          description: r.description,
          qty:         parseFloat(r.qty)||1,
          unit_price:  parseFloat(r.unitPrice)||0,
          line_total:  (parseFloat(r.qty)||1)*(parseFloat(r.unitPrice)||0),
        })),
      })
    } catch {}

    setSubmitting(false)
    setPoNumber(generatedPO)
    setStep(4)
  }

  function reset() {
    setStep(1); setDeptId(''); setDeptCode(''); setFormEntityId(''); setDeptHeadId(''); setDeptHeadName('')
    setRequestedBy(''); setContact(''); setProjectId(''); setSiteId(''); setSites([])
    setCategory(''); setSupplierId(''); setPaymentTerms('CREDIT'); setNotes(''); setItems([emptyItem()])
    setError(''); setPoNumber('')
  }

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN 4 — SUCCESS
  // ════════════════════════════════════════════════════════════════════════════
  if (step===4) return (
    <div style={{...page(TH.emeraldDark), alignItems:'center', justifyContent:'center', padding:24}}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:64, marginBottom:16 }}>✅</div>
        <div style={{ fontSize:22, fontWeight:800, color:'#fff', marginBottom:8 }}>
          {isAr?'تم إرسال الطلب!':'PO Request Submitted!'}
        </div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)', marginBottom:12 }}>
          {isAr?'رقم طلب الشراء':'PO Number'}
        </div>
        <div style={{ fontSize:20, fontWeight:800, color:TH.amber, background:'rgba(255,255,255,0.08)',
          borderRadius:12, padding:'12px 24px', marginBottom:8, fontFamily:'monospace' }}>
          {poNumber}
        </div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginBottom:6 }}>
          {deptCode} · {selectedCat?.label} · {selectedSupplier?.contractor_name||''}
        </div>
        <div style={{ fontSize:20, fontWeight:800, color:TH.amber, marginBottom:8 }}>
          SAR {totalValue.toLocaleString('en',{minimumFractionDigits:2})}
        </div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginBottom:32 }}>
          {isAr?'جارٍ حفظ الوثيقة في Google Drive…':'Saving PO document to Google Drive…'}
        </div>
        <button onClick={reset} style={{
          background:TH.amber, color:TH.emeraldDark, border:'none', borderRadius:12,
          padding:'14px 36px', fontSize:15, fontWeight:800, cursor:'pointer', fontFamily:'inherit',
        }}>
          {isAr?'طلب جديد':'+ New PO Request'}
        </button>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN 1 — PO INFO
  // ════════════════════════════════════════════════════════════════════════════
  if (step===1) return (
    <div style={page(TH.bg)}>
      <Header step={1} sub={deptCode||'Ratal Group'} lang={lang} setLang={setLang} />

      {devMode && (
        <div style={{ background:'#e8f5e9', border:'2px dashed #388e3c', margin:'12px 14px 0',
          borderRadius:8, padding:'8px 12px', fontSize:12, color:'#1b5e20', fontWeight:700 }}>
          🛠️ Dev Mode — no QR required
        </div>
      )}
      {error && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', margin:'10px 14px 0',
          borderRadius:8, padding:'10px 14px', fontSize:13, color:TH.red, fontWeight:600 }}>
          {error}
        </div>
      )}

      <div style={{ margin:'16px 14px 0', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:28, height:28, borderRadius:'50%', background:TH.emerald,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:13, fontWeight:800, color:'#fff', flexShrink:0 }}>1</div>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:TH.emeraldDark }}>
            {isAr?'معلومات الطلب':'PO Information'}
          </div>
          <div style={{ fontSize:11, color:TH.muted }}>{isAr?'القسم · مقدم الطلب · المشروع':'Dept · Requester · Project'}</div>
        </div>
      </div>

      <SecTitle icon="📅" title={isAr?'التاريخ':'Date'} />
      <div style={card}>
        <label style={lbl}>{isAr?'تاريخ الطلب':'PO Date'} *</label>
        <input type="date" style={inp()} value={poDate} onChange={e=>setPoDate(e.target.value)} />
      </div>

      <SecTitle icon="🏢" title={isAr?'القسم والمسؤول':'Department & Requester'} />
      <div style={card}>
        <label style={lbl}>{isAr?'القسم':'Department'} *</label>
        <select style={inp({marginBottom:12})} value={deptId} onChange={e=>onDept(e.target.value)} disabled={dataLoading}>
          <option value="">{dataLoading?(isAr?'جاري التحميل…':'Loading…'):`-- ${isAr?'اختر':'Select'} --`}</option>
          {departments.map(d=><option key={d.id} value={d.id}>{d.dept_code||d.dept_name}</option>)}
        </select>

        <label style={lbl}>{isAr?'رئيس القسم (تلقائي)':'Department Head (auto)'}</label>
        <div style={inp({ background:'#f8fafc', color:TH.muted, marginBottom:12,
          border:'1.5px dashed #e2e8f0', display:'flex', alignItems:'center', minHeight:44 })}>
          {deptHeadName || (deptId?isAr?'جاري التحميل…':'Loading…':isAr?'— تلقائي —':'— Auto-filled —')}
        </div>

        <label style={lbl}>{isAr?'مقدم الطلب (DH / PM / Supervisor)':'Requested By (DH / PM / Supervisor)'} *</label>
        <select style={inp({ opacity:deptId?1:0.6 })} value={requestedBy}
          onChange={e=>onRequester(e.target.value)} disabled={!deptId||deptLoading}>
          <option value="">
            {deptLoading?(isAr?'جاري التحميل…':'Loading…')
              :deptId?`-- ${isAr?'اختر':'Select'} --`
              :(isAr?'← اختر القسم أولاً':'← Select dept first')}
          </option>
          {deptEmps.map(e=>(
            <option key={e.id} value={e.id}>
              {e.full_name_en}{e.roleLabel?` (${e.roleLabel})`:''}
            </option>
          ))}
        </select>
      </div>

      <SecTitle icon="📍" title={isAr?'المشروع والموقع (اختياري)':'Project & Site (Optional)'} />
      <div style={card}>
        <label style={lbl}>{isAr?'المشروع':'Project'}</label>
        <select style={inp({marginBottom:12, opacity:deptId?1:0.6})} value={projectId}
          onChange={e=>onProject(e.target.value)} disabled={!deptId}>
          <option value="">{deptId?(isAr?'— اختياري —':'— Optional —'):(isAr?'اختر القسم أولاً':'Select dept first')}</option>
          {deptProjects.map(p=><option key={p.id} value={p.id}>{p.project_number} — {p.project_name}</option>)}
        </select>
        {deptId && deptProjects.length===0 && (
          <div style={{ fontSize:11, color:TH.muted, marginBottom:10 }}>No active projects in this dept</div>
        )}

        <label style={lbl}>{isAr?'الموقع':'Site'}</label>
        <select style={inp({ opacity:projectId?1:0.6 })} value={siteId}
          onChange={e=>setSiteId(e.target.value)} disabled={!projectId||sitesLoading}>
          <option value="">
            {!projectId?(isAr?'اختر المشروع أولاً':'Select project first')
              :sitesLoading?(isAr?'جاري التحميل…':'Loading…')
              :(isAr?'— اختياري —':'— Optional —')}
          </option>
          {sites.map(s=><option key={s.id} value={s.id}>{s.sm_id}{s.site_name?` — ${s.site_name}`:''}</option>)}
        </select>
      </div>

      <div style={{ flex:1 }} />
      <div style={btnRow}>
        <button style={btn(TH.emerald)} onClick={()=>{ if(validateStep1()) setStep(2) }}>
          {isAr?'التالي — المورد →':'Next — Supplier →'}
        </button>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN 2 — SUPPLIER
  // ════════════════════════════════════════════════════════════════════════════
  if (step===2) return (
    <div style={page('#0f172a')}>
      <Header step={2} sub={`${deptCode} · ${selectedRequester?.full_name_en||''}`} lang={lang} setLang={setLang} />

      {/* Category chip strip */}
      <div style={{ padding:'14px 14px 0' }}>
        <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.5)',
          textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:10 }}>
          {isAr?'الفئة *':'Category *'}
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {CATEGORIES.map(c=>(
            <button key={c.value} onClick={()=>onCategory(c.value)} style={{
              padding:'8px 14px', borderRadius:24,
              background: category===c.value ? TH.amber : 'rgba(255,255,255,0.08)',
              color:       category===c.value ? TH.emeraldDark : 'rgba(255,255,255,0.7)',
              border:      category===c.value ? `2px solid ${TH.amber}` : '1.5px solid rgba(255,255,255,0.2)',
              fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
              transition:'all 0.15s',
            }}>
              {c.icon} {isAr?c.labelAr:c.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', margin:'10px 14px 0',
          borderRadius:8, padding:'10px 14px', fontSize:13, color:TH.red, fontWeight:600 }}>
          {error}
        </div>
      )}

      <div style={{ margin:'14px 14px 0', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:28, height:28, borderRadius:'50%', background:TH.amber,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:13, fontWeight:800, color:TH.emeraldDark, flexShrink:0 }}>2</div>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>
            {isAr?'المورد والشروط':'Supplier & Terms'}
          </div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>
            {isAr?'اختر المورد وشروط الدفع':'Select supplier & payment terms'}
          </div>
        </div>
      </div>

      {/* Supplier */}
      <div style={{ margin:'10px 14px 0', background:'#1e293b', borderRadius:14,
        border:'1px solid #334155', padding:'14px 14px' }}>
        <label style={{ ...lbl, color:'#94a3b8' }}>
          {isAr?'المورد / المقاول':'Supplier / Vendor / Sub-Con'} *
        </label>
        <select style={inpDark({ marginBottom:4 })} value={supplierId}
          onChange={e=>setSupplierId(e.target.value)} disabled={!category}>
          <option value="">
            {!category?(isAr?'← اختر الفئة أولاً':'← Select category first'):`-- ${isAr?'اختر':'Select'} --`}
          </option>
          {filteredSuppliers.map(s=>(
            <option key={s.id} value={s.id}>
              {s.contractor_name}{s.specialization?` · ${s.specialization}`:''}
            </option>
          ))}
        </select>
        {category && filteredSuppliers.length===0 && (
          <div style={{ fontSize:11, color:'rgba(255,200,0,0.6)', marginTop:4 }}>
            ⚠ No active {selectedCat?.label}s found
          </div>
        )}
        <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginTop:6 }}>
          ⚠ {isAr?'مورد واحد لكل طلب — الأنشطة المتعددة عبر البنود':'One supplier per PO — multiple activities via line items'}
        </div>
      </div>

      {/* Payment Terms */}
      <div style={{ margin:'10px 14px 0', background:'#1e293b', borderRadius:14,
        border:'1px solid #334155', padding:'14px 14px' }}>
        <label style={{ ...lbl, color:'#94a3b8' }}>{isAr?'شروط الدفع':'Payment Terms'}</label>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {PAYMENT_TERMS.map(t=>(
            <button key={t.value} onClick={()=>setPaymentTerms(t.value)} style={{
              padding:'8px 16px', borderRadius:20,
              background: paymentTerms===t.value ? TH.emerald : 'rgba(255,255,255,0.06)',
              color:       paymentTerms===t.value ? '#fff' : 'rgba(255,255,255,0.6)',
              border:      paymentTerms===t.value ? `2px solid ${TH.emeraldMid}` : '1px solid rgba(255,255,255,0.15)',
              fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit',
            }}>
              {isAr?t.labelAr:t.label}
            </button>
          ))}
        </div>
      </div>

      {/* PO Number preview */}
      {supplierId && (
        <div style={{ margin:'10px 14px 0', background:'rgba(0,105,92,0.2)', borderRadius:10,
          border:`1px solid ${TH.emerald}44`, padding:'10px 14px' }}>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', fontWeight:700,
            textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4 }}>
            {isAr?'رقم الطلب المتوقع':'Expected PO Number'}
          </div>
          <div style={{ fontSize:13, fontWeight:700, color:TH.amber, fontFamily:'monospace' }}>
            RAT-PO-{YEAR}-{(selectedSupplier?.contractor_code||'SUP').replace(/[^A-Z0-9]/gi,'').toUpperCase().slice(0,6)}-###
          </div>
        </div>
      )}

      <div style={{ flex:1 }} />
      <div style={btnRow}>
        <button style={btn(TH.red)} onClick={()=>{ setError(''); setStep(1) }}>
          {isAr?'← رجوع':'← Back'}
        </button>
        <button style={btn(TH.amber, TH.emeraldDark)} onClick={()=>{ if(validateStep2()) setStep(3) }}>
          {isAr?'البنود →':'Line Items →'}
        </button>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN 3 — LINE ITEMS + NOTES
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={page(TH.bg)}>
      <Header step={3} sub={`${selectedSupplier?.contractor_name||''}`} lang={lang} setLang={setLang} />

      {/* Running total strip */}
      <div style={{ background:TH.emerald, padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.7)', textTransform:'uppercase', letterSpacing:'0.5px' }}>
          {isAr?'الإجمالي':'Total Value'}
        </span>
        <span style={{ fontSize:20, fontWeight:800, color:TH.amberLight }}>
          SAR {totalValue.toLocaleString('en',{minimumFractionDigits:2})}
        </span>
      </div>

      {error && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', margin:'10px 14px 0',
          borderRadius:8, padding:'10px 14px', fontSize:13, color:TH.red, fontWeight:600 }}>
          {error}
        </div>
      )}

      <div style={{ margin:'14px 14px 0', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:28, height:28, borderRadius:'50%', background:TH.emeraldMid,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:13, fontWeight:800, color:'#fff', flexShrink:0 }}>3</div>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:TH.emeraldDark }}>
            {isAr?`البنود (${items.length})`:`Line Items (${items.length})`}
          </div>
          <div style={{ fontSize:11, color:TH.muted }}>
            {isAr?'الأعمال والكميات والأسعار':'Work descriptions, quantities & prices'}
          </div>
        </div>
      </div>

      {/* Line items */}
      <div style={{ flex:1, overflowY:'auto', paddingBottom:8 }}>
        {!category && (
          <div style={{ margin:'10px 14px', padding:'10px 14px', background:'#fff3e0',
            borderRadius:8, border:'1px solid #ffcc80', fontSize:12, color:TH.amberDark, fontWeight:600 }}>
            ⚠ {isAr?'اختر الفئة في الخطوة 2 لتحميل أنواع الأعمال':'Go back to Step 2 to select a category and load job types'}
          </div>
        )}

        {items.map((item,idx)=>{
          const lineTotal=(parseFloat(item.qty)||0)*(parseFloat(item.unitPrice)||0)
          return (
            <div key={item._id} style={{
              margin:'10px 14px 0', background:TH.white, borderRadius:14,
              border:`1.5px solid ${idx%2===0?TH.tealLight:'#e2e8f0'}`,
              overflow:'hidden',
            }}>
              {/* Card header */}
              <div style={{ background:idx%2===0?TH.emerald:TH.emeraldMid, padding:'10px 14px',
                display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:12, fontWeight:800, color:'#fff', letterSpacing:'0.5px' }}>
                  📝 {isAr?`البند ${idx+1}`:`ITEM ${idx+1}`}
                  {lineTotal>0?` — SAR ${lineTotal.toLocaleString('en',{minimumFractionDigits:2})}`:''}
                </span>
                {items.length>1&&(
                  <button onClick={()=>removeItem(item._id)} style={{
                    background:'rgba(255,255,255,0.2)', border:'none', color:'#fff',
                    borderRadius:6, padding:'3px 10px', fontSize:12, fontWeight:700, cursor:'pointer',
                  }}>✕</button>
                )}
              </div>

              <div style={{ padding:'14px 14px', display:'flex', flexDirection:'column', gap:12 }}>
                {/* Job Type */}
                <div>
                  <label style={lbl}>{isAr?'نوع العمل':'Job Type'}</label>
                  <select style={inp()} value={item.jobType} onChange={e=>updateItem(item._id,'jobType',e.target.value)}>
                    <option value="">--</option>
                    {filteredJobTypes.map(jt=><option key={jt} value={jt}>{jt}</option>)}
                  </select>
                </div>
                {/* Description */}
                <div>
                  <label style={lbl}>{isAr?'البيان / الوصف':'Description'} *</label>
                  <input style={inp()} value={item.description}
                    onChange={e=>updateItem(item._id,'description',e.target.value)}
                    placeholder={isAr?'وصف البند أو الخدمة…':'Item / service description…'} />
                </div>
                {/* Qty + Price */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div>
                    <label style={lbl}>{isAr?'الكمية':'Quantity'}</label>
                    <input type="number" min="0" step="any" style={inp({ textAlign:'right' })}
                      value={item.qty} onChange={e=>updateItem(item._id,'qty',e.target.value)} placeholder="1" />
                  </div>
                  <div>
                    <label style={{ ...lbl, color:TH.amberDark }}>{isAr?'سعر الوحدة (SAR)':'Unit Price (SAR)'}</label>
                    <input type="number" min="0" step="0.01"
                      style={inp({ textAlign:'right', background:item.unitPrice?TH.amberLight:'#fff',
                        border:`1.5px solid ${item.unitPrice?TH.amber:'#e2e8f0'}`,
                        color:item.unitPrice?TH.amberDark:TH.text, fontWeight:item.unitPrice?800:400,
                        fontSize:15 })}
                      value={item.unitPrice} onChange={e=>updateItem(item._id,'unitPrice',e.target.value)} placeholder="0.00" />
                  </div>
                </div>
                {/* Line total */}
                {lineTotal>0&&(
                  <div style={{ textAlign:'right', fontSize:14, fontWeight:800, color:TH.emerald }}>
                    Line Total: SAR {lineTotal.toLocaleString('en',{minimumFractionDigits:2})}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Add line */}
        <button onClick={addItem} style={{
          display:'block', width:'calc(100% - 28px)', margin:'10px 14px',
          padding:'13px', background:'rgba(0,105,92,0.06)',
          border:`1.5px dashed ${TH.emerald}`, borderRadius:12,
          fontSize:14, fontWeight:700, color:TH.emerald, cursor:'pointer',
          fontFamily:'inherit',
        }}>
          + {isAr?'إضافة بند':'Add Item'}
        </button>

        {/* Notes */}
        <SecTitle icon="📝" title={isAr?'الشروط والملاحظات':'Notes / Terms & Conditions'} />
        <div style={card}>
          <label style={lbl}>{isAr?'ملاحظات إضافية':'Additional terms or notes'}</label>
          <textarea style={{ ...inp(), minHeight:80, resize:'vertical' }}
            value={notes} onChange={e=>setNotes(e.target.value)}
            placeholder={isAr?'شروط الدفع، متطلبات خاصة…':'Payment instructions, special requirements…'} />
        </div>

        {/* Review summary */}
        <SecTitle icon="🔍" title={isAr?'ملخص':'Summary'} />
        <div style={{ ...card, marginBottom:4 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {[
              [isAr?'القسم':'Dept',         deptCode],
              [isAr?'التاريخ':'Date',        poDate],
              [isAr?'مقدم الطلب':'By',       selectedRequester?.full_name_en||''],
              [isAr?'الفئة':'Category',      selectedCat?.label||''],
              [isAr?'المورد':'Supplier',     selectedSupplier?.contractor_name||''],
              [isAr?'شروط الدفع':'Terms',    PAYMENT_TERMS.find(t=>t.value===paymentTerms)?.[isAr?'labelAr':'label']||''],
            ].map(([k,v])=>(
              <div key={k}>
                <div style={{ ...lbl, marginBottom:2 }}>{k}</div>
                <div style={{ fontSize:13, fontWeight:600, color:TH.text }}>{v||'—'}</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop:`2px solid ${TH.emerald}`, marginTop:12, paddingTop:10,
            display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:12, fontWeight:700, color:TH.emeraldDark, textTransform:'uppercase' }}>
              {isAr?`${items.filter(r=>r.description?.trim()).length} بند`:`${items.filter(r=>r.description?.trim()).length} item${items.filter(r=>r.description?.trim()).length!==1?'s':''}`}
            </span>
            <span style={{ fontSize:18, fontWeight:800, color:TH.emeraldDark }}>
              SAR {totalValue.toLocaleString('en',{minimumFractionDigits:2})}
            </span>
          </div>
        </div>
      </div>

      <div style={btnRow}>
        <button style={btn(TH.red)} onClick={()=>{ setError(''); setStep(2) }} disabled={submitting}>
          {isAr?'← رجوع':'← Back'}
        </button>
        <button style={btn(TH.emerald)} onClick={()=>{ if(validateStep3()) submit() }} disabled={submitting}>
          {submitting?(isAr?'جاري الإرسال…':'Submitting…'):(isAr?'إرسال الطلب ✓':'Submit PO ✓')}
        </button>
      </div>
    </div>
  )
}
