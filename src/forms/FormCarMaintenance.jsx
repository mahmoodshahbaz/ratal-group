/**
 * FormCarMaintenance.jsx — Field Vehicle Log
 * Route: /forms/car-maintenance
 * Auth:  useFieldAuth (DRIVER, STAFF_DH, STAFF_PM, STAFF_SUPERVISOR, FINANCE)
 *
 * Log types:
 *   ⛽ FUEL       — fuel fill-up (liters, cost, odometer, station)
 *   🔧 MAINTENANCE — maintenance request (type, description, urgency, photo)
 *   ⚠️ INCIDENT   — accident / damage report (photos mandatory, location, description)
 *   📋 INSPECTION  — pre/post-trip checklist (tyres, lights, oil, brakes, wipers)
 *
 * All logs go to vehicle_maintenance table with source = 'FIELD'
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useFieldAuth, ROLE_COLORS }                 from '../lib/useFieldAuth'
import { supabase }                                  from '../lib/supabase'
import { uploadToDrive }                             from '../hooks/useDriveUpload'

// ── Constants ─────────────────────────────────────────────────────────────────
const LOG_TYPES = [
  { key:'FUEL',        label:'Fuel Fill-up',       labelAr:'تعبئة وقود',      icon:'⛽', color:'#e65100', desc:'Record fuel quantity, cost and odometer' },
  { key:'MAINTENANCE', label:'Maintenance Request', labelAr:'طلب صيانة',       icon:'🔧', color:'#1565c0', desc:'Report a fault or schedule service' },
  { key:'INCIDENT',    label:'Incident / Accident', labelAr:'حادث / ضرر',      icon:'⚠️', color:'#c62828', desc:'Report damage or road incident' },
  { key:'INSPECTION',  label:'Trip Inspection',     labelAr:'فحص الرحلة',      icon:'📋', color:'#2e7d32', desc:'Pre/post-trip vehicle checklist' },
]

const MAINT_TYPES = [
  'OIL_CHANGE','TYRE_CHANGE','BRAKE_SERVICE','AC_SERVICE',
  'BATTERY','ACCIDENT_REPAIR','PERIODIC_SERVICE','MAJOR_REPAIR','OTHER',
]
const MAINT_LABELS = {
  OIL_CHANGE:'Oil Change', TYRE_CHANGE:'Tyre Change/Puncture', BRAKE_SERVICE:'Brake Service',
  AC_SERVICE:'A/C Service', BATTERY:'Battery', ACCIDENT_REPAIR:'Accident Repair',
  PERIODIC_SERVICE:'Periodic Service', MAJOR_REPAIR:'Major Repair', OTHER:'Other',
}

const URGENCY = [
  { key:'LOW',      label:'Low',      color:'#2e7d32', desc:'Not urgent — schedule next service' },
  { key:'MEDIUM',   label:'Medium',   color:'#f57c00', desc:'Should be fixed within a week' },
  { key:'HIGH',     label:'High',     color:'#c62828', desc:'Fix before next trip' },
  { key:'CRITICAL', label:'Critical', color:'#7b1fa2', desc:'Do NOT drive — immediate attention required' },
]

const INSPECTION_ITEMS = [
  { key:'tyres',     label:'Tyres & Pressure',   icon:'🔵' },
  { key:'lights',    label:'Lights & Indicators', icon:'💡' },
  { key:'oil',       label:'Oil Level',           icon:'🛢️' },
  { key:'brakes',    label:'Brakes',              icon:'🔴' },
  { key:'wipers',    label:'Wipers',              icon:'💧' },
  { key:'fuel',      label:'Fuel Level',          icon:'⛽' },
  { key:'mirrors',   label:'Mirrors & Glass',     icon:'🪟' },
  { key:'seatbelts', label:'Seat Belts',          icon:'🔒' },
  { key:'horn',      label:'Horn',                icon:'📣' },
  { key:'ac',        label:'A/C',                 icon:'❄️' },
]

// ── Styles ────────────────────────────────────────────────────────────────────
const C = { orange:'#e65100', blue:'#1565c0', green:'#2e7d32', red:'#c62828', bg:'#f0f4f8', card:'#fff', muted:'#6b7c93', text:'#1a2540' }
const S = {
  wrap:    { minHeight:'100vh', background:C.bg, fontFamily:"'Segoe UI',system-ui,sans-serif" },
  header:  (color) => ({ background:`linear-gradient(135deg,${color},${color}dd)`, color:'#fff', padding:'20px 18px 18px' }),
  h1:      { fontSize:20, fontWeight:900, marginBottom:2 },
  body:    { padding:'14px 16px 40px' },
  card:    { background:C.card, borderRadius:16, padding:18, marginBottom:14, boxShadow:'0 2px 8px rgba(0,0,0,0.07)' },
  label:   { display:'block', fontSize:12, color:C.muted, fontWeight:700, marginBottom:5 },
  inp:     { width:'100%', padding:'11px 12px', borderRadius:10, border:'1.5px solid #dde3ec', fontSize:14, outline:'none', fontFamily:'inherit', boxSizing:'border-box' },
  sel:     { width:'100%', padding:'11px 12px', borderRadius:10, border:'1.5px solid #dde3ec', fontSize:14, outline:'none', fontFamily:'inherit', boxSizing:'border-box', background:'#fff' },
  row2:    { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 },
  row1:    { marginBottom:14 },
  bigBtn:  (color) => ({ background:color, color:'#fff', border:'none', borderRadius:14, padding:'16px', fontSize:16, fontWeight:800, cursor:'pointer', width:'100%', marginTop:4 }),
  photoBox:{ border:'2px dashed #dde3ec', borderRadius:14, padding:20, textAlign:'center', cursor:'pointer' },
  typeBtn: (active, color) => ({
    display:'flex', flexDirection:'column', alignItems:'center', gap:6, padding:'14px 10px',
    borderRadius:14, border:`2px solid ${active ? color : '#dde3ec'}`,
    background: active ? color+'14' : '#fafbfc',
    cursor:'pointer', transition:'all 0.15s', flex:1,
  }),
  checkRow:{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid #f0f4f8' },
  urgBtn:  (active, color) => ({
    flex:1, padding:'10px 6px', borderRadius:10, border:`2px solid ${active ? color : '#dde3ec'}`,
    background: active ? color+'18' : '#fafbfc', cursor:'pointer', textAlign:'center',
    fontWeight: active ? 800 : 500, color: active ? color : C.muted, fontSize:12,
  }),
}

// ── Photo capture widget ──────────────────────────────────────────────────────
function PhotoCapture({ label, value, onChange, required }) {
  const ref = useRef()
  return (
    <div style={S.row1}>
      <label style={S.label}>{label}{required && ' *'}</label>
      <div style={{ ...S.photoBox, borderColor: value ? C.orange : '#dde3ec' }}
        onClick={() => ref.current?.click()}>
        {value
          ? <img src={value} alt="photo" style={{ maxHeight:160, maxWidth:'100%', borderRadius:10, objectFit:'cover' }} />
          : <><div style={{ fontSize:36, marginBottom:6 }}>📷</div>
              <div style={{ fontSize:13, color:C.muted }}>Tap to take a photo</div></>
        }
      </div>
      {value && (
        <div style={{ fontSize:11, color:C.orange, cursor:'pointer', textAlign:'right', marginTop:4 }}
          onClick={() => onChange(null, null)}>✕ Remove</div>
      )}
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) onChange(URL.createObjectURL(f), f)
        }} />
    </div>
  )
}

// ── Auth guard ────────────────────────────────────────────────────────────────
function AuthGuard({ error }) {
  const msgs = {
    no_token: { icon:'🔒', title:'Scan QR Code', body:'Please scan your QR code to log a vehicle report.' },
    invalid_token: { icon:'❌', title:'Invalid QR', body:'QR not recognised. Contact your DH.' },
    token_inactive: { icon:'⛔', title:'QR Expired', body:'Ask your DH for a fresh QR code.' },
    employee_inactive: { icon:'🚫', title:'Account Inactive', body:'Contact HR.' },
  }
  const m = msgs[error] || msgs.no_token
  return (
    <div style={{ ...S.wrap, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:C.card, borderRadius:20, padding:40, maxWidth:360, width:'100%', textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,0.10)' }}>
        <div style={{ fontSize:56, marginBottom:12 }}>{m.icon}</div>
        <div style={{ fontSize:18, fontWeight:800, color:C.red, marginBottom:8 }}>{m.title}</div>
        <div style={{ fontSize:13, color:C.muted }}>{m.body}</div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FORM
// ═══════════════════════════════════════════════════════════════════════════════
export default function FormCarMaintenance() {
  const auth = useFieldAuth()

  const [vehicles,    setVehicles]    = useState([])
  const [loadingVeh,  setLoadingVeh]  = useState(true)

  // Step: 'vehicle' | 'type' | 'details' | 'done'
  const [step,        setStep]        = useState('vehicle')
  const [vehicle,     setVehicle]     = useState(null)
  const [logType,     setLogType]     = useState(null)
  const [submitting,  setSubmitting]  = useState(false)

  // Fuel fields
  const [fuelLiters,  setFuelLiters]  = useState('')
  const [fuelCost,    setFuelCost]    = useState('')
  const [fuelStation, setFuelStation] = useState('')
  const [odometer,    setOdometer]    = useState('')

  // Maintenance fields
  const [maintType,   setMaintType]   = useState('OIL_CHANGE')
  const [urgency,     setUrgency]     = useState('MEDIUM')
  const [description, setDescription] = useState('')
  const [workshop,    setWorkshop]    = useState('')

  // Incident fields
  const [location,    setLocation]    = useState('')
  const [incidentDesc,setIncidentDesc]= useState('')

  // Inspection checklist
  const [checks, setChecks] = useState(
    Object.fromEntries(INSPECTION_ITEMS.map(i => [i.key, null]))  // null = unchecked, true = OK, false = FAULT
  )

  // Photos
  const [photo1Prev,  setPhoto1Prev]  = useState(null)
  const [photo1File,  setPhoto1File]  = useState(null)
  const [photo2Prev,  setPhoto2Prev]  = useState(null)
  const [photo2File,  setPhoto2File]  = useState(null)

  // Load vehicles
  useEffect(() => {
    if (auth.loading) return
    supabase.from('vehicles').select('id, plate_number, make, model, color, fuel_type, odometer_reading')
      .eq('status', 'ACTIVE')
      .order('plate_number')
      .then(({ data }) => { setVehicles(data || []); setLoadingVeh(false) })
  }, [auth.loading, auth.entityId])

  async function uploadPhoto(file, folder) {
    if (!file) return null
    const result = await uploadToDrive(file, folder)
    return result ? result.viewUrl : null
  }

  async function submit() {
    setSubmitting(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      const now   = new Date().toISOString()

      // Validate
      if (logType === 'INCIDENT' && !photo1File) {
        alert('At least one photo is required for an incident report.'); setSubmitting(false); return
      }
      if (logType === 'FUEL' && !fuelLiters) {
        alert('Please enter fuel quantity.'); setSubmitting(false); return
      }

      const [url1, url2] = await Promise.all([
        uploadPhoto(photo1File, `vehicle-logs/${vehicle.id}`),
        uploadPhoto(photo2File, `vehicle-logs/${vehicle.id}`),
      ])

      // Build payload for vehicle_maintenance
      const payload = {
        entity_id:         auth.entityId,
        vehicle_id:        vehicle.id,
        service_date:      today,
        source:            'FIELD',
        log_type:          logType,
        submitted_by:      auth.employee?.id,
        status:            'OPEN',
        photo_url:         url1,
        photo_url_2:       url2,
        odometer_at_service: odometer ? +odometer : null,
      }

      if (logType === 'FUEL') {
        Object.assign(payload, {
          maintenance_type: 'FUEL',
          fuel_liters:      +fuelLiters || null,
          fuel_amount:      +fuelCost   || null,
          cost:             +fuelCost   || 0,
          description:      fuelStation ? `Fuel station: ${fuelStation}` : null,
        })
        // Update vehicle odometer if higher
        if (odometer && +odometer > (vehicle.odometer_reading || 0)) {
          await supabase.from('vehicles').update({ odometer_reading: +odometer }).eq('id', vehicle.id)
        }

      } else if (logType === 'MAINTENANCE') {
        Object.assign(payload, {
          maintenance_type: maintType,
          description:      description || null,
          urgency:          urgency,
          workshop_name:    workshop || null,
        })

      } else if (logType === 'INCIDENT') {
        Object.assign(payload, {
          maintenance_type: 'ACCIDENT_REPAIR',
          description:      incidentDesc || null,
          location:         location     || null,
          urgency:          'HIGH',
        })

      } else if (logType === 'INSPECTION') {
        const faults = INSPECTION_ITEMS.filter(i => checks[i.key] === false).map(i => i.label)
        Object.assign(payload, {
          maintenance_type:      'PERIODIC_SERVICE',
          inspection_checklist:  checks,
          urgency:               faults.length > 0 ? 'MEDIUM' : 'LOW',
          description:           faults.length > 0
            ? `Faults found: ${faults.join(', ')}`
            : 'All items checked — no faults found.',
        })
      }

      const { error } = await supabase.from('vehicle_maintenance').insert(payload)
      if (error) throw error

      // Notify DH/PM
      if (logType === 'INCIDENT' || urgency === 'HIGH' || urgency === 'CRITICAL') {
        await supabase.from('notifications').insert({
          entity_id:   auth.entityId,
          employee_id: auth.employee?.id,
          type:        'GENERAL',
          title:       `Vehicle Report — ${vehicle.plate_number}`,
          body:        logType === 'INCIDENT'
            ? `Incident reported on ${vehicle.plate_number}. Immediate review required.`
            : `${MAINT_LABELS[maintType]||logType} reported on ${vehicle.plate_number} — urgency: ${urgency}.`,
          metadata:    { vehicle_id: vehicle.id, log_type: logType, urgency },
        }).then(() => {})
      }

      setStep('done')
    } catch (err) {
      alert(err.message || 'Submission failed. Please try again.')
    }
    setSubmitting(false)
  }

  // ── Loading / Auth ───────────────────────────────────────────────────────
  if (auth.loading) {
    return (
      <div style={{ ...S.wrap, display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
        <div style={{ textAlign:'center', color:C.muted }}><div style={{ fontSize:36 }}>⏳</div><div style={{ marginTop:12 }}>Checking authentication…</div></div>
      </div>
    )
  }
  if (auth.error) return <AuthGuard error={auth.error} />

  const activeType = LOG_TYPES.find(t => t.key === logType)
  const headerColor = activeType?.color || '#1a2540'
  const roleColor   = ROLE_COLORS[auth.role] || '#37474f'

  // ── SUCCESS ──────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div style={S.wrap}>
        <div style={S.header(headerColor)}>
          <div style={S.h1}>{activeType?.icon} {activeType?.label}</div>
          <div style={{ fontSize:12, opacity:0.8 }}>{vehicle?.plate_number} · {vehicle?.make} {vehicle?.model}</div>
        </div>
        <div style={{ ...S.body, display:'flex', flexDirection:'column', alignItems:'center', paddingTop:40 }}>
          <div style={{ fontSize:72, marginBottom:16 }}>✅</div>
          <div style={{ fontSize:20, fontWeight:800, color:C.green, marginBottom:8, textAlign:'center' }}>Report Submitted!</div>
          <div style={{ fontSize:14, color:C.muted, textAlign:'center', marginBottom:30 }}>
            Your {activeType?.label?.toLowerCase()} for <strong>{vehicle.plate_number}</strong> has been logged.
            {(logType === 'INCIDENT' || urgency === 'HIGH' || urgency === 'CRITICAL') &&
              ' Your DH has been notified.'}
          </div>
          <button style={S.bigBtn(headerColor)}
            onClick={() => {
              setStep('vehicle'); setVehicle(null); setLogType(null)
              setFuelLiters(''); setFuelCost(''); setFuelStation(''); setOdometer('')
              setMaintType('OIL_CHANGE'); setUrgency('MEDIUM'); setDescription(''); setWorkshop('')
              setLocation(''); setIncidentDesc('')
              setPhoto1Prev(null); setPhoto1File(null); setPhoto2Prev(null); setPhoto2File(null)
              setChecks(Object.fromEntries(INSPECTION_ITEMS.map(i => [i.key, null])))
            }}>
            Submit Another Report
          </button>
        </div>
      </div>
    )
  }

  // ── STEP 1: Vehicle Picker ────────────────────────────────────────────────
  if (step === 'vehicle') {
    return (
      <div style={S.wrap}>
        <div style={S.header('#1a2540')}>
          <div style={S.h1}>🚗 Vehicle Report</div>
          <div style={{ fontSize:12, opacity:0.7 }}>{auth.employee?.full_name_en} · {auth.employee?.designation}</div>
        </div>
        <div style={S.body}>
          <div style={S.card}>
            <div style={{ fontWeight:800, fontSize:15, color:C.text, marginBottom:14 }}>Which vehicle?</div>
            {loadingVeh && <div style={{ color:C.muted, textAlign:'center', padding:20 }}>Loading vehicles…</div>}
            {!loadingVeh && vehicles.map(v => (
              <div key={v.id}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, border:'2px solid #dde3ec', marginBottom:8, cursor:'pointer', background:'#fafbfc' }}
                onClick={() => { setVehicle(v); setOdometer(v.odometer_reading?.toString() || ''); setStep('type') }}>
                <div style={{ fontSize:28 }}>🚗</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:C.text }}>{v.plate_number}</div>
                  <div style={{ fontSize:12, color:C.muted }}>{v.make} {v.model} · {v.color}</div>
                  {v.odometer_reading > 0 && <div style={{ fontSize:11, color:C.blue }}>Odometer: {v.odometer_reading?.toLocaleString()} km</div>}
                </div>
                <div style={{ color:C.orange, fontSize:18 }}>›</div>
              </div>
            ))}
            {/* Manual entry if no vehicles or not found */}
            {!loadingVeh && (
              <div style={{ marginTop:12 }}>
                <div style={{ fontSize:12, color:C.muted, textAlign:'center', marginBottom:10 }}>Vehicle not listed?</div>
                <div style={{ display:'flex', gap:8 }}>
                  <input
                    style={{ ...S.inp, flex:1 }}
                    placeholder="Type plate number (e.g. AAA 0000)"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && e.target.value.trim()) {
                        setVehicle({ id: null, plate_number: e.target.value.trim(), make:'', model:'', odometer_reading:0 })
                        setStep('type')
                      }
                    }}
                  />
                  <button style={{ ...S.bigBtn('#37474f'), width:'auto', padding:'11px 18px', marginTop:0, borderRadius:10, fontSize:13 }}
                    onClick={e => {
                      const inp = e.target.previousSibling
                      if (inp.value.trim()) {
                        setVehicle({ id: null, plate_number: inp.value.trim(), make:'', model:'', odometer_reading:0 })
                        setStep('type')
                      }
                    }}>→</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── STEP 2: Log Type Picker ───────────────────────────────────────────────
  if (step === 'type') {
    return (
      <div style={S.wrap}>
        <div style={S.header('#1a2540')}>
          <div style={S.h1}>🚗 {vehicle?.plate_number}</div>
          <div style={{ fontSize:12, opacity:0.7 }}>{vehicle?.make} {vehicle?.model}</div>
        </div>
        <div style={S.body}>
          <div style={{ fontWeight:700, fontSize:13, color:C.muted, marginBottom:12 }}>What are you reporting?</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
            {LOG_TYPES.map(t => (
              <div key={t.key} style={S.typeBtn(false, t.color)}
                onClick={() => { setLogType(t.key); setStep('details') }}>
                <div style={{ fontSize:36 }}>{t.icon}</div>
                <div style={{ fontWeight:800, fontSize:13, color:t.color }}>{t.label}</div>
                <div style={{ fontSize:10, color:C.muted, textAlign:'center' }}>{t.desc}</div>
              </div>
            ))}
          </div>
          <button style={{ ...S.bigBtn('#6b7c93') }} onClick={() => setStep('vehicle')}>← Back</button>
        </div>
      </div>
    )
  }

  // ── STEP 3: Details Form ──────────────────────────────────────────────────
  return (
    <div style={S.wrap}>
      <div style={S.header(headerColor)}>
        <div style={S.h1}>{activeType?.icon} {activeType?.label}</div>
        <div style={{ fontSize:12, opacity:0.8 }}>{vehicle?.plate_number} · {vehicle?.make} {vehicle?.model}</div>
      </div>
      <div style={S.body}>

        {/* ── FUEL ── */}
        {logType === 'FUEL' && (
          <div style={S.card}>
            <div style={S.row2}>
              <div>
                <label style={S.label}>Liters *</label>
                <input type="number" style={S.inp} value={fuelLiters} onChange={e=>setFuelLiters(e.target.value)} placeholder="e.g. 45" />
              </div>
              <div>
                <label style={S.label}>Cost (SAR) *</label>
                <input type="number" style={S.inp} value={fuelCost} onChange={e=>setFuelCost(e.target.value)} placeholder="e.g. 180" />
              </div>
            </div>
            <div style={S.row2}>
              <div>
                <label style={S.label}>Odometer (km)</label>
                <input type="number" style={S.inp} value={odometer} onChange={e=>setOdometer(e.target.value)} placeholder={vehicle?.odometer_reading || '0'} />
              </div>
              <div>
                <label style={S.label}>Station / Location</label>
                <input style={S.inp} value={fuelStation} onChange={e=>setFuelStation(e.target.value)} placeholder="e.g. ADNOC Riyadh" />
              </div>
            </div>
            <PhotoCapture label="Receipt Photo" value={photo1Prev}
              onChange={(prev, file) => { setPhoto1Prev(prev); setPhoto1File(file) }} />
          </div>
        )}

        {/* ── MAINTENANCE ── */}
        {logType === 'MAINTENANCE' && (
          <div style={S.card}>
            <div style={S.row1}>
              <label style={S.label}>Maintenance Type *</label>
              <select style={S.sel} value={maintType} onChange={e=>setMaintType(e.target.value)}>
                {MAINT_TYPES.map(t => <option key={t} value={t}>{MAINT_LABELS[t]}</option>)}
              </select>
            </div>
            <div style={S.row1}>
              <label style={S.label}>Urgency *</label>
              <div style={{ display:'flex', gap:8 }}>
                {URGENCY.map(u => (
                  <div key={u.key} style={S.urgBtn(urgency===u.key, u.color)}
                    onClick={() => setUrgency(u.key)}>
                    {u.label}
                  </div>
                ))}
              </div>
              <div style={{ fontSize:11, color: URGENCY.find(u=>u.key===urgency)?.color, marginTop:6 }}>
                {URGENCY.find(u=>u.key===urgency)?.desc}
              </div>
            </div>
            <div style={S.row2}>
              <div>
                <label style={S.label}>Odometer (km)</label>
                <input type="number" style={S.inp} value={odometer} onChange={e=>setOdometer(e.target.value)} />
              </div>
              <div>
                <label style={S.label}>Workshop (optional)</label>
                <input style={S.inp} value={workshop} onChange={e=>setWorkshop(e.target.value)} placeholder="Workshop name" />
              </div>
            </div>
            <div style={S.row1}>
              <label style={S.label}>Description</label>
              <textarea rows={3} style={{ ...S.inp, resize:'none' }}
                placeholder="Describe the issue or service needed…"
                value={description} onChange={e=>setDescription(e.target.value)} />
            </div>
            <PhotoCapture label="Photo of issue" value={photo1Prev}
              onChange={(prev, file) => { setPhoto1Prev(prev); setPhoto1File(file) }} />
          </div>
        )}

        {/* ── INCIDENT ── */}
        {logType === 'INCIDENT' && (
          <div style={S.card}>
            <div style={{ background:'#ffebee', borderRadius:10, padding:'10px 14px', marginBottom:14 }}>
              <div style={{ fontWeight:800, color:C.red, fontSize:13 }}>⚠️ Incident Report</div>
              <div style={{ fontSize:12, color:C.muted, marginTop:2 }}>Photos are mandatory. Do not move the vehicle until photos are taken if safe to do so.</div>
            </div>
            <div style={S.row1}>
              <label style={S.label}>Location / Address *</label>
              <input style={S.inp} value={location} onChange={e=>setLocation(e.target.value)}
                placeholder="Where did the incident happen?" />
            </div>
            <div style={S.row1}>
              <label style={S.label}>Description *</label>
              <textarea rows={3} style={{ ...S.inp, resize:'none' }}
                placeholder="What happened? Any third parties involved?"
                value={incidentDesc} onChange={e=>setIncidentDesc(e.target.value)} />
            </div>
            <div style={S.row1}>
              <label style={S.label}>Odometer (km)</label>
              <input type="number" style={S.inp} value={odometer} onChange={e=>setOdometer(e.target.value)} />
            </div>
            <PhotoCapture label="Photo 1 — Overall damage" required value={photo1Prev}
              onChange={(prev, file) => { setPhoto1Prev(prev); setPhoto1File(file) }} />
            <PhotoCapture label="Photo 2 — Close-up / other angle" value={photo2Prev}
              onChange={(prev, file) => { setPhoto2Prev(prev); setPhoto2File(file) }} />
          </div>
        )}

        {/* ── INSPECTION ── */}
        {logType === 'INSPECTION' && (
          <div style={S.card}>
            <div style={{ fontWeight:800, fontSize:14, color:C.text, marginBottom:4 }}>Trip Inspection Checklist</div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:14 }}>
              Tap each item: ✅ OK or ❌ Fault
            </div>
            {INSPECTION_ITEMS.map(item => {
              const val = checks[item.key]
              return (
                <div key={item.key} style={S.checkRow}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:20 }}>{item.icon}</span>
                    <span style={{ fontSize:14, color:C.text, fontWeight: val !== null ? 600 : 400 }}>{item.label}</span>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button
                      style={{ padding:'6px 12px', borderRadius:8, border:'none', cursor:'pointer',
                        background: val === true ? '#2e7d32' : '#e8f5e9', color: val === true ? '#fff' : '#2e7d32',
                        fontWeight:700, fontSize:13 }}
                      onClick={() => setChecks(c => ({ ...c, [item.key]: val === true ? null : true }))}>
                      ✅
                    </button>
                    <button
                      style={{ padding:'6px 12px', borderRadius:8, border:'none', cursor:'pointer',
                        background: val === false ? '#c62828' : '#ffebee', color: val === false ? '#fff' : '#c62828',
                        fontWeight:700, fontSize:13 }}
                      onClick={() => setChecks(c => ({ ...c, [item.key]: val === false ? null : false }))}>
                      ❌
                    </button>
                  </div>
                </div>
              )
            })}
            <div style={{ marginTop:14 }}>
              <label style={S.label}>Notes (optional)</label>
              <textarea rows={2} style={{ ...S.inp, resize:'none' }}
                placeholder="Any additional observations…"
                value={description} onChange={e=>setDescription(e.target.value)} />
            </div>
            <PhotoCapture label="Photo (optional)" value={photo1Prev}
              onChange={(prev, file) => { setPhoto1Prev(prev); setPhoto1File(file) }} />

            {/* Fault summary */}
            {INSPECTION_ITEMS.some(i => checks[i.key] === false) && (
              <div style={{ background:'#ffebee', borderRadius:10, padding:'10px 14px', marginTop:8 }}>
                <div style={{ fontWeight:800, color:C.red, fontSize:12 }}>Faults found:</div>
                {INSPECTION_ITEMS.filter(i => checks[i.key] === false).map(i => (
                  <div key={i.key} style={{ fontSize:12, color:C.red }}>· {i.label}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Submit + Back */}
        <button style={{ ...S.bigBtn(headerColor), opacity: submitting ? 0.7 : 1 }}
          onClick={submit} disabled={submitting}>
          {submitting ? 'Submitting…' : `Submit ${activeType?.label}`}
        </button>
        <button style={{ ...S.bigBtn('#6b7c93'), marginTop:10 }}
          onClick={() => setStep('type')} disabled={submitting}>
          ← Back
        </button>
      </div>
    </div>
  )
}
