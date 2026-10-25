/**
 * FormFieldPayment.jsx — Field Payment Distribution Form v4
 * Flow: Session → Card → Pool → Lines (receipt-first, OCR auto-resolve)
 * Mobile-first design: max 480px, 48px touch targets, app-like cards
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPA_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
const sb = createClient(SUPA_URL, SUPA_ANON)

// ─── Constants ────────────────────────────────────────────────────────────────
const ALL_DEPTS = [
  { code:'TISU', label:'Tech Infrastructure & Services' },
  { code:'NISU', label:'Network Infrastructure Services' },
  { code:'CISU', label:'Civil Infrastructure Services' },
  { code:'ITSU', label:'IT Services' },
]

const DEPT_CARDS = {
  TISU:[
    { value:'ANB77_C1', label:'ANB-77 · Card 1', bank:'ANB-77' },
    { value:'ANB77_C2', label:'ANB-77 · Card 2', bank:'ANB-77' },
    { value:'ANB77_C3', label:'ANB-77 · Card 3', bank:'ANB-77' },
  ],
  NISU:[
    { value:'ANB39_C1', label:'ANB-39 · Card 1 (Transfers)', bank:'ANB-39' },
    { value:'ANB39_C2', label:'ANB-39 · Card 2 (POS)',       bank:'ANB-39' },
  ],
  CISU:[
    { value:'ANB39_C1', label:'ANB-39 · Card 1 (Transfers)', bank:'ANB-39' },
    { value:'ANB39_C2', label:'ANB-39 · Card 2 (POS)',       bank:'ANB-39' },
  ],
  ITSU:[
    { value:'ANB39_C1', label:'ANB-39 · Card 1 (Transfers)', bank:'ANB-39' },
    { value:'ANB39_C2', label:'ANB-39 · Card 2 (POS)',       bank:'ANB-39' },
  ],
}

const BANK_DEPTS = { 'ANB-77':['TISU'], 'ANB-39':['NISU','CISU','ITSU'] }

const DEPT_THEME = {
  TISU:{ color:'#16a34a', light:'#dcfce7', dark:'#14532d', grad:'linear-gradient(135deg,#14532d,#16a34a)' },
  NISU:{ color:'#2563eb', light:'#dbeafe', dark:'#1e3a8a', grad:'linear-gradient(135deg,#1e3a8a,#2563eb)' },
  CISU:{ color:'#dc2626', light:'#fee2e2', dark:'#7f1d1d', grad:'linear-gradient(135deg,#7f1d1d,#dc2626)' },
  ITSU:{ color:'#7c3aed', light:'#ede9fe', dark:'#4c1d95', grad:'linear-gradient(135deg,#4c1d95,#7c3aed)' },
}
const dTheme = (dept) => DEPT_THEME[dept] || { color:'#1a6b3a', light:'#e8f5e9', dark:'#0d3d20' }

// POS/Cash expense categories
const CUSTODIAN_PURPOSES = [
  { value:'CUST_PETROL',        label:'⛽  Petrol / Fuel' },
  { value:'CUST_FOOD',          label:'🍽️  Food / Meals' },
  { value:'CUST_CASH',          label:'💵  Cash Withdrawal (Float)' },
  { value:'CUST_ACCOMMODATION', label:'🏨  Accommodation' },
  { value:'CUST_TRANSPORT',     label:'🚕  Transport / Taxi' },
  { value:'CUST_MAINTENANCE',   label:'🔧  Vehicle Maintenance' },
  { value:'CUST_MISC',          label:'📦  Miscellaneous' },
]

// Manual party types shown only when IBAN not found in DB
const MANUAL_PARTY_TYPES = [
  { value:'EMPLOYEE',       label:'👤  Employee' },
  { value:'CONTRACTOR',     label:'🏗️  Contractor / Subcon' },
  { value:'LOCAL_SUPPLIER', label:'🏪  Local Supplier' },
  { value:'SUPPLIER',       label:'🏢  Supplier' },
  { value:'ONE_TIME',       label:'📝  One-Time Payment' },
  { value:'OTHERS',         label:'🔖  Others' },
]

const fmt = n => new Intl.NumberFormat('en-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0)
const today = () => new Date().toISOString().slice(0,10)

// ─── Empty line factory ───────────────────────────────────────────────────────
const emptyLine = (deptCode='') => ({
  _id: Math.random().toString(36).slice(2,10),
  dept_code: deptCode,
  // LINE TYPE: TRANSFER | POS | CASH_WITHDRAWAL
  line_type: 'TRANSFER',
  // receipt + OCR
  receipt_name: '',
  receipt_data: null,         // base64 for preview only
  _ocr_step:    'idle',       // idle | scanning | done
  _ocr_status:  '',
  _ocr_parsed:  null,
  // party resolution (TRANSFER only)
  _resolve:     'idle',       // idle | resolving | employee | contractor | not_found
  accountable_party_type: '',
  accountable_party_id:   '',
  accountable_party_name: '',
  accountable_party_iban: '',
  one_time_purpose: '',
  // custodian (POS / Cash)
  custodian_id:      '',
  custodian_name:    '',
  custodian_purpose: '',
  // proxy
  use_proxy:          false,
  transfer_agent_id:  '',
  transfer_agent_name:'',
  // financials (all auto-filled from OCR when available)
  amount:           '',
  bank_fee:         '',
  bank_fee_enabled: false,
  reference_no:     '',
  notes:            '',
  // manual mode (skip receipt scan)
  _manual:          false,
})

// ─── Tesseract (lazy) ─────────────────────────────────────────────────────────
let _tesseractPromise = null
function loadTesseract() {
  if (_tesseractPromise) return _tesseractPromise
  _tesseractPromise = new Promise((resolve, reject) => {
    if (window.Tesseract) return resolve(window.Tesseract)
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.2/tesseract.min.js'
    s.onload  = () => resolve(window.Tesseract)
    s.onerror = () => { _tesseractPromise=null; reject(new Error('Tesseract load failed')) }
    document.head.appendChild(s)
  })
  return _tesseractPromise
}

// ─── Image pre-processor: grayscale + aggressive contrast + binarize ─────────
async function preprocessImageForOCR(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      // Scale to at least 2000px wide — Tesseract accuracy improves greatly above 1800px
      const scale = Math.max(1, Math.min(3, 2200 / img.width))
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      // Apply CSS filter for sharpness before pixel work
      ctx.filter = 'contrast(1.4) brightness(1.1)'
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      ctx.filter = 'none'

      // Grayscale + hard contrast stretch + binarize (threshold 160)
      const id = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const d  = id.data
      for (let i = 0; i < d.length; i += 4) {
        // Luminance-weighted grayscale
        let g = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]
        // Binarize: thermal receipts are high-contrast black-on-white
        // Anything above 160 → white (220), below → black (20)
        // This separates text from grey receipt background cleanly
        g = g > 160 ? 220 : 20
        d[i] = d[i+1] = d[i+2] = g
      }
      ctx.putImageData(id, 0, 0)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

// ─── ANB receipt parser (robust — handles ATM slips where values are on next line) ──
function parseAnbReceipt(rawText) {
  // Keep both line-by-line (for multi-line label:value) and flat (for inline)
  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const flat  = lines.join(' ')
  const r     = {}

  // ── IBAN: SA + 22 digits is the canonical pattern ─────────────────────────
  // ANB ATM: "To Acct No:  SA56450000000007043141"
  const directIban = flat.match(/\b(SA\d{22})\b/i)
  if (directIban) {
    r.iban = directIban[1].toUpperCase()
  } else {
    // Fallback: label then value on same or next line
    for (let i = 0; i < lines.length; i++) {
      if (/To\s+Acct|To\s+Account/i.test(lines[i])) {
        const sameM = lines[i].match(/([A-Z]{2}\d{20,24})/i)
        if (sameM) { r.iban = sameM[1].toUpperCase().replace(/O/g,'0').replace(/[Il]/g,'1'); break }
        if (i + 1 < lines.length) {
          const next = lines[i+1].replace(/\s/g,'')
          if (/^[A-Z]{2}\d{20,24}$/i.test(next)) { r.iban = next.toUpperCase().replace(/O/g,'0').replace(/[Il]/g,'1'); break }
        }
      }
    }
    // Final flat fallback with OCR error correction
    if (!r.iban) {
      const labelM = flat.match(/To\s+Acct(?:ount)?\s*No[:\s#]*([A-Z0-9\s]{20,30})/i)
      if (labelM) r.iban = labelM[1].replace(/\s/g,'').toUpperCase().replace(/O/g,'0').replace(/[Il]/g,'1')
    }
  }

  // ── OCR digit-error correction for numeric strings ────────────────────────
  // Thermal receipts cause Tesseract to confuse: O→0, o→0, I/l→1, S→5, B→8, Z→2
  function fixNum(s) {
    return s.replace(/[Oo]/g,'0').replace(/[Il]/g,'1').replace(/B/g,'8').replace(/Z/g,'2')
           .replace(/,/g,'')
  }

  // ── Amount ────────────────────────────────────────────────────────────────
  // Allow O/o as OCR misread of 0 in numeric fields
  const amtM = flat.match(/Amount\s*:?\s*SAR\s*([\dOo,]+\.[\dOo]*)/i)
            || flat.match(/(?:Transfer|Debit|Credit)\s+Amount\s*:?\s*(?:SAR\s*)?([\dOo,]+\.[\dOo]{2})/i)
  if (amtM) {
    r.amount = fixNum(amtM[1])
  } else {
    // Fallback: find ALL SAR values (including O/o as 0), pick the LARGEST
    // This handles cases where "Amount:" label is garbled but the SAR values survive
    const sarMatches = [...flat.matchAll(/\bSAR\s+([\dOo,]+\.[\dOo]{2})\b/gi)]
    if (sarMatches.length > 0) {
      const amounts = sarMatches.map(m => ({ raw: m[1], val: parseFloat(fixNum(m[1])) }))
      const largest = amounts.reduce((a,b) => b.val > a.val ? b : a)
      r.amount = fixNum(largest.raw)
    }
  }

  // ── Fee + Vat: "Fee + Vat: SAR 0.58" — always a small amount ────────────
  const feeM = flat.match(/Fee\s*[+&]\s*(?:Vat|Tax)[:\s]*(?:SAR\s*)?([\dOo,]+\.[\dOo]*)/i)
            || flat.match(/Bank\s+Fee[:\s]*(?:SAR\s*)?([\dOo,]+\.[\dOo]*)/i)
            || flat.match(/Charges?[:\s]*(?:SAR\s*)?([\dOo,]+\.[\dOo]*)/i)
  if (feeM) {
    const feeVal = parseFloat(fixNum(feeM[1]))
    // Sanity: fees are typically < SAR 50; don't accidentally grab the main amount
    if (feeVal > 0 && feeVal < 50) {
      r.bank_fee = String(feeVal)
      r.bank_fee_enabled = true
    }
  }

  // ── Date: DD/MM/YYYY (ANB ATM format) ────────────────────────────────────
  const dtM = flat.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/)
           || flat.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/)
  if (dtM) r.receipt_date = `${dtM[3]}-${dtM[2].padStart(2,'0')}-${dtM[1].padStart(2,'0')}`

  // ── Reference No: may be on SAME LINE or NEXT LINE after the label ────────
  for (let i = 0; i < lines.length; i++) {
    if (/Reference\s*No/i.test(lines[i])) {
      // Same-line value (online receipts)
      const sameM = lines[i].match(/Reference\s*No[:\s]+([A-Z0-9]{10,})/i)
      if (sameM) { r.reference_no = sameM[1].trim(); break }
      // Next line (ANB ATM slip style)
      if (i + 1 < lines.length) {
        const next = lines[i + 1].replace(/\s/g, '')
        if (/^[A-Z0-9]{10,}$/i.test(next)) { r.reference_no = next.toUpperCase(); break }
      }
    }
  }
  // Flat fallback for reference
  if (!r.reference_no) {
    const refFlat = flat.match(/Reference\s*No[:\s]+([A-Z0-9]{15,70})/i)
    if (refFlat) r.reference_no = refFlat[1].trim().toUpperCase()
  }
  // Last resort: long alphanumeric string that looks like a transaction ID
  if (!r.reference_no) {
    const txIdM = flat.match(/\b(\d{8}[A-Z]{3,}[A-Z0-9]{15,})\b/)
    if (txIdM) r.reference_no = txIdM[1]
  }

  // ── Acct Name (beneficiary / sender) — same-line OR next-line ────────────
  for (let i = 0; i < lines.length; i++) {
    if (/Acct\s*Name|Full\s*Name|Beneficiary\s*Name/i.test(lines[i])) {
      // Same-line
      const sameM = lines[i].match(/(?:Acct\s*Name|Full\s*Name|Beneficiary\s*Name)[:\s]+(.+)/i)
      if (sameM && sameM[1].trim().length > 2) { r.acct_name = sameM[1].trim(); break }
      // Next line
      if (i + 1 < lines.length && lines[i+1].length > 2 && !/^[\d:\/\\]+$/.test(lines[i+1])) {
        r.acct_name = lines[i+1].trim(); break
      }
    }
  }

  // ── ANB VAT ID ─────────────────────────────────────────────────────────────
  const vatM = flat.match(/ANB\s+VAT\s+ID(?:\s+Number)?[:\s]*(\d{15})/i)
            || flat.match(/VAT\s+(?:ID|Number|No)[:\s]*(\d{15})/i)
  if (vatM) r.vat_id = vatM[1]

  return r
}

// ─── FIFO calculator ──────────────────────────────────────────────────────────
function calcFifo(pools, lines) {
  const poolCopy = {}
  for (const [dept,pool] of Object.entries(pools))
    poolCopy[dept] = (pool.mrs||[]).map(m=>({...m}))

  const rawAllocs = []; let overTotal = 0
  for (const line of lines) {
    const amt   = parseFloat(line.amount)||0; if(amt<=0) continue
    const stack = poolCopy[line.dept_code]||[]; let left = amt
    for (const mr of stack) {
      if(left<=0) break
      const take = Math.min(left, mr.remaining)
      if(take>0) { rawAllocs.push({mr_id:mr.id,request_number:mr.request_number,dept_code:line.dept_code,allocated_amount:take,is_over:false}); mr.remaining-=take; left-=take }
    }
    if(left>0) { overTotal+=left; rawAllocs.push({mr_id:null,request_number:'OVER',dept_code:line.dept_code,allocated_amount:left,is_over:true}) }
  }
  const map={}
  for(const a of rawAllocs){ const k=`${a.mr_id}|${a.dept_code}`; if(!map[k]) map[k]={...a,allocated_amount:0}; map[k].allocated_amount+=a.allocated_amount }
  return { allocations:Object.values(map), overTotal }
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function FormFieldPayment() {
  const [sessionDate,   setSessionDate]   = useState(today())
  const [sessionDept,   setSessionDept]   = useState('')
  const [card,          setCard]          = useState('')
  const [custodianName, setCustodianName] = useState('')
  const [sessionNotes,  setSessionNotes]  = useState('')

  const [deptMap,     setDeptMap]     = useState({}) // dept_code → dept_id
  const [employees,   setEmployees]   = useState([])
  const [contractors, setContractors] = useState([])
  const [pools,       setPools]       = useState({})
  const [poolLoading, setPoolLoading] = useState(false)
  const [lines,       setLines]       = useState([])
  const [submitting,  setSubmitting]  = useState(false)
  const [submitted,   setSubmitted]   = useState(false)
  const [error,       setError]       = useState('')

  // ── Pending receipt reminders ─────────────────────────────────────────────
  const [pendingReceipts,      setPendingReceipts]      = useState([])
  const [pendingReceiptsOpen,  setPendingReceiptsOpen]  = useState(false)
  const [markingReceiptId,     setMarkingReceiptId]     = useState(null)

  const selectedCard = (DEPT_CARDS[sessionDept]||[]).find(c=>c.value===card)
  const cardBank     = selectedCard?.bank||''
  const cardDepts    = cardBank?(BANK_DEPTS[cardBank]||[]):[]
  const theme        = dTheme(sessionDept)

  // Load people + dept map once — use correct DB column names
  useEffect(()=>{
    sb.from('departments').select('id,dept_code').eq('is_active',true)
      .then(({data})=>{
        const map={}
        ;(data||[]).forEach(d=>{ if(d.dept_code) map[d.dept_code.toUpperCase()]=d.id })
        setDeptMap(map)
      })
    sb.from('employees').select('id,full_name_en,department_id,iban').eq('is_active',true).order('full_name_en')
      .then(({data})=>setEmployees(data||[]))
    sb.from('contractors').select('id,contractor_name,contact_name,iban').in('status',['ACTIVE','OPEN']).order('contractor_name')
      .then(({data})=>setContractors(data||[]))
  },[])

  useEffect(()=>{ setCard(''); setPools({}); setLines([]) },[sessionDept])
  useEffect(()=>{ if(card && sessionDept) loadPool() },[card,sessionDept])

  // Load pending receipt reminders on mount
  useEffect(()=>{
    async function loadPendingReceipts() {
      try {
        const { data: pLines } = await sb.from('field_payment_lines')
          .select('id,session_id,accountable_party_name,accountable_party_type,amount,bank_charge_amount')
          .in('accountable_party_type',['SUPPLIER','LOCAL_SUPPLIER','CONTRACTOR'])
          .eq('has_receipt', false)
          .order('created_at',{ascending:false})
          .limit(30)
        if(!pLines?.length) return

        const sids = [...new Set(pLines.map(l=>l.session_id))]
        const { data: sessions } = await sb.from('field_payment_sessions')
          .select('id,session_date,submitted_by_name')
          .in('id', sids)
        const sessMap = {}
        ;(sessions||[]).forEach(s=>{ sessMap[s.id]=s })

        setPendingReceipts(pLines.map(l=>({ ...l, _session: sessMap[l.session_id]||null })))
      } catch(e){ /* non-critical */ }
    }
    loadPendingReceipts()
  },[])

  async function loadPool() {
    setPoolLoading(true)
    try {
      const bank = (DEPT_CARDS[sessionDept]||[]).find(c=>c.value===card)?.bank
      if(!bank) return
      const {data:atmLines} = await sb.from('money_request_lines').select('money_request_id,iban,amount,department_name').eq('iban',bank)
      if(!atmLines?.length){ setPools({}); return }

      const mrAtmMap={}
      for(const l of atmLines){
        if(!mrAtmMap[l.money_request_id]) mrAtmMap[l.money_request_id]={atm_amount:0,dept_name:l.department_name}
        mrAtmMap[l.money_request_id].atm_amount+=parseFloat(l.amount)||0
        if(l.department_name) mrAtmMap[l.money_request_id].dept_name=l.department_name
      }
      const mrIds=Object.keys(mrAtmMap)
      const {data:mrs} = await sb.from('money_requests').select('id,request_number,request_date,department_name').in('id',mrIds).in('status',['OPEN','ACTIVE','APPROVED']).order('request_date',{ascending:true})
      if(!mrs?.length){ setPools({}); return }

      const {data:priorAllocs} = await sb.from('field_payment_mr_allocations').select('money_request_id,allocated_amount').in('money_request_id',mrIds).eq('is_over_distributed',false)
      const priorByMr={}
      for(const a of (priorAllocs||[])) priorByMr[a.money_request_id]=(priorByMr[a.money_request_id]||0)+(parseFloat(a.allocated_amount)||0)

      const depts=BANK_DEPTS[bank]||[]
      const newPools={}
      for(const d of depts) newPools[d]={available:0,mrs:[]}

      for(const mr of mrs){
        const atmData=mrAtmMap[mr.id]; if(!atmData) continue
        const atmAmt=atmData.atm_amount, prior=priorByMr[mr.id]||0, remaining=Math.max(0,atmAmt-prior)
        const deptName=(mr.department_name||atmData.dept_name||'').toUpperCase()
        const deptCode=depts.find(d=>deptName.includes(d))
        if(!deptCode) continue
        newPools[deptCode].mrs.push({id:mr.id,request_number:mr.request_number,request_date:mr.request_date,atm_amount:atmAmt,prior_distributed:prior,remaining})
        newPools[deptCode].available+=remaining
      }
      setPools(newPools)
      setLines([emptyLine(sessionDept)])
    } catch(e){ console.error('loadPool',e) } finally { setPoolLoading(false) }
  }

  const updateLine = useCallback((id,patch)=>setLines(prev=>prev.map(l=>l._id===id?{...l,...patch}:l)),[])
  const addLine    = ()=>setLines(prev=>[...prev,emptyLine(sessionDept)])
  const removeLine = id=>setLines(prev=>prev.filter(l=>l._id!==id))

  // IBAN lookup — called automatically after OCR finds an IBAN
  async function lookupIban(lineId, iban) {
    if(!iban?.trim()) return
    updateLine(lineId,{_resolve:'resolving'})
    const clean = iban.trim().replace(/\s/g,'').toUpperCase()
    const [{data:emps},{data:cons}] = await Promise.all([
      sb.from('employees').select('id,full_name_en,iban').eq('iban',clean).limit(1),
      sb.from('contractors').select('id,contractor_name,iban').eq('iban',clean).limit(1),
    ])
    if(emps?.length){
      const e=emps[0]
      updateLine(lineId,{_resolve:'employee',accountable_party_type:'EMPLOYEE',accountable_party_id:e.id,accountable_party_name:e.full_name_en,accountable_party_iban:e.iban})
    } else if(cons?.length){
      const c=cons[0]
      updateLine(lineId,{_resolve:'contractor',accountable_party_type:'CONTRACTOR',accountable_party_id:c.id,accountable_party_name:c.contractor_name,accountable_party_iban:c.iban})
    } else {
      updateLine(lineId,{_resolve:'not_found',accountable_party_iban:clean,accountable_party_type:'',accountable_party_id:'',accountable_party_name:''})
    }
  }

  // deptEmployees: filter by selected department using dept_code→id map
  const deptEmployees = useMemo(()=>{
    if(!sessionDept || !deptMap[sessionDept]) return employees
    const deptId = deptMap[sessionDept]
    return employees.filter(e => e.department_id === deptId)
  }, [employees, sessionDept, deptMap])

  const deptUsage = useMemo(()=>{
    const usage={}
    for(const d of cardDepts) usage[d]={used:0,available:pools[d]?.available||0}
    for(const l of lines){
      if(!l.dept_code) continue
      const amt=parseFloat(l.amount)||0
      if(!usage[l.dept_code]) usage[l.dept_code]={used:0,available:0}
      usage[l.dept_code].used+=amt
    }
    return usage
  },[lines,pools,cardDepts])

  const sessionTotal  = useMemo(()=>lines.reduce((s,l)=>s+(parseFloat(l.amount)||0),0),[lines])
  const bankFeesTotal = useMemo(()=>lines.reduce((s,l)=>s+(l.bank_fee_enabled?parseFloat(l.bank_fee)||0:0),0),[lines])
  const hasOver       = useMemo(()=>Object.values(deptUsage).some(u=>u.used>u.available&&u.available>0),[deptUsage])

  async function markReceiptDone(lineId) {
    setMarkingReceiptId(lineId)
    try {
      await sb.from('field_payment_lines').update({ has_receipt: true }).eq('id', lineId)
      setPendingReceipts(prev => prev.filter(r => r.id !== lineId))
    } catch(e){ /* ignore */ } finally { setMarkingReceiptId(null) }
  }

  async function handleSubmit(e) {
    e.preventDefault(); setError('')
    if(!sessionDept)          return setError('Please select a department.')
    if(!card)                 return setError('Please select an ATM card.')
    if(!custodianName.trim()) return setError('Please enter the custodian name.')
    if(!lines.length)         return setError('Please add at least one payment line.')
    if(lines.some(l=>!l.dept_code)) return setError('Each line needs a department.')
    if(lines.some(l=>!(parseFloat(l.amount)>0))) return setError('Each line needs a valid amount.')
    if(lines.some(l=>l.line_type==='TRANSFER'&&!l.accountable_party_name?.trim()))
      return setError('Each transfer line needs an identified party.')
    if(lines.some(l=>l.line_type!=='TRANSFER'&&!l.custodian_purpose))
      return setError('Each POS/Cash line needs an expense category.')

    setSubmitting(true)
    try {
      const {allocations,overTotal}=calcFifo(pools,lines)
      const poolTotal=Object.values(pools).reduce((s,p)=>s+(p.available||0),0)

      // Generate session ID client-side to avoid needing a SELECT policy for anon
      const sessionId = crypto.randomUUID()
      const {error:sErr}=await sb.from('field_payment_sessions').insert({
        id:sessionId,
        session_date:sessionDate,card_used:card,bank_account:cardBank,
        department_name:sessionDept,mr_approved_amount:poolTotal,session_total:sessionTotal,
        bank_charges_total:bankFeesTotal,card_pool_total:poolTotal,over_distributed:overTotal,
        proxy_count:lines.filter(l=>l.use_proxy).length,submitted_by_name:custodianName.trim(),
        submitted_at:new Date().toISOString(),status:'SUBMITTED',je_posted:false,notes:sessionNotes.trim()||null,
      })
      if(sErr) throw new Error(sErr.message)
      const session = { id: sessionId }

      const lineRows=lines.map((l,i)=>({
        session_id:session.id, sort_order:i+1, dept_code:l.dept_code,
        line_type:l.line_type==='TRANSFER'?'TRANSFER':'CUSTODIAN_EXPENSE',
        custodian_purpose:l.line_type!=='TRANSFER'?l.custodian_purpose:null,
        purpose:l.one_time_purpose||l.custodian_purpose||null,
        one_time_purpose:l.one_time_purpose||null,
        accountable_party_type:l.line_type==='TRANSFER'?l.accountable_party_type:null,
        accountable_party_id:l.accountable_party_id||null,
        accountable_party_name:l.line_type==='TRANSFER'?l.accountable_party_name:l.custodian_name||null,
        transfer_agent_id:l.use_proxy?l.transfer_agent_id||null:null,
        transfer_agent_name:l.use_proxy?l.transfer_agent_name||null:null,
        is_proxy:l.use_proxy,
        bank_charge_amount:l.bank_fee_enabled?parseFloat(l.bank_fee)||0:0,
        amount:parseFloat(l.amount),
        reference_no:l.reference_no||null,
        notes:[l.notes,l.receipt_name?`Receipt:${l.receipt_name}`:''].filter(Boolean).join(' | ')||null,
        has_receipt: !!l.receipt_name,
      }))

      const {error:lErr}=await sb.from('field_payment_lines').insert(lineRows)
      if(lErr) throw new Error(lErr.message)

      if(allocations.length>0){
        await sb.from('field_payment_mr_allocations').insert(allocations.map(a=>({
          session_id:session.id,money_request_id:a.mr_id,request_number:a.request_number,
          dept_code:a.dept_code,allocated_amount:a.allocated_amount,is_over_distributed:a.is_over,
        })))
      }
      setSubmitted(true)
    } catch(err){ setError(err.message||'Submission failed.')
    } finally { setSubmitting(false) }
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if(submitted) return (
    <div style={S.page}>
      {/* Hero header */}
      <div style={{ background: theme.grad || `linear-gradient(160deg,${theme.dark} 0%,${theme.color} 100%)`,
        borderRadius:20, padding:'32px 24px 28px', marginBottom:16,
        boxShadow:`0 8px 32px ${theme.color}50`, textAlign:'center' }}>
        <div style={{ width:72, height:72, background:'rgba(255,255,255,0.18)', borderRadius:20,
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:38,
          margin:'0 auto 16px' }}>✅</div>
        <div style={{ fontSize:24, fontWeight:900, color:'#fff', letterSpacing:'-0.5px' }}>Session Submitted!</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', marginTop:6 }}>
          Recorded successfully · Accounts will review &amp; post
        </div>
      </div>

      {/* Summary card */}
      <div style={{ background:'#fff', borderRadius:16, boxShadow:S.shadow, overflow:'hidden', marginBottom:12 }}>
        <div style={{ background: theme.light, padding:'12px 18px', borderBottom:`2px solid ${theme.color}22` }}>
          <div style={{ fontSize:12, fontWeight:700, color:theme.color, letterSpacing:1, textTransform:'uppercase' }}>Session Summary</div>
        </div>
        <div style={{ padding:'16px 18px', display:'flex', flexDirection:'column', gap:12 }}>
          {[
            { icon:'🏢', label:'Department', val: sessionDept },
            { icon:'💳', label:'Card Used',  val: (DEPT_CARDS[sessionDept]||[]).find(c=>c.value===card)?.label || card },
            { icon:'📅', label:'Date',       val: sessionDate },
            { icon:'👤', label:'Custodian',  val: custodianName || '—' },
            { icon:'💰', label:'Session Total', val: `SAR ${fmt(sessionTotal)}`, bold:true },
            { icon:'🧾', label:'Lines',      val: `${lines.length} payment line${lines.length!==1?'s':''}` },
          ].map(r=>(
            <div key={r.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, color:'#64748b', fontSize:13 }}>
                <span>{r.icon}</span><span>{r.label}</span>
              </div>
              <div style={{ fontSize:r.bold?16:13, fontWeight:r.bold?800:600, color:r.bold?theme.color:'#1e293b' }}>{r.val}</div>
            </div>
          ))}
        </div>
      </div>

      {hasOver && (
        <div style={{ background:'#fff8e1', border:`1.5px solid #fbbf24`, borderRadius:12,
          padding:'12px 16px', color:'#92400e', fontSize:13, marginBottom:12 }}>
          ⚠️ <strong>Over-distributed</strong> — Accounts will reconcile the variance.
        </div>
      )}

      <button style={{ ...S.btnPrimary(theme.color), width:'100%', padding:18, fontSize:16, fontWeight:800, borderRadius:14 }}
        onClick={()=>window.location.reload()}>
        + Start New Session
      </button>
    </div>
  )

  return (
    <div style={S.page}>

      {/* ── App Header ─────────────────────────────────────────────────────── */}
      <div style={{ background: theme.grad || `linear-gradient(160deg,${theme.dark} 0%,${theme.color} 100%)`,
        borderRadius:20, padding:'20px 20px 18px', marginBottom:16,
        boxShadow:`0 8px 32px ${theme.color}50` }}>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ width:48, height:48, background:'rgba(255,255,255,0.18)', borderRadius:14,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, flexShrink:0 }}>💳</div>
          <div>
            <div style={{ fontSize:20, fontWeight:800, color:'#fff', letterSpacing:'-0.3px' }}>Field Payment</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)', marginTop:2, letterSpacing:0.5 }}>RATAL GROUP · ACCSYS · ATM Distributions</div>
          </div>
        </div>
      </div>

      {/* ── Pending Receipt Reminders ──────────────────────────────────────── */}
      {pendingReceipts.length > 0 && (
        <div style={{ background:'#fff', borderRadius:16, border:'1.5px solid #bae6fd',
          marginBottom:14, overflow:'hidden', boxShadow:'0 2px 12px rgba(3,105,161,0.08)' }}>
          <button type="button"
            onClick={()=>setPendingReceiptsOpen(v=>!v)}
            style={{ width:'100%', padding:'12px 16px', background:'#f0f9ff',
              border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:10,
              borderBottom:pendingReceiptsOpen?'1.5px solid #bae6fd':'none' }}>
            <span style={{ fontSize:20 }}>📎</span>
            <div style={{ flex:1, textAlign:'left' }}>
              <div style={{ fontWeight:800, fontSize:14, color:'#0369a1' }}>
                Pending Receipts — {pendingReceipts.length} payment{pendingReceipts.length!==1?'s':''} missing receipt
              </div>
              <div style={{ fontSize:11, color:'#64748b', marginTop:1 }}>
                Tap to {pendingReceiptsOpen?'hide':'review'} — collect &amp; mark as received
              </div>
            </div>
            <span style={{ fontSize:18, color:'#0369a1', transition:'transform 0.2s',
              transform:pendingReceiptsOpen?'rotate(180deg)':'none' }}>⌃</span>
          </button>

          {pendingReceiptsOpen && (
            <div style={{ padding:'8px 12px 12px' }}>
              {pendingReceipts.map(pr=>(
                <div key={pr.id} style={{ border:'1px solid #e0f2fe', borderRadius:10,
                  padding:'10px 12px', marginBottom:8, background:'#f8fafc',
                  display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:20, flexShrink:0 }}>
                    {pr.accountable_party_type==='CONTRACTOR'?'🏗️':
                     pr.accountable_party_type==='SUPPLIER'?'🏢':'🏪'}
                  </span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13, color:'#0f172a',
                      whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {pr.accountable_party_name || pr.accountable_party_type}
                    </div>
                    <div style={{ fontSize:11, color:'#64748b', marginTop:1 }}>
                      SAR {fmt(pr.amount)}
                      {pr._session?.session_date ? ` · ${pr._session.session_date}` : ''}
                      {pr._session?.submitted_by_name ? ` · ${pr._session.submitted_by_name}` : ''}
                    </div>
                  </div>
                  <button type="button"
                    disabled={markingReceiptId === pr.id}
                    onClick={()=>markReceiptDone(pr.id)}
                    style={{ background:markingReceiptId===pr.id?'#94a3b8':'#15803d',
                      color:'#fff', border:'none', borderRadius:8, padding:'6px 10px',
                      fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap',
                      flexShrink:0 }}>
                    {markingReceiptId===pr.id?'…':'✓ Received'}
                  </button>
                </div>
              ))}
              <div style={{ fontSize:11, color:'#94a3b8', textAlign:'center', marginTop:4 }}>
                Tap "✓ Received" once you have collected the physical receipt from the party.
              </div>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>

        {/* ── Section 1: Session ──────────────────────────────────────────── */}
        <SCard>
          <SHead color={theme.color}>📋 Session Information</SHead>
          <div style={S.body}>

            <SField label="Session Date *">
              <input type="date" value={sessionDate} onChange={e=>setSessionDate(e.target.value)} required style={S.inp} />
            </SField>

            <SField label="Custodian / Card Holder *" hint="Person physically holding the ATM card">
              <input placeholder="Full name" value={custodianName}
                onChange={e=>setCustodianName(e.target.value)} required style={S.inp} />
            </SField>

            <SField label="Department *">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {ALL_DEPTS.map(d=>(
                  <button key={d.code} type="button" onClick={()=>setSessionDept(d.code)}
                    style={{ padding:'11px 12px', borderRadius:12, border:'2px solid',
                      borderColor:sessionDept===d.code?DEPT_THEME[d.code].color:'#e2e8f0',
                      background:sessionDept===d.code?DEPT_THEME[d.code].light:'#fafafa',
                      color:sessionDept===d.code?DEPT_THEME[d.code].color:'#64748b',
                      fontWeight:sessionDept===d.code?800:500, cursor:'pointer', textAlign:'left', lineHeight:1.3 }}>
                    <div style={{ fontSize:15, fontWeight:800 }}>{d.code}</div>
                    <div style={{ fontSize:10, opacity:0.8, marginTop:2 }}>{d.label}</div>
                  </button>
                ))}
              </div>
            </SField>

            {sessionDept && (
              <SField label="ATM Card *" hint={`Cards available for ${sessionDept}`}>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {(DEPT_CARDS[sessionDept]||[]).map(c=>(
                    <button key={c.value} type="button" onClick={()=>setCard(c.value)}
                      style={{ padding:'12px 16px', borderRadius:12, border:'2px solid',
                        borderColor:card===c.value?theme.color:'#e2e8f0',
                        background:card===c.value?theme.light:'#fafafa',
                        color:card===c.value?theme.color:'#475569',
                        fontWeight:card===c.value?700:500, cursor:'pointer', textAlign:'left',
                        fontSize:14, display:'flex', alignItems:'center', gap:10 }}>
                      <span style={{ fontSize:20 }}>💳</span>
                      <span>{c.label}</span>
                      {card===c.value && <span style={{ marginLeft:'auto', fontSize:18 }}>✓</span>}
                    </button>
                  ))}
                </div>
              </SField>
            )}

            <SField label="Session Notes">
              <input placeholder="Any general remarks (optional)" value={sessionNotes}
                onChange={e=>setSessionNotes(e.target.value)} style={S.inp} />
            </SField>
          </div>
        </SCard>

        {/* ── Section 2: Card Pool ─────────────────────────────────────────── */}
        {card && (
          <SCard>
            <SHead color={theme.color}>🏦 {cardBank} Pool — Available Balance</SHead>
            <div style={S.body}>
              {poolLoading ? (
                <div style={{ textAlign:'center', padding:24, color:'#94a3b8', fontSize:14 }}>⏳ Loading pool…</div>
              ) : Object.values(pools).every(p=>p.mrs.length===0) ? (
                <div style={S.alertAmber}>⚠️ No open Money Requests found for {cardBank} / {sessionDept}. Distributions will be flagged.</div>
              ) : (
                (BANK_DEPTS[cardBank]||[]).filter(d=>pools[d]?.mrs.length>0).map(d=>(
                  <PoolCard key={d} dept={d} pool={pools[d]} />
                ))
              )}
            </div>
          </SCard>
        )}

        {/* ── Section 3: Payment Lines ─────────────────────────────────────── */}
        {card && (
          <SCard>
            <SHead color={theme.color}>💰 Payment Lines</SHead>
            <div style={S.body}>
              {lines.length===0 && (
                <div style={{ textAlign:'center', padding:24, color:'#94a3b8', fontSize:14 }}>
                  No lines yet — tap Add below
                </div>
              )}

              {lines.map((line,idx)=>(
                <PaymentLine
                  key={line._id}
                  line={line} idx={idx}
                  sessionDept={sessionDept}
                  cardDepts={cardDepts}
                  employees={deptEmployees}
                  allEmployees={employees}
                  contractors={contractors}
                  theme={theme}
                  onUpdate={patch=>updateLine(line._id,patch)}
                  onRemove={()=>removeLine(line._id)}
                  onIbanLookup={iban=>lookupIban(line._id,iban)}
                />
              ))}

              {lines.some(l=>parseFloat(l.amount)>0)&&Object.keys(pools).length>0&&(
                <>
                  <BalanceSummary deptUsage={deptUsage} cardDepts={cardDepts} />
                  <FifoPreview pools={pools} lines={lines} />
                </>
              )}

              <button type="button" onClick={addLine}
                style={{ ...S.btnOutline(theme.color), width:'100%', marginTop:4, padding:14, fontSize:15 }}>
                + Add Payment Line
              </button>
            </div>
          </SCard>
        )}

        {/* ── Session total bar ────────────────────────────────────────────── */}
        {lines.length>0&&(
          <div style={{ background:`linear-gradient(135deg,${theme.dark},${theme.color})`, color:'#fff',
            borderRadius:16, padding:'16px 20px', marginBottom:12,
            display:'flex', justifyContent:'space-between', alignItems:'center',
            boxShadow:`0 4px 16px ${theme.color}44` }}>
            <div>
              <div style={{ fontSize:13, opacity:0.8 }}>Session Total</div>
              {bankFeesTotal>0&&<div style={{ fontSize:11, opacity:0.65 }}>incl. 🏦 SAR {fmt(bankFeesTotal)} fees</div>}
            </div>
            <div style={{ fontSize:24, fontWeight:800 }}>SAR {fmt(sessionTotal)}</div>
          </div>
        )}

        {hasOver&&<div style={S.alertAmber}>⚠️ Exceeds pool balance — session will be flagged for reconciliation.</div>}
        {error&&<div style={S.alertRed}>⛔ {error}</div>}

        {card&&(
          <button type="submit" disabled={submitting}
            style={{ ...S.btnPrimary(theme.color), width:'100%', padding:16, fontSize:16, marginBottom:8 }}>
            {submitting?'⏳ Submitting…':'✓ Submit Field Payment Session'}
          </button>
        )}

        <div style={{ textAlign:'center', color:'#94a3b8', fontSize:11, paddingBottom:32 }}>
          Ratal Group · ACCSYS · {new Date().getFullYear()}
        </div>
      </form>
    </div>
  )
}

// ─── PaymentLine ──────────────────────────────────────────────────────────────
function PaymentLine({ line, idx, sessionDept, cardDepts, employees, allEmployees, contractors, theme, onUpdate, onRemove, onIbanLookup }) {
  const fileRef  = useRef()
  const isTransfer   = line.line_type === 'TRANSFER'
  const lColor       = DEPT_COLORS_F(line.dept_code) || theme.color
  const lLight       = DEPT_THEMES_F(line.dept_code) || theme.light
  const resolved     = line._resolve  // idle|resolving|employee|contractor|not_found
  const isEmployee   = line.accountable_party_type === 'EMPLOYEE'
  const isContractor = line.accountable_party_type === 'CONTRACTOR'
  const needsText    = ['LOCAL_SUPPLIER','SUPPLIER','ONE_TIME','OTHERS'].includes(line.accountable_party_type)

  // ── OCR handler ────────────────────────────────────────────────────────────
  async function handleFile(e) {
    const file = e.target.files?.[0]; if(!file) return
    const reader = new FileReader()
    const rawDataUrl = await new Promise(res=>{ reader.onload=ev=>res(ev.target.result); reader.readAsDataURL(file) })
    onUpdate({ receipt_name:file.name, receipt_data:rawDataUrl, _ocr_step:'scanning', _ocr_status:'⏳ Enhancing image…', _ocr_parsed:null, _resolve:'idle' })
    try {
      // Pre-process: grayscale + contrast boost for better OCR accuracy
      const processedUrl = await preprocessImageForOCR(rawDataUrl)
      onUpdate({ _ocr_status:'⏳ Reading receipt text…' })

      const Tesseract = await loadTesseract()
      // Use English — ANB receipts are English; 'eng+ara' can be added if Arabic receipts needed
      const { data:{ text } } = await Tesseract.recognize(processedUrl, 'eng', { logger:()=>{} })

      const parsed = parseAnbReceipt(text)

      const patch = { _ocr_step:'done', _ocr_parsed:parsed, _ocr_status:'' }
      const fills = []

      if(parsed.amount)        { patch.amount          = parsed.amount;       fills.push(`SAR ${parsed.amount}`) }
      if(parsed.bank_fee)      { patch.bank_fee         = parsed.bank_fee;    patch.bank_fee_enabled=true; fills.push(`Fee SAR ${parsed.bank_fee}`) }
      if(parsed.reference_no)  { patch.reference_no     = parsed.reference_no; fills.push('TRN ✓') }
      if(parsed.receipt_date)  { patch.receipt_date     = parsed.receipt_date; fills.push(`Date ${parsed.receipt_date}`) }
      if(parsed.acct_name)     { patch._ocr_acct_name   = parsed.acct_name }   // hint for name field

      patch._ocr_status = fills.length
        ? `✅ Auto-filled: ${fills.join(' · ')}`
        : '⚠️ Could not read fields — try a clearer photo or fill manually'

      onUpdate(patch)

      // Auto-trigger IBAN lookup OR fall back to manual assignment
      if(isTransfer && parsed.iban) {
        onIbanLookup(parsed.iban)
      } else if(isTransfer) {
        // Receipt scanned but no IBAN found — let user assign party manually
        onUpdate({ _resolve:'not_found' })
      }

    } catch(err) {
      console.warn('[OCR]', err?.message)
      onUpdate({ _ocr_step:'done', _ocr_status:'⚠️ Scan failed — fill fields manually below' })
    }
    if(fileRef.current) fileRef.current.value=''
  }

  const hasReceipt = !!line.receipt_name

  return (
    <div style={{ border:`1.5px solid ${lColor}33`, borderLeft:`4px solid ${lColor}`,
      borderRadius:16, marginBottom:14, background:'#fff', overflow:'hidden',
      boxShadow:'0 2px 12px rgba(0,0,0,0.07)' }}>

      {/* ── Line header ── */}
      <div style={{ background:lLight, padding:'11px 14px', display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ flex:1, display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontWeight:800, fontSize:13, color:lColor }}>Line {idx+1}</span>
          {line.dept_code&&<span style={{ background:lColor, color:'#fff', borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{line.dept_code}</span>}
          {line._ocr_step==='done'&&<span style={{ fontSize:12 }}>✅</span>}
        </div>
        <button type="button" onClick={onRemove}
          style={{ background:'rgba(0,0,0,0.06)', border:'none', borderRadius:8,
            padding:'4px 10px', color:'#94a3b8', cursor:'pointer', fontSize:14, fontWeight:700 }}>✕</button>
      </div>

      <div style={{ padding:'14px 14px 12px' }}>

        {/* ── Dept selector (multi-dept cards) ── */}
        {cardDepts.length>1&&(
          <div style={{ marginBottom:14 }}>
            <SLabel>Department for this line *</SLabel>
            <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
              {cardDepts.map(d=>{
                const t=dTheme(d)
                return(
                <button key={d} type="button"
                  onClick={()=>onUpdate({dept_code:d,accountable_party_id:'',accountable_party_name:''})}
                  style={{ padding:'8px 14px', borderRadius:10, border:'2px solid',
                    borderColor:line.dept_code===d?t.color:'#e2e8f0',
                    background:line.dept_code===d?t.light:'#fafafa',
                    color:line.dept_code===d?t.color:'#64748b',
                    fontWeight:line.dept_code===d?700:500, cursor:'pointer', fontSize:13 }}>
                  {d}
                </button>
              )})}
            </div>
          </div>
        )}

        {/* ── Line type selector ── */}
        <div style={{ marginBottom:14 }}>
          <SLabel>Transaction Type *</SLabel>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:7 }}>
            {[
              { v:'TRANSFER',        icon:'💸', label:'Transfer' },
              { v:'POS',             icon:'💳', label:'POS' },
              { v:'CASH_WITHDRAWAL', icon:'💵', label:'Cash' },
            ].map(({ v, icon, label })=>(
              <button key={v} type="button"
                onClick={()=>onUpdate({ line_type:v, _resolve:'idle', _ocr_step:'idle', receipt_name:'', receipt_data:null, _ocr_status:'', _ocr_parsed:null, accountable_party_type:'', accountable_party_id:'', accountable_party_name:'', custodian_id:'', custodian_name:'', custodian_purpose:'', bank_fee:'', bank_fee_enabled:false })}
                style={{ padding:'11px 6px', borderRadius:12, border:'2px solid',
                  borderColor:line.line_type===v?lColor:'#e2e8f0',
                  background:line.line_type===v?lLight:'#fafafa',
                  color:line.line_type===v?lColor:'#64748b',
                  fontWeight:line.line_type===v?800:500, cursor:'pointer',
                  fontSize:11, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                <span style={{ fontSize:20 }}>{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════
            TRANSFER: Receipt scan first, then party resolution
        ═══════════════════════════════════════════════════════════ */}
        {isTransfer&&(
          <>
            {/* ── SCAN RECEIPT — primary action ── */}
            <div style={{ marginBottom:14 }}>
              <input ref={fileRef} type="file" accept="image/*,.pdf" capture="environment"
                onChange={handleFile} style={{ display:'none' }} />

              {!hasReceipt ? (
                /* Big scan button — main CTA */
                <button type="button" onClick={()=>fileRef.current?.click()}
                  disabled={line._ocr_step==='scanning'}
                  style={{ width:'100%', padding:'18px 16px', borderRadius:16,
                    border:`2px dashed ${line._ocr_step==='scanning'?'#94a3b8':lColor}`,
                    background:line._ocr_step==='scanning'?'#f8fafc':lLight,
                    color:line._ocr_step==='scanning'?'#94a3b8':lColor,
                    cursor:line._ocr_step==='scanning'?'wait':'pointer',
                    display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:32 }}>{line._ocr_step==='scanning'?'⏳':'📷'}</span>
                  <span style={{ fontSize:15, fontWeight:800 }}>
                    {line._ocr_step==='scanning'?'Scanning receipt…':'Scan / Attach Receipt'}
                  </span>
                  <span style={{ fontSize:11, opacity:0.7 }}>
                    {line._ocr_step==='scanning'?'Running OCR locally…':'Auto-fills amount, fee, TRN & identifies party'}
                  </span>
                </button>
              ) : (
                /* Receipt attached state */
                <div style={{ background:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:12,
                  padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:22 }}>📎</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, color:'#15803d', fontSize:13,
                      whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {line.receipt_name}
                    </div>
                    {line._ocr_status&&(
                      <div style={{ fontSize:11, color:line._ocr_status.startsWith('✅')?'#15803d':'#92400e', marginTop:2 }}>
                        {line._ocr_status}
                      </div>
                    )}
                  </div>
                  <button type="button"
                    onClick={()=>{ onUpdate({receipt_name:'',receipt_data:null,_ocr_step:'idle',_ocr_status:'',_ocr_parsed:null,_resolve:'idle',accountable_party_type:'',accountable_party_id:'',accountable_party_name:'',amount:'',bank_fee:'',bank_fee_enabled:false,reference_no:''}); if(fileRef.current) fileRef.current.value='' }}
                    style={{ background:'none', border:'1px solid #bbf7d0', borderRadius:8, padding:'5px 10px', color:'#15803d', cursor:'pointer', fontSize:12, fontWeight:700, whiteSpace:'nowrap' }}>
                    Change
                  </button>
                </div>
              )}

              {/* Skip link */}
              {!hasReceipt&&line._ocr_step==='idle'&&(
                <button type="button" onClick={()=>onUpdate({_manual:true,_ocr_step:'done',_resolve:'not_found'})}
                  style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', fontSize:12, marginTop:6, display:'block', textDecoration:'underline' }}>
                  Skip scan — enter manually
                </button>
              )}
            </div>

            {/* ── Party resolution (shown after scan or manual skip) ── */}
            {(line._ocr_step==='done'||line._manual)&&(
              <div style={{ marginBottom:14 }}>
                <SLabel>Beneficiary Party</SLabel>

                {/* Resolving spinner */}
                {resolved==='resolving'&&(
                  <div style={{ background:'#eff6ff', borderRadius:12, padding:'12px 14px',
                    color:'#1d4ed8', fontSize:13, display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:18 }}>🔍</span> Looking up IBAN in system…
                  </div>
                )}

                {/* Auto-resolved: Employee */}
                {resolved==='employee'&&(
                  <div style={{ background:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:12, padding:'12px 14px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:22 }}>👤</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:800, fontSize:14, color:'#15803d' }}>Employee — auto identified</div>
                        <div style={{ fontSize:13, color:'#1e293b', marginTop:2 }}>{line.accountable_party_name}</div>
                        <div style={{ fontFamily:'monospace', fontSize:10, color:'#64748b', marginTop:1 }}>{line.accountable_party_iban}</div>
                      </div>
                      <button type="button" onClick={()=>onUpdate({_resolve:'not_found',accountable_party_type:'',accountable_party_id:'',accountable_party_name:''})}
                        style={{ background:'none', border:'1px solid #d1fae5', borderRadius:8, padding:'4px 10px', color:'#15803d', cursor:'pointer', fontSize:11 }}>
                        Change
                      </button>
                    </div>
                  </div>
                )}

                {/* Auto-resolved: Contractor */}
                {resolved==='contractor'&&(
                  <div>
                    <div style={{ background:'#eff6ff', border:'1.5px solid #bfdbfe', borderRadius:12, padding:'12px 14px', marginBottom: (!line.receipt_name ? 8 : 0) }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:22 }}>🏗️</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:800, fontSize:14, color:'#1d4ed8' }}>Contractor — auto identified</div>
                          <div style={{ fontSize:13, color:'#1e293b', marginTop:2 }}>{line.accountable_party_name}</div>
                          <div style={{ fontFamily:'monospace', fontSize:10, color:'#64748b', marginTop:1 }}>{line.accountable_party_iban}</div>
                        </div>
                        <button type="button" onClick={()=>onUpdate({_resolve:'not_found',accountable_party_type:'',accountable_party_id:'',accountable_party_name:''})}
                          style={{ background:'none', border:'1px solid #bfdbfe', borderRadius:8, padding:'4px 10px', color:'#1d4ed8', cursor:'pointer', fontSize:11 }}>
                          Change
                        </button>
                      </div>
                    </div>
                    {/* Soft receipt reminder for contractor payments — receipt comes AFTER payment */}
                    {!line.receipt_name&&(
                      <div style={{ background:'#f0f9ff', border:'1.5px solid #bae6fd', borderRadius:10, padding:'8px 12px', display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#0369a1' }}>
                        <span>💡</span>
                        <span style={{ flex:1 }}>Remember to collect &amp; attach the receipt from the contractor after payment.</span>
                        <button type="button" onClick={()=>fileRef.current?.click()}
                          style={{ background:'#0284c7', color:'#fff', border:'none', borderRadius:8, padding:'5px 10px', fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                          📷 Attach
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* IBAN not found — manual assignment */}
                {resolved==='not_found'&&(
                  <div style={{ background:'#fffbeb', border:'1.5px solid #fbbf24', borderRadius:12, padding:'12px 14px' }}>
                    {line.accountable_party_iban&&(
                      <div style={{ fontSize:11, color:'#92400e', marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
                        <span>⚠️</span>
                        <span>IBAN <span style={{ fontFamily:'monospace', fontWeight:700 }}>{line.accountable_party_iban.slice(0,14)}…</span> not in system — assign manually</span>
                      </div>
                    )}

                    {/* Party type dropdown */}
                    <select value={line.accountable_party_type}
                      onChange={e=>onUpdate({accountable_party_type:e.target.value,accountable_party_id:'',accountable_party_name:''})}
                      style={{ ...S.inp, marginBottom:8, borderColor:'#fbbf24' }}>
                      <option value="">— Select party type —</option>
                      {MANUAL_PARTY_TYPES.map(pt=><option key={pt.value} value={pt.value}>{pt.label}</option>)}
                    </select>

                    {/* Employee dropdown */}
                    {isEmployee&&(
                      <select value={line.accountable_party_id}
                        onChange={e=>{ const emp=employees.find(x=>x.id===e.target.value); onUpdate({accountable_party_id:e.target.value,accountable_party_name:emp?.full_name_en||''}) }}
                        style={{ ...S.inp, marginBottom:6 }}>
                        <option value="">— Select employee —</option>
                        {employees.map(emp=><option key={emp.id} value={emp.id}>{emp.full_name_en}</option>)}
                      </select>
                    )}

                    {/* Contractor dropdown */}
                    {isContractor&&(
                      <select value={line.accountable_party_id}
                        onChange={e=>{ const c=contractors.find(x=>x.id===e.target.value); onUpdate({accountable_party_id:e.target.value,accountable_party_name:c?.contractor_name||''}) }}
                        style={{ ...S.inp, marginBottom:6 }}>
                        <option value="">— Select contractor —</option>
                        {contractors.map(c=><option key={c.id} value={c.id}>{c.contractor_name}{c.contact_name?` — ${c.contact_name}`:''}</option>)}
                      </select>
                    )}

                    {/* Soft receipt reminder — receipt comes AFTER payment, not required to submit */}
                    {['SUPPLIER','LOCAL_SUPPLIER','CONTRACTOR'].includes(line.accountable_party_type)&&!line.receipt_name&&(
                      <div style={{ background:'#f0f9ff', border:'1.5px solid #bae6fd', borderRadius:10, padding:'10px 12px', marginBottom:8, display:'flex', alignItems:'flex-start', gap:8 }}>
                        <span style={{ fontSize:16, flexShrink:0 }}>💡</span>
                        <div style={{ fontSize:12, color:'#0369a1', lineHeight:1.5 }}>
                          <strong>Reminder:</strong> Collect the receipt / invoice from this party after payment. You can attach it now if you already have it, or submit and attach later.
                          <button type="button"
                            onClick={()=>fileRef.current?.click()}
                            style={{ display:'inline-block', marginTop:6, background:'#0284c7', color:'#fff', border:'none', borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                            📷 Attach Now (optional)
                          </button>
                        </div>
                      </div>
                    )}
                    {['SUPPLIER','LOCAL_SUPPLIER','CONTRACTOR'].includes(line.accountable_party_type)&&line.receipt_name&&(
                      <div style={{ background:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:10, padding:'8px 12px', marginBottom:8, display:'flex', alignItems:'center', gap:8, fontSize:12, color:'#15803d', fontWeight:700 }}>
                        ✅ Receipt attached: {line.receipt_name}
                      </div>
                    )}

                    {/* Free text for others */}
                    {needsText&&(
                      <>
                        <input placeholder="Name / company *" value={line.accountable_party_name}
                          onChange={e=>onUpdate({accountable_party_name:e.target.value})} required
                          style={{ ...S.inp, marginBottom:6, borderColor:line.accountable_party_name?'#86efac':undefined }} />
                        {line._ocr_acct_name&&!line.accountable_party_name&&(
                          <div style={{ fontSize:11, color:'#92400e', marginBottom:6 }}>
                            📋 From receipt: <button type="button"
                              onClick={()=>onUpdate({accountable_party_name:line._ocr_acct_name})}
                              style={{ background:'none', border:'none', color:'#1d4ed8', cursor:'pointer', fontSize:11, textDecoration:'underline', fontWeight:700, padding:0 }}>
                              Use "{line._ocr_acct_name}"
                            </button>
                          </div>
                        )}
                        <input placeholder="Payment purpose *" value={line.one_time_purpose}
                          onChange={e=>onUpdate({one_time_purpose:e.target.value})} required
                          style={{ ...S.inp, borderColor:lColor }} />
                      </>
                    )}
                  </div>
                )}

                {/* Idle state — waiting for scan or manual */}
                {resolved==='idle'&&!line._manual&&(
                  <div style={{ background:'#f8fafc', border:'1.5px solid #e2e8f0', borderRadius:12, padding:'12px 14px', color:'#94a3b8', fontSize:13, textAlign:'center' }}>
                    Scan receipt above to auto-identify party
                  </div>
                )}
              </div>
            )}

            {/* ── Proxy ── */}
            {(resolved==='employee'||resolved==='contractor'||needsText)&&(
              <div style={{ marginBottom:10 }}>
                <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontSize:13, color:'#475569', padding:'8px 0' }}>
                  <input type="checkbox" checked={line.use_proxy} onChange={e=>onUpdate({use_proxy:e.target.checked})}
                    style={{ width:18, height:18, accentColor:lColor }} />
                  Someone else physically received this (proxy / agent)
                </label>
                {line.use_proxy&&(
                  <div style={{ marginTop:6 }}>
                    <select value={line.transfer_agent_id}
                      onChange={e=>{ const emp=allEmployees.find(x=>x.id===e.target.value); onUpdate({transfer_agent_id:e.target.value,transfer_agent_name:emp?.full_name_en||''}) }}
                      style={{ ...S.inp, marginBottom:6 }}>
                      <option value="">— Who received? —</option>
                      {allEmployees.map(emp=><option key={emp.id} value={emp.id}>{emp.full_name_en}</option>)}
                    </select>
                    {!line.transfer_agent_id&&(
                      <input placeholder="Or type name" value={line.transfer_agent_name}
                        onChange={e=>onUpdate({transfer_agent_name:e.target.value})} style={S.inp} />
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════
            POS / CASH WITHDRAWAL
        ═══════════════════════════════════════════════════════════ */}
        {!isTransfer&&(
          <>
            <SField label="Custodian — Who used the card? *">
              <select value={line.custodian_id}
                onChange={e=>{ const emp=allEmployees.find(x=>x.id===e.target.value); onUpdate({custodian_id:e.target.value,custodian_name:emp?.full_name_en||''}) }}
                style={{ ...S.inp, borderColor:lColor }}>
                <option value="">— Select custodian —</option>
                {allEmployees.map(emp=><option key={emp.id} value={emp.id}>{emp.full_name_en}</option>)}
              </select>
            </SField>

            <SField label="Expense Category *">
              <select value={line.custodian_purpose}
                onChange={e=>onUpdate({custodian_purpose:e.target.value})}
                required style={{ ...S.inp, borderColor:lColor }}>
                <option value="">— Select category —</option>
                {CUSTODIAN_PURPOSES.map(p=><option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </SField>

            {/* Receipt for POS/Cash */}
            <div style={{ marginBottom:14 }}>
              <SLabel>Receipt / Slip (optional)</SLabel>
              <input ref={fileRef} type="file" accept="image/*,.pdf" capture="environment"
                onChange={handleFile} style={{ display:'none' }} />
              {!hasReceipt ? (
                <button type="button" onClick={()=>fileRef.current?.click()}
                  style={{ width:'100%', padding:'12px 16px', borderRadius:12,
                    border:`1.5px dashed ${lColor}`, background:lLight,
                    color:lColor, cursor:'pointer', fontSize:13, fontWeight:700,
                    display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  📷 Attach Receipt
                </button>
              ) : (
                <div style={{ background:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:10, padding:'9px 12px', display:'flex', alignItems:'center', gap:8 }}>
                  <span>📎</span>
                  <span style={{ flex:1, fontSize:13, fontWeight:600, color:'#15803d' }}>{line.receipt_name}</span>
                  <button type="button" onClick={()=>onUpdate({receipt_name:'',receipt_data:null})}
                    style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', fontSize:16 }}>✕</button>
                </div>
              )}
              {line._ocr_status&&<div style={{ fontSize:11, color:'#64748b', marginTop:4 }}>{line._ocr_status}</div>}
            </div>
          </>
        )}

        {/* ── Amount & Financial fields ── (always visible after receipt for TRANSFER, immediately for POS/Cash) */}
        {(line._ocr_step==='done'||line._manual||!isTransfer)&&(
          <>
            <SField label="Amount (SAR) *">
              <div style={{ position:'relative' }}>
                <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'#64748b', fontSize:14, fontWeight:700 }}>SAR</span>
                <input type="number" min="0.01" step="0.01" placeholder="0.00"
                  value={line.amount} onChange={e=>onUpdate({amount:e.target.value})} required
                  style={{ ...S.inp, paddingLeft:50, fontWeight:800, fontSize:20, textAlign:'right',
                    borderColor:line.amount?lColor:'#e2e8f0',
                    background:line.amount?'#f0fdf4':'#fff', color:'#0f172a' }} />
              </div>
              {line._ocr_parsed?.amount&&(
                <div style={{ fontSize:11, color:'#64748b', marginTop:4 }}>📋 Auto-filled from receipt</div>
              )}
            </SField>

            {/* Bank fee — only shown if OCR found it or manually enabled */}
            {line.bank_fee_enabled ? (
              <SField label="Bank Transfer Fee (SAR)">
                <div style={{ position:'relative' }}>
                  <span style={{ position:'absolute', left:14, top:'50%', transform:'translateY(-50%)', color:'#92400e', fontSize:14 }}>SAR</span>
                  <input type="number" min="0" step="0.01" placeholder="0.00"
                    value={line.bank_fee} onChange={e=>onUpdate({bank_fee:e.target.value})}
                    style={{ ...S.inp, paddingLeft:50, borderColor:'#fbbf24', color:'#92400e', fontWeight:700 }} />
                </div>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:4 }}>
                  <span style={{ fontSize:11, color:'#92400e' }}>🏦 Transfer fee from receipt</span>
                  <button type="button" onClick={()=>onUpdate({bank_fee_enabled:false,bank_fee:''})}
                    style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', fontSize:11, textDecoration:'underline' }}>Remove</button>
                </div>
              </SField>
            ) : isTransfer&&(
              <button type="button" onClick={()=>onUpdate({bank_fee_enabled:true})}
                style={{ background:'none', border:'1px solid #fde68a', borderRadius:8, padding:'7px 12px',
                  color:'#92400e', cursor:'pointer', fontSize:12, marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>
                + Add bank transfer fee
              </button>
            )}

            {/* TRN / Ref # */}
            {isTransfer&&(
              <SField label={`Reference / TRN ${line.reference_no?'✓':''}`}>
                <input placeholder="Transaction reference from bank"
                  value={line.reference_no} onChange={e=>onUpdate({reference_no:e.target.value})}
                  style={{ ...S.inp, fontFamily:'monospace',
                    borderColor:line.reference_no?'#86efac':'#e2e8f0',
                    background:line.reference_no?'#f0fdf4':'#fff' }} />
                {line._ocr_parsed?.reference_no&&(
                  <div style={{ fontSize:11, color:'#64748b', marginTop:4 }}>📋 Auto-filled from receipt</div>
                )}
              </SField>
            )}

            <SField label="Notes">
              <input placeholder="Any remarks (optional)" value={line.notes}
                onChange={e=>onUpdate({notes:e.target.value})} style={S.inp} />
            </SField>
          </>
        )}
      </div>
    </div>
  )
}

// Helper functions used inside PaymentLine
function DEPT_COLORS_F(dept){ return (DEPT_THEME[dept]||{}).color||null }
function DEPT_THEMES_F(dept){ return (DEPT_THEME[dept]||{}).light||null }

// ─── PoolCard ─────────────────────────────────────────────────────────────────
function PoolCard({ dept, pool }) {
  const t = dTheme(dept)
  return (
    <div style={{ border:`1.5px solid ${t.color}33`, borderRadius:12, marginBottom:10, overflow:'hidden' }}>
      <div style={{ background:t.light, padding:'10px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <span style={{ fontWeight:800, color:t.color, fontSize:14 }}>{dept}</span>
          <span style={{ color:'#64748b', fontSize:12, marginLeft:8 }}>{pool.mrs.length} open MR{pool.mrs.length!==1?'s':''}</span>
        </div>
        <div style={{ fontWeight:800, color:t.color, fontSize:16 }}>SAR {fmt(pool.available)}</div>
      </div>
      {pool.mrs.map(mr=>(
        <div key={mr.id} style={{ padding:'8px 14px', borderTop:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:13 }}>
          <span style={{ fontWeight:700, color:t.color, fontFamily:'monospace' }}>{mr.request_number}</span>
          <span style={{ color:'#94a3b8', fontSize:11 }}>{mr.request_date}</span>
          <span style={{ fontWeight:700, color:mr.remaining>0?t.color:'#cbd5e1' }}>SAR {fmt(mr.remaining)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── BalanceSummary ───────────────────────────────────────────────────────────
function BalanceSummary({ deptUsage, cardDepts }) {
  return (
    <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:12, padding:'12px 14px', margin:'8px 0' }}>
      <div style={{ fontWeight:700, color:'#1e293b', marginBottom:10, fontSize:13 }}>Pool Consumption</div>
      {cardDepts.map(dept=>{
        const t=dTheme(dept), u=deptUsage[dept]||{used:0,available:0}
        const over=u.used>u.available&&u.available>0
        const pct=u.available>0?Math.min(100,(u.used/u.available)*100):(u.used>0?100:0)
        const barColor=over?'#ef4444':pct>80?'#f97316':t.color
        return(
          <div key={dept} style={{ marginBottom:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
              <span style={{ fontWeight:700, color:barColor }}>{dept} · SAR {fmt(u.used)}</span>
              <span style={{ color:'#94a3b8' }}>/ SAR {fmt(u.available)}</span>
            </div>
            <div style={{ background:'#e2e8f0', borderRadius:4, height:6, overflow:'hidden' }}>
              <div style={{ width:`${pct}%`, height:'100%', background:barColor, borderRadius:4, transition:'width 0.3s' }} />
            </div>
            {over&&<div style={{ color:'#ef4444', fontSize:11, marginTop:3 }}>⚠️ Over by SAR {fmt(u.used-u.available)}</div>}
          </div>
        )
      })}
    </div>
  )
}

// ─── FifoPreview ─────────────────────────────────────────────────────────────
function FifoPreview({ pools, lines }) {
  const {allocations}=calcFifo(pools,lines.filter(l=>parseFloat(l.amount)>0))
  if(!allocations.length) return null
  return(
    <div style={{ border:'1px solid #e2e8f0', borderRadius:12, overflow:'hidden', margin:'8px 0 4px' }}>
      <div style={{ background:'#f8fafc', padding:'8px 14px', fontWeight:700, fontSize:12, color:'#64748b', display:'flex', justifyContent:'space-between' }}>
        <span>📊 FIFO Allocation Preview</span>
        <span style={{ fontWeight:400 }}>live</span>
      </div>
      {allocations.map((a,i)=>{
        const t=dTheme(a.dept_code)
        return(
          <div key={i} style={{ padding:'8px 14px', borderTop:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center', background:a.is_over?'#fffbeb':'#fff' }}>
            <span style={{ fontWeight:700, color:a.is_over?'#f97316':t.color, fontSize:13 }}>
              {a.is_over?'⚠️ Over-distribution':a.request_number}
            </span>
            <span style={{ fontWeight:800, color:a.is_over?'#ef4444':'#15803d', fontSize:13 }}>SAR {fmt(a.allocated_amount)}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Layout helpers ───────────────────────────────────────────────────────────
function SCard({ children }) {
  return <div style={{ background:'#fff', borderRadius:18, border:'1px solid #e2e8f0', marginBottom:14, overflow:'hidden', boxShadow:'0 3px 16px rgba(0,0,0,0.08)' }}>{children}</div>
}
function SHead({ children, color='#16a34a' }) {
  return <div style={{ padding:'13px 16px', fontWeight:800, fontSize:14, color:'#fff',
    background:`linear-gradient(90deg,${color}ee,${color}bb)`,
    borderBottom:`2px solid ${color}` }}>{children}</div>
}
function SLabel({ children }) {
  return <div style={{ fontSize:10, fontWeight:800, color:'#64748b', textTransform:'uppercase', letterSpacing:0.8, marginBottom:6 }}>{children}</div>
}
function SField({ label, hint, children }) {
  return(
    <div style={{ marginBottom:14 }}>
      <SLabel>{label}</SLabel>
      {hint&&<div style={{ fontSize:11, color:'#94a3b8', marginBottom:6 }}>{hint}</div>}
      {children}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  page:{
    maxWidth:480, margin:'0 auto', padding:'14px 12px 80px',
    fontFamily:"'Segoe UI',system-ui,-apple-system,sans-serif",
    background:'#f0f2f5', minHeight:'100vh', boxSizing:'border-box',
  },
  body:{ padding:'14px 14px 6px' },
  shadow:'0 4px 24px rgba(0,0,0,0.10)',
  inp:{
    padding:'12px 14px', border:'1.5px solid #e2e8f0', borderRadius:12,
    fontSize:15, outline:'none', width:'100%', boxSizing:'border-box',
    fontFamily:'inherit', background:'#fff', minHeight:48,
    WebkitAppearance:'none', appearance:'none',
    transition:'border-color 0.15s',
  },
  alertAmber:{
    background:'#fffbeb', border:'1.5px solid #fbbf24', borderRadius:12,
    padding:'12px 14px', color:'#92400e', fontSize:13, marginBottom:12,
  },
  alertRed:{
    background:'#fef2f2', border:'1.5px solid #f87171', borderRadius:12,
    padding:'12px 14px', color:'#991b1b', fontSize:13, marginBottom:12,
  },
  btnPrimary:(color)=>({
    background:color, color:'#fff', border:'none', borderRadius:14,
    padding:'13px 20px', fontSize:15, fontWeight:800, cursor:'pointer',
    WebkitTapHighlightColor:'transparent',
  }),
  btnOutline:(color)=>({
    background:'#fff', color, border:`2px solid ${color}`, borderRadius:14,
    padding:'12px 16px', fontSize:14, fontWeight:700, cursor:'pointer',
    WebkitTapHighlightColor:'transparent',
  }),
}
