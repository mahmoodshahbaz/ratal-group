import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Employee Self-Service Portal
// Finds the employee record linked to the logged-in user by email match
// Tabs: My Payslip | My Leaves | My Loans | My Overtime

const fmt  = d => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'
const SAR  = v => `SAR ${(+v || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const S = {
  card:    { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:12 },
  btn:     (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }),
  inp:     { width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
  lbl:     { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modal:   { background:'#fff', borderRadius:16, padding:28, width:480, maxWidth:'96vw', boxShadow:'0 8px 40px rgba(0,0,0,0.18)' },
  badge:   (c, bg) => ({ background:bg||`${c}18`, color:c, padding:'3px 10px', borderRadius:10, fontWeight:700, fontSize:11 }),
}

const STATUS_COLORS = {
  PENDING:   '#f57c00',
  APPROVED:  '#2e7d32',
  REJECTED:  '#c62828',
  ACTIVE:    '#1565C0',
  SETTLED:   '#546e7a',
  CANCELLED: '#c62828',
}

// ─── Payslip Tab ─────────────────────────────────────────────────────────────
function PayslipTab({ emp, entityId }) {
  const [month,  setMonth]  = useState(new Date().toISOString().slice(0, 7))
  const [item,   setItem]   = useState(null)
  const [run,    setRun]    = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetchPayslip() }, [month, emp])

  async function fetchPayslip() {
    if (!emp) return
    setLoading(true)
    // payroll_month is stored as first-of-month date
    const monthDate = month + '-01'
    const { data: runs } = await supabase.from('payroll_runs')
      .select('id, payroll_month, status').eq('entity_id', entityId)
      .eq('payroll_month', monthDate).limit(1)
    if (!runs?.length) { setRun(null); setItem(null); setLoading(false); return }
    setRun(runs[0])
    const { data: items } = await supabase.from('payroll_items')
      .select('*').eq('payroll_run_id', runs[0].id).eq('employee_id', emp.id).limit(1)
    setItem(items?.[0] || null)
    setLoading(false)
  }

  function printSlip() {
    if (!item) return
    const win = window.open('', '_blank', 'width=700,height=900')
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Payslip — ${emp.full_name} — ${month}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #1a2e3d; }
        h2 { margin-bottom: 4px; } .sub { color: #666; font-size:12px; margin-bottom:24px; }
        table { width:100%; border-collapse:collapse; margin-bottom:16px; }
        td { padding: 8px 12px; border-bottom: 1px solid #eee; font-size:13px; }
        .label { color:#666; width:50%; }
        .value { font-weight:700; text-align:right; }
        .total-row td { font-size:16px; font-weight:800; border-top:2px solid #1a2e3d; padding-top:12px; }
        .footer { font-size:10px; color:#aaa; margin-top:30px; text-align:center; }
      </style>
    </head><body>
      <h2>${emp.full_name}</h2>
      <div class="sub">${emp.job_title || '—'} &nbsp;·&nbsp; ${emp.department || '—'} &nbsp;·&nbsp; ${month}</div>
      <table>
        <tr><td class="label">Basic Salary</td>      <td class="value">${SAR(item.basic_salary)}</td></tr>
        <tr><td class="label">Housing Allowance</td>  <td class="value">${SAR(item.housing_allowance)}</td></tr>
        <tr><td class="label">Transport Allow.</td>   <td class="value">${SAR(item.transport_allowance)}</td></tr>
        <tr><td class="label">Other Allowances</td>   <td class="value">${SAR(item.other_allowances)}</td></tr>
        <tr><td class="label">Overtime</td>           <td class="value" style="color:#2e7d32">+ ${SAR(item.overtime_pay)}</td></tr>
        <tr><td class="label">Deductions</td>         <td class="value" style="color:#c62828">− ${SAR(item.total_deductions)}</td></tr>
        <tr class="total-row"><td class="label">NET PAY</td><td class="value">${SAR(item.net_salary)}</td></tr>
      </table>
      <div class="footer">Generated from Ratal Group System · ${new Date().toLocaleDateString('en-GB')}</div>
      <script>window.onload=function(){window.print()}<\/script>
    </body></html>`)
    win.document.close()
  }

  return (
    <div>
      <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:16 }}>
        <input type="month" value={month} onChange={e => setMonth(e.target.value)}
          style={{ ...S.inp, width:180 }} />
        {item && <button style={S.btn('#546e7a')} onClick={printSlip}>🖨 Print</button>}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#6b7c93' }}>Loading…</div>
      ) : !run ? (
        <div style={{ ...S.card, textAlign:'center', padding:50, color:'#aab2bd' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
          No payroll processed for {month}
        </div>
      ) : !item ? (
        <div style={{ ...S.card, textAlign:'center', padding:50, color:'#aab2bd' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🔍</div>
          No payslip found for your record this month
        </div>
      ) : (
        <div style={S.card}>
          <div style={{ fontWeight:800, fontSize:15, marginBottom:14, color:'#1a2e3d' }}>
            Payslip — {month}
            <span style={{ ...S.badge(run.status === 'APPROVED' ? '#2e7d32' : '#f57c00'), marginLeft:10, fontSize:10 }}>
              {run.status}
            </span>
          </div>

          {/* Earnings */}
          <div style={{ fontSize:10, fontWeight:800, color:'#6b7c93', marginBottom:6, letterSpacing:1 }}>EARNINGS</div>
          {[
            ['Basic Salary',      item.basic_salary],
            ['Housing Allowance', item.housing_allowance],
            ['Transport Allow.',  item.transport_allowance],
            ['Other Allowances',  item.other_allowances],
            ['Overtime',          item.overtime_pay],
          ].map(([label, val]) => (
            <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f5f5f5', fontSize:13 }}>
              <span style={{ color:'#546e7a' }}>{label}</span>
              <span style={{ fontWeight:700 }}>{SAR(val)}</span>
            </div>
          ))}

          {/* Deductions */}
          <div style={{ fontSize:10, fontWeight:800, color:'#6b7c93', marginBottom:6, marginTop:14, letterSpacing:1 }}>DEDUCTIONS</div>
          {[
            ['Loan Deductions',   item.loan_deduction],
            ['Leave Deductions',  item.leave_deduction],
            ['Other Deductions',  item.other_deductions],
          ].filter(([, v]) => +v > 0).map(([label, val]) => (
            <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f5f5f5', fontSize:13 }}>
              <span style={{ color:'#c62828' }}>{label}</span>
              <span style={{ fontWeight:700, color:'#c62828' }}>− {SAR(val)}</span>
            </div>
          ))}

          {/* Net */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14, paddingTop:12, borderTop:'2px solid #1a2e3d' }}>
            <span style={{ fontSize:15, fontWeight:800, color:'#1a2e3d' }}>NET PAY</span>
            <span style={{ fontSize:24, fontWeight:800, color:'#1a2e3d' }}>{SAR(item.net_salary)}</span>
          </div>

          {item.payment_status && (
            <div style={{ textAlign:'right', marginTop:6, fontSize:11, color:'#6b7c93' }}>
              Payment: <strong style={{ color: item.payment_status === 'PAID' ? '#2e7d32' : '#f57c00' }}>{item.payment_status}</strong>
              {item.payment_date && ` on ${fmt(item.payment_date)}`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Leaves Tab ──────────────────────────────────────────────────────────────
function LeavesTab({ emp, entityId }) {
  const [leaves,  setLeaves]  = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState({ leave_type:'ANNUAL', start_date:'', end_date:'', reason:'' })
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')

  useEffect(() => { fetchLeaves() }, [emp])

  async function fetchLeaves() {
    if (!emp) return
    setLoading(true)
    const { data } = await supabase.from('vacations')
      .select('*').eq('entity_id', entityId).eq('employee_id', emp.id)
      .order('created_at', { ascending: false }).limit(30)
    setLeaves(data || [])
    setLoading(false)
  }

  function daysBetween(from, to) {
    if (!from || !to) return 0
    return Math.max(1, Math.ceil((new Date(to) - new Date(from)) / 864e5) + 1)
  }

  async function submit() {
    setErr('')
    if (!form.start_date || !form.end_date) { setErr('Start and end date are required'); return }
    if (new Date(form.end_date) < new Date(form.start_date)) { setErr('End date must be after start date'); return }
    setSaving(true)
    const { error } = await supabase.from('vacations').insert({
      entity_id:     entityId,
      employee_id:   emp.id,
      leave_type:    form.leave_type,
      start_date:    form.start_date,
      end_date:      form.end_date,
      days_requested: daysBetween(form.start_date, form.end_date),
      reason:        form.reason || null,
      status:        'PENDING',
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    setModal(false)
    setForm({ leave_type:'ANNUAL', start_date:'', end_date:'', reason:'' })
    fetchLeaves()
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <span style={{ fontWeight:700, color:'#1a2e3d', fontSize:14 }}>My Leave Requests</span>
        <button style={S.btn('#1565C0')} onClick={() => setModal(true)}>+ Apply for Leave</button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#6b7c93' }}>Loading…</div>
      ) : leaves.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:50, color:'#aab2bd' }}>No leave requests yet</div>
      ) : (
        leaves.map(l => (
          <div key={l.id} style={{ ...S.card, display:'flex', gap:14, alignItems:'flex-start' }}>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, color:'#1a2e3d' }}>
                {l.leave_type} Leave — {l.days_requested} day{l.days_requested !== 1 ? 's' : ''}
              </div>
              <div style={{ fontSize:12, color:'#6b7c93', marginTop:2 }}>
                {fmt(l.start_date)} → {fmt(l.end_date)}
              </div>
              {l.reason && <div style={{ fontSize:11, color:'#546e7a', marginTop:4 }}>{l.reason}</div>}
              {l.approval_comment && (
                <div style={{ fontSize:11, color:'#e65100', marginTop:4 }}>
                  Comment: {l.approval_comment}
                </div>
              )}
            </div>
            <span style={S.badge(STATUS_COLORS[l.status] || '#546e7a')}>
              {l.status}
            </span>
          </div>
        ))
      )}

      {modal && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div style={S.modal}>
            <div style={{ fontWeight:800, fontSize:16, marginBottom:16 }}>🏖 Apply for Leave</div>

            <div style={{ marginBottom:12 }}>
              <label style={S.lbl}>Leave Type</label>
              <select value={form.leave_type} onChange={e => setForm(p => ({ ...p, leave_type: e.target.value }))} style={S.inp}>
                <option value="ANNUAL">Annual Leave</option>
                <option value="SICK">Sick Leave</option>
                <option value="EMERGENCY">Emergency Leave</option>
                <option value="HAJJ">Hajj Leave</option>
                <option value="UNPAID">Unpaid Leave</option>
              </select>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              <div>
                <label style={S.lbl}>Start Date</label>
                <input type="date" value={form.start_date}
                  onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} style={S.inp} />
              </div>
              <div>
                <label style={S.lbl}>End Date</label>
                <input type="date" value={form.end_date}
                  onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} style={S.inp} />
              </div>
            </div>

            {form.start_date && form.end_date && new Date(form.end_date) >= new Date(form.start_date) && (
              <div style={{ background:'#e8f5e9', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:12, color:'#2e7d32', fontWeight:700 }}>
                {daysBetween(form.start_date, form.end_date)} day(s) requested
              </div>
            )}

            <div style={{ marginBottom:16 }}>
              <label style={S.lbl}>Reason (optional)</label>
              <textarea value={form.reason}
                onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                style={{ ...S.inp, height:70, resize:'vertical' }}
                placeholder="Brief explanation…" />
            </div>

            {err && <div style={{ color:'#c62828', fontSize:12, marginBottom:10 }}>⚠ {err}</div>}

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button style={S.btn('#aab2bd')} onClick={() => { setModal(false); setErr('') }}>Cancel</button>
              <button style={S.btn('#2e7d32')} onClick={submit} disabled={saving}>
                {saving ? 'Submitting…' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Loans Tab ───────────────────────────────────────────────────────────────
function LoansTab({ emp, entityId }) {
  const [loans,   setLoans]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchLoans() }, [emp])

  async function fetchLoans() {
    if (!emp) return
    setLoading(true)
    const { data } = await supabase.from('employee_loans')
      .select('*').eq('entity_id', entityId).eq('employee_id', emp.id)
      .order('created_at', { ascending: false })
    setLoans(data || [])
    setLoading(false)
  }

  return (
    <div>
      <div style={{ fontWeight:700, color:'#1a2e3d', fontSize:14, marginBottom:14 }}>My Loans</div>

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#6b7c93' }}>Loading…</div>
      ) : loans.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:50, color:'#aab2bd' }}>No loans on record</div>
      ) : (
        loans.map(l => {
          const total       = +l.loan_amount     || 0
          const remaining   = +l.outstanding_balance || total
          const pct         = total > 0 ? Math.round(((total - remaining) / total) * 100) : 0
          return (
            <div key={l.id} style={S.card}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div>
                  <div style={{ fontWeight:800, color:'#1a2e3d' }}>{l.loan_type || 'Loan'}</div>
                  <div style={{ fontSize:11, color:'#6b7c93', marginTop:2 }}>
                    Issued: {fmt(l.issue_date)}
                    {l.expected_end_date && ` · Ends: ${fmt(l.expected_end_date)}`}
                  </div>
                </div>
                <span style={S.badge(STATUS_COLORS[l.status] || '#546e7a')}>
                  {l.status}
                </span>
              </div>

              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:11, color:'#6b7c93' }}>Remaining Balance</div>
                  <div style={{ fontWeight:800, fontSize:18, color:'#1a2e3d' }}>{SAR(remaining)}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:11, color:'#6b7c93' }}>Original Amount</div>
                  <div style={{ fontWeight:700, color:'#546e7a' }}>{SAR(total)}</div>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ height:8, borderRadius:4, background:'#f0f4f8', overflow:'hidden', marginBottom:6 }}>
                <div style={{ height:'100%', borderRadius:4, background:'#1565C0', width:`${pct}%`, transition:'width 0.4s' }} />
              </div>
              <div style={{ fontSize:10, color:'#6b7c93', display:'flex', justifyContent:'space-between' }}>
                <span>{pct}% repaid</span>
                <span>Monthly: {SAR(l.monthly_deduction)} · {l.installments_paid || 0}/{l.total_installments || '?'} installments</span>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}

