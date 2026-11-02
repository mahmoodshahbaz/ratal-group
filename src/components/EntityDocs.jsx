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

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { CHAPTER_PALETTES, FORM } from '../styles/appStyles'

const PP = "'Poppins', sans-serif"
const MAIN = '#172D37'
const SUB  = '#53666F'

function darken(hex, amount = 0.18) {
  const n = parseInt((hex || '#70A5A6').replace('#', ''), 16)
  const r = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - amount)))
  const g = Math.max(0, Math.round(((n >>  8) & 0xff) * (1 - amount)))
  const b = Math.max(0, Math.round(( n        & 0xff) * (1 - amount)))
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
}

// Context-aware document types by linked_type
const DOC_CATEGORIES = {
  EMPLOYEE:      ['IQAMA','DRIVING_LICENSE','PASSPORT','NATIONAL_ID','QIWA','SCE','MEDICAL_INSURANCE','WORK_PERMIT','EMPLOYMENT_CONTRACT','SALARY_CERTIFICATE','TRAINING_CERTIFICATE','GOSI_CERTIFICATE','OTHER'],
  CONTRACTOR:    ['CR','VAT_CERTIFICATE','NATIONAL_ADDRESS','CHAMBER_OF_COMMERCE','GOSI_CERTIFICATE','SAUDIZATION','ISO_CERTIFICATE','VENDOR_APPROVAL','MOI_LICENSE','CONTRACT','MOU','BANK_GUARANTEE','INSURANCE','OTHER'],
  SUBCONTRACTOR: ['IQAMA','DRIVING_LICENSE','PASSPORT','NATIONAL_ID','QIWA','SCE','MEDICAL_INSURANCE','CR','VAT_CERTIFICATE','NATIONAL_ADDRESS','CHAMBER_OF_COMMERCE','GOSI_CERTIFICATE','SAUDIZATION','VENDOR_APPROVAL','MOI_LICENSE','CONTRACT','PERFORMANCE_BOND','INSURANCE','OTHER'],
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
  NATIONAL_ADDRESS:'📍 National Address Certificate',
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
  CR:'🏢', VAT_CERTIFICATE:'💹', NATIONAL_ADDRESS:'📍', CHAMBER_OF_COMMERCE:'🏛️',
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

// ── Section-based document modal — one card per doc type ──────────
// Helper: check if a section has any data worth saving
function sectionHasData(s) {
  return !!(s && (s.doc_number || s.issue_date || s.expiry_date || s.issued_by || s.file))
}

function QuickAddModal({ entityId, linkedType, linkedId, linkedName, chapterName, onClose, onSaved }) {
  const pal  = CHAPTER_PALETTES[chapterName] || CHAPTER_PALETTES.Masters
  const { L1, L2, L3 } = pal
  const cats = getCats(linkedType)

  // State: one entry per category key
  // sections[cat] = { doc_number, issue_date, expiry_date, issued_by, alert_days, is_renewable, file }
  const [sections,  setSections]  = useState({})
  const [saving,    setSaving]    = useState(false)
  const [err,       setErr]       = useState('')
  const [activeCat, setActiveCat] = useState(cats[0] || '')
  const sectionRefs = useRef({})
  const scrollBodyRef = useRef(null)

  const setS = (cat, k, v) => setSections(s => ({ ...s, [cat]: { ...(s[cat]||{ alert_days:30, is_renewable:false }), [k]:v } }))
  const getS = (cat, k, def='') => sections[cat]?.[k] ?? def

  const filled = cats.filter(c => sectionHasData(sections[c]))

  function jumpTo(cat) {
    setActiveCat(cat)
    const el = sectionRefs.current[cat]
    const body = scrollBodyRef.current
    if (el && body) {
      body.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' })
    }
  }

  const inp = (ex={}) => ({
    width:'100%', padding:'7px 12px', borderRadius:16,
    border:`1px solid ${L3}44`, fontSize:12, color:'#172D37',
    background:'#fdfcf9', outline:'none', fontFamily:PP,
    boxSizing:'border-box', ...ex,
  })
  const lbl = { display:'block', fontSize:10, fontWeight:600, color:SUB, marginBottom:3 }

  async function uploadFile(f) {
    if (!f) return {}
    const path = `${entityId}/${Date.now()}_${f.name}`
    const { error } = await supabase.storage.from('documents').upload(path, f, { upsert:true })
    if (error) throw new Error('Upload failed: ' + error.message)
    const { data:{ publicUrl } } = supabase.storage.from('documents').getPublicUrl(path)
    return { file_url:publicUrl, file_name:f.name, file_type:f.name.split('.').pop().toUpperCase(), file_size_kb:Math.round(f.size/1024) }
  }

  async function saveAll() {
    if (filled.length === 0) { setErr('Fill in at least one document section before saving'); return }
    setSaving(true); setErr('')
    try {
      const rows = await Promise.all(filled.map(async cat => {
        const s = sections[cat]
        const fileData = await uploadFile(s.file)
        return {
          entity_id:    entityId,
          title:        CAT_LABELS[cat] || cat,   // category IS the title
          category:     cat,
          doc_number:   s.doc_number  || null,
          issue_date:   s.issue_date  || null,
          expiry_date:  s.expiry_date || null,
          alert_days:   +(s.alert_days||30),
          issued_by:    s.issued_by   || null,
          is_renewable: !!s.is_renewable,
          status:       'ACTIVE',
          linked_type:  linkedType,
          linked_id:    linkedId,
          linked_name:  linkedName,
          ...fileData,
        }
      }))
      const { error } = await supabase.from('documents').insert(rows)
      if (error) throw new Error(error.message)
      onSaved()
    } catch(e) {
      setErr(e.message)
      setSaving(false)
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position:'fixed', inset:0, background:'rgba(10,20,30,0.55)',
        backdropFilter:'blur(4px)', zIndex:1100,
        display:'flex', alignItems:'center', justifyContent:'center',
        fontFamily:PP,
      }}
    >
      {/* L1 OUTER FRAME */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background:L1, borderRadius:4, padding:12,
          border:`3px solid ${darken(L1)}`,
          width:`min(${FORM.WIDTH}px, 97vw)`,
          height:'min(90vh, 680px)',
          display:'flex', flexDirection:'column',
          boxShadow:'0 28px 80px rgba(0,0,0,0.35)',
        }}
      >
        {/* L2 INNER AREA */}
        <div style={{
          background:L2, borderRadius:0,
          display:'flex', flexDirection:'row',
          position:'relative', overflow:'hidden',
          flex:1, minHeight:0,
        }}>

          {/* L3 ACCENT BLOCK */}
          <div style={{
            position:'absolute', top:0, right:0,
            width:FORM.ACCENT_W, height:FORM.ACCENT_H,
            background:L3, borderRadius:'0 0 0 90px',
            zIndex:0, pointerEvents:'none',
          }} />

          {/* SIDEBAR */}
          <div style={{
            width:FORM.SIDEBAR_WIDTH, flexShrink:0,
            padding:'14px 14px 18px 14px',
            display:'flex', flexDirection:'column',
            zIndex:1, position:'relative',
          }}>
            <div style={{ fontSize:14, fontWeight:800, color:MAIN, whiteSpace:'nowrap', lineHeight:1.2, marginBottom:4, fontFamily:PP }}>
              Ratal Advanced Technologies
            </div>
            <div style={{ fontSize:9, fontWeight:800, color:L3, letterSpacing:2.2, textTransform:'uppercase', marginTop:4, marginBottom:16, fontFamily:PP }}>
              {chapterName || 'Masters'}
            </div>
            <div style={{ marginBottom:14, fontFamily:PP }}>
              <div style={{ fontSize:13, fontWeight:900, color:MAIN, textTransform:'uppercase', letterSpacing:'0.3px', lineHeight:1.25 }}>ATTACH</div>
              <div style={{ fontSize:26, fontWeight:900, color:L3, textTransform:'uppercase', letterSpacing:'-0.5px', lineHeight:1.05 }}>DOCUMENTS</div>
            </div>
            <div style={{ height:1, background:`${L3}30`, marginBottom:12 }} />
            <div style={{ fontSize:10, color:SUB, lineHeight:1.65, marginBottom:16, fontFamily:PP }}>
              Fill in the sections you have. Leave the rest blank — only sections with data will be saved.
            </div>

            {/* Nav — click to jump to section */}
            <div style={{ fontSize:9, color:SUB, fontWeight:700, textTransform:'uppercase', letterSpacing:0.8, marginBottom:6 }}>
              Sections ({filled.length} filled)
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:2, overflowY:'auto', flex:1 }}>
              {cats.map(c => {
                const has     = sectionHasData(sections[c])
                const active  = c === activeCat
                return (
                  <button
                    key={c}
                    onClick={() => jumpTo(c)}
                    style={{
                      display:'flex', alignItems:'center', gap:7,
                      background: active ? `${L3}18` : 'transparent',
                      border:'none',
                      borderLeft: active ? `3px solid ${L3}` : '3px solid transparent',
                      borderRadius:4, padding:'5px 7px',
                      cursor:'pointer', textAlign:'left', width:'100%',
                      fontFamily:PP,
                    }}
                  >
                    <span style={{ fontSize:11, width:14, textAlign:'center', color: has ? '#2e7d32' : '#c8d0da', fontWeight:800, flexShrink:0 }}>
                      {has ? '✓' : CAT_ICONS[c] || '○'}
                    </span>
                    <span style={{ fontSize:10, color: active ? MAIN : has ? MAIN : '#8a96a3', fontWeight: active || has ? 700 : 400, lineHeight:1.3 }}>
                      {CAT_LABELS[c]?.replace(/^[^\s]+\s/,'') || c}
                    </span>
                  </button>
                )
              })}
            </div>

            <div style={{ marginTop:'auto', paddingTop:10 }}>
              <div style={{ fontSize:9, color:SUB, fontWeight:700, textTransform:'uppercase', letterSpacing:0.8, marginBottom:4 }}>Linked to</div>
              <div style={{ fontSize:12, fontWeight:700, color:MAIN, wordBreak:'break-word' }}>{linkedName}</div>
              <div style={{ fontSize:10, color:L3, fontWeight:600, marginTop:2 }}>{linkedType}</div>
            </div>
          </div>

          {/* L4 WHITE CARD */}
          <div style={{
            flex:1, background:'#FFFFFF', borderRadius:0,
            margin:'30px 20px 12px 0',
            display:'flex', flexDirection:'column',
            overflow:'hidden', zIndex:1, position:'relative',
            boxShadow:'0 2px 24px rgba(0,0,0,0.09)',
            border:'1px solid #e2e8f0',
          }}>
            {/* Card header */}
            <div style={{
              padding:'11px 18px 9px', borderBottom:'1px solid #f0f4f8',
              display:'flex', alignItems:'center', justifyContent:'space-between',
              flexShrink:0, background:'#fff',
            }}>
              <div style={{ fontSize:13, fontWeight:800, color:MAIN, fontFamily:PP }}>
                Fill in what you have — leave the rest blank
              </div>
              <button onClick={onClose} style={{
                width:26, height:26, borderRadius:'50%',
                background:'#f1f5f9', border:'none',
                fontSize:12, color:'#64748b', cursor:'pointer',
                display:'flex', alignItems:'center', justifyContent:'center',
              }}>✕</button>
            </div>

            {/* Scrollable sections */}
            <div ref={scrollBodyRef} style={{ flex:1, overflowY:'auto', padding:'12px 16px' }}>
              <div style={{ fontFamily:PP, display:'flex', flexDirection:'column', gap:10 }}>

                {cats.map(cat => {
                  const has = sectionHasData(sections[cat])
                  return (
                    <div key={cat} ref={el => sectionRefs.current[cat] = el} style={{
                      border:`1.5px solid ${has ? L3 : '#e8edf2'}`,
                      borderRadius:10,
                      background: has ? `${L3}07` : '#fafbfd',
                      overflow:'hidden',
                      transition:'border-color 0.15s',
                    }}>
                      {/* Section header */}
                      <div style={{
                        display:'flex', alignItems:'center', gap:8,
                        padding:'8px 14px',
                        background: has ? `${L3}12` : '#f4f6fa',
                        borderBottom:`1px solid ${has ? L3+'33' : '#e8edf2'}`,
                      }}>
                        <span style={{ fontSize:16 }}>{CAT_ICONS[cat]||'📁'}</span>
                        <span style={{ fontSize:12, fontWeight:800, color: has ? MAIN : '#6b7c93' }}>
                          {CAT_LABELS[cat]?.replace(/^[^\s]+\s/,'') || cat}
                        </span>
                        {has && <span style={{ marginLeft:'auto', fontSize:10, color:'#2e7d32', fontWeight:700, background:'#e8f5e9', borderRadius:20, padding:'1px 8px' }}>✓ filled</span>}
                      </div>

                      {/* Section fields */}
                      <div style={{ padding:'10px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px 12px' }}>
                        <div>
                          <label style={lbl}>Doc / Ref Number</label>
                          <input style={inp()} value={getS(cat,'doc_number')} onChange={e=>setS(cat,'doc_number',e.target.value)} placeholder="Number or reference" />
                        </div>
                        <div>
                          <label style={lbl}>Issued By</label>
                          <input style={inp()} value={getS(cat,'issued_by')} onChange={e=>setS(cat,'issued_by',e.target.value)} placeholder="MOI, GAZT, QIWA…" />
                        </div>
                        <div>
                          <label style={lbl}>Issue Date</label>
                          <input type="date" style={inp()} value={getS(cat,'issue_date')} onChange={e=>setS(cat,'issue_date',e.target.value)} />
                        </div>
                        <div>
                          <label style={lbl}>Expiry Date</label>
                          <input type="date" style={inp()} value={getS(cat,'expiry_date')} onChange={e=>setS(cat,'expiry_date',e.target.value)} />
                        </div>
                        <div style={{ gridColumn:'1 / -1' }}>
                          <label style={lbl}>File (PDF, image, Word)</label>
                          <input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                            onChange={e => setS(cat,'file', e.target.files[0] || null)}
                            style={{ ...inp(), padding:'5px 10px', cursor:'pointer' }} />
                          {sections[cat]?.file && (
                            <div style={{ fontSize:10, color:'#546e7a', marginTop:3 }}>
                              📎 {sections[cat].file.name} ({Math.round(sections[cat].file.size/1024)} KB)
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {err && <div style={{ color:'#c62828', fontSize:12, marginTop:4, background:'#ffebee', borderRadius:6, padding:'8px 12px' }}>{err}</div>}

              </div>
            </div>

            {/* Footer */}
            <div style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'10px 18px', borderTop:'1px solid #f0f4f8',
              flexShrink:0, background:'#fff',
            }}>
              <button onClick={onClose} style={{
                background:'#747474', color:'#fff', border:'none',
                borderRadius:4, padding:'9px 24px',
                fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:PP,
              }}>Cancel</button>
              <button onClick={saveAll} disabled={saving || filled.length === 0} style={{
                background: (saving || filled.length === 0) ? '#b0bec5' : L3,
                color:'#fff', border:'none', borderRadius:4,
                padding:'9px 28px', fontSize:12, fontWeight:700,
                cursor:(saving || filled.length === 0)?'not-allowed':'pointer',
                fontFamily:PP, opacity:(saving || filled.length === 0)?0.7:1,
              }}>
                {saving ? 'Saving…' : filled.length === 0 ? '💾 Save Documents' : `💾 Save ${filled.length} Document${filled.length>1?'s':''}`}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main export — EntityDocs panel
// ═══════════════════════════════════════════════════════════════════
export default function EntityDocs({ entityId, linkedType, linkedId, linkedName, accentColor, chapterName }) {
  const pal = CHAPTER_PALETTES[chapterName] || CHAPTER_PALETTES.Masters
  const PRI = accentColor || pal.L3 || '#454D9B'
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
          chapterName={chapterName}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); load() }}
        />
      )}
    </div>
  )
}
