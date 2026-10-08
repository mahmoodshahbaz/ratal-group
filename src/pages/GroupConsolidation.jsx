import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// Group Consolidated Reports — Phase 11  (SUPERADMIN only)
//
// Combines ledger_entries across ALL entities, then:
//   • Strips IC entries (voucher_type='INTER') for P&L and Balance Sheet
//   • Nets INTERNAL account balances to zero (IC eliminations) for Trial Balance
//
// Tab 1 — Consolidated Trial Balance
// Tab 2 — Consolidated P&L (Income Statement)
// Tab 3 — Consolidated Balance Sheet
// ═══════════════════════════════════════════════════════════════════

const DR_NORMAL  = new Set(['BANK','CASH','ASSET','CUSTOMER','CONTRACTOR','EMPLOYEE','EXPENSE','CLEARING','INTERNAL','SUBCON'])
const IC_TYPES   = new Set(['INTERNAL','CLEARING'])   // accounts eliminated in consolidation
const ASSET_TYPES  = new Set(['BANK','CASH','CUSTOMER','ASSET','CONTRACTOR','EMPLOYEE','SUBCON'])
const LIAB_TYPES   = new Set(['SUPPLIER','GOVERNMENT','LIABILITY','CLEARING','INTERNAL'])
const EQUITY_TYPES = new Set(['EQUITY'])

