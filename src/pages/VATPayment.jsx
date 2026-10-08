import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.Finance
/**
 * VATPayment.jsx — ZATCA VAT Payment Recording
 * Records VAT payments made to ZATCA and auto-posts the journal entry:
 *   Dr  2210  VAT Payable    (clears the liability)
 *   Cr  Bank Account         (reduces bank balance)
 *
 * Also shows VAT position summary pulled from VATReturn calculations.
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { postVATPaymentJE } from '../lib/autoPost'

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.52)', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'20px 10px', overflowY:'auto' },
  modal:   { background:'#fff', borderRadius:16, width:640, maxWidth:'96vw', boxShadow:'0 8px 40px rgba(0,0,0,0.2)', marginTop:'auto', marginBottom:'auto', overflow:'hidden' },
  inp:     { width:'100%', padding:'8px 11px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box' },
  label:   { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4, textTransform:'uppercase', letterSpacing:0.4 },
  row:     { display:'flex', gap:12, marginBottom:14 },
  col:     { flex:1 },
  btn:     (bg, fg='#fff') => ({ background:bg, color:fg, border:'none', borderRadius:9, padding:'9px 20px', cursor:'pointer', fontSize:13, fontWeight:700 }),
  th:      { padding:'9px 12px', textAlign:'left', fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:0.4, background:MC, color:'#fff', whiteSpace:'nowrap' },
  td:      { padding:'9px 12px', fontSize:12, color:'#2d3a45', borderBottom:'1px solid #f0f4f8', verticalAlign:'middle' },
}

function fmt(n) {
  return new Intl.NumberFormat('en-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0)
}

const EMPTY_FORM = {
  payment_date:    new Date().toISOString().split('T')[0],
  period_from:     '',
  period_to:       '',
  vat_period:      '',
  output_vat:      '',
  input_vat:       '',
  net_vat_payable: '',
  amount_paid:     '',
  bank_account_id: '',
  reference_number:'',
  filing_number:   '',
  status:          'PAID',
  notes:           '',
}

export default function VATPayment({ entityId }) {
  const [payments, setPayments]   = useState([])
  const [bankAccts, setBankAccts] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [editId, setEditId]       = useState(null)
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')
  const [vatPos, setVatPos]       = useState(null)  // current VAT position

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: pmt }, { data: banks }] = await Promise.all([
      supabase.from('vat_payments').select('*, bank_accounts(account_name,bank_name)')
        .eq('entity_id', entityId).order('payment_date', { ascending:false }),
      supabase.from('bank_accounts').select('id, account_name, bank_name')
        .eq('entity_id', entityId).eq('is_active', true).order('sort_order'),
    ])
    setPayments(pmt || [])
    setBankAccts(banks || [])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  // ── Compute current VAT position from journal entries ─────────────────────
  useEffect(() => {
    async function computeVATPosition() {
      // Get balance on account 2210 (Output VAT Payable) from all posted JEs
      const { data: coa } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('entity_id', entityId)
        .eq('account_code', '2210')
        .single()

      if (!coa) { setVatPos(null); return }

      const { data: jeData } = await supabase
        .from('journal_entries')
        .select('id')
        .eq('entity_id', entityId)
        .eq('status', 'POSTED')

      if (!jeData || jeData.length === 0) { setVatPos({ outputVAT:0, paidToDate:0, balance:0 }); return }

      const { data: lines } = await supabase
        .from('journal_entry_lines')
        .select('debit_amount, credit_amount')
        .eq('account_id', coa.id)
        .in('journal_entry_id', jeData.map(j=>j.id))

      const totalCr = (lines||[]).reduce((s,l) => s + (+l.credit_amount||0), 0)  // Output VAT charged
      const totalDr = (lines||[]).reduce((s,l) => s + (+l.debit_amount ||0), 0)  // VAT paid to ZATCA
      setVatPos({ outputVAT: totalCr, paidToDate: totalDr, balance: totalCr - totalDr })
    }
    computeVATPosition()
  }, [entityId, payments])  // recompute when payments change

  function openNew() {
    setForm(EMPTY_FORM)
    setEditId(null)
    setErr('')
    // Pre-fill VAT amounts from position
    if (vatPos) {
      setForm(f => ({
        ...f,
        output_vat:      String(vatPos.outputVAT.toFixed(2)),
        net_vat_payable: String(vatPos.balance.toFixed(2)),
        amount_paid:     String(vatPos.balance.toFixed(2)),
      }))
    }
    setShowModal(true)
  }

  function openEdit(p) {
    setForm({
      payment_date:     p.payment_date||'',
      period_from:      p.period_from||'',
      period_to:        p.period_to||'',
      vat_period:       p.vat_period||'',
      output_vat:       p.output_vat||'',
      input_vat:        p.input_vat||'',
      net_vat_payable:  p.net_vat_payable||'',
      amount_paid:      p.amount_paid||'',
      bank_account_id:  p.bank_account_id||'',
      reference_number: p.reference_number||'',
      filing_number:    p.filing_number||'',
      status:           p.status||'PAID',
      notes:            p.notes||'',
    })
    setEditId(p.id)
    setErr('')
    setShowModal(true)
  }

  async function save() {
    if (!form.payment_date)  { setErr('Payment date is required'); return }
    if (!form.amount_paid || +form.amount_paid <= 0) { setErr('Amount paid is required'); return }
    if (!form.period_from || !form.period_to)        { setErr('VAT period (from / to) is required'); return }

    setSaving(true)

    const payload = {
      entity_id:        entityId,
      payment_date:     form.payment_date,
      period_from:      form.period_from,
      period_to:        form.period_to,
      vat_period:       form.vat_period || form.period_from?.slice(0,7) || '',
      output_vat:       +form.output_vat      || 0,
      input_vat:        +form.input_vat       || 0,
      net_vat_payable:  +form.net_vat_payable || 0,
      amount_paid:      +form.amount_paid,
      bank_account_id:  form.bank_account_id  || null,
      reference_number: form.reference_number || null,
      filing_number:    form.filing_number    || null,
      status:           form.status,
      notes:            form.notes            || null,
    }

    let result, error
    if (editId) {
      ;({ data: result, error } = await supabase.from('vat_payments').update(payload).eq('id', editId).select().single())
    } else {
      ;({ data: result, error } = await supabase.from('vat_payments').insert(payload).select().single())
    }

    if (error) { setErr(error.message); setSaving(false); return }

    // Auto-post journal entry (only for new records, not edits)
    if (!editId && result?.id) {
      // Get COA code for the selected bank account
      const bank = bankAccts.find(b => b.id === form.bank_account_id)
      // Map bank account to COA code (1110 default)
      const bankCoaMap = {
        'ANB Main Operations':          '1110',
        'ANB Contra Distribution (39)': '1120',
        'ANB Contra Distribution (77)': '1130',
        'Petty Cash':                   '1140',
      }
      const bankCode = bankCoaMap[bank?.account_name] || '1110'

      await postVATPaymentJE({
        entityId,
        vatPaymentId:    result.id,
        date:            form.payment_date,
        amountPaid:      +form.amount_paid,
        reference:       form.reference_number || form.filing_number || `VAT-${form.vat_period}`,
        bankAccountCode: bankCode,
      }).catch(e => console.error('autoPost VAT payment JE failed:', e))

      // Update record with journal_entry_id
      // (postVATPaymentJE returns {jeId} but we fire-and-forget here for UX speed)
    }

    setSaving(false)
    setShowModal(false)
    load()
  }

  const statusBadge = s => {
    const map = { PAID:['#e8f5e9','#2e7d32'], REFUND_CLAIMED:['#e3f2fd','#1565c0'] }
    const [bg,fg] = map[s]||['#f5f5f5','#555']
    return <span style={{ background:bg, color:fg, padding:'2px 8px', borderRadius:12, fontSize:11, fontWeight:700 }}>{s?.replace(/_/g,' ')}</span>
  }

  const totalPaid = payments.reduce((s,p) => s + (+p.amount_paid||0), 0)

  return (
    <div style={{ padding:24, maxWidth:1100, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:13, color:'#6b7c93' }}>ZATCA VAT filing and payment records — auto-posts Dr VAT Payable / Cr Bank</div>
        </div>
        <button style={S.btn('#1a7f4b')} onClick={openNew}>+ Record VAT Payment</button>
      </div>

      {/* VAT Position summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Output VAT Charged',  value: vatPos?.outputVAT || 0,  color:'#c0392b', note:'From issued invoices' },
          { label:'VAT Paid to ZATCA',   value: vatPos?.paidToDate|| 0,  color:'#1a7f4b', note:'Total payments made' },
          { label:'VAT Balance Due',      value: vatPos?.balance   || 0,  color: (vatPos?.balance||0)>0?'#c0392b':'#1a7f4b', note:'Output minus paid' },
          { label:'Total Payments (SAR)', value: totalPaid,               color:'#1a2e3d', note:`${payments.length} filing${payments.length!==1?'s':''}` },
        ].map(c=>(
          <div key={c.label} style={{ background:'#fff', borderRadius:10, border:'1.5px solid #e8edf5', padding:'14px 18px' }}>
            <div style={{ fontSize:11, color:'#6b7c93', fontWeight:700, textTransform:'uppercase', letterSpacing:0.4, marginBottom:6 }}>{c.label}</div>
            <div style={{ fontSize:16, fontWeight:800, color:c.color, fontFamily:'monospace' }}>SAR {fmt(c.value)}</div>
            <div style={{ fontSize:11, color:'#aab2bd', marginTop:3 }}>{c.note}</div>
          </div>
        ))}
      </div>

      {/* Payments table */}
      <div style={{ background:'#fff', borderRadius:12, border:'1.5px solid #e8edf5', overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#aab2bd' }}>Loading…</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  {['Payment Date','VAT Period','Period','Output VAT','Input VAT','Net VAT','Amount Paid','Bank','Reference','Filing #','Status',''].map(h=>(
                    <th key={h} style={{ ...S.th, textAlign:['Output VAT','Input VAT','Net VAT','Amount Paid'].includes(h)?'right':'left' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 && (
                  <tr><td colSpan={12} style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No VAT payments recorded yet</td></tr>
                )}
                {payments.map(p => (
                  <tr key={p.id}>
                    <td style={S.td}><strong>{p.payment_date}</strong></td>
                    <td style={S.td}><span style={{ background:'#f0f4f8', borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{p.vat_period||'—'}</span></td>
                    <td style={{ ...S.td, fontSize:11, color:'#6b7c93', whiteSpace:'nowrap' }}>{p.period_from} → {p.period_to}</td>
                    <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace' }}>{fmt(p.output_vat)}</td>
                    <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:'#1a7f4b' }}>{fmt(p.input_vat)}</td>
                    <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:'#c0392b', fontWeight:700 }}>{fmt(p.net_vat_payable)}</td>
                    <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', fontWeight:800, color:'#1a2e3d' }}>{fmt(p.amount_paid)}</td>
                    <td style={{ ...S.td, fontSize:11 }}>{p.bank_accounts?.account_name||'—'}</td>
                    <td style={{ ...S.td, fontSize:11, color:'#6b7c93' }}>{p.reference_number||'—'}</td>
                    <td style={{ ...S.td, fontSize:11, color:'#6b7c93' }}>{p.filing_number||'—'}</td>
                    <td style={S.td}>{statusBadge(p.status)}</td>
                    <td style={S.td}>
                      <button onClick={()=>openEdit(p)} style={{ ...S.btn('#e8edf5','#2d3a45'), padding:'4px 12px', fontSize:11 }}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {payments.length > 0 && (
                <tfoot>
                  <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                    <td colSpan={6} style={{ padding:'10px 12px', fontWeight:800 }}>TOTAL PAID TO ZATCA</td>
                    <td style={{ padding:'10px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:900, color:'#a8e6c3' }}>SAR {fmt(totalPaid)}</td>
                    <td colSpan={5}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
          <div style={S.modal}>
            <div style={{ background:'#1a2e3d', color:'#fff', padding:'18px 24px', fontWeight:800, fontSize:15 }}>
              {editId ? 'Edit VAT Payment' : 'Record VAT Payment to ZATCA'}
            </div>
            <div style={{ padding:24 }}>
              {err && <div style={{ background:'#fdecea', color:'#c0392b', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>{err}</div>}

              {/* VAT Period */}
              <div style={{ background:'#f8faff', border:'1.5px solid #e8edf5', borderRadius:10, padding:'14px 16px', marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:0.8, color:'#6b7c93', marginBottom:10 }}>VAT Period</div>
                <div style={S.row}>
                  <div style={S.col}>
                    <label style={S.label}>Period From *</label>
                    <input style={S.inp} type="date" value={form.period_from} onChange={e=>setForm(f=>({...f,period_from:e.target.value, vat_period:e.target.value?.slice(0,7)||f.vat_period}))} />
                  </div>
                  <div style={S.col}>
                    <label style={S.label}>Period To *</label>
                    <input style={S.inp} type="date" value={form.period_to} onChange={e=>setForm(f=>({...f,period_to:e.target.value}))} />
                  </div>
                  <div style={{ width:130 }}>
                    <label style={S.label}>VAT Period Label</label>
                    <input style={S.inp} value={form.vat_period} onChange={e=>setForm(f=>({...f,vat_period:e.target.value}))} placeholder="2026-07" />
                  </div>
                </div>
              </div>

              {/* VAT Amounts */}
              <div style={{ background:'#f8faff', border:'1.5px solid #e8edf5', borderRadius:10, padding:'14px 16px', marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:0.8, color:'#6b7c93', marginBottom:10 }}>VAT Amounts (SAR)</div>
                <div style={S.row}>
                  <div style={S.col}>
                    <label style={S.label}>Output VAT (Sales)</label>
                    <input style={S.inp} type="number" step="0.01" value={form.output_vat} onChange={e=>{
                      const out = +e.target.value||0, inp = +form.input_vat||0
                      setForm(f=>({...f, output_vat:e.target.value, net_vat_payable:String((out-inp).toFixed(2)), amount_paid:String((out-inp).toFixed(2))}))
                    }} />
                  </div>
                  <div style={S.col}>
                    <label style={S.label}>Input VAT (Purchases)</label>
                    <input style={S.inp} type="number" step="0.01" value={form.input_vat} onChange={e=>{
                      const inp = +e.target.value||0, out = +form.output_vat||0
                      setForm(f=>({...f, input_vat:e.target.value, net_vat_payable:String((out-inp).toFixed(2)), amount_paid:String((out-inp).toFixed(2))}))
                    }} />
                  </div>
                  <div style={S.col}>
                    <label style={S.label}>Net VAT Payable</label>
                    <input style={S.inp} type="number" step="0.01" value={form.net_vat_payable} onChange={e=>setForm(f=>({...f,net_vat_payable:e.target.value}))} />
                  </div>
                </div>
              </div>

              {/* Payment details */}
              <div style={{ background:'#f8faff', border:'1.5px solid #e8edf5', borderRadius:10, padding:'14px 16px', marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:0.8, color:'#6b7c93', marginBottom:10 }}>Payment Details</div>
                <div style={S.row}>
                  <div style={S.col}>
                    <label style={S.label}>Payment Date *</label>
                    <input style={S.inp} type="date" value={form.payment_date} onChange={e=>setForm(f=>({...f,payment_date:e.target.value}))} />
                  </div>
                  <div style={S.col}>
                    <label style={S.label}>Amount Paid (SAR) *</label>
                    <input style={S.inp} type="number" step="0.01" value={form.amount_paid} onChange={e=>setForm(f=>({...f,amount_paid:e.target.value}))} />
                  </div>
                </div>
                <div style={S.row}>
                  <div style={S.col}>
                    <label style={S.label}>Paid From Bank Account</label>
                    <select style={S.inp} value={form.bank_account_id} onChange={e=>setForm(f=>({...f,bank_account_id:e.target.value}))}>
                      <option value="">— Select bank account —</option>
                      {bankAccts.map(b=>(
                        <option key={b.id} value={b.id}>{b.account_name}{b.bank_name?` (${b.bank_name})`:''}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ width:130 }}>
                    <label style={S.label}>Status</label>
                    <select style={S.inp} value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                      <option value="PAID">Paid</option>
                      <option value="REFUND_CLAIMED">Refund Claimed</option>
                    </select>
                  </div>
                </div>
                <div style={S.row}>
                  <div style={S.col}>
                    <label style={S.label}>Bank Reference / TRN</label>
                    <input style={S.inp} value={form.reference_number} onChange={e=>setForm(f=>({...f,reference_number:e.target.value}))} placeholder="Bank transaction reference" />
                  </div>
                  <div style={S.col}>
                    <label style={S.label}>ZATCA Filing Number</label>
                    <input style={S.inp} value={form.filing_number} onChange={e=>setForm(f=>({...f,filing_number:e.target.value}))} placeholder="ZATCA return filing number" />
                  </div>
                </div>
                <div>
                  <label style={S.label}>Notes</label>
                  <textarea style={{ ...S.inp, height:50, resize:'vertical' }} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
                </div>
              </div>

              {!editId && (
                <div style={{ background:'#e8f5e9', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#2e7d32' }}>
                  ✓ Saving will auto-post: <strong>Dr VAT Payable (2210) / Cr Bank Account</strong>
                </div>
              )}

              <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                <button style={S.btn('#e8edf5','#2d3a45')} onClick={()=>setShowModal(false)}>Cancel</button>
                <button style={S.btn('#1a7f4b')} onClick={save} disabled={saving}>{saving?'Saving…':'Save VAT Payment'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
