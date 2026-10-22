/**
 * FormCarMaintenance.jsx — Vehicle Report Form v2
 * Route: /forms/car-maintenance
 * Auth:  useFieldAuth — only employees with an assigned vehicle
 *
 * Screens:
 *   no_vehicle   → employee has no assigned vehicle
 *   vehicle      → pick assigned vehicle
 *   type         → Fuel | Maintenance | Inspection | Incident | Accident
 *   fuel         → fuel fill-up (once per week max, emergency bypass)
 *   maintenance  → detailed service/repair request
 *   inspection   → pre/post-trip checklist
 *   incident     → breakdown (no accident)
 *   accident_guide → Najm SOS procedure (mandatory before filing)
 *   accident_form  → accident details, Najm report, third-party info
 *   done         → success
 */

import { useState, useEffect, useRef } from 'react'
import { useFieldAuth } from '../lib/useFieldAuth'
import { supabase }     from '../lib/supabase'
import { uploadToDrive } from '../hooks/useDriveUpload'

// ─── Theme per log type ────────────────────────────────────────────────────────
const THEMES = {
  fuel:        { color:'#b45309', light:'#fef3c7', dark:'#78350f', grad:'linear-gradient(135deg,#78350f,#d97706)' },
  maintenance: { color:'#1d4ed8', light:'#dbeafe', dark:'#1e3a8a', grad:'linear-gradient(135deg,#1e3a8a,#2563eb)' },
  inspection:  { color:'#15803d', light:'#dcfce7', dark:'#14532d', grad:'linear-gradient(135deg,#14532d,#16a34a)' },
  incident:    { color:'#0369a1', light:'#e0f2fe', dark:'#0c4a6e', grad:'linear-gradient(135deg,#0c4a6e,#0284c7)' },
  accident:    { color:'#991b1b', light:'#fee2e2', dark:'#7f1d1d', grad:'linear-gradient(135deg,#7f1d1d,#dc2626)' },
  default:     { color:'#1e293b', light:'#f1f5f9', dark:'#0f172a', grad:'linear-gradient(135deg,#0f172a,#334155)' },
}
const th = (type) => THEMES[type] || THEMES.default

// ─── Maintenance type options ──────────────────────────────────────────────────
const MAINT_OPTS = [
  { value:'REGULAR_1000',     label:'🔄  Regular 1,000 km service' },
  { value:'REGULAR_5000',     label:'🔄  Regular 5,000 km service' },
  { value:'OIL_CHANGE',       label:'🛢️  Oil change' },
  { value:'OIL_FILTER',       label:'🛢️  Oil & filter change' },
  { value:'TYRE_ROTATION',    label:'🔵  Tyre rotation / balancing' },
  { value:'TYRE_REPLACE',     label:'⚫  Tyre replacement' },
  { value:'TYRE_PUNCTURE',    label:'🔩  Tyre puncture / repair' },
  { value:'BRAKE_SERVICE',    label:'🔴  Brake inspection / service' },
  { value:'BRAKE_PADS',       label:'🔴  Brake pads replacement' },
  { value:'AC_SERVICE',       label:'❄️  A/C service / regas' },
  { value:'BATTERY_CHECK',    label:'⚡  Battery check / test' },
  { value:'BATTERY_REPLACE',  label:'⚡  Battery replacement' },
  { value:'COOLANT',          label:'💧  Coolant top-up / flush' },
  { value:'WINDSCREEN',       label:'🪟  Windscreen / glass repair' },
  { value:'MINOR_REPAIR',     label:'🔧  Minor repair' },
  { value:'MAJOR_REPAIR',     label:'⚙️  Major repair / overhaul' },
  { value:'OTHER',            label:'📝  Other (specify in notes)' },
]

const URGENCY_OPTS = [
  { key:'LOW',      label:'Low',      color:'#15803d', desc:'Schedule next service window' },
  { key:'MEDIUM',   label:'Medium',   color:'#d97706', desc:'Fix within the week' },
  { key:'HIGH',     label:'High',     color:'#dc2626', desc:'Fix before next trip' },
  { key:'CRITICAL', label:'Critical', color:'#7c3aed', desc:'Do NOT drive — stop immediately' },
]

const INSPECTION_ITEMS = [
  { key:'tyres',     label:'Tyres & Pressure',  icon:'🔵' },
  { key:'lights',    label:'Lights & Signals',  icon:'💡' },
  { key:'oil',       label:'Engine Oil Level',  icon:'🛢️' },
  { key:'brakes',    label:'Brakes',            icon:'🔴' },
  { key:'wipers',    label:'Wipers',            icon:'💧' },
  { key:'fuel_level',label:'Fuel Level',        icon:'⛽' },
  { key:'mirrors',   label:'Mirrors & Glass',   icon:'🪟' },
  { key:'seatbelts', label:'Seat Belts',        icon:'🔒' },
  { key:'horn',      label:'Horn',              icon:'📣' },
  { key:'ac',        label:'A/C',               icon:'❄️' },
  { key:'coolant',   label:'Coolant Level',     icon:'💧' },
  { key:'documents', label:'Docs (Istimara/Insurance)', icon:'📋' },
]

// ─── Helpers ───────────────────────────────────────────────────────────────────
const today = () => new Date().toISOString().slice(0,10)

