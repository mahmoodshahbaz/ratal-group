import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// Department P&L — Phase 14   (Cost Center Reporting)
//
// Tab 1 — Single Department   : full P&L for one department
// Tab 2 — All Departments     : side-by-side comparison matrix
// Tab 3 — Top Expenses        : ranked expense breakdown by dept
//
// Data source: ledger_entries filtered by `department` column
// IC entries (voucher_type='INTER') excluded to avoid double-counting
// ═══════════════════════════════════════════════════════════════════

const INCOME_TYPES  = new Set(['INCOME'])
const EXPENSE_TYPES = new Set(['EXPENSE'])
// Accounts with no normal-side assignment default to GL normal convention
const DR_NORMAL     = new Set(['BANK','CASH','ASSET','CUSTOMER','CONTRACTOR','EMPLOYEE','EXPENSE','CLEARING','INTERNAL','SUBCON'])

const S = {
  card: { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:10 },
  btn:  (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  btnO: (c='#1a2e3d') => ({ background:'transparent', color:c, border:`1.5px solid ${c}`, borderRadius:8, padding:'7px 15px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:  { padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff' },
  lbl:  { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
}

const fmt    = n  => (+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtPct = p  => (isFinite(p) ? p.toFixed(1) : '—') + '%'
const today  = () => new Date().toISOString().slice(0,10)
const thisYear = () => `${new Date().getFullYear()}-01-01`

// Presets
const PRESETS = [
  { label:'This Month', from:()=>{ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }, to:today },
  { label:'Last Month', from:()=>{ const d=new Date(); d.setMonth(d.getMonth()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` },
    to:()=>{ const d=new Date(); d.setDate(0); return d.toISOString().slice(0,10) } },
  { label:'YTD', from:thisYear, to:today },
  { label:'Q1', from:()=>{ const y=new Date().getFullYear(); return `${y}-01-01` }, to:()=>{ const y=new Date().getFullYear(); return `${y}-03-31` } },
  { label:'Q2', from:()=>{ const y=new Date().getFullYear(); return `${y}-04-01` }, to:()=>{ const y=new Date().getFullYear(); return `${y}-06-30` } },
  { label:'Q3', from:()=>{ const y=new Date().getFullYear(); return `${y}-07-01` }, to:()=>{ const y=new Date().getFullYear(); return `${y}-09-30` } },
  { label:'Q4', from:()=>{ const y=new Date().getFullYear(); return `${y}-10-01` }, to:()=>{ const y=new Date().getFullYear(); return `${y}-12-31` } },
]

// Colour ramp for departments
const DEPT_COLORS = ['#1565C0','#2e7d32','#5A32D4','#e65100','#c62828','#00838f','#6a1b9a','#558b2f']
const deptColor = (i) => DEPT_COLORS[i % DEPT_COLORS.length]

// ── Core data fetcher ─────────────────────────────────────────────────────────
async function fetchDeptData(entityId, from, to, dept) {
  let q = supabase
    .from('ledger_entries')
    .select('department, account_code, account_name, debit, credit, voucher_type')
    .eq('entity_id', entityId)
    .neq('voucher_type', 'INTER')   // strip IC charges
  if (from) q = q.gte('entry_date', from)
  if (to)   q = q.lte('entry_date', to)
  if (dept && dept !== 'ALL') q = q.eq('department', dept)

  const [leRes, coaRes] = await Promise.all([
    q,
    supabase.from('chart_of_accounts')
      .select('account_code, account_name, account_type')
      .eq('entity_id', entityId),
  ])

  const entries = leRes.data || []
  const coaMap  = Object.fromEntries((coaRes.data||[]).map(r=>[r.account_code,r]))

  return { entries, coaMap }
}

// Aggregate entries into account-level rows for a specific dept (or all)
function buildPL(entries, coaMap, dept) {
  const filtered = dept && dept !== 'ALL'
    ? entries.filter(e=>e.department === dept)
    : entries

  const accMap = {}
  for (const e of filtered) {
    const meta = coaMap[e.account_code] || { account_name: e.account_name||e.account_code, account_type:'?' }
    const type = (meta.account_type||'').toUpperCase()
    if (!INCOME_TYPES.has(type) && !EXPENSE_TYPES.has(type)) continue
    if (!accMap[e.account_code]) accMap[e.account_code] = { ...meta, dr:0, cr:0 }
    accMap[e.account_code].dr += +e.debit  ||0
    accMap[e.account_code].cr += +e.credit ||0
  }

  const income  = []
  const expense = []
  for (const [code, a] of Object.entries(accMap)) {
    const balance = INCOME_TYPES.has(a.account_type)
      ? (a.cr - a.dr)
      : (a.dr - a.cr)
    const row = { code, account_name:a.account_name, account_type:a.account_type, balance }
    if (INCOME_TYPES.has(a.account_type))  income.push(row)
    else                                   expense.push(row)
  }

  income.sort((a,b)=>b.balance-a.balance)
  expense.sort((a,b)=>b.balance-a.balance)

  const totalIncome  = income.reduce((s,r)=>s+r.balance,0)
  const totalExpense = expense.reduce((s,r)=>s+r.balance,0)
  const netProfit    = totalIncome - totalExpense

  return { income, expense, totalIncome, totalExpense, netProfit }
}

// Get distinct department names from entries
function getDepartments(entries) {
  const set = new Set(entries.map(e=>e.department).filter(Boolean))
  return [...set].sort()
}

// ═══════════════════════════════════════════════════════════════════
// Tab 1 — Single Department P&L
// ═══════════════════════════════════════════════════════════════════
function SingleDeptPL({ entityId }) {
  const [from,     setFrom]     = useState(thisYear())
  const [to,       setTo]       = useState(today())
  const [depts,    setDepts]    = useState([])
  const [selDept,  setSelDept]  = useState('ALL')
  const [pl,       setPL]       = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [expand,   setExpand]   = useState({ income:true, expense:true })

  const load = useCallback(async () => {
    setLoading(true)
    const { entries, coaMap } = await fetchDeptData(entityId, from, to)
    const ds = getDepartments(entries)
    setDepts(ds)
    if (selDept !== 'ALL' && !ds.includes(selDept)) setSelDept('ALL')
    setPL(buildPL(entries, coaMap, selDept))
    setLoading(false)
  }, [entityId, from, to, selDept])

  useEffect(() => { load() }, [load])

  function applyPreset(p) { setFrom(p.from()); setTo(p.to()) }

  function exportCSV() {
    if (!pl) return
    const rows = [
      [`Department P&L — ${selDept==='ALL'?'All Departments':selDept} — ${from} to ${to}`],[],
      ['Code','Account','Balance'],
      ['INCOME'],
      ...pl.income.map(r=>[r.code,r.account_name,r.balance.toFixed(2)]),
      ['','Total Income',pl.totalIncome.toFixed(2)],[],
      ['EXPENSE'],
      ...pl.expense.map(r=>[r.code,r.account_name,r.balance.toFixed(2)]),
      ['','Total Expense',pl.totalExpense.toFixed(2)],[],
      ['','Net Profit / Loss',pl.netProfit.toFixed(2)],
    ]
    const blob = new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'})
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob)
    a.download=`dept-pl-${selDept}-${from}-${to}.csv`; a.click()
  }

  function printPL() {
    if (!pl) return
    const body = `<html><head><style>
      body{font-family:Arial;margin:30px;font-size:13px;}
      h2{color:#1a2e3d;margin-bottom:4px;}
      .meta{color:#6b7c93;font-size:12px;margin-bottom:20px;}
      table{width:100%;border-collapse:collapse;}
      th{background:#1a2e3d;color:#fff;padding:7px 12px;font-size:11px;text-align:left;}
      td{padding:6px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;}
      .num{text-align:right;font-family:monospace;}
      .sub{background:#f5f7fa;font-weight:700;}
      .tot{background:#1a2e3d;color:#fff;font-weight:700;}
      .sec{background:#e8edf2;font-weight:800;font-size:11px;letter-spacing:1px;}
    </style></head><body>
      <h2>Department P&L — ${selDept==='ALL'?'All Departments':selDept}</h2>
      <div class="meta">Period: ${from} to ${to}</div>
      <table><thead><tr><th>Code</th><th>Account</th><th class="num">SAR</th></tr></thead><tbody>
        <tr class="sec"><td colspan="3">REVENUE</td></tr>
        ${pl.income.map(r=>`<tr><td>${r.code}</td><td>${r.account_name}</td><td class="num">${fmt(r.balance)}</td></tr>`).join('')}
        <tr class="sub"><td colspan="2">Total Revenue</td><td class="num">${fmt(pl.totalIncome)}</td></tr>
        <tr><td colspan="3"></td></tr>
        <tr class="sec"><td colspan="3">EXPENSES</td></tr>
        ${pl.expense.map(r=>`<tr><td>${r.code}</td><td>${r.account_name}</td><td class="num">${fmt(r.balance)}</td></tr>`).join('')}
        <tr class="sub"><td colspan="2">Total Expenses</td><td class="num">${fmt(pl.totalExpense)}</td></tr>
        <tr class="tot"><td colspan="2">${pl.netProfit>=0?'NET PROFIT':'NET LOSS'}</td><td class="num">${fmt(Math.abs(pl.netProfit))}</td></tr>
      </tbody></table>
    </body></html>`
    const w=window.open('','_blank','width=800,height=600')
    w.document.write(body); w.document.close(); w.print()
  }

  const margin = pl && pl.totalIncome ? (pl.netProfit/pl.totalIncome*100) : 0

  return (
    <>
      {/* Controls */}
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div>
          <label style={S.lbl}>Department</label>
          <select style={{ ...S.inp, width:200 }} value={selDept} onChange={e=>setSelDept(e.target.value)}>
            <option value="ALL">All Departments (combined)</option>
            {depts.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div><label style={S.lbl}>From</label>
          <input type="date" style={{ ...S.inp, width:150 }} value={from} onChange={e=>setFrom(e.target.value)} /></div>
        <div><label style={S.lbl}>To</label>
          <input type="date" style={{ ...S.inp, width:150 }} value={to} onChange={e=>setTo(e.target.value)} /></div>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap', alignSelf:'flex-end' }}>
          {PRESETS.map(p=>(
            <button key={p.label} onClick={()=>applyPreset(p)} style={{ ...S.btnO('#546e7a'), fontSize:10, padding:'6px 10px' }}>
              {p.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          <button onClick={exportCSV} style={S.btnO()}>⬇ CSV</button>
          <button onClick={printPL}   style={S.btnO()}>🖨 Print</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading…</div>
      ) : !pl ? null : (
        <>
          {/* KPI strip */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10, marginBottom:14 }}>
            {[
              { label:'Revenue',      val:pl.totalIncome,  color:'#1565C0', fmt:v=>`${fmt(v)} SAR` },
              { label:'Expenses',     val:pl.totalExpense, color:'#c62828', fmt:v=>`${fmt(v)} SAR` },
              { label:pl.netProfit>=0?'Net Profit':'Net Loss', val:Math.abs(pl.netProfit), color:pl.netProfit>=0?'#2e7d32':'#c62828', fmt:v=>`${fmt(v)} SAR` },
              { label:'Profit Margin',val:Math.abs(margin), color:margin>=0?'#2e7d32':'#c62828', fmt:v=>`${v.toFixed(1)}%` },
            ].map(k=>(
              <div key={k.label} style={{ background:'#fff', borderRadius:12, padding:'14px 16px',
                boxShadow:'0 1px 6px rgba(0,0,0,0.07)', borderLeft:`4px solid ${k.color}` }}>
                <div style={{ fontSize:10, color:'#6b7c93' }}>{k.label}</div>
                <div style={{ fontWeight:800, fontSize:20, color:k.color }}>{k.fmt(k.val)}</div>
              </div>
            ))}
          </div>

          {/* P&L table */}
          <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                  <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11, width:80 }}>Code</th>
                  <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Account</th>
                  <th style={{ padding:'9px 14px', textAlign:'right', fontSize:11, width:160 }}>Amount (SAR)</th>
                  <th style={{ padding:'9px 14px', textAlign:'right', fontSize:11, width:80 }}>% of Rev</th>
                </tr>
              </thead>
              <tbody>
                {/* INCOME section */}
                <tr style={{ background:'#e8f5e9' }}
                  onClick={()=>setExpand(x=>({...x,income:!x.income}))}>
                  <td colSpan={4} style={{ padding:'8px 14px', fontWeight:800, fontSize:11, color:'#2e7d32', cursor:'pointer', letterSpacing:1 }}>
                    📈 REVENUE {expand.income?'▲':'▼'}
                  </td>
                </tr>
                {expand.income && pl.income.map((r,i)=>(
                  <tr key={r.code} style={{ borderBottom:'1px solid #f5f5f5', background:i%2?'#fafafa':'#fff' }}>
                    <td style={{ padding:'6px 14px', fontSize:10, color:'#9e9e9e', fontFamily:'monospace' }}>{r.code}</td>
                    <td style={{ padding:'6px 14px', color:'#546e7a' }}>{r.account_name}</td>
                    <td style={{ padding:'6px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:600, color:'#1565C0' }}>{fmt(r.balance)}</td>
                    <td style={{ padding:'6px 14px', textAlign:'right', fontSize:11, color:'#9e9e9e' }}>
                      {pl.totalIncome ? fmtPct(r.balance/pl.totalIncome*100) : '—'}
                    </td>
                  </tr>
                ))}
                <tr style={{ background:'#e8f5e9', borderTop:'2px solid #a5d6a7' }}>
                  <td colSpan={2} style={{ padding:'9px 14px', fontWeight:800, fontSize:13 }}>Total Revenue</td>
                  <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:14, color:'#1565C0' }}>{fmt(pl.totalIncome)}</td>
                  <td style={{ padding:'9px 14px', textAlign:'right', fontWeight:800 }}>100%</td>
                </tr>

                <tr><td colSpan={4} style={{ height:8, background:'#f9fafb' }} /></tr>

                {/* EXPENSE section */}
                <tr style={{ background:'#ffebee' }}
                  onClick={()=>setExpand(x=>({...x,expense:!x.expense}))}>
                  <td colSpan={4} style={{ padding:'8px 14px', fontWeight:800, fontSize:11, color:'#c62828', cursor:'pointer', letterSpacing:1 }}>
                    📉 EXPENSES {expand.expense?'▲':'▼'}
                  </td>
                </tr>
                {expand.expense && pl.expense.map((r,i)=>(
                  <tr key={r.code} style={{ borderBottom:'1px solid #f5f5f5', background:i%2?'#fafafa':'#fff' }}>
                    <td style={{ padding:'6px 14px', fontSize:10, color:'#9e9e9e', fontFamily:'monospace' }}>{r.code}</td>
                    <td style={{ padding:'6px 14px', color:'#546e7a' }}>{r.account_name}</td>
                    <td style={{ padding:'6px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:600, color:'#c62828' }}>{fmt(r.balance)}</td>
                    <td style={{ padding:'6px 14px', textAlign:'right', fontSize:11, color:'#9e9e9e' }}>
                      {pl.totalIncome ? fmtPct(r.balance/pl.totalIncome*100) : '—'}
                    </td>
                  </tr>
                ))}
                <tr style={{ background:'#ffebee', borderTop:'2px solid #ef9a9a' }}>
                  <td colSpan={2} style={{ padding:'9px 14px', fontWeight:800, fontSize:13 }}>Total Expenses</td>
                  <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:14, color:'#c62828' }}>{fmt(pl.totalExpense)}</td>
                  <td style={{ padding:'9px 14px', textAlign:'right', fontWeight:800 }}>
                    {pl.totalIncome ? fmtPct(pl.totalExpense/pl.totalIncome*100) : '—'}
                  </td>
                </tr>

                {/* Net */}
                <tr style={{ background: pl.netProfit>=0?'#e8f5e9':'#ffebee' }}>
                  <td colSpan={2} style={{ padding:'12px 14px', fontWeight:800, fontSize:15, color:pl.netProfit>=0?'#2e7d32':'#c62828' }}>
                    {pl.netProfit>=0?'📈 NET PROFIT':'📉 NET LOSS'}
                  </td>
                  <td style={{ padding:'12px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:16, color:pl.netProfit>=0?'#2e7d32':'#c62828' }}>
                    {pl.netProfit>=0?'+':'-'}{fmt(Math.abs(pl.netProfit))}
                  </td>
                  <td style={{ padding:'12px 14px', textAlign:'right', fontWeight:800, color:pl.netProfit>=0?'#2e7d32':'#c62828' }}>
                    {fmtPct(Math.abs(margin))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {pl.income.length===0 && pl.expense.length===0 && (
            <div style={{ textAlign:'center', padding:40, color:'#aab2bd', fontSize:13 }}>
              No income or expense entries found for this department and period.
            </div>
          )}
        </>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 2 — All Departments Side-by-Side
// ═══════════════════════════════════════════════════════════════════
function AllDeptMatrix({ entityId }) {
  const [from,    setFrom]    = useState(thisYear())
  const [to,      setTo]      = useState(today())
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { entries, coaMap } = await fetchDeptData(entityId, from, to)
    const depts = getDepartments(entries)

    // Build PL per department
    const matrix = {}
    for (const d of depts) {
      matrix[d] = buildPL(entries, coaMap, d)
    }
    // Also compute unallocated (no department)
    const unalloc = buildPL(
      entries.filter(e=>!e.department),
      coaMap, null
    )
    if (unalloc.income.length || unalloc.expense.length) {
      matrix['(Unallocated)'] = unalloc
    }

    setData({ depts: Object.keys(matrix), matrix })
    setLoading(false)
  }, [entityId, from, to])

  useEffect(() => { load() }, [load])

  function exportCSV() {
    if (!data) return
    const cols = data.depts
    const header = ['Metric', ...cols, 'TOTAL']
    const totRevenue  = cols.reduce((s,d)=>s+data.matrix[d].totalIncome,0)
    const totExpense  = cols.reduce((s,d)=>s+data.matrix[d].totalExpense,0)
    const totProfit   = totRevenue - totExpense
    const rows = [
      header,
      ['Revenue', ...cols.map(d=>data.matrix[d].totalIncome.toFixed(2)), totRevenue.toFixed(2)],
      ['Expenses',...cols.map(d=>data.matrix[d].totalExpense.toFixed(2)), totExpense.toFixed(2)],
      ['Net Profit',...cols.map(d=>data.matrix[d].netProfit.toFixed(2)), totProfit.toFixed(2)],
      ['Margin %',...cols.map(d=>{const m=data.matrix[d]; return m.totalIncome?(m.netProfit/m.totalIncome*100).toFixed(1)+'%':'0%'}),
        totRevenue?(totProfit/totRevenue*100).toFixed(1)+'%':'0%'],
    ]
    const blob=new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'})
    const a=document.createElement('a');a.href=URL.createObjectURL(blob)
    a.download=`dept-matrix-${from}-${to}.csv`;a.click()
  }

  return (
    <>
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div><label style={S.lbl}>From</label>
          <input type="date" style={{ ...S.inp, width:150 }} value={from} onChange={e=>setFrom(e.target.value)} /></div>
        <div><label style={S.lbl}>To</label>
          <input type="date" style={{ ...S.inp, width:150 }} value={to} onChange={e=>setTo(e.target.value)} /></div>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap', alignSelf:'flex-end' }}>
          {PRESETS.slice(0,4).map(p=>(
            <button key={p.label} onClick={()=>{ setFrom(p.from()); setTo(p.to()) }}
              style={{ ...S.btnO('#546e7a'), fontSize:10, padding:'6px 10px' }}>{p.label}</button>
          ))}
        </div>
        <button onClick={exportCSV} style={{ ...S.btnO(), marginLeft:'auto' }}>⬇ CSV</button>
        <button onClick={load} style={S.btn()}>↻ Refresh</button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading…</div>
      ) : !data || data.depts.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>No department data found for this period.</div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display:'flex', gap:10, marginBottom:14, overflowX:'auto', flexWrap:'nowrap', paddingBottom:2 }}>
            {data.depts.map((d,i)=>{
              const pl = data.matrix[d]
              const color = deptColor(i)
              return (
                <div key={d} style={{ flex:'1 1 160px', minWidth:150, background:'#fff', borderRadius:12,
                  padding:'14px 16px', boxShadow:'0 1px 6px rgba(0,0,0,0.07)', borderLeft:`4px solid ${color}` }}>
                  <div style={{ fontSize:11, fontWeight:700, color, marginBottom:4 }}>{d}</div>
                  <div style={{ fontSize:11, color:'#6b7c93' }}>Rev: <strong>{fmt(pl.totalIncome)}</strong></div>
                  <div style={{ fontSize:11, color:'#6b7c93' }}>Exp: <strong>{fmt(pl.totalExpense)}</strong></div>
                  <div style={{ fontWeight:800, fontSize:15, color:pl.netProfit>=0?'#2e7d32':'#c62828', marginTop:4 }}>
                    {pl.netProfit>=0?'+':''}{fmt(pl.netProfit)}
                  </div>
                  {/* Expense bar */}
                  <div style={{ height:4, background:'#f0f4f8', borderRadius:4, marginTop:8, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${Math.min(100,pl.totalIncome?pl.totalExpense/pl.totalIncome*100:0)}%`,
                      background: pl.netProfit>=0?color:'#c62828', borderRadius:4, transition:'width 0.6s' }} />
                  </div>
                  <div style={{ fontSize:9, color:'#aab2bd', marginTop:3 }}>
                    {pl.totalIncome ? fmtPct(pl.totalExpense/pl.totalIncome*100) : '0%'} cost ratio
                  </div>
                </div>
              )
            })}
          </div>

          {/* Comparison table */}
          <div style={{ ...S.card, padding:0, overflow:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, minWidth:500 }}>
              <thead>
                <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                  <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11, minWidth:140 }}>Metric</th>
                  {data.depts.map((d,i)=>(
                    <th key={d} style={{ padding:'9px 14px', textAlign:'right', fontSize:11, color:deptColor(i)+'cc', minWidth:120 }}>{d}</th>
                  ))}
                  <th style={{ padding:'9px 14px', textAlign:'right', fontSize:11, minWidth:120 }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label:'Revenue', key:'totalIncome', color:'#1565C0' },
                  { label:'Expenses', key:'totalExpense', color:'#c62828' },
                ].map(row=>(
                  <tr key={row.label} style={{ borderBottom:'1px solid #f5f5f5' }}>
                    <td style={{ padding:'8px 14px', fontWeight:600 }}>{row.label}</td>
                    {data.depts.map(d=>(
                      <td key={d} style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', color:row.color }}>
                        {fmt(data.matrix[d][row.key])}
                      </td>
                    ))}
                    <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:row.color }}>
                      {fmt(data.depts.reduce((s,d)=>s+data.matrix[d][row.key],0))}
                    </td>
                  </tr>
                ))}
                {/* Net profit row */}
                <tr style={{ background:'#f5f7fa', borderTop:'2px solid #e0e0e0' }}>
                  <td style={{ padding:'9px 14px', fontWeight:800 }}>Net Profit / Loss</td>
                  {data.depts.map((d,i)=>{
                    const v = data.matrix[d].netProfit
                    return (
                      <td key={d} style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:v>=0?'#2e7d32':'#c62828' }}>
                        {v>=0?'+':''}{fmt(v)}
                      </td>
                    )
                  })}
                  <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:14,
                    color:(()=>{ const t=data.depts.reduce((s,d)=>s+data.matrix[d].netProfit,0); return t>=0?'#2e7d32':'#c62828' })() }}>
                    {(()=>{ const t=data.depts.reduce((s,d)=>s+data.matrix[d].netProfit,0); return (t>=0?'+':'')+fmt(t) })()}
                  </td>
                </tr>
                {/* Margin row */}
                <tr style={{ background:'#f9fafb' }}>
                  <td style={{ padding:'8px 14px', color:'#6b7c93', fontSize:11 }}>Profit Margin</td>
                  {data.depts.map(d=>{
                    const pl = data.matrix[d]
                    const m = pl.totalIncome ? pl.netProfit/pl.totalIncome*100 : 0
                    return (
                      <td key={d} style={{ padding:'8px 14px', textAlign:'right', fontSize:11, fontWeight:600, color:m>=0?'#2e7d32':'#c62828' }}>
                        {fmtPct(m)}
                      </td>
                    )
                  })}
                  <td style={{ padding:'8px 14px', textAlign:'right', fontSize:11, fontWeight:700 }}>
                    {(()=>{
                      const totR=data.depts.reduce((s,d)=>s+data.matrix[d].totalIncome,0)
                      const totP=data.depts.reduce((s,d)=>s+data.matrix[d].netProfit,0)
                      return totR ? fmtPct(totP/totR*100) : '—'
                    })()}
                  </td>
                </tr>
                {/* Cost ratio row */}
                <tr>
                  <td style={{ padding:'8px 14px', color:'#6b7c93', fontSize:11 }}>Cost Ratio</td>
                  {data.depts.map(d=>{
                    const pl = data.matrix[d]
                    const r = pl.totalIncome ? pl.totalExpense/pl.totalIncome*100 : 0
                    return (
                      <td key={d} style={{ padding:'8px 14px', textAlign:'right', fontSize:11, color:r>80?'#c62828':r>60?'#f57f17':'#2e7d32' }}>
                        {fmtPct(r)}
                      </td>
                    )
                  })}
                  <td style={{ padding:'8px 14px', textAlign:'right', fontSize:11 }}>
                    {(()=>{
                      const totR=data.depts.reduce((s,d)=>s+data.matrix[d].totalIncome,0)
                      const totE=data.depts.reduce((s,d)=>s+data.matrix[d].totalExpense,0)
                      return totR ? fmtPct(totE/totR*100) : '—'
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 3 — Top Expenses by Department
// ═══════════════════════════════════════════════════════════════════
function TopExpenses({ entityId }) {
  const [from,    setFrom]    = useState(thisYear())
  const [to,      setTo]      = useState(today())
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { entries, coaMap } = await fetchDeptData(entityId, from, to)

    // Aggregate expense by dept × account
    const accum = {}
    for (const e of entries) {
      const meta = coaMap[e.account_code]
      if (!meta || meta.account_type !== 'EXPENSE') continue
      const key = `${e.department||'(Unallocated)'}||${e.account_code}`
      if (!accum[key]) accum[key] = { dept:e.department||'(Unallocated)', code:e.account_code, name:meta.account_name, amount:0 }
      accum[key].amount += (+e.debit||0) - (+e.credit||0)
    }

    const sorted = Object.values(accum)
      .filter(r=>r.amount > 0)
      .sort((a,b)=>b.amount-a.amount)
      .slice(0,30)

    const total = sorted.reduce((s,r)=>s+r.amount,0)
    setRows(sorted.map(r=>({...r, pct:total?r.amount/total*100:0})))
    setLoading(false)
  }, [entityId, from, to])

  useEffect(() => { load() }, [load])

  const deptIndex = {}
  ;[...new Set(rows.map(r=>r.dept))].forEach((d,i)=>{ deptIndex[d]=i })

  return (
    <>
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div><label style={S.lbl}>From</label>
          <input type="date" style={{ ...S.inp, width:150 }} value={from} onChange={e=>setFrom(e.target.value)} /></div>
        <div><label style={S.lbl}>To</label>
          <input type="date" style={{ ...S.inp, width:150 }} value={to} onChange={e=>setTo(e.target.value)} /></div>
        <button onClick={load} style={{ ...S.btn(), alignSelf:'flex-end' }}>↻ Refresh</button>
        <span style={{ alignSelf:'flex-end', fontSize:11, color:'#6b7c93' }}>Top 30 expense lines</span>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>No expense data.</div>
      ) : (
        <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11, width:40 }}>#</th>
                <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Department</th>
                <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Account</th>
                <th style={{ padding:'9px 14px', textAlign:'right', fontSize:11, width:140 }}>Amount (SAR)</th>
                <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11, width:180 }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r,i)=>{
                const color = deptColor(deptIndex[r.dept]||0)
                return (
                  <tr key={i} style={{ borderBottom:'1px solid #f5f5f5', background:i%2?'#fafafa':'#fff' }}>
                    <td style={{ padding:'7px 14px', color:'#aab2bd', textAlign:'center', fontSize:11 }}>{i+1}</td>
                    <td style={{ padding:'7px 14px' }}>
                      <span style={{ padding:'2px 8px', borderRadius:8, fontSize:10, fontWeight:700,
                        background:color+'18', color }}>{r.dept}</span>
                    </td>
                    <td style={{ padding:'7px 14px', color:'#546e7a' }}>
                      <span style={{ fontSize:10, color:'#9e9e9e', fontFamily:'monospace', marginRight:6 }}>{r.code}</span>
                      {r.name}
                    </td>
                    <td style={{ padding:'7px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#c62828' }}>
                      {fmt(r.amount)}
                    </td>
                    <td style={{ padding:'7px 14px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ flex:1, height:6, background:'#f0f4f8', borderRadius:4, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${r.pct}%`, background:color, borderRadius:4 }} />
                        </div>
                        <span style={{ fontSize:11, color:'#6b7c93', minWidth:36 }}>{r.pct.toFixed(1)}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                <td colSpan={3} style={{ padding:'10px 14px', fontWeight:800 }}>TOTAL</td>
                <td style={{ padding:'10px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:14 }}>
                  {fmt(rows.reduce((s,r)=>s+r.amount,0))}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════
export default function DepartmentPL({ entityId }) {
  const [tab, setTab] = useState('single')

  const TABS = [
    { key:'single',  label:'🏛 Department P&L' },
    { key:'matrix',  label:'📊 All Departments' },
    { key:'top',     label:'🔥 Top Expenses' },
  ]

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>
        Cost centre reporting — per-department income statements, side-by-side comparison, top expense ranking
      </div>

      <div style={{ display:'flex', gap:4, marginBottom:14, borderBottom:'2px solid #f0f4f8' }}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{ padding:'8px 18px', fontSize:12, fontWeight:700, cursor:'pointer', border:'none',
              background:'transparent', borderBottom:tab===t.key?'3px solid #1a2e3d':'3px solid transparent',
              color:tab===t.key?'#1a2e3d':'#6b7c93', marginBottom:-2 }}>
            {t.label}
          </button>
        ))}
      </div>

      {!entityId ? (
        <div style={{ textAlign:'center', padding:80, color:'#aab2bd' }}>Select an entity to continue.</div>
      ) : (
        <>
          {tab === 'single' && <SingleDeptPL entityId={entityId} />}
          {tab === 'matrix' && <AllDeptMatrix entityId={entityId} />}
          {tab === 'top'    && <TopExpenses   entityId={entityId} />}
        </>
      )}
    </div>
  )
}
