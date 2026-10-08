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
  sec:     { fontSize:11, fontWeight:800, color:'#1a237e', marginBottom:8, marginTop:4, paddingBottom:4, borderBottom:'1px solid #e8eaf6', letterSpacing:1, textTransform:'uppercase' },
}

const OT_TYPES   = ['NORMAL','FRIDAY','HOLIDAY']
const WORK_TYPES = ['FIELD WORK','OFFICE WORK','REMOTE','ON-CALL','TRAVEL DAY']
const JOB_TYPES  = ['INSTALLATION','COMMISSIONING','MAINTENANCE','SURVEY','TESTING','PROJECT SUPPORT','ADMINISTRATIVE','OTHER']
// All OT multipliers are flat 1.5x per design. TRAVEL is 1.0x. (No 1.75x or 2.0x)
const OT_MULT    = { NORMAL:1.5, FRIDAY:1.5, HOLIDAY:1.5, TRAVEL:1.0 }

const STATUS_COLORS = {
  SUBMITTED: { bg:'#e3f2fd', color:'#0277bd' },
  PENDING:   { bg:'#fff3e0', color:'#e65100' },
  APPROVED:  { bg:'#e8f5e9', color:'#2e7d32' },
  REJECTED:  { bg:'#ffebee', color:'#c62828' },
}

