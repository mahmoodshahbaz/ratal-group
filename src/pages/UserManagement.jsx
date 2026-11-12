import { GROUP_COLORS, kpiCardGradient } from '../styles/appStyles'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'
import PageBanner from '../components/PageBanner'
import FormShell from '../components/FormShell'

// ─── User Management ─────────────────────────────────────────────
// SUPERADMIN: all users, all entities, all roles, can delete
// ADMIN:      own entity only, DEPT_HEAD and below only, no delete

const ALL_ROLES = ['SUPERADMIN','ADMIN','DEPT_HEAD','PROJECT_MANAGER','SUPERVISOR','TRAVEL_AGENT','FIELD_EMPLOYEE','VIEWER']

// Roles that ADMIN is allowed to assign (cannot touch SUPERADMIN or ADMIN)
const ADMIN_ROLES = ['DEPT_HEAD','PROJECT_MANAGER','SUPERVISOR','TRAVEL_AGENT','FIELD_EMPLOYEE','VIEWER']

const ROLE_META = {
  SUPERADMIN:       { color:'#5A32D4', bg:'#ede7f6', icon:'👑', desc:'Full access to all entities. Can manage users.' },
  ADMIN:            { color:'#1565C0', bg:'#e3f2fd', icon:'🛡', desc:'Full access to their assigned entity. Can manage lower-role users.' },
  DEPT_HEAD:        { color:'#00695c', bg:'#e0f2f1', icon:'🏛', desc:'Department view: approvals, staff submissions, money requests. No payroll or QR management.' },
  PROJECT_MANAGER:  { color:'#2e7d32', bg:'#e8f5e9', icon:'📁', desc:'Project and site view: submissions, PO requests, site completions.' },
  SUPERVISOR:       { color:'#6a1b9a', bg:'#f3e5f5', icon:'🔍', desc:'Team supervision: views their team submissions and site progress.' },
  TRAVEL_AGENT:     { color:'#1565C0', bg:'#e8eaf6', icon:'✈️', desc:'Handles tickets, customers, BSP, and refunds.' },
  FIELD_EMPLOYEE:   { color:'#e65100', bg:'#fff3e0', icon:'👷', desc:'Submits expense, food, overtime requests via mobile forms.' },
  VIEWER:           { color:'#aab2bd', bg:'#f5f7fa', icon:'👁',  desc:'Read-only access to the dashboard only.' },
}

const ENTITIES = [
  { code:'RAT',    name:'Ratal Tours & Travels',      color:'#1565C0' },
  { code:'GWT',    name:'Green Wings Travel',          color:'#2E7D32' },
  { code:'ACCSYS', name:'Ratal Advanced Technologies', color:'#5A32D4' },
]

const MC   = GROUP_COLORS.Administration
const L1   = '#AAAED0'
const L2   = '#F0F1FA'
const L3   = '#454D9B'
const PP   = "'Poppins', sans-serif"
const MAIN = '#172D37'
const SUB  = '#53666F'

