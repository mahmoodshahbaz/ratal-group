/**
 * SiteCompletion.jsx — PM Job & Milestone Tracker
 * Chapter: Operations  (MC=#0079BC, L1=#70A5A6, L2=#EAF3F2)
 *
 * Grouped by site → jobs → milestones (3 phases).
 * PM ticks Phase 1 & 3 milestones. Field workers tick Phase 2.
 * Calls tick_milestone() RPC — auto-locks list on first Phase-2 tick.
 *
 * Data model:
 *   site_masters → site_jobs → site_job_milestones
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase }                                  from '../lib/supabase'
import ChapterPage                                   from '../components/ChapterPage'
import FormSiteJob                                   from './FormSiteJob'
import { CHAPTER_PALETTES, GROUP_COLORS }            from '../styles/appStyles'

const MC = GROUP_COLORS.Operations
const L1 = CHAPTER_PALETTES.Operations.L1
const L2 = CHAPTER_PALETTES.Operations.L2
const FF = 'Poppins, -apple-system, sans-serif'

// ── Palette helpers ───────────────────────────────────────────────────────────
const PHASE_META = {
  1: { label:'Pre-Site',  color:'#5c6bc0', bg:'#ede7f6' },
  2: { label:'Field',     color:'#e65100', bg:'#fff3e0' },
  3: { label:'Closeout',  color:'#2e7d32', bg:'#e8f5e9' },
}

const STATUS_META = {
  NOT_STARTED: { label:'Not Started', bg:'#f5f5f5',  color:'#90a4ae' },
  IN_PROGRESS:  { label:'In Progress', bg:'#fff3e0',  color:'#e65100' },
  COMPLETE:     { label:'Complete',    bg:'#e8f5e9',  color:'#2e7d32' },
  ON_HOLD:      { label:'On Hold',     bg:'#fff8e1',  color:'#f57f17' },
  CANCELLED:    { label:'Cancelled',   bg:'#ffebee',  color:'#c62828' },
}

const UNIT_COLORS = {
  NISU:'#1565c0', TISU:'#6a1b9a', CISU:'#e65100', ITSU:'#00838f',
}

function pctColor(p) {
  if (p === 100) return '#2e7d32'
  if (p >= 60)   return '#f57f17'
  if (p > 0)     return '#1565c0'
  return '#90a4ae'
}

const fmt = d => d
  ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
  : '—'

// ── Main Component ────────────────────────────────────────────────────────────
export default function SiteCompletion({ entityId, currentEmployee }) {
  // ── Data state ───────────────────────────────────────────────────────────
  const [jobs,       setJobs]       = useState([])
  const [masters,    setMasters]    = useState([])
  const [milestones, setMilestones] = useState({})   // { [job_id]: milestone[] }
  const [empMap,     setEmpMap]     = useState({})
  const [deptMap,    setDeptMap]    = useState({})
  const [loading,    setLoading]    = useState(true)

  // ── UI state ─────────────────────────────────────────────────────────────
  const [expandedSite, setExpandedSite] = useState(null)   // site_master_id
  const [expandedJob,  setExpandedJob]  = useState(null)   // job.id
  const [ticking,      setTicking]      = useState(null)   // milestone_id being saved
  const [showForm,     setShowForm]     = useState(false)

  // ── Filters ──────────────────────────────────────────────────────────────
  const [filterUnit,   setFilterUnit]   = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSearch, setFilterSearch] = useState('')

  // ── Load ─────────────────────────────────────────────────────────────────
  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const [
      { data: jobsData },
      { data: mastersData },
      { data: empsData },
      { data: deptsData },
    ] = await Promise.all([
      supabase.from('site_jobs')
        .select('id,site_master_id,template_id,job_ref,service_unit,job_type,status,completion_pct,milestones_locked,notes,created_at,updated_at')
        .eq('entity_id', entityId)
        .order('created_at'),
      supabase.from('site_masters')
        .select('id,sm_id,site_name,dept_id')
        .eq('entity_id', entityId)
        .order('sm_id'),
      supabase.from('employees')
        .select('id,full_name_en')
        .eq('entity_id', entityId),
      supabase.from('departments')
        .select('id,name')
        .eq('entity_id', entityId),
    ])
    const em = {}; empsData?.forEach(e => { em[e.id] = e })
    const dm = {}; deptsData?.forEach(d => { dm[d.id] = d })
    setJobs(jobsData || [])
    setMasters(mastersData || [])
    setEmpMap(em)
    setDeptMap(dm)
    setLoading(false)
  }

  // Load milestones for a specific job (lazy — only when expanded)
  const loadMilestones = useCallback(async (jobId) => {
    if (milestones[jobId]) return  // already loaded
    const { data } = await supabase
      .from('site_job_milestones')
      .select('id,job_id,milestone_order,milestone_name,phase,is_optional,is_active,completed,completed_date,completed_by,photo_url,notes')
      .eq('job_id', jobId)
      .order('milestone_order')
    setMilestones(prev => ({ ...prev, [jobId]: data || [] }))
  }, [milestones])

  function handleExpandJob(jobId) {
    if (expandedJob === jobId) { setExpandedJob(null); return }
    setExpandedJob(jobId)
    loadMilestones(jobId)
  }

  // ── Tick a milestone ────────────────────────────────────────────────────
  async function tickMilestone(milestoneId, currentDone, jobId) {
    setTicking(milestoneId)
    const { data, error } = await supabase.rpc('tick_milestone', {
      payload: {
        milestone_id:  milestoneId,
        completed:     !currentDone,
        completed_by:  currentEmployee?.id || null,
        photo_url:     null,
        notes:         null,
      }
    })
    if (!error && data) {
      // Update jobs list with new pct/status
      setJobs(prev => prev.map(j =>
        j.id === jobId
          ? { ...j, completion_pct: data.completion_pct, status: data.status, milestones_locked: data.completion_pct > 0 || j.milestones_locked }
          : j
      ))
      // Update milestones state
      setMilestones(prev => ({
        ...prev,
        [jobId]: (prev[jobId] || []).map(m =>
          m.id === milestoneId
            ? { ...m, completed: !currentDone, completed_date: !currentDone ? new Date().toISOString().split('T')[0] : null, completed_by: !currentDone ? currentEmployee?.id : null }
            : m
        )
      }))
    }
    setTicking(null)
  }

  // ── Group jobs by site ──────────────────────────────────────────────────
  const masterMap = useMemo(() => {
    const m = {}; masters.forEach(s => { m[s.id] = s }); return m
  }, [masters])

  const siteGroups = useMemo(() => {
    const map = {}
    jobs.forEach(j => {
      const key = j.site_master_id
      if (!map[key]) map[key] = { master: masterMap[key] || {}, jobs: [] }
      map[key].jobs.push(j)
    })
    return Object.values(map)
      .sort((a, b) => (a.master.sm_id || '').localeCompare(b.master.sm_id || ''))
  }, [jobs, masterMap])

  // ── Filter ───────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return siteGroups
      .map(sg => {
        let filteredJobs = sg.jobs
        if (filterUnit)   filteredJobs = filteredJobs.filter(j => j.service_unit === filterUnit)
        if (filterStatus) filteredJobs = filteredJobs.filter(j => j.status === filterStatus)
        if (filterSearch) {
          const q = filterSearch.toLowerCase()
          const siteMatch = sg.master.sm_id?.toLowerCase().includes(q) || sg.master.site_name?.toLowerCase().includes(q)
          if (!siteMatch) filteredJobs = filteredJobs.filter(j => j.job_ref?.toLowerCase().includes(q) || j.job_type?.toLowerCase().includes(q))
        }
        return { ...sg, jobs: filteredJobs }
      })
      .filter(sg => sg.jobs.length > 0)
  }, [siteGroups, filterUnit, filterStatus, filterSearch])

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total    = jobs.length
    const complete = jobs.filter(j => j.status === 'COMPLETE').length
    const active   = jobs.filter(j => j.status === 'IN_PROGRESS').length
    const notStart = jobs.filter(j => j.status === 'NOT_STARTED').length
    const avgPct   = total > 0 ? Math.round(jobs.reduce((s, j) => s + j.completion_pct, 0) / total) : 0
    return [
      { label:'Total Jobs',    value:total,      color:MC },
      { label:'Complete',      value:complete,   color:'#2e7d32' },
      { label:'In Progress',   value:active,     color:'#e65100' },
      { label:'Not Started',   value:notStart,   color:'#90a4ae' },
      { label:'Avg Completion',value:`${avgPct}%`, color:MC },
    ]
  }, [jobs])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <ChapterPage
      chapterName="Operations"
      chapterIcon="🏗️"
      chapterColor={MC}
      chapterSubtitle="Field Operations"
      sectionTitle="Site Job Tracker"
      kpis={kpis}
      loading={loading}
    >
      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16, fontFamily:FF, alignItems:'center' }}>
        <input
          placeholder="🔍  Search site # / name / job ref…"
          value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
          style={{ flex:1, minWidth:180, ...S.inp }}
        />
        <select value={filterUnit} onChange={e => setFilterUnit(e.target.value)} style={S.inp}>
          <option value="">All Units</option>
          {['NISU','TISU','CISU','ITSU'].map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={S.inp}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_META).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={load} style={{ padding:'8px 14px', background:'#f0f4f8', color:'#1a2e3d', border:`1px solid ${L1}`, borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>
          ↻
        </button>
        <button onClick={() => setShowForm(true)} style={{ padding:'8px 18px', background:MC, color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer' }}>
          + New Job
        </button>
      </div>

      {/* ── Site groups ───────────────────────────────────────────────────── */}
      <div style={{ display:'flex', flexDirection:'column', gap:10, fontFamily:FF }}>
        {filtered.length === 0 && !loading && (
          <div style={{ padding:48, textAlign:'center', color:'#90a4ae', fontSize:14, background:'#fff', borderRadius:12, border:`1px solid ${L1}30` }}>
            No jobs found. Click <strong>+ New Job</strong> to create one.
          </div>
        )}

        {filtered.map(({ master, jobs: siteJobs }) => {
          const siteKey    = master.id
          const siteOpen   = expandedSite === siteKey
          const dept       = deptMap[master.dept_id]
          const anyActive  = siteJobs.some(j => j.status === 'IN_PROGRESS')
          const allDone    = siteJobs.every(j => j.status === 'COMPLETE')
          const sitePct    = siteJobs.length > 0 ? Math.round(siteJobs.reduce((s,j) => s + j.completion_pct, 0) / siteJobs.length) : 0

          return (
            <div key={siteKey} style={{ background:'#fff', borderRadius:12, border:`1px solid ${L1}40`, overflow:'hidden' }}>
              {/* ── Site header row ──────────────────────────────────────── */}
              <div
                onClick={() => setExpandedSite(siteOpen ? null : siteKey)}
                style={{
                  display:'flex', alignItems:'center', gap:12, padding:'14px 18px',
                  cursor:'pointer', background: siteOpen ? L2 : '#fff',
                  borderBottom: siteOpen ? `1px solid ${L1}40` : 'none',
                  transition:'background 0.15s',
                }}
              >
                {/* Chevron */}
                <span style={{ fontSize:12, color:'#90a4ae', width:14, flexShrink:0 }}>{siteOpen ? '▲' : '▼'}</span>

                {/* SM ID */}
                <div style={{ fontWeight:800, color:MC, fontSize:15, minWidth:70 }}>{master.sm_id || '—'}</div>

                {/* Site name + dept */}
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'#1a2e3d' }}>{master.site_name || '—'}</div>
                  {dept && <div style={{ fontSize:11, color:'#90a4ae', marginTop:2 }}>{dept.name}</div>}
                </div>

                {/* Jobs count */}
                <div style={{ fontSize:12, color:'#546e7a', minWidth:60, textAlign:'center' }}>
                  <div style={{ fontWeight:700, color:'#1a2e3d', fontSize:15 }}>{siteJobs.length}</div>
                  <div>jobs</div>
                </div>

                {/* Site avg pct */}
                <div style={{ minWidth:90 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3, fontSize:11 }}>
                    <span style={{ color:pctColor(sitePct), fontWeight:800 }}>{sitePct}%</span>
                  </div>
                  <div style={{ height:5, background:'#e0e0e0', borderRadius:3 }}>
                    <div style={{ height:'100%', width:`${sitePct}%`, background:pctColor(sitePct), borderRadius:3, transition:'width 0.4s' }} />
                  </div>
                </div>

                {/* Site status indicator */}
                <div style={{ minWidth:80, textAlign:'right' }}>
                  {allDone
                    ? <span style={{ ...pill, background:'#e8f5e9', color:'#2e7d32' }}>All Done</span>
                    : anyActive
                    ? <span style={{ ...pill, background:'#fff3e0', color:'#e65100' }}>Active</span>
                    : <span style={{ ...pill, background:'#f5f5f5', color:'#90a4ae' }}>Pending</span>
                  }
                </div>
              </div>

              {/* ── Jobs list ────────────────────────────────────────────── */}
              {siteOpen && (
                <div style={{ padding:'8px 18px 16px' }}>
                  {siteJobs.map(job => {
                    const jOpen  = expandedJob === job.id
                    const jMeta  = STATUS_META[job.status] || STATUS_META.NOT_STARTED
                    const jColor = UNIT_COLORS[job.service_unit] || '#546e7a'
                    const jMs    = milestones[job.id] || []

                    return (
                      <div key={job.id} style={{ marginTop:8, border:`1.5px solid ${jColor}30`, borderRadius:10, overflow:'hidden' }}>
                        {/* ── Job row ──────────────────────────────────── */}
                        <div
                          onClick={() => handleExpandJob(job.id)}
                          style={{
                            display:'flex', alignItems:'center', gap:12, padding:'12px 14px',
                            cursor:'pointer', background: jOpen ? `${jColor}08` : '#fafafa',
                            borderBottom: jOpen ? `1px solid ${jColor}20` : 'none',
                          }}
                        >
                          {/* Unit badge */}
                          <span style={{ ...pill, background:`${jColor}15`, color:jColor, fontSize:10, fontWeight:800 }}>
                            {job.service_unit}
                          </span>

                          {/* Job type */}
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:700, color:'#1a2e3d' }}>{job.job_type}</div>
                            {job.job_ref && <div style={{ fontSize:11, color:'#90a4ae', marginTop:1 }}>Job# {job.job_ref}</div>}
                          </div>

                          {/* Locked indicator */}
                          {job.milestones_locked && (
                            <span style={{ fontSize:10, color:'#f57f17' }} title="Milestone list locked">🔒</span>
                          )}

                          {/* Progress bar */}
                          <div style={{ minWidth:100 }}>
                            <div style={{ fontSize:11, color:pctColor(job.completion_pct), fontWeight:800, marginBottom:2, textAlign:'right' }}>
                              {job.completion_pct}%
                            </div>
                            <div style={{ height:5, background:'#e0e0e0', borderRadius:3 }}>
                              <div style={{ height:'100%', width:`${job.completion_pct}%`, background:pctColor(job.completion_pct), borderRadius:3 }} />
                            </div>
                          </div>

                          {/* Status */}
                          <span style={{ ...pill, background:jMeta.bg, color:jMeta.color, minWidth:80, textAlign:'center' }}>
                            {jMeta.label}
                          </span>

                          {/* Chevron */}
                          <span style={{ fontSize:11, color:'#90a4ae' }}>{jOpen ? '▲' : '▼'}</span>
                        </div>

                        {/* ── Milestone panels ─────────────────────────── */}
                        {jOpen && (
                          <div style={{ padding:'14px 16px', background:'#fff' }}>
                            {jMs.length === 0 && (
                              <div style={{ fontSize:12, color:'#90a4ae', fontStyle:'italic' }}>Loading milestones…</div>
                            )}

                            {/* Phase columns */}
                            {jMs.length > 0 && (
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                                {[1,2,3].map(ph => {
                                  const phMs   = jMs.filter(m => m.phase === ph && m.is_active)
                                  const phMeta = PHASE_META[ph]
                                  const phDone = phMs.filter(m => m.completed).length
                                  const phPct  = phMs.length > 0 ? Math.round(phDone * 100 / phMs.length) : 0

                                  return (
                                    <div key={ph} style={{ border:`1.5px solid ${phMeta.color}30`, borderRadius:8, overflow:'hidden' }}>
                                      {/* Phase header */}
                                      <div style={{ background:phMeta.bg, padding:'8px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                                        <div style={{ fontSize:11, fontWeight:800, color:phMeta.color, letterSpacing:0.5 }}>
                                          PHASE {ph} · {phMeta.label.toUpperCase()}
                                        </div>
                                        <div style={{ fontSize:11, color:phMeta.color, fontWeight:700 }}>
                                          {phDone}/{phMs.length} · {phPct}%
                                        </div>
                                      </div>
                                      {/* Phase progress bar */}
                                      <div style={{ height:3, background:'#e0e0e0' }}>
                                        <div style={{ height:'100%', width:`${phPct}%`, background:phMeta.color }} />
                                      </div>
                                      {/* Milestones */}
                                      <div style={{ padding:'8px 10px', display:'flex', flexDirection:'column', gap:6 }}>
                                        {phMs.length === 0 && (
                                          <div style={{ fontSize:11, color:'#90a4ae', fontStyle:'italic' }}>No milestones</div>
                                        )}
                                        {phMs.map(m => {
                                          const isLoading = ticking === m.id
                                          const emp       = m.completed_by ? empMap[m.completed_by] : null
                                          return (
                                            <div key={m.id} style={{
                                              display:'flex', alignItems:'flex-start', gap:8,
                                              padding:'7px 8px', borderRadius:6,
                                              background: m.completed ? `${phMeta.color}0d` : '#fafafa',
                                              border:`1px solid ${m.completed ? phMeta.color+'30' : '#e2e8f0'}`,
                                            }}>
                                              {/* Checkbox */}
                                              <button
                                                onClick={() => tickMilestone(m.id, m.completed, job.id)}
                                                disabled={isLoading}
                                                title={m.completed ? 'Mark incomplete' : 'Mark complete'}
                                                style={{
                                                  width:20, height:20, borderRadius:5, flexShrink:0, cursor:'pointer',
                                                  border:`2px solid ${m.completed ? phMeta.color : '#cbd5e1'}`,
                                                  background: m.completed ? phMeta.color : '#fff',
                                                  display:'flex', alignItems:'center', justifyContent:'center',
                                                  transition:'all 0.15s', opacity: isLoading ? 0.5 : 1,
                                                }}>
                                                {m.completed && (
                                                  <svg width="10" height="8" viewBox="0 0 10 8"><path d="M1 4L3.5 6.5L9 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                                                )}
                                              </button>
                                              {/* Content */}
                                              <div style={{ flex:1, minWidth:0 }}>
                                                <div style={{ fontSize:12, fontWeight: m.completed ? 600 : 400, color: m.completed ? '#1a2e3d' : '#64748b', lineHeight:1.3 }}>
                                                  {m.milestone_name}
                                                  {m.is_optional && <span style={{ marginLeft:4, fontSize:10, color:'#90a4ae' }}>(opt)</span>}
                                                </div>
                                                {m.completed && (
                                                  <div style={{ fontSize:10, color:phMeta.color, marginTop:2 }}>
                                                    {m.completed_date ? fmt(m.completed_date) : ''}
                                                    {emp && <span style={{ marginLeft:4 }}>· {emp.full_name_en}</span>}
                                                  </div>
                                                )}
                                                {m.photo_url && (
                                                  <a href={m.photo_url} target="_blank" rel="noreferrer"
                                                    style={{ fontSize:10, color:MC, textDecoration:'none', display:'block', marginTop:2 }}>
                                                    📷 Photo
                                                  </a>
                                                )}
                                              </div>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {/* Job notes */}
                            {job.notes && (
                              <div style={{ marginTop:12, fontSize:12, color:'#546e7a', background:'#f8fafc', padding:'8px 12px', borderRadius:6, borderLeft:`3px solid ${jColor}` }}>
                                <strong>Notes:</strong> {job.notes}
                              </div>
                            )}

                            {/* Lock status */}
                            {job.milestones_locked && (
                              <div style={{ marginTop:10, fontSize:11, color:'#f57f17', background:'#fff8e1', padding:'6px 12px', borderRadius:6 }}>
                                🔒 Milestone list is locked — Phase 2 work has started.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── New Job Form ─────────────────────────────────────────────────── */}
      <FormSiteJob
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        entityId={entityId}
        employeeId={currentEmployee?.id}
        onSaved={() => { setShowForm(false); load() }}
      />
    </ChapterPage>
  )
}

const pill = { fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, display:'inline-block' }

const S = {
  inp: {
    padding:'8px 12px', border:`1.5px solid ${L1}`, borderRadius:8, fontSize:13, color:'#1a2e3d',
    background:'#fff', outline:'none', fontFamily:'Poppins, sans-serif',
  },
}
