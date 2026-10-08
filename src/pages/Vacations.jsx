import { GROUP_COLORS } from '../styles/appStyles'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const fmt   = d => d ? new Date(d).toLocaleDateString('en-GB') : '—'
const TODAY = new Date().toISOString().slice(0,10)

const LEAVE_TYPES = ['ANNUAL','EMERGENCY','SICK','SICK_MAJOR','UNPAID','HAJJ','MATERNITY']
const STATUSES    = ['PENDING','APPROVED','REJECTED','CANCELLED']

const LEAVE_COLORS = {
  ANNUAL:'#1565C0', EMERGENCY:'#e65100', SICK:'#6a1b9a',
  SICK_MAJOR:'#c62828', UNPAID:'#546e7a', HAJJ:'#2e7d32', MATERNITY:'#ad1457',
}
const STATUS_COLORS = {
  PENDING:'#f57f17', APPROVED:'#2e7d32', REJECTED:'#c62828', CANCELLED:'#aab2bd',
}

const MC = GROUP_COLORS.HR

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'20px 22px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:18 },
  inp:   { width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
  btn:   (c='#1565C0') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer' }),
  label: { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4 },
  row:   { display:'flex', gap:12, marginBottom:14 },
  col:   { flex:1 },
  tbl:   { width:'100%', borderCollapse:'collapse', fontSize:12 },
  th:    { background:MC, color:'#fff', padding:'9px 10px', fontWeight:700, textAlign:'left', fontSize:11 },
  td:    { padding:'8px 10px', borderBottom:'1px solid #f0f4f8', color:'#1a2e3d', verticalAlign:'middle' },
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' },
  modal: { background:'#fff', borderRadius:16, padding:28, width:560, maxWidth:'96vw', maxHeight:'90vh', overflowY:'auto' },
  chip:  (c='#546e7a') => ({ display:'inline-block', padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700, background:c+'22', color:c }),
}

const EMPTY = { employee_id:'', leave_type:'ANNUAL', start_date:TODAY, end_date:TODAY, notes:'' }

