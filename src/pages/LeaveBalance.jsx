import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { GROUP_COLORS } from '../styles/appStyles'

const MC = GROUP_COLORS.HR   // HR chapter palette

// ═══════════════════════════════════════════════════════════════════
// Leave Balance Tracker
// ═══════════════════════════════════════════════════════════════════

const fmt = d => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'

function balanceColor(remaining, entitlement) {
  if (remaining < 0)                   return '#c62828'
  if (remaining <= entitlement * 0.25) return '#e65100'
  if (remaining <= entitlement * 0.5)  return '#f57c00'
  return '#2e7d32'
}

function BalanceBar({ taken, pending, entitlement }) {
  const pctT = Math.min(100, (taken   / Math.max(entitlement, 1)) * 100)
  const pctP = Math.min(100 - pctT,   (pending / Math.max(entitlement, 1)) * 100)
  return (
    <div style={{ height:7, borderRadius:4, background:'#edf2f7', overflow:'hidden', minWidth:90 }}>
      <div style={{ display:'flex', height:'100%' }}>
        <div style={{ width:`${pctT}%`, background:'#c62828', transition:'width .4s' }} />
        <div style={{ width:`${pctP}%`, background:'#f57c00', transition:'width .4s' }} />
      </div>
    </div>
  )
}

// ── Compact KPI card (single-line strip) ──────────────────────────
function KpiCard({ label, value, icon, bg, fg }) {
  return (
    <div style={{
      background: bg, borderRadius:10, padding:'10px 14px',
      boxShadow:'0 2px 8px rgba(0,0,0,0.12)',
      display:'flex', flexDirection:'column', alignItems:'flex-start', gap:2, minWidth:0,
    }}>
      <div style={{ fontSize:10, fontWeight:700, color: fg + 'bb', textTransform:'uppercase', letterSpacing:.4, whiteSpace:'nowrap' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize:22, fontWeight:900, color: fg, lineHeight:1.1 }}>{value}</div>
    </div>
  )
}

