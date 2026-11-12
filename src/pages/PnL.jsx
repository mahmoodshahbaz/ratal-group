import { GROUP_COLORS, kpiCardGradient } from '../styles/appStyles'
const MC = GROUP_COLORS.Reports
const L1 = '#B8A5CF'
const L2 = '#F5EFFA'
const L3 = '#7444A3'
const PP = "'Poppins', sans-serif"
/**
 * PnL.jsx — Profit & Loss Statement
 * Derived entirely from posted journal entries (journal_entry_lines → chart_of_accounts)
 * No manual input required. Refreshes automatically as transactions post.
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  th:  { padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:0.5, background:L3, color:'#fff', whiteSpace:'nowrap' },
  td:  { padding:'9px 14px', fontSize:13, color:'#2d3a45', borderBottom:'1px solid #f0f4f8', verticalAlign:'middle' },
  inp: { padding:'8px 11px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:'inherit' },
}

function fmt(n) {
  return new Intl.NumberFormat('en-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Math.abs(n||0))
}
function fmtSigned(n) {
  if (!n) return '—'
  const abs = new Intl.NumberFormat('en-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Math.abs(n))
  return n < 0 ? `(${abs})` : abs
}

// ─── Account type groupings for P&L ─────────────────────────────────────────
// Revenue: account_type = REVENUE
// COGS:    account_type = EXPENSE, account_subtype = COGS
// OpEx:    account_type = EXPENSE, account_subtype = OPERATING_EXPENSE
// Other:   account_type = EXPENSE, account_subtype = OTHER_EXPENSE

export default function PnL({ entityId, title = '📊 P&L Report' }) {
  const [loading, setLoading]     = useState(false)
  const [data, setData]           = useState(null)   // { revenue:[], cogs:[], opex:[], other:[] }
  const [periodType, setPeriodType] = useState('month')  // month | quarter | year | custom
  const [year, setYear]           = useState(new Date().getFullYear())
  const [month, setMonth]         = useState(new Date().getMonth() + 1)
  const [quarter, setQuarter]     = useState(Math.ceil((new Date().getMonth() + 1) / 3))
  const [dateFrom, setDateFrom]   = useState('')
  const [dateTo, setDateTo]       = useState('')
  const [showDetail, setShowDetail] = useState({})  // accountCode → bool (expand/collapse)

  // ── Compute date range from period selector ──────────────────────────────
  function getDateRange() {
    if (periodType === 'custom') return { from: dateFrom, to: dateTo }
    if (periodType === 'month') {
      const m = String(month).padStart(2,'0')
      const lastDay = new Date(year, month, 0).getDate()
      return { from:`${year}-${m}-01`, to:`${year}-${m}-${lastDay}` }
    }
    if (periodType === 'quarter') {
      const startM = (quarter - 1) * 3 + 1
      const endM   = quarter * 3
      const lastDay = new Date(year, endM, 0).getDate()
      return {
        from: `${year}-${String(startM).padStart(2,'0')}-01`,
        to:   `${year}-${String(endM).padStart(2,'0')}-${lastDay}`,
      }
    }
    // year
    return { from:`${year}-01-01`, to:`${year}-12-31` }
  }

  const load = useCallback(async () => {
    const { from, to } = getDateRange()
    if (!from || !to) return
    setLoading(true)

    // 1. Get all posted journal entries in range for this entity
    const { data: jeData } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('entity_id', entityId)
      .eq('status', 'POSTED')
      .gte('entry_date', from)
      .lte('entry_date', to)

    if (!jeData || jeData.length === 0) {
      setData({ revenue:[], cogs:[], opex:[], other:[], jeCount:0 })
      setLoading(false)
      return
    }

    const jeIds = jeData.map(j => j.id)

    // 2. Get all P&L lines (REVENUE + EXPENSE accounts) for those entries
    const { data: lineData } = await supabase
      .from('journal_entry_lines')
      .select('account_id, account_code, account_name, debit_amount, credit_amount')
      .in('journal_entry_id', jeIds)

    if (!lineData || lineData.length === 0) {
      setData({ revenue:[], cogs:[], opex:[], other:[], jeCount: jeIds.length })
      setLoading(false)
      return
    }

    // 3. Get COA metadata for these accounts
    const accountIds = [...new Set(lineData.map(l => l.account_id).filter(Boolean))]
    const { data: coaData } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name, account_type, account_subtype, sort_order')
      .in('id', accountIds)

    const coaMap = Object.fromEntries((coaData||[]).map(a => [a.id, a]))

    // 4. Aggregate net movement per account
    // REVENUE:  normal_balance = CREDIT → net = credit - debit (positive = income)
    // EXPENSE:  normal_balance = DEBIT  → net = debit - credit (positive = cost)
    const accTotals = {}
    for (const line of lineData) {
      const coa = coaMap[line.account_id]
      if (!coa) continue
      if (!['REVENUE','EXPENSE'].includes(coa.account_type)) continue

      const key = line.account_id
      if (!accTotals[key]) {
        accTotals[key] = {
          account_id:      coa.id,
          account_code:    coa.account_code,
          account_name:    coa.account_name,
          account_type:    coa.account_type,
          account_subtype: coa.account_subtype,
          sort_order:      coa.sort_order || 0,
          debit:  0,
          credit: 0,
        }
      }
      accTotals[key].debit  += +line.debit_amount  || 0
      accTotals[key].credit += +line.credit_amount || 0
    }

    // 5. Classify into sections
    const revenue = [], cogs = [], opex = [], other = []

    for (const acc of Object.values(accTotals)) {
      const net = acc.account_type === 'REVENUE'
        ? (acc.credit - acc.debit)      // Revenue: net credit is income
        : (acc.debit  - acc.credit)     // Expense: net debit is cost

      const row = { ...acc, net }

      if (acc.account_type === 'REVENUE') {
        revenue.push(row)
      } else if (acc.account_subtype === 'COGS') {
        cogs.push(row)
      } else if (acc.account_subtype === 'OTHER_EXPENSE') {
        other.push(row)
      } else {
        opex.push(row)
      }
    }

    const sortAcc = arr => arr.sort((a,b) => a.sort_order - b.sort_order || a.account_code.localeCompare(b.account_code))

    setData({
      revenue: sortAcc(revenue),
      cogs:    sortAcc(cogs),
      opex:    sortAcc(opex),
      other:   sortAcc(other),
      jeCount: jeIds.length,
      from, to,
    })
    setLoading(false)
  }, [entityId, periodType, year, month, quarter, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  function toggleDetail(code) {
    setShowDetail(s => ({ ...s, [code]: !s[code] }))
  }

  // ── Print ────────────────────────────────────────────────────────────────
  function handlePrint() {
    if (!data) return
    const { from, to } = getDateRange()
    const totalRev  = data.revenue.reduce((s,r) => s + r.net, 0)
    const totalCogs = data.cogs.reduce((s,r) => s + r.net, 0)
    const grossProfit = totalRev - totalCogs
    const totalOpex  = data.opex.reduce((s,r) => s + r.net, 0)
    const ebit       = grossProfit - totalOpex
    const totalOther = data.other.reduce((s,r) => s + r.net, 0)
    const netProfit  = ebit - totalOther

    const sectionRows = (arr, color) => arr.map(r => `
      <tr>
        <td style="padding-left:32px">${r.account_code} — ${r.account_name}</td>
        <td style="text-align:right;color:${color}">${fmt(r.net)}</td>
      </tr>`).join('')

    const w = window.open('', '_blank', 'width=800,height=900')
    w.document.write(`<!DOCTYPE html><html><head><title>P&L Statement</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;padding:30px;max-width:700px;margin:0 auto}
    h2{color:#1a2e3d}table{width:100%;border-collapse:collapse}
    td,th{padding:7px 10px;border-bottom:1px solid #eee}
    .section{font-weight:800;font-size:13px;background:#f0f4f8;color:#1a2e3d}
    .total{font-weight:800;border-top:2px solid #1a2e3d}
    .grand{font-size:14px;font-weight:900;background:#1a2e3d;color:#fff}</style></head><body>
    <h2>Profit & Loss Statement</h2>
    <p>Period: ${from} to ${to} &nbsp;|&nbsp; Based on ${data.jeCount} posted journal entries</p>
    <table>
      <tr class="section"><td colspan="2">REVENUE</td></tr>
      ${sectionRows(data.revenue,'#1a7f4b')}
      <tr class="total"><td>Total Revenue</td><td style="text-align:right;color:#1a7f4b">${fmt(totalRev)}</td></tr>
      <tr class="section"><td colspan="2">COST OF REVENUE</td></tr>
      ${sectionRows(data.cogs,'#c0392b')}
      <tr class="total"><td>Total COGS</td><td style="text-align:right;color:#c0392b">${fmt(totalCogs)}</td></tr>
      <tr style="font-weight:800;background:#e8f5e9"><td>GROSS PROFIT</td><td style="text-align:right;color:${grossProfit>=0?'#1a7f4b':'#c0392b'}">${fmtSigned(grossProfit)}</td></tr>
      <tr class="section"><td colspan="2">OPERATING EXPENSES</td></tr>
      ${sectionRows(data.opex,'#c0392b')}
      <tr class="total"><td>Total Operating Expenses</td><td style="text-align:right;color:#c0392b">${fmt(totalOpex)}</td></tr>
      <tr style="font-weight:800;background:#e3f2fd"><td>OPERATING PROFIT (EBIT)</td><td style="text-align:right;color:${ebit>=0?'#1565c0':'#c0392b'}">${fmtSigned(ebit)}</td></tr>
      <tr class="section"><td colspan="2">OTHER EXPENSES</td></tr>
      ${sectionRows(data.other,'#c0392b')}
      <tr class="grand"><td>NET PROFIT / (LOSS)</td><td style="text-align:right">${fmtSigned(netProfit)}</td></tr>
    </table>
    <script>window.print()</script></body></html>`)
    w.document.close()
  }

  // ── Derived totals ────────────────────────────────────────────────────────
  const totalRev    = (data?.revenue || []).reduce((s,r) => s + r.net, 0)
  const totalCogs   = (data?.cogs    || []).reduce((s,r) => s + r.net, 0)
  const grossProfit = totalRev - totalCogs
  const gpPct       = totalRev !== 0 ? (grossProfit / totalRev * 100) : 0
  const totalOpex   = (data?.opex   || []).reduce((s,r) => s + r.net, 0)
  const ebit        = grossProfit - totalOpex
  const totalOther  = (data?.other  || []).reduce((s,r) => s + r.net, 0)
  const netProfit   = ebit - totalOther
  const npPct       = totalRev !== 0 ? (netProfit / totalRev * 100) : 0

  // ── Render helpers ────────────────────────────────────────────────────────
  function SectionHeader({ label, bg='#1a2e3d', color='#fff' }) {
    return (
      <tr>
        <td colSpan={2} style={{ padding:'10px 14px', fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:0.8, background:bg, color }}>{label}</td>
      </tr>
    )
  }

  function AccountRow({ acc }) {
    return (
      <tr style={{ background:'#fff' }}>
        <td style={{ ...S.td, paddingLeft:28 }}>
          <span style={{ fontSize:11, color:'#aab2bd', fontFamily:'monospace', marginRight:8 }}>{acc.account_code}</span>
          {acc.account_name}
        </td>
        <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color: acc.net >= 0 ? '#2d3a45':'#c0392b', fontWeight:600 }}>
          {fmt(acc.net)}
        </td>
      </tr>
    )
  }

  function SubtotalRow({ label, value, bg='#f0f4f8', bold=false, large=false }) {
    const isProfit = value >= 0
    return (
      <tr style={{ background: bg }}>
        <td style={{ ...S.td, fontWeight: bold?800:700, fontSize: large?15:13, paddingLeft:14, color:'#1a2e3d' }}>{label}</td>
        <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace',
          fontWeight: bold?900:700, fontSize: large?15:13,
          color: isProfit ? '#1a7f4b' : '#c0392b'
        }}>
          SAR {fmtSigned(value)}
        </td>
      </tr>
    )
  }

  function MarginRow({ label, value }) {
    const color = value >= 0 ? '#1a7f4b' : '#c0392b'
    return (
      <tr style={{ background:'#fafbfc' }}>
        <td style={{ ...S.td, fontSize:11, color:'#6b7c93', paddingLeft:28 }}>{label}</td>
        <td style={{ ...S.td, textAlign:'right', fontSize:11, color, fontWeight:700, fontFamily:'monospace' }}>
          {value >= 0 ? '' : '('}{Math.abs(value).toFixed(1)}%{value >= 0 ? '' : ')'}
        </td>
      </tr>
    )
  }

  const { from: currentFrom, to: currentTo } = getDateRange()

  return (
    <div className="pnl-root" style={{ fontFamily:PP, display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden', background:L2 }}>
      <style>{`.pnl-root input,.pnl-root select,.pnl-root button,.pnl-root textarea{font-family:'Poppins',sans-serif!important}`}</style>

      {/* ══ UPPER ZONE ══ */}
      <div style={{ flexShrink:0, background:L2, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', zIndex:10 }}>

        {/* L1 Heading Bar */}
        <div style={{ padding:'6px 28px 0' }}>
          <div style={{ background:L1, borderRadius:'6px 6px 0 0', padding:'8px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <span style={{ fontSize:15, fontWeight:700, color:'#fff', letterSpacing:0.3 }}>{title}</span>
              {data?.from && <span style={{ fontSize:10, color:'rgba(255,255,255,0.75)', marginLeft:10 }}>{data.from} → {data.to}</span>}
            </div>
            <button onClick={handlePrint} disabled={!data} style={{ background:L3, color:'#fff', border:'none', borderRadius:7, padding:'7px 16px', fontSize:12, fontWeight:700, cursor:'pointer' }}>🖨 Print</button>
          </div>
        </div>

        {/* KPI Strip */}
        <div style={{ padding:'10px 28px 12px', background:L2, display:'flex', flexWrap:'wrap', gap:8 }}>
          {[
            { label:'Total Revenue',    value: data ? `SAR ${fmt(totalRev)}`    : '—', sub: null },
            { label:'Gross Profit',     value: data ? `SAR ${fmt(grossProfit)}` : '—', sub: data ? `GP ${gpPct.toFixed(1)}%` : null },
            { label:'Operating Profit', value: data ? `SAR ${fmt(ebit)}`        : '—', sub: null },
            { label:'Net Profit',       value: data ? `SAR ${fmt(netProfit)}`   : '—', sub: data ? `NP ${npPct.toFixed(1)}%` : null },
          ].map((k, i) => {
            const g = kpiCardGradient(i, L1, L2, L3)
            return (
              <div key={k.label} style={{ ...g, width:200, height:62, borderRadius:10, padding:'0 14px', flexShrink:0, boxShadow:'0 2px 8px rgba(0,0,0,0.10)', display:'flex', flexDirection:'column', justifyContent:'center' }}>
                <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', opacity:0.75, marginBottom:2 }}>{k.label}</div>
                <div style={{ fontSize:16, fontWeight:800, lineHeight:1 }}>{k.value}</div>
                {k.sub && <div style={{ fontSize:9, opacity:0.7, marginTop:2 }}>{k.sub}</div>}
              </div>
            )
          })}
        </div>

        {/* Filter Bar — period selector */}
        <div style={{ padding:'6px 28px 8px' }}>
          <div style={{ background:'#fff', padding:'10px 14px', borderRadius:8, boxShadow:'0 1px 4px rgba(0,0,0,0.08)', display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end' }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>Period</div>
          <select style={S.inp} value={periodType} onChange={e=>setPeriodType(e.target.value)}>
            <option value="month">Monthly</option>
            <option value="quarter">Quarterly</option>
            <option value="year">Full Year</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        {periodType !== 'custom' && (
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>Year</div>
            <select style={S.inp} value={year} onChange={e=>setYear(+e.target.value)}>
              {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
            </select>
          </div>
        )}

        {periodType === 'month' && (
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>Month</div>
            <select style={S.inp} value={month} onChange={e=>setMonth(+e.target.value)}>
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i)=>(
                <option key={i} value={i+1}>{m}</option>
              ))}
            </select>
          </div>
        )}

        {periodType === 'quarter' && (
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>Quarter</div>
            <select style={S.inp} value={quarter} onChange={e=>setQuarter(+e.target.value)}>
              <option value={1}>Q1 (Jan–Mar)</option>
              <option value={2}>Q2 (Apr–Jun)</option>
              <option value={3}>Q3 (Jul–Sep)</option>
              <option value={4}>Q4 (Oct–Dec)</option>
            </select>
          </div>
        )}

        {periodType === 'custom' && (<>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>From</div>
            <input style={S.inp} type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>To</div>
            <input style={S.inp} type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
          </div>
        </>)}
          </div>
        </div>
      </div>{/* end upper zone */}

      {/* ══ SCROLL ZONE ══ */}
      <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:'10px 28px 22px' }}>

      {/* P&L Statement table */}
      <div style={{ background:'#fff', borderRadius:12, border:'1.5px solid #e8edf5', overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:60, textAlign:'center', color:'#aab2bd' }}>Calculating P&L…</div>
        ) : !data ? (
          <div style={{ padding:60, textAlign:'center', color:'#aab2bd' }}>Select a period above</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...S.th, width:'70%' }}>Account</th>
                <th style={{ ...S.th, textAlign:'right' }}>Amount (SAR)</th>
              </tr>
            </thead>
            <tbody>
              {/* ── REVENUE ─────────────────────────── */}
              <SectionHeader label="Revenue" bg="#1a7f4b" color="#fff" />
              {data.revenue.length === 0 && (
                <tr><td colSpan={2} style={{ ...S.td, paddingLeft:28, color:'#aab2bd', fontStyle:'italic' }}>No revenue posted in this period</td></tr>
              )}
              {data.revenue.map(r => <AccountRow key={r.account_id} acc={r} />)}
              <SubtotalRow label="Total Revenue" value={totalRev} bg="#e8f5e9" bold />

              {/* ── COST OF REVENUE ─────────────────── */}
              <SectionHeader label="Cost of Revenue (COGS)" bg="#4a5568" color="#fff" />
              {data.cogs.length === 0 && (
                <tr><td colSpan={2} style={{ ...S.td, paddingLeft:28, color:'#aab2bd', fontStyle:'italic' }}>No cost of revenue posted</td></tr>
              )}
              {data.cogs.map(r => <AccountRow key={r.account_id} acc={r} />)}
              <SubtotalRow label="Total COGS" value={-totalCogs} bg="#f8eef0" />

              {/* ── GROSS PROFIT ────────────────────── */}
              <SubtotalRow label="GROSS PROFIT" value={grossProfit} bg={grossProfit>=0?'#d4edda':'#fdecea'} bold large />
              <MarginRow label="Gross Profit Margin" value={gpPct} />

              {/* ── OPERATING EXPENSES ──────────────── */}
              <SectionHeader label="Operating Expenses" bg="#4a5568" color="#fff" />
              {data.opex.length === 0 && (
                <tr><td colSpan={2} style={{ ...S.td, paddingLeft:28, color:'#aab2bd', fontStyle:'italic' }}>No operating expenses posted</td></tr>
              )}
              {data.opex.map(r => <AccountRow key={r.account_id} acc={r} />)}
              <SubtotalRow label="Total Operating Expenses" value={-totalOpex} bg="#f8eef0" />

              {/* ── EBIT ────────────────────────────── */}
              <SubtotalRow label="OPERATING PROFIT (EBIT)" value={ebit} bg={ebit>=0?'#dbeafe':'#fdecea'} bold />

              {/* ── OTHER EXPENSES ──────────────────── */}
              {data.other.length > 0 && (<>
                <SectionHeader label="Other Expenses (Finance / Interest)" bg="#4a5568" color="#fff" />
                {data.other.map(r => <AccountRow key={r.account_id} acc={r} />)}
                <SubtotalRow label="Total Other Expenses" value={-totalOther} bg="#f8eef0" />
              </>)}

              {/* ── NET PROFIT ──────────────────────── */}
              <SubtotalRow label="NET PROFIT / (LOSS)" value={netProfit} bg={netProfit>=0?'#1a2e3d':'#7f1d1d'} bold large />
              <MarginRow label="Net Profit Margin" value={npPct} />
            </tbody>
          </table>
        )}
      </div>

      {/* No journal entries note */}
      {data && data.jeCount === 0 && (
        <div style={{ marginTop:12, padding:'12px 16px', background:'#fff8e1', borderRadius:8, fontSize:13, color:'#856404' }}>
          ⚠️ No posted journal entries found for this period. Issue invoices, save payment receipts, or approve payments to auto-generate entries.
        </div>
      )}
      </div>{/* end scroll zone */}
    </div>
  )
}
