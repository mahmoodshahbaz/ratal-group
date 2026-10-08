import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.Accounting
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// AR Aging Report (Debtors Aging) — ACCSYS
// Outstanding invoices bucketed by age from due_date (or invoice_date + 30d)
// Paid amounts sourced from payment_allocations table
// Buckets: Current | 1-30d | 31-60d | 61-90d | 91-120d | 120d+
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

const BUCKETS = [
  { key:'current',  label:'Current',     color:'#2e7d32', bg:'#e8f5e9' },
  { key:'b30',      label:'1–30 Days',   color:'#f57c00', bg:'#fff8e1' },
  { key:'b60',      label:'31–60 Days',  color:'#e65100', bg:'#fff3e0' },
  { key:'b90',      label:'61–90 Days',  color:'#c62828', bg:'#ffebee' },
  { key:'b120',     label:'91–120 Days', color:'#b71c1c', bg:'#ffcdd2' },
  { key:'b120plus', label:'120+ Days',   color:'#7b1fa2', bg:'#f3e5f5' },
]

function getBucket(daysOverdue) {
  if (daysOverdue <= 0)   return 'current'
  if (daysOverdue <= 30)  return 'b30'
  if (daysOverdue <= 60)  return 'b60'
  if (daysOverdue <= 90)  return 'b90'
  if (daysOverdue <= 120) return 'b120'
  return 'b120plus'
}

function AgingBar({ row, total }) {
  if (!total) return null
  return (
    <div style={{ display:'flex', height:6, borderRadius:3, overflow:'hidden', gap:1 }}>
      {BUCKETS.map(b => {
        const pct = total ? (row[b.key] / total * 100) : 0
        return pct > 0 ? (
          <div key={b.key} style={{ width:`${pct}%`, background:b.color }} title={`${b.label}: SAR ${fmt(row[b.key])}`} />
        ) : null
      })}
    </div>
  )
}

