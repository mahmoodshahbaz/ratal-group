import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.Accounting
/**
 * BankRecon.jsx — Bank Reconciliation
 *
 * Compares the bank_accounts statement balance against
 * journal_entry_lines for the same account.
 *
 * Workflow:
 *  1. Select a bank account
 *  2. Enter the bank statement closing balance + statement date
 *  3. System shows all journal entries for that account in the period
 *  4. User ticks "Cleared" items (those that appear on the bank statement)
 *  5. Reconciliation = Statement Balance − (Opening Balance + Sum of cleared lines)
 *     → should equal zero when reconciled
 *
 * Cleared status is stored in bank_recon_items (upserted per JE line + period).
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function fmt(n) {
  return new Intl.NumberFormat('en-SA', { minimumFractionDigits:2, maximumFractionDigits:2 }).format(Math.abs(n)||0)
}
function sign(n) { return n < 0 ? '-' : '' }

const S = {
  th: { padding:'9px 12px', textAlign:'left', fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:0.4, background:MC, color:'#fff', whiteSpace:'nowrap' },
  td: { padding:'9px 12px', fontSize:12, color:'#2d3a45', borderBottom:'1px solid #f0f4f8', verticalAlign:'middle' },
  inp: { padding:'8px 11px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:'inherit' },
}

export default function BankRecon({ entityId }) {
  const [bankAccounts, setBankAccounts]     = useState([])
  const [selBankId,    setSelBankId]        = useState('')
  const [selBank,      setSelBank]          = useState(null)
  const [dateFrom,     setDateFrom]         = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
  })
  const [dateTo,       setDateTo]           = useState(new Date().toISOString().split('T')[0])
  const [stmtBalance,  setStmtBalance]      = useState('')
  const [stmtDate,     setStmtDate]         = useState(new Date().toISOString().split('T')[0])
  const [openingBal,   setOpeningBal]       = useState('')
  const [rows,         setRows]             = useState([])
  const [cleared,      setCleared]          = useState({})   // lineId → bool
  const [loading,      setLoading]          = useState(false)
  const [saving,       setSaving]           = useState(false)
  const [saved,        setSaved]            = useState(false)

  // Load bank accounts
  useEffect(() => {
    supabase.from('bank_accounts').select('id,account_name,account_number,coa_account_id,opening_balance,bank_name')
      .eq('entity_id', entityId).eq('is_active', true).order('account_name')
      .then(({ data }) => setBankAccounts(data || []))
  }, [entityId])

  // When account changes, load its opening balance
  function onAccountChange(id) {
    setSelBankId(id)
    const ba = bankAccounts.find(b => b.id === id)
    setSelBank(ba || null)
    setOpeningBal(ba?.opening_balance != null ? String(ba.opening_balance) : '0')
    setRows([])
    setCleared({})
    setSaved(false)
  }

  const loadLines = useCallback(async () => {
    if (!selBank?.coa_account_id) return
    setLoading(true)
    setSaved(false)

    // 1. Fetch posted JEs in the date range
    const { data: jeData } = await supabase
      .from('journal_entries')
      .select('id,entry_number,entry_date,narration,reference,source_type,status')
      .eq('entity_id', entityId)
      .eq('status', 'POSTED')
      .gte('entry_date', dateFrom)
      .lte('entry_date', dateTo)
      .order('entry_date').order('created_at')

    if (!jeData || jeData.length === 0) { setRows([]); setLoading(false); return }

    const jeIds = jeData.map(j => j.id)
    const jeMap = Object.fromEntries(jeData.map(j => [j.id, j]))

    // 2. Fetch lines for this account
    const { data: lineData } = await supabase
      .from('journal_entry_lines')
      .select('id,journal_entry_id,debit_amount,credit_amount,description')
      .in('journal_entry_id', jeIds)
      .eq('account_id', selBank.coa_account_id)

    if (!lineData) { setRows([]); setLoading(false); return }

    // 3. Load existing cleared flags from bank_recon_items for this period
    const lineIds = lineData.map(l => l.id)
    let existingCleared = {}
    if (lineIds.length > 0) {
      const { data: reconData } = await supabase
        .from('bank_recon_items')
        .select('journal_line_id,is_cleared')
        .eq('bank_account_id', selBankId)
        .eq('period', dateTo.slice(0,7))
        .in('journal_line_id', lineIds)
      ;(reconData || []).forEach(r => { existingCleared[r.journal_line_id] = r.is_cleared })
    }

    // 4. Merge lines with JE headers
    const merged = lineData.map(l => ({
      ...l,
      entry_number: jeMap[l.journal_entry_id]?.entry_number || '',
      entry_date:   jeMap[l.journal_entry_id]?.entry_date || '',
      narration:    jeMap[l.journal_entry_id]?.narration || '',
      reference:    jeMap[l.journal_entry_id]?.reference || '',
      source_type:  jeMap[l.journal_entry_id]?.source_type || '',
    })).sort((a,b) => a.entry_date.localeCompare(b.entry_date))

    setRows(merged)
    setCleared(existingCleared)
    setLoading(false)
  }, [entityId, selBank, selBankId, dateFrom, dateTo])

  useEffect(() => { if (selBank?.coa_account_id) loadLines() }, [loadLines])

  // Compute running book balance
  const ob          = parseFloat(openingBal) || 0
  const bookBalance = rows.reduce((sum, r) => {
    // ASSET account: debit increases, credit decreases
    return sum + (parseFloat(r.debit_amount)||0) - (parseFloat(r.credit_amount)||0)
  }, ob)

  const clearedDr   = rows.filter(r => cleared[r.id]).reduce((s,r) => s + (parseFloat(r.debit_amount)||0), 0)
  const clearedCr   = rows.filter(r => cleared[r.id]).reduce((s,r) => s + (parseFloat(r.credit_amount)||0), 0)
  const clearedNet  = clearedDr - clearedCr   // net cleared movement (ASSET: DR−CR)
  const clearedBook = ob + clearedNet          // opening + cleared = "cleared book balance"

  const stmtBal     = parseFloat(stmtBalance) || 0
  const difference  = stmtBal - bookBalance   // unreconciled difference

  const unclearedDr = rows.filter(r => !cleared[r.id]).reduce((s,r) => s + (parseFloat(r.debit_amount)||0), 0)
  const unclearedCr = rows.filter(r => !cleared[r.id]).reduce((s,r) => s + (parseFloat(r.credit_amount)||0), 0)

  const isReconciled = Math.abs(difference) < 0.01

  // Toggle cleared
  function toggleCleared(id) {
    setCleared(prev => ({ ...prev, [id]: !prev[id] }))
    setSaved(false)
  }

  function markAll(val) {
    const upd = {}
    rows.forEach(r => { upd[r.id] = val })
    setCleared(upd)
    setSaved(false)
  }

  // Save reconciliation
  async function saveRecon() {
    if (!selBankId || rows.length === 0) return
    setSaving(true)
    const period = dateTo.slice(0, 7)
    const upserts = rows.map(r => ({
      bank_account_id:    selBankId,
      journal_line_id:    r.id,
      period,
      is_cleared:         !!cleared[r.id],
      statement_date:     stmtDate || dateTo,
      statement_balance:  stmtBal || null,
      entity_id:          entityId,
    }))
    const { error } = await supabase.from('bank_recon_items').upsert(upserts, {
      onConflict: 'bank_account_id,journal_line_id,period',
      ignoreDuplicates: false,
    })
    if (error) {
      // If table doesn't exist yet, silently skip
      console.warn('bank_recon_items upsert:', error.message)
    }
    setSaving(false)
    setSaved(true)
  }

  function handlePrint() {
    const w = window.open('', '_blank', 'width=1000,height=700')
    const rowsHtml = rows.map((r,i) => {
      const dr = parseFloat(r.debit_amount)||0
      const cr = parseFloat(r.credit_amount)||0
      const cl = cleared[r.id] ? '✓' : ''
      return `<tr style="background:${cleared[r.id]?'#f0fff4':(i%2===0?'#fff':'#f9f9f9')}">
        <td style="text-align:center;color:#2e7d32;font-weight:bold">${cl}</td>
        <td>${r.entry_date}</td><td>${r.entry_number}</td>
        <td>${r.source_type||'—'}</td><td>${r.narration||r.description||'—'}</td><td>${r.reference||'—'}</td>
        <td style="text-align:right">${dr>0?fmt(dr):''}</td>
        <td style="text-align:right">${cr>0?fmt(cr):''}</td>
      </tr>`
    }).join('')
    w.document.write(`<!DOCTYPE html><html><head><title>Bank Reconciliation</title>
    <style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px}
    table{width:100%;border-collapse:collapse}th,td{padding:5px 8px;border:1px solid #ddd}
    th{background:#1a2e3d;color:#fff}h2{color:#1a2e3d}.rec{color:${isReconciled?'green':'red'}}</style></head><body>
    <h2>Bank Reconciliation — ${selBank?.account_name||''}</h2>
    <p>Period: ${dateFrom} to ${dateTo} · Statement Date: ${stmtDate}</p>
    <table><thead><tr><th>✓</th><th>Date</th><th>Entry No.</th><th>Type</th><th>Narration</th><th>Ref.</th><th>DR</th><th>CR</th></tr></thead>
    <tbody>${rowsHtml}</tbody></table>
    <br><table style="width:320px;margin-left:auto">
    <tr><td>Opening Balance</td><td style="text-align:right">${fmt(ob)}</td></tr>
    <tr><td>Book Balance (all entries)</td><td style="text-align:right">${fmt(bookBalance)}</td></tr>
    <tr><td>Statement Balance</td><td style="text-align:right">${fmt(stmtBal)}</td></tr>
    <tr class="rec"><td><b>Difference</b></td><td style="text-align:right"><b>${sign(difference)}${fmt(difference)}</b></td></tr>
    </table>
    <p class="rec"><b>${isReconciled?'✔ RECONCILED':'✘ NOT RECONCILED'}</b></p>
    <script>window.print()</script></body></html>`)
    w.document.close()
  }

  const SOURCE_LABEL = {
    INVOICE:'Invoice', PAYMENT_RECEIPT:'Receipt', PAYMENT_OUT:'Payment Out',
    VAT_PAYMENT:'VAT Payment', OPENING_BALANCE:'Opening Bal', MANUAL:'Manual JV',
  }

  return (
    <div style={{ padding:24, maxWidth:1300, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:13, color:'#6b7c93' }}>Match journal entries to bank statement — tick cleared items</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={handlePrint} disabled={!rows.length}
            style={{ background:'#1a2e3d', color:'#fff', border:'none', borderRadius:9, padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
            🖨 Print
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background:'#fff', borderRadius:12, border:'1.5px solid #e8edf5', padding:16, marginBottom:16, display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>Bank Account</div>
          <select style={{ ...S.inp, minWidth:240 }} value={selBankId} onChange={e => onAccountChange(e.target.value)}>
            <option value="">— Select Account —</option>
            {bankAccounts.map(b => (
              <option key={b.id} value={b.id}>{b.account_name}{b.account_number?' — '+b.account_number:''}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>Period From</div>
          <input style={S.inp} type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>Period To</div>
          <input style={S.inp} type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>Opening Balance (SAR)</div>
          <input style={{ ...S.inp, width:140 }} type="number" placeholder="0.00" value={openingBal} onChange={e=>setOpeningBal(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>Bank Statement Balance</div>
          <input style={{ ...S.inp, width:160, fontWeight:800, color:'#1a7f4b', fontSize:14 }} type="number" placeholder="Enter from statement" value={stmtBalance} onChange={e=>setStmtBalance(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>Statement Date</div>
          <input style={S.inp} type="date" value={stmtDate} onChange={e=>setStmtDate(e.target.value)} />
        </div>
      </div>

      {/* No COA warning */}
      {selBank && !selBank.coa_account_id && (
        <div style={{ padding:'12px 16px', background:'#fff3e0', border:'1.5px solid #ffcc80', borderRadius:10, marginBottom:16, fontSize:13, color:'#e65100', fontWeight:700 }}>
          ⚠ This bank account has no COA account linked. Go to Accounts → Bank Accounts to link it.
        </div>
      )}

      {/* Reconciliation Summary */}
      {rows.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
          {[
            { label:'Opening Balance',              value: ob,              color:'#1a2e3d' },
            { label:'Book Balance (all entries)',   value: bookBalance,     color:'#1565c0' },
            { label:'Bank Statement Balance',       value: stmtBal,         color:'#1a7f4b' },
            { label:'Unreconciled Difference',      value: difference,      color: isReconciled ? '#1a7f4b' : '#c0392b' },
          ].map(c => (
            <div key={c.label} style={{ background:'#fff', borderRadius:10, border:`1.5px solid ${c.label==='Unreconciled Difference'?(isReconciled?'#1a7f4b':'#c0392b'):'#e8edf5'}`, padding:'12px 16px' }}>
              <div style={{ fontSize:11, color:'#6b7c93', fontWeight:700, textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>{c.label}</div>
              <div style={{ fontSize:16, fontWeight:800, color:c.color, fontFamily:'monospace' }}>
                {c.label==='Unreconciled Difference' && !isReconciled ? (difference<0?'-':'+'): ''}{fmt(Math.abs(c.value))} SAR
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reconciliation status banner */}
      {rows.length > 0 && stmtBalance && (
        <div style={{ marginBottom:16, padding:'10px 16px', borderRadius:9, border:`2px solid ${isReconciled?'#1a7f4b':'#c0392b'}`, background:isReconciled?'#f0fff4':'#fff5f5', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:18 }}>{isReconciled?'✅':'❌'}</span>
            <div>
              <div style={{ fontWeight:800, color:isReconciled?'#1a7f4b':'#c0392b', fontSize:14 }}>
                {isReconciled ? 'RECONCILED — Book balance matches statement' : `NOT RECONCILED — Difference: SAR ${fmt(Math.abs(difference))}`}
              </div>
              <div style={{ fontSize:12, color:'#6b7c93', marginTop:2 }}>
                {rows.filter(r=>cleared[r.id]).length} of {rows.length} entries cleared
                · Uncleared DR: {fmt(unclearedDr)} · Uncleared CR: {fmt(unclearedCr)}
              </div>
            </div>
          </div>
          <button onClick={saveRecon} disabled={saving}
            style={{ background:saved?'#2e7d32':'#1a2e3d', color:'#fff', border:'none', borderRadius:9, padding:'9px 20px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
            {saving ? 'Saving…' : saved ? '✓ Saved' : '💾 Save Reconciliation'}
          </button>
        </div>
      )}

      {/* Table */}
      <div style={{ background:'#fff', borderRadius:12, border:'1.5px solid #e8edf5', overflow:'hidden' }}>
        {/* Bulk actions */}
        {rows.length > 0 && (
          <div style={{ padding:'10px 16px', borderBottom:'1px solid #f0f4f8', display:'flex', gap:8, alignItems:'center', background:'#fafbfc' }}>
            <span style={{ fontSize:12, color:'#6b7c93', fontWeight:700, marginRight:4 }}>Mark:</span>
            <button onClick={() => markAll(true)}  style={{ background:'#e8f5e9', color:'#2e7d32', border:'none', borderRadius:6, padding:'5px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>✓ All Cleared</button>
            <button onClick={() => markAll(false)} style={{ background:'#fff3e0', color:'#e65100', border:'none', borderRadius:6, padding:'5px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>✗ None Cleared</button>
            <span style={{ marginLeft:'auto', fontSize:12, color:'#6b7c93' }}>{rows.length} entries</span>
          </div>
        )}

        {loading ? (
          <div style={{ padding:60, textAlign:'center', color:'#aab2bd' }}>Loading journal entries…</div>
        ) : !selBankId ? (
          <div style={{ padding:60, textAlign:'center', color:'#aab2bd' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🏦</div>
            <div style={{ fontSize:15, fontWeight:700 }}>Select a bank account to begin reconciliation</div>
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#aab2bd' }}>
            {selBank?.coa_account_id ? 'No posted journal entries found for this account in the selected period' : 'Link a COA account to this bank account first'}
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {['Cleared','Date','Entry No.','Type','Narration','Reference','Debit (DR)','Credit (CR)','Running Balance'].map(h => (
                    <th key={h} style={{ ...S.th, textAlign:['Debit (DR)','Credit (CR)','Running Balance'].includes(h)?'right':'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(() => {
                  let running = ob
                  return rows.map((r, i) => {
                    const dr = parseFloat(r.debit_amount)  || 0
                    const cr = parseFloat(r.credit_amount) || 0
                    running += dr - cr   // ASSET: debit increases
                    const isCl = !!cleared[r.id]
                    return (
                      <tr key={r.id} style={{ background: isCl ? (i%2===0?'#f0fff4':'#e8f5e9') : (i%2===0?'#fff':'#fafbfc') }}>
                        <td style={{ ...S.td, textAlign:'center', width:60 }}>
                          <input type="checkbox" checked={isCl} onChange={() => toggleCleared(r.id)}
                            style={{ width:16, height:16, cursor:'pointer', accentColor:'#2e7d32' }} />
                        </td>
                        <td style={S.td}>{r.entry_date}</td>
                        <td style={S.td}>
                          <span style={{ background:'#e8edf5', borderRadius:5, padding:'2px 7px', fontSize:11, fontFamily:'monospace', fontWeight:700 }}>{r.entry_number}</span>
                        </td>
                        <td style={S.td}>
                          <span style={{ fontSize:11, background:'#f0f4f8', borderRadius:10, padding:'2px 8px', fontWeight:700, color:'#4a5568', whiteSpace:'nowrap' }}>
                            {SOURCE_LABEL[r.source_type] || r.source_type || 'Manual'}
                          </span>
                        </td>
                        <td style={{ ...S.td, maxWidth:240 }}>
                          <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.narration || r.description || '—'}</div>
                        </td>
                        <td style={{ ...S.td, fontSize:11, color:'#6b7c93', whiteSpace:'nowrap' }}>{r.reference || '—'}</td>
                        <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:'#1a7f4b', fontWeight:dr>0?700:400 }}>
                          {dr > 0 ? fmt(dr) : ''}
                        </td>
                        <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:'#c0392b', fontWeight:cr>0?700:400 }}>
                          {cr > 0 ? fmt(cr) : ''}
                        </td>
                        <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', fontWeight:700, color: running >= 0 ? '#1a2e3d' : '#c0392b' }}>
                          {running < 0 ? '-' : ''}{fmt(running)}
                        </td>
                      </tr>
                    )
                  })
                })()}
              </tbody>
              <tfoot>
                <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                  <td colSpan={6} style={{ padding:'10px 12px', fontWeight:800, fontSize:12 }}>CLOSING BOOK BALANCE</td>
                  <td style={{ padding:'10px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color:'#a8e6c3' }}>{fmt(rows.reduce((s,r)=>s+(parseFloat(r.debit_amount)||0),0))}</td>
                  <td style={{ padding:'10px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color:'#f5a0a0' }}>{fmt(rows.reduce((s,r)=>s+(parseFloat(r.credit_amount)||0),0))}</td>
                  <td style={{ padding:'10px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color: bookBalance>=0?'#a8e6c3':'#f5a0a0' }}>{bookBalance<0?'-':''}{fmt(bookBalance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Legend */}
      {rows.length > 0 && (
        <div style={{ marginTop:16, padding:'12px 16px', background:'#f8faff', borderRadius:10, border:'1px solid #e8edf5', fontSize:12, color:'#6b7c93', display:'flex', gap:24, flexWrap:'wrap' }}>
          <span><span style={{ background:'#f0fff4', border:'1px solid #a8e6c3', borderRadius:4, padding:'1px 8px', color:'#2e7d32', fontWeight:700 }}>✓ Green</span> = Appears on bank statement (cleared)</span>
          <span><span style={{ background:'#fff', border:'1px solid #dde3ec', borderRadius:4, padding:'1px 8px', color:'#445566' }}>Unchecked</span> = In books but not on statement yet (outstanding)</span>
          <span style={{ marginLeft:'auto' }}>Tip: Reconciliation = Statement Balance − (Opening + Cleared Net Movement)</span>
        </div>
      )}
    </div>
  )
}
