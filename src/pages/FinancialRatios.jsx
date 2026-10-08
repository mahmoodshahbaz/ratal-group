import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// Financial Ratios Dashboard — Phase 17
//
// Pulls GL balances from ledger_entries + chart_of_accounts
// and computes standard financial ratios automatically.
//
// Sections:
//   1. Liquidity     — Current Ratio, Quick Ratio, Cash Ratio, Working Capital
//   2. Profitability — Net Margin, Gross Margin, ROA, ROE
//   3. Efficiency    — DSO, DPO, Asset Turnover
//   4. Leverage      — Debt-to-Equity, Debt Ratio, Equity Multiplier
//
// No new SQL — uses ledger_entries and chart_of_accounts.
// ═══════════════════════════════════════════════════════════════════

// Account type classifications
const CASH_TYPES        = new Set(['BANK','CASH'])
const AR_TYPES          = new Set(['CUSTOMER'])
const CURRENT_ASSET_T   = new Set(['BANK','CASH','CUSTOMER','CONTRACTOR','SUBCON','CLEARING','EMPLOYEE'])
const FIXED_ASSET_T     = new Set(['ASSET'])
const ALL_ASSET_T       = new Set(['BANK','CASH','CUSTOMER','CONTRACTOR','SUBCON','CLEARING','EMPLOYEE','ASSET'])
const AP_TYPES          = new Set(['SUPPLIER'])
const CURRENT_LIAB_T    = new Set(['SUPPLIER','GOVERNMENT','LIABILITY'])
const EQUITY_T          = new Set(['EQUITY'])
const INCOME_T          = new Set(['INCOME'])
const EXPENSE_T         = new Set(['EXPENSE'])
const DR_NORMAL         = new Set(['BANK','CASH','ASSET','CUSTOMER','CONTRACTOR','EMPLOYEE','EXPENSE','CLEARING','INTERNAL','SUBCON'])

