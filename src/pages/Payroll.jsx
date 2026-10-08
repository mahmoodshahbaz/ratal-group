import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.HR
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { printDocument, openPrintWindow } from '../lib/templatePrint'

// ─── GOSI Rules ────────────────────────────────────────────────────────────
// Base = Bank Portion (not gross). Company-borne (not deducted from employee).
// Saudi = 9%  company contribution
// Expat = 3%  company contribution
// ─── WPS = pipe-delimited, ANB-18 source, Bank Portion only, no Outsource ──

const SAR = v => `SAR ${(+v||0).toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const n2  = v => (+v||0).toFixed(2)
const TODAY = new Date().toISOString().slice(0,10)

const GOSI_RATE = { SAUDI:0.09, EXPAT:0.02 }   // EXPAT = 2% employer hazard only

function gosiRate(emp) {
  const cat = emp.employee_category || ''
  if (cat === '03' || cat === '04') return 0   // OUTSOURCED/CONTRACT — no GOSI
  const nat = (emp.nationality||'').toUpperCase()
  return nat === 'SAUDI' || nat === 'SA' ? GOSI_RATE.SAUDI : GOSI_RATE.EXPAT
}

// ─── Category constants ──────────────────────────────────────────────────────
const CAT_LABEL = { '01':'LOCAL','02':'EXPAT','03':'OUTSOURCED','04':'CONTRACT' }
const CAT_COLOR = { '01':'#1565c0','02':'#6a1b9a','03':'#e65100','04':'#2e7d32' }
const CAT_BG    = { '01':'#e3f2fd','02':'#f3e5f5','03':'#fff3e0','04':'#e8f5e9' }

// ─── Derive bank + cash split from employee record ───────────────────────────
function calcBankCash(emp) {
  const cat  = emp.employee_category || '02'
  const basic    = +(emp.basic_salary||0)
  const housing  = +(emp.housing_allowance||0)
  const transport= +(emp.transport_allowance||0)
  const mobile   = +(emp.mobile_allowance||0)
  const medical  = +(emp.medical_allowance||0)
  const technical= +(emp.technical_allowance||0)
  const other    = +(emp.other_allowance||0)
  const pkg = basic + housing + transport + mobile + medical + technical + other

  if (cat === '03' || cat === '04') return { bank:0, cash:pkg, slipType:'CASH_ONLY', pkg }
  if (cat === '01')                 return { bank:pkg, cash:0, slipType:'BANK_ONLY', pkg }

  // cat 02 — EXPAT: check payment_mode
  const mode = (emp.payment_mode||'BANK_ONLY')
  if (mode === 'BANK_ONLY') return { bank:pkg, cash:0, slipType:'BANK_ONLY', pkg }
  if (mode === 'CASH_ONLY') return { bank:0, cash:pkg, slipType:'CASH_ONLY', pkg }

  // SPLIT — compute bank from DB fields
  let bank = 0
  if (+(emp.bank_fixed_amount||0) > 0) {
    bank = Math.min(+(emp.bank_fixed_amount), pkg)
  } else if (+(emp.bank_portion_pct||0) > 0) {
    bank = Math.round(pkg * +(emp.bank_portion_pct) / 100)
  } else {
    bank = Math.min(+(emp.bank_portion||0), pkg)   // legacy fallback
  }
  return { bank, cash: Math.max(0, pkg - bank), slipType:'SPLIT', pkg }
}

// ─── Pro-rata factor for OUTSOURCED / CONTRACT ───────────────────────────────
// Returns { activeDays, totalDays:30, factor, isPartial, pkg (adjusted) }
function calcProRata(emp, selMonth, pkgFull) {
  const [yr, mo] = selMonth.split('-').map(Number)
  const monthStart = new Date(yr, mo-1, 1)
  const monthEnd   = new Date(yr, mo, 0)   // last calendar day

  const join  = emp.hire_date        ? new Date(emp.hire_date)         : null
  const leave = emp.date_of_leaving  ? new Date(emp.date_of_leaving)   : null

  const effStart = (join  && join  > monthStart) ? join  : monthStart
  const effEnd   = (leave && leave < monthEnd)   ? leave : monthEnd

  const activeDays = Math.max(0, Math.round((effEnd - effStart) / 86400000) + 1)
  const totalDays  = 30   // Saudi standard month
  const isPartial  = (join  && join  >= monthStart && join  <= monthEnd)
                  || (leave && leave >= monthStart && leave <= monthEnd)
  const factor     = Math.min(1, activeDays / totalDays)
  return { activeDays, totalDays, factor, isPartial, pkg: Math.round(pkgFull * factor) }
}

// ─── EXPAT joining / leaving salary rules ────────────────────────────────────
function calcExpatComponents(emp, selMonth, basic, housing, transport) {
  const [yr, mo] = selMonth.split('-').map(Number)
  const monthStart = new Date(yr, mo-1, 1)
  const monthEnd   = new Date(yr, mo, 0)
  const join  = emp.hire_date        ? new Date(emp.hire_date)        : null
  const leave = emp.date_of_leaving  ? new Date(emp.date_of_leaving)  : null

  const joiningThisMonth = join  && join  >= monthStart && join  <= monthEnd
  const leavingThisMonth = leave && leave >= monthStart && leave <= monthEnd

  // Tenure from initial join date (use hire_date as proxy)
  const tenureYrs = join ? (Date.now() - join.getTime()) / (365.25 * 86400000) : 99

  if (joiningThisMonth) {
    const joinDay    = join.getDate()
    const daysInMonth= monthEnd.getDate()
    const activeDays = daysInMonth - joinDay + 1
    const factor     = activeDays / 30
    if (joinDay < 10) {
      // Before 10th: Basic pro-rated; Housing + Transport full
      return { basic: Math.round(basic * factor), housing, transport, activeDays, isPartial:true }
    } else {
      // On/after 10th: All pro-rated
      return { basic: Math.round(basic*factor), housing: Math.round(housing*factor), transport: Math.round(transport*factor), activeDays, isPartial:true }
    }
  }

  if (leavingThisMonth) {
    const leaveDay   = leave.getDate()
    const activeDays = leaveDay
    const factor     = activeDays / 30
    if (tenureYrs >= 10) {
      // 10+ years: full month always
      return { basic, housing, transport, activeDays:30, isPartial:false }
    } else if (tenureYrs >= 5) {
      // 5-10 years, leaving after 10th: Basic pro-rated only; Housing+Transport full
      if (leaveDay > 10) {
        return { basic: Math.round(basic*factor), housing, transport, activeDays, isPartial:true }
      }
      // leaving on/before 10th: treat same as <5Y
      return { basic: Math.round(basic*factor), housing, transport: Math.round(transport*factor), activeDays, isPartial:true }
    } else {
      // <5Y: (Basic + Transport) pro-rated; Housing full
      return { basic: Math.round(basic*factor), housing, transport: Math.round(transport*factor), activeDays, isPartial:true }
    }
  }

  // Full month — no adjustment
  return { basic, housing, transport, activeDays:30, isPartial:false }
}

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'20px 22px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:18 },
  inp:   { width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
  btn:   (c='#00897b') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer' }),
  label: { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4 },
  th:    { padding:'9px 10px', textAlign:'right', fontSize:10, color:'#fff', fontWeight:700, whiteSpace:'nowrap', background:MC },
  td:    { padding:'7px 9px', fontSize:11, textAlign:'right', borderBottom:'1px solid #f0f4f8', whiteSpace:'nowrap' },
  tab:   a => ({ padding:'7px 16px', border:'none', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:700, marginRight:6, background:a?'#00897b':'#f0f4f8', color:a?'#fff':'#6b7c93' }),
}

// ─── ANB WPS Constants ──────────────────────────────────────────────────────
const ANB_MAX_SINGLE = 200000   // SAR 200,000 per D-row limit (ANB requirement)

// Build ANB-18 pipe-delimited WPS lines with 200K split logic
// Returns { lines:string[], totalAmount:number, dRowCount:number }
function buildWPSLines(wpsItems, wpsAmounts, date, entityName) {
  const dRows = []
  wpsItems.forEach((it, idx) => {
    const iban   = (it._iban||'').replace(/\s/g,'')
    const name   = (it._name||'').replace(/\|/g,'').substring(0,50)
    const empNo  = (it._emp_no||String(idx+1).padStart(4,'0'))
    const bcode  = it._bank_code||'1060'
    let remaining = wpsAmounts[idx]
    let splitIdx  = 0
    // Split into multiple D rows if > 200K (ANB single-transfer limit)
    while (remaining > 0) {
      const chunk = Math.min(remaining, ANB_MAX_SINGLE)
      const ref   = splitIdx > 0 ? `${empNo}-${splitIdx+1}` : empNo
      dRows.push(`D|${ref}|${name}|${iban}|${bcode}|${chunk.toFixed(2)}|SAR`)
      remaining = Math.round((remaining - chunk) * 100) / 100
      splitIdx++
    }
  })
  const totalWPS = wpsAmounts.reduce((s,v)=>s+v, 0)
  const hRow = `H|${entityName||'RATAL'}|${date}|${dRows.length}|${totalWPS.toFixed(2)}|SAR`
  return { lines:[hRow, ...dRows], totalAmount:totalWPS, dRowCount:dRows.length }
}

// Upload WPS .txt to Drive (payroll-wps/YYYY/ subfolder)
async function uploadWPSToDrive(txtContent, fileName, month) {
  try {
    const supaUrl = import.meta.env.VITE_SUPABASE_URL
    const supaKey = import.meta.env.VITE_SUPABASE_ANON_KEY
    if (!supaUrl || !supaKey) return null
    const base64 = btoa(unescape(encodeURIComponent(txtContent)))
    const year   = month ? month.slice(0,4) : String(new Date().getFullYear())
    const res = await fetch(`${supaUrl}/functions/v1/drive-upload`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${supaKey}` },
      body: JSON.stringify({
        file: base64, fileName, mimeType:'text/plain',
        folder: 'payroll-wps',
        parentFolderId: '1QU1KvkWcxW0SjdHp7nk0ccT6Y176wHLJ',
        year,
      }),
    })
    const data = await res.json()
    return data.success ? data.viewUrl : null
  } catch(e) {
    console.warn('[WPS] Drive upload failed:', e)
    return null
  }
}

