/**
 * MONEY REQUEST FORM  — /forms/money-request  (v4)
 * Mobile-first 4-screen wizard  (same pattern as FormOvertime)
 *
 * Screen 1 — Who's Requesting  (dept → requestor → date)
 * Screen 2 — Payment Lines     (party, expense, project, amount per line)
 * Screen 3 — Review & Submit   (summary + budget check + submit)
 * Screen 4 — Success
 *
 * No login required. Department selection resolves entity_id.
 */
import { useState, useEffect } from 'react'
import { supabase }            from '../lib/supabase'
import { printDocument }       from '../lib/templatePrint'

// ── Dev mode ────────────────────────────────────────────────────────────────
const devMode = new URLSearchParams(window.location.search).get('dev') === '1' ||
                localStorage.getItem('accsys_dev_mode') === '1'

// ── Theme ────────────────────────────────────────────────────────────────────
const TH = {
  navy:      '#1a237e',
  navyDark:  '#0d1b5e',
  navyLight: '#3949ab',
  gold:      '#f59e0b',
  goldLight: '#fde68a',
  goldDark:  '#92400e',
  cream:     '#fefce8',
  white:     '#ffffff',
  bg:        '#f1f5f9',
  text:      '#0f172a',
  sub:       '#475569',
  muted:     '#94a3b8',
  red:       '#b91c1c',
  green:     '#15803d',
  greenBg:   '#dcfce7',
}

// ── Constants ────────────────────────────────────────────────────────────────
const PARTY_TYPES = [
  { value:'Employee',       label:'Employee'        },
  { value:'Contractor',     label:'Contractor'      },
  { value:'Supplier',       label:'Supplier'        },
  { value:'Vendor',         label:'Vendor'          },
  { value:'Sub-Contractor', label:'Sub-Contractor'  },
  { value:'Local Supplier', label:'Local Supplier'  },
  { value:'Petty Cash',     label:'Petty Cash'      },
]
const VENDOR_TYPE_MAP = {
  'Contractor':     'CONTRACTOR',
  'Supplier':       'SUPPLIER',
  'Vendor':         'VENDOR',
  'Sub-Contractor': 'SUB_CONTRACTOR',
  'Local Supplier': 'LOCAL_SUPPLIER',
}
const TXN_TYPES = [
  { v:'Cash',          l:'Cash'          },
  { v:'Cheque',        l:'Cheque'        },
  { v:'Bank-Transfer', l:'Bank Transfer' },
  { v:'Online',        l:'Online'        },
  { v:'Others',        l:'Others'        },
]
const MR_EXPENSE_TYPES = [
  { code:'SUBCON_TRAVEL',   name:'Sub-Con Team Travelling'    },
  { code:'MATERIAL_PURCH',  name:'Material Purchasing'        },
  { code:'CAR_REPAIRS',     name:'Car Repairs'                },
  { code:'TEAM_MATERIAL',   name:'Team & Material Expenses'   },
  { code:'IQAMA_RENEWAL',   name:'Iqama Renewal'              },
  { code:'IQAMA_LEVY',      name:'Iqama Levy Fees'            },
  { code:'PETTY_CASH_EXP',  name:'Petty Cash'                 },
  { code:'WATER_VILLA',     name:'Water for Villa'            },
  { code:'WATER_OFFICE',    name:'Water for Office'           },
  { code:'STATIONARY',      name:'Stationary'                 },
  { code:'EXCAVATION_FUEL', name:'Excavation Petrol / Diesel' },
  { code:'OTHER',           name:'Other'                      },
]

function pettyCashIban(dept='') {
  const d = dept.toUpperCase()
  if (d.includes('TISU')) return 'ANB-77'
  if (d.includes('NISU') || d.includes('CISU') || d.includes('ITSU')) return 'ANB-39'
  return ''
}
function pettyCashLabel(dept='') {
  const d = dept.toUpperCase()
  if (d.includes('TISU')) return 'Tech-3 (ANB-77)'
  if (d.includes('NISU') || d.includes('CISU') || d.includes('ITSU')) return 'Tech-2 (ANB-39)'
  return 'Petty Cash'
}

const EMPTY_LINE = {
  party_type:'', party_id:'', party_name:'',
  payment_type:'', expense_type:'', project_id:'',
  iban:'', iban_options:[], amount:'', remarks:'',
}

