/**
 * QRManager.jsx
 *
 * Phase J — QR Code Manager
 * Admin page for generating, viewing, sharing, and revoking
 * employee QR tokens used for field form authentication.
 *
 * Features:
 *  • List all tokens (filterable by status / employee)
 *  • Generate new token: pick employee + role + optional expiry + notes
 *  • Show QR code (via qrserver.com) + deep link
 *  • Copy link / share via WhatsApp / share via Telegram
 *  • Revoke token (sets is_active = false)
 *  • Re-activate revoked token
 */

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import PageBanner from '../components/PageBanner'
import FormShell from '../components/FormShell'
import { kpiCardGradient } from '../styles/appStyles'

// ── Role options ──────────────────────────────────────────────────────────────

const FIELD_ROLES = [
  { value:'STAFF_TECH',       label:'Staff Technician',       emp_type:'STAFF'        },
  { value:'STAFF_SUPERVISOR', label:'Staff Supervisor',       emp_type:'STAFF'        },
  { value:'STAFF_PM',         label:'Project Manager',        emp_type:'STAFF'        },
  { value:'STAFF_DH',         label:'Department Head',        emp_type:'STAFF'        },
  { value:'SUBCONTRACTOR',    label:'Sub-Contractor',         emp_type:'SUBCONTRACTOR'},
  { value:'OUTSOURCED',       label:'Outsourced Staff',       emp_type:'OUTSOURCED'   },
  { value:'DRIVER',           label:'Driver',                 emp_type:'STAFF'        },
  { value:'FINANCE',          label:'Finance / Accounts',     emp_type:'STAFF'        },
]

const ROLE_COLORS = {
  STAFF_TECH:       '#1565c0',
  STAFF_SUPERVISOR: '#6a1b9a',
  STAFF_PM:         '#0277bd',
  STAFF_DH:         '#1a2540',
  SUBCONTRACTOR:    '#33691e',
  OUTSOURCED:       '#e65100',
  DRIVER:           '#37474f',
  FINANCE:          '#00695c',
}

// ── Token generator ────────────────────────────────────────────────────────────

function generateToken() {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2,'0')).join('')
}

// ── QR code URL (free public API, no install needed) ──────────────────────────

function qrUrl(data, size = 220) {
  return `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(data)}&size=${size}x${size}&margin=10&color=1a2540`
}

// ── Styles ────────────────────────────────────────────────────────────────────

const t = {
  page:   { padding:'24px 28px', fontFamily:"'Poppins',sans-serif", maxWidth:1100 },
  head:   { display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 },
  h1:     { fontSize:22, fontWeight:900, color:'#1a2e3d', margin:0 },
  badge:  (color) => ({
    display:'inline-block', padding:'2px 10px', borderRadius:20,
    background: color + '18', color, fontSize:11, fontWeight:700,
  }),
  card:   { background:'#fff', borderRadius:14, boxShadow:'0 2px 10px rgba(0,0,0,0.07)', overflow:'hidden' },
  th:     { padding:'10px 14px', fontSize:11, fontWeight:700, color:'#fff', background:'#454D9B', borderBottom:'2px solid #3a4186', textAlign:'left', fontFamily:"'Poppins',sans-serif", textTransform:'uppercase', letterSpacing:0.5 },
  td:     { padding:'11px 14px', fontSize:13, color:'#1a2e3d', borderBottom:'1px solid #f0f0f0', verticalAlign:'middle' },
  btn:    (bg, fg='#fff') => ({
    padding:'7px 14px', background:bg, color:fg, border:'none',
    borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
  }),
  input:  { padding:'8px 12px', border:'1.5px solid #cfd8dc', borderRadius:8, fontSize:13, width:'100%', boxSizing:'border-box', background:'#f8fafc', color:'#1a2e3d' },
  label:  { display:'block', fontSize:12, fontWeight:700, color:'#546e7a', marginBottom:4 },
  fwrap:  { marginBottom:14 },
  modal:  {
    position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000,
    display:'flex', alignItems:'center', justifyContent:'center', padding:20,
  },
  mbox:   {
    background:'#fff', borderRadius:18, padding:28, maxWidth:480, width:'100%',
    maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.25)',
  },
  mhead:  { fontSize:18, fontWeight:900, color:'#1a2e3d', marginBottom:20 },
}

// ── Administration palette ────────────────────────────────────────────────────
const L1   = '#AAAED0'
const L2   = '#F0F1FA'
const L3   = '#454D9B'
const PP   = "'Poppins', sans-serif"
const MAIN = '#172D37'
const SUB  = '#53666F'
const TD   = { padding:'11px 13px', fontSize:13, color:MAIN, borderBottom:'1px solid #f0f0f0', verticalAlign:'middle', fontFamily:PP }

// ── Dropdown menu item style ─────────────────────────────────────────────────
const menuItem = {
  display:'block', width:'100%', textAlign:'left',
  padding:'11px 18px', background:'none', border:'none',
  fontSize:13, color:'#1a2e3d', cursor:'pointer',
  fontFamily:"'Poppins',sans-serif",
  letterSpacing: 0.1,
}

// ── All available form keys with labels ──────────────────────────────────────

