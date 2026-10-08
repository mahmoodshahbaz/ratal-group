import { GROUP_COLORS } from '../styles/appStyles'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const fmt  = d => d ? new Date(d).toLocaleDateString('en-GB') : '—'
const TODAY = new Date().toISOString().slice(0,10)
const DAY_MS = 86400000

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.round((new Date(dateStr) - new Date(TODAY)) / DAY_MS)
}

const CATEGORIES = ['EMPLOYEE','VEHICLE','COMPANY']
const DOC_TYPES = {
  EMPLOYEE: ['IQAMA','PASSPORT','HEALTH_INS','QIWA','SCE','WORK_PERMIT','DRIVING_LICENSE'],
  VEHICLE:  ['INSURANCE','MVPI','REGISTRATION','SAHER'],
  COMPANY:  ['CR','GOSI','VAT','MUNICIPALITY','CITC','SAMA','CHAMBER','MOL'],
}

function alertLevel(days, alertDays=30) {
  if (days === null) return { color:'#aab2bd', bg:'#f5f7fa', label:'NO DATE' }
  if (days < 0)     return { color:'#fff',     bg:'#b71c1c', label:`EXPIRED ${Math.abs(days)}d ago` }
  if (days <= 7)    return { color:'#fff',     bg:'#c62828', label:`${days}d LEFT` }
  if (days <= 30)   return { color:'#fff',     bg:'#e65100', label:`${days}d LEFT` }
  if (days <= alertDays) return { color:'#1a2e3d', bg:'#fff3e0', label:`${days}d LEFT` }
  return { color:'#2e7d32', bg:'#e8f5e9', label:`${days}d` }
}

const MC = GROUP_COLORS.HR

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'20px 22px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:18 },
  inp:   { width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
  btn:   (c='#c62828') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer' }),
  label: { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4 },
  row:   { display:'flex', gap:12, marginBottom:14 },
  col:   { flex:1 },
  tbl:   { width:'100%', borderCollapse:'collapse', fontSize:12 },
  th:    { background:MC, color:'#fff', padding:'9px 10px', fontWeight:700, textAlign:'left', fontSize:11 },
  td:    { padding:'8px 10px', borderBottom:'1px solid #f0f4f8', color:'#1a2e3d', verticalAlign:'middle' },
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' },
  modal: { background:'#fff', borderRadius:16, padding:28, width:520, maxWidth:'96vw', maxHeight:'90vh', overflowY:'auto' },
}

const EMPTY = { category:'EMPLOYEE', ref_id:'', ref_name:'', doc_type:'IQAMA', expiry_date:'', alert_days:'30', doc_number:'', notes:'' }

