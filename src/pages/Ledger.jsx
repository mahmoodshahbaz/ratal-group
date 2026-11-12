const L1 = '#B4BA95'
const L2 = '#F5F6EB'
const L3 = '#606D2C'
const PP = "'Poppins', sans-serif"
import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, kpiCardGradient, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
/**
 * Ledger.jsx — General Ledger
 * Shows every posted journal entry line, filterable by account, date range, and source type.
 * Reads from journal_entries + journal_entry_lines + chart_of_accounts.
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const S = {
  th:  { padding:'9px 12px', textAlign:'left', fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:0.4, background:L3, color:'#fff', whiteSpace:'nowrap' },
  td:  { padding:'9px 12px', fontSize:12, color:'#2d3a45', borderBottom:'1px solid #f0f4f8', verticalAlign:'middle' },
  inp: { padding:'8px 11px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:'inherit' },
}

function fmt(n) {
  return new Intl.NumberFormat('en-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0)
}

const SOURCE_LABELS = {
  INVOICE:         'Invoice',
  PAYMENT_RECEIPT: 'Payment Receipt',
  PAYMENT_OUT:     'Payment Out',
  VAT_PAYMENT:     'VAT Payment',
  PAYROLL:         'Payroll',
  MANUAL:          'Manual JV',
  OPENING_BALANCE: 'Opening Balance',
  EXPENSE:         'Expense',
}

export default function Ledger({ entityId }) {
  const [coa, setCoa]           = useState([])
  const [selAccount, setSelAccount] = useState('ALL')
  const [selType, setSelType]   = useState('ALL')
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split('T')[0]
  })
  const [dateTo, setDateTo]     = useState(new Date().toISOString().split('T')[0])
  const [search, setSearch]     = useState('')
  const [rows, setRows]         = useState([])
  const [loading, setLoading]   = useState(false)
  const [totals, setTotals]     = useState({ dr:0, cr:0 })

  // Load COA for account filter dropdown
  useEffect(() => {
    supabase.from('chart_of_accounts').select('id,account_code,account_name,account_type')
      .eq('entity_id', entityId).eq('is_active', true)
      .order('account_code')
      .then(({ data }) => setCoa(data || []))
  }, [entityId])

  const load = useCallback(async () => {
    setLoading(true)

    // 1. Fetch journal entries in date range
    let jeQuery = supabase.from('journal_entries')
      .select('id,entry_number,entry_date,period,narration,reference,source_type,status')
      .eq('entity_id', entityId)
      .eq('status', 'POSTED')
      .gte('entry_date', dateFrom)
      .lte('entry_date', dateTo)
      .order('entry_date').order('created_at')

    if (selType !== 'ALL') jeQuery = jeQuery.eq('source_type', selType)

    const { data: jeData } = await jeQuery
    if (!jeData || jeData.length === 0) {
      setRows([]); setTotals({ dr:0, cr:0 }); setLoading(false); return
    }

    const jeIds  = jeData.map(j => j.id)
    const jeMap  = Object.fromEntries(jeData.map(j => [j.id, j]))

    // 2. Fetch lines (optionally filtered by account)
    let lineQuery = supabase.from('journal_entry_lines')
      .select('id,journal_entry_id,account_id,account_code,account_name,debit_amount,credit_amount,description')
      .in('journal_entry_id', jeIds)

    if (selAccount !== 'ALL') lineQuery = lineQuery.eq('account_id', selAccount)

    const { data: lineData } = await lineQuery
    if (!lineData) { setRows([]); setTotals({ dr:0, cr:0 }); setLoading(false); return }

    // 3. Merge and sort
    const merged = lineData.map(l => ({
      ...l,
      entry_number: jeMap[l.journal_entry_id]?.entry_number || '',
      entry_date:   jeMap[l.journal_entry_id]?.entry_date   || '',
      narration:    jeMap[l.journal_entry_id]?.narration     || '',
      reference:    jeMap[l.journal_entry_id]?.reference     || '',
      source_type:  jeMap[l.journal_entry_id]?.source_type   || '',
    })).sort((a,b) =>
      a.entry_date.localeCompare(b.entry_date) ||
      a.entry_number.localeCompare(b.entry_number)
    )

    const totalDr = merged.reduce((s,r) => s + (+r.debit_amount ||0), 0)
    const totalCr = merged.reduce((s,r) => s + (+r.credit_amount||0), 0)

    setRows(merged)
    setTotals({ dr: totalDr, cr: totalCr })
    setLoading(false)
  }, [entityId, dateFrom, dateTo, selAccount, selType])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      r.entry_number?.toLowerCase().includes(s) ||
      r.account_code?.toLowerCase().includes(s) ||
      r.account_name?.toLowerCase().includes(s) ||
      r.narration?.toLowerCase().includes(s) ||
      r.reference?.toLowerCase().includes(s) ||
      r.description?.toLowerCase().includes(s)
    )
  })

  // Group COA by type for the dropdown
  const coaGroups = {}
  coa.forEach(a => {
    if (!coaGroups[a.account_type]) coaGroups[a.account_type] = []
    coaGroups[a.account_type].push(a)
  })

  function handlePrint() {
    const w = window.open('', '_blank', 'width=1000,height=700')
    const rowsHtml = filtered.map((r,i) => `
      <tr style="background:${i%2===0?'#fff':'#f9f9f9'}">
        <td>${r.entry_date}</td>
        <td>${r.entry_number}</td>
        <td>${SOURCE_LABELS[r.source_type]||r.source_type||'—'}</td>
        <td>${r.account_code} — ${r.account_name}</td>
        <td>${r.narration||r.description||'—'}</td>
        <td style="text-align:right">${+r.debit_amount >0 ? fmt(r.debit_amount) :''}</td>
        <td style="text-align:right">${+r.credit_amount>0 ? fmt(r.credit_amount):''}</td>
      </tr>`).join('')
    w.document.write(`<!DOCTYPE html><html><head><title>General Ledger</title>
    <style>body{font-family:Arial,sans-serif;font-size:11px;padding:20px}
    table{width:100%;border-collapse:collapse}th,td{padding:6px 8px;border:1px solid #ddd}
    th{background:#1a2e3d;color:#fff}h2{color:#1a2e3d}</style></head><body>
    <h2>General Ledger</h2>
    <p>Period: ${dateFrom} to ${dateTo}</p>
    <table><thead><tr><th>Date</th><th>Entry No.</th><th>Type</th><th>Account</th><th>Narration</th><th>Debit (DR)</th><th>Credit (CR)</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot><tr style="font-weight:bold;background:#f0f4f8"><td colspan="5">TOTAL</td>
    <td style="text-align:right">${fmt(totals.dr)}</td><td style="text-align:right">${fmt(totals.cr)}</td></tr></tfoot>
    </table><script>window.print()</script></body></html>`)
    w.document.close()
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden', background:L2, fontFamily:PP }}>
      {/* UPPER ZONE */}
      <div style={{ flexShrink:0, background:L2, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', zIndex:10 }}>
        <div style={{ padding:'6px 28px 0' }}>
          <div style={{ background:L1, padding:'8px 16px', borderRadius:'6px 6px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#fff' }}>📒 General Ledger</div>
              <div style={{ fontSize:10, color:'#fff', opacity:0.8 }}>All posted journal entry lines · {filtered.length} entries</div>
            </div>
            <button onClick={handlePrint} disabled={!rows.length} style={{ background:'rgba(255,255,255,0.18)', color:'#fff', border:'1.5px solid rgba(255,255,255,0.4)', borderRadius:8, padding:'7px 16px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
              🖨 Print
            </button>
          </div>
        </div>
        {/* KPI Cards */}
        <div style={{ display:'flex', gap:10, padding:'10px 28px 12px' }}>
          {[
            { label:'Total Debits',   value:`SAR ${fmt(totals.dr)}`,           sub:'Debit entries' },
            { label:'Total Credits',  value:`SAR ${fmt(totals.cr)}`,           sub:'Credit entries' },
            { label:'Net (DR − CR)', value:`SAR ${fmt(totals.dr-totals.cr)}`, sub:'Balance' },
          ].map((k,i)=>{
            const g = kpiCardGradient(i,L1,L2,L3)
            return (
              <div key={k.label} style={{ ...g, width:160, height:62, borderRadius:10, padding:'0 14px', flexShrink:0, boxShadow:'0 2px 8px rgba(0,0,0,0.10)', display:'flex', flexDirection:'column', justifyContent:'center' }}>
                <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', opacity:0.75, marginBottom:2 }}>{k.label}</div>
                <div style={{ fontSize:13, fontWeight:800, lineHeight:1 }}>{k.value}</div>
                <div style={{ fontSize:9, opacity:0.7, marginTop:2 }}>{k.sub}</div>
              </div>
            )
          })}
        </div>
        {/* Filter Bar */}
        <div style={{ padding:'6px 28px 8px', background:L2 }}>
          <div style={{ background:'#fff', borderRadius:8, border:'1.5px solid #e8edf5', padding:'10px 14px', display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>Account</div>
              <select style={{ ...S.inp, minWidth:260 }} value={selAccount} onChange={e=>setSelAccount(e.target.value)}>
                <option value="ALL">— All Accounts —</option>
                {Object.entries(coaGroups).map(([type, accounts]) => (
                  <optgroup key={type} label={type}>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.account_code} — {a.account_name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>Source Type</div>
              <select style={S.inp} value={selType} onChange={e=>setSelType(e.target.value)}>
                <option value="ALL">All Types</option>
                {Object.entries(SOURCE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>From</div>
              <input style={S.inp} type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>To</div>
              <input style={S.inp} type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} />
            </div>
            <div style={{ flex:1, minWidth:200 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.4, marginBottom:4 }}>Search</div>
              <input style={{ ...S.inp, width:'100%', boxSizing:'border-box' }} placeholder="Entry #, account, narration…" value={search} onChange={e=>setSearch(e.target.value)} />
            </div>
          </div>
        </div>
        {/* Column Header Row */}
        <div style={{ padding:'0 28px' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Date','Entry No.','Type','Account','Narration / Description','Ref.','Debit (DR)','Credit (CR)'].map(h=>(
                  <th key={h} style={{ ...S.th, background:L3, textAlign:['Debit (DR)','Credit (CR)'].includes(h)?'right':'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
      </div>
      {/* SCROLL ZONE */}
      <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:'0 28px 22px' }}>
        <div style={{ background:'#fff', borderRadius:'0 0 8px 8px', boxShadow:'0 2px 8px rgba(0,0,0,0.08)' }}>
          {loading ? (
            <div style={{ padding:60, textAlign:'center', color:'#aab2bd' }}>Loading ledger…</div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>
                      No journal entries in this period{selAccount!=='ALL'?' for the selected account':''}
                    </td></tr>
                  )}
                  {filtered.map((r, i) => (
                    <tr key={r.id} style={{ background: i%2===0?'#fff':'#fafbfc' }}>
                      <td style={S.td}>{r.entry_date}</td>
                      <td style={S.td}>
                        <span style={{ background:'#e8edf5', borderRadius:5, padding:'2px 7px', fontSize:11, fontFamily:'monospace', fontWeight:700 }}>{r.entry_number}</span>
                      </td>
                      <td style={S.td}>
                        <span style={{ fontSize:11, background:'#f0f4f8', borderRadius:10, padding:'2px 8px', fontWeight:700, color:'#4a5568', whiteSpace:'nowrap' }}>
                          {SOURCE_LABELS[r.source_type]||r.source_type||'Manual'}
                        </span>
                      </td>
                      <td style={S.td}>
                        <span style={{ fontSize:11, color:'#aab2bd', fontFamily:'monospace', marginRight:6 }}>{r.account_code}</span>
                        <span style={{ fontWeight:600 }}>{r.account_name}</span>
                      </td>
                      <td style={{ ...S.td, maxWidth:260 }}>
                        <div>{r.narration||'—'}</div>
                        {r.description && r.description !== r.narration && (
                          <div style={{ fontSize:11, color:'#6b7c93', marginTop:2 }}>{r.description}</div>
                        )}
                      </td>
                      <td style={{ ...S.td, fontSize:11, color:'#6b7c93', whiteSpace:'nowrap' }}>{r.reference||'—'}</td>
                      <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:'#1a7f4b', fontWeight:+r.debit_amount>0?700:400 }}>
                        {+r.debit_amount  > 0 ? fmt(r.debit_amount)  : ''}
                      </td>
                      <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:'#c0392b', fontWeight:+r.credit_amount>0?700:400 }}>
                        {+r.credit_amount > 0 ? fmt(r.credit_amount) : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {filtered.length > 0 && (
                  <tfoot>
                    <tr style={{ background:L3, color:'#fff' }}>
                      <td colSpan={6} style={{ padding:'10px 12px', fontWeight:800, fontSize:12 }}>TOTAL ({filtered.length} entries)</td>
                      <td style={{ padding:'10px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color:'#a8e6c3' }}>{fmt(filtered.reduce((s,r)=>s+(+r.debit_amount||0),0))}</td>
                      <td style={{ padding:'10px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color:'#f5a0a0' }}>{fmt(filtered.reduce((s,r)=>s+(+r.credit_amount||0),0))}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
