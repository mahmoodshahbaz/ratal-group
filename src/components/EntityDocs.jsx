/**
 * EntityDocs.jsx — Mini document panel for any record
 *
 * Shows all documents linked to a specific record (employee, contractor,
 * vehicle, project) via linked_type + linked_id.
 *
 * Usage:
 *   <EntityDocs
 *     entityId={entityId}          // Supabase entity UUID
 *     linkedType="EMPLOYEE"        // LINK_TYPES value
 *     linkedId={emp.id}            // UUID of the linked record
 *     linkedName={emp.full_name_en}// Display name (pre-fills new doc form)
 *     accentColor="#8C601B"        // Optional — defaults to Administration purple
 *   />
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// Context-aware document types by linked_type
const DOC_CATEGORIES = {
  EMPLOYEE:      ['IQAMA','DRIVING_LICENSE','PASSPORT','NATIONAL_ID','QIWA','SCE','MEDICAL_INSURANCE','WORK_PERMIT','EMPLOYMENT_CONTRACT','SALARY_CERTIFICATE','TRAINING_CERTIFICATE','GOSI_CERTIFICATE','OTHER'],
  CONTRACTOR:    ['CR','VAT_CERTIFICATE','CHAMBER_OF_COMMERCE','GOSI_CERTIFICATE','SAUDIZATION','ISO_CERTIFICATE','VENDOR_APPROVAL','MOI_LICENSE','CONTRACT','MOU','BANK_GUARANTEE','INSURANCE','OTHER'],
  SUBCONTRACTOR: ['IQAMA','DRIVING_LICENSE','PASSPORT','NATIONAL_ID','QIWA','SCE','MEDICAL_INSURANCE','CR','VAT_CERTIFICATE','CHAMBER_OF_COMMERCE','GOSI_CERTIFICATE','SAUDIZATION','VENDOR_APPROVAL','MOI_LICENSE','CONTRACT','PERFORMANCE_BOND','INSURANCE','OTHER'],
  VEHICLE:       ['ISTIMARA','INSURANCE','INSPECTION','DRIVING_LICENSE','LEASING_CONTRACT','OTHER'],
  PROJECT:       ['CONTRACT','MOU','PURCHASE_ORDER','BANK_GUARANTEE','INSURANCE','COMPLETION_CERTIFICATE','HANDOVER_CERTIFICATE','VARIATION_ORDER','OTHER'],
  COMPANY:       ['CR','VAT_CERTIFICATE','CHAMBER_OF_COMMERCE','GOSI_CERTIFICATE','SAUDIZATION','MOI_LICENSE','ARAMCO_APPROVAL','SABIC_APPROVAL','ISO_CERTIFICATE','OTHER'],
  OTHER:         ['CONTRACT','CERTIFICATE','LICENSE','INVOICE','LEGAL','OTHER'],
}
function getCats(t) { return DOC_CATEGORIES[t] || DOC_CATEGORIES.OTHER }

const CAT_LABELS = {
  IQAMA:'🪪 Iqama', DRIVING_LICENSE:'🚗 Driving Licence', PASSPORT:'✈️ Passport',
  NATIONAL_ID:'🪪 National ID', QIWA:'💼 QIWA', SCE:'🏗️ SCE Certificate',
  MEDICAL_INSURANCE:'🏥 Medical Insurance', WORK_PERMIT:'📋 Work Permit',
  EMPLOYMENT_CONTRACT:'📄 Employment Contract', SALARY_CERTIFICATE:'💰 Salary Certificate',
  TRAINING_CERTIFICATE:'🏅 Training Certificate', GOSI_CERTIFICATE:'🛡️ GOSI Certificate',
  CR:'🏢 CR (Commercial Registration)', VAT_CERTIFICATE:'💹 VAT Certificate',
  CHAMBER_OF_COMMERCE:'🏛️ Chamber of Commerce', SAUDIZATION:'🇸🇦 Saudization / Nitaqat',
  ISO_CERTIFICATE:'✅ ISO Certificate', VENDOR_APPROVAL:'👍 Vendor / Client Approval',
  MOI_LICENSE:'⚖️ MOI License', BANK_GUARANTEE:'🏦 Bank Guarantee',
  ARAMCO_APPROVAL:'⛽ Aramco Approval', SABIC_APPROVAL:'🧪 SABIC Approval',
  PERFORMANCE_BOND:'📑 Performance Bond', ISTIMARA:'🚘 Istimara (Registration)',
  INSPECTION:'🔍 Inspection / Fahas', LEASING_CONTRACT:'🔑 Leasing Contract',
  PURCHASE_ORDER:'📦 Purchase Order', COMPLETION_CERTIFICATE:'✔️ Completion Certificate',
  HANDOVER_CERTIFICATE:'🤝 Handover Certificate', VARIATION_ORDER:'🔄 Variation Order',
  MOU:'🤝 MOU', CONTRACT:'📄 Contract', CERTIFICATE:'🏅 Certificate',
  LICENSE:'🪪 License', INVOICE:'🧾 Invoice', LEGAL:'⚖️ Legal', INSURANCE:'🛡️ Insurance', OTHER:'📁 Other',
}

const CAT_ICONS = {
  IQAMA:'🪪', DRIVING_LICENSE:'🚗', PASSPORT:'✈️', NATIONAL_ID:'🪪',
  QIWA:'💼', SCE:'🏗️', MEDICAL_INSURANCE:'🏥', WORK_PERMIT:'📋',
  EMPLOYMENT_CONTRACT:'📄', SALARY_CERTIFICATE:'💰', TRAINING_CERTIFICATE:'🏅',
  CR:'🏢', VAT_CERTIFICATE:'💹', CHAMBER_OF_COMMERCE:'🏛️',
  GOSI_CERTIFICATE:'🛡️', SAUDIZATION:'🇸🇦', ISO_CERTIFICATE:'✅',
  VENDOR_APPROVAL:'👍', MOI_LICENSE:'⚖️', BANK_GUARANTEE:'🏦',
  ARAMCO_APPROVAL:'⛽', SABIC_APPROVAL:'🧪', PERFORMANCE_BOND:'📑',
  ISTIMARA:'🚘', INSPECTION:'🔍', LEASING_CONTRACT:'🔑',
  PURCHASE_ORDER:'📦', COMPLETION_CERTIFICATE:'✔️', HANDOVER_CERTIFICATE:'🤝',
  VARIATION_ORDER:'🔄', MOU:'🤝', CONTRACT:'📄', CERTIFICATE:'🏅',
  LICENSE:'🪪', INVOICE:'🧾', LEGAL:'⚖️', INSURANCE:'🛡️', OTHER:'📁',
}

const STATUS_COLORS = {
  ACTIVE:        { bg:'#e8f5e9', color:'#2e7d32', dot:'#388e3c' },
  EXPIRING_SOON: { bg:'#fff8e1', color:'#f57f17', dot:'#ffa726' },
  EXPIRED:       { bg:'#ffebee', color:'#c62828', dot:'#e53935' },
  RENEWED:       { bg:'#e3f2fd', color:'#1565C0', dot:'#1976d2' },
  CANCELLED:     { bg:'#f5f5f5', color:'#757575', dot:'#bdbdbd' },
}

function daysUntilExpiry(expiry_date) {
  if (!expiry_date) return null
  return Math.ceil((new Date(expiry_date) - new Date()) / 86400000)
}

function computeStatus(doc) {
  if (!doc.expiry_date) return doc.status || 'ACTIVE'
  const days = daysUntilExpiry(doc.expiry_date)
  if (days < 0) return 'EXPIRED'
  if (days <= (doc.alert_days || 30)) return 'EXPIRING_SOON'
  return ['EXPIRED','RENEWED','CANCELLED'].includes(doc.status) ? doc.status : 'ACTIVE'
}

const fmtD = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'

// (categories are now context-aware via getCats(linkedType) — see QuickAddModal)

// ── Mini Add-Doc modal ────────────────────────────────────────────
function QuickAddModal({ entityId, linkedType, linkedId, linkedName, accentColor, onClose, onSaved }) {
  const PRI = accentColor || '#454D9B'
  const defaultCat = getCats(linkedType)[0] || 'OTHER'
  const [form, setForm] = useState({
    title:'', category:defaultCat, doc_number:'', issue_date:'', expiry_date:'',
    alert_days:30, issued_by:'', is_renewable:false, notes:'', status:'ACTIVE',
  })
  const [file,     setFile]     = useState(null)
  const [uploading,setUploading]= useState(false)
  const [saving,   setSaving]   = useState(false)
  const [err,      setErr]      = useState('')

  const setF = (k,v) => setForm(f=>({...f,[k]:v}))

  async function save() {
    if (!form.title) { setErr('Title is required'); return }
    setSaving(true); setErr('')
    let fileData = {}
    if (file) {
      setUploading(true)
      const path = `${entityId}/${Date.now()}_${file.name}`
      const { error:upErr } = await supabase.storage.from('documents').upload(path, file, { upsert:true })
      setUploading(false)
      if (upErr) { setErr('Upload failed: '+upErr.message); setSaving(false); return }
      const { data:{ publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
      fileData = { file_url:publicUrl, file_name:file.name, file_type:file.name.split('.').pop().toUpperCase(), file_size_kb:Math.round(file.size/1024) }
    }
    const { error } = await supabase.from('documents').insert({
      entity_id:   entityId,
      title:       form.title,
      category:    form.category,
      doc_number:  form.doc_number || null,
      issue_date:  form.issue_date  || null,
      expiry_date: form.expiry_date || null,
      alert_days:  +form.alert_days || 30,
      issued_by:   form.issued_by   || null,
      is_renewable:form.is_renewable,
      status:      form.status,
      notes:       form.notes       || null,
      linked_type: linkedType,
      linked_id:   linkedId,
      linked_name: linkedName,
      ...fileData,
    })
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved()
  }

  const inp = { padding:'8px 10px', borderRadius:7, border:'1.5px solid #dde3ec', fontSize:12, outline:'none', width:'100%', boxSizing:'border-box', fontFamily:"'Poppins',sans-serif" }
  const lbl = { display:'block', fontSize:10, fontWeight:700, color:'#6b7c93', marginBottom:3, textTransform:'uppercase', letterSpacing:0.5 }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:16, padding:'24px 26px', width:'100%', maxWidth:480, boxShadow:'0 24px 60px rgba(0,0,0,0.3)', fontFamily:"'Poppins',sans-serif" }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:PRI, textTransform:'uppercase', letterSpacing:1 }}>Add Document</div>
            <div style={{ fontSize:14, fontWeight:800, color:'#1a2e3d' }}>📎 Link to {linkedName}</div>
          </div>
          <button onClick={onClose} style={{ background:'transparent', border:'none', fontSize:20, cursor:'pointer', color:'#aab2bd' }}>✕</button>
        </div>

        {/* Title + Category */}
        <div style={{ marginBottom:12 }}>
          <label style={lbl}>Document Title *</label>
          <input style={inp} value={form.title} onChange={e=>setF('title',e.target.value)} placeholder="e.g. IQAMA — Ahmed Al-Zahrani" />
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
          <div>
            <label style={lbl}>Document Type</label>
            <select style={inp} value={form.category} onChange={e=>setF('category',e.target.value)}>
              {getCats(linkedType).map(c=><option key={c} value={c}>{CAT_LABELS[c]||c.replace(/_/g,' ')}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Doc Number / Ref</label>
            <input style={inp} value={form.doc_number} onChange={e=>setF('doc_number',e.target.value)} placeholder="Iqama no., license no." />
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
          <div>
            <label style={lbl}>Issue Date</label>
            <input type="date" style={inp} value={form.issue_date} onChange={e=>setF('issue_date',e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Expiry Date</label>
            <input type="date" style={inp} value={form.expiry_date} onChange={e=>setF('expiry_date',e.target.value)} />
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
          <div>
            <label style={lbl}>Issued By</label>
            <input style={inp} value={form.issued_by} onChange={e=>setF('issued_by',e.target.value)} placeholder="MOI, GAZT, QIWA…" />
          </div>
          <div>
            <label style={lbl}>Alert (days before expiry)</label>
            <input type="number" style={inp} value={form.alert_days} min={1} onChange={e=>setF('alert_days',e.target.value)} />
          </div>
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={lbl}>File Attachment</label>
          <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e=>setFile(e.target.files[0])} style={{ ...inp, padding:'5px' }} />
          {file && <div style={{ fontSize:11, color:'#546e7a', marginTop:3 }}>📎 {file.name} ({Math.round(file.size/1024)} KB)</div>}
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, cursor:'pointer', marginBottom:14 }}>
          <input type="checkbox" checked={form.is_renewable} onChange={e=>setF('is_renewable',e.target.checked)} />
          Document is renewable
        </label>

        {err && <div style={{ color:'#c62828', fontSize:12, marginBottom:10 }}>{err}</div>}

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ background:'#f0f4f8', color:'#546e7a', border:'none', borderRadius:8, padding:'9px 20px', fontSize:12, fontWeight:700, cursor:'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving||uploading} style={{ background:PRI, color:'#fff', border:'none', borderRadius:8, padding:'9px 24px', fontSize:12, fontWeight:700, cursor:'pointer', opacity:saving?.6:1 }}>
            {saving ? 'Saving…' : uploading ? 'Uploading…' : '💾 Save Document'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main export — EntityDocs panel
// ═══════════════════════════════════════════════════════════════════
export default function EntityDocs({ entityId, linkedType, linkedId, linkedName, accentColor }) {
  const PRI = accentColor || '#454D9B'
  const [docs,    setDocs]    = useState([])
  const [loading, setLoading] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const load = useCallback(async () => {
    if (!entityId || !linkedId) return
    setLoading(true)
    const { data } = await supabase
      .from('documents')
      .select('id,title,category,doc_number,expiry_date,alert_days,status,file_url,file_name,issued_by,issue_date,is_renewable')
      .eq('entity_id', entityId)
      .eq('linked_id', linkedId)
      .order('expiry_date', { ascending: true, nullsFirst: false })
    setDocs(data || [])
    setLoading(false)
  }, [entityId, linkedId])

  useEffect(() => { load() }, [load])

  async function handleDelete(id) {
    if (!window.confirm('Remove this document link?')) return
    await supabase.from('documents').delete().eq('id', id)
    load()
  }

  const expiring = docs.filter(d => computeStatus(d) === 'EXPIRING_SOON').length
  const expired  = docs.filter(d => computeStatus(d) === 'EXPIRED').length

  return (
    <div style={{ fontFamily:"'Poppins',sans-serif" }}>
      {/* Header row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:15, fontWeight:800, color:'#1a2e3d' }}>📎 Documents</span>
          <span style={{ background:`${PRI}18`, color:PRI, borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:700 }}>{docs.length}</span>
          {expiring > 0 && <span style={{ background:'#fff8e1', color:'#f57f17', borderRadius:20, padding:'2px 9px', fontSize:10, fontWeight:700 }}>⏳ {expiring} expiring</span>}
          {expired  > 0 && <span style={{ background:'#ffebee', color:'#c62828', borderRadius:20, padding:'2px 9px', fontSize:10, fontWeight:700 }}>❌ {expired} expired</span>}
        </div>
        <button
          onClick={() => setAddOpen(true)}
          style={{ background:PRI, color:'#fff', border:'none', borderRadius:7, padding:'6px 14px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
          + Add Document
        </button>
      </div>

      {/* Loading */}
      {loading && <div style={{ fontSize:12, color:'#aab2bd', padding:'8px 0' }}>Loading documents…</div>}

      {/* Empty */}
      {!loading && docs.length === 0 && (
        <div style={{ fontSize:12, color:'#aab2bd', padding:'12px 16px', background:'#f7f9fc', borderRadius:8, border:'1px dashed #d0d8e4' }}>
          No documents attached yet. Click <strong>+ Add Document</strong> to link an IQAMA, licence, certificate, or contract.
        </div>
      )}

      {/* Document rows */}
      {docs.map(doc => {
        const st  = computeStatus(doc)
        const sc  = STATUS_COLORS[st] || STATUS_COLORS.ACTIVE
        const days = daysUntilExpiry(doc.expiry_date)
        return (
          <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', background:'#fff', borderRadius:9, marginBottom:6, border:`1px solid ${sc.dot}44`, borderLeft:`3px solid ${sc.dot}` }}>
            <span style={{ fontSize:18, flexShrink:0 }}>{CAT_ICONS[doc.category]||'📁'}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#1a2e3d', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{doc.title}</div>
              <div style={{ fontSize:10, color:'#6b7c93', display:'flex', gap:10, flexWrap:'wrap', marginTop:2 }}>
                {doc.doc_number && <span>📌 {doc.doc_number}</span>}
                {doc.issued_by  && <span>🏛 {doc.issued_by}</span>}
                {doc.issue_date && <span>From: {fmtD(doc.issue_date)}</span>}
              </div>
            </div>
            <div style={{ flexShrink:0, textAlign:'right' }}>
              {doc.expiry_date && (
                <div style={{ fontSize:10, fontWeight:700, color:sc.color, background:sc.bg, borderRadius:20, padding:'2px 8px', marginBottom:3 }}>
                  {days === null ? '—' :
                   days < 0 ? `Expired ${Math.abs(days)}d ago` :
                   days <= 30 ? `${days}d left` :
                   fmtD(doc.expiry_date)}
                </div>
              )}
              <div style={{ display:'flex', gap:4, justifyContent:'flex-end' }}>
                {doc.file_url && (
                  <a href={doc.file_url} target="_blank" rel="noreferrer"
                    style={{ fontSize:10, color:PRI, textDecoration:'none', background:`${PRI}14`, borderRadius:5, padding:'2px 7px', fontWeight:600 }}>
                    📎 View
                  </a>
                )}
                <button onClick={()=>handleDelete(doc.id)}
                  style={{ fontSize:10, color:'#c62828', background:'#fce4ec', border:'none', borderRadius:5, padding:'2px 7px', cursor:'pointer', fontWeight:600 }}>
                  ✕
                </button>
              </div>
            </div>
          </div>
        )
      })}

      {/* Quick-add modal */}
      {addOpen && (
        <QuickAddModal
          entityId={entityId}
          linkedType={linkedType}
          linkedId={linkedId}
          linkedName={linkedName}
          accentColor={PRI}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); load() }}
        />
      )}
    </div>
  )
}
