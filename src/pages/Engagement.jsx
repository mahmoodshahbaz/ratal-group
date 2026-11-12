import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import FormShell from '../components/FormShell'
import PageBanner from '../components/PageBanner'
import { kpiCardGradient } from '../styles/appStyles'

const L1 = '#BCA99A'
const L2 = '#F7F2ED'
const L3 = '#795338'

// Employee Engagement — Notice Board, Announcements, Birthdays, Work Anniversaries, Quick Links

const fmt  = d => d ? new Date(d).toLocaleDateString('en-GB') : '—'
const TODAY = new Date().toISOString().slice(0,10)
const TODAY_MD = TODAY.slice(5) // MM-DD for birthday matching

const S = {
  card:  { background:'#fff', borderRadius:4, padding:'20px 22px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:18 },
  inp:   { width:'100%', padding:'8px 10px', borderRadius:4, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'Poppins, sans-serif' },
  btn:   (c=L3) => ({ background:c, color:'#fff', border:'none', borderRadius:4, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Poppins, sans-serif' }),
  label: { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4, fontFamily:'Poppins, sans-serif' },
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
  const [showBanner,setShowBanner] = useState(false)
  const [wizardStep,setWizardStep] = useState(1)

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

  function openNew()    { setEditing(null); setForm(EMPTY); setShowBanner(true) }
  function openEdit(n)  { setEditing(n); setForm({ title:n.title||'', body:n.body||'', category:n.category||'ANNOUNCEMENT', priority:n.priority||'MEDIUM', expires_at:n.expires_at||'', pinned:n.pinned||false }); setWizardStep(1); setShowForm(true) }

  async function save() {
    if (!form.title.trim()) { alert('Title is required'); return }
    setSaving(true)
    const payload = { ...form, entity_id:entityId, expires_at:form.expires_at||null }
    const { error } = editing
      ? await supabase.from('notices').update(payload).eq('id',editing.id)
      : await supabase.from('notices').insert(payload)
    setSaving(false)
    if (error) { alert(error.message); return }
    setShowForm(false); setShowBanner(false); setWizardStep(1); load()
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
    <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden', background:L2, fontFamily:'Poppins,sans-serif' }}>

      {/* ══ UPPER ZONE ══ */}
      <div style={{ flexShrink:0, background:L2, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', zIndex:10 }}>

        {/* L1 Heading Bar */}
        <div style={{ background:L2, padding:'6px 28px 0' }}>
          <div style={{ background:L1, padding:'8px 16px', borderRadius:'6px 6px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#fff', fontFamily:'Poppins,sans-serif' }}>Notice Board</div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.8)', fontFamily:'Poppins,sans-serif' }}>Announcements · Celebrations · Company updates</div>
            </div>
            <button style={{ background:L3, color:'#fff', border:'none', borderRadius:7, padding:'7px 16px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Poppins,sans-serif' }} onClick={openNew}>+ Post Notice</button>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display:'flex', gap:8, padding:'10px 28px 12px', flexWrap:'wrap', background:L2 }}>
          {[
            { label:'Total Notices', value:notices.length },
            { label:'Announcements', value:announcementCount },
            { label:'Policies',      value:policyCount },
            { label:'High Priority', value:highPriority },
            { label:'Pinned',        value:pinned.length },
          ].map((c,i)=>{
            const cardStyle = kpiCardGradient(i, L1, L2, L3)
            return (
              <div key={c.label} style={{ ...cardStyle, width:160, height:62, borderRadius:10, padding:'0 14px', flexShrink:0, boxShadow:'0 2px 8px rgba(0,0,0,0.10)', display:'flex', flexDirection:'column', justifyContent:'center', boxSizing:'border-box' }}>
                <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, opacity:0.75, marginBottom:2, fontFamily:'Poppins,sans-serif' }}>{c.label}</div>
                <div style={{ fontSize:18, fontWeight:800, lineHeight:1.1, fontFamily:'Poppins,sans-serif' }}>{c.value}</div>
              </div>
            )
          })}
        </div>

        {/* Category filter tabs */}
        <div style={{ padding:'0 28px', borderBottom:'2px solid #e8edf2', display:'flex', gap:0, overflowX:'auto' }}>
          {['', ...CATEGORIES].map(c=>{
            const active = catFilter === c
            const label  = c === '' ? 'All' : c
            return (
              <button key={label} onClick={()=>setCat(c)}
                style={{ background:'transparent', border:'none', borderBottom: active ? `2px solid ${L3}` : '2px solid transparent',
                  color: active ? L3 : '#6b7c93', fontWeight: active ? 700 : 500, fontSize:11,
                  padding:'8px 14px', cursor:'pointer', fontFamily:'Poppins,sans-serif', whiteSpace:'nowrap', marginBottom:-2 }}>
                {label}
              </button>
            )
          })}
        </div>

      </div>{/* end upper zone */}

      {/* ══ SCROLL ZONE ══ */}
      <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:'0 28px 22px' }}>

        {/* Anniversaries */}
        {anniversaries.length > 0 && (
          <div style={{ background:'linear-gradient(135deg,#e8f5e9,#f3e5f5)', borderRadius:10, padding:'14px 18px', marginTop:16, marginBottom:16, boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
            <div style={{ fontWeight:800, color:'#2e7d32', fontSize:13, marginBottom:10 }}>🎉 Work Anniversaries This Week</div>
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

        {/* Pinned notices */}
        {pinned.length > 0 && (
          <div style={{ marginTop:16, marginBottom:16 }}>
            <div style={{ fontSize:11, color:'#2e7d32', fontWeight:800, marginBottom:8 }}>📌 PINNED</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap:12 }}>
              {pinned.map(n=><NoticeCard key={n.id} notice={n} onEdit={openEdit} onDelete={deleteNotice} onPin={togglePin} />)}
            </div>
          </div>
        )}

        {/* Regular notices */}
        {loading ? <div style={{ textAlign:'center', padding:40, color:'#aab2bd', fontFamily:'Poppins,sans-serif' }}>Loading…</div> : (
          <>
            {normal.length===0 && pinned.length===0 && (
              <div style={{ background:'#fff', borderRadius:10, padding:50, textAlign:'center', color:'#aab2bd', marginTop:16, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', fontFamily:'Poppins,sans-serif' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
                No notices posted yet. Click "Post Notice" to add the first announcement.
              </div>
            )}
            {normal.length > 0 && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap:12, marginTop:pinned.length>0?0:16 }}>
                {normal.map(n=><NoticeCard key={n.id} notice={n} onEdit={openEdit} onDelete={deleteNotice} onPin={togglePin} />)}
              </div>
            )}
          </>
        )}

        {/* Employee count footer */}
        <div style={{ background:'#fff', borderRadius:10, padding:'16px 18px', marginTop:20, display:'flex', gap:20, alignItems:'center', boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
          <div style={{ fontSize:24 }}>👥</div>
          <div>
            <div style={{ fontWeight:800, fontSize:15, color:'#1a2e3d', fontFamily:'Poppins,sans-serif' }}>{employees.length} Active Employees</div>
            <div style={{ fontSize:11, color:'#6b7c93', fontFamily:'Poppins,sans-serif' }}>All entities combined in this view</div>
          </div>
          <div style={{ marginLeft:'auto', display:'flex', gap:10 }}>
            {['SAUDI','EXPAT'].map(nat => {
              const cnt = employees.filter(e=>(e.nationality||'EXPAT').toUpperCase()===nat).length
              return cnt > 0 ? (
                <span key={nat} style={{ background:nat==='SAUDI'?'#e8f5e9':'#e3f2fd', color:nat==='SAUDI'?'#2e7d32':'#1565C0', padding:'4px 12px', borderRadius:8, fontWeight:700, fontSize:12, fontFamily:'Poppins,sans-serif' }}>
                  {nat==='SAUDI'?'🇸🇦':'🌍'} {nat}: {cnt}
                </span>
              ) : null
            })}
          </div>
        </div>

      </div>{/* end scroll zone */}

      {/* PAGE BANNER — new notice only */}
      <PageBanner
        isOpen={showBanner}
        onClose={()=>setShowBanner(false)}
        onStart={()=>{ setShowBanner(false); setWizardStep(1); setShowForm(true) }}
        chapterName="HR"
        formTitle={['Post','Notice','Board']}
        heading="Notice Board"
        iconLabel="📋"
        workflowSteps={['Notice Details','Message & Settings']}
        description="Post an announcement, policy update, or reminder for all team members."
      />

      {/* FORM SHELL — new + edit */}
      <FormShell
        isOpen={showForm}
        onClose={()=>{ setShowForm(false); setWizardStep(1) }}
        chapterName="HR"
        title={editing ? ['Edit','Notice',''] : ['Post','Notice','Board']}
        steps={['Notice Details','Message & Settings']}
        currentStep={wizardStep}
        onBack={wizardStep===1 ? ()=>{ setShowForm(false); setWizardStep(1) } : ()=>setWizardStep(s=>s-1)}
        backLabel={wizardStep===1 ? 'Cancel' : 'Back'}
        onNext={wizardStep===1 ? ()=>{ if(!form.title.trim()){alert('Title is required');return}; setWizardStep(2) } : save}
        nextLabel={wizardStep===1 ? 'Next →' : (saving ? 'Saving…' : (editing ? 'Update Notice' : 'Post Notice'))}
        nextDisabled={saving}
        subjectLabel={form.title || null}
      >
        {wizardStep===1 && (
          <div>
            <div style={{ marginBottom:14 }}>
              <label style={S.label}>Title *</label>
              <input style={S.inp} value={form.title} onChange={e=>f('title',e.target.value)} placeholder="Notice title" />
            </div>
            <div style={{ display:'flex', gap:10, marginBottom:14 }}>
              <div style={{ flex:1 }}>
                <label style={S.label}>Category</label>
                <select style={S.inp} value={form.category} onChange={e=>f('category',e.target.value)}>
                  {CATEGORIES.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ flex:1 }}>
                <label style={S.label}>Priority</label>
                <select style={S.inp} value={form.priority} onChange={e=>f('priority',e.target.value)}>
                  <option value="HIGH">🔴 HIGH</option>
                  <option value="MEDIUM">🟡 MEDIUM</option>
                  <option value="LOW">🟢 LOW</option>
                </select>
              </div>
            </div>
          </div>
        )}
        {wizardStep===2 && (
          <div>
            <div style={{ marginBottom:14 }}>
              <label style={S.label}>Body / Details</label>
              <textarea style={{ ...S.inp, height:120, resize:'vertical' }} value={form.body} onChange={e=>f('body',e.target.value)} placeholder="Write the full notice here…" />
            </div>
            <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'flex-end' }}>
              <div style={{ flex:1 }}>
                <label style={S.label}>Expires On (optional)</label>
                <input type="date" style={S.inp} value={form.expires_at} onChange={e=>f('expires_at',e.target.value)} />
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, fontWeight:600, paddingBottom:10, fontFamily:'Poppins, sans-serif' }}>
                <input type="checkbox" checked={form.pinned} onChange={e=>f('pinned',e.target.checked)} />
                📌 Pin to top
              </label>
            </div>
            {form.title && (
              <div style={{ background:'#F7F2ED', borderRadius:4, padding:'12px 14px', fontSize:12, color:'#795338', borderLeft:'3px solid #BCA99A' }}>
                <div style={{ fontWeight:700, marginBottom:4 }}>Preview</div>
                <div><strong>{form.title}</strong> · {form.category} · {form.priority}</div>
                {form.expires_at && <div style={{ marginTop:4 }}>Expires: {new Date(form.expires_at).toLocaleDateString('en-GB')}</div>}
                {form.pinned && <div style={{ marginTop:4 }}>📌 Pinned</div>}
              </div>
            )}
          </div>
        )}
      </FormShell>
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
