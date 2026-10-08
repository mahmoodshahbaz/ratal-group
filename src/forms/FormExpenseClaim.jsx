/**
 * FormExpenseClaim.jsx — Monthly Expense Claim Submission
 *
 * Access: ALL active employees (any role)
 * Auth:   QR token via useFieldAuth
 *
 * Flow:
 *   1. Auto-detect current claim period (YYYY-MM)
 *   2. Cut-off enforcement: after 25th → previous month only
 *   3. Load all RECORDED expense_records for employee + period
 *   4. Show: Total Advances Received vs Total Claimed vs Balance
 *   5. Submit → creates expense_claims record + links all records
 *   6. If claim exists → show status tracker
 *
 * Business rules:
 *   - ONE claim per employee per period (duplicate prevention)
 *   - After 25th of month: that month locks, must claim previous month
 *   - Balance = Advances − Claimed
 *     - Positive: employee returns excess to DH
 *     - Negative: company reimburses employee
 *   - Finance approval triggers postClaimSettlementJE (Dr Expense / Cr Advance)
 */

import { useState, useEffect } from 'react'
import { supabase }            from '../lib/supabase'
import { useFieldAuth }        from '../lib/useFieldAuth'
import { postClaimSettlementJE } from '../lib/autoPost'
import { EXPENSE_CATEGORIES }  from './FormDailyExpense'

// ── Period helpers ────────────────────────────────────────────────────────────
const CUTOFF_DAY   = 25
const GRACE_DAYS   = 30   // N3: days after period end before hard block

function getClaimPeriod() {
  const now   = new Date()
  const day   = now.getDate()
  const year  = now.getFullYear()
  const month = now.getMonth() // 0-indexed

  if (day > CUTOFF_DAY) {
    // After 25th: claim for the CURRENT month (expenses are done)
    return `${year}-${String(month + 1).padStart(2, '0')}`
  } else {
    // Before/on 25th: claim for PREVIOUS month
    const prev = new Date(year, month - 1, 1)
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  }
}

// N3: one month before a YYYY-MM string
function prevPeriodOf(ym) {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1, 1)   // first day of ym
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// N3: how many days since the last day of a YYYY-MM period
function daysSincePeriodEnd(ym) {
  const [y, m] = ym.split('-').map(Number)
  const lastDay = new Date(y, m, 0)  // last day of ym (month m, day 0 = last day of m-1)
  return Math.floor((Date.now() - lastDay.getTime()) / 86400000)
}

function periodLabel(period) {
  const [y, m] = period.split('-')
  const d = new Date(parseInt(y), parseInt(m) - 1, 1)
  return d.toLocaleString('en-US', { month:'long', year:'numeric' })
}

function nextCutoff() {
  const now = new Date()
  const day = now.getDate()
  if (day <= CUTOFF_DAY) {
    return `${CUTOFF_DAY}th ${now.toLocaleString('en-US',{month:'long'})}`
  } else {
    const next = new Date(now.getFullYear(), now.getMonth() + 1, CUTOFF_DAY)
    return `${CUTOFF_DAY}th ${next.toLocaleString('en-US',{month:'long'})}`
  }
}

const fmt = (n) => Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2})

