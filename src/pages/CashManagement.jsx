const L1 = '#B8A5CF'
const L2 = '#FFF1F5'
const L3 = '#AF3564'
const PP = "'Poppins', sans-serif"

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { kpiCardGradient } from '../styles/appStyles'

// ═══════════════════════════════════════════════════════════════════
// Cash Management Dashboard — Phase 19
//
// Derives all data from ledger_entries + chart_of_accounts.
// Shows: per-bank-account balances, cash position, transaction
// register per account, inflow/outflow summary, low-balance alerts.
// No new SQL.
// ═══════════════════════════════════════════════════════════════════

const DR_NORMAL = new Set(['BANK','CASH','ASSET','CUSTOMER','CONTRACTOR','EMPLOYEE','EXPENSE','CLEARING','INTERNAL','SUBCON'])
const CASH_TYPES = new Set(['BANK','CASH'])

const today  = () => new Date().toISOString().slice(0,10)
const fmtD   = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'
const fmt    = n => (+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtN   = n => {
  const v=+n||0
  if(Math.abs(v)>=1e6) return (v/1e6).toFixed(2)+'M'
  if(Math.abs(v)>=1e3) return (v/1e3).toFixed(1)+'K'
  return v.toFixed(2)
}

const PRESETS = [
  { label:'Today',      from:today,      to:today },
  { label:'This Month', from:()=>{ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` }, to:today },
  { label:'Last 30d',   from:()=>{ const d=new Date(); d.setDate(d.getDate()-30); return d.toISOString().slice(0,10) }, to:today },
  { label:'This Year',  from:()=>`${new Date().getFullYear()}-01-01`, to:today },
]

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:12 },
  input: { padding:'8px 10px', borderRadius:8, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff', width:'100%', boxSizing:'border-box' },
  label: { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
}

// ── Fetch all balances + transactions ────────────────────────────
async function fetchCashData(entityId, from, to) {
  const [leRes, allLeRes, coaRes] = await Promise.all([
    // Transactions in range
    supabase.from('ledger_entries').select('*')
      .eq('entity_id', entityId)
      .gte('entry_date', from).lte('entry_date', to)
      .order('entry_date', { ascending:false }),
    // All time for running balance
    supabase.from('ledger_entries').select('account_code, debit, credit')
      .eq('entity_id', entityId),
    supabase.from('chart_of_accounts').select('*')
      .eq('entity_id', entityId),
  ])

  const coa    = coaRes.data||[]
  const allLe  = allLeRes.data||[]
  const rangeLe= leRes.data||[]

  // Build COA map
  const coaMap = Object.fromEntries(coa.map(r=>[r.account_code, r]))

  // Running balances per account (all-time)
  const balMap = {}
  for (const e of allLe) {
    if (!balMap[e.account_code]) balMap[e.account_code] = { dr:0, cr:0 }
    balMap[e.account_code].dr += +e.debit||0
    balMap[e.account_code].cr += +e.credit||0
  }

  // Cash/Bank accounts only
  const cashAccounts = coa
    .filter(a => CASH_TYPES.has((a.account_type||'').toUpperCase()))
    .map(a => {
      const type  = (a.account_type||'').toUpperCase()
      const opDr  = +a.opening_debit||0
      const opCr  = +a.opening_credit||0
      const movDr = balMap[a.account_code]?.dr||0
      const movCr = balMap[a.account_code]?.cr||0
      const totDr = opDr + movDr
      const totCr = opCr + movCr
      const balance = DR_NORMAL.has(type) ? (totDr - totCr) : (totCr - totDr)
      return { ...a, balance, account_type:type }
    })

  // Range transactions on cash accounts
  const cashCodes = new Set(cashAccounts.map(a=>a.account_code))
  const txns = rangeLe.filter(e => cashCodes.has(e.account_code))

  // Inflow / outflow in range per account
  const flowMap = {}
  for (const e of txns) {
    if (!flowMap[e.account_code]) flowMap[e.account_code] = { in:0, out:0 }
    // For a BANK/CASH (DR-normal) account: DR = inflow, CR = outflow
    flowMap[e.account_code].in  += +e.debit||0
    flowMap[e.account_code].out += +e.credit||0
  }

  const accounts = cashAccounts.map(a => ({
    ...a,
    inflow:  flowMap[a.account_code]?.in  || 0,
    outflow: flowMap[a.account_code]?.out || 0,
  }))

  // All-entity-level transactions in range on cash accounts
  const allTxns = rangeLe.filter(e => cashCodes.has(e.account_code))

  return { accounts, txns: allTxns, coaMap }
}

// ── Account balance card ─────────────────────────────────────────
function AccountCard({ acct, selected, onClick, fromDate, toDate }) {
  const isLow   = acct.balance < 1000 && acct.balance >= 0
  const isNeg   = acct.balance < 0
  const color   = isNeg ? '#c62828' : isLow ? '#f57f17' : '#2e7d32'
  const bg      = isNeg ? '#ffebee' : isLow ? '#fff8e1' : '#e8f5e9'
  const border  = isNeg ? '#ef9a9a' : isLow ? '#ffe082' : '#a5d6a7'
  const typeBg  = acct.account_type==='CASH' ? '#e3f2fd' : '#f3e5f5'
  const typeC   = acct.account_type==='CASH' ? '#1565C0' : '#5A32D4'

  return (
    <div onClick={onClick} style={{
      background: selected ? '#1a2e3d' : '#fff',
      border: `2px solid ${selected?'#1a2e3d':border}`,
      borderRadius:14, padding:'14px 16px', cursor:'pointer',
      boxShadow:'0 2px 10px rgba(0,0,0,0.07)', transition:'all 0.2s',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
        <span style={{ background:typeBg, color:typeC, borderRadius:6, padding:'2px 8px', fontSize:9, fontWeight:800, letterSpacing:0.5 }}>
          {acct.account_type}
        </span>
        {(isLow||isNeg) && !selected && (
          <span style={{ fontSize:10 }}>{isNeg?'⚠️ Negative':'⚠️ Low'}</span>
        )}
      </div>
      <div style={{ fontWeight:700, fontSize:13, color:selected?'#90caf9':'#1a2e3d', marginBottom:4, lineHeight:1.3 }}>
        {acct.account_name}
      </div>
      <div style={{ fontSize:10, color:selected?'#64b5f6':'#6b7c93', marginBottom:10 }}>
        {acct.account_code}
      </div>
      <div style={{ fontWeight:800, fontSize:20, color:selected?'#fff':color }}>
        {fmt(acct.balance)}
      </div>
      <div style={{ fontSize:10, color:selected?'#90a4ae':'#6b7c93', marginTop:2 }}>SAR balance</div>
      {(acct.inflow > 0 || acct.outflow > 0) && (
        <div style={{ display:'flex', gap:12, marginTop:10, paddingTop:8, borderTop:`1px solid ${selected?'rgba(255,255,255,0.1)':'#f0f4f8'}` }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:selected?'#a5d6a7':'#2e7d32' }}>↑ {fmtN(acct.inflow)}</div>
            <div style={{ fontSize:9, color:selected?'#90a4ae':'#6b7c93' }}>In period</div>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:selected?'#ef9a9a':'#c62828' }}>↓ {fmtN(acct.outflow)}</div>
            <div style={{ fontSize:9, color:selected?'#90a4ae':'#6b7c93' }}>Out period</div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Transaction register for a single account ────────────────────
function AccountRegister({ account, txns, from, to }) {
  const [search, setSearch] = useState('')
  const accountTxns = txns
    .filter(e => e.account_code === account.account_code)
    .filter(e => !search ||
      (e.description||'').toLowerCase().includes(search.toLowerCase()) ||
      (e.voucher_number||'').toLowerCase().includes(search.toLowerCase()))

  // Running balance (newest first, so we reconstruct from current balance)
  let running = account.balance
  const withRunning = accountTxns.map(e => {
    const row = { ...e, running }
    // Undo this transaction to get prior balance
    if (DR_NORMAL.has(account.account_type)) {
      running = running - (+e.debit||0) + (+e.credit||0)
    } else {
      running = running + (+e.debit||0) - (+e.credit||0)
    }
    return row
  })

  function csvExport() {
    const cols=['Date','Voucher','Description','Debit','Credit','Balance']
    const rows=[cols,...withRunning.map(e=>[e.entry_date,e.voucher_number||'',e.description||'',e.debit||'',e.credit||'',e.running.toFixed(2)])].map(r=>r.join(',')).join('\n')
    const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(rows)
    a.download=`${account.account_code}_register.csv`;a.click()
  }

  return (
    <div>
      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:10, flexWrap:'wrap' }}>
        <div style={{ fontWeight:800, fontSize:14, color:'#1a2e3d', flex:1 }}>
          📋 {account.account_name} — Transaction Register
        </div>
        <input style={{ ...S.input, width:220 }} value={search}
          onChange={e=>setSearch(e.target.value)} placeholder="Search description / voucher…" />
        <button onClick={csvExport}
          style={{ background:'#546e7a', color:'#fff', border:'none', borderRadius:8, padding:'7px 12px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
          ⬇ CSV
        </button>
      </div>

      <div style={{ background:'#fff', borderRadius:14, overflow:'auto', boxShadow:'0 2px 10px rgba(0,0,0,0.07)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
          <thead>
            <tr style={{ background:'#f0f4f8' }}>
              {['Date','Voucher','Description','Debit (In)','Credit (Out)','Balance'].map(h=>(
                <th key={h} style={{ padding:'10px 10px', textAlign:['Debit (In)','Credit (Out)','Balance'].includes(h)?'right':'left', fontSize:11, fontWeight:700, background:'#7444A3', color:'#fff', whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {withRunning.length===0 ? (
              <tr><td colSpan={6} style={{ padding:40, textAlign:'center', color:'#6b7c93' }}>No transactions in this period</td></tr>
            ) : withRunning.map((e,i)=>(
              <tr key={e.id||i} style={{ borderBottom:'1px solid #f0f4f8' }}>
                <td style={{ padding:'9px 10px', fontSize:12, whiteSpace:'nowrap' }}>{fmtD(e.entry_date)}</td>
                <td style={{ padding:'9px 10px', fontSize:11, color:'#546e7a' }}>{e.voucher_number||'—'}</td>
                <td style={{ padding:'9px 10px', fontSize:12, color:'#1a2e3d', maxWidth:280 }}>
                  <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.description||'—'}</div>
                </td>
                <td style={{ padding:'9px 10px', textAlign:'right', fontSize:12, color:e.debit>0?'#2e7d32':'#6b7c93', fontWeight:e.debit>0?700:400 }}>
                  {e.debit > 0 ? fmt(e.debit) : '—'}
                </td>
                <td style={{ padding:'9px 10px', textAlign:'right', fontSize:12, color:e.credit>0?'#c62828':'#6b7c93', fontWeight:e.credit>0?700:400 }}>
                  {e.credit > 0 ? fmt(e.credit) : '—'}
                </td>
                <td style={{ padding:'9px 10px', textAlign:'right', fontSize:12, fontWeight:700,
                  color:e.running>=0?'#1a2e3d':'#c62828' }}>
                  {fmt(e.running)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Cash Flow bar chart (inflow vs outflow by month) ─────────────
function CashFlowChart({ txns, accounts, year }) {
  const cashCodes = new Set(accounts.map(a=>a.account_code))
  const monthly = Array.from({length:12},(_,i)=>i+1).map(m=>{
    const mTxns = txns.filter(e=>{
      const d=new Date(e.entry_date)
      return d.getFullYear()===year && d.getMonth()+1===m && cashCodes.has(e.account_code)
    })
    const inflow  = mTxns.reduce((s,e)=>s+(+e.debit||0),0)
    const outflow = mTxns.reduce((s,e)=>s+(+e.credit||0),0)
    return { m, inflow, outflow, net:inflow-outflow }
  })

  const maxVal = Math.max(...monthly.map(m=>Math.max(m.inflow,m.outflow)),1)
  const MONTHS = ['J','F','M','A','M','J','J','A','S','O','N','D']

  return (
    <div style={{ ...S.card }}>
      <div style={{ fontWeight:800, fontSize:12, color:'#6b7c93', letterSpacing:1, marginBottom:12 }}>
        CASH INFLOW VS OUTFLOW — {year}
      </div>
      <div style={{ display:'flex', gap:3, alignItems:'flex-end', height:100 }}>
        {monthly.map(m=>(
          <div key={m.m} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:1 }}>
            <div style={{ width:'100%', display:'flex', gap:1, alignItems:'flex-end', height:80 }}>
              <div style={{ flex:1, background:'#1565C0', borderRadius:'3px 3px 0 0',
                height:`${Math.max(2,(m.inflow/maxVal)*80)}px`, transition:'height 0.4s' }} />
              <div style={{ flex:1, background:'#ef9a9a', borderRadius:'3px 3px 0 0',
                height:`${Math.max(2,(m.outflow/maxVal)*80)}px`, transition:'height 0.4s' }} />
            </div>
            <div style={{ fontSize:9, color:'#6b7c93' }}>{MONTHS[m.m-1]}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:16, marginTop:8, fontSize:10 }}>
        <span><span style={{ display:'inline-block', width:10, height:10, background:'#1565C0', borderRadius:2, marginRight:4 }}/>Inflow</span>
        <span><span style={{ display:'inline-block', width:10, height:10, background:'#ef9a9a', borderRadius:2, marginRight:4 }}/>Outflow</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════
export default function CashManagement({ entityId }) {
  const now = new Date()
  const [from,     setFrom]     = useState(`${now.getFullYear()}-01-01`)
  const [to,       setTo]       = useState(today())
  const [data,     setData]     = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)  // account_code

  const load = useCallback(async () => {
    if (!entityId) return
    setLoading(true)
    const result = await fetchCashData(entityId, from, to)
    setData(result)
    if (!selected && result.accounts.length>0) setSelected(result.accounts[0].account_code)
    setLoading(false)
  }, [entityId, from, to])

  useEffect(() => { load() }, [load])

  const accounts      = data?.accounts || []
  const txns          = data?.txns     || []
  const totalCash     = accounts.reduce((s,a)=>s+a.balance,0)
  const totalInflow   = accounts.reduce((s,a)=>s+a.inflow,0)
  const totalOutflow  = accounts.reduce((s,a)=>s+a.outflow,0)
  const negAccts      = accounts.filter(a=>a.balance<0).length
  const lowAccts      = accounts.filter(a=>a.balance>=0&&a.balance<1000).length
  const selectedAcct  = accounts.find(a=>a.account_code===selected)

  return (
    <div className="cash-mgmt-root" style={{ fontFamily:PP, display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden', background:L2 }}>
      <style>{`.cash-mgmt-root input,.cash-mgmt-root select,.cash-mgmt-root button{font-family:'Poppins',sans-serif!important}`}</style>

      {/* ── UPPER ZONE ── */}
      <div style={{ flexShrink:0, background:L2, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', zIndex:10 }}>
        {/* L1 Heading Bar */}
        <div style={{ background:L2, padding:'6px 28px 0' }}>
          <div style={{ background:L1, padding:'8px 16px', borderRadius:'6px 6px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#fff' }}>🏦 Cash Management</div>
              <div style={{ fontSize:10, color:'#fff', opacity:0.8 }}>Bank &amp; Cash Position</div>
            </div>
            <button onClick={load} style={{ background:L3, color:'#fff', border:'none', borderRadius:7, padding:'7px 16px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div style={{ padding:'10px 28px 12px', background:L2, display:'flex', flexWrap:'wrap', gap:8 }}>
          {[
            { label:'Total Cash & Bank', value: loading ? '—' : fmtN(totalCash) },
            { label:'Inflow (Period)',   value: loading ? '—' : fmtN(totalInflow) },
            { label:'Outflow (Period)',  value: loading ? '—' : fmtN(totalOutflow) },
            { label:'Net Cash Flow',     value: loading ? '—' : fmtN(totalInflow - totalOutflow) },
            { label:'Accounts',          value: loading ? '—' : String(accounts.length) },
            { label:'Alerts',            value: loading ? '—' : String(negAccts + lowAccts) },
          ].map((k, i) => {
            const g = kpiCardGradient(i, L1, L2, L3)
            return (
              <div key={k.label} style={{ ...g, width:160, height:62, borderRadius:10, padding:'0 14px', flexShrink:0, boxShadow:'0 2px 8px rgba(0,0,0,0.10)', display:'flex', flexDirection:'column', justifyContent:'center' }}>
                <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', opacity:0.75, marginBottom:2 }}>{k.label}</div>
                <div style={{ fontSize:16, fontWeight:800, lineHeight:1 }}>{k.value}</div>
                <div style={{ fontSize:9, opacity:0.7, marginTop:2 }}>SAR</div>
              </div>
            )
          })}
        </div>

        {/* Filter Bar */}
        <div style={{ padding:'6px 28px 8px', background:L2 }}>
          <div style={{ background:'#fff', padding:'10px 14px', borderRadius:8, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:3 }}>From</label>
              <input type="date" style={{ ...S.input, width:150 }} value={from} onChange={e=>setFrom(e.target.value)} />
            </div>
            <div>
              <label style={{ display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:3 }}>To</label>
              <input type="date" style={{ ...S.input, width:150 }} value={to} onChange={e=>setTo(e.target.value)} />
            </div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', alignSelf:'flex-end' }}>
              {PRESETS.map(p=>(
                <button key={p.label} onClick={()=>{ setFrom(p.from()); setTo(p.to()) }}
                  style={{ background:'transparent', color:'#546e7a', border:'1.5px solid #546e7a', borderRadius:7, padding:'6px 10px', fontSize:10, fontWeight:700, cursor:'pointer' }}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>{/* end upper zone */}

      {/* ── SCROLL ZONE ── */}
      <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:'10px 28px 22px' }}>
      {loading ? (
        <div style={{ textAlign:'center', padding:80, color:'#6b7c93' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>🏦</div>
          Loading cash positions…
        </div>
      ) : (
        <>

          {/* Alerts */}
          {(negAccts>0 || lowAccts>0) && (
            <div style={{ ...S.card, background:'#fff8e1', border:'1.5px solid #ffe082' }}>
              <div style={{ fontWeight:700, fontSize:13, color:'#f57f17', marginBottom:6 }}>⚠️ Cash Alerts</div>
              {accounts.filter(a=>a.balance<0).map(a=>(
                <div key={a.account_code} style={{ fontSize:12, color:'#c62828', marginBottom:2 }}>
                  🔴 {a.account_name} ({a.account_code}): Balance is <strong>{fmt(a.balance)} SAR</strong> — negative
                </div>
              ))}
              {accounts.filter(a=>a.balance>=0&&a.balance<1000).map(a=>(
                <div key={a.account_code} style={{ fontSize:12, color:'#f57f17', marginBottom:2 }}>
                  🟡 {a.account_name} ({a.account_code}): Low balance — <strong>{fmt(a.balance)} SAR</strong>
                </div>
              ))}
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'300px 1fr', gap:14, alignItems:'start' }}>
            {/* Account cards column */}
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', letterSpacing:1, marginBottom:8 }}>
                ACCOUNTS ({accounts.length})
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {accounts.length===0 && (
                  <div style={{ ...S.card, color:'#6b7c93', fontSize:12 }}>
                    No BANK or CASH accounts found in chart of accounts.
                  </div>
                )}
                {accounts.map(a=>(
                  <AccountCard key={a.account_code} acct={a}
                    selected={selected===a.account_code}
                    fromDate={from} toDate={to}
                    onClick={()=>setSelected(a.account_code)} />
                ))}
              </div>

              {/* Type totals */}
              {accounts.length > 0 && (
                <div style={{ ...S.card, marginTop:12 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', letterSpacing:1, marginBottom:8 }}>TOTALS BY TYPE</div>
                  {['BANK','CASH'].map(t=>{
                    const grp = accounts.filter(a=>a.account_type===t)
                    const tot = grp.reduce((s,a)=>s+a.balance,0)
                    if (!grp.length) return null
                    return (
                      <div key={t} style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:6, paddingBottom:6, borderBottom:'1px solid #f0f4f8' }}>
                        <span style={{ color:'#546e7a' }}>{t} ({grp.length})</span>
                        <span style={{ fontWeight:800, color:tot>=0?'#2e7d32':'#c62828' }}>{fmt(tot)} SAR</span>
                      </div>
                    )
                  })}
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:800 }}>
                    <span>TOTAL</span>
                    <span style={{ color:totalCash>=0?'#1a2e3d':'#c62828' }}>{fmt(totalCash)} SAR</span>
                  </div>
                </div>
              )}
            </div>

            {/* Right panel */}
            <div>
              {/* Chart */}
              <CashFlowChart txns={data?.txns||[]} accounts={accounts} year={now.getFullYear()} />

              {/* Transaction register */}
              {selectedAcct && (
                <div style={{ ...S.card }}>
                  <AccountRegister account={selectedAcct} txns={txns} from={from} to={to} />
                </div>
              )}
            </div>
          </div>
        </>
      )}
      </div>{/* end scroll zone */}
    </div>
  )
}
