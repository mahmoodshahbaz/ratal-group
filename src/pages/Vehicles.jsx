import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.Operations
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useExpandable, ExpandableRow, DetailField, DetailRow, DetailSection, DetailActions } from '../components/ExpandableRow'
import { printDocument, openPrintWindow } from '../lib/templatePrint'

// Vehicle Management Module
// Tracks: vehicle register, expiry docs (Insurance/MVPI/Registration/Saher), maintenance log
// Expiry entries auto-sync to compliance_docs table

const fmt     = d => d ? new Date(d).toLocaleDateString('en-GB') : '—'
const TODAY   = new Date().toISOString().slice(0,10)
const IN30    = new Date(Date.now()+30*864e5).toISOString().slice(0,10)
const IN7     = new Date(Date.now()+ 7*864e5).toISOString().slice(0,10)
const daysLeft = d => d ? Math.ceil((new Date(d)-new Date(TODAY))/864e5) : null

function urgency(date) {
  if (!date) return { color:'#aab2bd', bg:'#f5f7fa', label:'—' }
  const d = daysLeft(date)
  if (d < 0)  return { color:'#fff',    bg:'#b71c1c', label:`${Math.abs(d)}d EXPIRED` }
  if (d === 0) return { color:'#fff',   bg:'#c62828', label:'EXPIRES TODAY' }
  if (d <= 7)  return { color:'#fff',   bg:'#c62828', label:`${d}d` }
  if (d <= 30) return { color:'#e65100',bg:'#fff3e0', label:`${d}d` }
  return { color:'#2e7d32', bg:'#e8f5e9', label:`${d}d` }
}

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'18px 22px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:18 },
  inp:   { width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
  btn:   (c='#0079BC') => ({ background:c, color:'#fff', border:'none', borderRadius:9, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'Poppins',sans-serif" }),
  label: { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4 },
  row:   { display:'flex', gap:12, marginBottom:14 },
  col:   { flex:1 },
  tbl:   { width:'100%', borderCollapse:'collapse', fontSize:12 },
  th:    { background:MC, color:'#fff', padding:'9px 12px', fontWeight:700, textAlign:'left', fontSize:11, fontFamily:"'Poppins',sans-serif" },
  td:    { padding:'9px 12px', borderBottom:'1px solid #f0f4f8', color:'#1a2e3d', verticalAlign:'middle' },
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' },
  modal: { background:'#fff', borderRadius:16, padding:28, width:720, maxWidth:'97vw', maxHeight:'93vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.18)' },
  tab:   (active) => ({ padding:'9px 18px', border:'none', cursor:'pointer', fontWeight:700, fontSize:13, borderRadius:'8px 8px 0 0', background:active?'#0079BC':'transparent', color:active?'#fff':'#6b7c93', fontFamily:"'Poppins',sans-serif" }),
}

const VEHICLE_TYPES = ['SEDAN','SUV','PICKUP','VAN','BUS','TRUCK','MOTORCYCLE','HEAVY EQUIPMENT','OTHER']
const FUEL_TYPES    = ['PETROL','DIESEL','ELECTRIC','HYBRID']
const DOC_TYPES     = ['INSURANCE','MVPI','REGISTRATION','SAHER']
const DOC_LABELS    = { INSURANCE:'🛡 Insurance', MVPI:'🔧 MVPI', REGISTRATION:'📋 Registration', SAHER:'📡 Saher' }
const MAINT_TYPES   = ['OIL_CHANGE','TYRE_CHANGE','BRAKE_SERVICE','AC_SERVICE','BATTERY','ACCIDENT_REPAIR','PERIODIC_SERVICE','MAJOR_REPAIR','OTHER']

const OWNERSHIP_TYPES = ['OWN', 'RENT']

const EMPTY_VEH = {
  ownership_type:'OWN',
  plate_number:'', vehicle_type:'SUV', make:'', model:'', year:new Date().getFullYear(),
  color:'', chassis_no:'', engine_no:'', fuel_type:'PETROL',
  odometer_reading:0, status:'ACTIVE', notes:'',
  ins_expiry:'', mvpi_expiry:'', reg_expiry:'', saher_expiry:'',
  // Rental fields
  rental_company:'', rental_vat_no:'',
  rent_start:'', rent_end:'',
  rate_daily:0, rate_monthly:0,
  km_per_day:0, km_per_month:0,
}

const EMPTY_MAINT = {
  vehicle_id:'', maintenance_type:'OIL_CHANGE', description:'',
  cost:0, odometer_at_service:0, service_date:TODAY, next_service_date:'',
  workshop_name:'', invoice_ref:'',
}

async function syncToCompliance(entityId, vehicleId, plateNo, docType, expiryDate) {
  if (!expiryDate) return
  // Upsert into compliance_docs using vehicle + docType as key
  const { data: existing } = await supabase.from('compliance_docs')
    .select('id').eq('entity_id',entityId).eq('ref_id',vehicleId).eq('doc_type',docType).limit(1)

  const payload = {
    entity_id:   entityId,
    category:    'VEHICLE',
    doc_type:    docType,
    ref_id:      vehicleId,
    holder_name: plateNo,
    expiry_date: expiryDate,
    is_active:   true,
  }
  if (existing?.length) {
    await supabase.from('compliance_docs').update(payload).eq('id',existing[0].id)
  } else {
    await supabase.from('compliance_docs').insert(payload)
  }
}

function SectionLabel({ icon, label, color='#1a2e3d' }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, margin:'16px 0 10px' }}>
      <span style={{ fontSize:14 }}>{icon}</span>
      <span style={{ fontSize:11, fontWeight:800, color, textTransform:'uppercase', letterSpacing:0.8 }}>{label}</span>
      <div style={{ flex:1, height:1, background:`${color}22`, marginLeft:4 }} />
    </div>
  )
}

