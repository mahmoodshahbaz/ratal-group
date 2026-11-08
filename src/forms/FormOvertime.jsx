/**
 * OVERTIME REQUEST FORM  — /forms/overtime
 * Mobile-first 4-step wizard (+ success screen)
 *
 * Design: MP palette — cream steps 1–3, dark/lime review + success
 * OT Multipliers:  NORMAL / FRIDAY / HOLIDAY → 1.5×   TRAVEL → 1.0×
 * Formula: basic_salary ÷ 30 ÷ 8 × hours × multiplier
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useFieldAuth } from '../lib/useFieldAuth'
import OTPActivationScreen from '../components/OTPActivationScreen'

// ── Palette ───────────────────────────────────────────────────────────────────
const L = {   // Light (steps 1-3)
  bg:          '#F0EEE3',
  card:        '#FFFFFF',
  border:      '#E4E0D3',
  text:        '#23242D',
  muted:       '#71717B',
  sub:         '#9BA0A9',
  yellow:      '#F7D263',
  yellowLight: '#FDF8E8',
  greenCard:   '#1B5142',
  greenText:   '#FFFFFF',
  inputBg:     '#FAFAF8',
  error:       '#C0392B',
  errorBg:     '#FFF0EE',
  errorBorder: '#F5B8B0',
}
const D = {   // Dark (step 4 review + success)
  bg:          '#20221F',
  card:        '#2D302A',
  border:      '#3A3D35',
  text:        '#F7F8F0',
  muted:       '#A7AAA0',
  sub:         '#C8CEC0',
  lime:        '#B8F568',
  greenCard:   '#A2DB5A',
  onAccent:    '#20221F',
  error:       '#FF6B6B',
  errorBg:     '#2E1A1A',
  errorBorder: '#7A2F2F',
  pastelBlue:  '#CADDFD',
}

const FONT = "'Poppins', system-ui, -apple-system, sans-serif"

// ── OT type definitions ──────────────────────────────────────────────────────
const OT_TYPES = [
  { value:'NORMAL',  label:'Normal OT',      labelAr:'إضافي عادي',   mult:1.5, tag:'×1.5' },
  { value:'FRIDAY',  label:'Friday',         labelAr:'يوم الجمعة',   mult:1.5, tag:'×1.5' },
  { value:'HOLIDAY', label:'Public holiday', labelAr:'عطلة رسمية',   mult:1.5, tag:'×1.5' },
  { value:'TRAVEL',  label:'Travel day',     labelAr:'يوم سفر',      mult:1.0, tag:'×1.0' },
]

const HOURS   = Array.from({length:24}, (_,i) => String(i).padStart(2,'0'))
const MINUTES = ['00','15','30','45']

const devMode     = new URLSearchParams(window.location.search).get('dev') === '1' ||
                    localStorage.getItem('accsys_dev_mode') === '1'
const previewMode = new URLSearchParams(window.location.search).get('preview') === '1'

const PREVIEW = {
  empId:'preview-emp-1', empName:'Ahmed Mohammed Al-Rashidi', empNum:'EMP-0042',
  dept:'Network Integration Services Unit', empDeptCode:'NISU',
  contact:'+966 55 123 4567', empBasic:4500,
  projects:[
    { id:'p1', project_number:'P-NISU-2026', project_name:'Nokia Tower Commissioning', dept:{ dept_name:'Network Integration Services Unit' } },
  ],
  projectId:'p1', projNum:'P-NISU-2026', projName:'Nokia Tower Commissioning',
  otDate:'2026-10-08', jobNo:'JOB-2026-112',
  otType:'NORMAL', fromTime:'18:00', toTime:'21:30',
  remarks:'Tower section B antenna alignment and signal testing',
  reqNumber:'OT-2026-0187',
}

// ── Time picker ───────────────────────────────────────────────────────────────
function TimePicker({ value, onChange, label, dark = false }) {
  const [h, m] = value ? value.split(':') : ['', '']
  const bg = dark ? D.card : L.card
  const textColor = dark ? D.text : L.text
  const mutedColor = dark ? D.muted : L.muted
  const borderColor = dark ? D.border : L.border
  const selStyle = {
    background: 'transparent', border: 'none', outline: 'none',
    fontSize: 28, fontWeight: 700, color: dark ? D.lime : L.greenCard,
    textAlign: 'center', cursor: 'pointer', fontFamily: FONT,
    width: '100%', padding: '4px 0',
    WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none',
  }
  function setH(v) { onChange(v ? `${v}:${m || '00'}` : '') }
  function setM(v) { onChange(h ? `${h}:${v || '00'}` : '') }
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color: mutedColor, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6, fontFamily: FONT }}>
        {label}
      </div>
      <div style={{ background: bg, border: `1.5px solid ${borderColor}`, borderRadius: 14, padding: '12px 8px 10px', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <select value={h} onChange={e => setH(e.target.value)} style={{ ...selStyle, width: '44%' }}>
            <option value="">--</option>
            {HOURS.map(hh => <option key={hh} value={hh}>{hh}</option>)}
          </select>
          <span style={{ fontSize: 28, fontWeight: 800, color: dark ? D.lime : L.greenCard, lineHeight: 1, flexShrink: 0 }}>:</span>
          <select value={m} onChange={e => setM(e.target.value)} style={{ ...selStyle, width: '44%' }}>
            <option value="">--</option>
            {MINUTES.map(mm => <option key={mm} value={mm}>{mm}</option>)}
          </select>
        </div>
        {value && (
          <div style={{ fontSize: 11, color: mutedColor, fontWeight: 600, marginTop: 3, fontFamily: FONT }}>{value}</div>
        )}
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function getClaimPeriod() {
  const now = new Date()
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const mn = monthNames[now.getMonth()]
  const yr = now.getFullYear()
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 26)
  const endDate   = new Date(now.getFullYear(), now.getMonth(), 25)
  const fmt = d => `${d.getDate()} ${monthNames[d.getMonth()].slice(0,3)}`
  return { label: `${mn} ${yr}`, range: `${fmt(prevMonth)} – ${fmt(endDate)}` }
}
function maskMobile(num) {
  if (!num) return null
  const clean = num.replace(/\s/g, '')
  if (clean.length < 4) return num
  return clean.slice(0, 4) + ' •••• ' + clean.slice(-2)
}
function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })
}

// ── Shared style helpers ───────────────────────────────────────────────────────
const lCard = (extra={}) => ({
  background: L.card, borderRadius: 14, border: `1px solid ${L.border}`, ...extra,
})
const dCard = (extra={}) => ({
  background: D.card, borderRadius: 14, border: `1px solid ${D.border}`, ...extra,
})
const lLbl = { fontSize: 10, color: L.muted, fontWeight: 700, textTransform:'uppercase', letterSpacing:'0.6px', marginBottom: 5, fontFamily: FONT }
const dLbl = { fontSize: 10, color: D.muted, fontWeight: 700, textTransform:'uppercase', letterSpacing:'0.6px', marginBottom: 5, fontFamily: FONT }
const lInp = {
  width:'100%', padding:'10px 13px', background: L.inputBg, border:`1.5px solid ${L.border}`,
  borderRadius:10, fontSize:14, color: L.text, boxSizing:'border-box', fontFamily: FONT, outline:'none',
}
const dInp = {
  width:'100%', padding:'10px 13px', background: D.card, border:`1.5px solid ${D.border}`,
  borderRadius:10, fontSize:14, color: D.text, boxSizing:'border-box', fontFamily: FONT, outline:'none',
}

// ─────────────────────────────────────────────────────────────────────────────
export default function FormOvertime() {

  const auth = useFieldAuth()

  const [step,       setStep]       = useState(1)
  const [employees,  setEmployees]  = useState([])
  const [projects,   setProjects]   = useState([])
  const [deptMap,    setDeptMap]    = useState({})
  const [lang,       setLang]       = useState('en')
  const isAr = lang === 'ar'

  // Screen 1
  const [empId,       setEmpId]       = useState('')
  const [empName,     setEmpName]     = useState('')
  const [empNum,      setEmpNum]      = useState('')
  const [empBasic,    setEmpBasic]    = useState(0)
  const [empEntityId, setEmpEntityId] = useState('')
  const [dept,        setDept]        = useState('')
  const [empDeptCode, setEmpDeptCode] = useState('')
  const [empDeptId,   setEmpDeptId]   = useState('')
  const [contact,     setContact]     = useState('')
  const [empOtAllowed,setEmpOtAllowed]= useState(true)  // from ot_allowed column
  // Screen 2
  const [otDate,           setOtDate]           = useState(new Date().toISOString().split('T')[0])
  const [projectId,        setProjectId]        = useState('')
  const [projNum,          setProjNum]          = useState('')
  const [projName,         setProjName]         = useState('')
  const [jobNo,            setJobNo]            = useState('')
  const [assignmentLoaded,     setAssignmentLoaded]     = useState(false)
  const [assignmentQueryDone, setAssignmentQueryDone] = useState(false)
  const [manualOverride,   setManualOverride]   = useState(false)
  // Overlap check
  const [existingOTId,   setExistingOTId]   = useState(null)
  const [existingOTInfo, setExistingOTInfo] = useState(null)
  const [isUpdate,       setIsUpdate]       = useState(false)
  const [checkingOT,     setCheckingOT]     = useState(false)
  // Screen 3
  const [otType,   setOtType]   = useState('NORMAL')
  const [fromTime, setFromTime] = useState('')
  const [toTime,   setToTime]   = useState('')
  const [remarks,  setRemarks]  = useState('')
  // Submit
  const [loading,   setLoading]   = useState(false)
  const [reqNumber, setReqNumber] = useState('')
  const [error,     setError]     = useState('')

  const CAN_SELECT_OTHER = ['STAFF_DH', 'STAFF_PM', 'STAFF_SUPERVISOR', 'FINANCE']
  const canSelectOther = devMode || previewMode || CAN_SELECT_OTHER.includes(auth.role)
  const isDark = step >= 4   // review + success on dark bg

  // Calculations
  const totalHours = (() => {
    if (!fromTime || !toTime) return 0
    const [sh, sm] = fromTime.split(':').map(Number)
    const [eh, em] = toTime.split(':').map(Number)
    let mins = (eh * 60 + em) - (sh * 60 + sm)
    if (mins < 0) mins += 24 * 60
    return Math.round((mins / 60) * 100) / 100
  })()
  const multiplier = OT_TYPES.find(t => t.value === otType)?.mult ?? 1.5
  const hourlyBase = empBasic > 0 ? empBasic / 30 / 8 : 0
  const otRate     = hourlyBase * multiplier
  const otAmount   = otRate * totalHours

  const deptProjects = empDeptCode
    ? projects.filter(p => {
        const code = p.dept?.dept_code || p.dept?.dept_name || deptMap[p.department_id]?.dept_code || deptMap[p.department_id]?.dept_name || ''
        return code.toUpperCase() === empDeptCode.toUpperCase()
      })
    : projects

  // Inject Poppins font
  useEffect(() => {
    const id = 'ot-poppins'
    if (!document.getElementById(id)) {
      const link = document.createElement('link')
      link.id = id; link.rel = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap'
      document.head.appendChild(link)
    }
  }, [])

  // Preview mode
  useEffect(() => {
    if (!previewMode) return
    setEmpId(PREVIEW.empId);     setEmpName(PREVIEW.empName);   setEmpNum(PREVIEW.empNum)
    setEmpBasic(PREVIEW.empBasic); setDept(PREVIEW.dept)
    setEmpDeptCode(PREVIEW.empDeptCode); setContact(PREVIEW.contact)
    setProjects(PREVIEW.projects)
    setProjectId(PREVIEW.projectId); setProjNum(PREVIEW.projNum); setProjName(PREVIEW.projName)
    setOtDate(PREVIEW.otDate);   setJobNo(PREVIEW.jobNo)
    setOtType(PREVIEW.otType);   setFromTime(PREVIEW.fromTime); setToTime(PREVIEW.toTime)
    setRemarks(PREVIEW.remarks)
  }, [])

  useEffect(() => {
    if (previewMode) return
    if (auth.loading) return
    if (!auth.employee && !devMode) return
    loadData()
  }, [auth.loading])

  async function loadData() {
    const entityId = auth.entityId || null
    const empQ = devMode
      ? supabase.rpc('get_dev_employees')
      : supabase.from('employees')
          .select('id,full_name_en,employee_number,department_id,phone,basic_salary,entity_id,is_active,ot_allowed')
          .eq('is_active', true).order('full_name_en')
    const projQ = supabase.from('projects')
      .select('id,project_number,project_name,department_id,dept:department_id(dept_code,dept_name)')
      .in('status', ['OPEN','ACTIVE']).order('project_number')
    if (entityId && !devMode) projQ.eq('entity_id', entityId)
    const deptQ = supabase.from('departments').select('id,dept_name,dept_code').eq('is_active', true)
    const [{ data: emps }, { data: projs }, { data: depts }] = await Promise.all([empQ, projQ, deptQ])
    const empList  = emps  || []
    const deptDict = Object.fromEntries((depts || []).map(d => [d.id, d]))
    setEmployees(empList); setProjects(projs || []); setDeptMap(deptDict)
    const authEmp = auth.employee
    if (authEmp && !empId) {
      const match = empList.find(e => e.id === authEmp.id) || authEmp
      const d     = deptDict[match.department_id] || {}
      setEmpId(match.id);        setEmpName(match.full_name_en || '')
      setEmpNum(match.employee_number || '')
      setDept(d.dept_code || d.dept_name || '')
      setEmpDeptCode(d.dept_code || d.dept_name || '')
      setEmpDeptId(match.department_id || '')
      setContact(match.phone || ''); setEmpEntityId(match.entity_id || '')
      setEmpBasic(match.basic_salary || 0)
      setEmpOtAllowed(match.ot_allowed !== false)
      loadEmployeeAssignment(match.id)
    }
  }

  async function loadEmployeeAssignment(eid) {
    setAssignmentLoaded(false)
    setProjectId(''); setProjNum(''); setProjName(''); setJobNo('')
    try {
      const { data } = await supabase
        .from('site_assignments')
        .select(`id,project_id,site_master_id,
          project:project_id(id,project_number,project_name),
          site:site_master_id(id,site_name,job_no,sm_id)`)
        .eq('employee_id', eid).eq('status','ACTIVE')
        .order('assignment_date', { ascending: false }).limit(1).maybeSingle()
      if (data) {
        setProjectId(data.project_id || '')
        setProjNum(data.project?.project_number || '')
        setProjName(data.project?.project_name || '')
        setJobNo(data.site?.job_no || data.site?.sm_id || '')
        setAssignmentLoaded(true)
      }
    } catch (err) { console.error('[FormOvertime] assignment error:', err) }
    finally { setAssignmentQueryDone(true) }
  }

  async function onEmp(id) {
    setEmpId(id)
    const e = employees.find(x => x.id === id)
    if (!e) return
    const d = deptMap[e.department_id] || {}
    const code = d.dept_code || d.dept_name || ''
    setEmpName(e.full_name_en || ''); setEmpNum(e.employee_number || '')
    setDept(d.dept_code || d.dept_name || ''); setEmpDeptCode(code)
    setEmpDeptId(e.department_id || ''); setContact(e.phone || '')
    setEmpEntityId(e.entity_id || ''); setManualOverride(false)
    let basic = e.basic_salary || 0
    if (!basic) {
      const { data: emp } = await supabase.from('employees').select('basic_salary').eq('id', id).single()
      basic = emp?.basic_salary || 0
    }
    setEmpBasic(basic)
    setEmpOtAllowed(e.ot_allowed !== false)
    loadEmployeeAssignment(id)
  }

  function toMins(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  function overlaps(s1, e1, s2, e2) { return toMins(s1) < toMins(e2) && toMins(s2) < toMins(e1) }

  async function goNext() {
    setError('')
    if (step === 1) {
      if (!empId)   { setError(isAr ? 'يرجى اختيار الموظف أولاً' : 'Please select an employee first'); return }
      if (!contact) { setError(isAr ? 'رقم الجوال غير موجود' : 'Mobile number missing — update employee profile first'); return }
      setStep(2)
    } else if (step === 2) {
      if (!projectId && manualOverride) { setError(isAr ? 'يرجى اختيار المشروع' : 'Please select a project'); return }
      setStep(3)
    } else if (step === 3) {
      if (!fromTime || !toTime) { setError(isAr ? 'يرجى تحديد الأوقات' : 'Start and end time required'); return }
      if (totalHours <= 0)      { setError(isAr ? 'وقت النهاية يجب أن يكون بعد البداية' : 'End time must be after start time'); return }
      if (!previewMode) {
        setCheckingOT(true)
        try {
          const { data: existing } = await supabase
            .from('overtime_requests').select('id,from_time,to_time,request_number')
            .eq('employee_id', empId).eq('ot_date', otDate).order('from_time')
          if (existing && existing.length > 0) {
            const hit = existing.find(r => overlaps(fromTime, toTime, r.from_time, r.to_time))
            if (hit) { setExistingOTId(hit.id); setExistingOTInfo(hit); setIsUpdate(true) }
            else     { setExistingOTId(null);   setExistingOTInfo(null); setIsUpdate(false) }
          } else { setExistingOTId(null); setExistingOTInfo(null); setIsUpdate(false) }
        } catch (_) { setExistingOTId(null); setExistingOTInfo(null); setIsUpdate(false) }
        finally { setCheckingOT(false) }
      }
      setStep(4)
    } else if (step === 4) {
      submit()
    }
  }

  function goBack() { setError(''); setStep(s => s - 1) }

  async function submit() {
    if (previewMode) { setReqNumber(PREVIEW.reqNumber); setStep(5); return }
    setLoading(true); setError('')
    let gLat = null, gLng = null
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }))
      gLat = pos.coords.latitude; gLng = pos.coords.longitude
    } catch {}
    const payload = {
      entity_id: empEntityId||null, ot_date: otDate, employee_id: empId,
      department_name: dept, department_id: empDeptId||null, contact_number: contact,
      project_id: projectId||null, project_number: projNum||null, job_number: jobNo||null,
      ot_type: otType, from_time: fromTime, to_time: toTime,
      hours: totalHours, ot_rate: parseFloat(otRate.toFixed(4)),
      multiplier, total_amount: parseFloat(otAmount.toFixed(2)),
      gps_lat: gLat, gps_lng: gLng, remarks: remarks||null, status:'SUBMITTED',
    }
    let reqNum = '—'
    if (isUpdate && existingOTId) {
      const { data, error: err } = await supabase
        .from('overtime_requests').update(payload).eq('id', existingOTId)
        .select('request_number').single()
      setLoading(false)
      if (err) { setError(err.message); return }
      reqNum = data?.request_number || existingOTInfo?.request_number || '—'
    } else {
      const { data, error: err } = await supabase
        .from('overtime_requests').insert(payload).select('request_number').single()
      setLoading(false)
      if (err) { setError(err.code === '23505' ? (isAr ? 'يوجد تسجيل مكرر' : 'Duplicate entry detected.') : err.message); return }
      reqNum = data?.request_number || '—'
    }
    setReqNumber(reqNum)
    setStep(5)
  }

  function reset() {
    setStep(1)
    setOtType('NORMAL'); setFromTime(''); setToTime('')
    setRemarks(''); setError(''); setManualOverride(false)
    setExistingOTId(null); setExistingOTInfo(null); setIsUpdate(false)
    setOtDate(new Date().toISOString().split('T')[0])
    const authEmp = auth.employee
    if (authEmp && !devMode && !previewMode) {
      const d = deptMap[authEmp.department_id] || {}
      setEmpId(authEmp.id);        setEmpName(authEmp.full_name_en || '')
      setEmpNum(authEmp.employee_number || '')
      setDept(d.dept_code || d.dept_name || authEmp.dept_code || '')
      setEmpDeptCode(d.dept_code || d.dept_name || authEmp.dept_code || '')
      setEmpDeptId(authEmp.department_id || ''); setContact(authEmp.phone || '')
      setEmpEntityId(authEmp.entity_id || ''); setEmpBasic(authEmp.basic_salary || 0)
      setAssignmentLoaded(false)
      setProjectId(''); setProjNum(''); setProjName(''); setJobNo('')
      loadEmployeeAssignment(authEmp.id)
    } else {
      setEmpId(''); setEmpName(''); setEmpNum(''); setEmpBasic(0)
      setDept(''); setEmpDeptCode(''); setEmpDeptId(''); setContact('')
      setEmpEntityId(''); setProjectId(''); setProjNum(''); setProjName('')
      setJobNo(''); setAssignmentLoaded(false)
    }
  }

  const initials    = empName ? empName.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) : '??'
  const claimPeriod = getClaimPeriod()

  // ── Auth gates ──────────────────────────────────────────────────────────────
  if (auth.needsActivation && !devMode && !previewMode) return <OTPActivationScreen auth={auth} />
  if (auth.loading && !devMode && !previewMode) return (
    <div style={{ minHeight:'100dvh', background: L.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily: FONT, colorScheme:'light', color: L.text }}>
      <div style={{ fontSize:13, color: L.muted }}>Loading…</div>
    </div>
  )
  if (!auth.employee && !devMode && !previewMode) return (
    <div style={{ minHeight:'100dvh', background: L.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily: FONT, colorScheme:'light', color: L.text }}>
      <div style={{ textAlign:'center', padding:40 }}>
        <div style={{ fontSize:44, marginBottom:12 }}>🔐</div>
        <div style={{ fontSize:16, fontWeight:700, color: L.text, marginBottom:8 }}>Sign in required</div>
        <div style={{ fontSize:13, color: L.muted }}>Scan your QR code to access this form.</div>
      </div>
    </div>
  )

  // ─── ELIGIBILITY GATES ───────────────────────────────────────────────────────
  // Gate 1 — employee not allowed overtime (managers submitting on behalf: check selected emp)
  if (!devMode && !previewMode && empId && !empOtAllowed) {
    return (
      <div style={{ minHeight:'100dvh', background: L.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily: FONT, colorScheme:'light' }}>
        <div style={{ background: L.card, borderRadius:24, padding:'36px 28px', maxWidth:340, textAlign:'center',
          boxShadow:'0 8px 32px rgba(0,0,0,.12)', margin:20, border:`1px solid ${L.border}` }}>
          <div style={{ fontSize:52, marginBottom:12 }}>🚫</div>
          <div style={{ fontSize:17, fontWeight:800, color: L.text, marginBottom:8 }}>Overtime Not Permitted</div>
          <div style={{ fontSize:13, color: L.muted, lineHeight:1.6, marginBottom:20 }}>
            <strong>{empName || 'This employee'}</strong> is not authorised to claim overtime.<br/>
            Please contact HR to update the employee record.
          </div>
          <button onClick={() => window.location.href='/forms'}
            style={{ background: D.lime, color: D.bg, border:'none', borderRadius:14, padding:'13px 24px',
              fontSize:14, fontWeight:700, cursor:'pointer', width:'100%', fontFamily: FONT }}>
            ← Back to Forms
          </button>
        </div>
      </div>
    )
  }

  // Gate 2 — no active site assignment
  if (!devMode && !previewMode && assignmentQueryDone && !assignmentLoaded && empId) {
    return (
      <div style={{ minHeight:'100dvh', background: L.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily: FONT, colorScheme:'light' }}>
        <div style={{ background: L.card, borderRadius:24, padding:'36px 28px', maxWidth:340, textAlign:'center',
          boxShadow:'0 8px 32px rgba(0,0,0,.12)', margin:20, border:`1px solid ${L.border}` }}>
          <div style={{ fontSize:52, marginBottom:12 }}>🏗️</div>
          <div style={{ fontSize:17, fontWeight:800, color: L.text, marginBottom:8 }}>No Active Site Assignment</div>
          <div style={{ fontSize:13, color: L.muted, lineHeight:1.6, marginBottom:20 }}>
            <strong>{empName || 'This employee'}</strong> doesn't have an active site assignment.<br/>
            Overtime must be linked to a site. Please contact your DH.
          </div>
          <button onClick={() => window.location.href='/forms'}
            style={{ background: D.lime, color: D.bg, border:'none', borderRadius:14, padding:'13px 24px',
              fontSize:14, fontWeight:700, cursor:'pointer', width:'100%', fontFamily: FONT }}>
            ← Back to Forms
          </button>
        </div>
      </div>
    )
  }

  // ── Next button label ────────────────────────────────────────────────────────
  const nextLabel = () => {
    if (loading)    return isAr ? 'جاري الإرسال...' : 'Submitting...'
    if (checkingOT) return isAr ? 'جاري التحقق...' : 'Checking...'
    if (step === 4) return isAr ? (isUpdate ? '✓ تحديث' : '✓ إرسال الطلب') : (isUpdate ? '✓ Update request' : 'Submit request')
    if (step === 1) return isAr ? 'التالي: التاريخ والعمل' : 'Next: Date & job'
    if (step === 2) return isAr ? 'التالي: الوقت الإضافي' : 'Next: OT details'
    if (step === 3) return isAr ? 'التالي: مراجعة الطلب' : 'Next: Review'
    return isAr ? 'التالي' : 'Next'
  }

  // ── Header ──────────────────────────────────────────────────────────────────
  const hdrBg    = isDark ? D.card    : L.card
  const hdrBdr   = isDark ? D.border  : L.border
  const hdrText  = isDark ? D.text    : L.text
  const hdrMuted = isDark ? D.muted   : L.muted

  const header = (
    <div style={{ background: hdrBg, borderBottom: `1px solid ${hdrBdr}`, padding: '12px 16px', flexShrink: 0 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', direction:'ltr' }}>
        {/* Left: icon + title */}
        <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: isDark ? 'rgba(184,245,104,0.15)' : '#FFF3E0',
            border: `1.5px solid ${isDark ? 'rgba(184,245,104,0.3)' : '#FFE0B2'}`,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize: 18,
          }}>⏱️</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: hdrText, fontFamily: FONT, lineHeight: 1.2 }}>
              {isAr ? 'طلب وقت إضافي' : 'Overtime Request'}
            </div>
            <div style={{ fontSize: 10, color: hdrMuted, fontFamily: FONT }}>Ratal Group</div>
          </div>
        </div>
        {/* Right: lang + logout */}
        <div style={{ display:'flex', gap: 8, alignItems:'center' }}>
          <button onClick={() => setLang(l => l==='en'?'ar':'en')}
            style={{ background:'transparent', border:`1.5px solid ${hdrBdr}`, color: hdrMuted, borderRadius:20, padding:'4px 12px', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily: FONT }}>
            {isAr ? 'English' : 'العربية'}
          </button>
          <button onClick={() => { auth.logout(); window.location.reload() }} title="Sign out"
            style={{ background:'transparent', color: hdrMuted, border:`1.5px solid ${hdrBdr}`, borderRadius:8, padding:'4px 8px', fontSize:14, cursor:'pointer', lineHeight:1 }}>
            ⎋
          </button>
        </div>
      </div>
    </div>
  )

  // ── Step indicator ────────────────────────────────────────────────────────────
  const stepIndicator = step < 5 && (
    <div style={{ padding:'10px 16px 0', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, background: isDark ? D.bg : L.bg }}>
      <span style={{ fontSize:11, color: isDark ? D.muted : L.muted, fontWeight:600, fontFamily: FONT }}>
        {isAr ? `خطوة ${step} من 4` : `Step ${step} of 4`}
      </span>
      <div style={{ display:'flex', gap: 5 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{
            height: 5, borderRadius: 10, transition: 'all 0.25s',
            width: i === step ? 28 : 14,
            background: i < step
              ? (isDark ? D.lime : L.yellow)
              : i === step
                ? (isDark ? D.lime : L.greenCard)
                : (isDark ? D.border : L.border),
          }} />
        ))}
      </div>
    </div>
  )

  // ── Screen title ─────────────────────────────────────────────────────────────
  function ScreenTitle({ title, sub }) {
    return (
      <div style={{ padding:'14px 16px 10px' }}>
        <div style={{ fontSize:24, fontWeight:800, color: isDark ? D.text : L.text, lineHeight:1.2, fontFamily: FONT }}>{title}</div>
        {sub && <div style={{ fontSize:13, color: isDark ? D.muted : L.muted, marginTop:4, fontFamily: FONT }}>{sub}</div>}
      </div>
    )
  }

  // ── Error banner ──────────────────────────────────────────────────────────────
  function ErrBanner({ msg }) {
    if (!msg) return null
    return (
      <div style={{ background: isDark ? D.errorBg : L.errorBg, border:`1.5px solid ${isDark ? D.errorBorder : L.errorBorder}`, borderRadius:10, padding:'10px 14px', color: isDark ? D.error : L.error, fontSize:12, margin:'0 16px 10px', lineHeight:1.5, fontFamily: FONT }}>
        ⚠️ {msg}
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SCREEN 1 — Employee details (LIGHT)
  // ══════════════════════════════════════════════════════════════════════════════
  const screen1 = (
    <div style={{ paddingBottom: 16 }}>
      <ScreenTitle
        title={isAr ? 'بيانات الموظف' : 'Employee details'}
        sub={isAr ? 'تأكيد هوية مقدم الطلب' : 'Confirm who this request is for'}
      />

      {devMode && !previewMode && (
        <div style={{ margin:'0 16px 10px', background:'rgba(255,179,0,0.1)', border:'1.5px dashed #fb8c00', borderRadius:10, padding:'10px 14px' }}>
          <div style={{ fontWeight:700, color:'#e65100', fontSize:12, fontFamily: FONT }}>🛠 TESTING MODE — select any employee</div>
        </div>
      )}

      <ErrBanner msg={error} />

      {canSelectOther && (
        <div style={{ padding:'0 16px 12px' }}>
          <div style={lLbl}>{isAr ? 'اختر الموظف' : 'Select employee'}</div>
          <select value={empId} onChange={e => onEmp(e.target.value)} style={{ ...lInp, fontSize:13 }}>
            <option value="">— {isAr ? 'اختر من القائمة' : 'Choose from list'} —</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name_en} ({e.employee_number})</option>)}
          </select>
        </div>
      )}

      {empId && (
        <div style={{ padding:'0 16px', display:'flex', flexDirection:'column', gap:10 }}>

          {/* Green profile card */}
          <div style={{ background: L.greenCard, borderRadius: 16, padding:'16px 18px', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(255,255,255,0.15)', color:'#C5F195', fontSize:16, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontFamily: FONT }}>
              {initials}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:16, fontWeight:700, color:'#FFFFFF', lineHeight:1.2, fontFamily: FONT }}>{empName}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:3, fontWeight:500, fontFamily: FONT }}>
                {empNum}{dept ? ` · ${dept}` : ''}
              </div>
            </div>
          </div>

          {/* Mobile */}
          <div style={lCard({ padding:'12px 16px' })}>
            <div style={lLbl}>{isAr ? 'الجوال' : 'Mobile'}</div>
            <div style={{ fontSize:16, fontWeight:600, color: L.text, fontFamily: FONT }}>
              {contact ? maskMobile(contact) : <span style={{ color: L.error, fontSize:13 }}>⚠ {isAr ? 'غير موجود' : 'Not on file'}</span>}
            </div>
          </div>

          {/* Dept + Claim period — 2 col */}
          <div style={{ display:'flex', gap:10 }}>
            <div style={{ ...lCard({ flex:1, padding:'12px 16px' }) }}>
              <div style={lLbl}>{isAr ? 'القسم' : 'Department'}</div>
              <div style={{ fontSize:13, fontWeight:600, color: L.text, fontFamily: FONT }}>{dept || '—'}</div>
            </div>
            <div style={{ ...lCard({ flex:1, padding:'12px 16px' }) }}>
              <div style={lLbl}>{isAr ? 'فترة المطالبة' : 'Claim period'}</div>
              <div style={{ fontSize:13, fontWeight:700, color: L.text, fontFamily: FONT }}>{claimPeriod.label}</div>
              <div style={{ fontSize:11, color: L.muted, fontFamily: FONT }}>{claimPeriod.range}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════════
  // SCREEN 2 — Date & assignment (LIGHT)
  // ══════════════════════════════════════════════════════════════════════════════
  const screen2 = (
    <div style={{ paddingBottom: 16 }}>
      <ScreenTitle
        title={isAr ? 'التاريخ والمهمة' : 'Date & assignment'}
        sub={isAr ? 'أضف تاريخ الإضافي والعمل' : 'Overtime date and job details'}
      />
      <ErrBanner msg={error} />

      <div style={{ padding:'0 16px', display:'flex', flexDirection:'column', gap:10 }}>

        {/* Site assignment card */}
        {assignmentLoaded && !manualOverride ? (
          <div style={{ background:'#EAF5ED', border:`1px solid #C3E6C8`, borderRadius:14, padding:'14px 16px' }}>
            <div style={{ fontSize:10, color:'#4A7A52', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:6, fontFamily: FONT }}>
              {isAr ? 'من الموقع المحدد' : 'From site assignment'}
            </div>
            <div style={{ fontSize:14, fontWeight:700, color: L.greenCard, fontFamily: FONT }}>
              {projNum || projName ? `${projNum ? projNum + ' · ' : ''}${projName}` : jobNo ? `Job ${jobNo}` : 'Site assigned'}
            </div>
            {canSelectOther && (
              <button onClick={() => setManualOverride(true)}
                style={{ background:'none', border:'none', color:'#4A7A52', fontSize:11, textDecoration:'underline', cursor:'pointer', padding:'6px 0 0', fontFamily: FONT }}>
                {isAr ? 'تغيير يدوياً' : 'Choose manually'}
              </button>
            )}
          </div>
        ) : (
          <div>
            <div style={{ ...lLbl, marginBottom:8 }}>{isAr ? 'اختر المشروع' : 'Select project site'}</div>
            {deptProjects.length === 0 ? (
              <div style={lCard({ padding:'14px 16px', textAlign:'center', color: L.muted, fontSize:13 })}>
                {isAr ? 'لا توجد مشاريع نشطة' : 'No active projects for this department'}
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {deptProjects.map(p => {
                  const sel = projectId === p.id
                  return (
                    <div key={p.id}
                      onClick={() => { setProjectId(p.id); setProjNum(p.project_number||''); setProjName(p.project_name||''); setError('') }}
                      style={{ ...lCard({ cursor:'pointer', border:`1.5px solid ${sel ? L.greenCard : L.border}`, background: sel ? '#EAF5ED' : L.card }), padding:'12px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color: L.text, fontFamily: FONT }}>{p.project_number} · {p.project_name}</div>
                        <div style={{ fontSize:11, color: L.muted, marginTop:2, fontFamily: FONT }}>{p.dept?.dept_name || ''}</div>
                      </div>
                      {sel && <div style={{ width:20, height:20, borderRadius:'50%', background: L.greenCard, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'#fff', flexShrink:0 }}>✓</div>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Date */}
        <div style={lCard({ padding:'12px 16px' })}>
          <div style={lLbl}>{isAr ? 'تاريخ الوقت الإضافي' : 'Date of overtime'}</div>
          <input type="date" value={otDate} onChange={e => setOtDate(e.target.value)}
            style={{ ...lInp, padding:'6px 0', background:'transparent', border:'none', fontSize:14, fontWeight:600 }} />
        </div>

        {/* Job number */}
        <div style={lCard({ padding:'12px 16px' })}>
          <div style={lLbl}>{isAr ? 'رقم العمل (اختياري)' : 'Job number (optional)'}</div>
          <input value={jobNo} onChange={e => setJobNo(e.target.value)}
            placeholder={isAr ? 'اختياري' : 'e.g. 102-00-000'}
            style={{ ...lInp, padding:'6px 0', background:'transparent', border:'none', fontSize:14 }} />
        </div>
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════════
  // SCREEN 3 — Time & OT type (LIGHT)
  // ══════════════════════════════════════════════════════════════════════════════
  const screen3 = (
    <div style={{ paddingBottom: 16 }}>
      <ScreenTitle
        title={isAr ? 'الوقت والإضافي' : 'Time & overtime'}
        sub={isAr ? 'حدد النوع وساعات العمل' : 'Set the type and working hours'}
      />
      <ErrBanner msg={error} />

      <div style={{ padding:'0 16px', display:'flex', flexDirection:'column', gap:14 }}>

        {/* OT type grid */}
        <div>
          <div style={{ ...lLbl, marginBottom:10 }}>{isAr ? 'نوع الوقت الإضافي' : 'Overtime type'}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {OT_TYPES.map(t => {
              const sel = otType === t.value
              return (
                <button key={t.value} type="button" onClick={() => setOtType(t.value)}
                  style={{ background: sel ? L.yellow : L.card, border:`1.5px solid ${sel ? '#DAB820' : L.border}`, borderRadius:14, padding:'12px 14px', cursor:'pointer', textAlign:'left', fontFamily: FONT, transition:'all 0.15s' }}>
                  <div style={{ fontSize:13, fontWeight:700, color: sel ? '#3D3000' : L.text, marginBottom:2, fontFamily: FONT }}>
                    {isAr ? t.labelAr : t.label}
                  </div>
                  <div style={{ fontSize:11, color: sel ? '#7A6000' : L.muted, fontWeight:500, fontFamily: FONT }}>
                    {t.tag}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Time pickers */}
        <div>
          <div style={{ ...lLbl, marginBottom:10 }}>{isAr ? 'ساعات العمل — تنسيق 24 ساعة' : 'Working hours · 24-hour format'}</div>
          <div style={{ display:'flex', gap:10 }}>
            <TimePicker value={fromTime} onChange={setFromTime} label={isAr ? 'وقت البداية' : 'Start time'} dark={false} />
            <TimePicker value={toTime}   onChange={setToTime}   label={isAr ? 'وقت النهاية' : 'End time'} dark={false} />
          </div>
        </div>

        {/* Calculated result */}
        <div style={{ background: L.greenCard, borderRadius:16, padding:'16px 18px' }}>
          {fromTime && toTime && totalHours > 0 ? (
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.55)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:4, fontFamily: FONT }}>
                  {isAr ? 'الساعات المحسوبة' : 'Calculated hours'}
                </div>
                <div style={{ fontSize:30, fontWeight:800, color:'#C5F195', lineHeight:1, fontFamily: FONT }}>
                  {totalHours} <span style={{ fontSize:14, fontWeight:600 }}>hrs</span>
                </div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', marginTop:3, fontFamily: FONT }}>
                  SAR {hourlyBase.toFixed(2)}/hr × {multiplier}
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.55)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:4, fontFamily: FONT }}>
                  {isAr ? 'مبلغ الإضافي' : 'OT amount'}
                </div>
                <div style={{ fontSize:22, fontWeight:800, color:'#FFFFFF', fontFamily: FONT }}>
                  SAR {otAmount.toFixed(2)}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign:'center', color:'rgba(255,255,255,0.4)', fontSize:13, fontWeight:500, padding:'4px 0', fontFamily: FONT }}>
              {isAr ? 'أدخل الأوقات لحساب المبلغ' : 'Enter times to calculate amount'}
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <div style={lLbl}>{isAr ? 'ملاحظات (اختيارية)' : 'Notes (optional)'}</div>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
            placeholder={isAr ? 'مثال: تشغيل برج الهاتف قسم B' : 'e.g. Tower section B commissioning'}
            style={{ ...lInp, minHeight:80, resize:'vertical', display:'block', lineHeight:1.5 }} />
        </div>
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════════
  // SCREEN 4 — Review (DARK)
  // ══════════════════════════════════════════════════════════════════════════════
  const otTypeLabel = OT_TYPES.find(t => t.value === otType)?.[isAr ? 'labelAr' : 'label'] || otType

  const screen4 = (
    <div style={{ paddingBottom: 16 }}>
      <ScreenTitle
        title={isAr ? 'مراجعة الطلب' : 'Review request'}
        sub={isAr ? 'تحقق من التفاصيل قبل الإرسال' : 'Check the details before submitting'}
      />
      <ErrBanner msg={error} />

      {/* Overlap warning */}
      {isUpdate && existingOTInfo && (
        <div style={{ margin:'0 16px 10px', background:'rgba(255,107,0,0.12)', border:'1.5px solid rgba(255,107,0,0.4)', borderRadius:14, padding:'12px 14px' }}>
          <div style={{ fontSize:11, fontWeight:800, color:'#FF8C42', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4, fontFamily: FONT }}>
            ⚠ {isAr ? 'تحديث سجل موجود' : 'Updating existing entry'}
          </div>
          <div style={{ fontSize:12, color:'#FFAA70', lineHeight:1.5, fontFamily: FONT }}>
            {isAr ? `وقت إضافي موجود: ${existingOTInfo.from_time}–${existingOTInfo.to_time}` : `Existing OT on this date: ${existingOTInfo.from_time} – ${existingOTInfo.to_time}`}
            {existingOTInfo.request_number ? ` (${existingOTInfo.request_number})` : ''}
          </div>
        </div>
      )}

      <div style={{ padding:'0 16px', display:'flex', flexDirection:'column', gap:10 }}>

        {/* Amount highlight */}
        <div style={{ background: D.lime, borderRadius:16, padding:'16px 20px' }}>
          <div style={{ fontSize:10, color:'rgba(32,34,31,0.55)', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:4, fontFamily: FONT }}>
            {isAr ? 'مبلغ الوقت الإضافي' : 'Overtime amount'}
          </div>
          <div style={{ fontSize:34, fontWeight:800, color: D.onAccent, fontFamily: FONT }}>SAR {otAmount.toFixed(2)}</div>
          <div style={{ fontSize:11, color:'rgba(32,34,31,0.5)', marginTop:2, fontFamily: FONT }}>{totalHours} hrs × SAR {otRate.toFixed(2)}/hr</div>
        </div>

        {/* Summary */}
        <div style={dCard({ padding:'14px 16px' })}>
          <div style={{ fontSize:15, fontWeight:700, color: D.text, marginBottom:2, fontFamily: FONT }}>{empName}</div>
          <div style={{ fontSize:11, color: D.muted, marginBottom:12, fontFamily: FONT }}>{empNum}</div>
          {[
            { key: isAr?'المشروع':'Project', val: projNum||projName ? `${projNum} ${projName}`.trim() : jobNo ? `Job: ${jobNo}` : (isAr?'غير محدد':'Not specified') },
            { key: isAr?'التاريخ':'Date',    val: fmtDate(otDate) },
            { key: isAr?'النوع':'OT type',   val: otTypeLabel },
            { key: isAr?'الأوقات':'Time',    val: `${fromTime} – ${toTime}` },
            { key: isAr?'الساعات':'Hours',   val: `${totalHours} hrs` },
          ].map((r, i, arr) => (
            <div key={r.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom: i < arr.length-1 ? `1px solid ${D.border}` : 'none' }}>
              <span style={{ fontSize:12, color: D.muted, fontFamily: FONT }}>{r.key}</span>
              <span style={{ fontSize:13, fontWeight:600, color: D.text, textAlign:'right', maxWidth:'60%', fontFamily: FONT }}>{r.val}</span>
            </div>
          ))}
        </div>

        <div style={{ textAlign:'center', fontSize:11, color: D.muted, fontFamily: FONT }}>
          {isAr ? 'سيتم إشعار مديرك وإدارة الحسابات عبر تيليجرام.' : 'Your DH and Finance will be notified via Telegram.'}
        </div>
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════════
  // SCREEN 5 — Success (DARK)
  // ══════════════════════════════════════════════════════════════════════════════
  const screen5 = (
    <div style={{ padding:'24px 16px 16px', display:'flex', flexDirection:'column', gap:20, alignItems:'center' }}>

      <div style={{ width:76, height:76, borderRadius:'50%', background:'rgba(184,245,104,0.15)', border:`2px solid ${D.lime}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:34 }}>
        ✓
      </div>

      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:22, fontWeight:800, color: D.text, fontFamily: FONT, marginBottom:6 }}>
          {isAr ? 'تم إرسال الطلب!' : 'Request submitted!'}
        </div>
        <div style={{ fontSize:10, color: D.muted, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:6, fontFamily: FONT }}>
          {isAr ? 'رقم الطلب' : 'Request number'}
        </div>
        <div style={{ fontSize:24, fontWeight:800, color: D.lime, letterSpacing:'1px', fontFamily: FONT }}>{reqNumber}</div>
      </div>

      <div style={dCard({ width:'100%', boxSizing:'border-box', padding:'14px 16px' })}>
        {(isAr
          ? ['مديرك يراجع الطلب ويوافق عليه', 'الحسابات تحسب مبلغ الوقت الإضافي', 'يُضاف إلى مطالبة الراتب القادمة']
          : ['Your DH reviews and approves', 'Finance calculates the OT payment', 'Added to your next salary claim']
        ).map((s, i) => (
          <div key={i} style={{ display:'flex', gap:12, alignItems:'flex-start', marginBottom: i < 2 ? 12 : 0 }}>
            <div style={{ width:24, height:24, borderRadius:'50%', background: D.lime, color: D.onAccent, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, flexShrink:0, fontFamily: FONT }}>{i+1}</div>
            <span style={{ fontSize:13, color: D.sub, lineHeight:1.5, paddingTop:3, fontFamily: FONT }}>{s}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize:11, color: D.muted, textAlign:'center', fontFamily: FONT }}>
        {isAr ? 'تم إرسال إشعار تيليجرام إلى مديرك' : 'Telegram notification sent to your DH'}
      </div>
    </div>
  )

  // ── Bottom bar ────────────────────────────────────────────────────────────────
  const btnBg    = step === 5 ? (isDark ? D.lime : L.yellow) : (isDark ? D.lime : L.greenCard)
  const btnColor = isDark ? D.onAccent : '#fff'

  const bottomBar = (
    <div style={{ flexShrink:0, padding:`10px 16px calc(16px + env(safe-area-inset-bottom, 0px))`, background: isDark ? D.bg : L.bg, borderTop:`1px solid ${isDark ? D.border : L.border}`, boxSizing:'border-box' }}>
      {step === 5 ? (
        <button onClick={reset}
          style={{ width:'100%', height:52, background: D.lime, color: D.onAccent, border:'none', borderRadius:100, fontSize:15, fontWeight:700, cursor:'pointer', fontFamily: FONT }}>
          {isAr ? '+ إرسال طلب آخر' : 'Submit another'}
        </button>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <button onClick={goNext} type="button" disabled={loading || checkingOT}
            style={{ width:'100%', height:52, background: btnBg, color: btnColor, border:'none', borderRadius:100, fontSize:15, fontWeight:700, cursor:(loading||checkingOT)?'not-allowed':'pointer', opacity:(loading||checkingOT)?0.7:1, fontFamily: FONT, letterSpacing:'0.2px' }}>
            {nextLabel()}
          </button>
          {step > 1 && (
            <button onClick={goBack} type="button"
              style={{ width:'100%', height:40, background:'none', color: isDark ? D.muted : L.muted, border:'none', fontSize:14, fontWeight:600, cursor:'pointer', fontFamily: FONT }}>
              {isAr ? 'رجوع' : 'Back'}
            </button>
          )}
        </div>
      )}
    </div>
  )

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <div style={{
      maxWidth: 480, margin: '0 auto',
      height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: FONT, direction: isAr ? 'rtl' : 'ltr',
      background: isDark ? D.bg : L.bg,
      color: isDark ? D.text : L.text,
      colorScheme: isDark ? 'dark' : 'light',
    }}>
      {header}
      {stepIndicator}
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', paddingTop: step < 5 ? 4 : 0 }}>
        {step === 1 && screen1}
        {step === 2 && screen2}
        {step === 3 && screen3}
        {step === 4 && screen4}
        {step === 5 && screen5}
      </div>
      {bottomBar}
    </div>
  )
}
