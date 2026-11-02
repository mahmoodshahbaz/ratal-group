import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { exportToExcel } from '../lib/exportExcel'
import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import FormShell from '../components/FormShell'
import { CHAPTER_PALETTES, GROUP_COLORS } from '../styles/appStyles'

// ── HR chapter palette ────────────────────────────────────────────────────
const MC = GROUP_COLORS.HR           // #795338
const L1 = CHAPTER_PALETTES.HR.L1   // #BCA99A
const L2 = CHAPTER_PALETTES.HR.L2   // #F7F2ED
const PP = "'Poppins',sans-serif"

const S = {
  inp:   { width:'100%', padding:'9px 11px', borderRadius:4, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:PP, boxSizing:'border-box', background:'#fff' },
  label: { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4, fontFamily:PP, textTransform:'uppercase', letterSpacing:0.3 },
  row:   { display:'flex', gap:12, marginBottom:13, flexWrap:'wrap' },
  col:   { flex:1, minWidth:130 },
  sec:   { fontSize:11, fontWeight:800, color:MC, marginBottom:8, marginTop:4, paddingBottom:4, borderBottom:`1px solid ${L1}`, letterSpacing:1, textTransform:'uppercase', fontFamily:PP },
}

const STATUS_COLORS = {
  APPROVED:  { bg:'#e8f5e9', color:'#2e7d32' },
  SUBMITTED: { bg:'#e3f2fd', color:'#0277bd' },
  PENDING:   { bg:'#fff3e0', color:'#e65100' },
  REJECTED:  { bg:'#ffebee', color:'#c62828' },
}