// ── Status colours ────────────────────────────────────────────────────────────
const STATUS_META = {
  DRAFT:             { color:'#6b7c93', bg:'#f0f2f5', label:'Draft' },
  SUBMITTED:         { color:'#e65100', bg:'#fff3e0', label:'Submitted — Awaiting DH' },
  DH_APPROVED:       { color:'#1565c0', bg:'#e3f2fd', label:'DH Approved — Awaiting Finance' },
  FINANCE_APPROVED:  { color:'#2e7d32', bg:'#e8f5e9', label:'Finance Approved — Pending Payment' },
  PAID:              { color:'#1b5e20', bg:'#c8e6c9', label:'Paid ✓' },
  REJECTED:          { color:'#c62828', bg:'#ffebee', label:'Rejected' },
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  wrap:    { minHeight:'100vh', background:'#f0f2f5', display:'flex', flexDirection:'column', alignItems:'center', paddingBottom:40 },
  header:  { width:'100%', background:'linear-gradient(135deg,#0d47a1,#1565c0)', padding:'20px 20px 28px', color:'#fff', boxSizing:'border-box' },
  hTitle:  { fontSize:20, fontWeight:800, marginBottom:2 },
  hSub:    { fontSize:13, opacity:0.82 },
  body:    { width:'100%', maxWidth:480, padding:'0 14px', boxSizing:'border-box', marginTop:-12 },
  card:    { background:'#fff', borderRadius:16, padding:18, marginBottom:12, boxShadow:'0 2px 10px rgba(0,0,0,0.07)' },
  sTitle:  { fontSize:14, fontWeight:800, color:'#1a2540', marginBottom:12 },
  periodBadge: { background:'#e3f2fd', color:'#0d47a1', borderRadius:10, padding:'8px 14px', fontWeight:800, fontSize:15, display:'inline-block', marginBottom:8 },
  cutoffNote: { fontSize:12, color:'#6b7c93', marginTop:4 },

  // Balance summary
  balGrid: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginTop:4 },
  balBox:  (color, bg) => ({ background:bg, borderRadius:12, padding:'12px 10px', textAlign:'center' }),
  balAmt:  (color) => ({ fontSize:17, fontWeight:800, color }),
  balLbl:  { fontSize:10, color:'#6b7c93', fontWeight:700, marginTop:3, textTransform:'uppercase' },

  // Expense rows
  expRow:  { display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom:'1px solid #f5f6f8' },
  expIcon: { fontSize:22, width:32, textAlign:'center' },
  expMain: { flex:1 },
  expCat:  { fontWeight:700, fontSize:13, color:'#1a2540' },
  expMeta: { fontSize:11, color:'#6b7c93' },
  expAmt:  { fontWeight:800, fontSize:14, color:'#1a2540', textAlign:'right' },

  // Status tracker
  statusChip: (s) => ({
    display:'inline-block', padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:700,
    color: STATUS_META[s]?.color || '#6b7c93',
    background: STATUS_META[s]?.bg || '#f0f2f5',
  }),
  timeline: { borderLeft:'3px solid #e3f2fd', paddingLeft:16, marginTop:12 },
  tlItem:   (done) => ({ marginBottom:14, opacity: done?1:0.4 }),
  tlDot:    (done) => ({ width:12, height:12, borderRadius:6, background: done?'#1565c0':'#dde3ec', display:'inline-block', marginLeft:-22, marginRight:10, verticalAlign:'middle' }),
  tlLabel:  { fontSize:13, fontWeight: 700, color:'#1a2540', display:'inline' },
  tlDate:   { fontSize:11, color:'#6b7c93', marginTop:2 },

  submitBtn: (dis) => ({
    width:'100%', padding:'17px', borderRadius:14, border:'none',
    background: dis?'#c9cdd4':'linear-gradient(135deg,#0d47a1,#1565c0)',
    color:'#fff', fontSize:16, fontWeight:800, cursor: dis?'not-allowed':'pointer',
  }),
  err:   { background:'#ffebee', color:'#c62828', borderRadius:10, padding:'11px 14px', fontSize:13, fontWeight:600, marginBottom:12 },
  empty: { textAlign:'center', padding:'32px 20px', color:'#6b7c93' },
  emptyIcon: { fontSize:48, marginBottom:12 },
  returnBanner: (pos) => ({
    background: pos?'#fff3e0':'#e8f5e9', border:`1.5px solid ${pos?'#ffcc80':'#a5d6a7'}`,
    borderRadius:12, padding:'12px 14px', marginBottom:4,
    color: pos?'#e65100':'#2e7d32', fontWeight:700, fontSize:13,
  }),
}

const devMode = new URLSearchParams(window.location.search).get('dev') === '1' ||
                localStorage.getItem('accsys_dev_mode') === '1'

