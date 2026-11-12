/**
 * BackdatedEntryModal.jsx  v2
 *
 * Admin tool for adding / correcting missed records for a past date.
 * Used by: ExpensesPage (type='expense'), FoodAllowance (type='food'),
 *           Overtime (type='overtime')
 *
 * Records are stored in:
 *   expense   → expense_records  (same table as field workers' daily submissions)
 *   food      → food_allowances  (same table as field FA requests)
 *   overtime  → overtime_requests (same table as field OT requests)
 *
 * They appear in the respective admin list pages immediately after save.
 *
 * Flow:
 *   Step 1  Employee dropdown  →  Date picker  →  Receipt file (optional)
 *           • ZATCA QR auto-decode → pre-fill amount/vendor/VAT
 *           • Site assignment auto-resolves as you type (no button needed)
 *           • Lock check on Continue
 *   Step 2  Day Records — existing list + Add / Edit form
 *           • Expense: VAT toggle, expense type, amount
 *           • FA:      daily rate × days
 *           • OT:      ot type, hours
 */

import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import FormShell from './FormShell'
import { CHAPTER_PALETTES } from '../styles/appStyles'

const PP = "'Poppins', sans-serif"

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPeriodForDate(dateStr) {
  if (!dateStr) return ''
  const d   = new Date(dateStr + 'T00:00:00')
  const y   = d.getFullYear()
  const m   = d.getMonth() + 1
  const day = d.getDate()
  if (day >= 26) {
    return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  }
  return `${y}-${String(m).padStart(2, '0')}`
}

async function getMonthLock(employeeId, dateStr, entityId) {
  const period = getPeriodForDate(dateStr)
  if (!period || !employeeId) return { locked: false, reason: '' }

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('id,status')
    .eq('employee_id', employeeId)
    .eq('claim_period', period)
    .eq('entity_id', entityId)
    .maybeSingle()

  if (claim) return { locked: true, reason: `Expense claim already generated for ${period} (${claim.status})` }

  const today  = new Date()
  const curPer = getPeriodForDate(today.toISOString().split('T')[0])
  if (period === curPer && today.getDate() > 25) {
    return { locked: true, reason: `Cut-off passed: submissions for ${period} closed after the 25th` }
  }
  return { locked: false, reason: '' }
}

async function getAssignmentForDate(employeeId, dateStr) {
  if (!employeeId || !dateStr) return null
  // site_assignments has NO entity_id column — filter by employee_id + date + status
  const { data } = await supabase
    .from('site_assignments')
    .select('id,site_master_id,site_masters(site_name,site_no),project_id,projects(project_number,project_name),allow_fa,allow_ot')
    .eq('employee_id', employeeId)
    .eq('assignment_date', dateStr)
    .eq('status', 'ACTIVE')
    .maybeSingle()
  return data || null
}

// ── ZATCA QR decode (pure JS) ─────────────────────────────────────────────────
function decodeZATCAQR(base64Str) {
  try {
    const bin = atob(base64Str)
    const result = {}
    let i = 0
    while (i < bin.length) {
      const tag = bin.charCodeAt(i++)
      const len = bin.charCodeAt(i++)
      const val = bin.slice(i, i + len)
      i += len
      if (tag === 1) result.seller    = val
      if (tag === 2) result.vatNumber = val
      if (tag === 3) result.datetime  = val
      if (tag === 4) result.total     = parseFloat(val)
      if (tag === 5) result.vatAmount = parseFloat(val)
    }
    return Object.keys(result).length >= 2 ? result : null
  } catch { return null }
}

async function scanReceiptFile(file) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target.result
      // Try ZATCA QR decode via canvas
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = img.naturalWidth
          canvas.height = img.naturalHeight
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0)
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          // Try jsQR if available, otherwise skip
          if (window.jsQR) {
            const qr = window.jsQR(imgData.data, imgData.width, imgData.height)
            if (qr?.data) {
              const zatca = decodeZATCAQR(qr.data)
              if (zatca) return resolve({ dataUrl, zatca, source: 'ZATCA' })
            }
          }
          resolve({ dataUrl, zatca: null, source: 'manual' })
        } catch {
          resolve({ dataUrl, zatca: null, source: 'manual' })
        }
      }
      img.onerror = () => resolve({ dataUrl, zatca: null, source: 'manual' })
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  })
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const inp = {
  width: '100%', padding: '8px 10px', borderRadius: 4,
  border: '1px solid #dde3ec', fontSize: 12, outline: 'none',
  fontFamily: PP, boxSizing: 'border-box', background: '#fff',
}
const lbl = {
  display: 'block', fontSize: 10, color: '#6b7c93',
  fontWeight: 700, marginBottom: 3, fontFamily: PP,
  textTransform: 'uppercase', letterSpacing: 0.3,
}
const row   = { display: 'flex', gap: 10, marginBottom: 11, flexWrap: 'wrap' }
const col   = { flex: 1, minWidth: 120 }
const secHd = c => ({
  fontSize: 10, fontWeight: 800, color: c, letterSpacing: 1,
  textTransform: 'uppercase', marginBottom: 8, marginTop: 4,
  paddingBottom: 4, borderBottom: `1px solid ${c}40`, fontFamily: PP,
})