// ─── Overtime Tab ─────────────────────────────────────────────────────────────
function OvertimeTab({ emp, entityId }) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState({ overtime_date:'', hours:'', reason:'' })
  const [saving,  setSaving]  = useState(false)

  useEffect(() => { fetchItems() }, [emp])

  async function fetchItems() {
    if (!emp) return
    setLoading(true)
    const { data } = await supabase.from('overtime_requests')
      .select('*').eq('entity_id', entityId).eq('employee_id', emp.id)
      .order('overtime_date', { ascending: false }).limit(30)
    setItems(data || [])
    setLoading(false)
  }

  async function submit() {
    if (!form.overtime_date || !form.hours) return
    setSaving(true)
    await supabase.from('overtime_requests').insert({
      entity_id:    entityId,
      employee_id:  emp.id,
      overtime_date: form.overtime_date,
      hours:        +form.hours,
      reason:       form.reason || null,
      status:       'PENDING',
    })
    setSaving(false)
    setModal(false)
    setForm({ overtime_date:'', hours:'', reason:'' })
    fetchItems()
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <span style={{ fontWeight:700, color:'#1a2e3d', fontSize:14 }}>My Overtime</span>
        <button style={S.btn('#e65100')} onClick={() => setModal(true)}>+ Submit Overtime</button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#6b7c93' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:50, color:'#aab2bd' }}>No overtime records</div>
      ) : (
        items.map(o => (
          <div key={o.id} style={{ ...S.card, display:'flex', gap:14, alignItems:'center' }}>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700 }}>{fmt(o.overtime_date)} — {o.hours}h</div>
              {o.reason && <div style={{ fontSize:11, color:'#6b7c93', marginTop:2 }}>{o.reason}</div>}
              {o.overtime_rate && <div style={{ fontSize:11, color:'#2e7d32', marginTop:2 }}>Rate: {SAR(o.overtime_rate)}/hr</div>}
            </div>
            <span style={S.badge(STATUS_COLORS[o.status] || '#546e7a')}>
              {o.status}
            </span>
          </div>
        ))
      )}

      {modal && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setModal(false)}>
          <div style={S.modal}>
            <div style={{ fontWeight:800, fontSize:16, marginBottom:16 }}>⏱ Submit Overtime</div>
            <div style={{ marginBottom:12 }}>
              <label style={S.lbl}>Date</label>
              <input type="date" value={form.overtime_date}
                onChange={e => setForm(p => ({ ...p, overtime_date: e.target.value }))} style={S.inp} />
            </div>
            <div style={{ marginBottom:12 }}>
              <label style={S.lbl}>Hours</label>
              <input type="number" min="0.5" max="12" step="0.5" value={form.hours}
                onChange={e => setForm(p => ({ ...p, hours: e.target.value }))} style={S.inp} />
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={S.lbl}>Reason / Task Description</label>
              <textarea value={form.reason}
                onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                style={{ ...S.inp, height:70, resize:'vertical' }} />
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button style={S.btn('#aab2bd')} onClick={() => setModal(false)}>Cancel</button>
              <button style={S.btn('#e65100')} onClick={submit} disabled={saving}>
                {saving ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function SelfService({ entityId, role }) {
  const [tab,     setTab]     = useState('payslip')
  const [emp,     setEmp]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { findEmployee() }, [entityId])

  async function findEmployee() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Try by email first (personal or work email column)
    const { data: byEmail } = await supabase.from('employees')
      .select('*').eq('entity_id', entityId)
      .or(`email.eq.${user.email},work_email.eq.${user.email}`)
      .limit(1)
    if (byEmail?.length) { setEmp(byEmail[0]); setLoading(false); return }

    // Try by user_profiles full_name match
    const { data: profile } = await supabase.from('user_profiles')
      .select('full_name').eq('id', user.id).limit(1)
    if (profile?.[0]?.full_name) {
      const { data: byName } = await supabase.from('employees')
        .select('*').eq('entity_id', entityId)
        .ilike('full_name', profile[0].full_name).limit(1)
      if (byName?.length) { setEmp(byName[0]); setLoading(false); return }
    }

    setLoading(false)
  }

  const TABS = [
    { key:'payslip',  label:'💰 Payslip'  },
    { key:'leaves',   label:'🏖 Leave'    },
    { key:'loans',    label:'📋 Loans'    },
    { key:'overtime', label:'⏱ Overtime'  },
  ]

  if (loading) return (
    <div style={{ textAlign:'center', padding:80, color:'#6b7c93' }}>
      Looking up your employee record…
    </div>
  )

  if (!emp) return (
    <div>
      <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>
        <div style={{ fontSize:40, marginBottom:10 }}>🔍</div>
        <div style={{ fontWeight:700, fontSize:15 }}>No employee record linked to your account</div>
        <div style={{ fontSize:12, marginTop:6, maxWidth:340, margin:'8px auto 0' }}>
          Ask your administrator to add your email address to your employee profile so it can be matched here.
        </div>
      </div>
    </div>
  )

  return (
    <div>

      {/* Employee identity card */}
      <div style={{
        borderRadius:14, padding:'16px 22px', marginBottom:20,
        background:'linear-gradient(135deg, #1a2e3d 0%, #1565C0 100%)',
        display:'flex', gap:16, alignItems:'center', flexWrap:'wrap',
      }}>
        <div style={{
          width:52, height:52, borderRadius:26,
          background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center',
          justifyContent:'center', fontSize:22, color:'#fff', fontWeight:800, flexShrink:0,
        }}>
          {(emp.full_name || emp.full_name_en || '?')[0].toUpperCase()}
        </div>
        <div style={{ flex:1, minWidth:180 }}>
          <div style={{ fontWeight:800, fontSize:16, color:'#fff' }}>
            {emp.full_name || emp.full_name_en}
          </div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)', marginTop:2 }}>
            {[emp.job_title, emp.department].filter(Boolean).join(' · ')}
          </div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:2 }}>
            ID: {emp.employee_id || emp.iqama_no || emp.id?.slice(0,8)}
            {emp.nationality && ` · ${emp.nationality}`}
          </div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontWeight:800, fontSize:18, color:'#fff' }}>
            {SAR(emp.basic_salary)}
          </div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.6)' }}>Basic / month</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:2, marginBottom:16, borderBottom:'2px solid #f0f4f8', paddingBottom:0 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding:'9px 18px', border:'none', borderRadius:'8px 8px 0 0',
            cursor:'pointer', fontWeight:700, fontSize:12,
            background:   tab === t.key ? '#1a2e3d' : 'transparent',
            color:        tab === t.key ? '#fff'    : '#6b7c93',
            borderBottom: tab === t.key ? '2px solid #1a2e3d' : '2px solid transparent',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'payslip'  && <PayslipTab  emp={emp} entityId={entityId} />}
      {tab === 'leaves'   && <LeavesTab   emp={emp} entityId={entityId} />}
      {tab === 'loans'    && <LoansTab    emp={emp} entityId={entityId} />}
      {tab === 'overtime' && <OvertimeTab emp={emp} entityId={entityId} />}
    </div>
  )
}
