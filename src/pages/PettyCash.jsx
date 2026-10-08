import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// Petty Cash Module — Phase 9
//
// Tab 1: Cash Book    — select account, view running balance, add entries
// Tab 2: Vouchers     — printable payment vouchers per entry
// Tab 3: Accounts     — manage cash boxes (create / edit float accounts)
// ═══════════════════════════════════════════════════════════════════

const ENTRY_TYPES  = ['OPENING','IN','OUT','REPLENISHMENT','ADJUSTMENT']
const CATEGORIES   = ['Stationery','Transport','Meals','Office Supplies','Postage','Cleaning','Maintenance','Utilities','Entertainment','Other']
const TYPE_COLOR   = { OPENING:'#1565C0', IN:'#2e7d32', OUT:'#c62828', REPLENISHMENT:'#7b1fa2', ADJUSTMENT:'#e65100' }
const TYPE_SIGN    = { OPENING:+1, IN:+1, OUT:-1, REPLENISHMENT:+1, ADJUSTMENT:0 }

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:10 },
  btn:   (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  btnO:  (c='#1a2e3d') => ({ background:'transparent', color:c, border:`1.5px solid ${c}`, borderRadius:8, padding:'7px 15px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:   { padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff', width:'100%', boxSizing:'border-box', fontFamily:'inherit' },
  lbl:   { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
}

const fmt  = n => (+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtD = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'

function nextVoucherNo(entries) {
  const nums = entries
    .map(e => parseInt((e.voucher_number||'').replace(/\D/g,''),10))
    .filter(n => !isNaN(n))
  return `PCV-${String(Math.max(0,...nums)+1).padStart(4,'0')}`
}

// ═══════════════════════════════════════════════════════════════════
// Tab 1 — Cash Book
// ═══════════════════════════════════════════════════════════════════
function CashBook({ entityId, accounts, reloadAccounts }) {
  const [acctId,  setAcctId]  = useState(accounts[0]?.id || '')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(false)
  const [modal,   setModal]   = useState(false)
  const [form,    setForm]    = useState({
    transaction_date: new Date().toISOString().slice(0,10),
    entry_type:'OUT', amount:'', description:'', category:'Other',
    reference:'', approved_by:'',
  })
  const [saving,  setSaving]  = useState(false)
  const [from,    setFrom]    = useState('')
  const [to,      setTo]      = useState('')

  const acct = accounts.find(a=>a.id===acctId)

  useEffect(() => { if (acctId) load() }, [acctId, from, to])
  useEffect(() => { if (accounts.length && !acctId) setAcctId(accounts[0].id) }, [accounts])

  async function load() {
    setLoading(true)
    let q = supabase.from('petty_cash_entries')
      .select('*').eq('account_id', acctId).order('transaction_date').order('created_at')
    if (from) q = q.gte('transaction_date', from)
    if (to)   q = q.lte('transaction_date', to)
    const { data } = await q
    setEntries(data||[])
    setLoading(false)
  }

  // Compute running balance for each row
  const withBalance = (() => {
    let bal = 0
    return entries.map(e => {
      const sign = TYPE_SIGN[e.entry_type] ?? 0
      const adj  = e.entry_type === 'ADJUSTMENT'
        ? (+e.amount >= 0 ? +e.amount : +e.amount)   // adjustments can be +/-
        : sign * Math.abs(+e.amount)
      bal += adj
      return { ...e, running: bal }
    })
  })()

  const balance     = withBalance.length ? withBalance[withBalance.length-1].running : 0
  const totalOut    = entries.filter(e=>e.entry_type==='OUT').reduce((s,e)=>s+Math.abs(+e.amount),0)
  const totalIn     = entries.filter(e=>e.entry_type==='IN'||e.entry_type==='REPLENISHMENT').reduce((s,e)=>s+(+e.amount),0)
  const floatUsage  = acct?.float_limit ? (1 - balance / acct.float_limit) * 100 : 0

  async function addEntry() {
    if (!form.amount || !form.transaction_date) return
    setSaving(true)
    const voucher = form.entry_type === 'OUT' ? nextVoucherNo(entries) : ''
    await supabase.from('petty_cash_entries').insert({
      entity_id:        entityId,
      account_id:       acctId,
      transaction_date: form.transaction_date,
      entry_type:       form.entry_type,
      amount:           Math.abs(+form.amount),
      description:      form.description || null,
      category:         form.category    || null,
      reference:        form.reference   || null,
      approved_by:      form.approved_by || null,
      voucher_number:   voucher || null,
    })
    setSaving(false); setModal(false); load()
    setForm(f=>({ ...f, amount:'', description:'', reference:'', approved_by:'' }))
  }

  async function postToGL(entry) {
    if (!acct?.gl_account_code) return alert('Set a GL account code on this cash box first (Accounts tab).')
    const expenseCode = '5000'  // fallback if no expense code set
    const entries2 = entry.entry_type === 'OUT' ? [
      { entity_id:entityId, entry_date:entry.transaction_date, voucher_type:'PCH',
        voucher_number: entry.voucher_number||'', account_code: expenseCode,
        account_name: entry.category||'Petty Cash Expense', debit: +entry.amount, credit:0,
        description: entry.description||'Petty cash payment' },
      { entity_id:entityId, entry_date:entry.transaction_date, voucher_type:'PCH',
        voucher_number: entry.voucher_number||'', account_code: acct.gl_account_code,
        account_name: acct.account_name, debit:0, credit: +entry.amount,
        description: entry.description||'Petty cash payment' },
    ] : entry.entry_type === 'REPLENISHMENT' ? [
      { entity_id:entityId, entry_date:entry.transaction_date, voucher_type:'PCR',
        voucher_number:'', account_code: acct.gl_account_code,
        account_name: acct.account_name, debit: +entry.amount, credit:0,
        description: `Petty cash replenishment: ${entry.description||''}` },
      { entity_id:entityId, entry_date:entry.transaction_date, voucher_type:'PCR',
        voucher_number:'', account_code:'1000',  // Bank / Main Cash
        account_name:'Bank / Cash', debit:0, credit: +entry.amount,
        description: `Petty cash replenishment: ${entry.description||''}` },
    ] : null

    if (!entries2) return alert('Only OUT and REPLENISHMENT entries can be posted to GL.')
    const { error } = await supabase.from('ledger_entries').insert(entries2)
    if (!error) {
      await supabase.from('petty_cash_entries').update({ gl_posted:true }).eq('id', entry.id)
      load()
    } else alert(`GL post failed: ${error.message}`)
  }

  function exportCSV() {
    const rows = [
      [`Petty Cash Book — ${acct?.account_name||''}`],
      [`Period: ${from||'All'} to ${to||'All'}`],[],
      ['Date','Voucher','Type','Category','Description','Reference','Dr','Cr','Balance'],
      ...withBalance.map(e=>{
        const sign = TYPE_SIGN[e.entry_type]??0
        const dr = (sign > 0 || e.entry_type==='ADJUSTMENT' && +e.amount>0) ? Math.abs(+e.amount) : ''
        const cr = (sign < 0) ? Math.abs(+e.amount) : ''
        return [fmtD(e.transaction_date), e.voucher_number||'', e.entry_type,
                e.category||'', e.description||'', e.reference||'',
                dr||'', cr||'', e.running.toFixed(2)]
      }),
      [],[`Balance: ${fmt(balance)} SAR`],
    ]
    const blob = new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'})
    const a=document.createElement('a');a.href=URL.createObjectURL(blob)
    a.download=`petty-cash-${acctId}.csv`;a.click()
  }

  function printBook() {
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>Petty Cash Book</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;font-size:10px;max-width:900px;margin:0 auto}
    h2{font-size:15px;margin:0}p{color:#666;font-size:10px;margin:2px 0 16px}
    table{width:100%;border-collapse:collapse}
    th{background:#1a2e3d;color:#fff;padding:6px 10px;text-align:left;font-size:9px}
    td{padding:5px 10px;border-bottom:1px solid #f5f5f5;font-size:10px}
    td.num{text-align:right;font-family:monospace}
    .pos{color:#2e7d32;font-weight:700}.neg{color:#c62828;font-weight:700}
    @media print{@page{size:A4 landscape;margin:1cm}}</style></head><body>
    <h2>Petty Cash Book — ${acct?.account_name||''}</h2>
    <p>Custodian: ${acct?.custodian_name||'—'} | Float Limit: SAR ${fmt(acct?.float_limit)} | Period: ${from||'All'} – ${to||'All'}</p>
    <table>
      <tr><th>Date</th><th>Voucher</th><th>Type</th><th>Category</th><th>Description</th><th>Reference</th><th style="text-align:right">Receipts</th><th style="text-align:right">Payments</th><th style="text-align:right">Balance</th><th>GL</th></tr>
      ${withBalance.map(e=>{
        const sign = TYPE_SIGN[e.entry_type]??0
        const dr = sign > 0 ? fmt(e.amount) : ''
        const cr = sign < 0 ? fmt(e.amount) : ''
        return `<tr><td>${fmtD(e.transaction_date)}</td><td style="font-family:monospace;font-size:9px">${e.voucher_number||''}</td>
        <td style="color:${TYPE_COLOR[e.entry_type]};font-weight:700;font-size:9px">${e.entry_type}</td>
        <td>${e.category||''}</td><td>${e.description||''}</td><td>${e.reference||''}</td>
        <td class="num ${dr?'pos':''}">${dr}</td><td class="num ${cr?'neg':''}">${cr}</td>
        <td class="num" style="font-weight:700">${fmt(e.running)}</td>
        <td style="color:${e.gl_posted?'#2e7d32':'#aab2bd'};font-size:9px">${e.gl_posted?'✓':'-'}</td></tr>`
      }).join('')}
      <tr style="background:#f0f4f8;font-weight:700">
        <td colspan="6">CLOSING BALANCE</td>
        <td class="num">${fmt(totalIn)}</td><td class="num">${fmt(totalOut)}</td>
        <td class="num" style="color:${balance>=0?'#2e7d32':'#c62828'}">${fmt(balance)}</td><td></td>
      </tr>
    </table>
    <script>window.onload=()=>window.print()<\/script></body></html>`)
    w.document.close()
  }

  return (
    <>
      {/* Account selector + controls */}
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div>
          <label style={S.lbl}>Cash Box</label>
          <select value={acctId} onChange={e=>setAcctId(e.target.value)} style={{ ...S.inp, width:'auto', minWidth:200 }}>
            {accounts.map(a=><option key={a.id} value={a.id}>{a.account_name}{a.department?` (${a.department})`:''}</option>)}
          </select>
        </div>
        <div><label style={S.lbl}>From</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{ ...S.inp, width:140 }} /></div>
        <div><label style={S.lbl}>To</label><input type="date" value={to} onChange={e=>setTo(e.target.value)} style={{ ...S.inp, width:140 }} /></div>
        <button onClick={()=>setModal(true)} style={{ ...S.btn('#2e7d32'), marginLeft:'auto' }}>+ Add Entry</button>
        <button onClick={exportCSV} style={S.btnO()}>⬇ CSV</button>
        <button onClick={printBook} style={S.btnO('#2e7d32')}>🖨 Print</button>
      </div>

      {/* KPIs */}
      {acct && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:10, marginBottom:12 }}>
          {[
            { label:'Cash Balance',   val:balance, color: balance < (acct.float_limit*0.2) ? '#c62828' : '#2e7d32' },
            { label:'Float Limit',    val:acct.float_limit, color:'#1565C0' },
            { label:'Total Paid Out', val:totalOut, color:'#c62828' },
            { label:'Total Received', val:totalIn,  color:'#2e7d32' },
          ].map(k=>(
            <div key={k.label} style={{ background:'#fff', borderRadius:12, padding:'12px 14px', boxShadow:'0 1px 6px rgba(0,0,0,0.07)', borderLeft:`4px solid ${k.color}` }}>
              <div style={{ fontSize:10, color:'#6b7c93' }}>{k.label}</div>
              <div style={{ fontWeight:800, fontSize:18, color:k.color }}>{fmt(k.val)}</div>
              <div style={{ fontSize:9, color:'#aab2bd' }}>SAR</div>
            </div>
          ))}
          {acct.float_limit > 0 && (
            <div style={{ background:'#fff', borderRadius:12, padding:'12px 14px', boxShadow:'0 1px 6px rgba(0,0,0,0.07)', gridColumn:'span 2' }}>
              <div style={{ fontSize:10, color:'#6b7c93', marginBottom:6 }}>Float Used — {floatUsage.toFixed(0)}%</div>
              <div style={{ background:'#f0f4f8', borderRadius:4, height:10, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${Math.min(100,floatUsage)}%`,
                  background: floatUsage > 90 ? '#c62828' : floatUsage > 70 ? '#e65100' : '#2e7d32',
                  borderRadius:4, transition:'width 0.3s' }} />
              </div>
              {balance < 100 && <div style={{ fontSize:10, color:'#c62828', fontWeight:700, marginTop:4 }}>⚠ Low cash — replenishment needed</div>}
            </div>
          )}
        </div>
      )}

      {/* Cash book table */}
      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#6b7c93' }}>Loading…</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                {['Date','Voucher','Type','Category','Description','Reference','Receipts','Payments','Balance','GL',''].map((h,i)=>(
                  <th key={i} style={{ padding:'8px 12px', textAlign:i>=6&&i<=8?'right':'left', fontSize:10, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {withBalance.length === 0 ? (
                <tr><td colSpan={11} style={{ padding:40, textAlign:'center', color:'#aab2bd', fontStyle:'italic' }}>
                  No entries yet. Click "+ Add Entry" to record a transaction.
                </td></tr>
              ) : withBalance.map((e,i)=>{
                const sign = TYPE_SIGN[e.entry_type]??0
                const isIn = sign > 0
                const amt  = Math.abs(+e.amount)
                return (
                  <tr key={e.id} style={{ borderBottom:'1px solid #f5f5f5', background:i%2?'#fafafa':'#fff' }}>
                    <td style={{ padding:'7px 12px', whiteSpace:'nowrap', color:'#546e7a' }}>{fmtD(e.transaction_date)}</td>
                    <td style={{ padding:'7px 12px', fontFamily:'monospace', fontSize:10, color:'#9e9e9e' }}>{e.voucher_number||'—'}</td>
                    <td style={{ padding:'7px 12px' }}>
                      <span style={{ padding:'2px 7px', borderRadius:10, fontSize:10, fontWeight:700,
                        background: TYPE_COLOR[e.entry_type]+'22', color:TYPE_COLOR[e.entry_type] }}>
                        {e.entry_type}
                      </span>
                    </td>
                    <td style={{ padding:'7px 12px', fontSize:11, color:'#546e7a' }}>{e.category||'—'}</td>
                    <td style={{ padding:'7px 12px', fontSize:11, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.description||'—'}</td>
                    <td style={{ padding:'7px 12px', fontSize:11, color:'#9e9e9e' }}>{e.reference||'—'}</td>
                    <td style={{ padding:'7px 12px', textAlign:'right', fontFamily:'monospace', color:'#2e7d32', fontWeight: isIn?700:400 }}>
                      {isIn ? fmt(amt) : ''}
                    </td>
                    <td style={{ padding:'7px 12px', textAlign:'right', fontFamily:'monospace', color:'#c62828', fontWeight:!isIn?700:400 }}>
                      {!isIn ? fmt(amt) : ''}
                    </td>
                    <td style={{ padding:'7px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:700,
                      color: e.running >= 0 ? '#1a2e3d' : '#c62828' }}>
                      {fmt(e.running)}
                    </td>
                    <td style={{ padding:'7px 12px', textAlign:'center', fontSize:11 }}>
                      {e.gl_posted
                        ? <span style={{ color:'#2e7d32', fontWeight:700 }}>✓</span>
                        : <button onClick={()=>postToGL(e)} style={{ ...S.btnO('#1565C0'), padding:'2px 7px', fontSize:9 }}>Post</button>
                      }
                    </td>
                    <td style={{ padding:'7px 12px' }}>
                      <button onClick={()=>printVoucher(e, acct)} style={{ ...S.btnO('#546e7a'), padding:'2px 7px', fontSize:9 }}>🖨</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background:'#f0f4f8', borderTop:'2px solid #dde3ec' }}>
                <td colSpan={6} style={{ padding:'9px 12px', fontWeight:800, fontSize:13 }}>Closing Balance</td>
                <td style={{ padding:'9px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#2e7d32' }}>{fmt(totalIn)}</td>
                <td style={{ padding:'9px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#c62828' }}>{fmt(totalOut)}</td>
                <td style={{ padding:'9px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:14,
                  color: balance >= 0 ? '#2e7d32' : '#c62828' }}>{fmt(balance)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Add Entry Modal */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:480, padding:24 }}>
            <div style={{ fontSize:17, fontWeight:800, marginBottom:18 }}>📋 Add Cash Entry</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label style={S.lbl}>Date *</label>
                <input type="date" value={form.transaction_date}
                  onChange={e=>setForm(f=>({...f,transaction_date:e.target.value}))} style={S.inp} />
              </div>
              <div>
                <label style={S.lbl}>Type *</label>
                <select value={form.entry_type} onChange={e=>setForm(f=>({...f,entry_type:e.target.value}))} style={S.inp}>
                  {ENTRY_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={S.lbl}>Amount (SAR) *</label>
                <input type="number" min="0" step="0.01" value={form.amount}
                  onChange={e=>setForm(f=>({...f,amount:e.target.value}))} style={S.inp} placeholder="0.00" />
              </div>
              <div>
                <label style={S.lbl}>Category</label>
                <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={S.inp}>
                  {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={S.lbl}>Description</label>
                <input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} style={S.inp} placeholder="What was purchased / received?" />
              </div>
              <div>
                <label style={S.lbl}>Receipt / Reference #</label>
                <input value={form.reference} onChange={e=>setForm(f=>({...f,reference:e.target.value}))} style={S.inp} />
              </div>
              <div>
                <label style={S.lbl}>Approved By</label>
                <input value={form.approved_by} onChange={e=>setForm(f=>({...f,approved_by:e.target.value}))} style={S.inp} />
              </div>
            </div>

            {/* Type explainer */}
            <div style={{ marginTop:12, padding:'8px 12px', borderRadius:8, background:'#f5f7fa', fontSize:11, color:'#546e7a' }}>
              {form.entry_type === 'OUT'           && '💸 OUT — Cash paid for an expense (reduces balance)'}
              {form.entry_type === 'IN'            && '💰 IN — Cash returned or received (increases balance)'}
              {form.entry_type === 'REPLENISHMENT' && '🔄 REPLENISHMENT — Top-up from bank account (increases balance, posts DR Petty Cash / CR Bank)'}
              {form.entry_type === 'OPENING'       && '📌 OPENING — Set the initial cash balance for this box'}
              {form.entry_type === 'ADJUSTMENT'    && '⚙️ ADJUSTMENT — Correction entry (surplus +ve, shortage -ve)'}
            </div>

            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:18 }}>
              <button onClick={()=>setModal(false)} style={S.btnO()}>Cancel</button>
              <button onClick={addEntry} disabled={saving} style={S.btn('#2e7d32')}>
                {saving ? 'Saving…' : '✓ Add Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Print voucher (callable from CashBook row)
function printVoucher(entry, acct) {
  const w = window.open('', '_blank')
  w.document.write(`<!DOCTYPE html><html><head><title>PCV ${entry.voucher_number||''}</title>
  <style>
    body{font-family:Arial,sans-serif;padding:32px;max-width:420px;margin:0 auto;font-size:12px;border:1px solid #ddd}
    h2{font-size:16px;margin:0 0 4px}.sub{color:#666;font-size:11px;margin-bottom:20px}
    .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f5f5f5}
    .label{color:#6b7c93;font-weight:700}.val{font-weight:600}
    .amt{font-size:22px;font-weight:800;color:#c62828;text-align:center;padding:14px;border:2px dashed #c62828;border-radius:8px;margin:16px 0}
    .sigs{display:flex;justify-content:space-between;margin-top:40px;gap:30px}
    .sig{flex:1;border-top:1px solid #1a2e3d;padding-top:6px;text-align:center;font-size:10px;color:#6b7c93}
    @media print{@page{size:A5;margin:1cm}}
  </style></head><body>
  <h2>PETTY CASH VOUCHER</h2>
  <div class="sub">${acct?.account_name||'Petty Cash'}</div>
  <div class="row"><span class="label">Voucher No.</span><span class="val" style="font-family:monospace">${entry.voucher_number||'—'}</span></div>
  <div class="row"><span class="label">Date</span><span class="val">${fmtD(entry.transaction_date)}</span></div>
  <div class="row"><span class="label">Category</span><span class="val">${entry.category||'—'}</span></div>
  <div class="row"><span class="label">Description</span><span class="val">${entry.description||'—'}</span></div>
  <div class="row"><span class="label">Reference / Receipt</span><span class="val">${entry.reference||'—'}</span></div>
  <div class="amt">SAR ${fmt(entry.amount)}</div>
  <div class="sigs">
    <div class="sig">Received by</div>
    <div class="sig">Approved by<br><small>${entry.approved_by||'_______________'}</small></div>
    <div class="sig">Custodian</div>
  </div>
  <script>window.onload=()=>window.print()<\/script></body></html>`)
  w.document.close()
}

// ═══════════════════════════════════════════════════════════════════
// Tab 2 — Accounts (Cash Box Management)
// ═══════════════════════════════════════════════════════════════════
function AccountsTab({ entityId, accounts, reload }) {
  const [modal, setModal] = useState(null)
  const [form,  setForm]  = useState({ account_name:'', department:'', custodian_name:'', float_limit:'500', gl_account_code:'', notes:'' })
  const [saving,setSaving]= useState(false)

  async function save() {
    if (!form.account_name) return
    setSaving(true)
    const payload = { entity_id:entityId, account_name:form.account_name, department:form.department||null,
      custodian_name:form.custodian_name||null, float_limit:+form.float_limit||500,
      gl_account_code:form.gl_account_code||null, notes:form.notes||null, is_active:true }
    if (modal === 'add') await supabase.from('petty_cash_accounts').insert(payload)
    else await supabase.from('petty_cash_accounts').update(payload).eq('id', modal.id)
    setSaving(false); setModal(null); reload()
  }

  function openEdit(a) {
    setForm({ account_name:a.account_name, department:a.department||'', custodian_name:a.custodian_name||'',
      float_limit:a.float_limit||'500', gl_account_code:a.gl_account_code||'', notes:a.notes||'' })
    setModal(a)
  }

  return (
    <>
      <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:10 }}>
        <button onClick={()=>{ setForm({account_name:'',department:'',custodian_name:'',float_limit:'500',gl_account_code:'',notes:''}); setModal('add') }}
          style={S.btn('#2e7d32')}>+ New Cash Box</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
        {accounts.map(a=>(
          <div key={a.id} style={{ ...S.card, borderLeft:`4px solid ${a.is_active?'#2e7d32':'#aab2bd'}` }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontWeight:800, fontSize:14, color:'#1a2e3d' }}>💰 {a.account_name}</div>
                {a.department && <div style={{ fontSize:11, color:'#6b7c93' }}>{a.department}</div>}
              </div>
              <button onClick={()=>openEdit(a)} style={{ ...S.btnO('#546e7a'), padding:'3px 10px', fontSize:11 }}>Edit</button>
            </div>
            <div style={{ marginTop:10, display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, fontSize:11 }}>
              <div style={{ color:'#6b7c93' }}>Custodian</div>
              <div style={{ fontWeight:600 }}>{a.custodian_name||'—'}</div>
              <div style={{ color:'#6b7c93' }}>Float Limit</div>
              <div style={{ fontWeight:700, color:'#1565C0' }}>SAR {fmt(a.float_limit)}</div>
              <div style={{ color:'#6b7c93' }}>GL Account</div>
              <div style={{ fontFamily:'monospace', color:'#546e7a' }}>{a.gl_account_code||'—'}</div>
            </div>
          </div>
        ))}
        {accounts.length === 0 && (
          <div style={{ ...S.card, textAlign:'center', color:'#aab2bd', padding:48, gridColumn:'1/-1' }}>
            No cash boxes yet. Create one to get started.
          </div>
        )}
      </div>

      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:440, padding:24 }}>
            <div style={{ fontSize:17, fontWeight:800, marginBottom:18 }}>
              {modal==='add' ? '➕ New Cash Box' : `✏️ Edit: ${modal.account_name}`}
            </div>
            <div style={{ display:'grid', gap:10 }}>
              {[
                { l:'Box Name *',      k:'account_name',    ph:'e.g. Head Office Petty Cash' },
                { l:'Department',      k:'department',      ph:'e.g. Finance' },
                { l:'Custodian Name',  k:'custodian_name',  ph:'Responsible person' },
                { l:'Float Limit (SAR)', k:'float_limit',   ph:'500', num:true },
                { l:'GL Account Code', k:'gl_account_code', ph:'e.g. 1010' },
              ].map(({l,k,ph,num})=>(
                <div key={k}>
                  <label style={S.lbl}>{l}</label>
                  <input type={num?'number':'text'} value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} style={S.inp} placeholder={ph} />
                </div>
              ))}
              <div>
                <label style={S.lbl}>Notes</label>
                <textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{ ...S.inp, height:60, resize:'vertical' }} />
              </div>
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:18 }}>
              <button onClick={()=>setModal(null)} style={S.btnO()}>Cancel</button>
              <button onClick={save} disabled={saving} style={S.btn('#2e7d32')}>{saving?'Saving…':'✓ Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════
export default function PettyCash({ entityId }) {
  const [tab,      setTab]      = useState('cashbook')
  const [accounts, setAccounts] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => { if (entityId) loadAccounts() }, [entityId])

  async function loadAccounts() {
    setLoading(true)
    const { data } = await supabase
      .from('petty_cash_accounts')
      .select('*')
      .eq('entity_id', entityId)
      .eq('is_active', true)
      .order('account_name')
    setAccounts(data||[])
    setLoading(false)
  }

  const TABS = [
    { key:'cashbook', label:'📒 Cash Book' },
    { key:'accounts', label:'⚙️ Cash Boxes' },
  ]

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>
        Daily cash book per department · printable vouchers · GL posting · float tracking
      </div>

      <div style={{ display:'flex', gap:4, marginBottom:14 }}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={tab===t.key ? S.btn('#1a2e3d') : S.btnO('#546e7a')}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading…</div>
      ) : tab === 'cashbook' ? (
        accounts.length === 0 ? (
          <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>
            No cash boxes set up yet.<br/>
            <button onClick={()=>setTab('accounts')} style={{ ...S.btn('#1565C0'), marginTop:12 }}>⚙️ Create a Cash Box</button>
          </div>
        ) : (
          <CashBook entityId={entityId} accounts={accounts} reloadAccounts={loadAccounts} />
        )
      ) : (
        <AccountsTab entityId={entityId} accounts={accounts} reload={loadAccounts} />
      )}
    </div>
  )
}
