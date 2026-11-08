import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { exportToExcel } from '../lib/exportExcel'
import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import FormShell from '../components/FormShell'
import { CHAPTER_PALETTES, GROUP_COLORS } from '../styles/appStyles'

// ── HR chapter palette ─────────────────────────────────────────────────────
const MC = GROUP_COLORS.HR           // #795338 — HR chapter accent (L3)
const L1 = CHAPTER_PALETTES.HR.L1   // #BCA99A
const L2 = CHAPTER_PALETTES.HR.L2   // #F7F2ED

const PP = "'Poppins',sans-serif"

// ── Form inline styles ────────────────────────────────────────────────────
const S = {
  inp:   { width:'100%', padding:'9px 11px', borderRadius:4, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:PP, boxSizing:'border-box', background:'#fff' },
  label: { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4, fontFamily:PP, textTransform:'uppercase', letterSpacing:0.3 },
  row:   { display:'flex', gap:12, marginBottom:13, flexWrap:'wrap' },
  col:   { flex:1, minWidth:130 },
  sec:   { fontSize:11, fontWeight:800, color:MC, marginBottom:8, marginTop:4, paddingBottom:4, borderBottom:`1px solid ${L1}`, letterSpacing:1, textTransform:'uppercase', fontFamily:PP },
}

// ── OT constants ──────────────────────────────────────────────────────────
const WORK_TYPES = ['FIELD WORK','OFFICE WORK','REMOTE','ON-CALL','TRAVEL DAY']
const JOB_TYPES  = ['INSTALLATION','COMMISSIONING','MAINTENANCE','SURVEY','TESTING','PROJECT SUPPORT','ADMINISTRATIVE','OTHER']
// All OT multipliers are flat 1.5×. TRAVEL is 1.0×. (No 1.75× or 2.0×)
const OT_MULT    = { NORMAL:1.5, FRIDAY:1.5, HOLIDAY:1.5, TRAVEL:1.0 }

const STATUS_COLORS = {
  SUBMITTED: { bg:'#e3f2fd', color:'#0277bd' },
  PENDING:   { bg:'#fff3e0', color:'#e65100' },
  APPROVED:  { bg:'#e8f5e9', color:'#2e7d32' },
  REJECTED:  { bg:'#ffebee', color:'#c62828' },
}

