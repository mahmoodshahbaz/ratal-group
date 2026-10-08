/**
 * FormPayment.jsx — Shareable Payment Form (entity-aware)
 * ─────────────────────────────────────────────────────────────────
 * RAT / GWT  → Travel Payment Form (per diem, hotel, transport, visa, etc.)
 * ACCSYS     → Field Distribution Form (employees, sub-cons, suppliers)
 *
 * Route: /forms/payment
 * Auth:  Requires login via QR or portal. entityCode auto-detected.
 */

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'

// ── Shared bank accounts ──────────────────────────────────────────
const ACCOUNTS = [
  { value: 'ANB-77', label: 'ANB-77', note: 'TISU Field Account'     },
  { value: 'ANB-39', label: 'ANB-39', note: 'Shared Field Account'   },
  { value: 'ANB-15', label: 'ANB-15', note: 'Main Company Account'   },
  { value: 'ANB-18', label: 'ANB-18', note: 'Corporate Account'      },
  { value: 'ANB-11', label: 'ANB-11', note: 'Account 11'             },
  { value: 'OTHER',  label: 'Other',  note: 'Other account'          },
]

// ── Travel-specific payment types ────────────────────────────────
const TRAVEL_TYPES = [
  { value: 'PER_DIEM',      label: '🍽️  Per Diem / Daily Allowance' },
  { value: 'HOTEL',         label: '🏨  Hotel / Accommodation'      },
  { value: 'TRANSPORT',     label: '🚗  Transportation / Fuel'       },
  { value: 'VISA_FEE',      label: '🪪  Visa Fees'                  },
  { value: 'TICKET',        label: '✈️  Ticket / Airfare'            },
  { value: 'IQAMA',         label: '📋  Iqama / Government Fees'    },
  { value: 'MOBILE_TOPUP',  label: '📱  Mobile Top-Up'              },
  { value: 'OFFICE_EXP',    label: '🖨️  Office Expenses'            },
  { value: 'OTHER_TRAVEL',  label: '📌  Other Travel Expense'       },
]

// ── Field-distribution request types (shareable form) ───────────
const FIELD_REQUEST_TYPES = [
  { value: 'DISTRIBUTION',    label: '📤 Distribution'          },
  { value: 'CASH_REQUEST',    label: '💵 Cash Request'          },
  { value: 'PETTY_CASH',      label: '🪙 Petty Cash'            },
  { value: 'SUPPLIER_PAYMENT',label: '🏢 Supplier Payment'     },
  { value: 'LOCAL_SUPPLIER',  label: '🛒 Local Supplier Payment'},
]

// ── Field-distribution recipient/party types ─────────────────────
const RTYPE = {
  EMPLOYEE: { color:'#1565c0', light:'#e3f2fd', icon:'👤', label:'Employee',     border:'#90caf9' },
  SUBCON:   { color:'#bf360c', light:'#fbe9e7', icon:'🔧', label:'Sub-Contractor',border:'#ffab91' },
  SUPPLIER: { color:'#4a148c', light:'#f3e5f5', icon:'🏢', label:'Supplier',     border:'#ce93d8' },
  ANB77:    { color:'#2e7d32', light:'#e8f5e9', icon:'🏦', label:'ANB-77 (Tech-3)',border:'#a5d6a7' },
  ANB39:    { color:'#00695c', light:'#e0f2f1', icon:'🏦', label:'ANB-39 (Tech-2)',border:'#80cbc4' },
  OTHERS:   { color:'#5d4037', light:'#efebe9', icon:'📌', label:'Others',        border:'#bcaaa4' },
}

const EMPTY_FIELD_ROW = { type:'EMPLOYEE', recipientId:'', recipientName:'', amount:'', purpose:'', poId:'' }
const EMPTY_TRAVEL_ROW = { employeeId:'', employeeName:'', payType:'PER_DIEM', amount:'', days:'', description:'' }

