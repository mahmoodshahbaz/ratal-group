import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// Cheque Register — Phase 12
//
// Tab 1 — Issued Cheques   (we wrote: DR Payable / CR Bank on clearance)
// Tab 2 — Received Cheques (we got:  DR Bank / CR Receivable on clearance)
// Tab 3 — Maturity Calendar (upcoming due dates, overdue alerts)
//
// Status flow:
//   ISSUED:   PENDING → CLEARED | BOUNCED | CANCELLED | REPLACED
//   RECEIVED: PENDING → DEPOSITED → CLEARED | BOUNCED | CANCELLED | REPLACED
// ═══════════════════════════════════════════════════════════════════

const STATUS_COLOR = {
  PENDING:   { bg:'#fff8e1', color:'#f57f17', label:'Pending' },
  DEPOSITED: { bg:'#e3f2fd', color:'#1565C0', label:'Deposited' },
  CLEARED:   { bg:'#e8f5e9', color:'#2e7d32', label:'Cleared' },
  BOUNCED:   { bg:'#ffebee', color:'#c62828', label:'Bounced' },
  CANCELLED: { bg:'#f5f5f5', color:'#757575', label:'Cancelled' },
  REPLACED:  { bg:'#f3e5f5', color:'#6a1b9a', label:'Replaced' },
}

const NEXT_STATUS = {
  ISSUED: {
    PENDING:   ['CLEARED','BOUNCED','CANCELLED','REPLACED'],
    BOUNCED:   ['REPLACED'],
    CLEARED:   [],
    CANCELLED: [],
    REPLACED:  [],
  },
  RECEIVED: {
    PENDING:   ['DEPOSITED','CANCELLED'],
    DEPOSITED: ['CLEARED','BOUNCED'],
    BOUNCED:   ['REPLACED'],
    CLEARED:   [],
    CANCELLED: [],
    REPLACED:  [],
  },
}

const DR_NORMAL = new Set(['BANK','CASH','ASSET','CUSTOMER','CONTRACTOR','EMPLOYEE','EXPENSE','CLEARING','INTERNAL','SUBCON'])

