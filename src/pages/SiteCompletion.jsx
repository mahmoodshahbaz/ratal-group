/**
 * SiteCompletion.jsx — Admin view: Site Milestone Tracker
 * Chapter: Operations  (MC=#0079BC, L1=#70A5A6, L2=#EAF3F2)
 *
 * Shows every site with its accumulated milestone progress across ALL
 * employees who have submitted updates. Collapsible per-site rows with
 * a full timeline of who did what and when.
 *
 * PGRST201-safe: all joins are flat fetches + JS maps. No nested FK syntax.
 */

import { useState, useEffect, useMemo } from 'react'
import { supabase }                      from '../lib/supabase'
import ChapterPage                       from '../components/ChapterPage'
import { CHAPTER_PALETTES, GROUP_COLORS } from '../styles/appStyles'

const MC = GROUP_COLORS.Operations          // #0079BC
const L1 = CHAPTER_PALETTES.Operations.L1  // #70A5A6
const L2 = CHAPTER_PALETTES.Operations.L2  // #EAF3F2

const FF = 'Poppins, -apple-system, sans-serif'

// Milestone sets per scope (used to compute total milestones for %)
const MILESTONE_SETS = {
  TOWER_INSTALLATION:  ['Site Survey Complete','Civil Foundation Done','Tower Erected','Grounding Complete','Cable Tray Installed','Equipment Mounted','Power Connected','Antenna Installed','Cabling Complete','Testing & Commissioning','Snag List Cleared','Handover'],
  ACTIVE_INSTALLATION: ['Site Survey Done','Equipment Delivered','Rack Installation','Power & Battery Setup','BTS/NodeB Installed','Cabling & Patching','RF Connections','Transmission Links','Software Commissioning','Drive Test','Acceptance Test','Handover'],
  CIVIL:               ['Survey & Layout','Excavation','Foundation Poured','Curing Complete','Backfill & Compaction','Fencing / Boundary Wall','Gate & Access','Final Inspection'],
  FIBRE:               ['Route Survey','Duct Laying','Manhole Construction','Cable Pulling','Splicing & Termination','OTDR Testing','Documentation Complete','Handover'],
  DOCUMENTATION:       ['As-Built Drawings','Equipment List','Test Results','Customer Approval','Contractor Sign-off','Portal Upload','Final Submission'],
  TESTING:             ['Pre-Test Checklist','RF Testing','Transmission Testing','Power Measurement','Alarm Checks','KPI Validation','Drive Test','Acceptance Sign-off'],
  GENERAL:             ['Mobilisation','Survey','Material Delivery','Installation Started','50% Progress','Installation Complete','Testing','Handover'],
}

const SCOPE_LABELS = {
  TOWER_INSTALLATION:'Tower Installation', ACTIVE_INSTALLATION:'Active Installation',
  CIVIL:'Civil Works', FIBRE:'Fibre', DOCUMENTATION:'Documentation',
  TESTING:'Testing', GENERAL:'General',
}

const SCOPE_COLORS = {
  TOWER_INSTALLATION:'#e65100', ACTIVE_INSTALLATION:'#1565c0',
  CIVIL:'#f57f17',              FIBRE:'#6a1b9a',
  DOCUMENTATION:'#00838f',      TESTING:'#2e7d32',
  GENERAL:'#546e7a',
}

function pctColor(pct) {
  if (pct === 100) return '#2e7d32'
  if (pct >= 60)   return '#f57f17'
  if (pct > 0)     return '#1565c0'
  return '#90a4ae'
}

