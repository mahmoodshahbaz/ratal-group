/**
 * FieldNotifications.jsx
 *
 * Phase F — Admin Notifications Centre
 *
 * Full-system view of all field notifications across every employee.
 * Admins / Finance / DH see incoming alerts from all forms in one inbox.
 *
 * Features:
 *  • Live notification feed — newest first
 *  • Filter by type, status (unread / delivered / pending), employee
 *  • Telegram delivery status per row (✅ delivered / ⏳ pending)
 *  • Mark individual or all as read
 *  • KPI strip: today's total, unread count, undelivered (no Telegram ID)
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ── Type config ───────────────────────────────────────────────────────────────

const TYPE_META = {
  ADVANCE_ISSUED:    { icon:'💸', label:'Advance Issued',       color:'#1565c0' },
  ADVANCE_RETURN:    { icon:'🔄', label:'Advance Return',       color:'#0277bd' },
  CLAIM_SUBMITTED:   { icon:'🧾', label:'Claim Submitted',      color:'#6a1b9a' },
  CLAIM_APPROVED:    { icon:'✅', label:'Claim Approved',       color:'#2e7d32' },
  CLAIM_REJECTED:    { icon:'❌', label:'Claim Rejected',       color:'#b71c1c' },
  SITE_STATUS:       { icon:'📍', label:'Site Update',          color:'#bf360c' },
  PAYMENT_CONFIRMED: { icon:'💳', label:'Payment Confirmed',    color:'#00695c' },
  CAR_INCIDENT:      { icon:'🚨', label:'Vehicle Incident',     color:'#e53935' },
  CAR_URGENT:        { icon:'⚠️', label:'Urgent Maintenance',   color:'#f57f17' },
  GENERAL:           { icon:'🔔', label:'General',              color:'#37474f' },
  // ── Added (Gap N5) ────────────────────────────────────────────────────────
  SALARY_CREDITED:   { icon:'🏦', label:'Salary Credited',      color:'#1b5e20' },
  PENALTY_RECORDED:  { icon:'🚫', label:'Penalty Recorded',     color:'#c62828' },
  LEAVE_APPROVED:    { icon:'🌴', label:'Leave Approved',       color:'#2e7d32' },
  LEAVE_REJECTED:    { icon:'🚷', label:'Leave Rejected',       color:'#b71c1c' },
  DOC_EXPIRY:        { icon:'📄', label:'Document Expiry Alert', color:'#e65100' },
  DH_PAYMENT_ACK:    { icon:'🏷️', label:'Payment Acknowledgment', color:'#6a1b9a' },
}

const ALL_TYPES = Object.keys(TYPE_META)

function tm(type) { return TYPE_META[type] || { icon:'🔔', label: type, color:'#546e7a' } }

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  page:   { padding:'24px 28px', fontFamily:'Arial,sans-serif', maxWidth:1100 },
  head:   { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 },
  h1:     { fontSize:22, fontWeight:900, color:'#1a2e3d', margin:0 },
  kpi:    { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:14, marginBottom:24 },
  kcard:  (c) => ({ background:`linear-gradient(135deg,${c}cc 0%,${c} 100%)`, borderRadius:10, padding:'10px 16px', boxShadow:`0 3px 10px ${c}44`, minWidth:110, flexShrink:0, position:'relative', overflow:'hidden' }),
  kval:   (c) => ({ fontSize:24, fontWeight:900, color:'#fff', lineHeight:1.2, marginTop:2 }),
  klbl:   { fontSize:9, color:'rgba(255,255,255,0.85)', fontWeight:700, textTransform:'uppercase', letterSpacing:0.8, fontFamily:"'Poppins',sans-serif" },
  filters:{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' },
  chip:   (active, color='#1a2540') => ({
    padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:700,
    border:`2px solid ${active ? color : '#e0e0e0'}`,
    background: active ? color : '#fff',
    color: active ? '#fff' : '#546e7a', cursor:'pointer',
  }),
  input:  { padding:'7px 12px', border:'1.5px solid #cfd8dc', borderRadius:8, fontSize:13, background:'#f8fafc', color:'#1a2e3d' },
  card:   { background:'#fff', borderRadius:14, boxShadow:'0 2px 10px rgba(0,0,0,0.07)', overflow:'hidden', marginBottom:16 },
  row:    (unread) => ({
    display:'flex', gap:14, padding:'14px 18px', alignItems:'flex-start',
    background: unread ? '#f3f7ff' : '#fff',
    borderBottom:'1px solid #f0f0f0',
  }),
  icon:   (color) => ({
    width:40, height:40, borderRadius:10, flexShrink:0,
    background: color + '18', display:'flex', alignItems:'center',
    justifyContent:'center', fontSize:20,
  }),
  title:  { fontSize:14, fontWeight:700, color:'#1a2e3d', marginBottom:2 },
  body:   { fontSize:13, color:'#546e7a', marginBottom:4 },
  meta:   { fontSize:11, color:'#aab2bd' },
  badge:  (color) => ({
    display:'inline-block', padding:'1px 8px', borderRadius:10,
    background: color + '18', color, fontSize:11, fontWeight:700,
    marginRight:6,
  }),
  btn:    (bg, fg='#fff') => ({
    padding:'6px 12px', background:bg, color:fg, border:'none',
    borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
  }),
  emptyState: { padding:40, textAlign:'center', color:'#aab2bd' },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FieldNotifications({ entityId, isAr }) {
  const [notifs,     setNotifs]     = useState([])
  const [employees,  setEmployees]  = useState({})   // id → name map
  const [loading,    setLoading]    = useState(true)

  // Filters
  const [typeFilter,   setTypeFilter]   = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')  // ALL | UNREAD | DELIVERED | PENDING
  const [search,       setSearch]       = useState('')

  // Bulk actions
  const [markingAll,   setMarkingAll]   = useState(false)

  // ── Load ───────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true)

    let q = supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (entityId) q = q.eq('entity_id', entityId)

    const { data: rows } = await q
    setNotifs(rows || [])

    // Load employee names in one query
    const empIds = [...new Set((rows || []).map(r => r.employee_id).filter(Boolean))]
    if (empIds.length) {
      const { data: emps } = await supabase
        .from('employees')
        .select('id, full_name_en')
        .in('id', empIds)
      const map = {}
      ;(emps || []).forEach(e => { map[e.id] = e.full_name_en })
      setEmployees(map)
    }

    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  // ── Mark read ──────────────────────────────────────────────────────────────

  const markRead = async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  const markAllRead = async () => {
    setMarkingAll(true)
    const ids = visible.filter(n => !n.is_read).map(n => n.id)
    if (ids.length) {
      await supabase.from('notifications').update({ is_read: true }).in('id', ids)
      setNotifs(prev => prev.map(n => ids.includes(n.id) ? { ...n, is_read: true } : n))
    }
    setMarkingAll(false)
  }

  // ── KPIs ────────────────────────────────────────────────────────────────────

  const todayStr  = new Date().toISOString().slice(0,10)
  const todayCount      = notifs.filter(n => n.created_at?.startsWith(todayStr)).length
  const unreadCount     = notifs.filter(n => !n.is_read).length
  const deliveredCount  = notifs.filter(n => n.delivered_at).length
  const pendingCount    = notifs.filter(n => !n.delivered_at).length

  // ── Filter ─────────────────────────────────────────────────────────────────

  const visible = notifs.filter(n => {
    if (typeFilter !== 'ALL' && n.type !== typeFilter) return false
    if (statusFilter === 'UNREAD'    && n.is_read)      return false
    if (statusFilter === 'DELIVERED' && !n.delivered_at) return false
    if (statusFilter === 'PENDING'   && n.delivered_at)  return false
    if (search) {
      const q = search.toLowerCase()
      const empName = (employees[n.employee_id] || '').toLowerCase()
      if (!empName.includes(q) && !(n.title||'').toLowerCase().includes(q) && !(n.body||'').toLowerCase().includes(q)) return false
    }
    return true
  })

  const unreadVisible = visible.filter(n => !n.is_read).length

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={s.page}>

      {/* Header */}
      <div style={s.head}>
        <div>
          <h1 style={s.h1}>🔔 Field Notifications</h1>
          <div style={{ fontSize:13, color:'#78909c', marginTop:4 }}>
            All system alerts from field forms — Telegram delivery status
          </div>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          {unreadVisible > 0 && (
            <button
              onClick={markAllRead}
              disabled={markingAll}
              style={s.btn('#1a2540')}
            >
              {markingAll ? '⏳' : `✓ Mark All Read (${unreadVisible})`}
            </button>
          )}
          <button onClick={load} style={s.btn('#f0f4f8','#546e7a')}>
            ↺ Refresh
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={s.kpi}>
        {[
          { label:'Today',       value:todayCount,     color:'#1a2540' },
          { label:'Unread',      value:unreadCount,    color:'#6a1b9a' },
          { label:'TG Delivered',value:deliveredCount, color:'#2e7d32' },
          { label:'TG Pending',  value:pendingCount,   color:'#f57f17' },
          { label:'Total',       value:notifs.length,  color:'#546e7a' },
        ].map(k => (
          <div key={k.label} style={s.kcard(k.color)}>
            <div style={s.klbl}>{k.label}</div>
            <div style={s.kval(k.color)}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={s.filters}>
        {/* Status filter */}
        {['ALL','UNREAD','DELIVERED','PENDING'].map(f => (
          <button key={f} onClick={() => setStatusFilter(f)} style={s.chip(statusFilter === f)}>
            {f === 'ALL' ? `All (${notifs.length})` :
             f === 'UNREAD' ? `Unread (${unreadCount})` :
             f === 'DELIVERED' ? `✅ Delivered (${deliveredCount})` :
             `⏳ TG Pending (${pendingCount})`}
          </button>
        ))}

        {/* Type filter */}
        <select
          style={{ ...s.input, marginLeft:8 }}
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
        >
          <option value="ALL">All Types</option>
          {ALL_TYPES.map(t => (
            <option key={t} value={t}>{tm(t).icon} {tm(t).label}</option>
          ))}
        </select>

        {/* Search */}
        <input
          style={{ ...s.input, marginLeft:'auto', minWidth:200 }}
          placeholder="🔍 Employee or keyword…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Notification list */}
      {loading ? (
        <div style={s.emptyState}>Loading notifications…</div>
      ) : visible.length === 0 ? (
        <div style={s.emptyState}>
          {notifs.length === 0
            ? 'No notifications yet. They appear here when field forms submit.'
            : 'No notifications match the current filter.'}
        </div>
      ) : (
        <div style={s.card}>
          {visible.map(n => {
            const meta  = tm(n.type)
            const empName = employees[n.employee_id] || 'Unknown Employee'
            const dateStr = n.created_at
              ? new Date(n.created_at).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
              : ''

            return (
              <div key={n.id} style={s.row(!n.is_read)}>
                {/* Icon */}
                <div style={s.icon(meta.color)}>{meta.icon}</div>

                {/* Content */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:2 }}>
                    <span style={s.badge(meta.color)}>{meta.label}</span>
                    {!n.is_read && (
                      <span style={{ ...s.badge('#6a1b9a'), background:'#ede7f6' }}>UNREAD</span>
                    )}
                    {n.delivered_at ? (
                      <span style={{ fontSize:11, color:'#2e7d32' }}>✅ Telegram sent</span>
                    ) : (
                      <span style={{ fontSize:11, color:'#f57f17' }}>⏳ TG not sent</span>
                    )}
                  </div>
                  <div style={s.title}>{n.title}</div>
                  {n.body && <div style={s.body}>{n.body}</div>}
                  <div style={s.meta}>
                    👤 {empName} · {dateStr}
                    {n.delivered_at && (
                      <span style={{ marginLeft:8, color:'#2e7d32' }}>
                        · Delivered {new Date(n.delivered_at).toLocaleString('en-GB', { hour:'2-digit', minute:'2-digit' })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {!n.is_read && (
                  <button
                    onClick={() => markRead(n.id)}
                    style={{ ...s.btn('#f0f4f8','#546e7a'), flexShrink:0, alignSelf:'center' }}
                  >Mark Read</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Telegram setup hint */}
      <div style={{ background:'#fff3e0', borderRadius:12, padding:16, marginTop:8, border:'1px solid #ffcc80' }}>
        <div style={{ fontWeight:700, fontSize:13, color:'#e65100', marginBottom:6 }}>
          ⚠️ TG Pending = employee has no Telegram Chat ID set
        </div>
        <div style={{ fontSize:12, color:'#795548', lineHeight:1.6 }}>
          Go to <strong>Administration → Employees</strong>, open the employee record, and paste their Telegram Chat ID.
          Each employee gets their ID by sending <code>/start</code> to your bot.
          Once set, all future notifications will deliver automatically.
        </div>
      </div>

    </div>
  )
}
