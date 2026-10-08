import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import NewTicket from './NewTicket'

// Ticket list page — wraps the NewTicket modal
// Shows recent tickets table + Import CSV option
// Manual entry kept as option via "+ New Ticket" button

const S = {
  badge: (color) => ({ background:`${color}22`, color, borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700 }),
}

const STATUS_COLORS = { ISSUED:'#2e7d32', REFUNDED:'#e65100', VOID:'#9e9e9e', REISSUED:'#0277bd' }

export default function TicketsPage({ entityId, entityCode }) {
  const [tickets,     setTickets]     = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showModal,   setShowModal]   = useState(false)
  const [search,      setSearch]      = useState('')
  const [filterClass, setFilterClass] = useState('ALL')
  const [filterType,  setFilterType]  = useState('ALL')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')

  useEffect(() => { load() }, [entityId])

  async function load() {
    if (!entityId) return
    setLoading(true)
    const { data } = await supabase
      .from('tickets')
      .select('*, customers(name_en,account_no), airlines(airline_name,airline_code)')
      .eq('entity_id', entityId)
      .order('ticket_date', { ascending: false })
      .limit(200)
    setTickets(data || [])
    setLoading(false)
  }

  const filtered = tickets.filter(t => {
    const matchSearch = !search ||
      t.ticket_number?.toLowerCase().includes(search.toLowerCase()) ||
      t.passenger_name?.toLowerCase().includes(search.toLowerCase()) ||
      t.customers?.name_en?.toLowerCase().includes(search.toLowerCase()) ||
      t.routing?.toLowerCase().includes(search.toLowerCase())
    const matchClass = filterClass === 'ALL' || t.class === filterClass
    const matchType  = filterType  === 'ALL' || t.ticket_type === filterType
    const matchFrom  = !dateFrom || t.ticket_date >= dateFrom
    const matchTo    = !dateTo   || t.ticket_date <= dateTo
    return matchSearch && matchClass && matchType && matchFrom && matchTo
  })

  const totalFares = filtered.filter(t=>t.ticket_status!=='VOID').reduce((s,t)=>s+(t.ticket_value||0),0)
  const totalComm  = filtered.filter(t=>t.ticket_status!=='VOID').reduce((s,t)=>s+(t.earned_commission||0),0)

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display:'flex', gap:8, marginBottom:14, overflowX:'auto', flexWrap:'nowrap', paddingBottom:2, alignItems:'center' }}>
        <button onClick={() => setShowModal(true)} style={{ background:'linear-gradient(135deg,#1565c0,#1976d2)', color:'#fff', border:'none', borderRadius:10, padding:'10px 20px', cursor:'pointer', fontSize:13, fontWeight:700, flexShrink:0 }}>
          🎫 + New Ticket
        </button>

        <input
          placeholder="Search ticket#, passenger, customer, route..."
          style={{ flex:1, minWidth:220, padding:'9px 12px', borderRadius:8, border:'1px solid #dde3ec', fontSize:13, outline:'none' }}
          value={search} onChange={e => setSearch(e.target.value)}
        />

        <select value={filterClass} onChange={e=>setFilterClass(e.target.value)} style={{ padding:'9px 10px', borderRadius:8, border:'1px solid #dde3ec', fontSize:12, outline:'none' }}>
          <option value="ALL">All Classes</option>
          <option value="Y">Economy (Y)</option>
          <option value="C">Business (C)</option>
          <option value="F">First (F)</option>
          <option value="W">Special (W)</option>
        </select>

        <select value={filterType} onChange={e=>setFilterType(e.target.value)} style={{ padding:'9px 10px', borderRadius:8, border:'1px solid #dde3ec', fontSize:12, outline:'none' }}>
          <option value="ALL">Cash + Credit</option>
          <option value="CASH">Cash only</option>
          <option value="CREDIT">Credit only</option>
        </select>

        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{ padding:'9px 10px', borderRadius:8, border:'1px solid #dde3ec', fontSize:12, outline:'none' }} />
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{ padding:'9px 10px', borderRadius:8, border:'1px solid #dde3ec', fontSize:12, outline:'none' }} />

        <button onClick={load} style={{ background:'#e3f2fd', color:'#0277bd', border:'none', borderRadius:8, padding:'9px 14px', cursor:'pointer', fontSize:12, fontWeight:700 }}>↻ Refresh</button>
      </div>

      {/* Summary bar */}
      <div style={{ display:'flex', gap:10, marginBottom:14 }}>
        <div style={{ background:'#fff', borderRadius:10, padding:'10px 16px', flex:1, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize:11, color:'#6b7c93', fontWeight:600 }}>Showing</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#1565c0' }}>{filtered.length} tickets</div>
        </div>
        <div style={{ background:'#fff', borderRadius:10, padding:'10px 16px', flex:1, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize:11, color:'#6b7c93', fontWeight:600 }}>Total Fares</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#1a2e3d' }}>SAR {totalFares.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
        </div>
        <div style={{ background:'#fff', borderRadius:10, padding:'10px 16px', flex:1, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize:11, color:'#6b7c93', fontWeight:600 }}>Commission</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#2e7d32' }}>SAR {totalComm.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
        </div>
      </div>

      {/* Table */}
      <div style={{ background:'#fff', borderRadius:14, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', overflow:'hidden' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:50, color:'#aab2bd', fontSize:14 }}>Loading tickets...</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#f8fafd' }}>
                  {['Date','Ticket #','Passenger','Customer','Airline','Route','Class','Type','Fare (SAR)','Commission','Status'].map(h => (
                    <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:11, color:'#6b7c93', fontWeight:700, whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={11} style={{ textAlign:'center', padding:50, color:'#aab2bd', fontSize:14 }}>
                    No tickets found. Use "+ New Ticket" to add manually, or import from Amadeus.
                  </td></tr>
                ) : filtered.map(t => (
                  <tr key={t.id} style={{ borderTop:'1px solid #f0f4f8' }}>
                    <td style={{ padding:'9px 12px', fontSize:12 }}>{t.ticket_date}</td>
                    <td style={{ padding:'9px 12px', fontSize:12, fontWeight:700, color:'#1565c0' }}>{t.ticket_number}</td>
                    <td style={{ padding:'9px 12px', fontSize:12 }}>{t.passenger_name||'-'}</td>
                    <td style={{ padding:'9px 12px', fontSize:12 }}>{t.customers?.name_en||'-'}</td>
                    <td style={{ padding:'9px 12px', fontSize:12, fontWeight:600 }}>{t.airlines?.airline_code||'-'}</td>
                    <td style={{ padding:'9px 12px', fontSize:12 }}>{t.routing||'-'}</td>
                    <td style={{ padding:'9px 12px', fontSize:12, textAlign:'center' }}>{t.class||'-'}</td>
                    <td style={{ padding:'9px 12px', fontSize:11 }}>{t.ticket_type}</td>
                    <td style={{ padding:'9px 12px', fontSize:13, fontWeight:700 }}>SAR {(t.ticket_value||0).toFixed(2)}</td>
                    <td style={{ padding:'9px 12px', fontSize:13, fontWeight:700, color:'#2e7d32' }}>SAR {(t.earned_commission||0).toFixed(2)}</td>
                    <td style={{ padding:'9px 12px' }}>
                      <span style={S.badge(STATUS_COLORS[t.ticket_status]||'#9e9e9e')}>{t.ticket_status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New Ticket Modal — now properly passed onClose */}
      {showModal && (
        <NewTicket
          entityId={entityId}
          entityCode={entityCode}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}
