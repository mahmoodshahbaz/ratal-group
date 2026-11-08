import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import FormShell from '../components/FormShell'
import { GROUP_COLORS, CHAPTER_PALETTES } from '../styles/appStyles'
const MC = GROUP_COLORS.HR          // HR chapter = #795338
const L1 = CHAPTER_PALETTES.HR.L1  // #BCA99A
const L2 = CHAPTER_PALETTES.HR.L2  // #F7F2ED
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { printDocument } from '../lib/templatePrint'

// ═══════════════════════════════════════════════════════════════════════════
// Leave / Vacations Management — HR Chapter
// Features:
//   • 3-step wizard: Employee & Type → Leave Details → Review & Submit
//   • Leave Type is FIRST field — determines employee filter rules
//   • ANNUAL leave: only vacation_eligible employees shown
//   • Other leave types: all active employees in selected dept
//   • Auto-populates Category, Home Address, Telephone from employee record
//   • Annual-specific extra fields: Entitlement Cycle, Replacement During Absence
//   • Ticket eligibility badge for ANNUAL + ticket-eligible employees ≥ 21 days
//   • Saudi working day calculator (excludes Fri + Sat)
//   • Leave balance deduction / restoration on approve / reject / cancel
//   • Overstay levy: SAR 800 per 30-day period
//   • Colorful gradient KPI cards via ChapterPage kpis prop
//   • Sticky chapter-colored column headers
// ═══════════════════════════════════════════════════════════════════════════

const fmt   = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'
const TODAY = new Date().toISOString().slice(0,10)
const POPPINS = "'Poppins','Inter',system-ui,sans-serif"

// Ticket is included when Annual Leave ≥ this threshold (working days)
const TICKET_THRESHOLD_DAYS = 21

// Annual Leave rules
const ANNUAL_OVERSTAY_FREE_DAYS = 38   // up to 38 days: no levy
const IQAMA_LEVY_PER_MONTH      = 900  // SAR 900 per 30-day block beyond 38 days

// Saudi working days: Mon–Thu + Sun (skip Fri=5, Sat=6)
function saudiWorkingDays(start, end) {
  if (!start || !end) return 0
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end   + 'T00:00:00')
  if (e < s) return 0
  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    const day = cur.getDay()
    if (day !== 5 && day !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function calendarDays(start, end) {
  if (!start || !end) return 0
  const diff = (new Date(end+'T00:00:00') - new Date(start+'T00:00:00')) / 86400000
  return Math.max(0, Math.round(diff) + 1)
}

const LEAVE_TYPES = [
  { value:'ANNUAL',     label:'Annual Leave',            color:'#1565C0', useCalendar:true },
  { value:'EMERGENCY',  label:'Emergency',               color:'#e65100', useCalendar:true },
  { value:'SICK',       label:'Sick (short)',             color:'#6a1b9a', useCalendar:true },
  { value:'SICK_MAJOR', label:'Sick (major — 4 months)', color:'#c62828', useCalendar:true },
  { value:'UNPAID',     label:'Unpaid',                  color:'#546e7a', useCalendar:false },
  { value:'HAJJ',       label:'Hajj (once)',              color:'#2e7d32', useCalendar:true },
  { value:'MATERNITY',  label:'Maternity',               color:'#ad1457', useCalendar:true },
]
const TYPE_MAP = Object.fromEntries(LEAVE_TYPES.map(t => [t.value, t]))

const STATUS_CFG = {
  PENDING:   { label:'Pending',   bg:'#fff3e0', color:'#e65100' },
  APPROVED:  { label:'Approved',  bg:'#e8f5e9', color:'#2e7d32' },
  REJECTED:  { label:'Rejected',  bg:'#ffebee', color:'#c62828' },
  CANCELLED: { label:'Cancelled', bg:'#eceff1', color:'#546e7a' },
}

const BAL_FIELD = {
  ANNUAL:     'annual_leave_bal',
  EMERGENCY:  'emergency_leave_bal',
  SICK:       null,
  SICK_MAJOR: null,
  UNPAID:     null,
  HAJJ:       null,
  MATERNITY:  null,
}

function computeDays(lt, start, end) {
  const cfg = TYPE_MAP[lt]
  if (!cfg) return calendarDays(start, end)
  return cfg.useCalendar ? calendarDays(start, end) : saudiWorkingDays(start, end)
}

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'18px 22px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:14 },
  btn:   (c=MC) => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:POPPINS }),
  btnSm: (c=MC) => ({ background:c, color:'#fff', border:'none', borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:POPPINS }),
  inp:   { width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:POPPINS },
  label: { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4, fontFamily:POPPINS, letterSpacing:0.3, textTransform:'uppercase' },
  row:   { display:'flex', gap:12, marginBottom:14 },
  col:   { flex:1 },
  th:    { background:MC, color:'#fff', padding:'9px 10px', fontWeight:800, textAlign:'left', fontSize:10, letterSpacing:0.5, textTransform:'uppercase', fontFamily:POPPINS, position:'sticky', top:0, zIndex:2 },
  td:    { padding:'8px 10px', borderBottom:'1px solid #f0f4f8', color:'#1a2e3d', verticalAlign:'middle', fontSize:12, fontFamily:POPPINS },
  chip:  (bg,cl) => ({ display:'inline-block', padding:'2px 10px', borderRadius:20, fontSize:10, fontWeight:800, background:bg, color:cl, fontFamily:POPPINS }),
  badge: (c) => ({ display:'inline-flex', alignItems:'center', gap:6, background:c+'18', border:`1px solid ${c}55`, borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:700, color:c, fontFamily:POPPINS }),
  radio: { display:'flex', gap:24, alignItems:'center' },
  radioOpt: (active) => ({ display:'flex', alignItems:'center', gap:8, padding:'8px 16px', borderRadius:8, border:`2px solid ${active?MC:'#dde3ec'}`, background:active?L2:'#fff', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:POPPINS, color:active?MC:'#546e7a', transition:'all 0.15s' }),
}

function makeEmptyForm() {
  const end    = new Date(TODAY + 'T00:00:00'); end.setDate(end.getDate() + 30)
  const ret    = new Date(end);                 ret.setDate(ret.getDate() + 1)
  const endStr = end.toISOString().slice(0,10)
  const retStr = ret.toISOString().slice(0,10)
  return {
    employee_id:      '',
    leave_type:       'ANNUAL',
    start_date:       TODAY,
    end_date:         endStr,
    notes:            '',
    return_date:      retStr,
    // Annual-specific extra fields
    home_address:     '',
    telephone:        '',
    replacement_name: '',
    entitlement_cycle:'1_YEAR',
    // Past Availed Vacation History (manually entered on form)
    prev1_from: '', prev1_to: '', prev1_days: '',
    prev2_from: '', prev2_to: '', prev2_days: '',
    prev3_from: '', prev3_to: '', prev3_days: '',
  }
}
const EMPTY_FORM = makeEmptyForm()

