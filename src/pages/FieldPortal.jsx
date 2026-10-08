/**
 * FIELD PORTAL — /field?qr=TOKEN
 * Public route, no login required.
 *
 * Phase machine:
 *  loading → device_check → [ok] → identify → [ack_pending | menu]
 *                         → [otp_pending]   → otp_entry → identify
 *                         → [never_registered | unregistered | inactive | error]
 *
 * Geo-fence:
 *  After device passes, GPS is captured in the background.
 *  If site has coordinates: distance checked, flagged if outside radius.
 *  If site has no coordinates: GPS logged for cluster auto-propose (3+ readings → PM notified).
 */

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import FieldExpense     from '../forms/FieldExpense'
import FieldFood        from '../forms/FieldFood'
import FieldOvertime    from '../forms/FieldOvertime'
import FieldSiteStatus  from '../forms/FieldSiteStatus'

// ── Haversine distance (metres) ───────────────────────────────────────────────
function haversineM(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)))
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  page:    { minHeight:'100vh', background:'#f0f4f8', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start', padding:'24px 16px', fontFamily:'system-ui,sans-serif' },
  card:    { background:'#fff', borderRadius:20, boxShadow:'0 4px 20px rgba(0,0,0,0.10)', padding:28, width:'100%', maxWidth:440 },
  header:  { textAlign:'center', marginBottom:24 },
  logo:    { fontSize:28, fontWeight:900, color:'#1565c0', letterSpacing:-1 },
  sub:     { fontSize:13, color:'#6b7c93', marginTop:4 },
  name:    { fontSize:22, fontWeight:800, color:'#1a2540', marginTop:16, textAlign:'center' },
  dept:    { fontSize:13, color:'#6b7c93', textAlign:'center', marginTop:2 },
  site:    { background:'#e3f2fd', borderRadius:12, padding:'12px 16px', marginBottom:20 },
  siteTitle:  { fontSize:11, color:'#1565c0', fontWeight:800, letterSpacing:1, textTransform:'uppercase', marginBottom:4 },
  siteName:   { fontSize:15, fontWeight:700, color:'#1a2540' },
  siteSub:    { fontSize:12, color:'#6b7c93', marginTop:2 },
  menuBtn: (color) => ({
    display:'flex', alignItems:'center', gap:14, padding:'16px 20px', borderRadius:14,
    background:color, border:'none', cursor:'pointer', width:'100%', marginBottom:10,
    boxShadow:'0 2px 8px rgba(0,0,0,0.08)',
  }),
  menuIcon:  { fontSize:28, width:40, textAlign:'center' },
  menuLabel: { fontSize:16, fontWeight:700, color:'#fff', flex:1, textAlign:'left' },
  menuSub:   { fontSize:11, color:'rgba(255,255,255,0.75)' },
  ackBox:    { background:'#fff8e1', border:'2px solid #ffcc02', borderRadius:16, padding:24, marginBottom:24, textAlign:'center' },
  ackAmt:    { fontSize:32, fontWeight:900, color:'#1a2540', margin:'12px 0' },
  ackBtn:    { background:'linear-gradient(135deg,#2e7d32,#43a047)', color:'#fff', border:'none', borderRadius:12, padding:'16px 32px', fontSize:17, fontWeight:800, cursor:'pointer', width:'100%' },
  error:     { textAlign:'center', padding:40, color:'#c62828' },
  loading:   { textAlign:'center', padding:60, color:'#6b7c93' },
  otpInp:    { width:'100%', padding:'14px', borderRadius:10, border:'2px solid #1565c0', fontSize:28, fontWeight:900, textAlign:'center', letterSpacing:12, outline:'none', fontFamily:'monospace', boxSizing:'border-box' },
  geoFlag:   { background:'#fff8e1', border:'1px solid #ffcc02', borderRadius:10, padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'flex-start', gap:8 },
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FieldPortal() {
  const [phase,       setPhase]       = useState('loading')
  // loading | device_check | otp_entry | never_registered | unregistered | inactive
  // | error | ack_pending | menu | form
  const [person,      setPerson]      = useState(null)
  const [personType,  setPersonType]  = useState(null)  // 'employee' | 'subcon' | 'outsource'
  const [assignment,  setAssignment]  = useState(null)
  const [pendingAck,  setPendingAck]  = useState(null)
  const [activeForm,  setActiveForm]  = useState(null)
  const [ackDone,     setAckDone]     = useState(false)
  const [error,       setError]       = useState('')

  // Device binding state
  const [otpValue,    setOtpValue]    = useState('')
  const [otpError,    setOtpError]    = useState('')
  const [otpLoading,  setOtpLoading]  = useState(false)

  // Geo-fence state
  const [geoFlagged,  setGeoFlagged]  = useState(false)
  const [geoDistance, setGeoDistance] = useState(null)

  // Store token + deviceId refs so they're available across async functions
  const tokenRef    = useRef(null)
  const deviceIdRef = useRef(null)

  useEffect(() => {
    const params  = new URLSearchParams(window.location.search)
    const token   = params.get('qr') || params.get('token')
    if (!token) { setError('No QR token found. Please scan your ID card QR code.'); setPhase('error'); return }
    tokenRef.current = token
    runDeviceCheck(token)
  }, [])

  // ── Device check ──────────────────────────────────────────────────────────
  async function runDeviceCheck(token) {
    setPhase('device_check')

    // Get or generate this device's UUID (stored per QR token)
    let deviceId = localStorage.getItem(`ratal_device_${token}`)
    if (!deviceId) {
      deviceId = crypto.randomUUID ? crypto.randomUUID()
        : 'dev-' + Math.random().toString(36).substring(2) + '-' + Date.now()
    }
    deviceIdRef.current = deviceId

    const { data, error: rpcErr } = await supabase.rpc('check_device', {
      p_token: token,
      p_device_uuid: deviceId,
    })

    if (rpcErr) {
      // RPC doesn't exist yet (patch not run) — fall through to identify for backward compat
      identify(token)
      return
    }

    const status = data?.status

    if (status === 'ok') {
      // Device matches — store the UUID (in case this is first time we stored it)
      localStorage.setItem(`ratal_device_${token}`, deviceId)
      identify(token)
    } else if (status === 'otp_pending') {
      setPhase('otp_entry')
    } else if (status === 'never_registered') {
      setPhase('never_registered')
    } else if (status === 'unregistered') {
      setPhase('unregistered')
    } else if (status === 'inactive') {
      setPhase('inactive')
    } else {
      // not_found or unknown
      setError('QR code not recognised. Please contact your supervisor.')
      setPhase('error')
    }
  }

  // ── OTP verification ──────────────────────────────────────────────────────
  async function verifyOTP() {
    if (otpValue.length !== 6) { setOtpError('Enter the 6-digit code'); return }
    setOtpLoading(true)
    setOtpError('')
    const { data } = await supabase.rpc('register_device', {
      p_token:      tokenRef.current,
      p_otp:        otpValue,
      p_device_uuid: deviceIdRef.current,
    })
    if (data?.ok) {
      localStorage.setItem(`ratal_device_${tokenRef.current}`, deviceIdRef.current)
      identify(tokenRef.current)
    } else {
      setOtpError(data?.reason === 'otp_expired' ? 'Code expired. Ask HR for a new one.' : 'Incorrect code. Try again.')
    }
    setOtpLoading(false)
  }

  // ── Identify person by QR token ───────────────────────────────────────────
  async function identify(token) {
    setPhase('loading')

    // 1. Try employee
    const { data: emp } = await supabase.rpc('get_employee_by_qr', { p_token: token })
    if (emp && emp.length > 0) {
      setPerson(emp[0]); setPersonType('employee')
      await loadContext('employee', emp[0])
      return
    }

    // 2. Try outsource person
    const { data: out } = await supabase.rpc('get_outsource_by_qr', { p_token: token })
    if (out && out.length > 0) {
      if (!out[0].is_active) {
        setError('Your engagement has ended. Contact HR for information.')
        setPhase('error')
        return
      }
      setPerson(out[0]); setPersonType('outsource')
      await loadContext('outsource', out[0])
      return
    }

    // 3. Try subcon
    const { data: sub } = await supabase.rpc('get_subcon_by_qr', { p_token: token })
    if (sub && sub.length > 0) {
      setPerson(sub[0]); setPersonType('subcon')
      await loadContext('subcon', sub[0])
      return
    }

    setError('QR code not recognised. Please contact your supervisor.')
    setPhase('error')
  }

  // ── Load context (site assignment + cash ack + geo-fence) ─────────────────
  async function loadContext(type, p) {
    const today = new Date().toISOString().split('T')[0]

    // Load site assignment
    const assignQ = type === 'subcon'
      ? supabase.from('site_assignments')
          .select('*, site_masters(id,sm_id,site_name,location,service_unit,milestones,latitude,longitude,geo_radius_m,geo_confirmed,is_remote)')
          .eq('subcon_id', p.id).eq('assignment_date', today).eq('status','ACTIVE').maybeSingle()
      : supabase.from('site_assignments')
          .select('*, site_masters(id,sm_id,site_name,location,service_unit,milestones,latitude,longitude,geo_radius_m,geo_confirmed,is_remote)')
          .eq('employee_id', p.id).eq('assignment_date', today).eq('status','ACTIVE').maybeSingle()

    const { data: assign } = await assignQ
    setAssignment(assign || null)

    // Capture GPS in background (don't block the portal loading)
    if (assign?.site_masters) {
      captureGPS(assign)
    }

    if (type === 'employee' || type === 'outsource') {
      const { data: dist } = await supabase.from('mr_distributions')
        .select('*, money_requests(request_number,amount,paid_from,purpose)')
        .eq('employee_id', p.id).eq('status','PENDING')
        .order('distributed_at').limit(1).maybeSingle()
      if (dist) { setPendingAck(dist); setPhase('ack_pending') }
      else setPhase('menu')
    } else {
      setPhase('menu')
    }
  }

  // ── GPS capture + geo-fence ───────────────────────────────────────────────
  function captureGPS(assign) {
    if (!navigator.geolocation) return
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        const site = assign.site_masters
        let flagged = false, distanceM = null

        if (site.geo_confirmed && site.latitude && site.longitude) {
          distanceM = haversineM(lat, lng, +site.latitude, +site.longitude)
          flagged = distanceM > (site.geo_radius_m || 200)
          if (flagged) setGeoFlagged(true), setGeoDistance(distanceM)
        }

        // Log submission for cluster analysis
        supabase.from('site_geo_submissions').insert({
          site_id:     site.id,
          qr_token:    tokenRef.current,
          person_type: personType || 'employee',
          latitude:    lat,
          longitude:   lng,
          geo_flagged: flagged,
          distance_m:  distanceM,
        }).then(async () => {
          // If site has no confirmed coordinates, check for auto-cluster
          if (!site.geo_confirmed) {
            await checkAutoCluster(site.id, lat, lng)
          }
        })
      },
      () => {}, // silently ignore GPS denial/unavailable
      { timeout: 10000, maximumAge: 60000, enableHighAccuracy: true }
    )
  }

  // ── Auto-coordinate cluster ───────────────────────────────────────────────
  async function checkAutoCluster(siteId, refLat, refLng) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: subs } = await supabase.from('site_geo_submissions')
      .select('latitude,longitude')
      .eq('site_id', siteId)
      .gte('submitted_at', since)

    if (!subs || subs.length < 3) return

    // Find cluster: submissions within 200m of this reading
    const cluster = subs.filter(s =>
      haversineM(refLat, refLng, +s.latitude, +s.longitude) <= 200
    )

    if (cluster.length >= 3) {
      // Calculate centroid
      const avgLat = cluster.reduce((sum, s) => sum + +s.latitude, 0) / cluster.length
      const avgLng = cluster.reduce((sum, s) => sum + +s.longitude, 0) / cluster.length
      // Propose coordinates to PM (PM sees this in SiteMaster)
      await supabase.from('site_masters').update({
        proposed_lat:   avgLat,
        proposed_lng:   avgLng,
        proposed_count: cluster.length,
      }).eq('id', siteId)
    }
  }

  // ── Ack receipt ───────────────────────────────────────────────────────────
  async function confirmReceipt() {
    if (!pendingAck) return
    const { error: err } = await supabase.from('mr_distributions').update({
      status: 'ACKNOWLEDGED', acknowledged_at: new Date().toISOString(), acknowledged_via: 'QR',
    }).eq('id', pendingAck.id)
    if (err) { alert('Error confirming. Try again.'); return }
    setAckDone(true)

    const { data: next } = await supabase.from('mr_distributions')
      .select('*, money_requests(request_number,amount,paid_from,purpose)')
      .eq('employee_id', person.id).eq('status','PENDING')
      .order('distributed_at').limit(1).maybeSingle()

    if (next) { setPendingAck(next); setAckDone(false) }
    else setTimeout(() => setPhase('menu'), 1200)
  }

  // ── Render: special phases ────────────────────────────────────────────────
  if (phase === 'loading' || phase === 'device_check') {
    return <div style={S.page}><div style={S.loading}>Verifying…</div></div>
  }

  if (phase === 'error') {
    return (
      <div style={S.page}>
        <div style={{ ...S.card, ...S.error }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🔒</div>
          {error}
        </div>
      </div>
    )
  }

  if (phase === 'otp_entry') {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.header}>
            <div style={S.logo}>RATAL</div>
            <div style={S.sub}>Device Setup</div>
          </div>
          <div style={{ textAlign:'center', marginBottom:24 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📱</div>
            <div style={{ fontWeight:800, fontSize:17, color:'#1a2540', marginBottom:8 }}>Enter Setup Code</div>
            <div style={{ fontSize:13, color:'#6b7c93' }}>
              HR has generated a 6-digit code for you. Enter it below to register this device.
            </div>
          </div>
          <input
            style={S.otpInp}
            type="number"
            maxLength={6}
            placeholder="000000"
            value={otpValue}
            onChange={e => setOtpValue(e.target.value.slice(0,6))}
            onKeyDown={e => e.key === 'Enter' && verifyOTP()}
          />
          {otpError && (
            <div style={{ color:'#c62828', fontSize:13, textAlign:'center', marginTop:10 }}>{otpError}</div>
          )}
          <button
            onClick={verifyOTP}
            disabled={otpLoading || otpValue.length !== 6}
            style={{ ...S.ackBtn, marginTop:16, opacity: otpValue.length !== 6 ? 0.5 : 1 }}>
            {otpLoading ? 'Verifying…' : 'Register Device'}
          </button>
          <div style={{ fontSize:11, color:'#aab2bd', textAlign:'center', marginTop:16 }}>
            Code is valid for 10 minutes. If expired, ask HR to generate a new one.
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'never_registered') {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.header}>
            <div style={S.logo}>RATAL</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:16 }}>📵</div>
            <div style={{ fontWeight:800, fontSize:17, color:'#1a2540', marginBottom:12 }}>Device Not Set Up</div>
            <div style={{ fontSize:13, color:'#6b7c93', marginBottom:24, lineHeight:1.6 }}>
              Your device has not been registered yet.
              Please visit HR with your phone. They will generate a setup code for you.
            </div>
            <div style={{ background:'#e3f2fd', borderRadius:12, padding:'14px 16px', fontSize:13, color:'#1565c0', textAlign:'left' }}>
              <strong>Steps:</strong>
              <ol style={{ margin:'8px 0 0 16px', padding:0, lineHeight:2 }}>
                <li>Go to HR with this phone</li>
                <li>HR clicks "Generate Setup Code" on your record</li>
                <li>They read you a 6-digit code</li>
                <li>Scan your QR again and enter the code</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'unregistered') {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.header}>
            <div style={S.logo}>RATAL</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:16 }}>🔐</div>
            <div style={{ fontWeight:800, fontSize:17, color:'#1a2540', marginBottom:12 }}>Unregistered Device</div>
            <div style={{ fontSize:13, color:'#6b7c93', marginBottom:24, lineHeight:1.6 }}>
              This phone is not registered for your QR code.
              If you have a new phone or your old phone was damaged, HR can re-register your device.
            </div>
            <div style={{ background:'#fff3e0', borderRadius:12, padding:'14px 16px', fontSize:13, color:'#e65100', textAlign:'left' }}>
              <strong>Got a new phone?</strong> Visit HR with this phone. They will generate a new setup code and register this device.
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (phase === 'inactive') {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.header}>
            <div style={S.logo}>RATAL</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:48, marginBottom:16 }}>🔒</div>
            <div style={{ fontWeight:800, fontSize:17, color:'#1a2540', marginBottom:12 }}>Account Inactive</div>
            <div style={{ fontSize:13, color:'#6b7c93', lineHeight:1.6 }}>
              Your account is currently inactive. If you have been re-hired,
              please contact HR to activate your engagement.
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: active form ───────────────────────────────────────────────────
  if (activeForm) return (
    <div style={S.page}>
      <div style={{ width:'100%', maxWidth:440, marginBottom:12 }}>
        <button onClick={() => setActiveForm(null)}
          style={{ background:'none', border:'none', color:'#1565c0', fontSize:14, fontWeight:700, cursor:'pointer', padding:0 }}>
          ← Back
        </button>
      </div>
      {activeForm === 'expense'  && <FieldExpense    person={person} assignment={assignment} />}
      {activeForm === 'food'     && <FieldFood        person={person} assignment={assignment} />}
      {activeForm === 'overtime' && <FieldOvertime    person={person} assignment={assignment} />}
      {activeForm === 'site'     && <FieldSiteStatus  person={person} assignment={assignment} personType={personType} />}
    </div>
  )

  // ── Render: main card ─────────────────────────────────────────────────────
  return (
    <div style={S.page}>
      <div style={S.card}>

        {/* Header */}
        <div style={S.header}>
          <div style={S.logo}>RATAL</div>
          <div style={S.sub}>ACCSYS Field Operations</div>
        </div>

        {/* Person identity */}
        <div style={S.name}>{person?.full_name_en || person?.contractor_name}</div>
        <div style={S.dept}>
          {personType === 'employee'
            ? `${person?.department || '—'} · ${person?.employee_id || ''}`
            : personType === 'outsource'
              ? `${person?.department_name || 'Outsource'} · ${person?.person_code || ''}`
              : `Sub-Contractor · ${person?.department || '—'}`}
        </div>

        {/* Geo-fence flag banner */}
        {geoFlagged && (
          <div style={{ ...S.geoFlag, marginTop:14 }}>
            <div style={{ fontSize:18, flexShrink:0 }}>⚠️</div>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'#856404' }}>Location Check</div>
              <div style={{ fontSize:11, color:'#6b7c93', marginTop:2 }}>
                You appear to be {geoDistance?.toLocaleString()}m from your assigned site.
                Your submission has been flagged — your supervisor will be notified.
              </div>
            </div>
          </div>
        )}

        {/* Today's site assignment */}
        {assignment ? (
          <div style={{ ...S.site, marginTop:16 }}>
            <div style={S.siteTitle}>Today's Site</div>
            <div style={S.siteName}>{assignment.site_masters?.site_name || assignment.sm_id}</div>
            <div style={S.siteSub}>{assignment.site_masters?.location}</div>
            <div style={S.siteSub}>{assignment.site_masters?.service_unit} · {assignment.sm_id || assignment.site_masters?.sm_id}</div>
            {assignment.is_remote === false && (
              <div style={{ marginTop:6, fontSize:11, color:'#e65100', fontWeight:700 }}>📍 Local Site — Food allowance not applicable</div>
            )}
            {assignment.site_masters && !assignment.site_masters.geo_confirmed && (
              <div style={{ marginTop:6, fontSize:10, color:'#9e9e9e' }}>📡 GPS recorded — helping map this site</div>
            )}
          </div>
        ) : (
          <div style={{ background:'#fff3e0', borderRadius:12, padding:'10px 14px', marginTop:16, marginBottom:16 }}>
            <div style={{ fontSize:12, color:'#e65100', fontWeight:700 }}>⚠ No site assigned for today</div>
            <div style={{ fontSize:11, color:'#6b7c93', marginTop:3 }}>Contact your PM to assign you to a site.</div>
          </div>
        )}

        {/* ── Acknowledgement gate ── */}
        {phase === 'ack_pending' && (
          <div>
            <div style={S.ackBox}>
              <div style={{ fontSize:13, color:'#856404', fontWeight:700 }}>💵 Cash Pending Confirmation</div>
              <div style={S.ackAmt}>SAR {(pendingAck?.amount||0).toLocaleString()}</div>
              <div style={{ fontSize:12, color:'#6b7c93', marginBottom:4 }}>
                {pendingAck?.money_requests?.request_number} · {pendingAck?.money_requests?.paid_from}
              </div>
              <div style={{ fontSize:13, color:'#1a2540', marginBottom:16 }}>
                {pendingAck?.money_requests?.purpose}
              </div>
              {ackDone ? (
                <div style={{ color:'#2e7d32', fontWeight:700, fontSize:16 }}>✅ Confirmed! Loading…</div>
              ) : (
                <button style={S.ackBtn} onClick={confirmReceipt}>✓ I Received This Cash</button>
              )}
            </div>
            <div style={{ fontSize:11, color:'#6b7c93', textAlign:'center' }}>
              You must confirm receipt before accessing any forms.
            </div>
          </div>
        )}

        {/* ── Menu ── */}
        {phase === 'menu' && (
          <div style={{ marginTop:20 }}>
            {(personType === 'employee' || personType === 'outsource') && <>
              <button style={S.menuBtn('#1565c0')} onClick={() => setActiveForm('expense')}>
                <span style={S.menuIcon}>🧾</span>
                <div>
                  <div style={S.menuLabel}>Expense</div>
                  <div style={S.menuSub}>Photo → amount → submit</div>
                </div>
              </button>

              <button
                style={S.menuBtn(assignment?.is_remote !== false ? '#2e7d32' : '#9e9e9e')}
                onClick={() => assignment?.is_remote !== false && setActiveForm('food')}
                disabled={assignment?.is_remote === false}>
                <span style={S.menuIcon}>🍽️</span>
                <div>
                  <div style={S.menuLabel}>Food Allowance</div>
                  <div style={S.menuSub}>
                    {assignment?.is_remote === false
                      ? 'Disabled — local site'
                      : 'One tap claim · SAR ' + (person?.food_allowance_rate || person?.daily_rate || 30)}
                  </div>
                </div>
              </button>

              {personType === 'employee' && (
                <button
                  style={S.menuBtn(person?.ot_allowed ? '#6a1b9a' : '#9e9e9e')}
                  onClick={() => person?.ot_allowed && setActiveForm('overtime')}
                  disabled={!person?.ot_allowed}>
                  <span style={S.menuIcon}>⏱️</span>
                  <div>
                    <div style={S.menuLabel}>Overtime</div>
                    <div style={S.menuSub}>{person?.ot_allowed ? 'Time in + time out' : 'Not authorised'}</div>
                  </div>
                </button>
              )}
            </>}

            {/* Site Status — all types */}
            {assignment ? (
              <button style={S.menuBtn('#e65100')} onClick={() => setActiveForm('site')}>
                <span style={S.menuIcon}>📍</span>
                <div>
                  <div style={S.menuLabel}>Site Status</div>
                  <div style={S.menuSub}>Update milestone + photo</div>
                </div>
              </button>
            ) : (
              <div style={{ textAlign:'center', color:'#aab2bd', fontSize:12, marginTop:8 }}>
                Site Status unavailable — no site assigned today
              </div>
            )}

            <div style={{ textAlign:'center', fontSize:11, color:'#aab2bd', marginTop:20 }}>
              {new Date().toLocaleDateString('en-SA', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