// ── EXPENSE TYPES ─────────────────────────────────────────────────────────────
const EXPENSE_TYPES = ['Travel','Accommodation','Meals','Office Supplies','Communication','Fuel','Maintenance','Government Fees','IQAMA Renewal','Change of Profession','Change of Sponsorship','Muqeem Points','Chamber of Commerce','QIWA Fees','Government Penalties','Other']
const FA_JOB_TYPES  = ['SURVEY','INSTALLATION','COMMISSIONING','MAINTENANCE','TESTING','PROJECT SUPPORT','OTHER']
const OT_TYPES      = ['NORMAL','FRIDAY','HOLIDAY','TRAVEL']
const WORK_TYPES    = ['FIELD WORK','OFFICE WORK','REMOTE','ON-CALL','TRAVEL DAY']
const OT_JOB_TYPES  = ['INSTALLATION','COMMISSIONING','MAINTENANCE','SURVEY','TESTING','PROJECT SUPPORT','ADMINISTRATIVE','OTHER']

// ─────────────────────────────────────────────────────────────────────────────
export default function BackdatedEntryModal({ type, entityId, employees, onClose, onSaved }) {
  const chapter = type === 'expense' ? 'Finance' : 'HR'
  const pal     = CHAPTER_PALETTES[chapter]
  const L3      = pal.L3
  const STEPS   = ['Select Employee & Date', 'Day Records']

  // ── Current admin user (for audit trail) ─────────────────────────────────
  const [adminUser, setAdminUser] = useState('')
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user
      if (u) setAdminUser(u.user_metadata?.full_name || u.email || u.id || '')
    })
  }, [])

  // ── Step ─────────────────────────────────────────────────────────────────
  const [step, setStep] = useState(1)

  // ── Step 1 state ──────────────────────────────────────────────────────────
  const [dept,        setDept]        = useState('')
  const [empId,       setEmpId]       = useState('')
  const [date,        setDate]        = useState(new Date().toISOString().split('T')[0])
  const [rcptFile,    setRcptFile]    = useState(null)
  const [rcptDataUrl, setRcptDataUrl] = useState('')
  const [rcptSource,  setRcptSource]  = useState('')   // 'ZATCA' | 'manual'
  const [scanning,    setScanning]    = useState(false)
  const [assignment,  setAssignment]  = useState(undefined) // undefined=not checked, null=none
  const [asnLoading,  setAsnLoading]  = useState(false)
  const [lockInfo,    setLockInfo]    = useState(null)
  const [checking,    setChecking]    = useState(false)
  const fileRef = useRef()

  // ── Step 2 state ──────────────────────────────────────────────────────────
  const [records,     setRecords]     = useState([])
  const [recLoading,  setRecLoading]  = useState(false)
  const [editingId,   setEditingId]   = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saveError,   setSaveError]   = useState('')

  // ── Expense form fields ───────────────────────────────────────────────────
  const [expType,    setExpType]    = useState('')
  const [amount,     setAmount]     = useState('')
  const [vatOn,      setVatOn]      = useState(false)
  const [vatPct,     setVatPct]     = useState('15')
  const [vatNumber,  setVatNumber]  = useState('')
  const [vendorName, setVendorName] = useState('')
  const [remarks,    setRemarks]    = useState('')
  // ── Project / Site / Job (expense only) — mandatory: project+site, optional: job ──
  const [projectNo,  setProjectNo]  = useState('')
  const [siteNo,     setSiteNo]     = useState('')
  const [jobNo,      setJobNo]      = useState('')

  // ── FA form fields ────────────────────────────────────────────────────────
  const [dailyRate,  setDailyRate]  = useState('50')
  const [noDays,     setNoDays]     = useState('1')
  const [location,   setLocation]   = useState('')
  const [jobType,    setJobType]    = useState('')

  // ── OT form fields ────────────────────────────────────────────────────────
  const [otType,    setOtType]    = useState('NORMAL')
  const [hours,     setHours]     = useState('')
  const [workType,  setWorkType]  = useState('FIELD WORK')
  const [otJobType, setOtJobType] = useState('')

  // ── Auto-resolve assignment when employee+date change ────────────────────
  useEffect(() => {
    if (!empId || !date) { setAssignment(undefined); return }
    let cancelled = false
    setAsnLoading(true)
    setAssignment(undefined)
    getAssignmentForDate(empId, date).then(a => {
      if (!cancelled) { setAssignment(a); setAsnLoading(false) }
    })
    return () => { cancelled = true }
  }, [empId, date])

  // ── Auto-populate location from assignment ────────────────────────────────
  useEffect(() => {
    if (type === 'food' && assignment?.site_masters?.site_name) {
      setLocation(assignment.site_masters.site_name)
    }
    // For expense: auto-fill project + site from assignment (overrideable)
    if (type === 'expense') {
      if (assignment?.projects?.project_number) setProjectNo(assignment.projects.project_number)
      if (assignment?.site_masters?.site_no)    setSiteNo(assignment.site_masters.site_no)
    }
  }, [assignment])

  // ── Reset form when opening add ───────────────────────────────────────────
  function resetForm() {
    setExpType(''); setAmount(''); setVatOn(false); setVatPct('15')
    setVatNumber(''); setVendorName(''); setRemarks('')
    // projectNo/siteNo keep the auto-resolved assignment values; only jobNo resets
    setJobNo('')
    setDailyRate('50'); setNoDays('1'); setLocation(assignment?.site_masters?.site_name||'')
    setJobType(''); setOtType('NORMAL'); setHours(''); setWorkType('FIELD WORK'); setOtJobType('')
    setSaveError('')
  }

  function populateForm(r) {
    setRemarks(r.remarks || ''); setSaveError('')
    if (type === 'expense') {
      setExpType(r.category || '')
      setAmount(String(r.amount || ''))   // amount = excl. VAT
      const hasVat = (r.vat_amount > 0)
      setVatOn(hasVat)
      if (hasVat) {
        // amount is excl. VAT, so pct = vat_amount / amount × 100
        const pct = r.amount > 0 ? Math.round((r.vat_amount / r.amount) * 100) : 15
        setVatPct(String(pct))
        setVatNumber(r.vat_number || '')
      }
      setVendorName(r.vendor_name || '')
      // Restore project/site/job from saved record (or fall back to current assignment)
      setProjectNo(r.project_no || assignment?.projects?.project_number || '')
      setSiteNo(r.site_no     || assignment?.site_masters?.site_no    || '')
      setJobNo(r.job_no       || '')
    } else if (type === 'food') {
      setDailyRate(String(r.daily_rate || 50)); setNoDays(String(r.no_days || 1))
      setLocation(r.location || ''); setJobType(r.job_type || '')
    } else {
      setOtType(r.ot_type || 'NORMAL'); setHours(String(r.hours || ''))
      setWorkType(r.work_type || 'FIELD WORK'); setOtJobType(r.job_type || '')
    }
  }

  // ── Handle receipt file ───────────────────────────────────────────────────
  async function handleFile(f) {
    if (!f) return
    setRcptFile(f); setScanning(true); setRcptSource('')
    const { dataUrl, zatca, source } = await scanReceiptFile(f)
    setRcptDataUrl(dataUrl)
    setRcptSource(source)
    if (zatca) {
      if (zatca.total != null) {
        // total includes VAT — back-calculate base amount
        const vatAmt = zatca.vatAmount || 0
        const base   = (zatca.total - vatAmt)
        setAmount(base > 0 ? base.toFixed(2) : zatca.total.toFixed(2))
        if (vatAmt > 0) {
          setVatOn(true)
          setVatPct('15')
        }
      }
      if (zatca.seller)    setVendorName(zatca.seller)
      if (zatca.vatNumber) setVatNumber(zatca.vatNumber)
    }
    setScanning(false)
  }

  // ── Load existing records ─────────────────────────────────────────────────
  async function loadRecords() {
    if (!empId || !date) return
    setRecLoading(true)
    let query
    if (type === 'expense') {
      query = supabase.from('expense_records')
        .select('id,expense_date,category,amount,vat_amount,vendor_name,vat_number,remarks,receipt_url,status,project_no,project_name,site_no,site_name,job_no')
        .eq('employee_id', empId).eq('expense_date', date)
        .order('created_at', { ascending: true })
    } else if (type === 'food') {
      query = supabase.from('food_allowances')
        .select('id,allowance_date,daily_rate,no_days,total_amount,location,job_type,remarks,status')
        .eq('employee_id', empId).eq('allowance_date', date).eq('entity_id', entityId)
        .order('created_at', { ascending: true })
    } else {
      query = supabase.from('overtime_requests')
        .select('id,ot_date,ot_type,hours,work_type,job_type,total_amount,remarks,status')
        .eq('employee_id', empId).eq('ot_date', date).eq('entity_id', entityId)
        .order('created_at', { ascending: true })
    }
    const { data } = await query
    setRecords(data || [])
    setRecLoading(false)
  }

  useEffect(() => { if (step === 2) loadRecords() }, [step])

  // ── Upload receipt to Supabase storage ───────────────────────────────────
  async function uploadReceipt() {
    if (!rcptFile) return null
    try {
      const ext  = rcptFile.name.split('.').pop() || 'jpg'
      const path = `admin-backdated/${empId}/${date}/${Date.now()}.${ext}`
      const { data, error } = await supabase.storage.from('receipts').upload(path, rcptFile, { upsert: true })
      if (error) { console.warn('Receipt upload failed', error); return null }
      const { data: pub } = supabase.storage.from('receipts').getPublicUrl(path)
      return pub?.publicUrl || null
    } catch { return null }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (saving) return
    setSaving(true); setSaveError('')

    try {
      const emp    = employees.find(e => e.id === empId)
      const period = getPeriodForDate(date)

      // Upload receipt if present
      const receiptUrl = await uploadReceipt()

      if (type === 'expense') {
        const exclAmt = parseFloat(amount) || 0
        const vatAmt  = vatOn ? Math.round(exclAmt * (parseFloat(vatPct) || 15) / 100 * 100) / 100 : 0

        // Standard: amount = excl. VAT, vat_amount = VAT only, total = amount + vat_amount
        const payload = {
          expense_date:      date,
          employee_id:       empId,
          entity_id:         entityId,
          category:          expType,
          amount:            exclAmt,   // excl. VAT
          vat_amount:        vatAmt,    // VAT only (0 if no VAT)
          vendor_name:       vendorName || null,
          vat_number:        vatOn ? (vatNumber || null) : null,
          remarks:           remarks || null,
          receipt_url:       receiptUrl || null,
          status:            'PENDING',
          // ── New columns (added by expense_records_audit_patch.sql) ──────────
          project_no:        projectNo || null,
          project_name:      assignment?.projects?.project_name || null,
          site_no:           siteNo    || null,
          site_name:         assignment?.site_masters?.site_name || null,
          job_no:            jobNo     || null,
          entry_source:      'ADMIN',
          recorded_by_name:  adminUser || null,
        }

        // ── Save with graceful degradation ───────────────────────────────────
        // If SQL patch has not been run yet (Postgres error 42703: undefined_column),
        // retry saving only the base columns so records are NEVER silently lost.
        const doExpenseSave = async (pl) => {
          if (editingId) {
            return (await supabase.from('expense_records').update(pl).eq('id', editingId)).error
          }
          return (await supabase.from('expense_records').insert(pl)).error
        }

        let err = await doExpenseSave(payload)
        if (err?.code === '42703' || (err?.message || '').includes('does not exist')) {
          // SQL patch not yet run — save without the new columns (no data loss)
          const { project_no, project_name, site_no, site_name, job_no,
                  entry_source, recorded_by_name, ...basePayload } = payload
          err = await doExpenseSave(basePayload)
        }
        if (err) throw new Error(err.message)

      } else if (type === 'food') {
        const rate  = parseFloat(dailyRate) || 50
        const days  = parseFloat(noDays)    || 1
        const total = rate * days
        const [yr, mo] = period.split('-').map(Number)
        const allowMon = `${yr}-${String(mo).padStart(2,'0')}`

        const payload = {
          allowance_date:    date,
          allowance_month:   allowMon,
          employee_id:       empId,
          entity_id:         entityId,
          location:          location || assignment?.site_masters?.site_name || '',
          job_type:          jobType || null,
          no_persons:        1,
          no_days:           days,
          daily_rate:        rate,
          total_amount:      total,
          remarks:           remarks || null,
          status:            'PENDING',
          site_assignment_id: assignment?.id || null,
          department:        emp?.department || null,
        }

        let err
        if (editingId) {
          ({ error: err } = await supabase.from('food_allowances').update(payload).eq('id', editingId))
        } else {
          ({ error: err } = await supabase.from('food_allowances').insert(payload))
        }
        if (err) throw new Error(err.message)

      } else {
        // overtime
        const hrs   = parseFloat(hours) || 0
        const mult  = otType === 'TRAVEL' ? 1.0 : 1.5
        const daily = parseFloat(emp?.basic_salary || 0) / 30 / 8
        const total = daily > 0 ? hrs * daily * mult : 0
        const proj  = assignment?.projects

        const payload = {
          ot_date:           date,
          employee_id:       empId,
          entity_id:         entityId,
          ot_type:           otType,
          hours:             hrs,
          work_type:         workType || null,
          job_type:          otJobType || null,
          total_amount:      total,
          remarks:           remarks || null,
          status:            'SUBMITTED',
          site_assignment_id: assignment?.id || null,
          department:        emp?.department || null,
          project_number:    proj?.project_number || null,
        }

        let err
        if (editingId) {
          ({ error: err } = await supabase.from('overtime_requests').update(payload).eq('id', editingId))
        } else {
          ({ error: err } = await supabase.from('overtime_requests').insert(payload))
        }
        if (err) throw new Error(err.message)
      }

      setSaving(false)
      setShowAddForm(false); setEditingId(null); resetForm()
      await loadRecords()
      onSaved?.()

    } catch (err) {
      setSaving(false)
      setSaveError(`Save failed: ${err.message || 'Unknown error'}`)
    }
  }

  // ── Proceed to Step 2 ─────────────────────────────────────────────────────
  async function handleProceed() {
    if (!empId || !date) return
    setChecking(true)
    const lock = await getMonthLock(empId, date, entityId)
    setLockInfo(lock)
    setChecking(false)
    if (!lock.locked) {
      setStep(2); setShowAddForm(false); setEditingId(null); resetForm()
    }
  }

  function handleBack() {
    if (showAddForm || editingId) { setShowAddForm(false); setEditingId(null); resetForm(); return }
    if (step === 2) { setStep(1); setLockInfo(null) }
    else onClose()
  }

  function handleNext() {
    if (step === 1)                              handleProceed()
    else if (showAddForm || editingId)           handleSave()
    else                                         onClose()
  }

  const emp = employees.find(e => e.id === empId)

  const nextLabel = step === 1
    ? (checking ? 'Checking…' : 'Continue →')
    : (showAddForm || editingId)
      ? (saving ? 'Saving…' : editingId ? 'Update Record' : 'Add Record')
      : 'Done'

  const backLabel = step === 1 ? 'Cancel'
    : (showAddForm || editingId) ? '← Back' : '← Change Date'

  const title = { expense: ['ADMIN','Backdated','Expense Entry'], food: ['ADMIN','Backdated','FA Entry'], overtime: ['ADMIN','Backdated','OT Entry'] }[type]
  const desc  = {
    expense:  'Add or correct expense records for a past date. Records are saved to expense_records (same as field submissions).',
    food:     'Add or correct food allowance records for a past date. Records saved to food_allowances.',
    overtime: 'Add or correct overtime records for a past date. Records saved to overtime_requests.',
  }[type]

  // For expense and food, block Continue if no assignment found on that date
  const noAssignmentBlock = (type === 'expense' || type === 'food') && empId && date && !asnLoading && assignment === null

  // For expense form: project# and site# are mandatory
  const expMissingFields = type === 'expense' && (showAddForm || editingId) && (!projectNo || !siteNo)

  const nextDisabled =
    (step === 1 && (!empId || !date || checking || asnLoading || noAssignmentBlock)) ||
    ((showAddForm || editingId) && (saving || expMissingFields))

  return (
    <FormShell
      isOpen
      onClose={onClose}
      chapterName={chapter}
      title={title}
      description={desc}
      steps={STEPS}
      currentStep={step}
      onBack={handleBack}
      onNext={handleNext}
      backLabel={backLabel}
      nextLabel={nextLabel}
      nextDisabled={nextDisabled}
      subjectLabel={emp ? { line1: emp.full_name_en, line2: date } : null}
    >
      {step === 1 && (
        <Step1
          allEmployees={employees}
          dept={dept} setDept={setDept}
          empId={empId} setEmpId={setEmpId}
          date={date}   setDate={setDate}
          asnLoading={asnLoading} assignment={assignment}
          lockInfo={lockInfo}
          noAssignmentBlock={noAssignmentBlock}
          rcptFile={rcptFile} rcptDataUrl={rcptDataUrl}
          rcptSource={rcptSource} scanning={scanning}
          fileRef={fileRef}
          onFile={handleFile}
          type={type} L3={L3}
        />
      )}
      {step === 2 && (
        <Step2
          records={records} recLoading={recLoading}
          date={date} assignment={assignment}
          showAddForm={showAddForm} editingId={editingId}
          saveError={saveError}
          type={type} L3={L3}
          onEdit={r => { setEditingId(r.id); setShowAddForm(false); populateForm(r) }}
          onAdd={() => { setEditingId(null); resetForm(); setShowAddForm(true) }}
          formContent={
            <ExpenseFormFields
              type={type} L3={L3}
              expType={expType} setExpType={setExpType}
              amount={amount} setAmount={setAmount}
              vatOn={vatOn} setVatOn={setVatOn}
              vatPct={vatPct} setVatPct={setVatPct}
              vatNumber={vatNumber} setVatNumber={setVatNumber}
              vendorName={vendorName} setVendorName={setVendorName}
              projectNo={projectNo} setProjectNo={setProjectNo}
              siteNo={siteNo}       setSiteNo={setSiteNo}
              jobNo={jobNo}         setJobNo={setJobNo}
              dailyRate={dailyRate} setDailyRate={setDailyRate}
              noDays={noDays} setNoDays={setNoDays}
              location={location} setLocation={setLocation}
              jobType={jobType} setJobType={setJobType}
              otType={otType} setOtType={setOtType}
              hours={hours} setHours={setHours}
              workType={workType} setWorkType={setWorkType}
              otJobType={otJobType} setOtJobType={setOtJobType}
              remarks={remarks} setRemarks={setRemarks}
            />
          }
        />
      )}
    </FormShell>
  )
}

