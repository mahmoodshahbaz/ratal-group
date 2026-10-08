import { GROUP_COLORS } from '../styles/appStyles'
import PageBanner from '../components/PageBanner'
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ── Constants ───────────────────────────────────────────────────
const UNITS = ['NISU', 'TISU', 'CISU', 'ITSU']
const CISU_TYPES = ['MW_LINKS', 'NODE', 'CAMERA', 'DOOR_ACCESS', 'DATA_CENTRE']
const STATUSES = ['PENDING','MOBILISED','IN_PROGRESS','MATERIAL_WAITING','COMPLETED','SNAGGING','HANDED_OVER','INVOICED']

const MILESTONES = {
  NISU: ['Survey & BOQ Approval','Material Delivery','Installation Complete','Testing & Commissioning','PAT / Acceptance','Snagging Cleared'],
  TISU: ['Mobilisation','Foundation Complete','Tower Erection','Shelter / Power','Handover','Snagging Complete'],
  CISU: ['Work Order Received','Site Preparation','Main Works','Testing','Acceptance','Invoice Ready'],
  ITSU: ['Charter Signed','Resource Deployment','Configuration','Testing','Client Acceptance','Invoice'],
}

const STATUS_COLORS = {
  PENDING:'#9e9e9e', MOBILISED:'#1565c0', IN_PROGRESS:'#e65100',
  MATERIAL_WAITING:'#f57f17', COMPLETED:'#2e7d32', SNAGGING:'#6a1b9a',
  HANDED_OVER:'#00695c', INVOICED:'#1a237e',
}

const BUDGET_ROWS = [
  { key:'team_expenses', label:'Team Expenses' },
  { key:'supplier_pos',  label:'Supplier POs'  },
  { key:'subcon_pos',    label:'Subcon POs'    },
  { key:'food',          label:'Food & Allowances' },
  { key:'overtime',      label:'Overtime'      },
  { key:'petty_cash',    label:'Petty Cash'    },
  { key:'misc',          label:'Miscellaneous' },
]

