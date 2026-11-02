import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import FormShell from '../components/FormShell'
import { GROUP_COLORS } from '../styles/appStyles'
const MC = GROUP_COLORS.HR
const L3 = '#795338'

/**
 * OutsourceEmployees.jsx  v2
 *
 * CLASSIFICATION:
 *   CON-xxx  Contract person  — engagement < 30 days — DH/Supervisor creates
 *             daily rate · payment via Cash / Daily Expense
 *   OUT-xxx  Outsource person — engagement ≥ 30 days — Admin creates ONLY
 *             monthly rate · payment via Cash or Bank Transfer (never WPS)
 *             photo MANDATORY · Iqama MANDATORY
 *
 * DEPLOYMENT:
 *   Site Assignments is the independent deployment module (managed by PM/Supervisor).
 *   Department + Project on this form = cost allocation only, not deployment.
 *   Department → Project cascade (project filtered by dept).
 *
 * CONVERSION:
 *   DH requests CON → OUT upgrade. Status → CONVERSION_PENDING.
 *   Admin receives notification and creates OUT record, linking back to CON.
 */

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { QRButton } from '../components/QRCard'

// ── Helpers ───────────────────────────────────────────────────────────────────
const SAR    = v => `SAR ${(+v||0).toLocaleString('en',{minimumFractionDigits:0,maximumFractionDigits:0})}`
const fmtDate = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-GB') : '—'
const calcDuration = (s, e) => {
  if (!s || !e) return null
  const diff = Math.ceil((new Date(e) - new Date(s)) / (1000*60*60*24))
  return diff > 0 ? diff : null
}
const classifyByDuration = days => days === null ? null : days < 30 ? 'CON' : 'OUT'

function genToken() { return 'OUT-' + Math.random().toString(36).substring(2,10).toUpperCase() }
function genCONCode(n) { return `CON-${String(n+1).padStart(4,'0')}` }
function genOUTCode(n) { return `OUT-${String(n+1).padStart(4,'0')}` }

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  inp:   { width:'100%', padding:'9px 11px', borderRadius:4, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:'Poppins,sans-serif', boxSizing:'border-box', background:'#fff' },
  label: { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4, textTransform:'uppercase', letterSpacing:0.5, fontFamily:'Poppins,sans-serif' },
  row:   { display:'flex', gap:12, marginBottom:13, flexWrap:'wrap' },
  col:   { flex:1, minWidth:130 },
  sec:   { fontSize:11, fontWeight:800, color:L3, marginBottom:8, marginTop:4, paddingBottom:4, borderBottom:'1px solid #e8ddd6', letterSpacing:1, textTransform:'uppercase' },
  btn:   (c=L3, outline=false) => ({ background:outline?'transparent':c, color:outline?c:'#fff', border:outline?`2px solid ${c}`:'none', borderRadius:4, padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Poppins,sans-serif' }),
  badge: (bg,cl) => ({ background:bg, color:cl, borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:800, display:'inline-block' }),
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modal:  { background:'#fff', borderRadius:4, padding:28, width:820, maxWidth:'100%', maxHeight:'93vh', overflowY:'auto', boxShadow:'0 12px 48px rgba(0,0,0,0.22)' },
  tbl:    { width:'100%', borderCollapse:'collapse', fontSize:12 },
  th:     { background:L3, color:'#fff', padding:'9px 10px', fontWeight:700, textAlign:'left', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 },
  td:     { padding:'9px 10px', borderBottom:'1px solid #f0f4f8', color:'#1a2e3d', verticalAlign:'middle' },
}

const TRADES = [
  'Fiber Splicer','UTP Technician','Power Technician','Civil Worker','Excavation',
  'Compaction','Steel Structuring','Fencing','Concrete','Transportation',
  'Logistics','Turnkey','Tower Erection','Shelter / Power','Survey',
  'Rigger','Welder','Driver','Security Guard','General Labor','Other',
]
const NATIONALITIES = [
  'Saudi Arabian','Indian','Pakistani','Bangladeshi','Egyptian','Filipino',
  'Indonesian','Yemeni','Syrian','Jordanian','Nepali','Sri Lankan',
  'Ethiopian','Moroccan','Turkish','Other',
]

// ── Type badge ────────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  if (!type) return null
  const isCON = type === 'CON'
  return (
    <span style={{
      padding:'2px 8px', borderRadius:4, fontSize:10, fontWeight:800,
      background: isCON ? '#fff8e1' : '#e8f5e9',
      color:       isCON ? '#f57f17' : '#2e7d32',
      border: `1px solid ${isCON ? '#ffe082' : '#a5d6a7'}`,
    }}>{isCON ? '📋 CON' : '✓ OUT'}</span>
  )
}

