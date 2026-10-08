import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// Management Report / Board Pack — Phase 21
//
// Executive one-page KPI summary across all entities or per-entity.
// Pulls from: ledger_entries, employees, chart_of_accounts,
//             invoices, cheques (if available).
// No new SQL.
// ═══════════════════════════════════════════════════════════════════

const ENTITIES = [
  { code:'RAT',    name:'Ratal Tours & Travels',      color:'#1565C0' },
  { code:'GWT',    name:'Green Wings Travel',          color:'#2E7D32' },
  { code:'ACCSYS', name:'Ratal Advanced Technologies', color:'#5A32D4' },
]

const DR_NORMAL = new Set(['BANK','CASH','ASSET','CUSTOMER','CONTRACTOR','EMPLOYEE','EXPENSE','CLEARING','INTERNAL','SUBCON'])
const INCOME_T  = new Set(['INCOME'])
const EXPENSE_T = new Set(['EXPENSE'])
const ASSET_T   = new Set(['BANK','CASH','ASSET','CUSTOMER','CONTRACTOR','SUBCON','CLEARING','EMPLOYEE'])
const LIAB_T    = new Set(['SUPPLIER','GOVERNMENT','LIABILITY'])
const EQUITY_T  = new Set(['EQUITY'])

const today  = () => new Date().toISOString().slice(0,10)
const thisYr = () => `${new Date().getFullYear()}-01-01`
const lastYrFrom = () => `${new Date().getFullYear()-1}-01-01`
const lastYrTo   = () => `${new Date().getFullYear()-1}-12-31`

const fmt  = n => (+n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})
const fmtN = n => {
  const v=+n||0
  if(Math.abs(v)>=1e9) return (v/1e9).toFixed(2)+'B'
  if(Math.abs(v)>=1e6) return (v/1e6).toFixed(2)+'M'
  if(Math.abs(v)>=1e3) return (v/1e3).toFixed(1)+'K'
  return v.toFixed(0)
}
const pct = (a,b) => (!b||!a) ? null : ((a-b)/Math.abs(b)*100).toFixed(1)
const arrow = v => v===null ? '' : +v>0 ? '▲' : +v<0 ? '▼' : '→'
const arrowColor = (v,goodUp=true) => v===null ? '#6b7c93' : (+v>0&&goodUp)||( +v<0&&!goodUp) ? '#2e7d32' : '#c62828'

async function fetchEntityKPIs(entityId, from, to) {
  const [leRes, coaRes, empRes] = await Promise.all([
    supabase.from('ledger_entries').select('account_code, debit, credit, voucher_type')
      .eq('entity_id', entityId).neq('voucher_type','INTER')
      .gte('entry_date', from).lte('entry_date', to),
    supabase.from('chart_of_accounts').select('account_code, account_type, opening_debit, opening_credit')
      .eq('entity_id', entityId),
    supabase.from('employees').select('id').eq('entity_id', entityId).eq('is_active', true),
  ])

  const coa  = coaRes.data||[]
  const le   = leRes.data||[]
  const emp  = empRes.data||[]

  const coaMap = Object.fromEntries(coa.map(r=>[r.account_code,r]))

  // Aggregate movements
  const movMap = {}
  for (const e of le) {
    if (!movMap[e.account_code]) movMap[e.account_code] = { dr:0, cr:0 }
    movMap[e.account_code].dr += +e.debit||0
    movMap[e.account_code].cr += +e.credit||0
  }

  function sumByType(typeSet, useNet=false) {
    return coa
      .filter(a=>typeSet.has((a.account_type||'').toUpperCase()))
      .reduce((s,a)=>{
        const type  = (a.account_type||'').toUpperCase()
        const opDr  = +a.opening_debit||0, opCr = +a.opening_credit||0
        const movDr = movMap[a.account_code]?.dr||0, movCr = movMap[a.account_code]?.cr||0
        const bal   = DR_NORMAL.has(type) ? (opDr+movDr)-(opCr+movCr) : (opCr+movCr)-(opDr+movDr)
        return s + (useNet ? bal : Math.max(0,bal))
      }, 0)
  }

  // P&L
  const revenue   = sumByType(INCOME_T, true)
  const expenses  = sumByType(EXPENSE_T, true)
  const netProfit = revenue - expenses
  const margin    = revenue > 0 ? (netProfit/revenue*100) : 0

  // Balance sheet
  const totalAssets   = sumByType(ASSET_T)
  const totalLiab     = sumByType(LIAB_T)
  const equity        = sumByType(EQUITY_T, true)
  const totalEquity   = equity + netProfit

  // Cash
  const cash = coa
    .filter(a=>['BANK','CASH'].includes((a.account_type||'').toUpperCase()))
    .reduce((s,a)=>{
      const movDr=movMap[a.account_code]?.dr||0, movCr=movMap[a.account_code]?.cr||0
      const opDr=+a.opening_debit||0, opCr=+a.opening_credit||0
      return s + Math.max(0,(opDr+movDr)-(opCr+movCr))
    },0)

  // AR
  const ar = coa
    .filter(a=>(a.account_type||'').toUpperCase()==='CUSTOMER')
    .reduce((s,a)=>{
      const movDr=movMap[a.account_code]?.dr||0, movCr=movMap[a.account_code]?.cr||0
      const opDr=+a.opening_debit||0, opCr=+a.opening_credit||0
      return s + Math.max(0,(opDr+movDr)-(opCr+movCr))
    },0)

  return {
    revenue, expenses, netProfit, margin,
    totalAssets, totalLiab, totalEquity, cash, ar,
    headcount: emp.length,
    revenuePerHead: emp.length ? revenue/emp.length : 0,
    currentRatio: totalLiab > 0 ? totalAssets/totalLiab : null,
    debtToEquity: totalEquity > 0 ? totalLiab/totalEquity : null,
  }
}

