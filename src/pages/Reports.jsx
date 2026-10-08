import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Uses exact ticket column names from schema:
// ticket_date (NOT issue_date), ticket_value (NOT base_fare),
// ticket_status (NOT status), ticket_type (CASH|CREDIT),
// value_type (INT|DOM), routing (NOT origin/destination),
// earned_commission (NOT commission_amount), comm1_percent (NOT commission_pct),
// net_to_carrier, selling_fare_cash, selling_fare_credit,
// class (Y|C|F|W), remarks (NOT notes)

const S = {
  inp: { padding:'9px 11px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:'inherit', background:'#fff' },
  th:  { padding:'10px 12px', textAlign:'left', fontSize:11, color:'#fff', fontWeight:700, whiteSpace:'nowrap' },
  td:  { padding:'9px 12px', fontSize:12, borderTop:'1px solid #f0f4f8' },
}

const REPORTS = [
  { id:'ticket_sales',    label:'Ticket Sales'        },
  { id:'commission',      label:'Commission Earned'   },
  { id:'customer_ledger', label:'Customer Ledger'     },
  { id:'airline_summary', label:'Airline Summary'     },
  { id:'vat_report',      label:'VAT Report'          },
]

export default function Reports({ entityId }) {
  const [reportType, setReportType] = useState('ticket_sales')
  const [dateFrom,   setDateFrom]   = useState(new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().split('T')[0])
  const [dateTo,     setDateTo]     = useState(new Date().toISOString().split('T')[0])
  const [ticketType, setTicketType] = useState('ALL')
  const [valueType,  setValueType]  = useState('ALL')
  const [loading,    setLoading]    = useState(false)
  const [rows,       setRows]       = useState([])
  const [summary,    setSummary]    = useState(null)

  async function runReport() {
    setLoading(true); setRows([]); setSummary(null)
    try {
      if (reportType === 'ticket_sales') await reportTicketSales()
      else if (reportType === 'commission') await reportCommission()
      else if (reportType === 'customer_ledger') await reportCustomerLedger()
      else if (reportType === 'airline_summary') await reportAirlineSummary()
      else if (reportType === 'vat_report') await reportVAT()
    } finally { setLoading(false) }
  }

  async function reportTicketSales() {
    let q = supabase.from('tickets')
      .select('*, customers(name_en), airlines(airline_name,airline_code)')
      .eq('entity_id', entityId||'')
      .gte('ticket_date', dateFrom)   // ← ticket_date NOT issue_date
      .lte('ticket_date', dateTo)
      .order('ticket_date', { ascending: false })
    if (ticketType !== 'ALL') q = q.eq('ticket_type', ticketType)
    if (valueType  !== 'ALL') q = q.eq('value_type',  valueType)
    const { data } = await q
    setRows(data||[])
    const tots = (data||[]).reduce((s,t) => ({
      ticket_value:     s.ticket_value     + (t.ticket_value||0),
      earned_commission:s.earned_commission + (t.earned_commission||0),
      vat_amount:       s.vat_amount       + (t.vat_amount||0),
      net_to_carrier:   s.net_to_carrier   + (t.net_to_carrier||0),
    }), { ticket_value:0, earned_commission:0, vat_amount:0, net_to_carrier:0 })
    setSummary(tots)
  }

  async function reportCommission() {
    const { data } = await supabase.from('tickets')
      .select('*, airlines(airline_name,airline_code)')
      .eq('entity_id', entityId||'')
      .gte('ticket_date', dateFrom)
      .lte('ticket_date', dateTo)
      .neq('ticket_status','VOID')
      .order('ticket_date', { ascending: false })
    setRows(data||[])
    setSummary({
      earned_commission: (data||[]).reduce((s,t)=>s+(t.earned_commission||0),0),
      vat_amount:        (data||[]).reduce((s,t)=>s+(t.vat_amount||0),0),
      count:             (data||[]).length,
    })
  }

  async function reportCustomerLedger() {
    const { data } = await supabase.from('tickets')
      .select('ticket_date, ticket_number, routing, ticket_value, earned_commission, vat_amount, ticket_type, ticket_status, customers(name_en,account_no)')
      .eq('entity_id', entityId||'')
      .gte('ticket_date', dateFrom)
      .lte('ticket_date', dateTo)
      .order('customers(name_en)')
    setRows(data||[])
  }

  async function reportAirlineSummary() {
    const { data } = await supabase.from('tickets')
      .select('airline_id, ticket_value, earned_commission, net_to_carrier, airlines(airline_name,airline_code)')
      .eq('entity_id', entityId||'')
      .gte('ticket_date', dateFrom)
      .lte('ticket_date', dateTo)
      .neq('ticket_status','VOID')
    // Group by airline
    const grouped = {}
    for (const t of (data||[])) {
      const key = t.airline_id
      if (!grouped[key]) grouped[key] = { name:t.airlines?.airline_name, code:t.airlines?.airline_code, count:0, ticket_value:0, commission:0, net_to_carrier:0 }
      grouped[key].count++
      grouped[key].ticket_value    += t.ticket_value||0
      grouped[key].commission      += t.earned_commission||0
      grouped[key].net_to_carrier  += t.net_to_carrier||0
    }
    setRows(Object.values(grouped))
  }

  async function reportVAT() {
    const { data } = await supabase.from('tickets')
      .select('ticket_date, ticket_number, ticket_value, vat_amount, earned_commission, ticket_status')
      .eq('entity_id', entityId||'')
      .gte('ticket_date', dateFrom)
      .lte('ticket_date', dateTo)
      .neq('ticket_status','VOID')
      .order('ticket_date')
    setRows(data||[])
    setSummary({
      ticket_value: (data||[]).reduce((s,t)=>s+(t.ticket_value||0),0),
      vat_amount:   (data||[]).reduce((s,t)=>s+(t.vat_amount||0),0),
    })
  }

  function exportCSV() {
    if (!rows.length) return
    const headers = Object.keys(rows[0]).filter(k => !['id','entity_id','customer_id','airline_id','created_at','updated_at'].includes(k))
    const csv = [headers.join(','), ...rows.map(r => headers.map(h => {
      const v = typeof r[h] === 'object' ? JSON.stringify(r[h]) : (r[h]??'')
      return `"${String(v).replace(/"/g,'""')}"`
    }).join(','))].join('\n')
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,'+encodeURIComponent(csv)
    a.download = `${reportType}_${dateFrom}_${dateTo}.csv`; a.click()
  }

  function renderTable() {
    if (reportType === 'ticket_sales' || reportType === 'commission') {
      return (
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr style={{ background:'#f8fafd' }}>
            {['Date','Ticket #','Customer','Airline','Route','Class','Type','Route Type','Fare','Commission','VAT','Status'].map(h=><th key={h} style={S.th}>{h}</th>)}
          </tr></thead>
          <tbody>{rows.map((t,i)=>(
            <tr key={i}>
              <td style={S.td}>{t.ticket_date}</td>
              <td style={{ ...S.td, fontWeight:700 }}>{t.ticket_number}</td>
              <td style={S.td}>{t.customers?.name_en||'-'}</td>
              <td style={S.td}>{t.airlines?.airline_code}</td>
              <td style={S.td}>{t.routing||'-'}</td>
              <td style={S.td}>{t.class}</td>
              <td style={S.td}>{t.ticket_type}</td>
              <td style={S.td}>{t.value_type}</td>
              <td style={{ ...S.td, fontWeight:700 }}>SAR {(t.ticket_value||0).toFixed(2)}</td>
              <td style={{ ...S.td, color:'#2e7d32', fontWeight:700 }}>SAR {(t.earned_commission||0).toFixed(2)}</td>
              <td style={S.td}>SAR {(t.vat_amount||0).toFixed(2)}</td>
              <td style={S.td}><span style={{ background:t.ticket_status==='VOID'?'#ffebee':'#e8f5e9', color:t.ticket_status==='VOID'?'#c62828':'#2e7d32', borderRadius:5, padding:'2px 6px', fontSize:10, fontWeight:700 }}>{t.ticket_status}</span></td>
            </tr>
          ))}</tbody>
          {summary && <tfoot><tr style={{ background:'#e0f7fa', fontWeight:800 }}>
            <td colSpan={8} style={{ padding:'10px 12px', fontSize:13 }}>TOTALS ({rows.length} tickets)</td>
            <td style={{ padding:'10px 12px', fontSize:13, fontWeight:800 }}>SAR {(summary.ticket_value||0).toFixed(2)}</td>
            <td style={{ padding:'10px 12px', fontSize:13, fontWeight:800, color:'#2e7d32' }}>SAR {(summary.earned_commission||0).toFixed(2)}</td>
            <td style={{ padding:'10px 12px', fontSize:13, fontWeight:800 }}>SAR {(summary.vat_amount||0).toFixed(2)}</td>
            <td></td>
          </tr></tfoot>}
        </table>
      )
    }
    if (reportType === 'airline_summary') {
      return (
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr style={{ background:'#f8fafd' }}>
            {['Airline','Code','Tickets','Total Fares','Commission Earned','Net to Carrier'].map(h=><th key={h} style={S.th}>{h}</th>)}
          </tr></thead>
          <tbody>{rows.map((r,i)=>(
            <tr key={i}>
              <td style={{ ...S.td, fontWeight:700 }}>{r.name}</td>
              <td style={S.td}>{r.code}</td>
              <td style={{ ...S.td, textAlign:'center' }}>{r.count}</td>
              <td style={S.td}>SAR {(r.ticket_value||0).toFixed(2)}</td>
              <td style={{ ...S.td, color:'#2e7d32', fontWeight:700 }}>SAR {(r.commission||0).toFixed(2)}</td>
              <td style={{ ...S.td, fontWeight:700, color:'#1565c0' }}>SAR {(r.net_to_carrier||0).toFixed(2)}</td>
            </tr>
          ))}</tbody>
        </table>
      )
    }
    if (reportType === 'vat_report') {
      return (
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr style={{ background:'#f8fafd' }}>
            {['Date','Ticket #','Ticket Value (SAR)','VAT 15% (SAR)','Status'].map(h=><th key={h} style={S.th}>{h}</th>)}
          </tr></thead>
          <tbody>{rows.map((r,i)=>(
            <tr key={i}>
              <td style={S.td}>{r.ticket_date}</td>
              <td style={{ ...S.td, fontWeight:700 }}>{r.ticket_number}</td>
              <td style={S.td}>SAR {(r.ticket_value||0).toFixed(2)}</td>
              <td style={{ ...S.td, fontWeight:700, color:'#e65100' }}>SAR {(r.vat_amount||0).toFixed(2)}</td>
              <td style={S.td}>{r.ticket_status}</td>
            </tr>
          ))}
          {summary && <tr style={{ background:'#fff3e0', fontWeight:800 }}>
            <td colSpan={2} style={{ padding:'10px 12px', fontSize:13 }}>VAT TOTAL ({rows.length} tickets)</td>
            <td style={{ padding:'10px 12px', fontSize:13 }}>SAR {(summary.ticket_value||0).toFixed(2)}</td>
            <td style={{ padding:'10px 12px', fontSize:14, color:'#e65100' }}>SAR {(summary.vat_amount||0).toFixed(2)}</td>
            <td></td>
          </tr>}
          </tbody>
        </table>
      )
    }
    if (reportType === 'customer_ledger') {
      return (
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead><tr style={{ background:'#f8fafd' }}>
            {['Customer','Acct #','Date','Ticket #','Route','Fare','Commission','Type','Status'].map(h=><th key={h} style={S.th}>{h}</th>)}
          </tr></thead>
          <tbody>{rows.map((r,i)=>(
            <tr key={i}>
              <td style={{ ...S.td, fontWeight:700 }}>{r.customers?.name_en||'-'}</td>
              <td style={S.td}>{r.customers?.account_no||'-'}</td>
              <td style={S.td}>{r.ticket_date}</td>
              <td style={{ ...S.td, fontWeight:700 }}>{r.ticket_number}</td>
              <td style={S.td}>{r.routing||'-'}</td>
              <td style={S.td}>SAR {(r.ticket_value||0).toFixed(2)}</td>
              <td style={{ ...S.td, color:'#2e7d32' }}>SAR {(r.earned_commission||0).toFixed(2)}</td>
              <td style={S.td}>{r.ticket_type}</td>
              <td style={S.td}>{r.ticket_status}</td>
            </tr>
          ))}</tbody>
        </table>
      )
    }
    return null
  }

  return (
    <div>
      <div style={{ background:'#fff', borderRadius:14, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', padding:'16px 18px', marginBottom:16 }}>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div><div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 }}>Report Type</div>
            <select style={{ ...S.inp, minWidth:180 }} value={reportType} onChange={e=>setReportType(e.target.value)}>
              {REPORTS.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          <div><div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 }}>From</div><input type="date" style={S.inp} value={dateFrom} onChange={e=>setDateFrom(e.target.value)} /></div>
          <div><div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 }}>To</div><input type="date" style={S.inp} value={dateTo} onChange={e=>setDateTo(e.target.value)} /></div>
          {(reportType==='ticket_sales'||reportType==='commission') && <>
            <div><div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 }}>Pay Type</div>
              <select style={S.inp} value={ticketType} onChange={e=>setTicketType(e.target.value)}>
                <option value="ALL">All</option><option value="CASH">CASH</option><option value="CREDIT">CREDIT</option>
              </select>
            </div>
            <div><div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 }}>Route</div>
              <select style={S.inp} value={valueType} onChange={e=>setValueType(e.target.value)}>
                <option value="ALL">All</option><option value="INT">INT</option><option value="DOM">DOM</option>
              </select>
            </div>
          </>}
          <button onClick={runReport} disabled={loading} style={{ background:'linear-gradient(135deg,#1565c0,#1976d2)', color:'#fff', border:'none', borderRadius:10, padding:'10px 24px', cursor:'pointer', fontSize:14, fontWeight:700 }}>{loading?'Loading...':'▶ Run Report'}</button>
          {rows.length > 0 && <button onClick={exportCSV} style={{ background:'#e8f5e9', color:'#2e7d32', border:'none', borderRadius:10, padding:'10px 18px', cursor:'pointer', fontSize:13, fontWeight:700 }}>⬇ Export CSV</button>}
        </div>
      </div>

      {rows.length > 0 && (
        <div style={{ background:'#fff', borderRadius:14, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid #f0f4f8', fontSize:13, fontWeight:700 }}>
            {REPORTS.find(r=>r.id===reportType)?.label} — {dateFrom} to {dateTo} — {rows.length} records
          </div>
          <div style={{ overflowX:'auto' }}>{renderTable()}</div>
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div style={{ textAlign:'center', padding:60, color:'#aab2bd', fontSize:14 }}>Run a report to see results</div>
      )}
    </div>
  )
}
