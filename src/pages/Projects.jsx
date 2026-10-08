import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.Masters       // Masters chapter (Ch02)
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useExpandable, ExpandableRow, DetailField, DetailRow, DetailSection, DetailActions } from '../components/ExpandableRow'
import { printDocument, openPrintWindow } from '../lib/templatePrint'

// ─── Theme ──────────────────────────────────────────────────────
const T = {
  canvas:'#ffffff', ink:'#222222', muted:'#6a6a6a',
  hairline:'#dddddd', surface:'#f7f7f7', primary:'#ff385c',
  cf:'#fff8e1',        // carry-forward row bg
  cfBorder:'#f9a825',  // carry-forward accent
  font:"'Inter',-apple-system,system-ui,sans-serif",
}
const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modal:   { background:T.canvas, borderRadius:16, padding:28, width:720, maxWidth:'100%', maxHeight:'93vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.18)', fontFamily:T.font },
  inp:     { width:'100%', padding:'11px 13px', borderRadius:8, border:`1px solid ${T.hairline}`, fontSize:13, color:T.ink, background:T.canvas, outline:'none', fontFamily:T.font, boxSizing:'border-box' },
  inpRO:   { width:'100%', padding:'11px 13px', borderRadius:8, border:`1px solid ${T.hairline}`, fontSize:13, color:T.muted, background:T.surface, outline:'none', fontFamily:T.font, boxSizing:'border-box', cursor:'not-allowed' },
  label:   { display:'block', fontSize:11, fontWeight:700, color:T.muted, marginBottom:5, letterSpacing:'0.05em', textTransform:'uppercase' },
  req:     { color:T.primary, marginLeft:2 },
  row:     { display:'flex', gap:12, marginBottom:14, flexWrap:'wrap' },
  col:     { flex:1, minWidth:130 },
  sec:     { fontSize:11, fontWeight:700, color:T.ink, marginBottom:10, marginTop:4, paddingBottom:7, borderBottom:`1px solid ${T.hairline}`, letterSpacing:'0.08em', textTransform:'uppercase' },
  tag:     (bg, color) => ({ background:bg, color, borderRadius:20, padding:'3px 9px', fontSize:11, fontWeight:700, display:'inline-block', whiteSpace:'nowrap' }),
}

// ─── Status options ──────────────────────────────────────────────
const STATUS_OPTS = [
  { value:'OPEN',        label:'Open',         bg:'#f7f7f7', color:'#222222' },
  { value:'ACTIVE',      label:'Active',       bg:'#e8f5e9', color:'#2e7d32' },
  { value:'ON_HOLD',     label:'On Hold',      bg:'#fff8e1', color:'#f57f17' },
  { value:'COMPLETED',   label:'Completed',    bg:'#e3f2fd', color:'#0277bd' },
  { value:'CLOSED',      label:'Closed',       bg:'#ede7f6', color:'#4527a0' },
  { value:'ROLLED_OVER', label:'Rolled Over',  bg:'#fce4ec', color:'#880e4f' },
  { value:'INACTIVE',    label:'Inactive',     bg:'#f5f5f5', color:'#757575' },
  { value:'CANCELLED',   label:'Cancelled',    bg:'#ffebee', color:'#c62828' },
]
const statusMeta = s => STATUS_OPTS.find(o => o.value === s) || { bg:'#f7f7f7', color:'#555', label: s }

const PROJECT_TYPES = ['INSTALLATION','COMMISSIONING','NETWORK','INFRASTRUCTURE','IT SERVICES','MAINTENANCE','SURVEY','CONSULTING','OTHER']

