import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import FormShell from '../components/FormShell'
import BackdatedEntryModal from '../components/BackdatedEntryModal'
import { GROUP_COLORS, kpiCardGradient, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
import { printDocument, openPrintWindow } from '../lib/templatePrint'

// Convert a URL (e.g. Supabase storage) to a base64 data URL for inline embedding in print windows
async function fetchAsDataUrl(url) {
  if (!url) return ''
  if (url.startsWith('data:')) return url
  try {
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return url
    const blob = await res.blob()
    return await new Promise(resolve => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result || url)
      reader.onerror  = () => resolve(url)
      reader.readAsDataURL(blob)
    })
  } catch { return url }
}

const MC = GROUP_COLORS.Finance
const L1   = '#C1A1A9'
const L2   = '#FAF0F2'
const L3   = '#8C354B'
const PP   = "'Poppins', sans-serif"
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { exportToExcel } from '../lib/exportExcel'

const EXPENSE_TYPES = ['Travel','Accommodation','Meals','Office Supplies','Communication','Fuel','Maintenance','Government Fees','IQAMA Renewal','Change of Profession','Change of Sponsorship','Muqeem Points','Chamber of Commerce','QIWA Fees','Government Penalties','Other']
const EXPENSE_CATS  = ['Operational','Administrative','Project','HR','Government','Compliance','Other']

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modal:   { background:'#fff', borderRadius:16, padding:24, width:660, maxWidth:'100%', maxHeight:'92vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.2)' },
  inp:     { width:'100%', padding:'9px 11px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box' },
  label:   { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4 },
  row:     { display:'flex', gap:12, marginBottom:13, flexWrap:'wrap' },
  col:     { flex:1, minWidth:130 },
  sec:     { fontSize:11, fontWeight:800, color:'#e65100', marginBottom:8, marginTop:4, paddingBottom:4, borderBottom:'1px solid #fff3e0', letterSpacing:1, textTransform:'uppercase' },
}

const STATUS_COLOR = { PENDING:'#e65100', APPROVED:'#2e7d32', REJECTED:'#c62828', PAID:'#006064', RECORDED:'#1565c0' }

// ─── ZATCA TLV QR decoder (free, pure JS, no API) ────────────────────────────
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
      if (tag === 1) result.seller   = val
      if (tag === 2) result.vatNumber = val
      if (tag === 3) result.datetime  = val
      if (tag === 4) result.total     = parseFloat(val)
      if (tag === 5) result.vatAmount = parseFloat(val)
    }
    return Object.keys(result).length >= 2 ? result : null
  } catch { return null }
}