const S = {
  card: { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:10 },
  btn:  (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  btnO: (c='#1a2e3d') => ({ background:'transparent', color:c, border:`1.5px solid ${c}`, borderRadius:8, padding:'7px 15px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:  { padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', width:'100%', boxSizing:'border-box' },
  lbl:  { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
  pill: (s) => {
    const c = STATUS_COLOR[s] || { bg:'#f5f5f5', color:'#546e7a' }
    return { display:'inline-block', padding:'2px 9px', borderRadius:10, fontSize:10, fontWeight:800, background:c.bg, color:c.color }
  },
}

const fmt   = n => (+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtD  = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'
const today = () => new Date().toISOString().slice(0,10)
const daysUntil = d => {
  if (!d) return null
  const diff = Math.ceil((new Date(d) - new Date(today())) / 86400000)
  return diff
}

// ── Cheque Form Modal ────────────────────────────────────────────────────────
function ChequeModal({ cheque_type, entityId, existing, onClose, onSaved, coaList }) {
  const isEdit = !!existing
  const blank = {
    cheque_number:'', cheque_date:today(), due_date:today(),
    amount:'', currency:'SAR', bank_name:'', bank_account:'',
    payee_name:'', drawer_name:'', party_account_code:'',
    gl_account_code:'', reference:'', description:'', department:'',
    status:'PENDING',
  }
  const [form, setForm] = useState(isEdit ? { ...existing } : blank)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = (k,v) => setForm(f=>({...f,[k]:v}))

  async function save() {
    if (!form.cheque_number || !form.amount || !form.due_date) {
      setErr('Cheque number, amount, and due date are required.'); return
    }
    setSaving(true); setErr('')
    const payload = { ...form, entity_id: entityId, cheque_type, amount: +form.amount }
    const res = isEdit
      ? await supabase.from('cheques').update(payload).eq('id', existing.id)
      : await supabase.from('cheques').insert(payload)
    setSaving(false)
    if (res.error) { setErr(res.error.message); return }
    onSaved()
  }

  const isIssued = cheque_type === 'ISSUED'

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'#fff', borderRadius:16, padding:28, width:560, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ fontWeight:800, fontSize:16, color:'#1a2e3d', marginBottom:20 }}>
          {isEdit ? 'Edit' : 'New'} {isIssued ? 'Issued' : 'Received'} Cheque
        </div>

        {err && <div style={{ background:'#ffebee', color:'#c62828', borderRadius:8, padding:'8px 12px', fontSize:12, marginBottom:12 }}>{err}</div>}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div>
            <label style={S.lbl}>Cheque No. *</label>
            <input style={S.inp} value={form.cheque_number} onChange={e=>set('cheque_number',e.target.value)} placeholder="e.g. 001234" />
          </div>
          <div>
            <label style={S.lbl}>Amount (SAR) *</label>
            <input style={S.inp} type="number" value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <label style={S.lbl}>Cheque Date</label>
            <input style={S.inp} type="date" value={form.cheque_date} onChange={e=>set('cheque_date',e.target.value)} />
          </div>
          <div>
            <label style={S.lbl}>Due / Value Date *</label>
            <input style={S.inp} type="date" value={form.due_date} onChange={e=>set('due_date',e.target.value)} />
          </div>
          <div>
            <label style={S.lbl}>{isIssued ? 'Payee Name' : 'Drawer Name'}</label>
            <input style={S.inp} value={isIssued ? form.payee_name : form.drawer_name}
              onChange={e=>set(isIssued?'payee_name':'drawer_name',e.target.value)}
              placeholder={isIssued ? 'Who are we paying?' : 'Who gave us this cheque?'} />
          </div>
          <div>
            <label style={S.lbl}>Bank Name</label>
            <input style={S.inp} value={form.bank_name} onChange={e=>set('bank_name',e.target.value)} placeholder="e.g. Al Rajhi Bank" />
          </div>
          <div>
            <label style={S.lbl}>Our Bank Account</label>
            <input style={S.inp} value={form.bank_account} onChange={e=>set('bank_account',e.target.value)} placeholder="Account number" />
          </div>
          <div>
            <label style={S.lbl}>Party GL Account</label>
            <select style={S.inp} value={form.party_account_code} onChange={e=>set('party_account_code',e.target.value)}>
              <option value="">— select —</option>
              {coaList.map(a=><option key={a.account_code} value={a.account_code}>{a.account_code} {a.account_name}</option>)}
            </select>
          </div>
          <div>
            <label style={S.lbl}>Bank / Clearing GL Account</label>
            <select style={S.inp} value={form.gl_account_code} onChange={e=>set('gl_account_code',e.target.value)}>
              <option value="">— select —</option>
              {coaList.filter(a=>['BANK','CASH'].includes(a.account_type)).map(a=>(
                <option key={a.account_code} value={a.account_code}>{a.account_code} {a.account_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={S.lbl}>Reference (Invoice/PO)</label>
            <input style={S.inp} value={form.reference} onChange={e=>set('reference',e.target.value)} placeholder="INV-001 / PO-005" />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={S.lbl}>Description</label>
            <input style={S.inp} value={form.description} onChange={e=>set('description',e.target.value)} placeholder="Purpose / notes" />
          </div>
        </div>

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:20 }}>
          <button onClick={onClose} style={S.btnO()}>Cancel</button>
          <button onClick={save} disabled={saving}
            style={S.btn(isIssued?'#c62828':'#1565C0')}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Cheque'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Status Change Modal ───────────────────────────────────────────────────────
function StatusModal({ cheque, onClose, onSaved }) {
  const allowed = NEXT_STATUS[cheque.cheque_type]?.[cheque.status] || []
  const [newStatus, setNewStatus] = useState(allowed[0]||'')
  const [statusDate, setStatusDate] = useState(today())
  const [bounceReason, setBounceReason] = useState('')
  const [postGL, setPostGL] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    setSaving(true); setErr('')

    // Update status
    const upd = { status: newStatus, status_date: statusDate }
    if (newStatus === 'BOUNCED') upd.bounce_reason = bounceReason

    const { error } = await supabase.from('cheques').update(upd).eq('id', cheque.id)
    if (error) { setErr(error.message); setSaving(false); return }

    // Post to GL if requested and status is CLEARED (or DEPOSITED for received)
    if (postGL && cheque.gl_account_code && cheque.party_account_code &&
        (newStatus === 'CLEARED' || (cheque.cheque_type==='RECEIVED' && newStatus==='DEPOSITED'))) {
      const voucherType = 'CHQ'
      const voucherNumber = `CHQ-${cheque.cheque_number}`
      const desc = cheque.cheque_type === 'ISSUED'
        ? `Cheque ${cheque.cheque_number} cleared — ${cheque.payee_name||''}`
        : `Cheque ${cheque.cheque_number} deposited — ${cheque.drawer_name||''}`

      let lines
      if (cheque.cheque_type === 'ISSUED') {
        // Issued cleared: DR Party (payable reduced) / CR Bank
        lines = [
          { entity_id:cheque.entity_id, entry_date:statusDate, voucher_type:voucherType, voucher_number:voucherNumber,
            account_code:cheque.party_account_code, account_name:'', debit:cheque.amount, credit:0, description:desc },
          { entity_id:cheque.entity_id, entry_date:statusDate, voucher_type:voucherType, voucher_number:voucherNumber,
            account_code:cheque.gl_account_code, account_name:'', debit:0, credit:cheque.amount, description:desc },
        ]
      } else {
        // Received deposited/cleared: DR Bank / CR Party (receivable reduced)
        lines = [
          { entity_id:cheque.entity_id, entry_date:statusDate, voucher_type:voucherType, voucher_number:voucherNumber,
            account_code:cheque.gl_account_code, account_name:'', debit:cheque.amount, credit:0, description:desc },
          { entity_id:cheque.entity_id, entry_date:statusDate, voucher_type:voucherType, voucher_number:voucherNumber,
            account_code:cheque.party_account_code, account_name:'', debit:0, credit:cheque.amount, description:desc },
        ]
      }

      // Enrich account names from COA
      const codes = [...new Set(lines.map(l=>l.account_code))]
      const { data: coaRows } = await supabase.from('chart_of_accounts')
        .select('account_code,account_name').in('account_code', codes).eq('entity_id', cheque.entity_id)
      const nameMap = Object.fromEntries((coaRows||[]).map(r=>[r.account_code,r.account_name]))
      lines = lines.map(l=>({ ...l, account_name: nameMap[l.account_code]||l.account_code }))

      const { error: glErr } = await supabase.from('ledger_entries').insert(lines)
      if (glErr) { setErr('Status updated but GL post failed: '+glErr.message); setSaving(false); return }

      await supabase.from('cheques').update({ gl_posted:true, gl_entry_ref:voucherNumber }).eq('id', cheque.id)
    }

    setSaving(false)
    onSaved()
  }

  if (!allowed.length) {
    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
        onClick={e=>e.target===e.currentTarget&&onClose()}>
        <div style={{ background:'#fff', borderRadius:14, padding:28, width:360 }}>
          <div style={{ fontWeight:700, marginBottom:12 }}>No further status changes available.</div>
          <button onClick={onClose} style={S.btn()}>Close</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'#fff', borderRadius:16, padding:28, width:420, boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ fontWeight:800, fontSize:15, marginBottom:16 }}>
          Update Status — Cheque #{cheque.cheque_number}
        </div>
        <div style={{ fontSize:12, color:'#6b7c93', marginBottom:16 }}>
          Current: <span style={S.pill(cheque.status)}>{cheque.status}</span>
          &nbsp; Amount: <strong>SAR {fmt(cheque.amount)}</strong>
        </div>
        {err && <div style={{ background:'#ffebee', color:'#c62828', borderRadius:8, padding:'8px 12px', fontSize:12, marginBottom:12 }}>{err}</div>}
        <div style={{ marginBottom:12 }}>
          <label style={S.lbl}>New Status</label>
          <select style={S.inp} value={newStatus} onChange={e=>setNewStatus(e.target.value)}>
            {allowed.map(s=><option key={s} value={s}>{STATUS_COLOR[s]?.label||s}</option>)}
          </select>
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={S.lbl}>Effective Date</label>
          <input type="date" style={S.inp} value={statusDate} onChange={e=>setStatusDate(e.target.value)} />
        </div>
        {newStatus === 'BOUNCED' && (
          <div style={{ marginBottom:12 }}>
            <label style={S.lbl}>Bounce Reason</label>
            <input style={S.inp} value={bounceReason} onChange={e=>setBounceReason(e.target.value)} placeholder="e.g. Insufficient funds" />
          </div>
        )}
        {(newStatus === 'CLEARED' || newStatus === 'DEPOSITED') && cheque.gl_account_code && (
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, marginBottom:14, cursor:'pointer' }}>
            <input type="checkbox" checked={postGL} onChange={e=>setPostGL(e.target.checked)} />
            Post GL entry (DR/CR) on status change
          </label>
        )}
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>
          <button onClick={onClose} style={S.btnO()}>Cancel</button>
          <button onClick={save} disabled={saving || !newStatus} style={S.btn(
            newStatus==='CLEARED'?'#2e7d32':newStatus==='BOUNCED'?'#c62828':'#1565C0'
          )}>
            {saving ? 'Saving…' : 'Update Status'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cheque List Tab ──────────────────────────────────────────────────────────
function ChequeList({ cheque_type, entityId, coa }) {
  const [cheques,   setCheques]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [statusF,   setStatusF]   = useState('ALL')
  const [showModal, setShowModal] = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [statusC,   setStatusC]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    let q = supabase.from('cheques').select('*')
      .eq('entity_id', entityId).eq('cheque_type', cheque_type)
      .order('due_date', { ascending: true })
    const { data } = await q
    setCheques(data||[])
    setLoading(false)
  }, [entityId, cheque_type])

  useEffect(() => { load() }, [load])

  function exportCSV() {
    const cols = cheque_type==='ISSUED'
      ? ['cheque_number','cheque_date','due_date','payee_name','bank_name','amount','status','reference','description']
      : ['cheque_number','cheque_date','due_date','drawer_name','bank_name','amount','status','reference','description']
    const header = cols.map(c=>c.replace(/_/g,' ').toUpperCase())
    const rows = filtered.map(c=>cols.map(k=>c[k]??''))
    const csv = [header,...rows].map(r=>r.join(',')).join('\n')
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}))
    a.download=`${cheque_type.toLowerCase()}-cheques.csv`;a.click()
  }

  const filtered = cheques.filter(c=>{
    if (statusF !== 'ALL' && c.status !== statusF) return false
    const q = search.toLowerCase()
    if (!q) return true
    return [c.cheque_number, c.payee_name, c.drawer_name, c.bank_name, c.reference, c.description]
      .some(v=>(v||'').toLowerCase().includes(q))
  })

  const totals = {
    PENDING:  cheques.filter(c=>c.status==='PENDING').reduce((s,c)=>s+c.amount,0),
    CLEARED:  cheques.filter(c=>c.status==='CLEARED').reduce((s,c)=>s+c.amount,0),
    BOUNCED:  cheques.filter(c=>c.status==='BOUNCED').reduce((s,c)=>s+c.amount,0),
  }

  const isIssued = cheque_type === 'ISSUED'
  const accentColor = isIssued ? '#c62828' : '#1565C0'

  return (
    <>
      {/* KPI Strip */}
      <div style={{ display:'flex', gap:10, marginBottom:12, overflowX:'auto', flexWrap:'nowrap', paddingBottom:2 }}>
        {[
          { label:'Pending', val:totals.PENDING, color:'#f57f17' },
          { label:'Cleared', val:totals.CLEARED, color:'#2e7d32' },
          { label:'Bounced', val:totals.BOUNCED, color:'#c62828' },
        ].map(k=>(
          <div key={k.label} style={{ flex:1, minWidth:130, background:'#fff', borderRadius:12, padding:'12px 16px',
            boxShadow:'0 1px 6px rgba(0,0,0,0.07)', borderLeft:`4px solid ${k.color}` }}>
            <div style={{ fontSize:10, color:'#6b7c93' }}>{k.label}</div>
            <div style={{ fontWeight:800, fontSize:18, color:k.color }}>{fmt(k.val)}</div>
            <div style={{ fontSize:9, color:'#aab2bd' }}>SAR</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <input style={{ ...S.inp, width:220 }} value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search cheque #, name, reference…" />
        <select style={{ ...S.inp, width:130 }} value={statusF} onChange={e=>setStatusF(e.target.value)}>
          <option value="ALL">All Statuses</option>
          {Object.entries(STATUS_COLOR).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={exportCSV} style={{ ...S.btnO(), marginLeft:'auto' }}>⬇ CSV</button>
        <button onClick={()=>{ setEditing(null); setShowModal(true) }} style={S.btn(accentColor)}>
          + Add {isIssued?'Issued':'Received'} Cheque
        </button>
      </div>

      {/* Table */}
      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#1a2e3d', color:'#fff' }}>
              <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Cheque #</th>
              <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>
                {isIssued ? 'Payee' : 'Drawer'}
              </th>
              <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Bank</th>
              <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Cheque Date</th>
              <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Due Date</th>
              <th style={{ padding:'9px 14px', textAlign:'right', fontSize:11 }}>Amount</th>
              <th style={{ padding:'9px 14px', textAlign:'center', fontSize:11 }}>Status</th>
              <th style={{ padding:'9px 14px', textAlign:'center', fontSize:11 }}>GL</th>
              <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Reference</th>
              <th style={{ padding:'9px 14px', width:80 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} style={{ padding:40, textAlign:'center', color:'#6b7c93' }}>Loading…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={10} style={{ padding:40, textAlign:'center', color:'#aab2bd' }}>No cheques found.</td></tr>
            )}
            {filtered.map((c,i)=>{
              const days = daysUntil(c.due_date)
              const overdue = c.status==='PENDING' && days !== null && days < 0
              const dueSoon = c.status==='PENDING' && days !== null && days >= 0 && days <= 7
              return (
                <tr key={c.id} style={{ borderBottom:'1px solid #f5f5f5', background:overdue?'#fff8f8':i%2?'#fafafa':'#fff' }}>
                  <td style={{ padding:'7px 14px', fontFamily:'monospace', fontWeight:700, color:'#1a2e3d' }}>
                    {c.cheque_number}
                  </td>
                  <td style={{ padding:'7px 14px', fontSize:12 }}>
                    {isIssued ? c.payee_name||'—' : c.drawer_name||'—'}
                  </td>
                  <td style={{ padding:'7px 14px', color:'#546e7a' }}>{c.bank_name||'—'}</td>
                  <td style={{ padding:'7px 14px', color:'#546e7a' }}>{fmtD(c.cheque_date)}</td>
                  <td style={{ padding:'7px 14px' }}>
                    <span style={{ color: overdue?'#c62828':dueSoon?'#f57f17':'#546e7a', fontWeight:overdue||dueSoon?700:400 }}>
                      {fmtD(c.due_date)}
                    </span>
                    {overdue  && <span style={{ fontSize:9, color:'#c62828', display:'block' }}>OVERDUE {Math.abs(days)}d</span>}
                    {dueSoon  && <span style={{ fontSize:9, color:'#f57f17', display:'block' }}>DUE IN {days}d</span>}
                  </td>
                  <td style={{ padding:'7px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700 }}>
                    {fmt(c.amount)}
                  </td>
                  <td style={{ padding:'7px 14px', textAlign:'center' }}>
                    <span style={S.pill(c.status)}>{STATUS_COLOR[c.status]?.label||c.status}</span>
                    {c.bounce_reason && <div style={{ fontSize:9, color:'#c62828', marginTop:2 }}>{c.bounce_reason}</div>}
                  </td>
                  <td style={{ padding:'7px 14px', textAlign:'center' }}>
                    {c.gl_posted
                      ? <span title={c.gl_entry_ref||''} style={{ color:'#2e7d32', fontSize:14 }}>✓</span>
                      : <span style={{ color:'#ddd' }}>—</span>}
                  </td>
                  <td style={{ padding:'7px 14px', color:'#546e7a', fontSize:11 }}>{c.reference||'—'}</td>
                  <td style={{ padding:'7px 14px' }}>
                    <div style={{ display:'flex', gap:4 }}>
                      <button onClick={()=>setStatusC(c)}
                        style={{ fontSize:10, padding:'3px 8px', borderRadius:6, border:'1px solid #dde3ec', background:'#f5f7fa', cursor:'pointer', color:'#546e7a' }}>
                        Status
                      </button>
                      <button onClick={()=>{ setEditing(c); setShowModal(true) }}
                        style={{ fontSize:10, padding:'3px 8px', borderRadius:6, border:'1px solid #dde3ec', background:'#f5f7fa', cursor:'pointer', color:'#546e7a' }}>
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                <td colSpan={5} style={{ padding:'10px 14px', fontWeight:800 }}>
                  {filtered.length} cheque{filtered.length!==1?'s':''} shown
                </td>
                <td style={{ padding:'10px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:14 }}>
                  {fmt(filtered.reduce((s,c)=>s+c.amount,0))}
                </td>
                <td colSpan={4} style={{ padding:'10px 14px', fontSize:11, opacity:0.7 }}>SAR total</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showModal && (
        <ChequeModal
          cheque_type={cheque_type}
          entityId={entityId}
          existing={editing}
          coaList={coa}
          onClose={()=>{ setShowModal(false); setEditing(null) }}
          onSaved={()=>{ setShowModal(false); setEditing(null); load() }}
        />
      )}
      {statusC && (
        <StatusModal
          cheque={statusC}
          onClose={()=>setStatusC(null)}
          onSaved={()=>{ setStatusC(null); load() }}
        />
      )}
    </>
  )
}

// ── Tab 3 — Maturity Calendar ────────────────────────────────────────────────
function MaturityCalendar({ entityId }) {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [horizon, setHorizon] = useState(30)

  useEffect(() => { load() }, [entityId, horizon])

  async function load() {
    setLoading(true)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + horizon)
    const { data } = await supabase.from('cheques')
      .select('*')
      .eq('entity_id', entityId)
      .eq('status', 'PENDING')
      .lte('due_date', cutoff.toISOString().slice(0,10))
      .order('due_date', { ascending:true })
    setRows(data||[])
    setLoading(false)
  }

  const overdue = rows.filter(r=>daysUntil(r.due_date)<0)
  const upcoming= rows.filter(r=>daysUntil(r.due_date)>=0)

  function Section({ title, items, color }) {
    if (!items.length) return null
    return (
      <div style={{ marginBottom:16 }}>
        <div style={{ fontWeight:800, fontSize:11, color, letterSpacing:1, marginBottom:8, padding:'6px 12px',
          background:color+'18', borderRadius:8 }}>
          {title} ({items.length})
        </div>
        {items.map(c=>{
          const days = daysUntil(c.due_date)
          const isIssued = c.cheque_type === 'ISSUED'
          return (
            <div key={c.id} style={{ ...S.card, marginBottom:8, padding:'12px 16px', borderLeft:`4px solid ${color}` }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:8 }}>
                <div>
                  <span style={{ fontWeight:800, color:'#1a2e3d' }}>#{c.cheque_number}</span>
                  <span style={{ fontSize:10, color:'#6b7c93', marginLeft:8 }}>{isIssued?'ISSUED':'RECEIVED'}</span>
                  <div style={{ fontSize:12, color:'#546e7a', marginTop:2 }}>
                    {isIssued ? c.payee_name||'—' : c.drawer_name||'—'} · {c.bank_name||'—'}
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontWeight:800, fontSize:18, color }}>{fmt(c.amount)} SAR</div>
                  <div style={{ fontSize:11, color, fontWeight:700 }}>
                    {days < 0 ? `${Math.abs(days)} days overdue` : days === 0 ? 'DUE TODAY' : `Due in ${days} days`}
                  </div>
                  <div style={{ fontSize:11, color:'#6b7c93' }}>{fmtD(c.due_date)}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'center' }}>
        <span style={{ fontSize:12, fontWeight:700, color:'#6b7c93' }}>Show cheques due within:</span>
        {[7,14,30,60,90].map(d=>(
          <button key={d} onClick={()=>setHorizon(d)}
            style={horizon===d ? S.btn() : S.btnO()}>
            {d}d
          </button>
        ))}
        <button onClick={load} style={{ ...S.btnO(), marginLeft:'auto' }}>↻ Refresh</button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>
          No pending cheques due within {horizon} days. 🎉
        </div>
      ) : (
        <>
          {/* Summary */}
          <div style={{ display:'flex', gap:10, marginBottom:14, overflowX:'auto', flexWrap:'nowrap', paddingBottom:2 }}>
            {[
              { label:'Overdue', count:overdue.length, amt:overdue.reduce((s,c)=>s+c.amount,0), color:'#c62828' },
              { label:`Due in ${horizon}d`, count:upcoming.length, amt:upcoming.reduce((s,c)=>s+c.amount,0), color:'#f57f17' },
            ].map(k=>(
              <div key={k.label} style={{ flex:1, minWidth:160, background:'#fff', borderRadius:12, padding:'14px 18px',
                boxShadow:'0 1px 6px rgba(0,0,0,0.07)', borderLeft:`4px solid ${k.color}` }}>
                <div style={{ fontSize:10, color:'#6b7c93' }}>{k.label} ({k.count} cheques)</div>
                <div style={{ fontWeight:800, fontSize:20, color:k.color }}>{fmt(k.amt)} SAR</div>
              </div>
            ))}
          </div>
          <Section title="🔴 OVERDUE" items={overdue}  color="#c62828" />
          <Section title="🟡 UPCOMING" items={upcoming} color="#f57f17" />
        </>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════
export default function Cheques({ entityId }) {
  const [tab, setTab] = useState('issued')
  const [coa, setCoa] = useState([])

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
    { key:'issued',   label:'📤 Issued Cheques',   desc:'Cheques we wrote (payables)' },
    { key:'received', label:'📥 Received Cheques', desc:'Cheques we collected (receivables)' },
    { key:'maturity', label:'📅 Maturity Calendar', desc:'Upcoming & overdue' },
  ]

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>
        Track issued and received cheques — status workflow, maturity alerts, GL posting
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:14, borderBottom:'2px solid #f0f4f8', paddingBottom:0 }}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{ padding:'8px 18px', fontSize:12, fontWeight:700, cursor:'pointer', border:'none',
              background:'transparent', borderBottom: tab===t.key?'3px solid #1a2e3d':'3px solid transparent',
              color: tab===t.key?'#1a2e3d':'#6b7c93', marginBottom:-2 }}>
            {t.label}
          </button>
        ))}
      </div>

      {!entityId ? (
        <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>Select an entity to view cheques.</div>
      ) : (
        <>
          {tab === 'issued'   && <ChequeList cheque_type="ISSUED"   entityId={entityId} coa={coa} />}
          {tab === 'received' && <ChequeList cheque_type="RECEIVED" entityId={entityId} coa={coa} />}
          {tab === 'maturity' && <MaturityCalendar entityId={entityId} />}
        </>
      )}
    </div>
  )
}