export default function ARaging({ entityId }) {
  const [asOf,      setAsOf]      = useState(today())
  const [invoices,  setInvoices]  = useState([])   // enriched with paid_amount & contractor_name
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [expanded,  setExpanded]  = useState(null)
  const [showZero,  setShowZero]  = useState(false)
  const [sortBy,    setSortBy]    = useState('total')

  useEffect(() => { if (entityId) load() }, [entityId, asOf])

  async function load() {
    setLoading(true)

    // 1. Load all ISSUED invoices for this entity
    const { data: invData } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, due_date, contractor_id, total_amount, net_payable, po_number, status')
      .eq('entity_id', entityId)
      .in('status', ['ISSUED'])
      .lte('invoice_date', asOf)
      .order('invoice_date', { ascending: true })

    if (!invData || invData.length === 0) {
      setInvoices([])
      setLoading(false)
      return
    }

    // 2. Load payment allocations — only from receipts dated on or before asOf
    //    (so historical aging snapshots are accurate)
    //    Two-step: first get eligible receipt IDs, then get allocations for those receipts
    const invIds = invData.map(i => i.id)

    const { data: receiptData } = await supabase
      .from('payment_receipts')
      .select('id')
      .eq('entity_id', entityId)
      .lte('receipt_date', asOf)

    const eligibleReceiptIds = (receiptData || []).map(r => r.id)

    let allocData = []
    if (eligibleReceiptIds.length > 0) {
      const { data: ad } = await supabase
        .from('payment_allocations')
        .select('invoice_id, amount_allocated')
        .in('invoice_id', invIds)
        .in('receipt_id', eligibleReceiptIds)
      allocData = ad || []
    }

    // Sum paid per invoice (as of the selected date)
    const paidMap = {}
    ;(allocData).forEach(a => {
      paidMap[a.invoice_id] = (paidMap[a.invoice_id] || 0) + (a.amount_allocated || 0)
    })

    // 3. Load contractors for names
    const contractorIds = [...new Set(invData.map(i => i.contractor_id).filter(Boolean))]
    const { data: conData } = await supabase
      .from('contractors')
      .select('id, contractor_name, contractor_code')
      .in('id', contractorIds)

    const conMap = {}
    ;(conData || []).forEach(c => { conMap[c.id] = c })

    // 4. Enrich invoices
    const enriched = invData.map(inv => {
      const netPayable = inv.net_payable || inv.total_amount || 0
      const paidAmt    = paidMap[inv.id] || 0
      const outstanding = Math.max(0, netPayable - paidAmt)
      const con = conMap[inv.contractor_id] || {}
      return {
        ...inv,
        contractor_name: con.contractor_name || '—',
        net_payable:     netPayable,
        paid_amount:     paidAmt,
        outstanding,
      }
    })

    setInvoices(enriched)
    setLoading(false)
  }

  // Build per-customer rows with aging buckets
  const customerRows = useMemo(() => {
    const asOfDate = new Date(asOf)
    const map = {}

    for (const inv of invoices) {
      if (inv.outstanding <= 0.01) continue  // fully paid

      const dueDate = inv.due_date
        ? new Date(inv.due_date)
        : new Date(new Date(inv.invoice_date).getTime() + 30 * 86400000)

      const daysOverdue = Math.floor((asOfDate - dueDate) / 86400000)
      const bucket = getBucket(daysOverdue)
      const key = inv.contractor_name

      if (!map[key]) {
        map[key] = {
          customer: key,
          current:0, b30:0, b60:0, b90:0, b120:0, b120plus:0,
          total:0, invoiceCount:0, oldestDue:null, invoices:[],
        }
      }
      map[key][bucket]      += inv.outstanding
      map[key].total        += inv.outstanding
      map[key].invoiceCount++
      map[key].invoices.push({ ...inv, daysOverdue, bucket, dueDate })
      if (!map[key].oldestDue || dueDate < map[key].oldestDue) map[key].oldestDue = dueDate
    }

    let rows = Object.values(map)
    if (!showZero) rows = rows.filter(r => r.total > 0)

    rows.sort((a, b) => {
      if (sortBy === 'name')   return a.customer.localeCompare(b.customer)
      if (sortBy === 'oldest') return (a.oldestDue||0) - (b.oldestDue||0)
      return b.total - a.total
    })

    if (search) rows = rows.filter(r => r.customer.toLowerCase().includes(search.toLowerCase()))
    return rows
  }, [invoices, asOf, search, showZero, sortBy])

  // Grand totals
  const totals = useMemo(() => {
    const t = { current:0, b30:0, b60:0, b90:0, b120:0, b120plus:0, total:0 }
    for (const r of customerRows) {
      BUCKETS.forEach(b => { t[b.key] += r[b.key] })
      t.total += r.total
    }
    return t
  }, [customerRows])

  const overdueTotal = totals.b30 + totals.b60 + totals.b90 + totals.b120 + totals.b120plus

  function exportCSV() {
    const header = ['Customer','Current','1-30d','31-60d','61-90d','91-120d','120d+','Total Outstanding']
    const rows = customerRows.map(r => [
      r.customer, r.current.toFixed(2), r.b30.toFixed(2), r.b60.toFixed(2),
      r.b90.toFixed(2), r.b120.toFixed(2), r.b120plus.toFixed(2), r.total.toFixed(2)
    ])
    rows.push(['TOTAL',
      totals.current.toFixed(2), totals.b30.toFixed(2), totals.b60.toFixed(2),
      totals.b90.toFixed(2), totals.b120.toFixed(2), totals.b120plus.toFixed(2), totals.total.toFixed(2)
    ])
    const blob = new Blob([[header, ...rows].map(r => r.join(',')).join('\n')], { type:'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `ar-aging-${asOf}.csv`; a.click()
  }

  function printReport() {
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>AR Aging — ${asOf}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:24px;font-size:11px}
      h2{font-size:16px;margin-bottom:4px}p{color:#666;margin:0 0 12px}
      table{width:100%;border-collapse:collapse}
      th{background:#1a2e3d;color:#fff;padding:7px 10px;text-align:right;font-size:10px}
      th:first-child{text-align:left}
      td{padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right}
      td:first-child{text-align:left;font-weight:600}
      .tfoot td{background:#1a2e3d;color:#fff;font-weight:700}
      .ov{color:#c62828}
      @media print{@page{size:A4 landscape;margin:1cm}}
    </style></head><body>
    <h2>AR Aging Report — As of ${fmtD(asOf)}</h2>
    <p>${customerRows.length} customers · Total Outstanding: SAR ${fmt(totals.total)} · Overdue: SAR ${fmt(overdueTotal)}</p>
    <table>
      <tr><th>Customer</th><th>Current</th><th>1–30d</th><th>31–60d</th><th>61–90d</th><th>91–120d</th><th>120d+</th><th>Total</th></tr>
      ${customerRows.map(r => `<tr>
        <td>${r.customer}</td>
        <td>${r.current ? fmt(r.current) : '—'}</td>
        <td class="${r.b30?'ov':''}">${r.b30 ? fmt(r.b30) : '—'}</td>
        <td class="${r.b60?'ov':''}">${r.b60 ? fmt(r.b60) : '—'}</td>
        <td class="${r.b90?'ov':''}">${r.b90 ? fmt(r.b90) : '—'}</td>
        <td class="${r.b120?'ov':''}">${r.b120 ? fmt(r.b120) : '—'}</td>
        <td class="${r.b120plus?'ov':''}">${r.b120plus ? fmt(r.b120plus) : '—'}</td>
        <td><strong>${fmt(r.total)}</strong></td>
      </tr>`).join('')}
      <tr class="tfoot"><td>TOTAL (${customerRows.length})</td>
        <td>${fmt(totals.current)}</td><td>${fmt(totals.b30)}</td><td>${fmt(totals.b60)}</td>
        <td>${fmt(totals.b90)}</td><td>${fmt(totals.b120)}</td><td>${fmt(totals.b120plus)}</td>
        <td>${fmt(totals.total)}</td>
      </tr>
    </table>
    <script>window.onload=()=>window.print()<\/script></body></html>`)
    w.document.close()
  }

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>Outstanding invoice balances by age — debtors analysis</div>

      {/* ── Controls ── */}
      <div style={{ ...S.card, display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div>
          <label style={S.lbl}>As of Date</label>
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} style={S.inp} />
        </div>
        <div>
          <label style={S.lbl}>Sort By</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={S.inp}>
            <option value="total">Highest Balance</option>
            <option value="name">Customer Name</option>
            <option value="oldest">Oldest First</option>
          </select>
        </div>
        <input placeholder="Search customer…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.inp, width:200 }} />
        <div style={{ display:'flex', alignItems:'center', gap:6, paddingBottom:2 }}>
          <input type="checkbox" id="showZero" checked={showZero} onChange={e => setShowZero(e.target.checked)} />
          <label htmlFor="showZero" style={{ fontSize:11, cursor:'pointer', fontWeight:600 }}>Show zero balances</label>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button style={S.btnO()} onClick={exportCSV}>⬇ CSV</button>
          <button style={S.btnO('#2e7d32')} onClick={printReport}>🖨 Print</button>
          <button style={S.btn()} onClick={load} disabled={loading}>↻ Refresh</button>
        </div>
      </div>

      {/* ── Bucket KPI strip ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:8, marginBottom:14 }}>
        {BUCKETS.map(b => (
          <div key={b.key} style={{ background:b.bg, border:`1.5px solid ${b.color}44`, borderRadius:12, padding:'10px 12px', textAlign:'center' }}>
            <div style={{ fontSize:9, fontWeight:700, color:b.color, marginBottom:3 }}>{b.label}</div>
            <div style={{ fontSize:13, fontWeight:800, color:b.color }}>{fmt(totals[b.key])}</div>
            <div style={{ fontSize:9, color:'#aab2bd', marginTop:2 }}>
              {totals.total ? `${Math.round(totals[b.key] / totals.total * 100)}%` : '0%'}
            </div>
          </div>
        ))}
        <div style={{ background:'#f0f4f8', border:'1.5px solid #455a6444', borderRadius:12, padding:'10px 12px', textAlign:'center' }}>
          <div style={{ fontSize:9, fontWeight:700, color:'#455a64', marginBottom:3 }}>TOTAL</div>
          <div style={{ fontSize:14, fontWeight:800, color:'#1a2e3d' }}>{fmt(totals.total)}</div>
          <div style={{ fontSize:9, color:'#c62828', marginTop:2 }}>Overdue: {fmt(overdueTotal)}</div>
        </div>
      </div>

      {/* ── Overdue alert ── */}
      {overdueTotal > 0 && (
        <div style={{ ...S.card, background:'#fff3e0', border:'1.5px solid #ffb74d', display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
          <span style={{ fontSize:22 }}>⚠️</span>
          <div>
            <div style={{ fontWeight:800, color:'#e65100', fontSize:13 }}>
              SAR {fmt(overdueTotal)} overdue across {customerRows.filter(r => r.b30+r.b60+r.b90+r.b120+r.b120plus > 0).length} customers
            </div>
            {customerRows.filter(r => r.b120plus > 0).length > 0 && (
              <div style={{ fontSize:11, color:'#795548', marginTop:2 }}>
                ⚠️ {customerRows.filter(r => r.b120plus > 0).length} customer(s) have invoices over 120 days old — follow up urgently.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Main aging table ── */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading aging report…</div>
      ) : customerRows.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:50, color:'#aab2bd' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>✅</div>
          <div style={{ fontWeight:700, fontSize:14 }}>No outstanding invoices</div>
          <div style={{ fontSize:12, marginTop:4 }}>All invoices are paid or no invoices exist yet.</div>
        </div>
      ) : (
        <div style={{ ...S.card, padding:0, overflow:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, minWidth:900 }}>
            <thead>
              <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, minWidth:180 }}>Customer</th>
                {BUCKETS.map(b => (
                  <th key={b.key} style={{ padding:'10px 10px', textAlign:'right', fontSize:10, fontWeight:700, color: b.key==='current'?'#a5d6a7':'#ef9a9a' }}>
                    {b.label}
                  </th>
                ))}
                <th style={{ padding:'10px 14px', textAlign:'right', fontSize:10, fontWeight:700 }}>Total</th>
                <th style={{ padding:'10px 10px', textAlign:'center', fontSize:10, fontWeight:700 }}>Inv</th>
                <th style={{ padding:'10px 14px', textAlign:'left', fontSize:10, fontWeight:700, minWidth:100 }}>Aging</th>
              </tr>
            </thead>
            <tbody>
              {customerRows.map((row, i) => (
                <>
                  <tr key={row.customer}
                    onClick={() => setExpanded(expanded === row.customer ? null : row.customer)}
                    style={{ borderBottom: expanded===row.customer?'none':'1px solid #f5f5f5', background: i%2===0?'#fff':'#fafbfc', cursor:'pointer' }}>
                    <td style={{ padding:'9px 14px', fontWeight:700, color:'#1a2e3d' }}>
                      <span style={{ marginRight:6, fontSize:10, color:'#aab2bd' }}>{expanded===row.customer?'▼':'▶'}</span>
                      {row.customer}
                      {row.oldestDue && new Date(row.oldestDue) < new Date(asOf) && (
                        <span style={{ marginLeft:6, background:'#ffebee', color:'#c62828', fontSize:9, padding:'1px 5px', borderRadius:4, fontWeight:700 }}>OVERDUE</span>
                      )}
                    </td>
                    {BUCKETS.map(b => (
                      <td key={b.key} style={{ padding:'9px 10px', textAlign:'right', fontFamily:'monospace', color:row[b.key]?b.color:'#e0e0e0', fontWeight:row[b.key]?700:400 }}>
                        {row[b.key] ? fmt(row[b.key]) : '—'}
                      </td>
                    ))}
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color:'#1a2e3d' }}>{fmt(row.total)}</td>
                    <td style={{ padding:'9px 10px', textAlign:'center', color:'#6b7c93' }}>{row.invoiceCount}</td>
                    <td style={{ padding:'9px 14px', minWidth:100 }}><AgingBar row={row} total={row.total} /></td>
                  </tr>

                  {/* Expanded: per-invoice breakdown */}
                  {expanded === row.customer && (
                    <tr key={`${row.customer}-detail`} style={{ background:'#f8fafe' }}>
                      <td colSpan={10} style={{ padding:'0 14px 14px 36px' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                          <thead>
                            <tr style={{ borderBottom:'1px solid #e0e7ef' }}>
                              {['Invoice #','Invoice Date','Due Date','PO Ref','Invoice Total','Paid','Outstanding','Age','Bucket'].map(h => (
                                <th key={h} style={{ padding:'5px 8px', textAlign:['Invoice Total','Paid','Outstanding'].includes(h)?'right':'left', fontWeight:700, color:'#6b7c93', fontSize:10 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {row.invoices.sort((a,b) => b.daysOverdue - a.daysOverdue).map(inv => {
                              const bDef = BUCKETS.find(b => b.key === inv.bucket)
                              return (
                                <tr key={inv.id} style={{ borderBottom:'1px solid #f0f4f8' }}>
                                  <td style={{ padding:'5px 8px', fontWeight:800, color:'#1565c0', fontFamily:'monospace' }}>{inv.invoice_number}</td>
                                  <td style={{ padding:'5px 8px', color:'#6b7c93' }}>{fmtD(inv.invoice_date)}</td>
                                  <td style={{ padding:'5px 8px', color: inv.daysOverdue>0?'#c62828':'#2e7d32' }}>{fmtD(inv.due_date)}</td>
                                  <td style={{ padding:'5px 8px', color:'#6b7c93' }}>{inv.po_number||'—'}</td>
                                  <td style={{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace' }}>{fmt(inv.net_payable)}</td>
                                  <td style={{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace', color:'#2e7d32' }}>{inv.paid_amount>0?fmt(inv.paid_amount):'—'}</td>
                                  <td style={{ padding:'5px 8px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color:'#c62828' }}>{fmt(inv.outstanding)}</td>
                                  <td style={{ padding:'5px 8px', fontWeight:700, color: inv.daysOverdue>0?'#c62828':'#2e7d32' }}>
                                    {inv.daysOverdue>0 ? `+${inv.daysOverdue}d` : inv.daysOverdue<0 ? `${Math.abs(inv.daysOverdue)}d left` : 'Due today'}
                                  </td>
                                  <td style={{ padding:'5px 8px' }}>
                                    <span style={{ background:bDef?.bg, color:bDef?.color, padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700 }}>
                                      {bDef?.label}
                                    </span>
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
                <td style={{ padding:'11px 14px', fontWeight:800, fontSize:13 }}>TOTAL ({customerRows.length} customers)</td>
                {BUCKETS.map(b => (
                  <td key={b.key} style={{ padding:'11px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color: b.key==='current'?'#a5d6a7':totals[b.key]?'#ef9a9a':'rgba(255,255,255,0.3)' }}>
                    {totals[b.key] ? fmt(totals[b.key]) : '—'}
                  </td>
                ))}
                <td style={{ padding:'11px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800 }}>{fmt(totals.total)}</td>
                <td colSpan={2} style={{ padding:'11px 14px', textAlign:'center', color:'rgba(255,255,255,0.5)', fontSize:11 }}>
                  {invoices.filter(i=>i.outstanding>0.01).length} open invoices
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div style={{ marginTop:10, fontSize:11, color:'#aab2bd' }}>
        Due date: uses invoice <em>due_date</em> if set, otherwise <em>invoice_date + 30 days</em>.
        Paid amounts sourced from payment allocations. Click any customer row to expand invoices.
      </div>
    </div>
  )
}
