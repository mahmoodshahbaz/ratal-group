import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import PageBanner from '../components/PageBanner'

// ═══════════════════════════════════════════════════════════════════
// Document Vault — Phase 20
//
// Store, search, and track documents: contracts, licenses, MOUs,
// insurance policies, visas, certificates.
// File upload via Supabase Storage bucket 'documents'.
// Expiry alerts at configurable threshold.
// ═══════════════════════════════════════════════════════════════════

const CATEGORIES = ['CONTRACT','LICENSE','MOU','INSURANCE','VISA','CERTIFICATE','INVOICE','LEGAL','OTHER']
const STATUSES   = ['ACTIVE','EXPIRING_SOON','EXPIRED','RENEWED','CANCELLED']
const LINK_TYPES = ['EMPLOYEE','PROJECT','SUPPLIER','VEHICLE','OTHER']

const STATUS_COLORS = {
  ACTIVE:        { bg:'#e8f5e9', color:'#2e7d32', border:'#a5d6a7' },
  EXPIRING_SOON: { bg:'#fff8e1', color:'#f57f17', border:'#ffe082' },
  EXPIRED:       { bg:'#ffebee', color:'#c62828', border:'#ef9a9a' },
  RENEWED:       { bg:'#e3f2fd', color:'#1565C0', border:'#90caf9' },
  CANCELLED:     { bg:'#f5f5f5', color:'#757575', border:'#e0e0e0' },
}

const CAT_ICONS = {
  CONTRACT:'📄', LICENSE:'🪪', MOU:'🤝', INSURANCE:'🛡️',
  VISA:'✈️', CERTIFICATE:'🏅', INVOICE:'🧾', LEGAL:'⚖️', OTHER:'📁',
}

const today = () => new Date().toISOString().slice(0,10)
const fmtD  = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'

function daysUntilExpiry(expiry_date) {
  if (!expiry_date) return null
  return Math.ceil((new Date(expiry_date) - new Date()) / 86400000)
}

function computeStatus(doc) {
  if (!doc.expiry_date) return doc.status
  const days = daysUntilExpiry(doc.expiry_date)
  if (days < 0) return 'EXPIRED'
  if (days <= (doc.alert_days||30)) return 'EXPIRING_SOON'
  return doc.status==='EXPIRED'||doc.status==='RENEWED'||doc.status==='CANCELLED' ? doc.status : 'ACTIVE'
}

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:12 },
  input: { padding:'8px 10px', borderRadius:8, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff', width:'100%', boxSizing:'border-box' },
  label: { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
  btn:   (c='#454D9B') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }),
}

// ── Document modal — 6-layer Administration theme ─────────────────
const PP = "'Poppins','Segoe UI',sans-serif"
const PRI = '#454D9B'
const L1  = '#AAAED0'
const L2  = '#F0F1FA'

const STEP_NAMES = ['Document Details', 'Dates & Attachments']
const STEP_DESC  = [
  'Title, category, parties and document reference',
  'Dates, expiry alerts, file upload and ownership',
]

