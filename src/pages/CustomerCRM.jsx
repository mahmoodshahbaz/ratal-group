import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'

// ═══════════════════════════════════════════════════════════════════
// Customer CRM — Phase 22
//
// Lead pipeline, interaction log, follow-up reminders.
// SQL: crm_leads + crm_interactions
// ═══════════════════════════════════════════════════════════════════

const STAGES = ['NEW','CONTACTED','QUALIFIED','QUOTED','NEGOTIATING','WON','LOST','DORMANT']
const SOURCES = ['DIRECT','REFERRAL','WALK_IN','PHONE','EMAIL','WEBSITE','SOCIAL_MEDIA','BSP','OTHER']
const LEAD_TYPES = ['INDIVIDUAL','CORPORATE','GROUP','AIRLINE_CREW','GOVERNMENT']
const TRAVEL_TYPES = ['FLIGHT','HOTEL','PACKAGE','VISA','UMRAH','HAJJ','CORPORATE','OTHER']
const INT_TYPES = ['CALL','EMAIL','WHATSAPP','MEETING','QUOTE_SENT','FOLLOW_UP','NOTE','OTHER']
const INT_OUTCOMES = ['INTERESTED','NOT_INTERESTED','CALLBACK','QUOTED','BOOKED','NO_ANSWER','OTHER']

const STAGE_CONFIG = {
  NEW:         { color:'#546e7a', bg:'#f5f7fa', icon:'🆕' },
  CONTACTED:   { color:'#1565C0', bg:'#e3f2fd', icon:'📞' },
  QUALIFIED:   { color:'#5A32D4', bg:'#f3e5f5', icon:'✅' },
  QUOTED:      { color:'#e65100', bg:'#fff3e0', icon:'💼' },
  NEGOTIATING: { color:'#f57f17', bg:'#fff8e1', icon:'🤝' },
  WON:         { color:'#2e7d32', bg:'#e8f5e9', icon:'🎉' },
  LOST:        { color:'#c62828', bg:'#ffebee', icon:'❌' },
  DORMANT:     { color:'#795548', bg:'#efebe9', icon:'😴' },
}

const today = () => new Date().toISOString().slice(0,10)
const fmtD  = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'
const fmt   = n => (+n||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})
const daysAgo = d => d ? Math.floor((Date.now()-new Date(d))/86400000) : null

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:12 },
  input: { padding:'8px 10px', borderRadius:8, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff', width:'100%', boxSizing:'border-box' },
  label: { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
  btn:   (c='#1565C0') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }),
}

