/**
 * SubConClaims.jsx — Admin view: Sub-Contractor Claims
 * Chapter: Finance  (MC=#8C354B, L1=#C1A1A9, L2=#FAF0F2)
 *
 * Admin/DH/Finance reviews, approves or rejects subcontractor claims
 * submitted via FormSubConClaim.jsx.
 *
 * PGRST201-safe: flat fetches + JS maps only.
 */

import { useState, useEffect, useMemo } from 'react'
import { supabase }                      from '../lib/supabase'
import ChapterPage                       from '../components/ChapterPage'
import { CHAPTER_PALETTES, GROUP_COLORS } from '../styles/appStyles'

const MC = GROUP_COLORS.Finance          // #8C354B
const L1 = CHAPTER_PALETTES.Finance.L1  // #C1A1A9
const L2 = CHAPTER_PALETTES.Finance.L2  // #FAF0F2

const FF = 'Poppins, -apple-system, sans-serif'

const STATUS_CONFIG = {
  SUBMITTED:    { label:'Submitted',    bg:'#e3f2fd', color:'#1565c0', next:['UNDER_REVIEW','REJECTED'] },
  UNDER_REVIEW: { label:'Under Review', bg:'#fff3e0', color:'#e65100', next:['APPROVED','REJECTED'] },
  APPROVED:     { label:'Approved',     bg:'#e8f5e9', color:'#2e7d32', next:['PAID'] },
  PAID:         { label:'Paid',         bg:'#f3e5f5', color:'#6a1b9a', next:[] },
  REJECTED:     { label:'Rejected',     bg:'#ffebee', color:'#c62828', next:['UNDER_REVIEW'] },
}

const CLAIM_TYPE_LABELS = { LUMPSUM:'Lump Sum', HOURLY:'Hourly', MILESTONE:'Milestone' }

