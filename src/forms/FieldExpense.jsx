/**
 * FIELD EXPENSE FORM
 * Used by: Tech / Engineer via QR portal
 * Flow: Photo → auto-detect ZATCA QR (VAT + Amount) → if no QR, type amount → submit
 * Two modes: RECEIVING (cash acknowledgement) | EXPENSE (spending)
 */

import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { uploadToDrive } from '../hooks/useDriveUpload'
import { postToSheet } from '../lib/googleSheets'

// Load jsQR at runtime from CDN (not an npm dependency)
function loadJsQR() {
  return new Promise((resolve) => {
    if (window.jsQR) { resolve(window.jsQR); return }
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'
    s.onload = () => resolve(window.jsQR)
    s.onerror = () => resolve(null)
    document.head.appendChild(s)
  })
}

const EXPENSE_TYPES = [
  'Tools & Materials','Transport / Fuel','Food (Non-Allowance)','Accommodation',
  'Communication','Safety Equipment','Site Consumables','Government Fees','Other',
]

const S = {
  card:    { background:'#fff', borderRadius:20, padding:24, width:'100%', maxWidth:440, boxShadow:'0 4px 20px rgba(0,0,0,0.10)' },
  title:   { fontSize:20, fontWeight:800, color:'#1a2540', marginBottom:20 },
  label:   { display:'block', fontSize:12, color:'#6b7c93', fontWeight:700, marginBottom:5 },
  inp:     { width:'100%', padding:'11px 13px', borderRadius:10, border:'1.5px solid #dde3ec', fontSize:15, outline:'none', fontFamily:'inherit', boxSizing:'border-box' },
  photoBox:{ border:'2px dashed #dde3ec', borderRadius:14, padding:28, textAlign:'center', cursor:'pointer', marginBottom:16 },
  bigBtn:  { background:'linear-gradient(135deg,#1565c0,#1976d2)', color:'#fff', border:'none', borderRadius:14, padding:'16px', fontSize:16, fontWeight:800, cursor:'pointer', width:'100%', marginTop:8 },
  chip:    (active) => ({ padding:'8px 16px', borderRadius:20, border:`2px solid ${active?'#1565c0':'#dde3ec'}`, background: active?'#e3f2fd':'#fff', color: active?'#1565c0':'#6b7c93', cursor:'pointer', fontSize:13, fontWeight:700 }),
}

