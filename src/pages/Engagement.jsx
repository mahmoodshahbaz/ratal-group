import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Employee Engagement — Notice Board, Announcements, Birthdays, Work Anniversaries, Quick Links

const fmt  = d => d ? new Date(d).toLocaleDateString('en-GB') : '—'
const TODAY = new Date().toISOString().slice(0,10)
const TODAY_MD = TODAY.slice(5) // MM-DD for birthday matching

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'20px 22px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:18 },
  inp:   { width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
  btn:   (c='#5A32D4') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer' }),
  label: { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4 },
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' },
  modal: { background:'#fff', borderRadius:16, padding:28, width:540, maxWidth:'96vw', maxHeight:'90vh', overflowY:'auto' },
}

const CATEGORIES = ['ANNOUNCEMENT','POLICY','REMINDER','CELEBRATION','TRAINING','GENERAL']
const CAT_COLORS  = {
  ANNOUNCEMENT:'#1565C0', POLICY:'#5A32D4', REMINDER:'#e65100',
  CELEBRATION:'#c62828', TRAINING:'#2e7d32', GENERAL:'#546e7a',
}
const PRIORITY_COLORS = { HIGH:'#c62828', MEDIUM:'#e65100', LOW:'#2e7d32' }

const EMPTY = { title:'', body:'', category:'ANNOUNCEMENT', priority:'MEDIUM', expires_at:'', pinned:false }

