import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// Income Statement (Profit & Loss) — Phase 6
// Source: ledger_entries (flat GL) + chart_of_accounts
// Income  accounts: account_type = 'INCOME'  → CR-normal (balance = credit - debit)
// Expense accounts: account_type = 'EXPENSE' → DR-normal (balance = debit - credit)
// Net Profit = Total Income − Total Expenses
// ═══════════════════════════════════════════════════════════════════

const DR_NORMAL = new Set(['BANK','CASH','ASSET','CUSTOMER','CONTRACTOR','EMPLOYEE','EXPENSE','CLEARING','INTERNAL','SUBCON'])

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
  const now = new Date()
  return {
    from: `${now.getFullYear()}-01-01`,
    to:   now.toISOString().slice(0,10),
  }
}

function prevPeriod(from, to) {
  const f = new Date(from), t = new Date(to)
  const days = Math.round((t-f)/864e5) + 1
  const pTo   = new Date(f.getTime() - 864e5)
  const pFrom = new Date(pTo.getTime() - (days-1)*864e5)
  return { from: pFrom.toISOString().slice(0,10), to: pTo.toISOString().slice(0,10) }
}

function AccountRow({ account, compare=false }) {
  const pct = compare && account.prevBalance > 0
    ? ((account.balance - account.prevBalance) / account.prevBalance * 100).toFixed(1)
    : null

  return (
    <tr style={{ borderBottom:'1px solid #f5f5f5' }}>
      <td style={{ padding:'5px 14px 5px 28px', fontSize:12, color:'#546e7a' }}>
        <span style={{ color:'#9e9e9e', fontSize:10, marginRight:6, fontFamily:'monospace' }}>{account.account_code}</span>
        {account.account_name}
      </td>
      <td style={{ padding:'5px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12, color:'#1a2e3d', fontWeight:600 }}>
        {fmt(account.balance)}
      </td>
      {compare && (
        <>
          <td style={{ padding:'5px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12, color:'#6b7c93' }}>
            {fmt(account.prevBalance||0)}
          </td>
          <td style={{ padding:'5px 14px', textAlign:'right', fontSize:11, fontWeight:700,
            color: pct===null ? '#9e9e9e' : +pct>=0 ? '#2e7d32' : '#c62828' }}>
            {pct===null ? '—' : `${+pct>=0?'+':''}${pct}%`}
          </td>
        </>
      )}
    </tr>
  )
}

function SectionTotal({ label, amount, prevAmount, compare, highlight }) {
  const pos  = amount >= 0
  const pct  = compare && prevAmount > 0 ? ((amount-prevAmount)/prevAmount*100).toFixed(1) : null
  return (
    <tr style={{ background: highlight ? (pos?'#e8f5e9':'#ffebee') : '#f5f7fa', borderTop:'2px solid #e0e0e0' }}>
      <td style={{ padding:'9px 14px', fontWeight:800, fontSize:13, color: highlight?(pos?'#2e7d32':'#c62828'):'#1a2e3d' }}>
        {label}
      </td>
      <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontSize:14, fontWeight:800,
        color: highlight?(pos?'#2e7d32':'#c62828'):'#1a2e3d' }}>
        {fmt(amount)} SAR
      </td>
      {compare && (
        <>
          <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12, color:'#6b7c93', fontWeight:700 }}>
            {fmt(prevAmount||0)} SAR
          </td>
          <td style={{ padding:'9px 14px', textAlign:'right', fontSize:11, fontWeight:700,
            color: pct===null?'#9e9e9e': +pct>=0?'#2e7d32':'#c62828' }}>
            {pct===null?'—':`${+pct>=0?'+':''}${pct}%`}
          </td>
        </>
      )}
    </tr>
  )
}

