import { GROUP_COLORS } from '../styles/appStyles'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const SAR = v => `SAR ${(+v||0).toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2})}`
const fmt = d => d ? new Date(d).toLocaleDateString('en-GB') : '—'
const MONTHS = Array.from({length:24},(_,i)=>i+1)
const TODAY = new Date()

const MC = GROUP_COLORS.HR

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'20px 22px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:18 },
  inp:   { width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
  btn:   (c='#2e7d32') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer' }),
  label: { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4 },
  row:   { display:'flex', gap:12, marginBottom:14 },
  col:   { flex:1 },
  tbl:   { width:'100%', borderCollapse:'collapse', fontSize:12 },
  th:    { background:MC, color:'#fff', padding:'9px 10px', fontWeight:700, textAlign:'left', fontSize:11 },
  td:    { padding:'8px 10px', borderBottom:'1px solid #f0f4f8', color:'#1a2e3d', verticalAlign:'middle' },
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' },
  modal: { background:'#fff', borderRadius:16, padding:28, width:560, maxWidth:'96vw', maxHeight:'90vh', overflowY:'auto' },
}

const EMPTY = { employee_id:'', loan_amount:'', tenure_months:'12', start_month:'', notes:'' }

export default function Loans({ entityId }) {
  const [loans,     setLoans]     = useState([])
  const [penalties, setPenalties] = useState([])
  const [employees, setEmps]      = useState([])
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState('loans')
  // EOS calculator state
  const [eos, setEos] = useState({ employee_id:'', basic_salary:'', join_date:'', leave_date:TODAY.toISOString().slice(0,10), leave_reason:'RESIGNATION' })
  const [showForm,  setShowForm]  = useState(false)
  const [showPF,    setShowPF]    = useState(false)
  const [form,      setForm]      = useState(EMPTY)
  const [pForm,     setPForm]     = useState({ employee_id:'', penalty_type:'EMPLOYEE_BORNE', offence:'', amount:'', deduction_month:'', notes:'' })
  const [saving,    setSaving]    = useState(false)
  const [search,    setSearch]    = useState('')

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const [{ data:l },{ data:p },{ data:e }] = await Promise.all([
      supabase.from('employee_loans').select('*').eq('entity_id',entityId).order('created_at',{ascending:false}).limit(200),
      supabase.from('employee_penalties').select('*').eq('entity_id',entityId).order('penalty_date',{ascending:false}).limit(200),
      supabase.from('employees').select('id,full_name,department').eq('entity_id',entityId).eq('is_active',true).order('full_name').limit(500),
    ])
    setLoans(l||[]); setPenalties(p||[]); setEmps(e||[])
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
    setShowForm(false); setForm(EMPTY); load()
  }

  async function savePenalty() {
    if (!pForm.employee_id) { alert('Select employee'); return }
    if (!pForm.amount || +pForm.amount<=0) { alert('Enter amount'); return }
    const emp = employees.find(e=>e.id===pForm.employee_id)
    setSaving(true)
    const { error } = await supabase.from('employee_penalties').insert({
      ...pForm,
      entity_id: entityId,
      employee_name: emp?.full_name||'',
      amount: +pForm.amount,
      penalty_date: TODAY.toISOString().slice(0,10),
      status: 'PENDING',
    })
    setSaving(false)
    if (error) { alert(error.message); return }
    setShowPF(false); setPForm({ employee_id:'', penalty_type:'EMPLOYEE_BORNE', offence:'', amount:'', deduction_month:'', notes:'' }); load()
  }

  async function closeLoan(id) {
    await supabase.from('employee_loans').update({ status:'COMPLETED', paid_amount: loans.find(l=>l.id===id)?.loan_amount||0, outstanding:0 }).eq('id',id)
    setLoans(p=>p.map(l=>l.id===id?{...l,status:'COMPLETED',outstanding:0}:l))
  }

  function f(k,v) { setForm(p=>({...p,[k]:v})) }
  function pf(k,v) { setPForm(p=>({...p,[k]:v})) }

  const filtLoans = loans.filter(l=>!search||(l.employee_name||'').toLowerCase().includes(search.toLowerCase()))
  const filtPen   = penalties.filter(p=>!search||(p.employee_name||'').toLowerCase().includes(search.toLowerCase()))

  const totalLoans      = loans.filter(l=>l.status==='ACTIVE').reduce((s,l)=>s+(+l.outstanding||0),0)
  const totalPenalties  = penalties.filter(p=>p.status==='PENDING').reduce((s,p)=>s+(+p.amount||0),0)

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:12, color:'#6b7c93', marginTop:2 }}>Employee salary advances, EMI schedules, and penalties register</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {tab==='loans'     && <button style={S.btn()} onClick={()=>setShowForm(true)}>+ New Loan</button>}
          {tab==='penalties' && <button style={S.btn('#e65100')} onClick={()=>setShowPF(true)}>+ New Penalty</button>}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display:'flex', gap:14, marginBottom:18, overflowX:'auto', flexWrap:'nowrap', paddingBottom:2 }}>
        {[
          { label:'Active Loans',      value: loans.filter(l=>l.status==='ACTIVE').length, color:'#2e7d32', icon:'💳' },
          { label:'Total Outstanding', value: SAR(totalLoans), color:'#c62828', icon:'💰' },
          { label:'Pending Penalties', value: penalties.filter(p=>p.status==='PENDING').length, color:'#e65100', icon:'⚠️' },
          { label:'Penalties Total',   value: SAR(totalPenalties), color:'#6a1b9a', icon:'📋' },
        ].map(c=>(
          <div key={c.label} style={{ ...S.card, flex:1, minWidth:160, marginBottom:0, display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ fontSize:26 }}>{c.icon}</div>
            <div><div style={{ fontSize:16, fontWeight:800, color:c.color }}>{c.value}</div><div style={{ fontSize:12, color:'#6b7c93' }}>{c.label}</div></div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ marginBottom:14 }}>
        {[['loans','Loans Register'],['penalties','Penalties Register'],['eos','EOS Calculator']].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} style={{ padding:'7px 18px', border:'none', borderRadius:8, cursor:'pointer', fontSize:12, fontWeight:700, marginRight:6, background:tab===k?'#2e7d32':'#f0f4f8', color:tab===k?'#fff':'#6b7c93' }}>{l}</button>
        ))}
      </div>

      <div style={{ ...S.card, padding:'12px 16px', marginBottom:14 }}>
        <input style={{ ...S.inp, maxWidth:280 }} placeholder="Search employee…" value={search} onChange={e=>setSearch(e.target.value)} />
      </div>

      {/* LOANS TABLE */}
      {tab==='loans' && (
        <div style={S.card}>
          {loading ? <div style={{ textAlign:'center', padding:40, color:'#6b7c93' }}>Loading…</div> : (
            <table style={S.tbl}>
              <thead><tr>
                <th style={S.th}>Employee</th>
                <th style={{ ...S.th, textAlign:'right' }}>Loan</th>
                <th style={S.th}>Months</th>
                <th style={{ ...S.th, textAlign:'right' }}>EMI / Month</th>
                <th style={S.th}>Start</th>
                <th style={{ ...S.th, textAlign:'right' }}>Paid</th>
                <th style={{ ...S.th, textAlign:'right' }}>Outstanding</th>
                <th style={S.th}>Status</th>
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
                <th style={{ ...S.th, background:'#e65100' }}>Employee</th>
                <th style={{ ...S.th, background:'#e65100' }}>Date</th>
                <th style={{ ...S.th, background:'#e65100' }}>Type</th>
                <th style={{ ...S.th, background:'#e65100' }}>Offence</th>
                <th style={{ ...S.th, background:'#e65100', textAlign:'right' }}>Amount</th>
                <th style={{ ...S.th, background:'#e65100' }}>Deduct Month</th>
                <th style={{ ...S.th, background:'#e65100' }}>Status</th>
              </tr></thead>
              <tbody>
                {filtPen.length===0 && <tr><td colSpan={7} style={{ ...S.td, textAlign:'center', color:'#aab2bd', padding:30 }}>No penalties yet</td></tr>}
                {filtPen.map((p,i)=>(
                  <tr key={p.id} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
                    <td style={{ ...S.td, fontWeight:600 }}>{p.employee_name}</td>
                    <td style={S.td}>{fmt(p.penalty_date)}</td>
                    <td style={S.td}><span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:700, background: p.penalty_type==='EMPLOYEE_BORNE'?'#ffebee':'#e8f5e9', color: p.penalty_type==='EMPLOYEE_BORNE'?'#c62828':'#2e7d32' }}>{p.penalty_type==='EMPLOYEE_BORNE'?'EMP':'COMPANY'}</span></td>
                    <td style={{ ...S.td, maxWidth:180 }}><div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.offence||'—'}</div></td>
                    <td style={{ ...S.td, textAlign:'right', fontWeight:800, color:'#c62828' }}>{SAR(p.amount)}</td>
                    <td style={{ ...S.td, fontFamily:'monospace' }}>{p.deduction_month||'—'}</td>
                    <td style={S.td}><span style={{ padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:700, background:'#fff3e0', color:'#e65100' }}>{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* EOS CALCULATOR */}
      {tab==='eos' && (() => {
        function ef(k,v) { setEos(p=>({...p,[k]:v})) }
        function calcEOS() {
          const basic = +eos.basic_salary||0
          if (!eos.join_date || !eos.leave_date || basic===0) return null
          const start  = new Date(eos.join_date)
          const end    = new Date(eos.leave_date)
          const diffMs = end - start
          if (diffMs < 0) return null
          const totalDays  = diffMs / 86400000
          const totalYears = totalDays / 365.25
          const totalMonths = totalDays / 30.4167

          // Saudi Labour Law Art. 84
          // First 5 years: ½ month per year; above 5 years: 1 month per year
          // On resignation: if <2yr = 0; 2-5yr = 1/3; 5-10yr = 2/3; >10yr = full
          const halfMth  = basic / 2
          const fullMth  = basic

          let gratuity = 0
          if (totalYears >= 5) {
            gratuity = (5 * halfMth) + ((totalYears - 5) * fullMth)
          } else {
            gratuity = totalYears * halfMth
          }

          // Resignation reduction per Labour Law
          let factor = 1
          if (eos.leave_reason === 'RESIGNATION') {
            if (totalYears < 2)       factor = 0
            else if (totalYears < 5)  factor = 1/3
            else if (totalYears < 10) factor = 2/3
            else                      factor = 1
          }
          const final = gratuity * factor

          // Ticket entitlement
          const ticketYears = Math.floor(totalYears / 2)

          return { totalYears, totalMonths, gratuity, factor, final, ticketYears, totalDays }
        }
        const result = calcEOS()
        const emp = employees.find(e=>e.id===eos.employee_id)
        if (emp && emp.bank_portion && !eos.basic_salary) {}

        return (
          <div style={S.card}>
            <div style={{ fontWeight:800, fontSize:15, color:'#5A32D4', marginBottom:16 }}>End of Service Benefit Calculator (Saudi Labour Law Art. 84)</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:16 }}>
              <div><label style={S.label}>Employee</label>
                <select style={S.inp} value={eos.employee_id} onChange={e=>{
                  const emp2=employees.find(x=>x.id===e.target.value)
                  ef('employee_id',e.target.value)
                  if (emp2?.bank_portion) ef('basic_salary',emp2.bank_portion)
                }}>
                  <option value="">— Select —</option>
                  {employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select></div>
              <div><label style={S.label}>Basic / Bank Salary (SAR/month)</label>
                <input type="number" style={S.inp} value={eos.basic_salary} onChange={e=>ef('basic_salary',e.target.value)} placeholder="0.00" /></div>
              <div><label style={S.label}>Reason for Leaving</label>
                <select style={S.inp} value={eos.leave_reason} onChange={e=>ef('leave_reason',e.target.value)}>
                  <option value="RESIGNATION">Resignation</option>
                  <option value="TERMINATION">Termination by Company</option>
                  <option value="MUTUAL">Mutual Agreement</option>
                  <option value="DEATH">Death / Disability</option>
                </select></div>
              <div><label style={S.label}>Join Date</label>
                <input type="date" style={S.inp} value={eos.join_date} onChange={e=>ef('join_date',e.target.value)} /></div>
              <div><label style={S.label}>Last Working Day</label>
                <input type="date" style={S.inp} value={eos.leave_date} onChange={e=>ef('leave_date',e.target.value)} /></div>
            </div>

            {result && (
              <div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
                  {[
                    { label:'Total Service', value:`${result.totalYears.toFixed(2)} yrs (${Math.round(result.totalDays)} days)`, color:'#1565C0' },
                    { label:'Gross Gratuity', value:SAR(result.gratuity), color:'#2e7d32' },
                    { label:'Applicable %', value:`${(result.factor*100).toFixed(0)}%`, color:'#e65100' },
                    { label:'NET EOS Due', value:SAR(result.final), color:'#5A32D4' },
                  ].map(c=>(
                    <div key={c.label} style={{ background:'#f5f7fa', borderRadius:10, padding:'14px 16px', textAlign:'center' }}>
                      <div style={{ fontSize:18, fontWeight:800, color:c.color }}>{c.value}</div>
                      <div style={{ fontSize:11, color:'#6b7c93', marginTop:4 }}>{c.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ background:'#e8f5e9', borderRadius:10, padding:'14px 18px', marginBottom:16 }}>
                  <div style={{ fontWeight:800, color:'#2e7d32', fontSize:14, marginBottom:8 }}>Calculation Breakdown</div>
                  <div style={{ fontSize:12, color:'#1a2e3d', lineHeight:1.8 }}>
                    {result.totalYears < 5 ? (
                      <div>Years 1–{Math.min(result.totalYears,5).toFixed(2)}: {result.totalYears.toFixed(2)} × ½ month ({SAR(+eos.basic_salary/2)}) = {SAR(result.gratuity)}</div>
                    ) : (
                      <>
                        <div>Years 1–5: 5 × ½ month ({SAR(+eos.basic_salary/2)}) = {SAR(5*(+eos.basic_salary/2))}</div>
                        <div>Years 5+: {(result.totalYears-5).toFixed(2)} × 1 month ({SAR(+eos.basic_salary)}) = {SAR((result.totalYears-5)*(+eos.basic_salary))}</div>
                        <div>Total = {SAR(result.gratuity)}</div>
                      </>
                    )}
                    {eos.leave_reason==='RESIGNATION' && (
                      <div style={{ marginTop:4, color:'#e65100' }}>
                        Resignation factor ({result.totalYears.toFixed(1)} yrs): {(result.factor*100).toFixed(0)}%
                        {result.totalYears<2&&' (less than 2 years — no EOS)'}
                        {result.totalYears>=2&&result.totalYears<5&&' (2–5 years = 1/3)'}
                        {result.totalYears>=5&&result.totalYears<10&&' (5–10 years = 2/3)'}
                        {result.totalYears>=10&&' (10+ years = full)'}
                      </div>
                    )}
                    <div style={{ marginTop:6, fontWeight:800, fontSize:13 }}>NET EOS Payable: {SAR(result.final)}</div>
                  </div>
                </div>

                <div style={{ background:'#e3f2fd', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#1565C0' }}>
                  <strong>Ticket entitlement:</strong> {result.ticketYears} ticket(s) (every 2 years of service)
                  &nbsp;·&nbsp; <strong>Leave balance:</strong> 30 days/year × {result.totalYears.toFixed(2)} yrs
                  = {(30*result.totalYears).toFixed(1)} days
                </div>
              </div>
            )}
            {!result && (
              <div style={{ textAlign:'center', padding:30, color:'#aab2bd' }}>Enter basic salary, join date, and last working day to calculate</div>
            )}
          </div>
        )
      })()}

      {/* LOAN FORM */}
      {showForm && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setShowForm(false)}>
          <div style={S.modal}>
            <div style={{ fontWeight:800, fontSize:16, color:'#1a2e3d', marginBottom:18 }}>New Salary Loan</div>
            <div style={{ marginBottom:14 }}><label style={S.label}>Employee *</label>
              <select style={S.inp} value={form.employee_id} onChange={e=>f('employee_id',e.target.value)}>
                <option value="">— Select —</option>
                {employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select></div>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Loan Amount (SAR) *</label>
                <input type="number" style={S.inp} value={form.loan_amount} onChange={e=>f('loan_amount',e.target.value)} placeholder="0.00" /></div>
              <div style={S.col}><label style={S.label}>Tenure (Months) — Max 24</label>
                <select style={S.inp} value={form.tenure_months} onChange={e=>f('tenure_months',e.target.value)}>
                  {MONTHS.map(m=><option key={m}>{m}</option>)}
                </select></div>
            </div>
            {+form.loan_amount > 0 && (
              <div style={{ background:'#e8f5e9', borderRadius:8, padding:'10px 14px', marginBottom:14, fontWeight:700, color:'#2e7d32' }}>
                EMI per month: {SAR(emi())} × {form.tenure_months} months = {SAR(+form.loan_amount)}
              </div>
            )}
            <div style={{ marginBottom:14 }}><label style={S.label}>Start Month (YYYY-MM)</label>
              <input type="month" style={S.inp} value={form.start_month} onChange={e=>f('start_month',e.target.value)} /></div>
            <div style={{ marginBottom:18 }}><label style={S.label}>Notes</label>
              <textarea style={{ ...S.inp, height:60, resize:'vertical' }} value={form.notes} onChange={e=>f('notes',e.target.value)} /></div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button style={S.btn('#aab2bd')} onClick={()=>setShowForm(false)}>Cancel</button>
              <button style={S.btn()} onClick={saveLoan} disabled={saving}>{saving?'Saving…':'Approve Loan'}</button>
            </div>
          </div>
        </div>
      )}

      {/* PENALTY FORM */}
      {showPF && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setShowPF(false)}>
          <div style={S.modal}>
            <div style={{ fontWeight:800, fontSize:16, color:'#1a2e3d', marginBottom:18 }}>New Penalty</div>
            <div style={{ marginBottom:14 }}><label style={S.label}>Employee *</label>
              <select style={S.inp} value={pForm.employee_id} onChange={e=>pf('employee_id',e.target.value)}>
                <option value="">— Select —</option>
                {employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select></div>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Penalty Type</label>
                <select style={S.inp} value={pForm.penalty_type} onChange={e=>pf('penalty_type',e.target.value)}>
                  <option value="EMPLOYEE_BORNE">Employee Borne</option>
                  <option value="COMPANY_BORNE">Company Borne</option>
                </select></div>
              <div style={S.col}><label style={S.label}>Amount (SAR) *</label>
                <input type="number" style={S.inp} value={pForm.amount} onChange={e=>pf('amount',e.target.value)} placeholder="0.00" /></div>
            </div>
            <div style={{ marginBottom:14 }}><label style={S.label}>Offence / Reason</label>
              <input style={S.inp} value={pForm.offence} onChange={e=>pf('offence',e.target.value)} placeholder="Description of offence" /></div>
            <div style={{ marginBottom:14 }}><label style={S.label}>Deduct in Month (YYYY-MM)</label>
              <input type="month" style={S.inp} value={pForm.deduction_month} onChange={e=>pf('deduction_month',e.target.value)} /></div>
            <div style={{ marginBottom:18 }}><label style={S.label}>Notes</label>
              <textarea style={{ ...S.inp, height:60, resize:'vertical' }} value={pForm.notes} onChange={e=>pf('notes',e.target.value)} /></div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button style={S.btn('#aab2bd')} onClick={()=>setShowPF(false)}>Cancel</button>
              <button style={S.btn('#e65100')} onClick={savePenalty} disabled={saving}>{saving?'Saving…':'Save Penalty'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
