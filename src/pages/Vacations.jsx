import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, CHAPTER_PALETTES } from '../styles/appStyles'
const MC = GROUP_COLORS.HR    // HR chapter (Ch08) = #795338
const L1 = CHAPTER_PALETTES.HR.L1   // '#BCA99A'
const L2 = CHAPTER_PALETTES.HR.L2   // '#F7F2ED'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════════════
// Leave / Vacations Management — HR Chapter
// Features:
//   • Saudi working day calculator (excludes Fri + Sat)
//   • days_requested correctly written to DB on save
//   • Leave balance deduction / restoration on approve / reject / cancel
//   • Overstay levy: SAR 800 per 30-day period
//   • Filter by employee, type, status, department, month
//   • Excel export
//   • ChapterPage + PageBanner HR palette
// ═══════════════════════════════════════════════════════════════════════════

const fmt   = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'
const TODAY = new Date().toISOString().slice(0,10)
const POPPINS = "'Poppins','Inter',system-ui,sans-serif"

// Saudi working days: Mon–Thu + Sun (skip Fri=5, Sat=6)
function saudiWorkingDays(start, end) {
  if (!start || !end) return 0
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end   + 'T00:00:00')
  if (e < s) return 0
  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    const day = cur.getDay()   // 0=Sun,1=Mon,...,5=Fri,6=Sat
    if (day !== 5 && day !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

// Calendar days (inclusive) — used for SICK / EMERGENCY / ANNUAL (full days)
function calendarDays(start, end) {
  if (!start || !end) return 0
  const diff = (new Date(end+'T00:00:00') - new Date(start+'T00:00:00')) / 86400000
  return Math.max(0, Math.round(diff) + 1)
}

const LEAVE_TYPES = [
  { value:'ANNUAL',    label:'Annual Leave',       color:'#1565C0', useCalendar:true },
  { value:'EMERGENCY', label:'Emergency',           color:'#e65100', useCalendar:true },
  { value:'SICK',      label:'Sick (short)',        color:'#6a1b9a', useCalendar:true },
  { value:'SICK_MAJOR',label:'Sick (major — 4 months)', color:'#c62828', useCalendar:true },
  { value:'UNPAID',    label:'Unpaid',              color:'#546e7a', useCalendar:false },
  { value:'HAJJ',      label:'Hajj (once)',         color:'#2e7d32', useCalendar:true },
  { value:'MATERNITY', label:'Maternity',           color:'#ad1457', useCalendar:true },
]
const TYPE_MAP = Object.fromEntries(LEAVE_TYPES.map(t => [t.value, t]))

const STATUS_CFG = {
  PENDING:   { label:'Pending',   bg:'#fff3e0', color:'#e65100' },
  APPROVED:  { label:'Approved',  bg:'#e8f5e9', color:'#2e7d32' },
  REJECTED:  { label:'Rejected',  bg:'#ffebee', color:'#c62828' },
  CANCELLED: { label:'Cancelled', bg:'#eceff1', color:'#546e7a' },
}

// Balance field that each leave type touches
const BAL_FIELD = {
  ANNUAL:     'annual_leave_bal',
  EMERGENCY:  'emergency_leave_bal',
  SICK:       null,
  SICK_MAJOR: null,
  UNPAID:     null,
  HAJJ:       null,
  MATERNITY:  null,
}

function computeDays(lt, start, end) {
  const cfg = TYPE_MAP[lt]
  if (!cfg) return calendarDays(start, end)
  return cfg.useCalendar ? calendarDays(start, end) : saudiWorkingDays(start, end)
}

const S = {
  card:    { background:'#fff', borderRadius:14, padding:'18px 22px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:14 },
  btn:     (c=MC) => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:POPPINS }),
  btnSm:   (c=MC) => ({ background:c, color:'#fff', border:'none', borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:POPPINS }),
  inp:     { width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:POPPINS },
  label:   { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4, fontFamily:POPPINS, letterSpacing:0.3, textTransform:'uppercase' },
  row:     { display:'flex', gap:12, marginBottom:14 },
  col:     { flex:1 },
  th:      { background:MC, color:'#fff', padding:'9px 10px', fontWeight:800, textAlign:'left', fontSize:10, letterSpacing:0.5, textTransform:'uppercase', fontFamily:POPPINS },
  td:      { padding:'8px 10px', borderBottom:'1px solid #f0f4f8', color:'#1a2e3d', verticalAlign:'middle', fontSize:12, fontFamily:POPPINS },
  chip:    (bg,cl) => ({ display:'inline-block', padding:'2px 10px', borderRadius:20, fontSize:10, fontWeight:800, background:bg, color:cl, fontFamily:POPPINS }),
  overlay: { position:'fixed', inset:0, background:'rgba(15,15,35,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modal:   { background:'#fff', borderRadius:18, width:580, maxWidth:'calc(100vw-32px)', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 28px 64px rgba(0,0,0,0.25)', fontFamily:POPPINS },
}

const EMPTY_FORM = { employee_id:'', leave_type:'ANNUAL', start_date:TODAY, end_date:TODAY, notes:'', return_date:'' }

export default function Vacations({ entityId, role }) {
  const [leaves,       setLeaves]       = useState([])
  const [employees,    setEmps]         = useState([])
  const [departments,  setDepts]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showBanner,   setShowBanner]   = useState(false)
  const [showForm,     setShowForm]     = useState(false)
  const [editItem,     setEditItem]     = useState(null)
  const [form,         setForm]         = useState(EMPTY_FORM)
  const [saving,       setSaving]       = useState(false)
  const [filter,       setFilter]       = useState({ type:'', status:'', dept:'', month:'' })
  const [search,       setSearch]       = useState('')
  const [confirmId,    setConfirmId]    = useState(null) // cancel confirm

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const [{ data:l }, { data:e }] = await Promise.all([
      supabase.from('vacations')
        .select('*')
        .eq('entity_id', entityId)
        .order('start_date', { ascending:false })
        .limit(500),
      supabase.from('employees')
        .select('id, full_name, full_name_en, department, annual_leave_bal, emergency_leave_bal, join_date')
        .eq('entity_id', entityId)
        .eq('is_active', true)
        .order('full_name')
        .limit(500),
    ])
    setLeaves(l || [])
    setEmps(e || [])
    const depts = [...new Set((e || []).map(emp => emp.department).filter(Boolean))].sort()
    setDepts(depts)
    setLoading(false)
  }

  // ── Computed days for the current form ───────────────────────────────────
  const formDays = computeDays(form.leave_type, form.start_date, form.end_date)

  // ── Helpers ──────────────────────────────────────────────────────────────
  function fv(k, v) { setForm(p => ({ ...p, [k]:v })) }

  function openNew() {
    setEditItem(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  function openEdit(l) {
    setEditItem(l)
    setForm({
      employee_id: l.employee_id || '',
      leave_type:  l.leave_type  || 'ANNUAL',
      start_date:  l.start_date  || TODAY,
      end_date:    l.end_date    || TODAY,
      notes:       l.notes       || '',
      return_date: l.return_date || '',
    })
    setShowForm(true)
  }

  // ── Save (insert or update) ───────────────────────────────────────────────
  async function save() {
    if (!form.employee_id)                            { alert('Select employee'); return }
    if (form.end_date < form.start_date)              { alert('End date must be on or after start date'); return }
    if (formDays <= 0)                                { alert('Invalid date range — 0 working days'); return }

    const emp = employees.find(e => e.id === form.employee_id)
    setSaving(true)

    const payload = {
      entity_id:      entityId,
      employee_id:    form.employee_id,
      employee_name:  emp?.full_name || '',
      leave_type:     form.leave_type,
      start_date:     form.start_date,
      end_date:       form.end_date,
      return_date:    form.return_date || null,
      days_requested: formDays,
      notes:          form.notes || null,
      status:         editItem ? editItem.status : 'PENDING',
    }

    let error
    if (editItem) {
      ;({ error } = await supabase.from('vacations').update(payload).eq('id', editItem.id))
    } else {
      ;({ error } = await supabase.from('vacations').insert(payload))
    }

    setSaving(false)
    if (error) { alert(error.message); return }
    setShowForm(false)
    setEditItem(null)
    setForm(EMPTY_FORM)
    load()
  }

  // ── Approve ───────────────────────────────────────────────────────────────
  async function approve(lv) {
    const balField = BAL_FIELD[lv.leave_type]
    const days     = lv.days_requested || 0

    await supabase.from('vacations').update({
      status:      'APPROVED',
      approved_at: new Date().toISOString(),
    }).eq('id', lv.id)

    // Deduct from leave balance if applicable
    if (balField && days > 0) {
      const emp = employees.find(e => e.id === lv.employee_id)
      if (emp) {
        const cur = +(emp[balField] || 0)
        await supabase.from('employees').update({ [balField]: Math.max(0, cur - days) }).eq('id', emp.id)
        setEmps(prev => prev.map(e => e.id === emp.id ? { ...e, [balField]: Math.max(0, cur - days) } : e))
      }
    }
    setLeaves(prev => prev.map(l => l.id === lv.id ? { ...l, status:'APPROVED', approved_at:new Date().toISOString() } : l))
  }

  // ── Reject ────────────────────────────────────────────────────────────────
  async function reject(lv) {
    // If it was already approved, restore balance
    const balField = BAL_FIELD[lv.leave_type]
    const days     = lv.days_requested || 0

    await supabase.from('vacations').update({ status:'REJECTED' }).eq('id', lv.id)

    if (lv.status === 'APPROVED' && balField && days > 0) {
      const emp = employees.find(e => e.id === lv.employee_id)
      if (emp) {
        const cur = +(emp[balField] || 0)
        await supabase.from('employees').update({ [balField]: cur + days }).eq('id', emp.id)
        setEmps(prev => prev.map(e => e.id === emp.id ? { ...e, [balField]: cur + days } : e))
      }
    }
    setLeaves(prev => prev.map(l => l.id === lv.id ? { ...l, status:'REJECTED' } : l))
  }

  // ── Cancel ────────────────────────────────────────────────────────────────
  async function cancel(lv) {
    const balField = BAL_FIELD[lv.leave_type]
    const days     = lv.days_requested || 0

    await supabase.from('vacations').update({ status:'CANCELLED' }).eq('id', lv.id)

    if (lv.status === 'APPROVED' && balField && days > 0) {
      const emp = employees.find(e => e.id === lv.employee_id)
      if (emp) {
        const cur = +(emp[balField] || 0)
        await supabase.from('employees').update({ [balField]: cur + days }).eq('id', emp.id)
        setEmps(prev => prev.map(e => e.id === emp.id ? { ...e, [balField]: cur + days } : e))
      }
    }
    setLeaves(prev => prev.map(l => l.id === lv.id ? { ...l, status:'CANCELLED' } : l))
    setConfirmId(null)
  }

  // ── Overstay levy ─────────────────────────────────────────────────────────
  async function setOverstay(id, overstay_days) {
    const levy = Math.ceil(Math.max(0, +overstay_days) / 30) * 800
    await supabase.from('vacations').update({ overstay_days:+overstay_days, levy_amount:levy }).eq('id', id)
    setLeaves(prev => prev.map(l => l.id === id ? { ...l, overstay_days:+overstay_days, levy_amount:levy } : l))
  }

  // ── Excel export ──────────────────────────────────────────────────────────
  function exportExcel() {
    const rows = [
      ['Employee', 'Dept', 'Type', 'Start', 'End', 'Return', 'Days', 'Status', 'Overstay', 'Levy (SAR)', 'Notes']
    ]
    filtered.forEach(l => rows.push([
      l.employee_name||'', l.department||'', l.leave_type||'',
      l.start_date||'', l.end_date||'', l.return_date||'',
      l.days_requested||'', l.status||'',
      l.overstay_days||'', l.levy_amount||'', l.notes||'',
    ]))
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type:'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href=url; a.download=`Leave_Register_${TODAY}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = leaves
    .filter(l => !filter.type   || l.leave_type === filter.type)
    .filter(l => !filter.status || l.status     === filter.status)
    .filter(l => !filter.dept   || (employees.find(e=>e.id===l.employee_id)?.department||'') === filter.dept)
    .filter(l => !filter.month  || (l.start_date||'').startsWith(filter.month))
    .filter(l => !search        || (l.employee_name||'').toLowerCase().includes(search.toLowerCase()))

  // ── KPI ───────────────────────────────────────────────────────────────────
  const kpiPending  = leaves.filter(l => l.status === 'PENDING').length
  const kpiApproved = leaves.filter(l => l.status === 'APPROVED').length
  const kpiDays     = leaves.filter(l => l.status === 'APPROVED').reduce((s,l) => s + (+l.days_requested||0), 0)
  const kpiOnLeave  = leaves.filter(l => {
    const td = TODAY
    return l.status === 'APPROVED' && l.start_date <= td && (l.end_date||l.start_date) >= td
  }).length

  // ── Months for filter ─────────────────────────────────────────────────────
  const months = [...new Set(leaves.map(l => (l.start_date||'').slice(0,7)).filter(Boolean))].sort().reverse().slice(0,12)

  const canEdit   = !role || ['SUPERADMIN','ADMIN','DEPT_HEAD'].includes(role)
  const canApprove= !role || ['SUPERADMIN','ADMIN'].includes(role)

  return (
    <ChapterPage
      chapterName="Human Resources"
      chapterIcon="🏖"
      chapterColor={MC}
      chapterSubtitle="Annual, sick, emergency, Hajj and maternity leave management"
      sectionTitle="Leave Register"
      onNew={openNew}
      newLabel="+ New Request"
    >
      {/* ── Step 0 Banner ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); openNew() }}
        chapterL1={L1}
        chapterL2={L2}
        moduleColor={MC}
        chapterLabel="Chapter 08 · Human Resources"
        formTitle={['Leave', 'Management', 'Form']}
        steps={['Leave Details', 'Review & Submit']}
        description="Submit and manage annual, sick, emergency, Hajj and maternity leave for all employees."
      />

      {/* ── KPI strip ── */}
      <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap' }}>
        {[
          { icon:'⏳', value:kpiPending,  label:'Awaiting Approval', color:'#e65100' },
          { icon:'✅', value:kpiApproved, label:'Approved This Year', color:'#2e7d32' },
          { icon:'📅', value:kpiDays + ' days', label:'Total Approved Days', color:'#1565C0' },
          { icon:'🏖', value:kpiOnLeave,  label:'On Leave Today',    color:'#6a1b9a' },
        ].map(c => (
          <div key={c.label} style={{ ...S.card, flex:'1 1 160px', marginBottom:0, display:'flex', alignItems:'center', gap:14, padding:'14px 18px' }}>
            <div style={{ fontSize:26 }}>{c.icon}</div>
            <div>
              <div style={{ fontSize:22, fontWeight:800, color:c.color, fontFamily:POPPINS }}>{c.value}</div>
              <div style={{ fontSize:11, color:'#6b7c93', fontFamily:POPPINS }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ ...S.card, padding:'12px 16px', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom:12 }}>
        <input style={{ ...S.inp, maxWidth:220 }} placeholder="Search name…" value={search} onChange={e=>setSearch(e.target.value)} />
        <select style={{ ...S.inp, maxWidth:160 }} value={filter.type} onChange={e=>setFilter(f=>({...f,type:e.target.value}))}>
          <option value="">All Types</option>
          {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select style={{ ...S.inp, maxWidth:130 }} value={filter.status} onChange={e=>setFilter(f=>({...f,status:e.target.value}))}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select style={{ ...S.inp, maxWidth:150 }} value={filter.dept} onChange={e=>setFilter(f=>({...f,dept:e.target.value}))}>
          <option value="">All Depts</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select style={{ ...S.inp, maxWidth:130 }} value={filter.month} onChange={e=>setFilter(f=>({...f,month:e.target.value}))}>
          <option value="">All Months</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <span style={{ fontSize:12, color:'#6b7c93', alignSelf:'center', fontFamily:POPPINS }}>{filtered.length} records</span>
          <button style={S.btn('#546e7a')} onClick={exportExcel} title="Export to CSV">⬇ Export</button>
          <button style={S.btn(MC)} onClick={openNew}>+ New Request</button>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={S.card}>
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'#6b7c93', fontFamily:POPPINS }}>Loading leave records…</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:POPPINS }}>
              <thead>
                <tr>
                  {['Employee','Dept','Type','Start','End','Days','Status','On Leave Today','Overstay','Levy','Actions'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={11} style={{ ...S.td, textAlign:'center', color:'#aab2bd', padding:36 }}>No leave records match the current filters</td></tr>
                )}
                {filtered.map((l, i) => {
                  const typeCfg   = TYPE_MAP[l.leave_type] || { color:'#546e7a', label:l.leave_type }
                  const statusCfg = STATUS_CFG[l.status]   || { bg:'#eceff1', color:'#546e7a', label:l.status }
                  const isToday   = l.status==='APPROVED' && l.start_date<=TODAY && (l.end_date||l.start_date)>=TODAY
                  const emp       = employees.find(e => e.id === l.employee_id)
                  return (
                    <tr key={l.id} style={{ background: i%2===0?'#fff':'#fafbfc' }}>
                      <td style={{ ...S.td, fontWeight:700 }}>{l.employee_name}</td>
                      <td style={S.td}>{emp?.department || '—'}</td>
                      <td style={S.td}><span style={S.chip(typeCfg.color+'22', typeCfg.color)}>{typeCfg.label || l.leave_type}</span></td>
                      <td style={S.td}>{fmt(l.start_date)}</td>
                      <td style={S.td}>{fmt(l.end_date)}</td>
                      <td style={{ ...S.td, fontWeight:800, textAlign:'center', color: MC }}>{l.days_requested ?? '—'}</td>
                      <td style={S.td}><span style={S.chip(statusCfg.bg, statusCfg.color)}>{statusCfg.label}</span></td>
                      <td style={{ ...S.td, textAlign:'center' }}>{isToday ? <span style={{ fontSize:14 }}>🏖</span> : '—'}</td>
                      <td style={S.td}>
                        {l.status === 'APPROVED' ? (
                          <input type="number" min={0} max={365}
                            defaultValue={l.overstay_days || 0}
                            style={{ width:55, padding:'3px 6px', borderRadius:5, border:'1px solid #dde3ec', fontSize:11, fontFamily:POPPINS }}
                            onBlur={e => setOverstay(l.id, e.target.value)} />
                        ) : '—'}
                      </td>
                      <td style={{ ...S.td, fontWeight:700, color: +l.levy_amount>0?'#c62828':'#aab2bd' }}>
                        {+l.levy_amount > 0 ? `SAR ${(+l.levy_amount).toLocaleString()}` : '—'}
                      </td>
                      <td style={S.td}>
                        <div style={{ display:'flex', gap:4, flexWrap:'nowrap' }}>
                          {l.status === 'PENDING' && canApprove && <>
                            <button style={S.btnSm('#2e7d32')} onClick={() => approve(l)}>✓ Approve</button>
                            <button style={S.btnSm('#c62828')} onClick={() => reject(l)}>✗ Reject</button>
                          </>}
                          {l.status === 'PENDING' && canEdit &&
                            <button style={S.btnSm('#1565C0')} onClick={() => openEdit(l)}>✏</button>
                          }
                          {l.status === 'APPROVED' && (canApprove || canEdit) && <>
                            <button style={S.btnSm('#c62828')} onClick={() => reject(l)}>Revoke</button>
                            {confirmId === l.id
                              ? <button style={S.btnSm('#546e7a')} onClick={() => cancel(l)}>Confirm Cancel</button>
                              : <button style={S.btnSm('#546e7a')} onClick={() => setConfirmId(l.id)}>Cancel</button>
                            }
                          </>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Leave Balances grid ── */}
      {employees.length > 0 && (
        <div style={S.card}>
          <div style={{ fontWeight:800, fontSize:14, color:'#1a2e3d', marginBottom:12, fontFamily:POPPINS }}>
            Employee Leave Balances
            <span style={{ fontWeight:400, fontSize:11, color:'#6b7c93', marginLeft:8 }}>Annual · Emergency (days remaining)</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))', gap:8 }}>
            {employees.map(e => {
              const annualBal = +(e.annual_leave_bal    ?? 30)
              const emergBal  = +(e.emergency_leave_bal ?? 15)
              const annualPct = Math.min(100, (annualBal / 30) * 100)
              const emergPct  = Math.min(100, (emergBal  / 15) * 100)
              const annualColor = annualPct >= 60 ? '#2e7d32' : annualPct >= 25 ? '#f57f17' : '#c62828'
              const emergColor  = emergPct  >= 60 ? '#1565C0' : emergPct  >= 25 ? '#f57f17' : '#c62828'
              return (
                <div key={e.id} style={{ background:'#f8fafc', borderRadius:10, padding:'12px 14px', border:'1px solid #edf2f7' }}>
                  <div style={{ fontWeight:700, fontSize:12, color:'#1a2e3d', marginBottom:2, fontFamily:POPPINS, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.full_name}</div>
                  <div style={{ fontSize:10, color:'#6b7c93', marginBottom:8, fontFamily:POPPINS }}>{e.department}</div>
                  <div style={{ display:'flex', gap:12, marginBottom:6 }}>
                    <div>
                      <div style={{ fontSize:9, color:'#6b7c93', fontFamily:POPPINS }}>ANNUAL</div>
                      <div style={{ fontSize:16, fontWeight:800, color:annualColor, fontFamily:POPPINS }}>{annualBal}<span style={{ fontSize:9, fontWeight:400, marginLeft:2 }}>d</span></div>
                    </div>
                    <div>
                      <div style={{ fontSize:9, color:'#6b7c93', fontFamily:POPPINS }}>EMERG</div>
                      <div style={{ fontSize:16, fontWeight:800, color:emergColor, fontFamily:POPPINS }}>{emergBal}<span style={{ fontSize:9, fontWeight:400, marginLeft:2 }}>d</span></div>
                    </div>
                  </div>
                  <div style={{ height:4, borderRadius:2, background:'#e2e8f0', overflow:'hidden', marginBottom:3 }}>
                    <div style={{ height:'100%', width:`${annualPct}%`, background:annualColor, transition:'width 0.3s' }} />
                  </div>
                  <div style={{ height:4, borderRadius:2, background:'#e2e8f0', overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${emergPct}%`, background:emergColor, transition:'width 0.3s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          FORM MODAL
      ════════════════════════════════════════════════════════════════ */}
      {showForm && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setShowForm(false)}>
          <div style={S.modal}>
            {/* Header */}
            <div style={{ background:`linear-gradient(135deg,${MC},${MC}cc)`, borderRadius:'18px 18px 0 0', padding:'20px 24px', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ fontSize:28 }}>🏖</div>
              <div>
                <div style={{ fontSize:15, fontWeight:800, color:'#fff', fontFamily:POPPINS }}>
                  {editItem ? 'Edit Leave Request' : 'New Leave Request'}
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)', fontFamily:POPPINS }}>
                  {editItem ? `Editing: ${editItem.employee_name}` : 'Submit for HR approval'}
                </div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding:'24px 28px' }}>
              {/* Employee */}
              <div style={{ marginBottom:16 }}>
                <label style={S.label}>Employee *</label>
                <select style={S.inp} value={form.employee_id} onChange={e=>fv('employee_id',e.target.value)} disabled={!!editItem}>
                  <option value="">— Select Employee —</option>
                  {employees.map(e=><option key={e.id} value={e.id}>{e.full_name}{e.department?` · ${e.department}`:''}</option>)}
                </select>
              </div>

              {/* Leave balance hint for selected employee */}
              {form.employee_id && (() => {
                const emp = employees.find(e => e.id === form.employee_id)
                if (!emp) return null
                return (
                  <div style={{ background:'#f0f7ff', borderRadius:8, padding:'10px 14px', marginBottom:16, display:'flex', gap:20 }}>
                    <div><div style={{ fontSize:9, color:'#6b7c93', fontFamily:POPPINS }}>ANNUAL BAL</div><div style={{ fontWeight:800, color:'#1565C0', fontFamily:POPPINS }}>{emp.annual_leave_bal??30} days</div></div>
                    <div><div style={{ fontSize:9, color:'#6b7c93', fontFamily:POPPINS }}>EMERGENCY BAL</div><div style={{ fontWeight:800, color:'#e65100', fontFamily:POPPINS }}>{emp.emergency_leave_bal??15} days</div></div>
                  </div>
                )
              })()}

              {/* Leave Type */}
              <div style={{ marginBottom:16 }}>
                <label style={S.label}>Leave Type *</label>
                <select style={S.inp} value={form.leave_type} onChange={e=>fv('leave_type',e.target.value)}>
                  {LEAVE_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              {/* Dates */}
              <div style={S.row}>
                <div style={S.col}>
                  <label style={S.label}>Start Date *</label>
                  <input type="date" style={S.inp} value={form.start_date} onChange={e=>fv('start_date',e.target.value)} />
                </div>
                <div style={S.col}>
                  <label style={S.label}>End Date *</label>
                  <input type="date" style={S.inp} value={form.end_date} min={form.start_date} onChange={e=>fv('end_date',e.target.value)} />
                </div>
              </div>

              {/* Duration badge */}
              {form.start_date && form.end_date && (
                <div style={{ background: formDays>0?'#e8f5e9':'#ffebee', border:`1px solid ${formDays>0?'#a5d6a7':'#ef9a9a'}`, borderRadius:8, padding:'10px 14px', marginBottom:16, fontFamily:POPPINS }}>
                  <span style={{ fontWeight:800, color:formDays>0?'#2e7d32':'#c62828', fontSize:15 }}>📅 {formDays} days</span>
                  <span style={{ fontSize:11, color:'#6b7c93', marginLeft:8 }}>
                    {TYPE_MAP[form.leave_type]?.useCalendar ? 'calendar days' : 'Saudi working days (excl. Fri–Sat)'}
                    {' · '}{calendarDays(form.start_date, form.end_date)} calendar
                  </span>
                </div>
              )}

              {/* Expected Return Date */}
              <div style={{ marginBottom:16 }}>
                <label style={S.label}>Expected Return Date</label>
                <input type="date" style={S.inp} value={form.return_date} onChange={e=>fv('return_date',e.target.value)} />
              </div>

              {/* Notes */}
              <div style={{ marginBottom:20 }}>
                <label style={S.label}>Notes / Reason</label>
                <textarea style={{ ...S.inp, height:72, resize:'vertical' }} value={form.notes} onChange={e=>fv('notes',e.target.value)} placeholder="Optional notes or reason for leave…" />
              </div>

              {/* Footer buttons */}
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end', paddingTop:4, borderTop:'1px solid #f0f4f8' }}>
                <button style={{ ...S.btn('#aab2bd'), padding:'9px 20px' }} onClick={()=>setShowForm(false)}>Cancel</button>
                <button style={{ ...S.btn(MC), padding:'9px 24px' }} onClick={save} disabled={saving}>
                  {saving ? '⏳ Saving…' : editItem ? '✓ Update' : '+ Submit Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ChapterPage>
  )
}
