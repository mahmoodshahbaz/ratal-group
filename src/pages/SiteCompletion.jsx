/**
 * SiteCompletion.jsx — Site Milestone Tracker (admin/PM view)
 *
 * Single source of truth: site_masters.milestones (JSONB)
 * Each site has a WF Code → stages stored as [{name, status, date, notes}]
 * PM can tick stages from this page or from the Site Master detail modal.
 * Field staff update via FormSiteCompletion (mobile) → also saves to site_masters.milestones.
 */

import { useState, useEffect, useMemo } from 'react'
import { supabase }                      from '../lib/supabase'
import ChapterPage                       from '../components/ChapterPage'
import { CHAPTER_PALETTES, GROUP_COLORS } from '../styles/appStyles'

const MC = GROUP_COLORS.Operations
const L2 = CHAPTER_PALETTES.Operations.L2
const FF = 'Poppins, -apple-system, sans-serif'

const STATUS_OPTIONS = ['PENDING','IN_PROGRESS','COMPLETED','BLOCKED']
const STATUS_COLOR = {
  PENDING:     { bg:'#f5f5f5', color:'#90a4ae' },
  IN_PROGRESS: { bg:'#fff3e0', color:'#e65100' },
  COMPLETED:   { bg:'#e8f5e9', color:'#2e7d32' },
  BLOCKED:     { bg:'#ffebee', color:'#c62828' },
}
const DEPT_COLORS = { NISU:'#1565c0', TISU:'#6a1b9a', CISU:'#e65100', ITSU:'#00838f' }

function pctColor(p) {
  if (p === 100) return '#2e7d32'
  if (p >= 60)   return '#f57f17'
  if (p > 0)     return '#1565c0'
  return '#90a4ae'
}

function calcPct(milestones) {
  if (!milestones?.length) return 0
  const done = milestones.filter(m => m.status === 'COMPLETED').length
  return Math.round((done / milestones.length) * 100)
}

function siteStatus(pct) {
  if (pct === 100) return 'COMPLETE'
  if (pct > 0)     return 'IN_PROGRESS'
  return 'NOT_STARTED'
}