async function fetchPL(entityId, from, to) {
  // 1. Get ledger entries for period
  const { data: entries } = await supabase
    .from('ledger_entries')
    .select('account_code, debit, credit')
    .eq('entity_id', entityId)
    .gte('entry_date', from)
    .lte('entry_date', to)

  // 2. Get chart of accounts for account types
  const { data: coa } = await supabase
    .from('chart_of_accounts')
    .select('account_code, account_name, account_type')
    .eq('entity_id', entityId)

  if (!entries || !coa) return { income:[], expense:[], totalIncome:0, totalExpense:0 }

  const coaMap = {}
  for (const a of coa) coaMap[a.account_code] = a

  // 3. Aggregate debits/credits per account
  const acc = {}
  for (const e of entries) {
    if (!acc[e.account_code]) acc[e.account_code] = { debit:0, credit:0 }
    acc[e.account_code].debit  += +e.debit  || 0
    acc[e.account_code].credit += +e.credit || 0
  }

  // 4. Split into Income and Expense buckets
  const income  = []
  const expense = []

  for (const [code, totals] of Object.entries(acc)) {
    const meta = coaMap[code]
    if (!meta) continue
    const type = (meta.account_type||'').toUpperCase()

    let balance = 0
    if (DR_NORMAL.has(type)) {
      balance = totals.debit - totals.credit     // DR-normal
    } else {
      balance = totals.credit - totals.debit     // CR-normal
    }
    if (Math.abs(balance) < 0.005) continue

    const row = { account_code: code, account_name: meta.account_name, account_type: type, balance }
    if (type === 'INCOME')   income.push(row)
    if (type === 'EXPENSE')  expense.push(row)
  }

  // Sort by account_code
  income.sort((a,b)  => a.account_code.localeCompare(b.account_code))
  expense.sort((a,b) => a.account_code.localeCompare(b.account_code))

  const totalIncome  = income.reduce((s,r)  => s + r.balance, 0)
  const totalExpense = expense.reduce((s,r) => s + r.balance, 0)

  return { income, expense, totalIncome, totalExpense }
}

