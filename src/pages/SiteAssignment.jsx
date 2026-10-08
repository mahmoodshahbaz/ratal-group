/**
 * SITE ASSIGNMENT — Bulk Roster Module
 * ─────────────────────────────────────────────────────────────────
 * Coordinator selects Department → Date → Period (Daily/Weekly/Monthly)
 * then sees every person in that dept as a roster row.
 * Per row: checkbox → Project dropdown → Site dropdown → Remote/Local
 * Sub-Contractor tab: same flow but blocked if no approved PO exists.
 *
 * SQL PATCH REQUIRED (run once in Supabase SQL Editor):
 *   supabase/site_assignment_patch.sql
 * ─────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { GROUP_COLORS } from '../styles/appStyles'

const PRI = GROUP_COLORS.Masters  // '#8C601B'
const L1  = '#C8B48F'
const L2  = '#FAF5E9'

// ── Helpers ──────────────────────────────────────────────────────
const TODAY = new Date().toISOString().split('T')[0]

function getDateRange(date, period) {
  // Always go FORWARD from the selected date — no back-dating
  const d = new Date(date + 'T00:00:00')
  if (period === 'DAILY') return { start: date, end: date }
  if (period === 'WEEKLY') {
    const end = new Date(d); end.setDate(d.getDate() + 6)
    return { start: date, end: end.toISOString().split('T')[0] }
  }
  // MONTHLY — from selected date to end of that month
  const y = d.getFullYear(), m = d.getMonth()
  const last = new Date(y, m + 1, 0).getDate()
  const mm   = String(m + 1).padStart(2, '0')
  return { start: date, end: `${y}-${mm}-${String(last).padStart(2, '0')}` }
}

function fmtDate(d) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function fmtRange(start, end) {
  return start === end ? fmtDate(start) : `${fmtDate(start)} – ${fmtDate(end)}`
}

function assignmentCoversDate(a, date) {
  if (a.assignment_start && a.assignment_end)
    return a.assignment_start <= date && a.assignment_end >= date
  return a.assignment_date === date
}

// ── Styles ────────────────────────────────────────────────────────
const S = {
  inp: {
    width: '100%', padding: '7px 10px', borderRadius: 8,
    border: '1px solid #dde3ec', fontSize: 12, outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box', background: '#fff',
  },
  label: { display: 'block', fontSize: 10, color: '#6b7c93', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 },
}

const GRID_EMP    = '28px 1fr 110px 160px 160px 90px 32px'
const GRID_SUBCON = '28px 1fr 150px 160px 160px 90px 32px'
const PERIOD_OPTS = [
  { v: 'DAILY',   l: '📅 Daily'   },
  { v: 'WEEKLY',  l: '📆 Weekly'  },
  { v: 'MONTHLY', l: '🗓 Monthly' },
]

// ─────────────────────────────────────────────────────────────────
export default function SiteAssignment({ entityId }) {

  // ── Context ───────────────────────────────────────────────────
  const [selectedDept, setSelectedDept] = useState('')
  const [selectedDate, setSelectedDate] = useState(TODAY)
  const [periodType,   setPeriodType]   = useState('DAILY')
  const [activeTab,    setActiveTab]    = useState('EMPLOYEE')

  // ── Master data ───────────────────────────────────────────────
  const [depts,     setDepts]     = useState([])
  const [projects,  setProjects]  = useState([])
  const [allSites,  setAllSites]  = useState([])
  const [employees, setEmployees] = useState([])
  const [subcons,   setSubcons]   = useState([])
  const [approvedPOs, setApprovedPOs] = useState([])
  const [existingAssignments, setExistingAssignments] = useState([])

  const [masterLoading, setMasterLoading] = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [saveMsg,       setSaveMsg]       = useState('')

  // ── Roster rows ───────────────────────────────────────────────
  const [empRows,    setEmpRows]    = useState([])
  const [subconRows, setSubconRows] = useState([])

  // ── History ───────────────────────────────────────────────────
  const [historyRows,    setHistoryRows]    = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [histFrom, setHistFrom] = useState(TODAY)
  const [histTo,   setHistTo]   = useState(TODAY)

  const dateRange = useMemo(() => getDateRange(selectedDate, periodType), [selectedDate, periodType])
  const GRID = activeTab === 'EMPLOYEE' ? GRID_EMP : GRID_SUBCON

  // ── Load masters (once per entity) ───────────────────────────
  useEffect(() => {
    if (!entityId) return
    async function loadMasters() {
      setMasterLoading(true)
      const [{ data: d }, { data: p }, { data: sm }, { data: e }, { data: s }] = await Promise.all([
        supabase.from('departments').select('id,dept_name,dept_code')
          .eq('entity_id', entityId).eq('is_active', true).order('dept_name'),
        supabase.from('projects').select('id,project_number,project_name,status,department_id')
          .eq('entity_id', entityId).order('project_number'),
        supabase.from('site_masters').select('id,sm_id,job_no,site_name,project_id,dept_id,status')
          .eq('entity_id', entityId).neq('status', 'CLOSED').neq('status', 'HANDED_OVER').order('sm_id'),
        supabase.from('employees').select('id,full_name_en,employee_number,employee_code,department_id')
          .eq('entity_id', entityId).eq('is_active', true).order('full_name_en'),
        supabase.from('contractors').select('id,contractor_name,contractor_code,vendor_type')
          .eq('entity_id', entityId).eq('status', 'ACTIVE')
          .or('vendor_type.eq.SUB_CONTRACTOR,vendor_type.eq.SUBCON'),
      ])
      setDepts(d || [])
      setProjects(p || [])
      setAllSites(sm || [])
      setEmployees(e || [])
      setSubcons(s || [])
      setMasterLoading(false)
    }
    loadMasters()
  }, [entityId])

  // ── Load approved POs (once per entity) ──────────────────────
  useEffect(() => {
    if (!entityId) return
    supabase.from('po_requests')
      .select('id,request_number,preferred_party_id,project_id,site_master_id,estimated_total,status')
      .eq('entity_id', entityId)
      .in('status', ['APPROVED', 'ISSUED', 'PARTIALLY_PAID'])
      .then(({ data }) => setApprovedPOs(data || []))
  }, [entityId])

  // ── Load existing assignments for current date range ──────────
  const loadAssignments = useCallback(async () => {
    if (!entityId) return
    const { data } = await supabase.from('site_assignments')
      .select('id,employee_id,subcon_id,site_master_id,project_id,department_id,assignment_date,is_remote,status,notes')
      .eq('entity_id', entityId)
      .eq('status', 'ACTIVE')
    const relevant = (data || []).filter(a => a.assignment_date === dateRange.start)
    setExistingAssignments(relevant)
  }, [entityId, dateRange])

  useEffect(() => { loadAssignments() }, [loadAssignments])

  // ── Load history ──────────────────────────────────────────────
  async function loadHistory() {
    if (!entityId) return
    setHistoryLoading(true)
    const { data, error } = await supabase
      .from('site_assignments')
      .select('id,assignment_date,assignee_type,is_remote,status,employee_id,subcon_id,site_master_id')
      .eq('entity_id', entityId)
      .eq('status', 'ACTIVE')
      .gte('assignment_date', histFrom)
      .lte('assignment_date', histTo)
      .order('assignment_date', { ascending: false })
    if (error) { alert(error.message); setHistoryLoading(false); return }

    // Resolve selected dept object once (much more reliable than per-row lookup)
    const activeDept = selectedDept ? depts.find(d => d.id === selectedDept) : null

    // Build a Set of employee IDs that belong to the selected dept for fast filtering
    const deptEmpIds = selectedDept
      ? new Set(employees.filter(e => e.department_id === selectedDept).map(e => e.id))
      : null

    // Filter raw records to selected dept (via employee dept_id — more reliably populated than site.dept_id)
    const filtered = selectedDept
      ? (data || []).filter(a => a.employee_id ? deptEmpIds.has(a.employee_id) : true)
      : (data || [])

    const rows = filtered.map(a => {
      const emp  = employees.find(e => e.id === a.employee_id)
      const sc   = subcons.find(s => s.id === a.subcon_id)
      const site = allSites.find(s => s.id === a.site_master_id)
      const proj = projects.find(p => p.id === site?.project_id)
      // Use selected dept for all rows (when dept selected, all rows belong to it)
      // Fall back to per-row lookup only for superadmin all-dept view
      let dept = activeDept
      if (!dept) {
        const deptId = site?.dept_id || emp?.department_id || null
        dept = deptId ? depts.find(d => d.id === deptId) : null
      }
      return {
        date:      a.assignment_date,
        deptId:    dept?.id        || '—',
        deptCode:  dept?.dept_code || '—',
        deptName:  dept?.dept_name || '—',
        name:      emp ? emp.full_name_en : (sc ? sc.contractor_name : '—'),
        type:      a.assignee_type,
        project:   proj?.project_number || '—',
        siteNo:    site?.job_no || site?.sm_id || '—',
        siteName:  site?.site_name || '—',
        remote:    a.is_remote ? 'Remote' : 'Local',
      }
    })

    setHistoryRows(rows)
    setHistoryLoading(false)
  }

  // CSV export — includes Department ID for traceability
  function exportHistory() {
    if (!historyRows.length) return
    const headers = ['Date','Department','Name','Type','Project','Site #','Site Name','Remote/Local']
    const rows = historyRows.map(r => [r.date, r.deptCode, r.name, r.type, r.project, r.siteNo, r.siteName, r.remote])
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })  // BOM for Excel UTF-8
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    const deptLabel = selectedDept ? (depts.find(d => d.id === selectedDept)?.dept_code || 'dept') : 'ALL'
    a.download = `assignments-${deptLabel}-${histFrom}-to-${histTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Filter employees by dept ──────────────────────────────────
  const filteredEmployees = useMemo(() =>
    selectedDept ? employees.filter(e => e.department_id === selectedDept) : employees,
    [employees, selectedDept]
  )

  // ── Filter projects by dept ───────────────────────────────────
  // Primary: match project.department_id (set when project is edited in Projects module)
  // Secondary: bridge through sites (for projects that have a site linked to this dept)
  // This handles both cases: dept set on project, or dept inferred from sites
  const filteredProjects = useMemo(() => {
    if (!selectedDept) return projects
    // Primary
    const byDeptId = projects.filter(p => p.department_id === selectedDept)
    if (byDeptId.length > 0) return byDeptId
    // Secondary: find projects that have at least one site in this dept
    const deptProjectIds = new Set(
      allSites.filter(s => s.dept_id === selectedDept && s.project_id).map(s => s.project_id)
    )
    return deptProjectIds.size > 0 ? projects.filter(p => deptProjectIds.has(p.id)) : []
  }, [projects, allSites, selectedDept])

  // ── Filter sites by selected project ─────────────────────────
  // Also filter by dept so cross-dept sites on same project don't appear

  // ── Build employee roster rows ────────────────────────────────
  useEffect(() => {
    setEmpRows(filteredEmployees.map(emp => {
      const existing = existingAssignments.find(a => a.employee_id === emp.id)
      return {
        id:         emp.id,
        checked:    !!existing,
        projectId:  existing?.project_id || '',
        siteId:     existing?.site_master_id || '',
        isRemote:   existing ? existing.is_remote : true,
        notes:      existing?.notes || '',
        existingId: existing?.id || null,
      }
    }))
  }, [filteredEmployees, existingAssignments])

  // ── Build sub-con roster rows ─────────────────────────────────
  useEffect(() => {
    setSubconRows(subcons.map(sc => {
      const pos      = approvedPOs.filter(po => po.preferred_party_id === sc.id)
      const existing = existingAssignments.find(a => a.subcon_id === sc.id)
      const primaryPO = pos[0] || null
      return {
        id:         sc.id,
        checked:    !!existing,
        projectId:  existing?.project_id || primaryPO?.project_id || '',
        siteId:     existing?.site_master_id || primaryPO?.site_master_id || '',
        isRemote:   existing ? existing.is_remote : true,
        notes:      existing?.notes || '',
        existingId: existing?.id || null,
        hasPO:      pos.length > 0,
        poRef:      primaryPO?.request_number || null,
        poValue:    primaryPO?.estimated_total || 0,
      }
    }))
  }, [subcons, approvedPOs, existingAssignments])

  // ── Row helpers ───────────────────────────────────────────────
  const updateEmpRow    = (id, ch) => setEmpRows(rows    => rows.map(r => r.id === id ? { ...r, ...ch } : r))
  const updateSubconRow = (id, ch) => setSubconRows(rows => rows.map(r => r.id === id ? { ...r, ...ch } : r))

  function sitesForProject(projectId) {
    if (!projectId) return []
    return allSites.filter(s =>
      s.project_id === projectId &&
      (!selectedDept || !s.dept_id || s.dept_id === selectedDept)
    )
  }

  // ── Save all checked rows ─────────────────────────────────────
  async function saveAll() {
    const rows   = activeTab === 'EMPLOYEE' ? empRows : subconRows
    const toSave = rows.filter(r => r.checked && r.siteId)
    if (!toSave.length) { alert('Check at least one person and select their site.'); return }

    setSaving(true)
    setSaveMsg('')
    try {
      // Cancel previous assignments for the same people in this period
      const existingIds = toSave.filter(r => r.existingId).map(r => r.existingId)
      if (existingIds.length)
        await supabase.from('site_assignments').update({ status: 'CANCELLED' }).in('id', existingIds)

      // Insert new records
      const records = toSave.map(r => ({
        entity_id:       entityId,
        site_master_id:  r.siteId,
        assignment_date: dateRange.start,
        assignee_type:   activeTab === 'EMPLOYEE' ? 'EMPLOYEE' : 'SUBCON',
        employee_id:     activeTab === 'EMPLOYEE' ? r.id : null,
        subcon_id:       activeTab === 'SUBCON'   ? r.id : null,
        is_remote:       r.isRemote,
        status:          'ACTIVE',
        notes:           r.notes || null,
      }))

      const { error } = await supabase.from('site_assignments').insert(records)
      if (error) throw error

      setSaveMsg(`✅ ${records.length} assignment${records.length !== 1 ? 's' : ''} saved`)
      await loadAssignments()
    } catch (e) {
      alert(e.message)
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(''), 4000)
    }
  }

  // ── Remove a single assignment ────────────────────────────────
  async function removeOne(personId) {
    const isEmp    = activeTab === 'EMPLOYEE'
    const existing = existingAssignments.find(a =>
      isEmp ? a.employee_id === personId : a.subcon_id === personId
    )
    if (!existing) return
    await supabase.from('site_assignments').update({ status: 'CANCELLED' }).eq('id', existing.id)
    await loadAssignments()
  }

  // ── Select-all free (unchecked) ───────────────────────────────
  function toggleSelectAll(checked) {
    if (activeTab === 'EMPLOYEE')
      setEmpRows(rows => rows.map(r => r.existingId ? r : { ...r, checked }))
    else
      setSubconRows(rows => rows.map(r => (!r.hasPO || r.existingId) ? r : { ...r, checked }))
  }

  // ── Derived counts ────────────────────────────────────────────
  const rows         = activeTab === 'EMPLOYEE' ? empRows : subconRows
  const checkedCount = rows.filter(r => r.checked).length
  const freeRows     = activeTab === 'EMPLOYEE'
    ? empRows.filter(r => !r.existingId)
    : subconRows.filter(r => !r.existingId && r.hasPO)
  const allFreeSelected = freeRows.length > 0 && freeRows.every(r => r.checked)

  if (masterLoading)
    return <div style={{ textAlign: 'center', padding: 60, color: '#aab2bd' }}>Loading roster…</div>

  // Department is required before anything else is accessible
  const deptRequired = !selectedDept

  // ── Header labels ─────────────────────────────────────────────
  const HEADERS = activeTab === 'EMPLOYEE'
    ? ['', 'Employee', 'Status', 'Project', 'Site', 'Type', '']
    : ['', 'Sub-Contractor', 'PO Status', 'Project', 'Site', 'Type', '']

  return (
    <div>

      {/* ══ STICKY CONTEXT BAR ══════════════════════════════════ */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#f4f7fb', boxShadow: '0 2px 6px rgba(0,0,0,0.06)' }}>

        {/* Row 1: Controls */}
        <div style={{ display: 'flex', gap: 10, padding: '10px 0 8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>

          {/* Department */}
          <div style={{ minWidth: 210 }}>
            <div style={S.label}>Department</div>
            <select style={S.inp} value={selectedDept} onChange={e => setSelectedDept(e.target.value)}>
              <option value="">All Departments</option>
              {depts.map(d => (
                <option key={d.id} value={d.id}>{d.dept_code || d.dept_name}</option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div style={{ minWidth: 150 }}>
            <div style={S.label}>Date</div>
            <input type="date" style={S.inp} value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)} />
          </div>

          {/* Period chips */}
          <div>
            <div style={S.label}>Period</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {PERIOD_OPTS.map(opt => (
                <button key={opt.v} onClick={() => setPeriodType(opt.v)}
                  style={{
                    padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                    border:      `2px solid ${periodType === opt.v ? PRI : '#dde3ec'}`,
                    background:  periodType === opt.v ? L2 : '#fff',
                    color:       periodType === opt.v ? PRI : '#6b7c93',
                  }}>
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          {/* Range label */}
          {periodType !== 'DAILY' && (
            <div style={{ background: L2, borderRadius: 8, padding: '7px 14px', fontSize: 12, color: PRI, fontWeight: 700, alignSelf: 'flex-end', whiteSpace: 'nowrap' }}>
              📅 {fmtRange(dateRange.start, dateRange.end)}
            </div>
          )}

          {/* Save button — only when dept is selected */}
          <div style={{ marginLeft: 'auto', alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 10 }}>
            {saveMsg && <span style={{ fontSize: 12, color: '#2e7d32', fontWeight: 700 }}>{saveMsg}</span>}
            {!deptRequired && <button onClick={saveAll} disabled={saving || checkedCount === 0}
              style={{
                background: (saving || checkedCount === 0) ? '#ccc' : PRI,
                color: '#fff', border: 'none', borderRadius: 10, padding: '9px 22px',
                cursor: (saving || checkedCount === 0) ? 'not-allowed' : 'pointer',
                fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
              }}>
              {saving ? '⏳ Saving…' : `💾 Save ${checkedCount} Assignment${checkedCount !== 1 ? 's' : ''}`}
            </button>}
          </div>
        </div>

        {/* Row 2: Tabs */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 8 }}>
          {[
            ['EMPLOYEE', '👤 Employees',        filteredEmployees.length],
            ['SUBCON',   '🔧 Sub-Contractors',  subcons.length],
            ['HISTORY',  '📋 History',          null],
          ].map(([v, l, count]) => (
            <button key={v} onClick={() => setActiveTab(v)}
              style={{
                padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                background: activeTab === v ? PRI : '#e8edf5',
                color:      activeTab === v ? '#fff' : '#6b7c93',
              }}>
              {l}
              {count !== null && <span style={{ background: activeTab === v ? 'rgba(255,255,255,0.25)' : '#d0d7e3', borderRadius: 12, padding: '1px 7px', fontSize: 11, marginLeft: 6 }}>{count}</span>}
            </button>
          ))}
          {activeTab !== 'HISTORY' && (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: '#6b7c93', fontWeight: 700, userSelect: 'none' }}>
                <input type="checkbox" checked={allFreeSelected}
                  onChange={e => toggleSelectAll(e.target.checked)}
                  style={{ width: 15, height: 15 }} />
                Select all free
              </label>
            </div>
          )}
        </div>

        {/* Column headers — roster tabs only */}
        {activeTab !== 'HISTORY' && <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, background: '#fff', borderTop: '2px solid #e8edf2', borderBottom: '1px solid #e8edf2', padding: '8px 14px', alignItems: 'center' }}>
          {HEADERS.map((h, i) => (
            <div key={i} style={{ fontSize: 10, color: '#fff', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'left' }}>{h}</div>
          ))}
        </div>}
      </div>

      {/* ══ ROSTER ══════════════════════════════════════════════ */}
      {deptRequired ? (
        <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏢</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#1a2540', marginBottom: 6 }}>Select a Department to continue</div>
          <div style={{ fontSize: 13, color: '#6b7c93' }}>Choose a department from the dropdown above to load the roster for that team.</div>
        </div>
      ) : (<>
      <div style={{ background: '#fff', borderRadius: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.07)', overflow: 'hidden' }}>

        {/* ── HISTORY TAB ──────────────────────────────────── */}
        {activeTab === 'HISTORY' && (
          <div style={{ padding: 16 }}>
            {/* Date range + controls */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 16 }}>
              <div>
                <div style={S.label}>From</div>
                <input type="date" style={{ ...S.inp, width: 150 }} value={histFrom} onChange={e => setHistFrom(e.target.value)} />
              </div>
              <div>
                <div style={S.label}>To</div>
                <input type="date" style={{ ...S.inp, width: 150 }} value={histTo} onChange={e => setHistTo(e.target.value)} />
              </div>
              <button onClick={loadHistory} disabled={historyLoading}
                style={{ padding: '8px 18px', borderRadius: 8, background: PRI, color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {historyLoading ? 'Loading…' : '🔍 Search'}
              </button>
              {historyRows.length > 0 && (
                <button onClick={exportHistory}
                  style={{ padding: '8px 18px', borderRadius: 8, background: '#2e7d32', color: '#fff', border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  ⬇ Export CSV
                </button>
              )}
              {historyRows.length > 0 && (
                <span style={{ fontSize: 12, color: '#6b7c93', alignSelf: 'center' }}>{historyRows.length} records</span>
              )}
            </div>

            {/* Results table */}
            {historyRows.length === 0 && !historyLoading && (
              <EmptyState msg="Select a date range and click Search to view assignment history." />
            )}
            {historyRows.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#8C601B' }}>
                    {['Date','Dept','Name','Type','Project','Site #','Site Name','Remote/Local'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #7a5217' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((r, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fafbfc', borderBottom: '1px solid #f0f4f8' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 700, color: PRI }}>{fmtDate(r.date)}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ background: '#f3f0ff', color: '#5A32D4', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }}>
                          {r.deptCode}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1a2540' }}>{r.name}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ background: r.type === 'EMPLOYEE' ? '#e3f2fd' : '#fff3e0', color: r.type === 'EMPLOYEE' ? '#1565c0' : '#e65100', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                          {r.type === 'EMPLOYEE' ? '👤 Employee' : '🔧 SubCon'}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: '#5A32D4', fontWeight: 700 }}>{r.project}</td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontWeight: 700 }}>{r.siteNo}</td>
                      <td style={{ padding: '8px 10px', color: '#6b7c93' }}>{r.siteName}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ background: r.remote === 'Remote' ? '#e8f5e9' : '#fff3e0', color: r.remote === 'Remote' ? '#2e7d32' : '#e65100', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                          {r.remote === 'Remote' ? '🌍 Remote' : '📍 Local'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── EMPLOYEE TAB ─────────────────────────────────── */}
        {activeTab === 'EMPLOYEE' && (
          empRows.length === 0
            ? <EmptyState msg={selectedDept ? 'No employees in this department.' : 'Select a department above to filter the roster.'} />
            : empRows.map(row => {
              const emp   = employees.find(e => e.id === row.id)
              const sites = sitesForProject(row.projectId)
              const isAssigned = !!row.existingId
              return (
                <div key={row.id} style={{
                  display: 'grid', gridTemplateColumns: GRID_EMP, gap: 8,
                  padding: '8px 14px', borderBottom: '1px solid #f0f4f8', alignItems: 'center',
                  background: isAssigned ? `${PRI}0d` : 'white',
                  transition: 'background 0.1s',
                }}>

                  {/* Checkbox */}
                  <input type="checkbox" checked={row.checked}
                    onChange={e => updateEmpRow(row.id, { checked: e.target.checked })}
                    style={{ width: 15, height: 15, cursor: 'pointer', accentColor: PRI }} />

                  {/* Name */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1a2540', textAlign: 'left' }}>{emp?.full_name_en}</div>
                    <div style={{ fontSize: 10, color: '#aab2bd', textAlign: 'left' }}>{emp?.employee_number || emp?.employee_code || ''}</div>
                  </div>

                  {/* Status */}
                  <div style={{ textAlign: 'left' }}>
                    <span style={{
                      background: isAssigned ? `${PRI}18` : '#e8f5e9',
                      color:      isAssigned ? PRI : '#2e7d32',
                      borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700,
                    }}>
                      {isAssigned ? '📌 Assigned' : '🟢 Free'}
                    </span>
                  </div>

                  {/* Project */}
                  <select value={row.projectId} disabled={!row.checked}
                    onChange={e => updateEmpRow(row.id, { projectId: e.target.value, siteId: '' })}
                    style={{ ...S.inp, opacity: row.checked ? 1 : 0.35 }}>
                    <option value="">— Project —</option>
                    {filteredProjects.map(p => (
                      <option key={p.id} value={p.id}>{p.project_number} {p.project_name ? `· ${p.project_name}` : ''}</option>
                    ))}
                  </select>

                  {/* Site */}
                  <select value={row.siteId} disabled={!row.checked}
                    onChange={e => updateEmpRow(row.id, { siteId: e.target.value })}
                    style={{ ...S.inp, opacity: row.checked ? 1 : 0.35 }}>
                    <option value="">— Site —</option>
                    {sites.map(s => (
                      <option key={s.id} value={s.id}>{s.job_no || s.sm_id}{s.site_name ? ` — ${s.site_name}` : ''}</option>
                    ))}
                  </select>

                  {/* Remote / Local toggle */}
                  <button
                    disabled={!row.checked}
                    onClick={() => row.checked && updateEmpRow(row.id, { isRemote: !row.isRemote })}
                    style={{
                      background: row.isRemote ? '#e8f5e9' : '#fff3e0',
                      color:      row.isRemote ? '#2e7d32' : '#e65100',
                      border: 'none', borderRadius: 6, padding: '5px 8px',
                      fontSize: 11, fontWeight: 700, cursor: row.checked ? 'pointer' : 'default',
                      opacity: row.checked ? 1 : 0.35, whiteSpace: 'nowrap', textAlign: 'center',
                    }}>
                    {row.isRemote ? '🌍 Remote' : '📍 Local'}
                  </button>

                  {/* Remove */}
                  {isAssigned
                    ? <button onClick={() => removeOne(row.id)}
                        style={{ background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 14 }}>✕</button>
                    : <div />
                  }
                </div>
              )
            })
        )}

        {/* ── SUB-CONTRACTOR TAB ───────────────────────────── */}
        {activeTab === 'SUBCON' && (
          subconRows.length === 0
            ? <EmptyState msg="No active sub-contractors found. Add sub-contractors in Party List first." />
            : subconRows.map(row => {
              const sc         = subcons.find(s => s.id === row.id)
              const sites      = sitesForProject(row.projectId)
              const isAssigned = !!row.existingId
              const canAssign  = row.hasPO
              return (
                <div key={row.id} style={{
                  display: 'grid', gridTemplateColumns: GRID_SUBCON, gap: 8,
                  padding: '8px 14px', borderBottom: '1px solid #f0f4f8', alignItems: 'center',
                  background: isAssigned ? `${PRI}0d` : !canAssign ? '#fffde7' : 'white',
                  opacity: !canAssign ? 0.7 : 1,
                  transition: 'background 0.1s',
                }}>

                  {/* Checkbox */}
                  <input type="checkbox" checked={row.checked} disabled={!canAssign}
                    onChange={e => updateSubconRow(row.id, { checked: e.target.checked })}
                    style={{ width: 15, height: 15, cursor: canAssign ? 'pointer' : 'not-allowed', accentColor: PRI }} />

                  {/* Name */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1a2540', textAlign: 'left' }}>{sc?.contractor_name}</div>
                    <div style={{ fontSize: 10, color: '#aab2bd', textAlign: 'left' }}>{sc?.contractor_code}</div>
                  </div>

                  {/* PO Status */}
                  <div style={{ textAlign: 'left' }}>
                    {canAssign
                      ? <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700 }}>
                          ✅ {row.poRef}
                        </span>
                      : <span style={{ background: '#ffebee', color: '#c62828', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700 }}>
                          ⚠️ No PO
                        </span>
                    }
                  </div>

                  {/* Project */}
                  <select value={row.projectId} disabled={!row.checked || !canAssign}
                    onChange={e => updateSubconRow(row.id, { projectId: e.target.value, siteId: '' })}
                    style={{ ...S.inp, opacity: (row.checked && canAssign) ? 1 : 0.35 }}>
                    <option value="">— Project —</option>
                    {filteredProjects.map(p => (
                      <option key={p.id} value={p.id}>{p.project_number} {p.project_name ? `· ${p.project_name}` : ''}</option>
                    ))}
                  </select>

                  {/* Site */}
                  <select value={row.siteId} disabled={!row.checked || !canAssign}
                    onChange={e => updateSubconRow(row.id, { siteId: e.target.value })}
                    style={{ ...S.inp, opacity: (row.checked && canAssign) ? 1 : 0.35 }}>
                    <option value="">— Site —</option>
                    {sites.map(s => (
                      <option key={s.id} value={s.id}>{s.job_no || s.sm_id}{s.site_name ? ` — ${s.site_name}` : ''}</option>
                    ))}
                  </select>

                  {/* Remote / Local */}
                  <button
                    disabled={!row.checked || !canAssign}
                    onClick={() => (row.checked && canAssign) && updateSubconRow(row.id, { isRemote: !row.isRemote })}
                    style={{
                      background: row.isRemote ? '#e8f5e9' : '#fff3e0',
                      color:      row.isRemote ? '#2e7d32' : '#e65100',
                      border: 'none', borderRadius: 6, padding: '5px 8px',
                      fontSize: 11, fontWeight: 700,
                      cursor: (row.checked && canAssign) ? 'pointer' : 'default',
                      opacity: (row.checked && canAssign) ? 1 : 0.35,
                      whiteSpace: 'nowrap', textAlign: 'center',
                    }}>
                    {row.isRemote ? '🌍 Remote' : '📍 Local'}
                  </button>

                  {/* Remove */}
                  {isAssigned
                    ? <button onClick={() => removeOne(row.id)}
                        style={{ background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 14 }}>✕</button>
                    : <div />
                  }
                </div>
              )
            })
        )}
      </div>

      {/* ── No-PO notice ──────────────────────────────────────── */}
      {activeTab === 'SUBCON' && subconRows.some(r => !r.hasPO) && (
        <div style={{ background: '#fff8e1', borderRadius: 10, padding: '10px 16px', marginTop: 12, fontSize: 12, color: '#f57c00', fontWeight: 600 }}>
          ⚠️ Rows highlighted in yellow have no approved PO. Go to <strong>PO Requests</strong> and issue a PO for that sub-contractor before you can assign them to a site.
        </div>
      )}

      {/* ── Summary footer ────────────────────────────────────── */}
      {rows.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: 12, color: '#6b7c93', padding: '0 4px' }}>
          <span>Total: <strong style={{ color: '#1a2540' }}>{rows.length}</strong></span>
          <span>Assigned: <strong style={{ color: PRI }}>{rows.filter(r => r.existingId).length}</strong></span>
          <span>Free: <strong style={{ color: '#2e7d32' }}>{rows.filter(r => !r.existingId).length}</strong></span>
          {activeTab === 'SUBCON' && (
            <span>No PO: <strong style={{ color: '#e65100' }}>{rows.filter(r => !r.hasPO).length}</strong></span>
          )}
          {periodType !== 'DAILY' && (
            <span style={{ marginLeft: 'auto', color: PRI, fontWeight: 700 }}>
              Period: {fmtRange(dateRange.start, dateRange.end)}
            </span>
          )}
        </div>
      )}
      </>)}{/* end deptRequired ternary */}

    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────
function EmptyState({ msg }) {
  return (
    <div style={{ textAlign: 'center', padding: 50, color: '#aab2bd' }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
      <div style={{ fontSize: 13 }}>{msg}</div>
    </div>
  )
}