export default function SiteCompletion({ entityId }) {
  const [sites,       setSites]       = useState([])
  const [deptMap,     setDeptMap]     = useState({})
  const [loading,     setLoading]     = useState(true)
  const [expanded,    setExpanded]    = useState(null)   // site id
  const [saving,      setSaving]      = useState(null)   // site id being saved
  const [localML,     setLocalML]     = useState({})     // { [siteId]: milestones[] } — in-progress edits
  const [dirty,       setDirty]       = useState({})     // { [siteId]: true } — unsaved changes

  // Filters
  const [filterSearch, setFilterSearch] = useState('')
  const [filterUnit,   setFilterUnit]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // ── Load ─────────────────────────────────────────────────────────────────────
  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const [{ data: sm }, { data: depts }] = await Promise.all([
      supabase.from('site_masters')
        .select('id,sm_id,site_no,site_name,job_no,wf_code,service_unit,dept_id,milestones,status')
        .eq('entity_id', entityId)
        .order('sm_id'),
      supabase.from('departments')
        .select('id,dept_code,dept_name')
        .eq('entity_id', entityId),
    ])
    const dm = {}; (depts || []).forEach(d => { dm[d.id] = d })
    setDeptMap(dm)
    setSites(sm || [])
    setLoading(false)
  }

  // ── Expand a site (show its milestones) ───────────────────────────────────
  function handleExpand(id) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    // Seed local edit state if not already there
    const site = sites.find(s => s.id === id)
    if (site && !localML[id]) {
      setLocalML(p => ({ ...p, [id]: site.milestones || [] }))
    }
  }

  // ── Toggle a milestone status ──────────────────────────────────────────────
  function toggleMilestone(siteId, idx) {
    setLocalML(prev => {
      const ml = [...(prev[siteId] || [])]
      const cur = ml[idx]?.status || 'PENDING'
      const next = cur === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
      ml[idx] = {
        ...ml[idx],
        status: next,
        date:   next === 'COMPLETED' ? new Date().toISOString().split('T')[0] : '',
      }
      return { ...prev, [siteId]: ml }
    })
    setDirty(p => ({ ...p, [siteId]: true }))
  }

  function setMilestoneStatus(siteId, idx, status) {
    setLocalML(prev => {
      const ml = [...(prev[siteId] || [])]
      ml[idx] = {
        ...ml[idx],
        status,
        date: status === 'COMPLETED' ? (ml[idx].date || new Date().toISOString().split('T')[0]) : ml[idx].date || '',
      }
      return { ...prev, [siteId]: ml }
    })
    setDirty(p => ({ ...p, [siteId]: true }))
  }

  // ── Save milestones back to site_masters ──────────────────────────────────
  async function saveMilestones(siteId) {
    setSaving(siteId)
    const ml = localML[siteId]
    const pct = calcPct(ml)
    await supabase.from('site_masters')
      .update({ milestones: ml })
      .eq('id', siteId)
    // Update local sites list
    setSites(prev => prev.map(s => s.id === siteId ? { ...s, milestones: ml } : s))
    setDirty(p => { const n = { ...p }; delete n[siteId]; return n })
    setSaving(null)
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const withML = sites.filter(s => s.milestones?.length)
    const complete    = withML.filter(s => calcPct(s.milestones) === 100).length
    const inProgress  = withML.filter(s => { const p = calcPct(s.milestones); return p > 0 && p < 100 }).length
    const notStarted  = withML.filter(s => calcPct(s.milestones) === 0).length
    const avgPct      = withML.length ? Math.round(withML.reduce((a, s) => a + calcPct(s.milestones), 0) / withML.length) : 0
    return { total: sites.length, complete, inProgress, notStarted, avgPct }
  }, [sites])

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return sites.filter(s => {
      const dept = deptMap[s.dept_id] || {}
      const unit = s.service_unit || dept.dept_code || ''
      if (filterUnit && unit !== filterUnit) return false
      const pct = calcPct(s.milestones)
      const st  = siteStatus(pct)
      if (filterStatus === 'COMPLETE'    && st !== 'COMPLETE')    return false
      if (filterStatus === 'IN_PROGRESS' && st !== 'IN_PROGRESS') return false
      if (filterStatus === 'NOT_STARTED' && st !== 'NOT_STARTED') return false
      if (filterSearch) {
        const q = filterSearch.toLowerCase()
        if (![ s.sm_id, s.site_no, s.job_no, s.site_name, s.wf_code ].some(f => (f||'').toLowerCase().includes(q))) return false
      }
      return true
    })
  }, [sites, filterUnit, filterStatus, filterSearch, deptMap])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ChapterPage
      title="Site Completion"
      chapter="Operations"
      loading={loading}
      MC={MC} L2={L2}
    >
      {/* KPI cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Total Sites',  value:kpis.total,       bg:'#1565c0' },
          { label:'Complete',     value:kpis.complete,    bg:'#2e7d32' },
          { label:'In Progress',  value:kpis.inProgress,  bg:'#e65100' },
          { label:'Not Started',  value:kpis.notStarted,  bg:'#6a1b9a' },
          { label:'Avg Progress', value:`${kpis.avgPct}%`, bg:'#00695c' },
        ].map(k => (
          <div key={k.label} style={{ background:k.bg, borderRadius:10, padding:'14px 16px', color:'#fff', fontFamily:FF }}>
            <div style={{ fontSize:11, opacity:0.8, textTransform:'uppercase', letterSpacing:0.5 }}>{k.label}</div>
            <div style={{ fontSize:26, fontWeight:700, marginTop:2 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        <input
          placeholder="Search site# / name / job#…"
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          style={{ flex:1, minWidth:200, padding:'7px 12px', borderRadius:8, border:'1.5px solid #dde3ec', fontSize:13, fontFamily:FF }}
        />
        <select value={filterUnit} onChange={e => setFilterUnit(e.target.value)}
          style={{ padding:'7px 12px', borderRadius:8, border:'1.5px solid #dde3ec', fontSize:13, fontFamily:FF }}>
          <option value="">All Units</option>
          {['NISU','TISU','CISU','ITSU'].map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding:'7px 12px', borderRadius:8, border:'1.5px solid #dde3ec', fontSize:13, fontFamily:FF }}>
          <option value="">All Statuses</option>
          <option value="NOT_STARTED">Not Started</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETE">Complete</option>
        </select>
        <span style={{ padding:'7px 12px', fontSize:13, color:'#78909c', fontFamily:FF }}>{filtered.length} sites</span>
      </div>

      {/* Site list */}
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {filtered.map(site => {
          const ml      = localML[site.id] ?? site.milestones ?? []
          const pct     = calcPct(ml)
          const done    = ml.filter(m => m.status === 'COMPLETED').length
          const isExp   = expanded === site.id
          const isDirty = dirty[site.id]
          const dept    = deptMap[site.dept_id] || {}
          const unit    = site.service_unit || dept.dept_code || ''
          const unitC   = DEPTCOLOR(unit)

          return (
            <div key={site.id} style={{ border:'1.5px solid #e0e7ef', borderRadius:10, overflow:'hidden', background:'#fff' }}>
              {/* Site row */}
              <div
                onClick={() => handleExpand(site.id)}
                style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', cursor:'pointer',
                  background: isExp ? '#f0f7ff' : '#fff', transition:'background 0.15s' }}
              >
                {/* Unit badge */}
                <span style={{ background:unitC, color:'#fff', borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700, fontFamily:FF, whiteSpace:'nowrap' }}>
                  {unit || '—'}
                </span>

                {/* Site info */}
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:13, fontFamily:FF, color:'#1a2e3d' }}>
                    {site.sm_id}
                    {site.site_name && <span style={{ fontWeight:400, color:'#546e7a', marginLeft:8 }}>{site.site_name}</span>}
                  </div>
                  <div style={{ fontSize:11, color:'#90a4ae', fontFamily:FF, marginTop:2 }}>
                    {site.site_no && <>Site# {site.site_no}</>}
                    {site.job_no  && <> · Job# {site.job_no}</>}
                    {site.wf_code && <> · {site.wf_code}</>}
                  </div>
                </div>

                {/* Progress */}
                <div style={{ textAlign:'right', minWidth:100 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:pctColor(pct), fontFamily:FF }}>{pct}%</div>
                  <div style={{ fontSize:11, color:'#90a4ae', fontFamily:FF }}>{done}/{ml.length} stages</div>
                  <div style={{ marginTop:4, background:'#e0e7ef', borderRadius:4, height:4, width:80 }}>
                    <div style={{ background:pctColor(pct), borderRadius:4, height:4, width:`${pct}%`, transition:'width 0.3s' }} />
                  </div>
                </div>

                {/* Status badge */}
                <span style={{
                  ...STATUS_COLOR[siteStatus(pct) === 'COMPLETE' ? 'COMPLETED' : siteStatus(pct) === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'PENDING'],
                  padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600, fontFamily:FF, whiteSpace:'nowrap'
                }}>
                  {siteStatus(pct).replace('_',' ')}
                </span>

                {/* Expand arrow */}
                <span style={{ fontSize:16, color:'#90a4ae', transition:'transform 0.2s', transform:isExp?'rotate(180deg)':'none' }}>▼</span>
              </div>

              {/* Milestone detail */}
              {isExp && (
                <div style={{ padding:'12px 16px', borderTop:'1px solid #e0e7ef', background:'#fafcff' }}>
                  {ml.length === 0 ? (
                    <div style={{ color:'#90a4ae', fontSize:13, fontFamily:FF, textAlign:'center', padding:'16px 0' }}>
                      No milestones — assign a WF Code in Site Master to generate stages.
                    </div>
                  ) : (
                    <>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:8, marginBottom:12 }}>
                        {ml.map((m, idx) => {
                          const sc = STATUS_COLOR[m.status] || STATUS_COLOR.PENDING
                          return (
                            <div key={idx} style={{ border:'1.5px solid #e0e7ef', borderRadius:8, padding:'8px 12px', background:sc.bg }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                                <input
                                  type="checkbox"
                                  checked={m.status === 'COMPLETED'}
                                  onChange={() => toggleMilestone(site.id, idx)}
                                  style={{ cursor:'pointer', width:16, height:16, accentColor:'#2e7d32' }}
                                />
                                <span style={{ flex:1, fontSize:12, fontWeight:600, fontFamily:FF, color:'#1a2e3d' }}>
                                  {idx + 1}. {m.name}
                                </span>
                              </div>
                              <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                                <select
                                  value={m.status || 'PENDING'}
                                  onChange={e => setMilestoneStatus(site.id, idx, e.target.value)}
                                  style={{ fontSize:11, padding:'2px 6px', borderRadius:6, border:'1px solid #dde3ec',
                                    background:'#fff', fontFamily:FF, color:sc.color, fontWeight:600 }}
                                >
                                  {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                                {m.date && <span style={{ fontSize:10, color:'#90a4ae', fontFamily:FF }}>{m.date}</span>}
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      {/* Save button */}
                      <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                        {isDirty && (
                          <button
                            onClick={() => {
                              setLocalML(p => { const n = {...p}; delete n[site.id]; return n })
                              setDirty(p => { const n = {...p}; delete n[site.id]; return n })
                            }}
                            style={{ padding:'6px 16px', borderRadius:8, border:'1.5px solid #dde3ec',
                              background:'#fff', fontSize:12, cursor:'pointer', fontFamily:FF, color:'#546e7a' }}
                          >
                            Discard
                          </button>
                        )}
                        <button
                          disabled={!isDirty || saving === site.id}
                          onClick={() => saveMilestones(site.id)}
                          style={{ padding:'6px 18px', borderRadius:8, border:'none',
                            background: isDirty ? MC : '#dde3ec',
                            color: isDirty ? '#fff' : '#90a4ae',
                            fontSize:12, fontWeight:600, cursor: isDirty ? 'pointer' : 'default',
                            fontFamily:FF }}
                        >
                          {saving === site.id ? 'Saving…' : 'Save Progress'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign:'center', padding:40, color:'#90a4ae', fontFamily:FF }}>
            No sites found.
          </div>
        )}
      </div>
    </ChapterPage>
  )
}

function DEPTCOLOR(unit) {
  return { NISU:'#1565c0', TISU:'#6a1b9a', CISU:'#e65100', ITSU:'#00838f' }[unit] || '#546e7a'
}
