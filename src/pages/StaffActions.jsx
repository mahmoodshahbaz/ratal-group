import { GROUP_COLORS, kpiCardGradient } from '../styles/appStyles'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import FormShell from '../components/FormShell'
import PageBanner from '../components/PageBanner'

const L1 = '#BCA99A'
const L2 = '#F7F2ED'
const L3 = '#795338'

// ─── Staff Action Request page — DEPT_HEAD portal ────────────────
// Tabs: My Team | Submit Action | Budget View | My Submissions
// DOES NOT show individual salary figures — only aggregate dept cost

const TODAY = new Date().toISOString().slice(0, 10)
const THIS_MONTH = new Date().toISOString().slice(0, 7)
const SAR_FMT = v => `SAR ${(+v || 0).toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`

function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24))
}

const ACTION_TYPES = [
  { value: 'RELEASE',            label: 'Release / Termination' },
  { value: 'PAYROLL_HOLD',       label: 'Payroll Hold (this month only)' },
  { value: 'TRANSFER',           label: 'Department Transfer' },
  { value: 'CONTRACT_EXTENSION', label: 'Contract Extension' },
  { value: 'TYPE_CHANGE',        label: 'Type Change (Outsource → Direct)' },
]

const REASONS = {
  RELEASE: [
    { value: 'PROJECT_COMPLETED',  label: 'Project completed' },
    { value: 'PROJECT_ON_HOLD',    label: 'Project on hold' },
    { value: 'END_OF_CONTRACT',    label: 'End of contract' },
    { value: 'MUTUAL_AGREEMENT',   label: 'Mutual agreement' },
    { value: 'PERFORMANCE',        label: 'Performance issue' },
    { value: 'REDUNDANCY',         label: 'Redundancy / restructuring' },
    { value: 'OTHER',              label: 'Other' },
  ],
  PAYROLL_HOLD: [
    { value: 'AWOL',               label: 'Absent without leave (AWOL)' },
    { value: 'UNPAID_LEAVE',       label: 'Unpaid leave' },
    { value: 'UNDER_INVESTIGATION',label: 'Under investigation' },
    { value: 'SALARY_DISPUTED',    label: 'Salary disputed' },
    { value: 'OTHER',              label: 'Other' },
  ],
  TRANSFER: [
    { value: 'OPERATIONAL_NEED',   label: 'Operational need' },
    { value: 'PROMOTION',          label: 'Promotion' },
    { value: 'RESTRUCTURING',      label: 'Restructuring' },
    { value: 'EMPLOYEE_REQUEST',   label: 'Employee request' },
    { value: 'OTHER',              label: 'Other' },
  ],
  CONTRACT_EXTENSION: [
    { value: 'PROJECT_EXTENDED',   label: 'Project extended' },
    { value: 'PERFORMANCE',        label: 'Good performance / retention' },
    { value: 'BUSINESS_NEED',      label: 'Business need' },
    { value: 'OTHER',              label: 'Other' },
  ],
  TYPE_CHANGE: [
    { value: 'ABSORBED',           label: 'Absorbed as direct employee' },
    { value: 'RECLASSIFICATION',   label: 'Reclassification' },
    { value: 'OTHER',              label: 'Other' },
  ],
}

const NOTICE_PERIODS = [
  { value: 'IMMEDIATE', label: 'Immediate' },
  { value: '1_WEEK',    label: '1 week' },
  { value: '2_WEEKS',   label: '2 weeks' },
  { value: '1_MONTH',   label: '1 month' },
  { value: 'OTHER',     label: 'Other / As per contract' },
]

const STATUS_STYLE = {
  PENDING:      { bg: '#fff3e0', color: '#e65100', label: 'Pending' },
  ACKNOWLEDGED: { bg: '#e8f5e9', color: '#2e7d32', label: 'Acknowledged' },
  PROCESSED:    { bg: '#e3f2fd', color: '#1565C0', label: 'Processed' },
  CANCELLED:    { bg: '#f5f7fa', color: '#aab2bd', label: 'Cancelled' },
}

const EMPTY_FORM = {
  employee_id: '',
  action_type: 'RELEASE',
  notice_given_date: TODAY,
  last_working_day: '',
  hold_month: THIS_MONTH,
  notice_period: '1_MONTH',
  transfer_to_dept_id: '',
  new_contract_end: '',
  reason: '',
  notes: '',
}

