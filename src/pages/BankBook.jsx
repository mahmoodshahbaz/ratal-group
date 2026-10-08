import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.Accounting
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  th:  { padding:'9px 10px', textAlign:'left', fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:0.4, background:MC, color:'#fff', borderBottom:'2px solid #e8edf2', whiteSpace:'nowrap' },
  td:  { padding:'9px 10px', fontSize:12, color:'#2d3a45', borderBottom:'1px solid #f0f4f8', verticalAlign:'middle' },
  inp: { padding:'8px 11px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:'inherit' },
}

function fmt(n) {
  return new Intl.NumberFormat('en-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0)
}

function fmtSigned(n) {
  if (!n) return '—'
  return new Intl.NumberFormat('en-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Math.abs(n))
}

// ─── Source type labels ───────────────────────────────────────────────────────
const SOURCE_LABELS = {
  INVOICE:          'Invoice',
  PAYMENT_RECEIPT:  'Payment Receipt',
  PAYMENT_OUT:      'Payment Out',
  VAT_PAYMENT:      'VAT Payment',
  PAYROLL:          'Payroll',
  MANUAL:           'Manual JV',
  OPENING_BALANCE:  'Opening Balance',
  EXPENSE:          'Expense',
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BankBook({ entityId }) {
  // State
  const [accounts, setAccounts]   = useState([])
  const [selAccId, setSelAccId]   = useState('')
  const [selAcc, setSelAcc]       = useState(null)
  const [txns, setTxns]           = useState([])   // journal_entry_lines + header joined
  const [loading, setLoading]     = useState(false)
  const [view, setView]           = useState('ledger') // ledger | monthly
  const [dateFrom, setDateFrom]   = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 3); return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo]     = useState(new Date().toISOString().split('T')[0])
  const [search, setSearch]     = useState('')

  // Load bank accounts for this entity
  useEffect(() => {
    async function loadAccounts() {
      const { data } = await supabase.from('bank_accounts').select('*')
        .eq('entity_id', entityId).eq('is_active', true).order('sort_order').order('created_at')
      setAccounts(data || [])
      if (data && data.length > 0) setSelAccId(data[0].id)
    }
    loadAccounts()
  }, [entityId])

  // When account selection changes, update selAcc
  useEffect(() => {
    const acc = accounts.find(a => a.id === selAccId)
    setSelAcc(acc || null)
  }, [selAccId, accounts])

  // Load transactions (journal entry lines for this COA account within date range)
  const loadTxns = useCallback(async () => {
    if (!selAcc) return
    setLoading(true)

    // Get the COA account id for this bank account
    const coaId = selAcc.coa_account_id
    if (!coaId) {
      // No COA linked yet — show empty
      setTxns([])
      setLoading(false)
      return
    }

    // Fetch journal entries in date range for this entity
    const { data: jeData, error: jeErr } = await supabase
      .from('journal_entries')
      .select('id, entry_number, entry_date, period, narration, reference, source_type, source_id, status')
      .eq('entity_id', entityId)
      .eq('status', 'POSTED')
      .gte('entry_date', dateFrom)
      .lte('entry_date', dateTo)
      .order('entry_date')
      .order('created_at')

    if (jeErr || !jeData || jeData.length === 0) {
      setTxns([])
      setLoading(false)
      return
    }

    const jeIds = jeData.map(j => j.id)
    const jeMap = Object.fromEntries(jeData.map(j => [j.id, j]))

    // Fetch lines for this COA account from those journal entries
    const { data: lineData, error: lineErr } = await supabase
      .from('journal_entry_lines')
      .select('id, journal_entry_id, debit_amount, credit_amount, description')
      .eq('account_id', coaId)
      .in('journal_entry_id', jeIds)

    if (lineErr || !lineData) {
      setTxns([])
      setLoading(false)
      return
    }

    // Merge line with header
    const merged = lineData.map(line => ({
      ...line,
      ...jeMap[line.journal_entry_id],
      line_id: line.id,
    })).sort((a,b) => {
      const d = a.entry_date.localeCompare(b.entry_date)
      return d !== 0 ? d : a.created_at?.localeCompare(b.created_at||'') || 0
    })

    setTxns(merged)
    setLoading(false)
  }, [selAcc, entityId, dateFrom, dateTo])

  useEffect(() => { loadTxns() }, [loadTxns])

  // ── Compute running balance ──────────────────────────────────────────────
  // Opening balance = bank account opening_balance (ASSET: debit increases balance)
  const openingBal = selAcc ? (+selAcc.opening_balance || 0) : 0

  const filteredTxns = txns.filter(t => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      t.entry_number?.toLowerCase().includes(s) ||
      t.narration?.toLowerCase().includes(s) ||
      t.reference?.toLowerCase().includes(s) ||
      t.description?.toLowerCase().includes(s) ||
      SOURCE_LABELS[t.source_type]?.toLowerCase().includes(s)
    )
  })

  // Build rows with running balance
  let runBal = openingBal
  const rows = filteredTxns.map(t => {
    const dr = +t.debit_amount  || 0
    const cr = +t.credit_amount || 0
    runBal += dr - cr   // ASSET: debit increases, credit decreases
    return { ...t, dr, cr, balance: runBal }
  })

  const closingBal = rows.length > 0 ? rows[rows.length-1].balance : openingBal
  const totalDr    = rows.reduce((s,r) => s + r.dr, 0)
  const totalCr    = rows.reduce((s,r) => s + r.cr, 0)

  // ── Monthly summary view ─────────────────────────────────────────────────
  const monthlyMap = {}
  txns.forEach(t => {
    const m = t.period || t.entry_date?.slice(0,7) || '—'
    if (!monthlyMap[m]) monthlyMap[m] = { period:m, dr:0, cr:0, count:0 }
    monthlyMap[m].dr    += +t.debit_amount  || 0
    monthlyMap[m].cr    += +t.credit_amount || 0
    monthlyMap[m].count += 1
  })
  const monthly = Object.values(monthlyMap).sort((a,b) => a.period.localeCompare(b.period))

  // ── Source type summary ──────────────────────────────────────────────────
  const sourceMap = {}
  txns.forEach(t => {
    const k = t.source_type || 'MANUAL'
    if (!sourceMap[k]) sourceMap[k] = { type:k, dr:0, cr:0, count:0 }
    sourceMap[k].dr    += +t.debit_amount  || 0
    sourceMap[k].cr    += +t.credit_amount || 0
    sourceMap[k].count += 1
  })
  const sourceSummary = Object.values(sourceMap).sort((a,b) => (b.dr+b.cr)-(a.dr+a.cr))

  // ── Print handler ────────────────────────────────────────────────────────
  function handlePrint() {
    const w = window.open('', '_blank', 'width=900,height=700')
    const rowsHtml = rows.map((r,i) => `
      <tr style="background:${i%2===0?'#fff':'#f9f9f9'}">
        <td>${r.entry_date}</td>
        <td>${r.entry_number}</td>
        <td>${SOURCE_LABELS[r.source_type]||r.source_type||'—'}</td>
        <td>${r.narration||r.description||'—'}</td>
        <td style="text-align:right">${r.dr > 0 ? fmt(r.dr) : ''}</td>
        <td style="text-align:right">${r.cr > 0 ? fmt(r.cr) : ''}</td>
        <td style="text-align:right;font-weight:bold;color:${r.balance>=0?'#1a7f4b':'#c0392b'}">${fmt(r.balance)}</td>
      </tr>`).join('')

    w.document.write(`<!DOCTYPE html><html><head><title>Bank Book – ${selAcc?.account_name}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px}
    table{width:100%;border-collapse:collapse}th,td{padding:7px 9px;border:1px solid #ddd}
    th{background:#1a2e3d;color:#fff}h2{color:#1a2e3d}</style></head><body>
    <h2>Bank Book — ${selAcc?.account_name}</h2>
    <p>Period: ${dateFrom} to ${dateTo} &nbsp;|&nbsp; Opening Balance: SAR ${fmt(openingBal)}</p>
    <table><thead><tr><th>Date</th><th>Entry No.</th><th>Type</th><th>Narration</th>
    <th>Debit (DR)</th><th>Credit (CR)</th><th>Balance</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot><tr style="font-weight:bold;background:#f0f4f8">
    <td colspan="4">TOTAL</td>
    <td style="text-align:right">${fmt(totalDr)}</td>
    <td style="text-align:right">${fmt(totalCr)}</td>
    <td style="text-align:right">SAR ${fmt(closingBal)}</td>
    </tr></tfoot></table>
    <script>window.print()</script></body></html>`)
    w.document.close()
  }

  if (accounts.length === 0) {
    return (
      <div style={{ padding:40, textAlign:'center', color:'#aab2bd' }}>
        No bank accounts configured. Go to <strong>Accounting → Accounts</strong> to add your bank accounts first.
      </div>
    )
  }

  return (
    <div style={{ padding:24, maxWidth:1200, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:13, color:'#6b7c93' }}>Running ledger per bank / cash account</div>
        </div>
        <button onClick={handlePrint} style={{ background:'#1a2e3d', color:'#fff', border:'none', borderRadius:9, padding:'9px 20px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
          🖨 Print
        </button>
      </div>

      {/* Controls */}
      <div style={{ background:'#fff', borderRadius:12, border:'1.5px solid #e8edf5', padding:16, marginBottom:20, display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
        {/* Account selector */}
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>Account</div>
          <select style={{ ...S.inp, minWidth:220 }} value={selAccId} onChange={e=>setSelAccId(e.target.value)}>
            {accounts.map(a=>(
              <option key={a.id} value={a.id}>{a.account_name}</option>
            ))}
          </select>
        </div>
        {/* Date range */}
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>From</div>
          <input style={S.inp} type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>To</div>
          <input style={S.inp} type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
        </div>
        {/* Search */}
        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>Search</div>
          <input style={{ ...S.inp, width:'100%', boxSizing:'border-box' }} placeholder="Narration, reference, type…" value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        {/* View toggle */}
        <div style={{ display:'flex', gap:4 }}>
          {[{k:'ledger',label:'Ledger'},{k:'monthly',label:'Monthly'},{k:'source',label:'By Type'}].map(v=>(
            <button key={v.k} onClick={()=>setView(v.k)} style={{
              padding:'8px 14px', border:'1.5px solid #dde3ec', borderRadius:8,
              background: view===v.k ? '#1a2e3d' : '#fff',
              color: view===v.k ? '#fff' : '#6b7c93',
              cursor:'pointer', fontSize:12, fontWeight:700
            }}>{v.label}</button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Opening Balance', value: fmt(openingBal), color:'#1a2e3d' },
          { label:'Total Debits (IN)', value: fmt(totalDr), color:'#1a7f4b' },
          { label:'Total Credits (OUT)', value: fmt(totalCr), color:'#c0392b' },
          { label:'Closing Balance', value: fmt(closingBal), color: closingBal >= 0 ? '#1a7f4b' : '#c0392b' },
        ].map(c=>(
          <div key={c.label} style={{ background:'#fff', borderRadius:10, border:'1.5px solid #e8edf5', padding:'14px 18px' }}>
            <div style={{ fontSize:11, color:'#6b7c93', fontWeight:700, textTransform:'uppercase', letterSpacing:0.4, marginBottom:6 }}>{c.label}</div>
            <div style={{ fontSize:18, fontWeight:800, color:c.color, fontFamily:'monospace' }}>SAR {c.value}</div>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div style={{ background:'#fff', borderRadius:12, border:'1.5px solid #e8edf5', overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:60, textAlign:'center', color:'#aab2bd' }}>Loading transactions…</div>
        ) : (

          // ── LEDGER VIEW ──────────────────────────────────────────────────
          view === 'ledger' ? (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    {['Date','Entry No.','Type','Narration / Description','Ref.','Debit (DR)','Credit (CR)','Balance'].map(h=>(
                      <th key={h} style={{ ...S.th, textAlign: ['Debit (DR)','Credit (CR)','Balance'].includes(h) ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Opening balance row */}
                  <tr style={{ background:'#f0f4f8' }}>
                    <td style={S.td} colSpan={5}><em style={{ color:'#6b7c93' }}>Opening Balance as at {dateFrom}</em></td>
                    <td style={{ ...S.td, textAlign:'right' }}></td>
                    <td style={{ ...S.td, textAlign:'right' }}></td>
                    <td style={{ ...S.td, textAlign:'right', fontWeight:800, fontFamily:'monospace' }}>{fmt(openingBal)}</td>
                  </tr>

                  {rows.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>
                      No posted journal entries for this account in the selected period
                    </td></tr>
                  )}

                  {rows.map((r, i) => (
                    <tr key={r.line_id} style={{ background: i%2===0?'#fff':'#fafbfc' }}>
                      <td style={S.td}>{r.entry_date}</td>
                      <td style={{ ...S.td }}>
                        <span style={{ background:'#e8edf5', borderRadius:5, padding:'2px 7px', fontSize:11, fontFamily:'monospace', fontWeight:700 }}>{r.entry_number}</span>
                      </td>
                      <td style={S.td}>
                        <span style={{ fontSize:11, background:'#f0f4f8', borderRadius:10, padding:'2px 8px', fontWeight:700, color:'#4a5568' }}>
                          {SOURCE_LABELS[r.source_type] || r.source_type || 'Manual'}
                        </span>
                      </td>
                      <td style={{ ...S.td, maxWidth:280 }}>
                        <div style={{ fontWeight:600 }}>{r.narration || r.description || '—'}</div>
                        {r.description && r.narration && r.description !== r.narration && (
                          <div style={{ fontSize:11, color:'#6b7c93', marginTop:2 }}>{r.description}</div>
                        )}
                      </td>
                      <td style={{ ...S.td, fontSize:11, color:'#6b7c93' }}>{r.reference||'—'}</td>
                      <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:'#1a7f4b', fontWeight: r.dr>0?700:400 }}>
                        {r.dr > 0 ? fmtSigned(r.dr) : ''}
                      </td>
                      <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:'#c0392b', fontWeight: r.cr>0?700:400 }}>
                        {r.cr > 0 ? fmtSigned(r.cr) : ''}
                      </td>
                      <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', fontWeight:700,
                        color: r.balance >= 0 ? '#1a2e3d' : '#c0392b',
                        background: r.balance < 0 ? '#fdecea' : 'transparent'
                      }}>
                        {fmt(r.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>

                {rows.length > 0 && (
                  <tfoot>
                    <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                      <td colSpan={5} style={{ padding:'10px 10px', fontWeight:800, fontSize:12 }}>CLOSING BALANCE</td>
                      <td style={{ padding:'10px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color:'#a8e6c3' }}>{fmt(totalDr)}</td>
                      <td style={{ padding:'10px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color:'#f5a0a0' }}>{fmt(totalCr)}</td>
                      <td style={{ padding:'10px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:14, color: closingBal>=0?'#a8e6c3':'#f5a0a0' }}>
                        SAR {fmt(closingBal)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

          // ── MONTHLY VIEW ─────────────────────────────────────────────────
          ) : view === 'monthly' ? (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    {['Period','Transactions','Total Debits (IN)','Total Credits (OUT)','Net Movement'].map(h=>(
                      <th key={h} style={{ ...S.th, textAlign:h==='Period'||h==='Transactions'?'left':'right' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthly.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No data in this period</td></tr>
                  )}
                  {monthly.map(m => {
                    const net = m.dr - m.cr
                    return (
                      <tr key={m.period}>
                        <td style={{ ...S.td, fontWeight:700 }}>{m.period}</td>
                        <td style={S.td}>{m.count}</td>
                        <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:'#1a7f4b', fontWeight:600 }}>{fmt(m.dr)}</td>
                        <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:'#c0392b', fontWeight:600 }}>{fmt(m.cr)}</td>
                        <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', fontWeight:700, color: net>=0?'#1a7f4b':'#c0392b' }}>
                          {net>=0?'+':''}{fmt(net)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {monthly.length > 0 && (
                  <tfoot>
                    <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                      <td style={{ padding:'10px', fontWeight:800 }}>TOTAL</td>
                      <td style={{ padding:'10px' }}>{txns.length}</td>
                      <td style={{ padding:'10px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color:'#a8e6c3' }}>{fmt(totalDr)}</td>
                      <td style={{ padding:'10px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color:'#f5a0a0' }}>{fmt(totalCr)}</td>
                      <td style={{ padding:'10px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color: (totalDr-totalCr)>=0?'#a8e6c3':'#f5a0a0' }}>
                        {(totalDr-totalCr)>=0?'+':''}{fmt(totalDr-totalCr)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

          // ── SOURCE TYPE VIEW ──────────────────────────────────────────────
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    {['Transaction Type','Count','Total Debits (IN)','Total Credits (OUT)','Net'].map(h=>(
                      <th key={h} style={{ ...S.th, textAlign:h==='Transaction Type'||h==='Count'?'left':'right' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sourceSummary.length === 0 && (
                    <tr><td colSpan={5} style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No data in this period</td></tr>
                  )}
                  {sourceSummary.map(s => {
                    const net = s.dr - s.cr
                    return (
                      <tr key={s.type}>
                        <td style={S.td}>
                          <span style={{ fontWeight:700 }}>{SOURCE_LABELS[s.type]||s.type}</span>
                        </td>
                        <td style={S.td}>{s.count}</td>
                        <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:'#1a7f4b', fontWeight:600 }}>{s.dr>0?fmt(s.dr):'—'}</td>
                        <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:'#c0392b', fontWeight:600 }}>{s.cr>0?fmt(s.cr):'—'}</td>
                        <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', fontWeight:700, color: net>=0?'#1a7f4b':'#c0392b' }}>
                          {net>=0?'+':''}{fmt(net)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Footer note */}
      {!selAcc?.coa_account_id && selAcc && (
        <div style={{ marginTop:12, padding:'10px 14px', background:'#fff8e1', borderRadius:8, fontSize:12, color:'#856404' }}>
          ⚠️ This bank account is not yet linked to a Chart of Accounts entry. Transactions will appear once the accounting schema is connected.
        </div>
      )}
    </div>
  )
}