export default function Vehicles({ entityId }) {
  const [vehicles,  setVehicles]  = useState([])
  const [employees, setEmployees] = useState([])
  const [depts,     setDepts]     = useState([])
  const [maints,    setMaints]    = useState([])   // maintenance records for selected vehicle
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState('register') // register | maintenance
  const [filter,    setFilter]    = useState({ status:'', type:'', search:'' })

  const { toggle: toggleVeh, isOpen: vehOpen } = useExpandable()

  const [showVehBanner,   setShowVehBanner]   = useState(false)
  const [showVehForm,     setShowVehForm]     = useState(false)
  const [editVeh,         setEditVeh]         = useState(null)
  const [vehForm,         setVehForm]         = useState(EMPTY_VEH)
  const [savingVeh,       setSavingVeh]       = useState(false)
  const [vehStep,         setVehStep]         = useState(1)  // 1-4 wizard steps
  const [vehAttachments,  setVehAttachments]  = useState([])
  const vehFileRef = useRef(null)

  const [detailVeh,   setDetailVeh] = useState(null)
  const [detailTab,   setDetailTab] = useState('info')  // info | docs | maintenance

  const [showMaintForm, setShowMaintForm] = useState(false)
  const [maintForm,     setMaintForm]     = useState(EMPTY_MAINT)
  const [savingMaint,   setSavingMaint]   = useState(false)

  // Vehicle Assignment
  const [showAssignBanner, setShowAssignBanner] = useState(false)
  const [showAssignForm,   setShowAssignForm]   = useState(false)
  const [assignStep,       setAssignStep]       = useState(0)
  const [assignForm,       setAssignForm]       = useState({
    assignment_date: TODAY, return_date:'', department_id:'',
    employee_id:'', iqama_dl:'', vehicle_id:'', vehicle_type:'', plate_number:'', make:'', color:'',
  })
  const [savingAssign,     setSavingAssign]     = useState(false)
  const [deptEmployees,    setDeptEmployees]    = useState([])
  const [activeAssignments,setActiveAssignments]= useState(new Map()) // plate_number → assignment record
  const [assignments,      setAssignments]      = useState([])        // all assignment records
  const [assignFilter,     setAssignFilter]     = useState('active')  // active | all | returned

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    // Core tables — must succeed
    const [{ data:v },{ data:e },{ data:d }] = await Promise.all([
      supabase.from('vehicles').select('*').eq('entity_id',entityId).eq('status','ACTIVE').order('plate_number'),
      supabase.from('employees').select('id,full_name_en,department_id,phone').eq('entity_id',entityId).order('full_name_en'),
      supabase.from('departments').select('id,dept_name,dept_code').eq('entity_id',entityId).eq('is_active',true).order('dept_name'),
    ])
    setVehicles(v||[]); setEmployees(e||[]); setDepts(d||[])
    // vehicle_assignments — optional (table may not exist if SQL patch not yet run)
    try {
      const { data:a } = await supabase.from('vehicle_assignments')
        .select('*').eq('entity_id',entityId).order('assignment_date',{ascending:false})
      const all = a||[]
      setAssignments(all)
      // Build Map: plate_number → most recent active (no return_date) assignment
      const activeMap = new Map()
      all.filter(r=>!r.return_date).forEach(r=>{ if(!activeMap.has(r.plate_number)) activeMap.set(r.plate_number,r) })
      setActiveAssignments(activeMap)
    } catch(_) {
      setActiveAssignments(new Map()); setAssignments([])
    }
    setLoading(false)
  }

  async function loadMaintenance(vehicleId) {
    const { data } = await supabase.from('vehicle_maintenance')
      .select('*').eq('vehicle_id',vehicleId).order('service_date',{ascending:false})
    setMaints(data||[])
  }

  function openNewVeh() {
    setEditVeh(null); setVehForm(EMPTY_VEH); setVehStep(1); setVehAttachments([])
    setShowVehBanner(true)
  }

  function openEditVeh(v) {
    setEditVeh(v); setVehStep(1); setVehAttachments([])
    setVehForm({
      ownership_type:v.ownership_type||'OWN',
      plate_number:v.plate_number||'', vehicle_type:v.vehicle_type||'SUV',
      make:v.make||'', model:v.model||'', year:v.year||new Date().getFullYear(),
      color:v.color||'', chassis_no:v.chassis_no||'', engine_no:v.engine_no||'',
      fuel_type:v.fuel_type||'PETROL',
      odometer_reading:v.odometer_reading||0, status:v.status||'ACTIVE', notes:v.notes||'',
      ins_expiry:v.ins_expiry||'', mvpi_expiry:v.mvpi_expiry||'',
      reg_expiry:v.reg_expiry||'', saher_expiry:v.saher_expiry||'',
      rental_company:v.rental_company||'', rental_vat_no:v.rental_vat_no||'',
      rent_start:v.rent_start||'', rent_end:v.rent_end||'',
      rate_daily:v.rate_daily||0, rate_monthly:v.rate_monthly||0,
      km_per_day:v.km_per_day||0, km_per_month:v.km_per_month||0,
    })
    setShowVehForm(true)
  }

  async function saveVehicle() {
    if (!vehForm.plate_number) { alert('Plate number is required'); return }
    setSavingVeh(true)
    const isRent = vehForm.ownership_type === 'RENT'
    const base = {
      ownership_type:   vehForm.ownership_type,
      plate_number:     vehForm.plate_number,
      vehicle_type:     vehForm.vehicle_type,
      make:             vehForm.make,
      model:            vehForm.model,
      year:             +vehForm.year||0,
      color:            vehForm.color,
      fuel_type:        vehForm.fuel_type,
      odometer_reading: +vehForm.odometer_reading||0,
      status:           vehForm.status,
      notes:            vehForm.notes,
      ins_expiry:       vehForm.ins_expiry  || null,
      mvpi_expiry:      vehForm.mvpi_expiry || null,
      reg_expiry:       vehForm.reg_expiry  || null,
      saher_expiry:     vehForm.saher_expiry|| null,
      entity_id:        entityId,
    }
    // chassis/engine only meaningful for OWN
    if (!isRent) {
      base.chassis_no = vehForm.chassis_no || null
      base.engine_no  = vehForm.engine_no  || null
    }
    // rental fields only when RENT — avoids schema-cache errors if patch not yet run
    if (isRent) {
      base.rental_company = vehForm.rental_company || null
      base.rental_vat_no  = vehForm.rental_vat_no  || null
      base.rent_start     = vehForm.rent_start      || null
      base.rent_end       = vehForm.rent_end        || null
      base.rate_daily     = +vehForm.rate_daily     || 0
      base.rate_monthly   = +vehForm.rate_monthly   || 0
      base.km_per_day     = +vehForm.km_per_day     || 0
      base.km_per_month   = +vehForm.km_per_month   || 0
    }
    const payload = base

    const { data:saved, error } = editVeh
      ? await supabase.from('vehicles').update(payload).eq('id',editVeh.id).select().single()
      : await supabase.from('vehicles').insert(payload).select().single()

    if (error) { alert(error.message); setSavingVeh(false); return }

    // Sync expiry dates to compliance_docs
    const vId = saved.id; const pl = saved.plate_number
    await Promise.all([
      syncToCompliance(entityId,vId,pl,'INSURANCE',  vehForm.ins_expiry),
      syncToCompliance(entityId,vId,pl,'MVPI',       vehForm.mvpi_expiry),
      syncToCompliance(entityId,vId,pl,'REGISTRATION',vehForm.reg_expiry),
      syncToCompliance(entityId,vId,pl,'SAHER',       vehForm.saher_expiry),
    ])
    setSavingVeh(false); setShowVehForm(false); load()
  }

  async function deactivate(id) {
    if (!window.confirm('Mark this vehicle as INACTIVE?')) return
    await supabase.from('vehicles').update({ status:'INACTIVE' }).eq('id',id)
    load()
  }

  async function openDetail(v) {
    setDetailVeh(v); setDetailTab('info')
    loadMaintenance(v.id)
  }

  function openMaintForm(vehicleId) {
    setMaintForm({ ...EMPTY_MAINT, vehicle_id:vehicleId }); setShowMaintForm(true)
  }

  async function saveMaint() {
    if (!maintForm.vehicle_id) return
    setSavingMaint(true)
    const payload = {
      ...maintForm,
      entity_id:  entityId,
      cost:       +maintForm.cost||0,
      odometer_at_service: +maintForm.odometer_at_service||0,
    }
    // Update vehicle odometer if higher
    const veh = vehicles.find(v=>v.id===maintForm.vehicle_id)
    if (veh && (+maintForm.odometer_at_service > (veh.odometer_reading||0))) {
      await supabase.from('vehicles').update({ odometer_reading:+maintForm.odometer_at_service }).eq('id',veh.id)
    }
    const { error } = await supabase.from('vehicle_maintenance').insert(payload)
    setSavingMaint(false)
    if (error) { alert(error.message); return }
    setShowMaintForm(false)
    loadMaintenance(maintForm.vehicle_id)
    load()
  }

  function fv(k,val) { setVehForm(p=>({...p,[k]:val})) }
  function fm(k,val) { setMaintForm(p=>({...p,[k]:val})) }
  function fa(k,val) { setAssignForm(p=>({...p,[k]:val})) }

  async function onAssignDeptChange(deptId) {
    setAssignForm(p=>({...p, department_id:deptId, employee_id:'', iqama_dl:''}))
    setDeptEmployees([])
    if (!deptId) return
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('entity_id', entityId)
      .eq('department_id', deptId)
      .order('full_name_en')
    if (error) console.error('dept employees error:', error.message)
    else console.log('dept employees loaded:', data?.length, data?.[0])
    setDeptEmployees(data || [])
  }

  function onAssignEmployeeChange(empId) {
    const emp = deptEmployees.find(e=>e.id===empId)
    setAssignForm(p=>({
      ...p,
      employee_id: empId,
      iqama_dl: emp?.iqama_number || '',
    }))
  }

  function onAssignVehicleChange(vehicleId) {
    const veh = vehicles.find(v=>v.id===vehicleId)
    if (!veh) { setAssignForm(p=>({...p, vehicle_id:'', plate_number:'', vehicle_type:'', make:'', color:''})); return }
    setAssignForm(p=>({
      ...p,
      vehicle_id:     veh.id,
      plate_number:   veh.plate_number,
      vehicle_type:   veh.vehicle_type    || '',
      make:           veh.make            || '',
      color:          veh.color           || '',
      ownership_type: veh.ownership_type  || 'OWN',
    }))
  }

  async function markReturned(assignment) {
    if (!window.confirm(`Mark ${assignment.plate_number} as returned today?`)) return
    const { error } = await supabase.from('vehicle_assignments')
      .update({ return_date: TODAY }).eq('id', assignment.id)
    if (error) { alert(error.message); return }
    load()
  }

  async function saveAssignment() {
    if (!assignForm.employee_id) { alert('Please select an employee'); return }
    if (!assignForm.vehicle_id)  { alert('Please select a vehicle');  return }
    // Double-check availability (race condition guard)
    if (activeAssignments.has(assignForm.plate_number)) {
      alert(`${assignForm.plate_number} is still assigned to another employee.\nRecord the return date for that assignment first.`); return
    }

    // Open print window synchronously (before any await, to bypass popup blocker)
    const preWin = openPrintWindow()

    setSavingAssign(true)
    const { error } = await supabase.from('vehicle_assignments').insert({
      entity_id:       entityId,
      assignment_date: assignForm.assignment_date,
      return_date:     assignForm.return_date || null,
      department_id:   assignForm.department_id || null,
      employee_id:     assignForm.employee_id,
      iqama_dl:        assignForm.iqama_dl,
      vehicle_type:    assignForm.vehicle_type,
      plate_number:    assignForm.plate_number,
      make:            assignForm.make,
      color:           assignForm.color,
    })
    setSavingAssign(false)
    if (error) { if (preWin) preWin.close(); alert(error.message); return }

    // Gather data for the handover document
    const selVeh  = vehicles.find(v => v.id === assignForm.vehicle_id) || {}
    const selEmp  = employees.find(e => e.id === assignForm.employee_id) || {}
    const selDept = depts.find(d => d.id === assignForm.department_id) || {}
    const [aYr, aMo, aDy] = (assignForm.assignment_date || TODAY).split('-')
    const dateStr = `${aDy || '00'}${aMo || '00'}${(aYr || '0000').slice(2)}`
    const refNum  = `VH-${(assignForm.plate_number || 'VEH').replace(/\s+/g, '')}-${dateStr}`

    printDocument('vehicle_handover', {
      vehicle_plate:            assignForm.plate_number || '',
      vehicle_assigned_to_en:   selEmp.full_name_en    || '',
      vehicle_driver_license:   assignForm.iqama_dl    || '',
      vehicle_assigned_phone:   selEmp.phone           || '',
      generated_date:           assignForm.assignment_date || TODAY,
      reference_number:         refNum,
      vehicle_assigned_dept:    selDept.dept_code || selDept.dept_name || '',
      vehicle_make:             assignForm.make        || selVeh.make        || '',
      vehicle_model:            selVeh.model           || '',
      vehicle_vin:              selVeh.vin             || '',
      vehicle_reg_expiry:       selVeh.reg_expiry      || '',
      vehicle_insurance_expiry: selVeh.ins_expiry      || '',
      vehicle_odometer:         selVeh.odometer_reading || 0,
      handover_by_name_en:      'Mohammed Rashad',
    }, {
      orientation:   'portrait',
      driveFolder:   'vehicle-handovers',
      driveFileName: `VH-${(assignForm.plate_number || 'VEH').replace(/\s+/g, '')}-${dateStr}.pdf`,
      requestDate:   assignForm.assignment_date || TODAY,
      autoRun:       true,
      _preWin:       preWin,
    })

    setShowAssignForm(false)
    setTab('register')
    setAssignForm({ assignment_date:TODAY, return_date:'', department_id:'', employee_id:'', iqama_dl:'', vehicle_id:'', vehicle_type:'', plate_number:'', make:'', color:'' })
    load() // refresh active assignments
  }

  // Available = ACTIVE vehicles NOT currently assigned (no open assignment)
  const availableVehicles = vehicles.filter(v => !activeAssignments.has(v.plate_number))

  // Stats
  const active   = vehicles.filter(v=>v.status==='ACTIVE')
  const expiring = vehicles.filter(v=>
    [v.ins_expiry,v.mvpi_expiry,v.reg_expiry,v.saher_expiry].some(d=>d&&d<=IN30))
  const expired  = vehicles.filter(v=>
    [v.ins_expiry,v.mvpi_expiry,v.reg_expiry,v.saher_expiry].some(d=>d&&d<TODAY))

  const filtered = vehicles
    .filter(v => !filter.status || v.status===filter.status)
    .filter(v => !filter.type   || v.vehicle_type===filter.type)
    .filter(v => !filter.search ||
      (v.plate_number||'').toLowerCase().includes(filter.search.toLowerCase()) ||
      (v.make||'').toLowerCase().includes(filter.search.toLowerCase()) ||
      (v.model||'').toLowerCase().includes(filter.search.toLowerCase()) ||
      (v.driver_name||'').toLowerCase().includes(filter.search.toLowerCase()))

  return (
    <div>
      {/* ── Step 0 Opening Banner ── */}
      <PageBanner
        isOpen={showVehBanner}
        onClose={() => setShowVehBanner(false)}
        onStart={() => { setShowVehBanner(false); setShowVehForm(true) }}
        chapterL1="#70A5A6"
        chapterL2="#EAF3F2"
        moduleColor={MC}
        chapterLabel="Operations"
        formTitle={['New', 'Fleet', 'Vehicle']}
        steps={['Vehicle Details', 'Documents', 'Attachments', 'Notes & Review']}
        icon="🚗"
        description="Register a vehicle to the fleet — Own or Rental. Supports maintenance tracking and site assignment."
      />

      <PageBanner
        isOpen={showAssignBanner}
        onClose={() => { setShowAssignBanner(false); setTab('assignments') }}
        onStart={() => { setShowAssignBanner(false); setAssignStep(1); setShowAssignForm(true) }}
        chapterL1="#70A5A6"
        chapterL2="#EAF3F2"
        moduleColor="#5C5C72"
        chapterLabel="Operations"
        formTitle={['Vehicle', 'Assignment', 'Form']}
        steps={['Vehicle Information', 'Employee Information']}
        icon="🔑"
        description="Assign a fleet vehicle to an employee or department. Sets the assignment period and records Iqama / DL details."
      />

      {/* Header — chapter H1 provided by AppShell; only action button here */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontSize:12, color:'#64748b' }}>Fleet register · Document expiry · Maintenance log</div>
        <button style={S.btn()} onClick={openNewVeh}>+ Add Vehicle</button>
      </div>

      {/* KPI Cards — 6-column grid, never scrolls */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:18 }}>
        {[
          { label:'Total Fleet',   value:vehicles.length,                                      grad:'linear-gradient(135deg,#0079BC,#005a8e)', icon:'🚗' },
          { label:'Own Fleet',     value:vehicles.filter(v=>v.ownership_type!=='RENT').length, grad:'linear-gradient(135deg,#70A5A6,#0079BC)', icon:'🏢' },
          { label:'Rentals',       value:vehicles.filter(v=>v.ownership_type==='RENT').length, grad:'linear-gradient(135deg,#0079BCaa,#005a8e)', icon:'🔑' },
          { label:'Active',        value:active.length,                                        grad:'linear-gradient(135deg,#0079BC,#005a8e)', icon:'✅' },
          { label:'Expiring ≤30d', value:expiring.length,                                      grad:'linear-gradient(135deg,#e65100,#bf360c)', icon:'⚠️', click:()=>setFilter(f=>({...f,status:'ACTIVE'})) },
          { label:'Expired Docs',  value:expired.length,                                       grad:'linear-gradient(135deg,#c62828,#b71c1c)', icon:'🚨' },
        ].map(c=>(
          <div key={c.label} onClick={c.click}
            style={{ background:c.grad, borderRadius:12, padding:'12px 14px',
              boxShadow:'0 3px 12px rgba(0,0,0,0.15)', cursor:c.click?'pointer':'default',
              display:'flex', alignItems:'center', gap:10,
            }}>
            <span style={{ fontSize:20 }}>{c.icon}</span>
            <div>
              <div style={{ fontSize:18, fontWeight:800, color:'#fff', lineHeight:1, fontFamily:"'Poppins',sans-serif" }}>{c.value}</div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.8)', fontWeight:700, marginTop:2, whiteSpace:'nowrap', fontFamily:"'Poppins',sans-serif" }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:0, borderBottom:'2px solid #e8edf2' }}>
        {[
          ['register',    '📋 Registered Vehicles'],
          ['assign',      '🔑 Register Vehicle'],
          ['assignments', '🚦 Assignments'],
          ['maintenance', '🔧 Maintenance Log'],
        ].map(([k,l])=>(
          <button key={k} style={S.tab(tab===k)}
            onClick={()=>{ setTab(k==='assign'?'assign':k); if(k==='assign'){ setShowAssignBanner(true) } }}>
            {l}
          </button>
        ))}
      </div>

      {tab==='register' && (
        <>
          {/* Filters */}
          <div style={{ ...S.card, padding:'12px 16px', display:'flex', gap:12, flexWrap:'wrap', marginTop:14, marginBottom:14, borderRadius:'0 14px 14px 14px' }}>
            <input style={{ ...S.inp, maxWidth:240 }} placeholder="Search plate, make, model, driver…" value={filter.search} onChange={e=>setFilter(f=>({...f,search:e.target.value}))} />
            <select style={{ ...S.inp, maxWidth:160 }} value={filter.status} onChange={e=>setFilter(f=>({...f,status:e.target.value}))}>
              <option value="">All Statuses</option>
              <option>ACTIVE</option><option>INACTIVE</option><option>SCRAPPED</option>
            </select>
            <select style={{ ...S.inp, maxWidth:180 }} value={filter.type} onChange={e=>setFilter(f=>({...f,type:e.target.value}))}>
              <option value="">All Types</option>
              {VEHICLE_TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
            {(filter.status||filter.type||filter.search) && <button style={{ ...S.btn('#aab2bd'), padding:'7px 14px', fontSize:11 }} onClick={()=>setFilter({status:'',type:'',search:''})}>✕ Clear</button>}
            <div style={{ fontSize:12, color:'#6b7c93', alignSelf:'center' }}>{filtered.length} vehicles</div>
          </div>

          <div style={S.card}>
            {loading ? <div style={{ textAlign:'center', padding:40, color:'#6b7c93' }}>Loading…</div> : (
              <table style={S.tbl}>
                <thead><tr>
                  <th style={S.th}>Plate No.</th>
                  <th style={S.th}>Type / Make</th>
                  <th style={S.th}>Year</th>
                  <th style={S.th}>Assigned To</th>
                  <th style={S.th}>Worst Expiry</th>
                  <th style={S.th}>Status</th>
                  <th style={{ ...S.th, width:32 }}></th>
                </tr></thead>
                <tbody>
                  {filtered.length===0 && <tr><td colSpan={7} style={{ ...S.td, textAlign:'center', color:'#aab2bd', padding:34 }}>No vehicles — click "+ Add Vehicle"</td></tr>}
                  {filtered.map((v,i)=>{
                    const ins  = urgency(v.ins_expiry)
                    const mvpi = urgency(v.mvpi_expiry)
                    const reg  = urgency(v.reg_expiry)
                    const shr  = urgency(v.saher_expiry)
                    // Worst expiry = earliest (smallest days remaining)
                    const allExp = [ins,mvpi,reg,shr].filter(u=>u.label!=='—')
                    const worst = allExp.sort((a,b)=>{ const da=parseInt(a.label)||9999; const db=parseInt(b.label)||9999; return da-db })[0]
                    const assignment = activeAssignments.get(v.plate_number)
                    const assignedEmp = assignment ? employees.find(e=>e.id===assignment.employee_id) : null

                    return (
                      <ExpandableRow
                        key={v.id}
                        id={v.id}
                        isOpen={vehOpen(v.id)}
                        onToggle={toggleVeh}
                        colSpan={6}
                        zebra={i%2!==0}
                        summary={<>
                          <td style={{ ...S.td, fontWeight:800, fontFamily:'monospace', fontSize:13, color:'#1a2e3d' }}>{v.plate_number}</td>
                          <td style={S.td}>
                            <span style={{ fontWeight:700 }}>{v.vehicle_type}</span>
                            <span style={{ fontSize:11, color:'#6b7c93', marginLeft:6 }}>{v.make} {v.model}</span>
                            {v.ownership_type==='RENT' && <span style={{ marginLeft:6, background:'#e0f7fa', color:'#006064', fontSize:9, fontWeight:800, padding:'1px 6px', borderRadius:10 }}>RENT</span>}
                          </td>
                          <td style={{ ...S.td, color:'#6b7c93' }}>{v.year||'—'}</td>
                          <td style={{ ...S.td, fontSize:11 }}>
                            {assignedEmp
                              ? <span style={{ fontWeight:700, color:'#0079BC' }}>{assignedEmp.full_name_en}</span>
                              : <span style={{ color:'#c0c8d4' }}>Unassigned</span>}
                          </td>
                          <td style={S.td}>
                            {worst
                              ? <span style={{ background:worst.bg, color:worst.color, padding:'2px 8px', borderRadius:12, fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>{worst.label}</span>
                              : <span style={{ color:'#c0c8d4', fontSize:11 }}>—</span>}
                          </td>
                          <td style={S.td}>
                            <span style={{ background:v.status==='ACTIVE'?'#e8f5e9':'#f5f7fa', color:v.status==='ACTIVE'?'#2e7d32':'#aab2bd', padding:'2px 10px', borderRadius:20, fontSize:10, fontWeight:800 }}>{v.status}</span>
                          </td>
                        </>}
                        detail={
                          <div style={{ padding:'14px 20px' }}>
                            <DetailRow>
                              <DetailField label="Color"     value={v.color} />
                              <DetailField label="Fuel"      value={v.fuel_type} />
                              <DetailField label="Odometer"  value={v.odometer_reading ? `${v.odometer_reading} km` : null} />
                              {v.chassis_no && <DetailField label="Chassis No." value={v.chassis_no} mono />}
                              {v.engine_no  && <DetailField label="Engine No."  value={v.engine_no}  mono />}
                            </DetailRow>
                            <DetailSection label="Document Expiry">
                              <DetailRow>
                                <DetailField label="🛡 Insurance"   value={v.ins_expiry}   color={ins.color} />
                                <DetailField label="🔧 MVPI"        value={v.mvpi_expiry}  color={mvpi.color} />
                                <DetailField label="📋 Registration" value={v.reg_expiry}   color={reg.color} />
                                <DetailField label="📡 Saher"       value={v.saher_expiry} color={shr.color} />
                              </DetailRow>
                            </DetailSection>
                            {v.ownership_type==='RENT' && (
                              <DetailSection label="Rental Info" borderColor="#b2ebf2">
                                <DetailRow>
                                  <DetailField label="Company"    value={v.rental_company} />
                                  <DetailField label="VAT No."    value={v.rental_vat_no} mono />
                                  <DetailField label="From"       value={v.rent_start} />
                                  <DetailField label="Until"      value={v.rent_end} />
                                  <DetailField label="Daily Rate" value={v.rate_daily ? `SAR ${v.rate_daily}` : null} />
                                  <DetailField label="Monthly"    value={v.rate_monthly ? `SAR ${v.rate_monthly}` : null} />
                                </DetailRow>
                              </DetailSection>
                            )}
                            {assignment && (
                              <DetailSection label="Current Assignment">
                                <DetailRow>
                                  <DetailField label="Assigned To" value={assignedEmp?.full_name_en || '—'} />
                                  <DetailField label="Iqama / DL"  value={assignment.iqama_dl} mono />
                                  <DetailField label="Since"       value={assignment.assignment_date} />
                                </DetailRow>
                              </DetailSection>
                            )}
                            {v.notes && <DetailSection label="Notes"><div style={{ fontSize:12, color:'#455a64' }}>{v.notes}</div></DetailSection>}
                            <DetailActions>
                              <button onClick={(e)=>{e.stopPropagation();openEditVeh(v)}} style={{ ...S.btn('#0079BC'), padding:'5px 14px', fontSize:11 }}>✏️ Edit</button>
                              <button onClick={(e)=>{e.stopPropagation();openDetail(v)}}   style={{ ...S.btn('#5A32D4'), padding:'5px 14px', fontSize:11 }}>📋 Full View</button>
                              {v.status==='ACTIVE' && <button onClick={(e)=>{e.stopPropagation();deactivate(v.id)}} style={{ ...S.btn('#c62828'), padding:'5px 14px', fontSize:11 }}>Deactivate</button>}
                            </DetailActions>
                          </div>
                        }
                      />
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab==='assignments' && (
        <div style={{ marginTop:14 }}>
          {/* Filter pills */}
          <div style={{ display:'flex', gap:8, marginBottom:14 }}>
            {[['active','🟢 Active'],['returned','✅ Returned'],['all','📋 All']].map(([v,l])=>(
              <button key={v} onClick={()=>setAssignFilter(v)}
                style={{ padding:'6px 16px', borderRadius:20, border:'none', fontWeight:700, fontSize:11, cursor:'pointer',
                  background: assignFilter===v ? '#1a2e3d' : '#f0f4f8', color: assignFilter===v ? '#fff' : '#6b7c93' }}>
                {l}
              </button>
            ))}
            <div style={{ marginLeft:'auto', fontSize:12, color:'#6b7c93', alignSelf:'center' }}>
              {assignments.filter(a=> assignFilter==='active' ? !a.return_date : assignFilter==='returned' ? !!a.return_date : true).length} records
            </div>
          </div>

          <div style={S.card}>
            {assignments.length === 0 ? (
              <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>
                No assignments yet — use <b>Register Vehicle</b> tab to assign vehicles to employees
              </div>
            ) : (
              <table style={S.tbl}>
                <thead><tr>
                  <th style={S.th}>Plate No.</th>
                  <th style={S.th}>Type / Make</th>
                  <th style={S.th}>Employee Name</th>
                  <th style={S.th}>Dept</th>
                  <th style={S.th}>Iqama / DL</th>
                  <th style={S.th}>From</th>
                  <th style={S.th}>Return</th>
                  <th style={S.th}>Status</th>
                  <th style={S.th}>Action</th>
                </tr></thead>
                <tbody>
                  {assignments
                    .filter(a=> assignFilter==='active' ? !a.return_date : assignFilter==='returned' ? !!a.return_date : true)
                    .map((a,i)=>{
                      const emp  = employees.find(e=>e.id===a.employee_id)
                      const dept = depts.find(d=>d.id===a.department_id)
                      const active = !a.return_date
                      return (
                        <tr key={a.id} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
                          <td style={{ ...S.td, fontWeight:800, fontFamily:'monospace', color:'#1a2e3d' }}>{a.plate_number}</td>
                          <td style={{ ...S.td, whiteSpace:'nowrap', fontWeight:600 }}>{a.vehicle_type||'—'}{a.make ? ` · ${a.make}` : ''}</td>
                          <td style={{ ...S.td, fontWeight:700 }}>{emp?.full_name_en || '—'}</td>
                          <td style={S.td}>{dept ? <span style={{ background:'#e8edf5', padding:'2px 8px', borderRadius:10, fontSize:11, fontWeight:700 }}>{dept.dept_code}</span> : '—'}</td>
                          <td style={{ ...S.td, fontFamily:'monospace', fontSize:12 }}>{a.iqama_dl||'—'}</td>
                          <td style={{ ...S.td, fontSize:11 }}>{a.assignment_date||'—'}</td>
                          <td style={{ ...S.td, fontSize:11, color: a.return_date ? '#2e7d32' : '#e65100' }}>{a.return_date||'Open'}</td>
                          <td style={S.td}>
                            <span style={{ background: active?'#e8f5e9':'#f5f7fa', color: active?'#2e7d32':'#aab2bd', padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:800 }}>
                              {active ? '🟢 Active' : '✅ Returned'}
                            </span>
                          </td>
                          <td style={S.td}>
                            {active && (
                              <button onClick={()=>markReturned(a)}
                                style={{ ...S.btn('#2e7d32'), padding:'4px 10px', fontSize:10 }}>
                                Mark Returned
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab==='maintenance' && (
        <div style={{ marginTop:14 }}>
          <div style={{ ...S.card }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:14, color:'#1a2e3d' }}>Maintenance Records — All Vehicles</div>
              <button style={S.btn('#2e7d32')} onClick={()=>{ setMaintForm({...EMPTY_MAINT,vehicle_id:''}); setShowMaintForm(true) }}>+ Log Service</button>
            </div>
            <AllMaintenance entityId={entityId} vehicles={vehicles} />
          </div>
        </div>
      )}

      {/* ── REGISTER VEHICLE (ASSIGNMENT) MODAL ─────────────────────── */}
      {showAssignForm && (() => {
        const PP = "'Poppins','Inter',sans-serif"
        const PRI = '#70A5A6'
        const closeAssign = () => { setShowAssignForm(false); setAssignStep(1); setTab('assignments') }
        const inpA = (ex={}) => ({ width:'100%', padding:'9px 14px', borderRadius:8, border:'1px solid #b0cfe8', fontSize:13, color:'#172D37', background:'#f8f8fc', outline:'none', fontFamily:PP, boxSizing:'border-box', ...ex })
        const lblA = { display:'block', fontSize:11, fontWeight:600, color:'#53666F', marginBottom:4 }
        const secA = { fontSize:9, fontWeight:800, color:'#0079BC', letterSpacing:1.5, textTransform:'uppercase', marginBottom:8, marginTop:12, paddingBottom:4, borderBottom:'1.5px solid #b0cfe8' }
        return (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&closeAssign()}>
          <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap');`}</style>
          <div style={{ width:860, maxWidth:'calc(100vw - 24px)', height:'min(92vh,660px)', borderRadius:0, overflow:'hidden', boxShadow:'0 28px 64px rgba(0,0,0,0.35)', fontFamily:PP, display:'flex', flexDirection:'column' }}>

            {/* ── STEPS 1–2 — 3-box wizard ── */}
            {assignStep>=1 && (
              <div style={{ flex:1, background:'#5C5C72', display:'flex', padding:20, boxSizing:'border-box' }}>
                <div style={{ flex:1, background:'#F2F2F6', position:'relative', display:'flex', overflow:'hidden' }}>
                  <div style={{ position:'absolute', top:0, right:0, width:'55%', height:'36%', background:'#0079BC', zIndex:1 }} />

                  {/* Sidebar */}
                  <div style={{ width:260, flexShrink:0, padding:'20px 20px 16px', display:'flex', flexDirection:'column', fontFamily:PP, position:'relative', zIndex:2 }}>
                    <div style={{ fontSize:12, fontWeight:800, color:'#1a1a2a', marginBottom:18, lineHeight:1.3 }}>Ratal Advanced Technologies</div>
                    <div style={{ fontSize:9, fontWeight:800, color:'#0079BC', letterSpacing:1.5, textTransform:'uppercase', marginBottom:4 }}>Fleet Management</div>
                    <div style={{ fontSize:18, fontWeight:900, color:'#172D37', lineHeight:1.2, marginBottom:4 }}>{assignStep===1?'Vehicle Info':'Employee Info'}</div>
                    <div style={{ fontSize:11, color:'#53666F', lineHeight:1.5, marginBottom:6 }}>{assignStep===1?'Select vehicle & period':'Assign to employee & confirm'}</div>
                    <div style={{ fontSize:9, fontWeight:800, color:'#0079BC', letterSpacing:1, marginBottom:14 }}>STEP {assignStep} OF 2</div>
                    <div style={{ flex:1, display:'flex', flexDirection:'column', gap:2 }}>
                      {[['Vehicle Information','Fleet & dates'],['Employee Information','Assign & confirm']].map(([name,desc],idx)=>{
                        const sn=idx+1, isAct=assignStep===sn, isDone=assignStep>sn;
                        return (
                          <div key={sn} onClick={()=>isDone&&setAssignStep(sn)} style={{ display:'flex', flexDirection:'column', padding:'8px 0 8px 12px', cursor:isDone?'pointer':'default', borderLeft:isAct?`3px solid ${PRI}`:isDone?'3px solid rgba(26,26,42,0.35)':'3px solid rgba(0,0,0,0.08)', marginBottom:2 }}>
                            <div style={{ display:'flex', alignItems:'center' }}>
                              <span style={{ fontSize:12, fontWeight:isAct?700:500, color:isAct?'#1a1a2a':isDone?'#1a1a2a':'#8888a0' }}>{name}</span>
                              {isDone && <span style={{ marginLeft:6, fontSize:10, color:'#1a1a2a' }}>✓</span>}
                            </div>
                            <span style={{ fontSize:10, color:'#9090a0', marginTop:1 }}>{desc}</span>
                          </div>
                        );
                      })}
                    </div>
                    {assignStep===2 && assignForm.vehicle_id && (
                      <div style={{ padding:'9px 12px', background:'#0079BC', borderRadius:10, marginTop:8 }}>
                        <div style={{ fontSize:9, color:'silver', fontWeight:800, textTransform:'uppercase', letterSpacing:1, marginBottom:3 }}>Selected Vehicle</div>
                        <div style={{ fontSize:14, fontWeight:900, color:'#fff', fontFamily:'monospace', letterSpacing:1 }}>{assignForm.plate_number||'—'}</div>
                        <div style={{ fontSize:10, color:'#a0a0b8', marginTop:2 }}>{assignForm.make} {assignForm.model||''}</div>
                        <div style={{ fontSize:10, color:'#a0a0b8' }}>{assignForm.ownership_type==='RENT'?'🔑 Rental':'🏢 Own'} · {assignForm.color||''}</div>
                      </div>
                    )}
                    {assignStep===2 && (
                      <div style={{ padding:'8px 10px', background:'#e8e8f0', borderRadius:8, marginTop:8 }}>
                        <div style={{ fontSize:9, fontWeight:800, color:PRI, marginBottom:3 }}>🚦 Penalty Rule</div>
                        <div style={{ fontSize:9, color:'#4a4a5a', lineHeight:1.5 }}>Traffic fines charged to assigned employee during this period.</div>
                      </div>
                    )}
                  </div>

                  {/* White card */}
                  <div style={{ position:'absolute', top:22, right:22, bottom:22, left:248, background:'#fff', borderRadius:16, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 6px 24px rgba(26,26,42,0.14)', zIndex:3 }}>

                    {/* Card header */}
                    <div style={{ padding:'18px 22px 0', flexShrink:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                        <div>
                          <div style={{ fontSize:17, fontWeight:700, color:'#172D37' }}>{assignStep===1?'Vehicle Information':'Employee Information'}</div>
                          <div style={{ fontSize:11, color:'#53666F', marginTop:2 }}>{assignStep===1?'Select period & vehicle from fleet':'Select department, employee & confirm'}</div>
                        </div>
                        <button onClick={closeAssign} style={{ background:'#f2f2f6', border:'none', color:'#6a6a80', borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
                      </div>
                      <div style={{ height:1, background:'#e0e0ea' }} />
                    </div>

                    {/* Form body */}
                    <div style={{ flex:1, overflowY:'auto', padding:'16px 22px 10px', fontFamily:PP, display:'flex', flexDirection:'column' }}>

                      {/* PAGE 1 — Vehicle Information */}
                      {assignStep===1 && <>
                        {availableVehicles.length===0 && (
                          <div style={{ background:'#ffebee', border:'1.5px solid #ef9a9a', borderRadius:10, padding:'10px 14px', marginBottom:12, textAlign:'center', flexShrink:0 }}>
                            <div style={{ fontWeight:800, color:'#c62828', fontSize:12, marginBottom:2 }}>🚫 No Vehicles Available</div>
                            <div style={{ fontSize:10, color:'#c62828' }}>All active vehicles are assigned with no return date. Record a return first.</div>
                          </div>
                        )}
                        <div style={{ fontSize:9, fontWeight:800, color:PRI, letterSpacing:1.5, textTransform:'uppercase', marginBottom:8, paddingBottom:4, borderBottom:'1.5px solid #e0e0ea' }}>Assignment Period</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
                          <div>
                            <label style={lblA}>Assignment Date</label>
                            <input type="date" style={inpA()} value={assignForm.assignment_date} onChange={e=>fa('assignment_date',e.target.value)} />
                          </div>
                          <div>
                            <label style={lblA}>Expected Return Date</label>
                            <input type="date" style={inpA()} value={assignForm.return_date} onChange={e=>fa('return_date',e.target.value)} />
                          </div>
                        </div>
                        <div style={{ fontSize:9, fontWeight:800, color:PRI, letterSpacing:1.5, textTransform:'uppercase', marginBottom:8, paddingBottom:4, borderBottom:'1.5px solid #e0e0ea' }}>Select Vehicle from Fleet</div>
                        <div style={{ marginBottom:10 }}>
                          <label style={lblA}>Plate Number * (available only)</label>
                          <select
                            style={inpA({ fontFamily:'monospace', fontWeight:700, fontSize:13, color:PRI })}
                            value={assignForm.vehicle_id}
                            onChange={e=>onAssignVehicleChange(e.target.value)}
                            disabled={availableVehicles.length===0}>
                            <option value="">— Select Plate Number —</option>
                            {availableVehicles.map(v=>(
                              <option key={v.id} value={v.id}>
                                {v.plate_number} · {v.vehicle_type} · {v.make} {v.model} · {v.color}
                                {v.ownership_type==='RENT' ? ' 🔑' : ' 🏢'}
                              </option>
                            ))}
                          </select>
                          {vehicles.length > availableVehicles.length && (
                            <div style={{ fontSize:10, color:'#c62828', marginTop:5, fontWeight:600 }}>
                              ⚠ {vehicles.length - availableVehicles.length} vehicle(s) excluded — currently assigned with no return date
                            </div>
                          )}
                        </div>
                        {assignForm.vehicle_id ? (
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8, marginTop:4 }}>
                            {[
                              ['Type', assignForm.vehicle_type],
                              ['Make', assignForm.make],
                              ['Color', assignForm.color],
                              ['Fleet', assignForm.ownership_type==='RENT'?'🔑 Rental':'🏢 Own'],
                            ].map(([k,v])=>(
                              <div key={k} style={{ background:'#f8f8fc', borderRadius:10, padding:'10px 12px', border:'1px solid #e0e0ea' }}>
                                <div style={{ fontSize:9, color:'#8888a0', fontWeight:800, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:3 }}>{k}</div>
                                <div style={{ fontSize:12, fontWeight:700, color:PRI }}>{v||'—'}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:6, opacity:0.35 }}>
                            <svg width="44" height="44" viewBox="0 0 40 40" fill="none"><rect x="4" y="16" width="32" height="18" rx="5" stroke="#1A1A2A" strokeWidth="2"/><path d="M8 16 C9 8 14 5 20 5 C26 5 31 8 32 16" stroke="#1A1A2A" strokeWidth="2"/><circle cx="11" cy="34" r="4" fill="#1A1A2A"/><circle cx="29" cy="34" r="4" fill="#1A1A2A"/></svg>
                            <div style={{ fontSize:11, color:'#1a1a2a', fontWeight:600 }}>Select a plate number above</div>
                          </div>
                        )}
                      </>}

                      {/* PAGE 2 — Employee Information */}
                      {assignStep===2 && <>
                        <div style={{ fontSize:9, fontWeight:800, color:PRI, letterSpacing:1.5, textTransform:'uppercase', marginBottom:10, paddingBottom:4, borderBottom:'1.5px solid #e0e0ea' }}>Department · Employee · ID</div>
                        {/* One-row layout: Dept + Employee + Iqama# */}
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1.4fr 1fr', gap:12, marginBottom:14 }}>
                          <div>
                            <label style={lblA}>Department</label>
                            <select style={inpA()} value={assignForm.department_id} onChange={e=>onAssignDeptChange(e.target.value)}>
                              <option value="">— Select —</option>
                              {depts.map(d=><option key={d.id} value={d.id}>{d.dept_code?`[${d.dept_code}] `:''}{d.dept_name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={lblA}>Employee Name *</label>
                            <select style={inpA()} value={assignForm.employee_id} onChange={e=>onAssignEmployeeChange(e.target.value)} disabled={!assignForm.department_id}>
                              <option value="">{assignForm.department_id?'— Select Employee —':'Select dept first'}</option>
                              {deptEmployees.map(e=><option key={e.id} value={e.id}>{e.full_name_en}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={lblA}>Iqama # / License # {assignForm.iqama_dl && <span style={{ fontSize:9, background:PRI, color:'#fff', borderRadius:4, padding:'1px 6px', marginLeft:4 }}>AUTO</span>}</label>
                            <input style={inpA({ fontFamily:'monospace', fontWeight:700, fontSize:13, letterSpacing:1, color:PRI, background:assignForm.iqama_dl?'#f4f4fa':'#f2f2f6' })}
                              value={assignForm.iqama_dl} readOnly placeholder="Auto-populated" />
                          </div>
                        </div>
                        <div style={{ fontSize:9, fontWeight:800, color:PRI, letterSpacing:1.5, textTransform:'uppercase', marginBottom:8, paddingBottom:4, borderBottom:'1.5px solid #e0e0ea' }}>Traffic Penalty Rule</div>
                        <div style={{ background:'#f8f8fc', border:'1.5px solid #e0e0ea', borderRadius:12, padding:'14px 16px' }}>
                          <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:12, alignItems:'start' }}>
                            <div style={{ width:36, height:36, borderRadius:10, background:PRI, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>🚦</div>
                            <div>
                              <div style={{ fontSize:12, fontWeight:800, color:PRI, marginBottom:4 }}>Liability assigned to employee</div>
                              <div style={{ fontSize:11, color:'#6a6a80', lineHeight:1.6 }}>
                                Any traffic fine for plate <strong style={{ color:PRI, fontFamily:'monospace' }}>{assignForm.plate_number||'—'}</strong> during <strong>{assignForm.assignment_date||'—'}</strong> → <strong>{assignForm.return_date||'open-ended'}</strong> is charged to the assigned employee, whether company-owned or rented.
                              </div>
                            </div>
                          </div>
                        </div>
                      </>}

                    </div>

                    {/* Footer */}
                    <div style={{ flexShrink:0, padding:'11px 22px 14px', borderTop:'1px solid #e0e0ea', display:'flex', justifyContent:'space-between', alignItems:'center', fontFamily:PP }}>
                      <button onClick={assignStep===1?closeAssign:()=>setAssignStep(1)} style={{ background:'#747474', color:'#fff', border:'none', borderRadius:24, padding:'9px 24px', cursor:'pointer', fontSize:13, fontWeight:600 }}>{assignStep===1?'Cancel':'Back'}</button>
                      <span style={{ fontSize:10, color:'#9090a0' }}>{assignStep===1?'Select vehicle to proceed':'Complete all fields to register'}</span>
                      {assignStep===1
                        ? <button onClick={()=>setAssignStep(2)} disabled={!assignForm.vehicle_id} style={{ background:assignForm.vehicle_id?PRI:'#c8c8d8', color:'#fff', border:'none', borderRadius:24, padding:'9px 28px', cursor:assignForm.vehicle_id?'pointer':'not-allowed', fontSize:13, fontWeight:700, boxShadow:assignForm.vehicle_id?'0 4px 14px rgba(26,26,42,0.28)':'none' }}>Next → Employee</button>
                        : <button onClick={saveAssignment} disabled={savingAssign||availableVehicles.length===0}
                            style={{ background:availableVehicles.length===0?'#ccc':PRI, color:'#fff', border:'none', borderRadius:24, padding:'9px 28px', cursor:availableVehicles.length===0?'not-allowed':'pointer', fontSize:13, fontWeight:700, boxShadow:availableVehicles.length===0?'none':'0 4px 14px rgba(26,26,42,0.30)' }}>
                            {savingAssign?'Saving…':'🔑 Register Assignment'}
                          </button>
                      }
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        )
      })()}


      {/* ── VEHICLE DETAIL MODAL ─────────────────────────────────────── */}
      {detailVeh && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setDetailVeh(null)}>
          <div style={{ ...S.modal, width:760 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
              <div>
                <div style={{ fontSize:20, fontWeight:800, color:'#1a2e3d' }}>{detailVeh.plate_number}</div>
                <div style={{ fontSize:13, color:'#6b7c93', marginTop:2 }}>{detailVeh.vehicle_type} · {detailVeh.make} {detailVeh.model} {detailVeh.year}</div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>{ openEditVeh(detailVeh); setDetailVeh(null) }} style={S.btn('#0079BC')}>Edit</button>
                <button onClick={()=>openMaintForm(detailVeh.id)} style={S.btn('#2e7d32')}>+ Service</button>
                <button onClick={()=>setDetailVeh(null)} style={S.btn('#aab2bd')}>Close</button>
              </div>
            </div>

            <div style={{ display:'flex', gap:4, marginBottom:16, borderBottom:'2px solid #e8edf2' }}>
              {[['info','ℹ️ Info'],['docs','📄 Documents'],['maintenance','🔧 Maintenance']].map(([k,l])=>(
                <button key={k} style={S.tab(detailTab===k)} onClick={()=>setDetailTab(k)}>{l}</button>
              ))}
            </div>

            {detailTab==='info' && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {[
                  ['Plate Number',   detailVeh.plate_number],
                  ['Vehicle Type',   detailVeh.vehicle_type],
                  ['Make',           detailVeh.make||'—'],
                  ['Model',          detailVeh.model||'—'],
                  ['Year',           detailVeh.year||'—'],
                  ['Color',          detailVeh.color||'—'],
                  ['Fuel Type',      detailVeh.fuel_type||'—'],
                  ['Chassis No.',    detailVeh.chassis_no||'—'],
                  ['Engine No.',     detailVeh.engine_no||'—'],
                  ['Driver',         detailVeh.driver_name||'Unassigned'],
                  ['Driver ID No.',  detailVeh.driver_id_no||'—'],
                  ['Department',     detailVeh.assigned_department||'—'],
                  ['Odometer (km)',  (detailVeh.odometer_reading||0).toLocaleString()],
                  ['Status',         detailVeh.status],
                ].map(([k,v])=>(
                  <div key={k} style={{ background:'#f5f7fa', borderRadius:8, padding:'10px 14px' }}>
                    <div style={{ fontSize:10, color:'#6b7c93', fontWeight:700 }}>{k}</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#1a2e3d', marginTop:2 }}>{v}</div>
                  </div>
                ))}
                {detailVeh.notes && <div style={{ gridColumn:'1/-1', background:'#fffde7', borderRadius:8, padding:'10px 14px' }}>
                  <div style={{ fontSize:10, color:'#6b7c93', fontWeight:700, marginBottom:4 }}>NOTES</div>
                  <div style={{ fontSize:12, color:'#546e7a' }}>{detailVeh.notes}</div>
                </div>}
              </div>
            )}

            {detailTab==='docs' && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {[
                  ['INSURANCE',    detailVeh.ins_expiry,   '🛡 Insurance'],
                  ['MVPI',         detailVeh.mvpi_expiry,  '🔧 MVPI Test'],
                  ['REGISTRATION', detailVeh.reg_expiry,   '📋 Registration'],
                  ['SAHER',        detailVeh.saher_expiry, '📡 Saher System'],
                ].map(([type,expiry,label])=>{
                  const u = urgency(expiry)
                  return (
                    <div key={type} style={{ border:`2px solid ${u.bg}`, borderRadius:12, padding:'16px 18px', background:u.bg }}>
                      <div style={{ fontSize:16, marginBottom:6 }}>{label}</div>
                      <div style={{ fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:2 }}>EXPIRY DATE</div>
                      <div style={{ fontSize:18, fontWeight:800, color:u.color }}>{fmt(expiry)}</div>
                      <div style={{ fontSize:11, fontWeight:700, color:u.color, marginTop:4 }}>
                        {u.label !== '—' ? `${daysLeft(expiry) >= 0 ? daysLeft(expiry)+' days remaining' : Math.abs(daysLeft(expiry))+' days overdue'}` : 'No expiry recorded'}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {detailTab==='maintenance' && (
              <div>
                <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
                  <button onClick={()=>openMaintForm(detailVeh.id)} style={S.btn('#2e7d32')}>+ Log Service</button>
                </div>
                {maints.length===0
                  ? <div style={{ textAlign:'center', padding:30, color:'#aab2bd' }}>No maintenance records yet</div>
                  : <table style={S.tbl}>
                    <thead><tr>
                      <th style={S.th}>Date</th>
                      <th style={S.th}>Type</th>
                      <th style={S.th}>Description</th>
                      <th style={S.th}>Cost (SAR)</th>
                      <th style={S.th}>Odometer</th>
                      <th style={S.th}>Workshop</th>
                      <th style={S.th}>Next Service</th>
                    </tr></thead>
                    <tbody>
                      {maints.map((m,i)=>(
                        <tr key={m.id} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
                          <td style={S.td}>{fmt(m.service_date)}</td>
                          <td style={{ ...S.td, fontWeight:700 }}>{(m.maintenance_type||'').replace(/_/g,' ')}</td>
                          <td style={{ ...S.td, fontSize:11, color:'#546e7a', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.description||'—'}</td>
                          <td style={{ ...S.td, fontWeight:700, color:'#0079BC' }}>SAR {(+m.cost||0).toLocaleString()}</td>
                          <td style={S.td}>{m.odometer_at_service ? (+m.odometer_at_service).toLocaleString()+' km' : '—'}</td>
                          <td style={{ ...S.td, fontSize:11 }}>{m.workshop_name||'—'}</td>
                          <td style={{ ...S.td, color: m.next_service_date&&m.next_service_date<=IN30?'#c62828':'#1a2e3d', fontWeight: m.next_service_date&&m.next_service_date<=IN30?700:400 }}>{fmt(m.next_service_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                }
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── VEHICLE FORM MODAL ───────────────────────────────────────── */}
      {showVehForm && (() => {
        const PP = "'Poppins','Inter',sans-serif"
        const PRI = '#70A5A6'
        const STEP_NAMES = ['','Vehicle Details','Documents','Attachments','Notes & Review']
        const STEP_DESC  = ['','Type, plate, make, model & specs','Insurance / MVPI / Estemara expiry','Supporting files (optional)','Final notes & summary']
        const inp2 = (ex={}) => ({ width:'100%', padding:'9px 14px', borderRadius:20, border:'1px solid #b0cfe8', fontSize:13, color:'#172D37', background:'#f8f8fc', outline:'none', fontFamily:PP, boxSizing:'border-box', ...ex })
        const sec2 = { fontSize:9, fontWeight:800, color:'#0079BC', letterSpacing:1.5, textTransform:'uppercase', marginBottom:8, marginTop:12, paddingBottom:4, borderBottom:'1.5px solid #b0cfe8' }
        const lbl2 = { display:'block', fontSize:11, fontWeight:600, color:'#53666F', marginBottom:4 }
        return (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setShowVehForm(false)}>
          <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap');`}</style>
          <div style={{ background:'#70A5A6', borderRadius:18, padding:8, width:960, maxWidth:'calc(100vw - 24px)', boxShadow:'0 28px 64px rgba(0,0,0,0.32)', fontFamily:PP }}>


            <div style={{ background:'#EAF3F2', borderRadius:12, display:'flex', position:'relative', overflow:'hidden', minHeight:520 }}>
                  <div style={{ position:'absolute', top:0, right:0, width:220, height:185, background:'#0079BC', borderRadius:'0 12px 0 90px', zIndex:1 }} />

                  {/* Sidebar */}
                  <div style={{ width:260, flexShrink:0, padding:'20px 20px 16px', display:'flex', flexDirection:'column', fontFamily:PP, position:'relative', zIndex:2 }}>
                    <div style={{ fontSize:9, fontWeight:800, color:'#53666F', letterSpacing:1.5, textTransform:'uppercase', marginBottom:4 }}>Ratal Advanced Technologies</div>
                    <div style={{ fontSize:9, fontWeight:800, color:'#0079BC', letterSpacing:1.5, textTransform:'uppercase', marginBottom:4 }}>Operations</div>
                    <div style={{ fontSize:20, fontWeight:900, color:'#172D37', lineHeight:1.2, marginBottom:6 }}>{STEP_NAMES[vehStep]}</div>
                    <div style={{ fontSize:11, color:'#53666F', lineHeight:1.5, marginBottom:8 }}>{STEP_DESC[vehStep]}</div>
                    <div style={{ fontSize:9, fontWeight:800, color:'#0079BC', letterSpacing:1, marginBottom:14 }}>STEP {vehStep} OF 4</div>
                    <div style={{ flex:1, display:'flex', flexDirection:'column', gap:1 }}>
                      {['Vehicle Details','Documents','Attachments','Notes & Review'].map((name,idx)=>{
                        const sn=idx+1, isAct=vehStep===sn, isDone=vehStep>sn
                        return (
                          <div key={sn} onClick={()=>isDone&&setVehStep(sn)} style={{ display:'flex', alignItems:'center', padding:'8px 0 8px 12px', cursor:isDone?'pointer':'default', borderLeft:isAct?'3px solid #0079BC':isDone?'rgba(0,121,188,0.35)':undefined }}>
                            <span style={{ fontSize:12, fontWeight:isAct?700:500, color:isAct?'#172D37':isDone?'#0079BC':'#53666F' }}>{name}</span>
                            {isDone && <span style={{ marginLeft:6, fontSize:10, color:'#0079BC' }}>✓</span>}
                          </div>
                        )
                      })}
                    </div>
                    {editVeh && <div style={{ background:'#EAF3F2', borderRadius:8, padding:'8px 10px', marginTop:10, fontSize:10, color:'#0079BC', fontWeight:700 }}>✏️ Editing: {editVeh.plate_number}</div>}
                  </div>

                  {/* White card (L4) */}
                  <div style={{ flex:1, background:'#fff', borderRadius:10, margin:'56px 10px 10px 0', display:'flex', flexDirection:'column', overflow:'hidden', zIndex:3 }}>

                    {/* Card header */}
                    <div style={{ padding:'18px 22px 0', flexShrink:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                        <div>
                          <div style={{ fontSize:17, fontWeight:700, color:'#172D37' }}>{['','Vehicle Details','Document Expiry','Attachments','Notes & Review'][vehStep]}</div>
                          {vehForm.plate_number && <div style={{ fontSize:11, color:'#0079BC', fontWeight:700, marginTop:2 }}>{vehForm.plate_number} · {vehForm.ownership_type==='RENT'?'Rental':'Own Fleet'}</div>}
                        </div>
                        <button onClick={()=>setShowVehForm(false)} style={{ background:'#f0f4f8', border:'none', color:'#53666F', borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
                      </div>
                      <div style={{ height:1, background:'#b0cfe8' }} />
                    </div>

                    {/* Scrollable form */}
                    <div style={{ flex:1, overflowY:'auto', padding:'14px 22px 10px', fontFamily:PP }}>

                      {/* Step 1: Vehicle Details */}
                      {vehStep===1 && <>
                {vehForm.ownership_type==='RENT' && (
                  <div style={{ background:'#EAF3F2', border:'1.5px solid #0079BC', borderRadius:12, padding:'16px 18px', marginBottom:18 }}>
                    <div style={{ fontWeight:800, fontSize:12, color:PRI, textTransform:'uppercase', letterSpacing:0.8, marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                      🔑 Rental Details
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                      <div>
                        <label style={{ ...S.label, color:'#0079BC' }}>Rental Company Name *</label>
                        <input style={{ ...S.inp, background:'#fff' }} value={vehForm.rental_company} onChange={e=>fv('rental_company',e.target.value)} placeholder="Company name from Party List" />
                      </div>
                      <div>
                        <label style={{ ...S.label, color:'#0079BC' }}>Rental Company VAT No.</label>
                        <input style={{ ...S.inp, background:'#fff' }} value={vehForm.rental_vat_no} onChange={e=>fv('rental_vat_no',e.target.value)} placeholder="300XXXXXXXXXX" />
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                      <div>
                        <label style={{ ...S.label, color:'#0079BC' }}>Date of Rent</label>
                        <input type="date" style={{ ...S.inp, background:'#fff' }} value={vehForm.rent_start} onChange={e=>fv('rent_start',e.target.value)} />
                      </div>
                      <div>
                        <label style={{ ...S.label, color:'#0079BC' }}>Date of Return</label>
                        <input type="date" style={{ ...S.inp, background:'#fff' }} value={vehForm.rent_end} onChange={e=>fv('rent_end',e.target.value)} />
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12 }}>
                      {[
                        ['rate_daily',   'Rate / Day (SAR)',   '0.00'],
                        ['rate_monthly', 'Rate / Month (SAR)', '0.00'],
                        ['km_per_day',   'Allowed KM / Day',   '0'],
                        ['km_per_month', 'Allowed KM / Month', '0'],
                      ].map(([k,l,ph])=>(
                        <div key={k}>
                          <label style={{ ...S.label, color:'#0079BC' }}>{l}</label>
                          <input type="number" min="0" step="0.01" style={{ ...S.inp, background:'#fff', fontWeight:700, color:PRI }}
                            value={vehForm[k]} onChange={e=>fv(k,e.target.value)} placeholder={ph} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <SectionLabel color={PRI} icon="🚗" label="Vehicle Details" />
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>
                  <div><label style={lbl2}>Vehicle Type</label><select style={inp2()} value={vehForm.vehicle_type} onChange={e=>fv('vehicle_type',e.target.value)}>{VEHICLE_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
                  <div><label style={lbl2}>Plate Number *</label><input style={inp2({ fontFamily:'monospace', fontWeight:800, fontSize:14, letterSpacing:1 })} value={vehForm.plate_number} onChange={e=>fv('plate_number',e.target.value)} placeholder="1234 ABC" /></div>
                  <div><label style={lbl2}>Status</label><select style={inp2()} value={vehForm.status} onChange={e=>fv('status',e.target.value)}><option>ACTIVE</option><option>INACTIVE</option><option>SCRAPPED</option></select></div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>
                  <div><label style={lbl2}>Make</label><input style={inp2()} value={vehForm.make} onChange={e=>fv('make',e.target.value)} placeholder="Toyota" /></div>
                  <div><label style={lbl2}>Model</label><input style={inp2()} value={vehForm.model} onChange={e=>fv('model',e.target.value)} placeholder="Land Cruiser" /></div>
                  <div><label style={lbl2}>Year</label><input type="number" style={inp2()} value={vehForm.year} onChange={e=>fv('year',e.target.value)} /></div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>
                  <div><label style={lbl2}>Color</label><input style={inp2()} value={vehForm.color} onChange={e=>fv('color',e.target.value)} placeholder="White" /></div>
                  <div><label style={lbl2}>Fuel Type</label><select style={inp2()} value={vehForm.fuel_type} onChange={e=>fv('fuel_type',e.target.value)}>{FUEL_TYPES.map(f=><option key={f}>{f}</option>)}</select></div>
                  <div><label style={lbl2}>Odometer (km)</label><input type="number" style={inp2()} value={vehForm.odometer_reading} onChange={e=>fv('odometer_reading',e.target.value)} /></div>
                </div>
                {vehForm.ownership_type==='OWN' && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                    <div><label style={lbl2}>Chassis No.</label><input style={inp2({ fontFamily:'monospace' })} value={vehForm.chassis_no} onChange={e=>fv('chassis_no',e.target.value)} /></div>
                    <div><label style={lbl2}>Engine No.</label><input style={inp2({ fontFamily:'monospace' })} value={vehForm.engine_no} onChange={e=>fv('engine_no',e.target.value)} /></div>
                  </div>
                )}
                      </>}

                      {/* Step 2: Document Expiry — 3 rows (Insurance / MVPI / Estemara) */}
                      {vehStep===2 && <>
                        <div style={sec2}>Compliance Document Expiry Dates</div>
                        <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:14 }}>
                          {[
                            ['ins_expiry',  '🛡️ Insurance',      'Motor insurance policy expiry date'],
                            ['mvpi_expiry', '🔧 MVPI',            'Ministry of Transport inspection expiry'],
                            ['reg_expiry',  '📋 Estemara',        'Vehicle registration (Estemara) expiry'],
                          ].map(([k,label,hint])=>{
                            const u = vehForm[k] ? urgency(vehForm[k]) : null
                            return (
                              <div key={k} style={{ background:'#f8fafc', border:'1.5px solid #b0cfe8', borderRadius:10, padding:'12px 16px', display:'grid', gridTemplateColumns:'180px 1fr auto', gap:14, alignItems:'center' }}>
                                <div>
                                  <div style={{ fontSize:12, fontWeight:800, color:'#172D37', marginBottom:2 }}>{label}</div>
                                  <div style={{ fontSize:10, color:'#53666F' }}>{hint}</div>
                                </div>
                                <input type="date" style={{ ...inp2(), maxWidth:200 }} value={vehForm[k]} onChange={e=>fv(k,e.target.value)} />
                                {u ? (
                                  <div style={{ fontSize:11, fontWeight:800, color:u.color, background:u.bg, borderRadius:6, padding:'4px 12px', whiteSpace:'nowrap' }}>{u.label}</div>
                                ) : (
                                  <div style={{ fontSize:11, color:'#aab2bd' }}>Not set</div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                        <div style={{ padding:'10px 14px', background:'#EAF3F2', borderRadius:8, border:'1px solid #0079BC44', fontSize:11, color:'#0079BC', fontWeight:600 }}>
                          ⚡ These dates are auto-synced to the Compliance module for alerts.
                        </div>
                      </>}

                      {/* Step 3: Attachments */}
                      {vehStep===3 && <>
                        <div style={sec2}>Supporting Documents (Optional)</div>
                        <div style={{ marginBottom:14, fontSize:12, color:'#53666F', lineHeight:1.7 }}>
                          Attach vehicle photos, insurance certificates, MVPI reports, or registration documents. All files go to Google Drive.
                        </div>
                        {vehAttachments.length > 0 && (
                          <div style={{ marginBottom:12 }}>
                            {vehAttachments.map((file, i)=>(
                              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'#f8fafc', borderRadius:8, marginBottom:6, border:'1px solid #e0e8f0' }}>
                                <span style={{ fontSize:16 }}>📎</span>
                                <span style={{ flex:1, fontSize:12, color:'#172D37', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{file.name}</span>
                                <span style={{ fontSize:11, color:'#53666F' }}>{(file.size/1024).toFixed(0)} KB</span>
                                <button onClick={()=>setVehAttachments(a=>a.filter((_,j)=>j!==i))} style={{ background:'#fee2e2', border:'none', borderRadius:5, color:'#c62828', padding:'2px 8px', cursor:'pointer', fontSize:11, fontWeight:700 }}>✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                        <input ref={vehFileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                          style={{ display:'none' }}
                          onChange={e=>setVehAttachments(a=>[...a,...Array.from(e.target.files)])} />
                        <button onClick={()=>vehFileRef.current?.click()}
                          style={{ width:'100%', padding:'16px', border:'2px dashed #b0cfe8', borderRadius:10, background:'#f0f7ff', color:'#0079BC', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:14 }}>
                          <span style={{ fontSize:18 }}>+</span> Add Attachment
                        </button>
                        <div style={{ padding:'10px 14px', background:'#fffde7', borderRadius:8, border:'1px solid #ffe082', fontSize:11, color:'#7a6000' }}>
                          ℹ Files upload to Google Drive on save. Supported: PDF, JPG, PNG, DOC (max 25 MB each).
                        </div>
                      </>}

                      {/* Step 4: Notes & Review */}
                      {vehStep===4 && <>
                        <div style={sec2}>Notes / Remarks</div>
                        <div style={{ marginBottom:16 }}>
                          <textarea style={{ ...inp2(), minHeight:80, resize:'vertical' }} value={vehForm.notes} onChange={e=>fv('notes',e.target.value)} placeholder="Any additional notes about this vehicle…" />
                        </div>
                        <div style={sec2}>Review Summary</div>
                        <div style={{ background:'#f8f3fc', border:'1px solid #d0b8e0', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:12, color:'#1a0a2d' }}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                            {[
                              ['Plate', vehForm.plate_number || '—'],
                              ['Type', vehForm.vehicle_type || '—'],
                              ['Make / Model', `${vehForm.make||'—'} ${vehForm.model||''}`.trim()],
                              ['Year / Color', `${vehForm.year||'—'} · ${vehForm.color||'—'}`],
                              ['Ownership', vehForm.ownership_type],
                              ['Status', vehForm.status],
                            ].map(([k,v])=>(
                              <div key={k} style={{ display:'flex', gap:6 }}>
                                <span style={{ color:'#5a3a70', fontWeight:600 }}>{k}:</span>
                                <span style={{ fontWeight:700 }}>{v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>}

                    </div>

                  </div>
                </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px 4px', fontFamily:PP }}>
            <button onClick={vehStep===1?()=>setShowVehForm(false):()=>setVehStep(s=>s-1)} style={{ background:'#747474', color:'#fff', border:'none', borderRadius:24, padding:'9px 24px', cursor:'pointer', fontSize:13, fontWeight:600 }}>{vehStep===1?'Cancel':'Back'}</button>
            <span style={{ fontSize:10, color:'#53666F' }}>Step {vehStep} of 4 — {STEP_DESC[vehStep]}</span>
            {vehStep<4
              ? <button onClick={()=>setVehStep(s=>s+1)} style={{ background:PRI, color:'#fff', border:'none', borderRadius:24, padding:'9px 28px', cursor:'pointer', fontSize:13, fontWeight:700, boxShadow:'0 4px 14px rgba(0,121,188,0.28)' }}>Save &amp; Next</button>
              : <button onClick={saveVehicle} disabled={savingVeh} style={{ background:savingVeh?'#ccc':PRI, color:'#fff', border:'none', borderRadius:24, padding:'9px 28px', cursor:savingVeh?'not-allowed':'pointer', fontSize:13, fontWeight:700 }}>{savingVeh?'Saving…':editVeh?'✓ Update Vehicle':'✓ Save Vehicle'}</button>
            }
          </div>
          </div>
        </div>
        )
      })()}

      {/* ── MAINTENANCE FORM MODAL ───────────────────────────────────── */}
      {showMaintForm && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setShowMaintForm(false)}>
          <div style={{ ...S.modal, width:580 }}>
            <div style={{ fontWeight:800, fontSize:17, color:'#1a2e3d', marginBottom:20 }}>🔧 Log Maintenance / Service</div>

            <div style={{ ...S.row, marginBottom:14 }}>
              <div style={S.col}><label style={S.label}>Vehicle *</label>
                <select style={S.inp} value={maintForm.vehicle_id} onChange={e=>fm('vehicle_id',e.target.value)}>
                  <option value="">— Select Vehicle —</option>
                  {vehicles.filter(v=>v.status==='ACTIVE').map(v=>(
                    <option key={v.id} value={v.id}>{v.plate_number} — {v.make} {v.model}</option>
                  ))}
                </select></div>
              <div style={S.col}><label style={S.label}>Service Type</label>
                <select style={S.inp} value={maintForm.maintenance_type} onChange={e=>fm('maintenance_type',e.target.value)}>
                  {MAINT_TYPES.map(t=><option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
                </select></div>
            </div>

            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Service Date</label>
                <input type="date" style={S.inp} value={maintForm.service_date} onChange={e=>fm('service_date',e.target.value)} /></div>
              <div style={S.col}><label style={S.label}>Odometer at Service (km)</label>
                <input type="number" style={S.inp} value={maintForm.odometer_at_service} onChange={e=>fm('odometer_at_service',e.target.value)} /></div>
              <div style={S.col}><label style={S.label}>Cost (SAR)</label>
                <input type="number" style={S.inp} value={maintForm.cost} onChange={e=>fm('cost',e.target.value)} /></div>
            </div>

            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Workshop Name</label>
                <input style={S.inp} value={maintForm.workshop_name} onChange={e=>fm('workshop_name',e.target.value)} placeholder="e.g. Al Faris Auto Centre" /></div>
              <div style={S.col}><label style={S.label}>Invoice / Ref #</label>
                <input style={S.inp} value={maintForm.invoice_ref} onChange={e=>fm('invoice_ref',e.target.value)} /></div>
            </div>

            <div style={{ marginBottom:14 }}><label style={S.label}>Description / Notes</label>
              <textarea style={{ ...S.inp, height:80, resize:'vertical' }} value={maintForm.description} onChange={e=>fm('description',e.target.value)} /></div>

            <div style={{ marginBottom:16 }}><label style={S.label}>Next Service Date (optional)</label>
              <input type="date" style={S.inp} value={maintForm.next_service_date} onChange={e=>fm('next_service_date',e.target.value)} /></div>

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button style={S.btn('#aab2bd')} onClick={()=>setShowMaintForm(false)}>Cancel</button>
              <button style={S.btn('#2e7d32')} onClick={saveMaint} disabled={savingMaint}>{savingMaint?'Saving…':'Save Service Record'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Sub-component: all maintenance across all vehicles (for the maintenance tab)
function AllMaintenance({ entityId, vehicles }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('vehicle_maintenance')
        .select('*').eq('entity_id',entityId).order('service_date',{ascending:false}).limit(200)
      setRecords(data||[])
      setLoading(false)
    }
    if (entityId) load()
  }, [entityId])

  const total = records.reduce((s,r)=>s+(+r.cost||0),0)
  const vehMap = Object.fromEntries(vehicles.map(v=>[v.id,v.plate_number]))

  if (loading) return <div style={{ textAlign:'center', padding:30, color:'#6b7c93' }}>Loading…</div>
  if (!records.length) return <div style={{ textAlign:'center', padding:30, color:'#aab2bd' }}>No maintenance records yet</div>

  return (
    <>
      <div style={{ marginBottom:12, fontSize:13, color:'#1a2e3d', fontWeight:700 }}>
        {records.length} records · Total spent: <span style={{ color:'#0079BC' }}>SAR {total.toLocaleString()}</span>
      </div>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead><tr>
          {['Date','Vehicle','Type','Description','SAR','Odometer','Workshop','Next Due'].map(h=>(
            <th key={h} style={{ background:'#0079BC', color:'#fff', padding:'9px 12px', fontWeight:700, textAlign:'left', fontSize:11, fontFamily:"'Poppins',sans-serif" }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {records.map((r,i)=>(
            <tr key={r.id} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
              <td style={{ padding:'9px 12px', borderBottom:'1px solid #f0f4f8' }}>{fmt(r.service_date)}</td>
              <td style={{ padding:'9px 12px', borderBottom:'1px solid #f0f4f8', fontWeight:700, fontFamily:'monospace' }}>{vehMap[r.vehicle_id]||'—'}</td>
              <td style={{ padding:'9px 12px', borderBottom:'1px solid #f0f4f8', fontSize:11 }}>{(r.maintenance_type||'').replace(/_/g,' ')}</td>
              <td style={{ padding:'9px 12px', borderBottom:'1px solid #f0f4f8', fontSize:11, color:'#546e7a', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.description||'—'}</td>
              <td style={{ padding:'9px 12px', borderBottom:'1px solid #f0f4f8', fontWeight:700, color:'#0079BC' }}>{(+r.cost||0).toLocaleString()}</td>
              <td style={{ padding:'9px 12px', borderBottom:'1px solid #f0f4f8', fontSize:11 }}>{r.odometer_at_service?(+r.odometer_at_service).toLocaleString()+' km':'—'}</td>
              <td style={{ padding:'9px 12px', borderBottom:'1px solid #f0f4f8', fontSize:11 }}>{r.workshop_name||'—'}</td>
              <td style={{ padding:'9px 12px', borderBottom:'1px solid #f0f4f8', fontSize:11, color: r.next_service_date&&r.next_service_date<=''+new Date(Date.now()+30*864e5).toISOString().slice(0,10)?'#c62828':'#1a2e3d', fontWeight: r.next_service_date&&r.next_service_date<=''+new Date(Date.now()+30*864e5).toISOString().slice(0,10)?700:400 }}>{fmt(r.next_service_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
