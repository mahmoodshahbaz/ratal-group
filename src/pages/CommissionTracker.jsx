import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'

// ═══════════════════════════════════════════════════════════════════
// Commission Tracker — Phase 18
//
// Tracks two flows:
//   RECEIVED  — agency commissions earned from airlines / suppliers
//   PAID      — staff agent incentive commissions
//
// Tabs:
//   1. Earned       — agency commissions from airlines / hotels / etc.
//   2. Agent        — staff incentive commissions
//   3. Settlement   — batch-confirm + GL post received commissions
//   4. Rate Cards   — manage commission rate rules
//   5. Reports      — by period / supplier / agent
// ═══════════════════════════════════════════════════════════════════

const COMM_TYPES  = ['AIRLINE','HOTEL','CAR','INSURANCE','PACKAGE','STAFF','REFERRAL','OTHER']
const STATUSES    = ['PENDING','CONFIRMED','RECEIVED','PAID','REVERSED','WRITTEN_OFF']
const STATUS_NEXT = {
  PENDING:    ['CONFIRMED','WRITTEN_OFF'],
  CONFIRMED:  ['RECEIVED','PAID','REVERSED'],
  RECEIVED:   ['REVERSED'],
  PAID:       ['REVERSED'],
  REVERSED:   [],
  WRITTEN_OFF:[],
}
const STATUS_COLORS = {
  PENDING:    { bg:'#fff8e1', color:'#f57f17', border:'#ffe082' },
  CONFIRMED:  { bg:'#e3f2fd', color:'#1565C0', border:'#90caf9' },
  RECEIVED:   { bg:'#e8f5e9', color:'#2e7d32', border:'#a5d6a7' },
  PAID:       { bg:'#e8f5e9', color:'#2e7d32', border:'#a5d6a7' },
  REVERSED:   { bg:'#fce4ec', color:'#c62828', border:'#ef9a9a' },
  WRITTEN_OFF:{ bg:'#f5f5f5', color:'#757575', border:'#e0e0e0' },
}
const TYPE_COLORS = {
  AIRLINE:'#1565C0', HOTEL:'#2e7d32', CAR:'#e65100', INSURANCE:'#5A32D4',
  PACKAGE:'#00695c', STAFF:'#795548', REFERRAL:'#f57f17', OTHER:'#546e7a',
}

const today = () => new Date().toISOString().slice(0,10)
const ym    = (d=new Date()) => ({ y:d.getFullYear(), m:d.getMonth()+1 })
const fmt   = n => (+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtN  = n => {
  const v=+n||0
  if(Math.abs(v)>=1e6) return (v/1e6).toFixed(2)+'M'
  if(Math.abs(v)>=1e3) return (v/1e3).toFixed(1)+'K'
  return v.toFixed(2)
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Shared styles ─────────────────────────────────────────────────
const S = {
  card:   { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:12 },
  tab:    (active,color='#1565C0') => ({
    padding:'8px 16px', borderRadius:20, fontWeight:700, fontSize:12, cursor:'pointer', border:'none',
    background: active ? color : 'transparent',
    color:      active ? '#fff' : '#6b7c93',
  }),
  btn:    (c='#1565C0') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }),
  input:  { padding:'8px 10px', borderRadius:8, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff', width:'100%', boxSizing:'border-box' },
  label:  { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
  pill:   (s) => ({ ...STATUS_COLORS[s]||{bg:'#f5f7fa',color:'#546e7a',border:'#dde3ec'},
    border:'1.5px solid', borderRadius:20, padding:'2px 10px', fontSize:10, fontWeight:700, display:'inline-block' }),
}

// ── KPI strip ────────────────────────────────────────────────────
function KPIStrip({ commissions }) {
  const earned   = commissions.filter(c=>c.direction==='RECEIVED')
  const paid     = commissions.filter(c=>c.direction==='PAID')
  const pending  = earned.filter(c=>c.status==='PENDING')
  const received = earned.filter(c=>c.status==='RECEIVED')
  const sum      = arr => arr.reduce((s,c)=>s+(+c.commission_sar||+c.commission_amount||0),0)

  const kpis = [
    { label:'Total Earned',    val: sum(earned),   color:'#1565C0', icon:'💰' },
    { label:'Received',        val: sum(received),  color:'#2e7d32', icon:'✅' },
    { label:'Pending',         val: sum(pending),   color:'#f57f17', icon:'⏳' },
    { label:'Outstanding',     val: sum(earned.filter(c=>['PENDING','CONFIRMED'].includes(c.status))), color:'#c62828', icon:'⚠️' },
    { label:'Staff Paid',      val: sum(paid.filter(c=>c.status==='PAID')),   color:'#795548', icon:'👤' },
  ]
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:8, marginBottom:14 }}>
      {kpis.map(k=>(
        <div key={k.label} style={{ background:'#fff', borderRadius:12, padding:'12px 14px',
          boxShadow:'0 2px 8px rgba(0,0,0,0.07)', borderLeft:`4px solid ${k.color}` }}>
          <div style={{ fontSize:18 }}>{k.icon}</div>
          <div style={{ fontWeight:800, fontSize:17, color:k.color }}>{fmtN(k.val)}</div>
          <div style={{ fontSize:10, color:'#6b7c93' }}>{k.label} (SAR)</div>
        </div>
      ))}
    </div>
  )
}