export default function ProfitLoss({ entityId }) {
  const def = defaultRange()
  const [from,    setFrom]    = useState(def.from)
  const [to,      setTo]      = useState(def.to)
  const [compare, setCompare] = useState(false)
  const [data,    setData]    = useState(null)
  const [prevData,setPrevData]= useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (entityId) load() }, [entityId, from, to, compare])

  async function load() {
    setLoading(true)
    const cur = await fetchPL(entityId, from, to)

    if (compare) {
      const prev = prevPeriod(from, to)
      const pData = await fetchPL(entityId, prev.from, prev.to)
      // Merge prevBalance into cur rows
      const prevMap = {}
      for (const r of [...pData.income, ...pData.expense]) prevMap[r.account_code] = r.balance

      cur.income  = cur.income.map(r  => ({ ...r, prevBalance: prevMap[r.account_code]||0 }))
      cur.expense = cur.expense.map(r => ({ ...r, prevBalance: prevMap[r.account_code]||0 }))
      setPrevData(pData)
    } else {
      setPrevData(null)
    }

    setData(cur)
    setLoading(false)
  }

  function setPreset(key) {
    const y = new Date().getFullYear()
    const m = new Date().getMonth()
    const map = {
      ytd:   [  `${y}-01-01`,   new Date().toISOString().slice(0,10) ],
      q1:    [  `${y}-01-01`,   `${y}-03-31` ],
      q2:    [  `${y}-04-01`,   `${y}-06-30` ],
      q3:    [  `${y}-07-01`,   `${y}-09-30` ],
      q4:    [  `${y}-10-01`,   `${y}-12-31` ],
      thisM: [ `${y}-${String(m+1).padStart(2,'0')}-01`,
               new Date(y,m+1,0).toISOString().slice(0,10) ],
      lastY: [ `${y-1}-01-01`, `${y-1}-12-31` ],
    }
    const [f,t] = map[key]||[]
    if (f) { setFrom(f); setTo(t) }
  }

  function exportCSV() {
    if (!data) return
    const rows = [
      [`Profit & Loss Statement — ${fmtD(from)} to ${fmtD(to)}`],[],
      ['INCOME'],
      ['Code','Account','Amount (SAR)'],
      ...data.income.map(r  => [r.account_code, r.account_name, r.balance.toFixed(2)]),
      ['','Total Revenue', data.totalIncome.toFixed(2)],[],
      ['EXPENSES'],
      ['Code','Account','Amount (SAR)'],
      ...data.expense.map(r => [r.account_code, r.account_name, r.balance.toFixed(2)]),
      ['','Total Expenses', data.totalExpense.toFixed(2)],[],
      ['','NET PROFIT / (LOSS)', (data.totalIncome - data.totalExpense).toFixed(2)],
    ]
    const blob = new Blob([rows.map(r=>r.join(',')).join('\n')], { type:'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `profit-loss-${from}-to-${to}.csv`; a.click()
  }

  function printReport() {
    if (!data) return
    const net = data.totalIncome - data.totalExpense
    const pos = net >= 0
    const pComp = compare && prevData
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>P&L</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;font-size:11px;max-width:780px;margin:0 auto}
    h2{font-size:18px;margin:0}p{color:#666;margin:2px 0 18px}
    table{width:100%;border-collapse:collapse}
    .h{background:#1a2e3d;color:#fff;font-weight:700;font-size:10px;letter-spacing:1px}
    .h td{padding:7px 14px}
    tr:nth-child(even){background:#fafafa}
    .sub td{padding:4px 14px 4px 28px;border-bottom:1px solid #f5f5f5;font-size:11px;color:#546e7a}
    .sub td:not(:first-child){text-align:right;font-family:monospace}
    .tot{background:#f0f4f8;font-weight:700}.tot td{padding:7px 14px}
    .tot td:not(:first-child){text-align:right;font-family:monospace}
    .sp{height:10px}.net{font-weight:800;font-size:14px}
    .net td{padding:11px 14px;background:${pos?'#e8f5e9':'#ffebee'};color:${pos?'#2e7d32':'#c62828'}}
    .net td:not(:first-child){text-align:right;font-family:monospace}
    @media print{@page{size:A4;margin:1.5cm}}</style></head><body>
    <h2>Profit &amp; Loss Statement</h2>
    <p>Period: ${fmtD(from)} – ${fmtD(to)} | All amounts in SAR</p>
    <table>
      <tr class="h"><td>REVENUE</td><td>This Period</td>${pComp?'<td>Prev Period</td><td>Δ%</td>':''}</tr>
      ${data.income.map(r=>`<tr class="sub"><td><span style="color:#9e9e9e;font-family:monospace;font-size:9px;margin-right:5px">${r.account_code}</span>${r.account_name}</td><td>${fmt(r.balance)}</td>${pComp?`<td>${fmt(r.prevBalance||0)}</td><td>${r.prevBalance?((r.balance-r.prevBalance)/r.prevBalance*100).toFixed(1)+'%':'—'}</td>`:''}</tr>`).join('')}
      <tr class="tot"><td>Total Revenue</td><td>${fmt(data.totalIncome)}</td>${pComp?`<td>${fmt(prevData.totalIncome)}</td><td>${prevData.totalIncome?((data.totalIncome-prevData.totalIncome)/prevData.totalIncome*100).toFixed(1)+'%':'—'}</td>`:''}</tr>
      <tr class="sp"><td colspan="4"></td></tr>
      <tr class="h"><td>EXPENSES</td><td>This Period</td>${pComp?'<td>Prev Period</td><td>Δ%</td>':''}</tr>
      ${data.expense.map(r=>`<tr class="sub"><td><span style="color:#9e9e9e;font-family:monospace;font-size:9px;margin-right:5px">${r.account_code}</span>${r.account_name}</td><td>${fmt(r.balance)}</td>${pComp?`<td>${fmt(r.prevBalance||0)}</td><td>${r.prevBalance?((r.balance-r.prevBalance)/r.prevBalance*100).toFixed(1)+'%':'—'}</td>`:''}</tr>`).join('')}
      <tr class="tot"><td>Total Expenses</td><td>${fmt(data.totalExpense)}</td>${pComp?`<td>${fmt(prevData.totalExpense)}</td><td>${prevData.totalExpense?((data.totalExpense-prevData.totalExpense)/prevData.totalExpense*100).toFixed(1)+'%':'—'}</td>`:''}</tr>
      <tr class="sp"><td colspan="4"></td></tr>
      <tr class="net"><td>${pos?'NET PROFIT':'NET LOSS'}</td><td>${pos?'+':''}${fmt(net)} SAR</td>${pComp?`<td>${pos?'+':''}${fmt(prevData.totalIncome-prevData.totalExpense)} SAR</td><td>—</td>`:''}</tr>
    </table>
    <script>window.onload=()=>window.print()<\/script></body></html>`)
    w.document.close()
  }

  const net = data ? data.totalIncome - data.totalExpense : 0
  const margin = data && data.totalIncome > 0 ? (net / data.totalIncome * 100) : null

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>Income Statement — Revenue vs Expenses for the period</div>

      {/* Controls */}
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div><label style={S.lbl}>From</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={S.inp} /></div>
        <div><label style={S.lbl}>To</label><input type="date" value={to} onChange={e=>setTo(e.target.value)} style={S.inp} /></div>
        <div style={{ display:'flex', gap:4, paddingBottom:2, flexWrap:'wrap' }}>
          {[['ytd','YTD'],['thisM','This Month'],['q1','Q1'],['q2','Q2'],['q3','Q3'],['q4','Q4'],['lastY','Last Year']].map(([k,l])=>(
            <button key={k} onClick={()=>setPreset(k)} style={{ ...S.btnO('#546e7a'), fontSize:10, padding:'6px 8px' }}>{l}</button>
          ))}
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:5, fontSize:12, color:'#546e7a', cursor:'pointer', paddingBottom:2 }}>
          <input type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)} />
          Compare prev. period
        </label>
        <button style={S.btnO()} onClick={exportCSV} disabled={!data}>⬇ CSV</button>
        <button style={S.btnO('#2e7d32')} onClick={printReport} disabled={!data}>🖨 Print</button>
        <button style={S.btn()} onClick={load} disabled={loading}>↻ Refresh</button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:80, color:'#6b7c93' }}>Loading P&L…</div>
      ) : !data ? null : (
        <>
          {/* KPI Banner */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px,1fr))', gap:10, marginBottom:14 }}>
            {[
              { label:'Total Revenue',   val:data.totalIncome,  color:'#1565C0', icon:'💰' },
              { label:'Total Expenses',  val:data.totalExpense, color:'#c62828', icon:'💸' },
              { label:net>=0?'Net Profit':'Net Loss', val:Math.abs(net), color:net>=0?'#2e7d32':'#c62828', icon:net>=0?'📈':'📉' },
              margin!==null ? { label:'Profit Margin', val:margin, color:margin>=0?'#2e7d32':'#c62828', icon:'%', pct:true } : null,
            ].filter(Boolean).map(k=>(
              <div key={k.label} style={{ background:'#fff', borderRadius:12, padding:'14px 16px', boxShadow:'0 1px 6px rgba(0,0,0,0.07)', borderLeft:`4px solid ${k.color}` }}>
                <div style={{ fontSize:10, color:'#6b7c93', marginBottom:4 }}>{k.label}</div>
                <div style={{ fontWeight:800, fontSize:20, color:k.color }}>
                  {k.pct ? `${k.val.toFixed(1)}%` : `${fmt(k.val)} SAR`}
                </div>
                {compare && prevData && !k.pct && (() => {
                  const prev = k.label.includes('Revenue') ? prevData.totalIncome
                             : k.label.includes('Expense') ? prevData.totalExpense
                             : prevData.totalIncome - prevData.totalExpense
                  const pct = prev ? ((k.val - Math.abs(prev)) / Math.abs(prev) * 100).toFixed(1) : null
                  return pct ? <div style={{ fontSize:10, color:+pct>=0?'#2e7d32':'#c62828', fontWeight:700, marginTop:3 }}>{+pct>=0?'↑':'↓'} {Math.abs(pct)}% vs prev</div> : null
                })()}
              </div>
            ))}
          </div>

          {/* Statement Table */}
          <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                  <th style={{ padding:'10px 14px', textAlign:'left', fontSize:12, fontWeight:700 }}>Account</th>
                  <th style={{ padding:'10px 14px', textAlign:'right', fontSize:12, fontWeight:700 }}>
                    {fmtD(from)} – {fmtD(to)}
                  </th>
                  {compare && prevData && (
                    <>
                      <th style={{ padding:'10px 14px', textAlign:'right', fontSize:12, fontWeight:700, color:'#90caf9' }}>
                        Prev Period
                      </th>
                      <th style={{ padding:'10px 14px', textAlign:'right', fontSize:12, fontWeight:700, color:'#a5d6a7' }}>Δ%</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {/* REVENUE */}
                <tr style={{ background:'#1565C018' }}>
                  <td colSpan={compare&&prevData?4:2} style={{ padding:'9px 14px', fontWeight:800, fontSize:11, color:'#1565C0', letterSpacing:1 }}>
                    REVENUE
                  </td>
                </tr>
                {data.income.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding:'12px 28px', color:'#aab2bd', fontStyle:'italic' }}>No income entries for this period</td></tr>
                ) : data.income.map(r => <AccountRow key={r.account_code} account={r} compare={compare&&!!prevData} />)}
                <SectionTotal
                  label="Total Revenue"
                  amount={data.totalIncome}
                  prevAmount={prevData?.totalIncome}
                  compare={compare&&!!prevData}
                />

                <tr><td colSpan={4} style={{ height:10, background:'#f9fafb' }} /></tr>

                {/* EXPENSES */}
                <tr style={{ background:'#c6282818' }}>
                  <td colSpan={compare&&prevData?4:2} style={{ padding:'9px 14px', fontWeight:800, fontSize:11, color:'#c62828', letterSpacing:1 }}>
                    OPERATING EXPENSES
                  </td>
                </tr>
                {data.expense.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding:'12px 28px', color:'#aab2bd', fontStyle:'italic' }}>No expense entries for this period</td></tr>
                ) : data.expense.map(r => <AccountRow key={r.account_code} account={r} compare={compare&&!!prevData} />)}
                <SectionTotal
                  label="Total Expenses"
                  amount={data.totalExpense}
                  prevAmount={prevData?.totalExpense}
                  compare={compare&&!!prevData}
                />

                <tr><td colSpan={4} style={{ height:10, background:'#f9fafb' }} /></tr>

                {/* NET */}
                <SectionTotal
                  label={net >= 0 ? '📈 NET PROFIT' : '📉 NET LOSS'}
                  amount={net}
                  prevAmount={prevData ? prevData.totalIncome - prevData.totalExpense : undefined}
                  compare={compare&&!!prevData}
                  highlight
                />
              </tbody>
            </table>
          </div>

          {/* Waterfall bar */}
          {data.totalIncome > 0 && (
            <div style={{ ...S.card, marginTop:10 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:10 }}>REVENUE WATERFALL</div>
              <div style={{ display:'flex', alignItems:'center', gap:2, height:28 }}>
                <div style={{ flex: data.totalIncome, background:'#1565C0', borderRadius:'4px 0 0 4px', height:'100%', display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:6 }}>
                  <span style={{ color:'#fff', fontSize:10, fontWeight:700 }}>Revenue {fmt(data.totalIncome)}</span>
                </div>
                <div style={{ flex: data.totalExpense, background:'#c62828', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <span style={{ color:'#fff', fontSize:10, fontWeight:700 }}>Expenses ({fmt(data.totalExpense)})</span>
                </div>
                {net > 0 && (
                  <div style={{ flex: net, background:'#2e7d32', borderRadius:'0 4px 4px 0', height:'100%', display:'flex', alignItems:'center', paddingLeft:6 }}>
                    <span style={{ color:'#fff', fontSize:10, fontWeight:700 }}>Profit {fmt(net)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ marginTop:4, fontSize:11, color:'#aab2bd' }}>
            Revenue: accounts with type INCOME. Expenses: accounts with type EXPENSE. Period is exclusive of opening balances.
          </div>
        </>
      )}
    </div>
  )
}
