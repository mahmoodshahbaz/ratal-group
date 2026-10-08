import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Schema refunds:
//   entity_id(required), original_ticket_number(required NOT NULL),
//   refund_date, customer_id, gross_refund, penalty_amount, net_refund,
//   vat_refund, credit_note_number,
//   refund_number(patch), status(patch: PENDING|PROCESSED|REJECTED),
//   processed_date(patch)
// NOTE: NO reason column, NO status by default (added via patch)

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' },
  modal:   { background:'#fff', borderRadius:16, padding:28, width:540, maxWidth:'96vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.18)' },
  inp:     { width:'100%', padding:'9px 11px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box' },
  label:   { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4 },
  row:     { display:'flex', gap:12, marginBottom:14 },
  col:     { flex:1 },
}

export default function Refunds({ entityId }) {
  const [refunds,   setRefunds]   = useState([])
  const [customers, setCustomers] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [open,      setOpen]      = useState(false)
  const [saving,    setSaving]    = useState(false)

  const [refDate,   setRefDate]   = useState(new Date().toISOString().split('T')[0])
  const [origTicket,setOrigTicket]= useState('')    // required NOT NULL
  const [custId,    setCustId]    = useState('')
  const [grossRef,  setGrossRef]  = useState('')
  const [penalty,   setPenalty]   = useState('0')
  const [vatRefund, setVatRefund] = useState('')
  const [creditNote,setCreditNote]= useState('')

  // auto-calculate net_refund
  const netRefund = (parseFloat(grossRef)||0) - (parseFloat(penalty)||0)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: r }, { data: c }] = await Promise.all([
      supabase.from('refunds').select('*, customers(name_en)').eq('entity_id',entityId||'').order('refund_date',{ascending:false}),
      supabase.from('customers').select('id,name_en,account_no').eq('entity_id',entityId||''),
    ])
    setRefunds(r||[]); setCustomers(c||[])
    setLoading(false)
  }

  function resetForm() { setRefDate(new Date().toISOString().split('T')[0]); setOrigTicket(''); setCustId(''); setGrossRef(''); setPenalty('0'); setVatRefund(''); setCreditNote('') }

  async function save() {
    if (!origTicket) { alert('Original Ticket Number is required'); return }
    if (!grossRef || parseFloat(grossRef) <= 0) { alert('Gross Refund amount is required'); return }
    setSaving(true)
    const { error } = await supabase.from('refunds').insert({
      entity_id:              entityId,
      original_ticket_number: origTicket,   // ← required NOT NULL
      refund_date:            refDate,
      customer_id:            custId||null,
      gross_refund:           parseFloat(grossRef),
      penalty_amount:         parseFloat(penalty)||0,
      net_refund:             netRefund,
      vat_refund:             parseFloat(vatRefund)||0,
      credit_note_number:     creditNote||null,
      status:                 'PENDING',     // from patch
    })
    setSaving(false)
    if (error) { alert(error.message); return }
    setOpen(false); resetForm(); load()
  }

  async function updateStatus(id, status) {
    await supabase.from('refunds').update({ status, processed_date: status==='PROCESSED' ? new Date().toISOString().split('T')[0] : null }).eq('id',id)
    load()
  }

  const statusColor = { PENDING:'#fff3e0', PROCESSED:'#e8f5e9', REJECTED:'#ffebee' }
  const statusText  = { PENDING:'#e65100', PROCESSED:'#2e7d32', REJECTED:'#c62828' }

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:16, alignItems:'center' }}>
        <button onClick={()=>{ resetForm(); setOpen(true) }} style={{ background:'linear-gradient(135deg,#4a148c,#6a1b9a)', color:'#fff', border:'none', borderRadius:10, padding:'10px 22px', cursor:'pointer', fontSize:14, fontWeight:700 }}>+ New Refund</button>
      </div>

      <div style={{ background:'#fff', borderRadius:14, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', overflow:'hidden' }}>
        {loading ? <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>Loading...</div> : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr style={{ background:'#f8fafd' }}>
              {['Refund #','Date','Original Ticket','Customer','Gross Refund','Penalty','Net Refund','VAT','Credit Note','Status',''].map(h=>(
                <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:10, color:'#6b7c93', fontWeight:700 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {refunds.length===0 ? <tr><td colSpan={11} style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No refunds recorded</td></tr> :
              refunds.map(r=>(
                <tr key={r.id} style={{ borderTop:'1px solid #f0f4f8' }}>
                  <td style={{ padding:'10px 14px', fontSize:12, fontWeight:700 }}>{r.refund_number||'-'}</td>
                  <td style={{ padding:'10px 14px', fontSize:12 }}>{r.refund_date}</td>
                  <td style={{ padding:'10px 14px', fontSize:12, fontWeight:700, color:'#4a148c' }}>{r.original_ticket_number}</td>
                  <td style={{ padding:'10px 14px', fontSize:12 }}>{r.customers?.name_en||'-'}</td>
                  <td style={{ padding:'10px 14px', fontSize:13 }}>SAR {(r.gross_refund||0).toFixed(2)}</td>
                  <td style={{ padding:'10px 14px', fontSize:13, color:'#c62828' }}>SAR {(r.penalty_amount||0).toFixed(2)}</td>
                  <td style={{ padding:'10px 14px', fontSize:14, fontWeight:700, color:'#2e7d32' }}>SAR {(r.net_refund||0).toFixed(2)}</td>
                  <td style={{ padding:'10px 14px', fontSize:12 }}>SAR {(r.vat_refund||0).toFixed(2)}</td>
                  <td style={{ padding:'10px 14px', fontSize:11 }}>{r.credit_note_number||'-'}</td>
                  <td style={{ padding:'10px 14px' }}>{r.status ? <span style={{ background:statusColor[r.status]||'#eee', color:statusText[r.status]||'#555', borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{r.status}</span> : '-'}</td>
                  <td style={{ padding:'10px 14px', display:'flex', gap:4 }}>
                    {r.status==='PENDING' && <>
                      <button onClick={()=>updateStatus(r.id,'PROCESSED')} style={{ background:'#e8f5e9', color:'#2e7d32', border:'none', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:10, fontWeight:700 }}>Process</button>
                      <button onClick={()=>updateStatus(r.id,'REJECTED')} style={{ background:'#ffebee', color:'#c62828', border:'none', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:10, fontWeight:700 }}>Reject</button>
                    </>}
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
            <h3 style={{ margin:'0 0 18px', fontSize:16, fontWeight:800 }}>↩️ New Ticket Refund</h3>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Refund Date</label><input type="date" style={S.inp} value={refDate} onChange={e=>setRefDate(e.target.value)} /></div>
              <div style={S.col}><label style={S.label}>Credit Note #</label><input style={S.inp} value={creditNote} onChange={e=>setCreditNote(e.target.value)} /></div>
            </div>
            <div style={{ marginBottom:14 }}><label style={S.label}>Original Ticket Number *</label><input style={S.inp} value={origTicket} onChange={e=>setOrigTicket(e.target.value)} placeholder="e.g. 1761234567890" /></div>
            <div style={{ marginBottom:14 }}><label style={S.label}>Customer</label>
              <select style={S.inp} value={custId} onChange={e=>setCustId(e.target.value)}>
                <option value="">-- Select --</option>
                {customers.map(c=><option key={c.id} value={c.id}>{c.name_en} ({c.account_no})</option>)}
              </select>
            </div>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Gross Refund (SAR) *</label><input type="number" style={S.inp} value={grossRef} onChange={e=>setGrossRef(e.target.value)} placeholder="0.00" /></div>
              <div style={S.col}><label style={S.label}>Penalty (SAR)</label><input type="number" style={S.inp} value={penalty} onChange={e=>setPenalty(e.target.value)} placeholder="0.00" /></div>
            </div>
            <div style={{ background:'#e8f5e9', borderRadius:8, padding:'10px 14px', marginBottom:14, display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:13, fontWeight:700 }}>Net Refund</span>
              <span style={{ fontSize:14, fontWeight:800, color:'#2e7d32' }}>SAR {netRefund.toFixed(2)}</span>
            </div>
            <div style={{ marginBottom:18 }}><label style={S.label}>VAT Refund (SAR)</label><input type="number" style={S.inp} value={vatRefund} onChange={e=>setVatRefund(e.target.value)} placeholder="0.00" /></div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={()=>setOpen(false)} style={{ background:'#f0f4f8', color:'#555', border:'none', borderRadius:9, padding:'10px 20px', cursor:'pointer', fontSize:13 }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ background:'linear-gradient(135deg,#4a148c,#6a1b9a)', color:'#fff', border:'none', borderRadius:9, padding:'10px 24px', cursor:'pointer', fontSize:13, fontWeight:700 }}>{saving?'Saving...':'Save Refund'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
