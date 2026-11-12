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
import { kpiCardGradient } from '../styles/appStyles'

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

// ── Administration Ch.03 Palette ─────────────────────────────────────────────
const L1   = '#AAAED0'
const L2   = '#F0F1FA'
const L3   = '#454D9B'
const PP   = "'Poppins', sans-serif"
const MAIN = '#172D37'
const SUB  = '#53666F'

// ── Shared styles ─────────────────────────────────────────────────────────────
const s = {
  badge: (color) => ({
    display:'inline-block', padding:'1px 8px', borderRadius:10,
    background: color + '18', color, fontSize:11, fontWeight:700,
    marginRight:6,
  }),
  btn: (bg, fg='#fff') => ({
    padding:'6px 12px', background:bg, color:fg, border:'none',
    borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:PP,
  }),
  row: (unread) => ({
    display:'flex', gap:14, padding:'12px 16px', alignItems:'flex-start',
    background: unread ? '#eef0fb' : '#fff',
    borderBottom:'1px solid #f0f0f0',
  }),
  icon: (color) => ({
    width:38, height:38, borderRadius:9, flexShrink:0,
    background: color + '18', display:'flex', alignItems:'center',
    justifyContent:'center', fontSize:18,
  }),
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

  // ── KPI data ───────────────────────────────────────────────────────────────
  const KPI_ITEMS = [
    { label:'Today',         value: todayCount     },
    { label:'Unread',        value: unreadCount    },
    { label:'TG Delivered',  value: deliveredCount },
    { label:'TG Pending',    value: pendingCount   },
    { label:'Total',         value: notifs.length  },
  ]

  const IN = { padding:'7px 12px', border:'1.5px solid #cfd8dc', borderRadius:8,
               fontSize:13, background:'#fff', color:MAIN, fontFamily:PP }

  return (
    <div className="fn-root" style={{ fontFamily:PP, display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden', background:L2 }}>
      <style>{`.fn-root input,.fn-root select,.fn-root button,.fn-root textarea{font-family:'Poppins',sans-serif!important}`}</style>

      {/* ══ UPPER ZONE ══ */}
      <div style={{ flexShrink:0, background:L2, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', zIndex:10 }}>

        {/* 1. L1 Heading Bar */}
        <div style={{ padding:'6px 28px 0' }}>
          <div style={{ background:L1, padding:'8px 16px', borderRadius:'6px 6px 0 0',
                        display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#fff' }}>Field Notifications</div>
              <div style={{ fontSize:10, color:'#fff', opacity:0.8 }}>System alerts from all field forms — Telegram delivery status</div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              {unreadVisible > 0 && (
                <button
                  onClick={markAllRead}
                  disabled={markingAll}
                  style={{ background:L3, color:'#fff', border:'none', borderRadius:7,
                           padding:'7px 16px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:PP }}
                >
                  {markingAll ? '⏳' : `✓ Mark All Read (${unreadVisible})`}
                </button>
              )}
              <button onClick={load}
                style={{ background:'rgba(255,255,255,0.25)', color:'#fff', border:'1px solid rgba(255,255,255,0.4)',
                         borderRadius:7, padding:'7px 14px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:PP }}>
                ↺ Refresh
              </button>
            </div>
          </div>
        </div>

        {/* 2. KPI Cards */}
        <div style={{ padding:'10px 28px 12px', background:L2, display:'flex', flexWrap:'wrap', gap:8 }}>
          {KPI_ITEMS.map((k, i) => (
            <div key={k.label}
              style={{ width:160, height:62, borderRadius:10, padding:'0 14px',
                       flexShrink:0, boxShadow:'0 2px 8px rgba(0,0,0,0.10)',
                       display:'flex', flexDirection:'column', justifyContent:'center',
                       ...kpiCardGradient(i % 4, L1, L2, L3) }}>
              <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', opacity:0.75, letterSpacing:0.6 }}>{k.label}</div>
              <div style={{ fontSize:18, fontWeight:800, lineHeight:1.2 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* 4. Filter Bar */}
        <div style={{ padding:'6px 28px 8px', background:L2 }}>
          <div style={{ background:'#fff', padding:'10px 14px', borderRadius:8,
                        boxShadow:'0 1px 4px rgba(0,0,0,0.08)', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            {/* Status pills */}
            {[
              { key:'ALL',       label:`All (${notifs.length})` },
              { key:'UNREAD',    label:`Unread (${unreadCount})` },
              { key:'DELIVERED', label:`✅ Delivered (${deliveredCount})` },
              { key:'PENDING',   label:`⏳ TG Pending (${pendingCount})` },
            ].map(f => (
              <button key={f.key} onClick={() => setStatusFilter(f.key)}
                style={{ padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:700,
                         border:`2px solid ${statusFilter === f.key ? L3 : '#e0e0e0'}`,
                         background: statusFilter === f.key ? L3 : '#fff',
                         color: statusFilter === f.key ? '#fff' : SUB, cursor:'pointer', fontFamily:PP }}>
                {f.label}
              </button>
            ))}

            {/* Type dropdown */}
            <select style={{ ...IN, marginLeft:4 }} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="ALL">All Types</option>
              {ALL_TYPES.map(t => (
                <option key={t} value={t}>{tm(t).icon} {tm(t).label}</option>
              ))}
            </select>

            {/* Search */}
            <input
              style={{ ...IN, marginLeft:'auto', minWidth:200 }}
              placeholder="🔍 Employee or keyword…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />

            {/* Count badge */}
            <div style={{ background:L3, color:'#fff', borderRadius:20, padding:'4px 12px',
                          fontSize:12, fontWeight:700, flexShrink:0 }}>
              {visible.length} shown
            </div>
          </div>
        </div>

        {/* 5. Column Header Row */}
        <div style={{ padding:'0 28px' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
            <thead>
              <tr>
                {['Type','Employee','Title / Message','Date','Telegram',''].map((h, i) => (
                  <th key={i} style={{ background:L3, color:'#fff', padding:'9px 13px',
                                       fontSize:10, fontWeight:700, textTransform:'uppercase',
                                       textAlign:'left', width: i===5?80:undefined }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>

      </div>{/* end upper zone */}

      {/* ══ SCROLL ZONE ══ */}
      <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:'0 28px 22px' }}>
        <div style={{ background:'#fff', borderRadius:'0 0 8px 8px', boxShadow:'0 2px 8px rgba(0,0,0,0.08)', overflow:'hidden' }}>

          {loading ? (
            <div style={{ padding:40, textAlign:'center', color:'#aab2bd', fontFamily:PP }}>Loading notifications…</div>
          ) : visible.length === 0 ? (
            <div style={{ padding:40, textAlign:'center', color:'#aab2bd', fontFamily:PP }}>
              {notifs.length === 0
                ? 'No notifications yet. They appear here when field forms submit.'
                : 'No notifications match the current filter.'}
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
              <tbody>
                {visible.map(n => {
                  const meta    = tm(n.type)
                  const empName = employees[n.employee_id] || 'Unknown Employee'
                  const dateStr = n.created_at
                    ? new Date(n.created_at).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })
                    : ''
                  const TD = { padding:'11px 13px', fontSize:13, color:MAIN,
                               borderBottom:'1px solid #f0f0f0', verticalAlign:'middle',
                               fontFamily:PP, background: n.is_read ? '#fff' : '#eef0fb' }
                  return (
                    <tr key={n.id}>
                      {/* Type */}
                      <td style={TD}>
                        <span style={s.badge(meta.color)}>{meta.icon} {meta.label}</span>
                        {!n.is_read && (
                          <span style={{ display:'inline-block', padding:'1px 7px', borderRadius:10,
                                         background:'#ede7f6', color:'#6a1b9a', fontSize:10, fontWeight:700 }}>NEW</span>
                        )}
                      </td>
                      {/* Employee */}
                      <td style={{ ...TD, fontSize:12, color:SUB }}>👤 {empName}</td>
                      {/* Title / Message */}
                      <td style={TD}>
                        <div style={{ fontWeight:700, fontSize:13, color:MAIN, marginBottom:2 }}>{n.title}</div>
                        {n.body && <div style={{ fontSize:12, color:SUB }}>{n.body}</div>}
                      </td>
                      {/* Date */}
                      <td style={{ ...TD, fontSize:11, color:SUB, whiteSpace:'nowrap' }}>{dateStr}</td>
                      {/* Telegram */}
                      <td style={TD}>
                        {n.delivered_at ? (
                          <span style={{ fontSize:12, color:'#2e7d32' }}>
                            ✅ {new Date(n.delivered_at).toLocaleString('en-GB', { hour:'2-digit', minute:'2-digit' })}
                          </span>
                        ) : (
                          <span style={{ fontSize:12, color:'#f57f17' }}>⏳ Not sent</span>
                        )}
                      </td>
                      {/* Actions */}
                      <td style={{ ...TD, textAlign:'center' }}>
                        {!n.is_read && (
                          <button onClick={() => markRead(n.id)}
                            style={{ ...s.btn('#f0f4f8', SUB), fontSize:11, padding:'5px 10px' }}>
                            Mark Read
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {/* Telegram setup hint */}
          <div style={{ background:'#fff8f0', borderTop:'1px solid #ffe0b2', padding:'12px 16px' }}>
            <span style={{ fontWeight:700, fontSize:12, color:'#e65100' }}>⚠️ TG Pending</span>
            <span style={{ fontSize:12, color:'#795548', marginLeft:8 }}>
              = employee has no Telegram Chat ID. Go to <strong>Administration → Employees</strong>,
              open the record, and paste their Chat ID (they get it by sending <code>/start</code> to your bot).
            </span>
          </div>

        </div>
      </div>{/* end scroll zone */}

    </div>
  )
}
