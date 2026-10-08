import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.Finance
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { postPaymentOutJE } from '../lib/autoPost'
import { printDocument, openPrintWindow } from '../lib/templatePrint'

// ─── Config ───────────────────────────────────────────────────────────────────
const FROM_ACCOUNTS = ['ANB-15', 'ANB-18']

const PC = {
  'Employee':       { color:'#1565c0', bg:'#dbeafe', icon:'👤', label:'Employees' },
  'Sub-Contractor': { color:'#c2410c', bg:'#ffedd5', icon:'🔧', label:'Sub-Contractors' },
  'Supplier':       { color:'#6d28d9', bg:'#ede9fe', icon:'🏢', label:'Suppliers' },
  'Local-Supplier': { color:'#065f46', bg:'#d1fae5', icon:'🛒', label:'Local Suppliers' },
  'Government':     { color:'#991b1b', bg:'#fee2e2', icon:'🏛️', label:'Government' },
  'ANB-77':         { color:'#166534', bg:'#dcfce7', icon:'🏦', label:'ANB-77 Transfer' },
  'ANB-39':         { color:'#155e75', bg:'#cffafe', icon:'🏦', label:'ANB-39 Transfer' },
  'Others':         { color:'#57534e', bg:'#f5f5f4', icon:'📌', label:'Others' },
}
const pc = t => PC[t] || { color:'#64748b', bg:'#f1f5f9', icon:'•', label: t || 'Unknown' }

const STAGE_LABEL = {
  PENDING:          { label:'Pending DH',      bg:'#fff7ed', color:'#c2410c' },
  DH_APPROVED:      { label:'DH Approved',     bg:'#eff6ff', color:'#1d4ed8' },
  PM_APPROVED:      { label:'PM Approved',     bg:'#eff6ff', color:'#1d4ed8' },
  ACCTS_PENDING:    { label:'Accts Review',    bg:'#faf5ff', color:'#7c3aed' },
  FIN_PENDING:      { label:'Finance Review',  bg:'#faf5ff', color:'#7c3aed' },
  FUNDS_SENT:       { label:'Funds Sent',      bg:'#f0fdf4', color:'#15803d' },
  PARTIALLY_ISSUED: { label:'Part. Issued',    bg:'#fefce8', color:'#a16207' },
  CLOSED:           { label:'Closed',          bg:'#f8fafc', color:'#475569' },
}
const stageInfo = k => STAGE_LABEL[k] || { label: k || '—', bg:'#f1f5f9', color:'#64748b' }

const PAYABLE_STAGES = ['DH_APPROVED','PM_APPROVED','ACCTS_PENDING','FIN_PENDING']
const GROUP_ORDER    = ['Employee','Sub-Contractor','Supplier','Local-Supplier','Government','ANB-77','ANB-39','Others']

const S = {
  inp:    { width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #e2e8f0', fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box', background:'#fff' },
  label:  { display:'block', fontSize:11, color:'#64748b', fontWeight:700, marginBottom:4, letterSpacing:0.3 },
  btn:    (bg, color='#fff') => ({ background:bg, color, border:'none', borderRadius:9, padding:'9px 20px', cursor:'pointer', fontSize:13, fontWeight:700 }),
  chip:   (bg, color) => ({ background:bg, color, borderRadius:6, padding:'3px 9px', fontSize:11, fontWeight:700, whiteSpace:'nowrap', display:'inline-block' }),
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modal:  { background:'#fff', borderRadius:18, width:800, maxWidth:'100%', maxHeight:'92vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.22)', display:'flex', flexDirection:'column' },
}

function fmt(n) { return (n||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 }) }

