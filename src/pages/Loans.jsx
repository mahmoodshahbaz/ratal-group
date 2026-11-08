import { GROUP_COLORS, CHAPTER_PALETTES } from '../styles/appStyles'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import FormShell from '../components/FormShell'
import PageBanner from '../components/PageBanner'

const L3 = GROUP_COLORS.HR          // #795338 — HR chapter accent
const L1 = CHAPTER_PALETTES.HR.L1  // #BCA99A
const L2 = CHAPTER_PALETTES.HR.L2  // #F7F2ED

const SAR = v => `SAR ${(+v||0).toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const fmt = d => d ? new Date(d).toLocaleDateString('en-GB') : '—'
const MONTHS = Array.from({length:24},(_,i)=>i+1)

// ── Penalty categories — each carries a default ownership ─────────────────
const PEN_CATS = [
  { value:'SPEEDING',    label:'Speeding Fine',        owner:'DRIVER',  bg:'#ffebee', color:'#c62828' },
  { value:'PARKING',     label:'Parking Violation',    owner:'DRIVER',  bg:'#ffebee', color:'#c62828' },
  { value:'SIGNAL',      label:'Signal / Red Light',   owner:'DRIVER',  bg:'#ffebee', color:'#c62828' },
  { value:'MISCONDUCT',  label:'Misconduct / HR',      owner:'DRIVER',  bg:'#ffebee', color:'#c62828' },
  { value:'ISTEMARA',    label:'Istemara Fine',        owner:'COMPANY', bg:'#fff3e0', color:'#e65100' },
  { value:'INSURANCE',   label:'Insurance Lapse',      owner:'COMPANY', bg:'#fff3e0', color:'#e65100' },
  { value:'PLATE',       label:'Plate Issue',          owner:'COMPANY', bg:'#fff3e0', color:'#e65100' },
  { value:'OTHER',       label:'Other',                owner:null,      bg:'#f5f7fa', color:'#546e7a' },
]
const catMeta  = v => PEN_CATS.find(c=>c.value===v) || PEN_CATS[PEN_CATS.length-1]
const empLabel = e => `${e.full_name||e.full_name_en||'—'}${e.employee_number?' · '+e.employee_number:''}`
const deptLabel = d => d.dept_code || d.dept_name || '—'
const TODAY = new Date()

const MC = GROUP_COLORS.HR

const S = {
  card:  { background:'#fff', borderRadius:4, padding:'20px 22px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:18 },
  inp:   { width:'100%', padding:'8px 10px', borderRadius:4, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'Poppins, sans-serif' },
  btn:   (c=L3) => ({ background:c, color:'#fff', border:'none', borderRadius:4, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Poppins, sans-serif' }),
  label: { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4, fontFamily:'Poppins, sans-serif' },
  row:   { display:'flex', gap:12, marginBottom:14 },
  col:   { flex:1 },
  tbl:   { width:'100%', borderCollapse:'collapse', fontSize:12 },
  th:    { background:L3, color:'#fff', padding:'9px 10px', fontWeight:700, textAlign:'left', fontSize:11 },
  td:    { padding:'8px 10px', borderBottom:'1px solid #f0f4f8', color:'#1a2e3d', verticalAlign:'middle' },
}

const EMPTY = { employee_id:'', dept_id:'', loan_amount:'', tenure_months:'12', start_month:'', notes:'' }
const EMPTY_PEN = { plate_number:'', employee_id:'', dept_id:'', vehicle_plate:'', penalty_type:'EMPLOYEE_BORNE', penalty_category:'', violation_ref:'', violation_date:'', offence:'', amount:'', deduction_month:'', notes:'' }

export default function Loans({ entityId }) {
  const [loans,     setLoans]     = useState([])
  const [penalties, setPenalties] = useState([])
  const [employees, setEmps]      = useState([])
  const [depts,     setDepts]     = useState([])
  const [vehMap,    setVehMap]    = useState({}) // employee_id → plate_number
  const [vehicles,  setVehicles]  = useState([]) // fleet plate list
  const [plateMap,  setPlateMap]  = useState({}) // plate_number → { emp, assigned_date }
  const [eosEmps,    setEosEmps]    = useState([]) // active LOCAL+EXPAT for EOS table
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState('loans')
  // EOS form state
  const [showEosBanner, setShowEosBanner] = useState(false)
  const [showEosForm,   setShowEosForm]   = useState(false)
  const [eosStep,       setEosStep]       = useState(1)
  const [eosForm,       setEosForm]       = useState({
    employee_id:'', dept_id:'',
    leave_reason:'TERMINATION', leave_date:TODAY.toISOString().slice(0,10), notes:'',
    // Step 3 — asset clearance
    assets:[
      { id:'laptop',      name:'Laptop',                    asset_no:'', status:'PENDING', value:'0', note:'' },
      { id:'mobile',      name:'Mobile Phone',              asset_no:'', status:'PENDING', value:'0', note:'' },
      { id:'access_card', name:'Access Card / Building Key',asset_no:'', status:'RETURNED',value:'0', note:'' },
      { id:'id_card',     name:'Employee ID Card',          asset_no:'', status:'RETURNED',value:'0', note:'' },
      { id:'vehicle',     name:'Company Vehicle',           asset_no:'', status:'NA',      value:'0', note:'' },
    ],
    handover_to:'', handover_date:TODAY.toISOString().slice(0,10), handover_by:'', handover_notes:'',
    // Step 4 — separation type
    departure_type:'COMPANY_TRANSFER',
    transfer_employer:'', transfer_ref:'', transfer_date:'',
    exit_date:'', flight_ref:'',
    leave_balance_days:'0',
    // Step 5 — deductions
    ticket_deduction:'0', uniform_deduction:'0',
    other_deduction_desc:'', other_deduction_amt:'0',
  })
  const [showForm,      setShowForm]      = useState(false)
  const [showLoanBanner,setShowLoanBanner]= useState(false)
  const [loanStep,      setLoanStep]      = useState(1)
  const [showPF,        setShowPF]        = useState(false)
  const [showPenBanner, setShowPenBanner] = useState(false)
  const [penStep,       setPenStep]       = useState(1)
  const [form,      setForm]      = useState(EMPTY)
  const [pForm,     setPForm]     = useState(EMPTY_PEN)
  const [saving,    setSaving]    = useState(false)
  const [search,    setSearch]    = useState('')
  const [fDept,     setFDept]     = useState('')   // dept filter (all tabs)
  const [fStatus,   setFStatus]   = useState('')   // status filter (loans / penalties)
  const [fPenType,  setFPenType]  = useState('')   // penalty type filter

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const [resL, resP, resE, resD, resVA, resV, resAllE] = await Promise.all([
      supabase.from('employee_loans').select('*').eq('entity_id',entityId).order('created_at',{ascending:false}).limit(200),
      supabase.from('employee_penalties').select('*').eq('entity_id',entityId).order('penalty_date',{ascending:false}).limit(200),
      supabase.from('employees').select('id,full_name,full_name_en,employee_number,department_id,basic_salary,loan_eligible').eq('entity_id',entityId).eq('loan_eligible',true).order('full_name').limit(500),
      supabase.from('departments').select('id,dept_name,dept_code').eq('entity_id',entityId).order('dept_name'),
      // Load all assignments using select('*') — mirrors Vehicles.jsx exactly
      supabase.from('vehicle_assignments').select('*').eq('entity_id',entityId).order('assignment_date',{ascending:false}),
      supabase.from('vehicles').select('id,plate_number,make,model,year').eq('entity_id',entityId).order('plate_number'),
      // All employees (not just loan-eligible) for penalty driver-card lookup — select('*') avoids column-name 400 errors
      supabase.from('employees').select('*').eq('entity_id',entityId).order('full_name').limit(500),
    ])
    setLoans(resL.data||[]); setPenalties(resP.data||[]); setEmps(resE.data||[]); setDepts(resD.data||[])
    setVehicles(resV.data||[])
    // Build an id→employee map from all employees (for driver card + EOS table)
    const empLookup = {}; (resAllE.data||[]).forEach(e=>{ empLookup[e.id]=e })
    // EOS table: active LOCAL/EXPAT employees only
    // Exclude: inactive (is_active=false), OUTSOURCED, CONTRACT (not under company sponsorship)
    // DB stores mixed formats: employee_category uses codes ('01'-'04') OR full strings ('ACCSYS-LOCAL', etc.)
    // Legacy rows may use employee_type field ('OUTSOURCED','CONTRACT') with employee_category null/'01'
    const EXCLUDE_CATS  = ['03','04','OUTSOURCED','CONTRACT']
    const EXCLUDE_TYPES = ['OUTSOURCED','CONTRACT','OUTSOURCE']
    const eosEligible = (resAllE.data||[]).filter(e =>
      e.is_active === true &&
      !EXCLUDE_CATS.includes(e.employee_category) &&
      !EXCLUDE_TYPES.includes((e.employee_type||'').toUpperCase())
    )
    setEosEmps(eosEligible)
    // Filter to active assignments only (client-side, same as Vehicles.jsx)
    const activeVA = (resVA.data||[]).filter(a => !a.return_date)
    // employee_id → plate_number map (for Loans form)
    const vm = {}; activeVA.forEach(a=>{ if(a.employee_id && !vm[a.employee_id]) vm[a.employee_id]=a.plate_number })
    setVehMap(vm)
    // plate_number → { emp, assignment_date, employee_id } — client-side lookup
    const pm = {}; activeVA.forEach(a=>{
      if(a.plate_number && !pm[a.plate_number]) pm[a.plate_number]={ emp: empLookup[a.employee_id]||null, assignment_date: a.assignment_date, employee_id: a.employee_id }
    })
    setPlateMap(pm)
    setLoading(false)
  }

  const emi = () => {
    const a = +form.loan_amount||0, t = +form.tenure_months||1
    return a > 0 ? (a/t).toFixed(2) : '0.00'
  }

  function startMonth() {
    if (form.start_month) return form.start_month
    return `${TODAY.getFullYear()}-${String(TODAY.getMonth()+1).padStart(2,'0')}`
  }

  async function saveLoan() {
    if (!form.employee_id)  { alert('Select employee'); return }
    if (!form.loan_amount || +form.loan_amount<=0) { alert('Enter loan amount'); return }
    const emp = employees.find(e=>e.id===form.employee_id)
    const monthly = +(+form.loan_amount / +form.tenure_months).toFixed(2)
    setSaving(true)
    const { error } = await supabase.from('employee_loans').insert({
      ...form,
      entity_id: entityId,
      employee_name: emp?.full_name||'',
      loan_amount: +form.loan_amount,
      tenure_months: +form.tenure_months,
      monthly_emi: monthly,
      outstanding: +form.loan_amount,
      start_month: startMonth(),
      status: 'ACTIVE',
    })
    setSaving(false)
    if (error) { alert(error.message); return }
    setShowForm(false); setLoanStep(1); setForm(EMPTY); load()
  }

  async function savePenalty() {
    if (!pForm.employee_id) { alert('Select employee'); return }
    if (!pForm.amount || +pForm.amount<=0) { alert('Enter amount'); return }
    if (pForm.violation_ref && penalties.some(p => p.violation_ref && p.violation_ref.trim().toLowerCase() === pForm.violation_ref.trim().toLowerCase())) {
      alert(`Violation Ref# "${pForm.violation_ref}" already exists. Each Violation ID must be unique. Please use a different reference number or edit the existing record.`)
      return
    }
    const emp = employees.find(e=>e.id===pForm.employee_id)
    setSaving(true)
    const dept = depts.find(d=>d.id===pForm.dept_id)
    const { error } = await supabase.from('employee_penalties').insert({
      entity_id:        entityId,
      employee_id:      pForm.employee_id,
      employee_name:    emp?.full_name||'',
      dept_id:          pForm.dept_id||null,
      department_name:  dept ? (dept.dept_code||dept.dept_name) : null,
      penalty_type:     pForm.penalty_type,
      penalty_category: pForm.penalty_category||null,
      vehicle_plate:    pForm.vehicle_plate||vehMap[pForm.employee_id]||null,
      violation_ref:    pForm.violation_ref||null,
      violation_date:   pForm.violation_date||null,
      offence:          pForm.offence||null,
      amount:           +pForm.amount,
      deduction_month:  pForm.deduction_month||null,
      notes:            pForm.notes||null,
      penalty_date:     TODAY.toISOString().slice(0,10),
      status:           'PENDING',
    })
    setSaving(false)
    if (error) { alert(error.message); return }
    setShowPF(false); setPenStep(1); setPForm(EMPTY_PEN); load()
  }

  async function closeLoan(id) {
    await supabase.from('employee_loans').update({ status:'COMPLETED', paid_amount: loans.find(l=>l.id===id)?.loan_amount||0, outstanding:0 }).eq('id',id)
    setLoans(p=>p.map(l=>l.id===id?{...l,status:'COMPLETED',outstanding:0}:l))
  }

  function f(k,v) { setForm(p=>({...p,[k]:v})) }
  function pf(k,v) { setPForm(p=>({...p,[k]:v})) }
  function ef(k,v) { setEosForm(p=>({...p,[k]:v})) }

  // ── Full salary package helper (basic + all allowances) ─────────────────
  function empPkg(e) {
    // Technical allowance excluded — it's a project/task bonus, not part of fixed salary
    return (e.basic_salary||0)+(e.housing_allowance||0)+(e.transport_allowance||0)
          +(e.mobile_allowance||0)+(e.medical_allowance||0)+(e.other_allowance||0)
  }

  // ── EOS Calculation Engine (ACCSYS Saudi Labour Law rules) ───────────────
  // Uses full salary package (basic + allowances) as the wage base per company policy
  function calcEOS(basicSalary, joinDateStr, asOfDateStr, leaveReason = 'TERMINATION') {
    if (!joinDateStr || !basicSalary || +basicSalary <= 0) return { amount:0, years:0, months:0, note:'', breakdown:[] }
    const join   = new Date(joinDateStr)
    const asOf   = asOfDateStr ? new Date(asOfDateStr) : new Date()
    const diffMs = asOf - join
    if (diffMs <= 0) return { amount:0, years:0, months:0, note:'Invalid dates', breakdown:[] }
    const years  = diffMs / (365.25 * 86400000)
    const months = diffMs / (30.4167 * 86400000)
    const basic  = +basicSalary
    if (years < 1) return { amount:0, years, months, note:'Less than 1 year — no EOS entitlement', breakdown:[] }

    let amount = 0
    const bd = []

    if (years >= 20) {
      // 20-25 years: 100% of basic for WHOLE tenure
      amount = basic * years
      bd.push(`Full ${years.toFixed(2)} yrs × 1 month (100%) = ${SAR(amount)}`)
    } else if (years >= 5) {
      // 5-20 years: first 5 yrs at 50%, rest at 100%
      const p1 = basic * 0.5 * 5
      const p2 = basic * 1.0 * (years - 5)
      amount = p1 + p2
      bd.push(`Years 1–5: 5 × 0.5 month = ${SAR(p1)}`)
      bd.push(`Years 5–${years.toFixed(2)}: ${(years-5).toFixed(2)} × 1 month = ${SAR(p2)}`)
      bd.push(`Gross EOS = ${SAR(amount)}`)
    } else {
      // 1-5 years: 50% per year
      amount = basic * 0.5 * years
      bd.push(`${years.toFixed(2)} yrs × 0.5 month = ${SAR(amount)}`)
    }

    // Resignation reduction
    let factor = 1
    if (leaveReason === 'RESIGNATION') {
      if (years < 5) {
        // Resign 1-5 yrs: 33% only
        amount = basic * (1/3) * years
        bd.push(`Resignation reduction (1–5 yrs: 33%) → ${SAR(amount)}`)
        factor = 1/3
      } else if (years < 10) {
        // Resign 5-10 yrs: first 5 at 33%, rest 100%
        const p1 = basic * (1/3) * 5
        const p2 = basic * 1.0 * (years - 5)
        amount = p1 + p2
        bd.push(`Resignation (5–10 yrs): 5 yrs × 0.33 = ${SAR(p1)} + ${(years-5).toFixed(2)} yrs × 1 = ${SAR(p2)} → ${SAR(amount)}`)
      }
      // 10+ years: no resignation reduction
    }
    if (leaveReason === 'ALLEGATIONS') {
      amount = 0
      bd.push('Termination with allegations — subject to management decision')
    }

    return { amount: Math.round(amount * 100) / 100, years, months, note:'', breakdown: bd }
  }

  const filtLoans = loans.filter(l=> {
    const matchSearch = !search || (l.employee_name||'').toLowerCase().includes(search.toLowerCase())
    const matchDept   = !fDept  || l.dept_id === fDept
    const matchStatus = !fStatus || l.status === fStatus
    return matchSearch && matchDept && matchStatus
  })
  const filtPen = penalties.filter(p => {
    const matchSearch = !search  || (p.employee_name||'').toLowerCase().includes(search.toLowerCase())
    const matchDept   = !fDept   || p.dept_id === fDept
    const matchStatus = !fStatus || p.status === fStatus
    const matchType   = !fPenType || p.penalty_type === fPenType
    return matchSearch && matchDept && matchStatus && matchType
  })
  const filtEos = eosEmps.filter(e => {
    const matchSearch = !search || (e.full_name||'').toLowerCase().includes(search.toLowerCase()) || (e.employee_number||'').toLowerCase().includes(search.toLowerCase())
    const matchDept   = !fDept  || e.department_id === fDept
    return matchSearch && matchDept
  })

  const totalLoans      = loans.filter(l=>l.status==='ACTIVE').reduce((s,l)=>s+(+l.outstanding||0),0)
  const totalPenalties  = penalties.filter(p=>p.status==='PENDING').reduce((s,p)=>s+(+p.amount||0),0)

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:12, color:'#6b7c93', marginTop:2 }}>Employee salary advances, EMI schedules, and penalties register</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {tab==='loans'     && <button style={S.btn()} onClick={()=>setShowLoanBanner(true)}>+ New Loan</button>}
          {tab==='penalties' && <button style={S.btn(L3)} onClick={()=>setShowPenBanner(true)}>+ New Penalty</button>}
          {tab==='eos'       && <button style={S.btn(L3)} onClick={()=>setShowEosBanner(true)}>+ Process EOS Settlement</button>}
        </div>
      </div>

      {/* KPIs — tab-specific colorful cards */}
      <div style={{ display:'flex', gap:14, marginBottom:18, overflowX:'auto', flexWrap:'nowrap', paddingBottom:2 }}>
        {tab === 'loans' && [
          { label:'Active Loans',      value: loans.filter(l=>l.status==='ACTIVE').length,                    bg:'linear-gradient(135deg,#1565c0,#1e88e5)', icon:'💳' },
          { label:'Total Outstanding', value: SAR(totalLoans),                                                 bg:'linear-gradient(135deg,#b71c1c,#e53935)', icon:'💰' },
          { label:'Settled Loans',     value: loans.filter(l=>l.status==='COMPLETED').length,                  bg:'linear-gradient(135deg,#2e7d32,#43a047)', icon:'✅' },
          { label:'Total Disbursed',   value: SAR(loans.reduce((s,l)=>s+(+l.loan_amount||0),0)),               bg:'linear-gradient(135deg,#4527a0,#7b1fa2)', icon:'📊' },
        ].map(c=>(
          <div key={c.label} style={{ flex:1, minWidth:155, borderRadius:12, padding:'16px 18px', background:c.bg, boxShadow:'0 4px 16px rgba(0,0,0,0.15)', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ fontSize:28, filter:'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>{c.icon}</div>
            <div><div style={{ fontSize:18, fontWeight:900, color:'#fff', lineHeight:1 }}>{c.value}</div><div style={{ fontSize:11, color:'rgba(255,255,255,0.8)', marginTop:4, fontWeight:600 }}>{c.label}</div></div>
          </div>
        ))}
        {tab === 'penalties' && [
          { label:'Pending Penalties', value: penalties.filter(p=>p.status==='PENDING').length,                bg:'linear-gradient(135deg,#e65100,#f57c00)', icon:'⚠️' },
          { label:'Total Fines',       value: SAR(totalPenalties),                                             bg:'linear-gradient(135deg,#b71c1c,#d32f2f)', icon:'💸' },
          { label:'Driver-Borne',      value: penalties.filter(p=>p.penalty_type==='EMPLOYEE_BORNE').length,   bg:'linear-gradient(135deg,#880e4f,#c2185b)', icon:'👤' },
          { label:'Company-Borne',     value: penalties.filter(p=>p.penalty_type==='COMPANY_BORNE').length,    bg:'linear-gradient(135deg,#4527a0,#512da8)', icon:'🏢' },
        ].map(c=>(
          <div key={c.label} style={{ flex:1, minWidth:155, borderRadius:12, padding:'16px 18px', background:c.bg, boxShadow:'0 4px 16px rgba(0,0,0,0.15)', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ fontSize:28, filter:'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>{c.icon}</div>
            <div><div style={{ fontSize:18, fontWeight:900, color:'#fff', lineHeight:1 }}>{c.value}</div><div style={{ fontSize:11, color:'rgba(255,255,255,0.8)', marginTop:4, fontWeight:600 }}>{c.label}</div></div>
          </div>
        ))}
        {tab === 'eos' && (() => {
          const eosCalcs = eosEmps.map(e => calcEOS(empPkg(e), e.hire_date, null, 'TERMINATION'))
          const totalLiability = eosCalcs.reduce((s,r)=>s+(r.amount||0),0)
          const over5 = eosEmps.filter((_,i)=>eosCalcs[i].years>=5).length
          const avgEos = eosEmps.length ? totalLiability / eosEmps.length : 0
          return [
            { label:'Total EOS Liability',  value: SAR(totalLiability),  bg:'linear-gradient(135deg,#1a237e,#283593)', icon:'🏦' },
            { label:'Eligible Employees',   value: eosEmps.length,       bg:'linear-gradient(135deg,#004d40,#00796b)', icon:'👥' },
            { label:'Average EOS / Person', value: SAR(avgEos),          bg:'linear-gradient(135deg,#bf360c,#e64a19)', icon:'📈' },
            { label:'Employees ≥ 5 Yrs',    value: over5,                bg:'linear-gradient(135deg,#4a148c,#7b1fa2)', icon:'⭐' },
          ].map(c=>(
            <div key={c.label} style={{ flex:1, minWidth:155, borderRadius:12, padding:'16px 18px', background:c.bg, boxShadow:'0 4px 16px rgba(0,0,0,0.15)', display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ fontSize:28, filter:'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}>{c.icon}</div>
              <div><div style={{ fontSize:18, fontWeight:900, color:'#fff', lineHeight:1 }}>{c.value}</div><div style={{ fontSize:11, color:'rgba(255,255,255,0.8)', marginTop:4, fontWeight:600 }}>{c.label}</div></div>
            </div>
          ))
        })()}
      </div>

      {/* Tabs */}
      <div style={{ marginBottom:14 }}>
        {[['loans','Loans Register'],['penalties','Penalties Register'],['eos','EOS Register']].map(([k,l])=>(
          <button key={k} onClick={()=>{ setTab(k); setSearch(''); setFDept(''); setFStatus(''); setFPenType('') }} style={{ padding:'7px 18px', border:'none', borderRadius:4, cursor:'pointer', fontSize:12, fontWeight:700, marginRight:6, background:tab===k?L3:'#f0f4f8', color:tab===k?'#fff':'#6b7c93', fontFamily:'Poppins, sans-serif' }}>{l}</button>
        ))}
      </div>

      {/* Section heading bar */}
      <div style={{ background:L3, borderRadius:'6px 6px 0 0', padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:0 }}>
        <div style={{ color:'#fff', fontWeight:800, fontSize:13, letterSpacing:0.5 }}>
          {tab==='loans'     && '💳  Loans Register'}
          {tab==='penalties' && '⚠️  Penalties Register'}
          {tab==='eos'       && '🏦  EOS — Running Liability (ACCSYS-LOCAL & ACCSYS-EXPAT)'}
        </div>
        <div style={{ color:'rgba(255,255,255,0.7)', fontSize:11 }}>
          {tab==='loans'     && `${filtLoans.length} of ${loans.length} record${loans.length!==1?'s':''}`}
          {tab==='penalties' && `${filtPen.length} of ${penalties.length} record${penalties.length!==1?'s':''}`}
          {tab==='eos'       && `${filtEos.length} of ${eosEmps.length} employee${eosEmps.length!==1?'s':''}`}
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ background:'#fff', padding:'10px 16px', marginBottom:14, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', borderTop:'1px solid #e8ecf2', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        <input style={{ ...S.inp, maxWidth:210, flex:'0 0 210px' }} placeholder="🔍  Search employee…" value={search} onChange={e=>setSearch(e.target.value)} />
        <select style={{ ...S.inp, width:160, flex:'0 0 160px' }} value={fDept} onChange={e=>setFDept(e.target.value)}>
          <option value="">All Departments</option>
          {depts.map(d=><option key={d.id} value={d.id}>{deptLabel(d)}</option>)}
        </select>
        {tab==='loans' && (
          <select style={{ ...S.inp, width:140, flex:'0 0 140px' }} value={fStatus} onChange={e=>setFStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
          </select>
        )}
        {tab==='penalties' && (<>
          <select style={{ ...S.inp, width:160, flex:'0 0 160px' }} value={fStatus} onChange={e=>setFStatus(e.target.value)}>
            <option value="">All Status</option>
            <option value="PENDING">Pending</option>
            <option value="SETTLED">Settled</option>
          </select>
          <select style={{ ...S.inp, width:170, flex:'0 0 170px' }} value={fPenType} onChange={e=>setFPenType(e.target.value)}>
            <option value="">All Types</option>
            <option value="EMPLOYEE_BORNE">👤 Driver / Employee</option>
            <option value="COMPANY_BORNE">🏢 Company</option>
          </select>
        </>)}
        {(search||fDept||fStatus||fPenType) && (
          <button style={{ ...S.btn('#90a4ae'), padding:'7px 14px', fontSize:11 }} onClick={()=>{ setSearch(''); setFDept(''); setFStatus(''); setFPenType('') }}>✕ Clear</button>
        )}
      </div>

      {/* LOANS TABLE */}
      {tab==='loans' && (
        <div style={S.card}>
          {loading ? <div style={{ textAlign:'center', padding:40, color:'#6b7c93' }}>Loading…</div> : (
            <table style={S.tbl}>
              <thead><tr>
                <th style={{ ...S.th, background:L3 }}>Employee</th>
                <th style={{ ...S.th, background:L3, textAlign:'right' }}>Loan</th>
                <th style={{ ...S.th, background:L3 }}>Months</th>
                <th style={{ ...S.th, background:L3, textAlign:'right' }}>EMI / Month</th>
                <th style={{ ...S.th, background:L3 }}>Start</th>
                <th style={{ ...S.th, background:L3, textAlign:'right' }}>Paid</th>
                <th style={{ ...S.th, background:L3, textAlign:'right' }}>Outstanding</th>
                <th style={{ ...S.th, background:L3 }}>Status</th>
                <th style={S.th}>Action</th>
              </tr></thead>
              <tbody>
                {filtLoans.length===0 && <tr><td colSpan={9} style={{ ...S.td, textAlign:'center', color:'#aab2bd', padding:30 }}>No loans yet</td></tr>}
                {filtLoans.map((l,i)=>(
                  <tr key={l.id} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
                    <td style={{ ...S.td, fontWeight:600 }}>{l.employee_name}</td>
                    <td style={{ ...S.td, textAlign:'right' }}>{SAR(l.loan_amount)}</td>
                    <td style={{ ...S.td, textAlign:'center' }}>{l.tenure_months}</td>
                    <td style={{ ...S.td, textAlign:'right', fontWeight:700, color:'#2e7d32' }}>{SAR(l.monthly_emi)}</td>
                    <td style={S.td}>{l.start_month||'—'}</td>
                    <td style={{ ...S.td, textAlign:'right' }}>{SAR(l.paid_amount)}</td>
                    <td style={{ ...S.td, textAlign:'right', fontWeight:800, color:+l.outstanding>0?'#c62828':'#2e7d32' }}>{SAR(l.outstanding)}</td>
                    <td style={S.td}>
                      <span style={{ padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700,
                        background: l.status==='ACTIVE'?'#e8f5e9':'#f5f7fa',
                        color: l.status==='ACTIVE'?'#2e7d32':'#aab2bd' }}>{l.status}</span>
                    </td>
                    <td style={S.td}>
                      {l.status==='ACTIVE' && <button onClick={()=>closeLoan(l.id)} style={{ ...S.btn('#546e7a'), padding:'4px 10px', fontSize:10 }}>Mark Settled</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* PENALTIES TABLE */}
      {tab==='penalties' && (
        <div style={S.card}>
          {loading ? <div style={{ textAlign:'center', padding:40, color:'#6b7c93' }}>Loading…</div> : (
            <table style={S.tbl}>
              <thead><tr>
                <th style={{ ...S.th, background:L3 }}>Employee</th>
                <th style={{ ...S.th, background:L3 }}>Dept</th>
                <th style={{ ...S.th, background:L3 }}>Date</th>
                <th style={{ ...S.th, background:L3 }}>Category</th>
                <th style={{ ...S.th, background:L3 }}>Paid By</th>
                <th style={{ ...S.th, background:L3 }}>Ref #</th>
                <th style={{ ...S.th, background:L3, textAlign:'right' }}>Amount</th>
                <th style={{ ...S.th, background:L3 }}>Deduct Month</th>
                <th style={{ ...S.th, background:L3 }}>Status</th>
              </tr></thead>
              <tbody>
                {filtPen.length===0 && <tr><td colSpan={9} style={{ ...S.td, textAlign:'center', color:'#aab2bd', padding:30 }}>No penalties yet</td></tr>}
                {filtPen.map((p,i)=>{
                  const meta = catMeta(p.penalty_category)
                  return (
                  <tr key={p.id} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
                    <td style={{ ...S.td, fontWeight:600 }}>{p.employee_name}</td>
                    <td style={{ ...S.td, fontSize:11, fontWeight:700, color:'#795338' }}>{p.department_name||'—'}</td>
                    <td style={S.td}>{fmt(p.violation_date||p.penalty_date)}</td>
                    <td style={S.td}>
                      {p.penalty_category
                        ? <span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:700, background:meta.bg, color:meta.color }}>{meta.label}</span>
                        : <span style={{ color:'#aab2bd' }}>{p.offence||'—'}</span>}
                    </td>
                    <td style={S.td}>
                      <span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:700, background:p.penalty_type==='EMPLOYEE_BORNE'?'#ffebee':'#fff3e0', color:p.penalty_type==='EMPLOYEE_BORNE'?'#c62828':'#e65100' }}>
                        {p.penalty_type==='EMPLOYEE_BORNE'?'👤 Driver':'🏢 Company'}
                      </span>
                    </td>
                    <td style={{ ...S.td, fontSize:11, fontFamily:'monospace', color:'#546e7a' }}>{p.violation_ref||'—'}</td>
                    <td style={{ ...S.td, textAlign:'right', fontWeight:800, color:'#c62828' }}>{SAR(p.amount)}</td>
                    <td style={{ ...S.td, fontFamily:'monospace' }}>{p.deduction_month||'—'}</td>
                    <td style={S.td}><span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:700, background:'#fff3e0', color:'#e65100' }}>{p.status}</span></td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* EOS RUNNING TABLE */}
      {tab==='eos' && (
        <div style={S.card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <div>
              <div style={{ fontWeight:800, fontSize:15, color:L3 }}>End of Service — Running Liability</div>
              <div style={{ fontSize:11, color:'#6b7c93', marginTop:2 }}>Active employees only · Excludes OUTSOURCED & CONTRACT · Calculated as of today</div>
            </div>
            <button style={S.btn(L3)} onClick={()=>setShowEosBanner(true)}>+ Process EOS Settlement</button>
          </div>
          {loading ? <div style={{ textAlign:'center', padding:40, color:'#6b7c93' }}>Loading…</div> : (
            eosEmps.length === 0
              ? <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No eligible employees found (OUTSOURCED & CONTRACT are excluded)</div>
              : (
                <div style={{ overflowX:'auto' }}>
                  {filtEos.length === 0 && eosEmps.length > 0 && (
                    <div style={{ textAlign:'center', padding:20, color:'#aab2bd', fontSize:12 }}>No results for current filters</div>
                  )}
                  <table style={S.tbl}>
                    <thead><tr>
                      <th style={{ ...S.th, background:L3 }}>Employee</th>
                      <th style={{ ...S.th, background:L3 }}>Category</th>
                      <th style={{ ...S.th, background:L3 }}>Department</th>
                      <th style={{ ...S.th, background:L3 }}>Join Date</th>
                      <th style={{ ...S.th, background:L3, textAlign:'right' }}>Service</th>
                      <th style={{ ...S.th, background:L3, textAlign:'right' }}>Full Package</th>
                      <th style={{ ...S.th, background:L3, textAlign:'right' }}>EOS Liability</th>
                      <th style={{ ...S.th, background:L3 }}>Bracket</th>
                    </tr></thead>
                    <tbody>
                      {filtEos
                        .map(e => ({ e, r: calcEOS(empPkg(e), e.hire_date, null, 'TERMINATION') }))
                        .sort((a,b) => b.r.amount - a.r.amount)
                        .map(({ e, r }, i) => {
                          const bracket = r.years < 1 ? { label:'< 1 yr', color:'#aab2bd', bg:'#f5f7fa' }
                            : r.years < 5  ? { label:'1–5 yrs', color:'#1565c0', bg:'#e3f2fd' }
                            : r.years < 10 ? { label:'5–10 yrs', color:'#2e7d32', bg:'#e8f5e9' }
                            : r.years < 20 ? { label:'10–20 yrs', color:'#e65100', bg:'#fff3e0' }
                            : { label:'20+ yrs (100%)', color:'#b71c1c', bg:'#ffebee' }
                          // Handle both code format ('01','02') and full-string format ('ACCSYS-LOCAL','ACCSYS-EXPAT')
                          const normCat = e.employee_category
                          const isLocal = normCat==='01' || normCat==='ACCSYS-LOCAL'
                          const isExpat = normCat==='02' || normCat==='ACCSYS-EXPAT'
                          const catLabel = isLocal ? 'ACCSYS-LOCAL' : isExpat ? 'ACCSYS-EXPAT' : normCat||'—'
                          const catColor = isLocal ? '#1565c0' : isExpat ? '#6a1b9a' : '#546e7a'
                          const catBg    = isLocal ? '#e3f2fd'  : isExpat ? '#f3e5f5' : '#eceff1'
                          const deptName = depts.find(d=>d.id===e.department_id)?.dept_code || depts.find(d=>d.id===e.department_id)?.dept_name || '—'
                          return (
                            <tr key={e.id} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
                              <td style={{ ...S.td, fontWeight:600 }}>{e.full_name||e.full_name_en||'—'}<br/><span style={{ fontSize:10, color:'#90a4ae' }}>{e.employee_number||''}</span></td>
                              <td style={S.td}><span style={{ padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700, background:catBg, color:catColor }}>{catLabel}</span></td>
                              <td style={{ ...S.td, fontSize:11, fontWeight:700, color:L3 }}>{deptName}</td>
                              <td style={{ ...S.td, fontFamily:'monospace', fontSize:11 }}>{fmt(e.hire_date)}</td>
                              <td style={{ ...S.td, textAlign:'right', fontWeight:600 }}>{r.years > 0 ? r.years.toFixed(2)+' yrs' : '—'}</td>
                              <td style={{ ...S.td, textAlign:'right' }}>
                                <span style={{ fontWeight:700 }}>{SAR(empPkg(e))}</span>
                                {e.basic_salary && empPkg(e) !== e.basic_salary && <div style={{ fontSize:9, color:'#90a4ae' }}>Basic: {SAR(e.basic_salary)}</div>}
                              </td>
                              <td style={{ ...S.td, textAlign:'right', fontWeight:800, color: r.amount > 0 ? L3 : '#aab2bd' }}>{r.amount > 0 ? SAR(r.amount) : '—'}</td>
                              <td style={S.td}><span style={{ padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700, background:bracket.bg, color:bracket.color }}>{bracket.label}</span></td>
                            </tr>
                          )
                        })
                      }
                    </tbody>
                  </table>
                </div>
              )
          )}
        </div>
      )}

      {/* EOS BANNER */}
      <PageBanner
        isOpen={showEosBanner}
        onClose={() => setShowEosBanner(false)}
        onStart={() => {
          setShowEosBanner(false)
          setEosForm({
            employee_id:'', dept_id:'',
            leave_reason:'TERMINATION', leave_date:TODAY.toISOString().slice(0,10), notes:'',
            assets:[
              { id:'laptop',      name:'Laptop',                    asset_no:'', status:'PENDING', value:'0', note:'' },
              { id:'mobile',      name:'Mobile Phone',              asset_no:'', status:'PENDING', value:'0', note:'' },
              { id:'access_card', name:'Access Card / Building Key',asset_no:'', status:'RETURNED',value:'0', note:'' },
              { id:'id_card',     name:'Employee ID Card',          asset_no:'', status:'RETURNED',value:'0', note:'' },
              { id:'vehicle',     name:'Company Vehicle',           asset_no:'', status:'NA',      value:'0', note:'' },
            ],
            handover_to:'', handover_date:TODAY.toISOString().slice(0,10), handover_by:'', handover_notes:'',
            departure_type:'COMPANY_TRANSFER',
            transfer_employer:'', transfer_ref:'', transfer_date:'',
            exit_date:'', flight_ref:'',
            leave_balance_days:'0',
            ticket_deduction:'0', uniform_deduction:'0',
            other_deduction_desc:'', other_deduction_amt:'0',
          })
          setEosStep(1); setShowEosForm(true)
        }}
        chapterName="HR"
        formTitle={['EOS', 'Settlement', 'Form']}
        heading="Process End of Service for a departing employee"
        iconLabel="Loans & EOS"
        workflowSteps={['Employee & Departure', 'Calculation Preview', 'Asset Clearance', 'Separation Type', 'Deductions', 'Confirm & Post']}
        description="Select the departing employee and departure details. The system will calculate EOS benefit automatically per Saudi Labour Law rules, and guide you through asset clearance, separation type, and deductions."
      />

      {/* EOS FORMSHELL */}
      <FormShell
        isOpen={showEosForm}
        onClose={() => { setShowEosForm(false); setEosStep(1) }}
        chapterName="HR"
        title={['EOS', 'Settlement', 'Form']}
        steps={['Employee & Departure', 'Calculation Preview', 'Asset Clearance', 'Separation Type', 'Deductions', 'Confirm & Post']}
        currentStep={eosStep}
        onBack={() => eosStep === 1 ? (setShowEosForm(false), setEosStep(1)) : setEosStep(s=>s-1)}
        backLabel={eosStep === 1 ? 'Cancel' : 'Back'}
        onNext={
          eosStep === 1 ? () => {
            if (!eosForm.employee_id) { alert('Select employee'); return }
            if (!eosForm.leave_date)  { alert('Enter departure date'); return }
            setEosStep(2)
          } :
          eosStep < 6 ? () => setEosStep(s=>s+1)
          : () => { alert('EOS recorded — please update the employee status to Inactive in the Employees module and process final payroll.'); setShowEosForm(false); setEosStep(1) }
        }
        nextLabel={eosStep < 6 ? `Next →` : 'Confirm & Post EOS'}
        nextDisabled={false}
        subjectLabel={{ line1: (d=>d?.dept_code||d?.dept_name||null)(depts.find(d=>d.id===eosForm.dept_id)), line2: eosEmps.find(e=>e.id===eosForm.employee_id)?.full_name || null }}
      >
        {/* ── STEP 1: Employee & Departure ────────────────────────── */}
        {eosStep === 1 && (() => {
          const selEmp = eosEmps.find(e=>e.id===eosForm.employee_id)
          return (
            <div>
              <div style={S.row}>
                <div style={{ flex:'0 0 130px' }}>
                  <label style={S.label}>Department</label>
                  <select style={S.inp} value={eosForm.dept_id||''} onChange={e=>{ ef('dept_id',e.target.value); ef('employee_id','') }}>
                    <option value="">— All —</option>
                    {depts.map(d=><option key={d.id} value={d.id}>{deptLabel(d)}</option>)}
                  </select>
                </div>
                <div style={{ flex:1 }}>
                  <label style={S.label}>Employee *</label>
                  <select style={S.inp} value={eosForm.employee_id} onChange={e=>ef('employee_id',e.target.value)}>
                    <option value="">— Select Employee —</option>
                    {eosEmps
                      .filter(e => !eosForm.dept_id || e.department_id === eosForm.dept_id)
                      .map(e=><option key={e.id} value={e.id}>{empLabel(e)}</option>)}
                  </select>
                </div>
              </div>
              {selEmp && (
                <div style={{ background:'#f0f4f8', borderRadius:4, padding:'10px 14px', fontSize:12, color:'#546e7a', marginBottom:12, display:'flex', flexWrap:'wrap', gap:14 }}>
                  <span>Hire Date: <strong>{fmt(selEmp.hire_date)}</strong></span>
                  <span>Full Package: <strong>{SAR(empPkg(selEmp))}</strong>{empPkg(selEmp) !== (selEmp.basic_salary||0) && <span style={{ fontSize:10, color:'#90a4ae' }}> (Basic: {SAR(selEmp.basic_salary||0)})</span>}</span>
                  <span>Category: <strong style={{ color: (['01','ACCSYS-LOCAL'].includes(selEmp.employee_category))?'#1565c0':(['02','ACCSYS-EXPAT'].includes(selEmp.employee_category))?'#6a1b9a':'#546e7a' }}>{['01','ACCSYS-LOCAL'].includes(selEmp.employee_category)?'ACCSYS-LOCAL':['02','ACCSYS-EXPAT'].includes(selEmp.employee_category)?'ACCSYS-EXPAT':selEmp.employee_type||selEmp.employee_category||'Uncategorised'}</strong></span>
                </div>
              )}
              <div style={S.row}>
                <div style={S.col}>
                  <label style={S.label}>Reason for Leaving *</label>
                  <select style={S.inp} value={eosForm.leave_reason} onChange={e=>ef('leave_reason',e.target.value)}>
                    <option value="TERMINATION">Termination by Company</option>
                    <option value="RESIGNATION">Resignation</option>
                    <option value="ALLEGATIONS">Termination with Allegations</option>
                    <option value="MUTUAL">Mutual Agreement</option>
                    <option value="CONTRACT_END">Contract End</option>
                    <option value="DEATH">Death / Disability</option>
                  </select>
                </div>
                <div style={S.col}>
                  <label style={S.label}>Last Working Day *</label>
                  <input type="date" style={S.inp} value={eosForm.leave_date} onChange={e=>ef('leave_date',e.target.value)} />
                </div>
              </div>
              <div>
                <label style={S.label}>Notes</label>
                <textarea style={{ ...S.inp, height:52, resize:'vertical' }} value={eosForm.notes} onChange={e=>ef('notes',e.target.value)} placeholder="Any remarks…" />
              </div>
            </div>
          )
        })()}

        {/* ── STEP 2: Calculation Preview ─────────────────────────── */}
        {eosStep === 2 && (() => {
          const selEmp = eosEmps.find(e=>e.id===eosForm.employee_id)
          if (!selEmp) return <div style={{ color:'#aab2bd', textAlign:'center', padding:30 }}>No employee selected</div>
          const r = calcEOS(empPkg(selEmp), selEmp.hire_date, eosForm.leave_date, eosForm.leave_reason)
          const yrs = r.years.toFixed(2)
          return (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12, marginBottom:16 }}>
                {[
                  { label:'Total Service',   value:`${yrs} years`,       color:'#1565c0' },
                  { label:'Full Package',    value:SAR(empPkg(selEmp)),   color:'#2e7d32' },
                  { label:'Leave Reason',    value:eosForm.leave_reason,  color:'#e65100' },
                  { label:'Gross EOS',       value:SAR(r.amount),         color: r.amount > 0 ? '#1a237e' : '#aab2bd' },
                ].map(c=>(
                  <div key={c.label} style={{ background:'#f5f7fa', borderRadius:8, padding:'12px 16px', textAlign:'center' }}>
                    <div style={{ fontSize:16, fontWeight:800, color:c.color }}>{c.value}</div>
                    <div style={{ fontSize:11, color:'#6b7c93', marginTop:3 }}>{c.label}</div>
                  </div>
                ))}
              </div>
              {r.amount === 0 && r.note && (
                <div style={{ background:'#fff3e0', borderRadius:6, padding:'10px 14px', fontSize:12, color:'#e65100', marginBottom:12 }}>⚠ {r.note}</div>
              )}
              {r.breakdown.length > 0 && (
                <div style={{ background:'#e8f5e9', borderRadius:8, padding:'12px 16px', marginBottom:12 }}>
                  <div style={{ fontWeight:800, color:'#2e7d32', fontSize:12, marginBottom:6, letterSpacing:0.5 }}>CALCULATION BREAKDOWN</div>
                  {r.breakdown.map((line,i)=>(
                    <div key={i} style={{ fontSize:12, color:'#1a2e3d', lineHeight:1.8 }}>• {line}</div>
                  ))}
                </div>
              )}
              <div style={{ background:'#f5f7fa', borderRadius:6, padding:'9px 14px', fontSize:11, color:'#6b7c93', marginTop:4 }}>
                ℹ Technical allowance excluded from wage base per company policy. Deductions and leave encashment will be added in later steps.
              </div>
              {eosForm.leave_reason === 'ALLEGATIONS' && (
                <div style={{ background:'#ffebee', borderRadius:6, padding:'10px 14px', fontSize:12, color:'#b71c1c', fontWeight:700, marginTop:8 }}>
                  ⚠ Termination with Allegations — EOS amount is subject to management decision and legal review. Recorded as SAR 0.00 pending approval.
                </div>
              )}
            </div>
          )
        })()}

        {/* ── STEP 3: Asset Clearance ──────────────────────────────── */}
        {eosStep === 3 && (() => {
          const assets = eosForm.assets || []
          const pendingAssets = assets.filter(a=>a.status==='PENDING')
          const updateAsset = (idx, key, val) => {
            const next = assets.map((a,i) => i===idx ? {...a,[key]:val} : a)
            ef('assets', next)
          }
          const addAsset = () => ef('assets', [...assets, { id:'custom_'+Date.now(), name:'', asset_no:'', status:'PENDING', value:'0', note:'' }])
          const statusColors = { RETURNED:['#2e7d32','#e8f5e9'], PENDING:['#e65100','#fff3e0'], NA:['#90a4ae','#f5f7fa'], WAIVED:['#1565c0','#e3f2fd'] }
          return (
            <div>
              <div style={{ fontSize:11, color:'#6b7c93', marginBottom:12 }}>
                Mark each company asset as Returned, Pending, Waived, or N/A. Assets marked Pending will have their value auto-deducted in Step 5.
              </div>
              {assets.map((asset, idx) => {
                const [sc, sbg] = statusColors[asset.status] || ['#90a4ae','#f5f7fa']
                return (
                  <div key={asset.id} style={{ display:'flex', gap:8, alignItems:'flex-start', padding:'9px 12px', borderRadius:6, border:`1px solid ${sbg==='#e8f5e9'?'#c8e6c9':sbg==='#fff3e0'?'#ffe0b2':'#e0e0e0'}`, background:sbg, marginBottom:7 }}>
                    <div style={{ flex:2, minWidth:0 }}>
                      <input
                        style={{ ...S.inp, fontSize:12, background:'rgba(255,255,255,0.7)', border:'1px solid rgba(0,0,0,0.1)' }}
                        value={asset.name}
                        onChange={e=>updateAsset(idx,'name',e.target.value)}
                        placeholder="Asset name…"
                      />
                    </div>
                    <div style={{ flex:1.2, minWidth:0 }}>
                      <input
                        style={{ ...S.inp, fontSize:11, background:'rgba(255,255,255,0.7)', border:'1px solid rgba(0,0,0,0.1)' }}
                        value={asset.asset_no}
                        onChange={e=>updateAsset(idx,'asset_no',e.target.value)}
                        placeholder="Asset # / serial"
                      />
                    </div>
                    <div style={{ flex:'0 0 110px' }}>
                      <select
                        style={{ ...S.inp, fontSize:11, background:'rgba(255,255,255,0.7)', border:'1px solid rgba(0,0,0,0.1)', color:sc, fontWeight:700 }}
                        value={asset.status}
                        onChange={e=>updateAsset(idx,'status',e.target.value)}
                      >
                        <option value="RETURNED">✓ Returned</option>
                        <option value="PENDING">⚠ Pending</option>
                        <option value="WAIVED">~ Waived</option>
                        <option value="NA">N/A</option>
                      </select>
                    </div>
                    {asset.status === 'PENDING' && (
                      <div style={{ flex:'0 0 100px' }}>
                        <input
                          type="number"
                          style={{ ...S.inp, fontSize:11, background:'rgba(255,255,255,0.7)', border:'1px solid #ffb74d' }}
                          value={asset.value}
                          onChange={e=>updateAsset(idx,'value',e.target.value)}
                          placeholder="Value SAR"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
              <button
                style={{ ...S.btn('#90a4ae'), padding:'6px 14px', fontSize:11, marginBottom:14 }}
                onClick={addAsset}
              >+ Add Asset</button>

              {pendingAssets.length > 0 && (
                <div style={{ background:'#fff3e0', borderRadius:6, padding:'9px 13px', fontSize:11, color:'#e65100', marginBottom:12 }}>
                  ⚠ {pendingAssets.length} asset{pendingAssets.length>1?'s':''} pending return. Enter the current market value — it will be deducted from the settlement in Step 5.
                </div>
              )}

              <div style={{ borderTop:'1px solid #e8ecf2', paddingTop:14, marginTop:4 }}>
                <div style={{ fontWeight:700, fontSize:11, color:'#6b7c93', letterSpacing:0.5, marginBottom:10 }}>HANDOVER & DEPARTMENT CLEARANCE</div>
                <div style={S.row}>
                  <div style={S.col}>
                    <label style={S.label}>Handover to (employee name)</label>
                    <input style={S.inp} value={eosForm.handover_to} onChange={e=>ef('handover_to',e.target.value)} placeholder="Name of person receiving handover…" />
                  </div>
                  <div style={{ flex:'0 0 150px' }}>
                    <label style={S.label}>Handover date</label>
                    <input type="date" style={S.inp} value={eosForm.handover_date} onChange={e=>ef('handover_date',e.target.value)} />
                  </div>
                </div>
                <div style={{ marginBottom:10 }}>
                  <label style={S.label}>Clearance signed by (department head)</label>
                  <input style={S.inp} value={eosForm.handover_by} onChange={e=>ef('handover_by',e.target.value)} placeholder="Name and title of dept head…" />
                </div>
                <div>
                  <label style={S.label}>Handover remarks (optional)</label>
                  <textarea style={{ ...S.inp, height:44, resize:'vertical' }} value={eosForm.handover_notes} onChange={e=>ef('handover_notes',e.target.value)} placeholder="Any notes about the handover, pending tickets, etc." />
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── STEP 4: Separation Type ──────────────────────────────── */}
        {eosStep === 4 && (() => {
          const selEmp = eosEmps.find(e=>e.id===eosForm.employee_id)
          const pkg = selEmp ? empPkg(selEmp) : 0
          const dailyRate = pkg > 0 ? pkg / 30 : 0
          const leaveDays = +eosForm.leave_balance_days || 0
          const leaveEnc  = dailyRate * leaveDays

          const depOpts = [
            { key:'FINAL_EXIT',        label:'Final Exit (leaving KSA)' },
            { key:'COMPANY_TRANSFER',  label:'Company Transfer (stays in KSA)' },
            { key:'RESIGNATION_STAYS', label:'Resignation (own arrangements)' },
          ]
          return (
            <div>
              <div style={{ fontWeight:700, fontSize:11, color:'#6b7c93', letterSpacing:0.5, marginBottom:8 }}>WHAT HAPPENS AFTER LAST WORKING DAY?</div>
              <div style={{ display:'flex', border:'1px solid #dde3ec', borderRadius:6, overflow:'hidden', marginBottom:16 }}>
                {depOpts.map((o,i)=>(
                  <button key={o.key}
                    onClick={()=>ef('departure_type',o.key)}
                    style={{ flex:1, padding:'9px 6px', border:'none', borderRight: i<2 ? '1px solid #dde3ec' : 'none', cursor:'pointer', fontSize:11, fontWeight:eosForm.departure_type===o.key?700:400, background:eosForm.departure_type===o.key?L3:'#fff', color:eosForm.departure_type===o.key?'#fff':'#546e7a', fontFamily:'Poppins,sans-serif', lineHeight:1.3 }}
                  >{o.label}</button>
                ))}
              </div>

              {/* FINAL EXIT */}
              {eosForm.departure_type === 'FINAL_EXIT' && (
                <div>
                  <div style={{ background:'#ffebee', borderRadius:6, padding:'9px 13px', fontSize:11, color:'#b71c1c', marginBottom:12 }}>
                    Employee will leave the Kingdom permanently. Iqama must be cancelled before final exit. EOS is paid before departure. These details will appear on the settlement letter.
                  </div>
                  <div style={S.row}>
                    <div style={S.col}>
                      <label style={S.label}>Iqama number</label>
                      <input style={S.inp} value={eosForm.iqama_number||selEmp?.iqama_number||''} onChange={e=>ef('iqama_number',e.target.value)} placeholder={selEmp?.iqama_number||'Auto from employee record'} />
                    </div>
                    <div style={S.col}>
                      <label style={S.label}>Iqama expiry</label>
                      <input type="date" style={S.inp} value={eosForm.iqama_expiry||selEmp?.iqama_expiry||''} onChange={e=>ef('iqama_expiry',e.target.value)} />
                    </div>
                  </div>
                  <div style={S.row}>
                    <div style={S.col}>
                      <label style={S.label}>Passport number</label>
                      <input style={S.inp} value={eosForm.passport_number||selEmp?.passport_number||''} onChange={e=>ef('passport_number',e.target.value)} placeholder={selEmp?.passport_number||'Auto from employee record'} />
                    </div>
                    <div style={S.col}>
                      <label style={S.label}>Intended departure date</label>
                      <input type="date" style={S.inp} value={eosForm.exit_date} onChange={e=>ef('exit_date',e.target.value)} />
                    </div>
                  </div>
                  <div style={{ marginBottom:10 }}>
                    <label style={S.label}>Flight / booking reference (optional)</label>
                    <input style={S.inp} value={eosForm.flight_ref} onChange={e=>ef('flight_ref',e.target.value)} placeholder="e.g. SV 723 — 05/11/2026 Riyadh → Karachi" />
                  </div>
                  <div style={{ background:'#fff8e1', borderRadius:6, padding:'9px 13px', fontSize:11, color:'#f57f17', marginBottom:12 }}>
                    ℹ EOS payment must be released before the final exit visa is stamped. Coordinate with PRO on timeline.
                  </div>
                </div>
              )}

              {/* COMPANY TRANSFER */}
              {eosForm.departure_type === 'COMPANY_TRANSFER' && (
                <div>
                  <div style={{ background:'#e3f2fd', borderRadius:6, padding:'9px 13px', fontSize:11, color:'#1565c0', marginBottom:12 }}>
                    EOS is calculated now but <strong>payment is withheld</strong> until the sponsorship transfer to the new employer is fully completed and confirmed on Absher / MOL. This condition will be stated in the settlement letter.
                  </div>
                  <div style={S.row}>
                    <div style={S.col}>
                      <label style={S.label}>New employer name *</label>
                      <input style={S.inp} value={eosForm.transfer_employer} onChange={e=>ef('transfer_employer',e.target.value)} placeholder="New company name…" />
                    </div>
                    <div style={S.col}>
                      <label style={S.label}>New employer CR / registration</label>
                      <input style={S.inp} value={eosForm.transfer_cr||''} onChange={e=>ef('transfer_cr',e.target.value)} placeholder="e.g. 1010123456" />
                    </div>
                  </div>
                  <div style={S.row}>
                    <div style={S.col}>
                      <label style={S.label}>Transfer initiated date</label>
                      <input type="date" style={S.inp} value={eosForm.transfer_date} onChange={e=>ef('transfer_date',e.target.value)} />
                    </div>
                    <div style={S.col}>
                      <label style={S.label}>Absher / MOL reference #</label>
                      <input style={S.inp} value={eosForm.transfer_ref} onChange={e=>ef('transfer_ref',e.target.value)} placeholder="Absher reference number…" />
                    </div>
                  </div>
                </div>
              )}

              {/* RESIGNATION STAYS */}
              {eosForm.departure_type === 'RESIGNATION_STAYS' && (
                <div>
                  <div style={{ background:'#f5f7fa', borderRadius:6, padding:'9px 13px', fontSize:11, color:'#546e7a', marginBottom:12 }}>
                    Employee is responsible for their own visa and Iqama arrangements. EOS is paid on the last working day or within the statutory period.
                  </div>
                  <div style={S.row}>
                    <div style={S.col}>
                      <label style={S.label}>Iqama number (for letter reference)</label>
                      <input style={S.inp} value={eosForm.iqama_number||selEmp?.iqama_number||''} onChange={e=>ef('iqama_number',e.target.value)} placeholder={selEmp?.iqama_number||'From employee record'} />
                    </div>
                    <div style={S.col}>
                      <label style={S.label}>Iqama expiry</label>
                      <input type="date" style={S.inp} value={eosForm.iqama_expiry||selEmp?.iqama_expiry||''} onChange={e=>ef('iqama_expiry',e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {/* LEAVE ENCASHMENT — always shown */}
              <div style={{ borderTop:'1px solid #e8ecf2', paddingTop:14, marginTop:4 }}>
                <div style={{ fontWeight:700, fontSize:11, color:'#6b7c93', letterSpacing:0.5, marginBottom:10 }}>ANNUAL LEAVE BALANCE ENCASHMENT</div>
                <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
                  <div style={{ flex:'0 0 140px' }}>
                    <label style={S.label}>Remaining leave days</label>
                    <input type="number" style={S.inp} value={eosForm.leave_balance_days} onChange={e=>ef('leave_balance_days',e.target.value)} placeholder="0" />
                  </div>
                  <div style={{ flex:'0 0 170px' }}>
                    <label style={S.label}>Daily rate (pkg ÷ 30)</label>
                    <div style={{ ...S.inp, background:'#f5f7fa', color:'#546e7a', fontFamily:'monospace', fontSize:12 }}>{SAR(dailyRate)} / day</div>
                  </div>
                  <div style={{ flex:1 }}>
                    <label style={S.label}>Leave encashment payable</label>
                    <div style={{ ...S.inp, background:'#F7F2ED', color:L3, fontWeight:800, fontFamily:'monospace', fontSize:13 }}>{SAR(leaveEnc)}</div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ── STEP 5: Deductions ───────────────────────────────────── */}
        {eosStep === 5 && (() => {
          const selEmp = eosEmps.find(e=>e.id===eosForm.employee_id)
          if (!selEmp) return null
          const r = calcEOS(empPkg(selEmp), selEmp.hire_date, eosForm.leave_date, eosForm.leave_reason)
          const dailyRate     = empPkg(selEmp) / 30
          const leaveEnc      = dailyRate * (+eosForm.leave_balance_days||0)
          const grossTotal    = r.amount + leaveEnc
          // Auto-deductions
          const empLoans      = loans.filter(l=>l.employee_id===selEmp.id&&l.status==='ACTIVE').reduce((s,l)=>s+(+l.outstanding||0),0)
          const empPenalties  = penalties.filter(p=>p.employee_id===selEmp.id&&p.status==='PENDING').reduce((s,p)=>s+(+p.amount||0),0)
          const assetDeds     = (eosForm.assets||[]).filter(a=>a.status==='PENDING').reduce((s,a)=>s+(+a.value||0),0)
          // Manual deductions
          const manualDeds    = (+eosForm.ticket_deduction||0) + (+eosForm.uniform_deduction||0) + (+eosForm.other_deduction_amt||0)
          const totalDeds     = empLoans + empPenalties + assetDeds + manualDeds
          const netPayable    = Math.max(0, grossTotal - totalDeds)
          const Dl = { fontSize:12, color:'#546e7a', marginBottom:3 }
          return (
            <div>
              {/* Running total banner */}
              <div style={{ background:'#F7F2ED', borderRadius:8, padding:'10px 14px', marginBottom:14, display:'flex', gap:20, flexWrap:'wrap' }}>
                <div><div style={{ fontSize:11, color:'#6b7c93' }}>Gross EOS</div><div style={{ fontWeight:700, color:L3, fontFamily:'monospace' }}>{SAR(r.amount)}</div></div>
                <div><div style={{ fontSize:11, color:'#6b7c93' }}>Leave encashment</div><div style={{ fontWeight:700, color:'#2e7d32', fontFamily:'monospace' }}>+ {SAR(leaveEnc)}</div></div>
                <div><div style={{ fontSize:11, color:'#6b7c93' }}>Total before deductions</div><div style={{ fontWeight:800, color:L3, fontFamily:'monospace', fontSize:14 }}>{SAR(grossTotal)}</div></div>
              </div>

              <div style={{ fontWeight:700, fontSize:11, color:'#6b7c93', letterSpacing:0.5, marginBottom:8 }}>DEDUCTIONS FROM SETTLEMENT</div>

              {/* Auto-deductions (read-only) */}
              {empLoans > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'#fff', border:'1px solid #e8ecf2', borderRadius:6, marginBottom:6, fontSize:12 }}>
                  <div><div style={{ fontWeight:600 }}>Pending loan balance</div><div style={{ fontSize:10, color:'#90a4ae' }}>Auto-linked from Loans register · {loans.filter(l=>l.employee_id===selEmp.id&&l.status==='ACTIVE').length} active loan(s)</div></div>
                  <div style={{ fontWeight:700, color:'#c62828', fontFamily:'monospace' }}>– {SAR(empLoans)}</div>
                </div>
              )}
              {empPenalties > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'#fff', border:'1px solid #e8ecf2', borderRadius:6, marginBottom:6, fontSize:12 }}>
                  <div><div style={{ fontWeight:600 }}>Pending penalties</div><div style={{ fontSize:10, color:'#90a4ae' }}>Auto-linked from Penalties register</div></div>
                  <div style={{ fontWeight:700, color:'#c62828', fontFamily:'monospace' }}>– {SAR(empPenalties)}</div>
                </div>
              )}
              {assetDeds > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'#fff3e0', border:'1px solid #ffe0b2', borderRadius:6, marginBottom:6, fontSize:12 }}>
                  <div><div style={{ fontWeight:600 }}>Unreturned assets</div><div style={{ fontSize:10, color:'#90a4ae' }}>{(eosForm.assets||[]).filter(a=>a.status==='PENDING').map(a=>a.name).join(', ')}</div></div>
                  <div style={{ fontWeight:700, color:'#c62828', fontFamily:'monospace' }}>– {SAR(assetDeds)}</div>
                </div>
              )}

              {/* Manual deductions */}
              <div style={{ background:'#f5f7fa', borderRadius:6, padding:'10px 12px', marginBottom:6 }}>
                <div style={{ fontWeight:700, fontSize:11, color:'#6b7c93', marginBottom:8 }}>MANUAL DEDUCTIONS</div>
                <div style={{ display:'flex', gap:10, marginBottom:8, alignItems:'center' }}>
                  <div style={{ flex:'0 0 200px', ...Dl }}>Air tickets on company account (SAR)</div>
                  <input type="number" style={{ ...S.inp, flex:1 }} value={eosForm.ticket_deduction} onChange={e=>ef('ticket_deduction',e.target.value)} placeholder="0.00" />
                </div>
                <div style={{ display:'flex', gap:10, marginBottom:8, alignItems:'center' }}>
                  <div style={{ flex:'0 0 200px', ...Dl }}>Uniform / advance (SAR)</div>
                  <input type="number" style={{ ...S.inp, flex:1 }} value={eosForm.uniform_deduction} onChange={e=>ef('uniform_deduction',e.target.value)} placeholder="0.00" />
                </div>
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <input style={{ ...S.inp, flex:2 }} value={eosForm.other_deduction_desc} onChange={e=>ef('other_deduction_desc',e.target.value)} placeholder="Other deduction description…" />
                  <input type="number" style={{ ...S.inp, flex:1 }} value={eosForm.other_deduction_amt} onChange={e=>ef('other_deduction_amt',e.target.value)} placeholder="0.00" />
                </div>
              </div>

              {/* NET payable */}
              <div style={{ background: netPayable > 0 ? '#e8f5e9' : '#ffebee', borderRadius:8, padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color: netPayable > 0 ? '#2e7d32' : '#b71c1c' }}>Net settlement payable</div>
                  <div style={{ fontSize:10, color:'#90a4ae', marginTop:1 }}>{SAR(grossTotal)} − {SAR(totalDeds)} deductions</div>
                </div>
                <div style={{ fontSize:20, fontWeight:900, color: netPayable > 0 ? '#2e7d32' : '#b71c1c', fontFamily:'monospace' }}>{SAR(netPayable)}</div>
              </div>

              {eosForm.departure_type === 'COMPANY_TRANSFER' && (
                <div style={{ background:'#e3f2fd', borderRadius:6, padding:'9px 13px', fontSize:11, color:'#1565c0', marginTop:10 }}>
                  ⏱ Payment condition active — this settlement will be released only upon confirmed completion of sponsorship transfer to {eosForm.transfer_employer||'new employer'}.
                </div>
              )}
            </div>
          )
        })()}

        {/* ── STEP 6: Confirm & Post ───────────────────────────────── */}
        {eosStep === 6 && (() => {
          const selEmp = eosEmps.find(e=>e.id===eosForm.employee_id)
          if (!selEmp) return null
          const r = calcEOS(empPkg(selEmp), selEmp.hire_date, eosForm.leave_date, eosForm.leave_reason)
          const pkg        = empPkg(selEmp)
          const dailyRate  = pkg / 30
          const leaveEnc   = dailyRate * (+eosForm.leave_balance_days||0)
          const empLoans   = loans.filter(l=>l.employee_id===selEmp.id&&l.status==='ACTIVE').reduce((s,l)=>s+(+l.outstanding||0),0)
          const empPens    = penalties.filter(p=>p.employee_id===selEmp.id&&p.status==='PENDING').reduce((s,p)=>s+(+p.amount||0),0)
          const assetDeds  = (eosForm.assets||[]).filter(a=>a.status==='PENDING').reduce((s,a)=>s+(+a.value||0),0)
          const manualDeds = (+eosForm.ticket_deduction||0)+(+eosForm.uniform_deduction||0)+(+eosForm.other_deduction_amt||0)
          const totalDeds  = empLoans + empPens + assetDeds + manualDeds
          const grossTotal = r.amount + leaveEnc
          const netPayable = Math.max(0, grossTotal - totalDeds)
          const deptName   = depts.find(d=>d.id===selEmp.department_id)?.dept_code || depts.find(d=>d.id===selEmp.department_id)?.dept_name || '—'
          const isoDate    = new Date().toLocaleDateString('en-GB')

          // Salary components for breakdown table
          const salaryRows = [
            { label:'Basic Salary',          val:selEmp.basic_salary||0 },
            { label:'Housing Allowance',      val:selEmp.housing_allowance||0 },
            { label:'Transport Allowance',    val:selEmp.transport_allowance||0 },
            { label:'Mobile Allowance',       val:selEmp.mobile_allowance||0 },
            { label:'Medical Allowance',      val:selEmp.medical_allowance||0 },
            { label:'Other Allowance',        val:selEmp.other_allowance||0 },
          ].filter(row=>row.val>0)

          const iqamaNo  = eosForm.iqama_number   || selEmp.iqama_number   || '—'
          const iqamaExp = eosForm.iqama_expiry    || selEmp.iqama_expiry   || '—'
          const passNo   = eosForm.passport_number || selEmp.passport_number|| '—'
          const showVisa = eosForm.departure_type === 'FINAL_EXIT' || eosForm.departure_type === 'RESIGNATION_STAYS'

          return (
            <div style={{ fontSize:12 }}>
              {/* LETTER HEADER */}
              <div style={{ background:'#F7F2ED', borderRadius:'8px 8px 0 0', padding:'14px 18px', borderBottom:`3px solid ${L3}`, display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div style={{ fontWeight:900, fontSize:15, color:L3 }}>Ratal Advanced Technologies Co.</div>
                  <div style={{ fontSize:10, color:'#90a4ae', marginTop:2 }}>Riyadh, Kingdom of Saudi Arabia</div>
                </div>
                <div style={{ textAlign:'right', fontSize:11, color:'#546e7a' }}>
                  <div>Ref: RATAL/HR/EOS/2026</div>
                  <div>Date: {isoDate}</div>
                  <div style={{ fontWeight:700, color:L3, marginTop:2 }}>CONFIDENTIAL</div>
                </div>
              </div>

              <div style={{ background:'#fff', border:`1px solid ${L3}`, borderTop:'none', borderRadius:'0 0 8px 8px', padding:'14px 18px', marginBottom:12 }}>

                {/* Title */}
                <div style={{ textAlign:'center', fontWeight:800, fontSize:13, marginBottom:2 }}>END OF SERVICE BENEFIT — FINAL SETTLEMENT LETTER</div>
                <div style={{ textAlign:'center', fontSize:10, color:'#90a4ae', marginBottom:14 }}>Saudi Labour Law, Article 84 · Subject to conditions stated herein</div>

                {/* Employee info grid */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'3px 18px', background:'#f5f7fa', borderRadius:6, padding:'10px 12px', marginBottom:10 }}>
                  {[
                    ['Name', selEmp.full_name||selEmp.full_name_en||'—'],
                    ['Employee #', selEmp.employee_number||'—'],
                    ['Department', deptName],
                    ['Separation Reason', eosForm.leave_reason],
                    ['Date of Hire', fmt(selEmp.hire_date)],
                    ['Last Working Day', fmt(eosForm.leave_date)],
                    ['Total Service', r.years.toFixed(2)+' years'],
                    ...(showVisa ? [['Iqama #', iqamaNo],['Iqama Expiry', iqamaExp],['Passport #', passNo]] : []),
                    ...(eosForm.departure_type==='FINAL_EXIT'&&eosForm.exit_date ? [['Exit Date', fmt(eosForm.exit_date)]] : []),
                  ].map(([k,v])=>(
                    <div key={k} style={{ fontSize:11 }}><span style={{ color:'#90a4ae' }}>{k}: </span><strong>{v}</strong></div>
                  ))}
                </div>

                {/* Conditional clause */}
                {eosForm.departure_type === 'COMPANY_TRANSFER' && (
                  <div style={{ background:'#e3f2fd', borderRadius:6, padding:'9px 12px', fontSize:11, color:'#1565c0', marginBottom:10, lineHeight:1.7 }}>
                    <strong>Conditional Payment Clause:</strong> The EOSB stated herein is calculated and agreed as of {isoDate}. Payment will be disbursed only upon successful completion of the sponsorship transfer from Ratal Advanced Technologies Co. to <strong>{eosForm.transfer_employer||'[New Employer]'}</strong>. Transfer reference: {eosForm.transfer_ref||'pending'}. Expected completion: {eosForm.transfer_date ? fmt(eosForm.transfer_date) : 'TBD'}.
                  </div>
                )}
                {eosForm.departure_type === 'FINAL_EXIT' && (
                  <div style={{ background:'#ffebee', borderRadius:6, padding:'9px 12px', fontSize:11, color:'#b71c1c', marginBottom:10, lineHeight:1.7 }}>
                    <strong>Final Exit:</strong> EOS payment will be released before the final exit visa stamp. Iqama cancellation is to be processed by PRO within 10 working days of last working day.
                  </div>
                )}

                {/* Salary breakdown */}
                <div style={{ fontWeight:700, fontSize:10, color:'#6b7c93', letterSpacing:0.5, marginBottom:5 }}>SALARY BREAKDOWN — WAGE BASE FOR EOS</div>
                <table style={{ ...S.tbl, marginBottom:8 }}>
                  <thead><tr>
                    <th style={{ ...S.th, background:L3, fontSize:10 }}>Component</th>
                    <th style={{ ...S.th, background:L3, textAlign:'right', fontSize:10 }}>Monthly (SAR)</th>
                  </tr></thead>
                  <tbody>
                    {salaryRows.map(row=>(
                      <tr key={row.label}><td style={S.td}>{row.label}</td><td style={{ ...S.td, textAlign:'right', fontFamily:'monospace' }}>{SAR(row.val)}</td></tr>
                    ))}
                    <tr style={{ background:'#F7F2ED' }}>
                      <td style={{ ...S.td, fontWeight:700, color:L3 }}>Wage base (EOS calculation basis)</td>
                      <td style={{ ...S.td, textAlign:'right', fontWeight:800, color:L3, fontFamily:'monospace' }}>{SAR(pkg)}</td>
                    </tr>
                    {(selEmp.technical_allowance||0)>0 && (
                      <tr style={{ opacity:.55 }}>
                        <td style={S.td}>Technical allowance (excluded — see note)</td>
                        <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace' }}>{SAR(selEmp.technical_allowance)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div style={{ fontSize:10, color:'#90a4ae', marginBottom:10 }}>* Technical allowance is a project/task-based variable payment and does not form part of the fixed wage base for EOSB computation.</div>

                {/* EOS + leave */}
                <table style={{ ...S.tbl, marginBottom:8 }}>
                  <thead><tr>
                    <th style={{ ...S.th, background:L3, fontSize:10 }}>Settlement Component</th>
                    <th style={{ ...S.th, background:L3, textAlign:'right', fontSize:10 }}>Amount (SAR)</th>
                  </tr></thead>
                  <tbody>
                    <tr><td style={S.td}>Gross EOS ({r.years.toFixed(2)} yrs × labour law bracket)</td><td style={{ ...S.td, textAlign:'right', fontFamily:'monospace' }}>{SAR(r.amount)}</td></tr>
                    {leaveEnc > 0 && <tr><td style={S.td}>Leave encashment ({eosForm.leave_balance_days} days × {SAR(dailyRate)}/day)</td><td style={{ ...S.td, textAlign:'right', fontFamily:'monospace' }}>{SAR(leaveEnc)}</td></tr>}
                    <tr style={{ background:'#F7F2ED' }}><td style={{ ...S.td, fontWeight:700 }}>Total before deductions</td><td style={{ ...S.td, textAlign:'right', fontWeight:800, fontFamily:'monospace' }}>{SAR(grossTotal)}</td></tr>
                    {empLoans > 0 && <tr><td style={{ ...S.td, color:'#c62828' }}>Pending loan balance</td><td style={{ ...S.td, textAlign:'right', color:'#c62828', fontFamily:'monospace' }}>– {SAR(empLoans)}</td></tr>}
                    {empPens > 0 && <tr><td style={{ ...S.td, color:'#c62828' }}>Pending penalties</td><td style={{ ...S.td, textAlign:'right', color:'#c62828', fontFamily:'monospace' }}>– {SAR(empPens)}</td></tr>}
                    {assetDeds > 0 && <tr><td style={{ ...S.td, color:'#c62828' }}>Unreturned assets (market value)</td><td style={{ ...S.td, textAlign:'right', color:'#c62828', fontFamily:'monospace' }}>– {SAR(assetDeds)}</td></tr>}
                    {(+eosForm.ticket_deduction||0)>0 && <tr><td style={{ ...S.td, color:'#c62828' }}>Air tickets on company account</td><td style={{ ...S.td, textAlign:'right', color:'#c62828', fontFamily:'monospace' }}>– {SAR(+eosForm.ticket_deduction)}</td></tr>}
                    {(+eosForm.uniform_deduction||0)>0 && <tr><td style={{ ...S.td, color:'#c62828' }}>Uniform / advance</td><td style={{ ...S.td, textAlign:'right', color:'#c62828', fontFamily:'monospace' }}>– {SAR(+eosForm.uniform_deduction)}</td></tr>}
                    {(+eosForm.other_deduction_amt||0)>0 && <tr><td style={{ ...S.td, color:'#c62828' }}>{eosForm.other_deduction_desc||'Other deduction'}</td><td style={{ ...S.td, textAlign:'right', color:'#c62828', fontFamily:'monospace' }}>– {SAR(+eosForm.other_deduction_amt)}</td></tr>}
                    <tr style={{ background:L3 }}><td style={{ ...S.td, color:'#fff', fontWeight:800 }}>NET EOS PAYABLE</td><td style={{ ...S.td, textAlign:'right', color:'#fff', fontWeight:900, fontFamily:'monospace', fontSize:14 }}>{SAR(netPayable)}</td></tr>
                  </tbody>
                </table>

                {/* Asset clearance summary */}
                {(eosForm.assets||[]).length > 0 && (
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontWeight:700, fontSize:10, color:'#6b7c93', letterSpacing:0.5, marginBottom:5 }}>ASSET CLEARANCE</div>
                    <table style={{ ...S.tbl, fontSize:11 }}>
                      <thead><tr>
                        <th style={{ ...S.th, background:'#546e7a', fontSize:10 }}>Asset</th>
                        <th style={{ ...S.th, background:'#546e7a', fontSize:10 }}>Asset #</th>
                        <th style={{ ...S.th, background:'#546e7a', fontSize:10 }}>Status</th>
                      </tr></thead>
                      <tbody>
                        {(eosForm.assets||[]).filter(a=>a.name&&a.status!=='NA').map(a=>(
                          <tr key={a.id}>
                            <td style={S.td}>{a.name}</td>
                            <td style={{ ...S.td, fontFamily:'monospace', fontSize:11 }}>{a.asset_no||'—'}</td>
                            <td style={S.td}><span style={{ padding:'1px 7px', borderRadius:4, fontSize:10, fontWeight:700, background:a.status==='RETURNED'?'#e8f5e9':a.status==='PENDING'?'#fff3e0':'#f5f7fa', color:a.status==='RETURNED'?'#2e7d32':a.status==='PENDING'?'#e65100':'#90a4ae' }}>{a.status}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {eosForm.handover_to && <div style={{ fontSize:10, color:'#90a4ae', marginTop:3 }}>Handover to: {eosForm.handover_to}{eosForm.handover_by ? ` · Signed off: ${eosForm.handover_by}` : ''} · {fmt(eosForm.handover_date)}</div>}
                  </div>
                )}

                {/* Notes */}
                <div style={{ background:'#fff8e1', borderRadius:6, padding:'9px 12px', fontSize:10, color:'#f57f17', lineHeight:1.7, marginBottom:12 }}>
                  <strong>Important:</strong> (1) Technical allowance not included in wage base per employment contract. (2) GOSI subscription closed effective {fmt(eosForm.leave_date)} — PRO to notify GOSI within 10 working days. (3) Employee remains bound by confidentiality obligations post-employment.
                </div>

                {/* Signatures */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, paddingTop:10, borderTop:'1px solid #e8ecf2' }}>
                  {['HR Manager · Ratal', 'Department Head', `${selEmp.full_name||'Employee'} · ${selEmp.employee_number||''}`].map(sig=>(
                    <div key={sig}>
                      <div style={{ borderTop:'1px solid #546e7a', paddingTop:4, fontSize:10, color:'#6b7c93', marginTop:28 }}>{sig}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background:'#e3f2fd', borderRadius:6, padding:'10px 14px', fontSize:11, color:'#1565c0' }}>
                ℹ After confirming, update the employee status to Inactive in the Employees module and process final payroll for the last working month.
              </div>
            </div>
          )
        })()}
      </FormShell>

      {/* LOAN BANNER */}
      <PageBanner
        isOpen={showLoanBanner}
        onClose={() => setShowLoanBanner(false)}
        onStart={() => { setShowLoanBanner(false); setForm(EMPTY); setLoanStep(1); setShowForm(true) }}
        chapterName="HR"
        formTitle={['New', 'Loans', 'Request']}
        heading="Create a salary loan for an employee"
        iconLabel="Loans & EOS"
        workflowSteps={['Loan Details', 'Schedule & Notes']}
        description="Select the employee, enter the loan amount and repayment tenure. The EMI will be calculated automatically."
      />

      {/* LOAN FORMSHELL */}
      <FormShell
        isOpen={showForm}
        onClose={() => { setShowForm(false); setLoanStep(1) }}
        chapterName="HR"
        title={['New', 'Salary', 'Loan']}
        steps={['Loan Details', 'Schedule & Notes']}
        currentStep={loanStep}
        onBack={loanStep === 1 ? () => { setShowForm(false); setLoanStep(1) } : () => setLoanStep(1)}
        backLabel={loanStep === 1 ? 'Cancel' : 'Back'}
        onNext={loanStep === 1 ? () => { if (!form.employee_id) { alert('Select employee'); return } if (!form.loan_amount || +form.loan_amount<=0) { alert('Enter loan amount'); return } setLoanStep(2) } : saveLoan}
        nextLabel={loanStep === 1 ? 'Next: Schedule & Notes' : (saving ? 'Saving…' : 'Approve Loan')}
        nextDisabled={saving}
        subjectLabel={{ line1: (d=>d?.dept_code||d?.dept_name||null)(depts.find(d=>d.id===form.dept_id)), line2: employees.find(e=>e.id===form.employee_id)?.full_name || null }}
      >
        {loanStep === 1 && (() => {
          const loanEmp   = employees.find(e=>e.id===form.employee_id)
          const maxLoan   = (+(loanEmp?.basic_salary)||0) * 3
          const overLimit = +form.loan_amount > 0 && maxLoan > 0 && +form.loan_amount > maxLoan
          return (
          <div>
            {/* Dept + Employee row */}
            <div style={{ display:'flex', gap:12, marginBottom:14 }}>
              <div style={{ flex:'0 0 140px' }}>
                <label style={S.label}>Department</label>
                <select style={S.inp} value={form.dept_id||''} onChange={e=>{ f('dept_id',e.target.value); f('employee_id','') }}>
                  <option value="">— All —</option>
                  {depts.map(d=><option key={d.id} value={d.id}>{deptLabel(d)}</option>)}
                </select>
              </div>
              <div style={{ flex:1 }}>
                <label style={S.label}>Employee *</label>
                <select style={S.inp} value={form.employee_id} onChange={e=>f('employee_id',e.target.value)}>
                  <option value="">— Select Employee —</option>
                  {employees
                    .filter(e => !form.dept_id || e.department_id === form.dept_id)
                    .map(e=><option key={e.id} value={e.id}>{empLabel(e)}</option>)}
                </select>
              </div>
            </div>
            {/* Basic salary hint */}
            {loanEmp && (
              <div style={{ background:'#f0f4f8', borderRadius:4, padding:'8px 12px', fontSize:12, color:'#546e7a', marginBottom:12, display:'flex', alignItems:'center', flexWrap:'wrap', gap:10 }}>
                <span>Basic Salary: <strong>{SAR(loanEmp.basic_salary||0)}</strong> &nbsp;·&nbsp; Max Loan (3×): <strong style={{ color:L3 }}>{SAR(maxLoan)}</strong></span>
              </div>
            )}
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>Loan Amount (SAR) *</label>
                <input type="number" style={{ ...S.inp, borderColor: overLimit?'#c62828':undefined }} value={form.loan_amount} onChange={e=>f('loan_amount',e.target.value)} placeholder="0.00" />
                {overLimit && <div style={{ fontSize:11, color:'#c62828', marginTop:3 }}>⚠ Exceeds 3× basic salary limit ({SAR(maxLoan)})</div>}
              </div>
              <div style={S.col}>
                <label style={S.label}>Tenure (Months — Max 24)</label>
                <select style={S.inp} value={form.tenure_months} onChange={e=>f('tenure_months',e.target.value)}>
                  {MONTHS.map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            {+form.loan_amount > 0 && (
              <div style={{ background:'#F7F2ED', borderRadius:4, padding:'10px 14px', fontWeight:700, color:L3 }}>
                EMI per month: {SAR(emi())} × {form.tenure_months} months = {SAR(+form.loan_amount)}
              </div>
            )}
          </div>
          )
        })()}
        {loanStep === 2 && (() => {
          // Build repayment schedule
          const months = +form.tenure_months || 12
          const amount = +form.loan_amount  || 0
          const emiAmt = amount > 0 ? +(amount / months).toFixed(2) : 0
          // Determine start date
          const [sy, sm] = form.start_month
            ? form.start_month.split('-').map(Number)
            : [TODAY.getFullYear(), TODAY.getMonth() + 1]
          const schedule = Array.from({ length: months }, (_, i) => {
            const d = new Date(sy, sm - 1 + i, 1)
            return {
              no:    i + 1,
              label: d.toLocaleDateString('en-GB', { month:'short', year:'numeric' }),
              bal:   +(amount - emiAmt * (i + 1)).toFixed(2),
            }
          })
          return (
            <div>
              <div style={S.row}>
                <div style={S.col}>
                  <label style={S.label}>Start Month</label>
                  <input type="month" style={S.inp} value={form.start_month} onChange={e=>f('start_month',e.target.value)} />
                </div>
                <div style={S.col}>
                  <label style={S.label}>Notes</label>
                  <textarea style={{ ...S.inp, height:38, resize:'vertical' }} value={form.notes} onChange={e=>f('notes',e.target.value)} />
                </div>
              </div>

              {/* Summary bar */}
              <div style={{ background:'#F7F2ED', borderRadius:4, padding:'9px 14px', fontSize:12, color:L3, marginBottom:12 }}>
                <strong>Summary:</strong> {employees.find(e=>e.id===form.employee_id)?.full_name} · {SAR(amount)} over {months} months · EMI <strong>{SAR(emiAmt)}</strong> / month
              </div>

              {/* Repayment schedule table */}
              {amount > 0 && (
                <div style={{ maxHeight:220, overflowY:'auto', border:'1px solid #e8ecf2', borderRadius:4 }}>
                  <table style={{ ...S.tbl, fontSize:11 }}>
                    <thead>
                      <tr>
                        <th style={{ ...S.th, width:36, textAlign:'center' }}>#</th>
                        <th style={S.th}>Month</th>
                        <th style={{ ...S.th, textAlign:'right' }}>Instalment</th>
                        <th style={{ ...S.th, textAlign:'right' }}>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map(r => (
                        <tr key={r.no}>
                          <td style={{ ...S.td, textAlign:'center', color:'#999' }}>{r.no}</td>
                          <td style={S.td}>{r.label}</td>
                          <td style={{ ...S.td, textAlign:'right', fontWeight:600, color:L3 }}>{SAR(emiAmt)}</td>
                          <td style={{ ...S.td, textAlign:'right', color: r.bal <= 0 ? '#2e7d32' : '#546e7a' }}>
                            {r.bal <= 0 ? '✓ Paid off' : SAR(Math.max(r.bal, 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })()}
      </FormShell>

      {/* PENALTY BANNER */}
      <PageBanner
        isOpen={showPenBanner}
        onClose={() => setShowPenBanner(false)}
        onStart={() => { setShowPenBanner(false); setPForm(EMPTY_PEN); setPenStep(1); setShowPF(true) }}
        chapterName="HR"
        formTitle={['New', 'Penalty', 'Record']}
        heading="Record a traffic or HR penalty"
        iconLabel="Loans & EOS"
        workflowSteps={['Select Vehicle', 'Violation Details', 'Posting']}
        description="Start with the plate number — the system auto-identifies the driver. Then fill in the Traffic Authority details. Driver-borne fines go to payroll deduction; company-borne go to Accounts Payable."
      />

      {/* PENALTY FORMSHELL — vehicle-first 3-step flow */}
      <FormShell
        isOpen={showPF}
        onClose={() => { setShowPF(false); setPenStep(1) }}
        chapterName="HR"
        title={['New', 'Penalty', 'Record']}
        steps={['Select Vehicle', 'Violation Details', 'Posting']}
        currentStep={penStep}
        onBack={() => penStep === 1 ? (setShowPF(false), setPenStep(1)) : setPenStep(s=>s-1)}
        backLabel={penStep === 1 ? 'Cancel' : 'Back'}
        onNext={
          penStep === 1 ? () => {
            if (!pForm.plate_number) { alert('Select a plate number'); return }
            setPenStep(2)
          } :
          penStep === 2 ? () => {
            if (!pForm.penalty_category) { alert('Select penalty category'); return }
            if (!pForm.violation_date)   { alert('Enter violation date'); return }
            if (!pForm.amount || +pForm.amount<=0) { alert('Enter amount'); return }
            setPenStep(3)
          } : savePenalty
        }
        nextLabel={penStep < 3 ? `Next: ${['Violation Details','Posting'][penStep-1]} →` : (saving ? 'Saving…' : 'Save Penalty')}
        nextDisabled={saving}
        subjectLabel={{ line1: (d=>d?.dept_code||d?.dept_name||null)(depts.find(d=>d.id===employees.find(e=>e.id===pForm.employee_id)?.department_id)), line2: employees.find(e=>e.id===pForm.employee_id)?.full_name || null }}
      >
        {/* ── STEP 1: Select Vehicle ────────────────────────────── */}
        {penStep === 1 && (
          <div>
            <div style={{ marginBottom:14 }}>
              <label style={S.label}>Plate Number *</label>
              <select style={S.inp} value={pForm.plate_number} onChange={e=>{
                const plate = e.target.value
                const rec   = plateMap[plate]
                pf('plate_number', plate)
                pf('vehicle_plate', plate)
                pf('employee_id',   rec?.employee_id || '')
                pf('dept_id',       rec?.emp?.department_id || '')
              }}>
                <option value="">— Select Vehicle Plate —</option>
                {vehicles.length > 0
                  ? vehicles.map(v=>{
                      const driver = plateMap[v.plate_number]
                      return <option key={v.id} value={v.plate_number}>
                        {v.plate_number}{v.make?' — '+v.make+(v.model?' '+v.model:''):''}{driver?.emp?' · '+(driver.emp.full_name||driver.emp.full_name_en||'') : ' · Unassigned'}
                      </option>
                    })
                  : Object.keys(plateMap).map(plate=>{
                      const d = plateMap[plate]
                      return <option key={plate} value={plate}>{plate}{d?.emp ? ' · '+(d.emp.full_name||d.emp.full_name_en||'') : ' · Unassigned'}</option>
                    })
                }
              </select>
            </div>

            {/* Driver card — shown immediately after plate selection */}
            {pForm.plate_number && (() => {
              const rec = plateMap[pForm.plate_number]
              const emp = rec?.emp
              if (!emp) return (
                <div style={{ background:'#fff3e0', borderRadius:8, padding:'14px 16px', fontSize:12, color:'#e65100', marginBottom:12, border:'1px solid #ffcc80' }}>
                  <strong>⚠ No driver currently assigned to this vehicle.</strong><br/>
                  <span style={{ color:'#795548' }}>Penalty will be posted as a Company expense.</span>
                </div>
              )
              return (
                <div style={{ background:'#f0f4f8', borderRadius:8, padding:'16px 18px', marginBottom:12, border:'1px solid #cfd8dc' }}>
                  <div style={{ fontSize:11, fontWeight:800, color:'#6b7c93', letterSpacing:1, marginBottom:10 }}>🚗 CURRENT DRIVER</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 24px', fontSize:13 }}>
                    <div><span style={{ color:'#90a4ae', fontWeight:700, fontSize:11 }}>NAME</span><br/><strong>{emp.full_name||emp.full_name_en||'—'}</strong></div>
                    <div><span style={{ color:'#90a4ae', fontWeight:700, fontSize:11 }}>EMP #</span><br/>{emp.employee_number||'—'}</div>
                    <div><span style={{ color:'#90a4ae', fontWeight:700, fontSize:11 }}>DEPT</span><br/>{depts.find(d=>d.id===emp.department_id)?.dept_code || '—'}</div>
                    <div><span style={{ color:'#90a4ae', fontWeight:700, fontSize:11 }}>IQAMA</span><br/>{emp.iqama_number||'—'}</div>
                    <div><span style={{ color:'#90a4ae', fontWeight:700, fontSize:11 }}>MOBILE</span><br/>{emp.mobile||'—'}</div>
                    {rec.assignment_date && <div><span style={{ color:'#90a4ae', fontWeight:700, fontSize:11 }}>ASSIGNED</span><br/>{fmt(rec.assignment_date)}</div>}
                  </div>
                </div>
              )
            })()}

            {!pForm.plate_number && (
              <div style={{ padding:'28px 0', textAlign:'center', color:'#90a4ae', fontSize:13 }}>
                Select a plate above to identify the responsible driver.
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Violation Details ─────────────────────────── */}
        {penStep === 2 && (
          <div>
            {/* Category */}
            <div style={{ marginBottom:14 }}>
              <label style={S.label}>Penalty Category *</label>
              <select style={S.inp} value={pForm.penalty_category} onChange={e=>{
                const cat = catMeta(e.target.value)
                pf('penalty_category', e.target.value)
                if (cat.owner==='DRIVER')  pf('penalty_type','EMPLOYEE_BORNE')
                if (cat.owner==='COMPANY') pf('penalty_type','COMPANY_BORNE')
              }}>
                <option value="">— Select Category —</option>
                <optgroup label="── Driver / Employee Borne ──">
                  {PEN_CATS.filter(c=>c.owner==='DRIVER').map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
                </optgroup>
                <optgroup label="── Company Borne ──">
                  {PEN_CATS.filter(c=>c.owner==='COMPANY').map(c=><option key={c.value} value={c.value}>{c.label}</option>)}
                </optgroup>
                <option value="OTHER">Other</option>
              </select>
            </div>

            {/* Responsibility badge — auto-set, manual for OTHER */}
            {pForm.penalty_category && (() => {
              const meta = catMeta(pForm.penalty_category)
              const rec  = plateMap[pForm.plate_number]
              const emp  = rec?.emp
              return (
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14, flexWrap:'wrap' }}>
                  <span style={{ fontSize:11, fontWeight:700, color:'#6b7c93' }}>RESPONSIBILITY:</span>
                  <span style={{ padding:'4px 14px', borderRadius:20, fontSize:12, fontWeight:800,
                    background: pForm.penalty_type==='EMPLOYEE_BORNE'?'#ffebee':'#fff3e0',
                    color:      pForm.penalty_type==='EMPLOYEE_BORNE'?'#c62828':'#e65100' }}>
                    {pForm.penalty_type==='EMPLOYEE_BORNE'
                      ? `👤 ${emp?.full_name||emp?.full_name_en||'Driver'} → Payroll Deduction`
                      : '🏢 Company → Accounts Payable'}
                  </span>
                  {meta.owner===null && (
                    <select style={{ ...S.inp, width:'auto', fontSize:12 }} value={pForm.penalty_type} onChange={e=>pf('penalty_type',e.target.value)}>
                      <option value="EMPLOYEE_BORNE">Driver / Employee</option>
                      <option value="COMPANY_BORNE">Company</option>
                    </select>
                  )}
                </div>
              )
            })()}

            {/* Ref # + Violation Date */}
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>Violation Ref # (Saher / Authority)</label>
                <input style={S.inp} value={pForm.violation_ref} onChange={e=>pf('violation_ref',e.target.value)} placeholder="e.g. SAH-20261027-001" />
              </div>
              <div style={S.col}>
                <label style={S.label}>Violation Date *</label>
                <input type="date" style={S.inp} value={pForm.violation_date} onChange={e=>pf('violation_date',e.target.value)} />
              </div>
            </div>

            {/* Amount + Offence */}
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>Amount (SAR) *</label>
                <input type="number" style={S.inp} value={pForm.amount} onChange={e=>pf('amount',e.target.value)} placeholder="0.00" />
              </div>
              <div style={S.col}>
                <label style={S.label}>Offence / Description</label>
                <input style={S.inp} value={pForm.offence} onChange={e=>pf('offence',e.target.value)} placeholder="e.g. Over speeding 25 KM" />
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Posting ───────────────────────────────────── */}
        {penStep === 3 && (() => {
          const meta  = catMeta(pForm.penalty_category)
          const rec   = plateMap[pForm.plate_number]
          const emp   = rec?.emp
          const isEmp = pForm.penalty_type === 'EMPLOYEE_BORNE'
          return (
            <div>
              {/* Summary card at the top of step 3 */}
              <div style={{ background:'#F7F2ED', borderRadius:8, padding:'14px 16px', fontSize:12, color:L3, lineHeight:2, marginBottom:18, border:'1px solid #d7c9ba' }}>
                <div style={{ fontWeight:800, marginBottom:6, fontSize:11, letterSpacing:1, color:'#6b7c93' }}>PENALTY SUMMARY</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2px 20px' }}>
                  <div><strong>Vehicle:</strong> {pForm.plate_number||'—'}</div>
                  {emp && <div><strong>Driver:</strong> {emp.full_name||emp.full_name_en} · {emp.employee_number}</div>}
                  <div><strong>Category:</strong> {meta?.label||'—'}</div>
                  <div><strong>Amount:</strong> <span style={{ fontSize:14, fontWeight:900, color: isEmp?'#c62828':'#e65100' }}>{SAR(+pForm.amount)}</span></div>
                  {pForm.violation_ref  && <div><strong>Ref #:</strong> {pForm.violation_ref}</div>}
                  {pForm.violation_date && <div><strong>Date:</strong> {fmt(pForm.violation_date)}</div>}
                </div>
                <div style={{ marginTop:8, padding:'5px 12px', borderRadius:20, display:'inline-block', fontSize:11, fontWeight:800,
                  background:isEmp?'#ffebee':'#fff3e0', color:isEmp?'#c62828':'#e65100' }}>
                  {isEmp ? `👤 ${emp?.full_name||emp?.full_name_en||'Driver'} → Payroll Deduction` : '🏢 Company → Accounts Payable'}
                </div>
              </div>

              <div style={{ marginBottom:14 }}>
                <label style={S.label}>{isEmp ? 'Payroll Deduction Month' : 'AP Payment Month'}</label>
                <input type="month" style={S.inp} value={pForm.deduction_month} onChange={e=>pf('deduction_month',e.target.value)} />
                <div style={{ fontSize:11, color:'#90a4ae', marginTop:4 }}>
                  {isEmp ? "Fine will be deducted from this employee's payroll run for the selected month."
                         : 'Fine will be recorded as an Accounts Payable entry for the selected month.'}
                </div>
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={S.label}>Notes</label>
                <textarea style={{ ...S.inp, height:52, resize:'vertical' }} value={pForm.notes} onChange={e=>pf('notes',e.target.value)} />
              </div>
            </div>
          )
        })()}
      </FormShell>
    </div>
  )
}
