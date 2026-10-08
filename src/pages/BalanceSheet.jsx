import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.Accounting
/**
 * BalanceSheet.jsx — Balance Sheet (Statement of Financial Position)
 * As at a specific date — reads all posted journal entries up to that date.
 * Assets = Liabilities + Equity  (verified and shown at bottom)
 * Opening balances from chart_of_accounts are included.
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  th:  { padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:0.5, background:MC, color:'#fff', whiteSpace:'nowrap' },
  td:  { padding:'9px 14px', fontSize:13, color:'#2d3a45', borderBottom:'1px solid #f0f4f8' },
  inp: { padding:'8px 11px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:'inherit' },
}

function fmt(n) {
  return new Intl.NumberFormat('en-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Math.abs(n||0))
}
function fmtSigned(n) {
  if (n === null || n === undefined) return '—'
  const abs = new Intl.NumberFormat('en-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Math.abs(n))
  return n < 0 ? `(${abs})` : abs
}

export default function BalanceSheet({ entityId }) {
  const [asAt, setAsAt]       = useState(new Date().toISOString().split('T')[0])
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!asAt) return
    setLoading(true)

    // ── 1. Load full COA for this entity ──────────────────────────────────
    const { data: coaData } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name, account_type, account_subtype, normal_balance, opening_balance, opening_date, sort_order, is_active')
      .eq('entity_id', entityId)
      .eq('is_active', true)

    if (!coaData) { setLoading(false); return }

    // ── 2. Get all POSTED journal entries up to as-at date ────────────────
    const { data: jeData } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('entity_id', entityId)
      .eq('status', 'POSTED')
      .lte('entry_date', asAt)

    const jeIds = (jeData || []).map(j => j.id)

    // ── 3. Aggregate journal entry lines per account ───────────────────────
    const lineMap = {}  // account_id → { debit, credit }

    if (jeIds.length > 0) {
      const { data: lineData } = await supabase
        .from('journal_entry_lines')
        .select('account_id, debit_amount, credit_amount')
        .in('journal_entry_id', jeIds)

      for (const l of (lineData || [])) {
        if (!l.account_id) continue
        if (!lineMap[l.account_id]) lineMap[l.account_id] = { debit:0, credit:0 }
        lineMap[l.account_id].debit  += +l.debit_amount  || 0
        lineMap[l.account_id].credit += +l.credit_amount || 0
      }
    }

    // ── 4. Compute balance per account ────────────────────────────────────
    // For ASSET/EXPENSE (normal_balance=DEBIT):   balance = opening + debit - credit
    // For LIABILITY/EQUITY/REVENUE (normal_balance=CREDIT): balance = opening + credit - debit
    // P&L accounts (REVENUE/EXPENSE) roll into Retained Earnings at period close,
    // but for a running BS we compute current-year net profit separately.

    const accounts = coaData.map(coa => {
      const mv    = lineMap[coa.id] || { debit:0, credit:0 }
      const ob    = +coa.opening_balance || 0
      let balance = 0
      if (coa.normal_balance === 'DEBIT') {
        balance = ob + mv.debit - mv.credit
      } else {
        balance = ob + mv.credit - mv.debit
      }
      return { ...coa, movements_debit: mv.debit, movements_credit: mv.credit, balance }
    })

    // ── 5. Classify ──────────────────────────────────────────────────────
    // Balance Sheet accounts only (ASSET, LIABILITY, EQUITY)
    const bsAccounts = accounts.filter(a =>
      ['ASSET','LIABILITY','EQUITY'].includes(a.account_type) && Math.abs(a.balance) > 0.009
    )

    // Current Year P&L (REVENUE - EXPENSE from journal entries this fiscal year)
    const revAccounts = accounts.filter(a => a.account_type === 'REVENUE')
    const expAccounts = accounts.filter(a => a.account_type === 'EXPENSE')

    // Revenue: normal_balance=CREDIT → positive balance = income
    const totalRevenue = revAccounts.reduce((s,a) => s + a.balance, 0)
    // Expense: normal_balance=DEBIT → positive balance = cost
    const totalExpense = expAccounts.reduce((s,a) => s + a.balance, 0)
    const currentYearPL = totalRevenue - totalExpense

    // Sort and group
    const sortAcc = arr => [...arr].sort((a,b) =>
      (a.sort_order||0)-(b.sort_order||0) || a.account_code.localeCompare(b.account_code)
    )

    const currentAssets  = sortAcc(bsAccounts.filter(a => a.account_type==='ASSET' && a.account_subtype==='CURRENT_ASSET'))
    const fixedAssets    = sortAcc(bsAccounts.filter(a => a.account_type==='ASSET' && a.account_subtype!=='CURRENT_ASSET'))
    const currentLiab    = sortAcc(bsAccounts.filter(a => a.account_type==='LIABILITY' && a.account_subtype==='CURRENT_LIABILITY'))
    const ltLiab         = sortAcc(bsAccounts.filter(a => a.account_type==='LIABILITY' && a.account_subtype!=='CURRENT_LIABILITY'))
    const equity         = sortAcc(bsAccounts.filter(a => a.account_type==='EQUITY'))

    setData({
      currentAssets, fixedAssets,
      currentLiab, ltLiab,
      equity,
      currentYearPL,
      totalRevenue,
      totalExpense,
      jeCount: jeIds.length,
    })
    setLoading(false)
  }, [entityId, asAt])

  useEffect(() => { load() }, [load])

  // ── Derived totals ────────────────────────────────────────────────────────
  const totalCA   = (data?.currentAssets || []).reduce((s,a) => s + a.balance, 0)
  const totalFA   = (data?.fixedAssets   || []).reduce((s,a) => s + a.balance, 0)
  const totalAss  = totalCA + totalFA

  const totalCL   = (data?.currentLiab   || []).reduce((s,a) => s + a.balance, 0)
  const totalLTL  = (data?.ltLiab        || []).reduce((s,a) => s + a.balance, 0)
  const totalLiab = totalCL + totalLTL

  const totalEq   = (data?.equity        || []).reduce((s,a) => s + a.balance, 0)
  const cyPL      = data?.currentYearPL || 0
  const totalEquityWithPL = totalEq + cyPL

  const totalLiabEquity   = totalLiab + totalEquityWithPL
  const balanced          = Math.abs(totalAss - totalLiabEquity) < 1  // within SAR 1

  // ── Print ─────────────────────────────────────────────────────────────────
  function handlePrint() {
    if (!data) return
    const secRows = (arr, mult=1) => arr.map(a => `
      <tr>
        <td style="padding-left:28px;color:#555">${a.account_code} — ${a.account_name}</td>
        <td style="text-align:right">${fmt(a.balance * mult)}</td>
      </tr>`).join('')

    const w = window.open('', '_blank', 'width=750,height:900')
    w.document.write(`<!DOCTYPE html><html><head><title>Balance Sheet</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;padding:30px;max-width:650px;margin:0 auto}
    h2{color:#1a2e3d}table{width:100%;border-collapse:collapse}td{padding:6px 10px;border-bottom:1px solid #eee}
    .sec{font-weight:800;background:#f0f4f8;color:#1a2e3d}.tot{font-weight:800;border-top:2px solid #1a2e3d}
    .grand{font-weight:900;background:#1a2e3d;color:#fff;font-size:13px}</style></head><body>
    <h2>Balance Sheet — As at ${asAt}</h2>
    <p>Based on ${data.jeCount} posted journal entries</p>
    <table>
      <tr class="sec"><td colspan="2">ASSETS</td></tr>
      <tr><td colspan="2"><strong>Current Assets</strong></td></tr>
      ${secRows(data.currentAssets)}
      <tr class="tot"><td>Total Current Assets</td><td style="text-align:right">${fmt(totalCA)}</td></tr>
      <tr><td colspan="2"><strong>Fixed Assets</strong></td></tr>
      ${secRows(data.fixedAssets)}
      <tr class="tot"><td>Total Fixed Assets</td><td style="text-align:right">${fmt(totalFA)}</td></tr>
      <tr class="grand"><td>TOTAL ASSETS</td><td style="text-align:right">${fmt(totalAss)}</td></tr>
      <tr class="sec"><td colspan="2">LIABILITIES</td></tr>
      <tr><td colspan="2"><strong>Current Liabilities</strong></td></tr>
      ${secRows(data.currentLiab)}
      <tr class="tot"><td>Total Current Liabilities</td><td style="text-align:right">${fmt(totalCL)}</td></tr>
      <tr><td colspan="2"><strong>Long-Term Liabilities</strong></td></tr>
      ${secRows(data.ltLiab)}
      <tr class="tot"><td>Total Long-Term Liabilities</td><td style="text-align:right">${fmt(totalLTL)}</td></tr>
      <tr class="grand"><td>TOTAL LIABILITIES</td><td style="text-align:right">${fmt(totalLiab)}</td></tr>
      <tr class="sec"><td colspan="2">EQUITY</td></tr>
      ${secRows(data.equity)}
      <tr><td style="padding-left:28px"><em>Current Year Profit / (Loss)</em></td><td style="text-align:right">${fmtSigned(cyPL)}</td></tr>
      <tr class="grand"><td>TOTAL EQUITY</td><td style="text-align:right">${fmt(totalEquityWithPL)}</td></tr>
      <tr class="grand"><td>TOTAL LIABILITIES + EQUITY</td><td style="text-align:right">${fmt(totalLiabEquity)}</td></tr>
    </table>
    <p style="color:${balanced?'green':'red'}">${balanced?'✓ Balanced':'✗ Out of balance by SAR '+fmt(Math.abs(totalAss-totalLiabEquity))}</p>
    <script>window.print()</script></body></html>`)
    w.document.close()
  }

  // ── Render helper sub-components ─────────────────────────────────────────
  function SectionHeader({ label, bg='#1a2e3d', color='#fff' }) {
    return (
      <tr>
        <td colSpan={2} style={{ padding:'10px 14px', fontSize:11, fontWeight:900, textTransform:'uppercase', letterSpacing:0.8, background:bg, color }}>{label}</td>
      </tr>
    )
  }

  function GroupHeader({ label }) {
    return (
      <tr style={{ background:'#f8fafc' }}>
        <td colSpan={2} style={{ ...S.td, paddingLeft:14, fontWeight:800, fontSize:12, color:'#4a5568', borderBottom:'none' }}>{label}</td>
      </tr>
    )
  }

  function AccountRow({ acc }) {
    return (
      <tr style={{ background:'#fff' }}>
        <td style={{ ...S.td, paddingLeft:30 }}>
          <span style={{ fontSize:11, color:'#aab2bd', fontFamily:'monospace', marginRight:8 }}>{acc.account_code}</span>
          {acc.account_name}
        </td>
        <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:'#2d3a45', fontWeight:500 }}>
          {fmt(acc.balance)}
        </td>
      </tr>
    )
  }

  function SubtotalRow({ label, value, bg='#f0f4f8', bold=false, large=false, color=null }) {
    const c = color || (value >= 0 ? '#1a2e3d' : '#c0392b')
    return (
      <tr style={{ background:bg }}>
        <td style={{ ...S.td, fontWeight:bold?800:600, fontSize:large?15:13, paddingLeft:14, color:'#1a2e3d', borderTop: bold?'2px solid #c8d0da':'none' }}>{label}</td>
        <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', fontWeight:bold?900:700, fontSize:large?15:13, color:c, borderTop: bold?'2px solid #c8d0da':'none' }}>
          SAR {fmt(value)}
        </td>
      </tr>
    )
  }

  function GrandRow({ label, value, balanced: isBalanced }) {
    return (
      <tr style={{ background:'#1a2e3d' }}>
        <td style={{ padding:'12px 14px', fontWeight:900, fontSize:15, color:'#fff' }}>{label}</td>
        <td style={{ padding:'12px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:900, fontSize:15, color: isBalanced===undefined ? '#a8e6c3' : (isBalanced ? '#a8e6c3' : '#f5a0a0') }}>
          SAR {fmt(value)}
        </td>
      </tr>
    )
  }

  return (
    <div style={{ padding:24, maxWidth:900, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:13, color:'#6b7c93' }}>
            Statement of Financial Position — as at {asAt}
            {data && ` · ${data.jeCount} posted entries`}
          </div>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={handlePrint} disabled={!data} style={{ background:'#1a2e3d', color:'#fff', border:'none', borderRadius:9, padding:'9px 20px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
            🖨 Print
          </button>
        </div>
      </div>

      {/* As-at date selector */}
      <div style={{ background:'#fff', borderRadius:12, border:'1.5px solid #e8edf5', padding:16, marginBottom:20, display:'flex', gap:16, alignItems:'flex-end' }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>As at Date</div>
          <input style={S.inp} type="date" value={asAt} onChange={e=>setAsAt(e.target.value)} />
        </div>
        <div style={{ fontSize:12, color:'#6b7c93', paddingBottom:2 }}>
          Includes all posted journal entries up to and including this date, plus COA opening balances.
        </div>
      </div>

      {/* Balance indicator */}
      {data && !loading && (
        <div style={{
          marginBottom:16, padding:'10px 16px', borderRadius:8, fontSize:13, fontWeight:700,
          background: balanced ? '#e8f5e9' : '#fdecea',
          color:      balanced ? '#2e7d32' : '#c0392b',
          display:'flex', alignItems:'center', gap:8
        }}>
          {balanced ? '✓ Balance sheet is balanced — Assets = Liabilities + Equity' : `✗ Out of balance by SAR ${fmt(Math.abs(totalAss - totalLiabEquity))} — check for missing journal entries or opening balances`}
        </div>
      )}

      {/* KPI Cards */}
      {data && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          {[
            { label:'Total Assets',         value:totalAss,            color:'#1a2e3d' },
            { label:'Total Liabilities',     value:totalLiab,           color:'#c0392b' },
            { label:'Equity + Retained',     value:totalEquityWithPL,   color:'#1565c0' },
            { label:'Current Year P&L',      value:cyPL,                color: cyPL>=0?'#1a7f4b':'#c0392b' },
          ].map(c=>(
            <div key={c.label} style={{ background:'#fff', borderRadius:10, border:'1.5px solid #e8edf5', padding:'14px 18px' }}>
              <div style={{ fontSize:11, color:'#6b7c93', fontWeight:700, textTransform:'uppercase', letterSpacing:0.4, marginBottom:6 }}>{c.label}</div>
              <div style={{ fontSize:15, fontWeight:800, color:c.color, fontFamily:'monospace' }}>
                {c.value < 0 ? '(' : ''}SAR {fmt(c.value)}{c.value < 0 ? ')' : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Balance Sheet table — two-column layout */}
      {loading ? (
        <div style={{ padding:60, textAlign:'center', color:'#aab2bd', background:'#fff', borderRadius:12, border:'1.5px solid #e8edf5' }}>Calculating balance sheet…</div>
      ) : !data ? (
        <div style={{ padding:60, textAlign:'center', color:'#aab2bd', background:'#fff', borderRadius:12, border:'1.5px solid #e8edf5' }}>Select a date above</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>

          {/* LEFT COLUMN — ASSETS */}
          <div style={{ background:'#fff', borderRadius:12, border:'1.5px solid #e8edf5', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr><th style={S.th} colSpan={2}>Assets</th></tr>
              </thead>
              <tbody>
                <GroupHeader label="Current Assets" />
                {data.currentAssets.length === 0 && (
                  <tr><td colSpan={2} style={{ ...S.td, paddingLeft:30, color:'#aab2bd', fontStyle:'italic' }}>None</td></tr>
                )}
                {data.currentAssets.map(a => <AccountRow key={a.id} acc={a} />)}
                <SubtotalRow label="Total Current Assets" value={totalCA} bg="#e3f2fd" />

                <GroupHeader label="Fixed Assets" />
                {data.fixedAssets.length === 0 && (
                  <tr><td colSpan={2} style={{ ...S.td, paddingLeft:30, color:'#aab2bd', fontStyle:'italic' }}>None</td></tr>
                )}
                {data.fixedAssets.map(a => <AccountRow key={a.id} acc={a} />)}
                <SubtotalRow label="Total Fixed Assets" value={totalFA} bg="#e3f2fd" />
              </tbody>
              <tfoot>
                <GrandRow label="TOTAL ASSETS" value={totalAss} />
              </tfoot>
            </table>
          </div>

          {/* RIGHT COLUMN — LIABILITIES + EQUITY */}
          <div style={{ background:'#fff', borderRadius:12, border:'1.5px solid #e8edf5', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr><th style={S.th} colSpan={2}>Liabilities & Equity</th></tr>
              </thead>
              <tbody>
                <GroupHeader label="Current Liabilities" />
                {data.currentLiab.length === 0 && (
                  <tr><td colSpan={2} style={{ ...S.td, paddingLeft:30, color:'#aab2bd', fontStyle:'italic' }}>None</td></tr>
                )}
                {data.currentLiab.map(a => <AccountRow key={a.id} acc={a} />)}
                <SubtotalRow label="Total Current Liabilities" value={totalCL} bg="#fce4ec" />

                <GroupHeader label="Long-Term Liabilities" />
                {data.ltLiab.length === 0 && (
                  <tr><td colSpan={2} style={{ ...S.td, paddingLeft:30, color:'#aab2bd', fontStyle:'italic' }}>None</td></tr>
                )}
                {data.ltLiab.map(a => <AccountRow key={a.id} acc={a} />)}
                <SubtotalRow label="Total Long-Term Liabilities" value={totalLTL} bg="#fce4ec" />
                <SubtotalRow label="TOTAL LIABILITIES" value={totalLiab} bg="#fdecea" bold />

                <GroupHeader label="Equity" />
                {data.equity.map(a => <AccountRow key={a.id} acc={a} />)}
                {/* Current year profit as a line within equity */}
                <tr style={{ background:'#f0fff4' }}>
                  <td style={{ ...S.td, paddingLeft:30, fontStyle:'italic', color:'#2e7d32' }}>
                    Current Year Profit / (Loss)
                  </td>
                  <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', fontWeight:700, color: cyPL>=0?'#1a7f4b':'#c0392b' }}>
                    {cyPL < 0 ? '(' : ''}{fmt(cyPL)}{cyPL < 0 ? ')' : ''}
                  </td>
                </tr>
                <SubtotalRow label="TOTAL EQUITY" value={totalEquityWithPL} bg="#e8f5e9" bold />
              </tbody>
              <tfoot>
                <GrandRow label="TOTAL LIABILITIES + EQUITY" value={totalLiabEquity} balanced={balanced} />
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