export default function FieldExpense({ person, assignment }) {
  const [mode,          setMode]          = useState('EXPENSE')  // EXPENSE | RECEIVING
  const [photo,         setPhoto]         = useState(null)       // data URL
  const [photoFile,     setPhotoFile]     = useState(null)
  const [vatNo,         setVatNo]         = useState('')
  const [amount,        setAmount]        = useState('')
  const [expenseType,   setExpenseType]   = useState('')
  const [notes,         setNotes]         = useState('')
  const [scanning,      setScanning]      = useState(false)
  const [qrFound,       setQrFound]       = useState(false)
  const [submitting,    setSubmitting]    = useState(false)
  const [submitted,     setSubmitted]     = useState(false)
  const fileRef = useRef()

  async function handlePhoto(file) {
    setPhotoFile(file)
    const url = URL.createObjectURL(file)
    setPhoto(url)
    setScanning(true)
    setQrFound(false)

    try {
      const jsQR = await loadJsQR()
      if (!jsQR) { setScanning(false); return }

      const img = new Image()
      img.src   = url
      img.onload = () => {
        const canvas  = document.createElement('canvas')
        canvas.width  = img.width
        canvas.height = img.height
        canvas.getContext('2d').drawImage(img, 0, 0)
        const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height)
        setScanning(false)
        if (code?.data) parseZATCA(code.data)
      }
      img.onerror = () => setScanning(false)
    } catch {
      setScanning(false)
    }
  }

  function parseZATCA(qrData) {
    // ZATCA QR is TLV-encoded base64
    try {
      const bytes  = atob(qrData)
      const parsed = {}
      let i = 0
      while (i < bytes.length) {
        const tag = bytes.charCodeAt(i++)
        const len = bytes.charCodeAt(i++)
        const val = bytes.slice(i, i + len)
        i += len
        if (tag === 3) parsed.vatNo = val   // VAT Registration Number
        if (tag === 5) parsed.vat   = val   // VAT Amount
        if (tag === 4) parsed.total = val   // Invoice Total with VAT
      }
      if (parsed.vatNo || parsed.total) {
        setVatNo(parsed.vatNo || '')
        setAmount(parsed.total ? parseFloat(parsed.total).toFixed(2) : '')
        setQrFound(true)
      }
    } catch {
      // Not a ZATCA QR — no problem, user types manually
    }
  }

  async function submit() {
    if (!amount || parseFloat(amount) <= 0) { alert('Enter an amount'); return }
    if (!expenseType && mode === 'EXPENSE')  { alert('Select expense type'); return }
    if (!photo)                              { alert('Photo is required'); return }
    setSubmitting(true)

    // Upload photo
    let photoUrl = null
    if (photoFile) {
      const result = await uploadToDrive(photoFile, 'expenses', person.id)
      if (result) photoUrl = result.viewUrl
    }

    const today = new Date().toISOString().split('T')[0]
    const expensePayload = {
      entity_id:        person.entity_id || null,
      employee_id:      person.id,
      expense_date:     today,
      expense_mode:     mode,
      expense_type:     expenseType || null,
      amount:           parseFloat(amount),
      vat_amount:       vatNo ? parseFloat(amount) * 15 / 115 : 0,
      vendor_vat_no:    vatNo || null,
      vat_paid:         !!vatNo,
      photo_url:        photoUrl,
      site_master_id:   assignment?.site_master_id || null,
      sm_id:            assignment?.sm_id || assignment?.site_masters?.sm_id || null,
      notes:            notes || null,
      status:           'PENDING',
    }
    const [{ error }] = await Promise.all([
      supabase.from('expenses').insert(expensePayload),
      postToSheet('expense', expensePayload),
    ])

    setSubmitting(false)
    if (error) { alert(error.message); return }
    setSubmitted(true)
  }

  if (submitted) return (
    <div style={{ ...S.card, textAlign:'center' }}>
      <div style={{ fontSize:60, marginBottom:16 }}>✅</div>
      <div style={{ fontSize:20, fontWeight:800, color:'#2e7d32', marginBottom:8 }}>Submitted!</div>
      <div style={{ color:'#6b7c93', fontSize:14, marginBottom:24 }}>SAR {parseFloat(amount).toLocaleString()} recorded</div>
      <button style={{ ...S.bigBtn, background:'#e3f2fd', color:'#1565c0' }}
        onClick={() => { setSubmitted(false); setPhoto(null); setPhotoFile(null); setAmount(''); setVatNo(''); setExpenseType(''); setNotes(''); setQrFound(false) }}>
        + Add Another
      </button>
    </div>
  )

  return (
    <div style={S.card}>
      <div style={S.title}>💳 Expense</div>

      {/* Mode selector */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {['EXPENSE','RECEIVING'].map(m => (
          <button key={m} style={S.chip(mode===m)} onClick={() => setMode(m)}>
            {m === 'EXPENSE' ? '💸 Spending' : '💵 Receiving'}
          </button>
        ))}
      </div>

      {mode === 'RECEIVING' && (
        <div style={{ background:'#e3f2fd', borderRadius:12, padding:12, marginBottom:16, fontSize:13, color:'#1565c0', fontWeight:700 }}>
          Use this mode to record cash received from your supervisor (outside normal distribution).
        </div>
      )}

      {/* Photo capture — FIRST step */}
      <div style={{ marginBottom:16 }}>
        <label style={S.label}>Receipt Photo {mode==='EXPENSE' ? '*' : '(optional)'}</label>
        <div style={{ ...S.photoBox, borderColor: photo?'#1565c0':'#dde3ec' }}
          onClick={() => fileRef.current?.click()}>
          {photo
            ? <img src={photo} alt="receipt" style={{ maxHeight:180, maxWidth:'100%', borderRadius:8, objectFit:'contain' }} />
            : <div>
                <div style={{ fontSize:36, marginBottom:8 }}>📷</div>
                <div style={{ fontSize:14, color:'#6b7c93' }}>Tap to take photo or upload</div>
                <div style={{ fontSize:11, color:'#aab2bd', marginTop:4 }}>ZATCA QR detected automatically</div>
              </div>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
          onChange={e => e.target.files[0] && handlePhoto(e.target.files[0])} />
      </div>

      {/* QR detection result */}
      {scanning && <div style={{ textAlign:'center', color:'#1565c0', fontSize:13, marginBottom:12 }}>🔍 Scanning for ZATCA QR…</div>}
      {qrFound  && <div style={{ background:'#e8f5e9', borderRadius:10, padding:10, marginBottom:12, fontSize:13, color:'#2e7d32', fontWeight:700 }}>✅ ZATCA QR detected — VAT and amount auto-filled</div>}

      {/* VAT Number (auto-filled if QR found) */}
      {vatNo && (
        <div style={{ marginBottom:14 }}>
          <label style={S.label}>Vendor VAT No (auto-detected)</label>
          <input style={{ ...S.inp, background:'#f8fafd', color:'#2e7d32' }} value={vatNo} readOnly />
        </div>
      )}

      {/* Amount */}
      <div style={{ marginBottom:14 }}>
        <label style={S.label}>Amount (SAR) *</label>
        <input type="number" min="0" step="0.01" style={{ ...S.inp, fontSize:22, fontWeight:800, textAlign:'center' }}
          placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
        {qrFound && <div style={{ fontSize:11, color:'#2e7d32', marginTop:4 }}>Auto-filled from receipt QR — edit if incorrect</div>}
      </div>

      {/* Expense Type (SPENDING mode only) */}
      {mode === 'EXPENSE' && (
        <div style={{ marginBottom:14 }}>
          <label style={S.label}>Expense Type *</label>
          <select style={S.inp} value={expenseType} onChange={e => setExpenseType(e.target.value)}>
            <option value="">— Select —</option>
            {EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      )}

      {/* Site (auto-filled) */}
      {assignment && (
        <div style={{ marginBottom:14 }}>
          <label style={S.label}>Site (auto-assigned)</label>
          <input style={{ ...S.inp, background:'#f8fafd', color:'#1565c0', fontWeight:700 }}
            value={assignment.site_masters?.site_name || assignment.sm_id || '—'} readOnly />
        </div>
      )}

      {/* Notes */}
      <div style={{ marginBottom:20 }}>
        <label style={S.label}>Notes (optional)</label>
        <textarea rows={2} style={{ ...S.inp, resize:'none' }} placeholder="Any additional details…"
          value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <button style={S.bigBtn} onClick={submit} disabled={submitting}>
        {submitting ? 'Submitting…' : `Submit ${mode === 'RECEIVING' ? 'Receipt' : 'Expense'}`}
      </button>
    </div>
  )
}