// ── Person Detail Modal ───────────────────────────────────────────────────────
function PersonDetail({ person, projects, depts, onClose, onRefresh }) {
  const [saving,      setSaving]      = useState(false)
  const [convReason,  setConvReason]  = useState('')
  const [showConvForm,setShowConvForm]= useState(false)

  const isCON     = person.person_type === 'CON'
  const deptName  = depts.find(d=>d.id===person.dept_id)?.dept_code || depts.find(d=>d.id===person.dept_id)?.dept_name || '—'
  const projName  = projects.find(p=>p.id===person.project_id)?.project_name || '—'

  async function endEngagement() {
    if (!activeEng || !confirm('End active engagement?')) return
    await supabase.from('outsource_engagements').update({ status:'COMPLETED', end_date:new Date().toISOString().split('T')[0] }).eq('id',activeEng.id)
    await supabase.from('outsource_persons').update({ is_active:false }).eq('id',person.id)
    onRefresh()
  }
  async function requestConversion() {
    if (!convReason.trim()) { alert('Please enter a reason for the upgrade request'); return }
    // Note: conversion_status column must exist in DB before this update will work.
    // Run: ALTER TABLE outsource_persons ADD COLUMN IF NOT EXISTS conversion_status text, ADD COLUMN IF NOT EXISTS conversion_reason text, ADD COLUMN IF NOT EXISTS conversion_requested_at timestamptz;
    const { error } = await supabase.from('outsource_persons').update({
      conversion_status:'PENDING',
      conversion_reason: convReason.trim(),
      conversion_requested_at: new Date().toISOString(),
    }).eq('id',person.id)
    if (error) { alert('Could not save — please run the outsource_persons schema patch first.\n\n' + error.message); return }
    setShowConvForm(false)
    alert('Upgrade request sent to Admin. The person will remain as CON until Admin approves and creates the OUT record.')
    onRefresh()
  }

  return (
    <>
      <div style={S.overlay} onClick={onClose}>
        <div style={{ ...S.modal, width:820 }} onClick={e=>e.stopPropagation()}>

          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ fontSize:18, fontWeight:900, color:'#1a2332' }}>{person.full_name_en}</div>
                <TypeBadge type={person.person_type} />
                <span style={S.badge(person.is_active?'#e8f5e9':'#f5f5f5', person.is_active?'#2e7d32':'#9e9e9e')}>
                  {person.is_active ? '● ACTIVE' : '○ INACTIVE'}
                </span>
                {person.conversion_status==='PENDING' && (
                  <span style={S.badge('#fff8e1','#f57f17')}>⏳ UPGRADE PENDING</span>
                )}
              </div>
              <div style={{ fontSize:12, color:'#6b7c93', marginTop:4 }}>
                {person.person_code} · {person.trade||'—'} · {person.nationality||'—'}
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {person.qr_token && <QRButton token={person.qr_token} name={person.full_name_en} sub={`${person.trade||'Outsource'} · ${person.person_code}`} type="employee" />}
              <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#aab2bd' }}>✕</button>
            </div>
          </div>

          {/* ── Tab: Info ── */}
          <div>
              {/* Classification banner */}
              <div style={{ background: isCON?'#fff8e1':'#e8f5e9', border:`1px solid ${isCON?'#ffe082':'#a5d6a7'}`, borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:12, color: isCON?'#f57f17':'#2e7d32' }}>
                {isCON
                  ? '📋 Contract person (CON) — engaged for less than 30 days · Payment via Cash / Daily Expense'
                  : '✓ Outsource employee (OUT) — permanent engagement · Payment via Cash or Bank Transfer (not WPS)'}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 24px', marginBottom:12 }}>
                {[
                  ['Person Code',     person.person_code],
                  ['Type',            isCON ? 'Contract (CON)' : 'Outsource (OUT)'],
                  ['Trade / Skill',   person.trade],
                  ['Nationality',     person.nationality],
                  ['Department',      deptName],
                  ['Project',         projName],
                  ['Start Date',      fmtDate(person.start_date)],
                  ['Expected End',    fmtDate(person.end_date)],
                  ['Rate',            isCON
                    ? (person.daily_rate ? `${SAR(person.daily_rate)} / day` : '—')
                    : (person.monthly_rate ? `${SAR(person.monthly_rate)} / month` : '—')],
                  ['Payment Channel', person.payment_channel || '—'],
                  ['Iqama Number',    person.iqama_number],
                  ['Iqama Expiry',    fmtDate(person.iqama_expiry)],
                  ['Mobile',          person.mobile_number],
                  ['Emergency Contact', person.emergency_contact],
                  ['Notes',           person.notes],
                ].filter(([,v])=>v).map(([l,v]) => (
                  <div key={l} style={{ marginBottom:6 }}>
                    <div style={{ fontSize:10, color:'#9e9e9e', fontWeight:700, letterSpacing:0.5 }}>{l}</div>
                    <div style={{ fontSize:13, color:'#1a2332' }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* CON → OUT Conversion request */}
              {isCON && person.conversion_status !== 'PENDING' && (
                <div style={{ marginTop:14, background:'#e3f2fd', borderRadius:8, padding:'12px 14px', border:'1px solid #90caf9' }}>
                  <div style={{ fontWeight:700, fontSize:12, color:'#1565c0', marginBottom:6 }}>
                    Extend as Permanent Outsource Employee?
                  </div>
                  <div style={{ fontSize:11, color:'#1976d2', marginBottom:10 }}>
                    If the engagement exceeds 30 days, the DH can request Admin to upgrade this person to OUT status.
                    Admin will create the OUT record with mandatory photo and Iqama.
                  </div>
                  {!showConvForm ? (
                    <button style={{ ...S.btn('#1565c0'), fontSize:12, padding:'6px 14px' }} onClick={()=>setShowConvForm(true)}>
                      Request Permanent Registration (CON → OUT)
                    </button>
                  ) : (
                    <div>
                      <label style={S.label}>Reason for upgrade request *</label>
                      <textarea
                        style={{ ...S.inp, minHeight:54, resize:'vertical', marginBottom:8 }}
                        value={convReason}
                        onChange={e=>setConvReason(e.target.value)}
                        placeholder="Explain why permanent registration is needed (extended project, specialised skill, etc.)…"
                      />
                      <div style={{ display:'flex', gap:8 }}>
                        <button style={{ ...S.btn('#1565c0'), fontSize:12, padding:'6px 14px' }} onClick={requestConversion}>Send Request to Admin</button>
                        <button style={{ ...S.btn('#6b7c93',true), fontSize:12, padding:'6px 14px' }} onClick={()=>setShowConvForm(false)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {person.conversion_status === 'PENDING' && (
                <div style={{ marginTop:14, background:'#fff3e0', borderRadius:8, padding:'12px 14px', border:'1px solid #ffcc02', fontSize:12, color:'#e65100' }}>
                  ⏳ <strong>Upgrade request pending Admin approval.</strong> Requested: {fmtDate(person.conversion_requested_at?.split('T')[0])}<br />
                  Reason: {person.conversion_reason}
                </div>
              )}

            </div>


        </div>
      </div>
    </>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
const TODAY = new Date().toISOString().slice(0,10)

const EMPTY_FORM = {
  // Step 1 — Person Details
  full_name_en:'', full_name_ar:'', trade:'', nationality:'',
  // Step 2 — Deployment & Duration
  dept_id:'', project_id:'',
  start_date: TODAY, end_date:'',
  daily_rate:'', monthly_rate:'',
  payment_channel:'CASH',
  scope:'',
  // Step 3 — ID & Contact (OUT: mandatory; CON: optional)
  iqama_number:'', iqama_expiry:'',
  mobile_number:'', emergency_contact:'',
  notes:'',
}

export default function OutsourceEmployees({ entityId, entityCode }) {
  const [persons,      setPersons]     = useState([])
  const [engMap,       setEngMap]      = useState({})
  const [selected,     setSelected]    = useState(null)
  const [showBanner,   setShowBanner]  = useState(false)
  const [showAdd,      setShowAdd]     = useState(false)
  const [wizardStep,   setWizardStep]  = useState(1)
  const [newForm,      setNewForm]     = useState(EMPTY_FORM)
  const [search,       setSearch]      = useState('')
  const [filterStatus, setFilterStatus]= useState('ALL')
  const [filterType,   setFilterType]  = useState('ALL') // ALL | CON | OUT
  const [projects,     setProjects]    = useState([])
  const [depts,        setDepts]       = useState([])
  const [saving,       setSaving]      = useState(false)
  const [loading,      setLoading]     = useState(true)

  useEffect(()=>{ if(entityId){ load(); loadRefData() } },[entityId])

  async function load() {
    setLoading(true)
    const { data: pList } = await supabase.from('outsource_persons').select('*').eq('entity_id',entityId).order('created_at',{ascending:false})
    const { data: eList } = await supabase.from('outsource_engagements').select('*, projects(project_name), departments(dept_name,name)').eq('entity_id',entityId).order('created_at',{ascending:false})
    const map = {}
    ;(eList||[]).forEach(e=>{ if(!map[e.person_id]) map[e.person_id]=[]; map[e.person_id].push(e) })
    setPersons(pList||[]); setEngMap(map); setLoading(false)
  }

  async function loadRefData() {
    const [{ data:prj },{ data:dep }] = await Promise.all([
      supabase.from('projects').select('id,project_number,project_name,department_id').eq('entity_id',entityId).order('project_number'),
      supabase.from('departments').select('id,dept_name,dept_code').eq('entity_id',entityId).order('dept_name'),
    ])
    setProjects(prj||[]); setDepts(dep||[])
  }

  // Derived state for wizard
  const nf = newForm
  const duration   = calcDuration(nf.start_date, nf.end_date)
  const personType = classifyByDuration(duration)

  // Projects filtered by selected dept
  const deptProjects = nf.dept_id
    ? projects.filter(p => p.department_id === nf.dept_id)
    : projects

  function set(k) { return e => setNewForm(f=>({...f,[k]:e.target.value})) }
  function setVal(k,v) { setNewForm(f=>({...f,[k]:v})) }

  async function saveNewPerson() {
    // Validation
    if (!nf.full_name_en.trim())  return alert('Full name is required')
    if (!nf.trade)                return alert('Trade / skill is required')
    if (!nf.dept_id)              return alert('Department is required')
    if (!nf.project_id)           return alert('Project is required')
    if (!nf.start_date)           return alert('Start date is required')
    if (!nf.end_date)             return alert('Expected end date is required')
    if (!personType)              return alert('Duration must be positive')
    if (personType === 'OUT') {
      if (!nf.iqama_number.trim()) return alert('Iqama number is mandatory for Outsource (OUT) employees')
      if (!nf.iqama_expiry)        return alert('Iqama expiry is mandatory for Outsource (OUT) employees')
    }

    setSaving(true)
    // Count existing by type to generate correct code
    const { count: conCount } = await supabase.from('outsource_persons').select('*',{count:'exact',head:true}).eq('entity_id',entityId).eq('person_type','CON')
    const { count: outCount } = await supabase.from('outsource_persons').select('*',{count:'exact',head:true}).eq('entity_id',entityId).eq('person_type','OUT')
    const personCode = personType === 'CON' ? genCONCode(conCount||0) : genOUTCode(outCount||0)

    const { data: newPerson, error } = await supabase.from('outsource_persons').insert({
      entity_id:         entityId,
      person_code:       personCode,
      person_type:       personType,
      full_name_en:      nf.full_name_en.trim(),
      full_name_ar:      nf.full_name_ar||null,
      trade:             nf.trade,
      nationality:       nf.nationality||null,
      dept_id:           nf.dept_id||null,
      project_id:        nf.project_id||null,
      start_date:        nf.start_date,
      end_date:          nf.end_date||null,
      daily_rate:        personType==='CON' && nf.daily_rate   ? +nf.daily_rate   : null,
      monthly_rate:      personType==='OUT' && nf.monthly_rate ? +nf.monthly_rate : null,
      payment_channel:   nf.payment_channel,
      iqama_number:      nf.iqama_number||null,
      iqama_expiry:      nf.iqama_expiry||null,
      mobile_number:     nf.mobile_number||null,
      emergency_contact: nf.emergency_contact||null,
      notes:             nf.notes||null,
      qr_token:          genToken(),
      is_active:         true,
    }).select().single()

    if (error) { alert(error.message); setSaving(false); return }

    // Create initial engagement record
    const { count: engTotal } = await supabase.from('outsource_engagements').select('*',{count:'exact',head:true}).eq('entity_id',entityId)
    await supabase.from('outsource_engagements').insert({
      entity_id:         entityId,
      person_id:         newPerson.id,
      engagement_number: `OE-${String((engTotal||0)+1).padStart(4,'0')}`,
      department_id:     nf.dept_id||null,
      project_id:        nf.project_id||null,
      start_date:        nf.start_date,
      end_date:          nf.end_date||null,
      rate_type:         personType==='CON' ? 'DAILY' : 'MONTHLY',
      daily_rate:        personType==='CON' && nf.daily_rate   ? +nf.daily_rate   : null,
      package_amount:    personType==='OUT' && nf.monthly_rate ? +nf.monthly_rate : null,
      scope:             nf.scope||null,
      status:            'ACTIVE',
    })

    setSaving(false); setShowAdd(false); setWizardStep(1); setNewForm(EMPTY_FORM); load()
  }

  function openPerson(p) { setSelected(p) }

  const filtered = useMemo(()=>{
    return persons.filter(p=>{
      const q = search.toLowerCase()
      const matchS = !q || p.full_name_en?.toLowerCase().includes(q) || p.person_code?.toLowerCase().includes(q) || p.trade?.toLowerCase().includes(q)
      const matchSt = filterStatus==='ALL' || (filterStatus==='ACTIVE'&&p.is_active) || (filterStatus==='INACTIVE'&&!p.is_active)
      const matchTp = filterType==='ALL' || p.person_type===filterType
      return matchS && matchSt && matchTp
    })
  },[persons,search,filterStatus,filterType])

  const totalCON      = persons.filter(p=>p.person_type==='CON').length
  const totalOUT      = persons.filter(p=>p.person_type==='OUT').length
  const totalActive   = persons.filter(p=>p.is_active).length
  const pendingConv   = persons.filter(p=>p.conversion_status==='PENDING').length  // 0 until DB column added

  // ── Colorful KPI cards ────────────────────────────────────────────────────
  const kpiCards = [
    { label:'Total Persons',      value: persons.length,  bg:'linear-gradient(135deg,#795338,#a07050)', icon:'👷' },
    { label:'Contract (CON)',     value: totalCON,         bg:'linear-gradient(135deg,#f57f17,#ffa726)', icon:'📋' },
    { label:'Outsource (OUT)',    value: totalOUT,         bg:'linear-gradient(135deg,#2e7d32,#43a047)', icon:'✅' },
    { label:'Active Now',         value: totalActive,      bg:'linear-gradient(135deg,#1565c0,#1e88e5)', icon:'🟢' },
    ...(pendingConv>0 ? [{ label:'Pending Upgrade',value:pendingConv,bg:'linear-gradient(135deg,#e65100,#f4511e)',icon:'⏳' }] : []),
  ]

  // ── Grid for list ─────────────────────────────────────────────────────────
  const GRID = '100px 1fr 80px 110px 120px 110px 130px 52px'

  return (
    <div>
      {/* ── Sticky header ── */}
      <div style={{ position:'sticky', top:0, zIndex:10, background:'#f0f4f8', paddingTop:16, paddingBottom:4 }}>

        {/* Toolbar */}
        <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
          <input style={{ ...S.inp, maxWidth:260, padding:'8px 12px' }} placeholder="🔍 Search name, code, trade…" value={search} onChange={e=>setSearch(e.target.value)} />
          {['ALL','ACTIVE','INACTIVE'].map(s=>(
            <button key={s} onClick={()=>setFilterStatus(s)} style={{ background:filterStatus===s?L3:'#fff', color:filterStatus===s?'#fff':'#6b7c93', border:filterStatus===s?'none':'1px solid #dde3ec', borderRadius:7, padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Poppins,sans-serif' }}>{s}</button>
          ))}
          <div style={{ width:1, height:22, background:'#dde3ec' }} />
          {['ALL','CON','OUT'].map(t=>(
            <button key={t} onClick={()=>setFilterType(t)} style={{ background:filterType===t?(t==='CON'?'#f57f17':t==='OUT'?'#2e7d32':L3):'#fff', color:filterType===t?'#fff':'#6b7c93', border:filterType===t?'none':'1px solid #dde3ec', borderRadius:7, padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'Poppins,sans-serif' }}>{t==='ALL'?'All Types':t}</button>
          ))}
          <div style={{ marginLeft:'auto' }}>
            <button style={S.btn()} onClick={()=>setShowBanner(true)}>＋ Add Person</button>
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ display:'flex', gap:12, marginBottom:14, flexWrap:'nowrap', overflowX:'auto', paddingBottom:2 }}>
          {kpiCards.map(c=>(
            <div key={c.label} style={{ flex:1, minWidth:140, borderRadius:12, padding:'14px 16px', background:c.bg, boxShadow:'0 4px 14px rgba(0,0,0,0.14)', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ fontSize:26, filter:'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>{c.icon}</div>
              <div>
                <div style={{ fontSize:20, fontWeight:900, color:'#fff', lineHeight:1 }}>{c.value}</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.8)', marginTop:3, fontWeight:600 }}>{c.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Column headers */}
        <div style={{ display:'grid', gridTemplateColumns:GRID, gap:'0 10px', background:L3, padding:'9px 14px', fontSize:11, fontWeight:700, color:'#fff', textTransform:'uppercase', letterSpacing:0.5, borderRadius:'6px 6px 0 0' }}>
          {['Code','Full Name','Type','Trade','Department','Status','Project','QR'].map(h=><div key={h}>{h}</div>)}
        </div>
      </div>

      {/* ── List ── */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'#aab2bd' }}>{persons.length===0?'No persons yet — click Add Person to start':'No results'}</div>
      ) : (
        <div style={{ background:'#fff' }}>
          {filtered.map((p,i)=>{
            const pEngs  = engMap[p.id]||[]
            const active = pEngs.find(e=>e.status==='ACTIVE')
            const dept   = depts.find(d=>d.id===p.dept_id)
            const proj   = projects.find(pr=>pr.id===p.project_id)
            const isPending = p.conversion_status==='PENDING'
            return (
              <div key={p.id} onClick={()=>openPerson(p)}
                style={{ display:'grid', gridTemplateColumns:GRID, gap:'0 10px', padding:'10px 14px', borderBottom:'1px solid #f0f4f8', alignItems:'center', cursor:'pointer', background: isPending?'#fffde7':i%2===0?'#fff':'#fafbfc' }}
                onMouseEnter={e=>e.currentTarget.style.background='#f8fafd'}
                onMouseLeave={e=>e.currentTarget.style.background=isPending?'#fffde7':i%2===0?'#fff':'#fafbfc'}
              >
                <div style={{ fontFamily:'monospace', fontSize:11, color:'#6b7c93' }}>{p.person_code}</div>
                <div>
                  <div style={{ fontWeight:700, fontSize:13, color:'#1a2332' }}>{p.full_name_en}</div>
                  {p.full_name_ar && <div style={{ fontSize:10, color:'#6b7c93', direction:'rtl' }}>{p.full_name_ar}</div>}
                </div>
                <div><TypeBadge type={p.person_type} /></div>
                <div style={{ fontSize:12 }}>{p.trade||'—'}</div>
                <div style={{ fontSize:11, fontWeight:700, color:L3 }}>{dept?.dept_code||dept?.dept_name||'—'}</div>
                <div>
                  <span style={S.badge(p.is_active?'#e8f5e9':'#f5f5f5',p.is_active?'#2e7d32':'#9e9e9e')}>
                    {p.is_active?'● ACTIVE':'○ INACTIVE'}
                  </span>
                  {isPending && <div style={{ fontSize:9, color:'#f57f17', fontWeight:700, marginTop:2 }}>⏳ Upgrade pending</div>}
                </div>
                <div style={{ fontSize:11, color:'#546e7a' }}>{proj?.project_name||'—'}</div>
                <div onClick={e=>e.stopPropagation()}>
                  {p.qr_token && <QRButton token={p.qr_token} name={p.full_name_en} sub={`${p.trade||''} · ${p.person_code}`} type="employee" size="sm" />}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Page Banner ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={()=>setShowBanner(false)}
        onStart={()=>{ setShowBanner(false); setWizardStep(1); setNewForm(EMPTY_FORM); setShowAdd(true) }}
        chapterName="HR"
        formTitle={['Add','Contract','Employee']}
        heading="Register a contract or outsource employee"
        iconLabel="Contract Employees"
        workflowSteps={['Person Details','Deployment & Duration','ID & Contact']}
        description="Enter the person's details, then set the engagement period. Duration under 30 days = Contract (CON). 30 days or more = Outsource (OUT) — Admin will be notified."
      />

      {/* ── Add Person Wizard ── */}
      <FormShell
        isOpen={showAdd}
        onClose={()=>{ setShowAdd(false); setWizardStep(1) }}
        chapterName="HR"
        title={['Add','Contract','Employee']}
        steps={['Person Details','Deployment & Duration','ID & Contact']}
        currentStep={wizardStep}
        onBack={()=> wizardStep===1 ? (setShowAdd(false),setWizardStep(1)) : setWizardStep(s=>s-1)}
        backLabel={wizardStep===1?'Cancel':'Back'}
        onNext={
          wizardStep===1 ? ()=>{
            if(!nf.full_name_en.trim()){ alert('Full name is required'); return }
            if(!nf.trade){ alert('Trade / skill is required'); return }
            setWizardStep(2)
          } :
          wizardStep===2 ? ()=>{
            if(!nf.dept_id){ alert('Department is required'); return }
            if(!nf.project_id){ alert('Project is required'); return }
            if(!nf.start_date){ alert('Start date is required'); return }
            if(!nf.end_date){ alert('Expected end date is required'); return }
            if(!duration || duration<=0){ alert('End date must be after start date'); return }
            setWizardStep(3)
          } : saveNewPerson
        }
        nextLabel={wizardStep<3 ? 'Next →' : (saving?'Saving…':'Save Person')}
        nextDisabled={saving}
      >

        {/* ── STEP 1: Person Details ── */}
        {wizardStep === 1 && (
          <div>
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>Full Name (English) *</label>
                <input style={S.inp} value={nf.full_name_en} onChange={set('full_name_en')} placeholder="As on ID / Iqama" />
              </div>
              <div style={S.col}>
                <label style={S.label}>Full Name (Arabic)</label>
                <input style={S.inp} value={nf.full_name_ar} onChange={set('full_name_ar')} dir="rtl" />
              </div>
            </div>
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>Trade / Skill *</label>
                <select style={S.inp} value={nf.trade} onChange={set('trade')}>
                  <option value="">— Select —</option>
                  {TRADES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={S.col}>
                <label style={S.label}>Nationality</label>
                <select style={S.inp} value={nf.nationality} onChange={set('nationality')}>
                  <option value="">— Select —</option>
                  {NATIONALITIES.map(n=><option key={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div style={{ background:'#F7F2ED', borderRadius:6, padding:'10px 14px', fontSize:12, color:'#5a3f32' }}>
              💡 This creates a <strong>permanent record</strong>. The QR code is generated once and never changes. Classification (CON or OUT) is determined by duration — set in Step 2.
            </div>
          </div>
        )}

        {/* ── STEP 2: Deployment & Duration ── */}
        {wizardStep === 2 && (
          <div>
            {/* Dept → Project cascade */}
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>Department *</label>
                <select style={S.inp} value={nf.dept_id} onChange={e=>{ setVal('dept_id',e.target.value); setVal('project_id','') }}>
                  <option value="">— Select Department —</option>
                  {depts.map(d=><option key={d.id} value={d.id}>{d.dept_code||d.dept_name}</option>)}
                </select>
              </div>
              <div style={S.col}>
                <label style={S.label}>Project * {nf.dept_id && deptProjects.length===0 && <span style={{ color:'#e65100', fontWeight:400 }}>— no projects for this dept</span>}</label>
                <select style={S.inp} value={nf.project_id} onChange={set('project_id')} disabled={!nf.dept_id}>
                  <option value="">— Select Project —</option>
                  {deptProjects.map(p=><option key={p.id} value={p.id}>{p.project_number}</option>)}
                </select>
              </div>
            </div>

            {/* Dates */}
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>Start Date *</label>
                <input type="date" style={S.inp} value={nf.start_date} onChange={set('start_date')} />
              </div>
              <div style={S.col}>
                <label style={S.label}>Expected Release Date *</label>
                <input type="date" style={S.inp} value={nf.end_date} onChange={set('end_date')} min={nf.start_date} />
              </div>
            </div>

            {/* Duration & Classification */}
            {duration !== null && (
              <div style={{ background: personType==='CON'?'#fff8e1':'#e8f5e9', border:`1px solid ${personType==='CON'?'#ffe082':'#a5d6a7'}`, borderRadius:8, padding:'12px 16px', marginBottom:13, display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ fontSize:28 }}>{personType==='CON'?'📋':'✅'}</div>
                <div>
                  <div style={{ fontWeight:800, fontSize:13, color:personType==='CON'?'#f57f17':'#2e7d32' }}>
                    {personType==='CON' ? `Contract Employee (CON) — ${duration} days` : `Outsource Employee (OUT) — ${duration} days`}
                  </div>
                  <div style={{ fontSize:11, color:'#6b7c93', marginTop:2 }}>
                    {personType==='CON'
                      ? 'Under 30 days · Daily rate · Payment via Cash / Daily Expense · Iqama optional'
                      : '30 days or more · Monthly rate · Payment via Cash or Bank Transfer · Iqama MANDATORY'}
                  </div>
                </div>
              </div>
            )}

            {/* Rate */}
            <div style={S.row}>
              {(personType==='CON'||!personType) && (
                <div style={S.col}>
                  <label style={S.label}>Daily Rate (SAR)</label>
                  <input type="number" style={S.inp} value={nf.daily_rate} onChange={set('daily_rate')} placeholder="0" />
                </div>
              )}
              {personType==='OUT' && (
                <div style={S.col}>
                  <label style={S.label}>Monthly Rate (SAR)</label>
                  <input type="number" style={S.inp} value={nf.monthly_rate} onChange={set('monthly_rate')} placeholder="0" />
                </div>
              )}
              <div style={S.col}>
                <label style={S.label}>Payment Channel</label>
                <select style={S.inp} value={nf.payment_channel} onChange={set('payment_channel')}>
                  <option value="CASH">Cash / Daily Expense</option>
                  {personType==='OUT' && <option value="BANK_TRANSFER">Bank Transfer</option>}
                </select>
                {personType==='OUT' && (
                  <div style={{ fontSize:10, color:'#e65100', marginTop:3 }}>⚠ WPS does not apply to outsource employees</div>
                )}
              </div>
            </div>

            <div>
              <label style={S.label}>Scope of Work</label>
              <textarea style={{ ...S.inp, minHeight:50, resize:'vertical' }} value={nf.scope} onChange={set('scope')} placeholder="Brief description of the work…" />
            </div>
          </div>
        )}

        {/* ── STEP 3: ID & Contact ── */}
        {wizardStep === 3 && (
          <div>
            {/* Classification reminder */}
            <div style={{ background: personType==='CON'?'#fff8e1':'#e8f5e9', borderRadius:6, padding:'9px 13px', fontSize:11, color:personType==='CON'?'#f57f17':'#2e7d32', marginBottom:14, fontWeight:600 }}>
              {personType==='CON'
                ? '📋 Contract (CON) — Iqama and photo are optional but recommended'
                : '✅ Outsource (OUT) — Iqama number, Iqama expiry are MANDATORY before saving'}
            </div>

            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>Iqama / ID Number {personType==='OUT'&&'*'}</label>
                <input style={{ ...S.inp, borderColor:personType==='OUT'&&!nf.iqama_number?'#e65100':undefined }} value={nf.iqama_number} onChange={set('iqama_number')} />
              </div>
              <div style={S.col}>
                <label style={S.label}>Iqama Expiry {personType==='OUT'&&'*'}</label>
                <input type="date" style={{ ...S.inp, borderColor:personType==='OUT'&&!nf.iqama_expiry?'#e65100':undefined }} value={nf.iqama_expiry} onChange={set('iqama_expiry')} />
              </div>
            </div>
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>Mobile Number</label>
                <input style={S.inp} value={nf.mobile_number} onChange={set('mobile_number')} />
              </div>
              <div style={S.col}>
                <label style={S.label}>Emergency Contact</label>
                <input style={S.inp} value={nf.emergency_contact} onChange={set('emergency_contact')} />
              </div>
            </div>
            <div>
              <label style={S.label}>Notes</label>
              <textarea style={{ ...S.inp, minHeight:56, resize:'vertical' }} value={nf.notes} onChange={set('notes')} />
            </div>
          </div>
        )}

      </FormShell>

      {/* ── Person Detail Modal ── */}
      {selected && (
        <PersonDetail
          person={selected}
          projects={projects}
          depts={depts}
          onClose={()=>setSelected(null)}
          onRefresh={()=>{ load(); setSelected(null) }}
        />
      )}
    </div>
  )
}
