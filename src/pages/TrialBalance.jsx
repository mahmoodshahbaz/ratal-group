import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.Accounting
/**
 * TrialBalance.jsx
 * Aggregates all posted journal_entry_lines up to a chosen date,
 * groups by account, and shows DR total, CR total, and net balance.
 * Reads from journal_entries + journal_entry_lines + chart_of_accounts.
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const S = {
  th: { padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:0.5, background:MC, color:'#fff', whiteSpace:'nowrap' },
  td: { padding:'9px 14px', fontSize:13, color:'#2d3a45', borderBottom:'1px solid #f0f4f8', verticalAlign:'middle' },
}

function fmt(n) {
  return new Intl.NumberFormat('en-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Math.abs(n)||0)
}

const TYPE_ORDER = ['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE']
const TYPE_COLOR = {
  ASSET:     '#1a7f4b',
  LIABILITY: '#c0392b',
  EQUITY:    '#2c5282',
  REVENUE:   '#2d6a4f',
  EXPENSE:   '#9b2226',
}

export default function TrialBalance({ entityId }) {
  const [asAt, setAsAt]         = useState(new Date().toISOString().split('T')[0])
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(false)
  const [totals, setTotals]     = useState({ dr:0, cr:0 })
  const [showZero, setShowZero] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)

    // 1. Fetch all POSTED journal entries up to as-at date for this entity
    const { data: jeData } = await supabase
      .from('journal_entries')
      .select('id')
      .eq('entity_id', entityId)
      .eq('status', 'POSTED')
      .lte('entry_date', asAt)

    if (!jeData || jeData.length === 0) {
      setRows([]); setTotals({ dr:0, cr:0 }); setLoading(false); return
    }

    const jeIds = jeData.map(j => j.id)

    // 2. Fetch all lines for those JEs
    const { data: lineData } = await supabase
      .from('journal_entry_lines')
      .select('account_id,account_code,account_name,debit_amount,credit_amount')
      .in('journal_entry_id', jeIds)

    if (!lineData) { setRows([]); setTotals({ dr:0, cr:0 }); setLoading(false); return }

    // 3. Fetch COA for account_type + opening_balance + normal_balance
    const { data: coaData } = await supabase
      .from('chart_of_accounts')
      .select('id,account_code,account_name,account_type,account_subtype,normal_balance,opening_balance')
      .eq('entity_id', entityId)
      .eq('is_active', true)

    const coaMap = Object.fromEntries((coaData||[]).map(a => [a.id, a]))

    // 4. Aggregate per account_id
    const acc = {}
    lineData.forEach(l => {
      const id = l.account_id
      if (!acc[id]) {
        const coa = coaMap[id] || {}
        acc[id] = {
          account_id:   id,
          account_code: l.account_code || coa.account_code || '',
          account_name: l.account_name || coa.account_name || '',
          account_type: coa.account_type || 'ASSET',
          account_subtype: coa.account_subtype || '',
          normal_balance: coa.normal_balance || 'DEBIT',
          opening_balance: +(coa.opening_balance)||0,
          total_dr: 0,
          total_cr: 0,
        }
      }
      acc[id].total_dr += +l.debit_amount  || 0
      acc[id].total_cr += +l.credit_amount || 0
    })

    // 5. Add any COA accounts with opening_balance but no movement
    ;(coaData||[]).forEach(coa => {
      if (!acc[coa.id] && coa.opening_balance && +coa.opening_balance !== 0) {
        acc[coa.id] = {
          account_id:   coa.id,
          account_code: coa.account_code,
          account_name: coa.account_name,
          account_type: coa.account_type || 'ASSET',
          account_subtype: coa.account_subtype || '',
          normal_balance: coa.normal_balance || 'DEBIT',
          opening_balance: +coa.opening_balance,
          total_dr: 0,
          total_cr: 0,
        }
      }
    })

    // 6. Compute net balance per account
    // DEBIT normal: net = opening + DR - CR (shown in DR column if positive)
    // CREDIT normal: net = opening + CR - DR (shown in CR column if positive)
    const result = Object.values(acc).map(r => {
      const ob = r.opening_balance
      let dr_bal = 0, cr_bal = 0
      if (r.normal_balance === 'DEBIT') {
        const net = ob + r.total_dr - r.total_cr
        if (net >= 0) dr_bal = net; else cr_bal = -net
      } else {
        const net = ob + r.total_cr - r.total_dr
        if (net >= 0) cr_bal = net; else dr_bal = -net
      }
      return { ...r, dr_bal, cr_bal }
    })

    // Sort by code within type
    result.sort((a,b) =>
      TYPE_ORDER.indexOf(a.account_type) - TYPE_ORDER.indexOf(b.account_type) ||
      a.account_code.localeCompare(b.account_code)
    )

    const totalDr = result.reduce((s,r) => s + r.dr_bal, 0)
    const totalCr = result.reduce((s,r) => s + r.cr_bal, 0)

    setRows(result)
    setTotals({ dr: totalDr, cr: totalCr })
    setLoading(false)
  }, [entityId, asAt])

  useEffect(() => { load() }, [load])

  const displayed = showZero ? rows : rows.filter(r => r.dr_bal !== 0 || r.cr_bal !== 0)

  // Group by account_type
  const groups = {}
  displayed.forEach(r => {
    if (!groups[r.account_type]) groups[r.account_type] = []
    groups[r.account_type].push(r)
  })

  const balanced = Math.abs(totals.dr - totals.cr) < 0.01

  function handlePrint() {
    const w = window.open('', '_blank', 'width=900,height=700')
    let tbody = ''
    TYPE_ORDER.forEach(type => {
      const grp = groups[type]
      if (!grp || grp.length === 0) return
      const gDr = grp.reduce((s,r)=>s+r.dr_bal,0)
      const gCr = grp.reduce((s,r)=>s+r.cr_bal,0)
      tbody += `<tr style="background:#e8edf5"><td colspan="4" style="padding:6px 10px;font-weight:800;font-size:12px">${type}</td></tr>`
      grp.forEach(r => {
        tbody += `<tr><td style="padding:4px 10px 4px 20px">${r.account_code}</td><td>${r.account_name}</td>
          <td style="text-align:right">${r.dr_bal>0?fmt(r.dr_bal):''}</td>
          <td style="text-align:right">${r.cr_bal>0?fmt(r.cr_bal):''}</td></tr>`
      })
      tbody += `<tr style="font-weight:700;background:#f5f7fa"><td colspan="2" style="padding:4px 10px;text-align:right">${type} Subtotal</td>
        <td style="text-align:right">${gDr>0?fmt(gDr):''}</td>
        <td style="text-align:right">${gCr>0?fmt(gCr):''}</td></tr>`
    })
    w.document.write(`<!DOCTYPE html><html><head><title>Trial Balance</title>
    <style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px}table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ddd;padding:5px 8px}th{background:#1a2e3d;color:#fff}h2{color:#1a2e3d}</style></head><body>
    <h2>Trial Balance</h2><p>As at: ${asAt}</p>
    <table><thead><tr><th>Code</th><th>Account</th><th>Debit (DR)</th><th>Credit (CR)</th></tr></thead>
    <tbody>${tbody}</tbody>
    <tfoot><tr style="font-weight:bold;background:#1a2e3d;color:#fff">
    <td colspan="2">GRAND TOTAL</td>
    <td style="text-align:right">${fmt(totals.dr)}</td>
    <td style="text-align:right">${fmt(totals.cr)}</td></tr></tfoot>
    </table><p style="color:${balanced?'green':'red'}">${balanced?'✔ Balanced':'✘ NOT BALANCED — difference: '+fmt(totals.dr-totals.cr)}</p>
    <script>window.print()</script></body></html>`)
    w.document.close()
  }

  return (
    <div style={{ padding:24, maxWidth:1100, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:13, color:'#6b7c93' }}>Cumulative balances of all posted journal entries</div>
        </div>
        <button onClick={handlePrint} disabled={!rows.length} style={{ background:'#1a2e3d', color:'#fff', border:'none', borderRadius:9, padding:'9px 20px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
          🖨 Print
        </button>
      </div>

      {/* Filters */}
      <div style={{ background:'#fff', borderRadius:12, border:'1.5px solid #e8edf5', padding:16, marginBottom:16, display:'flex', gap:16, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>As at Date</div>
          <input type="date" value={asAt} onChange={e=>setAsAt(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none' }} />
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#4a5568', cursor:'pointer', paddingBottom:2 }}>
          <input type="checkbox" checked={showZero} onChange={e=>setShowZero(e.target.checked)} style={{ width:15, height:15 }} />
          Show zero-balance accounts
        </label>
      </div>

      {/* Balance check banner */}
      <div style={{ marginBottom:16, padding:'10px 16px', borderRadius:9, border:`2px solid ${balanced?'#1a7f4b':'#c0392b'}`, background:balanced?'#f0fff4':'#fff5f5', display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:18 }}>{balanced?'✅':'❌'}</span>
        <span style={{ fontWeight:700, color:balanced?'#1a7f4b':'#c0392b', fontSize:14 }}>
          {balanced
            ? 'Trial Balance is balanced — Total DR = Total CR'
            : `NOT BALANCED — Difference: SAR ${fmt(Math.abs(totals.dr - totals.cr))}`}
        </span>
        <span style={{ marginLeft:'auto', fontFamily:'monospace', fontSize:13, color:'#6b7c93' }}>
          DR {fmt(totals.dr)} · CR {fmt(totals.cr)}
        </span>
      </div>

      {/* Table */}
      <div style={{ background:'#fff', borderRadius:12, border:'1.5px solid #e8edf5', overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:60, textAlign:'center', color:'#aab2bd' }}>Loading trial balance…</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...S.th, width:100 }}>Code</th>
                <th style={S.th}>Account Name</th>
                <th style={{ ...S.th, textAlign:'right', width:160 }}>Debit (DR)</th>
                <th style={{ ...S.th, textAlign:'right', width:160 }}>Credit (CR)</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={4} style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>
                  No posted journal entries found up to {asAt}
                </td></tr>
              )}

              {TYPE_ORDER.map(type => {
                const grp = groups[type]
                if (!grp || grp.length === 0) return null
                const gDr = grp.reduce((s,r)=>s+r.dr_bal,0)
                const gCr = grp.reduce((s,r)=>s+r.cr_bal,0)
                return (
                  <>
                    {/* Type header */}
                    <tr key={`hdr-${type}`}>
                      <td colSpan={4} style={{ padding:'10px 14px', background:'#1a2e3d', color:'#cfd8e3', fontWeight:800, fontSize:11, textTransform:'uppercase', letterSpacing:0.6 }}>
                        <span style={{ marginRight:8, opacity:0.6 }}>●</span>{type}
                      </td>
                    </tr>

                    {/* Account rows */}
                    {grp.map((r, i) => (
                      <tr key={r.account_id} style={{ background: i%2===0?'#fff':'#fafbfc' }}>
                        <td style={{ ...S.td, fontFamily:'monospace', fontSize:12, color:'#6b7c93' }}>{r.account_code}</td>
                        <td style={{ ...S.td, fontWeight:500 }}>{r.account_name}</td>
                        <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:'#1a7f4b', fontWeight:r.dr_bal>0?700:400 }}>
                          {r.dr_bal > 0 ? fmt(r.dr_bal) : ''}
                        </td>
                        <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:'#c0392b', fontWeight:r.cr_bal>0?700:400 }}>
                          {r.cr_bal > 0 ? fmt(r.cr_bal) : ''}
                        </td>
                      </tr>
                    ))}

                    {/* Type subtotal */}
                    <tr key={`sub-${type}`} style={{ background:'#f0f4f8' }}>
                      <td colSpan={2} style={{ padding:'8px 14px', textAlign:'right', fontWeight:700, fontSize:12, color:TYPE_COLOR[type] }}>
                        {type} Subtotal
                      </td>
                      <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color:'#1a7f4b' }}>
                        {gDr > 0 ? fmt(gDr) : ''}
                      </td>
                      <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color:'#c0392b' }}>
                        {gCr > 0 ? fmt(gCr) : ''}
                      </td>
                    </tr>
                  </>
                )
              })}
            </tbody>

            {rows.length > 0 && (
              <tfoot>
                <tr style={{ background:'#1a2e3d' }}>
                  <td colSpan={2} style={{ padding:'12px 14px', fontWeight:800, fontSize:13, color:'#fff' }}>GRAND TOTAL</td>
                  <td style={{ padding:'12px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color:'#a8e6c3', fontSize:14 }}>{fmt(totals.dr)}</td>
                  <td style={{ padding:'12px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color:'#f5a0a0', fontSize:14 }}>{fmt(totals.cr)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  )
}