// ── Helpers ─────────────────────────────────────────────────────
const SAR = v => `SAR ${(+v||0).toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const fmt = d => d ? new Date(d).toLocaleDateString('en-GB') : '—'

function trafficLight(actual, budget) {
  if (!budget || budget <= 0) return { color:'#9e9e9e', label:'NO BUDGET', bg:'#f5f5f5' }
  const r = actual / budget
  if (r < 0.70) return { color:'#2e7d32', label:'ON TRACK',  bg:'#e8f5e9' }
  if (r < 0.85) return { color:'#1565c0', label:'MONITOR',   bg:'#e3f2fd' }
  if (r < 0.95) return { color:'#e65100', label:'WARNING',   bg:'#fff3e0' }
  if (r <= 1.0)  return { color:'#c62828', label:'CRITICAL',  bg:'#ffebee' }
  return { color:'#fff', label:'OVERRUN', bg:'#b71c1c' }
}

// ── Styles ───────────────────────────────────────────────────────
const MC = GROUP_COLORS.Masters

const S = {
  card:    { background:'#fff', borderRadius:12, padding:'18px 20px', boxShadow:'0 2px 8px rgba(0,0,0,0.06)', marginBottom:16 },
  inp:     { width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
  btn:     (c='#8C601B', outline=false) => ({ background:outline?'transparent':c, color:outline?c:'#fff', border:outline?`2px solid ${c}`:'none', borderRadius:8, padding:'8px 16px', fontSize:13, fontWeight:700, cursor:'pointer' }),
  label:   { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4, textTransform:'uppercase', letterSpacing:0.5 },
  row:     { display:'flex', gap:12, marginBottom:14 },
  col:     { flex:1 },
  tbl:     { width:'100%', borderCollapse:'collapse', fontSize:12 },
  th:      { background:'#8C601B', color:'#fff', padding:'8px 10px', fontWeight:700, textAlign:'left', fontSize:11, textTransform:'uppercase', letterSpacing:0.5, borderBottom:'2px solid #7a5217' },
  td:      { padding:'9px 10px', borderBottom:'1px solid #f0f4f8', color:'#1a2e3d', verticalAlign:'middle' },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' },
  modal:   { background:'#fff', borderRadius:16, padding:28, width:840, maxWidth:'96vw', maxHeight:'93vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.18)' },
  tab:     a => ({ padding:'7px 16px', border:'none', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:700, background:a?'#5A32D4':'#f0f4f8', color:a?'#fff':'#6b7c93', marginRight:6 }),
  badge:   (c='#5A32D4') => ({ background:c+'18', color:c, padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700, display:'inline-block' }),
  section: { background:'#f8f9fc', borderRadius:10, padding:'14px 16px', marginBottom:14 },
  secTitle:{ fontSize:11, fontWeight:800, color:'#6b7c93', textTransform:'uppercase', letterSpacing:1, marginBottom:12 },
  kv:      { display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:8, borderBottom:'1px solid #f0f4f8', paddingBottom:6 },
}

const EMPTY = {
  service_unit:'NISU', work_type:'', project_id:'', contractor_id:'',
  dept_id:'', pm_id:'', job_no:'', site_name:'', location:'',
  contractor_po:'', contractor_po_value:'',
  start_date:'', end_date:'', status:'PENDING', notes:'',
  budget_team_expenses:'', budget_supplier_pos:'', budget_subcon_pos:'',
  budget_food:'', budget_overtime:'', budget_petty_cash:'', budget_misc:'',
}

// ── Main Component ───────────────────────────────────────────────
export default function SiteMaster({ entityId }) {
  const [sites,       setSites]       = useState([])
  const [projects,    setProjects]    = useState([])
  const [contractors, setContractors] = useState([])
  const [employees,   setEmployees]   = useState([])
  const [depts,       setDepts]       = useState([])
  const [loading,     setLoading]     = useState(true)

  const [showBanner, setShowBanner] = useState(false)
  const [showForm,  setShowForm]  = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [smStep,    setSmStep]    = useState(1)
  const [detail,    setDetail]    = useState(null)
  const [detailTab, setDetailTab] = useState('overview')
  const [form,      setForm]      = useState(EMPTY)
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState('')
  const [milestones,  setMilestones]  = useState([])
  const [savingML,    setSavingML]    = useState(false)

  const [filterProject, setFilterProject] = useState('')
  const [filterUnit,    setFilterUnit]    = useState('')
  const [filterStatus,  setFilterStatus]  = useState('')
  const [search,        setSearch]        = useState('')
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const [openMenu, setOpenMenu] = useState(null) // sm.id of row with open menu

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const [{ data:s },{ data:p },{ data:c },{ data:e },{ data:d }] = await Promise.all([
      supabase.from('site_masters').select(`
        *,
        project:project_id(project_number,project_name),
        contractor:contractor_id(contractor_name,contractor_code)
      `).eq('entity_id',entityId).order('created_at',{ascending:false}).limit(500),
      supabase.from('projects').select('id,project_number,project_name,status,contractor_id,department_id').eq('entity_id',entityId).order('project_number'),
      supabase.from('contractors').select('id,contractor_name,contractor_code').eq('entity_id',entityId).eq('vendor_type','CONTRACTOR').eq('status','ACTIVE').order('contractor_name'),
      supabase.from('employees').select('id,full_name_en,designation,department_id').eq('entity_id',entityId).eq('is_active',true).order('full_name_en'),
      supabase.from('departments').select('id,dept_name,dept_code').eq('entity_id',entityId).eq('is_active',true).order('dept_name'),
    ])
    setSites(s||[]); setProjects(p||[]); setContractors(c||[]); setEmployees(e||[]); setDepts(d||[])
    setLoading(false)
  }

  // When department changes → derive service_unit, reset project + PM
  function onDeptChange(deptId) {
    const dept = depts.find(d => d.id === deptId)
    setForm(p => ({ ...p, dept_id: deptId, service_unit: dept?.dept_code || '', project_id: '', pm_id: '' }))
  }

  function onProjectChange(pid) {
    setF('project_id', pid)
    const proj = projects.find(p => p.id === pid)
    if (proj?.contractor_id) setF('contractor_id', proj.contractor_id)
  }

  // Computed: projects filtered to selected department (strict — no fallback)
  const deptProjects = useMemo(() => {
    if (!form.dept_id) return projects
    return projects.filter(p => p.department_id === form.dept_id)
  }, [projects, form.dept_id])

  // Computed: employees filtered to selected department (strict — no fallback)
  const deptEmployees = useMemo(() => {
    if (!form.dept_id) return employees
    return employees.filter(e => e.department_id === form.dept_id)
  }, [employees, form.dept_id])

  async function nextSmId(unit) {
    const yr = new Date().getFullYear().toString().slice(2)
    const { data } = await supabase.from('site_masters').select('sm_id').like('sm_id',`SM-${unit}-${yr}-%`).order('sm_id',{ascending:false}).limit(1)
    if (!data || data.length === 0) return `SM-${unit}-${yr}-001`
    const seq = parseInt(data[0].sm_id.split('-').pop()||'0') + 1
    return `SM-${unit}-${yr}-${String(seq).padStart(3,'0')}`
  }

  async function save() {
    setSaveError('')
    console.log('[SiteMaster save] form=', form, 'entityId=', entityId, 'projects loaded=', projects.length)
    if (!form.dept_id)      { setSaveError('Department is required.'); return }
    if (!form.project_id)   { setSaveError('Project is required — select a department first, then pick a project.'); return }
    setSaving(true)
    const isNew = !editing
    const sm_id = isNew ? await nextSmId(form.service_unit) : editing.sm_id
    const defaultML = (MILESTONES[form.service_unit]||[]).map(name=>({ name, status:'PENDING', date:'', notes:'', pct:0 }))
    const payload = {
      entity_id:entityId, sm_id,
      service_unit:form.service_unit,
      work_type:form.work_type||null,
      project_id:form.project_id||null,
      contractor_id:form.contractor_id||null,
      dept_id:form.dept_id||null,
      pm_id:form.pm_id||null,
      job_no:form.job_no || sm_id,
      site_name:form.site_name||null,
      location:form.location||null,
      contractor_po:form.contractor_po||null,
      contractor_po_value:+form.contractor_po_value||0,
      start_date:form.start_date||null,
      end_date:form.end_date||null,
      status:form.status||'PENDING',
      notes:form.notes||null,
      budget_team_expenses:+form.budget_team_expenses||0,
      budget_supplier_pos: +form.budget_supplier_pos||0,
      budget_subcon_pos:   +form.budget_subcon_pos||0,
      budget_food:         +form.budget_food||0,
      budget_overtime:     +form.budget_overtime||0,
      budget_petty_cash:   +form.budget_petty_cash||0,
      budget_misc:         +form.budget_misc||0,
      ...(isNew ? { milestones:defaultML } : {}),
    }
    const { data: saved, error } = isNew
      ? await supabase.from('site_masters').insert(payload).select('id,sm_id')
      : await supabase.from('site_masters').update(payload).eq('id',editing.id).select('id,sm_id')
    setSaving(false)
    console.log('[SiteMaster save result] saved=', saved, 'error=', error)
    if (error) {
      console.error('SiteMaster save error:', error)
      setSaveError(`DB Error: ${error.message}`)
      return
    }
    if (!saved || saved.length === 0) {
      setSaveError('Row was not saved — your session may have expired. Please log out and log back in, then try again.')
      return
    }
    closeForm(); load()
  }

  function openEdit(sm) {
    setEditing(sm)
    // Derive service_unit from dept if not stored
    const dept = depts.find(d => d.id === sm.dept_id)
    setForm({
      service_unit:sm.service_unit||dept?.dept_code||'', work_type:sm.work_type||'',
      project_id:sm.project_id||'', contractor_id:sm.contractor_id||'',
      dept_id:sm.dept_id||'', pm_id:sm.pm_id||'',
      job_no:sm.job_no||'', site_name:sm.site_name||'', location:sm.location||'',
      contractor_po:sm.contractor_po||'', contractor_po_value:sm.contractor_po_value||'',
      start_date:sm.start_date||'', end_date:sm.end_date||'',
      status:sm.status||'PENDING', notes:sm.notes||'',
      budget_team_expenses:sm.budget_team_expenses||'',
      budget_supplier_pos: sm.budget_supplier_pos||'',
      budget_subcon_pos:   sm.budget_subcon_pos||'',
      budget_food:         sm.budget_food||'',
      budget_overtime:     sm.budget_overtime||'',
      budget_petty_cash:   sm.budget_petty_cash||'',
      budget_misc:         sm.budget_misc||'',
    })
    setSmStep(1); setShowForm(true)
  }

  function closeForm() { setShowForm(false); setEditing(null); setForm(EMPTY); setSaveError(''); setSmStep(1) }

  async function deleteSite(sm, e) {
    e.stopPropagation()
    if (!window.confirm(`Delete "${sm.sm_id} — ${sm.site_name || sm.job_no}"?\n\nThis cannot be undone.`)) return
    const { error } = await supabase.from('site_masters').delete().eq('id', sm.id)
    if (error) { alert('Delete failed: ' + error.message); return }
    setSites(prev => prev.filter(s => s.id !== sm.id))
    if (detail?.id === sm.id) setDetail(null)
  }

  function openDetail(sm) {
    setDetail(sm)
    const ml = sm.milestones
    setMilestones(Array.isArray(ml) ? ml : (typeof ml==='string' ? JSON.parse(ml||'[]') : []))
    setDetailTab('overview')
  }

  async function saveMilestones() {
    setSavingML(true)
    const { error } = await supabase.from('site_masters').update({ milestones }).eq('id',detail.id)
    setSavingML(false)
    if (error) { alert(error.message); return }
    const updated = { ...detail, milestones }
    setDetail(updated)
    setSites(prev => prev.map(s => s.id===detail.id ? updated : s))
  }

  function updateML(i, field, val) {
    setMilestones(prev => prev.map((m,idx) => idx===i ? { ...m, [field]:val } : m))
  }

  async function updateStatus(sm, newStatus) {
    const { error } = await supabase.from('site_masters').update({ status:newStatus }).eq('id',sm.id)
    if (!error) {
      setSites(prev => prev.map(s => s.id===sm.id ? { ...s, status:newStatus } : s))
      if (detail?.id===sm.id) setDetail(d=>({ ...d, status:newStatus }))
    }
  }

  async function lockBudget() {
    if (!window.confirm(`Lock budget for ${detail.sm_id}? This cannot be undone.`)) return
    const { error } = await supabase.from('site_masters').update({ budget_locked:true, budget_locked_at:new Date().toISOString() }).eq('id',detail.id)
    if (!error) {
      const updated = { ...detail, budget_locked:true, budget_locked_at:new Date().toISOString() }
      setDetail(updated); setSites(prev=>prev.map(s=>s.id===detail.id?updated:s))
    }
  }

  function setF(field, val) { setForm(p=>({...p,[field]:val})) }

  const filtered = useMemo(() => sites
    .filter(s => !filterProject || s.project_id===filterProject)
    .filter(s => !filterUnit   || s.service_unit===filterUnit)
    .filter(s => !filterStatus || s.status===filterStatus)
    .filter(s => !search || [s.sm_id,s.job_no,s.site_name,s.location].some(f=>(f||'').toLowerCase().includes(search.toLowerCase())))
  , [sites,filterProject,filterUnit,filterStatus,search])

  const totalBudget = sites.reduce((a,s)=>a+(+s.budget_total||0),0)
  const totalActual = sites.reduce((a,s)=>a+(+s.actual_total||0),0)
  const unitCounts  = UNITS.reduce((acc,u)=>({...acc,[u]:sites.filter(s=>s.service_unit===u).length}),{})

  // ── Render ───────────────────────────────────────────────────
  return (
    <div>

      {/* ══ STICKY: Header + KPIs + Filters ══════════════════════ */}
      <div style={{ position:'sticky', top:0, zIndex:20, background:'#f4f7fb', boxShadow:'0 2px 6px rgba(0,0,0,0.06)', paddingBottom:8, marginBottom:4 }}>

        {/* ── Row 1: Button */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0 6px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <button onClick={()=>setHeaderCollapsed(c=>!c)}
              style={{ background:'none', border:'1px solid #dde3ec', borderRadius:6, padding:'3px 8px', cursor:'pointer', fontSize:13, color:'#6b7c93' }}>
              {headerCollapsed ? '▼' : '▲'}
            </button>
            <div>
              <div style={{ fontSize:18, fontWeight:800, color:'#1a2e3d' }}>Site Master</div>
              <div style={{ fontSize:11, color:'#6b7c93' }}>Operational &amp; Financial — Sites / Jobs / Charters</div>
            </div>
          </div>
        </div>

        {/* ── KPI Strip + Filters — collapsible */}
        {!headerCollapsed && <>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', paddingBottom:6, scrollbarWidth:'none' }}>
          {[
            { label:'Total',       val:sites.length,                                                              color:'#5A32D4', bg:'#ede7f6' },
            { label:'In Progress', val:sites.filter(s=>s.status==='IN_PROGRESS').length,                         color:'#e65100', bg:'#fff3e0' },
            { label:'Completed',   val:sites.filter(s=>['COMPLETED','SNAGGING','HANDED_OVER'].includes(s.status)).length, color:'#2e7d32', bg:'#e8f5e9' },
            { label:'Invoiced',    val:sites.filter(s=>s.status==='INVOICED').length,                             color:'#1a237e', bg:'#e8eaf6' },
            { label:'Budget',      val:SAR(totalBudget),                                                          color:'#1565c0', bg:'#e3f2fd' },
            { label:'Actual',      val:SAR(totalActual),                                                          color:totalActual>totalBudget?'#c62828':'#2e7d32', bg:totalActual>totalBudget?'#ffebee':'#e8f5e9' },
          ].map(k=>(
            <div key={k.label} style={{ background:`linear-gradient(135deg,${k.color}cc 0%,${k.color} 100%)`, borderRadius:10, padding:'10px 14px', flexShrink:0, minWidth:90, boxShadow:`0 3px 10px ${k.color}44`, position:'relative', overflow:'hidden' }}>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.85)', fontWeight:700, whiteSpace:'nowrap', textTransform:'uppercase', letterSpacing:0.8 }}>{k.label}</div>
              <div style={{ fontSize:20, fontWeight:900, color:'#fff', lineHeight:1.2, marginTop:2 }}>{k.val}</div>
            </div>
          ))}
          {UNITS.map(u=>(
            <div key={u} style={{ background:'linear-gradient(135deg,#7e57c2cc 0%,#5A32D4 100%)', borderRadius:10, padding:'10px 14px', flexShrink:0, minWidth:70, boxShadow:'0 3px 10px #5A32D444', textAlign:'center' }}>
              <div style={{ fontSize:9, fontWeight:700, color:'rgba(255,255,255,0.85)', textTransform:'uppercase', letterSpacing:0.8 }}>{u}</div>
              <div style={{ fontSize:20, fontWeight:900, color:'#fff', lineHeight:1.2, marginTop:2 }}>{unitCounts[u]||0}</div>
            </div>
          ))}
        </div>

        {/* ── Filters + New Site button */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', paddingBottom:6 }}>
          <input style={{ ...S.inp, maxWidth:180 }} placeholder="Search SM#, Job#, Site…" value={search} onChange={e=>setSearch(e.target.value)} />
          <select style={{ ...S.inp, maxWidth:230 }} value={filterProject} onChange={e=>setFilterProject(e.target.value)}>
            <option value="">All Projects</option>
            {projects.map(p=><option key={p.id} value={p.id}>[{p.project_number}] {p.project_name}</option>)}
          </select>
          <select style={{ ...S.inp, maxWidth:120 }} value={filterUnit} onChange={e=>setFilterUnit(e.target.value)}>
            <option value="">All Units</option>
            {UNITS.map(u=><option key={u}>{u}</option>)}
          </select>
          <select style={{ ...S.inp, maxWidth:160 }} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
          </select>
          <span style={{ fontSize:11, color:'#6b7c93' }}>{filtered.length} sites</span>
          <button style={{ ...S.btn(), marginLeft:'auto', padding:'10px 0', minWidth:160, textAlign:'center', boxShadow:'0 3px 8px rgba(140,96,27,0.35)' }} onClick={()=>{ setEditing(null); setForm(EMPTY); setSmStep(1); setShowBanner(true) }}>Add New Site</button>
        </div>
        </>}
      </div>{/* end sticky block */}

      {/* ── Table */}
      <div style={S.card} onClick={()=>setOpenMenu(null)}>
        {loading ? <div style={{ textAlign:'center', padding:40, color:'#6b7c93' }}>Loading…</div> : (
        <table style={S.tbl}>
          <thead style={{ position:'sticky', top:0, zIndex:10 }}><tr>
            <th style={{ ...S.th, whiteSpace:'nowrap' }}>SM ID</th>
            <th style={S.th}>Unit</th>
            <th style={{ ...S.th, whiteSpace:'nowrap' }}>Job# / Site#</th>
            <th style={S.th}>Site Name</th>
            <th style={{ ...S.th, whiteSpace:'nowrap' }}>Project</th>
            <th style={S.th}>Status</th>
            <th style={S.th}>Budget</th>
            <th style={S.th}>Actual</th>
            <th style={S.th}>Health</th>
            <th style={S.th}></th>
          </tr></thead>
          <tbody>
            {filtered.length===0 && (
              <tr><td colSpan={10} style={{ ...S.td, textAlign:'center', color:'#aab2bd', padding:40 }}>
                No sites yet — click "+ New Site" to add one
              </td></tr>
            )}
            {filtered.map((sm,i)=>{
              const tl = trafficLight(+sm.actual_total||0, +sm.budget_total||0)
              return (
                <tr key={sm.id} style={{ background:i%2===0?'#fff':'#fafbfc', cursor:'pointer' }} onClick={()=>openDetail(sm)}>
                  <td style={{ ...S.td, fontWeight:800, color:'#5A32D4', fontFamily:'monospace', fontSize:12, whiteSpace:'nowrap' }}>{sm.sm_id}</td>
                  <td style={S.td}><span style={S.badge()}>{sm.service_unit}</span></td>
                  <td style={{ ...S.td, fontFamily:'monospace', fontSize:12 }}>{sm.job_no}</td>
                  <td style={{ ...S.td, maxWidth:160 }}><div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{sm.site_name||'—'}</div></td>
                  <td style={{ ...S.td, fontSize:11, color:'#6b7c93' }}>{sm.project?.project_number||'—'}</td>
                  <td style={S.td}>
                    <span style={{ background:(STATUS_COLORS[sm.status]||'#9e9e9e')+'18', color:STATUS_COLORS[sm.status]||'#9e9e9e', padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700 }}>
                      {(sm.status||'PENDING').replace(/_/g,' ')}
                    </span>
                  </td>
                  <td style={{ ...S.td, fontSize:11 }}>{+sm.budget_total>0 ? SAR(sm.budget_total) : '—'}</td>
                  <td style={{ ...S.td, fontSize:11 }}>{+sm.actual_total>0 ? SAR(sm.actual_total) : '—'}</td>
                  <td style={S.td}>
                    <span style={{ background:tl.bg, color:tl.color, padding:'2px 9px', borderRadius:20, fontSize:10, fontWeight:700 }}>{tl.label}</span>
                  </td>
                  <td style={{ ...S.td, width:36, textAlign:'center' }} onClick={e=>e.stopPropagation()}>
                    <div style={{ position:'relative', display:'inline-block' }}>
                      <button
                        style={{ background:'none', border:'1px solid #dde3ec', borderRadius:6, padding:'3px 8px', cursor:'pointer', fontSize:16, color:'#6b7c93', lineHeight:1 }}
                        onClick={e=>{ e.stopPropagation(); setOpenMenu(openMenu===sm.id ? null : sm.id) }}>
                        ⋯
                      </button>
                      {openMenu===sm.id && (
                        <div style={{ position:'absolute', right:0, top:'100%', background:'#fff', border:'1px solid #e0e7ef', borderRadius:8, boxShadow:'0 4px 16px rgba(0,0,0,0.12)', zIndex:100, minWidth:110, overflow:'hidden' }}
                          onClick={e=>e.stopPropagation()}>
                          <button style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', textAlign:'left', cursor:'pointer', fontSize:13, color:'#1a2e3d' }}
                            onMouseOver={e=>e.target.style.background='#f0f4f8'} onMouseOut={e=>e.target.style.background='none'}
                            onClick={()=>{ setOpenMenu(null); openEdit(sm) }}>✏ Edit</button>
                          <button style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', textAlign:'left', cursor:'pointer', fontSize:13, color:'#c62828' }}
                            onMouseOver={e=>e.target.style.background='#ffebee'} onMouseOut={e=>e.target.style.background='none'}
                            onClick={e=>{ setOpenMenu(null); deleteSite(sm,e) }}>🗑 Delete</button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        )}
      </div>

      {/* ── PageBanner ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); setSmStep(1); setShowForm(true) }}
        chapterL1="#C8B48F"
        chapterL2="#FAF5E9"
        moduleColor="#8C601B"
        chapterLabel="Masters"
        formTitle={['New', 'Site', 'Creation']}
        steps={['Site Identity', 'Team & Commercial', 'Budget']}
        icon="🏗"
        description="Create and manage site records. Tracks department, project, contractor, team and budget by category."
      />

      {/* ── CREATE / EDIT MODAL ──────────────────────────────────── */}
      {showForm && (() => {
        const PP = "'Poppins','Inter',sans-serif"
        const PRI = '#8C601B'   // Masters L3 accent
        const L1  = '#C8B48F'   // Masters outer frame
        const L2  = '#FAF5E9'   // Masters inner background
        const STEP_NAMES = ['','Site Identity','Team & Commercial','Budget']
        const STEP_DESC  = ['','Department, project, location & dates','Contractor, PM & PO reference','Budget allocation by category']
        const inp3 = (ex={}) => ({ width:'100%', padding:'9px 14px', borderRadius:20, border:`1px solid ${PRI}44`, fontSize:13, color:'#172D37', background:'#fdfaf6', outline:'none', fontFamily:PP, boxSizing:'border-box', ...ex })
        const sec3 = { fontSize:9, fontWeight:800, color:PRI, letterSpacing:1.5, textTransform:'uppercase', marginBottom:8, marginTop:12, paddingBottom:4, borderBottom:`1.5px solid ${PRI}33` }
        const lbl3 = { display:'block', fontSize:11, fontWeight:600, color:'#53666F', marginBottom:4 }
        const row3 = { display:'flex', gap:12, marginBottom:12, flexWrap:'wrap' }
        const col3 = { flex:1, minWidth:120 }
        return (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&closeForm()}>
          <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap');`}</style>
          <div style={{ width:860, maxWidth:'calc(100vw - 24px)', borderRadius:18, overflow:'hidden', boxShadow:'0 28px 64px rgba(0,0,0,0.32)', fontFamily:PP, background:L1, padding:8 }}>

            {/* ── STEPS 1–3 — 6-layer layout ── */}
            {smStep>=1 && (
              <div style={{ background:L2, borderRadius:12, display:'flex', minHeight:560, position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', top:0, right:0, width:'55%', height:'36%', background:PRI, borderRadius:'0 12px 0 90px', zIndex:1 }} />

                  {/* Sidebar */}
                  <div style={{ width:210, flexShrink:0, padding:'20px 16px 16px', display:'flex', flexDirection:'column', fontFamily:PP, position:'relative', zIndex:2 }}>
                    <div style={{ fontSize:9, fontWeight:800, color:'#53666F', letterSpacing:1.8, textTransform:'uppercase', marginBottom:3 }}>Ratal Advanced Technologies</div>
                    <div style={{ fontSize:9, fontWeight:800, color:PRI, letterSpacing:1.8, textTransform:'uppercase', marginBottom:16 }}><strong>Masters</strong></div>
                    <div style={{ fontSize:24, fontWeight:900, color:'#172D37', lineHeight:1.1, marginBottom:6 }}>{STEP_NAMES[smStep]}</div>
                    <div style={{ fontSize:11, color:'#53666F', lineHeight:1.5, marginBottom:8 }}>{STEP_DESC[smStep]}</div>
                    <div style={{ fontSize:9, fontWeight:800, color:PRI, letterSpacing:1, marginBottom:14 }}>STEP {smStep} OF 3</div>
                    <div style={{ flex:1, display:'flex', flexDirection:'column', gap:1 }}>
                      {['Site Identity','Team & Commercial','Budget'].map((name,idx)=>{
                        const sn=idx+1, isAct=smStep===sn, isDone=smStep>sn
                        return (
                          <div key={sn} onClick={()=>isDone&&setSmStep(sn)} style={{ display:'flex', alignItems:'center', padding:'8px 0 8px 12px', cursor:isDone?'pointer':'default', borderLeft:isAct?`3px solid ${PRI}`:isDone?`3px solid ${PRI}55`:'3px solid rgba(0,0,0,0.08)' }}>
                            <span style={{ fontSize:12, fontWeight:isAct?700:500, color:isAct?'#172D37':isDone?PRI:'#b09070' }}>{name}</span>
                            {isDone && <span style={{ marginLeft:6, fontSize:10, color:PRI }}>✓</span>}
                          </div>
                        )
                      })}
                    </div>
                    {editing && <div style={{ background:`${PRI}18`, borderRadius:8, padding:'8px 10px', marginTop:10, fontSize:10, color:PRI, fontWeight:700 }}>✏️ Editing: {editing.sm_id}</div>}
                  </div>

                  {/* White card (L4) */}
                  <div style={{ position:'absolute', top:22, right:22, bottom:22, left:248, background:'#fff', borderRadius:16, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:`0 6px 24px ${PRI}22`, zIndex:3 }}>

                    {/* Card header */}
                    <div style={{ padding:'18px 22px 0', flexShrink:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                        <div>
                          <div style={{ fontSize:17, fontWeight:700, color:'#172D37' }}>{['','Site Identity','Team & Commercial','Budget Allocation'][smStep]}</div>
                          {editing && <div style={{ fontSize:11, color:PRI, fontWeight:700, marginTop:2 }}>{editing.sm_id}</div>}
                        </div>
                        <button onClick={closeForm} style={{ background:`${PRI}18`, border:'none', color:PRI, borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
                      </div>
                      <div style={{ height:1, background:`${PRI}22` }} />
                    </div>

                    {/* Scrollable form */}
                    <div style={{ flex:1, overflowY:'auto', padding:'14px 22px 10px', fontFamily:PP }}>

                      {/* Step 1 — Site Identity */}
                      {smStep===1 && <>
                        <div style={sec3}>Department &amp; Project</div>
                        <div style={row3}>
                          <div style={col3}>
                            <label style={lbl3}>Department *</label>
                            <select style={inp3()} value={form.dept_id} onChange={e=>onDeptChange(e.target.value)}>
                              <option value="">Select department…</option>
                              {depts.map(d=><option key={d.id} value={d.id}>{d.dept_code || d.dept_name}</option>)}
                            </select>
                          </div>
                          {form.service_unit==='CISU' && (
                            <div style={col3}>
                              <label style={lbl3}>Work Type</label>
                              <select style={inp3()} value={form.work_type} onChange={e=>setF('work_type',e.target.value)}>
                                <option value="">Select…</option>
                                {CISU_TYPES.map(t=><option key={t}>{t}</option>)}
                              </select>
                            </div>
                          )}
                          <div style={col3}>
                            <label style={lbl3}>Status</label>
                            <select style={inp3()} value={form.status} onChange={e=>setF('status',e.target.value)}>
                              {STATUSES.map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{ marginBottom:12 }}>
                          <label style={lbl3}>Project *{form.dept_id && (deptProjects.length===0?<span style={{ color:'#c62828', fontWeight:400, textTransform:'none', marginLeft:6 }}>⚠ no projects in this dept</span>:<span style={{ color:PRI, fontWeight:400, textTransform:'none', marginLeft:6 }}>({deptProjects.length} available)</span>)}</label>
                          <select style={inp3()} value={form.project_id} onChange={e=>onProjectChange(e.target.value)} disabled={!form.dept_id}>
                            <option value="">{!form.dept_id?'Select department first…':deptProjects.length===0?'No projects for this dept':'Select project…'}</option>
                            {deptProjects.map(p=><option key={p.id} value={p.id}>[{p.project_number}] {p.project_name}</option>)}
                          </select>
                        </div>
                        <div style={sec3}>Site Details</div>
                        <div style={row3}>
                          <div style={col3}>
                            <label style={lbl3}>Job# / Site#</label>
                            <input style={inp3()} value={form.job_no} onChange={e=>setF('job_no',e.target.value)} placeholder="Auto-filled if blank" />
                          </div>
                          <div style={{ flex:2 }}>
                            <label style={lbl3}>Site Name</label>
                            <input style={inp3()} value={form.site_name} onChange={e=>setF('site_name',e.target.value)} placeholder="e.g. King Fahd Road Tower" />
                          </div>
                        </div>
                        <div style={row3}>
                          <div style={{ flex:2 }}>
                            <label style={lbl3}>Location</label>
                            <input style={inp3()} value={form.location} onChange={e=>setF('location',e.target.value)} placeholder="City / Area / Address" />
                          </div>
                          <div style={col3}>
                            <label style={lbl3}>Start Date</label>
                            <input type="date" style={inp3()} value={form.start_date} onChange={e=>setF('start_date',e.target.value)} />
                          </div>
                          <div style={col3}>
                            <label style={lbl3}>End Date</label>
                            <input type="date" style={inp3()} value={form.end_date} onChange={e=>setF('end_date',e.target.value)} />
                          </div>
                        </div>
                      </>}

                      {/* Step 2 — Team & Commercial */}
                      {smStep===2 && <>
                        <div style={sec3}>Team Assignment</div>
                        <div style={row3}>
                          <div style={col3}>
                            <label style={lbl3}>Contractor</label>
                            <select style={inp3()} value={form.contractor_id} onChange={e=>setF('contractor_id',e.target.value)}>
                              <option value="">Select…</option>
                              {contractors.map(c=><option key={c.id} value={c.id}>{c.contractor_code?`[${c.contractor_code}] `:''}{c.contractor_name}</option>)}
                            </select>
                          </div>
                          <div style={col3}>
                            <label style={lbl3}>Project Manager{form.dept_id&&(deptEmployees.length===0?<span style={{ color:'#c62828', fontWeight:400, textTransform:'none', marginLeft:6 }}>⚠ no employees</span>:<span style={{ color:PRI, fontWeight:400, textTransform:'none', marginLeft:6 }}>({deptEmployees.length})</span>)}</label>
                            <select style={inp3()} value={form.pm_id} onChange={e=>setF('pm_id',e.target.value)} disabled={!form.dept_id}>
                              <option value="">{!form.dept_id?'Select dept first…':deptEmployees.length===0?'No employees in dept':'Select PM…'}</option>
                              {deptEmployees.map(e=><option key={e.id} value={e.id}>{e.full_name_en}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={sec3}>Commercial Reference</div>
                        <div style={row3}>
                          <div style={{ flex:2 }}>
                            <label style={lbl3}>Contractor PO Reference</label>
                            <input style={inp3()} value={form.contractor_po} onChange={e=>setF('contractor_po',e.target.value)} placeholder="PO number from contractor" />
                          </div>
                          <div style={col3}>
                            <label style={lbl3}>PO Value (SAR)</label>
                            <input type="number" style={inp3()} value={form.contractor_po_value} onChange={e=>setF('contractor_po_value',e.target.value)} placeholder="0.00" />
                          </div>
                        </div>
                      </>}

                      {/* Step 3 — Budget */}
                      {smStep===3 && <>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <div style={sec3}>Budget Allocation</div>
                          {editing?.budget_locked && <span style={{ background:'#e8f5e9', color:'#2e7d32', borderRadius:6, padding:'2px 10px', fontSize:10, fontWeight:800 }}>🔒 LOCKED</span>}
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                          {BUDGET_ROWS.map(r=>(
                            <div key={r.key}>
                              <label style={lbl3}>{r.label} (SAR)</label>
                              <input type="number" style={inp3({ background:editing?.budget_locked?'#f5f5f5':'#f6fbf6' })}
                                value={form[`budget_${r.key}`]} onChange={e=>setF(`budget_${r.key}`,e.target.value)} placeholder="0.00" disabled={!!editing?.budget_locked} />
                            </div>
                          ))}
                        </div>
                        <div style={{ padding:'10px 14px', background:'#d8efd8', borderRadius:8, fontSize:13, fontWeight:700, color:PRI, marginBottom:12 }}>
                          Total Budget: {SAR(BUDGET_ROWS.reduce((a,r)=>a+(+form[`budget_${r.key}`]||0),0))}
                        </div>
                        <div style={sec3}>Notes</div>
                        <textarea style={{ ...inp3(), minHeight:60, resize:'vertical' }} value={form.notes} onChange={e=>setF('notes',e.target.value)} placeholder="Any additional notes…" />
                        {saveError && <div style={{ background:'#ffebee', border:'1px solid #ef9a9a', borderRadius:8, padding:'8px 12px', marginTop:10, color:'#c62828', fontSize:12 }}>⚠ {saveError}</div>}
                      </>}

                    </div>

                    {/* Footer inside white card */}
                    <div style={{ flexShrink:0, padding:'11px 22px 14px', borderTop:`1px solid ${PRI}22`, display:'flex', justifyContent:'space-between', alignItems:'center', fontFamily:PP }}>
                      <button onClick={smStep===1?closeForm:()=>setSmStep(s=>s-1)} style={{ background:'#747474', color:'#fff', border:'none', borderRadius:24, padding:'9px 24px', cursor:'pointer', fontSize:13, fontWeight:600 }}>{smStep===1?'Cancel':'Back'}</button>
                      <span style={{ fontSize:10, color:'#53666F' }}>Complete all steps to create the site</span>
                      {smStep<3
                        ? <button onClick={()=>setSmStep(s=>s+1)} style={{ background:PRI, color:'#fff', border:'none', borderRadius:24, padding:'9px 28px', cursor:'pointer', fontSize:13, fontWeight:700, boxShadow:`0 4px 14px ${PRI}44` }}>Save &amp; Next</button>
                        : <button onClick={save} disabled={saving} style={{ background:saving?'#c7c7c7':PRI, color:'#fff', border:'none', borderRadius:24, padding:'9px 28px', cursor:saving?'not-allowed':'pointer', fontSize:13, fontWeight:700, boxShadow:saving?'none':`0 4px 14px ${PRI}44` }}>{saving?'Saving…':editing?'✓ Update Site':'✓ Create Site'}</button>
                      }
                    </div>
                  </div>
              </div>
            )}

          </div>
        </div>
        )
      })()}

      {/* ── DETAIL MODAL ─────────────────────────────────────────── */}
      {detail && (
        <div style={S.overlay} onClick={()=>setDetail(null)}>
          <div style={{ ...S.modal, width:920 }} onClick={e=>e.stopPropagation()}>

            {/* Detail Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
              <div>
                <div style={{ fontSize:20, fontWeight:800, color:'#5A32D4', fontFamily:'monospace' }}>{detail.sm_id}</div>
                <div style={{ fontSize:14, color:'#1a2e3d', fontWeight:600, marginTop:2 }}>{detail.site_name||detail.job_no}</div>
                <div style={{ fontSize:12, color:'#6b7c93', marginTop:2 }}>
                  {detail.project?.project_number} — {detail.project?.project_name}
                </div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <select style={{ ...S.inp, maxWidth:210, fontSize:12 }} value={detail.status}
                  onChange={e=>updateStatus(detail,e.target.value)}>
                  {STATUSES.map(s=><option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                </select>
                <button style={{ ...S.btn(), padding:'7px 14px', fontSize:12 }} onClick={()=>{ setDetail(null); openEdit(detail) }}>Edit</button>
                <button style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#6b7c93' }} onClick={()=>setDetail(null)}>✕</button>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ marginBottom:20 }}>
              {['overview','milestones','budget','completions'].map(t=>(
                <button key={t} style={S.tab(detailTab===t)} onClick={()=>setDetailTab(t)}>
                  {t.charAt(0).toUpperCase()+t.slice(1)}
                </button>
              ))}
            </div>

            {/* ── Tab: OVERVIEW */}
            {detailTab==='overview' && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div style={S.section}>
                  <div style={S.secTitle}>Site Details</div>
                  {[
                    ['SM ID',       detail.sm_id],
                    ['Service Unit',detail.service_unit+(detail.work_type?' / '+detail.work_type:'')],
                    ['Job# / Site#',detail.job_no],
                    ['Site Name',   detail.site_name||'—'],
                    ['Location',    detail.location||'—'],
                    ['Start Date',  fmt(detail.start_date)],
                    ['End Date',    fmt(detail.end_date)],
                  ].map(([l,v])=>(
                    <div key={l} style={S.kv}>
                      <span style={{ color:'#6b7c93', fontWeight:600 }}>{l}</span>
                      <span style={{ fontWeight:700, color:'#1a2e3d' }}>{v}</span>
                    </div>
                  ))}
                </div>

                <div>
                  <div style={S.section}>
                    <div style={S.secTitle}>Team</div>
                    {[
                      ['Contractor', detail.contractor?.contractor_name||'—'],
                      ['Department', (() => { const d = depts.find(d=>d.id===detail.dept_id); return d ? `[${d.dept_code}] ${d.dept_name}` : '—' })()],
                      ['Project Manager', employees.find(e=>e.id===detail.pm_id)?.full_name_en||'—'],
                    ].map(([l,v])=>(
                      <div key={l} style={S.kv}>
                        <span style={{ color:'#6b7c93', fontWeight:600 }}>{l}</span>
                        <span style={{ fontWeight:700 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <div style={S.section}>
                    <div style={S.secTitle}>Commercial</div>
                    {[
                      ['Contractor PO',  detail.contractor_po||'—'],
                      ['PO Value',        +detail.contractor_po_value>0 ? SAR(detail.contractor_po_value) : '—'],
                      ['Invoiced Amount', SAR(detail.invoiced_amount||0)],
                    ].map(([l,v])=>(
                      <div key={l} style={S.kv}>
                        <span style={{ color:'#6b7c93', fontWeight:600 }}>{l}</span>
                        <span style={{ fontWeight:700 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {detail.notes && (
                  <div style={{ ...S.section, gridColumn:'1 / -1' }}>
                    <div style={S.secTitle}>Notes</div>
                    <div style={{ fontSize:12, color:'#1a2e3d', lineHeight:1.7 }}>{detail.notes}</div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: MILESTONES */}
            {detailTab==='milestones' && (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                  <div style={{ fontSize:12, color:'#6b7c93' }}>
                    {milestones.filter(m=>m.status==='COMPLETED').length} / {milestones.length} milestones completed
                  </div>
                  <button style={S.btn()} onClick={saveMilestones} disabled={savingML}>{savingML?'Saving…':'Save Milestones'}</button>
                </div>
                {milestones.length===0 && (
                  <div style={{ color:'#aab2bd', fontSize:13, textAlign:'center', padding:30 }}>No milestones — edit site to regenerate</div>
                )}
                {milestones.map((m,i)=>(
                  <div key={i} style={{ ...S.section, display:'flex', gap:12, alignItems:'flex-start', marginBottom:8, padding:'12px 14px' }}>
                    <div style={{ minWidth:28, paddingTop:2, fontSize:18 }}>
                      {m.status==='COMPLETED' ? '✅' : m.status==='IN_PROGRESS' ? '🔄' : m.status==='BLOCKED' ? '🚫' : '⬜'}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:'#1a2e3d', marginBottom:8 }}>
                        {i+1}. {m.name}
                      </div>
                      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                        <select style={{ ...S.inp, maxWidth:160, fontSize:12 }} value={m.status}
                          onChange={e=>updateML(i,'status',e.target.value)}>
                          {['PENDING','IN_PROGRESS','COMPLETED','BLOCKED'].map(s=><option key={s}>{s}</option>)}
                        </select>
                        <input type="date" style={{ ...S.inp, maxWidth:140, fontSize:12 }} value={m.date||''}
                          onChange={e=>updateML(i,'date',e.target.value)} />
                        <input style={{ ...S.inp, fontSize:12, flex:1 }} value={m.notes||''} placeholder="Notes…"
                          onChange={e=>updateML(i,'notes',e.target.value)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── Tab: BUDGET vs ACTUAL */}
            {detailTab==='budget' && (
              <div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <span style={S.badge(detail.budget_locked?'#2e7d32':'#e65100')}>
                      {detail.budget_locked ? '🔒 Budget Locked' : '🔓 Budget Open'}
                    </span>
                    {detail.budget_locked_at && (
                      <span style={{ fontSize:11, color:'#6b7c93' }}>Locked {fmt(detail.budget_locked_at)}</span>
                    )}
                  </div>
                  {!detail.budget_locked && (
                    <button style={S.btn('#c62828')} onClick={lockBudget}>Lock Budget</button>
                  )}
                </div>

                <table style={S.tbl}>
                  <thead><tr>
                    <th style={S.th}>Category</th>
                    <th style={{ ...S.th, textAlign:'right' }}>Budget (SAR)</th>
                    <th style={{ ...S.th, textAlign:'right' }}>Actual (SAR)</th>
                    <th style={{ ...S.th, textAlign:'right' }}>Variance</th>
                    <th style={{ ...S.th, textAlign:'center' }}>Health</th>
                    <th style={{ ...S.th, textAlign:'center' }}>Used</th>
                  </tr></thead>
                  <tbody>
                    {BUDGET_ROWS.map(r=>{
                      const bv = +detail[`budget_${r.key}`]||0
                      const av = +detail[`actual_${r.key}`]||0
                      const variance = bv - av
                      const tl = trafficLight(av, bv)
                      return (
                        <tr key={r.key}>
                          <td style={{ ...S.td, fontWeight:600 }}>{r.label}</td>
                          <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace' }}>{SAR(bv)}</td>
                          <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace' }}>{SAR(av)}</td>
                          <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:variance<0?'#c62828':'#2e7d32', fontWeight:700 }}>
                            {variance<0?'':'+'}{SAR(variance)}
                          </td>
                          <td style={{ ...S.td, textAlign:'center' }}>
                            <span style={{ background:tl.bg, color:tl.color, padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700 }}>{tl.label}</span>
                          </td>
                          <td style={{ ...S.td, textAlign:'center' }}>
                            <div style={{ background:'#f0f4f8', borderRadius:20, height:8, overflow:'hidden', width:80, margin:'0 auto' }}>
                              <div style={{ height:'100%', borderRadius:20, background:tl.color, width:bv>0?`${Math.min(100,(av/bv)*100)}%`:'0%' }} />
                            </div>
                            <div style={{ fontSize:10, color:'#6b7c93', marginTop:2 }}>{bv>0?`${Math.round((av/bv)*100)}%`:'—'}</div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:'#f0f4f8', fontWeight:800 }}>
                      <td style={{ ...S.td, fontWeight:800 }}>TOTAL</td>
                      <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', fontWeight:800 }}>{SAR(detail.budget_total||0)}</td>
                      <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', fontWeight:800 }}>{SAR(detail.actual_total||0)}</td>
                      <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', fontWeight:800, color:((detail.budget_total||0)-(detail.actual_total||0))<0?'#c62828':'#2e7d32' }}>
                        {((detail.budget_total||0)-(detail.actual_total||0))<0?'':'+'}
                        {SAR((detail.budget_total||0)-(detail.actual_total||0))}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* ── Tab: COMPLETIONS */}
            {detailTab==='completions' && (
              <CompletionsTab projectId={detail.project_id} smId={detail.sm_id} />
            )}
          </div>
        </div>
      )}
  </div>
  )
}

// ── Completions Sub-Component ────────────────────────────────────
function CompletionsTab({ projectId, smId }) {
  const [completions, setCompletions] = useState([])
  const [loading,     setLoading]     = useState(true)
  const [noTable,     setNoTable]     = useState(false)

  useEffect(() => {
    if (!projectId) { setLoading(false); return }
    supabase.from('site_completions')
      .select('*')
      .eq('project_id', projectId)
      .order('completion_date', { ascending:false })
      .limit(100)
      .then(({ data, error }) => {
        if (error?.code === '42P01') { setNoTable(true) }
        else setCompletions(data||[])
        setLoading(false)
      })
  }, [projectId])

  const CHIP = { PENDING:'#9e9e9e', SIGNED_OFF:'#1565c0', READY_TO_INVOICE:'#2e7d32', INVOICED:'#1a237e', REJECTED:'#c62828' }

  if (loading) return <div style={{ textAlign:'center', padding:30, color:'#6b7c93' }}>Loading…</div>

  if (noTable) return (
    <div style={{ textAlign:'center', padding:40, color:'#e65100', fontSize:13 }}>
      ⚠ Run <strong>PERFECT_FINAL_PATCH.sql</strong> in Supabase first to enable completion tracking.
    </div>
  )

  if (completions.length===0) return (
    <div style={{ textAlign:'center', padding:40, color:'#aab2bd', fontSize:13 }}>
      No completion records for {smId} yet.<br />
      <span style={{ fontSize:11 }}>Add them from the Invoicing module once field sign-off is done.</span>
    </div>
  )

  return (
    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
      <thead><tr>
        {['Date','Description','Qty','Field ✓','PM/DH ✓','Status','Invoice'].map(h=>(
          <th key={h} style={{ background:'#f0f4f8', color:'#6b7c93', padding:'8px 10px', fontWeight:700, textAlign:'left', fontSize:11, borderBottom:'2px solid #e0e7ef' }}>{h}</th>
        ))}
      </tr></thead>
      <tbody>
        {completions.map((c,i)=>(
          <tr key={c.id} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
            <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f4f8' }}>{c.completion_date ? new Date(c.completion_date).toLocaleDateString('en-GB') : '—'}</td>
            <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f4f8', maxWidth:200 }}><div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.description}</div></td>
            <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f4f8' }}>{c.quantity_completed ? `${c.quantity_completed} ${c.unit||''}` : '—'}</td>
            <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f4f8', textAlign:'center' }}>{c.field_signed_off?'✅':'⬜'}</td>
            <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f4f8', textAlign:'center' }}>{(c.pm_confirmed||c.dept_head_confirmed)?'✅':'⬜'}</td>
            <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f4f8' }}>
              <span style={{ background:(CHIP[c.status]||'#9e9e9e')+'18', color:CHIP[c.status]||'#9e9e9e', padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700 }}>
                {(c.status||'').replace(/_/g,' ')}
              </span>
            </td>
            <td style={{ padding:'8px 10px', borderBottom:'1px solid #f0f4f8', fontSize:11, color:'#6b7c93' }}>
              {c.invoice_id ? '✅ Invoiced' : '—'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
