import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { exportToExcel } from '../lib/exportExcel'

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modal:   { background:'#fff', borderRadius:16, padding:24, width:640, maxWidth:'100%', maxHeight:'92vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.18)' },
  inp:     { width:'100%', padding:'9px 11px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box', background:'#fff' },
  label:   { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4 },
  row:     { display:'flex', gap:12, marginBottom:13, flexWrap:'wrap' },
  col:     { flex:1, minWidth:130 },
  sec:     { fontSize:11, fontWeight:800, color:'#e65100', marginBottom:8, marginTop:4, paddingBottom:4, borderBottom:'1px solid #fff3e0', letterSpacing:1, textTransform:'uppercase' },
}

const JOB_TYPES = ['INSTALLATION','COMMISSIONING','MAINTENANCE','SURVEY','TESTING','PROJECT SUPPORT','ADMINISTRATIVE','OTHER']

export default function FoodAllowance({ entityId }) {
  const [records,   setRecords]   = useState([])
  const [employees, setEmployees] = useState([])
  const [depts,     setDepts]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [open,      setOpen]      = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [filterMon,    setFilterMon]    = useState(new Date().toISOString().slice(0,7))
  const [filterDept,   setFilterDept]   = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [search,       setSearch]       = useState('')

  // form
  const [reqDate,    setReqDate]    = useState(new Date().toISOString().split('T')[0])
  const [empId,      setEmpId]      = useState('')
  const [deptId,     setDeptId]     = useState('')
  const [deptName,   setDeptName]   = useState('')
  const [projNum,    setProjNum]    = useState('')
  const [projName,   setProjName]   = useState('')
  const [jobNum,     setJobNum]     = useState('')
  const [jobType,    setJobType]    = useState('')
  const [location,   setLocation]   = useState('')
  const [coverage,   setCoverage]   = useState('SINGLE')
  const [numPersons, setNumPersons] = useState(1)
  const [month,      setMonth]      = useState(new Date().toISOString().slice(0,7))
  const [daysCount,  setDaysCount]  = useState('')
  const [dailyRate,  setDailyRate]  = useState('50')

  useEffect(() => { load() }, [entityId, filterMon])

  async function load() {
    if (!entityId) return
    setLoading(true)
    const [{ data: r, error: rErr }, { data: e }, { data: d }, { data: allEmp }] = await Promise.all([
      supabase.from('food_allowances')
        .select('id,request_number,allowance_date,allowance_month,employee_id,department,location,job_no,job_type,no_persons,no_days,daily_rate,total_amount,remarks,status,created_at')
        .eq('allowance_month', filterMon)
        .order('created_at',{ascending:false}),
      supabase.from('employees').select('id,full_name_en,employee_number,fa_eligible,fa_amount,department_id,entity_id').eq('entity_id', entityId).eq('is_active', true).order('full_name_en'),
      supabase.from('departments').select('id,dept_name,dept_code').eq('entity_id', entityId).eq('is_active', true).order('dept_name'),
      supabase.from('employees').select('id,full_name_en,employee_number,entity_id').eq('is_active', true),
    ])
    if (rErr) console.error('[FoodAllowance] load error:', rErr)
    // Build emp map from all entities (field form employees may differ from admin entity)
    const empMap = Object.fromEntries([...(e||[]), ...(allEmp||[])].map(x => [x.id, x]))
    // Build dept map for abbreviation lookup
    const deptMap = Object.fromEntries((d||[]).map(x => [x.id, x]))
    // Normalise records — attach employee + dept abbreviation
    const enriched = (r||[])
      .map(row => {
        const emp  = empMap[row.employee_id] || {}
        const dept = deptMap[emp.department_id] || {}
        return { ...row, emp, deptCode: dept.dept_code || dept.dept_name || row.department || '' }
      })
    setRecords(enriched); setEmployees(e||[]); setDepts(d||[])
    setLoading(false)
  }

  function onDeptChange(id) {
    setDeptId(id)
    const d = depts.find(x=>x.id===id)
    setDeptName(d?d.dept_name:'')
  }

  function onEmpChange(id) {
    setEmpId(id)
    const emp = employees.find(e=>e.id===id)
    if (emp?.fa_amount) setDailyRate(String(emp.fa_amount))
  }

  function resetForm() {
    setReqDate(new Date().toISOString().split('T')[0]); setEmpId(''); setDeptId(''); setDeptName('')
    setProjNum(''); setProjName(''); setJobNum(''); setJobType(''); setLocation('')
    setCoverage('SINGLE'); setNumPersons(1); setMonth(new Date().toISOString().slice(0,7))
    setDaysCount(''); setDailyRate('50')
  }

  const totalAmount = (parseFloat(daysCount)||0) * (parseFloat(dailyRate)||0) * (coverage==='MULTIPLE'?parseInt(numPersons)||1:1)

  async function save() {
    if (!empId) { alert('Please select an employee.'); return }
    if (!daysCount) { alert('Working days are required.'); return }
    setSaving(true)
    const reqNum = `FA-${Date.now().toString().slice(-6)}`
    const { error } = await supabase.from('food_allowances').insert({
      entity_id:       entityId,
      request_number:  reqNum,
      request_date:    reqDate,
      employee_id:     empId,
      department_id:   deptId||null,
      department_name: deptName||null,
      project_number:  projNum||null,
      project_name:    projName||null,
      job_number:      jobNum||null,
      job_type:        jobType||null,
      location:        location||null,
      coverage_type:   coverage,
      no_of_persons:   coverage==='MULTIPLE' ? parseInt(numPersons)||1 : 1,
      allowance_month: month,
      days_count:      parseInt(daysCount)||0,
      daily_rate:      parseFloat(dailyRate)||0,
      total_amount:    totalAmount,
      status:          'APPROVED',  // pre-approved — eligibility set in Employee DB / Site Assignment
    })
    setSaving(false)
    if (error) { alert(error.message); return }
    setOpen(false); resetForm(); load()
  }

  async function approve(id) {
    await supabase.from('food_allowances').update({ status:'APPROVED', approved_date: new Date().toISOString().split('T')[0] }).eq('id',id)
    load()
  }

  function doExport() {
    const flat = records.map(r => ({
      ...r,
      employee_name:   r.emp?.full_name_en    || '',
      employee_number: r.emp?.employee_number || '',
    }))
    const cols = [
      { key: 'request_number',  label: 'Req #' },
      { key: 'request_date',    label: 'Date',              format: 'date'     },
      { key: 'employee_name',   label: 'Employee' },
      { key: 'employee_number', label: 'Emp #' },
      { key: 'department_name', label: 'Department' },
      { key: 'project_name',    label: 'Project' },
      { key: 'job_number',      label: 'Job #' },
      { key: 'location',        label: 'Location' },
      { key: 'allowance_month', label: 'Month' },
      { key: 'coverage_type',   label: 'Coverage' },
      { key: 'no_of_persons',   label: 'Persons' },
      { key: 'days_count',      label: 'Days' },
      { key: 'daily_rate',      label: 'Daily Rate (SAR)', format: 'currency' },
      { key: 'total_amount',    label: 'Total (SAR)',       format: 'currency' },
      { key: 'status',          label: 'Status' },
    ]
    exportToExcel(flat, cols, `FoodAllowance_${filterMon}`, 'Food Allowance')
  }

  const SAR = v => `SAR ${(v||0).toLocaleString(undefined,{maximumFractionDigits:0})}`
  const allDepts = [...new Set(records.map(r=>r.deptCode).filter(Boolean))].sort()

  const filtered = records.filter(r => {
    const name = (r.emp?.full_name_en||'').toLowerCase()
    const matchS = !search || name.includes(search.toLowerCase()) || (r.request_number||'').toLowerCase().includes(search.toLowerCase()) || (r.location||'').toLowerCase().includes(search.toLowerCase())
    const matchD = !filterDept || r.deptCode === filterDept
    const matchSt = filterStatus==='ALL' || r.status===filterStatus
    return matchS && matchD && matchSt
  })

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display:'flex', gap:10, marginBottom:10, alignItems:'center', flexWrap:'wrap' }}>
        <button onClick={()=>{ resetForm(); setOpen(true) }}
          style={{ background:'linear-gradient(135deg,#e65100,#ef6c00)', color:'#fff', border:'none', borderRadius:10, padding:'10px 22px', cursor:'pointer', fontSize:14, fontWeight:700, whiteSpace:'nowrap' }}>
          🍽️ + New FA Request
        </button>
        <button onClick={doExport}
          style={{ background:'linear-gradient(135deg,#2e7d32,#43a047)', color:'#fff', border:'none', borderRadius:10, padding:'10px 18px', cursor:'pointer', fontSize:13, fontWeight:700, whiteSpace:'nowrap' }}>
          📥 Export Excel
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center', background:'#fff', borderRadius:10, padding:'10px 14px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
        <input type="month" value={filterMon} onChange={e=>setFilterMon(e.target.value)}
          style={{ padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none' }} />
        <input placeholder="🔍 Search name, ref, location…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{ flex:2, minWidth:160, padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none' }} />
        <select value={filterDept} onChange={e=>setFilterDept(e.target.value)}
          style={{ flex:1, minWidth:110, padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none' }}>
          <option value="">All Depts</option>
          {allDepts.map(d=><option key={d} value={d}>{d}</option>)}
        </select>
        <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
          style={{ flex:1, minWidth:110, padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none' }}>
          <option value="ALL">All Status</option>
          <option value="APPROVED">Approved</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="PENDING">Pending</option>
        </select>
        {(search||filterDept||filterStatus!=='ALL') &&
          <button onClick={()=>{ setSearch(''); setFilterDept(''); setFilterStatus('ALL') }}
            style={{ background:'#f0f4f8', border:'none', borderRadius:7, padding:'7px 12px', cursor:'pointer', fontSize:12, color:'#888' }}>✕ Clear</button>}
      </div>

      {/* Summary cards */}
      <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'nowrap', overflowX:'auto', paddingBottom:2 }}>
        {[
          { label:'Total Records',  value:filtered.length,                                                                                     color:'#1565c0', isSAR:false },
          { label:'Total Amount',   value:SAR(filtered.reduce((s,r)=>s+(r.total_amount||0),0)),                                                color:'#e65100' },
          { label:'Approved',       value:SAR(filtered.filter(r=>r.status==='APPROVED').reduce((s,r)=>s+(r.total_amount||0),0)),               color:'#2e7d32' },
          { label:'Pending/Review', value:SAR(filtered.filter(r=>r.status!=='APPROVED').reduce((s,r)=>s+(r.total_amount||0),0)),               color:'#e65100' },
        ].map(c=>(
          <div key={c.label} style={{ background:'#fff', borderRadius:10, padding:'10px 18px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', whiteSpace:'nowrap' }}>
            <div style={{ fontSize:11, color:'#6b7c93', fontWeight:600 }}>{c.label}</div>
            <div style={{ fontSize:16, fontWeight:800, color:c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* List — CSS grid, single-line rows */}
      <div style={{ background:'#fff', borderRadius:14, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', overflow:'hidden' }}>
        <div style={{ display:'grid', gridTemplateColumns:'100px 90px 1fr 90px 100px 80px 70px 90px 90px', background:'#f8fafd', padding:'8px 14px', borderBottom:'1px solid #eef2f7' }}>
          {['Req #','Date','Employee','Dept','Location','Days','Rate','Total','Status'].map(h=>(
            <div key={h} style={{ fontSize:11, color:'#6b7c93', fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, whiteSpace:'nowrap' }}>{h}</div>
          ))}
        </div>
        {loading ? <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>Loading…</div>
        : filtered.length===0 ? <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No records for {filterMon}</div>
        : filtered.map((r,idx)=>(
          <div key={r.id} style={{ display:'grid', gridTemplateColumns:'100px 90px 1fr 90px 100px 80px 70px 90px 90px', padding:'9px 14px', borderTop:idx>0?'1px solid #f0f4f8':'none', alignItems:'center' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#e65100', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.request_number||'-'}</div>
            <div style={{ fontSize:12, color:'#444', whiteSpace:'nowrap' }}>{r.allowance_date||'-'}</div>
            <div style={{ minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.emp?.full_name_en||'—'}</div>
              <div style={{ fontSize:10, color:'#aab2bd' }}>{r.emp?.employee_number||''}</div>
            </div>
            <div style={{ fontSize:11, color:'#555', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.deptCode||'-'}</div>
            <div style={{ fontSize:12, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.location||'-'}</div>
            <div style={{ fontSize:12, textAlign:'center' }}>{r.no_days||r.days_count||'-'}{(r.no_persons||r.no_of_persons)>1?` ×${r.no_persons||r.no_of_persons}`:''}</div>
            <div style={{ fontSize:12 }}>SAR {(r.daily_rate||0).toFixed(0)}</div>
            <div style={{ fontSize:13, fontWeight:700, color:'#1a237e' }}>SAR {(r.total_amount||0).toLocaleString()}</div>
            <div>
              <span style={{ background:r.status==='APPROVED'?'#e8f5e922':'#fff3e0', color:r.status==='APPROVED'?'#2e7d32':'#e65100', borderRadius:6, padding:'3px 8px', fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>{r.status}</span>
            </div>
          </div>
        ))}
        {filtered.length>0 && (
          <div style={{ display:'flex', justifyContent:'flex-end', padding:'10px 20px', borderTop:'2px solid #e8eaf6', background:'#f8fafd' }}>
            <span style={{ fontSize:13, fontWeight:800, color:'#e65100' }}>
              {filtered.length} record{filtered.length!==1?'s':''} · Total: SAR {filtered.reduce((s,r)=>s+(r.total_amount||0),0).toLocaleString(undefined,{minimumFractionDigits:2})}
            </span>
          </div>
        )}
      </div>

      {/* Modal */}
      {open && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setOpen(false)}>
          <div style={S.modal}>
            <h3 style={{ margin:'0 0 16px', fontSize:16, fontWeight:800 }}>🍽️ New Food Allowance Request</h3>

            <div style={S.sec}>Request Info</div>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Request Date</label><input type="date" style={S.inp} value={reqDate} onChange={e=>setReqDate(e.target.value)} /></div>
              <div style={S.col}><label style={S.label}>Month (YYYY-MM) *</label><input type="month" style={S.inp} value={month} onChange={e=>setMonth(e.target.value)} /></div>
            </div>
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>Department</label>
                <select style={S.inp} value={deptId} onChange={e=>onDeptChange(e.target.value)}>
                  <option value="">-- Select Department --</option>
                  {depts.map(d=><option key={d.id} value={d.id}>{d.dept_code || d.dept_name}</option>)}
                </select>
              </div>
              <div style={S.col}>
                <label style={S.label}>Employee *</label>
                <select style={S.inp} value={empId} onChange={e=>onEmpChange(e.target.value)}>
                  <option value="">-- Select Employee --</option>
                  {employees.map(e=><option key={e.id} value={e.id}>{e.employee_number?`[${e.employee_number}] `:''}{e.full_name_en}</option>)}
                </select>
              </div>
            </div>

            <div style={S.sec}>Project / Job Details</div>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Project #</label><input style={S.inp} value={projNum} onChange={e=>setProjNum(e.target.value)} placeholder="PROJ-001" /></div>
              <div style={S.col}><label style={S.label}>Project Name</label><input style={S.inp} value={projName} onChange={e=>setProjName(e.target.value)} /></div>
            </div>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Job #</label><input style={S.inp} value={jobNum} onChange={e=>setJobNum(e.target.value)} /></div>
              <div style={S.col}>
                <label style={S.label}>Job Type</label>
                <select style={S.inp} value={jobType} onChange={e=>setJobType(e.target.value)}>
                  <option value="">-- Select --</option>
                  {JOB_TYPES.map(j=><option key={j} value={j}>{j}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom:13 }}><label style={S.label}>Location / Site</label><input style={S.inp} value={location} onChange={e=>setLocation(e.target.value)} placeholder="City, site name, or address…" /></div>

            <div style={S.sec}>Coverage & Calculation</div>
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>Coverage Type</label>
                <select style={S.inp} value={coverage} onChange={e=>{ setCoverage(e.target.value); if(e.target.value==='SINGLE') setNumPersons(1) }}>
                  <option value="SINGLE">Single Person</option>
                  <option value="MULTIPLE">Multiple Persons</option>
                </select>
              </div>
              {coverage==='MULTIPLE' && (
                <div style={S.col}><label style={S.label}>No. of Persons</label><input type="number" min={2} style={S.inp} value={numPersons} onChange={e=>setNumPersons(e.target.value)} /></div>
              )}
            </div>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Working Days *</label><input type="number" style={S.inp} value={daysCount} onChange={e=>setDaysCount(e.target.value)} placeholder="e.g. 26" min={1} max={31} /></div>
              <div style={S.col}><label style={S.label}>Daily Rate (SAR) *</label><input type="number" step="0.01" style={S.inp} value={dailyRate} onChange={e=>setDailyRate(e.target.value)} /></div>
            </div>

            <div style={{ background:'#fff3e0', borderRadius:10, padding:'10px 16px', marginBottom:16, display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontWeight:700, color:'#e65100' }}>
                {(parseFloat(daysCount)||0)} days × SAR {(parseFloat(dailyRate)||0)}{coverage==='MULTIPLE'?` × ${numPersons} persons`:''}
              </span>
              <span style={{ fontWeight:800, fontSize:16, color:'#e65100' }}>SAR {totalAmount.toFixed(2)}</span>
            </div>

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={()=>{ setOpen(false); resetForm() }} style={{ background:'#f0f4f8', color:'#555', border:'none', borderRadius:9, padding:'10px 20px', cursor:'pointer', fontSize:13 }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ background:'linear-gradient(135deg,#e65100,#ef6c00)', color:'#fff', border:'none', borderRadius:9, padding:'10px 24px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                {saving?'Submitting…':'Submit FA Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
