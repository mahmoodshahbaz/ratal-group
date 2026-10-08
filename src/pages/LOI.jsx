import { GROUP_COLORS } from '../styles/appStyles'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useExpandable, ExpandableRow, DetailField, DetailRow, DetailSection, DetailActions } from '../components/ExpandableRow'
import PageBanner from '../components/PageBanner'
import FormShell from '../components/FormShell'

// LOI = Letter of Intent received from a client before a formal project is raised
// Flow: LOI RECEIVED → RESPONDED → CONVERTED (→ Project) | REJECTED | EXPIRED

const SAR  = v => `SAR ${(+v||0).toLocaleString('en',{minimumFractionDigits:0,maximumFractionDigits:0})}`
const fmt  = d => d ? new Date(d).toLocaleDateString('en-GB') : '—'
const TODAY = new Date().toISOString().slice(0,10)

const UNITS    = ['NISU','TISU','CISU','ITSU','ALL']
const STATUSES = ['RECEIVED','RESPONDED','CONVERTED','REJECTED','EXPIRED']
const STATUS_META = {
  RECEIVED:  { color:'#0079BC', bg:'#e3f2fd',   icon:'📥' },
  RESPONDED: { color:'#e65100', bg:'#fff3e0',   icon:'📤' },
  CONVERTED: { color:'#2e7d32', bg:'#e8f5e9',   icon:'✅' },
  REJECTED:  { color:'#c62828', bg:'#ffebee',   icon:'❌' },
  EXPIRED:   { color:'#aab2bd', bg:'#f5f7fa',   icon:'⏰' },
}

