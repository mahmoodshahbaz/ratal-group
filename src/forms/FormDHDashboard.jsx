/**
 * FormDHDashboard.jsx — DH Command Centre
 * Route: /forms/dh-dashboard
 * Auth:  useFieldAuth — STAFF_DH or STAFF_PM only
 *
 * 5 Panels:
 *  1. 💰 Cash Ledger        — advances issued, outstanding per employee (useDHLedger)
 *  2. 📍 Site Progress      — milestone % per active assignment
 *  3. 🧾 Expense Claims     — claims awaiting DH approval
 *  4. 👥 Team Overview      — who is assigned where today
 *  5. 🔔 Notifications      — recent unread messages
 */

import { useState, useEffect, useCallback } from 'react'
import { useFieldAuth, ROLE_COLORS }          from '../lib/useFieldAuth'
import { useDHLedger }                         from '../lib/useDHLedger'
import { supabase }                            from '../lib/supabase'

// ── Shared tokens ─────────────────────────────────────────────────────────────
const C = {
  blue:    '#1565c0',
  green:   '#2e7d32',
  orange:  '#e65100',
  red:     '#c62828',
  purple:  '#6a1b9a',
  grey:    '#37474f',
  bg:      '#f0f4f8',
  card:    '#fff',
  border:  '#e8edf3',
  text:    '#1a2540',
  muted:   '#6b7c93',
}

