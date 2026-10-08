import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// Budget Module — Budget Entry + Budget vs Actual
//
// Tab 1 — Budget Entry:
//   • Set annual or monthly budgets per account_code × department
//   • Pulls COA from chart_of_accounts for account list
//   • Inline editing, auto-save on blur
//
// Tab 2 — Budget vs Actual:
//   • Actuals from ledger_entries (same DR_NORMAL logic as ProfitLoss)
//   • Variance = Budget − Actual (favourable when positive for expense,
//                                 favourable when positive for income)
//   • Color: green = on/under budget, amber = within 10% over, red = over
//   • Drill-down by department, monthly breakdown toggle
//   • Print (A4) + CSV export
// ═══════════════════════════════════════════════════════════════════

const DR_NORMAL = new Set(['BANK','CASH','ASSET','CUSTOMER','CONTRACTOR','EMPLOYEE','EXPENSE','CLEARING','INTERNAL','SUBCON'])

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:10 },
  btn:   (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  btnO:  (c='#1a2e3d') => ({ background:'transparent', color:c, border:`1.5px solid ${c}`, borderRadius:8, padding:'7px 15px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:   { padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff' },
  lbl:   { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
  numInp:{ padding:'5px 8px', borderRadius:6, border:'1px solid #dde3ec', fontSize:12, outline:'none', width:110, textAlign:'right', fontFamily:'monospace', background:'#fafbff' },
}

const fmt   = n   => (+n||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
const fmtD  = d   => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function varianceColor(pct, isIncome) {
  // For income: being OVER budget is good (green). Under is red.
  // For expense: being UNDER budget is good (green). Over is red.
  if (isIncome) {
    if (pct >= 0)   return '#2e7d32'  // actual ≥ budget → good
    if (pct >= -10) return '#e65100'  // within 10% under
    return '#c62828'                   // >10% under
  } else {
    if (pct <= 0)   return '#2e7d32'  // actual ≤ budget → good
    if (pct <= 10)  return '#e65100'  // within 10% over
    return '#c62828'                   // >10% over
  }
}

function VarianceBadge({ budget, actual, isIncome }) {
  if (!budget || budget === 0) return <span style={{ color:'#aab2bd', fontSize:11 }}>—</span>
  const pct = ((actual - budget) / Math.abs(budget)) * 100
  const c   = varianceColor(pct, isIncome)
  const arrow = isIncome ? (pct >= 0 ? '↑' : '↓') : (pct <= 0 ? '↓' : '↑')
  return (
    <span style={{ color:c, fontWeight:700, fontSize:11 }}>
      {arrow} {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

// ── Budget Entry Tab ─────────────────────────────────────────────────────────
function BudgetEntry({ entityId, year, month, dept }) {
  const [coa,     setCoa]     = useState([])
  const [budgets, setBudgets] = useState({})  // key: account_code → budgeted_amount
  const [saving,  setSaving]  = useState({})
  const [saved,   setSaved]   = useState({})
  const [filter,  setFilter]  = useState('')

  useEffect(() => { if (entityId) load() }, [entityId, year, month, dept])

  async function load() {
    const { data: coaData } = await supabase
      .from('chart_of_accounts')
      .select('account_code, account_name, account_type')
      .eq('entity_id', entityId)
      .eq('is_active', true)
      .in('account_type', ['INCOME','EXPENSE'])
      .order('account_code')

    setCoa(coaData || [])

    const q = supabase
      .from('budgets')
      .select('account_code, budgeted_amount')
      .eq('entity_id', entityId)
      .eq('year', year)
      .eq('department', dept || 'ALL')

    if (month) q.eq('month', month)
    else       q.is('month', null)

    const { data: bData } = await q
    const map = {}
    for (const b of (bData||[])) map[b.account_code] = b.budgeted_amount
    setBudgets(map)
  }

  async function save(account_code, account_name, account_type, value) {
    const amount = parseFloat(value) || 0
    setSaving(s => ({ ...s, [account_code]: true }))

    const payload = {
      entity_id:       entityId,
      year,
      month:           month || null,
      account_code,
      account_name,
      account_type,
      department:      dept || 'ALL',
      budgeted_amount: amount,
    }

    const { error } = await supabase
      .from('budgets')
      .upsert(payload, { onConflict: 'entity_id,year,month,account_code,department' })

    setSaving(s  => ({ ...s, [account_code]: false }))
    if (!error) {
      setBudgets(b => ({ ...b, [account_code]: amount }))
      setSaved(s   => ({ ...s, [account_code]: true }))
      setTimeout(() => setSaved(s => ({ ...s, [account_code]: false })), 1500)
    }
  }

  const income  = coa.filter(a => a.account_type === 'INCOME')
  const expense = coa.filter(a => a.account_type === 'EXPENSE')
  const q       = filter.toLowerCase()
  const filt    = arr => q ? arr.filter(a => a.account_name.toLowerCase().includes(q) || a.account_code.includes(q)) : arr

  const totalIncomeBudget  = income.reduce((s,a)  => s + (+budgets[a.account_code]||0), 0)
  const totalExpenseBudget = expense.reduce((s,a) => s + (+budgets[a.account_code]||0), 0)

  function AccountRows({ accounts, color }) {
    return filt(accounts).map(a => (
      <tr key={a.account_code} style={{ borderBottom:'1px solid #f5f5f5' }}>
        <td style={{ padding:'6px 14px', fontSize:11, color:'#9e9e9e', fontFamily:'monospace', width:80 }}>{a.account_code}</td>
        <td style={{ padding:'6px 14px', fontSize:12, color:'#1a2e3d' }}>{a.account_name}</td>
        <td style={{ padding:'6px 14px', textAlign:'right' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, justifyContent:'flex-end' }}>
            <input
              type="number"
              min="0"
              step="0.01"
              defaultValue={budgets[a.account_code] ?? ''}
              key={`${a.account_code}-${year}-${month}-${dept}`}
              onBlur={e => save(a.account_code, a.account_name, a.account_type, e.target.value)}
              style={{ ...S.numInp, borderColor: saved[a.account_code] ? '#a5d6a7' : '#dde3ec' }}
              placeholder="0.00"
            />
            {saving[a.account_code] && <span style={{ fontSize:10, color:'#6b7c93' }}>⏳</span>}
            {saved[a.account_code]  && <span style={{ fontSize:10, color:'#2e7d32' }}>✓</span>}
          </div>
        </td>
      </tr>
    ))
  }

  if (coa.length === 0) return (
    <div style={{ ...S.card, textAlign:'center', color:'#aab2bd', padding:48 }}>
      No active INCOME or EXPENSE accounts found in Chart of Accounts.<br/>
      Add accounts with type INCOME or EXPENSE first.
    </div>
  )

  return (
    <>
      <div style={{ ...S.card, padding:'10px 14px', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <input
          value={filter} onChange={e=>setFilter(e.target.value)}
          placeholder="🔍 Filter accounts…" style={{ ...S.inp, width:220 }}
        />
        <div style={{ marginLeft:'auto', fontSize:12, color:'#6b7c93' }}>
          Click a field and tab away to auto-save. All amounts in SAR.
        </div>
      </div>

      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#1a2e3d', color:'#fff' }}>
              <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11, width:80 }}>Code</th>
              <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Account</th>
              <th style={{ padding:'9px 14px', textAlign:'right', fontSize:11, width:160 }}>Budget (SAR)</th>
            </tr>
          </thead>
          <tbody>
            {/* INCOME */}
            <tr style={{ background:'#1565C018' }}>
              <td colSpan={3} style={{ padding:'8px 14px', fontWeight:800, fontSize:11, color:'#1565C0', letterSpacing:1 }}>
                INCOME — Total Budget: {fmt(totalIncomeBudget)} SAR
              </td>
            </tr>
            <AccountRows accounts={income} color="#1565C0" />

            <tr><td colSpan={3} style={{ height:8, background:'#f9fafb' }} /></tr>

            {/* EXPENSE */}
            <tr style={{ background:'#c6282818' }}>
              <td colSpan={3} style={{ padding:'8px 14px', fontWeight:800, fontSize:11, color:'#c62828', letterSpacing:1 }}>
                EXPENSE — Total Budget: {fmt(totalExpenseBudget)} SAR
              </td>
            </tr>
            <AccountRows accounts={expense} color="#c62828" />

            <tr style={{ background:'#f0f4f8' }}>
              <td colSpan={2} style={{ padding:'9px 14px', fontWeight:800, fontSize:13 }}>
                Budgeted Net Profit / (Loss)
              </td>
              <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:14,
                color: (totalIncomeBudget-totalExpenseBudget) >= 0 ? '#2e7d32' : '#c62828' }}>
                {fmt(totalIncomeBudget - totalExpenseBudget)} SAR
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── Budget vs Actual Tab ──────────────────────────────────────────────────────
function BudgetVsActual({ entityId, year, month, dept }) {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [showAll, setShowAll] = useState(false)  // false = only budgeted accounts

  useEffect(() => { if (entityId) load() }, [entityId, year, month, dept])

  async function load() {
    setLoading(true)

    const dateFrom = month
      ? `${year}-${String(month).padStart(2,'0')}-01`
      : `${year}-01-01`
    const dateTo = month
      ? new Date(year, month, 0).toISOString().slice(0,10)
      : `${year}-12-31`

    const [leRes, coaRes, budRes] = await Promise.all([
      supabase.from('ledger_entries')
        .select('account_code, debit, credit')
        .eq('entity_id', entityId)
        .gte('entry_date', dateFrom)
        .lte('entry_date', dateTo),

      supabase.from('chart_of_accounts')
        .select('account_code, account_name, account_type')
        .eq('entity_id', entityId)
        .in('account_type', ['INCOME','EXPENSE']),

      (() => {
        const q = supabase.from('budgets')
          .select('account_code, budgeted_amount')
          .eq('entity_id', entityId)
          .eq('year', year)
          .eq('department', dept || 'ALL')
        return month ? q.eq('month', month) : q.is('month', null)
      })(),
    ])

    const entries = leRes.data || []
    const coa     = coaRes.data || []
    const bud     = budRes.data || []

    // Aggregate actuals per account_code
    const actMap = {}
    for (const e of entries) {
      if (!actMap[e.account_code]) actMap[e.account_code] = { debit:0, credit:0 }
      actMap[e.account_code].debit  += +e.debit  || 0
      actMap[e.account_code].credit += +e.credit || 0
    }

    const budMap = {}
    for (const b of bud) budMap[b.account_code] = +b.budgeted_amount || 0

    const coaMap = {}
    for (const a of coa) coaMap[a.account_code] = a

    // Build unified rows from both COA and budget entries
    const allCodes = new Set([...coa.map(a=>a.account_code), ...bud.map(b=>b.account_code)])

    const built = []
    for (const code of allCodes) {
      const meta    = coaMap[code]
      if (!meta) continue
      const type    = (meta.account_type||'').toUpperCase()
      if (type !== 'INCOME' && type !== 'EXPENSE') continue

      const totals  = actMap[code] || { debit:0, credit:0 }
      const actual  = DR_NORMAL.has(type)
        ? totals.debit - totals.credit
        : totals.credit - totals.debit

      const budget    = budMap[code] || 0
      const variance  = budget - actual      // positive = under actual (for expense: good)
      const pct       = budget ? ((actual - budget) / Math.abs(budget)) * 100 : null

      built.push({ code, name: meta.account_name, type, actual, budget, variance, pct })
    }

    built.sort((a,b) => a.type.localeCompare(b.type) || a.code.localeCompare(b.code))
    setRows(built)
    setLoading(false)
  }

  function exportCSV() {
    const header = ['Code','Account','Type','Budget (SAR)','Actual (SAR)','Variance (SAR)','Variance %']
    const body   = visibleRows.map(r => [
      r.code, r.name, r.type,
      r.budget.toFixed(2), r.actual.toFixed(2), r.variance.toFixed(2),
      r.pct!=null ? r.pct.toFixed(1)+'%' : 'N/A',
    ])
    const csv  = [header, ...body].map(r=>r.join(',')).join('\n')
    const blob = new Blob([csv], { type:'text/csv' })
    const a    = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `budget-vs-actual-${year}${month?'-'+String(month).padStart(2,'0'):''}.csv`
    a.click()
  }

  function printReport() {
    const w = window.open('', '_blank')
    const income  = visibleRows.filter(r=>r.type==='INCOME')
    const expense = visibleRows.filter(r=>r.type==='EXPENSE')
    const totalBudgetIncome  = income.reduce((s,r)=>s+r.budget,0)
    const totalActualIncome  = income.reduce((s,r)=>s+r.actual,0)
    const totalBudgetExpense = expense.reduce((s,r)=>s+r.budget,0)
    const totalActualExpense = expense.reduce((s,r)=>s+r.actual,0)
    const netBudget  = totalBudgetIncome  - totalBudgetExpense
    const netActual  = totalActualIncome  - totalActualExpense

    const rowsHTML = (arr, c) => arr.map(r=>`
      <tr style="border-bottom:1px solid #f5f5f5">
        <td style="padding:5px 12px;font-size:10px;color:#9e9e9e;font-family:monospace">${r.code}</td>
        <td style="padding:5px 12px;font-size:11px">${r.name}</td>
        <td style="padding:5px 12px;text-align:right;font-family:monospace;font-size:11px">${fmt(r.budget)}</td>
        <td style="padding:5px 12px;text-align:right;font-family:monospace;font-size:11px">${fmt(r.actual)}</td>
        <td style="padding:5px 12px;text-align:right;font-family:monospace;font-size:11px;color:${varianceColor(r.pct,r.type==='INCOME')}">${fmt(r.variance)}</td>
        <td style="padding:5px 12px;text-align:right;font-size:10px;font-weight:700;color:${varianceColor(r.pct,r.type==='INCOME')}">${r.pct!=null?Math.abs(r.pct).toFixed(1)+'%':'—'}</td>
      </tr>`).join('')

    w.document.write(`<!DOCTYPE html><html><head><title>Budget vs Actual</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;font-size:11px;max-width:900px;margin:0 auto}
    h2{font-size:16px;margin:0}p{color:#666;margin:2px 0 16px}
    table{width:100%;border-collapse:collapse}
    .sh{background:#1a2e3d;color:#fff}.sh td,.sh th{padding:7px 12px;text-align:left;font-size:10px}
    .tot{background:#f0f4f8;font-weight:700}.tot td{padding:7px 12px}
    .tot td:not(:first-child){text-align:right;font-family:monospace}
    @media print{@page{size:A4 landscape;margin:1.2cm}}</style></head><body>
    <h2>Budget vs Actual</h2>
    <p>${year}${month?` — ${MONTHS[month-1]}`:'  (Full Year)'} ${dept&&dept!=='ALL'?` | Dept: ${dept}`:''} | All amounts in SAR</p>
    <table>
      <tr class="sh"><th>Code</th><th>Account</th><th style="text-align:right">Budget</th><th style="text-align:right">Actual</th><th style="text-align:right">Variance</th><th style="text-align:right">Var %</th></tr>
      <tr style="background:#1565C018"><td colspan="6" style="padding:7px 12px;font-weight:800;font-size:10px;color:#1565C0;letter-spacing:1px">INCOME</td></tr>
      ${rowsHTML(income,'#1565C0')}
      <tr class="tot"><td colspan="2">Total Income</td><td style="text-align:right;font-family:monospace">${fmt(totalBudgetIncome)}</td><td style="text-align:right;font-family:monospace">${fmt(totalActualIncome)}</td><td style="text-align:right;font-family:monospace;color:${varianceColor((totalActualIncome-totalBudgetIncome)/Math.abs(totalBudgetIncome||1)*100,true)}">${fmt(totalBudgetIncome-totalActualIncome)}</td><td></td></tr>
      <tr style="height:8px;background:#f9fafb"><td colspan="6"></td></tr>
      <tr style="background:#c6282818"><td colspan="6" style="padding:7px 12px;font-weight:800;font-size:10px;color:#c62828;letter-spacing:1px">EXPENSE</td></tr>
      ${rowsHTML(expense,'#c62828')}
      <tr class="tot"><td colspan="2">Total Expenses</td><td style="text-align:right;font-family:monospace">${fmt(totalBudgetExpense)}</td><td style="text-align:right;font-family:monospace">${fmt(totalActualExpense)}</td><td style="text-align:right;font-family:monospace;color:${varianceColor((totalActualExpense-totalBudgetExpense)/Math.abs(totalBudgetExpense||1)*100,false)}">${fmt(totalBudgetExpense-totalActualExpense)}</td><td></td></tr>
      <tr style="height:8px;background:#f9fafb"><td colspan="6"></td></tr>
      <tr style="background:${netActual>=0?'#e8f5e9':'#ffebee'};font-weight:800;font-size:13px"><td colspan="2" style="padding:10px 12px">Net Profit / (Loss)</td><td style="padding:10px 12px;text-align:right;font-family:monospace">${fmt(netBudget)}</td><td style="padding:10px 12px;text-align:right;font-family:monospace">${fmt(netActual)}</td><td style="padding:10px 12px;text-align:right;font-family:monospace;color:${netActual>=0?'#2e7d32':'#c62828'}">${fmt(netBudget-netActual)}</td><td></td></tr>
    </table>
    <script>window.onload=()=>window.print()<\/script></body></html>`)
    w.document.close()
  }

  const visibleRows = showAll ? rows : rows.filter(r => r.budget > 0 || r.actual > 0)
  const income  = visibleRows.filter(r => r.type === 'INCOME')
  const expense = visibleRows.filter(r => r.type === 'EXPENSE')

  const totBudIncome  = income.reduce((s,r)  => s+r.budget, 0)
  const totActIncome  = income.reduce((s,r)  => s+r.actual, 0)
  const totBudExpense = expense.reduce((s,r) => s+r.budget, 0)
  const totActExpense = expense.reduce((s,r) => s+r.actual, 0)
  const netBudget     = totBudIncome - totBudExpense
  const netActual     = totActIncome - totActExpense

  if (loading) return <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading…</div>

  function BvaRow({ r }) {
    const isIncome  = r.type === 'INCOME'
    const pctAbove  = (r.actual / (r.budget||1) * 100)
    const barWidth  = Math.min(100, pctAbove)
    const c         = varianceColor(r.pct, isIncome)
    return (
      <tr style={{ borderBottom:'1px solid #f5f5f5' }}>
        <td style={{ padding:'7px 14px', fontSize:10, color:'#9e9e9e', fontFamily:'monospace', width:72 }}>{r.code}</td>
        <td style={{ padding:'7px 14px', fontSize:12 }}>{r.name}</td>
        <td style={{ padding:'7px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12, color:'#546e7a' }}>{fmt(r.budget)}</td>
        <td style={{ padding:'7px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12, fontWeight:600 }}>{fmt(r.actual)}</td>
        <td style={{ padding:'7px 14px', width:120 }}>
          <div style={{ background:'#f0f4f8', borderRadius:4, height:8, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${barWidth}%`, background: c, borderRadius:4 }} />
          </div>
          <div style={{ fontSize:9, color:'#9e9e9e', marginTop:2, textAlign:'center' }}>{pctAbove.toFixed(0)}% of budget</div>
        </td>
        <td style={{ padding:'7px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12, fontWeight:700,
          color: r.variance >= 0 === isIncome ? '#2e7d32' : '#c62828' }}>
          {r.variance >= 0 ? '+':''}{fmt(r.variance)}
        </td>
        <td style={{ padding:'7px 14px', textAlign:'right' }}>
          <VarianceBadge budget={r.budget} actual={r.actual} isIncome={isIncome} />
        </td>
      </tr>
    )
  }

  function TotalRow({ label, budg, act, isIncome, highlight }) {
    const varr = budg - act
    const pct  = budg ? ((act - budg) / Math.abs(budg)) * 100 : null
    const c    = varianceColor(pct, isIncome)
    return (
      <tr style={{ background: highlight ? (act>=0?'#e8f5e9':'#ffebee') : '#f5f7fa', borderTop:'2px solid #e0e0e0' }}>
        <td colSpan={2} style={{ padding:'9px 14px', fontWeight:800, fontSize:13, color:highlight?(act>=0?'#2e7d32':'#c62828'):'#1a2e3d' }}>{label}</td>
        <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700, fontSize:13, color:'#546e7a' }}>{fmt(budg)}</td>
        <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700, fontSize:13 }}>{fmt(act)}</td>
        <td />
        <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:13, color:c }}>
          {varr >= 0?'+':''}{fmt(varr)}
        </td>
        <td style={{ padding:'9px 14px', textAlign:'right' }}>
          {pct!=null && <span style={{ color:c, fontWeight:700, fontSize:12 }}>{Math.abs(pct).toFixed(1)}%</span>}
        </td>
      </tr>
    )
  }

  return (
    <>
      <div style={{ ...S.card, padding:'10px 14px', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'#546e7a', cursor:'pointer' }}>
          <input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)} />
          Show all accounts (incl. zero)
        </label>
        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          <button onClick={exportCSV} style={S.btnO()}>⬇ CSV</button>
          <button onClick={printReport} style={S.btnO('#2e7d32')}>🖨 Print</button>
        </div>
      </div>

      {/* KPI strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10, marginBottom:12 }}>
        {[
          { label:'Budgeted Revenue',  val:totBudIncome,  color:'#1565C0', sub:`Actual: ${fmt(totActIncome)}` },
          { label:'Budgeted Expenses', val:totBudExpense, color:'#c62828', sub:`Actual: ${fmt(totActExpense)}` },
          { label:'Budgeted Net',      val:netBudget,     color:netBudget>=0?'#2e7d32':'#c62828', sub:`Actual: ${fmt(netActual)}` },
          { label:'Budget Utilisation',
            val: totBudExpense ? Math.min(999, totActExpense/totBudExpense*100) : 0,
            color: totBudExpense && totActExpense/totBudExpense > 1.1 ? '#c62828' : '#2e7d32',
            sub:'of expense budget', pct:true },
        ].map(k=>(
          <div key={k.label} style={{ background:'#fff', borderRadius:12, padding:'12px 14px', boxShadow:'0 1px 6px rgba(0,0,0,0.07)', borderLeft:`4px solid ${k.color}` }}>
            <div style={{ fontSize:10, color:'#6b7c93' }}>{k.label}</div>
            <div style={{ fontWeight:800, fontSize:18, color:k.color }}>
              {k.pct ? `${k.val.toFixed(1)}%` : `${fmt(k.val)}`}
            </div>
            <div style={{ fontSize:10, color:'#aab2bd', marginTop:2 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {visibleRows.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', color:'#aab2bd', padding:48 }}>
          No budget entries found. Go to "Budget Entry" tab to set budgets.
        </div>
      ) : (
        <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11, width:72 }}>Code</th>
                <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Account</th>
                <th style={{ padding:'9px 14px', textAlign:'right', fontSize:11 }}>Budget</th>
                <th style={{ padding:'9px 14px', textAlign:'right', fontSize:11 }}>Actual</th>
                <th style={{ padding:'9px 14px', textAlign:'center', fontSize:11, width:120 }}>Used</th>
                <th style={{ padding:'9px 14px', textAlign:'right', fontSize:11 }}>Variance</th>
                <th style={{ padding:'9px 14px', textAlign:'right', fontSize:11 }}>Var %</th>
              </tr>
            </thead>
            <tbody>
              {/* INCOME */}
              {income.length > 0 && (
                <>
                  <tr style={{ background:'#1565C018' }}>
                    <td colSpan={7} style={{ padding:'8px 14px', fontWeight:800, fontSize:11, color:'#1565C0', letterSpacing:1 }}>INCOME</td>
                  </tr>
                  {income.map(r => <BvaRow key={r.code} r={r} />)}
                  <TotalRow label="Total Revenue" budg={totBudIncome} act={totActIncome} isIncome />
                  <tr><td colSpan={7} style={{ height:8, background:'#f9fafb' }} /></tr>
                </>
              )}

              {/* EXPENSE */}
              {expense.length > 0 && (
                <>
                  <tr style={{ background:'#c6282818' }}>
                    <td colSpan={7} style={{ padding:'8px 14px', fontWeight:800, fontSize:11, color:'#c62828', letterSpacing:1 }}>EXPENSE</td>
                  </tr>
                  {expense.map(r => <BvaRow key={r.code} r={r} />)}
                  <TotalRow label="Total Expenses" budg={totBudExpense} act={totActExpense} />
                  <tr><td colSpan={7} style={{ height:8, background:'#f9fafb' }} /></tr>
                </>
              )}

              <TotalRow
                label={netActual >= 0 ? '📈 Net Profit' : '📉 Net Loss'}
                budg={netBudget} act={netActual}
                isIncome={netActual >= 0} highlight
              />
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function Budget({ entityId }) {
  const [tab,   setTab]   = useState('entry')   // 'entry' | 'actual'
  const [year,  setYear]  = useState(new Date().getFullYear())
  const [month, setMonth] = useState(0)          // 0 = annual
  const [dept,  setDept]  = useState('ALL')
  const [depts, setDepts] = useState([])

  useEffect(() => {
    if (!entityId) return
    supabase.from('departments').select('name').eq('entity_id', entityId)
      .then(({ data }) => setDepts((data||[]).map(d=>d.name)))
  }, [entityId])

  const years = Array.from({ length: 5 }, (_,i) => new Date().getFullYear() - 2 + i)

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>Set annual/monthly budgets and compare against actuals from the GL</div>

      {/* Controls */}
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div>
          <label style={S.lbl}>Year</label>
          <select value={year} onChange={e=>setYear(+e.target.value)} style={S.inp}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={S.lbl}>Period</label>
          <select value={month} onChange={e=>setMonth(+e.target.value)} style={S.inp}>
            <option value={0}>Full Year</option>
            {MONTHS.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={S.lbl}>Department</label>
          <select value={dept} onChange={e=>setDept(e.target.value)} style={S.inp}>
            <option value="ALL">All Departments</option>
            {depts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
          {[['entry','✏️ Budget Entry'],['actual','📊 vs Actual']].map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} style={tab===k ? S.btn('#1a2e3d') : S.btnO('#546e7a')}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Period label */}
      <div style={{ marginBottom:10, fontSize:12, color:'#6b7c93', fontWeight:700 }}>
        📅 {year}{month ? ` — ${MONTHS[month-1]}` : ' (Full Year)'}
        {dept !== 'ALL' ? ` | Dept: ${dept}` : ''}
      </div>

      {tab === 'entry'  && <BudgetEntry    entityId={entityId} year={year} month={month||null} dept={dept} />}
      {tab === 'actual' && <BudgetVsActual entityId={entityId} year={year} month={month||null} dept={dept} />}

      {tab === 'entry' && (
        <div style={{ marginTop:8, fontSize:11, color:'#aab2bd' }}>
          Budgets are saved per account × period × department. Tab away from any field to auto-save.
          Switch to "vs Actual" to compare against GL entries.
        </div>
      )}
    </div>
  )
}
