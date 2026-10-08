import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.Operations
/**
 * FieldPayments.jsx — Field Payment Notifications (v2)
 *
 * Tabs:
 *   Sessions      — per-session list, expand to see lines + FIFO allocation summary
 *   Individual    — per-employee/subcon ledger of all amounts received
 *   Card Balance  — current float per card (topped-up − distributed − charges)
 *
 * Visibility:
 *   SUPERADMIN / ADMIN  → all depts, dept dropdown filter visible
 *   DEPT_HEAD           → own dept only, no dept switcher, no action buttons
 *
 * On Close (admin only): auto-post JE to journal_entries
 */
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ─── Lookups ──────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  SUBMITTED:    { bg:'#fff3e0', color:'#e65100', border:'#ffcc80' },
  ACKNOWLEDGED: { bg:'#e8eaf6', color:'#3949ab', border:'#9fa8da' },
  CLOSED:       { bg:'#e8f5e9', color:'#2e7d32', border:'#a5d6a7' },
}
const STATUS_NEXT   = { SUBMITTED:'ACKNOWLEDGED', ACKNOWLEDGED:'CLOSED' }
const STATUS_ACTION = { SUBMITTED:'Acknowledge', ACKNOWLEDGED:'Close & Post JE' }

const CARD_DISPLAY = {
  ANB77_C1:'ANB-77 · C1', ANB77_C2:'ANB-77 · C2', ANB77_C3:'ANB-77 · C3',
  ANB39_C1:'ANB-39 · C1 (Transfers)', ANB39_C2:'ANB-39 · C2 (POS)',
}

const CUSTODIAN_LABELS = {
  CUST_PETROL:'⛽ Petrol/Fuel',
  CUST_FOOD:'🍽️ Food/Meals',
  CUST_CASH:'💵 Cash Withdrawal',
  CUST_ACCOMMODATION:'🏨 Accommodation',
  CUST_TRANSPORT:'🚕 Transport/Taxi',
  CUST_MAINTENANCE:'🔧 Vehicle Maintenance',
  CUST_BANK_CHARGES:'🏦 Bank Charges',
  CUST_MISC:'📦 Miscellaneous',
}

const DEPT_COLORS = {
  TISU:'#1a6b3a', NISU:'#1a5c8b', CISU:'#7a3b1e', ITSU:'#5c1a7a',
}