const today  = () => new Date().toISOString().slice(0,10)
const thisYr = () => `${new Date().getFullYear()}-01-01`
const fmt    = n  => (+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtN   = n  => {
  const v = +n||0
  if (Math.abs(v) >= 1e9) return (v/1e9).toFixed(2)+'B'
  if (Math.abs(v) >= 1e6) return (v/1e6).toFixed(2)+'M'
  if (Math.abs(v) >= 1e3) return (v/1e3).toFixed(1)+'K'
  return v.toFixed(2)
}

const PRESETS = [
  { label:'This Month', from:()=>{ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }, to:today },
  { label:'YTD',        from:thisYr, to:today },
  { label:'Last Year',  from:()=>`${new Date().getFullYear()-1}-01-01`, to:()=>`${new Date().getFullYear()-1}-12-31` },
  { label:'Q1', from:()=>`${new Date().getFullYear()}-01-01`, to:()=>`${new Date().getFullYear()}-03-31` },
  { label:'Q2', from:()=>`${new Date().getFullYear()}-04-01`, to:()=>`${new Date().getFullYear()}-06-30` },
  { label:'Q3', from:()=>`${new Date().getFullYear()}-07-01`, to:()=>`${new Date().getFullYear()}-09-30` },
  { label:'Q4', from:()=>`${new Date().getFullYear()}-10-01`, to:()=>`${new Date().getFullYear()}-12-31` },
]

// ── GL Balance engine ─────────────────────────────────────────────────────────
async function fetchBalances(entityId, from, to) {
  const [leRes, coaRes] = await Promise.all([
    supabase.from('ledger_entries')
      .select('account_code, debit, credit')
      .eq('entity_id', entityId)
      .neq('voucher_type', 'INTER')
      .gte('entry_date', from)
      .lte('entry_date', to),
    supabase.from('chart_of_accounts')
      .select('account_code, account_name, account_type, opening_debit, opening_credit')
      .eq('entity_id', entityId),
  ])

  const coa   = coaRes.data || []
  const coaMap = Object.fromEntries(coa.map(r=>[r.account_code,r]))
  const entries= leRes.data || []

  // Aggregate DR/CR movements per account
  const movMap = {}
  for (const e of entries) {
    if (!movMap[e.account_code]) movMap[e.account_code] = { dr:0, cr:0 }
    movMap[e.account_code].dr += +e.debit  ||0
    movMap[e.account_code].cr += +e.credit ||0
  }

  // Compute balance per account (opening + movements)
  const balances = {}  // account_code → { balance, account_type, account_name }
  const allCodes = new Set([...coa.map(r=>r.account_code), ...Object.keys(movMap)])

  for (const code of allCodes) {
    const meta = coaMap[code]
    if (!meta) continue
    const type   = (meta.account_type||'').toUpperCase()
    const opDr   = +meta.opening_debit  ||0
    const opCr   = +meta.opening_credit ||0
    const movDr  = movMap[code]?.dr ||0
    const movCr  = movMap[code]?.cr ||0
    const totDr  = opDr + movDr
    const totCr  = opCr + movCr
    const balance = DR_NORMAL.has(type) ? (totDr - totCr) : (totCr - totDr)
    balances[code] = { balance, account_type:type, account_name:meta.account_name }
  }

  // Sum by type group
  function sumTypes(typeSet) {
    return Object.values(balances)
      .filter(b=>typeSet.has(b.account_type))
      .reduce((s,b)=>s + (b.balance > 0 ? b.balance : 0), 0)
  }
  function sumTypesNet(typeSet) {
    return Object.values(balances)
      .filter(b=>typeSet.has(b.account_type))
      .reduce((s,b)=>s + b.balance, 0)
  }

  const cash        = sumTypes(CASH_TYPES)
  const ar          = sumTypes(AR_TYPES)
  const currentAssets = sumTypes(CURRENT_ASSET_T)
  const fixedAssets   = sumTypes(FIXED_ASSET_T)
  const totalAssets   = sumTypes(ALL_ASSET_T)
  const ap          = sumTypes(AP_TYPES)
  const currentLiab   = sumTypes(CURRENT_LIAB_T)
  const totalLiab     = currentLiab   // simplified: no long-term distinction
  const equity        = sumTypesNet(EQUITY_T)
  const revenue       = sumTypesNet(INCOME_T)
  const expenses      = sumTypesNet(EXPENSE_T)
  const netProfit     = revenue - expenses
  // Retained earnings contribute to total equity
  const totalEquity   = equity + netProfit

  // Days in period
  const days = from && to
    ? Math.max(1, Math.ceil((new Date(to) - new Date(from)) / 86400000) + 1)
    : 365

  return { cash, ar, currentAssets, fixedAssets, totalAssets, ap, currentLiab, totalLiab, totalEquity, equity, revenue, expenses, netProfit, days }
}

// ── Ratio definitions ─────────────────────────────────────────────────────────
function computeRatios(b) {
  const safe = (n,d) => (d && Math.abs(d) > 0.01) ? n/d : null

  return {
    // Liquidity
    currentRatio:    safe(b.currentAssets, b.currentLiab),
    quickRatio:      safe(b.currentAssets - b.cash, b.currentLiab),  // excl. cash as "most liquid"
    cashRatio:       safe(b.cash, b.currentLiab),
    workingCapital:  b.currentAssets - b.currentLiab,

    // Profitability
    netMargin:       safe(b.netProfit, b.revenue) * 100,
    roa:             safe(b.netProfit, b.totalAssets) * 100,
    roe:             safe(b.netProfit, b.totalEquity) * 100,
    revenueAmt:      b.revenue,
    netProfitAmt:    b.netProfit,

    // Efficiency
    dso:             safe(b.ar * b.days, b.revenue),
    dpo:             safe(b.ap * b.days, b.expenses),
    assetTurnover:   safe(b.revenue, b.totalAssets),

    // Leverage
    debtToEquity:    safe(b.totalLiab, b.totalEquity),
    debtRatio:       safe(b.totalLiab, b.totalAssets),
    equityMultiplier:safe(b.totalAssets, b.totalEquity),

    // Raw balances for reference
    _b: b,
  }
}

// Benchmark thresholds → traffic light
const BENCHMARKS = {
  currentRatio:    { good:1.5,  warn:1.0,  dir:'up',   unit:'×',   fmt:v=>v?.toFixed(2)+'×' },
  quickRatio:      { good:1.0,  warn:0.5,  dir:'up',   unit:'×',   fmt:v=>v?.toFixed(2)+'×' },
  cashRatio:       { good:0.3,  warn:0.1,  dir:'up',   unit:'×',   fmt:v=>v?.toFixed(2)+'×' },
  workingCapital:  { good:0,    warn:null, dir:'up',   unit:'SAR', fmt:v=>`${fmtN(v)} SAR` },
  netMargin:       { good:10,   warn:0,    dir:'up',   unit:'%',   fmt:v=>v?.toFixed(1)+'%' },
  roa:             { good:5,    warn:0,    dir:'up',   unit:'%',   fmt:v=>v?.toFixed(1)+'%' },
  roe:             { good:10,   warn:0,    dir:'up',   unit:'%',   fmt:v=>v?.toFixed(1)+'%' },
  dso:             { good:30,   warn:60,   dir:'down', unit:'days',fmt:v=>v?.toFixed(0)+' d' },
  dpo:             { good:30,   warn:60,   dir:'down', unit:'days',fmt:v=>v?.toFixed(0)+' d' },
  assetTurnover:   { good:1.0,  warn:0.5,  dir:'up',   unit:'×',   fmt:v=>v?.toFixed(2)+'×' },
  debtToEquity:    { good:0.5,  warn:1.5,  dir:'down', unit:'×',   fmt:v=>v?.toFixed(2)+'×' },
  debtRatio:       { good:0.3,  warn:0.6,  dir:'down', unit:'%',   fmt:v=>(v*100)?.toFixed(1)+'%' },
  equityMultiplier:{ good:1.5,  warn:3.0,  dir:'down', unit:'×',   fmt:v=>v?.toFixed(2)+'×' },
}

function trafficLight(key, val) {
  if (val === null || !isFinite(val)) return 'gray'
  const b = BENCHMARKS[key]
  if (!b) return 'gray'
  if (b.dir === 'up')   return val >= b.good ? 'green' : val >= (b.warn??b.good/2) ? 'amber' : 'red'
  if (b.dir === 'down') return val <= b.good ? 'green' : val <= b.warn ? 'amber' : 'red'
  return 'gray'
}

const LIGHT_COLORS = {
  green: { bg:'#e8f5e9', color:'#2e7d32', border:'#a5d6a7' },
  amber: { bg:'#fff8e1', color:'#f57f17', border:'#ffe082' },
  red:   { bg:'#ffebee', color:'#c62828', border:'#ef9a9a' },
  gray:  { bg:'#f5f7fa', color:'#546e7a', border:'#cfd8dc' },
}

// ── Ratio Card component ──────────────────────────────────────────────────────
function RatioCard({ title, ratioKey, value, prevValue, description, formula, benchmark }) {
  const light   = trafficLight(ratioKey, value)
  const colors  = LIGHT_COLORS[light]
  const bm      = BENCHMARKS[ratioKey]
  const fmtVal  = bm?.fmt || (v=>v?.toFixed(2))
  const prevLight = prevValue !== undefined ? trafficLight(ratioKey, prevValue) : null

  const trend = (value !== null && prevValue !== null && prevValue !== undefined && isFinite(value) && isFinite(prevValue) && prevValue !== 0)
    ? ((value - prevValue) / Math.abs(prevValue)) * 100
    : null

  const trendUp = trend !== null && trend > 0
  const goodDir = bm?.dir === 'up'

  return (
    <div style={{ background:colors.bg, border:`1.5px solid ${colors.border}`, borderRadius:14,
      padding:'16px 18px', display:'flex', flexDirection:'column', gap:6 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div style={{ fontSize:11, fontWeight:700, color:colors.color, textTransform:'uppercase', letterSpacing:0.5 }}>
          {title}
        </div>
        <div style={{ width:10, height:10, borderRadius:'50%', background:colors.color, marginTop:2, flexShrink:0 }} />
      </div>

      {/* Value */}
      <div style={{ fontSize:28, fontWeight:800, color:colors.color, lineHeight:1 }}>
        {value === null || !isFinite(value) ? '—' : fmtVal(value)}
      </div>

      {/* Trend vs prior period */}
      {trend !== null && (
        <div style={{ fontSize:11, color: (trendUp===goodDir)?'#2e7d32':'#c62828', fontWeight:600 }}>
          {trendUp?'▲':'▼'} {Math.abs(trend).toFixed(1)}% vs prior period
          <span style={{ color:'#9e9e9e', fontWeight:400, marginLeft:4 }}>
            (was {fmtVal(prevValue)})
          </span>
        </div>
      )}

      {/* Description */}
      {description && (
        <div style={{ fontSize:10, color:colors.color, opacity:0.7, lineHeight:1.4 }}>{description}</div>
      )}

      {/* Benchmark */}
      {bm && value !== null && isFinite(value) && (
        <div style={{ fontSize:10, color:'#6b7c93', borderTop:`1px solid ${colors.border}`, paddingTop:6, marginTop:2 }}>
          Target: {bm.dir==='up'?'≥':'≤'}{bm.fmt ? bm.fmt(bm.good) : bm.good}
          {bm.warn !== null && ` · Warning: ${bm.dir==='up'?'<':'>'}${bm.fmt ? bm.fmt(bm.warn) : bm.warn}`}
        </div>
      )}
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, icon, children }) {
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ fontWeight:800, fontSize:13, color:'#1a2e3d', letterSpacing:1,
        marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
        <span>{icon}</span> {title}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:10 }}>
        {children}
      </div>
    </div>
  )
}