// ── Lead modal ────────────────────────────────────────────────────
function LeadModal({ entityId, item, employees, onClose, onSaved }) {
  const { user } = useAuth()
  const [form, setForm] = useState({
    contact_name:'', company_name:'', email:'', phone:'',
    nationality:'', city:'', country:'Saudi Arabia',
    lead_source:'DIRECT', lead_type:'INDIVIDUAL', travel_type:'FLIGHT',
    destination:'', travel_date:'', return_date:'', pax_count:1,
    stage:'NEW', estimated_value:'', currency:'SAR',
    assigned_to:'', assigned_name:'', department:'',
    next_follow_up:'', notes:'',
    ...item,
  })
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  async function save() {
    if (!form.contact_name) { setErr('Contact name required'); return }
    setSaving(true); setErr('')
    const row = {
      entity_id:       entityId,
      contact_name:    form.contact_name,
      company_name:    form.company_name||null,
      email:           form.email||null,
      phone:           form.phone||null,
      nationality:     form.nationality||null,
      city:            form.city||null,
      country:         form.country||'Saudi Arabia',
      lead_source:     form.lead_source,
      lead_type:       form.lead_type,
      travel_type:     form.travel_type||null,
      destination:     form.destination||null,
      travel_date:     form.travel_date||null,
      return_date:     form.return_date||null,
      pax_count:       +form.pax_count||1,
      stage:           form.stage,
      estimated_value: +form.estimated_value||0,
      currency:        form.currency,
      assigned_to:     form.assigned_to||null,
      assigned_name:   form.assigned_name||null,
      department:      form.department||null,
      next_follow_up:  form.next_follow_up||null,
      notes:           form.notes||null,
      created_by:      user?.id||null,
    }
    const { error } = item?.id
      ? await supabase.from('crm_leads').update(row).eq('id',item.id)
      : await supabase.from('crm_leads').insert(row)
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  const F = ({label,children,col}) => (
    <div style={{ marginBottom:10, gridColumn:col }}>
      <label style={S.label}>{label}</label>{children}
    </div>
  )

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:700, maxHeight:'90vh', overflow:'auto', padding:28 }}>
        <div style={{ fontWeight:800, fontSize:16, color:'#1a2e3d', marginBottom:20 }}>
          {item?.id ? '✏️ Edit Lead' : '🆕 New Lead'}
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <F label="Contact Name *" col="1/-1">
            <input style={{ ...S.input, fontSize:14 }} value={form.contact_name} onChange={e=>setForm(f=>({...f,contact_name:e.target.value}))} placeholder="Full name" />
          </F>
          <F label="Company / Organisation">
            <input style={S.input} value={form.company_name} onChange={e=>setForm(f=>({...f,company_name:e.target.value}))} placeholder="Company name (optional)" />
          </F>
          <F label="Phone">
            <input style={S.input} value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="+966 5x xxx xxxx" />
          </F>
          <F label="Email">
            <input type="email" style={S.input} value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} />
          </F>
          <F label="Nationality">
            <input style={S.input} value={form.nationality} onChange={e=>setForm(f=>({...f,nationality:e.target.value}))} placeholder="e.g. Saudi, Indian" />
          </F>
          <F label="City">
            <input style={S.input} value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))} placeholder="Riyadh, Jeddah…" />
          </F>
          <F label="Lead Source">
            <select style={S.input} value={form.lead_source} onChange={e=>setForm(f=>({...f,lead_source:e.target.value}))}>
              {SOURCES.map(s=><option key={s}>{s}</option>)}
            </select>
          </F>
          <F label="Lead Type">
            <select style={S.input} value={form.lead_type} onChange={e=>setForm(f=>({...f,lead_type:e.target.value}))}>
              {LEAD_TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
          </F>
          <F label="Travel / Service Type">
            <select style={S.input} value={form.travel_type} onChange={e=>setForm(f=>({...f,travel_type:e.target.value}))}>
              {TRAVEL_TYPES.map(t=><option key={t}>{t}</option>)}
            </select>
          </F>
          <F label="Destination">
            <input style={S.input} value={form.destination} onChange={e=>setForm(f=>({...f,destination:e.target.value}))} placeholder="e.g. Dubai, London, Makkah" />
          </F>
          <F label="Travel Date">
            <input type="date" style={S.input} value={form.travel_date} onChange={e=>setForm(f=>({...f,travel_date:e.target.value}))} />
          </F>
          <F label="Return Date">
            <input type="date" style={S.input} value={form.return_date} onChange={e=>setForm(f=>({...f,return_date:e.target.value}))} />
          </F>
          <F label="Pax Count">
            <input type="number" style={S.input} value={form.pax_count} min={1} onChange={e=>setForm(f=>({...f,pax_count:e.target.value}))} />
          </F>
          <F label="Estimated Value (SAR)">
            <input type="number" style={S.input} value={form.estimated_value} onChange={e=>setForm(f=>({...f,estimated_value:e.target.value}))} step="0.01" />
          </F>
          <F label="Stage">
            <select style={S.input} value={form.stage} onChange={e=>setForm(f=>({...f,stage:e.target.value}))}>
              {STAGES.map(s=><option key={s}>{s}</option>)}
            </select>
          </F>
          <F label="Assigned To">
            <select style={S.input} value={form.assigned_to} onChange={e=>{
              const emp=employees.find(x=>x.id===e.target.value)
              setForm(f=>({...f,assigned_to:e.target.value,assigned_name:emp?.full_name||''}))
            }}>
              <option value="">— Unassigned —</option>
              {employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </F>
          <F label="Next Follow-Up">
            <input type="date" style={S.input} value={form.next_follow_up} onChange={e=>setForm(f=>({...f,next_follow_up:e.target.value}))} />
          </F>
          <F label="Notes" col="1/-1">
            <textarea style={{ ...S.input, minHeight:60, resize:'vertical' }} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
          </F>
        </div>
        {err && <div style={{ color:'#c62828', fontSize:12, marginTop:8 }}>{err}</div>}
        <div style={{ display:'flex', gap:8, marginTop:16, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ background:'#f0f4f8', color:'#546e7a', border:'none', borderRadius:8, padding:'8px 14px', fontWeight:700, cursor:'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={S.btn()}>{saving?'Saving…':'Save Lead'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Interaction log sidebar ───────────────────────────────────────
function InteractionLog({ entityId, lead, onClose }) {
  const { user } = useAuth()
  const [interactions, setInteractions] = useState([])
  const [form, setForm] = useState({ interaction_type:'CALL', summary:'', outcome:'', next_action:'', next_action_date:'' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('crm_interactions').select('*')
      .eq('lead_id', lead.id).order('interaction_date', { ascending:false })
      .then(({ data }) => setInteractions(data||[]))
  }, [lead.id])

  async function addInteraction() {
    if (!form.summary) return
    setSaving(true)
    await supabase.from('crm_interactions').insert({
      entity_id: entityId, lead_id: lead.id,
      interaction_type: form.interaction_type, summary: form.summary,
      outcome: form.outcome||null, next_action: form.next_action||null,
      next_action_date: form.next_action_date||null, created_by: user?.id||null,
    })
    // Update last_contact_at and next_follow_up on lead
    const upd = { last_contact_at: new Date().toISOString() }
    if (form.next_action_date) upd.next_follow_up = form.next_action_date
    await supabase.from('crm_leads').update(upd).eq('id', lead.id)

    setForm({ interaction_type:'CALL', summary:'', outcome:'', next_action:'', next_action_date:'' })
    setSaving(false)
    const { data } = await supabase.from('crm_interactions').select('*')
      .eq('lead_id', lead.id).order('interaction_date', { ascending:false })
    setInteractions(data||[])
  }

  const INT_ICONS = { CALL:'📞', EMAIL:'📧', WHATSAPP:'💬', MEETING:'🤝', QUOTE_SENT:'💼', FOLLOW_UP:'🔔', NOTE:'📝', OTHER:'📌' }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'stretch', justifyContent:'flex-end' }}>
      <div style={{ background:'#fff', width:'100%', maxWidth:480, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ background:'#1a2e3d', padding:'16px 20px', color:'#fff', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontWeight:800, fontSize:15 }}>{lead.contact_name}</div>
            <div style={{ fontSize:11, color:'#90a4ae' }}>{lead.company_name||''} · {lead.stage}</div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', color:'#fff', border:'none', fontSize:20, cursor:'pointer' }}>✕</button>
        </div>

        {/* Log form */}
        <div style={{ padding:'14px 16px', borderBottom:'1px solid #f0f4f8' }}>
          <div style={{ fontWeight:700, fontSize:12, color:'#6b7c93', marginBottom:8 }}>Log Interaction</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
            <div>
              <label style={S.label}>Type</label>
              <select style={S.input} value={form.interaction_type} onChange={e=>setForm(f=>({...f,interaction_type:e.target.value}))}>
                {INT_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Outcome</label>
              <select style={S.input} value={form.outcome} onChange={e=>setForm(f=>({...f,outcome:e.target.value}))}>
                <option value="">—</option>
                {INT_OUTCOMES.map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom:8 }}>
            <label style={S.label}>Summary *</label>
            <textarea style={{ ...S.input, minHeight:52, resize:'vertical' }} value={form.summary}
              onChange={e=>setForm(f=>({...f,summary:e.target.value}))} placeholder="What was discussed?" />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
            <div>
              <label style={S.label}>Next Action</label>
              <input style={S.input} value={form.next_action} onChange={e=>setForm(f=>({...f,next_action:e.target.value}))} placeholder="Send quote, call back…" />
            </div>
            <div>
              <label style={S.label}>Next Action Date</label>
              <input type="date" style={S.input} value={form.next_action_date} onChange={e=>setForm(f=>({...f,next_action_date:e.target.value}))} />
            </div>
          </div>
          <button onClick={addInteraction} disabled={saving||!form.summary} style={{ ...S.btn(), width:'100%', opacity:saving||!form.summary?0.5:1 }}>
            {saving?'Saving…':'+ Log Interaction'}
          </button>
        </div>

        {/* Timeline */}
        <div style={{ flex:1, overflow:'auto', padding:'14px 16px' }}>
          <div style={{ fontWeight:700, fontSize:12, color:'#6b7c93', marginBottom:10 }}>History ({interactions.length})</div>
          {interactions.length===0 && (
            <div style={{ textAlign:'center', color:'#6b7c93', fontSize:12, padding:20 }}>No interactions yet</div>
          )}
          {interactions.map(i=>(
            <div key={i.id} style={{ display:'flex', gap:10, marginBottom:14 }}>
              <div style={{ fontSize:20, flexShrink:0 }}>{INT_ICONS[i.interaction_type]||'📌'}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:12, color:'#1a2e3d' }}>{i.interaction_type}</div>
                <div style={{ fontSize:11, color:'#6b7c93', marginBottom:4 }}>
                  {new Date(i.interaction_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}
                </div>
                <div style={{ fontSize:12, color:'#1a2e3d', lineHeight:1.5 }}>{i.summary}</div>
                {i.outcome && <div style={{ fontSize:11, color:'#5A32D4', marginTop:4 }}>Outcome: {i.outcome}</div>}
                {i.next_action && (
                  <div style={{ fontSize:11, color:'#e65100', marginTop:4 }}>
                    → {i.next_action}{i.next_action_date && ` by ${fmtD(i.next_action_date)}`}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Lead card (kanban) ────────────────────────────────────────────
function LeadCard({ lead, onEdit, onLog, onStage }) {
  const sc = STAGE_CONFIG[lead.stage]||STAGE_CONFIG.NEW
  const overdue = lead.next_follow_up && new Date(lead.next_follow_up) < new Date()

  return (
    <div style={{ background:'#fff', borderRadius:12, padding:'12px 14px',
      boxShadow:'0 1px 6px rgba(0,0,0,0.08)', marginBottom:8,
      borderLeft:`4px solid ${sc.color}`,
      outline: overdue ? '2px solid #ffe082' : 'none' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
        <div>
          <div style={{ fontWeight:700, fontSize:13, color:'#1a2e3d' }}>{lead.contact_name}</div>
          {lead.company_name && <div style={{ fontSize:11, color:'#6b7c93' }}>{lead.company_name}</div>}
        </div>
        {lead.estimated_value > 0 && (
          <div style={{ fontWeight:800, fontSize:12, color:sc.color }}>
            {fmt(lead.estimated_value)} SAR
          </div>
        )}
      </div>
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', fontSize:10, marginBottom:6 }}>
        {lead.travel_type && <span style={{ background:'#f0f4f8', color:'#546e7a', borderRadius:4, padding:'1px 6px' }}>{lead.travel_type}</span>}
        {lead.destination && <span style={{ background:'#e3f2fd', color:'#1565C0', borderRadius:4, padding:'1px 6px' }}>✈ {lead.destination}</span>}
        {lead.pax_count > 1 && <span style={{ background:'#f3e5f5', color:'#5A32D4', borderRadius:4, padding:'1px 6px' }}>{lead.pax_count} pax</span>}
        {lead.lead_source && <span style={{ background:'#f5f5f5', color:'#546e7a', borderRadius:4, padding:'1px 6px' }}>{lead.lead_source}</span>}
      </div>
      {(lead.next_follow_up || lead.assigned_name) && (
        <div style={{ fontSize:10, color: overdue?'#c62828':'#6b7c93', marginBottom:6 }}>
          {lead.next_follow_up && `${overdue?'⚠️ Overdue':'📅'} ${fmtD(lead.next_follow_up)}`}
          {lead.assigned_name && ` · 👤 ${lead.assigned_name}`}
        </div>
      )}
      <div style={{ display:'flex', gap:4, marginTop:6 }}>
        <button onClick={()=>onLog(lead)} style={{ flex:1, background:'#f0f4f8', color:'#1a2e3d', border:'none', borderRadius:6, padding:'5px', fontSize:10, fontWeight:700, cursor:'pointer' }}>💬 Log</button>
        <button onClick={()=>onEdit(lead)} style={{ flex:1, background:'transparent', color:'#1565C0', border:'1px solid #1565C0', borderRadius:6, padding:'5px', fontSize:10, cursor:'pointer' }}>Edit</button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════
export default function CustomerCRM({ entityId }) {
  const [leads,     setLeads]     = useState([])
  const [employees, setEmployees] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [modal,     setModal]     = useState(null)
  const [logLead,   setLogLead]   = useState(null)
  const [view,      setView]      = useState('kanban')   // kanban | list
  const [filterSrc, setFilterSrc] = useState('')
  const [filterAsg, setFilterAsg] = useState('')
  const [search,    setSearch]    = useState('')
  const [tab,       setTab]       = useState(0)

  const load = useCallback(async () => {
    if (!entityId) return
    setLoading(true)
    const [leadsRes, empRes] = await Promise.all([
      supabase.from('crm_leads').select('*').eq('entity_id', entityId).order('updated_at', { ascending:false }),
      supabase.from('employees').select('id, full_name').eq('entity_id', entityId).eq('is_active', true),
    ])
    setLeads(leadsRes.data||[])
    setEmployees(empRes.data||[])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  async function updateStage(lead, stage) {
    await supabase.from('crm_leads').update({ stage }).eq('id', lead.id)
    load()
  }

  const filtered = leads.filter(l => {
    if (filterSrc && l.lead_source !== filterSrc) return false
    if (filterAsg && l.assigned_to !== filterAsg) return false
    if (search && !l.contact_name.toLowerCase().includes(search.toLowerCase()) &&
        !(l.company_name||'').toLowerCase().includes(search.toLowerCase()) &&
        !(l.destination||'').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Pipeline metrics
  const pipeline = {}
  for (const s of STAGES) {
    const grp = filtered.filter(l=>l.stage===s)
    pipeline[s] = { leads: grp, count: grp.length, value: grp.reduce((sum,l)=>sum+(+l.estimated_value||0),0) }
  }
  const totalPipelineValue = Object.values(pipeline).reduce((s,g)=>s+g.value,0)
  const wonValue = pipeline.WON?.value||0
  const conversionRate = filtered.length > 0 ? ((pipeline.WON?.count||0)/filtered.length*100).toFixed(0) : 0

  // Today's follow-ups
  const todayFollowUps = filtered.filter(l=>l.next_follow_up && l.next_follow_up <= today() && !['WON','LOST'].includes(l.stage))
  const overdueFollowUps = todayFollowUps.filter(l=>l.next_follow_up < today())

  const TABS = [{ label:'🗂 Kanban' },{ label:'☰ List' },{ label:'📅 Follow-ups' }]

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:16 }}>
        Lead pipeline · interaction log · follow-up reminders
      </div>

      {/* KPI strip */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:8, marginBottom:14 }}>
        {[
          { label:'Total Leads',     val:filtered.length,    color:'#1565C0', icon:'👥', unit:'#' },
          { label:'Pipeline Value',  val:totalPipelineValue, color:'#5A32D4', icon:'💼', unit:'SAR' },
          { label:'Won Value',       val:wonValue,           color:'#2e7d32', icon:'🎉', unit:'SAR' },
          { label:'Conversion Rate', val:conversionRate,     color:'#e65100', icon:'📈', unit:'%' },
          { label:'Follow-ups Due',  val:todayFollowUps.length, color:overdueFollowUps.length>0?'#c62828':'#f57f17', icon:'📅', unit:'#' },
        ].map(k=>(
          <div key={k.label} style={{ background:'#fff', borderRadius:12, padding:'12px 14px', boxShadow:'0 2px 8px rgba(0,0,0,0.07)', borderLeft:`4px solid ${k.color}` }}>
            <div style={{ fontSize:18 }}>{k.icon}</div>
            <div style={{ fontWeight:800, fontSize:18, color:k.color }}>{k.unit==='SAR'?(+k.val||0).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})+' SAR':k.unit==='%'?k.val+'%':k.val}</div>
            <div style={{ fontSize:10, color:'#6b7c93' }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Follow-up alert */}
      {overdueFollowUps.length > 0 && (
        <div style={{ ...S.card, background:'#fff8e1', border:'1.5px solid #ffe082' }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#f57f17', marginBottom:6 }}>⚠️ Overdue Follow-ups</div>
          {overdueFollowUps.slice(0,5).map(l=>(
            <div key={l.id} style={{ fontSize:12, color:'#e65100', display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span>👤 <strong>{l.contact_name}</strong>{l.company_name?` — ${l.company_name}`:''} · {l.stage}</span>
              <span style={{ fontWeight:700 }}>Due {fmtD(l.next_follow_up)} ({daysAgo(l.next_follow_up)}d ago)</span>
            </div>
          ))}
        </div>
      )}

      {/* Controls */}
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div style={{ flex:1, minWidth:180 }}>
          <label style={S.label}>Search</label>
          <input style={S.input} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, company, destination…" />
        </div>
        <div>
          <label style={S.label}>Source</label>
          <select style={{ ...S.input, width:130 }} value={filterSrc} onChange={e=>setFilterSrc(e.target.value)}>
            <option value="">All Sources</option>
            {SOURCES.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Assigned To</label>
          <select style={{ ...S.input, width:150 }} value={filterAsg} onChange={e=>setFilterAsg(e.target.value)}>
            <option value="">All Agents</option>
            {employees.map(e=><option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </div>
        <button onClick={()=>setModal('new')} style={S.btn()}>+ New Lead</button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, background:'#f0f4f8', borderRadius:12, padding:4, marginBottom:14 }}>
        {TABS.map((t,i)=>(
          <button key={i} onClick={()=>setTab(i)} style={{
            padding:'7px 14px', borderRadius:8, fontWeight:700, fontSize:12, cursor:'pointer', border:'none',
            background:tab===i?'#fff':'transparent', color:tab===i?'#1a2e3d':'#6b7c93',
            boxShadow:tab===i?'0 1px 4px rgba(0,0,0,0.1)':'none',
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading leads…</div>
      ) : tab===0 ? (
        /* ── Kanban ──────────────────────────────────────────────── */
        <div style={{ display:'grid', gridTemplateColumns:`repeat(${STAGES.filter(s=>!['LOST','DORMANT'].includes(s)).length},1fr)`, gap:8, overflowX:'auto' }}>
          {STAGES.filter(s=>!['LOST','DORMANT'].includes(s)).map(stage=>{
            const sc = STAGE_CONFIG[stage]
            const grp = pipeline[stage]
            return (
              <div key={stage} style={{ minWidth:180 }}>
                <div style={{ background:sc.bg, borderRadius:10, padding:'8px 12px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontWeight:800, fontSize:11, color:sc.color }}>{sc.icon} {stage}</span>
                  <span style={{ fontSize:10, color:sc.color }}>{grp.count}</span>
                </div>
                {grp.value > 0 && <div style={{ fontSize:10, color:'#6b7c93', marginBottom:8, paddingLeft:4 }}>{(grp.value/1000).toFixed(0)}K SAR</div>}
                {grp.leads.map(l=>(
                  <LeadCard key={l.id} lead={l} onEdit={r=>setModal(r)} onLog={r=>setLogLead(r)} onStage={updateStage} />
                ))}
              </div>
            )
          })}
        </div>
      ) : tab===1 ? (
        /* ── List view ───────────────────────────────────────────── */
        <div style={{ background:'#fff', borderRadius:14, overflow:'auto', boxShadow:'0 2px 10px rgba(0,0,0,0.07)' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
            <thead>
              <tr style={{ background:'#f0f4f8' }}>
                {['Contact','Stage','Travel','Est. Value','Assigned','Next Follow-up',''].map(h=>(
                  <th key={h} style={{ padding:'10px 10px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6b7c93' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 ? (
                <tr><td colSpan={7} style={{ padding:40, textAlign:'center', color:'#6b7c93' }}>No leads found</td></tr>
              ) : filtered.map(l=>{
                const sc = STAGE_CONFIG[l.stage]||STAGE_CONFIG.NEW
                const ov = l.next_follow_up && l.next_follow_up < today()
                return (
                  <tr key={l.id} style={{ borderBottom:'1px solid #f0f4f8' }}>
                    <td style={{ padding:'10px 10px' }}>
                      <div style={{ fontWeight:700, fontSize:13 }}>{l.contact_name}</div>
                      {l.company_name && <div style={{ fontSize:11, color:'#6b7c93' }}>{l.company_name}</div>}
                      {l.phone && <div style={{ fontSize:10, color:'#6b7c93' }}>{l.phone}</div>}
                    </td>
                    <td style={{ padding:'10px 10px' }}>
                      <span style={{ background:sc.bg, color:sc.color, border:`1px solid ${sc.color}33`, borderRadius:20, padding:'2px 10px', fontSize:10, fontWeight:700 }}>
                        {sc.icon} {l.stage}
                      </span>
                    </td>
                    <td style={{ padding:'10px 10px', fontSize:11 }}>
                      {l.travel_type && <div>{l.travel_type}</div>}
                      {l.destination && <div style={{ color:'#1565C0' }}>✈ {l.destination}</div>}
                      {l.travel_date && <div style={{ color:'#6b7c93' }}>{fmtD(l.travel_date)}</div>}
                    </td>
                    <td style={{ padding:'10px 10px', fontWeight:700, color:'#5A32D4' }}>
                      {l.estimated_value > 0 ? `${fmt(l.estimated_value)} SAR` : '—'}
                    </td>
                    <td style={{ padding:'10px 10px', fontSize:12, color:'#6b7c93' }}>{l.assigned_name||'—'}</td>
                    <td style={{ padding:'10px 10px', fontSize:12, color:ov?'#c62828':'#6b7c93', fontWeight:ov?700:400 }}>
                      {ov?'⚠️ ':''}{fmtD(l.next_follow_up)}
                    </td>
                    <td style={{ padding:'10px 10px' }}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={()=>setLogLead(l)} style={{ background:'#f0f4f8', color:'#1a2e3d', border:'none', borderRadius:6, padding:'4px 8px', fontSize:10, fontWeight:700, cursor:'pointer' }}>💬</button>
                        <button onClick={()=>setModal(l)} style={{ background:'transparent', color:'#1565C0', border:'1px solid #1565C0', borderRadius:6, padding:'4px 8px', fontSize:10, cursor:'pointer' }}>Edit</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── Follow-ups tab ──────────────────────────────────────── */
        <div>
          {todayFollowUps.length===0 ? (
            <div style={{ ...S.card, textAlign:'center', padding:60, color:'#6b7c93' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
              <div>No follow-ups due — all clear!</div>
            </div>
          ) : (
            todayFollowUps.sort((a,b)=>new Date(a.next_follow_up)-new Date(b.next_follow_up)).map(l=>{
              const sc = STAGE_CONFIG[l.stage]||STAGE_CONFIG.NEW
              const ov = l.next_follow_up < today()
              return (
                <div key={l.id} style={{ ...S.card, borderLeft:`4px solid ${ov?'#c62828':'#f57f17'}` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:8 }}>
                    <div>
                      <div style={{ fontWeight:800, fontSize:14 }}>{l.contact_name}</div>
                      {l.company_name && <div style={{ fontSize:12, color:'#6b7c93' }}>{l.company_name}</div>}
                      <div style={{ display:'flex', gap:8, marginTop:4 }}>
                        <span style={{ fontSize:11, color:sc.color }}>{sc.icon} {l.stage}</span>
                        {l.travel_type && <span style={{ fontSize:11, color:'#6b7c93' }}>· {l.travel_type}</span>}
                        {l.destination && <span style={{ fontSize:11, color:'#1565C0' }}>✈ {l.destination}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontWeight:700, fontSize:12, color:ov?'#c62828':'#f57f17' }}>
                        {ov ? `⚠️ ${daysAgo(l.next_follow_up)}d overdue` : '📅 Due today'}
                      </div>
                      {l.estimated_value > 0 && <div style={{ fontSize:12, color:'#5A32D4', fontWeight:700 }}>{fmt(l.estimated_value)} SAR</div>}
                    </div>
                  </div>
                  {l.phone && <div style={{ fontSize:12, color:'#6b7c93', marginTop:6 }}>📞 {l.phone}</div>}
                  <div style={{ display:'flex', gap:8, marginTop:10 }}>
                    <button onClick={()=>setLogLead(l)} style={S.btn()}>💬 Log Interaction</button>
                    <button onClick={()=>setModal(l)} style={{ background:'#f0f4f8', color:'#1a2e3d', border:'none', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>Edit Lead</button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {modal && (
        <LeadModal entityId={entityId} item={modal==='new'?null:modal}
          employees={employees}
          onClose={()=>setModal(null)}
          onSaved={()=>{ setModal(null); load() }} />
      )}
      {logLead && (
        <InteractionLog entityId={entityId} lead={logLead}
          onClose={()=>{ setLogLead(null); load() }} />
      )}
    </div>
  )
}