// ─── OCR / PDF text parser ────────────────────────────────────────────────────
function parseReceiptText(text) {
  const r = {}
  const t = text.replace(/\r/g, '')

  // ── Amount ───────────────────────────────────────────────────────────────
  // Priority order: labelled Total > trailing SAR > leading SAR
  const amtPatterns = [
    /(?:total amount|grand total|total|net amount|المبلغ الإجمالي|الإجمالي)\s*[:\-]?\s*([\d,]+\.?\d*)\s*(?:SAR|ر\.س)?/i,
    /([\d,]+\.\d{2})\s*SAR/i,
    /SAR\s*([\d,]+\.?\d*)/i,
  ]
  for (const p of amtPatterns) {
    const m = t.match(p)
    if (m) { r.total = parseFloat(m[1].replace(/,/g, '')); break }
  }

  // ── VAT amount ───────────────────────────────────────────────────────────
  const vatM = t.match(/(?:vat amount|tax amount|ضريبة القيمة)\s*[:\-]?\s*([\d,]+\.?\d*)/i)
             || t.match(/(?:^|\n)\s*(?:vat|ضريبة)\s+([\d,]+\.?\d*)/im)
  if (vatM) r.vatAmount = parseFloat(vatM[1].replace(/,/g, ''))

  // ── VAT registration number (15 digits starting with 3) ─────────────────
  const vatNumM = t.match(/\b(3\d{14})\b/)
  if (vatNumM) r.vatNumber = vatNumM[1]

  // ── Reference / Transaction number ──────────────────────────────────────
  // SADAD: "TBC..." codes, bank TRN codes, alphanumeric ref codes
  // Pattern A: inline label:value
  const refInline = t.match(/(?:reference(?:\s+number)?|transaction(?:\s+id)?)\s*[:\-]\s*([A-Z0-9]{6,30})/i)
  // Pattern B: standalone SADAD-style code (TBC... or similar 10–20 char alphanumeric on its own line, not "Not Provided")
  const refStandalone = t.match(/^([A-Z]{2,4}\d{10,20})$/m)
  const refRef = refInline || refStandalone
  if (refRef) r.reference = refRef[1]

  // ── Date — prefer ISO YYYY-MM-DD, then DD/MM/YYYY ───────────────────────
  const dateM = t.match(/\b(\d{4}[-\/]\d{2}[-\/]\d{2})\b/)
             || t.match(/\b(\d{2}[-\/]\d{2}[-\/]\d{4})\b/)
  if (dateM) {
    const d = dateM[1]
    if (/^\d{4}/.test(d)) r.date = d.replace(/\//g, '-')
    else { const p = d.split(/[-\/]/); r.date = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}` }
  }

  // ── Seller / vendor name ─────────────────────────────────────────────────
  // SADAD PDFs: label on one line, value on a later line (may have blank lines between)
  // Strategy: find "Biller Name" label then grab first non-empty line after it
  const lines = t.split('\n').map(l => l.trim())
  const billerIdx = lines.findIndex(l => /^biller name$/i.test(l))
  if (billerIdx >= 0) {
    // next non-empty line after "Biller Name"
    const next = lines.slice(billerIdx + 1).find(l => l.length > 2 && !/^(service type|amount|payment|ref|total)/i.test(l))
    if (next) r.seller = next.slice(0, 60)
  }
  if (!r.seller) {
    // 2) Inline label patterns: "Biller Name: Acme Corp" or "Vendor: ..."
    const billerM = t.match(/(?:biller name|vendor|merchant|payee|paid to|beneficiary)\s*[:\-]\s*([A-Za-z؀-ۿ][\w\s&'.,-]{2,60})/i)
    if (billerM) r.seller = billerM[1].trim()
  }
  if (!r.seller) {
    // 3) Fallback: first meaningful line that isn't a status word
    const SKIP = /^(payment|print|date|from|to|bill|service|amount|ref|customer|iqama|account|total|your|success|processed|nick|full)/i
    const meaningful = lines.filter(l => l.length > 3 && !/^\d/.test(l) && !SKIP.test(l))
    if (meaningful.length > 0) r.seller = meaningful[0].slice(0, 60)
  }

  return r
}

export default function ExpensesPage({ entityId, entityName, isAr }) {
  const [items,     setItems]     = useState([])
  const [employees, setEmployees] = useState([])
  const [depts,     setDepts]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [open,            setOpen]            = useState(false)
  const [showBanner,      setShowBanner]      = useState(false)
  const [showAdminEntry,  setShowAdminEntry]  = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [saving,     setSaving]     = useState(false)

  // Receipt scan states
  const [rcptFile,    setRcptFile]    = useState(null)
  const [rcptStatus,  setRcptStatus]  = useState('')   // '', 'scanning', 'zatca', 'ocr', 'done', 'error'
  const [rcptData,    setRcptData]    = useState(null)  // extracted fields
  const [rcptSource,  setRcptSource]  = useState('')    // 'ZATCA' | 'OCR' | 'PDF'
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [search,    setSearch]    = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterDept,setFilterDept]= useState('')
  const [filterFrom,setFilterFrom]= useState('')
  const [filterTo,  setFilterTo]  = useState('')
  const [expanded,  setExpanded]  = useState({}) // row id → bool

  // form fields
  const [expDate,    setExpDate]    = useState(new Date().toISOString().split('T')[0])
  const [deptId,     setDeptId]     = useState('')
  const [deptName,   setDeptName]   = useState('')
  const [empId,      setEmpId]      = useState('')
  const [reqName,    setReqName]    = useState('')
  const [contactNo,  setContactNo]  = useState('')
  const [projNum,    setProjNum]    = useState('')
  const [projName,   setProjName]   = useState('')
  const [jobNum,     setJobNum]     = useState('')
  const [expType,    setExpType]    = useState('')
  const [expCat,     setExpCat]     = useState('')
  const [vatPaid,    setVatPaid]    = useState(false)
  const [amount,     setAmount]     = useState('')
  const [vatPct,     setVatPct]     = useState('15')
  const [vatNumber,  setVatNumber]  = useState('')
  const [companyName,setCompanyName]= useState('')
  const [docUrl,     setDocUrl]     = useState('')
  const [remarks,    setRemarks]    = useState('')

  const vatAmount  = vatPaid ? ((parseFloat(amount)||0) * (parseFloat(vatPct)||15) / 100) : 0
  const totalAmount = (parseFloat(amount)||0) + vatAmount

  useEffect(() => { load() }, [entityId])

  async function load() {
    if (!entityId) return
    setLoading(true)
    // No nested joins — avoids PGRST201 ambiguous-FK errors.
    // We fetch employees + departments flat and map in JS.
    const [
      { data: ex,      error: exErr },
      { data: fieldEx, error: fieldErr },
      { data: em },
      { data: dp },
      { data: allEmp }, // ALL employees (not entity-filtered) for field record lookup
    ] = await Promise.all([
      supabase.from('expenses').select('*').eq('entity_id', entityId).order('expense_date', {ascending:false}),
      supabase.from('expense_records')
        .select('id,expense_date,category,amount,vat_amount,vendor_name,vat_number,remarks,receipt_url,status,created_at,employee_id,entry_source,recorded_by_name,invoice_number,late_reason,project_no,project_name,site_no,site_name,job_no')
        .order('expense_date', {ascending:false}),
      supabase.from('employees').select('id,full_name_en,employee_number,phone,department_id').eq('entity_id', entityId).eq('is_active', true).order('full_name_en'),
      supabase.from('departments').select('id,dept_name,dept_code').eq('entity_id', entityId).eq('is_active', true).order('dept_name'),
      supabase.from('employees').select('id,full_name_en,employee_number,department_id').eq('is_active', true),
    ])
    if (exErr)    console.error('[Expenses] admin query error:', exErr)
    if (fieldErr) console.error('[Expenses] field query error:', fieldErr)
    console.log('[Expenses] admin rows:', (ex||[]).length, '| field rows:', (fieldEx||[]).length)

    // Build lookup maps
    const empMap  = Object.fromEntries([...(em||[]), ...(allEmp||[])].map(e => [e.id, e]))
    const deptMap = Object.fromEntries((dp||[]).map(d => [d.id, d]))

    // Normalise field records to same shape as admin expenses rows
    const normField = (fieldEx||[]).map(r => {
      const emp  = empMap[r.employee_id]  || {}
      const dept = deptMap[emp.department_id] || {}
      return {
        ...r,
        _source:         'FIELD',
        request_number:  `FIELD-${r.id?.slice(0,8).toUpperCase()}`,
        expense_type:    r.category,
        department_name: dept.dept_code || dept.dept_name || '',  // abbreviation first
        requester_name:  emp.full_name_en || '',
        emp_no:          emp.employee_number || '',
        total_amount:    r.amount||0,
        document_url:    r.receipt_url,
        // audit trail
        entry_source:    r.entry_source || 'FIELD',
        recorded_by_name: r.recorded_by_name || (emp.full_name_en ? `${emp.full_name_en} (self)` : ''),
      }
    })
    const all = [...(ex||[]).map(r=>({...r,_source:'ADMIN'})), ...normField]
    all.sort((a,b) => new Date(b.expense_date) - new Date(a.expense_date))
    setItems(all); setEmployees(em||[]); setDepts(dp||[])
    setLoading(false)
  }

  function resetForm() {
    setExpDate(new Date().toISOString().split('T')[0]); setDeptId(''); setDeptName('')
    setEmpId(''); setReqName(''); setContactNo(''); setProjNum(''); setProjName('')
    setJobNum(''); setExpType(''); setExpCat(''); setVatPaid(false); setAmount('')
    setVatPct('15'); setVatNumber(''); setCompanyName(''); setDocUrl(''); setRemarks('')
    setRcptFile(null); setRcptStatus(''); setRcptData(null); setRcptSource('')
  }

  // ─── Apply OCR/QR extracted data to form fields ──────────────────────────
  function applyRcptData(data) {
    if (!data) return
    // VAT signals: either a vatAmount or a vatNumber means this is a VAT receipt
    const hasVat = (data.vatAmount && data.vatAmount > 0) || !!data.vatNumber
    if (hasVat) { setVatPaid(true); setVatPct('15') }
    if (data.total) {
      const net = (hasVat && data.vatAmount) ? data.total - data.vatAmount : data.total
      setAmount(net.toFixed(2))
    }
    if (data.vatNumber)  setVatNumber(data.vatNumber)
    if (data.seller)     setCompanyName(data.seller)
    if (data.date)       setExpDate(data.date)
    // SADAD / bank reference → pre-fill remarks so the ref number isn't lost
    if (data.reference && !remarks) setRemarks(`Ref: ${data.reference}`)
  }

  // ─── Main receipt scanner ─────────────────────────────────────────────────
  async function scanExpenseReceipt(file) {
    setRcptFile(file)
    setRcptStatus('scanning')
    setRcptData(null)
    setRcptSource('')

    try {
      // ── PDF path: extract text via pdf.js ──────────────────────────────
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        setRcptStatus('scanning')
        const { getDocument } = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs')
        const ab   = await file.arrayBuffer()
        const pdf  = await getDocument({ data: ab }).promise
        let fullText = ''
        for (let p = 1; p <= Math.min(pdf.numPages, 3); p++) {
          const pg    = await pdf.getPage(p)
          const tc    = await pg.getTextContent()
          fullText   += tc.items.map(i => i.str).join(' ') + '\n'
        }
        const parsed = parseReceiptText(fullText)
        setRcptData(parsed)
        setRcptSource('PDF')
        setRcptStatus('done')
        applyRcptData(parsed)
        return
      }

      // ── Image path: try ZATCA QR first, then ALWAYS run Tesseract OCR ──
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      // Upscale small images for better OCR accuracy (max 2x)
      const scale  = Math.min(2, Math.max(1, 1200 / Math.max(bitmap.width, bitmap.height)))
      canvas.width  = bitmap.width  * scale
      canvas.height = bitmap.height * scale
      const ctx = canvas.getContext('2d')
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      // Try jsQR for ZATCA QR code detection
      let zatcaResult = null
      try {
        const { default: jsQR } = await import('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js')
        const code = jsQR(imgData.data, imgData.width, imgData.height)
        if (code?.data) zatcaResult = decodeZATCAQR(code.data)
      } catch { /* jsQR failed — fall through to OCR */ }

      if (zatcaResult) {
        // ZATCA QR decoded → apply it, then also run OCR to pick up seller name / date if missing
        setRcptData(zatcaResult)
        setRcptSource('ZATCA')
        setRcptStatus('zatca')
        applyRcptData(zatcaResult)
        return
      }

      // No ZATCA QR — run Tesseract OCR to read printed text (works on any printed receipt)
      setRcptStatus('ocr')
      const { createWorker } = await import('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js')
      const worker = await createWorker(['eng', 'ara'])
      const { data: { text } } = await worker.recognize(canvas.toDataURL('image/png'))
      await worker.terminate()
      const parsed = parseReceiptText(text)
      setRcptData(Object.keys(parsed).length ? parsed : { _noData: true })
      setRcptSource('OCR')
      setRcptStatus('done')
      applyRcptData(parsed)

    } catch (err) {
      console.error('[ExpenseReceipt] scan error:', err)
      setRcptStatus('error')
    }
  }

  function onEmpChange(id) {
    setEmpId(id)
    const emp = employees.find(e=>e.id===id)
    if (emp) { setReqName(emp.full_name_en); setContactNo(emp.phone||'') }
  }

  function onDeptChange(id) {
    setDeptId(id)
    const d = depts.find(x=>x.id===id)
    setDeptName(d ? d.dept_name : '')
  }

  async function save() {
    if (!expType || !amount) { alert('Expense type and amount are required'); return }
    setSaving(true)

    // Auto-generate request number
    const reqNum = `EXP-${Date.now().toString().slice(-6)}`

    const { error } = await supabase.from('expenses').insert({
      entity_id:        entityId,
      employee_id:      empId||null,
      expense_date:     expDate,
      request_number:   reqNum,
      department_id:    deptId||null,
      department_name:  deptName||null,
      requester_name:   reqName||null,
      contact_number:   contactNo||null,
      project_number:   projNum||null,
      project_name:     projName||null,
      job_number:       jobNum||null,
      expense_type:     expType,
      expense_category: expCat||null,
      vat_paid:         vatPaid,
      amount:           parseFloat(amount)||0,
      vat_amount:       vatAmount,
      total_amount:     totalAmount,
      vat_number:       vatNumber||null,
      company_name:     companyName||null,
      document_url:     docUrl||null,
      remarks:          remarks||null,
      status:           'PENDING',
    })
    setSaving(false)
    if (error) { alert(error.message); return }
    setOpen(false); resetForm(); load()
  }

  function doExport() {
    const cols = [
      { key: 'request_number',   label: 'Req #' },
      { key: 'expense_date',     label: 'Date',            format: 'date'     },
      { key: 'department_name',  label: 'Department' },
      { key: 'requester_name',   label: 'Name' },
      { key: 'contact_number',   label: 'Contact' },
      { key: 'project_number',   label: 'Project #' },
      { key: 'project_name',     label: 'Project Name' },
      { key: 'expense_type',     label: 'Expense Type' },
      { key: 'expense_category', label: 'Category' },
      { key: 'amount',           label: 'Amount (SAR)',     format: 'currency' },
      { key: 'vat_paid',         label: 'VAT Paid',         format: 'boolean'  },
      { key: 'vat_amount',       label: 'VAT (SAR)',        format: 'currency' },
      { key: 'total_amount',     label: 'Total (SAR)',      format: 'currency' },
      { key: 'company_name',     label: 'Vendor' },
      { key: 'remarks',          label: 'Remarks' },
      { key: 'status',           label: 'Status' },
    ]
    exportToExcel(filtered, cols, 'Expenses', 'Expenses')
  }

  const allCategories = [...new Set(items.map(i=>i.expense_type||i.category).filter(Boolean))].sort()

  const allDepts = [...new Set(items.map(i=>i.department_name).filter(Boolean))].sort()

  const filtered = items.filter(i => {
    const q = search.toLowerCase()
    const name = (i.requester_name||i.employees?.full_name_en||'').toLowerCase()
    const matchS = !search || name.includes(q) || (i.expense_type||i.category||'').toLowerCase().includes(q) || (i.vendor_name||i.company_name||'').toLowerCase().includes(q) || (i.request_number||'').toLowerCase().includes(q)
    const matchStatus = filterStatus==='ALL' || i.status===filterStatus
    const matchCat  = !filterCat  || (i.expense_type||i.category)===filterCat
    const matchDept = !filterDept || (i.department_name||'')=== filterDept
    const matchFrom = !filterFrom || i.expense_date>=filterFrom
    const matchTo   = !filterTo   || i.expense_date<=filterTo
    return matchS && matchStatus && matchCat && matchDept && matchFrom && matchTo
  })

  const total = filtered.reduce((s,i)=>s+(i.total_amount||0),0)
  const SAR = v => `SAR ${(v||0).toLocaleString(undefined,{maximumFractionDigits:0})}`

  return (
    <div className="exp-root" style={{ fontFamily:PP, display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden', background:L2 }}>
      <style>{`.exp-root input,.exp-root select,.exp-root button,.exp-root textarea{font-family:'Poppins',sans-serif!important}`}</style>

      {/* ══ UPPER ZONE ══ */}
      <div style={{ flexShrink:0, background:L2, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', zIndex:10 }}>

        {/* ── L1 Heading Bar ── */}
        <div style={{ padding:'6px 28px 0' }}>
          <div style={{ background:L1, borderRadius:'6px 6px 0 0', padding:'7px 20px', display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:15, fontWeight:800, color:'#fff', letterSpacing:0.3, flex:1 }}>🧾 Expenses</span>
            {entityName && <span style={{ fontSize:11, color:'rgba(255,255,255,0.75)' }}>{entityName}</span>}
            <button onClick={()=>{ resetForm(); setWizardStep(1); setShowBanner(true) }}
              style={{ background:L3, color:'#fff', border:'none', borderRadius:7, padding:'5px 14px', cursor:'pointer', fontSize:12, fontWeight:700, whiteSpace:'nowrap' }}>
              🧾 + New Expense
            </button>
            <button onClick={() => setShowAdminEntry(true)}
              style={{ background:'rgba(255,255,255,0.18)', color:'#fff', border:'1px solid rgba(255,255,255,0.5)', borderRadius:7, padding:'5px 14px', cursor:'pointer', fontSize:12, fontWeight:700, whiteSpace:'nowrap' }}>
              📋 Admin Entry
            </button>
            <button onClick={doExport}
              style={{ background:'rgba(255,255,255,0.18)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', borderRadius:7, padding:'5px 14px', cursor:'pointer', fontSize:12, fontWeight:700, whiteSpace:'nowrap' }}>
              📥 Export
            </button>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div style={{ display:'flex', gap:8, padding:'10px 28px 12px', flexWrap:'wrap' }}>
          {[
            { label:'Total Expenses', val:SAR(filtered.reduce((s,i)=>s+(i.total_amount||0),0)) },
            { label:'Pending',        val:SAR(filtered.filter(i=>i.status==='PENDING').reduce((s,i)=>s+(i.total_amount||0),0)) },
            { label:'Approved',       val:SAR(filtered.filter(i=>i.status==='APPROVED').reduce((s,i)=>s+(i.total_amount||0),0)) },
            { label:'Paid',           val:SAR(filtered.filter(i=>i.status==='PAID').reduce((s,i)=>s+(i.total_amount||0),0)) },
          ].map(({ label, val }, i) => {
            const kg = kpiCardGradient(i % 4, L1, L2, L3)
            return (
              <div key={label} style={{ ...kg, borderRadius:8, width:200, minWidth:200, height:62, padding:'8px 14px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
                <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:0.8, marginBottom:3, opacity:0.85 }}>{label}</div>
                <div style={{ fontSize:14, fontWeight:800 }}>{val}</div>
              </div>
            )
          })}
        </div>

        {/* ── Filter Bar ── */}
        <div style={{ padding:'6px 28px 8px' }}>
          <div style={{ background:'#fff', padding:'10px 14px', borderRadius:8, boxShadow:'0 1px 4px rgba(0,0,0,0.07)', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
            <input placeholder="🔍 Search name, type, vendor…"
              style={{ flex:2, minWidth:160, padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none' }}
              value={search} onChange={e=>setSearch(e.target.value)} />
            <select value={filterDept} onChange={e=>setFilterDept(e.target.value)} style={{ flex:1, minWidth:130, padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none' }}>
              <option value="">All Departments</option>
              {allDepts.map(d=><option key={d} value={d}>{d}</option>)}
            </select>
            <select value={filterCat} onChange={e=>setFilterCat(e.target.value)} style={{ flex:1, minWidth:120, padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none' }}>
              <option value="">All Categories</option>
              {allCategories.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
            <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{ flex:1, minWidth:120, padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none' }}>
              <option value="ALL">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="PAID">Paid</option>
              <option value="RECORDED">Field Recorded</option>
            </select>
            <input type="date" title="From date" value={filterFrom} onChange={e=>setFilterFrom(e.target.value)}
              style={{ padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', color: filterFrom?'#222':'#aab2bd' }} />
            <span style={{ color:'#aab2bd', fontSize:12 }}>–</span>
            <input type="date" title="To date" value={filterTo} onChange={e=>setFilterTo(e.target.value)}
              style={{ padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', color: filterTo?'#222':'#aab2bd' }} />
            {(search||filterCat||filterDept||filterFrom||filterTo||filterStatus!=='ALL') &&
              <button onClick={()=>{ setSearch(''); setFilterCat(''); setFilterDept(''); setFilterFrom(''); setFilterTo(''); setFilterStatus('ALL') }}
                style={{ background:'#f0f4f8', border:'none', borderRadius:7, padding:'7px 12px', cursor:'pointer', fontSize:12, color:'#888' }}>✕ Clear</button>}
          </div>
        </div>

        {/* ── Column Header ── */}
        <div style={{ padding:'0 28px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'100px 1fr 80px 120px 150px 105px 80px 110px 105px 30px', gap:0, background:L3, padding:'8px 14px', borderRadius:'6px 6px 0 0', alignItems:'center' }}>
            {[
              { label:'Date',       align:'left'  },
              { label:'Employee',   align:'left'  },
              { label:'Dept',       align:'left'  },
              { label:'Category',   align:'left'  },
              { label:'Vendor',     align:'left'  },
              { label:'Excl. VAT',  align:'right' },
              { label:'VAT',        align:'right' },
              { label:'Total',      align:'right' },
              { label:'Status',     align:'center'},
              { label:'',           align:'center'},
            ].map((h,i)=>(
              <div key={i} style={{ fontSize:10, color:'#fff', fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, textAlign:h.align }}>{h.label}</div>
            ))}
          </div>
        </div>

      </div>{/* end upper zone */}

      {/* ══ SCROLL ZONE ══ */}
      <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:'0 28px 22px' }}>

      {/* ── Table Card ── */}
      <div style={{ background:'#fff', borderRadius:'0 0 8px 8px', boxShadow:'0 2px 8px rgba(0,0,0,0.08)', overflow:'hidden' }}>
        {loading ? <div style={{ textAlign:'center', padding:60, color:'#aab2bd' }}>Loading…</div>
        : filtered.length===0 ? <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No expenses found</div>
        : filtered.map((i,idx)=>{
          const isOpen = !!expanded[i.id||idx]
          const cat = i.expense_type || i.category || '—'
          const name = i.requester_name || i.employees?.full_name_en || '—'
          const amt = (i.amount||0)
          const vat = (i.vat_amount||0)
          const tot = (i.total_amount||(amt+vat))
          const vendor = i.vendor_name || i.company_name || ''
          const receipt = i.document_url || i.receipt_url
          return (
            <div key={i.id||idx}>
              {/* Main row — single line, no scroll */}
              <div
                onClick={()=>setExpanded(p=>({...p,[i.id||idx]:!p[i.id||idx]}))}
                style={{ display:'grid', gridTemplateColumns:'100px 1fr 80px 120px 150px 105px 80px 110px 105px 30px', gap:0, padding:'9px 14px', borderTop: idx>0?'1px solid #f0f4f8':'none', cursor:'pointer', background: isOpen?'#fafcff':'#fff', alignItems:'center' }}
              >
                {/* Date */}
                <div style={{ fontSize:12, color:'#546e7a', fontWeight:600 }}>{i.expense_date||'—'}</div>

                {/* Employee */}
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#172D37', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {name}
                    {i._source==='FIELD' && <span style={{ marginLeft:6, background:'#e3f2fd', color:'#1565c0', borderRadius:3, padding:'1px 5px', fontSize:9, fontWeight:700 }}>FIELD</span>}
                  </div>
                </div>

                {/* Department */}
                <div style={{ fontSize:11, color:'#546e7a', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{i.department_name||i.dept_code||'—'}</div>

                {/* Category */}
                <div style={{ fontSize:11, color:'#444', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{cat}</div>

                {/* Vendor */}
                <div style={{ fontSize:11, color:'#607d8b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{vendor||<span style={{color:'#c0c8d0'}}>—</span>}</div>

                {/* Excl. VAT */}
                <div style={{ textAlign:'right', fontSize:12, color:'#37474f', fontWeight:600, whiteSpace:'nowrap' }}>
                  {amt>0 ? `SAR ${amt.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—'}
                </div>

                {/* VAT */}
                <div style={{ textAlign:'right', fontSize:11, whiteSpace:'nowrap' }}>
                  {vat>0
                    ? <span style={{ color:'#e65100', fontWeight:600 }}>{vat.toFixed(2)}</span>
                    : <span style={{ color:'#c0c8d0' }}>—</span>
                  }
                </div>

                {/* Total */}
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:13, fontWeight:800, color:'#1a237e', whiteSpace:'nowrap' }}>SAR {tot.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
                </div>

                {/* Status */}
                <div style={{ textAlign:'center' }}>
                  <span style={{ background:(STATUS_COLOR[i.status]||'#607d8b')+'22', color:STATUS_COLOR[i.status]||'#607d8b', borderRadius:5, padding:'3px 8px', fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>
                    {i.status||'PENDING'}
                  </span>
                </div>

                {/* Toggle */}
                <div style={{ textAlign:'center', color:'#aab2bd', fontSize:13 }}>{isOpen?'▲':'▼'}</div>
              </div>

              {/* Expanded detail panel */}
              {isOpen && (
                <div style={{ background:'#f8faff', borderTop:'1px solid #e8eaf6', padding:'12px 20px', fontSize:12, color:'#444' }}>
                  {/* ── Detail fields ── */}
                  <div style={{ display:'flex', gap:24, flexWrap:'wrap', marginBottom:10 }}>
                    <div><span style={{ color:'#888', fontWeight:600 }}>Ref # </span>{i.request_number||'—'}</div>
                    <div><span style={{ color:'#888', fontWeight:600 }}>Project </span>{i.project_name||i.project_number||'—'}</div>
                    <div><span style={{ color:'#888', fontWeight:600 }}>Vendor </span>{vendor||'—'}</div>
                    {i.vat_number && <div><span style={{ color:'#888', fontWeight:600 }}>VAT Reg# </span><span style={{ fontFamily:'monospace' }}>{i.vat_number}</span></div>}
                    <div><span style={{ color:'#888', fontWeight:600 }}>Amount </span>SAR {amt.toFixed(2)}{vat>0?` + VAT SAR ${vat.toFixed(2)}`:''}  = SAR {tot.toFixed(2)}</div>
                    {i.remarks && <div><span style={{ color:'#888', fontWeight:600 }}>Remarks </span>{i.remarks}</div>}
                    {receipt && <div><a href={receipt} target="_blank" rel="noreferrer" style={{ color:'#1565c0', fontWeight:600 }}>📎 View Receipt</a></div>}
                  </div>

                  {/* ── Flow Trail ── */}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8, borderTop:'1px solid #e8eaf6', paddingTop:9 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                      {/* Source badge */}
                      {i._source === 'FIELD'
                        ? <span style={{ display:'inline-flex', alignItems:'center', gap:5, background:'#e3f2fd', color:'#1565c0', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:700 }}>
                            📱 Submitted via Mobile (Field)
                          </span>
                        : <span style={{ display:'inline-flex', alignItems:'center', gap:5, background:'#fff3e0', color:'#e65100', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:700 }}>
                            🖥️ Entered by Office Admin
                          </span>
                      }
                      {/* Recorded by */}
                      {(i.recorded_by_name || i.requester_name) && (
                        <span style={{ fontSize:11, color:'#607d8b' }}>
                          by <strong style={{ color:'#37474f' }}>{i.recorded_by_name || i.requester_name}</strong>
                        </span>
                      )}
                      {/* Timestamp */}
                      {i.created_at && (
                        <span style={{ fontSize:11, color:'#90a4ae' }}>
                          on {new Date(i.created_at).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}
                        </span>
                      )}
                      {/* Admin note if any */}
                      {i.admin_note && (
                        <span style={{ fontSize:11, color:'#8c354b', background:'#fce4ec', borderRadius:5, padding:'2px 8px' }}>
                          📝 {i.admin_note}
                        </span>
                      )}
                    </div>

                    {/* Print Voucher button */}
                    <button
                      onClick={async e => {
                        e.stopPropagation()
                        // Must open popup synchronously BEFORE any await (browsers block window.open after async)
                        const win = openPrintWindow()
                        // Fetch receipt as base64 data URL so it embeds in the popup (bypasses CORS)
                        const photoDataUrl = receipt ? await fetchAsDataUrl(receipt) : ''
                        printDocument('expense_record_voucher', {
                          record_number:  i.request_number || `EXP-${(i.id||'').slice(0,8).toUpperCase()}`,
                          expense_id:     i.id,
                          employee_name:  i.requester_name || name,
                          emp_no:         i.emp_no || i.employee_number || '',
                          department:     i.department_name || '',
                          entity_name:    entityName || 'Ratal Advanced Technologies',
                          date:           i.expense_date,
                          expense_date:   i.expense_date,
                          invoice_date:   i.invoice_date || '',
                          submitted_at:   i.created_at || i.expense_date,
                          category:       cat,
                          vendor:         vendor,
                          vendor_name:    vendor,
                          vat_number:     i.vat_number || '',
                          invoice_number: i.invoice_number || '',
                          project_no:     i.project_no || i.project_number || '',
                          project_name:   i.project_name || '',
                          site_no:        i.site_no || '',
                          job_no:         i.job_no || '',
                          amount:         amt,
                          vat:            vat,
                          total:          tot,
                          total_amount:   tot,
                          remarks:        i.remarks || '',
                          photo_url:      photoDataUrl || '',
                          late_reason:    i.late_reason || '',
                          entry_source:   i._source === 'FIELD' ? 'Submitted via Mobile (Field)' : (i.recorded_by_name ? `Admin: ${i.recorded_by_name}` : 'Entered by Office Admin'),
                        }, { _preWin: win })
                      }}
                      style={{ background:L3, color:'#fff', border:'none', borderRadius:7, padding:'6px 16px', fontSize:11, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }}
                    >
                      🖨️ Print Voucher
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {/* Footer total */}
        {filtered.length>0 && (
          <div style={{ display:'flex', justifyContent:'flex-end', padding:'10px 20px', borderTop:'2px solid #e8eaf6', background:'#f8fafd' }}>
            <span style={{ fontSize:13, fontWeight:800, color:L3 }}>
              {filtered.length} record{filtered.length!==1?'s':''} · Total: SAR {total.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
            </span>
          </div>
        )}
      </div>{/* end table card */}

      </div>{/* end scroll zone */}

      {/* ── ADMIN BACKDATED ENTRY ── */}
      {showAdminEntry && (
        <BackdatedEntryModal
          type="expense"
          entityId={entityId}
          employees={employees}
          onClose={() => setShowAdminEntry(false)}
          onSaved={() => { setShowAdminEntry(false); load() }}
        />
      )}

      {/* ── PAGE BANNER ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); setOpen(true) }}
        chapterName="Finance"
        formTitle={['New', 'Expense', 'Record']}
        heading="Record office and government-related expenditures"
        iconLabel={'Expenses'}
        workflowSteps={['Scan Receipt', 'Basic Info', 'Expense Details', 'Project & Submit']}
        icon="🧾"
        description="Record office and government-related expenditures. For field expenses use the Shareable Form."
      />

      {/* ══ NEW EXPENSE WIZARD — FormShell ══ */}
      <FormShell
        isOpen={open}
        onClose={() => { setOpen(false); resetForm() }}
        chapterName="Finance"
        title={['New', 'Expense', 'Record']}
        description="Record office and government-related expenditures. For field expenses use the Shareable Form."
        steps={['Scan Receipt', 'Basic Info', 'Expense Details', 'Project & Submit']}
        currentStep={wizardStep}
        onBack={wizardStep===1 ? () => { setOpen(false); resetForm() } : () => setWizardStep(s=>s-1)}
        backLabel={wizardStep===1 ? 'Cancel' : '← Back'}
        onNext={wizardStep<4 ? () => setWizardStep(s=>s+1) : save}
        nextLabel={wizardStep<4 ? 'Next →' : (saving ? '⏳ Saving…' : '✅ Submit Expense')}
        nextDisabled={(wizardStep===1 && (rcptStatus==='scanning'||rcptStatus==='ocr')) || (wizardStep===4 && saving)}
      >
        <div style={{ flex:1, overflowY:'auto', padding:'14px 18px' }}>

                    {/* ══ STEP 1: Scan Receipt ══ */}
                    {wizardStep===1 && (() => {
                      const isScanning = rcptStatus==='scanning' || rcptStatus==='ocr'
                      const isDone     = rcptStatus==='done' || rcptStatus==='zatca'
                      const isError    = rcptStatus==='error'
                      const badgeColor = rcptSource==='ZATCA' ? '#065f46' : rcptSource==='PDF' ? '#1e40af' : '#92400e'
                      const badgeBg    = rcptSource==='ZATCA' ? '#d1fae5' : rcptSource==='PDF' ? '#dbeafe' : '#fef3c7'
                      const badgeLabel = rcptSource==='ZATCA' ? '✅ ZATCA QR Decoded' : rcptSource==='PDF' ? '📄 PDF Text Extracted' : '🔍 OCR Complete'
                      return (
                        <div>
                          <div style={{ fontSize:9, fontWeight:800, color:'#8C354B', letterSpacing:0.8, textTransform:'uppercase', marginBottom:10 }}>📎 Scan Receipt</div>
                          <div style={{ background:'#fffde7', border:'1px solid #fdd835', borderRadius:7, padding:'7px 12px', fontSize:10, color:'#795548', marginBottom:14 }}>
                            ⚠️ <strong>Office &amp; Government expenses only.</strong> Field expenses → use the Shareable Form.
                          </div>

                          {/* Drop zone */}
                          <div
                            onClick={()=>{ if (!isScanning) document.getElementById('exp-rcpt-input').click() }}
                            onDragOver={e=>e.preventDefault()}
                            onDrop={e=>{ e.preventDefault(); const f=e.dataTransfer.files[0]; if(f) scanExpenseReceipt(f) }}
                            style={{ border:`2px dashed ${isDone?'#86efac':isError?'#fca5a5':'#C1A1A9'}`, borderRadius:12, padding:'28px 20px', textAlign:'center', cursor:isScanning?'default':'pointer',
                              background: isDone?'#f0fdf4' : isError?'#fef2f2' : '#FAF0F2', transition:'all 0.2s' }}>
                            <input id="exp-rcpt-input" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" style={{ display:'none' }}
                              onChange={e=>{ const f=e.target.files?.[0]; if(f){ e.target.value=''; scanExpenseReceipt(f) } }} />
                            {!rcptFile && !isScanning && (
                              <>
                                <div style={{ fontSize:32, marginBottom:8 }}>📄</div>
                                <div style={{ fontSize:13, fontWeight:700, color:'#8C354B', marginBottom:4 }}>Drop receipt here or click to upload</div>
                                <div style={{ fontSize:11, color:'#94a3b8' }}>PDF, JPG, PNG — supports ZATCA QR codes &amp; printed text</div>
                              </>
                            )}
                            {isScanning && (
                              <>
                                <div style={{ fontSize:28, marginBottom:8 }}>⏳</div>
                                <div style={{ fontSize:13, fontWeight:700, color:'#8C354B' }}>
                                  {rcptStatus==='ocr'
                                    ? '📖 Reading printed text via OCR…'
                                    : '🔍 Detecting QR code…'}
                                </div>
                                <div style={{ fontSize:11, color:'#94a3b8', marginTop:4 }}>
                                  {rcptStatus==='ocr'
                                    ? 'Tesseract reading Arabic & English text — takes 5–15 sec'
                                    : 'Checking for ZATCA QR code first'}
                                </div>
                              </>
                            )}
                            {isDone && rcptData && (
                              <>
                                <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:badgeBg, color:badgeColor, borderRadius:20, padding:'4px 14px', fontSize:11, fontWeight:800, marginBottom:10 }}>
                                  {badgeLabel}
                                </div>
                                <div style={{ fontSize:11, color:'#475569', marginBottom:6 }}>📎 {rcptFile.name}</div>
                              </>
                            )}
                            {isError && (
                              <>
                                <div style={{ fontSize:28, marginBottom:6 }}>⚠️</div>
                                <div style={{ fontSize:12, color:'#b91c1c', fontWeight:700 }}>Could not read receipt — continue manually</div>
                              </>
                            )}
                          </div>

                          {/* Extracted data card */}
                          {isDone && rcptData && (
                            <div style={{ background:'#fff', border:'1.5px solid #C1A1A9', borderRadius:10, padding:'12px 16px', marginTop:12 }}>
                              <div style={{ fontSize:9, fontWeight:800, color:'#8C354B', textTransform:'uppercase', letterSpacing:0.7, marginBottom:10 }}>
                                Extracted Data — Review &amp; Correct
                              </div>
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                                {rcptData.seller && (
                                  <div>
                                    <label style={S.label}>Vendor / Seller</label>
                                    <input style={S.inp} value={companyName} onChange={e=>setCompanyName(e.target.value)} />
                                  </div>
                                )}
                                {rcptData.date && (
                                  <div>
                                    <label style={S.label}>Date</label>
                                    <input type="date" style={S.inp} value={expDate} onChange={e=>setExpDate(e.target.value)} />
                                  </div>
                                )}
                                {rcptData.vatNumber && (
                                  <div>
                                    <label style={S.label}>VAT Reg #</label>
                                    <input style={{ ...S.inp, fontFamily:'monospace' }} value={vatNumber} onChange={e=>setVatNumber(e.target.value)} />
                                  </div>
                                )}
                                <div>
                                  <label style={S.label}>Net Amount (SAR)</label>
                                  <input type="number" style={S.inp} value={amount} onChange={e=>setAmount(e.target.value)} />
                                </div>
                                {rcptData.vatAmount > 0 && (
                                  <div>
                                    <label style={S.label}>VAT Amount (SAR)</label>
                                    <input style={{ ...S.inp, background:'#f0fdf4', color:'#15803d', fontWeight:700 }} value={vatAmount.toFixed(2)} readOnly />
                                  </div>
                                )}
                              </div>
                              <div style={{ marginTop:10, padding:'7px 12px', background:'#f8fafc', borderRadius:7, fontSize:10, color:'#64748b' }}>
                                💡 Fields pre-filled from receipt. You can edit anything above before proceeding.
                              </div>
                            </div>
                          )}

                          {/* Skip option */}
                          {!isDone && !isScanning && (
                            <div style={{ textAlign:'center', marginTop:16 }}>
                              <button onClick={()=>setWizardStep(2)}
                                style={{ background:'none', border:'none', color:'#94a3b8', fontSize:12, cursor:'pointer', textDecoration:'underline' }}>
                                ⏭ Skip — no receipt available
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* ══ STEP 2: Basic Info ══ */}
                    {wizardStep===2 && (
                      <div>
                        <div style={{ fontSize:9, fontWeight:800, color:'#8C354B', letterSpacing:0.8, textTransform:'uppercase', marginBottom:10 }}>🏢 Basic Info</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
                          <div><label style={S.label}>Date *</label><input type="date" style={S.inp} value={expDate} onChange={e=>setExpDate(e.target.value)} /></div>
                          <div>
                            <label style={S.label}>Department</label>
                            <select style={S.inp} value={deptId} onChange={e=>onDeptChange(e.target.value)}>
                              <option value="">-- Select --</option>
                              {depts.map(d=><option key={d.id} value={d.id}>{d.dept_code||d.dept_name}</option>)}
                            </select>
                          </div>
                          <div><label style={S.label}>Contact Number</label><input style={S.inp} value={contactNo} onChange={e=>setContactNo(e.target.value)} placeholder="+966 5X XXX XXXX" /></div>
                        </div>
                        <div>
                          <label style={S.label}>Employee</label>
                          <select style={S.inp} value={empId} onChange={e=>onEmpChange(e.target.value)}>
                            <option value="">-- Select Employee --</option>
                            {employees.map(e=><option key={e.id} value={e.id}>{e.employee_number?`[${e.employee_number}] `:''}{e.full_name_en}</option>)}
                          </select>
                        </div>
                      </div>
                    )}

                    {/* ══ STEP 3: Expense Details ══ */}
                    {wizardStep===3 && (
                      <div>
                        <div style={{ fontSize:9, fontWeight:800, color:'#8C354B', letterSpacing:0.8, textTransform:'uppercase', marginBottom:10 }}>🧾 Expense Details</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                          <div>
                            <label style={S.label}>Expense Type *</label>
                            <select style={S.inp} value={expType} onChange={e=>setExpType(e.target.value)}>
                              <option value="">-- Select Type --</option>
                              {EXPENSE_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={S.label}>Category</label>
                            <select style={S.inp} value={expCat} onChange={e=>setExpCat(e.target.value)}>
                              <option value="">-- Select Category --</option>
                              {EXPENSE_CATS.map(c=><option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
                          <div><label style={S.label}>Net Amount (SAR) *</label><input type="number" step="0.01" style={S.inp} value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" /></div>
                          <div>
                            <label style={S.label}>VAT Paid?</label>
                            <select style={S.inp} value={vatPaid} onChange={e=>setVatPaid(e.target.value==='true')}>
                              <option value="false">No VAT</option>
                              <option value="true">Yes — VAT Included</option>
                            </select>
                          </div>
                          <div><label style={S.label}>VAT %</label><input type="number" style={{ ...S.inp, background:vatPaid?'#fff':'#f8fafc', color:vatPaid?'#111':'#aab2bd' }} value={vatPct} onChange={e=>setVatPct(e.target.value)} disabled={!vatPaid} /></div>
                        </div>
                        {vatPaid && (
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                            <div style={{ background:'#f0fdf4', border:'1px solid #86efac', borderRadius:8, padding:'8px 14px' }}>
                              <div style={{ fontSize:9, fontWeight:700, color:'#166534', marginBottom:2 }}>VAT AMOUNT</div>
                              <div style={{ fontSize:14, fontWeight:800, color:'#15803d' }}>SAR {vatAmount.toFixed(2)}</div>
                            </div>
                            <div style={{ background:'#FAF0F2', border:'1px solid #C1A1A9', borderRadius:8, padding:'8px 14px' }}>
                              <div style={{ fontSize:9, fontWeight:700, color:'#8C354B', marginBottom:2 }}>TOTAL</div>
                              <div style={{ fontSize:14, fontWeight:800, color:'#8C354B' }}>SAR {totalAmount.toFixed(2)}</div>
                            </div>
                          </div>
                        )}
                        <div style={{ display:'grid', gridTemplateColumns: vatPaid ? '1fr 1fr' : '1fr', gap:10 }}>
                          <div><label style={S.label}>Vendor / Company Name</label><input style={S.inp} value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="Vendor name" /></div>
                          {vatPaid && (
                            <div>
                              <label style={S.label}>
                                Vendor VAT Reg #
                                {vatNumber && <span style={{ marginLeft:6, fontSize:9, background:'#d1fae5', color:'#065f46', borderRadius:4, padding:'1px 5px', fontWeight:700 }}>Auto-filled ✓</span>}
                              </label>
                              <input style={{ ...S.inp, fontFamily:'monospace' }} value={vatNumber} onChange={e=>setVatNumber(e.target.value)} placeholder="300XXXXXXXXXXXXXXXXX" />
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ══ STEP 4: Project & Submit ══ */}
                    {wizardStep===4 && (
                      <div>
                        <div style={{ fontSize:9, fontWeight:800, color:'#8C354B', letterSpacing:0.8, textTransform:'uppercase', marginBottom:10 }}>📁 Project &amp; References</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
                          <div><label style={S.label}>Project Number</label><input style={S.inp} value={projNum} onChange={e=>setProjNum(e.target.value)} placeholder="PROJ-001" /></div>
                          <div><label style={S.label}>Project Name</label><input style={S.inp} value={projName} onChange={e=>setProjName(e.target.value)} /></div>
                          <div><label style={S.label}>Job #</label><input style={S.inp} value={jobNum} onChange={e=>setJobNum(e.target.value)} /></div>
                        </div>
                        <div style={{ marginBottom:10 }}><label style={S.label}>Document / Receipt URL</label><input style={S.inp} value={docUrl} onChange={e=>setDocUrl(e.target.value)} placeholder="https://drive.google.com/…" /></div>
                        <div style={{ marginBottom:14 }}><label style={S.label}>Remarks</label><textarea style={{ ...S.inp, minHeight:56, resize:'vertical' }} value={remarks} onChange={e=>setRemarks(e.target.value)} placeholder="Additional notes…" /></div>
                        {/* Final summary */}
                        <div style={{ background:'#FAF0F2', border:'1px solid #C1A1A9', borderRadius:9, padding:'10px 14px' }}>
                          <div style={{ fontSize:9, fontWeight:800, color:'#8C354B', letterSpacing:0.8, textTransform:'uppercase', marginBottom:8 }}>
                            ✅ Submission Summary
                          </div>
                          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                            {[
                              { label:'Employee', val: employees.find(e=>e.id===empId)?.full_name_en || '—' },
                              { label:'Type',     val: expType || '—' },
                              { label:'Vendor',   val: companyName || '—' },
                              { label:'Total',    val: `SAR ${totalAmount.toFixed(2)}` },
                            ].map(({label,val})=>(
                              <div key={label}>
                                <div style={{ fontSize:8, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:0.5, marginBottom:1 }}>{label}</div>
                                <div style={{ fontSize:10, fontWeight:700, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{val}</div>
                              </div>
                            ))}
                          </div>
                          {rcptFile && (
                            <div style={{ marginTop:8, fontSize:10, color:'#64748b', display:'flex', alignItems:'center', gap:6 }}>
                              <span>📎</span>
                              <span>{rcptFile.name}</span>
                              {rcptSource && <span style={{ background:'#dbeafe', color:'#1e40af', borderRadius:4, padding:'1px 6px', fontSize:9, fontWeight:700 }}>{rcptSource}</span>}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

      </FormShell>
    </div>
  )
}