const S = {
  card:   { background:'#fff', borderRadius:14, padding:'18px 22px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:16 },
  inp:    { width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
  btn:    (c='#454D9B') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:700, cursor:'pointer' }),
  label:  { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4 },
  row:    { display:'flex', gap:12, marginBottom:14 },
  col:    { flex:1 },
  th:     { background:'#454D9B', color:'#fff', padding:'9px 14px', fontWeight:700, textAlign:'left', fontSize:11, fontFamily:"'Poppins',sans-serif", textTransform:'uppercase', letterSpacing:0.5 },
  td:     { padding:'10px 14px', borderBottom:'1px solid #f0f4f8', verticalAlign:'middle', fontSize:12 },
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' },
  modal:  { background:'#fff', borderRadius:16, padding:28, width:620, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.18)' },
  etab:   a => ({ padding:'6px 16px', border:'none', borderRadius:7, cursor:'pointer', fontSize:11, fontWeight:700, marginRight:4, background:a?'#1a2e3d':'#f0f4f8', color:a?'#fff':'#6b7c93' }),
}

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`

async function callEdge(action, payload) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(EDGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action, ...payload }),
  })
  return res.json()
}

const EMPTY_FORM = { email:'', full_name:'', role:'DEPT_HEAD', entity_code:'ACCSYS', department:'', phone:'' }

export default function UserManagement({ entityId: propEntityId }) {
  const { isSuperAdmin, role: myRole, entityCode: myEntityCode, entityId: myEntityId } = useAuth()

  const [users,       setUsers]      = useState([])
  const [depts,       setDepts]      = useState([])   // { id, name, short_code, entity_code }
  const [entMap,      setEntMap]     = useState({})   // entity_code → entity_id (uuid)
  const [loading,     setLoading]    = useState(true)
  const [showInvite,  setShowInvite] = useState(false)
  const [showBanner,  setShowBanner] = useState(false)
  const [editUser,    setEditUser]   = useState(null)
  const [confirmDel,  setConfirmDel] = useState(null) // user to delete
  const [setPwUser,   setSetPwUser]  = useState(null) // user to set password for
  const [setPwVal,    setSetPwVal]   = useState('')   // new password value
  const [setPwShow,   setSetPwShow]  = useState(false)
  const [form,        setForm]       = useState({ ...EMPTY_FORM, entity_code: myEntityCode || 'ACCSYS' })
  const [saving,      setSaving]     = useState(false)
  const [deleting,    setDeleting]   = useState(false)
  const [filter,      setFilter]     = useState({ role:'', search:'' })
  const [entityTab,   setEntityTab]  = useState('ALL')  // SUPERADMIN only
  const [msg,         setMsg]        = useState(null)

  // Employee picker state (invite modal)
  const [empList,     setEmpList]    = useState([])   // employees for selected entity
  const [empLoading,  setEmpLoading] = useState(false)
  const [selectedEmp, setSelectedEmp]= useState(null) // chosen employee object
  const [empSearch,   setEmpSearch]  = useState('')   // filter inside dropdown
  const [deptFilter,  setDeptFilter] = useState('')   // department filter on step 1
  const [inviteStep,  setInviteStep] = useState(1)    // 1=Select 2=Role 3=Confirm
  const [expandedRows,setExpandedRows]=useState(new Set()) // ids of expanded user rows

  // Roles this user is allowed to assign
  const assignableRoles = isSuperAdmin ? ALL_ROLES : ADMIN_ROLES

  useEffect(() => { load() }, [myEntityCode])

  async function load() {
    setLoading(true)
    const [{ data: userData }, { data: deptData }, { data: entData }] = await Promise.all([
      supabase.from('user_profiles')
        .select('id,email,full_name,role,entity_code,department,phone,is_active,invited_at,last_sign_in,avatar_url')
        .order('full_name'),
      // Correct column names: dept_name + dept_code (confirmed from Employees.jsx)
      supabase.from('departments')
        .select('id,dept_name,dept_code,entity_id')
        .eq('is_active', true)
        .order('dept_name'),
      supabase.from('entities').select('id,entity_code,entity_name'),
    ])
    setUsers(userData || [])

    // Build entity_code → uuid map AND uuid → entity_code reverse map
    const codeToId = {}
    const idToCode = {}
    ;(entData || []).forEach(e => {
      if (e.entity_code && e.id) {
        codeToId[e.entity_code] = e.id
        idToCode[e.id] = e.entity_code
      }
    })
    setEntMap(codeToId)

    // Normalise dept rows: expose .name and .short_code aliases so downstream code works
    setDepts((deptData || []).map(d => ({
      ...d,
      name:       d.dept_name  || '',   // alias for legacy references
      short_code: d.dept_code  || '',   // alias
      entity_code: idToCode[d.entity_id] || '',
    })))
    setLoading(false)
  }

  // ── Fetch employees for invite picker ────────────────────────────
  async function fetchEmployees(entityCode) {
    setEmpLoading(true)
    setEmpList([])
    setSelectedEmp(null)

    // Resolve entity_id — priority: entMap → myEntityId (from useAuth) → propEntityId → direct query
    let entityId = entMap[entityCode]
                || (entityCode === myEntityCode ? (myEntityId || propEntityId) : null)

    if (!entityId) {
      // Last resort: query entities table directly
      const { data: entRow } = await supabase
        .from('entities').select('id').eq('entity_code', entityCode).single()
      entityId = entRow?.id
    }

    if (!entityId) {
      // Could not resolve entity — load ALL employees as fallback (client-side filter)
      console.warn('[UserMgmt] Could not resolve entityId for', entityCode, '— loading all employees')
    }

    // Minimal select — NO department join (avoids FK/relationship 400 errors)
    // Show designation directly from the employees table
    let q = supabase.from('employees')
      .select('id,full_name,full_name_en,email,employee_no,employee_number,designation,department_id,phone')
      .order('full_name_en')

    if (entityId) {
      q = q.eq('entity_id', entityId)
    }

    const [{ data: emps, error: empErr }, { data: existingProfiles }] = await Promise.all([
      q,
      supabase.from('user_profiles').select('email').eq('entity_code', entityCode),
    ])

    if (empErr) console.error('[UserMgmt] employees query error:', empErr.message, empErr)

    // Build a dept_id → {name,code} map using correct column names
    const deptMap = {}
    depts.forEach(d => { if (d.id) deptMap[d.id] = { name: d.dept_name || d.name || '', code: d.dept_code || d.short_code || '' } })

    const takenEmails = new Set(
      (existingProfiles || []).map(p => (p.email || '').toLowerCase())
    )

    const list = (emps || []).map(e => {
      const dept = deptMap[e.department_id] || {}
      return {
        id:          e.id,
        empNo:       e.employee_no || e.employee_number || '',
        name:        e.full_name_en || e.full_name || '',
        nameAr:      e.full_name || '',
        email:       e.email || '',
        phone:       e.phone || '',
        designation: e.designation || '',
        dept_id:     e.department_id || '',          // raw FK — used for reliable dept filtering
        deptName:    dept.name || '',
        deptCode:    dept.code || '',
        hasAccount:  takenEmails.has((e.email || '').toLowerCase()),
      }
    })

    console.log(`[UserMgmt] fetchEmployees(${entityCode}): entityId=${entityId}, empErr=${empErr?.message||'none'}, found=${list.length}`)
    setEmpList(list)
    setEmpLoading(false)
  }

  // Reload employees when entity changes inside the invite modal
  // Also depends on entMap AND depts — wait until both are loaded before fetching
  useEffect(() => {
    if (showInvite && (Object.keys(entMap).length > 0 || propEntityId)) {
      fetchEmployees(form.entity_code)
    }
  }, [form.entity_code, showInvite, entMap, propEntityId, depts])

  function flash(type, text) { setMsg({ type, text }); setTimeout(() => setMsg(null), 5000) }
  function setF(k, v) { setForm(p => ({ ...p, [k]: v })) }

  // ── Filtered user list (role-scoped) ──────────────────────────────
  const scopedUsers = isSuperAdmin
    ? users
    : users.filter(u => u.entity_code === myEntityCode && !['SUPERADMIN','ADMIN'].includes(u.role))

  const entityFiltered = (isSuperAdmin && entityTab !== 'ALL')
    ? scopedUsers.filter(u => u.entity_code === entityTab)
    : scopedUsers

  const filtered = entityFiltered
    .filter(u => !filter.role   || u.role === filter.role)
    .filter(u => !filter.search ||
      (u.full_name || '').toLowerCase().includes(filter.search.toLowerCase()) ||
      (u.email     || '').toLowerCase().includes(filter.search.toLowerCase()) ||
      (u.department|| '').toLowerCase().includes(filter.search.toLowerCase()))

  // Departments for the current form's entity_code
  const formDepts = depts.filter(d => d.entity_code === form.entity_code)

  // ── Actions ───────────────────────────────────────────────────────
  async function invite() {
    const emailToUse = form.email || selectedEmp?.email
    if (!emailToUse)         { flash('error','Please select an employee with an email address'); return }
    if (!form.role)          { flash('error','Role is required'); return }
    if (!selectedEmp)        { flash('error','Please select an employee from the list'); return }

    setSaving(true)

    // If admin manually typed an email for an employee who had none, save it back to the employees table
    if (!selectedEmp.email && form.email && selectedEmp.id) {
      await supabase.from('employees').update({ email: form.email }).eq('id', selectedEmp.id)
    }

    const result = await callEdge('invite', { ...form, email: emailToUse })
    setSaving(false)
    if (result.error) { flash('error', result.error); return }
    flash('success', `✅ Invite sent to ${emailToUse}`)
    setShowInvite(false)
    setSelectedEmp(null)
    setEmpSearch('')
    setForm({ ...EMPTY_FORM, entity_code: myEntityCode || 'ACCSYS' })
    load()
  }

  async function updateProfile() {
    if (!editUser) return
    setSaving(true)
    const result = await callEdge('update_profile', {
      user_id:     editUser.id,
      role:        form.role,
      entity_code: form.entity_code,
      department:  form.department,
      full_name:   form.full_name,
      phone:       form.phone,
    })
    setSaving(false)
    if (result.error) { flash('error', result.error); return }
    flash('success', 'Profile updated successfully')
    setEditUser(null)
    load()
  }

  async function toggleActive(user) {
    const action = user.is_active ? 'Deactivate' : 'Reactivate'
    if (!window.confirm(`${action} ${user.full_name || user.email}?`)) return
    const result = await callEdge('update_profile', { user_id: user.id, is_active: !user.is_active })
    if (result.error) { flash('error', result.error); return }
    flash('success', `${action}d successfully`)
    load()
  }

  async function sendPasswordReset(user) {
    if (!user.email) { flash('error','No email on record'); return }
    if (!window.confirm(`Send password reset email to ${user.email}?`)) return
    const result = await callEdge('reset_password', { email: user.email })
    if (result.error) { flash('error', result.error); return }
    flash('success', `Password reset email sent to ${user.email}`)
  }

  async function doSetPassword() {
    if (!setPwUser || !setPwVal) return
    if (setPwVal.length < 8) { flash('error', 'Password must be at least 8 characters'); return }
    setSaving(true)
    const result = await callEdge('set_password', { user_id: setPwUser.id, password: setPwVal })
    setSaving(false)
    if (result.error) { flash('error', result.error); return }
    flash('success', `Password set for ${setPwUser.full_name || setPwUser.email}`)
    setSetPwUser(null); setSetPwVal('')
  }

  async function deleteUser() {
    if (!confirmDel) return
    setDeleting(true)
    const result = await callEdge('delete_user', { user_id: confirmDel.id })
    setDeleting(false)
    if (result.error) { flash('error', result.error); return }
    flash('success', `${confirmDel.full_name || confirmDel.email} has been permanently deleted`)
    setConfirmDel(null)
    load()
  }

  function openInvite() {
    const ec = isSuperAdmin ? (entityTab !== 'ALL' ? entityTab : 'ACCSYS') : myEntityCode
    setSelectedEmp(null)
    setEmpSearch('')
    setDeptFilter('')
    setInviteStep(1)
    setForm({ ...EMPTY_FORM, entity_code: ec })
    setShowInvite(true)
  }

  // Called when admin picks an employee from the picker
  function pickEmployee(emp) {
    if (emp.hasAccount) return // already has access, ignore
    setSelectedEmp(emp)
    setForm(p => ({
      ...p,
      email:      emp.email,
      full_name:  emp.name,
      department: emp.deptName,
      phone:      emp.phone || p.phone, // auto-fill from employee record
    }))
  }

  function openEdit(user) {
    setEditUser(user)
    setForm({ email: user.email||'', full_name: user.full_name||'', role: user.role||'VIEWER', entity_code: user.entity_code||'ACCSYS', department: user.department||'', phone: user.phone||'' })
  }

  const activeCount   = scopedUsers.filter(u => u.is_active).length
  const inactiveCount = scopedUsers.filter(u => !u.is_active).length

  return (
    <div className="um-root" style={{ fontFamily: PP, display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden', background: L2 }}>
      <style>{`.um-root input,.um-root select,.um-root button,.um-root textarea{font-family:'Poppins',sans-serif!important}`}</style>

      {/* ── UPPER ZONE ── */}
      <div style={{ flexShrink:0, background: L2, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', zIndex:10 }}>

        {/* L1 heading bar */}
        <div style={{ padding:'6px 28px 0' }}>
          <div style={{ background: L1, borderRadius:'6px 6px 0 0', padding:'10px 16px 10px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:16 }}>👤</span>
              <div>
                <div style={{ fontWeight:800, color:'#fff', fontSize:14 }}>User Management</div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.75)', marginTop:1 }}>
                  {isSuperAdmin
                    ? 'SUPERADMIN — Manage all users, all entities, all roles, including delete'
                    : `ADMIN — Manage users in ${myEntityCode} · Cannot assign ADMIN or higher`}
                </div>
              </div>
            </div>
            <button
              style={{ background:'rgba(255,255,255,0.18)', color:'#fff', border:'1px solid rgba(255,255,255,0.4)', borderRadius:8, padding:'7px 16px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}
              onClick={()=>setShowBanner(true)}
            >+ Add New User</button>
          </div>
        </div>

        {/* Flash */}
        {msg && (
          <div style={{ padding:'8px 28px 0' }}>
            <div style={{ background: msg.type==='success'?'#e8f5e9':'#ffebee', border:`1px solid ${msg.type==='success'?'#a5d6a7':'#ef9a9a'}`, borderRadius:8, padding:'10px 14px', fontSize:13, fontWeight:700, color: msg.type==='success'?'#2e7d32':'#c62828' }}>
              {msg.text}
            </div>
          </div>
        )}

        {/* KPI cards */}
        <div style={{ display:'flex', gap:10, padding:'10px 28px', flexWrap:'nowrap', overflowX:'auto' }}>
          {[
            { label:'Total Users', value: scopedUsers.length, icon:'👥' },
            { label:'Active',      value: activeCount,         icon:'✅' },
            { label:'Inactive',    value: inactiveCount,       icon:'🚫' },
            ...(isSuperAdmin ? ENTITIES.map(e => ({ label: e.code, value: users.filter(u => u.entity_code === e.code).length, icon:'🏢' })) : []),
          ].map((c, i) => {
            const g = kpiCardGradient(i % 4, L1, L2, L3)
            return (
              <div key={c.label} style={{ ...g, width:160, minWidth:160, height:62, borderRadius:10, padding:'10px 14px', flexShrink:0, position:'relative', overflow:'hidden', boxSizing:'border-box' }}>
                <div style={{ position:'absolute', right:8, top:6, fontSize:16, opacity:0.25 }}>{c.icon}</div>
                <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:0.8, opacity:0.8, marginBottom:2 }}>{c.label}</div>
                <div style={{ fontSize:22, fontWeight:900, lineHeight:1.2 }}>{c.value}</div>
              </div>
            )
          })}
        </div>

        {/* ADMIN privilege banner */}
        {!isSuperAdmin && (
          <div style={{ padding:'0 28px 8px' }}>
            <div style={{ background:'#fff3e0', border:'1px solid #ffcc80', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#e65100' }}>
              🔒 <strong>Your admin scope:</strong> You can see and manage users in <strong>{myEntityCode}</strong> only. Roles you can assign: {ADMIN_ROLES.join(', ')}. SUPERADMIN or ADMIN accounts are not visible.
            </div>
          </div>
        )}

        {/* Role distribution bar */}
        <div style={{ padding:'0 28px 10px' }}>
          <div style={{ background:'#fff', borderRadius:8, padding:'12px 16px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize:10, fontWeight:700, color: SUB, marginBottom:7, textTransform:'uppercase', letterSpacing:0.8 }}>Role Breakdown</div>
            <div style={{ display:'flex', gap:2, height:7, borderRadius:6, overflow:'hidden', marginBottom:7 }}>
              {ALL_ROLES.map(r => {
                const cnt = scopedUsers.filter(u => u.role === r).length
                const pct = scopedUsers.length ? (cnt / scopedUsers.length) * 100 : 0
                return pct > 0 ? <div key={r} title={`${r}: ${cnt}`} style={{ width:`${pct}%`, background: ROLE_META[r].color }} /> : null
              })}
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
              {ALL_ROLES.filter(r => scopedUsers.some(u => u.role === r)).map(r => {
                const cnt = scopedUsers.filter(u => u.role === r).length
                const m   = ROLE_META[r]
                return (
                  <div key={r} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11 }}>
                    <div style={{ width:7, height:7, borderRadius:'50%', background: m.color }} />
                    <span style={{ color: SUB }}>{m.icon} {r}</span>
                    <span style={{ fontWeight:800, color: MAIN }}>{cnt}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Entity tabs (SUPERADMIN only) */}
        {isSuperAdmin && (
          <div style={{ padding:'0 28px 8px', display:'flex', gap:4, flexWrap:'wrap' }}>
            {['ALL', ...ENTITIES.map(e => e.code)].map(code => (
              <button key={code} style={{
                padding:'5px 14px', border:'none', borderRadius:7, cursor:'pointer', fontSize:11, fontWeight:700,
                background: entityTab === code ? L3 : '#e8eaf2',
                color: entityTab === code ? '#fff' : SUB
              }} onClick={() => setEntityTab(code)}>
                {code === 'ALL' ? '🌐 All Entities' : `${ENTITIES.find(e => e.code === code)?.name || code}`}
                <span style={{ marginLeft:5, fontSize:10, opacity:0.7 }}>
                  ({code === 'ALL' ? users.length : users.filter(u => u.entity_code === code).length})
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Filter bar */}
        <div style={{ padding:'0 28px 10px', display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <input
            style={{ padding:'7px 10px', border:'1px solid #dde3ec', borderRadius:7, fontSize:12, outline:'none', width:220 }}
            placeholder="Search name, email, department…"
            value={filter.search}
            onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
          />
          <select
            style={{ padding:'7px 10px', border:'1px solid #dde3ec', borderRadius:7, fontSize:12, outline:'none' }}
            value={filter.role}
            onChange={e => setFilter(f => ({ ...f, role: e.target.value }))}
          >
            <option value="">All Roles</option>
            {(isSuperAdmin ? ALL_ROLES : ADMIN_ROLES).map(r => <option key={r}>{r}</option>)}
          </select>
          {(filter.role || filter.search) && (
            <button style={{ background:'#aab2bd', color:'#fff', border:'none', borderRadius:7, padding:'7px 12px', fontSize:11, fontWeight:700, cursor:'pointer' }}
              onClick={() => setFilter({ role:'', search:'' })}>✕ Clear</button>
          )}
          <div style={{ marginLeft:'auto', fontSize:11, color: SUB, fontWeight:700, background:'#fff', border:`1px solid ${L1}`, borderRadius:20, padding:'3px 12px' }}>
            {filtered.length} users
          </div>
        </div>

        {/* Column headers */}
        <div style={{ padding:'0 28px' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
            <colgroup>
              <col style={{ width:'18%' }} />
              <col style={{ width:'20%' }} />
              <col style={{ width:'16%' }} />
              <col style={{ width:'10%' }} />
              <col style={{ width:'16%' }} />
              <col style={{ width:'10%' }} />
              <col style={{ width:'10%' }} />
            </colgroup>
            <thead>
              <tr>
                {['User','Email','Role','Entity','Department','Status','Details'].map((h, hi) => (
                  <th key={h} style={{ background: L3, color:'#fff', padding:'9px 14px', fontWeight:700, textAlign: hi===6?'center':'left', fontSize:11, textTransform:'uppercase', letterSpacing:0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
          </table>
        </div>

      </div>

      {/* ── SCROLL ZONE ── */}
      <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:'0 28px 22px' }}>
        <div style={{ background:'#fff', borderRadius:'0 0 8px 8px', boxShadow:'0 2px 8px rgba(0,0,0,0.08)', overflow:'hidden' }}>
          {loading
            ? <div style={{ textAlign:'center', padding:40, color: SUB }}>Loading…</div>
            : (
            <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
              <colgroup>
                <col style={{ width:'18%' }} />
                <col style={{ width:'20%' }} />
                <col style={{ width:'16%' }} />
                <col style={{ width:'10%' }} />
                <col style={{ width:'16%' }} />
                <col style={{ width:'10%' }} />
                <col style={{ width:'10%' }} />
              </colgroup>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={7} style={{ ...S.td, textAlign:'center', color:'#aab2bd', padding:32 }}>No users found</td></tr>
                )}
                {filtered.map((u, i) => {
                  const rm       = ROLE_META[u.role] || ROLE_META.VIEWER
                  const ent      = ENTITIES.find(e => e.code === u.entity_code)
                  const canEdit  = isSuperAdmin || (!['SUPERADMIN','ADMIN'].includes(u.role))
                  const expanded = expandedRows.has(u.id)
                  const toggleRow = () => setExpandedRows(prev => {
                    const next = new Set(prev)
                    expanded ? next.delete(u.id) : next.add(u.id)
                    return next
                  })
                  const rowBg = !u.is_active ? '#fafafa' : i % 2 === 0 ? '#fff' : '#fafbfc'
                  return (
                    <>
                      <tr key={u.id} style={{ background: rowBg, opacity: u.is_active ? 1 : 0.7 }}>
                        <td style={S.td}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ width:34, height:34, borderRadius:'50%', background:`${rm.color}22`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                              {u.avatar_url ? <img src={u.avatar_url} style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }} alt="" /> : rm.icon}
                            </div>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontWeight:700, color: MAIN, fontSize:12, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{u.full_name || '—'}</div>
                              {u.phone && <div style={{ fontSize:10, color: SUB }}>{u.phone}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ ...S.td, fontSize:11, color: SUB, wordBreak:'break-all' }}>{u.email || '—'}</td>
                        <td style={S.td}>
                          <span style={{ background: rm.bg, color: rm.color, padding:'3px 8px', borderRadius:20, fontSize:10, fontWeight:800, whiteSpace:'nowrap' }}>
                            {rm.icon} {u.role}
                          </span>
                        </td>
                        <td style={S.td}>
                          {ent
                            ? <span style={{ background:`${ent.color}22`, color: ent.color, padding:'3px 8px', borderRadius:20, fontSize:10, fontWeight:800 }}>{ent.code}</span>
                            : <span style={{ color:'#aab2bd' }}>—</span>}
                        </td>
                        <td style={{ ...S.td, fontSize:11, color: SUB, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{u.department || '—'}</td>
                        <td style={S.td}>
                          <span style={{ background: u.is_active ? '#e8f5e9' : '#f5f7fa', color: u.is_active ? '#2e7d32' : '#aab2bd', padding:'3px 8px', borderRadius:20, fontSize:10, fontWeight:800, whiteSpace:'nowrap' }}>
                            {u.is_active ? '● Active' : '○ Inactive'}
                          </span>
                        </td>
                        <td style={{ ...S.td, textAlign:'center' }}>
                          <button
                            onClick={toggleRow}
                            style={{ background:'none', border:'1px solid #dde3ec', borderRadius:6, width:28, height:28, cursor:'pointer', fontSize:13, color: L3, display:'inline-flex', alignItems:'center', justifyContent:'center', transition:'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
                            title="Show details & actions"
                          >▾</button>
                        </td>
                      </tr>

                      {expanded && (
                        <tr key={`${u.id}-detail`} style={{ background: L2 }}>
                          <td colSpan={7} style={{ padding:'10px 18px', borderBottom:`2px solid ${L1}` }}>
                            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
                              <div style={{ fontSize:11, color: SUB }}>
                                <span style={{ fontWeight:700, color: L3, marginRight:6 }}>Last Sign In:</span>
                                {u.last_sign_in ? new Date(u.last_sign_in).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : 'Never'}
                              </div>
                              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                                {canEdit && (
                                  <button onClick={() => openEdit(u)} style={{ ...S.btn('#1565C0'), padding:'5px 12px', fontSize:11 }}>✏️ Edit</button>
                                )}
                                {canEdit && (
                                  <button onClick={() => toggleActive(u)} style={{ ...S.btn(u.is_active ? '#c62828' : '#2e7d32'), padding:'5px 12px', fontSize:11 }}>
                                    {u.is_active ? '⊘ Deactivate' : '✓ Reactivate'}
                                  </button>
                                )}
                                <button onClick={() => sendPasswordReset(u)} style={{ ...S.btn('#e65100'), padding:'5px 12px', fontSize:11 }}>🔑 Reset Password</button>
                                {isSuperAdmin && (
                                  <button onClick={() => { setSetPwUser(u); setSetPwVal(''); setSetPwShow(false); setTimeout(()=>{ const el=document.getElementById('set-pw-input'); if(el){el.value='';el.focus()} },100) }} style={{ ...S.btn('#6a1b9a'), padding:'5px 12px', fontSize:11 }}>🔐 Set Password</button>
                                )}
                                {isSuperAdmin && (
                                  <button onClick={() => setConfirmDel(u)} style={{ ...S.btn('#b71c1c'), padding:'5px 12px', fontSize:11 }}>🗑 Delete</button>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── User Banner ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={()=>setShowBanner(false)}
        onStart={()=>{ setShowBanner(false); openInvite() }}
        chapterName="Administration"
        formTitle={['Invite', 'New', 'User']}
        heading="Manage system users and access roles"
        description="Invite an employee to the platform. Supabase sends a secure email — the user sets their own password and is linked to their employee record."
        icon="👤"
        iconLabel={'User\nManagement'}
        workflowSteps={['Select Employee', 'Send Invite']}
        steps={['Select Employee', 'Send Invite']}
      />

      {/* ── INVITE MODAL — FormShell ────────────────────────────────── */}
      <FormShell
        isOpen={showInvite}
        onClose={() => setShowInvite(false)}
        chapterName="Administration"
        title={['Invite', 'New', 'User']}
        description="Invite an employee to the platform. Supabase sends a secure email."
        steps={['Select Employee', 'Send Invite']}
        currentStep={inviteStep}
        onBack={inviteStep===1 ? () => setShowInvite(false) : () => setInviteStep(1)}
        backLabel={inviteStep===1 ? 'Cancel' : 'Back'}
        onNext={inviteStep===1 ? () => { if(selectedEmp&&form.role&&(form.email||selectedEmp?.email)) setInviteStep(2) } : invite}
        nextLabel={inviteStep===1 ? 'Save & Next' : (saving ? 'Sending…' : 'Send Invite')}
        nextDisabled={inviteStep===1 ? !selectedEmp||!form.role||(!form.email&&!selectedEmp?.email) : saving}
        subjectLabel={{ line1: selectedEmp?.dept_code || null, line2: selectedEmp?.full_name || selectedEmp?.full_name_en || null }}
      >
        <div>

                  {/* ── STEP 1: Compact dropdown form ── */}
                  {inviteStep===1 && (<>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px 16px', marginBottom:14 }}>

                      {/* Entity */}
                      <div>
                        <label style={S.label}>Entity *</label>
                        {isSuperAdmin
                          ? <select style={S.inp} value={form.entity_code} onChange={e=>{ setF('entity_code',e.target.value); setSelectedEmp(null); setDeptFilter(''); setF('email',''); setF('phone','') }}>
                              {ENTITIES.map(e=><option key={e.code} value={e.code}>{e.code} — {e.name}</option>)}
                            </select>
                          : <div style={{...S.inp,background:'#f5f7fb',color:'#546e7a',cursor:'default'}}>{form.entity_code} — {ENTITIES.find(e=>e.code===form.entity_code)?.name}</div>
                        }
                      </div>

                      {/* Department */}
                      <div>
                        <label style={S.label}>Department *</label>
                        <select style={S.inp} value={deptFilter} onChange={e=>{ setDeptFilter(e.target.value); setSelectedEmp(null); setF('email',''); setF('phone','') }}>
                          <option value="">— Select Department —</option>
                          {formDepts.map(d=><option key={d.id} value={d.id}>{d.dept_code||d.short_code}</option>)}
                        </select>
                      </div>

                      {/* Employee Name */}
                      <div>
                        <label style={S.label}>Employee Name *</label>
                        {empLoading
                          ? <div style={{...S.inp,color:'#aab2bd'}}>Loading employees…</div>
                          : <select style={S.inp} value={selectedEmp?.id||''} onChange={e=>{
                              const emp=empList.find(x=>x.id===e.target.value)
                              if(emp){
                                setSelectedEmp(emp)
                                setF('email',emp.email||'')
                                setF('phone',emp.phone||'')
                                // store dept name (not ID) in form for display + invite profile
                                const deptObj=formDepts.find(d=>d.id===emp.dept_id)
                                setF('department',deptObj?.name||emp.deptName||'')
                              } else { setSelectedEmp(null); setF('email',''); setF('phone','') }
                            }}>
                              <option value="">— Select Employee —</option>
                              {empList.filter(e=>!deptFilter||e.dept_id===deptFilter).map(emp=>(
                                <option key={emp.id} value={emp.id} disabled={emp.hasAccount}>
                                  {emp.name}{emp.empNo?` (#${emp.empNo})`:''}{emp.hasAccount?' — Has Access':''}
                                </option>
                              ))}
                            </select>
                        }
                      </div>

                      {/* System Role */}
                      <div>
                        <label style={S.label}>System Role *</label>
                        <select style={S.inp} value={form.role} onChange={e=>setF('role',e.target.value)}>
                          <option value="">— Select Role —</option>
                          {assignableRoles.map(r=><option key={r} value={r}>{ROLE_META[r].icon} {r}</option>)}
                        </select>
                        {form.role && <div style={{fontSize:10,color:'#6b7c93',marginTop:4}}>{ROLE_META[form.role]?.desc}</div>}
                      </div>

                      {/* Email */}
                      <div>
                        <label style={S.label}>Email {!selectedEmp?.email&&selectedEmp&&<span style={{color:'#e65100'}}>* required</span>}</label>
                        <input type="email" style={{...S.inp,background:selectedEmp?.email?'#f5f7fb':'#fff',color:selectedEmp?.email?'#1565C0':'#1a2e3d'}}
                          value={form.email} onChange={e=>setF('email',e.target.value)}
                          placeholder={selectedEmp?'Auto-populated from employee record':'Select employee first'} readOnly={!!selectedEmp?.email} />
                      </div>

                      {/* Phone */}
                      <div>
                        <label style={S.label}>Phone</label>
                        <input style={{...S.inp,background:selectedEmp?.phone?'#f5f7fb':'#fff',color:selectedEmp?.phone?'#1565C0':'#1a2e3d'}}
                          value={form.phone} onChange={e=>setF('phone',e.target.value)}
                          placeholder={selectedEmp?'Auto-populated from employee record':'Select employee first'} readOnly={!!selectedEmp?.phone} />
                      </div>

                    </div>

                    {/* Auto-populate note */}
                    {selectedEmp && (
                      <div style={{fontSize:11,color:'#6b7c93',marginBottom:10,fontStyle:'italic'}}>
                        Employee Email and Phone number is auto populated from their employee record.
                      </div>
                    )}

                    {/* Already-has-account warning */}
                    {selectedEmp?.hasAccount && (
                      <div style={{background:'#fff3e0',border:'1px solid #ffb300',borderRadius:8,padding:'9px 14px',marginBottom:12,fontSize:12,color:'#e65100'}}>
                        This employee already has system access. Saving will update their role and details.
                      </div>
                    )}
                  </>)}

                  {/* ── STEP 2: Confirm & Send Invite ── */}
                  {inviteStep===2 && selectedEmp && (<>
                    <div style={{background:'linear-gradient(135deg,#2d3580 0%,#454D9B 70%,#6b74c8 100%)',borderRadius:16,padding:'24px 26px',marginBottom:18,color:'#fff',position:'relative',overflow:'hidden'}}>
                      <div style={{position:'absolute',right:-30,bottom:-30,width:120,height:120,borderRadius:'50%',background:'rgba(255,255,255,0.06)'}} />
                      <div style={{position:'absolute',right:60,top:-20,width:80,height:80,borderRadius:'50%',background:'rgba(255,255,255,0.04)'}} />
                      <div style={{fontSize:10,fontWeight:800,letterSpacing:2,textTransform:'uppercase',opacity:0.65,marginBottom:18,position:'relative',zIndex:1}}>Invite Summary — Review before sending</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px 24px',position:'relative',zIndex:1}}>
                        {[
                          ['Entity', ENTITIES.find(e=>e.code===form.entity_code)?.name||form.entity_code],
                          ['Employee Name', selectedEmp.name+(selectedEmp.empNo?` (#${selectedEmp.empNo})`:'')],
                          ['Department', form.department||'—'],
                          ['System Role', (ROLE_META[form.role]?.icon||'')+' '+form.role],
                          ['Email', form.email||selectedEmp.email||'—'],
                          ['Phone', form.phone||selectedEmp.phone||'—'],
                        ].map(([lbl,val])=>(
                          <div key={lbl}>
                            <div style={{fontSize:10,opacity:0.6,letterSpacing:0.6,textTransform:'uppercase',marginBottom:3}}>{lbl}</div>
                            <div style={{fontSize:13,fontWeight:700,wordBreak:'break-all'}}>{val}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{background:'#e8f5e9',border:'1px solid #a5d6a7',borderRadius:8,padding:'10px 14px',fontSize:12,color:'#2e7d32',marginBottom:18}}>
                      Supabase will send a secure invite email. The employee sets their own password on first login and will be linked to their employee record.
                    </div>
                  </>)}

        </div>
      </FormShell>

      {/* ── EDIT MODAL ─────────────────────────────────────────────── */}
      {editUser && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setEditUser(null)}>
          <div style={S.modal}>
            <div style={{ fontWeight:800, fontSize:17, color:'#1a2e3d', marginBottom:2 }}>Edit User</div>
            <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>{editUser.email}</div>

            <div style={{ marginBottom:14 }}>
              <label style={S.label}>Full Name</label>
              <input style={S.inp} value={form.full_name} onChange={e => setF('full_name', e.target.value)} />
            </div>

            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>Role</label>
                <select style={S.inp} value={form.role} onChange={e => setF('role', e.target.value)}>
                  {assignableRoles.map(r => (
                    <option key={r} value={r}>{ROLE_META[r].icon} {r}</option>
                  ))}
                </select>
                {form.role && <div style={{ fontSize:10, color:'#6b7c93', marginTop:3 }}>{ROLE_META[form.role]?.desc}</div>}
              </div>
              <div style={S.col}>
                <label style={S.label}>Entity</label>
                <select
                  style={{ ...S.inp, opacity: isSuperAdmin ? 1 : 0.7 }}
                  value={form.entity_code}
                  onChange={e => setF('entity_code', e.target.value)}
                  disabled={!isSuperAdmin}
                >
                  {ENTITIES.map(e => <option key={e.code} value={e.code}>{e.code} — {e.name}</option>)}
                </select>
              </div>
            </div>

            <div style={S.row}>
              <div style={S.col}>
                <label style={S.label}>Department</label>
                {formDepts.length > 0
                  ? (
                    <select style={S.inp} value={form.department} onChange={e => setF('department', e.target.value)}>
                      <option value="">— None —</option>
                      {formDepts.map(d => (
                        <option key={d.id} value={d.dept_name||d.name}>{d.dept_code||d.short_code}</option>
                      ))}
                    </select>
                  ) : (
                    <input style={S.inp} value={form.department} onChange={e => setF('department', e.target.value)} />
                  )
                }
              </div>
              <div style={S.col}>
                <label style={S.label}>Phone</label>
                <input style={S.inp} value={form.phone} onChange={e => setF('phone', e.target.value)} />
              </div>
            </div>

            <div style={{ background:'#fff3e0', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:11, color:'#e65100' }}>
              ⚠️ Role and entity changes take effect on the user's next page load.
            </div>

            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button style={S.btn('#aab2bd')} onClick={() => setEditUser(null)}>Cancel</button>
              <button style={S.btn('#1565C0')} onClick={updateProfile} disabled={saving}>
                {saving ? '⏳ Saving…' : '💾 Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM MODAL (SUPERADMIN only) ───────────────── */}
      {/* ── SET PASSWORD MODAL ─────────────────────────────────────── */}
      {setPwUser && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setSetPwUser(null)}>
          <div style={{ ...S.modal, width:420 }}>
            <div style={{ fontWeight:800, fontSize:16, color:'#6a1b9a', marginBottom:4 }}>🔐 Set Password</div>
            <div style={{ fontSize:12, color:'#aab2bd', marginBottom:16 }}>
              {setPwUser.full_name || setPwUser.email} · {setPwUser.email} · {setPwUser.role}
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:11, color:'#aab2bd', marginBottom:4 }}>New Password (min 8 characters)</label>
              <div style={{ position:'relative' }}>
                <input
                  type={setPwShow ? 'text' : 'password'}
                  value={setPwVal}
                  onChange={e => setSetPwVal(e.target.value)}
                  placeholder="Enter password to set…"
                  id="set-pw-input"
                  autoComplete="new-password"
                  name="new-password-direct"
                  style={{ width:'100%', padding:'9px 36px 9px 10px', borderRadius:8, border:'1px solid #333', background:'#1e1e2e', color:'#e0e0e0', fontSize:13, boxSizing:'border-box' }}
                />
                <button
                  onClick={() => setSetPwShow(v => !v)}
                  style={{ position:'absolute', right:8, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', color:'#aab2bd', cursor:'pointer', fontSize:14 }}
                >{setPwShow ? '🙈' : '👁'}</button>
              </div>
            </div>
            <div style={{ background:'#1e1a2e', border:'1px solid #4a1a6a', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:11, color:'#ce93d8' }}>
              This sets the password directly — no email is sent. Share it with the user via WhatsApp or message.
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button style={S.btn('#555')} onClick={() => { setSetPwUser(null); setSetPwVal('') }}>Cancel</button>
              <button style={S.btn('#6a1b9a')} onClick={doSetPassword} disabled={saving || setPwVal.length < 8}>
                {saving ? '⏳ Setting…' : '🔐 Set Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setConfirmDel(null)}>
          <div style={{ ...S.modal, width:460, textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
            <div style={{ fontWeight:800, fontSize:17, color:'#b71c1c', marginBottom:8 }}>Permanently Delete User?</div>
            <div style={{ fontSize:14, color:'#546e7a', marginBottom:6 }}>
              <strong>{confirmDel.full_name || confirmDel.email}</strong>
            </div>
            <div style={{ fontSize:12, color:'#aab2bd', marginBottom:20 }}>
              {confirmDel.email} · {confirmDel.role} · {confirmDel.entity_code}
            </div>
            <div style={{ background:'#ffebee', border:'1px solid #ef9a9a', borderRadius:10, padding:'12px 16px', marginBottom:20, fontSize:12, color:'#c62828', textAlign:'left' }}>
              This will permanently remove the user from Supabase Auth and delete their profile. This action cannot be undone.<br/><br/>
              If you want to temporarily block access instead, use <strong>Deactivate</strong>.
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <button style={S.btn('#aab2bd')} onClick={() => setConfirmDel(null)}>Cancel</button>
              <button style={S.btn('#b71c1c')} onClick={deleteUser} disabled={deleting}>
                {deleting ? '⏳ Deleting…' : '🗑 Yes, Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
