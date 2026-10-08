import { GROUP_COLORS } from '../styles/appStyles'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SAR = v => `SAR ${(+v||0).toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const fmt  = d => d ? new Date(d).toLocaleDateString('en-GB') : '—'
const TODAY = new Date().toISOString().slice(0,10)

const METHODS = ['BANK_TRANSFER','CASH','CHEQUE','SADAD']
const BANKS   = ['ANB-15','ANB-39','ANB-77','ANB-13','ANB-11','ANB-29','CASH-001']

const MC = GROUP_COLORS.Finance

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'20px 22px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:18 },
  inp:   { width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
  btn:   (c='#1565C0') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer' }),
  label: { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4 },
  row:   { display:'flex', gap:12, marginBottom:14 },
  col:   { flex:1 },
  tbl:   { width:'100%', borderCollapse:'collapse', fontSize:12 },
  th:    { background:MC, color:'#fff', padding:'9px 10px', fontWeight:700, textAlign:'left', fontSize:11 },
  td:    { padding:'8px 10px', borderBottom:'1px solid #f0f4f8', color:'#1a2e3d', verticalAlign:'middle' },
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' },
  modal: { background:'#fff', borderRadius:16, padding:28, width:560, maxWidth:'96vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.18)' },
  chip:  (c) => ({ display:'inline-block', padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:c+'22', color:c }),
}

export default function Receipts({ entityId }) {
  const [receipts,  setReceipts]   = useState([])
  const [invoices,  setInvoices]   = useState([])
  const [contractors,setCons]      = useState([])
  const [customers, setCustomers]  = useState([])
  const [loading,   setLoading]    = useState(true)
  const [showForm,  setShowForm]   = useState(false)
  const [search,    setSearch]     = useState('')
  const [form, setForm] = useState({
    receipt_date: TODAY, received_from:'', party_type:'CONTRACTOR',
    contractor_id:'', customer_id:'', amount:'', payment_method:'BANK_TRANSFER',
    bank_account:'ANB-15', reference:'', notes:''
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const [{ data:r },{ data:inv },{ data:con },{ data:cus }] = await Promise.all([
      supabase.from('receipts').select('*').eq('entity_id',entityId).order('receipt_date',{ascending:false}).limit(200),
      supabase.from('invoices').select('id,invoice_number,total_amount,status').eq('entity_id',entityId).eq('status','UNPAID').limit(200),
      supabase.from('contractors').select('id,company_name,vendor_type').eq('entity_id',entityId).order('company_name').limit(200),
      supabase.from('customers').select('id,name').eq('entity_id',entityId).order('name').limit(200),
    ])
    setReceipts(r||[]); setInvoices(inv||[]); setCons(con||[]); setCustomers(cus||[])
    setLoading(false)
  }

  async function save() {
    if (!form.amount || +form.amount <= 0) { alert('Amount is required'); return }
    if (!form.received_from && !form.contractor_id && !form.customer_id) { alert('Received From is required'); return }

    setSaving(true)
    const num = `REC-${Date.now().toString().slice(-6)}`
    const { error } = await supabase.from('receipts').insert({
      ...form,
      entity_id: entityId,
      receipt_number: num,
      amount: +form.amount,
      contractor_id: form.contractor_id || null,
      customer_id: form.customer_id || null,
    })
    setSaving(false)
    if (error) { alert(error.message); return }
    setShowForm(false)
    setForm({ receipt_date:TODAY, received_from:'', party_type:'CONTRACTOR', contractor_id:'', customer_id:'', amount:'', payment_method:'BANK_TRANSFER', bank_account:'ANB-15', reference:'', notes:'' })
    load()
  }

  const filtered = receipts.filter(r =>
    (r.received_from||'').toLowerCase().includes(search.toLowerCase()) ||
    (r.receipt_number||'').toLowerCase().includes(search.toLowerCase()) ||
    (r.reference||'').toLowerCase().includes(search.toLowerCase())
  )
  const totalAmount = receipts.reduce((s,r) => s + (+r.amount||0), 0)

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:12, color:'#6b7c93', marginTop:2 }}>Incoming payments from Contractors & Customers</div>
        </div>
        <button style={S.btn('#00695c')} onClick={() => setShowForm(true)}>+ New Receipt</button>
      </div>

      {/* Summary */}
      <div style={{ display:'flex', gap:14, marginBottom:18 }}>
        {[
          { label:'Total Receipts', value: receipts.length, color:'#1565C0', icon:'📄' },
          { label:'Total Received', value: SAR(totalAmount), color:'#2e7d32', icon:'💰' },
          { label:'This Month', value: SAR(receipts.filter(r=>r.receipt_date>=TODAY.slice(0,8)+'01').reduce((s,r)=>s+(+r.amount||0),0)), color:'#00695c', icon:'📅' },
        ].map(c => (
          <div key={c.label} style={{ ...S.card, flex:1, marginBottom:0, display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ fontSize:28 }}>{c.icon}</div>
            <div><div style={{ fontSize:20, fontWeight:800, color:c.color }}>{c.value}</div><div style={{ fontSize:12, color:'#6b7c93' }}>{c.label}</div></div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ ...S.card, padding:'12px 16px', marginBottom:14 }}>
        <input style={S.inp} placeholder="Search by received from, receipt#, bank ref…" value={search} onChange={e=>setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div style={S.card}>
        {loading ? <div style={{ textAlign:'center', padding:40, color:'#6b7c93' }}>Loading…</div> : (
          <table style={S.tbl}>
            <thead><tr>
              <th style={S.th}>Receipt#</th>
              <th style={S.th}>Date</th>
              <th style={S.th}>Received From</th>
              <th style={S.th}>Method</th>
              <th style={S.th}>Bank Account</th>
              <th style={S.th}>Reference</th>
              <th style={{ ...S.th, textAlign:'right' }}>Amount</th>
            </tr></thead>
            <tbody>
              {filtered.length===0 && <tr><td colSpan={7} style={{ ...S.td, textAlign:'center', color:'#aab2bd', padding:30 }}>No receipts yet</td></tr>}
              {filtered.map((r,i) => (
                <tr key={r.id} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
                  <td style={{ ...S.td, fontWeight:700, color:'#00695c', fontFamily:'monospace' }}>{r.receipt_number}</td>
                  <td style={S.td}>{fmt(r.receipt_date)}</td>
                  <td style={S.td}>{r.received_from || '—'}</td>
                  <td style={S.td}><span style={S.chip('#546e7a')}>{r.payment_method}</span></td>
                  <td style={{ ...S.td, fontFamily:'monospace', fontWeight:700 }}>{r.bank_account||'—'}</td>
                  <td style={{ ...S.td, fontSize:11, color:'#6b7c93' }}>{r.reference||'—'}</td>
                  <td style={{ ...S.td, textAlign:'right', fontWeight:800, color:'#2e7d32', fontSize:13 }}>{SAR(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── FORM MODAL ── */}
      {showForm && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setShowForm(false)}>
          <div style={S.modal}>
            <div style={{ fontWeight:800, fontSize:16, color:'#1a2e3d', marginBottom:18 }}>New Receipt</div>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Receipt Date *</label>
                <input type="date" style={S.inp} value={form.receipt_date} onChange={e=>setForm(f=>({...f,receipt_date:e.target.value}))} /></div>
              <div style={S.col}><label style={S.label}>Party Type</label>
                <select style={S.inp} value={form.party_type} onChange={e=>setForm(f=>({...f,party_type:e.target.value,contractor_id:'',customer_id:''}))}>
                  <option>CONTRACTOR</option><option>CUSTOMER</option><option>OTHER</option>
                </select></div>
            </div>

            {form.party_type === 'CONTRACTOR' && (
              <div style={{ marginBottom:14 }}><label style={S.label}>Contractor</label>
                <select style={S.inp} value={form.contractor_id} onChange={e=>{
                  const c=contractors.find(x=>x.id===e.target.value)
                  setForm(f=>({...f,contractor_id:e.target.value,received_from:c?.company_name||''}))
                }}>
                  <option value="">— Select Contractor —</option>
                  {contractors.filter(c=>c.vendor_type==='CONTRACTOR').map(c=><option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select></div>
            )}
            {form.party_type === 'CUSTOMER' && (
              <div style={{ marginBottom:14 }}><label style={S.label}>Customer</label>
                <select style={S.inp} value={form.customer_id} onChange={e=>{
                  const c=customers.find(x=>x.id===e.target.value)
                  setForm(f=>({...f,customer_id:e.target.value,received_from:c?.name||''}))
                }}>
                  <option value="">— Select Customer —</option>
                  {customers.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
            )}
            {form.party_type === 'OTHER' && (
              <div style={{ marginBottom:14 }}><label style={S.label}>Received From *</label>
                <input style={S.inp} value={form.received_from} onChange={e=>setForm(f=>({...f,received_from:e.target.value}))} placeholder="Name of payer" /></div>
            )}

            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Amount (SAR) *</label>
                <input type="number" style={S.inp} value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0.00" /></div>
              <div style={S.col}><label style={S.label}>Payment Method</label>
                <select style={S.inp} value={form.payment_method} onChange={e=>setForm(f=>({...f,payment_method:e.target.value}))}>
                  {METHODS.map(m=><option key={m}>{m}</option>)}
                </select></div>
            </div>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Deposit To (Bank Account)</label>
                <select style={S.inp} value={form.bank_account} onChange={e=>setForm(f=>({...f,bank_account:e.target.value}))}>
                  {BANKS.map(b=><option key={b}>{b}</option>)}
                </select></div>
              <div style={S.col}><label style={S.label}>Bank Reference / Cheque#</label>
                <input style={S.inp} value={form.reference} onChange={e=>setForm(f=>({...f,reference:e.target.value}))} placeholder="Bank transfer ref / cheque#" /></div>
            </div>
            <div style={{ marginBottom:18 }}><label style={S.label}>Notes</label>
              <input style={S.inp} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder="e.g. Payment for Invoice INV-0042" /></div>

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button style={S.btn('#aab2bd')} onClick={()=>setShowForm(false)}>Cancel</button>
              <button style={S.btn('#00695c')} onClick={save} disabled={saving}>{saving?'Saving…':'Save Receipt'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
