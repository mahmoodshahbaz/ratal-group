/**
 * FOOD ALLOWANCE FORM  — /forms/food-allowance
 * Theme: Dark Pink / Magenta  (#880e4f)
 * SAR 30/day remote sites only · no_persons × daily_rate × no_days
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  THEMES, FormPage, Section, Row, Field, InfoStrip,
  inp, inpRo, SubmitBar, LangBtn, ErrorBanner, SuccessScreen, LoginRequired,
} from './formTheme'

const T = THEMES.food

const DAILY_RATES = [
  { value:'30', label:'SAR 30 / day  (Standard remote)' },
  { value:'20', label:'SAR 20 / day  (Nearby site)'     },
  { value:'50', label:'SAR 50 / day  (Overnight)'        },
]

const devMode = new URLSearchParams(window.location.search).get('dev') === '1' ||
                localStorage.getItem('accsys_dev_mode') === '1'

export default function FormFoodAllowance() {
  const [session,   setSession]   = useState(null)
  const [employees, setEmployees] = useState([])
  const [deptMap,   setDeptMap]   = useState({})
  const [projects,  setProjects]  = useState([])
  const [lang,      setLang]      = useState('en')
  const [loading,   setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [reqNumber, setReqNumber] = useState('')
  const [error,     setError]     = useState('')

  const [allowDate, setAllowDate] = useState(new Date().toISOString().split('T')[0])
  const [empId,     setEmpId]     = useState('')
  const [empEntityId, setEmpEntityId] = useState('')
  const [dept,      setDept]      = useState('')
  const [contact,   setContact]   = useState('')
  const [empDeptCode, setEmpDeptCode] = useState('')
  const [projectId, setProjectId] = useState('')
  const [jobNo,     setJobNo]     = useState('')
  const [jobType,   setJobType]   = useState('')
  const [location,  setLocation]  = useState('')
  const [isRemote,  setIsRemote]  = useState(true)
  const [noPersons, setNoPersons] = useState('1')
  const [dailyRate, setDailyRate] = useState('30')
  const [noDays,    setNoDays]    = useState('1')
  const [remarks,   setRemarks]   = useState('')

  const isAr        = lang === 'ar'
  const totalAmount = (parseFloat(dailyRate)||0) * (parseInt(noPersons)||1) * (parseInt(noDays)||1)

  useEffect(() => {
    if (devMode) { loadData(null); return }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); if (session) loadData(session)
    })
  }, [])

  async function loadData(session) {
    // In dev mode, skip entity filtering and load all active employees
    let entityId = null
    if (!devMode && session?.user?.id) {
      const { data: prof } = await supabase.from('user_profiles').select('entity_id').eq('id', session.user.id).single()
      entityId = prof?.entity_id || null
    }

    const empQuery = devMode
      ? supabase.rpc('get_dev_employees')
      : supabase.from('employees').select('id,full_name_en,designation,department,department_id,mobile_number,entity_id,status').eq('status','ACTIVE').order('full_name_en')

    const projQuery = supabase
      .from('projects')
      .select('id,project_number,project_name,department_id,dept:department_id(dept_code,dept_name)')
      .in('status', ['OPEN', 'ACTIVE'])
      .order('project_number')
    if (entityId && !devMode) projQuery.eq('entity_id', entityId)

    const deptQuery = supabase.from('departments').select('id,dept_name,dept_code').eq('is_active', true)

    const [{ data: emps }, { data: projs }, { data: depts }] = await Promise.all([empQuery, projQuery, deptQuery])
    setEmployees(emps || [])
    setProjects(projs || [])
    setDeptMap(Object.fromEntries((depts||[]).map(d => [d.id, d])))
  }

  function onEmp(id) {
    setEmpId(id)
    setProjectId('')
    const e = employees.find(x => x.id === id)
    if (e) {
      // Always use dept_code (abbreviation) — fall back to dept_name or raw text
      const d = deptMap[e.department_id] || {}
      const code = d.dept_code || d.dept_name || ''
      setDept(code)
      setEmpDeptCode(code)
      setContact(e.phone || e.phone_number || e.mobile_number || '')
      setEmpEntityId(e.entity_id || '')
    }
  }

  async function submit(ev) {
    ev.preventDefault()
    if (!empId || !location || !noDays) { setError(isAr ? 'يرجى ملء الحقول المطلوبة' : 'Fill all required fields'); return }
    if (!isRemote) { setError(isAr ? 'بدل الطعام للمواقع النائية فقط' : 'Food allowance is for remote sites only'); return }
    setLoading(true); setError('')

    // ── Duplicate guard: one entry per (employee, date, job_type) ──
    const { data: existing } = await supabase
      .from('food_allowances')
      .select('id')
      .eq('employee_id', empId)
      .eq('allowance_date', allowDate)
      .eq('job_type', jobType || '')
      .maybeSingle()
    if (existing) {
      const emp = employees.find(e => e.id === empId)
      setError(
        isAr
          ? `تم تسجيل بدل الطعام لهذا الموظف بنفس النوع في ${allowDate} مسبقاً`
          : `Food allowance already recorded for ${emp?.full_name_en || 'this employee'} (${jobType || 'no job type'}) on ${allowDate}. Only one entry per employee per day per job type is allowed.`
      )
      setLoading(false)
      return
    }

    let gLat = null, gLng = null
    try {
      const p = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }))
      gLat = p.coords.latitude; gLng = p.coords.longitude
    } catch {}

    const { data, error: err } = await supabase.from('food_allowances').insert({
      entity_id: empEntityId || null,
      allowance_date: allowDate, employee_id: empId, department: dept, contact_number: contact,
      project_id: projectId || null, job_no: jobNo || null, job_type: jobType || null,
      location, is_remote: isRemote,
      no_persons: parseInt(noPersons) || 1, daily_rate: parseFloat(dailyRate) || 30,
      no_days: parseInt(noDays) || 1, total_amount: totalAmount,
      gps_lat: gLat, gps_lng: gLng,
      remarks: remarks || null, status: 'APPROVED',
    }).select('request_number').single()

    setLoading(false)
    if (err) {
      if (err.code === '23505') {
        setError(isAr ? 'تم تسجيل بدل الطعام لهذا الموظف بهذا النوع في هذا اليوم مسبقاً' : 'Duplicate: food allowance already exists for this employee, date and job type.')
      } else {
        setError(err.message)
      }
      return
    }
    setReqNumber(data?.request_number || '—')
    setSubmitted(true)
  }

  function reset() { setSubmitted(false); setNoDays('1'); setNoPersons('1'); setRemarks('') }

  // Filter projects by dept_code — nested join (p.dept) OR deptMap fallback (if no FK in Supabase)
  const deptProjects = empDeptCode
    ? projects.filter(p => {
        const pCode = p.dept?.dept_code || p.dept?.dept_name
          || deptMap[p.department_id]?.dept_code || deptMap[p.department_id]?.dept_name || ''
        return pCode.toUpperCase() === empDeptCode.toUpperCase()
      })
    : projects

  const langBtn = <LangBtn isAr={isAr} toggle={() => setLang(l => l === 'en' ? 'ar' : 'en')} />

  if (!session && !devMode) return <FormPage theme={T} isAr={false} langToggle={null}><LoginRequired /></FormPage>
  if (submitted) return <FormPage theme={T} isAr={isAr} langToggle={langBtn}><SuccessScreen theme={T} reqNumber={reqNumber} isAr={isAr} onAnother={reset} /></FormPage>

  return (
    <FormPage theme={T} isAr={isAr} langToggle={langBtn}>
      {devMode && (
        <div style={{ background:'#fff3e0', border:'2px dashed #fb8c00', borderRadius:8, margin:'12px 12px 0', padding:'10px 14px' }}>
          <div style={{ fontWeight:700, color:'#e65100', fontSize:13, fontFamily:'Arial,sans-serif' }}>
            🛠️ TESTING MODE — not visible to employees
          </div>
          <div style={{ fontSize:12, color:'#bf360c', marginTop:4, fontFamily:'Arial,sans-serif' }}>
            Pick any employee from the dropdown below. In production, employee is auto-filled from QR code.
          </div>
        </div>
      )}
      <form onSubmit={submit}>
        <ErrorBanner msg={error} />

        <Section title={isAr ? 'معلومات الموظف' : 'Employee information'}>
          <Row>
            <Field label={isAr ? 'التاريخ *' : 'Date *'} flex={1}>
              <input type="date" style={inp} value={allowDate} onChange={e => setAllowDate(e.target.value)} required />
            </Field>
            <Field label={isAr ? 'الموظف *' : 'Employee *'} flex={2}>
              <select style={inp} value={empId} onChange={e => onEmp(e.target.value)} required>
                <option value="">-- {isAr ? 'اختر' : 'Select'} --</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name_en}</option>)}
              </select>
            </Field>
          </Row>
          <Row last>
            <Field label={isAr ? 'القسم' : 'Department'}>
              <input style={inpRo} value={dept} readOnly placeholder="Auto-filled" />
            </Field>
            <Field label={isAr ? 'رقم الجوال' : 'Contact'}>
              <input style={inpRo} type="tel" value={contact} readOnly placeholder="Auto-filled from employee DB" />
            </Field>
          </Row>
        </Section>

        <Section title={isAr ? 'تفاصيل الموقع' : 'Site & assignment details'}>
          <Row>
            <Field label={isAr ? 'الموقع / المكان *' : 'Location / site name *'} flex={2}>
              <input style={inp} value={location} onChange={e => setLocation(e.target.value)}
                placeholder={isAr ? 'اسم الموقع' : 'e.g. Riyadh Tower Site'} required />
            </Field>
            <Field label={isAr ? 'المشروع' : 'Project'} flex={2}>
              <select style={inp} value={projectId} onChange={e => setProjectId(e.target.value)}>
                <option value="">-- {empDeptCode ? `${empDeptCode} Projects` : 'Optional'} --</option>
                {deptProjects.map(p => <option key={p.id} value={p.id}>[{p.project_number}] {p.project_name}</option>)}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label={isAr ? 'رقم العمل' : 'Job #'}>
              <input style={inp} value={jobNo} onChange={e => setJobNo(e.target.value)} />
            </Field>
            <Field label={isAr ? 'نوع العمل' : 'Job type'}>
              <input style={inp} value={jobType} onChange={e => setJobType(e.target.value)}
                placeholder={isAr ? 'مثال: تركيب' : 'e.g. Installation'} />
            </Field>
          </Row>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid #f4f6f8', display:'flex', alignItems:'center', gap:10 }}>
            <input type="checkbox" id="rem" checked={isRemote} onChange={e => setIsRemote(e.target.checked)} style={{ width:16, height:16, cursor:'pointer' }} />
            <label htmlFor="rem" style={{ fontSize:13, color:'#546e7a', cursor:'pointer', fontFamily:'Arial,sans-serif' }}>
              {isAr ? 'موقع نائي (مؤهل للبدل)' : 'Remote site — eligible for allowance'}
            </label>
          </div>
          {!isRemote && (
            <div style={{ padding:'8px 14px', background:'#ffebee', fontSize:12, color:'#c62828' }}>
              ⚠️ {isAr ? 'بدل الطعام للمواقع النائية فقط' : 'Food allowance is for remote sites only'}
            </div>
          )}
        </Section>

        <Section title={isAr ? 'حساب البدل' : 'Allowance calculation'}>
          <Row>
            <Field label={isAr ? 'معدل يومي' : 'Daily rate'} flex={2}>
              <select style={inp} value={dailyRate} onChange={e => setDailyRate(e.target.value)}>
                {DAILY_RATES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label={isAr ? 'عدد الأشخاص' : 'No. of persons'}>
              <input type="number" min="1" style={inp} value={noPersons} onChange={e => setNoPersons(e.target.value)} />
            </Field>
            <Field label={isAr ? 'عدد الأيام *' : 'No. of days *'}>
              <input type="number" min="1" style={inp} value={noDays} onChange={e => setNoDays(e.target.value)} required />
            </Field>
          </Row>
          {totalAmount > 0 && (
            <InfoStrip theme={T}>
              {isAr ? 'الإجمالي' : 'Total'}: SAR {totalAmount.toFixed(2)}
              <span style={{ fontSize:11, fontWeight:400, marginLeft:8, opacity:0.8 }}>
                ({noPersons} pers × SAR {dailyRate}/day × {noDays} days)
              </span>
            </InfoStrip>
          )}
        </Section>

        <Section title={isAr ? 'ملاحظات' : 'Remarks'}>
          <Row last>
            <Field label={isAr ? 'ملاحظات' : 'Notes'}>
              <textarea style={{ ...inp, minHeight:70, resize:'vertical' }}
                value={remarks} onChange={e => setRemarks(e.target.value)} />
            </Field>
          </Row>
        </Section>

        <SubmitBar theme={T} label={isAr ? 'إرسال طلب البدل' : 'Submit Food Allowance'} loading={loading} />
      </form>
    </FormPage>
  )
}