const ENTITY_COLORS = { RAT:'#1565C0', GWT:'#2E7D32', ACCSYS:'#5A32D4' }
const ENTITY_LABELS = { RAT:'Ratal Tours', GWT:'Green Wings', ACCSYS:'Ratal Tech' }

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:10 },
  btn:   (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  btnO:  (c='#1a2e3d') => ({ background:'transparent', color:c, border:`1.5px solid ${c}`, borderRadius:8, padding:'7px 15px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:   { padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff' },
  lbl:   { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
}

const fmt  = n => (+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtD = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'

function EntityPill({ code }) {
  const c = ENTITY_COLORS[code]||'#546e7a'
  return <span style={{ padding:'1px 7px', borderRadius:8, fontSize:10, fontWeight:800, background:c+'22', color:c }}>{code}</span>
}

// ── Core data loader ─────────────────────────────────────────────────────────
async function loadGroupData(entities, from, to, stripIC) {
  if (!entities.length) return { entries:[], coa:[] }

  const entityIds = entities.map(e=>e.id)

  let q = supabase
    .from('ledger_entries')
    .select('entity_id, account_code, debit, credit, voucher_type, entry_date')
    .in('entity_id', entityIds)
  if (from) q = q.gte('entry_date', from)
  if (to)   q = q.lte('entry_date', to)
  if (stripIC) q = q.neq('voucher_type', 'INTER')

  const [leRes, coaRes] = await Promise.all([
    q,
    supabase.from('chart_of_accounts')
      .select('entity_id, account_code, account_name, account_type, opening_debit, opening_credit')
      .in('entity_id', entityIds),
  ])

  return { entries: leRes.data||[], coa: coaRes.data||[] }
}

// Aggregate entries into {account_code → {entity_id → {dr,cr}}} map
function aggregateEntries(entries, coa, entities, eliminateIC) {
  // Build COA lookup: account_code → {account_name, account_type} (from any entity, they should match)
  const coaMap = {}
  for (const a of coa) {
    if (!coaMap[a.account_code]) coaMap[a.account_code] = { account_name:a.account_name, account_type:a.account_type, opening:{} }
    coaMap[a.account_code].opening[a.entity_id] = { dr:+a.opening_debit||0, cr:+a.opening_credit||0 }
  }

  // Aggregate movements per account × entity
  const accMap = {}  // account_code → entity_id → {dr, cr}
  for (const e of entries) {
    if (!accMap[e.account_code]) accMap[e.account_code] = {}
    if (!accMap[e.account_code][e.entity_id]) accMap[e.account_code][e.entity_id] = {dr:0,cr:0}
    accMap[e.account_code][e.entity_id].dr += +e.debit  ||0
    accMap[e.account_code][e.entity_id].cr += +e.credit ||0
  }

  // Build result rows
  const rows = []
  for (const [code, entityTotals] of Object.entries(accMap)) {
    const meta   = coaMap[code] || { account_name: code, account_type:'?' }
    const type   = (meta.account_type||'').toUpperCase()

    if (eliminateIC && IC_TYPES.has(type)) continue

    // Per-entity balances
    const perEntity = {}
    let totalDr = 0, totalCr = 0

    for (const ent of entities) {
      const t = entityTotals[ent.id] || {dr:0,cr:0}
      const balance = DR_NORMAL.has(type) ? (t.dr - t.cr) : (t.cr - t.dr)
      perEntity[ent.code] = balance
      totalDr += t.dr
      totalCr += t.cr
    }

    const groupBalance = DR_NORMAL.has(type) ? (totalDr - totalCr) : (totalCr - totalDr)
    if (Math.abs(groupBalance) < 0.005 && Object.values(perEntity).every(v=>Math.abs(v)<0.005)) continue

    rows.push({
      code, account_name: meta.account_name, account_type: type,
      totalDr, totalCr, groupBalance, perEntity,
    })
  }

  rows.sort((a,b) => a.code.localeCompare(b.code))
  return { rows, coaMap }
}

// ═══════════════════════════════════════════════════════════════════
// Tab 1 — Consolidated Trial Balance
// ═══════════════════════════════════════════════════════════════════
function ConsolidatedTB({ entities, from, to }) {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [expand,  setExpand]  = useState({})
  const [elimIC,  setElimIC]  = useState(true)

  useEffect(() => { load() }, [entities, from, to, elimIC])

  async function load() {
    setLoading(true)
    const { entries, coa } = await loadGroupData(entities, from, to, false)
    const { rows: r } = aggregateEntries(entries, coa, entities, elimIC)
    setRows(r)
    setLoading(false)
  }

  function exportCSV() {
    const header = ['Code','Account','Type','Group Dr','Group Cr', ...entities.map(e=>e.code+' Balance')]
    const body   = rows.map(r=>[
      r.code, r.account_name, r.account_type,
      r.totalDr.toFixed(2), r.totalCr.toFixed(2),
      ...entities.map(e=>(r.perEntity[e.code]||0).toFixed(2)),
    ])
    const csv  = [header,...body].map(r=>r.join(',')).join('\n')
    const blob = new Blob([csv],{type:'text/csv'})
    const a=document.createElement('a');a.href=URL.createObjectURL(blob)
    a.download=`group-trial-balance-${to||'consolidated'}.csv`;a.click()
  }

  const totalDr = rows.reduce((s,r)=>s+r.totalDr,0)
  const totalCr = rows.reduce((s,r)=>s+r.totalCr,0)
  const balanced = Math.abs(totalDr - totalCr) < 0.50

  if (loading) return <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Consolidating…</div>

  return (
    <>
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer' }}>
          <input type="checkbox" checked={elimIC} onChange={e=>setElimIC(e.target.checked)} />
          Eliminate IC accounts (INTERNAL / CLEARING)
        </label>
        <button onClick={exportCSV} style={{ ...S.btnO(), marginLeft:'auto' }}>⬇ CSV</button>
        <button onClick={load} style={S.btn()}>↻ Refresh</button>
      </div>

      {/* Balance check */}
      <div style={{ ...S.card, background:balanced?'#e8f5e9':'#ffebee', border:`2px solid ${balanced?'#a5d6a7':'#ef9a9a'}`, display:'flex', alignItems:'center', gap:14, marginBottom:10 }}>
        <div style={{ fontSize:24 }}>{balanced?'✅':'⚠️'}</div>
        <div>
          <div style={{ fontWeight:800, color:balanced?'#2e7d32':'#c62828' }}>
            {balanced ? 'Consolidated Trial Balance — In Balance' : `Out of Balance by SAR ${fmt(Math.abs(totalDr-totalCr))}`}
          </div>
          <div style={{ fontSize:11, color:'#6b7c93' }}>
            Total Dr: {fmt(totalDr)} &nbsp;|&nbsp; Total Cr: {fmt(totalCr)}
            {elimIC && ' (IC accounts eliminated)'}
          </div>
        </div>
      </div>

      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#1a2e3d', color:'#fff' }}>
              <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11, width:70 }}>Code</th>
              <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Account</th>
              <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11, width:90 }}>Type</th>
              <th style={{ padding:'9px 14px', textAlign:'right', fontSize:11 }}>Group Dr</th>
              <th style={{ padding:'9px 14px', textAlign:'right', fontSize:11 }}>Group Cr</th>
              <th style={{ padding:'9px 14px', textAlign:'right', fontSize:11 }}>Balance</th>
              <th style={{ padding:'9px 14px', width:30 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r,i)=>(
              <>
                <tr key={r.code}
                  onClick={()=>setExpand(x=>({...x,[r.code]:!x[r.code]}))}
                  style={{ borderBottom:'1px solid #f5f5f5', background:i%2?'#fafafa':'#fff', cursor:'pointer' }}>
                  <td style={{ padding:'7px 14px', fontFamily:'monospace', fontSize:10, color:'#9e9e9e' }}>{r.code}</td>
                  <td style={{ padding:'7px 14px', fontSize:12, fontWeight:500 }}>{r.account_name}</td>
                  <td style={{ padding:'7px 14px' }}>
                    <span style={{ fontSize:9, padding:'1px 6px', borderRadius:6, background:'#f0f4f8', color:'#546e7a', fontWeight:700 }}>{r.account_type}</span>
                  </td>
                  <td style={{ padding:'7px 14px', textAlign:'right', fontFamily:'monospace', fontSize:11, color:'#1565C0' }}>{fmt(r.totalDr)}</td>
                  <td style={{ padding:'7px 14px', textAlign:'right', fontFamily:'monospace', fontSize:11, color:'#c62828' }}>{fmt(r.totalCr)}</td>
                  <td style={{ padding:'7px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12, fontWeight:700,
                    color: r.groupBalance >= 0 ? '#2e7d32' : '#c62828' }}>
                    {r.groupBalance >= 0 ? '' : '('}{fmt(Math.abs(r.groupBalance))}{r.groupBalance < 0 ? ')' : ''}
                  </td>
                  <td style={{ padding:'7px 14px', color:'#aab2bd', fontSize:11 }}>{expand[r.code]?'▲':'▼'}</td>
                </tr>
                {expand[r.code] && (
                  <tr key={r.code+'-exp'} style={{ background:'#f5f7fa' }}>
                    <td colSpan={7} style={{ padding:'8px 28px' }}>
                      <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                        {entities.map(ent=>{
                          const val = r.perEntity[ent.code]||0
                          if (Math.abs(val) < 0.005) return null
                          return (
                            <div key={ent.code} style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <EntityPill code={ent.code} />
                              <span style={{ fontFamily:'monospace', fontSize:12, fontWeight:700,
                                color: val >= 0 ? '#2e7d32' : '#c62828' }}>
                                {val >= 0 ? '' : '('}{fmt(Math.abs(val))}{val < 0 ? ')':''}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background:'#1a2e3d', color:'#fff' }}>
              <td colSpan={3} style={{ padding:'10px 14px', fontWeight:800, fontSize:13 }}>GROUP TOTAL</td>
              <td style={{ padding:'10px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:13 }}>{fmt(totalDr)}</td>
              <td style={{ padding:'10px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:13 }}>{fmt(totalCr)}</td>
              <td style={{ padding:'10px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:14,
                color:balanced?'#a5d6a7':'#ef9a9a' }}>
                {balanced ? '✓ BALANCED' : `OFF: ${fmt(Math.abs(totalDr-totalCr))}`}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 2 — Consolidated P&L
// ═══════════════════════════════════════════════════════════════════
function ConsolidatedPL({ entities, from, to }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [expand,  setExpand]  = useState({})

  useEffect(() => { load() }, [entities, from, to])

  async function load() {
    setLoading(true)
    // Strip IC entries (voucher_type='INTER') to avoid double-counting
    const { entries, coa } = await loadGroupData(entities, from, to, true)
    const { rows } = aggregateEntries(entries, coa, entities, true)

    const income  = rows.filter(r=>r.account_type==='INCOME').sort((a,b)=>a.code.localeCompare(b.code))
    const expense = rows.filter(r=>r.account_type==='EXPENSE').sort((a,b)=>a.code.localeCompare(b.code))

    setData({ income, expense })
    setLoading(false)
  }

  function exportCSV() {
    if (!data) return
    const rows = [
      [`Consolidated P&L — ${fmtD(from)} to ${fmtD(to)} (IC charges eliminated)`],[],
      ['Code','Account',...entities.map(e=>e.code),'Group Total'],
      ['INCOME'],
      ...data.income.map(r=>[r.code,r.account_name,...entities.map(e=>r.perEntity[e.code]?.toFixed(2)||'0'),r.groupBalance.toFixed(2)]),
      ['','TOTAL INCOME',...entities.map(e=>data.income.reduce((s,r)=>s+(r.perEntity[e.code]||0),0).toFixed(2)),data.income.reduce((s,r)=>s+r.groupBalance,0).toFixed(2)],
      [],[`EXPENSE`],
      ...data.expense.map(r=>[r.code,r.account_name,...entities.map(e=>r.perEntity[e.code]?.toFixed(2)||'0'),r.groupBalance.toFixed(2)]),
      ['','TOTAL EXPENSE',...entities.map(e=>data.expense.reduce((s,r)=>s+(r.perEntity[e.code]||0),0).toFixed(2)),data.expense.reduce((s,r)=>s+r.groupBalance,0).toFixed(2)],
    ]
    const blob=new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'})
    const a=document.createElement('a');a.href=URL.createObjectURL(blob)
    a.download=`group-pl-${from}-to-${to}.csv`;a.click()
  }

  if (loading) return <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Consolidating…</div>
  if (!data) return null

  const totIncome  = data.income.reduce((s,r)=>s+r.groupBalance,0)
  const totExpense = data.expense.reduce((s,r)=>s+r.groupBalance,0)
  const netProfit  = totIncome - totExpense
  const margin     = totIncome ? (netProfit/totIncome*100) : 0

  function Section({ label, rows, color, isIncome }) {
    const totals = {}
    for (const ent of entities) totals[ent.code] = rows.reduce((s,r)=>s+(r.perEntity[ent.code]||0),0)
    const groupTot = rows.reduce((s,r)=>s+r.groupBalance,0)
    return (
      <>
        <tr style={{ background:color+'18' }}>
          <td colSpan={3+entities.length} style={{ padding:'8px 14px', fontWeight:800, fontSize:11, color, letterSpacing:1 }}>{label}</td>
        </tr>
        {rows.map((r,i)=>(
          <>
            <tr key={r.code} onClick={()=>setExpand(x=>({...x,[r.code]:!x[r.code]}))}
              style={{ borderBottom:'1px solid #f5f5f5', background:i%2?'#fafafa':'#fff', cursor:'pointer' }}>
              <td style={{ padding:'6px 14px', fontSize:10, color:'#9e9e9e', fontFamily:'monospace' }}>{r.code}</td>
              <td style={{ padding:'6px 14px 6px 28px', fontSize:12, color:'#546e7a' }}>{r.account_name}</td>
              {entities.map(ent=>(
                <td key={ent.code} style={{ padding:'6px 14px', textAlign:'right', fontFamily:'monospace', fontSize:11, color:ENTITY_COLORS[ent.code]||'#546e7a' }}>
                  {fmt(r.perEntity[ent.code]||0)}
                </td>
              ))}
              <td style={{ padding:'6px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12, fontWeight:700 }}>
                {fmt(r.groupBalance)}
              </td>
              <td style={{ padding:'6px 14px', color:'#aab2bd', fontSize:10 }}>{expand[r.code]?'▲':'▼'}</td>
            </tr>
            {expand[r.code] && (
              <tr key={r.code+'-b'} style={{ background:'#f5f7fa' }}>
                <td colSpan={3+entities.length+1} style={{ padding:'6px 28px', fontSize:11, color:'#546e7a' }}>
                  {entities.map(ent=>(
                    <span key={ent.code} style={{ marginRight:16 }}>
                      <EntityPill code={ent.code} /> {fmt(r.perEntity[ent.code]||0)} SAR
                    </span>
                  ))}
                </td>
              </tr>
            )}
          </>
        ))}
        <tr style={{ background:'#f5f7fa', borderTop:'2px solid #e0e0e0' }}>
          <td colSpan={2} style={{ padding:'8px 14px', fontWeight:800, fontSize:13 }}>Total {isIncome?'Revenue':'Expenses'}</td>
          {entities.map(ent=>(
            <td key={ent.code} style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:ENTITY_COLORS[ent.code]||'#546e7a' }}>
              {fmt(totals[ent.code])}
            </td>
          ))}
          <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:14, color:isIncome?'#1565C0':'#c62828' }}>
            {fmt(groupTot)}
          </td>
          <td />
        </tr>
      </>
    )
  }

  return (
    <>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))', gap:10, marginBottom:14 }}>
        {[
          { label:'Group Revenue',  val:totIncome,  color:'#1565C0' },
          { label:'Group Expenses', val:totExpense, color:'#c62828' },
          { label:netProfit>=0?'Group Net Profit':'Group Net Loss', val:Math.abs(netProfit), color:netProfit>=0?'#2e7d32':'#c62828' },
          { label:'Profit Margin',  val:margin,     color:margin>=0?'#2e7d32':'#c62828', pct:true },
        ].map(k=>(
          <div key={k.label} style={{ background:'#fff', borderRadius:12, padding:'14px 16px', boxShadow:'0 1px 6px rgba(0,0,0,0.07)', borderLeft:`4px solid ${k.color}` }}>
            <div style={{ fontSize:10, color:'#6b7c93' }}>{k.label}</div>
            <div style={{ fontWeight:800, fontSize:20, color:k.color }}>
              {k.pct ? `${k.val.toFixed(1)}%` : `${fmt(k.val)} SAR`}
            </div>
            <div style={{ fontSize:9, color:'#aab2bd', marginTop:2 }}>Excl. IC charges</div>
          </div>
        ))}
        {entities.map(ent=>{
          const entIncome  = data.income.reduce((s,r)=>s+(r.perEntity[ent.code]||0),0)
          const entExpense = data.expense.reduce((s,r)=>s+(r.perEntity[ent.code]||0),0)
          const entNet     = entIncome - entExpense
          return (
            <div key={ent.code} style={{ background:'#fff', borderRadius:12, padding:'14px 16px', boxShadow:'0 1px 6px rgba(0,0,0,0.07)', borderLeft:`4px solid ${ENTITY_COLORS[ent.code]||'#546e7a'}` }}>
              <EntityPill code={ent.code} />
              <div style={{ fontWeight:800, fontSize:16, color:entNet>=0?'#2e7d32':'#c62828', marginTop:6 }}>
                {entNet>=0?'+':''}{fmt(entNet)} SAR
              </div>
              <div style={{ fontSize:9, color:'#aab2bd' }}>Net contribution</div>
            </div>
          )
        })}
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:8 }}>
        <button onClick={exportCSV} style={S.btnO()}>⬇ CSV</button>
      </div>

      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#1a2e3d', color:'#fff' }}>
              <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11, width:70 }}>Code</th>
              <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Account</th>
              {entities.map(ent=>(
                <th key={ent.code} style={{ padding:'9px 14px', textAlign:'right', fontSize:11, color:ENTITY_COLORS[ent.code]+'cc'||'#fff' }}>
                  {ent.code}
                </th>
              ))}
              <th style={{ padding:'9px 14px', textAlign:'right', fontSize:11 }}>Group Total</th>
              <th style={{ padding:'9px 14px', width:24 }} />
            </tr>
          </thead>
          <tbody>
            <Section label="REVENUE" rows={data.income}  color="#1565C0" isIncome />
            <tr><td colSpan={3+entities.length+1} style={{ height:10, background:'#f9fafb' }} /></tr>
            <Section label="OPERATING EXPENSES" rows={data.expense} color="#c62828" />
            <tr><td colSpan={3+entities.length+1} style={{ height:10, background:'#f9fafb' }} /></tr>
            <tr style={{ background:netProfit>=0?'#e8f5e9':'#ffebee' }}>
              <td colSpan={2} style={{ padding:'12px 14px', fontWeight:800, fontSize:15, color:netProfit>=0?'#2e7d32':'#c62828' }}>
                {netProfit>=0?'📈 GROUP NET PROFIT':'📉 GROUP NET LOSS'}
              </td>
              {entities.map(ent=>{
                const v = data.income.reduce((s,r)=>s+(r.perEntity[ent.code]||0),0)
                        - data.expense.reduce((s,r)=>s+(r.perEntity[ent.code]||0),0)
                return (
                  <td key={ent.code} style={{ padding:'12px 14px', textAlign:'right', fontFamily:'monospace', fontSize:13, fontWeight:700, color:v>=0?'#2e7d32':'#c62828' }}>
                    {v>=0?'+':''}{fmt(v)}
                  </td>
                )
              })}
              <td style={{ padding:'12px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:16, color:netProfit>=0?'#2e7d32':'#c62828' }}>
                {netProfit>=0?'+':''}{fmt(netProfit)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontSize:11, color:'#aab2bd', marginTop:6 }}>
        IC charges (voucher_type=INTER) eliminated to avoid double-counting.
        Click any row to see per-entity breakdown.
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 3 — Consolidated Balance Sheet
// ═══════════════════════════════════════════════════════════════════
function ConsolidatedBS({ entities, asOf }) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [entities, asOf])

  async function load() {
    setLoading(true)
    // Cumulative to asOf, strip IC entries
    const { entries, coa } = await loadGroupData(entities, null, asOf, true)

    // Also add opening balances from COA
    const coaMap = {}
    for (const a of coa) {
      if (!coaMap[a.account_code]) coaMap[a.account_code] = { account_name:a.account_name, account_type:a.account_type, opening:{} }
      coaMap[a.account_code].opening[a.entity_id] = { dr:+a.opening_debit||0, cr:+a.opening_credit||0 }
    }

    // Build from entries
    const { rows } = aggregateEntries(entries, coa, entities, true) // eliminate IC

    // Categorise
    const assets       = rows.filter(r=>ASSET_TYPES.has(r.account_type))
    const liabilities  = rows.filter(r=>LIAB_TYPES.has(r.account_type)  && r.account_type!=='INTERNAL')
    const equityAccts  = rows.filter(r=>EQUITY_TYPES.has(r.account_type))
    const incomeRows   = rows.filter(r=>r.account_type==='INCOME')
    const expenseRows  = rows.filter(r=>r.account_type==='EXPENSE')
    const retainedEarnings = incomeRows.reduce((s,r)=>s+r.groupBalance,0) - expenseRows.reduce((s,r)=>s+r.groupBalance,0)

    setData({ assets, liabilities, equityAccts, retainedEarnings, entities })
    setLoading(false)
  }

  function exportCSV() {
    if (!data) return
    const { assets, liabilities, equityAccts, retainedEarnings } = data
    const totA = assets.reduce((s,r)=>s+r.groupBalance,0)
    const totL = liabilities.reduce((s,r)=>s+r.groupBalance,0)
    const totE = equityAccts.reduce((s,r)=>s+r.groupBalance,0) + retainedEarnings
    const rows = [
      [`Consolidated Balance Sheet — As of ${fmtD(asOf)}`],[],
      ['ASSETS'],['Code','Account','Balance'],
      ...assets.map(r=>[r.code,r.account_name,r.groupBalance.toFixed(2)]),
      ['','Total Assets',totA.toFixed(2)],[],
      ['LIABILITIES'],['Code','Account','Balance'],
      ...liabilities.map(r=>[r.code,r.account_name,r.groupBalance.toFixed(2)]),
      ['','Total Liabilities',totL.toFixed(2)],[],
      ['EQUITY'],['Code','Account','Balance'],
      ...equityAccts.map(r=>[r.code,r.account_name,r.groupBalance.toFixed(2)]),
      ['','Retained Earnings',retainedEarnings.toFixed(2)],
      ['','Total Equity',totE.toFixed(2)],[],
      ['','Total Liabilities + Equity',(totL+totE).toFixed(2)],
      ['','Balance Check (A=L+E)',(totA-(totL+totE)).toFixed(2)],
    ]
    const blob=new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'})
    const a=document.createElement('a');a.href=URL.createObjectURL(blob)
    a.download=`group-balance-sheet-${asOf}.csv`;a.click()
  }

  if (loading) return <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Consolidating…</div>
  if (!data)   return null

  const { assets, liabilities, equityAccts, retainedEarnings } = data
  const totalAssets = assets.reduce((s,r)=>s+r.groupBalance,0)
  const totalLiab   = liabilities.reduce((s,r)=>s+r.groupBalance,0)
  const totalEquity = equityAccts.reduce((s,r)=>s+r.groupBalance,0) + retainedEarnings
  const totalLE     = totalLiab + totalEquity
  const balanced    = Math.abs(totalAssets - totalLE) < 0.50

  function BSSection({ title, rows, color, extra }) {
    const tot = rows.reduce((s,r)=>s+r.groupBalance,0) + (extra||0)
    return (
      <div style={{ marginBottom:14 }}>
        <div style={{ fontWeight:800, fontSize:11, color, letterSpacing:1, padding:'8px 14px', background:color+'18', borderRadius:'8px 8px 0 0' }}>
          {title}
        </div>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <tbody>
            {rows.map((r,i)=>(
              <tr key={r.code} style={{ borderBottom:'1px solid #f5f5f5', background:i%2?'#fafafa':'#fff' }}>
                <td style={{ padding:'6px 14px', fontSize:10, color:'#9e9e9e', fontFamily:'monospace', width:70 }}>{r.code}</td>
                <td style={{ padding:'6px 14px', fontSize:12, color:'#546e7a' }}>{r.account_name}</td>
                <td style={{ padding:'6px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12, fontWeight:600 }}>{fmt(r.groupBalance)}</td>
              </tr>
            ))}
            {extra !== undefined && (
              <tr style={{ borderBottom:'1px solid #f5f5f5', background:'#fffde7' }}>
                <td style={{ padding:'6px 14px', fontSize:10, color:'#9e9e9e', fontFamily:'monospace' }}>RE</td>
                <td style={{ padding:'6px 14px', fontSize:12, color:'#546e7a' }}>Retained Earnings (Net Income)</td>
                <td style={{ padding:'6px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12, fontWeight:600,
                  color:extra>=0?'#2e7d32':'#c62828' }}>{fmt(extra)}</td>
              </tr>
            )}
            <tr style={{ background:'#f0f4f8', borderTop:'2px solid #e0e0e0' }}>
              <td colSpan={2} style={{ padding:'8px 14px', fontWeight:800, fontSize:13 }}>Total</td>
              <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:14, color }}>{fmt(tot)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <>
      {/* Balance check + KPIs */}
      <div style={{ ...S.card, background:balanced?'#e8f5e9':'#ffebee', border:`2px solid ${balanced?'#a5d6a7':'#ef9a9a'}`, display:'flex', alignItems:'center', gap:14, marginBottom:12 }}>
        <div style={{ fontSize:22 }}>{balanced?'✅':'⚠️'}</div>
        <div>
          <div style={{ fontWeight:800, color:balanced?'#2e7d32':'#c62828' }}>
            {balanced ? 'Consolidated Balance Sheet — Balanced' : `Out of Balance by SAR ${fmt(Math.abs(totalAssets-totalLE))}`}
          </div>
          <div style={{ fontSize:11, color:'#6b7c93' }}>
            Total Assets: {fmt(totalAssets)} &nbsp;|&nbsp; Total L+E: {fmt(totalLE)}
          </div>
        </div>
        <button onClick={exportCSV} style={{ ...S.btnO(), marginLeft:'auto' }}>⬇ CSV</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
        {/* Assets column */}
        <div style={{ ...S.card }}>
          <BSSection title="ASSETS" rows={assets} color="#1565C0" />
          <div style={{ marginTop:8, padding:'10px 14px', background:'#1565C0', color:'#fff', borderRadius:8, textAlign:'right' }}>
            <span style={{ fontSize:11, opacity:0.8 }}>TOTAL ASSETS </span>
            <span style={{ fontWeight:800, fontSize:16, fontFamily:'monospace' }}>{fmt(totalAssets)} SAR</span>
          </div>
        </div>

        {/* Liabilities + Equity column */}
        <div style={{ ...S.card }}>
          <BSSection title="LIABILITIES" rows={liabilities} color="#c62828" />
          <BSSection title="EQUITY" rows={equityAccts} color="#5A32D4" extra={retainedEarnings} />
          <div style={{ marginTop:8, padding:'10px 14px', background:totalLE>=0?'#2e7d32':'#c62828', color:'#fff', borderRadius:8, textAlign:'right' }}>
            <span style={{ fontSize:11, opacity:0.8 }}>TOTAL L + E </span>
            <span style={{ fontWeight:800, fontSize:16, fontFamily:'monospace' }}>{fmt(totalLE)} SAR</span>
          </div>
        </div>
      </div>

      <div style={{ fontSize:11, color:'#aab2bd', marginTop:6 }}>
        IC receivables/payables (INTERNAL accounts) eliminated.
        Retained earnings = group net income (excl. IC transactions).
        As of {fmtD(asOf)}.
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════
export default function GroupConsolidation() {
  const now = new Date()
  const [tab,      setTab]      = useState('tb')
  const [entities, setEntities] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [from,     setFrom]     = useState(`${now.getFullYear()}-01-01`)
  const [to,       setTo]       = useState(now.toISOString().slice(0,10))
  const [asOf,     setAsOf]     = useState(now.toISOString().slice(0,10))

  useEffect(() => {
    supabase.from('entities').select('id, entity_code, entity_name').order('entity_code')
      .then(({data})=>{ setEntities((data||[]).map(e=>({...e, code:e.entity_code, name:e.entity_name}))); setLoading(false) })
  }, [])

  const TABS = [
    { key:'tb', label:'⚖️ Trial Balance' },
    { key:'pl', label:'📊 P&L Statement' },
    { key:'bs', label:'🏛 Balance Sheet' },
  ]

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:2 }}>
        <span style={{ padding:'2px 10px', borderRadius:10, background:'#5A32D4', color:'#fff', fontSize:10, fontWeight:800 }}>
          SUPERADMIN
        </span>
      </div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>
        Consolidated financial reports across RAT · GWT · ACCSYS — with intercompany eliminations
      </div>

      {/* Entity legend */}
      {!loading && (
        <div style={{ display:'flex', gap:8, marginBottom:12, overflowX:'auto', flexWrap:'nowrap', paddingBottom:2 }}>
          {entities.map(ent=>(
            <div key={ent.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:8,
              background:(ENTITY_COLORS[ent.code]||'#546e7a')+'15', border:`1px solid ${ENTITY_COLORS[ent.code]||'#546e7a'}44` }}>
              <EntityPill code={ent.code} />
              <span style={{ fontSize:11, color:'#546e7a' }}>{ENTITY_LABELS[ent.code]||ent.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        {tab !== 'bs' ? (
          <>
            <div><label style={S.lbl}>From</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{ ...S.inp, width:150 }} /></div>
            <div><label style={S.lbl}>To</label><input type="date" value={to} onChange={e=>setTo(e.target.value)} style={{ ...S.inp, width:150 }} /></div>
          </>
        ) : (
          <div><label style={S.lbl}>As-of Date</label><input type="date" value={asOf} onChange={e=>setAsOf(e.target.value)} style={{ ...S.inp, width:160 }} /></div>
        )}
        <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)}
              style={tab===t.key ? S.btn('#1a2e3d') : S.btnO('#546e7a')}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:80, color:'#6b7c93' }}>Loading entities…</div>
      ) : entities.length === 0 ? (
        <div style={{ textAlign:'center', padding:80, color:'#aab2bd' }}>No entities found.</div>
      ) : (
        <>
          {tab === 'tb' && <ConsolidatedTB entities={entities} from={from} to={to} />}
          {tab === 'pl' && <ConsolidatedPL entities={entities} from={from} to={to} />}
          {tab === 'bs' && <ConsolidatedBS entities={entities} asOf={asOf} />}
        </>
      )}
    </div>
  )
}
