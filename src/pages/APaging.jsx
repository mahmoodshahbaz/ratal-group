import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.Accounting
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// AP Aging Report (Creditors / Accounts Payable Aging)
// Outstanding purchase orders by age from request_date
// Buckets: Current (≤30d) | 31-60d | 61-90d | 91-120d | 120d+
// Groups by contractor/supplier
// ═══════════════════════════════════════════════════════════════════

const S = {
  card: { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:12 },
  btn:  (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  btnO: (c='#1a2e3d') => ({ background:'transparent', color:c, border:`1.5px solid ${c}`, borderRadius:8, padding:'7px 15px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:  { padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff' },
  lbl:  { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
}

const fmt  = n => (+n || 0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
const fmtD = d => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'
const today = () => new Date().toISOString().slice(0, 10)

// AP aging buckets — supplier balances are always "overdue" once past due
const BUCKETS = [
  { key:'b30',     label:'Current (≤30d)', days:[0,30],   color:'#2e7d32', bg:'#e8f5e9' },
  { key:'b60',     label:'31–60 Days',     days:[31,60],  color:'#f57c00', bg:'#fff8e1' },
  { key:'b90',     label:'61–90 Days',     days:[61,90],  color:'#e65100', bg:'#fff3e0' },
  { key:'b120',    label:'91–120 Days',    days:[91,120], color:'#c62828', bg:'#ffebee' },
  { key:'b120plus',label:'120+ Days',      days:[121,null],color:'#7b1fa2',bg:'#f3e5f5' },
]

function getBucket(age) {
  if (age <= 30)  return 'b30'
  if (age <= 60)  return 'b60'
  if (age <= 90)  return 'b90'
  if (age <= 120) return 'b120'
  return 'b120plus'
}

function AgingBar({ row, total }) {
  if (!total) return null
  return (
    <div style={{ height:6, borderRadius:3, overflow:'hidden', display:'flex', gap:1 }}>
      {BUCKETS.map(b => {
        const pct = row[b.key] / total * 100
        return pct > 0 ? (
          <div key={b.key} style={{ width:`${pct}%`, background:b.color }} title={`${b.label}: SAR ${fmt(row[b.key])}`} />
        ) : null
      })}
    </div>
  )
}

export default function APaging({ entityId, role }) {
  const [asOf,     setAsOf]     = useState(today())
  const [pos,      setPos]      = useState([])
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [expanded, setExpanded] = useState(null)
  const [sortBy,   setSortBy]   = useState('total')
  const [typeFilter, setTypeFilter] = useState('ALL')  // ALL | CONTRACTOR | SUPPLIER | SUBCON

  useEffect(() => { if (entityId) load() }, [entityId, asOf])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('outgoing_pos')
      .select(`
        id, entity_id, po_date, status, total_value, notes,
        contractors!supplier_id(id, contractor_name, contractor_code, vendor_type)
      `)
      .eq('entity_id', entityId)
      .in('status', ['APPROVED', 'ACTIVE', 'SUBMITTED', 'PARTIAL', 'COMPLETED'])
      .lte('po_date', asOf)
      .order('po_date', { ascending: true })

    setPos(data || [])
    setLoading(false)
  }

  const supplierRows = useMemo(() => {
    const asOfDate = new Date(asOf)
    const map = {}

    for (const po of pos) {
      const outstanding = +(po.total_value || 0)
      if (outstanding <= 0) continue

      const poDate   = new Date(po.po_date)
      const ageDays  = Math.floor((asOfDate - poDate) / 864e5)
      const bucket   = getBucket(ageDays)

      const con     = po.contractors
      const key     = con?.contractor_name || 'Unknown Supplier'
      const conType = con?.vendor_type || 'CONTRACTOR'

      if (typeFilter !== 'ALL' && conType !== typeFilter) continue

      if (!map[key]) {
        map[key] = {
          supplier: key,
          code:     con?.contractor_code || '—',
          type:     conType,
          b30:0, b60:0, b90:0, b120:0, b120plus:0,
          total:0,
          poCount:0,
          oldestDate: null,
          pos: [],
        }
      }

      map[key][bucket] += outstanding
      map[key].total   += outstanding
      map[key].poCount++
      map[key].pos.push({ ...po, outstanding, ageDays, bucket })

      if (!map[key].oldestDate || poDate < map[key].oldestDate) {
        map[key].oldestDate = poDate
      }
    }

    let rows = Object.values(map)
    rows.sort((a, b) => {
      if (sortBy === 'name')   return a.supplier.localeCompare(b.supplier)
      if (sortBy === 'oldest') return (a.oldestDate || 0) - (b.oldestDate || 0)
      return b.total - a.total
    })

    if (search) rows = rows.filter(r => r.supplier.toLowerCase().includes(search.toLowerCase()))
    return rows
  }, [pos, asOf, search, sortBy, typeFilter])

  const totals = useMemo(() => {
    const t = { b30:0, b60:0, b90:0, b120:0, b120plus:0, total:0 }
    for (const r of supplierRows) BUCKETS.forEach(b => { t[b.key] += r[b.key] })
    supplierRows.forEach(r => { t.total += r.total })
    return t
  }, [supplierRows])

  const criticalTotal = totals.b90 + totals.b120 + totals.b120plus

  function exportCSV() {
    const hdr  = ['Supplier','Code','Type','≤30d','31-60d','61-90d','91-120d','120d+','Total']
    const rows = supplierRows.map(r => [r.supplier, r.code, r.type, r.b30.toFixed(2), r.b60.toFixed(2), r.b90.toFixed(2), r.b120.toFixed(2), r.b120plus.toFixed(2), r.total.toFixed(2)])
    rows.push(['TOTAL','','', totals.b30.toFixed(2), totals.b60.toFixed(2), totals.b90.toFixed(2), totals.b120.toFixed(2), totals.b120plus.toFixed(2), totals.total.toFixed(2)])
    const blob = new Blob([[hdr, ...rows].map(r => r.join(',')).join('\n')], { type:'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `ap-aging-${asOf}.csv`; a.click()
  }

  function printReport() {
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>AP Aging — ${asOf}</title>
    <style>body{font-family:Arial,sans-serif;padding:28px;font-size:11px}
    h2{font-size:16px;margin-bottom:2px}p{color:#666;margin:0 0 14px}
    table{width:100%;border-collapse:collapse}
    th{background:#1a2e3d;color:#fff;padding:7px 10px;text-align:right;font-size:10px}
    th:first-child,th:nth-child(2),th:nth-child(3){text-align:left}
    td{padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right}
    td:first-child,td:nth-child(2),td:nth-child(3){text-align:left}
    .tot{background:#1a2e3d;color:#fff;font-weight:700}
    @media print{@page{size:A4 landscape;margin:1cm}}</style></head><body>
    <h2>AP Aging Report — As of ${fmtD(asOf)}</h2>
    <p>${supplierRows.length} suppliers · Total Payable: SAR ${fmt(totals.total)}</p>
    <table>
      <tr><th>Supplier</th><th>Code</th><th>Type</th><th>≤30d</th><th>31–60d</th><th>61–90d</th><th>91–120d</th><th>120d+</th><th>Total</th></tr>
      ${supplierRows.map(r => `<tr>
        <td>${r.supplier}</td><td>${r.code}</td><td>${r.type}</td>
        <td>${r.b30 ? fmt(r.b30):'—'}</td><td>${r.b60 ? fmt(r.b60):'—'}</td>
        <td>${r.b90 ? fmt(r.b90):'—'}</td><td>${r.b120 ? fmt(r.b120):'—'}</td>
        <td>${r.b120plus ? fmt(r.b120plus):'—'}</td><td><b>${fmt(r.total)}</b></td></tr>`).join('')}
      <tr class="tot"><td colspan="3">TOTAL</td><td>${fmt(totals.b30)}</td><td>${fmt(totals.b60)}</td>
        <td>${fmt(totals.b90)}</td><td>${fmt(totals.b120)}</td><td>${fmt(totals.b120plus)}</td><td>${fmt(totals.total)}</td></tr>
    </table>
    <script>window.onload=()=>window.print()<\/script></body></html>`)
    w.document.close()
  }

  const TYPE_OPTS = ['ALL', 'CONTRACTOR', 'SUPPLIER', 'SUBCON']

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>
        Outstanding purchase order balances by age — creditors/suppliers analysis
      </div>

      {/* Controls */}
      <div style={{ ...S.card, display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div>
          <label style={S.lbl}>As of Date</label>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} style={S.inp} />
        </div>
        <div>
          <label style={S.lbl}>Party Type</label>
          <div style={{ display:'flex', borderRadius:7, overflow:'hidden', border:'1.5px solid #dde3ec' }}>
            {TYPE_OPTS.map(t => (
              <button key={t} onClick={() => setTypeFilter(t)} style={{
                padding:'6px 10px', fontSize:10, fontWeight:700, border:'none', cursor:'pointer',
                background: typeFilter === t ? '#1a2e3d' : '#fff',
                color: typeFilter === t ? '#fff' : '#6b7c93',
              }}>{t}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={S.lbl}>Sort</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={S.inp}>
            <option value="total">Highest Balance</option>
            <option value="name">Supplier Name</option>
            <option value="oldest">Oldest PO First</option>
          </select>
        </div>
        <input placeholder="Search supplier…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.inp, width:160 }} />
        <button style={S.btnO()} onClick={exportCSV}>⬇ CSV</button>
        <button style={S.btnO('#2e7d32')} onClick={printReport}>🖨 Print</button>
        <button style={S.btn()} onClick={load} disabled={loading}>↻ Refresh</button>
      </div>

      {/* Bucket summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8, marginBottom:14 }}>
        {BUCKETS.map(b => (
          <div key={b.key} style={{ background:b.bg, border:`1.5px solid ${b.color}44`, borderRadius:12, padding:'10px 12px', textAlign:'center' }}>
            <div style={{ fontSize:9, fontWeight:700, color:b.color, marginBottom:3 }}>{b.label}</div>
            <div style={{ fontSize:13, fontWeight:800, color:b.color }}>{fmt(totals[b.key])}</div>
            <div style={{ fontSize:9, color:'#aab2bd', marginTop:2 }}>
              {totals.total ? `${Math.round(totals[b.key]/totals.total*100)}%` : '0%'}
            </div>
          </div>
        ))}
        <div style={{ background:'#f0f4f8', border:'1.5px solid #37474f44', borderRadius:12, padding:'10px 12px', textAlign:'center' }}>
          <div style={{ fontSize:9, fontWeight:700, color:'#37474f', marginBottom:3 }}>TOTAL</div>
          <div style={{ fontSize:13, fontWeight:800, color:'#1a2e3d' }}>{fmt(totals.total)}</div>
          <div style={{ fontSize:9, color:'#c62828', marginTop:2 }}>
            {supplierRows.length} parties
          </div>
        </div>
      </div>

      {/* Critical alert */}
      {criticalTotal > 0 && (
        <div style={{ ...S.card, background:'#fce4ec', border:'1.5px solid #f48fb1', display:'flex', gap:12, alignItems:'center' }}>
          <span style={{ fontSize:22 }}>🔴</span>
          <div>
            <div style={{ fontWeight:800, color:'#c62828', fontSize:13 }}>
              SAR {fmt(criticalTotal)} overdue beyond 60 days
            </div>
            <div style={{ fontSize:11, color:'#795548', marginTop:2 }}>
              {supplierRows.filter(r => r.b120plus > 0).length > 0 &&
                `${supplierRows.filter(r => r.b120plus > 0).length} suppliers have POs over 120 days old. Immediate attention required.`}
            </div>
          </div>
        </div>
      )}

      {/* Main table */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading AP aging…</div>
      ) : supplierRows.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:50, color:'#aab2bd' }}>No outstanding purchase orders</div>
      ) : (
        <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700 }}>Supplier / Contractor</th>
                <th style={{ padding:'10px 8px', textAlign:'left', fontSize:10, fontWeight:700 }}>Code</th>
                <th style={{ padding:'10px 8px', textAlign:'center', fontSize:10, fontWeight:700 }}>Type</th>
                {BUCKETS.map(b => (
                  <th key={b.key} style={{ padding:'10px 8px', textAlign:'right', fontSize:10, fontWeight:700, color:`${b.color}cc` }}>{b.label}</th>
                ))}
                <th style={{ padding:'10px 14px', textAlign:'right', fontSize:10, fontWeight:700 }}>Total</th>
                <th style={{ padding:'10px 8px', textAlign:'center', fontSize:10, fontWeight:700 }}>POs</th>
                <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700 }}>Bar</th>
              </tr>
            </thead>
            <tbody>
              {supplierRows.map((row, i) => (
                <>
                  <tr
                    key={row.supplier}
                    onClick={() => setExpanded(expanded === row.supplier ? null : row.supplier)}
                    style={{ borderBottom: expanded === row.supplier ? 'none' : '1px solid #f5f5f5', background: i%2===0 ? '#fff' : '#fafbfc', cursor:'pointer' }}
                  >
                    <td style={{ padding:'9px 14px', fontWeight:700, color:'#1a2e3d' }}>
                      <span style={{ marginRight:6, fontSize:10, color:'#aab2bd' }}>
                        {expanded === row.supplier ? '▼' : '▶'}
                      </span>
                      {row.supplier}
                    </td>
                    <td style={{ padding:'9px 8px', fontFamily:'monospace', fontSize:11, color:'#546e7a' }}>{row.code}</td>
                    <td style={{ padding:'9px 8px', textAlign:'center' }}>
                      <span style={{ background:'#1a2e3d18', color:'#1a2e3d', borderRadius:6, padding:'2px 7px', fontSize:9, fontWeight:700 }}>{row.type}</span>
                    </td>
                    {BUCKETS.map(b => (
                      <td key={b.key} style={{ padding:'9px 8px', textAlign:'right', fontFamily:'monospace', color: row[b.key] ? b.color : '#e0e0e0', fontWeight: row[b.key] ? 700 : 400 }}>
                        {row[b.key] ? fmt(row[b.key]) : '—'}
                      </td>
                    ))}
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color:'#1a2e3d' }}>{fmt(row.total)}</td>
                    <td style={{ padding:'9px 8px', textAlign:'center', color:'#6b7c93' }}>{row.poCount}</td>
                    <td style={{ padding:'9px 14px', minWidth:80 }}><AgingBar row={row} total={row.total} /></td>
                  </tr>

                  {expanded === row.supplier && (
                    <tr key={`${row.supplier}-detail`} style={{ background:'#f8fafe' }}>
                      <td colSpan={10} style={{ padding:'0 14px 12px 32px' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                          <thead>
                            <tr style={{ borderBottom:'1px solid #e0e0e0' }}>
                              {['PO Date','Department','Ref / PO #','Status','Age (days)','Total Amount','Bucket'].map(h => (
                                <th key={h} style={{ padding:'5px 8px', textAlign:['Total Amount','Age (days)'].includes(h)?'right':'left', fontWeight:700, color:'#6b7c93', fontSize:10 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {row.pos.map(po => {
                              const bDef = BUCKETS.find(b => b.key === po.bucket)
                              return (
                                <tr key={po.id} style={{ borderBottom:'1px solid #f0f0f0' }}>
                                  <td style={{ padding:'5px 8px', color:'#6b7c93' }}>{fmtD(po.po_date)}</td>
                                  <td style={{ padding:'5px 8px' }}>{po.department || '—'}</td>
                                  <td style={{ padding:'5px 8px', fontWeight:700, color:'#5A32D4' }}>{po.id.slice(0,8)}</td>
                                  <td style={{ padding:'5px 8px' }}>
                                    <span style={{ background:'#e3f2fd', color:'#0277bd', padding:'1px 7px', borderRadius:5, fontSize:10, fontWeight:700 }}>{po.status}</span>
                                  </td>
                                  <td style={{ padding:'5px 8px', textAlign:'right', color: po.ageDays > 60 ? '#c62828' : '#2e7d32', fontWeight:700 }}>{po.ageDays}d</td>
                                  <td style={{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace', fontWeight:700 }}>{fmt(po.outstanding)}</td>
                                  <td style={{ padding:'5px 8px' }}>
                                    <span style={{ background:bDef?.bg, color:bDef?.color, padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700 }}>{bDef?.label}</span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                <td colSpan={3} style={{ padding:'11px 14px', fontWeight:800, fontSize:13 }}>TOTAL ({supplierRows.length} parties)</td>
                {BUCKETS.map(b => (
                  <td key={b.key} style={{ padding:'11px 8px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color: totals[b.key] ? '#ef9a9a' : 'rgba(255,255,255,0.25)' }}>
                    {totals[b.key] ? fmt(totals[b.key]) : '—'}
                  </td>
                ))}
                <td style={{ padding:'11px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800 }}>{fmt(totals.total)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div style={{ marginTop:10, fontSize:11, color:'#aab2bd' }}>
        Only APPROVED and ACTIVE purchase orders included. Age calculated from PO request date.
        CLOSED / REJECTED / DRAFT POs are excluded. Click a supplier row to expand individual POs.
      </div>
    </div>
  )
}