async function downloadWPS(items, month, entityName) {
  // WPS = bank-transfer portion ONLY. OUTSOURCED/CONTRACT excluded via _wps_allowed=false.
  const wpsItems = items.filter(i => i._wps_allowed && i._iban)
  if (wpsItems.length === 0) { alert('No WPS-eligible employees (must have IBAN and wps_allowed=true)'); return }
  // WPS transfer = bank portion minus deductions (net bank only — not cash)
  const wpsAmounts = wpsItems.map(it => {
    const bankAmt = it._bank_portion || it.basic_salary || 0
    const dedAmt  = it.deductions || 0
    return Math.max(0, bankAmt - dedAmt)
  })
  const date = month.replace('-','') + '01'
  const { lines, totalAmount, dRowCount } = buildWPSLines(wpsItems, wpsAmounts, date, entityName)

  // Check if any splits happened (totalEmployees vs dRowCount)
  const splitCount = dRowCount - wpsItems.length
  const content    = lines.join('\r\n')
  const fileName   = `WPS_${entityName}_${month}.txt`

  // Download locally
  const blob = new Blob([content], { type:'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)

  // Also upload to Drive (fire-and-forget — don't block the download)
  uploadWPSToDrive(content, fileName, month).then(driveUrl => {
    if (driveUrl) {
      console.log('[WPS] Saved to Drive:', driveUrl)
    }
  })

  // Inform user of split rows
  if (splitCount > 0) {
    alert(`WPS file generated.\n\n⚠️ ${splitCount} transfer(s) exceeded SAR 200,000 and were split into multiple D-rows.\nTotal D-rows: ${dRowCount} for ${wpsItems.length} employees.\nTotal WPS: SAR ${totalAmount.toLocaleString('en',{minimumFractionDigits:2})}`)
  }
}

function downloadGOSI(items, month, entityName) {
  let lines = ['Employee ID,Name,Nationality,Bank Portion,GOSI Rate,GOSI Amount']
  items.forEach(it => {
    lines.push(`${it._emp_no||''},${it._name||''},${it._nationality||'EXPAT'},${n2(it._bank_portion)},${((it._gosi_rate||0)*100).toFixed(0)}%,${n2(it.gosi_amount)}`)
  })
  lines.push(`,,,,TOTAL,${n2(items.reduce((s,i)=>s+(i.gosi_amount||0),0))}`)
  const blob = new Blob([lines.join('\n')], { type:'text/csv' })
  const a    = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`GOSI_${entityName}_${month}.csv`; a.click()
}

export default function Payroll({ entityId }) {
  const [runs,      setRuns]      = useState([])
  const [employees, setEmployees] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selMonth,  setSelMonth]  = useState(new Date().toISOString().slice(0,7))
  const [running,   setRunning]   = useState(false)
  const [preview,   setPreview]   = useState(null)
  const [activeRun, setActiveRun] = useState(null)
  const [viewItems, setViewItems] = useState([])
  const [tab,       setTab]       = useState('generate')
  const [entityName, setEntityName] = useState('RATAL')
  const [allEntities,   setAllEntities]   = useState([])   // { id, name, entity_code }
  const [wpsAllLoading, setWpsAllLoading] = useState(false)
  const [pendingSars,   setPendingSars]   = useState([])   // unacknowledged SAR alerts
  const [sarAckLoading, setSarAckLoading] = useState(null) // id being acknowledged
  // Mudad tracker
  const [mudadSubs,    setMudadSubs]    = useState([])
  const [mudadLoading, setMudadLoading] = useState(false)
  const [mudadForm,    setMudadForm]    = useState({ wps_count:'', gosi_count:'', notes:'', stmt_file:'', submitted_by_name:'Finance' })

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const [{ data:r },{ data:e },{ data:ent },{ data:allEnt },{ data:sarData },{ data:mudadData }] = await Promise.all([
      supabase.from('payroll_runs').select('*').eq('entity_id',entityId).order('payroll_month',{ascending:false}).limit(36),
      supabase.from('employees').select('*').eq('entity_id',entityId).eq('is_active',true).order('full_name'),
      supabase.from('entities').select('entity_name').eq('id',entityId).single(),
      supabase.from('entities').select('id,entity_name,entity_code'),
      supabase.from('staff_action_requests')
        .select('*, employees(full_name,full_name_en,employee_no,employee_number,department_id)')
        .eq('entity_id', entityId)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false }),
      supabase.from('mudad_submissions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(24),
    ])
    setRuns(r||[]); setEmployees(e||[])
    if (ent?.entity_name) setEntityName(ent.entity_name)
    setAllEntities(allEnt||[])
    setPendingSars(sarData||[])
    setMudadSubs(mudadData||[])
    setLoading(false)
  }

  async function acknowledgeSar(sarId) {
    setSarAckLoading(sarId)
    await supabase.from('staff_action_requests').update({
      status:           'ACKNOWLEDGED',
      acknowledged_at:  new Date().toISOString(),
    }).eq('id', sarId)
    setSarAckLoading(null)
    setPendingSars(prev => prev.filter(s => s.id !== sarId))
  }

  async function processSar(sarId, notes) {
    await supabase.from('staff_action_requests').update({
      status:       'PROCESSED',
      payroll_notes: notes || null,
      processed_at:  new Date().toISOString(),
    }).eq('id', sarId)
    setPendingSars(prev => prev.filter(s => s.id !== sarId))
  }

  async function downloadAllEntitiesWPS() {
    if (!selMonth) { alert('Select a payroll month first'); return }
    setWpsAllLoading(true)
    try {
      // Fetch payroll runs for all entities for this month
      const { data: runs3 } = await supabase
        .from('payroll_runs')
        .select('id,entity_id,payroll_month')
        .eq('payroll_month', selMonth)
        .in('entity_id', allEntities.map(e => e.id))

      if (!runs3 || runs3.length === 0) {
        alert(`No saved payroll runs found for ${selMonth}.\nGenerate and save payroll for each entity first.`)
        setWpsAllLoading(false)
        return
      }

      // Fetch all payroll items for those runs
      const { data: allItems } = await supabase
        .from('payroll_items')
        .select('*, employees(full_name,full_name_en,iban,employee_no,employee_number,bank_code,wps_allowed)')
        .in('payroll_run_id', runs3.map(r => r.id))

      const wpsItems = (allItems || []).filter(i =>
        i.employees?.wps_allowed !== false && i.employees?.iban
      )

      if (wpsItems.length === 0) {
        alert('No WPS-eligible employees found (need IBAN + wps_allowed) across all entities for this month.')
        setWpsAllLoading(false)
        return
      }

      // WPS amount = bank portion minus deductions (bank net only)
      const wpsAmounts = wpsItems.map(it => {
        const bankAmt = it.basic_salary || 0   // basic_salary stores bank_portion in payroll_items
        const dedAmt  = it.deductions   || 0
        return Math.max(0, bankAmt - dedAmt)
      })

      // Map items to the shape buildWPSLines expects
      const mappedItems = wpsItems.map(it => ({
        _iban:      it.employees?.iban || '',
        _name:      it.employees?.full_name || it.employees?.full_name_en || '',
        _emp_no:    it.employees?.employee_number || it.employees?.employee_no || '',
        _bank_code: it.employees?.bank_code || '1060',
      }))

      const date = selMonth.replace('-', '') + '01'
      const { lines, totalAmount, dRowCount } = buildWPSLines(mappedItems, wpsAmounts, date, 'RATAL GROUP')
      const splitCount = dRowCount - wpsItems.length
      const content    = lines.join('\r\n')
      const fileName   = `WPS_ALL_ENTITIES_${selMonth}.txt`

      const blob = new Blob([content], { type: 'text/plain' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = fileName
      a.click()
      URL.revokeObjectURL(url)

      // Upload combined file to Drive
      uploadWPSToDrive(content, fileName, selMonth).then(driveUrl => {
        if (driveUrl) console.log('[WPS All] Saved to Drive:', driveUrl)
      })

      if (splitCount > 0) {
        alert(`All-Entities WPS generated.\n\n⚠️ ${splitCount} transfer(s) split (exceeded SAR 200,000).\nTotal D-rows: ${dRowCount} for ${wpsItems.length} employees.\nTotal: SAR ${totalAmount.toLocaleString('en',{minimumFractionDigits:2})}`)
      }
    } finally {
      setWpsAllLoading(false)
    }
  }

  // ─── Mudad Submission Tracker ────────────────────────────────────────────────
  async function submitToMudad() {
    const mo = selMonth
    if (!mo) { alert('Select a payroll month first'); return }
    const wpsCount  = parseInt(mudadForm.wps_count)  || 0
    const gosiCount = parseInt(mudadForm.gosi_count) || 0
    const matched   = wpsCount === gosiCount && wpsCount > 0
    if (!matched) {
      const ok = window.confirm(
        `⚠️ COUNT MISMATCH\n\nWPS employees: ${wpsCount}\nGOSI employees: ${gosiCount}\n\nMismatched counts will cause Mudad rejection.\nProceed anyway?`
      )
      if (!ok) return
    }
    setMudadLoading(true)
    try {
      // Mudad due = 5th of next month (Sunday if Fri/Sat)
      const yr   = +mo.slice(0,4)
      const mnth = +mo.slice(5,7)
      const nextMo = mnth === 12 ? `${yr+1}-01` : `${yr}-${String(mnth+1).padStart(2,'0')}`
      const dueBase = new Date(+nextMo.slice(0,4), +nextMo.slice(5,7)-1, 5)
      const dueDow  = dueBase.getDay()
      const dueAdj  = dueDow===5 ? 2 : dueDow===6 ? 1 : 0
      const dueDate = new Date(dueBase.getTime() + dueAdj*86400000).toISOString().slice(0,10)
      const today   = new Date().toISOString().slice(0,10)
      const stmtFile = mudadForm.stmt_file || `ANB_GOSI_Statement_${mo}.txt`

      // Save to mudad_submissions
      const { data:sub, error } = await supabase.from('mudad_submissions').insert({
        payroll_month:       mo,
        submission_type:     'GOSI',
        due_date:            dueDate,
        wps_employee_count:  wpsCount,
        gosi_employee_count: gosiCount,
        count_matched:       matched,
        statement_file_name: stmtFile,
        submitted_at:        new Date().toISOString(),
        status:              'SUBMITTED',
        notes:               mudadForm.notes || null,
      }).select().single()

      if (error) throw error

      // Generate & upload Mudad log PDF to Drive
      const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
      const moMonth = mo.slice(5,7)
      const moYear  = mo.slice(0,4)
      const moName  = MONTHS_FULL[+moMonth-1] || 'Month'
      const fileName = `Mudad_Submission_Log_${moYear}-${moMonth}.pdf`
      const win = openPrintWindow()
      printDocument('mudad_submission_log', {
        payroll_month:    mo,
        submission_date:  today,
        submitted_by:     mudadForm.submitted_by_name || 'Finance',
        gosi_count:       gosiCount,
        wps_count:        wpsCount,
        total_amount:     displayTotals?.total_net || 0,
        entity_name:      entityName || 'RATAL Advanced Technologies',
        notes:            mudadForm.notes || '',
        status:           'SUBMITTED',
      }, {
        _preWin:       win,
        driveFolder:   'payroll-mudad',
        driveFileName: fileName,
        requestDate:   `${moYear}-${moMonth}-01`,
        orientation:   'portrait',
      })

      // Refresh list & reset form
      setMudadSubs(prev => [{ ...sub, id: sub.id }, ...prev])
      setMudadForm({ wps_count:'', gosi_count:'', notes:'', stmt_file:'', submitted_by_name:'Finance' })
      alert(`✅ Mudad submission recorded for ${mo}.\n\nDue date: ${dueDate}\nCount match: ${matched ? '✅ Yes' : '⚠️ No — review before resubmitting'}\n\nPDF log is being generated and saved to Drive.`)
    } catch(e) {
      alert('Error: ' + (e.message || e))
    } finally {
      setMudadLoading(false)
    }
  }

  async function updateMudadStatus(id, status) {
    await supabase.from('mudad_submissions').update({ status }).eq('id', id)
    setMudadSubs(prev => prev.map(s => s.id===id ? { ...s, status } : s))
  }

  // ─── Print individual payslip (G5) ──────────────────────────────────────────
  function printPayslip(it, serialIdx) {
    const mo      = selMonth || (activeRun?.payroll_month)
    const moYear  = mo ? mo.slice(0,4) : String(new Date().getFullYear())
    const moMonth = mo ? mo.slice(5,7) : String(new Date().getMonth()+1).padStart(2,'0')
    const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const moName     = MONTHS_SHORT[+moMonth-1] || 'Mo'
    const moNameFull = MONTHS_FULL[+moMonth-1]  || 'Month'

    // Pay Slip # — YYYY-MM-EmpNo-Serial
    const empNoRaw = (it._emp?.employee_no||'').replace(/[^0-9]/g,'') || String(serialIdx+1)
    const empNoPad = empNoRaw.padStart(3,'0')
    const serial   = String(serialIdx+1).padStart(4,'0')

    // Drive filename: EMP-001_2026-09_Sep26Slip.pdf
    const empCode  = it._emp?.employee_no || `EMP-${empNoPad}`
    const fileName = `${empCode}_${moYear}-${moMonth}_${moName}${moYear.slice(2)}Slip.pdf`

    const win = openPrintWindow()
    printDocument('salary_slip', {
      employee_code:        it._emp?.employee_no || '',
      employee_name:        it._name || '',
      employee_phone:       it._emp?.mobile_number || it._emp?.phone || '',
      employee_email:       it._emp?.email || '',
      department:           it._emp?.department || it._emp?.dept_name || '',
      designation:          it._emp?.designation || it._emp?.job_title || '',
      nationality:          it._emp?.nationality || it._nationality || '',
      iban:                 it._iban  || it._emp?.iban || '',
      bank_name:            it._bank_name || it._emp?.bank_name || '',
      hire_date:            it._emp?.hire_date || '',
      basic_salary:         it._basic_salary   || 0,
      bank_portion:         it._bank_portion   || it.basic_salary || 0,
      cash_portion:         it._cash_portion   || it.cash_portion || 0,
      housing_allowance:    it.housing_allowance   || 0,
      transport_allowance:  it.transport_allowance || 0,
      food_allowance:       it.food_allowance      || 0,
      other_allowance:      it.other_allowance     || 0,
      ot_amount:            it.ot_amount           || 0,
      gross_salary:         it.gross_salary        || 0,
      gosi_amount:          it.gosi_amount         || 0,
      gosi_rate:            it._gosi_rate          || 0,
      loan_deduction:       it.loan_deduction      || 0,
      penalty_deduction:    it.penalty_deduction   || 0,
      leave_deduction:      it.leave_deduction     || 0,
      advance_deduction:    it.advance_deduction   || 0,
      other_deduction:      it.other_deduction     || 0,
      unpaid_days:          it.unpaid_days         || 0,
      net_salary:           it.net_salary          || 0,
      payroll_month:        mo || '',
      pay_date:             it.pay_date || '',   // actual pay date, e.g. '11 October 2026'
      pay_slip_serial:      serial,
      entity_name:          'RATAL Advanced Technologies',
      entity_address:       'Building 4812, Aghadeer Street Malaz',
      entity_vat:           '310680651700003',
      hr_signatory:         '',   // set to HR manager name when known, e.g. 'Mahmood Shahbaz'
    }, {
      _preWin:       win,
      driveFolder:   'payslips',
      driveFileName: fileName,
      orientation:   'portrait',
      payslipMonth:  moNameFull,   // → Drive: Payroll/2026/September/
    })
  }

  // ─── Print Department Report (groups current displayItems by dept) ──────────
  function printDeptReport(deptName, deptItems) {
    const mo     = selMonth || activeRun?.payroll_month || ''
    const status = activeRun?.status || (preview ? 'PENDING' : 'PENDING')
    const MONTHS_FULL = ['January','February','March','April','May','June','July',
                         'August','September','October','November','December']
    const moMonth = mo ? mo.slice(5,7) : ''
    const moName  = MONTHS_FULL[+moMonth-1] || 'Month'
    const moYear  = mo ? mo.slice(0,4) : String(new Date().getFullYear())
    const safeDept = (deptName||'ALL').replace(/[^a-zA-Z0-9_-]/g,'_')
    const fileName = `DeptReport_${safeDept}_${moYear}-${moMonth}.pdf`
    const win = openPrintWindow()
    printDocument('dept_payroll_report', {
      dept_name:     deptName || 'All Departments',
      payroll_month: mo,
      pay_date:      `30 ${moName} ${moYear}`,
      generated_by:  'Finance',
      status,
      items: deptItems.map(it => ({
        _name:               it._name             || '',
        _emp_no:             it._emp_no            || '',
        _category:           it._category          || it.employee_category || '02',
        basic_salary:        it._basic_salary      || 0,
        housing_allowance:   it.housing_allowance  || 0,
        transport_allowance: it.transport_allowance|| 0,
        mobile_allowance:    it.mobile_allowance   || 0,
        medical_allowance:   it.medical_allowance  || 0,
        technical_allowance: it.technical_allowance|| 0,
        other_allowance:     it.other_allowance    || 0,
        food_allowance:      it.food_allowance     || 0,
        ot_amount:           it.ot_amount          || 0,
        gross_salary:        it.gross_salary       || 0,
        deductions:          it.deductions         || 0,
        net_salary:          it.net_salary         || 0,
        _bank_portion:       it._bank_portion      || it.basic_salary || 0,
        _cash_portion:       it._cash_portion      || it.cash_portion || 0,
        _slip_type:          it._slip_type         || '',
      })),
    }, {
      _preWin:       win,
      driveFolder:   'payroll-dept-reports',
      driveFileName: fileName,
      requestDate:   `${moYear}-${moMonth}-01`,   // → year subfolder auto-created
      orientation:   'landscape',
    })
  }

  // ─── Print Overall All-Departments Summary ───────────────────────────────────
  function printOverallSummary(items) {
    const mo     = selMonth || activeRun?.payroll_month || ''
    const status = activeRun?.status || (preview ? 'PENDING' : 'PENDING')
    const MONTHS_FULL = ['January','February','March','April','May','June','July',
                         'August','September','October','November','December']
    const moMonth = mo ? mo.slice(5,7) : ''
    const moName  = MONTHS_FULL[+moMonth-1] || 'Month'
    const moYear  = mo ? mo.slice(0,4) : String(new Date().getFullYear())
    const fileName = `Overall_Payroll_Summary_${moYear}-${moMonth}.pdf`

    // Group items by department and compute totals per dept
    const deptMap = {}
    items.forEach(it => {
      const dept = (it._emp?.department || it._emp?.dept_name || 'Unassigned')
      if (!deptMap[dept]) deptMap[dept] = { dept_name:dept, headcount:0, total_basic:0,
        total_housing:0, total_transport:0, total_others:0, total_ot:0,
        gross:0, deductions:0, net:0, bank:0, cash:0 }
      const d = deptMap[dept]
      d.headcount++
      d.total_basic     += +(it._basic_salary||0)
      d.total_housing   += +(it.housing_allowance||0)
      d.total_transport += +(it.transport_allowance||0)
      d.total_others    += +(it.mobile_allowance||0)+(+(it.medical_allowance||0))+(+(it.technical_allowance||0))+(+(it.other_allowance||0))+(+(it.food_allowance||0))
      d.total_ot        += +(it.ot_amount||0)
      d.gross           += +(it.gross_salary||0)
      d.deductions      += +(it.deductions||0)
      d.net             += +(it.net_salary||0)
      d.bank            += +(it._bank_portion||it.basic_salary||0)
      d.cash            += +(it._cash_portion||it.cash_portion||0)
    })
    const depts = Object.values(deptMap).sort((a,b) => a.dept_name.localeCompare(b.dept_name))

    const win = openPrintWindow()
    printDocument('overall_payroll_summary', {
      payroll_month: mo,
      pay_date:      `30 ${moName} ${moYear}`,
      generated_by:  'Finance',
      status,
      depts,
    }, {
      _preWin:       win,
      driveFolder:   'payroll-summary',
      driveFileName: fileName,
      requestDate:   `${moYear}-${moMonth}-01`,   // → year subfolder auto-created
      orientation:   'landscape',
    })
  }

  async function generate() {
    if (employees.length===0) { alert('No active employees found for this entity'); return }
    setRunning(true); setPreview(null)

    const start = `${selMonth}-01`
    const end   = `${selMonth}-31`

    // Last day of the selected month (handles 28/29/30/31)
    const monthEnd = new Date(+selMonth.slice(0,4), +selMonth.slice(5,7), 0)
    const endStr   = monthEnd.toISOString().slice(0,10)   // e.g. 2026-10-31

    // Fetch all needed data in parallel
    const [
      { data:otData },
      { data:faData },
      { data:loanData },
      { data:penData },
      { data:leaveData },
    ] = await Promise.all([
      supabase.from('overtime_requests').select('employee_id,total_amount').eq('entity_id',entityId).eq('status','APPROVED').gte('ot_date',start).lte('ot_date',end),
      supabase.from('food_allowances').select('employee_id,total_amount').eq('entity_id',entityId).eq('status','APPROVED').eq('allowance_month',selMonth),
      supabase.from('employee_loans').select('employee_id,monthly_emi').eq('entity_id',entityId).eq('status','ACTIVE'),
      supabase.from('employee_penalties').select('employee_id,amount,penalty_type').eq('entity_id',entityId).eq('deduction_month',selMonth).eq('status','PENDING'),
      // N1: UNPAID leave overlapping this pay period
      supabase.from('vacations')
        .select('employee_id,leave_type,start_date,end_date,days')
        .eq('entity_id', entityId)
        .eq('status', 'APPROVED')
        .eq('leave_type', 'UNPAID')
        .lte('start_date', endStr)   // leave starts before month end
        .gte('end_date', start),     // leave ends after month start
    ])

    // ── Helper: count days of a vacation that fall inside the pay period ───────
    function overlapDays(vacStart, vacEnd) {
      const pStart = new Date(start)
      const pEnd   = new Date(endStr)
      const vStart = new Date(vacStart)
      const vEnd   = new Date(vacEnd)
      const oStart = vStart > pStart ? vStart : pStart
      const oEnd   = vEnd   < pEnd   ? vEnd   : pEnd
      const diff   = Math.round((oEnd - oStart) / 86400000) + 1
      return Math.max(0, diff)
    }

    const items = employees.map(emp => {
      const cat        = emp.employee_category || '02'
      const basicFull  = +(emp.basic_salary        || 0)
      const housingFull= +(emp.housing_allowance   || 0)
      const transFull  = +(emp.transport_allowance  || 0)
      const mobileAllow= +(emp.mobile_allowance    || 0)
      const medAllow   = +(emp.medical_allowance   || 0)
      const techAllow  = +(emp.technical_allowance || 0)
      const other      = +(emp.other_allowance     || 0)
      const otAmt      = (otData||[]).filter(o=>o.employee_id===emp.id).reduce((s,o)=>s+(+o.total_amount||0),0)
      const foodAmt    = (faData||[]).filter(f=>f.employee_id===emp.id).reduce((s,f)=>s+(+f.total_amount||0),0)

      // ── Step 1: resolve basic/housing/transport (EXPAT joining/leaving rules) ──
      let basicSalary = basicFull, housing = housingFull, transport = transFull
      let proRataDays = 30, proRataApplied = false
      if (cat === '02') {
        const expatResult = calcExpatComponents(emp, selMonth, basicFull, housingFull, transFull)
        basicSalary  = expatResult.basic
        housing      = expatResult.housing
        transport    = expatResult.transport
        proRataDays  = expatResult.activeDays
        proRataApplied = expatResult.isPartial
      }

      // ── Step 2: pro-rata for OUTSOURCED / CONTRACT ─────────────────────────
      let proRataFactor = 1
      if (cat === '03' || cat === '04') {
        const pkgFull = basicFull + housingFull + transFull + mobileAllow + medAllow + techAllow + other
        const pr      = calcProRata(emp, selMonth, pkgFull)
        proRataDays   = pr.activeDays
        proRataApplied= pr.isPartial
        proRataFactor = pr.factor
        // Scale all components by factor
        basicSalary = Math.round(basicFull   * proRataFactor)
        housing     = Math.round(housingFull * proRataFactor)
        transport   = Math.round(transFull   * proRataFactor)
      }

      // ── Step 3: bank / cash split ────────────────────────────────────────────
      // Temporarily reconstruct emp with adjusted salary for split calc
      const empForSplit = { ...emp, basic_salary:basicSalary, housing_allowance:housing, transport_allowance:transport,
        mobile_allowance:Math.round(mobileAllow*proRataFactor), medical_allowance:Math.round(medAllow*proRataFactor),
        technical_allowance:Math.round(techAllow*proRataFactor), other_allowance:Math.round(other*proRataFactor) }
      const { bank:bankPortion, cash:cashPortion, slipType, pkg:totalPkg } = calcBankCash(empForSplit)

      // ── Step 4: GOSI (on bank portion only, company borne) ─────────────────
      const rate    = gosiRate(emp)
      const gosiAmt = bankPortion * rate

      // ── Step 5: deductions ──────────────────────────────────────────────────
      const loanEmi   = (loanData||[]).filter(l=>l.employee_id===emp.id).reduce((s,l)=>s+(+l.monthly_emi||0),0)
      const penalties = (penData||[]).filter(p=>p.employee_id===emp.id&&p.penalty_type==='EMPLOYEE_BORNE').reduce((s,p)=>s+(+p.amount||0),0)
      const empLeaves    = (leaveData||[]).filter(l => l.employee_id === emp.id)
      const unpaidDays   = empLeaves.reduce((s, l) => s + overlapDays(l.start_date, l.end_date), 0)
      const leaveDeduction = +(((basicSalary || bankPortion) / 30) * unpaidDays).toFixed(2)
      const totalDeductions = loanEmi + penalties + leaveDeduction

      // ── Step 6: gross & net ─────────────────────────────────────────────────
      const scaledMobile = Math.round(mobileAllow * proRataFactor)
      const scaledMed    = Math.round(medAllow    * proRataFactor)
      const scaledTech   = Math.round(techAllow   * proRataFactor)
      const scaledOther  = Math.round(other       * proRataFactor)
      const gross     = bankPortion + cashPortion + otAmt + foodAmt
      const netSalary = Math.max(0, gross - totalDeductions)

      return {
        employee_id:        emp.id,
        // runtime display fields (prefixed with _)
        _name:              emp.full_name || emp.full_name_en || '',
        _emp_no:            emp.employee_no || emp.id.slice(0,6),
        _iban:              emp.iban || '',
        _bank_name:         emp.bank_name || '',
        _bank_code:         emp.bank_code || '1060',
        _nationality:       emp.nationality || 'EXPAT',
        _wps_allowed:       (cat==='01'||cat==='02') && emp.wps_allowed !== false && !!emp.iban,
        _bank_portion:      bankPortion,
        _cash_portion:      cashPortion,
        _basic_salary:      basicSalary,
        _gosi_rate:         rate,
        _emp:               emp,
        _category:          cat,
        _slip_type:         slipType,
        _pro_rata_days:     proRataDays,
        _pro_rata_applied:  proRataApplied,
        // stored fields (persisted to payroll_items)
        employee_category:    cat,
        entity_code:          emp.entity_code || 'RATAL',
        slip_type:            slipType,
        pro_rata_days:        proRataDays,
        pro_rata_applied:     proRataApplied,
        basic_salary:         bankPortion,        // WPS bank amount
        cash_portion:         cashPortion,
        housing_allowance:    housing,
        transport_allowance:  transport,
        mobile_allowance:     scaledMobile,
        medical_allowance:    scaledMed,
        technical_allowance:  scaledTech,
        food_allowance:       foodAmt,
        other_allowance:      scaledOther,
        ot_amount:            otAmt,
        gross_salary:         gross,
        gosi_amount:          gosiAmt,
        loan_deduction:       loanEmi,
        penalty_deduction:    penalties,
        leave_deduction:      leaveDeduction,
        unpaid_days:          unpaidDays,
        deductions:           totalDeductions,
        net_salary:           netSalary,
        bank_name:            emp.bank_name || null,
        iban:                 emp.iban || null,
      }
    })

    const totals = {
      total_basic:           items.reduce((s,i)=>s+i.basic_salary,0),
      total_allowances:      items.reduce((s,i)=>s+i.housing_allowance+i.transport_allowance+i.food_allowance+i.other_allowance,0),
      total_ot:              items.reduce((s,i)=>s+i.ot_amount,0),
      total_gosi:            items.reduce((s,i)=>s+i.gosi_amount,0),
      total_loan_deductions: items.reduce((s,i)=>s+i.loan_deduction,0),
      total_penalties:       items.reduce((s,i)=>s+i.penalty_deduction,0),
      total_leave_deductions:items.reduce((s,i)=>s+i.leave_deduction,0),
      total_deductions:      items.reduce((s,i)=>s+i.deductions,0),
      total_net:             items.reduce((s,i)=>s+i.net_salary,0),
      total_bank:            items.filter(i=>!['03','04'].includes(i._category||'')).reduce((s,i)=>s+i._bank_portion,0),
      total_cash:            items.reduce((s,i)=>s+i._cash_portion,0),
      employee_count:        items.length,
      wps_count:             items.filter(i=>i._wps_allowed&&i._iban).length,
    }
    setPreview({ items, totals })
    setRunning(false)
    setTab('generate')
  }

  async function saveRun() {
    if (!preview) return
    // Upsert by entity+month
    const { data:existing } = await supabase.from('payroll_runs').select('id').eq('entity_id',entityId).eq('payroll_month',selMonth).single()
    if (existing) { if (!window.confirm(`Payroll for ${selMonth} already exists. Overwrite?`)) return; await supabase.from('payroll_runs').delete().eq('id',existing.id) }

    const { data:run, error } = await supabase.from('payroll_runs').insert({
      entity_id:        entityId,
      payroll_month:    selMonth,
      run_date:         TODAY,
      total_basic:      preview.totals.total_basic,
      total_allowances: preview.totals.total_allowances,
      total_ot:         preview.totals.total_ot,
      total_deductions: preview.totals.total_deductions,
      total_net:        preview.totals.total_net,
      employee_count:   preview.totals.employee_count,
      status:           'DRAFT',
    }).select().single()
    if (error || !run) { alert(error?.message); return }

    const rows = preview.items.map(item => {
      // strip all runtime _ fields before persisting
      const { _name,_iban,_bank_name,_emp_no,_nationality,_wps_allowed,_bank_portion,_gosi_rate,_bank_code,_emp,_category,_slip_type,_pro_rata_days,_pro_rata_applied,_basic_salary,_cash_portion, ...stored } = item
      return { ...stored, payroll_run_id: run.id }
    })
    const { error:e2 } = await supabase.from('payroll_items').insert(rows)
    if (e2) { alert(e2.message); return }
    setPreview(null); load()
  }

  async function viewRun(run) {
    setActiveRun(run)
    const { data } = await supabase.from('payroll_items')
      .select('*, employees(full_name,full_name_en,bank_name,iban,employee_no,nationality,wps_allowed,bank_code,bank_portion,cash_portion,basic_salary,employee_category,payment_mode,bank_fixed_amount,bank_portion_pct,entity_code)')
      .eq('payroll_run_id',run.id)
    setViewItems((data||[]).map(it=>{
      const emp = it.employees || {}
      const cat = it.employee_category || emp.employee_category || '02'
      const bankAmt = it.basic_salary || 0      // basic_salary column stores the bank portion
      const cashAmt = it.cash_portion || 0
      return {
        ...it,
        _name:          emp.full_name || emp.full_name_en || '',
        _emp_no:        emp.employee_no || '',
        _iban:          emp.iban || it.iban || '',
        _bank_name:     emp.bank_name || it.bank_name || '',
        _bank_code:     emp.bank_code || '1060',
        _nationality:   emp.nationality || 'EXPAT',
        _wps_allowed:   (cat==='01'||cat==='02') && emp.wps_allowed !== false && !!emp.iban,
        _bank_portion:  bankAmt,
        _cash_portion:  cashAmt,
        _basic_salary:  emp.basic_salary || 0,
        _gosi_rate:     gosiRate({...emp, employee_category:cat}),
        _emp:           emp,
        _category:      cat,
        _slip_type:     it.slip_type || 'BANK_ONLY',
        _pro_rata_days: it.pro_rata_days || 30,
        _pro_rata_applied: it.pro_rata_applied || false,
      }
    }))
    setTab('generate')
  }

  async function updateRunStatus(id, status) {
    await supabase.from('payroll_runs').update({ status }).eq('id',id)
    load(); setActiveRun(null); setViewItems([])
  }

  const displayItems  = activeRun ? viewItems : (preview?.items||[])
  let displayTotals = null
  if (activeRun) {
    displayTotals = { total_basic:activeRun.total_basic, total_allowances:activeRun.total_allowances, total_ot:activeRun.total_ot, total_deductions:activeRun.total_deductions, total_net:activeRun.total_net, total_gosi:activeRun.total_gosi||0, total_loan_deductions:0, total_penalties:0, total_leave_deductions:0, employee_count:viewItems.length }
  } else if (preview?.totals) {
    displayTotals = preview.totals
  }
  // Live bank / cash breakdown from displayItems
  const bankTotal = displayItems.filter(i=>!['03','04'].includes(i._category||'')).reduce((s,i)=>s+(i._bank_portion||i.basic_salary||0),0)
  const cashTotal = displayItems.reduce((s,i)=>s+(i._cash_portion||i.cash_portion||0),0)
  const wpsCount  = displayItems.filter(i=>i._wps_allowed&&i._iban).length
  // Pre-compute OUTSOURCED/CONTRACT items for the separate section
  const extItems  = displayItems.filter(it => ['03','04'].includes(it._category||it.employee_category||''))
  const mainItems = displayItems.filter(it => !['03','04'].includes(it._category||it.employee_category||''))

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:12, color:'#6b7c93', marginTop:2 }}>Salary runs · GOSI · WPS export · Loan, Penalty & Unpaid Leave deductions</div>
        </div>
      </div>

      {/* ── SAR Alert Panel ─────────────────────────────────────────── */}
      {pendingSars.length > 0 && (
        <div style={{ background:'#fff3e0', border:'1.5px solid #ffb300', borderRadius:12, padding:'14px 18px', marginBottom:18 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
            <span style={{ fontSize:18 }}>⚠️</span>
            <span style={{ fontWeight:800, fontSize:14, color:'#e65100' }}>
              {pendingSars.length} Pending Staff Action {pendingSars.length === 1 ? 'Request' : 'Requests'} — Action Required
            </span>
          </div>
          {pendingSars.map(sar => {
            const emp = sar.employees
            const empName = emp ? (emp.full_name || emp.full_name_en || emp.employee_no || emp.employee_number || '—') : '—'
            const empType = emp?.employee_type || ''
            const keyDate = sar.last_working_day
              ? `Last day: ${sar.last_working_day}`
              : sar.hold_month
              ? `Hold month: ${sar.hold_month}`
              : sar.transfer_to_dept_name
              ? `Transfer to: ${sar.transfer_to_dept_name}`
              : ''
            const actionLabels = {
              RELEASE:'Release / Termination', PAYROLL_HOLD:'Payroll Hold',
              TRANSFER:'Dept Transfer', CONTRACT_EXTENSION:'Contract Extension', TYPE_CHANGE:'Type Change'
            }
            return (
              <div key={sar.id} style={{ background:'#fff', border:'1px solid #ffe082', borderRadius:8, padding:'10px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:200 }}>
                  <span style={{ fontWeight:700, color:'#1a2e3d' }}>{empName}</span>
                  {empType && <span style={{ marginLeft:6, background:'#e3f2fd', color:'#1565C0', borderRadius:4, padding:'1px 7px', fontSize:10, fontWeight:700 }}>{empType}</span>}
                  <span style={{ marginLeft:8, background:'#ede7f6', color:'#6a1b9a', borderRadius:4, padding:'1px 7px', fontSize:10, fontWeight:700 }}>{actionLabels[sar.action_type]||sar.action_type}</span>
                  {keyDate && <span style={{ marginLeft:8, fontSize:12, color:'#c62828', fontWeight:600 }}>{keyDate}</span>}
                </div>
                <div style={{ fontSize:11, color:'#6b7c93', minWidth:160 }}>
                  Submitted by: <strong>{sar.submitted_by_name||sar.submitted_by_email||'—'}</strong>
                  <br/>
                  {new Date(sar.created_at).toLocaleDateString('en-GB')}
                  {sar.department_name && ` · ${sar.department_name}`}
                </div>
                {sar.notes && <div style={{ fontSize:11, color:'#795548', fontStyle:'italic', minWidth:140 }}>"{sar.notes}"</div>}
                <button
                  onClick={() => acknowledgeSar(sar.id)}
                  disabled={sarAckLoading === sar.id}
                  style={{ background:'#2e7d32', color:'#fff', border:'none', borderRadius:7, padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}
                >
                  {sarAckLoading === sar.id ? '…' : '✅ Acknowledge'}
                </button>
              </div>
            )
          })}
          <div style={{ fontSize:11, color:'#a67c00', marginTop:4 }}>
            Acknowledging moves the SAR to "Acknowledged" status. The dept head will see this update on their portal.
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ marginBottom:16 }}>
        <button style={S.tab(tab==='generate')} onClick={()=>setTab('generate')}>⚙️ Generate & Preview</button>
        <button style={S.tab(tab==='history')}  onClick={()=>setTab('history')}>📋 History</button>
        <button style={S.tab(tab==='mudad')}    onClick={()=>setTab('mudad')}>🏛 Mudad / GOSI</button>
      </div>

      {/* ── GENERATE TAB ── */}
      {tab==='generate' && (
        <>
          {/* Controls */}
          <div style={{ ...S.card, padding:'14px 18px', display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
            <div><label style={S.label}>Payroll Month</label>
              <input type="month" style={{ ...S.inp, width:160 }} value={selMonth} onChange={e=>setSelMonth(e.target.value)} /></div>
            <button onClick={generate} disabled={running} style={S.btn()}>
              {running ? '⏳ Calculating…' : '⚙️ Generate Payroll'}
            </button>
            {preview && <>
              <button onClick={saveRun} style={S.btn('#2e7d32')}>💾 Save Draft</button>
              <button onClick={()=>downloadWPS(preview.items,selMonth,entityName)} style={S.btn('#1565C0')}>📤 WPS Export</button>
              <button onClick={()=>downloadGOSI(preview.items,selMonth,entityName)} style={S.btn('#6a1b9a')}>📊 GOSI Report</button>
              <button onClick={()=>printDeptReport(entityName, mainItems)} style={S.btn('#00695c')} title="Department Payroll PDF → Google Drive (Dept_Reports folder)">📄 Dept PDF</button>
              <button onClick={()=>printOverallSummary(displayItems)} style={S.btn('#4a148c')} title="All-Departments Summary PDF → Google Drive (Overall_Summary folder)">📊 Summary PDF</button>
            </>}
            <button
              onClick={downloadAllEntitiesWPS}
              disabled={wpsAllLoading}
              title="Download one ANB-18 WPS file combining all 3 entities (RAT + GWT + ACCSYS) for the selected month"
              style={{ ...S.btn('#37474f'), opacity:wpsAllLoading?0.7:1, whiteSpace:'nowrap' }}
            >
              {wpsAllLoading ? '⏳ Building…' : '🌐 WPS All Entities'}
            </button>
            {activeRun && <>
              <span style={{ fontWeight:700, color:'#00897b', fontSize:13 }}>Viewing: {activeRun.payroll_month}</span>
              <button onClick={()=>downloadWPS(viewItems,activeRun.payroll_month,entityName)} style={S.btn('#1565C0')}>📤 WPS</button>
              <button onClick={()=>downloadGOSI(viewItems,activeRun.payroll_month,entityName)} style={S.btn('#6a1b9a')}>📊 GOSI</button>
              <button onClick={()=>printDeptReport(entityName, mainItems)} style={S.btn('#00695c')} title="Department Report PDF → Drive">📄 Dept PDF</button>
              <button onClick={()=>printOverallSummary(displayItems)} style={S.btn('#4a148c')} title="Overall Summary PDF → Drive">📊 Summary PDF</button>
              {activeRun.status==='DRAFT' && <button onClick={()=>updateRunStatus(activeRun.id,'APPROVED')} style={S.btn('#e65100')}>✅ Approve</button>}
              {activeRun.status==='APPROVED' && <button onClick={()=>updateRunStatus(activeRun.id,'PAID')} style={S.btn('#2e7d32')}>💳 Mark PAID</button>}
              <button onClick={()=>{ setActiveRun(null); setViewItems([]) }} style={S.btn('#aab2bd')}>← Back</button>
            </>}
          </div>

          {/* Payment Calendar */}
          {selMonth && (() => {
            const yr  = +selMonth.slice(0,4)
            const mo  = +selMonth.slice(5,7)
            // Last day of the month
            const lastDay = new Date(yr, mo, 0).getDate()
            // Pay date = last day, pushed to Sunday if Friday(5) or Saturday(6)
            const lastDow  = new Date(yr, mo-1, lastDay).getDay()
            const payOffset = lastDow===5 ? 2 : lastDow===6 ? 1 : 0
            const payDay   = Math.min(lastDay + payOffset, lastDay + 2)
            // WPS submission = 2 days before pay date (bank processing time)
            const wpsDay   = payDay - 2
            // Mudad due = 5th of next month (or following Sunday if 5th is Fri/Sat)
            const mudadBase = new Date(yr, mo, 5)   // 5th of next month (mo is already +1 since 0-indexed)
            const mudadDow  = mudadBase.getDay()
            const mudadDay  = mudadDow===5 ? 7 : mudadDow===6 ? 6 : 5
            const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
            const moLabel = MONTHS_SHORT[mo-1]
            const nxLabel = MONTHS_SHORT[mo % 12]
            const steps = [
              { icon:'📊', label:'Generate Payroll', date:`25 ${moLabel}`, color:'#1565c0', bg:'#e3f2fd', note:'All entities' },
              { icon:'✅', label:'Finance Approval',  date:`26 ${moLabel}`, color:'#00695c', bg:'#e0f2f1', note:'GM sign-off' },
              { icon:'📤', label:'Submit WPS to ANB', date:`${wpsDay} ${moLabel}`, color:'#6a1b9a', bg:'#f3e5f5', note:'Bank processes in 2 days' },
              { icon:'💳', label:'Salary Pay Date',   date:`${payDay} ${moLabel}`, color:'#2e7d32', bg:'#e8f5e9', note:'Employees credited' },
              { icon:'🏛', label:'Mudad / GOSI',      date:`${mudadDay} ${nxLabel}`, color:'#e65100', bg:'#fff3e0', note:'5th next month' },
            ]
            return (
              <div style={{ display:'flex', gap:8, marginBottom:14, overflowX:'auto', paddingBottom:2 }}>
                {steps.map((s,i) => (
                  <div key={i} style={{ flex:1, minWidth:130, background:s.bg, border:`1.5px solid ${s.color}22`, borderRadius:10, padding:'8px 10px', textAlign:'center' }}>
                    <div style={{ fontSize:18 }}>{s.icon}</div>
                    <div style={{ fontSize:10, fontWeight:800, color:s.color, marginTop:2 }}>{s.label}</div>
                    <div style={{ fontSize:12, fontWeight:900, color:s.color, marginTop:1 }}>{s.date}</div>
                    <div style={{ fontSize:9, color:'#6b7c93', marginTop:1 }}>{s.note}</div>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Summary KPIs */}
          {displayTotals && (
            <div style={{ display:'flex', gap:12, marginBottom:16, overflowX:'auto', flexWrap:'nowrap', paddingBottom:2 }}>
              {[
                { label:'Employees',      value:displayTotals.employee_count||displayItems.length, color:'#1565C0', icon:'👤' },
                { label:'Gross Total',    value:SAR((displayTotals.total_basic||0)+(displayTotals.total_allowances||0)+(displayTotals.total_ot||0)), color:'#00897b', icon:'💰' },
                { label:'Deductions',     value:SAR(displayTotals.total_deductions), color:'#c62828', icon:'➖' },
                { label:'NET Payroll',    value:SAR(displayTotals.total_net), color:'#2e7d32', icon:'✅' },
                { label:`WPS Bank (${wpsCount})`, value:SAR(bankTotal), color:'#1565C0', icon:'🏦' },
                { label:'Cash Portion',   value:SAR(cashTotal), color:'#e65100', icon:'💵' },
                { label:'GOSI (Company)', value:SAR(displayTotals.total_gosi), color:'#6a1b9a', icon:'🏛' },
              ].map(c=>(
                <div key={c.label} style={{ ...S.card, flex:1, minWidth:150, marginBottom:0, display:'flex', alignItems:'center', gap:12, padding:'14px 16px' }}>
                  <div style={{ fontSize:24 }}>{c.icon}</div>
                  <div><div style={{ fontSize:14, fontWeight:800, color:c.color }}>{c.value}</div><div style={{ fontSize:11, color:'#6b7c93' }}>{c.label}</div></div>
                </div>
              ))}
            </div>
          )}

          {/* Payroll Table */}
          {displayItems.length > 0 && (
            <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
              <div style={{ background:'linear-gradient(135deg,#00897b,#00acc1)', padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ color:'#fff', fontWeight:700, fontSize:13 }}>
                  {activeRun ? `Payroll — ${activeRun.payroll_month}` : `Preview — ${selMonth}`}
                  {activeRun && <span style={{ marginLeft:10, background:'rgba(255,255,255,0.2)', padding:'2px 10px', borderRadius:6, fontSize:11 }}>{activeRun.status}</span>}
                </span>
                <span style={{ color:'rgba(255,255,255,0.7)', fontSize:11 }}>{displayItems.length} employees</span>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                  <thead>
                    <tr style={{ background:'#1a2e3d' }}>
                      <th style={{ ...S.th, textAlign:'left', position:'sticky', left:0, background:MC, zIndex:1 }}>Employee</th>
                      <th style={S.th}>Nationality</th>
                      <th style={S.th}>Basic</th>
                      <th style={S.th}>Bank (WPS)</th>
                      <th style={S.th}>Cash</th>
                      <th style={S.th}>Housing</th>
                      <th style={S.th}>Transport</th>
                      <th style={S.th}>Food</th>
                      <th style={S.th}>Other</th>
                      <th style={S.th}>OT</th>
                      <th style={{ ...S.th, background:'#00695c' }}>Gross</th>
                      <th style={{ ...S.th, background:'#c62828' }}>Loan Ded.</th>
                      <th style={{ ...S.th, background:'#c62828' }}>Penalty</th>
                      <th style={{ ...S.th, background:'#c62828' }}>Leave Ded.</th>
                      <th style={{ ...S.th, background:'#00897b' }}>NET</th>
                      <th style={{ ...S.th, background:'#5A32D4' }}>GOSI Co.</th>
                      <th style={S.th}>WPS</th>
                      <th style={{ ...S.th, background:'#37474f', minWidth:44 }}>🖨️</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mainItems.map((it,i)=>(
                      <tr key={i} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
                        <td style={{ ...S.td, textAlign:'left', fontWeight:600, color:'#1a2e3d', position:'sticky', left:0, background:i%2===0?'#fff':'#fafbfc', zIndex:1 }}>
                          {it._name}
                          {it._category && (
                            <span style={{ marginLeft:5, padding:'1px 5px', borderRadius:4, fontSize:9, fontWeight:800,
                              background:CAT_BG[it._category]||'#f3e5f5', color:CAT_COLOR[it._category]||'#6a1b9a' }}>
                              {CAT_LABEL[it._category]||it._category}
                            </span>
                          )}
                          {it._pro_rata_applied && <span style={{ marginLeft:4, fontSize:9, color:'#e65100' }}>★ {it._pro_rata_days}/30d</span>}
                        </td>
                        <td style={{ ...S.td, textAlign:'center' }}>
                          <span style={{ padding:'1px 6px', borderRadius:5, fontSize:10, fontWeight:700, background: (it._nationality||'').toUpperCase()==='SAUDI'?'#e8f5e9':'#e3f2fd', color:(it._nationality||'').toUpperCase()==='SAUDI'?'#2e7d32':'#1565C0' }}>
                            {it._nationality||'EXPAT'}
                          </span>
                        </td>
                        <td style={S.td}>{n2(it._basic_salary||0)}</td>
                        <td style={S.td}>{n2(it._bank_portion||it.basic_salary)}</td>
                        <td style={{ ...S.td, color:'#e65100' }}>{n2(it._cash_portion||it.cash_portion||0)}</td>
                        <td style={S.td}>{n2(it.housing_allowance)}</td>
                        <td style={S.td}>{n2(it.transport_allowance)}</td>
                        <td style={S.td}>{n2(it.food_allowance)}</td>
                        <td style={S.td}>{n2(it.other_allowance)}</td>
                        <td style={S.td}>{n2(it.ot_amount)}</td>
                        <td style={{ ...S.td, fontWeight:700, color:'#00695c' }}>{n2(it.gross_salary)}</td>
                        <td style={{ ...S.td, color:'#c62828' }}>{n2(it.loan_deduction)}</td>
                        <td style={{ ...S.td, color:'#c62828' }}>{n2(it.penalty_deduction)}</td>
                        <td style={{ ...S.td, color:'#c62828' }}>
                          {n2(it.leave_deduction||0)}
                          {(it.unpaid_days||0) > 0 && <span style={{ fontSize:9, color:'#aab2bd', marginLeft:2 }}>({it.unpaid_days}d)</span>}
                        </td>
                        <td style={{ ...S.td, fontWeight:800, color:'#00897b', fontSize:12 }}>{n2(it.net_salary)}</td>
                        <td style={{ ...S.td, color:'#5A32D4' }}>{n2(it.gosi_amount)} <span style={{ fontSize:9, color:'#aab2bd' }}>({((it._gosi_rate||0)*100).toFixed(0)}%)</span></td>
                        <td style={{ ...S.td, textAlign:'center' }}>
                          <span style={{ fontSize:12 }}>{it._wps_allowed&&it._iban?'✅':'⛔'}</span>
                        </td>
                        <td style={{ ...S.td, textAlign:'center', padding:'4px 6px' }}>
                          <button
                            onClick={() => printPayslip(it, i)}
                            title="Print Payslip"
                            style={{ background:'#37474f', color:'#fff', border:'none', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:11, fontWeight:700 }}>
                            🖨️
                          </button>
                        </td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    {displayTotals && (
                      <tr style={{ background:'#e0f7fa', borderTop:'2px solid #b2dfdb', fontWeight:800 }}>
                        <td style={{ ...S.td, textAlign:'left', fontWeight:800, position:'sticky', left:0, background:'#e0f7fa', zIndex:1 }}>TOTALS</td>
                        <td style={S.td}></td>
                        <td style={{ ...S.td, fontWeight:700 }}>{n2(displayTotals.total_basic)}</td>
                        <td colSpan={4} style={S.td}></td>
                        <td style={{ ...S.td, fontWeight:700 }}>{n2(displayTotals.total_ot)}</td>
                        <td style={{ ...S.td, fontWeight:800, color:'#00695c' }}>{n2((displayTotals.total_basic||0)+(displayTotals.total_allowances||0)+(displayTotals.total_ot||0))}</td>
                        <td style={{ ...S.td, color:'#c62828', fontWeight:700 }}>{n2(displayTotals.total_loan_deductions)}</td>
                        <td style={{ ...S.td, color:'#c62828', fontWeight:700 }}>{n2(displayTotals.total_penalties)}</td>
                        <td style={{ ...S.td, color:'#c62828', fontWeight:700 }}>{n2(displayTotals.total_leave_deductions||0)}</td>
                        <td style={{ ...S.td, fontWeight:800, color:'#00897b', fontSize:12 }}>{n2(displayTotals.total_net)}</td>
                        <td style={{ ...S.td, color:'#5A32D4', fontWeight:700 }}>{n2(displayTotals.total_gosi)}</td>
                        <td style={S.td}></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* GOSI note */}
              <div style={{ padding:'10px 16px', background:'#f3e5f5', fontSize:11, color:'#5A32D4', borderTop:'1px solid #e1bee7' }}>
                🏛 <strong>GOSI:</strong> Company-borne liability — not deducted from employee net salary.
                Saudi nationals: 9% · Expats: 2% (hazard) · Base: Bank Portion only · OUTSOURCED/CONTRACT: not applicable
              </div>

              {/* ── OUTSOURCED / CONTRACT — separate section ─────────────── */}
              {extItems.length > 0 && (
                <div>
                  <div style={{ background:'linear-gradient(135deg,#e65100,#f57c00)', padding:'8px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ color:'#fff', fontWeight:700, fontSize:12 }}>🏭 OUTSOURCED &amp; CONTRACT — Cash Only · No WPS · No GOSI · Pro-rata Applied</span>
                    <span style={{ color:'rgba(255,255,255,0.8)', fontSize:11 }}>{extItems.length} employees</span>
                  </div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                      <thead>
                        <tr style={{ background:'#bf360c' }}>
                          {['Employee','Type','Agency','Active Days','Basic','Housing','Transport','Other','TOTAL CASH','🖨️'].map((h,idx)=>(
                            <th key={idx} style={{ ...S.th, textAlign:idx===0?'left':'right' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {extItems.map((it,i)=>(
                          <tr key={i} style={{ background:i%2===0?'#fff8f5':'#fff3ec' }}>
                            <td style={{ ...S.td, textAlign:'left', fontWeight:600, color:'#1a2e3d' }}>
                              {it._name}
                              {it._pro_rata_applied && <span style={{ marginLeft:4, fontSize:9, color:'#e65100' }}>★ pro-rata</span>}
                            </td>
                            <td style={{ ...S.td, textAlign:'center' }}>
                              <span style={{ padding:'1px 5px', borderRadius:4, fontSize:9, fontWeight:800,
                                background:CAT_BG[it._category||'03']||'#fff3e0', color:CAT_COLOR[it._category||'03']||'#e65100' }}>
                                {CAT_LABEL[it._category||'03']||'EXT'}
                              </span>
                            </td>
                            <td style={{ ...S.td, fontSize:10, color:'#78909c' }}>{(it._emp&&it._emp.outsource_agency)||'—'}</td>
                            <td style={{ ...S.td, textAlign:'center', color:'#e65100' }}>{it._pro_rata_days||30}/30</td>
                            <td style={S.td}>{n2(it._basic_salary||0)}</td>
                            <td style={S.td}>{n2(it.housing_allowance||0)}</td>
                            <td style={S.td}>{n2(it.transport_allowance||0)}</td>
                            <td style={S.td}>{n2((it.mobile_allowance||0)+(it.medical_allowance||0)+(it.technical_allowance||0)+(it.other_allowance||0)+(it.food_allowance||0))}</td>
                            <td style={{ ...S.td, fontWeight:800, color:'#e65100', fontSize:12 }}>{n2(it.net_salary)}</td>
                            <td style={{ ...S.td, textAlign:'center', padding:'4px 6px' }}>
                              <button onClick={()=>printPayslip(it,i)} style={{ background:'#bf360c', color:'#fff', border:'none', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:11, fontWeight:700 }}>🖨️</button>
                            </td>
                          </tr>
                        ))}
                        <tr style={{ background:'#ffe0b2', fontWeight:800, borderTop:'2px solid #bf360c' }}>
                          <td colSpan={8} style={{ ...S.td, textAlign:'right', fontWeight:700 }}>TOTAL CASH (OUTSOURCED + CONTRACT)</td>
                          <td style={{ ...S.td, fontWeight:800, color:'#e65100', fontSize:12 }}>{n2(extItems.reduce((s,it)=>s+it.net_salary,0))}</td>
                          <td style={S.td}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {!preview && !activeRun && (
            <div style={{ ...S.card, textAlign:'center', padding:50, color:'#aab2bd' }}>
              Select a month and click <strong>Generate Payroll</strong> to calculate salaries, GOSI, loan & penalty deductions
            </div>
          )}
        </>
      )}

      {/* ── HISTORY TAB ── */}
      {tab==='history' && (
        <div style={S.card}>
          {loading ? <div style={{ textAlign:'center', padding:40, color:'#6b7c93' }}>Loading…</div> : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#1a2e3d' }}>
                  {['Month','Employees','Total Net (SAR)','Deductions','OT','Status',''].map(h=>(
                    <th key={h} style={{ ...S.th, textAlign:h===''?'center':'left', padding:'10px 12px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.length===0 && <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No payroll runs yet</td></tr>}
                {runs.map((r,i)=>(
                  <tr key={r.id} style={{ background:i%2===0?'#fff':'#fafbfc', borderBottom:'1px solid #f0f4f8' }}>
                    <td style={{ padding:'10px 12px', fontWeight:800, color:'#1a2e3d' }}>{r.payroll_month}</td>
                    <td style={{ padding:'10px 12px', textAlign:'center' }}>{r.employee_count}</td>
                    <td style={{ padding:'10px 12px', fontWeight:800, color:'#00897b' }}>{SAR(r.total_net)}</td>
                    <td style={{ padding:'10px 12px', color:'#c62828' }}>{SAR(r.total_deductions)}</td>
                    <td style={{ padding:'10px 12px' }}>{SAR(r.total_ot)}</td>
                    <td style={{ padding:'10px 12px' }}>
                      <span style={{ padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700,
                        background: r.status==='PAID'?'#e8f5e9':r.status==='APPROVED'?'#e3f2fd':'#fff3e0',
                        color: r.status==='PAID'?'#2e7d32':r.status==='APPROVED'?'#0277bd':'#e65100' }}>
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding:'10px 12px', textAlign:'center' }}>
                      <button onClick={()=>{ viewRun(r); setTab('generate') }} style={{ ...S.btn('#1565C0'), padding:'5px 12px', fontSize:11 }}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── MUDAD / GOSI TAB ── */}
      {tab==='mudad' && (
        <div>
          {/* Info banner */}
          <div style={{ background:'#fff3e0', border:'1.5px solid #ff8f00', borderRadius:10, padding:'12px 16px', marginBottom:14, fontSize:12, color:'#e65100' }}>
            <strong>⚠️ Mudad Rule:</strong> Submit GOSI statement to Mudad by the <strong>5th of the following month</strong>. If 5th falls on Friday → submit Sunday. The ANB bank statement <strong>.txt file must not be opened or modified</strong> before upload to Mudad.
            <br/><strong>Count Rule:</strong> WPS employee count must equal GOSI employee count. A mismatch causes automatic rejection and an SMS notification to the company.
          </div>

          {/* Submission form */}
          <div style={{ ...S.card, marginBottom:14 }}>
            <div style={{ fontWeight:800, fontSize:14, color:'#e65100', marginBottom:12 }}>🏛 Record Mudad Submission — {selMonth||'Select month above'}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#546e7a', display:'block', marginBottom:4 }}>WPS Employee Count <span style={{ color:'#c62828' }}>*</span></label>
                <input type="number" value={mudadForm.wps_count} onChange={e=>setMudadForm(f=>({...f,wps_count:e.target.value}))}
                  placeholder={String(displayItems.filter(i=>i._wps_allowed&&i._iban).length||'')}
                  style={{ width:'100%', border:'1.5px solid #b0bec5', borderRadius:6, padding:'8px 10px', fontSize:13 }} />
                <div style={{ fontSize:10, color:'#90a4ae', marginTop:2 }}>LOCAL + EXPAT with IBAN only</div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#546e7a', display:'block', marginBottom:4 }}>GOSI Employee Count <span style={{ color:'#c62828' }}>*</span></label>
                <input type="number" value={mudadForm.gosi_count} onChange={e=>setMudadForm(f=>({...f,gosi_count:e.target.value}))}
                  placeholder={String(employees.filter(e=>['01','02'].includes(e.employee_category)).length||'')}
                  style={{ width:'100%', border:'1.5px solid #b0bec5', borderRadius:6, padding:'8px 10px', fontSize:13 }} />
                <div style={{ fontSize:10, color:'#90a4ae', marginTop:2 }}>As shown in Mudad portal</div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#546e7a', display:'block', marginBottom:4 }}>Submitted By</label>
                <input type="text" value={mudadForm.submitted_by_name} onChange={e=>setMudadForm(f=>({...f,submitted_by_name:e.target.value}))}
                  style={{ width:'100%', border:'1.5px solid #b0bec5', borderRadius:6, padding:'8px 10px', fontSize:13 }} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#546e7a', display:'block', marginBottom:4 }}>ANB Statement File Name</label>
                <input type="text" value={mudadForm.stmt_file} onChange={e=>setMudadForm(f=>({...f,stmt_file:e.target.value}))}
                  placeholder={`ANB_GOSI_Statement_${selMonth||'YYYY-MM'}.txt`}
                  style={{ width:'100%', border:'1.5px solid #b0bec5', borderRadius:6, padding:'8px 10px', fontSize:13 }} />
              </div>
              <div style={{ gridColumn:'span 2' }}>
                <label style={{ fontSize:11, fontWeight:700, color:'#546e7a', display:'block', marginBottom:4 }}>Notes / Remarks</label>
                <input type="text" value={mudadForm.notes} onChange={e=>setMudadForm(f=>({...f,notes:e.target.value}))}
                  placeholder="e.g. Submitted via Mudad portal at 10:30 AM"
                  style={{ width:'100%', border:'1.5px solid #b0bec5', borderRadius:6, padding:'8px 10px', fontSize:13 }} />
              </div>
            </div>

            {/* Count match indicator */}
            {mudadForm.wps_count && mudadForm.gosi_count && (
              <div style={{ marginBottom:12, padding:'10px 14px', borderRadius:8,
                background: mudadForm.wps_count===mudadForm.gosi_count?'#e8f5e9':'#ffebee',
                border: `1.5px solid ${mudadForm.wps_count===mudadForm.gosi_count?'#66bb6a':'#ef9a9a'}` }}>
                {mudadForm.wps_count===mudadForm.gosi_count
                  ? <span style={{ color:'#2e7d32', fontWeight:800 }}>✅ Counts match — {mudadForm.wps_count} employees. Safe to submit.</span>
                  : <span style={{ color:'#c62828', fontWeight:800 }}>⚠️ MISMATCH — WPS: {mudadForm.wps_count} vs GOSI: {mudadForm.gosi_count}. Resolve before submitting or Mudad will reject.</span>
                }
              </div>
            )}

            <button onClick={submitToMudad} disabled={mudadLoading||!selMonth}
              style={{ ...S.btn('#e65100'), opacity:mudadLoading?0.7:1 }}>
              {mudadLoading ? '⏳ Recording…' : '🏛 Record Submission + Generate PDF Log'}
            </button>
          </div>

          {/* Quick GOSI count helper */}
          <div style={{ ...S.card, marginBottom:14 }}>
            <div style={{ fontWeight:800, fontSize:13, color:'#1a2e3d', marginBottom:8 }}>📊 GOSI Eligibility — Current Employee List</div>
            <div style={{ display:'flex', gap:12 }}>
              {[
                { label:'LOCAL (01)', count:employees.filter(e=>e.employee_category==='01').length, color:'#1565c0', bg:'#e3f2fd' },
                { label:'EXPAT (02)', count:employees.filter(e=>e.employee_category==='02').length, color:'#6a1b9a', bg:'#f3e5f5' },
                { label:'GOSI Total', count:employees.filter(e=>['01','02'].includes(e.employee_category)).length, color:'#2e7d32', bg:'#e8f5e9' },
                { label:'OUTSOURCED (03)', count:employees.filter(e=>e.employee_category==='03').length, color:'#e65100', bg:'#fff3e0' },
                { label:'CONTRACT (04)', count:employees.filter(e=>e.employee_category==='04').length, color:'#2e7d32', bg:'#e8f5e9' },
                { label:'With IBAN (WPS)', count:employees.filter(e=>e.iban&&['01','02'].includes(e.employee_category)).length, color:'#0277bd', bg:'#e1f5fe' },
              ].map(c=>(
                <div key={c.label} style={{ background:c.bg, border:`1.5px solid ${c.color}33`, borderRadius:8, padding:'10px 14px', textAlign:'center', flex:1, minWidth:100 }}>
                  <div style={{ fontSize:20, fontWeight:900, color:c.color }}>{c.count}</div>
                  <div style={{ fontSize:10, color:c.color, fontWeight:700, marginTop:2 }}>{c.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Submission history */}
          <div style={S.card}>
            <div style={{ fontWeight:800, fontSize:13, color:'#1a2e3d', marginBottom:10 }}>📋 Submission History</div>
            {mudadSubs.length===0
              ? <div style={{ textAlign:'center', padding:24, color:'#aab2bd', fontSize:12 }}>No submissions recorded yet</div>
              : <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                  <thead>
                    <tr style={{ background:'#4a148c' }}>
                      {['Month','Type','WPS','GOSI','Match','Due Date','Submitted','Status','Actions'].map(h=>(
                        <th key={h} style={{ ...S.th, padding:'8px 10px', fontSize:11 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mudadSubs.map((s,i)=>{
                      const stColor = s.status==='CONFIRMED'?'#2e7d32':s.status==='SUBMITTED'?'#1565c0':s.status==='REJECTED'?'#c62828':'#e65100'
                      const stBg    = s.status==='CONFIRMED'?'#e8f5e9':s.status==='SUBMITTED'?'#e3f2fd':s.status==='REJECTED'?'#ffebee':'#fff3e0'
                      return (
                        <tr key={s.id} style={{ background:i%2===0?'#fff':'#faf7ff', borderBottom:'1px solid #f0e6ff' }}>
                          <td style={{ padding:'8px 10px', fontWeight:800 }}>{s.payroll_month}</td>
                          <td style={{ padding:'8px 10px' }}>{s.submission_type}</td>
                          <td style={{ padding:'8px 10px', textAlign:'center', fontWeight:700 }}>{s.wps_employee_count||'—'}</td>
                          <td style={{ padding:'8px 10px', textAlign:'center', fontWeight:700 }}>{s.gosi_employee_count||'—'}</td>
                          <td style={{ padding:'8px 10px', textAlign:'center' }}>{s.count_matched?'✅':'⚠️'}</td>
                          <td style={{ padding:'8px 10px' }}>{s.due_date||'—'}</td>
                          <td style={{ padding:'8px 10px', fontSize:10, color:'#546e7a' }}>{s.submitted_at?new Date(s.submitted_at).toLocaleDateString('en-GB'):'—'}</td>
                          <td style={{ padding:'8px 10px' }}>
                            <span style={{ padding:'2px 8px', borderRadius:10, fontSize:10, fontWeight:800, background:stBg, color:stColor }}>{s.status}</span>
                          </td>
                          <td style={{ padding:'8px 10px', display:'flex', gap:4 }}>
                            {s.status==='SUBMITTED' && (
                              <button onClick={()=>updateMudadStatus(s.id,'CONFIRMED')} style={{ background:'#2e7d32', color:'#fff', border:'none', borderRadius:4, padding:'3px 7px', cursor:'pointer', fontSize:10, fontWeight:700 }}>✅ Confirm</button>
                            )}
                            {s.status==='SUBMITTED' && (
                              <button onClick={()=>updateMudadStatus(s.id,'REJECTED')} style={{ background:'#c62828', color:'#fff', border:'none', borderRadius:4, padding:'3px 7px', cursor:'pointer', fontSize:10, fontWeight:700 }}>❌ Reject</button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
            }
          </div>
        </div>
      )}
    </div>
  )
}