const MC = GROUP_COLORS.HR

const S = {
  card:  { background: '#fff', borderRadius: 4, padding: '18px 22px', boxShadow: '0 2px 10px rgba(0,0,0,0.07)', marginBottom: 16 },
  inp:   { width: '100%', padding: '8px 10px', borderRadius: 4, border: '1px solid #dde3ec', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'Poppins, sans-serif' },
  btn:   (c = L3) => ({ background: c, color: '#fff', border: 'none', borderRadius: 4, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Poppins, sans-serif' }),
  label: { display: 'block', fontSize: 11, color: '#6b7c93', fontWeight: 700, marginBottom: 4, fontFamily: 'Poppins, sans-serif' },
  tab:   a => ({ padding: '7px 18px', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 700, marginRight: 6, background: a ? L3 : '#f0f4f8', color: a ? '#fff' : '#6b7c93', fontFamily: 'Poppins, sans-serif' }),
  th:    { background: L3, color: '#fff', padding: '9px 14px', fontWeight: 700, textAlign: 'left', fontSize: 11 },
  td:    { padding: '10px 14px', borderBottom: '1px solid #f0f4f8', verticalAlign: 'middle', fontSize: 12 },
}

export default function StaffActions({ entityId }) {
  const { profile } = useAuth()
  const [tab,          setTab]        = useState('team')
  const [employees,    setEmp]        = useState([])
  const [depts,        setDepts]      = useState([])
  const [myDept,       setMyDept]     = useState(null)
  const [activeDeptId, setActiveDeptId] = useState('')  // Admin override: selected dept
  const [sars,         setSars]       = useState([])
  const [loading,      setLoading]    = useState(true)
  const [empLoading,   setEmpLoading] = useState(false)
  const [saving,       setSaving]     = useState(false)
  const [form,         setForm]       = useState(EMPTY_FORM)
  const [deptCost,     setDeptCost]   = useState(0)
  const [msg,          setMsg]        = useState(null)
  const [showBanner,   setShowBanner] = useState(false)
  const [showModal,    setShowModal]  = useState(false)
  const [wizardStep,   setWizardStep] = useState(1)

  // isAdmin = no dept matched → show dept selector
  const isAdmin = !myDept

  useEffect(() => { if (entityId) load() }, [entityId, profile?.email])

  async function load() {
    setLoading(true)

    // 1. Departments for this entity
    const { data: deptData, error: deptErr } = await supabase
      .from('departments')
      .select('id, dept_name, dept_code')
      .eq('entity_id', entityId)
      .eq('is_active', true)
      .order('dept_name')
    if (deptErr) console.error('Departments load error:', deptErr.message)
    setDepts(deptData || [])

    // 2. Find my department — try multiple matching strategies
    const myDeptKey = (profile?.department || '').toLowerCase().trim()
    const found = myDeptKey
      ? (deptData || []).find(d =>
          d.dept_name?.toLowerCase().trim()  === myDeptKey ||
          d.dept_code?.toLowerCase().trim()  === myDeptKey ||
          d.dept_name?.toLowerCase().trim().includes(myDeptKey) ||
          myDeptKey.includes(d.dept_code?.toLowerCase().trim() || '__NO__')
        )
      : null
    setMyDept(found || null)

    const deptToLoad = found?.id || null

    if (deptToLoad) {
      await loadEmployeesForDept(deptToLoad, entityId)
    } else {
      // Admin / unmatched dept — clear employees; they'll pick a dept manually
      setEmp([]); setDeptCost(0)
    }

    // 5. SARs submitted by me for this entity
    const { data: sarData } = await supabase
      .from('staff_action_requests')
      .select('*, employees(full_name, full_name_en, employee_no, employee_number)')
      .eq('entity_id', entityId)
      .eq('submitted_by_email', profile?.email || '')
      .order('created_at', { ascending: false })
      .limit(60)
    setSars(sarData || [])

    setLoading(false)
  }

  // Load employees for a given dept ID (used by both DH auto-load and Admin dept picker)
  async function loadEmployeesForDept(deptId, eid) {
    setEmpLoading(true)
    const [{ data: empData }, { data: costData }] = await Promise.all([
      supabase.from('employees')
        .select('id, full_name, full_name_en, employee_no, employee_number, employee_type, contract_end_date, is_active, department_id')
        .eq('entity_id', eid || entityId)
        .eq('department_id', deptId)
        .eq('is_active', true)
        .order('full_name'),
      supabase.from('employees')
        .select('bank_portion, cash_portion, basic_salary, housing_allowance, transport_allowance')
        .eq('entity_id', eid || entityId)
        .eq('department_id', deptId)
        .eq('is_active', true),
    ])
    setEmp(empData || [])
    const total = (costData || []).reduce((s, e) => {
      const bp = +(e.bank_portion || 0), cp = +(e.cash_portion || 0)
      const comp = +(e.basic_salary || 0) + +(e.housing_allowance || 0) + +(e.transport_allowance || 0)
      return s + (bp > 0 ? bp + cp : comp)
    }, 0)
    setDeptCost(total)
    setEmpLoading(false)
  }

  // Admin dept picker change
  async function onAdminDeptChange(deptId) {
    setActiveDeptId(deptId)
    setF('employee_id', '')   // reset selected employee
    if (deptId) await loadEmployeesForDept(deptId)
    else { setEmp([]); setDeptCost(0) }
  }

  function flash(type, text) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 5000)
  }

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Active dept for display (DH's own dept, or admin-selected dept)
  const activeDept = myDept || depts.find(d => d.id === activeDeptId) || null

  async function submitSar() {
    if (!form.employee_id) { alert('Please select an employee'); return }
    if (!form.reason)      { alert('Please select a reason'); return }
    if (form.action_type === 'RELEASE' && !form.last_working_day) { alert('Last working day is required for a Release action'); return }
    if (form.action_type === 'TRANSFER' && !form.transfer_to_dept_id) { alert('Select the destination department'); return }

    setSaving(true)
    const payload = {
      entity_id:             entityId,
      employee_id:           form.employee_id,
      submitted_by_name:     profile?.full_name || profile?.email || '',
      submitted_by_email:    profile?.email || '',
      department_name:       activeDept?.dept_name || profile?.department || '',
      action_type:           form.action_type,
      notice_given_date:     form.notice_given_date || null,
      last_working_day:      form.action_type === 'RELEASE'            ? (form.last_working_day || null) : null,
      hold_month:            form.action_type === 'PAYROLL_HOLD'       ? form.hold_month : null,
      transfer_to_dept_id:   form.action_type === 'TRANSFER'           ? (form.transfer_to_dept_id || null) : null,
      transfer_to_dept_name: form.action_type === 'TRANSFER'
        ? (depts.find(d => d.id === form.transfer_to_dept_id)?.dept_name || '') : null,
      notice_period:         form.notice_period,
      reason:                form.reason,
      notes:                 form.notes || null,
      status:                'PENDING',
    }

    const { error } = await supabase.from('staff_action_requests').insert(payload)
    setSaving(false)
    if (error) { alert(error.message); return }

    flash('success', 'SAR submitted. Payroll has been notified.')
    setForm(EMPTY_FORM)
    setShowModal(false)
    setWizardStep(1)
    load()
    setTab('history')
  }

  const empName = e => e.full_name || e.full_name_en || e.employee_no || e.employee_number || '—'
  const empId   = e => e.employee_no || e.employee_number || ''

  // Expiry buckets
  const expiring7  = employees.filter(e => { const d = daysUntil(e.contract_end_date); return d !== null && d >= 0 && d <= 7 })
  const expiring30 = employees.filter(e => { const d = daysUntil(e.contract_end_date); return d !== null && d > 7 && d <= 30 })

  const pendingCount = sars.filter(s => s.status === 'PENDING').length
  const expiringCount = expiring7.length + expiring30.length
  const kpis = [
    { label: 'Active Employees', val: employees.length, unit: 'people' },
    { label: 'Monthly Dept Cost', val: `SAR ${(deptCost || 0).toLocaleString('en', { maximumFractionDigits: 0 })}`, unit: null },
    { label: 'Expiring ≤30 Days', val: expiringCount, unit: 'contracts' },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden', background:L2, fontFamily:'Poppins,sans-serif', fontSize:13 }}>

      {/* ══ UPPER ZONE ══ */}
      <div style={{ flexShrink:0, background:L2, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', zIndex:10 }}>

        {/* L1 Heading Bar */}
        <div style={{ padding:'6px 28px 0' }}>
          <div style={{ background:L1, padding:'8px 16px', borderRadius:'6px 6px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#fff' }}>👥 Staff Actions</div>
              <div style={{ fontSize:10, color:'#fff', opacity:0.85 }}>
                Dept Head Portal — Submit staff action requests and track their status
                {myDept && <span style={{ marginLeft:8, background:'rgba(255,255,255,0.25)', borderRadius:4, padding:'1px 7px' }}>{myDept.dept_code || myDept.dept_name}</span>}
              </div>
            </div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.8)' }}>{profile?.full_name || profile?.email}</div>
          </div>
        </div>

        {/* KPI strip */}
        <div style={{ display:'flex', gap:12, padding:'10px 28px 12px', background:L2, flexWrap:'wrap' }}>
          {kpis.map((k, i) => {
            const g = kpiCardGradient(i, L1, L2, L3)
            return (
              <div key={k.label} style={{ ...g, width:160, height:62, borderRadius:10, padding:'0 14px', flexShrink:0, boxShadow:'0 2px 8px rgba(0,0,0,0.12)', display:'flex', flexDirection:'column', justifyContent:'center' }}>
                <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', opacity:0.75, marginBottom:2 }}>{k.label}</div>
                <div style={{ fontSize:17, fontWeight:800, lineHeight:1 }}>{k.val}</div>
                {k.unit && <div style={{ fontSize:9, opacity:0.7, marginTop:2 }}>{k.unit}</div>}
              </div>
            )
          })}
        </div>

        {/* Tab bar */}
        <div style={{ padding:'0 28px', borderBottom:'2px solid #e8edf2' }}>
          <div style={{ display:'flex', gap:0, background:'transparent', paddingTop:4 }}>
            {[
              { key:'team',    label:'👥 My Team' },
              { key:'sar',     label:'📋 Submit Action' },
              { key:'budget',  label:'📊 Budget View' },
              { key:'history', label:'📁 My Submissions', badge: pendingCount },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                background:'transparent', color: tab === t.key ? L3 : '#6b7c93',
                border:'none', borderBottom: tab === t.key ? `2px solid ${L3}` : '2px solid transparent',
                padding:'7px 20px', fontSize:12, fontWeight:700, cursor:'pointer',
                fontFamily:'Poppins,sans-serif', marginBottom:-2,
              }}>
                {t.label}
                {t.badge > 0 && <span style={{ marginLeft:5, background:'#e65100', color:'#fff', borderRadius:10, padding:'1px 6px', fontSize:10 }}>{t.badge}</span>}
              </button>
            ))}
          </div>
        </div>

      </div>{/* end upper zone */}

      {/* ══ SCROLL ZONE ══ */}
      <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:'0 28px 22px' }}>
      <div style={{ background:'#fff', borderRadius:'0 0 8px 8px', boxShadow:'0 2px 8px rgba(0,0,0,0.08)', padding:'16px 20px' }}>

      {/* No dept assigned warning */}
      {!loading && !myDept && (
        <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 10, padding: '14px 18px', marginBottom: 16, fontSize: 13, color: '#e65100' }}>
          ⚠️ Your user account does not have a department assigned. Ask your system administrator to set your department in User Management.
        </div>
      )}

      {/* Flash message */}
      {msg && (
        <div style={{ background: msg.type === 'success' ? '#e8f5e9' : '#ffebee', border: `1px solid ${msg.type === 'success' ? '#a5d6a7' : '#ef9a9a'}`, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13, color: msg.type === 'success' ? '#2e7d32' : '#c62828' }}>
          {msg.type === 'success' ? '✅ ' : '❌ '}{msg.text}
        </div>
      )}

      {loading && <div style={{ color: '#6b7c93', padding: 20 }}>Loading…</div>}

      {/* ── MY TEAM TAB ── */}
      {!loading && tab === 'team' && (
        <>
          {(expiring7.length > 0 || expiring30.length > 0) && (
            <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: 10, padding: '12px 16px', marginBottom: 14, fontSize: 13 }}>
              <strong style={{ color: '#e65100' }}>⚠️ Contract expiry alerts:</strong>
              {expiring7.map(e => (
                <div key={e.id} style={{ marginTop: 4, color: '#b71c1c' }}>
                  🔴 {empName(e)} — expires {e.contract_end_date} ({daysUntil(e.contract_end_date)} days)
                </div>
              ))}
              {expiring30.map(e => (
                <div key={e.id} style={{ marginTop: 4, color: '#e65100' }}>
                  🟡 {empName(e)} — expires {e.contract_end_date} ({daysUntil(e.contract_end_date)} days)
                </div>
              ))}
            </div>
          )}

          <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
            <div style={{ background: '#1a2e3d', padding: '10px 16px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>
                {myDept ? `${myDept.dept_name} — Active Employees` : 'My Department'}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{employees.length} employees · Names & contracts only</span>
            </div>
            {employees.length === 0
              ? <div style={{ padding: 24, color: '#aab2bd', textAlign: 'center' }}>No active employees found in your department.</div>
              : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={S.th}>Name</th>
                      <th style={S.th}>ID</th>
                      <th style={S.th}>Type</th>
                      <th style={S.th}>Contract Expiry</th>
                      <th style={S.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(emp => {
                      const days = daysUntil(emp.contract_end_date)
                      const expiryColor = days === null ? '#6b7c93'
                        : days <= 0  ? '#c62828'
                        : days <= 7  ? '#b71c1c'
                        : days <= 30 ? '#e65100'
                        : '#2e7d32'
                      return (
                        <tr key={emp.id} style={{ background: (days !== null && days <= 7) ? '#fff8f7' : '#fff' }}>
                          <td style={{ ...S.td, fontWeight: 600 }}>{empName(emp)}</td>
                          <td style={S.td}>{empId(emp)}</td>
                          <td style={S.td}>
                            <span style={{ background: emp.employee_type === 'OUTSOURCED' ? '#e3f2fd' : '#e8f5e9', color: emp.employee_type === 'OUTSOURCED' ? '#1565C0' : '#2e7d32', borderRadius: 5, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
                              {emp.employee_type || 'DIRECT'}
                            </span>
                          </td>
                          <td style={{ ...S.td, color: expiryColor, fontWeight: days !== null && days <= 30 ? 700 : 400 }}>
                            {emp.contract_end_date
                              ? `${emp.contract_end_date}${days !== null ? ` (${days <= 0 ? 'EXPIRED' : days + ' days'})` : ''}`
                              : <span style={{ color: '#aab2bd' }}>Permanent</span>}
                          </td>
                          <td style={S.td}>
                            <span style={{ background: '#e8f5e9', color: '#2e7d32', borderRadius: 5, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>Active</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )
            }
          </div>
          <div style={{ fontSize: 11, color: '#aab2bd', marginTop: 4 }}>
            ℹ️ Salary and bank details are not visible to department heads. Submit a SAR to take action on any employee.
          </div>
        </>
      )}

      {/* ── PAGE BANNER ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); setForm(EMPTY_FORM); setWizardStep(1); setShowModal(true) }}
        chapterName="HR"
        formTitle={['New', 'Staff', 'Action']}
        heading="Submit a staff action request to the Payroll team"
        iconLabel="Staff Actions"
        workflowSteps={['Action Details', 'Notes & Submit']}
        description="Select an employee from your department, choose the action type (Release, Transfer, Hold, etc.), and provide the required details. Payroll will be notified automatically."
      />

      {/* ── FORMSHELL WIZARD ── */}
      <FormShell
        isOpen={showModal}
        onClose={() => { setShowModal(false); setWizardStep(1) }}
        chapterName="HR"
        title={['New', 'Staff Action', 'Request']}
        steps={['Action Details', 'Notes & Submit']}
        currentStep={wizardStep}
        onBack={wizardStep === 1 ? () => { setShowModal(false); setWizardStep(1) } : () => setWizardStep(1)}
        backLabel={wizardStep === 1 ? 'Cancel' : 'Back'}
        onNext={wizardStep === 1 ? () => setWizardStep(2) : submitSar}
        nextLabel={wizardStep === 1 ? 'Next: Notes & Submit' : (saving ? 'Submitting…' : 'Submit SAR')}
        nextDisabled={saving || !form.employee_id || !form.reason || (isAdmin && !activeDeptId) || (form.action_type === 'RELEASE' && !form.last_working_day) || (form.action_type === 'TRANSFER' && !form.transfer_to_dept_id)}
        subjectLabel={{ line1: (myDept || depts.find(d=>d.id===activeDeptId))?.dept_code || (myDept || depts.find(d=>d.id===activeDeptId))?.dept_name || null, line2: employees.find(e=>e.id===form.employee_id)?.full_name || null }}
      >
        {/* ── STEP 1: Action Details ── */}
        {wizardStep === 1 && (
          <div>
            {/* Dept + Employee — same row */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-end' }}>
              {/* Department — shown as abbreviation only */}
              <div style={{ flex: '0 0 140px' }}>
                <label style={{ ...S.label, color: isAdmin ? '#e65100' : undefined }}>
                  {isAdmin ? '⚠️ ' : ''}Department *
                </label>
                {isAdmin ? (
                  <select style={S.inp} value={activeDeptId} onChange={e => onAdminDeptChange(e.target.value)}>
                    <option value="">— Dept —</option>
                    {depts.map(d => <option key={d.id} value={d.id}>{d.dept_code || d.dept_name}</option>)}
                  </select>
                ) : (
                  <input
                    style={{ ...S.inp, background: '#f5f7fa', cursor: 'default' }}
                    readOnly
                    value={myDept ? (myDept.dept_code || myDept.dept_name) : '—'}
                  />
                )}
              </div>

              {/* Employee */}
              <div style={{ flex: 1 }}>
                <label style={S.label}>Employee *</label>
              <select
                style={{ ...S.inp, background: (isAdmin && !activeDeptId) ? '#f5f7fa' : '#fff' }}
                value={form.employee_id}
                onChange={e => setF('employee_id', e.target.value)}
                disabled={isAdmin && !activeDeptId}
              >
                <option value="">{empLoading ? 'Loading employees…' : (employees.length === 0 ? '— No active employees in this department —' : '— Select employee —')}</option>
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>
                    {empName(emp)}{empId(emp) ? ` (${empId(emp)})` : ''} — {emp.employee_type || 'DIRECT'}
                  </option>
                ))}
              </select>
              </div>{/* flex:1 employee */}
            </div>{/* flex row */}

            {/* Action Type */}
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>Action Type *</label>
              <select style={S.inp} value={form.action_type} onChange={e => setF('action_type', e.target.value)}>
                {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>

            {/* RELEASE fields */}
            {form.action_type === 'RELEASE' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={S.label}>Notice Given Date *</label>
                    <input type="date" style={S.inp} value={form.notice_given_date} onChange={e => setF('notice_given_date', e.target.value)} />
                  </div>
                  <div>
                    <label style={S.label}>Last Working Day *</label>
                    <input type="date" style={S.inp} value={form.last_working_day} onChange={e => setF('last_working_day', e.target.value)} />
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={S.label}>Notice Period</label>
                  <select style={S.inp} value={form.notice_period} onChange={e => setF('notice_period', e.target.value)}>
                    {NOTICE_PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
              </>
            )}

            {/* PAYROLL HOLD fields */}
            {form.action_type === 'PAYROLL_HOLD' && (
              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>Hold for Month *</label>
                <input type="month" style={{ ...S.inp, width: 200 }} value={form.hold_month} onChange={e => setF('hold_month', e.target.value)} />
              </div>
            )}

            {/* TRANSFER fields */}
            {form.action_type === 'TRANSFER' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={S.label}>From Department</label>
                  <input style={{ ...S.inp, background: '#f5f7fa' }} value={myDept?.dept_name || activeDept?.dept_name || profile?.department || '—'} readOnly />
                </div>
                <div>
                  <label style={S.label}>To Department *</label>
                  <select style={S.inp} value={form.transfer_to_dept_id} onChange={e => setF('transfer_to_dept_id', e.target.value)}>
                    <option value="">— Select department —</option>
                    {depts.filter(d => d.id !== myDept?.id).map(d => (
                      <option key={d.id} value={d.id}>{d.dept_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* CONTRACT EXTENSION fields */}
            {form.action_type === 'CONTRACT_EXTENSION' && (
              <div style={{ marginBottom: 14 }}>
                <label style={S.label}>New Contract End Date *</label>
                <input type="date" style={{ ...S.inp, width: 220 }} value={form.new_contract_end} onChange={e => setF('new_contract_end', e.target.value)} />
              </div>
            )}

            {/* Reason */}
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>Reason *</label>
              <select style={S.inp} value={form.reason} onChange={e => setF('reason', e.target.value)}>
                <option value="">— Select reason —</option>
                {(REASONS[form.action_type] || []).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* ── STEP 2: Notes & Submit ── */}
        {wizardStep === 2 && (
          <div>
            <div style={{ marginBottom: 16, padding: '12px 14px', background: '#F7F2ED', borderRadius: 4, fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: L3, marginBottom: 6 }}>Action Summary</div>
              <div style={{ color: '#5a3f32', lineHeight: 1.7 }}>
                <strong>Employee:</strong> {employees.find(e => e.id === form.employee_id) ? empName(employees.find(e => e.id === form.employee_id)) : '—'}<br />
                <strong>Action:</strong> {ACTION_TYPES.find(a => a.value === form.action_type)?.label || form.action_type}<br />
                {form.action_type === 'RELEASE' && <><strong>Last Working Day:</strong> {form.last_working_day}<br /></>}
                {form.action_type === 'PAYROLL_HOLD' && <><strong>Hold Month:</strong> {form.hold_month}<br /></>}
                {form.action_type === 'TRANSFER' && <><strong>To Dept:</strong> {depts.find(d => d.id === form.transfer_to_dept_id)?.dept_name || '—'}<br /></>}
                {form.action_type === 'CONTRACT_EXTENSION' && <><strong>New End Date:</strong> {form.new_contract_end}<br /></>}
                <strong>Reason:</strong> {(REASONS[form.action_type] || []).find(r => r.value === form.reason)?.label || form.reason}
              </div>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={S.label}>Notes to Payroll</label>
              <textarea
                style={{ ...S.inp, height: 90, resize: 'vertical' }}
                placeholder="Any special instructions, pro-rata notes, vendor details, final invoice info…"
                value={form.notes}
                onChange={e => setF('notes', e.target.value)}
              />
            </div>

            <div style={{ fontSize: 11, color: '#aab2bd' }}>
              📧 Payroll will receive an email notification with your name and these details. Track status under My Submissions.
            </div>
          </div>
        )}
      </FormShell>

      {/* ── SUBMIT ACTION (SAR) TAB ── */}
      {!loading && tab === 'sar' && (
        <div style={{ ...S.card, maxWidth: 640 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#1a2e3d', marginBottom: 8 }}>New Staff Action Request</div>
          <div style={{ fontSize: 13, color: '#6b7c93', marginBottom: 20 }}>
            Submit release, transfer, hold, or contract actions for employees in your department. Payroll is notified automatically.
          </div>
          <button
            onClick={() => setShowBanner(true)}
            style={{ ...S.btn(), padding: '11px 24px', fontSize: 14 }}
          >
            + Submit Staff Action Request
          </button>
          <div style={{ marginTop: 12, fontSize: 11, color: '#aab2bd' }}>
            📧 Your name and submission details are sent to Payroll. Track all past submissions under My Submissions.
          </div>
        </div>
      )}

      {/* ── BUDGET VIEW TAB ── */}
      {!loading && tab === 'budget' && (
        <>
          <div style={{ display: 'flex', gap: 14, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Active Employees', value: employees.length, icon: '👤', color: '#1565C0' },
              { label: 'Monthly Dept Cost', value: SAR_FMT(deptCost), icon: '💰', color: '#00897b' },
              { label: 'Expiring ≤ 30 days', value: expiring7.length + expiring30.length, icon: '⚠️', color: '#e65100' },
            ].map(c => (
              <div key={c.label} style={{ ...S.card, flex: 1, minWidth: 160, marginBottom: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px' }}>
                <div style={{ fontSize: 26 }}>{c.icon}</div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: c.color }}>{c.value}</div>
                  <div style={{ fontSize: 11, color: '#6b7c93' }}>{c.label}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ ...S.card }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#1a2e3d', marginBottom: 12 }}>📊 Department Cost (aggregate only — no individual salaries)</div>
            <div style={{ fontSize: 12, color: '#6b7c93', marginBottom: 8 }}>
              Total monthly compensation for {employees.length} active employees in {myDept?.dept_name || activeDept?.dept_name || 'your department'}
            </div>
            <div style={{ background: '#f5f7fa', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#1a2e3d', fontWeight: 600 }}>
              Estimated Monthly Cost: <span style={{ color: '#00897b', fontSize: 16, fontWeight: 800 }}>{SAR_FMT(deptCost)}</span>
              <span style={{ fontSize: 11, color: '#6b7c93', fontWeight: 400, marginLeft: 8 }}>Bank + Cash portions combined</span>
            </div>
          </div>

          {(expiring7.length > 0 || expiring30.length > 0) && (
            <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
              <div style={{ background: '#e65100', padding: '8px 16px' }}>
                <span style={{ color: '#fff', fontWeight: 700, fontSize: 12 }}>⚠️ Contract Expiry Watch</span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={S.th}>Employee</th>
                    <th style={S.th}>Type</th>
                    <th style={S.th}>Expiry Date</th>
                    <th style={S.th}>Days Remaining</th>
                    <th style={S.th}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {[...expiring7, ...expiring30].map(emp => {
                    const days = daysUntil(emp.contract_end_date)
                    return (
                      <tr key={emp.id}>
                        <td style={{ ...S.td, fontWeight: 600 }}>{empName(emp)}</td>
                        <td style={S.td}>{emp.employee_type || 'DIRECT'}</td>
                        <td style={S.td}>{emp.contract_end_date}</td>
                        <td style={{ ...S.td, color: days <= 7 ? '#b71c1c' : '#e65100', fontWeight: 700 }}>
                          {days <= 0 ? 'EXPIRED' : `${days} days`}
                        </td>
                        <td style={S.td}>
                          <button onClick={() => { setForm(f => ({ ...f, employee_id: emp.id })); setWizardStep(1); setShowModal(true) }} style={{ ...S.btn('#e65100'), padding: '5px 12px', fontSize: 11 }}>
                            Submit SAR
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── MY SUBMISSIONS TAB ── */}
      {!loading && tab === 'history' && (
        <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
          <div style={{ background: '#1a2e3d', padding: '10px 16px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>My Submitted SARs</span>
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{sars.length} submissions</span>
          </div>
          {sars.length === 0
            ? <div style={{ padding: 24, color: '#aab2bd', textAlign: 'center' }}>No submissions yet. Use the Submit Action tab to create your first SAR.</div>
            : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={S.th}>Date</th>
                    <th style={S.th}>Employee</th>
                    <th style={S.th}>Action</th>
                    <th style={S.th}>Key Date</th>
                    <th style={S.th}>Reason</th>
                    <th style={S.th}>Status</th>
                    <th style={S.th}>Payroll Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {sars.map(s => {
                    const ss = STATUS_STYLE[s.status] || STATUS_STYLE.PENDING
                    const actType = ACTION_TYPES.find(a => a.value === s.action_type)
                    const keyDate = s.last_working_day || s.hold_month || s.transfer_to_dept_name || '—'
                    const emp = s.employees
                    return (
                      <tr key={s.id}>
                        <td style={{ ...S.td, whiteSpace: 'nowrap', color: '#6b7c93' }}>
                          {new Date(s.created_at).toLocaleDateString('en-GB')}
                        </td>
                        <td style={{ ...S.td, fontWeight: 600 }}>
                          {emp ? (emp.full_name || emp.full_name_en || emp.employee_no || emp.employee_number || '—') : '—'}
                        </td>
                        <td style={S.td}>{actType?.label || s.action_type}</td>
                        <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{keyDate}</td>
                        <td style={{ ...S.td, color: '#6b7c93' }}>{(s.reason || '').replace(/_/g, ' ')}</td>
                        <td style={S.td}>
                          <span style={{ background: ss.bg, color: ss.color, borderRadius: 5, padding: '2px 9px', fontSize: 10, fontWeight: 700 }}>
                            {ss.label}
                          </span>
                        </td>
                        <td style={{ ...S.td, color: '#6b7c93', fontSize: 11 }}>
                          {s.payroll_notes || (s.status === 'PENDING' ? 'Awaiting acknowledgment' : '')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          }
        </div>
      )}
      </div>{/* end white box */}
      </div>{/* end scroll zone */}
    </div>
  )
}