export default function Vacations({ entityId, role }) {
  const [leaves,      setLeaves]      = useState([])
  const [employees,   setEmps]        = useState([])
  const [departments, setDepts]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showBanner,  setShowBanner]  = useState(false)
  const [showForm,    setShowForm]    = useState(false)
  const [wizardStep,  setWizardStep]  = useState(0)
  const [editItem,    setEditItem]    = useState(null)
  const [form,        setForm]        = useState(EMPTY_FORM)
  const [saving,      setSaving]      = useState(false)
  const [filter,      setFilter]      = useState({ type:'', status:'', dept:'', month:'' })
  const [formDeptId,  setFormDeptId]  = useState('')
  const [search,      setSearch]      = useState('')
  const [confirmId,   setConfirmId]   = useState(null)
  const [expandedRow, setExpandedRow] = useState(null)

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    if (!entityId) { console.warn('Vacations: entityId is empty, skipping load'); return }
    console.log('Vacations load() — entityId:', entityId)
    setLoading(true)

    // ── 1. Fetch employees (parallel: base + extras) ─────────────────────
    const [empResult, extResult] = await Promise.all([
      supabase.from('employees')
        .select('id, full_name, full_name_en, employee_number, department_id')
        .eq('entity_id', entityId)
        .neq('is_active', false)
        .order('full_name_en')
        .limit(500),
      supabase.from('employees')
        .select('id, annual_leave_bal, emergency_leave_bal, join_date, employee_category')
        .eq('entity_id', entityId)
        .limit(500),
    ])

    if (empResult.error) console.error('Vacations employees error:', empResult.error.message, empResult.error.details)
    if (extResult.error) console.warn('Vacations extras error (non-fatal):', extResult.error.message)

    const empData  = empResult.data  || []
    const empExtras = extResult.data || []
    console.log('Vacations: employees fetched =', empData.length)

    const extraMap = Object.fromEntries(empExtras.map(e => [e.id, e]))
    const merged   = empData.map(e => ({ ...e, ...(extraMap[e.id] || {}) }))

    // Set employees immediately — don't wait for vacations/departments
    setEmps(merged)

    // ── 2. Fetch vacations + departments (parallel) ───────────────────────
    const [lResult, dResult] = await Promise.all([
      supabase.from('vacations')
        .select('*')
        .eq('entity_id', entityId)
        .order('start_date', { ascending:false })
        .limit(500),
      supabase.from('departments')
        .select('id, dept_name, dept_code')
        .eq('entity_id', entityId)
        .order('dept_name'),
    ])

    if (lResult.error) console.error('Vacations leaves error:', lResult.error.message)
    if (dResult.error) console.error('Vacations depts error:',  dResult.error.message)

    setLeaves(lResult.data || [])
    setDepts(dResult.data  || [])
    setLoading(false)
  }

  const formDays = computeDays(form.leave_type, form.start_date, form.end_date)

  function fv(k, v) { setForm(p => ({ ...p, [k]:v })) }

  // Add N calendar days to a YYYY-MM-DD string, return YYYY-MM-DD
  function addDays(dateStr, n) {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T00:00:00')
    d.setDate(d.getDate() + n)
    return d.toISOString().slice(0, 10)
  }

  // When start date changes → auto-set end (+30d) and return (+31d)
  function onStartDateChange(v) {
    const newEnd    = addDays(v, 30)
    const newReturn = addDays(newEnd, 1)
    setForm(p => ({ ...p, start_date: v, end_date: newEnd, return_date: newReturn }))
  }

  // When end date changes → auto-set return (+1d), enforce min = start_date
  function onEndDateChange(v) {
    const clamped   = v < form.start_date ? form.start_date : v
    const newReturn = addDays(clamped, 1)
    setForm(p => ({ ...p, end_date: clamped, return_date: newReturn }))
  }

  // When return date changes → enforce min = end_date
  function onReturnDateChange(v) {
    const clamped = v < form.end_date ? form.end_date : v
    setForm(p => ({ ...p, return_date: clamped }))
  }

  // When leave type changes — reset employee (filter rules change)
  function onLeaveTypeChange(lt) {
    setForm(p => ({ ...p, leave_type: lt, employee_id: '' }))
    setFormDeptId('')
  }

  // When department changes — reset employee
  function onDeptChange(deptId) {
    setFormDeptId(deptId)
    fv('employee_id', '')
  }

  // When employee selected — fetch extra fields (home_address, mobile, vacation_ticket_eligible)
  // then auto-fill. Done as a separate lightweight query so the main employees list
  // never breaks even if these columns don't exist yet.
  async function onEmpChange(empId) {
    // Immediately set the id so the dropdown selection registers
    setForm(p => ({ ...p, employee_id: empId }))
    if (!empId) return
    try {
      const { data: extra } = await supabase
        .from('employees')
        .select('home_address, mobile, vacation_ticket_eligible')
        .eq('id', empId)
        .maybeSingle()
      if (extra) {
        setEmps(prev => prev.map(e => e.id === empId ? { ...e, ...extra } : e))
        setForm(p => ({
          ...p,
          home_address: extra.home_address || p.home_address || '',
          telephone:    extra.mobile       || p.telephone   || '',
        }))
      }
    } catch (_) { /* columns may not exist yet — silently ignore */ }
  }

  // Filtered employee list for the form dropdown
  function getFormEmployees() {
    // Step 1: exclude outsourced / contractor staff unless DH explicitly entitled them
    // (vacation_ticket_eligible = true acts as an override for non-standard arrangements)
    const INELIGIBLE_CATEGORIES = ['OUTSOURCED', 'CONTRACTOR', 'OUT', 'CON']
    const eligible = employees.filter(e => {
      const cat = (e.employee_category || '').toUpperCase()
      if (INELIGIBLE_CATEGORIES.includes(cat)) {
        return e.vacation_ticket_eligible === true  // only include if explicitly entitled
      }
      return true  // all other categories included by default
    })

    // Step 2: filter by department FK
    const byDept = !formDeptId
      ? eligible
      : eligible.filter(e => e.department_id === formDeptId)

    // Fallback: if no employees match the dept FK (data quality), show all eligible
    const pool = byDept.length > 0 ? byDept : eligible

    // Step 3: for ANNUAL also hide employees explicitly marked ineligible for vacation
    return pool.filter(e => form.leave_type !== 'ANNUAL' || e.vacation_ticket_eligible !== false)
  }

  function openNew() {
    setEditItem(null)
    setForm(makeEmptyForm())
    setFormDeptId('')
    setWizardStep(0)
    setShowForm(true)
  }

  function openEdit(lv) {
    setEditItem(lv)
    const emp = employees.find(e => e.id === lv.employee_id)
    setFormDeptId(emp?.department_id || '')
    setForm({
      employee_id:       lv.employee_id        || '',
      leave_type:        lv.vacation_type      || 'ANNUAL',
      start_date:        lv.start_date         || TODAY,
      end_date:          lv.end_date           || TODAY,
      notes:             lv.remarks            || '',
      return_date:       lv.actual_return_date || '',
      home_address:      lv.home_address       || emp?.home_address || '',
      telephone:         lv.telephone          || emp?.mobile      || '',
      replacement_name:  lv.replacement_name   || '',
      entitlement_cycle: lv.entitlement_cycle  || '1_YEAR',
      prev1_from: lv.prev1_from || '', prev1_to: lv.prev1_to || '', prev1_days: lv.prev1_days || '',
      prev2_from: lv.prev2_from || '', prev2_to: lv.prev2_to || '', prev2_days: lv.prev2_days || '',
      prev3_from: lv.prev3_from || '', prev3_to: lv.prev3_to || '', prev3_days: lv.prev3_days || '',
    })
    setWizardStep(0)
    setShowForm(true)
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function save() {
    if (!form.employee_id) { alert('Select employee'); return }
    if (form.end_date < form.start_date) { alert('End date must be on or after start date'); return }
    if (formDays <= 0) { alert('Invalid date range — 0 days'); return }
    // Annual leave: start date must be within the calendar year
    if (form.leave_type === 'ANNUAL') {
      const startYear = form.start_date.slice(0, 4)
      const currYear  = TODAY.slice(0, 4)
      if (startYear !== currYear) {
        alert(`Annual leave must start within ${currYear}. Return date may fall in January ${+currYear + 1}.`)
        return
      }
    }

    const emp = employees.find(e => e.id === form.employee_id)
    setSaving(true)

    const payload = {
      entity_id:          entityId,
      employee_id:        form.employee_id,
      vacation_type:      form.leave_type,                                // DB: vacation_type
      start_date:         form.start_date,
      end_date:           form.end_date,
      actual_return_date: form.return_date || null,                       // DB: actual_return_date
      total_days:         formDays,                                       // DB: total_days
      remarks:            form.notes || null,                             // DB: remarks
      vacation_status:    editItem ? editItem.vacation_status : 'PENDING', // DB: vacation_status
      ticket_eligible:    ticketEligible,
      // Annual-specific extra fields (requires SQL patch)
      ...(form.leave_type === 'ANNUAL' && {
        home_address:      form.home_address || null,
        telephone:         form.telephone    || null,
        replacement_name:  form.replacement_name || null,
        entitlement_cycle: form.entitlement_cycle || '1_YEAR',
        prev1_from: form.prev1_from || null, prev1_to: form.prev1_to || null, prev1_days: form.prev1_days ? +form.prev1_days : null,
        prev2_from: form.prev2_from || null, prev2_to: form.prev2_to || null, prev2_days: form.prev2_days ? +form.prev2_days : null,
        prev3_from: form.prev3_from || null, prev3_to: form.prev3_to || null, prev3_days: form.prev3_days ? +form.prev3_days : null,
      }),
    }

    let error
    if (editItem) {
      ;({ error } = await supabase.from('vacations').update(payload).eq('id', editItem.id))
    } else {
      ;({ error } = await supabase.from('vacations').insert(payload))
    }

    setSaving(false)
    if (error) { alert(error.message); return }
    setShowForm(false)
    setWizardStep(0)
    setEditItem(null)
    setForm(makeEmptyForm())
    load()
  }

  // ── Approve ───────────────────────────────────────────────────────────────
  async function approve(lv) {
    const balField = BAL_FIELD[lv.vacation_type]
    const days     = lv.total_days || 0
    await supabase.from('vacations').update({ vacation_status:'APPROVED', approved_by:'ADMIN' }).eq('id', lv.id)
    if (balField && days > 0) {
      const emp = employees.find(e => e.id === lv.employee_id)
      if (emp) {
        const cur = +(emp[balField] || 0)
        await supabase.from('employees').update({ [balField]: Math.max(0, cur - days) }).eq('id', emp.id)
        setEmps(prev => prev.map(e => e.id === emp.id ? { ...e, [balField]: Math.max(0, cur - days) } : e))
      }
    }
    setLeaves(prev => prev.map(l => l.id === lv.id ? { ...l, vacation_status:'APPROVED' } : l))
  }

  // ── Reject ────────────────────────────────────────────────────────────────
  async function reject(lv) {
    const balField = BAL_FIELD[lv.vacation_type]
    const days     = lv.total_days || 0
    await supabase.from('vacations').update({ vacation_status:'REJECTED' }).eq('id', lv.id)
    if (lv.vacation_status === 'APPROVED' && balField && days > 0) {
      const emp = employees.find(e => e.id === lv.employee_id)
      if (emp) {
        const cur = +(emp[balField] || 0)
        await supabase.from('employees').update({ [balField]: cur + days }).eq('id', emp.id)
        setEmps(prev => prev.map(e => e.id === emp.id ? { ...e, [balField]: cur + days } : e))
      }
    }
    setLeaves(prev => prev.map(l => l.id === lv.id ? { ...l, vacation_status:'REJECTED' } : l))
  }

  // ── Cancel ────────────────────────────────────────────────────────────────
  async function cancel(lv) {
    const balField = BAL_FIELD[lv.vacation_type]
    const days     = lv.total_days || 0
    await supabase.from('vacations').update({ vacation_status:'CANCELLED' }).eq('id', lv.id)
    if (lv.vacation_status === 'APPROVED' && balField && days > 0) {
      const emp = employees.find(e => e.id === lv.employee_id)
      if (emp) {
        const cur = +(emp[balField] || 0)
        await supabase.from('employees').update({ [balField]: cur + days }).eq('id', emp.id)
        setEmps(prev => prev.map(e => e.id === emp.id ? { ...e, [balField]: cur + days } : e))
      }
    }
    setLeaves(prev => prev.map(l => l.id === lv.id ? { ...l, vacation_status:'CANCELLED' } : l))
    setConfirmId(null)
  }

  // ── Overstay levy (Annual leave only) ────────────────────────────────────
  // Iqama renewal fee: SAR 900 per 30-day block of OVERSTAY beyond the 38-day free window
  // Overstay days are the extra days the employee was abroad beyond total_days
  async function setOverstay(id, overstay_days) {
    const levy = Math.ceil(Math.max(0, +overstay_days) / 30) * IQAMA_LEVY_PER_MONTH
    await supabase.from('vacations').update({ overstay_days:+overstay_days, levy_amount:levy }).eq('id', id)
    setLeaves(prev => prev.map(l => l.id === id ? { ...l, overstay_days:+overstay_days, levy_amount:levy } : l))
  }

  // ── Print Vacation Application Form ──────────────────────────────────────
  function printVacationForm(leave) {
    const emp = employees.find(e => e.id === leave.employee_id) || {}
    const dept = departments.find(d => d.id === emp.department_id)

    // Collect previous vacations (other approved leaves for this employee, sorted by date)
    const prev = leaves
      .filter(l => l.id !== leave.id && l.employee_id === leave.employee_id && l.vacation_status === 'APPROVED')
      .sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''))
      .slice(0, 3)

    const daysBetween = (a, b) => {
      if (!a || !b) return ''
      return Math.round((new Date(b) - new Date(a)) / 86400000)
    }

    // ── Build filename: VAC-YYYY-DEPT-EmployeeName-DDMMYY ──────────────────
    const now        = new Date()
    const dd         = String(now.getDate()).padStart(2, '0')
    const mm         = String(now.getMonth() + 1).padStart(2, '0')
    const yy         = String(now.getFullYear()).slice(2)
    const yearFull   = String(now.getFullYear())
    const deptCode   = dept?.dept_code || dept?.dept_abbreviation || 'HR'
    const safeName   = (emp.full_name_en || emp.full_name || 'Employee')
      .replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, ' ')
    const driveFileName = `VAC-${yearFull}-${deptCode}-${safeName}-${dd}${mm}${yy}.pdf`

    printDocument('vacation_application', {
      employee_name:     emp.full_name_en || emp.full_name || '',
      date_issued:       now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      home_address:      leave.home_address || emp.home_address || '',
      telephone:         leave.telephone    || emp.mobile || '',
      leave_type:        leave.vacation_type || 'ANNUAL',
      start_date:        leave.start_date   || '',
      end_date:          leave.end_date     || '',
      last_work_day:     leave.start_date
        ? new Date(new Date(leave.start_date) - 86400000).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })
        : '',
      rejoin_day:        leave.return_date
        ? new Date(leave.return_date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })
        : '',
      join_date_accsys:  emp.date_joined || emp.join_date || '',
      // Past vacation history — manual entries from form take priority, else auto from records
      prev1_from:  leave.prev1_from || prev[0]?.start_date || '',
      prev1_to:    leave.prev1_to   || prev[0]?.end_date   || '',
      prev1_days:  leave.prev1_days || (prev[0] ? daysBetween(prev[0].start_date, prev[0].end_date) : ''),
      prev2_from:  leave.prev2_from || prev[1]?.start_date || '',
      prev2_to:    leave.prev2_to   || prev[1]?.end_date   || '',
      prev2_days:  leave.prev2_days || (prev[1] ? daysBetween(prev[1].start_date, prev[1].end_date) : ''),
      prev3_from:  leave.prev3_from || prev[2]?.start_date || '',
      prev3_to:    leave.prev3_to   || prev[2]?.end_date   || '',
      prev3_days:  leave.prev3_days || (prev[2] ? daysBetween(prev[2].start_date, prev[2].end_date) : ''),
      prev_rejoin_date:  leave.prev_rejoin_date || prev[prev.length - 1]?.return_date || '',
      entitlement_cycle: leave.entitlement_cycle || '1_YEAR',
      entitled_days:     leave.total_days || '',
      replacement_name:  leave.replacement_name || '',
      leave_id:          leave.id || '',
      qr_base_url:       window.location.origin,
    }, {
      driveFolder:   'hr',
      driveFileName,
      orientation:   'portrait',
      requestDate:   leave.start_date || yearFull,
    })
  }

  // ── Excel export ──────────────────────────────────────────────────────────
  function exportExcel() {
    const rows = [['Employee','Dept','Type','Start','End','Return','Days','Status','Overstay','Levy (SAR)','Notes']]
    filtered.forEach(l => rows.push([
      (() => { const e=employees.find(x=>x.id===l.employee_id); return e?.full_name_en||e?.full_name||'' })(), (() => { const e=employees.find(x=>x.id===l.employee_id); return departments.find(d=>d.id===e?.department_id)?.dept_code||'' })(), l.vacation_type||'',
      l.start_date||'', l.end_date||'', l.actual_return_date||'',
      l.total_days||'', l.vacation_status||'',
      l.overstay_days||'', l.levy_amount||'', l.remarks||'',
    ]))
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿'+csv], { type:'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href=url; a.download=`Leave_Register_${TODAY}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = leaves
    .filter(l => !filter.type   || l.vacation_type   === filter.type)
    .filter(l => !filter.status || l.vacation_status === filter.status)
    .filter(l => !filter.dept   || employees.find(e=>e.id===l.employee_id)?.department_id === filter.dept)
    .filter(l => !filter.month  || (l.start_date||'').startsWith(filter.month))
    .filter(l => { if (!search) return true; const e = employees.find(x => x.id === l.employee_id); return (e?.full_name_en||e?.full_name||'').toLowerCase().includes(search.toLowerCase()) })

  // ── KPI ───────────────────────────────────────────────────────────────────
  const kpiPending  = leaves.filter(l => l.vacation_status === 'PENDING').length
  const kpiApproved = leaves.filter(l => l.vacation_status === 'APPROVED').length
  const kpiDays     = leaves.filter(l => l.vacation_status === 'APPROVED').reduce((s,l) => s+(+l.total_days||0), 0)
  const kpiOnLeave  = leaves.filter(l => {
    return l.vacation_status === 'APPROVED' && l.start_date <= TODAY && (l.end_date||l.start_date) >= TODAY
  }).length

  const months = [...new Set(leaves.map(l => (l.start_date||'').slice(0,7)).filter(Boolean))].sort().reverse().slice(0,12)
  const canEdit    = !role || ['SUPERADMIN','ADMIN','DEPT_HEAD'].includes(role)
  const canApprove = !role || ['SUPERADMIN','ADMIN'].includes(role)

  // ── Selected employee helper (used in form steps) ─────────────────────────
  const formEmp = employees.find(e => e.id === form.employee_id) || null

  // Ticket eligibility logic
  const ticketEligible = (
    form.leave_type === 'ANNUAL' &&
    !!formEmp?.vacation_ticket_eligible &&
    formDays >= TICKET_THRESHOLD_DAYS
  )

  // Filter bar node — passed to ChapterPage's filterBar prop so it lives in the sticky zone
  const filterBarNode = (
    <div style={{ ...S.card, padding:'12px 16px', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom:0 }}>
      <input style={{ ...S.inp, maxWidth:220 }} placeholder="Search name…" value={search} onChange={e=>setSearch(e.target.value)} />
      <select style={{ ...S.inp, maxWidth:160 }} value={filter.type} onChange={e=>setFilter(f=>({...f,type:e.target.value}))}>
        <option value="">All Types</option>
        {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <select style={{ ...S.inp, maxWidth:130 }} value={filter.status} onChange={e=>setFilter(f=>({...f,status:e.target.value}))}>
        <option value="">All Statuses</option>
        {Object.entries(STATUS_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      <select style={{ ...S.inp, maxWidth:150 }} value={filter.dept} onChange={e=>setFilter(f=>({...f,dept:e.target.value}))}>
        <option value="">All Depts</option>
        {departments.map(d => <option key={d.id} value={d.id}>{d.dept_code || d.dept_name || '—'}</option>)}
      </select>
      <select style={{ ...S.inp, maxWidth:130 }} value={filter.month} onChange={e=>setFilter(f=>({...f,month:e.target.value}))}>
        <option value="">All Months</option>
        {months.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
        <span style={{ fontSize:12, color:'#6b7c93', alignSelf:'center', fontFamily:POPPINS }}>{filtered.length} records</span>
        <button style={S.btn('#546e7a')} onClick={exportExcel}>⬇ Export</button>
        <button style={S.btn(MC)} onClick={openNew}>+ New Request</button>
      </div>
    </div>
  )

  return (
    <ChapterPage
      chapterName="HR"
      chapterIcon="🏖"
      chapterColor={MC}
      chapterSubtitle="Annual, sick, emergency, Hajj and maternity leave management"
      sectionTitle="Leave Register"
      onNew={() => setShowBanner(true)}
      newLabel="+ New Request"
      filterBar={filterBarNode}
      kpis={[
        { label:'Awaiting Approval',   value:kpiPending,       icon:'⏳', sub:'pending requests' },
        { label:'Approved This Year',  value:kpiApproved,      icon:'✅', sub:'total approved' },
        { label:'Total Approved Days', value:`${kpiDays}d`,   icon:'📅', sub:'calendar days' },
        { label:'On Leave Today',      value:kpiOnLeave,       icon:'🏖', sub:'currently absent' },
      ]}
    >
      {/* ── Step 0 Banner ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); openNew() }}
        chapterName="HR"
        formTitle={['New', 'Leave', 'Request']}
        heading="Submit and manage annual, sick, emergency, Hajj and maternity leave for all employees."
        iconLabel="🏖"
        workflowSteps={['Employee & Type', 'Leave Details', 'Review & Submit']}
      />

      {/* ── Leave Register Table (children = scrollable content area) ── */}
      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'#6b7c93', fontFamily:POPPINS }}>Loading leave records…</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, fontFamily:POPPINS }}>
              <thead>
                <tr>
                  {['Employee','Dept','Type','Start → End','Days','Status','Actions',''].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={8} style={{ ...S.td, textAlign:'center', color:'#aab2bd', padding:36 }}>No leave records match the current filters</td></tr>
                )}
                {filtered.map((l, i) => {
                  const typeCfg   = TYPE_MAP[l.vacation_type]   || { color:'#546e7a', label:l.vacation_type }
                  const statusCfg = STATUS_CFG[l.vacation_status] || { bg:'#eceff1', color:'#546e7a', label:l.vacation_status }
                  const isToday   = l.vacation_status==='APPROVED' && l.start_date<=TODAY && (l.end_date||l.start_date)>=TODAY
                  const emp       = employees.find(e => e.id === l.employee_id)
                  const isExpanded = expandedRow === l.id
                  return [
                    <tr key={l.id} style={{ background: i%2===0?'#fff':'#fafbfc', borderBottom: isExpanded ? 'none' : undefined }}>
                      <td style={{ ...S.td, fontWeight:700, whiteSpace:'nowrap' }}>
                        {isToday && <span style={{ fontSize:13, marginRight:4 }}>🏖</span>}
                        {emp?.full_name_en || emp?.full_name || '—'}
                      </td>
                      <td style={{ ...S.td, whiteSpace:'nowrap' }}>{departments.find(d => d.id === emp?.department_id)?.dept_code || '—'}</td>
                      <td style={{ ...S.td, whiteSpace:'nowrap' }}><span style={S.chip(typeCfg.color+'22', typeCfg.color)}>{typeCfg.label||l.vacation_type}</span></td>
                      <td style={{ ...S.td, whiteSpace:'nowrap', fontFamily:'monospace', fontSize:11 }}>
                        {l.start_date||'—'} → {l.end_date||'—'}
                      </td>
                      <td style={{ ...S.td, fontWeight:800, textAlign:'center', color:MC, whiteSpace:'nowrap' }}>{l.total_days ?? '—'}d</td>
                      <td style={{ ...S.td, whiteSpace:'nowrap' }}><span style={S.chip(statusCfg.bg, statusCfg.color)}>{statusCfg.label}</span></td>
                      <td style={{ ...S.td, whiteSpace:'nowrap' }}>
                        <div style={{ display:'flex', gap:4, flexWrap:'nowrap' }}>
                          {l.vacation_status === 'PENDING' && canApprove && <>
                            <button style={S.btnSm('#2e7d32')} onClick={() => approve(l)}>✓</button>
                            <button style={S.btnSm('#c62828')} onClick={() => reject(l)}>✗</button>
                          </>}
                          {l.vacation_status === 'PENDING' && canEdit &&
                            <button style={S.btnSm('#1565C0')} onClick={() => openEdit(l)}>✏</button>
                          }
                          {l.vacation_status === 'APPROVED' && (canApprove || canEdit) && <>
                            <button style={S.btnSm('#c62828')} onClick={() => reject(l)}>Revoke</button>
                            {confirmId === l.id
                              ? <button style={S.btnSm('#546e7a')} onClick={() => cancel(l)}>Confirm</button>
                              : <button style={S.btnSm('#546e7a')} onClick={() => setConfirmId(l.id)}>Cancel</button>
                            }
                          </>}
                        </div>
                      </td>
                      {/* Expand toggle */}
                      <td style={{ ...S.td, textAlign:'center', width:32 }}>
                        <button
                          onClick={() => setExpandedRow(isExpanded ? null : l.id)}
                          style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, color:'#94a3b8', padding:2, lineHeight:1 }}
                          title="Details"
                        >{isExpanded ? '▲' : '⋯'}</button>
                      </td>
                    </tr>,
                    isExpanded && (
                      <tr key={l.id+'-x'} style={{ background:'#f7f9fc' }}>
                        <td colSpan={8} style={{ padding:'10px 18px', borderBottom:'2px solid #e8ecf4' }}>
                          <div style={{ display:'flex', gap:28, flexWrap:'wrap', fontSize:11, fontFamily:POPPINS }}>
                            <div><div style={S.label}>Return Date</div><div style={{ fontWeight:700 }}>{fmt(l.actual_return_date) || '—'}</div></div>
                            {l.vacation_type === 'ANNUAL' && <>
                              <div><div style={S.label}>Entitlement</div><div style={{ fontWeight:700 }}>{l.entitlement_cycle === '2_YEAR' ? 'Every 2 Years' : 'Every 1 Year'}</div></div>
                              <div><div style={S.label}>Replacement</div><div style={{ fontWeight:700 }}>{l.replacement_name || '—'}</div></div>
                              <div><div style={S.label}>Home Address</div><div style={{ fontWeight:700, maxWidth:180 }}>{l.home_address || '—'}</div></div>
                              <div><div style={S.label}>Telephone</div><div style={{ fontWeight:700 }}>{l.telephone || '—'}</div></div>
                              <div><div style={S.label}>Ticket</div><div style={{ fontWeight:700, color:l.ticket_eligible?'#2e7d32':'#546e7a' }}>{l.ticket_eligible ? '✈ Eligible' : 'Not eligible'}</div></div>
                            </>}
                            <div>
                              <div style={S.label}>Overstay Days</div>
                              {l.vacation_status === 'APPROVED' ? (
                                <input type="number" min={0} max={365}
                                  defaultValue={l.overstay_days || 0}
                                  style={{ width:64, padding:'3px 6px', borderRadius:5, border:'1px solid #dde3ec', fontSize:11, fontFamily:POPPINS }}
                                  onBlur={e => setOverstay(l.id, e.target.value)} />
                              ) : <span style={{ fontWeight:700 }}>—</span>}
                            </div>
                            <div>
                              <div style={S.label}>Iqama Levy</div>
                              <div style={{ fontWeight:800, color:+l.levy_amount>0?'#c62828':'#aab2bd' }}>
                                {+l.levy_amount > 0 ? `SAR ${(+l.levy_amount).toLocaleString()}` : '—'}
                              </div>
                            </div>
                            {l.remarks && <div><div style={S.label}>Notes</div><div style={{ fontWeight:700, maxWidth:220 }}>{l.remarks}</div></div>}
                            <div style={{ marginLeft:'auto', alignSelf:'flex-start' }}>
                              <button
                                onClick={() => printVacationForm(l)}
                                style={{ padding:'5px 12px', borderRadius:6, border:'1.5px solid #1565C0', background:'#fff', color:'#1565C0', fontWeight:700, fontSize:11, fontFamily:POPPINS, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}
                                title="Print Vacation Application Form"
                              >🖨 Print Form</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )
                  ]
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Employee Leave Balances grid ── */}
      {employees.length > 0 && (
        <div style={S.card}>
          <div style={{ fontWeight:800, fontSize:14, color:'#1a2e3d', marginBottom:12, fontFamily:POPPINS }}>
            Employee Leave Balances
            <span style={{ fontWeight:400, fontSize:11, color:'#6b7c93', marginLeft:8 }}>Annual · Emergency (days remaining)</span>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))', gap:8 }}>
            {employees.map(e => {
              const annualBal  = +(e.annual_leave_bal    ?? 30)
              const emergBal   = +(e.emergency_leave_bal ?? 15)
              const annualPct  = Math.min(100, (annualBal / 30) * 100)
              const emergPct   = Math.min(100, (emergBal  / 15) * 100)
              const annualColor = annualPct >= 60 ? '#2e7d32' : annualPct >= 25 ? '#f57f17' : '#c62828'
              const emergColor  = emergPct  >= 60 ? '#1565C0' : emergPct  >= 25 ? '#f57f17' : '#c62828'
              return (
                <div key={e.id} style={{ background:'#f8fafc', borderRadius:10, padding:'12px 14px', border:'1px solid #edf2f7' }}>
                  <div style={{ fontWeight:700, fontSize:12, color:'#1a2e3d', marginBottom:2, fontFamily:POPPINS, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{e.full_name}</div>
                  <div style={{ fontSize:10, color:'#6b7c93', marginBottom:8, fontFamily:POPPINS }}>{departments.find(d => d.id === e.department_id)?.dept_code || '—'}</div>
                  <div style={{ display:'flex', gap:12, marginBottom:6 }}>
                    <div>
                      <div style={{ fontSize:9, color:'#6b7c93', fontFamily:POPPINS }}>ANNUAL</div>
                      <div style={{ fontSize:16, fontWeight:800, color:annualColor, fontFamily:POPPINS }}>{annualBal}<span style={{ fontSize:9, fontWeight:400, marginLeft:2 }}>d</span></div>
                    </div>
                    <div>
                      <div style={{ fontSize:9, color:'#6b7c93', fontFamily:POPPINS }}>EMERG</div>
                      <div style={{ fontSize:16, fontWeight:800, color:emergColor, fontFamily:POPPINS }}>{emergBal}<span style={{ fontSize:9, fontWeight:400, marginLeft:2 }}>d</span></div>
                    </div>
                  </div>
                  <div style={{ height:4, borderRadius:2, background:'#e2e8f0', overflow:'hidden', marginBottom:3 }}>
                    <div style={{ height:'100%', width:`${annualPct}%`, background:annualColor, transition:'width 0.3s' }} />
                  </div>
                  <div style={{ height:4, borderRadius:2, background:'#e2e8f0', overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${emergPct}%`, background:emergColor, transition:'width 0.3s' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          FORM MODAL — 3-step wizard
          Step 0: Leave Type → Department → Employee → Category
          Step 1: Dates + Annual-specific fields
          Step 2: Review & Submit
      ════════════════════════════════════════════════════════════════ */}
      <FormShell
        isOpen={showForm}
        onClose={() => { setShowForm(false); setWizardStep(0) }}
        chapterName="HR"
        title={editItem ? ['Edit', 'Leave', 'Request'] : ['New', 'Leave', 'Request']}
        steps={['Employee & Type', 'Leave Details', 'Review & Submit']}
        currentStep={wizardStep}
        onBack={() => {
          if (wizardStep === 0) { setShowForm(false); setWizardStep(0) }
          else setWizardStep(w => w - 1)
        }}
        backLabel={wizardStep === 0 ? 'Cancel' : '← Back'}
        onNext={() => {
          if (wizardStep === 0) {
            if (!form.leave_type)   { alert('Select a leave type'); return }
            if (!formDeptId)        { alert('Select a department'); return }
            if (!form.employee_id)  { alert('Select an employee'); return }
            setWizardStep(1)
          } else if (wizardStep === 1) {
            if (form.end_date < form.start_date) { alert('End date must be on or after start date'); return }
            if (formDays <= 0) { alert('Invalid date range — 0 days'); return }
            setWizardStep(2)
          } else {
            save()
          }
        }}
        nextLabel={wizardStep === 2 ? (saving ? '⏳ Saving…' : editItem ? '✓ Update' : '+ Submit Request') : 'Next →'}
        nextDisabled={saving}
        subjectLabel={{ line1: (d=>d?.dept_code||d?.dept_name||null)(departments.find(d=>d.id===form.department_id)), line2: employees.find(e=>e.id===form.employee_id)?.full_name_en || null }}
      >

        {/* ══════════════════════════════════════════
            STEP 0 — Leave Type → Dept → Employee → Category
        ══════════════════════════════════════════ */}
        {wizardStep === 0 && (
          <div>

            {/* Leave Type — FIRST */}
            <div style={{ marginBottom:16 }}>
              <label style={S.label}>Leave Type *</label>
              <select
                style={{ ...S.inp, borderLeft:`4px solid ${TYPE_MAP[form.leave_type]?.color || MC}` }}
                value={form.leave_type}
                onChange={e => onLeaveTypeChange(e.target.value)}
                disabled={!!editItem}
              >
                {LEAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              {/* Eligibility hint for Annual */}
              {form.leave_type === 'ANNUAL' && (
                <div style={{ marginTop:6, fontSize:11, color:'#1565C0', fontFamily:POPPINS, display:'flex', alignItems:'center', gap:4 }}>
                  <span>ℹ</span> Employees explicitly marked ineligible are hidden · ticket badge shown for eligible employees ≥ 21 days
                </div>
              )}
            </div>

            {/* Department */}
            <div style={{ marginBottom:16 }}>
              <label style={S.label}>Department *</label>
              <select
                style={S.inp}
                value={formDeptId}
                onChange={e => onDeptChange(e.target.value)}
                disabled={!!editItem}
              >
                <option value="">— Select Department —</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.dept_code || d.dept_name}</option>)}
              </select>
            </div>

            {/* Employee — filtered by dept + leave type eligibility */}
            <div style={{ marginBottom:16 }}>
              <label style={S.label}>Employee * <span style={{ fontWeight:400, color:'#6b7c93', textTransform:'none' }}>({employees.length} loaded · {getFormEmployees().length} match · eid:{entityId?.slice(-6)})</span></label>
              <select
                style={S.inp}
                value={form.employee_id}
                onChange={e => onEmpChange(e.target.value)}
                disabled={!!editItem || !formDeptId}
              >
                <option value="">— Select Employee —</option>
                {getFormEmployees().map(e => (
                  <option key={e.id} value={e.id}>
                    {e.full_name || e.full_name_en}{e.employee_number ? ' · '+e.employee_number : ''}
                  </option>
                ))}
              </select>
              {formDeptId && getFormEmployees().length === 0 && (
                <div style={{ marginTop:6, fontSize:11, color:'#c62828', fontFamily:POPPINS }}>
                  No active employees found — check entity filter or employee records
                </div>
              )}
            </div>

            {/* Category — auto-populated read-only */}
            {formEmp && (
              <div style={{ marginBottom:14 }}>
                <label style={S.label}>Employee Category</label>
                <div style={{ ...S.inp, background:'#f8fafc', color:'#546e7a', fontWeight:700, cursor:'default' }}>
                  {formEmp.employee_category || '—'}
                </div>
              </div>
            )}

            {/* Leave balance hint */}
            {formEmp && (
              <div style={{ background:L2, border:`1px solid ${L1}`, borderRadius:8, padding:'10px 14px', marginTop:4, display:'flex', gap:24 }}>
                <div>
                  <div style={{ fontSize:9, color:'#6b7c93', fontFamily:POPPINS, textTransform:'uppercase' }}>Annual Balance</div>
                  <div style={{ fontWeight:800, color:'#1565C0', fontFamily:POPPINS }}>{formEmp.annual_leave_bal ?? 30} days</div>
                </div>
                <div>
                  <div style={{ fontSize:9, color:'#6b7c93', fontFamily:POPPINS, textTransform:'uppercase' }}>Emergency Balance</div>
                  <div style={{ fontWeight:800, color:'#e65100', fontFamily:POPPINS }}>{formEmp.emergency_leave_bal ?? 15} days</div>
                </div>
                {formEmp.join_date && (
                  <div>
                    <div style={{ fontSize:9, color:'#6b7c93', fontFamily:POPPINS, textTransform:'uppercase' }}>Joined</div>
                    <div style={{ fontWeight:800, color:'#1a2e3d', fontFamily:POPPINS }}>{fmt(formEmp.join_date)}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════
            STEP 1 — Leave Details + Annual-specific fields
        ══════════════════════════════════════════ */}
        {wizardStep === 1 && (
          <div>
            {/* Date row */}
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>Start Date *</label>
                <input type="date" style={S.inp} value={form.start_date}
                  onChange={e => onStartDateChange(e.target.value)} />
              </div>
              <div style={S.col}>
                <label style={S.label}>End Date *</label>
                <input type="date" style={S.inp} value={form.end_date} min={form.start_date}
                  onChange={e => onEndDateChange(e.target.value)} />
              </div>
            </div>

            {/* Duration badge */}
            {form.start_date && form.end_date && (
              <div style={{ background: formDays > 0 ? '#e8f5e9' : '#ffebee', border:`1px solid ${formDays > 0 ? '#a5d6a7' : '#ef9a9a'}`, borderRadius:8, padding:'10px 14px', marginBottom:14, fontFamily:POPPINS }}>
                <span style={{ fontWeight:800, color: formDays > 0 ? '#2e7d32' : '#c62828', fontSize:15 }}>📅 {formDays} days</span>
                <span style={{ fontSize:11, color:'#6b7c93', marginLeft:8 }}>
                  {TYPE_MAP[form.leave_type]?.useCalendar ? 'calendar days' : 'Saudi working days (excl. Fri–Sat)'}
                  {' · '}{calendarDays(form.start_date, form.end_date)} calendar
                </span>
              </div>
            )}

            {/* Annual leave calendar-year note */}
            {form.leave_type === 'ANNUAL' && (
              <div style={{ background:'#e3f2fd', border:'1px solid #90caf9', borderRadius:8, padding:'8px 12px', marginBottom:14, fontSize:11, color:'#1565c0', fontFamily:POPPINS }}>
                📅 <strong>Calendar Year Rule:</strong> Annual leave must <strong>start</strong> within {TODAY.slice(0,4)}.
                Return date may fall in January {+TODAY.slice(0,4)+1} — still counted as this year's entitlement.
                {formDays > ANNUAL_OVERSTAY_FREE_DAYS && (
                  <div style={{ marginTop:4, color:'#e65100', fontWeight:700 }}>
                    ⚠ Duration exceeds {ANNUAL_OVERSTAY_FREE_DAYS} days — any actual overstay beyond total approved days will incur
                    Iqama renewal levy of SAR {IQAMA_LEVY_PER_MONTH}/month.
                  </div>
                )}
              </div>
            )}

            {/* Expected Return Date */}
            <div style={{ marginBottom:14 }}>
              <label style={S.label}>Expected Return Date</label>
              <input type="date" style={S.inp} value={form.return_date} min={form.end_date}
                onChange={e => onReturnDateChange(e.target.value)} />
            </div>

            {/* ── Annual Leave Extra Fields ── */}
            {form.leave_type === 'ANNUAL' && (
              <>
                <div style={{ borderTop:`2px solid ${L1}`, margin:'16px 0 14px', paddingTop:14 }}>
                  <div style={{ fontWeight:800, fontSize:12, color:MC, fontFamily:POPPINS, marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                    ✈ Annual Leave Details
                  </div>

                  {/* Home Address */}
                  <div style={{ marginBottom:14 }}>
                    <label style={S.label}>Home Address (during leave)</label>
                    <input
                      type="text"
                      style={S.inp}
                      value={form.home_address}
                      onChange={e => fv('home_address', e.target.value)}
                      placeholder="Pre-filled from employee record — editable"
                    />
                  </div>

                  {/* Telephone */}
                  <div style={{ marginBottom:14 }}>
                    <label style={S.label}>Telephone / Mobile</label>
                    <input
                      type="text"
                      style={S.inp}
                      value={form.telephone}
                      onChange={e => fv('telephone', e.target.value)}
                      placeholder="Contact number during leave"
                    />
                  </div>

                  {/* Entitlement Cycle */}
                  <div style={{ marginBottom:14 }}>
                    <label style={S.label}>Vacation Entitlement</label>
                    <div style={S.radio}>
                      {[
                        { value:'1_YEAR', label:'Every 1 Year' },
                        { value:'2_YEAR', label:'Every 2 Years' },
                      ].map(opt => (
                        <div
                          key={opt.value}
                          style={S.radioOpt(form.entitlement_cycle === opt.value)}
                          onClick={() => fv('entitlement_cycle', opt.value)}
                        >
                          <div style={{ width:16, height:16, borderRadius:'50%', border:`2px solid ${form.entitlement_cycle===opt.value?MC:'#dde3ec'}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                            {form.entitlement_cycle === opt.value && <div style={{ width:8, height:8, borderRadius:'50%', background:MC }} />}
                          </div>
                          {opt.label}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Past Availed Vacation History */}
                  <div style={{ marginBottom:14 }}>
                    <label style={{ ...S.label, marginBottom:8, display:'block' }}>
                      Past Availed Vacation History
                      <span style={{ fontWeight:400, color:'#94a3b8', marginLeft:6 }}>(up to 3 previous leaves)</span>
                    </label>
                    {/* Header row */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px', gap:6, marginBottom:4 }}>
                      {['From Date', 'To Date', 'Days'].map(h => (
                        <div key={h} style={{ fontSize:9, fontWeight:700, color:'#6b7c93', fontFamily:POPPINS, textTransform:'uppercase', letterSpacing:0.5 }}>{h}</div>
                      ))}
                    </div>
                    {/* 3 rows */}
                    {[1,2,3].map(n => (
                      <div key={n} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px', gap:6, marginBottom:6 }}>
                        <input type="date" style={{ ...S.inp, padding:'6px 8px' }}
                          value={form[`prev${n}_from`]}
                          onChange={e => {
                            const from = e.target.value
                            const to   = form[`prev${n}_to`]
                            const days = from && to
                              ? Math.max(0, Math.round((new Date(to) - new Date(from)) / 86400000))
                              : form[`prev${n}_days`]
                            setForm(p => ({ ...p, [`prev${n}_from`]: from, [`prev${n}_days`]: days || '' }))
                          }}
                        />
                        <input type="date" style={{ ...S.inp, padding:'6px 8px' }}
                          value={form[`prev${n}_to`]}
                          onChange={e => {
                            const to   = e.target.value
                            const from = form[`prev${n}_from`]
                            const days = from && to
                              ? Math.max(0, Math.round((new Date(to) - new Date(from)) / 86400000))
                              : form[`prev${n}_days`]
                            setForm(p => ({ ...p, [`prev${n}_to`]: to, [`prev${n}_days`]: days || '' }))
                          }}
                        />
                        <input type="number" min={0} max={365} style={{ ...S.inp, padding:'6px 8px' }}
                          value={form[`prev${n}_days`]}
                          onChange={e => fv(`prev${n}_days`, e.target.value)}
                          placeholder="Days"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Replacement During Absence — manual entry */}
                  <div style={{ marginBottom:4 }}>
                    <label style={S.label}>Arrangement — Replacement During Absence</label>
                    <select
                      style={S.inp}
                      value={form.replacement_name}
                      onChange={e => fv('replacement_name', e.target.value)}
                    >
                      <option value="">— Select replacement employee —</option>
                      {employees
                        .filter(e => e.id !== form.employee_id && (!formDeptId || e.department_id === formDeptId))
                        .map(e => (
                          <option key={e.id} value={e.full_name_en || e.full_name}>
                            {e.full_name_en || e.full_name}{e.employee_number ? ' · ' + e.employee_number : ''}
                          </option>
                        ))
                      }
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════
            STEP 2 — Review & Submit
        ══════════════════════════════════════════ */}
        {wizardStep === 2 && (
          <div>
            {/* Summary card */}
            <div style={{ background:L2, border:`1px solid ${L1}`, borderRadius:8, padding:'14px 16px', marginBottom:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 20px' }}>
                {[
                  ['Employee',    formEmp?.full_name || '—'],
                  ['Category',    formEmp?.employee_category || '—'],
                  ['Leave Type',  TYPE_MAP[form.leave_type]?.label || form.leave_type],
                  ['Department',  (() => { const d = departments.find(d=>d.id===formDeptId); return d ? (d.dept_code || d.dept_name) : '—' })()],
                  ['Start Date',  form.start_date],
                  ['End Date',    form.end_date],
                  ['Duration',    `${formDays} days`],
                  ['Return Date', form.return_date || '—'],
                  ...(form.leave_type === 'ANNUAL' ? [
                    ['Home Address',  form.home_address  || '—'],
                    ['Telephone',     form.telephone     || '—'],
                    ['Entitlement',   form.entitlement_cycle === '2_YEAR' ? 'Every 2 Years' : 'Every 1 Year'],
                    ['Replacement',   form.replacement_name  || '—'],
                  ] : []),
                ].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize:9, color:'#6b7c93', fontWeight:700, fontFamily:POPPINS, textTransform:'uppercase' }}>{k}</div>
                    <div style={{ fontWeight:600, color:'#1a2e3d', fontSize:12, fontFamily:POPPINS, marginTop:2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* ✈ Ticket eligibility badge */}
            {form.leave_type === 'ANNUAL' && formEmp && (
              <div style={{ marginBottom:14 }}>
                {ticketEligible ? (
                  <div style={S.badge('#1565C0')}>
                    ✈ Ticket Included — employee eligible · {formDays} days ≥ {TICKET_THRESHOLD_DAYS}-day threshold
                  </div>
                ) : formEmp.vacation_ticket_eligible ? (
                  <div style={S.badge('#f57f17')}>
                    ✈ Ticket Not Applicable — minimum {TICKET_THRESHOLD_DAYS} working days required ({formDays} days requested)
                  </div>
                ) : (
                  <div style={S.badge('#546e7a')}>
                    ✈ No Ticket — employee not ticket-eligible
                  </div>
                )}
              </div>
            )}

            {/* Leave balance check */}
            {formEmp && (() => {
              const balField = BAL_FIELD[form.leave_type]
              if (!balField) return null
              const bal  = +(formEmp[balField] || 0)
              const warn = formDays > bal
              return (
                <div style={{ background: warn ? '#fff3e0' : '#e8f5e9', border:`1px solid ${warn ? '#ffcc80' : '#a5d6a7'}`, borderRadius:8, padding:'10px 14px', marginBottom:14, fontFamily:POPPINS }}>
                  <span style={{ fontWeight:700, color: warn ? '#e65100' : '#2e7d32', fontSize:12 }}>
                    {warn
                      ? `⚠ Requested ${formDays} days exceeds balance of ${bal} days`
                      : `✓ Balance sufficient: ${bal} days available`}
                  </span>
                </div>
              )
            })()}

            {/* Notes */}
            <div style={{ marginBottom:4 }}>
              <label style={S.label}>Notes / Reason</label>
              <textarea
                style={{ ...S.inp, height:80, resize:'vertical' }}
                value={form.notes}
                onChange={e => fv('notes', e.target.value)}
                placeholder="Optional notes or reason for leave…"
              />
            </div>
          </div>
        )}

      </FormShell>
    </ChapterPage>
  )
}