const S = {
  page:    { minHeight:'100vh', background:C.bg, paddingBottom:40 },
  header:  { background:'linear-gradient(135deg,#1a2540,#263859)', color:'#fff', padding:'20px 18px 16px' },
  h1:      { fontSize:20, fontWeight:900, marginBottom:2 },
  sub:     { fontSize:12, opacity:0.7 },
  tabs:    { display:'flex', gap:6, padding:'12px 14px', overflowX:'auto', scrollbarWidth:'none', background:'#fff', borderBottom:`1px solid ${C.border}` },
  tab:     (active,color) => ({ padding:'8px 14px', borderRadius:20, fontWeight:700, fontSize:12, cursor:'pointer', whiteSpace:'nowrap', border:`2px solid ${active ? color : C.border}`, background: active ? color+'18' : 'transparent', color: active ? color : C.muted, transition:'all 0.15s' }),
  body:    { padding:'14px 14px 0' },
  card:    { background:C.card, borderRadius:16, padding:16, marginBottom:12, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' },
  kpiRow:  { display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:12 },
  kpi:     (color) => ({ background:color+'14', borderRadius:14, padding:'12px 10px', textAlign:'center' }),
  kpiNum:  (color) => ({ fontSize:20, fontWeight:900, color, marginBottom:2 }),
  kpiLbl:  { fontSize:10, color:C.muted, fontWeight:600, lineHeight:1.3 },
  row:     { display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:`1px solid ${C.border}` },
  avatar:  (color) => ({ width:36, height:36, borderRadius:12, background:color+'22', color, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, flexShrink:0 }),
  bar:     (pct,color) => ({ height:6, borderRadius:4, background:color+'25', overflow:'hidden', marginTop:4, position:'relative' }),
  barFill: (pct,color) => ({ position:'absolute', inset:0, width:`${pct}%`, background:color, borderRadius:4, transition:'width 0.4s' }),
  badge:   (color) => ({ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:color+'22', color, display:'inline-block' }),
  emptyBox:{ textAlign:'center', padding:'32px 0', color:C.muted, fontSize:13 },
  refreshBtn: { padding:'6px 14px', borderRadius:20, border:`1.5px solid ${C.border}`, background:'#fff', fontSize:12, cursor:'pointer', color:C.muted, fontWeight:600 },
  approveBtn: { padding:'6px 14px', borderRadius:20, border:'none', background:C.green, color:'#fff', fontSize:12, cursor:'pointer', fontWeight:700, marginLeft:4 },
}

const fmt = (n) => n?.toLocaleString('en-SA', { minimumFractionDigits:0, maximumFractionDigits:0 }) || '0'
const initials = (name) => (name || '?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase()

// ── Panel colours per tab ─────────────────────────────────────────────────────
const TABS = [
  { key:'cash',    label:'💰 Cash',    color: C.orange  },
  { key:'sites',   label:'📍 Sites',   color: C.green   },
  { key:'claims',  label:'🧾 Claims',  color: C.blue    },
  { key:'subcon',  label:'🔨 Sub-Con', color: '#00695c' },
  { key:'fleet',   label:'🚗 Fleet',   color: '#4e342e' },
  { key:'team',    label:'👥 Team',    color: C.purple  },
  { key:'notifs',  label:'🔔 Alerts',  color: C.red     },
]

// ── Auth guard ────────────────────────────────────────────────────────────────
function AuthGuard({ error, role }) {
  if (role && !['STAFF_DH','STAFF_PM','FINANCE'].includes(role)) {
    return (
      <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ ...S.card, textAlign:'center', padding:32, borderRadius:20, maxWidth:340 }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🚫</div>
          <div style={{ fontWeight:800, color:C.red, marginBottom:8 }}>Access Restricted</div>
          <div style={{ color:C.muted, fontSize:13 }}>The DH Command Centre is only available to Department Heads, Project Managers, and Finance.</div>
        </div>
      </div>
    )
  }
  const msgs = {
    no_token:          { icon:'🔒', title:'Scan QR Code', body:'Please scan your QR code to access the Command Centre.' },
    invalid_token:     { icon:'❌', title:'Invalid QR',   body:'This QR code is not recognised.' },
    token_inactive:    { icon:'⛔', title:'QR Expired',   body:'This QR code has been deactivated.' },
    employee_inactive: { icon:'🚫', title:'Account Inactive', body:'Your account is not active.' },
  }
  const m = msgs[error] || msgs.no_token
  return (
    <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ ...S.card, textAlign:'center', padding:40, borderRadius:20, maxWidth:340 }}>
        <div style={{ fontSize:56, marginBottom:12 }}>{m.icon}</div>
        <div style={{ fontWeight:800, color:C.red, marginBottom:8 }}>{m.title}</div>
        <div style={{ color:C.muted, fontSize:13 }}>{m.body}</div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL 1 — Cash Ledger
// ═══════════════════════════════════════════════════════════════════════════════
function PanelCash({ employee, entityId }) {
  const { loading, employees, summary, refresh } = useDHLedger(employee?.id, entityId)

  if (loading) return <div style={S.emptyBox}>Loading cash ledger…</div>

  const aging = (days) => {
    if (days >= 60) return { label:`${days}d ⚠️`, color:C.red }
    if (days >= 30) return { label:`${days}d`,     color:C.orange }
    return                  { label:`${days}d`,     color:C.green }
  }

  return (
    <div>
      {/* KPIs */}
      <div style={S.kpiRow}>
        <div style={S.kpi(C.orange)}>
          <div style={S.kpiNum(C.orange)}>SAR {fmt(summary.outstanding)}</div>
          <div style={S.kpiLbl}>Outstanding</div>
        </div>
        <div style={S.kpi(C.blue)}>
          <div style={S.kpiNum(C.blue)}>{fmt(summary.employee_count)}</div>
          <div style={S.kpiLbl}>Employees with balance</div>
        </div>
        <div style={S.kpi(C.green)}>
          <div style={S.kpiNum(C.green)}>SAR {fmt(summary.total_recovered)}</div>
          <div style={S.kpiLbl}>Total Recovered</div>
        </div>
      </div>

      {/* Employee rows */}
      <div style={S.card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontWeight:800, fontSize:14, color:C.text }}>Cash by Employee</div>
          <button style={S.refreshBtn} onClick={refresh}>↻ Refresh</button>
        </div>
        {employees.length === 0 && <div style={S.emptyBox}>No advances issued yet.</div>}
        {employees.map(e => {
          const ag = aging(e.days_oldest)
          const bal = e.current_balance
          return (
            <div key={e.employee?.id} style={S.row}>
              <div style={S.avatar(bal > 0 ? C.orange : C.green)}>
                {initials(e.employee?.full_name_en)}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:13, color:C.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {e.employee?.full_name_en}
                </div>
                <div style={{ fontSize:11, color:C.muted }}>{e.employee?.department?.dept_name}</div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontWeight:800, fontSize:13, color: bal > 0 ? C.orange : C.green }}>
                  SAR {fmt(bal)}
                </div>
                {bal > 0 && <div style={{ fontSize:10, color:ag.color }}>{ag.label}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL 2 — Site Progress
// ═══════════════════════════════════════════════════════════════════════════════
function PanelSites({ employee, entityId }) {
  const [sites, setSites]     = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    // Load all assignments (filter by entity if available)
    let q = supabase
      .from('site_assignments')
      .select(`
        id, site_number, site_name, scope_type,
        completion_pct, last_status_at, completed_milestones,
        employee:employee_id ( full_name_en, full_name_ar ),
        project:project_id   ( project_number, project_name )
      `)
      .eq('is_active', true)
      .order('completion_pct', { ascending: true })
      .limit(30)
    if (entityId) q = q.eq('entity_id', entityId)
    const { data } = await q
    setSites(data || [])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={S.emptyBox}>Loading site data…</div>
  if (!sites.length) return <div style={S.emptyBox}>📍 No active site assignments found.</div>

  const avg = sites.length ? Math.round(sites.reduce((s,x) => s + (x.completion_pct||0), 0) / sites.length) : 0

  const scopeColor = (s) => ({
    TOWER_INSTALLATION:'#b71c1c', ACTIVE_INSTALLATION:'#1565c0',
    CIVIL:'#5d4037', FIBRE:'#1b5e20', DOCUMENTATION:'#4a148c',
    TESTING:'#e65100', GENERAL:C.grey,
  })[s] || C.grey

  return (
    <div>
      <div style={S.kpiRow}>
        <div style={S.kpi(C.blue)}>
          <div style={S.kpiNum(C.blue)}>{sites.length}</div>
          <div style={S.kpiLbl}>Active Sites</div>
        </div>
        <div style={S.kpi(C.green)}>
          <div style={S.kpiNum(C.green)}>{avg}%</div>
          <div style={S.kpiLbl}>Avg Progress</div>
        </div>
        <div style={S.kpi(C.orange)}>
          <div style={S.kpiNum(C.orange)}>{sites.filter(s=>(s.completion_pct||0)===100).length}</div>
          <div style={S.kpiLbl}>Complete</div>
        </div>
      </div>

      <div style={S.card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontWeight:800, fontSize:14, color:C.text }}>Site Milestones</div>
          <button style={S.refreshBtn} onClick={load}>↻</button>
        </div>
        {sites.map(site => {
          const pct   = site.completion_pct || 0
          const color = pct === 100 ? C.green : pct >= 50 ? C.blue : C.orange
          const sc    = scopeColor(site.scope_type)
          return (
            <div key={site.id} style={{ ...S.row, flexDirection:'column', alignItems:'stretch', paddingBottom:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <span style={S.badge(sc)}>{(site.scope_type||'GENERAL').replace(/_/g,' ')}</span>
                <div style={{ flex:1 }}/>
                <span style={{ fontWeight:800, fontSize:12, color }}>{pct}%</span>
              </div>
              <div style={{ fontWeight:700, fontSize:13, color:C.text }}>
                {site.site_number} {site.site_name ? `· ${site.site_name}` : ''}
              </div>
              {site.project && (
                <div style={{ fontSize:11, color:C.muted }}>{site.project.project_name}</div>
              )}
              <div style={{ fontSize:11, color:C.muted }}>
                {site.employee?.full_name_en}
                {site.last_status_at && ` · Last update: ${new Date(site.last_status_at).toLocaleDateString('en-GB')}`}
              </div>
              <div style={S.bar(pct, color)}>
                <div style={S.barFill(pct, color)} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL 3 — Expense Claims
// ═══════════════════════════════════════════════════════════════════════════════
const CLAIM_STATUS_COLORS = {
  DRAFT:'#607d8b', SUBMITTED:C.blue, DH_APPROVED:C.green,
  REJECTED:C.red, FINANCE_APPROVED:'#2e7d32', PAID:'#1b5e20',
}

function PanelClaims({ employee, entityId }) {
  const [claims, setClaims]   = useState([])
  const [loading, setLoading] = useState(true)
  const [approvingId, setApprovingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('expense_claims')
      .select(`
        id, claim_number, period, status,
        total_advances_received, total_claimed, balance_with_employee,
        submitted_at, dh_approved_at,
        employee:employee_id ( full_name_en, full_name_ar )
      `)
      .order('submitted_at', { ascending: false })
      .limit(40)
    if (entityId) q = q.eq('entity_id', entityId)
    const { data } = await q
    setClaims(data || [])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  async function approveClaim(claimId) {
    setApprovingId(claimId)
    await supabase.from('expense_claims').update({
      status: 'DH_APPROVED',
      dh_approved_at: new Date().toISOString(),
      dh_approved_by: employee?.id,
    }).eq('id', claimId)
    load()
    setApprovingId(null)
  }

  if (loading) return <div style={S.emptyBox}>Loading claims…</div>

  const pending = claims.filter(c => c.status === 'SUBMITTED')
  const others  = claims.filter(c => c.status !== 'SUBMITTED')

  return (
    <div>
      <div style={S.kpiRow}>
        <div style={S.kpi(C.orange)}>
          <div style={S.kpiNum(C.orange)}>{pending.length}</div>
          <div style={S.kpiLbl}>Pending Approval</div>
        </div>
        <div style={S.kpi(C.blue)}>
          <div style={S.kpiNum(C.blue)}>{claims.length}</div>
          <div style={S.kpiLbl}>Total Claims</div>
        </div>
        <div style={S.kpi(C.green)}>
          <div style={S.kpiNum(C.green)}>
            SAR {fmt(pending.reduce((s,c) => s + (parseFloat(c.total_claimed)||0), 0))}
          </div>
          <div style={S.kpiLbl}>Pending Value</div>
        </div>
      </div>

      {/* Pending approval */}
      {pending.length > 0 && (
        <div style={S.card}>
          <div style={{ fontWeight:800, fontSize:14, color:C.orange, marginBottom:10 }}>⚡ Awaiting Your Approval</div>
          {pending.map(c => (
            <div key={c.id} style={S.row}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:13, color:C.text }}>{c.employee?.full_name_en}</div>
                <div style={{ fontSize:11, color:C.muted }}>
                  {c.claim_number} · {c.period} · SAR {fmt(c.total_claimed)}
                </div>
                {c.balance_with_employee > 0 && (
                  <div style={{ fontSize:11, color:C.orange }}>Returns SAR {fmt(c.balance_with_employee)}</div>
                )}
                {c.balance_with_employee < 0 && (
                  <div style={{ fontSize:11, color:C.green }}>Owed SAR {fmt(Math.abs(c.balance_with_employee))}</div>
                )}
              </div>
              <button
                style={{ ...S.approveBtn, opacity: approvingId===c.id ? 0.6 : 1 }}
                disabled={approvingId===c.id}
                onClick={() => approveClaim(c.id)}>
                {approvingId===c.id ? '…' : '✓ Approve'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Recent claims history */}
      {others.length > 0 && (
        <div style={S.card}>
          <div style={{ fontWeight:800, fontSize:14, color:C.text, marginBottom:10 }}>Recent Claims</div>
          {others.slice(0,10).map(c => {
            const sc = CLAIM_STATUS_COLORS[c.status] || C.muted
            return (
              <div key={c.id} style={S.row}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:C.text }}>{c.employee?.full_name_en}</div>
                  <div style={{ fontSize:11, color:C.muted }}>{c.claim_number} · {c.period} · SAR {fmt(c.total_claimed)}</div>
                </div>
                <span style={S.badge(sc)}>{c.status.replace(/_/g,' ')}</span>
              </div>
            )
          })}
        </div>
      )}

      {claims.length === 0 && <div style={S.emptyBox}>No expense claims found.</div>}
      <div style={{ textAlign:'right' }}>
        <button style={S.refreshBtn} onClick={load}>↻ Refresh</button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL 3b — Sub-Contractor Claims
// ═══════════════════════════════════════════════════════════════════════════════
const SC_STATUS_COLORS = {
  SUBMITTED:'#1565c0', DH_APPROVED:'#2e7d32', REJECTED:'#c62828',
  FINANCE_APPROVED:'#1b5e20', PAID:'#004d40',
}
const TEAL = '#00695c'

function PanelSubCon({ employee, entityId }) {
  const [claims,      setClaims]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [actionId,    setActionId]    = useState(null)       // ID being approved/rejected
  const [rejectId,    setRejectId]    = useState(null)       // ID showing reject modal
  const [rejectNote,  setRejectNote]  = useState('')
  const [expandId,    setExpandId]    = useState(null)       // ID showing detail

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('subcon_claims')
      .select(`
        id, claim_number, claim_month, claim_year, claim_type,
        site_name, scope_type, work_description,
        claim_amount, vat_pct, status,
        submitted_at, dh_approved_at, dh_rejection_reason,
        photo_url, photo_url_2, document_url,
        employee:employee_id ( full_name_en, full_name_ar, mobile_number ),
        contractor:contractor_id ( contractor_name )
      `)
      .order('submitted_at', { ascending: false })
      .limit(50)
    if (entityId) q = q.eq('entity_id', entityId)
    const { data } = await q
    setClaims(data || [])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  async function approveClaim(claimId) {
    setActionId(claimId)
    await supabase.from('subcon_claims').update({
      status:         'DH_APPROVED',
      dh_approved_at: new Date().toISOString(),
      dh_approved_by: employee?.id,
    }).eq('id', claimId)
    // Notify submitter
    const claim = claims.find(c => c.id === claimId)
    if (claim?.employee_id) {
      await supabase.from('notifications').insert({
        entity_id:      entityId,
        employee_id:    claim.employee_id,
        type:           'APPROVAL',
        title:          'Sub-Con Claim Approved',
        body:           `Your claim ${claim.claim_number} for SAR ${fmt(claim.claim_amount)} has been approved.`,
        reference_type: 'subcon_claim',
        reference_id:   claimId,
        is_read:        false,
      }).maybeSingle()
    }
    await load()
    setActionId(null)
  }

  async function rejectClaim() {
    if (!rejectNote.trim()) return
    setActionId(rejectId)
    await supabase.from('subcon_claims').update({
      status:               'REJECTED',
      dh_rejection_reason:  rejectNote.trim(),
      dh_approved_by:       employee?.id,
    }).eq('id', rejectId)
    // Notify submitter
    const claim = claims.find(c => c.id === rejectId)
    if (claim?.employee_id) {
      await supabase.from('notifications').insert({
        entity_id:      entityId,
        employee_id:    claim.employee_id,
        type:           'APPROVAL',
        title:          'Sub-Con Claim Rejected',
        body:           `Your claim ${claim.claim_number} was rejected. Reason: ${rejectNote.trim()}`,
        reference_type: 'subcon_claim',
        reference_id:   rejectId,
        is_read:        false,
      }).maybeSingle()
    }
    setRejectId(null)
    setRejectNote('')
    await load()
    setActionId(null)
  }

  if (loading) return <div style={S.emptyBox}>Loading sub-con claims…</div>

  const pending  = claims.filter(c => c.status === 'SUBMITTED')
  const approved = claims.filter(c => c.status === 'DH_APPROVED')
  const others   = claims.filter(c => !['SUBMITTED'].includes(c.status))
  const pendingVal = pending.reduce((s,c) => s + (parseFloat(c.claim_amount)||0), 0)

  return (
    <div>
      {/* Reject modal */}
      {rejectId && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:20, padding:24, width:'100%', maxWidth:360 }}>
            <div style={{ fontWeight:800, fontSize:15, color:C.red, marginBottom:12 }}>✕ Reject Claim</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:10 }}>
              {claims.find(c=>c.id===rejectId)?.claim_number} — {claims.find(c=>c.id===rejectId)?.employee?.full_name_en}
            </div>
            <textarea
              placeholder="Reason for rejection (required)…"
              value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              rows={3}
              style={{ width:'100%', borderRadius:10, border:`1.5px solid ${C.border}`, padding:'10px 12px', fontSize:13, resize:'none', boxSizing:'border-box', marginBottom:14 }}
            />
            <div style={{ display:'flex', gap:10 }}>
              <button
                onClick={() => { setRejectId(null); setRejectNote('') }}
                style={{ flex:1, padding:'10px 0', borderRadius:12, border:`1.5px solid ${C.border}`, background:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                Cancel
              </button>
              <button
                onClick={rejectClaim}
                disabled={!rejectNote.trim() || actionId===rejectId}
                style={{ flex:1, padding:'10px 0', borderRadius:12, border:'none', background: rejectNote.trim() ? C.red : '#ccc', color:'#fff', fontWeight:800, fontSize:13, cursor:'pointer' }}>
                {actionId===rejectId ? '…' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={S.kpiRow}>
        <div style={S.kpi(TEAL)}>
          <div style={S.kpiNum(TEAL)}>{pending.length}</div>
          <div style={S.kpiLbl}>Pending Approval</div>
        </div>
        <div style={S.kpi(C.blue)}>
          <div style={S.kpiNum(C.blue)}>SAR {fmt(pendingVal)}</div>
          <div style={S.kpiLbl}>Pending Value</div>
        </div>
        <div style={S.kpi(C.green)}>
          <div style={S.kpiNum(C.green)}>{approved.length}</div>
          <div style={S.kpiLbl}>Approved</div>
        </div>
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div style={S.card}>
          <div style={{ fontWeight:800, fontSize:14, color:TEAL, marginBottom:10 }}>⚡ Awaiting Your Approval</div>
          {pending.map(c => {
            const isExpanded = expandId === c.id
            const vatAmt = (parseFloat(c.claim_amount)||0) * ((parseFloat(c.vat_pct)||15)/100)
            const total  = (parseFloat(c.claim_amount)||0) + vatAmt
            return (
              <div key={c.id} style={{ ...S.row, flexDirection:'column', alignItems:'stretch', paddingBottom:14 }}>
                {/* Header row */}
                <div style={{ display:'flex', alignItems:'center', gap:8 }} onClick={() => setExpandId(isExpanded ? null : c.id)}>
                  <div style={S.avatar(TEAL)}>{initials(c.employee?.full_name_en)}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13, color:C.text }}>{c.employee?.full_name_en}</div>
                    <div style={{ fontSize:11, color:C.muted }}>
                      {c.claim_number} · {c.claim_month}/{c.claim_year} · {(c.claim_type||'').replace(/_/g,' ')}
                    </div>
                    <div style={{ fontSize:11, color:TEAL, fontWeight:600 }}>{c.site_name}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontWeight:800, fontSize:13, color:TEAL }}>SAR {fmt(total)}</div>
                    <div style={{ fontSize:10, color:C.muted }}>incl. VAT</div>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ background:'#f8fffe', borderRadius:10, padding:'10px 12px', marginTop:8, fontSize:12, color:C.text }}>
                    {c.work_description && (
                      <div style={{ marginBottom:6 }}><b>Work done:</b> {c.work_description}</div>
                    )}
                    <div style={{ display:'flex', gap:12, marginBottom:6 }}>
                      <div><b>Claim:</b> SAR {fmt(c.claim_amount)}</div>
                      <div><b>VAT:</b> SAR {fmt(vatAmt)}</div>
                      <div><b>Total:</b> SAR {fmt(total)}</div>
                    </div>
                    {c.contractor?.contractor_name && (
                      <div style={{ marginBottom:6 }}><b>Contractor:</b> {c.contractor.contractor_name}</div>
                    )}
                    {/* Photo links */}
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginTop:4 }}>
                      {c.photo_url    && <a href={c.photo_url}    target="_blank" rel="noreferrer" style={{ fontSize:11, color:C.blue }}>📷 Photo 1</a>}
                      {c.photo_url_2  && <a href={c.photo_url_2}  target="_blank" rel="noreferrer" style={{ fontSize:11, color:C.blue }}>📷 Photo 2</a>}
                      {c.document_url && <a href={c.document_url} target="_blank" rel="noreferrer" style={{ fontSize:11, color:C.blue }}>📄 Document</a>}
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display:'flex', gap:8, marginTop:10 }}>
                  <button
                    style={{ flex:1, padding:'9px 0', borderRadius:12, border:'none', background: actionId===c.id ? '#ccc' : C.green, color:'#fff', fontWeight:800, fontSize:13, cursor:'pointer' }}
                    disabled={!!actionId}
                    onClick={() => approveClaim(c.id)}>
                    {actionId===c.id ? '…' : '✓ Approve'}
                  </button>
                  <button
                    style={{ flex:1, padding:'9px 0', borderRadius:12, border:`1.5px solid ${C.red}`, background:'#fff', color:C.red, fontWeight:800, fontSize:13, cursor:'pointer' }}
                    disabled={!!actionId}
                    onClick={() => { setRejectId(c.id); setRejectNote('') }}>
                    ✕ Reject
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* History */}
      {others.length > 0 && (
        <div style={S.card}>
          <div style={{ fontWeight:800, fontSize:14, color:C.text, marginBottom:10 }}>Recent Claims</div>
          {others.slice(0,15).map(c => {
            const sc = SC_STATUS_COLORS[c.status] || C.muted
            return (
              <div key={c.id} style={S.row}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:C.text }}>{c.employee?.full_name_en}</div>
                  <div style={{ fontSize:11, color:C.muted }}>
                    {c.claim_number} · {c.site_name} · SAR {fmt(c.claim_amount)}
                  </div>
                  {c.status === 'REJECTED' && c.dh_rejection_reason && (
                    <div style={{ fontSize:11, color:C.red }}>Reason: {c.dh_rejection_reason}</div>
                  )}
                </div>
                <span style={S.badge(sc)}>{c.status.replace(/_/g,' ')}</span>
              </div>
            )
          })}
        </div>
      )}

      {claims.length === 0 && <div style={S.emptyBox}>No sub-con claims found.</div>}
      <div style={{ textAlign:'right' }}>
        <button style={S.refreshBtn} onClick={load}>↻ Refresh</button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL 3c — Fleet Incidents & Maintenance
// ═══════════════════════════════════════════════════════════════════════════════
const BROWN = '#4e342e'
const URGENCY_COLOR = { LOW: C.green, MEDIUM: C.orange, HIGH: C.red, CRITICAL: '#7b0000' }
const LOG_ICONS     = { FUEL:'⛽', MAINTENANCE:'🔧', INCIDENT:'⚠️', INSPECTION:'📋' }

function PanelFleet({ employee, entityId }) {
  const [logs,        setLogs]        = useState([])
  const [loading,     setLoading]     = useState(true)
  const [actionId,    setActionId]    = useState(null)
  const [resolveId,   setResolveId]   = useState(null)
  const [resolveNote, setResolveNote] = useState('')
  const [tab,         setTab]         = useState('incidents')  // 'incidents' | 'maintenance' | 'fuel'

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('vehicle_maintenance')
      .select(`
        id, log_type, maintenance_type, status, urgency,
        service_date, description, location,
        fuel_liters, fuel_amount, cost,
        photo_url, photo_url_2,
        odometer_at_service,
        acknowledged_at,
        vehicle:vehicle_id ( plate_number, make, model, color ),
        submitter:submitted_by ( full_name_en ),
        ack_by:acknowledged_by ( full_name_en )
      `)
      .order('service_date', { ascending: false })
      .limit(60)
    if (entityId) q = q.eq('entity_id', entityId)
    const { data } = await q
    setLogs(data || [])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  async function acknowledge(logId) {
    setActionId(logId)
    await supabase.from('vehicle_maintenance').update({
      status:          'ACKNOWLEDGED',
      acknowledged_by: employee?.id,
      acknowledged_at: new Date().toISOString(),
    }).eq('id', logId)
    await load()
    setActionId(null)
  }

  async function resolve() {
    setActionId(resolveId)
    await supabase.from('vehicle_maintenance').update({
      status:      'RESOLVED',
      description: resolveNote.trim() || undefined,
    }).eq('id', resolveId)
    setResolveId(null)
    setResolveNote('')
    await load()
    setActionId(null)
  }

  if (loading) return <div style={S.emptyBox}>Loading fleet data…</div>

  const incidents   = logs.filter(l => l.log_type === 'INCIDENT')
  const maintenance = logs.filter(l => l.log_type === 'MAINTENANCE')
  const fuel        = logs.filter(l => l.log_type === 'FUEL')
  const openInc     = incidents.filter(l => l.status === 'OPEN')
  const openMaint   = maintenance.filter(l => ['OPEN','ACKNOWLEDGED'].includes(l.status) && ['HIGH','CRITICAL'].includes(l.urgency))

  const innerTab = (key, label, count, color) => (
    <div
      onClick={() => setTab(key)}
      style={{ padding:'6px 12px', borderRadius:16, fontWeight:700, fontSize:11, cursor:'pointer', whiteSpace:'nowrap',
        border:`1.5px solid ${tab===key ? color : C.border}`,
        background: tab===key ? color+'18' : 'transparent',
        color: tab===key ? color : C.muted }}>
      {label}{count > 0 ? ` (${count})` : ''}
    </div>
  )

  const visibleLogs = tab === 'incidents' ? incidents : tab === 'maintenance' ? maintenance : fuel

  return (
    <div>
      {/* Resolve modal */}
      {resolveId && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'#fff', borderRadius:20, padding:24, width:'100%', maxWidth:360 }}>
            <div style={{ fontWeight:800, fontSize:15, color:C.green, marginBottom:12 }}>✓ Mark as Resolved</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:10 }}>
              {logs.find(l=>l.id===resolveId)?.vehicle?.plate_number} — {logs.find(l=>l.id===resolveId)?.maintenance_type}
            </div>
            <textarea
              placeholder="Resolution notes (optional)…"
              value={resolveNote}
              onChange={e => setResolveNote(e.target.value)}
              rows={3}
              style={{ width:'100%', borderRadius:10, border:`1.5px solid ${C.border}`, padding:'10px 12px', fontSize:13, resize:'none', boxSizing:'border-box', marginBottom:14 }}
            />
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={() => { setResolveId(null); setResolveNote('') }}
                style={{ flex:1, padding:'10px 0', borderRadius:12, border:`1.5px solid ${C.border}`, background:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={resolve} disabled={actionId===resolveId}
                style={{ flex:1, padding:'10px 0', borderRadius:12, border:'none', background:C.green, color:'#fff', fontWeight:800, fontSize:13, cursor:'pointer' }}>
                {actionId===resolveId ? '…' : 'Resolve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={S.kpiRow}>
        <div style={S.kpi(C.red)}>
          <div style={S.kpiNum(C.red)}>{openInc.length}</div>
          <div style={S.kpiLbl}>Open Incidents</div>
        </div>
        <div style={S.kpi(C.orange)}>
          <div style={S.kpiNum(C.orange)}>{openMaint.length}</div>
          <div style={S.kpiLbl}>High Priority Maint.</div>
        </div>
        <div style={S.kpi(BROWN)}>
          <div style={S.kpiNum(BROWN)}>{logs.length}</div>
          <div style={S.kpiLbl}>Total Logs</div>
        </div>
      </div>

      {/* Alert bar for unacknowledged incidents */}
      {openInc.length > 0 && (
        <div style={{ background:'#ffebee', border:`1.5px solid ${C.red}`, borderRadius:12, padding:'10px 14px', marginBottom:12, display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ fontSize:20 }}>⚠️</div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:800, color:C.red, fontSize:13 }}>
              {openInc.length} unacknowledged incident{openInc.length>1?'s':''} require your attention
            </div>
            <div style={{ fontSize:11, color:C.muted }}>Tap the Incidents tab below to review and acknowledge</div>
          </div>
        </div>
      )}

      {/* Inner tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:12, overflowX:'auto', scrollbarWidth:'none' }}>
        {innerTab('incidents',   '⚠️ Incidents',   openInc.length,   C.red)}
        {innerTab('maintenance', '🔧 Maintenance', openMaint.length, C.orange)}
        {innerTab('fuel',        '⛽ Fuel Logs',   0,                BROWN)}
      </div>

      {/* Log cards */}
      <div style={S.card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontWeight:800, fontSize:14, color:C.text }}>
            {tab === 'incidents' ? 'Incident Reports' : tab === 'maintenance' ? 'Maintenance Requests' : 'Fuel Logs'}
          </div>
          <button style={S.refreshBtn} onClick={load}>↻</button>
        </div>

        {visibleLogs.length === 0 && <div style={S.emptyBox}>No records found.</div>}

        {visibleLogs.map(log => {
          const uc    = URGENCY_COLOR[log.urgency] || C.grey
          const isOpen = log.status === 'OPEN'
          const isAck  = log.status === 'ACKNOWLEDGED'
          const isDone = ['RESOLVED','CLOSED'].includes(log.status)
          const stColor = isOpen ? C.red : isAck ? C.orange : C.green

          return (
            <div key={log.id} style={{ ...S.row, flexDirection:'column', alignItems:'stretch', paddingBottom:12 }}>
              {/* Top row */}
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ fontSize:22, flexShrink:0 }}>{LOG_ICONS[log.log_type] || '🔧'}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:C.text }}>
                    {log.vehicle?.plate_number} — {log.vehicle?.make} {log.vehicle?.model}
                  </div>
                  <div style={{ fontSize:11, color:C.muted }}>
                    {log.submitter?.full_name_en} · {new Date(log.service_date).toLocaleDateString('en-GB')}
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
                  <span style={S.badge(stColor)}>{log.status}</span>
                  {log.urgency && log.log_type !== 'FUEL' && (
                    <span style={{ fontSize:9, fontWeight:700, color:uc }}>{log.urgency}</span>
                  )}
                </div>
              </div>

              {/* Detail */}
              {log.description && (
                <div style={{ fontSize:12, color:C.text, marginTop:6, background:'#f8f9fa', borderRadius:8, padding:'6px 10px' }}>
                  {log.description}
                </div>
              )}
              {log.location && (
                <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>📍 {log.location}</div>
              )}
              {log.log_type === 'FUEL' && (
                <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>
                  {log.fuel_liters}L · SAR {fmt(log.fuel_amount)}
                  {log.odometer_at_service ? ` · ${log.odometer_at_service.toLocaleString()} km` : ''}
                </div>
              )}

              {/* Photos */}
              {(log.photo_url || log.photo_url_2) && (
                <div style={{ display:'flex', gap:8, marginTop:6 }}>
                  {log.photo_url   && <a href={log.photo_url}   target="_blank" rel="noreferrer" style={{ fontSize:11, color:C.blue }}>📷 Photo 1</a>}
                  {log.photo_url_2 && <a href={log.photo_url_2} target="_blank" rel="noreferrer" style={{ fontSize:11, color:C.blue }}>📷 Photo 2</a>}
                </div>
              )}

              {/* Ack info */}
              {log.acknowledged_at && log.ack_by && (
                <div style={{ fontSize:10, color:C.green, marginTop:4 }}>
                  ✓ Acknowledged by {log.ack_by.full_name_en} · {new Date(log.acknowledged_at).toLocaleDateString('en-GB')}
                </div>
              )}

              {/* Action buttons */}
              {(isOpen || isAck) && log.log_type !== 'FUEL' && (
                <div style={{ display:'flex', gap:8, marginTop:10 }}>
                  {isOpen && (
                    <button
                      disabled={!!actionId}
                      onClick={() => acknowledge(log.id)}
                      style={{ flex:1, padding:'8px 0', borderRadius:12, border:'none', background: actionId===log.id ? '#ccc' : C.orange, color:'#fff', fontWeight:800, fontSize:12, cursor:'pointer' }}>
                      {actionId===log.id ? '…' : '👁 Acknowledge'}
                    </button>
                  )}
                  <button
                    disabled={!!actionId}
                    onClick={() => { setResolveId(log.id); setResolveNote('') }}
                    style={{ flex:1, padding:'8px 0', borderRadius:12, border:`1.5px solid ${C.green}`, background:'#fff', color:C.green, fontWeight:800, fontSize:12, cursor:'pointer' }}>
                    ✓ Resolve
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL 4 — Team Overview
// ═══════════════════════════════════════════════════════════════════════════════
function PanelTeam({ employee, entityId }) {
  const [team, setTeam]       = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('site_assignments')
      .select(`
        id, site_number, site_name, scope_type,
        assigned_from, assigned_to, role_on_site,
        completion_pct,
        employee:employee_id (
          id, full_name_en, full_name_ar,
          designation, mobile_number,
          department:department_id ( dept_name )
        ),
        project:project_id ( project_number, project_name ),
        contractor:contractor_id ( contractor_name )
      `)
      .eq('is_active', true)
      .order('assigned_from', { ascending: false })
      .limit(40)
    if (entityId) q = q.eq('entity_id', entityId)
    const { data } = await q
    setTeam(data || [])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  if (loading) return <div style={S.emptyBox}>Loading team…</div>
  if (!team.length) return <div style={S.emptyBox}>👥 No active assignments.</div>

  const scopeColors = { TOWER_INSTALLATION:'#b71c1c', ACTIVE_INSTALLATION:C.blue, CIVIL:'#5d4037', FIBRE:C.green, GENERAL:C.grey }

  return (
    <div>
      <div style={S.kpiRow}>
        <div style={S.kpi(C.purple)}>
          <div style={S.kpiNum(C.purple)}>{team.length}</div>
          <div style={S.kpiLbl}>Active Assignments</div>
        </div>
        <div style={S.kpi(C.blue)}>
          <div style={S.kpiNum(C.blue)}>{new Set(team.map(t=>t.employee?.id)).size}</div>
          <div style={S.kpiLbl}>People on Field</div>
        </div>
        <div style={S.kpi(C.green)}>
          <div style={S.kpiNum(C.green)}>{new Set(team.map(t=>t.project?.project_number)).size}</div>
          <div style={S.kpiLbl}>Projects</div>
        </div>
      </div>

      <div style={S.card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontWeight:800, fontSize:14, color:C.text }}>Field Team</div>
          <button style={S.refreshBtn} onClick={load}>↻</button>
        </div>
        {team.map(t => {
          const sc = scopeColors[t.scope_type] || C.grey
          return (
            <div key={t.id} style={S.row}>
              <div style={S.avatar(sc)}>
                {initials(t.employee?.full_name_en)}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:700, fontSize:13, color:C.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {t.employee?.full_name_en}
                </div>
                <div style={{ fontSize:11, color:C.muted }}>
                  {t.employee?.designation} · {t.employee?.department?.dept_name}
                </div>
                <div style={{ fontSize:11, color:sc, fontWeight:600 }}>
                  {t.site_number} {t.site_name ? `· ${t.site_name}` : ''}
                  {t.project ? ` — ${t.project.project_name}` : ''}
                </div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:12, fontWeight:800, color: (t.completion_pct||0) >= 100 ? C.green : C.blue }}>
                  {t.completion_pct || 0}%
                </div>
                {t.employee?.mobile_number && (
                  <a href={`tel:${t.employee.mobile_number}`}
                    style={{ fontSize:10, color:C.blue, textDecoration:'none' }}>
                    📞 Call
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// PANEL 5 — Notifications
// ═══════════════════════════════════════════════════════════════════════════════
const NOTIF_ICONS = {
  ADVANCE_ISSUED: '💸', CLAIM_SUBMITTED: '🧾', SITE_STATUS: '📍',
  APPROVAL: '✅', GENERAL: '🔔',
}

function PanelNotifications({ employee }) {
  const [notifs, setNotifs]   = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!employee?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('notifications')
      .select('id, type, title, body, is_read, created_at, metadata')
      .eq('employee_id', employee.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifs(data || [])
    setLoading(false)
  }, [employee?.id])

  useEffect(() => { load() }, [load])

  async function markRead(id) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifs(n => n.map(x => x.id===id ? { ...x, is_read:true } : x))
  }

  async function markAllRead() {
    await supabase.from('notifications').update({ is_read: true }).eq('employee_id', employee.id).eq('is_read', false)
    setNotifs(n => n.map(x => ({ ...x, is_read:true })))
  }

  if (loading) return <div style={S.emptyBox}>Loading notifications…</div>

  const unread = notifs.filter(n => !n.is_read)

  return (
    <div>
      <div style={S.kpiRow}>
        <div style={S.kpi(C.red)}>
          <div style={S.kpiNum(C.red)}>{unread.length}</div>
          <div style={S.kpiLbl}>Unread</div>
        </div>
        <div style={S.kpi(C.grey)}>
          <div style={S.kpiNum(C.grey)}>{notifs.length}</div>
          <div style={S.kpiLbl}>Total</div>
        </div>
        <div style={{ ...S.kpi(C.green), display:'flex', alignItems:'center', justifyContent:'center' }}>
          {unread.length > 0 && (
            <button style={{ border:'none', background:'none', color:C.green, fontWeight:700, fontSize:11, cursor:'pointer' }}
              onClick={markAllRead}>Mark all read</button>
          )}
        </div>
      </div>

      <div style={S.card}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontWeight:800, fontSize:14, color:C.text }}>Notifications</div>
          <button style={S.refreshBtn} onClick={load}>↻</button>
        </div>
        {notifs.length === 0 && <div style={S.emptyBox}>No notifications yet.</div>}
        {notifs.map(n => (
          <div key={n.id} style={{ ...S.row, background: n.is_read ? 'transparent' : '#fff8f0', borderRadius:8, padding:'10px 8px', marginBottom:4 }}
            onClick={() => !n.is_read && markRead(n.id)}>
            <div style={{ fontSize:24, flexShrink:0 }}>{NOTIF_ICONS[n.type] || '🔔'}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontWeight: n.is_read ? 500 : 800, fontSize:13, color:C.text }}>{n.title}</div>
              {n.body && <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{n.body}</div>}
              <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>
                {new Date(n.created_at).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
              </div>
            </div>
            {!n.is_read && (
              <div style={{ width:8, height:8, borderRadius:'50%', background:C.red, flexShrink:0 }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT
// ═══════════════════════════════════════════════════════════════════════════════
export default function FormDHDashboard() {
  const auth     = useFieldAuth()
  const [tab, setTab] = useState('cash')

  if (auth.loading) {
    return (
      <div style={{ minHeight:'100vh', background:C.bg, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center', color:C.muted }}>
          <div style={{ fontSize:36, marginBottom:12 }}>⏳</div>
          <div>Loading command centre…</div>
        </div>
      </div>
    )
  }

  if (auth.error) return <AuthGuard error={auth.error} />

  // Role check
  if (!['STAFF_DH','STAFF_PM','FINANCE'].includes(auth.role)) {
    return <AuthGuard error={null} role={auth.role} />
  }

  const roleColor = ROLE_COLORS[auth.role] || C.grey

  const PANEL_MAP = {
    cash:   <PanelCash        employee={auth.employee} entityId={auth.entityId} />,
    sites:  <PanelSites       employee={auth.employee} entityId={auth.entityId} />,
    claims: <PanelClaims      employee={auth.employee} entityId={auth.entityId} />,
    subcon: <PanelSubCon      employee={auth.employee} entityId={auth.entityId} />,
    fleet:  <PanelFleet       employee={auth.employee} entityId={auth.entityId} />,
    team:   <PanelTeam        employee={auth.employee} entityId={auth.entityId} />,
    notifs: <PanelNotifications employee={auth.employee} />,
  }

  const activeTab  = TABS.find(t => t.key === tab)

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={S.h1}>⚡ DH Command Centre</div>
            <div style={S.sub}>{auth.employee?.full_name_en} · {auth.employee?.designation}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            {auth.unreadCount > 0 && (
              <div style={{ background:C.red, color:'#fff', fontSize:11, fontWeight:800, padding:'3px 10px', borderRadius:20, display:'inline-block', cursor:'pointer' }}
                onClick={() => setTab('notifs')}>
                🔔 {auth.unreadCount}
              </div>
            )}
            <div style={{ fontSize:11, opacity:0.6, marginTop:4 }}>
              {new Date().toLocaleDateString('en-GB',{ weekday:'short', day:'2-digit', month:'short' })}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        {TABS.map(t => (
          <div key={t.key} style={S.tab(tab===t.key, t.color)} onClick={() => setTab(t.key)}>
            {t.label}
          </div>
        ))}
      </div>

      {/* Panel body */}
      <div style={S.body}>
        <div style={{ borderLeft:`3px solid ${activeTab?.color || C.grey}`, paddingLeft:10, marginBottom:14 }}>
          <div style={{ fontWeight:800, fontSize:15, color:activeTab?.color || C.text }}>{activeTab?.label}</div>
        </div>
        {PANEL_MAP[tab]}
      </div>
    </div>
  )
}