const GRID = '110px 90px 1fr 60px 110px 80px 60px 90px 90px 80px'
const cell = { padding:'0 4px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontSize:12, display:'flex', alignItems:'center' }
const SAR  = n => `SAR ${(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`

function OTList({ records, onApprove, onReject }) {
  const [expanded, setExpanded] = useState(null)
  return (
    <div>
      {records.map(r => {
        const sc   = STATUS_COLORS[r.status] || { bg:'#f5f5f5', color:'#555' }
        const isEx = expanded === r.id
        const canAct = ['SUBMITTED','PENDING'].includes(r.status)
        return (
          <div key={r.id}>
            {/* Single-line row */}
            <div
              onClick={() => setExpanded(isEx ? null : r.id)}
              style={{ display:'grid', gridTemplateColumns:GRID, gap:0, padding:'9px 12px', borderTop:'1px solid #f0f4f8', cursor:'pointer', background: isEx ? '#f0f4ff' : 'transparent' }}
              onMouseEnter={e=>{ if(!isEx) e.currentTarget.style.background='#f8fafd' }}
              onMouseLeave={e=>{ if(!isEx) e.currentTarget.style.background='transparent' }}
            >
              <div style={{ ...cell, fontWeight:700, color:'#1a237e', fontSize:11 }}>{r.request_number||'—'}</div>
              <div style={{ ...cell, color:'#546e7a' }}>{r.ot_date}</div>
              <div style={{ ...cell, fontWeight:600 }}>{r.employees?.full_name_en || r.requester_name || '—'}</div>
              <div style={{ ...cell, color:'#0277bd', fontWeight:700 }}>{r.department || r.department_name || '—'}</div>
              <div style={{ ...cell, color:'#546e7a' }}>{r.project_number || '—'}</div>
              <div style={{ ...cell, fontWeight:700 }}>{r.ot_type}</div>
              <div style={{ ...cell, justifyContent:'flex-end', fontWeight:600 }}>{r.hours}h</div>
              <div style={{ ...cell, justifyContent:'flex-end', fontWeight:700 }}>{SAR(r.total_amount)}</div>
              <div style={cell}>
                <span style={{ background:sc.bg, color:sc.color, borderRadius:5, padding:'2px 7px', fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>{r.status}</span>
              </div>
              <div style={{ ...cell, gap:4 }} onClick={e=>e.stopPropagation()}>
                {canAct && <>
                  <button onClick={()=>onApprove(r.id)} style={{ background:'#e8f5e9', color:'#2e7d32', border:'none', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:11, fontWeight:700 }}>✓</button>
                  <button onClick={()=>onReject(r.id)}  style={{ background:'#ffebee', color:'#c62828', border:'none', borderRadius:5, padding:'3px 8px', cursor:'pointer', fontSize:11, fontWeight:700 }}>✕</button>
                </>}
                <span style={{ fontSize:10, color:'#aab2bd', marginLeft:2 }}>{isEx ? '▲' : '▼'}</span>
              </div>
            </div>

            {/* Expandable detail */}
            {isEx && (
              <div style={{ background:'#f8fafd', borderTop:'1px solid #e8eef4', padding:'12px 16px', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'10px 20px', fontSize:12 }}>
                {[
                  ['Employee #',    r.employees?.employee_number || '—'],
                  ['Contact',       r.contact_number || '—'],
                  ['Department',    r.department || r.department_name || '—'],
                  ['Project #',     r.project_number || '—'],
                  ['Project Name',  r.project_name || '—'],
                  ['Job #',         r.job_number || '—'],
                  ['OT Type',       r.ot_type || '—'],
                  ['Work Type',     r.work_type || '—'],
                  ['From Time',     r.from_time || '—'],
                  ['To Time',       r.to_time || '—'],
                  ['Hours',         `${r.hours}h`],
                  ['OT Rate/hr',    `SAR ${(r.ot_rate||0).toFixed(2)}`],
                  ['Multiplier',    `×${r.multiplier||1.5}`],
                  ['Total Amount',  SAR(r.total_amount)],
                  ['Status',        r.status],
                  ['Remarks',       r.remarks || '—'],
                ].map(([k,v]) => (
                  <div key={k}>
                    <div style={{ fontSize:10, color:'#6b7c93', fontWeight:700, marginBottom:2 }}>{k}</div>
                    <div style={{ fontWeight:600, color:'#222' }}>{v}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function Overtime({ entityId }) {
  const [records,   setRecords]   = useState([])
  const [employees, setEmployees] = useState([])
  const [depts,     setDepts]     = useState([])
  const [loading,   setLoading]   = useState(true)
  const [open,      setOpen]      = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [filterSt,  setFilterSt]  = useState('ALL')

  // form
  const [otDate,    setOtDate]    = useState(new Date().toISOString().split('T')[0])
  const [empId,     setEmpId]     = useState('')
  const [deptId,    setDeptId]    = useState('')
  const [deptName,  setDeptName]  = useState('')
  const [projNum,   setProjNum]   = useState('')
  const [projName,  setProjName]  = useState('')
  const [jobNum,    setJobNum]    = useState('')
  const [jobType,   setJobType]   = useState('')
  const [workType,  setWorkType]  = useState('')
  const [otType,    setOtType]    = useState('NORMAL')
  const [fromTime,  setFromTime]  = useState('')
  const [toTime,    setToTime]    = useState('')
  const [hours,     setHours]     = useState('')
  const [reason,    setReason]    = useState('')

  useEffect(() => { load() }, [entityId])

  async function load() {
    if (!entityId) return
    setLoading(true)
    const [{ data: r }, { data: e }, { data: d }, { data: allEmp }] = await Promise.all([
      supabase.from('overtime_requests')
        .select('*')                          // flat — no nested join (avoids PGRST201)
        .eq('entity_id', entityId)
        .order('ot_date',{ascending:false}),
      supabase.from('employees').select('id,full_name_en,employee_number,basic_salary').eq('entity_id', entityId).eq('is_active', true).order('full_name_en'),
      supabase.from('departments').select('id,dept_name,dept_code').eq('entity_id', entityId).eq('is_active', true).order('dept_name'),
      supabase.from('employees').select('id,full_name_en,employee_number,basic_salary').eq('is_active', true),
    ])
    // Build empMap to join employee names in JS (no nested join needed)
    const empMap = Object.fromEntries([...(e||[]),...(allEmp||[])].map(x=>[x.id, x]))
    const enriched = (r||[]).map(row => ({
      ...row,
      employees: empMap[row.employee_id] || {},
    }))
    setRecords(enriched); setEmployees(e||[]); setDepts(d||[])
    setLoading(false)
  }

  function calcHours(from, to) {
    if (!from || !to) return
    const [fh,fm] = from.split(':').map(Number)
    const [th,tm] = to.split(':').map(Number)
    const diff = (th*60+tm) - (fh*60+fm)
    if (diff > 0) setHours((diff/60).toFixed(2))
  }

  function onDeptChange(id) {
    setDeptId(id)
    const d = depts.find(x=>x.id===id)
    setDeptName(d?d.dept_name:'')
  }

  const emp        = employees.find(e=>e.id===empId)
  const empBasic   = emp ? (emp.basic_salary || 0) : 0
  const hourlyRate = empBasic / 30 / 8
  const mult       = OT_MULT[otType] ?? 1.5
  const totalAmt   = (parseFloat(hours)||0) * hourlyRate * mult

  function resetForm() {
    setOtDate(new Date().toISOString().split('T')[0]); setEmpId(''); setDeptId(''); setDeptName('')
    setProjNum(''); setProjName(''); setJobNum(''); setJobType(''); setWorkType('')
    setOtType('NORMAL'); setFromTime(''); setToTime(''); setHours(''); setReason('')
  }

  async function save() {
    if (!empId) { alert('Please select an employee.'); return }
    if (!hours) { alert('Hours are required.'); return }
    setSaving(true)
    const reqNum = `OT-${Date.now().toString().slice(-6)}`
    const { error } = await supabase.from('overtime_requests').insert({
      entity_id:       entityId,
      request_number:  reqNum,
      employee_id:     empId,
      department_id:   deptId||null,
      department_name: deptName||null,
      project_number:  projNum||null,
      project_name:    projName||null,
      job_number:      jobNum||null,
      job_type:        jobType||null,
      work_type:       workType||null,
      ot_date:         otDate,
      from_time:       fromTime||null,
      to_time:         toTime||null,
      hours:           parseFloat(hours)||0,
      ot_type:         otType,
      ot_rate:         parseFloat(hourlyRate.toFixed(2)),
      total_amount:    parseFloat(totalAmt.toFixed(2)),
      reason:          reason||null,
      status:          'PENDING',
    })
    setSaving(false)
    if (error) { alert(error.message); return }
    setOpen(false); resetForm(); load()
  }

  async function approve(id) { await supabase.from('overtime_requests').update({ status:'APPROVED', approved_date: new Date().toISOString().split('T')[0] }).eq('id',id); load() }
  async function reject(id)  { await supabase.from('overtime_requests').update({ status:'REJECTED' }).eq('id',id); load() }

  function doExport() {
    const flat = filtered.map(r => ({
      ...r,
      employee_name:   r.employees?.full_name_en    || '',
      employee_number: r.employees?.employee_number || '',
    }))
    const cols = [
      { key: 'request_number',  label: 'Req #' },
      { key: 'ot_date',         label: 'Date',            format: 'date'     },
      { key: 'employee_name',   label: 'Employee' },
      { key: 'employee_number', label: 'Emp #' },
      { key: 'department_name', label: 'Department' },
      { key: 'project_name',    label: 'Project' },
      { key: 'job_number',      label: 'Job #' },
      { key: 'job_type',        label: 'Job Type' },
      { key: 'work_type',       label: 'Work Type' },
      { key: 'ot_type',         label: 'OT Type' },
      { key: 'from_time',       label: 'Time In' },
      { key: 'to_time',         label: 'Time Out' },
      { key: 'hours',           label: 'Hours' },
      { key: 'ot_rate',         label: 'Rate/hr (SAR)',   format: 'currency' },
      { key: 'total_amount',    label: 'Total (SAR)',      format: 'currency' },
      { key: 'reason',          label: 'Reason' },
      { key: 'status',          label: 'Status' },
    ]
    exportToExcel(flat, cols, 'Overtime_Requests', 'Overtime')
  }

  // ── Filter states ──
  const thisMonth = new Date().toISOString().slice(0,7)
  const [filterMon,    setFilterMon]    = useState(thisMonth)
  const [filterDept,   setFilterDept]   = useState('')
  const [filterSearch, setFilterSearch] = useState('')

  const filtered = records.filter(r => {
    if (filterMon  && !(r.ot_date||'').startsWith(filterMon))                                          return false
    if (filterSt !== 'ALL' && r.status !== filterSt)                                                   return false
    if (filterDept && (r.department||r.department_name||'') !== filterDept)                            return false
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      const name = (r.employees?.full_name_en || r.requester_name || '').toLowerCase()
      const req  = (r.request_number||'').toLowerCase()
      if (!name.includes(q) && !req.includes(q)) return false
    }
    return true
  })

  const SAR2 = n => `SAR ${(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`
  const cards = [
    { label:'Total',    value:SAR2(filtered.reduce((s,r)=>s+(r.total_amount||0),0)),                              color:'#1a237e' },
    { label:'Submitted',value:SAR2(filtered.filter(r=>r.status==='SUBMITTED').reduce((s,r)=>s+(r.total_amount||0),0)), color:'#0277bd' },
    { label:'Pending',  value:SAR2(filtered.filter(r=>r.status==='PENDING').reduce((s,r)=>s+(r.total_amount||0),0)),  color:'#e65100' },
    { label:'Approved', value:SAR2(filtered.filter(r=>r.status==='APPROVED').reduce((s,r)=>s+(r.total_amount||0),0)), color:'#2e7d32' },
  ]

  const deptOptions = [...new Set(records.map(r => r.department || r.department_name).filter(Boolean))].sort()

  const inp2 = { padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', fontFamily:'inherit', background:'#fff' }

  return (
    <div>
      {/* ── Top action bar ── */}
      <div style={{ display:'flex', gap:10, marginBottom:12, alignItems:'center', flexWrap:'wrap' }}>
        <button onClick={()=>{ resetForm(); setOpen(true) }}
          style={{ background:'linear-gradient(135deg,#1a237e,#3949ab)', color:'#fff', border:'none', borderRadius:10, padding:'10px 22px', cursor:'pointer', fontSize:14, fontWeight:700 }}>
          ⏱️ + New OT Request
        </button>
        <button onClick={doExport}
          style={{ background:'linear-gradient(135deg,#2e7d32,#43a047)', color:'#fff', border:'none', borderRadius:10, padding:'10px 18px', cursor:'pointer', fontSize:13, fontWeight:700, whiteSpace:'nowrap' }}>
          📥 Export Excel
        </button>
      </div>

      {/* ── Summary cards ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12 }}>
        {cards.map(c => (
          <div key={c.label} style={{ background:'#fff', borderRadius:10, padding:'12px 16px', boxShadow:'0 1px 4px rgba(0,0,0,0.07)', borderLeft:`4px solid ${c.color}` }}>
            <div style={{ fontSize:10, color:'#6b7c93', fontWeight:700, marginBottom:4 }}>{c.label.toUpperCase()}</div>
            <div style={{ fontSize:14, fontWeight:800, color:c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
        <input type="month" value={filterMon} onChange={e=>setFilterMon(e.target.value)} style={inp2} />
        <select value={filterSt} onChange={e=>setFilterSt(e.target.value)} style={inp2}>
          <option value="ALL">All Status</option>
          {['SUBMITTED','PENDING','APPROVED','REJECTED'].map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterDept} onChange={e=>setFilterDept(e.target.value)} style={inp2}>
          <option value="">All Depts</option>
          {deptOptions.map(d=><option key={d} value={d}>{d}</option>)}
        </select>
        <input placeholder="🔍 Search employee / req #" value={filterSearch} onChange={e=>setFilterSearch(e.target.value)}
          style={{ ...inp2, minWidth:200, flex:1 }} />
        {(filterMon!==thisMonth||filterSt!=='ALL'||filterDept||filterSearch) &&
          <button onClick={()=>{ setFilterMon(thisMonth); setFilterSt('ALL'); setFilterDept(''); setFilterSearch('') }}
            style={{ ...inp2, background:'#ffebee', color:'#c62828', border:'1px solid #ffcdd2', cursor:'pointer', fontWeight:700 }}>✕ Clear</button>
        }
        <span style={{ marginLeft:'auto', fontSize:12, color:'#6b7c93' }}>{filtered.length} record{filtered.length!==1?'s':''}</span>
      </div>

      {/* ── List ── */}
      <div style={{ background:'#fff', borderRadius:14, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', overflow:'hidden' }}>
        {/* Header row */}
        <div style={{ display:'grid', gridTemplateColumns:'110px 90px 1fr 60px 110px 80px 60px 90px 90px 80px', gap:0, background:'#f8fafd', padding:'8px 12px', borderBottom:'1px solid #e8eef4' }}>
          {['Req #','Date','Employee','Dept','Project #','Type','Hours','Amount','Status',''].map(h=>(
            <div key={h} style={{ fontSize:10, fontWeight:700, color:'#6b7c93', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', padding:'0 4px' }}>{h}</div>
          ))}
        </div>

        {loading
          ? <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>Loading…</div>
          : filtered.length===0
            ? <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No OT records</div>
            : <OTList records={filtered} onApprove={approve} onReject={reject} />
        }
      </div>

      {/* Modal */}
      {open && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setOpen(false)}>
          <div style={S.modal}>
            <h3 style={{ margin:'0 0 16px', fontSize:16, fontWeight:800 }}>⏱️ New Overtime Request</h3>

            <div style={S.sec}>Request Info</div>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>OT Date *</label><input type="date" style={S.inp} value={otDate} onChange={e=>setOtDate(e.target.value)} /></div>
              <div style={S.col}>
                <label style={S.label}>OT Type *</label>
                <select style={S.inp} value={otType} onChange={e=>setOtType(e.target.value)}>
                  <option value="NORMAL">Normal OT (×1.5)</option>
                  <option value="FRIDAY">Friday (×1.5)</option>
                  <option value="HOLIDAY">Public Holiday (×1.5)</option>
                  <option value="TRAVEL">Travel Day (×1.0)</option>
                </select>
              </div>
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
                <select style={S.inp} value={empId} onChange={e=>setEmpId(e.target.value)}>
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
              <div style={S.col}>
                <label style={S.label}>Work Type</label>
                <select style={S.inp} value={workType} onChange={e=>setWorkType(e.target.value)}>
                  <option value="">-- Select --</option>
                  {WORK_TYPES.map(w=><option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>

            <div style={S.sec}>Time & Hours</div>
            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>From Time</label>
                <input type="time" style={S.inp} value={fromTime} onChange={e=>{ setFromTime(e.target.value); calcHours(e.target.value, toTime) }} />
              </div>
              <div style={S.col}>
                <label style={S.label}>To Time</label>
                <input type="time" style={S.inp} value={toTime} onChange={e=>{ setToTime(e.target.value); calcHours(fromTime, e.target.value) }} />
              </div>
              <div style={S.col}>
                <label style={S.label}>Hours *</label>
                <input type="number" step="0.25" style={S.inp} value={hours} onChange={e=>setHours(e.target.value)} placeholder="e.g. 2.5" />
              </div>
            </div>

            {/* Calculation summary */}
            {empId && (
              <div style={{ background:'#e8eaf6', borderRadius:10, padding:'10px 16px', marginBottom:13, display:'flex', gap:16, flexWrap:'wrap' }}>
                <span style={{ fontSize:13 }}>Hourly Rate: <strong>SAR {hourlyRate.toFixed(2)}</strong></span>
                <span style={{ fontSize:13 }}>Multiplier: <strong>×{mult}</strong></span>
                <span style={{ fontSize:13 }}>Hours: <strong>{parseFloat(hours)||0}h</strong></span>
                <span style={{ fontSize:14, marginLeft:'auto', fontWeight:800, color:'#1a237e' }}>Total: SAR {totalAmt.toFixed(2)}</span>
              </div>
            )}

            <div style={{ marginBottom:16 }}><label style={S.label}>Reason / Work Done</label><textarea style={{ ...S.inp, minHeight:60, resize:'vertical' }} value={reason} onChange={e=>setReason(e.target.value)} /></div>

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={()=>{ setOpen(false); resetForm() }} style={{ background:'#f0f4f8', color:'#555', border:'none', borderRadius:9, padding:'10px 20px', cursor:'pointer', fontSize:13 }}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ background:'linear-gradient(135deg,#1a237e,#3949ab)', color:'#fff', border:'none', borderRadius:9, padding:'10px 24px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                {saving?'Submitting…':'Submit OT Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