// ─── Photo Capture ─────────────────────────────────────────────────────────────
function PhotoCapture({ label, value, onChange, required, accent='#b45309' }) {
  const ref = useRef()
  return (
    <div style={{ marginBottom:16 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1, marginBottom:7 }}>
        {label}{required ? <span style={{ color:accent }}> *</span> : <span style={{ opacity:.6 }}> (optional)</span>}
      </div>
      <input ref={ref} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
        onChange={e=>{ const f=e.target.files?.[0]; if(f) onChange(URL.createObjectURL(f), f) }} />
      {!value ? (
        <button type="button" onClick={()=>ref.current?.click()}
          style={{ width:'100%', padding:'18px 16px', borderRadius:16, border:`2px dashed ${accent}40`,
            background:`${accent}06`, color:accent, cursor:'pointer', boxSizing:'border-box',
            display:'flex', flexDirection:'column', alignItems:'center', gap:8, transition:'all .15s' }}>
          <div style={{ width:48, height:48, borderRadius:14, background:`${accent}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>📷</div>
          <span style={{ fontSize:13, fontWeight:700 }}>Tap to take photo</span>
          <span style={{ fontSize:11, opacity:.6 }}>Camera or gallery</span>
        </button>
      ) : (
        <div style={{ position:'relative', borderRadius:14, overflow:'hidden', boxShadow:`0 4px 16px ${accent}30` }}>
          <img src={value} alt="" style={{ width:'100%', maxHeight:200, objectFit:'cover', display:'block' }} />
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(to top,rgba(0,0,0,0.3),transparent)' }} />
          <button type="button" onClick={()=>onChange(null,null)}
            style={{ position:'absolute', top:10, right:10, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(6px)',
              color:'#fff', border:'none', borderRadius:20, width:30, height:30, cursor:'pointer', fontWeight:800, fontSize:13 }}>✕</button>
          <div style={{ position:'absolute', bottom:8, left:12, color:'#fff', fontSize:11, fontWeight:600, opacity:.85 }}>✓ Photo added</div>
        </div>
      )}
    </div>
  )
}

// ─── Elegant UI helpers ────────────────────────────────────────────────────────
const SCard = ({children, style={}}) => (
  <div style={{ background:'#fff', borderRadius:20, border:'1px solid rgba(0,0,0,0.06)',
    marginBottom:12, overflow:'hidden', boxShadow:'0 2px 20px rgba(0,0,0,0.07)', ...style }}>
    {children}
  </div>
)
const SCardSection = ({title, accent='#64748b', children}) => (
  <div style={{ padding:'16px 18px' }}>
    {title && <div style={{ fontSize:10, fontWeight:700, color:accent, textTransform:'uppercase', letterSpacing:1, marginBottom:14, display:'flex', alignItems:'center', gap:6 }}>
      <div style={{ width:24, height:2, background:accent, borderRadius:2 }} />{title}
    </div>}
    {children}
  </div>
)
const SLabel = ({children, accent}) => (
  <div style={{ fontSize:10, fontWeight:700, color: accent||'#94a3b8', textTransform:'uppercase', letterSpacing:.9, marginBottom:6 }}>
    {children}
  </div>
)
const SInp = ({ style={}, accent, ...props }) => (
  <input style={{ padding:'13px 15px', border:`1.5px solid ${accent?accent+'30':'#e8ecf0'}`, borderRadius:13,
    fontSize:14, outline:'none', width:'100%', boxSizing:'border-box', minHeight:48,
    fontFamily:'inherit', background:'#fafbfc', WebkitAppearance:'none',
    transition:'border-color .15s', ...style }}
    onFocus={e=>{ e.target.style.borderColor=accent||'#94a3b8'; e.target.style.background='#fff' }}
    onBlur={e=>{ e.target.style.borderColor=accent?accent+'30':'#e8ecf0'; e.target.style.background='#fafbfc' }}
    {...props} />
)
const SSel = ({ style={}, accent, children, ...props }) => (
  <select style={{ padding:'13px 15px', border:`1.5px solid ${accent?accent+'30':'#e8ecf0'}`, borderRadius:13,
    fontSize:14, outline:'none', width:'100%', boxSizing:'border-box', minHeight:48,
    fontFamily:'inherit', background:'#fafbfc', WebkitAppearance:'none', ...style }} {...props}>
    {children}
  </select>
)
const SArea = ({ style={}, accent, ...props }) => (
  <textarea style={{ padding:'13px 15px', border:`1.5px solid ${accent?accent+'30':'#e8ecf0'}`, borderRadius:13,
    fontSize:14, outline:'none', width:'100%', boxSizing:'border-box',
    fontFamily:'inherit', background:'#fafbfc', resize:'none',
    transition:'border-color .15s', ...style }}
    onFocus={e=>{ e.target.style.borderColor=accent||'#94a3b8'; e.target.style.background='#fff' }}
    onBlur={e=>{ e.target.style.borderColor=accent?accent+'30':'#e8ecf0'; e.target.style.background='#fafbfc' }}
    {...props} />
)

const PAGE = { maxWidth:480, margin:'0 auto', padding:'0 0 80px',
  fontFamily:"'SF Pro Display',-apple-system,'Segoe UI',system-ui,sans-serif",
  background:'#f5f6fa', minHeight:'100vh', boxSizing:'border-box' }

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ── Dev mode mock data ─────────────────────────────────────────────────────────
const DEV_MODE = new URLSearchParams(window.location.search).get('dev') === '1'
  || localStorage.getItem('accsys_dev_mode') === '1'

const DEV_VEHICLE = {
  id:               'dev-vehicle-001',
  plate_number:     'AAA 1234',
  make:             'Toyota',
  model:            'Hilux',
  color:            'White',
  fuel_type:        'Diesel',
  odometer_reading: 45800,
  year:             2022,
  assigned_to:      'dev-employee-001',
}

const DEV_EMPLOYEE = {
  id:           'dev-employee-001',
  full_name_en: 'Dev User',
  designation:  'Driver (Dev Mode)',
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function FormCarMaintenance() {
  const auth = useFieldAuth()

  const [vehicles,     setVehicles]     = useState([])
  const [loadingVeh,   setLoadingVeh]   = useState(true)
  const [vehicle,      setVehicle]      = useState(null)
  const [logType,      setLogType]      = useState(null)   // fuel|maintenance|inspection|incident|accident
  const [screen,       setScreen]       = useState('vehicle')
  const [submitting,   setSubmitting]   = useState(false)
  const [submitErr,    setSubmitErr]    = useState('')

  // Fuel weekly check
  const [lastFuel,     setLastFuel]     = useState(null)  // last fuel entry date
  const [fuelOverride, setFuelOverride] = useState(false) // emergency override
  const [fuelReason,   setFuelReason]   = useState('')

  // ── Fuel fields ────────────────────────────────────────────────────────────
  const [fuelLiters,       setFuelLiters]       = useState('')
  const [fuelCost,         setFuelCost]         = useState('')
  const [fuelStation,      setFuelStation]      = useState('')
  const [fuelReceiptPrev,  setFuelReceiptPrev]  = useState(null)
  const [fuelReceiptFile,  setFuelReceiptFile]  = useState(null)
  const [odometer,         setOdometer]         = useState('')

  // ── Maintenance fields ─────────────────────────────────────────────────────
  const [maintType,    setMaintType]    = useState('OIL_CHANGE')
  const [urgency,      setUrgency]      = useState('MEDIUM')
  const [maintNotes,   setMaintNotes]   = useState('')
  const [workshop,     setWorkshop]     = useState('')
  const [maintCost,    setMaintCost]    = useState('')
  const [maintPhoto1Prev, setMaintPhoto1Prev] = useState(null)
  const [maintPhoto1File, setMaintPhoto1File] = useState(null)

  // ── Inspection fields ──────────────────────────────────────────────────────
  const [tripMode,     setTripMode]     = useState('PRE')  // PRE|POST
  const [checks,       setChecks]       = useState(() => Object.fromEntries(INSPECTION_ITEMS.map(i=>[i.key,null])))
  const [inspNotes,    setInspNotes]    = useState('')
  const [inspOdometer, setInspOdometer] = useState('')

  // ── Incident (breakdown) fields ────────────────────────────────────────────
  const [breakdownLoc,   setBreakdownLoc]   = useState('')
  const [breakdownDesc,  setBreakdownDesc]  = useState('')
  const [breakdownPhoto1Prev, setBreakdownPhoto1Prev] = useState(null)
  const [breakdownPhoto1File, setBreakdownPhoto1File] = useState(null)

  // ── Accident fields ────────────────────────────────────────────────────────
  const [accDate,       setAccDate]       = useState(today())
  const [accTime,       setAccTime]       = useState('')
  const [accLocation,   setAccLocation]   = useState('')
  const [accDesc,       setAccDesc]       = useState('')
  const [najmReport,    setNajmReport]    = useState('')
  const [policeReport,  setPoliceReport]  = useState('')
  const [hasInjuries,   setHasInjuries]   = useState(false)
  const [injuryDesc,    setInjuryDesc]    = useState('')
  const [thirdPartyType, setThirdPartyType] = useState('NONE') // NONE|PERSONAL|COMPANY
  const [tpName,        setTpName]        = useState('')
  const [tpPlate,       setTpPlate]       = useState('')
  const [tpPhone,       setTpPhone]       = useState('')
  const [tpInsurance,   setTpInsurance]   = useState('')
  const [accPhoto1Prev, setAccPhoto1Prev] = useState(null)
  const [accPhoto1File, setAccPhoto1File] = useState(null)
  const [accPhoto2Prev, setAccPhoto2Prev] = useState(null)
  const [accPhoto2File, setAccPhoto2File] = useState(null)
  const [accPhoto3Prev, setAccPhoto3Prev] = useState(null)
  const [accPhoto3File, setAccPhoto3File] = useState(null)

  // ── Load assigned vehicles ─────────────────────────────────────────────────
  useEffect(()=>{
    // Dev mode: inject mock vehicle immediately, no auth or DB needed
    if(DEV_MODE) {
      setVehicles([DEV_VEHICLE])
      setVehicle(DEV_VEHICLE)
      setOdometer(DEV_VEHICLE.odometer_reading.toString())
      setLoadingVeh(false)
      return
    }
    if(auth.loading || !auth.employee) return
    supabase.from('vehicles')
      .select('id,plate_number,make,model,color,fuel_type,odometer_reading,year,assigned_to')
      .eq('status','ACTIVE')
      .eq('assigned_to', auth.employee.id)
      .then(({ data, error }) => {
        if(!error && data?.length) {
          setVehicles(data)
          if(data.length === 1) { setVehicle(data[0]); setOdometer(data[0].odometer_reading?.toString()||'') }
        } else {
          setVehicles([])
        }
        setLoadingVeh(false)
      })
  }, [auth.loading, auth.employee])

  // ── Weekly fuel check when vehicle selected ────────────────────────────────
  useEffect(()=>{
    if(!vehicle?.id) return
    const weekAgo = new Date(Date.now() - 7*24*60*60*1000).toISOString().slice(0,10)
    supabase.from('vehicle_maintenance')
      .select('service_date')
      .eq('vehicle_id', vehicle.id)
      .eq('log_type','FUEL')
      .gte('service_date', weekAgo)
      .order('service_date', { ascending:false })
      .limit(1)
      .then(({ data }) => { setLastFuel(data?.[0]?.service_date || null) })
  }, [vehicle])

  // ── Upload helper ──────────────────────────────────────────────────────────
  async function up(file, folder) {
    if(!file) return null
    try { const r = await uploadToDrive(file, folder); return r?.viewUrl||null } catch { return null }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitErr(''); setSubmitting(true)
    try {
      const folder = `vehicle-logs/${vehicle.id}`
      const LOG_TYPE_MAP = { fuel:'FUEL', maintenance:'MAINTENANCE', inspection:'INSPECTION', incident:'BREAKDOWN', accident:'ACCIDENT_REPAIR' }
      const base = {
        vehicle_id:   vehicle.id,
        service_date: today(),
        source:       'FIELD',
        log_type:     LOG_TYPE_MAP[logType] || logType.toUpperCase(),
        submitted_by: employee?.id,
        status:       'OPEN',
        odometer_at_service: odometer ? +odometer : null,
      }

      let payload = { ...base }

      if(logType === 'fuel') {
        if(!fuelLiters) { setSubmitErr('Enter fuel quantity.'); setSubmitting(false); return }
        if(fuelOverride && !fuelReason.trim()) { setSubmitErr('Emergency override requires a reason.'); setSubmitting(false); return }
        const receiptUrl = await up(fuelReceiptFile, folder)
        Object.assign(payload, {
          maintenance_type:    'FUEL',
          fuel_liters:         +fuelLiters||null,
          fuel_amount:         +fuelCost||null,
          cost:                +fuelCost||0,
          fuel_station:        fuelStation||null,
          fuel_override_reason: fuelOverride ? fuelReason : null,
          description:         fuelOverride ? `Emergency fill-up. Reason: ${fuelReason}` : `Fuel station: ${fuelStation||'—'}`,
          photo_url:           receiptUrl,
        })
        // update odometer if higher (skip in dev mode)
        if(!DEV_MODE && odometer && +odometer > (vehicle.odometer_reading||0)) {
          await supabase.from('vehicles').update({ odometer_reading:+odometer }).eq('id',vehicle.id)
        }

      } else if(logType === 'maintenance') {
        const url1 = await up(maintPhoto1File, folder)
        Object.assign(payload, {
          maintenance_type: maintType,
          description:      maintNotes||null,
          urgency:          urgency,
          workshop_name:    workshop||null,
          cost:             maintCost ? +maintCost : null,
          photo_url:        url1,
        })

      } else if(logType === 'inspection') {
        const faults = INSPECTION_ITEMS.filter(i=>checks[i.key]===false).map(i=>i.label)
        Object.assign(payload, {
          maintenance_type:     'INSPECTION',
          trip_direction:       tripMode,
          inspection_checklist: checks,
          urgency:              faults.length > 0 ? 'MEDIUM' : 'LOW',
          description:          faults.length > 0 ? `${tripMode}-trip faults: ${faults.join(', ')}` : `${tripMode}-trip — all items OK.`,
          notes_field:          inspNotes||null,
          odometer_at_service:  inspOdometer ? +inspOdometer : null,
        })

      } else if(logType === 'incident') {
        if(!breakdownLoc) { setSubmitErr('Enter the breakdown location.'); setSubmitting(false); return }
        const url1 = await up(breakdownPhoto1File, folder)
        Object.assign(payload, {
          maintenance_type: 'BREAKDOWN',
          description:      breakdownDesc||null,
          location:         breakdownLoc,
          urgency:          'HIGH',
          photo_url:        url1,
        })

      } else if(logType === 'accident') {
        if(!najmReport) { setSubmitErr('Najm report number is required.'); setSubmitting(false); return }
        if(!accPhoto1File) { setSubmitErr('At least one accident photo is required.'); setSubmitting(false); return }
        if(!accLocation)   { setSubmitErr('Enter the accident location.'); setSubmitting(false); return }
        const [url1, url2, url3] = await Promise.all([
          up(accPhoto1File, folder),
          up(accPhoto2File, folder),
          up(accPhoto3File, folder),
        ])
        Object.assign(payload, {
          maintenance_type: 'ACCIDENT_REPAIR',
          description:      accDesc||null,
          location:         accLocation,
          urgency:          hasInjuries ? 'CRITICAL' : 'HIGH',
          najm_report_no:   najmReport,
          police_report_no: policeReport||null,
          has_injuries:     hasInjuries,
          injury_description: hasInjuries ? injuryDesc : null,
          third_party_type: thirdPartyType,
          third_party_name: tpName||null,
          third_party_plate: tpPlate||null,
          third_party_phone: tpPhone||null,
          third_party_insurance: tpInsurance||null,
          photo_url:        url1,
          photo_url_2:      url2,
          photo_url_3:      url3,
          accident_datetime: `${accDate}T${accTime||'00:00'}:00`,
        })
      }

      // Dev mode: skip DB write, just show success
      if(!DEV_MODE) {
        const { error } = await supabase.from('vehicle_maintenance').insert(payload)
        if(error) throw error
      }

      // Notify DH/PM for incidents, high/critical urgency, or accidents
      const notifyTypes = ['incident','accident']
      const notifyUrgency = ['HIGH','CRITICAL']
      if(!DEV_MODE && (notifyTypes.includes(logType) || notifyUrgency.includes(payload.urgency))) {
        const notifType = logType === 'accident' ? 'VEHICLE_ACCIDENT'
          : logType === 'incident' ? 'VEHICLE_INCIDENT' : 'VEHICLE_MAINTENANCE'
        const notifBody = logType === 'accident'
          ? `Accident on ${vehicle.plate_number}. Najm: ${najmReport}. Needs DH review.`
          : logType === 'incident'
          ? `Breakdown on ${vehicle.plate_number} at ${breakdownLoc}. Immediate attention needed.`
          : `${MAINT_OPTS.find(o=>o.value===maintType)?.label?.replace(/^[^\s]+\s+/,'')||maintType} — ${vehicle.plate_number} — ${payload.urgency} urgency. Reported by ${employee?.full_name_en}.`
        await supabase.from('notifications').insert({
          employee_id: employee?.id,
          type:        notifType,
          title:       `Vehicle Report — ${vehicle.plate_number}`,
          body:        notifBody,
          metadata:    { vehicle_id:vehicle.id, log_type:LOG_TYPE_MAP[logType], urgency:payload.urgency, plate:vehicle.plate_number },
        }).catch(()=>{})
      }

      setScreen('done')
    } catch(err) {
      setSubmitErr(err.message || 'Submission failed. Please try again.')
    }
    setSubmitting(false)
  }

  // ── Dev mode auth shim ─────────────────────────────────────────────────────
  const employee = DEV_MODE ? DEV_EMPLOYEE : auth.employee

  // ── Guards ─────────────────────────────────────────────────────────────────
  if(!DEV_MODE && auth.loading) return (
    <div style={{ ...PAGE, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', color:'#94a3b8' }}>
        <div style={{ fontSize:36 }}>⏳</div>
        <div style={{ marginTop:12, fontSize:14 }}>Checking access…</div>
      </div>
    </div>
  )

  if(!DEV_MODE && auth.error) return (
    <div style={{ ...PAGE, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:20, padding:36, maxWidth:340, textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,.10)' }}>
        <div style={{ fontSize:52 }}>🔒</div>
        <div style={{ fontSize:17, fontWeight:700, color:'#dc2626', marginTop:12 }}>Access Required</div>
        <div style={{ fontSize:13, color:'#64748b', marginTop:8 }}>Scan your QR code to log a vehicle report.</div>
      </div>
    </div>
  )

  if(!loadingVeh && vehicles.length === 0) return (
    <div style={{ ...PAGE, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:20, padding:36, maxWidth:340, textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,.10)' }}>
        <div style={{ fontSize:52 }}>🚗</div>
        <div style={{ fontSize:17, fontWeight:700, color:'#1e293b', marginTop:12 }}>No Vehicle Assigned</div>
        <div style={{ fontSize:13, color:'#64748b', marginTop:8, lineHeight:1.6 }}>
          No active vehicle is registered to your account. Contact your DH or Fleet Manager to get a vehicle assigned.
        </div>
      </div>
    </div>
  )

  const t = th(logType)

  // ── DONE ────────────────────────────────────────────────────────────────────
  if(screen === 'done') return (
    <div style={PAGE}>
      <div style={{ background: t.grad, padding:'52px 24px 36px', borderRadius:'0 0 28px 28px', textAlign:'center', boxShadow:`0 8px 40px ${t.color}50`, marginBottom:20 }}>
        <div style={{ width:80, height:80, background:'rgba(255,255,255,.18)', backdropFilter:'blur(10px)', borderRadius:24, display:'flex', alignItems:'center', justifyContent:'center', fontSize:42, margin:'0 auto 18px' }}>✅</div>
        <div style={{ fontSize:24, fontWeight:900, color:'#fff', letterSpacing:-.3 }}>Report Submitted</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,.7)', marginTop:8, fontFamily:'monospace', letterSpacing:1 }}>
          {vehicle?.plate_number}
        </div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,.5)', marginTop:4 }}>{vehicle?.make} {vehicle?.model}</div>
      </div>
      <div style={{ padding:'0 14px' }}>
        <div style={{ background:'#fff', borderRadius:18, padding:'18px 20px', marginBottom:14, boxShadow:'0 2px 20px rgba(0,0,0,0.07)' }}>
          <div style={{ fontSize:11, fontWeight:700, color:t.color, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>Next steps</div>
          <div style={{ color:'#475569', fontSize:13, lineHeight:1.9 }}>
            {logType === 'accident' && <>
              Keep a copy of the Najm report.<br/>
              Follow up with the workshop for a repair estimate.<br/>
              Submit repair cost via Maintenance once known.<br/>
              HR will update insurance records.
            </>}
            {logType === 'incident' && <>DH and Fleet Manager have been notified automatically. Do not drive the vehicle until cleared by your supervisor.</>}
            {(logType === 'maintenance' && ['HIGH','CRITICAL'].includes(urgency)) && <>DH has been notified. Vehicle should not be used until the reported issue is resolved.</>}
            {!['accident','incident'].includes(logType) && !['HIGH','CRITICAL'].includes(urgency) && <>Your report has been logged and is visible to your DH and Fleet Manager.</>}
          </div>
        </div>
        <button onClick={()=>{ setScreen('vehicle'); setLogType(null); setVehicle(vehicles.length===1?vehicles[0]:null) }}
          style={{ background: t.grad, color:'#fff', border:'none', borderRadius:16, padding:'17px', fontSize:15, fontWeight:800, cursor:'pointer', width:'100%', boxShadow:`0 4px 16px ${t.color}40` }}>
          + Log Another Report
        </button>
      </div>
    </div>
  )

  // ── VEHICLE SELECT ──────────────────────────────────────────────────────────
  if(screen === 'vehicle') return (
    <div style={PAGE}>
      {/* Hero header — full bleed */}
      <div style={{ background:THEMES.default.grad, padding:'50px 22px 30px', borderRadius:'0 0 30px 30px', boxShadow:'0 8px 40px #0f172a60', marginBottom:22 }}>
        {DEV_MODE && <div style={{ background:'rgba(255,214,0,.15)', border:'1px solid rgba(255,214,0,.3)', borderRadius:8, padding:'4px 10px', fontSize:10, color:'#fde68a', fontWeight:700, marginBottom:14, display:'inline-block', letterSpacing:.5 }}>🛠 DEV MODE</div>}
        <div style={{ width:60, height:60, background:'rgba(255,255,255,.14)', backdropFilter:'blur(8px)', borderRadius:18, display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, marginBottom:16 }}>🚗</div>
        <div style={{ fontSize:26, fontWeight:900, color:'#fff', letterSpacing:-.5 }}>Vehicle Report</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,.6)', marginTop:6 }}>{employee?.full_name_en} · {employee?.designation}</div>
      </div>

      <div style={{ padding:'0 14px' }}>
        <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1, marginBottom:12 }}>
          Your assigned vehicle{vehicles.length>1?'s':''}
        </div>
        {loadingVeh ? (
          <div style={{ textAlign:'center', padding:32, color:'#94a3b8', fontSize:14 }}>⏳ Loading…</div>
        ) : vehicles.map(v=>(
          <div key={v.id}
            onClick={()=>{ setVehicle(v); setOdometer(v.odometer_reading?.toString()||''); setScreen('type') }}
            style={{ background:'#fff', borderRadius:20, marginBottom:14, boxShadow:'0 4px 24px rgba(0,0,0,0.09)', cursor:'pointer', overflow:'hidden' }}>
            {/* Plate banner */}
            <div style={{ background:'linear-gradient(135deg,#1e293b,#334155)', padding:'16px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', textTransform:'uppercase', letterSpacing:1, marginBottom:3 }}>Plate Number</div>
                <div style={{ fontSize:24, fontWeight:900, color:'#fff', letterSpacing:3, fontFamily:'monospace' }}>{v.plate_number}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,.55)', marginTop:4 }}>{v.make} {v.model}{v.year?` · ${v.year}`:''}</div>
              </div>
              <div style={{ width:52, height:52, background:'rgba(255,255,255,.08)', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>🚗</div>
            </div>
            {/* Details row */}
            <div style={{ padding:'12px 20px', display:'flex', gap:18, alignItems:'center', flexWrap:'wrap' }}>
              {v.color && <div style={{ fontSize:12, color:'#64748b' }}>🎨 {v.color}</div>}
              {v.fuel_type && <div style={{ fontSize:12, color:'#64748b' }}>⛽ {v.fuel_type}</div>}
              {v.odometer_reading > 0 && <div style={{ fontSize:12, color:'#1d4ed8', fontWeight:600 }}>📏 {v.odometer_reading?.toLocaleString()} km</div>}
              <div style={{ marginLeft:'auto' }}>
                <div style={{ width:32, height:32, background:'#f1f5f9', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', color:'#64748b', fontWeight:900, fontSize:16 }}>›</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // ── TYPE SELECT ─────────────────────────────────────────────────────────────
  if(screen === 'type') {
    const LOG_TYPES = [
      { key:'fuel',        icon:'⛽', label:'Fuel Fill-up',    color:THEMES.fuel.color,        grad:THEMES.fuel.grad,        desc:'Record fuel quantity & cost' },
      { key:'maintenance', icon:'🔧', label:'Maintenance',     color:THEMES.maintenance.color, grad:THEMES.maintenance.grad, desc:'Service or repair request' },
      { key:'inspection',  icon:'📋', label:'Trip Inspection', color:THEMES.inspection.color,  grad:THEMES.inspection.grad,  desc:'Pre/post-trip checklist' },
      { key:'incident',    icon:'⚠️', label:'Breakdown',       color:THEMES.incident.color,    grad:THEMES.incident.grad,    desc:'Vehicle broke down — no collision' },
      { key:'accident',    icon:'🚨', label:'Accident',        color:THEMES.accident.color,    grad:THEMES.accident.grad,    desc:'Collision — Najm report required' },
    ]
    return (
      <div style={PAGE}>
        {/* Hero header */}
        <div style={{ background:THEMES.default.grad, padding:'48px 22px 26px', borderRadius:'0 0 30px 30px', boxShadow:'0 8px 40px #0f172a60', marginBottom:22 }}>
          <button onClick={()=>setScreen('vehicle')}
            style={{ background:'rgba(255,255,255,.12)', border:'none', color:'rgba(255,255,255,.8)', borderRadius:8, padding:'5px 12px', cursor:'pointer', fontSize:12, marginBottom:16 }}>← Back</button>
          <div style={{ fontSize:11, color:'rgba(255,255,255,.45)', textTransform:'uppercase', letterSpacing:1.2, marginBottom:6 }}>Reporting for</div>
          <div style={{ fontSize:28, fontWeight:900, color:'#fff', letterSpacing:3, fontFamily:'monospace' }}>{vehicle?.plate_number}</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,.55)', marginTop:5 }}>{vehicle?.make} {vehicle?.model}</div>
        </div>

        <div style={{ padding:'0 14px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1, marginBottom:14 }}>Select report type</div>

          {LOG_TYPES.map(lt=>(
            <div key={lt.key}
              onClick={()=>{ setLogType(lt.key); setScreen(lt.key === 'accident' ? 'accident_guide' : lt.key) }}
              style={{ display:'flex', alignItems:'center', gap:14, background:'#fff', borderRadius:18,
                borderLeft:`4px solid ${lt.color}`, border:`1px solid ${lt.color}18`,
                borderLeftWidth:4, borderLeftColor:lt.color,
                padding:'15px 16px', marginBottom:10, cursor:'pointer',
                boxShadow:`0 2px 16px ${lt.color}10` }}>
              <div style={{ width:48, height:48, background:`${lt.color}12`, borderRadius:14,
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, flexShrink:0 }}>
                {lt.icon}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:800, fontSize:15, color:'#1e293b', marginBottom:3 }}>{lt.label}</div>
                <div style={{ fontSize:12, color:'#94a3b8' }}>{lt.desc}</div>
              </div>
              <div style={{ width:32, height:32, background:`${lt.color}12`, borderRadius:10,
                display:'flex', alignItems:'center', justifyContent:'center', color:lt.color, fontWeight:900, fontSize:16 }}>›</div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── ACCIDENT GUIDE ──────────────────────────────────────────────────────────
  if(screen === 'accident_guide') return (
    <div style={{ ...PAGE, background:'#0f172a', minHeight:'100vh' }}>
      {/* SOS Header — full bleed */}
      <div style={{ background:'linear-gradient(135deg,#7f1d1d,#dc2626)', padding:'52px 22px 30px', borderRadius:'0 0 30px 30px', marginBottom:20, textAlign:'center' }}>
        <div style={{ fontSize:52, marginBottom:12 }}>🚨</div>
        <div style={{ fontSize:24, fontWeight:900, color:'#fff', letterSpacing:-.3 }}>Accident — Follow Steps</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,.75)', marginTop:6 }}>Complete ALL steps before filing the report</div>
      </div>

      {/* Step cards */}
      <div style={{ padding:'0 14px' }}>
      {[
        { n:'01', icon:'🛑', title:'Stop safely', color:'#dc2626',
          body:'Move the vehicle off the road if possible. Turn on hazard lights. Do NOT leave the scene.' },
        { n:'02', icon:'🩺', title:'Check for injuries', color:'#dc2626',
          body:'Check yourself and all passengers. If anyone is injured — call 911 immediately before anything else.' },
        { n:'03', icon:'📞', title:'Call Najm', color:'#b45309',
          body:'Call the Najm accident reporting centre to officially register the accident.',
          action:{ label:'📞  Call Najm — 920033270', href:'tel:920033270', color:'#dc2626' },
          action2:{ label:'💬  WhatsApp Najm', href:'https://wa.me/966920033270', color:'#15803d' } },
        { n:'04', icon:'📷', title:'Photograph everything NOW', color:'#1d4ed8',
          body:'Before moving vehicles: photo the damage, both plates, road markings, and any skid marks. Take minimum 4 photos.' },
        { n:'05', icon:'📝', title:'Exchange information', color:'#1d4ed8',
          body:'Get the other party\'s: full name, phone number, vehicle plate, insurance company. If company vehicle — ask for the company name.' },
        { n:'06', icon:'🔢', title:'Get the Najm report number', color:'#15803d',
          body:'Najm will give you a report number. Write it down. You MUST enter it in the next screen to file the report.' },
        { n:'07', icon:'📱', title:'Notify your DH', color:'#0369a1',
          body:'Call or WhatsApp your DH immediately after Najm. Do not drive the vehicle if airbags deployed or damage is severe.' },
      ].map(s => (
        <div key={s.n} style={{ background:'#1e293b', borderRadius:16, padding:'16px 16px', marginBottom:10, border:`1px solid ${s.color}33` }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
            <div style={{ background:`${s.color}22`, borderRadius:10, width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
              {s.icon}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                <span style={{ fontSize:10, fontWeight:800, color:s.color, letterSpacing:.5 }}>STEP {s.n}</span>
                <span style={{ fontWeight:800, fontSize:14, color:'#f1f5f9' }}>{s.title}</span>
              </div>
              <div style={{ fontSize:13, color:'#94a3b8', lineHeight:1.6 }}>{s.body}</div>
              {s.action && (
                <div style={{ marginTop:10, display:'flex', gap:8, flexWrap:'wrap' }}>
                  <a href={s.action.href}
                    style={{ display:'inline-block', background:s.action.color, color:'#fff', textDecoration:'none',
                      borderRadius:10, padding:'9px 16px', fontSize:13, fontWeight:700 }}>
                    {s.action.label}
                  </a>
                  {s.action2 && (
                    <a href={s.action2.href} target="_blank" rel="noreferrer"
                      style={{ display:'inline-block', background:s.action2.color, color:'#fff', textDecoration:'none',
                        borderRadius:10, padding:'9px 16px', fontSize:13, fontWeight:700 }}>
                      {s.action2.label}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Emergency contacts strip */}
      <div style={{ background:'#1e293b', borderRadius:16, padding:'14px 16px', marginBottom:14, border:'1px solid #dc262633' }}>
        <div style={{ fontSize:11, color:'#dc2626', fontWeight:800, letterSpacing:.5, marginBottom:10, textTransform:'uppercase' }}>Emergency contacts</div>
        {[
          { label:'Police / Ambulance', num:'911', color:'#dc2626' },
          { label:'Najm (Accidents)',   num:'920033270', color:'#b45309' },
          { label:'Traffic (Muroor)',   num:'996', color:'#1d4ed8' },
        ].map(c=>(
          <div key={c.num} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <span style={{ fontSize:13, color:'#94a3b8' }}>{c.label}</span>
            <a href={`tel:${c.num}`} style={{ fontWeight:800, fontSize:15, color:c.color, textDecoration:'none', fontFamily:'monospace' }}>{c.num}</a>
          </div>
        ))}
      </div>

      <button onClick={()=>setScreen('accident_form')}
        style={{ width:'100%', padding:18, background:'linear-gradient(135deg,#7f1d1d,#dc2626)', color:'#fff', border:'none',
          borderRadius:16, fontSize:16, fontWeight:800, cursor:'pointer', marginBottom:10, boxShadow:'0 4px 16px #dc262640' }}>
        ✓ I have completed all steps — File Report
      </button>
      <button onClick={()=>setScreen('type')}
        style={{ width:'100%', padding:14, background:'transparent', color:'#64748b', border:'1px solid #334155',
          borderRadius:14, fontSize:14, cursor:'pointer', marginBottom:16 }}>
        ← Back
      </button>
      </div>
    </div>
  )

  // ─────────────────────────────────────────────────────────────────────────────
  // DETAIL SCREENS (shared header)
  // ─────────────────────────────────────────────────────────────────────────────
  const typeLabels = { fuel:'⛽ Fuel Fill-up', maintenance:'🔧 Maintenance', inspection:'📋 Trip Inspection', incident:'⚠️ Breakdown', accident:'🚨 Accident Report' }

  return (
    <div style={PAGE}>
      {/* Header — full bleed */}
      <div style={{ background: t.grad, padding:'48px 22px 26px', borderRadius:'0 0 30px 30px', boxShadow:`0 8px 40px ${t.color}50`, marginBottom:20 }}>
        <button onClick={()=>setScreen(logType==='accident'?'accident_guide':'type')}
          style={{ background:'rgba(255,255,255,.12)', border:'none', color:'rgba(255,255,255,.8)', borderRadius:8, padding:'5px 12px', cursor:'pointer', fontSize:12, marginBottom:16 }}>← Back</button>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:56, height:56, background:'rgba(255,255,255,.16)', backdropFilter:'blur(8px)', borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center', fontSize:30, flexShrink:0 }}>
            {typeLabels[logType]?.slice(0,2)}
          </div>
          <div>
            <div style={{ fontSize:21, fontWeight:900, color:'#fff', letterSpacing:-.3 }}>{typeLabels[logType]?.slice(3)}</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,.6)', marginTop:4, fontFamily:'monospace', letterSpacing:1 }}>{vehicle?.plate_number}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', marginTop:2 }}>{vehicle?.make} {vehicle?.model}</div>
          </div>
        </div>
      </div>
      <div style={{ padding:'0 14px' }}>

      {/* ── FUEL ── */}
      {logType === 'fuel' && (
        <>
          {/* Weekly limit banner */}
          {lastFuel && !fuelOverride && (
            <div style={{ background:'#fffbeb', border:'1.5px solid #fbbf24', borderRadius:14, padding:'14px 16px', marginBottom:14 }}>
              <div style={{ fontWeight:800, fontSize:14, color:'#92400e', marginBottom:4 }}>⚠️ Weekly fill-up already logged</div>
              <div style={{ fontSize:13, color:'#92400e', marginBottom:10 }}>
                Last fill-up: <strong>{lastFuel}</strong>. One fill-up per vehicle per week is the standard limit.
              </div>
              <button onClick={()=>setFuelOverride(true)}
                style={{ background:'#d97706', color:'#fff', border:'none', borderRadius:10, padding:'9px 16px', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                Emergency Override — Fill Now
              </button>
            </div>
          )}

          {fuelOverride && (
            <SCard>
              <div style={{ padding:'14px 16px' }}>
                <div style={{ fontWeight:800, fontSize:14, color:'#92400e', marginBottom:8 }}>Emergency override — reason required</div>
                <SLabel>Reason for emergency fill-up *</SLabel>
                <SArea rows={2} placeholder="e.g. Urgent site delivery, no regular schedule available…"
                  value={fuelReason} onChange={e=>setFuelReason(e.target.value)} style={{ borderColor:'#fbbf24' }} />
              </div>
            </SCard>
          )}

          {(!lastFuel || fuelOverride) && (
            <SCard>
              <SCardSection title="Fuel Details" accent={THEMES.fuel.color}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                  <div>
                    <SLabel accent={THEMES.fuel.color}>Liters *</SLabel>
                    <SInp type="number" min="1" placeholder="e.g. 45" value={fuelLiters} onChange={e=>setFuelLiters(e.target.value)} accent={THEMES.fuel.color} />
                  </div>
                  <div>
                    <SLabel accent={THEMES.fuel.color}>Cost (SAR) *</SLabel>
                    <SInp type="number" min="0" placeholder="e.g. 180" value={fuelCost} onChange={e=>setFuelCost(e.target.value)} accent={THEMES.fuel.color} />
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                  <div>
                    <SLabel>Odometer (km)</SLabel>
                    <SInp type="number" placeholder={vehicle?.odometer_reading||'0'} value={odometer} onChange={e=>setOdometer(e.target.value)} />
                  </div>
                  <div>
                    <SLabel>Fuel Station</SLabel>
                    <SInp placeholder="e.g. ADNOC, Aramco…" value={fuelStation} onChange={e=>setFuelStation(e.target.value)} />
                  </div>
                </div>
                <PhotoCapture label="Receipt Photo" value={fuelReceiptPrev}
                  onChange={(p,f)=>{ setFuelReceiptPrev(p); setFuelReceiptFile(f) }} accent={THEMES.fuel.color} />
              </SCardSection>
            </SCard>
          )}
        </>
      )}

      {/* ── MAINTENANCE ── */}
      {logType === 'maintenance' && (
        <SCard>
          <SCardSection title="Service Details" accent={THEMES.maintenance.color}>
            <div style={{ marginBottom:14 }}>
              <SLabel accent={THEMES.maintenance.color}>Service / Repair Type *</SLabel>
              <SSel value={maintType} onChange={e=>setMaintType(e.target.value)} accent={THEMES.maintenance.color}>
                {MAINT_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
              </SSel>
            </div>

            <div style={{ marginBottom:14 }}>
              <SLabel accent={THEMES.maintenance.color}>Urgency *</SLabel>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, marginBottom:8 }}>
                {URGENCY_OPTS.map(u=>(
                  <button key={u.key} type="button" onClick={()=>setUrgency(u.key)}
                    style={{ padding:'10px 4px', borderRadius:11, border:'2px solid',
                      borderColor:urgency===u.key?u.color:'#e8ecf0',
                      background:urgency===u.key?`${u.color}16`:'#fafafa',
                      color:urgency===u.key?u.color:'#94a3b8', cursor:'pointer',
                      fontWeight:urgency===u.key?800:500, fontSize:11, textAlign:'center', transition:'all .12s' }}>
                    {u.label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize:11, color:URGENCY_OPTS.find(u=>u.key===urgency)?.color, fontWeight:600 }}>
                ↳ {URGENCY_OPTS.find(u=>u.key===urgency)?.desc}
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
              <div>
                <SLabel>Odometer (km)</SLabel>
                <SInp type="number" value={odometer} onChange={e=>setOdometer(e.target.value)} />
              </div>
              <div>
                <SLabel>Workshop</SLabel>
                <SInp placeholder="Workshop name" value={workshop} onChange={e=>setWorkshop(e.target.value)} />
              </div>
            </div>

            <div style={{ marginBottom:14 }}>
              <SLabel>Estimated Cost (SAR)</SLabel>
              <SInp type="number" placeholder="Leave blank if unknown" value={maintCost} onChange={e=>setMaintCost(e.target.value)} />
            </div>

            <div style={{ marginBottom:14 }}>
              <SLabel>Description / Notes</SLabel>
              <SArea rows={3} placeholder="Describe the issue or service required…" value={maintNotes} onChange={e=>setMaintNotes(e.target.value)} accent={THEMES.maintenance.color} />
            </div>

            <PhotoCapture label="Photo of issue" value={maintPhoto1Prev}
              onChange={(p,f)=>{ setMaintPhoto1Prev(p); setMaintPhoto1File(f) }} accent={THEMES.maintenance.color} />
          </SCardSection>
        </SCard>
      )}

      {/* ── INSPECTION ── */}
      {logType === 'inspection' && (
        <SCard>
          <SCardSection title="Trip Inspection" accent={THEMES.inspection.color}>
            {/* Pre / Post toggle */}
            <div style={{ marginBottom:16 }}>
              <SLabel accent={THEMES.inspection.color}>Trip direction *</SLabel>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {[{k:'PRE',label:'🌅 Pre-trip',desc:'Before departure'},{k:'POST',label:'🌆 Post-trip',desc:'After return'}].map(o=>(
                  <button key={o.k} type="button" onClick={()=>setTripMode(o.k)}
                    style={{ padding:'13px 10px', borderRadius:14, border:'2px solid',
                      borderColor:tripMode===o.k?THEMES.inspection.color:'#e2e8f0',
                      background:tripMode===o.k?THEMES.inspection.light:'#fafafa',
                      color:tripMode===o.k?THEMES.inspection.color:'#64748b',
                      cursor:'pointer', fontWeight:tripMode===o.k?800:500, textAlign:'center' }}>
                    <div style={{ fontSize:22 }}>{o.label.slice(0,2)}</div>
                    <div style={{ fontSize:13, marginTop:4 }}>{o.label.slice(3)}</div>
                    <div style={{ fontSize:11, opacity:.7 }}>{o.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom:8 }}>
              <SLabel>Odometer reading</SLabel>
              <SInp type="number" placeholder="Current km" value={inspOdometer} onChange={e=>setInspOdometer(e.target.value)} />
            </div>

            <div style={{ fontWeight:700, fontSize:13, color:'#1e293b', margin:'14px 0 6px' }}>Checklist — tap each item</div>
            <div style={{ fontSize:11, color:'#94a3b8', marginBottom:10 }}>✅ OK &nbsp;·&nbsp; ❌ Fault &nbsp;·&nbsp; Untouched = Not checked</div>

            {INSPECTION_ITEMS.map(item=>{
              const val = checks[item.key]
              return (
                <div key={item.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                  padding:'10px 0', borderBottom:'1px solid #f1f5f9',
                  background:val===false?'#fff1f1':val===true?'#f0fdf4':'transparent' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:20 }}>{item.icon}</span>
                    <span style={{ fontSize:13, color:'#1e293b', fontWeight:val!==null?700:400 }}>{item.label}</span>
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button type="button"
                      style={{ padding:'6px 12px', borderRadius:8, border:'none', cursor:'pointer',
                        background:val===true?'#15803d':'#dcfce7', color:val===true?'#fff':'#15803d', fontWeight:700, fontSize:13 }}
                      onClick={()=>setChecks(c=>({...c,[item.key]:val===true?null:true}))}>✅</button>
                    <button type="button"
                      style={{ padding:'6px 12px', borderRadius:8, border:'none', cursor:'pointer',
                        background:val===false?'#dc2626':'#fee2e2', color:val===false?'#fff':'#dc2626', fontWeight:700, fontSize:13 }}
                      onClick={()=>setChecks(c=>({...c,[item.key]:val===false?null:false}))}>❌</button>
                  </div>
                </div>
              )
            })}

            {INSPECTION_ITEMS.some(i=>checks[i.key]===false) && (
              <div style={{ background:'#fee2e2', border:'1.5px solid #fca5a5', borderRadius:12, padding:'12px 14px', marginTop:12 }}>
                <div style={{ fontWeight:800, color:'#991b1b', fontSize:12, marginBottom:4 }}>Faults found:</div>
                {INSPECTION_ITEMS.filter(i=>checks[i.key]===false).map(i=>(
                  <div key={i.key} style={{ fontSize:12, color:'#dc2626' }}>· {i.label}</div>
                ))}
              </div>
            )}

            <div style={{ marginTop:14 }}>
              <SLabel>Additional notes</SLabel>
              <SArea rows={2} placeholder="Any observations…" value={inspNotes} onChange={e=>setInspNotes(e.target.value)} accent={THEMES.inspection.color} />
            </div>
          </SCardSection>
        </SCard>
      )}

      {/* ── INCIDENT (BREAKDOWN) ── */}
      {logType === 'incident' && (
        <SCard>
          <div style={{ background:`${THEMES.incident.color}12`, padding:'13px 18px', borderBottom:`1px solid ${THEMES.incident.color}20`, display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ fontSize:22 }}>⚠️</div>
            <div>
              <div style={{ fontWeight:800, color:THEMES.incident.dark, fontSize:13 }}>Vehicle Breakdown — No collision</div>
              <div style={{ fontSize:11, color:THEMES.incident.color, marginTop:1 }}>For accidents involving another vehicle, go back and select Accident.</div>
            </div>
          </div>
          <SCardSection accent={THEMES.incident.color}>
            <div style={{ marginBottom:14 }}>
              <SLabel accent={THEMES.incident.color}>Breakdown location *</SLabel>
              <SInp placeholder="Road name, area, city…" value={breakdownLoc} onChange={e=>setBreakdownLoc(e.target.value)} accent={THEMES.incident.color} />
            </div>
            <div style={{ marginBottom:14 }}>
              <SLabel>Odometer (km)</SLabel>
              <SInp type="number" value={odometer} onChange={e=>setOdometer(e.target.value)} />
            </div>
            <div style={{ marginBottom:14 }}>
              <SLabel accent={THEMES.incident.color}>Description *</SLabel>
              <SArea rows={3} placeholder="What happened? Engine warning light? Flat tyre? Overheating?…"
                value={breakdownDesc} onChange={e=>setBreakdownDesc(e.target.value)} accent={THEMES.incident.color} />
            </div>
            <PhotoCapture label="Photo of vehicle / issue" value={breakdownPhoto1Prev}
              onChange={(p,f)=>{ setBreakdownPhoto1Prev(p); setBreakdownPhoto1File(f) }} accent={THEMES.incident.color} />
            <div style={{ background:`${THEMES.incident.color}08`, border:`1.5px solid ${THEMES.incident.color}30`, borderRadius:12, padding:'12px 14px', fontSize:13, color:THEMES.incident.dark, lineHeight:1.7, display:'flex', gap:8 }}>
              <span>💡</span><span>Your DH will be notified automatically. Do not attempt to drive until the issue is resolved.</span>
            </div>
          </SCardSection>
        </SCard>
      )}

      {/* ── ACCIDENT FORM ── */}
      {logType === 'accident' && (
        <>
          {/* Date / time / location */}
          <SCard>
            <SCardSection title="Accident Details" accent={THEMES.accident.color}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                <div>
                  <SLabel accent={THEMES.accident.color}>Date *</SLabel>
                  <SInp type="date" value={accDate} onChange={e=>setAccDate(e.target.value)} accent={THEMES.accident.color} />
                </div>
                <div>
                  <SLabel accent={THEMES.accident.color}>Time *</SLabel>
                  <SInp type="time" value={accTime} onChange={e=>setAccTime(e.target.value)} accent={THEMES.accident.color} />
                </div>
              </div>
              <div style={{ marginBottom:14 }}>
                <SLabel accent={THEMES.accident.color}>Location *</SLabel>
                <SInp placeholder="Road name, intersection, city…" value={accLocation} onChange={e=>setAccLocation(e.target.value)} accent={THEMES.accident.color} />
              </div>
              <div style={{ marginBottom:14 }}>
                <SLabel>What happened? *</SLabel>
                <SArea rows={3} placeholder="Describe the accident — direction, speed, what caused it…"
                  value={accDesc} onChange={e=>setAccDesc(e.target.value)} accent={THEMES.accident.color} />
              </div>
              <div>
                <SLabel>Odometer (km)</SLabel>
                <SInp type="number" value={odometer} onChange={e=>setOdometer(e.target.value)} />
              </div>
            </SCardSection>
          </SCard>

          {/* Najm report */}
          <SCard>
            <SCardSection title="Najm Report" accent={THEMES.accident.color}>
              <div style={{ marginBottom:14 }}>
                <SLabel accent={THEMES.accident.color}>Najm Report Number *</SLabel>
                <SInp placeholder="e.g. 2024-1234567" value={najmReport} onChange={e=>setNajmReport(e.target.value)}
                  accent={THEMES.accident.color} style={{ fontFamily:'monospace', fontSize:16 }} />
                {!najmReport && <div style={{ fontSize:11, color:'#92400e', marginTop:5, fontWeight:600 }}>⚠️ Required — call Najm 920033270 to get this number</div>}
              </div>
              <div>
                <SLabel>Police Report Number (optional)</SLabel>
                <SInp placeholder="From Muroor — leave blank if none" value={policeReport} onChange={e=>setPoliceReport(e.target.value)} style={{ fontFamily:'monospace' }} />
              </div>
            </SCardSection>
          </SCard>

          {/* Injuries */}
          <SCard>
            <SCardSection title="Injuries" accent={THEMES.accident.color}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:hasInjuries?14:0 }}>
                {[{v:false,label:'🙂 No injuries'},{v:true,label:'🩺 Injuries present'}].map(o=>(
                  <button key={String(o.v)} type="button" onClick={()=>setHasInjuries(o.v)}
                    style={{ padding:'13px 8px', borderRadius:13, border:'2px solid',
                      borderColor:hasInjuries===o.v?(o.v?THEMES.accident.color:THEMES.inspection.color):'#e8ecf0',
                      background:hasInjuries===o.v?(o.v?THEMES.accident.light:THEMES.inspection.light):'#fafbfc',
                      color:hasInjuries===o.v?(o.v?THEMES.accident.color:THEMES.inspection.color):'#64748b',
                      cursor:'pointer', fontWeight:hasInjuries===o.v?800:500, fontSize:12 }}>
                    {o.label}
                  </button>
                ))}
              </div>
              {hasInjuries && (
                <SArea rows={2} placeholder="Describe injuries and who is affected…"
                  value={injuryDesc} onChange={e=>setInjuryDesc(e.target.value)} accent={THEMES.accident.color} />
              )}
            </SCardSection>
          </SCard>

          {/* Third party */}
          <SCard>
            <SCardSection title="Third Party" accent={THEMES.accident.color}>
              <div style={{ marginBottom:14 }}>
                <SLabel>Third party involved?</SLabel>
                <div style={{ display:'flex', gap:8 }}>
                  {[{v:'NONE',label:'None'},{v:'PERSONAL',label:'Personal'},{v:'COMPANY',label:'Company'}].map(o=>(
                    <button key={o.v} type="button" onClick={()=>setThirdPartyType(o.v)}
                      style={{ flex:1, padding:'11px 6px', borderRadius:11, border:'2px solid',
                        borderColor:thirdPartyType===o.v?THEMES.accident.color:'#e8ecf0',
                        background:thirdPartyType===o.v?`${THEMES.accident.color}12`:'#fafbfc',
                        color:thirdPartyType===o.v?THEMES.accident.color:'#64748b',
                        cursor:'pointer', fontWeight:thirdPartyType===o.v?800:500, fontSize:12, textAlign:'center' }}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {thirdPartyType !== 'NONE' && (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                    <div>
                      <SLabel>Name *</SLabel>
                      <SInp placeholder="Full name" value={tpName} onChange={e=>setTpName(e.target.value)} />
                    </div>
                    <div>
                      <SLabel>Plate No. *</SLabel>
                      <SInp placeholder="e.g. AAA 0000" value={tpPlate} onChange={e=>setTpPlate(e.target.value)} style={{ fontFamily:'monospace' }} />
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    <div>
                      <SLabel>Phone</SLabel>
                      <SInp type="tel" placeholder="05xxxxxxxx" value={tpPhone} onChange={e=>setTpPhone(e.target.value)} />
                    </div>
                    <div>
                      <SLabel>Insurance Co.</SLabel>
                      <SInp placeholder="e.g. Tawuniya" value={tpInsurance} onChange={e=>setTpInsurance(e.target.value)} />
                    </div>
                  </div>
                  {thirdPartyType === 'COMPANY' && (
                    <div style={{ background:'#fffbeb', border:'1px solid #fbbf24', borderRadius:10, padding:'9px 12px', marginTop:12, fontSize:12, color:'#92400e', display:'flex', gap:6 }}>
                      <span>💡</span><span>Company vehicle — note the company name and fleet/registration number if available.</span>
                    </div>
                  )}
                </>
              )}
            </SCardSection>
          </SCard>

          {/* Photos */}
          <SCard>
            <SCardSection title="Accident Photos (min 2)" accent={THEMES.accident.color}>
              <PhotoCapture label="Photo 1 — Overall damage / scene" required value={accPhoto1Prev}
                onChange={(p,f)=>{setAccPhoto1Prev(p);setAccPhoto1File(f)}} accent={THEMES.accident.color} />
              <PhotoCapture label="Photo 2 — Close-up damage / other plate" required value={accPhoto2Prev}
                onChange={(p,f)=>{setAccPhoto2Prev(p);setAccPhoto2File(f)}} accent={THEMES.accident.color} />
              <PhotoCapture label="Photo 3 — Road / skid marks (optional)" value={accPhoto3Prev}
                onChange={(p,f)=>{setAccPhoto3Prev(p);setAccPhoto3File(f)}} accent={THEMES.accident.color} />
              <div style={{ background:`${THEMES.accident.color}08`, border:`1px solid ${THEMES.accident.color}30`, borderRadius:10, padding:'10px 12px', fontSize:12, color:THEMES.accident.dark, display:'flex', gap:6, lineHeight:1.6 }}>
                <span>⚠️</span><span>Include: damage to both vehicles, both plates, road conditions, and any street signs. More photos = faster insurance claim.</span>
              </div>
            </SCardSection>
          </SCard>
        </>
      )}

      {/* Error */}
      {submitErr && (
        <div style={{ background:'#fef2f2', border:'1.5px solid #f87171', borderRadius:12, padding:'12px 14px', color:'#991b1b', fontSize:13, marginBottom:12 }}>
          ⛔ {submitErr}
        </div>
      )}

      {/* Show submit only if weekly limit not blocking */}
      {!(logType === 'fuel' && lastFuel && !fuelOverride) && (
        <button onClick={handleSubmit} disabled={submitting}
          style={{ background: t.grad, color:'#fff', border:'none', borderRadius:16,
            padding:'17px', fontSize:16, fontWeight:800, cursor:'pointer', width:'100%',
            opacity:submitting?0.7:1, marginBottom:8, boxShadow:`0 4px 20px ${t.color}40` }}>
          {submitting ? '⏳ Submitting…' : `Submit ${typeLabels[logType]?.slice(3)}`}
        </button>
      )}

      <div style={{ textAlign:'center', color:'#cbd5e1', fontSize:11, paddingBottom:32 }}>
        Ratal Group · ACCSYS · {new Date().getFullYear()}
      </div>
      </div>{/* end padding wrapper */}
    </div>
  )
}
