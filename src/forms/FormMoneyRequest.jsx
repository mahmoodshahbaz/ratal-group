/**
 * MONEY REQUEST FORM  — /forms/money-request  (v3)
 * Public shareable form — no login required, mobile-friendly
 *
 * Header : Date → Department → Employee (DH/PM/Supervisor of that dept)
 * Lines  : Party | Type | Expense Type | Project No | IBAN# (auto) | Amount | Remarks
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { printDocument } from '../lib/templatePrint'
import {
  THEMES, FormPage, Section, Row, Field, InfoStrip,
  inp, SubmitBar, LangBtn, ErrorBanner, SuccessScreen,
} from './formTheme'

const devMode = new URLSearchParams(window.location.search).get('dev') === '1' ||
                localStorage.getItem('accsys_dev_mode') === '1'

const T = THEMES.money

// ── Constants ─────────────────────────────────────────────────────────────────

// Party options shown in each payment line
const PARTY_TYPES = [
  { value: 'Employee',       label: 'Employee'       },
  { value: 'Contractor',     label: 'Contractor'     },
  { value: 'Supplier',       label: 'Supplier'       },
  { value: 'Vendor',         label: 'Vendor'         },
  { value: 'Sub-Contractor', label: 'Sub-Contractor' },
  { value: 'Local Supplier', label: 'Local Supplier' },
  { value: 'Petty Cash',     label: 'Petty Cash'     },
]

// Maps party label → contractors.vendor_type DB value
const VENDOR_TYPE_MAP = {
  'Contractor':     'CONTRACTOR',
  'Supplier':       'SUPPLIER',
  'Vendor':         'VENDOR',
  'Sub-Contractor': 'SUB_CONTRACTOR',
  'Local Supplier': 'LOCAL_SUPPLIER',
}

const TXN_TYPES = [
  { v: 'Cash',          l: 'Cash'          },
  { v: 'Cheque',        l: 'Cheque'        },
  { v: 'Bank-Transfer', l: 'Bank Transfer' },
  { v: 'Online',        l: 'Online'        },
  { v: 'Others',        l: 'Others'        },
]

// Keywords used to identify DH / PM / Supervisor roles from any job-title column
const MANAGER_KEYWORDS = [
  'dh', 'pm', 'supervisor', 'department head', 'project manager', 'manager', 'head',
]

// Fallback list when chart_of_accounts has no EXPENSE rows yet
const DEFAULT_EXPENSE_TYPES = [
  { id: 'TRAVEL',      account_code: 'TRAVEL',      account_name: 'Travel & Transport'    },
  { id: 'FUEL',        account_code: 'FUEL',        account_name: 'Fuel'                  },
  { id: 'MATERIAL',    account_code: 'MATERIAL',    account_name: 'Materials & Supplies'  },
  { id: 'LABOR',       account_code: 'LABOR',       account_name: 'Labor / Wages'         },
  { id: 'UTILITIES',   account_code: 'UTILITIES',   account_name: 'Utilities'             },
  { id: 'MAINTENANCE', account_code: 'MAINTENANCE', account_name: 'Maintenance & Repairs' },
  { id: 'FOOD',        account_code: 'FOOD',        account_name: 'Food & Catering'       },
  { id: 'OFFICE',      account_code: 'OFFICE',      account_name: 'Office Supplies'       },
  { id: 'OTHER',       account_code: 'OTHER',       account_name: 'Other'                 },
]

// Petty Cash IBAN & display name are dept-driven (no lookup needed)
function pettyCashIban(dept) {
  const d = (dept || '').toUpperCase()
  if (d.includes('TISU')) return 'ANB-77'
  if (d.includes('NISU') || d.includes('CISU') || d.includes('ITSU')) return 'ANB-39'
  return ''
}
function pettyCashLabel(dept) {
  const d = (dept || '').toUpperCase()
  if (d.includes('TISU')) return 'Tech-3 (ANB-77)'
  if (d.includes('NISU') || d.includes('CISU') || d.includes('ITSU')) return 'Tech-2 (ANB-39)'
  return 'Petty Cash'
}

// Fixed expense type list for money requests
const MR_EXPENSE_TYPES = [
  { code: 'SUBCON_TRAVEL',   name: 'Sub-Con Team Travelling Expenses' },
  { code: 'MATERIAL_PURCH',  name: 'Material Purchasing'              },
  { code: 'CAR_REPAIRS',     name: 'Car Repairs'                      },
  { code: 'TEAM_MATERIAL',   name: 'Team & Material Expenses'         },
  { code: 'IQAMA_RENEWAL',   name: 'Iqama Renewal'                    },
  { code: 'IQAMA_LEVY',      name: 'Iqama Levy Fees'                  },
  { code: 'PETTY_CASH_EXP',  name: 'Petty Cash'                       },
  { code: 'WATER_VILLA',     name: 'Water for Villa'                  },
  { code: 'WATER_OFFICE',    name: 'Water for Office'                 },
  { code: 'STATIONARY',      name: 'Stationary'                       },
  { code: 'EXCAVATION_FUEL', name: 'Excavation Petrol, Diesel'        },
]

const EMPTY_LINE = {
  party_type: '', party_id: '', party_name: '',
  payment_type: '', expense_type: '', project_id: '',
  iban: '', iban_options: [], amount: '', remarks: '',
}

function isManager(emp) {
  const txt = [emp.designation, emp.job_title, emp.role, emp.position]
    .filter(Boolean).join(' ').toLowerCase()
  return MANAGER_KEYWORDS.some(k => txt.includes(k))
}

function isDH(emp) {
  const txt = (emp?.designation || emp?.job_title || '').toLowerCase()
  return txt.includes('dh') || txt.includes('department head')
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FormMoneyRequest() {

  const [allContractors, setAllContractors] = useState([])
  const [allProjects,    setAllProjects]    = useState([])
  const [expenseAccts,   setExpenseAccts]   = useState([])

  // Department + employee cascade
  const [depts,        setDepts]        = useState([])   // [{id, dept_code, dept_name, dept_head_id, pm_id, supervisor_id, entity_id}]
  const [deptId,       setDeptId]       = useState('')   // selected dept UUID
  const [formEntityId, setFormEntityId] = useState('')   // entity_id resolved from selected dept (handles SUPERADMIN)
  const [deptEmployees,setDeptEmployees]= useState([])   // DH/PM/Supervisor — for Requestor dropdown
  const [lineEmployees,setLineEmployees]= useState([])   // ALL employees in dept — for Payment Lines
  const [deptLoading,  setDeptLoading]  = useState(false)
  const [dataLoading,  setDataLoading]  = useState(false) // loading departments/contractors/projects

  const [lang,      setLang]      = useState('en')
  const [loading,   setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [reqNumber, setReqNumber] = useState('')
  const [error,     setError]     = useState('')

  const [reqDate, setReqDate] = useState(new Date().toISOString().split('T')[0])
  const [dept,    setDept]    = useState('')   // dept_code string (for petty cash logic + DB save)
  const [empId,   setEmpId]   = useState('')
  const [lines,   setLines]   = useState([{ ...EMPTY_LINE }])

  const isAr        = lang === 'ar'
  const totalAmount = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)

  // ── Load reference data on mount — no auth required ──────────────────────
  useEffect(() => { loadData() }, [])

  async function loadData() {
    setDataLoading(true)
    try {
      // Build queries — apply entity filter only when entityId is known
      let deptQ = supabase.from('departments')
        .select('id,dept_code,dept_name,dept_head_id,pm_id,supervisor_id,entity_id')
        .eq('is_active', true).order('dept_code')
      let conQ = supabase.from('contractors')
        .select('id,contractor_name,vendor_type')
        .eq('status', 'ACTIVE').order('contractor_name')
      let projQ = supabase.from('projects')
        .select('id,project_number,project_name,department_id,contract_value')
        .in('status', ['OPEN', 'ACTIVE']).order('project_number')
      let coaQ = supabase.from('chart_of_accounts')
        .select('id,account_code,account_name,account_type')
        .in('account_type', ['EXPENSE', 'ASSET', 'LIABILITY'])
        .eq('is_active', true).order('account_code')

      // No entity filter at load time — formEntityId (from selected dept) handles submit scoping

      const [{ data: deps }, { data: cons }, { data: projs }, { data: coa }] = await Promise.all([
        deptQ, conQ, projQ, coaQ,
      ])
      setDepts(deps || [])
      setAllContractors(cons || [])
      setAllProjects(projs || [])
      setExpenseAccts((coa && coa.length) ? coa : DEFAULT_EXPENSE_TYPES)
    } finally {
      setDataLoading(false)
    }
  }

  // ── Dept change — two parallel fetches ───────────────────────────────────
  // 1. All employees in dept → lineEmployees (for Payment Lines party picker)
  // 2. Tier 1 FK staff → deptEmployees (for Requestor dropdown)
  //    Tier 2 fallback to all dept employees if no FK staff found
  async function onDeptChange(newDeptId) {
    const deptObj  = depts.find(d => d.id === newDeptId)
    const deptCode = deptObj?.dept_code || deptObj?.dept_name || ''
    setDeptId(newDeptId)
    setDept(deptCode)
    setFormEntityId(deptObj?.entity_id || entityId || '')  // fallback to auth entityId
    setEmpId('')
    setDeptEmployees([])
    setLineEmployees([])
    if (!newDeptId) return

    // Re-resolve any existing Petty Cash lines
    setLines(prev => prev.map(l =>
      l.party_type === 'Petty Cash'
        ? { ...l, party_name: pettyCashLabel(deptCode), iban: pettyCashIban(deptCode) }
        : l
    ))

    // ── Load ALL dept employees (for Payment Lines) ───────────────
    supabase.from('employees')
      .select('id,full_name_en,iban')
      .eq('department_id', newDeptId)
      .order('full_name_en')
      .then(({ data }) => setLineEmployees(data || []))

    // ── Load Requestor list (Tier 1: FK staff, Tier 2: fallback) ─
    setDeptLoading(true)
    const roleMap = [
      { id: deptObj?.dept_head_id,  roleLabel: 'Dept Head'  },
      { id: deptObj?.pm_id,         roleLabel: 'PM'         },
      { id: deptObj?.supervisor_id, roleLabel: 'Supervisor' },
    ]
    const fkIds = roleMap.map(r => r.id).filter(Boolean)
    if (fkIds.length > 0) {
      const { data: byFk } = await supabase
        .from('employees').select('id,full_name_en,iban').in('id', fkIds)
      if (byFk && byFk.length > 0) {
        const result = roleMap.filter(r => r.id).map(r => {
          const e = byFk.find(x => x.id === r.id)
          return e ? { ...e, roleLabel: r.roleLabel } : null
        }).filter(Boolean)
        if (result.length > 0) { setDeptEmployees(result); setDeptLoading(false); return }
      }
    }
    // Tier 2 fallback
    const { data: byDept } = await supabase
      .from('employees').select('id,full_name_en,iban')
      .eq('department_id', newDeptId).order('full_name_en')
    setDeptEmployees(byDept ? byDept.map(e => ({ ...e, roleLabel: '' })) : [])
    setDeptLoading(false)
  }

  // ── Line helpers ──────────────────────────────────────────────────────────
  function updateLine(idx, updates) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...updates } : l))
  }

  async function handlePartySelect(idx, partyType, partyId, partyName) {
    // Petty Cash — dept-driven, no lookup
    if (partyType === 'Petty Cash') {
      updateLine(idx, {
        party_type: 'Petty Cash', party_id: '',
        party_name: pettyCashLabel(dept),
        iban: pettyCashIban(dept), iban_options: [],
      })
      return
    }

    // Employee — IBAN from lineEmployees (all dept employees)
    if (partyType === 'Employee') {
      const emp = lineEmployees.find(e => e.id === partyId)
      updateLine(idx, {
        party_type: partyType, party_id: partyId, party_name: partyName,
        iban: emp?.iban || '', iban_options: [],
      })
      return
    }

    // All contractor types — query party_bank_accounts by contractor_id
    updateLine(idx, { party_type: partyType, party_id: partyId, party_name: partyName, iban: '', iban_options: [] })
    if (!partyId) return
    try {
      const { data: banks } = await supabase
        .from('party_bank_accounts')
        .select('id,iban,bank_name,is_primary')
        .eq('contractor_id', partyId)
        .order('is_primary', { ascending: false })
      if (!banks || banks.length === 0) return
      if (banks.length === 1) {
        updateLine(idx, { iban: banks[0].iban, iban_options: [] })
      } else {
        updateLine(idx, { iban: banks[0].iban, iban_options: banks })
      }
    } catch { /* stays blank */ }
  }

  function addLine()       { setLines(prev => [...prev, { ...EMPTY_LINE }]) }
  function removeLine(idx) { if (lines.length > 1) setLines(prev => prev.filter((_, i) => i !== idx)) }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submit(ev) {
    ev.preventDefault()
    if (!dept || !empId) {
      setError(isAr ? 'يرجى اختيار القسم والموظف' : 'Please select department and employee')
      return
    }
    const validLines = lines.filter(l => parseFloat(l.amount) > 0)
    if (!validLines.length) {
      setError(isAr ? 'أضف سطراً واحداً على الأقل بمبلغ' : 'Add at least one line with an amount')
      return
    }
    setLoading(true); setError('')

    // ── Per-line 50% budget check ────────────────────────────────────────────
    const projectAmounts = {}
    validLines.forEach(l => {
      if (l.project_id) {
        projectAmounts[l.project_id] = (projectAmounts[l.project_id] || 0) + (parseFloat(l.amount) || 0)
      }
    })
    for (const [projId, reqAmt] of Object.entries(projectAmounts)) {
      const proj   = allProjects.find(p => p.id === projId)
      const budget = parseFloat(proj?.contract_value) || 0
      if (budget <= 0) continue
      const { data: allLineAmts } = await supabase
        .from('money_request_lines').select('amount, money_request_id').eq('project_id', projId)
      let committed = 0
      if (allLineAmts && allLineAmts.length > 0) {
        const mrIdList = [...new Set(allLineAmts.map(l => l.money_request_id))]
        const { data: activeMRs } = await supabase
          .from('money_requests').select('id').in('id', mrIdList)
          .not('status', 'in', '("REJECTED","CANCELLED","FUNDS_SENT")')
        const activeSet = new Set((activeMRs || []).map(m => m.id))
        committed = allLineAmts.filter(l => activeSet.has(l.money_request_id))
          .reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
      }
      const limit50 = budget * 0.50
      if (committed + reqAmt > limit50) {
        const remaining = Math.max(0, limit50 - committed)
        setError(
          `⚠️ Budget Limit — Project ${proj.project_number || ''}: ` +
          `50% limit is SAR ${limit50.toLocaleString()}, ` +
          `already committed SAR ${committed.toLocaleString()}, ` +
          `available SAR ${remaining.toLocaleString()}. ` +
          `Reduce the amount for this project.`
        )
        setLoading(false); return
      }
    }

    // DH submits → auto-approved; PM/Supervisor → needs DH approval
    const emp    = deptEmployees.find(e => e.id === empId)
    const status = emp?.roleLabel === 'Dept Head' ? 'DH_APPROVED' : 'PENDING'

    // Auto-generate purpose from first line (expense type + party type)
    const firstLine  = validLines[0]
    const expLabel   = MR_EXPENSE_TYPES.find(t => t.code === firstLine.expense_type)?.name || firstLine.expense_type || ''
    const autoPurpose = [expLabel, firstLine.party_type].filter(Boolean).join(' — ') || `${dept} Money Request`

    const { data: hdr, error: hErr } = await supabase.from('money_requests').insert({
      entity_id:       formEntityId || null,
      request_date:    reqDate,
      requested_by:    empId,
      department_id:   deptId,
      department_name: dept,
      purpose:         autoPurpose,
      amount:          totalAmount,
      status,
    }).select('id,request_number').single()

    if (hErr) { setLoading(false); setError(hErr.message); return }

    const lineRows = validLines.map((l, i) => ({
      money_request_id: hdr.id,
      sort_order:       i,
      line_type:        l.payment_type  || null,
      supplier_name:    l.party_name    || null,
      account_code:     l.expense_type  || null,
      iban:             l.iban          || null,
      amount:           parseFloat(l.amount) || 0,
    }))

    const { error: lErr } = await supabase.from('money_request_lines').insert(lineRows)
    if (lErr) { setLoading(false); setError(lErr.message); return }

    // ── Auto-print + Drive save ───────────────────────────────────────────────
    try {
      const reqEmp  = deptEmployees.find(e => e.id === empId)
      const reqName = reqEmp?.full_name_en || ''
      const reqRole = reqEmp?.roleLabel || 'Department Staff'
      const printLines = validLines.map(ln => {
        const exp     = MR_EXPENSE_TYPES.find(t => t.code === ln.expense_type)
        const lineProj = allProjects.find(p => p.id === ln.project_id)
        return {
          party_type:     ln.party_type  || '',
          party_name:     ln.party_name  || '',
          expense_type:   exp?.name      || ln.expense_type || '',
          payment_type:   ln.payment_type || '',
          project_number: lineProj?.project_number || '',
          amount:         parseFloat(ln.amount) || 0,
          iban:           ln.iban        || '',
          remarks:        ln.remarks     || '',
        }
      })
      const projectNumbers = [...new Set(printLines.map(l => l.project_number).filter(Boolean))]
      const mrNo = hdr.request_number || hdr.id
      const [rYr, rMo, rDy] = (reqDate || '').split('-')
      const dateStr = rDy && rMo && rYr ? `${rDy}${rMo}${rYr.slice(2)}` : ''
      printDocument('money_request', {
        request_number:    hdr.request_number  || '',
        request_date:      reqDate             || '',
        department:        dept                || '',
        purpose:           autoPurpose         || '',
        project_numbers:   projectNumbers,
        recipient_name:    'Mahmood Shahbaz',
        recipient_title:   'The General Manager',
        recipient_company: 'Ratal Advanced Technologies',
        requested_by_name: reqName,
        requested_by_role: reqRole,
        lines:             printLines,
      }, {
        driveFolder:   'money-requests',
        driveFileName: `Money Request-${mrNo}-${dateStr}.pdf`,
        mrId:          hdr.id,
        autoRun:       true,
        autoOnly:      true,
        requestDate:   reqDate || '',
      })
    } catch (_) { /* non-critical */ }

    setLoading(false)
    setReqNumber(hdr.request_number || '—')
    setSubmitted(true)
  }

  function reset() {
    setSubmitted(false)
    setDeptId(''); setDept(''); setEmpId('')
    setDeptEmployees([]); setLineEmployees([])
    setLines([{ ...EMPTY_LINE }])
  }

  const langBtn = <LangBtn isAr={isAr} toggle={() => setLang(l => l === 'en' ? 'ar' : 'en')} />

  if (submitted) return (
    <FormPage theme={T} isAr={isAr} langToggle={langBtn}>
      <SuccessScreen theme={T} reqNumber={reqNumber} isAr={isAr} onAnother={reset} />
    </FormPage>
  )

  // Projects shown in lines: filter by department_id UUID (or show unassigned)
  const visibleProjects = deptId
    ? allProjects.filter(p =>
        !p.department_id            // unassigned projects — visible to all
        || p.department_id === deptId  // assigned to selected dept
      )
    : allProjects

  return (
    <FormPage theme={T} isAr={isAr} langToggle={langBtn}>
      {devMode && (
        <div style={{ background:'#fff3e0', border:'2px dashed #fb8c00', borderRadius:8, margin:'12px 12px 0', padding:'10px 14px' }}>
          <div style={{ fontWeight:700, color:'#e65100', fontSize:13, fontFamily:'Arial,sans-serif' }}>
            🛠️ TESTING MODE — not visible in production
          </div>
          <div style={{ fontSize:12, color:'#bf360c', marginTop:4, fontFamily:'Arial,sans-serif' }}>
            Select Department → then choose the requesting PM/Supervisor/DH below.
          </div>
        </div>
      )}
      <form onSubmit={submit}>
        <ErrorBanner msg={error} />

        {/* ── Header fields — responsive grid ── */}
        <Section title={isAr ? 'معلومات مقدم الطلب' : "Requestor's Information"}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px 16px', padding: '4px 0 12px' }}>

            {/* Date */}
            <div>
              <label style={{ display:'block', fontSize:11, color:'#6b7c93', fontWeight:800,
                textTransform:'uppercase', letterSpacing:0.5, marginBottom:5 }}>
                {isAr ? 'التاريخ' : 'Date'} *
              </label>
              <input type="date" style={{ ...inp, padding:'12px 14px', fontSize:14 }}
                value={reqDate} onChange={e => setReqDate(e.target.value)} required />
            </div>

            {/* Department */}
            <div>
              <label style={{ display:'block', fontSize:11, color:'#6b7c93', fontWeight:800,
                textTransform:'uppercase', letterSpacing:0.5, marginBottom:5 }}>
                {isAr ? 'القسم' : 'Department'} *
              </label>
              <select style={{ ...inp, padding:'12px 14px', fontSize:14 }}
                value={deptId} onChange={e => onDeptChange(e.target.value)} required disabled={dataLoading}>
                <option value="">
                  {dataLoading
                    ? (isAr ? 'جاري التحميل…' : 'Loading…')
                    : `-- ${isAr ? 'اختر القسم' : 'Select Department'} --`}
                </option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.dept_code || d.dept_name}</option>)}
              </select>
            </div>

            {/* Requestor */}
            <div>
              <label style={{ display:'block', fontSize:11, color:'#6b7c93', fontWeight:800,
                textTransform:'uppercase', letterSpacing:0.5, marginBottom:5 }}>
                {isAr ? 'مقدم الطلب' : 'Requested By'} *
              </label>
              <select style={{ ...inp, padding:'12px 14px', fontSize:14,
                opacity: deptId ? 1 : 0.6, background: deptId ? '#fff' : '#f8fafd' }}
                value={empId} onChange={e => setEmpId(e.target.value)}
                required disabled={!deptId || deptLoading}>
                <option value="">
                  {deptLoading ? (isAr ? 'جاري التحميل…' : 'Loading…')
                    : deptId ? `-- ${isAr ? 'اختر' : 'Select Person'} --`
                    : (isAr ? '← اختر القسم أولاً' : '← Select dept first')}
                </option>
                {deptEmployees.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.full_name_en}{e.roleLabel ? ` (${e.roleLabel})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Section>

        {/* ── Request Lines ── */}
        <Section title={isAr ? 'بنود الطلب' : 'Request Lines'}>

          {lines.map((line, idx) => (
            <LineCard
              key={idx} idx={idx} line={line}
              employees={lineEmployees}
              contractors={allContractors}
              projects={visibleProjects}
              dept={dept} isAr={isAr}
              onUpdate={u => updateLine(idx, u)}
              onPartySelect={(pt, pid, pn) => handlePartySelect(idx, pt, pid, pn)}
              onRemove={() => removeLine(idx)}
              canRemove={lines.length > 1}
              theme={T}
            />
          ))}

          <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <button type="button" onClick={addLine} style={{
              background: T.bg, color: T.color, border: `1.5px solid ${T.color}`,
              borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'Arial,sans-serif', flex: 1,
            }}>
              + {isAr ? 'إضافة سطر' : 'Add Line'}
            </button>
            {totalAmount > 0 && (
              <div style={{ background: T.bg, color: T.color, border: `1.5px solid ${T.color}`,
                borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 800,
                textAlign: 'center', minWidth: 160 }}>
                {isAr ? 'الإجمالي' : 'Total'}: SAR {totalAmount.toFixed(2)}
              </div>
            )}
          </div>
        </Section>

        <SubmitBar theme={T}
          label={isAr ? 'إرسال الطلب المالي' : 'Submit Money Request'}
          loading={loading} />
      </form>
    </FormPage>
  )
}

// ── LineCard — mobile-first card layout ───────────────────────────────────────
function LineCard({ idx, line, employees, contractors, projects, dept, isAr, onUpdate, onPartySelect, onRemove, canRemove, theme: T }) {
  const s = { ...inp, padding: '10px 12px', fontSize: 13 }
  const lbl = { display: 'block', fontSize: 10, color: '#6b7c93', fontWeight: 800,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }

  const vendorType       = VENDOR_TYPE_MAP[line.party_type]
  const partyContractors = vendorType
    ? contractors.filter(c => (c.vendor_type || 'CONTRACTOR') === vendorType)
    : []

  return (
    <div style={{
      margin: '0 0 12px 0', border: `1.5px solid ${idx % 2 === 0 ? '#e3edf7' : '#f0e6ff'}`,
      borderRadius: 12, background: idx % 2 === 0 ? '#f8fbff' : '#fdf8ff', overflow: 'hidden',
    }}>
      {/* Card header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: idx % 2 === 0 ? '#e3edf7' : '#e9d5ff',
        padding: '8px 14px' }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#374151' }}>
          {isAr ? `سطر ${idx + 1}` : `Line ${idx + 1}`}
          {line.amount ? ` — SAR ${parseFloat(line.amount).toLocaleString()}` : ''}
        </span>
        {canRemove && (
          <button type="button" onClick={onRemove}
            style={{ background: '#fee2e2', border: 'none', color: '#b91c1c', borderRadius: 6,
              padding: '4px 10px', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>
            {isAr ? '✕ حذف' : '✕ Remove'}
          </button>
        )}
      </div>

      {/* Card body — 2 cols on tablet+, 1 col on mobile */}
      <div style={{ padding: '12px 14px', display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px 14px' }}>

        {/* Party Type */}
        <div>
          <label style={lbl}>{isAr ? 'نوع الطرف' : 'Party Type'} *</label>
          <select style={s} value={line.party_type}
            onChange={e => onPartySelect(e.target.value, '', '')}>
            <option value="">{isAr ? '-- اختر --' : '-- Select --'}</option>
            {PARTY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>

        {/* Party Name — context-aware */}
        <div>
          <label style={lbl}>{isAr ? 'الاسم' : 'Name / Party'} *</label>
          {line.party_type === 'Employee' && (
            <select style={s} value={line.party_id}
              onChange={e => {
                const emp = employees.find(x => x.id === e.target.value)
                onPartySelect('Employee', e.target.value, emp?.full_name_en || '')
              }}>
              <option value="">{isAr ? '-- اختر موظف --' : '-- Select Employee --'}</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name_en}</option>)}
            </select>
          )}
          {vendorType && (
            <select style={s} value={line.party_id}
              onChange={e => {
                const c = contractors.find(x => x.id === e.target.value)
                onPartySelect(line.party_type, e.target.value, c?.contractor_name || '')
              }}>
              <option value="">{isAr ? '-- اختر --' : '-- Select --'}</option>
              {partyContractors.map(c => <option key={c.id} value={c.id}>{c.contractor_code ? `[${c.contractor_code}] ` : ''}{c.contractor_name}</option>)}
            </select>
          )}
          {line.party_type === 'Petty Cash' && (
            <div style={{ ...s, background: '#e8f5e9', color: '#2e7d32', fontWeight: 800,
              border: '1.5px solid #a5d6a7', borderRadius: 8, display: 'flex', alignItems: 'center', minHeight: 44 }}>
              🏦 {line.party_name || pettyCashLabel(dept)}
            </div>
          )}
          {!line.party_type && (
            <div style={{ ...s, background: '#f8fafc', color: '#94a3b8', borderRadius: 8, display: 'flex', alignItems: 'center', minHeight: 44 }}>
              {isAr ? '← اختر النوع أولاً' : '← Select type first'}
            </div>
          )}
        </div>

        {/* Txn Type */}
        <div>
          <label style={lbl}>{isAr ? 'نوع المعاملة' : 'Txn Type'}</label>
          <select style={s} value={line.payment_type} onChange={e => onUpdate({ payment_type: e.target.value })}>
            <option value="">{isAr ? '-- اختر --' : '-- Select --'}</option>
            {TXN_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
          </select>
        </div>

        {/* Expense Type */}
        <div>
          <label style={lbl}>{isAr ? 'نوع المصروف' : 'Expense Type'} *</label>
          <select style={s} value={line.expense_type} onChange={e => onUpdate({ expense_type: e.target.value })}>
            <option value="">{isAr ? '-- اختر --' : '-- Select --'}</option>
            {MR_EXPENSE_TYPES.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
        </div>

        {/* Project */}
        <div>
          <label style={lbl}>{isAr ? 'المشروع' : 'Project'} *</label>
          <select style={s} value={line.project_id} onChange={e => onUpdate({ project_id: e.target.value })}>
            <option value="">{isAr ? '-- اختر مشروعاً --' : '-- Select Project --'}</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.project_number ? `[${p.project_number}] ` : ''}{p.project_name}
              </option>
            ))}
          </select>
        </div>

        {/* IBAN */}
        <div>
          <label style={lbl}>IBAN / Account</label>
          {line.iban_options && line.iban_options.length > 1 ? (
            <select style={{ ...s, background: '#e8f5e9' }}
              value={line.iban} onChange={e => onUpdate({ iban: e.target.value })}>
              {line.iban_options.map(b => (
                <option key={b.id} value={b.iban}>
                  {b.iban}{b.bank_name ? ` — ${b.bank_name}` : ''}{b.is_primary ? ' ★' : ''}
                </option>
              ))}
            </select>
          ) : (
            <input style={{ ...s, background: line.iban ? '#e8f5e9' : undefined,
              fontFamily: line.iban ? 'monospace' : 'inherit', fontWeight: line.iban ? 700 : 400 }}
              value={line.iban} placeholder={isAr ? 'تلقائي / SA...' : 'Auto-filled / SA…'}
              onChange={e => onUpdate({ iban: e.target.value })} />
          )}
        </div>

        {/* Amount */}
        <div>
          <label style={lbl}>{isAr ? 'المبلغ (ريال)' : 'Amount (SAR)'} *</label>
          <input type="number" step="0.01" min="0"
            style={{ ...s, textAlign: 'right', fontSize: 15, fontWeight: 800,
              color: '#0f172a', background: line.amount ? '#fffbeb' : undefined }}
            value={line.amount} placeholder="0.00"
            onChange={e => onUpdate({ amount: e.target.value })} />
        </div>

        {/* Remarks */}
        <div>
          <label style={lbl}>{isAr ? 'ملاحظات' : 'Remarks'}</label>
          <input style={s} value={line.remarks}
            placeholder={isAr ? 'ملاحظة اختيارية...' : 'Optional notes…'}
            onChange={e => onUpdate({ remarks: e.target.value })} />
        </div>
      </div>
    </div>
  )
}
