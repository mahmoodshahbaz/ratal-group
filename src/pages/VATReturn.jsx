import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.Accounting
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// VAT Return — ZATCA Saudi Arabia
// Standard rate: 15%
// Period: Monthly or Quarterly
//
// Output VAT  = VAT collected on sales (invoices)
// Input VAT   = VAT paid on purchases (purchase_orders + expenses)
// Net Payable = Output - Input
// ═══════════════════════════════════════════════════════════════════

const SAR  = v  => `SAR ${(+v || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct  = v  => `${(+v || 0).toFixed(1)}%`
const fmt  = d  => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'18px 22px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:14 },
  btn:   (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 18px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  btnO:  (c='#1a2e3d') => ({ background:'transparent', color:c, border:`1.5px solid ${c}`, borderRadius:8, padding:'7px 17px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:   { padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff' },
  lbl:   { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
  row:   (highlight) => ({ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #f0f4f8', background: highlight ? '#f0f4f8' : 'transparent', padding: highlight ? '8px 10px' : '8px 0', borderRadius: highlight ? 6 : 0, marginBottom: highlight ? 2 : 0 }),
}

// ─── Period helpers ────────────────────────────────────────────────────────────
function getPeriodDates(year, period, type) {
  if (type === 'month') {
    const from = `${year}-${String(period).padStart(2,'0')}-01`
    const last = new Date(year, period, 0).getDate()
    const to   = `${year}-${String(period).padStart(2,'0')}-${last}`
    return { from, to, label: `${new Date(year, period-1, 1).toLocaleString('en', { month:'long' })} ${year}` }
  } else {
    // Quarterly: Q1=Jan-Mar, Q2=Apr-Jun, Q3=Jul-Sep, Q4=Oct-Dec
    const QM = { 1:[1,3], 2:[4,6], 3:[7,9], 4:[10,12] }
    const [mFrom, mTo] = QM[period]
    const from = `${year}-${String(mFrom).padStart(2,'0')}-01`
    const last = new Date(year, mTo, 0).getDate()
    const to   = `${year}-${String(mTo).padStart(2,'0')}-${last}`
    return { from, to, label: `Q${period} ${year}` }
  }
}

function getMonthsInPeriod(year, period, type) {
  if (type === 'month') {
    return [{ m: period, label: new Date(year, period-1, 1).toLocaleString('en', { month:'short' }) }]
  }
  const QM = { 1:[1,2,3], 2:[4,5,6], 3:[7,8,9], 4:[10,11,12] }
  return QM[period].map(m => ({ m, label: new Date(year, m-1, 1).toLocaleString('en', { month:'short' }) }))
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function VATReturn({ entityId, entityCode }) {
  const now = new Date()
  const [year,      setYear]      = useState(now.getFullYear())
  const [period,    setPeriod]    = useState(now.getMonth() + 1)   // 1-12 for month, 1-4 for quarter
  const [type,      setType]      = useState('month')              // month | quarter
  const [data,      setData]      = useState(null)
  const [loading,   setLoading]   = useState(false)
  const [entityName, setEntityName] = useState('')
  const [vatNo,     setVatNo]     = useState('')

  useEffect(() => {
    if (entityId) {
      supabase.from('entities').select('entity_name').eq('id', entityId).single()
        .then(({ data:e }) => e && setEntityName(e.entity_name))
      supabase.from('entity_settings').select('vat_number, company_name_en').eq('entity_id', entityId).single()
        .then(({ data:s }) => { if (s) { setVatNo(s.vat_number || ''); if (s.company_name_en) setEntityName(s.company_name_en) } })
    }
  }, [entityId])

  async function load() {
    if (!entityId) return
    setLoading(true)
    const { from, to } = getPeriodDates(year, period, type)
    const months = getMonthsInPeriod(year, period, type)

    try {
      // ── Output VAT: from invoices (ISSUED + PAID = taxable supply) ──
      const { data: invData } = await supabase
        .from('invoices')
        .select('invoice_date, subtotal, vat_amount, vat_rate, total_amount, status')
        .eq('entity_id', entityId)
        .gte('invoice_date', from)
        .lte('invoice_date', to)
        .in('status', ['ISSUED', 'PAID'])

      // ── Input VAT: from incoming_pos (client POs received) ──
      // incoming_pos tracks client PO value; VAT estimated at 15%
      const { data: poData } = await supabase
        .from('incoming_pos')
        .select('created_at, total_value, status')
        .eq('entity_id', entityId)
        .gte('created_at', from)
        .lte('created_at', to + 'T23:59:59')
        .in('status', ['ACTIVE','INVOICED','CLOSED'])

      // ── Input VAT: from expenses ──
      const { data: expData } = await supabase
        .from('expenses')
        .select('expense_date, amount, vat_amount')
        .eq('entity_id', entityId)
        .gte('expense_date', from)
        .lte('expense_date', to)

      const invRows = invData || []
      const poRows  = poData  || []
      const expRows = expData || []

      // Output breakdowns
      const standardInvoices = invRows.filter(r => (+r.vat_rate || 0) > 0)
      const zeroRatedInvoices = invRows.filter(r => (+r.vat_rate || 0) === 0)

      const outputStandardSales = standardInvoices.reduce((s, r) => s + (+r.subtotal || 0), 0)
      const outputVAT           = standardInvoices.reduce((s, r) => s + (+r.vat_amount || 0), 0)
      const outputZeroSales     = zeroRatedInvoices.reduce((s, r) => s + (+r.subtotal || 0), 0)
      const totalOutputSales    = outputStandardSales + outputZeroSales

      // Input breakdowns
      // incoming_pos: total_value is total incl. VAT; back-calculate base and VAT
      const poVAT              = poRows.reduce((s, r) => s + ((+r.total_value || 0) / 1.15 * 0.15), 0)
      const expVAT             = expRows.reduce((s, r) => s + (+r.vat_amount || 0), 0)
      const totalInputVAT      = poVAT + expVAT
      const poInputBase        = poRows.reduce((s, r) => s + ((+r.total_value || 0) / 1.15), 0)
      const expInputBase       = expRows.reduce((s, r) => s + (+r.amount || 0), 0)
      const totalInputBase     = poInputBase + expInputBase

      // Net
      const netVATPayable = outputVAT - totalInputVAT

      // Monthly breakdown
      const monthly = months.map(({ m, label }) => {
        const mStr = String(m).padStart(2,'0')
        const mInv  = invRows.filter(r => r.invoice_date?.slice(5,7) === mStr)
        const mPO   = poRows.filter(r => r.created_at?.slice(5,7) === mStr)
        const mExp  = expRows.filter(r => r.expense_date?.slice(5,7) === mStr)
        const mOut  = mInv.reduce((s,r) => s + (+r.vat_amount || 0), 0)
        const mIn   = mPO.reduce((s,r) => s + ((+r.total_value || 0) / 1.15 * 0.15), 0) +
                      mExp.reduce((s,r) => s + (+r.vat_amount || 0), 0)
        return { label, invoices: mInv.length, outputVAT: mOut, inputVAT: mIn, net: mOut - mIn }
      })

      const { from: pFrom, to: pTo, label: periodLabel } = getPeriodDates(year, period, type)

      setData({
        periodLabel, from: pFrom, to: pTo,
        // Output
        outputStandardSales, outputVAT, outputZeroSales, totalOutputSales,
        invoiceCount: invRows.length,
        // Input
        poInputBase, expInputBase, totalInputBase,
        poVAT, expVAT, totalInputVAT,
        poCount:  poRows.length,
        expCount: expRows.length,
        // Net
        netVATPayable,
        // Monthly
        monthly,
      })
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  function exportCSV() {
    if (!data) return
    const lines = [
      ['Ratal Group — VAT Return'],
      [`Entity: ${entityName}`, `VAT No: ${vatNo}`, `Period: ${data.periodLabel}`],
      [],
      ['SECTION', 'DESCRIPTION', 'BASE (SAR)', 'VAT (SAR)'],
      ['OUTPUT', 'Standard-rated sales (15%)', data.outputStandardSales.toFixed(2), data.outputVAT.toFixed(2)],
      ['OUTPUT', 'Zero-rated sales',            data.outputZeroSales.toFixed(2),    '0.00'],
      ['OUTPUT', 'TOTAL OUTPUT',                data.totalOutputSales.toFixed(2),   data.outputVAT.toFixed(2)],
      [],
      ['INPUT', 'Purchase Orders (VAT paid)',   data.poInputBase.toFixed(2),        data.poVAT.toFixed(2)],
      ['INPUT', 'Expenses (VAT paid)',           data.expInputBase.toFixed(2),       data.expVAT.toFixed(2)],
      ['INPUT', 'TOTAL INPUT',                  data.totalInputBase.toFixed(2),     data.totalInputVAT.toFixed(2)],
      [],
      ['NET', 'VAT PAYABLE TO ZATCA', '', data.netVATPayable.toFixed(2)],
    ]
    const blob = new Blob([lines.map(r => r.join(',')).join('\n')], { type:'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `VAT-Return-${entityCode}-${data.periodLabel.replace(/ /g,'-')}.csv`
    a.click()
  }

  function printReport() {
    if (!data) return
    const win = window.open('', '_blank', 'width=800,height:1000')
    win.document.write(`<!DOCTYPE html><html><head>
      <title>VAT Return — ${entityName} — ${data.periodLabel}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #1a2e3d; direction: ltr; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .meta { font-size: 12px; color: #666; margin-bottom: 28px; }
        .section-title { font-size: 12px; font-weight: bold; color: #666; letter-spacing: 1px; text-transform: uppercase; margin: 20px 0 8px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
        th { text-align: left; font-size: 10px; color: #999; padding: 6px 10px; border-bottom: 1px solid #eee; }
        td { padding: 8px 10px; font-size: 12px; border-bottom: 1px solid #f5f5f5; }
        td.amt { text-align: right; font-weight: bold; }
        .total-row td { font-weight: bold; background: #f0f4f8; }
        .net-row td { font-size: 16px; font-weight: bold; background: #1a2e3d; color: #fff; padding: 12px 10px; }
        .net-row td.amt { font-size: 20px; }
        .footer { font-size: 10px; color: #aaa; margin-top: 40px; text-align: center; }
      </style>
    </head><body>
      <h1>VAT Return — ${data.periodLabel}</h1>
      <div class="meta">
        ${entityName} &nbsp;·&nbsp; VAT No: ${vatNo || 'N/A'} &nbsp;·&nbsp;
        Period: ${fmt(data.from)} to ${fmt(data.to)} &nbsp;·&nbsp;
        Printed: ${fmt(new Date().toISOString())}
      </div>

      <div class="section-title">Output Tax (Sales)</div>
      <table>
        <tr><th>Description</th><th>Documents</th><th style="text-align:right">Taxable Base (SAR)</th><th style="text-align:right">VAT Amount (SAR)</th></tr>
        <tr><td>Standard-rated sales (15%)</td><td>${data.invoiceCount}</td><td class="amt">${data.outputStandardSales.toFixed(2)}</td><td class="amt">${data.outputVAT.toFixed(2)}</td></tr>
        <tr><td>Zero-rated sales (0%)</td><td>—</td><td class="amt">${data.outputZeroSales.toFixed(2)}</td><td class="amt">0.00</td></tr>
        <tr class="total-row"><td colspan="2">Total Output VAT</td><td class="amt">${data.totalOutputSales.toFixed(2)}</td><td class="amt">${data.outputVAT.toFixed(2)}</td></tr>
      </table>

      <div class="section-title">Input Tax (Purchases)</div>
      <table>
        <tr><th>Description</th><th>Documents</th><th style="text-align:right">Taxable Base (SAR)</th><th style="text-align:right">VAT Reclaimable (SAR)</th></tr>
        <tr><td>Purchase Orders</td><td>${data.poCount}</td><td class="amt">${data.poInputBase.toFixed(2)}</td><td class="amt">${data.poVAT.toFixed(2)}</td></tr>
        <tr><td>Expenses</td><td>${data.expCount}</td><td class="amt">${data.expInputBase.toFixed(2)}</td><td class="amt">${data.expVAT.toFixed(2)}</td></tr>
        <tr class="total-row"><td colspan="2">Total Input VAT (Reclaimable)</td><td class="amt">${data.totalInputBase.toFixed(2)}</td><td class="amt">${data.totalInputVAT.toFixed(2)}</td></tr>
      </table>

      <table style="margin-top:16px">
        <tr class="net-row">
          <td>NET VAT PAYABLE TO ZATCA</td>
          <td></td>
          <td></td>
          <td class="amt" style="color:${data.netVATPayable >= 0 ? '#fff' : '#90ee90'}">${data.netVATPayable.toFixed(2)}</td>
        </tr>
      </table>

      <div class="footer">This report is generated from Ratal Group system. Verify with your tax advisor before filing with ZATCA.</div>
      <script>window.onload = function() { window.print() }<\/script>
    </body></html>`)
    win.document.close()
  }

  const MONTHS = [
    {v:1,l:'January'},{v:2,l:'February'},{v:3,l:'March'},{v:4,l:'April'},
    {v:5,l:'May'},{v:6,l:'June'},{v:7,l:'July'},{v:8,l:'August'},
    {v:9,l:'September'},{v:10,l:'October'},{v:11,l:'November'},{v:12,l:'December'},
  ]
  const YEARS  = [2023,2024,2025,2026,2027]
  const QTRS   = [{v:1,l:'Q1 — Jan·Feb·Mar'},{v:2,l:'Q2 — Apr·May·Jun'},{v:3,l:'Q3 — Jul·Aug·Sep'},{v:4,l:'Q4 — Oct·Nov·Dec'}]

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>
        ZATCA VAT Return — Output Tax (Sales) minus Input Tax (Purchases) = Net Payable
      </div>

      {/* Period selector */}
      <div style={{ ...S.card, display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div>
          <label style={S.lbl}>Period Type</label>
          <div style={{ display:'flex', gap:0, borderRadius:8, overflow:'hidden', border:'1.5px solid #dde3ec' }}>
            {[['month','Monthly'],['quarter','Quarterly']].map(([v,l]) => (
              <button key={v} onClick={() => { setType(v); setPeriod(v==='month' ? now.getMonth()+1 : Math.ceil((now.getMonth()+1)/3)) }} style={{
                padding:'7px 18px', border:'none', cursor:'pointer', fontWeight:700, fontSize:12,
                background: type===v ? '#1a2e3d' : '#fff', color: type===v ? '#fff' : '#6b7c93',
              }}>{l}</button>
            ))}
          </div>
        </div>

        <div>
          <label style={S.lbl}>Year</label>
          <select value={year} onChange={e => setYear(+e.target.value)} style={S.inp}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div>
          <label style={S.lbl}>{type === 'month' ? 'Month' : 'Quarter'}</label>
          <select value={period} onChange={e => setPeriod(+e.target.value)} style={S.inp}>
            {(type === 'month' ? MONTHS : QTRS).map(p => (
              <option key={p.v} value={p.v}>{p.l}</option>
            ))}
          </select>
        </div>

        <button style={S.btn()} onClick={load} disabled={loading}>
          {loading ? 'Loading…' : '↻ Calculate'}
        </button>

        {data && (
          <>
            <button style={S.btnO()} onClick={exportCSV}>⬇ CSV</button>
            <button style={S.btnO('#1565C0')} onClick={printReport}>🖨 Print / PDF</button>
          </>
        )}
      </div>

      {!data && !loading && (
        <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>
          <div style={{ fontSize:36, marginBottom:10 }}>📊</div>
          <div style={{ fontWeight:700 }}>Select a period and click Calculate</div>
        </div>
      )}

      {loading && (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Calculating VAT return…</div>
      )}

      {data && (
        <>
          {/* Header */}
          <div style={{ ...S.card, background:'linear-gradient(135deg, #1a2e3d 0%, #1565C0 100%)', color:'#fff' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:18 }}>{entityName}</div>
                <div style={{ fontSize:12, opacity:0.7, marginTop:2 }}>
                  VAT No: {vatNo || 'Not set'} &nbsp;·&nbsp; Period: {data.periodLabel}
                </div>
                <div style={{ fontSize:11, opacity:0.6, marginTop:2 }}>
                  {fmt(data.from)} — {fmt(data.to)}
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:11, opacity:0.6, marginBottom:4 }}>NET VAT PAYABLE</div>
                <div style={{ fontWeight:800, fontSize:32, color: data.netVATPayable >= 0 ? '#fff' : '#81c784' }}>
                  {SAR(Math.abs(data.netVATPayable))}
                </div>
                <div style={{ fontSize:11, opacity:0.7 }}>
                  {data.netVATPayable < 0 ? '← VAT Refund Due' : '→ Payable to ZATCA'}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

            {/* Output VAT */}
            <div style={S.card}>
              <div style={{ fontWeight:800, fontSize:14, color:'#2e7d32', marginBottom:12 }}>
                ➕ Output Tax (VAT Collected on Sales)
              </div>
              <div style={S.row(false)}>
                <span style={{ fontSize:13 }}>Standard-rated sales (15%)</span>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:10, color:'#aab2bd' }}>Base: {SAR(data.outputStandardSales)}</div>
                  <div style={{ fontWeight:700, color:'#2e7d32' }}>{SAR(data.outputVAT)}</div>
                </div>
              </div>
              <div style={S.row(false)}>
                <span style={{ fontSize:13, color:'#6b7c93' }}>Zero-rated sales (0%)</span>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:10, color:'#aab2bd' }}>Base: {SAR(data.outputZeroSales)}</div>
                  <div style={{ fontWeight:700, color:'#aab2bd' }}>SAR 0.00</div>
                </div>
              </div>
              <div style={{ marginTop:12, paddingTop:10, borderTop:'2px solid #e8f5e9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontWeight:800, color:'#1a2e3d' }}>Total Output VAT</span>
                <span style={{ fontWeight:800, fontSize:18, color:'#2e7d32' }}>{SAR(data.outputVAT)}</span>
              </div>
              <div style={{ fontSize:11, color:'#aab2bd', marginTop:6 }}>
                From {data.invoiceCount} invoice{data.invoiceCount !== 1 ? 's' : ''} in this period
              </div>
            </div>

            {/* Input VAT */}
            <div style={S.card}>
              <div style={{ fontWeight:800, fontSize:14, color:'#c62828', marginBottom:12 }}>
                ➖ Input Tax (VAT Paid on Purchases)
              </div>
              <div style={S.row(false)}>
                <span style={{ fontSize:13 }}>Purchase Orders ({data.poCount})</span>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:10, color:'#aab2bd' }}>Base: {SAR(data.poInputBase)}</div>
                  <div style={{ fontWeight:700, color:'#c62828' }}>{SAR(data.poVAT)}</div>
                </div>
              </div>
              <div style={S.row(false)}>
                <span style={{ fontSize:13 }}>Expenses ({data.expCount})</span>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:10, color:'#aab2bd' }}>Base: {SAR(data.expInputBase)}</div>
                  <div style={{ fontWeight:700, color:'#c62828' }}>{SAR(data.expVAT)}</div>
                </div>
              </div>
              <div style={{ marginTop:12, paddingTop:10, borderTop:'2px solid #ffebee', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontWeight:800, color:'#1a2e3d' }}>Total Input VAT</span>
                <span style={{ fontWeight:800, fontSize:18, color:'#c62828' }}>{SAR(data.totalInputVAT)}</span>
              </div>
              <div style={{ fontSize:11, color:'#aab2bd', marginTop:6 }}>
                {data.poCount} PO{data.poCount !== 1 ? 's' : ''} + {data.expCount} expense{data.expCount !== 1 ? 's' : ''}
              </div>
            </div>
          </div>

          {/* Net payable summary */}
          <div style={{ ...S.card, background: data.netVATPayable >= 0 ? '#1a2e3d' : '#1b5e20' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:15, color:'#fff' }}>
                  {data.netVATPayable >= 0 ? 'NET VAT PAYABLE TO ZATCA' : 'VAT REFUND DUE FROM ZATCA'}
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:4 }}>
                  Output VAT {SAR(data.outputVAT)} − Input VAT {SAR(data.totalInputVAT)}
                </div>
              </div>
              <div style={{ fontWeight:800, fontSize:28, color: data.netVATPayable >= 0 ? '#fff' : '#81c784' }}>
                {SAR(Math.abs(data.netVATPayable))}
              </div>
            </div>
          </div>

          {/* Monthly breakdown */}
          {data.monthly.length > 1 && (
            <div style={S.card}>
              <div style={{ fontWeight:800, fontSize:14, color:'#1a2e3d', marginBottom:12 }}>
                Monthly Breakdown — {data.periodLabel}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:`repeat(${data.monthly.length}, 1fr)`, gap:10 }}>
                {data.monthly.map(m => (
                  <div key={m.label} style={{ background:'#f8fafc', borderRadius:10, padding:'12px 14px', textAlign:'center' }}>
                    <div style={{ fontWeight:700, color:'#546e7a', marginBottom:8 }}>{m.label}</div>
                    <div style={{ fontSize:11, color:'#6b7c93', marginBottom:2 }}>Output VAT</div>
                    <div style={{ fontWeight:700, color:'#2e7d32', marginBottom:8 }}>{SAR(m.outputVAT)}</div>
                    <div style={{ fontSize:11, color:'#6b7c93', marginBottom:2 }}>Input VAT</div>
                    <div style={{ fontWeight:700, color:'#c62828', marginBottom:8 }}>{SAR(m.inputVAT)}</div>
                    <div style={{ fontWeight:800, borderTop:'1px solid #e0e7ef', paddingTop:8, color: m.net >= 0 ? '#1a2e3d' : '#2e7d32' }}>
                      {SAR(Math.abs(m.net))}
                      <div style={{ fontSize:9, color:'#aab2bd', fontWeight:400 }}>
                        {m.net >= 0 ? 'Payable' : 'Refund'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Calculation table */}
          <div style={S.card}>
            <div style={{ fontWeight:800, fontSize:14, marginBottom:12, color:'#1a2e3d' }}>Summary Table</div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#f0f4f8' }}>
                  {['Box','Description','Base (SAR)','Tax (SAR)'].map(h => (
                    <th key={h} style={{ padding:'9px 14px', textAlign: h.includes('SAR') ? 'right' : 'left', fontWeight:700, color:'#fff', background:MC, fontSize:10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { box:'1a', desc:'Standard-rated domestic sales',          base: data.outputStandardSales, tax: data.outputVAT,      color:'#2e7d32' },
                  { box:'1b', desc:'Zero-rated domestic sales',              base: data.outputZeroSales,     tax: 0,                   color:'#546e7a' },
                  { box:'2',  desc:'Total Output VAT (Output Tax)',          base: data.totalOutputSales,    tax: data.outputVAT,       color:'#2e7d32', bold:true },
                  { box:'3a', desc:'Standard-rated domestic purchases (PO)', base: data.poInputBase,         tax: data.poVAT,           color:'#c62828' },
                  { box:'3b', desc:'Other reclaimable purchases (Expenses)', base: data.expInputBase,        tax: data.expVAT,          color:'#c62828' },
                  { box:'4',  desc:'Total Input VAT (Reclaimable)',          base: data.totalInputBase,      tax: data.totalInputVAT,   color:'#c62828', bold:true },
                  { box:'5',  desc:'Net VAT Payable / (Refundable)',         base: null, tax: data.netVATPayable, color: data.netVATPayable >= 0 ? '#1a2e3d' : '#2e7d32', bold:true, highlight:true },
                ].map(r => (
                  <tr key={r.box} style={{ borderBottom:'1px solid #f5f5f5', background: r.highlight ? '#f0f4f8' : r.bold ? '#fafbfc' : '#fff' }}>
                    <td style={{ padding:'9px 14px', fontWeight:700, fontFamily:'monospace', color:'#aab2bd', width:50 }}>{r.box}</td>
                    <td style={{ padding:'9px 14px', fontWeight: r.bold ? 800 : 400 }}>{r.desc}</td>
                    <td style={{ padding:'9px 14px', textAlign:'right', color:'#546e7a' }}>
                      {r.base != null ? SAR(r.base) : ''}
                    </td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontWeight:800, color: r.color }}>
                      {SAR(r.tax)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop:12, fontSize:11, color:'#aab2bd' }}>
              ⚠ This report is based on system data. Always verify with your tax advisor before filing with ZATCA.
              {!vatNo && <span style={{ color:'#e65100', fontWeight:700 }}> VAT number not set — go to Settings to add it.</span>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
