/**
 * FormPaymentValidation.jsx — Payment Receipt Confirmation
 * Route: /forms/payment-validation
 * Auth:  useFieldAuth (any field role)
 *
 * Purpose:
 *  When the DH issues a cash advance via FormFieldPayment, the advance
 *  record is created with status = 'ISSUED'. This form lets the RECIPIENT
 *  employee confirm they physically received the money — by reviewing the
 *  amount, taking a photo of the signed voucher, and tapping Confirm.
 *
 * Flow:
 *  1. Load all ISSUED advances for this employee (pending confirmation)
 *  2. Show each one: amount, date, who issued it
 *  3. Employee taps confirm, takes a voucher photo, optionally adds notes
 *  4. Updates employee_advances: status → CONFIRMED, confirmed_at, receipt_photo_url
 *  5. Sends notification back to the DH who issued it
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useFieldAuth, ROLE_COLORS }                 from '../lib/useFieldAuth'
import { supabase }                                  from '../lib/supabase'
import { uploadToDrive }                             from '../hooks/useDriveUpload'

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  wrap:    { minHeight:'100vh', background:'#f0f4f8', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start', padding:'20px 16px 40px' },
  card:    { background:'#fff', borderRadius:20, padding:24, width:'100%', maxWidth:440, boxShadow:'0 4px 20px rgba(0,0,0,0.10)', marginBottom:16 },
  h1:      { fontSize:20, fontWeight:800, color:'#1a2540', marginBottom:4 },
  sub:     { fontSize:13, color:'#6b7c93', marginBottom:20 },
  label:   { display:'block', fontSize:12, color:'#6b7c93', fontWeight:700, marginBottom:5 },
  badge:   (color) => ({ background:color+'22', color, fontWeight:700, fontSize:11, padding:'3px 10px', borderRadius:20, display:'inline-block', marginBottom:14 }),
  amount:  { fontSize:36, fontWeight:900, color:'#e65100', marginBottom:4, textAlign:'center' },
  detail:  { fontSize:13, color:'#6b7c93', textAlign:'center', marginBottom:20 },
  photoBox:{ border:'2px dashed #dde3ec', borderRadius:14, padding:24, textAlign:'center', cursor:'pointer', marginBottom:16 },
  bigBtn:  (color) => ({ background:color||'linear-gradient(135deg,#2e7d32,#388e3c)', color:'#fff', border:'none', borderRadius:14, padding:'16px', fontSize:16, fontWeight:800, cursor:'pointer', width:'100%' }),
  row:     { display:'flex', alignItems:'center', gap:12, padding:'14px 0', borderBottom:'1px solid #f0f4f8' },
  pendingCard: { background:'#fff8f0', border:'2px solid #ffe0b2', borderRadius:16, padding:20, marginBottom:12 },
  greenCard:   { background:'#f1f8e9', border:'2px solid #c5e1a5', borderRadius:16, padding:20, marginBottom:12 },
}

const fmt = (n) => Number(n||0).toLocaleString('en-SA', { minimumFractionDigits:2, maximumFractionDigits:2 })

// ── Auth guard ────────────────────────────────────────────────────────────────
function AuthGuard({ error }) {
  const msgs = {
    no_token:          { icon:'🔒', title:'Authentication Required', body:'Please scan your QR code to access this form.' },
    invalid_token:     { icon:'❌', title:'Invalid QR Code',          body:'QR code not recognised. Contact your DH.' },
    token_inactive:    { icon:'⛔', title:'QR Code Expired',          body:'Please ask your DH for a fresh QR code.' },
    employee_inactive: { icon:'🚫', title:'Account Inactive',         body:'Contact HR to reactivate your account.' },
  }
  const m = msgs[error] || msgs.no_token
  return (
    <div style={S.wrap}>
      <div style={{ ...S.card, textAlign:'center', padding:40 }}>
        <div style={{ fontSize:56, marginBottom:16 }}>{m.icon}</div>
        <div style={{ fontSize:20, fontWeight:800, color:'#c62828', marginBottom:8 }}>{m.title}</div>
        <div style={{ fontSize:14, color:'#6b7c93' }}>{m.body}</div>
      </div>
    </div>
  )
}

// ── Single advance confirmation card ─────────────────────────────────────────
function AdvanceCard({ advance, employeeId, onConfirmed }) {
  const [expanded,   setExpanded]   = useState(false)
  const [photo,      setPhoto]      = useState(null)
  const [photoFile,  setPhotoFile]  = useState(null)
  const [notes,      setNotes]      = useState('')
  const [confirming, setConfirming] = useState(false)
  const fileRef = useRef()

  const days = Math.floor((Date.now() - new Date(advance.advance_date)) / 86400000)

  async function confirm() {
    if (!photo) { alert('Please take a photo of the signed voucher first.'); return }
    setConfirming(true)

    try {
      // 1. Upload voucher photo
      let photoUrl = null
      if (photoFile) {
        const path = `payment-receipts/${advance.id}/${Date.now()}.jpg`
        const result = await uploadToDrive(photoFile, 'vouchers')
        if (result) photoUrl = result.viewUrl
      }

      // 2. Update advance status
      const { error } = await supabase
        .from('employee_advances')
        .update({
          status:            'CONFIRMED',
          confirmed_at:      new Date().toISOString(),
          confirmed_by:      employeeId,
          receipt_photo_url: photoUrl,
          recipient_notes:   notes || null,
        })
        .eq('id', advance.id)

      if (error) throw error

      // 3. Notify the issuer (fire and forget)
      if (advance.issued_by) {
        await supabase.from('notifications').insert({
          entity_id:   advance.entity_id,
          employee_id: advance.issued_by,
          type:        'ADVANCE_RETURN',
          title:       `Receipt Confirmed — SAR ${fmt(advance.amount)}`,
          body:        `${advance.employee_name || 'Employee'} confirmed receipt of SAR ${fmt(advance.amount)} advance dated ${advance.advance_date}.`,
          metadata:    { advance_id: advance.id, amount: advance.amount },
        }).then(() => {})
      }

      onConfirmed(advance.id)
    } catch (err) {
      alert(err.message || 'Confirmation failed. Please try again.')
    }
    setConfirming(false)
  }

  return (
    <div style={S.pendingCard}>
      {/* Summary row — always visible */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }}
        onClick={() => setExpanded(e => !e)}>
        <div>
          <div style={{ fontWeight:900, fontSize:22, color:'#e65100' }}>SAR {fmt(advance.amount)}</div>
          <div style={{ fontSize:12, color:'#6b7c93', marginTop:2 }}>
            {advance.advance_date}
            {advance.issued_by_name && ` · from ${advance.issued_by_name}`}
          </div>
          {days > 0 && (
            <div style={{ fontSize:11, color: days >= 30 ? '#c62828' : '#e65100', marginTop:2 }}>
              {days} day{days > 1 ? 's' : ''} pending confirmation
            </div>
          )}
        </div>
        <div style={{ fontSize:24, color:'#e65100' }}>{expanded ? '▲' : '▼'}</div>
      </div>

      {/* Expanded: confirmation form */}
      {expanded && (
        <div style={{ marginTop:16 }}>
          {advance.reference && (
            <div style={{ fontSize:12, color:'#6b7c93', marginBottom:12 }}>
              Ref: <strong>{advance.reference}</strong>
            </div>
          )}
          {advance.notes && (
            <div style={{ fontSize:12, color:'#6b7c93', background:'#fff8f0', borderRadius:8, padding:'8px 10px', marginBottom:12 }}>
              Note from DH: {advance.notes}
            </div>
          )}

          {/* Voucher photo */}
          <label style={S.label}>Voucher / Receipt Photo * (mandatory)</label>
          <div style={{ ...S.photoBox, borderColor: photo ? '#e65100' : '#dde3ec' }}
            onClick={() => fileRef.current?.click()}>
            {photo
              ? <img src={photo} alt="voucher" style={{ maxHeight:160, maxWidth:'100%', borderRadius:8, objectFit:'cover' }} />
              : <>
                  <div style={{ fontSize:36, marginBottom:8 }}>📄</div>
                  <div style={{ fontSize:14, color:'#6b7c93' }}>Photograph the signed voucher</div>
                  <div style={{ fontSize:11, color:'#bbb', marginTop:4 }}>Required to confirm receipt</div>
                </>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) { setPhotoFile(f); setPhoto(URL.createObjectURL(f)) }
            }} />
          {photo && (
            <div style={{ fontSize:12, color:'#e65100', cursor:'pointer', textAlign:'right', marginBottom:10 }}
              onClick={() => { setPhoto(null); setPhotoFile(null) }}>
              ✕ Remove
            </div>
          )}

          {/* Notes */}
          <label style={S.label}>Notes (optional)</label>
          <textarea rows={2}
            style={{ width:'100%', padding:'10px', borderRadius:10, border:'1.5px solid #dde3ec', fontSize:14, outline:'none', resize:'none', fontFamily:'inherit', boxSizing:'border-box', marginBottom:14 }}
            placeholder="Any comments about this payment…"
            value={notes} onChange={e => setNotes(e.target.value)} />

          {/* Confirm button */}
          <button
            style={{ ...S.bigBtn(), opacity: confirming ? 0.7 : 1 }}
            disabled={confirming}
            onClick={confirm}>
            {confirming ? 'Confirming…' : `✓ Confirm Receipt of SAR ${fmt(advance.amount)}`}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Confirmed advance card (read-only) ────────────────────────────────────────