// ── Shared style helpers ─────────────────────────────────────────────────────
const page = (bg='#f1f5f9') => ({
  minHeight:'100vh', background:bg, display:'flex', flexDirection:'column',
  fontFamily:"'Segoe UI',Arial,sans-serif", maxWidth:480, margin:'0 auto',
})
const header = {
  background: TH.navyDark,
  padding:'16px 18px 14px',
  display:'flex', alignItems:'center', justifyContent:'space-between',
}
const pill = (active) => ({
  width:28, height:8, borderRadius:4,
  background: active ? TH.gold : 'rgba(255,255,255,0.25)',
  transition:'background 0.2s',
})
const card = {
  background:TH.white, borderRadius:14, margin:'10px 14px 0',
  padding:'16px 16px', boxShadow:'0 1px 6px rgba(0,0,0,0.08)',
  border:`1px solid #e2e8f0`,
}
const lbl = {
  fontSize:10, color:TH.sub, fontWeight:700,
  textTransform:'uppercase', letterSpacing:'0.6px', marginBottom:5, display:'block',
}
const inp = (extra={}) => ({
  width:'100%', padding:'12px 13px', background:'#fff',
  border:`1.5px solid #e2e8f0`, borderRadius:10,
  fontSize:14, color:TH.text, boxSizing:'border-box',
  fontFamily:'inherit', ...extra,
})
const row2 = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 12px', marginBottom:12 }
const btnRow = {
  display:'flex', gap:10, padding:'14px 14px 20px',
  marginTop:'auto',
}
const btn = (bg, color='#fff') => ({
  flex:1, height:52, background:bg, color, border:'none',
  borderRadius:12, fontSize:15, fontWeight:800,
  cursor:'pointer', fontFamily:'inherit', letterSpacing:'0.3px',
})

// ── Screen header component ──────────────────────────────────────────────────
function Header({ step, title, sub, lang, setLang }) {
  return (
    <div style={header}>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ fontSize:26 }}>💰</div>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:TH.white, letterSpacing:'0.5px' }}>
            MONEY REQUEST
          </div>
          {sub && <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', marginTop:1 }}>{sub}</div>}
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
        <button onClick={()=>setLang(l=>l==='en'?'ar':'en')} style={{
          background:'rgba(255,255,255,0.15)', border:'none', color:TH.white,
          borderRadius:6, padding:'4px 10px', fontSize:11, cursor:'pointer',
        }}>
          {lang==='en' ? 'عربي' : 'EN'}
        </button>
        <div style={{ display:'flex', gap:5 }}>
          {[1,2,3].map(s=><div key={s} style={pill(step>=s)} />)}
        </div>
      </div>
    </div>
  )
}

