import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Schema bsp_remittances:
//   entity_id(required), airline_id, period_start, period_end,
//   gross_sales(NOT total_sales), refunds_amount, net_remittance(NOT net_due),
//   commission_earned, vat_on_commission, net_payable,
//   status(PENDING|SUBMITTED|PAID), payment_date, payment_reference,
//   bsp_number(patch), due_date(patch)

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' },
  modal:   { background:'#fff', borderRadius:16, padding:28, width:560, maxWidth:'96vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.18)' },
  inp:     { width:'100%', padding:'9px 11px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box' },
  label:   { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4 },
  row:     { display:'flex', gap:12, marginBottom:14 },
  col:     { flex:1 },
}

export default function BSP({ entityId }) {
  const [remittances, setRemittances] = useState([])
  const [airlines,    setAirlines]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [open,        setOpen]        = useState(false)
  const [saving,      setSaving]      = useState(false)

  const [airId,     setAirId]     = useState('')
  const [bspNum,    setBspNum]    = useState('')
  const [start,     setStart]     = useState('')
  const [end,       setEnd]       = useState('')
  const [dueDate,   setDueDate]   = useState('')
  const [grossSales,setGrossSales]= useState('')
  const [refunds,   setRefunds]   = useState('0')
  const [commission,setCommission]= useState('')

  const netRemittance  = (parseFloat(grossSales)||0) - (parseFloat(refunds)||0)
  const vatOnComm      = (parseFloat(commission)||0) * 0.15
  const netPayable     = netRemittance - (parseFloat(commission)||0) - vatOnComm

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: r }, { data: a }] = await Promise.all([
      supabase.from('bsp_remittances').select('*, airlines(airline_name,airline_code)').eq('entity_id',entityId||'').order('period_end',{ascending:false}),
      supabase.from('airlines').select('id,airline_name,airline_code'),
    ])
    setRemittances(r||[]); setAirlines(a||[])
    setLoading(false)
  }

  function resetForm() { setAirId(''); setBspNum(''); setStart(''); setEnd(''); setDueDate(''); setGrossSales(''); setRefunds('0'); setCommission('') }

  async function save() {
    if (!airId) { alert('Airline is required'); return }
    if (!grossSales) { alert('Gross Sales is required'); return }
    setSaving(true)
    const { error } = await supabase.from('bsp_remittances').insert({
      entity_id:         entityId,
      airline_id:        airId,
      bsp_number:        bspNum||null,      // from patch
      period_start:      start||null,
      period_end:        end||null,
      due_date:          dueDate||null,     // from patch
      gross_sales:       parseFloat(grossSales),    // ← gross_sales NOT total_sales
      refunds_amount:    parseFloat(refunds)||0,
      net_remittance:    netRemittance,     // ← net_remittance NOT net_due
      commission_earned: parseFloat(commission)||0,
      vat_on_commission: vatOnComm,
      net_payable:       netPayable,
      status:            'PENDING',
    })
    setSaving(false)
    if (error) { alert(error.message); return }
    setOpen(false); resetForm(); load()
  }

  async function updateStatus(id, status) {
    const upd = { status }
    if (status === 'PAID') upd.payment_date = new Date().toISOString().split('T')[0]
    await supabase.from('bsp_remittances').update(upd).eq('id',id)
    load()
  }

  const statusColor = { PENDING:'#fff3e0', SUBMITTED:'#e3f2fd', PAID:'#e8f5e9' }
  const statusText  = { PENDING:'#e65100', SUBMITTED:'#0277bd', PAID:'#2e7d32' }

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
        <button onClick={()=>{ resetForm(); setOpen(true) }} style={{ background:'linear-gradient(135deg,#1a237e,#283593)', color:'#fff', border:'none', borderRadius:10, padding:'10px 22px', cursor:'pointer', fontSize:14, fontWeight:700 }}>+ New BSP Remittance</button>
      </div>

      <div style={{ background:'#fff', borderRadius:14, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', overflow:'hidden' }}>
        {loading ? <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>Loading...</div> : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr style={{ background:'#f8fafd' }}>
              {['BSP #','Airline','Period','Gross Sales','Refunds','Net Remittance','Commission','VAT','Net Payable','Due','Status',''].map(h=>(
                <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:10, color:'#6b7c93', fontWeight:700 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {remittances.length===0 ? <tr><td colSpan={12} style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No BSP remittances yet</td></tr> :
              remittances.map(r=>(
                <tr key={r.id} style={{ borderTop:'1px solid #f0f4f8' }}>
                  <td style={{ padding:'8px 10px', fontSize:12, fontWeight:700 }}>{r.bsp_number||'-'}</td>
                  <td style={{ padding:'8px 10px', fontSize:12, fontWeight:700 }}>{r.airlines?.airline_code} — {r.airlines?.airline_name}</td>
                  <td style={{ padding:'8px 10px', fontSize:11 }}>{r.period_start} → {r.period_end}</td>
                  <td style={{ padding:'8px 10px', fontSize:12 }}>SAR {(r.gross_sales||0).toLocaleString()}</td>
                  <td style={{ padding:'8px 10px', fontSize:12, color:'#c62828' }}>SAR {(r.refunds_amount||0).toLocaleString()}</td>
                  <td style={{ padding:'8px 10px', fontSize:12, fontWeight:700 }}>SAR {(r.net_remittance||0).toLocaleString()}</td>
                  <td style={{ padding:'8px 10px', fontSize:12, color:'#2e7d32' }}>SAR {(r.commission_earned||0).toLocaleString()}</td>
                  <td style={{ padding:'8px 10px', fontSize:11 }}>SAR {(r.vat_on_commission||0).toLocaleString()}</td>
                  <td style={{ padding:'8px 10px', fontSize:13, fontWeight:800, color:'#1a237e' }}>SAR {(r.net_payable||0).toLocaleString()}</td>
                  <td style={{ padding:'8px 10px', fontSize:11 }}>{r.due_date||'-'}</td>
                  <td style={{ padding:'8px 10px' }}><span style={{ background:statusColor[r.status]||'#eee', color:statusText[r.status]||'#555', borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{r.status}</span></td>
                  <td style={{ padding:'8px 10px', display:'flex', gap:4 }}>
                    {r.status==='PENDING'&&<button onClick={()=>updateStatus(r.id,'SUBMITTED')} style={{ background:'#e3f2fd', color:'#0277bd', border:'none', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:10, fontWeight:700 }}>Submit</button>}
                    {r.status==='SUBMITTED'&&<button onClick={()=>updateStatus(r.id,'PAID')} style={{ background:'#e8f5e9', color:'#2e7d32', border:'none', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:10, fontWeight:700 }}>Paid</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setOpen(false)}>
          <div style={S.modal}>
            <h3 style={{ margin:'0 0 18px', fontSize:16, fontWeight:800 }}>✈️ BSP Remittance</h3>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>BSP Number</label><input style={S.inp} value={bspNum} onChange={e=>setBspNum(e.target.value)} /></div>
              <div style={S.col}><label style={S.label}>Due Date</label><input type="date" style={S.inp} value={dueDate} onChange={e=>setDueDate(e.target.value)} /></div>
            </div>
            <div style={{ marginBottom:14 }}><label style={S.label}>Airline *</label>
              <select style={S.inp} value={airId} onChange={e=>setAirId(e.target.value)}>
                <option value="">-- Select Airline --</option>
                {airlines.map(a=><option key={a.id} value={a.id}>{a.airline_code} — {a.airline_name}</option>)}
              </select>
            </div>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Period Start</label><input type="date" style={S.inp} value={start} onChange={e=>setStart(e.target.value)} /></div>
              <div style={S.col}><label style={S.label}>Period End</label><input type="date" style={S.inp} value={end} onChange={e=>setEnd(e.target.value)} /></div>
            </div>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Gross Sales (SAR) *</label><input type="number" style={S.inp} value={grossSales} onChange={e=>setGrossSales(e.target.value)} placeholder="0.00" /></div>
              <div style={S.col}><label style={S.label}>Refunds (SAR)</label><input type="number" style={S.inp} value={refunds} onChange={e=>setRefunds(e.target.value)} placeholder="0.00" /></div>
            </div>
            <div style={{ marginBottom:14 }}><label style={S.label}>Commission Earned (SAR)</label><input type="number" style={S.inp} value={commission} onChange={e=>setCommission(e.target.value)} placeholder="0.00" /></div>
            <div style={{ background:'#e8eaf6', borderRadius:8, padding:'12px 14px', marginBottom:18 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}><span style={{ fontSize:12 }}>Net Remittance (Gross − Refunds)</span><span style={{ fontSize:13, fontWeight:700 }}>SAR {netRemittance.toFixed(2)}</span></div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}><span style={{ fontSize:12 }}>VAT on Commission (15%)</span><span style={{ fontSize:13, fontWeight:700 }}>SAR {vatOnComm.toFixed(2)}</span></div>
              <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ fontSize:13, fontWeight:800 }}>Net Payable to IATA</span><span style={{ fontSize:15, fontWeight:800, color:'#1a237e' }}>SAR {netPayable.toFixed(2)}</span></div>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={()=>setOpen(false)} style={{ background:'#f0f4f8', color:'#555', border:'none', borderRadius:9, padding:'10px 20px', cursor:'pointer', fontSize:13 }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ background:'linear-gradient(135deg,#1a237e,#283593)', color:'#fff', border:'none', borderRadius:9, padding:'10px 24px', cursor:'pointer', fontSize:13, fontWeight:700 }}>{saving?'Saving...':'Save Remittance'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