// ── KPI tile ─────────────────────────────────────────────────────
function KPITile({ label, value, prev, unit='SAR', icon, goodUp=true, color='#1565C0', large }) {
  const chg = pct(value, prev)
  const arr = arrow(chg)
  const ac  = arrowColor(chg, goodUp)

  return (
    <div style={{ background:'#fff', borderRadius:14, padding:large?'18px 20px':'12px 14px',
      boxShadow:'0 2px 10px rgba(0,0,0,0.07)', borderLeft:`4px solid ${color}` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
        <div style={{ fontSize:11, color:'#6b7c93', fontWeight:600 }}>{label}</div>
        {icon && <span style={{ fontSize:16 }}>{icon}</span>}
      </div>
      <div style={{ fontWeight:800, fontSize:large?26:18, color, lineHeight:1 }}>
        {unit==='SAR' ? fmtN(value)+' SAR' :
         unit==='%'   ? (value||0).toFixed(1)+'%' :
         unit==='×'   ? (value||0).toFixed(2)+'×' :
         unit==='days'? (value||0).toFixed(0)+' days' :
         value}
      </div>
      {prev !== undefined && chg !== null && (
        <div style={{ fontSize:11, color:ac, marginTop:6, fontWeight:600 }}>
          {arr} {Math.abs(+chg)}% vs prior year
        </div>
      )}
    </div>
  )
}

// ── Entity column ─────────────────────────────────────────────────
function EntityColumn({ entity, kpi, prevKpi, color }) {
  const np = kpi?.netProfit||0
  return (
    <div style={{ background:'#fff', borderRadius:14, overflow:'hidden', boxShadow:'0 2px 10px rgba(0,0,0,0.07)' }}>
      <div style={{ background:color, padding:'12px 16px', color:'#fff' }}>
        <div style={{ fontWeight:800, fontSize:14 }}>{entity.name}</div>
        <div style={{ fontSize:10, opacity:0.8 }}>{entity.code}</div>
      </div>
      <div style={{ padding:'14px 16px' }}>
        {[
          { label:'Revenue',    val:kpi?.revenue,   prev:prevKpi?.revenue,   unit:'SAR', color:'#1565C0', goodUp:true },
          { label:'Expenses',   val:kpi?.expenses,  prev:prevKpi?.expenses,  unit:'SAR', color:'#c62828', goodUp:false },
          { label:'Net Profit', val:kpi?.netProfit, prev:prevKpi?.netProfit, unit:'SAR', color:np>=0?'#2e7d32':'#c62828', goodUp:true },
          { label:'Margin',     val:kpi?.margin,    prev:prevKpi?.margin,    unit:'%',   color:'#5A32D4', goodUp:true },
          { label:'Cash',       val:kpi?.cash,      prev:prevKpi?.cash,      unit:'SAR', color:'#00695c', goodUp:true },
          { label:'Headcount',  val:kpi?.headcount, prev:prevKpi?.headcount, unit:'#',   color:'#546e7a', goodUp:true },
        ].map(k=>(
          <div key={k.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid #f0f4f8' }}>
            <span style={{ fontSize:11, color:'#6b7c93' }}>{k.label}</span>
            <span style={{ fontWeight:800, fontSize:13, color:k.color }}>
              {k.unit==='SAR'?fmtN(k.val)+' SAR':k.unit==='%'?(k.val||0).toFixed(1)+'%':k.val}
              {prevKpi && pct(k.val,k[k.label.toLowerCase()+'_prev'])!==null && (
                <span style={{ fontSize:9, color:arrowColor(pct(k.val,prevKpi[Object.keys(prevKpi)[0]]),k.goodUp), marginLeft:4 }}>
                  {arrow(pct(k.val,Object.values(prevKpi)[0]))}{Math.abs(+pct(k.val,Object.values(prevKpi)[0])||0).toFixed(0)}%
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════
export default function ManagementReport({ entityId }) {
  const now = new Date()
  const [from,     setFrom]     = useState(thisYr())
  const [to,       setTo]       = useState(today())
  const [kpis,     setKpis]     = useState({})
  const [prevKpis, setPrevKpis] = useState({})
  const [loading,  setLoading]  = useState(true)
  const [entities, setEntities] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    // Get all entities
    const { data: rawEnts } = await supabase.from('entities').select('id, entity_code, entity_name')
    const ents = (rawEnts||[]).map(e=>({...e, code:e.entity_code, name:e.entity_name}))
    setEntities(ents)

    // Fetch KPIs for each entity
    const kpiMap  = {}
    const prevMap = {}
    for (const ent of (ents||[])) {
      kpiMap[ent.id]  = await fetchEntityKPIs(ent.id, from, to)
      prevMap[ent.id] = await fetchEntityKPIs(ent.id, lastYrFrom(), lastYrTo())
    }
    setKpis(kpiMap)
    setPrevKpis(prevMap)
    setLoading(false)
  }, [from, to])

  useEffect(() => { load() }, [load])

  // Group totals
  const totalRevenue  = Object.values(kpis).reduce((s,k)=>s+(k?.revenue||0),0)
  const totalExpenses = Object.values(kpis).reduce((s,k)=>s+(k?.expenses||0),0)
  const totalProfit   = Object.values(kpis).reduce((s,k)=>s+(k?.netProfit||0),0)
  const totalCash     = Object.values(kpis).reduce((s,k)=>s+(k?.cash||0),0)
  const totalHead     = Object.values(kpis).reduce((s,k)=>s+(k?.headcount||0),0)
  const groupMargin   = totalRevenue > 0 ? (totalProfit/totalRevenue*100) : 0

  const prevRevenue  = Object.values(prevKpis).reduce((s,k)=>s+(k?.revenue||0),0)
  const prevProfit   = Object.values(prevKpis).reduce((s,k)=>s+(k?.netProfit||0),0)
  const prevHead     = Object.values(prevKpis).reduce((s,k)=>s+(k?.headcount||0),0)

  const reportDate = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'})

  function printReport() { window.print() }

  const S = {
    card: { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:12 },
    input:{ padding:'8px 10px', borderRadius:8, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff' },
    label:{ display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
  }

  return (
    <div>
      {/* Header */}
      <div style={{ ...S.card, background:'#1a2e3d', color:'#fff', marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontSize:12, color:'#90a4ae', marginTop:4 }}>
              Ratal Group — Board Pack · {reportDate}
            </div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
            <div>
              <label style={{ ...S.label, color:'#90a4ae' }}>From</label>
              <input type="date" style={{ ...S.input, background:'#2a3f50', color:'#fff', border:'1px solid #546e7a', width:150 }}
                value={from} onChange={e=>setFrom(e.target.value)} />
            </div>
            <div>
              <label style={{ ...S.label, color:'#90a4ae' }}>To</label>
              <input type="date" style={{ ...S.input, background:'#2a3f50', color:'#fff', border:'1px solid #546e7a', width:150 }}
                value={to} onChange={e=>setTo(e.target.value)} />
            </div>
            <button onClick={load} style={{ background:'#1565C0', color:'#fff', border:'none', borderRadius:8, padding:'8px 14px', fontWeight:700, fontSize:12, cursor:'pointer' }}>↻ Refresh</button>
            <button onClick={printReport} style={{ background:'#2e7d32', color:'#fff', border:'none', borderRadius:8, padding:'8px 14px', fontWeight:700, fontSize:12, cursor:'pointer' }}>🖨 Print</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:80, color:'#6b7c93' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>📊</div>
          Compiling board pack…
        </div>
      ) : (
        <>
          {/* ── 1. Group Overview ──────────────────────────────────── */}
          <div style={{ fontSize:11, fontWeight:800, color:'#6b7c93', letterSpacing:1, marginBottom:8 }}>GROUP OVERVIEW</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:8, marginBottom:14 }}>
            <KPITile label="Group Revenue"    value={totalRevenue}  prev={prevRevenue}  unit="SAR" icon="💰" color="#1565C0" large goodUp />
            <KPITile label="Group Net Profit" value={totalProfit}   prev={prevProfit}   unit="SAR" icon={totalProfit>=0?'📈':'📉'} color={totalProfit>=0?'#2e7d32':'#c62828'} large goodUp />
            <KPITile label="Net Margin"       value={groupMargin}   unit="%"  icon="%" color="#5A32D4" goodUp />
            <KPITile label="Total Expenses"   value={totalExpenses} unit="SAR" icon="📤" color="#c62828" goodUp={false} />
            <KPITile label="Total Cash"       value={totalCash}     unit="SAR" icon="🏦" color="#00695c" goodUp />
            <KPITile label="Total Headcount"  value={totalHead}     prev={prevHead} unit="#" icon="👥" color="#546e7a" goodUp />
          </div>

          {/* Revenue contribution pie-style bar */}
          <div style={{ ...S.card }}>
            <div style={{ fontSize:11, fontWeight:800, color:'#6b7c93', letterSpacing:1, marginBottom:10 }}>REVENUE MIX BY ENTITY</div>
            <div style={{ display:'flex', height:20, borderRadius:6, overflow:'hidden', marginBottom:8 }}>
              {entities.map(ent=>{
                const k = kpis[ent.id]
                const pctVal = totalRevenue > 0 ? (k?.revenue||0)/totalRevenue*100 : 0
                const ec = ENTITIES.find(e=>e.code===ent.code)?.color||'#546e7a'
                return pctVal > 0 ? <div key={ent.id} style={{ width:`${pctVal}%`, background:ec, transition:'width 0.5s' }} /> : null
              })}
            </div>
            <div style={{ display:'flex', gap:16, flexWrap:'wrap', fontSize:11 }}>
              {entities.map(ent=>{
                const k   = kpis[ent.id]
                const pct = totalRevenue > 0 ? ((k?.revenue||0)/totalRevenue*100).toFixed(0) : 0
                const ec  = ENTITIES.find(e=>e.code===ent.code)?.color||'#546e7a'
                return (
                  <span key={ent.id}>
                    <span style={{ display:'inline-block', width:10, height:10, background:ec, borderRadius:2, marginRight:4 }}/>
                    {ent.code} {pct}% ({fmtN(k?.revenue||0)} SAR)
                  </span>
                )
              })}
            </div>
          </div>

          {/* ── 2. Entity columns ──────────────────────────────────── */}
          <div style={{ fontSize:11, fontWeight:800, color:'#6b7c93', letterSpacing:1, marginBottom:8, marginTop:4 }}>ENTITY BREAKDOWN</div>
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${entities.length},1fr)`, gap:10, marginBottom:14 }}>
            {entities.map(ent=>{
              const color = ENTITIES.find(e=>e.code===ent.code)?.color||'#546e7a'
              return (
                <EntityColumn key={ent.id} entity={ent}
                  kpi={kpis[ent.id]} prevKpi={prevKpis[ent.id]} color={color} />
              )
            })}
          </div>

          {/* ── 3. P&L Summary table ────────────────────────────────── */}
          <div style={{ fontSize:11, fontWeight:800, color:'#6b7c93', letterSpacing:1, marginBottom:8 }}>CONSOLIDATED P&L SUMMARY</div>
          <div style={{ background:'#fff', borderRadius:14, overflow:'auto', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:14 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:500 }}>
              <thead>
                <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                  <th style={{ padding:'12px 14px', textAlign:'left', fontSize:12 }}>Item</th>
                  {entities.map(e=>(
                    <th key={e.id} style={{ padding:'12px 14px', textAlign:'right', fontSize:12,
                      color:ENTITIES.find(x=>x.code===e.code)?.color||'#90caf9' }}>
                      {e.code}
                    </th>
                  ))}
                  <th style={{ padding:'12px 14px', textAlign:'right', fontSize:12 }}>GROUP TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label:'Revenue',       key:'revenue',   color:'#1565C0', bold:false },
                  { label:'Total Expenses',key:'expenses',  color:'#c62828', bold:false },
                  { label:'Net Profit',    key:'netProfit', color:'#2e7d32', bold:true },
                  { label:'Net Margin %',  key:'margin',    color:'#5A32D4', bold:false, pct:true },
                  { label:'Cash Balance',  key:'cash',      color:'#00695c', bold:false },
                  { label:'Total Assets',  key:'totalAssets',color:'#546e7a',bold:false },
                  { label:'Total Liabilities',key:'totalLiab',color:'#c62828',bold:false },
                  { label:'Total Equity',  key:'totalEquity',color:'#5A32D4',bold:true },
                  { label:'Headcount',     key:'headcount', color:'#546e7a', bold:false, num:true },
                ].map(row=>{
                  const groupVal = row.key==='netProfit' ? totalProfit :
                                   row.key==='revenue'   ? totalRevenue :
                                   row.key==='expenses'  ? totalExpenses :
                                   row.key==='cash'      ? totalCash :
                                   row.key==='margin'    ? groupMargin :
                                   row.key==='headcount' ? totalHead :
                                   Object.values(kpis).reduce((s,k)=>s+(k?.[row.key]||0),0)
                  return (
                    <tr key={row.label} style={{ borderBottom:'1px solid #f0f4f8', background:row.bold?'#f8f9ff':'#fff' }}>
                      <td style={{ padding:'10px 14px', fontSize:13, fontWeight:row.bold?800:500, color:'#1a2e3d' }}>{row.label}</td>
                      {entities.map(ent=>{
                        const v = kpis[ent.id]?.[row.key]||0
                        return (
                          <td key={ent.id} style={{ padding:'10px 14px', textAlign:'right', fontSize:13, fontWeight:row.bold?800:500, color:row.key==='netProfit'&&v<0?'#c62828':row.color }}>
                            {row.pct ? `${(v||0).toFixed(1)}%` : row.num ? v : `${fmtN(v)} SAR`}
                          </td>
                        )
                      })}
                      <td style={{ padding:'10px 14px', textAlign:'right', fontSize:13, fontWeight:800,
                        color:row.key==='netProfit'&&groupVal<0?'#c62828':row.color, background:'#f0f4f8' }}>
                        {row.pct ? `${(groupVal||0).toFixed(1)}%` : row.num ? groupVal : `${fmtN(groupVal)} SAR`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ── 4. YTD vs Prior Year summary ────────────────────────── */}
          <div style={{ ...S.card }}>
            <div style={{ fontSize:11, fontWeight:800, color:'#6b7c93', letterSpacing:1, marginBottom:12 }}>YTD vs PRIOR YEAR</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:8 }}>
              {[
                { label:'Revenue',    curr:totalRevenue,  prev:prevRevenue,  goodUp:true,  color:'#1565C0' },
                { label:'Net Profit', curr:totalProfit,   prev:prevProfit,   goodUp:true,  color:totalProfit>=0?'#2e7d32':'#c62828' },
                { label:'Headcount',  curr:totalHead,     prev:prevHead,     goodUp:true,  color:'#546e7a' },
              ].map(k=>{
                const chg = pct(k.curr, k.prev)
                return (
                  <div key={k.label} style={{ padding:'14px 16px', borderRadius:12, background:'#f5f7fa', borderLeft:`4px solid ${k.color}` }}>
                    <div style={{ fontSize:11, color:'#6b7c93', marginBottom:6 }}>{k.label}</div>
                    <div style={{ display:'flex', gap:16 }}>
                      <div>
                        <div style={{ fontWeight:800, fontSize:16, color:k.color }}>{fmtN(k.curr)}</div>
                        <div style={{ fontSize:10, color:'#6b7c93' }}>Current</div>
                      </div>
                      <div>
                        <div style={{ fontWeight:600, fontSize:14, color:'#6b7c93' }}>{fmtN(k.prev)}</div>
                        <div style={{ fontSize:10, color:'#6b7c93' }}>Prior year</div>
                      </div>
                      {chg !== null && (
                        <div>
                          <div style={{ fontWeight:800, fontSize:14, color:arrowColor(chg,k.goodUp) }}>{arrow(chg)} {Math.abs(+chg).toFixed(1)}%</div>
                          <div style={{ fontSize:10, color:'#6b7c93' }}>Change</div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Footer */}
          <div style={{ fontSize:10, color:'#aab2bd', padding:'8px 4px', marginTop:4 }}>
            This management report is auto-generated from the GL. All figures in SAR unless stated.
            Intercompany transactions excluded from P&L. Prior year = Jan–Dec {now.getFullYear()-1}.
          </div>
        </>
      )}
    </div>
  )
}
