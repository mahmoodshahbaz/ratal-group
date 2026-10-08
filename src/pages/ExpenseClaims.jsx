/**
 * ExpenseClaims.jsx — Finance › Expense Claims
 *
 * Role-based workflow:
 *   Field worker  → submits via mobile form
 *   DH            → sees dept SUBMITTED claims, approve/reject after cutoff (26th)
 *                   gets correction notification with 3-day countdown
 *   Admin/Finance → full access: generate, zero-out duplicates, approve as Accounts
 *
 * Status flow:  SUBMITTED → DH_APPROVED → ACCOUNTS_APPROVED → POSTED
 *                        ↘ REJECTED (Finance corrects → DH acknowledges → back to Accounts)
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase }     from '../lib/supabase'
import { GROUP_COLORS } from '../styles/appStyles'
import { printDocument, openPrintWindow } from '../lib/templatePrint'

const MC  = GROUP_COLORS.Finance   // #8C354B maroon
const MC2 = '#FAF0F2'              // light pink

// ── Status config ──────────────────────────────────────────────
const STATUS = {
  SUBMITTED:         { label:'Pending DH Review',  bg:'#fff8e1', color:'#f57f17', dot:'#f9a825' },
  DH_APPROVED:       { label:'Pending Accounts',   bg:'#e3f2fd', color:'#1565c0', dot:'#1976d2' },
  ACCOUNTS_APPROVED: { label:'Accounts Approved',  bg:'#e8f5e9', color:'#2e7d32', dot:'#388e3c' },
  REJECTED:          { label:'Rejected',           bg:'#fce4ec', color:'#c62828', dot:'#e53935' },
  POSTED:            { label:'Posted',             bg:'#ede7f6', color:'#4527a0', dot:'#512da8' },
}

// ── Helpers ────────────────────────────────────────────────────
const fmtSAR  = n  => isNaN(n) ? '—' : Number(n).toLocaleString('en-SA',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtDate = iso => iso ? iso.slice(0,10).split('-').reverse().join('/') : '—'

function periodLabel(ym) {
  if (!ym) return '—'
  const [y,m] = ym.split('-')
  return new Date(+y, +m-1, 1).toLocaleString('en-US',{month:'long',year:'numeric'})
}

// Returns true if today is past the 26th of the claim's period month
function isActionable(period) {
  if (!period) return false
  const [y,m] = period.split('-').map(Number)
  return new Date() > new Date(y, m-1, 26)
}

function timeRemaining(deadline) {
  if (!deadline) return null
  const diff = new Date(deadline) - new Date()
  if (diff <= 0) return { label:'Expired', urgent:true }
  const h = Math.floor(diff / 3600000)
  const d = Math.floor(h / 24)
  return { label: d > 0 ? `${d}d ${h%24}h left` : `${h}h left`, urgent: h < 24 }
}

// ── Styles ─────────────────────────────────────────────────────
const S = {
  page:   { padding:'20px 24px', fontFamily:"'Poppins',sans-serif", maxWidth:1280, margin:'0 auto' },
  kpiRow: { display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 },
  kpi:    (g1,g2) => ({ background:`linear-gradient(135deg,${g1},${g2})`, borderRadius:14, padding:'16px 20px', boxShadow:`0 4px 16px ${g1}55`, color:'#fff', position:'relative', overflow:'hidden' }),
  kpiNum: { fontSize:32, fontWeight:900, lineHeight:1, color:'#fff' },
  kpiLbl: { fontSize:11, color:'rgba(255,255,255,0.85)', marginTop:5, fontWeight:600 },
  kpiIco: { position:'absolute', right:14, top:12, fontSize:28, opacity:.25 },
  filters:{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' },
  sel:    { padding:'8px 10px', borderRadius:8, border:'1px solid #dde3ec', fontSize:12, fontFamily:'inherit', outline:'none', background:'#fff' },
  srch:   { padding:'8px 12px', borderRadius:8, border:'1px solid #dde3ec', fontSize:12, fontFamily:'inherit', outline:'none', flex:1, minWidth:180 },
  tbl:    { width:'100%', borderCollapse:'collapse', fontSize:12, background:'#fff', borderRadius:10, overflow:'hidden', boxShadow:'0 2px 10px rgba(0,0,0,0.07)' },
  th:     { padding:'10px 12px', background:MC, color:'#fff', fontWeight:700, textAlign:'left', fontSize:11, whiteSpace:'nowrap' },
  td:     { padding:'9px 12px', borderBottom:'1px solid #f0f4f8', verticalAlign:'middle' },
  tr:     i => ({ background: i%2===0?'#fff':'#fafbfc', cursor:'pointer' }),
  badge:  s => {
    const c = STATUS[s]||{bg:'#f5f5f5',color:'#666'}
    return { display:'inline-flex', alignItems:'center', gap:4, background:c.bg, color:c.color, padding:'3px 9px', borderRadius:20, fontSize:10, fontWeight:700, whiteSpace:'nowrap' }
  },
  dot:    s => ({ width:6, height:6, borderRadius:'50%', background:(STATUS[s]||{}).dot||'#aaa', flexShrink:0 }),
  // drawer
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'flex-end', justifyContent:'center' },
  drawer: { background:'#fff', borderRadius:'16px 16px 0 0', width:'100%', maxWidth:900, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 -8px 40px rgba(0,0,0,0.18)', display:'flex', flexDirection:'column' },
  dHdr:   { background:MC, padding:'16px 22px', borderRadius:'16px 16px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 },
  dBody:  { padding:'20px 22px', flex:1 },
  infoGrid:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 20px', background:MC2, borderRadius:8, padding:'12px 16px', marginBottom:16, fontSize:12 },
  infoLbl: { color:MC, fontWeight:700, fontSize:10, textTransform:'uppercase', letterSpacing:.5 },
  infoVal: { color:'#1a2e3d', fontWeight:600 },
  linesTbl:{ width:'100%', borderCollapse:'collapse', fontSize:11, marginBottom:12 },
  linesTh: { padding:'7px 8px', background:'#1a3a6b', color:'#fff', fontWeight:700, textAlign:'left', fontSize:10 },
  linesTd: { padding:'6px 8px', borderBottom:'1px solid #f0f4f8' },
  actions: { display:'flex', gap:10, flexWrap:'wrap', marginTop:16, paddingTop:14, borderTop:`1px solid ${MC2}` },
  btn:    (bg,color,border) => ({ padding:'9px 18px', borderRadius:8, border:border||'none', background:bg, color, fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:"'Poppins',sans-serif", transition:'opacity .15s' }),
  modal:  { background:'#fff', borderRadius:14, padding:24, width:460, maxWidth:'100%', boxShadow:'0 8px 40px rgba(0,0,0,0.22)' },
  lbl:    { fontSize:11, fontWeight:700, color:'#6b7c93', display:'block', marginBottom:6 },
  inp:    { width:'100%', padding:'9px 11px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, fontFamily:'inherit', outline:'none', resize:'vertical', minHeight:80, boxSizing:'border-box' },
  alert:  (color,bg) => ({ background:bg, border:`1px solid ${color}40`, borderRadius:8, padding:'12px 16px', marginBottom:14, fontSize:12, color }),
}

// ── Component ──────────────────────────────────────────────────
export default function ExpenseClaims({ entityId, entityName, role, profile }) {
  const isAdmin = ['SUPERADMIN','ADMIN'].includes(role)
  const isDH    = role === 'DEPT_HEAD'

  const [claims,      setClaims]     = useState([])
  const [empMap,      setEmpMap]     = useState({})
  const [depts,       setDepts]      = useState([])
  const [loading,     setLoading]    = useState(false)
  const [currentEmpId, setCurrentEmpId] = useState(null)   // employees.id for logged-in user
  const [selected, setSelected] = useState(null)
  const [detail,   setDetail]   = useState(null)
  const [expandedRows, setExpandedRows] = useState(new Set())
  const [detailLoading, setDetailLoading] = useState(false)

  // Filters — default to PREVIOUS month (claims reviewed after 26th)
  const [filterPeriod, setFilterPeriod] = useState(() => {
    const now  = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth()-1, 1)
    return `${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`
  })
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [filterDept,   setFilterDept]   = useState('')
  const [search,       setSearch]       = useState('')

  // Page-level tab: 'claims' | 'live-expenses' | 'live-fa' | 'live-ot'
  const [pageTab, setPageTab] = useState('claims')

  // Live recordings (unclaimed records for the selected period)
  const [liveExp, setLiveExp]  = useState([])
  const [liveFA,  setLiveFA]   = useState([])
  const [liveOT,  setLiveOT]   = useState([])
  const [liveLoading, setLiveLoading] = useState(false)

  // Generate modal
  const [genOpen,    setGenOpen]    = useState(false)
  const [genPreview, setGenPreview] = useState([])
  const [genBusy,    setGenBusy]    = useState(false)
  const [genResult,  setGenResult]  = useState(null)

  // Action state
  const [actionBusy, setActionBusy] = useState(false)
  const [actionMsg,  setActionMsg]  = useState('')

  // Reject modal
  const [rejectMode,   setRejectMode]   = useState(null)  // 'DH' | 'ACCOUNTS' | null
  const [rejectReason, setRejectReason] = useState('')

  // Zero-out panel (Accounts)
  const [zeroMode, setZeroMode] = useState(false)
  const [zeroNote, setZeroNote] = useState('')
  const [zeroingId, setZeroingId] = useState(null)

  // Correction panel (Admin after DH rejects)
  const [correctionMode, setCorrectionMode] = useState(false)
  const [correctionNote, setCorrectionNote] = useState('')

  // DH objection modal
  const [dhObjMode,   setDhObjMode]   = useState(false)
  const [dhObjReason, setDhObjReason] = useState('')

  // ── DH department mapping ────────────────────────────────────
  const dhDept = useMemo(() => {
    if (!isDH || !profile?.department) return null
    return depts.find(d =>
      d.dept_name === profile.department ||
      d.dept_code === profile.department
    )
  }, [isDH, profile, depts])

  const dhEmployeeIds = useMemo(() => {
    if (!dhDept) return null
    return new Set(
      Object.values(empMap)
        .filter(e => e.department_id === dhDept.id)
        .map(e => e.id)
    )
  }, [dhDept, empMap])

  const [loadError, setLoadError] = useState('')

  // ── Load ─────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!entityId) { setLoading(false); return }
    setLoading(true)
    setLoadError('')

    // Run all 3 queries in parallel with a 15s timeout safety net
    const timeout = new Promise((_,rej) => setTimeout(()=>rej(new Error('Query timed out after 15s — check Supabase RLS policies')), 15000))

    try {
      const [clResult, empResult, dpResult] = await Promise.race([
        Promise.all([
          supabase.from('expense_claims').select('*').eq('entity_id', entityId).order('submitted_at', { ascending: false }),
          supabase.from('employees').select('id,full_name_en,employee_number,department_id,email').eq('entity_id', entityId).eq('is_active', true),
          supabase.from('departments').select('id,dept_name,dept_code').eq('entity_id', entityId).eq('is_active', true).order('dept_name'),
        ]),
        timeout,
      ])

      const map = {}
      ;(empResult.data||[]).forEach(e => { map[e.id] = e })
      setEmpMap(map)
      setDepts(dpResult.data||[])
      setClaims(clResult.data||[])
      if (clResult.error) setLoadError(`⚠️ ${clResult.error.message}`)

      // Find current user's employee record — try name first, then email
      {
        const allEmps = empResult.data || []
        let matched = null
        // 1. Exact name match
        if (profile?.full_name) {
          matched = allEmps.find(e =>
            e.full_name_en?.toLowerCase().trim() === profile.full_name?.toLowerCase().trim()
          )
        }
        // 2. Email match fallback (works even if display name differs)
        if (!matched && profile?.email) {
          matched = allEmps.find(e =>
            e.email?.toLowerCase().trim() === profile.email?.toLowerCase().trim()
          )
        }
        if (matched) setCurrentEmpId(matched.id)
      }
    } catch (err) {
      setLoadError(`❌ ${err.message}`)
      setClaims([])
    } finally {
      setLoading(false)
    }
  }, [entityId])

  useEffect(() => { load() }, [load])

  // ── Load live (unclaimed) recordings for the selected period ──
  const loadLiveRecordings = useCallback(async () => {
    if (!entityId || !filterPeriod) return
    setLiveLoading(true)
    const [yr, mo] = filterPeriod.split('-').map(Number)
    let from, to
    if (mo === 1)       { from = `${yr}-01-01`; to = `${yr}-01-25` }
    else if (mo === 12) { from = `${yr}-11-26`; to = `${yr}-12-31` }
    else {
      from = `${yr}-${String(mo-1).padStart(2,'0')}-26`
      to   = `${yr}-${String(mo).padStart(2,'0')}-25`
    }
    const [expRes, faRes, otRes] = await Promise.all([
      supabase.from('expense_records')
        .select('id,employee_id,expense_date,category,expense_type,vendor_name,amount,vat_amount,status,late_days,claim_id')
        .eq('entity_id', entityId)
        .gte('expense_date', from).lte('expense_date', to)
        .order('expense_date', { ascending: false }),
      supabase.from('food_allowances')
        .select('id,employee_id,allowance_date,location,job_type,no_persons,no_days,daily_rate,total_amount,status')
        .gte('allowance_date', from).lte('allowance_date', to)
        .order('allowance_date', { ascending: false }),
      supabase.from('overtime_records')
        .select('id,employee_id,work_date,start_time,end_time,total_hours,job_type,status,project_id')
        .gte('work_date', from).lte('work_date', to)
        .order('work_date', { ascending: false }),
    ])
    setLiveExp(expRes.data || [])
    setLiveFA(faRes.data   || [])
    setLiveOT(otRes.data   || [])
    setLiveLoading(false)
  }, [entityId, filterPeriod])

  useEffect(() => {
    if (pageTab !== 'claims') loadLiveRecordings()
  }, [pageTab, filterPeriod, loadLiveRecordings])

  // ── Load claim detail ────────────────────────────────────────
  async function openClaim(claim) {
    setSelected(claim)
    setDetail(null)
    setDetailLoading(true)
    setActionMsg('')
    setZeroMode(false)
    setCorrectionMode(false)
    setDhObjMode(false)

    const [{ data:lines }, { data:food }, { data:ot }, { data:rejHist }] = await Promise.all([
      supabase.from('expense_records')
        .select('id,expense_date,category,expense_type,vendor_name,amount,vat_amount,original_amount,adjusted_at,adjusted_by,adjustment_note,status,remarks,late_days')
        .eq('claim_id', claim.id)
        .order('expense_date'),
      supabase.from('food_allowances')
        .select('id,allowance_date,location,job_type,no_persons,no_days,daily_rate,total_amount,status')
        .eq('employee_id', claim.employee_id)
        .eq('allowance_month', claim.period)
        .order('allowance_date'),
      supabase.from('overtime_records')
        .select('id,overtime_date,job_no,job_type,work_description,total_hours,status')
        .eq('employee_id', claim.employee_id)
        .eq('period', claim.period)
        .order('overtime_date'),
      supabase.from('expense_claim_rejections')
        .select('id,rejected_by_name,rejected_at,reason,round')
        .eq('claim_id', claim.id)
        .order('round'),
    ])

    // Fallback: old claims have no claim_id on expense_records — query by rolling window date range
    let finalLines = lines || []
    if (finalLines.length === 0 && claim.employee_id && claim.period) {
      const [yr, mo] = claim.period.split('-').map(Number)
      // Rolling window: Jan = 1st–25th; Dec = 26 Nov–31 Dec; others = 26th prev – 25th current
      let start, end
      if (mo === 1) {
        start = `${yr}-01-01`; end = `${yr}-01-25`
      } else if (mo === 12) {
        start = `${yr}-11-26`; end = `${yr}-12-31`
      } else {
        start = `${yr}-${String(mo-1).padStart(2,'0')}-26`
        end   = `${yr}-${String(mo).padStart(2,'0')}-25`
      }
      const { data: fbLines } = await supabase.from('expense_records')
        .select('id,expense_date,category,expense_type,vendor_name,amount,vat_amount,original_amount,adjusted_at,adjusted_by,adjustment_note,status,remarks,late_days')
        .eq('employee_id', claim.employee_id)
        .gte('expense_date', start)
        .lte('expense_date', end)
        .order('expense_date')
      finalLines = fbLines || []
    }

    setDetail({ lines:finalLines, food:food||[], ot:ot||[], rejHist:rejHist||[] })
    setDetailLoading(false)
  }

  function closeDrawer() {
    setSelected(null); setDetail(null)
    setRejectMode(null); setRejectReason('')
    setZeroMode(false); setZeroNote('')
    setCorrectionMode(false); setCorrectionNote('')
    setDhObjMode(false); setDhObjReason('')
    setActionMsg('')
  }

  // ── DH: acknowledge receipt of physical documents ────────────
  async function dhAcknowledgeClaim() {
    if (!currentEmpId) {
      setActionMsg(`❌ No employee record found for your account. Add a record in Employees with matching email.`)
      return
    }
    setActionBusy(true); setActionMsg('')
    const { data, error } = await supabase.rpc('dh_acknowledge_claim', {
      p_claim_id: selected.id, p_dh_employee_id: currentEmpId,
    })
    if (error || data?.error) { setActionMsg('❌ '+(error?.message||data?.error)); setActionBusy(false); return }
    setActionMsg('📨 Physical documents acknowledged — claim is under your review')
    setActionBusy(false)
    load()
    setSelected(prev => ({ ...prev, dh_acknowledged_at: data?.acknowledged_at || new Date().toISOString() }))
  }

  // ── DH: approve claim ────────────────────────────────────────
  async function dhApproveClaim() {
    if (!currentEmpId) {
      setActionMsg(`❌ No employee record found for "${profile?.full_name || profile?.email}". In Employees, add a record with Full Name (EN) = "${profile?.full_name}" or Email = "${profile?.email}".`)
      return
    }
    setActionBusy(true); setActionMsg('')
    const empId = currentEmpId
    const { data, error } = await supabase.rpc('dh_approve_claim', {
      p_claim_id: selected.id, p_dh_employee_id: empId,
    })
    if (error || data?.error) { setActionMsg('❌ '+(error?.message||data?.error)); setActionBusy(false); return }
    setActionMsg('✅ Claim approved — forwarded to Accounts')
    setActionBusy(false)
    load()
    setSelected(prev => ({ ...prev, status:'DH_APPROVED' }))
  }

  // ── DH: reject claim ─────────────────────────────────────────
  async function dhRejectClaim() {
    if (!rejectReason.trim()) return
    if (!currentEmpId) { setActionMsg('❌ Employee record not found for your account'); return }
    setActionBusy(true); setActionMsg('')
    const empId = currentEmpId
    const { data, error } = await supabase.rpc('dh_reject_claim', {
      p_claim_id: selected.id, p_dh_employee_id: empId, p_reason: rejectReason,
    })
    if (error || data?.error) { setActionMsg('❌ '+(error?.message||data?.error)); setActionBusy(false); return }
    setRejectMode(null); setRejectReason('')
    setActionMsg('Claim rejected — Finance Admin notified')
    setActionBusy(false)
    load()
    setSelected(prev => ({ ...prev, status:'REJECTED' }))
  }

  // ── DH: acknowledge correction ────────────────────────────────
  async function dhAcknowledge() {
    setActionBusy(true); setActionMsg('')
    const empId = currentEmpId
    const { data, error } = await supabase.rpc('dh_acknowledge_correction', {
      p_claim_id: selected.id, p_dh_employee_id: empId,
    })
    if (error || data?.error) { setActionMsg('❌ '+(error?.message||data?.error)); setActionBusy(false); return }
    // Cancel the scheduled escalation task if there is one
    if (data?.cancel_task_id) {
      // Task ID stored in DB — pg_cron handles it; if using Cowork tasks, would delete here
    }
    setActionMsg('✅ Correction acknowledged — claim returned to Accounts')
    setActionBusy(false)
    load()
  }

  // ── DH: object to correction ──────────────────────────────────
  async function dhObject() {
    if (!dhObjReason.trim()) return
    setActionBusy(true); setActionMsg('')
    const empId = currentEmpId
    const { data, error } = await supabase.rpc('dh_object_correction', {
      p_claim_id: selected.id, p_dh_employee_id: empId, p_reason: dhObjReason,
    })
    if (error || data?.error) { setActionMsg('❌ '+(error?.message||data?.error)); setActionBusy(false); return }
    setDhObjMode(false); setDhObjReason('')
    setActionMsg('Objection logged — Finance Admin notified. Timer is still running.')
    setActionBusy(false)
    load()
  }

  // ── Admin: zero out a single line ────────────────────────────
  async function zeroRecord(recordId) {
    if (!zeroNote.trim()) { setActionMsg('❌ A reason is required to zero out a record'); return }
    setZeroingId(recordId); setActionMsg('')
    const empId = currentEmpId
    const { data, error } = await supabase.rpc('admin_zero_expense_record', {
      p_record_id: recordId, p_admin_employee_id: empId, p_note: zeroNote,
    })
    if (error || data?.error) { setActionMsg('❌ '+(error?.message||data?.error)); setZeroingId(null); return }
    setActionMsg(`✅ Record zeroed (was SAR ${fmtSAR(data?.original_amount)})`)
    setZeroingId(null)
    // Refresh detail lines
    const { data:lines } = await supabase.from('expense_records')
      .select('id,expense_date,category,expense_type,vendor_name,amount,vat_amount,original_amount,adjusted_at,adjusted_by,adjustment_note,status,remarks,late_days')
      .eq('claim_id', selected.id).order('expense_date')
    setDetail(prev => ({ ...prev, lines: lines||[] }))
  }

  // ── Admin: submit correction + start 3-day timer ─────────────
  async function submitCorrection() {
    if (!correctionNote.trim()) { setActionMsg('❌ Correction note is required'); return }
    setActionBusy(true); setActionMsg('')
    const empId = currentEmpId
    // Use a placeholder task ID — actual escalation handled by pg_cron
    const taskRef = `eclaim-${selected.id}-${Date.now()}`
    const { data, error } = await supabase.rpc('submit_claim_correction', {
      p_claim_id:          selected.id,
      p_admin_employee_id: empId,
      p_correction_note:   correctionNote,
      p_task_id:           taskRef,
    })
    if (error || data?.error) { setActionMsg('❌ '+(error?.message||data?.error)); setActionBusy(false); return }
    setCorrectionMode(false); setCorrectionNote('')
    setActionMsg(`✅ Correction submitted. DH notified — 3-day window started. Deadline: ${data?.deadline?.slice(0,10)}`)
    setActionBusy(false)
    load()
  }

  // ── Accounts: approve claim ───────────────────────────────────
  async function accountsApprove() {
    setActionBusy(true); setActionMsg('')
    const empId = currentEmpId
    const { data, error } = await supabase.rpc('accounts_approve_claim', {
      p_claim_id: selected.id, p_accounts_employee_id: empId,
    })
    if (error || data?.error) { setActionMsg('❌ '+(error?.message||data?.error)); setActionBusy(false); return }
    setActionMsg('✅ Claim approved by Accounts — employee notified')
    setActionBusy(false)
    load()
    setSelected(prev => ({ ...prev, status:'ACCOUNTS_APPROVED' }))
  }

  // ── Accounts: reject claim ────────────────────────────────────
  async function accountsReject() {
    if (!rejectReason.trim()) return
    setActionBusy(true); setActionMsg('')
    const empId = currentEmpId
    const { data, error } = await supabase.rpc('accounts_reject_claim', {
      p_claim_id: selected.id, p_accounts_employee_id: empId, p_reason: rejectReason,
    })
    if (error || data?.error) { setActionMsg('❌ '+(error?.message||data?.error)); setActionBusy(false); return }
    setRejectMode(null); setRejectReason('')
    setActionMsg('Claim rejected — Finance Admin notified to correct')
    setActionBusy(false)
    load()
    setSelected(prev => ({ ...prev, status:'REJECTED' }))
  }

  // ── Print claim — via Template Library (monthly_expense_claim builder) ────────
  async function printClaim(claim, det) {
    const emp     = empMap[claim.employee_id] || {}
    const deptObj = depts.find(d => d.dept_name===claim.department || d.dept_code===claim.department)
    const deptCode= deptObj?.dept_code || claim.department || '—'
    const lines   = det?.lines || []
    const food    = det?.food  || []

    // Total food allowance as single summary value
    const foodTotal = food.reduce((s,f) => s + (parseFloat(f.total_amount)||0), 0)

    // Map food_allowances → annexure format
    const foodItems = food.map(f => ({
      date:       f.allowance_date,
      location:   f.location || '—',
      job_type:   f.job_type || '—',
      no_persons: f.no_persons || 1,
      no_days:    f.no_days || 1,
      daily_rate: f.daily_rate || 0,
      amount:     f.total_amount || 0,
    }))

    // Map expense_records fields → template's expected field names
    const mappedLines = lines.map(l => ({
      date:       l.expense_date,
      category:   l.category || l.expense_type || '—',
      vendor:     l.vendor_name || '—',
      net_amount: l.amount,
      vat_amount: l.vat_amount || 0,
      total:      (parseFloat(l.amount)||0) + (parseFloat(l.vat_amount)||0),
      status:     l.status,
    }))

    // Derive rolling period window dates (26th prev → 25th current; Jan = 1-25; Dec → 31)
    const [yr, mo] = (claim.period||'').split('-').map(Number)
    let fromDate = '', toDate = ''
    if (yr && mo) {
      if (mo === 1) {
        fromDate = `${yr}-01-01`
        toDate   = `${yr}-01-25`
      } else if (mo === 12) {
        fromDate = `${yr}-11-26`
        toDate   = `${yr}-12-31`
      } else {
        const prevMo = String(mo-1).padStart(2,'0')
        fromDate = `${yr}-${prevMo}-26`
        toDate   = `${yr}-${String(mo).padStart(2,'0')}-25`
      }
    }

    const data = {
      claim_number:    claim.claim_number,
      employee_name:   emp.full_name_en || '—',
      employee_no:     emp.employee_number || '—',
      department:      deptCode,
      project_no:      claim.project_no || '—',
      project_name:    claim.project_name || '—',
      period:          periodLabel(claim.period),
      from_date:       fromDate,
      to_date:         toDate,
      total_claimed:   claim.total_claimed,
      total_vat:       claim.total_vat_recoverable,
      advances:        claim.total_advances_received,
      balance_due:     claim.balance_with_employee,
      generated_date:  new Date().toISOString().slice(0,10),
      submission_round: claim.rejection_round ? claim.rejection_round + 1 : 1,
      sheet_number:    1,
      total_sheets:    1,
      grand_total:     claim.total_claimed,
      lines:           mappedLines,
      rejections:      det?.rejHist || [],
      food_allowance:  food.length > 0 ? { show: true, amount: foodTotal } : { show: false, amount: 0 },
      food_items:      foodItems,
    }

    // Must open window synchronously before async work (popup blocker)
    const win = openPrintWindow()
    await printDocument('monthly_expense_claim', data, {
      _preWin:       win,
      driveFolder:   'expense-claims',
      driveFileName: `${claim.claim_number || 'Claim'}.pdf`,
      orientation:   'portrait',
    })
  }

  // ── Print Food Allowance — separate via monthly_food_allowance template ──────
  async function printFoodAllowance(claim, det) {
    const emp     = empMap[claim.employee_id] || {}
    const food    = det?.food || []
    if (food.length === 0) { alert('No food allowance records for this claim period.'); return }

    const [yr, mo] = (claim.period || '').split('-').map(Number)
    let fromDate, toDate
    if (mo === 1)       { fromDate = `${yr}-01-01`; toDate = `${yr}-01-25` }
    else if (mo === 12) { fromDate = `${yr}-11-26`; toDate = `${yr}-12-31` }
    else {
      fromDate = `${yr}-${String(mo-1).padStart(2,'0')}-26`
      toDate   = `${yr}-${String(mo).padStart(2,'0')}-25`
    }

    const data = {
      entity_name:   'RATAL',
      entity_address:'Saudi Arabia',
      claim_number:  claim.claim_number || '—',
      employee_name: emp.full_name_en || emp.full_name || claim.employee_name || '—',
      employee_no:   emp.employee_no || '—',
      department:    emp.department  || claim.department || '—',
      period:        claim.period    || '—',
      from_date:     fromDate,
      to_date:       toDate,
      project_no:    claim.project_no   || '—',
      project_name:  claim.project_name || '—',
      // Map food_allowances → buildFoodAllowanceClaim lines format
      lines: food.map(f => ({
        date:     f.allowance_date,
        job_no:   '—',
        location: f.location  || '—',
        job_type: f.job_type  || '—',
        persons:  f.no_persons || 1,
        amount:   parseFloat(f.total_amount) || 0,
      })),
    }

    const win = openPrintWindow()
    await printDocument('monthly_food_allowance', data, {
      _preWin:       win,
      driveFolder:   'food-allowance-claims',
      driveFileName: `FA-${claim.claim_number || claim.id}.pdf`,
      orientation:   'portrait',
    })
  }

  // ── Generate claims ───────────────────────────────────────────
  async function openGenerateModal() {
    setGenOpen(true); setGenResult(null); setGenPreview([])
    const { data } = await supabase.rpc('preview_expense_claims', {
      p_entity_id: entityId, p_period: filterPeriod,
    })
    setGenPreview(data || [])
  }

  async function runGenerate() {
    setGenBusy(true)
    const empId = currentEmpId
    const { data, error } = await supabase.rpc('generate_expense_claims', {
      p_entity_id:    entityId,
      p_period:       filterPeriod,
      p_generated_by: empId,
    })
    if (error) { setGenResult({ error: error.message }); setGenBusy(false); return }
    // Store generated_by_name on claims (update on the DB side via RPC already)
    setGenResult(data)
    setGenBusy(false)
    load()
  }

  // ── Filtering ─────────────────────────────────────────────────
  const visible = useMemo(() => claims.filter(c => {
    if (filterPeriod && c.period !== filterPeriod) return false
    if (filterStatus !== 'ALL' && c.status !== filterStatus) return false
    if (filterDept) {
      const matchDept = depts.find(d => (d.dept_code||d.dept_name) === filterDept)
      if (!matchDept) return false
      if (c.department !== matchDept.dept_code && c.department !== matchDept.dept_name) return false
    }
    // DH: only see claims for their department employees
    if (isDH && dhEmployeeIds && !dhEmployeeIds.has(c.employee_id)) return false
    // Accounts (non-admin) would see DH_APPROVED only — but in this app ADMIN handles accounts
    if (search) {
      const q = search.toLowerCase()
      const emp = empMap[c.employee_id]
      if (!(c.claim_number||'').toLowerCase().includes(q) &&
          !(emp?.full_name_en||'').toLowerCase().includes(q)) return false
    }
    return true
  }), [claims, filterPeriod, filterStatus, filterDept, isDH, dhEmployeeIds, search, empMap, depts])

  // DH pending corrections (always show regardless of period filter)
  const pendingCorrections = isDH
    ? claims.filter(c =>
        dhEmployeeIds?.has(c.employee_id) &&
        c.dh_correction_status === 'PENDING'
      )
    : []

  // KPIs — based on visible list
  const kpi = {
    total:     visible.length,
    pendingDH: visible.filter(c=>c.status==='SUBMITTED').length,
    pendingAC: visible.filter(c=>c.status==='DH_APPROVED').length,
    rejected:  visible.filter(c=>c.status==='REJECTED').length,
    posted:    visible.filter(c=>c.status==='POSTED').length,
  }

  // Period options — last 12 months
  const periodOptions = Array.from({length:12}, (_,i) => {
    const d = new Date(); d.setMonth(d.getMonth()-i)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
  })

  // ── Cutoff notice for DH ─────────────────────────────────────
  const cutoffPassed = isActionable(filterPeriod)

  // ─────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>

      {/* ── Pending corrections banner (DH only) ── */}
      {isDH && pendingCorrections.length > 0 && pendingCorrections.map(c => {
        const timer = timeRemaining(c.dh_escalation_deadline)
        return (
          <div key={c.id} style={{ background:'#fff3e0', border:'1px solid #ffb300', borderRadius:10, padding:'12px 18px', marginBottom:12, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span style={{fontSize:20}}>⚠️</span>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:'#e65100'}}>Correction pending — {c.claim_number}</div>
                <div style={{fontSize:11,color:'#bf360c',marginTop:2}}>{c.correction_note}</div>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {timer && <span style={{fontSize:11,fontWeight:700,color:timer.urgent?'#c62828':'#e65100',background:timer.urgent?'#fce4ec':'#fff8e1',padding:'3px 9px',borderRadius:20}}>{timer.label}</span>}
              <button style={S.btn('#1D9E75','#fff')} onClick={()=>openClaim(c)} disabled={actionBusy}>Review</button>
            </div>
          </div>
        )
      })}

      {/* ── KPI cards ── */}
      <div style={S.kpiRow}>
        <div style={S.kpi('#1565c0','#1976d2')}><div style={S.kpiIco}>📋</div><div style={S.kpiNum}>{kpi.total}</div><div style={S.kpiLbl}>Total Claims</div></div>
        <div style={S.kpi('#e65100','#f57f17')}><div style={S.kpiIco}>🕐</div><div style={S.kpiNum}>{kpi.pendingDH}</div><div style={S.kpiLbl}>Pending DH Review</div></div>
        <div style={S.kpi('#00695c','#00897b')}><div style={S.kpiIco}>📊</div><div style={S.kpiNum}>{kpi.pendingAC}</div><div style={S.kpiLbl}>Pending Accounts</div></div>
        <div style={S.kpi('#b71c1c','#e53935')}><div style={S.kpiIco}>⛔</div><div style={S.kpiNum}>{kpi.rejected}</div><div style={S.kpiLbl}>Rejected</div></div>
        <div style={S.kpi('#4527a0','#6a1b9a')}><div style={S.kpiIco}>✅</div><div style={S.kpiNum}>{kpi.posted}</div><div style={S.kpiLbl}>Posted</div></div>
      </div>

      {/* ── Load error ── */}
      {loadError && (
        <div style={{...S.alert(loadError.startsWith('❌')?'#c62828':'#e65100', loadError.startsWith('❌')?'#fce4ec':'#fff3e0'), marginBottom:16}}>
          {loadError}
        </div>
      )}

      {/* ── Filters ── */}
      <div style={S.filters}>
        <select style={S.sel} value={filterPeriod} onChange={e=>setFilterPeriod(e.target.value)}>
          {periodOptions.map(p=><option key={p} value={p}>{periodLabel(p)}</option>)}
        </select>
        <select style={S.sel} value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}>
          <option value="ALL">All Statuses</option>
          {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
        {isAdmin && (
          <select style={S.sel} value={filterDept} onChange={e=>setFilterDept(e.target.value)}>
            <option value="">All Departments</option>
            {depts.map(d=><option key={d.id} value={d.dept_code||d.dept_name}>
              {d.dept_code ? `${d.dept_code} — ${d.dept_name}` : d.dept_name}
            </option>)}
          </select>
        )}
        <input style={S.srch} placeholder="Search employee, claim #…" value={search} onChange={e=>setSearch(e.target.value)} />
        <button style={S.btn('#6b7c93','#fff')} onClick={load}>↻ Refresh</button>
        {isAdmin && (
          <button style={{...S.btn('#1a3a6b','#fff'), display:'flex', alignItems:'center', gap:6}} onClick={openGenerateModal}>
            ⚡ Generate Claims
          </button>
        )}
      </div>

      {/* ── Page-level tab bar ── */}
      <div style={{display:'flex', gap:0, marginBottom:16, borderBottom:`2px solid ${MC}`, flexWrap:'wrap'}}>
        {[
          { key:'claims',        label:'📋 Claims',           count: null },
          { key:'live-expenses', label:'🧾 Live Expenses',    count: liveExp.length },
          { key:'live-fa',       label:'🍽 Food Allowance',   count: liveFA.length },
          { key:'live-ot',       label:'⏱ Overtime',         count: liveOT.length },
        ].map(t => (
          <button key={t.key} onClick={()=>setPageTab(t.key)} style={{
            padding:'8px 18px', fontFamily:"'Poppins',sans-serif", fontWeight:700, fontSize:12,
            background: pageTab===t.key ? MC : 'transparent',
            color:      pageTab===t.key ? '#fff' : MC,
            border:'none', borderRadius:'8px 8px 0 0', cursor:'pointer',
            display:'flex', alignItems:'center', gap:6,
          }}>
            {t.label}
            {t.count !== null && (
              <span style={{background: pageTab===t.key?'rgba(255,255,255,0.25)':'#f0e8ea', color: pageTab===t.key?'#fff':MC, borderRadius:20, padding:'1px 7px', fontSize:10, fontWeight:800}}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Live tab search filter helper ── */}
      {pageTab !== 'claims' && (() => {
        const q = search.toLowerCase().trim()
        const matchEmp = r => {
          if (!q) return true
          const emp = empMap[r.employee_id]
          return (emp?.full_name_en||'').toLowerCase().includes(q) ||
                 (emp?.employee_number||'').toLowerCase().includes(q)
        }

        // ── Summary bar component ──────────────────────────────────
        function SummaryBar({ rows, totalKey, extraLabel, extraVal, color }) {
          const total = rows.reduce((s,r) => s + (parseFloat(r[totalKey])||0), 0)
          const empCount = new Set(rows.map(r=>r.employee_id)).size
          return (
            <div style={{display:'flex',gap:20,marginBottom:12,padding:'11px 18px',
              background:'#f8f4f5',borderRadius:10,flexWrap:'wrap',alignItems:'center',
              border:`1px solid ${MC}22`}}>
              <span style={{fontSize:13,fontWeight:800,color:MC}}>
                {rows.length} record{rows.length!==1?'s':''}
              </span>
              <span style={{fontSize:13,fontWeight:700,color:'#1a3a6b'}}>
                SAR {fmtSAR(total)}
              </span>
              {extraLabel && (
                <span style={{fontSize:12,fontWeight:700,color:'#0F6E56'}}>
                  {extraLabel}: {extraVal}
                </span>
              )}
              <span style={{fontSize:12,color:'#666',marginLeft:'auto'}}>
                {empCount} employee{empCount!==1?'s':''}
                {q && <span style={{color:MC,fontWeight:700}}> · filtered: "{search}"</span>}
              </span>
            </div>
          )
        }

        // ── Live Expenses ──────────────────────────────────────────
        if (pageTab === 'live-expenses') {
          const rows = liveExp.filter(matchEmp)
          return (
            <div>
              {liveLoading && <div style={{textAlign:'center',padding:32,color:'#aab2bd'}}>Loading expense records…</div>}
              {!liveLoading && liveExp.length === 0 && (
                <div style={S.alert('#e65100','#fff3e0')}>
                  🧾 No expense records found for {periodLabel(filterPeriod)}.
                </div>
              )}
              {!liveLoading && liveExp.length > 0 && (
                <>
                  <SummaryBar rows={rows} totalKey="amount" />
                  {rows.length === 0 && <div style={S.alert('#e65100','#fff3e0')}>No expense records match "{search}".</div>}
                  {rows.length > 0 && (
                    <table style={S.tbl}>
                      <thead><tr>
                        {['Date','Employee','Category','Vendor / Description','Amount (SAR)','VAT','Status','Claim'].map(h=>(
                          <th key={h} style={S.th}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {rows.map((r,i)=>{
                          const emp = empMap[r.employee_id]
                          return (
                            <tr key={r.id} style={S.tr(i)}>
                              <td style={S.td}>{fmtDate(r.expense_date)}</td>
                              <td style={S.td}>
                                <div style={{fontWeight:600,fontSize:12}}>{emp?.full_name_en||'—'}</div>
                                <div style={{fontSize:10,color:'#aab2bd'}}>{emp?.employee_number||''}</div>
                              </td>
                              <td style={S.td}><span style={{fontSize:11,fontWeight:600,color:'#1a3a6b'}}>{r.category||r.expense_type||'—'}</span></td>
                              <td style={S.td}>{r.vendor_name||'—'}</td>
                              <td style={{...S.td,textAlign:'right',fontWeight:700}}>{fmtSAR(r.amount)}</td>
                              <td style={{...S.td,textAlign:'right',color:'#666'}}>{r.vat_amount>0?fmtSAR(r.vat_amount):'—'}</td>
                              <td style={S.td}>
                                <span style={{fontSize:10,padding:'2px 8px',borderRadius:20,fontWeight:700,
                                  background:r.claim_id?'#e8f5e9':'#fff8e1',
                                  color:r.claim_id?'#2e7d32':'#f57f17'}}>
                                  {r.claim_id?'Claimed':r.status||'RECORDED'}
                                </span>
                                {r.late_days>30 && <span style={{fontSize:10,color:'#c62828',marginLeft:4}}>⚠ Late</span>}
                              </td>
                              <td style={{...S.td,fontSize:11,color:'#aab2bd'}}>{r.claim_id?'✅':'—'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          )
        }

        // ── Live Food Allowance ────────────────────────────────────
        if (pageTab === 'live-fa') {
          const rows = liveFA.filter(matchEmp)
          return (
            <div>
              {liveLoading && <div style={{textAlign:'center',padding:32,color:'#aab2bd'}}>Loading food allowance records…</div>}
              {!liveLoading && liveFA.length === 0 && (
                <div style={S.alert('#e65100','#fff3e0')}>
                  🍽 No food allowance records found for {periodLabel(filterPeriod)}.
                </div>
              )}
              {!liveLoading && liveFA.length > 0 && (
                <>
                  <SummaryBar rows={rows} totalKey="total_amount"
                    extraLabel="Total Days" extraVal={rows.reduce((s,r)=>s+(parseFloat(r.no_days)||0),0)} />
                  {rows.length === 0 && <div style={S.alert('#e65100','#fff3e0')}>No food allowance records match "{search}".</div>}
                  {rows.length > 0 && (
                    <table style={S.tbl}>
                      <thead><tr>
                        {['Date','Employee','Location','Job Type','Persons','Days','Daily Rate','Total (SAR)','Status'].map(h=>(
                          <th key={h} style={S.th}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {rows.map((r,i)=>{
                          const emp = empMap[r.employee_id]
                          return (
                            <tr key={r.id} style={S.tr(i)}>
                              <td style={S.td}>{fmtDate(r.allowance_date)}</td>
                              <td style={S.td}>
                                <div style={{fontWeight:600,fontSize:12}}>{emp?.full_name_en||'—'}</div>
                                <div style={{fontSize:10,color:'#aab2bd'}}>{emp?.employee_number||''}</div>
                              </td>
                              <td style={S.td}>{r.location||'—'}</td>
                              <td style={S.td}><span style={{fontSize:11,fontWeight:600,color:'#0F6E56'}}>{r.job_type||'—'}</span></td>
                              <td style={{...S.td,textAlign:'center'}}>{r.no_persons||1}</td>
                              <td style={{...S.td,textAlign:'center'}}>{r.no_days||1}</td>
                              <td style={{...S.td,textAlign:'right'}}>{fmtSAR(r.daily_rate)}</td>
                              <td style={{...S.td,textAlign:'right',fontWeight:700}}>{fmtSAR(r.total_amount)}</td>
                              <td style={S.td}>
                                <span style={{fontSize:10,padding:'2px 8px',borderRadius:20,fontWeight:700,
                                  background:'#e8f5e9',color:'#2e7d32'}}>
                                  {r.status||'RECORDED'}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          )
        }

        // ── Live Overtime ──────────────────────────────────────────
        if (pageTab === 'live-ot') {
          const rows = liveOT.filter(matchEmp)
          return (
            <div>
              {liveLoading && <div style={{textAlign:'center',padding:32,color:'#aab2bd'}}>Loading overtime records…</div>}
              {!liveLoading && liveOT.length === 0 && (
                <div style={S.alert('#e65100','#fff3e0')}>
                  ⏱ No overtime records found for {periodLabel(filterPeriod)}.
                </div>
              )}
              {!liveLoading && liveOT.length > 0 && (
                <>
                  <SummaryBar rows={rows} totalKey="total_hours"
                    extraLabel="Total Hours" extraVal={rows.reduce((s,r)=>s+(parseFloat(r.total_hours)||0),0).toFixed(1)+'h'} />
                  {rows.length === 0 && <div style={S.alert('#e65100','#fff3e0')}>No overtime records match "{search}".</div>}
                  {rows.length > 0 && (
                    <table style={S.tbl}>
                      <thead><tr>
                        {['Date','Employee','Start','End','Hours','Job Type','Project','Status'].map(h=>(
                          <th key={h} style={S.th}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {rows.map((r,i)=>{
                          const emp = empMap[r.employee_id]
                          return (
                            <tr key={r.id} style={S.tr(i)}>
                              <td style={S.td}>{fmtDate(r.work_date)}</td>
                              <td style={S.td}>
                                <div style={{fontWeight:600,fontSize:12}}>{emp?.full_name_en||'—'}</div>
                                <div style={{fontSize:10,color:'#aab2bd'}}>{emp?.employee_number||''}</div>
                              </td>
                              <td style={S.td}>{r.start_time?r.start_time.slice(0,5):'—'}</td>
                              <td style={S.td}>{r.end_time?r.end_time.slice(0,5):'—'}</td>
                              <td style={{...S.td,textAlign:'center',fontWeight:700,color:MC}}>{parseFloat(r.total_hours||0).toFixed(1)}</td>
                              <td style={S.td}><span style={{fontSize:11,fontWeight:600,color:'#0F6E56'}}>{r.job_type||'—'}</span></td>
                              <td style={S.td}>{r.project_id?<span style={{fontSize:10,fontWeight:700,color:'#1a3a6b',background:'#e8edf6',padding:'2px 6px',borderRadius:4}}>Linked</span>:<span style={{color:'#aab2bd',fontSize:11}}>—</span>}</td>
                              <td style={S.td}>
                                <span style={{fontSize:10,padding:'2px 8px',borderRadius:20,fontWeight:700,background:'#e3f2fd',color:'#1565c0'}}>
                                  {r.status||'RECORDED'}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          )
        }

        return null
      })()}

      {/* ── Claims tab content ── */}
      {pageTab === 'claims' && (<>

      {/* ── Cutoff notice for DH ── */}
      {isDH && !cutoffPassed && (
        <div style={S.alert('#1565c0','#e3f2fd')}>
          📅 <strong>Before cutoff</strong> — You're viewing {periodLabel(filterPeriod)} expenses. Action buttons will appear after the 26th of this month.
        </div>
      )}

      {/* ── No claims notice ── */}
      {!loading && visible.length === 0 && (
        <div style={S.alert('#e65100','#fff3e0')}>
          📋 <strong>No claims found for {periodLabel(filterPeriod)}.</strong>
          {isAdmin && ' Click ⚡ Generate Claims to bundle expense records into claims.'}
          {isDH && ' No claims in your department for this period.'}
        </div>
      )}

      {/* ── Claims table — collapsible rows ── */}
      {loading
        ? <div style={{textAlign:'center',padding:48,color:'#aab2bd'}}>Loading claims…</div>
        : visible.length > 0 && (
          <table style={S.tbl}>
            <thead>
              <tr>
                {['','Claim #','Employee','Dept · Project','Period','Status'].map(h=>(
                  <th key={h} style={{...S.th, textAlign: h===''?'center':'left'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((c,i)=>{
                const emp     = empMap[c.employee_id]
                const timer   = c.dh_correction_status==='PENDING' ? timeRemaining(c.dh_escalation_deadline) : null
                const deptObj = depts.find(d => d.dept_name===c.department || d.dept_code===c.department)
                const deptCode= deptObj?.dept_code || c.department || '—'
                const isOpen  = expandedRows.has(c.id)
                const toggleRow = () => setExpandedRows(prev => {
                  const next = new Set(prev)
                  isOpen ? next.delete(c.id) : next.add(c.id)
                  return next
                })
                const TD = {...S.td, whiteSpace:'nowrap'}
                const balNeg = parseFloat(c.balance_with_employee) < 0

                return [
                  /* ── Collapsed summary row ── */
                  <tr key={c.id} style={{...S.tr(i), cursor:'pointer'}} onClick={toggleRow}>
                    <td style={{...TD,width:32,textAlign:'center',fontSize:14,color:MC,userSelect:'none'}}>
                      {isOpen ? '▲' : '▶'}
                    </td>
                    <td style={{...TD,fontWeight:700,color:MC}}>{c.claim_number}</td>
                    <td style={{...TD,maxWidth:180}}>
                      <div style={{fontWeight:600,fontSize:12}}>{emp?.full_name_en||'—'}</div>
                      <div style={{fontSize:10,color:'#aab2bd'}}>{emp?.employee_number||''}</div>
                    </td>
                    <td style={TD}>
                      <span style={{fontSize:11,fontWeight:700,color:'#1a3a6b',background:'#e8edf6',padding:'2px 7px',borderRadius:5}}>{deptCode}</span>
                      {c.project_no && c.project_no !== '—' && (
                        <span style={{fontSize:10,fontWeight:600,color:'#0F6E56',background:'#e8f5e9',padding:'2px 7px',borderRadius:5,marginLeft:4}}>{c.project_no}</span>
                      )}
                    </td>
                    <td style={TD}>{periodLabel(c.period)}</td>
                    <td style={TD}>
                      <span style={S.badge(c.status)}><span style={S.dot(c.status)}></span>{STATUS[c.status]?.label||c.status}</span>
                      {timer && <span style={{fontSize:10,color:timer.urgent?'#c62828':'#e65100',marginLeft:6}}>⏱ {timer.label}</span>}
                    </td>
                  </tr>,

                  /* ── Expanded details row ── */
                  isOpen && (
                    <tr key={c.id+'-exp'}>
                      <td colSpan={6} style={{padding:0,borderBottom:'2px solid '+MC}}>
                        <div style={{background:MC2,padding:'14px 20px',display:'grid',gridTemplateColumns:'repeat(4,1fr) auto',gap:'12px 20px',alignItems:'start'}}>
                          {/* Amounts */}
                          <div>
                            <div style={{fontSize:9,fontWeight:700,color:MC,textTransform:'uppercase',letterSpacing:.5,marginBottom:3}}>Total Claimed</div>
                            <div style={{fontSize:15,fontWeight:800,color:'#1a2e3d'}}>SAR {fmtSAR(c.total_claimed)}</div>
                          </div>
                          <div>
                            <div style={{fontSize:9,fontWeight:700,color:MC,textTransform:'uppercase',letterSpacing:.5,marginBottom:3}}>Advances</div>
                            <div style={{fontSize:15,fontWeight:800,color:'#1a2e3d'}}>SAR {fmtSAR(c.total_advances_received)}</div>
                          </div>
                          <div>
                            <div style={{fontSize:9,fontWeight:700,color:MC,textTransform:'uppercase',letterSpacing:.5,marginBottom:3}}>Balance Due</div>
                            <div style={{fontSize:15,fontWeight:800,color:balNeg?'#c62828':'#2e7d32'}}>
                              {balNeg?'−':''}SAR {fmtSAR(Math.abs(c.balance_with_employee))}
                            </div>
                          </div>
                          <div>
                            <div style={{fontSize:9,fontWeight:700,color:MC,textTransform:'uppercase',letterSpacing:.5,marginBottom:3}}>Generated By</div>
                            <div style={{fontSize:12,color:'#455a64'}}>{c.generated_by_name||'—'}</div>
                            {c.project_no && c.project_no !== '—' && (
                              <div style={{fontSize:10,color:'#0F6E56',fontWeight:600,marginTop:3}}>📁 {c.project_no} — {c.project_name||''}</div>
                            )}
                          </div>
                          {/* Actions */}
                          <div style={{display:'flex',flexDirection:'column',gap:6,alignItems:'flex-end'}}>
                            <button style={{...S.btn(MC,'#fff'), fontSize:11, padding:'6px 16px', borderRadius:7}}
                              onClick={e=>{e.stopPropagation();openClaim(c)}}>
                              📋 Open Detail
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ].filter(Boolean)
              })}
            </tbody>
          </table>
        )
      }

      </>)} {/* end pageTab === 'claims' */}

      {/* ══ Claim Detail Modal — 4-layer Finance style ════════════ */}
      {selected && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}} onClick={closeDrawer}>
          <div style={{background:'#fff',borderRadius:16,width:'100%',maxWidth:960,maxHeight:'94vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,0.3)',overflow:'hidden'}} onClick={e=>e.stopPropagation()}>

            {/* ── L1: Maroon gradient header ── */}
            <div style={{background:`linear-gradient(135deg,${MC} 0%,#6b2339 100%)`,padding:'18px 24px',flexShrink:0,display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div>
                <div style={{color:'rgba(255,255,255,0.65)',fontSize:11,fontWeight:600,letterSpacing:1,textTransform:'uppercase',marginBottom:4}}>Expense Claim</div>
                <div style={{color:'#fff',fontWeight:900,fontSize:22,letterSpacing:.5}}>{selected.claim_number}</div>
                <div style={{color:'rgba(255,255,255,0.75)',fontSize:13,marginTop:4}}>
                  {empMap[selected.employee_id]?.full_name_en||'—'} &nbsp;·&nbsp; {selected.department||'—'}
                  {selected.project_no && selected.project_no !== '—' && <> &nbsp;·&nbsp; 📁 {selected.project_no}</>}
                  &nbsp;·&nbsp; {periodLabel(selected.period)}
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10,marginTop:4}}>
                <span style={{...S.badge(selected.status),fontSize:11,padding:'4px 12px'}}><span style={S.dot(selected.status)}></span>{STATUS[selected.status]?.label}</span>
                <button style={{background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.3)',color:'#fff',borderRadius:8,padding:'6px 14px',cursor:'pointer',fontWeight:700,fontSize:13}} onClick={closeDrawer}>✕</button>
              </div>
            </div>

            {/* ── L2: Scrollable body on light pink ── */}
            <div style={{background:MC2,overflowY:'auto',flex:1,padding:'20px 24px',display:'flex',flexDirection:'column',gap:16}}>

              {/* ── DH Correction pending alert ── */}
              {isDH && selected.dh_correction_status==='PENDING' && (
                <div style={{background:'#fff8e1',border:'2px solid #ffb300',borderRadius:10,padding:'14px 18px'}}>
                  <div style={{fontWeight:800,color:'#e65100',fontSize:13,marginBottom:6}}>⚠️ Correction made by Accounts — your response needed</div>
                  <div style={{fontSize:12,color:'#795548',marginBottom:6}}>{selected.correction_note}</div>
                  <div style={{fontSize:11,color:'#795548',marginBottom:10}}>Corrected by: <strong>{selected.corrected_by_name}</strong> on {fmtDate(selected.corrected_at)}</div>
                  {timeRemaining(selected.dh_escalation_deadline) && (
                    <div style={{fontSize:12,fontWeight:700,color:timeRemaining(selected.dh_escalation_deadline)?.urgent?'#c62828':'#e65100',marginBottom:12}}>
                      ⏱ {timeRemaining(selected.dh_escalation_deadline)?.label} — if no action, correction auto-approves
                    </div>
                  )}
                  {!dhObjMode && (
                    <div style={{display:'flex',gap:8}}>
                      <button style={S.btn('#1D9E75','#fff')} onClick={dhAcknowledge} disabled={actionBusy}>✓ Acknowledge &amp; Proceed</button>
                      <button style={S.btn('#fff3e0','#e65100','1px solid #ffb300')} onClick={()=>setDhObjMode(true)}>Raise Concern</button>
                    </div>
                  )}
                  {dhObjMode && (
                    <div style={{marginTop:10}}>
                      <textarea style={{...S.inp,minHeight:72}} placeholder="Describe your concern or justification…" value={dhObjReason} onChange={e=>setDhObjReason(e.target.value)} rows={3} />
                      <div style={{display:'flex',gap:8,marginTop:8}}>
                        <button style={S.btn(MC,'#fff')} onClick={dhObject} disabled={actionBusy||!dhObjReason.trim()}>Submit Concern</button>
                        <button style={S.btn('#f5f5f5','#333')} onClick={()=>setDhObjMode(false)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── DH objected banner ── */}
              {isDH && selected.dh_correction_status==='OBJECTED' && (
                <div style={{background:'#fce4ec',border:'1px solid #ef9a9a',borderRadius:10,padding:'12px 16px',color:'#c62828',fontSize:12,fontWeight:600}}>
                  ⚠️ You have raised a concern. Finance Admin has been notified. {timeRemaining(selected.dh_escalation_deadline)?.label ? `Timer: ${timeRemaining(selected.dh_escalation_deadline)?.label}` : ''}
                </div>
              )}

              {/* ── Rejection history ── */}
              {(detail?.rejHist||[]).length > 0 && (
                <div style={{background:'#fff',borderRadius:10,boxShadow:'0 1px 6px rgba(0,0,0,0.07)',overflow:'hidden'}}>
                  <div style={{background:'#c62828',padding:'10px 16px'}}>
                    <span style={{color:'#fff',fontWeight:800,fontSize:11,letterSpacing:1,textTransform:'uppercase'}}>Rejection History</span>
                  </div>
                  <div style={{padding:'12px 16px',display:'flex',flexDirection:'column',gap:8}}>
                    {(detail.rejHist||[]).map(r=>(
                      <div key={r.id} style={{fontSize:12,color:'#c62828',paddingBottom:8,borderBottom:'1px solid #fce4ec'}}>
                        <strong>Round {r.round}</strong> — {r.rejected_by_name} on {fmtDate(r.rejected_at)}: {r.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── L3 Card: Claim Summary ── */}
              <div style={{background:'#fff',borderRadius:10,boxShadow:'0 1px 6px rgba(0,0,0,0.07)',overflow:'hidden'}}>
                <div style={{background:MC,padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{color:'#fff',fontWeight:800,fontSize:11,letterSpacing:1,textTransform:'uppercase'}}>Claim Summary</span>
                </div>
                <div style={{padding:'16px',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'12px 20px'}}>
                  {[
                    ['Employee',    empMap[selected.employee_id]?.full_name_en||'—'],
                    ['Emp. No.',    empMap[selected.employee_id]?.employee_number||'—'],
                    ['Department',  selected.department||'—'],
                    selected.project_no && selected.project_no !== '—'
                      ? ['Project', `${selected.project_no} — ${selected.project_name||''}`]
                      : null,
                    ['Period',      periodLabel(selected.period)],
                    ['Sheets',      `${selected.total_sheets||1} sheet${(selected.total_sheets||1)>1?'s':''}`],
                    ['Total Claimed','SAR '+fmtSAR(selected.total_claimed)],
                    ['VAT Recoverable','SAR '+fmtSAR(selected.total_vat_recoverable)],
                    ['Advances',    'SAR '+fmtSAR(selected.total_advances_received)],
                    ['Balance',     'SAR '+fmtSAR(Math.abs(selected.balance_with_employee))],
                    ['Generated By',selected.generated_by_name||'—'],
                    selected.dh_acknowledged_at
                      ? ['Docs Received', (selected.dh_acknowledged_by_name||'DH') + ' · ' + fmtDate(selected.dh_acknowledged_at)]
                      : null,
                    selected.dh_approved_by_name ? ['DH Approved By',selected.dh_approved_by_name+' · '+fmtDate(selected.dh_approved_at)] : null,
                    selected.accounts_approved_by_name ? ['Accounts Approved',selected.accounts_approved_by_name+' · '+fmtDate(selected.accounts_approved_at)] : null,
                    selected.corrected_by_name ? ['Last Corrected',selected.corrected_by_name+' · '+fmtDate(selected.corrected_at)] : null,
                  ].filter(Boolean).map(([lbl,val],i)=>(
                    <div key={i}>
                      <div style={{fontSize:10,fontWeight:700,color:MC,textTransform:'uppercase',letterSpacing:.5,marginBottom:3}}>{lbl}</div>
                      <div style={{fontSize:12,fontWeight:600,color:'#1a2e3d'}}>{val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {detailLoading && <div style={{textAlign:'center',padding:32,color:'#aab2bd',background:'#fff',borderRadius:10}}>Loading detail…</div>}

              {/* ── L3 Card: Expense Records ── */}
              {detail && (
                <div style={{background:'#fff',borderRadius:10,boxShadow:'0 1px 6px rgba(0,0,0,0.07)',overflow:'hidden'}}>
                  <div style={{background:'#1a3a6b',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                    <span style={{color:'#fff',fontWeight:800,fontSize:11,letterSpacing:1,textTransform:'uppercase'}}>
                      Expense Records ({detail.lines.length}){detail.food?.length > 0 ? <span style={{fontWeight:400,fontSize:10,opacity:.75,marginLeft:6}}>+ 🍽 Food Allowance</span> : null}
                    </span>
                    {isAdmin && ['DH_APPROVED','REJECTED'].includes(selected.status) && !zeroMode && (
                      <button style={{...S.btn('rgba(255,255,255,0.15)','#fff','1px solid rgba(255,255,255,0.3)'),fontSize:10,padding:'4px 12px'}} onClick={()=>setZeroMode(true)}>
                        🗑 Zero-out duplicates
                      </button>
                    )}
                  </div>

                  {/* Zero-out reason input */}
                  {zeroMode && (
                    <div style={{padding:'12px 16px',background:'#fff8e1',borderBottom:'1px solid #ffb300',display:'flex',gap:10,alignItems:'center'}}>
                      <input style={{...S.inp,minHeight:'unset',height:34,flex:1,resize:'none'}} placeholder="Reason for zeroing out (required)" value={zeroNote} onChange={e=>setZeroNote(e.target.value)} />
                      <button style={{...S.btn('#f5f5f5','#333'),whiteSpace:'nowrap',fontSize:11}} onClick={()=>{setZeroMode(false);setZeroNote('')}}>Cancel</button>
                    </div>
                  )}

                  {detail.lines.length === 0
                    ? <div style={{padding:'20px 16px',color:'#aab2bd',fontSize:12,textAlign:'center'}}>No expense records found for this claim.</div>
                    : <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                        <thead>
                          <tr style={{background:'#f8f9fb'}}>
                            <th style={{padding:'8px 12px',textAlign:'left',fontWeight:700,color:'#455a64',fontSize:10,borderBottom:'1px solid #e8ecf0'}}>Date</th>
                            <th style={{padding:'8px 12px',textAlign:'left',fontWeight:700,color:'#455a64',fontSize:10,borderBottom:'1px solid #e8ecf0'}}>Category</th>
                            <th style={{padding:'8px 12px',textAlign:'left',fontWeight:700,color:'#455a64',fontSize:10,borderBottom:'1px solid #e8ecf0'}}>Vendor</th>
                            <th style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:'#455a64',fontSize:10,borderBottom:'1px solid #e8ecf0'}}>Amount</th>
                            <th style={{padding:'8px 12px',textAlign:'right',fontWeight:700,color:'#455a64',fontSize:10,borderBottom:'1px solid #e8ecf0'}}>VAT</th>
                            <th style={{padding:'8px 12px',textAlign:'left',fontWeight:700,color:'#455a64',fontSize:10,borderBottom:'1px solid #e8ecf0'}}>Status</th>
                            {zeroMode && <th style={{padding:'8px 12px',textAlign:'center',fontWeight:700,color:'#455a64',fontSize:10,borderBottom:'1px solid #e8ecf0'}}>Action</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {detail.lines.map((l,i)=>(
                            <tr key={l.id} style={{background:l.status==='VOID'?'#fce4ec':i%2===0?'#fff':'#fafbfc',opacity:l.status==='VOID'?0.7:1}}>
                              <td style={{padding:'7px 12px',borderBottom:'1px solid #f0f4f8'}}>{fmtDate(l.expense_date)}</td>
                              <td style={{padding:'7px 12px',borderBottom:'1px solid #f0f4f8'}}>{l.category||l.expense_type||'—'}</td>
                              <td style={{padding:'7px 12px',borderBottom:'1px solid #f0f4f8'}}>{l.vendor_name||'—'}</td>
                              <td style={{padding:'7px 12px',borderBottom:'1px solid #f0f4f8',textAlign:'right',fontWeight:600,textDecoration:l.status==='VOID'?'line-through':'none'}}>
                                {fmtSAR(l.amount)}
                                {l.original_amount && l.status==='VOID' && <div style={{fontSize:9,color:'#e53935'}}>was {fmtSAR(l.original_amount)}</div>}
                              </td>
                              <td style={{padding:'7px 12px',borderBottom:'1px solid #f0f4f8',textAlign:'right'}}>{fmtSAR(l.vat_amount)}</td>
                              <td style={{padding:'7px 12px',borderBottom:'1px solid #f0f4f8'}}>
                                {l.status==='VOID'
                                  ? <span style={{fontSize:10,color:'#c62828',fontWeight:700}}>VOID{l.adjustment_note?' — '+l.adjustment_note:''}</span>
                                  : l.late_days>30
                                    ? <span style={{fontSize:10,color:'#e65100'}}>⏰ {l.late_days}d late</span>
                                    : <span style={{fontSize:10,color:'#2e7d32'}}>✓ OK</span>
                                }
                              </td>
                              {zeroMode && (
                                <td style={{padding:'7px 12px',borderBottom:'1px solid #f0f4f8',textAlign:'center'}}>
                                  {l.status!=='VOID' && (
                                    <button style={{...S.btn('#fce4ec','#c62828','1px solid #ef9a9a'),fontSize:10,padding:'3px 10px'}}
                                      onClick={()=>zeroRecord(l.id)} disabled={zeroingId===l.id||!zeroNote.trim()}>
                                      {zeroingId===l.id?'…':'✕ Zero'}
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                          {/* ── Food Allowance — single summary row inside the expense table ── */}
                          {detail.food && detail.food.length > 0 && (()=>{
                            const foodTotal = detail.food.reduce((s,f)=>s+(parseFloat(f.total_amount)||0),0)
                            const totalDays = detail.food.reduce((s,f)=>s+(parseFloat(f.no_days)||0),0)
                            return (
                              <tr style={{background:'#e8f5e9',borderTop:'2px solid #a5d6a7'}}>
                                <td style={{padding:'9px 12px',fontWeight:800,color:'#0F6E56',whiteSpace:'nowrap'}}>🍽 FA</td>
                                <td style={{padding:'9px 12px',fontWeight:700,color:'#0F6E56'}}>Food Allowance</td>
                                <td style={{padding:'9px 12px',fontSize:10,color:'#2e7d32'}}>
                                  {detail.food.length} record{detail.food.length!==1?'s':''} · {totalDays} day{totalDays!==1?'s':''}
                                </td>
                                <td style={{padding:'9px 12px',textAlign:'right',fontWeight:800,color:'#0F6E56',fontSize:13}}>
                                  {fmtSAR(foodTotal)}
                                </td>
                                <td style={{padding:'9px 12px',textAlign:'right',color:'#aaa',fontSize:10}}>—</td>
                                <td style={{padding:'9px 12px'}}>
                                  <span style={{fontSize:10,color:'#0F6E56',fontWeight:700}}>✓ Included</span>
                                </td>
                                {zeroMode && <td></td>}
                              </tr>
                            )
                          })()}
                        </tbody>
                      </table>
                  }

                  {/* Correction submit (Admin, REJECTED) */}
                  {isAdmin && selected.status==='REJECTED' && (
                    <div style={{padding:'12px 16px',borderTop:'1px solid #e8ecf0'}}>
                      {!correctionMode
                        ? <button style={{...S.btn('#e3f2fd','#1565c0','1px solid #90caf9'),fontSize:11}} onClick={()=>setCorrectionMode(true)}>📤 Submit correction to DH</button>
                        : <div>
                            <label style={{...S.lbl,color:'#1565c0'}}>Correction note (visible to DH)</label>
                            <textarea style={S.inp} rows={3} placeholder="Describe what was corrected and why…" value={correctionNote} onChange={e=>setCorrectionNote(e.target.value)} />
                            <div style={{display:'flex',gap:8,marginTop:8}}>
                              <button style={S.btn('#1565c0','#fff')} onClick={submitCorrection} disabled={actionBusy||!correctionNote.trim()}>
                                {actionBusy?'Submitting…':'Submit — Start 3-Day Window'}
                              </button>
                              <button style={S.btn('#f5f5f5','#333')} onClick={()=>setCorrectionMode(false)}>Cancel</button>
                            </div>
                          </div>
                      }
                    </div>
                  )}
                </div>
              )}

              {/* Food Allowance is now shown as a summary row inside the Expense Records table above */}

              {/* ── L3 Card: Overtime Records ── */}
              {detail && detail.ot.length > 0 && (
                <div style={{background:'#fff',borderRadius:10,boxShadow:'0 1px 6px rgba(0,0,0,0.07)',overflow:'hidden'}}>
                  <div style={{background:'#4527a0',padding:'10px 16px'}}>
                    <span style={{color:'#fff',fontWeight:800,fontSize:11,letterSpacing:1,textTransform:'uppercase'}}>Overtime Records ({detail.ot.length})</span>
                  </div>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                    <thead>
                      <tr style={{background:'#f3f0fa'}}>
                        {['Date','Job Type','Description','Hours'].map(h=>(
                          <th key={h} style={{padding:'8px 12px',textAlign:h==='Hours'?'right':'left',fontWeight:700,color:'#4527a0',fontSize:10,borderBottom:'1px solid #e8e0f5'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.ot.map((o,i)=>(
                        <tr key={o.id} style={{background:i%2===0?'#fff':'#f9f7fd'}}>
                          <td style={{padding:'7px 12px',borderBottom:'1px solid #f0f4f8'}}>{fmtDate(o.overtime_date)}</td>
                          <td style={{padding:'7px 12px',borderBottom:'1px solid #f0f4f8'}}>{o.job_type||'—'}</td>
                          <td style={{padding:'7px 12px',borderBottom:'1px solid #f0f4f8'}}>{o.work_description||'—'}</td>
                          <td style={{padding:'7px 12px',borderBottom:'1px solid #f0f4f8',textAlign:'right',fontWeight:600}}>{o.total_hours}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Action feedback ── */}
              {actionMsg && (
                <div style={{background:actionMsg.startsWith('❌')?'#fce4ec':'#e8f5e9',border:`1px solid ${actionMsg.startsWith('❌')?'#ef9a9a':'#a5d6a7'}`,borderRadius:8,padding:'12px 16px',fontSize:12,fontWeight:600,color:actionMsg.startsWith('❌')?'#c62828':'#2e7d32'}}>
                  {actionMsg}
                </div>
              )}

              {/* ── Reject reason input ── */}
              {rejectMode && (
                <div style={{background:'#fff8f8',border:'1px solid #ffcdd2',borderRadius:10,padding:'16px'}}>
                  <label style={{...S.lbl,color:'#c62828',marginBottom:8}}>Rejection reason (required)</label>
                  <textarea style={S.inp} rows={3} placeholder="Explain why this claim is being rejected…" value={rejectReason} onChange={e=>setRejectReason(e.target.value)} />
                  <div style={{display:'flex',gap:8,marginTop:10}}>
                    <button style={S.btn('#c62828','#fff')} onClick={rejectMode==='DH'?dhRejectClaim:accountsReject} disabled={actionBusy||!rejectReason.trim()}>
                      {actionBusy?'Rejecting…':'Confirm Rejection'}
                    </button>
                    <button style={S.btn('#f5f5f5','#333')} onClick={()=>{setRejectMode(null);setRejectReason('')}}>Cancel</button>
                  </div>
                </div>
              )}
            </div>

            {/* ── L4: Action strip (sticky footer) ── */}
            <div style={{background:'#fff',borderTop:`3px solid ${MC}`,padding:'14px 24px',flexShrink:0,display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>

              {/* DH: Acknowledge Receipt (Step 1) — available anytime once submitted */}
              {isDH && selected.status==='SUBMITTED' && !selected.dh_acknowledged_at && !rejectMode && (
                <button
                  style={{...S.btn('#f0f4f8','#1a3a6b','1px solid #b0bec5'),fontWeight:700}}
                  onClick={dhAcknowledgeClaim}
                  disabled={actionBusy}
                  title="Confirm physical documents have arrived at your desk"
                >
                  📨 Acknowledge Receipt
                </button>
              )}
              {isDH && selected.status==='SUBMITTED' && selected.dh_acknowledged_at && !rejectMode && (
                <span style={{fontSize:11,color:'#0F6E56',fontWeight:600,background:'#e8f5e9',padding:'4px 10px',borderRadius:6}}>
                  📨 Docs received {fmtDate(selected.dh_acknowledged_at)}
                </span>
              )}

              {/* DH: Approve / Reject (Step 2) — after cutoff */}
              {isDH && selected.status==='SUBMITTED' && cutoffPassed && !rejectMode && (
                <>
                  <button style={{...S.btn('#1D9E75','#fff'),fontWeight:800}} onClick={dhApproveClaim} disabled={actionBusy}>✓ Approve</button>
                  <button style={S.btn('#fce4ec','#c62828','1px solid #ef9a9a')} onClick={()=>setRejectMode('DH')}>✕ Reject</button>
                </>
              )}
              {isDH && selected.status==='SUBMITTED' && !cutoffPassed && (
                <span style={{fontSize:12,color:'#6b7c93'}}>📅 Approve/Reject available after 26th of this month</span>
              )}

              {/* Admin acting as DH */}
              {isAdmin && selected.status==='SUBMITTED' && !rejectMode && (
                <>
                  {!selected.dh_acknowledged_at && (
                    <button style={{...S.btn('#f0f4f8','#1a3a6b','1px solid #b0bec5'),fontWeight:700,fontSize:11}} onClick={dhAcknowledgeClaim} disabled={actionBusy}>
                      📨 Acknowledge Docs
                    </button>
                  )}
                  <button style={{...S.btn('#1D9E75','#fff'),fontWeight:800}} onClick={dhApproveClaim} disabled={actionBusy}>✓ DH Approve</button>
                  <button style={S.btn('#fce4ec','#c62828','1px solid #ef9a9a')} onClick={()=>setRejectMode('DH')}>✕ DH Reject</button>
                </>
              )}

              {/* Admin (Accounts): DH_APPROVED */}
              {isAdmin && selected.status==='DH_APPROVED' && selected.dh_correction_status!=='PENDING' && !rejectMode && (
                <>
                  <button style={{...S.btn('#1565c0','#fff'),fontWeight:800}} onClick={accountsApprove} disabled={actionBusy}>✓ Accounts Approve</button>
                  <button style={S.btn('#fce4ec','#c62828','1px solid #ef9a9a')} onClick={()=>setRejectMode('ACCOUNTS')}>✕ Accounts Reject</button>
                </>
              )}

              {/* Pending correction — blocked */}
              {isAdmin && selected.status==='DH_APPROVED' && selected.dh_correction_status==='PENDING' && (
                <span style={{fontSize:12,color:'#e65100',fontWeight:600}}>⏳ Waiting for DH acknowledgment ({timeRemaining(selected.dh_escalation_deadline)?.label||'…'})</span>
              )}

              {/* Print — always right side */}
              {detail?.food?.length > 0 && (
                <button
                  style={{...S.btn('#e8f5e9','#0F6E56','1px solid #a5d6a7'),marginLeft:'auto'}}
                  onClick={()=>printFoodAllowance(selected, detail)}
                  title="Print Food Allowance breakdown separately — saved to food-allowance-claims folder"
                >
                  🍽 Print Food Allowance
                </button>
              )}
              <button
                style={{...S.btn('#f0f4f8','#455a64','1px solid #cfd8dc'), marginLeft: detail?.food?.length > 0 ? 0 : 'auto'}}
                onClick={()=>printClaim(selected, detail)}
                disabled={!detail}
              >
                🖨 Print Claim
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ══ Generate Claims modal ══════════════════════════════ */}
      {genOpen && (
        <div style={S.overlay} onClick={()=>{setGenOpen(false);setGenResult(null)}}>
          <div style={{...S.modal,maxWidth:620}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:800,fontSize:16,color:'#1a3a6b',marginBottom:4}}>⚡ Generate Claims — {periodLabel(filterPeriod)}</div>
            <div style={{fontSize:12,color:'#6b7c93',marginBottom:16}}>One claim per employee per project — uses rolling period (26th–25th)</div>

            {genPreview.length === 0 && !genResult && (
              <div style={{textAlign:'center',padding:24,color:'#aab2bd'}}>
                {genBusy ? 'Loading preview…' : '⚠️ No expense or food allowance records found for this period. Nothing to generate.'}
              </div>
            )}

            {genPreview.length > 0 && genPreview.every(r=>r.has_claim) && !genResult && (
              <div style={{textAlign:'center',padding:24}}>
                <div style={{fontSize:32,marginBottom:8}}>✅</div>
                <div style={{fontWeight:700,fontSize:14,color:'#2e7d32',marginBottom:4}}>
                  All {genPreview.length} employee(s) already have claims for {periodLabel(filterPeriod)}.
                </div>
                <div style={{fontSize:12,color:'#555',marginBottom:16}}>
                  Nothing new to generate. To reset and re-generate, run the debug reset SQL.
                </div>
                <button style={S.btn('#f5f5f5','#333')} onClick={()=>setGenOpen(false)}>Close</button>
              </div>
            )}

            {genPreview.length > 0 && !genPreview.every(r=>r.has_claim) && !genResult && (
              <>
                <div style={{fontSize:12,fontWeight:700,color:'#1a3a6b',marginBottom:8}}>
                  {genPreview.filter(r=>!r.has_claim).length} claim(s) will be generated:
                </div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,marginBottom:16}}>
                  <thead>
                    <tr>{['Employee','Dept','Project','Records','Total (SAR)','Status'].map(h=>(
                      <th key={h} style={{padding:'7px 8px',background:'#1a3a6b',color:'#fff',fontWeight:700,textAlign:'left',fontSize:11}}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {genPreview.map((r,i)=>(
                      <tr key={`${r.employee_id}-${r.project_id||'none'}`} style={{background:r.has_claim?'#f5f5f5':i%2===0?'#fff':'#fafbfc'}}>
                        <td style={S.linesTd}>{r.full_name_en}</td>
                        <td style={S.linesTd}><span style={{fontSize:11,fontWeight:700,color:'#1a3a6b'}}>{r.department}</span></td>
                        <td style={S.linesTd}>
                          {r.project_no && r.project_no !== '—'
                            ? <span style={{fontSize:10,fontWeight:700,color:'#0F6E56',background:'#e8f5e9',padding:'2px 6px',borderRadius:4}}>{r.project_no}</span>
                            : <span style={{color:'#aab2bd',fontSize:11}}>—</span>
                          }
                        </td>
                        <td style={{...S.linesTd,textAlign:'center'}}>{r.record_count}</td>
                        <td style={{...S.linesTd,textAlign:'right',fontWeight:600}}>{fmtSAR(r.total_amount)}</td>
                        <td style={S.linesTd}>
                          {r.has_claim
                            ? <span style={{fontSize:10,background:'#e8f5e9',color:'#2e7d32',padding:'2px 8px',borderRadius:20,fontWeight:700}}>Already claimed</span>
                            : <span style={{fontSize:10,background:'#fff8e1',color:'#f57f17',padding:'2px 8px',borderRadius:20,fontWeight:700}}>Will generate</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
                  <button style={S.btn('#f5f5f5','#333')} onClick={()=>setGenOpen(false)}>Cancel</button>
                  <button
                    style={S.btn('#1a3a6b','#fff')}
                    onClick={runGenerate}
                    disabled={genBusy||genPreview.filter(r=>!r.has_claim).length===0}
                  >
                    {genBusy?'Generating…':`⚡ Generate ${genPreview.filter(r=>!r.has_claim).length} Claims`}
                  </button>
                </div>
              </>
            )}

            {genResult && (
              <div>
                {genResult.error
                  ? <div style={S.alert('#c62828','#fce4ec')}>❌ {genResult.error}</div>
                  : <div style={S.alert('#2e7d32','#e8f5e9')}>
                      ✅ Generated <strong>{genResult.generated}</strong> claim(s). Skipped <strong>{genResult.skipped}</strong> (already claimed).
                      {genResult.from_date && <div style={{marginTop:4,fontSize:11,color:'#2e7d32'}}>Period: {genResult.from_date} → {genResult.to_date}</div>}
                    </div>
                }
                <button style={{...S.btn('#1a3a6b','#fff'),marginTop:12}} onClick={()=>{setGenOpen(false);setGenResult(null)}}>Close</button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