const GRID = '110px 90px 1fr 60px 110px 80px 60px 90px 90px 80px'
const cell = { padding:'0 4px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontSize:12, display:'flex', alignItems:'center' }
const SAR  = n => `SAR ${(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`

// ── Sub-component: OT row list with expandable details ───────────────────
function OTList({ records, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(null)
  return (
    <div>
      {records.map(r => {
        const sc     = STATUS_COLORS[r.status] || { bg:'#f5f5f5', color:'#555' }
        const isEx   = expanded === r.id
        const canAct = ['SUBMITTED','PENDING'].includes(r.status)
        return (
          <div key={r.id}>
            {/* ── Single-line row ── */}
            <div
              onClick={() => setExpanded(isEx ? null : r.id)}
              style={{
                display:'grid', gridTemplateColumns:GRID, gap:0,
                padding:'9px 12px', borderTop:'1px solid #f0f4f8',
                cursor:'pointer',
                background: isEx ? L2 : 'transparent',
                borderLeft: isEx ? `3px solid ${MC}` : '3px solid transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e=>{ if(!isEx) e.currentTarget.style.background='#faf6f2' }}
              onMouseLeave={e=>{ if(!isEx) e.currentTarget.style.background='transparent' }}
            >
              <div style={{ ...cell, fontWeight:700, color:MC, fontSize:11 }}>{r.request_number||'—'}</div>
              <div style={{ ...cell, color:'#546e7a' }}>{r.ot_date}</div>
              <div style={{ ...cell, fontWeight:600 }}>{r.employees?.full_name_en || r.requester_name || '—'}</div>
              <div style={{ ...cell, color:MC, fontWeight:700, fontSize:11 }}>{r.department || r.department_name || '—'}</div>
              <div style={{ ...cell, color:'#546e7a' }}>{r.project_number || '—'}</div>
              <div style={{ ...cell, fontWeight:700 }}>{r.ot_type}</div>
              <div style={{ ...cell, justifyContent:'flex-end', fontWeight:600 }}>{r.hours}h</div>
              <div style={{ ...cell, justifyContent:'flex-end', fontWeight:700 }}>{SAR(r.total_amount)}</div>
              <div style={cell}>
                <span style={{ background:sc.bg, color:sc.color, borderRadius:5, padding:'2px 7px', fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>{r.status}</span>
              </div>
              <div style={{ ...cell, gap:4 }} onClick={e=>e.stopPropagation()}>
                {canAct && <>
                  <button onClick={()=>onApprove(r.id)} style={{ background:'#e8f5e9', color:'#2e7d32', border:'none', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:11, fontWeight:700 }}>✓</button>
                  <button onClick={()=>onReject(r.id)}  style={{ background:'#ffebee', color:'#c62828', border:'none', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:11, fontWeight:700 }}>✕</button>
                </>}
                <span style={{ fontSize:10, color:'#aab2bd', marginLeft:2 }}>{isEx ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* ── Expandable detail panel ── */}
            {isEx && (
              <div style={{
                background:L2, borderTop:`1px solid ${L1}`, borderLeft:`3px solid ${MC}`,
                padding:'12px 16px',
                display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px 20px', fontSize:12,
              }}>
                {[
                  ['Employee #',   r.employees?.employee_number || '—'],
                  ['Contact',      r.contact_number || '—'],
                  ['Department',   r.department || r.department_name || '—'],
                  ['Project #',    r.project_number || '—'],
                  ['Project Name', r.project_name || '—'],
                  ['Job #',        r.job_number || '—'],
                  ['OT Type',      r.ot_type || '—'],
                  ['Work Type',    r.work_type || '—'],
                  ['From Time',    r.from_time || '—'],
                  ['To Time',      r.to_time || '—'],
                  ['Hours',        `${r.hours}h`],
                  ['OT Rate/hr',   `SAR ${(r.ot_rate||0).toFixed(2)}`],
                  ['Multiplier',   `×${r.multiplier||1.5}`],
                  ['Total Amount', SAR(r.total_amount)],
                  ['Status',       r.status],
                  ['Remarks',      r.remarks || r.reason || '—'],
                ].map(([k,v]) => (
                  <div key={k}>
                    <div style={{ fontSize:10, color:'#6b7c93', fontWeight:700, marginBottom:2 }}>{k}</div>
                    <div style={{ fontWeight:600, color:'#222' }}>{v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function Overtime({ entityId, role }) {
  const [records,     setRecords]     = useState([])
  const [employees,   setEmployees]   = useState([])
  const [depts,       setDepts]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showBanner,  setShowBanner]  = useState(false)
  const [open,        setOpen]        = useState(false)
  const [wizardStep,  setWizardStep]  = useState(0)
  const [saving,      setSaving]      = useState(false)
  const [filterSt,    setFilterSt]    = useState('ALL')

  // ── Filter states — declared before the filtered computation ──
  const thisMonth = new Date().toISOString().slice(0,7)
  const [filterMon,    setFilterMon]    = useState(thisMonth)
  const [filterDept,   setFilterDept]   = useState('')
  const [filterSearch, setFilterSearch] = useState('')

  // ── Form states ──
  const [otDate,    setOtDate]    = useState(new Date().toISOString().split('T')[0])
  const [empId,     setEmpId]     = useState('')
  const [deptId,    setDeptId]    = useState('')
  const [deptName,  setDeptName]  = useState('')
  const [projNum,   setProjNum]   = useState('')
  const [projName,  setProjName]  = useState('')
  const [jobNum,    setJobNum]    = useState('')
  const [jobType,   setJobType]   = useState('')
  const [workType,  setWorkType]  = useState('')
  const [otType,    setOtType]    = useState('NORMAL')
  const [fromTime,  setFromTime]  = useState('')
  const [toTime,    setToTime]    = useState('')
  const [hours,     setHours]     = useState('')
  const [reason,    setReason]    = useState('')

  // ── Site-assignment auto-populate ──
  const [projects,         setProjects]         = useState([])
  const [sites,            setSites]            = useState([])
  const [assignment,       setAssignment]       = useState(null)
  const [assignmentLoading,setAssignmentLoading]= useState(false)
  const [dupWarning,       setDupWarning]       = useState(false)   // OT already exists for this emp+date

  useEffect(() => { load() }, [entityId])

  async function load() {
    if (!entityId) return
    setLoading(true)
    const [{ data: r }, { data: e }, { data: d }, { data: allEmp }, { data: prj }, { data: sms }] = await Promise.all([
      supabase.from('overtime_requests')
        .select('*')                          // flat — no nested join (avoids PGRST201)
        .eq('entity_id', entityId)
        .order('ot_date', { ascending:false }),
      supabase.from('employees')
        .select('id,full_name_en,employee_number,basic_salary,department_id')
        .eq('entity_id', entityId).neq('is_active', false).order('full_name_en'),
      supabase.from('departments')
        .select('id,dept_name,dept_code')
        .eq('entity_id', entityId).neq('is_active', false).order('dept_name'),
      supabase.from('employees')
        .select('id,full_name_en,employee_number,basic_salary,department_id')
        .neq('is_active', false),
      supabase.from('projects')
        .select('id,project_number,project_name')
        .eq('entity_id', entityId),
      supabase.from('site_masters')
        .select('id,sm_id,job_no,site_name,project_id')
        .eq('entity_id', entityId),
    ])
    // Build empMap in JS — no nested join needed (avoids PGRST201)
    const empMap  = Object.fromEntries([...(e||[]),...(allEmp||[])].map(x=>[x.id, x]))
    const enriched = (r||[]).map(row => ({
      ...row,
      employees: empMap[row.employee_id] || {},
    }))
    setRecords(enriched); setEmployees(e||[]); setDepts(d||[])
    setProjects(prj||[]); setSites(sms||[])
    setLoading(false)
  }

  // ── Fetch site assignment when employee + date changes ───────────────────
  useEffect(() => {
    if (!empId || !otDate || !entityId) { setAssignment(null); return }
    setAssignmentLoading(true)
    supabase.from('site_assignments')
      .select('id,employee_id,site_master_id,project_id,department_id,assignment_date,is_remote,allow_ot,notes')
      .eq('entity_id', entityId)
      .eq('employee_id', empId)
      .eq('assignment_date', otDate)
      .eq('status', 'ACTIVE')
      .maybeSingle()
      .then(({ data }) => {
        setAssignment(data || null)
        setAssignmentLoading(false)
        // Auto-fill project + dept from assignment
        if (data) {
          const proj = projects.find(p => p.id === data.project_id)
          const site = sites.find(s => s.id === data.site_master_id)
          if (proj) { setProjNum(proj.project_number || ''); setProjName(proj.project_name || '') }
          if (site) { setJobNum(site.job_no || '') }
          if (data.department_id && !deptId) {
            onDeptChange(data.department_id)
          }
        }
      })
    // Duplicate guard: check if OT already exists for this employee+date
    supabase.from('overtime_requests')
      .select('id', { count:'exact', head:true })
      .eq('entity_id', entityId)
      .eq('employee_id', empId)
      .eq('ot_date', otDate)
      .then(({ count }) => setDupWarning((count||0) > 0))
  }, [empId, otDate, entityId])

  // ── Date validation ──────────────────────────────────────────────────────
  function validateOtDate(d) {
    const today   = new Date(); today.setHours(0,0,0,0)
    const sel     = new Date(d + 'T00:00:00')
    const diffDays = Math.floor((today - sel) / 86400000)
    if (sel > today)    return 'OT date cannot be in the future.'
    if (diffDays > 7)   return 'Maximum lookback is 7 days.'
    return null
  }

  function calcHours(from, to) {
    if (!from || !to) return
    const [fh,fm] = from.split(':').map(Number)
    const [th,tm] = to.split(':').map(Number)
    const diff = (th*60+tm) - (fh*60+fm)
    if (diff > 0) setHours((diff/60).toFixed(2))
  }

  function onDeptChange(id) {
    setDeptId(id)
    const found = depts.find(x=>x.id===id)
    setDeptName(found ? found.dept_name : '')
  }

  // ── OT rate calculation ──
  const emp        = employees.find(e=>e.id===empId)
  const empBasic   = emp ? (emp.basic_salary || 0) : 0
  const hourlyRate = empBasic / 30 / 8
  const mult       = OT_MULT[otType] ?? 1.5
  const totalAmt   = (parseFloat(hours)||0) * hourlyRate * mult

  function resetForm() {
    setOtDate(new Date().toISOString().split('T')[0])
    setEmpId(''); setDeptId(''); setDeptName('')
    setProjNum(''); setProjName(''); setJobNum(''); setJobType(''); setWorkType('')
    setOtType('NORMAL'); setFromTime(''); setToTime(''); setHours(''); setReason('')
    setAssignment(null); setDupWarning(false)
    setWizardStep(0)
  }

  async function save() {
    if (!empId)  { alert('Please select an employee.'); return }
    if (!hours)  { alert('Hours are required.'); return }
    setSaving(true)
    const reqNum = `OT-${Date.now().toString().slice(-6)}`
    const { error } = await supabase.from('overtime_requests').insert({
      entity_id:         entityId,
      request_number:    reqNum,
      employee_id:       empId,
      site_assignment_id: assignment?.id || null,
      department_id:     deptId  || null,
      department_name:   deptName || null,
      project_number:    projNum  || null,
      project_name:      projName  || null,
      job_number:        jobNum   || null,
      job_type:          jobType  || null,
      work_type:         workType || null,
      ot_date:           otDate,
      from_time:         fromTime || null,
      to_time:           toTime   || null,
      hours:             parseFloat(hours) || 0,
      ot_type:           otType,
      ot_rate:           parseFloat(hourlyRate.toFixed(2)),
      total_amount:      parseFloat(totalAmt.toFixed(2)),
      reason:            reason || null,
      status:            'PENDING',
    })
    setSaving(false)
    if (error) { alert(error.message); return }
    setOpen(false); setWizardStep(0); resetForm(); load()
  }

  async function approve(id) {
    await supabase.from('overtime_requests')
      .update({ status:'APPROVED', approved_date: new Date().toISOString().split('T')[0] })
      .eq('id', id)
    load()
  }

  async function reject(id) {
    await supabase.from('overtime_requests').update({ status:'REJECTED' }).eq('id', id)
    load()
  }

  // ── Filtered view ──
  const filtered = records.filter(r => {
    if (filterMon && !(r.ot_date||'').startsWith(filterMon))              return false
    if (filterSt !== 'ALL' && r.status !== filterSt)                       return false
    if (filterDept && r.department_id !== filterDept) return false
    if (filterSearch) {
      const q    = filterSearch.toLowerCase()
      const name = (r.employees?.full_name_en || r.requester_name || '').toLowerCase()
      const req  = (r.request_number||'').toLowerCase()
      if (!name.includes(q) && !req.includes(q)) return false
    }
    return true
  })

  function doExport() {
    const flat = filtered.map(r => ({
      ...r,
      employee_name:   r.employees?.full_name_en    || '',
      employee_number: r.employees?.employee_number || '',
    }))
    exportToExcel(flat, [
      { key:'request_number',  label:'Req #' },
      { key:'ot_date',         label:'Date',          format:'date'     },
      { key:'employee_name',   label:'Employee' },
      { key:'employee_number', label:'Emp #' },
      { key:'department_name', label:'Department' },
      { key:'project_name',    label:'Project' },
      { key:'job_number',      label:'Job #' },
      { key:'job_type',        label:'Job Type' },
      { key:'work_type',       label:'Work Type' },
      { key:'ot_type',         label:'OT Type' },
      { key:'from_time',       label:'Time In' },
      { key:'to_time',         label:'Time Out' },
      { key:'hours',           label:'Hours' },
      { key:'ot_rate',         label:'Rate/hr (SAR)', format:'currency' },
      { key:'total_amount',    label:'Total (SAR)',   format:'currency' },
      { key:'reason',          label:'Reason' },
      { key:'status',          label:'Status' },
    ], 'Overtime_Requests', 'Overtime')
  }

  // ── KPI summary ──
  const SAR2 = n => `SAR ${(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`
  const kpis = [
    { label:'Total OT Cost', value:SAR2(filtered.reduce((s,r)=>s+(r.total_amount||0),0)),                                   icon:'⏱' },
    { label:'Submitted',     value:SAR2(filtered.filter(r=>r.status==='SUBMITTED').reduce((s,r)=>s+(r.total_amount||0),0)), icon:'📤' },
    { label:'Pending',       value:SAR2(filtered.filter(r=>r.status==='PENDING').reduce((s,r)=>s+(r.total_amount||0),0)),   icon:'⏳' },
    { label:'Approved',      value:SAR2(filtered.filter(r=>r.status==='APPROVED').reduce((s,r)=>s+(r.total_amount||0),0)),  icon:'✅' },
  ]

  const deptOptions = depts  // already loaded from departments table with dept_code
  const inp2 = { padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', fontFamily:'inherit', background:'#fff' }

  return (
    <>
      {/* ── Step 0 entry banner ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); setWizardStep(0); setOpen(true) }}
        chapterName="HR"
        formTitle={['New', 'OT', 'Request']}
        heading="Record overtime hours for calculation, approval and payroll integration."
        iconLabel="⏱️"
        workflowSteps={['Employee & Date', 'Assignment Details', 'Time & Hours', 'Review & Submit']}
      />

      {/* ── Chapter page wrapper ── */}
      <ChapterPage
        chapterName="HR"
        chapterIcon="⏱️"
        chapterColor={MC}
        chapterSubtitle="Overtime requests, approvals and OT cost tracking"
        sectionTitle="Overtime Register"
        onNew={() => setShowBanner(true)}
        newLabel="+ New OT Request"
        kpis={kpis}
      >
        {/* ── Filter bar ── */}
        <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
          <input type="month" value={filterMon} onChange={e=>setFilterMon(e.target.value)} style={inp2} />
          <select value={filterSt} onChange={e=>setFilterSt(e.target.value)} style={inp2}>
            <option value="ALL">All Status</option>
            {['SUBMITTED','PENDING','APPROVED','REJECTED'].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterDept} onChange={e=>setFilterDept(e.target.value)} style={inp2}>
            <option value="">All Depts</option>
            {deptOptions.map(d=><option key={d.id} value={d.id}>{d.dept_code||'—'}</option>)}
          </select>
          <input
            placeholder="🔍 Search employee / req #"
            value={filterSearch}
            onChange={e=>setFilterSearch(e.target.value)}
            style={{ ...inp2, minWidth:200, flex:1 }}
          />
          {(filterMon!==thisMonth || filterSt!=='ALL' || filterDept || filterSearch) && (
            <button
              onClick={()=>{ setFilterMon(thisMonth); setFilterSt('ALL'); setFilterDept(''); setFilterSearch('') }}
              style={{ ...inp2, background:'#ffebee', color:'#c62828', border:'1px solid #ffcdd2', cursor:'pointer', fontWeight:700 }}
            >✕ Clear</button>
          )}
          <button
            onClick={doExport}
            style={{ background:'#2e7d32', color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', cursor:'pointer', fontSize:12, fontWeight:700, whiteSpace:'nowrap' }}
          >📥 Export Excel</button>
          <span style={{ fontSize:12, color:'#6b7c93' }}>{filtered.length} record{filtered.length!==1?'s':''}</span>
        </div>

        {/* ── Table ── */}
        <div style={{ background:'#fff', borderRadius:12, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', overflow:'hidden', flex:1 }}>
          {/* Header row — HR accent color */}
          <div style={{
            display:'grid', gridTemplateColumns:GRID, gap:0,
            background:MC, padding:'9px 12px',
          }}>
            {['Req #','Date','Employee','Dept','Project #','OT Type','Hours','Amount','Status',''].map(h=>(
              <div key={h} style={{
                fontSize:10, fontWeight:700, color:'#fff',
                letterSpacing:0.8, textTransform:'uppercase',
                whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', padding:'0 4px',
              }}>{h}</div>
            ))}
          </div>

          {loading
            ? <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>Loading…</div>
            : filtered.length===0
              ? <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No OT records for this period</div>
              : <OTList records={filtered} onApprove={approve} onReject={reject} />
          }
        </div>
      </ChapterPage>

      {/* ── New OT Request — FormShell 3-step wizard ── */}
      <FormShell
        isOpen={open}
        onClose={() => { setOpen(false); resetForm() }}
        chapterName="HR"
        title={['New', 'OT', 'Request']}
        steps={['Employee & Date', 'Assignment Details', 'Time & Hours', 'Review & Submit']}
        currentStep={wizardStep}
        onBack={() => wizardStep === 0 ? (setOpen(false), resetForm()) : setWizardStep(s => s - 1)}
        backLabel={wizardStep === 0 ? 'Cancel' : '← Back'}
        onNext={() => {
          if (wizardStep === 0) {
            if (!empId) { alert('Please select an employee.'); return }
            const dateErr = validateOtDate(otDate)
            if (dateErr) { alert(dateErr); return }
            if (dupWarning) {
              if (!window.confirm(`An OT record already exists for this employee on ${otDate}. Continue anyway?`)) return
            }
            setWizardStep(1)
          } else if (wizardStep === 1) {
            // Assignment details — just advance (read-only step)
            setWizardStep(2)
          } else if (wizardStep === 2) {
            if (!hours) { alert('Hours are required.'); return }
            setWizardStep(3)
          } else {
            save()
          }
        }}
        nextLabel={wizardStep === 3 ? (saving ? 'Submitting…' : 'Submit OT Request') : 'Next →'}
        nextDisabled={saving}
        subjectLabel={{ line1: depts.find(d=>d.id===deptId)?.dept_code || deptName || null, line2: employees.find(e=>e.id===empId)?.full_name_en || null }}
      >
        {/* ── Step 1: Request Details ── */}
        {wizardStep === 0 && (
          <div>
            <div style={S.sec}>Employee & Date</div>
            <div style={{ display:'flex', gap:12, marginBottom:13, flexWrap:'wrap' }}>
              <div style={{ flex:'0 0 140px' }}>
                <label style={S.label}>Department</label>
                <select style={S.inp} value={deptId} onChange={e => { onDeptChange(e.target.value); setEmpId('') }}>
                  <option value="">— All —</option>
                  {depts.map(d => <option key={d.id} value={d.id}>{d.dept_code||'—'}</option>)}
                </select>
              </div>
              <div style={{ flex:1 }}>
                <label style={S.label}>Employee *</label>
                <select style={S.inp} value={empId} onChange={e => setEmpId(e.target.value)}>
                  <option value="">— Select Employee —</option>
                  {employees
                    .filter(e => !deptId || e.department_id === deptId)
                    .map(e => <option key={e.id} value={e.id}>{e.full_name_en}{e.employee_number ? ' · '+e.employee_number : ''}</option>)}
                </select>
              </div>
            </div>
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>OT Date *</label>
                <input type="date" style={S.inp} value={otDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => setOtDate(e.target.value)}
                />
                {validateOtDate(otDate) && (
                  <div style={{ fontSize:11, color:'#c62828', marginTop:3, fontFamily:PP }}>{validateOtDate(otDate)}</div>
                )}
              </div>
            </div>
            {dupWarning && (
              <div style={{ background:'#fff8e1', border:'1px solid #ffe082', borderRadius:6, padding:'8px 12px', fontSize:12, color:'#e65100', fontFamily:PP }}>
                ⚠ An OT request already exists for this employee on this date. You'll be asked to confirm before proceeding.
              </div>
            )}
          </div>
        )}

        {/* ── Step 1: Assignment Details (auto-populated from site_assignments) ── */}
        {wizardStep === 1 && (
          <div>
            <div style={S.sec}>Site Assignment for {otDate}</div>
            {assignmentLoading ? (
              <div style={{ textAlign:'center', padding:24, color:MC, fontFamily:PP }}>Loading assignment…</div>
            ) : assignment ? (
              <>
                <div style={{ background:L2, border:`1px solid ${L1}`, borderRadius:8, padding:'14px 16px', marginBottom:14 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'10px 20px', fontSize:12 }}>
                    {[
                      ['Project #',    projects.find(p=>p.id===assignment.project_id)?.project_number || '—'],
                      ['Project Name', projects.find(p=>p.id===assignment.project_id)?.project_name  || '—'],
                      ['Job #',        sites.find(s=>s.id===assignment.site_master_id)?.job_no        || '—'],
                      ['Site Name',    sites.find(s=>s.id===assignment.site_master_id)?.site_name     || '—'],
                      ['Remote',       assignment.is_remote ? 'Yes' : 'No'],
                      ['OT Allowed',   assignment.allow_ot  ? '✅ Yes' : '⚠ Not set'],
                    ].map(([k,v]) => (
                      <div key={k}>
                        <div style={{ fontSize:10, color:'#6b7c93', fontWeight:700, marginBottom:2, fontFamily:PP, textTransform:'uppercase' }}>{k}</div>
                        <div style={{ fontWeight:600, color:'#222', fontFamily:PP }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {assignment.notes && (
                    <div style={{ marginTop:10, fontSize:12, color:'#546e7a', fontFamily:PP }}>
                      <span style={{ fontWeight:700 }}>Notes: </span>{assignment.notes}
                    </div>
                  )}
                </div>
                {!assignment.allow_ot && (
                  <div style={{ background:'#fff8e1', border:'1px solid #ffe082', borderRadius:6, padding:'8px 12px', fontSize:12, color:'#e65100', fontFamily:PP, marginBottom:12 }}>
                    ⚠ OT flag is not set for this assignment. Proceed only if authorized.
                  </div>
                )}
              </>
            ) : (
              <div style={{ background:'#fff3e0', border:'1px solid #ffcc80', borderRadius:8, padding:'16px', marginBottom:14 }}>
                <div style={{ fontWeight:700, color:'#e65100', marginBottom:6, fontFamily:PP }}>⚠ No Site Assignment Found</div>
                <div style={{ fontSize:12, color:'#bf360c', fontFamily:PP }}>
                  No active site assignment exists for this employee on {otDate}.<br/>
                  You can continue and enter project details manually on the next step.
                </div>
              </div>
            )}
            <div style={{ borderTop:`1px solid ${L1}`, paddingTop:12, marginTop:4 }}>
              <div style={S.sec}>OT Type</div>
              <div style={S.row}>
                <div style={S.col}>
                  <label style={S.label}>OT Type</label>
                  <select style={S.inp} value={otType} onChange={e => setOtType(e.target.value)}>
                    <option value="NORMAL">Normal OT (×1.5)</option>
                    <option value="FRIDAY">Friday (×1.5)</option>
                    <option value="HOLIDAY">Public Holiday (×1.5)</option>
                    <option value="TRAVEL">Travel Day (×1.0)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Project & Hours ── */}
        {wizardStep === 2 && (
          <div>
            <div style={S.sec}>Project / Job Details</div>
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>Project #</label>
                <input style={S.inp} value={projNum} onChange={e => setProjNum(e.target.value)} placeholder="PROJ-001" />
              </div>
              <div style={S.col}>
                <label style={S.label}>Project Name</label>
                <input style={S.inp} value={projName} onChange={e => setProjName(e.target.value)} />
              </div>
            </div>
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>Job #</label>
                <input style={S.inp} value={jobNum} onChange={e => setJobNum(e.target.value)} />
              </div>
              <div style={S.col}>
                <label style={S.label}>Job Type</label>
                <select style={S.inp} value={jobType} onChange={e => setJobType(e.target.value)}>
                  <option value="">— Select —</option>
                  {JOB_TYPES.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>
              <div style={S.col}>
                <label style={S.label}>Work Type</label>
                <select style={S.inp} value={workType} onChange={e => setWorkType(e.target.value)}>
                  <option value="">— Select —</option>
                  {WORK_TYPES.map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>
            <div style={S.sec}>Time & Hours</div>
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>From Time</label>
                <input type="time" style={S.inp} value={fromTime} onChange={e => { setFromTime(e.target.value); calcHours(e.target.value, toTime) }} />
              </div>
              <div style={S.col}>
                <label style={S.label}>To Time</label>
                <input type="time" style={S.inp} value={toTime} onChange={e => { setToTime(e.target.value); calcHours(fromTime, e.target.value) }} />
              </div>
              <div style={S.col}>
                <label style={S.label}>Hours *</label>
                <input type="number" step="0.25" style={S.inp} value={hours} onChange={e => setHours(e.target.value)} placeholder="e.g. 2.5" />
              </div>
            </div>
            {/* ── Normal OT early-start warning ── */}
            {otType === 'NORMAL' && fromTime && fromTime < '17:00' && (
              <div style={{ background:'#fff8e1', border:'1px solid #ffe082', borderRadius:6, padding:'8px 12px', fontSize:12, color:'#e65100', fontFamily:PP, marginBottom:10 }}>
                ⚠ Normal OT typically starts after shift hours (17:00). Current start is {fromTime}. You can still proceed if authorized.
              </div>
            )}
            {empId && (
              <div style={{ background:L2, border:`1px solid ${L1}`, borderRadius:4, padding:'10px 16px', marginBottom:13, display:'flex', gap:16, flexWrap:'wrap', alignItems:'center' }}>
                <span style={{ fontSize:13, fontFamily:PP }}>Hourly Rate: <strong>SAR {hourlyRate.toFixed(2)}</strong></span>
                <span style={{ fontSize:13, fontFamily:PP }}>Multiplier: <strong>×{mult}</strong></span>
                <span style={{ fontSize:13, fontFamily:PP }}>Hours: <strong>{parseFloat(hours) || 0}h</strong></span>
                <span style={{ fontSize:14, marginLeft:'auto', fontWeight:800, color:MC, fontFamily:PP }}>
                  Total: SAR {totalAmt.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Step 3: Review & Submit ── */}
        {wizardStep === 3 && (
          <div>
            <div style={S.sec}>Review & Submit</div>
            <div style={{ background:L2, border:`1px solid ${L1}`, borderRadius:4, padding:'12px 16px', marginBottom:16, display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 20px' }}>
              {[
                ['Employee', employees.find(e => e.id === empId)?.full_name_en || '—'],
                ['Department', deptName || '—'],
                ['OT Date', otDate],
                ['OT Type', otType],
                ['Project', projNum || '—'],
                ['Job Type', jobType || '—'],
                ['From Time', fromTime || '—'],
                ['To Time', toTime || '—'],
                ['Hours', hours ? `${hours}h` : '—'],
                ['Estimated Total', `SAR ${totalAmt.toFixed(2)}`],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize:9, color:'#6b7c93', fontWeight:700, fontFamily:PP, textTransform:'uppercase' }}>{k}</div>
                  <div style={{ fontWeight:600, color:'#1a2e3d', fontSize:12, fontFamily:PP }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={S.label}>Reason / Work Done</label>
              <textarea style={{ ...S.inp, minHeight:80, resize:'vertical' }} value={reason} onChange={e => setReason(e.target.value)} placeholder="Describe the work performed during overtime…" />
            </div>
          </div>
        )}
      </FormShell>
    </>
  )
}
