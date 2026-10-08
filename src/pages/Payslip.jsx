import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Payslip PDF Generator
// Per employee, per month — all salary components, GOSI, deductions, net
// Print/PDF via browser print. Bilingual (EN + AR).

const SAR = v => `SAR ${(+v||0).toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2})}`

function monthLabel(ym) {
  if (!ym) return ''
  const [y,m] = ym.split('-')
  return new Date(+y, +m-1, 1).toLocaleDateString('en-GB', { month:'long', year:'numeric' })
}

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
function monthLabelAr(ym) {
  if (!ym) return ''
  const [y,m] = ym.split('-')
  return `${MONTHS_AR[+m-1]} ${y}`
}

const S = {
  card: { background:'#fff', borderRadius:14, padding:'18px 22px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:18 },
  inp:  { width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
  btn:  (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer' }),
  label:{ display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4 },
}

// The actual payslip print layout
function PayslipPrint({ slip, entity, employee, month, ref: _ref }) {
  const {
    basic_salary=0, housing_allowance=0, transport_allowance=0,
    food_allowance=0, other_allowance=0, overtime_amount=0,
    gross_salary=0, gosi_amount=0, loan_deduction=0,
    penalty_deduction=0, other_deduction=0, net_salary=0,
    bank_portion=0, cash_portion=0,
  } = slip || {}

  // If basic_salary is 0 but bank_portion is set, show bank_portion as the base earnings
  const baseEarnings = +basic_salary > 0
    ? [{ en:'Basic Salary', ar:'الراتب الأساسي', amount:basic_salary }]
    : +bank_portion > 0
      ? [{ en:'Bank Transfer (Base Salary)', ar:'الراتب الأساسي (تحويل بنكي)', amount:bank_portion }]
      : []

  const earnings = [
    ...baseEarnings,
    { en:'Housing Allowance',   ar:'بدل السكن',        amount:housing_allowance },
    { en:'Transport Allowance', ar:'بدل المواصلات',    amount:transport_allowance },
    { en:'Food Allowance',      ar:'بدل الطعام',       amount:food_allowance },
    { en:'Other Allowance',     ar:'بدلات أخرى',      amount:other_allowance },
    { en:'Overtime',            ar:'العمل الإضافي',   amount:overtime_amount },
    ...( +cash_portion > 0 ? [{ en:'Cash Portion', ar:'الجزء النقدي', amount:cash_portion }] : [] ),
  ].filter(r => +r.amount > 0)

  const deductions = [
    { en:'Loan Deduction',           ar:'خصم القرض',              amount:loan_deduction },
    { en:'Penalty',                  ar:'غرامة',                  amount:penalty_deduction },
    { en:'Other Deduction',          ar:'خصومات أخرى',            amount:other_deduction },
  ].filter(r => +r.amount > 0)

  const totalDeductions = deductions.reduce((s,r)=>s+(+r.amount||0),0)

  const isNat = (employee?.nationality||'').toUpperCase()
  const gosiRate = isNat==='SAUDI'||isNat==='SA' ? '9%' : '3%'
  const gosiBase = +bank_portion||+basic_salary||0

  return (
    <div id="payslip-print" style={{ fontFamily:"'Segoe UI',Arial,sans-serif", maxWidth:740, margin:'0 auto', padding:0 }}>
      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#1a2e3d 60%,#1565C0)', color:'#fff', padding:'20px 28px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:22, fontWeight:900, letterSpacing:0.5 }}>{entity?.name||'Ratal Group'}</div>
          <div style={{ fontSize:11, opacity:0.7, marginTop:2 }}>{entity?.nameAr||''}</div>
          <div style={{ fontSize:10, opacity:0.55, marginTop:4 }}>VAT: {entity?.vatNumber||''}</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:20, fontWeight:800, fontFamily:'Arial', direction:'rtl' }}>قسيمة الراتب</div>
          <div style={{ fontSize:13, fontWeight:700, opacity:0.85, marginTop:2 }}>PAYSLIP</div>
          <div style={{ fontSize:12, opacity:0.7, marginTop:4 }}>{monthLabel(month)}</div>
          <div style={{ fontSize:11, opacity:0.6, direction:'rtl' }}>{monthLabelAr(month)}</div>
        </div>
      </div>

      {/* Employee Info */}
      <div style={{ background:'#f0f4f8', padding:'14px 28px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        {[
          ['Employee Name / اسم الموظف', employee?.full_name||employee?.full_name_en||'—'],
          ['Employee No. / رقم الموظف',  employee?.employee_no||'—'],
          ['Designation / المسمى الوظيفي', employee?.position||'—'],
          ['Department / القسم',          employee?.department||'—'],
          ['IBAN', employee?.iban||'—'],
          ['Nationality / الجنسية',       employee?.nationality||'—'],
          ['Join Date / تاريخ الانضمام',  employee?.hire_date ? new Date(employee.hire_date).toLocaleDateString('en-GB') : '—'],
          ['Bank / البنك',                employee?.bank_name||'—'],
        ].map(([k,v])=>(
          <div key={k} style={{ display:'flex', gap:8 }}>
            <span style={{ fontSize:10, color:'#6b7c93', fontWeight:700, minWidth:180 }}>{k}:</span>
            <span style={{ fontSize:11, fontWeight:700, color:'#1a2e3d' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Earnings + Deductions side by side */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:0, borderTop:'3px solid #1a2e3d' }}>
        {/* Earnings */}
        <div style={{ borderRight:'1px solid #e8edf2' }}>
          <div style={{ background:'#e8f5e9', padding:'8px 18px', fontWeight:800, fontSize:12, color:'#2e7d32', display:'flex', justifyContent:'space-between' }}>
            <span>EARNINGS · المستحقات</span>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <tbody>
              {earnings.map((r,i)=>(
                <tr key={i} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
                  <td style={{ padding:'8px 18px', color:'#1a2e3d' }}>{r.en}<div style={{ fontSize:10, color:'#6b7c93', direction:'rtl' }}>{r.ar}</div></td>
                  <td style={{ padding:'8px 18px', textAlign:'right', fontWeight:700, color:'#1a2e3d' }}>{SAR(r.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background:'#e8f5e9', fontWeight:800 }}>
                <td style={{ padding:'10px 18px', color:'#2e7d32', fontSize:12 }}>TOTAL GROSS · إجمالي المستحقات</td>
                <td style={{ padding:'10px 18px', textAlign:'right', color:'#2e7d32', fontSize:13 }}>{SAR(gross_salary)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Deductions */}
        <div>
          <div style={{ background:'#ffebee', padding:'8px 18px', fontWeight:800, fontSize:12, color:'#c62828', display:'flex', justifyContent:'space-between' }}>
            <span>DEDUCTIONS · الخصومات</span>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <tbody>
              {deductions.length===0
                ? <tr><td colSpan={2} style={{ padding:'8px 18px', color:'#aab2bd', textAlign:'center', fontSize:11 }}>No deductions / لا توجد خصومات</td></tr>
                : deductions.map((r,i)=>(
                    <tr key={i} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
                      <td style={{ padding:'8px 18px', color:'#1a2e3d' }}>{r.en}<div style={{ fontSize:10, color:'#6b7c93', direction:'rtl' }}>{r.ar}</div></td>
                      <td style={{ padding:'8px 18px', textAlign:'right', fontWeight:700, color:'#c62828' }}>{SAR(r.amount)}</td>
                    </tr>
                  ))
              }
            </tbody>
            <tfoot>
              <tr style={{ background:'#ffebee', fontWeight:800 }}>
                <td style={{ padding:'10px 18px', color:'#c62828', fontSize:12 }}>TOTAL DEDUCTIONS · إجمالي الخصومات</td>
                <td style={{ padding:'10px 18px', textAlign:'right', color:'#c62828', fontSize:13 }}>{SAR(totalDeductions)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* GOSI Info box */}
      <div style={{ background:'#e3f2fd', padding:'10px 18px', fontSize:11, color:'#1565C0', display:'flex', gap:24, borderTop:'1px solid #bbdefb' }}>
        <span>🏛 <strong>GOSI (Company Borne)</strong> · مكافأة التأمينات الاجتماعية (على الشركة)</span>
        <span>Base: {SAR(gosiBase)} × {gosiRate} = <strong>{SAR(gosi_amount)}</strong></span>
        <span style={{ marginLeft:'auto', fontSize:10, opacity:0.7 }}>NOT deducted from employee salary · لا يُخصم من الموظف</span>
      </div>

      {/* Payment Method Breakdown */}
      <div style={{ background:'#263238', color:'#fff', padding:'10px 28px', display:'flex', gap:32, alignItems:'center', borderTop:'1px solid #37474f' }}>
        <span style={{ fontSize:11, opacity:0.6, fontWeight:700, letterSpacing:0.5 }}>PAYMENT METHOD · طريقة الدفع</span>
        <span style={{ fontSize:12 }}>🏦 Bank / WPS: <strong>{SAR(+bank_portion > 0 ? bank_portion : net_salary)}</strong></span>
        {+cash_portion > 0 && <span style={{ fontSize:12 }}>💵 Cash / نقداً: <strong>{SAR(cash_portion)}</strong></span>}
      </div>

      {/* Net Salary */}
      <div style={{ background:'#1a2e3d', color:'#fff', padding:'18px 28px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:13, opacity:0.7 }}>Net Salary Payable · صافي الراتب المستحق</div>
          <div style={{ fontSize:10, opacity:0.5, marginTop:3 }}>Total Gross − Deductions · الإجمالي بعد الخصومات</div>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:26, fontWeight:900, letterSpacing:0.5 }}>{SAR(net_salary)}</div>
          <div style={{ fontSize:11, opacity:0.6, direction:'rtl', marginTop:2 }}>{monthLabelAr(month)}</div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ background:'#f5f7fa', padding:'10px 28px', display:'flex', justifyContent:'space-between', fontSize:10, color:'#aab2bd', borderTop:'1px solid #e8edf2' }}>
        <span>This is a computer-generated payslip and does not require a signature.</span>
        <span style={{ direction:'rtl' }}>هذه قسيمة راتب مُولَّدة آلياً ولا تحتاج إلى توقيع.</span>
      </div>
      <div style={{ background:'#f5f7fa', padding:'0 28px 12px', display:'flex', justifyContent:'space-between', fontSize:10, color:'#aab2bd' }}>
        <span>Generated: {new Date().toLocaleDateString('en-GB')}</span>
        <span>Confidential · سري</span>
      </div>
    </div>
  )
}

export default function Payslip({ entityId, entityCode }) {
  const [employees,   setEmployees]  = useState([])
  const [payrollRuns, setRuns]        = useState([])
  const [selEmp,      setSelEmp]      = useState('')
  const [selMonth,    setSelMonth]    = useState('')
  const [slip,        setSlip]        = useState(null)
  const [employee,    setEmployee]    = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [entity,      setEntity]      = useState(null)
  const [batchMonth,  setBatchMonth]  = useState('')
  const [batchSlips,  setBatchSlips]  = useState([])
  const [batchIdx,    setBatchIdx]    = useState(0)
  const [mode,        setMode]        = useState('single') // single | batch

  const ENTITIES_META = {
    RAT:    { name:'Ratal Tours & Travels',        nameAr:'رتال للسفر',             vatNumber:'300000000000001' },
    GWT:    { name:'Green Wings Travel',            nameAr:'الأجنحة الخضراء',        vatNumber:'300000000000002' },
    ACCSYS: { name:'Ratal Advanced Technologies',   nameAr:'رتال للتقنيات المتقدمة', vatNumber:'300000000000003' },
  }

  useEffect(() => {
    if (!entityId) return
    setEntity(ENTITIES_META[entityCode]||ENTITIES_META['ACCSYS'])
    async function load() {
      const [{ data:e },{ data:r }] = await Promise.all([
        supabase.from('employees').select('id,full_name,full_name_en,employee_no,position,department,hire_date,iban,bank_name,nationality,bank_portion,basic_salary')
          .eq('entity_id',entityId).eq('status','ACTIVE').order('full_name'),
        supabase.from('payroll_runs').select('id,payroll_month,status').eq('entity_id',entityId)
          .order('payroll_month',{ascending:false}).limit(36),
      ])
      setEmployees(e||[])
      setRuns(r||[])
    }
    load()
  }, [entityId, entityCode])

  async function fetchSlip() {
    if (!selEmp || !selMonth) { alert('Select employee and month'); return }
    setLoading(true)
    const [{ data:run }] = await Promise.all([
      supabase.from('payroll_runs').select('id').eq('entity_id',entityId).eq('payroll_month',selMonth).limit(1),
    ])
    if (!run?.length) { alert(`No payroll run found for ${monthLabel(selMonth)}.`); setLoading(false); return }
    const runId = run[0].id
    const { data:item } = await supabase.from('payroll_items').select('*').eq('payroll_run_id',runId).eq('employee_id',selEmp).single()
    if (!item) { alert('No payslip found for this employee in the selected month.'); setLoading(false); return }
    const emp = employees.find(e=>e.id===selEmp)
    setEmployee(emp)
    setSlip(item)
    setLoading(false)
  }

  async function fetchBatch() {
    if (!batchMonth) { alert('Select a month'); return }
    setLoading(true)
    const { data:run } = await supabase.from('payroll_runs').select('id').eq('entity_id',entityId).eq('payroll_month',batchMonth).limit(1)
    if (!run?.length) { alert(`No payroll run found for ${monthLabel(batchMonth)}.`); setLoading(false); return }
    const runId = run[0].id
    const { data:items } = await supabase.from('payroll_items').select('*').eq('payroll_run_id',runId).order('employee_id')
    if (!items?.length) { alert('No payslips in this run.'); setLoading(false); return }
    setBatchSlips(items)
    setBatchIdx(0)
    setLoading(false)
  }

  function printSlip() {
    const el = document.getElementById('payslip-print')
    if (!el) return
    const win = window.open('','_blank','width=800,height=900')
    win.document.write(`
      <html><head><title>Payslip</title>
      <style>@media print{body{margin:0}}</style>
      </head><body>
      ${el.outerHTML}
      <script>window.onload=()=>{ window.print(); }</scr`+`ipt>
      </body></html>
    `)
    win.document.close()
  }

  function printAllBatch() {
    const slips = document.querySelectorAll('.batch-slip')
    if (!slips.length) return
    const win = window.open('','_blank','width=800,height=900')
    win.document.write(`
      <html><head><title>Payslips Batch</title>
      <style>@media print{.page-break{page-break-after:always}body{margin:0}}</style>
      </head><body>
      ${Array.from(slips).map((el,i)=>`<div class="page-break">${el.outerHTML}</div>`).join('')}
      <script>window.onload=()=>{ window.print(); }</scr`+`ipt>
      </body></html>
    `)
    win.document.close()
  }

  const batchEmp = slip => employees.find(e=>e.id===slip.employee_id)

  return (
    <div>
      {/* Header */}
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:20 }}>Generate bilingual payslips · Print or PDF</div>

      {/* Mode tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:18 }}>
        {[['single','Single Employee'],['batch','Batch (Full Month)']].map(([k,l])=>(
          <button key={k} onClick={()=>setMode(k)} style={{
            padding:'8px 20px', borderRadius:8, border:'none', cursor:'pointer', fontWeight:700, fontSize:13,
            background:mode===k?'#1a2e3d':'#f0f4f8', color:mode===k?'#fff':'#6b7c93'
          }}>{l}</button>
        ))}
      </div>

      {mode==='single' && (
        <div style={{ ...S.card, display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div style={{ flex:2, minWidth:220 }}>
            <label style={S.label}>Employee</label>
            <select style={S.inp} value={selEmp} onChange={e=>{ setSelEmp(e.target.value); setSlip(null) }}>
              <option value="">— Select Employee —</option>
              {employees.map(e=><option key={e.id} value={e.id}>{e.full_name||e.full_name_en} ({e.employee_no||'—'})</option>)}
            </select>
          </div>
          <div style={{ flex:1, minWidth:180 }}>
            <label style={S.label}>Month</label>
            <select style={S.inp} value={selMonth} onChange={e=>{ setSelMonth(e.target.value); setSlip(null) }}>
              <option value="">— Select Month —</option>
              {payrollRuns.map(r=><option key={r.id} value={r.payroll_month}>{monthLabel(r.payroll_month)} {r.status==='APPROVED'?'✅':r.status==='DRAFT'?'(Draft)':''}</option>)}
            </select>
          </div>
          <button style={S.btn('#1565C0')} onClick={fetchSlip} disabled={loading}>{loading?'Loading…':'Generate Payslip'}</button>
          {slip && <button style={S.btn('#2e7d32')} onClick={printSlip}>🖨 Print / PDF</button>}
        </div>
      )}

      {mode==='batch' && (
        <div style={{ ...S.card, display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div style={{ flex:1, minWidth:220 }}>
            <label style={S.label}>Month</label>
            <select style={S.inp} value={batchMonth} onChange={e=>{ setBatchMonth(e.target.value); setBatchSlips([]) }}>
              <option value="">— Select Month —</option>
              {payrollRuns.map(r=><option key={r.id} value={r.payroll_month}>{monthLabel(r.payroll_month)} {r.status==='APPROVED'?'✅':''}</option>)}
            </select>
          </div>
          <button style={S.btn('#1565C0')} onClick={fetchBatch} disabled={loading}>{loading?'Loading…':'Load All Payslips'}</button>
          {batchSlips.length > 0 && <>
            <button style={S.btn('#2e7d32')} onClick={printAllBatch}>🖨 Print All ({batchSlips.length})</button>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <button style={{ ...S.btn('#546e7a'), padding:'8px 12px' }} onClick={()=>setBatchIdx(i=>Math.max(0,i-1))} disabled={batchIdx===0}>‹</button>
              <span style={{ fontSize:12, color:'#1a2e3d', fontWeight:700 }}>{batchIdx+1} / {batchSlips.length}</span>
              <button style={{ ...S.btn('#546e7a'), padding:'8px 12px' }} onClick={()=>setBatchIdx(i=>Math.min(batchSlips.length-1,i+1))} disabled={batchIdx===batchSlips.length-1}>›</button>
            </div>
          </>}
        </div>
      )}

      {/* Preview area */}
      <div style={{ marginTop:16, boxShadow:'0 4px 24px rgba(0,0,0,0.10)', borderRadius:14, overflow:'hidden' }}>
        {mode==='single' && slip && (
          <PayslipPrint slip={slip} entity={entity} employee={employee} month={selMonth} />
        )}
        {mode==='batch' && batchSlips.length > 0 && (
          <>
            {/* Show current slip in preview */}
            <div id="payslip-print">
              <PayslipPrint
                slip={batchSlips[batchIdx]}
                entity={entity}
                employee={batchEmp(batchSlips[batchIdx])}
                month={batchMonth}
              />
            </div>
            {/* Hidden batch for batch-print */}
            <div style={{ display:'none' }}>
              {batchSlips.map((s,i)=>(
                <div key={i} className="batch-slip">
                  <PayslipPrint slip={s} entity={entity} employee={batchEmp(s)} month={batchMonth} />
                </div>
              ))}
            </div>
          </>
        )}
        {!slip && mode==='single' && (
          <div style={{ background:'#f5f7fa', padding:60, textAlign:'center', color:'#aab2bd' }}>
            <div style={{ fontSize:40 }}>🧾</div>
            <div style={{ marginTop:8, fontSize:14, fontWeight:700 }}>Select employee and month to preview payslip</div>
          </div>
        )}
        {batchSlips.length===0 && mode==='batch' && (
          <div style={{ background:'#f5f7fa', padding:60, textAlign:'center', color:'#aab2bd' }}>
            <div style={{ fontSize:40 }}>📚</div>
            <div style={{ marginTop:8, fontSize:14, fontWeight:700 }}>Select a payroll month to load all payslips</div>
          </div>
        )}
      </div>
    </div>
  )
}