// ─── ANB Receipt parser (works for both digital PDFs and OCR text) ────────────
function parseAnbReceipt(rawText) {
  const flat = rawText.replace(/\r?\n/g,' ').replace(/\s+/g,' ')
  const r = {}
  // Reference / TRN — long alphanumeric after "Reference No" or "Reference Number"
  const refM = flat.match(/Reference\s*(?:No|Number|#)?[:\s]*([A-Z0-9P]{10,60})/i)
  if (refM) r.reference_no = refM[1].trim()
  // Debit Amount / Amount
  const amtM = flat.match(/(?:Debit\s+Amount|Amount)[:\s]*(?:SAR\s*)?([\d,]+\.?\d*)/i)
  if (amtM) r.amount = amtM[1].replace(/,/g,'')
  // Date (multiple formats)
  const dtM = flat.match(/(?:DATE|Value\s+Date|Transfer\s+Date)[:\s]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i)
  if (dtM) { const y = dtM[3].length===2 ? '20'+dtM[3] : dtM[3]; r.date = `${y}-${dtM[2].padStart(2,'0')}-${dtM[1].padStart(2,'0')}` }
  // From account number
  const fromM = flat.match(/(?:From\s*Acct?|Account\s*Number.*?From)[:\s]*(\d{10,18})/i)
  if (fromM) r.from_acct = fromM[1].trim()
  // Beneficiary IBAN
  const ibanM = flat.match(/To\s*Acct(?:ount)?\s*No[:\s#]*([A-Z]{2}[\d\s]{10,32}[0-9])/i)
  if (ibanM) r.iban = ibanM[1].replace(/\s/g,'').toUpperCase()
  // Beneficiary name
  const nameM = flat.match(/(?:Full\s+Name|Acct\s+Name)[:\s]+([A-Za-z][A-Za-z\s'.\-]{2,40})(?=\s{2,}|[A-Z]{2,}:|$)/i)
  if (nameM) r.acct_name = nameM[1].trim()
  return r
}

// ─── pdf.js text extractor (digital PDFs — no OCR, instant, free) ────────────
let _pdfJsReady = null
function loadPdfJs() {
  if (_pdfJsReady) return _pdfJsReady
  _pdfJsReady = new Promise((res, rej) => {
    if (window.pdfjsLib) return res(window.pdfjsLib)
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
      res(window.pdfjsLib)
    }
    s.onerror = () => { _pdfJsReady = null; rej(new Error('pdf.js load failed')) }
    document.head.appendChild(s)
  })
  return _pdfJsReady
}

async function extractPdfText(file) {
  const pdfjs  = await loadPdfJs()
  const buffer = await file.arrayBuffer()
  const pdf    = await pdfjs.getDocument({ data: buffer }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map(it => it.str + (it.hasEOL ? '\n' : ' ')).join('') + '\n'
  }
  return text
}

// ─── Print helper ─────────────────────────────────────────────────────────────
function printInstruction(mr, lines, fromAccount, empMap) {
  const grouped = {}
  lines.forEach(l => {
    const k = l.party_type || 'Others'
    if (!grouped[k]) grouped[k] = []
    grouped[k].push(l)
  })
  const total = lines.reduce((s, l) => s + (parseFloat(l.amount)||0), 0)

  const rowsHtml = GROUP_ORDER.filter(k => grouped[k]).map(k => {
    const grp = grouped[k]
    const grpTotal = grp.reduce((s,l) => s + (parseFloat(l.amount)||0), 0)
    const pInfo = pc(k)
    return `
      <tr><td colspan="4" style="background:${pInfo.bg};color:${pInfo.color};font-weight:800;padding:6px 10px;font-size:12px;">
        ${pInfo.icon} ${pInfo.label} — SAR ${fmt(grpTotal)}
      </td></tr>
      ${grp.map(l => `
        <tr>
          <td style="padding:6px 10px;font-size:12px;">${l.supplier_name||'—'}</td>
          <td style="padding:6px 10px;font-size:11px;font-family:monospace;color:#334155;">${l.iban||'—'}</td>
          <td style="padding:6px 10px;font-size:12px;color:#64748b;">${(l.account_code||'').replace(/_/g,' ')}</td>
          <td style="padding:6px 10px;font-size:13px;font-weight:700;text-align:right;">SAR ${fmt(parseFloat(l.amount)||0)}</td>
        </tr>
      `).join('')}
    `
  }).join('')

  const html = `<!DOCTYPE html><html><head><title>Payment Instruction — ${mr.request_number}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#1e293b;}
    h1{font-size:18px;margin:0 0 4px;}
    .meta{font-size:12px;color:#64748b;margin-bottom:16px;}
    .header-box{border:2px solid #0f172a;border-radius:8px;padding:14px 18px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;}
    .from{background:#fef9c3;border:1px solid #fbbf24;border-radius:6px;padding:10px 16px;font-size:14px;font-weight:800;}
    table{width:100%;border-collapse:collapse;margin-bottom:20px;}
    th{background:#8C354B;color:#fff;padding:8px 10px;font-size:11px;text-align:left;text-transform:uppercase;letter-spacing:0.5px;}
    tr:nth-child(even) td{background:#f8fafc;}
    .total-row td{border-top:2px solid #0f172a;font-weight:800;font-size:14px;padding:10px;}
    .sig{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:30px;}
    .sig-box{border-top:1px solid #94a3b8;padding-top:8px;font-size:11px;color:#64748b;}
    @media print{body{padding:12px;} button{display:none;}}
  </style></head><body>
  <h1>💳 Payment Instruction Sheet</h1>
  <div class="meta">
    MR# <strong>${mr.request_number||'—'}</strong> &nbsp;·&nbsp;
    ${mr.request_date||''} &nbsp;·&nbsp;
    Dept: <strong>${mr.department_name||'—'}</strong> &nbsp;·&nbsp;
    Requested by: <strong>${empMap[mr.requested_by] || mr.requested_by||'—'}</strong>
  </div>
  <div class="header-box">
    <div>
      <div style="font-size:11px;color:#64748b;font-weight:700;margin-bottom:2px;">PURPOSE</div>
      <div style="font-size:14px;font-weight:700;">${mr.purpose||'—'}</div>
    </div>
    <div class="from">FROM: ${fromAccount}</div>
  </div>
  <table>
    <thead><tr>
      <th>Beneficiary</th><th>IBAN / Account</th><th>Expense Type</th><th style="text-align:right;">Amount (SAR)</th>
    </tr></thead>
    <tbody>
      ${rowsHtml}
      <tr class="total-row">
        <td colspan="3">GRAND TOTAL</td>
        <td style="text-align:right;">SAR ${fmt(total)}</td>
      </tr>
    </tbody>
  </table>
  <div class="sig">
    <div class="sig-box">Prepared by (Finance)<br><br><br>Name &amp; Designation:___________________<br>Date:___________________</div>
    <div class="sig-box">Approved by (GM / Director)<br><br><br>Name &amp; Designation:___________________<br>Date:___________________</div>
  </div>
  <div style="text-align:center;margin-top:20px;">
    <button onclick="window.print()" style="background:#0f172a;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;">🖨️ Print</button>
  </div>
  </body></html>`

  const w = window.open('','_blank','width=900,height=750')
  w.document.write(html)
  w.document.close()
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Payments({ entityId, entityName, entityNameEn }) {
  const [tab,         setTab]         = useState('awaiting')
  const [pendingMRs,  setPendingMRs]  = useState([])
  const [history,     setHistory]     = useState([])
  const [depts,       setDepts]       = useState([])
  const [empMap,      setEmpMap]      = useState({})   // UUID → full_name_en
  const [loading,     setLoading]     = useState(true)

  // Filters
  const [search,      setSearch]      = useState('')
  const [deptFilter,  setDeptFilter]  = useState('')
  const [histFrom,    setHistFrom]    = useState(() => { const d=new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,10) })
  const [histTo,      setHistTo]      = useState(() => new Date().toISOString().slice(0,10))

  // Instruction Sheet modal
  const [showSheet,    setShowSheet]    = useState(false)
  const [selMR,        setSelMR]        = useState(null)
  const [mrLines,      setMrLines]      = useState([])
  const [linesLoading, setLinesLoading] = useState(false)
  const [fromAccount,  setFromAccount]  = useState('ANB-15')
  const [payDate,      setPayDate]      = useState(() => new Date().toISOString().slice(0,10))
  const [reference,    setReference]    = useState('')
  const [notes,        setNotes]        = useState('')
  const [saving,       setSaving]       = useState(false)
  // Per-line TRN# (keyed by line index)
  const [lineTrns,       setLineTrns]       = useState({})
  // Per-line payment method { [line.id]: 'BANK_TRANSFER'|'CHEQUE'|'CASH' }
  const [linePayMethods, setLinePayMethods] = useState({})
  // Per-line receipt attachments { [line.id]: { file, status, warns } }
  const [lineFiles,      setLineFiles]      = useState({})
  // Per-line expanded detail (IBAN + type) toggle
  const [expandedLines,  setExpandedLines]  = useState({})

  // Batch ANB-39 pay (shared single transfer covers multiple MRs)
  const [batchMode,     setBatchMode]     = useState(false)
  const [batchSelected, setBatchSelected] = useState(new Set())
  const [showBatch,     setShowBatch]     = useState(false)
  const [batchSaving,   setBatchSaving]   = useState(false)
  const [batchRef,      setBatchRef]      = useState('')
  const [batchDate,     setBatchDate]     = useState(() => new Date().toISOString().slice(0,10))
  const [batchFrom,     setBatchFrom]     = useState('ANB-15')
  const [batchFile,     setBatchFile]     = useState(null)
  const [batchOcrStatus,setBatchOcrStatus]= useState('')
  const [batchWarnings, setBatchWarnings] = useState([])

  // Send Back to DH
  const [showSendBack,   setShowSendBack]   = useState(false)
  const [sendBackReason, setSendBackReason] = useState('')
  const [sendingBack,    setSendingBack]    = useState(false)

  // 4-layer wizard
  const [showBanner,  setShowBanner]  = useState(false)
  const [wizardStep,  setWizardStep]  = useState(1)

  // ─── Load ────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!entityId) return
    setLoading(true)
    const [mrRes, rcvRes, depRes, empRes] = await Promise.all([
      // Fetch all MRs for entity, filter payable stages client-side (same pattern as MoneyRequests.jsx)
      supabase.from('money_requests')
        .select('*')
        .eq('entity_id', entityId)
        .order('request_date', { ascending: false }),

      supabase.from('money_received')
        .select('id,money_request_id,received_date,received_amount,payment_method,bank_account,reference,notes')
        .eq('entity_id', entityId)
        .gte('received_date', histFrom)
        .lte('received_date', histTo)
        .order('received_date', { ascending: false }),

      supabase.from('departments')
        .select('id,dept_code,dept_name,dept_head_id')
        .eq('entity_id', entityId)
        .eq('is_active', true)
        .order('dept_code'),

      supabase.from('employees')
        .select('id,full_name_en')
        .eq('entity_id', entityId)
        .eq('is_active', true),
    ])

    const allMRs   = mrRes.data || []
    const rcvData  = rcvRes.data || []

    // Diagnostic — remove after fix confirmed
    console.log('[Payments] entityId:', entityId)
    console.log('[Payments] mrRes.error:', mrRes.error)
    console.log('[Payments] allMRs count:', allMRs.length, '| statuses:', allMRs.map(r => r.status))
    console.log('[Payments] payable filter result:', allMRs.filter(r => PAYABLE_STAGES.includes(r.status)).length)

    // Build MR lookup map for history rows
    const mrMap = {}
    allMRs.forEach(m => { mrMap[m.id] = m })

    // Build UUID → name map for requestor display
    const em = {}
    ;(empRes.data || []).forEach(e => { em[e.id] = e.full_name_en })
    setEmpMap(em)

    setPendingMRs(allMRs.filter(r => PAYABLE_STAGES.includes(r.status)))
    setHistory(rcvData.map(r => ({ ...r, mr: mrMap[r.money_request_id] || {} })))
    setDepts(depRes.data || [])
    setLoading(false)
  }, [entityId, histFrom, histTo])

  useEffect(() => { load() }, [load])

  // ─── Scan receipt PDF → auto-fill TRN + date + validation ───────────────────
  async function scanReceiptFile(file, setStatus, onTrn, onDate, onParsed) {
    if (!file) return
    setStatus('⏳ Reading PDF…')
    try {
      const text   = await extractPdfText(file)
      const parsed = parseAnbReceipt(text)
      if (parsed.reference_no) {
        onTrn(parsed.reference_no)
        setStatus(`✅ TRN extracted: ${parsed.reference_no}${parsed.acct_name ? ` · ${parsed.acct_name}` : ''}`)
      } else {
        setStatus('⚠️ TRN not found in PDF — fill manually. Try with a cleaner PDF export.')
      }
      if (parsed.date && onDate) onDate(parsed.date)
      if (onParsed) onParsed(parsed)
    } catch (err) {
      setStatus('⚠️ PDF read failed — fill TRN manually')
    }
  }

  // ─── Base64 encode a File for Drive upload ────────────────────────────────────
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // ─── Upload a receipt PDF to Drive and return the view URL ────────────────────
  // baseFileName: full base name WITHOUT extension, e.g. "MR-2026-0023-KhanAlamSherAlam-1000.00"
  async function uploadReceiptToDrive(file, baseFileName) {
    try {
      const b64      = await fileToBase64(file)
      const safe     = (baseFileName || 'receipt').replace(/[^a-zA-Z0-9._-]/g, '_')
      const { data: upData } = await supabase.functions.invoke('drive-upload', {
        body: {
          file:           b64,
          fileName:       `${safe}.pdf`,
          mimeType:       'application/pdf',
          folder:         'payment-notifications',   // valid key for allowedFolders check
          parentFolderId: '1meiRD2_OjALapYNaErGoXqmRCI-9fbHM',
        }
      })
      return upData?.success ? (upData.viewUrl || null) : null
    } catch (_) {
      return null
    }
  }

  // ─── Scan a receipt file for a specific line ──────────────────────────────────
  async function scanLineReceipt(file, lineId, lineObj, globalIdx) {
    setLineFiles(prev => ({ ...prev, [lineId]: { ...(prev[lineId]||{}), file, status:'⏳ Reading…', warnings:[] } }))
    if (!(file.type === 'application/pdf' || file.name.endsWith('.pdf'))) {
      setLineFiles(prev => ({ ...prev, [lineId]: { file, status:'📷 Image — fill TRN manually', warnings:[] } }))
      return
    }
    try {
      const text   = await extractPdfText(file)
      const parsed = parseAnbReceipt(text)
      const warns  = []

      // Auto-fill TRN for this specific line
      if (parsed.reference_no) {
        setLineTrns(prev => ({ ...prev, [globalIdx]: parsed.reference_no }))
      }

      // Validate: amount vs this line's amount
      if (parsed.amount) {
        const pAmt = parseFloat(parsed.amount)
        const lAmt = parseFloat(lineObj.amount) || 0
        if (Math.abs(pAmt - lAmt) > 0.01)
          warns.push(`⚠️ Amount: receipt SAR ${parsed.amount} vs line SAR ${lAmt.toFixed(2)}`)
      }
      // Validate: IBAN
      if (parsed.iban && lineObj.iban) {
        const receiptIban = parsed.iban.replace(/\s/g,'').toUpperCase()
        const lineIban    = (lineObj.iban||'').replace(/\s/g,'').toUpperCase()
        if (receiptIban !== lineIban)
          warns.push(`⚠️ IBAN mismatch: receipt ${parsed.iban}`)
      }
      // Soft-check: name
      if (parsed.acct_name && lineObj.supplier_name) {
        const first = (lineObj.supplier_name||'').toLowerCase().split(' ')[0]
        if (first.length > 2 && !parsed.acct_name.toLowerCase().includes(first))
          warns.push(`ℹ️ Name: receipt "${parsed.acct_name}" — verify`)
      }

      const ok = !!parsed.reference_no
      setLineFiles(prev => ({
        ...prev,
        [lineId]: { file, status: ok ? `✅ TRN: ${parsed.reference_no}` : '⚠️ TRN not found — fill manually', warns }
      }))
    } catch (_) {
      setLineFiles(prev => ({ ...prev, [lineId]: { file, status:'⚠️ PDF read failed', warns:[] } }))
    }
  }

  // ─── Batch ANB-39 mark all selected MRs paid with one TRN ────────────────────
  async function markBatchPaid() {
    if (batchSelected.size === 0) { alert('Select at least one MR'); return }
    if (!batchRef.trim())         { alert('Bank TRN / Ref # is required'); return }
    setBatchSaving(true)

    // Upload batch receipt PDF once → shared Drive URL for all MRs
    let batchReceiptUrl = null
    if (batchFile && (batchFile.type === 'application/pdf' || batchFile.name.endsWith('.pdf'))) {
      batchReceiptUrl = await uploadReceiptToDrive(batchFile, `BATCH-${batchRef.trim().slice(-8)}`)
    }

    const ids = [...batchSelected]
    for (const mrId of ids) {
      const mr = pendingMRs.find(m => m.id === mrId)
      if (!mr) continue
      const total = mr.amount || 0
      const reqNum = (mr.request_number || mr.mr_number || mrId).toString()
      const { error: insErr } = await supabase.from('money_received').insert({
        entity_id: entityId, money_request_id: mrId,
        received_date: batchDate, received_amount: total,
        payment_method: 'BANK_TRANSFER', bank_account: batchFrom,
        reference: batchRef.trim(),
        notes: `Batch transfer — shared TRN covers ${ids.length} MR(s)${batchReceiptUrl ? ' | Receipt saved to Drive' : ''}`,
        attachment_url: batchReceiptUrl || null,
        status: 'CONFIRMED',
      })
      if (!insErr) {
        await supabase.from('money_requests').update({
          status: 'FUNDS_SENT', received_amount: total, paid_from: batchFrom,
        }).eq('id', mrId)
      }
    }
    setBatchSaving(false)
    setShowBatch(false)
    setBatchMode(false)
    setBatchSelected(new Set())
    setBatchRef('')
    setBatchFile(null)
    setBatchOcrStatus('')
    setBatchWarnings([])
    load()
  }

  // ─── Open Instruction Sheet ───────────────────────────────────────────────────
  async function openSheet(mr) {
    setSelMR(mr)
    setFromAccount(mr.paid_from || 'ANB-15')
    setPayDate(new Date().toISOString().slice(0,10))
    setReference(mr.request_number || mr.mr_number || '')
    setNotes('')
    setLineTrns({})
    setLinePayMethods({})
    setLineFiles({})
    setExpandedLines({})
    setShowSendBack(false)
    setSendBackReason('')
    setWizardStep(1)
    setShowBanner(true)   // ← show banner first
    // Load lines in background so they're ready when user reaches Step 2
    setLinesLoading(true)
    const { data, error } = await supabase
      .from('money_request_lines')
      .select('*')
      .eq('money_request_id', mr.id)
      .order('sort_order')
    if (error) console.error('[Payments] lines error:', error)
    setMrLines(data || [])
    setLinesLoading(false)
  }

  // ─── Mark Paid ────────────────────────────────────────────────────────────────
  async function markPaid() {
    if (!selMR) return
    const total = mrLines.reduce((s,l) => s + (parseFloat(l.amount)||0), 0)
    if (mrLines.length === 0) { alert('Cannot mark as paid — this MR has no saved lines.'); return }
    if (total <= 0) { alert('No line amounts found on this MR'); return }

    // Reference = auto-filled MR number (tracking only); per-line TRNs are on each row
    const effRef = reference.trim() || (selMR.request_number || selMR.mr_number || '')

    // Open print window synchronously before any await (popup blocker bypass)
    const preWin = openPrintWindow()

    setSaving(true)

    // ── Classify lines: Contra (ANB-77/ANB-39) vs Direct ──────────────────
    const CONTRA_TYPES = ['ANB-77', 'ANB-39']
    const hasContraLines  = mrLines.some(l => CONTRA_TYPES.includes(l.party_type))
    const directLines     = mrLines.filter(l => !CONTRA_TYPES.includes(l.party_type))

    // ── Detect overall payment method from per-line selections ────────────
    const methodCounts = {}
    mrLines.forEach(l => {
      const m = linePayMethods[l.id] || 'BANK_TRANSFER'
      methodCounts[m] = (methodCounts[m] || 0) + 1
    })
    const overallMethod = Object.entries(methodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'BANK_TRANSFER'

    // ── Save per-line TRN# and payment_method to money_request_lines ──────
    for (const [idxStr, trn] of Object.entries(lineTrns)) {
      if (!trn?.trim()) continue
      const lineObj = mrLines[parseInt(idxStr)]
      if (lineObj?.id) {
        await supabase.from('money_request_lines')
          .update({ bank_ref: trn.trim(), payment_method: linePayMethods[lineObj.id] || 'BANK_TRANSFER' })
          .eq('id', lineObj.id)
      }
    }

    // ── Upload per-line receipts to Drive ─────────────────────────────────
    // Filename: {fromAccount} to {partyType} {BeneficiaryName} {PayMethod} with Ref# {TRN} {DDMMYY}
    const dateShort = payDate.replace(/-/g,'').slice(2,8)  // YYMMDD → DDMMYY
      .replace(/^(\d{2})(\d{2})(\d{2})$/, '$3$2$1')        // YYMMDD → DDMMYY
    for (const lineObj of mrLines) {
      const lf = lineFiles[lineObj.id]
      if (!lf?.file || !(lf.file.type === 'application/pdf' || lf.file.name.endsWith('.pdf'))) continue
      const globalIdx   = mrLines.indexOf(lineObj)
      const beneficiary = (lineObj.supplier_name || 'Unknown').replace(/\s+/g,' ').trim()
      const partyType   = lineObj.party_type || 'Others'
      const payMethod   = (linePayMethods[lineObj.id] || 'BANK_TRANSFER').replace('_TRANSFER','')
      const trn         = (lineTrns[globalIdx] || '').trim()
      const baseFileName = trn
        ? `${fromAccount} to ${partyType} ${beneficiary} ${payMethod} with Ref# ${trn} ${dateShort}`
        : `${fromAccount} to ${partyType} ${beneficiary} ${payMethod} ${dateShort}`
      const driveUrl = await uploadReceiptToDrive(lf.file, baseFileName)
      if (driveUrl && lineObj.id) {
        await supabase.from('money_request_lines')
          .update({ attachment_url: driveUrl }).eq('id', lineObj.id)
      }
    }

    // ── Record money_received ──────────────────────────────────────────────
    const { data: rcvData, error: rcvErr } = await supabase.from('money_received').insert({
      entity_id:        entityId,
      money_request_id: selMR.id,
      received_date:    payDate,
      received_amount:  total,
      payment_method:   overallMethod,
      bank_account:     fromAccount,
      reference:        effRef,
      notes:            notes.trim() || null,
      status:           hasContraLines ? 'OPEN' : 'CONFIRMED',  // direct = auto-confirmed
    }).select('id').single()
    if (rcvErr) { alert('Error recording payment: ' + rcvErr.message); setSaving(false); return }

    // ── For direct (non-Contra) lines → auto-create PAID distribution rows ─
    // Bank/IBAN transfers are settled at payment stage; no manual distribution needed
    if (directLines.length > 0 && rcvData?.id) {
      const distPayload = directLines.map(l => ({
        entity_id:         entityId,
        money_received_id: rcvData.id,
        money_request_id:  selMR.id,
        distribution_date: payDate,
        party_type:        l.party_type || 'Others',
        party_id:          l.party_id   || null,
        party_name:        l.supplier_name || null,
        gross_amount:      parseFloat(l.amount) || 0,
        vat_amount:        0,
        account_code:      l.account_code || null,
        purpose:           l.account_code || selMR.purpose || null,
        iban_used:         l.iban         || null,
        status:            'PAID',   // settled by bank — no further action needed
      }))
      const { error: distErr } = await supabase.from('money_distributions').insert(distPayload)
      if (distErr) console.error('[Payments] auto-distribution error:', distErr.message)
    }

    // ── Determine new MR status ────────────────────────────────────────────
    // Contra → FUNDS_SENT (DH must physically confirm cash received, then distribute)
    // Pure direct IBAN/Cheque → COMPLETED (auto-settled; no further action needed)
    const newStatus = hasContraLines ? 'FUNDS_SENT' : 'COMPLETED'

    const { error: updErr } = await supabase.from('money_requests').update({
      status:    newStatus,
      paid_from: fromAccount,
    }).eq('id', selMR.id).select('id')

    if (updErr) {
      alert('Payment recorded but failed to update MR status:\n' + updErr.message)
    }

    // Auto-post journal entry: Dr Expense / Cr Bank
    if (!updErr) {
      const bankCoaMap = {
        'ANB-15': '1110', 'ANB-18': '1110',
        'ANB-39': '1120',
        'ANB-77': '1130',
      }
      const bankCode = bankCoaMap[fromAccount] || '1110'
      const payDate2 = payDate
      postPaymentOutJE({
        entityId,
        moneyRequestId: selMR.id,
        date:           payDate2,
        amount:         total,
        narration:      `Payment — ${selMR.purpose || selMR.mr_number || selMR.id}`,
        reference:      effRef,
        category:       selMR.category || '',
        bankAccountCode: bankCode,
      }).catch(e => console.error('autoPost paymentOut JE failed:', e))
    }

    // ── Fire Payment Notification template ────────────────────────────────
    if (!updErr) {
      const selDept     = depts.find(d => d.id === selMR.department_id) || {}
      const deptHeadName = selDept.dept_head_id ? (empMap[selDept.dept_head_id] || '') : ''
      const payDateFinal = payDate

      const pnDateStr = payDateFinal ? payDateFinal.replace(/-/g, '').slice(2) : ''
      const pnRef     = (selMR.request_number || selMR.mr_number || selMR.id || '').toString().replace(/\s+/g,'-')
      printDocument('payment_instruction', {
        dept_head_en:         deptHeadName || empMap[selMR.requested_by] || '—',
        requested_by_dept_en: selDept.dept_code || selDept.dept_name || selMR.department_name || '—',
        payment_date:         payDateFinal,
        request_number:       selMR.request_number || selMR.mr_number || '',
        payment_reference:    effRef,
        from_account:         fromAccount,
        payment_method:       overallMethod,
        total_amount:         total,
        initiated_by_name_en: 'Mohammed Rashad',
        lines: mrLines.map((l, i) => ({ ...l, trn: lineTrns[i] || '' })),
      }, {
        orientation:   'landscape',
        driveFolder:   'payment-notifications',
        driveFileName: `PN-${pnRef}-${pnDateStr}.pdf`,
        requestDate:   payDateFinal,
        autoRun:       true,
        _preWin:       preWin,
      })
    } else {
      // payment failed — close the window we opened
      if (preWin) preWin.close()
    }

    setSaving(false)
    setShowSheet(false)
    setSelMR(null)
    setMrLines([])
    setLineTrns({})
    load()
  }

  // ─── Send Back to DH ──────────────────────────────────────────────────────────
  async function sendBackToDH() {
    if (!selMR) return
    if (!sendBackReason.trim()) { alert('Please enter a reason before sending back.'); return }
    setSendingBack(true)

    // Build timestamped log entry and append to existing note (preserves history)
    const now = new Date()
    const ts = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
           + ' ' + now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit', hour12:false })
    const newEntry = `↩ Sent back on ${ts}\n${sendBackReason.trim()}`
    const updatedNote = selMR.accounts_note
      ? selMR.accounts_note + '\n──────────\n' + newEntry
      : newEntry

    const { error } = await supabase.from('money_requests').update({
      status:        'DH_REVIEW',
      accounts_note: updatedNote,
    }).eq('id', selMR.id)
    if (error) { alert('Error: ' + error.message); setSendingBack(false); return }
    setSendingBack(false)
    setShowSendBack(false)
    setSendBackReason('')
    setShowSheet(false)
    setSelMR(null)
    setMrLines([])
    load()
  }

  // ─── Group lines by party type ────────────────────────────────────────────────
  function groupLines(lines) {
    const groups = {}
    lines.forEach(l => {
      const k = l.party_type || 'Others'
      if (!groups[k]) groups[k] = []
      groups[k].push(l)
    })
    return GROUP_ORDER.filter(k => groups[k]).map(k => ({
      type: k,
      lines: groups[k],
      total: groups[k].reduce((s,l) => s + (parseFloat(l.amount)||0), 0),
    }))
  }

  // ─── KPIs ─────────────────────────────────────────────────────────────────────
  const totalAwaiting  = pendingMRs.reduce((s,r) => s + Math.max(0,(r.amount||0)-(r.received_amount||0)), 0)
  const totalPaidPeriod = history.reduce((s,r) => s + (r.received_amount||0), 0)

  // ─── Filters ──────────────────────────────────────────────────────────────────
  const q = search.toLowerCase()
  const filteredPending = pendingMRs.filter(r =>
    (!deptFilter || r.department_id === deptFilter) &&
    (!q || (r.request_number||'').toLowerCase().includes(q) ||
           (r.purpose||'').toLowerCase().includes(q) ||
           (r.department_name||'').toLowerCase().includes(q))
  )
  const filteredHistory = history.filter(r =>
    !q || (r.mr?.request_number||'').toLowerCase().includes(q) ||
          (r.mr?.purpose||'').toLowerCase().includes(q) ||
          (r.reference||'').toLowerCase().includes(q)
  )

  const lineTotal = mrLines.reduce((s,l) => s + (parseFloat(l.amount)||0), 0)
  const groups    = groupLines(mrLines)

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div>

      {/* ── KPI Strip ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
        {[
          { label:'Total Awaiting',  val:`SAR ${fmt(totalAwaiting)}`,    icon:'💰', g1:'#1e40af', g2:'#3b82f6' },
          { label:'Open Requests',   val:`${pendingMRs.length} MRs`,     icon:'📋', g1:'#065f46', g2:'#10b981' },
          { label:'Paid This Period',val:`SAR ${fmt(totalPaidPeriod)}`,  icon:'✅', g1:'#6d28d9', g2:'#a78bfa' },
          { label:'Payments Made',   val:`${history.length}`,            icon:'🏦', g1:'#92400e', g2:'#f59e0b' },
        ].map(({ label, val, icon, g1, g2 }) => (
          <div key={label} style={{ background:`linear-gradient(135deg,${g1},${g2})`, borderRadius:12, padding:'12px 16px', boxShadow:`0 4px 16px ${g1}55` }}>
            <div style={{ fontSize:10, color:'rgba(255,255,255,0.8)', fontWeight:700, textTransform:'uppercase', letterSpacing:0.8, marginBottom:4 }}>{icon} {label}</div>
            <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>{val}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display:'flex', gap:0, borderBottom:'2px solid #e2e8f0', marginBottom:0 }}>
        {[
          { key:'awaiting', label:`💸 Awaiting Payment`, count: pendingMRs.length },
          { key:'history',  label:`📋 Payment History`,  count: null },
        ].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSearch('') }}
            style={{ border:'none', background:'none', padding:'10px 24px', cursor:'pointer', fontSize:13, fontWeight:700,
              color: tab===t.key ? '#0f172a' : '#94a3b8',
              borderBottom: tab===t.key ? '2px solid #0f172a' : '2px solid transparent',
              marginBottom:-2 }}>
            {t.label}{t.count !== null ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {/* ── Filter Bar ── */}
      <div style={{ padding:'10px 16px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0',
        display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        <input placeholder="🔍 Search MR#, purpose, dept…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...S.inp, maxWidth:240, padding:'7px 11px', fontSize:12 }} />
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          style={{ ...S.inp, maxWidth:200, padding:'7px 11px', fontSize:12 }}>
          <option value="">All Departments</option>
          {depts.map(d => <option key={d.id} value={d.id}>{d.dept_code || d.dept_name}</option>)}
        </select>
        {tab === 'history' && (
          <>
            <label style={{ ...S.label, marginBottom:0 }}>FROM</label>
            <input type="date" value={histFrom} onChange={e => setHistFrom(e.target.value)} style={{ ...S.inp, width:150, padding:'6px 10px' }} />
            <label style={{ ...S.label, marginBottom:0 }}>TO</label>
            <input type="date" value={histTo}   onChange={e => setHistTo(e.target.value)}   style={{ ...S.inp, width:150, padding:'6px 10px' }} />
          </>
        )}
        {tab === 'awaiting' && (
          <button onClick={() => { setBatchMode(m => !m); setBatchSelected(new Set()); setShowBatch(false) }}
            style={{ ...S.btn(batchMode ? '#1e40af' : '#f1f5f9', batchMode ? '#fff' : '#374151'), padding:'7px 14px', fontSize:12, border: batchMode ? 'none' : '1px solid #e2e8f0' }}>
            {batchMode ? '✕ Cancel Batch' : '🔀 Batch Pay (ANB-39)'}
          </button>
        )}
        {(search || deptFilter) && (
          <button onClick={() => { setSearch(''); setDeptFilter('') }}
            style={{ ...S.btn('#fee2e2','#b91c1c'), padding:'7px 12px', fontSize:12 }}>✕ Clear</button>
        )}
        <span style={{ marginLeft:'auto', fontSize:12, color:'#94a3b8' }}>
          {tab === 'awaiting' ? `${filteredPending.length} of ${pendingMRs.length}` : `${filteredHistory.length} records`}
        </span>
      </div>

      {/* ── Awaiting Tab ── */}
      {tab === 'awaiting' && (
        <div style={{ background:'#fff', borderRadius:14, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', overflow:'hidden', marginTop:0 }}>
          {batchMode && batchSelected.size > 0 && (
            <div style={{ padding:'10px 16px', background:'#eff6ff', borderBottom:'2px solid #bfdbfe', display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
              <span style={{ fontSize:13, fontWeight:700, color:'#1e40af' }}>
                {batchSelected.size} MR{batchSelected.size>1?'s':''} selected —
                SAR {fmt(pendingMRs.filter(m=>batchSelected.has(m.id)).reduce((s,m)=>s+(m.amount||0),0))} total
              </span>
              <button onClick={() => setShowBatch(true)}
                style={{ ...S.btn('linear-gradient(135deg,#1e40af,#1d4ed8)'), padding:'7px 18px', fontSize:13 }}>
                💳 Mark All Selected as Paid →
              </button>
              <button onClick={() => setBatchSelected(new Set())}
                style={{ ...S.btn('#fee2e2','#b91c1c'), padding:'7px 12px', fontSize:12 }}>Clear</button>
            </div>
          )}
          {/* Column headers */}
          <div style={{ display:'grid', gridTemplateColumns:`${batchMode?'40px ':''}140px 90px 80px 1fr 130px 110px 110px 100px`,
            gap:8, padding:'9px 16px', background:MC, position:'sticky', top:0, zIndex:2,
            fontSize:10, fontWeight:800, color:'#fff', textTransform:'uppercase', letterSpacing:0.5 }}>
            {batchMode && <span>☑</span>}
            <span>MR #</span><span>Date</span><span>Dept</span><span>Purpose</span>
            <span>Requestor</span><span>Total (SAR)</span><span>Stage</span><span></span>
          </div>

          {loading ? (
            <div style={{ textAlign:'center', padding:50, color:'#cbd5e1' }}>Loading…</div>
          ) : filteredPending.length === 0 ? (
            <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>
              {search || deptFilter ? '🔍 No requests match your filters' : '✅ All clear — no pending payments'}
            </div>
          ) : filteredPending.map((r, idx) => {
            const st       = stageInfo(r.status)
            const isChkd   = batchSelected.has(r.id)
            return (
              <div key={r.id} style={{
                display:'grid', gridTemplateColumns:`${batchMode?'40px ':''}140px 90px 80px 1fr 130px 110px 110px 100px`,
                gap:8, padding:'12px 16px', alignItems:'center',
                background: isChkd ? '#eff6ff' : (idx%2===0 ? '#fff' : '#fafafa'),
                borderBottom:'1px solid #f1f5f9', cursor: batchMode ? 'pointer' : 'default',
                borderLeft: isChkd ? '3px solid #3b82f6' : '3px solid transparent' }}
                onClick={batchMode ? () => {
                  setBatchSelected(prev => {
                    const next = new Set(prev)
                    next.has(r.id) ? next.delete(r.id) : next.add(r.id)
                    return next
                  })
                } : undefined}>
                {batchMode && (
                  <input type="checkbox" checked={isChkd} readOnly
                    style={{ width:17, height:17, cursor:'pointer', accentColor:'#1e40af' }} />
                )}
                <span style={{ fontSize:13, fontWeight:800, color:'#1e40af', fontFamily:'monospace' }}>{r.request_number||'—'}</span>
                <span style={{ fontSize:11, color:'#94a3b8' }}>{r.request_date}</span>
                <span style={{ background:'#f1f5f9', color:'#475569', borderRadius:5, padding:'2px 7px', fontSize:10, fontWeight:800 }}>
                  {r.department_name||'—'}
                </span>
                <span style={{ fontSize:12, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', paddingRight:8 }}>
                  {r.purpose||'—'}
                </span>
                <span style={{ fontSize:11, color:'#64748b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {empMap[r.requested_by] || r.requested_by || '—'}
                </span>
                <span style={{ fontSize:13, fontWeight:800, color:'#1e293b' }}>
                  SAR {fmt(r.amount||0)}
                </span>
                <span style={S.chip(st.bg, st.color)}>{st.label}</span>
                {!batchMode ? (
                  <button onClick={() => openSheet(r)}
                    style={{ ...S.btn('linear-gradient(135deg,#1e293b,#334155)'), padding:'7px 14px', fontSize:12, width:'100%' }}>
                    💳 Pay
                  </button>
                ) : (
                  <span style={{ fontSize:11, color: isChkd ? '#1e40af' : '#94a3b8', fontWeight:700 }}>
                    {isChkd ? '☑ Selected' : 'Click to select'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── History Tab ── */}
      {tab === 'history' && (
        <div style={{ background:'#fff', borderRadius:14, boxShadow:'0 2px 8px rgba(0,0,0,0.06)', overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'140px 100px 1fr 110px 130px 110px 120px',
            gap:8, padding:'9px 16px', background:MC, position:'sticky', top:0, zIndex:2,
            fontSize:10, fontWeight:800, color:'#fff', textTransform:'uppercase', letterSpacing:0.5 }}>
            <span>MR #</span><span>Pay Date</span><span>Purpose</span><span>Amount</span><span>From</span><span>Method</span><span>Ref #</span>
          </div>
          {loading ? (
            <div style={{ textAlign:'center', padding:50, color:'#cbd5e1' }}>Loading…</div>
          ) : filteredHistory.length === 0 ? (
            <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>No payments in this period</div>
          ) : filteredHistory.map((rcv, idx) => (
            <div key={rcv.id} style={{
              display:'grid', gridTemplateColumns:'140px 100px 1fr 110px 130px 110px 120px',
              gap:8, padding:'12px 16px', alignItems:'center',
              background: idx%2===0 ? '#fff' : '#fafafa', borderBottom:'1px solid #f1f5f9' }}>
              <span style={{ fontSize:13, fontWeight:800, color:'#15803d', fontFamily:'monospace' }}>{rcv.mr?.request_number||'—'}</span>
              <span style={{ fontSize:11, color:'#94a3b8' }}>{rcv.received_date}</span>
              <span style={{ fontSize:12, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{rcv.mr?.purpose||'—'}</span>
              <span style={{ fontSize:13, fontWeight:800, color:'#15803d' }}>SAR {fmt(rcv.received_amount||0)}</span>
              <span style={{ fontSize:12, fontWeight:700, color:'#1e293b' }}>{rcv.bank_account||'—'}</span>
              <span style={{ fontSize:11, color:'#64748b' }}>{(rcv.payment_method||'—').replace(/_/g,' ')}</span>
              <span style={{ fontSize:11, color:'#64748b', fontFamily:'monospace' }}>{rcv.reference||'—'}</span>
            </div>
          ))}
          {filteredHistory.length > 0 && (
            <div style={{ padding:'10px 16px', background:'#f0fdf4', borderTop:'2px solid #bbf7d0',
              display:'flex', justifyContent:'flex-end', gap:20, fontSize:13 }}>
              <span style={{ color:'#64748b' }}>{filteredHistory.length} payment{filteredHistory.length!==1?'s':''}</span>
              <span>Total: <strong style={{ color:'#15803d' }}>SAR {fmt(totalPaidPeriod)}</strong></span>
            </div>
          )}
        </div>
      )}

      {/* ── PageBanner — Step 0 entry ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); setShowSheet(true) }}
        chapterL1="#C1A1A9"
        chapterL2="#FAF0F2"
        moduleColor="#8C354B"
        chapterLabel="Finance"
        formTitle={['Payment', 'Sheet']}
        steps={['Request Details', 'Payment Lines', 'Summary']}
        icon="💳"
        description="Process approved money requests and wire funds to beneficiaries."
      />

      {/* ══════════════════════════════════════════════════════════════════════
          PAYMENT INSTRUCTION SHEET — 4-LAYER FINANCE WIZARD
      ══════════════════════════════════════════════════════════════════════ */}
      {showSheet && selMR && (
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,0.62)', backdropFilter:'blur(6px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16, fontFamily:"'Poppins',sans-serif" }}
          onClick={e => { if(e.target===e.currentTarget){ setShowSheet(false); setShowSendBack(false); setSendBackReason('') }}}>

          {/* L1 — mauve border frame */}
          <div style={{ background:'#C1A1A9', borderRadius:18, padding:8, width:940, maxWidth:'98vw', maxHeight:'94vh', display:'flex', flexDirection:'column', boxShadow:'0 28px 80px rgba(0,0,0,0.35)' }}
            onClick={e => e.stopPropagation()}>

            {/* L2 — light pink inner */}
            <div style={{ background:'#FAF0F2', borderRadius:12, flex:1, display:'flex', flexDirection:'row', overflow:'hidden', minHeight:560 }}>

              {/* ── LEFT SIDEBAR ── */}
              <div style={{ width:152, flexShrink:0, padding:'16px 14px 16px', display:'flex', flexDirection:'column', alignItems:'flex-start' }}>
                <div style={{ fontSize:13, fontWeight:900, color:'#3e1020', lineHeight:1.2, whiteSpace:'nowrap', position:'relative', zIndex:10 }}>
                  {entityName || entityNameEn || 'Ratal Group'}
                </div>
                <div style={{ marginTop:80, width:'100%', textAlign:'center' }}>
                  <div style={{ fontSize:12, fontWeight:800, color:'#8C354B', marginBottom:2 }}>Finance</div>
                  <div style={{ fontSize:22, fontWeight:900, color:'#3e1020', letterSpacing:0.2, lineHeight:1.15 }}>Payment Sheet</div>
                </div>
                <div style={{ flex:1 }} />
                {/* Step nav */}
                <div style={{ alignSelf:'flex-start', width:'100%' }}>
                  {[{num:1,label:'Request Details'},{num:2,label:'Payment Lines'},{num:3,label:'Summary'}].map(s => (
                    <div key={s.num} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0',
                      borderLeft: wizardStep===s.num ? '3px solid #8C354B' : '3px solid transparent',
                      paddingLeft:8, marginLeft:-11 }}>
                      <div style={{ width:20, height:20, borderRadius:'50%',
                        background: wizardStep===s.num ? '#8C354B' : '#C1A1A9',
                        color:'#fff', fontSize:10, fontWeight:800,
                        display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{s.num}</div>
                      <span style={{ fontSize:10, fontWeight: wizardStep===s.num ? 800 : 500,
                        color: wizardStep===s.num ? '#8C354B' : '#94a3b8', lineHeight:1.2 }}>{s.label}</span>
                    </div>
                  ))}
                </div>
                <div style={{ flex:1 }} />
              </div>

              {/* ── RIGHT COLUMN ── */}
              <div style={{ flex:1, position:'relative', overflow:'hidden' }}>

                {/* L3 — maroon corner, decorative only */}
                <div style={{ position:'absolute', top:0, right:0, width:'55%', height:200, background:'#8C354B', borderRadius:'0 8px 0 0', zIndex:1 }} />

                {/* L4 — white card */}
                <div style={{ position:'absolute', top:48, left:12, right:12, bottom:12, background:'#fff', borderRadius:12, boxShadow:'0 4px 24px rgba(0,0,0,0.15)', display:'flex', flexDirection:'column', overflow:'hidden', zIndex:2 }}>

                  {/* MR Info Strip */}
                  <div style={{ padding:'7px 16px', borderBottom:'1px solid #f1f5f9', background:'#fafafa', flexShrink:0, display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
                    <span style={{ fontSize:12, fontWeight:800, color:'#8C354B', fontFamily:'monospace' }}>{selMR.request_number}</span>
                    <span style={{ fontSize:10, color:'#94a3b8' }}>{selMR.request_date}</span>
                    <span style={{ fontSize:10, fontWeight:700, color:'#475569', background:'#f1f5f9', borderRadius:5, padding:'1px 7px' }}>{selMR.department_name||'—'}</span>
                    <span style={{ fontSize:11, color:'#475569', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{selMR.purpose||'—'}</span>
                    <span style={{ fontSize:12, fontWeight:800, color:'#8C354B', whiteSpace:'nowrap' }}>SAR {fmt(lineTotal)}</span>
                    <span style={{ fontSize:10, color:'#64748b' }}>{mrLines.length} wire{mrLines.length!==1?'s':''}</span>
                  </div>

                  {/* Scrollable step content */}
                  <div style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>

                    {/* ── STEP 1: Request Details ── */}
                    {wizardStep === 1 && (
                      <div>
                        <div style={{ fontSize:9, fontWeight:800, color:'#8C354B', letterSpacing:0.8, textTransform:'uppercase', marginBottom:8 }}>
                          🏦 Payment Details
                        </div>

                        {/* Wire FROM + Date + Ref + Notes — all in one row */}
                        <div style={{ display:'grid', gridTemplateColumns:'auto 130px 180px 1fr', gap:10, marginBottom:8, alignItems:'end' }}>
                          <div>
                            <label style={{ ...S.label, fontSize:9 }}>Wire FROM *</label>
                            <div style={{ display:'flex', gap:6 }}>
                              {FROM_ACCOUNTS.map(acc => (
                                <button key={acc} onClick={() => setFromAccount(acc)}
                                  style={{ padding:'5px 12px', border:`2px solid ${fromAccount===acc ? '#8C354B' : '#e2e8f0'}`,
                                    borderRadius:6, cursor:'pointer', fontSize:11, fontWeight:800,
                                    background: fromAccount===acc ? '#8C354B' : '#fff',
                                    color: fromAccount===acc ? '#fff' : '#374151', whiteSpace:'nowrap' }}>
                                  {acc}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <label style={{ ...S.label, fontSize:9 }}>Transfer Date *</label>
                            <input type="date" style={{ ...S.inp, padding:'5px 8px', fontSize:11 }} value={payDate} onChange={e => setPayDate(e.target.value)} />
                          </div>
                          <div>
                            <label style={{ ...S.label, fontSize:9 }}>Ref # <span style={{ fontWeight:400, color:'#94a3b8' }}>(auto)</span></label>
                            <input style={{ ...S.inp, padding:'5px 8px', fontSize:11, fontFamily:'monospace', fontWeight:700, background:'#f8fafc', color:'#64748b' }}
                              value={reference} onChange={e => setReference(e.target.value)} />
                          </div>
                          <div>
                            <label style={{ ...S.label, fontSize:9 }}>Notes</label>
                            <input style={{ ...S.inp, padding:'5px 8px', fontSize:11 }} placeholder="Remarks…"
                              value={notes} onChange={e => setNotes(e.target.value)} />
                          </div>
                        </div>

                        {/* Contra notice */}
                        {mrLines.some(l => ['ANB-77','ANB-39'].includes(l.party_type)) && (
                          <div style={{ background:'#e0f2f1', border:'1px solid #80cbc4', borderRadius:6,
                            padding:'5px 10px', fontSize:10, color:'#00695c', marginBottom:8 }}>
                            <strong>⚡ Contra Entry:</strong> Funds move to ANB-77/ANB-39 first — DH distributes from there.
                          </div>
                        )}

                        {/* MR summary card */}
                        <div style={{ background:'#FAF0F2', border:'1px solid #C1A1A9', borderRadius:8, padding:'8px 12px' }}>
                          <div style={{ fontSize:8, fontWeight:800, color:'#8C354B', letterSpacing:0.8, textTransform:'uppercase', marginBottom:6 }}>Request Summary</div>
                          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
                            {[
                              { label:'Requested By', val: empMap[selMR.requested_by] || selMR.requested_by || '—' },
                              { label:'Purpose',      val: selMR.purpose || '—' },
                              { label:'Stage',        val: stageInfo(selMR.status).label },
                              { label:'Total Amount', val: `SAR ${fmt(selMR.amount||0)}` },
                            ].map(({ label, val }) => (
                              <div key={label}>
                                <div style={{ fontSize:8, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:0.5, marginBottom:1 }}>{label}</div>
                                <div style={{ fontSize:10, fontWeight:700, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{val}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── STEP 2: Payment Lines ── */}
                    {wizardStep === 2 && (
                      <div>
                        <div style={{ fontSize:9, fontWeight:800, color:'#8C354B', letterSpacing:0.8, textTransform:'uppercase', marginBottom:8 }}>
                          📋 Wiring Instructions &nbsp;<span style={{ fontWeight:400, color:'#94a3b8', textTransform:'none', letterSpacing:0 }}>— from {fromAccount} · tap ▼ for IBAN &amp; TRN</span>
                        </div>

                        {linesLoading ? (
                          <div style={{ textAlign:'center', padding:40, color:'#94a3b8' }}>Loading lines…</div>
                        ) : mrLines.length === 0 ? (
                          <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:12, padding:24, textAlign:'center' }}>
                            <div style={{ fontSize:22, marginBottom:8 }}>⚠️</div>
                            <div style={{ fontSize:14, fontWeight:700, color:'#b91c1c', marginBottom:6 }}>No wiring lines found for this MR</div>
                            <div style={{ fontSize:12, color:'#64748b', lineHeight:1.7 }}>
                              The line breakdown (beneficiaries + IBANs) was not saved when this MR was created.<br/>
                              <strong>Fix:</strong> Re-open this MR in Money Requests and re-submit so lines save correctly.
                            </div>
                          </div>
                        ) : (
                          <>
                            {/* Column header */}
                            <div style={{ display:'grid', gridTemplateColumns:'24px 1fr 90px 120px 92px',
                              gap:6, padding:'4px 12px', background:'#f1f5f9', borderRadius:7, marginBottom:6,
                              fontSize:9, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:0.5 }}>
                              <span/><span>Beneficiary</span>
                              <span style={{ textAlign:'right' }}>Amount</span>
                              <span style={{ color:'#1d4ed8' }}>Pay Method</span>
                              <span style={{ color:'#15803d' }}>Receipt</span>
                            </div>

                            {groups.map(({ type, lines, total: grpTotal }) => {
                              const p = pc(type)
                              const isInternal = ['ANB-77','ANB-39'].includes(type)
                              const isCash = type === 'Employee'
                              return (
                                <div key={type} style={{ marginBottom:10, border:`1px solid ${p.bg}`, borderRadius:9, overflow:'hidden' }}>
                                  <div style={{ background:p.bg, padding:'7px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                      <span style={{ fontSize:13 }}>{p.icon}</span>
                                      <span style={{ fontSize:11, fontWeight:800, color:p.color }}>{p.label}</span>
                                      <span style={{ background:'rgba(0,0,0,0.08)', borderRadius:20, padding:'1px 7px', fontSize:9, fontWeight:700, color:p.color }}>
                                        {lines.length} {lines.length===1?'wire':'wires'}
                                      </span>
                                      {isInternal && <span style={{ fontSize:9, color:p.color, opacity:0.8 }}>— Internal</span>}
                                      {isCash && <span style={{ fontSize:9, color:p.color, opacity:0.8 }}>— Cash/WPS</span>}
                                    </div>
                                    <div style={{ fontSize:12, fontWeight:800, color:p.color }}>SAR {fmt(grpTotal)}</div>
                                  </div>

                                  {lines.map((l, i) => {
                                    const ibanDisplay = l.iban || (isInternal ? type : '—')
                                    const globalIdx   = mrLines.indexOf(l)
                                    const isExpanded  = !!expandedLines[l.id]
                                    const lf          = lineFiles[l.id] || {}
                                    const hasFile     = !!lf.file
                                    const isOk        = lf.status?.startsWith('✅')
                                    const isWarn      = (lf.warns||[]).length > 0
                                    const lm          = linePayMethods[l.id] || 'BANK_TRANSFER'
                                    const trnLabel    = lm === 'CHEQUE' ? 'Cheque #' : lm === 'CASH' ? 'Voucher #' : 'TRN #'
                                    const hasTrn      = !!lineTrns[globalIdx]
                                    const methodOpts  = [
                                      { v:'BANK_TRANSFER', icon:'🏦', label:'Bank' },
                                      { v:'CHEQUE',        icon:'📄', label:'Chq'  },
                                      { v:'CASH',          icon:'💵', label:'Cash' },
                                    ]
                                    return (
                                      <div key={l.id || i} style={{ borderBottom: i < lines.length-1 ? '1px solid #f1f5f9' : 'none', background: i%2===0 ? '#fff' : '#fafffe' }}>
                                        <div style={{ display:'grid', gridTemplateColumns:'24px 1fr 90px 120px 92px', gap:6, padding:'6px 12px', alignItems:'center' }}>
                                          <button onClick={() => setExpandedLines(prev => ({ ...prev, [l.id]: !prev[l.id] }))}
                                            style={{ width:20, height:20, border:'1.5px solid #e2e8f0', borderRadius:4, background: isExpanded ? '#eff6ff' : '#f8fafc', cursor:'pointer', fontSize:8, color: isExpanded ? '#1d4ed8' : '#94a3b8', display:'flex', alignItems:'center', justifyContent:'center', padding:0, flexShrink:0 }}>
                                            {isExpanded ? '▲' : '▼'}
                                          </button>
                                          <div style={{ minWidth:0 }}>
                                            <div style={{ fontSize:11, fontWeight:700, color:'#1e293b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{l.supplier_name || '—'}</div>
                                            {isInternal && <span style={{ fontSize:7, color:'#6d28d9', fontWeight:800, background:'#f3e8ff', borderRadius:3, padding:'1px 4px' }}>⚡ Contra</span>}
                                          </div>
                                          <div style={{ fontSize:12, fontWeight:800, color:'#0f172a', textAlign:'right', whiteSpace:'nowrap' }}>SAR {fmt(parseFloat(l.amount)||0)}</div>
                                          <div style={{ display:'flex', gap:3 }}>
                                              {methodOpts.map(({ v, icon, label }) => (
                                                <button key={v} onClick={() => setLinePayMethods(prev => ({ ...prev, [l.id]: v }))}
                                                  style={{ flex:1, padding:'5px 2px', fontSize:9, fontWeight:800, cursor:'pointer', border:`1.5px solid ${lm===v?'#1d4ed8':'#e2e8f0'}`, borderRadius:5, background:lm===v?'#1e40af':'#f8fafc', color:lm===v?'#fff':'#64748b', lineHeight:1.3, whiteSpace:'nowrap' }}>
                                                  {icon} {label}
                                                </button>
                                              ))}
                                            </div>
                                          <div>
                                              <input type="file" accept=".pdf,.jpg,.jpeg,.png" id={`rcpt-${l.id}`} style={{ display:'none' }}
                                                onChange={async e => { const f=e.target.files?.[0]; if(!f) return; e.target.value=''; await scanLineReceipt(f,l.id,l,globalIdx) }} />
                                              <label htmlFor={`rcpt-${l.id}`}
                                                style={{ display:'inline-flex', alignItems:'center', gap:3, cursor:'pointer', padding:'4px 6px', borderRadius:5, fontSize:9, fontWeight:700, border:`1.5px solid ${isOk?'#86efac':hasFile?'#a5b4fc':'#d1fae5'}`, background:isOk?'#f0fdf4':hasFile?'#eef2ff':'#f0fdf4', color:isOk?'#15803d':hasFile?'#3730a3':'#15803d', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:88 }}>
                                                {hasFile?(isOk?'✅':'📎'):'📎'} {hasFile?(lf.file.name.length>8?lf.file.name.slice(0,8)+'…':lf.file.name):'Attach'}
                                              </label>
                                              {(lf.warns||[]).map((w,wi) => (
                                                <div key={wi} style={{ fontSize:8, marginTop:1, lineHeight:1.3, color:w.startsWith('ℹ️')?'#1d4ed8':'#b45309' }}>{w.slice(0,40)}{w.length>40?'…':''}</div>
                                              ))}
                                            </div>
                                        </div>
                                        {isExpanded && (
                                          <div style={{ padding:'8px 14px 10px 50px', background:'#f0f7ff', borderTop:'1px dashed #bfdbfe', display:'flex', gap:14, alignItems:'flex-end', flexWrap:'wrap' }}>
                                            <div style={{ flex:'1 1 200px' }}>
                                              <div style={{ fontSize:8, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:0.5, marginBottom:3 }}>{isInternal?'Account':isCash?'IBAN / WPS':'IBAN'}</div>
                                              <div style={{ fontFamily:'monospace', fontSize:11, color:'#1e40af', fontWeight:700, background:'#fff', borderRadius:5, padding:'4px 8px', border:'1px solid #bfdbfe', wordBreak:'break-all' }}>{ibanDisplay}</div>
                                            </div>
                                              <div style={{ flex:'1 1 140px' }}>
                                                <div style={{ fontSize:8, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:0.5, marginBottom:3, display:'flex', alignItems:'center', gap:4 }}>
                                                  {trnLabel} {hasTrn && <span style={{ color:'#15803d', fontSize:8 }}>✓</span>}
                                                </div>
                                                <input placeholder={`Enter ${trnLabel}…`} value={lineTrns[globalIdx]||''}
                                                  onChange={e => setLineTrns(prev => ({ ...prev, [globalIdx]: e.target.value }))}
                                                  style={{ width:'100%', padding:'5px 7px', border:`1.5px solid ${hasTrn?'#86efac':'#bfdbfe'}`, borderRadius:5, fontSize:11, fontFamily:'monospace', outline:'none', background:hasTrn?'#f0fdf4':'#fff', boxSizing:'border-box', color:'#1e40af', fontWeight:700 }} />
                                              </div>
                                            {lf.status && (
                                              <div style={{ fontSize:9, color:isOk?'#15803d':'#92400e', alignSelf:'center', paddingBottom:2 }}>{lf.status.slice(0,45)}{lf.status.length>45?'…':''}</div>
                                            )}
                                            {l.account_code && (
                                              <div style={{ flex:'0 0 auto' }}>
                                                <div style={{ fontSize:8, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:0.5, marginBottom:3 }}>Category</div>
                                                <div style={{ fontSize:11, color:'#475569', background:'#fff', borderRadius:6, padding:'4px 10px', border:'1px solid #e2e8f0', fontWeight:600 }}>{(l.account_code||'').replace(/_/g,' ')}</div>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )
                            })}

                            {/* Grand Total */}
                            <div style={{ background:'linear-gradient(135deg,#8C354B,#5c2232)', borderRadius:9, padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4 }}>
                              <div style={{ color:'rgba(255,255,255,0.75)', fontSize:11, fontWeight:700 }}>
                                Grand Total · {mrLines.length} wire{mrLines.length!==1?'s':''} from <span style={{ color:'#fbbf24', fontWeight:800 }}>{fromAccount}</span>
                              </div>
                              <div style={{ fontSize:17, fontWeight:800, color:'#fff' }}>SAR {fmt(lineTotal)}</div>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* ── STEP 3: Payment Summary ── */}
                    {wizardStep === 3 && (
                      <div>
                        <div style={{ fontSize:9, fontWeight:800, color:'#8C354B', letterSpacing:0.8, textTransform:'uppercase', marginBottom:10 }}>
                          ✅ Review before posting
                        </div>

                        {/* Summary cards row */}
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:10 }}>
                          {[
                            { label:'Total Amount',  val:`SAR ${fmt(lineTotal)}`, color:'#8C354B' },
                            { label:'From Account',  val: fromAccount,            color:'#1e293b' },
                            { label:'Transfer Date', val: payDate,                color:'#1e293b' },
                            { label:'Ref #',         val: reference||'—',         color:'#1e293b' },
                          ].map(({ label, val, color }) => (
                            <div key={label} style={{ background:'#FAF0F2', border:'1px solid #C1A1A9', borderRadius:8, padding:'8px 12px' }}>
                              <div style={{ fontSize:8, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:0.5, marginBottom:3 }}>{label}</div>
                              <div style={{ fontSize:12, fontWeight:800, color, fontFamily: label==='Ref #'?'monospace':'inherit', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{val}</div>
                            </div>
                          ))}
                        </div>

                        {/* Notes (only if filled) */}
                        {notes && (
                          <div style={{ background:'#f8fafc', borderRadius:7, padding:'7px 12px', marginBottom:10, fontSize:11, color:'#475569' }}>
                            <span style={{ fontSize:9, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:0.5, marginRight:8 }}>Notes</span>{notes}
                          </div>
                        )}

                        {/* Lines summary table */}
                        <div style={{ border:'1px solid #e2e8f0', borderRadius:9, overflow:'hidden', marginBottom:10 }}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 110px 95px 80px', gap:6, padding:'6px 12px', background:'#8C354B', fontSize:8, fontWeight:800, color:'#fff', textTransform:'uppercase', letterSpacing:0.5 }}>
                            <span>Beneficiary</span><span>IBAN</span><span style={{ textAlign:'right' }}>Amount</span><span>TRN #</span>
                          </div>
                          {mrLines.map((l, i) => {
                            const globalIdx = i
                            const lm = linePayMethods[l.id] || 'BANK_TRANSFER'
                            return (
                              <div key={l.id||i} style={{ display:'grid', gridTemplateColumns:'1fr 110px 95px 80px', gap:6, padding:'5px 12px', background:i%2===0?'#fff':'#fafafa', borderBottom:i<mrLines.length-1?'1px solid #f1f5f9':'none', alignItems:'center' }}>
                                <div>
                                  <div style={{ fontSize:11, fontWeight:700, color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.supplier_name||'—'}</div>
                                  <div style={{ fontSize:8, color:'#94a3b8' }}>{pc(l.party_type||'Others').label} · {lm.replace(/_/g,' ')}</div>
                                </div>
                                <div style={{ fontFamily:'monospace', fontSize:8, color:'#1e40af', wordBreak:'break-all' }}>{(l.iban||'—').slice(0,16)}{(l.iban||'').length>16?'…':''}</div>
                                <div style={{ fontSize:11, fontWeight:800, color:'#1e293b', textAlign:'right' }}>SAR {fmt(parseFloat(l.amount)||0)}</div>
                                <div style={{ fontFamily:'monospace', fontSize:8, color: lineTrns[globalIdx] ? '#15803d' : '#94a3b8', fontWeight: lineTrns[globalIdx] ? 700 : 400 }}>
                                  {lineTrns[globalIdx] ? lineTrns[globalIdx].slice(0,11)+'…' : '—'}
                                </div>
                              </div>
                            )
                          })}
                          {/* Total row */}
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 110px 95px 80px', gap:6, padding:'7px 12px', background:'#FAF0F2', borderTop:'2px solid #C1A1A9' }}>
                            <div style={{ fontSize:11, fontWeight:800, color:'#8C354B' }}>GRAND TOTAL</div>
                            <div/><div style={{ fontSize:13, fontWeight:800, color:'#8C354B', textAlign:'right' }}>SAR {fmt(lineTotal)}</div><div/>
                          </div>
                        </div>

                        {/* Contra notice */}
                        {mrLines.some(l => ['ANB-77','ANB-39'].includes(l.party_type)) && (
                          <div style={{ background:'#e0f2f1', border:'1px solid #80cbc4', borderRadius:7, padding:'6px 12px', fontSize:11, color:'#00695c' }}>
                            <strong>⚡ Contra Entry:</strong> Funds move to ANB-77/ANB-39 — DH distributes to beneficiaries from there.
                          </div>
                        )}
                      </div>
                    )}

                  </div>

                  {/* ── Send Back Panel ── */}
                  {showSendBack && (
                    <div style={{ padding:'10px 16px', borderTop:'1px solid #fecaca', background:'#fff7f7', flexShrink:0 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'#991b1b', marginBottom:5 }}>↩ Send Back to DH — Enter reason</div>
                      <textarea value={sendBackReason} onChange={e => setSendBackReason(e.target.value)}
                        placeholder="e.g. IBAN for Employee A is missing…"
                        rows={2}
                        style={{ width:'100%', padding:'6px 9px', borderRadius:7, border:'1px solid #fca5a5', fontSize:11, resize:'vertical', outline:'none', boxSizing:'border-box', fontFamily:'inherit', color:'#1e293b' }} />
                      <div style={{ display:'flex', gap:8, marginTop:6, justifyContent:'flex-end' }}>
                        <button onClick={() => { setShowSendBack(false); setSendBackReason('') }}
                          style={{ ...S.btn('#f1f5f9','#475569'), padding:'5px 12px', fontSize:11 }}>Cancel</button>
                        <button onClick={sendBackToDH} disabled={sendingBack || !sendBackReason.trim()}
                          style={{ ...S.btn(sendingBack || !sendBackReason.trim() ? '#94a3b8' : 'linear-gradient(135deg,#b91c1c,#991b1b)'), opacity: sendingBack || !sendBackReason.trim() ? 0.7 : 1, padding:'5px 14px', fontSize:11 }}>
                          {sendingBack ? '⏳ Sending…' : '↩ Confirm Send Back'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Footer ── */}
                  <div style={{ padding:'10px 16px', borderTop:'1px solid #e2e8f0', background:'#f8fafc', display:'flex', gap:8, justifyContent:'space-between', alignItems:'center', flexShrink:0, flexWrap:'wrap' }}>
                    {/* Left: utility actions */}
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={() => printInstruction(selMR, mrLines, fromAccount, empMap)}
                        style={{ ...S.btn('#fff','#1e293b'), border:'1px solid #e2e8f0', padding:'6px 12px', fontSize:11 }}>
                        🖨️ Print
                      </button>
                      <button onClick={() => { setShowSendBack(s => !s); setSendBackReason('') }}
                        style={{ ...S.btn(showSendBack ? '#fef2f2' : '#fff7f0', showSendBack ? '#991b1b' : '#c2410c'), border:'1px solid ' + (showSendBack ? '#fca5a5' : '#fed7aa'), padding:'6px 12px', fontSize:11 }}>
                        ↩ Send Back
                      </button>
                    </div>
                    {/* Right: navigation + save */}
                    <div style={{ display:'flex', gap:6 }}>
                      <button
                        onClick={wizardStep===1 ? () => { setShowSheet(false); setShowSendBack(false); setSendBackReason('') } : () => setWizardStep(s => s-1)}
                        style={{ ...S.btn('#e2e8f0','#475569'), padding:'6px 16px', fontSize:11, fontWeight:700 }}>
                        {wizardStep===1 ? 'Cancel' : '← Back'}
                      </button>
                      {wizardStep < 3 && (
                        <button onClick={() => setWizardStep(s => s+1)}
                          style={{ ...S.btn('#8C354B'), padding:'6px 20px', fontSize:11, fontWeight:700 }}>
                          Next →
                        </button>
                      )}
                      {wizardStep === 3 && (() => {
                        const ready = !saving && mrLines.length > 0 && reference.trim().length > 0
                        return (
                          <button onClick={markPaid} disabled={!ready}
                            style={{ ...S.btn(ready ? 'linear-gradient(135deg,#15803d,#166534)' : '#94a3b8'), opacity: ready ? 1 : 0.7, padding:'6px 20px', fontSize:11, fontWeight:700 }}>
                            {saving ? '⏳ Saving…' : `✅ Mark as Paid — SAR ${fmt(lineTotal)}`}
                          </button>
                        )
                      })()}
                    </div>
                  </div>

                </div>
                {/* end L4 */}
              </div>
              {/* end right column */}
            </div>
            {/* end L2 */}
          </div>
          {/* end L1 */}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          BATCH ANB-39 PAY MODAL — one transfer, multiple MRs, shared TRN
      ══════════════════════════════════════════════════════════════════════ */}
      {showBatch && (
        <div style={S.overlay} onClick={e => { if (e.target===e.currentTarget) setShowBatch(false) }}>
          <div style={{ ...S.modal, maxWidth:620, maxHeight:'85vh' }}>

            {/* Header */}
            <div style={{ background:'linear-gradient(135deg,#1e3a5f,#1e40af)', borderRadius:'18px 18px 0 0', padding:'20px 26px', color:'#fff', flexShrink:0 }}>
              <div style={{ fontSize:11, opacity:0.7, letterSpacing:1.5, textTransform:'uppercase', marginBottom:4 }}>Batch Payment — Shared Transfer</div>
              <div style={{ fontSize:18, fontWeight:800 }}>ANB-39 Multi-MR Close</div>
              <div style={{ fontSize:12, opacity:0.8, marginTop:6 }}>
                One bank transfer covers all selected MRs — enter the single TRN below.
              </div>
              <div style={{ marginTop:12, background:'rgba(255,255,255,0.12)', borderRadius:10, padding:'10px 16px', display:'inline-block' }}>
                <div style={{ fontSize:10, opacity:0.7, textTransform:'uppercase', letterSpacing:1 }}>Combined Total</div>
                <div style={{ fontSize:20, fontWeight:800 }}>
                  SAR {fmt(pendingMRs.filter(m=>batchSelected.has(m.id)).reduce((s,m)=>s+(m.amount||0),0))}
                </div>
                <div style={{ fontSize:11, opacity:0.7, marginTop:2 }}>{batchSelected.size} MR{batchSelected.size>1?'s':''}</div>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding:'22px 26px', flex:1, overflowY:'auto' }}>

              {/* Selected MRs summary */}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:800, color:'#475569', textTransform:'uppercase', letterSpacing:0.5, marginBottom:8 }}>Selected MRs</div>
                {pendingMRs.filter(m=>batchSelected.has(m.id)).map(m => (
                  <div key={m.id} style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', background:'#f8fafc', borderRadius:7, marginBottom:5, fontSize:13 }}>
                    <span style={{ fontWeight:700, color:'#1e40af', fontFamily:'monospace' }}>{m.request_number}</span>
                    <span style={{ color:'#64748b' }}>{m.department_name}</span>
                    <span style={{ fontWeight:700, color:'#1e293b' }}>SAR {fmt(m.amount||0)}</span>
                  </div>
                ))}
              </div>

              {/* Wire FROM */}
              <div style={{ marginBottom:14 }}>
                <label style={S.label}>Wire FROM *</label>
                <div style={{ display:'flex', gap:8 }}>
                  {FROM_ACCOUNTS.map(acc => (
                    <button key={acc} onClick={() => setBatchFrom(acc)}
                      style={{ flex:1, padding:'9px 0', border:`2px solid ${batchFrom===acc?'#b45309':'#e2e8f0'}`,
                        borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:800,
                        background: batchFrom===acc ? '#92400e' : '#fff',
                        color: batchFrom===acc ? '#fff' : '#374151' }}>
                      {acc}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
                <div>
                  <label style={S.label}>Transfer Date *</label>
                  <input type="date" value={batchDate} onChange={e => setBatchDate(e.target.value)} style={S.inp} />
                </div>
                <div>
                  <label style={S.label}>Bank TRN / Ref # * (shared across all MRs)</label>
                  <input placeholder="e.g. TBC2609260062119" value={batchRef}
                    onChange={e => setBatchRef(e.target.value)}
                    style={{ ...S.inp, fontFamily:'monospace', fontWeight:700,
                      border: batchRef ? '2px solid #a5d6a7' : '2px solid #bfdbfe',
                      background: batchRef ? '#f0fdf4' : '#fff' }} />
                </div>
              </div>

              {/* PDF receipt scan for batch */}
              <div style={{ background:'#fffbeb', border:'1.5px dashed #f59e0b', borderRadius:10, padding:'12px 14px', marginBottom:14 }}>
                <label style={{ ...S.label, color:'#92400e' }}>📎 Attach Transfer Receipt (PDF) — Auto-extracts TRN</label>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <input type="file" accept=".pdf"
                    style={{ ...S.inp, padding:'6px 8px', cursor:'pointer', flex:1 }}
                    onChange={async e => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      setBatchFile(f)
                      setBatchWarnings([])
                      await scanReceiptFile(f, setBatchOcrStatus,
                        trn  => setBatchRef(trn),
                        date => setBatchDate(date),
                        parsed => {
                          const warns = []
                          const totalSel = [...batchSelected].reduce((s, id) => {
                            const mr = pendingMRs.find(m => m.id === id)
                            return s + (parseFloat(mr?.amount)||0)
                          }, 0)
                          if (parsed.amount) {
                            const pAmt = parseFloat(parsed.amount)
                            if (Math.abs(pAmt - totalSel) > 0.01)
                              warns.push(`⚠️ Amount mismatch: receipt shows SAR ${parsed.amount}, combined MR total is SAR ${totalSel.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`)
                          }
                          setBatchWarnings(warns)
                        }
                      )
                    }} />
                  {batchFile && <span style={{ fontSize:11, color:'#15803d', whiteSpace:'nowrap' }}>✓ {batchFile.name}</span>}
                </div>
                {batchOcrStatus && (
                  <div style={{ marginTop:6, fontSize:12, padding:'6px 10px', borderRadius:7,
                    background: batchOcrStatus.startsWith('✅') ? '#f0fdf4' : '#fff7ed',
                    color: batchOcrStatus.startsWith('✅') ? '#166534' : '#92400e' }}>
                    {batchOcrStatus}
                  </div>
                )}
                {batchWarnings.length > 0 && (
                  <div style={{ marginTop:6, padding:'8px 10px', borderRadius:7, background:'#fffbeb',
                    border:'1.5px solid #f59e0b' }}>
                    {batchWarnings.map((w, i) => (
                      <div key={i} style={{ fontSize:12, color:'#92400e',
                        marginBottom: i < batchWarnings.length-1 ? 4 : 0 }}>{w}</div>
                    ))}
                    <div style={{ fontSize:10, color:'#b45309', marginTop:4, borderTop:'1px solid #fde68a', paddingTop:4 }}>
                      Warning only — you can still proceed. Verify before confirming.
                    </div>
                  </div>
                )}
                <p style={{ fontSize:10, color:'#aab2bd', margin:'4px 0 0' }}>
                  ANB-18 digital PDFs: TRN extracted instantly. Receipt saved to Drive with batch TRN prefix.
                </p>
              </div>

              <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#075985' }}>
                <strong>What happens:</strong> All {batchSelected.size} selected MRs will be marked <strong>FUNDS_SENT</strong> with
                the same TRN and transfer date. Each MR stays independently tracked — one shared receipt covers them all.
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding:'14px 26px', borderTop:'1px solid #e2e8f0', background:'#f8fafc', borderRadius:'0 0 18px 18px', display:'flex', gap:10, justifyContent:'flex-end', flexShrink:0 }}>
              <button onClick={() => setShowBatch(false)} style={{ ...S.btn('#f1f5f9','#475569') }}>Cancel</button>
              <button onClick={markBatchPaid} disabled={batchSaving || !batchRef.trim()}
                style={{ ...S.btn(!batchSaving && batchRef.trim() ? 'linear-gradient(135deg,#1e40af,#1d4ed8)' : '#94a3b8'),
                  opacity: !batchSaving && batchRef.trim() ? 1 : 0.7, padding:'9px 24px' }}>
                {batchSaving ? '⏳ Processing…' : `✅ Mark ${batchSelected.size} MR${batchSelected.size>1?'s':''} as Paid`}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
