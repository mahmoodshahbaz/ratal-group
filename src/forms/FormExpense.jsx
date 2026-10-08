/**
 * EXPENSE CLAIM FORM  — /forms/expense
 * Theme: Deep Blue  (#1565c0)
 * Mobile-first · bilingual · GPS + photo upload · Telegram notification
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { uploadToDrive } from '../hooks/useDriveUpload'
import {
  THEMES, FormPage, Section, Row, Field, ToggleRow, InfoStrip,
  inp, inpRo, SubmitBar, LangBtn, ErrorBanner, SuccessScreen, LoginRequired,
} from './formTheme'

const T = THEMES.expense

const CATEGORIES = [
  'Materials', 'Tools & Equipment', 'Transportation', 'Accommodation',
  'Government Fees', 'Sub-Contractor', 'Other',
]

export default function FormExpense() {
  const [session,   setSession]   = useState(null)
  const [employees, setEmployees] = useState([])
  const [projects,  setProjects]  = useState([])
  const [lang,      setLang]      = useState('en')
  const [loading,   setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [reqNumber, setReqNumber] = useState('')
  const [error,     setError]     = useState('')

  const [expDate,   setExpDate]   = useState(new Date().toISOString().split('T')[0])
  const [empId,     setEmpId]     = useState('')
  const [empEntityId, setEmpEntityId] = useState('')
  const [dept,      setDept]      = useState('')
  const [contact,   setContact]   = useState('')
  const [projectId, setProjectId] = useState('')
  const [jobNo,     setJobNo]     = useState('')
  const [siteNo,    setSiteNo]    = useState('')
  const [expMode,   setExpMode]   = useState('EXPENSE')
  const [expCat,    setExpCat]    = useState('')
  const [vatPaid,   setVatPaid]   = useState(false)
  const [amount,    setAmount]    = useState('')
  const [vatAmt,    setVatAmt]    = useState('')
  const [vendor,    setVendor]    = useState('')
  const [vendorVat, setVendorVat] = useState('')
  const [remarks,   setRemarks]   = useState('')
  const [photoFile, setPhotoFile] = useState(null)

  const isAr  = lang === 'ar'
  const total = (parseFloat(amount)||0) + (parseFloat(vatAmt)||0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); if (session) loadData(session)
    })
  }, [])

  async function loadData(session) {
    // Load user's entity_id for RLS-correct queries
    const userId = session?.user?.id
    let entityId = null
    if (userId) {
      const { data: prof } = await supabase.from('user_profiles').select('entity_id').eq('id', userId).single()
      entityId = prof?.entity_id || null
    }

    const empQuery = supabase
      .from('employees')
      .select('id,full_name_en,department,mobile_number,entity_id')
      .neq('is_active', false)   // include TRUE and NULL — avoids empty list if column unset
      .order('full_name_en')
    if (entityId) empQuery.eq('entity_id', entityId)

    const projQuery = supabase
      .from('projects')
      .select('id,project_number,project_name')
      .in('status', ['OPEN', 'ACTIVE'])
      .order('project_number')
    if (entityId) projQuery.eq('entity_id', entityId)

    const [{ data: emps }, { data: projs }] = await Promise.all([empQuery, projQuery])
    setEmployees(emps || [])
    setProjects(projs || [])
  }

  function onEmp(id) {
    setEmpId(id)
    const e = employees.find(x => x.id === id)
    if (e) {
      setDept(e.department || '')
      setContact(e.mobile_number || '')
      setEmpEntityId(e.entity_id || '')
    }
  }

  async function submit(ev) {
    ev.preventDefault()
    if (!empId || !expCat || !amount) { setError(isAr ? 'يرجى ملء جميع الحقول المطلوبة' : 'Fill all required fields'); return }
    setLoading(true); setError('')

    let gLat = null, gLng = null
    try {
      const p = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }))
      gLat = p.coords.latitude; gLng = p.coords.longitude
    } catch {}

    let photoUrl = null
    if (photoFile) {
      const result = await uploadToDrive(photoFile, 'expenses')
      if (result) photoUrl = result.viewUrl
    }

    const { data, error: err } = await supabase.from('expenses').insert({
      entity_id: empEntityId || null,
      expense_date: expDate, department: dept, employee_id: empId, contact_number: contact,
      project_id: projectId || null, job_no: jobNo || null, site_no: siteNo || null,
      expense_mode: expMode, expense_category: expCat, vat_paid: vatPaid,
      amount: parseFloat(amount) || 0, vat_amount: parseFloat(vatAmt) || 0, total_amount: total,
      vendor_name: vendor || null, vendor_vat_no: vendorVat || null,
      photo_url: photoUrl, gps_lat: gLat, gps_lng: gLng,
      remarks: remarks || null, status: 'SUBMITTED',
    }).select('request_number').single()

    setLoading(false)
    if (err) { setError(err.message); return }
    setReqNumber(data?.request_number || '—')
    setSubmitted(true)
  }

  function reset() {
    setSubmitted(false); setAmount(''); setVatAmt('')
    setRemarks(''); setPhotoFile(null); setVatPaid(false)
  }

  const langBtn = <LangBtn isAr={isAr} toggle={() => setLang(l => l === 'en' ? 'ar' : 'en')} />

  if (!session)  return <FormPage theme={T} isAr={false} langToggle={null}><LoginRequired /></FormPage>
  if (submitted) return <FormPage theme={T} isAr={isAr} langToggle={langBtn}><SuccessScreen theme={T} reqNumber={reqNumber} isAr={isAr} onAnother={reset} /></FormPage>

  return (
    <FormPage theme={T} isAr={isAr} langToggle={langBtn}>
      <form onSubmit={submit}>
        <ErrorBanner msg={error} />

        <Section title={isAr ? 'معلومات الموظف' : 'Employee information'}>
          <Row>
            <Field label={isAr ? 'التاريخ *' : 'Date *'} flex={1}>
              <input type="date" style={inp} value={expDate} onChange={e => setExpDate(e.target.value)} required />
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
              <input style={inp} type="tel" value={contact} onChange={e => setContact(e.target.value)} />
            </Field>
          </Row>
        </Section>

        <Section title={isAr ? 'تفاصيل المصروف' : 'Expense details'}>
          <ToggleRow
            options={[
              { value:'EXPENSE',   label: isAr ? '💸 مصروف'  : '💸 Expense'   },
              { value:'RECEIVING', label: isAr ? '📦 استلام' : '📦 Receiving' },
            ]}
            value={expMode} onChange={setExpMode} theme={T}
          />
          <Row>
            <Field label={isAr ? 'نوع المصروف *' : 'Category *'} flex={2}>
              <select style={inp} value={expCat} onChange={e => setExpCat(e.target.value)} required>
                <option value="">-- {isAr ? 'اختر' : 'Select'} --</option>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label={isAr ? 'المشروع' : 'Project'} flex={2}>
              <select style={inp} value={projectId} onChange={e => setProjectId(e.target.value)}>
                <option value="">-- {isAr ? 'اختياري' : 'Optional'} --</option>
                {projects.map(p => <option key={p.id} value={p.id}>[{p.project_number}] {p.project_name}</option>)}
              </select>
            </Field>
          </Row>
          <Row last>
            <Field label={isAr ? 'رقم العمل' : 'Job #'}>
              <input style={inp} value={jobNo} onChange={e => setJobNo(e.target.value)} placeholder="Optional" />
            </Field>
            <Field label={isAr ? 'رقم الموقع' : 'Site #'}>
              <input style={inp} value={siteNo} onChange={e => setSiteNo(e.target.value)} placeholder="Optional" />
            </Field>
          </Row>
        </Section>

        <Section title={isAr ? 'المبلغ' : 'Amount'}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid #f4f6f8', display:'flex', alignItems:'center', gap:10 }}>
            <input type="checkbox" id="vat" checked={vatPaid} onChange={e => setVatPaid(e.target.checked)} style={{ width:16, height:16, cursor:'pointer' }} />
            <label htmlFor="vat" style={{ fontSize:13, color:'#546e7a', cursor:'pointer', fontFamily:'Arial,sans-serif' }}>
              {isAr ? 'تم دفع ضريبة القيمة المضافة' : 'VAT was paid on this expense'}
            </label>
          </div>
          <Row>
            <Field label={isAr ? 'المبلغ (ريال) *' : 'Amount (SAR) *'}>
              <input type="number" step="0.01" style={inp} value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" required />
            </Field>
            {vatPaid && (
              <Field label={isAr ? 'مبلغ الضريبة' : 'VAT Amount'}>
                <input type="number" step="0.01" style={inp} value={vatAmt} onChange={e => setVatAmt(e.target.value)} placeholder="0.00" />
              </Field>
            )}
          </Row>
          {total > 0 && <InfoStrip theme={T}>{isAr ? 'الإجمالي' : 'Total'}: SAR {total.toFixed(2)}</InfoStrip>}
          {vatPaid && (
            <Row last>
              <Field label={isAr ? 'اسم المورد' : 'Vendor Name'}>
                <input style={inp} value={vendor} onChange={e => setVendor(e.target.value)} />
              </Field>
              <Field label={isAr ? 'الرقم الضريبي' : 'Vendor VAT #'}>
                <input style={inp} value={vendorVat} onChange={e => setVendorVat(e.target.value)} />
              </Field>
            </Row>
          )}
        </Section>

        <Section title={isAr ? 'المستندات والملاحظات' : 'Documentation & remarks'}>
          <Row>
            <Field label={isAr ? 'صورة الإيصال' : 'Receipt photo'} flex={2}>
              <input type="file" accept="image/*" capture="environment"
                style={{ ...inp, padding:'7px 10px' }}
                onChange={e => setPhotoFile(e.target.files?.[0] || null)} />
            </Field>
          </Row>
          <Row last>
            <Field label={isAr ? 'ملاحظات' : 'Remarks'}>
              <textarea style={{ ...inp, minHeight:70, resize:'vertical' }}
                value={remarks} onChange={e => setRemarks(e.target.value)} />
            </Field>
          </Row>
        </Section>

        <SubmitBar theme={T} label={isAr ? 'إرسال الطلب' : 'Submit Expense'} loading={loading} />
      </form>
    </FormPage>
  )
}
