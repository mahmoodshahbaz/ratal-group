/**
 * FormCashPayment.jsx — Cash Payment Voucher Form
 * Mobile-first, shareable link — no login required
 *
 * 4 steps:
 *   1. Party Details    — who receives the payment
 *   2. Payment Details  — amount, purpose, project/site ref
 *   3. Documentation    — receipt type + Drive uploads
 *   4. Review & Submit  — summary → insert to DB
 */

import { useState, useCallback } from 'react'
import { createClient }          from '@supabase/supabase-js'
import { useDriveUpload }        from '../hooks/useDriveUpload'

const SUPA_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
const sb = createClient(SUPA_URL, SUPA_ANON)

// ── Theme ─────────────────────────────────────────────────────────────────────
const C = {
  bg:        '#0a1628',
  card:      '#111e35',
  border:    '#1e3050',
  accent:    '#8C354B',
  accentLt:  '#c45070',
  text:      '#e8eaf0',
  muted:     '#7a8aaa',
  input:     '#162040',
  success:   '#2e7d32',
  error:     '#c62828',
  warn:      '#e65100',
  step:      '#1e3050',
  stepActive:'#8C354B',
}

// ── Party types ───────────────────────────────────────────────────────────────
const PARTY_TYPES = [
  { value:'COMPANY',    label:'Company',    labelAr:'شركة',   icon:'🏢', desc:'CR + VAT credentials' },
  { value:'INDIVIDUAL', label:'Individual', labelAr:'فرد',    icon:'👤', desc:'Iqama + mobile' },
  { value:'INFORMAL',   label:'Informal',   labelAr:'غير رسمي',icon:'🤝', desc:'No formal credentials' },
]

// ── Receipt types ─────────────────────────────────────────────────────────────
const RECEIPT_TYPES = [
  { value:'VAT_INVOICE',    label:'VAT Invoice',      labelAr:'فاتورة ضريبية', icon:'🧾', needsDoc:true },
  { value:'SIMPLIFIED_TAX', label:'Simplified Tax',   labelAr:'ضريبة مبسطة',   icon:'📄', needsDoc:true },
  { value:'INFORMAL_RECEIPT',label:'Informal Receipt',labelAr:'إيصال غير رسمي',icon:'📝', needsDoc:false },
  { value:'NO_RECEIPT',      label:'No Receipt',      labelAr:'لا يوجد إيصال', icon:'❌', needsDoc:false },
]

const STEPS = ['Party', 'Payment', 'Docs', 'Review']