const SAR = n => `SAR ${(n||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}`
const GRID = '100px 90px 1fr 90px 100px 70px 90px 90px 80px'
const cell = { padding:'0 4px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontSize:12, display:'flex', alignItems:'center' }

export default function FoodAllowance({ entityId }) {
  // ── List state ──
  const [records,     setRecords]     = useState([])
  const [employees,   setEmployees]   = useState([])
  const [depts,       setDepts]       = useState([])
  const [projects,    setProjects]    = useState([])
  const [sites,       setSites]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const thisMonth = new Date().toISOString().slice(0,7)
  const [filterMon,    setFilterMon]    = useState(thisMonth)
  const [filterDept,   setFilterDept]   = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [search,       setSearch]       = useState('')

  // ── Banner & wizard ──
  const [showBanner,  setShowBanner]  = useState(false)
  const [open,        setOpen]        = useState(false)
  const [wizardStep,  setWizardStep]  = useState(0)
  const [saving,      setSaving]      = useState(false)

  // ── Bulk Date roster ──
  const [faDate,        setFaDate]        = useState(new Date().toISOString().split('T')[0])
  const [roster,        setRoster]        = useState([])   // enriched site_assignments for faDate
  const [rosterLoading, setRosterLoading] = useState(false)
  const [selected,      setSelected]      = useState(new Set())  // Set of empIds to bulk-submit

  // ── Single-employee fallback form ──
  const [singleEmpId,  setSingleEmpId]  = useState('')
  const [singleDeptId, setSingleDeptId] = useState('')
  const [singleDeptNm, setSingleDeptNm] = useState('')
  const [projNum,      setProjNum]      = useState('')
  const [projName,     setProjName]     = useState('')
  const [jobNum,       setJobNum]       = useState('')
  const [location,     setLocation]     = useState('')
  const [dailyRate,    setDailyRate]    = useState('50')
  const [daysCount,    setDaysCount]    = useState('')
  const [faMonth,      setFaMonth]      = useState(thisMonth)

  // ── useMode: 'bulk' (roster) or 'single' (manual) ──
  const [useMode,      setUseMode]      = useState('bulk')

  useEffect(() => { load() }, [entityId, filterMon])

  async function load() {
    if (!entityId) return
    setLoading(true)
    const [{ data: r }, { data: e }, { data: d }, { data: prj }, { data: sms }] = await Promise.all([
      supabase.from('food_allowances')
        .select('id,request_number,allowance_date,allowance_month,employee_id,department,location,job_no,job_type,no_persons,no_days,daily_rate,total_amount,remarks,status,created_at,site_assignment_id')
        .eq('entity_id', entityId)
        .eq('allowance_month', filterMon)
        .order('created_at', { ascending: false }),
      supabase.from('employees')
        .select('id,full_name_en,employee_number,fa_eligible,fa_amount,department_id')
        .eq('entity_id', entityId).neq('is_active', false).order('full_name_en'),
      supabase.from('departments')
        .select('id,dept_name,dept_code')
        .eq('entity_id', entityId).neq('is_active', false).order('dept_name'),
      supabase.from('projects')
        .select('id,project_number,project_name')
        .eq('entity_id', entityId),
      supabase.from('site_masters')
        .select('id,sm_id,job_no,site_name,project_id')
        .eq('entity_id', entityId),
    ])
    const empMap  = Object.fromEntries((e||[]).map(x=>[x.id,x]))
    const deptMap = Object.fromEntries((d||[]).map(x=>[x.id,x]))
    const enriched = (r||[]).map(row => {
      const emp  = empMap[row.employee_id] || {}
      const dept = deptMap[emp.department_id] || {}
      return { ...row, emp, deptCode: dept.dept_code || dept.dept_name || row.department || '' }
    })
    setRecords(enriched); setEmployees(e||[]); setDepts(d||[])
    setProjects(prj||[]); setSites(sms||[])
    setLoading(false)
  }

  // ── Load roster when date changes ─────────────────────────────────────────
  const loadRoster = useCallback(async () => {
    if (!entityId || !faDate) return
    setRosterLoading(true)
    // 1. Get site_assignments for that date
    const { data: assigns } = await supabase.from('site_assignments')
      .select('id,employee_id,site_master_id,project_id,department_id,allow_fa')
      .eq('entity_id', entityId)
      .eq('assignment_date', faDate)
      .eq('status', 'ACTIVE')

    if (!assigns?.length) { setRoster([]); setSelected(new Set()); setRosterLoading(false); return }

    // 2. Check which employees already claimed for this date
    const empIds = assigns.map(a => a.employee_id).filter(Boolean)
    const { data: claimed } = await supabase.from('food_allowances')
      .select('employee_id')
      .eq('entity_id', entityId)
      .eq('allowance_date', faDate)
      .in('employee_id', empIds)

    const claimedSet = new Set((claimed||[]).map(c => c.employee_id))

    // 3. Enrich roster
    const empMap  = Object.fromEntries(employees.map(e=>[e.id,e]))
    const projMap = Object.fromEntries(projects.map(p=>[p.id,p]))
    const siteMap = Object.fromEntries(sites.map(s=>[s.id,s]))

    const rows = assigns.map(a => {
      const emp  = empMap[a.employee_id]   || {}
      const site = siteMap[a.site_master_id] || {}
      const proj = projMap[a.project_id] || projMap[site.project_id] || {}
      return {
        ...a,
        emp,
        site,
        proj,
        alreadyClaimed: claimedSet.has(a.employee_id),
        dailyRate:      emp.fa_amount || 50,
      }
    }).sort((a,b) => (a.emp?.full_name_en||'').localeCompare(b.emp?.full_name_en||''))

    setRoster(rows)
    // Pre-select all unclaimed employees
    const unclaimedIds = new Set(rows.filter(r => !r.alreadyClaimed).map(r => r.employee_id))
    setSelected(unclaimedIds)
    setRosterLoading(false)
  }, [entityId, faDate, employees, projects, sites])

  useEffect(() => { if (open && wizardStep === 1 && useMode === 'bulk') loadRoster() }, [open, wizardStep, faDate, useMode])

  function resetForm() {
    setFaDate(new Date().toISOString().split('T')[0])
    setRoster([]); setSelected(new Set())
    setSingleEmpId(''); setSingleDeptId(''); setSingleDeptNm('')
    setProjNum(''); setProjName(''); setJobNum(''); setLocation('')
    setDailyRate('50'); setDaysCount(''); setFaMonth(thisMonth)
    setUseMode('bulk'); setWizardStep(0)
  }

  // ── Bulk save ─────────────────────────────────────────────────────────────
  async function saveBulk() {
    const toSubmit = roster.filter(r => selected.has(r.employee_id) && !r.alreadyClaimed)
    if (!toSubmit.length) { alert('No employees selected.'); return }
    setSaving(true)
    const month = faDate.slice(0,7)
    const inserts = toSubmit.map(row => ({
      entity_id:         entityId,
      request_number:    `FA-${Date.now().toString().slice(-6)}-${row.employee_id.slice(-4)}`,
      request_date:      faDate,
      allowance_date:    faDate,
      allowance_month:   month,
      employee_id:       row.employee_id,
      site_assignment_id: row.id,
      department_id:     row.department_id || null,
      project_number:    row.proj?.project_number || null,
      project_name:      row.proj?.project_name  || null,
      job_number:        row.site?.job_no || null,
      location:          row.site?.site_name || null,
      days_count:        1,
      daily_rate:        row.dailyRate,
      total_amount:      row.dailyRate,
      status:            'APPROVED',
    }))
    const { error } = await supabase.from('food_allowances').insert(inserts)
    setSaving(false)
    if (error) { alert(error.message); return }
    setOpen(false); resetForm(); load()
  }

  // ── Single save ───────────────────────────────────────────────────────────
  async function saveSingle() {
    if (!singleEmpId) { alert('Please select an employee.'); return }
    // Per-day hard block
    const { count } = await supabase.from('food_allowances')
      .select('id', { count:'exact', head:true })
      .eq('entity_id', entityId)
      .eq('employee_id', singleEmpId)
      .eq('allowance_date', faDate)
    if (count > 0) { alert(`This employee has already claimed Food Allowance for ${faDate}. Once-per-day rule — no override allowed.`); return }
    setSaving(true)
    const { error } = await supabase.from('food_allowances').insert({
      entity_id:       entityId,
      request_number:  `FA-${Date.now().toString().slice(-6)}`,
      request_date:    faDate,
      allowance_date:  faDate,
      allowance_month: faMonth,
      employee_id:     singleEmpId,
      department_id:   singleDeptId || null,
      department_name: singleDeptNm || null,
      project_number:  projNum  || null,
      project_name:    projName || null,
      job_number:      jobNum   || null,
      location:        location || null,
      days_count:      parseInt(daysCount)||1,
      daily_rate:      parseFloat(dailyRate)||50,
      total_amount:    (parseInt(daysCount)||1) * (parseFloat(dailyRate)||50),
      status:          'APPROVED',
    })
    setSaving(false)
    if (error) { alert(error.message); return }
    setOpen(false); resetForm(); load()
  }

  async function voidRecord(id) {
    if (!window.confirm('Mark this FA record as REJECTED?')) return
    await supabase.from('food_allowances').update({ status:'REJECTED' }).eq('id', id)
    load()
  }

  function doExport() {
    const flat = filtered.map(r => ({
      ...r,
      employee_name:   r.emp?.full_name_en    || '',
      employee_number: r.emp?.employee_number || '',
    }))
    exportToExcel(flat, [
      { key:'request_number',  label:'Req #' },
      { key:'allowance_date',  label:'Date',      format:'date'     },
      { key:'employee_name',   label:'Employee' },
      { key:'employee_number', label:'Emp #' },
      { key:'deptCode',        label:'Department' },
      { key:'project_name',    label:'Project' },
      { key:'job_number',      label:'Job #' },
      { key:'location',        label:'Location' },
      { key:'allowance_month', label:'Month' },
      { key:'days_count',      label:'Days' },
      { key:'daily_rate',      label:'Daily Rate (SAR)', format:'currency' },
      { key:'total_amount',    label:'Total (SAR)',       format:'currency' },
      { key:'status',          label:'Status' },
    ], `FoodAllowance_${filterMon}`, 'Food Allowance')
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = records.filter(r => {
    const name = (r.emp?.full_name_en||'').toLowerCase()
    const matchS = !search || name.includes(search.toLowerCase()) || (r.request_number||'').toLowerCase().includes(search.toLowerCase())
    const matchD = !filterDept || r.deptCode === filterDept
    const matchSt = filterStatus==='ALL' || r.status===filterStatus
    return matchS && matchD && matchSt
  })

  const kpis = [
    { label:'Total Records',  value:filtered.length,                                                                                    icon:'🍽️' },
    { label:'Total Amount',   value:SAR(filtered.reduce((s,r)=>s+(r.total_amount||0),0)),                                               icon:'💰' },
    { label:'Approved',       value:SAR(filtered.filter(r=>r.status==='APPROVED').reduce((s,r)=>s+(r.total_amount||0),0)),              icon:'✅' },
    { label:'Pending/Other',  value:SAR(filtered.filter(r=>r.status!=='APPROVED').reduce((s,r)=>s+(r.total_amount||0),0)),              icon:'⏳' },
  ]

  const inp2 = { padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', fontFamily:'inherit', background:'#fff' }

  return (
    <>
      {/* ── Step 0 banner ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); setWizardStep(0); setOpen(true) }}
        chapterName="HR"
        formTitle={['Food', 'Allowance', 'Request']}
        heading="Submit food allowance for field employees — once per day per employee."
        iconLabel="🍽️"
        workflowSteps={['Select Date & Mode', 'Employee Roster', 'Confirm & Submit']}
      />

      {/* ── Chapter page wrapper ── */}
      <ChapterPage
        chapterName="HR"
        chapterIcon="🍽️"
        chapterColor={MC}
        chapterSubtitle="Field food allowance — once per day per employee, auto-populated from site assignments"
        sectionTitle="Food Allowance Register"
        onNew={() => setShowBanner(true)}
        newLabel="+ New FA Request"
        kpis={kpis}
      >
        {/* ── Filter bar ── */}
        <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
          <input type="month" value={filterMon} onChange={e=>setFilterMon(e.target.value)} style={inp2} />
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={inp2}>
            <option value="ALL">All Status</option>
            {['APPROVED','SUBMITTED','PENDING','REJECTED'].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterDept} onChange={e=>setFilterDept(e.target.value)} style={inp2}>
            <option value="">All Depts</option>
            {[...new Set(records.map(r=>r.deptCode).filter(Boolean))].sort().map(d=>(
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <input placeholder="🔍 Search employee / req #" value={search} onChange={e=>setSearch(e.target.value)}
            style={{ ...inp2, minWidth:200, flex:1 }} />
          {(filterMon!==thisMonth||filterStatus!=='ALL'||filterDept||search) && (
            <button onClick={()=>{ setFilterMon(thisMonth); setFilterStatus('ALL'); setFilterDept(''); setSearch('') }}
              style={{ ...inp2, background:'#ffebee', color:'#c62828', border:'1px solid #ffcdd2', cursor:'pointer', fontWeight:700 }}>✕ Clear</button>
          )}
          <button onClick={doExport}
            style={{ background:'#2e7d32', color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', cursor:'pointer', fontSize:12, fontWeight:700, whiteSpace:'nowrap' }}>📥 Export Excel</button>
          <span style={{ fontSize:12, color:'#6b7c93' }}>{filtered.length} record{filtered.length!==1?'s':''}</span>
        </div>

        {/* ── Table ── */}
        <div style={{ background:'#fff', borderRadius:12, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', overflow:'hidden', flex:1 }}>
          <div style={{ display:'grid', gridTemplateColumns:GRID, gap:0, background:MC, padding:'9px 12px' }}>
            {['Req #','Date','Employee','Dept','Location','Days','Rate','Total','Status'].map(h=>(
              <div key={h} style={{ fontSize:10, fontWeight:700, color:'#fff', letterSpacing:0.8, textTransform:'uppercase', padding:'0 4px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{h}</div>
            ))}
          </div>
          {loading
            ? <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>Loading…</div>
            : filtered.length===0
              ? <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No food allowance records for {filterMon}</div>
              : filtered.map((r,idx) => {
                  const sc = STATUS_COLORS[r.status] || { bg:'#f5f5f5', color:'#555' }
                  return (
                    <div key={r.id} style={{ display:'grid', gridTemplateColumns:GRID, gap:0, padding:'9px 12px', borderTop:'1px solid #f0f4f8', alignItems:'center' }}>
                      <div style={{ ...cell, fontWeight:700, color:MC, fontSize:11 }}>{r.request_number||'—'}</div>
                      <div style={{ ...cell, color:'#546e7a' }}>{r.allowance_date||'—'}</div>
                      <div style={{ ...cell, flexDirection:'column', alignItems:'flex-start', gap:0 }}>
                        <div style={{ fontWeight:600, fontSize:12 }}>{r.emp?.full_name_en||'—'}</div>
                        <div style={{ fontSize:10, color:'#aab2bd' }}>{r.emp?.employee_number||''}</div>
                      </div>
                      <div style={{ ...cell, fontSize:11, color:'#546e7a' }}>{r.deptCode||'—'}</div>
                      <div style={{ ...cell }}>{r.location||'—'}</div>
                      <div style={{ ...cell, justifyContent:'center' }}>{r.no_days||r.days_count||1}</div>
                      <div style={{ ...cell }}>SAR {(r.daily_rate||0).toFixed(0)}</div>
                      <div style={{ ...cell, fontWeight:700, color:'#1a237e' }}>SAR {(r.total_amount||0).toLocaleString()}</div>
                      <div style={cell}>
                        <span style={{ background:sc.bg, color:sc.color, borderRadius:5, padding:'2px 7px', fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>{r.status}</span>
                      </div>
                    </div>
                  )
                })
          }
          {filtered.length > 0 && (
            <div style={{ display:'flex', justifyContent:'flex-end', padding:'10px 14px', borderTop:`2px solid ${L1}`, background:L2 }}>
              <span style={{ fontSize:13, fontWeight:800, color:MC, fontFamily:PP }}>
                {filtered.length} records · {SAR(filtered.reduce((s,r)=>s+(r.total_amount||0),0))}
              </span>
            </div>
          )}
        </div>
      </ChapterPage>

      {/* ── New FA Wizard ── */}
      <FormShell
        isOpen={open}
        onClose={() => { setOpen(false); resetForm() }}
        chapterName="HR"
        title={['New', 'FA', 'Request']}
        steps={['Select Date', 'Employee Roster', 'Confirm & Submit']}
        currentStep={wizardStep}
        onBack={() => wizardStep === 0 ? (setOpen(false), resetForm()) : setWizardStep(s => s - 1)}
        backLabel={wizardStep === 0 ? 'Cancel' : '← Back'}
        onNext={() => {
          if (wizardStep === 0) {
            setWizardStep(1)
          } else if (wizardStep === 1) {
            if (useMode === 'bulk') {
              const toSubmit = roster.filter(r => selected.has(r.employee_id) && !r.alreadyClaimed)
              if (!toSubmit.length) { alert('No eligible employees selected.'); return }
            } else {
              if (!singleEmpId) { alert('Please select an employee.'); return }
            }
            setWizardStep(2)
          } else {
            useMode === 'bulk' ? saveBulk() : saveSingle()
          }
        }}
        nextLabel={wizardStep === 2 ? (saving ? 'Submitting…' : 'Submit FA Request') : 'Next →'}
        nextDisabled={saving}
      >
        {/* ── Step 0: Select Date & Mode ── */}
        {wizardStep === 0 && (
          <div>
            <div style={S.sec}>Date & Submission Mode</div>
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>FA Date *</label>
                <input type="date" style={S.inp} value={faDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={e => setFaDate(e.target.value)}
                />
              </div>
              <div style={S.col}>
                <label style={S.label}>Allowance Month</label>
                <input type="month" style={S.inp} value={faMonth} onChange={e=>setFaMonth(e.target.value)} />
              </div>
            </div>
            <div style={S.sec}>Submission Mode</div>
            <div style={{ display:'flex', gap:10 }}>
              {[['bulk','📋 Bulk Roster','Load all site assignments for the date and submit for unclaimed employees'],
                ['single','👤 Single Employee','Submit for one employee manually']].map(([mode,label,desc])=>(
                <div key={mode} onClick={() => setUseMode(mode)} style={{
                  flex:1, border:`2px solid ${useMode===mode?MC:L1}`, borderRadius:10, padding:'12px',
                  cursor:'pointer', background: useMode===mode ? L2 : '#fff',
                  transition:'all 0.15s',
                }}>
                  <div style={{ fontWeight:700, color: useMode===mode ? MC : '#546e7a', fontSize:13, marginBottom:4, fontFamily:PP }}>{label}</div>
                  <div style={{ fontSize:11, color:'#6b7c93', fontFamily:PP }}>{desc}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:12, background:'#fff8e1', border:'1px solid #ffe082', borderRadius:6, padding:'8px 12px', fontSize:11, color:'#bf360c', fontFamily:PP }}>
              🔒 Once-per-day rule: FA can only be claimed once per employee per day. Already-claimed employees are blocked automatically.
            </div>
          </div>
        )}

        {/* ── Step 1: Bulk Roster or Single Employee ── */}
        {wizardStep === 1 && useMode === 'bulk' && (
          <div>
            <div style={S.sec}>Site Assignment Roster for {faDate}</div>
            {rosterLoading ? (
              <div style={{ textAlign:'center', padding:32, color:MC, fontFamily:PP }}>Loading roster…</div>
            ) : roster.length === 0 ? (
              <div style={{ background:'#fff3e0', border:'1px solid #ffcc80', borderRadius:8, padding:'16px', marginBottom:12 }}>
                <div style={{ fontWeight:700, color:'#e65100', fontFamily:PP }}>⚠ No Site Assignments Found</div>
                <div style={{ fontSize:12, color:'#bf360c', fontFamily:PP, marginTop:4 }}>
                  No active site assignments for {faDate}. Switch to Single Employee mode to add manually.
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize:12, color:'#6b7c93', marginBottom:8, fontFamily:PP }}>
                  {roster.length} assigned · {roster.filter(r=>!r.alreadyClaimed).length} unclaimed · {roster.filter(r=>r.alreadyClaimed).length} already claimed
                </div>
                <div style={{ maxHeight:360, overflowY:'auto', border:`1px solid ${L1}`, borderRadius:8 }}>
                  {/* Header */}
                  <div style={{ display:'grid', gridTemplateColumns:'28px 1fr 90px 90px 70px 80px', gap:0, background:MC, padding:'7px 10px' }}>
                    {['','Employee','Project','Site/Job','Rate','Status'].map(h=>(
                      <div key={h} style={{ fontSize:10, color:'#fff', fontWeight:700, letterSpacing:0.5, textTransform:'uppercase', padding:'0 4px', whiteSpace:'nowrap', overflow:'hidden' }}>{h}</div>
                    ))}
                  </div>
                  {roster.map((row, idx) => {
                    const claimed  = row.alreadyClaimed
                    const checked  = selected.has(row.employee_id) && !claimed
                    return (
                      <div key={row.id} style={{
                        display:'grid', gridTemplateColumns:'28px 1fr 90px 90px 70px 80px', gap:0,
                        padding:'8px 10px', borderTop: idx>0 ? '1px solid #f0f4f8' : 'none',
                        background: claimed ? '#fff8e1' : checked ? L2 : '#fff',
                        alignItems:'center', opacity: claimed ? 0.7 : 1,
                      }}>
                        <div>
                          {!claimed && (
                            <input type="checkbox" checked={checked} onChange={e => {
                              const s = new Set(selected)
                              e.target.checked ? s.add(row.employee_id) : s.delete(row.employee_id)
                              setSelected(s)
                            }} style={{ cursor:'pointer' }} />
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize:12, fontWeight:600, fontFamily:PP }}>{row.emp?.full_name_en||'—'}</div>
                          <div style={{ fontSize:10, color:'#aab2bd', fontFamily:PP }}>{row.emp?.employee_number||''}</div>
                        </div>
                        <div style={{ fontSize:11, color:'#546e7a', padding:'0 4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.proj?.project_number||'—'}</div>
                        <div style={{ fontSize:11, color:'#546e7a', padding:'0 4px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.site?.job_no||row.site?.site_name||'—'}</div>
                        <div style={{ fontSize:12, fontWeight:600, color:MC, padding:'0 4px' }}>SAR {(row.dailyRate||50).toFixed(0)}</div>
                        <div style={{ padding:'0 4px' }}>
                          {claimed
                            ? <span style={{ background:'#fff3e0', color:'#e65100', borderRadius:4, padding:'2px 6px', fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>✓ Claimed</span>
                            : <span style={{ background:'#e8f5e9', color:'#2e7d32', borderRadius:4, padding:'2px 6px', fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>Unclaimed</span>
                          }
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10 }}>
                  <button onClick={() => {
                    const s = new Set(roster.filter(r=>!r.alreadyClaimed).map(r=>r.employee_id))
                    setSelected(s)
                  }} style={{ background:L2, color:MC, border:`1px solid ${L1}`, borderRadius:6, padding:'6px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                    Select All Unclaimed
                  </button>
                  <span style={{ fontSize:12, color:MC, fontWeight:700, fontFamily:PP }}>
                    {[...selected].filter(id => !roster.find(r=>r.employee_id===id)?.alreadyClaimed).length} selected · SAR {
                      roster.filter(r => selected.has(r.employee_id) && !r.alreadyClaimed).reduce((s,r)=>s+(r.dailyRate||50),0).toFixed(0)
                    }
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {wizardStep === 1 && useMode === 'single' && (
          <div>
            <div style={S.sec}>Employee</div>
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>Department</label>
                <select style={S.inp} value={singleDeptId} onChange={e => {
                  setSingleDeptId(e.target.value)
                  setSingleDeptNm(depts.find(d=>d.id===e.target.value)?.dept_name||'')
                  setSingleEmpId('')
                }}>
                  <option value="">— All —</option>
                  {depts.map(d=><option key={d.id} value={d.id}>{d.dept_code||'—'}</option>)}
                </select>
              </div>
              <div style={S.col}>
                <label style={S.label}>Employee *</label>
                <select style={S.inp} value={singleEmpId} onChange={e => {
                  setSingleEmpId(e.target.value)
                  const emp = employees.find(x=>x.id===e.target.value)
                  if (emp?.fa_amount) setDailyRate(String(emp.fa_amount))
                }}>
                  <option value="">— Select Employee —</option>
                  {employees
                    .filter(e => !singleDeptId || e.department_id === singleDeptId)
                    .map(e=><option key={e.id} value={e.id}>{e.full_name_en}{e.employee_number?' · '+e.employee_number:''}</option>)}
                </select>
              </div>
            </div>
            <div style={S.sec}>Project / Job Details</div>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Project #</label><input style={S.inp} value={projNum} onChange={e=>setProjNum(e.target.value)} /></div>
              <div style={S.col}><label style={S.label}>Project Name</label><input style={S.inp} value={projName} onChange={e=>setProjName(e.target.value)} /></div>
            </div>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Job #</label><input style={S.inp} value={jobNum} onChange={e=>setJobNum(e.target.value)} /></div>
              <div style={S.col}><label style={S.label}>Location / Site</label><input style={S.inp} value={location} onChange={e=>setLocation(e.target.value)} /></div>
            </div>
            <div style={S.sec}>Calculation</div>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Days</label><input type="number" min={1} max={31} style={S.inp} value={daysCount} onChange={e=>setDaysCount(e.target.value)} /></div>
              <div style={S.col}><label style={S.label}>Daily Rate (SAR)</label><input type="number" step="0.01" style={S.inp} value={dailyRate} onChange={e=>setDailyRate(e.target.value)} /></div>
            </div>
          </div>
        )}

        {/* ── Step 2: Confirm & Submit ── */}
        {wizardStep === 2 && useMode === 'bulk' && (
          <div>
            <div style={S.sec}>Bulk Submission Summary for {faDate}</div>
            <div style={{ background:L2, border:`1px solid ${L1}`, borderRadius:8, padding:'14px 16px', marginBottom:12 }}>
              {(() => {
                const toSubmit = roster.filter(r => selected.has(r.employee_id) && !r.alreadyClaimed)
                const total = toSubmit.reduce((s,r)=>s+(r.dailyRate||50),0)
                return (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:12 }}>
                      {[
                        ['Date', faDate],
                        ['Employees', toSubmit.length],
                        ['Total Amount', SAR(total)],
                      ].map(([k,v])=>(
                        <div key={k}>
                          <div style={{ fontSize:10, color:'#6b7c93', fontWeight:700, marginBottom:2, textTransform:'uppercase', fontFamily:PP }}>{k}</div>
                          <div style={{ fontWeight:700, color:MC, fontSize:14, fontFamily:PP }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize:12, fontWeight:600, color:'#546e7a', fontFamily:PP, marginBottom:6 }}>Employees to submit:</div>
                    {toSubmit.map(r => (
                      <div key={r.employee_id} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'3px 0', borderBottom:`1px solid ${L1}`, fontFamily:PP }}>
                        <span>{r.emp?.full_name_en||'—'}</span>
                        <span style={{ color:MC, fontWeight:600 }}>SAR {(r.dailyRate||50).toFixed(0)}</span>
                      </div>
                    ))}
                  </>
                )
              })()}
            </div>
          </div>
        )}

        {wizardStep === 2 && useMode === 'single' && (
          <div>
            <div style={S.sec}>Review & Submit</div>
            <div style={{ background:L2, border:`1px solid ${L1}`, borderRadius:4, padding:'12px 16px', marginBottom:16, display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 20px' }}>
              {[
                ['Employee', employees.find(e=>e.id===singleEmpId)?.full_name_en||'—'],
                ['FA Date', faDate],
                ['Project', projNum||'—'],
                ['Job #', jobNum||'—'],
                ['Location', location||'—'],
                ['Days × Rate', `${daysCount||1} × SAR ${dailyRate}`],
                ['Total', SAR((parseInt(daysCount)||1)*(parseFloat(dailyRate)||50))],
              ].map(([k,v])=>(
                <div key={k}>
                  <div style={{ fontSize:9, color:'#6b7c93', fontWeight:700, fontFamily:PP, textTransform:'uppercase' }}>{k}</div>
                  <div style={{ fontWeight:600, color:'#1a2e3d', fontSize:12, fontFamily:PP }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </FormShell>
    </>
  )
}
