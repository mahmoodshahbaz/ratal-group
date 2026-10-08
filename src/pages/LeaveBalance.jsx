import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.HR
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// Leave Balance Tracker
// For each active employee:
//   Entitlement (from entity_settings or employee override)
//   − Approved leave days taken this year
//   − Pending leave requests
//   = Remaining balance
// ═══════════════════════════════════════════════════════════════════

const fmt = d => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:12 },
  btn:   (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  btnO:  (c='#1a2e3d') => ({ background:'transparent', color:c, border:`1.5px solid ${c}`, borderRadius:8, padding:'7px 15px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:   { padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff' },
  lbl:   { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
}

// Balance bar: green → orange → red
function BalanceBar({ taken, pending, entitlement }) {
  const pctTaken   = Math.min(100, (taken   / Math.max(entitlement, 1)) * 100)
  const pctPending = Math.min(100 - pctTaken, (pending / Math.max(entitlement, 1)) * 100)
  return (
    <div style={{ height:7, borderRadius:4, background:'#f0f4f8', overflow:'hidden', width:'100%', minWidth:80 }}>
      <div style={{ display:'flex', height:'100%' }}>
        <div style={{ width:`${pctTaken}%`,   background:'#c62828',  transition:'width 0.4s' }} />
        <div style={{ width:`${pctPending}%`, background:'#f57c00',  transition:'width 0.4s' }} />
      </div>
    </div>
  )
}

function balanceColor(remaining, entitlement) {
  if (remaining < 0)                         return '#c62828'   // exceeded
  if (remaining <= entitlement * 0.25)       return '#e65100'   // <25%
  if (remaining <= entitlement * 0.5)        return '#f57c00'   // <50%
  return '#2e7d32'                                              // healthy
}

export default function LeaveBalance({ entityId, role }) {
  const [year,        setYear]        = useState(new Date().getFullYear())
  const [data,        setData]        = useState([])
  const [onLeave,     setOnLeave]     = useState([])
  const [upcoming,    setUpcoming]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [entitlement, setEntitlement] = useState(21) // default, overridden from settings
  const [deptFilter,  setDeptFilter]  = useState('')
  const [search,      setSearch]      = useState('')
  const [departments, setDepartments] = useState([])

  useEffect(() => { if (entityId) loadAll() }, [entityId, year])

  async function loadAll() {
    setLoading(true)

    const [settingsRes, empsRes, leavesRes, todayRes, upcomingRes] = await Promise.all([
      // Entity leave entitlement
      supabase.from('entity_settings').select('annual_leave_days').eq('entity_id', entityId).single(),
      // All active employees
      supabase.from('employees').select('id, full_name, full_name_en, department, job_title, annual_leave_days, join_date').eq('entity_id', entityId).eq('is_active', true).order('full_name'),
      // All leave records for this year
      supabase.from('vacations')
        .select('employee_id, leave_type, start_date, end_date, days_requested, status')
        .eq('entity_id', entityId)
        .gte('start_date', `${year}-01-01`)
        .lte('start_date', `${year}-12-31`),
      // Who is on leave today
      supabase.from('vacations')
        .select('employee_id, leave_type, start_date, end_date, employees(full_name, department)')
        .eq('entity_id', entityId)
        .eq('status', 'APPROVED')
        .lte('start_date', new Date().toISOString().slice(0, 10))
        .gte('end_date',   new Date().toISOString().slice(0, 10)),
      // Upcoming leaves (next 30 days)
      supabase.from('vacations')
        .select('employee_id, leave_type, start_date, end_date, days_requested, employees(full_name)')
        .eq('entity_id', entityId)
        .eq('status', 'APPROVED')
        .gte('start_date', new Date().toISOString().slice(0, 10))
        .lte('start_date', new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10))
        .order('start_date')
        .limit(20),
    ])

    const defaultEntitlement = settingsRes.data?.annual_leave_days || 21
    setEntitlement(defaultEntitlement)

    const emps   = empsRes.data   || []
    const leaves = leavesRes.data || []

    // Unique departments
    const depts = [...new Set(emps.map(e => e.department).filter(Boolean))].sort()
    setDepartments(depts)
    setOnLeave(todayRes.data   || [])
    setUpcoming(upcomingRes.data || [])

    // Build balance per employee
    const rows = emps.map(emp => {
      const empLeaves    = leaves.filter(l => l.employee_id === emp.id && l.leave_type === 'ANNUAL')
      const approved     = empLeaves.filter(l => l.status === 'APPROVED').reduce((s, l) => s + (+l.days_requested || 0), 0)
      const pending      = empLeaves.filter(l => l.status === 'PENDING').reduce((s, l)  => s + (+l.days_requested || 0), 0)

      // Other leave types
      const sickApproved = leaves.filter(l => l.employee_id === emp.id && l.leave_type === 'SICK' && l.status === 'APPROVED')
        .reduce((s, l) => s + (+l.days_requested || 0), 0)
      const otherLeaves  = leaves.filter(l => l.employee_id === emp.id && !['ANNUAL','SICK'].includes(l.leave_type) && l.status === 'APPROVED')
        .reduce((s, l) => s + (+l.days_requested || 0), 0)

      // Employee-specific entitlement or entity default
      const empEntitlement = +emp.annual_leave_days || defaultEntitlement

      return {
        ...emp,
        entitlement:  empEntitlement,
        approved,
        pending,
        remaining:    empEntitlement - approved,
        sickApproved,
        otherLeaves,
        totalLeaves:  approved + sickApproved + otherLeaves,
      }
    })

    setData(rows)
    setLoading(false)
  }

  const filtered = data
    .filter(r => !deptFilter || r.department === deptFilter)
    .filter(r => !search || (r.full_name || r.full_name_en || '').toLowerCase().includes(search.toLowerCase()))

  // Summary KPIs
  const avgRemaining = filtered.length ? (filtered.reduce((s, r) => s + r.remaining, 0) / filtered.length).toFixed(1) : 0
  const exhausted    = filtered.filter(r => r.remaining <= 0).length
  const lowBalance   = filtered.filter(r => r.remaining > 0 && r.remaining <= 5).length

  function exportCSV() {
    const lines = [
      ['Employee', 'Department', 'Job Title', `Entitlement (${year})`, 'Approved Used', 'Pending', 'Remaining', 'Sick Leave', 'Other Leaves'].join(','),
      ...filtered.map(r => [
        r.full_name, r.department, r.job_title, r.entitlement, r.approved, r.pending, r.remaining, r.sickApproved, r.otherLeaves
      ].join(','))
    ]
    const blob = new Blob([lines.join('\n')], { type:'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `leave-balance-${year}.csv`; a.click()
  }

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>
        Annual leave entitlement vs used vs remaining — per employee
      </div>

      {/* Controls */}
      <div style={{ ...S.card, display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div>
          <label style={S.lbl}>Year</label>
          <select value={year} onChange={e => setYear(+e.target.value)} style={S.inp}>
            {[2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={S.lbl}>Department</label>
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={S.inp}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <input
          placeholder="Search employee…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...S.inp, width:200 }}
        />
        <button style={S.btnO()} onClick={exportCSV}>⬇ CSV</button>
        <button style={S.btn()} onClick={loadAll} disabled={loading}>↻ Refresh</button>
      </div>

      {/* KPI cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(150px,1fr))', gap:10, marginBottom:14 }}>
        {[
          { label:'On Leave Today',     value: onLeave.length,    color:'#1565C0' },
          { label:'Avg Days Remaining', value: `${avgRemaining}d`, color:'#2e7d32' },
          { label:'Exhausted Balance',  value: exhausted,         color:'#c62828' },
          { label:'Low Balance (≤5d)',  value: lowBalance,        color:'#f57c00' },
          { label:'Total Employees',    value: filtered.length,   color:'#546e7a' },
        ].map(k => (
          <div key={k.label} style={{ background:'#fff', borderRadius:12, padding:'12px 14px', boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize:10, color:'#6b7c93', marginBottom:3 }}>{k.label}</div>
            <div style={{ fontWeight:800, fontSize:18, color:k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Who's on leave today */}
      {onLeave.length > 0 && (
        <div style={{ ...S.card, background:'#e3f2fd', border:'1px solid #90caf9' }}>
          <div style={{ fontWeight:800, color:'#1565C0', marginBottom:8, fontSize:13 }}>
            🌴 On Leave Today ({onLeave.length})
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {onLeave.map((l, i) => (
              <span key={i} style={{ background:'#1565C0', color:'#fff', padding:'4px 12px', borderRadius:10, fontSize:11, fontWeight:700 }}>
                {l.employees?.full_name || 'Unknown'} · {l.leave_type}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming leaves */}
      {upcoming.length > 0 && (
        <div style={{ ...S.card, background:'#fff8e1', border:'1px solid #ffcc80' }}>
          <div style={{ fontWeight:800, color:'#e65100', marginBottom:8, fontSize:13 }}>
            📅 Upcoming Leaves — Next 30 Days
          </div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {upcoming.map((l, i) => (
              <div key={i} style={{ background:'#fff', border:'1px solid #ffcc80', borderRadius:8, padding:'6px 12px', fontSize:11 }}>
                <span style={{ fontWeight:700 }}>{l.employees?.full_name}</span>
                <span style={{ color:'#6b7c93', marginLeft:6 }}>{l.leave_type} · {fmt(l.start_date)} ({l.days_requested}d)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main table */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading leave balances…</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:50, color:'#aab2bd' }}>No employees found</div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#1a2e3d', color:'#fff', position:'sticky', top:0 }}>
                {['Employee','Department','Job Title','Entitlement','Used','Pending','Remaining','Progress','Sick','Other'].map(h => (
                  <th key={h} style={{ padding:'10px 12px', textAlign: ['Entitlement','Used','Pending','Remaining','Sick','Other'].includes(h) ? 'right' : 'left', fontWeight:700, fontSize:10, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((emp, i) => {
                const bColor = balanceColor(emp.remaining, emp.entitlement)
                const exceeded = emp.remaining < 0
                return (
                  <tr key={emp.id} style={{
                    borderBottom:'1px solid #f5f5f5',
                    background: exceeded ? '#fff8f8' : i % 2 === 0 ? '#fff' : '#fafbfc',
                  }}>
                    <td style={{ padding:'9px 12px', fontWeight:700, whiteSpace:'nowrap' }}>
                      {emp.full_name || emp.full_name_en}
                      {onLeave.some(l => l.employee_id === emp.id) && (
                        <span style={{ marginLeft:6, background:'#1565C0', color:'#fff', fontSize:9, padding:'1px 5px', borderRadius:4 }}>ON LEAVE</span>
                      )}
                    </td>
                    <td style={{ padding:'9px 12px', color:'#6b7c93' }}>{emp.department || '—'}</td>
                    <td style={{ padding:'9px 12px', color:'#6b7c93', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{emp.job_title || '—'}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right', fontWeight:700 }}>{emp.entitlement}d</td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color:'#c62828', fontWeight:600 }}>{emp.approved}d</td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color:'#f57c00' }}>
                      {emp.pending > 0 ? `${emp.pending}d` : '—'}
                    </td>
                    <td style={{ padding:'9px 12px', textAlign:'right', fontWeight:800, color:bColor }}>
                      {exceeded ? `−${Math.abs(emp.remaining)}d ⚠` : `${emp.remaining}d`}
                    </td>
                    <td style={{ padding:'9px 12px', minWidth:100 }}>
                      <BalanceBar taken={emp.approved} pending={emp.pending} entitlement={emp.entitlement} />
                      <div style={{ fontSize:9, color:'#aab2bd', marginTop:2, textAlign:'right' }}>
                        {emp.entitlement > 0 ? `${Math.round((emp.approved / emp.entitlement) * 100)}% used` : ''}
                      </div>
                    </td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color:'#546e7a' }}>
                      {emp.sickApproved > 0 ? `${emp.sickApproved}d` : '—'}
                    </td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color:'#546e7a' }}>
                      {emp.otherLeaves > 0 ? `${emp.otherLeaves}d` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background:'#f0f4f8', fontWeight:800 }}>
                <td colSpan={3} style={{ padding:'10px 12px', fontSize:12, color:'#1a2e3d' }}>
                  TOTAL — {filtered.length} employees
                </td>
                <td style={{ padding:'10px 12px', textAlign:'right' }}>
                  {filtered.reduce((s,r) => s + r.entitlement, 0)}d
                </td>
                <td style={{ padding:'10px 12px', textAlign:'right', color:'#c62828' }}>
                  {filtered.reduce((s,r) => s + r.approved, 0)}d
                </td>
                <td style={{ padding:'10px 12px', textAlign:'right', color:'#f57c00' }}>
                  {filtered.reduce((s,r) => s + r.pending, 0)}d
                </td>
                <td style={{ padding:'10px 12px', textAlign:'right', color:'#2e7d32' }}>
                  {filtered.reduce((s,r) => s + r.remaining, 0)}d
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Legend */}
      <div style={{ display:'flex', gap:16, marginTop:12, fontSize:11, color:'#6b7c93', flexWrap:'wrap' }}>
        <span>Progress bar: <span style={{ color:'#c62828', fontWeight:700 }}>■ Used</span> <span style={{ color:'#f57c00', fontWeight:700 }}>■ Pending</span> <span style={{ color:'#f0f4f8', fontWeight:700 }}>■ Remaining</span></span>
        <span>Balance color: <span style={{ color:'#2e7d32', fontWeight:700 }}>■ Healthy</span> <span style={{ color:'#f57c00', fontWeight:700 }}>■ &lt;50%</span> <span style={{ color:'#c62828', fontWeight:700 }}>■ Exceeded</span></span>
      </div>

      <div style={{ marginTop:10, fontSize:11, color:'#aab2bd' }}>
        Entitlement defaults to <strong>{entitlement} days</strong> from entity settings. Override per-employee in the Employees page (annual_leave_days field).
      </div>
    </div>
  )
}