// ── Commission Modal (add / edit) ────────────────────────────────
function CommissionModal({ entityId, direction, item, employees, rateCards, onClose, onSaved }) {
  const { user } = useAuth()
  const now = new Date()
  const [form, setForm] = useState({
    direction:        direction||'RECEIVED',
    commission_type:  'AIRLINE',
    period_year:      now.getFullYear(),
    period_month:     now.getMonth()+1,
    booking_ref:      '',
    ticket_number:    '',
    travel_date:      '',
    pax_name:         '',
    route:            '',
    pax_count:        1,
    supplier_code:    '',
    supplier_name:    '',
    bsp_file_ref:     '',
    agent_id:         '',
    agent_name:       '',
    department:       '',
    booking_amount:   '',
    commission_rate:  '',
    commission_amount:'',
    currency:         'SAR',
    exchange_rate:    1,
    settlement_date:  '',
    settlement_ref:   '',
    payment_method:   '',
    gl_account_income:'',
    gl_account_bank:  '',
    notes:            '',
    reference:        '',
    ...item,
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  function calcCommission(bookingAmt, rate) {
    const b = +bookingAmt||0, r = +rate||0
    return (b * r / 100).toFixed(2)
  }

  function applyRate(rateId) {
    const rc = rateCards.find(r=>r.id===rateId)
    if (!rc) return
    const rate = rc.rate_type==='PERCENTAGE' ? rc.rate_value : 0
    const fixed= rc.rate_type!=='PERCENTAGE' ? rc.rate_value : 0
    const amt  = rate ? calcCommission(form.booking_amount, rate) : fixed
    setForm(f=>({ ...f, rate_id:rateId, commission_rate:rate||0, commission_amount:amt }))
  }

  function handleBookingChange(v) {
    const amt = form.commission_rate ? calcCommission(v, form.commission_rate) : form.commission_amount
    setForm(f=>({ ...f, booking_amount:v, commission_amount:amt }))
  }

  function handleRateChange(v) {
    const amt = calcCommission(form.booking_amount, v)
    setForm(f=>({ ...f, commission_rate:v, commission_amount:amt }))
  }

  async function save() {
    if (!form.commission_amount || +form.commission_amount <= 0) { setErr('Commission amount required'); return }
    setSaving(true); setErr('')
    const sar = (+form.commission_amount||0) * (+form.exchange_rate||1)
    const row = {
      entity_id:         entityId,
      direction:         form.direction,
      commission_type:   form.commission_type,
      period_year:       +form.period_year,
      period_month:      +form.period_month,
      booking_ref:       form.booking_ref||null,
      ticket_number:     form.ticket_number||null,
      travel_date:       form.travel_date||null,
      pax_name:          form.pax_name||null,
      route:             form.route||null,
      pax_count:         +form.pax_count||1,
      supplier_code:     form.supplier_code||null,
      supplier_name:     form.supplier_name||null,
      bsp_file_ref:      form.bsp_file_ref||null,
      agent_id:          form.agent_id||null,
      agent_name:        form.agent_name||null,
      department:        form.department||null,
      booking_amount:    +form.booking_amount||0,
      rate_id:           form.rate_id||null,
      commission_rate:   +form.commission_rate||0,
      commission_amount: +form.commission_amount,
      currency:          form.currency,
      exchange_rate:     +form.exchange_rate||1,
      commission_sar:    sar,
      settlement_date:   form.settlement_date||null,
      settlement_ref:    form.settlement_ref||null,
      payment_method:    form.payment_method||null,
      gl_account_income: form.gl_account_income||null,
      gl_account_bank:   form.gl_account_bank||null,
      notes:             form.notes||null,
      reference:         form.reference||null,
      created_by:        user?.id||null,
    }
    const { error } = item?.id
      ? await supabase.from('commissions').update(row).eq('id',item.id)
      : await supabase.from('commissions').insert(row)
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  const F = ({ label, children }) => (
    <div style={{ marginBottom:10 }}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  )

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:700, maxHeight:'90vh', overflow:'auto', padding:28 }}>
        <div style={{ fontWeight:800, fontSize:16, color:'#1a2e3d', marginBottom:20 }}>
          {item?.id ? 'Edit' : 'New'} {form.direction==='RECEIVED'?'Agency':'Staff'} Commission
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <F label="Direction">
            <select value={form.direction} onChange={e=>setForm(f=>({...f,direction:e.target.value}))} style={S.input}>
              <option value="RECEIVED">RECEIVED (from supplier)</option>
              <option value="PAID">PAID (to staff/agent)</option>
            </select>
          </F>
          <F label="Type">
            <select value={form.commission_type} onChange={e=>setForm(f=>({...f,commission_type:e.target.value}))} style={S.input}>
              {COMM_TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
          </F>
          <F label="Period Year">
            <input type="number" style={S.input} value={form.period_year}
              onChange={e=>setForm(f=>({...f,period_year:e.target.value}))} />
          </F>
          <F label="Period Month">
            <select value={form.period_month} onChange={e=>setForm(f=>({...f,period_month:e.target.value}))} style={S.input}>
              {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
            </select>
          </F>

          {/* Booking link */}
          <F label="Booking Ref / PNR">
            <input style={S.input} value={form.booking_ref} onChange={e=>setForm(f=>({...f,booking_ref:e.target.value}))} placeholder="e.g. ABC123" />
          </F>
          <F label="Ticket Number">
            <input style={S.input} value={form.ticket_number} onChange={e=>setForm(f=>({...f,ticket_number:e.target.value}))} placeholder="e.g. 065-1234567890" />
          </F>
          <F label="Travel Date">
            <input type="date" style={S.input} value={form.travel_date} onChange={e=>setForm(f=>({...f,travel_date:e.target.value}))} />
          </F>
          <F label="Route">
            <input style={S.input} value={form.route} onChange={e=>setForm(f=>({...f,route:e.target.value}))} placeholder="e.g. RUH-DXB" />
          </F>
          <F label="Pax Name">
            <input style={S.input} value={form.pax_name} onChange={e=>setForm(f=>({...f,pax_name:e.target.value}))} placeholder="Passenger name" />
          </F>
          <F label="Pax Count">
            <input type="number" style={S.input} value={form.pax_count} min={1}
              onChange={e=>setForm(f=>({...f,pax_count:e.target.value}))} />
          </F>

          {/* Supplier */}
          <F label="Supplier Code (Airline/Hotel)">
            <input style={S.input} value={form.supplier_code} onChange={e=>setForm(f=>({...f,supplier_code:e.target.value.toUpperCase()}))} placeholder="e.g. SV, EK" />
          </F>
          <F label="Supplier Name">
            <input style={S.input} value={form.supplier_name} onChange={e=>setForm(f=>({...f,supplier_name:e.target.value}))} placeholder="Saudi Airlines, etc." />
          </F>
          {form.commission_type==='AIRLINE' && (
            <F label="BSP File Reference">
              <input style={S.input} value={form.bsp_file_ref} onChange={e=>setForm(f=>({...f,bsp_file_ref:e.target.value}))} placeholder="BSP memo ref" />
            </F>
          )}

          {/* Agent (for PAID or STAFF type) */}
          {(form.direction==='PAID'||form.commission_type==='STAFF') && (
            <>
              <F label="Staff Agent">
                <select value={form.agent_id} onChange={e=>{
                  const emp = employees.find(x=>x.id===e.target.value)
                  setForm(f=>({...f,agent_id:e.target.value,agent_name:emp?.full_name||'',department:emp?.department||''}))
                }} style={S.input}>
                  <option value="">— Select agent —</option>
                  {employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select>
              </F>
              <F label="Department">
                <input style={S.input} value={form.department} onChange={e=>setForm(f=>({...f,department:e.target.value}))} placeholder="Department" />
              </F>
            </>
          )}

          {/* Amounts */}
          <F label="Rate Card (optional)">
            <select onChange={e=>applyRate(e.target.value)} style={S.input} defaultValue="">
              <option value="">— Apply a rate card —</option>
              {rateCards.filter(r=>r.is_active).map(r=>(
                <option key={r.id} value={r.id}>{r.supplier_name||r.commission_type} — {r.rate_value}{r.rate_type==='PERCENTAGE'?'%':' SAR flat'}</option>
              ))}
            </select>
          </F>
          <F label="Booking Amount (gross)">
            <input type="number" style={S.input} value={form.booking_amount}
              onChange={e=>handleBookingChange(e.target.value)} placeholder="0.00" step="0.01" />
          </F>
          <F label="Commission Rate %">
            <input type="number" style={S.input} value={form.commission_rate}
              onChange={e=>handleRateChange(e.target.value)} placeholder="e.g. 3" step="0.01" />
          </F>
          <F label="Commission Amount *">
            <input type="number" style={{ ...S.input, fontWeight:700, color:'#1565C0', fontSize:14 }}
              value={form.commission_amount}
              onChange={e=>setForm(f=>({...f,commission_amount:e.target.value}))} placeholder="0.00" step="0.01" />
          </F>
          <F label="Currency">
            <select value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))} style={S.input}>
              {['SAR','USD','AED','EUR','GBP','BHD','KWD','OMR','QAR'].map(c=><option key={c}>{c}</option>)}
            </select>
          </F>
          {form.currency!=='SAR' && (
            <F label="Exchange Rate to SAR">
              <input type="number" style={S.input} value={form.exchange_rate}
                onChange={e=>setForm(f=>({...f,exchange_rate:e.target.value}))} step="0.0001" />
            </F>
          )}

          {/* Settlement (when already settled) */}
          <F label="Settlement Date">
            <input type="date" style={S.input} value={form.settlement_date} onChange={e=>setForm(f=>({...f,settlement_date:e.target.value}))} />
          </F>
          <F label="Settlement Reference">
            <input style={S.input} value={form.settlement_ref} onChange={e=>setForm(f=>({...f,settlement_ref:e.target.value}))} />
          </F>

          {/* GL accounts */}
          <F label="GL Income Account">
            <input style={S.input} value={form.gl_account_income} onChange={e=>setForm(f=>({...f,gl_account_income:e.target.value}))} placeholder="Income account code" />
          </F>
          <F label="GL Bank/BSP Account">
            <input style={S.input} value={form.gl_account_bank} onChange={e=>setForm(f=>({...f,gl_account_bank:e.target.value}))} placeholder="Bank account code" />
          </F>

          <div style={{ gridColumn:'1/-1' }}>
            <F label="Notes">
              <input style={S.input} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
            </F>
          </div>
        </div>

        {err && <div style={{ color:'#c62828', fontSize:12, marginTop:8 }}>{err}</div>}
        <div style={{ display:'flex', gap:8, marginTop:16, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ background:'#f0f4f8', color:'#546e7a', border:'none', borderRadius:8, padding:'8px 16px', fontWeight:700, cursor:'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={S.btn('#1565C0')}>{saving?'Saving…':'Save Commission'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Commission row ────────────────────────────────────────────────
function CommRow({ c, onEdit, onStatusChange }) {
  const sc = STATUS_COLORS[c.status]||{}
  const tc = TYPE_COLORS[c.commission_type]||'#546e7a'

  return (
    <tr style={{ borderBottom:'1px solid #f0f4f8' }}>
      <td style={{ padding:'10px 8px', fontSize:12, color:'#1a2e3d', fontWeight:600 }}>
        {MONTHS[(c.period_month||1)-1]} {c.period_year}
      </td>
      <td style={{ padding:'10px 8px' }}>
        <span style={{ background:tc+'22', color:tc, borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:700 }}>
          {c.commission_type}
        </span>
      </td>
      <td style={{ padding:'10px 8px', fontSize:12 }}>
        <div style={{ fontWeight:600 }}>{c.supplier_name||c.supplier_code||c.agent_name||'—'}</div>
        {c.ticket_number && <div style={{ fontSize:10, color:'#6b7c93' }}>🎫 {c.ticket_number}</div>}
        {c.booking_ref   && <div style={{ fontSize:10, color:'#6b7c93' }}>📋 {c.booking_ref}</div>}
        {c.route         && <div style={{ fontSize:10, color:'#6b7c93' }}>✈ {c.route}</div>}
        {c.pax_name      && <div style={{ fontSize:10, color:'#6b7c93' }}>👤 {c.pax_name}</div>}
      </td>
      <td style={{ padding:'10px 8px', textAlign:'right', fontSize:12 }}>
        {c.booking_amount > 0 && <div style={{ color:'#6b7c93' }}>{fmt(c.booking_amount)}</div>}
        {c.commission_rate > 0 && <div style={{ fontSize:10, color:'#6b7c93' }}>{c.commission_rate}%</div>}
      </td>
      <td style={{ padding:'10px 8px', textAlign:'right', fontWeight:800, fontSize:14, color:'#1565C0' }}>
        {fmt(c.commission_sar||c.commission_amount)}
        {c.currency!=='SAR' && <div style={{ fontSize:10, color:'#6b7c93' }}>{fmt(c.commission_amount)} {c.currency}</div>}
      </td>
      <td style={{ padding:'10px 8px', textAlign:'center' }}>
        <span style={{ ...sc, border:`1.5px solid ${sc.border}`, borderRadius:20, padding:'2px 10px', fontSize:10, fontWeight:700 }}>
          {c.status}
        </span>
        {c.gl_posted && <div style={{ fontSize:9, color:'#2e7d32', marginTop:2 }}>✓ GL</div>}
      </td>
      <td style={{ padding:'10px 8px' }}>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          <button onClick={()=>onEdit(c)} style={{ background:'transparent', color:'#1565C0', border:'1px solid #1565C0', borderRadius:6, padding:'3px 8px', fontSize:10, cursor:'pointer' }}>Edit</button>
          {STATUS_NEXT[c.status]?.map(ns=>(
            <button key={ns} onClick={()=>onStatusChange(c,ns)}
              style={{ background:STATUS_COLORS[ns]?.bg||'#f0f4f8', color:STATUS_COLORS[ns]?.color||'#546e7a',
                border:`1px solid ${STATUS_COLORS[ns]?.border||'#dde3ec'}`, borderRadius:6, padding:'3px 8px', fontSize:10, cursor:'pointer' }}>
              → {ns}
            </button>
          ))}
        </div>
      </td>
    </tr>
  )
}

// ── Earned Tab (agency commissions from suppliers) ────────────────
function EarnedTab({ entityId, employees, rateCards, onRefresh }) {
  const now = new Date()
  const [rows,     setRows]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [modal,    setModal]    = useState(null)  // null | 'new' | {row}
  const [filterY,  setFilterY]  = useState(now.getFullYear())
  const [filterM,  setFilterM]  = useState(0)  // 0 = all
  const [filterT,  setFilterT]  = useState('')
  const [filterS,  setFilterS]  = useState('')
  const [search,   setSearch]   = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('commissions').select('*')
      .eq('entity_id', entityId)
      .eq('direction', 'RECEIVED')
      .eq('period_year', filterY)
      .order('created_at', { ascending:false })
    if (filterM) q = q.eq('period_month', filterM)
    if (filterT)  q = q.eq('commission_type', filterT)
    if (filterS)  q = q.eq('status', filterS)
    const { data } = await q
    setRows(data||[])
    setLoading(false)
  }, [entityId, filterY, filterM, filterT, filterS])

  useEffect(() => { load() }, [load])

  async function handleStatusChange(c, ns) {
    const upd = { status: ns }
    if (ns==='RECEIVED') upd.settlement_date = today()
    await supabase.from('commissions').update(upd).eq('id',c.id)
    load()
  }

  const visible = rows.filter(r => !search ||
    (r.ticket_number||'').toLowerCase().includes(search.toLowerCase()) ||
    (r.booking_ref  ||'').toLowerCase().includes(search.toLowerCase()) ||
    (r.pax_name     ||'').toLowerCase().includes(search.toLowerCase()) ||
    (r.supplier_name||'').toLowerCase().includes(search.toLowerCase()) ||
    (r.supplier_code||'').toLowerCase().includes(search.toLowerCase())
  )

  function csvExport() {
    const cols = ['Period','Type','Supplier','Ticket','Booking Ref','Pax','Route','Booking Amt','Rate%','Commission SAR','Status','Settlement Date']
    const rows2 = visible.map(c=>[
      `${MONTHS[c.period_month-1]} ${c.period_year}`,
      c.commission_type, c.supplier_name||c.supplier_code||'',
      c.ticket_number||'', c.booking_ref||'', c.pax_name||'', c.route||'',
      c.booking_amount, c.commission_rate, c.commission_sar||c.commission_amount,
      c.status, c.settlement_date||''
    ])
    const csv = [cols,...rows2].map(r=>r.join(',')).join('\n')
    const a=document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv)
    a.download=`commissions_earned_${filterY}.csv`; a.click()
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div style={{ minWidth:80 }}>
          <label style={S.label}>Year</label>
          <input type="number" style={{ ...S.input, width:90 }} value={filterY} onChange={e=>setFilterY(+e.target.value)} />
        </div>
        <div style={{ minWidth:80 }}>
          <label style={S.label}>Month</label>
          <select style={{ ...S.input, width:110 }} value={filterM} onChange={e=>setFilterM(+e.target.value)}>
            <option value={0}>All Months</option>
            {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div style={{ minWidth:100 }}>
          <label style={S.label}>Type</label>
          <select style={{ ...S.input, width:130 }} value={filterT} onChange={e=>setFilterT(e.target.value)}>
            <option value="">All Types</option>
            {COMM_TYPES.filter(t=>t!=='STAFF').map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={{ minWidth:100 }}>
          <label style={S.label}>Status</label>
          <select style={{ ...S.input, width:140 }} value={filterS} onChange={e=>setFilterS(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ flex:1, minWidth:160 }}>
          <label style={S.label}>Search</label>
          <input style={S.input} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Ticket, booking, pax, supplier…" />
        </div>
        <button onClick={()=>setModal('new')} style={S.btn()}>+ Add Commission</button>
        <button onClick={csvExport} style={{ ...S.btn('#546e7a') }}>⬇ CSV</button>
      </div>

      {/* Summary bar */}
      <div style={{ ...S.card, display:'flex', gap:20, flexWrap:'wrap', padding:'12px 20px' }}>
        {['PENDING','CONFIRMED','RECEIVED','REVERSED'].map(s=>{
          const grp = visible.filter(r=>r.status===s)
          const tot = grp.reduce((sum,r)=>sum+(+r.commission_sar||+r.commission_amount||0),0)
          const sc  = STATUS_COLORS[s]||{}
          return <div key={s} style={{ textAlign:'center' }}>
            <div style={{ fontSize:14, fontWeight:800, color:sc.color }}>{fmt(tot)}</div>
            <div style={{ fontSize:10, color:'#6b7c93' }}>{s} ({grp.length})</div>
          </div>
        })}
        <div style={{ marginLeft:'auto', textAlign:'right' }}>
          <div style={{ fontWeight:800, fontSize:16, color:'#1565C0' }}>
            {fmt(visible.reduce((s,r)=>s+(+r.commission_sar||+r.commission_amount||0),0))} SAR
          </div>
          <div style={{ fontSize:10, color:'#6b7c93' }}>Total ({visible.length} records)</div>
        </div>
      </div>

      {/* Table */}
      <div style={{ background:'#fff', borderRadius:14, overflow:'auto', boxShadow:'0 2px 10px rgba(0,0,0,0.07)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#f0f4f8' }}>
              {['Period','Type','Details','Booking Amt','Commission SAR','Status','Actions'].map(h=>(
                <th key={h} style={{ padding:'10px 8px', textAlign:['Booking Amt','Commission SAR'].includes(h)?'right':'left', fontSize:11, fontWeight:700, color:'#6b7c93', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding:40, textAlign:'center', color:'#6b7c93' }}>Loading…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={7} style={{ padding:40, textAlign:'center', color:'#6b7c93' }}>No commissions found</td></tr>
            ) : visible.map(c=>(
              <CommRow key={c.id} c={c} onEdit={r=>setModal(r)} onStatusChange={handleStatusChange} />
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <CommissionModal
          entityId={entityId}
          direction="RECEIVED"
          item={modal==='new' ? null : modal}
          employees={employees}
          rateCards={rateCards}
          onClose={()=>setModal(null)}
          onSaved={()=>{ setModal(null); load(); onRefresh() }}
        />
      )}
    </div>
  )
}

// ── Agent Tab (staff incentive commissions) ───────────────────────
function AgentTab({ entityId, employees, rateCards, onRefresh }) {
  const now = new Date()
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)
  const [filterY, setFilterY] = useState(now.getFullYear())
  const [filterM, setFilterM] = useState(0)
  const [filterA, setFilterA] = useState('')
  const [filterS, setFilterS] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('commissions').select('*')
      .eq('entity_id', entityId)
      .eq('direction', 'PAID')
      .eq('period_year', filterY)
      .order('created_at', { ascending:false })
    if (filterM) q = q.eq('period_month', filterM)
    if (filterA)  q = q.eq('agent_id', filterA)
    if (filterS)  q = q.eq('status', filterS)
    const { data } = await q
    setRows(data||[])
    setLoading(false)
  }, [entityId, filterY, filterM, filterA, filterS])

  useEffect(() => { load() }, [load])

  async function handleStatusChange(c, ns) {
    await supabase.from('commissions').update({ status:ns }).eq('id',c.id)
    load()
  }

  // Agent summary
  const byAgent = {}
  for (const r of rows) {
    const k = r.agent_name||r.agent_id||'Unknown'
    if (!byAgent[k]) byAgent[k] = { name:k, total:0, paid:0, pending:0, count:0 }
    byAgent[k].total   += +r.commission_sar||+r.commission_amount||0
    byAgent[k].pending += r.status==='PENDING' ? (+r.commission_sar||+r.commission_amount||0) : 0
    byAgent[k].paid    += r.status==='PAID'    ? (+r.commission_sar||+r.commission_amount||0) : 0
    byAgent[k].count++
  }
  const agentSummary = Object.values(byAgent).sort((a,b)=>b.total-a.total)

  return (
    <div>
      {/* Agent leaderboard */}
      {agentSummary.length > 0 && (
        <div style={{ ...S.card }}>
          <div style={{ fontWeight:800, fontSize:12, color:'#6b7c93', letterSpacing:1, marginBottom:10 }}>🏆 AGENT LEADERBOARD ({filterY})</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:8 }}>
            {agentSummary.map((a,i)=>(
              <div key={a.name} style={{ background:'#f5f7fa', borderRadius:10, padding:'10px 12px', borderLeft:`4px solid ${i===0?'#f57f17':i===1?'#90a4ae':'#cfd8dc'}` }}>
                <div style={{ fontWeight:700, fontSize:12 }}>{i+1}. {a.name}</div>
                <div style={{ fontWeight:800, fontSize:15, color:'#1565C0' }}>{fmt(a.total)} SAR</div>
                <div style={{ fontSize:10, color:'#2e7d32' }}>Paid: {fmt(a.paid)}</div>
                <div style={{ fontSize:10, color:'#f57f17' }}>Pending: {fmt(a.pending)}</div>
                <div style={{ fontSize:10, color:'#6b7c93' }}>{a.count} records</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div>
          <label style={S.label}>Year</label>
          <input type="number" style={{ ...S.input, width:90 }} value={filterY} onChange={e=>setFilterY(+e.target.value)} />
        </div>
        <div>
          <label style={S.label}>Month</label>
          <select style={{ ...S.input, width:110 }} value={filterM} onChange={e=>setFilterM(+e.target.value)}>
            <option value={0}>All Months</option>
            {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Agent</label>
          <select style={{ ...S.input, width:160 }} value={filterA} onChange={e=>setFilterA(e.target.value)}>
            <option value="">All Agents</option>
            {employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Status</label>
          <select style={{ ...S.input, width:140 }} value={filterS} onChange={e=>setFilterS(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <button onClick={()=>setModal('new')} style={S.btn('#795548')}>+ Add Agent Commission</button>
      </div>

      <div style={{ background:'#fff', borderRadius:14, overflow:'auto', boxShadow:'0 2px 10px rgba(0,0,0,0.07)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#f0f4f8' }}>
              {['Period','Type','Agent / Details','Booking Amt','Commission SAR','Status','Actions'].map(h=>(
                <th key={h} style={{ padding:'10px 8px', textAlign:['Booking Amt','Commission SAR'].includes(h)?'right':'left', fontSize:11, fontWeight:700, color:'#6b7c93' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ padding:40, textAlign:'center', color:'#6b7c93' }}>Loading…</td></tr>
            ) : rows.length===0 ? (
              <tr><td colSpan={7} style={{ padding:40, textAlign:'center', color:'#6b7c93' }}>No agent commissions found</td></tr>
            ) : rows.map(c=>(
              <CommRow key={c.id} c={c} onEdit={r=>setModal(r)} onStatusChange={handleStatusChange} />
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <CommissionModal
          entityId={entityId}
          direction="PAID"
          item={modal==='new' ? null : modal}
          employees={employees}
          rateCards={rateCards}
          onClose={()=>setModal(null)}
          onSaved={()=>{ setModal(null); load(); onRefresh() }}
        />
      )}
    </div>
  )
}

// ── Settlement Tab ────────────────────────────────────────────────
function SettlementTab({ entityId }) {
  const { user } = useAuth()
  const now = new Date()
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [selected,setSelected]= useState(new Set())
  const [postDate,setPostDate]= useState(today())
  const [bankAcct,setBankAcct]= useState('')
  const [posting, setPosting] = useState(false)
  const [results, setResults] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('commissions').select('*')
      .eq('entity_id', entityId)
      .eq('direction', 'RECEIVED')
      .in('status', ['PENDING','CONFIRMED'])
      .eq('gl_posted', false)
      .order('period_year').order('period_month')
    setRows(data||[])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  function toggleAll(checked) {
    if (checked) setSelected(new Set(rows.map(r=>r.id)))
    else setSelected(new Set())
  }

  async function postSelected() {
    if (selected.size===0) return
    if (!bankAcct) { alert('Please enter a GL bank/BSP account code'); return }
    setPosting(true); setResults([])
    const toPost = rows.filter(r=>selected.has(r.id))
    const res = []

    for (const c of toPost) {
      const incomeAcct = c.gl_account_income
      if (!incomeAcct) {
        res.push({ id:c.id, ok:false, msg:'No income account set on this commission' })
        continue
      }

      // Post to GL: DR Bank, CR Commission Income
      const vNum = `COM-${postDate.slice(0,7)}-${Math.floor(Math.random()*9000)+1000}`
      const lines = [
        {
          entity_id: entityId, entry_date: postDate, voucher_type:'COM',
          voucher_number: vNum, account_code: bankAcct, account_name:'Commission Bank/BSP',
          debit: +c.commission_sar||+c.commission_amount||0, credit:0,
          description:`Commission: ${c.supplier_name||c.commission_type} ${c.ticket_number||c.booking_ref||''}`.trim(),
        },
        {
          entity_id: entityId, entry_date: postDate, voucher_type:'COM',
          voucher_number: vNum, account_code: incomeAcct, account_name:'Commission Income',
          debit: 0, credit: +c.commission_sar||+c.commission_amount||0,
          description:`Commission: ${c.supplier_name||c.commission_type} ${c.ticket_number||c.booking_ref||''}`.trim(),
        },
      ]

      const { error: glErr } = await supabase.from('ledger_entries').insert(lines)
      if (glErr) { res.push({ id:c.id, ok:false, msg:glErr.message }); continue }

      await supabase.from('commissions').update({
        status:'RECEIVED', gl_posted:true, gl_entry_ref:vNum,
        settlement_date:postDate, settlement_ref:vNum,
      }).eq('id',c.id)

      res.push({ id:c.id, ok:true, msg:`GL ${vNum}`, amount:c.commission_sar||c.commission_amount })
    }

    setResults(res)
    setPosting(false)
    setSelected(new Set())
    load()
  }

  const selectedAmt = rows.filter(r=>selected.has(r.id))
    .reduce((s,r)=>s+(+r.commission_sar||+r.commission_amount||0),0)

  return (
    <div>
      <div style={{ ...S.card }}>
        <div style={{ fontWeight:800, fontSize:13, color:'#1a2e3d', marginBottom:12 }}>
          Batch GL Settlement — Confirm & Post to GL
        </div>
        <div style={{ display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap', marginBottom:12 }}>
          <div>
            <label style={S.label}>Post Date</label>
            <input type="date" style={{ ...S.input, width:160 }} value={postDate} onChange={e=>setPostDate(e.target.value)} />
          </div>
          <div style={{ flex:1, minWidth:200 }}>
            <label style={S.label}>GL Bank / BSP Account Code *</label>
            <input style={S.input} value={bankAcct} onChange={e=>setBankAcct(e.target.value)} placeholder="e.g. 1020 (BSP Clearing)" />
          </div>
          <button onClick={postSelected} disabled={posting||selected.size===0}
            style={{ ...S.btn('#2e7d32'), opacity:(posting||selected.size===0)?0.5:1 }}>
            {posting?'Posting…':`Post ${selected.size} selected (${fmt(selectedAmt)} SAR)`}
          </button>
        </div>

        {results.length>0 && (
          <div style={{ background:'#f0f4f8', borderRadius:10, padding:12, marginBottom:12 }}>
            {results.map(r=>(
              <div key={r.id} style={{ fontSize:12, color:r.ok?'#2e7d32':'#c62828', marginBottom:4 }}>
                {r.ok?'✅':'❌'} {r.msg}{r.amount ? ` — ${fmt(r.amount)} SAR` : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ background:'#fff', borderRadius:14, overflow:'auto', boxShadow:'0 2px 10px rgba(0,0,0,0.07)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#f0f4f8' }}>
              <th style={{ padding:'10px 8px' }}>
                <input type="checkbox" onChange={e=>toggleAll(e.target.checked)}
                  checked={selected.size===rows.length && rows.length>0} />
              </th>
              {['Period','Type','Supplier','Ticket / Ref','Commission SAR','Status','Income Acct'].map(h=>(
                <th key={h} style={{ padding:'10px 8px', textAlign:h==='Commission SAR'?'right':'left', fontSize:11, fontWeight:700, color:'#6b7c93' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding:40, textAlign:'center', color:'#6b7c93' }}>Loading…</td></tr>
            ) : rows.length===0 ? (
              <tr><td colSpan={8} style={{ padding:40, textAlign:'center', color:'#6b7c93' }}>
                No commissions pending GL posting 🎉
              </td></tr>
            ) : rows.map(c=>(
              <tr key={c.id} style={{ borderBottom:'1px solid #f0f4f8', background:selected.has(c.id)?'#e3f2fd':'#fff' }}>
                <td style={{ padding:'10px 8px' }}>
                  <input type="checkbox" checked={selected.has(c.id)}
                    onChange={e=>{ const s=new Set(selected); e.target.checked?s.add(c.id):s.delete(c.id); setSelected(s) }} />
                </td>
                <td style={{ padding:'10px 8px', fontSize:12 }}>{MONTHS[c.period_month-1]} {c.period_year}</td>
                <td style={{ padding:'10px 8px', fontSize:12 }}>{c.commission_type}</td>
                <td style={{ padding:'10px 8px', fontSize:12 }}>{c.supplier_name||c.supplier_code||'—'}</td>
                <td style={{ padding:'10px 8px', fontSize:12 }}>{c.ticket_number||c.booking_ref||'—'}</td>
                <td style={{ padding:'10px 8px', fontWeight:800, fontSize:13, color:'#1565C0', textAlign:'right' }}>{fmt(c.commission_sar||c.commission_amount)}</td>
                <td style={{ padding:'10px 8px', fontSize:11 }}>
                  <span style={{ ...STATUS_COLORS[c.status], border:`1.5px solid ${STATUS_COLORS[c.status]?.border}`, borderRadius:20, padding:'2px 8px', fontWeight:700 }}>{c.status}</span>
                </td>
                <td style={{ padding:'10px 8px', fontSize:11, color:'#6b7c93' }}>
                  {c.gl_account_income||<span style={{ color:'#c62828' }}>⚠ Not set</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Rate Cards Tab ────────────────────────────────────────────────
function RateCardsTab({ entityId, employees }) {
  const [rates,  setRates]  = useState([])
  const [loading,setLoading]= useState(true)
  const [form,   setForm]   = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('commission_rates').select('*')
      .eq('entity_id', entityId).order('commission_type').order('supplier_code')
    setRates(data||[])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  function newForm() {
    setForm({ commission_type:'AIRLINE', supplier_code:'', supplier_name:'', agent_id:'',
      rate_type:'PERCENTAGE', rate_value:'', min_commission:'', max_commission:'',
      currency:'SAR', effective_from:today(), effective_to:'', is_active:true, notes:'' })
  }

  async function save() {
    setSaving(true)
    const row = { ...form, entity_id:entityId, rate_value:+form.rate_value||0,
      min_commission: form.min_commission||null, max_commission: form.max_commission||null,
      agent_id: form.agent_id||null, effective_to: form.effective_to||null }
    const { error } = form.id
      ? await supabase.from('commission_rates').update(row).eq('id',form.id)
      : await supabase.from('commission_rates').insert(row)
    setSaving(false)
    if (!error) { setForm(null); load() }
  }

  async function toggle(r) {
    await supabase.from('commission_rates').update({ is_active:!r.is_active }).eq('id',r.id)
    load()
  }

  const F = ({ label, children, col }) => (
    <div style={{ marginBottom:8, gridColumn:col }}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  )

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:10 }}>
        <button onClick={newForm} style={S.btn()}>+ New Rate Card</button>
      </div>

      {form && (
        <div style={{ ...S.card, border:'2px solid #1565C0' }}>
          <div style={{ fontWeight:800, fontSize:13, color:'#1a2e3d', marginBottom:14 }}>{form.id?'Edit':'New'} Rate Card</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
            <F label="Type"><select value={form.commission_type} onChange={e=>setForm(f=>({...f,commission_type:e.target.value}))} style={S.input}>{COMM_TYPES.map(t=><option key={t}>{t}</option>)}</select></F>
            <F label="Supplier Code"><input style={S.input} value={form.supplier_code} onChange={e=>setForm(f=>({...f,supplier_code:e.target.value.toUpperCase()}))} placeholder="e.g. SV"/></F>
            <F label="Supplier Name"><input style={S.input} value={form.supplier_name} onChange={e=>setForm(f=>({...f,supplier_name:e.target.value}))} placeholder="Saudi Airlines"/></F>
            <F label="For Agent (optional)">
              <select value={form.agent_id} onChange={e=>setForm(f=>({...f,agent_id:e.target.value}))} style={S.input}>
                <option value="">Agency-wide</option>
                {employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </F>
            <F label="Rate Type"><select value={form.rate_type} onChange={e=>setForm(f=>({...f,rate_type:e.target.value}))} style={S.input}><option>PERCENTAGE</option><option>FIXED_PER_TICKET</option><option>FIXED_PER_PAX</option></select></F>
            <F label={form.rate_type==='PERCENTAGE'?'Rate %':'Fixed Amount (SAR)'}><input type="number" style={S.input} value={form.rate_value} onChange={e=>setForm(f=>({...f,rate_value:e.target.value}))} step="0.01"/></F>
            <F label="Min Commission (SAR)"><input type="number" style={S.input} value={form.min_commission} onChange={e=>setForm(f=>({...f,min_commission:e.target.value}))} placeholder="Floor"/></F>
            <F label="Max Commission (SAR)"><input type="number" style={S.input} value={form.max_commission} onChange={e=>setForm(f=>({...f,max_commission:e.target.value}))} placeholder="Cap"/></F>
            <F label="Effective From"><input type="date" style={S.input} value={form.effective_from} onChange={e=>setForm(f=>({...f,effective_from:e.target.value}))} /></F>
            <F label="Effective To"><input type="date" style={S.input} value={form.effective_to} onChange={e=>setForm(f=>({...f,effective_to:e.target.value}))} /></F>
          </div>
          <div style={{ display:'flex', gap:8, marginTop:8, justifyContent:'flex-end' }}>
            <button onClick={()=>setForm(null)} style={{ background:'#f0f4f8', color:'#546e7a', border:'none', borderRadius:8, padding:'8px 14px', fontWeight:700, cursor:'pointer' }}>Cancel</button>
            <button onClick={save} disabled={saving} style={S.btn()}>{saving?'Saving…':'Save Rate Card'}</button>
          </div>
        </div>
      )}

      <div style={{ background:'#fff', borderRadius:14, overflow:'auto', boxShadow:'0 2px 10px rgba(0,0,0,0.07)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#f0f4f8' }}>
              {['Type','Supplier','For Agent','Rate','Min/Max','Validity','Active',''].map(h=>(
                <th key={h} style={{ padding:'10px 8px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6b7c93' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ padding:40, textAlign:'center', color:'#6b7c93' }}>Loading…</td></tr>
            ) : rates.length===0 ? (
              <tr><td colSpan={8} style={{ padding:40, textAlign:'center', color:'#6b7c93' }}>No rate cards. Add one above.</td></tr>
            ) : rates.map(r=>(
              <tr key={r.id} style={{ borderBottom:'1px solid #f0f4f8', opacity:r.is_active?1:0.5 }}>
                <td style={{ padding:'10px 8px' }}>
                  <span style={{ background:TYPE_COLORS[r.commission_type]+'22', color:TYPE_COLORS[r.commission_type], borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:700 }}>{r.commission_type}</span>
                </td>
                <td style={{ padding:'10px 8px', fontSize:12 }}><strong>{r.supplier_code||'—'}</strong><br/><span style={{ color:'#6b7c93', fontSize:11 }}>{r.supplier_name}</span></td>
                <td style={{ padding:'10px 8px', fontSize:11, color:'#6b7c93' }}>{r.agent_name||'All agents'}</td>
                <td style={{ padding:'10px 8px', fontWeight:800, fontSize:14, color:'#1565C0' }}>
                  {r.rate_value}{r.rate_type==='PERCENTAGE'?'%':' SAR'}
                  <div style={{ fontSize:9, color:'#6b7c93', fontWeight:400 }}>{r.rate_type}</div>
                </td>
                <td style={{ padding:'10px 8px', fontSize:11, color:'#6b7c93' }}>
                  {r.min_commission ? `min ${fmt(r.min_commission)}` : ''}{r.min_commission&&r.max_commission?' / ':''}
                  {r.max_commission ? `max ${fmt(r.max_commission)}` : ''}
                  {!r.min_commission&&!r.max_commission ? '—' : ''}
                </td>
                <td style={{ padding:'10px 8px', fontSize:11, color:'#6b7c93' }}>
                  {r.effective_from} {r.effective_to ? `→ ${r.effective_to}` : '→ ongoing'}
                </td>
                <td style={{ padding:'10px 8px' }}>
                  <button onClick={()=>toggle(r)} style={{ background:r.is_active?'#e8f5e9':'#f5f5f5', color:r.is_active?'#2e7d32':'#757575', border:'none', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                    {r.is_active?'Active':'Paused'}
                  </button>
                </td>
                <td style={{ padding:'10px 8px' }}>
                  <button onClick={()=>setForm(r)} style={{ background:'transparent', color:'#1565C0', border:'1px solid #1565C0', borderRadius:6, padding:'3px 8px', fontSize:10, cursor:'pointer' }}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Reports Tab ───────────────────────────────────────────────────
function ReportsTab({ entityId }) {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [rows,  setRows]  = useState([])
  const [loading,setLoad] = useState(true)

  useEffect(() => {
    async function load() {
      setLoad(true)
      const { data } = await supabase.from('commissions').select('*')
        .eq('entity_id', entityId).eq('period_year', year)
        .neq('status','REVERSED')
      setRows(data||[])
      setLoad(false)
    }
    load()
  }, [entityId, year])

  // Monthly totals
  const monthly = Array.from({length:12},(_,i)=>i+1).map(m=>{
    const mRows = rows.filter(r=>r.period_month===m)
    const earned = mRows.filter(r=>r.direction==='RECEIVED').reduce((s,r)=>s+(+r.commission_sar||+r.commission_amount||0),0)
    const paid   = mRows.filter(r=>r.direction==='PAID').reduce((s,r)=>s+(+r.commission_sar||+r.commission_amount||0),0)
    return { month:m, earned, paid, net:earned-paid }
  })

  // By type
  const byType = {}
  for (const r of rows.filter(x=>x.direction==='RECEIVED')) {
    const k=r.commission_type
    if(!byType[k]) byType[k]={type:k,total:0,count:0}
    byType[k].total += +r.commission_sar||+r.commission_amount||0
    byType[k].count++
  }
  const typeRows = Object.values(byType).sort((a,b)=>b.total-a.total)
  const maxType  = Math.max(...typeRows.map(r=>r.total),1)

  // By supplier
  const bySupp = {}
  for (const r of rows.filter(x=>x.direction==='RECEIVED')) {
    const k=r.supplier_name||r.supplier_code||'Unknown'
    if(!bySupp[k]) bySupp[k]={name:k,total:0,count:0}
    bySupp[k].total += +r.commission_sar||+r.commission_amount||0
    bySupp[k].count++
  }
  const suppRows = Object.values(bySupp).sort((a,b)=>b.total-a.total).slice(0,10)
  const maxSupp  = Math.max(...suppRows.map(r=>r.total),1)

  const totalEarned = rows.filter(r=>r.direction==='RECEIVED').reduce((s,r)=>s+(+r.commission_sar||+r.commission_amount||0),0)
  const totalPaid   = rows.filter(r=>r.direction==='PAID').reduce((s,r)=>s+(+r.commission_sar||+r.commission_amount||0),0)

  function csvExport() {
    const cols=['Month','Earned (SAR)','Staff Paid (SAR)','Net (SAR)']
    const csvRows=monthly.map(m=>[MONTHS[m.month-1],m.earned.toFixed(2),m.paid.toFixed(2),m.net.toFixed(2)])
    const csv=[cols,...csvRows].map(r=>r.join(',')).join('\n')
    const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv)
    a.download=`commission_report_${year}.csv`;a.click()
  }

  const maxBar = Math.max(...monthly.map(m=>m.earned),1)

  return (
    <div>
      <div style={{ ...S.card, display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div>
          <label style={S.label}>Year</label>
          <input type="number" style={{ ...S.input, width:100 }} value={year} onChange={e=>setYear(+e.target.value)} />
        </div>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontWeight:800, fontSize:20, color:'#1565C0' }}>{fmtN(totalEarned)}</div>
            <div style={{ fontSize:10, color:'#6b7c93' }}>Total Earned (SAR)</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontWeight:800, fontSize:20, color:'#795548' }}>{fmtN(totalPaid)}</div>
            <div style={{ fontSize:10, color:'#6b7c93' }}>Staff Paid (SAR)</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontWeight:800, fontSize:20, color:'#2e7d32' }}>{fmtN(totalEarned-totalPaid)}</div>
            <div style={{ fontSize:10, color:'#6b7c93' }}>Net Margin (SAR)</div>
          </div>
        </div>
        <button onClick={csvExport} style={{ ...S.btn('#546e7a'), marginLeft:'auto' }}>⬇ CSV</button>
      </div>

      {/* Monthly bar chart */}
      <div style={{ ...S.card }}>
        <div style={{ fontWeight:800, fontSize:12, color:'#6b7c93', letterSpacing:1, marginBottom:12 }}>MONTHLY COMMISSION EARNED</div>
        <div style={{ display:'flex', gap:4, alignItems:'flex-end', height:120 }}>
          {monthly.map(m=>(
            <div key={m.month} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:2 }}>
              <div style={{ fontSize:9, color:'#1565C0', fontWeight:700 }}>{m.earned>0?fmtN(m.earned):''}</div>
              <div style={{ width:'100%', background:'#1565C0', borderRadius:'4px 4px 0 0',
                height:`${Math.max(2,(m.earned/maxBar)*90)}px`, transition:'height 0.4s' }} />
              {m.paid > 0 && <div style={{ width:'100%', background:'#795548', height:`${Math.max(1,(m.paid/maxBar)*20)}px` }} />}
              <div style={{ fontSize:9, color:'#6b7c93' }}>{MONTHS[m.month-1]}</div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:12, marginTop:8, fontSize:10 }}>
          <span><span style={{ display:'inline-block', width:10, height:10, background:'#1565C0', borderRadius:2, marginRight:4 }}/>Earned</span>
          <span><span style={{ display:'inline-block', width:10, height:10, background:'#795548', borderRadius:2, marginRight:4 }}/>Staff paid</span>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        {/* By Type */}
        <div style={{ ...S.card }}>
          <div style={{ fontWeight:800, fontSize:12, color:'#6b7c93', letterSpacing:1, marginBottom:10 }}>BY COMMISSION TYPE</div>
          {typeRows.map(t=>(
            <div key={t.type} style={{ marginBottom:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                <span style={{ fontWeight:700, color:TYPE_COLORS[t.type]||'#546e7a' }}>{t.type}</span>
                <span style={{ fontWeight:800 }}>{fmt(t.total)} SAR <span style={{ color:'#6b7c93', fontWeight:400, fontSize:10 }}>({t.count})</span></span>
              </div>
              <div style={{ height:8, borderRadius:4, background:'#f0f4f8', overflow:'hidden' }}>
                <div style={{ height:'100%', background:TYPE_COLORS[t.type]||'#546e7a', width:`${(t.total/maxType)*100}%`, transition:'width 0.4s' }} />
              </div>
            </div>
          ))}
        </div>

        {/* By Supplier */}
        <div style={{ ...S.card }}>
          <div style={{ fontWeight:800, fontSize:12, color:'#6b7c93', letterSpacing:1, marginBottom:10 }}>TOP SUPPLIERS</div>
          {suppRows.map(s=>(
            <div key={s.name} style={{ marginBottom:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                <span style={{ fontWeight:700 }}>{s.name}</span>
                <span style={{ fontWeight:800 }}>{fmt(s.total)} SAR <span style={{ color:'#6b7c93', fontWeight:400, fontSize:10 }}>({s.count})</span></span>
              </div>
              <div style={{ height:8, borderRadius:4, background:'#f0f4f8', overflow:'hidden' }}>
                <div style={{ height:'100%', background:'#1565C0', width:`${(s.total/maxSupp)*100}%`, transition:'width 0.4s' }} />
              </div>
            </div>
          ))}
          {suppRows.length===0 && <div style={{ color:'#6b7c93', fontSize:12 }}>No data</div>}
        </div>
      </div>

      {/* Monthly table */}
      <div style={{ background:'#fff', borderRadius:14, overflow:'auto', boxShadow:'0 2px 10px rgba(0,0,0,0.07)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#f0f4f8' }}>
              {['Month','Earned (SAR)','Staff Paid (SAR)','Net (SAR)','Records'].map(h=>(
                <th key={h} style={{ padding:'10px 12px', textAlign:h==='Month'?'left':'right', fontSize:11, fontWeight:700, color:'#6b7c93' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {monthly.map(m=>(
              <tr key={m.month} style={{ borderBottom:'1px solid #f0f4f8', fontWeight:m.earned>0?700:400, opacity:m.earned>0?1:0.4 }}>
                <td style={{ padding:'10px 12px', fontSize:13 }}>{MONTHS[m.month-1]} {year}</td>
                <td style={{ padding:'10px 12px', textAlign:'right', fontSize:13, color:'#1565C0' }}>{m.earned>0?fmt(m.earned):'—'}</td>
                <td style={{ padding:'10px 12px', textAlign:'right', fontSize:13, color:'#795548' }}>{m.paid>0?fmt(m.paid):'—'}</td>
                <td style={{ padding:'10px 12px', textAlign:'right', fontSize:13, color:m.net>=0?'#2e7d32':'#c62828' }}>
                  {m.earned>0||m.paid>0 ? fmt(m.net) : '—'}
                </td>
                <td style={{ padding:'10px 12px', textAlign:'right', fontSize:12, color:'#6b7c93' }}>
                  {rows.filter(r=>r.period_month===m.month).length||'—'}
                </td>
              </tr>
            ))}
            <tr style={{ background:'#f0f4f8', fontWeight:800 }}>
              <td style={{ padding:'10px 12px' }}>TOTAL</td>
              <td style={{ padding:'10px 12px', textAlign:'right', color:'#1565C0' }}>{fmt(totalEarned)}</td>
              <td style={{ padding:'10px 12px', textAlign:'right', color:'#795548' }}>{fmt(totalPaid)}</td>
              <td style={{ padding:'10px 12px', textAlign:'right', color:'#2e7d32' }}>{fmt(totalEarned-totalPaid)}</td>
              <td style={{ padding:'10px 12px', textAlign:'right', color:'#6b7c93' }}>{rows.length}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════
export default function CommissionTracker({ entityId }) {
  const [tab,       setTab]       = useState(0)
  const [employees, setEmployees] = useState([])
  const [rateCards, setRateCards] = useState([])
  const [allComm,   setAllComm]   = useState([])
  const [kpiKey,    setKpiKey]    = useState(0)

  useEffect(() => {
    if (!entityId) return
    // Load employees for agent dropdowns
    supabase.from('employees').select('id, full_name, department').eq('entity_id', entityId).eq('is_active', true)
      .then(({ data }) => setEmployees(data||[]))
    // Load rate cards
    supabase.from('commission_rates').select('*').eq('entity_id', entityId).eq('is_active', true)
      .then(({ data }) => setRateCards(data||[]))
    // Load all commissions for KPI strip (current year)
    const y = new Date().getFullYear()
    supabase.from('commissions').select('direction,status,commission_amount,commission_sar').eq('entity_id', entityId).eq('period_year', y)
      .then(({ data }) => setAllComm(data||[]))
  }, [entityId, kpiKey])

  const TABS = [
    { label:'💰 Earned',      desc:'Agency commissions from airlines & suppliers' },
    { label:'👤 Agent',        desc:'Staff incentive commissions' },
    { label:'✅ Settlement',   desc:'Batch GL post received commissions' },
    { label:'📋 Rate Cards',   desc:'Manage commission rate rules' },
    { label:'📊 Reports',      desc:'Monthly & supplier breakdowns' },
  ]

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:16 }}>
        Agency commissions from airlines & suppliers · Staff agent incentives · GL settlement
      </div>

      <KPIStrip commissions={allComm} />

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, background:'#f0f4f8', borderRadius:12, padding:4, marginBottom:14, flexWrap:'wrap' }}>
        {TABS.map((t,i)=>(
          <button key={i} style={S.tab(tab===i,'#1565C0')} onClick={()=>setTab(i)}>{t.label}</button>
        ))}
      </div>

      {tab===0 && <EarnedTab  entityId={entityId} employees={employees} rateCards={rateCards} onRefresh={()=>setKpiKey(k=>k+1)} />}
      {tab===1 && <AgentTab   entityId={entityId} employees={employees} rateCards={rateCards} onRefresh={()=>setKpiKey(k=>k+1)} />}
      {tab===2 && <SettlementTab entityId={entityId} />}
      {tab===3 && <RateCardsTab  entityId={entityId} employees={employees} />}
      {tab===4 && <ReportsTab    entityId={entityId} />}
    </div>
  )
}