export default function SubConClaims({ entityId, role }) {
  const [claims,   setClaims]   = useState([])
  const [empMap,   setEmpMap]   = useState({})
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState({})
  const [updating, setUpdating] = useState({})

  // Filters
  const [filterStatus,    setFilterStatus]    = useState('')
  const [filterClaimType, setFilterClaimType] = useState('')
  const [filterSearch,    setFilterSearch]    = useState('')
  const [filterFrom,      setFilterFrom]      = useState('')
  const [filterTo,        setFilterTo]        = useState('')

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const [{ data: claimsData }, { data: empsData }] = await Promise.all([
      supabase.from('subcon_claims')
        .select('id,claim_number,employee_id,contractor_id,assignment_id,site_name,scope_type,claim_month,claim_year,claim_type,work_description,milestones_done,hours_worked,hourly_rate,claim_amount,vat_pct,materials_used,photo_url,photo_url_2,document_url,notes,status,submitted_at,reviewed_at,reviewed_by,rejection_reason')
        .eq('entity_id', entityId)
        .order('submitted_at', { ascending: false }),
      supabase.from('employees')
        .select('id,full_name_en')
        .eq('entity_id', entityId),
    ])
    const em = {}
    empsData?.forEach(e => { em[e.id] = e })
    setEmpMap(em)
    setClaims(claimsData || [])
    setLoading(false)
  }

  // ── Update status ────────────────────────────────────────────────────────────
  async function updateStatus(id, newStatus, reason = null) {
    setUpdating(p => ({ ...p, [id]: true }))
    const patch = { status: newStatus, reviewed_at: new Date().toISOString() }
    if (reason) patch.rejection_reason = reason
    const { error } = await supabase.from('subcon_claims').update(patch).eq('id', id)
    if (!error) {
      setClaims(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
    } else {
      alert('Update failed: ' + error.message)
    }
    setUpdating(p => ({ ...p, [id]: false }))
  }

  function handleAction(claim, action) {
    if (action === 'REJECTED') {
      const reason = window.prompt('Rejection reason (required):')
      if (!reason?.trim()) return
      updateStatus(claim.id, 'REJECTED', reason.trim())
    } else {
      updateStatus(claim.id, action)
    }
  }

  // ── Filter ───────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return claims.filter(c => {
      if (filterStatus    && c.status     !== filterStatus)    return false
      if (filterClaimType && c.claim_type !== filterClaimType) return false
      if (filterFrom && c.submitted_at < filterFrom)           return false
      if (filterTo   && c.submitted_at > filterTo + 'T23:59')  return false
      if (filterSearch) {
        const q = filterSearch.toLowerCase()
        const name = empMap[c.employee_id]?.full_name_en?.toLowerCase() || ''
        if (!c.site_name?.toLowerCase().includes(q) &&
            !c.claim_number?.toLowerCase().includes(q) &&
            !name.includes(q)) return false
      }
      return true
    })
  }, [claims, filterStatus, filterClaimType, filterSearch, filterFrom, filterTo, empMap])

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total    = claims.length
    const submitted = claims.filter(c => c.status === 'SUBMITTED').length
    const reviewing = claims.filter(c => c.status === 'UNDER_REVIEW').length
    const approved  = claims.filter(c => c.status === 'APPROVED').length
    const paid      = claims.filter(c => c.status === 'PAID').length
    const totalVal  = claims.filter(c => ['APPROVED','PAID'].includes(c.status))
                           .reduce((s, c) => s + (c.claim_amount * (1 + (c.vat_pct || 0) / 100)), 0)
    return [
      { label:'Total Claims',    value:total,                     color:MC },
      { label:'Awaiting Review', value:submitted,                 color:'#1565c0' },
      { label:'Under Review',    value:reviewing,                 color:'#e65100' },
      { label:'Approved',        value:approved,                  color:'#2e7d32' },
      { label:'Paid',            value:paid,                      color:'#6a1b9a' },
      { label:'Approved Value',  value:`SAR ${totalVal.toLocaleString('en',{minimumFractionDigits:0})}`, color:MC },
    ]
  }, [claims])

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const fmt   = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'
  const fmtAmt = n => n ? `SAR ${Number(n).toLocaleString('en',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—'
  const toggle = id => setExpanded(p => ({ ...p, [id]: !p[id] }))

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <ChapterPage
      chapterName="Finance"
      chapterIcon="💳"
      chapterColor={MC}
      chapterSubtitle="Claims & Payments"
      sectionTitle="Sub-Contractor Claims"
      kpis={kpis}
      loading={loading}
    >
      {/* ── Filters ────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16, fontFamily:FF }}>
        <input
          placeholder="🔍  Claim #, site, or name…"
          value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
          style={{ flex:1, minWidth:180, padding:'8px 12px', border:`1.5px solid ${L1}`, borderRadius:8, fontSize:13, outline:'none' }}
        />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding:'8px 12px', border:`1.5px solid ${L1}`, borderRadius:8, fontSize:13, background:'#fff' }}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterClaimType} onChange={e => setFilterClaimType(e.target.value)}
          style={{ padding:'8px 12px', border:`1.5px solid ${L1}`, borderRadius:8, fontSize:13, background:'#fff' }}>
          <option value="">All Types</option>
          {Object.entries(CLAIM_TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
          style={{ padding:'8px 12px', border:`1.5px solid ${L1}`, borderRadius:8, fontSize:13 }} />
        <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
          style={{ padding:'8px 12px', border:`1.5px solid ${L1}`, borderRadius:8, fontSize:13 }} />
        <button onClick={load} style={{
          padding:'8px 16px', background:MC, color:'#fff', border:'none',
          borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer',
        }}>↻ Refresh</button>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div style={{ background:'#fff', borderRadius:12, border:`1px solid ${L1}30`, overflow:'hidden', fontFamily:FF }}>

        {/* Sticky header */}
        <div style={{
          display:'grid', gridTemplateColumns:'110px 1fr 100px 110px 130px 120px 100px 130px',
          background:MC, color:'#fff', fontSize:11, fontWeight:700,
          padding:'10px 16px', letterSpacing:0.6, position:'sticky', top:0, zIndex:2,
        }}>
          <div>CLAIM #</div>
          <div>CONTRACTOR / SITE</div>
          <div>TYPE</div>
          <div>PERIOD</div>
          <div>AMOUNT (excl. VAT)</div>
          <div>TOTAL (incl. VAT)</div>
          <div>STATUS</div>
          <div>ACTIONS</div>
        </div>

        {filtered.length === 0 && !loading && (
          <div style={{ padding:48, textAlign:'center', color:'#90a4ae', fontSize:14 }}>
            No claims found matching your filters.
          </div>
        )}

        {filtered.map(claim => {
          const open   = !!expanded[claim.id]
          const st     = STATUS_CONFIG[claim.status] || STATUS_CONFIG.SUBMITTED
          const emp    = empMap[claim.employee_id]
          const vatAmt = claim.claim_amount * (claim.vat_pct || 0) / 100
          const total  = claim.claim_amount + vatAmt
          const canAct = ['SUPERADMIN','ADMIN','DEPT_HEAD','PROJECT_MANAGER'].includes(role)

          return (
            <div key={claim.id}>
              {/* ── Summary row ─────────────────────────────────────── */}
              <div
                onClick={() => toggle(claim.id)}
                style={{
                  display:'grid', gridTemplateColumns:'110px 1fr 100px 110px 130px 120px 100px 130px',
                  padding:'12px 16px', alignItems:'center', cursor:'pointer',
                  borderBottom:`1px solid ${L2}`,
                  background: open ? L2 : '#fff',
                  transition:'background 0.15s',
                }}
                onMouseEnter={e => { if (!open) e.currentTarget.style.background = '#fdf8f9' }}
                onMouseLeave={e => { if (!open) e.currentTarget.style.background = '#fff' }}
              >
                {/* Claim # */}
                <div style={{ fontWeight:800, color:MC, fontSize:12 }}>
                  {claim.claim_number || claim.id.slice(0,8)}
                  <span style={{ fontSize:10, color:'#90a4ae', marginLeft:4 }}>{open ? '▲' : '▼'}</span>
                </div>

                {/* Contractor / Site */}
                <div>
                  <div style={{ fontWeight:600, fontSize:13, color:'#1a2e3d' }}>
                    {emp?.full_name_en || 'Unknown'}
                  </div>
                  <div style={{ fontSize:11, color:'#90a4ae', marginTop:1 }}>{claim.site_name || '—'}</div>
                </div>

                {/* Type */}
                <div>
                  <span style={{
                    fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20,
                    background:`${MC}15`, color:MC, border:`1px solid ${L1}60`,
                  }}>{CLAIM_TYPE_LABELS[claim.claim_type] || claim.claim_type}</span>
                </div>

                {/* Period */}
                <div style={{ fontSize:12, color:'#546e7a' }}>
                  {claim.claim_month ? new Date(2000, claim.claim_month - 1).toLocaleString('default',{month:'short'}) : ''} {claim.claim_year}
                </div>

                {/* Amount excl VAT */}
                <div style={{ fontSize:13, fontWeight:600, color:'#1a2e3d' }}>{fmtAmt(claim.claim_amount)}</div>

                {/* Total incl VAT */}
                <div style={{ fontSize:13, fontWeight:700, color:MC }}>{fmtAmt(total)}</div>

                {/* Status */}
                <div>
                  <span style={{
                    fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:20,
                    background:st.bg, color:st.color,
                  }}>{st.label}</span>
                </div>

                {/* Actions */}
                <div onClick={e => e.stopPropagation()} style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {canAct && st.next.map(nextStatus => {
                    const ns = STATUS_CONFIG[nextStatus]
                    return (
                      <button
                        key={nextStatus}
                        disabled={!!updating[claim.id]}
                        onClick={() => handleAction(claim, nextStatus)}
                        style={{
                          fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:8,
                          border:`1px solid ${ns.color}40`, background:ns.bg,
                          color:ns.color, cursor:'pointer', whiteSpace:'nowrap',
                        }}
                      >
                        {updating[claim.id] ? '…' : ns.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ── Expanded detail ──────────────────────────────────── */}
              {open && (
                <div style={{ background:L2, borderBottom:`1px solid ${L1}40`, padding:'16px 20px' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, marginBottom:16 }}>

                    {/* Work description */}
                    <div style={{ gridColumn:'1/-1' }}>
                      <div style={{ fontSize:11, fontWeight:700, color:MC, letterSpacing:1, marginBottom:6 }}>WORK DESCRIPTION</div>
                      <div style={{ fontSize:13, color:'#1a2e3d', lineHeight:1.6, background:'#fff', borderRadius:8, padding:'10px 14px', border:`1px solid ${L1}40` }}>
                        {claim.work_description || '—'}
                      </div>
                    </div>

                    {/* Hourly details */}
                    {claim.claim_type === 'HOURLY' && (
                      <>
                        <div>
                          <div style={{ fontSize:11, color:'#90a4ae', marginBottom:3 }}>Hours Worked</div>
                          <div style={{ fontSize:14, fontWeight:700, color:'#1a2e3d' }}>{claim.hours_worked || '—'} hrs</div>
                        </div>
                        <div>
                          <div style={{ fontSize:11, color:'#90a4ae', marginBottom:3 }}>Hourly Rate</div>
                          <div style={{ fontSize:14, fontWeight:700, color:'#1a2e3d' }}>{fmtAmt(claim.hourly_rate)}/hr</div>
                        </div>
                      </>
                    )}

                    {/* Milestones done */}
                    {claim.claim_type === 'MILESTONE' && claim.milestones_done?.length > 0 && (
                      <div style={{ gridColumn:'1/-1' }}>
                        <div style={{ fontSize:11, fontWeight:700, color:MC, letterSpacing:1, marginBottom:6 }}>MILESTONES CLAIMED</div>
                        <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                          {claim.milestones_done.map(m => (
                            <span key={m} style={{
                              fontSize:11, padding:'3px 10px', borderRadius:20,
                              background:'#e8f5e9', color:'#2e7d32', border:'1px solid #a5d6a7',
                            }}>✓ {m}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Materials */}
                    {claim.materials_used?.length > 0 && (
                      <div style={{ gridColumn:'1/-1' }}>
                        <div style={{ fontSize:11, fontWeight:700, color:MC, letterSpacing:1, marginBottom:6 }}>MATERIALS USED</div>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                          <thead>
                            <tr style={{ background:`${MC}15` }}>
                              <th style={{ padding:'6px 10px', textAlign:'left', color:MC }}>Item</th>
                              <th style={{ padding:'6px 10px', textAlign:'right', color:MC }}>Qty</th>
                              <th style={{ padding:'6px 10px', textAlign:'right', color:MC }}>Unit Cost</th>
                              <th style={{ padding:'6px 10px', textAlign:'right', color:MC }}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {claim.materials_used.map((m, i) => (
                              <tr key={i} style={{ borderTop:'1px solid #f0f0f0' }}>
                                <td style={{ padding:'6px 10px' }}>{m.item}</td>
                                <td style={{ padding:'6px 10px', textAlign:'right' }}>{m.qty}</td>
                                <td style={{ padding:'6px 10px', textAlign:'right' }}>{fmtAmt(m.unit_cost)}</td>
                                <td style={{ padding:'6px 10px', textAlign:'right', fontWeight:700 }}>{fmtAmt(m.total)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Amount breakdown */}
                    <div>
                      <div style={{ fontSize:11, color:'#90a4ae', marginBottom:3 }}>Claim Amount</div>
                      <div style={{ fontSize:15, fontWeight:700, color:'#1a2e3d' }}>{fmtAmt(claim.claim_amount)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:'#90a4ae', marginBottom:3 }}>VAT {claim.vat_pct || 0}%</div>
                      <div style={{ fontSize:15, fontWeight:700, color:'#e65100' }}>{fmtAmt(vatAmt)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:11, color:'#90a4ae', marginBottom:3 }}>Total Payable</div>
                      <div style={{ fontSize:15, fontWeight:800, color:MC }}>{fmtAmt(total)}</div>
                    </div>

                    {/* Notes */}
                    {claim.notes && (
                      <div style={{ gridColumn:'1/-1' }}>
                        <div style={{ fontSize:11, fontWeight:700, color:MC, letterSpacing:1, marginBottom:6 }}>NOTES</div>
                        <div style={{ fontSize:12, color:'#546e7a', fontStyle:'italic' }}>{claim.notes}</div>
                      </div>
                    )}

                    {/* Rejection reason */}
                    {claim.rejection_reason && (
                      <div style={{ gridColumn:'1/-1', background:'#ffebee', borderRadius:8, padding:'10px 14px', border:'1px solid #ef9a9a' }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'#c62828', marginBottom:4 }}>REJECTION REASON</div>
                        <div style={{ fontSize:13, color:'#c62828' }}>{claim.rejection_reason}</div>
                      </div>
                    )}

                    {/* Photos & documents */}
                    <div style={{ gridColumn:'1/-1', display:'flex', gap:12, flexWrap:'wrap' }}>
                      {claim.photo_url && (
                        <a href={claim.photo_url} target="_blank" rel="noreferrer" style={{
                          padding:'8px 14px', background:`${MC}15`, color:MC,
                          borderRadius:8, fontSize:12, fontWeight:700, textDecoration:'none',
                          border:`1px solid ${L1}60`,
                        }}>📷 Photo 1</a>
                      )}
                      {claim.photo_url_2 && (
                        <a href={claim.photo_url_2} target="_blank" rel="noreferrer" style={{
                          padding:'8px 14px', background:`${MC}15`, color:MC,
                          borderRadius:8, fontSize:12, fontWeight:700, textDecoration:'none',
                          border:`1px solid ${L1}60`,
                        }}>📷 Photo 2</a>
                      )}
                      {claim.document_url && (
                        <a href={claim.document_url} target="_blank" rel="noreferrer" style={{
                          padding:'8px 14px', background:'#e8f5e9', color:'#2e7d32',
                          borderRadius:8, fontSize:12, fontWeight:700, textDecoration:'none',
                          border:'1px solid #a5d6a7',
                        }}>📄 Document</a>
                      )}
                    </div>

                    {/* Submitted date */}
                    <div style={{ gridColumn:'1/-1', fontSize:11, color:'#90a4ae' }}>
                      Submitted: {fmt(claim.submitted_at)}
                      {claim.reviewed_at && ` · Reviewed: ${fmt(claim.reviewed_at)}`}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </ChapterPage>
  )
}