const MC = GROUP_COLORS.Operations

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'20px 22px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:18 },
  inp:   { width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
  btn:   (c='#0079BC') => ({ background:c, color:'#fff', border:'none', borderRadius:9, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'Poppins',sans-serif" }),
  label: { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4 },
  row:   { display:'flex', gap:12, marginBottom:14 },
  col:   { flex:1 },
  tbl:   { width:'100%', borderCollapse:'collapse', fontSize:12 },
  th:    { background:MC, color:'#fff', padding:'9px 12px', fontWeight:700, textAlign:'left', fontSize:11, fontFamily:"'Poppins',sans-serif" },
  td:    { padding:'9px 12px', borderBottom:'1px solid #f0f4f8', color:'#1a2e3d', verticalAlign:'middle' },
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' },
  modal: { background:'#fff', borderRadius:16, padding:28, width:680, maxWidth:'97vw', maxHeight:'93vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.18)' },
}

const EMPTY = {
  loi_number:'', client_name:'', client_type:'CONTRACTOR',
  contractor_id:'', customer_id:'',
  service_unit:'NISU', work_type:'', scope_description:'',
  estimated_value:'', received_date:TODAY, response_deadline:'',
  status:'RECEIVED', notes:'', internal_ref:'',
}

// Auto LOI number: LOI-YYMM-SEQ
async function nextLoiNo(entityId) {
  const prefix = `LOI-${new Date().toISOString().slice(2,4)}${new Date().toISOString().slice(5,7)}`
  const { data } = await supabase.from('loi_requests').select('loi_number')
    .like('loi_number', `${prefix}%`).order('loi_number',{ascending:false}).limit(1)
  const seq = data?.length ? parseInt(data[0].loi_number.slice(-3))+1 : 1
  return `${prefix}-${String(seq).padStart(3,'0')}`
}

export default function LOI({ entityId }) {
  const [lois,        setLois]       = useState([])
  const [contractors, setCons]       = useState([])
  const [customers,   setCusts]      = useState([])
  const [projects,    setProjects]   = useState([])
  const [loading,     setLoading]    = useState(true)
  const [showBanner,  setShowBanner] = useState(false)
  const [showForm,    setShowForm]   = useState(false)
  const [loiStep,     setLoiStep]    = useState(1)
  const [attachments, setAttachments]= useState([])
  const fileRef                      = useRef(null)
  const [detail,      setDetail]     = useState(null)
  const [editing,     setEditing]    = useState(null)
  const [form,        setForm]       = useState(EMPTY)
  const [saving,      setSaving]     = useState(false)
  const [filter,      setFilter]     = useState({ status:'', unit:'' })
  const [search,      setSearch]     = useState('')
  const [converting,  setConverting] = useState(false)
  const { toggle: toggleLoi, isOpen: loiOpen } = useExpandable()

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const [{ data:l },{ data:con },{ data:cus },{ data:p }] = await Promise.all([
      supabase.from('loi_requests').select('*').eq('entity_id',entityId).order('received_date',{ascending:false}).limit(200),
      supabase.from('contractors').select('id,contractor_name,vendor_type').eq('entity_id',entityId).eq('vendor_type','CONTRACTOR').order('contractor_name'),
      supabase.from('customers').select('id,name').eq('entity_id',entityId).order('name').limit(100),
      supabase.from('projects').select('id,project_number').eq('entity_id',entityId).limit(200),
    ])
    setLois(l||[]); setCons(con||[]); setCusts(cus||[]); setProjects(p||[])
    setLoading(false)
  }

  async function openNew() {
    const num = await nextLoiNo(entityId)
    setEditing(null)
    setForm({ ...EMPTY, loi_number: num })
    setLoiStep(1)
    setAttachments([])
    setShowBanner(true)
  }

  function openEdit(loi) {
    setEditing(loi)
    setLoiStep(1)
    setAttachments([])
    setForm({
      loi_number:        loi.loi_number||'',
      client_name:       loi.client_name||'',
      client_type:       loi.client_type||'CONTRACTOR',
      contractor_id:     loi.contractor_id||'',
      customer_id:       loi.customer_id||'',
      service_unit:      loi.service_unit||'NISU',
      work_type:         loi.work_type||'',
      scope_description: loi.scope_description||'',
      estimated_value:   loi.estimated_value||'',
      received_date:     loi.received_date||TODAY,
      response_deadline: loi.response_deadline||'',
      status:            loi.status||'RECEIVED',
      notes:             loi.notes||'',
      internal_ref:      loi.internal_ref||'',
    })
    setShowForm(true)
  }

  async function save() {
    if (!form.client_name && !form.contractor_id && !form.customer_id) { alert('Client is required'); return }
    setSaving(true)
    const payload = {
      ...form,
      entity_id:       entityId,
      estimated_value: +form.estimated_value||0,
      contractor_id:   form.contractor_id||null,
      customer_id:     form.customer_id||null,
    }
    const { error } = editing
      ? await supabase.from('loi_requests').update(payload).eq('id',editing.id)
      : await supabase.from('loi_requests').insert(payload)
    setSaving(false)
    if (error) { alert(error.message); return }
    setShowForm(false); setEditing(null); load()
  }

  async function updateStatus(id, status) {
    await supabase.from('loi_requests').update({ status }).eq('id',id)
    setLois(p => p.map(l => l.id===id ? {...l,status} : l))
    if (detail?.id===id) setDetail(d=>({...d,status}))
  }

  async function convertToProject(loi) {
    if (!window.confirm(`Convert LOI ${loi.loi_number} to a Project? This will mark the LOI as CONVERTED.`)) return
    setConverting(true)
    // Generate project number: P-YYXXX
    const yr = new Date().getFullYear().toString().slice(2)
    const { count } = await supabase.from('projects').select('id',{count:'exact',head:true}).eq('entity_id',entityId)
    const projNo = `P-${yr}${String((count||0)+1).padStart(3,'0')}`

    const { data:proj, error } = await supabase.from('projects').insert({
      entity_id:            entityId,
      project_number:       projNo,
      project_name:         loi.scope_description?.slice(0,80) || `Project from ${loi.loi_number}`,
      contractor_id:        loi.contractor_id||null,
      customer_id:          loi.customer_id||null,
      contract_value:       loi.estimated_value||0,
      status:               'ACTIVE',
      loi_ref:              loi.loi_number,
      start_date:           TODAY,
    }).select().single()

    if (error) { alert(error.message); setConverting(false); return }

    // Mark LOI converted + link project
    await supabase.from('loi_requests').update({ status:'CONVERTED', converted_project_id: proj.id, converted_project_no: projNo }).eq('id',loi.id)
    setConverting(false)
    alert(`✅ Project ${projNo} created!\nYou can now find it in the Projects module.`)
    load(); setDetail(null)
  }

  function f(k,v) { setForm(p=>({...p,[k]:v})) }

  const filtered = lois
    .filter(l => !filter.status || l.status===filter.status)
    .filter(l => !filter.unit   || l.service_unit===filter.unit)
    .filter(l => !search ||
      (l.loi_number||'').toLowerCase().includes(search.toLowerCase()) ||
      (l.client_name||'').toLowerCase().includes(search.toLowerCase()) ||
      (l.scope_description||'').toLowerCase().includes(search.toLowerCase()))

  const byStatus = STATUSES.reduce((a,s)=>({...a,[s]:lois.filter(l=>l.status===s).length}),{})
  const totalValue = lois.reduce((s,l)=>s+(+l.estimated_value||0),0)
  const pipelineValue = lois.filter(l=>['RECEIVED','RESPONDED'].includes(l.status)).reduce((s,l)=>s+(+l.estimated_value||0),0)

  return (
    <div>
      {/* ── Step 0 Opening Banner ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); setShowForm(true) }}
        chapterL1="#70A5A6"
        chapterL2="#EAF3F2"
        moduleColor={MC}
        chapterLabel="Operations"
        formTitle={['NEW', 'LOI', 'REQUEST']}
        steps={['Request Details', 'Attachments']}
        icon="📋"
        description={`Record Letter of Intent details — even if you receive a verbal notification or via WhatsApp, fill this in for your own records and to safeguard yourself. Goes through DH approval before filing.`}
      />

      {/* Header — chapter H1 provided by AppShell; only action button here */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div style={{ fontSize:12, color:'#64748b' }}>Pre-project client commitments · Convert to Project when confirmed</div>
        <button style={{ background:'#0079BC', color:'#fff', border:'none', borderRadius:9, padding:'10px 22px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'Poppins',sans-serif" }} onClick={openNew}>+ New LOI</button>
      </div>

      {/* KPI Cards */}
      <div style={{ display:'flex', gap:12, marginBottom:18, overflowX:'auto', flexWrap:'nowrap', paddingBottom:2 }}>
        {[
          { label:'Total LOIs',       value:lois.length,         color:'#0079BC', bg:'linear-gradient(135deg,#0079BC,#005a8e)', icon:'📋' },
          { label:'Active Pipeline',  value:SAR(pipelineValue),  color:'#0079BC', bg:'linear-gradient(135deg,#0079BC,#005a8e)', icon:'💰', sub:`${byStatus.RECEIVED||0} received · ${byStatus.RESPONDED||0} responded` },
          { label:'Converted',        value:byStatus.CONVERTED||0, color:'#2e7d32', bg:'linear-gradient(135deg,#2e7d32,#1b5e20)', icon:'✅' },
          { label:'Total Est. Value', value:SAR(totalValue),     color:'#0079BC', bg:'linear-gradient(135deg,#70A5A6,#0079BC)', icon:'📊' },
        ].map(c=>(
          <div key={c.label} style={{ flex:1, minWidth:160, borderRadius:12, padding:'14px 16px', background:c.bg, boxShadow:'0 2px 10px rgba(0,0,0,0.13)', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ fontSize:26 }}>{c.icon}</div>
            <div>
              <div style={{ fontSize:16, fontWeight:800, color:'#fff', fontFamily:"'Poppins',sans-serif" }}>{c.value}</div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.8)', fontFamily:"'Poppins',sans-serif" }}>{c.label}</div>
              {c.sub && <div style={{ fontSize:10, color:'rgba(255,255,255,0.65)', marginTop:1 }}>{c.sub}</div>}
            </div>
          </div>
        ))}
        {/* Status mini-chips */}
        {STATUSES.map(s => byStatus[s] > 0 ? (
          <div key={s} onClick={()=>setFilter(f=>({...f,status:filter.status===s?'':s}))}
            style={{ ...S.card, minWidth:90, marginBottom:0, textAlign:'center', padding:'12px 14px', cursor:'pointer',
              border:`2px solid ${filter.status===s?STATUS_META[s].color:'transparent'}`,
              background: filter.status===s ? STATUS_META[s].bg : '#fff' }}>
            <div style={{ fontSize:20 }}>{STATUS_META[s].icon}</div>
            <div style={{ fontSize:16, fontWeight:800, color:STATUS_META[s].color }}>{byStatus[s]}</div>
            <div style={{ fontSize:10, color:'#6b7c93', fontWeight:700 }}>{s}</div>
          </div>
        ) : null)}
      </div>

      {/* Filters */}
      <div style={{ ...S.card, padding:'12px 16px', display:'flex', gap:12, flexWrap:'wrap', marginBottom:14 }}>
        <input style={{ ...S.inp, maxWidth:260 }} placeholder="Search LOI#, client, scope…" value={search} onChange={e=>setSearch(e.target.value)} />
        <select style={{ ...S.inp, maxWidth:160 }} value={filter.unit} onChange={e=>setFilter(f=>({...f,unit:e.target.value}))}>
          <option value="">All Units</option>
          {UNITS.filter(u=>u!=='ALL').map(u=><option key={u}>{u}</option>)}
        </select>
        <select style={{ ...S.inp, maxWidth:160 }} value={filter.status} onChange={e=>setFilter(f=>({...f,status:e.target.value}))}>
          <option value="">All Statuses</option>
          {STATUSES.map(s=><option key={s}>{s}</option>)}
        </select>
        {(filter.status||filter.unit||search) && <button onClick={()=>{ setFilter({status:'',unit:''}); setSearch('') }} style={{ ...S.btn('#aab2bd'), padding:'7px 14px', fontSize:11 }}>✕ Clear</button>}
        <div style={{ fontSize:12, color:'#6b7c93', alignSelf:'center' }}>{filtered.length} records</div>
      </div>

      {/* Table */}
      <div style={S.card}>
        {loading ? <div style={{ textAlign:'center', padding:40, color:'#6b7c93' }}>Loading…</div> : (
          <table style={S.tbl}>
            <thead><tr>
              <th style={S.th}>LOI #</th>
              <th style={S.th}>Client / Contractor</th>
              <th style={S.th}>Unit</th>
              <th style={S.th}>Est. Value</th>
              <th style={S.th}>Deadline</th>
              <th style={S.th}>Status</th>
              <th style={{ ...S.th, width:32 }}></th>
            </tr></thead>
            <tbody>
              {filtered.length===0 && <tr><td colSpan={7} style={{ ...S.td, textAlign:'center', color:'#aab2bd', padding:34 }}>No LOIs yet — click "+ New LOI" to add one</td></tr>}
              {filtered.map((l,i)=>{
                const sm = STATUS_META[l.status]||{}
                const overdue = l.response_deadline && l.response_deadline < TODAY && !['CONVERTED','REJECTED'].includes(l.status)
                return (
                  <ExpandableRow
                    key={l.id} id={l.id}
                    isOpen={loiOpen(l.id)} onToggle={toggleLoi}
                    colSpan={6} zebra={i%2!==0}
                    summary={<>
                      <td style={{ ...S.td, fontWeight:800, color:'#1a2e3d', fontFamily:'monospace' }}>{l.loi_number}</td>
                      <td style={{ ...S.td, fontWeight:600 }}>{l.client_name||'—'}</td>
                      <td style={S.td}><span style={{ background:'#e8eaf6', color:'#3949ab', padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:700 }}>{l.service_unit}</span></td>
                      <td style={{ ...S.td, fontWeight:700, color:'#0079BC' }}>{l.estimated_value>0?SAR(l.estimated_value):'—'}</td>
                      <td style={{ ...S.td, color:overdue?'#c62828':'#1a2e3d', fontWeight:overdue?700:400 }}>{fmt(l.response_deadline)}{overdue&&' ⚠️'}</td>
                      <td style={S.td}><span style={{ background:sm.bg, color:sm.color, padding:'2px 10px', borderRadius:20, fontSize:10, fontWeight:800 }}>{sm.icon} {l.status}</span></td>
                    </>}
                    detail={
                      <div style={{ padding:'14px 20px' }}>
                        <DetailRow>
                          <DetailField label="LOI Number"  value={l.loi_number} mono />
                          <DetailField label="Received"    value={fmt(l.received_date)} />
                          <DetailField label="Deadline"    value={fmt(l.response_deadline)} color={overdue?'#c62828':undefined} />
                          <DetailField label="Est. Value"  value={l.estimated_value>0?SAR(l.estimated_value):null} />
                        </DetailRow>
                        {l.scope_description && (
                          <DetailSection label="Scope of Work">
                            <div style={{ fontSize:12, color:'#455a64', lineHeight:1.6 }}>{l.scope_description}</div>
                          </DetailSection>
                        )}
                        {l.notes && <DetailSection label="Notes"><div style={{ fontSize:12, color:'#6b7c93' }}>{l.notes}</div></DetailSection>}
                        <DetailActions>
                          <button onClick={(e)=>{e.stopPropagation();openEdit(l)}}  style={{ ...S.btn('#0079BC'), padding:'5px 14px', fontSize:11 }}>✏️ Edit</button>
                          <button onClick={(e)=>{e.stopPropagation();setDetail(l)}} style={{ ...S.btn('#5A32D4'), padding:'5px 14px', fontSize:11 }}>📋 Full View</button>
                          {l.status==='RESPONDED' && <button onClick={(e)=>{e.stopPropagation();convertToProject(l)}} disabled={converting} style={{ ...S.btn('#2e7d32'), padding:'5px 14px', fontSize:11 }}>🚀 Convert to Project</button>}
                        </DetailActions>
                      </div>
                    }
                  />
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* DETAIL MODAL */}
      {detail && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setDetail(null)}>
          <div style={{ ...S.modal, width:700 }}>
            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
              <div>
                <div style={{ fontSize:20, fontWeight:800, color:'#1a2e3d' }}>{detail.loi_number}</div>
                <div style={{ fontSize:13, color:'#6b7c93', marginTop:3 }}>{detail.client_name} · {detail.service_unit}</div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                {detail.status==='RESPONDED' && (
                  <button onClick={()=>convertToProject(detail)} disabled={converting} style={S.btn('#2e7d32')}>
                    {converting?'Creating…':'🚀 Convert to Project'}
                  </button>
                )}
                {detail.status==='RECEIVED' && (
                  <button onClick={()=>updateStatus(detail.id,'RESPONDED')} style={S.btn('#e65100')}>Mark Responded</button>
                )}
                {['RECEIVED','RESPONDED'].includes(detail.status) && (
                  <button onClick={()=>updateStatus(detail.id,'REJECTED')} style={S.btn('#c62828')}>Reject</button>
                )}
                <button onClick={()=>setDetail(null)} style={S.btn('#aab2bd')}>Close</button>
              </div>
            </div>

            {/* Status bar */}
            <div style={{ display:'flex', gap:0, marginBottom:20 }}>
              {['RECEIVED','RESPONDED','CONVERTED'].map((s,i)=>{
                const active = STATUSES.indexOf(detail.status) >= i && !['REJECTED','EXPIRED'].includes(detail.status)
                const isCurrent = detail.status === s
                return (
                  <div key={s} style={{ flex:1, padding:'8px 0', textAlign:'center', fontSize:11, fontWeight:700,
                    background: isCurrent ? STATUS_META[s].bg : active ? '#e8f5e9' : '#f5f7fa',
                    color: isCurrent ? STATUS_META[s].color : active ? '#2e7d32' : '#aab2bd',
                    borderBottom: `3px solid ${isCurrent ? STATUS_META[s].color : active ? '#2e7d32' : '#e0e0e0'}`,
                  }}>
                    {STATUS_META[s].icon} {s}
                  </div>
                )
              })}
            </div>

            {/* Details grid */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
              {[
                ['LOI Number',      detail.loi_number],
                ['Client',          detail.client_name],
                ['Service Unit',    detail.service_unit],
                ['Work Type',       detail.work_type||'—'],
                ['Estimated Value', SAR(detail.estimated_value)],
                ['Internal Ref',    detail.internal_ref||'—'],
                ['Received Date',   fmt(detail.received_date)],
                ['Response Deadline', fmt(detail.response_deadline)],
                ['Converted Project', detail.converted_project_no||'—'],
                ['Status',          detail.status],
              ].map(([k,v])=>(
                <div key={k} style={{ background:'#f5f7fa', borderRadius:8, padding:'10px 14px' }}>
                  <div style={{ fontSize:10, color:'#6b7c93', fontWeight:700 }}>{k}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1a2e3d', marginTop:2 }}>{v}</div>
                </div>
              ))}
            </div>

            {detail.scope_description && (
              <div style={{ background:'#f5f7fa', borderRadius:10, padding:'14px 16px', marginBottom:14 }}>
                <div style={{ fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:6 }}>SCOPE OF WORK</div>
                <div style={{ fontSize:13, color:'#1a2e3d', lineHeight:1.7, whiteSpace:'pre-wrap' }}>{detail.scope_description}</div>
              </div>
            )}
            {detail.notes && (
              <div style={{ background:'#fffde7', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#546e7a' }}>
                <strong>Notes:</strong> {detail.notes}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FORM MODAL — FormShell 2-step wizard */}
      <FormShell
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        chapterName="Operations"
        title={['NEW', 'LOI', 'REQUEST']}
        description="Pre-project client commitment · No PO yet"
        steps={['Request Details', 'Attachments']}
        currentStep={loiStep}
        onBack={() => loiStep === 1 ? setShowForm(false) : setLoiStep(1)}
        onNext={loiStep === 1 ? () => setLoiStep(2) : save}
        backLabel={loiStep === 1 ? 'Cancel' : 'Back'}
        nextLabel={saving ? '⏳ Saving…' : loiStep === 1 ? 'Save & Next' : (editing ? '✔ Update LOI' : '💾 Save LOI')}
        nextDisabled={saving}
      >
        {loiStep === 1 && (
          <div>
            {/* Row 1: LOI# + Internal Ref */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
              <div>
                <label style={S.label}>LOI Number</label>
                <input style={{ ...S.inp, fontFamily:'monospace', fontWeight:700, fontSize:14, letterSpacing:0.5 }}
                  value={form.loi_number} onChange={e=>f('loi_number',e.target.value)} />
              </div>
              <div>
                <label style={S.label}>Internal Reference</label>
                <input style={S.inp} value={form.internal_ref} onChange={e=>f('internal_ref',e.target.value)} placeholder="e.g. STC/SCP/2026/001" />
              </div>
            </div>

            {/* Contractor — full width */}
            <div style={{ marginBottom:14, background:'#EAF3F2', borderRadius:10, padding:'12px 14px', border:'1.5px solid #0079BC' }}>
              <label style={{ ...S.label, color:'#0079BC', fontSize:12 }}>Contractor (from Party List) *</label>
              <select style={{ ...S.inp, fontSize:14, fontWeight:600, color:'#172D37', border:'1.5px solid #b0cfe8', background:'#fff' }}
                value={form.contractor_id}
                onChange={e=>{
                  const c=contractors.find(x=>x.id===e.target.value)
                  f('contractor_id',e.target.value)
                  f('client_name',c?.contractor_name||'')
                  f('client_type','CONTRACTOR')
                }}>
                <option value="">— Select Contractor —</option>
                {contractors.map(c=><option key={c.id} value={c.id}>{c.contractor_name}</option>)}
              </select>
              {contractors.length===0 && <div style={{ fontSize:11, color:'#c62828', marginTop:5 }}>⚠ No contractors found. Add contractors in Party List first.</div>}
            </div>

            <div style={{ height:1, background:'#eef2f7', margin:'4px 0 14px' }} />

            {/* Row 2: Unit + Work Type + Value */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr 1fr', gap:12, marginBottom:14 }}>
              <div>
                <label style={S.label}>Service Unit</label>
                <select style={S.inp} value={form.service_unit} onChange={e=>f('service_unit',e.target.value)}>
                  {UNITS.map(u=><option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Work Type / Category</label>
                <select style={S.inp} value={form.work_type} onChange={e=>f('work_type',e.target.value)}>
                  <option value="">— Select —</option>
                  {['MW Links','Node B','IT Charter','Maintenance','Civil Works','Supply','Commissioning','Other'].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Estimated Value (SAR)</label>
                <div style={{ position:'relative' }}>
                  <span style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', fontSize:11, color:'#53666F', fontWeight:700, pointerEvents:'none' }}>SAR</span>
                  <input type="number" style={{ ...S.inp, paddingLeft:36, fontWeight:700, color:'#0079BC' }}
                    value={form.estimated_value} onChange={e=>f('estimated_value',e.target.value)} placeholder="0" />
                </div>
              </div>
            </div>

            {/* Row 3: Dates + Status */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16 }}>
              <div>
                <label style={S.label}>Received Date</label>
                <input type="date" style={S.inp} value={form.received_date} onChange={e=>f('received_date',e.target.value)} />
              </div>
              <div>
                <label style={S.label}>Response Deadline</label>
                <input type="date" style={S.inp} value={form.response_deadline} onChange={e=>f('response_deadline',e.target.value)} />
              </div>
              <div>
                <label style={S.label}>Status</label>
                <select style={{ ...S.inp, fontWeight:700, color:STATUS_META[form.status]?.color||'#172D37' }}
                  value={form.status} onChange={e=>f('status',e.target.value)}>
                  {STATUSES.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Row 4: Scope + Notes SIDE BY SIDE */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div>
                <label style={S.label}>Scope of Work / Description</label>
                <textarea style={{ ...S.inp, height:100, resize:'vertical', lineHeight:1.6 }}
                  value={form.scope_description} onChange={e=>f('scope_description',e.target.value)}
                  placeholder="Describe the work scope, deliverables, sites, quantities…" />
              </div>
              <div>
                <label style={S.label}>Internal Notes</label>
                <textarea style={{ ...S.inp, height:100, resize:'vertical', lineHeight:1.6 }}
                  value={form.notes} onChange={e=>f('notes',e.target.value)}
                  placeholder="Internal remarks, conditions, contacts…" />
              </div>
            </div>
          </div>
        )}

        {loiStep === 2 && (
          <div>
            <div style={{ marginBottom:18, fontSize:13, color:'#53666F', lineHeight:1.7 }}>
              Attach any supporting documents — Quotations, Invoices, WhatsApp screenshots or email scans. <strong>Optional</strong> — you can submit without attachments.
            </div>

            {/* File list */}
            {attachments.length > 0 && (
              <div style={{ marginBottom:16 }}>
                {attachments.map((file, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'#f8fafc', borderRadius:9, marginBottom:8, border:'1px solid #e0e8f0' }}>
                    <span style={{ fontSize:18 }}>📎</span>
                    <span style={{ flex:1, fontSize:13, color:'#172D37', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{file.name}</span>
                    <span style={{ fontSize:11, color:'#53666F' }}>{(file.size/1024).toFixed(0)} KB</span>
                    <button onClick={()=>setAttachments(a=>a.filter((_,j)=>j!==i))} style={{ background:'#fee2e2', border:'none', borderRadius:6, color:'#c62828', padding:'3px 9px', cursor:'pointer', fontSize:11, fontWeight:700 }}>Remove</button>
                  </div>
                ))}
              </div>
            )}

            {/* Add file button */}
            <input ref={fileRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              style={{ display:'none' }}
              onChange={e=>setAttachments(a=>[...a,...Array.from(e.target.files)])} />
            <button onClick={()=>fileRef.current?.click()}
              style={{ width:'100%', padding:'18px', border:'2px dashed #b0cfe8', borderRadius:12, background:'#f0f7ff', color:'#0079BC', fontSize:14, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
              <span style={{ fontSize:20 }}>+</span> Add Attachment (Quotation, Invoice, WhatsApp scan…)
            </button>

            <div style={{ marginTop:14, padding:'12px 14px', background:'#fffde7', borderRadius:9, border:'1px solid #ffe082', fontSize:11, color:'#7a6000' }}>
              ℹ Files are uploaded to Google Drive when you save. Supported: PDF, JPG, PNG, DOC, XLS (max 25 MB each).
            </div>
          </div>
        )}
      </FormShell>
    </div>
  )
}