const fmt = (n) =>
  new Intl.NumberFormat('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)

const isAdmin = (role) => role === 'SUPERADMIN' || role === 'ADMIN'

// ─── Component ────────────────────────────────────────────────────────────────
export default function FieldPayments({ entityId, role, userDept }) {
  const admin = isAdmin(role)
  const [tab, setTab] = useState('sessions') // sessions | individual | card_balance

  return (
    <div style={{ padding: '24px 28px', fontFamily: "'Poppins', sans-serif" }}>
      {/* subtitle */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>
          {admin ? 'All departments' : `${userDept} — dept view`} · ATM card distributions
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '2px solid #e0e0e0', marginBottom: 24 }}>
        {[
          { key: 'sessions',       label: '📋 Sessions' },
          { key: 'individual',     label: '👤 Individual Ledger' },
          ...(admin ? [{ key: 'card_balance', label: '🏦 Card Balance' }] : []),
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '9px 18px',
              border: 'none',
              borderBottom: tab === t.key ? '3px solid #0D5C4E' : '3px solid transparent',
              background: 'none',
              fontWeight: tab === t.key ? 700 : 400,
              color: tab === t.key ? '#0D5C4E' : '#666',
              cursor: 'pointer',
              fontSize: 14,
              marginBottom: -2,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sessions'       && <SessionsTab admin={admin} userDept={userDept} />}
      {tab === 'individual'     && <IndividualLedgerTab admin={admin} userDept={userDept} />}
      {tab === 'card_balance'   && admin && <CardBalanceTab />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: Sessions
// ═══════════════════════════════════════════════════════════════════════════════
function SessionsTab({ admin, userDept }) {
  const [sessions, setSessions] = useState([])
  const [linesMap, setLinesMap] = useState({})     // sessionId → lines[]
  const [allocMap, setAllocMap] = useState({})     // sessionId → allocations[]
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [acting, setActing] = useState(null)

  // Filters
  const [fMonth, setFMonth]   = useState(() => new Date().toISOString().slice(0, 7))
  const [fStatus, setFStatus] = useState('')
  const [fCard, setFCard]     = useState('')
  const [fDept, setFDept]     = useState('')
  const [fSearch, setFSearch] = useState('')

  useEffect(() => { loadSessions() }, [fMonth])

  async function loadSessions() {
    setLoading(true)
    let q = supabase.from('field_payment_sessions').select('*').order('submitted_at', { ascending: false })

    if (fMonth) {
      q = q.gte('session_date', `${fMonth}-01`).lte('session_date', `${fMonth}-31`)
    }
    if (!admin && userDept) {
      q = q.ilike('department_name', `%${userDept}%`)
    }

    const { data } = await q
    setSessions(data || [])

    if (data?.length) {
      const ids = data.map((s) => s.id)
      const [{ data: lines }, { data: allocs }] = await Promise.all([
        supabase.from('field_payment_lines').select('*').in('session_id', ids).order('sort_order'),
        supabase.from('field_payment_mr_allocations').select('*').in('session_id', ids),
      ])
      const lm = {}; for (const l of (lines || [])) { (lm[l.session_id] = lm[l.session_id] || []).push(l) }
      const am = {}; for (const a of (allocs || [])) { (am[a.session_id] = am[a.session_id] || []).push(a) }
      setLinesMap(lm)
      setAllocMap(am)
    }
    setLoading(false)
  }

  // Advance status (Acknowledge → Close+JE)
  async function advanceStatus(session) {
    const next = STATUS_NEXT[session.status]
    if (!next) return
    setActing(session.id)
    try {
      const patch = {
        status: next,
        ...(next === 'ACKNOWLEDGED' ? { acknowledged_by: 'ACCOUNTS', acknowledged_at: new Date().toISOString() } : {}),
        ...(next === 'CLOSED'       ? { closed_by: 'ACCOUNTS',      closed_at: new Date().toISOString() }        : {}),
      }

      if (next === 'CLOSED') {
        // Auto-post JE
        const lines = linesMap[session.id] || []
        const jeId = await postJE(session, lines)
        if (jeId) { patch.je_posted = true; patch.je_id = jeId }
      }

      await supabase.from('field_payment_sessions').update(patch).eq('id', session.id)
      await loadSessions()
    } finally {
      setActing(null)
    }
  }

  // Client-side filters
  const filtered = useMemo(() => {
    let s = sessions
    if (fStatus) s = s.filter((x) => x.status === fStatus)
    if (fCard)   s = s.filter((x) => (x.card_used || '').startsWith(fCard))
    if (fDept)   s = s.filter((x) => (x.department_name || '').toUpperCase().includes(fDept.toUpperCase()))
    if (fSearch) {
      const q = fSearch.toLowerCase()
      s = s.filter((x) => (x.submitted_by_name || '').toLowerCase().includes(q) || (x.request_number || '').toLowerCase().includes(q))
    }
    return s
  }, [sessions, fStatus, fCard, fDept, fSearch])

  // Summary cards
  const summary = useMemo(() => ({
    total:      sessions.length,
    pending:    sessions.filter((s) => s.status === 'SUBMITTED').length,
    proxies:    sessions.filter((s) => (s.proxy_count || 0) > 0).length,
    distributed:sessions.reduce((sum, s) => sum + (s.session_total || 0), 0),
    overDist:   sessions.filter((s) => (s.over_distributed || 0) > 0).length,
  }), [sessions])

  if (loading) return <div style={{ color: '#888', padding: 32, textAlign: 'center' }}>Loading sessions…</div>

  return (
    <>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Sessions',         value: summary.total,                    grad:'linear-gradient(135deg,#0D5C4E,#0a4a3d)' },
          { label: 'Pending Review',    value: summary.pending,                  grad:'linear-gradient(135deg,#e65100,#bf360c)' },
          { label: 'Proxy Alerts',      value: summary.proxies,                  grad:'linear-gradient(135deg,#d32f2f,#b71c1c)' },
          { label: 'Over-Dist',         value: summary.overDist,                 grad:'linear-gradient(135deg,#b45a00,#8d3f00)' },
          { label: 'Total Distributed', value: `SAR ${fmt(summary.distributed)}`, grad:'linear-gradient(135deg,#1565C0,#0d47a1)', wide: true },
        ].map((c) => (
          <div key={c.label} style={{ background: c.grad, borderRadius: 10, padding: '12px 16px', gridColumn: c.wide ? 'span 2' : 'span 1', boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, fontFamily:"'Poppins',sans-serif", fontWeight:700 }}>{c.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', fontFamily:"'Poppins',sans-serif" }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, background: '#f9f9f9', padding: 12, borderRadius: 10, border: '1px solid #eee' }}>
        <input type="month" value={fMonth} onChange={(e) => setFMonth(e.target.value)} style={F.inp} />
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={F.inp}>
          <option value="">All Statuses</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="ACKNOWLEDGED">Acknowledged</option>
          <option value="CLOSED">Closed</option>
        </select>
        <select value={fCard} onChange={(e) => setFCard(e.target.value)} style={F.inp}>
          <option value="">All Cards</option>
          <option value="ANB77">ANB-77</option>
          <option value="ANB39">ANB-39</option>
        </select>
        {admin && (
          <select value={fDept} onChange={(e) => setFDept(e.target.value)} style={F.inp}>
            <option value="">All Depts</option>
            {['TISU', 'NISU', 'CISU', 'ITSU'].map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        )}
        <input
          placeholder="Search submitter / MR #"
          value={fSearch}
          onChange={(e) => setFSearch(e.target.value)}
          style={{ ...F.inp, flex: 1, minWidth: 180 }}
        />
      </div>

      {/* Session list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>No sessions match the filters.</div>
      ) : (
        <>
          {/* Header row */}
          <div style={{ ...F.grid, background: '#f5f5f5', padding: '8px 12px', borderRadius: 8, marginBottom: 4, fontSize: 11, color: '#888', fontWeight: 700, textTransform: 'uppercase' }}>
            <span>Date</span><span>Card</span><span>Dept / Submitter</span><span>Total</span><span>Status</span><span>Proxy</span><span>JE</span>
          </div>

          {filtered.map((s) => {
            const sc = STATUS_COLORS[s.status] || STATUS_COLORS.SUBMITTED
            const isOpen = expanded === s.id
            const hasProxy = (s.proxy_count || 0) > 0
            const hasOver = (s.over_distributed || 0) > 0

            return (
              <div key={s.id} style={{ border: `1.5px solid ${hasProxy || hasOver ? '#ffb300' : '#e0e0e0'}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden', background: '#fff' }}>
                <div
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                  style={{ ...F.grid, padding: '11px 14px', cursor: 'pointer', alignItems: 'center' }}
                >
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{s.session_date}</span>
                  <span style={{ fontSize: 12 }}>{CARD_DISPLAY[s.card_used] || s.card_used || '—'}</span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{s.department_name}</div>
                    <div style={{ color: '#888', fontSize: 12 }}>{s.submitted_by_name}</div>
                  </div>
                  <span style={{ fontWeight: 700, color: '#1a6b3a', fontSize: 14 }}>SAR {fmt(s.session_total)}</span>
                  <span style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {s.status}
                  </span>
                  <span>
                    {hasProxy ? <span style={{ background: '#fdecea', color: '#c62828', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 700 }}>⚠ {s.proxy_count}</span> : '—'}
                    {hasOver  ? <span style={{ background: '#fff8e1', color: '#e65100', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 700, marginLeft: 4 }}>OVER</span> : ''}
                  </span>
                  <span style={{ fontSize: 12, color: s.je_posted ? '#2e7d32' : '#aaa' }}>
                    {s.je_posted ? '✓ Posted' : '—'}
                  </span>
                </div>

                {/* Expanded detail */}
                {isOpen && (
                  <SessionDetail
                    session={s}
                    lines={linesMap[s.id] || []}
                    allocs={allocMap[s.id] || []}
                    admin={admin}
                    acting={acting === s.id}
                    onAdvance={() => advanceStatus(s)}
                  />
                )}
              </div>
            )
          })}
        </>
      )}
    </>
  )
}

// ─── SessionDetail ────────────────────────────────────────────────────────────
function SessionDetail({ session, lines, allocs, admin, acting, onAdvance }) {
  const nextAction = STATUS_ACTION[session.status]
  const hasOver = (session.over_distributed || 0) > 0

  return (
    <div style={{ borderTop: '1px solid #eee', padding: '14px 16px', background: '#fafafa' }}>
      {/* Meta strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
        {[
          ['Card Pool (at submit)', `SAR ${fmt(session.card_pool_total)}`],
          ['Session Total',         `SAR ${fmt(session.session_total)}`],
          ['Bank Charges',          `SAR ${fmt(session.bank_charges_total)}`],
          ['Over-Distributed',      `SAR ${fmt(session.over_distributed)}`],
          ['Proxy Lines',           session.proxy_count || 0],
          ['JE ID',                 session.je_id || '—'],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{k}</div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{v}</div>
          </div>
        ))}
      </div>

      {hasOver && (
        <div style={{ background: '#fff8e1', border: '1px solid #ffb300', borderRadius: 8, padding: '8px 12px', marginBottom: 12, color: '#7a4f00', fontSize: 13 }}>
          ⚠️ This session is over-distributed by SAR {fmt(session.over_distributed)}. Please reconcile with custodian.
        </div>
      )}

      {/* FIFO allocation summary */}
      {allocs.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#555', marginBottom: 6 }}>FIFO MR Allocations</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ddd', color: '#888' }}>
                {['Request #', 'Dept', 'Allocated', 'Over?'].map((h) => (
                  <th key={h} style={{ padding: '4px 8px', textAlign: h === 'Allocated' ? 'right' : 'left', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allocs.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid #f5f5f5', background: a.is_over_distributed ? '#fff8e1' : 'transparent' }}>
                  <td style={{ padding: '4px 8px', fontWeight: 600, color: DEPT_COLORS[a.dept_code] || '#333' }}>{a.request_number}</td>
                  <td style={{ padding: '4px 8px' }}>{a.dept_code}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'right' }}>SAR {fmt(a.allocated_amount)}</td>
                  <td style={{ padding: '4px 8px', color: '#e65100' }}>{a.is_over_distributed ? '⚠ Yes' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Payment lines */}
      <div style={{ fontWeight: 700, fontSize: 13, color: '#555', marginBottom: 8 }}>Payment Lines</div>
      {lines.length === 0 ? (
        <p style={{ color: '#aaa', fontSize: 13 }}>No lines.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #ddd', background: '#f5f5f5' }}>
              {['#', 'Dept', 'Type', 'Party / Description', 'Proxy', 'Ref', 'Amount'].map((h) => (
                <th key={h} style={{ padding: '6px 8px', textAlign: h === 'Amount' ? 'right' : 'left', fontSize: 11, color: '#888', fontWeight: 700 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} style={{ borderBottom: '1px solid #f0f0f0', background: l.is_proxy ? '#fff8e1' : l.is_bank_charge ? '#fffde7' : 'white' }}>
                <td style={{ padding: '6px 8px', color: '#888' }}>{l.sort_order}</td>
                <td style={{ padding: '6px 8px', fontWeight: 600, color: DEPT_COLORS[l.dept_code] || '#333', fontSize: 12 }}>{l.dept_code}</td>
                <td style={{ padding: '6px 8px', fontSize: 12 }}>
                  {l.line_type === 'CUSTODIAN_EXPENSE'
                    ? (CUSTODIAN_LABELS[l.custodian_purpose] || l.custodian_purpose || 'Custodian')
                    : '💸 Transfer'}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <div style={{ fontWeight: 600 }}>{l.accountable_party_name || l.custodian_purpose || '—'}</div>
                  {l.one_time_purpose && <div style={{ color: '#666', fontSize: 12 }}>{l.one_time_purpose}</div>}
                  {l.transfer_agent_name && (
                    <div style={{ color: '#d32f2f', fontSize: 12 }}>→ via {l.transfer_agent_name}</div>
                  )}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  {l.is_proxy && <span style={{ background: '#fdecea', color: '#c62828', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>PROXY</span>}
                </td>
                <td style={{ padding: '6px 8px', color: '#666', fontSize: 12 }}>{l.reference_no || '—'}</td>
                <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>SAR {fmt(l.amount)}</div>
                  {(l.bank_charge_amount > 0) && (
                    <div style={{ fontSize: 11, color: '#b45a00' }}>+SAR {fmt(l.bank_charge_amount)} charge</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: '2px solid #ddd' }}>
              <td colSpan={6} style={{ padding: '6px 8px', fontWeight: 700, fontSize: 13 }}>Total</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontSize: 14, color: '#1a6b3a' }}>
                SAR {fmt(lines.reduce((s, l) => s + (l.amount || 0), 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      )}

      {/* Session notes */}
      {session.notes && (
        <div style={{ marginTop: 12, background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: '#555' }}>
          <strong>Notes:</strong> {session.notes}
        </div>
      )}

      {/* Action button (admin only) */}
      {admin && nextAction && (
        <div style={{ marginTop: 14 }}>
          <button
            onClick={onAdvance}
            disabled={acting}
            style={{
              background: session.status === 'SUBMITTED' ? '#3949ab' : '#1a6b3a',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '9px 20px',
              fontSize: 14,
              fontWeight: 600,
              cursor: acting ? 'not-allowed' : 'pointer',
              opacity: acting ? 0.7 : 1,
            }}
          >
            {acting ? 'Processing…' : nextAction}
          </button>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: Individual Ledger
// ═══════════════════════════════════════════════════════════════════════════════
function IndividualLedgerTab({ admin, userDept }) {
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(true)
  const [fPerson, setFPerson] = useState('')
  const [fMonth, setFMonth] = useState(() => new Date().toISOString().slice(0, 7))

  useEffect(() => { loadLines() }, [fMonth])

  async function loadLines() {
    setLoading(true)
    // Join via session for date and dept filters
    const { data: sessions } = await supabase
      .from('field_payment_sessions')
      .select('id, session_date, card_used, department_name')
      .gte('session_date', `${fMonth}-01`)
      .lte('session_date', `${fMonth}-31`)
      .neq('status', 'SUBMITTED')  // only acknowledged/closed

    if (!sessions?.length) { setLines([]); setLoading(false); return }

    let sessIds = sessions.map((s) => s.id)
    if (!admin && userDept) {
      sessIds = sessions
        .filter((s) => (s.department_name || '').toUpperCase().includes(userDept.toUpperCase()))
        .map((s) => s.id)
    }

    const sessMap = {}
    for (const s of sessions) sessMap[s.id] = s

    const { data: allLines } = await supabase
      .from('field_payment_lines')
      .select('*')
      .in('session_id', sessIds)
      .eq('line_type', 'TRANSFER')
      .order('accountable_party_name')

    // Enrich with session date
    const enriched = (allLines || []).map((l) => ({
      ...l,
      session_date: sessMap[l.session_id]?.session_date || '',
      card_used:    sessMap[l.session_id]?.card_used || '',
      dept_name:    sessMap[l.session_id]?.department_name || '',
    }))

    setLines(enriched)
    setLoading(false)
  }

  // Group by accountable party
  const grouped = useMemo(() => {
    let filtered = lines
    if (fPerson) {
      const q = fPerson.toLowerCase()
      filtered = lines.filter((l) => (l.accountable_party_name || '').toLowerCase().includes(q))
    }

    const groups = {}
    for (const l of filtered) {
      const key = l.accountable_party_id || l.accountable_party_name || 'Unknown'
      const name = l.accountable_party_name || 'Unknown'
      if (!groups[key]) groups[key] = { name, type: l.accountable_party_type, total: 0, lines: [] }
      groups[key].total += l.amount || 0
      groups[key].lines.push(l)
    }
    return Object.values(groups).sort((a, b) => b.total - a.total)
  }, [lines, fPerson])

  const grandTotal = useMemo(() => grouped.reduce((s, g) => s + g.total, 0), [grouped])

  if (loading) return <div style={{ color: '#888', padding: 32, textAlign: 'center' }}>Loading ledger…</div>

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <input type="month" value={fMonth} onChange={(e) => { setFMonth(e.target.value); setLines([]) }} style={F.inp} />
        <input
          placeholder="Search person or company name"
          value={fPerson}
          onChange={(e) => setFPerson(e.target.value)}
          style={{ ...F.inp, flex: 1, minWidth: 200 }}
        />
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: '12px 18px' }}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>Individuals Paid</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1a6b3a' }}>{grouped.length}</div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, padding: '12px 18px' }}>
          <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase' }}>Total Distributed</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1a5c8b' }}>SAR {fmt(grandTotal)}</div>
        </div>
      </div>

      {grouped.length === 0 ? (
        <div style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>No records for this period / filter.</div>
      ) : (
        grouped.map((g) => (
          <PersonCard key={g.name} group={g} />
        ))
      )}
    </>
  )
}

function PersonCard({ group }) {
  const [open, setOpen] = useState(false)
  const typeIcon = { EMPLOYEE: '👤', CONTRACTOR: '🏗️', ONE_TIME: '📝' }[group.type] || '👤'
  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>{typeIcon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{group.name}</div>
            <div style={{ fontSize: 12, color: '#888' }}>{group.lines.length} payment{group.lines.length !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 16, color: '#1a6b3a' }}>SAR {fmt(group.total)}</span>
          <span style={{ color: '#aaa', fontSize: 14 }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid #eee', padding: '10px 16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ddd', color: '#888', fontSize: 11 }}>
                {['Date', 'Dept', 'Card', 'Ref', 'Notes', 'Amount'].map((h) => (
                  <th key={h} style={{ padding: '4px 8px', textAlign: h === 'Amount' ? 'right' : 'left', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.lines.map((l) => (
                <tr key={l.id} style={{ borderBottom: '1px solid #f5f5f5', background: l.is_proxy ? '#fff8e1' : 'white' }}>
                  <td style={{ padding: '5px 8px' }}>{l.session_date}</td>
                  <td style={{ padding: '5px 8px', color: DEPT_COLORS[l.dept_code] || '#333', fontWeight: 600, fontSize: 12 }}>{l.dept_code}</td>
                  <td style={{ padding: '5px 8px', fontSize: 12, color: '#666' }}>{CARD_DISPLAY[l.card_used] || l.card_used || '—'}</td>
                  <td style={{ padding: '5px 8px', fontSize: 12, color: '#888' }}>{l.reference_no || '—'}</td>
                  <td style={{ padding: '5px 8px', fontSize: 12, color: '#555' }}>
                    {l.is_proxy ? `📤 via ${l.transfer_agent_name || 'proxy'}` : ''}
                    {l.notes || ''}
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700 }}>SAR {fmt(l.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: '2px solid #ddd' }}>
                <td colSpan={5} style={{ padding: '5px 8px', fontWeight: 700, fontSize: 13 }}>Total Received</td>
                <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: '#1a6b3a' }}>SAR {fmt(group.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3: Card Balance (admin only)
// ═══════════════════════════════════════════════════════════════════════════════
function CardBalanceTab() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('field_payment_sessions')
        .select('card_used, bank_account, session_total, bank_charges_total, card_pool_total, over_distributed, status')
      setSessions(data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ color: '#888', padding: 32, textAlign: 'center' }}>Loading…</div>

  // Group by bank (ANB-77 / ANB-39)
  const banks = ['ANB-77', 'ANB-39']
  return (
    <>
      <div style={{ color: '#555', fontSize: 13, marginBottom: 16, background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: 8, padding: '10px 14px' }}>
        💡 Card balance = total pool loaded (across all sessions) − total distributed. This is a running tally across all sessions in the system. For the authoritative balance, reconcile against the bank statement.
      </div>
      {banks.map((bank) => {
        const bankSessions = sessions.filter((s) => s.bank_account === bank)
        if (bankSessions.length === 0) return null

        const totalLoaded     = bankSessions.reduce((s, x) => s + (x.card_pool_total || 0), 0)
        const totalDistributed= bankSessions.reduce((s, x) => s + (x.session_total || 0), 0)
        const totalCharges    = bankSessions.reduce((s, x) => s + (x.bank_charges_total || 0), 0)
        const balance         = totalLoaded - totalDistributed
        const sessionCount    = bankSessions.length
        const closedCount     = bankSessions.filter((s) => s.status === 'CLOSED').length

        return (
          <div key={bank} style={{ background: '#fff', border: '1.5px solid #e0e0e0', borderRadius: 12, padding: '18px 20px', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 18, color: bank === 'ANB-77' ? DEPT_COLORS.TISU : DEPT_COLORS.NISU, marginBottom: 16 }}>
              🏦 {bank}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {[
                { label: 'Total Loaded (Pool Snapshot)', value: `SAR ${fmt(totalLoaded)}`, color: '#1a5c8b' },
                { label: 'Total Distributed', value: `SAR ${fmt(totalDistributed)}`, color: '#555' },
                { label: 'Bank Charges Incurred', value: `SAR ${fmt(totalCharges)}`, color: '#b45a00' },
                { label: 'Estimated Float', value: `SAR ${fmt(balance)}`, color: balance >= 0 ? '#1a6b3a' : '#d32f2f', large: true },
                { label: 'Sessions (Total / Closed)', value: `${sessionCount} / ${closedCount}`, color: '#555' },
              ].map((row) => (
                <div key={row.label} style={{ background: '#f9f9f9', borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{row.label}</div>
                  <div style={{ fontSize: row.large ? 22 : 16, fontWeight: 700, color: row.color }}>{row.value}</div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// JE auto-posting (called on Close)
// ═══════════════════════════════════════════════════════════════════════════════
async function postJE(session, lines) {
  try {
    // Build JE header
    const { data: je, error: jeErr } = await supabase
      .from('journal_entries')
      .insert({
        entity_id:   'ACCSYS',
        je_date:     session.session_date,
        description: `Field Payment — ${CARD_DISPLAY[session.card_used] || session.card_used} · ${session.submitted_by_name}`,
        source:      'FIELD_PAYMENT',
        source_id:   session.id,
        status:      'POSTED',
        posted_at:   new Date().toISOString(),
        created_by:  'ACCOUNTS',
      })
      .select('id')
      .single()

    if (jeErr || !je) return null
    const jeId = je.id

    // Build JE lines
    // For each payment line:
    //   Dr Employee/Party Advance account (mapped from accountable_party_type)
    //   Cr ANB-77 or ANB-39 card account
    // For bank charges:
    //   Dr Bank Charges Expense
    //   Cr ANB-77 or ANB-39 card account
    const cardAccount = session.bank_account === 'ANB-77' ? 'ANB-77-CARD' : 'ANB-39-CARD'

    const jeLines = []
    let lineNo = 1

    for (const l of lines) {
      if (!l.amount) continue
      const amt = parseFloat(l.amount) || 0

      let drAccount, description
      if (l.is_bank_charge) {
        drAccount   = 'BANK-CHARGES-EXP'
        description = `Bank charges — ${session.card_used}`
      } else if (l.accountable_party_type === 'EMPLOYEE') {
        drAccount   = 'EMP-ADVANCE'
        description = `Advance — ${l.accountable_party_name}`
      } else if (l.accountable_party_type === 'CONTRACTOR') {
        drAccount   = 'SUBCON-ADVANCE'
        description = `Advance — ${l.accountable_party_name}`
      } else {
        drAccount   = 'ONE-TIME-ADVANCE'
        description = l.one_time_purpose || l.accountable_party_name || 'One-time'
      }

      jeLines.push({
        journal_entry_id: jeId,
        line_number:      lineNo++,
        account_code:     drAccount,
        description,
        debit:            amt,
        credit:           0,
        department:       l.dept_code,
      })
      jeLines.push({
        journal_entry_id: jeId,
        line_number:      lineNo++,
        account_code:     cardAccount,
        description,
        debit:            0,
        credit:           amt,
        department:       l.dept_code,
      })
    }

    if (jeLines.length > 0) {
      await supabase.from('journal_entry_lines').insert(jeLines)
    }

    return jeId
  } catch (err) {
    console.error('postJE error:', err)
    return null
  }
}

// ─── Shared styles ────────────────────────────────────────────────────────────
const F = {
  inp: {
    padding: '8px 12px',
    border: '1.5px solid #ddd',
    borderRadius: 8,
    fontSize: 13,
    outline: 'none',
    background: '#fff',
    fontFamily: 'inherit',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '100px 120px 1fr 120px 110px 100px 80px',
    gap: 8,
    alignItems: 'center',
  },
}
