import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// Intercompany Transactions — Phase 10
//
// Allows cross-entity charges between RAT / GWT / ACCSYS.
// Each transaction creates TWO balanced ledger_entries rows:
//   Charging entity : DR Intercompany Receivable (INTERNAL)
//                     CR Revenue / Service Income  (INCOME)
//   Receiving entity: DR Expense / IC Charge       (EXPENSE)
//                     CR Intercompany Payable       (INTERNAL)
//
// Tab 1 — IC Journal     : create IC transactions
// Tab 2 — IC Recon       : open IC balances per entity-pair (should net zero)
// Tab 3 — IC Statement   : period view, filterable by entity pair
//
// No new SQL table — uses ledger_entries with voucher_type = 'INTER'
// ═══════════════════════════════════════════════════════════════════

const ENTITY_COLORS = { RAT:'#1565C0', GWT:'#2E7D32', ACCSYS:'#5A32D4' }
const ENTITY_NAMES  = { RAT:'Ratal Tours & Travels', GWT:'Green Wings Travel', ACCSYS:'Ratal Advanced Technologies' }
const IC_CATEGORIES = [
  'Management Fees','IT Services','Accounting Services','HR Services',
  'Shared Overhead','Loan / Advance','Reimbursement','Rent Charge','Other',
]

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:10 },
  btn:   (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  btnO:  (c='#1a2e3d') => ({ background:'transparent', color:c, border:`1.5px solid ${c}`, borderRadius:8, padding:'7px 15px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:   { padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff', width:'100%', boxSizing:'border-box', fontFamily:'inherit' },
  lbl:   { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
}

const fmt  = n => (+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtD = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'

function EntityBadge({ code, size=12 }) {
  const c = ENTITY_COLORS[code]||'#546e7a'
  return (
    <span style={{ padding:'2px 8px', borderRadius:10, fontSize:size-1, fontWeight:800,
      background:c+'22', color:c, whiteSpace:'nowrap' }}>
      {code}
    </span>
  )
}

function nextICNo(entries) {
  const nums = entries
    .map(e => parseInt((e.voucher_number||'').replace(/\D/g,''),10))
    .filter(n=>!isNaN(n))
  return `IC-${String(Math.max(0,...nums)+1).padStart(4,'0')}`
}

// ═══════════════════════════════════════════════════════════════════
// Tab 1 — IC Journal (create transactions)
// ═══════════════════════════════════════════════════════════════════
function ICJournal({ allEntities, entityId }) {
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0,10),
    from_entity_id: '',
    to_entity_id:   '',
    amount:         '',
    category:       'Management Fees',
    description:    '',
    from_ic_account:'IC-REC',   // INTERNAL receivable account code on charging side
    from_inc_account:'MGMT-INC',// INCOME account code on charging side
    to_exp_account: 'MGMT-EXP', // EXPENSE account code on receiving side
    to_ic_account:  'IC-PAY',   // INTERNAL payable account code on receiving side
    ref:            '',
  })
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState('')
  const [history, setHistory] = useState([])

  useEffect(() => { loadHistory() }, [])

  async function loadHistory() {
    const { data } = await supabase
      .from('ledger_entries')
      .select('voucher_number, entry_date, description, debit, credit, entity_id')
      .eq('voucher_type','INTER')
      .order('entry_date', { ascending:false })
      .limit(50)
    setHistory(data||[])
  }

  // Auto-suggest account codes based on category
  useEffect(()=>{
    const map = {
      'Management Fees':   { fi:'IC-REC', fn:'MGMT-INC', te:'MGMT-EXP', ti:'IC-PAY' },
      'IT Services':       { fi:'IC-REC', fn:'IT-INC',   te:'IT-EXP',   ti:'IC-PAY' },
      'Accounting Services':{ fi:'IC-REC', fn:'ACCT-INC', te:'ACCT-EXP', ti:'IC-PAY' },
      'HR Services':       { fi:'IC-REC', fn:'HR-INC',   te:'HR-EXP',   ti:'IC-PAY' },
      'Shared Overhead':   { fi:'IC-REC', fn:'OH-INC',   te:'OH-EXP',   ti:'IC-PAY' },
      'Loan / Advance':    { fi:'IC-LOAN',fn:'',          te:'',          ti:'IC-LOAN' },
      'Reimbursement':     { fi:'IC-REC', fn:'REIMB-INC', te:'REIMB-EXP',ti:'IC-PAY' },
      'Rent Charge':       { fi:'IC-REC', fn:'RENT-INC',  te:'RENT-EXP', ti:'IC-PAY' },
      'Other':             { fi:'IC-REC', fn:'MISC-INC',  te:'MISC-EXP', ti:'IC-PAY' },
    }
    const s = map[form.category]
    if (s) setForm(f=>({...f,
      from_ic_account:  s.fi, from_inc_account: s.fn,
      to_exp_account:   s.te, to_ic_account:    s.ti,
    }))
  }, [form.category])

  async function post() {
    const { from_entity_id:fid, to_entity_id:tid, amount, date, description, category } = form
    if (!fid || !tid || !amount || fid===tid) {
      setMsg('⚠ Select two different entities and enter an amount.'); return
    }
    setSaving(true)

    const fromEntity = allEntities.find(e=>e.id===fid)
    const toEntity   = allEntities.find(e=>e.id===tid)
    const voucher    = nextICNo(history)
    const amt        = +amount
    const desc       = description || `${category}: ${fromEntity?.code||'?'} → ${toEntity?.code||'?'}`

    // 4 ledger lines (2 per entity, balanced)
    const lines = [
      // Charging entity — DR IC Receivable
      { entity_id:fid, entry_date:date, voucher_type:'INTER', voucher_number:voucher,
        account_code:form.from_ic_account,  account_name:'Intercompany Receivable',
        debit:amt, credit:0, description:desc },
      // Charging entity — CR Income
      { entity_id:fid, entry_date:date, voucher_type:'INTER', voucher_number:voucher,
        account_code:form.from_inc_account, account_name:`${category} Income`,
        debit:0, credit:amt, description:desc },
      // Receiving entity — DR Expense
      { entity_id:tid, entry_date:date, voucher_type:'INTER', voucher_number:voucher,
        account_code:form.to_exp_account,   account_name:`${category} Expense`,
        debit:amt, credit:0, description:desc },
      // Receiving entity — CR IC Payable
      { entity_id:tid, entry_date:date, voucher_type:'INTER', voucher_number:voucher,
        account_code:form.to_ic_account,    account_name:'Intercompany Payable',
        debit:0, credit:amt, description:desc },
    ]

    const { error } = await supabase.from('ledger_entries').insert(lines)
    setSaving(false)
    if (!error) {
      setMsg(`✓ IC transaction ${voucher} posted: ${fromEntity?.code} → ${toEntity?.code} — SAR ${fmt(amt)}`)
      setForm(f=>({...f, amount:'', description:'', ref:''}))
      loadHistory()
    } else {
      setMsg(`✗ Error: ${error.message}`)
    }
  }

  function reverseEntry(voucherNo) {
    // Find the original entries and create reversal lines
    const orig = history.filter(e=>e.voucher_number===voucherNo)
    if (!orig.length) return
    const revVoucher = `${voucherNo}-REV`
    const reversals  = orig.map(e=>({
      ...e, id:undefined, created_at:undefined,
      voucher_number: revVoucher,
      entry_date:     new Date().toISOString().slice(0,10),
      debit:  e.credit,
      credit: e.debit,
      description: `REVERSAL: ${e.description||''}`,
    }))
    supabase.from('ledger_entries').insert(reversals).then(({error})=>{
      if (!error) { setMsg(`✓ Reversed ${voucherNo} → ${revVoucher}`); loadHistory() }
      else setMsg(`✗ ${error.message}`)
    })
  }

  // Deduplicate by voucher number for history display
  const vouchersSeen = new Set()
  const historyDeduped = history.filter(e=>{
    if (vouchersSeen.has(e.voucher_number)) return false
    vouchersSeen.add(e.voucher_number); return true
  })

  return (
    <>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        {/* Form */}
        <div style={{ ...S.card }}>
          <div style={{ fontWeight:800, fontSize:15, marginBottom:14 }}>📝 New IC Transaction</div>
          <div style={{ display:'grid', gap:10 }}>
            <div><label style={S.lbl}>Date *</label>
              <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={S.inp} /></div>

            <div><label style={S.lbl}>Charging Entity (FROM) *</label>
              <select value={form.from_entity_id} onChange={e=>setForm(f=>({...f,from_entity_id:e.target.value}))} style={S.inp}>
                <option value="">— Select entity —</option>
                {allEntities.map(e=><option key={e.id} value={e.id}>{e.code} — {ENTITY_NAMES[e.code]||e.name}</option>)}
              </select>
            </div>

            <div><label style={S.lbl}>Receiving Entity (TO) *</label>
              <select value={form.to_entity_id} onChange={e=>setForm(f=>({...f,to_entity_id:e.target.value}))} style={S.inp}>
                <option value="">— Select entity —</option>
                {allEntities.filter(e=>e.id!==form.from_entity_id).map(e=>(
                  <option key={e.id} value={e.id}>{e.code} — {ENTITY_NAMES[e.code]||e.name}</option>
                ))}
              </select>
            </div>

            {form.from_entity_id && form.to_entity_id && (
              <div style={{ padding:'8px 12px', borderRadius:8, background:'#f0f4f8', fontSize:12, color:'#546e7a', display:'flex', alignItems:'center', gap:8 }}>
                <EntityBadge code={allEntities.find(e=>e.id===form.from_entity_id)?.code} />
                <span style={{ fontWeight:700, color:'#1a2e3d' }}>charges →</span>
                <EntityBadge code={allEntities.find(e=>e.id===form.to_entity_id)?.code} />
              </div>
            )}

            <div><label style={S.lbl}>Category *</label>
              <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={S.inp}>
                {IC_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div><label style={S.lbl}>Amount (SAR) *</label>
              <input type="number" min="0" step="0.01" value={form.amount}
                onChange={e=>setForm(f=>({...f,amount:e.target.value}))} style={S.inp} placeholder="0.00" /></div>

            <div><label style={S.lbl}>Description</label>
              <input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} style={S.inp}
                placeholder="e.g. Q2 management fee" /></div>

            {/* GL Accounts — collapsible */}
            <details style={{ marginTop:4 }}>
              <summary style={{ fontSize:11, color:'#6b7c93', cursor:'pointer', fontWeight:700 }}>⚙ GL Account Codes (auto-set — expand to override)</summary>
              <div style={{ marginTop:8, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[
                  { l:'FROM — IC Receivable (DR)', k:'from_ic_account' },
                  { l:'FROM — Income CR',          k:'from_inc_account' },
                  { l:'TO — Expense DR',           k:'to_exp_account' },
                  { l:'TO — IC Payable (CR)',      k:'to_ic_account' },
                ].map(({l,k})=>(
                  <div key={k}>
                    <label style={{ ...S.lbl, fontSize:9 }}>{l}</label>
                    <input value={form[k]} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}
                      style={{ ...S.inp, fontSize:11, fontFamily:'monospace' }} />
                  </div>
                ))}
              </div>
            </details>

            {msg && (
              <div style={{ padding:'8px 12px', borderRadius:8, fontSize:12, fontWeight:600,
                background:msg.startsWith('✓')?'#e8f5e9':'#ffebee',
                color:msg.startsWith('✓')?'#2e7d32':'#c62828' }}>{msg}</div>
            )}

            <button onClick={post} disabled={saving} style={S.btn('#1a2e3d')}>
              {saving ? 'Posting…' : '📒 Post to GL (Both Entities)'}
            </button>
          </div>
        </div>

        {/* How it works */}
        <div>
          <div style={{ ...S.card, background:'#f5f7fa' }}>
            <div style={{ fontWeight:800, fontSize:13, marginBottom:10, color:'#1a2e3d' }}>How IC Transactions Work</div>
            {[
              { step:'1', label:'Charging entity (FROM)', lines:['DR Intercompany Receivable','CR Service Income'], color:'#1565C0' },
              { step:'2', label:'Receiving entity (TO)',  lines:['DR Service Expense','CR Intercompany Payable'],  color:'#c62828' },
            ].map(s=>(
              <div key={s.step} style={{ marginBottom:12, padding:'10px 12px', borderRadius:8, background:'#fff', border:`1.5px solid ${s.color}22` }}>
                <div style={{ fontSize:11, fontWeight:800, color:s.color, marginBottom:6 }}>Step {s.step} — {s.label}</div>
                {s.lines.map((l,i)=>(
                  <div key={i} style={{ fontSize:11, color:'#546e7a', marginBottom:2 }}>
                    <span style={{ fontFamily:'monospace', marginRight:6 }}>{i===0?'DR':'CR'}</span> {l}
                  </div>
                ))}
              </div>
            ))}
            <div style={{ fontSize:10, color:'#aab2bd', marginTop:6 }}>
              IC Receivable + IC Payable should net to zero at group level.
              Use the Recon tab to verify balance.
            </div>
          </div>

          {/* Recent IC history */}
          <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
            <div style={{ padding:'10px 14px', fontWeight:800, fontSize:12, color:'#1a2e3d', borderBottom:'1px solid #f5f5f5' }}>
              Recent IC Transactions
            </div>
            {historyDeduped.length === 0 ? (
              <div style={{ padding:24, textAlign:'center', color:'#aab2bd', fontSize:12 }}>No IC transactions yet</div>
            ) : historyDeduped.slice(0,10).map((e,i)=>(
              <div key={i} style={{ padding:'9px 14px', borderBottom:'1px solid #f5f5f5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:12, fontFamily:'monospace', color:'#1565C0' }}>{e.voucher_number}</div>
                  <div style={{ fontSize:11, color:'#546e7a', marginTop:1 }}>{fmtD(e.entry_date)} · {e.description||'—'}</div>
                </div>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:12 }}>
                    {fmt(Math.max(+e.debit||0,+e.credit||0))} SAR
                  </span>
                  {!e.voucher_number?.includes('-REV') && (
                    <button onClick={()=>reverseEntry(e.voucher_number)}
                      style={{ ...S.btnO('#c62828'), padding:'2px 8px', fontSize:9 }}>↩ Reverse</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 2 — IC Reconciliation
// ═══════════════════════════════════════════════════════════════════
function ICRecon({ allEntities }) {
  const [entries, setEntries] = useState([])
  const [asOf,    setAsOf]    = useState(new Date().toISOString().slice(0,10))
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [asOf])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('ledger_entries')
      .select('entity_id, account_code, debit, credit, voucher_number')
      .eq('voucher_type','INTER')
      .lte('entry_date', asOf)
    setEntries(data||[])
    setLoading(false)
  }

  // Per entity: sum IC Receivable (DR accounts) and IC Payable (CR accounts)
  // We look at net position per entity — should net to zero across the group
  const entityBalances = allEntities.map(ent => {
    const elines = entries.filter(e=>e.entity_id===ent.id)
    const netDebit  = elines.reduce((s,e)=>s+(+e.debit||0),0)
    const netCredit = elines.reduce((s,e)=>s+(+e.credit||0),0)
    const net       = netDebit - netCredit
    return { ...ent, netDebit, netCredit, net }
  })

  const groupNet = entityBalances.reduce((s,e)=>s+e.net,0)
  const balanced = Math.abs(groupNet) < 0.50

  // Build entity-pair matrix
  // For each voucher, find which entity was DR and which was CR (using IC accounts)
  const voucherMap = {}
  for (const e of entries) {
    if (!voucherMap[e.voucher_number]) voucherMap[e.voucher_number] = []
    voucherMap[e.voucher_number].push(e)
  }

  // Pair-level summary
  const pairMap = {}
  for (const [voucher, lines] of Object.entries(voucherMap)) {
    // Charging entity = the one with DR on IC account (debit > 0 on IC-REC)
    const drLines = lines.filter(l=>+l.debit>0 && l.account_code?.startsWith('IC'))
    const crLines = lines.filter(l=>+l.credit>0 && l.account_code?.startsWith('IC'))
    if (drLines.length && crLines.length) {
      const fromId = drLines[0].entity_id
      const toId   = crLines[0].entity_id
      const amt    = +drLines[0].debit||0
      const key    = [fromId,toId].sort().join('|')
      if (!pairMap[key]) pairMap[key] = { fromId, toId, charges:[] }
      pairMap[key].charges.push({ fromId, toId, amt, voucher })
    }
  }

  return (
    <>
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div>
          <label style={S.lbl}>As-of Date</label>
          <input type="date" value={asOf} onChange={e=>setAsOf(e.target.value)} style={{ ...S.inp, width:160 }} />
        </div>
        <button onClick={load} disabled={loading} style={S.btn()}>↻ Refresh</button>
      </div>

      {/* Group balance check */}
      <div style={{ ...S.card, background:balanced?'#e8f5e9':'#ffebee', border:`2px solid ${balanced?'#a5d6a7':'#ef9a9a'}`, display:'flex', alignItems:'center', gap:14 }}>
        <div style={{ fontSize:28 }}>{balanced?'✅':'⚠️'}</div>
        <div>
          <div style={{ fontWeight:800, fontSize:14, color:balanced?'#2e7d32':'#c62828' }}>
            {balanced ? 'IC Balances Are Reconciled — Group Net = Zero' : `IC Imbalance Detected — Group Net: SAR ${fmt(Math.abs(groupNet))}`}
          </div>
          <div style={{ fontSize:11, color:'#6b7c93', marginTop:2 }}>
            All intercompany receivables and payables should cancel out at group level.
          </div>
        </div>
      </div>

      {/* Per-entity position */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:10, marginBottom:14 }}>
        {entityBalances.map(ent=>(
          <div key={ent.id} style={{ background:'#fff', borderRadius:12, padding:'14px 16px',
            boxShadow:'0 1px 6px rgba(0,0,0,0.07)', borderLeft:`4px solid ${ENTITY_COLORS[ent.code]||'#546e7a'}` }}>
            <EntityBadge code={ent.code} size={13} />
            <div style={{ marginTop:8, fontSize:11, display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
              <span style={{ color:'#6b7c93' }}>IC Receivable</span>
              <span style={{ fontFamily:'monospace', fontWeight:700, color:'#2e7d32', textAlign:'right' }}>{fmt(ent.netDebit)}</span>
              <span style={{ color:'#6b7c93' }}>IC Payable</span>
              <span style={{ fontFamily:'monospace', fontWeight:700, color:'#c62828', textAlign:'right' }}>{fmt(ent.netCredit)}</span>
            </div>
            <div style={{ marginTop:8, paddingTop:8, borderTop:'1px solid #f5f5f5', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:11, color:'#6b7c93' }}>Net Position</span>
              <span style={{ fontWeight:800, fontSize:14, color: ent.net>0?'#2e7d32':ent.net<0?'#c62828':'#1a2e3d' }}>
                {ent.net>0?'+':''}{fmt(ent.net)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Entity-pair breakdown */}
      {Object.values(pairMap).length > 0 && (
        <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', fontWeight:800, fontSize:12, color:'#1a2e3d', borderBottom:'1px solid #f5f5f5' }}>
            Charges by Entity Pair
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#f5f7fa' }}>
                <th style={{ padding:'8px 14px', textAlign:'left', fontSize:11, color:'#6b7c93' }}>From (Charging)</th>
                <th style={{ padding:'8px 14px', textAlign:'left', fontSize:11, color:'#6b7c93' }}>To (Receiving)</th>
                <th style={{ padding:'8px 14px', textAlign:'right', fontSize:11, color:'#6b7c93' }}>Transactions</th>
                <th style={{ padding:'8px 14px', textAlign:'right', fontSize:11, color:'#6b7c93' }}>Total Amount (SAR)</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(pairMap).map((pair,i)=>{
                const fromEnt = allEntities.find(e=>e.id===pair.fromId)
                const toEnt   = allEntities.find(e=>e.id===pair.toId)
                const total   = pair.charges.reduce((s,c)=>s+c.amt,0)
                return (
                  <tr key={i} style={{ borderBottom:'1px solid #f5f5f5', background:i%2?'#fafafa':'#fff' }}>
                    <td style={{ padding:'9px 14px' }}><EntityBadge code={fromEnt?.code} /></td>
                    <td style={{ padding:'9px 14px' }}><EntityBadge code={toEnt?.code} /></td>
                    <td style={{ padding:'9px 14px', textAlign:'right', color:'#546e7a' }}>{pair.charges.length}</td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700, fontSize:13 }}>{fmt(total)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {loading && <div style={{ textAlign:'center', padding:40, color:'#6b7c93' }}>Loading IC entries…</div>}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 3 — IC Statement (period view)
// ═══════════════════════════════════════════════════════════════════
function ICStatement({ allEntities }) {
  const now = new Date()
  const [from,    setFrom]    = useState(`${now.getFullYear()}-01-01`)
  const [to,      setTo]      = useState(now.toISOString().slice(0,10))
  const [filterE, setFilterE] = useState('ALL')
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [from, to])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('ledger_entries')
      .select('entity_id, account_code, account_name, debit, credit, entry_date, description, voucher_number')
      .eq('voucher_type','INTER')
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date').order('voucher_number')
    setEntries(data||[])
    setLoading(false)
  }

  // Group by voucher — each voucher has 4 lines
  const voucherMap = {}
  for (const e of entries) {
    if (!voucherMap[e.voucher_number]) voucherMap[e.voucher_number] = []
    voucherMap[e.voucher_number].push(e)
  }

  const vouchers = Object.entries(voucherMap).map(([voucher, lines])=>{
    // Find charging entity (DR IC account) and receiving entity
    const chargerLine  = lines.find(l=>+l.debit>0 && l.account_code?.startsWith('IC'))
    const receiverLine = lines.find(l=>+l.credit>0 && l.account_code?.startsWith('IC'))
    const charger  = allEntities.find(e=>e.id===chargerLine?.entity_id)
    const receiver = allEntities.find(e=>e.id===receiverLine?.entity_id)
    const amt      = lines.reduce((s,l)=>Math.max(s,+l.debit||0),0)
    const date     = lines[0]?.entry_date
    const desc     = lines[0]?.description||''
    const isReversal = voucher.includes('-REV')
    return { voucher, date, desc, charger, receiver, amt, isReversal }
  }).filter(v => v.charger && v.receiver)

  const filtered = filterE === 'ALL' ? vouchers
    : vouchers.filter(v=>v.charger?.code===filterE||v.receiver?.code===filterE)

  const total = filtered.filter(v=>!v.isReversal).reduce((s,v)=>s+v.amt,0)

  function exportCSV() {
    const rows = [
      [`Intercompany Statement — ${fmtD(from)} to ${fmtD(to)}`],[],
      ['Voucher','Date','From','To','Description','Amount (SAR)','Note'],
      ...filtered.map(v=>[v.voucher,fmtD(v.date),v.charger?.code,v.receiver?.code,v.desc,v.amt.toFixed(2),v.isReversal?'REVERSAL':'']),
      [],['Total (excl. reversals)', '', '', '', '', total.toFixed(2)],
    ]
    const blob = new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'})
    const a=document.createElement('a');a.href=URL.createObjectURL(blob)
    a.download=`ic-statement-${from}-to-${to}.csv`;a.click()
  }

  return (
    <>
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div><label style={S.lbl}>From</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={{ ...S.inp, width:150 }} /></div>
        <div><label style={S.lbl}>To</label><input type="date" value={to} onChange={e=>setTo(e.target.value)} style={{ ...S.inp, width:150 }} /></div>
        <div>
          <label style={S.lbl}>Entity Filter</label>
          <select value={filterE} onChange={e=>setFilterE(e.target.value)} style={{ ...S.inp, width:'auto' }}>
            <option value="ALL">All Entities</option>
            {allEntities.map(e=><option key={e.id} value={e.code}>{e.code}</option>)}
          </select>
        </div>
        <button onClick={load}    style={S.btn()}>↻ Refresh</button>
        <button onClick={exportCSV} style={S.btnO()}>⬇ CSV</button>
      </div>

      {loading ? <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading…</div> : (
        <>
          <div style={{ marginBottom:10, padding:'10px 14px', background:'#fff', borderRadius:10, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:12, color:'#6b7c93' }}>{filtered.length} transactions · {filtered.filter(v=>v.isReversal).length} reversals</span>
            <span style={{ fontWeight:800, fontSize:14 }}>Period Total: {fmt(total)} SAR</span>
          </div>

          <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                  <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Voucher</th>
                  <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Date</th>
                  <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>From</th>
                  <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>To</th>
                  <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Description</th>
                  <th style={{ padding:'9px 14px', textAlign:'right', fontSize:11 }}>Amount (SAR)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding:40, textAlign:'center', color:'#aab2bd', fontStyle:'italic' }}>
                    No IC transactions in this period.
                  </td></tr>
                ) : filtered.map((v,i)=>(
                  <tr key={v.voucher} style={{ borderBottom:'1px solid #f5f5f5',
                    background: v.isReversal ? '#fff8e1' : i%2?'#fafafa':'#fff',
                    opacity: v.isReversal ? 0.75 : 1 }}>
                    <td style={{ padding:'8px 14px', fontFamily:'monospace', fontSize:11,
                      color: v.isReversal?'#e65100':'#1565C0', fontWeight:700 }}>{v.voucher}</td>
                    <td style={{ padding:'8px 14px', color:'#546e7a', whiteSpace:'nowrap' }}>{fmtD(v.date)}</td>
                    <td style={{ padding:'8px 14px' }}><EntityBadge code={v.charger?.code} /></td>
                    <td style={{ padding:'8px 14px' }}><EntityBadge code={v.receiver?.code} /></td>
                    <td style={{ padding:'8px 14px', color:'#546e7a', maxWidth:280, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v.desc}</td>
                    <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700,
                      color: v.isReversal?'#e65100':'#1a2e3d', textDecoration:v.isReversal?'line-through':'' }}>
                      {fmt(v.amt)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr style={{ background:'#f0f4f8', borderTop:'2px solid #e0e0e0' }}>
                    <td colSpan={5} style={{ padding:'9px 14px', fontWeight:800, fontSize:13 }}>Net Total (excl. reversals)</td>
                    <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:14 }}>{fmt(total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════
export default function Intercompany({ entityId, entityCode }) {
  const [tab,         setTab]         = useState('journal')
  const [allEntities, setAllEntities] = useState([])
  const [loading,     setLoading]     = useState(true)

  useEffect(() => { loadEntities() }, [])

  async function loadEntities() {
    const { data } = await supabase
      .from('entities')
      .select('id, entity_code, entity_name')
      .order('entity_code')
    setAllEntities((data||[]).map(e=>({...e, code:e.entity_code, name:e.entity_name})))
    setLoading(false)
  }

  const TABS = [
    { key:'journal',   label:'📝 IC Journal' },
    { key:'recon',     label:'🔄 IC Recon' },
    { key:'statement', label:'📋 IC Statement' },
  ]

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>
        Cross-entity charges between RAT · GWT · ACCSYS — posts to both entities' GL simultaneously
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
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading entities…</div>
      ) : allEntities.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'#aab2bd' }}>No entities found in database.</div>
      ) : (
        <>
          {tab === 'journal'   && <ICJournal   allEntities={allEntities} entityId={entityId} />}
          {tab === 'recon'     && <ICRecon     allEntities={allEntities} />}
          {tab === 'statement' && <ICStatement allEntities={allEntities} />}
        </>
      )}
    </div>
  )
}
