/**
 * OVERTIME REQUEST FORM  — /forms/overtime
 * Mobile-first 5-screen wizard  (Type A: Pure Fields)
 *
 * DESIGN: Slide images in /public/design/overtime/ are the background.
 * To change the design — swap the JPEG. No code changes needed.
 *
 * OT Multipliers:  NORMAL / FRIDAY / HOLIDAY → 1.5x   TRAVEL → 1.0x
 * Formula: basic_salary ÷ 30 ÷ 8 × hours × multiplier
 * Duplicate guard: one entry per (employee, date, project)
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { THEMES } from './formTheme'
import { OT_THEME as TH } from '../styles/mobileFormTheme'

const T = THEMES.overtime
// shorthand — TH.headerBg is #000000
const BLACK = '#000000'

// ── Slide background images (swap these to change the design) ──────────────
const BG = {
  1: '/design/overtime/screen-01-identity.jpg',
  2: '/design/overtime/screen-02-project.jpg',
  3: '/design/overtime/screen-03-work.jpg',
  4: '/design/overtime/screen-04-review.jpg',
  5: '/design/overtime/screen-05-success.jpg',
}

const OT_TYPES = [
  { value:'NORMAL',  label:'Normal OT',      labelAr:'إضافي عادي',    mult:1.5, tag:'×1.5' },
  { value:'FRIDAY',  label:'Friday',         labelAr:'يوم الجمعة',    mult:1.5, tag:'×1.5' },
  { value:'HOLIDAY', label:'Public Holiday', labelAr:'عطلة رسمية',    mult:1.5, tag:'×1.5' },
  { value:'TRAVEL',  label:'Travel Day',     labelAr:'يوم سفر',       mult:1.0, tag:'×1.0' },
]

const devMode     = new URLSearchParams(window.location.search).get('dev') === '1' ||
                    localStorage.getItem('accsys_dev_mode') === '1'
const previewMode = new URLSearchParams(window.location.search).get('preview') === '1'

const PREVIEW = {
  empId:'preview-emp-1', empName:'Ahmed Mohammed Al-Rashidi', empNum:'EMP-0042',
  dept:'Network Integration Services Unit', empDeptCode:'NISU',
  contact:'+966 55 123 4567', empBasic:4500,
  projects:[
    { id:'p1', project_number:'P-NISU-2026', project_name:'Nokia Tower Commissioning',    dept:{ dept_name:'Network Integration Services Unit' } },
    { id:'p2', project_number:'P-NISU-2025', project_name:'NISU General Support 2026',    dept:{ dept_name:'Network Integration Services Unit' } },
    { id:'p3', project_number:'P-TISU-2026', project_name:'Telecom Infrastructure Phase 2', dept:{ dept_name:'Telecom Infrastructure' } },
  ],
  projectId:'p1', projNum:'P-NISU-2026', projName:'Nokia Tower Commissioning',
  otDate:'2026-10-08', jobNo:'JOB-2026-112',
  otType:'NORMAL', fromTime:'18:00', toTime:'21:30',
  remarks:'Tower section B antenna alignment and signal testing',
  reqNumber:'OT-2026-0187',
}

// ─── Shared styles ──────────────────────────────────────────────────────────
const S = {
  card: {
    background: TH.card,
    borderRadius: 14,
    margin: '8px 12px 0',
    padding: '14px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    border: `1px solid ${TH.cardBorder}`,
  },
  cardWhite: {
    background: '#ffffff',
    borderRadius: 14,
    margin: '8px 12px 0',
    padding: '14px 16px',
    boxShadow: '0 1px 6px rgba(0,0,0,0.15)',
  },
  inp: {
    width:'100%', padding:'11px 13px',
    background:'#ffffff', border:'1.5px solid #e0dbd0',
    borderRadius:10, fontSize:14, color: TH.text,
    boxSizing:'border-box', fontFamily:'inherit',
  },
  lbl: {
    fontSize:10, color: TH.muted, fontWeight:700,
    textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:5,
  },
  sectionTitle: (dark) => ({
    padding:'10px 12px 4px',
    fontSize:10,
    color: dark ? TH.muteLight : TH.muted,
    fontWeight:700,
    textTransform:'uppercase',
    letterSpacing:'0.5px',
  }),
  roRow: {
    display:'flex', alignItems:'center', gap:8,
    padding:'10px 12px', background: TH.ro,
    border:`1.5px dashed ${TH.roBorder}`,
    borderRadius:10, minHeight:40, boxSizing:'border-box',
  },
}

export default function FormOvertime() {

  const [step,       setStep]       = useState(1)
  const [session,    setSession]    = useState(null)
  const [employees,  setEmployees]  = useState([])
  const [projects,   setProjects]   = useState([])
  const [deptMap,    setDeptMap]    = useState({})
  const [lang,       setLang]       = useState('en')
  const isAr = lang === 'ar'
  const isDark = step === 3

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
  // Screen 2
  const [otDate,    setOtDate]    = useState(new Date().toISOString().split('T')[0])
  const [projectId, setProjectId] = useState('')
  const [projNum,   setProjNum]   = useState('')
  const [projName,  setProjName]  = useState('')
  const [jobNo,     setJobNo]     = useState('')
  // Screen 3
  const [otType,   setOtType]   = useState('NORMAL')
  const [fromTime, setFromTime] = useState('')
  const [toTime,   setToTime]   = useState('')
  const [remarks,  setRemarks]  = useState('')
  // Submit
  const [loading,   setLoading]   = useState(false)
  const [reqNumber, setReqNumber] = useState('')
  const [error,     setError]     = useState('')

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
        const code = p.dept?.dept_code || p.dept?.dept_name
          || deptMap[p.department_id]?.dept_code
          || deptMap[p.department_id]?.dept_name || ''
        return code.toUpperCase() === empDeptCode.toUpperCase()
      })
    : projects

  // Preview mode — inject dummy data
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

  // Load data
  useEffect(() => {
    if (previewMode) return
    if (devMode) { loadData(null); return }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) loadData(session)
    })
  }, [])

  async function loadData(session) {
    let entityId = null
    if (!devMode && session?.user?.id) {
      const { data: prof } = await supabase
        .from('user_profiles').select('entity_id').eq('id', session.user.id).single()
      entityId = prof?.entity_id || null
    }
    const empQ = devMode
      ? supabase.rpc('get_dev_employees')
      : supabase.from('employees')
          .select('id,full_name_en,employee_number,department_id,phone,basic_salary,entity_id,is_active')
          .eq('is_active', true).order('full_name_en')
    const projQ = supabase.from('projects')
      .select('id,project_number,project_name,department_id,dept:department_id(dept_code,dept_name)')
      .in('status', ['OPEN','ACTIVE']).order('project_number')
    if (entityId && !devMode) projQ.eq('entity_id', entityId)
    const deptQ = supabase.from('departments').select('id,dept_name,dept_code').eq('is_active', true)
    const [{ data: emps }, { data: projs }, { data: depts }] = await Promise.all([empQ, projQ, deptQ])
    setEmployees(emps || [])
    setProjects(projs || [])
    setDeptMap(Object.fromEntries((depts || []).map(d => [d.id, d])))
  }

  async function onEmp(id) {
    setEmpId(id)
    const e = employees.find(x => x.id === id)
    if (!e) return
    const d = deptMap[e.department_id] || {}
    const code = d.dept_code || d.dept_name || ''
    setEmpName(e.full_name_en || ''); setEmpNum(e.employee_number || '')
    setDept(d.dept_name || code);     setEmpDeptCode(code)
    setEmpDeptId(e.department_id || ''); setContact(e.phone || '')
    setEmpEntityId(e.entity_id || '')
    setProjectId(''); setProjNum(''); setProjName('')
    let basic = e.basic_salary || 0
    if (!basic) {
      const { data: emp } = await supabase.from('employees').select('basic_salary').eq('id', id).single()
      basic = emp?.basic_salary || 0
    }
    setEmpBasic(basic)
  }

  function goNext() {
    setError('')
    if (step === 1) {
      if (!empId)   { setError(isAr ? 'يرجى اختيار الموظف أولاً' : 'Please select an employee first'); return }
      if (!contact) { setError(isAr ? 'رقم الجوال غير موجود' : 'Mobile number missing — update employee profile first'); return }
      setStep(2)
    } else if (step === 2) {
      if (!projectId) { setError(isAr ? 'يرجى اختيار المشروع' : 'Please select a project'); return }
      setStep(3)
    } else if (step === 3) {
      if (!fromTime || !toTime) { setError(isAr ? 'يرجى تحديد الأوقات' : 'Start and end time required'); return }
      if (totalHours <= 0)      { setError(isAr ? 'وقت النهاية يجب أن يكون بعد البداية' : 'End time must be after start time'); return }
      setStep(4)
    } else if (step === 4) {
      submit()
    }
  }

  function goBack() { setError(''); setStep(s => s - 1) }

  async function submit() {
    if (previewMode) { setReqNumber(PREVIEW.reqNumber); setStep(5); return }
    setLoading(true); setError('')
    const { data: existing } = await supabase
      .from('overtime_requests').select('id')
      .eq('employee_id', empId).eq('ot_date', otDate).eq('project_id', projectId).maybeSingle()
    if (existing) {
      setError(isAr ? `تم تسجيل وقت إضافي لهذا الموظف مسبقاً بتاريخ ${otDate}` : `Overtime already recorded for ${empName} on ${otDate}.`)
      setLoading(false); return
    }
    let gLat = null, gLng = null
    try {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }))
      gLat = pos.coords.latitude; gLng = pos.coords.longitude
    } catch {}
    const { data, error: err } = await supabase.from('overtime_requests').insert({
      entity_id: empEntityId||null, ot_date: otDate, employee_id: empId,
      department: dept, contact_number: contact, project_id: projectId||null,
      project_number: projNum||null, job_number: jobNo||null,
      ot_type: otType, from_time: fromTime, to_time: toTime,
      hours: totalHours, ot_rate: parseFloat(otRate.toFixed(4)),
      multiplier, total_amount: parseFloat(otAmount.toFixed(2)),
      gps_lat: gLat, gps_lng: gLng, remarks: remarks||null, status:'SUBMITTED',
    }).select('request_number').single()
    setLoading(false)
    if (err) { setError(err.code === '23505' ? 'Duplicate: overtime already exists.' : err.message); return }
    setReqNumber(data?.request_number || '—')
    setStep(5)
  }

  function reset() {
    setStep(1); setEmpId(''); setEmpName(''); setEmpNum(''); setEmpBasic(0)
    setDept(''); setEmpDeptCode(''); setEmpDeptId(''); setContact('')
    setEmpEntityId(''); setProjectId(''); setProjNum(''); setProjName('')
    setJobNo(''); setOtType('NORMAL'); setFromTime(''); setToTime('')
    setRemarks(''); setError('')
    setOtDate(new Date().toISOString().split('T')[0])
  }

  // ─── Login gate ─────────────────────────────────────────────────────────────
  if (!session && !devMode && !previewMode) return (
    <div style={{ minHeight:'100vh', background: TH.pageBg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', padding:40 }}>
        <div style={{ fontSize:44, marginBottom:12 }}>🔐</div>
        <div style={{ fontSize:16, fontWeight:700, color: TH.text, marginBottom:8 }}>Sign in required</div>
        <div style={{ fontSize:13, color: TH.sub }}>Open the Ratal Group app, sign in, then return to this link.</div>
      </div>
    </div>
  )

  // ─── Error banner ───────────────────────────────────────────────────────────
  const errBanner = error ? (
    <div style={{ background:'#fff0f0', border:'1px solid #ffcdd2', borderRadius:10, padding:'9px 12px', color: TH.error, fontSize:12, margin:'8px 12px 0', lineHeight:1.5 }}>
      ⚠️ {error}
    </div>
  ) : null

  // ─── Header (overlays the slide's drawn header) ─────────────────────────────
  const header = (
    <div style={{ background: TH.headerBg, padding:'12px 16px', display:'flex', alignItems:'center', gap:10, position:'sticky', top:0, zIndex:10, direction:'ltr' }}>
      <span style={{ fontSize:18 }}>⏱️</span>
      <span style={{ color:'#fff', fontSize:14, fontWeight:700, flex:1, letterSpacing:'0.3px' }}>
        {isAr ? 'طلب وقت إضافي' : 'OVERTIME REQUEST'}
      </span>
      <button onClick={() => setLang(l => l==='en'?'ar':'en')}
        style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'3px 9px', fontSize:11, fontWeight:600, cursor:'pointer' }}>
        {isAr ? 'English' : 'العربية'}
      </button>
    </div>
  )

  // ─── Progress pill (overlays the slide's drawn white pill) ─────────────────
  const progressPill = step < 5 && step !== 3 && (
    <div style={{ background:'#ffffff', borderRadius:50, margin:'10px 14px 0', padding:'9px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'0 1px 5px rgba(0,0,0,0.08)' }}>
      <span style={{ fontSize:12, fontWeight:700, color: TH.text }}>
        {isAr ? `خطوة ${step} من 4` : `Step ${step} of 4`}
      </span>
      <div style={{ display:'flex', gap:5 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ width: i===step?20:8, height:8, borderRadius:50, background: i<step ? BLACK : i===step ? BLACK : '#ddd', transition:'all 0.3s' }} />
        ))}
      </div>
    </div>
  )

  // ─── Bottom buttons — NO fixed positioning, part of flex column layout ───────
  const nextBg    = step===4 ? TH.btnSubmit : isDark ? TH.btnNextDark : TH.btnNext
  const nextColor = step===4 ? '#fff'       : isDark ? TH.btnNextDarkText : '#fff'

  const bottomBar = (
    <div style={{
      flexShrink: 0,
      background: isDark ? TH.pageDark : TH.pageBg,
      borderTop: `1px solid ${isDark ? '#222' : TH.cardBorder}`,
      padding: '8px 12px 12px',
      boxSizing: 'border-box',
    }}>
      {step === 5 ? (
        <button onClick={reset}
          style={{ width:'100%', height: TH.btnHeight, background: BLACK, color:'#fff',
            border:'none', borderRadius: TH.btnRadius, fontSize:14, fontWeight:800,
            cursor:'pointer', letterSpacing:'0.5px' }}>
          {isAr ? '+ إرسال طلب آخر' : '+ SUBMIT ANOTHER'}
        </button>
      ) : (
        <div style={{ display:'flex', gap:8 }}>
          {step > 1 && (
            <button onClick={goBack} type="button"
              style={{ width:'34%', height: TH.btnHeight, background: TH.btnBack, color:'#fff',
                border:'none', borderRadius: TH.btnRadius, fontSize:14, fontWeight:800,
                cursor:'pointer', letterSpacing:'0.5px' }}>
              {isAr ? 'رجوع' : 'BACK'}
            </button>
          )}
          <button onClick={goNext} type="button" disabled={loading}
            style={{ flex:1, height: TH.btnHeight, background: nextBg, color: nextColor,
              border:'none', borderRadius: TH.btnRadius, fontSize:14, fontWeight:800,
              cursor: loading?'not-allowed':'pointer', opacity: loading?0.8:1, letterSpacing:'0.5px' }}>
            {loading ? (isAr?'جاري الإرسال...':'Submitting...') : step===4 ? (isAr?'✓ إرسال':'✓ SUBMIT') : (isAr?'التالي':'NEXT')}
          </button>
        </div>
      )}
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 1 — Identity
  // ═══════════════════════════════════════════════════════════════════════════
  const screen1 = (
    <div style={{ paddingBottom:16 }}>
      {devMode && !previewMode && (
        <div style={{ background:'rgba(255,248,225,0.95)', border:'2px dashed #fb8c00', borderRadius:10, margin:'10px 12px 0', padding:'9px 14px' }}>
          <div style={{ fontWeight:700, color:'#fb8c00', fontSize:12 }}>🛠️ TESTING MODE — select any employee</div>
        </div>
      )}
      {errBanner}

      <div style={S.sectionTitle(false)}>{isAr ? 'من أنت؟' : 'Select employee'}</div>
      <div style={{ margin:'0 12px' }}>
        <select value={empId} onChange={e => onEmp(e.target.value)} style={{ ...S.inp, fontSize:13 }}>
          <option value="">-- {isAr?'اختر الموظف':'Choose from list'} --</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.full_name_en} ({e.employee_number})</option>)}
        </select>
      </div>

      {empId && (
        <>
          {/* Avatar card */}
          <div style={{ ...S.card, marginTop:14, textAlign:'center' }}>
            <div style={{ width:68, height:68, borderRadius:'50%', background: TH.headerBg, color:'#fff', fontSize:22, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 10px' }}>
              {empName.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2) || '??'}
            </div>
            <div style={{ fontSize:16, fontWeight:700, color: TH.text }}>{empName}</div>
            <div style={{ fontSize:12, color: TH.sub, marginTop:3 }}>{empNum} · {dept||'—'}</div>
            <div style={{ fontSize:11, color: TH.muted, marginTop:2 }}>RATAL GROUP</div>
          </div>

          {/* Info card */}
          <div style={S.card}>
            <div style={{ marginBottom:10 }}>
              <div style={S.lbl}>📞 {isAr?'الجوال':'Mobile'}</div>
              <div style={{ ...S.roRow, borderColor:!contact?'#ffcdd2': TH.roBorder, background:!contact?'#fff8f8': TH.ro }}>
                <span style={{ fontSize:11, color: TH.muted }}>🔒</span>
                <span style={{ fontSize:13, color: contact ? TH.sub : TH.error }}>
                  {contact || (isAr?'⚠ غير موجود':'⚠ Not on file — update Employee DB first')}
                </span>
              </div>
            </div>
            <div>
              <div style={S.lbl}>🏢 {isAr?'القسم':'Department'}</div>
              <div style={S.roRow}>
                <span style={{ fontSize:11, color: TH.muted }}>🔒</span>
                <span style={{ fontSize:13, color: TH.sub }}>{dept||'—'}</span>
              </div>
            </div>
          </div>

          {/* Claim period */}
          <div style={{ ...S.card, display:'flex', gap:10, alignItems:'center' }}>
            <span style={{ fontSize:18 }}>📅</span>
            <div>
              <div style={{ fontSize:10, color: TH.amberDeep, fontWeight:700, letterSpacing:'0.4px' }}>CLAIM PERIOD</div>
              <div style={{ fontSize:12, color: TH.sub, marginTop:1 }}>October 2026 · 26 Sep – 25 Oct</div>
            </div>
          </div>
        </>
      )}

      <div style={{ textAlign:'center', fontSize:10, color: TH.muted, padding:'14px 12px 0' }}>
        {isAr?'سيتم إرسال إشعار تيليجرام عند الإرسال':'Telegram notification sent on submission'}
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 2 — Project + Date
  // ═══════════════════════════════════════════════════════════════════════════
  const screen2 = (
    <div style={{ paddingBottom:16 }}>
      {errBanner}
      <div style={S.sectionTitle(false)}>{isAr?'اختر المشروع':'Select project site'}</div>

      {deptProjects.length === 0 ? (
        <div style={S.card}>
          <div style={{ textAlign:'center', color: TH.muted, fontSize:13, padding:'8px 0' }}>
            {isAr?'لا توجد مشاريع نشطة':'No active projects found for this department'}
          </div>
        </div>
      ) : (
        <div style={{ margin:'0 12px' }}>
          {deptProjects.map(p => {
            const sel = projectId === p.id
            const deptLabel = p.dept?.dept_name || deptMap[p.department_id]?.dept_name || empDeptCode
            return (
              <div key={p.id}
                onClick={() => { setProjectId(p.id); setProjNum(p.project_number||''); setProjName(p.project_name||''); setError('') }}
                style={{ background: sel ? TH.headerBg : TH.card, border:`1px solid ${sel ? TH.headerBg : TH.cardBorder}`, borderRadius:14, padding:'12px 14px', marginBottom:8, cursor:'pointer', display:'flex', alignItems:'center', gap:10, boxShadow: sel?'0 2px 8px rgba(0,0,0,0.15)':'0 1px 3px rgba(0,0,0,0.05)' }}>
                <span style={{ fontSize:18 }}>📍</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color: sel?'#fff': TH.text }}>[{p.project_number}] {p.project_name}</div>
                  <div style={{ fontSize:11, color: sel?'rgba(255,255,255,0.65)': TH.muted }}>{deptLabel}</div>
                </div>
                {sel && <span style={{ color:'#fff', fontWeight:700, fontSize:16 }}>✓</span>}
              </div>
            )
          })}
        </div>
      )}

      <div style={S.card}>
        <div style={S.lbl}>📅 {isAr?'تاريخ الوقت الإضافي':'Date of overtime'}</div>
        <input type="date" value={otDate} onChange={e=>setOtDate(e.target.value)} style={S.inp} />
      </div>

      <div style={S.card}>
        <div style={S.lbl}>🔢 {isAr?'رقم العمل (اختياري)':'Job number (optional)'}</div>
        <input value={jobNo} onChange={e=>setJobNo(e.target.value)} placeholder={isAr?'اختياري':'Optional'} style={S.inp} />
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 3 — Work Details (dark background)
  // ═══════════════════════════════════════════════════════════════════════════
  const screen3 = (
    <div style={{ paddingBottom:16 }}>
      {error && (
        <div style={{ background:'#1a0000', border:'1px solid #c62828', borderRadius:10, padding:'9px 12px', color:'#ef9a9a', fontSize:12, margin:'8px 12px 0' }}>
          ⚠️ {error}
        </div>
      )}

      <div style={S.sectionTitle(true)}>⏱️ {isAr?'نوع الوقت الإضافي':'Overtime type'}</div>
      <div style={S.cardWhite}>
        <div style={{ display:'flex', flexWrap:'wrap', gap:7 }}>
          {OT_TYPES.map(t => {
            const sel = otType === t.value
            return (
              <button key={t.value} type="button" onClick={() => setOtType(t.value)}
                style={{ padding:'9px 15px', borderRadius:22, border:'none', background: sel ? BLACK : '#f0f0f0', color: sel?'#fff': TH.sub, fontSize:12, fontWeight: sel?700:500, cursor:'pointer' }}>
                {isAr?t.labelAr:t.label} <span style={{ opacity:0.7, fontSize:10, marginLeft:3 }}>{t.tag}</span>
              </button>
            )
          })}
        </div>
        <div style={{ marginTop:8, fontSize:11, color: TH.muted }}>
          {isAr?'جميع الأنواع ×1.5 ما عدا يوم السفر (×1.0)':'All types ×1.5 — Travel days only ×1.0'}
        </div>
      </div>

      <div style={S.sectionTitle(true)}>🕐 {isAr?'أوقات العمل':'Work times'}</div>
      {/* Amber wrapper — matches the slide's golden card */}
      <div style={{ background: TH.amber, borderRadius:14, margin:'0 12px', padding:14, boxShadow:'0 2px 8px rgba(245,158,11,0.3)' }}>
        <div style={{ display:'flex', gap:10, marginBottom:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, color:'#7c3a00', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:5 }}>{isAr?'وقت البداية':'Start time'}</div>
            <input type="time" value={fromTime} onChange={e=>setFromTime(e.target.value)} style={{ ...S.inp, fontSize:18, fontWeight:700, border:'none' }} />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, color:'#7c3a00', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:5 }}>{isAr?'وقت النهاية':'End time'}</div>
            <input type="time" value={toTime} onChange={e=>setToTime(e.target.value)} style={{ ...S.inp, fontSize:18, fontWeight:700, border:'none' }} />
          </div>
        </div>
        {/* Black calc display */}
        <div style={{ background: BLACK, borderRadius:12, padding:'14px 16px' }}>
          {totalHours > 0 ? (
            <>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.45)', fontWeight:700, letterSpacing:'0.8px', marginBottom:8 }}>AUTO-CALCULATED — READ ONLY</div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:34, fontWeight:800, color:'#fff', lineHeight:1 }}>{totalHours} <span style={{ fontSize:16, fontWeight:600 }}>hrs</span></div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)', marginTop:4 }}>SAR {hourlyBase.toFixed(2)}/hr × {multiplier}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)', marginBottom:2 }}>{isAr?'مبلغ الإضافي':'OT Amount'}</div>
                  <div style={{ fontSize:24, fontWeight:800, color: TH.amber }}>SAR {otAmount.toFixed(2)}</div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign:'center', color:'rgba(255,255,255,0.3)', fontSize:12, padding:'8px 0' }}>
              {isAr?'أدخل الأوقات لحساب المبلغ':'Enter times to calculate'}
            </div>
          )}
        </div>
      </div>

      <div style={S.sectionTitle(true)}>📝 {isAr?'ملاحظات (اختيارية)':'Notes (optional)'}</div>
      <div style={{ margin:'0 12px' }}>
        <textarea value={remarks} onChange={e=>setRemarks(e.target.value)}
          placeholder={isAr?'تفاصيل إضافية...':'e.g. Tower section B commissioning'}
          style={{ ...S.inp, minHeight:80, resize:'vertical', display:'block' }} />
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 4 — Review
  // ═══════════════════════════════════════════════════════════════════════════
  const otTypeLabel = OT_TYPES.find(t=>t.value===otType)?.[isAr?'labelAr':'label'] || otType
  const reviewRows = [
    { icon:'👤', label:isAr?'الموظف':'Employee',    val:empName },
    { icon:'🆔', label:isAr?'رقم الموظف':'Emp ID',  val:empNum },
    { icon:'📍', label:isAr?'المشروع':'Project',    val:`[${projNum}] ${projName}` },
    { icon:'📅', label:isAr?'التاريخ':'Date',       val:otDate },
    { icon:'⏱️', label:isAr?'نوع الإضافي':'OT Type',val:otTypeLabel },
    { icon:'🕐', label:isAr?'الأوقات':'Times',      val:`${fromTime} → ${toTime}` },
    { icon:'⌛', label:isAr?'الساعات':'Hours',      val:`${totalHours} hrs`, hi:true },
    { icon:'💰', label:isAr?'المبلغ':'OT Amount',   val:`SAR ${otAmount.toFixed(2)}`, hi:true },
    ...(remarks ? [{ icon:'📝', label:isAr?'ملاحظات':'Notes', val:remarks }] : []),
  ]

  const screen4 = (
    <div style={{ paddingBottom:16 }}>
      {errBanner}
      <div style={S.sectionTitle(false)}>{isAr?'تأكيد التفاصيل':'Confirm your details'}</div>
      <div style={S.card}>
        {reviewRows.map((r,i) => (
          <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'8px 0', borderBottom: i<reviewRows.length-1?`1px solid ${TH.cardBorder}`:'none' }}>
            <span style={{ fontSize:14, width:18, flexShrink:0 }}>{r.icon}</span>
            <span style={{ fontSize:10, color: TH.muted, width:76, flexShrink:0, paddingTop:2 }}>{r.label}</span>
            <span style={{ fontSize:13, color: r.hi ? TH.green : TH.text, fontWeight: r.hi?700:400, flex:1 }}>{r.val}</span>
          </div>
        ))}
      </div>
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-start' }}>
        <span style={{ fontSize:15 }}>📱</span>
        <div style={{ fontSize:11, color: TH.sub, lineHeight:1.5 }}>
          {isAr?'سيتم إرسال إشعار تيليجرام لمديرك المباشر وإدارة الحسابات.':'Your line manager and Finance team will be notified via Telegram.'}
        </div>
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 5 — Success
  // ═══════════════════════════════════════════════════════════════════════════
  const screen5 = (
    <div style={{ textAlign:'center', paddingBottom:16 }}>
      <div style={{ padding:'32px 0 8px' }}>
        <div style={{ width:80, height:80, borderRadius:'50%', background: TH.peach, border:`3px solid ${TH.navy}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:30, margin:'0 auto' }}>✓</div>
      </div>
      <div style={{ fontSize:20, fontWeight:800, color: TH.text, marginTop:12, marginBottom:4 }}>{isAr?'تم الإرسال بنجاح!':'Submitted!'}</div>
      <div style={{ fontSize:13, color: TH.sub, marginBottom:2 }}>{isAr?'رقم الطلب':'Request No.'}</div>
      <div style={{ fontSize:16, fontWeight:800, color: BLACK, marginBottom:24, letterSpacing:'1px' }}>{reqNumber}</div>

      <div style={{ ...S.card, textAlign:'left' }}>
        <div style={{ fontSize:11, color: TH.muted, textAlign:'center', marginBottom:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>
          {isAr?'ماذا يحدث بعد ذلك؟':'What happens next?'}
        </div>
        {(isAr
          ? ['مديرك يراجع الطلب ويوافق عليه','الحسابات تحسب مبلغ الوقت الإضافي','يُضاف إلى مطالبة الراتب القادمة']
          : ['Your DH reviews and approves the request','Finance calculates the OT payment amount','Payment added to your next salary claim period']
        ).map((s,i) => (
          <div key={i} style={{ display:'flex', gap:10, marginBottom: i<2?10:0, alignItems:'flex-start' }}>
            <div style={{ width:22, height:22, borderRadius:'50%', background: BLACK, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>{i+1}</div>
            <span style={{ fontSize:12, color: TH.sub, lineHeight:1.5, paddingTop:2 }}>{s}</span>
          </div>
        ))}
      </div>

      <div style={{ padding:'12px 0 4px', textAlign:'center' }}>
        <div style={{ fontSize:11, color: TH.muted, letterSpacing:'0.5px' }}>
          {isAr?'تم إرسال إشعار تيليجرام إلى مديرك':'Telegram notification sent to your DH'}
        </div>
      </div>
    </div>
  )

  // ─── Main render ────────────────────────────────────────────────────────────
  return (
    <div style={{
      maxWidth: 480,
      margin: '0 auto',
      height: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: 'system-ui,-apple-system,Arial,sans-serif',
      direction: isAr ? 'rtl' : 'ltr',
      background: isDark ? TH.pageDark : TH.pageBg,
    }}>
      {/* Header — fixed height, never scrolls */}
      {header}
      {/* Progress pill — fixed height */}
      {progressPill}
      {/* Scrollable content area */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {step === 1 && screen1}
        {step === 2 && screen2}
        {step === 3 && screen3}
        {step === 4 && screen4}
        {step === 5 && screen5}
      </div>
      {/* Buttons — always at bottom inside flex column */}
      {bottomBar}
    </div>
  )
}