const ALL_FORMS = [
  { key:'expense_daily',       label:'Daily Expense',       icon:'🧾' },
  { key:'expense_claim',       label:'Expense Claim',       icon:'📋' },
  { key:'food_allowance',      label:'Food Allowance',      icon:'🍱' },
  { key:'overtime',            label:'Overtime Request',    icon:'⏱️' },
  { key:'site_completion',     label:'Site Completion',     icon:'🏗️' },
  { key:'money_request',       label:'Money Request',       icon:'💰' },
  { key:'po_request',          label:'PO Request',          icon:'📦' },
  { key:'field_payment',       label:'Field Payment',       icon:'💳' },
  { key:'subcon_claim',        label:'Sub-Con Claim',       icon:'🤝' },
  { key:'car_maintenance',     label:'Car / Maintenance',   icon:'🚗' },
  { key:'payment_validation',  label:'Payment Confirmation',icon:'✅' },
  { key:'dh_dashboard',        label:'DH Dashboard',        icon:'📊' },
]

// ── Role-to-form map (mirrors useFieldAuth.js ROLE_FORM_ACCESS) ──────────────
const ROLE_FORM_ACCESS = {
  STAFF_TECH:       ['expense_daily','expense_claim','food_allowance','overtime','payment_validation'],
  STAFF_SUPERVISOR: ['expense_daily','expense_claim','food_allowance','overtime','po_request','payment_validation'],
  STAFF_PM:         ['expense_daily','expense_claim','food_allowance','overtime','po_request','money_request','payment_validation'],
  STAFF_DH:         ['expense_daily','expense_claim','food_allowance','overtime','site_completion','money_request','po_request','field_payment','subcon_claim','car_maintenance','payment_validation','dh_dashboard'],
  SUBCONTRACTOR:    ['site_completion','subcon_claim','payment_validation'],
  OUTSOURCED:       ['expense_daily','expense_claim','payment_validation'],
  DRIVER:           ['expense_daily','expense_claim','food_allowance','overtime','car_maintenance','payment_validation'],
  FINANCE:          ['expense_daily','expense_claim','food_allowance','overtime','site_completion','money_request','po_request','field_payment','subcon_claim','car_maintenance','payment_validation','dh_dashboard'],
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function QRManager({ entityId, entityCode, isAr }) {
  const [tokens,    setTokens]    = useState([])
  const [allEmps,   setAllEmps]   = useState([])   // flat employees (no joins)
  const [allDepts,  setAllDepts]  = useState([])   // flat departments
  const [allEnts,   setAllEnts]   = useState([])   // flat entities
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('ALL')   // ALL | ACTIVE | REVOKED
  const [search,    setSearch]    = useState('')

  // Modals
  const [showGen,    setShowGen]    = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  const [showQR,     setShowQR]     = useState(null)   // token row
  const [revoking,   setRevoking]   = useState(null)   // token id

  // Permissions modal
  const [showPerms,   setShowPerms]   = useState(null)   // token row
  const [permDeltas,  setPermDeltas]  = useState([])     // qr_token_forms rows
  const [permLoading, setPermLoading] = useState(false)
  const [permSaving,  setPermSaving]  = useState(null)   // form_key being saved

  // Action dropdown per row
  const [openMenu,    setOpenMenu]    = useState(null)   // token id with open menu

  // Generate form state
  const [genEntity, setGenEntity] = useState('')   // entity UUID — resolved after allEnts loads
  const [genDept,   setGenDept]   = useState('')               // dept UUID
  const [genEmp,    setGenEmp]    = useState('')
  const [genRole,   setGenRole]   = useState('STAFF_TECH')
  const [genExpiry, setGenExpiry] = useState('')
  const [genNotes,  setGenNotes]  = useState('')
  const [genBusy,   setGenBusy]   = useState(false)
  const [genErr,    setGenErr]    = useState('')
  const [genResult, setGenResult] = useState(null)  // newly created token row

  // Resolve entityId prop (may be UUID or code string) to UUID once allEnts is loaded
  useEffect(() => {
    if (!entityId || allEnts.length === 0) return
    const found = allEnts.find(e => e.id === entityId || e.entity_code === entityId || e.entity_code === entityCode)
    if (found) setGenEntity(found.id)
    else setGenEntity(entityId) // assume it's already a UUID
  }, [entityId, entityCode, allEnts])

  // ── Data loaders ────────────────────────────────────────────────────────────

  const loadTokens = useCallback(async () => {
    setLoading(true)
    let q = supabase
      .from('qr_tokens_view')
      .select('*')
      .order('generated_at', { ascending: false })

    if (entityId) q = q.eq('entity_id', entityId)

    const { data } = await q
    setTokens(data || [])
    setLoading(false)
  }, [entityId])

  const loadEmployees = useCallback(async () => {
    // Flat query only — no nested joins (avoids PGRST201)
    let q = supabase
      .from('employees')
      .select('id,full_name_en,full_name,designation,department_id,entity_id,phone')
      .eq('status', 'ACTIVE')
      .order('full_name_en')
    if (entityId) q = q.eq('entity_id', entityId)
    const { data, error } = await q
    if (error) console.error('[QRMgr] employees:', error.message)
    setAllEmps(data || [])
  }, [entityId])

  const loadDepts = useCallback(async () => {
    let q = supabase
      .from('departments')
      .select('id,dept_name,dept_code,entity_id')
      .eq('is_active', true)
      .order('dept_name')
    if (entityId) q = q.eq('entity_id', entityId)
    const { data, error } = await q
    if (error) console.error('[QRMgr] departments:', error.message)
    setAllDepts(data || [])
  }, [entityId])

  const loadEntities = useCallback(async () => {
    const { data, error } = await supabase
      .from('entities')
      .select('id,entity_code,entity_name')
      .order('entity_name')
    if (error) console.error('[QRMgr] entities:', error.message)
    setAllEnts(data || [])
  }, [])

  useEffect(() => {
    loadEntities()
    loadDepts()
    loadEmployees()
    loadTokens()
  }, [loadEntities, loadDepts, loadEmployees, loadTokens])

  // Close action dropdown when clicking outside
  useEffect(() => {
    if (!openMenu) return
    const close = () => setOpenMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [openMenu])

  // ── Helpers ─────────────────────────────────────────────────────────────────

  // Always use the production URL so QR codes work from any device
  // Falls back to current origin only if explicitly on the production domain
  const PROD_ORIGIN = import.meta.env.VITE_APP_URL || 'https://ratal-group.vercel.app'
  const fieldUrl = (token) => {
    const origin = window.location.hostname === 'localhost' ? PROD_ORIGIN : window.location.origin
    return `${origin}/forms?t=${token}`
  }

  const copyLink = (token) => {
    navigator.clipboard.writeText(fieldUrl(token))
    alert('Link copied!\n' + fieldUrl(token))
  }

  const shareWhatsApp = (token, empName) => {
    const msg = `Hi ${empName || 'there'} 👋\n\nHere is your ACCSYS field access link:\n${fieldUrl(token)}\n\nScan the QR code or tap the link to access your forms.`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  const shareTelegram = (token, empName) => {
    const msg = `Hi ${empName || 'there'}! Your ACCSYS field link: ${fieldUrl(token)}`
    window.open(`https://t.me/share/url?url=${encodeURIComponent(fieldUrl(token))}&text=${encodeURIComponent(msg)}`, '_blank')
  }

  // ── Generate token ───────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!genEmp) { setGenErr('Select an employee.'); return }
    setGenBusy(true)
    setGenErr('')

    try {
      const token    = generateToken()
      const roleObj  = FIELD_ROLES.find(r => r.value === genRole)
      const emp      = allEmps.find(e => e.id === genEmp)

      // Resolve entity UUID — genEntity is set via dropdown or resolved from prop
      const entityUUID = genEntity || emp?.entity_id || null

      const payload = {
        token,
        employee_id:     genEmp,
        entity_id:       entityUUID,
        role:            genRole,
        employment_type: roleObj?.emp_type || 'STAFF',
        is_active:       true,
        notes:           genNotes.trim() || null,
        expires_at:      genExpiry || null,
        generated_at:    new Date().toISOString(),
        generated_by:    null,   // admin uses anon key — no employee FK available
      }

      const { data, error } = await supabase
        .from('qr_tokens')
        .insert(payload)
        .select('*')
        .single()

      if (error) throw error

      setGenResult({ ...data, employee_name: emp?.full_name_en || emp?.full_name })
      await loadTokens()
    } catch (e) {
      setGenErr(e.message || 'Failed to generate token.')
    } finally {
      setGenBusy(false)
    }
  }

  const resetGen = () => {
    setGenEntity(entityId || ''); setGenDept(''); setGenEmp('')
    setGenRole('STAFF_TECH'); setGenExpiry('')
    setGenNotes(''); setGenResult(null); setGenErr('')
  }

  // ── Revoke / Reactivate ───────────────────────────────────────────────────────

  const handleRevoke = async (tokenId) => {
    setRevoking(tokenId)
    await supabase
      .from('qr_tokens')
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq('id', tokenId)
    await loadTokens()
    setRevoking(null)
  }

  const handleReactivate = async (tokenId) => {
    setRevoking(tokenId)
    await supabase
      .from('qr_tokens')
      .update({ is_active: true, revoked_at: null })
      .eq('id', tokenId)
    await loadTokens()
    setRevoking(null)
  }

  // ── Permissions helpers ───────────────────────────────────────────────────────

  const openPerms = async (tk) => {
    setShowPerms(tk)
    setPermLoading(true)
    const { data } = await supabase
      .from('qr_token_forms')
      .select('form_key, is_granted')
      .eq('token_id', tk.id)
    setPermDeltas(data || [])
    setPermLoading(false)
  }

  const savePermOverride = async (formKey, grantedValue) => {
    // grantedValue: true = force-grant, false = force-deny, null = delete override
    setPermSaving(formKey)
    try {
      // Note: p_admin_id = null — we don't pass auth user UUID because it's a
      // different UUID space from employees(id), which would cause an FK violation.
      const { data: rpcResult, error: rpcErr } = await supabase.rpc('upsert_token_form_override', {
        p_token_id: showPerms.id,
        p_form_key: formKey,
        p_granted:  grantedValue,
        p_admin_id: null,
      })
      if (rpcErr) {
        console.error('savePermOverride RPC error:', rpcErr)
        alert(`Failed to save permission: ${rpcErr.message}`)
        return
      }
      if (rpcResult?.error) {
        console.error('savePermOverride DB error:', rpcResult.error)
        alert(`Failed to save permission: ${rpcResult.error}`)
        return
      }
      // Refresh deltas from DB
      const { data } = await supabase
        .from('qr_token_forms')
        .select('form_key, is_granted')
        .eq('token_id', showPerms.id)
      setPermDeltas(data || [])
    } finally {
      setPermSaving(null)
    }
  }

  /** Compute effective form set for a token given its role + current deltas */
  const getEffectiveForms = (role, deltas) => {
    const base = new Set(ROLE_FORM_ACCESS[role] || [])
    deltas.forEach(d => {
      if (d.is_granted) base.add(d.form_key)
      else              base.delete(d.form_key)
    })
    return base
  }

  // ── Filtered list ────────────────────────────────────────────────────────────

  const visible = tokens.filter(tk => {
    if (filter === 'ACTIVE'  && !tk.is_active) return false
    if (filter === 'REVOKED' &&  tk.is_active) return false
    if (search) {
      const q = search.toLowerCase()
      if (!(tk.employee_name || '').toLowerCase().includes(q) &&
          !(tk.role || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const activeCount  = tokens.filter(t => t.is_active).length
  const revokedCount = tokens.filter(t => !t.is_active).length

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="qr-mgr-root" style={{ fontFamily:PP, display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden', background:L2 }}>
      <style>{`
        .qr-mgr-root button, .qr-mgr-root input, .qr-mgr-root select, .qr-mgr-root textarea {
          font-family: 'Poppins', sans-serif !important;
        }
      `}</style>

      {/* UPPER ZONE */}
      <div style={{ flexShrink:0, background:L2, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', zIndex:10 }}>

        {/* L1 bar */}
        <div style={{ padding:'6px 28px 0' }}>
          <div style={{ background:L1, padding:'8px 16px', borderRadius:'6px 6px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:MAIN, fontFamily:PP }}>🔑 QR Code Manager</div>
              <div style={{ fontSize:10, color:SUB, opacity:0.85, marginTop:1, fontFamily:PP }}>Administration · Employee field-access tokens</div>
            </div>
            <button onClick={() => setShowBanner(true)}
              style={{ padding:'7px 16px', borderRadius:7, border:'none', background:L3, color:'#fff',
                fontFamily:PP, fontSize:12, fontWeight:700, cursor:'pointer' }}>
              + Generate Token
            </button>
          </div>
        </div>

        {/* KPI cards */}
        <div style={{ padding:'10px 28px 12px', display:'flex', flexWrap:'wrap', gap:8 }}>
          {[
            { label:'Total Tokens', value: tokens.length },
            { label:'Active',       value: activeCount   },
            { label:'Revoked',      value: revokedCount  },
          ].map((k, i) => (
            <div key={i}
              style={{ ...kpiCardGradient(i, L1, L2, L3), width:160, height:62, borderRadius:10, padding:'0 14px',
                flexShrink:0, boxShadow:'0 2px 8px rgba(0,0,0,0.10)',
                display:'flex', flexDirection:'column', justifyContent:'center' }}>
              <div style={{ fontSize:18, fontWeight:800, lineHeight:1 }}>{k.value}</div>
              <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, opacity:0.75, marginTop:4 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div style={{ padding:'0 28px 10px' }}>
          <div style={{ background:'#fff', borderRadius:8, boxShadow:'0 1px 4px rgba(0,0,0,0.08)', padding:'10px 14px', display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            {['ALL','ACTIVE','REVOKED'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding:'5px 14px', borderRadius:20, fontSize:11, fontWeight:700, cursor:'pointer', border:'none',
                  background: filter === f ? L3 : '#f0f1fa',
                  color: filter === f ? '#fff' : '#546e7a' }}>
                {f === 'ALL' ? `All (${tokens.length})` : f === 'ACTIVE' ? `Active (${activeCount})` : `Revoked (${revokedCount})`}
              </button>
            ))}
            <input
              placeholder="🔍 Search employee or role…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ padding:'7px 11px', border:'1.5px solid #dde3ec', borderRadius:8, fontSize:12,
                fontFamily:PP, background:'#f8fafc', color:MAIN, outline:'none', minWidth:200, marginLeft:'auto' }}
            />
            <div style={{ background:L2, border:`1px solid ${L3}33`, borderRadius:20, padding:'4px 12px',
              fontSize:11, fontWeight:700, color:L3 }}>
              {visible.length} shown
            </div>
          </div>
        </div>
      </div>{/* end upper zone */}

      {/* SCROLL ZONE */}
      <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:'0 28px 22px' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#78909c', fontFamily:PP }}>Loading tokens…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#aab2bd', fontFamily:PP }}>
            {tokens.length === 0 ? 'No tokens generated yet. Click "+ Generate Token" to create one.' : 'No tokens match the current filter.'}
          </div>
        ) : (
          <div style={{ background:'#fff', borderRadius:'0 0 8px 8px', boxShadow:'0 2px 8px rgba(0,0,0,0.08)', overflow:'hidden' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
              <colgroup>
                <col style={{ width: 320 }} />{/* Employee */}
                <col style={{ width: 130 }} />{/* Role */}
                <col style={{ width: 90 }} />{/* Status */}
                <col style={{ width: 110 }} />{/* Last Used */}
                <col style={{ width: 110 }} />{/* Generated */}
                <col style={{ width: 110 }} />{/* Expires */}
                <col style={{ width: 190 }} />{/* Actions */}
              </colgroup>
              <thead>
                <tr style={{ position:'sticky', top:0, zIndex:20 }}>
                  {['Employee','Role','Status','Last Used','Generated','Expires','Actions'].map((h, i) => (
                    <th key={h} style={{ padding:'9px 13px', background:L3, color:'#fff', fontSize:10, fontWeight:700,
                      textTransform:'uppercase', letterSpacing:0.7, textAlign: i === 6 ? 'center' : 'left',
                      fontFamily:PP, whiteSpace:'nowrap', borderBottom:`2px solid ${L3}cc` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(tk => {
                  const expired  = tk.expires_at && new Date(tk.expires_at) < new Date()
                  const isActive = tk.is_active && !expired
                  return (
                    <tr key={tk.id} style={{ opacity: isActive ? 1 : 0.65 }}>
                      <td style={TD}>
                        <div style={{ fontWeight:700, fontSize:13 }}>{tk.employee_name || '—'}</div>
                        {tk.designation && <div style={{ fontSize:10, color:'#78909c', marginTop:1 }}>{tk.designation}</div>}
                      </td>
                      <td style={TD}>
                        <span style={t.badge(ROLE_COLORS[tk.role] || '#546e7a')}>{tk.role}</span>
                      </td>
                      <td style={TD}>
                        {expired ? (
                          <span style={t.badge('#f57f17')}>EXPIRED</span>
                        ) : isActive ? (
                          <span style={t.badge('#2e7d32')}>ACTIVE</span>
                        ) : (
                          <span style={t.badge('#b71c1c')}>REVOKED</span>
                        )}
                      </td>
                      <td style={{ ...TD, fontSize:12, whiteSpace:'nowrap' }}>
                        {tk.last_used_at
                          ? new Date(tk.last_used_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
                          : <span style={{ color:'#aab2bd' }}>Never</span>}
                      </td>
                      <td style={{ ...TD, fontSize:12, whiteSpace:'nowrap' }}>
                        {new Date(tk.generated_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}
                      </td>
                      <td style={{ ...TD, fontSize:12, whiteSpace:'nowrap' }}>
                        {tk.expires_at
                          ? <span style={{ color: expired ? '#b71c1c' : '#546e7a' }}>
                              {new Date(tk.expires_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}
                            </span>
                          : <span style={{ color:'#aab2bd' }}>—</span>}
                      </td>
                      <td style={{ ...TD, textAlign:'center', whiteSpace:'nowrap' }}>
                        <div style={{ display:'flex', gap:4, justifyContent:'center', alignItems:'center' }}>
                          <button onClick={() => setShowQR(tk)} title="Show QR Code"
                            style={{ background:'#f0f1fa', border:'none', borderRadius:6, padding:'5px 7px', cursor:'pointer', fontSize:15 }}>📱</button>
                          <button onClick={() => openPerms(tk)} title="Manage Permissions"
                            style={{ background:'#f0f1fa', border:'none', borderRadius:6, padding:'5px 7px', cursor:'pointer', fontSize:15 }}>🛡️</button>
                          <button onClick={() => shareWhatsApp(tk.token, tk.employee_name)} title="Share via WhatsApp"
                            style={{ background:'#f0f1fa', border:'none', borderRadius:6, padding:'5px 7px', cursor:'pointer', fontSize:15 }}>💬</button>
                          <button onClick={() => shareTelegram(tk.token, tk.employee_name)} title="Share via Telegram"
                            style={{ background:'#f0f1fa', border:'none', borderRadius:6, padding:'5px 7px', cursor:'pointer', fontSize:15 }}>✈️</button>
                          {isActive ? (
                            <button onClick={() => { if (window.confirm(`Revoke token for ${tk.employee_name}?`)) handleRevoke(tk.id) }} title="Revoke Access"
                              disabled={revoking === tk.id}
                              style={{ background:'#fff0f0', border:'none', borderRadius:6, padding:'5px 7px', cursor:'pointer', fontSize:15 }}>🚫</button>
                          ) : (
                            <button onClick={() => handleReactivate(tk.id)} title="Reactivate"
                              disabled={revoking === tk.id}
                              style={{ background:'#f0fff4', border:'none', borderRadius:6, padding:'5px 7px', cursor:'pointer', fontSize:15 }}>✅</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>{/* end scroll zone */}

      {/* ── QR Banner ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={()=>setShowBanner(false)}
        onStart={()=>{ setShowBanner(false); resetGen(); setShowGen(true) }}
        chapterName="Administration"
        formTitle={['Generate', 'QR Access', 'Token']}
        heading="Manage employee field-access tokens"
        description="Create a secure QR token for an employee to access field forms. Choose role, set optional expiry, and share the link via WhatsApp or Telegram."
        icon="🔑"
        iconLabel={'QR Code\nManager'}
        workflowSteps={['Select Employee & Role', 'Token Generated']}
        steps={['Select Employee & Role', 'Token Generated']}
      />

      {/* ── GENERATE MODAL — FormShell ────────────────────────────────────── */}
      <FormShell
        isOpen={showGen}
        onClose={() => { setShowGen(false); resetGen() }}
        chapterName="Administration"
        title={['Generate', 'QR Access', 'Token']}
        description="Create a secure QR token for an employee to access field forms."
        steps={['Token Details', 'Share & Done']}
        currentStep={genResult ? 2 : 1}
        onBack={genResult ? () => resetGen() : () => { setShowGen(false); resetGen() }}
        backLabel={genResult ? '← New Token' : 'Cancel'}
        onNext={genResult ? () => { setShowGen(false); resetGen() } : handleGenerate}
        nextLabel={genResult ? 'Done ✓' : (genBusy ? '⏳ Generating…' : '🔑 Generate')}
        nextDisabled={genBusy || (!genResult && !genEmp)}
      >
        <div>
            {genResult ? (
              /* SUCCESS STATE — show QR + links */
              <div>
                <div style={{ textAlign:'center', marginBottom:20 }}>
                  <img
                    src={qrUrl(fieldUrl(genResult.token), 240)}
                    alt="QR Code"
                    style={{ borderRadius:12, border:'2px solid #e0e0e0', maxWidth:240 }}
                  />
                </div>
                <div style={{ background:'#f1f8e9', borderRadius:12, padding:16, marginBottom:16, wordBreak:'break-all' }}>
                  <div style={{ fontSize:11, color:'#546e7a', marginBottom:6 }}>Field Access URL</div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#1a2e3d' }}>{fieldUrl(genResult.token)}</div>
                </div>
                <div style={{ fontSize:13, color:'#546e7a', marginBottom:16 }}>
                  Token generated for <strong>{genResult.employee_name}</strong> as <strong>{genResult.role}</strong>.
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
                  <button onClick={() => copyLink(genResult.token)} style={{ ...t.btn('#1a2540'), textAlign:'center' }}>📋 Copy</button>
                  <button onClick={() => shareWhatsApp(genResult.token, genResult.employee_name)} style={{ ...t.btn('#25d366'), textAlign:'center' }}>💬 WhatsApp</button>
                  <button onClick={() => shareTelegram(genResult.token, genResult.employee_name)} style={{ ...t.btn('#229ed9'), textAlign:'center' }}>✈️ Telegram</button>
                </div>
              </div>
            ) : (
              /* FORM STATE */
              (() => {
                // Build dept map for display
                const deptMap = {}
                allDepts.forEach(d => { deptMap[d.id] = { name: d.dept_name, code: d.dept_code } })

                // Cascade filters
                const formDepts = allDepts.filter(d => !genEntity || d.entity_id === genEntity)
                const formEmps  = allEmps.filter(e =>
                  (!genEntity || e.entity_id === genEntity) &&
                  (!genDept   || e.department_id === genDept)
                )
                return (
              <div>
                {/* Entity — shown for all; locked if entityId prop provided */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 14px', marginBottom:4 }}>
                  <div style={t.fwrap}>
                    <label style={t.label}>Entity *</label>
                    {entityId
                      ? <div style={{ ...t.input, background:'#f5f7fb', color:'#546e7a', cursor:'default' }}>
                          {allEnts.find(e => e.id === entityId)?.entity_name || entityCode || entityId}
                        </div>
                      : <select style={t.input} value={genEntity} onChange={e => { setGenEntity(e.target.value); setGenDept(''); setGenEmp('') }}>
                          <option value="">— Select Entity —</option>
                          {allEnts.map(e => <option key={e.id} value={e.id}>{e.entity_code} — {e.entity_name}</option>)}
                        </select>
                    }
                  </div>
                  <div style={t.fwrap}>
                    <label style={t.label}>Department *</label>
                    <select style={t.input} value={genDept} onChange={e => { setGenDept(e.target.value); setGenEmp('') }} disabled={!genEntity}>
                      <option value="">— Select Dept —</option>
                      {formDepts.map(d => <option key={d.id} value={d.id}>{d.dept_code}</option>)}
                    </select>
                  </div>
                </div>

                <div style={t.fwrap}>
                  <label style={t.label}>Employee *</label>
                  <select
                    style={{ ...t.input, opacity: !genDept ? 0.6 : 1 }}
                    value={genEmp}
                    disabled={!genDept}
                    onChange={e => {
                      setGenEmp(e.target.value)
                      const emp = formEmps.find(x => x.id === e.target.value)
                      if (emp) {
                        const d = (emp.designation || '').toLowerCase()
                        if (d.includes('head') || d.includes('director'))        setGenRole('STAFF_DH')
                        else if (d.includes('manager') || d.includes('pm'))      setGenRole('STAFF_PM')
                        else if (d.includes('supervisor'))                        setGenRole('STAFF_SUPERVISOR')
                        else if (d.includes('driver'))                            setGenRole('DRIVER')
                        else if (d.includes('finance') || d.includes('account')) setGenRole('FINANCE')
                      }
                    }}
                  >
                    <option value="">— Select Employee —</option>
                    {formEmps.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.full_name_en || e.full_name}{e.designation ? ` — ${e.designation}` : ''}
                      </option>
                    ))}
                  </select>
                  {genDept && formEmps.length === 0 && (
                    <div style={{ fontSize:11, color:'#e65100', marginTop:4 }}>No active employees in this department.</div>
                  )}
                </div>

                <div style={t.fwrap}>
                  <label style={t.label}>Field Role *</label>
                  <select
                    style={{ ...t.input, color: ROLE_COLORS[genRole] || '#1a2e3d', fontWeight:700 }}
                    value={genRole}
                    onChange={e => setGenRole(e.target.value)}
                  >
                    {FIELD_ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  {genRole && <div style={{ fontSize:11, color: ROLE_COLORS[genRole], marginTop:4, fontWeight:600 }}>
                    {FIELD_ROLES.find(r=>r.value===genRole)?.emp_type} employee type
                  </div>}
                </div>

                <div style={t.fwrap}>
                  <label style={t.label}>Expires (optional)</label>
                  <input
                    type="date"
                    style={t.input}
                    value={genExpiry}
                    onChange={e => setGenExpiry(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                  <div style={{ fontSize:11, color:'#aab2bd', marginTop:4 }}>Leave blank for a permanent token (never expires).</div>
                </div>

                <div style={t.fwrap}>
                  <label style={t.label}>Notes</label>
                  <input
                    style={t.input}
                    value={genNotes}
                    onChange={e => setGenNotes(e.target.value)}
                    placeholder="e.g. Project Alpha — Tower team"
                  />
                </div>

                {genErr && (
                  <div style={{ background:'#ffebee', borderRadius:8, padding:10, color:'#b71c1c', fontSize:13, marginBottom:12 }}>
                    ⚠️ {genErr}
                  </div>
                )}
              </div>
                ) /* end return */
              })() /* end IIFE */
            )}
        </div>
      </FormShell>

      {/* ── QR VIEW MODAL ──────────────────────────────────────────────────── */}
      {showQR && (
        <div style={t.modal} onClick={e => { if (e.target === e.currentTarget) setShowQR(null) }}>
          <div style={t.mbox}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
              <div style={t.mhead}>📱 QR Code — {showQR.employee_name}</div>
              <button onClick={() => setShowQR(null)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#546e7a' }}>×</button>
            </div>

            {/* Role badge */}
            <div style={{ marginBottom:16 }}>
              <span style={t.badge(ROLE_COLORS[showQR.role] || '#546e7a')}>{showQR.role}</span>
              {showQR.expires_at && (
                <span style={{ marginLeft:8, fontSize:12, color:'#546e7a' }}>
                  Expires: {new Date(showQR.expires_at).toLocaleDateString('en-GB')}
                </span>
              )}
            </div>

            {/* QR */}
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <img
                src={qrUrl(fieldUrl(showQR.token), 256)}
                alt="QR Code"
                style={{ borderRadius:12, border:'2px solid #e0e0e0', maxWidth:256 }}
              />
            </div>

            {/* URL */}
            <div style={{ background:'#f8fafc', borderRadius:10, padding:12, marginBottom:16, wordBreak:'break-all' }}>
              <div style={{ fontSize:11, color:'#546e7a', marginBottom:4 }}>Field Access URL</div>
              <div style={{ fontSize:12, color:'#1a2e3d' }}>{fieldUrl(showQR.token)}</div>
            </div>

            {/* Notes */}
            {showQR.notes && (
              <div style={{ fontSize:12, color:'#546e7a', marginBottom:16 }}>
                📝 {showQR.notes}
              </div>
            )}

            {/* Actions */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              <button onClick={() => copyLink(showQR.token)} style={t.btn('#1a2540')}>📋 Copy</button>
              <button onClick={() => shareWhatsApp(showQR.token, showQR.employee_name)} style={t.btn('#25d366')}>💬 WhatsApp</button>
              <button onClick={() => shareTelegram(showQR.token, showQR.employee_name)} style={t.btn('#229ed9')}>✈️ Telegram</button>
            </div>

            {/* Last used */}
            <div style={{ marginTop:14, fontSize:11, color:'#aab2bd', textAlign:'center' }}>
              {showQR.last_used_at
                ? `Last used: ${new Date(showQR.last_used_at).toLocaleString('en-GB')}`
                : 'This token has not been used yet.'}
            </div>
          </div>
        </div>
      )}

      {/* ── PERMISSIONS MODAL ──────────────────────────────────────────────── */}
      {showPerms && (
        <div style={t.modal} onClick={e => { if (e.target === e.currentTarget) setShowPerms(null) }}>
          <div style={{ ...t.mbox, maxWidth:560 }}>
            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
              <div>
                <div style={{ ...t.mhead, marginBottom:4 }}>🛡️ Form Permissions</div>
                <div style={{ fontSize:13, color:'#546e7a', marginBottom:4 }}>
                  <strong>{showPerms.employee_name}</strong>
                  &nbsp;·&nbsp;
                  <span style={{ color: ROLE_COLORS[showPerms.role] || '#546e7a', fontWeight:700 }}>{showPerms.role}</span>
                </div>
                <div style={{ fontSize:11, color:'#aab2bd' }}>
                  Green checkbox = accessible &nbsp;·&nbsp; Role defaults shown in grey &nbsp;·&nbsp; Overrides shown in purple
                </div>
              </div>
              <button onClick={() => setShowPerms(null)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'#546e7a', flexShrink:0 }}>×</button>
            </div>

            {permLoading ? (
              <div style={{ padding:30, textAlign:'center', color:'#78909c' }}>Loading permissions…</div>
            ) : (() => {
              const roleDefault  = new Set(ROLE_FORM_ACCESS[showPerms.role] || [])
              const effectiveForms = getEffectiveForms(showPerms.role, permDeltas)
              const deltaMap     = {}
              permDeltas.forEach(d => { deltaMap[d.form_key] = d.is_granted })

              return (
                <div>
                  {/* Legend */}
                  <div style={{ display:'flex', gap:12, marginBottom:14, flexWrap:'wrap' }}>
                    {[
                      { color:'#2e7d32', bg:'#e8f5e9', label:'Granted by role (default)' },
                      { color:'#6a1b9a', bg:'#f3e5f5', label:'Override: force-granted' },
                      { color:'#b71c1c', bg:'#ffebee', label:'Override: force-denied' },
                      { color:'#aab2bd', bg:'#f5f5f5', label:'Not accessible' },
                    ].map(l => (
                      <div key={l.label} style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <div style={{ width:12, height:12, borderRadius:3, background:l.bg, border:`2px solid ${l.color}` }} />
                        <span style={{ fontSize:10, color:'#546e7a' }}>{l.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Form grid */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:20 }}>
                    {ALL_FORMS.map(f => {
                      const inRole     = roleDefault.has(f.key)
                      const hasOverride = f.key in deltaMap
                      const overrideVal = deltaMap[f.key]    // true=granted, false=denied
                      const isEffective = effectiveForms.has(f.key)
                      const isSaving   = permSaving === f.key

                      // Visual state
                      let borderColor = '#e0e0e0'
                      let bg          = '#f9f9f9'
                      let labelColor  = '#aab2bd'
                      let checkIcon   = '○'
                      if (hasOverride && overrideVal === true)  { borderColor = '#6a1b9a'; bg = '#f3e5f5'; labelColor = '#6a1b9a'; checkIcon = '✓' }
                      else if (hasOverride && overrideVal === false) { borderColor = '#b71c1c'; bg = '#ffebee'; labelColor = '#b71c1c'; checkIcon = '✗' }
                      else if (inRole)  { borderColor = '#2e7d32'; bg = '#e8f5e9'; labelColor = '#2e7d32'; checkIcon = '✓' }

                      return (
                        <div key={f.key} style={{ border:`1.5px solid ${borderColor}`, borderRadius:10, padding:'10px 12px', background:bg, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0 }}>
                            <span style={{ fontSize:16, flexShrink:0 }}>{f.icon}</span>
                            <div style={{ minWidth:0 }}>
                              <div style={{ fontSize:12, fontWeight:700, color:labelColor, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{f.label}</div>
                              {hasOverride && (
                                <div style={{ fontSize:10, color: overrideVal ? '#6a1b9a' : '#b71c1c' }}>
                                  {overrideVal ? 'Forced ON' : 'Forced OFF'} · override
                                </div>
                              )}
                              {!hasOverride && inRole && (
                                <div style={{ fontSize:10, color:'#78909c' }}>Role default</div>
                              )}
                            </div>
                          </div>
                          <div style={{ display:'flex', flexDirection:'column', gap:4, flexShrink:0 }}>
                            {/* Grant button */}
                            <button
                              disabled={isSaving}
                              onClick={() => {
                                if (hasOverride && overrideVal === true) savePermOverride(f.key, null)   // revert
                                else if (!inRole) savePermOverride(f.key, true)                          // force-grant
                                else savePermOverride(f.key, null)                                       // already default
                              }}
                              title={
                                hasOverride && overrideVal === true ? 'Remove override (revert to role default)' :
                                !inRole ? 'Force-grant this form' :
                                'Already in role default (click to keep as default)'
                              }
                              style={{
                                padding:'3px 8px', fontSize:10, fontWeight:700, border:'none', borderRadius:5, cursor:'pointer',
                                background: hasOverride && overrideVal === true ? '#e8f5e9' : !inRole ? '#e8f5e9' : '#f0f4f8',
                                color:      hasOverride && overrideVal === true ? '#2e7d32' : !inRole ? '#2e7d32' : '#aab2bd',
                                opacity: isSaving ? 0.5 : 1,
                              }}
                            >
                              {hasOverride && overrideVal === true ? '↩ Revert' : '✓ Grant'}
                            </button>
                            {/* Deny button */}
                            <button
                              disabled={isSaving}
                              onClick={() => {
                                if (hasOverride && overrideVal === false) savePermOverride(f.key, null)  // revert
                                else if (inRole) savePermOverride(f.key, false)                          // force-deny
                              }}
                              title={
                                hasOverride && overrideVal === false ? 'Remove override (revert to role default)' :
                                inRole ? 'Force-deny this form' :
                                'Already denied by role (no action needed)'
                              }
                              style={{
                                padding:'3px 8px', fontSize:10, fontWeight:700, border:'none', borderRadius:5, cursor:'pointer',
                                background: hasOverride && overrideVal === false ? '#ffebee' : inRole ? '#ffebee' : '#f0f4f8',
                                color:      hasOverride && overrideVal === false ? '#b71c1c' : inRole ? '#b71c1c' : '#aab2bd',
                                opacity: isSaving || (!inRole && !(hasOverride && overrideVal === false)) ? 0.4 : 1,
                              }}
                            >
                              {hasOverride && overrideVal === false ? '↩ Revert' : '✗ Deny'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Summary */}
                  <div style={{ background:'#f8fafc', borderRadius:10, padding:12, fontSize:12, color:'#546e7a' }}>
                    <strong>Effective access:</strong>&nbsp;
                    {[...effectiveForms].length > 0
                      ? [...effectiveForms].map(k => ALL_FORMS.find(f=>f.key===k)?.label || k).join(', ')
                      : 'No forms accessible'}
                    {permDeltas.length > 0 && (
                      <div style={{ marginTop:6, color:'#6a1b9a', fontSize:11 }}>
                        {permDeltas.length} override{permDeltas.length>1?'s':''} active on this token.
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setShowPerms(null)}
                    style={{ ...t.btn('#f0f4f8','#546e7a'), width:'100%', marginTop:14 }}
                  >Close</button>
                </div>
              )
            })()}
          </div>
        </div>
      )}

  </div>
  )
}
