const L1 = '#B4BA95'
const L2 = '#F5F6EB'
const L3 = '#606D2C'
const PP = "'Poppins', sans-serif"
import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import FormShell from '../components/FormShell'
import { GROUP_COLORS, kpiCardGradient } from '../styles/appStyles'
/**
 * VATPayment.jsx — ZATCA VAT Payment Recording
 * Records VAT payments made to ZATCA and auto-posts the journal entry:
 *   Dr  2210  VAT Payable    (clears the liability)
 *   Cr  Bank Account         (reduces bank balance)
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { postVATPaymentJE } from '../lib/autoPost'

const S = {
  inp:   { width:'100%', padding:'11px 13px', borderRadius:4, border:'1.5px solid #dde3ec', fontSize:14, outline:'none', fontFamily:"'Poppins',sans-serif", boxSizing:'border-box', marginBottom:14 },
  label: { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:5, textTransform:'uppercase', letterSpacing:0.4 },
  row2:  { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
  row3:  { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 },
  addBtn:{ background:L3, color:'#fff', border:'none', borderRadius:4, padding:'10px 22px', cursor:'pointer', fontSize:14, fontWeight:700, fontFamily:"'Poppins',sans-serif" },
  th:    { padding:'9px 12px', textAlign:'left', fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:0.4, background:L3, color:'#fff', whiteSpace:'nowrap' },
  td:    { padding:'9px 12px', fontSize:12, color:'#2d3a45', borderBottom:'1px solid #f0f4f8', verticalAlign:'middle' },
  err:   { background:'#ffebee', color:'#c62828', borderRadius:4, padding:'10px 13px', fontSize:13, marginBottom:12 },
  secHead:{ fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:0.8, color:'#6b7c93', marginBottom:10 },
  secBox:{ background:'#f8faff', border:'1.5px solid #e8edf5', borderRadius:4, padding:'14px 16px', marginBottom:16 },
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
  const [showBanner, setShowBanner] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [editId, setEditId]       = useState(null)
  const [saving, setSaving]       = useState(false)
  const [err, setErr]             = useState('')
  const [vatPos, setVatPos]       = useState(null)

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

  useEffect(() => {
    async function computeVATPosition() {
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

      const totalCr = (lines||[]).reduce((s,l) => s + (+l.credit_amount||0), 0)
      const totalDr = (lines||[]).reduce((s,l) => s + (+l.debit_amount ||0), 0)
      setVatPos({ outputVAT: totalCr, paidToDate: totalDr, balance: totalCr - totalDr })
    }
    computeVATPosition()
  }, [entityId, payments])

  function openNew() {
    let f = { ...EMPTY_FORM }
    if (vatPos) {
      f.output_vat      = String(vatPos.outputVAT.toFixed(2))
      f.net_vat_payable = String(vatPos.balance.toFixed(2))
      f.amount_paid     = String(vatPos.balance.toFixed(2))
    }
    setForm(f)
    setEditId(null)
    setErr('')
    setShowBanner(true)
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
    setWizardStep(1)
    setShowModal(true)
  }

  function closeModal() { setShowModal(false); setErr(''); setWizardStep(1) }

  async function save() {
    if (!form.payment_date)  { setErr('Payment date is required'); return }
    if (!form.amount_paid || +form.amount_paid <= 0) { setErr('Amount paid is required'); return }
    if (!form.period_from || !form.period_to) { setErr('VAT period (from / to) is required'); return }

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

    if (!editId && result?.id) {
      const bank = bankAccts.find(b => b.id === form.bank_account_id)
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
    }

    setSaving(false)
    closeModal()
    load()
  }

  const vatStatusBadge = s => {
    const map = { PAID:['#e8f5e9','#2e7d32'], REFUND_CLAIMED:['#e3f2fd','#1565c0'] }
    const [bg,fg] = map[s]||['#f5f5f5','#555']
    return <span style={{ background:bg, color:fg, padding:'2px 8px', borderRadius:12, fontSize:11, fontWeight:700 }}>{s?.replace(/_/g,' ')}</span>
  }

  const totalPaid = payments.reduce((s,p) => s + (+p.amount_paid||0), 0)
  const STEPS = ['VAT Period & Amounts', 'Payment Details']

  const kpiData = [
    { label:'Output VAT Charged',  value: `SAR ${fmt(vatPos?.outputVAT||0)}`,  sub:'From issued invoices' },
    { label:'VAT Paid to ZATCA',   value: `SAR ${fmt(vatPos?.paidToDate||0)}`, sub:'Total payments made' },
    { label:'VAT Balance Due',     value: `SAR ${fmt(vatPos?.balance||0)}`,    sub:'Output minus paid' },
    { label:'Total Payments',      value: `SAR ${fmt(totalPaid)}`,             sub:`${payments.length} filing${payments.length!==1?'s':''}` },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden', background:L2, fontFamily:PP }}>
      {/* UPPER ZONE */}
      <div style={{ flexShrink:0, background:L2, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', zIndex:10 }}>
        <div style={{ padding:'6px 28px 0' }}>
          <div style={{ background:L1, padding:'8px 16px', borderRadius:'6px 6px 0 0', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#fff' }}>🧾 VAT Payments</div>
              <div style={{ fontSize:10, color:'#fff', opacity:0.8 }}>ZATCA VAT filing — auto-posts Dr VAT Payable / Cr Bank</div>
            </div>
            <button style={{ background:L3, color:'#fff', border:'none', borderRadius:7, padding:'7px 16px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:PP }} onClick={openNew}>+ Record VAT Payment</button>
          </div>
        </div>
        {/* KPI Cards */}
        <div style={{ padding:'10px 28px 12px', display:'flex', gap:10, flexWrap:'wrap' }}>
          {kpiData.map((k,i)=>{
            const g = kpiCardGradient(i,L1,L2,L3)
            return (
              <div key={k.label} style={{ ...g, width:160, height:62, borderRadius:10, padding:'0 14px', flexShrink:0, boxShadow:'0 2px 8px rgba(0,0,0,0.10)', display:'flex', flexDirection:'column', justifyContent:'center' }}>
                <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', opacity:0.75, marginBottom:2 }}>{k.label}</div>
                <div style={{ fontSize:14, fontWeight:800, lineHeight:1 }}>{k.value}</div>
                <div style={{ fontSize:9, opacity:0.7, marginTop:2 }}>{k.sub}</div>
              </div>
            )
          })}
        </div>
      </div>
      {/* SCROLL ZONE */}
      <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:'0 28px 22px' }}>
      {/* Payments table */}
      <div style={{ background:'#fff', borderRadius:'0 0 8px 8px', boxShadow:'0 2px 8px rgba(0,0,0,0.08)', overflow:'hidden', marginTop:0 }}>
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
                    <td style={S.td}><span style={{ background:'#f0f4f8', borderRadius:4, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{p.vat_period||'—'}</span></td>
                    <td style={{ ...S.td, fontSize:11, color:'#6b7c93', whiteSpace:'nowrap' }}>{p.period_from} → {p.period_to}</td>
                    <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace' }}>{fmt(p.output_vat)}</td>
                    <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:L3 }}>{fmt(p.input_vat)}</td>
                    <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color:'#c0392b', fontWeight:700 }}>{fmt(p.net_vat_payable)}</td>
                    <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', fontWeight:800, color:'#1a2e3d' }}>{fmt(p.amount_paid)}</td>
                    <td style={{ ...S.td, fontSize:11 }}>{p.bank_accounts?.account_name||'—'}</td>
                    <td style={{ ...S.td, fontSize:11, color:'#6b7c93' }}>{p.reference_number||'—'}</td>
                    <td style={{ ...S.td, fontSize:11, color:'#6b7c93' }}>{p.filing_number||'—'}</td>
                    <td style={S.td}>{vatStatusBadge(p.status)}</td>
                    <td style={S.td}>
                      <button onClick={()=>openEdit(p)} style={{ background:'#f0f2f5', color:'#2d3a45', border:'none', borderRadius:4, padding:'4px 12px', cursor:'pointer', fontSize:11 }}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {payments.length > 0 && (
                <tfoot>
                  <tr style={{ background:L3, color:'#fff' }}>
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

      {/* ── Page Banner ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); setWizardStep(1); setShowModal(true) }}
        chapterName="Accounting"
        formTitle={['Record', 'VAT', 'Payment']}
        workflowSteps={STEPS}
        iconLabel="VAT Payments"
        description="Record a ZATCA VAT payment. Automatically posts Dr VAT Payable (2210) / Cr Bank on save."
      />

      {/* ── FormShell ── */}
      <FormShell
        isOpen={showModal}
        onClose={closeModal}
        chapterName="Accounting"
        title={editId ? ['Edit', 'VAT', 'Payment'] : ['Record', 'VAT', 'Payment']}
        steps={STEPS}
        currentStep={wizardStep}
        onBack={wizardStep === 1 ? closeModal : () => setWizardStep(s => s - 1)}
        backLabel={wizardStep === 1 ? 'Cancel' : 'Back'}
        onNext={() => {
          if (wizardStep < STEPS.length) {
            if (!form.period_from || !form.period_to) { setErr('VAT period (from / to) is required'); return }
            setErr(''); setWizardStep(s => s + 1)
          } else { save() }
        }}
        nextLabel={wizardStep < STEPS.length ? 'Next →' : (saving ? 'Saving…' : editId ? 'Save Changes' : 'Save VAT Payment')}
        nextDisabled={saving}
        subjectLabel={form.period_from ? { line1: (() => { const m=parseInt((form.period_from||'').slice(5,7),10); return m<=3?'Q1':m<=6?'Q2':m<=9?'Q3':'Q4' })(), line2: form.net_vat_payable ? `SAR ${parseFloat(form.net_vat_payable).toLocaleString()}` : null } : null}
      >
        {err && <div style={S.err}>{err}</div>}

        {wizardStep === 1 && (
          <div>
            <div style={S.secBox}>
              <div style={S.secHead}>VAT Period</div>
              <div style={S.row3}>
                <div>
                  <label style={S.label}>Period From *</label>
                  <input style={S.inp} type="date" value={form.period_from} onChange={e=>setForm(f=>({...f,period_from:e.target.value, vat_period:e.target.value?.slice(0,7)||f.vat_period}))} />
                </div>
                <div>
                  <label style={S.label}>Period To *</label>
                  <input style={S.inp} type="date" value={form.period_to} onChange={e=>setForm(f=>({...f,period_to:e.target.value}))} />
                </div>
                <div>
                  <label style={S.label}>VAT Period Label</label>
                  <input style={S.inp} value={form.vat_period} onChange={e=>setForm(f=>({...f,vat_period:e.target.value}))} placeholder="2026-07" />
                </div>
              </div>
            </div>

            <div style={S.secBox}>
              <div style={S.secHead}>VAT Amounts (SAR)</div>
              <div style={S.row3}>
                <div>
                  <label style={S.label}>Output VAT (Sales)</label>
                  <input style={S.inp} type="number" step="0.01" value={form.output_vat} onChange={e=>{
                    const out = +e.target.value||0, inp = +form.input_vat||0
                    setForm(f=>({...f, output_vat:e.target.value, net_vat_payable:String((out-inp).toFixed(2)), amount_paid:String((out-inp).toFixed(2))}))
                  }} />
                </div>
                <div>
                  <label style={S.label}>Input VAT (Purchases)</label>
                  <input style={S.inp} type="number" step="0.01" value={form.input_vat} onChange={e=>{
                    const inp = +e.target.value||0, out = +form.output_vat||0
                    setForm(f=>({...f, input_vat:e.target.value, net_vat_payable:String((out-inp).toFixed(2)), amount_paid:String((out-inp).toFixed(2))}))
                  }} />
                </div>
                <div>
                  <label style={S.label}>Net VAT Payable</label>
                  <input style={S.inp} type="number" step="0.01" value={form.net_vat_payable} onChange={e=>setForm(f=>({...f,net_vat_payable:e.target.value}))} />
                </div>
              </div>
            </div>
          </div>
        )}

        {wizardStep === 2 && (
          <div>
            <div style={S.row2}>
              <div>
                <label style={S.label}>Payment Date *</label>
                <input style={S.inp} type="date" value={form.payment_date} onChange={e=>setForm(f=>({...f,payment_date:e.target.value}))} />
              </div>
              <div>
                <label style={S.label}>Amount Paid (SAR) *</label>
                <input style={S.inp} type="number" step="0.01" value={form.amount_paid} onChange={e=>setForm(f=>({...f,amount_paid:e.target.value}))} />
              </div>
            </div>
            <div style={S.row2}>
              <div>
                <label style={S.label}>Paid From Bank Account</label>
                <select style={S.inp} value={form.bank_account_id} onChange={e=>setForm(f=>({...f,bank_account_id:e.target.value}))}>
                  <option value="">— Select bank account —</option>
                  {bankAccts.map(b=>(
                    <option key={b.id} value={b.id}>{b.account_name}{b.bank_name?` (${b.bank_name})`:''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={S.label}>Status</label>
                <select style={S.inp} value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                  <option value="PAID">Paid</option>
                  <option value="REFUND_CLAIMED">Refund Claimed</option>
                </select>
              </div>
            </div>
            <div style={S.row2}>
              <div>
                <label style={S.label}>Bank Reference / TRN</label>
                <input style={S.inp} value={form.reference_number} onChange={e=>setForm(f=>({...f,reference_number:e.target.value}))} placeholder="Bank transaction reference" />
              </div>
              <div>
                <label style={S.label}>ZATCA Filing Number</label>
                <input style={S.inp} value={form.filing_number} onChange={e=>setForm(f=>({...f,filing_number:e.target.value}))} placeholder="ZATCA return filing number" />
              </div>
            </div>
            <label style={S.label}>Notes</label>
            <textarea style={{ ...S.inp, height:70, resize:'vertical' }} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
            {!editId && (
              <div style={{ background:'#e8f5e9', borderRadius:4, padding:'10px 14px', fontSize:12, color:'#2e7d32' }}>
                ✓ Saving will auto-post: <strong>Dr VAT Payable (2210) / Cr Bank Account</strong>
              </div>
            )}
          </div>
        )}
      </FormShell>
      </div>{/* end scroll zone */}
    </div>
  )
}