export default function Compliance({ entityId }) {
  const [docs,      setDocs]     = useState([])
  const [employees, setEmps]     = useState([])
  const [loading,   setLoading]  = useState(true)
  const [showForm,  setShowForm] = useState(false)
  const [form,      setForm]     = useState(EMPTY)
  const [saving,    setSaving]   = useState(false)
  const [catFilter, setCatFilter]= useState('')
  const [urgency,   setUrgency]  = useState('') // 'expired','critical','warning','ok'
  const [search,    setSearch]   = useState('')

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const [{ data:d },{ data:e }] = await Promise.all([
      supabase.from('compliance_docs').select('*').eq('entity_id',entityId).eq('is_active',true).order('expiry_date').limit(500),
      supabase.from('employees').select('id,full_name').eq('entity_id',entityId).eq('is_active',true).order('full_name').limit(500),
    ])
    setDocs(d||[]); setEmps(e||[])
    setLoading(false)
  }

  async function save() {
    if (!form.expiry_date) { alert('Expiry date required'); return }
    setSaving(true)
    const { error } = await supabase.from('compliance_docs').insert({
      ...form,
      entity_id: entityId,
      alert_days: +form.alert_days||30,
      ref_id: form.ref_id || null,
    })
    setSaving(false)
    if (error) { alert(error.message); return }
    setShowForm(false); setForm(EMPTY); load()
  }

  async function deactivate(id) {
    await supabase.from('compliance_docs').update({ is_active:false }).eq('id',id)
    setDocs(p=>p.filter(d=>d.id!==id))
  }

  function f(k,v) { setForm(p=>({...p,[k]:v})) }

  const filtered = docs
    .filter(d => !catFilter || d.category===catFilter)
    .filter(d => !search || (d.ref_name||'').toLowerCase().includes(search.toLowerCase()) || (d.doc_type||'').toLowerCase().includes(search.toLowerCase()) || (d.doc_number||'').toLowerCase().includes(search.toLowerCase()))
    .filter(d => {
      if (!urgency) return true
      const days = daysUntil(d.expiry_date)
      if (urgency==='expired')  return days !== null && days < 0
      if (urgency==='critical') return days !== null && days >= 0 && days <= 7
      if (urgency==='warning')  return days !== null && days > 7 && days <= 30
      if (urgency==='ok')       return days !== null && days > 30
      return true
    })
    .sort((a,b) => {
      const da = daysUntil(a.expiry_date), db = daysUntil(b.expiry_date)
      if (da===null) return 1; if (db===null) return -1
      return da - db
    })

  const expired  = docs.filter(d=>{ const x=daysUntil(d.expiry_date); return x!==null&&x<0 }).length
  const critical = docs.filter(d=>{ const x=daysUntil(d.expiry_date); return x!==null&&x>=0&&x<=7 }).length
  const warning  = docs.filter(d=>{ const x=daysUntil(d.expiry_date); return x!==null&&x>7&&x<=30 }).length

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:12, color:'#64748b' }}>Document expiry tracking — Employees, Vehicles, Company</div>
        </div>
        <button style={S.btn()} onClick={()=>setShowForm(true)}>+ Add Document</button>
      </div>

      {/* Alert Banners */}
      {expired > 0 && (
        <div style={{ background:'#b71c1c', color:'#fff', borderRadius:10, padding:'12px 18px', marginBottom:12, fontWeight:700, display:'flex', alignItems:'center', gap:12 }}>
          🚨 {expired} document{expired>1?'s':''} EXPIRED — immediate action required!
          <button onClick={()=>setUrgency('expired')} style={{ marginLeft:'auto', background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', padding:'4px 12px', borderRadius:6, cursor:'pointer', fontWeight:700 }}>View</button>
        </div>
      )}
      {critical > 0 && (
        <div style={{ background:'#c62828', color:'#fff', borderRadius:10, padding:'12px 18px', marginBottom:12, fontWeight:700, display:'flex', alignItems:'center', gap:12 }}>
          🔴 {critical} document{critical>1?'s':''} expiring within 7 days
          <button onClick={()=>setUrgency('critical')} style={{ marginLeft:'auto', background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', padding:'4px 12px', borderRadius:6, cursor:'pointer', fontWeight:700 }}>View</button>
        </div>
      )}
      {warning > 0 && (
        <div style={{ background:'#e65100', color:'#fff', borderRadius:10, padding:'12px 18px', marginBottom:12, fontWeight:700, display:'flex', alignItems:'center', gap:12 }}>
          🟠 {warning} document{warning>1?'s':''} expiring within 30 days
          <button onClick={()=>setUrgency('warning')} style={{ marginLeft:'auto', background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', padding:'4px 12px', borderRadius:6, cursor:'pointer', fontWeight:700 }}>View</button>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display:'flex', gap:14, marginBottom:18, overflowX:'auto', flexWrap:'nowrap', paddingBottom:2 }}>
        {[
          { label:'Total Docs', value:docs.length, color:'#1565C0', icon:'📄', filter:'' },
          { label:'Expired',    value:expired,     color:'#b71c1c', icon:'🚨', filter:'expired' },
          { label:'Critical (≤7d)', value:critical, color:'#c62828', icon:'🔴', filter:'critical' },
          { label:'Warning (≤30d)', value:warning,  color:'#e65100', icon:'🟠', filter:'warning' },
          { label:'OK',         value:docs.length-expired-critical-warning, color:'#2e7d32', icon:'✅', filter:'ok' },
        ].map(c=>(
          <div key={c.label} onClick={()=>setUrgency(urgency===c.filter?'':c.filter)}
            style={{ ...S.card, flex:1, minWidth:120, marginBottom:0, display:'flex', alignItems:'center', gap:12, cursor:'pointer', border:`2px solid ${urgency===c.filter?c.color:'transparent'}` }}>
            <div style={{ fontSize:22 }}>{c.icon}</div>
            <div><div style={{ fontSize:18, fontWeight:800, color:c.color }}>{c.value}</div><div style={{ fontSize:11, color:'#6b7c93' }}>{c.label}</div></div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ ...S.card, padding:'12px 16px', display:'flex', gap:12, flexWrap:'wrap', marginBottom:14 }}>
        <input style={{ ...S.inp, maxWidth:240 }} placeholder="Search name, doc type, number…" value={search} onChange={e=>setSearch(e.target.value)} />
        <select style={{ ...S.inp, maxWidth:160 }} value={catFilter} onChange={e=>setCatFilter(e.target.value)}>
          <option value="">All Categories</option>
          {CATEGORIES.map(c=><option key={c}>{c}</option>)}
        </select>
        {urgency && <button onClick={()=>setUrgency('')} style={{ ...S.btn('#aab2bd'), padding:'7px 14px', fontSize:11 }}>✕ Clear Filter</button>}
        <div style={{ fontSize:12, color:'#6b7c93', alignSelf:'center' }}>{filtered.length} records</div>
      </div>

      {/* Table */}
      <div style={S.card}>
        {loading ? <div style={{ textAlign:'center', padding:40, color:'#6b7c93' }}>Loading…</div> : (
          <table style={S.tbl}>
            <thead><tr>
              <th style={S.th}>Category</th>
              <th style={S.th}>Name / Entity</th>
              <th style={S.th}>Document Type</th>
              <th style={S.th}>Doc Number</th>
              <th style={S.th}>Expiry Date</th>
              <th style={S.th}>Days Left</th>
              <th style={S.th}>Action</th>
            </tr></thead>
            <tbody>
              {filtered.length===0 && <tr><td colSpan={7} style={{ ...S.td, textAlign:'center', color:'#aab2bd', padding:30 }}>No compliance documents tracked</td></tr>}
              {filtered.map((d,i)=>{
                const days = daysUntil(d.expiry_date)
                const al   = alertLevel(days, d.alert_days)
                return (
                  <tr key={d.id} style={{ background:i%2===0?'#fff':'#fafbfc' }}>
                    <td style={S.td}><span style={{ padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:700, background: d.category==='EMPLOYEE'?'#e3f2fd':d.category==='VEHICLE'?'#e8f5e9':'#ede7f6', color: d.category==='EMPLOYEE'?'#1565C0':d.category==='VEHICLE'?'#2e7d32':'#5A32D4' }}>{d.category}</span></td>
                    <td style={{ ...S.td, fontWeight:600 }}>{d.ref_name||'(Company)'}</td>
                    <td style={{ ...S.td, fontFamily:'monospace', fontWeight:700 }}>{d.doc_type}</td>
                    <td style={{ ...S.td, fontSize:11, color:'#6b7c93' }}>{d.doc_number||'—'}</td>
                    <td style={{ ...S.td, fontWeight:700 }}>{fmt(d.expiry_date)}</td>
                    <td style={S.td}>
                      <span style={{ display:'inline-block', padding:'3px 12px', borderRadius:20, fontSize:11, fontWeight:800, background:al.bg, color:al.color }}>
                        {al.label}
                      </span>
                    </td>
                    <td style={S.td}>
                      <button onClick={()=>deactivate(d.id)} style={{ ...S.btn('#aab2bd'), padding:'4px 10px', fontSize:10 }}>Archive</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ADD FORM */}
      {showForm && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setShowForm(false)}>
          <div style={S.modal}>
            <div style={{ fontWeight:800, fontSize:16, color:'#1a2e3d', marginBottom:18 }}>Track New Document</div>
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Category *</label>
                <select style={S.inp} value={form.category} onChange={e=>{ f('category',e.target.value); f('doc_type',DOC_TYPES[e.target.value]?.[0]||'') }}>
                  {CATEGORIES.map(c=><option key={c}>{c}</option>)}
                </select></div>
              <div style={S.col}><label style={S.label}>Document Type *</label>
                <select style={S.inp} value={form.doc_type} onChange={e=>f('doc_type',e.target.value)}>
                  {(DOC_TYPES[form.category]||[]).map(t=><option key={t}>{t}</option>)}
                </select></div>
            </div>
            {form.category === 'EMPLOYEE' && (
              <div style={{ marginBottom:14 }}><label style={S.label}>Employee</label>
                <select style={S.inp} value={form.ref_id} onChange={e=>{
                  const emp=employees.find(x=>x.id===e.target.value)
                  f('ref_id',e.target.value); f('ref_name',emp?.full_name||'')
                }}>
                  <option value="">— Select Employee —</option>
                  {employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}
                </select></div>
            )}
            {form.category !== 'EMPLOYEE' && (
              <div style={{ marginBottom:14 }}><label style={S.label}>{form.category==='VEHICLE'?'Vehicle Plate / Description':'Company / Reference'}</label>
                <input style={S.inp} value={form.ref_name} onChange={e=>f('ref_name',e.target.value)} placeholder={form.category==='VEHICLE'?'e.g. ABC-1234':'e.g. Ratal Group CR'} /></div>
            )}
            <div style={S.row}>
              <div style={S.col}><label style={S.label}>Expiry Date *</label>
                <input type="date" style={S.inp} value={form.expiry_date} onChange={e=>f('expiry_date',e.target.value)} /></div>
              <div style={S.col}><label style={S.label}>Alert (days before)</label>
                <select style={S.inp} value={form.alert_days} onChange={e=>f('alert_days',e.target.value)}>
                  {[7,14,30,45,60,90].map(d=><option key={d} value={d}>{d} days</option>)}
                </select></div>
            </div>
            <div style={{ marginBottom:14 }}><label style={S.label}>Document Number</label>
              <input style={S.inp} value={form.doc_number} onChange={e=>f('doc_number',e.target.value)} placeholder="e.g. Iqama number, CR number…" /></div>
            <div style={{ marginBottom:18 }}><label style={S.label}>Notes</label>
              <input style={S.inp} value={form.notes} onChange={e=>f('notes',e.target.value)} /></div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button style={S.btn('#aab2bd')} onClick={()=>setShowForm(false)}>Cancel</button>
              <button style={S.btn()} onClick={save} disabled={saving}>{saving?'Saving…':'Save Document'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