// ── STEP 1 ────────────────────────────────────────────────────────────────────
function Step1({ allEmployees, dept, setDept, empId, setEmpId, date, setDate, asnLoading, assignment, lockInfo, noAssignmentBlock, rcptFile, rcptDataUrl, rcptSource, scanning, fileRef, onFile, type, L3 }) {
  // Build dept list from employees prop
  const depts = [...new Set(allEmployees.map(e => e.dept_code || e.department).filter(Boolean))].sort()
  const filteredEmps = dept ? allEmployees.filter(e => (e.dept_code || e.department) === dept) : allEmployees

  return (
    <div>
      {/* Department filter */}
      <div style={secHd(L3)}>Filter by Department</div>
      <div style={row}>
        <div style={col}>
          <label style={lbl}>Department</label>
          <select value={dept} onChange={e => { setDept(e.target.value); setEmpId('') }} style={inp}>
            <option value="">— All Departments —</option>
            {depts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div style={col}>
          <label style={lbl}>Employee</label>
          <select value={empId} onChange={e => setEmpId(e.target.value)} style={inp}>
            <option value="">— Select Employee —</option>
            {filteredEmps.map(e => <option key={e.id} value={e.id}>{e.full_name_en}</option>)}
          </select>
        </div>
      </div>

      {/* Date */}
      <div style={secHd(L3)}>Date</div>
      <div style={row}>
        <div style={col}>
          <label style={lbl}>Entry Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            max={new Date().toISOString().split('T')[0]} style={inp} />
        </div>
        <div style={col}>
          <label style={lbl}>Claim Period</label>
          <div style={{ ...inp, background: '#f8f9fa', color: '#546e7a', pointerEvents: 'none' }}>
            {date ? getPeriodForDate(date) : '—'}
          </div>
        </div>
      </div>

      {/* Assignment auto-resolve */}
      {empId && date && (
        <div style={{ marginBottom: 12 }}>
          {asnLoading ? (
            <div style={{ fontSize: 11, color: '#90a4ae', fontFamily: PP, padding: '6px 0' }}>⏳ Resolving site assignment…</div>
          ) : assignment ? (
            <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 6, padding: '8px 12px', fontSize: 11, fontFamily: PP, color: '#2e7d32' }}>
              ✓ <strong>{assignment.site_masters?.site_name}</strong>
              {assignment.projects?.project_number && <> · Project <strong>{assignment.projects.project_number}</strong></>}
              {type === 'food'     && !assignment.allow_fa && <div style={{ color: '#e65100', marginTop: 2 }}>⚠ FA not enabled on this assignment</div>}
              {type === 'overtime' && !assignment.allow_ot && <div style={{ color: '#e65100', marginTop: 2 }}>⚠ OT not enabled on this assignment</div>}
            </div>
          ) : (type === 'expense' || type === 'food') ? (
            <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 6, padding: '8px 12px', fontSize: 11, fontFamily: PP, color: '#c62828' }}>
              🔒 No site assignment on this date — cannot add {type === 'food' ? 'Food Allowance' : 'Expense'} without an active assignment. Please check the site assignment records.
            </div>
          ) : (
            <div style={{ background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 6, padding: '8px 12px', fontSize: 11, fontFamily: PP, color: '#795548' }}>
              ⚠ No site assignment found on this date — OT can still be recorded manually.
            </div>
          )}
        </div>
      )}

      {/* Receipt upload — expense type only, but accept for all */}
      {type === 'expense' && (
        <>
          <div style={secHd(L3)}>Attach Receipt</div>
          <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />

          {!rcptFile ? (
            <div
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${L3}60`, borderRadius: 8, padding: '14px',
                textAlign: 'center', cursor: 'pointer', marginBottom: 12,
                background: `${L3}08`,
              }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>📎</div>
              <div style={{ fontSize: 11, color: L3, fontWeight: 700, fontFamily: PP }}>Click to attach receipt</div>
              <div style={{ fontSize: 10, color: '#90a4ae', fontFamily: PP, marginTop: 2 }}>
                Image or PDF · ZATCA QR auto-read · Manual fill also works
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
              {rcptDataUrl && rcptFile.type?.startsWith('image') && (
                <img src={rcptDataUrl} alt="receipt" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: `1px solid ${L3}40`, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#172D37', fontFamily: PP, marginBottom: 2 }}>{rcptFile.name}</div>
                {scanning ? (
                  <div style={{ fontSize: 10, color: '#90a4ae', fontFamily: PP }}>⏳ Reading receipt…</div>
                ) : rcptSource === 'ZATCA' ? (
                  <div style={{ fontSize: 10, color: '#2e7d32', fontFamily: PP }}>✓ ZATCA QR decoded — fields pre-filled</div>
                ) : (
                  <div style={{ fontSize: 10, color: '#795548', fontFamily: PP }}>📝 Receipt attached — fill fields manually on next step</div>
                )}
                <button onClick={() => fileRef.current?.click()}
                  style={{ marginTop: 4, fontSize: 10, color: L3, background: 'none', border: `1px solid ${L3}40`, borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontFamily: PP }}>
                  Change
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Lock error */}
      {lockInfo?.locked && (
        <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: '10px 12px', fontSize: 11, color: '#856404', fontFamily: PP, marginTop: 4 }}>
          🔒 <strong>Locked:</strong> {lockInfo.reason}
        </div>
      )}
    </div>
  )
}

// ── STEP 2 ────────────────────────────────────────────────────────────────────
function Step2({ records, recLoading, date, assignment, showAddForm, editingId, saveError, type, L3, onEdit, onAdd, formContent }) {
  const statusColor = s => ({ PENDING: '#e65100', SUBMITTED: '#1565c0', APPROVED: '#2e7d32', REJECTED: '#c62828' }[s] || '#546e7a')

  if (recLoading) return <div style={{ padding: 20, textAlign: 'center', color: '#90a4ae', fontFamily: PP, fontSize: 13 }}>Loading…</div>

  return (
    <div>
      {/* Site context pill */}
      {assignment && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {[assignment.site_masters?.site_name, assignment.projects?.project_number, date].filter(Boolean).map((v, i) => (
            <span key={i} style={{ background: i < 2 ? `${L3}18` : '#f1f5f9', color: i < 2 ? L3 : '#546e7a', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, fontFamily: PP }}>
              {v}
            </span>
          ))}
        </div>
      )}

      {/* Storage note */}
      <div style={{ background: '#e3f2fd', borderRadius: 4, padding: '5px 10px', marginBottom: 10, fontSize: 10, color: '#1565c0', fontFamily: PP }}>
        📌 Records saved to <strong>{type === 'expense' ? 'expense_records' : type === 'food' ? 'food_allowances' : 'overtime_requests'}</strong> — visible in this admin page list and in employee's expense claim.
      </div>

      {!showAddForm && !editingId && (
        <>
          <div style={secHd(L3)}>Existing Records for {date} ({records.length})</div>
          {records.length === 0 ? (
            <div style={{ padding: '10px 0', color: '#90a4ae', fontSize: 12, fontFamily: PP }}>No records found for this employee on this date.</div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              {records.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 4, marginBottom: 4, background: '#fafafa', border: '1px solid #e8ecf0', fontFamily: PP }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#172D37' }}>
                      {type === 'expense'  && `${r.category || '—'}  •  SAR ${(r.amount || 0).toLocaleString()}${r.vat_amount > 0 ? ` + VAT ${r.vat_amount.toFixed(2)} = SAR ${(r.amount + r.vat_amount).toFixed(2)}` : ''}`}
                      {type === 'food'     && `FA  •  ${r.no_days}d × SAR ${r.daily_rate}  =  SAR ${(r.total_amount||0).toLocaleString()}`}
                      {type === 'overtime' && `OT ${r.ot_type}  •  ${r.hours}h  •  SAR ${(r.total_amount||0).toLocaleString(undefined, {minimumFractionDigits:2})}`}
                    </div>
                    {r.vendor_name && <div style={{ fontSize: 10, color: '#90a4ae' }}>{r.vendor_name}</div>}
                    {r.remarks     && <div style={{ fontSize: 10, color: '#90a4ae' }}>{r.remarks}</div>}
                    {r.receipt_url && <a href={r.receipt_url} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: L3 }}>📎 View receipt</a>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: statusColor(r.status), background: `${statusColor(r.status)}18`, borderRadius: 4, padding: '2px 6px' }}>
                      {r.status}
                    </span>
                    {['PENDING','SUBMITTED'].includes(r.status) && (
                      <button onClick={() => onEdit(r)} style={{ background: `${L3}18`, color: L3, border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', fontFamily: PP }}>
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button onClick={onAdd} style={{ background: L3, color: '#fff', border: 'none', borderRadius: 4, padding: '8px 20px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: PP }}>
            + Add New Record
          </button>
        </>
      )}

      {(showAddForm || editingId) && (
        <>
          <div style={secHd(L3)}>{editingId ? 'Edit Record' : 'New Record'}</div>
          {saveError && (
            <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', borderRadius: 4, padding: '8px 10px', marginBottom: 10, fontSize: 11, color: '#c62828', fontFamily: PP }}>
              ❌ {saveError}
            </div>
          )}
          {formContent}
        </>
      )}
    </div>
  )
}

// ── FORM FIELDS ───────────────────────────────────────────────────────────────
function ExpenseFormFields({
  type, L3,
  expType, setExpType,
  amount, setAmount,
  vatOn, setVatOn, vatPct, setVatPct, vatNumber, setVatNumber,
  vendorName, setVendorName,
  projectNo, setProjectNo, siteNo, setSiteNo, jobNo, setJobNo,
  dailyRate, setDailyRate, noDays, setNoDays,
  location, setLocation, jobType, setJobType,
  otType, setOtType, hours, setHours, workType, setWorkType, otJobType, setOtJobType,
  remarks, setRemarks,
}) {
  if (type === 'expense') {
    const exclAmt  = parseFloat(amount) || 0
    const vatAmt   = vatOn ? Math.round(exclAmt * (parseFloat(vatPct) || 15) / 100 * 100) / 100 : 0
    const totalAmt = exclAmt + vatAmt

    return (
      <>
        {/* Expense Type */}
        <div style={{ marginBottom: 11 }}>
          <label style={lbl}>Expense Type *</label>
          <select value={expType} onChange={e => setExpType(e.target.value)} style={inp}>
            <option value="">— Select —</option>
            {EXPENSE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        {/* VAT toggle — above amounts so user decides mode first */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              onClick={() => setVatOn(v => !v)}
              style={{
                width: 42, height: 22, borderRadius: 11, cursor: 'pointer', flexShrink: 0,
                background: vatOn ? L3 : '#c9d5da',
                position: 'relative', transition: 'background 0.2s',
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: '50%', background: '#fff',
                position: 'absolute', top: 3,
                left: vatOn ? 23 : 3,
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: vatOn ? 800 : 500, color: vatOn ? L3 : '#90a4ae', fontFamily: PP }}>
              {vatOn ? 'VAT Applicable (15%)' : 'No VAT on this expense'}
            </span>
          </div>
          {vatOn && (
            <div style={{ fontSize: 10, color: '#546e7a', fontFamily: PP, marginTop: 4, marginLeft: 52 }}>
              Enter the amount <strong>excluding VAT</strong> — VAT and total are calculated automatically.
            </div>
          )}
        </div>

        {/* 3-column amount row: Excl. VAT | VAT Amount | Total Incl. VAT */}
        <div style={row}>
          <div style={col}>
            <label style={lbl}>Amount Excl. VAT (SAR) *</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              style={inp} placeholder="0.00" min="0" step="0.01" />
          </div>
          {vatOn && (
            <div style={{ flex: 0.7, minWidth: 90 }}>
              <label style={lbl}>VAT Amount</label>
              <div style={{ ...inp, background: '#f8f9fa', color: '#546e7a', pointerEvents: 'none', fontWeight: 700 }}>
                SAR {vatAmt.toFixed(2)}
              </div>
            </div>
          )}
          <div style={{ flex: 0.9, minWidth: 100 }}>
            <label style={lbl}>{vatOn ? 'Total Incl. VAT' : 'Amount'}</label>
            <div style={{ ...inp, background: '#f0f7ff', color: '#1565c0', pointerEvents: 'none', fontWeight: 700 }}>
              SAR {totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* VAT details — only when ON */}
        {vatOn && (
          <div style={row}>
            <div style={{ flex: 0.5, minWidth: 80 }}>
              <label style={lbl}>VAT %</label>
              <input type="number" value={vatPct} onChange={e => setVatPct(e.target.value)}
                style={inp} min="0" max="100" step="1" />
            </div>
            <div style={col}>
              <label style={lbl}>VAT Number *</label>
              <input value={vatNumber} onChange={e => setVatNumber(e.target.value)}
                style={{ ...inp, borderColor: !vatNumber ? '#ffc107' : '#dde3ec' }}
                placeholder="3XXXXXXXXXXXXX (required)" />
            </div>
          </div>
        )}

        {/* Project / Site / Job — mandatory: project+site, optional: job */}
        <div style={row}>
          <div style={col}>
            <label style={{ ...lbl, color: projectNo ? '#546e7a' : '#c62828' }}>
              Project No. * {!projectNo && <span style={{ fontWeight: 400, textTransform: 'none' }}>(required — resolved from assignment)</span>}
            </label>
            <input
              value={projectNo}
              onChange={e => setProjectNo(e.target.value)}
              style={{ ...inp, borderColor: !projectNo ? '#ffc107' : '#dde3ec' }}
              placeholder="e.g. P-2024-001"
            />
          </div>
          <div style={col}>
            <label style={{ ...lbl, color: siteNo ? '#546e7a' : '#c62828' }}>
              Site # * {!siteNo && <span style={{ fontWeight: 400, textTransform: 'none' }}>(required)</span>}
            </label>
            <input
              value={siteNo}
              onChange={e => setSiteNo(e.target.value)}
              style={{ ...inp, borderColor: !siteNo ? '#ffc107' : '#dde3ec' }}
              placeholder="e.g. S-042"
            />
          </div>
          <div style={{ flex: 0.7, minWidth: 90 }}>
            <label style={lbl}>Job # <span style={{ fontWeight: 400, textTransform: 'none', color: '#90a4ae' }}>(optional)</span></label>
            <input
              value={jobNo}
              onChange={e => setJobNo(e.target.value)}
              style={inp}
              placeholder="e.g. J-007"
            />
          </div>
        </div>

        {/* Vendor */}
        <div style={{ marginBottom: 11 }}>
          <label style={lbl}>Vendor / Biller Name</label>
          <input value={vendorName} onChange={e => setVendorName(e.target.value)} style={inp} placeholder="e.g. Saudi Aramco" />
        </div>

        {/* Remarks */}
        <div style={{ marginBottom: 11 }}>
          <label style={lbl}>Remarks / Admin Note</label>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
            style={{ ...inp, resize: 'vertical', minHeight: 56 }}
            placeholder="Reason for backdated entry…" />
        </div>
      </>
    )
  }

  if (type === 'food') {
    const total = (parseFloat(dailyRate)||0) * (parseFloat(noDays)||0)
    return (
      <>
        <div style={row}>
          <div style={col}>
            <label style={lbl}>Daily Rate (SAR)</label>
            <input type="number" value={dailyRate} onChange={e => setDailyRate(e.target.value)} style={inp} min="0" step="0.01" />
          </div>
          <div style={col}>
            <label style={lbl}>No. of Days</label>
            <input type="number" value={noDays} onChange={e => setNoDays(e.target.value)} style={inp} min="1" max="31" />
          </div>
          <div style={{ flex: 0.8, minWidth: 90 }}>
            <label style={lbl}>Total</label>
            <div style={{ ...inp, background: '#f8f9fa', color: '#546e7a', pointerEvents: 'none' }}>
              SAR {total.toLocaleString()}
            </div>
          </div>
        </div>
        <div style={row}>
          <div style={col}>
            <label style={lbl}>Location / Site</label>
            <input value={location} onChange={e => setLocation(e.target.value)} style={inp} placeholder="Site or location" />
          </div>
          <div style={col}>
            <label style={lbl}>Job Type</label>
            <select value={jobType} onChange={e => setJobType(e.target.value)} style={inp}>
              <option value="">— Select —</option>
              {FA_JOB_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 11 }}>
          <label style={lbl}>Remarks / Admin Note</label>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
            style={{ ...inp, resize: 'vertical', minHeight: 56 }} placeholder="Reason for backdated entry…" />
        </div>
      </>
    )
  }

  // overtime
  return (
    <>
      <div style={row}>
        <div style={col}>
          <label style={lbl}>OT Type</label>
          <select value={otType} onChange={e => setOtType(e.target.value)} style={inp}>
            {OT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={col}>
          <label style={lbl}>Hours *</label>
          <input type="number" value={hours} onChange={e => setHours(e.target.value)}
            style={inp} min="0.5" max="24" step="0.5" placeholder="e.g. 3" />
        </div>
      </div>
      <div style={row}>
        <div style={col}>
          <label style={lbl}>Work Type</label>
          <select value={workType} onChange={e => setWorkType(e.target.value)} style={inp}>
            {WORK_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={col}>
          <label style={lbl}>Job Type</label>
          <select value={otJobType} onChange={e => setOtJobType(e.target.value)} style={inp}>
            <option value="">— Select —</option>
            {OT_JOB_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 11 }}>
        <label style={lbl}>Remarks / Admin Note</label>
        <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
          style={{ ...inp, resize: 'vertical', minHeight: 56 }} placeholder="Reason for backdated entry…" />
      </div>
    </>
  )
}
