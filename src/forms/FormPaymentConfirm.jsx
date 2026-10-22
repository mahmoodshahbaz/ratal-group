/**
 * FormPaymentConfirm.jsx — Field Payment Line Receipt Confirmation
 * Route: /forms/payment-confirm?line_id=UUID
 *
 * No QR auth required — the unique line_id in the URL IS the auth.
 * Accounts shares this link (via WhatsApp / QR) with the specific recipient.
 * Recipient opens it, sees their name + amount, and taps CONFIRM.
 *
 * DB writes: field_payment_lines.ack_status = 'CONFIRMED', ack_at = now()
 */

import { useState, useEffect } from 'react'
import { supabase }            from '../lib/supabase'

// ── Helpers ────────────────────────────────────────────────────────────────
const fmt = n => Number(n || 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'
const fmtDatetime = d => d ? new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'

const FF = '-apple-system, BlinkMacSystemFont, "Segoe UI", Poppins, sans-serif'
const GREEN  = '#16a34a'
const GREENBG= '#f0fdf4'
const ORANGE = '#ea580c'

// ── Error Screen ───────────────────────────────────────────────────────────
function ErrorScreen({ icon, title, body }) {
  return (
    <div style={{ minHeight:'100vh', background:'#0f172a', display:'flex', alignItems:'center', justifyContent:'center', padding:24, fontFamily:FF }}>
      <div style={{ background:'#1e293b', borderRadius:24, padding:'40px 28px', maxWidth:360, width:'100%', textAlign:'center' }}>
        <div style={{ fontSize:56, marginBottom:16 }}>{icon}</div>
        <div style={{ fontSize:19, fontWeight:800, color:'#f87171', marginBottom:10 }}>{title}</div>
        <div style={{ fontSize:13, color:'#64748b', lineHeight:1.6 }}>{body}</div>
      </div>
    </div>
  )
}

// ── Already Confirmed Screen ───────────────────────────────────────────────
function AlreadyConfirmed({ name, amount, confirmedAt }) {
  return (
    <div style={{ minHeight:'100vh', background:'#0f172a', display:'flex', alignItems:'center', justifyContent:'center', padding:24, fontFamily:FF }}>
      <div style={{ background:'#1e293b', borderRadius:24, padding:'40px 28px', maxWidth:360, width:'100%', textAlign:'center' }}>
        <div style={{ fontSize:52, marginBottom:16 }}>✅</div>
        <div style={{ fontSize:19, fontWeight:800, color:'#4ade80', marginBottom:8 }}>Already Confirmed</div>
        <div style={{ fontSize:13, color:'#94a3b8', marginBottom:24, lineHeight:1.6 }}>
          This payment was already acknowledged.
        </div>
        <div style={{ background:'#0f172a', borderRadius:16, padding:'20px 18px', textAlign:'left' }}>
          <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>RECIPIENT</div>
          <div style={{ fontSize:15, fontWeight:700, color:'#e2e8f0', marginBottom:14 }}>{name || '—'}</div>
          <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>AMOUNT RECEIVED</div>
          <div style={{ fontSize:22, fontWeight:900, color:'#4ade80', marginBottom:14 }}>SAR {fmt(amount)}</div>
          <div style={{ fontSize:12, color:'#64748b', marginBottom:4 }}>CONFIRMED ON</div>
          <div style={{ fontSize:13, fontWeight:600, color:'#94a3b8' }}>{fmtDatetime(confirmedAt)}</div>
        </div>
      </div>
    </div>
  )
}

// ── Success Screen ─────────────────────────────────────────────────────────
function SuccessScreen({ name, amount, sessionDate, confirmedAt }) {
  return (
    <div style={{ minHeight:'100vh', background:'#0f172a', display:'flex', flexDirection:'column', fontFamily:FF }}>

      {/* Green gradient hero */}
      <div style={{
        background: 'linear-gradient(160deg, #15803d 0%, #16a34a 50%, #22c55e 100%)',
        padding: '52px 24px 40px',
        textAlign: 'center',
      }}>
        {/* Animated checkmark circle */}
        <div style={{
          width:80, height:80, borderRadius:'50%',
          background:'rgba(255,255,255,0.2)',
          display:'flex', alignItems:'center', justifyContent:'center',
          margin:'0 auto 20px',
          boxShadow:'0 0 0 12px rgba(255,255,255,0.1)',
        }}>
          <svg width="40" height="32" viewBox="0 0 40 32" fill="none">
            <path d="M3 16L14 27L37 3" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ fontSize:24, fontWeight:900, color:'#fff', marginBottom:8 }}>
          Receipt Confirmed!
        </div>
        <div style={{ fontSize:14, color:'rgba(255,255,255,0.8)' }}>
          Thank you for acknowledging your payment
        </div>
      </div>

      {/* Detail card */}
      <div style={{ flex:1, padding:'24px 20px' }}>
        <div style={{ background:'#1e293b', borderRadius:20, overflow:'hidden', maxWidth:400, margin:'0 auto' }}>

          {/* Amount banner */}
          <div style={{ background:'#0f172a', padding:'22px 24px', textAlign:'center', borderBottom:'1px solid #334155' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#64748b', letterSpacing:1, marginBottom:6 }}>AMOUNT RECEIVED</div>
            <div style={{ fontSize:36, fontWeight:900, color:'#4ade80', letterSpacing:-1 }}>
              SAR {fmt(amount)}
            </div>
          </div>

          {/* Details */}
          <div style={{ padding:'20px 24px' }}>
            {[
              { label:'RECIPIENT', value: name || '—' },
              { label:'SESSION DATE', value: fmtDate(sessionDate) },
              { label:'CONFIRMED ON', value: fmtDatetime(confirmedAt) },
            ].map(row => (
              <div key={row.label} style={{ marginBottom:18 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#64748b', letterSpacing:0.8, marginBottom:3 }}>{row.label}</div>
                <div style={{ fontSize:14, fontWeight:600, color:'#e2e8f0' }}>{row.value}</div>
              </div>
            ))}
          </div>

          {/* Footer note */}
          <div style={{ padding:'14px 24px', background:'#0f172a', borderTop:'1px solid #334155', textAlign:'center' }}>
            <div style={{ fontSize:11, color:'#475569' }}>
              This confirmation has been recorded. No further action required.
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function FormPaymentConfirm() {
  const params  = new URLSearchParams(window.location.search)
  const lineId  = params.get('line_id')

  const [line,      setLine]      = useState(null)
  const [session,   setSession]   = useState(null)
  const [recipient, setRecipient] = useState('')
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)   // { icon, title, body }
  const [confirming,setConfirming]= useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [confirmedAt,setConfirmedAt]= useState(null)

  // ── Load line ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!lineId) {
      setError({ icon:'🔗', title:'Invalid Link', body:'This link is missing a payment reference. Please use the link sent to you by Accounts.' })
      setLoading(false)
      return
    }
    loadLine()
  }, [lineId])

  async function loadLine() {
    setLoading(true)

    // Fetch the line
    const { data: ln, error: lErr } = await supabase
      .from('field_payment_lines')
      .select('id, session_id, employee_id, contractor_id, accountable_party_type, accountable_party_name, amount, bank_charge_amount, ack_status, ack_at, reference_no')
      .eq('id', lineId)
      .maybeSingle()

    if (lErr || !ln) {
      setError({ icon:'❌', title:'Payment Not Found', body:'This payment reference does not exist or may have been removed. Contact Accounts for help.' })
      setLoading(false)
      return
    }

    setLine(ln)

    // If already confirmed, just display that
    if (ln.ack_status === 'CONFIRMED') {
      setConfirmed(true)
      setConfirmedAt(ln.ack_at)
    }

    // Fetch session for date info
    const { data: sess } = await supabase
      .from('field_payment_sessions')
      .select('id, session_date, department_name')
      .eq('id', ln.session_id)
      .maybeSingle()
    setSession(sess)

    // Resolve recipient name
    let name = ln.accountable_party_name || ''

    if (!name && ln.employee_id) {
      const { data: emp } = await supabase
        .from('employees')
        .select('full_name_en')
        .eq('id', ln.employee_id)
        .maybeSingle()
      name = emp?.full_name_en || ''
    }

    if (!name && ln.contractor_id) {
      const { data: con } = await supabase
        .from('contractors')
        .select('contractor_name')
        .eq('id', ln.contractor_id)
        .maybeSingle()
      name = con?.contractor_name || ''
    }

    setRecipient(name || 'Unknown Recipient')
    setLoading(false)
  }

  // ── Confirm ──────────────────────────────────────────────────────────────
  async function handleConfirm() {
    if (!line || confirming) return
    setConfirming(true)
    const now = new Date().toISOString()
    const { error: uErr } = await supabase
      .from('field_payment_lines')
      .update({ ack_status: 'CONFIRMED', ack_at: now })
      .eq('id', line.id)
      .eq('ack_status', 'PENDING')   // guard: only update if still pending

    if (uErr) {
      alert('Could not save confirmation. Please try again or contact Accounts.')
      setConfirming(false)
      return
    }
    setConfirmedAt(now)
    setConfirmed(true)
    setConfirming(false)
  }

  // ── Render guards ────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0f172a', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:FF }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:48, height:48, borderRadius:'50%', border:'3px solid #334155', borderTopColor:'#22c55e', margin:'0 auto 16px', animation:'spin 0.8s linear infinite' }}/>
        <div style={{ fontSize:13, color:'#64748b' }}>Loading payment details…</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )

  if (error) return <ErrorScreen {...error} />

  if (confirmed) {
    // Just confirmed this session OR was already confirmed
    if (line?.ack_status === 'CONFIRMED' && !confirmedAt) {
      return <AlreadyConfirmed name={recipient} amount={line?.amount} confirmedAt={line?.ack_at} />
    }
    return <SuccessScreen name={recipient} amount={line?.amount} sessionDate={session?.session_date} confirmedAt={confirmedAt} />
  }

  const totalAmount = (Number(line?.amount) || 0) + (Number(line?.bank_charge_amount) || 0)

  // ── Main confirmation screen ─────────────────────────────────────────────
  return (
    <div style={{
      position:'fixed', inset:0, background:'#0f172a',
      display:'flex', flexDirection:'column', fontFamily:FF,
      maxWidth:480, margin:'0 auto',
    }}>

      {/* Header */}
      <div style={{
        flexShrink:0, background:'#1e293b',
        padding:'40px 24px 20px', textAlign:'center',
        borderBottom:'1px solid #334155',
      }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#64748b', letterSpacing:1.5, marginBottom:10 }}>
          ACCSYS · PAYMENT CONFIRMATION
        </div>
        <div style={{ fontSize:20, fontWeight:900, color:'#f1f5f9', letterSpacing:0.2 }}>
          Confirm Receipt
        </div>
        <div style={{ fontSize:12, color:'#64748b', marginTop:4 }}>
          Please review the details below and confirm
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex:1, overflowY:'auto', padding:'24px 20px 12px', WebkitOverflowScrolling:'touch' }}>

        {/* Recipient card */}
        <div style={{ background:'#1e293b', borderRadius:20, overflow:'hidden', marginBottom:16 }}>

          {/* Amount hero */}
          <div style={{
            background:'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)',
            padding:'28px 24px', textAlign:'center',
          }}>
            <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.6)', letterSpacing:1, marginBottom:8 }}>
              AMOUNT TO CONFIRM
            </div>
            <div style={{ fontSize:40, fontWeight:900, color:'#fff', letterSpacing:-1.5, lineHeight:1 }}>
              SAR {fmt(line?.amount)}
            </div>
            {Number(line?.bank_charge_amount) > 0 && (
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginTop:8 }}>
                + SAR {fmt(line?.bank_charge_amount)} bank charges
              </div>
            )}
          </div>

          {/* Details rows */}
          <div style={{ padding:'20px 24px' }}>
            {[
              { icon:'👤', label:'Recipient',    value: recipient },
              { icon:'📅', label:'Session Date', value: fmtDate(session?.session_date) },
              { icon:'🏢', label:'Department',   value: session?.department_name || '—' },
              line?.reference_no && { icon:'#️⃣', label:'Reference',  value: line.reference_no },
            ].filter(Boolean).map(row => (
              <div key={row.label} style={{
                display:'flex', alignItems:'center', gap:14,
                paddingBottom:14, marginBottom:14,
                borderBottom:'1px solid #334155',
              }}>
                <div style={{ fontSize:20, flexShrink:0, width:32, textAlign:'center' }}>{row.icon}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, color:'#64748b', fontWeight:700, letterSpacing:0.6, marginBottom:2 }}>{row.label.toUpperCase()}</div>
                  <div style={{ fontSize:14, fontWeight:700, color:'#e2e8f0' }}>{row.value}</div>
                </div>
              </div>
            ))}

            {/* Disclaimer */}
            <div style={{
              background:'#0f172a', borderRadius:12,
              padding:'14px 16px', marginTop:4,
              display:'flex', alignItems:'flex-start', gap:10,
            }}>
              <div style={{ fontSize:16, flexShrink:0, marginTop:1 }}>ℹ️</div>
              <div style={{ fontSize:12, color:'#64748b', lineHeight:1.6 }}>
                By confirming, you acknowledge that you have received the above amount in full. This action cannot be undone.
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Pinned confirm button */}
      <div style={{
        flexShrink:0, padding:'14px 20px 32px',
        background:'#0f172a', borderTop:'1px solid #1e293b',
      }}>
        <button
          onClick={handleConfirm}
          disabled={confirming}
          style={{
            display:'block', width:'100%',
            background: confirming
              ? '#1e293b'
              : 'linear-gradient(135deg, #15803d 0%, #16a34a 100%)',
            color: confirming ? '#475569' : '#fff',
            border:'none', borderRadius:16,
            padding:'18px', fontSize:17, fontWeight:900,
            cursor: confirming ? 'default' : 'pointer',
            boxShadow: confirming ? 'none' : '0 6px 24px rgba(22,163,74,0.45)',
            letterSpacing:0.4, transition:'all 0.2s',
          }}>
          {confirming
            ? '⏳  Saving…'
            : '✓  I Confirm Receipt of SAR ' + fmt(line?.amount)}
        </button>

        <div style={{ textAlign:'center', marginTop:10, fontSize:11, color:'#334155' }}>
          Having trouble? Contact your Accounts team
        </div>
      </div>

    </div>
  )
}