// ── Health Score ──────────────────────────────────────────────────────────────
function HealthScore({ ratios }) {
  const checks = [
    { key:'currentRatio', val:ratios.currentRatio },
    { key:'quickRatio',   val:ratios.quickRatio },
    { key:'netMargin',    val:ratios.netMargin },
    { key:'roa',          val:ratios.roa },
    { key:'debtToEquity', val:ratios.debtToEquity },
    { key:'dso',          val:ratios.dso },
    { key:'assetTurnover',val:ratios.assetTurnover },
  ]
  const scored = checks.filter(c=>c.val!==null&&isFinite(c.val))
  const greens = scored.filter(c=>trafficLight(c.key,c.val)==='green').length
  const ambers = scored.filter(c=>trafficLight(c.key,c.val)==='amber').length
  const reds   = scored.filter(c=>trafficLight(c.key,c.val)==='red').length
  const score  = scored.length ? Math.round((greens*100 + ambers*50) / scored.length) : null

  const scoreColor = score === null ? '#546e7a' : score >= 70 ? '#2e7d32' : score >= 40 ? '#f57f17' : '#c62828'
  const scoreLabel = score === null ? 'Insufficient data' : score >= 70 ? 'Healthy' : score >= 40 ? 'Needs attention' : 'At risk'

  return (
    <div style={{ background:'#1a2e3d', color:'#fff', borderRadius:14, padding:'20px 24px',
      display:'flex', alignItems:'center', gap:24, flexWrap:'wrap', marginBottom:20 }}>
      {/* Score circle */}
      <div style={{ textAlign:'center', minWidth:80 }}>
        <div style={{ fontSize:48, fontWeight:900, color:scoreColor, lineHeight:1 }}>
          {score === null ? '—' : score}
        </div>
        <div style={{ fontSize:10, color:'#90a4ae', marginTop:2 }}>HEALTH SCORE</div>
      </div>

      <div style={{ width:1, height:60, background:'rgba(255,255,255,0.15)', flexShrink:0 }} />

      {/* Label */}
      <div>
        <div style={{ fontWeight:800, fontSize:18, color:scoreColor }}>{scoreLabel}</div>
        <div style={{ fontSize:11, color:'#90a4ae', marginTop:4 }}>
          Based on {scored.length} key ratios
        </div>
      </div>

      <div style={{ marginLeft:'auto', display:'flex', gap:16 }}>
        {[{ count:greens, color:'#a5d6a7', label:'Good' },
          { count:ambers, color:'#ffe082', label:'Warning' },
          { count:reds,   color:'#ef9a9a', label:'At risk' }].map(s=>(
          <div key={s.label} style={{ textAlign:'center' }}>
            <div style={{ fontWeight:800, fontSize:22, color:s.color }}>{s.count}</div>
            <div style={{ fontSize:10, color:'#90a4ae' }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Balance Snapshot ──────────────────────────────────────────────────────────
function BalanceSnapshot({ b }) {
  const items = [
    { label:'Cash & Bank',       val:b.cash,         color:'#2e7d32' },
    { label:'Accounts Receivable',val:b.ar,           color:'#1565C0' },
    { label:'Current Assets',    val:b.currentAssets, color:'#1565C0' },
    { label:'Fixed Assets',      val:b.fixedAssets,   color:'#546e7a' },
    { label:'Total Assets',      val:b.totalAssets,   color:'#1a2e3d', bold:true },
    { label:'Current Liabilities',val:b.currentLiab,  color:'#c62828' },
    { label:'Total Equity',      val:b.totalEquity,   color:'#5A32D4' },
    { label:'Revenue',           val:b.revenue,       color:'#1565C0' },
    { label:'Expenses',          val:b.expenses,      color:'#c62828' },
    { label:'Net Profit',        val:b.netProfit,     color:b.netProfit>=0?'#2e7d32':'#c62828', bold:true },
  ]
  return (
    <div style={{ background:'#fff', borderRadius:14, padding:'16px 20px',
      boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:20 }}>
      <div style={{ fontWeight:800, fontSize:12, color:'#6b7c93', letterSpacing:1, marginBottom:12 }}>
        📊 BALANCE SNAPSHOT (SAR)
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:8 }}>
        {items.map(it=>(
          <div key={it.label} style={{ borderLeft:`3px solid ${it.color}`, paddingLeft:10 }}>
            <div style={{ fontSize:10, color:'#6b7c93' }}>{it.label}</div>
            <div style={{ fontWeight:it.bold?800:600, fontSize:it.bold?15:13, color:it.color }}>{fmtN(it.val)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════
export default function FinancialRatios({ entityId }) {
  const now = new Date()
  const [from,      setFrom]      = useState(thisYr())
  const [to,        setTo]        = useState(today())
  const [ratios,    setRatios]    = useState(null)
  const [prevRatios,setPrevRatios]= useState(null)
  const [loading,   setLoading]   = useState(true)
  const [compare,   setCompare]   = useState(false)
  const [showSnap,  setShowSnap]  = useState(false)

  // Compute prior period of same length
  function priorPeriod(f, t) {
    const start = new Date(f), end = new Date(t)
    const len   = end - start
    const pEnd  = new Date(start); pEnd.setDate(pEnd.getDate()-1)
    const pStart= new Date(pEnd - len)
    return { from: pStart.toISOString().slice(0,10), to: pEnd.toISOString().slice(0,10) }
  }

  const load = useCallback(async () => {
    if (!entityId) return
    setLoading(true)
    const b = await fetchBalances(entityId, from, to)
    setRatios(computeRatios(b))

    if (compare) {
      const { from:pf, to:pt } = priorPeriod(from, to)
      const pb = await fetchBalances(entityId, pf, pt)
      setPrevRatios(computeRatios(pb))
    } else {
      setPrevRatios(null)
    }
    setLoading(false)
  }, [entityId, from, to, compare])

  useEffect(() => { load() }, [load])

  function exportPDF() {
    if (!ratios) return
    window.print()
  }

  const r  = ratios
  const pr = prevRatios

  const S = { card: { background:'#fff', borderRadius:14, padding:'14px 18px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:10 } }

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>
        Auto-calculated KPIs from the GL — liquidity, profitability, efficiency, and leverage
      </div>

      {/* Controls */}
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 }}>From</label>
          <input type="date" style={{ padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff', width:150 }}
            value={from} onChange={e=>setFrom(e.target.value)} />
        </div>
        <div>
          <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 }}>To</label>
          <input type="date" style={{ padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff', width:150 }}
            value={to} onChange={e=>setTo(e.target.value)} />
        </div>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap', alignSelf:'flex-end' }}>
          {PRESETS.map(p=>(
            <button key={p.label} onClick={()=>{ setFrom(p.from()); setTo(p.to()) }}
              style={{ background:'transparent', color:'#546e7a', border:'1.5px solid #546e7a', borderRadius:8,
                padding:'6px 10px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
              {p.label}
            </button>
          ))}
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, cursor:'pointer', alignSelf:'flex-end', paddingBottom:2 }}>
          <input type="checkbox" checked={compare} onChange={e=>setCompare(e.target.checked)} />
          Compare vs prior period
        </label>
        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          <button onClick={()=>setShowSnap(s=>!s)}
            style={{ background:'transparent', color:'#546e7a', border:'1.5px solid #dde3ec', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            {showSnap?'Hide':'Show'} GL snapshot
          </button>
          <button onClick={load}
            style={{ background:'#1a2e3d', color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:80, color:'#6b7c93', fontSize:14 }}>
          <div style={{ fontSize:32, marginBottom:12 }}>📐</div>
          Calculating ratios…
        </div>
      ) : !r ? null : (
        <>
          {/* Health score */}
          <HealthScore ratios={r} />

          {/* GL snapshot */}
          {showSnap && <BalanceSnapshot b={r._b} />}

          {/* 1. Liquidity */}
          <Section title="LIQUIDITY" icon="💧">
            <RatioCard
              title="Current Ratio" ratioKey="currentRatio"
              value={r.currentRatio} prevValue={pr?.currentRatio}
              description="Can current assets cover current liabilities?"
              formula="Current Assets ÷ Current Liabilities"
            />
            <RatioCard
              title="Quick Ratio" ratioKey="quickRatio"
              value={r.quickRatio} prevValue={pr?.quickRatio}
              description="Liquid assets (excl. cash) vs current liabilities"
              formula="(Current Assets − Cash) ÷ Current Liabilities"
            />
            <RatioCard
              title="Cash Ratio" ratioKey="cashRatio"
              value={r.cashRatio} prevValue={pr?.cashRatio}
              description="Ability to pay liabilities with cash immediately"
              formula="Cash & Bank ÷ Current Liabilities"
            />
            <div style={{ background: r.workingCapital>=0?'#e8f5e9':'#ffebee',
              border:`1.5px solid ${r.workingCapital>=0?'#a5d6a7':'#ef9a9a'}`,
              borderRadius:14, padding:'16px 18px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:r.workingCapital>=0?'#2e7d32':'#c62828',
                textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>
                Working Capital
              </div>
              <div style={{ fontSize:24, fontWeight:800, color:r.workingCapital>=0?'#2e7d32':'#c62828' }}>
                {r.workingCapital>=0?'+':''}{fmtN(r.workingCapital)} SAR
              </div>
              <div style={{ fontSize:10, color:'#6b7c93', marginTop:6 }}>
                Current Assets − Current Liabilities
              </div>
              {pr && (
                <div style={{ fontSize:11, color:'#6b7c93', marginTop:4 }}>
                  Prior: {pr.workingCapital>=0?'+':''}{fmtN(pr.workingCapital)} SAR
                </div>
              )}
            </div>
          </Section>

          {/* 2. Profitability */}
          <Section title="PROFITABILITY" icon="📈">
            {/* Revenue + Net Profit raw */}
            <div style={{ background:'#e3f2fd', border:'1.5px solid #90caf9', borderRadius:14, padding:'16px 18px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#1565C0', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>Revenue</div>
              <div style={{ fontSize:24, fontWeight:800, color:'#1565C0' }}>{fmtN(r.revenueAmt)} SAR</div>
              {pr && <div style={{ fontSize:11, color:'#6b7c93', marginTop:4 }}>Prior: {fmtN(pr.revenueAmt)} SAR</div>}
            </div>
            <div style={{ background:r.netProfitAmt>=0?'#e8f5e9':'#ffebee',
              border:`1.5px solid ${r.netProfitAmt>=0?'#a5d6a7':'#ef9a9a'}`,
              borderRadius:14, padding:'16px 18px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:r.netProfitAmt>=0?'#2e7d32':'#c62828',
                textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>
                {r.netProfitAmt>=0?'Net Profit':'Net Loss'}
              </div>
              <div style={{ fontSize:24, fontWeight:800, color:r.netProfitAmt>=0?'#2e7d32':'#c62828' }}>
                {r.netProfitAmt>=0?'+':''}{fmtN(r.netProfitAmt)} SAR
              </div>
              {pr && <div style={{ fontSize:11, color:'#6b7c93', marginTop:4 }}>Prior: {pr.netProfitAmt>=0?'+':''}{fmtN(pr.netProfitAmt)} SAR</div>}
            </div>
            <RatioCard
              title="Net Profit Margin" ratioKey="netMargin"
              value={r.netMargin} prevValue={pr?.netMargin}
              description="Percentage of revenue retained as profit"
              formula="Net Profit ÷ Revenue × 100"
            />
            <RatioCard
              title="Return on Assets" ratioKey="roa"
              value={r.roa} prevValue={pr?.roa}
              description="How efficiently assets generate profit"
              formula="Net Profit ÷ Total Assets × 100"
            />
            <RatioCard
              title="Return on Equity" ratioKey="roe"
              value={r.roe} prevValue={pr?.roe}
              description="Return generated on shareholders' equity"
              formula="Net Profit ÷ Total Equity × 100"
            />
          </Section>

          {/* 3. Efficiency */}
          <Section title="EFFICIENCY" icon="⚙️">
            <RatioCard
              title="Days Sales Outstanding" ratioKey="dso"
              value={r.dso} prevValue={pr?.dso}
              description="Average days to collect from customers"
              formula="AR ÷ Revenue × Period Days"
            />
            <RatioCard
              title="Days Payable Outstanding" ratioKey="dpo"
              value={r.dpo} prevValue={pr?.dpo}
              description="Average days to pay suppliers"
              formula="AP ÷ Expenses × Period Days"
            />
            <RatioCard
              title="Asset Turnover" ratioKey="assetTurnover"
              value={r.assetTurnover} prevValue={pr?.assetTurnover}
              description="Revenue generated per SAR of assets"
              formula="Revenue ÷ Total Assets"
            />
            {/* Cash Conversion Cycle */}
            {r.dso !== null && r.dpo !== null && (
              <div style={{ background:'#f3e5f5', border:'1.5px solid #ce93d8', borderRadius:14, padding:'16px 18px' }}>
                <div style={{ fontSize:11, fontWeight:700, color:'#6a1b9a', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>
                  Cash Conversion Cycle
                </div>
                <div style={{ fontSize:24, fontWeight:800, color:'#6a1b9a' }}>
                  {(r.dso - r.dpo).toFixed(0)} days
                </div>
                <div style={{ fontSize:10, color:'#6b7c93', marginTop:6 }}>DSO − DPO · Lower = better cash cycle</div>
              </div>
            )}
          </Section>

          {/* 4. Leverage */}
          <Section title="LEVERAGE & SOLVENCY" icon="⚖️">
            <RatioCard
              title="Debt-to-Equity" ratioKey="debtToEquity"
              value={r.debtToEquity} prevValue={pr?.debtToEquity}
              description="Financial leverage — liabilities vs equity"
              formula="Total Liabilities ÷ Total Equity"
            />
            <RatioCard
              title="Debt Ratio" ratioKey="debtRatio"
              value={r.debtRatio} prevValue={pr?.debtRatio}
              description="Share of assets financed by liabilities"
              formula="Total Liabilities ÷ Total Assets"
            />
            <RatioCard
              title="Equity Multiplier" ratioKey="equityMultiplier"
              value={r.equityMultiplier} prevValue={pr?.equityMultiplier}
              description="Asset base relative to equity (financial leverage)"
              formula="Total Assets ÷ Total Equity"
            />
            {/* Equity vs Liabilities visual */}
            <div style={{ background:'#fff', border:'1.5px solid #e0e0e0', borderRadius:14, padding:'16px 18px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#546e7a', textTransform:'uppercase', letterSpacing:0.5, marginBottom:12 }}>
                Capital Structure
              </div>
              {r._b.totalAssets > 0 && (
                <>
                  <div style={{ height:20, borderRadius:6, overflow:'hidden', display:'flex', marginBottom:8 }}>
                    <div style={{ width:`${Math.min(100,r._b.totalEquity/r._b.totalAssets*100)}%`,
                      background:'#5A32D4', transition:'width 0.5s' }} />
                    <div style={{ flex:1, background:'#ef9a9a' }} />
                  </div>
                  <div style={{ display:'flex', gap:12, fontSize:10 }}>
                    <span><span style={{ display:'inline-block', width:10, height:10, background:'#5A32D4', borderRadius:2, marginRight:4 }}/>
                      Equity {(r._b.totalEquity/r._b.totalAssets*100).toFixed(0)}%</span>
                    <span><span style={{ display:'inline-block', width:10, height:10, background:'#ef9a9a', borderRadius:2, marginRight:4 }}/>
                      Liabilities {(r._b.totalLiab/r._b.totalAssets*100).toFixed(0)}%</span>
                  </div>
                </>
              )}
            </div>
          </Section>

          {/* Methodology note */}
          <div style={{ fontSize:11, color:'#aab2bd', padding:'8px 4px', lineHeight:1.7 }}>
            <strong>Notes:</strong> Ratios derived from GL account types.
            Current Assets = BANK + CASH + CUSTOMER + CONTRACTOR + SUBCON + CLEARING.
            Fixed Assets = ASSET type accounts.
            Current Liabilities = SUPPLIER + GOVERNMENT + LIABILITY.
            Equity includes retained earnings (net profit/loss for the period).
            IC transactions (INTER vouchers) excluded.
            {compare && ' Prior period = same length interval immediately before the selected range.'}
          </div>
        </>
      )}
    </div>
  )
}
