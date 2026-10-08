/**
 * BulkUpload.jsx — ACCSYS Master Data Bulk Upload
 * Sheets: Employees · Parties · Bank Accounts · Fleet · Sites · Opening Balances
 * Logic: INSERT new records only; skip rows that already exist (matched by key column)
 *        For existing records: fill NULL/empty fields only — never overwrite data
 */

import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ─── Allowed values (for validation hints) ───────────────────────────────────
const ENTITY_CODES = ['ACCSYS','RAT','GWT']
const PARTY_TYPES  = ['CONTRACTOR','SUB_CONTRACTOR','VENDOR','SUPPLIER','LOCAL_SUPPLIER','RENTAL']
const EMP_STATUS   = ['ACTIVE','INACTIVE','LEFT']
const VEH_STATUS   = ['ACTIVE','INACTIVE','SCRAPPED']
const VEH_TYPES    = ['SUV','SEDAN','PICKUP','VAN','BUS','TRUCK','MOTORCYCLE','HEAVY EQUIPMENT','OTHER']
const FUEL_TYPES   = ['PETROL','DIESEL','ELECTRIC','HYBRID']
const SITE_UNITS   = ['NISU','TISU','CISU','ITSU']
const SITE_STATUS  = ['PENDING','MOBILISED','IN_PROGRESS','MATERIAL_WAITING','COMPLETED','SNAGGING','HANDED_OVER','INVOICED']
const DEPT_CODES   = ['TISU','NISU','CISU','ITSU','OFFICE','ACCOUNTS','TRAVELS','SAUDIS']

// Drive photo URL builder
const driveUrl = (fileId) => fileId ? `https://drive.google.com/uc?export=view&id=${fileId.trim()}` : null

const fmt = n => n?.toLocaleString() || '0'

