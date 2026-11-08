/**
 * OTPActivationScreen.jsx
 *
 * Shared OTP activation gate for all ACCSYS shareable forms.
 *
 * Usage:
 *   import OTPActivationScreen from '../components/OTPActivationScreen'
 *
 *   if (auth.needsActivation) return <OTPActivationScreen auth={auth} />
 *
 * Props:
 *   auth — the object returned by useFieldAuth() which must include:
 *     otpSent, otpSending, otpError, requestOTP(), verifyOTP(code)
 */

import { useState, useEffect } from 'react'

const CHARCOAL   = '#20221F'
const TEXT_DARK  = '#F7F7F0'
const TEXT_MUTED = '#A7AAA0'
const YELLOW     = '#F7D263'
const FONT       = "'Poppins', system-ui, sans-serif"

export default function OTPActivationScreen({ auth }) {
  const [otpInput,   setOtpInput]   = useState('')
  const [requested,  setRequested]  = useState(false)

  // Auto-request OTP on first render
  useEffect(() => {
    if (!requested) {
      setRequested(true)
      auth.requestOTP()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDigit(val) {
    const digits = val.replace(/\D/g, '').slice(0, 6)
    setOtpInput(digits)
  }

  function handleVerify() {
    if (otpInput.length === 6) auth.verifyOTP(otpInput)
  }

  return (
    <div style={{
      minHeight:     '100dvh',
      background:    CHARCOAL,
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'center',
      justifyContent:'center',
      padding:       24,
      fontFamily:    FONT,
      color:         TEXT_DARK,
      colorScheme:   'dark',
    }}>
      <style>{`@keyframes otp-pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>

      {/* Brand label */}
      <div style={{ fontSize:12, fontWeight:700, color:TEXT_MUTED, letterSpacing:3, marginBottom:36, textTransform:'uppercase' }}>
        ACCSYS
      </div>

      {/* Key icon */}
      <div style={{
        width:88, height:88,
        background:'rgba(247,210,99,0.08)',
        borderRadius:22,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontSize:38,
        marginBottom:24,
        border:'1.5px solid rgba(247,210,99,0.2)',
      }}>
        🔑
      </div>

      <div style={{ fontSize:20, fontWeight:700, color:TEXT_DARK, marginBottom:8, textAlign:'center' }}>
        Activate Your QR Access
      </div>

      <div style={{ fontSize:13, color:TEXT_MUTED, lineHeight:1.6, marginBottom:28, maxWidth:300, textAlign:'center' }}>
        {auth.otpSent
          ? 'An OTP has been sent to your manager. Ask them for the 6-digit code.'
          : auth.otpSending
          ? 'Sending OTP to your manager…'
          : 'Requesting activation code…'}
      </div>

      {/* Sending spinner */}
      {!auth.otpSent && auth.otpSending && (
        <div style={{ width:36, height:36, border:'3px solid rgba(247,210,99,0.2)', borderTop:`3px solid ${YELLOW}`, borderRadius:'50%', animation:'spin 0.8s linear infinite', marginBottom:24 }} />
      )}

      {/* OTP entry */}
      {auth.otpSent && (
        <div style={{ width:'100%', maxWidth:320 }}>
          <input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={otpInput}
            onChange={e => handleDigit(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleVerify()}
            placeholder="Enter 6-digit OTP"
            autoFocus
            style={{
              width:'100%', padding:'16px',
              fontSize:28, fontWeight:900, letterSpacing:12,
              textAlign:'center',
              border:`2px solid ${otpInput.length === 6 ? YELLOW : 'rgba(255,255,255,0.15)'}`,
              borderRadius:14,
              background:'rgba(255,255,255,0.08)',
              color:TEXT_DARK,
              outline:'none',
              boxSizing:'border-box',
              fontFamily:FONT,
              caretColor:YELLOW,
            }}
          />

          {auth.otpError && (
            <div style={{
              background:'rgba(220,50,50,0.12)',
              border:'1px solid rgba(220,50,50,0.3)',
              borderRadius:10, padding:'12px 16px',
              marginTop:14, color:'#F5A5A0', fontSize:13, lineHeight:1.5, textAlign:'center',
            }}>
              {auth.otpError}
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={otpInput.length < 6 || auth.otpSending}
            style={{
              width:'100%', marginTop:16, padding:'16px',
              background: otpInput.length === 6 && !auth.otpSending ? YELLOW : 'rgba(255,255,255,0.1)',
              color:       otpInput.length === 6 && !auth.otpSending ? '#1a2540' : TEXT_MUTED,
              border:'none', borderRadius:14,
              fontSize:16, fontWeight:800,
              cursor: otpInput.length === 6 ? 'pointer' : 'default',
              fontFamily:FONT, transition:'all 0.2s',
            }}>
            {auth.otpSending ? 'Verifying…' : 'Activate →'}
          </button>

          <button
            onClick={() => { setOtpInput(''); auth.requestOTP() }}
            disabled={auth.otpSending}
            style={{
              width:'100%', marginTop:10, padding:'10px',
              background:'transparent', color:TEXT_MUTED,
              border:'1px solid rgba(255,255,255,0.1)', borderRadius:10,
              fontSize:12, cursor:'pointer', fontFamily:FONT,
            }}>
            Resend OTP
          </button>
        </div>
      )}

      <div style={{ fontSize:11, color:TEXT_MUTED, marginTop:36, textAlign:'center', lineHeight:1.7, maxWidth:280 }}>
        This is a one-time setup. After activation, your QR will work automatically on this device.
      </div>
    </div>
  )
}
