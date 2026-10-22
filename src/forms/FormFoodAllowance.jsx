/**
 * FOOD ALLOWANCE FORM  — /forms/food-allowance
 * Mobile-first 5-screen wizard
 *
 * MODES:
 *   SINGLE — Ratal employee claims for themselves only (1 day, selectable rate)
 *   TEAM   — Ratal employee + outsourced workers from same site assignment
 *            Outsourced rate is fixed SAR 20/day, 1 day only
 *
 * On submit (TEAM mode):
 *   - ONE record under Abdul Hakim: self_amount + team_amount = total_amount
 *   - beneficiaries JSONB stores each outsourced worker with ack_status PENDING
 *   - Notification fired to each outsourced worker → they confirm via QR login
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ── Theme ────────────────────────────────────────────────────────────────────
const TH = {
  headerBg:   '#880e4f',
  pageBg:     '#fdf6f9',
  pageDark:   '#1a0010',
  card:       '#fff',
  cardBorder: '#f0dce8',
  ro:         '#fdf0f5',
  roBorder:   '#e8c4d8',
  text:       '#1a0a12',
  sub:        '#4a2038',
  muted:      '#9e6080',
  muteLight:  'rgba(255,255,255,0.55)',
  error:      '#c62828',
  green:      '#2e7d32',
  pink:       '#fce4ec',
  btnBack:    '#6d4c61',
  btnSubmit:  '#2e7d32',
  btnH:       48,
  btnR:       12,
}

const OUTSOURCE_RATE = 20

const DEV_WORKERS = [
  { id:'dev-1', full_name_en:'Ahmed Al-Rashidi',  employee_number:'EXT-001' },
  { id:'dev-2', full_name_en:'Mohammed Al-Ghamdi', employee_number:'EXT-002' },
  { id:'dev-3', full_name_en:'Khalid Al-Otaibi',  employee_number:'EXT-003' },
  { id:'dev-4', full_name_en:'Faisal Al-Shehri',  employee_number:'EXT-004' },
  { id:'dev-5', full_name_en:'Omar Al-Zahrani',   employee_number:'EXT-005' },
]

const devMode     = new URLSearchParams(window.location.search).get('dev') === '1' ||
                    localStorage.getItem('accsys_dev_mode') === '1'
const previewMode = new URLSearchParams(window.location.search).get('preview') === '1'

// ── Shared styles ────────────────────────────────────────────────────────────
const S = {
  card: {
    background:TH.card, borderRadius:14, margin:'8px 12px 0',
    padding:'14px 16px', boxShadow:'0 1px 4px rgba(0,0,0,0.08)',
    border:`1px solid ${TH.cardBorder}`,
  },
  inp: {
    width:'100%', padding:'11px 13px', background:'#fff',
    border:'1.5px solid #e0dbd0', borderRadius:10, fontSize:14,
    color:TH.text, boxSizing:'border-box', fontFamily:'inherit',
  },
  lbl: {
    fontSize:10, color:TH.muted, fontWeight:700,
    textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:5,
  },
  secTitle: (dark) => ({
    padding:'10px 12px 4px', fontSize:10,
    color: dark ? TH.muteLight : TH.muted,
    fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px',
  }),
  roRow: {
    display:'flex', alignItems:'center', gap:8, padding:'10px 12px',
    background:TH.ro, border:`1.5px dashed ${TH.roBorder}`,
    borderRadius:10, minHeight:40, boxSizing:'border-box',
  },
}

export default function FormFoodAllowance() {
  const [step,      setStep]      = useState(1)
  const [session,   setSession]   = useState(null)
  const [employees, setEmployees] = useState([])  // all active employees
  const [projects,  setProjects]  = useState([])
  const [deptMap,   setDeptMap]   = useState({})
  const [lang,      setLang]      = useState('en')
  const isAr  = lang === 'ar'
  const isDark = step === 3

  // Screen 1 — Who is submitting
  const [empId,        setEmpId]        = useState('')
  const [empName,      setEmpName]      = useState('')
  const [empNum,       setEmpNum]       = useState('')
  const [empEntityId,  setEmpEntityId]  = useState('')
  const [dept,         setDept]         = useState('')
  const [empDeptCode,  setEmpDeptCode]  = useState('')
  const [contact,      setContact]      = useState('')
  const [empFoodRate,  setEmpFoodRate]  = useState(null) // from employee record

  // Screen 2 — Project + date + location
  const [allowDate,  setAllowDate]  = useState(new Date().toISOString().split('T')[0])
  const [projectId,  setProjectId]  = useState('')
  const [projNum,    setProjNum]    = useState('')
  const [projName,   setProjName]   = useState('')
  const [location,   setLocation]   = useState('')
  const [jobNo,      setJobNo]      = useState('')

  // Screen 3 — optional team toggle
  const [hasTeam,         setHasTeam]         = useState(false)
  const [siteWorkers,     setSiteWorkers]      = useState([])
  const [selectedWorkers, setSelectedWorkers]  = useState([])
  const [remarks,         setRemarks]          = useState('')

  // Submit
  const [loading,   setLoading]   = useState(false)
  const [reqNumber, setReqNumber] = useState('')
  const [error,     setError]     = useState('')

  // Derived — must come AFTER all useState declarations
  const mode       = hasTeam && selectedWorkers.length > 0 ? 'TEAM' : 'SINGLE'
  const selfRate   = empFoodRate ?? 30          // from employee record, fallback 30
  const selfAmount = selfRate                   // 1 day always
  const teamAmount = selectedWorkers.length * OUTSOURCE_RATE
  const totalAmount = selfAmount + (hasTeam ? teamAmount : 0)
  // Workers shown: real site assignments, or DEV_WORKERS as fallback for testing
  const visibleWorkers = siteWorkers.length > 0 ? siteWorkers : DEV_WORKERS

  // Dept-filtered projects
  const deptProjects = empDeptCode
    ? projects.filter(p => {
        const code = p.dept?.dept_code || p.dept?.dept_name
          || deptMap[p.department_id]?.dept_code
          || deptMap[p.department_id]?.dept_name || ''
        return code.toUpperCase() === empDeptCode.toUpperCase()
      })
    : projects

  // Load on mount
  useEffect(() => {
    if (previewMode) {
      setSession({ user: { id: 'preview' } })
      setEmployees([
        { id:'prev-1', full_name_en:'Abdul Hakim Ibrahim',  employee_number:'RAT-001', department_id:'d1', phone:'+966501234567', entity_id:'e1', employment_type:'RATAL', is_active:true, fa_eligible:true, fa_amount:30 },
        { id:'prev-2', full_name_en:'Mohammed Al-Zahrani',  employee_number:'RAT-002', department_id:'d1', phone:'+966502345678', entity_id:'e1', employment_type:'RATAL', is_active:true, fa_eligible:true, fa_amount:30 },
        { id:'prev-3', full_name_en:'Khalid Al-Ghamdi',     employee_number:'RAT-003', department_id:'d1', phone:'+966503456789', entity_id:'e1', employment_type:'RATAL', is_active:true, fa_eligible:true, fa_amount:50 },
      ])
      setDeptMap({ d1: { dept_name:'Field Operations', dept_code:'FO' } })
      return
    }
    if (devMode) { loadData(null); return }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); if (session) loadData(session)
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
          .select('id,full_name_en,employee_number,department_id,phone,entity_id,employment_type,is_active,fa_eligible,fa_amount')
          .eq('is_active', true).order('full_name_en')
    const projQ = supabase.from('projects')
      .select('id,project_number,project_name,department_id,dept:department_id(dept_code,dept_name)')
      .in('status', ['OPEN','ACTIVE']).order('project_number')
    if (entityId && !devMode) projQ.eq('entity_id', entityId)
    const deptQ = supabase.from('departments').select('id,dept_name,dept_code').eq('is_active', true)
    const [empRes, projRes, deptRes] = await Promise.all([empQ, projQ, deptQ])
    if (empRes.error) console.error('[FoodAllowance] employees error:', empRes.error)
    setEmployees(empRes.data || [])
    setProjects(projRes.data || [])
    setDeptMap(Object.fromEntries((deptRes.data || []).map(d => [d.id, d])))
  }

  function onEmp(id) {
    setEmpId(id)
    const e = employees.find(x => x.id === id)
    if (!e) return
    const d = deptMap[e.department_id] || {}
    const code = d.dept_code || d.dept_name || ''
    setEmpName(e.full_name_en || '');  setEmpNum(e.employee_number || '')
    setDept(d.dept_code || d.dept_name || '');   setEmpDeptCode(code)
    setContact(e.phone || '');         setEmpEntityId(e.entity_id || '')
    // Rate from employee record — fa_amount column (set in Employees wizard → Compliance step)
    setEmpFoodRate(e.fa_amount && e.fa_amount > 0 ? Number(e.fa_amount) : 30)
    setProjectId(''); setProjNum(''); setProjName('')
    setSiteWorkers([]); setSelectedWorkers([])
  }

  // When project changes — if team toggle is on, refresh workers
  async function onProject(id, num, name) {
    setProjectId(id); setProjNum(num); setProjName(name)
    setSelectedWorkers([])
    if (!id || !hasTeam) { setSiteWorkers([]); return }
    try { await loadSiteWorkers(id) } catch {}
  }

  async function loadSiteWorkers(pid) {
    // site_assignments for this project → join employees → filter OUTSOURCED only
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

  // When team toggle switches on — load site workers if project already selected
  async function onTeamToggle(on) {
    setHasTeam(on)
    setSelectedWorkers([])
    if (!on) { setSiteWorkers([]); return }
    if (projectId) {
      try { await loadSiteWorkers(projectId) } catch {}
    }
    // In dev mode, DEV_WORKERS are always shown via visibleWorkers (no fetch needed)
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
      if (!location) { setError(isAr ? 'يرجى إدخال اسم الموقع' : 'Please enter the site location'); return }
      setStep(3)
    } else if (step === 3) {
      if (hasTeam && selectedWorkers.length === 0) {
        setError(isAr ? 'يرجى اختيار موظف واحد على الأقل من الفريق' : 'You toggled team mode — please select at least one outsourced worker, or turn it off'); return
      }
      setStep(4)
    } else if (step === 4) {
      submit()
    }
  }

  function goBack() { setError(''); setStep(s => s - 1) }

  async function submit() {
    if (previewMode) { setReqNumber('FA-2026-0055'); setStep(5); return }
    setLoading(true); setError('')

    // Duplicate guard — one submission per employee per date
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

    // Build beneficiaries list
    const beneficiaries = mode === 'TEAM'
      ? selectedWorkers.map(wid => {
          const w = siteWorkers.find(x => x.id === wid)
          return { employee_id: wid, name: w?.full_name_en || wid, amount: OUTSOURCE_RATE, ack_status: 'PENDING', ack_at: null }
        })
      : []

    const { data, error: err } = await supabase.from('food_allowances').insert({
      entity_id:     empEntityId || null,
      allowance_date: allowDate,
      employee_id:   empId,
      department:    dept,
      contact_number: contact,
      project_id:    projectId || null,
      job_no:        jobNo || null,
      location,
      is_remote:     true,
      single_multiple: mode,
      no_of_persons: mode === 'SINGLE' ? 1 : selectedWorkers.length,
      daily_rate:    selfRate,
      no_of_days:    1,
      self_rate:     selfRate,
      self_amount:   selfAmount,
      team_amount:   mode === 'TEAM' ? teamAmount : 0,
      total_amount:  totalAmount,
      beneficiaries,
      gps_lat:       gLat,
      gps_lng:       gLng,
      remarks:       remarks || null,
      status:        'SUBMITTED',
    }).select('request_number, id').single()

    if (err) {
      setError(err.code === '23505' ? 'Duplicate record.' : err.message)
      setLoading(false); return
    }

    // Fire notifications to each outsourced worker
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
  }

  // ─── Login gate ──────────────────────────────────────────────────────────────
  if (!session && !devMode && !previewMode) return (
    <div style={{ minHeight:'100vh', background:TH.pageBg, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', padding:40 }}>
        <div style={{ fontSize:44, marginBottom:12 }}>🔐</div>
        <div style={{ fontSize:16, fontWeight:700, color:TH.text, marginBottom:8 }}>Sign in required</div>
        <div style={{ fontSize:13, color:TH.sub }}>Open the Ratal Group app, sign in, then return to this link.</div>
      </div>
    </div>
  )

  const errBanner = error ? (
    <div style={{ background: isDark?'#1a0010':'#fff0f0', border:`1px solid ${isDark?'#c62828':'#ffcdd2'}`, borderRadius:10, padding:'9px 12px', color: isDark?'#ef9a9a':TH.error, fontSize:12, margin:'8px 12px 0', lineHeight:1.5 }}>
      ⚠️ {error}
    </div>
  ) : null

  // ─── Header ──────────────────────────────────────────────────────────────────
  const header = (
    <div style={{ background:TH.headerBg, padding:'12px 16px', display:'flex', alignItems:'center', gap:10, position:'sticky', top:0, zIndex:10, direction:'ltr' }}>
      <span style={{ fontSize:18 }}>🍽️</span>
      <span style={{ color:'#fff', fontSize:14, fontWeight:700, flex:1, letterSpacing:'0.3px' }}>
        {isAr ? 'طلب بدل الطعام' : 'FOOD ALLOWANCE'}
      </span>
      <button onClick={() => setLang(l => l==='en'?'ar':'en')}
        style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, padding:'3px 9px', fontSize:11, fontWeight:600, cursor:'pointer' }}>
        {isAr ? 'English' : 'العربية'}
      </button>
      <button onClick={async () => { await supabase.auth.signOut(); window.location.reload() }}
        title="Sign out"
        style={{ background:'rgba(255,255,255,0.12)', color:'rgba(255,255,255,0.75)', border:'1px solid rgba(255,255,255,0.2)', borderRadius:6, padding:'3px 8px', fontSize:13, cursor:'pointer' }}>
        ⎋
      </button>
    </div>
  )

  const progressPill = step < 5 && step !== 3 && (
    <div style={{ background:'#fff', borderRadius:50, margin:'10px 14px 0', padding:'9px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', boxShadow:'0 1px 5px rgba(0,0,0,0.08)' }}>
      <span style={{ fontSize:12, fontWeight:700, color:TH.text }}>{isAr ? `خطوة ${step} من 4` : `Step ${step} of 4`}</span>
      <div style={{ display:'flex', gap:5 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ width:i===step?20:8, height:8, borderRadius:50, background: i<=step ? TH.headerBg : '#ddd', transition:'all 0.3s' }} />
        ))}
      </div>
    </div>
  )

  const bottomBar = (
    <div style={{ flexShrink:0, background: isDark ? TH.pageDark : TH.pageBg, borderTop:`1px solid ${isDark?'#2a0020':TH.cardBorder}`, padding:'8px 12px 12px', boxSizing:'border-box' }}>
      {step === 5 ? (
        <button onClick={reset} style={{ width:'100%', height:TH.btnH, background:TH.headerBg, color:'#fff', border:'none', borderRadius:TH.btnR, fontSize:14, fontWeight:800, cursor:'pointer' }}>
          {isAr ? '+ إرسال طلب آخر' : '+ SUBMIT ANOTHER'}
        </button>
      ) : (
        <div style={{ display:'flex', gap:8 }}>
          {step > 1 && (
            <button onClick={goBack} style={{ width:'34%', height:TH.btnH, background:TH.btnBack, color:'#fff', border:'none', borderRadius:TH.btnR, fontSize:14, fontWeight:800, cursor:'pointer' }}>
              {isAr ? 'رجوع' : 'BACK'}
            </button>
          )}
          <button onClick={goNext} disabled={loading}
            style={{ flex:1, height:TH.btnH, background: step===4 ? TH.btnSubmit : TH.headerBg, color:'#fff', border:'none', borderRadius:TH.btnR, fontSize:14, fontWeight:800, cursor: loading?'not-allowed':'pointer', opacity: loading?0.8:1 }}>
            {loading ? (isAr?'جاري الإرسال...':'Submitting...') : step===4 ? (isAr?'✓ إرسال':'✓ SUBMIT') : (isAr?'التالي':'NEXT')}
          </button>
        </div>
      )}
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 1 — Employee
  // ═══════════════════════════════════════════════════════════════════════════
  const screen1 = (
    <div style={{ paddingBottom:16 }}>
      {devMode && <div style={{ background:'rgba(255,248,225,0.95)', border:'2px dashed #fb8c00', borderRadius:10, margin:'10px 12px 0', padding:'9px 14px' }}><div style={{ fontWeight:700, color:'#fb8c00', fontSize:12 }}>🛠️ TESTING MODE</div></div>}
      {errBanner}
      <div style={S.secTitle(false)}>{isAr ? 'اختر الموظف' : 'Select employee'}</div>
      <div style={{ margin:'0 12px' }}>
        <select value={empId} onChange={e => onEmp(e.target.value)} style={{ ...S.inp, fontSize:13 }}>
          <option value="">-- {isAr?'اختر':'Choose'} --</option>
          {employees.filter(e => e.employment_type !== 'OUTSOURCED').map(e =>
            <option key={e.id} value={e.id}>{e.full_name_en} ({e.employee_number})</option>
          )}
        </select>
        <div style={{ fontSize:10, color: employees.length===0 ? '#c62828' : TH.muted, marginTop:5, paddingLeft:4 }}>
          {employees.length === 0
            ? '⚠ No employees loaded — check Supabase RLS or is_active flag'
            : `${employees.filter(e=>e.employment_type!=='OUTSOURCED').length} employees available`}
        </div>
      </div>
      {empId && (
        <>
          <div style={{ ...S.card, marginTop:14, textAlign:'center' }}>
            <div style={{ width:68, height:68, borderRadius:'50%', background:TH.headerBg, color:'#fff', fontSize:22, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 10px' }}>
              {empName.split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2)||'??'}
            </div>
            <div style={{ fontSize:16, fontWeight:700, color:TH.text }}>{empName}</div>
            <div style={{ fontSize:12, color:TH.sub, marginTop:3 }}>{empNum} · {dept||'—'}</div>
          </div>
          <div style={S.card}>
            <div style={{ marginBottom:10 }}>
              <div style={S.lbl}>📞 {isAr?'الجوال':'Mobile'}</div>
              <div style={{ ...S.roRow, borderColor:!contact?'#ffcdd2':TH.roBorder, background:!contact?'#fff8f8':TH.ro }}>
                <span style={{ fontSize:11, color:TH.muted }}>🔒</span>
                <span style={{ fontSize:13, color: contact ? TH.sub : TH.error }}>{contact || '⚠ Not on file'}</span>
              </div>
            </div>
            <div>
              <div style={S.lbl}>🏢 {isAr?'القسم':'Department'}</div>
              <div style={S.roRow}>
                <span style={{ fontSize:11, color:TH.muted }}>🔒</span>
                <span style={{ fontSize:13, color:TH.sub }}>{dept||'—'}</span>
              </div>
            </div>
          </div>
          <div style={{ ...S.card, display:'flex', gap:10, alignItems:'center' }}>
            <span style={{ fontSize:18 }}>📅</span>
            <div>
              <div style={{ fontSize:10, color:TH.headerBg, fontWeight:700, letterSpacing:'0.4px' }}>CLAIM PERIOD</div>
              <div style={{ fontSize:12, color:TH.sub, marginTop:1 }}>October 2026 · 26 Sep – 25 Oct</div>
            </div>
          </div>
        </>
      )}
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 2 — Project + Date + Location
  // ═══════════════════════════════════════════════════════════════════════════
  const screen2 = (
    <div style={{ paddingBottom:16 }}>
      {errBanner}
      <div style={S.secTitle(false)}>{isAr?'التاريخ والموقع':'Date & Location'}</div>
      <div style={S.card}>
        <div style={S.lbl}>📅 {isAr?'التاريخ':'Date'}</div>
        <input type="date" value={allowDate} onChange={e=>setAllowDate(e.target.value)} style={S.inp} />
      </div>
      <div style={S.card}>
        <div style={S.lbl}>📍 {isAr?'اسم الموقع *':'Site / Location *'}</div>
        <input value={location} onChange={e=>setLocation(e.target.value)}
          placeholder={isAr?'مثال: موقع برج الرياض':'e.g. Riyadh Tower Site — Zone B'} style={S.inp} />
        <div style={{ fontSize:10, color:TH.muted, marginTop:6 }}>
          ⚠️ {isAr?'للمواقع النائية فقط':'Remote sites only'}
        </div>
      </div>

      <div style={S.secTitle(false)}>{isAr?'المشروع (اختياري)':'Project (optional)'}</div>
      <div style={{ margin:'0 12px' }}>
        {/* No project option */}
        <div onClick={() => { setProjectId(''); setProjNum(''); setProjName(''); setSiteWorkers([]); setSelectedWorkers([]) }}
          style={{ background:!projectId?TH.headerBg:TH.card, border:`1px solid ${!projectId?TH.headerBg:TH.cardBorder}`, borderRadius:14, padding:'10px 14px', marginBottom:8, cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}>
          <span>🚫</span>
          <span style={{ fontSize:13, fontWeight:600, color:!projectId?'#fff':TH.sub, flex:1 }}>{isAr?'بدون مشروع':'No specific project'}</span>
          {!projectId && <span style={{ color:'#fff', fontWeight:700 }}>✓</span>}
        </div>
        {deptProjects.map(p => {
          const sel = projectId === p.id
          return (
            <div key={p.id}
              onClick={() => onProject(p.id, p.project_number||'', p.project_name||'')}
              style={{ background:sel?TH.headerBg:TH.card, border:`1px solid ${sel?TH.headerBg:TH.cardBorder}`, borderRadius:14, padding:'12px 14px', marginBottom:8, cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:18 }}>📍</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:sel?'#fff':TH.text }}>[{p.project_number}] {p.project_name}</div>
                <div style={{ fontSize:11, color:sel?'rgba(255,255,255,0.65)':TH.muted }}>{p.dept?.dept_name || empDeptCode}</div>
              </div>
              {sel && <span style={{ color:'#fff', fontWeight:700, fontSize:16 }}>✓</span>}
            </div>
          )
        })}
      </div>

      <div style={S.card}>
        <div style={S.lbl}>🔢 {isAr?'رقم العمل (اختياري)':'Job # (optional)'}</div>
        <input value={jobNo} onChange={e=>setJobNo(e.target.value)} placeholder="Optional" style={S.inp} />
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 3 — Rate selection (primary) + optional team toggle
  // ═══════════════════════════════════════════════════════════════════════════
  const screen3 = (
    <div style={{ paddingBottom:16 }}>
      {error && <div style={{ background:'#1a0010', border:'1px solid #c62828', borderRadius:10, padding:'9px 12px', color:'#ef9a9a', fontSize:12, margin:'8px 12px 0' }}>⚠️ {error}</div>}

      {/* ── PRIMARY: Rate pill — small centered ─────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'center', margin:'8px 12px 0' }}>
        <div style={{ background:TH.pink, borderRadius:12, padding:6, boxShadow:'0 2px 6px rgba(136,14,79,0.2)' }}>
          <div style={{ background:'#1a0010', borderRadius:8, padding:'8px 24px', textAlign:'center' }}>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.45)', fontWeight:700, letterSpacing:'0.8px', marginBottom:4 }}>
              {isAr?'بدلك اليومي':'YOUR DAILY RATE'}
            </div>
            <div style={{ fontSize:22, fontWeight:900, color:'#ff80ab' }}>SAR {selfRate}</div>
          </div>
        </div>
      </div>

      {/* ── SECONDARY: Team toggle ────────────────────────────────────────── */}
      <div style={{ margin:'14px 12px 0' }}>
        <div onClick={() => onTeamToggle(!hasTeam)}
          style={{ display:'flex', alignItems:'center', gap:14, background: hasTeam?'rgba(255,255,255,0.1)':'rgba(255,255,255,0.04)', border:`1.5px solid ${hasTeam?'rgba(255,255,255,0.3)':'rgba(255,255,255,0.1)'}`, borderRadius:14, padding:'13px 16px', cursor:'pointer' }}>
          {/* Toggle pill */}
          <div style={{ width:44, height:24, borderRadius:12, background: hasTeam?TH.headerBg:'rgba(255,255,255,0.15)', position:'relative', flexShrink:0, transition:'background 0.2s' }}>
            <div style={{ width:18, height:18, borderRadius:'50%', background:'#fff', position:'absolute', top:3, left: hasTeam?23:3, transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)' }} />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>
              {isAr?'لدي موظفون خارجيون معي':'I have outsourced workers with me'}
            </div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', marginTop:2 }}>
              {isAr?'بدل ثابت 20 ريال لكل موظف خارجي':'Fixed SAR 20 per outsourced worker — from site assignment'}
            </div>
          </div>
          <span style={{ fontSize:18 }}>{hasTeam ? '👥' : '👤'}</span>
        </div>
      </div>

      {/* ── Worker picker — only when toggle is ON ───────────────────────── */}
      {hasTeam && (
        <div style={{ margin:'10px 12px 0' }}>
          {false ? null : (
            <div style={{ background:'rgba(255,255,255,0.05)', borderRadius:14, overflow:'hidden', border:'1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ padding:'9px 14px 6px', fontSize:10, color:'rgba(255,255,255,0.4)', fontWeight:700, letterSpacing:'0.5px', textTransform:'uppercase', display:'flex', justifyContent:'space-between' }}>
                <span>{isAr?'اختر الأسماء (اسم فقط)':'Names only — checkbox'}</span>
                <span>{selectedWorkers.length} / {visibleWorkers.length} {isAr?'محدد':'selected'}</span>
              </div>
              {visibleWorkers.map((w) => {
                const sel = selectedWorkers.includes(w.id)
                return (
                  <div key={w.id} onClick={() => toggleWorker(w.id)}
                    style={{ display:'flex', alignItems:'center', gap:12, padding:'13px 16px', borderTop:'1px solid rgba(255,255,255,0.07)', cursor:'pointer', background: sel?'rgba(255,255,255,0.09)':'transparent' }}>
                    <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${sel?'#ff80ab':'rgba(255,255,255,0.25)'}`, background: sel?'#880e4f':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      {sel && <span style={{ color:'#fff', fontSize:12, fontWeight:900 }}>✓</span>}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight: sel?700:400, color: sel?'#fff':'rgba(255,255,255,0.8)' }}>{w.full_name_en}</div>
                    </div>
                    {sel && <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>SAR {OUTSOURCE_RATE}</div>}
                  </div>
                )
              })}
              <div style={{ display:'flex', gap:8, padding:'8px 14px 10px', borderTop:'1px solid rgba(255,255,255,0.07)' }}>
                <button type="button" onClick={() => setSelectedWorkers(visibleWorkers.map(w=>w.id))}
                  style={{ flex:1, padding:'7px', background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:8, color:'rgba(255,255,255,0.75)', fontSize:11, cursor:'pointer' }}>
                  {isAr?'تحديد الكل':'Select all'}
                </button>
                <button type="button" onClick={() => setSelectedWorkers([])}
                  style={{ flex:1, padding:'7px', background:'transparent', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'rgba(255,255,255,0.35)', fontSize:11, cursor:'pointer' }}>
                  {isAr?'إلغاء':'Clear'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Calc display */}
      <div style={{ background:TH.pink, borderRadius:14, margin:'10px 12px 0', padding:14, boxShadow:'0 2px 8px rgba(136,14,79,0.2)' }}>
        <div style={{ background:'#1a0010', borderRadius:12, padding:'14px 16px' }}>
          <div style={{ fontSize:9, color:'rgba(255,255,255,0.45)', fontWeight:700, letterSpacing:'0.8px', marginBottom:10 }}>AUTO-CALCULATED — READ ONLY</div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>
                {isAr?'بدلي الشخصي':'My allowance'}: SAR {selfRate}
              </div>
              {mode === 'TEAM' && (
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:4 }}>
                  {isAr?'الفريق الخارجي':'Outsourced team'}: {selectedWorkers.length} × SAR {OUTSOURCE_RATE} = SAR {teamAmount}
                </div>
              )}
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)', marginBottom:2 }}>{isAr?'الإجمالي':'Total'}</div>
              <div style={{ fontSize:28, fontWeight:800, color:'#ff80ab' }}>SAR {totalAmount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Remarks */}
      <div style={S.secTitle(true)}>📝 {isAr?'ملاحظات':'Notes (optional)'}</div>
      <div style={{ margin:'0 12px' }}>
        <textarea value={remarks} onChange={e=>setRemarks(e.target.value)}
          placeholder={isAr?'تفاصيل إضافية...':'Additional details...'}
          style={{ ...S.inp, minHeight:70, resize:'vertical', display:'block' }} />
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 4 — Review
  // ═══════════════════════════════════════════════════════════════════════════
  const screen4 = (
    <div style={{ paddingBottom:16 }}>
      {errBanner}
      <div style={S.secTitle(false)}>{isAr?'تأكيد التفاصيل':'Confirm details'}</div>
      <div style={S.card}>
        {[
          { icon:'👤', label:isAr?'الموظف':'Employee',   val: empName },
          { icon:'📅', label:isAr?'التاريخ':'Date',       val: allowDate },
          { icon:'📍', label:isAr?'الموقع':'Location',    val: location },
          ...(projNum ? [{ icon:'🏗️', label:isAr?'المشروع':'Project', val:`[${projNum}] ${projName}` }] : []),
          { icon:'💵', label:isAr?'بدلي':'My rate',      val: `SAR ${selfRate} / day` },
        ].map((r,i,arr) => (
          <div key={i} style={{ display:'flex', alignItems:'flex-start', gap:8, padding:'8px 0', borderBottom: i<arr.length-1?`1px solid ${TH.cardBorder}`:'none' }}>
            <span style={{ fontSize:14, width:18, flexShrink:0 }}>{r.icon}</span>
            <span style={{ fontSize:10, color:TH.muted, width:76, flexShrink:0, paddingTop:2 }}>{r.label}</span>
            <span style={{ fontSize:13, color:TH.text, flex:1 }}>{r.val}</span>
          </div>
        ))}
      </div>

      {/* Outsourced team breakdown */}
      {mode === 'TEAM' && selectedWorkers.length > 0 && (
        <>
          <div style={S.secTitle(false)}>👷 {isAr?'الفريق الخارجي':'Outsourced team'} ({selectedWorkers.length})</div>
          <div style={S.card}>
            {selectedWorkers.map((wid, i) => {
              const w = siteWorkers.find(x => x.id === wid)
              return (
                <div key={wid} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderBottom: i<selectedWorkers.length-1?`1px solid ${TH.cardBorder}`:'none' }}>
                  <span style={{ fontSize:14 }}>👷</span>
                  <span style={{ fontSize:13, color:TH.text, flex:1 }}>{w?.full_name_en}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:TH.headerBg }}>SAR {OUTSOURCE_RATE}</span>
                  <span style={{ fontSize:10, color:TH.muted }}>⏳ pending ack</span>
                </div>
              )
            })}
            <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0 0', borderTop:`1px solid ${TH.cardBorder}`, marginTop:4 }}>
              <span style={{ fontSize:11, color:TH.muted }}>{isAr?'إجمالي الفريق':'Team subtotal'}</span>
              <span style={{ fontSize:14, fontWeight:700, color:TH.headerBg }}>SAR {teamAmount}</span>
            </div>
          </div>
        </>
      )}

      {/* Grand total */}
      <div style={{ ...S.card, background: '#f8f0f5', border:`2px solid ${TH.headerBg}` }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:11, color:TH.muted, marginBottom:2 }}>{isAr?'الإجمالي الكلي (يُضاف لك)':'Grand total — charged to you'}</div>
            <div style={{ fontSize:10, color:TH.muted }}>
              {mode==='TEAM'
                ? `SAR ${selfRate} (you) + ${selectedWorkers.length} × SAR ${OUTSOURCE_RATE} (team)`
                : `SAR ${selfRate} (1 day)`}
            </div>
          </div>
          <div style={{ fontSize:28, fontWeight:800, color: TH.headerBg }}>SAR {totalAmount}</div>
        </div>
        {mode === 'TEAM' && (
          <div style={{ marginTop:10, fontSize:11, color:TH.muted, lineHeight:1.5, borderTop:`1px solid ${TH.cardBorder}`, paddingTop:8 }}>
            📱 {isAr?'سيتلقى كل موظف خارجي إشعاراً لتأكيد استلام البدل.':'Each outsourced worker will receive a notification to confirm receipt.'}
          </div>
        )}
      </div>
    </div>
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // SCREEN 5 — Success
  // ═══════════════════════════════════════════════════════════════════════════
  const screen5 = (
    <div style={{ textAlign:'center', paddingBottom:16 }}>
      <div style={{ padding:'32px 0 8px' }}>
        <div style={{ width:80, height:80, borderRadius:'50%', background:TH.pink, border:`3px solid ${TH.headerBg}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:30, margin:'0 auto' }}>✓</div>
      </div>
      <div style={{ fontSize:20, fontWeight:800, color:TH.text, marginTop:12, marginBottom:4 }}>{isAr?'تم الإرسال!':'Submitted!'}</div>
      <div style={{ fontSize:13, color:TH.sub, marginBottom:2 }}>{isAr?'رقم الطلب':'Request No.'}</div>
      <div style={{ fontSize:16, fontWeight:800, color:TH.headerBg, marginBottom:20, letterSpacing:'1px' }}>{reqNumber}</div>

      {mode === 'TEAM' && selectedWorkers.length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize:11, fontWeight:700, color:TH.muted, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10 }}>
            📱 {isAr?'إشعارات أُرسلت إلى:':'Notifications sent to:'}
          </div>
          {selectedWorkers.map(wid => {
            const w = siteWorkers.find(x => x.id === wid)
            return (
              <div key={wid} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 0', borderBottom:`1px solid ${TH.cardBorder}` }}>
                <span style={{ fontSize:14 }}>📤</span>
                <span style={{ fontSize:13, color:TH.text, flex:1 }}>{w?.full_name_en}</span>
                <span style={{ fontSize:10, background:'#fff3e0', color:'#e65100', borderRadius:6, padding:'2px 6px', fontWeight:700 }}>⏳ PENDING</span>
              </div>
            )
          })}
          <div style={{ fontSize:11, color:TH.muted, marginTop:10, lineHeight:1.6, textAlign:'left' }}>
            {isAr
              ? 'سيقوم كل موظف بتأكيد الاستلام عبر رمز QR الخاص به. لن تُعالَج المطالبة إلا بعد تأكيد الجميع.'
              : 'Each worker confirms via their QR login. Finance will not process until all confirmations are received.'}
          </div>
        </div>
      )}

      <div style={S.card}>
        {(isAr
          ? ['مديرك يراجع الطلب ويعتمده','الموظفون الخارجيون يؤكدون الاستلام','تُضاف إلى مطالبة الراتب القادمة']
          : ['Your DH reviews and approves','Outsourced workers confirm receipt','Added to your next salary claim']
        ).map((s,i) => (
          <div key={i} style={{ display:'flex', gap:10, marginBottom: i<2?10:0, alignItems:'flex-start' }}>
            <div style={{ width:22, height:22, borderRadius:'50%', background:TH.headerBg, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>{i+1}</div>
            <span style={{ fontSize:12, color:TH.sub, lineHeight:1.5, paddingTop:2 }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  )

  // ─── Main render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth:480, margin:'0 auto', height:'100dvh', display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:'system-ui,-apple-system,Arial,sans-serif', direction: isAr?'rtl':'ltr', background: isDark ? TH.pageDark : TH.pageBg }}>
      {header}
      {progressPill}
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
