/**
 * FOOD ALLOWANCE FORM  — /forms/food-allowance
 * Mobile-first 5-screen wizard — FOOD_THEME redesign (Poppins, forest/cream/yellow/teal)
 *
 * MODES:
 *   SINGLE — Ratal employee claims for themselves only (1 day, selectable rate)
 *   TEAM   — Ratal employee + outsourced workers from same site assignment
 *            Outsourced rate is fixed SAR 20/day, 1 day only
 *
 * On submit (TEAM mode):
 *   - ONE record under the employee: self_amount + team_amount = total_amount
 *   - beneficiaries JSONB stores each outsourced worker with ack_status PENDING
 *   - Notification fired to each outsourced worker → they confirm via QR login
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useFieldAuth } from '../lib/useFieldAuth'

// ── Food Allowance Theme (scoped — do NOT export) ───────────────────────────
const FT = {
  forest:      '#103F34',   // header bg, primary btn, selected state
  cream:       '#EDF3CF',   // page background
  yellow:      '#E7E326',   // active accent, selected highlight
  teal:        '#30B0C1',   // secondary accent
  lightCard:   '#F8FAEB',   // card bg
  darkCard:    '#1B5142',   // dark card (calc display, grand total)
  mutedDark:   '#BED1BC',   // muted text on dark bg
  mutedLight:  '#5B7566',   // muted text on light bg
  text:        '#0D2B22',   // main text
  textOnDark:  '#FFFFFF',   // text on forest/darkCard
  border:      '#D6E8C0',   // card border
  error:       '#C62828',   // error red
  errorBg:     '#FFF0F0',
  tealLight:   '#E0F6FA',   // teal tinted bg
  yellowLight: '#FAFAD6',   // yellow tinted bg
}

const FONT = "'Poppins', 'Segoe UI', system-ui, sans-serif"

const OUTSOURCE_RATE = 20

const DEV_WORKERS = [
  { id:'dev-1', full_name_en:'Ahmed Al-Rashidi',   employee_number:'EXT-001' },
  { id:'dev-2', full_name_en:'Mohammed Al-Ghamdi', employee_number:'EXT-002' },
  { id:'dev-3', full_name_en:'Khalid Al-Otaibi',   employee_number:'EXT-003' },
  { id:'dev-4', full_name_en:'Faisal Al-Shehri',   employee_number:'EXT-004' },
  { id:'dev-5', full_name_en:'Omar Al-Zahrani',    employee_number:'EXT-005' },
]

const _params     = new URLSearchParams(window.location.search)
const devMode     = _params.get('dev') === '1' || _params.get('preview') === '1' ||
                    localStorage.getItem('accsys_dev_mode') === '1'

// ── Shared styles ─────────────────────────────────────────────────────────────
const S = {
  card: {
    background: FT.lightCard,
    borderRadius: 16,
    margin: '0 14px',
    padding: '14px 16px',
    boxShadow: '0 1px 6px rgba(16,63,52,0.08)',
    border: `1px solid ${FT.border}`,
  },
  inp: {
    width: '100%',
    padding: '12px 14px',
    background: '#fff',
    border: `1.5px solid ${FT.border}`,
    borderRadius: 12,
    fontSize: 14,
    color: FT.text,
    boxSizing: 'border-box',
    fontFamily: FONT,
    fontWeight: 500,
    outline: 'none',
  },
  lbl: {
    fontSize: 10,
    color: FT.mutedLight,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.7px',
    marginBottom: 6,
    fontFamily: FONT,
  },
  roRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '11px 14px',
    background: '#fff',
    border: `1.5px solid ${FT.border}`,
    borderRadius: 12,
    minHeight: 44,
    boxSizing: 'border-box',
  },
}

export default function FormFoodAllowance() {
  const auth = useFieldAuth()

  const [step,      setStep]      = useState(1)
  const [employees, setEmployees] = useState([])
  const [projects,  setProjects]  = useState([])
  const [deptMap,   setDeptMap]   = useState({})
  const [lang,      setLang]      = useState('en')
  const isAr = lang === 'ar'

  // Screen 1 — Who is submitting
  const [empId,       setEmpId]       = useState('')
  const [empName,     setEmpName]     = useState('')
  const [empNum,      setEmpNum]      = useState('')
  const [empEntityId, setEmpEntityId] = useState('')
  const [dept,        setDept]        = useState('')
  const [empDeptCode, setEmpDeptCode] = useState('')
  const [contact,     setContact]     = useState('')
  const [empFoodRate, setEmpFoodRate] = useState(null)

  // Screen 2 — Project + date + location (auto-filled from site_assignment)
  const [allowDate,         setAllowDate]         = useState(new Date().toISOString().split('T')[0])
  const [projectId,         setProjectId]         = useState('')
  const [projNum,           setProjNum]           = useState('')
  const [projName,          setProjName]          = useState('')
  const [location,          setLocation]          = useState('')
  const [jobNo,             setJobNo]             = useState('')
  const [siteMasterId,      setSiteMasterId]      = useState('')
  const [assignmentId,      setAssignmentId]      = useState('')
  const [assignmentLoading, setAssignmentLoading] = useState(false)
  const [manualOverride,    setManualOverride]    = useState(false)

  // Screen 3 — Rate + optional team toggle
  const [hasTeam,          setHasTeam]          = useState(false)
  const [siteWorkers,      setSiteWorkers]       = useState([])
  const [selectedWorkers,  setSelectedWorkers]   = useState([])
  const [remarks,          setRemarks]           = useState('')

  // Submit
  const [loading,   setLoading]   = useState(false)
  const [reqNumber, setReqNumber] = useState('')
  const [error,     setError]     = useState('')

  // Derived
  const mode        = hasTeam && selectedWorkers.length > 0 ? 'TEAM' : 'SINGLE'
  const selfRate    = empFoodRate ?? 30
  const selfAmount  = selfRate
  const teamAmount  = selectedWorkers.length * OUTSOURCE_RATE
  const totalAmount = selfAmount + (hasTeam ? teamAmount : 0)
  const visibleWorkers = siteWorkers.length > 0 ? siteWorkers : DEV_WORKERS

  const deptProjects = empDeptCode
    ? projects.filter(p => {
        const code = p.dept?.dept_code || p.dept?.dept_name
          || deptMap[p.department_id]?.dept_code
          || deptMap[p.department_id]?.dept_name || ''
        return code.toUpperCase() === empDeptCode.toUpperCase()
      })
    : projects

  // Roles that can submit on behalf of another employee
  const CAN_SELECT_OTHER = ['STAFF_DH', 'STAFF_PM', 'STAFF_SUPERVISOR', 'FINANCE']
  const canSelectOther = devMode || CAN_SELECT_OTHER.includes(auth.role)

  // Load data once auth resolves, then auto-select the logged-in employee
  useEffect(() => {
    if (auth.loading) return
    if (!auth.employee && !devMode) return
    loadData()
  }, [auth.loading])

  async function loadData() {
    const entityId = auth.entityId || null

    const empQ = devMode
      ? supabase.rpc('get_dev_employees')
      : supabase.from('employees')
          .select('id,full_name_en,employee_number,department_id,phone,entity_id,employment_type,is_active,fa_eligible,fa_amount')
          .eq('is_active', true).order('full_name_en')
    const projQ = supabase.from('projects')
      .select('id,project_number,project_name,department_id,dept:department_id(dept_code,dept_name)')
      .in('status', ['OPEN','ACTIVE']).order('project_number')
    if (entityId && !devMode) projQ.eq('entity_id', entityId)
    const deptQ = supabase.from('departments').select('id,dept_name,dept_code').eq('is_active', true)
    const [empRes, projRes, deptRes] = await Promise.all([empQ, projQ, deptQ])
    if (empRes.error) console.error('[FoodAllowance] employees error:', empRes.error)

    const empList  = empRes.data || []
    const deptDict = Object.fromEntries((deptRes.data || []).map(d => [d.id, d]))
    setEmployees(empList)
    setProjects(projRes.data || [])
    setDeptMap(deptDict)

    // Auto-select the QR-authenticated employee (skip Step 1 for non-managers)
    const authEmp = auth.employee
    if (authEmp && !empId) {
      // Find the full employee record from the loaded list
      const match = empList.find(e => e.id === authEmp.id) || authEmp
      const d    = deptDict[match.department_id] || {}
      const code = d.dept_code || d.dept_name || ''
      setEmpId(match.id)
      setEmpName(match.full_name_en || '')
      setEmpNum(match.employee_number || '')
      setDept(d.dept_code || d.dept_name || '')
      setEmpDeptCode(code)
      setContact(match.phone || '')
      setEmpEntityId(match.entity_id || '')
      setEmpFoodRate(match.fa_amount && match.fa_amount > 0 ? Number(match.fa_amount) : 30)
      // Load their site assignment
      loadEmployeeAssignment(match.id)
    }
  }

  function onEmp(id) {
    setEmpId(id)
    const e = employees.find(x => x.id === id)
    if (!e) return
    const d = deptMap[e.department_id] || {}
    const code = d.dept_code || d.dept_name || ''
    setEmpName(e.full_name_en || '')
    setEmpNum(e.employee_number || '')
    setDept(d.dept_code || d.dept_name || '')
    setEmpDeptCode(code)
    setContact(e.phone || '')
    setEmpEntityId(e.entity_id || '')
    setEmpFoodRate(e.fa_amount && e.fa_amount > 0 ? Number(e.fa_amount) : 30)
    setProjectId(''); setProjNum(''); setProjName('')
    setSiteWorkers([]); setSelectedWorkers([])
    setManualOverride(false)
    loadEmployeeAssignment(id)
  }

  async function loadEmployeeAssignment(eid) {
    setAssignmentLoading(true)
    setAssignmentId(''); setSiteMasterId(''); setLocation(''); setJobNo('')
    try {
      const { data } = await supabase
        .from('site_assignments')
        .select(`
          id, project_id, site_master_id, is_remote,
          project:project_id(id, project_number, project_name),
          site:site_master_id(id, site_name, job_no, sm_id)
        `)
        .eq('employee_id', eid)
        .eq('status', 'ACTIVE')
        .order('assignment_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data) {
        setAssignmentId(data.id || '')
        setProjectId(data.project_id || '')
        setProjNum(data.project?.project_number || '')
        setProjName(data.project?.project_name || '')
        setSiteMasterId(data.site_master_id || '')
        const sName = data.site?.site_name || ''
        const jNo   = data.site?.job_no || data.site?.sm_id || ''
        setLocation(sName)
        setJobNo(jNo)
      }
    } catch (err) {
      console.error('[FoodAllowance] loadEmployeeAssignment error:', err)
    } finally {
      setAssignmentLoading(false)
    }
  }

  async function onProject(id, num, name) {
    setProjectId(id); setProjNum(num); setProjName(name)
    setSelectedWorkers([])
    if (!id || !hasTeam) { setSiteWorkers([]); return }
    try { await loadSiteWorkers(id) } catch {}
  }

  async function loadSiteWorkers(pid) {
    const { data } = await supabase
      .from('site_assignments')
      .select('employee_id, employees:employee_id(id, full_name_en, employee_number, employment_type)')
      .eq('project_id', pid)
      .eq('is_active', true)
    const outsourced = (data || [])
      .map(r => r.employees)
      .filter(e => e && e.employment_type === 'OUTSOURCED')
    setSiteWorkers(outsourced)
  }

  async function onTeamToggle(on) {
    setHasTeam(on)
    setSelectedWorkers([])
    if (!on) { setSiteWorkers([]); return }
    if (projectId) {
      try { await loadSiteWorkers(projectId) } catch {}
    }
  }

  function toggleWorker(id) {
    setSelectedWorkers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  function goNext() {
    setError('')
    if (step === 1) {
      if (!empId)   { setError(isAr ? 'يرجى اختيار الموظف' : 'Please select an employee'); return }
      if (!contact) { setError(isAr ? 'رقم الجوال غير موجود' : 'Mobile number missing — update employee profile'); return }
      setStep(2)
    } else if (step === 2) {
      // location is required only in manual override mode (auto-fill always has a value)
      if (manualOverride && !location) { setError(isAr ? 'يرجى إدخال اسم الموقع' : 'Please enter the site location'); return }
      setStep(3)
    } else if (step === 3) {
      if (hasTeam && selectedWorkers.length === 0) {
        setError(isAr ? 'يرجى اختيار موظف واحد على الأقل من الفريق' : 'You toggled team mode — please select at least one outsourced worker, or turn it off')
        return
      }
      setStep(4)
    } else if (step === 4) {
      submit()
    }
  }

  function goBack() { setError(''); setStep(s => s - 1) }

  async function submit() {
    setLoading(true); setError('')

    const { data: existing } = await supabase
      .from('food_allowances').select('id')
      .eq('employee_id', empId).eq('allowance_date', allowDate).maybeSingle()
    if (existing) {
      setError(isAr
        ? `تم تسجيل بدل الطعام لهذا الموظف بتاريخ ${allowDate} مسبقاً`
        : `Food allowance already recorded for ${empName} on ${allowDate}.`)
      setLoading(false); return
    }

    let gLat = null, gLng = null
    try {
      const pos = await new Promise((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }))
      gLat = pos.coords.latitude; gLng = pos.coords.longitude
    } catch {}

    const beneficiaries = mode === 'TEAM'
      ? selectedWorkers.map(wid => {
          const w = siteWorkers.find(x => x.id === wid)
          return { employee_id: wid, name: w?.full_name_en || wid, amount: OUTSOURCE_RATE, ack_status: 'PENDING', ack_at: null }
        })
      : []

    const { data, error: err } = await supabase.from('food_allowances').insert({
      entity_id:       empEntityId || null,
      allowance_date:  allowDate,
      employee_id:     empId,
      department:      dept,
      contact_number:  contact,
      project_id:      projectId || null,
      site_master_id:  siteMasterId || null,
      job_no:          jobNo || null,
      location,
      is_remote:       true,
      single_multiple: mode,
      no_of_persons:   mode === 'SINGLE' ? 1 : selectedWorkers.length,
      daily_rate:      selfRate,
      no_of_days:      1,
      self_rate:       selfRate,
      self_amount:     selfAmount,
      team_amount:     mode === 'TEAM' ? teamAmount : 0,
      total_amount:    totalAmount,
      beneficiaries,
      gps_lat:         gLat,
      gps_lng:         gLng,
      remarks:         remarks || null,
      status:          'SUBMITTED',
    }).select('request_number, id').single()

    if (err) {
      setError(err.code === '23505' ? 'Duplicate record.' : err.message)
      setLoading(false); return
    }

    if (mode === 'TEAM' && beneficiaries.length > 0) {
      const notifs = beneficiaries.map(b => ({
        employee_id:    b.employee_id,
        triggered_by:   empId,
        entity_id:      empEntityId || null,
        type:           'FOOD_ALLOWANCE_RECEIVED',
        title:          'Food Allowance — SAR 20 recorded for you',
        message:        `${empName} recorded SAR ${OUTSOURCE_RATE} food allowance for you on ${allowDate} at ${location}. Please confirm receipt.`,
        amount:         OUTSOURCE_RATE,
        reference_type: 'food_allowance',
        reference_id:   data.id,
        action_url:     `/forms/food-allowance/ack/${data.id}`,
        priority:       'NORMAL',
      }))
      await supabase.from('notifications').insert(notifs)
    }

    setLoading(false)
    setReqNumber(data?.request_number || '—')
    setStep(5)
  }

  function reset() {
    setStep(1); setEmpId(''); setEmpName(''); setEmpNum('')
    setDept(''); setEmpDeptCode(''); setContact(''); setEmpEntityId('')
    setProjectId(''); setProjNum(''); setProjName('')
    setLocation(''); setJobNo(''); setHasTeam(false)
    setEmpFoodRate(null); setSiteWorkers([]); setSelectedWorkers([])
    setRemarks(''); setError('')
    setAllowDate(new Date().toISOString().split('T')[0])
    setSiteMasterId(''); setAssignmentId(''); setManualOverride(false)
  }

  // ─── Auth guard (QR token) ────────────────────────────────────────────────────
  if (!devMode) {
    if (auth.loading) return (
      <div style={{ minHeight:'100vh', background:FT.cream, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:FONT }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>⏳</div>
          <div style={{ fontSize:14, color:FT.mutedLight }}>Checking access…</div>
        </div>
      </div>
    )
    if (auth.error || !auth.employee) return (
      <div style={{ minHeight:'100vh', background:FT.cream, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:FONT }}>
        <div style={{ background:FT.lightCard, borderRadius:20, padding:36, maxWidth:320, textAlign:'center', boxShadow:'0 4px 20px rgba(16,63,52,0.1)', margin:20, border:`1px solid ${FT.border}` }}>
          <div style={{ width:72, height:72, borderRadius:'50%', background:FT.forest, display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 16px' }}>🔒</div>
          <div style={{ fontSize:16, fontWeight:700, color:FT.text, marginBottom:8 }}>Access Required</div>
          <div style={{ fontSize:13, color:FT.mutedLight, lineHeight:1.6 }}>Scan your QR code to submit a food allowance request.</div>
        </div>
      </div>
    )
  }

  // ─── Step meta ────────────────────────────────────────────────────────────────
  const STEP_INFO = {
    1: { en: ['Select employee',    'Choose who this allowance is for'],     ar: ['اختر الموظف',      'اختر من هذا البدل له']            },
    2: { en: ['Date & location',    'Add the work location and project'],    ar: ['التاريخ والموقع',  'أضف موقع العمل والمشروع']         },
    3: { en: ['Allowance & notes',  'Your daily food allowance'],            ar: ['البدل والملاحظات','بدلك اليومي للطعام']             },
    4: { en: ['Review allowance',   'Confirm your request details'],         ar: ['مراجعة الطلب',    'تأكيد تفاصيل طلبك']              },
    5: { en: ['Submitted',          'Your Food Allowance request is recorded'], ar: ['تم الإرسال',   'تم تسجيل طلب بدل الطعام'] },
  }
  const info = STEP_INFO[step] || STEP_INFO[1]
  const [stepTitle, stepSub] = isAr ? [info.ar[0], info.ar[1]] : [info.en[0], info.en[1]]

  const NEXT_LABEL = {
    1: isAr ? 'التالي: التاريخ والموقع' : 'Next: Date & location',
    2: isAr ? 'التالي: البدل'           : 'Next: Allowance',
    3: isAr ? 'التالي: المراجعة'        : 'Next: Review',
    4: isAr ? '✓ إرسال الطلب'          : 'Submit request',
  }

  // ─── Error banner ─────────────────────────────────────────────────────────────
  const errBanner = error ? (
    <div style={{ background:FT.errorBg, border:`1px solid #FFCDD2`, borderRadius:12, padding:'10px 14px', color:FT.error, fontSize:12, margin:'10px 14px 0', lineHeight:1.5, fontFamily:FONT }}>
      ⚠️ {error}
    </div>
  ) : null

  // ─── Header ───────────────────────────────────────────────────────────────────
  const header = (
    <div style={{ background:FT.forest, padding:'0 16px', position:'sticky', top:0, zIndex:10, direction:'ltr', flexShrink:0 }}>
      {/* Top bar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 0 0' }}>
        <span style={{ fontSize:18 }}>🍽️</span>
        <span style={{ color:'#fff', fontSize:13, fontWeight:700, flex:1, letterSpacing:'0.3px', fontFamily:FONT }}>
          {isAr ? 'بدل الطعام' : 'FOOD ALLOWANCE'}
        </span>
        <button onClick={() => setLang(l => l==='en'?'ar':'en')}
          style={{ background:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.9)', border:'1px solid rgba(255,255,255,0.25)', borderRadius:8, padding:'4px 10px', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:FONT }}>
          {isAr ? 'English' : 'عربي'}
        </button>
        <button onClick={() => { auth.logout(); window.location.reload() }}
          title="Sign out"
          style={{ background:'rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.65)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:8, padding:'4px 9px', fontSize:13, cursor:'pointer' }}>
          ⎋
        </button>
      </div>
      {/* Step subtitle */}
      {step < 5 && (
        <div style={{ padding:'8px 0 12px' }}>
          <div style={{ fontSize:15, fontWeight:700, color:'#fff', lineHeight:1.2, fontFamily:FONT }}>{stepTitle}</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.55)', marginTop:2, fontFamily:FONT }}>{stepSub}</div>
        </div>
      )}
    </div>
  )

  // ─── Progress dots ────────────────────────────────────────────────────────────
  const progressBar = step < 5 && (
    <div style={{ background:FT.cream, padding:'10px 16px 0', flexShrink:0 }}>
      <div style={{ background:'#fff', borderRadius:50, padding:'8px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'0 1px 4px rgba(16,63,52,0.1)', border:`1px solid ${FT.border}` }}>
        <span style={{ fontSize:11, fontWeight:700, color:FT.text, fontFamily:FONT }}>
          {isAr ? `خطوة ${step} من 4` : `STEP ${step} OF 4`}
        </span>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{
              width: i === step ? 24 : 8,
              height: 8,
              borderRadius: 50,
              background: i < step ? FT.forest : i === step ? FT.yellow : FT.border,
              border: i === step ? `2px solid ${FT.forest}` : 'none',
              transition: 'all 0.3s',
              boxSizing: 'border-box',
            }} />
          ))}
        </div>
      </div>
    </div>
  )

  // ─── Bottom bar ───────────────────────────────────────────────────────────────
  const bottomBar = (
    <div style={{
      flexShrink: 0,
      background: FT.cream,
      borderTop: `1px solid ${FT.border}`,
      padding: '10px 14px calc(10px + env(safe-area-inset-bottom, 0px)) 14px',
      boxSizing: 'border-box',
    }}>
      {step === 5 ? (
        <button onClick={reset} style={{ width:'100%', height:50, background:FT.forest, color:'#fff', border:'none', borderRadius:14, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:FONT, letterSpacing:'0.3px' }}>
          {isAr ? '+ إرسال طلب آخر' : '+ Submit another'}
        </button>
      ) : (
        <div style={{ display:'flex', gap:8 }}>
          {step > 1 && (
            <button onClick={goBack} style={{ width:'30%', height:50, background:'#fff', color:FT.forest, border:`1.5px solid ${FT.border}`, borderRadius:14, fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:FONT }}>
              {isAr ? 'رجوع' : 'Back'}
            </button>
          )}
          <button onClick={goNext} disabled={loading}
            style={{ flex:1, height:50, background: step===4 ? FT.teal : FT.forest, color:'#fff', border:'none', borderRadius:14, fontSize:14, fontWeight:700, cursor: loading?'not-allowed':'pointer', opacity: loading?0.8:1, fontFamily:FONT, letterSpacing:'0.2px' }}>
            {loading ? (isAr?'جاري الإرسال...':'Submitting…') : NEXT_LABEL[step]}
          </button>
        </div>
      )}
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 1 — Employee info (auto-filled from QR) or selector for DH/PM
  // ═══════════════════════════════════════════════════════════════════════════
  const screen1 = (
    <div style={{ paddingBottom:100 }}>
      {devMode && (
        <div style={{ background:'rgba(255,248,225,0.95)', border:`2px dashed #fb8c00`, borderRadius:12, margin:'12px 14px 0', padding:'10px 14px' }}>
          <div style={{ fontWeight:700, color:'#fb8c00', fontSize:12, fontFamily:FONT }}>🛠️ TESTING MODE</div>
        </div>
      )}
      {errBanner}

      {/* DH/PM/FINANCE: show employee dropdown */}
      {canSelectOther && (
        <div style={{ padding:'14px 14px 0' }}>
          <div style={S.lbl}>{isAr ? 'اختر الموظف' : 'Choose an employee'}</div>
          <select value={empId} onChange={e => onEmp(e.target.value)}
            style={{ ...S.inp, appearance:'none', WebkitAppearance:'none', backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%235B7566' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat:'no-repeat', backgroundPosition:'right 14px center', paddingRight:36 }}>
            <option value="">-- {isAr?'اختر':'Choose'} --</option>
            {employees.filter(e => e.employment_type !== 'OUTSOURCED').map(e =>
              <option key={e.id} value={e.id}>{e.full_name_en} ({e.employee_number})</option>
            )}
          </select>
          <div style={{ fontSize:10, color:FT.mutedLight, marginTop:5, paddingLeft:2, fontFamily:FONT }}>
            {employees.filter(e=>e.employment_type!=='OUTSOURCED').length} {isAr ? 'موظف متاح' : 'employees available'}
          </div>
        </div>
      )}

      {/* Employee details card — shown after selection */}
      {empId && (
        <>
          {/* Avatar + name */}
          <div style={{ ...S.card, marginTop:14, textAlign:'center', padding:'20px 16px' }}>
            <div style={{ width:72, height:72, borderRadius:'50%', background:FT.forest, color:'#fff', fontSize:22, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', fontFamily:FONT, letterSpacing:'1px', boxShadow:`0 4px 12px rgba(16,63,52,0.25)` }}>
              {empName.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)||'??'}
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:FT.text, fontFamily:FONT, lineHeight:1.3 }}>{empName}</div>
            <div style={{ fontSize:12, color:FT.mutedLight, marginTop:4, fontFamily:FONT }}>
              {empNum}{dept ? ` · ${dept}` : ''}
            </div>
          </div>

          {/* Details */}
          <div style={{ ...S.card, marginTop:10 }}>
            <div style={{ marginBottom:12 }}>
              <div style={S.lbl}>📞 {isAr?'الجوال':'Mobile'}</div>
              <div style={{ ...S.roRow, borderColor:!contact?'#FFCDD2':FT.border, background:!contact?'#FFF8F8':'#fff' }}>
                <span style={{ fontSize:12, color:FT.mutedLight }}>🔒</span>
                <span style={{ fontSize:13, color: contact ? FT.text : FT.error, fontFamily:FONT }}>
                  {contact || '⚠ Not on file'}
                </span>
              </div>
            </div>
            <div>
              <div style={S.lbl}>🏢 {isAr?'القسم':'Department'}</div>
              <div style={S.roRow}>
                <span style={{ fontSize:12, color:FT.mutedLight }}>🔒</span>
                <span style={{ fontSize:13, color:FT.text, fontFamily:FONT }}>{dept||'—'}</span>
              </div>
            </div>
          </div>

          {/* Claim period */}
          <div style={{ ...S.card, marginTop:10, display:'flex', gap:12, alignItems:'center' }}>
            <div style={{ width:40, height:40, borderRadius:12, background:FT.tealLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
              📅
            </div>
            <div>
              <div style={{ fontSize:10, color:FT.teal, fontWeight:700, letterSpacing:'0.5px', fontFamily:FONT, textTransform:'uppercase' }}>
                {isAr ? 'فترة الاستحقاق' : 'Claim Period'}
              </div>
              <div style={{ fontSize:13, color:FT.text, marginTop:2, fontWeight:600, fontFamily:FONT }}>
                {isAr ? 'أكتوبر 2026 · 26 سبتمبر – 25 أكتوبر' : 'October 2026 · 26 Sep – 25 Oct'}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Placeholder when nothing selected */}
      {!empId && (
        <div style={{ ...S.card, marginTop:14, textAlign:'center', padding:'32px 20px' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>👤</div>
          <div style={{ fontSize:13, color:FT.mutedLight, fontFamily:FONT, lineHeight:1.6 }}>
            {isAr
              ? 'اختر الموظف لعرض تفاصيله'
              : 'Select an employee to view their mobile, department and claim period.'}
          </div>
        </div>
      )}
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 2 — Date + auto-filled assignment info
  // ═══════════════════════════════════════════════════════════════════════════
  const hasAssignment = !!(assignmentId || projNum || location)

  const screen2 = (
    <div style={{ paddingBottom:100 }}>
      {errBanner}

      {/* Date */}
      <div style={{ ...S.card, marginTop:14 }}>
        <div style={S.lbl}>📅 {isAr?'التاريخ':'Date'}</div>
        <input type="date" value={allowDate} onChange={e=>setAllowDate(e.target.value)} style={S.inp} />
      </div>

      {/* Assignment loading spinner */}
      {assignmentLoading && (
        <div style={{ ...S.card, marginTop:10, textAlign:'center', padding:'20px', color:FT.mutedLight, fontSize:13, fontFamily:FONT }}>
          ⏳ {isAr?'جاري تحميل بيانات الموقع…':'Loading site assignment…'}
        </div>
      )}

      {/* ── Auto-filled assignment info ── */}
      {!assignmentLoading && hasAssignment && !manualOverride && (
        <>
          <div style={{ padding:'14px 14px 6px', fontSize:10, color:FT.teal, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.7px', fontFamily:FONT, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span>📋 {isAr?'بيانات الموقع المعين':'Assigned site details'}</span>
            <span onClick={()=>setManualOverride(true)}
              style={{ fontSize:10, color:FT.mutedLight, cursor:'pointer', textDecoration:'underline', fontWeight:400, letterSpacing:0 }}>
              {isAr?'تغيير يدوي':'Change manually'}
            </span>
          </div>

          {/* Project card */}
          {projNum && (
            <div style={{ margin:'0 14px 8px', background:FT.forest, borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:'rgba(255,255,255,0.12)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>📁</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:9, color:FT.mutedDark, fontWeight:700, letterSpacing:'0.6px', textTransform:'uppercase', fontFamily:FONT }}>
                  {isAr?'المشروع':'Project'}
                </div>
                <div style={{ fontSize:14, fontWeight:700, color:'#fff', fontFamily:FONT, marginTop:2 }}>
                  {projNum}
                </div>
                {projName && <div style={{ fontSize:11, color:'rgba(255,255,255,0.65)', fontFamily:FONT, marginTop:1 }}>{projName}</div>}
              </div>
              <span style={{ color:FT.yellow, fontSize:18 }}>✓</span>
            </div>
          )}

          {/* Site / Location card */}
          <div style={{ margin:'0 14px 8px', background:'#fff', border:`1.5px solid ${FT.border}`, borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:FT.tealLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>📍</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:9, color:FT.teal, fontWeight:700, letterSpacing:'0.6px', textTransform:'uppercase', fontFamily:FONT }}>
                {isAr?'الموقع':'Site / Location'}
              </div>
              <div style={{ fontSize:14, fontWeight:700, color:FT.text, fontFamily:FONT, marginTop:2 }}>
                {location || '—'}
              </div>
              {jobNo && <div style={{ fontSize:11, color:FT.mutedLight, fontFamily:FONT, marginTop:1 }}>Job # {jobNo}</div>}
            </div>
            <span style={{ fontSize:9, background:FT.teal, color:'#fff', borderRadius:6, padding:'3px 7px', fontWeight:700, fontFamily:FONT }}>
              {isAr?'تلقائي':'AUTO'}
            </span>
          </div>
        </>
      )}

      {/* ── No assignment found ── */}
      {!assignmentLoading && !hasAssignment && !manualOverride && (
        <div style={{ ...S.card, marginTop:10 }}>
          <div style={{ textAlign:'center', padding:'10px 0 4px', color:FT.mutedLight, fontSize:13, fontFamily:FONT }}>
            ⚠️ {isAr?'لا يوجد موقع معين لهذا الموظف':'No active site assignment found'}
          </div>
          <button onClick={()=>setManualOverride(true)}
            style={{ width:'100%', marginTop:10, height:42, background:FT.forest, color:'#fff', border:'none', borderRadius:10, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:FONT }}>
            {isAr?'إدخال يدوي':'Enter manually'}
          </button>
        </div>
      )}

      {/* ── Manual override fields ── */}
      {(!assignmentLoading && manualOverride) && (
        <>
          <div style={{ padding:'14px 14px 6px', fontSize:10, color:FT.mutedLight, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.7px', fontFamily:FONT, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span>✏️ {isAr?'إدخال يدوي':'Manual entry'}</span>
            {hasAssignment && (
              <span onClick={()=>setManualOverride(false)}
                style={{ fontSize:10, color:FT.teal, cursor:'pointer', textDecoration:'underline', fontWeight:400, letterSpacing:0 }}>
                {isAr?'استخدام المعين':'Use assigned'}
              </span>
            )}
          </div>

          <div style={{ ...S.card, marginTop:0 }}>
            <div style={S.lbl}>📍 {isAr?'اسم الموقع *':'Site / Location *'}</div>
            <input value={location} onChange={e=>setLocation(e.target.value)}
              placeholder={isAr?'مثال: برج الرياض — المنطقة ب':'e.g. Riyadh Tower Site — Zone B'}
              style={S.inp} />
          </div>

          <div style={{ padding:'10px 14px 6px', fontSize:10, color:FT.mutedLight, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.7px', fontFamily:FONT }}>
            {isAr?'المشروع (اختياري)':'Project (optional)'}
          </div>

          <div style={{ padding:'0 14px' }}>
            <div onClick={() => { setProjectId(''); setProjNum(''); setProjName(''); setSiteWorkers([]); setSelectedWorkers([]) }}
              style={{ background: !projectId ? FT.forest : '#fff', border:`1.5px solid ${!projectId ? FT.forest : FT.border}`, borderRadius:14, padding:'12px 14px', marginBottom:8, cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:10, background: !projectId ? 'rgba(255,255,255,0.15)' : FT.tealLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>🚫</div>
              <span style={{ fontSize:13, fontWeight:600, color:!projectId?'#fff':FT.mutedLight, flex:1, fontFamily:FONT }}>{isAr?'بدون مشروع':'No specific project'}</span>
              {!projectId && <span style={{ color:FT.yellow, fontWeight:900, fontSize:16 }}>✓</span>}
            </div>
            {deptProjects.map(p => {
              const sel = projectId === p.id
              return (
                <div key={p.id} onClick={() => onProject(p.id, p.project_number||'', p.project_name||'')}
                  style={{ background: sel ? FT.forest : '#fff', border:`1.5px solid ${sel ? FT.forest : FT.border}`, borderRadius:14, padding:'12px 14px', marginBottom:8, cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:10, background: sel ? 'rgba(255,255,255,0.15)' : FT.tealLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>📍</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:sel?'#fff':FT.text, fontFamily:FONT }}>[{p.project_number}] {p.project_name}</div>
                    <div style={{ fontSize:11, color:sel?'rgba(255,255,255,0.6)':FT.mutedLight, marginTop:2, fontFamily:FONT }}>{p.dept?.dept_name || empDeptCode}</div>
                  </div>
                  {sel && <span style={{ color:FT.yellow, fontWeight:900, fontSize:16 }}>✓</span>}
                </div>
              )
            })}
          </div>

          <div style={{ ...S.card, marginTop:4 }}>
            <div style={S.lbl}>🔢 {isAr?'رقم العمل (اختياري)':'Job # (optional)'}</div>
            <input value={jobNo} onChange={e=>setJobNo(e.target.value)} placeholder="Optional" style={S.inp} />
          </div>
        </>
      )}
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 3 — Rate + Team toggle + Calc + Notes
  // ═══════════════════════════════════════════════════════════════════════════
  const screen3 = (
    <div style={{ paddingBottom:100 }}>
      {errBanner}

      {/* Daily rate display */}
      <div style={{ margin:'14px 14px 0' }}>
        <div style={{ background:FT.darkCard, borderRadius:16, padding:'18px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:9, color:FT.mutedDark, fontWeight:700, letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:6, fontFamily:FONT }}>
              {isAr?'بدلك اليومي':'Your daily rate'}
            </div>
            <div style={{ fontSize:30, fontWeight:800, color:FT.yellow, fontFamily:FONT, lineHeight:1 }}>
              SAR {selfRate}
            </div>
          </div>
          <div style={{ width:52, height:52, borderRadius:'50%', background:'rgba(231,227,38,0.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24 }}>
            🍽️
          </div>
        </div>
      </div>

      {/* Team toggle */}
      <div style={{ ...S.card, marginTop:12 }}>
        <div onClick={() => onTeamToggle(!hasTeam)}
          style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer' }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:FT.text, fontFamily:FONT }}>
              {isAr?'لدي موظفون خارجيون معي':'Outsourced workers'}
            </div>
            <div style={{ fontSize:10, color:FT.mutedLight, marginTop:2, fontFamily:FONT }}>
              {isAr?'بدل ثابت 20 ريال لكل موظف خارجي':'SAR 20 per worker, separate from salary'}
            </div>
          </div>
          {/* Toggle pill */}
          <div style={{ width:46, height:26, borderRadius:13, background: hasTeam ? FT.teal : FT.border, position:'relative', flexShrink:0, transition:'background 0.2s' }}>
            <div style={{ width:20, height:20, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left: hasTeam ? 23 : 3, transition:'left 0.2s', boxShadow:'0 1px 4px rgba(0,0,0,0.2)' }} />
          </div>
          <span style={{ fontSize:20 }}>{hasTeam ? '👥' : '👤'}</span>
        </div>

        {/* Worker picker */}
        {hasTeam && (
          <div style={{ marginTop:12, borderTop:`1px solid ${FT.border}`, paddingTop:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <span style={{ fontSize:10, color:FT.mutedLight, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', fontFamily:FONT }}>
                {isAr?'اختر الأسماء':'Select workers'}
              </span>
              <span style={{ fontSize:10, color:FT.teal, fontWeight:600, fontFamily:FONT }}>
                {selectedWorkers.length}/{visibleWorkers.length} {isAr?'محدد':'selected'}
              </span>
            </div>
            <div style={{ border:`1px solid ${FT.border}`, borderRadius:12, overflow:'hidden' }}>
              {visibleWorkers.map((w, idx) => {
                const sel = selectedWorkers.includes(w.id)
                return (
                  <div key={w.id} onClick={() => toggleWorker(w.id)}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderBottom: idx < visibleWorkers.length-1 ? `1px solid ${FT.border}` : 'none', cursor:'pointer', background: sel ? FT.tealLight : '#fff', transition:'background 0.15s' }}>
                    <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${sel ? FT.teal : FT.border}`, background: sel ? FT.teal : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s' }}>
                      {sel && <span style={{ color:'#fff', fontSize:11, fontWeight:900 }}>✓</span>}
                    </div>
                    <span style={{ fontSize:13, fontWeight: sel?600:400, color:FT.text, flex:1, fontFamily:FONT }}>{w.full_name_en}</span>
                    {sel && <span style={{ fontSize:11, color:FT.teal, fontWeight:600, fontFamily:FONT }}>SAR {OUTSOURCE_RATE}</span>}
                  </div>
                )
              })}
            </div>
            <div style={{ display:'flex', gap:8, marginTop:8 }}>
              <button type="button" onClick={() => setSelectedWorkers(visibleWorkers.map(w=>w.id))}
                style={{ flex:1, padding:'8px', background:FT.tealLight, border:`1px solid ${FT.teal}`, borderRadius:10, color:FT.teal, fontSize:11, cursor:'pointer', fontWeight:600, fontFamily:FONT }}>
                {isAr?'تحديد الكل':'Select all'}
              </button>
              <button type="button" onClick={() => setSelectedWorkers([])}
                style={{ flex:1, padding:'8px', background:'#fff', border:`1px solid ${FT.border}`, borderRadius:10, color:FT.mutedLight, fontSize:11, cursor:'pointer', fontFamily:FONT }}>
                {isAr?'إلغاء':'Clear'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Auto-calculated display */}
      <div style={{ ...S.card, marginTop:10, background:FT.darkCard, border:'none' }}>
        <div style={{ fontSize:9, color:FT.mutedDark, fontWeight:700, letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:10, fontFamily:FONT }}>
          {isAr?'تلقائي — للقراءة فقط':'Auto-calculated — read only'}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
          <div>
            <div style={{ fontSize:12, color:FT.mutedDark, marginBottom:4, fontFamily:FONT }}>
              {isAr?'بدلي الشخصي':'My allowance'}: SAR {selfRate}
            </div>
            {mode === 'TEAM' && (
              <div style={{ fontSize:12, color:FT.mutedDark, fontFamily:FONT }}>
                {isAr?'الفريق الخارجي':'Outsourced team'}: {selectedWorkers.length} × SAR {OUTSOURCE_RATE} = SAR {teamAmount}
              </div>
            )}
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:10, color:FT.mutedDark, marginBottom:2, fontFamily:FONT }}>{isAr?'الإجمالي':'Total'}</div>
            <div style={{ fontSize:28, fontWeight:800, color:FT.yellow, fontFamily:FONT, lineHeight:1 }}>SAR {totalAmount}</div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div style={{ ...S.card, marginTop:10 }}>
        <div style={S.lbl}>📝 {isAr?'ملاحظات (اختياري)':'Notes (optional)'}</div>
        <textarea value={remarks} onChange={e=>setRemarks(e.target.value)}
          placeholder={isAr?'تفاصيل إضافية...':'Additional details…'}
          style={{ ...S.inp, minHeight:80, resize:'vertical', display:'block' }} />
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 4 — Review
  // ═══════════════════════════════════════════════════════════════════════════
  const screen4 = (
    <div style={{ paddingBottom:100 }}>
      {errBanner}

      {/* Details list */}
      <div style={{ ...S.card, marginTop:14 }}>
        {[
          { icon:'👤', label: isAr?'الموظف':'Employee',   val: empName },
          { icon:'📅', label: isAr?'التاريخ':'Date',       val: new Date(allowDate+'T00:00:00').toLocaleDateString(isAr?'ar-SA':'en-GB', { day:'2-digit', month:'short', year:'numeric' }) },
          { icon:'📍', label: isAr?'الموقع':'Location',    val: location },
          ...(projNum ? [{ icon:'🏗️', label:isAr?'المشروع':'Project', val:`[${projNum}] ${projName}` }] : []),
          { icon:'💵', label: isAr?'بدلي':'My rate',       val: `SAR ${selfRate} / day` },
        ].map((r,i,arr) => (
          <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 0', borderBottom: i<arr.length-1?`1px solid ${FT.border}`:'none' }}>
            <span style={{ fontSize:15, width:20, flexShrink:0, marginTop:1 }}>{r.icon}</span>
            <span style={{ fontSize:10, color:FT.mutedLight, width:80, flexShrink:0, paddingTop:3, textTransform:'uppercase', letterSpacing:'0.4px', fontWeight:700, fontFamily:FONT }}>{r.label}</span>
            <span style={{ fontSize:13, color:FT.text, flex:1, fontWeight:500, fontFamily:FONT }}>{r.val}</span>
          </div>
        ))}
      </div>

      {/* Outsourced team breakdown */}
      {mode === 'TEAM' && selectedWorkers.length > 0 && (
        <div style={{ ...S.card, marginTop:10 }}>
          <div style={{ fontSize:10, color:FT.mutedLight, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10, fontFamily:FONT }}>
            👷 {isAr?'الفريق الخارجي':'Outsourced team'} ({selectedWorkers.length})
          </div>
          {selectedWorkers.map((wid, i) => {
            const w = siteWorkers.find(x => x.id === wid)
            return (
              <div key={wid} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom: i<selectedWorkers.length-1?`1px solid ${FT.border}`:'none' }}>
                <span style={{ fontSize:14 }}>👷</span>
                <span style={{ fontSize:13, color:FT.text, flex:1, fontFamily:FONT }}>{w?.full_name_en}</span>
                <span style={{ fontSize:12, fontWeight:700, color:FT.teal, fontFamily:FONT }}>SAR {OUTSOURCE_RATE}</span>
                <span style={{ fontSize:10, color:FT.mutedLight, background:FT.tealLight, borderRadius:6, padding:'2px 6px', fontFamily:FONT }}>pending</span>
              </div>
            )
          })}
          <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0 0', borderTop:`1px solid ${FT.border}`, marginTop:4 }}>
            <span style={{ fontSize:11, color:FT.mutedLight, fontFamily:FONT }}>{isAr?'إجمالي الفريق':'Team subtotal'}</span>
            <span style={{ fontSize:14, fontWeight:700, color:FT.teal, fontFamily:FONT }}>SAR {teamAmount}</span>
          </div>
        </div>
      )}

      {/* Grand total */}
      <div style={{ margin:'10px 14px 0', background:FT.darkCard, borderRadius:16, padding:'18px 20px' }}>
        <div style={{ fontSize:9, color:FT.mutedDark, fontWeight:700, letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:8, fontFamily:FONT }}>
          {isAr?'الإجمالي الكلي':'Grand total'}
        </div>
        <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between' }}>
          <div style={{ fontSize:11, color:FT.mutedDark, fontFamily:FONT, lineHeight:1.6 }}>
            {mode === 'TEAM'
              ? `SAR ${selfRate} (${isAr?'أنت':'you'}) + ${selectedWorkers.length} × SAR ${OUTSOURCE_RATE} (${isAr?'فريق':'team'})`
              : `SAR ${selfRate} × 1 ${isAr?'يوم':'day'}`}
          </div>
          <div style={{ fontSize:34, fontWeight:800, color:FT.yellow, fontFamily:FONT, lineHeight:1 }}>SAR {totalAmount}</div>
        </div>
        <div style={{ fontSize:11, color:FT.mutedDark, marginTop:6, fontFamily:FONT }}>
          {isAr?'يُضاف إلى مطالبتك — تأكيد من مديرك مطلوب':'Charged to you · Requires DH approval'}
        </div>
        {mode === 'TEAM' && (
          <div style={{ marginTop:10, fontSize:11, color:FT.mutedDark, lineHeight:1.5, borderTop:`1px solid rgba(255,255,255,0.1)`, paddingTop:10, fontFamily:FONT }}>
            📱 {isAr?'سيتلقى كل موظف خارجي إشعاراً لتأكيد الاستلام.':'Each outsourced worker will receive a notification to confirm receipt.'}
          </div>
        )}
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 5 — Success / Confirmation
  // ═══════════════════════════════════════════════════════════════════════════
  const screen5 = (
    <div style={{ paddingBottom:100 }}>
      {/* Success circle */}
      <div style={{ textAlign:'center', padding:'32px 20px 24px' }}>
        <div style={{ width:88, height:88, borderRadius:'50%', background:FT.darkCard, border:`4px solid ${FT.yellow}`, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', boxShadow:`0 8px 24px rgba(16,63,52,0.25)` }}>
          <span style={{ fontSize:36, color:FT.yellow }}>✓</span>
        </div>
        <div style={{ fontSize:20, fontWeight:800, color:FT.text, fontFamily:FONT, marginBottom:4 }}>
          {isAr?'تم الإرسال!':'Request submitted'}
        </div>
        <div style={{ fontSize:12, color:FT.mutedLight, fontFamily:FONT, marginBottom:8 }}>
          {isAr?'رقم الطلب':'Request number'}
        </div>
        <div style={{ display:'inline-block', background:FT.darkCard, borderRadius:12, padding:'8px 20px' }}>
          <span style={{ fontSize:16, fontWeight:800, color:FT.yellow, letterSpacing:'1.5px', fontFamily:FONT }}>{reqNumber}</span>
        </div>
      </div>

      {/* Notifications sent */}
      {mode === 'TEAM' && selectedWorkers.length > 0 && (
        <div style={{ ...S.card }}>
          <div style={{ fontSize:10, fontWeight:700, color:FT.mutedLight, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10, fontFamily:FONT }}>
            📱 {isAr?'إشعارات أُرسلت إلى:':'Notifications sent to:'}
          </div>
          {selectedWorkers.map((wid, idx) => {
            const w = siteWorkers.find(x => x.id === wid)
            return (
              <div key={wid} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom: idx<selectedWorkers.length-1?`1px solid ${FT.border}`:'none' }}>
                <span style={{ fontSize:14 }}>📤</span>
                <span style={{ fontSize:13, color:FT.text, flex:1, fontFamily:FONT }}>{w?.full_name_en}</span>
                <span style={{ fontSize:10, background:FT.yellowLight, color:'#7a6a00', borderRadius:6, padding:'2px 6px', fontWeight:700, fontFamily:FONT }}>⏳ PENDING</span>
              </div>
            )
          })}
          <div style={{ fontSize:11, color:FT.mutedLight, marginTop:10, lineHeight:1.6, fontFamily:FONT }}>
            {isAr
              ? 'سيقوم كل موظف بتأكيد الاستلام عبر رمز QR. لن تُعالَج المطالبة إلا بعد تأكيد الجميع.'
              : 'Each worker confirms via their QR login. Finance will not process until all confirmations are received.'}
          </div>
        </div>
      )}

      {/* Next steps */}
      <div style={{ ...S.card, marginTop:10 }}>
        <div style={{ fontSize:10, fontWeight:700, color:FT.mutedLight, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:14, fontFamily:FONT }}>
          {isAr?'الخطوات التالية':'What happens next'}
        </div>
        {(isAr
          ? ['مديرك يراجع الطلب ويعتمده', 'الموظفون الخارجيون يؤكدون الاستلام', 'تُضاف إلى مطالبة الراتب القادمة']
          : ['Your DH reviews and approves', 'Outsourced workers confirm receipt', 'Added to your next salary claim']
        ).map((s, i) => (
          <div key={i} style={{ display:'flex', gap:12, marginBottom: i<2?12:0, alignItems:'flex-start' }}>
            <div style={{ width:26, height:26, borderRadius:'50%', background:FT.forest, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0, fontFamily:FONT }}>
              {i+1}
            </div>
            <span style={{ fontSize:13, color:FT.text, lineHeight:1.5, paddingTop:3, fontFamily:FONT }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  )

  // ─── Main render ──────────────────────────────────────────────────────────────
  return (
    <div style={{
      maxWidth: 480,
      margin: '0 auto',
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: FONT,
      direction: isAr ? 'rtl' : 'ltr',
      background: FT.cream,
    }}>
      {header}
      {progressBar}
      <div style={{ flex:1, overflowY:'auto', overflowX:'hidden' }}>
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