export default function LeaveBalance({ entityId }) {
  const [expandedId, setExpandedId] = useState(null)
  const [year,        setYear]        = useState(new Date().getFullYear())
  const [data,        setData]        = useState([])
  const [onLeave,     setOnLeave]     = useState([])
  const [upcoming,    setUpcoming]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [defEntitle,  setDefEntitle]  = useState(21)
  const [deptFilter,  setDeptFilter]  = useState('')
  const [search,      setSearch]      = useState('')
  const [departments, setDepartments] = useState([])

  useEffect(() => { if (entityId) loadAll() }, [entityId, year])

  async function loadAll() {
    setLoading(true)
    const today = new Date().toISOString().slice(0, 10)
    const in30  = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)

    const [settRes, empRes, depRes, lvRes, todayRes, upRes] = await Promise.all([
      supabase.from('entity_settings').select('annual_leave_days').eq('entity_id', entityId).maybeSingle(),
      supabase.from('employees')
        .select('id, full_name, full_name_en, employee_number, department_id, job_title, annual_leave_days, join_date, employee_category')
        .eq('entity_id', entityId)
        .neq('is_active', false)          // ← includes NULL (unset) rows
        .order('full_name_en'),
      supabase.from('departments')
        .select('id, dept_name, dept_code')
        .eq('entity_id', entityId),
      supabase.from('vacations')
        .select('employee_id, leave_type, days_requested, status')
        .eq('entity_id', entityId)
        .gte('start_date', `${year}-01-01`)
        .lte('start_date', `${year}-12-31`),
      supabase.from('vacations')
        .select('employee_id, leave_type, start_date, end_date')
        .eq('entity_id', entityId)
        .eq('status', 'APPROVED')
        .lte('start_date', today)
        .gte('end_date',   today),
      supabase.from('vacations')
        .select('employee_id, leave_type, start_date, end_date, days_requested')
        .eq('entity_id', entityId)
        .eq('status', 'APPROVED')
        .gte('start_date', today)
        .lte('start_date', in30)
        .order('start_date')
        .limit(20),
    ])

    const def    = settRes.data?.annual_leave_days || 21
    setDefEntitle(def)

    const emps   = empRes.data  || []
    const depts  = depRes.data  || []
    const leaves = lvRes.data   || []

    // Exclude outsourced/contractors (same rule as Vacations dropdown)
    const EXCL = ['OUTSOURCED','CONTRACTOR','OUT','CON']
    const eligible = emps.filter(e => {
      const cat = (e.employee_category || '').toUpperCase()
      return !EXCL.includes(cat)
    })

    setDepartments(depts)

    // dept lookup map
    const deptMap = Object.fromEntries(depts.map(d => [d.id, d]))

    // on-leave today — enrich with name from emps
    const todayIds = new Set((todayRes.data || []).map(l => l.employee_id))
    setOnLeave(todayRes.data || [])

    // upcoming — enrich name
    const upcomingRaw = upRes.data || []
    const empById = Object.fromEntries(eligible.map(e => [e.id, e]))
    setUpcoming(upcomingRaw.map(l => ({ ...l, empName: (empById[l.employee_id]?.full_name_en || empById[l.employee_id]?.full_name || '?') })))

    const rows = eligible.map(emp => {
      const empLeaves  = leaves.filter(l => l.employee_id === emp.id && l.leave_type === 'ANNUAL')
      const approved   = empLeaves.filter(l => l.status === 'APPROVED').reduce((s, l) => s + (+l.days_requested || 0), 0)
      const pending    = empLeaves.filter(l => l.status === 'PENDING' ).reduce((s, l) => s + (+l.days_requested || 0), 0)
      const sick       = leaves.filter(l => l.employee_id === emp.id && l.leave_type === 'SICK' && l.status === 'APPROVED')
        .reduce((s, l) => s + (+l.days_requested || 0), 0)
      const other      = leaves.filter(l => l.employee_id === emp.id && !['ANNUAL','SICK'].includes(l.leave_type) && l.status === 'APPROVED')
        .reduce((s, l) => s + (+l.days_requested || 0), 0)
      const entitle    = +emp.annual_leave_days || def
      const dept       = deptMap[emp.department_id]
      return {
        ...emp,
        deptName:    dept?.dept_name || '—',
        deptCode:    dept?.dept_code || '',
        entitlement: entitle,
        approved, pending,
        remaining:   entitle - approved,
        sick, other,
        onLeaveNow:  todayIds.has(emp.id),
      }
    })

    setData(rows)
    setLoading(false)
  }

  // Apply filters
  const filtered = data
    .filter(r => !deptFilter || r.department_id === deptFilter)
    .filter(r => !search || (r.full_name_en || r.full_name || '').toLowerCase().includes(search.toLowerCase()))

  // KPIs
  const total       = filtered.length
  const onLeaveNow  = filtered.filter(r => r.onLeaveNow).length
  const avgRem      = total ? (filtered.reduce((s,r) => s + r.remaining, 0) / total).toFixed(1) : '0.0'
  const exhausted   = filtered.filter(r => r.remaining <= 0).length
  const lowBal      = filtered.filter(r => r.remaining > 0 && r.remaining <= 5).length

  function exportCSV() {
    const rows = [
      ['#','Employee','Dept','Job Title','Entitlement','Used','Pending','Remaining','Sick','Other'].join(','),
      ...filtered.map((r,i) => [i+1, r.full_name_en||r.full_name, r.deptName, r.job_title||'', r.entitlement, r.approved, r.pending, r.remaining, r.sick, r.other].join(','))
    ]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([rows.join('\n')], { type:'text/csv' }))
    a.download = `leave-balance-${year}.csv`; a.click()
  }

  const INP = { padding:'7px 11px', borderRadius:7, border:'1.5px solid #dde3ec', fontSize:12, outline:'none', background:'#fff' }

  return (
    <div>
      {/* ── Sticky block: filter bar + KPI cards ─────────────── */}
      <div style={{ position:'sticky', top:0, zIndex:20, background:'#f7f8fc', paddingBottom:10, borderBottom:'2px solid #e8edf4', marginBottom:14 }}>

      {/* Filter bar */}
      <div style={{
        padding:'10px 0 8px',
        display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap',
      }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:3 }}>Year</div>
          <select value={year} onChange={e => setYear(+e.target.value)} style={INP}>
            {[2023,2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:3 }}>Department</div>
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={INP}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.dept_name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:3 }}>Search</div>
          <input placeholder="Employee name…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...INP, width:190 }} />
        </div>
        <button onClick={exportCSV} style={{ padding:'8px 16px', borderRadius:8, border:`1.5px solid ${MC}`, background:'transparent', color:MC, fontWeight:700, fontSize:12, cursor:'pointer' }}>
          ⬇ CSV
        </button>
        <button onClick={loadAll} disabled={loading} style={{ padding:'8px 16px', borderRadius:8, border:'none', background:MC, color:'#fff', fontWeight:700, fontSize:12, cursor:'pointer' }}>
          ↻ Refresh
        </button>
      </div>{/* end filter row */}

      {/* ── KPI cards — single compact row ───────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, marginBottom:0 }}>
        <KpiCard label="Total Employees"    value={total}        icon="👥" bg="#312e81" fg="#fff" />
        <KpiCard label="On Leave Today"     value={onLeaveNow}   icon="🌴" bg="#1565C0" fg="#fff" />
        <KpiCard label="Avg Days Remaining" value={`${avgRem}d`} icon="📊" bg="#1b5e20" fg="#fff" />
        <KpiCard label="Low Balance ≤5d"    value={lowBal}       icon="⚠️"  bg="#e65100" fg="#fff" />
        <KpiCard label="Exhausted Balance"  value={exhausted}    icon="🔴" bg="#b71c1c" fg="#fff" />
      </div>{/* end KPI grid */}

      </div>{/* end sticky block */}

      {/* ── On leave today ────────────────────────────────────── */}
      {onLeave.length > 0 && (
        <div style={{ background:'#e3f2fd', border:'1px solid #90caf9', borderRadius:12, padding:'12px 16px', marginBottom:12 }}>
          <div style={{ fontWeight:800, color:'#1565C0', marginBottom:8, fontSize:13 }}>🌴 On Leave Today ({onLeave.length})</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {onLeave.map((l,i) => {
              const emp = data.find(e => e.id === l.employee_id)
              return (
                <span key={i} style={{ background:'#1565C0', color:'#fff', padding:'4px 12px', borderRadius:10, fontSize:11, fontWeight:700 }}>
                  {emp?.full_name_en || emp?.full_name || '?'} · {l.leave_type}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Upcoming leaves ───────────────────────────────────── */}
      {upcoming.length > 0 && (
        <div style={{ background:'#fff8e1', border:'1px solid #ffcc80', borderRadius:12, padding:'12px 16px', marginBottom:14 }}>
          <div style={{ fontWeight:800, color:'#e65100', marginBottom:8, fontSize:13 }}>📅 Upcoming — Next 30 Days</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {upcoming.map((l,i) => (
              <div key={i} style={{ background:'#fff', border:'1px solid #ffcc80', borderRadius:8, padding:'6px 12px', fontSize:11 }}>
                <span style={{ fontWeight:700 }}>{l.empName}</span>
                <span style={{ color:'#6b7c93', marginLeft:6 }}>{l.leave_type} · {fmt(l.start_date)} · {l.days_requested}d</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Collapsible list ──────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93', fontSize:14 }}>⏳ Loading leave balances…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:50, color:'#aab2bd', background:'#fff', borderRadius:12 }}>No employees found</div>
      ) : (
        <div style={{ borderRadius:12, overflow:'hidden', boxShadow:'0 2px 10px rgba(0,0,0,0.07)' }}>

          {/* List header */}
          <div style={{
            display:'grid', gridTemplateColumns:'32px 1fr 80px 90px 110px 28px',
            background: MC, color:'#fff', padding:'9px 14px',
            fontSize:10, fontWeight:700, letterSpacing:.4, textTransform:'uppercase',
          }}>
            <span>#</span>
            <span>Employee</span>
            <span style={{ textAlign:'center' }}>Dept</span>
            <span style={{ textAlign:'right' }}>Remaining</span>
            <span style={{ paddingLeft:8 }}>Progress</span>
            <span />
          </div>

          {/* Rows */}
          {filtered.map((emp, i) => {
            const bc      = balanceColor(emp.remaining, emp.entitlement)
            const exceeded = emp.remaining < 0
            const open    = expandedId === emp.id
            const rowBg   = exceeded ? '#fff8f8' : i % 2 === 0 ? '#fff' : '#fafbfc'
            return (
              <div key={emp.id} style={{ borderBottom:'1px solid #f0f4f8' }}>
                {/* Summary row — clickable */}
                <div
                  onClick={() => setExpandedId(open ? null : emp.id)}
                  style={{
                    display:'grid', gridTemplateColumns:'32px 1fr 80px 90px 110px 28px',
                    alignItems:'center', padding:'10px 14px', cursor:'pointer',
                    background: open ? '#f5ede6' : rowBg,
                    transition:'background .15s',
                  }}
                >
                  <span style={{ fontSize:11, color:'#aab2bd' }}>{i + 1}</span>

                  <div style={{ minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:12, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {emp.full_name_en || emp.full_name}
                      {emp.onLeaveNow && (
                        <span style={{ marginLeft:6, background:'#1565C0', color:'#fff', fontSize:8, padding:'1px 5px', borderRadius:3, fontWeight:700, verticalAlign:'middle' }}>ON LEAVE</span>
                      )}
                    </div>
                    <div style={{ fontSize:10, color:'#6b7c93', marginTop:1 }}>{emp.job_title || ''}</div>
                  </div>

                  <span style={{ fontSize:11, fontWeight:700, color: MC, textAlign:'center' }}>
                    {emp.deptCode || emp.deptName}
                  </span>

                  <span style={{ fontSize:14, fontWeight:900, color:bc, textAlign:'right' }}>
                    {exceeded ? `−${Math.abs(emp.remaining)}d ⚠` : `${emp.remaining}d`}
                  </span>

                  <div style={{ paddingLeft:8 }}>
                    <BalanceBar taken={emp.approved} pending={emp.pending} entitlement={emp.entitlement} />
                    <div style={{ fontSize:9, color:'#aab2bd', marginTop:1 }}>
                      {emp.entitlement > 0 ? `${Math.round((emp.approved/emp.entitlement)*100)}% of ${emp.entitlement}d` : ''}
                    </div>
                  </div>

                  <span style={{ textAlign:'center', fontSize:13, color:'#aab2bd', userSelect:'none' }}>
                    {open ? '▲' : '▼'}
                  </span>
                </div>

                {/* Expanded detail panel */}
                {open && (
                  <div style={{
                    background:'#fdf7f3', borderTop:`2px solid ${MC}22`,
                    padding:'12px 14px 14px 46px',
                    display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:10,
                  }}>
                    {[
                      { label:'Entitlement',  value:`${emp.entitlement}d`,                       color:'#1a2e3d' },
                      { label:'Annual Used',  value: emp.approved > 0 ? `${emp.approved}d` : '—', color:'#c62828' },
                      { label:'Pending',      value: emp.pending  > 0 ? `${emp.pending}d`  : '—', color:'#f57c00' },
                      { label:'Remaining',    value: exceeded ? `−${Math.abs(emp.remaining)}d` : `${emp.remaining}d`, color:bc },
                      { label:'Sick Leave',   value: emp.sick  > 0 ? `${emp.sick}d`  : '—',       color:'#546e7a' },
                      { label:'Other Leave',  value: emp.other > 0 ? `${emp.other}d` : '—',        color:'#546e7a' },
                      { label:'Department',   value: emp.deptName,                                 color:'#1a2e3d' },
                      { label:'Job Title',    value: emp.job_title || '—',                          color:'#1a2e3d' },
                    ].map(item => (
                      <div key={item.label} style={{ background:'#fff', borderRadius:8, padding:'8px 12px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
                        <div style={{ fontSize:9, fontWeight:700, color:'#aab2bd', textTransform:'uppercase', marginBottom:2 }}>{item.label}</div>
                        <div style={{ fontSize:15, fontWeight:800, color:item.color }}>{item.value}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Footer totals */}
          <div style={{
            display:'grid', gridTemplateColumns:'32px 1fr 80px 90px 110px 28px',
            background:'#f0f4f8', padding:'10px 14px',
            fontWeight:800, fontSize:12, color:'#1a2e3d', borderTop:'2px solid #dde3ec',
          }}>
            <span />
            <span>TOTAL — {filtered.length} employees</span>
            <span />
            <span style={{ textAlign:'right', color:'#2e7d32' }}>
              {filtered.reduce((s,r) => s + r.remaining, 0)}d
            </span>
            <span style={{ paddingLeft:8, fontSize:10, color:'#6b7c93', alignSelf:'center' }}>
              {filtered.reduce((s,r) => s + r.approved, 0)}d used · {filtered.reduce((s,r) => s + r.pending, 0)}d pending
            </span>
            <span />
          </div>
        </div>
      )}

      {/* Legend */}
      <div style={{ display:'flex', gap:20, marginTop:14, fontSize:11, color:'#6b7c93', flexWrap:'wrap' }}>
        <span>Progress: <b style={{ color:'#c62828' }}>■ Used</b> <b style={{ color:'#f57c00' }}>■ Pending</b></span>
        <span>Balance: <b style={{ color:'#2e7d32' }}>■ Healthy</b> <b style={{ color:'#f57c00' }}>■ &lt;50%</b> <b style={{ color:'#c62828' }}>■ Exceeded</b></span>
        <span style={{ marginLeft:'auto' }}>Default entitlement: <b>{defEntitle} days</b> (override per-employee in Employees page)</span>
      </div>
    </div>
  )
}