// ── Section title ────────────────────────────────────────────────────────────
function SecTitle({ icon, title }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, margin:'14px 14px 2px',
      borderBottom:`2px solid ${TH.gold}`, paddingBottom:8 }}>
      <span style={{ fontSize:16 }}>{icon}</span>
      <span style={{ fontSize:12, fontWeight:800, color:TH.navy, textTransform:'uppercase', letterSpacing:'0.7px' }}>
        {title}
      </span>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function FormMoneyRequest() {
  const [step, setStep] = useState(1) // 1=who 2=lines 3=review 4=success

  // Reference data
  const [depts,          setDepts]          = useState([])
  const [allContractors, setAllContractors] = useState([])
  const [allProjects,    setAllProjects]    = useState([])
  const [lineEmployees,  setLineEmployees]  = useState([])
  const [deptEmployees,  setDeptEmployees]  = useState([])
  const [dataLoading,    setDataLoading]    = useState(true)
  const [deptLoading,    setDeptLoading]    = useState(false)

  // Header fields
  const [lang,    setLang]    = useState('en')
  const [reqDate, setReqDate] = useState(new Date().toISOString().split('T')[0])
  const [deptId,  setDeptId]  = useState('')
  const [dept,    setDept]    = useState('')
  const [deptEntityId, setDeptEntityId] = useState('')
  const [empId,   setEmpId]   = useState('')

  // Lines
  const [lines, setLines] = useState([{ ...EMPTY_LINE }])

  // Submit state
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')
  const [reqNumber,  setReqNumber]  = useState('')

  const isAr = lang === 'ar'
  const totalAmount = lines.reduce((s,l)=>s+(parseFloat(l.amount)||0), 0)
  const selectedEmp = deptEmployees.find(e=>e.id===empId)

  // ── Load reference data ───────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setDataLoading(true)
      const [{ data:deps }, { data:cons }, { data:projs }] = await Promise.all([
        supabase.from('departments').select('id,dept_code,dept_name,dept_head_id,pm_id,supervisor_id,entity_id').eq('is_active',true).order('dept_code'),
        supabase.from('contractors').select('id,contractor_name,vendor_type').eq('status','ACTIVE').order('contractor_name'),
        supabase.from('projects').select('id,project_number,project_name,department_id,contract_value').in('status',['OPEN','ACTIVE']).order('project_number'),
      ])
      // Deduplicate by dept_code — guard against duplicate DB rows
      const seen = new Set()
      setDepts((deps||[]).filter(d=>{ const k=d.dept_code||d.dept_name; return seen.has(k)?false:seen.add(k) }))
      setAllContractors(cons||[])
      setAllProjects(projs||[])
      setDataLoading(false)
    }
    load()
  }, [])

  // ── Dept change ───────────────────────────────────────────────────────────
  async function onDeptChange(newId) {
    const obj = depts.find(d=>d.id===newId)
    const code = obj?.dept_code || obj?.dept_name || ''
    setDeptId(newId); setDept(code); setDeptEntityId(obj?.entity_id||'')
    setEmpId(''); setDeptEmployees([]); setLineEmployees([])
    if (!newId) return
    // Re-resolve petty cash lines
    setLines(prev=>prev.map(l=>
      l.party_type==='Petty Cash'
        ? {...l, party_name:pettyCashLabel(code), iban:pettyCashIban(code)}
        : l
    ))
    // All dept employees (for line party picker)
    supabase.from('employees').select('id,full_name_en,iban').eq('department_id',newId).order('full_name_en')
      .then(({data})=>setLineEmployees(data||[]))
    // Requestor list (Dept Head / PM / Supervisor)
    setDeptLoading(true)
    const roleMap=[
      {id:obj?.dept_head_id, roleLabel:'Dept Head'},
      {id:obj?.pm_id,        roleLabel:'PM'},
      {id:obj?.supervisor_id,roleLabel:'Supervisor'},
    ]
    const fkIds = roleMap.map(r=>r.id).filter(Boolean)
    if (fkIds.length) {
      const {data:byFk} = await supabase.from('employees').select('id,full_name_en,iban').in('id',fkIds)
      if (byFk?.length) {
        const result = roleMap.filter(r=>r.id).map(r=>{
          const e=byFk.find(x=>x.id===r.id); return e?{...e,roleLabel:r.roleLabel}:null
        }).filter(Boolean)
        if (result.length) { setDeptEmployees(result); setDeptLoading(false); return }
      }
    }
    const {data:byDept} = await supabase.from('employees').select('id,full_name_en,iban').eq('department_id',newId).order('full_name_en')
    setDeptEmployees((byDept||[]).map(e=>({...e,roleLabel:''})))
    setDeptLoading(false)
  }

  // ── Line helpers ──────────────────────────────────────────────────────────
  function updateLine(idx, patch) {
    setLines(prev=>prev.map((l,i)=>i===idx?{...l,...patch}:l))
  }
  async function handlePartySelect(idx, partyType, partyId, partyName) {
    if (partyType==='Petty Cash') {
      updateLine(idx,{party_type:'Petty Cash',party_id:'',party_name:pettyCashLabel(dept),iban:pettyCashIban(dept),iban_options:[]})
      return
    }
    if (partyType==='Employee') {
      const emp = lineEmployees.find(e=>e.id===partyId)
      updateLine(idx,{party_type:partyType,party_id:partyId,party_name:partyName,iban:emp?.iban||'',iban_options:[]})
      return
    }
    updateLine(idx,{party_type:partyType,party_id:partyId,party_name:partyName,iban:'',iban_options:[]})
    if (!partyId) return
    const {data:banks} = await supabase.from('party_bank_accounts').select('id,iban,bank_name,is_primary').eq('contractor_id',partyId).order('is_primary',{ascending:false})
    if (!banks?.length) return
    banks.length===1
      ? updateLine(idx,{iban:banks[0].iban,iban_options:[]})
      : updateLine(idx,{iban:banks[0].iban,iban_options:banks})
  }
  function addLine()       { setLines(prev=>[...prev,{...EMPTY_LINE}]) }
  function removeLine(idx) { if (lines.length>1) setLines(prev=>prev.filter((_,i)=>i!==idx)) }

  // ── Validate per screen ───────────────────────────────────────────────────
  function validateStep1() {
    if (!deptId) { setError(isAr?'الرجاء اختيار القسم':'Please select department'); return false }
    if (!empId)  { setError(isAr?'الرجاء اختيار مقدم الطلب':'Please select the requestor'); return false }
    setError(''); return true
  }
  function validateStep2() {
    const valid = lines.filter(l=>parseFloat(l.amount)>0)
    if (!valid.length) { setError(isAr?'أضف سطراً واحداً على الأقل بمبلغ':'Add at least one line with an amount'); return false }
    setError(''); return true
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submit() {
    setSubmitting(true); setError('')
    const validLines = lines.filter(l=>parseFloat(l.amount)>0)
    // Budget check
    const projectAmounts = {}
    validLines.forEach(l=>{ if(l.project_id) projectAmounts[l.project_id]=(projectAmounts[l.project_id]||0)+(parseFloat(l.amount)||0) })
    for (const [projId,reqAmt] of Object.entries(projectAmounts)) {
      const proj   = allProjects.find(p=>p.id===projId)
      const budget = parseFloat(proj?.contract_value)||0
      if (!budget) continue
      const {data:allLineAmts} = await supabase.from('money_request_lines').select('amount,money_request_id').eq('project_id',projId)
      let committed=0
      if (allLineAmts?.length) {
        const mrIdList=[...new Set(allLineAmts.map(l=>l.money_request_id))]
        const {data:activeMRs} = await supabase.from('money_requests').select('id').in('id',mrIdList).not('status','in','("REJECTED","CANCELLED","FUNDS_SENT")')
        const activeSet=new Set((activeMRs||[]).map(m=>m.id))
        committed=allLineAmts.filter(l=>activeSet.has(l.money_request_id)).reduce((s,l)=>s+(parseFloat(l.amount)||0),0)
      }
      const limit=budget*0.5
      if (committed+reqAmt>limit) {
        const rem=Math.max(0,limit-committed)
        setError(`⚠️ Budget Limit — ${proj.project_number}: 50% cap SAR ${limit.toLocaleString()}, committed SAR ${committed.toLocaleString()}, available SAR ${rem.toLocaleString()}.`)
        setSubmitting(false); return
      }
    }
    const isAutoApproved = selectedEmp?.roleLabel==='Dept Head'
    const firstLine = validLines[0]
    const expLabel = MR_EXPENSE_TYPES.find(t=>t.code===firstLine.expense_type)?.name||firstLine.expense_type||''
    const autoPurpose = [expLabel, firstLine.party_type].filter(Boolean).join(' — ')||`${dept} Money Request`
    const {data:hdr, error:hErr} = await supabase.from('money_requests').insert({
      entity_id:       deptEntityId||null,
      request_date:    reqDate,
      requested_by:    empId,
      department_id:   deptId,
      department_name: dept,
      purpose:         autoPurpose,
      amount:          totalAmount,
      status:          isAutoApproved?'DH_APPROVED':'PENDING',
    }).select('id,request_number').single()
    if (hErr) { setSubmitting(false); setError(hErr.message); return }
    const lineRows = validLines.map((l,i)=>({
      money_request_id: hdr.id, sort_order:i,
      line_type:     l.payment_type||null, supplier_name:l.party_name||null,
      account_code:  l.expense_type||null, iban:l.iban||null,
      amount:        parseFloat(l.amount)||0,
    }))
    const {error:lErr} = await supabase.from('money_request_lines').insert(lineRows)
    if (lErr) { setSubmitting(false); setError(lErr.message); return }
    // Print + Drive save
    try {
      const printLines = validLines.map(ln=>({
        party_type:ln.party_type||'', party_name:ln.party_name||'',
        expense_type:MR_EXPENSE_TYPES.find(t=>t.code===ln.expense_type)?.name||ln.expense_type||'',
        payment_type:ln.payment_type||'',
        project_number:allProjects.find(p=>p.id===ln.project_id)?.project_number||'',
        amount:parseFloat(ln.amount)||0, iban:ln.iban||'', remarks:ln.remarks||'',
      }))
      const mrNo=hdr.request_number||hdr.id
      const [rYr,rMo,rDy]=(reqDate||'').split('-')
      const dateStr=rDy&&rMo&&rYr?`${rDy}${rMo}${rYr.slice(2)}`:''
      printDocument('money_request',{
        request_number:hdr.request_number||'', request_date:reqDate||'',
        department:dept||'', purpose:autoPurpose||'',
        project_numbers:[...new Set(printLines.map(l=>l.project_number).filter(Boolean))],
        recipient_name:'Mahmood Shahbaz', recipient_title:'The General Manager',
        recipient_company:'Ratal Advanced Technologies',
        requested_by_name:selectedEmp?.full_name_en||'',
        requested_by_role:selectedEmp?.roleLabel||'Department Staff',
        lines:printLines,
      },{driveFolder:'money-requests',driveFileName:`Money Request-${mrNo}-${dateStr}.pdf`,mrId:hdr.id,autoRun:true,autoOnly:true,requestDate:reqDate||''})
    } catch(_){}
    setSubmitting(false)
    setReqNumber(hdr.request_number||'—')
    setStep(4)
  }

  function reset() {
    setStep(1); setDeptId(''); setDept(''); setEmpId('')
    setDeptEmployees([]); setLineEmployees([])
    setLines([{...EMPTY_LINE}]); setError('')
    setReqDate(new Date().toISOString().split('T')[0])
  }

  const visibleProjects = deptId
    ? allProjects.filter(p=>!p.department_id||p.department_id===deptId)
    : allProjects

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN 4 — SUCCESS
  // ════════════════════════════════════════════════════════════════════════════
  if (step===4) return (
    <div style={{...page(TH.navyDark), alignItems:'center', justifyContent:'center', padding:24}}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:64, marginBottom:16 }}>✅</div>
        <div style={{ fontSize:22, fontWeight:800, color:TH.white, marginBottom:8 }}>
          {isAr?'تم الإرسال بنجاح!':'Request Submitted!'}
        </div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.6)', marginBottom:24 }}>
          {isAr?'رقم الطلب':'Request No.'}
        </div>
        <div style={{ fontSize:28, fontWeight:800, color:TH.gold, background:'rgba(255,255,255,0.08)',
          borderRadius:12, padding:'12px 28px', marginBottom:10 }}>
          {reqNumber}
        </div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginBottom:8 }}>
          {dept} · {selectedEmp?.full_name_en||''}
        </div>
        <div style={{ fontSize:18, fontWeight:800, color:TH.gold, marginBottom:32 }}>
          SAR {totalAmount.toLocaleString('en',{minimumFractionDigits:2})}
        </div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginBottom:32 }}>
          {isAr?'جارٍ حفظ المستند في Google Drive…':'Saving document to Google Drive…'}
        </div>
        <button onClick={reset} style={{
          background:TH.gold, color:TH.navyDark, border:'none', borderRadius:12,
          padding:'14px 36px', fontSize:15, fontWeight:800, cursor:'pointer', fontFamily:'inherit',
        }}>
          {isAr?'طلب جديد':'+ New Request'}
        </button>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN 1 — WHO'S REQUESTING
  // ════════════════════════════════════════════════════════════════════════════
  if (step===1) return (
    <div style={page(TH.bg)}>
      <Header step={1} title="MONEY REQUEST" sub={dept||'Ratal Group'} lang={lang} setLang={setLang} />

      {devMode && (
        <div style={{ background:'#fff3e0', border:'2px dashed #fb8c00', margin:'12px 14px 0',
          borderRadius:8, padding:'8px 12px', fontSize:12, color:'#e65100', fontWeight:700 }}>
          🛠️ Dev Mode — no QR required
        </div>
      )}

      {error && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', margin:'10px 14px 0',
          borderRadius:8, padding:'10px 14px', fontSize:13, color:TH.red, fontWeight:600 }}>
          {error}
        </div>
      )}

      {/* Step label */}
      <div style={{ margin:'16px 14px 0', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:28, height:28, borderRadius:'50%', background:TH.navy,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:13, fontWeight:800, color:TH.white, flexShrink:0 }}>1</div>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:TH.navy }}>
            {isAr?'معلومات مقدم الطلب':"Who's Requesting"}
          </div>
          <div style={{ fontSize:11, color:TH.muted }}>{isAr?'القسم والشخص والتاريخ':'Department · Person · Date'}</div>
        </div>
      </div>

      <SecTitle icon="📅" title={isAr?'التاريخ':'Date'} />
      <div style={card}>
        <label style={lbl}>{isAr?'تاريخ الطلب':'Request Date'}</label>
        <input type="date" style={inp()} value={reqDate} onChange={e=>setReqDate(e.target.value)} />
      </div>

      <SecTitle icon="🏢" title={isAr?'القسم':'Department'} />
      <div style={card}>
        <label style={lbl}>{isAr?'اختر القسم':'Select Department'} *</label>
        <select style={inp()} value={deptId} onChange={e=>onDeptChange(e.target.value)} disabled={dataLoading}>
          <option value="">{dataLoading?(isAr?'جاري التحميل…':'Loading…'):`-- ${isAr?'اختر':'Select'} --`}</option>
          {depts.map(d=><option key={d.id} value={d.id}>{d.dept_code||d.dept_name}</option>)}
        </select>
      </div>

      <SecTitle icon="👤" title={isAr?'مقدم الطلب':'Requested By'} />
      <div style={card}>
        <label style={lbl}>{isAr?'المدير / المشرف / رئيس القسم':'DH / PM / Supervisor'} *</label>
        <select style={inp({ opacity:deptId?1:0.6, background:deptId?'#fff':'#f8fafd' })}
          value={empId} onChange={e=>setEmpId(e.target.value)}
          disabled={!deptId||deptLoading}>
          <option value="">
            {deptLoading?(isAr?'جاري التحميل…':'Loading…')
              :deptId?`-- ${isAr?'اختر':'Select'} --`
              :(isAr?'← اختر القسم أولاً':'← Select dept first')}
          </option>
          {deptEmployees.map(e=>(
            <option key={e.id} value={e.id}>
              {e.full_name_en}{e.roleLabel?` (${e.roleLabel})`:''}
            </option>
          ))}
        </select>
        {selectedEmp?.roleLabel==='Dept Head' && (
          <div style={{ marginTop:8, fontSize:11, color:TH.green, fontWeight:700 }}>
            ✓ {isAr?'رئيس القسم — سيُعتمد الطلب تلقائياً':'Dept Head — request auto-approved'}
          </div>
        )}
      </div>

      <div style={{ flex:1 }} />
      <div style={btnRow}>
        <button style={btn(TH.navy)} onClick={()=>{ if(validateStep1()) setStep(2) }}>
          {isAr?'التالي — بنود الطلب →':'Next — Payment Lines →'}
        </button>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN 2 — PAYMENT LINES
  // ════════════════════════════════════════════════════════════════════════════
  if (step===2) return (
    <div style={page('#0f172a')}>
      <Header step={2} title="MONEY REQUEST" sub={`${dept} · ${selectedEmp?.full_name_en||''}`} lang={lang} setLang={setLang} />

      {/* Running total strip */}
      <div style={{ background:TH.gold, padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:11, fontWeight:700, color:TH.goldDark, textTransform:'uppercase', letterSpacing:'0.5px' }}>
          {isAr?'الإجمالي الحالي':'Running Total'}
        </span>
        <span style={{ fontSize:20, fontWeight:800, color:TH.navyDark }}>
          SAR {totalAmount.toLocaleString('en',{minimumFractionDigits:2})}
        </span>
      </div>

      {error && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', margin:'10px 14px 0',
          borderRadius:8, padding:'10px 14px', fontSize:13, color:TH.red, fontWeight:600 }}>
          {error}
        </div>
      )}

      {/* Step label */}
      <div style={{ margin:'14px 14px 0', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:28, height:28, borderRadius:'50%', background:TH.gold,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:13, fontWeight:800, color:TH.navyDark, flexShrink:0 }}>2</div>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:TH.white }}>
            {isAr?'بنود الطلب':'Payment Lines'}
          </div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>
            {lines.length} {isAr?'سطر':'line'}{lines.length!==1?'s':''}
          </div>
        </div>
      </div>

      {/* Line cards */}
      <div style={{ flex:1, overflowY:'auto', paddingBottom:8 }}>
        {lines.map((line,idx)=>(
          <LineCard
            key={idx} idx={idx} line={line}
            employees={lineEmployees}
            contractors={allContractors}
            projects={visibleProjects}
            dept={dept} isAr={isAr}
            onUpdate={p=>updateLine(idx,p)}
            onPartySelect={(pt,pid,pn)=>handlePartySelect(idx,pt,pid,pn)}
            onRemove={()=>removeLine(idx)}
            canRemove={lines.length>1}
          />
        ))}

        {/* Add line button */}
        <button onClick={addLine} style={{
          display:'block', width:'calc(100% - 28px)', margin:'10px 14px',
          padding:'13px', background:'rgba(255,255,255,0.08)',
          border:`1.5px dashed ${TH.gold}`, borderRadius:12,
          fontSize:14, fontWeight:700, color:TH.gold, cursor:'pointer',
          fontFamily:'inherit',
        }}>
          + {isAr?'إضافة سطر':'Add Line'}
        </button>
      </div>

      <div style={btnRow}>
        <button style={btn(TH.red)} onClick={()=>{ setError(''); setStep(1) }}>
          {isAr?'← رجوع':'← Back'}
        </button>
        <button style={btn(TH.gold, TH.navyDark)} onClick={()=>{ if(validateStep2()) setStep(3) }}>
          {isAr?'المراجعة →':'Review →'}
        </button>
      </div>
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // SCREEN 3 — REVIEW & SUBMIT
  // ════════════════════════════════════════════════════════════════════════════
  const validLines = lines.filter(l=>parseFloat(l.amount)>0)
  return (
    <div style={page(TH.bg)}>
      <Header step={3} title="MONEY REQUEST" sub="Review & Submit" lang={lang} setLang={setLang} />

      {error && (
        <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', margin:'10px 14px 0',
          borderRadius:8, padding:'10px 14px', fontSize:13, color:TH.red, fontWeight:600 }}>
          {error}
        </div>
      )}

      {/* Step label */}
      <div style={{ margin:'16px 14px 0', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:28, height:28, borderRadius:'50%', background:TH.green,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:13, fontWeight:800, color:TH.white, flexShrink:0 }}>3</div>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:TH.navy }}>
            {isAr?'مراجعة الطلب':'Review Request'}
          </div>
          <div style={{ fontSize:11, color:TH.muted }}>{isAr?'تأكيد التفاصيل قبل الإرسال':'Confirm details before submitting'}</div>
        </div>
      </div>

      {/* Requestor summary */}
      <SecTitle icon="👤" title={isAr?'مقدم الطلب':'Requestor'} />
      <div style={card}>
        <div style={row2}>
          <div>
            <div style={lbl}>{isAr?'التاريخ':'Date'}</div>
            <div style={{ fontSize:14, fontWeight:700, color:TH.text }}>{reqDate}</div>
          </div>
          <div>
            <div style={lbl}>{isAr?'القسم':'Dept'}</div>
            <div style={{ fontSize:14, fontWeight:700, color:TH.navy }}>{dept}</div>
          </div>
        </div>
        <div>
          <div style={lbl}>{isAr?'مقدم الطلب':'Requested By'}</div>
          <div style={{ fontSize:14, fontWeight:700, color:TH.text }}>
            {selectedEmp?.full_name_en}
            {selectedEmp?.roleLabel&&<span style={{ fontSize:11, color:TH.muted, marginLeft:6 }}>({selectedEmp.roleLabel})</span>}
          </div>
        </div>
      </div>

      {/* Lines summary */}
      <SecTitle icon="📋" title={isAr?`بنود الطلب (${validLines.length})`:`Lines (${validLines.length})`} />
      <div style={card}>
        {validLines.map((l,i)=>{
          const proj = allProjects.find(p=>p.id===l.project_id)
          const exp  = MR_EXPENSE_TYPES.find(t=>t.code===l.expense_type)
          return (
            <div key={i} style={{ paddingBottom:10, marginBottom:i<validLines.length-1?10:0,
              borderBottom:i<validLines.length-1?'1px solid #f1f5f9':'' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:3 }}>
                <div>
                  <span style={{ fontSize:12, fontWeight:700, color:TH.navy }}>
                    {l.party_type}{l.party_name?` — ${l.party_name}`:''}
                  </span>
                  {l.payment_type&&<span style={{ fontSize:11, color:TH.muted, marginLeft:6 }}>[{l.payment_type}]</span>}
                </div>
                <div style={{ fontSize:15, fontWeight:800, color:TH.navy, whiteSpace:'nowrap', marginLeft:8 }}>
                  SAR {(parseFloat(l.amount)||0).toLocaleString('en',{minimumFractionDigits:2})}
                </div>
              </div>
              <div style={{ fontSize:11, color:TH.sub }}>
                {exp?.name||l.expense_type||'—'}
                {proj&&<span style={{ color:TH.muted }}> · {proj.project_number}</span>}
              </div>
              {l.iban&&<div style={{ fontSize:11, color:TH.green, fontFamily:'monospace', marginTop:2 }}>{l.iban}</div>}
              {l.remarks&&<div style={{ fontSize:11, color:TH.muted, marginTop:2 }}>📝 {l.remarks}</div>}
            </div>
          )
        })}

        {/* Total */}
        <div style={{ borderTop:`2px solid ${TH.navy}`, paddingTop:12, marginTop:4,
          display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontSize:13, fontWeight:700, color:TH.navy, textTransform:'uppercase' }}>
            {isAr?'الإجمالي':'Total'}
          </span>
          <span style={{ fontSize:20, fontWeight:800, color:TH.navy }}>
            SAR {totalAmount.toLocaleString('en',{minimumFractionDigits:2})}
          </span>
        </div>
      </div>

      {/* Approval note */}
      <div style={{ margin:'10px 14px 0', background:selectedEmp?.roleLabel==='Dept Head'?TH.greenBg:'#fffbeb',
        border:`1px solid ${selectedEmp?.roleLabel==='Dept Head'?'#86efac':'#fcd34d'}`,
        borderRadius:8, padding:'10px 14px', fontSize:12,
        color:selectedEmp?.roleLabel==='Dept Head'?TH.green:'#92400e', fontWeight:600 }}>
        {selectedEmp?.roleLabel==='Dept Head'
          ? (isAr?'✓ سيُعتمد تلقائياً (رئيس القسم)':'✓ Auto-approved — submitted by Dept Head')
          : (isAr?'⏳ يحتاج موافقة رئيس القسم':'⏳ Pending DH approval')}
      </div>

      <div style={{ flex:1 }} />
      <div style={btnRow}>
        <button style={btn(TH.red)} onClick={()=>{ setError(''); setStep(2) }} disabled={submitting}>
          {isAr?'← رجوع':'← Back'}
        </button>
        <button style={btn(TH.green)} onClick={submit} disabled={submitting}>
          {submitting?(isAr?'جاري الإرسال…':'Submitting…'):(isAr?'إرسال الطلب ✓':'Submit ✓')}
        </button>
      </div>
    </div>
  )
}

