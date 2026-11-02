import { GROUP_COLORS } from '../styles/appStyles'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const MC = GROUP_COLORS.HR  // '#795338'
const TODAY = new Date().toISOString().slice(0, 10)
const DAY_MS = 86400000

// Lead time per doc type — days before expiry to start alerting
const DOC_LEAD = {
  PASSPORT: 90, IQAMA: 15, HEALTH_INS: 45, DRIVING_LICENSE: 30,
  WORK_PERMIT: 60, SCE: 30, QIWA: 30,
  INSURANCE: 45, MVPI: 14, REGISTRATION: 30, SAHER: 14,
  CR: 60, GOSI: 30, VAT: 30, MUNICIPALITY: 60,
  CITC: 60, SAMA: 60, CHAMBER: 60, MOL: 60,
}

function daysUntil(d) {
  if (!d) return null
  return Math.round((new Date(d) - new Date(TODAY)) / DAY_MS)
}
function fmt(d) { return d ? new Date(d).toLocaleDateString('en-GB') : '—' }
function docTier(d) {
  const days = daysUntil(d.expiry_date)
  const lead = d.lead_time_days || DOC_LEAD[d.category] || 30
  if (days === null)   return 'none'
  if (days < 0)        return 'expired'
  if (days <= 7)       return 'critical'
  if (days <= 30)      return 'warning'
  if (days <= lead)    return 'soon'
  return 'ok'
}
function tierLabel(t, days) {
  if (t === 'none')    return 'NO DATE'
  if (t === 'expired') return `EXP ${Math.abs(days)}d`
  if (t === 'ok')      return `${days}d`
  return `${days}d LEFT`
}

const TIER_BADGE = {
  none:     { bg: '#f5f7fa', color: '#aab2bd' },
  expired:  { bg: '#b71c1c', color: '#fff' },
  critical: { bg: '#c62828', color: '#fff' },
  warning:  { bg: '#e65100', color: '#fff' },
  soon:     { bg: '#fff3e0', color: '#7c4a00' },
  ok:       { bg: '#e8f5e9', color: '#2e7d32' },
}

const TIER_ORDER = ['expired', 'critical', 'warning', 'soon', 'ok', 'none']

const RS_COLOR = {
  ACTIVE:     '#2e7d32',
  SUBMITTED:  '#1565C0',
  IN_PROCESS: '#e65100',
  APPROVED:   '#6a1b9a',
  ARCHIVED:   '#546e7a',
}

const KPI_DEFS = [
  { key: 'total',    label: 'Total Docs',   g: ['#0d47a1', '#1565C0'] },
  { key: 'expired',  label: 'Expired',      g: ['#7f0000', '#b71c1c'] },
  { key: 'critical', label: 'Critical ≤7d', g: ['#4a148c', '#880e4f'] },
  { key: 'warning',  label: 'Warning ≤30d', g: ['#bf360c', '#e65100'] },
  { key: 'soon',     label: 'Due Soon',     g: ['#e65100', '#f57c00'] },
  { key: 'ok',       label: 'OK',           g: ['#1b5e20', '#2e7d32'] },
]

const ORDERED_CATS = ['EMPLOYEE', 'VEHICLE', 'COMPANY']
const CAT_BG = { EMPLOYEE: '#1565C0', VEHICLE: '#2e7d32', COMPANY: '#5A32D4' }
const CAT_ICON = { EMPLOYEE: '👤', VEHICLE: '🚗', COMPANY: '🏢' }
const CAT_ENTITY_LABEL = { EMPLOYEE: 'employees', VEHICLE: 'vehicles', COMPANY: 'entities' }

const EMPTY_RENEW = {
  new_doc_number: '', new_issue_date: '', new_expiry_date: '',
  renewal_fee: 650, levy_amount: 0, dependent_count_above_18: 0, other_fees: 0,
  responsible_person: '', notes: '',
}