// ── Component ─────────────────────────────────────────────────────────────────
export default function FormExpenseClaim() {
  const auth   = useFieldAuth()
  const period = getClaimPeriod()

  const [expenses,      setExpenses]      = useState([])
  const [advances,      setAdvances]      = useState([])
  const [existingClaim, setExistingClaim] = useState(null)
  const [loading,       setLoading]       = useState(true)
  const [submitting,    setSubmitting]    = useState(false)
  const [submitted,     setSubmitted]     = useState(false)
  const [notes,         setNotes]         = useState('')
  const [error,         setError]         = useState(null)
  const [devEmployees,  setDevEmployees]  = useState([])
  const [devEmpId,      setDevEmpId]      = useState('')

  // N3: grace period state
  const prevPeriod = prevPeriodOf(period)
  const [prevExpenses,   setPrevExpenses]   = useState([])   // unclaimed prev-period expenses
  const [includePrev,    setIncludePrev]    = useState(false) // toggle to bundle prev period
  const [prevBlocked,    setPrevBlocked]    = useState(false) // >30 days since prev period end
  const [graceUnblocked, setGraceUnblocked] = useState(false) // admin override exists

  // In dev mode load employee list for picker
  useEffect(() => {
    if (!devMode) return
    supabase.rpc('get_dev_employees').then(({ data }) => {
      setDevEmployees(data || [])
      if (data?.[0]) setDevEmpId(data[0].id)
    })
  }, [])

  // Reload data when employee changes (auth or dev picker)
  useEffect(() => {
    const id = devMode ? devEmpId : auth.employee?.id
    if (!id) return
    loadData(id)
  }, [auth.employee, devEmpId])

  async function loadData(empId) {
    if (!empId) return
    setLoading(true)

    // 1. Check if claim already exists for this period
    const { data: claim } = await supabase
      .from('expense_claims')
      .select('*')
      .eq('employee_id', empId)
      .eq('period', period)
      .maybeSingle()
    setExistingClaim(claim || null)

    // 2. Load RECORDED expenses for this period
    const { data: exps } = await supabase
      .from('expense_records')
      .select('*')
      .eq('employee_id', empId)
      .like('expense_date', `${period}%`)
      .eq('status', 'RECORDED')
      .order('expense_date', { ascending: true })
    setExpenses(exps || [])

    // N3: 3. Load RECORDED (unclaimed) expenses from previous period
    const { data: prevExps } = await supabase
      .from('expense_records')
      .select('*')
      .eq('employee_id', empId)
      .like('expense_date', `${prevPeriod}%`)
      .eq('status', 'RECORDED')
      .order('expense_date', { ascending: true })

    // N3: 4. Check if previous period already has a submitted claim
    const { data: prevClaim } = await supabase
      .from('expense_claims')
      .select('id')
      .eq('employee_id', empId)
      .eq('period', prevPeriod)
      .maybeSingle()

    const unclaimedPrev = prevClaim ? [] : (prevExps || [])
    setPrevExpenses(unclaimedPrev)

    if (unclaimedPrev.length > 0) {
      const age = daysSincePeriodEnd(prevPeriod)
      const isBlocked = age > GRACE_DAYS
      setPrevBlocked(isBlocked)

      if (isBlocked) {
        // N3: 5. Check admin unblock table
        const { data: unblock } = await supabase
          .from('expense_grace_unblocks')
          .select('id')
          .eq('employee_id', empId)
          .eq('period', prevPeriod)
          .maybeSingle()
        setGraceUnblocked(!!unblock)
      } else {
        setGraceUnblocked(false)
      }
    } else {
      setPrevBlocked(false)
      setGraceUnblocked(false)
    }

    // 3. Load total advances for this employee from DH
    const { data: advRows } = await supabase
      .from('employee_advances')
      .select('amount, txn_type, advance_date')
      .eq('employee_id', empId)
    const totalAdv = (advRows || [])
      .filter(a => ['ADVANCE_IN','TRANSFER_IN'].includes(a.txn_type))
      .reduce((s, a) => s + parseFloat(a.amount), 0)
    const totalSett = (advRows || [])
      .filter(a => ['CLAIM_SETTLED','RETURN_TO_DH'].includes(a.txn_type))
      .reduce((s, a) => s + parseFloat(a.amount), 0)
    setAdvances({ total: totalAdv, settled: totalSett, outstanding: totalAdv - totalSett })

    setLoading(false)
  }

  // ── Computed values ────────────────────────────────────────
  const totalClaimed  = expenses.reduce((s, e) => s + parseFloat(e.amount), 0)
  const totalVAT      = expenses.reduce((s, e) => s + parseFloat(e.vat_amount || 0), 0)
  const outstanding   = advances.outstanding || 0
  const balance       = outstanding - totalClaimed  // + means employee owes DH, - means co. owes employee

  // ── Group expenses by category ────────────────────────────
  const grouped = EXPENSE_CATEGORIES.map(cat => ({
    ...cat,
    rows: expenses.filter(e => e.category === cat.key),
    total: expenses.filter(e => e.category === cat.key).reduce((s, e) => s + parseFloat(e.amount), 0),
  })).filter(g => g.rows.length > 0)

  // ── Submit claim ──────────────────────────────────────────
  async function handleSubmit() {
    if (expenses.length === 0) return
    setError(null)
    setSubmitting(true)

    try {
      const empId = devMode ? devEmpId : auth.employee.id
      const empName = devMode
        ? (devEmployees.find(e => e.id === devEmpId)?.full_name_en || 'Employee')
        : auth.employee.full_name_en

      // Generate claim number: EC-YYYYMM-EMP4
      const seq = Math.floor(Math.random() * 9000) + 1000
      const claimNumber = `EC-${period.replace('-','')}-${seq}`

      // Bundled totals include prev period if opted in
      const prevTotalClaimed = includePrev ? prevExpenses.reduce((s, e) => s + parseFloat(e.amount), 0) : 0
      const prevTotalVAT     = includePrev ? prevExpenses.reduce((s, e) => s + parseFloat(e.vat_amount || 0), 0) : 0
      const bundledClaimed   = totalClaimed + prevTotalClaimed
      const bundledVAT       = totalVAT + prevTotalVAT
      const bundledBalance   = outstanding - bundledClaimed
      const bundleNote       = includePrev ? `[Bundled: includes ${periodLabel(prevPeriod)}] ` : ''

      // Insert expense_claim
      const { data: claim, error: claimErr } = await supabase
        .from('expense_claims')
        .insert({
          claim_number:            claimNumber,
          entity_id:               auth.entityId,
          employee_id:             empId,
          period,
          total_advances_received: outstanding,
          total_claimed:           bundledClaimed,
          total_vat_recoverable:   bundledVAT,
          balance_with_employee:   bundledBalance,
          status:                  'SUBMITTED',
          submitted_at:            new Date().toISOString(),
          notes:                   (bundleNote + (notes.trim() || '')).trim() || null,
        })
        .select()
        .single()

      if (claimErr) throw claimErr

      // Link all RECORDED expense_records to this claim (+ prev period if bundling)
      const allExpenses = includePrev ? [...expenses, ...prevExpenses] : expenses
      const expIds = allExpenses.map(e => e.id)
      await supabase
        .from('expense_records')
        .update({ claim_id: claim.id, status: 'CLAIMED' })
        .in('id', expIds)

      // Notify DH (find DH who issued last advance)
      const { data: lastAdv } = await supabase
        .from('employee_advances')
        .select('issued_by')
        .eq('employee_id', empId)
        .order('advance_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (lastAdv?.issued_by) {
        await supabase.from('notifications').insert({
          entity_id:    auth.entityId,
          employee_id:  lastAdv.issued_by,
          triggered_by: empId,
          type:         'CLAIM_SUBMITTED',
          title:        `Expense Claim — ${periodLabel(period)}`,
          message:      `${empName} submitted SAR ${fmt(totalClaimed)} claim for ${periodLabel(period)}. Balance: SAR ${fmt(Math.abs(balance))} ${balance >= 0 ? '(to return)' : '(to reimburse)'}`,
          amount:       totalClaimed,
          priority:     'HIGH',
          reference_type: 'expense_claim',
          reference_id:   claim.id,
        })
      }

      setExistingClaim(claim)
      setSubmitted(true)
    } catch (err) {
      setError(err.message || 'Failed to submit claim')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Guards ────────────────────────────────────────────────
  if ((auth.loading && !devMode) || (loading && devMode && !devEmpId)) return <div style={{ padding:40, textAlign:'center', color:'#6b7c93' }}>Loading…</div>
  if (!devMode && (auth.error || !auth.employee)) return (
    <div style={{ padding:40, textAlign:'center', color:'#c62828' }}>
      <div style={{ fontSize:48 }}>🔒</div>
      <div style={{ fontWeight:700, marginTop:12 }}>Scan your QR code to continue.</div>
    </div>
  )

  // ── Existing claim view ───────────────────────────────────
  if (existingClaim && !submitted) {
    const c = existingClaim
    const steps = [
      { label:'Submitted',        done: !!c.submitted_at,       date: c.submitted_at },
      { label:'DH Approved',      done: !!c.dh_approved_at,     date: c.dh_approved_at },
      { label:'Finance Approved', done: !!c.finance_approved_at, date: c.finance_approved_at },
      { label:'Paid',             done: c.status === 'PAID',    date: c.paid_at },
    ]
    return (
      <div style={S.wrap}>
        <div style={S.header}>
          <div style={S.hTitle}>🧾 Expense Claim</div>
          {devMode
            ? <select value={devEmpId} onChange={e => setDevEmpId(e.target.value)}
                style={{ marginTop:6, padding:'5px 8px', borderRadius:6, border:'none', fontSize:13, background:'rgba(255,255,255,0.15)', color:'#fff', outline:'none' }}>
                {devEmployees.map(e => <option key={e.id} value={e.id} style={{ color:'#000' }}>{e.full_name_en}</option>)}
              </select>
            : <div style={S.hSub}>{auth.employee?.full_name_en}</div>
          }
        </div>
        <div style={{ ...S.body, marginTop:12 }}>
          <div style={S.card}>
            <div style={S.sTitle}>Claim for {periodLabel(period)}</div>
            <div style={S.periodBadge}>{c.claim_number}</div>
            <div style={{ marginTop:10 }}>
              <span style={S.statusChip(c.status)}>{STATUS_META[c.status]?.label || c.status}</span>
            </div>
            <div style={S.balGrid}>
              <div style={S.balBox('#e65100','#fff3e0')}>
                <div style={S.balAmt('#e65100')}>SAR {fmt(c.total_advances_received)}</div>
                <div style={S.balLbl}>Advances</div>
              </div>
              <div style={S.balBox('#1565c0','#e3f2fd')}>
                <div style={S.balAmt('#1565c0')}>SAR {fmt(c.total_claimed)}</div>
                <div style={S.balLbl}>Claimed</div>
              </div>
              <div style={S.balBox(c.balance_with_employee>0?'#e65100':'#2e7d32', c.balance_with_employee>0?'#fff3e0':'#e8f5e9')}>
                <div style={S.balAmt(c.balance_with_employee>0?'#e65100':'#2e7d32')}>SAR {fmt(Math.abs(c.balance_with_employee))}</div>
                <div style={S.balLbl}>{c.balance_with_employee>0?'To Return':'To Receive'}</div>
              </div>
            </div>
            <div style={S.timeline}>
              {steps.map(step => (
                <div key={step.label} style={S.tlItem(step.done)}>
                  <span style={S.tlDot(step.done)}/>
                  <span style={S.tlLabel}>{step.label}</span>
                  {step.done && step.date && (
                    <div style={S.tlDate}>{new Date(step.date).toLocaleDateString('en-SA',{day:'numeric',month:'short',year:'numeric'})}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Main claim form ───────────────────────────────────────
  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <div style={S.hTitle}>🧾 Expense Claim</div>
        <div style={S.hSub}>{devMode ? (devEmployees.find(e=>e.id===devEmpId)?.full_name_en||'') : auth.employee?.full_name_en} · Cut-off {nextCutoff()}</div>
      </div>

      <div style={S.body}>

        {/* Period */}
        <div style={S.card}>
          <div style={S.sTitle}>Claim Period</div>
          <div style={S.periodBadge}>📅 {periodLabel(period)}</div>
          <div style={S.cutoffNote}>Submissions close on the {CUTOFF_DAY}th of each month.</div>
        </div>

        {/* N3: Previous period grace period card */}
        {prevExpenses.length > 0 && (() => {
          const prevLabel = periodLabel(prevPeriod)
          const prevTotal = prevExpenses.reduce((s, e) => s + parseFloat(e.amount || 0), 0)

          // Case 1: Hard blocked — no admin unblock
          if (prevBlocked && !graceUnblocked) {
            return (
              <div style={{ ...S.card, borderLeft:'4px solid #c62828', background:'#fff5f5' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <span style={{ fontSize:20 }}>⛔</span>
                  <span style={{ fontWeight:700, color:'#c62828', fontSize:14 }}>
                    {prevLabel} Claim Locked
                  </span>
                </div>
                <div style={{ fontSize:13, color:'#6b7c93', lineHeight:1.5 }}>
                  You have <strong>{prevExpenses.length} unclaimed expense{prevExpenses.length > 1 ? 's' : ''}</strong> (SAR {fmt(prevTotal)}) from {prevLabel},
                  but the 30-day submission window has closed.
                </div>
                <div style={{ marginTop:10, padding:'8px 12px', background:'#ffebee', borderRadius:8, fontSize:12, color:'#c62828', fontWeight:600 }}>
                  Contact your DH or Finance to collect physical receipts and request an admin unlock.
                </div>
              </div>
            )
          }

          // Case 2: Blocked but admin has granted grace override
          if (prevBlocked && graceUnblocked) {
            return (
              <div style={{ ...S.card, borderLeft:'4px solid #e65100', background:'#fff8f0' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:18 }}>🔓</span>
                  <span style={{ fontWeight:700, color:'#e65100', fontSize:13 }}>
                    Admin Grace Override Active — {prevLabel}
                  </span>
                </div>
                <div style={{ fontSize:12, color:'#6b7c93', marginBottom:10 }}>
                  Finance has approved a late submission for {prevLabel}. You may bundle {prevExpenses.length} expense{prevExpenses.length > 1 ? 's' : ''} (SAR {fmt(prevTotal)}) with this claim.
                </div>
                <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'8px 0' }}>
                  <input
                    type="checkbox"
                    checked={includePrev}
                    onChange={e => setIncludePrev(e.target.checked)}
                    style={{ width:18, height:18, accentColor:'#e65100' }}
                  />
                  <span style={{ fontSize:13, fontWeight:600, color:'#e65100' }}>
                    Include {prevLabel} expenses in this claim
                  </span>
                </label>
                {includePrev && (
                  <div style={{ marginTop:6, padding:'6px 10px', background:'#fff3e0', borderRadius:6, fontSize:12, color:'#e65100' }}>
                    +{prevExpenses.length} item{prevExpenses.length > 1 ? 's' : ''} · SAR {fmt(prevTotal)} will be added to this claim.
                  </div>
                )}
              </div>
            )
          }

          // Case 3: Within grace window — normal bundle offer
          return (
            <div style={{ ...S.card, borderLeft:'4px solid #1565c0', background:'#f0f7ff' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <span style={{ fontSize:18 }}>📅</span>
                <span style={{ fontWeight:700, color:'#1565c0', fontSize:13 }}>
                  Unclaimed Expenses from {prevLabel}
                </span>
              </div>
              <div style={{ fontSize:12, color:'#6b7c93', marginBottom:10 }}>
                You have {prevExpenses.length} unclaimed expense{prevExpenses.length > 1 ? 's' : ''} (SAR {fmt(prevTotal)}) from last month. You can bundle them with this claim.
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', padding:'8px 0' }}>
                <input
                  type="checkbox"
                  checked={includePrev}
                  onChange={e => setIncludePrev(e.target.checked)}
                  style={{ width:18, height:18, accentColor:'#1565c0' }}
                />
                <span style={{ fontSize:13, fontWeight:600, color:'#1565c0' }}>
                  Include {prevLabel} expenses in this claim
                </span>
              </label>
              {includePrev && (
                <div style={{ marginTop:6, padding:'6px 10px', background:'#e3f2fd', borderRadius:6, fontSize:12, color:'#1565c0' }}>
                  +{prevExpenses.length} item{prevExpenses.length > 1 ? 's' : ''} · SAR {fmt(prevTotal)} will be added to this claim.
                </div>
              )}
            </div>
          )
        })()}

        {/* Balance summary */}
        <div style={S.card}>
          <div style={S.sTitle}>Your Summary</div>
          <div style={S.balGrid}>
            <div style={S.balBox('#e65100','#fff3e0')}>
              <div style={S.balAmt('#e65100')}>SAR {fmt(outstanding)}</div>
              <div style={S.balLbl}>Advances Held</div>
            </div>
            <div style={S.balBox('#1565c0','#e3f2fd')}>
              <div style={S.balAmt('#1565c0')}>SAR {fmt(totalClaimed)}</div>
              <div style={S.balLbl}>This Claim</div>
            </div>
            <div style={S.balBox(balance>0?'#e65100':'#2e7d32', balance>0?'#fff3e0':'#e8f5e9')}>
              <div style={S.balAmt(balance>0?'#e65100':'#2e7d32')}>SAR {fmt(Math.abs(balance))}</div>
              <div style={S.balLbl}>{balance>0?'To Return':'To Receive'}</div>
            </div>
          </div>
          {balance !== 0 && (
            <div style={{ ...S.returnBanner(balance > 0), marginTop:10 }}>
              {balance > 0
                ? `⚠️ You will return SAR ${fmt(balance)} to your DH after settlement.`
                : `✅ Company will reimburse you SAR ${fmt(Math.abs(balance))} after approval.`}
            </div>
          )}
        </div>

        {/* Expense list by category */}
        {grouped.length === 0 ? (
          <div style={S.card}>
            <div style={S.empty}>
              <div style={S.emptyIcon}>📭</div>
              <div style={{ fontWeight:700, fontSize:15, color:'#1a2540' }}>No expenses recorded yet</div>
              <div style={{ fontSize:13, marginTop:8 }}>Record your daily expenses first using the Daily Expense form.</div>
            </div>
          </div>
        ) : (
          <div style={S.card}>
            <div style={S.sTitle}>{expenses.length} Expenses · {periodLabel(period)}</div>
            {grouped.map(g => (
              <div key={g.key} style={{ marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <span style={{ fontWeight:700, fontSize:12, color:'#6b7c93', textTransform:'uppercase' }}>
                    {g.icon} {g.label}
                  </span>
                  <span style={{ fontWeight:800, fontSize:13, color:'#1a2540' }}>SAR {fmt(g.total)}</span>
                </div>
                {g.rows.map(e => (
                  <div key={e.id} style={S.expRow}>
                    <div style={S.expMain}>
                      <div style={S.expCat}>{e.vendor_name || e.category.replace(/_/g,' ')}</div>
                      <div style={S.expMeta}>
                        {new Date(e.expense_date).toLocaleDateString('en-SA',{day:'numeric',month:'short'})}
                        {e.site_number && ` · Site ${e.site_number}`}
                        {e.vat_paid && ` · VAT SAR ${fmt(e.vat_amount)}`}
                      </div>
                    </div>
                    <div style={S.expAmt}>SAR {fmt(e.amount)}</div>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ display:'flex', justifyContent:'space-between', paddingTop:10, borderTop:'2px solid #f0f2f5' }}>
              <span style={{ fontWeight:800, color:'#1a2540' }}>Total Claimed</span>
              <span style={{ fontWeight:800, fontSize:16, color:'#1a2540' }}>SAR {fmt(totalClaimed)}</span>
            </div>
            {totalVAT > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', paddingTop:6, fontSize:12, color:'#6b7c93' }}>
                <span>VAT Recoverable</span>
                <span>SAR {fmt(totalVAT)}</span>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {expenses.length > 0 && (
          <div style={S.card}>
            <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:6, textTransform:'uppercase' }}>
              Notes for DH / Finance (optional)
            </label>
            <textarea
              rows={2}
              placeholder="Any context or explanations for your claim…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{ width:'100%', padding:'11px 13px', borderRadius:10, border:'1.5px solid #dde3ec', fontSize:14, outline:'none', resize:'none', boxSizing:'border-box', fontFamily:'inherit' }}
            />
          </div>
        )}

        {error && <div style={S.err}>⚠️ {error}</div>}

        {submitted ? (
          <div style={{ ...S.card, textAlign:'center', padding:28 }}>
            <div style={{ fontSize:52 }}>✅</div>
            <div style={{ fontSize:18, fontWeight:800, color:'#1565c0', marginTop:12 }}>Claim Submitted!</div>
            <div style={{ color:'#6b7c93', fontSize:13, marginTop:8 }}>Your DH will be notified to review and approve.</div>
            <button onClick={() => window.location.href='/forms'} style={{ ...S.submitBtn(false), marginTop:20, background:'#e3f2fd', color:'#0d47a1' }}>
              ← Back to Forms
            </button>
          </div>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={expenses.length === 0 || submitting}
            style={S.submitBtn(expenses.length === 0 || submitting)}
          >
            {submitting ? 'Submitting…'
              : expenses.length === 0 ? 'No expenses to claim'
              : `Submit Claim — SAR ${fmt(totalClaimed)}`}
          </button>
        )}

      </div>
    </div>
  )
}
