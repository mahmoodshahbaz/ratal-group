import { GROUP_COLORS } from '../styles/appStyles'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'

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
  card:  { background: '#fff', borderRadius: 14, padding: '18px 22px', boxShadow: '0 2px 10px rgba(0,0,0,0.07)', marginBottom: 16 },
  inp:   { width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid #dde3ec', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  btn:   (c = '#1a2e3d') => ({ background: c, color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }),
  label: { display: 'block', fontSize: 11, color: '#6b7c93', fontWeight: 700, marginBottom: 4 },
  tab:   a => ({ padding: '7px 18px', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, marginRight: 6, background: a ? '#00897b' : '#f0f4f8', color: a ? '#fff' : '#6b7c93' }),
  th:    { background: MC, color: '#fff', padding: '9px 14px', fontWeight: 700, textAlign: 'left', fontSize: 11 },
  td:    { padding: '10px 14px', borderBottom: '1px solid #f0f4f8', verticalAlign: 'middle', fontSize: 12 },
}

export default function StaffActions({ entityId }) {
  const { profile } = useAuth()
  const [tab,        setTab]      = useState('team')
  const [employees,  setEmp]      = useState([])
  const [depts,      setDepts]    = useState([])
  const [myDept,     setMyDept]   = useState(null)
  const [sars,       setSars]     = useState([])
  const [loading,    setLoading]  = useState(true)
  const [saving,     setSaving]   = useState(false)
  const [form,       setForm]     = useState(EMPTY_FORM)
  const [deptCost,   setDeptCost] = useState(0)
  const [msg,        setMsg]      = useState(null)

  useEffect(() => { if (entityId) load() }, [entityId, profile?.email])

  async function load() {
    setLoading(true)

    // 1. Departments for this entity
    const { data: deptData } = await supabase
      .from('departments')
      .select('id, name, short_code, head')
      .eq('entity_id', entityId)
      .order('name')
    setDepts(deptData || [])

    // 2. Find my department by matching profile.department (name or short_code)
    const myDeptKey = (profile?.department || '').toLowerCase()
    const found = myDeptKey
      ? (deptData || []).find(d =>
          d.name?.toLowerCase() === myDeptKey ||
          d.short_code?.toLowerCase() === myDeptKey
        )
      : null
    setMyDept(found || null)

    if (found) {
      // 3. Employees in my dept — NO salary columns
      const { data: empData } = await supabase
        .from('employees')
        .select('id, full_name, full_name_en, employee_no, employee_number, employee_type, contract_end_date, is_active')
        .eq('entity_id', entityId)
        .eq('department_id', found.id)
        .eq('is_active', true)
        .order('full_name')
      setEmp(empData || [])

      // 4. Aggregate dept cost (sum only — no individual rows displayed)
      const { data: costData } = await supabase
        .from('employees')
        .select('bank_portion, cash_portion, basic_salary, housing_allowance, transport_allowance')
        .eq('entity_id', entityId)
        .eq('department_id', found.id)
        .eq('is_active', true)
      const total = (costData || []).reduce((s, e) => {
        const bp   = +(e.bank_portion || 0)
        const cp   = +(e.cash_portion || 0)
        const comp = +(e.basic_salary || 0) + +(e.housing_allowance || 0) + +(e.transport_allowance || 0)
        return s + (bp > 0 ? bp + cp : comp)
      }, 0)
      setDeptCost(total)
    } else {
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

  function flash(type, text) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 5000)
  }

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

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
      department_name:       myDept?.name || profile?.department || '',
      action_type:           form.action_type,
      notice_given_date:     form.notice_given_date || null,
      last_working_day:      form.action_type === 'RELEASE'            ? (form.last_working_day || null) : null,
      hold_month:            form.action_type === 'PAYROLL_HOLD'       ? form.hold_month : null,
      transfer_to_dept_id:   form.action_type === 'TRANSFER'           ? (form.transfer_to_dept_id || null) : null,
      transfer_to_dept_name: form.action_type === 'TRANSFER'
        ? (depts.find(d => d.id === form.transfer_to_dept_id)?.name || '') : null,
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
    load()
    setTab('history')
  }

  const empName = e => e.full_name || e.full_name_en || e.employee_no || e.employee_number || '—'
  const empId   = e => e.employee_no || e.employee_number || ''

  // Expiry buckets
  const expiring7  = employees.filter(e => { const d = daysUntil(e.contract_end_date); return d !== null && d >= 0 && d <= 7 })
  const expiring30 = employees.filter(e => { const d = daysUntil(e.contract_end_date); return d !== null && d > 7 && d <= 30 })

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1a2e3d' }}>📋 Staff Actions</div>
          <div style={{ fontSize: 12, color: '#6b7c93', marginTop: 2 }}>
            Dept Head Portal — Submit staff action requests and track their status
            {myDept && <span style={{ marginLeft: 10, background: '#ede7f6', color: '#6a1b9a', borderRadius: 5, padding: '2px 9px', fontSize: 10, fontWeight: 800 }}>{myDept.short_code || myDept.name}</span>}
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#6b7c93' }}>
          {profile?.full_name || profile?.email}
        </div>
      </div>

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

      {/* Tabs */}
      <div style={{ marginBottom: 16 }}>
        <button style={S.tab(tab === 'team')}    onClick={() => setTab('team')}>👥 My Team</button>
        <button style={S.tab(tab === 'sar')}     onClick={() => setTab('sar')}>📋 Submit Action</button>
        <button style={S.tab(tab === 'budget')}  onClick={() => setTab('budget')}>📊 Budget View</button>
        <button style={S.tab(tab === 'history')} onClick={() => setTab('history')}>
          📁 My Submissions
          {sars.filter(s => s.status === 'PENDING').length > 0 && (
            <span style={{ marginLeft: 6, background: '#e65100', color: '#fff', borderRadius: 10, padding: '1px 6px', fontSize: 10 }}>
              {sars.filter(s => s.status === 'PENDING').length}
            </span>
          )}
        </button>
      </div>

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
                {myDept ? `${myDept.name} — Active Employees` : 'My Department'}
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

      {/* ── SUBMIT ACTION (SAR) TAB ── */}
      {!loading && tab === 'sar' && (
        <div style={{ ...S.card, maxWidth: 640 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#1a2e3d', marginBottom: 16 }}>New Staff Action Request</div>

          {/* Employee */}
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Employee *</label>
            <select style={S.inp} value={form.employee_id} onChange={e => setF('employee_id', e.target.value)}>
              <option value="">— Select employee —</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {empName(emp)}{empId(emp) ? ` (${empId(emp)})` : ''} — {emp.employee_type || 'DIRECT'}
                </option>
              ))}
            </select>
          </div>

          {/* Action Type */}
          <div style={{ marginBottom: 14 }}>
            <label style={S.label}>Action Type *</label>
            <select style={S.inp} value={form.action_type} onChange={e => setF('action_type', e.target.value)}>
              {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>

          {/* ── RELEASE fields ── */}
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

          {/* ── PAYROLL HOLD fields ── */}
          {form.action_type === 'PAYROLL_HOLD' && (
            <div style={{ marginBottom: 14 }}>
              <label style={S.label}>Hold for Month *</label>
              <input type="month" style={{ ...S.inp, width: 200 }} value={form.hold_month} onChange={e => setF('hold_month', e.target.value)} />
            </div>
          )}

          {/* ── TRANSFER fields ── */}
          {form.action_type === 'TRANSFER' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={S.label}>From Department</label>
                <input style={{ ...S.inp, background: '#f5f7fa' }} value={myDept?.name || profile?.department || '—'} readOnly />
              </div>
              <div>
                <label style={S.label}>To Department *</label>
                <select style={S.inp} value={form.transfer_to_dept_id} onChange={e => setF('transfer_to_dept_id', e.target.value)}>
                  <option value="">— Select department —</option>
                  {depts.filter(d => d.id !== myDept?.id).map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* ── CONTRACT EXTENSION fields ── */}
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

          {/* Notes */}
          <div style={{ marginBottom: 18 }}>
            <label style={S.label}>Notes to Payroll</label>
            <textarea
              style={{ ...S.inp, height: 80, resize: 'vertical' }}
              placeholder="Any special instructions, pro-rata notes, vendor details, final invoice info…"
              value={form.notes}
              onChange={e => setF('notes', e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={submitSar} disabled={saving} style={S.btn('#00897b')}>
              {saving ? '⏳ Submitting…' : '📤 Submit SAR'}
            </button>
            <button onClick={() => setForm(EMPTY_FORM)} style={S.btn('#aab2bd')}>Clear</button>
          </div>

          <div style={{ marginTop: 12, fontSize: 11, color: '#aab2bd' }}>
            📧 Payroll will receive an email notification with your name and these details. You can track the status under My Submissions.
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
              Total monthly compensation for {employees.length} active employees in {myDept?.name || 'your department'}
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
                          <button onClick={() => { setF('employee_id', emp.id); setTab('sar') }} style={{ ...S.btn('#e65100'), padding: '5px 12px', fontSize: 11 }}>
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
    </div>
  )
}
