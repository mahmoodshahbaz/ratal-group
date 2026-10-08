import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { printDocument } from '../lib/templatePrint'
import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import FormWizard from '../components/FormWizard'
import { GROUP_COLORS, getChapterPalette, BACK_BTN_COLOR, btn, inputStyle, labelStyle, sectionLabel, fieldRow, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'

const MC = GROUP_COLORS.Operations   // Money Requests lives in Operations chapter

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  inp:   { width:'100%', padding:'9px 11px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box' },
  label: { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4 },
  row:   { display:'flex', gap:12, marginBottom:13, flexWrap:'wrap' },
  col:   { flex:1, minWidth:130 },
  sec:   { fontSize:11, fontWeight:800, color:'#0D5C4E', marginBottom:8, marginTop:4, paddingBottom:4, borderBottom:'1px solid #E1F5EE', letterSpacing:1, textTransform:'uppercase' },
  btn:   (bg, color) => ({ background:bg, color, border:'none', borderRadius:8, padding:'8px 16px', cursor:'pointer', fontSize:13, fontWeight:700 }),
  card:  { background:'#fff', borderRadius:14, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', overflow:'hidden' },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modal:   { background:'#fff', borderRadius:16, padding:28, width:740, maxWidth:'100%', maxHeight:'92vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.18)' },
  drawer:  { background:'#fff', borderRadius:16, padding:28, width:960, maxWidth:'100%', maxHeight:'95vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.18)' },
  chip:    (bg, color) => ({ background:bg, color, borderRadius:6, padding:'3px 9px', fontSize:11, fontWeight:700, whiteSpace:'nowrap', display:'inline-block' }),
}

// ─── Constants ────────────────────────────────────────────────────────────────
// ─── Money-Request form constants ────────────────────────────────────────────
// Party types used in the Distribution rows
const PARTY_TYPES = ['EMPLOYEE', 'VENDOR', 'SUBCON', 'OTHER']

// Internal MR form party types
const MR_PARTY_TYPES = [
  { value: 'Employee',       label: 'Employee'          },
  { value: 'Sub-Contractor', label: 'Sub-Contractor'    },
  { value: 'Supplier',       label: 'Supplier'          },
  { value: 'Local-Supplier', label: 'Local Supplier'    },
  { value: 'Government',     label: 'Government Payment'},
  { value: 'ANB-77',         label: 'ANB-77 (Tech-3)'   },
  { value: 'ANB-39',         label: 'ANB-39 (Tech-2)'   },
  { value: 'Others',         label: 'Others'            },
]
// Maps party type → contractors.vendor_type for DB lookup
const MR_VENDOR_TYPE_MAP = {
  'Sub-Contractor': 'SUB_CONTRACTOR',
  'Supplier':       'SUPPLIER',
  'Local-Supplier': 'LOCAL_SUPPLIER',
}
// Transaction types — how the money will be paid
const MR_PAYMENT_TYPES = [
  { v: 'Cash',          l: 'Cash'           },
  { v: 'Cheque',        l: 'Cheque'         },
  { v: 'Bank-Transfer', l: 'Bank Transfer'  },
  { v: 'Online',        l: 'Online'         },
  { v: 'Others',        l: 'Others'         },
]
// Expense types keyed by party type
const MR_EXPENSE_TYPES_BY_PARTY = {
  'Employee': [
    { code: 'TEAM_TRAVEL',         name: 'Team Travelling Expenses'  },
    { code: 'LOCAL_PAYMENT',       name: 'Local Payments'            },
    { code: 'MATERIAL_PURCH',      name: 'Material Purchases'        },
    { code: 'PER_DIEM',            name: 'Per Diem / Daily Allowance'},
    { code: 'ACCOMMODATION',       name: 'Accommodation'             },
    { code: 'TRANSPORT',           name: 'Transportation / Fuel'     },
    { code: 'MOBILE_TOPUP',        name: 'Mobile Top-Up'             },
    { code: 'OFFICE_EXP',          name: 'Office Expenses'           },
    { code: 'CAR_REPAIRS',         name: 'Car Repairs'               },
    { code: 'OTHER_EMP',           name: 'Other'                     },
  ],
  'Sub-Contractor': [
    { code: 'ADVANCE_PAY',         name: 'Advance Payment'           },
    { code: 'MOBILIZATION',        name: 'Mobilization Payment'      },
    { code: 'PARTIAL_PAY',         name: 'Partial Payment'           },
    { code: 'OUTSTANDING_PAY',     name: 'Outstanding Payment'       },
    { code: 'FINAL_SETTLEMENT',    name: 'Final Settlement'          },
  ],
  'Supplier': [
    { code: 'MATERIAL_PURCH',      name: 'Material Purchases'        },
    { code: 'ADVANCE_PAY',         name: 'Advance Payment'           },
    { code: 'PAY_AGAINST_SUPPLY',  name: 'Payment Against Supply'    },
    { code: 'PENDING_PAY',         name: 'Pending Payment'           },
    { code: 'PROGRESSIVE_PAY',     name: 'Progressive Payment'       },
    { code: 'FINAL_SETTLEMENT',    name: 'Final Settlement'          },
  ],
  'Local-Supplier': [
    { code: 'MATERIAL_PURCH',      name: 'Material Purchases'        },
    { code: 'ADVANCE_PAY',         name: 'Advance Payment'           },
    { code: 'PAY_AGAINST_SUPPLY',  name: 'Payment Against Supply'    },
    { code: 'PENDING_PAY',         name: 'Pending Payment'           },
    { code: 'FINAL_SETTLEMENT',    name: 'Final Settlement'          },
  ],
  'Government': [
    { code: 'IQAMA_LEVY',          name: 'IQAMA Levy'                },
    { code: 'IQAMA_RENEWAL',       name: 'IQAMA Renewal'             },
    { code: 'PROFESSION_CHG',      name: 'Profession Change'         },
    { code: 'VAT',                 name: 'VAT'                       },
    { code: 'ZAKAT',               name: 'Zakat'                     },
    { code: 'MUQEEM',              name: 'Muqeem'                    },
    { code: 'EXIT_REENTRY',        name: 'Exit / Re-entry'           },
    { code: 'PENALTIES',           name: 'Penalties'                 },
    { code: 'OTHER_GOV',           name: 'Other Government Fee'      },
  ],
  'ANB-77': [
    { code: 'PETTY_CASH_EXP',      name: 'Petty Cash'                },
    { code: 'LOCAL_PAYMENT',       name: 'Local Payments'            },
  ],
  'ANB-39': [
    { code: 'PETTY_CASH_EXP',      name: 'Petty Cash'                },
    { code: 'LOCAL_PAYMENT',       name: 'Local Payments'            },
  ],
  'Others': [
    { code: 'OTHER',               name: 'Other / Miscellaneous'     },
  ],
}

const BANK_ACCOUNTS = ['ANB-15','ANB-18','ANB-39','ANB-77','ANB-11','ANB-13','ANB-29']

const STAGES = [
  { key:'PENDING',          label:'Pending',         bg:'#fff3e0', color:'#e65100' },
  { key:'DH_APPROVED',      label:'DH Approved',     bg:'#e3f2fd', color:'#0277bd' },
  { key:'DH_REJECTED',      label:'DH Rejected',     bg:'#ffebee', color:'#c62828' },
  { key:'ACCTS_PENDING', label:'Accts Pending',   bg:'#f3e5f5', color:'#6a1b9a' },
  { key:'FIN_PENDING',      label:'Finance Pending', bg:'#f3e5f5', color:'#6a1b9a' },
  { key:'FUNDS_SENT',       label:'Funds Sent',      bg:'#e8f5e9', color:'#2e7d32' },
  { key:'ISSUED',           label:'Issued',          bg:'#e8f5e9', color:'#2e7d32' },
  { key:'PARTIALLY_ISSUED', label:'Part. Issued',    bg:'#fff8e1', color:'#f57f17' },
  { key:'DH_ACKNOWLEDGED',  label:'DH Acknowledged', bg:'#e0f7fa', color:'#006064' },
  { key:'DISTRIBUTION',     label:'Distributing',    bg:'#fff8e1', color:'#f57f17' },
  { key:'DH_REVIEW',        label:'Sent Back by Accts', bg:'#fff3e0', color:'#e65100' },
  { key:'CLOSED',           label:'Closed',          bg:'#eceff1', color:'#37474f' },
  { key:'REJECTED',         label:'Rejected',        bg:'#ffebee', color:'#c62828' },
  { key:'CANCELLED',        label:'Cancelled',       bg:'#eceff1', color:'#37474f' },
]
const stageInfo = key => STAGES.find(s => s.key === key) || { label: key || '—', bg:'#f0f4f8', color:'#6b7c93' }

const EMPTY_LINE = {
  party_type:'', party_id:'', party_name:'',
  payment_type:'', expense_type:'', project_id:'',
  iban:'', sadad_no:'', iban_options:[], amount:'', remarks:'',
}
const EMPTY_DIST = { party_type:'EMPLOYEE', party_id:'', party_name:'', gross_amount:'', vat_amount:'0', account_code:'EXP-001', purpose:'', iban_used:'' }

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MoneyRequests({ entityId, currentUser }) {
  const [requests,    setRequests]    = useState([])
  const [employees,   setEmployees]   = useState([])
  const [contractors, setContractors] = useState([])
  const [projects,    setProjects]    = useState([])
  const [coa,         setCoa]         = useState([])   // chart_of_accounts
  const [loading,     setLoading]     = useState(true)
  const [filterStatus, setFilter]     = useState('ALL')
  const [expandedId,  setExpandedId]  = useState(null)
  const [mainTab,     setMainTab]     = useState('pending')   // 'pending' | 'history'
  const [histFrom,    setHistFrom]    = useState(() => { const d = new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().split('T')[0] })
  const [histTo,      setHistTo]      = useState(() => new Date().toISOString().split('T')[0])

  // Filter state — Pending tab
  const [mrSearch,     setMrSearch]     = useState('')
  const [mrDeptFilter, setMrDeptFilter] = useState('')
  // Filter state — History tab
  const [histSearch,     setHistSearch]     = useState('')
  const [histDeptFilter, setHistDeptFilter] = useState('')

  // Create / Edit MR modal
  const [showBanner,      setShowBanner]      = useState(false)  // Step 0 entry banner
  const [showCreate,      setShowCreate]      = useState(false)
  const [editingMR,       setEditingMR]       = useState(null)   // null = create, MR object = edit
  const [saving,          setSaving]          = useState(false)
  const [form, setForm] = useState({ request_date: today(), department:'', dept_id:'', requested_by:'' })
  const [lines,           setLines]           = useState([{ ...EMPTY_LINE }])
  const [mrStep,          setMrStep]          = useState(1)   // 1=Request Details, 2=Attachments
  const [mrAttachments,   setMrAttachments]   = useState([])
  const mrFileRef = useRef(null)
  const [depts,         setDepts]         = useState([])   // [{id, dept_code, dept_name, dept_head_id, pm_id, supervisor_id}]
  const [deptEmployees, setDeptEmployees] = useState([])   // Tier-1 FK staff (Requestor dropdown)
  const [deptAllEmps,   setDeptAllEmps]   = useState([])   // ALL employees in dept (Payment Lines party)
  const [deptProjects,  setDeptProjects]  = useState([])   // filtered by dept

  // Detail drawer
  const [detail,      setDetail]     = useState(null)
  const [detailLines, setDetailLines]= useState([])
  const [received,    setReceived]   = useState([])   // money_received
  const [dists,       setDists]      = useState([])   // money_distributions
  const [journals,    setJournals]   = useState([])   // journal_entries
  const [activeTab,   setActiveTab]  = useState('overview')

  // Receive form (Layer 2)
  const [rcvForm, setRcvForm] = useState({
    received_date: today(), received_amount:'', payment_method:'BANK_TRANSFER',
    bank_account:'ANB-39', reference:'', notes:''
  })
  const [rcvSaving,   setRcvSaving]   = useState(false)
  const [lineRefs,    setLineRefs]    = useState({})   // lineId → bank TRN#
  const [rcvFile,     setRcvFile]     = useState(null) // attachment file
  const [confirming,  setConfirming]  = useState(false)
  const [dhAcking,    setDhAcking]    = useState(false)
  const [partyWarning, setPartyWarning] = useState(null) // { name, amount, count }

  // Distribute form (Layer 3)
  const [selReceivedId, setSelReceivedId] = useState('')
  const [distRows,      setDistRows]      = useState([{ ...EMPTY_DIST }])
  const [distSaving,    setDistSaving]    = useState(false)

  // ─── Load ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!entityId) return
    setLoading(true)
    const [{ data:r }, { data:e }, { data:c }, { data:p }, { data:a }] = await Promise.all([
      supabase.from('money_requests').select('*').eq('entity_id', entityId).order('created_at', { ascending:false }),
      supabase.from('employees').select('id,full_name_en,department_id,designation,job_title,iban').eq('entity_id', entityId).eq('is_active', true).order('full_name_en'),
      supabase.from('contractors').select('id,contractor_name,company_name,contractor_code,vendor_type').eq('entity_id', entityId).order('contractor_name'),
      supabase.from('projects').select('id,project_name,project_number,department_id,contract_value,status').eq('entity_id', entityId).order('project_name'),
      supabase.from('chart_of_accounts').select('account_code,account_name,account_type').eq('entity_id', entityId).eq('is_active', true).order('account_code'),
    ])
    // Also load departments
    const { data: deps } = await supabase
      .from('departments')
      .select('id,dept_code,dept_name,dept_head_id,pm_id,supervisor_id')
      .eq('entity_id', entityId).eq('is_active', true).order('dept_code')
    setDepts(deps || [])
    // Filter projects to Open/Active regardless of DB case ('Open','OPEN','open', etc.)
    const activeProjects = (p || []).filter(proj =>
      ['open','active'].includes((proj.status || '').toLowerCase())
    )
    setRequests(r || [])
    setEmployees(e || [])
    setContractors(c || [])
    setProjects(activeProjects)
    setCoa(a || [])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  // ── Listen for Drive-save messages from print window ─────────────────────
  useEffect(() => {
    async function handleDriveMsg(e) {
      if (!e.data || e.data.type !== 'DRIVE_SAVED') return
      const { mrId, driveUrl } = e.data
      if (!mrId || !driveUrl) return
      // Write drive_url back to money_requests (column may not exist yet — silent if error)
      await supabase.from('money_requests').update({ drive_url: driveUrl }).eq('id', mrId)
      // Update local state so detail drawer shows the link immediately
      setRequests(prev => prev.map(r => r.id === mrId ? { ...r, drive_url: driveUrl } : r))
      setDetail(prev => prev?.id === mrId ? { ...prev, drive_url: driveUrl } : prev)
    }
    window.addEventListener('message', handleDriveMsg)
    return () => window.removeEventListener('message', handleDriveMsg)
  }, [])


  // ─── Open Detail ──────────────────────────────────────────────────────────
  async function openDetail(mr) {
    setDetail(mr)
    setActiveTab('overview')
    setRcvForm(f => ({ ...f, received_date: today(), received_amount:'', reference:'', notes:'', bank_account: mr.paid_from || 'ANB-39' }))
    const [{ data:ln }, { data:rcv }, { data:dist }] = await Promise.all([
      supabase.from('money_request_lines').select('*').eq('money_request_id', mr.id).order('sort_order'),
      supabase.from('money_received').select('*').eq('money_request_id', mr.id).order('received_date'),
      supabase.from('money_distributions').select('*').eq('money_request_id', mr.id).order('created_at'),
    ])
    setDetailLines(ln || [])
    setReceived(rcv || [])
    setDists(dist || [])

    // Auto-select newest receipt for distribution
    const latestRcvId = rcv?.length > 0 ? rcv[rcv.length - 1].id : ''
    setSelReceivedId(latestRcvId)

    // Load existing DRAFT distributions into the form (so user edits them rather than duplicating)
    const draftRows = (dist || []).filter(d => d.status === 'DRAFT')
    if (draftRows.length > 0) {
      setDistRows(draftRows.map(d => ({
        id:           d.id,   // keep DB id so save() can delete+replace
        party_type:   d.party_type  || 'EMPLOYEE',
        party_id:     d.party_id    || '',
        party_name:   d.party_name  || '',
        gross_amount: d.gross_amount != null ? String(d.gross_amount) : '',
        vat_amount:   d.vat_amount  != null ? String(d.vat_amount)   : '0',
        account_code: d.account_code || 'EXP-001',
        purpose:      d.purpose     || '',
        iban_used:    d.iban_used   || '',
      })))
    } else {
      setDistRows([{ ...EMPTY_DIST }])
    }

    // Load journals via the received/dist source IDs
    const srcIds = [
      ...(rcv  || []).map(x => x.id),
      ...(dist || []).map(x => x.id),
    ]
    if (srcIds.length > 0) {
      const { data:jnl } = await supabase.from('journal_entries')
        .select('*,journal_lines(*)')
        .in('source_id', srcIds)
        .order('entry_date')
      setJournals(jnl || [])
    } else {
      setJournals([])
    }
  }

  // ─── Per-line 50% budget check (called on submit) ────────────────────────────
  async function checkLineBudgets(validLines) {
    // Group line amounts by project_id
    const projectAmounts = {}
    validLines.forEach(l => {
      if (l.project_id) {
        projectAmounts[l.project_id] = (projectAmounts[l.project_id] || 0) + (parseFloat(l.amount) || 0)
      }
    })
    for (const [projId, reqAmt] of Object.entries(projectAmounts)) {
      const proj   = deptProjects.find(p => p.id === projId)
      const budget = parseFloat(proj?.contract_value) || 0
      if (budget <= 0) continue
      // Sum committed amounts from MR lines for this project (active MRs only)
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
        const proceed = window.confirm(
          `⚠️ Budget Warning — 50% Limit Exceeded\n\n` +
          `Project: ${proj.project_number || ''} — ${proj.project_name || ''}\n` +
          `Contract Value:    SAR ${budget.toLocaleString()}\n` +
          `50% Limit:         SAR ${limit50.toLocaleString()}\n` +
          `Already Committed: SAR ${committed.toLocaleString()}\n` +
          `Remaining:         SAR ${remaining.toLocaleString()}\n` +
          `This Request:      SAR ${reqAmt.toLocaleString()}\n\n` +
          `Click OK to proceed anyway, or Cancel to revise.`
        )
        if (!proceed) return false  // user chose to revise
        // user acknowledged — allow submission
      }
    }
    return true  // all clear
  }

  // ─── Dept change inside Create modal (Tier 1: FK staff, Tier 2: dept members) ──
  async function onCreateDeptChange(newDeptId) {
    const deptObj  = depts.find(d => d.id === newDeptId)
    const deptCode = deptObj?.dept_code || deptObj?.dept_name || ''
    setForm(f => ({ ...f, dept_id: newDeptId, department: deptCode, requested_by: '' }))
    setDeptEmployees([]); setDeptAllEmps([])

    // Show this dept's projects first, then all entity projects as fallback
    // so users are never stuck with an empty dropdown
    const deptOnly = projects.filter(p => p.department_id === newDeptId)
    setDeptProjects(deptOnly.length > 0 ? deptOnly : projects)

    if (!newDeptId) return

    // Load ALL dept employees for Payment Lines party picker (for IBAN auto-fill)
    supabase.from('employees').select('id,full_name_en,iban')
      .eq('department_id', newDeptId).order('full_name_en')
      .then(({ data }) => setDeptAllEmps(data || []))

    // Load ALL dept employees first (used for Employee line picker — all 24 show here)
    const { data: allDeptEmps } = await supabase
      .from('employees').select('id,full_name_en,iban')
      .eq('department_id', newDeptId).eq('is_active', true).order('full_name_en')
    setDeptAllEmps(allDeptEmps || [])

    // Requestor dropdown: DH / PM / Supervisor of this dept only
    const roleMap = [
      { id: deptObj?.dept_head_id,  roleLabel: 'Dept Head'  },
      { id: deptObj?.pm_id,         roleLabel: 'PM'         },
      { id: deptObj?.supervisor_id, roleLabel: 'Supervisor' },
    ]
    const tierFromAll = (allDeptEmps || [])
      .filter(e => roleMap.some(r => r.id === e.id))
      .map(e => ({ ...e, roleLabel: roleMap.find(r => r.id === e.id)?.roleLabel || '' }))

    if (tierFromAll.length > 0) {
      setDeptEmployees(tierFromAll)
    } else {
      // Fallback: all dept employees if no tier configured
      setDeptEmployees((allDeptEmps || []).map(e => ({ ...e, roleLabel: '' })))
    }
  }

  // ─── IBAN / SADAD auto-fill for create lines ─────────────────────────────
  async function handleCreatePartySelect(idx, partyType, partyId, partyName) {
    // ANB-77 → Tech-3 (auto-fill locked)
    if (partyType === 'ANB-77') {
      updateCreateLine(idx, {
        party_type: 'ANB-77', party_id: '', party_name: 'Tech-3',
        iban: 'ANB-77', sadad_no: '', iban_options: [],
      }); return
    }
    // ANB-39 → Tech-2 (auto-fill locked)
    if (partyType === 'ANB-39') {
      updateCreateLine(idx, {
        party_type: 'ANB-39', party_id: '', party_name: 'Tech-2',
        iban: 'ANB-39', sadad_no: '', iban_options: [],
      }); return
    }
    // Government → no IBAN; SADAD # entered manually
    if (partyType === 'Government') {
      updateCreateLine(idx, {
        party_type: 'Government', party_id: '', party_name: partyName || '',
        iban: '', sadad_no: '', iban_options: [],
      }); return
    }
    // Employee → IBAN from employee record
    if (partyType === 'Employee') {
      const emp = deptAllEmps.find(e => e.id === partyId) || deptEmployees.find(e => e.id === partyId)
      updateCreateLine(idx, {
        party_type: 'Employee', party_id: partyId, party_name: partyName,
        iban: emp?.iban || '', sadad_no: '', iban_options: [],
      }); return
    }
    // Others → free text, no IBAN lookup
    if (partyType === 'Others') {
      updateCreateLine(idx, {
        party_type: 'Others', party_id: '', party_name: partyName || '',
        iban: '', sadad_no: '', iban_options: [],
      }); return
    }
    // Sub-Contractor / Supplier / Local-Supplier → lookup party_bank_accounts
    updateCreateLine(idx, { party_type: partyType, party_id: partyId, party_name: partyName, iban: '', sadad_no: '', iban_options: [] })
    if (!partyId) return
    try {
      const { data: banks } = await supabase.from('party_bank_accounts')
        .select('id,iban,bank_name,is_primary').eq('contractor_id', partyId)
        .order('is_primary', { ascending: false })
      if (!banks || banks.length === 0) return
      if (banks.length === 1) updateCreateLine(idx, { iban: banks[0].iban, iban_options: [] })
      else updateCreateLine(idx, { iban: banks[0].iban, iban_options: banks })
    } catch {}

    // ── N4/G6: DH acknowledgment block (HARD BLOCK if >30 days unacked) ───────
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
      const { data: blockedMRs } = await supabase
        .from('money_requests')
        .select('id, mr_number, funds_sent_at, amount')
        .eq('entity_id', entityId)
        .eq('status', 'FUNDS_SENT')
        .is('dh_acked_at', null)
        .lte('funds_sent_at', thirtyDaysAgo)  // older than 30 days
        .limit(5)
      // Check if any blocked MR line references this party
      if (blockedMRs && blockedMRs.length > 0) {
        const blockedIds = blockedMRs.map(m => m.id)
        const { data: partyLines } = await supabase
          .from('money_request_lines')
          .select('money_request_id')
          .eq('party_id', partyId)
          .in('money_request_id', blockedIds)
          .limit(1)
        if (partyLines && partyLines.length > 0) {
          const mr = blockedMRs.find(m => m.id === partyLines[0].money_request_id)
          const daysOld = mr?.funds_sent_at ? Math.floor((Date.now() - new Date(mr.funds_sent_at).getTime()) / 86400000) : 30
          alert(
            `⛔ BLOCKED: ${partyName}\n\n` +
            `This party has an unacknowledged payment (${mr?.mr_number || ''}) that is ${daysOld} days old.\n\n` +
            `DH must acknowledge the previous payment before a new request can be submitted.\n` +
            `Contact the Department Head or Accounts to resolve.`
          )
          return  // hard block — do not proceed
        }
      }
    } catch {}

    // ── Outstanding balance warning (non-blocking) ──────────────────────────
    // Check if this party has active (non-settled) money request lines
    try {
      const { data: activeMRLines } = await supabase
        .from('money_request_lines')
        .select('amount, money_request_id')
        .eq('party_id', partyId)
        .limit(50)
      if (activeMRLines && activeMRLines.length > 0) {
        // Filter to lines on active (non-closed) MRs
        const mrIds = [...new Set(activeMRLines.map(l => l.money_request_id))]
        const { data: activeMRs } = await supabase
          .from('money_requests').select('id').in('id', mrIds)
          .not('status', 'in', '("REJECTED","CANCELLED","FUNDS_SENT","SETTLED","CLOSED")')
        if (activeMRs && activeMRs.length > 0) {
          const activeSet  = new Set(activeMRs.map(m => m.id))
          const outstanding = activeMRLines
            .filter(l => activeSet.has(l.money_request_id))
            .reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
          if (outstanding > 0) {
            setPartyWarning({
              name: partyName,
              amount: outstanding,
              count: activeMRs.length,
            })
          }
        }
      }
    } catch {}
  }

  function updateCreateLine(idx, updates) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...updates } : l))
  }

  // ─── Create / Update MR ───────────────────────────────────────────────────
  async function createMR() {
    if (!form.department || !form.requested_by) { alert('Select department and requestor'); return }
    const validLines = lines.filter(l => parseFloat(l.amount) > 0)
    if (!validLines.length) { alert('Add at least one line with an amount'); return }
    const totalAmt = validLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
    // Per-line 50% budget guard
    setSaving(true)
    const budgetOk = await checkLineBudgets(validLines)
    if (!budgetOk) { setSaving(false); return }

    const firstLine   = lines.filter(l => parseFloat(l.amount) > 0)[0]
    const autoPurpose = [firstLine?.expense_type, firstLine?.party_type].filter(Boolean).join(' — ')
                        || `${form.department} Money Request`

    const linePayload = validLines.map((l, i) => ({
      sort_order:   i,
      party_type:   l.party_type     || null,
      party_id:     l.party_id       || null,
      line_type:    l.payment_type   || null,
      supplier_name: l.party_name    || null,
      account_code: l.expense_type   || null,
      iban:         l.party_type === 'Government' ? (l.sadad_no || null) : (l.iban || null),
      project_id:   l.project_id     || null,
      amount:       parseFloat(l.amount),
      remarks:      l.remarks        || null,
    }))

    // ── EDIT MODE ─────────────────────────────────────────────────────────────
    if (editingMR) {
      // requested_by is always UUID — store UUID, not name

      // Append resubmit entry to the log (preserve history)
      const resubmitEntry = `✅ Resubmitted by DH on ${form.request_date}`
      const updatedNote = editingMR.accounts_note
        ? editingMR.accounts_note + '\n──────────\n' + resubmitEntry
        : null

      // Update MR header, preserve accounts_note log, send back to accounts
      const { error: updErr } = await supabase.from('money_requests').update({
        request_date:    form.request_date,
        department_id:   form.dept_id,
        department_name: form.department,
        requested_by:    form.requested_by,   // UUID
        purpose:         autoPurpose,
        amount:          totalAmt,
        status:          'ACCTS_PENDING',   // goes straight back to accounts
        accounts_note:   updatedNote,       // preserve log history
      }).eq('id', editingMR.id)
      if (updErr) { alert(updErr.message); setSaving(false); return }

      // Replace lines: delete ALL existing lines for this MR, then insert the new set
      const { data: deleted, error: delErr } = await supabase
        .from('money_request_lines')
        .delete()
        .eq('money_request_id', editingMR.id)
        .select('id')   // .select() forces PostgREST to execute and return affected rows
      if (delErr) {
        alert('Could not clear old lines:\n' + delErr.message + '\n\nRun the mr_lines_delete_auth SQL policy in Supabase and try again.')
        setSaving(false); return
      }

      const { error: linesErr } = await supabase.from('money_request_lines').insert(
        linePayload.map(l => ({ ...l, money_request_id: editingMR.id }))
      )
      if (linesErr) { alert('Lines save failed:\n' + linesErr.message); setSaving(false); return }

      setSaving(false); setShowCreate(false); resetCreate()
      setDetail(null)   // close detail drawer if open
      load()
      return
    }

    // ── CREATE MODE ───────────────────────────────────────────────────────────
    const emp           = deptEmployees.find(e => e.id === form.requested_by)
    const deptForStatus = depts.find(d => d.id === form.dept_id)
    // Auto-approve if the requestor IS the dept head
    const status        = form.requested_by === deptForStatus?.dept_head_id ? 'DH_APPROVED' : 'PENDING'

    const { data:mr, error } = await supabase.from('money_requests').insert({
      entity_id:       entityId,
      request_date:    form.request_date,
      department_id:   form.dept_id,
      department_name: form.department,
      requested_by:    form.requested_by,   // UUID — always store UUID
      purpose:         autoPurpose,
      amount:          totalAmt,
      status,
    }).select().single()

    if (error) { alert(error.message); setSaving(false); return }

    const { error: linesErr } = await supabase.from('money_request_lines').insert(
      linePayload.map(l => ({ ...l, money_request_id: mr.id }))
    )
    if (linesErr) {
      await supabase.from('money_requests').delete().eq('id', mr.id)
      setSaving(false)
      alert('Failed to save MR lines:\n' + linesErr.message + '\n\nIf you see "column does not exist", run FIX_MR_LINES_COLUMNS.sql in Supabase SQL Editor first.')
      return
    }
    // ── Auto-print + Drive save on submit ────────────────────────────────────
    try {
      const reqEmp    = employees.find(e => e.id === form.requested_by)
      const reqName   = reqEmp?.full_name_en || form.requested_by || ''
      const deptObj   = depts.find(d => d.id === form.dept_id)
      let   reqRole   = 'Department Staff'
      if (deptObj) {
        if (deptObj.dept_head_id    === form.requested_by) reqRole = 'Department Head'
        else if (deptObj.pm_id      === form.requested_by) reqRole = 'Project Manager'
        else if (deptObj.supervisor_id === form.requested_by) reqRole = 'Supervisor'
      }
      const allExpCodes = Object.values(MR_EXPENSE_TYPES_BY_PARTY).flat()
      const printLines  = validLines.map(ln => {
        const expMatch   = allExpCodes.find(e => e.code === ln.expense_type)
        const lineProj   = deptProjects.find(p => p.id === ln.project_id)
        return {
          party_type:     ln.party_type    || '',
          party_name:     ln.party_name    || '',
          expense_type:   expMatch?.name   || ln.expense_type || '',
          payment_type:   ln.payment_type  || '',
          project_number: lineProj?.project_number || '',
          amount:         parseFloat(ln.amount) || 0,
          iban:           ln.iban          || '',
          remarks:        ln.remarks       || '',
        }
      })
      const projectNumbers = [...new Set(printLines.map(l => l.project_number).filter(Boolean))]
      const mrNo    = mr.request_number || mr.id
      const [rYr, rMo, rDy] = (form.request_date || '').split('-')
      const dateStr = rDy && rMo && rYr ? `${rDy}${rMo}${rYr.slice(2)}` : ''

      printDocument('money_request', {
        request_number:    mr.request_number  || '',
        request_date:      form.request_date  || '',
        department:        form.department    || '',
        purpose:           autoPurpose        || '',
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
        mrId:          mr.id,
        autoRun:       true,
        autoOnly:      true,
        requestDate:   form.request_date || '',
      })
    } catch (_) { /* non-critical — form already saved */ }

    setSaving(false); setShowCreate(false); resetCreate(); load()
  }

  function resetCreate() {
    setForm({ request_date: today(), department:'', dept_id:'', requested_by:'' })
    setLines([{ ...EMPTY_LINE }])
    setDeptEmployees([]); setDeptAllEmps([]); setDeptProjects([])
    setEditingMR(null)
    setMrStep(1)
    setMrAttachments([])
  }

  // ─── Start Edit (Recall & Edit / Edit & Resubmit) ─────────────────────────
  async function startEdit(mr) {
    // 1. Load existing lines for this MR
    const { data: existingLines } = await supabase
      .from('money_request_lines').select('*')
      .eq('money_request_id', mr.id).order('sort_order')

    // 2. Load dept context: all employees + tier employees + projects
    const dept = depts.find(d => d.id === mr.department_id)

    // Load THIS dept's employees + projects (filtered by dept, not entity-wide)
    const [deptEmpsRes, projsRes] = await Promise.all([
      supabase.from('employees')
        .select('id,full_name_en,iban')
        .eq('department_id', mr.department_id).eq('is_active', true).order('full_name_en'),
      supabase.from('projects')
        .select('id,project_name,project_number,contract_value,department_id,status')
        .eq('entity_id', entityId),
    ])
    const allDeptEmps = deptEmpsRes.data || []
    setDeptAllEmps(allDeptEmps)            // ALL dept employees → Employee line picker
    const activeProjs = (projsRes.data || []).filter(p =>
      ['open','active'].includes((p.status || '').toLowerCase())
    )
    setDeptProjects(activeProjs)

    // Requestor dropdown: DH / PM / Supervisor only (same as onCreateDeptChange)
    const roleMap = [
      { id: dept?.dept_head_id,  roleLabel: 'Dept Head'  },
      { id: dept?.pm_id,         roleLabel: 'PM'         },
      { id: dept?.supervisor_id, roleLabel: 'Supervisor' },
    ]
    const tierEmps = allDeptEmps
      .filter(e => roleMap.some(r => r.id === e.id))
      .map(e => ({ ...e, roleLabel: roleMap.find(r => r.id === e.id)?.roleLabel || '' }))
    setDeptEmployees(tierEmps.length > 0 ? tierEmps : allDeptEmps.map(e => ({ ...e, roleLabel: '' })))

    // 3. Resolve requested_by (stored as name or UUID in older records)
    const resolveEmp = (stored) =>
      allDeptEmps.find(e => e.id === stored || e.full_name_en === stored)
    const foundEmp = resolveEmp(mr.requested_by)
    setForm({
      request_date: mr.request_date    || today(),
      department:   mr.department_name || '',
      dept_id:      mr.department_id   || '',
      requested_by: foundEmp?.id || mr.requested_by || '',
    })

    // 4. Map DB lines → form fields
    const formLines = (existingLines || []).map(l => ({
      party_type:   l.party_type    || '',
      party_id:     l.party_id      || '',
      party_name:   l.supplier_name || '',
      payment_type: l.line_type     || '',
      expense_type: l.account_code  || '',
      project_id:   l.project_id    || '',
      iban:         l.iban          || '',
      sadad_no:     '',
      iban_options: [],
      amount:       l.amount != null ? l.amount.toString() : '',
      remarks:      l.remarks       || '',
    }))
    setLines(formLines.length > 0 ? formLines : [{ ...EMPTY_LINE }])

    setEditingMR(mr)
    setShowCreate(true)
  }

  // ─── Status Transition ────────────────────────────────────────────────────
  async function moveTo(mr, newStatus, extra = {}) {
    const { error } = await supabase.from('money_requests')
      .update({ status: newStatus, ...extra })
      .eq('id', mr.id)
    if (error) { alert(error.message); return }
    load()
    if (detail?.id === mr.id) setDetail(prev => ({ ...prev, status: newStatus, ...extra }))
  }

  // ─── Save Money Received (Layer 2) ────────────────────────────────────────
  async function saveReceive() {
    const amt = parseFloat(rcvForm.received_amount)
    if (!amt || amt <= 0) { alert('Enter amount received'); return }

    // Guard: total received must not exceed requested amount
    const alreadyReceived = received.reduce((s, r) => s + (r.received_amount || 0), 0)
    if (alreadyReceived + amt > (detail.amount || 0) + 0.01) {
      alert(`Cannot record SAR ${amt.toLocaleString()}.\nAlready received: SAR ${alreadyReceived.toLocaleString()}\nRequested: SAR ${(detail.amount||0).toLocaleString()}\nRemaining allowed: SAR ${((detail.amount||0) - alreadyReceived).toLocaleString()}`)
      return
    }

    setRcvSaving(true)
    const { error } = await supabase.from('money_received').insert({
      entity_id:        entityId,
      money_request_id: detail.id,
      received_date:    rcvForm.received_date,
      received_amount:  amt,
      payment_method:   rcvForm.payment_method,
      bank_account:     rcvForm.bank_account,
      reference:        rcvForm.reference || null,
      notes:            rcvForm.notes     || null,
      status:           'OPEN',
    })
    if (error) { alert(error.message); setRcvSaving(false); return }

    // Update MR status and received total
    const newReceivedTotal = received.reduce((s, r) => s + (r.received_amount || 0), 0) + amt
    await supabase.from('money_requests').update({
      status:          'FUNDS_SENT',
      received_amount: newReceivedTotal,
      funds_sent_at:   new Date().toISOString(),   // G6/N4: start DH ack clock
    }).eq('id', detail.id)

    setRcvSaving(false)
    openDetail({ ...detail, status:'FUNDS_SENT', received_amount: newReceivedTotal, funds_sent_at: new Date().toISOString() })
    load()
  }

  // ─── Confirm Receipt — save TRN# per line + upload attachment ───────────────
  async function confirmReceipt() {
    if (received.length === 0) { alert('No payment record found. Mark as Paid in Payments first.'); return }
    setConfirming(true)

    // 1. Save bank TRN# to each line
    const lineUpdates = Object.entries(lineRefs).filter(([,ref]) => ref?.trim())
    for (const [lineId, ref] of lineUpdates) {
      await supabase.from('money_request_lines').update({ bank_ref: ref.trim() }).eq('id', lineId)
    }

    // 2. Upload attachment to Supabase Storage (bucket: mr-receipts)
    let attachmentUrl = null
    if (rcvFile) {
      const ext   = rcvFile.name.split('.').pop()
      const path  = `${detail.id}/${Date.now()}.${ext}`
      const { data: upData, error: upErr } = await supabase.storage
        .from('mr-receipts').upload(path, rcvFile, { upsert: true })
      if (upErr) { alert('Attachment upload failed: ' + upErr.message + '\n\nCreate bucket "mr-receipts" in Supabase Storage first.') }
      else { attachmentUrl = upData?.path || path }
    }

    // 3. Update money_received: add attachment, mark CONFIRMED
    const refSummary = Object.values(lineRefs).filter(Boolean).join(' | ')
    const { error: rcvErr } = await supabase.from('money_received').update({
      reference:      refSummary || received[0].reference || null,
      attachment_url: attachmentUrl || received[0].attachment_url || null,
      status:         'CONFIRMED',
    }).eq('id', received[0].id)
    if (rcvErr) { alert('Could not confirm receipt: ' + rcvErr.message); setConfirming(false); return }

    // 4. Advance MR status → ISSUED (funds confirmed, ready for distribution if needed)
    await supabase.from('money_requests').update({ status: 'ISSUED' }).eq('id', detail.id)

    setConfirming(false)
    setLineRefs({})
    setRcvFile(null)
    openDetail({ ...detail, status: 'ISSUED' })
    load()
  }

  // ─── DH Acknowledge (G6/N4) ──────────────────────────────────────────────
  async function handleDhAck() {
    if (!detail) return
    setDhAcking(true)
    const ackedBy = currentUser?.email || currentUser?.name || 'Admin'
    const now = new Date().toISOString()
    const { error } = await supabase.from('money_requests').update({
      dh_acked_at: now,
      dh_acked_by: ackedBy,
      status:      'DH_ACKNOWLEDGED',
    }).eq('id', detail.id)
    if (error) { alert(error.message); setDhAcking(false); return }
    setDhAcking(false)
    openDetail({ ...detail, status: 'DH_ACKNOWLEDGED', dh_acked_at: now, dh_acked_by: ackedBy })
    load()
  }

  // ─── Save Distributions (Layer 3) ─────────────────────────────────────────
  async function saveDistribution() {
    const validRows = distRows.filter(r => parseFloat(r.gross_amount) > 0)
    if (validRows.length === 0) { alert('Add at least one row with an amount'); return }
    if (!selReceivedId) { alert('Select a receipt to distribute from'); return }

    const rcvRecord = received.find(r => r.id === selReceivedId)
    // Available = received - PAID only (DRAFT rows will be replaced)
    const alreadyPaid = dists.filter(d => d.money_received_id === selReceivedId && d.status === 'PAID')
      .reduce((s, d) => s + (d.gross_amount || 0), 0)
    const totalNew  = validRows.reduce((s, r) => s + (parseFloat(r.gross_amount) || 0), 0)
    const available = (rcvRecord?.received_amount || 0) - alreadyPaid

    if (totalNew > available + 0.01) {
      alert(`Total (SAR ${totalNew.toLocaleString()}) exceeds available balance (SAR ${available.toLocaleString()})`); return
    }

    setDistSaving(true)
    // Delete existing DRAFT rows for this receipt before inserting fresh ones
    const draftIds = dists.filter(d => d.money_received_id === selReceivedId && d.status === 'DRAFT').map(d => d.id)
    if (draftIds.length > 0) {
      await supabase.from('money_distributions').delete().in('id', draftIds)
    }
    const payload = validRows.map(row => {
      const emp = row.party_type === 'EMPLOYEE' ? employees.find(e => e.id === row.party_id) : null
      const con = ['VENDOR','SUBCON'].includes(row.party_type) ? contractors.find(c => c.id === row.party_id) : null
      return {
        entity_id:        entityId,
        money_received_id: selReceivedId,
        money_request_id: detail.id,
        distribution_date: today(),
        party_type:       row.party_type,
        party_id:         row.party_id   || null,
        party_name:       row.party_name || emp?.full_name_en || con?.company_name || con?.contractor_name || row.party_type,
        iban_used:        row.iban_used  || null,
        gross_amount:     parseFloat(row.gross_amount),
        vat_amount:       parseFloat(row.vat_amount) || 0,
        account_code:     row.account_code || 'EXP-001',
        purpose:          row.purpose   || detail.purpose,
        status:           'DRAFT',
      }
    })

    const { error } = await supabase.from('money_distributions').insert(payload)
    if (error) { alert(error.message); setDistSaving(false); return }

    // Update distributed total on MR
    const newDistTotal = dists.reduce((s, d) => s + (d.gross_amount || 0), 0) + totalNew
    const totalRcv = received.reduce((s, r) => s + (r.received_amount || 0), 0)
    const autoComplete = newDistTotal >= totalRcv && totalRcv > 0
    const newMrStatus = autoComplete ? 'COMPLETED' : 'DISTRIBUTION'
    await supabase.from('money_requests').update({
      status:             newMrStatus,
      distributed_amount: newDistTotal,
    }).eq('id', detail.id)

    setDistSaving(false)
    setDistRows([{ ...EMPTY_DIST }])
    openDetail({ ...detail, status: newMrStatus, distributed_amount: newDistTotal })
    load()
  }

  // ─── Mark Distribution PAID (triggers expense journal via DB trigger) ──────
  async function markPaid(distId) {
    const { error } = await supabase.from('money_distributions')
      .update({ status:'PAID' })
      .eq('id', distId)
    if (error) { alert(error.message); return }
    openDetail(detail)
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function today() { return new Date().toISOString().split('T')[0] }
  const empName  = id => employees.find(e => e.id === id)?.full_name_en || '—'
  const conName  = id => { const c = contractors.find(x => x.id === id); return c ? (c.company_name || c.contractor_name) : '—' }
  const partyLabel = d => d.party_name || (d.party_type === 'EMPLOYEE' ? empName(d.party_id) : conName(d.party_id)) || d.party_type || '—'

  const expenseAccts = coa.filter(a => ['EXPENSE','ASSET','LIABILITY'].includes(a.account_type))
  const acctOpts     = expenseAccts.length > 0 ? expenseAccts : ['EXP-001','EXP-002','EXP-003','EXP-004','GOV-001','GOV-002'].map(c => ({ account_code:c, account_name:'' }))

  const HISTORY_STATUSES = ['CLOSED','REJECTED','DH_REJECTED','CANCELLED','COMPLETED']
  const ACTIVE_STAGES    = STAGES.filter(s => !HISTORY_STATUSES.includes(s.key))

  const pendingAll  = requests.filter(r => !HISTORY_STATUSES.includes(r.status))
  const historyAll  = requests.filter(r => HISTORY_STATUSES.includes(r.status)
    && r.request_date >= histFrom && r.request_date <= histTo)

  // Filtered pending
  const filteredPending = pendingAll.filter(r => {
    if (filterStatus !== 'ALL' && r.status !== filterStatus) return false
    if (mrDeptFilter && r.department_id !== mrDeptFilter) return false
    if (mrSearch) {
      const q = mrSearch.toLowerCase()
      if (!(
        (r.request_number || '').toLowerCase().includes(q) ||
        (r.purpose || '').toLowerCase().includes(q) ||
        (r.department_name || r.department || '').toLowerCase().includes(q)
      )) return false
    }
    return true
  })

  // Filtered history
  const filteredHistory = historyAll.filter(r => {
    if (histDeptFilter && r.department_id !== histDeptFilter) return false
    if (histSearch) {
      const q = histSearch.toLowerCase()
      if (!(
        (r.request_number || '').toLowerCase().includes(q) ||
        (r.purpose || '').toLowerCase().includes(q) ||
        (r.department_name || r.department || '').toLowerCase().includes(q)
      )) return false
    }
    return true
  })

  const visible   = mainTab === 'history' ? filteredHistory : filteredPending
  const openTotal = pendingAll.reduce((s, r) => s + (r.amount || 0), 0)

  // KPI values — reactive to current filtered view
  const kpiPendDH   = mainTab === 'pending' ? pendingAll.filter(r => r.status === 'PENDING').length : 0
  const kpiAccts    = mainTab === 'pending' ? pendingAll.filter(r => ['ACCTS_PENDING','FIN_PENDING'].includes(r.status)).length : 0
  const kpiFunds    = mainTab === 'pending' ? pendingAll.filter(r => ['FUNDS_SENT','PARTIALLY_ISSUED','DISTRIBUTION'].includes(r.status)).length : 0
  const kpiClosed   = mainTab === 'history' ? filteredHistory.filter(r => r.status === 'CLOSED').length : 0

  function exportHistoryExcel() {
    if (!filteredHistory.length) return
    const headers = ['MR #','Date','Department','Purpose','Bank','Requested (SAR)','Received (SAR)','Distributed (SAR)','Balance (SAR)','Status']
    const rows = filteredHistory.map(r => [
      r.request_number || '',
      r.request_date || '',
      r.department_name || r.department || '',
      r.purpose || '',
      r.paid_from || '',
      r.amount || 0,
      r.received_amount || 0,
      r.distributed_amount || 0,
      (r.received_amount || 0) - (r.distributed_amount || 0),
      stageInfo(r.status).label,
    ])
    const csv = [headers, ...rows].map(row =>
      row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')
    ).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `mr-history-${histFrom}-to-${histTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Computed received/distributed totals from detail sub-records (more accurate than denormalized columns)
  const totalReceived = received.reduce((s, r) => s + (r.received_amount || 0), 0)
  const totalDistributed = dists.reduce((s, d) => s + (d.gross_amount || 0), 0)

  // ─── JSX ──────────────────────────────────────────────────────────────────
  return (
    <>
    {/* ── Step 0 Banner ── */}
    <PageBanner
      isOpen={showBanner}
      onClose={() => setShowBanner(false)}
      onStart={() => { setShowBanner(false); setShowCreate(true) }}
      chapterL1="#70A5A6"
      chapterL2="#EAF3F2"
      moduleColor={MC}
      chapterLabel="Operations"
      formTitle={['New', 'Money', 'Request']}
      steps={['Request Details', 'Attachments']}
      icon="💰"
      description="Request cash funds for field operations. Goes through DH → Accounts → Finance approval before funds are issued."
    />

    <ChapterPage
      chapterName="Operations"
      chapterIcon="🏗️"
      chapterColor={MC}
      chapterSubtitle="Money Requests, disbursements and field cash management"
      sectionTitle=""
      onNew={() => setShowBanner(true)}
      newLabel="+ New Request"
      filters={['Pending', 'History']}
      activeFilter={mainTab === 'pending' ? 'Pending' : 'History'}
      onFilter={f => { setMainTab(f === 'Pending' ? 'pending' : 'history'); setExpandedId(null) }}
    >{/* Custom table content begins — all original logic preserved below */}

      {/* Main tabs */}
      <div style={{ display:'flex', gap:0, borderBottom:'2px solid #e8edf5', marginBottom:0 }}>
        {[
          { key:'pending', label:`⏳ Pending`, count: pendingAll.length },
          { key:'history', label:`📋 History`, count: null },
        ].map(t => (
          <button key={t.key} onClick={() => { setMainTab(t.key); setExpandedId(null) }}
            style={{ border:'none', background:'none', padding:'10px 22px', cursor:'pointer', fontSize:13, fontWeight:700,
              color: mainTab === t.key ? '#0D5C4E' : '#6b7c93',
              borderBottom: mainTab === t.key ? '2px solid #0D5C4E' : '2px solid transparent',
              marginBottom:-2 }}>
            {t.label}{t.count !== null ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {/* KPI Strip — reactive to tab & filters */}
      {mainTab === 'pending' ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, padding:'14px 16px',
          background:'linear-gradient(135deg,#f8fafd,#eff4fb)', borderBottom:'1px solid #e8edf5' }}>
          {[
            { label:'Total Open (SAR)', val:`SAR ${openTotal.toLocaleString()}`,            grad:'linear-gradient(135deg,#0D5C4E,#0a4a3d)' },
            { label:'Pending DH',       val:`${kpiPendDH} request${kpiPendDH!==1?'s':''}`, grad:'linear-gradient(135deg,#e65100,#bf360c)' },
            { label:'Accts / Finance',  val:`${kpiAccts} request${kpiAccts!==1?'s':''}`,   grad:'linear-gradient(135deg,#6a1b9a,#4a148c)' },
            { label:'Funds In Field',   val:`${kpiFunds} request${kpiFunds!==1?'s':''}`,   grad:'linear-gradient(135deg,#2e7d32,#1b5e20)' },
          ].map(({ label, val, grad }) => (
            <div key={label} style={{ background:grad, borderRadius:10, padding:'10px 14px', boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.75)', fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, marginBottom:4, fontFamily:"'Poppins',sans-serif" }}>{label}</div>
              <div style={{ fontSize:14, fontWeight:800, color:'#fff', fontFamily:"'Poppins',sans-serif" }}>{val}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, padding:'14px 16px',
          background:'linear-gradient(135deg,#f8fafd,#eff4fb)', borderBottom:'1px solid #e8edf5' }}>
          {[
            { label:'In Range',              val:`${filteredHistory.length} request${filteredHistory.length!==1?'s':''}`, grad:'linear-gradient(135deg,#0D5C4E,#0a4a3d)' },
            { label:'Total SAR',             val:`SAR ${filteredHistory.reduce((s,r)=>s+(r.amount||0),0).toLocaleString()}`,     grad:'linear-gradient(135deg,#37474f,#263238)' },
            { label:'Closed',                val:`${kpiClosed}`,                                                                 grad:'linear-gradient(135deg,#2e7d32,#1b5e20)' },
            { label:'Rejected / Cancelled',  val:`${filteredHistory.length - kpiClosed}`,                                       grad:'linear-gradient(135deg,#c62828,#b71c1c)' },
          ].map(({ label, val, grad }) => (
            <div key={label} style={{ background:grad, borderRadius:10, padding:'10px 14px', boxShadow:'0 2px 8px rgba(0,0,0,0.15)' }}>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.75)', fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, marginBottom:4, fontFamily:"'Poppins',sans-serif" }}>{label}</div>
              <div style={{ fontSize:14, fontWeight:800, color:'#fff', fontFamily:"'Poppins',sans-serif" }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pending Filter Bar ── */}
      {mainTab === 'pending' && (
        <div style={{ padding:'10px 16px', background:'#f8fafd', borderBottom:'1px solid #e8edf5' }}>
          {/* Row 1: search + dept */}
          <div style={{ display:'flex', gap:10, marginBottom:8, flexWrap:'wrap', alignItems:'center' }}>
            <input
              placeholder="🔍 Search MR#, purpose, dept…"
              value={mrSearch}
              onChange={e => setMrSearch(e.target.value)}
              style={{ ...S.inp, maxWidth:260, padding:'7px 11px', fontSize:12 }}
            />
            <select value={mrDeptFilter} onChange={e => setMrDeptFilter(e.target.value)}
              style={{ ...S.inp, maxWidth:200, cursor:'pointer', padding:'7px 11px', fontSize:12 }}>
              <option value="">All Departments</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.dept_code || d.dept_name}</option>)}
            </select>
            {(mrSearch || mrDeptFilter || filterStatus !== 'ALL') && (
              <button onClick={() => { setMrSearch(''); setMrDeptFilter(''); setFilter('ALL') }}
                style={{ ...S.btn('#f0f4f8','#c62828'), padding:'7px 14px', fontSize:12 }}>
                ✕ Clear
              </button>
            )}
            <span style={{ marginLeft:'auto', fontSize:12, color:'#6b7c93' }}>
              {filteredPending.length} of {pendingAll.length}
            </span>
          </div>
          {/* Row 2: stage pills */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            <button onClick={() => setFilter('ALL')}
              style={{ border:`2px solid ${filterStatus==='ALL'?'#0D5C4E':'#dde3ec'}`,
                background: filterStatus==='ALL' ? '#0D5C4E' : '#fff',
                color: filterStatus==='ALL' ? '#fff' : '#6b7c93',
                borderRadius:20, padding:'4px 12px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
              All
            </button>
            {ACTIVE_STAGES.map(s => (
              <button key={s.key} onClick={() => setFilter(s.key)}
                style={{ border:`2px solid ${filterStatus===s.key ? s.color : '#dde3ec'}`,
                  background: filterStatus===s.key ? s.bg : '#fff',
                  color: filterStatus===s.key ? s.color : '#6b7c93',
                  borderRadius:20, padding:'4px 12px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                {s.label}
                {(() => { const n = pendingAll.filter(r => r.status === s.key).length; return n > 0 ? ` (${n})` : '' })()}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── History Filter Bar ── */}
      {mainTab === 'history' && (
        <div style={{ padding:'10px 16px', background:'#f8fafd', borderBottom:'1px solid #e8edf5' }}>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
            <input
              placeholder="🔍 Search MR#, purpose…"
              value={histSearch}
              onChange={e => setHistSearch(e.target.value)}
              style={{ ...S.inp, maxWidth:220, padding:'7px 11px', fontSize:12 }}
            />
            <select value={histDeptFilter} onChange={e => setHistDeptFilter(e.target.value)}
              style={{ ...S.inp, maxWidth:180, cursor:'pointer', padding:'7px 11px', fontSize:12 }}>
              <option value="">All Departments</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.dept_code || d.dept_name}</option>)}
            </select>
            <label style={{ fontSize:11, fontWeight:700, color:'#6b7c93' }}>FROM</label>
            <input type="date" value={histFrom} onChange={e => setHistFrom(e.target.value)}
              style={{ ...S.inp, width:150, padding:'6px 10px' }} />
            <label style={{ fontSize:11, fontWeight:700, color:'#6b7c93' }}>TO</label>
            <input type="date" value={histTo} onChange={e => setHistTo(e.target.value)}
              style={{ ...S.inp, width:150, padding:'6px 10px' }} />
            {(histSearch || histDeptFilter) && (
              <button onClick={() => { setHistSearch(''); setHistDeptFilter('') }}
                style={{ ...S.btn('#f0f4f8','#c62828'), padding:'7px 14px', fontSize:12 }}>
                ✕ Clear
              </button>
            )}
            <span style={{ fontSize:12, color:'#6b7c93' }}>
              {filteredHistory.length} record{filteredHistory.length !== 1 ? 's' : ''}
            </span>
            <button onClick={exportHistoryExcel}
              disabled={!filteredHistory.length}
              style={{ ...S.btn(filteredHistory.length ? '#2e7d32' : '#ccc', '#fff'), marginLeft:'auto' }}>
              ⬇ Export CSV
            </button>
          </div>
        </div>
      )}

      {/* List — accordion */}
      <div style={S.card}>
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>
            {mainTab === 'history'
              ? 'No requests match your filters in this date range'
              : (mrSearch || mrDeptFilter || filterStatus !== 'ALL')
                ? 'No requests match your filters'
                : 'No pending requests'}
          </div>
        ) : (
          <div>
            {/* Column headers */}
            <div style={{ display:'grid', gridTemplateColumns:'130px 90px 70px 1fr 110px 90px', gap:8,
              padding:'8px 16px', background:'#0D5C4E', borderBottom:'1px solid #0a4a3d',
              fontSize:10, fontWeight:800, color:'#fff', textTransform:'uppercase', letterSpacing:0.5,
              fontFamily:"'Poppins',sans-serif" }}>
              <span>MR #</span><span>Date</span><span>Dept</span><span>Purpose</span><span>Requested</span><span>Stage</span>
            </div>

            {visible.map((r, idx) => {
              const st       = stageInfo(r.status)
              const isOpen   = expandedId === r.id
              const dept     = r.department_name || r.department || '—'
              const balance  = (r.received_amount || 0) - (r.distributed_amount || 0)

              return (
                <div key={r.id} style={{ borderBottom:'1px solid #f0f4f8' }}>

                  {/* ── Summary row (always visible) ── */}
                  <div
                    onClick={() => setExpandedId(isOpen ? null : r.id)}
                    style={{ display:'grid', gridTemplateColumns:'130px 90px 70px 1fr 110px 90px 28px',
                      gap:8, padding:'11px 16px', cursor:'pointer', alignItems:'center',
                      background: isOpen ? '#E1F5EE' : idx % 2 === 0 ? '#fff' : '#fafbfc',
                      transition:'background 0.15s' }}>

                    <span style={{ fontSize:13, fontWeight:800, color:'#0D5C4E', fontFamily:'monospace' }}>
                      {r.request_number || '—'}
                    </span>
                    <span style={{ fontSize:12, color:'#6b7c93' }}>{r.request_date}</span>
                    <span style={{ fontSize:11 }}>
                      <span style={{ background:'#E1F5EE', color:'#0D5C4E', borderRadius:5,
                        padding:'2px 7px', fontWeight:700, fontSize:11 }}>{dept}</span>
                    </span>
                    <span style={{ fontSize:12, color:'#1a2540', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {r.purpose}
                    </span>
                    <span style={{ fontSize:13, fontWeight:800, color:'#1a2540' }}>
                      SAR {(r.amount || 0).toLocaleString()}
                    </span>
                    <span style={{ display:'flex', flexDirection:'column', gap:3, alignItems:'flex-start' }}>
                      <span style={S.chip(st.bg, st.color)}>{st.label}</span>
                      {r.status === 'FUNDS_SENT' && r.funds_sent_at && !r.dh_acked_at && (() => {
                        const age = Math.floor((Date.now() - new Date(r.funds_sent_at).getTime()) / 86400000)
                        const bg  = age >= 30 ? '#ffcdd2' : age >= 15 ? '#ffe0b2' : '#e8f5e9'
                        const col = age >= 30 ? '#b71c1c' : age >= 15 ? '#e65100' : '#2e7d32'
                        return <span style={{ fontSize:9, fontWeight:800, color:col, background:bg, borderRadius:4, padding:'1px 5px' }}>
                          {age >= 30 ? '⛔' : age >= 15 ? '⚠️' : '📋'} Day {age}/30
                        </span>
                      })()}
                    </span>
                    <span style={{ fontSize:16, color:'#aab2bd', textAlign:'center', userSelect:'none' }}>
                      {isOpen ? '▲' : '▼'}
                    </span>
                  </div>

                  {/* ── Expanded detail ── */}
                  {isOpen && (
                    <div style={{ padding:'14px 20px 18px', background:'#f7f9ff',
                      borderTop:'1px solid #e3eaf8', display:'flex', flexDirection:'column', gap:14 }}>

                      {/* Financial pills */}
                      <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                        {[
                          { label:'Bank',        val: r.paid_from || '—',                    bg:'#e3f2fd', color:'#1565c0' },
                          { label:'Received',    val: r.received_amount > 0 ? `SAR ${(r.received_amount||0).toLocaleString()}` : '—',   bg:'#e8f5e9', color:'#2e7d32' },
                          { label:'Distributed', val: r.distributed_amount > 0 ? `SAR ${(r.distributed_amount||0).toLocaleString()}` : '—', bg:'#fff3e0', color:'#e65100' },
                          { label:'Balance',     val: `SAR ${balance.toLocaleString()}`,
                            bg: balance > 0.01 ? '#fff8e1' : '#eceff1',
                            color: balance > 0.01 ? '#f57f17' : '#37474f' },
                        ].map(({ label, val, bg, color }) => (
                          <div key={label} style={{ background:bg, borderRadius:8, padding:'6px 14px', display:'flex', flexDirection:'column', gap:2 }}>
                            <span style={{ fontSize:9, fontWeight:800, color, textTransform:'uppercase', letterSpacing:0.5 }}>{label}</span>
                            <span style={{ fontSize:13, fontWeight:800, color }}>{val}</span>
                          </div>
                        ))}
                      </div>

                      {/* Action buttons + open-detail link */}
                      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
                        {r.status === 'PENDING' && <>
                          <button onClick={e => { e.stopPropagation(); moveTo(r,'DH_APPROVED') }}
                            style={S.btn('#e3f2fd','#0277bd')}>✓ DH Approve</button>
                          <button onClick={e => { e.stopPropagation(); moveTo(r,'DH_REJECTED') }}
                            style={S.btn('#ffebee','#c62828')}>✕ Reject</button>
                        </>}
                        {r.status === 'DH_APPROVED' && (
                          <button onClick={e => { e.stopPropagation(); moveTo(r,'ACCTS_PENDING') }}
                            style={S.btn('#f3e5f5','#6a1b9a')}>→ Send to Accounts</button>
                        )}
                        <button onClick={e => { e.stopPropagation(); openDetail(r) }}
                          style={{ ...S.btn('#0D5C4E','#fff'), marginLeft:'auto' }}>
                          📋 Open Full Detail
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Party Outstanding Balance Warning Modal (non-blocking) ── */}
      {partyWarning && (
        <div style={{ ...S.overlay, zIndex: 1200 }} onClick={() => setPartyWarning(null)}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, maxWidth:420, width:'100%', boxShadow:'0 8px 40px rgba(0,0,0,0.18)' }}
               onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:22, marginBottom:8 }}>⚠️</div>
            <div style={{ fontWeight:800, fontSize:16, color:'#b71c1c', marginBottom:10 }}>Outstanding Balance Warning</div>
            <div style={{ fontSize:14, color:'#333', lineHeight:1.6, marginBottom:20 }}>
              <strong>{partyWarning.name}</strong> has{' '}
              <strong style={{ color:'#e65100' }}>{partyWarning.count} active money request{partyWarning.count !== 1 ? 's' : ''}</strong>{' '}
              totalling <strong>SAR {partyWarning.amount.toLocaleString()}</strong> that are still open/unsettled.
              <br /><br />
              You may proceed, but please check with Accounts before submitting a new request for this party.
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button
                style={{ ...S.btn, background:'#e3f2fd', color:'#1565c0', fontWeight:700 }}
                onClick={() => setPartyWarning(null)}>
                OK — Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create MR Modal ── */}
      {showCreate && (() => {
        const modalEmpList  = deptEmployees
        const modalProjList = deptProjects.length > 0 ? deptProjects : projects  // fallback to all entity projects until dept is selected
        const totalAmt      = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
        const activeLines   = lines.filter(l => parseFloat(l.amount) > 0).length

        // Party type color/icon config
        const PC = {
          'Employee':       { color:'#1565c0', bg:'#e8f2ff', icon:'👤' },
          'Sub-Contractor': { color:'#e65100', bg:'#fff3ef', icon:'🔧' },
          'Supplier':       { color:'#6a1b9a', bg:'#f5eeff', icon:'🏢' },
          'Local-Supplier': { color:'#00695c', bg:'#e0f5f1', icon:'🛒' },
          'Government':     { color:'#b71c1c', bg:'#fff0f0', icon:'🏛️' },
          'ANB-77':         { color:'#2e7d32', bg:'#edfff0', icon:'🏦' },
          'ANB-39':         { color:'#006064', bg:'#e0fafd', icon:'🏦' },
          'Others':         { color:'#5d4037', bg:'#f5efec', icon:'📌' },
        }
        const pc = ln => PC[ln.party_type] || { color:'#8a9ab5', bg:'#f8fafd', icon:'—' }

        const fSel = {
          width:'100%', padding:'9px 12px', borderRadius:8,
          border:'1.5px solid #dde6f0', fontSize:12, outline:'none',
          fontFamily:'inherit', background:'#fff', color:'#1a2540', cursor:'pointer',
          appearance:'none',
          backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238a9ab5' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
          backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center', paddingRight:26,
        }
        const fInp = {
          width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #dde6f0',
          fontSize:12, outline:'none', fontFamily:'inherit', background:'#fff', color:'#1a2540', boxSizing:'border-box',
        }
        const fLbl = { display:'block', fontSize:10, fontWeight:800, color:'#8a9ab5',
          textTransform:'uppercase', letterSpacing:0.7, marginBottom:5 }

        const { L1, L2 } = getChapterPalette(MC)

        return (
          <div style={S.overlay} onClick={() => { setShowCreate(false); resetCreate() }}>
            {/* ── Layer 1: muted chapter-colour outer frame ── */}
            <div style={{
              borderRadius:22, width:'min(1100px,97vw)', height:'min(660px,95vh)',
              boxShadow:'0 32px 100px rgba(0,0,0,0.28)',
              background:L1, padding:10, boxSizing:'border-box',
            }} onClick={e => e.stopPropagation()}>

              {/* ── Layer 2: light tint inner area ── */}
              <div style={{ background:L2, borderRadius:10, position:'relative',
                display:'flex', flexDirection:'row', overflow:'hidden', height:'100%' }}>

              {/* ── Layer 3: accent block — top-right corner ── */}
              <div style={{ position:'absolute', top:0, right:0, width:210, height:60,
                background:MC, borderBottomLeftRadius:18, zIndex:1, pointerEvents:'none' }} />

              {/* ── LEFT INFO PANEL — sits on Layer 2 background ── */}
              <div style={{ width:190, flexShrink:0, padding:'20px 16px 18px',
                display:'flex', flexDirection:'column', zIndex:2, position:'relative' }}>
                {/* company name */}
                <div style={{ fontSize:8, fontWeight:800, letterSpacing:0.8, textTransform:'uppercase',
                  color:MC, marginBottom:3 }}>
                  Ratal Advanced Technologies
                </div>
                {/* module label */}
                <div style={{ fontSize:8, fontWeight:900, letterSpacing:2.2, textTransform:'uppercase',
                  color:MC, marginBottom:20 }}>
                  Operations
                </div>
                {/* icon + title */}
                <div style={{ fontSize:28, marginBottom:8, lineHeight:1 }}>💰</div>
                <div style={{ fontSize:18, fontWeight:900, color:'#1a2a26', lineHeight:1.2,
                  letterSpacing:'-0.3px', marginBottom:8 }}>
                  {editingMR ? 'Edit Money Request' : 'New Money Request'}
                </div>
                {editingMR && (
                  <div style={{ fontSize:10, color:MC, marginBottom:6, fontWeight:700 }}>
                    {editingMR.request_number}
                  </div>
                )}
                {/* divider */}
                <div style={{ height:1, background:`${MC}33`, margin:'4px 0 12px' }} />
                {/* description */}
                <div style={{ fontSize:10, color:'#4a6560', lineHeight:1.65, marginBottom:14 }}>
                  Fill in the details below — the DH will be notified for approval
                </div>
                {/* Step indicator */}
                <div style={{ fontSize:9, fontWeight:800, color:MC, marginBottom:8, letterSpacing:0.5 }}>
                  STEP {mrStep} OF 2
                </div>
                {[['Request Details','Lines & amounts'],['Attachments','Files (optional)']].map(([name,desc],idx)=>{
                  const sn=idx+1, isAct=mrStep===sn, isDone=mrStep>sn
                  return (
                    <div key={sn} onClick={()=>isDone&&setMrStep(sn)}
                      style={{ display:'flex', flexDirection:'column', padding:'6px 0 6px 10px', cursor:isDone?'pointer':'default',
                        borderLeft:isAct?`3px solid ${MC}`:isDone?`3px solid ${MC}55`:'3px solid rgba(0,0,0,0.08)', marginBottom:3 }}>
                      <span style={{ fontSize:11, fontWeight:isAct?700:500, color:isAct?'#172D37':isDone?MC:'#8a9ab5' }}>
                        {name} {isDone&&'✓'}
                      </span>
                      <span style={{ fontSize:10, color:'#aab2bd' }}>{desc}</span>
                    </div>
                  )
                })}
              </div>

              {/* ── Layer 4: WHITE CARD ── */}
              <div style={{ flex:1, background:'#fff', borderRadius:12,
                margin:'48px 10px 10px 0', display:'flex', flexDirection:'column',
                overflow:'hidden', zIndex:2, boxShadow:'0 2px 20px rgba(0,0,0,0.10)' }}>

              {/* card header */}
              <div style={{ padding:'10px 18px 8px', borderBottom:'1px solid #f1f5f9',
                display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                <div style={{ fontSize:13, fontWeight:800, color:'#1e293b' }}>
                  {mrStep===1 ? (editingMR ? `✏️ Edit — ${editingMR.request_number}` : 'Request Details') : 'Attachments (Optional)'}
                </div>
                <button onClick={() => { setShowCreate(false); resetCreate() }}
                  style={{ width:26, height:26, borderRadius:'50%', background:'#f1f5f9', border:'none',
                    fontSize:12, color:'#64748b', cursor:'pointer', display:'flex',
                    alignItems:'center', justifyContent:'center' }}>✕</button>
              </div>

              {/* ── Scrollable body ── */}
              <div style={{ flex:1, overflowY:'auto', padding:'14px 18px 6px' }}>

              {mrStep===1 && <>
                {/* ── STICKY HEADER: Info row (compact single line) + REQUEST LINES + column headers ── */}
                <div style={{ position:'sticky', top:0, zIndex:10, background:'#fff',
                  marginBottom:10, paddingTop:10, paddingBottom:8,
                  borderBottom:'1.5px solid #eaeff6',
                  marginLeft:-18, marginRight:-18, marginTop:-14,
                  paddingLeft:18, paddingRight:18 }}>

                  {/* Compact single-line info row */}
                  <div style={{ display:'grid', gridTemplateColumns:'140px 1fr 1fr', gap:10, marginBottom:10 }}>
                    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                      <label style={{ fontSize:9, fontWeight:800, color:'#8a9ab5', textTransform:'uppercase', letterSpacing:0.5 }}>📅 Date</label>
                      <input type="date" value={form.request_date}
                        onChange={e => setForm(f => ({ ...f, request_date: e.target.value }))}
                        style={{ ...fInp, fontWeight:700, padding:'6px 9px', fontSize:12 }} />
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                      <label style={{ fontSize:9, fontWeight:800, color:'#8a9ab5', textTransform:'uppercase', letterSpacing:0.5 }}>🏢 Department *</label>
                      <select style={{ ...fSel, padding:'6px 9px', fontSize:12 }} value={form.dept_id || ''} onChange={e => onCreateDeptChange(e.target.value)}>
                        <option value="">— Select Department —</option>
                        {depts.map(d => <option key={d.id} value={d.id}>{d.dept_code || d.dept_name}</option>)}
                      </select>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:2, opacity: form.dept_id ? 1 : 0.55 }}>
                      <label style={{ fontSize:9, fontWeight:800, color:'#8a9ab5', textTransform:'uppercase', letterSpacing:0.5 }}>👤 Requestor * <span style={{ fontWeight:400 }}>· DH / PM / Supervisor</span></label>
                      <select style={{ ...fSel, padding:'6px 9px', fontSize:12 }} value={form.requested_by}
                        onChange={e => setForm(f => ({ ...f, requested_by: e.target.value }))}
                        disabled={!form.dept_id}>
                        <option value="">— Select Requestor —</option>
                        {modalEmpList.map(e => (
                          <option key={e.id} value={e.id}>
                            {e.full_name_en}{e.roleLabel ? ` · ${e.roleLabel}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* REQUEST LINES label */}
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                    <div style={{ width:3, height:14, background:`linear-gradient(${MC},${MC}88)`, borderRadius:2 }} />
                    <span style={{ fontSize:10, fontWeight:900, color:'#1a2540', textTransform:'uppercase', letterSpacing:1 }}>
                      Request Lines
                    </span>
                    <span style={{ fontSize:10, color:'#b0bec5' }}>— one line per party / payment type</span>
                  </div>

                  {/* Column headers — part of the sticky block so they never scroll away */}
                  <div style={{ display:'grid',
                    gridTemplateColumns:'minmax(110px,1.5fr) 100px 110px 85px 115px 140px 28px',
                    gap:8, background:'#f0f4fa', borderRadius:8,
                    border:'1px solid #e3e9f0' }}>
                    {['Name','Txn Type','Expense Type','Project','IBAN / SADAD','Amount (SAR)',''].map((h,hi) => (
                      <div key={hi} style={{ padding:'5px 14px', fontSize:9.5, fontWeight:800,
                        color:'#8a9ab5', textTransform:'uppercase', letterSpacing:0.5 }}>{h}</div>
                    ))}
                  </div>
                </div>

                {/* ── Grouped Line Cards ── */}
                {(() => {
                  // Build groups (virtual — array order unchanged, display is grouped)
                  const GROUP_ORDER = ['Employee','Sub-Contractor','Supplier','Local-Supplier','Government','ANB-77','ANB-39','Others']
                  const groups = {}   // partyType → [{ln, i}]
                  const ungrouped = [] // no party_type yet
                  lines.forEach((ln, i) => {
                    if (!ln.party_type) ungrouped.push({ ln, i })
                    else {
                      if (!groups[ln.party_type]) groups[ln.party_type] = []
                      groups[ln.party_type].push({ ln, i })
                    }
                  })
                  const activeGroupKeys = GROUP_ORDER.filter(k => groups[k])

                  // Add a new line pre-typed with a party type
                  const addLineOfType = (pt) => {
                    const nl = { ...EMPTY_LINE, party_type: pt }
                    if (pt === 'ANB-77') { nl.party_name = 'Tech-3'; nl.iban = 'ANB-77' }
                    if (pt === 'ANB-39') { nl.party_name = 'Tech-2'; nl.iban = 'ANB-39' }
                    setLines(prev => [...prev, nl])
                  }

                  // Compact line row (used inside a group card)
                  const renderLineRow = ({ ln, i }) => {
                    const rp          = pc(ln)
                    const vendorType  = MR_VENDOR_TYPE_MAP[ln.party_type]
                    const partyCons   = vendorType ? contractors.filter(c => c.vendor_type === vendorType) : []
                    const expenseOpts = MR_EXPENSE_TYPES_BY_PARTY[ln.party_type] || []
                    const isGov       = ln.party_type === 'Government'
                    const isANB       = ['ANB-77','ANB-39'].includes(ln.party_type)
                    const isEmployee  = ln.party_type === 'Employee'
                    const deptEmpsAll = deptAllEmps.length ? deptAllEmps : deptEmployees
                    const hasAmt      = parseFloat(ln.amount) > 0
                    const rSel        = { ...fSel, fontSize:11, padding:'7px 10px', paddingRight:22 }
                    const rInp        = { ...fInp, fontSize:11, padding:'7px 10px' }

                    return (
                      <div key={i} style={{ display:'grid',
                        gridTemplateColumns:'minmax(110px,1.5fr) 100px 110px 85px 115px 140px 28px',
                        gap:8, padding:'8px 14px', alignItems:'center',
                        borderBottom:'1px solid #f0f5fa', background:'#fff' }}>

                        {/* Party Name (contextual) */}
                        {isEmployee && (
                          <select style={rSel} value={ln.party_id}
                            onChange={e => {
                              const emp = deptEmpsAll.find(x => x.id === e.target.value)
                              handleCreatePartySelect(i, 'Employee', e.target.value, emp?.full_name_en || '')
                            }}>
                            <option value="">— Employee —</option>
                            {deptEmpsAll.map(e => <option key={e.id} value={e.id}>{e.full_name_en}</option>)}
                          </select>
                        )}
                        {vendorType && (
                          <select style={rSel} value={ln.party_id}
                            onChange={e => {
                              const con = partyCons.find(c => c.id === e.target.value)
                              handleCreatePartySelect(i, ln.party_type, e.target.value, con?.contractor_name || con?.company_name || '')
                            }}>
                            <option value="">— {ln.party_type} —</option>
                            {partyCons.map(c => <option key={c.id} value={c.id}>{c.contractor_name || c.company_name}</option>)}
                          </select>
                        )}
                        {isGov && (
                          <input style={rInp} placeholder="Entity name…" value={ln.party_name}
                            onChange={e => updateCreateLine(i, { party_name: e.target.value })} />
                        )}
                        {isANB && (
                          <div style={{ padding:'7px 10px', background:rp.bg, borderRadius:8,
                            fontSize:12, fontWeight:800, color:rp.color }}>
                            {ln.party_name} ✓
                          </div>
                        )}
                        {ln.party_type === 'Others' && (
                          <input style={rInp} placeholder="Party name…" value={ln.party_name}
                            onChange={e => updateCreateLine(i, { party_name: e.target.value })} />
                        )}

                        {/* Transaction Type */}
                        <select style={rSel} value={ln.payment_type}
                          onChange={e => updateCreateLine(i, { payment_type: e.target.value })}>
                          <option value="">— Txn Type —</option>
                          {MR_PAYMENT_TYPES.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
                        </select>

                        {/* Expense Type */}
                        <select style={{ ...rSel, opacity: !ln.party_type ? 0.4 : 1 }}
                          value={ln.expense_type}
                          onChange={e => updateCreateLine(i, { expense_type: e.target.value })}
                          disabled={!ln.party_type}>
                          <option value="">{ln.party_type ? '— Expense —' : '—'}</option>
                          {expenseOpts.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
                        </select>

                        {/* Project */}
                        <select style={rSel} value={ln.project_id}
                          onChange={e => updateCreateLine(i, { project_id: e.target.value })}>
                          <option value="">— Proj —</option>
                          {modalProjList.map(p3 => (
                            <option key={p3.id} value={p3.id}>{p3.project_number || p3.project_no}</option>
                          ))}
                        </select>

                        {/* IBAN / SADAD */}
                        {isGov ? (
                          <input style={{ ...rInp, background:'#fffde7', borderColor:'#f9c00d' }}
                            placeholder="SADAD…" value={ln.sadad_no}
                            onChange={e => updateCreateLine(i, { sadad_no: e.target.value })} />
                        ) : isANB ? (
                          <div style={{ padding:'7px 10px', background:rp.bg, borderRadius:8,
                            fontSize:11, fontWeight:800, color:rp.color }}>{ln.iban}</div>
                        ) : ln.iban_options?.length > 1 ? (
                          <select style={rSel} value={ln.iban}
                            onChange={e => updateCreateLine(i, { iban: e.target.value })}>
                            {ln.iban_options.map(b => (
                              <option key={b.id} value={b.iban}>{b.iban}{b.is_primary ? ' ★' : ''}</option>
                            ))}
                          </select>
                        ) : (
                          <input style={rInp} placeholder="SA76…" value={ln.iban}
                            onChange={e => updateCreateLine(i, { iban: e.target.value })} />
                        )}

                        {/* Amount — SAR badge + full-width number input */}
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          <span style={{ flexShrink:0, fontSize:9, fontWeight:800, color: hasAmt ? rp.color : '#8a9ab5',
                            background: hasAmt ? rp.bg : '#f0f4f8', borderRadius:5,
                            padding:'3px 5px', letterSpacing:0.5 }}>SAR</span>
                          <input type="number" min="0" step="0.01" placeholder="0.00" value={ln.amount}
                            onChange={e => updateCreateLine(i, { amount: e.target.value })}
                            style={{ ...rInp, flex:1, minWidth:0, fontSize:13, fontWeight:900,
                              color: hasAmt ? rp.color : '#1a2540',
                              borderColor: hasAmt ? rp.color : '#dde6f0',
                              background: hasAmt ? rp.bg : '#fff',
                              textAlign:'right', paddingRight:8, paddingLeft:6,
                            }} />
                        </div>

                        {/* Delete */}
                        {lines.length > 1
                          ? <button onClick={() => setLines(lines.filter((_,j) => j !== i))}
                              style={{ background:'rgba(198,40,40,0.08)', color:'#c62828', border:'none',
                                borderRadius:7, width:28, height:28, cursor:'pointer', fontSize:13,
                                display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
                          : <div />}
                      </div>
                    )
                  }

                  const colHdr = { padding:'5px 14px', fontSize:9.5, fontWeight:800,
                    color:'#8a9ab5', textTransform:'uppercase', letterSpacing:0.5 }

                  return (
                    <div style={{ display:'flex', flexDirection:'column', gap:14, marginBottom:14 }}>

                      {/* ── Typed groups ── */}
                      {activeGroupKeys.map(groupKey => {
                        const group      = groups[groupKey]
                        const gp         = PC[groupKey] || { color:'#8a9ab5', bg:'#f8fafd', icon:'📝' }
                        const groupTotal = group.reduce((s,{ln}) => s + (parseFloat(ln.amount)||0), 0)
                        const partyLabel = MR_PARTY_TYPES.find(t => t.value === groupKey)?.label || groupKey

                        return (
                          <div key={groupKey} style={{ borderRadius:14, overflow:'hidden',
                            border:`1.5px solid ${gp.color}35`,
                            boxShadow:`0 3px 16px ${gp.color}18` }}>

                            {/* Group header */}
                            <div style={{ background:gp.color, padding:'10px 16px',
                              display:'flex', alignItems:'center', gap:10 }}>
                              <span style={{ fontSize:20 }}>{gp.icon}</span>
                              <span style={{ color:'#fff', fontWeight:900, fontSize:14 }}>{partyLabel}</span>
                              <span style={{ color:'rgba(255,255,255,0.55)', fontSize:12 }}>
                                · {group.length} line{group.length !== 1 ? 's' : ''}
                              </span>
                              <div style={{ flex:1 }} />
                              <div style={{ textAlign:'right' }}>
                                <div style={{ color:'rgba(255,255,255,0.55)', fontSize:9, fontWeight:700,
                                  textTransform:'uppercase', letterSpacing:0.8 }}>Group Total</div>
                                <div style={{ color:'#fff', fontWeight:900, fontSize:17, letterSpacing:-0.5 }}>
                                  SAR {groupTotal.toLocaleString()}
                                </div>
                              </div>
                            </div>

                            {/* Line rows */}
                            {group.map(item => renderLineRow(item))}

                            {/* Add to this group */}
                            <div style={{ padding:'8px 14px', background:`${gp.color}06` }}>
                              <button onClick={() => addLineOfType(groupKey)}
                                style={{ background:'none', border:`1.5px dashed ${gp.color}55`,
                                  borderRadius:8, padding:'5px 16px', cursor:'pointer',
                                  color:gp.color, fontSize:11, fontWeight:700 }}>
                                + Add {partyLabel} Line
                              </button>
                            </div>
                          </div>
                        )
                      })}

                      {/* ── Ungrouped (type not yet selected) ── */}
                      {ungrouped.map(({ ln, i }) => (
                        <div key={i} style={{ background:'#fff', borderRadius:14,
                          border:'1.5px dashed #c4d4e8', overflow:'hidden' }}>
                          <div style={{ padding:'10px 14px', background:'#f8fafd',
                            display:'flex', alignItems:'center', gap:8, flexWrap:'wrap',
                            borderBottom:'1px solid #eaeff6' }}>
                            <span style={{ fontSize:10, fontWeight:800, color:'#8a9ab5' }}>SELECT TYPE:</span>
                            <div style={{ display:'flex', gap:5, flexWrap:'wrap', flex:1 }}>
                              {MR_PARTY_TYPES.map(t => {
                                const tp = PC[t.value] || { color:'#6b7c93' }
                                return (
                                  <button key={t.value}
                                    onClick={() => {
                                      const pt = t.value
                                      updateCreateLine(i, { party_type:pt, party_id:'', party_name:'', iban:'', sadad_no:'', iban_options:[], expense_type:'' })
                                      if (['ANB-77','ANB-39'].includes(pt)) handleCreatePartySelect(i, pt, '', '')
                                    }}
                                    style={{ padding:'3px 10px', borderRadius:20, border:'1.5px solid transparent',
                                      cursor:'pointer', fontSize:11, fontWeight:700,
                                      background:'rgba(0,0,0,0.05)', color:'#6b7c93',
                                      transition:'all 0.12s' }}>
                                    {t.label}
                                  </button>
                                )
                              })}
                            </div>
                            {lines.length > 1 && (
                              <button onClick={() => setLines(lines.filter((_,j) => j !== i))}
                                style={{ background:'rgba(198,40,40,0.1)', color:'#c62828', border:'none',
                                  borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:14,
                                  display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                            )}
                          </div>
                          <div style={{ padding:'12px 16px', color:'#b0bec5', fontSize:12, fontStyle:'italic' }}>
                            ← Click a type above to assign this line to a group
                          </div>
                        </div>
                      ))}

                      {/* Global add line */}
                      <button onClick={() => setLines(prev => [...prev, { ...EMPTY_LINE }])}
                        style={{ width:'100%', padding:'10px 0', borderRadius:12, cursor:'pointer',
                          background:'transparent', border:'2px dashed #c4d4e8', color:'#1565c0',
                          fontSize:13, fontWeight:700,
                          display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                        + Add New Line
                      </button>
                    </div>
                  )
                })()}
              </>}

              {mrStep===2 && (
                <div>
                  <div style={{ marginBottom:14, fontSize:13, color:'#53666F', lineHeight:1.7 }}>
                    Attach supporting documents — purchase quotes, invoice scans, WhatsApp evidence. <strong>Optional</strong> — you can submit without attachments.
                  </div>
                  {mrAttachments.length > 0 && (
                    <div style={{ marginBottom:14 }}>
                      {mrAttachments.map((file, i)=>(
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', background:'#f8fafc', borderRadius:8, marginBottom:6, border:'1px solid #e0e8f0' }}>
                          <span style={{ fontSize:16 }}>📎</span>
                          <span style={{ flex:1, fontSize:12, color:'#172D37', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{file.name}</span>
                          <span style={{ fontSize:11, color:'#53666F' }}>{(file.size/1024).toFixed(0)} KB</span>
                          <button onClick={()=>setMrAttachments(a=>a.filter((_,j)=>j!==i))} style={{ background:'#fee2e2', border:'none', borderRadius:6, color:'#c62828', padding:'2px 9px', cursor:'pointer', fontSize:11, fontWeight:700 }}>Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                  <input ref={mrFileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                    style={{ display:'none' }}
                    onChange={e=>setMrAttachments(a=>[...a,...Array.from(e.target.files)])} />
                  <button onClick={()=>mrFileRef.current?.click()}
                    style={{ width:'100%', padding:'18px', border:`2px dashed ${MC}55`, borderRadius:12, background:`${MC}09`, color:MC, fontSize:14, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10, marginBottom:14 }}>
                    <span style={{ fontSize:20 }}>+</span> Add Attachment (Quote, Invoice, Receipt…)
                  </button>
                  <div style={{ padding:'12px 14px', background:'#fffde7', borderRadius:9, border:'1px solid #ffe082', fontSize:11, color:'#7a6000' }}>
                    ℹ Files upload to Google Drive when the request is saved. Supported: PDF, JPG, PNG, DOC, XLS (max 25 MB each). Zero attachments allowed.
                  </div>
                </div>
              )}
              </div>

              {/* ── Sticky footer — Layer 5 buttons ── */}
              <div style={{ padding:'10px 18px 12px', borderTop:'1px solid #eaeff6',
                flexShrink:0, background:'#fff', borderRadius:'0 0 12px 12px',
                display:'flex', alignItems:'center', gap:12 }}>
                {mrStep===1 && (
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, fontWeight:800, color:'#8a9ab5', textTransform:'uppercase', letterSpacing:0.7 }}>
                      {activeLines} line{activeLines !== 1 ? 's' : ''} · Grand Total
                    </div>
                    <div style={{ fontSize:24, fontWeight:900, color: totalAmt > 0 ? '#1349a0' : '#c0cdd8', letterSpacing:-1, lineHeight:1 }}>
                      SAR {totalAmt > 0 ? totalAmt.toLocaleString() : '0'}
                    </div>
                  </div>
                )}
                {mrStep===2 && (
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, fontWeight:800, color:'#8a9ab5', textTransform:'uppercase', letterSpacing:0.7 }}>Attachments</div>
                    <div style={{ fontSize:13, color:'#53666F' }}>{mrAttachments.length} file{mrAttachments.length!==1?'s':''} selected</div>
                  </div>
                )}
                {/* Layer 5 Back — universal grey pill */}
                <button
                  onClick={() => mrStep===1 ? (setShowCreate(false), resetCreate()) : setMrStep(1)}
                  style={{ padding:'10px 24px', borderRadius:20, border:'none',
                    background:BACK_BTN_COLOR, color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  {mrStep===1 ? 'Cancel' : '← Back'}
                </button>
                {/* Layer 5 Action — chapter accent (MC) pill */}
                {mrStep===1 ? (
                  <button onClick={() => setMrStep(2)} disabled={totalAmt <= 0}
                    style={{ padding:'10px 28px', borderRadius:20, border:'none', fontSize:13, fontWeight:800,
                      cursor: totalAmt > 0 ? 'pointer' : 'default',
                      background: totalAmt > 0 ? MC : '#cfd8dc',
                      color:'#fff', boxShadow: totalAmt > 0 ? `0 4px 16px ${MC}55` : 'none' }}>
                    Save & Next →
                  </button>
                ) : (
                  <button onClick={createMR} disabled={saving}
                    style={{ padding:'10px 28px', borderRadius:20, border:'none', fontSize:13, fontWeight:800,
                      cursor: !saving ? 'pointer' : 'default',
                      background: !saving ? MC : '#cfd8dc',
                      color:'#fff', boxShadow: !saving ? `0 4px 16px ${MC}55` : 'none' }}>
                    {saving ? '⏳ Saving…' : editingMR
                      ? `↩ Resubmit to Accounts — SAR ${totalAmt > 0 ? totalAmt.toLocaleString() : '0'}`
                      : `💰 Submit${totalAmt > 0 ? ` — SAR ${totalAmt.toLocaleString()}` : ''}`}
                  </button>
                )}
              </div>

              </div>{/* end WHITE CARD (Layer 4) */}
              </div>{/* end Layer 2 inner tint */}
            </div>{/* end Layer 1 frame */}
          </div>
        )
      })()}

      {/* ── Detail Drawer ── */}
      {detail && (
        <div style={S.overlay} onClick={() => setDetail(null)}>
          <div style={S.drawer} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
              <div>
                <h2 style={{ margin:0, fontSize:18, color:'#1a2540' }}>{detail.request_number || '—'}</h2>
                <div style={{ fontSize:13, color:'#6b7c93', marginTop:3 }}>
                  {detail.purpose} · {detail.request_date} · <strong>{detail.paid_from}</strong>
                  {(detail.department_name || detail.department) && <span> · {detail.department_name || detail.department}</span>}
                </div>
              </div>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                {(() => { const st=stageInfo(detail.status); return <span style={S.chip(st.bg, st.color)}>{st.label}</span> })()}
                <button
                  onClick={() => {
                    // ── Requestor name + role ────────────────────────────────
                    const requestorEmp  = employees.find(e => e.id === detail.requested_by)
                    const requestorName = requestorEmp?.full_name_en || detail.requested_by || ''
                    const dept          = depts.find(d => d.id === detail.department_id)
                    let   requestorRole = 'Department Staff'
                    if (dept) {
                      if (dept.dept_head_id  === detail.requested_by) requestorRole = 'Department Head'
                      else if (dept.pm_id    === detail.requested_by) requestorRole = 'Project Manager'
                      else if (dept.supervisor_id === detail.requested_by) requestorRole = 'Supervisor'
                    }

                    // ── Project label ────────────────────────────────────────
                    const proj = projects.find(p => p.id === detail.project_id)
                    const projectLabel = proj
                      ? [proj.project_number, proj.project_name].filter(Boolean).join(' — ')
                      : detail.project_name || ''

                    // ── All expense-type codes → display names ───────────────
                    const allExpenseCodes = Object.values(MR_EXPENSE_TYPES_BY_PARTY).flat()

                    // ── Map detail lines ─────────────────────────────────────
                    const printLines = detailLines.map(l => {
                      const partyName    = l.supplier_name || l.party_name || ''
                      const expMatch     = allExpenseCodes.find(e => e.code === l.account_code)
                      const expenseLabel = expMatch?.name || l.account_code || ''
                      const lineProj     = projects.find(p => p.id === l.project_id)
                      return {
                        party_type:    l.party_type   || '',
                        party_name:    partyName,
                        expense_type:  expenseLabel,
                        payment_type:  l.line_type    || '',
                        project_number: lineProj?.project_number || '',
                        amount:        l.amount       || 0,
                        iban:          l.iban         || '',
                        remarks:       l.remarks      || '',
                      }
                    })

                    // Unique project numbers from lines (for subject line)
                    const projectNumbers = [...new Set(
                      printLines.map(l => l.project_number).filter(Boolean)
                    )]

                    // File name: "Money Request-MR-2026-09-001-220926.pdf"
                    const mrNo  = detail.request_number || detail.id
                    const [rYr, rMo, rDy] = (detail.request_date || '').split('-')
                    const dateStr = rDy && rMo && rYr ? `${rDy}${rMo}${rYr.slice(2)}` : ''

                    printDocument('money_request', {
                      request_number:    detail.request_number || '',
                      request_date:      detail.request_date   || '',
                      department:        detail.department_name || detail.department || '',
                      purpose:           detail.purpose        || '',
                      project_numbers:   projectNumbers,
                      project_list:      projectLabel,
                      recipient_name:    'Mahmood Shahbaz',
                      recipient_title:   'The General Manager',
                      recipient_company: 'Ratal Advanced Technologies',
                      requested_by_name: requestorName,
                      requested_by_role: requestorRole,
                      lines:             printLines,
                    }, {
                      driveFolder:   'money-requests',
                      driveFileName: `Money Request-${mrNo}-${dateStr}.pdf`,
                      mrId:          detail.id,
                      requestDate:   detail.request_date || '',
                    })
                  }}
                  style={{ background:'#1565c0', color:'#fff', border:'none', borderRadius:7, padding:'6px 14px', cursor:'pointer', fontSize:12, fontWeight:700 }}
                  title="Print Money Request as PDF — also includes Save to Drive button"
                >🖨️ Print / Drive</button>
                {detail.drive_url && (
                  <a href={detail.drive_url} target="_blank" rel="noopener noreferrer"
                    style={{ background:'#e8f5e9', color:'#2e7d32', borderRadius:7, padding:'6px 12px', fontSize:12, fontWeight:700, textDecoration:'none' }}
                    title="Open saved PDF in Google Drive">
                    📁 Drive
                  </a>
                )}
                <button onClick={() => setDetail(null)}
                  style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#aab2bd' }}>✕</button>
              </div>
            </div>

            {/* Summary strip */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:18 }}>
              {[
                { label:'Requested',   val: detail.amount || 0,                         color:'#1565c0' },
                { label:'Received',    val: totalReceived || detail.received_amount || 0, color:'#0277bd' },
                { label:'Distributed', val: totalDistributed || detail.distributed_amount || 0, color:'#2e7d32' },
                { label:'Balance',     val: (totalReceived || detail.received_amount || 0) - (totalDistributed || detail.distributed_amount || 0),
                  color: (totalReceived - totalDistributed) > 0.01 ? '#e65100' : '#2e7d32' },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ background:'#f8fafd', borderRadius:10, padding:'10px 14px' }}>
                  <div style={{ fontSize:10, color:'#6b7c93', fontWeight:700, textTransform:'uppercase', marginBottom:3 }}>{label}</div>
                  <div style={{ fontSize:15, fontWeight:800, color }}>SAR {val.toLocaleString()}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display:'flex', gap:0, marginBottom:18, borderBottom:'2px solid #f0f4f8' }}>
              {[
                { key:'overview',   label:'Overview' },
                { key:'receive',    label:`Receive (${received.length})` },
                { key:'distribute', label:'Distribute' },
                { key:'log',        label:`Log (${dists.length})` },
                { key:'journal',    label:`Journal (${journals.length})` },
              ].map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  style={{ border:'none', background:'none', padding:'9px 18px', cursor:'pointer', fontSize:13, fontWeight:700,
                    color: activeTab === t.key ? '#1565c0' : '#6b7c93',
                    borderBottom: activeTab === t.key ? '2px solid #1565c0' : '2px solid transparent',
                    marginBottom:-2 }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ──────── Overview tab ──────── */}
            {activeTab === 'overview' && (
              <div>
                <div style={S.sec}>Planned Lines</div>
                <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:16 }}>
                  <thead><tr style={{ background:'#f8fafd' }}>
                    {['Type','Supplier / Notes','Account','Amount'].map(h => (
                      <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontSize:11, color:'#6b7c93', fontWeight:700 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {detailLines.length === 0
                      ? <tr><td colSpan={4} style={{ padding:20, textAlign:'center', color:'#aab2bd' }}>No lines</td></tr>
                      : detailLines.map(ln => (
                        <tr key={ln.id} style={{ borderTop:'1px solid #f0f4f8' }}>
                          <td style={{ padding:'8px 10px' }}><span style={S.chip('#e3f2fd','#1565c0')}>{ln.line_type?.replace(/_/g,' ')}</span></td>
                          <td style={{ padding:'8px 10px', fontSize:12 }}>{ln.supplier_name || '—'}</td>
                          <td style={{ padding:'8px 10px', fontSize:11, color:'#6b7c93' }}>{ln.account_code || '—'}</td>
                          <td style={{ padding:'8px 10px', fontSize:13, fontWeight:700 }}>SAR {(ln.amount || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>

                {detail.remarks && (
                  <div style={{ fontSize:12, color:'#6b7c93', background:'#f8fafd', borderRadius:8, padding:12, marginBottom:16 }}>
                    <strong>Remarks:</strong> {detail.remarks}
                  </div>
                )}

                {/* Send-Back / Resubmit Log — shown whenever accounts_note exists */}
                {detail.accounts_note && (() => {
                  const entries = detail.accounts_note.split('\n──────────\n')
                  const isDHReview = detail.status === 'DH_REVIEW'
                  return (
                    <div style={{ background: isDHReview ? '#fff3e0' : '#f8fafc',
                      border: '2px solid ' + (isDHReview ? '#fb8c00' : '#e2e8f0'),
                      borderRadius:10, padding:'12px 16px', marginBottom:14 }}>
                      <div style={{ fontWeight:800, color: isDHReview ? '#e65100' : '#475569', fontSize:13, marginBottom:8 }}>
                        {isDHReview ? '↩ Returned by Accounts Team — Action Required' : '📋 Accounts Activity Log'}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {entries.map((entry, i) => {
                          const isResubmit = entry.startsWith('✅')
                          return (
                            <div key={i} style={{
                              background: isResubmit ? '#f0fdf4' : '#fff7f0',
                              border: '1px solid ' + (isResubmit ? '#bbf7d0' : '#fed7aa'),
                              borderRadius:7, padding:'8px 12px',
                              borderLeft: '3px solid ' + (isResubmit ? '#16a34a' : '#f97316') }}>
                              <div style={{ fontSize:12, color:'#1e293b', whiteSpace:'pre-wrap' }}>{entry}</div>
                            </div>
                          )
                        })}
                      </div>
                      {isDHReview && (
                        <div style={{ fontSize:11, color:'#78350f', marginTop:8 }}>
                          Please correct the lines and resubmit — it will go straight back to Accounts.
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Action buttons */}
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {detail.status === 'PENDING' && <>
                    <button onClick={() => moveTo(detail,'DH_APPROVED')} style={S.btn('#e3f2fd','#0277bd')}>✓ DH Approve</button>
                    <button onClick={() => moveTo(detail,'DH_REJECTED')} style={S.btn('#ffebee','#c62828')}>✕ Reject</button>
                  </>}
                  {detail.status === 'DH_APPROVED' &&
                    <button onClick={() => moveTo(detail,'ACCTS_PENDING')} style={S.btn('#f3e5f5','#6a1b9a')}>→ Send to Accounts</button>}
                  {detail.status === 'ACCTS_PENDING' && <>
                    <button onClick={() => setActiveTab('receive')} style={S.btn('#0D5C4E','#fff')}>→ Record Receipt</button>
                    <button onClick={() => startEdit(detail)} style={S.btn('#fff3e0','#e65100')}>✏️ Recall & Edit</button>
                  </>}
                  {detail.status === 'DH_REVIEW' &&
                    <button onClick={() => startEdit(detail)}
                      style={{ ...S.btn('#e65100','#fff'), boxShadow:'0 2px 8px rgba(230,81,0,0.3)' }}>
                      ✏️ Edit & Resubmit to Accounts
                    </button>
                  }
                </div>

                {/* ── DH Acknowledgment Card (G6/N4) — shown when FUNDS_SENT ── */}
                {detail.status === 'FUNDS_SENT' && !detail.dh_acked_at && (() => {
                  const sentAt  = detail.funds_sent_at ? new Date(detail.funds_sent_at) : null
                  const ageDays = sentAt ? Math.floor((Date.now() - sentAt.getTime()) / 86400000) : 0
                  const isWarn  = ageDays >= 15
                  const isBlock = ageDays >= 30
                  return (
                    <div style={{
                      background: isBlock ? '#ffebee' : isWarn ? '#fff3e0' : '#e8f5e9',
                      border: `2px solid ${isBlock ? '#ef9a9a' : isWarn ? '#ffcc80' : '#a5d6a7'}`,
                      borderRadius: 12, padding: '16px 20px', marginTop: 16,
                    }}>
                      <div style={{ fontWeight:800, fontSize:14, color: isBlock ? '#b71c1c' : isWarn ? '#e65100' : '#2e7d32', marginBottom:8 }}>
                        {isBlock ? '⛔ OVERDUE — DH Acknowledgment Required' : isWarn ? '⚠️ DH Acknowledgment Pending' : '📋 Awaiting DH Acknowledgment'}
                      </div>
                      <div style={{ fontSize:12, color:'#555', marginBottom:12, lineHeight:1.6 }}>
                        Funds sent <strong>Day {ageDays}</strong> of 30.{' '}
                        {sentAt && <span>Sent on <strong>{sentAt.toLocaleDateString()}</strong>.</span>}{' '}
                        {isBlock
                          ? 'New money requests for this party are currently BLOCKED.'
                          : isWarn
                          ? `Blocking in ${30 - ageDays} day${30 - ageDays !== 1 ? 's' : ''} if not acknowledged.`
                          : 'Please confirm the DH has acknowledged receipt of funds.'}
                      </div>
                      <button onClick={handleDhAck} disabled={dhAcking}
                        style={{ ...S.btn(isBlock ? 'linear-gradient(135deg,#b71c1c,#c62828)' : isWarn ? 'linear-gradient(135deg,#e65100,#f57c00)' : 'linear-gradient(135deg,#2e7d32,#43a047)', '#fff'),
                          padding:'10px 24px', fontSize:13 }}>
                        {dhAcking ? '⏳ Recording…' : '✅ Record DH Acknowledgment'}
                      </button>
                    </div>
                  )
                })()}

                {/* ── Already acknowledged notice ── */}
                {detail.dh_acked_at && (
                  <div style={{ background:'#e8f5e9', border:'1px solid #a5d6a7', borderRadius:10, padding:'10px 16px', marginTop:16, fontSize:12 }}>
                    <strong style={{ color:'#2e7d32' }}>✅ DH Acknowledged</strong>
                    {' '}on {new Date(detail.dh_acked_at).toLocaleDateString()}
                    {detail.dh_acked_by && <span style={{ color:'#555' }}> by {detail.dh_acked_by}</span>}
                  </div>
                )}
              </div>
            )}

            {/* ──────── Receive tab (Layer 2) ──────── */}
            {activeTab === 'receive' && (() => {
              const CONTRA = ['ANB-77','ANB-39']
              const contraLines  = detailLines.filter(l => CONTRA.includes(l.party_type))
              const directLines  = detailLines.filter(l => !CONTRA.includes(l.party_type))
              const isIssued     = detail.status === 'ISSUED'
              const alreadyConf  = received.some(r => r.status === 'CONFIRMED')
              const isReadOnly   = isIssued || alreadyConf

              return (
              <div>
                <div style={S.sec}>Payment Confirmation</div>

                {/* ── No Contra lines → direct payment, no receive needed ── */}
                {contraLines.length === 0 && directLines.length > 0 && (
                  <div style={{ background:'#e8f5e9', border:'1px solid #a5d6a7', borderRadius:10, padding:16, marginBottom:16 }}>
                    <strong style={{ color:'#2e7d32' }}>✅ Direct Payment — No Physical Receipt Needed</strong>
                    <div style={{ fontSize:12, color:'#4a6741', marginTop:6, lineHeight:1.6 }}>
                      All lines in this MR are direct IBAN transfers to employees/vendors.<br/>
                      Payment was recorded in Payments page. TRN# is attached to each line.
                    </div>
                    {received.length > 0 && (
                      <div style={{ marginTop:10, fontSize:12 }}>
                        <strong>Payment ref:</strong> {received[0].reference || '—'} &nbsp;·&nbsp;
                        <strong>Date:</strong> {received[0].received_date} &nbsp;·&nbsp;
                        <strong>SAR:</strong> {(received[0].received_amount||0).toLocaleString()}
                      </div>
                    )}
                  </div>
                )}

                {/* ── No payment yet (for Contra MRs) ── */}
                {contraLines.length > 0 && received.length === 0 && (
                  <div style={{ background:'#fff3e0', borderRadius:10, padding:16, marginBottom:16 }}>
                    <strong style={{ color:'#e65100' }}>⚠ No payment recorded yet</strong>
                    <div style={{ fontSize:12, color:'#6b7c93', marginTop:4 }}>
                      Go to <strong>Payments</strong> page → click Pay → mark as paid → then return here to confirm.
                    </div>
                  </div>
                )}

                {/* ── Already confirmed: read-only summary ── */}
                {isReadOnly && received.length > 0 && (
                  <div style={{ background:'#e8f5e9', border:'1.5px solid #a5d6a7', borderRadius:10, padding:'14px 18px', marginBottom:16 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                      <span style={{ fontWeight:800, color:'#2e7d32', fontSize:15 }}>
                        ✅ Receipt Confirmed
                      </span>
                      <span style={S.chip('#e8f5e9','#2e7d32')}>ISSUED</span>
                    </div>
                    {received.map(rcv => (
                      <div key={rcv.id} style={{ fontSize:12, color:'#4a6741', lineHeight:1.8 }}>
                        <div><strong>Amount:</strong> SAR {(rcv.received_amount||0).toLocaleString()} from {rcv.bank_account}</div>
                        <div><strong>Date:</strong> {rcv.received_date} &nbsp;·&nbsp; <strong>Method:</strong> {rcv.payment_method?.replace(/_/g,' ')}</div>
                        {rcv.reference && <div><strong>TRN / Ref:</strong> {rcv.reference}</div>}
                        {rcv.attachment_url && <div style={{ color:'#2e7d32' }}>📎 Attachment saved</div>}
                      </div>
                    ))}
                    <div style={{ marginTop:10, fontSize:11, color:'#6b7c93' }}>
                      This receipt is confirmed and locked. Proceed to the Distribute tab.
                    </div>
                  </div>
                )}

                {/* ── No payment yet ── */}
                {received.length === 0 && contraLines.length === 0 && (
                  <div style={{ background:'#fff3e0', borderRadius:10, padding:16, marginBottom:16 }}>
                    <strong style={{ color:'#e65100' }}>⚠ No payment recorded yet</strong>
                    <div style={{ fontSize:12, color:'#6b7c93', marginTop:4 }}>
                      Go to <strong>Payments</strong> page → click Pay → then return here to confirm.
                    </div>
                  </div>
                )}

                {/* ── Payment summary card (from Payments.jsx) ── */}
                {received.map(rcv => (
                  <div key={rcv.id} style={{ background: rcv.status==='CONFIRMED' ? '#e8f5e9' : '#f0f7ff',
                    border: `1.5px solid ${rcv.status==='CONFIRMED' ? '#a5d6a7' : '#90caf9'}`,
                    borderRadius:10, padding:'12px 16px', marginBottom:16 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                      <div style={{ fontWeight:800, fontSize:15, color:'#1a2540' }}>
                        SAR {(rcv.received_amount||0).toLocaleString()} — {rcv.bank_account}
                      </div>
                      <span style={S.chip(rcv.status==='CONFIRMED'?'#e8f5e9':'#e3f2fd', rcv.status==='CONFIRMED'?'#2e7d32':'#1565c0')}>
                        {rcv.status==='CONFIRMED' ? '✓ CONFIRMED' : 'PENDING CONFIRMATION'}
                      </span>
                    </div>
                    <div style={{ fontSize:12, color:'#6b7c93' }}>
                      {rcv.received_date} · {rcv.payment_method?.replace(/_/g,' ')}
                      {rcv.reference && <span> · Ref: <strong>{rcv.reference}</strong></span>}
                    </div>
                    {rcv.attachment_url && (
                      <div style={{ fontSize:11, color:'#2e7d32', marginTop:4 }}>📎 Attachment saved</div>
                    )}
                  </div>
                ))}

                {/* ── Per-line confirmation table ── */}
                {received.length > 0 && detailLines.length > 0 && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:800, color:'#1565c0', textTransform:'uppercase',
                      letterSpacing:1, marginBottom:10, paddingBottom:4, borderBottom:'1px solid #e3f2fd' }}>
                      Enter Bank TRN # for each transfer
                    </div>

                    <div style={{ overflowX:'auto', marginBottom:16 }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', minWidth:620 }}>
                        <thead>
                          <tr style={{ background:'#f0f7ff' }}>
                            {['Party / Beneficiary','Type','IBAN / Mode','Amount (SAR)','Bank TRN #'].map(h => (
                              <th key={h} style={{ padding:'7px 10px', textAlign:'left', fontSize:10,
                                fontWeight:800, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.5 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {detailLines.map((ln, i) => {
                            const isANB     = ['ANB-77','ANB-39'].includes(ln.party_type)
                            const ibanDisp  = isANB ? `Contra → ${ln.party_type}` : (ln.iban || '— Cash —')
                            const modeColor = isANB ? '#6a1b9a' : ln.iban ? '#2e7d32' : '#e65100'
                            const existRef  = ln.bank_ref || ''
                            return (
                              <tr key={ln.id} style={{ borderTop:'1px solid #f0f5fa',
                                background: i%2===0 ? '#fff' : '#fafcff' }}>
                                <td style={{ padding:'8px 10px', fontWeight:700, fontSize:12 }}>
                                  {ln.supplier_name || ln.party_type || '—'}
                                </td>
                                <td style={{ padding:'8px 10px' }}>
                                  <span style={S.chip('#e3f2fd','#1565c0')}>{ln.line_type?.replace(/_/g,' ') || '—'}</span>
                                </td>
                                <td style={{ padding:'8px 10px', fontSize:11, fontWeight:700, color:modeColor }}>
                                  {ibanDisp}
                                </td>
                                <td style={{ padding:'8px 10px', fontSize:13, fontWeight:800, color:'#1a2540' }}>
                                  {(ln.amount||0).toLocaleString()}
                                </td>
                                <td style={{ padding:'8px 6px' }}>
                                  <input
                                    style={{ ...S.inp, fontSize:12, padding:'6px 9px',
                                      border: existRef ? '1.5px solid #a5d6a7' : '1px solid #dde3ec',
                                      background: existRef ? '#f1fff4' : '#fff' }}
                                    placeholder={existRef || 'e.g. 2400123456'}
                                    value={lineRefs[ln.id] ?? existRef}
                                    onChange={e => setLineRefs(prev => ({ ...prev, [ln.id]: e.target.value }))}
                                  />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ background:'#f8fafd', borderTop:'2px solid #e3f2fd' }}>
                            <td colSpan={3} style={{ padding:'8px 10px', fontSize:12, fontWeight:800, color:'#6b7c93' }}>
                              TOTAL
                            </td>
                            <td style={{ padding:'8px 10px', fontSize:14, fontWeight:900, color:'#1565c0' }}>
                              SAR {detailLines.reduce((s,l) => s+(l.amount||0), 0).toLocaleString()}
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Attachment + Notes */}
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:16 }}>
                      <div>
                        <label style={S.label}>📎 Attach Transfer Receipt / Bank Proof</label>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png"
                          style={{ ...S.inp, padding:'6px 10px', cursor:'pointer' }}
                          onChange={e => setRcvFile(e.target.files[0] || null)} />
                        {rcvFile && <div style={{ fontSize:11, color:'#2e7d32', marginTop:4 }}>✓ {rcvFile.name}</div>}
                        <div style={{ fontSize:10, color:'#aab2bd', marginTop:3 }}>
                          Requires "mr-receipts" bucket in Supabase Storage
                        </div>
                      </div>
                      <div>
                        <label style={S.label}>Notes (optional)</label>
                        <input style={S.inp} placeholder="Any remarks for this confirmation…"
                          value={rcvForm.notes}
                          onChange={e => setRcvForm(f => ({...f, notes:e.target.value}))} />
                      </div>
                    </div>

                    {/* Journal info */}
                    <div style={{ background:'#fff3e0', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12 }}>
                      <strong style={{ color:'#e65100' }}>ℹ Auto-journal on confirm:</strong>{' '}
                      Debit <strong>INT-003</strong> (Advance Paid) / Credit <strong>{detail.paid_from || 'Bank'}</strong>
                      {' '}— MR status will advance to <strong>ISSUED</strong>
                    </div>

                    {/* Confirm button — hidden if already ISSUED */}
                    {!isReadOnly && !['CLOSED','REJECTED','CANCELLED'].includes(detail.status) && (
                      <button onClick={confirmReceipt} disabled={confirming}
                        style={{ ...S.btn('linear-gradient(135deg,#2e7d32,#43a047)', '#fff'), padding:'11px 28px', fontSize:14 }}>
                        {confirming ? '⏳ Confirming…' : '✅ Confirm Receipt & Post Journal'}
                      </button>
                    )}
                  </div>
                )}
              </div>
              )
            })()}

            {/* ──────── Distribute tab (Layer 3) ──────── */}
            {activeTab === 'distribute' && (() => {
              // Only Contra lines create a distributable cash pool
              const CONTRA_TYPES = ['ANB-77','ANB-39']
              const contraLines = detailLines.filter(l => CONTRA_TYPES.includes(l.party_type))
              const contraTotal = contraLines.reduce((s,l) => s+(l.amount||0), 0)
              const hasContra   = contraLines.length > 0

              return (
              <div>
                <div style={S.sec}>Distribute Funds</div>

                {/* Non-Contra MR: nothing to distribute here */}
                {!hasContra && (
                  <div style={{ background:'#e8f5e9', border:'1px solid #a5d6a7', borderRadius:10, padding:16 }}>
                    <strong style={{ color:'#2e7d32' }}>✅ Direct Payment MR — No Distribution Needed</strong>
                    <div style={{ fontSize:12, color:'#4a6741', marginTop:6 }}>
                      All lines were direct IBAN transfers. Journals were posted at the Payments stage.
                    </div>
                  </div>
                )}

                {hasContra && received.length === 0 ? (
                  <div style={{ background:'#fff3e0', borderRadius:10, padding:16 }}>
                    <strong style={{ color:'#e65100' }}>⚠ Confirm receipt first</strong>
                    <div style={{ fontSize:13, color:'#6b7c93', marginTop:4 }}>
                      Go to the Receive tab — confirm the cash was received from {contraLines.map(l=>l.party_type).join('/')} before distributing.
                    </div>
                  </div>
                ) : hasContra && (
                  <div>
                    {/* Receipt selector */}
                    {received.length > 1 && (
                      <div style={{ marginBottom:14 }}>
                        <label style={S.label}>Distribute from Receipt</label>
                        <select style={{ ...S.inp, maxWidth:440 }} value={selReceivedId}
                          onChange={e => setSelReceivedId(e.target.value)}>
                          {received.map(rcv => {
                            // Only subtract PAID distributions — DRAFT rows will be replaced on save
                            const used = dists.filter(d => d.money_received_id === rcv.id && d.status === 'PAID').reduce((s,d) => s+(d.gross_amount||0), 0)
                            return (
                              <option key={rcv.id} value={rcv.id}>
                                {rcv.received_date} — SAR {(rcv.received_amount||0).toLocaleString()} (avail: SAR {((rcv.received_amount||0)-used).toLocaleString()})
                              </option>
                            )
                          })}
                        </select>
                      </div>
                    )}

                    {/* Available balance pill */}
                    {selReceivedId && (() => {
                      const rcv = received.find(r => r.id === selReceivedId)
                      // Only subtract PAID rows — DRAFT rows in distRows will be replaced on next Save
                      const used = dists.filter(d => d.money_received_id === selReceivedId && d.status === 'PAID').reduce((s,d) => s+(d.gross_amount||0), 0)
                      const avail = (rcv?.received_amount || 0) - used
                      const allocNow = distRows.reduce((s,r) => s+(parseFloat(r.gross_amount)||0), 0)
                      return (
                        <div style={{ background:'#f8fafd', borderRadius:8, padding:'8px 14px', marginBottom:14, fontSize:12, display:'flex', gap:20 }}>
                          <span>Available: <strong style={{ color:'#0277bd' }}>SAR {avail.toLocaleString()}</strong></span>
                          <span>This batch: <strong style={{ color: allocNow > avail+0.01 ? '#c62828' : '#2e7d32' }}>SAR {allocNow.toLocaleString()}</strong></span>
                          {allocNow > avail+0.01 && <span style={{ color:'#c62828', fontWeight:700 }}>⚠ Exceeds available!</span>}
                        </div>
                      )
                    })()}

                    {/* Distribution rows */}
                    <div style={{ overflowX:'auto' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:10, minWidth:700 }}>
                        <thead><tr style={{ background:'#f8fafd' }}>
                          {['Type','Party','Expense Acct','Gross (SAR)','VAT (SAR)','Purpose',''].map(h => (
                            <th key={h} style={{ padding:'7px 8px', textAlign:'left', fontSize:11, color:'#6b7c93', fontWeight:700 }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {distRows.map((row, i) => (
                            <tr key={i} style={{ borderTop:'1px solid #f0f4f8' }}>
                              <td style={{ padding:'5px 4px', width:120 }}>
                                <select style={{ ...S.inp, padding:'5px 7px', fontSize:11 }} value={row.party_type}
                                  onChange={e => { const r=[...distRows]; r[i]={...r[i],party_type:e.target.value,party_id:'',party_name:''}; setDistRows(r) }}>
                                  {PARTY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </td>
                              <td style={{ padding:'5px 4px' }}>
                                {row.party_type === 'EMPLOYEE' ? (() => {
                                  const deptEmps = employees.filter(e => e.department_id === detail?.department_id)
                                  const otherEmps = employees.filter(e => e.department_id !== detail?.department_id)
                                  const showDept = deptEmps.length > 0
                                  return (
                                    <select style={{ ...S.inp, padding:'5px 7px', fontSize:11 }} value={row.party_id}
                                      onChange={e => {
                                        const emp = employees.find(x => x.id === e.target.value)
                                        const r=[...distRows]; r[i]={...r[i],party_id:e.target.value,party_name:emp?.full_name_en||'',iban_used:emp?.iban||''}; setDistRows(r)
                                      }}>
                                      <option value="">— Select Employee —</option>
                                      {showDept && <option disabled>── This Department ──</option>}
                                      {(showDept ? deptEmps : employees).map(e => (
                                        <option key={e.id} value={e.id}>{e.full_name_en}</option>
                                      ))}
                                      {showDept && otherEmps.length > 0 && <option disabled>── Other Departments ──</option>}
                                      {showDept && otherEmps.map(e => (
                                        <option key={e.id} value={e.id}>{e.full_name_en} (Other Dept)</option>
                                      ))}
                                    </select>
                                  )
                                })() : ['VENDOR','SUBCON'].includes(row.party_type) ? (
                                  <select style={{ ...S.inp, padding:'5px 7px', fontSize:11 }} value={row.party_id}
                                    onChange={e => {
                                      const con = contractors.find(c => c.id === e.target.value)
                                      const r=[...distRows]; r[i]={...r[i],party_id:e.target.value,party_name:con?.contractor_name||con?.company_name||''}; setDistRows(r)
                                    }}>
                                    <option value="">— Select —</option>
                                    {(contractors.length === 0
                                      ? []
                                      : row.party_type === 'SUBCON'
                                        ? contractors.filter(c => c.vendor_type === 'SUB_CONTRACTOR')
                                        : contractors.filter(c => c.vendor_type !== 'SUB_CONTRACTOR')
                                    ).map(c => <option key={c.id} value={c.id}>{c.company_name || c.contractor_name}</option>)}
                                    {/* fallback: no contractors at all */}
                                    {contractors.length === 0 && <option disabled>No contractors loaded</option>}
                                  </select>
                                ) : (
                                  <input style={{ ...S.inp, padding:'5px 7px', fontSize:11 }}
                                    placeholder="Name / Description" value={row.party_name}
                                    onChange={e => { const r=[...distRows]; r[i]={...r[i],party_name:e.target.value}; setDistRows(r) }} />
                                )}
                              </td>
                              <td style={{ padding:'5px 4px', width:120 }}>
                                <select style={{ ...S.inp, padding:'5px 7px', fontSize:11 }} value={row.account_code}
                                  onChange={e => { const r=[...distRows]; r[i]={...r[i],account_code:e.target.value}; setDistRows(r) }}>
                                  {acctOpts.map(a => <option key={a.account_code} value={a.account_code}>{a.account_code}</option>)}
                                </select>
                              </td>
                              <td style={{ padding:'5px 4px', width:100 }}>
                                <input type="number" min="0" style={{ ...S.inp, padding:'5px 7px', fontSize:11 }}
                                  placeholder="0.00" value={row.gross_amount}
                                  onChange={e => { const r=[...distRows]; r[i]={...r[i],gross_amount:e.target.value}; setDistRows(r) }} />
                              </td>
                              <td style={{ padding:'5px 4px', width:80 }}>
                                <input type="number" min="0" style={{ ...S.inp, padding:'5px 7px', fontSize:11 }}
                                  placeholder="0" value={row.vat_amount}
                                  onChange={e => { const r=[...distRows]; r[i]={...r[i],vat_amount:e.target.value}; setDistRows(r) }} />
                              </td>
                              <td style={{ padding:'5px 4px' }}>
                                <input style={{ ...S.inp, padding:'5px 7px', fontSize:11 }}
                                  placeholder="Purpose" value={row.purpose}
                                  onChange={e => { const r=[...distRows]; r[i]={...r[i],purpose:e.target.value}; setDistRows(r) }} />
                              </td>
                              <td style={{ padding:'5px 4px', width:30 }}>
                                {distRows.length > 1 && (
                                  <button onClick={() => setDistRows(distRows.filter((_,j) => j!==i))}
                                    style={{ background:'#ffebee', color:'#c62828', border:'none', borderRadius:5, width:26, height:26, cursor:'pointer' }}>✕</button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:16 }}>
                      <button onClick={() => setDistRows([...distRows, {...EMPTY_DIST}])} style={S.btn('#e3f2fd','#1565c0')}>+ Add Row</button>
                    </div>

                    <button onClick={saveDistribution} disabled={distSaving}
                      style={S.btn('linear-gradient(135deg,#1565c0,#1976d2)', '#fff')}>
                      {distSaving ? 'Saving…' : 'Save as DRAFT'}
                    </button>
                    <div style={{ fontSize:11, color:'#6b7c93', marginTop:8 }}>
                      Saved as DRAFT. In the Log tab, click <em>Mark PAID</em> on each row to post the expense journal entry automatically.
                    </div>
                    {contraTotal > 0 && (
                      <div style={{ marginTop:10, background:'#e8eaf6', borderRadius:8, padding:'8px 12px', fontSize:11, color:'#3949ab' }}>
                        <strong>Contra Pool:</strong> SAR {contraTotal.toLocaleString()} from {contraLines.map(l=>l.party_type).join(' + ')}.
                        Only distribute up to this amount.
                      </div>
                    )}
                  </div>
                )}
              </div>
              )
            })()}

            {/* ──────── Log tab ──────── */}
            {activeTab === 'log' && (
              <div>
                <div style={S.sec}>Distribution Log</div>
                {dists.length === 0 ? (
                  <div style={{ textAlign:'center', padding:30, color:'#aab2bd', fontSize:13 }}>No distributions yet</div>
                ) : (
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
                      <thead><tr style={{ background:'#f8fafd' }}>
                        {['Party','Account','Gross','VAT','Net','Purpose','Status',''].map(h => (
                          <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontSize:11, color:'#6b7c93', fontWeight:700 }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {dists.map(d => (
                          <tr key={d.id} style={{ borderTop:'1px solid #f0f4f8' }}>
                            <td style={{ padding:'8px 10px' }}>
                              <div style={{ fontSize:13, fontWeight:700 }}>{partyLabel(d)}</div>
                              <div style={{ fontSize:10, color:'#6b7c93' }}>{d.party_type}</div>
                            </td>
                            <td style={{ padding:'8px 10px', fontSize:11 }}>{d.account_code || '—'}</td>
                            <td style={{ padding:'8px 10px', fontSize:13, fontWeight:700 }}>SAR {(d.gross_amount||0).toLocaleString()}</td>
                            <td style={{ padding:'8px 10px', fontSize:12, color:'#6b7c93' }}>{d.vat_amount > 0 ? `SAR ${(d.vat_amount||0).toLocaleString()}` : '—'}</td>
                            <td style={{ padding:'8px 10px', fontSize:13, fontWeight:700, color:'#1565c0' }}>
                              SAR {(d.net_amount || d.gross_amount || 0).toLocaleString()}
                            </td>
                            <td style={{ padding:'8px 10px', fontSize:12 }}>{d.purpose || '—'}</td>
                            <td style={{ padding:'8px 10px' }}>
                              <span style={S.chip(
                                d.status==='PAID' ? '#e8f5e9' : d.status==='CANCELLED' ? '#ffebee' : '#fff3e0',
                                d.status==='PAID' ? '#2e7d32' : d.status==='CANCELLED' ? '#c62828' : '#e65100'
                              )}>{d.status}</span>
                              {d.expense_journal_id && <span style={{ ...S.chip('#e3f2fd','#1565c0'), marginLeft:4 }}>📒</span>}
                            </td>
                            <td style={{ padding:'8px 10px' }}>
                              {d.status === 'DRAFT' && (
                                <button onClick={() => markPaid(d.id)}
                                  style={{ ...S.btn('#e8f5e9','#2e7d32'), padding:'4px 10px', fontSize:11 }}>
                                  Mark PAID
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Summary row */}
                {dists.length > 0 && (
                  <div style={{ display:'flex', gap:20, padding:'10px 14px', background:'#f8fafd', borderRadius:8, marginTop:12, fontSize:12 }}>
                    <span>Total Gross: <strong>SAR {dists.reduce((s,d) => s+(d.gross_amount||0),0).toLocaleString()}</strong></span>
                    <span>Paid: <strong style={{ color:'#2e7d32' }}>SAR {dists.filter(d=>d.status==='PAID').reduce((s,d) => s+(d.gross_amount||0),0).toLocaleString()}</strong></span>
                    <span>Draft: <strong style={{ color:'#e65100' }}>SAR {dists.filter(d=>d.status==='DRAFT').reduce((s,d) => s+(d.gross_amount||0),0).toLocaleString()}</strong></span>
                  </div>
                )}

                {dists.length > 0 && dists.every(d => d.status === 'PAID') && detail.status !== 'CLOSED' && (
                  <div style={{ marginTop:14, textAlign:'right' }}>
                    <button onClick={() => moveTo(detail,'CLOSED')} style={S.btn('#37474f','#fff')}>✓ Close MR</button>
                  </div>
                )}
              </div>
            )}

            {/* ──────── Journal tab ──────── */}
            {activeTab === 'journal' && (
              <div>
                <div style={S.sec}>Journal Entries</div>
                {journals.length === 0 ? (
                  <div style={{ textAlign:'center', padding:30, color:'#aab2bd', fontSize:13 }}>
                    No journal entries yet — they are posted automatically when you record a receipt (advance) or mark a distribution as PAID (expense).
                  </div>
                ) : journals.map(je => (
                  <div key={je.id} style={{ border:'1px solid #e3f2fd', borderRadius:10, marginBottom:14, overflow:'hidden' }}>
                    <div style={{ background:'#e8f5e9', padding:'8px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                        <span style={{ fontWeight:700, color:'#1565c0', fontSize:14 }}>{je.voucher_number}</span>
                        <span style={{ color:'#6b7c93', fontSize:12 }}>{je.entry_date}</span>
                        <span style={S.chip('#1565c0','#fff')}>{je.voucher_type}</span>
                      </div>
                      <span style={S.chip(je.status==='POSTED' ? '#e8f5e9' : '#fff3e0', je.status==='POSTED' ? '#2e7d32' : '#e65100')}>{je.status}</span>
                    </div>
                    {je.narration && (
                      <div style={{ padding:'6px 14px', fontSize:12, color:'#6b7c93', background:'#f8fafd', borderBottom:'1px solid #e3f2fd' }}>{je.narration}</div>
                    )}
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead><tr style={{ background:'#f8fafd' }}>
                        {['Account','Description','Debit (SAR)','Credit (SAR)'].map(h => (
                          <th key={h} style={{ padding:'7px 12px', textAlign:'left', fontSize:11, color:'#6b7c93', fontWeight:700 }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {(je.journal_lines || []).map(jl => (
                          <tr key={jl.id} style={{ borderTop:'1px solid #f0f4f8' }}>
                            <td style={{ padding:'7px 12px', fontSize:12, fontWeight:700 }}>{jl.account_code}</td>
                            <td style={{ padding:'7px 12px', fontSize:12, color:'#6b7c93' }}>{jl.account_name || jl.notes || '—'}</td>
                            <td style={{ padding:'7px 12px', fontSize:13, fontWeight:700, color:'#1565c0' }}>
                              {jl.debit > 0 ? `SAR ${(jl.debit||0).toLocaleString()}` : ''}
                            </td>
                            <td style={{ padding:'7px 12px', fontSize:13, fontWeight:700, color:'#c62828' }}>
                              {jl.credit > 0 ? `SAR ${(jl.credit||0).toLocaleString()}` : ''}
                            </td>
                          </tr>
                        ))}
                        <tr style={{ background:'#f0f4f8', borderTop:'1px solid #dde3ec' }}>
                          <td colSpan={2} style={{ padding:'6px 12px', fontSize:11, color:'#6b7c93', fontWeight:700 }}>TOTAL</td>
                          <td style={{ padding:'6px 12px', fontSize:12, fontWeight:800, color:'#1565c0' }}>
                            SAR {(je.journal_lines||[]).reduce((s,jl) => s+(jl.debit||0),0).toLocaleString()}
                          </td>
                          <td style={{ padding:'6px 12px', fontSize:12, fontWeight:800, color:'#c62828' }}>
                            SAR {(je.journal_lines||[]).reduce((s,jl) => s+(jl.credit||0),0).toLocaleString()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      )}
    </ChapterPage>
    </>
  )
}