export default function Compliance({ entityId, onNavigate }) {
  const [docs,         setDocs]         = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [catFilter,    setCatFilter]    = useState('')
  const [urgFilter,    setUrgFilter]    = useState('')
  const [rsFilter,     setRsFilter]     = useState('')
  const [openCats,     setOpenCats]     = useState({ EMPLOYEE: true, VEHICLE: true, COMPANY: true })
  const [openEntities, setOpenEntities] = useState({})
  const [renewDoc,     setRenewDoc]     = useState(null)
  const [renewForm,    setRenewForm]    = useState(EMPTY_RENEW)
  const [renewSaving,  setRenewSaving]  = useState(false)
  const [statusEdit,   setStatusEdit]   = useState(null)  // { id, val }

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('documents')
      .select('*')
      .eq('entity_id', entityId)
      .neq('status', 'ARCHIVED')
      .order('linked_type').order('linked_name').order('expiry_date')
      .limit(2000)
    setDocs(data || [])
    setLoading(false)
  }

  // ── KPI counts ─────────────────────────────────────────────────────────────
  const counts = docs.reduce((acc, d) => {
    acc.total++
    acc[docTier(d)] = (acc[docTier(d)] || 0) + 1
    return acc
  }, { total: 0, expired: 0, critical: 0, warning: 0, soon: 0, ok: 0, none: 0 })

  // ── Filtered docs ──────────────────────────────────────────────────────────
  const filtered = docs.filter(d => {
    if (catFilter && d.linked_type !== catFilter) return false
    if (rsFilter  && (d.renewal_status || 'ACTIVE') !== rsFilter) return false
    if (urgFilter && docTier(d) !== urgFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !(d.linked_name  || '').toLowerCase().includes(q) &&
        !(d.category     || '').toLowerCase().includes(q) &&
        !(d.doc_number   || '').toLowerCase().includes(q) &&
        !(d.title        || '').toLowerCase().includes(q)
      ) return false
    }
    return true
  })

  // ── Group: linked_type → linked_name → docs ────────────────────────────────
  const groups = {}
  for (const d of filtered) {
    const lt = d.linked_type || 'OTHER'
    const ln = d.linked_name || '(Unknown)'
    if (!groups[lt]) groups[lt] = {}
    if (!groups[lt][ln]) groups[lt][ln] = []
    groups[lt][ln].push(d)
  }

  // ── Passport → Iqama dependency check ─────────────────────────────────────
  function passportIqamaWarning(empDocs) {
    const pp = empDocs.find(d => d.category === 'PASSPORT')
    const iq = empDocs.find(d => d.category === 'IQAMA')
    if (!pp?.expiry_date || !iq?.expiry_date) return null
    const ppDays = daysUntil(pp.expiry_date)
    const iqDays = daysUntil(iq.expiry_date)
    if (ppDays !== null && iqDays !== null && ppDays < iqDays) {
      return `Passport expires in ${ppDays < 0 ? Math.abs(ppDays) + 'd ago' : ppDays + 'd'} — before Iqama (${iqDays}d). Renew Passport first or Iqama renewal will be blocked.`
    }
    return null
  }

  // ── Worst tier for an entity row ──────────────────────────────────────────
  function worstTier(entityDocs) {
    return entityDocs.reduce((worst, d) => {
      const t = docTier(d)
      return TIER_ORDER.indexOf(t) < TIER_ORDER.indexOf(worst) ? t : worst
    }, 'none')
  }

  // ── Quick renewal status update ────────────────────────────────────────────
  async function updateStatus(id, val) {
    await supabase.from('documents').update({ renewal_status: val }).eq('id', id)
    setDocs(prev => prev.map(d => d.id === id ? { ...d, renewal_status: val } : d))
    setStatusEdit(null)
  }

  // ── Save renewal ───────────────────────────────────────────────────────────
  async function saveRenewal() {
    if (!renewForm.new_expiry_date) { alert('New expiry date is required'); return }
    setRenewSaving(true)
    const d = renewDoc

    // 1. Write history snapshot
    await supabase.from('document_renewals').insert({
      document_id:          d.id,
      entity_id:            entityId,
      previous_doc_number:  d.doc_number,
      previous_issue_date:  d.issue_date,
      previous_expiry_date: d.expiry_date,
      previous_file_url:    d.file_url,
      previous_file_name:   d.file_name,
      new_doc_number:       renewForm.new_doc_number || d.doc_number,
      new_issue_date:       renewForm.new_issue_date || null,
      new_expiry_date:      renewForm.new_expiry_date,
      renewal_fee:          d.category === 'IQAMA' ? +renewForm.renewal_fee : 0,
      levy_amount:          d.category === 'IQAMA' ? +renewForm.levy_amount : 0,
      dependent_fee:        d.category === 'IQAMA' ? (renewForm.dependent_count_above_18 || 0) * 500 : 0,
      other_fees:           +renewForm.other_fees || 0,
      renewed_by:           renewForm.responsible_person,
      notes:                renewForm.notes,
    })

    // 2. Update the documents row with new values
    await supabase.from('documents').update({
      doc_number:         renewForm.new_doc_number  || d.doc_number,
      issue_date:         renewForm.new_issue_date  || d.issue_date,
      expiry_date:        renewForm.new_expiry_date,
      renewal_status:     'ACTIVE',
      responsible_person: renewForm.responsible_person || d.responsible_person,
    }).eq('id', d.id)

    setRenewSaving(false)
    setRenewDoc(null)
    setRenewForm(EMPTY_RENEW)
    load()
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  const inp = { padding: '7px 10px', borderRadius: 4, border: '1px solid #dde3ec', fontSize: 12, outline: 'none', fontFamily: 'Poppins,sans-serif', boxSizing: 'border-box' }
  const btn = (bg = MC, c = '#fff') => ({ background: bg, color: c, border: 'none', borderRadius: 4, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Poppins,sans-serif' })
  const lbl = { display: 'block', fontSize: 11, color: '#6b7c93', fontWeight: 700, marginBottom: 4 }

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: 'Poppins,sans-serif', fontSize: 13 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          All documents — expiry tracking &amp; renewal history. Source: Document Valet.
        </div>
        <button style={btn('#1565C0')} onClick={() => onNavigate?.('document_valet')}>
          → Go to Document Valet
        </button>
      </div>

      {/* Alert Banners */}
      {counts.expired > 0 && (
        <div style={{ background: '#b71c1c', color: '#fff', borderRadius: 8, padding: '10px 16px', marginBottom: 8, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
          🚨 {counts.expired} document{counts.expired > 1 ? 's' : ''} EXPIRED — immediate action required!
          <button onClick={() => setUrgFilter(urgFilter === 'expired' ? '' : 'expired')}
            style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '3px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>
            {urgFilter === 'expired' ? 'Clear' : 'View'}
          </button>
        </div>
      )}
      {counts.critical > 0 && (
        <div style={{ background: '#c62828', color: '#fff', borderRadius: 8, padding: '10px 16px', marginBottom: 8, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
          🔴 {counts.critical} expiring within 7 days
          <button onClick={() => setUrgFilter(urgFilter === 'critical' ? '' : 'critical')}
            style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '3px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>
            {urgFilter === 'critical' ? 'Clear' : 'View'}
          </button>
        </div>
      )}
      {counts.warning > 0 && (
        <div style={{ background: '#e65100', color: '#fff', borderRadius: 8, padding: '10px 16px', marginBottom: 8, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
          🟠 {counts.warning} expiring within 30 days
          <button onClick={() => setUrgFilter(urgFilter === 'warning' ? '' : 'warning')}
            style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '3px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 700 }}>
            {urgFilter === 'warning' ? 'Clear' : 'View'}
          </button>
        </div>
      )}

      {/* ── Sticky zone: KPI strip + filter bar ─────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#f4f6fa', paddingBottom: 10, paddingTop: 4 }}>
        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 10 }}>
          {KPI_DEFS.map(k => {
            const val = counts[k.key] || 0
            const active = urgFilter === k.key
            return (
              <div key={k.key}
                onClick={() => setUrgFilter(active ? '' : k.key)}
                style={{
                  background: `linear-gradient(135deg, ${k.g[0]}, ${k.g[1]})`,
                  borderRadius: 8, padding: '10px 14px', color: '#fff', cursor: 'pointer',
                  boxShadow: active ? `0 0 0 3px #fff, 0 0 0 5px ${k.g[1]}` : '0 2px 8px rgba(0,0,0,0.18)',
                  transform: active ? 'scale(1.04)' : 'scale(1)',
                  transition: 'all 0.15s',
                }}>
                <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{val}</div>
                <div style={{ fontSize: 10, opacity: 0.85, marginTop: 3 }}>{k.label}</div>
              </div>
            )
          })}
        </div>

        {/* Filter bar */}
        <div style={{ background: '#fff', borderRadius: 8, padding: '10px 14px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
          <input style={{ ...inp, flex: 1, minWidth: 180 }}
            placeholder="Search name, doc type, number…"
            value={search} onChange={e => setSearch(e.target.value)} />
          <select style={{ ...inp, minWidth: 140 }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
            <option value="">All Categories</option>
            <option value="EMPLOYEE">Employee</option>
            <option value="VEHICLE">Vehicle</option>
            <option value="COMPANY">Company</option>
          </select>
          <select style={{ ...inp, minWidth: 150 }} value={rsFilter} onChange={e => setRsFilter(e.target.value)}>
            <option value="">All Renewal Statuses</option>
            {['ACTIVE', 'SUBMITTED', 'IN_PROCESS', 'APPROVED', 'ARCHIVED'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {(urgFilter || catFilter || rsFilter || search) && (
            <button style={btn('#aab2bd')} onClick={() => { setUrgFilter(''); setCatFilter(''); setRsFilter(''); setSearch('') }}>
              ✕ Clear
            </button>
          )}
          <span style={{ fontSize: 11, color: '#6b7c93', marginLeft: 'auto' }}>{filtered.length} docs</span>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7c93' }}>Loading…</div>
      ) : (
        ORDERED_CATS
          .filter(cat => !catFilter || cat === catFilter)
          .map(cat => {
            const entityMap = groups[cat] || {}
            const entityNames = Object.keys(entityMap).sort()
            const catDocs = filtered.filter(d => d.linked_type === cat)
            if (catDocs.length === 0 && catFilter) return null

            const catOpen = openCats[cat] !== false
            const catExpired  = catDocs.filter(d => docTier(d) === 'expired').length
            const catCritical = catDocs.filter(d => docTier(d) === 'critical').length

            return (
              <div key={cat} style={{ marginBottom: 20 }}>
                {/* Category header */}
                <div
                  onClick={() => setOpenCats(p => ({ ...p, [cat]: !catOpen }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: CAT_BG[cat], color: '#fff',
                    borderRadius: catOpen ? '8px 8px 0 0' : 8,
                    padding: '11px 16px', cursor: 'pointer', userSelect: 'none',
                  }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>
                    {CAT_ICON[cat]} {cat}
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.8 }}>
                    {catDocs.length} doc{catDocs.length !== 1 ? 's' : ''} · {entityNames.length} {CAT_ENTITY_LABEL[cat]}
                  </span>
                  {catExpired > 0 && (
                    <span style={{ background: '#fff', color: '#b71c1c', borderRadius: 12, padding: '1px 10px', fontSize: 11, fontWeight: 800 }}>
                      🚨 {catExpired} expired
                    </span>
                  )}
                  {catCritical > 0 && (
                    <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 12, padding: '1px 10px', fontSize: 11, fontWeight: 700 }}>
                      🔴 {catCritical} critical
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 14 }}>{catOpen ? '▲' : '▼'}</span>
                </div>

                {catOpen && (
                  <div style={{ border: `2px solid ${CAT_BG[cat]}`, borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                    {entityNames.length === 0 ? (
                      <div style={{ padding: '20px', textAlign: 'center', color: '#aab2bd', fontSize: 12 }}>
                        No documents match current filters
                      </div>
                    ) : entityNames.map(entityName => {
                      const entityDocs = entityMap[entityName]
                      const eKey = `${cat}::${entityName}`
                      const eOpen = openEntities[eKey] !== false  // default open
                      const wt = worstTier(entityDocs)
                      const tb = TIER_BADGE[wt]
                      const passWarn = cat === 'EMPLOYEE' ? passportIqamaWarning(entityDocs) : null

                      return (
                        <div key={eKey} style={{ borderBottom: '1px solid #eef1f6' }}>
                          {/* Entity summary row */}
                          <div
                            onClick={() => setOpenEntities(p => ({ ...p, [eKey]: !eOpen }))}
                            style={{
                              display: 'grid', gridTemplateColumns: '1fr auto auto auto auto',
                              gap: 12, padding: '9px 16px', alignItems: 'center',
                              cursor: 'pointer', background: '#fafbfc',
                            }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: '#1a2e3d' }}>{entityName}</span>
                            <span style={{ fontSize: 11, color: '#6b7c93' }}>{entityDocs.length} doc{entityDocs.length !== 1 ? 's' : ''}</span>
                            {passWarn
                              ? <span title={passWarn} style={{ fontSize: 15, cursor: 'help' }} onClick={e => { e.stopPropagation(); alert(passWarn) }}>⚠️</span>
                              : <span />
                            }
                            <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 10, fontWeight: 800, background: tb.bg, color: tb.color }}>
                              {wt.toUpperCase()}
                            </span>
                            <span style={{ fontSize: 14, color: '#6b7c93' }}>{eOpen ? '▲' : '▼'}</span>
                          </div>

                          {/* Passport→Iqama warning */}
                          {eOpen && passWarn && (
                            <div style={{ background: '#fff8e1', padding: '6px 16px', fontSize: 11, color: '#856404', display: 'flex', gap: 8, alignItems: 'center' }}>
                              ⚠️ {passWarn}
                            </div>
                          )}

                          {/* Document table */}
                          {eOpen && (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                              <thead>
                                <tr style={{ background: MC }}>
                                  {['Document', 'Number', 'Issue Date', 'Expiry Date', 'Days Left', 'Renewal Status', 'Action'].map(h => (
                                    <th key={h} style={{ padding: '7px 10px', color: '#fff', fontWeight: 700, textAlign: 'left', fontSize: 11 }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {entityDocs.map((d, i) => {
                                  const days = daysUntil(d.expiry_date)
                                  const t  = docTier(d)
                                  const tb2 = TIER_BADGE[t]
                                  const rs = d.renewal_status || 'ACTIVE'
                                  const rsCol = RS_COLOR[rs] || '#6b7c93'

                                  return (
                                    <tr key={d.id} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
                                      <td style={{ padding: '7px 10px', fontWeight: 700, color: '#1a2e3d' }}>
                                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 800, background: '#f0f4f8', color: '#1a2e3d', marginRight: 6 }}>
                                          {d.category}
                                        </span>
                                        {d.title && d.title !== d.category && (
                                          <span style={{ color: '#6b7c93', fontWeight: 400, fontSize: 11 }}>{d.title}</span>
                                        )}
                                      </td>
                                      <td style={{ padding: '7px 10px', color: '#6b7c93', fontFamily: 'monospace', fontSize: 11 }}>{d.doc_number || '—'}</td>
                                      <td style={{ padding: '7px 10px', color: '#6b7c93' }}>{fmt(d.issue_date)}</td>
                                      <td style={{ padding: '7px 10px', fontWeight: 700 }}>{fmt(d.expiry_date)}</td>
                                      <td style={{ padding: '7px 10px' }}>
                                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: 10, fontWeight: 800, background: tb2.bg, color: tb2.color }}>
                                          {tierLabel(t, days)}
                                        </span>
                                      </td>
                                      <td style={{ padding: '7px 10px' }}>
                                        {statusEdit?.id === d.id ? (
                                          <select autoFocus style={{ ...inp, fontSize: 11, padding: '3px 6px' }}
                                            value={statusEdit.val}
                                            onChange={e => setStatusEdit({ id: d.id, val: e.target.value })}
                                            onBlur={() => updateStatus(statusEdit.id, statusEdit.val)}>
                                            {['ACTIVE', 'SUBMITTED', 'IN_PROCESS', 'APPROVED', 'ARCHIVED'].map(s => (
                                              <option key={s} value={s}>{s}</option>
                                            ))}
                                          </select>
                                        ) : (
                                          <span onClick={() => setStatusEdit({ id: d.id, val: rs })}
                                            title="Click to change status"
                                            style={{ cursor: 'pointer', color: rsCol, fontWeight: 700, fontSize: 11, textDecoration: 'underline dotted' }}>
                                            {rs}
                                          </span>
                                        )}
                                      </td>
                                      <td style={{ padding: '7px 10px' }}>
                                        {d.is_renewable !== false && (
                                          <button
                                            onClick={() => { setRenewDoc(d); setRenewForm({ ...EMPTY_RENEW, responsible_person: d.responsible_person || '' }) }}
                                            style={{ ...btn(), padding: '4px 10px', fontSize: 10 }}>
                                            Renew
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
      )}

      {/* ── Renewal Modal ─────────────────────────────────────────────────────── */}
      {renewDoc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', fontFamily: 'Poppins,sans-serif' }}>

            {/* Modal header */}
            <div style={{ background: MC, color: '#fff', padding: '14px 20px', borderRadius: '12px 12px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>Renew Document</div>
                <div style={{ fontSize: 11, opacity: 0.8 }}>{renewDoc.category} · {renewDoc.linked_name}</div>
              </div>
              <button onClick={() => setRenewDoc(null)}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 4, width: 28, height: 28, cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>✕</button>
            </div>

            <div style={{ padding: 20 }}>
              {/* Current document snapshot (read-only) */}
              <div style={{ background: '#f5f7fa', borderRadius: 6, padding: '10px 14px', marginBottom: 18, fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: '#6b7c93', marginBottom: 8, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Document (will be archived to history)</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <div><span style={{ color: '#6b7c93' }}>Number: </span><strong>{renewDoc.doc_number || '—'}</strong></div>
                  <div><span style={{ color: '#6b7c93' }}>Issue: </span><strong>{fmt(renewDoc.issue_date)}</strong></div>
                  <div><span style={{ color: '#6b7c93' }}>Expiry: </span><strong>{fmt(renewDoc.expiry_date)}</strong></div>
                  <div>
                    <span style={{ color: '#6b7c93' }}>Days Left: </span>
                    <strong style={{ color: (daysUntil(renewDoc.expiry_date) ?? 1) < 0 ? '#b71c1c' : '#1a2e3d' }}>
                      {daysUntil(renewDoc.expiry_date) ?? '—'}
                    </strong>
                  </div>
                </div>
              </div>

              {/* New values */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={lbl}>New Doc Number</label>
                  <input style={{ ...inp, width: '100%' }} placeholder={renewDoc.doc_number || 'Leave blank to keep current'}
                    value={renewForm.new_doc_number} onChange={e => setRenewForm(p => ({ ...p, new_doc_number: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>Responsible Person / PRO</label>
                  <input style={{ ...inp, width: '100%' }} placeholder="PRO name or HR officer"
                    value={renewForm.responsible_person} onChange={e => setRenewForm(p => ({ ...p, responsible_person: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>New Issue Date</label>
                  <input type="date" style={{ ...inp, width: '100%' }}
                    value={renewForm.new_issue_date} onChange={e => setRenewForm(p => ({ ...p, new_issue_date: e.target.value }))} />
                </div>
                <div>
                  <label style={lbl}>New Expiry Date *</label>
                  <input type="date" style={{ ...inp, width: '100%', border: !renewForm.new_expiry_date ? '1px solid #c62828' : '1px solid #dde3ec' }}
                    value={renewForm.new_expiry_date} onChange={e => setRenewForm(p => ({ ...p, new_expiry_date: e.target.value }))} />
                </div>
              </div>

              {/* Iqama fee breakdown (only for IQAMA docs) */}
              {renewDoc.category === 'IQAMA' && (
                <div style={{ background: '#fff8e1', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, color: '#7c4a00', marginBottom: 10, fontSize: 11, textTransform: 'uppercase' }}>Iqama Renewal Fees (SAR)</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                    <div>
                      <label style={lbl}>Renewal Fee</label>
                      <input type="number" style={{ ...inp, width: '100%' }} placeholder="650"
                        value={renewForm.renewal_fee} onChange={e => setRenewForm(p => ({ ...p, renewal_fee: e.target.value }))} />
                      <div style={{ fontSize: 10, color: '#6b7c93', marginTop: 2 }}>Standard SAR 650</div>
                    </div>
                    <div>
                      <label style={lbl}>Nitaqat Levy</label>
                      <input type="number" style={{ ...inp, width: '100%' }} placeholder="8500 or 9700"
                        value={renewForm.levy_amount} onChange={e => setRenewForm(p => ({ ...p, levy_amount: e.target.value }))} />
                      <div style={{ fontSize: 10, color: '#6b7c93', marginTop: 2 }}>8,500 or 9,700</div>
                    </div>
                    <div>
                      <label style={lbl}>Dependents &gt;18</label>
                      <input type="number" min="0" style={{ ...inp, width: '100%' }} placeholder="0"
                        value={renewForm.dependent_count_above_18} onChange={e => setRenewForm(p => ({ ...p, dependent_count_above_18: +e.target.value }))} />
                      <div style={{ fontSize: 10, color: '#6b7c93', marginTop: 2 }}>SAR 500 each</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, padding: '8px 12px', background: '#fff3cd', borderRadius: 6, fontSize: 12, fontWeight: 700, color: '#7c4a00' }}>
                    Total: SAR {(
                      (+(renewForm.renewal_fee || 0)) +
                      (+(renewForm.levy_amount || 0)) +
                      ((renewForm.dependent_count_above_18 || 0) * 500)
                    ).toLocaleString()}
                    {(renewForm.dependent_count_above_18 || 0) > 0 && (
                      <span style={{ fontWeight: 400, fontSize: 11 }}>
                        {' '}(incl. SAR {((renewForm.dependent_count_above_18 || 0) * 500).toLocaleString()} family levy)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div style={{ marginBottom: 20 }}>
                <label style={lbl}>Notes</label>
                <textarea style={{ ...inp, width: '100%', height: 56, resize: 'vertical' }}
                  placeholder="Sadad reference, bank ref, remarks…"
                  value={renewForm.notes} onChange={e => setRenewForm(p => ({ ...p, notes: e.target.value }))} />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button style={btn('#aab2bd')} onClick={() => setRenewDoc(null)}>Cancel</button>
                <button
                  style={{ ...btn(), opacity: (renewSaving || !renewForm.new_expiry_date) ? 0.6 : 1 }}
                  disabled={renewSaving || !renewForm.new_expiry_date}
                  onClick={saveRenewal}>
                  {renewSaving ? 'Saving…' : 'Save Renewal & Update Document'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