// ─── Sheet configs ────────────────────────────────────────────────────────────
const SHEET_CONFIGS = {
  '👥 Employees': {
    icon: '👥', color: '#5A32D4', table: 'employees',
    matchKey: 'employee_id',                 // CSV col → DB col
    matchDbCol: 'employee_id',
    label: 'Employees',
    requiredCols: ['employee_id','full_name_en','entity_code'],
    colMap: {                                // CSV heading → DB column
      employee_id:           'employee_id',
      full_name_en:          'full_name_en',
      full_name_ar:          'full_name_ar',
      entity_code:           'entity_code',
      department:            'department',
      designation:           'designation',
      category:              'category',
      status:                'status',
      mobile_number:         'mobile_number',
      email_address:         'email_address',
      basic:                 'basic',
      hra:                   'hra',
      conveyance:            'conveyance',
      technical_allowance:   'technical_allowance',
      bank_name:             'bank_name',
      account_number:        'account_number',
      iban:                  'iban',
      payment_type:          'payment_type',
      nationality:           'nationality',
      national_id:           'national_id',
      national_id_expiry:    'national_id_expiry',
      passport_number:       'passport_number',
      passport_expiry:       'passport_expiry',
      ot_allowed:            'ot_allowed',
      loan_allowed:          'loan_allowed',
      food_allowance_eligible:'food_allowance_eligible',
      ticket_eligible:       'ticket_eligible',
      date_of_joining:       'date_of_joining',
      contract_end_date:     'contract_end_date',
      date_of_leaving:       'date_of_leaving',
      remarks:               'remarks',
      // photo handled separately
    },
    boolCols: ['ot_allowed','loan_allowed','food_allowance_eligible','ticket_eligible','wps_allowed'],
    numCols:  ['basic','hra','conveyance','technical_allowance'],
    dateCols: ['date_of_joining','contract_end_date','date_of_leaving','national_id_expiry','passport_expiry'],
  },
  '🏢 Parties': {
    icon: '🏢', color: '#00695C', table: 'contractors',
    matchKey: 'party_code', matchDbCol: 'contractor_code',
    label: 'Parties',
    requiredCols: ['party_code','company_name','party_type','entity_code'],
    colMap: {
      party_code:    'contractor_code',
      company_name:  'contractor_name',
      party_type:    'vendor_type',
      contact_person:'contact_person',
      contact_email: 'contact_email',
      contact_phone: 'contact_phone',
      address:       'address',
      city:          'city',
      vat_number:    'vat_number',
      cr_number:     'cr_number',
      vat_status:    'vat_status',
      entity_code:   'entity_code',
      payment_terms: 'payment_terms',
      currency:      'currency',
      status:        'status',
      portal_name:   'portal_name',
      notes:         'notes',
    },
    boolCols: [],
    numCols:  ['payment_terms'],
    dateCols: [],
  },
  '🏦 Bank Accounts': {
    icon: '🏦', color: '#1565C0', table: 'party_bank_accounts',
    matchKey: null,   // composite: party_code + iban
    label: 'Bank Accounts',
    requiredCols: ['party_code','party_type','account_holder_name','bank_name','iban'],
    colMap: {
      account_holder_name: 'account_name',
      bank_name:           'bank_name',
      iban:                'iban',
      account_number:      'account_number',
      swift_code:          'swift_code',
      currency:            'currency',
      is_primary:          'is_primary',
      is_active:           'is_active',
      notes:               'notes',
    },
    boolCols: ['is_primary','is_active'],
    numCols:  [],
    dateCols: [],
  },
  '🚗 Fleet': {
    icon: '🚗', color: '#E65100', table: 'vehicles',
    matchKey: 'plate_number', matchDbCol: 'plate_number',
    label: 'Fleet',
    requiredCols: ['entity_code','plate_number','make','model'],
    colMap: {
      entity_code:         'entity_code',
      plate_number:        'plate_number',
      make:                'make',
      model:               'model',
      vehicle_type:        'vehicle_type',
      year:                'year',
      color:               'color',
      fuel_type:           'fuel_type',
      driver_name:         'driver_name',
      driver_id_no:        'driver_id_no',
      assigned_department: 'assigned_department',
      ins_expiry:          'ins_expiry',
      mvpi_expiry:         'mvpi_expiry',
      reg_expiry:          'reg_expiry',
      saher_expiry:        'saher_expiry',
      chassis_no:          'chassis_no',
      odometer_reading:    'odometer_reading',
      status:              'status',
      notes:               'notes',
    },
    boolCols: [],
    numCols:  ['year','odometer_reading'],
    dateCols: ['ins_expiry','mvpi_expiry','reg_expiry','saher_expiry'],
  },
  '📍 Sites': {
    icon: '📍', color: '#1B5E20', table: 'site_masters',
    matchKey: 'job_no', matchDbCol: 'job_no',
    label: 'Sites',
    requiredCols: ['entity_code','service_unit','job_no','site_name'],
    colMap: {
      entity_code:          'entity_code',
      service_unit:         'service_unit',
      job_no:               'job_no',
      site_name:            'site_name',
      location:             'location',
      work_type:            'work_type',
      contractor_po:        'contractor_po',
      pm_name:              'pm_name',
      start_date:           'start_date',
      end_date:             'end_date',
      status:               'status',
      budget_team_expenses: 'budget_team_expenses',
      budget_supplier_pos:  'budget_supplier_pos',
      budget_subcon_pos:    'budget_subcon_pos',
      budget_food:          'budget_food',
      budget_overtime:      'budget_overtime',
      budget_petty_cash:    'budget_petty_cash',
      budget_misc:          'budget_misc',
      contractor_po_value:  'contractor_po_value',
      notes:                'notes',
    },
    boolCols: [],
    numCols:  ['budget_team_expenses','budget_supplier_pos','budget_subcon_pos','budget_food','budget_overtime','budget_petty_cash','budget_misc','contractor_po_value'],
    dateCols: ['start_date','end_date'],
  },
  '💼 Opening Balances': {
    icon: '💼', color: '#B71C1C', table: 'opening_balances',
    matchKey: null,   // composite: party_code + balance_type + as_of_date
    label: 'Opening Balances',
    requiredCols: ['party_type','balance_type','amount','entity_code','as_of_date'],
    colMap: {
      party_code_or_emp_id:  'party_code',
      company_or_emp_name:   'party_name',
      party_type:            'party_type',
      balance_type:          'balance_type',
      amount:                'amount',
      currency:              'currency',
      entity_code:           'entity_code',
      as_of_date:            'as_of_date',
      notes:                 'notes',
    },
    boolCols: [],
    numCols:  ['amount'],
    dateCols: ['as_of_date'],
  },
}

// ─── CSV parser (handles quoted fields) ──────────────────────────────────────
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0]).map(h => h.trim())
  return lines.slice(1)
    .map(line => {
      const vals = parseCSVLine(line)
      const row = {}
      headers.forEach((h, i) => { row[h] = (vals[i] || '').trim() })
      return row
    })
    .filter(row => Object.values(row).some(v => v))   // skip blank rows
}

function parseCSVLine(line) {
  const result = []; let cur = ''; let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { inQ = !inQ }
    else if (ch === ',' && !inQ) { result.push(cur); cur = '' }
    else cur += ch
  }
  result.push(cur)
  return result
}