function ConfirmedCard({ advance }) {
  return (
    <div style={S.greenCard}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ fontSize:28 }}>✅</div>
        <div>
          <div style={{ fontWeight:800, fontSize:15, color:'#2e7d32' }}>SAR {fmt(advance.amount)} — Confirmed</div>
          <div style={{ fontSize:12, color:'#6b7c93' }}>
            {advance.advance_date}
            {advance.issued_by_name ? ` · from ${advance.issued_by_name}` : ''}
            {advance.confirmed_at ? ` · confirmed ${new Date(advance.confirmed_at).toLocaleDateString('en-GB')}` : ''}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function FormPaymentValidation() {
  const auth = useFieldAuth()

  const [pending,    setPending]    = useState([])
  const [confirmed,  setConfirmed]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [justDone,   setJustDone]   = useState([])  // IDs confirmed this session

  const load = useCallback(async () => {
    if (!auth.employee?.id) return
    setLoading(true)

    const { data } = await supabase
      .from('employee_advances')
      .select(`
        id, entity_id, advance_date, amount, txn_type, status,
        reference, notes, issued_by, confirmed_at, receipt_photo_url,
        issuer:issued_by ( full_name_en, full_name_ar, designation )
      `)
      .eq('employee_id', auth.employee.id)
      .eq('txn_type', 'ADVANCE_IN')
      .order('advance_date', { ascending: false })
      .limit(30)

    const rows = data || []
    setPending(rows.filter(r => r.status === 'ISSUED'))
    setConfirmed(rows.filter(r => r.status === 'CONFIRMED'))
    setLoading(false)
  }, [auth.employee?.id])

  useEffect(() => { if (!auth.loading) load() }, [auth.loading, load])

  function handleConfirmed(id) {
    setJustDone(prev => [...prev, id])
    setPending(prev => prev.filter(r => r.id !== id))
    load()  // reload to move into confirmed list
  }

  // ── Loading ──────────────────────────────────────────────
  if (auth.loading) {
    return (
      <div style={S.wrap}>
        <div style={{ ...S.card, textAlign:'center', padding:40 }}>
          <div style={{ fontSize:36, marginBottom:16 }}>⏳</div>
          <div style={{ color:'#6b7c93' }}>Verifying…</div>
        </div>
      </div>
    )
  }

  if (auth.error) return <AuthGuard error={auth.error} />

  const roleColor = ROLE_COLORS[auth.role] || '#37474f'

  return (
    <div style={S.wrap}>

      {/* Header card */}
      <div style={S.card}>
        <div style={S.badge(roleColor)}>{auth.employee?.designation || auth.role}</div>
        <div style={S.h1}>💳 Payment Confirmation</div>
        <div style={S.sub}>
          Review advances issued to you and confirm physical receipt by photographing the signed voucher.
        </div>

        {/* Summary row */}
        {!loading && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div style={{ background:'#fff3e0', borderRadius:12, padding:'12px 14px', textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:900, color:'#e65100' }}>{pending.length}</div>
              <div style={{ fontSize:11, color:'#6b7c93', fontWeight:600 }}>Pending Confirmation</div>
            </div>
            <div style={{ background:'#f1f8e9', borderRadius:12, padding:'12px 14px', textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:900, color:'#2e7d32' }}>{confirmed.length}</div>
              <div style={{ fontSize:11, color:'#6b7c93', fontWeight:600 }}>Confirmed</div>
            </div>
          </div>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ ...S.card, textAlign:'center', padding:32 }}>
          <div style={{ color:'#6b7c93' }}>Loading your advances…</div>
        </div>
      )}

      {/* Pending confirmation */}
      {!loading && pending.length > 0 && (
        <div style={{ width:'100%', maxWidth:440 }}>
          <div style={{ fontSize:13, fontWeight:800, color:'#e65100', marginBottom:10, paddingLeft:4 }}>
            ⚡ {pending.length} Advance{pending.length > 1 ? 's' : ''} Pending Confirmation
          </div>
          {pending.map(adv => (
            <AdvanceCard
              key={adv.id}
              advance={{ ...adv, issued_by_name: adv.issuer?.full_name_en, employee_name: auth.employee?.full_name_en }}
              employeeId={auth.employee.id}
              onConfirmed={handleConfirmed}
            />
          ))}
        </div>
      )}

      {/* All clear */}
      {!loading && pending.length === 0 && (
        <div style={{ ...S.card, textAlign:'center', padding:36 }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
          <div style={{ fontWeight:800, fontSize:16, color:'#2e7d32', marginBottom:6 }}>All clear!</div>
          <div style={{ fontSize:13, color:'#6b7c93' }}>
            {confirmed.length > 0
              ? `You have confirmed all ${confirmed.length} advance${confirmed.length > 1 ? 's' : ''}. Nothing pending.`
              : 'No advances have been issued to you yet.'}
          </div>
        </div>
      )}

      {/* Confirmed history */}
      {!loading && confirmed.length > 0 && (
        <div style={{ width:'100%', maxWidth:440 }}>
          <div style={{ fontSize:13, fontWeight:800, color:'#2e7d32', marginBottom:10, paddingLeft:4 }}>
            ✓ Confirmed History
          </div>
          {confirmed.map(adv => (
            <ConfirmedCard key={adv.id} advance={{ ...adv, issued_by_name: adv.issuer?.full_name_en }} />
          ))}
        </div>
      )}

    </div>
  )
}
