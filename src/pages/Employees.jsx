import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.HR   // HR chapter (Ch08)
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { QRButton } from '../components/QRCard'

const POPPINS = "'Poppins','Inter',system-ui,sans-serif"
const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(15,15,35,0.6)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modal:   { background:'#fff', borderRadius:20, width:780, maxWidth:'calc(100vw - 32px)', height:'min(88vh, 760px)', display:'flex', flexDirection:'column', boxShadow:'0 28px 64px rgba(0,0,0,0.30)', overflow:'hidden', fontFamily:POPPINS },
  inp:     { width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #e2e8f0', fontSize:13, outline:'none', fontFamily:POPPINS, boxSizing:'border-box', background:'#fff', transition:'border-color 0.15s', color:'#1e293b' },
  inpLock: { width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #e8e8e8', fontSize:13, outline:'none', fontFamily:POPPINS, boxSizing:'border-box', background:'#f8fafc', color:'#94a3b8', cursor:'not-allowed' },
  label:   { display:'block', fontSize:11, color:'#64748b', fontWeight:600, marginBottom:4, fontFamily:POPPINS, letterSpacing:0.3 },
  row:     { display:'flex', gap:12, marginBottom:14, flexWrap:'wrap' },
  col:     { flex:1, minWidth:130 },
  sec:     { fontSize:10, fontWeight:800, color:'#4f46e5', marginBottom:8, marginTop:2, paddingBottom:5, borderBottom:'1.5px solid #e0e7ff', letterSpacing:1.2, textTransform:'uppercase', fontFamily:POPPINS },
  toggle:  { display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, userSelect:'none', fontFamily:POPPINS },
  badge:   (bg,cl) => ({ background:bg, color:cl, borderRadius:5, padding:'2px 7px', fontSize:10, fontWeight:800 }),
}
// WPS bank registry — code stored in DB, full name shown in UI
const SAUDI_BANKS = [
  { code:'RJHI',  name:'Al Rajhi Bank' },
  { code:'NCBK',  name:'Saudi National Bank (SNB)' },
  { code:'RIBL',  name:'Riyad Bank' },
  { code:'SABB',  name:'Saudi British Bank (HSBC)' },
  { code:'BSFR',  name:'Banque Saudi Fransi' },
  { code:'ARNB',  name:'Arab National Bank' },
  { code:'INMA',  name:'Alinma Bank' },
  { code:'ALBI',  name:'Bank Albilad' },
  { code:'BJAZ',  name:'Bank AlJazira' },
  { code:'SAIB',  name:'Saudi Investment Bank' },
  { code:'GULF',  name:'Gulf International Bank' },
  { code:'CITI',  name:'Citibank Saudi Arabia' },
]
function bankName(code) { return SAUDI_BANKS.find(b => b.code === code)?.name || code || '' }
const DESIGNATIONS = ['General Manager','Department Head','Director','Senior Manager','Manager','Assistant Manager','Project Manager','Supervisor','Field Supervisor','Engineer','Senior Engineer','IT Specialist','Technician','Driver','Accountant','HR Executive','Administrative Assistant','Sales Executive','Travel Agent','Customer Service','General Worker','Other']
const EMP_TYPES = {
  RAT:    ['RAT-LOCAL','RAT-EXPAT','OUTSOURCED','CONTRACT'],
  GWT:    ['GWT-LOCAL','GWT-EXPAT','OUTSOURCED','CONTRACT'],
  ACCSYS: ['ACCSYS-LOCAL','ACCSYS-EXPAT','OUTSOURCED','CONTRACT'],
}
function empTypes(code) { return EMP_TYPES[code] || ['LOCAL','EXPAT','OUTSOURCED','CONTRACT'] }
const NATIONALITIES = [
  'Saudi Arabian','Indian','Pakistani','Bangladeshi','Egyptian','Filipino',
  'Indonesian','Yemeni','Syrian','Jordanian','Sudanese','Lebanese','Nepali',
  'Sri Lankan','Ethiopian','Eritrean','Somali','Moroccan','Tunisian','Iraqi',
  'Palestinian','Turkish','British','American','Canadian','French','German',
  'South African','Kenyan','Nigerian','Other',
]
function getEmpPrefix(entityCode, empType) {
  if (empType==='OUTSOURCED') return 'OUT'
  if (empType==='CONTRACT')   return 'CON'
  return { RAT:'RAT', GWT:'GWT', ACCSYS:'ACC' }[entityCode] || 'EMP'
}
// Derive category code from legacy employee_type string
function catFromType(t='') {
  if (t.includes('LOCAL'))   return '01'
  if (t.includes('EXPAT'))   return '02'
  if (t==='OUTSOURCED')      return '03'
  if (t==='CONTRACT')        return '04'
  return '02'
}
const CAT_LABELS = { '01':'ACCSYS-LOCAL','02':'ACCSYS-EXPAT','03':'OUTSOURCED','04':'CONTRACT' }
const CAT_COLORS = { '01':'#1565c0','02':'#6a1b9a','03':'#e65100','04':'#2e7d32' }
const CAT_BG    = { '01':'#e3f2fd','02':'#f3e5f5','03':'#fff3e0','04':'#e8f5e9' }
function Field({ label, value, mono }) {
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ fontSize:10, color:'#9e9e9e', fontWeight:700, letterSpacing:0.5, marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:13, color:value?'#1a2332':'#ccc', fontFamily:mono?'monospace':'inherit' }}>{value||'—'}</div>
    </div>
  )
}
function Avatar({ url, name, size=36 }) {
  const initials = name ? name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase() : '?'
  return url
    ? <img src={url} alt={name} style={{ width:size, height:size, borderRadius:'50%', objectFit:'cover', flexShrink:0, border:'2px solid #e1bee7' }} />
    : <div style={{ width:size, height:size, borderRadius:'50%', background:'linear-gradient(135deg,#6a1b9a,#8e24aa)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.35, fontWeight:800, flexShrink:0 }}>{initials}</div>
}

// ─── Print Templates ────────────────────────────────────────────
function printEmployee(emp, template) {
  const pkg = (emp.basic_salary||0)+(emp.housing_allowance||0)+(emp.transport_allowance||0)+(emp.mobile_allowance||0)+(emp.medical_allowance||0)+(emp.technical_allowance||0)+(emp.other_allowance||0)
  const photoHtml = emp.photo_url ? `<img src="${emp.photo_url}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;border:3px solid #6a1b9a;" />` : `<div style="width:100px;height:100px;border-radius:50%;background:linear-gradient(135deg,#6a1b9a,#8e24aa);display:flex;align-items:center;justify-content:center;font-size:36px;color:#fff;font-weight:800;">${(emp.full_name_en||'').split(' ').slice(0,2).map(w=>w[0]).join('')}</div>`

  const idCard = `
    <div style="width:340px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.15);font-family:Arial,sans-serif;">
      <div style="background:linear-gradient(135deg,#6a1b9a,#8e24aa);padding:20px;text-align:center;color:#fff;">
        <div style="font-size:11px;letter-spacing:2px;opacity:0.8;margin-bottom:4px;">RATAL GROUP · EMPLOYEE ID</div>
        <div style="font-size:13px;font-weight:800;letter-spacing:1px;">${emp.employee_number||emp.employee_code||''}</div>
      </div>
      <div style="padding:20px;text-align:center;">
        <div style="display:flex;justify-content:center;margin-bottom:12px;">${photoHtml}</div>
        <div style="font-size:18px;font-weight:800;color:#1a2332;margin-bottom:4px;">${emp.full_name_en||''}</div>
        ${emp.full_name_ar?`<div style="font-size:13px;color:#999;direction:rtl;margin-bottom:8px;">${emp.full_name_ar}</div>`:''}
        <div style="font-size:13px;color:#6a1b9a;font-weight:700;margin-bottom:4px;">${emp.designation||emp.job_title||''}</div>
        <div style="font-size:11px;color:#9e9e9e;">${emp._deptName||''}</div>
      </div>
      <div style="border-top:1px solid #f3e5f5;padding:14px 20px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        <div><div style="font-size:9px;color:#9e9e9e;font-weight:700;">IQAMA / ID</div><div style="font-size:12px;font-weight:700;">${emp.iqama_number||'—'}</div></div>
        <div><div style="font-size:9px;color:#9e9e9e;font-weight:700;">MOBILE</div><div style="font-size:12px;font-weight:700;">${emp.phone||'—'}</div></div>
        <div><div style="font-size:9px;color:#9e9e9e;font-weight:700;">NATIONALITY</div><div style="font-size:12px;font-weight:700;">${emp.nationality||'—'}</div></div>
        <div><div style="font-size:9px;color:#9e9e9e;font-weight:700;">TYPE</div><div style="font-size:12px;font-weight:700;">${(emp.employee_type||'REGULAR').replace(/_/g,' ')}</div></div>
      </div>
    </div>`

  const profile = `
    <div style="width:680px;font-family:Arial,sans-serif;border:1px solid #ddd;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#6a1b9a,#8e24aa);padding:24px 28px;color:#fff;display:flex;align-items:center;gap:20px;">
        ${photoHtml}
        <div>
          <div style="font-size:11px;opacity:0.7;letter-spacing:2px;">${emp.employee_number||emp.employee_code||''} · ${(emp.employee_type||'REGULAR').replace(/_/g,' ')}</div>
          <div style="font-size:22px;font-weight:800;margin:4px 0;">${emp.full_name_en||''}</div>
          ${emp.full_name_ar?`<div style="font-size:14px;opacity:0.8;direction:rtl;">${emp.full_name_ar}</div>`:''}
          <div style="font-size:13px;opacity:0.9;margin-top:4px;">${emp.designation||''} ${emp.job_title&&emp.job_title!==emp.designation?'· '+emp.job_title:''}</div>
        </div>
      </div>
      <div style="padding:24px 28px;display:grid;grid-template-columns:1fr 1fr;gap:24px;">
        <div>
          <div style="font-size:10px;font-weight:800;color:#9c27b0;letter-spacing:1px;margin-bottom:12px;border-bottom:1px solid #f3e5f5;padding-bottom:6px;">PERSONAL</div>
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <tr><td style="color:#9e9e9e;padding:4px 0;">Nationality</td><td style="font-weight:600;">${emp.nationality||'—'}</td></tr>
            <tr><td style="color:#9e9e9e;padding:4px 0;">Email</td><td style="font-weight:600;">${emp.email||'—'}</td></tr>
            <tr><td style="color:#9e9e9e;padding:4px 0;">Mobile</td><td style="font-weight:600;">${emp.phone||'—'}</td></tr>
            <tr><td style="color:#9e9e9e;padding:4px 0;">Iqama / ID</td><td style="font-weight:600;">${emp.iqama_number||'—'}</td></tr>
            <tr><td style="color:#9e9e9e;padding:4px 0;">Iqama Expiry</td><td style="font-weight:600;color:${emp.iqama_expiry?'#c62828':'inherit'}">${emp.iqama_expiry||'—'}</td></tr>
            <tr><td style="color:#9e9e9e;padding:4px 0;">Passport</td><td style="font-weight:600;">${emp.passport_number||'—'}</td></tr>
            <tr><td style="color:#9e9e9e;padding:4px 0;">Passport Expiry</td><td style="font-weight:600;color:${emp.passport_expiry?'#c62828':'inherit'}">${emp.passport_expiry||'—'}</td></tr>
          </table>
          <div style="font-size:10px;font-weight:800;color:#9c27b0;letter-spacing:1px;margin:16px 0 12px;border-bottom:1px solid #f3e5f5;padding-bottom:6px;">EMPLOYMENT</div>
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <tr><td style="color:#9e9e9e;padding:4px 0;">Department</td><td style="font-weight:600;">${emp._deptName||'—'}</td></tr>
            <tr><td style="color:#9e9e9e;padding:4px 0;">Hire Date</td><td style="font-weight:600;">${emp.hire_date||'—'}</td></tr>
            <tr><td style="color:#9e9e9e;padding:4px 0;">Contract End</td><td style="font-weight:600;">${emp.contract_end_date||'—'}</td></tr>
          </table>
        </div>
        <div>
          <div style="font-size:10px;font-weight:800;color:#9c27b0;letter-spacing:1px;margin-bottom:12px;border-bottom:1px solid #f3e5f5;padding-bottom:6px;">SALARY (SAR)</div>
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <tr><td style="color:#9e9e9e;padding:4px 0;">Basic</td><td style="font-weight:600;">${(emp.basic_salary||0).toLocaleString()}</td></tr>
            <tr><td style="color:#9e9e9e;padding:4px 0;">Housing</td><td style="font-weight:600;">${(emp.housing_allowance||0).toLocaleString()}</td></tr>
            <tr><td style="color:#9e9e9e;padding:4px 0;">Transport</td><td style="font-weight:600;">${(emp.transport_allowance||0).toLocaleString()}</td></tr>
            ${(emp.mobile_allowance||0)>0?`<tr><td style="color:#9e9e9e;padding:4px 0;">Mobile</td><td style="font-weight:600;">${(emp.mobile_allowance||0).toLocaleString()}</td></tr>`:''}
            ${(emp.medical_allowance||0)>0?`<tr><td style="color:#9e9e9e;padding:4px 0;">Medical</td><td style="font-weight:600;">${(emp.medical_allowance||0).toLocaleString()}</td></tr>`:''}
            ${(emp.technical_allowance||0)>0?`<tr><td style="color:#9e9e9e;padding:4px 0;">Technical</td><td style="font-weight:600;">${(emp.technical_allowance||0).toLocaleString()}</td></tr>`:''}
            ${(emp.other_allowance||0)>0?`<tr><td style="color:#9e9e9e;padding:4px 0;">Other</td><td style="font-weight:600;">${(emp.other_allowance||0).toLocaleString()}</td></tr>`:''}
            <tr style="border-top:2px solid #6a1b9a;"><td style="color:#6a1b9a;padding:6px 0;font-weight:800;">TOTAL PACKAGE</td><td style="font-weight:800;color:#6a1b9a;font-size:15px;">SAR ${pkg.toLocaleString()}</td></tr>
          </table>
          <div style="font-size:10px;font-weight:800;color:#9c27b0;letter-spacing:1px;margin:16px 0 12px;border-bottom:1px solid #f3e5f5;padding-bottom:6px;">BANKING</div>
          <table style="width:100%;font-size:12px;border-collapse:collapse;">
            <tr><td style="color:#9e9e9e;padding:4px 0;">Bank</td><td style="font-weight:600;">${emp.bank_name||'—'}</td></tr>
            <tr><td style="color:#9e9e9e;padding:4px 0;">Account</td><td style="font-weight:600;">${emp.bank_account_number||'—'}</td></tr>
            <tr><td style="color:#9e9e9e;padding:4px 0;">IBAN</td><td style="font-weight:600;font-size:11px;font-family:monospace;">${emp.iban||'—'}</td></tr>
          </table>
        </div>
      </div>
      <div style="background:#f9f5ff;padding:12px 28px;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid #e1bee7;">
        ${emp.has_car?'<span style="background:#e3f2fd;color:#1565c0;border-radius:4px;padding:3px 10px;font-size:11px;font-weight:700;">🚗 Company Car</span>':''}
        ${emp.ot_eligible?'<span style="background:#e8eaf6;color:#283593;border-radius:4px;padding:3px 10px;font-size:11px;font-weight:700;">OT Eligible</span>':''}
        ${emp.fa_eligible?'<span style="background:#fff3e0;color:#e65100;border-radius:4px;padding:3px 10px;font-size:11px;font-weight:700;">Food Allowance</span>':''}
        ${emp.loan_eligible?'<span style="background:#e8f5e9;color:#2e7d32;border-radius:4px;padding:3px 10px;font-size:11px;font-weight:700;">Loan Eligible</span>':''}
        ${emp.wps_allowed?'<span style="background:#e0f2f1;color:#00695c;border-radius:4px;padding:3px 10px;font-size:11px;font-weight:700;">WPS</span>':''}
        ${emp.has_dependents?`<span style="background:#fce4ec;color:#880e4f;border-radius:4px;padding:3px 10px;font-size:11px;font-weight:700;">👨‍👩‍👧 ${emp.num_dependents} Dependents</span>`:''}
      </div>
      <div style="padding:10px 28px;text-align:right;font-size:10px;color:#ccc;">Printed: ${new Date().toLocaleDateString()} · Ratal Group ERP</div>
    </div>`

  const html = template==='id_card' ? idCard : profile
  const win = window.open('','_blank','width=800,height=700')
  win.document.write(`<!DOCTYPE html><html><head><title>Employee - ${emp.full_name_en}</title><style>body{margin:0;padding:30px;background:#f5f5f5;display:flex;justify-content:center;} @media print{body{background:#fff;padding:0;}}</style></head><body>${html}<br><br><div style="text-align:center;"><button onclick="window.print()" style="background:#6a1b9a;color:#fff;border:none;padding:10px 24px;border-radius:8px;font-size:14px;cursor:pointer;margin-right:8px;">🖨️ Print</button><button onclick="window.close()" style="background:#eee;color:#333;border:none;padding:10px 20px;border-radius:8px;font-size:14px;cursor:pointer;">Close</button></div></body></html>`)
  win.document.close()
}

function Flags({ emp }) {
  return (
    <div style={{ display:'flex', gap:3 }}>
      {emp.has_car       && <span style={S.badge('#e3f2fd','#1565c0')} title="Car">🚗</span>}
      {emp.has_dependents && <span style={S.badge('#fce4ec','#880e4f')} title="Dependents">👨‍👩‍👧{emp.num_dependents}</span>}
      {emp.ot_eligible   && <span style={S.badge('#e8eaf6','#283593')}>OT</span>}
      {emp.fa_eligible   && <span style={S.badge('#fff3e0','#e65100')}>FA</span>}
      {emp.loan_eligible && <span style={S.badge('#e8f5e9','#2e7d32')}>LOAN</span>}
      {emp.wps_allowed   && <span style={S.badge('#e0f2f1','#00695c')}>WPS</span>}
    </div>
  )
}

export default function Employees({ entityId, entityCode }) {
  const { isAdmin } = useAuth()
  const [employees,    setEmployees]    = useState([])
  const [depts,        setDepts]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showBanner,   setShowBanner]   = useState(false)
  const [open,         setOpen]         = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [editing,      setEditing]      = useState(null)
  const [search,       setSearch]       = useState('')
  const [filterDept,   setFilterDept]   = useState('')   // department_id or ''
  const [filterType,   setFilterType]   = useState('')   // employee_type or ''
  const [showInactive, setShowInactive] = useState(false)
  const [expandedRow,  setExpandedRow]  = useState(null)
  const [viewEmp,      setViewEmp]      = useState(null)
  const [showPrint,    setShowPrint]    = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const photoRef = useRef()

  // ── Form state ──────────────────────────────────────────────
  const [empType,    setEmpType]    = useState(() => empTypes(entityCode)[0] || 'LOCAL')
  const [empNum,     setEmpNum]     = useState('')
  const [nameEn,     setNameEn]     = useState('')
  const [nameAr,     setNameAr]     = useState('')
  const [nationality,setNationality]= useState('')
  const [iqama,      setIqama]      = useState('')
  const [iqamaExp,   setIqamaExp]   = useState('')
  const [passport,   setPassport]   = useState('')
  const [passExp,    setPassExp]    = useState('')
  const [designation,setDesignation]= useState('')
  const [jobTitle,   setJobTitle]   = useState('')
  const [deptId,     setDeptId]     = useState('')
  const [hireDate,   setHireDate]   = useState('')
  const [contractEnd,setContractEnd]= useState('')
  const [email,      setEmail]      = useState('')
  const [phone,      setPhone]      = useState('')
  const [telegramId, setTelegramId] = useState('')
  const [basic,      setBasic]      = useState('')
  const [housing,    setHousing]    = useState('')
  const [transport,  setTransport]  = useState('')
  const [mobileAllow,setMobileAllow]= useState('')
  const [medAllow,   setMedAllow]   = useState('')
  const [techAllow,  setTechAllow]  = useState('')
  const [other,      setOther]      = useState('')
  const [selBank,    setSelBank]    = useState('')   // stores WPS code e.g. "RJHI"
  const [bankAcc,    setBankAcc]    = useState('')
  const [bankPortion,setBankPortion]= useState('')
  const [salaryView,  setSalaryView]  = useState('total')  // 'total' | 'bank' | 'cash'
  const [exporting,       setExporting]       = useState(false)
  const [showExportDialog,setShowExportDialog] = useState(false)
  const [exportMonth,     setExportMonth]     = useState(() => new Date().toISOString().slice(0,7))
  // Personal docs
  const [dob,         setDob]         = useState('')
  const [sceReg,      setSceReg]      = useState(false)
  const [sceNum,      setSceNum]      = useState('')
  const [sceExpiry,   setSceExpiry]   = useState('')
  const [qiwaReg,     setQiwaReg]     = useState(false)
  const [qiwaExpiry,  setQiwaExpiry]  = useState('')
  // Dependents
  const [depsData,       setDepsData]       = useState([])
  const [showDepsModal,  setShowDepsModal]  = useState(false)
  const [editingDepIdx,  setEditingDepIdx]  = useState(null)
  const [depForm,        setDepForm]        = useState({ full_name:'', gender:'', relation:'', date_of_birth:'', iqama_number:'', passport_number:'', passport_expiry:'', nationality:'' })
  const [iban,       setIban]       = useState('')
  const [hasCar,     setHasCar]     = useState(false)
  const [hasDep,     setHasDep]     = useState(false)
  const [numDep,     setNumDep]     = useState(0)
  const [loanElig,   setLoanElig]   = useState(false)
  const [otElig,     setOtElig]     = useState(true)
  const [faElig,     setFaElig]     = useState(false)
  const [faAmount,   setFaAmount]   = useState('')
  const [wpsAllowed, setWpsAllowed] = useState(true)
  const [bankCode,   setBankCode]   = useState('1060')
  const [photoUrl,   setPhotoUrl]   = useState('')

  // ── Payroll category & payment mode ─────────────────────────
  const [empCategory,    setEmpCategory]    = useState('02')       // '01'|'02'|'03'|'04'
  const [paymentMode,    setPaymentMode]    = useState('BANK_ONLY') // BANK_ONLY|CASH_ONLY|BANK_CASH_SPLIT
  const [bankFixedAmt,   setBankFixedAmt]   = useState('')         // fixed SAR to bank
  const [bankPctAmt,     setBankPctAmt]     = useState('')         // % of net to bank
  const [initialBasic,   setInitialBasic]   = useState('')         // basic at joining (EOSB)
  const [gosiNum,        setGosiNum]        = useState('')
  const [gosiStart,      setGosiStart]      = useState('')
  const [gosiEnd,        setGosiEnd]        = useState('')
  const [sceCategory,    setSceCategory]    = useState('')
  const [sceIssueDate,   setSceIssueDate]   = useState('')
  const [sceStatusField, setSceStatusField] = useState('NOT_APPLICABLE')
  const [outsourceAgency,setOutsourceAgency]= useState('')
  const [entityCodeEmp,  setEntityCodeEmp]  = useState('RATAL')
  const [step,           setStep]           = useState(1)       // 1-6 wizard steps

  // ── Activation modal (re-hire) ───────────────────────────────
  const [activateEmp,    setActivateEmp]    = useState(null)
  const [activateDate,   setActivateDate]   = useState('')
  const [activateReason, setActivateReason] = useState('')
  const [activating,     setActivating]     = useState(false)

  // ── N2: Offboarding modal state ──────────────────────────────
  const [offboardEmp,    setOffboardEmp]    = useState(null)   // employee being offboarded
  const [offboardDate,   setOffboardDate]   = useState('')     // last working day
  const [offboardReason, setOffboardReason] = useState('RESIGNATION')
  const [offboardNotes,  setOffboardNotes]  = useState('')
  const [offboarding,    setOffboarding]    = useState(false)

  useEffect(() => { load() }, [entityId])

  async function load() {
    if (!entityId) return
    setLoading(true)
    const [{ data: e, error: e1 }, { data: d }] = await Promise.all([
      supabase.from('employees').select('*').eq('entity_id', entityId).order('full_name_en'),
      supabase.from('departments').select('id,dept_name,dept_code').eq('entity_id', entityId).eq('is_active', true).order('dept_name'),
    ])
    if (e1) console.error('Employees load error:', e1.message)
    setEmployees(e||[]); setDepts(d||[])
    setLoading(false)
  }

  // Resolve department name/code from local depts array (avoids FK join + schema cache issues)
  const getDeptName = (id) => depts.find(d => d.id === id)?.dept_name || '—'
  const getDeptCode = (id) => depts.find(d => d.id === id)?.dept_code || ''

  async function genEmpNum(type) {
    const prefix = getEmpPrefix(entityCode, type)
    const { count } = await supabase.from('employees').select('id', { count:'exact', head:true })
      .eq('entity_id', entityId).like('employee_number', `${prefix}-%`)
    setEmpNum(`${prefix}-${String((count||0)+1).padStart(4,'0')}`)
  }

  function openNew() { resetForm(); setEditing(null); genEmpNum('REGULAR'); setShowBanner(true) }

  function openEdit(emp) {
    setEditing(emp)
    setEmpType(emp.employee_type||empTypes(entityCode)[0]||''); setEmpNum(emp.employee_number||emp.employee_code||'')
    setNameEn(emp.full_name_en||''); setNameAr(emp.full_name_ar||'')
    setNationality(emp.nationality||''); setIqama(emp.iqama_number||''); setIqamaExp(emp.iqama_expiry||'')
    setPassport(emp.passport_number||''); setPassExp(emp.passport_expiry||'')
    setDesignation(emp.designation||''); setJobTitle(emp.job_title||'')
    setDeptId(emp.department_id||''); setHireDate(emp.hire_date||''); setContractEnd(emp.contract_end_date||'')
    setEmail(emp.email||''); setPhone(emp.phone||''); setTelegramId(emp.telegram_chat_id||'')
    setBasic(emp.basic_salary||''); setHousing(emp.housing_allowance||''); setTransport(emp.transport_allowance||'')
    setMobileAllow(emp.mobile_allowance||''); setMedAllow(emp.medical_allowance||''); setTechAllow(emp.technical_allowance||''); setOther(emp.other_allowance||'')
    setSelBank(emp.bank_code||''); setBankAcc(emp.bank_account_number||''); setBankPortion(emp.bank_portion||''); setIban(emp.iban||'')
    setWpsAllowed(emp.wps_allowed!==false); setBankCode(emp.bank_code||'')
    setHasCar(emp.has_car||false); setHasDep(emp.has_dependents||false); setNumDep(emp.num_dependents||0)
    setLoanElig(emp.loan_eligible||false); setOtElig(emp.ot_eligible!==false); setFaElig(emp.fa_eligible||false); setFaAmount(emp.fa_amount||'')
    setPhotoUrl(emp.photo_url||emp.photo_path||'')
    setDob(emp.date_of_birth||''); setSceReg(emp.sce_required||emp.sce_registered||false)
    setSceNum(emp.sce_number||''); setSceExpiry(emp.sce_expiry_date||emp.sce_expiry||'')
    setSceCategory(emp.sce_category||''); setSceIssueDate(emp.sce_issue_date||'')
    setSceStatusField(emp.sce_status||'NOT_APPLICABLE')
    setQiwaReg(emp.qiwa_registered||false); setQiwaExpiry(emp.qiwa_expiry||'')
    // Payroll category & payment fields
    setEmpCategory(emp.employee_category||catFromType(emp.employee_type)||'02')
    setPaymentMode(emp.payment_mode||'BANK_ONLY')
    setBankFixedAmt(emp.bank_fixed_amount||''); setBankPctAmt(emp.bank_portion_pct||'')
    setInitialBasic(emp.initial_basic_salary||'')
    setGosiNum(emp.gosi_number||''); setGosiStart(emp.gosi_start_date||''); setGosiEnd(emp.gosi_end_date||'')
    setOutsourceAgency(emp.outsource_agency||''); setEntityCodeEmp(emp.entity_code||'RATAL')
    // Load dependents async
    supabase.from('employee_dependents').select('*').eq('employee_id', emp.id).order('sort_order')
      .then(({ data }) => setDepsData(data || []))
    setViewEmp(null); setStep(1); setOpen(true)
  }

  function resetForm() {
    setEmpType(empTypes(entityCode)[0] || 'LOCAL'); setEmpNum(''); setNameEn(''); setNameAr(''); setNationality('')
    setIqama(''); setIqamaExp(''); setPassport(''); setPassExp('')
    setDesignation(''); setJobTitle(''); setDeptId(''); setHireDate(''); setContractEnd('')
    setEmail(''); setPhone(''); setTelegramId('')
    setBasic(''); setHousing(''); setTransport(''); setMobileAllow(''); setMedAllow(''); setTechAllow(''); setOther('')
    setSelBank(''); setBankAcc(''); setBankPortion(''); setIban('')
    setHasCar(false); setHasDep(false); setNumDep(0)
    setLoanElig(false); setOtElig(true); setFaElig(false); setFaAmount('')
    setWpsAllowed(true); setBankCode(''); setPhotoUrl('')
    setDob(''); setSceReg(false); setSceNum(''); setSceExpiry(''); setSceCategory(''); setSceIssueDate(''); setSceStatusField('NOT_APPLICABLE')
    setQiwaReg(false); setQiwaExpiry('')
    setEmpCategory('02'); setPaymentMode('BANK_ONLY'); setBankFixedAmt(''); setBankPctAmt(''); setInitialBasic('')
    setGosiNum(''); setGosiStart(''); setGosiEnd(''); setOutsourceAgency(''); setEntityCodeEmp('RATAL')
    setDepsData([]); setDepForm({ full_name:'', gender:'', relation:'', date_of_birth:'', iqama_number:'', passport_number:'', passport_expiry:'', nationality:'' })
    setStep(1)
  }

  async function uploadPhoto(file) {
    if (!file) return
    setPhotoUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${entityId}/${Date.now()}.${ext}`
    const { data, error } = await supabase.storage.from('employee-photos').upload(path, file, { upsert: true })
    if (error) { alert('Photo upload failed: ' + error.message); setPhotoUploading(false); return }
    const { data: pub } = supabase.storage.from('employee-photos').getPublicUrl(path)
    setPhotoUrl(pub.publicUrl)
    setPhotoUploading(false)
  }

  const totalPkg       = (parseFloat(basic)||0)+(parseFloat(housing)||0)+(parseFloat(transport)||0)+(parseFloat(mobileAllow)||0)+(parseFloat(medAllow)||0)+(parseFloat(techAllow)||0)+(parseFloat(other)||0)
  const autoCashPortion = Math.max(0, totalPkg - (parseFloat(bankPortion)||0))

  async function save() {
    if (!nameEn) { alert('Full name (English) is required'); return }
    if (sceReg && (!sceNum || !sceExpiry)) { alert('SCE number and expiry date are required when SCE is registered'); return }
    setSaving(true)
    // Build payload — employee_code only on INSERT (already stored on existing records)
    const basePayload = {
      entity_id: entityId,
      employee_type: empType,
      employee_number: empNum||null,
      full_name_en: nameEn, full_name_ar: nameAr||null, full_name: nameEn,
      nationality: nationality||null,
      iqama_number: iqama||null, iqama_expiry: iqamaExp||null,
      passport_number: passport||null, passport_expiry: passExp||null,
      designation: designation||null, job_title: jobTitle||null,
      department_id: deptId||null,
      hire_date: hireDate||null, contract_end_date: contractEnd||null,
      email: email||null, phone: phone||null,
      telegram_chat_id: telegramId||null,
      basic_salary: parseFloat(basic)||0,
      housing_allowance: parseFloat(housing)||0,
      transport_allowance: parseFloat(transport)||0,
      mobile_allowance: parseFloat(mobileAllow)||0,
      medical_allowance: parseFloat(medAllow)||0,
      technical_allowance: parseFloat(techAllow)||0,
      other_allowance: parseFloat(other)||0,
      bank_name: bankName(selBank)||null,
      bank_account_number: bankAcc||null,
      bank_portion: parseFloat(bankPortion)||0,
      cash_portion: Math.max(0, totalPkg - (parseFloat(bankPortion)||0)),
      bank_code: selBank||null,
      iban: iban||null,
      wps_allowed: wpsAllowed,
      has_car: hasCar,
      has_dependents: hasDep,
      num_dependents: hasDep ? parseInt(numDep)||0 : 0,
      loan_eligible: loanElig,
      ot_eligible: otElig,
      fa_eligible: faElig,
      fa_amount: faElig ? parseFloat(faAmount)||0 : 0,
      photo_url: photoUrl||null,
      date_of_birth: dob||null,
      sce_required: sceReg,
      sce_registered: sceReg,
      sce_number: sceReg ? sceNum||null : null,
      sce_expiry: sceReg ? sceExpiry||null : null,
      sce_expiry_date: sceReg ? sceExpiry||null : null,
      sce_category: sceReg ? sceCategory||null : null,
      sce_issue_date: sceReg ? sceIssueDate||null : null,
      sce_status: sceReg ? (sceStatusField||'VALID') : 'NOT_APPLICABLE',
      qiwa_registered: qiwaReg,
      qiwa_expiry: qiwaReg ? qiwaExpiry||null : null,
      // Payroll category & payment fields
      employee_category: empCategory||'02',
      entity_code: entityCodeEmp||'RATAL',
      payment_mode: paymentMode||'BANK_ONLY',
      bank_fixed_amount: paymentMode==='BANK_CASH_SPLIT' && bankFixedAmt ? parseFloat(bankFixedAmt) : null,
      bank_portion_pct:  paymentMode==='BANK_CASH_SPLIT' && bankPctAmt  ? parseFloat(bankPctAmt)  : null,
      initial_basic_salary: initialBasic ? parseFloat(initialBasic) : null,
      gosi_number: gosiNum||null,
      gosi_start_date: gosiStart||null,
      gosi_end_date: gosiEnd||null,
      outsource_agency: empCategory==='03' ? outsourceAgency||null : null,
      contract_end_date: contractEnd||null,
    }
    // employee_code: only set on create — never overwrite on update to avoid length constraint issues
    const payload = editing
      ? basePayload
      : { ...basePayload, employee_code: empNum || `${getEmpPrefix(entityCode, empType)}-${Date.now()}` }
    let savedId = editing?.id
    if (editing) {
      const { error } = await supabase.from('employees').update(payload).eq('id', editing.id)
      if (error) {
        setSaving(false)
        console.error('EMPLOYEE SAVE ERROR:', JSON.stringify(error, null, 2))
        alert('Save failed:\n' + error.message + (error.details ? '\n\nDetails: ' + error.details : '') + (error.hint ? '\nHint: ' + error.hint : ''))
        return
      }
    } else {
      const { data: newEmp, error } = await supabase.from('employees').insert(payload).select('id').single()
      if (error || !newEmp) { setSaving(false); alert(error?.message||'Insert failed'); return }
      savedId = newEmp.id
    }
    // Save dependents
    if (savedId) {
      await supabase.from('employee_dependents').delete().eq('employee_id', savedId)
      if (hasDep && depsData.length > 0) {
        const depRows = depsData.map((d, i) => ({ ...d, employee_id: savedId, entity_id: entityId, sort_order: i, id: undefined }))
        await supabase.from('employee_dependents').insert(depRows)
      }
    }
    setSaving(false)
    setOpen(false); resetForm(); load()
  }

  async function toggleActive(emp) {
    if (emp.is_active) {
      // Deactivating → offboarding modal (end date mandatory)
      setOffboardEmp(emp)
      setOffboardDate(new Date().toISOString().slice(0,10))
      setOffboardReason('RESIGNATION')
      setOffboardNotes('')
    } else {
      // Re-activating → activation modal (start date mandatory — never silent)
      setActivateEmp(emp)
      setActivateDate(new Date().toISOString().slice(0,10))
      setActivateReason('')
    }
  }

  async function handleActivateConfirm() {
    if (!activateEmp) return
    if (!activateDate) { alert('Start date is mandatory when re-activating an employee.'); return }
    setActivating(true)
    try {
      await supabase.from('employees').update({
        is_active: true,
        date_of_leaving: null,
        status: 'ACTIVE',
        hire_date: activateDate,
      }).eq('id', activateEmp.id)
      // Log employment period
      await supabase.from('employment_periods').insert({
        employee_id: activateEmp.id,
        start_date: activateDate,
        status: 'ACTIVE',
        notes: activateReason || 'Re-joining',
      })
      setActivateEmp(null); setActivating(false)
      load()
    } catch (err) {
      alert('Activation failed: ' + err.message)
      setActivating(false)
    }
  }

  // ── N2: EOSB calculation (Saudi Labour Law) ──────────────────
  function calcEOSB(emp, leavingDate) {
    const joinDate   = emp.date_of_joining || emp.hire_date || emp.created_at?.slice(0,10)
    if (!joinDate) return { years: 0, months: 0, eosb: 0 }
    const start      = new Date(joinDate)
    const end        = new Date(leavingDate || new Date().toISOString().slice(0,10))
    const totalDays  = Math.max(0, Math.round((end - start) / 86400000))
    const years      = totalDays / 365.25
    const wholeMos   = Math.floor(totalDays / 30.4375)
    const basic      = +(emp.basic_salary || emp.bank_portion || 0)
    // First 5 years: 0.5 month per year; beyond 5 years: 1 month per year
    const first5     = Math.min(years, 5)
    const beyond5    = Math.max(0, years - 5)
    const eosb       = +((basic * 0.5 * first5) + (basic * 1 * beyond5)).toFixed(2)
    return { years: +years.toFixed(2), months: wholeMos, eosb }
  }

  async function handleOffboardConfirm() {
    if (!offboardEmp) return
    const today = new Date().toISOString().slice(0,10)
    const lDate = offboardDate || today
    setOffboarding(true)
    try {
      // 1. Update employee record
      await supabase.from('employees').update({
        is_active:       false,
        date_of_leaving: lDate,
        status:          'INACTIVE',
      }).eq('id', offboardEmp.id)
      // 1b. Close the active employment period
      await supabase.from('employment_periods')
        .update({ end_date: lDate, status: 'CLOSED', end_reason: offboardReason })
        .eq('employee_id', offboardEmp.id)
        .is('end_date', null)

      // 2. Create EOSB journal entry if amount > 0
      const { eosb } = calcEOSB(offboardEmp, lDate)
      if (eosb > 0) {
        const je_number = `EOSB-${lDate.slice(0,7).replace('-','')}-${offboardEmp.employee_number || offboardEmp.id.slice(0,6)}`
        const { data: je } = await supabase.from('journal_entries').insert({
          entity_id:   entityId,
          entry_number: je_number,
          entry_date:  lDate,
          period:      lDate.slice(0,7),
          narration:   `EOSB: ${offboardEmp.full_name_en || offboardEmp.full_name} — ${offboardReason}${offboardNotes ? ' — ' + offboardNotes : ''}`,
          status:      'POSTED',
          source_type: 'EOSB',
          source_id:   offboardEmp.id,
        }).select().single()

        if (je?.id) {
          await supabase.from('journal_entry_lines').insert([
            { journal_entry_id: je.id, account_code: '5200-EOSB', account_name: 'EOSB Expense', debit_amount: eosb, credit_amount: 0,
              description: `EOSB for ${offboardEmp.full_name_en || offboardEmp.full_name}` },
            { journal_entry_id: je.id, account_code: '2500-EOSB', account_name: 'EOSB Payable', debit_amount: 0, credit_amount: eosb,
              description: `EOSB payable — ${offboardEmp.full_name_en || offboardEmp.full_name}` },
          ])
        }
      }

      setOffboardEmp(null); setOffboarding(false)
      load()
    } catch (err) {
      alert('Offboarding failed: ' + err.message)
      setOffboarding(false)
    }
  }

  async function exportToExcel(month) {
    // Lazily load SheetJS from CDN
    if (!window._XLSX) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
        s.onload = () => { window._XLSX = window.XLSX; resolve() }
        s.onerror = reject
        document.head.appendChild(s)
      })
    }
    const XL = window._XLSX

    // Month label: "2026-06" -> "Jun-2026"
    const MO_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const [yr, mo] = (month||new Date().toISOString().slice(0,7)).split('-')
    const monLabel = `${MO_NAMES[parseInt(mo)-1]}-${yr}`

    // Fetch payroll run for the selected month
    const { data: run } = await supabase
      .from('payroll_runs')
      .select('id,payroll_month,status')
      .eq('entity_id', entityId)
      .eq('payroll_month', month)
      .single()

    let payrollMap = {}, hasPayroll = false
    if (run) {
      hasPayroll = true
      const { data: pitems } = await supabase
        .from('payroll_items')
        .select('employee_id,ot_amount,loan_deduction,penalty_deduction')
        .eq('payroll_run_id', run.id)
      ;(pitems || []).forEach(i => { payrollMap[i.employee_id] = i })
    }

    const entityLabel = entityCode || 'RATAL GROUP'
    const activeEmps  = employees.filter(e => e.is_active)
    const sorted      = [...activeEmps].sort((a, b) => {
      const dc = (getDeptCode(a.department_id)||'ZZZ').localeCompare(getDeptCode(b.department_id)||'ZZZ')
      return dc !== 0 ? dc : (a.full_name_en||'').localeCompare(b.full_name_en||'')
    })

    // Short column headers (as requested)
    const HDRS = ['Emp Type','Emp_ID','Emp_Name','Dept','Salary_Pkg','Bank_Amt','Cash_Amt','Basic','HRA','Conv.','OT','Others','Deduct','Penalties']
    const COL_W = [{wch:16},{wch:13},{wch:26},{wch:8},{wch:14},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:10},{wch:12},{wch:12},{wch:12}]

    function toRow(emp) {
      const pi = payrollMap[emp.id] || {}
      return [
        (emp.employee_type||'').replace(/-/g,' '),
        emp.employee_number || emp.employee_code || '',
        emp.full_name_en || '',
        getDeptCode(emp.department_id) || getDeptName(emp.department_id) || '',
        empPkg(emp),
        emp.bank_portion || 0,
        empCash(emp),
        emp.basic_salary || 0,
        emp.housing_allowance || 0,
        emp.transport_allowance || 0,
        +(pi.ot_amount)         || 0,
        emp.other_allowance     || 0,
        +(pi.loan_deduction)    || 0,
        +(pi.penalty_deduction) || 0,
      ]
    }

    // Apply #,##0.00 number format to numeric cells (columns E-N = index 4-13)
    function applyFmt(ws) {
      if (!ws['!ref']) return
      const range = XL.utils.decode_range(ws['!ref'])
      for (let R = range.s.r; R <= range.e.r; R++) {
        for (let C = 4; C <= 13; C++) {
          const addr = XL.utils.encode_cell({ r: R, c: C })
          if (ws[addr] && typeof ws[addr].v === 'number') ws[addr].z = '#,##0.00'
        }
      }
    }

    // Build dept groups + subtotals in one pass
    const deptGroups = {}, deptSubtotals = {}, typeSubtotals = {}
    const N = 10
    sorted.forEach(emp => {
      const dk   = getDeptCode(emp.department_id) || 'UNASSIGNED'
      const type = (emp.employee_type || 'OTHER').replace(/-/g, ' ')
      if (!deptGroups[dk])      deptGroups[dk]      = []
      if (!deptSubtotals[dk])   deptSubtotals[dk]   = Array(N).fill(0)
      if (!typeSubtotals[type]) typeSubtotals[type]  = Array(N).fill(0)
      deptGroups[dk].push(emp)
      const row = toRow(emp)
      for (let i = 4; i < 14; i++) { deptSubtotals[dk][i-4] += row[i]; typeSubtotals[type][i-4] += row[i] }
    })

    const wb = XL.utils.book_new()
    const runNote = hasPayroll
      ? `Payroll: ${monLabel} (${run.status})`
      : `Note: No saved payroll run for ${monLabel} - showing static salary data`

    // Grand totals
    const grand = Array(N).fill(0)
    Object.values(deptSubtotals).forEach(t => t.forEach((v, i) => { grand[i] += v }))

    // 1. SUMMARY SHEET (first tab)
    const sumData = []
    sumData.push([`${entityLabel}  -  Employee Salary Summary`, '', '', '', runNote])
    sumData.push([])
    sumData.push(HDRS)
    sorted.forEach(emp => sumData.push(toRow(emp)))
    sumData.push([])
    sumData.push(['--- BY DEPARTMENT ---'])
    sumData.push(['Dept', '', 'Count', '', 'Salary_Pkg','Bank_Amt','Cash_Amt','Basic','HRA','Conv.','OT','Others','Deduct','Penalties'])
    Object.entries(deptSubtotals).forEach(([dk, t]) =>
      sumData.push([dk, '', deptGroups[dk].length, '', ...t])
    )
    sumData.push([])
    sumData.push(['--- BY EMPLOYEE TYPE ---'])
    sumData.push(['Emp Type', '', 'Count', '', 'Salary_Pkg','Bank_Amt','Cash_Amt','Basic','HRA','Conv.','OT','Others','Deduct','Penalties'])
    Object.entries(typeSubtotals).forEach(([type, t]) => {
      const cnt = sorted.filter(e => (e.employee_type||'').replace(/-/g,' ') === type).length
      sumData.push([type, '', cnt, '', ...t])
    })
    sumData.push([])
    sumData.push(['GRAND TOTAL', '', activeEmps.length, '', ...grand])

    const sumWs = XL.utils.aoa_to_sheet(sumData)
    sumWs['!cols'] = COL_W
    applyFmt(sumWs)
    XL.utils.book_append_sheet(wb, sumWs, `Summary ${monLabel}`.slice(0,31))

    // 2. ONE SHEET PER DEPARTMENT
    Object.entries(deptGroups).forEach(([dk, emps]) => {
      const dt = deptSubtotals[dk]
      const rows = []
      rows.push([`${entityLabel}  -  ${dk}`, '', '', '', runNote])
      rows.push([])
      rows.push(HDRS)
      emps.forEach(emp => rows.push(toRow(emp)))
      rows.push([`TOTAL  (${emps.length} employee${emps.length!==1?'s':''})`, '', '', '', ...dt])
      rows.push([])
      rows.push([])
      // Signature section
      rows.push(['','','','','Department Head:','','','','Accounts / Finance:'])
      rows.push([])
      rows.push(['','','','','_________________________________','','','','_________________________________'])
      rows.push(['','','','','Name & Designation','','','','Name & Designation'])
      rows.push([])
      rows.push(['','','','','Date:  ______________________','','','','Date:  ______________________'])

      const ws = XL.utils.aoa_to_sheet(rows)
      ws['!cols'] = COL_W
      applyFmt(ws)
      XL.utils.book_append_sheet(wb, ws, `${dk} ${monLabel}`.slice(0,31))
    })

    XL.writeFile(wb, `${entityLabel}_Payroll_${monLabel}.xlsx`)
  }

  const _s = search.toLowerCase()
  const filtered = employees.filter(e =>
    (showInactive || e.is_active) &&
    (!filterDept || e.department_id === filterDept) &&
    (!filterType || e.employee_type === filterType) &&
    (!_s || (
      e.full_name_en?.toLowerCase().includes(_s)        ||
      e.full_name_ar?.toLowerCase().includes(_s)        ||
      e.employee_number?.toLowerCase().includes(_s)     ||
      e.employee_code?.toLowerCase().includes(_s)       ||
      e.employee_type?.toLowerCase().includes(_s)       ||
      e.designation?.toLowerCase().includes(_s)         ||
      e.job_title?.toLowerCase().includes(_s)           ||
      e.phone?.toLowerCase().includes(_s)               ||
      e.email?.toLowerCase().includes(_s)               ||
      e.nationality?.toLowerCase().includes(_s)         ||
      e.iqama_number?.toLowerCase().includes(_s)        ||
      e.passport_number?.toLowerCase().includes(_s)     ||
      getDeptName(e.department_id)?.toLowerCase().includes(_s) ||
      getDeptCode(e.department_id)?.toLowerCase().includes(_s)
    ))
  )
  // Component sum (for payslip breakdown)
  const empComp = e => (e.basic_salary||0)+(e.housing_allowance||0)+(e.transport_allowance||0)+(e.mobile_allowance||0)+(e.medical_allowance||0)+(e.technical_allowance||0)+(e.other_allowance||0)

  // Derive cash portion: if components are fully entered, cash = components - bank
  // Otherwise use stored DB value
  const empCash = e => {
    const comp = empComp(e)
    const bp   = e.bank_portion||0
    if (comp > 0 && bp > 0 && comp >= bp) return comp - bp   // derive from components (most accurate)
    return e.cash_portion||0                                   // fall back to DB stored value
  }

  // Total Package = Bank + Cash (always)
  const empPkg = e => {
    const bp = e.bank_portion||0
    const cp = empCash(e)
    if (bp > 0) return bp + cp          // bank+cash is the definitive total
    return empComp(e)                   // fallback for employees with no bank_portion set yet
  }

  // Column display based on view toggle
  const empSalDisplay = e => {
    if (salaryView==='bank') return e.bank_portion||0
    if (salaryView==='cash') return empCash(e)
    return empPkg(e)
  }
  const totalSalary = filtered.filter(e=>e.is_active).reduce((s,e)=>s+empSalDisplay(e), 0)

  // Stats base: dept+type filtered but ignores search/showInactive, so cards always show full dept counts
  const statsBase = employees.filter(e =>
    (!filterDept || e.department_id === filterDept) &&
    (!filterType || e.employee_type === filterType)
  )

  // ── grid template shared by column header + every data row ───
  const EGRID = '24px 130px 1fr 88px 150px 120px 76px'

  return (
    <div>

      {/* ══ N2: Offboarding Modal ════════════════════════════════ */}
      {offboardEmp && (() => {
        const { years, months, eosb } = calcEOSB(offboardEmp, offboardDate)
        const basic = +(offboardEmp.basic_salary || offboardEmp.bank_portion || 0)
        return (
          <div style={S.overlay}>
            <div style={{ background:'#fff', borderRadius:18, padding:28, width:480, maxWidth:'100%', maxHeight:'92vh', overflowY:'auto', boxShadow:'0 12px 48px rgba(0,0,0,0.22)' }}>
              <div style={{ fontSize:18, fontWeight:900, color:'#b71c1c', marginBottom:4 }}>🏁 Offboard Employee</div>
              <div style={{ fontSize:13, color:'#546e7a', marginBottom:20 }}>{offboardEmp.full_name_en || offboardEmp.full_name}</div>

              <div style={{ display:'flex', gap:12, marginBottom:14, flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:140 }}>
                  <label style={S.label}>Last Working Day</label>
                  <input type="date" style={S.inp} value={offboardDate}
                    onChange={e => setOffboardDate(e.target.value)} />
                </div>
                <div style={{ flex:1, minWidth:140 }}>
                  <label style={S.label}>Reason for Leaving</label>
                  <select style={S.inp} value={offboardReason} onChange={e => setOffboardReason(e.target.value)}>
                    <option value="RESIGNATION">Resignation</option>
                    <option value="TERMINATION">Termination</option>
                    <option value="CONTRACT_END">Contract End</option>
                    <option value="RETIREMENT">Retirement</option>
                    <option value="TRANSFER">Transfer</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom:14 }}>
                <label style={S.label}>Notes (optional)</label>
                <input style={S.inp} value={offboardNotes} onChange={e => setOffboardNotes(e.target.value)} placeholder="Internal notes…" />
              </div>

              {/* EOSB Calculation */}
              <div style={{ background:'#fff8e1', border:'1.5px solid #ffd54f', borderRadius:12, padding:16, marginBottom:20 }}>
                <div style={{ fontWeight:800, fontSize:13, color:'#e65100', marginBottom:10 }}>End of Service Benefit (EOSB)</div>
                <div style={{ display:'flex', gap:16, flexWrap:'wrap', fontSize:13, color:'#37474f' }}>
                  <div><strong>Service:</strong> {years} yrs ({months} months)</div>
                  <div><strong>Basic Salary:</strong> SAR {basic.toLocaleString()}</div>
                </div>
                <div style={{ marginTop:8, fontSize:11, color:'#6d4c41', lineHeight:1.6 }}>
                  First 5 yrs × 0.5 month + Beyond 5 yrs × 1 month
                </div>
                <div style={{ marginTop:12, fontSize:22, fontWeight:900, color: eosb > 0 ? '#2e7d32' : '#9e9e9e' }}>
                  SAR {eosb.toLocaleString('en', { minimumFractionDigits:2 })}
                </div>
                {eosb > 0 && (
                  <div style={{ fontSize:11, color:'#1b5e20', marginTop:4 }}>
                    A journal entry (DR EOSB Expense / CR EOSB Payable) will be auto-created.
                  </div>
                )}
                {years < 0.17 && (
                  <div style={{ fontSize:11, color:'#b71c1c', marginTop:4 }}>
                    ⚠ Less than 2 months service — EOSB is SAR 0.
                  </div>
                )}
              </div>

              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button style={{ ...S.inp, width:'auto', padding:'9px 18px', cursor:'pointer', background:'#f0f4f8', border:'none', borderRadius:8, fontWeight:700, fontSize:13 }}
                  onClick={() => setOffboardEmp(null)}>Cancel</button>
                <button
                  disabled={offboarding}
                  style={{ background: offboarding ? '#e5e7eb' : '#b71c1c', color:'#fff', border:'none', borderRadius:9, padding:'9px 22px', fontWeight:800, fontSize:13, cursor: offboarding ? 'default':'pointer' }}
                  onClick={handleOffboardConfirm}>
                  {offboarding ? '⏳ Processing…' : '🏁 Confirm Offboarding'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ══ STICKY: toolbar + stats + column headers ════════════ */}
      <div style={{ position:'sticky', top:0, zIndex:20, background:'#f4f7fb', boxShadow:'0 2px 6px rgba(0,0,0,0.06)' }}>

        {/* Row 1: KPIs + Button */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', padding:'10px 0 6px', scrollbarWidth:'none', alignItems:'center' }}>
          {[
            { label:'Total Employees', value:statsBase.length,                           color:'#1a2e3d', bg:'#f0f4f8' },
            { label:'Active',          value:statsBase.filter(e=>e.is_active).length,   color:'#2e7d32', bg:'#e8f5e9' },
            { label:'Inactive',        value:statsBase.filter(e=>!e.is_active).length,  color:'#c62828', bg:'#ffebee' },
            { label:salaryView==='bank'?'WPS Bank Total':salaryView==='cash'?'Cash Total':'Payroll Total',
              value:'SAR '+Math.round(totalSalary/1000)+'K',                            color:'#6a1b9a', bg:'#f3e5f5' },
          ].map(s => (
            <div key={s.label} style={{ background:`linear-gradient(135deg,${s.color}cc 0%,${s.color} 100%)`, borderRadius:10, padding:'10px 16px', flexShrink:0, minWidth:100, boxShadow:`0 3px 10px ${s.color}44`, position:'relative', overflow:'hidden' }}>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.85)', fontWeight:700, whiteSpace:'nowrap', textTransform:'uppercase', letterSpacing:0.8 }}>{s.label}</div>
              <div style={{ fontSize:20, fontWeight:900, color:'#fff', lineHeight:1.2, marginTop:2 }}>{s.value}</div>
            </div>
          ))}
          <button onClick={openNew} style={{ marginLeft:'auto', background:'#8C601B', color:'#fff', border:'none', borderRadius:10, padding:'10px 0', cursor:'pointer', fontSize:13, fontWeight:700, whiteSpace:'nowrap', flexShrink:0, minWidth:160, textAlign:'center', boxShadow:'0 3px 8px rgba(140,96,27,0.35)' }}>
            Add New Employee
          </button>
        </div>

        {/* Row 3: Filters */}
        <div style={{ display:'flex', gap:8, paddingBottom:8, alignItems:'center', flexWrap:'wrap' }}>
          <input placeholder="Search name, ID, mobile…" style={{ ...S.inp, flex:1, minWidth:150 }} value={search} onChange={e=>setSearch(e.target.value)} />
          <select value={filterDept} onChange={e=>setFilterDept(e.target.value)}
            style={{ ...S.inp, width:'auto', minWidth:140 }}>
            <option value="">All Departments</option>
            {depts.map(d => (
              <option key={d.id} value={d.id}>{d.dept_code || d.dept_name}</option>
            ))}
          </select>
          <select value={filterType} onChange={e=>setFilterType(e.target.value)}
            style={{ ...S.inp, width:'auto', minWidth:120 }}>
            <option value="">All Types</option>
            {empTypes(entityCode).map(t => (
              <option key={t} value={t}>{t.replace(/-/g,' ')}</option>
            ))}
          </select>
          {(filterDept || filterType) && (
            <button onClick={() => { setFilterDept(''); setFilterType('') }}
              style={{ background:'#f3e5f5', color:'#6a1b9a', border:'1px solid #ce93d8', borderRadius:8, padding:'6px 12px', cursor:'pointer', fontSize:12, fontWeight:700, whiteSpace:'nowrap' }}>
              ✕ Clear
            </button>
          )}
          <label style={{ ...S.toggle, fontSize:12, whiteSpace:'nowrap' }}>
            <input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)} /> Inactive
          </label>
          <button onClick={() => setShowExportDialog(true)} disabled={exporting}
            style={{ background:'#2e7d32', color:'#fff', border:'none', borderRadius:9, padding:'9px 16px', cursor:'pointer', fontSize:12, fontWeight:700, whiteSpace:'nowrap', opacity:exporting?0.7:1 }}>
            {exporting ? '⏳…' : '📊 Export'}
          </button>
          {/* Salary view toggle */}
          <div style={{ display:'flex', borderRadius:8, overflow:'hidden', border:'1px solid #ce93d8' }}>
            {[['total','💼 Total'],['bank','🏦 Bank (WPS)'],['cash','💵 Cash']].map(([v,l])=>(
              <button key={v} onClick={()=>setSalaryView(v)}
                style={{ padding:'7px 14px', border:'none', cursor:'pointer', fontSize:12, fontWeight:700, whiteSpace:'nowrap', background:salaryView===v?'#8e24aa':'#fff', color:salaryView===v?'#fff':'#8e24aa' }}>
                {l}
              </button>
            ))}
          </div>

        </div>

        {/* Column headers — solid white, sits flush above list rows */}
        <div style={{ display:'grid', gridTemplateColumns:EGRID, background:'#8C601B', borderBottom:'2px solid #7a5217', padding:'8px 14px', alignItems:'center' }}>
          {['','EMP #','Employee Name','Dept','Designation','Salary','Status'].map(h => (
            <div key={h} style={{ fontSize:10, color:'#fff', fontWeight:800, textTransform:'uppercase', letterSpacing:0.5, textAlign:'left' }}>{h}</div>
          ))}
        </div>
      </div>

      {/* ══ Employee List — collapsible rows ══════════════════════ */}
      <div style={{ background:'#fff', borderRadius:14, boxShadow:'0 2px 10px rgba(0,0,0,0.08)', overflow:'hidden' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:50, color:'#aab2bd' }}>Loading…</div>
        ) : filtered.length===0 ? (
          <div style={{ textAlign:'center', padding:50, color:'#aab2bd' }}>No employees found</div>
        ) : filtered.map((emp) => {
          const pkg    = empSalDisplay(emp)
          const isExp  = expandedRow===emp.id
          return (
            <div key={emp.id} style={{ opacity:emp.is_active?1:0.55 }}>
              {/* ── Collapsed row ── */}
              <div
                onClick={()=>setExpandedRow(isExp?null:emp.id)}
                style={{
                  display:'grid', gridTemplateColumns:EGRID,
                  padding:'8px 14px', cursor:'pointer', alignItems:'center',
                  borderBottom:'1px solid #f0eaf8',
                  background: isExp ? '#f3e5f5' : 'transparent',
                  transition:'background 0.12s',
                }}
                onMouseEnter={e=>{ if(!isExp) e.currentTarget.style.background='#fdf8ff' }}
                onMouseLeave={e=>{ if(!isExp) e.currentTarget.style.background='transparent' }}
              >
                {/* Chevron */}
                <div style={{ fontSize:10, color:'#b39ddb', transition:'transform 0.15s', transform:isExp?'rotate(90deg)':'none' }}>▶</div>
                {/* Emp # + avatar */}
                <div style={{ display:'flex', alignItems:'center', gap:7, textAlign:'left' }}>
                  <Avatar url={emp.photo_url||emp.photo_path} name={emp.full_name_en} size={28} />
                  <span style={{ fontSize:11, fontWeight:800, color:'#7b1fa2', whiteSpace:'nowrap' }}>{emp.employee_number||emp.employee_code||'—'}</span>
                </div>
                {/* Full name */}
                <div style={{ fontSize:13, fontWeight:700, color:'#1a2332', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:10, textAlign:'left' }}>
                  {emp.full_name_en}
                </div>
                {/* Dept */}
                <div style={{ textAlign:'left' }}>
                  {getDeptCode(emp.department_id)
                    ? <span style={{ background:'#ede7f6', color:'#6a1b9a', borderRadius:5, padding:'2px 8px', fontSize:10, fontWeight:800, whiteSpace:'nowrap' }}>{getDeptCode(emp.department_id)}</span>
                    : <span style={{ color:'#ccc' }}>—</span>
                  }
                </div>
                {/* Designation */}
                <div style={{ fontSize:12, color:'#546e7a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:8, textAlign:'left' }}>
                  {emp.designation || emp.job_title || <span style={{ color:'#ccc' }}>—</span>}
                </div>
                {/* Salary */}
                <div style={{ fontSize:13, fontWeight:800, color:'#6a1b9a', whiteSpace:'nowrap', textAlign:'left' }}>SAR {pkg.toLocaleString()}</div>
                {/* Status + Category */}
                <div style={{ textAlign:'left', display:'flex', flexDirection:'column', gap:4 }}>
                  <span style={{ background:emp.is_active?'#e8f5e9':'#ffebee', color:emp.is_active?'#2e7d32':'#c62828', borderRadius:20, padding:'2px 10px', fontSize:10, fontWeight:800, whiteSpace:'nowrap' }}>
                    {emp.is_active?'● Active':'○ Off'}
                  </span>
                  {emp.employee_category && (
                    <span style={{ background:CAT_BG[emp.employee_category]||'#f3e5f5', color:CAT_COLORS[emp.employee_category]||'#6a1b9a', borderRadius:8, padding:'2px 7px', fontSize:9, fontWeight:800, whiteSpace:'nowrap' }}>
                      {emp.employee_category} {CAT_LABELS[emp.employee_category]||''}
                    </span>
                  )}
                </div>
              </div>

              {/* ── Expanded detail panel ── */}
              {isExp && (
                <div style={{ background:'#f8f3ff', borderBottom:'2px solid #e1bee7', padding:'14px 20px 14px 48px' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(190px,1fr))', gap:'14px 24px' }}>
                    <div>
                      <div style={{ fontSize:10, fontWeight:800, color:'#9c27b0', marginBottom:6, letterSpacing:1 }}>EMPLOYMENT</div>
                      <div style={{ fontSize:12, color:'#546e7a' }}>Type: <strong>{(emp.employee_type||'REGULAR').replace(/_/g,' ')}</strong></div>
                      <div style={{ fontSize:12, color:'#546e7a' }}>Dept: <strong>{getDeptCode(emp.department_id)||getDeptName(emp.department_id)||'—'}</strong></div>
                      <div style={{ fontSize:12, color:'#546e7a' }}>Hire: <strong>{emp.hire_date||'—'}</strong></div>
                      {emp.contract_end_date && <div style={{ fontSize:12, color:'#e57373' }}>Ends: <strong>{emp.contract_end_date}</strong></div>}
                      <div style={{ fontSize:12, color:'#546e7a', marginTop:4 }}>📞 {emp.phone||'—'}</div>
                      {emp.email && <div style={{ fontSize:12, color:'#546e7a' }}>✉️ {emp.email}</div>}
                    </div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:800, color:'#9c27b0', marginBottom:6, letterSpacing:1 }}>SALARY (SAR)</div>
                      {((emp.basic_salary||0)+(emp.housing_allowance||0)+(emp.transport_allowance||0)) > 0 ? (<>
                        <div style={{ fontSize:12, color:'#546e7a' }}>Basic: <strong>{(emp.basic_salary||0).toLocaleString()}</strong></div>
                        <div style={{ fontSize:12, color:'#546e7a' }}>Housing: <strong>{(emp.housing_allowance||0).toLocaleString()}</strong></div>
                        <div style={{ fontSize:12, color:'#546e7a' }}>Transport: <strong>{(emp.transport_allowance||0).toLocaleString()}</strong></div>
                      </>) : (<>
                        <div style={{ fontSize:12, color:'#546e7a' }}>Bank (WPS): <strong>{(emp.bank_portion||0).toLocaleString()}</strong></div>
                        <div style={{ fontSize:12, color:'#546e7a' }}>Cash: <strong>{empCash(emp).toLocaleString()}</strong></div>
                        <div style={{ fontSize:12, color:'#1b5e20', fontWeight:700, marginTop:4 }}>Total: {empPkg(emp).toLocaleString()}</div>
                      </>)}
                    </div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:800, color:'#9c27b0', marginBottom:6, letterSpacing:1 }}>DOCUMENTS</div>
                      <div style={{ fontSize:12, color:'#546e7a' }}>Nationality: <strong>{emp.nationality||'—'}</strong></div>
                      <div style={{ fontSize:12, color:'#546e7a' }}>Iqama: <strong>{emp.iqama_number||'—'}</strong></div>
                      {emp.iqama_expiry && <div style={{ fontSize:12, color:'#e57373' }}>Iqama Exp: <strong>{emp.iqama_expiry}</strong></div>}
                      {emp.passport_expiry && <div style={{ fontSize:12, color:'#e57373' }}>Passport Exp: <strong>{emp.passport_expiry}</strong></div>}
                    </div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:800, color:'#9c27b0', marginBottom:6, letterSpacing:1 }}>BANKING</div>
                      <div style={{ fontSize:12, color:'#546e7a' }}>Bank: <strong>{emp.bank_name||'—'}</strong></div>
                      {emp.iban && <div style={{ fontSize:11, color:'#546e7a', fontFamily:'monospace', marginTop:2 }}>{emp.iban}</div>}
                    </div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:800, color:'#9c27b0', marginBottom:8, letterSpacing:1 }}>ELIGIBILITY</div>
                      <Flags emp={emp} />
                    </div>
                  </div>
                  <div style={{ marginTop:12, display:'flex', gap:8, flexWrap:'wrap' }}>
                    <button onClick={()=>setViewEmp(emp)} style={{ background:'#ede7f6', color:'#6a1b9a', border:'none', borderRadius:7, padding:'6px 14px', cursor:'pointer', fontSize:12, fontWeight:700 }}>👁 View</button>
                    <button onClick={()=>openEdit(emp)} style={{ background:'#e3f2fd', color:'#0277bd', border:'none', borderRadius:7, padding:'6px 14px', cursor:'pointer', fontSize:12, fontWeight:700 }}>✏ Edit</button>
                    <button onClick={()=>toggleActive(emp)} style={{ background:emp.is_active?'#ffebee':'#e8f5e9', color:emp.is_active?'#c62828':'#2e7d32', border:'none', borderRadius:7, padding:'6px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                      {emp.is_active?'⏸ Deactivate':'▶ Activate'}
                    </button>
                    {emp.qr_token && (
                      <QRButton
                        token={emp.qr_token}
                        name={emp.full_name_en}
                        sub={`${getDeptCode(emp.department_id)||'—'} · ${emp.employee_no||emp.employee_number||''}`}
                        type="employee"
                        size="md"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ══ VIEW MODAL ══════════════════════════════════════════ */}
      {viewEmp && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setViewEmp(null)}>
          <div style={S.modal}>
            {/* Header */}
            <div style={{ display:'flex', gap:16, alignItems:'center', marginBottom:20 }}>
              <Avatar url={viewEmp.photo_url||viewEmp.photo_path} name={viewEmp.full_name_en} size={64} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:'#9c27b0', fontWeight:800, letterSpacing:1 }}>{viewEmp.employee_number||viewEmp.employee_code}</div>
                <div style={{ fontSize:20, fontWeight:800, color:'#1a2332', lineHeight:1.2 }}>{viewEmp.full_name_en}</div>
                {viewEmp.full_name_ar && <div style={{ fontSize:12, color:'#999', direction:'rtl', textAlign:'left' }}>{viewEmp.full_name_ar}</div>}
                <div style={{ fontSize:13, color:'#6a1b9a', fontWeight:600, marginTop:2 }}>{viewEmp.designation}{viewEmp.job_title&&viewEmp.job_title!==viewEmp.designation?' · '+viewEmp.job_title:''}</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end' }}>
                <span style={{ background:viewEmp.is_active?'#e8f5e9':'#ffebee', color:viewEmp.is_active?'#2e7d32':'#c62828', borderRadius:20, padding:'4px 14px', fontSize:11, fontWeight:800 }}>
                  {viewEmp.is_active?'● Active':'○ Inactive'}
                </span>
                {viewEmp.employee_category && (
                  <span style={{ background:CAT_BG[viewEmp.employee_category]||'#ede7f6', color:CAT_COLORS[viewEmp.employee_category]||'#6a1b9a', borderRadius:8, padding:'3px 10px', fontSize:11, fontWeight:800 }}>
                    {viewEmp.employee_category} — {CAT_LABELS[viewEmp.employee_category]||(viewEmp.employee_type||'REGULAR').replace(/_/g,' ')}
                  </span>
                )}
                <span style={{ background:'#ede7f6', color:'#6a1b9a', borderRadius:8, padding:'3px 10px', fontSize:11, fontWeight:800 }}>
                  {(viewEmp.employee_type||'REGULAR').replace(/_/g,' ')}
                </span>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 28px' }}>
              <div>
                <div style={S.sec}>Personal</div>
                <Field label="Nationality" value={viewEmp.nationality} />
                <Field label="Email" value={viewEmp.email} />
                <Field label="Mobile" value={viewEmp.phone} />
                <Field label="Iqama / National ID" value={viewEmp.iqama_number} />
                <Field label="Iqama Expiry" value={viewEmp.iqama_expiry} />
                <Field label="Passport No" value={viewEmp.passport_number} />
                <Field label="Passport Expiry" value={viewEmp.passport_expiry} />
                <div style={S.sec}>Employment</div>
                <Field label="Designation" value={viewEmp.designation} />
                <Field label="Job Title" value={viewEmp.job_title} />
                <Field label="Department" value={getDeptName(viewEmp.department_id)} />
                <Field label="Hire Date" value={viewEmp.hire_date} />
                <Field label="Contract End" value={viewEmp.contract_end_date} />
              </div>
              <div>
                <div style={S.sec}>Salary (SAR)</div>
                {[['Basic Salary',viewEmp.basic_salary],['Housing Allowance',viewEmp.housing_allowance],['Conveyance / Transport',viewEmp.transport_allowance],['Mobile Allowance',viewEmp.mobile_allowance],['Medical Allowance',viewEmp.medical_allowance],['Technical Allowance',viewEmp.technical_allowance],['Other Allowance',viewEmp.other_allowance]].map(([l,v])=>(
                  (v||0)>0 && <Field key={l} label={l} value={(v||0).toLocaleString()} />
                ))}
                <div style={{ background:'#f3e5f5', borderRadius:8, padding:'8px 14px', marginBottom:6, display:'flex', justifyContent:'space-between' }}>
                  <span style={{ fontWeight:700, fontSize:12, color:'#6a1b9a' }}>Total Package</span>
                  <span style={{ fontWeight:800, fontSize:15, color:'#6a1b9a' }}>SAR {empPkg(viewEmp).toLocaleString()} <span style={{ fontSize:10, fontWeight:400, color:'#9c27b0' }}>(🏦 {(viewEmp.bank_portion||0).toLocaleString()} + 💵 {empCash(viewEmp).toLocaleString()})</span></span>
                </div>
                {/* Payment split */}
                {(viewEmp.bank_portion||0)>0 && (
                  <div style={{ background:'#e3f2fd', borderRadius:8, padding:'8px 14px', marginBottom:13, display:'flex', gap:16, flexWrap:'wrap', fontSize:12 }}>
                    <span>🏦 <strong>Bank (WPS):</strong> SAR {(viewEmp.bank_portion||0).toLocaleString()}</span>
                    <span>💵 <strong>Cash:</strong> SAR {empCash(viewEmp).toLocaleString()}</span>
                  </div>
                )}
                <div style={S.sec}>Banking</div>
                <Field label="Bank" value={viewEmp.bank_name} />
                <Field label="Account Number" value={viewEmp.bank_account_number} />
                <Field label="IBAN" value={viewEmp.iban} mono />
                <Field label="WPS Transfer (SAR)" value={viewEmp.bank_portion} />
                <div style={S.sec}>Eligibility</div>
                <Flags emp={viewEmp} />
                {viewEmp.has_dependents && <div style={{ fontSize:12, color:'#546e7a', marginTop:6 }}>Dependents: {viewEmp.num_dependents}</div>}

                {/* Payroll / GOSI / SCE panel */}
                {viewEmp.employee_category && (
                  <>
                    <div style={S.sec}>Payroll Details</div>
                    <Field label="Category" value={`${viewEmp.employee_category} — ${CAT_LABELS[viewEmp.employee_category]||''}`} />
                    <Field label="Entity" value={viewEmp.entity_code||'RATAL'} />
                    {viewEmp.outsource_agency && <Field label="Agency" value={viewEmp.outsource_agency} />}
                    {viewEmp.payment_mode && ['01','02'].includes(viewEmp.employee_category) && (
                      <Field label="Payment Mode" value={viewEmp.payment_mode.replace(/_/g,' ')} />
                    )}
                    {viewEmp.bank_fixed_amount>0 && <Field label="Bank Fixed Amt" value={`SAR ${Number(viewEmp.bank_fixed_amount).toLocaleString()}`} />}
                    {viewEmp.bank_portion_pct>0 && <Field label="Bank Portion %" value={`${viewEmp.bank_portion_pct}%`} />}
                    {viewEmp.initial_basic_salary>0 && <Field label="Initial Basic (joining)" value={`SAR ${Number(viewEmp.initial_basic_salary).toLocaleString()}`} />}
                  </>
                )}

                {(viewEmp.gosi_number||viewEmp.gosi_start_date) && (
                  <>
                    <div style={S.sec}>GOSI</div>
                    <Field label="GOSI #" value={viewEmp.gosi_number} />
                    <Field label="GOSI Start" value={viewEmp.gosi_start_date} />
                    {viewEmp.gosi_end_date && <Field label="GOSI End" value={viewEmp.gosi_end_date} />}
                  </>
                )}

                {viewEmp.sce_required && (
                  <>
                    <div style={S.sec}>SCE (Engineering Council)</div>
                    <Field label="SCE #" value={viewEmp.sce_number} />
                    <Field label="Category" value={viewEmp.sce_category} />
                    <Field label="Status" value={viewEmp.sce_status} />
                    <Field label="Issue Date" value={viewEmp.sce_issue_date} />
                    {viewEmp.sce_expiry_date && (
                      <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid #f0e6ff', fontSize:12 }}>
                        <span style={{ color:'#9e9e9e', fontWeight:600 }}>SCE Expiry</span>
                        <span style={{
                          fontWeight:700,
                          color: (() => {
                            const d=new Date(viewEmp.sce_expiry_date), n=new Date(), diff=Math.ceil((d-n)/86400000)
                            return diff<0?'#c62828':diff<=60?'#e65100':diff<=90?'#f57f17':'#2e7d32'
                          })()
                        }}>
                          {viewEmp.sce_expiry_date}
                          {(() => {
                            const d=new Date(viewEmp.sce_expiry_date), n=new Date(), diff=Math.ceil((d-n)/86400000)
                            if(diff<0) return ' ⛔ EXPIRED'
                            if(diff<=60) return ` ⚠️ ${diff}d`
                            if(diff<=90) return ` 🟡 ${diff}d`
                            return ''
                          })()}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Footer actions */}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16, paddingTop:14, borderTop:'1px solid #f3e5f5' }}>
              <button onClick={()=>setViewEmp(null)} style={{ background:'#f5f5f5', color:'#666', border:'none', borderRadius:9, padding:'9px 18px', cursor:'pointer', fontSize:13 }}>Close</button>
              {/* Print dropdown */}
              <div style={{ position:'relative' }}>
                <button onClick={()=>setShowPrint(p=>!p)} style={{ background:'#e8f5e9', color:'#2e7d32', border:'none', borderRadius:9, padding:'9px 16px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                  🖨️ Print ▾
                </button>
                {showPrint && (
                  <div style={{ position:'absolute', bottom:'110%', right:0, background:'#fff', borderRadius:10, boxShadow:'0 4px 20px rgba(0,0,0,0.15)', padding:8, minWidth:200, zIndex:10 }}>
                    <div style={{ fontSize:10, color:'#9e9e9e', fontWeight:700, padding:'4px 10px', letterSpacing:1 }}>SELECT TEMPLATE</div>
                    {[['id_card','🪪 Employee ID Card'],['profile','📄 Full Profile Sheet']].map(([t,l])=>(
                      <button key={t} onClick={()=>{ printEmployee({...viewEmp, _deptName: getDeptName(viewEmp.department_id)},t); setShowPrint(false) }}
                        style={{ display:'block', width:'100%', background:'none', border:'none', padding:'9px 12px', textAlign:'left', cursor:'pointer', fontSize:13, borderRadius:7, color:'#37474f' }}
                        onMouseEnter={e=>e.target.style.background='#f3e5f5'}
                        onMouseLeave={e=>e.target.style.background='none'}>
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={()=>openEdit(viewEmp)} style={{ background:'linear-gradient(135deg,#6a1b9a,#8e24aa)', color:'#fff', border:'none', borderRadius:9, padding:'9px 22px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                ✏ Edit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PageBanner ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); setStep(1); setOpen(true) }}
        chapterL1="#C8B48F"
        chapterL2="#FAF5E9"
        moduleColor="#8C601B"
        chapterLabel="Masters"
        formTitle={['Employee', 'Registration', 'Form']}
        steps={['Identity', 'Personal', 'Employment', 'Salary', 'Banking', 'Compliance']}
        icon="👤"
        description="Register sponsored, outsourced or contract employees. Employee number is automatically assigned."
      />

      {/* ══ EDIT / ADD MODAL (multi-step wizard — PDF layout) ═══ */}
      {open && (() => {
        const PRI = '#8C601B'   // Masters L3 accent
        const L1  = '#C8B48F'   // Masters outer frame
        const L2  = '#FAF5E9'   // Masters inner background
        const BLUE = PRI
        const STEP_NAMES = ['','Identity','Personal','Employment','Salary','Banking','Compliance']
        const STEP_DESC  = ['','Photo, type & employee name','Contact, ID & personal docs','Job title, dept & category','Salary & allowances (SAR)','Payment mode, GOSI & bank','Eligibility flags & compliance']
        const inp = (extra={}) => ({ ...S.inp, borderRadius:20, fontSize:13, ...extra })
        const inpLk = (extra={}) => ({ ...S.inpLock, borderRadius:20, fontSize:13, ...extra })
        const sec = { fontSize:10, fontWeight:800, color:PRI, letterSpacing:1.5, textTransform:'uppercase', marginBottom:10, marginTop:14, paddingBottom:5, borderBottom:`1.5px solid ${PRI}33` }
        return (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&(setOpen(false),resetForm())}>
          <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap'); *{box-sizing:border-box}`}</style>
          <div style={{ width:900, maxWidth:'calc(100vw - 24px)', borderRadius:18, overflow:'hidden', boxShadow:'0 28px 64px rgba(0,0,0,0.32)', fontFamily:POPPINS, background:L1, padding:8 }}>

            {/* ── STEPS 1–6 — 6-layer layout ── */}
            {step>=1 && (
              <div style={{ background:L2, borderRadius:12, display:'flex', minHeight:560, position:'relative', overflow:'hidden' }}>

                  {/* L3 accent corner */}
                  <div style={{ position:'absolute', top:0, right:0, width:'55%', height:'36%', background:PRI, borderRadius:'0 12px 0 90px', zIndex:1 }} />

                  {/* ── Left sidebar ── */}
                  <div style={{ width:220, flexShrink:0, padding:'20px 16px 16px', display:'flex', flexDirection:'column', fontFamily:POPPINS, position:'relative', zIndex:2 }}>
                    <div style={{ fontSize:9, fontWeight:800, color:'#53666F', letterSpacing:1.8, textTransform:'uppercase', marginBottom:3 }}>Ratal Advanced Technologies</div>
                    <div style={{ fontSize:9, fontWeight:800, color:PRI, letterSpacing:1.8, textTransform:'uppercase', marginBottom:16 }}><strong>Masters</strong></div>
                    <div style={{ fontSize:24, fontWeight:900, color:'#172D37', lineHeight:1.1, marginBottom:6 }}>{STEP_NAMES[step]}</div>
                    <div style={{ fontSize:11, color:'#53666F', lineHeight:1.5, marginBottom:8 }}>{STEP_DESC[step]}</div>
                    <div style={{ fontSize:9, fontWeight:800, color:PRI, letterSpacing:1, marginBottom:14 }}>STEP {step} OF 6</div>
                    {/* Step list — text only with left bars */}
                    <div style={{ flex:1, display:'flex', flexDirection:'column', gap:1 }}>
                      {['Identity','Personal','Employment','Salary','Banking','Compliance'].map((name,idx)=>{
                        const sn=idx+1, isAct=step===sn, isDone=step>sn
                        return (
                          <div key={sn} onClick={()=>isDone&&setStep(sn)} style={{ display:'flex', alignItems:'center', padding:'8px 0 8px 12px', cursor:isDone?'pointer':'default', borderLeft: isAct ? `3px solid ${PRI}` : isDone ? `3px solid ${PRI}55` : '3px solid rgba(0,0,0,0.08)' }}>
                            <span style={{ fontSize:12, fontWeight:isAct?700:500, color:isAct?'#172D37':isDone?PRI:'#b09070' }}>{name}</span>
                            {isDone && <span style={{ marginLeft:6, fontSize:10, color:PRI }}>✓</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* ── White card (L4) ── */}
                  <div style={{ position:'absolute', top:22, right:22, bottom:22, left:258, background:'#fff', borderRadius:16, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:`0 6px 24px ${PRI}22`, zIndex:3 }}>

                    {/* Card header: title + close */}
                    <div style={{ padding:'20px 24px 0', flexShrink:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                        <div>
                          <div style={{ fontSize:19, fontWeight:700, color:'#172D37', marginBottom:14 }}>
                            {['','Identity details','Personal details','Employment details','Salary & allowances','Banking & payment','Compliance & eligibility'][step]}
                          </div>
                        </div>
                        <button onClick={()=>{setOpen(false);resetForm()}} style={{ background:`${PRI}18`, border:'none', color:PRI, borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
                      </div>
                      <div style={{ height:1, background:`${PRI}22`, marginBottom:0 }} />
                    </div>

                    {/* Scrollable form content */}
                    <div style={{ flex:1, overflowY:'auto', padding:'16px 24px 14px', fontFamily:POPPINS }}>

                    {/* ── STEP 1 — Identity ── */}
                    {step===1 && <>
                      <div style={sec}>Employee Photo</div>
                      <div style={{ display:'flex', alignItems:'flex-start', gap:16, marginBottom:4 }}>
                        {/* Photo placeholder box */}
                        <div style={{ width:80, height:80, borderRadius:10, background:'#edf2f7', border:'1.5px solid #d0dae8', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, overflow:'hidden' }}>
                          {photoUrl
                            ? <img src={photoUrl} alt="photo" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                            : <span style={{ fontSize:11, color:'#90a4b4', fontWeight:700 }}>PHOTO</span>}
                        </div>
                        <div style={{ paddingTop:4 }}>
                          <input ref={photoRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>uploadPhoto(e.target.files[0])} />
                          <button onClick={()=>photoRef.current.click()} disabled={photoUploading} style={{ background:BLUE, color:'#fff', border:'none', borderRadius:24, padding:'9px 22px', cursor:'pointer', fontSize:13, fontWeight:700, display:'block', marginBottom:6 }}>
                            {photoUploading?'Uploading…':'Upload Photo'}
                          </button>
                          <div style={{ fontSize:11, color:'#8aabba', marginBottom:4 }}>JPG, PNG</div>
                          {photoUrl && <button onClick={()=>setPhotoUrl('')} style={{ background:'#ffebee', color:'#c62828', border:'none', borderRadius:16, padding:'4px 12px', cursor:'pointer', fontSize:11 }}>✕ Remove</button>}
                        </div>
                      </div>
                      <div style={{ fontSize:11, color:'#8aabba', marginBottom:14 }}>Shown on ID card and profile</div>
                      <div style={sec}>Employee ID &amp; Type</div>
                      <div style={S.row}>
                        <div style={S.col}>
                          <label style={S.label}>Employee Type {editing&&(isAdmin?<span style={{color:'#2e7d32',marginLeft:4}}>🔓 editable</span>:<span style={{color:'#e65100',marginLeft:4}}>🔒 locked</span>)}</label>
                          <select style={editing&&!isAdmin?inpLk():inp()} value={empType} disabled={editing&&!isAdmin} onChange={e=>{setEmpType(e.target.value);if(!editing)genEmpNum(e.target.value)}}>
                            {empTypes(entityCode).map(t=><option key={t} value={t}>{t.replace(/-/g,' ')}</option>)}
                          </select>
                        </div>
                        <div style={S.col}>
                          <label style={S.label}>Employee # (locked)</label>
                          <input style={inpLk()} value={empNum||'Auto-assigned'} readOnly />
                        </div>
                      </div>
                      <div style={sec}>Name</div>
                      <div style={S.row}>
                        <div style={S.col}>
                          <label style={S.label}>Full Name (English) * {editing&&(isAdmin?<span style={{color:'#2e7d32',marginLeft:4}}>🔓 editable</span>:<span style={{color:'#e65100',marginLeft:4}}>🔒</span>)}</label>
                          <input style={editing&&!isAdmin?inpLk():inp()} value={nameEn} readOnly={editing&&!isAdmin} onChange={e=>setNameEn(e.target.value)} />
                        </div>
                        <div style={S.col}>
                          <label style={S.label}>الاسم الكامل</label>
                          <input style={inp({direction:'rtl'})} value={nameAr} onChange={e=>setNameAr(e.target.value)} />
                        </div>
                      </div>
                    </>}

                    {/* ── STEP 2 — Personal ── */}
                    {step===2 && <>
                      <div style={sec}>Personal Information</div>
                      <div style={S.row}>
                        <div style={S.col}>
                          <label style={S.label}>Nationality</label>
                          <select style={inp()} value={nationality} onChange={e=>setNationality(e.target.value)}>
                            <option value="">— Select —</option>
                            {NATIONALITIES.map(n=><option key={n} value={n}>{n}</option>)}
                          </select>
                          {nationality&&<div style={{fontSize:10,color:BLUE,marginTop:3,fontWeight:700}}>GOSI: {nationality==='Saudi Arabian'?'Saudi — 9%':'Expat — 2%'}</div>}
                        </div>
                        <div style={S.col}><label style={S.label}>Email</label><input type="email" style={inp()} value={email} onChange={e=>setEmail(e.target.value)} /></div>
                        <div style={S.col}><label style={S.label}>Phone / Mobile</label><input style={inp()} value={phone} onChange={e=>setPhone(e.target.value)} /></div>
                        <div style={S.col}>
                          <label style={S.label}>Telegram Chat ID <span style={{fontWeight:400,color:'#aab2bd'}}>(notifications)</span></label>
                          <input style={inp()} value={telegramId} onChange={e=>setTelegramId(e.target.value)} placeholder="e.g. 123456789" />
                        </div>
                      </div>
                      <div style={sec}>Identity Documents</div>
                      <div style={S.row}>
                        <div style={S.col}><label style={S.label}>Iqama / National ID</label><input style={inp()} value={iqama} onChange={e=>setIqama(e.target.value)} /></div>
                        <div style={S.col}><label style={S.label}>Iqama Expiry</label><input type="date" style={inp()} value={iqamaExp} onChange={e=>setIqamaExp(e.target.value)} /></div>
                      </div>
                      <div style={S.row}>
                        <div style={S.col}><label style={S.label}>Passport No</label><input style={inp()} value={passport} onChange={e=>setPassport(e.target.value)} /></div>
                        <div style={S.col}><label style={S.label}>Passport Expiry</label><input type="date" style={inp()} value={passExp} onChange={e=>setPassExp(e.target.value)} /></div>
                        <div style={S.col}><label style={S.label}>Date of Birth</label><input type="date" style={inp()} value={dob} onChange={e=>setDob(e.target.value)} /></div>
                      </div>
                    </>}

                    {/* ── STEP 3 — Employment ── */}
                    {step===3 && <>
                      <div style={sec}>Employment Details</div>
                      <div style={S.row}>
                        <div style={S.col}>
                          <label style={S.label}>Designation</label>
                          <select style={inp()} value={designation} onChange={e=>setDesignation(e.target.value)}>
                            <option value="">-- Select --</option>
                            {DESIGNATIONS.map(d=><option key={d} value={d}>{d}</option>)}
                          </select>
                        </div>
                        <div style={S.col}><label style={S.label}>Job Title (custom)</label><input style={inp()} value={jobTitle} onChange={e=>setJobTitle(e.target.value)} /></div>
                      </div>
                      <div style={S.row}>
                        <div style={S.col}>
                          <label style={S.label}>Department</label>
                          <select style={inp()} value={deptId} onChange={e=>setDeptId(e.target.value)}>
                            <option value="">-- Select Department --</option>
                            {depts.map(d=><option key={d.id} value={d.id}>{d.dept_code||d.dept_name}</option>)}
                          </select>
                        </div>
                        <div style={S.col}><label style={S.label}>Hire Date</label><input type="date" style={inp()} value={hireDate} onChange={e=>setHireDate(e.target.value)} /></div>
                        <div style={S.col}><label style={S.label}>Contract End</label><input type="date" style={inp()} value={contractEnd} onChange={e=>setContractEnd(e.target.value)} /></div>
                      </div>
                      <div style={sec}>Payroll Category</div>
                      <div style={S.row}>
                        <div style={S.col}>
                          <label style={S.label}>Category *</label>
                          <select style={inp()} value={empCategory} onChange={e=>{setEmpCategory(e.target.value);if(e.target.value==='01')setPaymentMode('BANK_ONLY');if(e.target.value==='03'||e.target.value==='04')setPaymentMode('CASH_ONLY')}}>
                            <option value="01">01 — ACCSYS-LOCAL (Full Bank / WPS)</option>
                            <option value="02">02 — ACCSYS-EXPAT (Bank + Cash Split)</option>
                            <option value="03">03 — OUTSOURCED (Full Cash)</option>
                            <option value="04">04 — CONTRACT (Full Cash)</option>
                          </select>
                        </div>
                        <div style={S.col}>
                          <label style={S.label}>Entity</label>
                          <select style={inp()} value={entityCodeEmp} onChange={e=>setEntityCodeEmp(e.target.value)}>
                            <option value="RATAL">RATAL</option>
                            <option value="GREENWINGS">Greenwings</option>
                            <option value="RTT">RATAL Tours &amp; Travels</option>
                          </select>
                        </div>
                        {empCategory==='03' && <div style={S.col}><label style={S.label}>Outsource Agency</label><input style={inp()} value={outsourceAgency} onChange={e=>setOutsourceAgency(e.target.value)} placeholder="Agency / staffing company" /></div>}
                      </div>
                    </>}

                    {/* ── STEP 4 — Salary ── */}
                    {step===4 && <>
                      <div style={sec}>Salary &amp; Allowances (SAR)</div>
                      <div style={S.row}>
                        <div style={S.col}><label style={S.label}>Basic Salary</label><input type="number" step="0.01" style={inp()} value={basic} onChange={e=>setBasic(e.target.value)} /></div>
                        <div style={S.col}><label style={S.label}>Housing</label><input type="number" step="0.01" style={inp()} value={housing} onChange={e=>setHousing(e.target.value)} /></div>
                        <div style={S.col}><label style={S.label}>Transport</label><input type="number" step="0.01" style={inp()} value={transport} onChange={e=>setTransport(e.target.value)} /></div>
                      </div>
                      <div style={S.row}>
                        <div style={S.col}><label style={S.label}>Mobile / Phone Allowance</label><input type="number" step="0.01" style={inp()} value={mobileAllow} onChange={e=>setMobileAllow(e.target.value)} /></div>
                        <div style={S.col}><label style={S.label}>Medical Allowance</label><input type="number" step="0.01" style={inp()} value={medAllow} onChange={e=>setMedAllow(e.target.value)} /></div>
                        <div style={S.col}><label style={S.label}>Technical Allowance</label><input type="number" step="0.01" style={inp()} value={techAllow} onChange={e=>setTechAllow(e.target.value)} /></div>
                      </div>
                      <div style={S.row}>
                        <div style={S.col}><label style={S.label}>Other Allowance</label><input type="number" step="0.01" style={inp()} value={other} onChange={e=>setOther(e.target.value)} /></div>
                        <div style={S.col} /><div style={S.col} />
                      </div>
                      <div style={{ background:'#e3f2fd', borderRadius:20, padding:'10px 18px', marginTop:4, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontWeight:700, color:BLUE, fontSize:13 }}>Total Package:</span>
                        <span style={{ fontWeight:800, fontSize:16, color:BLUE }}>SAR {totalPkg.toLocaleString()}</span>
                      </div>
                    </>}

                    {/* ── STEP 5 — Banking ── */}
                    {step===5 && <>
                      <div style={sec}>Payment Mode</div>
                      {(empCategory==='01'||empCategory==='02') && (
                        <div style={S.row}>
                          <div style={S.col}>
                            <label style={S.label}>Payment Mode *</label>
                            <select style={inp()} value={paymentMode} onChange={e=>setPaymentMode(e.target.value)}>
                              <option value="BANK_ONLY">🏦 BANK ONLY — Full net to bank (WPS)</option>
                              <option value="BANK_CASH_SPLIT">🔀 BANK + CASH SPLIT</option>
                              <option value="CASH_ONLY">💵 CASH ONLY</option>
                            </select>
                          </div>
                          {paymentMode==='BANK_CASH_SPLIT' && <div style={S.col}><label style={S.label}>Bank Fixed Amount (SAR)</label><input type="number" step="0.01" style={inp()} value={bankFixedAmt} onChange={e=>setBankFixedAmt(e.target.value)} placeholder="e.g. 3000" /></div>}
                          {paymentMode==='BANK_CASH_SPLIT' && !bankFixedAmt && <div style={S.col}><label style={S.label}>Bank % of Net</label><input type="number" step="1" min="1" max="99" style={inp()} value={bankPctAmt} onChange={e=>setBankPctAmt(e.target.value)} placeholder="e.g. 60" /></div>}
                        </div>
                      )}
                      {(empCategory==='01'||empCategory==='02') && <>
                        <div style={sec}>GOSI</div>
                        <div style={S.row}>
                          <div style={S.col}><label style={S.label}>GOSI Number</label><input style={inp()} value={gosiNum} onChange={e=>setGosiNum(e.target.value)} placeholder="GOSI registration number" /></div>
                          <div style={S.col}><label style={S.label}>GOSI Start Date</label><input type="date" style={inp()} value={gosiStart} onChange={e=>setGosiStart(e.target.value)} /></div>
                          <div style={S.col}><label style={S.label}>GOSI End Date</label><input type="date" style={inp()} value={gosiEnd} onChange={e=>setGosiEnd(e.target.value)} /></div>
                        </div>
                      </>}
                      {empCategory==='02' && (
                        <div style={S.row}>
                          <div style={S.col}><label style={S.label}>Initial Basic at Joining (SAR)</label><input type="number" step="0.01" style={inp()} value={initialBasic} onChange={e=>setInitialBasic(e.target.value)} placeholder="Basic salary when first joined" /></div>
                          <div style={S.col} /><div style={S.col} />
                        </div>
                      )}
                      <div style={sec}>Bank Details</div>
                      <div style={S.row}>
                        <div style={S.col}>
                          <label style={S.label}>Bank</label>
                          <select style={inp()} value={selBank} onChange={e=>{setSelBank(e.target.value);setBankCode(e.target.value)}}>
                            <option value="">-- Select Bank --</option>
                            {SAUDI_BANKS.map(b=><option key={b.code} value={b.code}>{b.name} ({b.code})</option>)}
                          </select>
                        </div>
                        <div style={S.col}><label style={S.label}>Account Number</label><input style={inp()} value={bankAcc} onChange={e=>setBankAcc(e.target.value)} /></div>
                        <div style={S.col}><label style={S.label}>IBAN (SA…)</label><input style={inp()} value={iban} onChange={e=>setIban(e.target.value)} placeholder="SA0000000000000000000000" /></div>
                      </div>
                      <div style={S.row}>
                        <div style={S.col}><label style={S.label}>Bank Transfer / WPS (SAR)</label><input type="number" step="0.01" style={inp()} value={bankPortion} onChange={e=>setBankPortion(e.target.value)} placeholder="Amount to bank via WPS" /></div>
                        <div style={S.col}>
                          <label style={S.label}>Cash Portion (SAR) — auto</label>
                          <div style={{ ...inp(), background:'#f0fdf4', color:'#2e7d32', fontWeight:700, display:'flex', alignItems:'center' }}>
                            {autoCashPortion>0?autoCashPortion.toLocaleString():'0'} <span style={{fontSize:11,color:'#999',fontWeight:400,marginLeft:6}}>= {totalPkg.toLocaleString()} − {(parseFloat(bankPortion)||0).toLocaleString()}</span>
                          </div>
                        </div>
                        <div style={S.col}><label style={S.label}>WPS Code (auto)</label><input style={inp({background:'#f8fafc',color:'#546e7a',fontWeight:700})} value={selBank} readOnly /></div>
                      </div>
                    </>}

                    {/* ── STEP 6 — Compliance ── */}
                    {step===6 && <>
                      <div style={sec}>Eligibility Flags</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                        <label style={S.toggle}><input type="checkbox" checked={hasCar} onChange={e=>setHasCar(e.target.checked)} /> 🚗 Has Company Car</label>
                        <label style={S.toggle}><input type="checkbox" checked={otElig} onChange={e=>setOtElig(e.target.checked)} /> ⏱️ OT Eligible</label>
                        <label style={S.toggle}><input type="checkbox" checked={loanElig} onChange={e=>setLoanElig(e.target.checked)} /> 💳 Loan Eligible</label>
                        <label style={S.toggle}><input type="checkbox" checked={faElig} onChange={e=>setFaElig(e.target.checked)} /> 🍽️ Food Allowance Eligible</label>
                        <label style={S.toggle}><input type="checkbox" checked={hasDep} onChange={e=>setHasDep(e.target.checked)} /> 👨‍👩‍👧 Has Dependents</label>
                        <label style={S.toggle}><input type="checkbox" checked={wpsAllowed} onChange={e=>setWpsAllowed(e.target.checked)} /> 🏦 WPS Eligible</label>
                      </div>
                      {faElig && <div style={S.row}><div style={S.col}><label style={S.label}>FA Daily Rate (SAR)</label><input type="number" step="0.01" style={inp()} value={faAmount} onChange={e=>setFaAmount(e.target.value)} /></div></div>}
                      {hasDep && (
                        <div style={{ background:'#f0f9ff', borderRadius:12, padding:'10px 14px', marginBottom:12, border:'1px solid #bae6fd' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                            <span style={{ fontWeight:700, fontSize:12, color:BLUE }}>👨‍👩‍👧 Dependents — {depsData.length} registered</span>
                            <button type="button" onClick={()=>{setDepForm({full_name:'',gender:'',relation:'',date_of_birth:'',iqama_number:'',passport_number:'',passport_expiry:'',nationality:''});setEditingDepIdx(null);setShowDepsModal(true)}} style={{ background:BLUE, color:'#fff', border:'none', borderRadius:16, padding:'5px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>+ Add Dependent</button>
                          </div>
                          {depsData.length>0 && (
                            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                              <thead><tr style={{ background:'#e0f2fe' }}>{['Name','Relation','Gender','DOB',''].map(h=><th key={h} style={{ padding:'5px 8px', textAlign:'left', color:BLUE, fontWeight:700 }}>{h}</th>)}</tr></thead>
                              <tbody>
                                {depsData.map((d,i)=>(
                                  <tr key={i} style={{ borderBottom:'1px solid #bae6fd' }}>
                                    <td style={{ padding:'5px 8px', fontWeight:600 }}>{d.full_name}</td>
                                    <td style={{ padding:'5px 8px' }}>{d.relation}</td>
                                    <td style={{ padding:'5px 8px' }}>{d.gender}</td>
                                    <td style={{ padding:'5px 8px' }}>{d.date_of_birth||'—'}</td>
                                    <td style={{ padding:'5px 8px', whiteSpace:'nowrap' }}>
                                      <button type="button" onClick={()=>{setDepForm({...d});setEditingDepIdx(i);setShowDepsModal(true)}} style={{ background:'#e3f2fd', color:'#0277bd', border:'none', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:11, marginRight:4 }}>✏</button>
                                      <button type="button" onClick={()=>setDepsData(prev=>prev.filter((_,j)=>j!==i))} style={{ background:'#ffebee', color:'#c62828', border:'none', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:11 }}>✕</button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                      <div style={sec}>Certifications &amp; Compliance</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                        <label style={S.toggle}><input type="checkbox" checked={sceReg} onChange={e=>setSceReg(e.target.checked)} /> 🏛 Saudi Engineering Council (SCE)</label>
                        <label style={S.toggle}><input type="checkbox" checked={qiwaReg} onChange={e=>setQiwaReg(e.target.checked)} /> 💼 QIWA Registered</label>
                      </div>
                      {sceReg && <>
                        <div style={S.row}>
                          <div style={S.col}><label style={S.label}>SCE Number *</label><input style={inp()} value={sceNum} onChange={e=>setSceNum(e.target.value)} placeholder="SCE-XXXXXXXX" /></div>
                          <div style={S.col}>
                            <label style={S.label}>Category</label>
                            <select style={inp()} value={sceCategory} onChange={e=>setSceCategory(e.target.value)}>
                              <option value="">-- Discipline --</option>
                              {['Civil','Electrical','Mechanical','Chemical','Environmental','Structural','Architectural','IT','Other'].map(c=><option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                          <div style={S.col}>
                            <label style={S.label}>Status</label>
                            <select style={inp()} value={sceStatusField} onChange={e=>setSceStatusField(e.target.value)}>
                              <option value="VALID">✅ Valid</option>
                              <option value="RENEWAL_IN_PROGRESS">🔄 Renewal In Progress</option>
                              <option value="EXPIRED">🔴 Expired</option>
                            </select>
                          </div>
                        </div>
                        <div style={S.row}>
                          <div style={S.col}><label style={S.label}>Issue Date</label><input type="date" style={inp()} value={sceIssueDate} onChange={e=>setSceIssueDate(e.target.value)} /></div>
                          <div style={S.col}><label style={S.label}>Expiry Date *</label><input type="date" style={inp()} value={sceExpiry} onChange={e=>setSceExpiry(e.target.value)} /></div>
                          <div style={S.col} />
                        </div>
                        {sceExpiry && (()=>{const d=(new Date(sceExpiry)-new Date())/86400000|0;return d<=90?(<div style={{ background:d<=0?'#ffebee':d<=30?'#fff3e0':'#fffde7', border:`1px solid ${d<=0?'#e53935':d<=30?'#fb8c00':'#f9a825'}`, borderRadius:8, padding:'8px 12px', marginBottom:8, fontSize:12, fontWeight:700, color:d<=0?'#b71c1c':d<=30?'#e65100':'#f57f17' }}>{d<=0?'🔴 SCE EXPIRED — Iqama renewal BLOCKED':d<=30?`⚠️ SCE expires in ${d} days — CRITICAL`:`⚠️ SCE expires in ${d} days`}</div>):null})()}
                      </>}
                      {qiwaReg && <div style={S.row}><div style={S.col}><label style={S.label}>QIWA Expiry Date</label><input type="date" style={inp()} value={qiwaExpiry} onChange={e=>setQiwaExpiry(e.target.value)} /></div><div style={S.col} /></div>}
                    </>}

                  </div>{/* end scrollable */}

                  {/* ── Footer INSIDE white card ── */}
                  <div style={{ flexShrink:0, padding:'12px 24px 16px', borderTop:`1px solid ${PRI}22`, display:'flex', justifyContent:'space-between', alignItems:'center', fontFamily:POPPINS }}>
                    <button
                      onClick={step===1?()=>{setOpen(false);resetForm()}:()=>setStep(s=>s-1)}
                      style={{ background:'#747474', color:'#fff', border:'none', borderRadius:24, padding:'9px 26px', cursor:'pointer', fontSize:13, fontWeight:600 }}>
                      {step===1?'Cancel':'Back'}
                    </button>
                    <div style={{ textAlign:'center', fontSize:10, color:'#53666F', fontFamily:POPPINS }}>Employee number is automatically assigned</div>
                    {step<6 ? (
                      <button onClick={()=>setStep(s=>s+1)} style={{ background:PRI, color:'#fff', border:'none', borderRadius:24, padding:'9px 30px', cursor:'pointer', fontSize:13, fontWeight:700, boxShadow:`0 4px 14px ${PRI}44` }}>
                        Save &amp; Next
                      </button>
                    ) : (
                      <button onClick={save} disabled={saving} style={{ background:saving?'#c7c7c7':PRI, color:'#fff', border:'none', borderRadius:24, padding:'9px 30px', cursor:saving?'not-allowed':'pointer', fontSize:13, fontWeight:700, boxShadow:saving?'none':`0 4px 14px ${PRI}44` }}>
                        {saving?'Saving…':editing?'✓ Update Employee':'✓ Add Employee'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
        )
      })()}

      {/* ══ RE-ACTIVATION MODAL ════════════════════════════════ */}
      {activateEmp && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setActivateEmp(null)}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, width:480, maxWidth:'100%', boxShadow:'0 12px 48px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin:'0 0 6px', fontSize:16, fontWeight:800, color:'#2e7d32' }}>▶ Re-Activate Employee</h3>
            <p style={{ margin:'0 0 18px', fontSize:13, color:'#546e7a' }}>
              <strong>{activateEmp.full_name_en}</strong> — Start date is mandatory. A new employment period will be logged preserving full history.
            </p>
            <div style={{ marginBottom:13 }}>
              <label style={S.label}>Start Date (Re-joining Date) <span style={{ color:'#c62828' }}>*</span></label>
              <input type="date" style={S.inp} value={activateDate} onChange={e=>setActivateDate(e.target.value)} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={S.label}>Notes / Reason for Re-joining</label>
              <input style={S.inp} value={activateReason} onChange={e=>setActivateReason(e.target.value)} placeholder="e.g. Contract renewed, returned from leave" />
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={()=>setActivateEmp(null)} style={{ background:'#f0f4f8', color:'#555', border:'none', borderRadius:9, padding:'10px 20px', cursor:'pointer', fontSize:13 }}>Cancel</button>
              <button onClick={handleActivateConfirm} disabled={activating||!activateDate} style={{ background:'#2e7d32', color:'#fff', border:'none', borderRadius:9, padding:'10px 24px', cursor:'pointer', fontSize:13, fontWeight:700, opacity:activating||!activateDate?0.6:1 }}>
                {activating ? 'Activating…' : '▶ Confirm Re-activation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ DEPENDENTS SUB-MODAL ═══════════════════════════════ */}
      {showDepsModal && (
        <div style={{ ...S.overlay, zIndex:1100 }} onClick={e=>e.target===e.currentTarget&&setShowDepsModal(false)}>
          <div style={{ background:'#fff', borderRadius:16, padding:24, width:560, maxWidth:'100%', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 12px 48px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin:'0 0 16px', fontSize:15, fontWeight:800, color:'#6a1b9a' }}>
              👨‍👩‍👧 {editingDepIdx===null ? 'Add Dependent' : 'Edit Dependent'}
            </h3>
            <div style={S.row}>
              <div style={{ ...S.col, flex:2 }}>
                <label style={S.label}>Full Name <span style={{ color:'#c62828' }}>*</span></label>
                <input style={S.inp} value={depForm.full_name} onChange={e=>setDepForm(p=>({...p,full_name:e.target.value}))} />
              </div>
              <div style={S.col}>
                <label style={S.label}>Gender</label>
                <select style={S.inp} value={depForm.gender} onChange={e=>setDepForm(p=>({...p,gender:e.target.value}))}>
                  <option value="">-- Select --</option>
                  {['Male','Female'].map(g=><option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>Relation</label>
                <select style={S.inp} value={depForm.relation} onChange={e=>setDepForm(p=>({...p,relation:e.target.value}))}>
                  <option value="">-- Select --</option>
                  {['Son','Daughter','Wife','Other'].map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={S.col}>
                <label style={S.label}>Date of Birth</label>
                <input type="date" style={S.inp} value={depForm.date_of_birth} onChange={e=>setDepForm(p=>({...p,date_of_birth:e.target.value}))} />
              </div>
              <div style={S.col}>
                <label style={S.label}>Nationality</label>
                <select style={S.inp} value={depForm.nationality} onChange={e=>setDepForm(p=>({...p,nationality:e.target.value}))}>
                  <option value="">-- Select --</option>
                  {NATIONALITIES.map(n=><option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Iqama No.</label><input style={S.inp} value={depForm.iqama_number} onChange={e=>setDepForm(p=>({...p,iqama_number:e.target.value}))} /></div>
              <div style={S.col}><label style={S.label}>Passport No.</label><input style={S.inp} value={depForm.passport_number} onChange={e=>setDepForm(p=>({...p,passport_number:e.target.value}))} /></div>
              <div style={S.col}><label style={S.label}>Passport Expiry</label><input type="date" style={S.inp} value={depForm.passport_expiry} onChange={e=>setDepForm(p=>({...p,passport_expiry:e.target.value}))} /></div>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:12 }}>
              <button type="button" onClick={()=>setShowDepsModal(false)} style={{ background:'#f0f4f8', color:'#555', border:'none', borderRadius:9, padding:'9px 18px', cursor:'pointer', fontSize:13 }}>Cancel</button>
              <button type="button" onClick={()=>{
                if (!depForm.full_name) { alert('Full name is required'); return }
                if (editingDepIdx===null) {
                  setDepsData(prev=>[...prev, { ...depForm }])
                } else {
                  setDepsData(prev=>prev.map((d,i)=>i===editingDepIdx?{...depForm}:d))
                }
                setNumDep(prev => editingDepIdx===null ? (parseInt(prev)||0)+1 : prev)
                setShowDepsModal(false)
              }} style={{ background:'#6a1b9a', color:'#fff', border:'none', borderRadius:9, padding:'9px 22px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                {editingDepIdx===null ? 'Add' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ EXPORT DIALOG ══════════════════════════════════════ */}
      {showExportDialog && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setShowExportDialog(false)}>
          <div style={{ background:'#fff', borderRadius:18, padding:28, width:420, maxWidth:'100%', boxShadow:'0 12px 48px rgba(0,0,0,0.22)' }}>
            <h3 style={{ margin:'0 0 6px', fontSize:16, fontWeight:800 }}>📊 Export Salary Sheet</h3>
            <p style={{ margin:'0 0 20px', fontSize:12, color:'#6b7c93' }}>
              Generates one Excel file with a <strong>Summary</strong> tab and one tab per department.
              Numbers formatted as <code>#,##0.00</code>. Each dept tab includes Department Head and Accounts signature lines.
            </p>

            <label style={S.label}>Select Month</label>
            <input
              type="month"
              style={{ ...S.inp, marginBottom:12 }}
              value={exportMonth}
              onChange={e=>setExportMonth(e.target.value)}
            />

            {!hasPayrollNote && (
              <div style={{ background:'#fff3e0', borderRadius:8, padding:'8px 12px', marginBottom:14, fontSize:12, color:'#e65100' }}>
                💡 OT, Deductions and Penalties are pulled from the saved payroll run for the selected month.
                If no payroll run exists, those columns will show 0.
              </div>
            )}

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:4 }}>
              <button onClick={()=>setShowExportDialog(false)} style={{ background:'#f0f4f8', color:'#555', border:'none', borderRadius:9, padding:'10px 18px', cursor:'pointer', fontSize:13 }}>
                Cancel
              </button>
              <button
                onClick={async()=>{
                  setShowExportDialog(false)
                  setExporting(true)
                  try { await exportToExcel(exportMonth) } finally { setExporting(false) }
                }}
                style={{ background:'#2e7d32', color:'#fff', border:'none', borderRadius:9, padding:'10px 24px', cursor:'pointer', fontSize:13, fontWeight:700 }}
              >
                ⬇ Download Excel
              </button>
            </div>
          </div>
        </div>
      )}
  </div>
)
}