function statusLabel(pct) {
  if (pct === 100) return { label:'Complete',    bg:'#e8f5e9', color:'#2e7d32' }
  if (pct >= 60)   return { label:'In Progress', bg:'#fff3e0', color:'#e65100' }
  if (pct > 0)     return { label:'Started',     bg:'#e3f2fd', color:'#1565c0' }
  return               { label:'Not Started',  bg:'#f5f5f5', color:'#90a4ae' }
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function SiteCompletion({ entityId }) {
  const [assignments, setAssignments] = useState([])
  const [logs,        setLogs]        = useState([])
  const [empMap,      setEmpMap]      = useState({})
  const [loading,     setLoading]     = useState(true)

  // Filters
  const [filterScope,  setFilterScope]  = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSearch, setFilterSearch] = useState('')

  // Expanded sites
  const [expanded, setExpanded] = useState({})

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!entityId) return
    load()
  }, [entityId])

  async function load() {
    setLoading(true)
    const [{ data: asgn }, { data: logsData }, { data: emps }] = await Promise.all([
      supabase.from('site_assignments')
        .select('id,site_number,site_name,scope_type,employee_id,completion_pct,completed_milestones,last_status_at,is_active,project_id')
        .eq('entity_id', entityId)
        .order('site_number'),
      supabase.from('site_status_logs')
        .select('id,assignment_id,employee_id,scope_type,milestones_newly_done,completion_pct,photo_url,notes,submitted_at')
        .eq('entity_id', entityId)
        .order('submitted_at', { ascending: false }),
      supabase.from('employees')
        .select('id,full_name_en,department_id')
        .eq('entity_id', entityId),
    ])
    const em = {}
    emps?.forEach(e => { em[e.id] = e })
    setEmpMap(em)
    setAssignments(asgn || [])
    setLogs(logsData || [])
    setLoading(false)
  }

  // ── Group by site ──────────────────────────────────────────────────────────
  const sites = useMemo(() => {
    const map = {}
    assignments.forEach(a => {
      const key = a.site_number || a.id
      if (!map[key]) map[key] = {
        site_number: a.site_number,
        site_name:   a.site_name,
        scope_type:  a.scope_type,
        assignments: [],
        logs:        [],
      }
      map[key].assignments.push(a)
    })

    // Attach logs to sites via assignment_id (ascending for milestone tracking)
    const assignSiteMap = {}
    assignments.forEach(a => { assignSiteMap[a.id] = a.site_number || a.id })
    logs.forEach(log => {
      const key = assignSiteMap[log.assignment_id]
      if (key && map[key]) map[key].logs.push(log)
    })

    // Compute site-level aggregates
    return Object.values(map).map(site => {
      const allDone = new Set()
      site.assignments.forEach(a => (a.completed_milestones || []).forEach(m => allDone.add(m)))
      const total = (MILESTONE_SETS[site.scope_type] || MILESTONE_SETS.GENERAL).length
      const pct   = total > 0 ? Math.round((allDone.size / total) * 100) : 0

      // Sort logs oldest→newest to get start date and build milestone→{date,emp} map
      const sortedLogs = [...site.logs].sort((a,b) => a.submitted_at > b.submitted_at ? 1 : -1)
      const startDate  = sortedLogs[0]?.submitted_at || null
      const lastUpdate = sortedLogs[sortedLogs.length-1]?.submitted_at || null
      const endDate    = pct === 100 ? lastUpdate : null

      // Build per-milestone completion info: first log that ticked it wins
      const milestoneInfo = {}
      sortedLogs.forEach(log => {
        ;(log.milestones_newly_done || []).forEach(m => {
          if (!milestoneInfo[m]) milestoneInfo[m] = { date: log.submitted_at, empId: log.employee_id }
        })
      })

      return { ...site, doneMilestones: allDone, totalMilestones: total, pct, startDate, lastUpdate, endDate, milestoneInfo }
    })
  }, [assignments, logs])

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return sites.filter(s => {
      if (filterScope  && s.scope_type !== filterScope) return false
      const st = statusLabel(s.pct).label
      if (filterStatus === 'complete'    && st !== 'Complete')    return false
      if (filterStatus === 'inprogress'  && !['In Progress','Started'].includes(st)) return false
      if (filterStatus === 'notstarted'  && st !== 'Not Started') return false
      if (filterSearch) {
        const q = filterSearch.toLowerCase()
        if (!s.site_number?.toLowerCase().includes(q) && !s.site_name?.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [sites, filterScope, filterStatus, filterSearch])

  // ── KPIs ───────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total     = sites.length
    const completed = sites.filter(s => s.pct === 100).length
    const active    = sites.filter(s => s.pct > 0 && s.pct < 100).length
    const notStart  = sites.filter(s => s.pct === 0).length
    const avgPct    = total > 0 ? Math.round(sites.reduce((s, x) => s + x.pct, 0) / total) : 0
    return [
      { label:'Total Sites',   value:total,     color:'#0079BC' },
      { label:'Completed',     value:completed, color:'#2e7d32' },
      { label:'In Progress',   value:active,    color:'#e65100' },
      { label:'Not Started',   value:notStart,  color:'#90a4ae' },
      { label:'Avg Completion',value:`${avgPct}%`, color:MC },
    ]
  }, [sites])

  // ── Helpers ────────────────────────────────────────────────────────────────
  const fmt = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'

  const toggle = key => setExpanded(p => ({ ...p, [key]: !p[key] }))

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <ChapterPage
      chapterName="Operations"
      chapterIcon="🏗️"
      chapterColor={MC}
      chapterSubtitle="Field Operations"
      sectionTitle="Site Completion Tracker"
      kpis={kpis}
      loading={loading}
    >
      {/* ── Filters ─────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16, fontFamily:FF }}>
        <input
          placeholder="🔍  Search site # or name…"
          value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
          style={{ flex:1, minWidth:180, padding:'8px 12px', border:`1.5px solid ${L1}`, borderRadius:8, fontSize:13, outline:'none', color:'#1a2e3d' }}
        />
        <select value={filterScope} onChange={e => setFilterScope(e.target.value)}
          style={{ padding:'8px 12px', border:`1.5px solid ${L1}`, borderRadius:8, fontSize:13, color:'#1a2e3d', background:'#fff' }}>
          <option value="">All Scopes</option>
          {Object.entries(SCOPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ padding:'8px 12px', border:`1.5px solid ${L1}`, borderRadius:8, fontSize:13, color:'#1a2e3d', background:'#fff' }}>
          <option value="">All Statuses</option>
          <option value="complete">Complete</option>
          <option value="inprogress">In Progress</option>
          <option value="notstarted">Not Started</option>
        </select>
        <button onClick={load} style={{
          padding:'8px 16px', background:MC, color:'#fff', border:'none',
          borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer',
        }}>↻ Refresh</button>
      </div>

      {/* ── Table ───────────────────────────────────────────────────────── */}
      <div style={{ background:'#fff', borderRadius:12, border:`1px solid ${L1}30`, overflow:'hidden', fontFamily:FF }}>
        {/* Sticky header */}
        <div style={{
          display:'grid', gridTemplateColumns:'90px 1fr 110px 100px 100px 130px 100px',
          background:MC, color:'#fff', fontSize:11, fontWeight:700,
          padding:'10px 16px', letterSpacing:0.6, position:'sticky', top:0, zIndex:2,
        }}>
          <div>SITE #</div>
          <div>SITE NAME</div>
          <div># MILESTONES</div>
          <div>START DATE</div>
          <div>END DATE</div>
          <div>% COMPLETION</div>
          <div>STATUS</div>
        </div>

        {filtered.length === 0 && !loading && (
          <div style={{ padding:48, textAlign:'center', color:'#90a4ae', fontSize:14 }}>
            No sites found matching your filters.
          </div>
        )}

        {filtered.map(site => {
          const key = site.site_number
          const open = !!expanded[key]
          const st   = statusLabel(site.pct)
          const sc   = SCOPE_COLORS[site.scope_type] || '#546e7a'
          const siteLogs = site.logs

          return (
            <div key={key}>
              {/* ── Summary row ─────────────────────────────────────────── */}
              <div
                onClick={() => toggle(key)}
                style={{
                  display:'grid', gridTemplateColumns:'90px 1fr 110px 100px 100px 130px 100px',
                  padding:'12px 16px', alignItems:'center', cursor:'pointer',
                  borderBottom:`1px solid ${L2}`,
                  background: open ? L2 : '#fff',
                  transition:'background 0.15s',
                }}
                onMouseEnter={e => { if (!open) e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={e => { if (!open) e.currentTarget.style.background = '#fff' }}
              >
                {/* Site # */}
                <div style={{ fontWeight:800, color:MC, fontSize:13 }}>{site.site_number || '—'}</div>

                {/* Site Name + chevron */}
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600, color:'#1a2e3d' }}>{site.site_name || '—'}</div>
                    <div style={{ fontSize:10, marginTop:2 }}>
                      <span style={{ padding:'2px 8px', borderRadius:12, background:`${sc}18`, color:sc, fontWeight:700, border:`1px solid ${sc}30` }}>
                        {SCOPE_LABELS[site.scope_type] || site.scope_type}
                      </span>
                    </div>
                  </div>
                  <span style={{ fontSize:11, color:'#90a4ae', marginLeft:'auto' }}>{open ? '▲' : '▼'}</span>
                </div>

                {/* # Milestones */}
                <div style={{ fontSize:13, fontWeight:700, color:'#1a2e3d' }}>
                  {site.doneMilestones.size} / {site.totalMilestones}
                </div>

                {/* Start Date */}
                <div style={{ fontSize:12, color:'#546e7a' }}>{fmt(site.startDate)}</div>

                {/* End Date */}
                <div style={{ fontSize:12, color: site.endDate ? '#2e7d32' : '#90a4ae' }}>
                  {site.endDate ? fmt(site.endDate) : '—'}
                </div>

                {/* % Completion */}
                <div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3, fontSize:11 }}>
                    <span style={{ color:pctColor(site.pct), fontWeight:800 }}>{site.pct}%</span>
                  </div>
                  <div style={{ height:6, background:'#e0e0e0', borderRadius:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${site.pct}%`, background:pctColor(site.pct), borderRadius:4, transition:'width 0.4s' }} />
                  </div>
                </div>

                {/* Status pill */}
                <div>
                  <span style={{ fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:20, background:st.bg, color:st.color }}>
                    {st.label}
                  </span>
                </div>
              </div>

              {/* ── Expanded: milestone table ─────────────────────────────── */}
              {open && (
                <div style={{ background:L2, borderBottom:`1px solid ${L1}40`, padding:'16px 20px' }}>

                  <div style={{ fontSize:11, fontWeight:700, color:MC, letterSpacing:1, marginBottom:10 }}>
                    MILESTONE DETAILS
                  </div>

                  {/* Milestone table header */}
                  <div style={{
                    display:'grid', gridTemplateColumns:'32px 1fr 120px 160px',
                    background:MC, color:'#fff', fontSize:10, fontWeight:700,
                    padding:'7px 12px', borderRadius:'8px 8px 0 0', letterSpacing:0.5,
                  }}>
                    <div>#</div>
                    <div>MILESTONE</div>
                    <div>COMPLETION DATE</div>
                    <div>COMPLETED BY</div>
                  </div>

                  {/* Milestone rows */}
                  <div style={{ background:'#fff', borderRadius:'0 0 8px 8px', border:`1px solid ${L1}40`, borderTop:'none', overflow:'hidden' }}>
                    {(MILESTONE_SETS[site.scope_type] || MILESTONE_SETS.GENERAL).map((m, idx) => {
                      const done = site.doneMilestones.has(m)
                      const info = site.milestoneInfo[m]
                      const emp  = info ? empMap[info.empId] : null
                      return (
                        <div key={m} style={{
                          display:'grid', gridTemplateColumns:'32px 1fr 120px 160px',
                          padding:'9px 12px', alignItems:'center',
                          borderBottom: idx < (MILESTONE_SETS[site.scope_type]||MILESTONE_SETS.GENERAL).length-1 ? `1px solid ${L2}` : 'none',
                          background: done ? '#f0fdf4' : '#fff',
                        }}>
                          {/* # */}
                          <div style={{
                            width:22, height:22, borderRadius:7, flexShrink:0,
                            background: done ? '#16a34a' : '#e2e8f0',
                            display:'flex', alignItems:'center', justifyContent:'center',
                          }}>
                            {done
                              ? <svg width="11" height="9" viewBox="0 0 11 9"><path d="M1 4.5L3.8 7.5L10 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                              : <span style={{ fontSize:9, fontWeight:700, color:'#94a3b8' }}>{idx+1}</span>
                            }
                          </div>
                          {/* Name */}
                          <div style={{ fontSize:13, fontWeight: done ? 600 : 400, color: done ? '#15803d' : '#64748b' }}>
                            {m}
                          </div>
                          {/* Completion date */}
                          <div style={{ fontSize:12, color: done ? '#15803d' : '#94a3b8' }}>
                            {info ? fmt(info.date) : '—'}
                          </div>
                          {/* Completed by */}
                          <div style={{ fontSize:12, color: done ? '#1a2e3d' : '#94a3b8', fontWeight: done ? 600 : 400 }}>
                            {emp ? emp.full_name_en : (done ? 'Unknown' : '—')}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Notes from most recent log */}
                  {siteLogs.filter(l=>l.notes).length > 0 && (
                    <div style={{ marginTop:12, background:'#fff', borderRadius:8, border:`1px solid ${L1}40`, padding:'10px 14px' }}>
                      <div style={{ fontSize:11, fontWeight:700, color:MC, letterSpacing:0.8, marginBottom:6 }}>LATEST NOTES</div>
                      {siteLogs.filter(l=>l.notes).slice(0,3).map(l=>(
                        <div key={l.id} style={{ fontSize:12, color:'#546e7a', marginBottom:4 }}>
                          <span style={{ fontWeight:600, color:'#1a2e3d' }}>{empMap[l.employee_id]?.full_name_en || '?'}</span>
                          {' · '}{fmt(l.submitted_at)}{' — '}<em>"{l.notes}"</em>
                          {l.photo_url && <a href={l.photo_url} target="_blank" rel="noreferrer" style={{ marginLeft:8, color:MC, fontWeight:700, textDecoration:'none', fontSize:11 }}>📷 Photo</a>}
                        </div>
                      ))}
                    </div>
                  )}

                  {siteLogs.length === 0 && (
                    <div style={{ fontSize:12, color:'#90a4ae', fontStyle:'italic', marginTop:8 }}>
                      No updates submitted yet for this site.
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </ChapterPage>
  )
}