// ─────────────────────────────────────────────────────────────────────────────
export default function FormCashPayment() {
  const [step, setStep]     = useState(0)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(null) // voucher_number on success

  // ── Form data ────────────────────────────────────────────────────────────
  const [party, setParty] = useState({
    type:         'COMPANY',
    name:         '',
    cr_number:    '',
    vat_number:   '',
    iqama_number: '',
    mobile:       '',
  })

  const [payment, setPayment] = useState({
    amount:       '',
    purpose:      '',
    project_ref:  '',
    site_ref:     '',
    payment_date: new Date().toISOString().slice(0, 10),
    dh_name:      '',
    dh_approval_ref: '',
  })

  const [docs, setDocs] = useState({
    receipt_type:     'VAT_INVOICE',
    justification:    '',
    iqama_photo_url:  '',
    iqama_photo_name: '',
    document_url:     '',
    document_name:    '',
  })

  const { upload, uploading } = useDriveUpload()

  // ── Validation ────────────────────────────────────────────────────────────
  const validateStep = useCallback(() => {
    const e = {}

    if (step === 0) {
      if (!party.name.trim())             e.name = 'Name is required'
      if (party.type === 'INDIVIDUAL' && !party.iqama_number.trim())
                                          e.iqama_number = 'Iqama number required'
    }

    if (step === 1) {
      if (!payment.amount || isNaN(+payment.amount) || +payment.amount <= 0)
                                          e.amount = 'Valid amount required'
      if (!payment.purpose.trim())        e.purpose = 'Purpose / description required'
      if (!payment.payment_date)          e.payment_date = 'Payment date required'
    }

    if (step === 2) {
      const needsJust = docs.receipt_type === 'NO_RECEIPT' ||
                        docs.receipt_type === 'INFORMAL_RECEIPT' ||
                        party.type === 'INFORMAL'
      if (needsJust && !docs.justification.trim())
                                          e.justification = 'Justification required for this receipt type / party'
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }, [step, party, payment, docs])

  const nextStep = () => { if (validateStep()) setStep(s => s + 1) }
  const prevStep = () => { setErrors({}); setStep(s => s - 1) }

  // ── Drive upload helpers ──────────────────────────────────────────────────
  const handleIqamaUpload = async (file) => {
    const res = await upload(file, 'vouchers', `IQAMA_${party.iqama_number || 'UNK'}`)
    if (res) setDocs(d => ({ ...d, iqama_photo_url: res.viewUrl, iqama_photo_name: file.name }))
  }

  const handleDocUpload = async (file) => {
    const res = await upload(file, 'vouchers', `CPV_DOC`)
    if (res) setDocs(d => ({ ...d, document_url: res.viewUrl, document_name: file.name }))
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      // Generate voucher number
      const { data: numData } = await sb.rpc('next_cpv_number')
      const voucher_number = numData || `CPV-${Date.now()}`

      const row = {
        voucher_number,
        payment_date:        payment.payment_date,
        party_type:          party.type,
        party_name:          party.name.trim(),
        party_cr_number:     party.type === 'COMPANY'    ? party.cr_number.trim()    || null : null,
        party_vat_number:    party.type === 'COMPANY'    ? party.vat_number.trim()   || null : null,
        party_iqama_number:  party.type === 'INDIVIDUAL' ? party.iqama_number.trim() || null : null,
        party_mobile:        party.mobile.trim() || null,
        amount:              +payment.amount,
        purpose:             payment.purpose.trim(),
        project_ref:         payment.project_ref.trim() || null,
        site_ref:            payment.site_ref.trim()    || null,
        dh_name:             payment.dh_name.trim()     || null,
        dh_approval_ref:     payment.dh_approval_ref.trim() || null,
        receipt_type:        docs.receipt_type,
        justification:       docs.justification.trim()  || null,
        iqama_photo_url:     docs.iqama_photo_url       || null,
        document_url:        docs.document_url          || null,
        status:              'SUBMITTED',
      }

      const { error } = await sb.from('cash_payment_vouchers').insert(row)
      if (error) throw error
      setSubmitted(voucher_number)
    } catch (err) {
      setErrors({ submit: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div style={sPage}>
        <div style={{ ...sCard, textAlign:'center', padding:'40px 24px' }}>
          <div style={{ fontSize:64, marginBottom:16 }}>✅</div>
          <h2 style={{ color:C.text, margin:'0 0 8px', fontSize:22 }}>Submitted!</h2>
          <p style={{ color:C.muted, margin:'0 0 24px', fontSize:14 }}>
            Your cash payment voucher has been recorded.
          </p>
          <div style={{ background:C.accentLt, borderRadius:8, padding:'12px 20px', display:'inline-block' }}>
            <span style={{ color:'#fff', fontWeight:700, fontSize:18, letterSpacing:1 }}>{submitted}</span>
          </div>
          <p style={{ color:C.muted, fontSize:13, marginTop:20 }}>
            Keep this reference number for your records.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{ ...sBtnPrimary, marginTop:24, width:'100%' }}
          >
            Submit Another
          </button>
        </div>
      </div>
    )
  }

  // ── Page ──────────────────────────────────────────────────────────────────
  return (
    <div style={sPage}>
      {/* Header */}
      <div style={sHeader}>
        <div style={{ fontSize:28 }}>💵</div>
        <div>
          <h1 style={{ margin:0, fontSize:18, color:C.text, fontWeight:700 }}>Cash Payment Voucher</h1>
          <p style={{ margin:0, fontSize:12, color:C.muted }}>سند صرف نقدي</p>
        </div>
      </div>

      {/* Step indicator */}
      <div style={sStepBar}>
        {STEPS.map((label, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <div style={{
              width:28, height:28, borderRadius:'50%',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:12, fontWeight:700,
              background: i < step ? C.success : i === step ? C.accent : C.step,
              color:'#fff', flexShrink:0,
            }}>
              {i < step ? '✓' : i + 1}
            </div>
            <span style={{ fontSize:11, color: i === step ? C.accentLt : C.muted, marginLeft:4, whiteSpace:'nowrap' }}>
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div style={{ flex:1, height:1, background: i < step ? C.success : C.border, margin:'0 8px' }} />
            )}
          </div>
        ))}
      </div>

      {/* Step 0 — Party Details */}
      {step === 0 && (
        <div style={sCard}>
          <h3 style={sCardTitle}>Party Details — من يستلم الدفعة</h3>

          <label style={sLabel}>Party Type</label>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
            {PARTY_TYPES.map(pt => (
              <button
                key={pt.value}
                onClick={() => setParty(p => ({ ...p, type: pt.value }))}
                style={{
                  ...sRadioBtn,
                  borderColor: party.type === pt.value ? C.accent : C.border,
                  background:  party.type === pt.value ? '#1e1030' : C.input,
                }}
              >
                <span style={{ fontSize:20 }}>{pt.icon}</span>
                <div style={{ textAlign:'left' }}>
                  <div style={{ color:C.text, fontWeight:600, fontSize:14 }}>
                    {pt.label} <span style={{ color:C.muted, fontSize:12 }}>/ {pt.labelAr}</span>
                  </div>
                  <div style={{ color:C.muted, fontSize:12 }}>{pt.desc}</div>
                </div>
                {party.type === pt.value && (
                  <span style={{ marginLeft:'auto', color:C.accent, fontSize:18 }}>●</span>
                )}
              </button>
            ))}
          </div>

          <Field label="Name / Full Name" labelAr="الاسم" required
            value={party.name}
            onChange={v => setParty(p => ({ ...p, name: v }))}
            error={errors.name}
            placeholder={party.type === 'COMPANY' ? 'Company registered name' : 'Full name as per ID'}
          />

          {party.type === 'COMPANY' && (
            <>
              <Field label="CR Number" labelAr="السجل التجاري"
                value={party.cr_number}
                onChange={v => setParty(p => ({ ...p, cr_number: v }))}
                placeholder="10-digit CR number"
              />
              <Field label="VAT Number" labelAr="الرقم الضريبي"
                value={party.vat_number}
                onChange={v => setParty(p => ({ ...p, vat_number: v }))}
                placeholder="15-digit VAT number (optional)"
              />
            </>
          )}

          {party.type === 'INDIVIDUAL' && (
            <Field label="Iqama / National ID" labelAr="الإقامة / الهوية" required
              value={party.iqama_number}
              onChange={v => setParty(p => ({ ...p, iqama_number: v }))}
              error={errors.iqama_number}
              placeholder="10-digit Iqama or Saudi ID"
            />
          )}

          <Field label="Mobile Number" labelAr="رقم الجوال"
            value={party.mobile}
            onChange={v => setParty(p => ({ ...p, mobile: v }))}
            placeholder="+966 5X XXX XXXX (optional)"
            type="tel"
          />
        </div>
      )}

      {/* Step 1 — Payment Details */}
      {step === 1 && (
        <div style={sCard}>
          <h3 style={sCardTitle}>Payment Details — تفاصيل الدفعة</h3>

          <Field label="Amount (SAR)" labelAr="المبلغ" required
            value={payment.amount}
            onChange={v => setPayment(p => ({ ...p, amount: v }))}
            error={errors.amount}
            type="number"
            placeholder="0.00"
          />

          <label style={sLabel}>Purpose / Description <span style={{ color:C.muted }}>الغرض</span> <span style={{ color:C.accent }}>*</span></label>
          <textarea
            value={payment.purpose}
            onChange={e => setPayment(p => ({ ...p, purpose: e.target.value }))}
            placeholder="Describe what this payment is for…"
            rows={3}
            style={{ ...sInput, resize:'vertical', minHeight:80 }}
          />
          {errors.purpose && <p style={sError}>{errors.purpose}</p>}

          <Field label="Payment Date" labelAr="تاريخ الدفع" required
            value={payment.payment_date}
            onChange={v => setPayment(p => ({ ...p, payment_date: v }))}
            error={errors.payment_date}
            type="date"
          />

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Project Ref" labelAr="المشروع"
              value={payment.project_ref}
              onChange={v => setPayment(p => ({ ...p, project_ref: v }))}
              placeholder="P-2026-XXX"
            />
            <Field label="Site Ref" labelAr="الموقع"
              value={payment.site_ref}
              onChange={v => setPayment(p => ({ ...p, site_ref: v }))}
              placeholder="S-XXX / Job#"
            />
          </div>

          <Field label="DH Name" labelAr="مسؤول الموقع"
            value={payment.dh_name}
            onChange={v => setPayment(p => ({ ...p, dh_name: v }))}
            placeholder="Approving District Head"
          />
          <Field label="DH Approval Ref" labelAr="مرجع الاعتماد"
            value={payment.dh_approval_ref}
            onChange={v => setPayment(p => ({ ...p, dh_approval_ref: v }))}
            placeholder="WhatsApp msg / email ref (optional)"
          />
        </div>
      )}

      {/* Step 2 — Documentation */}
      {step === 2 && (
        <div style={sCard}>
          <h3 style={sCardTitle}>Documentation — المستندات</h3>

          <label style={sLabel}>Receipt Type <span style={{ color:C.muted }}>نوع الإيصال</span></label>
          <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
            {RECEIPT_TYPES.map(rt => (
              <button
                key={rt.value}
                onClick={() => setDocs(d => ({ ...d, receipt_type: rt.value }))}
                style={{
                  ...sRadioBtn,
                  borderColor: docs.receipt_type === rt.value ? C.accent : C.border,
                  background:  docs.receipt_type === rt.value ? '#1e1030' : C.input,
                }}
              >
                <span style={{ fontSize:20 }}>{rt.icon}</span>
                <div style={{ textAlign:'left' }}>
                  <div style={{ color:C.text, fontWeight:600, fontSize:14 }}>
                    {rt.label} <span style={{ color:C.muted, fontSize:12 }}>/ {rt.labelAr}</span>
                  </div>
                </div>
                {docs.receipt_type === rt.value && (
                  <span style={{ marginLeft:'auto', color:C.accent, fontSize:18 }}>●</span>
                )}
              </button>
            ))}
          </div>

          {/* Receipt / Invoice document upload */}
          {RECEIPT_TYPES.find(r => r.value === docs.receipt_type)?.needsDoc && (
            <UploadField
              label="Receipt / Invoice Photo"
              labelAr="صورة الإيصال"
              hint="JPG, PNG or PDF — max 10 MB"
              fileName={docs.document_name}
              onFile={handleDocUpload}
              uploading={uploading}
            />
          )}

          {/* Iqama upload for INDIVIDUAL */}
          {party.type === 'INDIVIDUAL' && (
            <UploadField
              label="Iqama / ID Photo"
              labelAr="صورة الإقامة"
              hint="Photo of front of Iqama — max 10 MB"
              fileName={docs.iqama_photo_name}
              onFile={handleIqamaUpload}
              uploading={uploading}
            />
          )}

          {/* Justification — required for certain cases */}
          {(docs.receipt_type === 'NO_RECEIPT' ||
            docs.receipt_type === 'INFORMAL_RECEIPT' ||
            party.type === 'INFORMAL') && (
            <>
              <label style={sLabel}>
                Justification <span style={{ color:C.muted }}>المبرر</span>{' '}
                <span style={{ color:C.accent }}>*</span>
              </label>
              <textarea
                value={docs.justification}
                onChange={e => setDocs(d => ({ ...d, justification: e.target.value }))}
                placeholder="Explain why no formal receipt or why payment is to an informal party…"
                rows={4}
                style={{ ...sInput, resize:'vertical', minHeight:100 }}
              />
              {errors.justification && <p style={sError}>{errors.justification}</p>}
            </>
          )}

          {/* Optional justification for other cases */}
          {docs.receipt_type !== 'NO_RECEIPT' &&
           docs.receipt_type !== 'INFORMAL_RECEIPT' &&
           party.type !== 'INFORMAL' && (
            <>
              <label style={sLabel}>Notes <span style={{ color:C.muted }}>ملاحظات</span> (optional)</label>
              <textarea
                value={docs.justification}
                onChange={e => setDocs(d => ({ ...d, justification: e.target.value }))}
                placeholder="Any additional notes…"
                rows={2}
                style={{ ...sInput, resize:'vertical' }}
              />
            </>
          )}
        </div>
      )}

      {/* Step 3 — Review */}
      {step === 3 && (
        <div style={sCard}>
          <h3 style={sCardTitle}>Review & Submit — مراجعة وإرسال</h3>

          <ReviewRow label="Party Type"      value={PARTY_TYPES.find(p => p.value === party.type)?.label} />
          <ReviewRow label="Name"            value={party.name} />
          {party.type === 'COMPANY' && party.cr_number && (
            <ReviewRow label="CR Number"     value={party.cr_number} />
          )}
          {party.type === 'INDIVIDUAL' && (
            <ReviewRow label="Iqama"         value={party.iqama_number} />
          )}
          {party.mobile && <ReviewRow label="Mobile"   value={party.mobile} />}

          <div style={{ borderTop:`1px solid ${C.border}`, margin:'12px 0' }} />

          <ReviewRow label="Amount (SAR)"    value={Number(payment.amount).toLocaleString('en-SA', { minimumFractionDigits:2 })} highlight />
          <ReviewRow label="Purpose"         value={payment.purpose} />
          <ReviewRow label="Payment Date"    value={payment.payment_date} />
          {payment.project_ref && <ReviewRow label="Project"   value={payment.project_ref} />}
          {payment.site_ref    && <ReviewRow label="Site"      value={payment.site_ref} />}
          {payment.dh_name     && <ReviewRow label="DH Name"   value={payment.dh_name} />}

          <div style={{ borderTop:`1px solid ${C.border}`, margin:'12px 0' }} />

          <ReviewRow label="Receipt Type"    value={RECEIPT_TYPES.find(r => r.value === docs.receipt_type)?.label} />
          {docs.document_name  && <ReviewRow label="Document"  value={`📎 ${docs.document_name}`} />}
          {docs.iqama_photo_name && <ReviewRow label="ID Photo" value={`📎 ${docs.iqama_photo_name}`} />}
          {docs.justification  && <ReviewRow label="Notes"     value={docs.justification} />}

          {errors.submit && (
            <div style={{ background:'#3e1212', border:`1px solid ${C.error}`, borderRadius:8, padding:12, marginTop:16 }}>
              <p style={{ color:'#ff6b6b', margin:0, fontSize:13 }}>⚠ {errors.submit}</p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ ...sBtnPrimary, marginTop:20, width:'100%', opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? 'Submitting…' : '✅ Submit Voucher'}
          </button>
        </div>
      )}

      {/* Navigation */}
      <div style={sNavRow}>
        {step > 0 ? (
          <button onClick={prevStep} style={sBtnSecondary}>← Back</button>
        ) : (
          <div />
        )}
        {step < 3 && (
          <button onClick={nextStep} style={sBtnPrimary}>
            {step === 2 ? 'Review →' : 'Next →'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function Field({ label, labelAr, required, value, onChange, error, type='text', placeholder }) {
  return (
    <div style={{ marginBottom:16 }}>
      <label style={sLabel}>
        {label} {labelAr && <span style={{ color:C.muted }}>/ {labelAr}</span>}
        {required && <span style={{ color:C.accent }}> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...sInput, borderColor: error ? C.error : C.border }}
      />
      {error && <p style={sError}>{error}</p>}
    </div>
  )
}

function UploadField({ label, labelAr, hint, fileName, onFile, uploading }) {
  return (
    <div style={{ marginBottom:20 }}>
      <label style={sLabel}>
        {label} <span style={{ color:C.muted }}>/ {labelAr}</span>
      </label>
      <label style={{
        display:'flex', alignItems:'center', gap:12,
        background: C.input, border:`1px dashed ${C.border}`, borderRadius:10,
        padding:'14px 16px', cursor: uploading ? 'wait' : 'pointer',
      }}>
        <input
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
          style={{ display:'none' }}
          onChange={e => e.target.files[0] && onFile(e.target.files[0])}
          disabled={uploading}
        />
        <span style={{ fontSize:28 }}>{uploading ? '⏳' : fileName ? '✅' : '📎'}</span>
        <div>
          <div style={{ color: fileName ? '#81c784' : C.text, fontSize:13, fontWeight:600 }}>
            {uploading ? 'Uploading to Drive…' : fileName || 'Tap to attach file'}
          </div>
          <div style={{ color:C.muted, fontSize:11 }}>{hint}</div>
        </div>
      </label>
    </div>
  )
}

function ReviewRow({ label, value, highlight }) {
  if (!value) return null
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'6px 0', borderBottom:`1px solid ${C.border}` }}>
      <span style={{ color:C.muted, fontSize:12, minWidth:110 }}>{label}</span>
      <span style={{ color: highlight ? C.accentLt : C.text, fontSize:13, fontWeight: highlight ? 700 : 400, textAlign:'right', maxWidth:220 }}>
        {value}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const sPage = {
  minHeight:    '100vh',
  background:   C.bg,
  display:      'flex',
  flexDirection:'column',
  alignItems:   'center',
  padding:      '0 0 40px',
  fontFamily:   'Poppins, system-ui, sans-serif',
}

const sHeader = {
  width:        '100%',
  maxWidth:     480,
  display:      'flex',
  alignItems:   'center',
  gap:          14,
  padding:      '20px 20px 12px',
  borderBottom: `1px solid ${C.border}`,
}

const sStepBar = {
  width:      '100%',
  maxWidth:   480,
  display:    'flex',
  alignItems: 'center',
  padding:    '14px 20px',
  gap:        4,
}

const sCard = {
  width:        '100%',
  maxWidth:     480,
  background:   C.card,
  borderRadius: 14,
  padding:      '20px',
  margin:       '8px 0',
}

const sCardTitle = {
  color:       C.text,
  fontSize:    15,
  fontWeight:  700,
  margin:      '0 0 20px',
  paddingBottom:10,
  borderBottom:`1px solid ${C.border}`,
}

const sLabel = {
  display:     'block',
  color:       C.muted,
  fontSize:    12,
  marginBottom:6,
  fontWeight:  600,
  textTransform:'uppercase',
  letterSpacing:'0.4px',
}

const sInput = {
  width:        '100%',
  boxSizing:    'box-sizing',
  background:   C.input,
  border:       `1px solid ${C.border}`,
  borderRadius: 8,
  color:        C.text,
  fontSize:     14,
  padding:      '12px 14px',
  outline:      'none',
  fontFamily:   'inherit',
}

const sError = {
  color:      '#ff6b6b',
  fontSize:   11,
  margin:     '4px 0 0',
}

const sRadioBtn = {
  display:      'flex',
  alignItems:   'center',
  gap:          12,
  padding:      '12px 14px',
  border:       `1px solid ${C.border}`,
  borderRadius: 10,
  cursor:       'pointer',
  width:        '100%',
  textAlign:    'left',
  transition:   'border-color 0.15s',
  fontFamily:   'inherit',
}

const sNavRow = {
  display:     'flex',
  justifyContent:'space-between',
  width:       '100%',
  maxWidth:    480,
  padding:     '4px 0',
  gap:         12,
}

const sBtnPrimary = {
  background:   C.accent,
  color:        '#fff',
  border:       'none',
  borderRadius: 10,
  padding:      '14px 28px',
  fontSize:     15,
  fontWeight:   700,
  cursor:       'pointer',
  fontFamily:   'inherit',
}

const sBtnSecondary = {
  background:   C.input,
  color:        C.text,
  border:       `1px solid ${C.border}`,
  borderRadius: 10,
  padding:      '14px 24px',
  fontSize:     14,
  fontWeight:   600,
  cursor:       'pointer',
  fontFamily:   'inherit',
}
