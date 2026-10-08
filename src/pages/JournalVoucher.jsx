import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// Journal Voucher (JV) — Phase 13
//
// Tab 1 — New JV    : multi-line DR/CR entry, balance check, post to ledger_entries
// Tab 2 — JV History: list posted JVs, view lines, reverse, print
//
// Voucher types:
//   JV  — General Journal Voucher
//   ACR — Accrual
//   RCL — Reclassification
//   OPB — Opening Balance
//   ADJ — Adjustment / Correction
//
// All go to ledger_entries (the existing flat GL table)
// ═══════════════════════════════════════════════════════════════════

const VOUCHER_TYPES = [
  { code:'JV',  label:'General Journal Voucher' },
  { code:'ACR', label:'Accrual' },
  { code:'RCL', label:'Reclassification' },
  { code:'OPB', label:'Opening Balance' },
  { code:'ADJ', label:'Adjustment / Correction' },
]

const TYPE_COLOR = { JV:'#1565C0', ACR:'#2e7d32', RCL:'#5A32D4', OPB:'#e65100', ADJ:'#c62828' }

const S = {
  card: { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:10 },
  btn:  (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  btnO: (c='#1a2e3d') => ({ background:'transparent', color:c, border:`1.5px solid ${c}`, borderRadius:8, padding:'7px 15px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:  { padding:'7px 9px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', width:'100%', boxSizing:'border-box', background:'#fff' },
  lbl:  { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
}

const fmt  = n => (+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtD = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'
const today = () => new Date().toISOString().slice(0,10)

// ── Next voucher number ──────────────────────────────────────────────────────
async function nextVoucherNo(entityId, type) {
  const year = new Date().getFullYear()
  const prefix = `${type}-${year}-`
  const { data } = await supabase
    .from('ledger_entries')
    .select('voucher_number')
    .eq('entity_id', entityId)
    .eq('voucher_type', type)
    .like('voucher_number', `${prefix}%`)
    .order('voucher_number', { ascending:false })
    .limit(1)
  if (data?.length) {
    const last = parseInt(data[0].voucher_number.replace(prefix,'')) || 0
    return `${prefix}${String(last+1).padStart(4,'0')}`
  }
  return `${prefix}0001`
}

// ── Blank line factory ───────────────────────────────────────────────────────
const blankLine = () => ({ id: Math.random(), account_code:'', account_name:'', description:'', debit:'', credit:'' })

// ═══════════════════════════════════════════════════════════════════
// Tab 1 — New JV Entry
// ═══════════════════════════════════════════════════════════════════
function NewJV({ entityId, coa, onPosted }) {
  const [vType,   setVType]   = useState('JV')
  const [vDate,   setVDate]   = useState(today())
  const [vNote,   setVNote]   = useState('')
  const [vNo,     setVNo]     = useState('')
  const [lines,   setLines]   = useState([blankLine(), blankLine()])
  const [posting, setPosting] = useState(false)
  const [err,     setErr]     = useState('')
  const [success, setSuccess] = useState('')

  // Generate voucher number whenever type changes
  useEffect(() => {
    if (!entityId) return
    nextVoucherNo(entityId, vType).then(setVNo)
  }, [entityId, vType])

  // Build a COA map for fast lookup
  const coaMap = Object.fromEntries(coa.map(a=>[a.account_code, a]))

  function updateLine(id, field, value) {
    setLines(ls => ls.map(l => {
      if (l.id !== id) return l
      const updated = { ...l, [field]: value }
      // Auto-fill account name when code is selected
      if (field === 'account_code') {
        const acct = coaMap[value]
        updated.account_name = acct?.account_name || ''
        // If description is empty, set it from account name
        if (!l.description && acct) updated.description = acct.account_name
      }
      // Mutual exclusion: entering debit clears credit, and vice versa
      if (field === 'debit' && value) updated.credit = ''
      if (field === 'credit' && value) updated.debit = ''
      return updated
    }))
  }

  function addLine()    { setLines(ls=>[...ls, blankLine()]) }
  function removeLine(id) { if (lines.length > 2) setLines(ls=>ls.filter(l=>l.id!==id)) }

  function clearAll() {
    setLines([blankLine(), blankLine()])
    setVNote('')
    nextVoucherNo(entityId, vType).then(setVNo)
    setErr(''); setSuccess('')
  }

  // Totals
  const totalDr = lines.reduce((s,l)=>s+(+l.debit||0), 0)
  const totalCr = lines.reduce((s,l)=>s+(+l.credit||0), 0)
  const balanced = Math.abs(totalDr - totalCr) < 0.005 && totalDr > 0

  async function post() {
    setErr(''); setSuccess('')
    // Validate
    const filled = lines.filter(l=>l.account_code && ((+l.debit)||( +l.credit)))
    if (filled.length < 2) { setErr('At least 2 lines with account codes and amounts are required.'); return }
    if (!balanced) { setErr(`Out of balance: DR ${fmt(totalDr)} ≠ CR ${fmt(totalCr)}. Difference: ${fmt(Math.abs(totalDr-totalCr))}`); return }

    setPosting(true)
    const payload = filled.map(l=>({
      entity_id:    entityId,
      entry_date:   vDate,
      voucher_type: vType,
      voucher_number: vNo,
      account_code: l.account_code,
      account_name: l.account_name || coaMap[l.account_code]?.account_name || l.account_code,
      debit:        +l.debit  || 0,
      credit:       +l.credit || 0,
      description:  l.description || vNote || '',
    }))

    const { error } = await supabase.from('ledger_entries').insert(payload)
    setPosting(false)

    if (error) { setErr(error.message); return }

    setSuccess(`✅ ${vNo} posted successfully — ${filled.length} lines, SAR ${fmt(totalDr)}`)
    clearAll()
    onPosted?.()
  }

  // Keyboard shortcut: Enter on amount field adds new line
  function handleAmtKeyDown(e, id, field) {
    if (e.key === 'Enter') {
      const idx = lines.findIndex(l=>l.id===id)
      if (idx === lines.length - 1) addLine()
    }
  }

  return (
    <div>
      {/* Header controls */}
      <div style={{ ...S.card, display:'grid', gridTemplateColumns:'160px 160px 1fr auto', gap:12, alignItems:'end' }}>
        <div>
          <label style={S.lbl}>Voucher Type</label>
          <select style={S.inp} value={vType} onChange={e=>setVType(e.target.value)}>
            {VOUCHER_TYPES.map(t=><option key={t.code} value={t.code}>{t.code} — {t.label}</option>)}
          </select>
        </div>
        <div>
          <label style={S.lbl}>Voucher No.</label>
          <input style={{ ...S.inp, fontFamily:'monospace', fontWeight:700, color: TYPE_COLOR[vType]||'#1a2e3d' }}
            value={vNo} onChange={e=>setVNo(e.target.value)} />
        </div>
        <div>
          <label style={S.lbl}>Narration / Memo</label>
          <input style={S.inp} value={vNote} onChange={e=>setVNote(e.target.value)}
            placeholder="Overall description for this voucher" />
        </div>
        <div>
          <label style={S.lbl}>Date</label>
          <input type="date" style={{ ...S.inp, width:150 }} value={vDate} onChange={e=>setVDate(e.target.value)} />
        </div>
      </div>

      {/* Lines table */}
      <div style={{ ...S.card, padding:0, overflow:'visible' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#1a2e3d', color:'#fff' }}>
              <th style={{ padding:'9px 10px', textAlign:'left', width:32, fontSize:11 }}>#</th>
              <th style={{ padding:'9px 10px', textAlign:'left', width:200, fontSize:11 }}>Account</th>
              <th style={{ padding:'9px 10px', textAlign:'left', fontSize:11 }}>Description</th>
              <th style={{ padding:'9px 10px', textAlign:'right', width:140, fontSize:11 }}>Debit (DR)</th>
              <th style={{ padding:'9px 10px', textAlign:'right', width:140, fontSize:11 }}>Credit (CR)</th>
              <th style={{ padding:'9px 10px', width:36 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l,i)=>(
              <tr key={l.id} style={{ borderBottom:'1px solid #f0f4f8', background:i%2?'#fafafa':'#fff' }}>
                <td style={{ padding:'6px 10px', color:'#aab2bd', textAlign:'center', fontSize:11 }}>{i+1}</td>
                <td style={{ padding:'4px 6px' }}>
                  <select style={{ ...S.inp, borderColor: l.account_code?'#dde3ec':'#ef9a9a' }}
                    value={l.account_code}
                    onChange={e=>updateLine(l.id,'account_code',e.target.value)}>
                    <option value="">— account —</option>
                    {coa.map(a=>(
                      <option key={a.account_code} value={a.account_code}>
                        {a.account_code} {a.account_name}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ padding:'4px 6px' }}>
                  <input style={S.inp} value={l.description}
                    onChange={e=>updateLine(l.id,'description',e.target.value)}
                    placeholder="Line narration" />
                </td>
                <td style={{ padding:'4px 6px' }}>
                  <input type="number" min="0" step="0.01"
                    style={{ ...S.inp, textAlign:'right', fontFamily:'monospace', background:l.debit?'#e8f5e9':'#fff' }}
                    value={l.debit}
                    onChange={e=>updateLine(l.id,'debit',e.target.value)}
                    onKeyDown={e=>handleAmtKeyDown(e,l.id,'debit')}
                    placeholder="0.00" />
                </td>
                <td style={{ padding:'4px 6px' }}>
                  <input type="number" min="0" step="0.01"
                    style={{ ...S.inp, textAlign:'right', fontFamily:'monospace', background:l.credit?'#fff8e1':'#fff' }}
                    value={l.credit}
                    onChange={e=>updateLine(l.id,'credit',e.target.value)}
                    onKeyDown={e=>handleAmtKeyDown(e,l.id,'credit')}
                    placeholder="0.00" />
                </td>
                <td style={{ padding:'4px 6px', textAlign:'center' }}>
                  {lines.length > 2 && (
                    <button onClick={()=>removeLine(l.id)}
                      style={{ background:'none', border:'none', color:'#ef9a9a', fontSize:16, cursor:'pointer', lineHeight:1 }}>
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {/* Add line row */}
            <tr>
              <td colSpan={6} style={{ padding:'8px 10px', borderTop:'1px dashed #e0e0e0' }}>
                <button onClick={addLine} style={{ ...S.btnO('#546e7a'), fontSize:11 }}>+ Add Line</button>
              </td>
            </tr>
            {/* Totals row */}
            <tr style={{ background:'#f5f7fa', borderTop:'2px solid #e0e0e0' }}>
              <td colSpan={3} style={{ padding:'10px 14px', fontWeight:800, fontSize:13 }}>
                TOTALS
                <span style={{ fontSize:11, fontWeight:400, color:'#6b7c93', marginLeft:12 }}>
                  {lines.filter(l=>l.account_code).length} line(s)
                </span>
              </td>
              <td style={{ padding:'10px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:15, color:'#1565C0' }}>
                {fmt(totalDr)}
              </td>
              <td style={{ padding:'10px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:15, color:'#c62828' }}>
                {fmt(totalCr)}
              </td>
              <td />
            </tr>
            {/* Balance indicator */}
            <tr style={{ background: balanced?'#e8f5e9': totalDr===0?'#f5f7fa':'#ffebee' }}>
              <td colSpan={6} style={{ padding:'8px 14px' }}>
                {totalDr === 0 ? (
                  <span style={{ fontSize:11, color:'#aab2bd' }}>Enter amounts to check balance.</span>
                ) : balanced ? (
                  <span style={{ fontSize:12, fontWeight:800, color:'#2e7d32' }}>✅ Balanced — DR = CR = SAR {fmt(totalDr)}</span>
                ) : (
                  <span style={{ fontSize:12, fontWeight:800, color:'#c62828' }}>
                    ⚠️ Out of balance by SAR {fmt(Math.abs(totalDr-totalCr))} &nbsp;
                    (DR {fmt(totalDr)} · CR {fmt(totalCr)})
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Messages */}
      {err     && <div style={{ background:'#ffebee', color:'#c62828', borderRadius:8, padding:'10px 14px', fontSize:12, marginBottom:10 }}>{err}</div>}
      {success && <div style={{ background:'#e8f5e9', color:'#2e7d32', borderRadius:8, padding:'10px 14px', fontSize:12, marginBottom:10 }}>{success}</div>}

      {/* Action buttons */}
      <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
        <button onClick={clearAll} style={S.btnO()}>🗑 Clear All</button>
        <button onClick={post} disabled={posting || !balanced}
          style={{ ...S.btn(balanced?TYPE_COLOR[vType]||'#1a2e3d':'#9e9e9e'),
            opacity: !balanced ? 0.6 : 1, cursor: !balanced ? 'not-allowed' : 'pointer' }}>
          {posting ? 'Posting…' : `✓ Post ${vType}`}
        </button>
      </div>

      {/* Quick guide */}
      <div style={{ marginTop:16, padding:'12px 16px', background:'#f5f7fa', borderRadius:10, fontSize:11, color:'#6b7c93', lineHeight:1.8 }}>
        <strong>Tips:</strong> Select account → description auto-fills from COA.
        Enter DR or CR (not both) per line.
        Press Enter on an amount to add a new line.
        Voucher posts only when DR = CR.
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 2 — JV History
// ═══════════════════════════════════════════════════════════════════
function JVHistory({ entityId, coa }) {
  const [vouchers, setVouchers] = useState([])   // [{voucher_number, voucher_type, entry_date, lines:[]}]
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState({})
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth()-1)
    return d.toISOString().slice(0,10)
  })
  const [toDate,   setToDate]   = useState(today())
  const [typeF,    setTypeF]    = useState('ALL')
  const [reversing, setReversing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const types = VOUCHER_TYPES.map(t=>t.code)
    let q = supabase.from('ledger_entries')
      .select('voucher_number, voucher_type, entry_date, account_code, account_name, debit, credit, description')
      .eq('entity_id', entityId)
      .in('voucher_type', types)
      .gte('entry_date', fromDate)
      .lte('entry_date', toDate)
      .order('entry_date', { ascending:false })
      .order('voucher_number', { ascending:false })

    if (typeF !== 'ALL') q = q.eq('voucher_type', typeF)

    const { data } = await q

    // Group by voucher_number
    const map = {}
    for (const row of (data||[])) {
      if (!map[row.voucher_number]) {
        map[row.voucher_number] = {
          voucher_number: row.voucher_number,
          voucher_type:   row.voucher_type,
          entry_date:     row.entry_date,
          lines: [],
        }
      }
      map[row.voucher_number].lines.push(row)
    }
    setVouchers(Object.values(map).sort((a,b)=>b.entry_date.localeCompare(a.entry_date)||b.voucher_number.localeCompare(a.voucher_number)))
    setLoading(false)
  }, [entityId, fromDate, toDate, typeF])

  useEffect(() => { load() }, [load])

  async function reverse(v) {
    setReversing(v.voucher_number)
    // Get next number for REV type (same type + -REV suffix logic)
    const revNo = `${v.voucher_number}-REV`
    const revLines = v.lines.map(l=>({
      entity_id:    entityId,
      entry_date:   today(),
      voucher_type: v.voucher_type,
      voucher_number: revNo,
      account_code: l.account_code,
      account_name: l.account_name,
      debit:        l.credit,   // swap
      credit:       l.debit,
      description:  `REVERSAL: ${l.description||v.voucher_number}`,
    }))
    const { error } = await supabase.from('ledger_entries').insert(revLines)
    setReversing(null)
    if (error) alert('Reversal failed: '+error.message)
    else { load(); alert(`Reversal ${revNo} posted successfully.`) }
  }

  function printJV(v) {
    const totalDr = v.lines.reduce((s,l)=>s+(+l.debit||0),0)
    const body = `
      <html><head><style>
        body { font-family:Arial,sans-serif; margin:30px; font-size:13px; }
        h2 { color:#1a2e3d; margin-bottom:4px; }
        .meta { color:#6b7c93; font-size:12px; margin-bottom:20px; }
        table { width:100%; border-collapse:collapse; }
        th { background:#1a2e3d; color:#fff; padding:8px 12px; font-size:11px; text-align:left; }
        td { padding:7px 12px; border-bottom:1px solid #f0f0f0; font-size:12px; }
        .num { text-align:right; font-family:monospace; }
        tfoot td { font-weight:700; border-top:2px solid #1a2e3d; }
        .sig { display:flex; gap:80px; margin-top:60px; }
        .sig div { border-top:1px solid #999; padding-top:6px; min-width:140px; font-size:11px; color:#6b7c93; }
      </style></head><body>
        <h2>Journal Voucher — ${v.voucher_number}</h2>
        <div class="meta">Type: ${v.voucher_type} &nbsp;|&nbsp; Date: ${fmtD(v.entry_date)}</div>
        <table>
          <thead><tr><th>Account</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead>
          <tbody>
            ${v.lines.map(l=>`<tr>
              <td>${l.account_code} ${l.account_name}</td>
              <td>${l.description||''}</td>
              <td class="num">${l.debit?fmt(l.debit):''}</td>
              <td class="num">${l.credit?fmt(l.credit):''}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot><tr>
            <td colspan="2">TOTAL</td>
            <td class="num">${fmt(totalDr)}</td>
            <td class="num">${fmt(v.lines.reduce((s,l)=>s+(+l.credit||0),0))}</td>
          </tr></tfoot>
        </table>
        <div class="sig">
          <div>Prepared by</div>
          <div>Reviewed by</div>
          <div>Approved by</div>
          <div>Posted by</div>
        </div>
      </body></html>
    `
    const w = window.open('','_blank','width=800,height=600')
    w.document.write(body); w.document.close(); w.print()
  }

  return (
    <>
      {/* Filters */}
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div><label style={S.lbl}>From</label>
          <input type="date" style={{ ...S.inp, width:150 }} value={fromDate} onChange={e=>setFromDate(e.target.value)} /></div>
        <div><label style={S.lbl}>To</label>
          <input type="date" style={{ ...S.inp, width:150 }} value={toDate} onChange={e=>setToDate(e.target.value)} /></div>
        <div><label style={S.lbl}>Type</label>
          <select style={{ ...S.inp, width:140 }} value={typeF} onChange={e=>setTypeF(e.target.value)}>
            <option value="ALL">All Types</option>
            {VOUCHER_TYPES.map(t=><option key={t.code} value={t.code}>{t.code}</option>)}
          </select></div>
        <button onClick={load} style={{ ...S.btn(), alignSelf:'flex-end' }}>↻ Load</button>
        <span style={{ alignSelf:'flex-end', fontSize:11, color:'#6b7c93', marginLeft:8 }}>
          {vouchers.length} voucher(s) found
        </span>
      </div>

      {/* Voucher list */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading…</div>
      ) : vouchers.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>No journal vouchers in this period.</div>
      ) : (
        vouchers.map(v=>{
          const totalDr = v.lines.reduce((s,l)=>s+(+l.debit||0),0)
          const isRev   = v.voucher_number.endsWith('-REV')
          const color   = TYPE_COLOR[v.voucher_type]||'#546e7a'
          return (
            <div key={v.voucher_number} style={{ ...S.card, padding:0, overflow:'hidden', marginBottom:8, borderLeft:`4px solid ${color}` }}>
              {/* Header row */}
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', cursor:'pointer',
                background:expanded[v.voucher_number]?'#f5f7fa':'#fff' }}
                onClick={()=>setExpanded(x=>({...x,[v.voucher_number]:!x[v.voucher_number]}))}>
                <span style={{ fontFamily:'monospace', fontWeight:800, fontSize:13, color }}>
                  {v.voucher_number}
                </span>
                {isRev && <span style={{ fontSize:9, padding:'1px 6px', borderRadius:6, background:'#f3e5f5', color:'#6a1b9a', fontWeight:700 }}>REVERSAL</span>}
                <span style={{ fontSize:10, padding:'2px 8px', borderRadius:8, background:color+'18', color, fontWeight:700 }}>{v.voucher_type}</span>
                <span style={{ fontSize:12, color:'#6b7c93' }}>{fmtD(v.entry_date)}</span>
                <span style={{ marginLeft:'auto', fontFamily:'monospace', fontWeight:700, fontSize:14 }}>SAR {fmt(totalDr)}</span>
                <span style={{ fontSize:11, color:'#aab2bd' }}>{v.lines.length} lines</span>
                <span style={{ color:'#aab2bd', fontSize:12 }}>{expanded[v.voucher_number]?'▲':'▼'}</span>
              </div>

              {/* Lines (expanded) */}
              {expanded[v.voucher_number] && (
                <div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                    <thead>
                      <tr style={{ background:'#f0f4f8' }}>
                        <th style={{ padding:'6px 16px', textAlign:'left', color:'#6b7c93' }}>Account</th>
                        <th style={{ padding:'6px 16px', textAlign:'left', color:'#6b7c93' }}>Description</th>
                        <th style={{ padding:'6px 16px', textAlign:'right', color:'#1565C0' }}>Debit</th>
                        <th style={{ padding:'6px 16px', textAlign:'right', color:'#c62828' }}>Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.lines.map((l,i)=>(
                        <tr key={i} style={{ borderBottom:'1px solid #f5f5f5', background:i%2?'#fafafa':'#fff' }}>
                          <td style={{ padding:'6px 16px', fontFamily:'monospace', color:'#546e7a' }}>
                            {l.account_code} <span style={{ color:'#1a2e3d' }}>{l.account_name}</span>
                          </td>
                          <td style={{ padding:'6px 16px', color:'#6b7c93' }}>{l.description}</td>
                          <td style={{ padding:'6px 16px', textAlign:'right', fontFamily:'monospace', color:'#1565C0' }}>
                            {l.debit ? fmt(l.debit) : ''}
                          </td>
                          <td style={{ padding:'6px 16px', textAlign:'right', fontFamily:'monospace', color:'#c62828' }}>
                            {l.credit ? fmt(l.credit) : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:'#f0f4f8', borderTop:'2px solid #e0e0e0' }}>
                        <td colSpan={2} style={{ padding:'8px 16px', fontWeight:700 }}>TOTAL</td>
                        <td style={{ padding:'8px 16px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#1565C0' }}>
                          {fmt(totalDr)}
                        </td>
                        <td style={{ padding:'8px 16px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#c62828' }}>
                          {fmt(v.lines.reduce((s,l)=>s+(+l.credit||0),0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>

                  {/* Actions */}
                  <div style={{ display:'flex', gap:8, padding:'10px 16px', background:'#f9fafb', borderTop:'1px solid #f0f0f0' }}>
                    <button onClick={()=>printJV(v)} style={S.btnO()}>🖨 Print</button>
                    {!isRev && (
                      <button onClick={()=>reverse(v)} disabled={reversing===v.voucher_number}
                        style={S.btnO('#c62828')}>
                        {reversing===v.voucher_number ? 'Reversing…' : '↩ Reverse'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════
export default function JournalVoucher({ entityId }) {
  const [tab, setTab]       = useState('new')
  const [coa, setCoa]       = useState([])
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    if (!entityId) return
    supabase.from('chart_of_accounts')
      .select('account_code,account_name,account_type')
      .eq('entity_id', entityId)
      .eq('is_active', true)
      .order('account_code')
      .then(({data})=>setCoa(data||[]))
  }, [entityId])

  const TABS = [
    { key:'new',     label:'📝 New Journal Voucher' },
    { key:'history', label:'📋 JV History' },
  ]

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>
        Manual double-entry journals — accruals, adjustments, reclassifications, opening balances
      </div>

      {/* Tabs */}
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
          {tab === 'new'     && <NewJV     entityId={entityId} coa={coa} onPosted={()=>setRefresh(r=>r+1)} />}
          {tab === 'history' && <JVHistory entityId={entityId} coa={coa} key={refresh} />}
        </>
      )}
    </div>
  )
}
