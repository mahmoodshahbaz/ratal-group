import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.Accounting
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// Cash Flow Statement — Direct Method
// Correct table names from actual schema:
//   payroll_runs     → run_date, total_net, status
//   food_allowances  → allowance_month (YYYY-MM), total_amount, status
//   overtime_requests→ ot_date, total_amount, status
//   expenses         → expense_date, amount, status
//   money_requests   → request_date, amount, status
//   payments         → payment_date, payment_type, amount
//   payment_receipts → receipt_date, net_received
// ═══════════════════════════════════════════════════════════════════

const S = {
  card: { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:10 },
  btn:  (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  btnO: (c='#1a2e3d') => ({ background:'transparent', color:c, border:`1.5px solid ${c}`, borderRadius:8, padding:'7px 15px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:  { padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff' },
  lbl:  { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
}

const fmt  = n => (+n||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
const fmtD = d => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'

function defaultRange() {
  const now  = new Date()
  const from = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
  const last = new Date(now.getFullYear(), now.getMonth()+1, 0)
  return { from, to: last.toISOString().slice(0,10) }
}

// Convert YYYY-MM-DD date range to list of YYYY-MM months (for food_allowances)
function monthsInRange(from, to) {
  const months = []
  let cur = new Date(from.slice(0,7) + '-01')
  const end = new Date(to.slice(0,7) + '-01')
  while (cur <= end) {
    months.push(cur.toISOString().slice(0,7))
    cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1)
  }
  return months
}

function SectionRow({ label, amount, sub=false, total=false }) {
  const pos = amount >= 0
  return (
    <tr style={{ borderBottom:'1px solid #f5f5f5', background:total?'#f0f4f8':'transparent' }}>
      <td style={{
        padding: sub ? '6px 14px 6px 32px' : total ? '9px 14px' : '7px 14px',
        fontSize: total ? 13 : 12, fontWeight: total ? 800 : sub ? 400 : 600,
        color: sub ? '#546e7a' : '#1a2e3d',
        paddingLeft: sub ? 32 : 14,
      }}>{label}</td>
      <td style={{
        padding: '7px 14px', textAlign:'right', fontFamily:'monospace',
        fontSize: total ? 14 : 12, fontWeight: total ? 800 : 600,
        color: total ? (pos?'#2e7d32':'#c62828') : sub ? (pos?'#2e7d32':'#c62828') : '#1a2e3d',
      }}>
        {amount !== null ? `${fmt(amount)} SAR` : ''}
      </td>
    </tr>
  )
}

export default function CashFlow({ entityId }) {
  const def = defaultRange()
  const [from,    setFrom]    = useState(def.from)
  const [to,      setTo]      = useState(def.to)
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [errors,  setErrors]  = useState([])

  useEffect(() => { if (entityId) load() }, [entityId, from, to])

  async function load() {
    setLoading(true)
    setErrors([])
    const errs = []
    const safe = async (label, promise) => {
      try { const res = await promise; return res.data || [] }
      catch (e) { errs.push(`${label}: ${e.message}`); return [] }
    }

    const months = monthsInRange(from, to)

    const [pmts, recpts, payrollRuns, exps, foodRows, otRows, moneyReqs] = await Promise.all([
      // Payments in/out
      safe('payments', supabase.from('payments').select('payment_type, amount')
        .eq('entity_id', entityId).gte('payment_date', from).lte('payment_date', to)),

      // Payment Receipts (cash received from contractors/clients — AR)
      safe('payment_receipts', supabase.from('payment_receipts').select('net_received')
        .eq('entity_id', entityId).gte('receipt_date', from).lte('receipt_date', to)),

      // Payroll runs — use run_date, total_net
      safe('payroll_runs', supabase.from('payroll_runs').select('total_net, status')
        .eq('entity_id', entityId).gte('run_date', from).lte('run_date', to)
        .in('status', ['DRAFT', 'APPROVED', 'PAID'])),

      // Expenses — expense_date, amount (base amount excl. VAT)
      safe('expenses', supabase.from('expenses').select('amount, status')
        .eq('entity_id', entityId).gte('expense_date', from).lte('expense_date', to)
        .in('status', ['APPROVED', 'PAID'])),

      // Food allowances — allowance_month (YYYY-MM), total_amount
      months.length > 0
        ? safe('food_allowances', supabase.from('food_allowances').select('total_amount, status')
            .eq('entity_id', entityId).in('allowance_month', months).in('status', ['APPROVED', 'PAID']))
        : Promise.resolve([]),

      // Overtime requests — ot_date, total_amount
      safe('overtime_requests', supabase.from('overtime_requests').select('total_amount, status')
        .eq('entity_id', entityId).gte('ot_date', from).lte('ot_date', to)
        .in('status', ['APPROVED', 'PAID'])),

      // Money requests — request_date, amount
      safe('money_requests', supabase.from('money_requests').select('amount, status')
        .eq('entity_id', entityId).gte('request_date', from).lte('request_date', to)
        .eq('status', 'PAID')),
    ])

    setErrors(errs)

    // ── Inflows ──────────────────────────────────────────────────
    const cashFromCustomers = pmts.filter(p => p.payment_type === 'CUSTOMER_PAYMENT').reduce((s,p) => s+(+p.amount||0), 0)
    const advances          = pmts.filter(p => p.payment_type === 'ADVANCE').reduce((s,p) => s+(+p.amount||0), 0)
    const otherInPmts       = pmts.filter(p => p.payment_type === 'OTHER').reduce((s,p) => s+(+p.amount||0), 0)
    const cashReceipts      = recpts.reduce((s,r) => s+(+r.net_received||0), 0)

    // ── Outflows ─────────────────────────────────────────────────
    const cashToAirlines    = pmts.filter(p => p.payment_type === 'AIRLINE_PAYMENT').reduce((s,p) => s+(+p.amount||0), 0)
    const refundsPaid       = pmts.filter(p => p.payment_type === 'REFUND').reduce((s,p) => s+(+p.amount||0), 0)
    const payrollPaid       = payrollRuns.reduce((s,r) => s+(+r.total_net||0), 0)
    const expensesPaid      = exps.reduce((s,e) => s+(+e.amount||0), 0)
    const foodPaid          = foodRows.reduce((s,f) => s+(+f.total_amount||0), 0)
    const overtimePaid      = otRows.reduce((s,o) => s+(+o.total_amount||0), 0)
    const moneyReqPaid      = moneyReqs.reduce((s,m) => s+(+m.amount||0), 0)

    const totalInflows  = cashFromCustomers + cashReceipts + advances + otherInPmts
    const totalOutflows = cashToAirlines + refundsPaid + payrollPaid + expensesPaid + foodPaid + overtimePaid + moneyReqPaid
    const netCash       = totalInflows - totalOutflows

    setData({
      cashFromCustomers, cashReceipts, advances, otherInPmts, totalInflows,
      cashToAirlines, refundsPaid, payrollPaid, expensesPaid, foodPaid, overtimePaid, moneyReqPaid,
      totalOutflows, netCash,
    })
    setLoading(false)
  }

  function setMonth(offset) {
    const d = new Date()
    d.setMonth(d.getMonth() + offset)
    const y = d.getFullYear(), m = d.getMonth()
    setFrom(`${y}-${String(m+1).padStart(2,'0')}-01`)
    setTo(new Date(y, m+1, 0).toISOString().slice(0,10))
  }

  function setQuarter(q) {
    const y   = new Date().getFullYear()
    const map = { Q1:[1,3], Q2:[4,6], Q3:[7,9], Q4:[10,12] }
    const [sm, em] = map[q]
    setFrom(`${y}-${String(sm).padStart(2,'0')}-01`)
    setTo(new Date(y, em, 0).toISOString().slice(0,10))
  }

  function exportCSV() {
    if (!data) return
    const d = data
    const rows = [
      [`Cash Flow Statement — ${fmtD(from)} to ${fmtD(to)}`],[],
      ['OPERATING INFLOWS'],
      ['Cash Received from Customers', d.cashFromCustomers.toFixed(2)],
      ['Other Receipts', d.cashReceipts.toFixed(2)],
      ['Advances Received', d.advances.toFixed(2)],
      ['Other', d.otherInPmts.toFixed(2)],
      ['Total Inflows', d.totalInflows.toFixed(2)],[],
      ['OPERATING OUTFLOWS'],
      ['Airlines / Suppliers Paid', d.cashToAirlines.toFixed(2)],
      ['Refunds Paid', d.refundsPaid.toFixed(2)],
      ['Salaries & Payroll', d.payrollPaid.toFixed(2)],
      ['Expense Claims', d.expensesPaid.toFixed(2)],
      ['Food Allowance', d.foodPaid.toFixed(2)],
      ['Overtime Payments', d.overtimePaid.toFixed(2)],
      ['Cash Advances (Money Requests)', d.moneyReqPaid.toFixed(2)],
      ['Total Outflows', d.totalOutflows.toFixed(2)],[],
      ['NET CASH FLOW', d.netCash.toFixed(2)],
    ]
    const blob = new Blob([rows.map(r=>r.join(',')).join('\n')], { type:'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `cash-flow-${from}-to-${to}.csv`; a.click()
  }

  function printReport() {
    if (!data) return
    const d = data
    const pos = d.netCash >= 0
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>Cash Flow</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;font-size:12px;max-width:680px;margin:0 auto}
    h2{font-size:18px;margin-bottom:2px}p{color:#666;margin:0 0 20px}
    table{width:100%;border-collapse:collapse}
    .sec{background:#1a2e3d;color:#fff;font-weight:700;font-size:11px}
    .sec td{padding:7px 14px;letter-spacing:1px}
    .sub td{padding:5px 14px 5px 28px;border-bottom:1px solid #f5f5f5;color:#546e7a}
    .sub td:last-child{text-align:right;font-family:monospace}
    .st{background:#f5f5f5;font-weight:700}.st td{padding:7px 14px}
    .st td:last-child{text-align:right;font-family:monospace}
    .net{background:#1a2e3d;color:#fff;font-weight:800;font-size:14px}
    .net td{padding:11px 14px}.net td:last-child{text-align:right;font-family:monospace;color:${pos?'#a5d6a7':'#ef9a9a'}}
    .sp{height:8px;background:#f9fafb}
    @media print{@page{size:A4;margin:1.5cm}}</style></head><body>
    <h2>Cash Flow Statement</h2>
    <p>Period: ${fmtD(from)} – ${fmtD(to)} &nbsp;|&nbsp; All amounts in SAR</p>
    <table>
      <tr class="sec"><td colspan="2">A. OPERATING INFLOWS</td></tr>
      <tr class="sub"><td>Cash Received from Customers</td><td>${fmt(d.cashFromCustomers)}</td></tr>
      <tr class="sub"><td>Other Receipts</td><td>${fmt(d.cashReceipts)}</td></tr>
      <tr class="sub"><td>Advances Received</td><td>${fmt(d.advances)}</td></tr>
      <tr class="sub"><td>Other Inflows</td><td>${fmt(d.otherInPmts)}</td></tr>
      <tr class="st"><td>Total Cash Inflows</td><td>${fmt(d.totalInflows)}</td></tr>
      <tr class="sp"><td colspan="2"></td></tr>
      <tr class="sec"><td colspan="2">B. OPERATING OUTFLOWS</td></tr>
      <tr class="sub"><td>Airlines / Suppliers Paid</td><td>(${fmt(d.cashToAirlines)})</td></tr>
      <tr class="sub"><td>Refunds to Customers</td><td>(${fmt(d.refundsPaid)})</td></tr>
      <tr class="sub"><td>Salaries & Payroll</td><td>(${fmt(d.payrollPaid)})</td></tr>
      <tr class="sub"><td>Expense Claims</td><td>(${fmt(d.expensesPaid)})</td></tr>
      <tr class="sub"><td>Food Allowance</td><td>(${fmt(d.foodPaid)})</td></tr>
      <tr class="sub"><td>Overtime Payments</td><td>(${fmt(d.overtimePaid)})</td></tr>
      <tr class="sub"><td>Cash Advances (Money Requests)</td><td>(${fmt(d.moneyReqPaid)})</td></tr>
      <tr class="st"><td>Total Cash Outflows</td><td>(${fmt(d.totalOutflows)})</td></tr>
      <tr class="sp"><td colspan="2"></td></tr>
      <tr class="net"><td>NET CASH FLOW (A − B)</td><td>${pos?'+':''}${fmt(d.netCash)}</td></tr>
    </table>
    <script>window.onload=()=>window.print()<\/script></body></html>`)
    w.document.close()
  }

  const netPos = !data || data.netCash >= 0

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>Direct-method operating cash flow — inflows vs outflows for the period</div>

      {/* Controls */}
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div><label style={S.lbl}>From</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={S.inp} /></div>
        <div><label style={S.lbl}>To</label><input type="date" value={to} onChange={e=>setTo(e.target.value)} style={S.inp} /></div>
        <div style={{ display:'flex', gap:4, paddingBottom:2, flexWrap:'wrap' }}>
          {[{l:'This Month',o:0},{l:'Last Month',o:-1},{l:'2 Months Ago',o:-2}].map(p=>(
            <button key={p.l} onClick={()=>setMonth(p.o)} style={{ ...S.btnO('#546e7a'), fontSize:10, padding:'6px 8px' }}>{p.l}</button>
          ))}
          {['Q1','Q2','Q3','Q4'].map(q=>(
            <button key={q} onClick={()=>setQuarter(q)} style={{ ...S.btnO('#1565C0'), fontSize:10, padding:'6px 8px' }}>{q}</button>
          ))}
        </div>
        <button style={S.btnO()} onClick={exportCSV} disabled={!data}>⬇ CSV</button>
        <button style={S.btnO('#2e7d32')} onClick={printReport} disabled={!data}>🖨 Print</button>
        <button style={S.btn()} onClick={load} disabled={loading}>↻ Refresh</button>
      </div>

      {/* Schema errors (non-fatal) */}
      {errors.length > 0 && (
        <div style={{ ...S.card, background:'#fff8e1', border:'1px solid #ffcc80', fontSize:11, color:'#795548' }}>
          ⚠ Some data sources returned errors (amounts may be incomplete): {errors.join(' | ')}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:80, color:'#6b7c93' }}>Loading cash flow…</div>
      ) : !data ? null : (() => {
        const d = data
        return (
          <>
            {/* Net banner */}
            <div style={{ ...S.card, background:netPos?'#e8f5e9':'#ffebee', border:`2px solid ${netPos?'#a5d6a7':'#ef9a9a'}`, display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ fontSize:36 }}>{netPos?'📈':'📉'}</div>
              <div>
                <div style={{ fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:2 }}>NET CASH FLOW — {fmtD(from)} to {fmtD(to)}</div>
                <div style={{ fontSize:28, fontWeight:800, color:netPos?'#2e7d32':'#c62828' }}>
                  {netPos?'+':''}{fmt(d.netCash)} SAR
                </div>
                <div style={{ fontSize:11, color:'#6b7c93', marginTop:4 }}>
                  Inflows: {fmt(d.totalInflows)} &nbsp;|&nbsp; Outflows: ({fmt(d.totalOutflows)})
                </div>
              </div>
            </div>

            {/* KPIs */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:10, marginBottom:14 }}>
              {[
                { label:'From Customers',     val:d.cashFromCustomers, color:'#2e7d32' },
                { label:'Other Receipts',     val:d.cashReceipts,      color:'#1565C0' },
                { label:'Payroll Paid',       val:d.payrollPaid,       color:'#c62828' },
                { label:'Airlines/Suppliers', val:d.cashToAirlines,    color:'#e65100' },
                { label:'Expenses + Food + OT',val:d.expensesPaid+d.foodPaid+d.overtimePaid, color:'#7b1fa2' },
                { label:'Cash Advances',      val:d.moneyReqPaid,      color:'#546e7a' },
              ].map(k=>(
                <div key={k.label} style={{ background:'#fff', borderRadius:12, padding:'12px 14px', boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize:10, color:'#6b7c93', marginBottom:3 }}>{k.label}</div>
                  <div style={{ fontWeight:800, fontSize:15, color:k.color }}>{fmt(k.val)}</div>
                  <div style={{ fontSize:9, color:'#aab2bd' }}>SAR</div>
                </div>
              ))}
            </div>

            {/* Statement table */}
            <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                    <th style={{ padding:'10px 14px', textAlign:'left', fontSize:12, fontWeight:700, background:MC, color:'#fff' }}>Cash Flow — Direct Method</th>
                    <th style={{ padding:'10px 14px', textAlign:'right', fontSize:12, fontWeight:700, background:MC, color:'#fff' }}>Amount (SAR)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background:'#1565C018' }}>
                    <td colSpan={2} style={{ padding:'9px 14px', fontWeight:800, fontSize:11, color:'#1565C0', letterSpacing:1 }}>
                      A. OPERATING INFLOWS
                    </td>
                  </tr>
                  <SectionRow label="Cash Received from Customers" amount={d.cashFromCustomers} sub />
                  <SectionRow label="Cash Received from Contractors (AR)" amount={d.cashReceipts} sub />
                  <SectionRow label="Advances Received" amount={d.advances} sub />
                  <SectionRow label="Other Inflows" amount={d.otherInPmts} sub />
                  <SectionRow label="Total Cash Inflows (A)" amount={d.totalInflows} total />

                  <tr><td colSpan={2} style={{ height:8, background:'#f9fafb' }} /></tr>

                  <tr style={{ background:'#c6282818' }}>
                    <td colSpan={2} style={{ padding:'9px 14px', fontWeight:800, fontSize:11, color:'#c62828', letterSpacing:1 }}>
                      B. OPERATING OUTFLOWS
                    </td>
                  </tr>
                  <SectionRow label="Payments to Airlines / Suppliers" amount={-d.cashToAirlines} sub />
                  <SectionRow label="Refunds Paid to Customers" amount={-d.refundsPaid} sub />
                  <SectionRow label="Salaries & Payroll" amount={-d.payrollPaid} sub />
                  <SectionRow label="Expense Claims Paid" amount={-d.expensesPaid} sub />
                  <SectionRow label="Food Allowance Paid" amount={-d.foodPaid} sub />
                  <SectionRow label="Overtime Payments" amount={-d.overtimePaid} sub />
                  <SectionRow label="Cash Advances (Money Requests)" amount={-d.moneyReqPaid} sub />
                  <SectionRow label="Total Cash Outflows (B)" amount={-d.totalOutflows} total />

                  <tr><td colSpan={2} style={{ height:8, background:'#f9fafb' }} /></tr>

                  <tr style={{ background:netPos?'#2e7d3218':'#c6282818' }}>
                    <td style={{ padding:'13px 14px', fontWeight:800, fontSize:15, color:netPos?'#2e7d32':'#c62828' }}>
                      NET CASH FLOW (A − B)
                    </td>
                    <td style={{ padding:'13px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:15, color:netPos?'#2e7d32':'#c62828' }}>
                      {netPos?'+':''}{fmt(d.netCash)} SAR
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Bar chart */}
            <div style={{ ...S.card }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:10 }}>COMPOSITION</div>
              <div style={{ display:'flex', gap:6, alignItems:'flex-end', height:80 }}>
                {[
                  { l:'Customers', v:d.cashFromCustomers, c:'#2e7d32' },
                  { l:'Receipts',  v:d.cashReceipts, c:'#1565C0' },
                  { l:'Airlines',  v:-d.cashToAirlines, c:'#e65100' },
                  { l:'Payroll',   v:-d.payrollPaid, c:'#c62828' },
                  { l:'Expenses',  v:-(d.expensesPaid+d.foodPaid+d.overtimePaid), c:'#7b1fa2' },
                  { l:'Advances',  v:-d.moneyReqPaid, c:'#546e7a' },
                ].filter(b=>b.v!==0).map(b=>{
                  const allVals = [d.cashFromCustomers, d.cashReceipts, d.cashToAirlines, d.payrollPaid, d.expensesPaid+d.foodPaid+d.overtimePaid, d.moneyReqPaid]
                  const maxV = Math.max(...allVals.filter(v=>v>0))
                  const h = maxV ? Math.max(4, Math.round(Math.abs(b.v)/maxV*70)) : 4
                  return (
                    <div key={b.l} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                      <div style={{ fontSize:9, color:'#6b7c93', fontWeight:700 }}>{fmt(Math.abs(b.v))}</div>
                      <div style={{ height:h, width:'100%', background:b.c, borderRadius:3, opacity:b.v<0?0.7:1 }} />
                      <div style={{ fontSize:9, color:'#6b7c93', textAlign:'center' }}>{b.l}</div>
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop:6, fontSize:10, color:'#aab2bd' }}>
                <span style={{ color:'#2e7d32', fontWeight:700 }}>■ Inflows</span> &nbsp;
                <span style={{ color:'#c62828', fontWeight:700, opacity:0.7 }}>■ Outflows</span>
              </div>
            </div>

            <div style={{ marginTop:4, fontSize:11, color:'#aab2bd' }}>
              Payroll: all runs within period (DRAFT/APPROVED/PAID). Food allowance: all approved months in range.
              Overtime: approved requests by ot_date. Expenses: approved/paid by expense_date.
            </div>
          </>
        )
      })()}
    </div>
  )
}