// ── Shared styles ─────────────────────────────────────────────────
const S = {
  label: { display:'block', fontSize:10, color:'#6b7c93', fontWeight:800, textTransform:'uppercase', letterSpacing:0.6, marginBottom:5 },
  input: { width:'100%', padding:'11px 13px', border:'1.5px solid #e0e7ef', borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit', background:'#fff', color:'#1a2540', transition:'border-color 0.15s' },
}

// ═══════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════
export default function FormPayment() {
  const { session, entityId, entityCode, loading: authLoading } = useAuth()

  const isTravel = ['RAT','GWT'].includes(entityCode)
  const isACCSYS = entityCode === 'ACCSYS'

  if (authLoading) return <Splash msg="Loading…" />
  if (!session)    return <LoginWall />

  if (isTravel) return <TravelPaymentForm entityId={entityId} entityCode={entityCode} />
  if (isACCSYS) return <FieldDistributionForm entityId={entityId} />

  // Fallback for unknown entity
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#eef2f7', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:36, textAlign:'center', maxWidth:360, width:'100%' }}>
        <div style={{ fontSize:44, marginBottom:14 }}>⚠️</div>
        <div style={{ fontWeight:800, color:'#1a2540', fontSize:17, marginBottom:8 }}>Entity Not Recognised</div>
        <div style={{ color:'#6b7c93', fontSize:13 }}>
          Your account is linked to entity <strong>{entityCode}</strong> which has no payment form configured.
          Contact your system administrator.
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// TRAVEL PAYMENT FORM  (RAT / GWT)
// ═══════════════════════════════════════════════════════════════
function TravelPaymentForm({ entityId, entityCode }) {
  const [fromAccount, setFromAccount] = useState('ANB-39')
  const [deptId,      setDeptId]      = useState('')
  const [payDate,     setPayDate]     = useState(today())
  const [rows,        setRows]        = useState([{ ...EMPTY_TRAVEL_ROW }])
  const [notes,       setNotes]       = useState('')

  const [depts,     setDepts]     = useState([])
  const [employees, setEmployees] = useState([])
  const [dataLoading, setDataLoading] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [error,      setError]      = useState('')

  const total = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)

  useEffect(() => {
    if (!entityId) return
    setDataLoading(true)
    Promise.all([
      supabase.from('departments').select('id,dept_code,dept_name').eq('entity_id', entityId).eq('is_active', true).order('dept_code'),
      supabase.from('employees').select('id,full_name_en,department_id').eq('entity_id', entityId).eq('is_active', true).order('full_name_en'),
    ]).then(([{ data:d },{ data:e }]) => {
      setDepts(d || [])
      setEmployees(e || [])
      setDataLoading(false)
    })
  }, [entityId])

  const deptEmps = deptId ? employees.filter(e => e.department_id === deptId) : employees

  const updateRow = (idx, patch) => setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  const addRow    = () => setRows(prev => [...prev, { ...EMPTY_TRAVEL_ROW }])
  const removeRow = idx => setRows(prev => prev.filter((_, i) => i !== idx))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const valid = rows.filter(r => parseFloat(r.amount) > 0)
    if (!valid.length) { setError('Add at least one row with an amount.'); return }

    setSubmitting(true)
    const { data:{ user } } = await supabase.auth.getUser()

    const records = valid.map(r => ({
      entity_id:      entityId,
      from_account:   fromAccount,
      department_id:  deptId || null,
      payment_date:   payDate,
      recipient_type: 'EMPLOYEE',
      recipient_id:   r.employeeId   || null,
      recipient_name: r.employeeName || r.employeeId || 'Unknown',
      amount:         parseFloat(r.amount),
      purpose:        [TRAVEL_TYPES.find(t => t.value === r.payType)?.label?.replace(/^[^ ]+ /,''), r.description].filter(Boolean).join(' — ') || r.payType,
      notes:          [r.days ? `${r.days} days` : '', notes].filter(Boolean).join(' | ') || null,
      submitted_by:   user?.id || null,
      status:         'PENDING_ACK',
    }))

    const { error: err } = await supabase.from('field_payment_distributions').insert(records)
    if (err) { setError(err.message); setSubmitting(false); return }
    setSubmitted(true)
    setSubmitting(false)
  }

  function reset() { setRows([{ ...EMPTY_TRAVEL_ROW }]); setNotes(''); setError(''); setSubmitted(false) }

  if (submitted) return <SuccessScreen total={total} account={fromAccount} type="travel" onAnother={reset} />

  const entityLabel = entityCode === 'RAT' ? 'Ratal Travel' : 'Gulf World Travel'

  return (
    <div style={{ minHeight:'100vh', background:'#eef2f7', fontFamily:'system-ui,-apple-system,Arial,sans-serif' }}>

      {/* Header */}
      <div style={{ background:'linear-gradient(145deg,#0a1628 0%,#1a237e 60%,#283593 100%)', paddingBottom:32 }}>
        <div style={{ maxWidth:520, margin:'0 auto', padding:'18px 16px 0' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:'rgba(255,255,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, border:'1px solid rgba(255,255,255,0.15)' }}>✈️</div>
            <div>
              <div style={{ color:'#fff', fontWeight:800, fontSize:19, letterSpacing:-0.3 }}>Travel Payment</div>
              <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11 }}>{entityLabel} · Field Disbursement</div>
            </div>
          </div>

          {/* Account pills */}
          <div style={{ display:'flex', gap:6, marginBottom:22, overflowX:'auto', paddingBottom:2 }}>
            {ACCOUNTS.slice(0,5).map(acc => (
              <button key={acc.value} onClick={() => setFromAccount(acc.value)}
                style={{ flexShrink:0, padding:'7px 14px', borderRadius:20, border:'none', cursor:'pointer',
                  background: fromAccount===acc.value ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)',
                  color: fromAccount===acc.value ? '#fff' : 'rgba(255,255,255,0.45)',
                  fontWeight: fromAccount===acc.value ? 800 : 500, fontSize:12,
                  outline: fromAccount===acc.value ? '1.5px solid rgba(255,255,255,0.35)' : 'none' }}>
                {acc.label}
              </button>
            ))}
          </div>

          {/* Total */}
          <div style={{ textAlign:'center', padding:'4px 0 8px' }}>
            <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, fontWeight:700, letterSpacing:2, textTransform:'uppercase', marginBottom:6 }}>Total Payment</div>
            <div style={{ color:'#fff', fontSize:46, fontWeight:900, letterSpacing:-2, lineHeight:1 }}>{total > 0 ? total.toLocaleString('en-SA') : '0'}</div>
            <div style={{ color:'rgba(255,255,255,0.4)', fontSize:13, marginTop:4 }}>SAR</div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth:520, margin:'0 auto', padding:'0 12px 110px' }}>

        {/* Date + Dept */}
        <div style={{ background:'#fff', borderRadius:16, padding:16, marginTop:-18, marginBottom:14, boxShadow:'0 6px 24px rgba(0,0,0,0.13)' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={S.label}>Payment Date</label>
              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} style={S.input} />
            </div>
            <div>
              <label style={S.label}>Department</label>
              <select value={deptId} onChange={e => setDeptId(e.target.value)} style={S.input} disabled={dataLoading}>
                <option value="">All / Select</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.dept_code || d.dept_name}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Payment rows */}
        {rows.map((row, idx) => (
          <TravelRow key={idx} row={row} employees={deptEmps}
            canRemove={rows.length > 1}
            onUpdate={patch => updateRow(idx, patch)}
            onRemove={() => removeRow(idx)} />
        ))}

        <button onClick={addRow}
          style={{ width:'100%', padding:'12px 0', background:'#fff', borderRadius:12,
            border:'1.5px dashed #90caf9', color:'#1565c0', fontWeight:700, fontSize:13,
            cursor:'pointer', marginBottom:14 }}>
          + Add Another Person
        </button>

        {/* Notes */}
        <div style={{ background:'#fff', borderRadius:12, padding:'14px 16px', marginBottom:14, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
          <label style={S.label}>Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Trip reference, project number, any remarks…" rows={3}
            style={{ ...S.input, resize:'vertical', lineHeight:1.5 }} />
        </div>

        {error && <div style={{ background:'#ffebee', borderRadius:10, padding:'12px 16px', marginBottom:14, color:'#c62828', fontSize:13, fontWeight:600 }}>⚠ {error}</div>}
      </div>

      {/* Sticky submit */}
      <div style={{ position:'fixed', bottom:0, left:0, right:0, padding:'10px 16px 16px', background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', boxShadow:'0 -4px 24px rgba(0,0,0,0.12)' }}>
        <div style={{ maxWidth:520, margin:'0 auto' }}>
          <button onClick={handleSubmit} disabled={submitting || total <= 0}
            style={{ width:'100%', padding:16,
              background: total > 0 ? 'linear-gradient(135deg,#0a1628,#1a237e)' : '#cfd8dc',
              color:'#fff', border:'none', borderRadius:13, fontSize:16, fontWeight:800,
              cursor: total > 0 ? 'pointer' : 'default',
              boxShadow: total > 0 ? '0 4px 16px rgba(26,35,126,0.4)' : 'none' }}>
            {submitting ? '⏳ Submitting…' : total > 0 ? `✈️ Submit — SAR ${total.toLocaleString()}` : 'Add recipients to continue'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TravelRow({ row, employees, canRemove, onUpdate, onRemove }) {
  const tType = TRAVEL_TYPES.find(t => t.value === row.payType) || TRAVEL_TYPES[0]
  const showDays = ['PER_DIEM','HOTEL'].includes(row.payType)

  return (
    <div style={{ background:'#fff', borderRadius:14, marginBottom:12, boxShadow:'0 3px 14px rgba(0,0,0,0.09)', overflow:'hidden', borderLeft:'4px solid #1a237e' }}>
      {/* Card header */}
      <div style={{ background:'#e8eaf6', padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontWeight:700, fontSize:12, color:'#1a237e' }}>✈️ Travel Payment</div>
        {canRemove && (
          <button onClick={onRemove} style={{ background:'#ffebee', color:'#c62828', border:'none', borderRadius:'50%', width:28, height:28, cursor:'pointer', fontSize:14 }}>✕</button>
        )}
      </div>

      <div style={{ padding:'14px 16px' }}>
        {/* Employee */}
        <div style={{ marginBottom:12 }}>
          <label style={S.label}>Employee *</label>
          {employees.length > 0 ? (
            <select value={row.employeeId}
              onChange={e => {
                const emp = employees.find(x => x.id === e.target.value)
                onUpdate({ employeeId: e.target.value, employeeName: emp?.full_name_en || '' })
              }}
              style={S.input}>
              <option value="">— Select Employee —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name_en}</option>)}
            </select>
          ) : (
            <input value={row.employeeName} onChange={e => onUpdate({ employeeName: e.target.value })}
              placeholder="Employee name…" style={S.input} />
          )}
        </div>

        {/* Payment type */}
        <div style={{ marginBottom:12 }}>
          <label style={S.label}>Payment Type *</label>
          <select value={row.payType} onChange={e => onUpdate({ payType: e.target.value })} style={S.input}>
            {TRAVEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {/* Amount + Days (if per diem / hotel) */}
        <div style={{ display:'grid', gridTemplateColumns: showDays ? '1fr 1fr' : '1fr', gap:12, marginBottom:12 }}>
          <div>
            <label style={S.label}>Amount (SAR) *</label>
            <div style={{ position:'relative' }}>
              <span style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#6b7c93', fontWeight:700, pointerEvents:'none' }}>SAR</span>
              <input type="number" min="0" step="0.01" value={row.amount}
                onChange={e => onUpdate({ amount: e.target.value })}
                placeholder="0.00"
                style={{ ...S.input, paddingLeft:50, fontSize:20, fontWeight:800, color:'#1a237e', letterSpacing:-0.5 }} />
            </div>
          </div>
          {showDays && (
            <div>
              <label style={S.label}>No. of Days</label>
              <input type="number" min="1" step="1" value={row.days}
                onChange={e => onUpdate({ days: e.target.value })}
                placeholder="e.g. 3"
                style={{ ...S.input, fontSize:16, fontWeight:700 }} />
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <label style={S.label}>Description / Reference</label>
          <input value={row.description} onChange={e => onUpdate({ description: e.target.value })}
            placeholder={`${tType.label.replace(/^[^ ]+ /,'')} details, trip ref…`}
            style={S.input} />
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// FIELD DISTRIBUTION FORM  (ACCSYS)
// ═══════════════════════════════════════════════════════════════
function FieldDistributionForm({ entityId }) {
  const [fromAccount,  setFromAccount]  = useState('ANB-77')
  const [requestType,  setRequestType]  = useState('DISTRIBUTION')
  const [deptId,       setDeptId]       = useState('')
  const [deptBucket,   setDeptBucket]   = useState('')
  const [payDate,      setPayDate]      = useState(today())
  const [rows,         setRows]         = useState([{ ...EMPTY_FIELD_ROW }])
  const [notes,        setNotes]        = useState('')

  const [depts,       setDepts]       = useState([])
  const [employees,   setEmployees]   = useState([])
  const [contractors, setContractors] = useState([])
  const [projects,    setProjects]    = useState([])
  const [dataLoading, setDataLoading] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [error,      setError]      = useState('')

  const total       = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const hasSupplier = rows.some(r => r.type === 'SUPPLIER' && parseFloat(r.amount) > 0)
  const hasSubCon   = rows.some(r => r.type === 'SUBCON'   && parseFloat(r.amount) > 0)

  useEffect(() => {
    if (!entityId) return
    setDataLoading(true)
    Promise.all([
      supabase.from('departments').select('id,dept_code,dept_name').eq('entity_id', entityId).eq('is_active', true).order('dept_code'),
      supabase.from('employees').select('id,full_name_en,department_id').eq('entity_id', entityId).eq('is_active', true).order('full_name_en'),
      supabase.from('contractors').select('id,contractor_name,company_name,vendor_type').eq('entity_id', entityId).order('contractor_name'),
      supabase.from('projects').select('id,project_number,project_name,department_id').eq('entity_id', entityId).in('status',['OPEN','ACTIVE']).order('project_number'),
    ]).then(([{ data:d },{ data:e },{ data:c },{ data:p }]) => {
      setDepts(d || []); setEmployees(e || []); setContractors(c || []); setProjects(p || [])
      setDataLoading(false)
    })
  }, [entityId])

  const deptEmps  = deptId ? employees.filter(e => e.department_id === deptId) : employees
  const subcons   = contractors.filter(c => c.vendor_type === 'SUB_CONTRACTOR')
  const suppliers = contractors.filter(c => c.vendor_type !== 'SUB_CONTRACTOR')
  const deptProjs = deptId ? projects.filter(p => !p.department_id || p.department_id === deptId) : projects

  const updateRow = (idx, patch) => setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  const addRow    = (type='EMPLOYEE') => setRows(prev => [...prev, { ...EMPTY_FIELD_ROW, type }])
  const removeRow = idx => setRows(prev => prev.filter((_, i) => i !== idx))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const valid = rows.filter(r => (['ANB77','ANB39'].includes(r.type) || r.recipientName.trim()) && parseFloat(r.amount) > 0)
    if (!valid.length) { setError('Add at least one recipient with a name and amount.'); return }
    if (fromAccount === 'ANB-39' && !deptId) { setError('Select a department for ANB-39 — it tracks each department balance separately.'); return }

    setSubmitting(true)
    const { data:{ user } } = await supabase.auth.getUser()

    const records = valid.map(r => ({
      entity_id:      entityId,
      from_account:   fromAccount,
      dept_bucket:    deptBucket   || null,
      department_id:  deptId       || null,
      payment_date:   payDate,
      request_type:   requestType  || null,
      recipient_type: r.type,
      recipient_id:   r.recipientId   || null,
      recipient_name: r.type === 'ANB77' ? 'Tech-3 (ANB-77)' : r.type === 'ANB39' ? 'Tech-2 (ANB-39)' : r.recipientName.trim(),
      po_id:          r.poId          || null,
      amount:         parseFloat(r.amount),
      purpose:        r.purpose.trim() || null,
      notes:          notes.trim()     || null,
      submitted_by:   user?.id         || null,
      status:         r.type === 'SUPPLIER' ? 'INVOICE_PENDING'
                    : ['ANB77','ANB39'].includes(r.type) ? 'COMPLETED'
                    : 'PENDING_ACK',
    }))

    const { error: err } = await supabase.from('field_payment_distributions').insert(records)
    if (err) { setError(err.message); setSubmitting(false); return }
    setSubmitted(true)
    setSubmitting(false)
  }

  function reset() { setRows([{ ...EMPTY_FIELD_ROW }]); setNotes(''); setError(''); setSubmitted(false) }

  if (submitted) return <SuccessScreen total={total} account={fromAccount} type="field" onAnother={reset} />

  return (
    <div style={{ minHeight:'100vh', background:'#eef2f7', fontFamily:'system-ui,-apple-system,Arial,sans-serif' }}>

      {/* Header */}
      <div style={{ background:'linear-gradient(145deg,#0a1628 0%,#0d2b55 50%,#1565c0 100%)', paddingBottom:32 }}>
        <div style={{ maxWidth:520, margin:'0 auto', padding:'18px 16px 0' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:'rgba(255,255,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, border:'1px solid rgba(255,255,255,0.15)' }}>💸</div>
            <div>
              <div style={{ color:'#fff', fontWeight:800, fontSize:19, letterSpacing:-0.3 }}>Field Payment</div>
              <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11 }}>Ratal Advanced Technologies · Cash Distribution</div>
            </div>
          </div>

          {/* Account pills */}
          <div style={{ display:'flex', gap:6, marginBottom:22, overflowX:'auto', paddingBottom:2 }}>
            {ACCOUNTS.slice(0,5).map(acc => (
              <button key={acc.value} onClick={() => setFromAccount(acc.value)}
                style={{ flexShrink:0, padding:'7px 14px', borderRadius:20, border:'none', cursor:'pointer',
                  background: fromAccount===acc.value ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.07)',
                  color: fromAccount===acc.value ? '#fff' : 'rgba(255,255,255,0.45)',
                  fontWeight: fromAccount===acc.value ? 800 : 500, fontSize:12,
                  outline: fromAccount===acc.value ? '1.5px solid rgba(255,255,255,0.35)' : 'none' }}>
                {acc.label}
              </button>
            ))}
          </div>

          {/* Total */}
          <div style={{ textAlign:'center', padding:'4px 0 8px' }}>
            <div style={{ color:'rgba(255,255,255,0.5)', fontSize:11, fontWeight:700, letterSpacing:2, textTransform:'uppercase', marginBottom:6 }}>Total Payment</div>
            <div style={{ color:'#fff', fontSize:46, fontWeight:900, letterSpacing:-2, lineHeight:1 }}>{total > 0 ? total.toLocaleString('en-SA') : '0'}</div>
            <div style={{ color:'rgba(255,255,255,0.4)', fontSize:13, marginTop:4 }}>SAR</div>
            {rows.filter(r => parseFloat(r.amount) > 0).length > 0 && (
              <div style={{ color:'rgba(255,255,255,0.45)', fontSize:12, marginTop:6 }}>
                {rows.filter(r => parseFloat(r.amount) > 0).length} recipient{rows.filter(r => parseFloat(r.amount) > 0).length > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth:520, margin:'0 auto', padding:'0 12px 110px' }}>

        {/* Date + Dept + Request Type */}
        <div style={{ background:'#fff', borderRadius:16, padding:16, marginTop:-18, marginBottom:14, boxShadow:'0 6px 24px rgba(0,0,0,0.13)' }}>
          {/* Request Type pills */}
          <div style={{ marginBottom:14 }}>
            <label style={S.label}>Request Type</label>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:6 }}>
              {FIELD_REQUEST_TYPES.map(rt => (
                <button key={rt.value} onClick={() => setRequestType(rt.value)}
                  style={{ padding:'6px 14px', borderRadius:20, border:'none', cursor:'pointer', fontSize:11, fontWeight:700,
                    background: requestType === rt.value ? '#1565c0' : '#f0f4f8',
                    color:      requestType === rt.value ? '#fff'    : '#6b7c93',
                    outline:    requestType === rt.value ? '2px solid #1565c0' : 'none',
                    outlineOffset: requestType === rt.value ? '2px' : 0 }}>
                  {rt.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <label style={S.label}>Payment Date</label>
              <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} style={S.input} />
            </div>
            <div>
              <label style={S.label}>Department {fromAccount==='ANB-39' && <span style={{ color:'#c62828' }}>*</span>}</label>
              <select value={deptId} onChange={e => { const d=depts.find(x=>x.id===e.target.value); setDeptId(e.target.value); setDeptBucket(d?.dept_code||'') }}
                style={S.input} disabled={dataLoading}>
                <option value="">All / Select</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.dept_code || d.dept_name}</option>)}
              </select>
            </div>
          </div>
          {fromAccount==='ANB-39' && deptBucket && (
            <div style={{ marginTop:10, background:'#e8f5e9', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#2e7d32', fontWeight:600 }}>
              💼 Charging {deptBucket} bucket in ANB-39
            </div>
          )}
        </div>

        {/* Recipient cards */}
        {rows.map((row, idx) => (
          <FieldRecipientCard key={idx} row={row} employees={deptEmps} subcons={subcons} suppliers={suppliers} projects={deptProjs}
            canRemove={rows.length > 1}
            onUpdate={patch => updateRow(idx, patch)}
            onRemove={() => removeRow(idx)} />
        ))}

        {/* Add buttons */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
          {Object.entries(RTYPE).map(([type, t]) => (
            <button key={type} onClick={() => addRow(type)}
              style={{ flex:'1 1 120px', padding:'9px 6px', borderRadius:10, cursor:'pointer', background:t.light,
                color:t.color, fontWeight:700, fontSize:11, border:`1.5px dashed ${t.border}` }}>
              + {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Invoice notice */}
        {(hasSupplier || hasSubCon) && (
          <div style={{ background:'#fffbf0', border:'1px solid #ffe082', borderRadius:12, padding:'13px 16px', marginBottom:14, borderLeft:'4px solid #f9a825' }}>
            <div style={{ fontWeight:800, color:'#e65100', fontSize:13, marginBottom:5 }}>⚠️ Invoice Required</div>
            <div style={{ fontSize:12, color:'#795548', lineHeight:1.5 }}>
              {hasSupplier && <div>• <strong>Supplier</strong> payments flagged until invoice is uploaded.</div>}
              {hasSubCon   && <div>• <strong>Sub-Con</strong> payments require acknowledgment + invoice.</div>}
            </div>
          </div>
        )}

        {/* Notes */}
        <div style={{ background:'#fff', borderRadius:12, padding:'14px 16px', marginBottom:14, boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}>
          <label style={S.label}>Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Reference numbers, instructions…" rows={3}
            style={{ ...S.input, resize:'vertical', lineHeight:1.5 }} />
        </div>

        {error && <div style={{ background:'#ffebee', borderRadius:10, padding:'12px 16px', marginBottom:14, color:'#c62828', fontSize:13, fontWeight:600 }}>⚠ {error}</div>}

        <div style={{ background:'#f3f0ff', borderRadius:10, padding:'11px 14px', fontSize:11, color:'#5A32D4', lineHeight:1.5 }}>
          <strong>📋 Reminder:</strong> This form records company cash payments. For your own expense reimbursements, use the <strong>Expense Claim</strong> form instead.
        </div>
      </div>

      {/* Sticky submit */}
      <div style={{ position:'fixed', bottom:0, left:0, right:0, padding:'10px 16px 16px', background:'rgba(255,255,255,0.96)', backdropFilter:'blur(12px)', boxShadow:'0 -4px 24px rgba(0,0,0,0.12)' }}>
        <div style={{ maxWidth:520, margin:'0 auto' }}>
          <button onClick={handleSubmit} disabled={submitting || total <= 0}
            style={{ width:'100%', padding:16,
              background: total > 0 ? 'linear-gradient(135deg,#0a1628,#1565c0)' : '#cfd8dc',
              color:'#fff', border:'none', borderRadius:13, fontSize:16, fontWeight:800,
              cursor: total > 0 ? 'pointer' : 'default',
              boxShadow: total > 0 ? '0 4px 16px rgba(21,101,192,0.4)' : 'none' }}>
            {submitting ? '⏳ Submitting…' : total > 0 ? `💸 Submit — SAR ${total.toLocaleString()}` : 'Add recipients to continue'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FieldRecipientCard({ row, employees, subcons, suppliers, projects, canRemove, onUpdate, onRemove }) {
  const t = RTYPE[row.type] || RTYPE.OTHERS
  const displayName = p => p.full_name_en || p.company_name || p.contractor_name || ''

  // Determine party list based on type
  const partyList = row.type === 'EMPLOYEE' ? employees
    : row.type === 'SUBCON'   ? subcons
    : row.type === 'SUPPLIER' ? suppliers
    : []

  // ANB-39/77 are locked recipients (field accounts, no dropdown)
  const isANBAccount = ['ANB77','ANB39'].includes(row.type)
  const lockedName   = row.type === 'ANB77' ? 'Tech-3 (ANB-77)' : row.type === 'ANB39' ? 'Tech-2 (ANB-39)' : ''

  return (
    <div style={{ background:'#fff', borderRadius:14, marginBottom:12, boxShadow:'0 3px 14px rgba(0,0,0,0.09)', overflow:'hidden', borderLeft:`4px solid ${t.color}` }}>

      {/* Type switcher header */}
      <div style={{ background:t.light, padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:4 }}>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          {Object.entries(RTYPE).map(([type, th]) => (
            <button key={type} onClick={() => {
              const name = type === 'ANB77' ? 'Tech-3 (ANB-77)' : type === 'ANB39' ? 'Tech-2 (ANB-39)' : ''
              onUpdate({ type, recipientId:'', recipientName: name })
            }}
              style={{ padding:'4px 10px', borderRadius:20, border:'none', cursor:'pointer', fontWeight:700, fontSize:10,
                background: row.type===type ? th.color : 'rgba(0,0,0,0.06)',
                color: row.type===type ? '#fff' : '#888' }}>
              {th.icon} {th.label}
            </button>
          ))}
        </div>
        {canRemove && (
          <button onClick={onRemove} style={{ background:'#ffebee', color:'#c62828', border:'none', borderRadius:'50%', width:28, height:28, cursor:'pointer', fontSize:14 }}>✕</button>
        )}
      </div>

      <div style={{ padding:'14px 16px' }}>

        {/* Recipient name */}
        {!isANBAccount && (
          <div style={{ marginBottom:12 }}>
            <label style={S.label}>{t.label} Name *</label>
            {partyList.length > 0 ? (
              <select value={row.recipientId}
                onChange={e => { const item = partyList.find(p => p.id === e.target.value); onUpdate({ recipientId: e.target.value, recipientName: displayName(item) || '' }) }}
                style={S.input}>
                <option value="">— Select {t.label} —</option>
                {partyList.map(p => <option key={p.id} value={p.id}>{displayName(p)}</option>)}
              </select>
            ) : (
              <input value={row.recipientName} onChange={e => onUpdate({ recipientName: e.target.value })}
                placeholder={`${t.label} name…`} style={S.input} />
            )}
          </div>
        )}

        {/* ANB-39 / ANB-77 — locked label */}
        {isANBAccount && (
          <div style={{ marginBottom:12, padding:'10px 13px', background:t.light, borderRadius:9,
            fontSize:13, fontWeight:800, color:t.color, border:`1.5px solid ${t.border}` }}>
            🏦 {lockedName} — Field Account Top-Up
          </div>
        )}

        {/* Amount */}
        <div style={{ marginBottom:12 }}>
          <label style={S.label}>Amount (SAR) *</label>
          <div style={{ position:'relative' }}>
            <span style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)', fontSize:13, color:'#6b7c93', fontWeight:700, pointerEvents:'none' }}>SAR</span>
            <input type="number" min="0" step="0.01" value={row.amount}
              onChange={e => onUpdate({ amount: e.target.value })} placeholder="0.00"
              style={{ ...S.input, paddingLeft:50, fontSize:22, fontWeight:800, color:t.color, letterSpacing:-0.5 }} />
          </div>
        </div>

        {/* Purpose */}
        <div style={{ marginBottom: row.type === 'SUBCON' ? 12 : 0 }}>
          <label style={S.label}>Purpose / Description</label>
          <input value={row.purpose} onChange={e => onUpdate({ purpose: e.target.value })}
            placeholder="What is this payment for?" style={S.input} />
        </div>

        {/* Project reference for sub-con */}
        {row.type === 'SUBCON' && (
          <div>
            <label style={S.label}>Project Reference (optional)</label>
            <select value={row.poId} onChange={e => onUpdate({ poId: e.target.value })} style={S.input}>
              <option value="">— Select Project —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.project_number} — {p.project_name}</option>)}
            </select>
          </div>
        )}

        {/* Status notices */}
        {row.type === 'SUPPLIER' && (
          <div style={{ marginTop:10, padding:'7px 11px', borderRadius:7, background:'#fff8e1', fontSize:11, color:'#e65100', fontWeight:600 }}>
            ⚠️ Invoice required within 7 days
          </div>
        )}
        {['EMPLOYEE','SUBCON'].includes(row.type) && parseFloat(row.amount) > 0 && (
          <div style={{ marginTop:10, padding:'7px 11px', borderRadius:7, background:'#e3f2fd', fontSize:11, color:'#1565c0', fontWeight:600 }}>
            📲 Recipient will be notified to acknowledge
          </div>
        )}
        {isANBAccount && parseFloat(row.amount) > 0 && (
          <div style={{ marginTop:10, padding:'7px 11px', borderRadius:7, background:'#e8f5e9', fontSize:11, color:'#2e7d32', fontWeight:600 }}>
            ✅ Field account top-up — DH handles distribution
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Shared helper screens
// ═══════════════════════════════════════════════════════════════
function Splash({ msg }) {
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#eef2f7' }}>
      <div style={{ color:'#6b7c93', fontSize:14 }}>{msg}</div>
    </div>
  )
}

function LoginWall() {
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(145deg,#0a1628,#1565c0)', padding:20 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:36, textAlign:'center', maxWidth:320, width:'100%' }}>
        <div style={{ fontSize:44, marginBottom:14 }}>🔒</div>
        <div style={{ fontWeight:800, color:'#1a2540', fontSize:17, marginBottom:8 }}>Login Required</div>
        <div style={{ color:'#6b7c93', fontSize:13, lineHeight:1.5 }}>Scan your QR or log in via the portal to record payments.</div>
      </div>
    </div>
  )
}

function SuccessScreen({ total, account, type, onAnother }) {
  const isTravel = type === 'travel'
  return (
    <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:`linear-gradient(145deg,#0a1628,${isTravel?'#1a237e':'#1565c0'})`, padding:20 }}>
      <div style={{ background:'#fff', borderRadius:20, padding:36, textAlign:'center', maxWidth:360, width:'100%' }}>
        <div style={{ width:70, height:70, background:'#e8f5e9', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:34, margin:'0 auto 18px', boxShadow:'0 0 0 8px rgba(46,125,50,0.1)' }}>✅</div>
        <div style={{ fontWeight:900, color:'#1a2540', fontSize:22, marginBottom:6 }}>Payment Recorded</div>
        <div style={{ color:'#6b7c93', fontSize:14, marginBottom:20 }}>
          <span style={{ fontWeight:800, color:'#1565c0', fontSize:20 }}>SAR {total.toLocaleString()}</span>
          <br /><span>from {account}</span>
        </div>
        <div style={{ background:'#f8fafd', borderRadius:12, padding:'14px 16px', marginBottom:22, textAlign:'left' }}>
          <div style={{ fontSize:11, fontWeight:800, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.5, marginBottom:10 }}>What Happens Next</div>
          <div style={{ fontSize:12, color:'#1a2540', lineHeight:1.8 }}>
            {isTravel ? <>
              👤 <strong>Recipients</strong> notified to acknowledge<br />
              📊 <strong>Finance team</strong> notified automatically<br />
              📋 <strong>Accounts</strong> updated in the system
            </> : <>
              👤 <strong>Employees</strong> notified to acknowledge<br />
              🔧 <strong>Sub-Cons</strong> to acknowledge + submit invoice<br />
              🏢 <strong>Suppliers</strong> flagged — invoice required within 7 days<br />
              📊 <strong>Accounts</strong> notified automatically
            </>}
          </div>
        </div>
        <button onClick={onAnother}
          style={{ width:'100%', padding:15, background:`linear-gradient(135deg,#0a1628,${isTravel?'#1a237e':'#1565c0'})`, color:'#fff', border:'none', borderRadius:12, fontSize:15, fontWeight:800, cursor:'pointer', boxShadow:'0 4px 16px rgba(21,101,192,0.35)' }}>
          + Record Another Payment
        </button>
      </div>
    </div>
  )
}

function today() { return new Date().toISOString().split('T')[0] }