export default function Engagement({ entityId }) {
  const [notices, setNotices] = useState([])
  const [employees, setEmps]  = useState([])
  const [loading,  setLoading]= useState(true)
  const [showForm, setShowForm]= useState(false)
  const [editing,  setEditing] = useState(null)
  const [form,     setForm]    = useState(EMPTY)
  const [saving,   setSaving]  = useState(false)
  const [catFilter,setCat]     = useState('')

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const [{ data:n },{ data:e }] = await Promise.all([
      supabase.from('notices').select('*').eq('entity_id',entityId)
        .order('pinned',{ascending:false}).order('created_at',{ascending:false}).limit(50),
      supabase.from('employees').select('id,full_name,full_name_en,hire_date,nationality').eq('entity_id',entityId).eq('is_active',true),
    ])
    const active = (n||[]).filter(x => !x.expires_at || x.expires_at >= TODAY)
    setNotices(active); setEmps(e||[])
    setLoading(false)
  }

  function openNew()    { setEditing(null); setForm(EMPTY); setShowForm(true) }
  function openEdit(n)  { setEditing(n); setForm({ title:n.title||'', body:n.body||'', category:n.category||'ANNOUNCEMENT', priority:n.priority||'MEDIUM', expires_at:n.expires_at||'', pinned:n.pinned||false }); setShowForm(true) }

  async function save() {
    if (!form.title.trim()) { alert('Title is required'); return }
    setSaving(true)
    const payload = { ...form, entity_id:entityId, expires_at:form.expires_at||null }
    const { error } = editing
      ? await supabase.from('notices').update(payload).eq('id',editing.id)
      : await supabase.from('notices').insert(payload)
    setSaving(false)
    if (error) { alert(error.message); return }
    setShowForm(false); load()
  }

  async function deleteNotice(id) {
    if (!window.confirm('Delete this notice?')) return
    await supabase.from('notices').delete().eq('id',id)
    setNotices(p=>p.filter(n=>n.id!==id))
  }

  async function togglePin(n) {
    await supabase.from('notices').update({ pinned:!n.pinned }).eq('id',n.id)
    setNotices(p=>p.map(x=>x.id===n.id?{...x,pinned:!n.pinned}:x))
  }

  function f(k,v) { setForm(p=>({...p,[k]:v})) }

  // Celebrations
  const todayDate = new Date()
  const birthdays = employees.filter(e => {
    if (!e.hire_date) return false  // using hire_date as DOB proxy since we don't have DOB
    return false  // skip until DOB field added
  })
  const anniversaries = employees.filter(e => {
    if (!e.hire_date) return false
    const hd = new Date(e.hire_date)
    const thisYearAnn = new Date(todayDate.getFullYear(), hd.getMonth(), hd.getDate())
    const diff = Math.abs(todayDate - thisYearAnn) / 86400000
    return diff <= 7 && diff >= 0 && todayDate.getFullYear() > hd.getFullYear()
  })

  const filtered = notices.filter(n => !catFilter || n.category===catFilter)
  const pinned   = filtered.filter(n=>n.pinned)
  const normal   = filtered.filter(n=>!n.pinned)

  // Quick stats
  const announcementCount = notices.filter(n=>n.category==='ANNOUNCEMENT').length
  const policyCount       = notices.filter(n=>n.category==='POLICY').length
  const highPriority      = notices.filter(n=>n.priority==='HIGH').length

  return (
    <div>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:12, color:'#64748b' }}>Notice board · Announcements · Celebrations · Company updates</div>
        </div>
        <button style={S.btn()} onClick={openNew}>+ Post Notice</button>
      </div>

      {/* Celebrations & Anniversaries */}
      {anniversaries.length > 0 && (
        <div style={{ ...S.card, background:'linear-gradient(135deg,#e8f5e9,#f3e5f5)', marginBottom:16 }}>
          <div style={{ fontWeight:800, color:'#2e7d32', fontSize:14, marginBottom:10 }}>🎉 Work Anniversaries This Week</div>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            {anniversaries.map(e=>{
              const hd = new Date(e.hire_date)
              const yrs = todayDate.getFullYear() - hd.getFullYear()
              return (
                <div key={e.id} style={{ background:'#fff', borderRadius:10, padding:'10px 16px', display:'flex', alignItems:'center', gap:10, boxShadow:'0 1px 6px rgba(0,0,0,0.08)' }}>
                  <span style={{ fontSize:28 }}>🏅</span>
                  <div>
                    <div style={{ fontWeight:800, fontSize:13, color:'#1a2e3d' }}>{e.full_name||e.full_name_en}</div>
                    <div style={{ fontSize:11, color:'#2e7d32', fontWeight:700 }}>{yrs} Year{yrs>1?'s':''} Anniversary 🎊</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* KPI row */}
      <div style={{ display:'flex', gap:12, marginBottom:18, overflowX:'auto', flexWrap:'nowrap', paddingBottom:2 }}>
        {[
          { label:'Total Notices', value:notices.length,      color:'#5A32D4', icon:'📋' },
          { label:'Announcements', value:announcementCount,   color:'#1565C0', icon:'📢' },
          { label:'Policies',      value:policyCount,         color:'#6a1b9a', icon:'📘' },
          { label:'High Priority', value:highPriority,        color:'#c62828', icon:'🔴' },
          { label:'Pinned',        value:pinned.length,       color:'#2e7d32', icon:'📌' },
        ].map(c=>(
          <div key={c.label} style={{ ...S.card, flex:1, minWidth:120, marginBottom:0, display:'flex', alignItems:'center', gap:12, padding:'14px 16px' }}>
            <div style={{ fontSize:24 }}>{c.icon}</div>
            <div><div style={{ fontSize:18, fontWeight:800, color:c.color }}>{c.value}</div><div style={{ fontSize:11, color:'#6b7c93' }}>{c.label}</div></div>
          </div>
        ))}
      </div>

      {/* Category filter */}
      <div style={{ display:'flex', gap:8, marginBottom:16, overflowX:'auto', flexWrap:'nowrap', paddingBottom:2 }}>
        <button onClick={()=>setCat('')} style={{ ...S.btn(catFilter===''?'#5A32D4':'#f0f4f8'), color:catFilter===''?'#fff':'#6b7c93', padding:'6px 14px', fontSize:11 }}>All</button>
        {CATEGORIES.map(c=>(
          <button key={c} onClick={()=>setCat(c==='all'?'':c)} style={{ ...S.btn(catFilter===c?CAT_COLORS[c]:'#f0f4f8'), color:catFilter===c?'#fff':'#6b7c93', padding:'6px 14px', fontSize:11 }}>{c}</button>
        ))}
      </div>

      {/* Pinned notices */}
      {pinned.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:12, color:'#2e7d32', fontWeight:800, marginBottom:8 }}>📌 PINNED</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap:12 }}>
            {pinned.map(n=><NoticeCard key={n.id} notice={n} onEdit={openEdit} onDelete={deleteNotice} onPin={togglePin} />)}
          </div>
        </div>
      )}

      {/* Regular notices */}
      {loading ? <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>Loading…</div> : (
        <>
          {normal.length===0 && pinned.length===0 && (
            <div style={{ ...S.card, textAlign:'center', padding:50, color:'#aab2bd' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
              No notices posted yet. Click "Post Notice" to add the first announcement.
            </div>
          )}
          {normal.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap:12 }}>
              {normal.map(n=><NoticeCard key={n.id} notice={n} onEdit={openEdit} onDelete={deleteNotice} onPin={togglePin} />)}
            </div>
          )}
        </>
      )}

      {/* Employee count footer */}
      <div style={{ ...S.card, marginTop:20, display:'flex', gap:20, alignItems:'center', background:'#f8fafd' }}>
        <div style={{ fontSize:24 }}>👥</div>
        <div><div style={{ fontWeight:800, fontSize:16, color:'#1a2e3d' }}>{employees.length} Active Employees</div><div style={{ fontSize:12, color:'#6b7c93' }}>All entities combined in this view</div></div>
        <div style={{ marginLeft:'auto', display:'flex', gap:10 }}>
          {['SAUDI','EXPAT'].map(nat => {
            const cnt = employees.filter(e=>(e.nationality||'EXPAT').toUpperCase()===nat).length
            return cnt > 0 ? (
              <span key={nat} style={{ background:nat==='SAUDI'?'#e8f5e9':'#e3f2fd', color:nat==='SAUDI'?'#2e7d32':'#1565C0', padding:'4px 12px', borderRadius:8, fontWeight:700, fontSize:12 }}>
                {nat==='SAUDI'?'🇸🇦':'🌍'} {nat}: {cnt}
              </span>
            ) : null
          })}
        </div>
      </div>

      {/* FORM MODAL */}
      {showForm && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setShowForm(false)}>
          <div style={S.modal}>
            <div style={{ fontWeight:800, fontSize:16, color:'#1a2e3d', marginBottom:18 }}>{editing?'Edit':'Post'} Notice</div>
            <div style={{ marginBottom:14 }}><label style={S.label}>Title *</label>
              <input style={S.inp} value={form.title} onChange={e=>f('title',e.target.value)} placeholder="Notice title" /></div>
            <div style={{ display:'flex', gap:10, marginBottom:14 }}>
              <div style={{ flex:1 }}><label style={S.label}>Category</label>
                <select style={S.inp} value={form.category} onChange={e=>f('category',e.target.value)}>
                  {CATEGORIES.map(c=><option key={c}>{c}</option>)}
                </select></div>
              <div style={{ flex:1 }}><label style={S.label}>Priority</label>
                <select style={S.inp} value={form.priority} onChange={e=>f('priority',e.target.value)}>
                  <option value="HIGH">🔴 HIGH</option>
                  <option value="MEDIUM">🟡 MEDIUM</option>
                  <option value="LOW">🟢 LOW</option>
                </select></div>
            </div>
            <div style={{ marginBottom:14 }}><label style={S.label}>Body / Details</label>
              <textarea style={{ ...S.inp, height:120, resize:'vertical' }} value={form.body} onChange={e=>f('body',e.target.value)} placeholder="Write the full notice here…" /></div>
            <div style={{ display:'flex', gap:10, marginBottom:18, alignItems:'flex-end' }}>
              <div style={{ flex:1 }}><label style={S.label}>Expires On (optional)</label>
                <input type="date" style={S.inp} value={form.expires_at} onChange={e=>f('expires_at',e.target.value)} /></div>
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, fontWeight:600, paddingBottom:10 }}>
                <input type="checkbox" checked={form.pinned} onChange={e=>f('pinned',e.target.checked)} />
                📌 Pin to top
              </label>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button style={S.btn('#aab2bd')} onClick={()=>setShowForm(false)}>Cancel</button>
              <button style={S.btn()} onClick={save} disabled={saving}>{saving?'Saving…':'Post Notice'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NoticeCard({ notice:n, onEdit, onDelete, onPin }) {
  const catColor = CAT_COLORS[n.category]||'#546e7a'
  const priColor = PRIORITY_COLORS[n.priority]||'#546e7a'
  const isExpired = n.expires_at && n.expires_at < new Date().toISOString().slice(0,10)
  return (
    <div style={{ background:'#fff', borderRadius:12, padding:'16px 18px', boxShadow:'0 2px 8px rgba(0,0,0,0.07)', borderLeft:`4px solid ${catColor}`, opacity:isExpired?0.6:1, position:'relative' }}>
      {n.pinned && <div style={{ position:'absolute', top:10, right:12, fontSize:14 }}>📌</div>}
      <div style={{ display:'flex', gap:6, marginBottom:8, overflowX:'auto', flexWrap:'nowrap', paddingBottom:2 }}>
        <span style={{ background:catColor+'22', color:catColor, padding:'2px 10px', borderRadius:20, fontSize:10, fontWeight:800 }}>{n.category}</span>
        <span style={{ background:priColor+'22', color:priColor, padding:'2px 10px', borderRadius:20, fontSize:10, fontWeight:800 }}>{n.priority}</span>
        {isExpired && <span style={{ background:'#ffebee', color:'#c62828', padding:'2px 10px', borderRadius:20, fontSize:10, fontWeight:800 }}>EXPIRED</span>}
      </div>
      <div style={{ fontWeight:800, fontSize:14, color:'#1a2e3d', marginBottom:6 }}>{n.title}</div>
      {n.body && <div style={{ fontSize:12, color:'#546e7a', lineHeight:1.6, marginBottom:10, whiteSpace:'pre-wrap' }}>{n.body}</div>}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:10, color:'#aab2bd' }}>
          {n.created_at ? new Date(n.created_at).toLocaleDateString('en-GB') : ''}
          {n.expires_at ? ` · Expires: ${new Date(n.expires_at).toLocaleDateString('en-GB')}` : ''}
        </div>
        <div style={{ display:'flex', gap:5 }}>
          <button onClick={()=>onPin(n)} style={{ background:'transparent', border:'1px solid #dde3ec', borderRadius:6, padding:'3px 8px', cursor:'pointer', fontSize:11, color:'#6b7c93' }}>{n.pinned?'Unpin':'Pin'}</button>
          <button onClick={()=>onEdit(n)} style={{ background:'#e3f2fd', border:'none', borderRadius:6, padding:'3px 8px', cursor:'pointer', fontSize:11, color:'#1565C0', fontWeight:700 }}>Edit</button>
          <button onClick={()=>onDelete(n.id)} style={{ background:'#ffebee', border:'none', borderRadius:6, padding:'3px 8px', cursor:'pointer', fontSize:11, color:'#c62828', fontWeight:700 }}>Del</button>
        </div>
      </div>
    </div>
  )
}
