/**
 * FormDailyExpense.jsx — Daily Field Expense Entry
 *
 * Access: ALL active employees (STAFF, OUTSOURCED, DRIVER, etc.)
 * Auth:   QR token via useFieldAuth  (dev bypass: ?dev=1 in URL)
 *
 * Flow:
 *   1. Employee photographs invoice — ZATCA QR auto-fills vendor, VAT#, date, amount
 *   2. Employee confirms/corrects fields + selects category & site
 *   3. Late-submission check: invoice_date vs today
 *      0–30 days → OK  |  31–60 → warning + reason required  |  61–90 → blocked note
 *      >90 days  → hard block (contact Admin)
 *   4. VAT cross-check: extracted VAT vs 15% rule
 *   5. Duplicate invoice_number detection
 *   6. Record saved to expense_records (status: RECORDED)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase }       from '../lib/supabase'
import { uploadToDrive }  from '../hooks/useDriveUpload'
import { useFieldAuth }   from '../lib/useFieldAuth'
import { COA }            from '../lib/autoPost'

// ── Expense categories ─────────────────────────────────────────────────────────
export const EXPENSE_CATEGORIES = [
  { key:'FUEL',          label:'Fuel',              labelAr:'وقود',            icon:'⛽', coa: COA.FIELD_EXPENSES },
  { key:'ACCOMMODATION', label:'Accommodation',     labelAr:'إقامة',           icon:'🏨', coa: COA.TRAVEL },
  { key:'MEALS',         label:'Meals / Food',      labelAr:'وجبات',           icon:'🍽️', coa: COA.FOOD_ALLOWANCE },
  { key:'TRANSPORT',     label:'Transport / Taxi',  labelAr:'مواصلات',         icon:'🚗', coa: COA.TRANSPORT_ALLOWANCE },
  { key:'MATERIALS',     label:'Materials / Tools', labelAr:'مواد وأدوات',     icon:'🔧', coa: COA.MATERIALS },
  { key:'COMMUNICATION', label:'SIM / Internet',    labelAr:'اتصالات',         icon:'📱', coa: COA.TELECOM },
  { key:'OFFICE',        label:'Office Supplies',   labelAr:'مستلزمات مكتبية', icon:'📎', coa: COA.OFFICE_SUPPLIES },
  { key:'GOVT_FEES',     label:'Govt / Visa Fees',  labelAr:'رسوم حكومية',     icon:'🏛️', coa: COA.GOVT_FEES },
  { key:'PARKING',       label:'Parking / Toll',    labelAr:'مواقف / رسوم',    icon:'🅿️', coa: COA.FIELD_EXPENSES },
  { key:'MISC',          label:'Miscellaneous',     labelAr:'متنوعات',         icon:'📦', coa: COA.MISC },
]

// ── Helpers ────────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0] }
function minDate() {
  const d = new Date(); d.setMonth(d.getMonth() - 3, 1)
  return d.toISOString().split('T')[0]   // allow up to 3 months back (hard blocked at 90 days)
}
function isDevMode() {
  return new URLSearchParams(window.location.search).get('dev') === '1' ||
         localStorage.getItem('accsys_dev_mode') === '1'
}
function daysBetween(isoA, isoB) {
  if (!isoA || !isoB) return 0
  return Math.floor((new Date(isoB) - new Date(isoA)) / 86400000)
}
// Extract date from ZATCA TLV timestamp tag (ISO 8601: "2026-09-05T10:30:00Z")
function dateFromZATCATimestamp(ts) {
  if (!ts) return null
  const m = ts.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}
// Validate Saudi VAT registration number (15 digits, starts with 3)
function isValidVATNum(v) {
  return /^3\d{14}$/.test((v || '').trim())
}

// ── Late submission logic ──────────────────────────────────────────────────────
function lateStatus(invoiceDate) {
  if (!invoiceDate) return { level: 'ok', days: 0, label: '' }
  const days = daysBetween(invoiceDate, today())
  if (days <= 30)  return { level: 'ok',    days, label: '' }
  if (days <= 60)  return { level: 'warn',  days, label: `Invoice is ${days} days old — reason required` }
  if (days <= 90)  return { level: 'block', days, label: `Invoice is ${days} days old — contact your Department Head to approve this late entry` }
  return           { level: 'hard',  days, label: `Invoice is ${days} days old — this cannot be submitted. Please contact Accounts.` }
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = {
  wrap:    { minHeight:'100vh', background:'#f0f2f5', display:'flex', flexDirection:'column', alignItems:'center', paddingBottom:40 },
  header:  { width:'100%', background:'linear-gradient(135deg,#1a237e,#283593)', padding:'18px 20px 24px', color:'#fff', boxSizing:'border-box' },
  hTitle:  { fontSize:20, fontWeight:800, marginBottom:2 },
  hSub:    { fontSize:13, opacity:0.82 },
  body:    { width:'100%', maxWidth:480, padding:'0 14px', boxSizing:'border-box', marginTop:-10 },
  card:    { background:'#fff', borderRadius:16, padding:18, marginBottom:12, boxShadow:'0 2px 10px rgba(0,0,0,0.07)' },
  label:   { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.5px' },
  input:   { width:'100%', padding:'12px 13px', borderRadius:10, border:'1.5px solid #dde3ec', fontSize:15, outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
  select:  { width:'100%', padding:'12px 13px', borderRadius:10, border:'1.5px solid #dde3ec', fontSize:15, outline:'none', boxSizing:'border-box', fontFamily:'inherit', background:'#fff', appearance:'none', backgroundImage:'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%236b7c93\' d=\'M6 8L1 3h10z\'/%3E%3C/svg%3E")', backgroundRepeat:'no-repeat', backgroundPosition:'right 14px center', cursor:'pointer' },
  bigAmt:  { width:'100%', padding:'16px 13px', borderRadius:12, border:'2.5px solid #1a237e', fontSize:30, fontWeight:800, textAlign:'center', color:'#1a237e', outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
  sTitle:  { fontSize:14, fontWeight:800, color:'#1a2540', marginBottom:10 },
  toggle:  (on) => ({ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'13px 15px', borderRadius:12, border:`2px solid ${on?'#1a237e':'#dde3ec'}`, background: on?'#e8eaf6':'#fafbfc', cursor:'pointer' }),
  toggleLabel: { fontSize:14, fontWeight:600, color:'#1a2540' },
  togglePill:  (on) => ({ width:44, height:24, borderRadius:12, background: on?'#1a237e':'#cfd8dc', display:'flex', alignItems:'center', padding:'2px', transition:'all 0.2s', justifyContent: on?'flex-end':'flex-start' }),
  toggleDot: { width:20, height:20, borderRadius:10, background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,0.3)' },
  photoBox:  { border:'2px dashed #dde3ec', borderRadius:12, padding:20, textAlign:'center', cursor:'pointer', marginBottom:4 },
  submitBtn: (dis) => ({ width:'100%', padding:'17px', borderRadius:14, border:'none', background: dis?'#c9cdd4':'linear-gradient(135deg,#1a237e,#283593)', color:'#fff', fontSize:16, fontWeight:800, cursor: dis?'not-allowed':'pointer', marginBottom:8 }),
  siteBtn:   (sel) => ({ padding:'10px 13px', borderRadius:10, border:`2px solid ${sel?'#1a237e':'#dde3ec'}`, background: sel?'#e8eaf6':'#fafbfc', cursor:'pointer', marginBottom:6, textAlign:'left', width:'100%', boxSizing:'border-box' }),
  siteName:  { fontWeight:700, fontSize:13, color:'#1a2540' },
  siteSub:   { fontSize:11, color:'#6b7c93', marginTop:2 },
  err:       { background:'#ffebee', color:'#c62828', borderRadius:10, padding:'11px 14px', fontSize:13, fontWeight:600, marginBottom:12 },
  monthChip: { background:'#e8eaf6', color:'#1a237e', borderRadius:8, padding:'4px 12px', fontSize:12, fontWeight:700, display:'inline-block', marginTop:6 },
  successWrap:{ textAlign:'center', padding:'32px 20px' },
  newBtn:    { background:'linear-gradient(135deg,#1a237e,#283593)', color:'#fff', border:'none', borderRadius:12, padding:'14px 28px', fontSize:15, fontWeight:800, cursor:'pointer', marginTop:16 },
  banner:    (bg, color) => ({ borderRadius:10, padding:'10px 14px', fontSize:12, fontWeight:600, marginBottom:8, background:bg, color }),
  tag:       (bg, color) => ({ display:'inline-block', padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:800, background:bg, color, marginLeft:6 }),
  devBanner: { width:'100%', background:'#ff6f00', padding:'10px 16px', boxSizing:'border-box', display:'flex', alignItems:'center', gap:8 },
  devLabel:  { fontSize:11, fontWeight:800, color:'#fff', letterSpacing:1 },
  devCard:   { background:'#fff8e1', border:'2px solid #ffb300', borderRadius:16, padding:16, marginBottom:12, boxShadow:'0 2px 10px rgba(0,0,0,0.07)' },
  devTitle:  { fontSize:13, fontWeight:800, color:'#e65100', marginBottom:10, display:'flex', alignItems:'center', gap:6 },
  devRow:    { display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'5px 0', borderBottom:'1px solid #ffe082', fontSize:13 },
  devKey:    { color:'#6b7c93', fontWeight:600, minWidth:90 },
  devVal:    { color:'#1a2540', fontWeight:700, textAlign:'right', flex:1 },
  devSelect: { width:'100%', padding:'10px 13px', borderRadius:10, border:'2px solid #ffb300', fontSize:14, fontWeight:700, outline:'none', boxSizing:'border-box', fontFamily:'inherit', background:'#fffde7', cursor:'pointer', marginBottom:10 },
}

// ── Dev info panel ─────────────────────────────────────────────────────────────
function DevPanel({ employees, selectedEmp, onSelect, assignments }) {
  return (
    <div style={S.devCard}>
      <div style={S.devTitle}>🛠️ Testing Mode — QR Auto-fill Preview</div>
      <label style={{ ...S.label, color:'#e65100', marginBottom:4 }}>Select Employee (testing only)</label>
      <div style={{ fontSize:11, color:'#888', marginBottom:6 }}>
        {employees.length === 0 ? '⏳ Loading employees…' : `✅ ${employees.length} employee(s) loaded`}
      </div>
      <select style={S.devSelect} value={selectedEmp?.id || ''} onChange={e => onSelect(employees.find(x => x.id === e.target.value) || null)}>
        <option value="">— pick an employee —</option>
        {employees.map(e => <option key={e.id} value={e.id}>{e.full_name_en} · {e.designation || '—'}</option>)}
      </select>
      {selectedEmp && (<>
        <div style={{ fontSize:11, fontWeight:700, color:'#e65100', marginBottom:6, marginTop:4 }}>✅ In production captured from QR scan:</div>
        <div style={S.devRow}><span style={S.devKey}>Name</span><span style={S.devVal}>{selectedEmp.full_name_en}</span></div>
        <div style={S.devRow}><span style={S.devKey}>Dept</span><span style={S.devVal}>{selectedEmp.department || '—'}</span></div>
        <div style={S.devRow}><span style={S.devKey}>Designation</span><span style={S.devVal}>{selectedEmp.designation || '—'}</span></div>
        <div style={{ ...S.devRow, borderBottom:'none' }}>
          <span style={S.devKey}>Sites</span>
          <span style={S.devVal}>{assignments.length === 0 ? 'No active assignments' : assignments.map(a => `${a.site_number}${a.site_name ? ' · '+a.site_name : ''}`).join(', ')}</span>
        </div>
      </>)}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function FormDailyExpense() {
  const auth    = useFieldAuth()
  const devMode = isDevMode()

  // ── Dev mode state ────────────────────────────────────────────────────────────
  const [devEmployees,   setDevEmployees]   = useState([])
  const [devEmployee,    setDevEmployee]    = useState(null)
  const [devAssignments, setDevAssignments] = useState([])

  const emp         = devMode ? devEmployee    : auth.employee
  const assignments = devMode ? devAssignments : (auth.assignments || [])
  const entityId    = devMode ? (devEmployee?.entity_id || null) : auth.entityId

  // ── Form state ────────────────────────────────────────────────────────────────
  const BLANK = {
    expense_date:  today(),
    invoice_date:  '',         // THE date on the invoice (mandatory)
    invoice_number:'',         // invoice# from receipt (for duplicate check)
    assignment_id: '',
    category:      '',
    amount:        '',
    vat_paid:      false,
    vendor_name:   '',
    vat_number:    '',
    late_reason:   '',
    remarks:       '',
  }
  const [form,       setForm]       = useState(BLANK)
  const [photo,      setPhoto]      = useState(null)
  const [photoFile,  setPhotoFile]  = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [monthCount, setMonthCount] = useState(0)
  const [error,      setError]      = useState(null)
  const [scanning,   setScanning]   = useState(false)
  const [scanData,   setScanData]   = useState(null)
  const [dupWarning, setDupWarning] = useState(null)   // duplicate invoice warning
  const [vatXCheck,  setVatXCheck]  = useState(null)   // VAT cross-check result
  const [vatPeriod,  setVatPeriod]  = useState(null)   // 'OK'|'LOCKED'

  const fileRef = useRef()
  const f = form   // shorthand

  // ── Load dev employees ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!devMode) return
    supabase.rpc('get_dev_employees').then(({ data }) => setDevEmployees(data || []))
  }, [])

  useEffect(() => {
    if (!devEmployee) { setDevAssignments([]); return }
    supabase.from('site_assignments')
      .select('id, site_number, site_name, scope_type, role_on_site, assigned_from, assigned_to, project:project_id(id,project_number,project_name), contractor:contractor_id(id,contractor_name)')
      .eq('employee_id', devEmployee.id).eq('is_active', true).order('assigned_from', { ascending: false })
      .then(({ data }) => {
        const a = data || []
        setDevAssignments(a)
        if (a.length === 1) setForm(f => ({ ...f, assignment_id: a[0].id }))
        else setForm(f => ({ ...f, assignment_id: '' }))
      })
  }, [devEmployee])

  useEffect(() => {
    if (!emp) return
    loadMonthCount(emp.id)
    if (!devMode && assignments.length === 1) setForm(f => ({ ...f, assignment_id: assignments[0].id }))
  }, [emp?.id])

  async function loadMonthCount(empId) {
    const period = today().slice(0, 7)
    const { count } = await supabase.from('expense_records').select('id', { count:'exact', head:true }).eq('employee_id', empId).like('expense_date', `${period}%`)
    setMonthCount(count || 0)
  }

  // ── VAT period check whenever invoice_date changes ────────────────────────────
  useEffect(() => {
    if (!f.invoice_date || !entityId) { setVatPeriod(null); return }
    supabase.rpc('check_invoice_vat_period', { p_invoice_date: f.invoice_date, p_entity_id: entityId })
      .then(({ data }) => setVatPeriod(data || 'OK'))
  }, [f.invoice_date, entityId])

  // ── VAT cross-check ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!f.vat_paid || !scanData?.totalWithVat || !scanData?.vatAmount) { setVatXCheck(null); return }
    const total    = parseFloat(scanData.totalWithVat) || 0
    const vatAmt   = parseFloat(scanData.vatAmount)    || 0
    const net      = total - vatAmt
    const expected = Math.round(net * 0.15 * 100) / 100
    const diff     = Math.abs(vatAmt - expected)
    setVatXCheck(diff <= 1 ? { ok: true } : { ok: false, expected, actual: vatAmt, diff })
  }, [f.vat_paid, scanData])

  // ── Duplicate invoice check ────────────────────────────────────────────────────
  const checkDuplicate = useCallback(async (invoiceNum, vendorName) => {
    if (!invoiceNum || !emp?.id) { setDupWarning(null); return }
    const { data } = await supabase.rpc('check_duplicate_invoice', {
      p_employee_id: emp.id, p_invoice_number: invoiceNum, p_vendor_name: vendorName || null
    })
    if (data?.duplicate) setDupWarning(data)
    else setDupWarning(null)
  }, [emp?.id])

  // ── Derived values ─────────────────────────────────────────────────────────────
  const rawAmount  = parseFloat(f.amount) || 0
  const vatAmount  = f.vat_paid ? Math.round(rawAmount / 1.15 * 0.15 * 100) / 100 : 0
  const netAmount  = f.vat_paid ? Math.round(rawAmount / 1.15 * 100) / 100 : rawAmount
  const selCat     = EXPENSE_CATEGORIES.find(c => c.key === f.category)
  const selAssign  = assignments.find(a => a.id === f.assignment_id)
  const late       = lateStatus(f.invoice_date)
  const isHardBlock = late.level === 'hard'
  const needsReason = (late.level === 'warn' || late.level === 'block') && !f.late_reason.trim()
  const canSubmit  = f.category && rawAmount > 0 && !!emp && f.invoice_date
                     && !isHardBlock && !needsReason && late.level !== 'block'

  // ── ZATCA QR TLV decoder ───────────────────────────────────────────────────────
  function decodeZATCAQR(rawValue) {
    try {
      const bytes = Uint8Array.from(atob(rawValue), c => c.charCodeAt(0))
      const tags  = { 1:'seller', 2:'vatNumber', 3:'timestamp', 4:'totalWithVat', 5:'vatAmount' }
      let i = 0; const result = {}
      while (i < bytes.length - 1) {
        const tag = bytes[i++]; const len = bytes[i++]
        if (i + len > bytes.length) break
        result[tags[tag] || `t${tag}`] = new TextDecoder().decode(bytes.slice(i, i + len))
        i += len
      }
      return result
    } catch { return {} }
  }

  // ── Handle photo — ZATCA QR scan + auto-fill ──────────────────────────────────
  async function handlePhotoSelect(file) {
    if (!file) return
    setPhotoFile(file); setPhoto(URL.createObjectURL(file)); setScanData(null)
    if (!('BarcodeDetector' in window)) return

    setScanning(true)
    try {
      const bitmap   = await createImageBitmap(file)
      const detector = new BarcodeDetector({ formats: ['qr_code'] })
      const codes    = await detector.detect(bitmap)

      for (const code of codes) {
        const parsed = decodeZATCAQR(code.rawValue)
        if (parsed.vatNumber || parsed.seller) {
          // Extract invoice date from ZATCA timestamp (Tag 3)
          const invDate = dateFromZATCATimestamp(parsed.timestamp)

          setScanData(parsed)
          setForm(prev => ({
            ...prev,
            vendor_name:    prev.vendor_name || parsed.seller   || '',
            vat_number:     prev.vat_number  || parsed.vatNumber|| '',
            invoice_date:   prev.invoice_date|| invDate         || '',
            amount:         prev.amount      || (parsed.totalWithVat ? parseFloat(parsed.totalWithVat).toFixed(2) : ''),
            vat_paid:       !!parsed.totalWithVat,
          }))
          break
        }
      }
    } catch(e) { console.log('[QR scan]', e.message) }
    finally    { setScanning(false) }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!canSubmit) return
    setError(null); setSubmitting(true)

    try {
      let receiptUrl = null
      if (photoFile) {
        const empShort   = (emp.full_name_en || '').split(' ').slice(0,2).join('_').toUpperCase().replace(/[^A-Z0-9_]/g,'')
        const filePrefix = `${empShort}_${f.category}_SAR${Math.round(rawAmount)}_${f.expense_date}`
        const result     = await uploadToDrive(photoFile, 'expenses', filePrefix)
        if (result) receiptUrl = result.viewUrl
      }

      const { data: rpcResult, error: insErr } = await supabase.rpc('submit_expense_record', {
        payload: {
          entity_id:        entityId,
          employee_id:      emp.id,
          expense_date:     f.expense_date,
          invoice_date:     f.invoice_date   || f.expense_date,
          invoice_number:   f.invoice_number.trim() || null,
          project_id:       selAssign?.project?.id || null,
          site_number:      selAssign?.site_number || null,
          category:         f.category,
          coa_account_code: selCat?.coa || COA.MISC,
          amount:           String(rawAmount),
          vat_paid:         String(f.vat_paid),
          vat_amount:       String(vatAmount),
          vendor_name:      f.vendor_name.trim() || null,
          vat_number:       f.vat_number.trim()  || null,
          receipt_url:      receiptUrl,
          remarks:          f.remarks.trim()     || null,
          late_reason:      f.late_reason.trim() || null,
        }
      })
      if (insErr)           throw insErr
      if (rpcResult?.error) throw new Error(rpcResult.error)

      // Check if VAT period was locked — show advisory on success
      if (rpcResult?.vat_status === 'LOCKED') {
        setSubmitted({ vatLocked: true })
      } else {
        setSubmitted(true)
      }
      loadMonthCount(emp.id)
    } catch (err) {
      setError(err.message || 'Failed to save expense')
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setForm(BLANK); setPhoto(null); setPhotoFile(null)
    setSubmitted(false); setError(null); setScanData(null)
    setDupWarning(null); setVatXCheck(null); setVatPeriod(null)
  }

  // ── Auth guard ─────────────────────────────────────────────────────────────────
  if (!devMode) {
    if (auth.loading) return <div style={{ padding:40, textAlign:'center', color:'#6b7c93' }}>Loading…</div>
    if (auth.error || !auth.employee) return (
      <div style={{ padding:40, textAlign:'center', color:'#c62828' }}>
        <div style={{ fontSize:48 }}>🔒</div>
        <div style={{ fontWeight:700, marginTop:12 }}>Scan your QR code to continue.</div>
      </div>
    )
  }

  // ── Success screen ─────────────────────────────────────────────────────────────
  if (submitted) return (
    <div style={S.wrap}>
      {devMode && <div style={S.devBanner}><span style={S.devLabel}>🛠️ TESTING MODE</span></div>}
      <div style={S.header}>
        <div style={S.hTitle}>📝 Daily Expense</div>
        <div style={S.hSub}>{emp?.full_name_en || '—'}</div>
      </div>
      <div style={{ ...S.body, marginTop:12 }}>
        <div style={S.card}>
          <div style={S.successWrap}>
            <div style={{ fontSize:56 }}>✅</div>
            <div style={{ fontSize:20, fontWeight:800, color:'#1a237e', marginTop:12 }}>Expense Recorded</div>
            <div style={{ color:'#6b7c93', fontSize:13, marginTop:8 }}>
              SAR {rawAmount.toLocaleString('en-US',{minimumFractionDigits:2})} · {selCat?.icon} {selCat?.label}
            </div>
            {submitted?.vatLocked && (
              <div style={{ background:'#fff3e0', borderRadius:8, padding:'8px 12px', marginTop:12, fontSize:12, color:'#e65100' }}>
                ⚠️ Note: this invoice date falls in a closed VAT quarter. Your Accounts team has been notified.
              </div>
            )}
            <div style={S.monthChip}>{monthCount} expense{monthCount!==1?'s':''} this month</div>
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={reset} style={{ ...S.newBtn, flex:1 }}>+ Add Another</button>
            <button onClick={() => window.location.href='/forms'} style={{ ...S.newBtn, flex:1, background:'#e8eaf6', color:'#1a237e' }}>← Back</button>
          </div>
        </div>
      </div>
    </div>
  )

  // ── Main form ──────────────────────────────────────────────────────────────────
  return (
    <div style={S.wrap}>
      {devMode && <div style={S.devBanner}><span style={S.devLabel}>🛠️ TESTING MODE — not visible to employees</span></div>}

      <div style={S.header}>
        <div style={S.hTitle}>📝 Daily Expense</div>
        <div style={S.hSub}>
          {emp ? `${emp.full_name_en} · ${monthCount} recorded this month` : 'Select employee below to test'}
        </div>
      </div>

      <div style={S.body}>

        {devMode && (
          <DevPanel employees={devEmployees} selectedEmp={devEmployee} onSelect={setDevEmployee} assignments={devAssignments} />
        )}
        {devMode && !devEmployee && (
          <div style={{ ...S.card, textAlign:'center', color:'#9e9e9e', padding:28 }}>
            <div style={{ fontSize:32, marginBottom:8 }}>👆</div>
            <div style={{ fontSize:14, fontWeight:600 }}>Select an employee above to load the form</div>
          </div>
        )}

        {(!devMode || devEmployee) && (<>

          {/* ── STEP 1: Photo the invoice first ────────────────────────────── */}
          <div style={S.card}>
            <div style={S.sTitle}>
              📷 Step 1 — Photograph the Invoice
              {scanning && <span style={{ fontSize:12, fontWeight:400, color:'#1565c0', marginLeft:8 }}>⏳ Reading…</span>}
              {!scanning && scanData && <span style={S.tag('#e8f5e9','#2e7d32')}>✅ Auto-filled</span>}
            </div>
            <div style={{ ...S.photoBox, borderColor: scanData ? '#2e7d32' : photo ? '#1a237e' : '#dde3ec' }} onClick={() => fileRef.current?.click()}>
              {photo
                ? <img src={photo} alt="receipt" style={{ maxHeight:140, maxWidth:'100%', borderRadius:8, objectFit:'contain' }} />
                : <div>
                    <div style={{ fontSize:32, marginBottom:6 }}>📷</div>
                    <div style={{ fontSize:13, color:'#6b7c93' }}>Tap to photograph receipt — date, amount &amp; VAT# auto-fill from QR</div>
                  </div>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e => handlePhotoSelect(e.target.files[0])} />

            {!scanning && scanData && (
              <div style={S.banner('#e8f5e9','#2e7d32')}>
                ✅ <strong>Auto-read from receipt:</strong>{' '}
                {scanData.seller && <span>{scanData.seller}</span>}
                {scanData.vatNumber && <span> · VAT# {scanData.vatNumber}</span>}
                {scanData.timestamp && dateFromZATCATimestamp(scanData.timestamp) && <span> · Date {dateFromZATCATimestamp(scanData.timestamp)}</span>}
                {scanData.totalWithVat && <span> · SAR {parseFloat(scanData.totalWithVat).toFixed(2)}</span>}
              </div>
            )}
            {!scanning && photo && !scanData && (
              <div style={S.banner('#fff8e1','#f57f17')}>⚠️ No QR found on receipt — please fill all fields manually below</div>
            )}
            {!scanning && !photo && (
              <div style={S.banner('#e3f2fd','#1565c0')}>💡 Saudi VAT invoices have a QR code — photographing it fills in vendor, date &amp; amounts automatically</div>
            )}
          </div>

          {/* ── STEP 2: Invoice Date (mandatory) ───────────────────────────── */}
          <div style={S.card}>
            <label style={S.label}>
              Invoice Date
              <span style={{ textTransform:'none', fontWeight:400, color:'#9e9e9e' }}> (date printed on the invoice)</span>
              {scanData?.timestamp && dateFromZATCATimestamp(scanData.timestamp) && (
                <span style={S.tag('#e8f5e9','#2e7d32')}>auto-filled</span>
              )}
            </label>
            <input
              type="date" value={f.invoice_date} min={minDate()} max={today()}
              onChange={e => setForm(prev => ({ ...prev, invoice_date: e.target.value }))}
              style={{ ...S.input, borderColor: !f.invoice_date ? '#e53935' : late.level==='ok'?'#2e7d32' : late.level==='warn'?'#f57f17' : '#e53935' }}
            />
            {!f.invoice_date && (
              <div style={{ fontSize:11, color:'#e53935', marginTop:4, fontWeight:600 }}>⚠️ Invoice date is required</div>
            )}

            {/* Late submission warnings */}
            {f.invoice_date && late.level === 'warn' && (
              <div style={S.banner('#fff8e1','#e65100')}>
                ⚠️ <strong>Late submission ({late.days} days old).</strong> You must explain why this invoice is being submitted late.
              </div>
            )}
            {f.invoice_date && late.level === 'block' && (
              <div style={S.banner('#fce4ec','#c62828')}>
                🔶 <strong>Invoice is {late.days} days old.</strong> Your Department Head must approve this late submission. Enter a reason and submit — your DH will see a flag on this entry.
              </div>
            )}
            {f.invoice_date && late.level === 'hard' && (
              <div style={S.banner('#b71c1c','#fff')}>
                🚫 <strong>Invoice is {late.days} days old — submission not allowed.</strong> Please contact your Accounts department to process this invoice.
              </div>
            )}

            {/* Reason field — shown when warn or block */}
            {f.invoice_date && (late.level === 'warn' || late.level === 'block') && (
              <div style={{ marginTop:8 }}>
                <label style={S.label}>Reason for Late Submission <span style={{ color:'#e53935' }}>*</span></label>
                <textarea
                  rows={2}
                  placeholder="e.g. Invoice was with the site PM, received today. / Was on remote site without internet access."
                  value={f.late_reason}
                  onChange={e => setForm(prev => ({ ...prev, late_reason: e.target.value }))}
                  style={{ ...S.input, resize:'none', borderColor: !f.late_reason.trim() ? '#e53935' : '#2e7d32' }}
                />
              </div>
            )}

            {/* VAT period warning */}
            {vatPeriod === 'LOCKED' && f.invoice_date && (
              <div style={S.banner('#fff3e0','#e65100')}>
                📅 <strong>VAT period warning:</strong> This invoice date falls in a quarter that may already be filed with ZATCA. Accounts will be notified and may need to carry it to the current period.
              </div>
            )}
          </div>

          {/* ── STEP 3: Category ────────────────────────────────────────────── */}
          <div style={S.card}>
            <label style={S.label}>What did you spend on?</label>
            <select
              style={{ ...S.select, borderColor: f.category ? '#1a237e' : '#dde3ec', fontSize:16 }}
              value={f.category}
              onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
            >
              <option value="">— Select category —</option>
              {EXPENSE_CATEGORIES.map(cat => (
                <option key={cat.key} value={cat.key}>{cat.icon}  {cat.label}  ·  {cat.labelAr}</option>
              ))}
            </select>
          </div>

          {/* ── STEP 4: Amount + VAT ────────────────────────────────────────── */}
          <div style={S.card}>
            <div style={S.sTitle}>
              Amount (SAR)
              {scanData?.totalWithVat && <span style={S.tag('#e8f5e9','#2e7d32')}>auto-filled</span>}
            </div>
            <input
              type="number" inputMode="decimal" placeholder="0.00"
              value={f.amount}
              onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))}
              style={S.bigAmt}
            />
            {rawAmount > 0 && (
              <div style={{ textAlign:'center', fontSize:12, color:'#6b7c93', marginTop:6 }}>
                SAR {rawAmount.toLocaleString('en-US', { minimumFractionDigits:2 })} total
              </div>
            )}

            <div style={{ marginTop:14 }}>
              <div style={S.toggle(f.vat_paid)} onClick={() => setForm(prev => ({ ...prev, vat_paid: !prev.vat_paid }))}>
                <div>
                  <div style={S.toggleLabel}>💳 VAT included in this amount?</div>
                  {f.vat_paid && rawAmount > 0 && (
                    <div style={{ fontSize:12, color:'#1a237e', marginTop:2 }}>
                      Net: SAR {netAmount.toLocaleString('en-US',{minimumFractionDigits:2})} + VAT: SAR {vatAmount.toLocaleString('en-US',{minimumFractionDigits:2})}
                    </div>
                  )}
                </div>
                <div style={S.togglePill(f.vat_paid)}><div style={S.toggleDot}/></div>
              </div>
            </div>

            {/* VAT cross-check result */}
            {vatXCheck && !vatXCheck.ok && (
              <div style={S.banner('#fff8e1','#e65100')}>
                ⚠️ VAT mismatch: Receipt QR shows VAT SAR {vatXCheck.actual.toFixed(2)}, but 15% of net = SAR {vatXCheck.expected.toFixed(2)} (difference: SAR {vatXCheck.diff.toFixed(2)}). Please verify the amount.
              </div>
            )}
            {vatXCheck?.ok && (
              <div style={S.banner('#e8f5e9','#2e7d32')}>✅ VAT amount verified — matches 15% of net amount</div>
            )}
          </div>

          {/* ── Vendor, VAT#, Invoice # ─────────────────────────────────────── */}
          <div style={S.card}>
            <label style={S.label}>
              Vendor / Supplier Name
              {scanData?.seller && <span style={S.tag('#e8f5e9','#2e7d32')}>auto-filled</span>}
            </label>
            <input
              type="text" placeholder="e.g. ADNOC, Al Jazeera Hotel…"
              value={f.vendor_name}
              onChange={e => setForm(prev => ({ ...prev, vendor_name: e.target.value }))}
              style={{ ...S.input, marginBottom:12 }}
            />

            <label style={S.label}>
              VAT Registration No.
              {scanData?.vatNumber && <span style={S.tag('#e8f5e9','#2e7d32')}>auto-filled</span>}
              {f.vat_number && !isValidVATNum(f.vat_number) && <span style={S.tag('#fce4ec','#c62828')}>invalid format</span>}
              {f.vat_number && isValidVATNum(f.vat_number) && <span style={S.tag('#e8f5e9','#2e7d32')}>✓ valid</span>}
            </label>
            <input
              type="text" placeholder="3XXXXXXXXXXXXXX (15 digits)"
              value={f.vat_number}
              onChange={e => setForm(prev => ({ ...prev, vat_number: e.target.value }))}
              style={{ ...S.input, fontFamily:'monospace', marginBottom:12,
                borderColor: f.vat_number ? (isValidVATNum(f.vat_number)?'#2e7d32':'#e53935') : '#dde3ec' }}
            />

            <label style={S.label}>
              Invoice Number
              <span style={{ textTransform:'none', fontWeight:400, color:'#9e9e9e' }}> (for duplicate detection)</span>
            </label>
            <input
              type="text" placeholder="e.g. INV-2026-00123"
              value={f.invoice_number}
              onChange={e => {
                const v = e.target.value
                setForm(prev => ({ ...prev, invoice_number: v }))
                checkDuplicate(v, f.vendor_name)
              }}
              style={{ ...S.input, marginBottom: dupWarning ? 8 : 12 }}
            />
            {dupWarning && (
              <div style={S.banner('#fce4ec','#c62828')}>
                ⚠️ <strong>Possible duplicate:</strong> You already submitted invoice {f.invoice_number} on {dupWarning.existing_date} for SAR {dupWarning.existing_amount}. Continue only if this is a different invoice.
              </div>
            )}

            <label style={S.label}>Notes <span style={{ textTransform:'none', fontWeight:400 }}>(optional)</span></label>
            <textarea
              rows={2} placeholder="Any additional context…"
              value={f.remarks}
              onChange={e => setForm(prev => ({ ...prev, remarks: e.target.value }))}
              style={{ ...S.input, resize:'none' }}
            />
          </div>

          {/* ── Site / Project ──────────────────────────────────────────────── */}
          <div style={S.card}>
            <div style={S.sTitle}>
              Site / Project
              <span style={{ fontWeight:400, color:'#9e9e9e', fontSize:12, marginLeft:6 }}>(optional)</span>
            </div>
            {assignments.length === 0 ? (
              <div style={{ color:'#9e9e9e', fontSize:13, padding:'8px 0' }}>
                No active site assignments{devMode && ' — assign this employee to a site in Site Master'}
              </div>
            ) : (<>
              <button style={S.siteBtn(!f.assignment_id)} onClick={() => setForm(prev => ({ ...prev, assignment_id: '' }))}>
                <div style={S.siteName}>None / General (not site-specific)</div>
              </button>
              {assignments.map(a => (
                <button key={a.id} style={S.siteBtn(f.assignment_id === a.id)} onClick={() => setForm(prev => ({ ...prev, assignment_id: a.id }))}>
                  <div style={S.siteName}>{a.site_number}{a.site_name ? ` — ${a.site_name}` : ''}</div>
                  <div style={S.siteSub}>
                    {a.project?.project_number && `${a.project.project_number} · `}
                    {a.project?.project_name || ''}
                    {a.contractor?.contractor_name ? ` · ${a.contractor.contractor_name}` : ''}
                  </div>
                </button>
              ))}
            </>)}
          </div>

          {error && <div style={S.err}>⚠️ {error}</div>}

          <button onClick={handleSubmit} disabled={!canSubmit || submitting} style={S.submitBtn(!canSubmit || submitting)}>
            {submitting
              ? 'Saving…'
              : isHardBlock
                ? '🚫 Cannot submit — invoice too old'
                : late.level === 'block'
                  ? '🔶 Submit for DH approval (late)'
                  : canSubmit
                    ? `Record ${selCat?.icon} ${selCat?.label} — SAR ${rawAmount.toLocaleString('en-US',{minimumFractionDigits:2})}`
                    : !emp
                      ? 'Select employee above first'
                      : !f.invoice_date
                        ? 'Enter invoice date to continue'
                        : needsReason
                          ? 'Enter reason for late submission'
                          : 'Select category and enter amount'}
          </button>

        </>)}
      </div>
    </div>
  )
}
