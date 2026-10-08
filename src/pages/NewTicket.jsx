import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Schema columns (tickets table):
// ticket_number, ticket_status, ticket_type(CASH|CREDIT), value_type(INT|DOM)
// passenger_name, airline_id, airline_account_no, routing, class(Y|C|F|W)
// ticket_value(base fare), tax_amount, net_to_carrier, selling_fare_cash
// selling_fare_credit, discount_percent, earned_commission, comm1_percent
// vat_amount, vat_rate, customer_id, invoice_number, ticket_date, remarks

// Schema columns (customers table):
// entity_id(required), account_no, name_en, name_ar, payment_type, credit_limit

// Schema columns (airlines table):
// airline_code, airline_name, comm_tier_1(First), comm_tier_2(Business)
// comm_tier_3(Economy), comm_tier_4(Special)

const CLASSES = [
  { code:'F', label:'First Class',    tier:'comm_tier_1' },
  { code:'C', label:'Business',       tier:'comm_tier_2' },
  { code:'Y', label:'Economy',        tier:'comm_tier_3' },
  { code:'W', label:'Special / Net',  tier:'comm_tier_4' },
]

const S = {
  inp: { width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #dde3ec', fontSize:14, outline:'none', background:'#fff', boxSizing:'border-box', color:'#1a2e3d', fontFamily:'inherit' },
  lbl: { display:'block', fontSize:12, color:'#6b7c93', marginBottom:4, fontWeight:600 },
  grp: { marginBottom:14 },
  sel: { width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #dde3ec', fontSize:14, outline:'none', background:'#fff', boxSizing:'border-box', color:'#1a2e3d', cursor:'pointer', fontFamily:'inherit' },
}

// QuickAddCustomer — uses EXACT customers schema columns
function QuickAddCustomer({ searchText, entityId, onAdded, onCancel }) {
  const [accountNo,   setAccountNo]   = useState('')
  const [nameEn,      setNameEn]      = useState(searchText || '')
  const [nameAr,      setNameAr]      = useState('')
  const [phone,       setPhone]       = useState('')
  const [paymentType, setPaymentType] = useState('CREDIT')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  async function handleSave(e) {
    e.preventDefault(); setSaving(true); setError('')
    // entity_id is required NOT NULL in customers table
    let eid = entityId
    if (!eid) {
      const { data: ent } = await supabase.from('entities').select('id').eq('code','RAT').single()
      eid = ent?.id
    }
    const { data, error: err } = await supabase.from('customers')
      .insert({ entity_id: eid, account_no: accountNo, name_en: nameEn, name_ar: nameAr||null, phone: phone||null, payment_type: paymentType, credit_limit: 0 })
      .select().single()
    if (err) { setError(err.message); setSaving(false); return }
    onAdded(data)
    setSaving(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, padding:20 }}>
      <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:480, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding:'16px 20px', background:'linear-gradient(135deg,#0f1f2e,#1a3a4a)', borderRadius:'14px 14px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3 style={{ margin:0, color:'#fff', fontSize:15 }}>🏢 Quick Add Customer</h3>
          <button type="button" onClick={onCancel} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#fff', borderRadius:6, padding:'4px 12px', cursor:'pointer', fontSize:18 }}>✕</button>
        </div>
        {error && <div style={{ background:'#ffebee', color:'#c62828', padding:'8px 20px', fontSize:13 }}>⚠️ {error}</div>}
        <form onSubmit={handleSave} style={{ padding:'16px 20px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' }}>
            <div style={S.grp}>
              <label style={S.lbl}>Account No. *</label>
              <input style={S.inp} value={accountNo} onChange={e=>setAccountNo(e.target.value)} required placeholder="e.g. 0710500" />
            </div>
            <div style={S.grp}>
              <label style={S.lbl}>Payment Type</label>
              <select style={S.sel} value={paymentType} onChange={e=>setPaymentType(e.target.value)}>
                <option value="CREDIT">Credit</option>
                <option value="CASH">Cash</option>
              </select>
            </div>
            <div style={S.grp}>
              <label style={S.lbl}>Name (English) *</label>
              <input style={S.inp} value={nameEn} onChange={e=>setNameEn(e.target.value)} required placeholder="Company or person name" />
            </div>
            <div style={S.grp}>
              <label style={S.lbl}>الاسم (عربي)</label>
              <input style={{ ...S.inp, direction:'rtl' }} value={nameAr} onChange={e=>setNameAr(e.target.value)} placeholder="اختياري" />
            </div>
            <div style={{ ...S.grp, gridColumn:'1/-1' }}>
              <label style={S.lbl}>Phone</label>
              <input style={S.inp} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+966 5x xxx xxxx" />
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:4 }}>
            <button type="button" onClick={onCancel} style={{ padding:'8px 20px', borderRadius:8, border:'1px solid #dde3ec', background:'#fff', cursor:'pointer', fontSize:13, color:'#6b7c93' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding:'8px 22px', borderRadius:8, border:'none', background:saving?'#aaa':'linear-gradient(135deg,#0091ea,#00c853)', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700 }}>{saving?'Saving...':'💾 Save & Select'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function NewTicket({ onClose, onSaved, entityId, lang = 'en' }) {
  const [airlines,     setAirlines]     = useState([])
  const [customers,    setCustomers]    = useState([])
  const [custSearch,   setCustSearch]   = useState('')
  const [custOpen,     setCustOpen]     = useState(false)
  const [custSelected, setCustSelected] = useState(null)
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')
  const [success,      setSuccess]      = useState(false)

  // Ticket fields — matches tickets table exactly
  const [ticketNumber,  setTicketNumber]  = useState('')
  const [passengerName, setPassengerName] = useState('')
  const [airlineId,     setAirlineId]     = useState('')
  const [routing,       setRouting]       = useState('')
  const [cls,           setCls]           = useState('Y')
  const [valueType,     setValueType]     = useState('INT')
  const [ticketDate,    setTicketDate]    = useState(new Date().toISOString().split('T')[0])
  const [ticketType,    setTicketType]    = useState('CREDIT')
  const [invoiceNo,     setInvoiceNo]     = useState('')
  const [remarks,       setRemarks]       = useState('')
  const [baseFare,      setBaseFare]      = useState('')
  const [tax,           setTax]           = useState('')
  const [commPct,       setCommPct]       = useState('0')
  const [discPct,       setDiscPct]       = useState('0')

  const custRef = useRef(null)

  useEffect(() => {
    function handleClick(e) { if (custRef.current && !custRef.current.contains(e.target)) setCustOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  useEffect(() => {
    // airlines table: airline_code, airline_name, comm_tier_1/2/3/4
    supabase.from('airlines').select('id,airline_code,numeric_code,airline_name,account_no,comm_tier_1,comm_tier_2,comm_tier_3,comm_tier_4').order('airline_name')
      .then(({ data }) => setAirlines(data || []))
    // customers table: account_no, name_en
    supabase.from('customers').select('id,account_no,name_en').order('name_en')
      .then(({ data }) => setCustomers(data || []))
  }, [])

  // Live calculations — VAT is on (base fare + tax) per ZATCA rules
  const fare       = parseFloat(baseFare) || 0
  const taxAmt     = parseFloat(tax)      || 0
  const comm       = parseFloat(commPct)  || 0
  const disc       = parseFloat(discPct)  || 0
  const commAmt    = fare * comm / 100
  const netCarrier = fare - commAmt          // amount payable to airline via BSP
  const subtotal   = fare + taxAmt
  const vatAmt     = subtotal * 0.15        // 15% VAT on total
  const discAmt    = subtotal * disc / 100
  const selling    = subtotal + vatAmt - discAmt

  function handleAirlineChange(id) {
    setAirlineId(id)
    const al = airlines.find(a => a.id === id)
    if (al) {
      // class F→tier1, C→tier2, Y→tier3, W→tier4
      const t = { F: al.comm_tier_1, C: al.comm_tier_2, Y: al.comm_tier_3, W: al.comm_tier_4 }
      setCommPct(String(t[cls] || 0))
    }
  }

  function handleClassChange(c) {
    setCls(c)
    const al = airlines.find(a => a.id === airlineId)
    if (al) {
      const t = { F: al.comm_tier_1, C: al.comm_tier_2, Y: al.comm_tier_3, W: al.comm_tier_4 }
      setCommPct(String(t[c] || 0))
    }
  }

  function selectCustomer(c) {
    setCustSelected(c)
    setCustSearch(c ? `${c.account_no} — ${c.name_en}` : '')
    setCustOpen(false)
  }

  function handleQuickAdded(newCust) {
    setCustomers(prev => [...prev, newCust])
    selectCustomer(newCust)
    setShowQuickAdd(false)
  }

  const filteredCust = customers.filter(c =>
    custSearch === '' ||
    c.name_en?.toLowerCase().includes(custSearch.toLowerCase()) ||
    c.account_no?.includes(custSearch)
  ).slice(0, 25)

  const noResults = custSearch.length > 1 && filteredCust.length === 0

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setError('')
    const al = airlines.find(a => a.id === airlineId)
    const { error: err } = await supabase.from('tickets').insert({
      entity_id:           entityId || null,
      ticket_number:       ticketNumber,
      ticket_status:       'ISSUED',          // ← correct column name
      ticket_type:         ticketType,         // ← CASH | CREDIT
      value_type:          valueType,          // ← INT | DOM
      passenger_name:      passengerName,
      airline_id:          airlineId || null,
      airline_account_no:  al?.account_no || null,
      routing:             routing,            // ← routing not origin/destination
      class:               cls,               // ← Y | C | F | W
      ticket_value:        fare,              // ← ticket_value not base_fare
      tax_amount:          taxAmt,
      net_to_carrier:      netCarrier,
      selling_fare_cash:   selling,
      selling_fare_credit: selling,
      discount_percent:    disc,
      discount_value:      discAmt,
      earned_commission:   commAmt,           // ← earned_commission not commission_amount
      comm1_percent:       comm,              // ← comm1_percent not commission_pct
      vat_amount:          vatAmt,
      vat_rate:            15,
      customer_id:         custSelected?.id || null,
      customer_account_no: custSelected?.account_no || null,
      invoice_number:      invoiceNo || null,
      ticket_date:         ticketDate,        // ← ticket_date not issue_date
      remarks:             remarks || null,   // ← remarks not notes
      payment_mode:        'NORMAL',
      imported_from:       'MANUAL',
    })
    if (err) { setError(err.message); setSaving(false); return }
    setSuccess(true)
    setTimeout(() => { onSaved?.(); onClose?.() }, 1200)
    setSaving(false)
  }

  const isAr = lang === 'ar'

  return (
    <>
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20, direction:isAr?'rtl':'ltr' }}>
        <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:880, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>

          {/* Header */}
          <div style={{ padding:'18px 24px', background:'linear-gradient(135deg,#0f1f2e,#1a3a4a)', borderRadius:'16px 16px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0, zIndex:10 }}>
            <div>
              <h2 style={{ margin:0, color:'#fff', fontSize:17 }}>✈️ {isAr?'تذكرة جديدة':'New Ticket Entry'}</h2>
              <p style={{ margin:'2px 0 0', color:'rgba(255,255,255,0.45)', fontSize:12 }}>Fill in the ticket details below</p>
            </div>
            <button type="button" onClick={onClose} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#fff', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontSize:20 }}>✕</button>
          </div>

          {success && <div style={{ background:'#e8f5e9', color:'#2e7d32', padding:'10px 24px', fontWeight:600, textAlign:'center' }}>✅ Ticket saved successfully!</div>}
          {error   && <div style={{ background:'#ffebee', color:'#c62828', padding:'10px 24px', fontSize:13 }}>⚠️ {error}</div>}

          <form onSubmit={handleSubmit}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 32px', padding:'20px 24px' }}>

              {/* ── LEFT COLUMN ── */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#0091ea', marginBottom:14, letterSpacing:1 }}>TICKET INFO</div>

                <div style={S.grp}>
                  <label style={S.lbl}>Ticket Number *</label>
                  <input style={S.inp} value={ticketNumber} onChange={e=>setTicketNumber(e.target.value)} required placeholder="e.g. 065-1234567890" />
                </div>

                <div style={S.grp}>
                  <label style={S.lbl}>Passenger Name *</label>
                  <input style={S.inp} value={passengerName} onChange={e=>setPassengerName(e.target.value)} required placeholder="Full name as on ticket" />
                </div>

                <div style={S.grp}>
                  <label style={S.lbl}>Airline *</label>
                  <select style={S.sel} value={airlineId} onChange={e=>handleAirlineChange(e.target.value)} required>
                    <option value="">-- Select Airline --</option>
                    {airlines.map(a=><option key={a.id} value={a.id}>{a.airline_code} — {a.airline_name}</option>)}
                  </select>
                </div>

                <div style={S.grp}>
                  <label style={S.lbl}>Routing</label>
                  <input style={S.inp} value={routing} onChange={e=>setRouting(e.target.value)} placeholder="e.g. RUH-DXB-LHR" />
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                  <div>
                    <label style={S.lbl}>Class</label>
                    <select style={S.sel} value={cls} onChange={e=>handleClassChange(e.target.value)}>
                      {CLASSES.map(c=><option key={c.code} value={c.code}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={S.lbl}>Route Type</label>
                    <select style={S.sel} value={valueType} onChange={e=>setValueType(e.target.value)}>
                      <option value="INT">International</option>
                      <option value="DOM">Domestic</option>
                    </select>
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                  <div>
                    <label style={S.lbl}>Ticket Date *</label>
                    <input type="date" style={S.inp} value={ticketDate} onChange={e=>setTicketDate(e.target.value)} required />
                  </div>
                  <div>
                    <label style={S.lbl}>Payment</label>
                    <select style={S.sel} value={ticketType} onChange={e=>setTicketType(e.target.value)}>
                      <option value="CREDIT">Credit</option>
                      <option value="CASH">Cash</option>
                    </select>
                  </div>
                </div>

                {/* Customer search */}
                <div style={S.grp} ref={custRef}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                    <label style={{ ...S.lbl, marginBottom:0 }}>Customer / Account</label>
                    <button type="button" onClick={()=>setShowQuickAdd(true)} style={{ fontSize:11, color:'#0091ea', background:'none', border:'none', cursor:'pointer', fontWeight:700, padding:0 }}>+ Add New Customer</button>
                  </div>

                  {custSelected ? (
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:8, border:'1px solid #00c85355', background:'#f0fff4' }}>
                      <span style={{ flex:1, fontSize:13 }}>
                        <strong style={{ color:'#0091ea' }}>{custSelected.account_no}</strong>
                        <span style={{ color:'#1a2e3d', marginLeft:8 }}>{custSelected.name_en}</span>
                      </span>
                      <button type="button" onClick={()=>{ setCustSelected(null); setCustSearch('') }} style={{ background:'none', border:'none', color:'#aab2bd', cursor:'pointer', fontSize:16 }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <input style={S.inp} value={custSearch} onChange={e=>{ setCustSearch(e.target.value); setCustOpen(true) }} onFocus={()=>setCustOpen(true)} placeholder="Type name or account no..." autoComplete="off" />
                      {custOpen && (
                        <div style={{ position:'absolute', zIndex:999, background:'#fff', border:'1px solid #dde3ec', borderRadius:8, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', maxHeight:200, overflowY:'auto', width:340 }}>
                          <div onClick={()=>selectCustomer(null)} style={{ padding:'8px 12px', fontSize:13, color:'#aab2bd', cursor:'pointer', borderBottom:'1px solid #f0f4f8' }}>— Cash / Walk-in (no account)</div>
                          {filteredCust.map(c=>(
                            <div key={c.id} onClick={()=>selectCustomer(c)} style={{ padding:'9px 12px', fontSize:13, cursor:'pointer', borderBottom:'1px solid #f8fafd' }}
                              onMouseEnter={e=>e.currentTarget.style.background='#f0f7ff'}
                              onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                              <span style={{ color:'#0091ea', fontWeight:700 }}>{c.account_no}</span>
                              <span style={{ marginLeft:8 }}>{c.name_en}</span>
                            </div>
                          ))}
                          {noResults && (
                            <div style={{ padding:12 }}>
                              <p style={{ margin:'0 0 8px', fontSize:12, color:'#aab2bd' }}>No customer found for "{custSearch}"</p>
                              <button type="button" onClick={()=>{ setCustOpen(false); setShowQuickAdd(true) }} style={{ width:'100%', padding:8, borderRadius:8, border:'none', background:'linear-gradient(135deg,#0091ea,#00c853)', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700 }}>+ Add "{custSearch}" as new customer</button>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* ── RIGHT COLUMN ── */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#00c853', marginBottom:14, letterSpacing:1 }}>FARES & COMMISSION</div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                  <div>
                    <label style={S.lbl}>Base Fare (SAR) *</label>
                    <input type="number" step="0.01" style={S.inp} value={baseFare} onChange={e=>setBaseFare(e.target.value)} required placeholder="0.00" />
                  </div>
                  <div>
                    <label style={S.lbl}>Tax (SAR)</label>
                    <input type="number" step="0.01" style={S.inp} value={tax} onChange={e=>setTax(e.target.value)} placeholder="0.00" />
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                  <div>
                    <label style={S.lbl}>Commission % (auto from airline)</label>
                    <input type="number" step="0.01" style={S.inp} value={commPct} onChange={e=>setCommPct(e.target.value)} placeholder="0.00" />
                  </div>
                  <div>
                    <label style={S.lbl}>Discount %</label>
                    <input type="number" step="0.01" style={S.inp} value={discPct} onChange={e=>setDiscPct(e.target.value)} placeholder="0" />
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                  <div>
                    <label style={S.lbl}>Invoice No.</label>
                    <input style={S.inp} value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} placeholder="Auto if blank" />
                  </div>
                </div>

                <div style={S.grp}>
                  <label style={S.lbl}>Remarks</label>
                  <input style={S.inp} value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Optional notes" />
                </div>

                {/* Live Calculation Box */}
                <div style={{ background:'#f8fafd', borderRadius:10, padding:16, border:'1px solid #dde3ec' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:10, letterSpacing:1 }}>LIVE CALCULATION</div>
                  {[
                    ['Base Fare',             fare,        false, '#1a2e3d'],
                    ['Tax',                   taxAmt,      false, '#1a2e3d'],
                    [`Commission (${comm}%)`, commAmt,     false, '#7b1fa2'],
                    ['Net to Carrier (BSP)',  netCarrier,  false, '#e65100'],
                    ['Discount',              discAmt,     false, '#c62828'],
                    ['VAT 15%',               vatAmt,      false, '#1976d2'],
                    ['SELLING PRICE',         selling,     true,  '#0091ea'],
                  ].map(([label, val, bold, color]) => (
                    <div key={label} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid #f0f4f8' }}>
                      <span style={{ fontSize:13, color:'#6b7c93' }}>{label}</span>
                      <span style={{ fontSize: bold?15:13, fontWeight:bold?800:400, color }}> SAR {val.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ padding:'14px 24px', borderTop:'1px solid #f0f4f8', display:'flex', justifyContent:'flex-end', gap:12, position:'sticky', bottom:0, background:'#fff' }}>
              <button type="button" onClick={onClose} style={{ padding:'10px 24px', borderRadius:8, border:'1px solid #dde3ec', background:'#fff', cursor:'pointer', fontSize:14, color:'#6b7c93' }}>Cancel</button>
              <button type="submit" disabled={saving} style={{ padding:'10px 28px', borderRadius:8, border:'none', background:saving?'#aaa':'linear-gradient(135deg,#0091ea,#00c853)', color:'#fff', cursor:saving?'not-allowed':'pointer', fontSize:14, fontWeight:700 }}>
                {saving ? 'Saving...' : '💾 Save Ticket'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {showQuickAdd && <QuickAddCustomer searchText={custSearch} entityId={entityId} onAdded={handleQuickAdded} onCancel={()=>setShowQuickAdd(false)} />}
    </>
  )
}
