import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Audit Log — SUPERADMIN only
// Shows every INSERT / UPDATE / DELETE across all key tables
// Field-by-field diff modal highlights exactly what changed

const fmt    = d => d ? new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'
const ACTION = {
  INSERT: { label:'Created',  color:'#2e7d32', bg:'#e8f5e9', icon:'＋' },
  UPDATE: { label:'Updated',  color:'#e65100', bg:'#fff3e0', icon:'✏' },
  DELETE: { label:'Deleted',  color:'#c62828', bg:'#ffebee', icon:'✕' },
}

const TABLES = [
  'invoices','purchase_orders','employees','payroll_runs','payroll_items',
  'money_requests','vacations','site_masters','projects','loi_requests',
  'vehicles','trip_records',
]

const S = {
  card:    { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:10 },
  btn:     (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:     { padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff' },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modal:   { background:'#fff', borderRadius:16, padding:24, width:720, maxWidth:'96vw', maxHeight:'88vh', overflow:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.2)' },
}

// ── Diff modal ──────────────────────────────────────────────────────────────
function DiffModal({ log, onClose }) {
  if (!log) return null
  const a = ACTION[log.action]
  const oldD = log.old_data || {}
  const newD = log.new_data || {}

  const SKIP = new Set(['id','entity_id','created_at','updated_at'])
  const allKeys = [...new Set([...Object.keys(oldD), ...Object.keys(newD)])].filter(k => !SKIP.has(k))

  const changed   = allKeys.filter(k => JSON.stringify(oldD[k]) !== JSON.stringify(newD[k]))
  const unchanged = allKeys.filter(k => !changed.includes(k))

  function Cell({ val, highlight, strike }) {
    const v = val != null ? String(val) : '—'
    return (
      <td style={{
        padding:'5px 10px', fontSize:11, maxWidth:280, wordBreak:'break-word',
        color: highlight ? '#2e7d32' : strike ? '#c62828' : '#37474f',
        textDecoration: strike ? 'line-through' : 'none',
      }}>{v}</td>
    )
  }

  function FieldRow({ k, isChanged }) {
    return (
      <tr style={{ background: isChanged ? '#fff8e1' : '#fff', borderBottom:'1px solid #f0f4f8' }}>
        <td style={{ padding:'5px 10px', fontSize:10, fontWeight:700, color:'#78909c', width:160, fontFamily:'monospace' }}>{k}</td>
        {log.action === 'INSERT' ? (
          <td colSpan={2} style={{ padding:'5px 10px', fontSize:11, color:'#37474f' }}>{newD[k] != null ? String(newD[k]) : '—'}</td>
        ) : log.action === 'DELETE' ? (
          <td colSpan={2} style={{ padding:'5px 10px', fontSize:11, color:'#c62828', textDecoration:'line-through' }}>{oldD[k] != null ? String(oldD[k]) : '—'}</td>
        ) : (
          <>
            <Cell val={oldD[k]} strike={isChanged} />
            <Cell val={newD[k]} highlight={isChanged} />
          </>
        )}
      </tr>
    )
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div>
            <div style={{ display:'inline-flex', alignItems:'center', gap:8, marginBottom:4 }}>
              <span style={{ background:a.bg, color:a.color, padding:'3px 10px', borderRadius:10, fontWeight:800, fontSize:12 }}>
                {a.icon} {a.label}
              </span>
              <span style={{ fontFamily:'monospace', fontSize:13, color:'#1565C0', fontWeight:700 }}>
                {log.table_name}
              </span>
            </div>
            <div style={{ fontSize:11, color:'#78909c' }}>
              {fmt(log.changed_at)} &nbsp;·&nbsp;
              {log.user_profiles?.full_name || 'Unknown user'}
              {log.user_profiles?.role && ` (${log.user_profiles.role})`}
              &nbsp;·&nbsp; record {log.record_id?.slice(0,12)}…
            </div>
          </div>
          <button style={{ ...S.btn('#546e7a'), padding:'5px 12px' }} onClick={onClose}>✕ Close</button>
        </div>

        {/* Summary chips */}
        {log.action === 'UPDATE' && (
          <div style={{ marginBottom:14, display:'flex', gap:8 }}>
            <span style={{ background:'#fff8e1', color:'#e65100', padding:'4px 12px', borderRadius:10, fontWeight:700, fontSize:11 }}>
              {changed.length} field{changed.length !== 1 ? 's' : ''} changed
            </span>
            <span style={{ background:'#f0f4f8', color:'#546e7a', padding:'4px 12px', borderRadius:10, fontSize:11 }}>
              {unchanged.length} unchanged
            </span>
          </div>
        )}

        {/* Table */}
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#f0f4f8' }}>
              <th style={{ padding:'7px 10px', textAlign:'left', fontSize:10, color:'#546e7a', width:160 }}>FIELD</th>
              {log.action === 'UPDATE' ? (
                <>
                  <th style={{ padding:'7px 10px', textAlign:'left', fontSize:10, color:'#c62828' }}>BEFORE</th>
                  <th style={{ padding:'7px 10px', textAlign:'left', fontSize:10, color:'#2e7d32' }}>AFTER</th>
                </>
              ) : (
                <th style={{ padding:'7px 10px', textAlign:'left', fontSize:10, color:'#546e7a' }}>VALUE</th>
              )}
            </tr>
          </thead>
          <tbody>
            {changed.map(k   => <FieldRow key={k} k={k} isChanged={true}  />)}
            {unchanged.map(k => <FieldRow key={k} k={k} isChanged={false} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main component ──────────────────────────────────────────────────────────
const PAGE = 60

export default function AuditLog({ entityId, role }) {
  const [logs,    setLogs]    = useState([])
  const [loading, setLoading] = useState(true)
  const [page,    setPage]    = useState(0)
  const [detail,  setDetail]  = useState(null)
  const [filters, setFilters] = useState({
    table: '', action: '', dateFrom: '', dateTo: '', search: ''
  })

  useEffect(() => { if (entityId) load() }, [entityId, filters, page])

  async function load() {
    setLoading(true)
    let q = supabase
      .from('audit_logs')
      .select('id, entity_id, table_name, record_id, action, old_data, new_data, changed_at, changed_by, user_profiles(full_name, role, entity_code)')
      .eq('entity_id', entityId)
      .order('changed_at', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1)

    if (filters.table)    q = q.eq('table_name', filters.table)
    if (filters.action)   q = q.eq('action', filters.action)
    if (filters.dateFrom) q = q.gte('changed_at', filters.dateFrom + 'T00:00:00')
    if (filters.dateTo)   q = q.lte('changed_at', filters.dateTo  + 'T23:59:59')

    const { data, error } = await q
    if (error) console.error(error)
    setLogs(data || [])
    setLoading(false)
  }

  function setF(k, v) { setFilters(p => ({ ...p, [k]: v })); setPage(0) }
  function clearFilters() { setFilters({ table:'', action:'', dateFrom:'', dateTo:'', search:'' }); setPage(0) }

  const displayed = filters.search.trim()
    ? logs.filter(l => {
        const s = filters.search.toLowerCase()
        return (
          l.table_name.includes(s) ||
          l.action.toLowerCase().includes(s) ||
          (l.user_profiles?.full_name || '').toLowerCase().includes(s) ||
          JSON.stringify(l.new_data || l.old_data || '').toLowerCase().includes(s)
        )
      })
    : logs

  const hasNext = displayed.length === PAGE

  if (role !== 'SUPERADMIN' && role !== 'ADMIN') {
    return (
      <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>
        <div style={{ fontSize:36, marginBottom:8 }}>🔒</div>
        <div style={{ fontWeight:700 }}>SUPERADMIN / ADMIN access only</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ fontSize:12, color:'#64748b', marginBottom:20 }}>Every data change — who did it, when, and exactly what changed</div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16, alignItems:'center' }}>
        <select value={filters.table} onChange={e => setF('table', e.target.value)} style={S.inp}>
          <option value="">All Tables</option>
          {TABLES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <select value={filters.action} onChange={e => setF('action', e.target.value)} style={S.inp}>
          <option value="">All Actions</option>
          <option value="INSERT">Created</option>
          <option value="UPDATE">Updated</option>
          <option value="DELETE">Deleted</option>
        </select>

        <input type="date" value={filters.dateFrom} onChange={e => setF('dateFrom', e.target.value)}
          style={S.inp} placeholder="From date" />
        <input type="date" value={filters.dateTo}   onChange={e => setF('dateTo', e.target.value)}
          style={S.inp} placeholder="To date" />

        <input
          placeholder="Search name / value…"
          value={filters.search}
          onChange={e => setF('search', e.target.value)}
          style={{ ...S.inp, width: 200 }}
        />

        <button style={S.btn('#78909c')} onClick={clearFilters}>Clear</button>
        <button style={S.btn()} onClick={() => load()}>↻ Refresh</button>
      </div>

      {/* Log table */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading audit log…</div>
      ) : displayed.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>
          No log entries match the current filters
        </div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f0f4f8' }}>
                {['Date & Time','User','Action','Table','Record',''].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, color:'#546e7a', fontSize:10, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayed.map((log, i) => {
                const a = ACTION[log.action] || ACTION.UPDATE
                return (
                  <tr key={log.id} style={{ borderBottom:'1px solid #f5f5f5', background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                    <td style={{ padding:'9px 14px', color:'#546e7a', whiteSpace:'nowrap' }}>{fmt(log.changed_at)}</td>
                    <td style={{ padding:'9px 14px' }}>
                      <div style={{ fontWeight:700, color:'#1a2e3d' }}>
                        {log.user_profiles?.full_name || log.changed_by?.slice(0,8) || 'System'}
                      </div>
                      {log.user_profiles?.role && (
                        <div style={{ fontSize:10, color:'#aab2bd' }}>{log.user_profiles.role}</div>
                      )}
                    </td>
                    <td style={{ padding:'9px 14px' }}>
                      <span style={{
                        background: a.bg, color: a.color,
                        padding:'3px 9px', borderRadius:10, fontWeight:700, fontSize:10, whiteSpace:'nowrap'
                      }}>
                        {a.icon} {a.label}
                      </span>
                    </td>
                    <td style={{ padding:'9px 14px', fontFamily:'monospace', color:'#1565C0', fontSize:11 }}>{log.table_name}</td>
                    <td style={{ padding:'9px 14px', color:'#aab2bd', fontSize:10, fontFamily:'monospace' }}>
                      {log.record_id?.slice(0,10)}…
                    </td>
                    <td style={{ padding:'9px 14px' }}>
                      <button style={{ ...S.btn('#546e7a'), padding:'4px 10px', fontSize:11 }}
                        onClick={() => setDetail(log)}>
                        View diff
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && displayed.length > 0 && (
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12, alignItems:'center' }}>
          {page > 0 && (
            <button style={S.btn('#546e7a')} onClick={() => setPage(p => p - 1)}>← Prev</button>
          )}
          <span style={{ fontSize:12, color:'#6b7c93', padding:'7px 12px' }}>Page {page + 1}</span>
          {hasNext && (
            <button style={S.btn()} onClick={() => setPage(p => p + 1)}>Next →</button>
          )}
        </div>
      )}

      <DiffModal log={detail} onClose={() => setDetail(null)} />
    </div>
  )
}