function fmtDate(d) {
  if (!d) return '—'
  const [y,m,day] = d.split('-')
  return `${day}/${m}/${y}`
}
function fmtSAR(v) {
  const n = parseFloat(v) || 0
  if (n >= 1_000_000) return `${(n/1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `${(n/1_000).toFixed(0)}K`
  return n.toLocaleString()
}

// ── Mini value progress bar ──────────────────────────────────────
function ValueBar({ contractValue, cfValue, invoiced }) {
  const total   = (parseFloat(cfValue)||0) + (parseFloat(contractValue)||0)
  const inv     = parseFloat(invoiced) || 0
  const remain  = Math.max(0, total - inv)
  if (total <= 0) return <span style={{ color:T.muted, fontSize:12 }}>—</span>
  const pct = Math.min(100, Math.round((inv / total) * 100))
  return (
    <div style={{ minWidth:110 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:T.muted, marginBottom:2 }}>
        <span>Inv: {fmtSAR(inv)}</span>
        <span style={{ color:'#2e7d32', fontWeight:700 }}>Rem: {fmtSAR(remain)}</span>
      </div>
      <div style={{ height:5, background:'#e0e0e0', borderRadius:3, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background: pct >= 90 ? '#c62828' : '#1565c0', borderRadius:3, transition:'width 0.3s' }} />
      </div>
      <div style={{ fontSize:10, color:T.muted, marginTop:1 }}>
        Total: SAR {fmtSAR(total)} · {pct}% billed
      </div>
    </div>
  )
}

// ── Carry-forward chain badge ────────────────────────────────────
function ChainBadge({ project }) {
  if (!project.is_carry_forward && !project.next_project_id) return null
  return (
    <div style={{ display:'flex', alignItems:'center', gap:3, marginTop:3 }}>
      {project.parent?.project_number && (
        <span style={{ fontSize:9, color:'#f57f17', fontWeight:700 }}>
          {project.parent.project_number} →
        </span>
      )}
      <span style={{ fontSize:9, background:'#fff3e0', color:'#e65100', borderRadius:4, padding:'1px 5px', fontWeight:700 }}>
        🔄 CF-{project.carry_forward_count||1}
      </span>
      {project.child?.project_number && (
        <span style={{ fontSize:9, color:'#f57f17', fontWeight:700 }}>
          → {project.child.project_number}
        </span>
      )}
    </div>
  )
}

export default function Projects({ entityId, role }) {
  const isAdmin = ['SUPERADMIN','ADMIN'].includes(role)

  const [projects,     setProjects]     = useState([])
  const [employees,    setEmployees]    = useState([])
  const [depts,        setDepts]        = useState([])
  const [contractors,  setContractors]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const { toggle: toggleProj, isOpen: projOpen } = useExpandable()
  const [showBanner,   setShowBanner]   = useState(false)
  const [open,         setOpen]         = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [editing,      setEditing]      = useState(null)
  const [step,         setStep]         = useState(1)  // 1-3 wizard steps

  // ── Filters
  const [filterSt,   setFilterSt]   = useState('ALL')
  const [filterCF,   setFilterCF]   = useState('ALL')   // ALL | NEW | CF
  const [filterDept, setFilterDept] = useState('')      // department_id | ''

  // ── Rollover
  const [showRollover,  setShowRollover]  = useState(false)
  const [rollingOver,   setRollingOver]   = useState(false)
  const [rolloverResult,setRolloverResult]= useState(null)
  const [rolloverYear,  setRolloverYear]  = useState(new Date().getFullYear())

  // ── Form fields
  const [projNum,       setProjNum]       = useState('')
  const [projName,      setProjName]      = useState('')
  const [projType,      setProjType]      = useState('')
  const [contractorId,  setContractorId]  = useState('')
  const [deptId,        setDeptId]        = useState('')
  const [pmId,          setPmId]          = useState('')
  const [supId,         setSupId]         = useState('')
  const [pmName,        setPmName]        = useState('')
  const [supName,       setSupName]       = useState('')
  const [pmEmail,       setPmEmail]       = useState('')
  const [pmPhone,       setPmPhone]       = useState('')
  const [contPmName,    setContPmName]    = useState('')
  const [contPmPhone,   setContPmPhone]   = useState('')
  const [contPmEmail,   setContPmEmail]   = useState('')
  const [startDate,     setStartDate]     = useState('')
  const [endDate,       setEndDate]       = useState('')
  const [contract,      setContract]      = useState('')
  const [status,        setStatus]        = useState('OPEN')
  const [desc,          setDesc]          = useState('')

  useEffect(() => { load() }, [entityId])

  async function load() {
    if (!entityId) return
    setLoading(true)
    const [{ data: p }, { data: e }, { data: d }, { data: c }] = await Promise.all([
      supabase.from('projects').select(`
        *,
        pm_employee:pm_id(full_name_en,phone,email),
        sup_employee:supervisor_id(full_name_en,phone),
        dept:department_id(dept_name,dept_code),
        contractor:contractor_id(contractor_name,contractor_code),
        parent:parent_project_id(project_number),
        child:next_project_id(project_number)
      `).eq('entity_id', entityId).order('created_at', { ascending:false }),
      supabase.from('employees').select('id,full_name_en,designation,job_title,phone,email').eq('entity_id', entityId).eq('is_active', true).order('full_name_en'),
      supabase.from('departments').select('id,dept_name,dept_code,dept_head_id').eq('entity_id', entityId).eq('is_active', true).order('dept_name'),
      supabase.from('contractors').select('id,contractor_name,contractor_code').eq('entity_id', entityId).eq('vendor_type','CONTRACTOR').eq('status','ACTIVE').order('contractor_name'),
    ])
    setProjects(p||[]); setEmployees(e||[]); setDepts(d||[]); setContractors(c||[])
    setLoading(false)
  }

  // ── Project number generation: P-YY0## (D=0 = new project)
  async function genProjNum() {
    const yr = new Date().getFullYear().toString().slice(-2)
    const { count } = await supabase.from('projects').select('id', { count:'exact', head:true })
      .eq('entity_id', entityId)
      .like('project_number', `P-${yr}0%`)   // D=0 = new projects only
    const seq = String((count||0)+1).padStart(2,'0')
    return `P-${yr}0${seq}`
  }

  function onPmChange(id) {
    setPmId(id)
    const emp = employees.find(e => e.id === id)
    if (emp) { setPmName(emp.full_name_en); setPmEmail(emp.email||''); setPmPhone(emp.phone||'') }
    else      { setPmName(''); setPmEmail(''); setPmPhone('') }
  }
  function onSupChange(id) {
    setSupId(id)
    const emp = employees.find(e => e.id === id)
    setSupName(emp ? emp.full_name_en : '')
  }

  function resetForm() {
    setProjNum(''); setProjName(''); setProjType(''); setContractorId(''); setDeptId('')
    setPmId(''); setSupId(''); setPmName(''); setSupName(''); setPmEmail(''); setPmPhone('')
    setContPmName(''); setContPmPhone(''); setContPmEmail('')
    setStartDate(''); setEndDate(''); setContract(''); setStatus('OPEN'); setDesc('')
    setStep(1)
  }

  async function openNew() {
    resetForm(); setEditing(null)
    const num = await genProjNum()
    setProjNum(num)
    setShowBanner(true)
  }

  function openEdit(p) {
    setEditing(p)
    setProjNum(p.project_number||''); setProjName(p.project_name||''); setProjType(p.project_type||'')
    setContractorId(p.contractor_id||''); setDeptId(p.department_id||'')
    setPmId(p.pm_id||''); setSupId(p.supervisor_id||'')
    setPmName(p.pm_employee?.full_name_en||''); setSupName(p.supervisor_name||'')
    setPmEmail(p.pm_email||''); setPmPhone(p.pm_phone||'')
    setContPmName(p.contractor_pm_name||''); setContPmPhone(p.contractor_pm_phone||''); setContPmEmail(p.contractor_pm_email||'')
    setStartDate(p.start_date||''); setEndDate(p.end_date||'')
    setContract(p.contract_value||''); setStatus(p.status||'OPEN'); setDesc(p.description||'')
    setStep(1); setOpen(true)
  }

  async function save() {
    if (!projName)    { alert('Project Name is required'); return }
    if (!contPmName)  { alert("Contractor's PM Name is required"); return }
    if (!contPmPhone) { alert("Contractor's PM Mobile # is required"); return }
    if (!contPmEmail) { alert("Contractor's PM Email is required"); return }
    const val = parseFloat(contract) || 0
    // Open PIN window NOW — synchronously before any await — avoids popup blocker
    const preWin = !editing ? openPrintWindow() : null
    setSaving(true)

    // Extract seq + year from project number for new projects
    const isNewProjNum = projNum && /^P-\d{5}$/.test(projNum)
    const projYear = isNewProjNum ? parseInt(projNum.substring(2,4)) : null
    const projSeq  = isNewProjNum ? parseInt(projNum.substring(5,7)) : null

    const payload = {
      entity_id:            entityId,
      project_number:       projNum||null,
      project_name:         projName,
      project_type:         projType||null,
      contractor_id:        contractorId||null,
      client_name:          contractors.find(c=>c.id===contractorId)?.contractor_name||null,
      department_id:        deptId||null,
      pm_id:                pmId||null,
      supervisor_id:        supId||null,

      supervisor_name:      supName||null,
      pm_email:             pmEmail||null,
      pm_phone:             pmPhone||null,
      contractor_pm_name:   contPmName,
      contractor_pm_phone:  contPmPhone,
      contractor_pm_email:  contPmEmail,
      start_date:           startDate||null,
      end_date:             endDate||null,
      contract_value:       val||null,
      status,
      description:          desc||null,
      // Carry-forward metadata (only set on new insert)
      ...(!editing ? {
        project_year:           projYear,
        project_seq:            projSeq,
        carry_forward_count:    0,
        is_carry_forward:       false,
        original_project_number: projNum||null,
      } : {}),
    }

    const { error } = editing
      ? await supabase.from('projects').update(payload).eq('id', editing.id)
      : await supabase.from('projects').insert(payload)
    setSaving(false)
    if (error) { alert(error.message); return }

    // ── Auto-generate Project Initiation Notice on NEW project only ───────────
    if (!editing) {
      try {
        const selDept       = depts.find(d => d.id === deptId)
        const deptHeadEmp   = selDept?.dept_head_id
                              ? employees.find(e => e.id === selDept.dept_head_id)
                              : null
        const selContractor = contractors.find(c => c.id === contractorId)
        const today         = new Date().toISOString().slice(0, 10)
        const [tYr, tMo, tDy] = today.split('-')
        const dateStr = `${tDy}${tMo}${tYr.slice(2)}`

        printDocument('project_initiation', {
          project_number:   projNum  || '',
          project_name_en:  projName || '',
          project_type:     projType || '',
          client_name_en:   selContractor?.contractor_name || '',
          contractor_po:    '',
          contractor_pm:    contPmName || '',
          contract_value:   parseFloat(contract) || 0,
          department:       selDept?.dept_code || selDept?.dept_name || '',
          dept_head_en:     deptHeadEmp?.full_name_en || '',
          pm_name:          pmName || '',
          generated_date:   today,
        }, {
          driveFolder:   'project-initiations',
          driveFileName: `PIN-${projNum || 'NEW'}-${dateStr}.pdf`,
          autoRun:       true,
          orientation:   'portrait',
          requestDate:   today,
          _preWin:       preWin,
        })
      } catch (_) { /* non-critical */ }
    }

    setOpen(false); resetForm(); load()
  }

  // ── Manual rollover ──────────────────────────────────────────
  async function runRollover() {
    setRollingOver(true); setRolloverResult(null)
    const { data, error } = await supabase.rpc('rollover_projects', { target_year: rolloverYear })
    setRollingOver(false)
    if (error) { alert('Rollover failed: ' + error.message); return }
    setRolloverResult(data || [])
    load()
  }

  // ── Filtered list ──────────────────────────────────────────────
  const eligible = projects.filter(p => {
    if (filterSt !== 'ALL' && p.status !== filterSt) return false
    if (filterCF === 'NEW' && p.is_carry_forward)      return false
    if (filterCF === 'CF'  && !p.is_carry_forward)     return false
    if (filterDept && p.department_id !== filterDept)  return false
    return true
  })

  // Summary numbers — computed from visible (eligible) rows so cards reflect filters
  const totalActive    = eligible.filter(p => ['ACTIVE','OPEN'].includes(p.status)).length
  const totalCF        = eligible.filter(p => p.is_carry_forward && p.status === 'ACTIVE').length
  const totalValue     = eligible.reduce((s,p) => s + (parseFloat(p.contract_value)||0) + (parseFloat(p.carry_forward_value)||0), 0)
  const totalRemaining = eligible.filter(p => ['ACTIVE','OPEN'].includes(p.status))
    .reduce((s,p) => {
      const t = (parseFloat(p.carry_forward_value)||0) + (parseFloat(p.contract_value)||0)
      return s + Math.max(0, t - (parseFloat(p.invoiced_amount)||0))
    }, 0)
  const rolloverEligible = projects.filter(p =>
    p.status === 'ACTIVE' && p.project_year && p.project_year < new Date().getFullYear() && !p.next_project_id
  ).length

  return (
    <div style={{ fontFamily:T.font }}>

      {/* ── STICKY: Toolbar + Stats ───────────────────────── */}
      <div style={{ position:'sticky', top:0, zIndex:20, background:'#f4f7fb', boxShadow:'0 2px 6px rgba(0,0,0,0.06)', paddingBottom:8, marginBottom:4 }}>

      {/* ── Row 1: KPIs + Button ──────────────────────────── */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', padding:'10px 0 6px', scrollbarWidth:'none', alignItems:'stretch' }}>
        {[
          { label:'Active',    value:totalActive,                     color:'#1b5e20', grad:'linear-gradient(135deg,#43a047 0%,#2e7d32 100%)', icon:'📂' },
          { label:'Carry-fwd', value:totalCF,                         color:'#bf360c', grad:'linear-gradient(135deg,#ff7043 0%,#e64a19 100%)', icon:'🔄' },
          { label:'Portfolio', value:`SAR ${fmtSAR(totalValue)}`,     color:'#0d47a1', grad:'linear-gradient(135deg,#42a5f5 0%,#1565c0 100%)', icon:'💼' },
          { label:'Remaining', value:`SAR ${fmtSAR(totalRemaining)}`, color:'#4a148c', grad:'linear-gradient(135deg,#ab47bc 0%,#7b1fa2 100%)', icon:'💰' },
        ].map(({ label, value, color, grad, icon }) => (
          <div key={label} style={{ background:grad, borderRadius:10, padding:'10px 16px', flexShrink:0, minWidth:110, boxShadow:'0 3px 10px rgba(0,0,0,0.15)', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', right:8, top:6, fontSize:18, opacity:0.25 }}>{icon}</div>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.85)', fontWeight:700, whiteSpace:'nowrap', textTransform:'uppercase', letterSpacing:0.8 }}>{label}</div>
            <div style={{ fontSize:20, fontWeight:900, color:'#fff', lineHeight:1.2, marginTop:2 }}>{value}</div>
          </div>
        ))}
        <button onClick={openNew} style={{ marginLeft:'auto', background:'#8C601B', color:'#fff', border:'none', borderRadius:10, padding:'10px 0', cursor:'pointer', fontSize:13, fontWeight:700, whiteSpace:'nowrap', flexShrink:0, minWidth:160, textAlign:'center', boxShadow:'0 3px 8px rgba(140,96,27,0.35)' }}>
          Add New Project
        </button>
      </div>

      {/* ── Row 3: Filters ───────────────────────────────────── */}
      <div style={{ display:'flex', gap:8, paddingBottom:8, alignItems:'center', flexWrap:'wrap' }}>
        {/* Status filter */}
        <select value={filterSt} onChange={e=>setFilterSt(e.target.value)}
          style={{ padding:'9px 13px', borderRadius:8, border:`1px solid ${T.hairline}`, fontSize:12, color:T.ink, fontFamily:T.font, outline:'none', background:T.canvas, cursor:'pointer' }}>
          <option value="ALL">All Status</option>
          {STATUS_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* New vs Carry-forward filter */}
        <div style={{ display:'flex', border:`1px solid ${T.hairline}`, borderRadius:8, overflow:'hidden' }}>
          {[['ALL','All Projects'],['NEW','🆕 New'],['CF','🔄 Carry-forward']].map(([v,l])=>(
            <button key={v} onClick={()=>setFilterCF(v)} style={{
              padding:'8px 14px', border:'none', cursor:'pointer', fontSize:12, fontWeight:700,
              background: filterCF===v ? '#1a2e4a' : T.canvas,
              color:      filterCF===v ? '#fff'    : T.muted,
              fontFamily:T.font,
            }}>{l}</button>
          ))}
        </div>

        {/* Department filter */}
        <select value={filterDept} onChange={e=>setFilterDept(e.target.value)}
          style={{ padding:'9px 13px', borderRadius:8, border:`1px solid ${T.hairline}`, fontSize:12, color:T.ink, fontFamily:T.font, outline:'none', background:T.canvas, cursor:'pointer' }}>
          <option value="">All Departments</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.dept_code || d.dept_name}</option>)}
        </select>
        {filterDept && (
          <button onClick={()=>setFilterDept('')}
            style={{ background:'#fff8e1', color:'#e65100', border:'1px solid #ffe082', borderRadius:8, padding:'7px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
            ✕ Dept
          </button>
        )}

        {/* Rollover button — admin only */}
        {isAdmin && (
          <button onClick={()=>setShowRollover(true)}
            style={{ marginLeft:'auto', background: rolloverEligible>0 ? '#e65100' : '#bbb', color:'#fff', border:'none', borderRadius:8, padding:'9px 16px', cursor:'pointer', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}>
            🔄 Rollover {rolloverEligible>0 ? `(${rolloverEligible} eligible)` : ''}
          </button>
        )}

      </div>

            </div>{/* end sticky block */}

      {/* ── Table ────────────────────────────────────────────────── */}
      <div style={{ background:T.canvas, borderRadius:12, boxShadow:`0 1px 4px rgba(0,0,0,0.07)`, overflowY:'auto', maxHeight:'calc(100vh - 260px)' }}>
        {loading ? <div style={{ textAlign:'center', padding:48, color:T.muted }}>Loading…</div> : (
          <div>
            <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
              <thead style={{ position:'sticky', top:0, zIndex:10 }}>
                <tr style={{ background:T.surface }}>
                  {[['Proj #','110px'],['Project Name',''],['Contractor','200px'],['Dept','80px'],['Status','100px'],['','40px']].map(([h,w])=>(
                    <th key={h} style={{ padding:'9px 13px', textAlign:'left', fontSize:10, fontWeight:700, color:'#fff', letterSpacing:'0.05em', textTransform:'uppercase', whiteSpace:'nowrap', background:'#8C601B', borderBottom:`2px solid ${T.hairline}`, ...(w?{width:w}:{}) }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eligible.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign:'center', padding:48, color:T.muted }}>No projects match the current filters</td></tr>
                ) : eligible.map((p, i) => {
                  const sm  = statusMeta(p.status)
                  const isCF = p.is_carry_forward
                  const thTd = { padding:'7px 13px', textAlign:'left', fontSize:11, verticalAlign:'middle' }
                  return (
                    <ExpandableRow
                      key={p.id} id={p.id}
                      isOpen={projOpen(p.id)} onToggle={toggleProj}
                      colSpan={5} zebra={i%2!==0}
                      summary={<>
                        <td style={{ ...thTd, fontWeight:700, color:isCF?'#e65100':T.primary, whiteSpace:'nowrap' }}>
                          {p.project_number||'—'}<ChainBadge project={p} />
                        </td>
                        <td style={{ ...thTd, fontWeight:600, maxWidth:220, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {p.project_name}
                        </td>
                        <td style={{ ...thTd }}>{p.contractor?.contractor_name || p.client_name || '—'}</td>
                        <td style={{ ...thTd, color:T.muted }}>{p.dept?.dept_code || '—'}</td>
                        <td style={thTd}>
                          <span style={S.tag(sm.bg, sm.color)}>{sm.label || p.status}</span>
                          {p.next_project_id && <div style={{ fontSize:9, color:'#880e4f', fontWeight:700 }}>→ {p.child?.project_number}</div>}
                        </td>
                      </>}
                      detail={
                        <div style={{ padding:'14px 20px' }}>
                          <DetailRow>
                            <DetailField label="PM"           value={p.pm_employee?.full_name_en || p.project_manager || '—'} />
                            <DetailField label="Contractor PM" value={p.contractor_pm_name || '—'} />
                            <DetailField label="Start Date"   value={fmtDate(p.start_date)} />
                            <DetailField label="End Date"     value={fmtDate(p.end_date)} />
                          </DetailRow>
                          <DetailSection label="Contract Value / Progress">
                            {isCF && p.carry_forward_value > 0 && (
                              <div style={{ fontSize:11, color:'#e65100', fontWeight:700, marginBottom:6 }}>🔄 CF: SAR {fmtSAR(p.carry_forward_value)}</div>
                            )}
                            <ValueBar contractValue={p.contract_value} cfValue={p.carry_forward_value} invoiced={p.invoiced_amount} />
                          </DetailSection>
                          {p.description && <DetailSection label="Description"><div style={{ fontSize:12, color:'#455a64' }}>{p.description}</div></DetailSection>}
                          <DetailActions>
                            <button onClick={(e)=>{e.stopPropagation();openEdit(p)}}
                              style={{ background:'transparent', color:T.ink, border:`1px solid ${T.hairline}`, borderRadius:7, padding:'5px 14px', cursor:'pointer', fontSize:11, fontWeight:600 }}>
                              ✏️ Edit
                            </button>
                            <button onClick={(e)=>{
                              e.stopPropagation()
                              const selDept     = depts.find(d => d.id === p.department_id)
                              const deptHeadEmp = selDept?.dept_head_id ? employees.find(em => em.id === selDept.dept_head_id) : null
                              const today       = new Date().toISOString().slice(0,10)
                              printDocument('project_initiation', {
                                project_number:  p.project_number  || '',
                                project_name_en: p.project_name    || '',
                                project_type:    p.project_type    || '',
                                client_name_en:  p.client_name     || p.contractor?.contractor_name || '',
                                contractor_po:   '',
                                contractor_pm:   p.contractor_pm_name || '',
                                contract_value:  parseFloat(p.contract_value) || 0,
                                department:      selDept?.dept_code || p.dept?.dept_code || selDept?.dept_name || p.dept?.dept_name || '',
                                dept_head_en:    deptHeadEmp?.full_name_en || '',
                                pm_name:         p.pm_employee?.full_name_en || '',
                                generated_date:  p.start_date || today,
                              }, {
                                driveFolder:   'project-initiations',
                                driveFileName: `PIN-${p.project_number||'PRJ'}.pdf`,
                                autoRun:       false,
                                orientation:   'portrait',
                              })
                            }} style={{ background:'#1a3a6b', color:'#fff', border:'none', borderRadius:7, padding:'5px 14px', cursor:'pointer', fontSize:11, fontWeight:600 }}>
                              🖨️ Print PIN
                            </button>
                          </DetailActions>
                        </div>
                      }
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Rollover Dialog ──────────────────────────────────────── */}
      {showRollover && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&!rollingOver&&setShowRollover(false)}>
          <div style={{ ...S.modal, maxWidth:520 }}>
            <h3 style={{ margin:'0 0 6px', fontSize:18, fontWeight:800 }}>🔄 Project Year Rollover</h3>
            <p style={{ margin:'0 0 18px', fontSize:13, color:T.muted, lineHeight:1.5 }}>
              This will carry forward all <strong>ACTIVE</strong> projects whose year is before the target year,
              creating new project numbers and moving open POs with REV# incremented.
              Projects with zero remaining value will be marked <strong>Completed</strong>.
            </p>

            {/* Legend */}
            <div style={{ background:'#fff8e1', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#e65100' }}>
              <strong>Number logic:</strong> P-26001 → P-27<span style={{ background:'#ffcc02', borderRadius:3, padding:'0 2px' }}>9</span>01 → P-28<span style={{ background:'#ffcc02', borderRadius:3, padding:'0 2px' }}>8</span>01 → P-29<span style={{ background:'#ffcc02', borderRadius:3, padding:'0 2px' }}>7</span>01<br/>
              The highlighted digit decrements by 1 each carry-forward year.
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={S.label}>Target year (projects BEFORE this year will roll over)</label>
              <input type="number" style={{ ...S.inp, width:120 }}
                value={rolloverYear}
                onChange={e=>setRolloverYear(parseInt(e.target.value)||new Date().getFullYear())}
                min={new Date().getFullYear()} max={2099} />
            </div>

            {/* Eligible projects preview */}
            {rolloverEligible > 0 ? (
              <div style={{ background:'#e8f5e9', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#2e7d32' }}>
                ✅ {rolloverEligible} project{rolloverEligible!==1?'s':''} eligible for rollover to {rolloverYear}
              </div>
            ) : (
              <div style={{ background:'#f5f5f5', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:T.muted }}>
                No active projects found that need rollover to {rolloverYear}.
              </div>
            )}

            {/* Result */}
            {rolloverResult && (
              <div style={{ background:'#f3e5f5', borderRadius:8, padding:'12px 14px', marginBottom:16, fontSize:12 }}>
                <div style={{ fontWeight:700, color:'#6a1b9a', marginBottom:6 }}>✅ Rollover complete — {rolloverResult.length} project{rolloverResult.length!==1?'s':''} carried forward</div>
                {rolloverResult.map((r,i)=>(
                  <div key={i} style={{ display:'flex', gap:6, alignItems:'center', padding:'3px 0', borderBottom:'1px solid #e1bee7' }}>
                    <span style={{ fontWeight:700, color:'#880e4f' }}>{r.old_project_number}</span>
                    <span>→</span>
                    <span style={{ fontWeight:700, color:'#2e7d32' }}>{r.new_project_number}</span>
                    <span style={{ marginLeft:'auto', color:'#e65100' }}>SAR {fmtSAR(r.carry_value)}</span>
                    {r.pos_count>0 && <span style={{ fontSize:10, color:T.muted }}>{r.pos_count} PO{r.pos_count!==1?'s':''}</span>}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={()=>{setShowRollover(false);setRolloverResult(null)}} disabled={rollingOver}
                style={{ background:T.surface, color:T.ink, border:`1px solid ${T.hairline}`, borderRadius:8, padding:'10px 20px', cursor:'pointer', fontSize:13, fontWeight:600 }}>
                {rolloverResult ? 'Close' : 'Cancel'}
              </button>
              {!rolloverResult && (
                <button onClick={runRollover} disabled={rollingOver || rolloverEligible===0}
                  style={{ background:rollingOver||rolloverEligible===0?'#bbb':'#e65100', color:'#fff', border:'none', borderRadius:8, padding:'10px 24px', cursor:rollingOver||rolloverEligible===0?'not-allowed':'pointer', fontSize:13, fontWeight:700 }}>
                  {rollingOver ? '⏳ Rolling over…' : '🔄 Execute Rollover'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── PageBanner ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); setStep(1); setOpen(true) }}
        chapterL1="#C8B48F"
        chapterL2="#FAF5E9"
        moduleColor="#8C601B"
        chapterLabel="Masters"
        formTitle={['New', 'Project', 'Creation']}
        steps={['Project Info', 'Contractor', 'Our Team']}
        icon="📁"
        description="Create and manage project records. Tracks contract value, timeline and assigned team members."
      />

      {/* ── New / Edit Modal — 3-box wizard layout ── */}
      {open && (() => {
        const POPPINS = "'Poppins','Inter',sans-serif"
        const PRI = '#8C601B'   // Masters L3 accent
        const L1  = '#C8B48F'   // Masters outer frame
        const L2  = '#FAF5E9'   // Masters inner background
        const STEP_NAMES = ['','Project Info','Contractor','Our Team']
        const STEP_DESC  = ['','Project #, name, dates & contract value','Select contractor & PM details','Assign team & describe scope']
        const inp  = (ex={}) => ({ width:'100%', padding:'9px 14px', borderRadius:20, border:`1px solid ${PRI}44`, fontSize:13, color:'#172D37', background:'#fdfaf6', outline:'none', fontFamily:POPPINS, boxSizing:'border-box', ...ex })
        const sec  = { fontSize:9, fontWeight:800, color:PRI, letterSpacing:1.5, textTransform:'uppercase', marginBottom:8, marginTop:12, paddingBottom:4, borderBottom:`1.5px solid ${PRI}33` }
        const lbl  = { display:'block', fontSize:11, fontWeight:600, color:'#53666F', marginBottom:4 }
        const row  = { display:'flex', gap:12, marginBottom:12, flexWrap:'wrap' }
        const col  = { flex:1, minWidth:120 }
        return (
          <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&(setOpen(false),resetForm())}>
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap');`}</style>
            <div style={{ width:860, maxWidth:'calc(100vw - 24px)', borderRadius:18, overflow:'hidden', boxShadow:'0 28px 64px rgba(0,0,0,0.32)', fontFamily:POPPINS, background:L1, padding:8 }}>

              {/* ── STEPS 1–3 — 6-layer layout ── */}
              {step>=1 && (
                <div style={{ background:L2, borderRadius:12, display:'flex', minHeight:560, position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', top:0, right:0, width:'55%', height:'36%', background:PRI, borderRadius:'0 12px 0 90px', zIndex:1 }} />

                    {/* Sidebar */}
                    <div style={{ width:210, flexShrink:0, padding:'20px 16px 16px', display:'flex', flexDirection:'column', fontFamily:POPPINS, position:'relative', zIndex:2 }}>
                      <div style={{ fontSize:9, fontWeight:800, color:'#53666F', letterSpacing:1.8, textTransform:'uppercase', marginBottom:3 }}>Ratal Advanced Technologies</div>
                      <div style={{ fontSize:9, fontWeight:800, color:PRI, letterSpacing:1.8, textTransform:'uppercase', marginBottom:16 }}><strong>Masters</strong></div>
                      <div style={{ fontSize:24, fontWeight:900, color:'#172D37', lineHeight:1.1, marginBottom:6 }}>{STEP_NAMES[step]}</div>
                      <div style={{ fontSize:11, color:'#53666F', lineHeight:1.5, marginBottom:8 }}>{STEP_DESC[step]}</div>
                      <div style={{ fontSize:9, fontWeight:800, color:PRI, letterSpacing:1, marginBottom:14 }}>STEP {step} OF 3</div>
                      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:1 }}>
                        {['Project Info','Contractor','Our Team'].map((name,idx)=>{
                          const sn=idx+1, isAct=step===sn, isDone=step>sn
                          return (
                            <div key={sn} onClick={()=>isDone&&setStep(sn)} style={{ display:'flex', alignItems:'center', padding:'8px 0 8px 12px', cursor:isDone?'pointer':'default', borderLeft: isAct ? `3px solid ${PRI}` : isDone ? `3px solid ${PRI}55` : '3px solid rgba(0,0,0,0.08)' }}>
                              <span style={{ fontSize:12, fontWeight:isAct?700:500, color:isAct?'#172D37':isDone?PRI:'#b09070' }}>{name}</span>
                              {isDone && <span style={{ marginLeft:6, fontSize:10, color:PRI }}>✓</span>}
                            </div>
                          )
                        })}
                      </div>
                      {editing?.is_carry_forward && (
                        <div style={{ background:'#fff3e0', borderRadius:8, padding:'8px 10px', marginTop:10, fontSize:10, color:'#e65100', fontWeight:600 }}>
                          🔄 CF#{editing.carry_forward_count} from {editing.original_project_number}
                        </div>
                      )}
                    </div>

                    {/* White card */}
                    <div style={{ position:'absolute', top:22, right:22, bottom:22, left:248, background:'#fff', borderRadius:16, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:`0 6px 24px ${PRI}22`, zIndex:3 }}>

                      {/* Card header */}
                      <div style={{ padding:'18px 22px 0', flexShrink:0 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                          <div>
                            <div style={{ fontSize:17, fontWeight:700, color:'#2d1a2a' }}>
                              {['','Project Info details','Contractor details','Our Team details'][step]}
                            </div>
                            {projNum && <div style={{ fontSize:11, color:PRI, fontWeight:700, marginTop:2 }}>{projNum}{editing?.is_carry_forward ? ' 🔄 Carry-forward' : ''}</div>}
                          </div>
                          <button onClick={()=>{setOpen(false);resetForm()}} style={{ background:`${PRI}18`, border:'none', color:PRI, borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
                        </div>
                        <div style={{ height:1, background:`${PRI}22` }} />
                      </div>

                      {/* Scrollable form */}
                      <div style={{ flex:1, overflowY:'auto', padding:'14px 22px 10px', fontFamily:POPPINS }}>

                        {/* Step 1 — Project Info */}
                        {step===1 && <>
                          <div style={sec}>Project Information</div>
                          <div style={row}>
                            <div style={{ flex:'0 0 160px' }}>
                              <label style={lbl}>Project # *</label>
                              <input style={inp()} value={projNum} onChange={e=>setProjNum(e.target.value.toUpperCase())} placeholder="e.g. P-TISU-2026" />
                            </div>
                            <div style={col}>
                              <label style={lbl}>Status</label>
                              <select style={inp()} value={status} onChange={e=>setStatus(e.target.value)}>
                                {STATUS_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            </div>
                          </div>
                          <div style={{ marginBottom:12 }}>
                            <label style={lbl}>Project Name *</label>
                            <input style={inp()} value={projName} onChange={e=>setProjName(e.target.value)} placeholder="e.g. STC Network Expansion – Riyadh" />
                          </div>
                          <div style={row}>
                            <div style={col}>
                              <label style={lbl}>Project Type</label>
                              <select style={inp()} value={projType} onChange={e=>setProjType(e.target.value)}>
                                <option value="">— Select —</option>
                                {PROJECT_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                            <div style={col}>
                              <label style={lbl}>Department</label>
                              <select style={inp()} value={deptId} onChange={e=>setDeptId(e.target.value)}>
                                <option value="">— Select Department —</option>
                                {depts.map(d=><option key={d.id} value={d.id}>{d.dept_code || d.dept_name}</option>)}
                              </select>
                            </div>
                          </div>
                          <div style={row}>
                            <div style={col}>
                              <label style={lbl}>Start Date</label>
                              <input type="date" style={inp()} value={startDate} onChange={e=>setStartDate(e.target.value)} />
                            </div>
                            <div style={col}>
                              <label style={lbl}>End Date</label>
                              <input type="date" style={inp()} value={endDate} onChange={e=>setEndDate(e.target.value)} />
                            </div>
                            <div style={col}>
                              <label style={lbl}>Contract Value (SAR)</label>
                              <input type="number" style={inp()} value={contract} onChange={e=>setContract(e.target.value)} placeholder="0.00" min={0} step={1000} />
                            </div>
                          </div>
                        </>}

                        {/* Step 2 — Contractor */}
                        {step===2 && <>
                          <div style={sec}>Contractor</div>
                          <div style={{ marginBottom:12 }}>
                            <label style={lbl}>Contractor (Party List)</label>
                            <select style={inp()} value={contractorId} onChange={e=>setContractorId(e.target.value)}>
                              <option value="">— Select Contractor —</option>
                              {contractors.map(c=><option key={c.id} value={c.id}>{c.contractor_code ? `[${c.contractor_code}] ` : ''}{c.contractor_name}</option>)}
                            </select>
                          </div>
                          <div style={sec}>Contractor's PM</div>
                          <div style={row}>
                            <div style={col}>
                              <label style={lbl}>PM Name *</label>
                              <input style={inp()} value={contPmName} onChange={e=>setContPmName(e.target.value)} placeholder="Full name" />
                            </div>
                            <div style={col}>
                              <label style={lbl}>Mobile *</label>
                              <input style={inp()} value={contPmPhone} onChange={e=>setContPmPhone(e.target.value)} placeholder="+966 5X XXX XXXX" />
                            </div>
                          </div>
                          <div style={{ marginBottom:12 }}>
                            <label style={lbl}>Email *</label>
                            <input type="email" style={inp()} value={contPmEmail} onChange={e=>setContPmEmail(e.target.value)} placeholder="pm@contractor.com" />
                          </div>
                        </>}

                        {/* Step 3 — Our Team */}
                        {step===3 && <>
                          <div style={sec}>Our Project Team</div>
                          <div style={row}>
                            <div style={col}>
                              <label style={lbl}>Project Manager</label>
                              <select style={inp()} value={pmId} onChange={e=>onPmChange(e.target.value)}>
                                <option value="">— Select PM —</option>
                                {employees.map(e=><option key={e.id} value={e.id}>{e.full_name_en}{e.designation?' – '+e.designation:e.job_title?' – '+e.job_title:''}</option>)}
                              </select>
                            </div>
                            <div style={col}>
                              <label style={lbl}>Supervisor</label>
                              <select style={inp()} value={supId} onChange={e=>onSupChange(e.target.value)}>
                                <option value="">— Select Supervisor —</option>
                                {employees.map(e=><option key={e.id} value={e.id}>{e.full_name_en}{e.designation?' – '+e.designation:e.job_title?' – '+e.job_title:''}</option>)}
                              </select>
                            </div>
                          </div>
                          {pmId && (
                            <div style={row}>
                              <div style={col}><label style={lbl}>PM Email</label><input type="email" style={inp()} value={pmEmail} onChange={e=>setPmEmail(e.target.value)} /></div>
                              <div style={col}><label style={lbl}>PM Phone</label><input style={inp()} value={pmPhone} onChange={e=>setPmPhone(e.target.value)} /></div>
                            </div>
                          )}
                          <div style={{ marginBottom:12 }}>
                            <label style={lbl}>Description / Scope of Work</label>
                            <textarea style={{ ...inp(), minHeight:80, resize:'vertical' }} value={desc} onChange={e=>setDesc(e.target.value)} />
                          </div>
                        </>}

                      </div>

                      {/* Footer inside white card */}
                      <div style={{ flexShrink:0, padding:'11px 22px 14px', borderTop:`1px solid ${PRI}22`, display:'flex', justifyContent:'space-between', alignItems:'center', fontFamily:POPPINS }}>
                        <button onClick={step===1?()=>{setOpen(false);resetForm()}:()=>setStep(s=>s-1)} style={{ background:'#747474', color:'#fff', border:'none', borderRadius:24, padding:'9px 24px', cursor:'pointer', fontSize:13, fontWeight:600 }}>{step===1?'Cancel':'Back'}</button>
                        <span style={{ fontSize:10, color:'#53666F' }}>Complete all three steps to create your project</span>
                        {step<3
                          ? <button onClick={()=>setStep(s=>s+1)} style={{ background:PRI, color:'#fff', border:'none', borderRadius:24, padding:'9px 28px', cursor:'pointer', fontSize:13, fontWeight:700, boxShadow:`0 4px 14px ${PRI}44` }}>Save &amp; Next</button>
                          : <button onClick={save} disabled={saving} style={{ background:saving?'#c7c7c7':PRI, color:'#fff', border:'none', borderRadius:24, padding:'9px 28px', cursor:saving?'not-allowed':'pointer', fontSize:13, fontWeight:700, boxShadow:saving?'none':`0 4px 14px ${PRI}44` }}>{saving?'Saving…':editing?'✓ Update Project':'✓ Create Project'}</button>
                        }
                      </div>
                    </div>
                </div>
              )}

            </div>
          </div>
        )
      })()}
    </div>
  )
}