// ─── Sheet detector ───────────────────────────────────────────────────────────
function detectSheetType(headers) {
  if (headers.includes('employee_id') || headers.includes('full_name_en')) return '👥 Employees'
  if (headers.includes('iban') && headers.includes('party_code') && headers.includes('account_holder_name')) return '🏦 Bank Accounts'
  if (headers.includes('balance_type') && headers.includes('as_of_date')) return '💼 Opening Balances'
  if (headers.includes('party_code') || headers.includes('company_name') || headers.includes('party_type')) return '🏢 Parties'
  if (headers.includes('plate_number')) return '🚗 Fleet'
  if (headers.includes('job_no') || headers.includes('service_unit')) return '📍 Sites'
  return null
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BulkUpload({ entityId }) {
  const fileRef = useRef()
  const [uploading,  setUploading]  = useState(false)
  const [results,    setResults]    = useState([])      // per-sheet results
  const [error,      setError]      = useState('')
  const [syncingPho, setSyncingPho] = useState(false)
  const [photoSyncRes, setPhotoSyncRes] = useState(null)
  const [postingOB,   setPostingOB]   = useState(false)
  const [obPostResult, setObPostResult] = useState(null)   // { posted, failed, errors }

  // ── File handler ────────────────────────────────────────────────────────────
  async function handleFile(e) {
    const file = e.target.files?.[0]; if(!file) return
    setError(''); setResults([])

    // We need XLSX parsing — load SheetJS from CDN if not present
    if (!window.XLSX) {
      await new Promise((res, rej) => {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
        s.onload = res; s.onerror = () => rej(new Error('Could not load XLSX parser'))
        document.head.appendChild(s)
      })
    }
    const XLSX = window.XLSX

    const ab = await file.arrayBuffer()
    let wb
    try { wb = XLSX.read(ab, { type:'array', cellDates:true }) }
    catch(err) { setError('Cannot read file — make sure it is .xlsx or .csv'); return }

    setUploading(true)
    const allResults = []

    for (const sheetName of wb.SheetNames) {
      const cfg = SHEET_CONFIGS[sheetName]
      if (!cfg) continue   // skip unknown / instructions sheet

      const ws   = wb.Sheets[sheetName]
      const json = XLSX.utils.sheet_to_json(ws, { defval:'' })

      // Remove example row (if any value contains "Example row")
      const data = json.filter(row =>
        !Object.values(row).some(v => String(v).toLowerCase().includes('example row'))
      )
      if (!data.length) { allResults.push({ sheet:sheetName, cfg, skipped:0, inserted:0, errors:[], total:0 }); continue }

      const res = await processSheet(sheetName, cfg, data)
      allResults.push({ sheet:sheetName, cfg, ...res })
    }

    // Also handle plain CSV (single file, no sheet name)
    if (wb.SheetNames.length === 1 && !SHEET_CONFIGS[wb.SheetNames[0]]) {
      const sheetName = wb.SheetNames[0]
      const ws  = wb.Sheets[sheetName]
      const json= XLSX.utils.sheet_to_json(ws, { defval:'' })
      const headers = json.length ? Object.keys(json[0]) : []
      const detected = detectSheetType(headers)
      if (detected) {
        const cfg = SHEET_CONFIGS[detected]
        const data = json.filter(row => !Object.values(row).some(v => String(v).toLowerCase().includes('example row')))
        const res = await processSheet(detected, cfg, data)
        allResults.push({ sheet: detected, cfg, ...res })
      }
    }

    setResults(allResults)
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  // ── Sheet processor ─────────────────────────────────────────────────────────
  async function processSheet(sheetName, cfg, rows) {
    const errors = []
    let inserted = 0, skipped = 0, updated = 0

    // Fetch entity UUIDs once
    const { data: entities } = await supabase.from('entities').select('id,entity_code')
    const entityMap = {}
    ;(entities||[]).forEach(e => entityMap[e.entity_code] = e.id)

    for (const [rowIdx, row] of rows.entries()) {
      const rowNum = rowIdx + 5   // 4 header rows + example row

      // ── Validate required columns ──────────────────────────────
      const missing = cfg.requiredCols.filter(col => {
        const val = row[col]
        return val === undefined || String(val).trim() === ''
      })
      if (missing.length) {
        errors.push(`Row ${rowNum}: missing required: ${missing.join(', ')}`)
        continue
      }

      // ── Skip example row by key value ──────────────────────────
      const keyVal = cfg.matchKey ? String(row[cfg.matchKey]||'').trim() : null

      try {
        if (sheetName === '🏦 Bank Accounts') {
          await processBankRow(row, entityMap, errors, rowNum)
          inserted++
        } else if (sheetName === '💼 Opening Balances') {
          const r = await processOpeningBalanceRow(row, entityMap, errors, rowNum)
          if (r === 'inserted')     inserted++
          else if (r === 'skipped') skipped++
        } else {
          const r = await processGenericRow(row, cfg, entityMap, errors, rowNum, keyVal)
          if (r === 'inserted')     inserted++
          else if (r === 'skipped') skipped++
          else if (r === 'updated') updated++
        }
      } catch(err) {
        errors.push(`Row ${rowNum}: ${err.message}`)
      }
    }

    return { total: rows.length, inserted, skipped, updated, errors }
  }

  async function processGenericRow(row, cfg, entityMap, errors, rowNum, keyVal) {
    // Check if record exists
    const { data: existing } = await supabase
      .from(cfg.table)
      .select('id')
      .eq(cfg.matchDbCol, keyVal)
      .limit(1)

    if (existing?.length) {
      // Record exists — only fill NULL/empty columns (patch-null strategy)
      const patch = buildRow(row, cfg, entityMap)
      const { data: full } = await supabase.from(cfg.table).select('*').eq('id', existing[0].id).single()
      const nullPatch = {}
      for (const [k, v] of Object.entries(patch)) {
        if (v !== null && v !== undefined && v !== '' && (full[k] === null || full[k] === undefined || full[k] === '')) {
          nullPatch[k] = v
        }
      }
      if (Object.keys(nullPatch).length > 0) {
        await supabase.from(cfg.table).update(nullPatch).eq('id', existing[0].id)
        return 'updated'
      }
      return 'skipped'
    }

    // Insert new record
    const rec = buildRow(row, cfg, entityMap)
    const { error: insErr } = await supabase.from(cfg.table).insert(rec)
    if (insErr) throw new Error(insErr.message)
    return 'inserted'
  }

  async function processBankRow(row, entityMap, errors, rowNum) {
    // Look up party by code
    const partyCode = String(row['party_code']||'').trim()
    const partyType = String(row['party_type']||'').trim()
    const iban      = String(row['iban']||'').trim().replace(/\s/g,'').toUpperCase()
    if (!partyCode || !iban) { errors.push(`Row ${rowNum}: party_code and iban are required`); return }

    // Find contractor/party id
    const { data: parties } = await supabase
      .from('contractors')
      .select('id,entity_id')
      .eq('contractor_code', partyCode)
      .limit(1)

    let partyId   = parties?.[0]?.id   || null
    let entityId2 = parties?.[0]?.entity_id || null

    // If it's an employee IBAN (party_type = EMPLOYEE), look in employees
    if (!partyId && partyType === 'EMPLOYEE') {
      const { data: emps } = await supabase
        .from('employees')
        .select('id,entity_id')
        .eq('employee_id', partyCode)
        .limit(1)
      partyId   = emps?.[0]?.id || null
      entityId2 = emps?.[0]?.entity_id || null
    }

    if (!partyId) { errors.push(`Row ${rowNum}: party "${partyCode}" not found in DB. Import the Parties or Employees sheet first.`); return }

    // Skip if IBAN already exists for this party
    const { data: dup } = await supabase
      .from('party_bank_accounts')
      .select('id')
      .eq('party_id', partyId)
      .eq('iban', iban)
      .limit(1)
    if (dup?.length) return  // duplicate — skip silently

    const isPrimary = ['true','yes','1','TRUE'].includes(String(row['is_primary']||'').trim())
    const isActive  = !['false','no','0','FALSE'].includes(String(row['is_active']||'true').trim())

    // If setting primary, unset existing primary for this party
    if (isPrimary) {
      await supabase
        .from('party_bank_accounts')
        .update({ is_primary: false })
        .eq('party_id', partyId)
    }

    await supabase.from('party_bank_accounts').insert({
      entity_id:    entityId2,
      party_id:     partyId,
      party_type:   partyType,
      contractor_id: partyType !== 'EMPLOYEE' ? partyId : null,
      account_name: String(row['account_holder_name']||'').trim(),
      bank_name:    String(row['bank_name']||'').trim(),
      iban,
      account_number: String(row['account_number']||'').trim()||null,
      swift_code:   String(row['swift_code']||'').trim()||null,
      currency:     String(row['currency']||'SAR').trim(),
      is_primary:   isPrimary,
      is_active:    isActive,
      notes:        String(row['notes']||'').trim()||null,
    })
  }

  async function processOpeningBalanceRow(row, entityMap, errors, rowNum) {
    const partyCode   = String(row['party_code_or_emp_id']||'').trim()
    const partyName   = String(row['company_or_emp_name']||'').trim()
    const partyType   = String(row['party_type']||'').trim().toUpperCase()
    const balanceType = String(row['balance_type']||'').trim().toUpperCase()
    const entityCode  = String(row['entity_code']||'').trim()
    const asOfRaw     = row['as_of_date']
    const asOfDate    = (asOfRaw instanceof Date)
      ? asOfRaw.toISOString().slice(0,10)
      : /^\d{4}-\d{2}-\d{2}$/.test(String(asOfRaw||'').trim()) ? String(asOfRaw).trim() : null
    const amountRaw   = parseFloat(String(row['amount']||'').replace(/,/g,''))

    if (!balanceType || isNaN(amountRaw) || amountRaw <= 0 || !partyType || !entityCode || !asOfDate) {
      errors.push(`Row ${rowNum}: missing or invalid required field (balance_type, amount, party_type, entity_code, as_of_date)`)
      return 'skipped'
    }

    const entityId2 = entityMap[entityCode]
    if (!entityId2) { errors.push(`Row ${rowNum}: entity_code "${entityCode}" not found`); return 'skipped' }

    // Resolve party UUID
    let partyId = null
    if (partyCode) {
      if (partyType === 'EMPLOYEE') {
        const { data: e } = await supabase.from('employees').select('id').eq('employee_id', partyCode).limit(1)
        partyId = e?.[0]?.id || null
      } else {
        const { data: c } = await supabase.from('contractors').select('id').eq('contractor_code', partyCode).limit(1)
        partyId = c?.[0]?.id || null
      }
    }
    // Try by name if code lookup failed
    if (!partyId && partyName) {
      if (partyType === 'EMPLOYEE') {
        const { data: e } = await supabase.from('employees').select('id').ilike('full_name_en', partyName).eq('entity_id', entityId2).limit(1)
        partyId = e?.[0]?.id || null
      } else {
        const { data: c } = await supabase.from('contractors').select('id').ilike('contractor_name', partyName).eq('entity_id', entityId2).limit(1)
        partyId = c?.[0]?.id || null
      }
    }

    // Duplicate check: same party_code + balance_type + as_of_date
    if (partyCode) {
      const { data: dup } = await supabase.from('opening_balances')
        .select('id')
        .eq('entity_id', entityId2)
        .eq('party_code', partyCode)
        .eq('balance_type', balanceType)
        .eq('as_of_date', asOfDate)
        .limit(1)
      if (dup?.length) return 'skipped'
    }

    const rec = {
      entity_id:    entityId2,
      entity_code:  entityCode,
      party_type:   partyType,
      party_code:   partyCode || null,
      party_name:   partyName || null,
      party_id:     partyId,
      balance_type: balanceType,
      amount:       amountRaw,
      currency:     String(row['currency']||'SAR').trim(),
      as_of_date:   asOfDate,
      notes:        String(row['notes']||'').trim() || null,
      je_posted:    false,
    }

    const { error: insErr } = await supabase.from('opening_balances').insert(rec)
    if (insErr) throw new Error(insErr.message)
    return 'inserted'
  }

  function buildRow(row, cfg, entityMap) {
    const rec = {}
    for (const [csvCol, dbCol] of Object.entries(cfg.colMap)) {
      let val = row[csvCol]
      if (val === undefined || val === null) continue
      val = String(val).trim()
      if (val === '') { rec[dbCol] = null; continue }

      if (cfg.boolCols.includes(csvCol)) {
        rec[dbCol] = ['true','yes','1','TRUE'].includes(val) ? true : false
      } else if (cfg.numCols.includes(csvCol)) {
        const n = parseFloat(val.replace(/,/g,''))
        rec[dbCol] = isNaN(n) ? null : n
      } else if (cfg.dateCols.includes(csvCol)) {
        // Accept YYYY-MM-DD or JS Date object from SheetJS
        if (val instanceof Date) { rec[dbCol] = val.toISOString().slice(0,10) }
        else { rec[dbCol] = /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : null }
      } else {
        rec[dbCol] = val
      }
    }

    // Resolve entity_id from entity_code
    const ec = String(row['entity_code']||'').trim()
    if (ec && entityMap[ec]) rec['entity_id'] = entityMap[ec]

    // Photo URL for employees
    if (cfg.table === 'employees' && row['photo_drive_file_id']) {
      const fid = String(row['photo_drive_file_id']).trim()
      if (fid) rec['photo_url'] = driveUrl(fid)
    }

    return rec
  }

  // ── Drive Photo Sync ─────────────────────────────────────────────────────────
  async function syncDrivePhotos() {
    setSyncingPho(true); setPhotoSyncRes(null)
    try {
      // Fetch all employees that have photo_drive_file_id filled but photo_url still null
      // (We use a convention: if photo_url contains drive.google.com it's already synced)
      const { data: emps } = await supabase
        .from('employees')
        .select('id, photo_url, remarks')
        .is('photo_url', null)
        .ilike('remarks', '%photo_drive_file_id:%')

      // Also allow: if remarks contain "photo_drive_file_id:FILE_ID" syntax as a workaround
      // Better approach: scan for employees where we store file_id in a dedicated column
      // For now, we re-fetch all employees and look for photo_drive_file_id pattern
      const { data: allEmps } = await supabase
        .from('employees')
        .select('id, full_name_en, employee_id, photo_url')
        .eq('entity_id', entityId)

      // Real sync would check Drive — here we just report readiness
      const alreadySynced = (allEmps||[]).filter(e => e.photo_url?.includes('drive.google.com')).length
      const missing       = (allEmps||[]).filter(e => !e.photo_url).length

      setPhotoSyncRes({ total: (allEmps||[]).length, synced: alreadySynced, missing })
    } catch(err) {
      setPhotoSyncRes({ error: err.message })
    } finally { setSyncingPho(false) }
  }

  // ── Post Opening Balances ─────────────────────────────────────────────────────
  async function postOpeningBalances() {
    if (!entityId) { alert('No entity selected.'); return }
    setPostingOB(true); setObPostResult(null)
    try {
      const { data, error } = await supabase.rpc('post_opening_balances', { p_entity_id: entityId })
      if (error) throw error
      setObPostResult(data)   // { posted, failed, errors }
    } catch (err) {
      setObPostResult({ posted: 0, failed: 0, errors: [err.message] })
    } finally { setPostingOB(false) }
  }

  const totalInserted = results.reduce((s, r) => s + (r.inserted||0), 0)
  const totalSkipped  = results.reduce((s, r) => s + (r.skipped||0), 0)
  const totalErrors   = results.reduce((s, r) => s + (r.errors?.length||0), 0)

  // Did the last upload include Opening Balances?
  const obResult = results.find(r => r.sheet === '💼 Opening Balances')
  const hasUnpostedOB = obResult && obResult.inserted > 0

  return (
    <div style={{ maxWidth:900, margin:'0 auto', padding:'20px 16px', fontFamily:"'Segoe UI',system-ui,sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ background:'linear-gradient(135deg,#1A2E3D,#2D4A62)', borderRadius:16,
        padding:'24px 28px', marginBottom:20, color:'#fff', display:'flex', alignItems:'center', gap:20 }}>
        <div style={{ fontSize:48, lineHeight:1 }}>📊</div>
        <div>
          <div style={{ fontSize:13, opacity:0.75, marginTop:4 }}>
            Employees · Parties · Bank Accounts (IBANs) · Fleet · Sites · Opening Balances
          </div>
        </div>
        <a href="/ACCSYS_Master_Upload_Template_v2.xlsx" download
          style={{ marginLeft:'auto', background:'rgba(255,255,255,0.12)', border:'1.5px solid rgba(255,255,255,0.3)',
            color:'#fff', borderRadius:10, padding:'10px 18px', fontSize:13, fontWeight:700,
            textDecoration:'none', whiteSpace:'nowrap', cursor:'pointer' }}>
          ⬇ Download Template
        </a>
      </div>

      {/* ── Sheet key ── */}
      <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
        {Object.values(SHEET_CONFIGS).map(cfg=>(
          <span key={cfg.label} style={{ background:cfg.color+'18', color:cfg.color,
            border:`1px solid ${cfg.color}44`, borderRadius:20,
            padding:'5px 14px', fontSize:12, fontWeight:700 }}>
            {cfg.icon} {cfg.label}
          </span>
        ))}
      </div>

      {/* ── How it works ── */}
      <div style={{ background:'#f0f4f8', borderRadius:12, padding:'14px 18px', marginBottom:20, fontSize:13, color:'#1A2E3D', lineHeight:1.7 }}>
        <strong>How it works:</strong> Fill the template and upload. The system matches each row by its key column
        (Employee ID, Party Code, Plate Number, Job No). <strong>New records are inserted.</strong> Existing records:
        only <em>blank / empty fields</em> get filled — your existing data is never overwritten.
        For Bank Accounts, each IBAN is independent — Sub-Contractors can have multiple IBANs,
        and duplicates are automatically skipped.
      </div>

      {/* ── Upload zone ── */}
      <div style={{ border:'2.5px dashed #5A32D4', borderRadius:16, padding:'32px 24px',
        textAlign:'center', background:'#fafbff', marginBottom:20,
        cursor:'pointer', transition:'background 0.2s' }}
        onClick={()=>fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept=".xlsx,.csv" onChange={handleFile} style={{ display:'none' }} />
        <div style={{ fontSize:40, marginBottom:10 }}>📂</div>
        <div style={{ fontSize:17, fontWeight:800, color:'#5A32D4', marginBottom:6 }}>
          {uploading ? '⏳ Processing...' : 'Click to select file or drag & drop'}
        </div>
        <div style={{ fontSize:12, color:'#6B7C93' }}>
          Accepts: ACCSYS Master Upload Template (.xlsx) or individual sheet exported as .csv
        </div>
      </div>

      {error && (
        <div style={{ background:'#fef2f2', border:'1.5px solid #f87171', borderRadius:12,
          padding:'12px 16px', color:'#991b1b', marginBottom:16, fontSize:13 }}>
          ⛔ {error}
        </div>
      )}

      {/* ── Results ── */}
      {results.length > 0 && (
        <>
          <div style={{ background:'#f0fdf4', border:'1.5px solid #86efac', borderRadius:12,
            padding:'14px 18px', marginBottom:16, display:'flex', gap:32, alignItems:'center' }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:28, fontWeight:800, color:'#15803d' }}>{fmt(totalInserted)}</div>
              <div style={{ fontSize:11, color:'#15803d', fontWeight:700 }}>INSERTED</div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:28, fontWeight:800, color:'#1d4ed8' }}>{fmt(totalSkipped)}</div>
              <div style={{ fontSize:11, color:'#1d4ed8', fontWeight:700 }}>SKIPPED (exist)</div>
            </div>
            {totalErrors > 0 && (
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:28, fontWeight:800, color:'#dc2626' }}>{fmt(totalErrors)}</div>
                <div style={{ fontSize:11, color:'#dc2626', fontWeight:700 }}>ERRORS</div>
              </div>
            )}
          </div>

          {results.map(r=>(
            <div key={r.sheet} style={{ border:'1.5px solid #e2e8f0', borderRadius:12,
              marginBottom:12, overflow:'hidden' }}>
              <div style={{ background:r.cfg.color, padding:'10px 16px', display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:18 }}>{r.cfg.icon}</span>
                <span style={{ fontWeight:800, color:'#fff', fontSize:14 }}>{r.cfg.label}</span>
                <span style={{ marginLeft:'auto', color:'rgba(255,255,255,0.8)', fontSize:12 }}>
                  {r.total} rows processed
                </span>
              </div>
              <div style={{ padding:'12px 16px', display:'flex', gap:24, flexWrap:'wrap' }}>
                <div><span style={{ fontWeight:800, color:'#15803d' }}>{r.inserted}</span> <span style={{ fontSize:12, color:'#64748b' }}>inserted</span></div>
                <div><span style={{ fontWeight:800, color:'#1d4ed8' }}>{r.skipped}</span> <span style={{ fontSize:12, color:'#64748b' }}>skipped</span></div>
                {r.updated > 0 && <div><span style={{ fontWeight:800, color:'#92400e' }}>{r.updated}</span> <span style={{ fontSize:12, color:'#64748b' }}>patched</span></div>}
                {r.errors?.length > 0 && (
                  <div style={{ flex:'1 1 100%' }}>
                    <div style={{ fontSize:11, fontWeight:800, color:'#dc2626', marginBottom:6 }}>ERRORS</div>
                    {r.errors.map((err,i)=>(
                      <div key={i} style={{ fontSize:12, color:'#991b1b', background:'#fef2f2',
                        borderRadius:6, padding:'4px 8px', marginBottom:4 }}>
                        ⚠ {err}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── Post Opening Balances ── */}
      <div style={{ border:`1.5px solid ${hasUnpostedOB ? '#ef4444' : '#fca5a5'}`, borderRadius:14,
        padding:'18px 20px', marginTop:16, background: hasUnpostedOB ? '#fff5f5' : '#fafafa' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:10 }}>
          <span style={{ fontSize:28 }}>📒</span>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:800, color:'#b91c1c', fontSize:15 }}>Post Opening Balances as Journal Entries</div>
            <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>
              Creates a double-entry JE for each unposted Opening Balance row. Run once per entity before go-live.
              {hasUnpostedOB && (
                <span style={{ marginLeft:6, fontWeight:700, color:'#dc2626' }}>
                  ✦ {obResult.inserted} row{obResult.inserted !== 1 ? 's' : ''} just uploaded — ready to post.
                </span>
              )}
            </div>
          </div>
          <button
            onClick={postOpeningBalances}
            disabled={postingOB}
            style={{ background: postingOB ? '#e5e7eb' : '#b91c1c', color: postingOB ? '#6b7280' : '#fff',
              border:'none', borderRadius:10, padding:'10px 20px', fontSize:13, fontWeight:800,
              cursor: postingOB ? 'default' : 'pointer', whiteSpace:'nowrap', flexShrink:0 }}
          >
            {postingOB ? '⏳ Posting…' : '📒 Post Opening Balances'}
          </button>
        </div>

        {obPostResult && (
          <div style={{ background: obPostResult.failed > 0 ? '#fff7ed' : '#f0fdf4',
            border:`1px solid ${obPostResult.failed > 0 ? '#fb923c' : '#86efac'}`,
            borderRadius:10, padding:'12px 16px', marginTop:8 }}>
            <div style={{ display:'flex', gap:24, marginBottom: obPostResult.errors?.length ? 10 : 0 }}>
              <div>
                <span style={{ fontSize:22, fontWeight:800, color:'#15803d' }}>{obPostResult.posted}</span>
                <span style={{ fontSize:11, color:'#15803d', fontWeight:700, marginLeft:4 }}>JEs POSTED</span>
              </div>
              {obPostResult.failed > 0 && (
                <div>
                  <span style={{ fontSize:22, fontWeight:800, color:'#dc2626' }}>{obPostResult.failed}</span>
                  <span style={{ fontSize:11, color:'#dc2626', fontWeight:700, marginLeft:4 }}>FAILED</span>
                </div>
              )}
            </div>
            {obPostResult.errors?.length > 0 && (
              <div>
                {obPostResult.errors.map((e,i) => (
                  <div key={i} style={{ fontSize:12, color:'#9a3412', background:'#ffedd5',
                    borderRadius:6, padding:'4px 8px', marginBottom:4 }}>⚠ {e}</div>
                ))}
              </div>
            )}
            {obPostResult.posted > 0 && obPostResult.failed === 0 && (
              <div style={{ fontSize:12, color:'#166534', fontWeight:700 }}>
                ✅ All opening balances posted. Review in Ledger → Journal Entries (source: OPENING_BALANCE).
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Drive Photo Sync ── */}
      <div style={{ border:'1.5px solid #d8b4fe', borderRadius:14, padding:'18px 20px', marginTop:8, background:'#faf5ff' }}>
        <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:10 }}>
          <span style={{ fontSize:28 }}>📸</span>
          <div>
            <div style={{ fontWeight:800, color:'#5A32D4', fontSize:15 }}>Employee Photos — Google Drive Sync</div>
            <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>
              Naming convention: <code style={{ background:'#ede9fe', padding:'1px 6px', borderRadius:4, fontSize:11 }}>EMP-001_Ahmed_AlRashid.jpg</code>
              &nbsp;→ paste Drive File ID in <code style={{ background:'#ede9fe', padding:'1px 6px', borderRadius:4, fontSize:11 }}>photo_drive_file_id</code> column
            </div>
          </div>
        </div>

        <div style={{ background:'#ede9fe', borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:12, color:'#3730a3', lineHeight:1.7 }}>
          <strong>Drive URL format:</strong><br/>
          <code>https://drive.google.com/uc?export=view&id=<span style={{ color:'#7C3AED' }}>YOUR_FILE_ID_HERE</span></code><br/>
          Extract File ID from: <code>https://drive.google.com/file/d/<strong>FILE_ID</strong>/view</code>
        </div>

        <button onClick={syncDrivePhotos} disabled={syncingPho}
          style={{ background:'#5A32D4', color:'#fff', border:'none', borderRadius:10,
            padding:'10px 20px', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          {syncingPho ? '⏳ Checking...' : '🔄 Sync Drive Photos'}
        </button>

        {photoSyncRes && (
          <div style={{ marginTop:12, fontSize:13 }}>
            {photoSyncRes.error
              ? <div style={{ color:'#dc2626' }}>⛔ {photoSyncRes.error}</div>
              : <div style={{ display:'flex', gap:20 }}>
                  <div><strong style={{ color:'#15803d' }}>{photoSyncRes.synced}</strong> <span style={{ color:'#64748b' }}>photos synced</span></div>
                  <div><strong style={{ color:'#dc2626' }}>{photoSyncRes.missing}</strong> <span style={{ color:'#64748b' }}>missing photo_url</span></div>
                  <div><strong style={{ color:'#1d4ed8' }}>{photoSyncRes.total}</strong> <span style={{ color:'#64748b' }}>total employees</span></div>
                </div>
            }
          </div>
        )}
      </div>
    </div>
  )
}