// ── Line Card component ───────────────────────────────────────────────────────
function LineCard({ idx, line, employees, contractors, projects, dept, isAr, onUpdate, onPartySelect, onRemove, canRemove }) {
  const s = inp({ padding:'11px 12px', fontSize:13 })
  const vendorType = VENDOR_TYPE_MAP[line.party_type]
  const partyCons  = vendorType ? contractors.filter(c=>(c.vendor_type||'CONTRACTOR')===vendorType) : []

  const accent = idx%2===0 ? '#3949ab' : '#6d28d9'
  return (
    <div style={{ margin:'10px 14px 0', background:'#1e293b', borderRadius:14,
      border:`1px solid ${accent}44`, overflow:'hidden' }}>
      {/* Card header */}
      <div style={{ background:accent, padding:'10px 14px',
        display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:12, fontWeight:800, color:'#fff', letterSpacing:'0.5px' }}>
          💳 {isAr?`السطر ${idx+1}`:`LINE ${idx+1}`}
          {line.amount?` — SAR ${parseFloat(line.amount).toLocaleString()}` : ''}
        </span>
        {canRemove&&(
          <button onClick={onRemove} style={{ background:'rgba(255,255,255,0.15)', border:'none',
            color:'#fff', borderRadius:6, padding:'3px 10px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            ✕
          </button>
        )}
      </div>

      {/* Fields */}
      <div style={{ padding:'14px 14px', display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div>
            <label style={{ ...lbl, color:'#94a3b8' }}>{isAr?'نوع الطرف':'Party Type'} *</label>
            <select style={{ ...s, background:'#0f172a', color:'#f1f5f9', border:'1.5px solid #334155' }}
              value={line.party_type} onChange={e=>onPartySelect(e.target.value,'','')}>
              <option value="">{isAr?'-- اختر --':'-- Select --'}</option>
              {PARTY_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label style={{ ...lbl, color:'#94a3b8' }}>{isAr?'نوع المعاملة':'Txn Type'}</label>
            <select style={{ ...s, background:'#0f172a', color:'#f1f5f9', border:'1.5px solid #334155' }}
              value={line.payment_type} onChange={e=>onUpdate({payment_type:e.target.value})}>
              <option value="">{isAr?'-- اختر --':'-- Select --'}</option>
              {TXN_TYPES.map(t=><option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </div>
        </div>

        {/* Name / Party */}
        <div>
          <label style={{ ...lbl, color:'#94a3b8' }}>{isAr?'الاسم':'Name / Party'} *</label>
          {line.party_type==='Employee'&&(
            <select style={{ ...s, background:'#0f172a', color:'#f1f5f9', border:'1.5px solid #334155' }}
              value={line.party_id} onChange={e=>{
                const emp=employees.find(x=>x.id===e.target.value)
                onPartySelect('Employee',e.target.value,emp?.full_name_en||'')
              }}>
              <option value="">{isAr?'-- اختر موظفاً --':'-- Select Employee --'}</option>
              {employees.map(e=><option key={e.id} value={e.id}>{e.full_name_en}</option>)}
            </select>
          )}
          {vendorType&&(
            <select style={{ ...s, background:'#0f172a', color:'#f1f5f9', border:'1.5px solid #334155' }}
              value={line.party_id} onChange={e=>{
                const c=contractors.find(x=>x.id===e.target.value)
                onPartySelect(line.party_type,e.target.value,c?.contractor_name||'')
              }}>
              <option value="">{isAr?'-- اختر --':'-- Select --'}</option>
              {partyCons.map(c=><option key={c.id} value={c.id}>{c.contractor_name}</option>)}
            </select>
          )}
          {line.party_type==='Petty Cash'&&(
            <div style={{ ...s, background:'#064e3b', color:'#6ee7b7', border:'1.5px solid #059669',
              borderRadius:10, display:'flex', alignItems:'center', minHeight:44 }}>
              🏦 {line.party_name||pettyCashLabel(dept)}
            </div>
          )}
          {!line.party_type&&(
            <div style={{ ...s, background:'#0f172a', color:'#475569', borderRadius:10,
              border:'1.5px solid #334155', display:'flex', alignItems:'center', minHeight:44 }}>
              {isAr?'← اختر النوع أولاً':'← Select type first'}
            </div>
          )}
        </div>

        {/* Expense type + Project */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div>
            <label style={{ ...lbl, color:'#94a3b8' }}>{isAr?'نوع المصروف':'Expense Type'} *</label>
            <select style={{ ...s, background:'#0f172a', color:'#f1f5f9', border:'1.5px solid #334155' }}
              value={line.expense_type} onChange={e=>onUpdate({expense_type:e.target.value})}>
              <option value="">{isAr?'-- اختر --':'-- Select --'}</option>
              {MR_EXPENSE_TYPES.map(t=><option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ ...lbl, color:'#94a3b8' }}>{isAr?'المشروع':'Project'}</label>
            <select style={{ ...s, background:'#0f172a', color:'#f1f5f9', border:'1.5px solid #334155' }}
              value={line.project_id} onChange={e=>onUpdate({project_id:e.target.value})}>
              <option value="">{isAr?'-- اختر --':'-- Select --'}</option>
              {projects.map(p=><option key={p.id} value={p.id}>{p.project_number?`[${p.project_number}] `:''}{p.project_name}</option>)}
            </select>
          </div>
        </div>

        {/* IBAN */}
        <div>
          <label style={{ ...lbl, color:'#94a3b8' }}>IBAN / Account</label>
          {line.iban_options?.length>1?(
            <select style={{ ...s, background:'#064e3b', color:'#6ee7b7', border:'1.5px solid #059669' }}
              value={line.iban} onChange={e=>onUpdate({iban:e.target.value})}>
              {line.iban_options.map(b=><option key={b.id} value={b.iban}>{b.iban}{b.bank_name?` — ${b.bank_name}`:''}{b.is_primary?' ★':''}</option>)}
            </select>
          ):(
            <input style={{ ...s, background:line.iban?'#064e3b':'#0f172a',
              color:line.iban?'#6ee7b7':'#475569', border:'1.5px solid #334155',
              fontFamily:line.iban?'monospace':'inherit', fontWeight:line.iban?700:400 }}
              value={line.iban} placeholder={isAr?'تلقائي / SA…':'Auto-filled / SA…'}
              onChange={e=>onUpdate({iban:e.target.value})} />
          )}
        </div>

        {/* Amount + Remarks */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div>
            <label style={{ ...lbl, color:'#fde68a' }}>{isAr?'المبلغ (ريال)':'Amount (SAR)'} *</label>
            <input type="number" step="0.01" min="0"
              style={{ ...s, background:line.amount?'#1e3a5f':'#0f172a',
                color:line.amount?'#fde68a':'#94a3b8', border:`1.5px solid ${line.amount?TH.gold:'#334155'}`,
                textAlign:'right', fontSize:16, fontWeight:800 }}
              value={line.amount} placeholder="0.00"
              onChange={e=>onUpdate({amount:e.target.value})} />
          </div>
          <div>
            <label style={{ ...lbl, color:'#94a3b8' }}>{isAr?'ملاحظات':'Remarks'}</label>
            <input style={{ ...s, background:'#0f172a', color:'#f1f5f9', border:'1.5px solid #334155' }}
              value={line.remarks} placeholder={isAr?'اختياري…':'Optional…'}
              onChange={e=>onUpdate({remarks:e.target.value})} />
          </div>
        </div>
      </div>
    </div>
  )
}