function DocModal({ entityId, item, onClose, onSaved }) {
  const { user } = useAuth()
  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    title:'', doc_number:'', category:'CONTRACT', description:'',
    counterparty:'', issued_by:'', issue_date:'', effective_date:'',
    expiry_date:'', alert_days:30, is_renewable:false,
    status:'ACTIVE', linked_type:'', linked_id:'', linked_name:'',
    department:'', owner_name:'', notes:'',
    file_url:'', file_name:'', file_type:'',
    ...item,
  })
  const [file,      setFile]      = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState('')
  const [uploading, setUploading] = useState(false)

  const setF = (k,v) => setForm(f=>({...f,[k]:v}))

  async function uploadFile(f) {
    if (!f) return null
    setUploading(true)
    const path = `${entityId}/${Date.now()}_${f.name}`
    const { error } = await supabase.storage.from('documents').upload(path, f, { upsert:true })
    setUploading(false)
    if (error) { setErr('Upload failed: '+error.message); return null }
    const { data:{ publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
    return { url: publicUrl, name: f.name, type: f.name.split('.').pop().toUpperCase(), size: Math.round(f.size/1024) }
  }

  async function save() {
    if (!form.title) { setErr('Title is required'); setStep(1); return }
    setSaving(true); setErr('')
    let fileData = {}
    if (file) {
      const up = await uploadFile(file)
      if (!up) { setSaving(false); return }
      fileData = { file_url:up.url, file_name:up.name, file_type:up.type, file_size_kb:up.size }
    }
    const row = {
      entity_id:entityId, title:form.title, doc_number:form.doc_number||null,
      category:form.category, description:form.description||null,
      counterparty:form.counterparty||null, issued_by:form.issued_by||null,
      issue_date:form.issue_date||null, effective_date:form.effective_date||null,
      expiry_date:form.expiry_date||null, alert_days:+form.alert_days||30,
      is_renewable:form.is_renewable, status:form.status,
      linked_type:form.linked_type||null, linked_name:form.linked_name||null,
      department:form.department||null, owner_name:form.owner_name||null,
      owner_user_id:user?.id||null, notes:form.notes||null,
      created_by:user?.id||null, ...fileData,
    }
    const { error } = item?.id
      ? await supabase.from('documents').update(row).eq('id',item.id)
      : await supabase.from('documents').insert(row)
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  const inp  = (extra={}) => ({ padding:'9px 11px', borderRadius:8, border:'1.5px solid #dde3ec', fontSize:12, outline:'none', background:'#fff', width:'100%', boxSizing:'border-box', fontFamily:PP, ...extra })
  const lbl  = { display:'block', fontSize:10, fontWeight:700, color:'#6b7c93', marginBottom:4, textTransform:'uppercase', letterSpacing:0.5 }
  const row2 = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }
  const mb12 = { marginBottom:12 }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      {/* L1 frame */}
      <div style={{ background:L1, borderRadius:20, padding:20, width:'100%', maxWidth:860, boxShadow:'0 24px 70px rgba(0,0,0,0.40)', position:'relative', border:'4px solid '+L1 }}>
        {/* L3 accent block */}
        <div style={{ position:'absolute', top:0, right:0, width:220, height:110, background:PRI, borderRadius:'0 20px 0 60px', zIndex:1 }} />
        {/* L2 root */}
        <div style={{ background:L2, borderRadius:14, display:'flex', overflow:'hidden', position:'relative', zIndex:2, minHeight:520 }}>
          {/* Sidebar */}
          <div style={{ width:210, flexShrink:0, padding:'24px 18px 18px', display:'flex', flexDirection:'column', fontFamily:PP, background:L2, position:'relative', zIndex:2 }}>
            <div style={{ fontSize:9, fontWeight:800, color:'#53666F', letterSpacing:1.8, textTransform:'uppercase', marginBottom:3 }}>Ratal Advanced Technologies</div>
            <div style={{ fontSize:11, fontWeight:900, color:PRI, letterSpacing:1, textTransform:'uppercase', marginBottom:16 }}><strong>Administration</strong></div>
            <div style={{ fontSize:20, fontWeight:900, color:'#172D37', lineHeight:1.1, marginBottom:6 }}>{STEP_NAMES[step-1]}</div>
            <div style={{ fontSize:11, color:'#53666F', lineHeight:1.5, marginBottom:16 }}>{STEP_DESC[step-1]}</div>
            {/* Step dots */}
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginTop:4 }}>
              {STEP_NAMES.map((n,i)=>(
                <div key={i} onClick={()=>setStep(i+1)} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer' }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', background:step===i+1?PRI:'#C8C8D8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'#fff', flexShrink:0, transition:'background .2s' }}>{i+1}</div>
                  <div style={{ fontSize:11, fontWeight:step===i+1?800:500, color:step===i+1?PRI:'#6b7c93' }}>{n}</div>
                </div>
              ))}
            </div>
            <div style={{ flex:1 }} />
            <div style={{ fontSize:9, color:'#aab2bd', marginTop:16 }}>{item?.id ? 'Editing document' : 'New document'}</div>
          </div>
          {/* White card */}
          <div style={{ flex:1, background:'#fff', borderRadius:'0 14px 14px 0', display:'flex', flexDirection:'column', overflow:'hidden' }}>
            {/* Step banner — Projects style gradient */}
            <div style={{ background:`linear-gradient(120deg, #2d3580 0%, ${PRI} 55%, #6b74c8 100%)`, padding:'20px 24px 18px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'relative', overflow:'hidden' }}>
              {/* Decorative circles */}
              <div style={{ position:'absolute', right:-30, top:-30, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.08)' }} />
              <div style={{ position:'absolute', right:50, bottom:-30, width:80, height:80, borderRadius:'50%', background:'rgba(255,255,255,0.05)' }} />
              <div style={{ display:'flex', alignItems:'center', gap:14, position:'relative', zIndex:1 }}>
                <div style={{ width:44, height:44, borderRadius:12, background:'rgba(255,255,255,0.18)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>{CAT_ICONS[form.category]||'📁'}</div>
                <div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.70)', fontFamily:PP, letterSpacing:1.4, textTransform:'uppercase', marginBottom:3 }}>Step {step} of {STEP_NAMES.length} · Administration</div>
                  <div style={{ fontSize:17, fontWeight:900, color:'#fff', fontFamily:PP, letterSpacing:0.2 }}>{STEP_NAMES[step-1]}</div>
                </div>
              </div>
              {/* Step pills */}
              <div style={{ display:'flex', gap:7, position:'relative', zIndex:1 }}>
                {STEP_NAMES.map((_,i)=>(
                  <div key={i} style={{ width:32, height:8, borderRadius:4, background: step===i+1 ? '#fff' : 'rgba(255,255,255,0.30)', transition:'background .2s' }} />
                ))}
              </div>
            </div>
            {/* Form body */}
            <div style={{ flex:1, overflowY:'auto', padding:'20px 22px' }}>
              {step===1 && (
                <>
                  <div style={mb12}>
                    <label style={lbl}>Document Title *</label>
                    <input style={inp({ fontSize:14 })} value={form.title} onChange={e=>setF('title',e.target.value)} placeholder="Enter document title" />
                  </div>
                  <div style={row2}>
                    <div>
                      <label style={lbl}>Category</label>
                      <select value={form.category} onChange={e=>setF('category',e.target.value)} style={inp()}>
                        {CATEGORIES.map(c=><option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={lbl}>Status</label>
                      <select value={form.status} onChange={e=>setF('status',e.target.value)} style={inp()}>
                        {STATUSES.map(s=><option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={row2}>
                    <div>
                      <label style={lbl}>Document Number / Ref</label>
                      <input style={inp()} value={form.doc_number} onChange={e=>setF('doc_number',e.target.value)} placeholder="License no., contract no." />
                    </div>
                    <div>
                      <label style={lbl}>Link To</label>
                      <select value={form.linked_type} onChange={e=>setF('linked_type',e.target.value)} style={inp()}>
                        <option value="">— None —</option>
                        {LINK_TYPES.map(t=><option key={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={row2}>
                    <div>
                      <label style={lbl}>Counterparty / Other Party</label>
                      <input style={inp()} value={form.counterparty} onChange={e=>setF('counterparty',e.target.value)} placeholder="Company or authority name" />
                    </div>
                    <div>
                      <label style={lbl}>Issued By</label>
                      <input style={inp()} value={form.issued_by} onChange={e=>setF('issued_by',e.target.value)} placeholder="Issuing authority" />
                    </div>
                  </div>
                  {form.linked_type && (
                    <div style={mb12}>
                      <label style={lbl}>{form.linked_type} Name</label>
                      <input style={inp()} value={form.linked_name} onChange={e=>setF('linked_name',e.target.value)} placeholder={`Name of linked ${form.linked_type.toLowerCase()}`} />
                    </div>
                  )}
                  <div style={mb12}>
                    <label style={lbl}>Description / Notes</label>
                    <textarea style={{ ...inp(), minHeight:70, resize:'vertical' }} value={form.description} onChange={e=>setF('description',e.target.value)} />
                  </div>
                </>
              )}
              {step===2 && (
                <>
                  <div style={row2}>
                    <div>
                      <label style={lbl}>Issue Date</label>
                      <input type="date" style={inp()} value={form.issue_date} onChange={e=>setF('issue_date',e.target.value)} />
                    </div>
                    <div>
                      <label style={lbl}>Effective Date</label>
                      <input type="date" style={inp()} value={form.effective_date} onChange={e=>setF('effective_date',e.target.value)} />
                    </div>
                  </div>
                  <div style={row2}>
                    <div>
                      <label style={lbl}>Expiry Date</label>
                      <input type="date" style={inp()} value={form.expiry_date} onChange={e=>setF('expiry_date',e.target.value)} />
                    </div>
                    <div>
                      <label style={lbl}>Alert (days before expiry)</label>
                      <input type="number" style={inp()} value={form.alert_days} min={1} onChange={e=>setF('alert_days',e.target.value)} />
                    </div>
                  </div>
                  <div style={row2}>
                    <div>
                      <label style={lbl}>Department</label>
                      <input style={inp()} value={form.department} onChange={e=>setF('department',e.target.value)} />
                    </div>
                    <div>
                      <label style={lbl}>Owner / Responsible</label>
                      <input style={inp()} value={form.owner_name} onChange={e=>setF('owner_name',e.target.value)} placeholder="Person responsible for renewal" />
                    </div>
                  </div>
                  <div style={mb12}>
                    <label style={lbl}>File Attachment</label>
                    {form.file_url && !file && (
                      <div style={{ fontSize:12, color:'#2e7d32', marginBottom:6 }}>
                        📎 Current: <a href={form.file_url} target="_blank" rel="noreferrer" style={{ color:PRI }}>{form.file_name||'View file'}</a>
                      </div>
                    )}
                    <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xlsx,.xls" onChange={e=>setFile(e.target.files[0])} style={{ ...inp(), padding:'6px' }} />
                    {file && <div style={{ fontSize:11, color:'#546e7a', marginTop:4 }}>📎 {file.name} ({Math.round(file.size/1024)} KB)</div>}
                    {uploading && <div style={{ fontSize:11, color:PRI, marginTop:4 }}>Uploading…</div>}
                  </div>
                  <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, cursor:'pointer', fontFamily:PP }}>
                    <input type="checkbox" checked={form.is_renewable} onChange={e=>setF('is_renewable',e.target.checked)} />
                    Document is renewable
                  </label>
                </>
              )}
              {err && <div style={{ color:'#c62828', fontSize:12, marginTop:8 }}>{err}</div>}
            </div>
            {/* Footer */}
            <div style={{ padding:'12px 22px', borderTop:'1px solid #f0f4f8', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#fff' }}>
              <button onClick={step===1?onClose:()=>setStep(s=>s-1)} style={{ background:'#747474', color:'#fff', border:'none', borderRadius:22, padding:'9px 22px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:PP }}>
                {step===1?'Cancel':'Back'}
              </button>
              {step<STEP_NAMES.length
                ? <button onClick={()=>{ if(!form.title){setErr('Title is required');return}; setErr(''); setStep(s=>s+1) }} style={{ background:PRI, color:'#fff', border:'none', borderRadius:22, padding:'9px 28px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:PP }}>Next →</button>
                : <button onClick={save} disabled={saving||uploading} style={{ background:PRI, color:'#fff', border:'none', borderRadius:22, padding:'9px 28px', cursor:'pointer', fontSize:13, fontWeight:700, fontFamily:PP }}>{saving?'Saving…':'Save Document'}</button>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Document card ─────────────────────────────────────────────────
function DocCard({ doc, onEdit, onDelete }) {
  const status = computeStatus(doc)
  const sc     = STATUS_COLORS[status]||STATUS_COLORS.ACTIVE
  const days   = daysUntilExpiry(doc.expiry_date)

  return (
    <div style={{ background:'#fff', borderRadius:14, padding:'14px 16px',
      boxShadow:'0 2px 10px rgba(0,0,0,0.07)',
      borderLeft:`4px solid ${sc.border}` }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
        <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
          <span style={{ fontSize:18 }}>{CAT_ICONS[doc.category]||'📁'}</span>
          <span style={{ background:sc.bg, color:sc.color, border:`1px solid ${sc.border}`, borderRadius:20, padding:'2px 10px', fontSize:10, fontWeight:700 }}>
            {status}
          </span>
          <span style={{ background:'#f0f4f8', color:'#546e7a', borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:600 }}>
            {doc.category}
          </span>
        </div>
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={()=>onEdit(doc)} style={{ background:'transparent', color:'#1565C0', border:'1px solid #1565C0', borderRadius:6, padding:'3px 8px', fontSize:10, cursor:'pointer' }}>Edit</button>
          <button onClick={()=>onDelete(doc)} style={{ background:'transparent', color:'#c62828', border:'1px solid #ef9a9a', borderRadius:6, padding:'3px 8px', fontSize:10, cursor:'pointer' }}>Del</button>
        </div>
      </div>

      <div style={{ fontWeight:800, fontSize:14, color:'#1a2e3d', marginBottom:4 }}>{doc.title}</div>
      {doc.doc_number && <div style={{ fontSize:11, color:'#6b7c93', marginBottom:4 }}>📌 {doc.doc_number}</div>}
      {doc.counterparty && <div style={{ fontSize:12, color:'#546e7a', marginBottom:4 }}>{doc.counterparty}</div>}

      <div style={{ display:'flex', gap:12, flexWrap:'wrap', fontSize:11, color:'#6b7c93', marginTop:8 }}>
        {doc.effective_date && <span>From: {fmtD(doc.effective_date)}</span>}
        {doc.expiry_date && (
          <span style={{ color:sc.color, fontWeight:700 }}>
            {days !== null && days < 0 ? `Expired ${Math.abs(days)}d ago` :
             days !== null && days <= 30 ? `Expires in ${days}d` :
             `Exp: ${fmtD(doc.expiry_date)}`}
          </span>
        )}
        {doc.linked_type && doc.linked_name && <span>🔗 {doc.linked_type}: {doc.linked_name}</span>}
        {doc.owner_name && <span>👤 {doc.owner_name}</span>}
      </div>

      {doc.file_url && (
        <div style={{ marginTop:8 }}>
          <a href={doc.file_url} target="_blank" rel="noreferrer"
            style={{ fontSize:11, color:'#1565C0', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:4 }}>
            📎 {doc.file_name||'View attachment'} {doc.file_type && `(${doc.file_type})`}
          </a>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════
export default function DocumentVault({ entityId }) {
  const [docs,     setDocs]    = useState([])
  const [loading,  setLoading] = useState(true)
  const [modal,    setModal]   = useState(null)
  const [showBanner, setShowBanner] = useState(false)
  const [filterCat,setFilterCat]=useState('')
  const [filterSt, setFilterSt]=useState('')
  const [search,   setSearch]  = useState('')
  const [view,     setView]    = useState('grid')  // grid | list

  const load = useCallback(async () => {
    if (!entityId) return
    setLoading(true)
    let q = supabase.from('documents').select('*').eq('entity_id', entityId).order('expiry_date', { ascending:true, nullsFirst:false })
    if (filterCat) q = q.eq('category', filterCat)
    const { data } = await q
    setDocs(data||[])
    setLoading(false)
  }, [entityId, filterCat])

  useEffect(() => { load() }, [load])

  async function handleDelete(doc) {
    if (!window.confirm(`Delete "${doc.title}"?`)) return
    await supabase.from('documents').delete().eq('id',doc.id)
    load()
  }

  // Compute statuses client-side for filtering
  const allDocs = docs.map(d=>({ ...d, _status: computeStatus(d) }))
  const visible = allDocs
    .filter(d => !filterSt || d._status===filterSt)
    .filter(d => !search ||
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      (d.doc_number||'').toLowerCase().includes(search.toLowerCase()) ||
      (d.counterparty||'').toLowerCase().includes(search.toLowerCase()) ||
      (d.linked_name||'').toLowerCase().includes(search.toLowerCase()))

  // KPIs
  const expiring  = allDocs.filter(d=>d._status==='EXPIRING_SOON').length
  const expired   = allDocs.filter(d=>d._status==='EXPIRED').length
  const active    = allDocs.filter(d=>d._status==='ACTIVE').length

  // Group by category for summary
  const byCat = {}
  for (const d of allDocs) {
    if (!byCat[d.category]) byCat[d.category] = 0
    byCat[d.category]++
  }

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:16 }}>
        Contracts, licenses, MOUs, insurance policies, visas — with expiry tracking
      </div>

      {/* KPI strip */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14, alignItems:'stretch' }}>
        {[
          { label:'Total Docs',    val:allDocs.length, color:'#1565c0', icon:'📁', onClick:()=>setFilterSt('') },
          { label:'Active',        val:active,          color:'#2e7d32', icon:'✅', onClick:()=>setFilterSt('ACTIVE') },
          { label:'Expiring Soon', val:expiring,        color:'#e65100', icon:'⏳', onClick:()=>setFilterSt('EXPIRING_SOON') },
          { label:'Expired',       val:expired,         color:'#c62828', icon:'❌', onClick:()=>setFilterSt('EXPIRED') },
        ].map(k=>(
          <div key={k.label} onClick={k.onClick} style={{ background:`linear-gradient(135deg,${k.color}cc 0%,${k.color} 100%)`, borderRadius:10, padding:'10px 16px', flexShrink:0, minWidth:110, boxShadow:`0 3px 10px ${k.color}44`, cursor:'pointer', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', right:8, top:6, fontSize:18, opacity:0.25 }}>{k.icon}</div>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.85)', fontWeight:700, textTransform:'uppercase', letterSpacing:0.8 }}>{k.label}</div>
            <div style={{ fontSize:22, fontWeight:900, color:'#fff', lineHeight:1.2, marginTop:2 }}>{k.val}</div>
          </div>
        ))}
        {Object.entries(byCat).slice(0,4).map(([cat,cnt])=>(
          <div key={cat} onClick={()=>setFilterCat(filterCat===cat?'':cat)} style={{ background:`linear-gradient(135deg,#546e7acc 0%,#37474f 100%)`, borderRadius:10, padding:'10px 14px', flexShrink:0, minWidth:90, boxShadow:'0 3px 10px #546e7a44', cursor:'pointer', position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', right:8, top:6, fontSize:16, opacity:0.25 }}>{CAT_ICONS[cat]||'📁'}</div>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.85)', fontWeight:700, textTransform:'uppercase', letterSpacing:0.8 }}>{cat}</div>
            <div style={{ fontSize:20, fontWeight:900, color:'#fff', lineHeight:1.2, marginTop:2 }}>{cnt}</div>
          </div>
        ))}
      </div>

      {/* Expiring soon alert */}
      {expiring > 0 && (
        <div style={{ ...S.card, background:'#fff8e1', border:'1.5px solid #ffe082' }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#f57f17', marginBottom:6 }}>⏳ Expiring Soon</div>
          {allDocs.filter(d=>d._status==='EXPIRING_SOON').sort((a,b)=>new Date(a.expiry_date)-new Date(b.expiry_date)).map(d=>{
            const days = daysUntilExpiry(d.expiry_date)
            return (
              <div key={d.id} style={{ fontSize:12, color:'#e65100', marginBottom:4, display:'flex', justifyContent:'space-between' }}>
                <span>{CAT_ICONS[d.category]||'📁'} <strong>{d.title}</strong> — {d.counterparty||d.issued_by||''}</span>
                <span style={{ fontWeight:700 }}>{days} days left ({fmtD(d.expiry_date)})</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Controls - sticky */}
      <div style={{ position:'sticky', top:0, zIndex:20, background:'#f4f7fb', paddingBottom:8, marginBottom:4 }}><div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap', marginBottom:0 }}>
        <div style={{ flex:1, minWidth:200 }}>
          <label style={S.label}>Search</label>
          <input style={S.input} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Title, number, counterparty…" />
        </div>
        <div>
          <label style={S.label}>Category</label>
          <select style={{ ...S.input, width:130 }} value={filterCat} onChange={e=>setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {CATEGORIES.map(c=><option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Status</label>
          <select style={{ ...S.input, width:140 }} value={filterSt} onChange={e=>setFilterSt(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUSES.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ display:'flex', gap:4, alignSelf:'flex-end' }}>
          <button onClick={()=>setView('grid')} style={{ ...S.btn(view==='grid'?'#1a2e3d':'#f0f4f8'), color:view==='grid'?'#fff':'#546e7a', padding:'8px 12px' }}>⊞</button>
          <button onClick={()=>setView('list')} style={{ ...S.btn(view==='list'?'#1a2e3d':'#f0f4f8'), color:view==='list'?'#fff':'#546e7a', padding:'8px 12px' }}>☰</button>
        </div>
        <button onClick={()=>setShowBanner(true)} style={{ ...S.btn(), minWidth:160, padding:'10px 0', textAlign:'center', fontFamily:"'Poppins',sans-serif", boxShadow:'0 3px 8px rgba(69,77,155,0.35)' }}>Add New Document</button>
      </div></div>

      {loading ? (
        <div style={{ textAlign:'center', padding:80, color:'#6b7c93' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>🗄️</div>Loading…
        </div>
      ) : visible.length===0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:60, color:'#6b7c93' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🗄️</div>
          <div style={{ fontSize:14 }}>No documents found</div>
          <div style={{ fontSize:12, marginTop:4 }}>Add your first document with the button above</div>
        </div>
      ) : view==='grid' ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:10 }}>
          {visible.map(d=>(
            <DocCard key={d.id} doc={d} onEdit={r=>setModal(r)} onDelete={handleDelete} />
          ))}
        </div>
      ) : (
        <div style={{ background:'#fff', borderRadius:14, overflow:'auto', boxShadow:'0 2px 10px rgba(0,0,0,0.07)' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#f0f4f8' }}>
                {['Cat','Title','Number','Counterparty','Expiry','Status','Linked to',''].map(h=>(
                  <th key={h} style={{ padding:'10px 10px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6b7c93' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(d=>{
                const sc  = STATUS_COLORS[d._status]||STATUS_COLORS.ACTIVE
                const days= daysUntilExpiry(d.expiry_date)
                return (
                  <tr key={d.id} style={{ borderBottom:'1px solid #f0f4f8' }}>
                    <td style={{ padding:'9px 10px', fontSize:18 }}>{CAT_ICONS[d.category]||'📁'}</td>
                    <td style={{ padding:'9px 10px' }}>
                      <div style={{ fontWeight:700, fontSize:13 }}>{d.title}</div>
                      {d.file_url && <a href={d.file_url} target="_blank" rel="noreferrer" style={{ fontSize:10, color:'#1565C0' }}>📎 {d.file_name||'View'}</a>}
                    </td>
                    <td style={{ padding:'9px 10px', fontSize:11, color:'#6b7c93' }}>{d.doc_number||'—'}</td>
                    <td style={{ padding:'9px 10px', fontSize:12 }}>{d.counterparty||'—'}</td>
                    <td style={{ padding:'9px 10px', fontSize:12, color:sc.color, fontWeight:days!==null&&days<=30?700:400 }}>
                      {d.expiry_date ? (
                        <>{fmtD(d.expiry_date)}<br/><span style={{ fontSize:10 }}>{days<0?`${Math.abs(days)}d ago`:days<=30?`${days}d left`:''}</span></>
                      ) : '—'}
                    </td>
                    <td style={{ padding:'9px 10px' }}>
                      <span style={{ ...sc, border:`1.5px solid ${sc.border}`, borderRadius:20, padding:'2px 10px', fontSize:10, fontWeight:700 }}>
                        {d._status}
                      </span>
                    </td>
                    <td style={{ padding:'9px 10px', fontSize:11, color:'#6b7c93' }}>
                      {d.linked_type && d.linked_name ? `${d.linked_type}: ${d.linked_name}` : '—'}
                    </td>
                    <td style={{ padding:'9px 10px' }}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={()=>setModal(d)} style={{ background:'transparent', color:'#1565C0', border:'1px solid #1565C0', borderRadius:6, padding:'3px 8px', fontSize:10, cursor:'pointer' }}>Edit</button>
                        <button onClick={()=>handleDelete(d)} style={{ background:'transparent', color:'#c62828', border:'1px solid #ef9a9a', borderRadius:6, padding:'3px 8px', fontSize:10, cursor:'pointer' }}>Del</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* PageBanner — intro screen for new documents */}
      <PageBanner
        isOpen={showBanner}
        onClose={()=>setShowBanner(false)}
        onStart={()=>{ setShowBanner(false); setModal('new') }}
        chapterL1="#AAAED0"
        chapterL2="#F0F1FA"
        moduleColor="#454D9B"
        chapterLabel="Administration"
        formTitle={['New', 'Document', 'Record']}
        steps={['Document Details', 'Dates & Attachments']}
        icon="📄"
        description="Store contracts, licenses, MOUs, visas, certificates and any document that needs tracking, expiry alerts and easy retrieval."
      />

      {modal && (
        <DocModal
          entityId={entityId}
          item={modal==='new'?null:modal}
          onClose={()=>setModal(null)}
          onSaved={()=>{ setModal(null); load() }}
        />
      )}
    </div>
  )
}