export default function Vacations({ entityId }) {
  const [leaves,   setLeaves]   = useState([])
  const [employees,setEmps]     = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState(EMPTY)
  const [saving,   setSaving]   = useState(false)
  const [filter,   setFilter]   = useState({ type:'', status:'' })
  const [search,   setSearch]   = useState('')

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const [{ data:l },{ data:e }] = await Promise.all([
      supabase.from('vacations').select('*').eq('entity_id',entityId).order('start_date',{ascending:false}).limit(300),
      supabase.from('employees').select('id,full_name,department,annual_leave_bal,emergency_leave_bal').eq('entity_id',entityId).eq('is_active',true).order('full_name').limit(500),
    ])
    setLeaves(l||[]); setEmps(e||[])
    setLoading(false)
  }

  function days() {
    if (!form.start_date || !form.end_date) return 0
    const diff = (new Date(form.end_date) - new Date(form.start_date)) / 86400000
    return Math.max(0, Math.round(diff) + 1)
  }

  async function save() {
    if (!form.employee_id) { alert('Select employee'); return }
    if (form.end_date < form.start_date) { alert('End date must be after start date'); return }
    const emp = employees.find(e=>e.id===form.employee_id)
    setSaving(true)
    const { error } = await supabase.from('vacations').insert({
      ...form,
      entity_id: entityId,
      employee_name: emp?.full_name||'',
      status: 'PENDING',
    })
    setSaving(false)
    if (error) { alert(error.message); return }
    setShowForm(false); setForm(EMPTY); load()
  }

  async function updateStatus(id, status) {
    await supabase.from('vacations').update({ status, approved_at: status==='APPROVED'?new Date().toISOString():null }).eq('id',id)
    setLeaves(p => p.map(l => l.id===id ? {...l,status} : l))
  }

  async function setOverstay(id, overstay_days) {
    const levy = Math.ceil(overstay_days/30) * 800
    await supabase.from('vacations').update({ overstay_days, levy_amount: levy }).eq('id',id)
    setLeaves(p => p.map(l => l.id===id ? {...l,overstay_days,levy_amount:levy} : l))
  }

  function f(k,v) { setForm(p=>({...p,[k]:v})) }

  const filtered = leaves
    .filter(l => !filter.type || l.leave_type===filter.type)
    .filter(l => !filter.status || l.status===filter.status)
    .filter(l => !search || (l.employee_name||'').toLowerCase().includes(search.toLowerCase()))

  const pending  = leaves.filter(l=>l.status==='PENDING').length
  const approved = leaves.filter(l=>l.status==='APPROVED').length
  const totalDays = leaves.filter(l=>l.status==='APPROVED').reduce((s,l)=>s+(+l.days||0),0)

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:12, color:'#6b7c93', marginTop:2 }}>Annual, Emergency, Sick, Hajj, Maternity leave management</div>
        </div>
        <button style={S.btn()} onClick={()=>setShowForm(true)}>+ New Leave Request</button>
      </div>

      {/* KPIs */}
      <div style={{ display:'flex', gap:14, marginBottom:18, overflowX:'auto', flexWrap:'nowrap', paddingBottom:2 }}>
        {[
          { label:'Pending Approval', value:pending,  color:'#f57f17', icon:'⏳' },
          { label:'Approved',         value:approved, color:'#2e7d32', icon:'✅' },
          { label:'Total Days Off',   value:`${totalDays} days`, color:'#1565C0', icon:'📅' },
        ].map(c=>(
          <div key={c.label} style={{ ...S.card, flex:1, marginBottom:0, display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ fontSize:28 }}>{c.icon}</div>
            <div><div style={{ fontSize:20, fontWeight:800, color:c.color }}>{c.value}</div><div style={{ fontSize:12, color:'#6b7c93' }}>{c.label}</div></div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ ...S.card, padding:'12px 16px', display:'flex', gap:12, flexWrap:'wrap', marginBottom:14 }}>
        <input style={{ ...S.inp, maxWidth:220 }} placeholder="Search employee…" value={search} onChange={e=>setSearch(e.target.value)} />
        <select style={{ ...S.inp, maxWidth:160 }} value={filter.type} onChange={e=>setFilter(f=>({...f,type:e.target.value}))}>
          <option value="">All Types</option>
          {LEAVE_TYPES.map(t=><option key={t}>{t}</option>)}
        </select>
        <select style={{ ...S.inp, maxWidth:150 }} value={filter.status} onChange={e=>setFilter(f=>({...f,status:e.target.value}))}>
          <option value="">All Statuses</option>
          {STATUSES.map(s=><option key={s}>{s}</option>)}
        </select>
        <div style={{ fontSize:12, color:'#6b7c93', alignSelf:'center' }}>{filtered.length} records</div>
      </div>

      {/* Table */}
      <div style={S.card}>
        {loading ? <div style={{ textAlign:'center', padding:40, color:'#6b7c93' }}>Loading…</div> : (
          <table style={S.tbl}>
            <thead><tr>
              <th style={S.th}>Employee</th>
              <th style={S.th}>Leave Type</th>
              <th style={S.th}>Start</th>
              <th style={S.th}>End</th>
              <th style={S.th}>Days</th>
              <th style={S.th}>Status</th>
              <th style={S.th}>Overstay</th>
              <th style={S.th}>Levy</th>
              <th style={S.th}>Actions</th>
            </tr></thead>
            <tbody>
              {filtered.length===0 && <tr><td colSpan={9} style={{ ...S.td, textAlign:'center', color:'#aab2bd', padding:30 }}>No leave records</td></tr>}
              {filtered.map((l,i)=>(
                <tr key={l.id} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
                  <td style={{ ...S.td, fontWeight:600 }}>{l.employee_name}</td>
                  <td style={S.td}><span style={S.chip(LEAVE_COLORS[l.leave_type]||'#546e7a')}>{l.leave_type}</span></td>
                  <td style={S.td}>{fmt(l.start_date)}</td>
                  <td style={S.td}>{fmt(l.end_date)}</td>
                  <td style={{ ...S.td, fontWeight:700, textAlign:'center' }}>{l.days}</td>
                  <td style={S.td}>
                    <span style={{ ...S.chip(STATUS_COLORS[l.status]||'#546e7a'), cursor:'default' }}>{l.status}</span>
                  </td>
                  <td style={S.td}>
                    {l.status==='APPROVED' ? (
                      <input type="number" min={0} max={365}
                        defaultValue={l.overstay_days||0}
                        style={{ width:60, padding:'3px 6px', borderRadius:5, border:'1px solid #dde3ec', fontSize:11 }}
                        onBlur={e=>setOverstay(l.id,+e.target.value)} />
                    ) : '—'}
                  </td>
                  <td style={{ ...S.td, fontWeight:700, color: +l.levy_amount>0?'#c62828':'#aab2bd' }}>
                    {+l.levy_amount>0 ? `SAR ${(+l.levy_amount).toLocaleString()}` : '—'}
                  </td>
                  <td style={S.td}>
                    {l.status==='PENDING' && (
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={()=>updateStatus(l.id,'APPROVED')} style={{ ...S.btn('#2e7d32'), padding:'4px 10px', fontSize:10 }}>✓ Approve</button>
                        <button onClick={()=>updateStatus(l.id,'REJECTED')} style={{ ...S.btn('#c62828'), padding:'4px 10px', fontSize:10 }}>✗ Reject</button>
                      </div>
                    )}
                    {l.status==='APPROVED' && <button onClick={()=>updateStatus(l.id,'CANCELLED')} style={{ ...S.btn('#546e7a'), padding:'4px 10px', fontSize:10 }}>Cancel</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Leave Balance Cards */}
      {employees.length > 0 && (
        <div style={S.card}>
          <div style={{ fontWeight:800, fontSize:14, color:'#1a2e3d', marginBottom:14 }}>Leave Balances</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:10 }}>
            {employees.slice(0,20).map(e=>(
              <div key={e.id} style={{ background:'#f5f7fa', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontWeight:700, fontSize:12, color:'#1a2e3d', marginBottom:6 }}>{e.full_name}</div>
                <div style={{ display:'flex', gap:10 }}>
                  <div><span style={{ fontSize:10, color:'#6b7c93' }}>Annual</span><div style={{ fontWeight:800, color:'#1565C0', fontSize:14 }}>{e.annual_leave_bal||30}</div></div>
                  <div><span style={{ fontSize:10, color:'#6b7c93' }}>Emergency</span><div style={{ fontWeight:800, color:'#e65100', fontSize:14 }}>{e.emergency_leave_bal||15}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FORM MODAL */}
      {showForm && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setShowForm(false)}>
          <div style={S.modal}>
            <div style={{ fontWeight:800, fontSize:16, color:'#1a2e3d', marginBottom:18 }}>New Leave Request</div>
            <div style={{ marginBottom:14 }}><label style={S.label}>Employee *</label>
              <select style={S.inp} value={form.employee_id} onChange={e=>f('employee_id',e.target.value)}>
                <option value="">— Select Employee —</option>
                {employees.map(e=><option key={e.id} value={e.id}>{e.full_name} ({e.department||'—'})</option>)}
              </select></div>
            <div style={{ marginBottom:14 }}><label style={S.label}>Leave Type *</label>
              <select style={S.inp} value={form.leave_type} onChange={e=>f('leave_type',e.target.value)}>
                {LEAVE_TYPES.map(t=><option key={t}>{t}</option>)}
              </select></div>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Start Date *</label>
                <input type="date" style={S.inp} value={form.start_date} onChange={e=>f('start_date',e.target.value)} /></div>
              <div style={S.col}><label style={S.label}>End Date *</label>
                <input type="date" style={S.inp} value={form.end_date} onChange={e=>f('end_date',e.target.value)} /></div>
            </div>
            <div style={{ background:'#e3f2fd', borderRadius:8, padding:'10px 14px', marginBottom:14, fontWeight:700, color:'#1565C0' }}>
              Duration: {days()} days
            </div>
            <div style={{ marginBottom:18 }}><label style={S.label}>Notes / Reason</label>
              <textarea style={{ ...S.inp, height:70, resize:'vertical' }} value={form.notes} onChange={e=>f('notes',e.target.value)} /></div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button style={S.btn('#aab2bd')} onClick={()=>setShowForm(false)}>Cancel</button>
              <button style={S.btn()} onClick={save} disabled={saving}>{saving?'Saving…':'Submit Request'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
