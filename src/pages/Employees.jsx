import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import FormShell from '../components/FormShell'
import { GROUP_COLORS, CHAPTER_PALETTES, kpiCardGradient, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import { QRButton } from '../components/QRCard'
import EntityDocs from '../components/EntityDocs'
const MC = GROUP_COLORS.Masters  // Masters chapter (Ch02)
const PAL = CHAPTER_PALETTES.Masters
const L1  = PAL.L1   // '#C8B48F'
const L2  = PAL.L2   // '#FAF5E9'
const L3  = PAL.L3   // '#8C601B'
const PP  = "'Poppins',sans-serif"

const POPPINS = PP
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
// Field roles available when generating QR from Employee record
const QR_FIELD_ROLES = [
  { value:'STAFF_TECH',       label:'Staff Technician',   emp_type:'STAFF'   },
  { value:'STAFF_SUPERVISOR', label:'Staff Supervisor',   emp_type:'STAFF'   },
  { value:'STAFF_PM',         label:'Project Manager',    emp_type:'STAFF'   },
  { value:'STAFF_DH',         label:'Department Head',    emp_type:'STAFF'   },
  { value:'OUTSOURCED',       label:'Outsourced Staff',   emp_type:'OUTSOURCED' },
  { value:'DRIVER',           label:'Driver',             emp_type:'STAFF'   },
  { value:'FINANCE',          label:'Finance / Accounts', emp_type:'STAFF'   },
]
const QR_PROD_ORIGIN = import.meta.env.VITE_APP_URL || 'https://ratal-group.vercel.app'
function qrFieldUrl(token) {
  const origin = window.location.hostname === 'localhost' ? QR_PROD_ORIGIN : window.location.origin
  return `${origin}/forms?t=${token}`
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
function printEmployee(emp, template, deps=[]) {
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

  const cash = pkg - (emp.bank_portion||0)
  const empNo = emp.employee_number||emp.employee_code||''
  const empType = emp.employee_category ? (({'01':'ACCSYS-LOCAL','02':'ACCSYS-EXPAT','03':'OUTSOURCED','04':'CONTRACT'})[emp.employee_category]||emp.employee_type||'') : (emp.employee_type||'REGULAR').replace(/_/g,' ')
  const qrPayload = [`Employee Profile`,`Name: ${emp.full_name_en||''}`,`ID: ${empNo}`,`Iqama: ${emp.iqama_number||''}`,`Nationality: ${emp.nationality||''}`,`Designation: ${emp.designation||''}`,`Department: ${emp._deptName||''}`,`Employer: Ratal Advanced Technologies`,`Status: ${emp.is_active?'Active':'Inactive'}`].join('\\n')

  function fRow(lbl,val,mono=false,warn=false){
    const color = warn&&val ? '#b71c1c' : '#111'
    return `<tr><td style="color:#aaa;font-size:9px;font-weight:600;padding:4px 0;white-space:nowrap;">${lbl}</td><td style="font-size:10px;font-weight:600;color:${color};text-align:right;${mono?'font-family:monospace;font-size:9px;':''}">${val||'—'}</td></tr>`
  }
  function secCard(dot,title,rows){
    return `<div style="background:#fafafa;border-radius:8px;padding:10px 12px;border:1px solid #f0f0f0;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:7px;padding-bottom:5px;border-bottom:1px solid #eee;">
        <div style="width:8px;height:8px;border-radius:50%;background:${dot};flex-shrink:0;"></div>
        <span style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1.3px;color:${dot};">${title}</span>
      </div>
      <table style="width:100%;border-collapse:collapse;">${rows}</table>
    </div>`
  }

  const photoBlock = emp.photo_url
    ? `<img src="${emp.photo_url}" style="width:72px;height:72px;border-radius:10px;object-fit:cover;border:2px solid #b2dfdb;flex-shrink:0;" />`
    : `<div style="width:72px;height:72px;border-radius:10px;background:linear-gradient(135deg,#00897b,#26c6da);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:#fff;flex-shrink:0;">${(emp.full_name_en||'').split(' ').slice(0,2).map(w=>w[0]||'').join('')}</div>`

  const flags = [
    emp.has_car?'🚗 Company Car':'',
    emp.ot_eligible?'OT Eligible':'',
    emp.fa_eligible?'Food Allowance':'',
    emp.loan_eligible?'Loan Eligible':'',
    emp.wps_allowed?'WPS':'',
    emp.has_dependents?`${emp.num_dependents} Dependents`:'',
  ].filter(Boolean)

  const profile = `
<div style="width:740px;font-family:'Segoe UI',Arial,sans-serif;background:#fff;border:1px solid #ddd;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

  <!-- TOP BAR -->
  <div style="height:6px;background:linear-gradient(90deg,#00897b,#26c6da,#4dd0e1);"></div>

  <!-- HEADER -->
  <div style="padding:16px 20px 12px;border-bottom:1px solid #f0f0f0;display:flex;gap:14px;align-items:flex-start;">
    ${photoBlock}
    <div style="flex:1;min-width:0;">
      <div style="font-size:9px;font-weight:700;color:#00897b;letter-spacing:1.8px;text-transform:uppercase;margin-bottom:3px;">${empNo} &nbsp;·&nbsp; Employee Profile</div>
      <div style="font-size:17px;font-weight:700;color:#111;line-height:1.2;">${emp.full_name_en||''}</div>
      ${emp.full_name_ar?`<div style="font-size:9px;color:#aaa;direction:rtl;text-align:left;margin-top:1px;">${emp.full_name_ar}</div>`:''}
      <div style="font-size:10px;color:#00897b;font-weight:600;margin-top:3px;">${emp.designation||''}${emp.job_title&&emp.job_title!==emp.designation?' &nbsp;·&nbsp; '+emp.job_title:''} &nbsp;·&nbsp; ${emp._deptName||''}</div>
      <div style="display:flex;gap:5px;margin-top:6px;flex-wrap:wrap;">
        <span style="font-size:8px;font-weight:700;padding:3px 9px;border-radius:10px;background:${emp.is_active?'#e8f5e9':'#ffebee'};color:${emp.is_active?'#2e7d32':'#c62828'};">${emp.is_active?'● Active':'○ Inactive'}</span>
        <span style="font-size:8px;font-weight:700;padding:3px 9px;border-radius:10px;background:#e0f2f1;color:#00695c;">${empType}</span>
        ${emp.nationality?`<span style="font-size:8px;font-weight:700;padding:3px 9px;border-radius:10px;background:#f3e5f5;color:#6a1b9a;">${emp.nationality}</span>`:''}
        ${emp.hire_date?`<span style="font-size:8px;font-weight:600;padding:3px 9px;border-radius:10px;background:#f5f5f5;color:#666;">Hired ${emp.hire_date}</span>`:''}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;">
      <div id="qr-emp" style="width:72px;height:72px;background:#f5f5f5;border-radius:4px;border:1px solid #eee;display:flex;align-items:center;justify-content:center;overflow:hidden;"></div>
      <div style="font-size:7px;color:#aaa;font-weight:600;letter-spacing:0.5px;">Scan to verify</div>
    </div>
  </div>

  <!-- PERSONAL + EMPLOYMENT -->
  <div style="padding:12px 16px;display:grid;grid-template-columns:1fr 1fr;gap:10px;border-bottom:1px solid #f0f0f0;">
    ${secCard('#00897b','Personal',
      fRow('Nationality', emp.nationality)+
      fRow('Iqama / National ID', emp.iqama_number, true)+
      fRow('Iqama Expiry', emp.iqama_expiry, false, true)+
      fRow('Passport No.', emp.passport_number, true)+
      fRow('Passport Expiry', emp.passport_expiry, false, true)+
      fRow('Date of Birth', emp.date_of_birth)+
      fRow('Mobile', emp.phone)+
      fRow('Email', emp.email)
    )}
    ${secCard('#0288d1','Employment',
      fRow('Designation', emp.designation)+
      fRow('Job Title', emp.job_title)+
      fRow('Department', emp._deptName)+
      fRow('Entity', emp.entity_code||'RATAL')+
      fRow('Employee Type', empType)+
      fRow('Hire Date', emp.hire_date)+
      fRow('Contract End', emp.contract_end_date)+
      fRow('GOSI Number', emp.gosi_number, true)
    )}
  </div>

  <!-- SALARY FULL WIDTH -->
  <div style="margin:12px 16px;background:#f0fdf8;border-radius:8px;padding:10px 12px;border:1px solid #b2dfdb;">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
      <div style="width:8px;height:8px;border-radius:50%;background:#00897b;"></div>
      <span style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1.3px;color:#00695c;">Salary Breakdown (SAR)</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px;">
      ${[['Basic Salary',emp.basic_salary],['Housing Allow.',emp.housing_allowance],['Transport',emp.transport_allowance],['Mobile Allow.',emp.mobile_allowance],['Medical Allow.',emp.medical_allowance],['Technical Allow.',emp.technical_allowance],['Other Allow.',emp.other_allowance]].filter(([,v])=>(v||0)>0).slice(0,8).map(([l,v])=>`<div style="background:#fff;border-radius:5px;padding:5px 7px;text-align:center;border:1px solid #e0f2f1;"><div style="font-size:7px;color:#80cbc4;font-weight:700;">${l}</div><div style="font-size:11px;color:#00695c;font-weight:800;">${(v||0).toLocaleString()}</div></div>`).join('')}
    </div>
    <div style="background:#00897b;border-radius:6px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:8px;font-weight:800;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1px;">Total Package</div>
        <div style="font-size:8px;color:rgba(255,255,255,0.65);margin-top:2px;">Bank (WPS): SAR ${(emp.bank_portion||0).toLocaleString()} &nbsp;·&nbsp; Cash: SAR ${cash.toLocaleString()}</div>
      </div>
      <div style="font-size:15px;font-weight:800;color:#fff;">SAR ${pkg.toLocaleString()}</div>
    </div>
  </div>

  <!-- BANKING + COMPLIANCE -->
  <div style="padding:0 16px 12px;display:grid;grid-template-columns:1fr 1fr;gap:10px;border-bottom:1px solid #f0f0f0;">
    ${secCard('#00897b','Banking',
      fRow('Bank', emp.bank_name)+
      fRow('Account No.', emp.bank_account_number, true)+
      fRow('IBAN', emp.iban, true)+
      fRow('WPS Transfer (SAR)', emp.bank_portion?(emp.bank_portion).toLocaleString():'')
    )}
    ${secCard('#7b1fa2','Compliance & Insurance',
      fRow('GOSI Start', emp.gosi_start_date)+
      fRow('Insurance Policy #', emp.insurance_policy_no, true)+
      fRow('Insurance Expiry', emp.insurance_expiry_date, false, true)+
      fRow('SCE Number', emp.sce_number, true)+
      fRow('SCE Category', emp.sce_category)+
      fRow('SCE Expiry', emp.sce_expiry_date, false, true)
    )}
  </div>

  ${flags.length>0?`<div style="padding:8px 16px;display:flex;gap:5px;flex-wrap:wrap;border-bottom:1px solid #f0f0f0;">${flags.map(f=>`<span style="font-size:8px;font-weight:700;padding:3px 9px;border-radius:10px;background:#e0f2f1;color:#00695c;">${f}</span>`).join('')}</div>`:''}

  ${deps&&deps.length>0?`
  <!-- DEPENDANTS -->
  <div style="margin:10px 16px 8px;border-radius:8px;overflow:hidden;border:1px solid #e0f2f1;">
    <div style="background:#00897b;padding:7px 12px;display:flex;align-items:center;gap:7px;">
      <div style="width:7px;height:7px;border-radius:50%;background:#fff;flex-shrink:0;"></div>
      <span style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:1.3px;color:#fff;">Registered Dependants (${deps.length})</span>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:8px;">
      <thead>
        <tr style="background:#e0f2f1;">
          <th style="padding:5px 8px;text-align:left;font-size:7px;font-weight:800;color:#00695c;letter-spacing:0.5px;white-space:nowrap;">#</th>
          <th style="padding:5px 8px;text-align:left;font-size:7px;font-weight:800;color:#00695c;letter-spacing:0.5px;white-space:nowrap;">Name</th>
          <th style="padding:5px 8px;text-align:left;font-size:7px;font-weight:800;color:#00695c;letter-spacing:0.5px;white-space:nowrap;">Relation</th>
          <th style="padding:5px 8px;text-align:left;font-size:7px;font-weight:800;color:#00695c;letter-spacing:0.5px;white-space:nowrap;">DOB / Gender</th>
          <th style="padding:5px 8px;text-align:left;font-size:7px;font-weight:800;color:#00695c;letter-spacing:0.5px;white-space:nowrap;">Nationality</th>
          <th style="padding:5px 8px;text-align:left;font-size:7px;font-weight:800;color:#00695c;letter-spacing:0.5px;white-space:nowrap;">Iqama #</th>
          <th style="padding:5px 8px;text-align:left;font-size:7px;font-weight:800;color:#00695c;letter-spacing:0.5px;white-space:nowrap;">Passport #</th>
          <th style="padding:5px 8px;text-align:left;font-size:7px;font-weight:800;color:#00695c;letter-spacing:0.5px;white-space:nowrap;">Insurance Policy #</th>
          <th style="padding:5px 8px;text-align:left;font-size:7px;font-weight:800;color:#00695c;letter-spacing:0.5px;white-space:nowrap;">Ins. Expiry</th>
        </tr>
      </thead>
      <tbody>
        ${deps.map((d,i)=>`
        <tr style="background:${i%2===0?'#fff':'#f8fdfc'};border-bottom:1px solid #e0f2f1;">
          <td style="padding:5px 8px;color:#666;font-weight:600;">${i+1}</td>
          <td style="padding:5px 8px;color:#1a2332;font-weight:700;">${d.full_name_en||d.name||'—'}</td>
          <td style="padding:5px 8px;color:#333;">${d.relationship||d.relation||'—'}</td>
          <td style="padding:5px 8px;color:#333;white-space:nowrap;">${d.date_of_birth||'—'} ${d.gender?`/ ${d.gender}`:''}</td>
          <td style="padding:5px 8px;color:#333;">${d.nationality||'—'}</td>
          <td style="padding:5px 8px;color:#333;font-family:monospace;">${d.iqama_number||'—'}</td>
          <td style="padding:5px 8px;color:#333;font-family:monospace;">${d.passport_number||'—'}</td>
          <td style="padding:5px 8px;color:#333;font-family:monospace;">${d.insurance_policy_no||'—'}</td>
          <td style="padding:5px 8px;color:${d.insurance_expiry_date&&new Date(d.insurance_expiry_date)<new Date()?'#b71c1c':'#333'};">${d.insurance_expiry_date||'—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>
  `:''}

  <!-- FOOTER -->
  <div style="padding:10px 16px;display:flex;justify-content:space-between;align-items:flex-end;">
    <div style="display:flex;gap:24px;">
      <div style="display:flex;flex-direction:column;gap:3px;"><div style="height:24px;"></div><div style="width:100px;border-top:1px dashed #ccc;padding-top:3px;font-size:7px;color:#aaa;font-weight:600;letter-spacing:0.5px;">AUTHORIZED SIGNATORY</div></div>
      <div style="display:flex;flex-direction:column;gap:3px;"><div style="height:24px;"></div><div style="width:100px;border-top:1px dashed #ccc;padding-top:3px;font-size:7px;color:#aaa;font-weight:600;letter-spacing:0.5px;">HR MANAGER</div></div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
      <div style="width:60px;height:44px;border:1.5px dashed #ccc;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:7px;color:#ccc;font-weight:600;text-align:center;">COMPANY<br>STAMP</div>
      <div style="font-size:7px;color:#ccc;">Printed: ${new Date().toLocaleDateString()} &nbsp;·&nbsp; Ratal Group ERP &nbsp;·&nbsp; Confidential</div>
    </div>
  </div>
</div>`

  const html = template==='id_card' ? idCard : profile
  const win = window.open('','_blank','width=860,height=900')
  win.document.write(`<!DOCTYPE html><html><head><title>Employee Profile - ${emp.full_name_en||''}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script>
<style>
  *{box-sizing:border-box;}
  body{margin:0;padding:24px;background:#f0f4f8;display:flex;flex-direction:column;align-items:center;font-family:'Segoe UI',Arial,sans-serif;}
  @media print{body{background:#fff;padding:0;}.no-print{display:none!important;}}
</style>
</head><body>
${html}
<div class="no-print" style="margin-top:18px;display:flex;gap:10px;">
  <button onclick="window.print()" style="background:#00897b;color:#fff;border:none;padding:10px 28px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;">🖨️ Print / Save PDF</button>
  <button onclick="window.close()" style="background:#eee;color:#555;border:none;padding:10px 20px;border-radius:8px;font-size:13px;cursor:pointer;">Close</button>
</div>
<script>
(function(){
  var el=document.getElementById('qr-emp');
  if(!el||typeof QRCode==='undefined')return;
  try{new QRCode(el,{text:${JSON.stringify(qrPayload.replace(/\\n/g,'\n'))},width:68,height:68,colorDark:'#00695c',colorLight:'#ffffff'});}catch(e){}
})();
<\/script>
</body></html>`)
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
  const [viewEmpTab,   setViewEmpTab]   = useState('details')
  const [showPrint,    setShowPrint]    = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const photoRef = useRef()

  // ── QR Access state ─────────────────────────────────────────
  const [qrToken,      setQrToken]      = useState(null)   // token row from qr_tokens
  const [qrRole,       setQrRole]       = useState('STAFF_TECH')
  const [qrLoading,    setQrLoading]    = useState(false)
  const [qrGenerating, setQrGenerating] = useState(false)

  async function loadEmpQR(empId) {
    setQrLoading(true)
    const { data } = await supabase
      .from('qr_tokens')
      .select('*')
      .eq('employee_id', empId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setQrToken(data || null)
    if (data?.role) setQrRole(data.role)
    setQrLoading(false)
  }

  async function generateEmpQR(emp) {
    setQrGenerating(true)
    try {
      const arr = new Uint8Array(24)
      crypto.getRandomValues(arr)
      const token = Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('')
      const roleObj = QR_FIELD_ROLES.find(r => r.value === qrRole)
      const { data, error } = await supabase.from('qr_tokens').insert({
        token,
        employee_id:     emp.id,
        entity_id:       emp.entity_id || entityId,
        role:            qrRole,
        employment_type: roleObj?.emp_type || 'STAFF',
        is_active:       true,
        notes:           null,
        expires_at:      null,
        generated_at:    new Date().toISOString(),
      }).select('*').single()
      if (error) throw error
      setQrToken(data)
      // Refresh employee list row
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, qr_token: token } : e))
    } catch (e) {
      alert('Failed to generate QR: ' + (e.message || e))
    } finally {
      setQrGenerating(false)
    }
  }

  async function revokeEmpQR() {
    if (!qrToken) return
    if (!window.confirm('Revoke this QR token? The employee will lose field access immediately.')) return
    await supabase.from('qr_tokens').update({ is_active: false, revoked_at: new Date().toISOString() }).eq('id', qrToken.id)
    setQrToken(prev => ({ ...prev, is_active: false, revoked_at: new Date().toISOString() }))
  }

  // ── Dependents state ────────────────────────────────────────
  const [deps,         setDeps]         = useState([])
  const [depsLoading,  setDepsLoading]  = useState(false)
  const [showDepForm,  setShowDepForm]  = useState(false)
  const [editDep,      setEditDep]      = useState(null)
  const [depSaving,    setDepSaving]    = useState(false)
  const [viewDepForm,  setViewDepForm]  = useState({
    full_name:'', gender:'Male', relationship:'Wife',
    id_type:'Iqama', id_number:'', nationality:'',
    birth_date:'', marital_status:'Single', mobile:'',
    insurance_scheme:'', iqama_expiry:'',
    passport_number:'', passport_expiry:'', insurance_expiry:'',
  })

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
  const [qiwaReg,           setQiwaReg]           = useState(false)
  const [qiwaExpiry,        setQiwaExpiry]        = useState('')
  // Employee insurance (current policy year)
  const [insurancePolicyNo, setInsurancePolicyNo] = useState('')
  const [insuranceExpiry,   setInsuranceExpiry]   = useState('')
  // Dependents
  const [depsData,       setDepsData]       = useState([])
  const [showDepsModal,  setShowDepsModal]  = useState(false)
  const [editingDepIdx,  setEditingDepIdx]  = useState(null)
  const EMPTY_DEP = { full_name:'', gender:'', relation:'', date_of_birth:'', iqama_number:'', passport_number:'', passport_expiry:'', nationality:'', insurance_policy_no:'', insurance_expiry_date:'' }
  const [depForm,        setDepForm]        = useState(EMPTY_DEP)
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

  // ── Vacation Ticket ──────────────────────────────────────────
  const [vacTicketElig, setVacTicketElig] = useState(false)
  const [ticketCycle,   setTicketCycle]   = useState('EVERY_YEAR')

  // ── Family Status ────────────────────────────────────────────
  const [familyStatus,  setFamilyStatus]  = useState(false)
  const [spouseCount,   setSpouseCount]   = useState(0)
  const [childCount,    setChildCount]    = useState(0)
  const [otherDepCount, setOtherDepCount] = useState(0)
  const [famTicketElig, setFamTicketElig] = useState(false)
  const [famInsurElig,  setFamInsurElig]  = useState(false)

  // ── Home Address & Emergency Contact ─────────────────────────
  const [homeCountry,   setHomeCountry]   = useState('')
  const [homeCity,      setHomeCity]      = useState('')
  const [homePhone,     setHomePhone]     = useState('')
  const [emergName,     setEmergName]     = useState('')
  const [emergRelation, setEmergRelation] = useState('Father')
  const [emergPhone,    setEmergPhone]    = useState('')

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
    // Vacation ticket
    setVacTicketElig(emp.vacation_ticket_eligible||false)
    setTicketCycle(emp.ticket_cycle||'EVERY_YEAR')
    // Family status
    setFamilyStatus(emp.family_status||emp.has_dependents||false)
    setSpouseCount(emp.family_spouse_count||0)
    setChildCount(emp.family_children_count||0)
    setOtherDepCount(emp.family_other_count||0)
    setFamTicketElig(emp.family_ticket_eligible||false)
    setFamInsurElig(emp.family_insurance_eligible||false)
    // Home address & emergency contact
    setHomeCountry(emp.home_country||'')
    setHomeCity(emp.home_city||'')
    setHomePhone(emp.home_phone||'')
    setEmergName(emp.emergency_contact_name||'')
    setEmergRelation(emp.emergency_contact_relation||'Father')
    setEmergPhone(emp.emergency_contact_phone||'')
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
    setInsurancePolicyNo(emp.insurance_policy_no||''); setInsuranceExpiry(emp.insurance_expiry_date||'')
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
    setInsurancePolicyNo(''); setInsuranceExpiry('')
    setDepsData([]); setDepForm({ full_name:'', gender:'', relation:'', date_of_birth:'', iqama_number:'', passport_number:'', passport_expiry:'', nationality:'', insurance_policy_no:'', insurance_expiry_date:'' })
    // Vacation ticket
    setVacTicketElig(false); setTicketCycle('EVERY_YEAR')
    // Family status
    setFamilyStatus(false); setSpouseCount(0); setChildCount(0); setOtherDepCount(0)
    setFamTicketElig(false); setFamInsurElig(false)
    // Home address & emergency contact
    setHomeCountry(''); setHomeCity(''); setHomePhone('')
    setEmergName(''); setEmergRelation('Father'); setEmergPhone('')
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
      overtime_eligible: otElig,
      fa_eligible: faElig,
      food_allowance_eligible: faElig,
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
      insurance_policy_no:   insurancePolicyNo || null,
      insurance_expiry_date: insuranceExpiry   || null,
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
      // Vacation ticket
      vacation_ticket_eligible: vacTicketElig,
      ticket_cycle: vacTicketElig ? ticketCycle : 'EVERY_YEAR',
      // Family status
      family_status:             familyStatus,
      family_spouse_count:       familyStatus ? parseInt(spouseCount)||0  : 0,
      family_children_count:     familyStatus ? parseInt(childCount)||0   : 0,
      family_other_count:        familyStatus ? parseInt(otherDepCount)||0 : 0,
      family_ticket_eligible:    familyStatus ? famTicketElig   : false,
      family_insurance_eligible: familyStatus ? famInsurElig    : false,
      // Keep legacy columns in sync
      has_dependents: familyStatus && (parseInt(spouseCount)||0)+(parseInt(childCount)||0)+(parseInt(otherDepCount)||0) > 0,
      num_dependents: familyStatus ? (parseInt(spouseCount)||0)+(parseInt(childCount)||0)+(parseInt(otherDepCount)||0) : 0,
      // Home address & emergency contact
      home_country:               homeCountry||null,
      home_city:                  homeCity||null,
      home_phone:                 homePhone||null,
      emergency_contact_name:     emergName||null,
      emergency_contact_relation: emergRelation||null,
      emergency_contact_phone:    emergPhone||null,
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

  // ── Dependents CRUD ─────────────────────────────────────────
  const BLANK_DEP = {
    full_name:'', gender:'Male', relationship:'Wife',
    id_type:'Iqama', id_number:'', nationality:'',
    birth_date:'', marital_status:'Single', mobile:'',
    insurance_scheme:'', iqama_expiry:'',
    passport_number:'', passport_expiry:'', insurance_expiry:'',
  }

  async function loadDeps(empId) {
    if (!empId) return
    setDepsLoading(true)
    const { data } = await supabase
      .from('employee_dependents')
      .select('*')
      .eq('employee_id', empId)
      .eq('entity_id', entityId)
      .order('created_at')
    setDeps(data || [])
    setDepsLoading(false)
  }

  async function saveDep() {
    if (!viewDepForm.full_name) return alert('Full name is required')
    setDepSaving(true)
    const payload = {
      ...viewDepForm,
      employee_id: viewEmp?.id,
      entity_id: entityId,
      birth_date:       viewDepForm.birth_date       || null,
      iqama_expiry:     viewDepForm.iqama_expiry     || null,
      passport_expiry:  viewDepForm.passport_expiry  || null,
      insurance_expiry: viewDepForm.insurance_expiry || null,
    }
    if (editDep) {
      await supabase.from('employee_dependents').update(payload).eq('id', editDep.id)
    } else {
      await supabase.from('employee_dependents').insert(payload)
    }
    setDepSaving(false)
    setShowDepForm(false)
    setEditDep(null)
    setViewDepForm(BLANK_DEP)
    loadDeps(viewEmp?.id)
  }

  async function deleteDep(id) {
    if (!window.confirm('Delete this dependent?')) return
    await supabase.from('employee_dependents').delete().eq('id', id)
    loadDeps(viewEmp?.id)
  }

  async function exportInsuranceList() {
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

    // Fetch all active employees
    const { data: emps } = await supabase
      .from('employees')
      .select('id,full_name_en,employee_number,iqama_number,gender,nationality,birth_date,marital_status,mobile,department_id')
      .eq('entity_id', entityId)
      .eq('is_active', true)
      .order('employee_number')

    // Fetch all active dependents
    const { data: allDeps } = await supabase
      .from('employee_dependents')
      .select('*')
      .eq('entity_id', entityId)
      .eq('is_active', true)

    const depsByEmpId = {}
    ;(allDeps || []).forEach(d => {
      if (!depsByEmpId[d.employee_id]) depsByEmpId[d.employee_id] = []
      depsByEmpId[d.employee_id].push(d)
    })

    const HDRS = ['SR No.','Full Name','Gender','Relationship','ID Type','ID Number','Sponsor ID','Nationality','Birth Date','Marital Status','Mobile No#','Scheme']
    const rows = [HDRS]
    let sr = 1

    ;(emps || []).forEach(emp => {
      // Employee row (relationship = 'Employee')
      rows.push([
        sr++,
        emp.full_name_en || '',
        emp.gender || '',
        'Employee',
        'Iqama',
        emp.iqama_number || '',
        emp.iqama_number || '',   // sponsor of self
        emp.nationality || '',
        emp.birth_date || '',
        emp.marital_status || '',
        emp.mobile || '',
        '',
      ])
      // Dependent rows
      ;(depsByEmpId[emp.id] || []).forEach(dep => {
        rows.push([
          sr++,
          dep.full_name || '',
          dep.gender || '',
          dep.relationship || '',
          dep.id_type || '',
          dep.id_number || '',
          emp.iqama_number || '',   // sponsor = parent employee iqama
          dep.nationality || '',
          dep.birth_date || '',
          dep.marital_status || '',
          dep.mobile || '',
          dep.insurance_scheme || '',
        ])
      })
    })

    const ws = XL.utils.aoa_to_sheet(rows)
    ws['!cols'] = [5,30,8,12,12,20,20,18,12,14,16,8].map(w=>({wch:w}))
    const wb = XL.utils.book_new()
    XL.utils.book_append_sheet(wb, ws, 'Insurance List')
    XL.writeFile(wb, `Insurance_List_${new Date().toISOString().slice(0,10)}.xlsx`)
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
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:L2, fontFamily:PP }}>

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

      {/* ══ UPPER ZONE — flexShrink:0 ═══════════════════════════ */}
      <div style={{ flexShrink:0, background:L2, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', zIndex:10 }}>

        {/* L1 bar */}
        <div style={{ background:L2, padding:'6px 28px 0' }}>
          <div style={{ background:L1, padding:'8px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', borderRadius:'6px 6px 0 0' }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#fff', fontFamily:PP }}>Employees</div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.8)', marginTop:2 }}>Masters · Employee directory</div>
            </div>
            <button onClick={openNew} style={{ background:L3, color:'#fff', border:'none', borderRadius:7, padding:'7px 16px', cursor:'pointer', fontSize:12, fontWeight:700, fontFamily:PP }}>
              + Add New Employee
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, padding:'10px 28px 12px', background:L2 }}>
          {[
            { label:'Total Employees', value:statsBase.length },
            { label:'Active',          value:statsBase.filter(e=>e.is_active).length },
            { label:'Inactive',        value:statsBase.filter(e=>!e.is_active).length },
            { label:salaryView==='bank'?'WPS Bank Total':salaryView==='cash'?'Cash Total':'Payroll Total',
              value:'SAR '+Math.round(totalSalary/1000)+'K' },
          ].map((s, i) => {
            const gs = kpiCardGradient(i, L1, L2, L3)
            return (
              <div key={s.label} style={{ width:160, height:62, borderRadius:10, padding:'0 14px', display:'flex', flexDirection:'column', justifyContent:'center', flexShrink:0, ...gs }}>
                <div style={{ fontSize:9, fontWeight:700, whiteSpace:'nowrap', textTransform:'uppercase', letterSpacing:0.8, opacity:0.85 }}>{s.label}</div>
                <div style={{ fontSize:20, fontWeight:900, lineHeight:1.2, marginTop:2 }}>{s.value}</div>
              </div>
            )
          })}
        </div>

        {/* Filter bar */}
        <div style={{ padding:'6px 28px 8px', background:L2 }}>
          <div style={{ display:'flex', gap:8, background:'#fff', padding:'10px 14px', borderRadius:8, boxShadow:'0 1px 4px rgba(0,0,0,0.08)', flexWrap:'wrap', alignItems:'center' }}>
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
            <button onClick={exportInsuranceList}
              style={{ background:'#0277bd', color:'#fff', border:'none', borderRadius:9, padding:'9px 16px', cursor:'pointer', fontSize:12, fontWeight:700, whiteSpace:'nowrap' }}>
              🏥 Insurance List
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
        </div>

        {/* Column header */}
        <div style={{ padding:'0 28px' }}>
          <div style={{ display:'grid', gridTemplateColumns:EGRID, background:L3, padding:'8px 14px', borderRadius:'6px 6px 0 0', alignItems:'center' }}>
            {['','EMP #','Employee Name','Dept','Designation','Salary','Status'].map(h => (
              <div key={h} style={{ fontSize:10, color:'#fff', fontWeight:800, textTransform:'uppercase', letterSpacing:0.5, textAlign:'left' }}>{h}</div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ SCROLL ZONE ══════════════════════════════════════════ */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 28px 22px' }}>
      {/* ══ Employee List — collapsible rows ══════════════════════ */}
      <div style={{ background:'#fff', borderRadius:'0 0 8px 8px', boxShadow:'0 2px 8px rgba(0,0,0,0.08)', overflow:'hidden' }}>
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
                  {emp.employee_category && emp.employee_category !== 'ACCSYS-LOCAL' && (
                    <span style={{ background:CAT_BG[emp.employee_category]||'#f3e5f5', color:CAT_COLORS[emp.employee_category]||'#6a1b9a', borderRadius:8, padding:'2px 7px', fontSize:9, fontWeight:800, whiteSpace:'nowrap' }}>
                      {emp.employee_category}
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
                    <button onClick={()=>{ setViewEmpTab('details'); setViewEmp(emp) }} style={{ background:'#ede7f6', color:'#6a1b9a', border:'none', borderRadius:7, padding:'6px 14px', cursor:'pointer', fontSize:12, fontWeight:700 }}>👁 View</button>
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
      </div>{/* end scroll zone */}

      {/* ══ VIEW MODAL ══════════════════════════════════════════ */}
      {viewEmp && (()=>{
        function VCard({ icon, title, accent='#6a1b9a', children }) {
          return (
            <div style={{ background:'#fff', borderRadius:12, border:'1px solid #ede9f8', marginBottom:14, overflow:'hidden', boxShadow:'0 1px 6px rgba(106,27,154,0.06)' }}>
              <div style={{ background:`linear-gradient(90deg,${accent}18,#fff)`, padding:'9px 14px', display:'flex', alignItems:'center', gap:8, borderBottom:'1px solid #f3ebff' }}>
                <span style={{ fontSize:13 }}>{icon}</span>
                <span style={{ fontSize:10, fontWeight:800, color:accent, letterSpacing:1.3, textTransform:'uppercase' }}>{title}</span>
              </div>
              <div style={{ padding:'8px 14px' }}>{children}</div>
            </div>
          )
        }
        function VField({ label, value, mono, highlight }) {
          return (
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'5px 0', borderBottom:'1px solid #faf5ff' }}>
              <span style={{ fontSize:10, color:'#b0bcc8', fontWeight:600, flexShrink:0, marginRight:8, minWidth:90 }}>{label}</span>
              <span style={{ fontSize:12, color:highlight||(value?'#1a2332':'#ccc'), fontFamily:mono?'monospace':'inherit', fontWeight:value?600:400, textAlign:'right', wordBreak:'break-all' }}>{value||'—'}</span>
            </div>
          )
        }
        const pkg = empPkg(viewEmp)
        const cash = empCash(viewEmp)
        return (
          <div style={{ position:'fixed', inset:0, background:'rgba(15,15,35,0.60)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:12, fontFamily:POPPINS }}
            onClick={e=>e.target===e.currentTarget&&setViewEmp(null)}>
            <div onClick={e=>e.stopPropagation()} style={{ background:'#fff', borderRadius:20, width:'min(880px,98vw)', height:'min(90vh,820px)', display:'flex', flexDirection:'column', boxShadow:'0 28px 64px rgba(0,0,0,0.30)', overflow:'hidden' }}>

              {/* ── HERO BANNER ─────────────────────────── */}
              <div style={{ background:'linear-gradient(135deg,#6a1b9a 0%,#9c27b0 60%,#ba68c8 100%)', padding:'20px 24px 18px', flexShrink:0, position:'relative' }}>
                <button onClick={()=>setViewEmp(null)} style={{ position:'absolute', top:12, right:14, background:'rgba(255,255,255,0.2)', border:'none', borderRadius:'50%', width:28, height:28, color:'#fff', fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                <div style={{ display:'flex', gap:16, alignItems:'center' }}>
                  <div style={{ width:78, height:78, borderRadius:'50%', padding:3, background:'rgba(255,255,255,0.25)', flexShrink:0 }}>
                    <Avatar url={viewEmp.photo_url||viewEmp.photo_path} name={viewEmp.full_name_en} size={72} />
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.65)', fontWeight:700, letterSpacing:1.8, marginBottom:3 }}>{viewEmp.employee_number||viewEmp.employee_code}</div>
                    <div style={{ fontSize:21, fontWeight:800, color:'#fff', lineHeight:1.15, marginBottom:2 }}>{viewEmp.full_name_en}</div>
                    {viewEmp.full_name_ar && <div style={{ fontSize:11, color:'#e1bee7', direction:'rtl', textAlign:'left', marginBottom:3 }}>{viewEmp.full_name_ar}</div>}
                    <div style={{ fontSize:12, color:'#e1bee7', fontWeight:600 }}>{viewEmp.designation}{viewEmp.job_title&&viewEmp.job_title!==viewEmp.designation?' · '+viewEmp.job_title:''}</div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:5, alignItems:'flex-end', flexShrink:0 }}>
                    <span style={{ background:viewEmp.is_active?'#43a047':'#e53935', color:'#fff', borderRadius:20, padding:'4px 14px', fontSize:11, fontWeight:800 }}>
                      {viewEmp.is_active?'● Active':'○ Inactive'}
                    </span>
                    <span style={{ background:'rgba(255,255,255,0.2)', color:'#fff', borderRadius:8, padding:'3px 10px', fontSize:11, fontWeight:700 }}>
                      {viewEmp.employee_category
                        ? CAT_LABELS[viewEmp.employee_category] || (viewEmp.employee_type||'REGULAR').replace(/_/g,' ')
                        : (viewEmp.employee_type||'REGULAR').replace(/_/g,' ')}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── TAB BAR ─────────────────────────────── */}
              <div style={{ display:'flex', background:'#fff', borderBottom:'2px solid #f3e5f5', flexShrink:0, paddingLeft:8 }}>
                {[['details','📋 Details'],['docs','📎 Documents'],['dependents','👨‍👩‍👧 Dependents'],['qr','🔑 QR Access']].map(([k,l])=>(
                  <button key={k}
                    onClick={()=>{
                      setViewEmpTab(k)
                      if (k==='dependents') loadDeps(viewEmp?.id)
                      if (k==='qr') loadEmpQR(viewEmp?.id)
                    }}
                    style={{ background:'none', border:'none', padding:'11px 20px', fontSize:12, fontWeight:700, cursor:'pointer', color:viewEmpTab===k?'#6a1b9a':'#9e9e9e', borderBottom:viewEmpTab===k?'3px solid #6a1b9a':'3px solid transparent', marginBottom:-2, whiteSpace:'nowrap' }}>
                    {l}
                    {k==='dependents' && deps.length>0 && (
                      <span style={{ marginLeft:5, background:'#6a1b9a', color:'#fff', borderRadius:10, padding:'1px 6px', fontSize:10 }}>{deps.length}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* ── SCROLLABLE BODY ──────────────────────── */}
              <div style={{ flex:1, overflowY:'auto', padding:'18px 20px', background:'#faf7ff' }}>

                {viewEmpTab === 'details' && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 18px' }}>
                    {/* LEFT */}
                    <div>
                      <VCard icon="👤" title="Personal">
                        <VField label="Nationality"        value={viewEmp.nationality} />
                        <VField label="Email"              value={viewEmp.email} />
                        <VField label="Mobile"             value={viewEmp.phone} />
                        <VField label="Iqama / National ID" value={viewEmp.iqama_number} />
                        <VField label="Iqama Expiry"       value={viewEmp.iqama_expiry} />
                        <VField label="Passport No."       value={viewEmp.passport_number} mono />
                        <VField label="Passport Expiry"    value={viewEmp.passport_expiry} />
                      </VCard>
                      <VCard icon="💼" title="Employment" accent="#1565c0">
                        <VField label="Designation"   value={viewEmp.designation} />
                        <VField label="Job Title"     value={viewEmp.job_title} />
                        <VField label="Department"    value={getDeptName(viewEmp.department_id)} />
                        <VField label="Hire Date"     value={viewEmp.hire_date} />
                        <VField label="Contract End"  value={viewEmp.contract_end_date} />
                      </VCard>
                      <VCard icon="🏷️" title="Eligibility" accent="#2e7d32">
                        <Flags emp={viewEmp} />
                        {viewEmp.has_dependents && <div style={{ fontSize:11, color:'#546e7a', marginTop:6 }}>Dependents: {viewEmp.num_dependents}</div>}
                      </VCard>
                    </div>
                    {/* RIGHT */}
                    <div>
                      <VCard icon="💰" title="Salary (SAR)" accent="#e65100">
                        {[['Basic Salary',viewEmp.basic_salary],['Housing Allowance',viewEmp.housing_allowance],['Conveyance / Transport',viewEmp.transport_allowance],['Mobile Allowance',viewEmp.mobile_allowance],['Medical Allowance',viewEmp.medical_allowance],['Technical Allowance',viewEmp.technical_allowance],['Other Allowance',viewEmp.other_allowance]].map(([l,v])=>(
                          (v||0)>0 && <VField key={l} label={l} value={(v||0).toLocaleString()} />
                        ))}
                        <div style={{ background:'linear-gradient(90deg,#f3e5f5,#ede7f6)', borderRadius:8, padding:'10px 12px', marginTop:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                          <span style={{ fontWeight:800, fontSize:10, color:'#6a1b9a', textTransform:'uppercase', letterSpacing:1 }}>Total Package</span>
                          <span style={{ fontWeight:900, fontSize:16, color:'#6a1b9a' }}>SAR {pkg.toLocaleString()}</span>
                        </div>
                        {(viewEmp.bank_portion||0)>0 && (
                          <div style={{ background:'#e3f2fd', borderRadius:8, padding:'8px 12px', marginTop:6, display:'flex', gap:16, flexWrap:'wrap', fontSize:11 }}>
                            <span>🏦 <strong>Bank (WPS):</strong> SAR {(viewEmp.bank_portion||0).toLocaleString()}</span>
                            <span>💵 <strong>Cash:</strong> SAR {cash.toLocaleString()}</span>
                          </div>
                        )}
                      </VCard>
                      <VCard icon="🏦" title="Banking" accent="#01579b">
                        <VField label="Bank"              value={viewEmp.bank_name} />
                        <VField label="Account Number"    value={viewEmp.bank_account_number} mono />
                        <VField label="IBAN"              value={viewEmp.iban} mono />
                        <VField label="WPS Transfer (SAR)" value={viewEmp.bank_portion} />
                      </VCard>
                      {viewEmp.employee_category && (
                        <VCard icon="📊" title="Payroll Details" accent="#4527a0">
                          <VField label="Category" value={`${viewEmp.employee_category} — ${CAT_LABELS[viewEmp.employee_category]||''}`} />
                          <VField label="Entity"   value={viewEmp.entity_code||'RATAL'} />
                          {viewEmp.outsource_agency && <VField label="Agency" value={viewEmp.outsource_agency} />}
                          {viewEmp.payment_mode && ['01','02'].includes(viewEmp.employee_category) && <VField label="Payment Mode" value={viewEmp.payment_mode.replace(/_/g,' ')} />}
                          {viewEmp.bank_fixed_amount>0 && <VField label="Bank Fixed Amt" value={`SAR ${Number(viewEmp.bank_fixed_amount).toLocaleString()}`} />}
                          {viewEmp.bank_portion_pct>0 && <VField label="Bank Portion %" value={`${viewEmp.bank_portion_pct}%`} />}
                          {viewEmp.initial_basic_salary>0 && <VField label="Initial Basic" value={`SAR ${Number(viewEmp.initial_basic_salary).toLocaleString()}`} />}
                        </VCard>
                      )}
                      {(viewEmp.gosi_number||viewEmp.gosi_start_date) && (
                        <VCard icon="🛡️" title="GOSI" accent="#00695c">
                          <VField label="GOSI #"      value={viewEmp.gosi_number} />
                          <VField label="GOSI Start"  value={viewEmp.gosi_start_date} />
                          {viewEmp.gosi_end_date && <VField label="GOSI End" value={viewEmp.gosi_end_date} />}
                        </VCard>
                      )}
                      {viewEmp.sce_required && (
                        <VCard icon="🔧" title="SCE (Engineering Council)" accent="#bf360c">
                          <VField label="SCE #"      value={viewEmp.sce_number} />
                          <VField label="Category"   value={viewEmp.sce_category} />
                          <VField label="Status"     value={viewEmp.sce_status} />
                          <VField label="Issue Date" value={viewEmp.sce_issue_date} />
                          {viewEmp.sce_expiry_date && (()=>{
                            const d=new Date(viewEmp.sce_expiry_date), n=new Date(), diff=Math.ceil((d-n)/86400000)
                            const col = diff<0?'#c62828':diff<=60?'#e65100':diff<=90?'#f57f17':'#2e7d32'
                            const tag = diff<0?' ⛔ EXPIRED':diff<=60?` ⚠️ ${diff}d`:diff<=90?` 🟡 ${diff}d`:''
                            return <VField label="SCE Expiry" value={viewEmp.sce_expiry_date+tag} highlight={col} />
                          })()}
                        </VCard>
                      )}
                    </div>
                  </div>
                )}

                {viewEmpTab === 'docs' && (
                  <div style={{ padding:'4px 0' }}>
                    <EntityDocs
                      entityId={entityId}
                      linkedType="EMPLOYEE"
                      linkedId={viewEmp.id}
                      linkedName={viewEmp.full_name_en}
                      accentColor="#6a1b9a"
                    />
                  </div>
                )}

                {viewEmpTab === 'dependents' && (
                  <div style={{ padding:'4px 0' }}>
                    {/* ── Header row ── */}
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                      <div style={{ fontSize:12, color:'#546e7a' }}>
                        <strong style={{ color:'#6a1b9a' }}>Family / Dependents</strong>
                        {' — '}Sponsor: <strong>{viewEmp.full_name_en}</strong>
                        {viewEmp.iqama_number && <> · Iqama <code style={{ fontSize:11, background:'#f3e5f5', borderRadius:4, padding:'1px 5px' }}>{viewEmp.iqama_number}</code></>}
                      </div>
                      <button
                        onClick={()=>{ setEditDep(null); setViewDepForm(BLANK_DEP); setShowDepForm(true) }}
                        style={{ background:'linear-gradient(135deg,#6a1b9a,#8e24aa)', color:'#fff', border:'none', borderRadius:8, padding:'7px 16px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                        + Add Dependent
                      </button>
                    </div>

                    {/* ── Add / Edit inline form ── */}
                    {showDepForm && (
                      <div style={{ background:'#f8f0ff', border:'1.5px solid #ce93d8', borderRadius:12, padding:'14px 16px', marginBottom:14 }}>
                        <div style={{ fontSize:12, fontWeight:800, color:'#6a1b9a', marginBottom:10 }}>{editDep ? '✏️ Edit Dependent' : '➕ New Dependent'}</div>
                        {/* Row 1 — Name, Gender, Relationship */}
                        <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:8, marginBottom:8 }}>
                          <div>
                            <label style={{ fontSize:10, color:'#9575cd', fontWeight:700, display:'block', marginBottom:3 }}>Full Name *</label>
                            <input value={viewDepForm.full_name} onChange={e=>setViewDepForm(f=>({...f,full_name:e.target.value}))}
                              placeholder="Full name as on ID" style={{ width:'100%', padding:'7px 10px', border:'1px solid #ce93d8', borderRadius:7, fontSize:12, boxSizing:'border-box' }} />
                          </div>
                          <div>
                            <label style={{ fontSize:10, color:'#9575cd', fontWeight:700, display:'block', marginBottom:3 }}>Gender</label>
                            <select value={viewDepForm.gender} onChange={e=>setViewDepForm(f=>({...f,gender:e.target.value}))}
                              style={{ width:'100%', padding:'7px 10px', border:'1px solid #ce93d8', borderRadius:7, fontSize:12, boxSizing:'border-box' }}>
                              <option>Male</option><option>Female</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize:10, color:'#9575cd', fontWeight:700, display:'block', marginBottom:3 }}>Relationship</label>
                            <select value={viewDepForm.relationship} onChange={e=>setViewDepForm(f=>({...f,relationship:e.target.value}))}
                              style={{ width:'100%', padding:'7px 10px', border:'1px solid #ce93d8', borderRadius:7, fontSize:12, boxSizing:'border-box' }}>
                              {['Wife','Husband','Son','Daughter','Father','Mother','Other'].map(r=><option key={r}>{r}</option>)}
                            </select>
                          </div>
                        </div>
                        {/* Row 2 — ID Type, ID Number, Nationality */}
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr 1.5fr', gap:8, marginBottom:8 }}>
                          <div>
                            <label style={{ fontSize:10, color:'#9575cd', fontWeight:700, display:'block', marginBottom:3 }}>ID Type</label>
                            <select value={viewDepForm.id_type} onChange={e=>setViewDepForm(f=>({...f,id_type:e.target.value}))}
                              style={{ width:'100%', padding:'7px 10px', border:'1px solid #ce93d8', borderRadius:7, fontSize:12, boxSizing:'border-box' }}>
                              {['Iqama','National Id','Passport'].map(t=><option key={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize:10, color:'#9575cd', fontWeight:700, display:'block', marginBottom:3 }}>ID Number</label>
                            <input value={viewDepForm.id_number} onChange={e=>setViewDepForm(f=>({...f,id_number:e.target.value}))}
                              placeholder="ID / Iqama number" style={{ width:'100%', padding:'7px 10px', border:'1px solid #ce93d8', borderRadius:7, fontSize:12, boxSizing:'border-box' }} />
                          </div>
                          <div>
                            <label style={{ fontSize:10, color:'#9575cd', fontWeight:700, display:'block', marginBottom:3 }}>Nationality</label>
                            <input value={viewDepForm.nationality} onChange={e=>setViewDepForm(f=>({...f,nationality:e.target.value}))}
                              placeholder="e.g. Indian" style={{ width:'100%', padding:'7px 10px', border:'1px solid #ce93d8', borderRadius:7, fontSize:12, boxSizing:'border-box' }} />
                          </div>
                        </div>
                        {/* Row 3 — Birth Date, Marital Status, Mobile, Scheme */}
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8, marginBottom:8 }}>
                          <div>
                            <label style={{ fontSize:10, color:'#9575cd', fontWeight:700, display:'block', marginBottom:3 }}>Birth Date</label>
                            <input type="date" value={viewDepForm.birth_date} onChange={e=>setViewDepForm(f=>({...f,birth_date:e.target.value}))}
                              style={{ width:'100%', padding:'7px 10px', border:'1px solid #ce93d8', borderRadius:7, fontSize:12, boxSizing:'border-box' }} />
                          </div>
                          <div>
                            <label style={{ fontSize:10, color:'#9575cd', fontWeight:700, display:'block', marginBottom:3 }}>Marital Status</label>
                            <select value={viewDepForm.marital_status} onChange={e=>setViewDepForm(f=>({...f,marital_status:e.target.value}))}
                              style={{ width:'100%', padding:'7px 10px', border:'1px solid #ce93d8', borderRadius:7, fontSize:12, boxSizing:'border-box' }}>
                              {['Single','Married','Divorced','Widowed'].map(s=><option key={s}>{s}</option>)}
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize:10, color:'#9575cd', fontWeight:700, display:'block', marginBottom:3 }}>Mobile</label>
                            <input value={viewDepForm.mobile} onChange={e=>setViewDepForm(f=>({...f,mobile:e.target.value}))}
                              placeholder="+966..." style={{ width:'100%', padding:'7px 10px', border:'1px solid #ce93d8', borderRadius:7, fontSize:12, boxSizing:'border-box' }} />
                          </div>
                          <div>
                            <label style={{ fontSize:10, color:'#9575cd', fontWeight:700, display:'block', marginBottom:3 }}>Insurance Scheme</label>
                            <select value={viewDepForm.insurance_scheme} onChange={e=>setViewDepForm(f=>({...f,insurance_scheme:e.target.value}))}
                              style={{ width:'100%', padding:'7px 10px', border:'1px solid #ce93d8', borderRadius:7, fontSize:12, boxSizing:'border-box' }}>
                              <option value="">—</option>
                              {['A','B','C','D'].map(s=><option key={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>
                        {/* Row 4 — Expiry dates */}
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8, marginBottom:12 }}>
                          <div>
                            <label style={{ fontSize:10, color:'#9575cd', fontWeight:700, display:'block', marginBottom:3 }}>Iqama Expiry</label>
                            <input type="date" value={viewDepForm.iqama_expiry} onChange={e=>setViewDepForm(f=>({...f,iqama_expiry:e.target.value}))}
                              style={{ width:'100%', padding:'7px 10px', border:'1px solid #ce93d8', borderRadius:7, fontSize:12, boxSizing:'border-box' }} />
                          </div>
                          <div>
                            <label style={{ fontSize:10, color:'#9575cd', fontWeight:700, display:'block', marginBottom:3 }}>Passport No.</label>
                            <input value={viewDepForm.passport_number} onChange={e=>setViewDepForm(f=>({...f,passport_number:e.target.value}))}
                              placeholder="Passport #" style={{ width:'100%', padding:'7px 10px', border:'1px solid #ce93d8', borderRadius:7, fontSize:12, boxSizing:'border-box' }} />
                          </div>
                          <div>
                            <label style={{ fontSize:10, color:'#9575cd', fontWeight:700, display:'block', marginBottom:3 }}>Passport Expiry</label>
                            <input type="date" value={viewDepForm.passport_expiry} onChange={e=>setViewDepForm(f=>({...f,passport_expiry:e.target.value}))}
                              style={{ width:'100%', padding:'7px 10px', border:'1px solid #ce93d8', borderRadius:7, fontSize:12, boxSizing:'border-box' }} />
                          </div>
                          <div>
                            <label style={{ fontSize:10, color:'#9575cd', fontWeight:700, display:'block', marginBottom:3 }}>Insurance Expiry</label>
                            <input type="date" value={viewDepForm.insurance_expiry} onChange={e=>setViewDepForm(f=>({...f,insurance_expiry:e.target.value}))}
                              style={{ width:'100%', padding:'7px 10px', border:'1px solid #ce93d8', borderRadius:7, fontSize:12, boxSizing:'border-box' }} />
                          </div>
                        </div>
                        {/* Form actions */}
                        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                          <button onClick={()=>{ setShowDepForm(false); setEditDep(null); setViewDepForm(BLANK_DEP) }}
                            style={{ background:'#f5f5f5', color:'#666', border:'none', borderRadius:7, padding:'8px 16px', fontSize:12, cursor:'pointer' }}>Cancel</button>
                          <button onClick={saveDep} disabled={depSaving}
                            style={{ background:'linear-gradient(135deg,#6a1b9a,#8e24aa)', color:'#fff', border:'none', borderRadius:7, padding:'8px 20px', fontSize:12, fontWeight:700, cursor:'pointer', opacity:depSaving?0.7:1 }}>
                            {depSaving ? 'Saving…' : editDep ? '✓ Update' : '✓ Save Dependent'}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── Dependent cards ── */}
                    {depsLoading ? (
                      <div style={{ textAlign:'center', padding:'20px', color:'#9575cd', fontSize:13 }}>Loading dependents…</div>
                    ) : deps.length === 0 ? (
                      <div style={{ textAlign:'center', padding:'30px 20px', color:'#bdbdbd', fontSize:13 }}>
                        <div style={{ fontSize:36, marginBottom:8 }}>👨‍👩‍👧</div>
                        No dependents registered yet.
                      </div>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        {deps.map(dep => {
                          const today = new Date()
                          const expiryDays = d => d ? Math.ceil((new Date(d)-today)/86400000) : null
                          const iqamaDays = expiryDays(dep.iqama_expiry)
                          const passportDays = expiryDays(dep.passport_expiry)
                          const insuranceDays = expiryDays(dep.insurance_expiry)
                          const expiryBadge = (label, days, date) => {
                            if (!date) return null
                            const col = days < 0 ? '#c62828' : days <= 30 ? '#e65100' : days <= 90 ? '#f57f17' : '#2e7d32'
                            const tag = days < 0 ? '⛔ EXPIRED' : days <= 30 ? `⚠️ ${days}d` : days <= 90 ? `🟡 ${days}d` : '✓'
                            return <span key={label} style={{ fontSize:10, background: days < 0 ? '#ffebee' : days <= 90 ? '#fff8e1' : '#e8f5e9', color:col, borderRadius:6, padding:'2px 6px', marginLeft:4, fontWeight:700 }}>{label}: {tag}</span>
                          }
                          return (
                            <div key={dep.id} style={{ background:'#fff', border:'1px solid #e8d5f5', borderRadius:10, padding:'12px 14px', display:'flex', alignItems:'flex-start', gap:12 }}>
                              <div style={{ width:36, height:36, borderRadius:'50%', background:'linear-gradient(135deg,#ce93d8,#9c27b0)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                                {dep.gender==='Female' ? '👩' : '👦'}
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap', marginBottom:4 }}>
                                  <strong style={{ fontSize:13, color:'#1a2332' }}>{dep.full_name}</strong>
                                  <span style={{ fontSize:10, background:'#f3e5f5', color:'#6a1b9a', borderRadius:6, padding:'2px 7px', fontWeight:700 }}>{dep.relationship}</span>
                                  {dep.insurance_scheme && <span style={{ fontSize:10, background:'#e3f2fd', color:'#1565c0', borderRadius:6, padding:'2px 7px', fontWeight:700 }}>Scheme {dep.insurance_scheme}</span>}
                                </div>
                                <div style={{ fontSize:11, color:'#78909c' }}>
                                  {dep.nationality} · {dep.id_type}: <code style={{ fontSize:11 }}>{dep.id_number||'—'}</code>
                                  {dep.birth_date && ` · Born: ${dep.birth_date}`}
                                  {dep.mobile && ` · ${dep.mobile}`}
                                </div>
                                <div style={{ marginTop:4, display:'flex', flexWrap:'wrap', gap:2 }}>
                                  {expiryBadge('Iqama', iqamaDays, dep.iqama_expiry)}
                                  {expiryBadge('Passport', passportDays, dep.passport_expiry)}
                                  {expiryBadge('Insurance', insuranceDays, dep.insurance_expiry)}
                                </div>
                              </div>
                              <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                                <button onClick={()=>{ setEditDep(dep); setViewDepForm({
                                  full_name: dep.full_name||'', gender: dep.gender||'Male', relationship: dep.relationship||'Wife',
                                  id_type: dep.id_type||'Iqama', id_number: dep.id_number||'', nationality: dep.nationality||'',
                                  birth_date: dep.birth_date||'', marital_status: dep.marital_status||'Single', mobile: dep.mobile||'',
                                  insurance_scheme: dep.insurance_scheme||'', iqama_expiry: dep.iqama_expiry||'',
                                  passport_number: dep.passport_number||'', passport_expiry: dep.passport_expiry||'', insurance_expiry: dep.insurance_expiry||'',
                                }); setShowDepForm(true) }}
                                  style={{ background:'#f3e5f5', color:'#6a1b9a', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer', fontWeight:700 }}>✏️</button>
                                <button onClick={()=>deleteDep(dep.id)}
                                  style={{ background:'#ffebee', color:'#c62828', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer', fontWeight:700 }}>🗑</button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── QR ACCESS TAB ────────────────────────── */}
                {viewEmpTab === 'qr' && (
                  <div style={{ padding:'4px 0' }}>
                    {qrLoading ? (
                      <div style={{ textAlign:'center', padding:40, color:'#9e9e9e', fontSize:13 }}>Loading QR status…</div>
                    ) : (
                      <>
                        {/* Status banner */}
                        <div style={{
                          display:'flex', alignItems:'center', justifyContent:'space-between',
                          background: qrToken?.is_active ? '#e8f5e9' : qrToken ? '#fff8e1' : '#f5f5f5',
                          border: `1.5px solid ${qrToken?.is_active ? '#a5d6a7' : qrToken ? '#ffe082' : '#e0e0e0'}`,
                          borderRadius:12, padding:'12px 16px', marginBottom:14,
                        }}>
                          <div>
                            <div style={{ fontSize:12, fontWeight:800, color: qrToken?.is_active ? '#2e7d32' : qrToken ? '#e65100' : '#757575' }}>
                              {qrToken?.is_active ? '🟢 QR Active' : qrToken ? '🟡 QR Revoked' : '⚪ No QR Issued'}
                            </div>
                            {qrToken && (
                              <div style={{ fontSize:11, color:'#78909c', marginTop:3 }}>
                                Role: <strong>{QR_FIELD_ROLES.find(r=>r.value===qrToken.role)?.label || qrToken.role}</strong>
                                {qrToken.generated_at && <> · Issued: {new Date(qrToken.generated_at).toLocaleDateString()}</>}
                                {qrToken.expires_at && <> · Expires: {new Date(qrToken.expires_at).toLocaleDateString()}</>}
                              </div>
                            )}
                          </div>
                          {qrToken?.is_active && (
                            <button onClick={revokeEmpQR}
                              style={{ background:'#ffebee', color:'#c62828', border:'none', borderRadius:7, padding:'6px 12px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                              Revoke
                            </button>
                          )}
                        </div>

                        {/* QR Image + share (if active) */}
                        {qrToken?.is_active && (
                          <div style={{ background:'#fff', border:'1px solid #e0e0e0', borderRadius:12, padding:'16px', marginBottom:14, textAlign:'center' }}>
                            <img
                              src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(qrFieldUrl(qrToken.token))}&size=200x200&margin=10&color=1a2540`}
                              alt="QR Code" style={{ width:160, height:160, display:'block', margin:'0 auto 10px' }}
                            />
                            <div style={{ fontFamily:'monospace', fontSize:11, color:'#90a4ae', background:'#f5f5f5', borderRadius:6, padding:'4px 10px', display:'inline-block', marginBottom:10, wordBreak:'break-all' }}>
                              {qrFieldUrl(qrToken.token)}
                            </div>
                            <div style={{ display:'flex', gap:8, justifyContent:'center', flexWrap:'wrap' }}>
                              <button onClick={() => navigator.clipboard?.writeText(qrFieldUrl(qrToken.token)).then(()=>alert('Link copied!'))}
                                style={{ background:'#e3f2fd', color:'#1565c0', border:'none', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                                📋 Copy Link
                              </button>
                              <button onClick={()=>{
                                const msg = `Hi ${viewEmp.full_name_en || ''} 👋\n\nYour ACCSYS field access link:\n${qrFieldUrl(qrToken.token)}\n\nScan the QR or tap to access your forms.`
                                window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
                              }}
                                style={{ background:'#e8f5e9', color:'#2e7d32', border:'none', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                                💬 WhatsApp
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Generate / Regenerate section */}
                        <div style={{ background:'#fafafa', border:'1px solid #e0e0e0', borderRadius:12, padding:'14px 16px' }}>
                          <div style={{ fontSize:12, fontWeight:800, color:'#1a2540', marginBottom:10 }}>
                            {qrToken ? '🔄 Generate New Token' : '🔑 Issue QR Access'}
                          </div>
                          <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                            <div style={{ flex:1, minWidth:160 }}>
                              <label style={{ fontSize:10, color:'#546e7a', fontWeight:700, display:'block', marginBottom:3 }}>Field Role</label>
                              <select value={qrRole} onChange={e=>setQrRole(e.target.value)}
                                style={{ width:'100%', padding:'8px 10px', border:'1.5px solid #cfd8dc', borderRadius:8, fontSize:12, background:'#fff' }}>
                                {QR_FIELD_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                              </select>
                            </div>
                            <button
                              onClick={() => generateEmpQR(viewEmp)}
                              disabled={qrGenerating}
                              style={{ background: qrGenerating ? '#e0e0e0' : 'linear-gradient(135deg,#1565c0,#1976d2)', color: qrGenerating ? '#9e9e9e' : '#fff', border:'none', borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:700, cursor: qrGenerating ? 'default' : 'pointer', marginTop:16 }}>
                              {qrGenerating ? 'Generating…' : qrToken ? '🔄 Regenerate' : '✓ Generate QR'}
                            </button>
                          </div>
                          {qrToken && <div style={{ fontSize:11, color:'#e65100', marginTop:8 }}>⚠️ Generating a new token will replace the existing one. The employee will need the new link.</div>}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ── FOOTER ──────────────────────────────── */}
              <div style={{ display:'flex', gap:8, justifyContent:'flex-end', padding:'12px 20px', borderTop:'1px solid #f3e5f5', background:'#fff', flexShrink:0, flexWrap:'wrap' }}>
                <button onClick={()=>setViewEmp(null)} style={{ background:'#f5f5f5', color:'#666', border:'none', borderRadius:9, padding:'9px 18px', cursor:'pointer', fontSize:13 }}>Close</button>
                <div style={{ position:'relative' }}>
                  <button onClick={()=>setShowPrint(p=>!p)} style={{ background:'#e8f5e9', color:'#2e7d32', border:'none', borderRadius:9, padding:'9px 16px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                    🖨️ Print ▾
                  </button>
                  {showPrint && (
                    <div style={{ position:'absolute', bottom:'110%', right:0, background:'#fff', borderRadius:10, boxShadow:'0 4px 20px rgba(0,0,0,0.15)', padding:8, minWidth:200, zIndex:10 }}>
                      <div style={{ fontSize:10, color:'#9e9e9e', fontWeight:700, padding:'4px 10px', letterSpacing:1 }}>SELECT TEMPLATE</div>
                      {[['id_card','🪪 Employee ID Card'],['profile','📄 Full Profile Sheet']].map(([t,l])=>(
                        <button key={t} onClick={()=>{ printEmployee({...viewEmp, _deptName: getDeptName(viewEmp.department_id)},t,depsData); setShowPrint(false) }}
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
        )
      })()}

      {/* ── PageBanner ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); setStep(1); setOpen(true) }}
        chapterName="Masters"
        formTitle={['Employee', 'Registration', 'Form']}
        heading="Register sponsored, outsourced or contract employees"
        description="Employee number is automatically assigned."
        icon="👤"
        iconLabel={'HR\nRegistration'}
        workflowSteps={['Identity', 'Employment', 'Compliance', 'Family', 'Home']}
        steps={['Identity', 'Personal', 'Employment', 'Salary', 'Banking', 'Compliance', 'Family', 'Home Country']}
      />

      {/* ══ EDIT / ADD MODAL (multi-step wizard — PDF layout) ═══ */}
      {open && (() => {
        const PRI = '#8C601B'   // Masters L3 accent
        const L1  = '#C8B48F'   // Masters outer frame
        const L2  = '#FAF5E9'   // Masters inner background
        const BLUE = PRI
        const STEP_NAMES = ['','Identity','Personal','Employment','Salary','Banking','Compliance','Family','Home Country']
        const STEP_DESC  = ['','Photo, type & employee name','Contact, ID & personal docs','Job title, dept & category','Salary & allowances (SAR)','Payment mode, GOSI & bank','Eligibility flags & compliance','Family status & dependents','Home address & emergency contact']
        const inp = (extra={}) => ({ ...S.inp, borderRadius:20, fontSize:13, ...extra })
        const inpLk = (extra={}) => ({ ...S.inpLock, borderRadius:20, fontSize:13, ...extra })
        const sec = { fontSize:10, fontWeight:800, color:PRI, letterSpacing:1.5, textTransform:'uppercase', marginBottom:10, marginTop:14, paddingBottom:5, borderBottom:`1.5px solid ${PRI}33` }
        return (
          <FormShell
            isOpen={open}
            onClose={() => { setOpen(false); resetForm() }}
            chapterName="Masters"
            title={['Employee', 'Registration', 'Form']}
            description="Register sponsored, outsourced or contract employees."
            steps={['Identity', 'Personal', 'Employment', 'Salary', 'Banking', 'Compliance', 'Family', 'Home Country']}
            currentStep={step}
            onBack={step===1 ? () => { setOpen(false); resetForm() } : () => setStep(s=>s-1)}
            backLabel={step===1 ? 'Cancel' : 'Back'}
            onNext={step<8 ? () => setStep(s=>s+1) : save}
            nextLabel={step<8 ? 'Save & Next' : (saving ? 'Saving…' : editing ? '✓ Update Employee' : '✓ Add Employee')}
            nextDisabled={saving && step===8}
            subjectLabel={nameEn || null}
          >
          <div style={{ fontFamily:"'Poppins','Inter',sans-serif" }}>

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
                        <label style={S.toggle}><input type="checkbox" checked={wpsAllowed} onChange={e=>setWpsAllowed(e.target.checked)} /> 🏦 WPS Eligible</label>
                      </div>
                      {faElig && <div style={S.row}><div style={S.col}><label style={S.label}>FA Daily Rate (SAR)</label><input type="number" step="0.01" style={inp()} value={faAmount} onChange={e=>setFaAmount(e.target.value)} /></div></div>}

                      {/* ── Vacation Ticket ── */}
                      <div style={sec}>✈️ Vacation Ticket</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom: vacTicketElig ? 8 : 12 }}>
                        <label style={S.toggle}><input type="checkbox" checked={vacTicketElig} onChange={e=>setVacTicketElig(e.target.checked)} /> ✈️ Vacation Ticket Eligible</label>
                      </div>
                      {vacTicketElig && (
                        <div style={{ background:'#f0f9ff', borderRadius:10, padding:'10px 14px', marginBottom:12, border:'1px solid #bae6fd' }}>
                          <label style={{ ...S.label, marginBottom:6 }}>Self Ticket Cycle</label>
                          <div style={{ display:'flex', gap:8 }}>
                            {[['EVERY_YEAR','Every Year'],['EVERY_2_YEARS','Every 2 Years'],['EVERY_6_MONTHS','Every 6 Months']].map(([val,lbl])=>(
                              <label key={val} style={{ display:'flex', alignItems:'center', gap:5, cursor:'pointer', fontSize:13, fontWeight: ticketCycle===val ? 700 : 400, color: ticketCycle===val ? BLUE : '#546e7a', background: ticketCycle===val ? '#e3f2fd' : '#f5f7fa', padding:'6px 14px', borderRadius:20, border:`1.5px solid ${ticketCycle===val ? BLUE : '#dde3ea'}`, transition:'all .15s' }}>
                                <input type="radio" name="ticketCycle" value={val} checked={ticketCycle===val} onChange={()=>setTicketCycle(val)} style={{ display:'none' }} />
                                {lbl}
                              </label>
                            ))}
                          </div>
                          <div style={{ fontSize:11, color:'#546e7a', marginTop:6 }}>
                            {ticketCycle==='EVERY_6_MONTHS' ? 'Eligible twice a year — employee selects when to use.' : ticketCycle==='EVERY_2_YEARS' ? 'One ticket entitlement every 2 years of service.' : 'One ticket entitlement per year of service.'}
                          </div>
                        </div>
                      )}

                      <div style={sec}>🏥 Medical Insurance</div>
                      <div style={S.row}>
                        <div style={S.col}>
                          <label style={S.label}>Insurance Policy #</label>
                          <input style={inp()} value={insurancePolicyNo} onChange={e=>setInsurancePolicyNo(e.target.value)} placeholder="Employee's policy number under bulk scheme" />
                        </div>
                        <div style={S.col}>
                          <label style={S.label}>Policy Expiry Date</label>
                          <input type="date" style={inp()} value={insuranceExpiry} onChange={e=>setInsuranceExpiry(e.target.value)} />
                        </div>
                      </div>
                      {insuranceExpiry && (()=>{ const d=(new Date(insuranceExpiry)-new Date())/86400000|0; return d<=90?(<div style={{ background:d<=0?'#ffebee':'#fff3e0', border:`1px solid ${d<=0?'#e53935':'#fb8c00'}`, borderRadius:8, padding:'8px 12px', marginBottom:8, fontSize:12, fontWeight:700, color:d<=0?'#b71c1c':'#e65100' }}>{d<=0?'🔴 Insurance EXPIRED — renew immediately':`⚠️ Insurance expires in ${d} days`}</div>):null })()}
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

                    {/* ── STEP 7 — Family ── */}
                    {step===7 && <>
                      <div style={sec}>👨‍👩‍👧 Family Status</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom: familyStatus ? 8 : 16 }}>
                        <label style={S.toggle}><input type="checkbox" checked={familyStatus} onChange={e=>{setFamilyStatus(e.target.checked);setHasDep(e.target.checked)}} /> 👨‍👩‍👧 Has Family in KSA (Sponsored)</label>
                      </div>
                      {!familyStatus && (
                        <div style={{ fontSize:12, color:'#78909c', marginBottom:10 }}>
                          No dependents registered — tick the checkbox above if the employee has a sponsored family.
                        </div>
                      )}
                      {familyStatus && (<>
                        <div style={{ background:'#fce4ec', borderRadius:10, padding:'12px 14px', marginBottom:12, border:'1px solid #f48fb1' }}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:10 }}>
                            <div>
                              <label style={{ ...S.label, color:'#880e4f' }}>Spouse</label>
                              <select style={inp()} value={spouseCount} onChange={e=>setSpouseCount(e.target.value)}>
                                <option value={0}>0</option>
                                <option value={1}>1</option>
                              </select>
                            </div>
                            <div>
                              <label style={{ ...S.label, color:'#880e4f' }}>Children</label>
                              <input type="number" min={0} max={20} style={inp()} value={childCount} onChange={e=>setChildCount(Math.max(0,parseInt(e.target.value)||0))} />
                            </div>
                            <div>
                              <label style={{ ...S.label, color:'#880e4f' }}>Other Dependents</label>
                              <input type="number" min={0} max={10} style={inp()} value={otherDepCount} onChange={e=>setOtherDepCount(Math.max(0,parseInt(e.target.value)||0))} />
                            </div>
                          </div>
                          <div style={{ fontSize:12, fontWeight:700, color:'#880e4f', marginBottom:10 }}>
                            Total: {(parseInt(spouseCount)||0)+(parseInt(childCount)||0)+(parseInt(otherDepCount)||0)} dependent(s) — {(parseInt(spouseCount)||0)+(parseInt(childCount)||0)+(parseInt(otherDepCount)||0)} Iqama renewal slots to budget
                          </div>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                            <label style={S.toggle}><input type="checkbox" checked={famTicketElig} onChange={e=>setFamTicketElig(e.target.checked)} /> ✈️ Family Ticket Eligible</label>
                            <label style={S.toggle}><input type="checkbox" checked={famInsurElig} onChange={e=>setFamInsurElig(e.target.checked)} /> 🏥 Family Insurance Eligible</label>
                          </div>
                          {famTicketElig && (
                            <div style={{ fontSize:11, color:'#546e7a', marginTop:6, padding:'6px 10px', background:'#fff', borderRadius:6 }}>
                              Family ticket cycle is <strong>Every Year</strong> per policy. Budget per person is configured in Employee Categories.
                            </div>
                          )}
                        </div>
                        <div style={sec}>📋 Dependent Records</div>
                        <div style={{ background:'#f0f9ff', borderRadius:12, padding:'10px 14px', marginBottom:12, border:'1px solid #bae6fd' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                            <span style={{ fontWeight:700, fontSize:12, color:BLUE }}>👨‍👩‍👧 Dependent Records — {depsData.length} added</span>
                            <button type="button" onClick={()=>{setDepForm({ full_name:'', gender:'', relation:'', date_of_birth:'', iqama_number:'', passport_number:'', passport_expiry:'', nationality:'', insurance_policy_no:'', insurance_expiry_date:'' });setEditingDepIdx(null);setShowDepsModal(true)}} style={{ background:BLUE, color:'#fff', border:'none', borderRadius:16, padding:'5px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }} disabled={depsData.length>=8}>+ Add Dependent{depsData.length>=8?' (max 8)':''}</button>
                          </div>
                          {depsData.length>0 && (
                            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                              <thead><tr style={{ background:'#e0f2fe' }}>{['Name','Relation','Nationality','Policy #','Expiry',''].map(h=><th key={h} style={{ padding:'5px 8px', textAlign:'left', color:BLUE, fontWeight:700 }}>{h}</th>)}</tr></thead>
                              <tbody>
                                {depsData.map((d,i)=>(
                                  <tr key={i} style={{ borderBottom:'1px solid #bae6fd' }}>
                                    <td style={{ padding:'5px 8px', fontWeight:600 }}>{d.full_name}<div style={{ fontSize:10, color:'#78909c' }}>{d.gender}{d.date_of_birth?' · '+d.date_of_birth:''}</div></td>
                                    <td style={{ padding:'5px 8px' }}>{d.relation||'—'}</td>
                                    <td style={{ padding:'5px 8px' }}>{d.nationality||'—'}</td>
                                    <td style={{ padding:'5px 8px', fontFamily:'monospace', fontSize:11 }}>{d.insurance_policy_no||'—'}</td>
                                    <td style={{ padding:'5px 8px', fontSize:11, color: d.insurance_expiry_date && (new Date(d.insurance_expiry_date)-new Date())/86400000<30 ? '#c62828' : '#546e7a' }}>{d.insurance_expiry_date||'—'}</td>
                                    <td style={{ padding:'5px 8px', whiteSpace:'nowrap' }}>
                                      <button type="button" onClick={()=>{setDepForm({...d});setEditingDepIdx(i);setShowDepsModal(true)}} style={{ background:'#e3f2fd', color:'#0277bd', border:'none', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:11, marginRight:4 }}>✏</button>
                                      <button type="button" onClick={()=>setDepsData(prev=>prev.filter((_,j)=>j!==i))} style={{ background:'#ffebee', color:'#c62828', border:'none', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:11 }}>✕</button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          <div style={{ fontSize:11, color:'#ad1457', marginTop:8 }}>
                            Full document uploads (Iqama, passport scans) can be added via Document Valet after saving the employee record.
                          </div>
                        </div>
                      </>)}
                    </>}

                    {/* ── STEP 8 — Home Country ── */}
                    {step===8 && <>
                      <div style={sec}>🏠 Home Country Address</div>
                      <div style={S.row}>
                        <div style={S.col}>
                          <label style={S.label}>Home Country</label>
                          <select style={inp()} value={homeCountry} onChange={e=>setHomeCountry(e.target.value)}>
                            <option value="">— Select —</option>
                            {NATIONALITIES.map(n=><option key={n} value={n}>{n}</option>)}
                          </select>
                        </div>
                        <div style={S.col}>
                          <label style={S.label}>Home City / Area</label>
                          <input style={inp()} value={homeCity} onChange={e=>setHomeCity(e.target.value)} placeholder="e.g. Lahore, Chennai, Dhaka…" />
                        </div>
                        <div style={S.col}>
                          <label style={S.label}>Home Phone Number</label>
                          <input style={inp()} value={homePhone} onChange={e=>setHomePhone(e.target.value)} placeholder="+92 300 0000000" />
                        </div>
                      </div>
                      <div style={sec}>🆘 Emergency Contact</div>
                      <div style={{ background:'#fff3e0', borderRadius:10, padding:'12px 14px', border:'1px solid #ffcc80', marginBottom:12 }}>
                        <div style={S.row}>
                          <div style={S.col}>
                            <label style={{ ...S.label, color:'#e65100' }}>Contact Name</label>
                            <input style={inp()} value={emergName} onChange={e=>setEmergName(e.target.value)} placeholder="Full name of next-of-kin" />
                          </div>
                          <div style={S.col}>
                            <label style={{ ...S.label, color:'#e65100' }}>Relationship</label>
                            <select style={inp()} value={emergRelation} onChange={e=>setEmergRelation(e.target.value)}>
                              {['Father','Mother','Wife','Husband','Brother','Sister','Son','Daughter','Other'].map(r=><option key={r} value={r}>{r}</option>)}
                            </select>
                          </div>
                          <div style={S.col}>
                            <label style={{ ...S.label, color:'#e65100' }}>Contact Phone</label>
                            <input style={inp()} value={emergPhone} onChange={e=>setEmergPhone(e.target.value)} placeholder="+92 300 0000000" />
                          </div>
                        </div>
                      </div>
                      <div style={{ background:'#e8f5e9', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#2e7d32', border:'1px solid #a5d6a7' }}>
                        <strong>ℹ️ Usage:</strong> Home Country is used by the Vacations module to pre-fill the ticket destination and calculate ticket budget eligibility. Emergency contact is used for repatriation and medical emergencies.
                      </div>
                    </>}

          </div>
          </FormShell>
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

      {/* ══ DEPENDENTS SUB-MODAL — FormShell style ══════════════ */}
      {showDepsModal && (()=>{
        const dPRI='#8C601B'; const dL1='#C8B48F'; const dL2='#FAF5E9'
        const dInp = { width:'100%', padding:'8px 13px', borderRadius:18, border:`1px solid ${dPRI}44`, fontSize:12, color:'#172D37', background:'#fdfcf9', outline:'none', fontFamily:"'Poppins',sans-serif", boxSizing:'border-box' }
        const dLbl = { display:'block', fontSize:10, fontWeight:600, color:'#53666F', marginBottom:3 }
        const dSec = { fontSize:9, fontWeight:800, color:dPRI, letterSpacing:1.5, textTransform:'uppercase', marginBottom:8, marginTop:12, paddingBottom:4, borderBottom:`1.5px solid ${dPRI}33` }
        const dRow = { display:'flex', gap:10, marginBottom:10, flexWrap:'wrap' }
        const dCol = { flex:1, minWidth:130 }
        const setD = (k,v) => setDepForm(p=>({...p,[k]:v}))
        function confirmDep() {
          if (!depForm.full_name.trim()) { alert('Full name is required'); return }
          if (editingDepIdx===null) {
            setDepsData(prev=>[...prev, { ...depForm }])
            setNumDep(prev => (parseInt(prev)||0)+1)
          } else {
            setDepsData(prev=>prev.map((d,i)=>i===editingDepIdx?{...depForm}:d))
          }
          setShowDepsModal(false)
        }
        return (
          <div onClick={e=>e.target===e.currentTarget&&setShowDepsModal(false)} style={{ position:'fixed', inset:0, background:'rgba(10,20,30,0.55)', backdropFilter:'blur(4px)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Poppins',sans-serif" }}>
            {/* L1 */}
            <div onClick={e=>e.stopPropagation()} style={{ background:dL1, borderRadius:4, padding:12, border:`3px solid #a07830`, width:'min(760px,97vw)', height:'min(90vh,640px)', display:'flex', flexDirection:'column', boxShadow:'0 28px 80px rgba(0,0,0,0.35)' }}>
              {/* L2 */}
              <div style={{ background:dL2, flex:1, minHeight:0, display:'flex', flexDirection:'row', position:'relative', overflow:'hidden' }}>
                {/* L3 accent */}
                <div style={{ position:'absolute', top:0, right:0, width:220, height:185, background:dPRI, borderRadius:'0 0 0 90px', zIndex:0, pointerEvents:'none' }} />
                {/* Sidebar */}
                <div style={{ width:200, flexShrink:0, padding:'14px 14px 18px 14px', display:'flex', flexDirection:'column', zIndex:1, position:'relative' }}>
                  <div style={{ fontSize:13, fontWeight:800, color:'#172D37', whiteSpace:'nowrap', lineHeight:1.2, marginBottom:4 }}>Ratal Advanced Technologies</div>
                  <div style={{ fontSize:9, fontWeight:800, color:dPRI, letterSpacing:2.2, textTransform:'uppercase', marginTop:4, marginBottom:14 }}>Masters · HR</div>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:12, fontWeight:900, color:'#172D37', textTransform:'uppercase', lineHeight:1.25 }}>{editingDepIdx===null?'ADD':'EDIT'}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:dPRI, textTransform:'uppercase', lineHeight:1.05 }}>DEPENDENT</div>
                  </div>
                  <div style={{ height:1, background:`${dPRI}30`, marginBottom:10 }} />
                  <div style={{ fontSize:10, color:'#53666F', lineHeight:1.6, marginBottom:14 }}>
                    Fill in the dependent's personal details, ID documents and insurance policy number.
                  </div>
                  {depForm.full_name && (
                    <div style={{ background:`${dPRI}12`, borderRadius:8, padding:'8px 10px', marginBottom:10 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'#172D37' }}>{depForm.full_name}</div>
                      {depForm.relation && <div style={{ fontSize:10, color:dPRI }}>{depForm.relation}</div>}
                    </div>
                  )}
                  <div style={{ marginTop:'auto', fontSize:10, color:'#8a96a3' }}>
                    Dependent {editingDepIdx===null ? depsData.length+1 : editingDepIdx+1} of up to 8
                  </div>
                </div>
                {/* L4 white card */}
                <div style={{ flex:1, background:'#fff', margin:'30px 20px 12px 0', display:'flex', flexDirection:'column', overflow:'hidden', zIndex:1, boxShadow:'0 2px 24px rgba(0,0,0,0.09)', border:'1px solid #e2e8f0' }}>
                  {/* Card header */}
                  <div style={{ padding:'10px 18px 8px', borderBottom:'1px solid #f0f4f8', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                    <div style={{ fontSize:13, fontWeight:800, color:'#172D37' }}>Dependent Details</div>
                    <button onClick={()=>setShowDepsModal(false)} style={{ width:26, height:26, borderRadius:'50%', background:'#f1f5f9', border:'none', fontSize:12, color:'#64748b', cursor:'pointer' }}>✕</button>
                  </div>
                  {/* Scrollable body */}
                  <div style={{ flex:1, overflowY:'auto', padding:'14px 18px', fontFamily:"'Poppins',sans-serif" }}>
                    <div style={dSec}>Identity</div>
                    <div style={dRow}>
                      <div style={{ ...dCol, flex:2 }}>
                        <label style={dLbl}>Full Name *</label>
                        <input style={dInp} value={depForm.full_name} onChange={e=>setD('full_name',e.target.value)} placeholder="As on passport/Iqama" />
                      </div>
                      <div style={dCol}>
                        <label style={dLbl}>Gender</label>
                        <select style={dInp} value={depForm.gender} onChange={e=>setD('gender',e.target.value)}>
                          <option value="">--</option>
                          {['Male','Female'].map(g=><option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={dRow}>
                      <div style={dCol}>
                        <label style={dLbl}>Relation</label>
                        <select style={dInp} value={depForm.relation} onChange={e=>setD('relation',e.target.value)}>
                          <option value="">-- Select --</option>
                          {['Son','Daughter','Wife','Other'].map(r=><option key={r} value={r}>{r}</option>)}
                        </select>
                      </div>
                      <div style={dCol}>
                        <label style={dLbl}>Date of Birth</label>
                        <input type="date" style={dInp} value={depForm.date_of_birth} onChange={e=>setD('date_of_birth',e.target.value)} />
                      </div>
                      <div style={dCol}>
                        <label style={dLbl}>Nationality</label>
                        <select style={dInp} value={depForm.nationality} onChange={e=>setD('nationality',e.target.value)}>
                          <option value="">-- Select --</option>
                          {NATIONALITIES.map(n=><option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={dSec}>ID Documents</div>
                    <div style={dRow}>
                      <div style={dCol}>
                        <label style={dLbl}>Iqama No.</label>
                        <input style={dInp} value={depForm.iqama_number} onChange={e=>setD('iqama_number',e.target.value)} placeholder="Resident ID" />
                      </div>
                      <div style={dCol}>
                        <label style={dLbl}>Passport No.</label>
                        <input style={dInp} value={depForm.passport_number} onChange={e=>setD('passport_number',e.target.value)} />
                      </div>
                      <div style={dCol}>
                        <label style={dLbl}>Passport Expiry</label>
                        <input type="date" style={dInp} value={depForm.passport_expiry} onChange={e=>setD('passport_expiry',e.target.value)} />
                      </div>
                    </div>
                    <div style={dSec}>🏥 Insurance</div>
                    <div style={dRow}>
                      <div style={{ ...dCol, flex:2 }}>
                        <label style={dLbl}>Insurance Policy #</label>
                        <input style={dInp} value={depForm.insurance_policy_no} onChange={e=>setD('insurance_policy_no',e.target.value)} placeholder="Policy number assigned to this dependent" />
                      </div>
                      <div style={dCol}>
                        <label style={dLbl}>Policy Expiry Date</label>
                        <input type="date" style={dInp} value={depForm.insurance_expiry_date} onChange={e=>setD('insurance_expiry_date',e.target.value)} />
                      </div>
                    </div>
                  </div>
                  {/* Footer */}
                  <div style={{ padding:'10px 18px', borderTop:'1px solid #f0f4f8', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                    <button type="button" onClick={()=>setShowDepsModal(false)} style={{ background:'#747474', color:'#fff', border:'none', borderRadius:4, padding:'9px 22px', fontSize:12, fontWeight:700, cursor:'pointer' }}>Cancel</button>
                    <button type="button" onClick={confirmDep} style={{ background:dPRI, color:'#fff', border:'none', borderRadius:4, padding:'9px 26px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                      {editingDepIdx===null ? '+ Add Dependent' : '✓ Update Dependent'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

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
