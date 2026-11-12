/**
 * DocumentValet.jsx — Central Document Repository
 *
 * Single-source view of ALL documents across every entity type.
 * Reads from the `documents` table (same table EntityDocs writes to).
 *
 * Features:
 *  - Category sidebar (Employee / Company / Fleet / Contractor / Sub-Con / Supplier)
 *  - Entity search & filter within each category
 *  - Documents grouped by doc_type with colour-coded expiry status
 *  - Expiry Dashboard tab: cross-entity sorted alert list
 *  - Upload via EntityDocs modal (reuses existing component)
 *  - Delete document with confirm
 *  - View / download file link
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { kpiCardGradient } from '../styles/appStyles'

// ── Palette — Chapter 03 Administration ─────────────────────────────────
const L1   = '#AAAED0'   // outer background (lavender)
const L2   = '#F0F1FA'   // inner background (light lavender)
const L3   = '#454D9B'   // accent / primary button (indigo)
const PRI  = L3          // alias for components that still reference PRI
const PP   = "'Poppins', sans-serif"
const MAIN = '#172D37'
const SUB  = '#53666F'

// ── Document taxonomy ────────────────────────────────────────────────────
const CATEGORIES = [
  { key:'EMPLOYEE',      label:'Employee',       icon:'👤', color:'#6a1b9a', light:'#f3e5f5' },
  { key:'COMPANY',       label:'Company',        icon:'🏢', color:'#1565c0', light:'#e3f2fd' },
  { key:'VEHICLE',       label:'Fleet',          icon:'🚗', color:'#e65100', light:'#fff3e0' },
  { key:'CONTRACTOR',    label:'Contractor',     icon:'🏗️', color:'#2e7d32', light:'#e8f5e9' },
  { key:'SUBCONTRACTOR', label:'Sub-contractor', icon:'🔧', color:'#6d4c41', light:'#efebe9' },
  { key:'SUPPLIER',      label:'Supplier',       icon:'🚚', color:'#37474f', light:'#eceff1' },
]

const CAT_LABELS = {
  IQAMA:'Iqama', DRIVING_LICENSE:'Driving Licence', PASSPORT:'Passport',
  NATIONAL_ID:'National ID', QIWA:'QIWA Certificate', SCE:'SCE Card',
  MEDICAL_INSURANCE:'Medical Insurance', WORK_PERMIT:'Work Permit',
  EMPLOYMENT_CONTRACT:'Employment Contract', SALARY_CERTIFICATE:'Salary Certificate',
  TRAINING_CERTIFICATE:'Training Certificate', GOSI_CERTIFICATE:'GOSI Certificate',
  CR:'CR (Commercial Registration)', VAT_CERTIFICATE:'VAT Certificate',
  NATIONAL_ADDRESS:'National Address', CHAMBER_OF_COMMERCE:'Chamber of Commerce',
  SAUDIZATION:'Saudization / Nitaqat', ISO_CERTIFICATE:'ISO Certificate',
  VENDOR_APPROVAL:'Vendor / Client Approval', MOI_LICENSE:'MOI License',
  BANK_GUARANTEE:'Bank Guarantee', ARAMCO_APPROVAL:'Aramco Approval',
  SABIC_APPROVAL:'SABIC Approval', PERFORMANCE_BOND:'Performance Bond',
  ISTIMARA:'Istimara (Registration)', INSPECTION:'MVPI / Inspection',
  LEASING_CONTRACT:'Leasing Contract', PURCHASE_ORDER:'Purchase Order',
  COMPLETION_CERTIFICATE:'Completion Certificate', HANDOVER_CERTIFICATE:'Handover Certificate',
  VARIATION_ORDER:'Variation Order', MOU:'MOU', CONTRACT:'Contract',
  CERTIFICATE:'Certificate', LICENSE:'License', INVOICE:'Invoice',
  LEGAL:'Legal Document', INSURANCE:'Insurance', OTHER:'Other',
}

const CAT_ICONS = {
  IQAMA:'🪪', DRIVING_LICENSE:'🚗', PASSPORT:'✈️', NATIONAL_ID:'🪪',
  QIWA:'💼', SCE:'🏗️', MEDICAL_INSURANCE:'🏥', WORK_PERMIT:'📋',
  EMPLOYMENT_CONTRACT:'📄', SALARY_CERTIFICATE:'💰', TRAINING_CERTIFICATE:'🏅',
  CR:'🏢', VAT_CERTIFICATE:'💹', NATIONAL_ADDRESS:'📍', CHAMBER_OF_COMMERCE:'🏛️',
  GOSI_CERTIFICATE:'🛡️', SAUDIZATION:'🇸🇦', ISO_CERTIFICATE:'✅',
  VENDOR_APPROVAL:'👍', MOI_LICENSE:'⚖️', BANK_GUARANTEE:'🏦',
  ARAMCO_APPROVAL:'⛽', SABIC_APPROVAL:'🧪', PERFORMANCE_BOND:'📑',
  ISTIMARA:'🚘', INSPECTION:'🔍', LEASING_CONTRACT:'🔑',
  PURCHASE_ORDER:'📦', COMPLETION_CERTIFICATE:'✔️', HANDOVER_CERTIFICATE:'🤝',
  VARIATION_ORDER:'🔄', MOU:'🤝', CONTRACT:'📄', CERTIFICATE:'🏅',
  LICENSE:'🪪', INVOICE:'🧾', LEGAL:'⚖️', INSURANCE:'🛡️', OTHER:'📁',
}

// ── Expiry helpers ───────────────────────────────────────────────────────
function daysUntil(d) {
  if (!d) return null
  return Math.ceil((new Date(d) - new Date()) / 86400000)
}
function getStatus(doc) {
  if (!doc.expiry_date) return 'NO_EXPIRY'
  const d = daysUntil(doc.expiry_date)
  if (d < 0)  return 'EXPIRED'
  const threshold = doc.alert_days || 30
  if (d <= threshold) return 'EXPIRING_SOON'
  return 'ACTIVE'
}
const STATUS_META = {
  EXPIRED:      { label:'Expired',        bg:'#ffebee', color:'#c62828', dot:'#e53935', priority:0 },
  EXPIRING_SOON:{ label:'Expiring soon',  bg:'#fff8e1', color:'#f57f17', dot:'#ffa726', priority:1 },
  ACTIVE:       { label:'Valid',          bg:'#e8f5e9', color:'#2e7d32', dot:'#43a047', priority:2 },
  NO_EXPIRY:    { label:'No expiry',      bg:'#f5f5f5', color:'#757575', dot:'#bdbdbd', priority:3 },
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
}
function expiryLabel(doc) {
  if (!doc.expiry_date) return 'No expiry date'
  const d = daysUntil(doc.expiry_date)
  if (d < 0)  return `Expired ${Math.abs(d)}d ago`
  if (d === 0) return 'Expires today'
  if (d <= 7)  return `Expires in ${d}d`
  return fmtDate(doc.expiry_date)
}

// ── Upload / Add modal (inline — reuses documents table directly) ─────────
function AddDocModal({ entityId, linkedType, linkedId, linkedName, onClose, onSaved }) {
  const [form, setForm] = useState({ category:'', title:'', doc_number:'', issue_date:'', expiry_date:'', issued_by:'', alert_days:'30', notes:'', is_renewable:false })
  const [file,    setFile]    = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')
  const fileRef = useRef()

  const DOC_TYPES_BY_LINKED = {
    EMPLOYEE:      ['IQAMA','PASSPORT','DRIVING_LICENSE','MEDICAL_INSURANCE','QIWA','SCE','GOSI_CERTIFICATE','EMPLOYMENT_CONTRACT','TRAINING_CERTIFICATE','NATIONAL_ID','WORK_PERMIT','OTHER'],
    COMPANY:       ['CR','VAT_CERTIFICATE','CHAMBER_OF_COMMERCE','MOI_LICENSE','GOSI_CERTIFICATE','SAUDIZATION','ISO_CERTIFICATE','ARAMCO_APPROVAL','SABIC_APPROVAL','OTHER'],
    VEHICLE:       ['ISTIMARA','INSPECTION','INSURANCE','LEASING_CONTRACT','OTHER'],
    CONTRACTOR:    ['CR','VAT_CERTIFICATE','NATIONAL_ADDRESS','GOSI_CERTIFICATE','SAUDIZATION','ISO_CERTIFICATE','VENDOR_APPROVAL','MOI_LICENSE','BANK_GUARANTEE','CONTRACT','OTHER'],
    SUBCONTRACTOR: ['CR','VAT_CERTIFICATE','GOSI_CERTIFICATE','PERFORMANCE_BOND','INSURANCE','CERTIFICATE','CONTRACT','OTHER'],
    SUPPLIER:      ['CR','VAT_CERTIFICATE','NATIONAL_ADDRESS','BANK_GUARANTEE','LICENSE','VENDOR_APPROVAL','OTHER'],
  }
  const types = DOC_TYPES_BY_LINKED[linkedType] || DOC_TYPES_BY_LINKED.COMPANY

  async function uploadFile() {
    if (!file) return {}
    const ext  = file.name.split('.').pop()
    const path = `${entityId}/docs/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('documents').upload(path, file, { upsert:true })
    if (error) throw new Error('File upload failed: ' + error.message)
    const { data: pub } = supabase.storage.from('documents').getPublicUrl(path)
    return { file_url: pub.publicUrl, file_name: file.name, file_type: ext.toUpperCase(), file_size_kb: Math.round(file.size / 1024) }
  }

  async function save() {
    if (!form.category) { setErr('Select a document type'); return }
    setSaving(true); setErr('')
    try {
      const fileData = await uploadFile()
      const row = {
        entity_id:    entityId,
        linked_type:  linkedType,
        linked_id:    linkedId,
        linked_name:  linkedName || '',
        category:     form.category,
        title:        CAT_LABELS[form.category] || form.category,
        doc_number:   form.doc_number   || null,
        issue_date:   form.issue_date   || null,
        expiry_date:  form.expiry_date  || null,
        issued_by:    form.issued_by    || null,
        alert_days:   parseInt(form.alert_days) || 30,
        notes:        form.notes        || null,
        is_renewable: form.is_renewable,
        status:       'ACTIVE',
        ...fileData,
      }
      const { error } = await supabase.from('documents').insert(row)
      if (error) throw new Error(error.message)
      onSaved()
    } catch(e) { setErr(e.message); setSaving(false) }
  }

  const inp = { width:'100%', padding:'8px 13px', borderRadius:18, border:`1px solid ${PRI}44`, background:'#fff', fontSize:13, fontFamily:PP, outline:'none', color:MAIN }

  return (
    <div onClick={e=>e.target===e.currentTarget&&onClose()} style={{ position:'fixed', inset:0, background:'rgba(10,20,30,0.55)', zIndex:1200, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'#fff', borderRadius:16, padding:24, width:'min(520px,95vw)', boxShadow:'0 8px 40px rgba(0,0,0,0.18)', fontFamily:PP }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <div style={{ fontWeight:700, fontSize:16, color:MAIN }}>Add Document</div>
          <div style={{ fontSize:12, color:SUB }}>{linkedName}</div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={{ fontSize:11, fontWeight:600, color:SUB, display:'block', marginBottom:4 }}>Document Type *</label>
            <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={{ ...inp, appearance:'none' }}>
              <option value=''>— select type —</option>
              {types.map(t=><option key={t} value={t}>{CAT_ICONS[t]} {CAT_LABELS[t]||t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:600, color:SUB, display:'block', marginBottom:4 }}>Document Number</label>
            <input style={inp} value={form.doc_number} onChange={e=>setForm(f=>({...f,doc_number:e.target.value}))} placeholder='Policy#, Iqama#, CR#…' />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:600, color:SUB, display:'block', marginBottom:4 }}>Issued by</label>
            <input style={inp} value={form.issued_by} onChange={e=>setForm(f=>({...f,issued_by:e.target.value}))} placeholder='MOI, GOSI, Insurer…' />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:600, color:SUB, display:'block', marginBottom:4 }}>Issue Date</label>
            <input type='date' style={inp} value={form.issue_date} onChange={e=>setForm(f=>({...f,issue_date:e.target.value}))} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:600, color:SUB, display:'block', marginBottom:4 }}>Expiry Date</label>
            <input type='date' style={inp} value={form.expiry_date} onChange={e=>setForm(f=>({...f,expiry_date:e.target.value}))} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:600, color:SUB, display:'block', marginBottom:4 }}>Alert before expiry (days)</label>
            <input type='number' style={inp} value={form.alert_days} onChange={e=>setForm(f=>({...f,alert_days:e.target.value}))} min={1} max={365} />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={{ fontSize:11, fontWeight:600, color:SUB, display:'block', marginBottom:4 }}>Notes</label>
            <textarea style={{ ...inp, borderRadius:10, resize:'vertical', minHeight:52 }} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} placeholder='Renewal contact, renewal fee, notes…' />
          </div>
          <div style={{ gridColumn:'1/-1', display:'flex', alignItems:'center', gap:8 }}>
            <label style={{ fontSize:11, fontWeight:600, color:SUB, display:'flex', alignItems:'center', gap:6, cursor:'pointer' }}>
              <input type='checkbox' checked={form.is_renewable} onChange={e=>setForm(f=>({...f,is_renewable:e.target.checked}))} />
              Renewable document
            </label>
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={{ fontSize:11, fontWeight:600, color:SUB, display:'block', marginBottom:6 }}>Attach File</label>
            <input ref={fileRef} type='file' accept='.pdf,.jpg,.jpeg,.png,.doc,.docx' onChange={e=>setFile(e.target.files[0]||null)} style={{ display:'none' }} />
            <button onClick={()=>fileRef.current.click()} style={{ padding:'8px 16px', borderRadius:18, border:`1px solid ${PRI}66`, background:'#fff', color:PRI, fontFamily:PP, fontSize:12, cursor:'pointer', fontWeight:600 }}>
              {file ? `📎 ${file.name}` : '📎 Choose file (PDF / image)'}
            </button>
          </div>
        </div>

        {err && <div style={{ marginTop:12, padding:'8px 14px', background:'#ffebee', color:'#c62828', borderRadius:8, fontSize:12 }}>{err}</div>}

        {/* Footer label — Document Type + Document Number */}
        {(form.category || form.doc_number) && (
          <div style={{ marginTop:14, borderTop:`1px solid ${SUB}30`, paddingTop:10, fontFamily:PP }}>
            <div style={{ fontSize:9, fontWeight:700, color:SUB, letterSpacing:1.4, textTransform:'uppercase', marginBottom:3 }}>For</div>
            {form.category && (
              <div style={{ fontSize:12, fontWeight:800, color:MAIN, lineHeight:1.3, wordBreak:'break-word' }}>
                {CAT_ICONS[form.category]} {CAT_LABELS[form.category] || form.category}
              </div>
            )}
            {form.doc_number && (
              <div style={{ fontSize:10, fontWeight:600, color:SUB, lineHeight:1.4, wordBreak:'break-word', marginTop:2, fontFamily:'monospace' }}>
                {form.doc_number}
              </div>
            )}
          </div>
        )}

        <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:18 }}>
          <button onClick={onClose} style={{ padding:'9px 18px', borderRadius:9, border:'1px solid #ddd', background:'#f5f5f5', color:'#666', fontFamily:PP, cursor:'pointer', fontSize:13 }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding:'9px 22px', borderRadius:9, border:'none', background:saving?'#ccc':`linear-gradient(135deg,${PRI},#b07828)`, color:'#fff', fontFamily:PP, cursor:saving?'default':'pointer', fontSize:13, fontWeight:700 }}>
            {saving ? 'Saving…' : 'Save Document'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Document card ────────────────────────────────────────────────────────
function DocCard({ doc, onDelete, onRefresh }) {
  const st  = getStatus(doc)
  const meta = STATUS_META[st]
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div style={{ background:'#fff', border:`1.5px solid ${st==='EXPIRED'?'#ffcdd2':st==='EXPIRING_SOON'?'#ffe0b2':'#e8f5e9'}`, borderRadius:12, padding:'12px 14px', position:'relative', transition:'box-shadow .15s' }}
      onMouseEnter={e=>e.currentTarget.style.boxShadow='0 2px 12px rgba(0,0,0,0.08)'}
      onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>

      {/* Header row */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:16 }}>{CAT_ICONS[doc.category]||'📄'}</span>
          <span style={{ fontSize:12, fontWeight:700, color:MAIN, fontFamily:PP }}>{CAT_LABELS[doc.category]||doc.category}</span>
        </div>
        <div style={{ position:'relative' }}>
          <button onClick={()=>setMenuOpen(m=>!m)} style={{ border:'none', background:'none', cursor:'pointer', fontSize:16, color:'#999', padding:'0 2px', lineHeight:1 }}>⋯</button>
          {menuOpen && (
            <div onClick={()=>setMenuOpen(false)} style={{ position:'absolute', right:0, top:'100%', background:'#fff', borderRadius:10, boxShadow:'0 4px 20px rgba(0,0,0,0.15)', padding:6, minWidth:140, zIndex:10 }}>
              {doc.file_url && (
                <a href={doc.file_url} target='_blank' rel='noreferrer' style={{ display:'block', padding:'7px 12px', fontSize:12, color:MAIN, textDecoration:'none', borderRadius:6 }}
                  onMouseEnter={e=>e.currentTarget.style.background='#f5f5f5'}
                  onMouseLeave={e=>e.currentTarget.style.background='none'}>
                  📥 View / Download
                </a>
              )}
              <button onClick={()=>{ setMenuOpen(false); if(window.confirm('Remove this document?')) onDelete(doc.id) }}
                style={{ display:'block', width:'100%', padding:'7px 12px', fontSize:12, color:'#c62828', background:'none', border:'none', cursor:'pointer', textAlign:'left', borderRadius:6 }}
                onMouseEnter={e=>e.currentTarget.style.background='#ffebee'}
                onMouseLeave={e=>e.currentTarget.style.background='none'}>
                🗑 Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Entity name */}
      <div style={{ fontSize:13, fontWeight:600, color:'#37474f', fontFamily:PP, marginBottom:4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
        {doc.linked_name || '—'}
      </div>

      {/* Doc number */}
      {doc.doc_number && (
        <div style={{ fontSize:11, color:SUB, fontFamily:'monospace', marginBottom:6 }}>{doc.doc_number}</div>
      )}

      {/* Expiry pill */}
      <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:meta.bg, color:meta.color, borderRadius:20, padding:'3px 9px', fontSize:11, fontWeight:700 }}>
        <div style={{ width:6, height:6, borderRadius:'50%', background:meta.dot }} />
        {expiryLabel(doc)}
      </div>

      {/* File badge */}
      {doc.file_name && (
        <div style={{ marginTop:6, fontSize:10, color:'#78909c', display:'flex', alignItems:'center', gap:4 }}>
          📎 <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:160 }}>{doc.file_name}</span>
        </div>
      )}

      {/* Notes */}
      {doc.notes && (
        <div style={{ marginTop:5, fontSize:10, color:SUB, fontStyle:'italic', lineHeight:1.4 }}>{doc.notes}</div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────
export default function DocumentValet({ entityId }) {
  const [tab,          setTab]          = useState('documents')     // 'documents' | 'expiry'
  const [selCategory,  setSelCategory]  = useState('EMPLOYEE')
  const [entities,     setEntities]     = useState([])              // list for sidebar
  const [selEntityId,  setSelEntityId]  = useState('ALL')           // 'ALL' or a UUID
  const [entitySearch, setEntitySearch] = useState('')
  const [docs,         setDocs]         = useState([])
  const [loading,      setLoading]      = useState(false)
  const [expiryDocs,   setExpiryDocs]   = useState([])
  const [addModal,     setAddModal]     = useState(null)            // null | { linkedId, linkedName }

  // ── Load entities for current category sidebar ─────────────────────────
  const loadEntities = useCallback(async () => {
    if (!entityId) return
    const tableMap = {
      EMPLOYEE:      { table:'employees',   id:'id', name:'full_name_en', filter:{ column:'entity_id', value:entityId } },
      COMPANY:       null,
      VEHICLE:       { table:'vehicles',    id:'id', name:'plate_number', filter:{ column:'entity_id', value:entityId } },
      CONTRACTOR:    { table:'contractors', id:'id', name:'name',         filter:{ column:'entity_id', value:entityId } },
      SUBCONTRACTOR: { table:'contractors', id:'id', name:'name',         filter:{ column:'entity_id', value:entityId } },
      SUPPLIER:      { table:'contractors', id:'id', name:'name',         filter:{ column:'entity_id', value:entityId } },
    }
    const cfg = tableMap[selCategory]
    if (!cfg) { setEntities([]); return }
    const { data } = await supabase.from(cfg.table).select(`${cfg.id},${cfg.name}`).eq(cfg.filter.column, cfg.filter.value).order(cfg.name)
    setEntities((data||[]).map(r=>({ id:r[cfg.id], name:r[cfg.name]||r[cfg.id] })))
  }, [entityId, selCategory])

  useEffect(() => { loadEntities() }, [loadEntities])

  // ── Load documents ──────────────────────────────────────────────────────
  const loadDocs = useCallback(async () => {
    if (!entityId) return
    setLoading(true)
    let q = supabase.from('documents')
      .select('id,title,category,doc_number,expiry_date,alert_days,status,file_url,file_name,issued_by,issue_date,is_renewable,linked_type,linked_id,linked_name,notes')
      .eq('entity_id', entityId)
      .eq('linked_type', selCategory)
    if (selEntityId !== 'ALL') q = q.eq('linked_id', selEntityId)
    const { data } = await q.order('expiry_date', { ascending:true, nullsFirst:false })
    setDocs(data||[])
    setLoading(false)
  }, [entityId, selCategory, selEntityId])

  useEffect(() => { loadDocs() }, [loadDocs])

  // ── Load ALL expiring docs for dashboard ────────────────────────────────
  const loadExpiryDocs = useCallback(async () => {
    if (!entityId || tab !== 'expiry') return
    const { data } = await supabase.from('documents')
      .select('id,title,category,doc_number,expiry_date,alert_days,linked_type,linked_id,linked_name,status,file_url')
      .eq('entity_id', entityId)
      .not('expiry_date', 'is', null)
      .order('expiry_date', { ascending:true })
    setExpiryDocs(data||[])
  }, [entityId, tab])

  useEffect(() => { loadExpiryDocs() }, [loadExpiryDocs])

  async function handleDelete(id) {
    await supabase.from('documents').delete().eq('id', id)
    loadDocs(); loadExpiryDocs()
  }

  // ── Group docs by category type ─────────────────────────────────────────
  const grouped = {}
  docs.forEach(d => {
    const k = d.category || 'OTHER'
    if (!grouped[k]) grouped[k] = []
    grouped[k].push(d)
  })

  // ── Expiry stats ────────────────────────────────────────────────────────
  const expiredCount      = expiryDocs.filter(d => getStatus(d) === 'EXPIRED').length
  const expiring30        = expiryDocs.filter(d => { const st=getStatus(d); return st==='EXPIRING_SOON'||st==='EXPIRED' }).length
  const expiring60        = expiryDocs.filter(d => { const n=daysUntil(d.expiry_date); return n!==null && n<=60 }).length
  const validCount        = expiryDocs.filter(d => getStatus(d) === 'ACTIVE').length

  // ── Category meta ───────────────────────────────────────────────────────
  const catMeta = CATEGORIES.find(c=>c.key===selCategory) || CATEGORIES[0]

  // ── Filtered entities sidebar ───────────────────────────────────────────
  const filteredEntities = entities.filter(e =>
    !entitySearch || e.name.toLowerCase().includes(entitySearch.toLowerCase())
  )

  // ── Expiry table rows sorted by urgency ─────────────────────────────────
  const sortedExpiry = [...expiryDocs].sort((a,b) => {
    const pa = STATUS_META[getStatus(a)]?.priority ?? 9
    const pb = STATUS_META[getStatus(b)]?.priority ?? 9
    if (pa !== pb) return pa - pb
    return new Date(a.expiry_date) - new Date(b.expiry_date)
  })

  // ── Styles ──────────────────────────────────────────────────────────────
  const S = {
    page:   { fontFamily:PP, background:L2, flex:1, minHeight:0, overflow:'hidden', display:'flex', flexDirection:'column' },
    body:   { display:'flex', flex:1, overflow:'hidden', minHeight:0 },
    sidebar:{ width:220, background:'#fff', borderRight:`1px solid ${L1}88`, display:'flex', flexDirection:'column', flexShrink:0, overflowY:'auto' },
    sbSec:  { fontSize:10, fontWeight:700, color:SUB, letterSpacing:1.2, textTransform:'uppercase', padding:'12px 14px 4px' },
    sbItem: (active,color) => ({ display:'flex', alignItems:'center', gap:9, padding:'8px 14px', cursor:'pointer', background:active?(color+'18'):'none', borderLeft:active?`3px solid ${color}`:'3px solid transparent', transition:'all .12s', borderRadius:'0 8px 8px 0', margin:'1px 6px 1px 0' }),
    main:   { flex:1, overflowY:'auto', padding:'0 28px 22px' },
    secHead:{ fontSize:10, fontWeight:800, color:L3, letterSpacing:1.4, textTransform:'uppercase', marginBottom:10, marginTop:4, paddingBottom:5, borderBottom:`1px solid ${L3}22`, display:'flex', alignItems:'center', gap:6 },
    kpiRow: { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 },
    kpiCard:(color) => ({ background:'#fff', border:`1px solid ${color}44`, borderRadius:12, padding:'14px 16px', textAlign:'center' }),
  }

  const selEntityName = selEntityId === 'ALL' ? 'All' : (entities.find(e=>e.id===selEntityId)?.name || selEntityId)

  // derived KPI values from current docs view
  const kpiExpired  = docs.filter(d => getStatus(d) === 'EXPIRED').length
  const kpiExpiring = docs.filter(d => getStatus(d) === 'EXPIRING_SOON').length
  const kpiValid    = docs.filter(d => getStatus(d) === 'ACTIVE').length

  return (
    <div className="dv-root" style={S.page}>
      <style>{`
        .dv-root button, .dv-root input, .dv-root select, .dv-root textarea {
          font-family: 'Poppins', sans-serif !important;
        }
      `}</style>

      {/* ══ UPPER ZONE ══ */}
      <div style={{ flexShrink:0, background:L2, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', zIndex:10 }}>

        {/* L1 bar */}
        <div style={{ padding:'6px 28px 0' }}>
          <div style={{ background:L1, padding:'8px 16px', borderRadius:'6px 6px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:MAIN, fontFamily:PP }}>🗂️ Document Valet</div>
              <div style={{ fontSize:10, color:SUB, opacity:0.85, marginTop:1, fontFamily:PP }}>Administration · Central document repository — all entities</div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {expiredCount > 0 && (
                <div style={{ background:'#c62828', color:'#fff', borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:700, cursor:'pointer' }}
                  onClick={()=>setTab('expiry')}>
                  🚨 {expiredCount} expired
                </div>
              )}
              <button
                onClick={() => {
                  if (selEntityId !== 'ALL') {
                    setAddModal({ linkedId: selEntityId, linkedName: selEntityName })
                  } else if (selCategory === 'COMPANY') {
                    setAddModal({ linkedId: entityId, linkedName: 'Company Documents' })
                  } else {
                    alert('Select a specific entity from the sidebar first, then click + to add a document.')
                  }
                }}
                style={{ padding:'7px 16px', borderRadius:7, border:'none', background:L3, color:'#fff', fontFamily:PP, fontSize:12, fontWeight:700, cursor:'pointer' }}>
                + Add Document
              </button>
            </div>
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ padding:'10px 28px 12px', background:L2, display:'flex', flexWrap:'wrap', gap:8 }}>
          {[
            { label:'Total Docs',    value: docs.length    },
            { label:'Expired',       value: kpiExpired     },
            { label:'Expiring Soon', value: kpiExpiring    },
            { label:'Valid',         value: kpiValid       },
          ].map((k, i) => (
            <div key={i} style={{ ...kpiCardGradient(i, L1, L2, L3), width:160, height:62, borderRadius:10, padding:'0 14px', flexShrink:0, boxShadow:'0 2px 8px rgba(0,0,0,0.10)', display:'flex', flexDirection:'column', justifyContent:'center' }}>
              <div style={{ fontSize:18, fontWeight:800, lineHeight:1 }}>{k.value}</div>
              <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, opacity:0.75, marginTop:4 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Tab bar */}
        <div style={{ padding:'0 28px', borderBottom:'2px solid #e8edf2', display:'flex', gap:0 }}>
          <button onClick={()=>setTab('documents')} style={{ padding:'9px 20px', border:'none', background:'none', cursor:'pointer', fontSize:13, fontWeight:tab==='documents'?700:500, color:tab==='documents'?L3:'#999', borderBottom:tab==='documents'?`2px solid ${L3}`:'2px solid transparent', fontFamily:PP, transition:'all .15s' }}>
            📁 Documents
          </button>
          <button onClick={()=>setTab('expiry')} style={{ padding:'9px 20px', border:'none', background:'none', cursor:'pointer', fontSize:13, fontWeight:tab==='expiry'?700:500, color:tab==='expiry'?L3:'#999', borderBottom:tab==='expiry'?`2px solid ${L3}`:'2px solid transparent', fontFamily:PP, transition:'all .15s' }}>
            ⏰ Expiry Dashboard
            {expiredCount > 0 && <span style={{ marginLeft:6, background:'#e53935', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:10, fontWeight:700 }}>{expiredCount}</span>}
          </button>
        </div>

      </div>{/* end upper zone */}

      <div style={S.body}>
        {/* Sidebar */}
        <div style={S.sidebar}>
          <div style={S.sbSec}>Category</div>
          {CATEGORIES.map(cat => (
            <div key={cat.key} style={S.sbItem(selCategory===cat.key, cat.color)}
              onClick={() => { setSelCategory(cat.key); setSelEntityId('ALL'); setEntitySearch('') }}>
              <span style={{ fontSize:15 }}>{cat.icon}</span>
              <span style={{ fontSize:12, fontWeight:selCategory===cat.key?700:500, color:selCategory===cat.key?cat.color:MAIN, fontFamily:PP }}>{cat.label}</span>
            </div>
          ))}

          {selCategory !== 'COMPANY' && (
            <>
              <div style={S.sbSec}>Filter by entity</div>
              <div style={{ padding:'4px 10px 6px' }}>
                <input
                  value={entitySearch}
                  onChange={e=>setEntitySearch(e.target.value)}
                  placeholder={`Search ${catMeta.label.toLowerCase()}…`}
                  style={{ width:'100%', padding:'6px 10px', borderRadius:14, border:`1px solid ${L3}44`, fontSize:12, fontFamily:PP, outline:'none', color:MAIN }}
                />
              </div>
              <div style={S.sbItem(selEntityId==='ALL', catMeta.color)} onClick={()=>setSelEntityId('ALL')}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:catMeta.color, flexShrink:0 }} />
                <span style={{ fontSize:12, fontWeight:selEntityId==='ALL'?700:500, color:selEntityId==='ALL'?catMeta.color:MAIN }}>All {catMeta.label}s</span>
              </div>
              {filteredEntities.map(ent => (
                <div key={ent.id} style={S.sbItem(selEntityId===ent.id, catMeta.color)} onClick={()=>setSelEntityId(ent.id)}>
                  <div style={{ width:7, height:7, borderRadius:'50%', background:selEntityId===ent.id?catMeta.color:'#ccc', flexShrink:0 }} />
                  <span style={{ fontSize:12, fontWeight:selEntityId===ent.id?700:400, color:selEntityId===ent.id?catMeta.color:SUB, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{ent.name}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Main content */}
        <div style={S.main}>

          {/* ── DOCUMENTS TAB ── */}
          {tab === 'documents' && (
            <>
              {/* Context header */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:catMeta.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{catMeta.icon}</div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15, color:MAIN, fontFamily:PP }}>{catMeta.label} documents</div>
                    <div style={{ fontSize:11, color:SUB }}>{selEntityId==='ALL'?'All entities':selEntityName} · {docs.length} records</div>
                  </div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  {docs.filter(d=>getStatus(d)==='EXPIRED').length > 0 && (
                    <span style={{ background:'#ffebee', color:'#c62828', borderRadius:14, padding:'3px 10px', fontSize:11, fontWeight:700 }}>
                      🔴 {docs.filter(d=>getStatus(d)==='EXPIRED').length} expired
                    </span>
                  )}
                  {docs.filter(d=>getStatus(d)==='EXPIRING_SOON').length > 0 && (
                    <span style={{ background:'#fff8e1', color:'#f57f17', borderRadius:14, padding:'3px 10px', fontSize:11, fontWeight:700 }}>
                      🟡 {docs.filter(d=>getStatus(d)==='EXPIRING_SOON').length} expiring
                    </span>
                  )}
                </div>
              </div>

              {loading && <div style={{ color:SUB, fontSize:13, padding:20, textAlign:'center' }}>Loading documents…</div>}

              {!loading && docs.length === 0 && (
                <div style={{ textAlign:'center', padding:'60px 20px', color:SUB }}>
                  <div style={{ fontSize:40, marginBottom:10 }}>📂</div>
                  <div style={{ fontSize:15, fontWeight:600, color:MAIN, marginBottom:6 }}>No documents yet</div>
                  <div style={{ fontSize:12 }}>Select a specific entity from the sidebar and click "+ Add Document"</div>
                </div>
              )}

              {!loading && Object.entries(grouped).map(([cat, catDocs]) => (
                <div key={cat} style={{ marginBottom:22 }}>
                  <div style={S.secHead}>
                    <span>{CAT_ICONS[cat]||'📄'}</span>
                    <span>{CAT_LABELS[cat]||cat}</span>
                    <span style={{ marginLeft:'auto', fontSize:10, color:SUB, fontWeight:500 }}>{catDocs.length} records</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:10 }}>
                    {catDocs.map(doc => (
                      <DocCard key={doc.id} doc={doc} onDelete={handleDelete} onRefresh={loadDocs} />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── EXPIRY DASHBOARD TAB ── */}
          {tab === 'expiry' && (
            <>
              {/* KPI row */}
              <div style={S.kpiRow}>
                <div style={S.kpiCard('#e53935')}>
                  <div style={{ fontSize:30, fontWeight:700, color:'#c62828', fontFamily:PP }}>{expiredCount}</div>
                  <div style={{ fontSize:11, color:SUB, marginTop:3 }}>Expired</div>
                </div>
                <div style={S.kpiCard('#ffa726')}>
                  <div style={{ fontSize:30, fontWeight:700, color:'#f57f17', fontFamily:PP }}>{expiring30 - expiredCount}</div>
                  <div style={{ fontSize:11, color:SUB, marginTop:3 }}>Expiring ≤ 30 days</div>
                </div>
                <div style={S.kpiCard('#ffd54f')}>
                  <div style={{ fontSize:30, fontWeight:700, color:'#e65100', fontFamily:PP }}>{expiring60 - expiring30}</div>
                  <div style={{ fontSize:11, color:SUB, marginTop:3 }}>Expiring 31–60 days</div>
                </div>
                <div style={S.kpiCard('#43a047')}>
                  <div style={{ fontSize:30, fontWeight:700, color:'#2e7d32', fontFamily:PP }}>{validCount}</div>
                  <div style={{ fontSize:11, color:SUB, marginTop:3 }}>Valid documents</div>
                </div>
              </div>

              {/* Expiry table */}
              <div style={{ background:'#fff', borderRadius:'0 0 8px 8px', boxShadow:'0 2px 8px rgba(0,0,0,0.08)', overflow:'hidden' }}>
                {/* Table header */}
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 1fr 90px', padding:'9px 16px', background:L3, fontSize:10, fontWeight:700, color:'#fff', letterSpacing:.8, textTransform:'uppercase' }}>
                  <span>Entity</span>
                  <span>Document type</span>
                  <span>Category</span>
                  <span>Expiry date</span>
                  <span>Status</span>
                </div>

                {sortedExpiry.length === 0 && (
                  <div style={{ padding:40, textAlign:'center', color:SUB, fontSize:13 }}>
                    No documents with expiry dates found.
                  </div>
                )}

                {sortedExpiry.map(doc => {
                  const st   = getStatus(doc)
                  const meta = STATUS_META[st]
                  const catInfo = CATEGORIES.find(c=>c.key===doc.linked_type)
                  return (
                    <div key={doc.id} style={{ display:'grid', gridTemplateColumns:'2fr 1.5fr 1fr 1fr 90px', padding:'10px 16px', borderBottom:`1px solid #f5f5f5`, alignItems:'center', background:st==='EXPIRED'?'#fff8f8':st==='EXPIRING_SOON'?'#fffdf6':'#fff', transition:'background .1s' }}>
                      <div style={{ fontWeight:600, fontSize:13, color:MAIN, fontFamily:PP, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                        {doc.linked_name || '—'}
                        {doc.doc_number && <span style={{ marginLeft:6, fontSize:10, color:SUB, fontFamily:'monospace' }}>{doc.doc_number}</span>}
                      </div>
                      <div style={{ fontSize:12, color:SUB, display:'flex', alignItems:'center', gap:5 }}>
                        <span>{CAT_ICONS[doc.category]||'📄'}</span>
                        <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{CAT_LABELS[doc.category]||doc.category}</span>
                      </div>
                      <div>
                        {catInfo && (
                          <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:catInfo.light, color:catInfo.color }}>
                            {catInfo.icon} {catInfo.label}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:12, color:MAIN }}>{fmtDate(doc.expiry_date)}</div>
                      <div>
                        <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:14, background:meta.bg, color:meta.color }}>
                          {expiryLabel(doc)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Add document modal */}
      {addModal && (
        <AddDocModal
          entityId={entityId}
          linkedType={selCategory}
          linkedId={addModal.linkedId}
          linkedName={addModal.linkedName}
          onClose={() => setAddModal(null)}
          onSaved={() => { setAddModal(null); loadDocs(); loadExpiryDocs() }}
        />
      )}
    </div>
  )
}
