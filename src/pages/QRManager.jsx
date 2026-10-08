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
  page:   { padding:'24px 28px', fontFamily:'Arial,sans-serif', maxWidth:1100 },
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

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const fieldUrl = (token) => `${window.location.origin}/forms?t=${token}`

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

      // Get current user id for generated_by (required by RLS)
      const { data: { user } } = await supabase.auth.getUser()

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
        generated_by:    user?.id || null,
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
    <div style={t.page}>

      {/* Header */}
      <div style={t.head}>
        <div>
          <h1 style={t.h1}>🔑 QR Code Manager</h1>
          <div style={{ fontSize:13, color:'#78909c', marginTop:4 }}>
            Generate and manage employee field access QR tokens
          </div>
        </div>
        <button
          onClick={() => setShowBanner(true)}
          style={{ background:'#454D9B', color:'#fff', border:'none', borderRadius:10, padding:'10px 0', cursor:'pointer', fontSize:13, fontWeight:700, minWidth:160, textAlign:'center', boxShadow:'0 3px 8px rgba(69,77,155,0.35)', fontFamily:"'Poppins',sans-serif" }}
        >
          Generate QR Token
        </button>
      </div>

      {/* KPI strip */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20, alignItems:'stretch' }}>
        {[
          { label:'Total Tokens', value:tokens.length, color:'#3949ab', icon:'🔑' },
          { label:'Active',       value:activeCount,   color:'#2e7d32', icon:'✅' },
          { label:'Revoked',      value:revokedCount,  color:'#c62828', icon:'🚫' },
        ].map(k => (
          <div key={k.label} style={{ background:`linear-gradient(135deg,${k.color}cc 0%,${k.color} 100%)`, borderRadius:10, padding:'10px 16px', flexShrink:0, minWidth:130, boxShadow:`0 3px 10px ${k.color}44`, position:'relative', overflow:'hidden' }}>
            <div style={{ position:'absolute', right:8, top:6, fontSize:18, opacity:0.25 }}>{k.icon}</div>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.85)', fontWeight:700, textTransform:'uppercase', letterSpacing:0.8, fontFamily:"'Poppins',sans-serif" }}>{k.label}</div>
            <div style={{ fontSize:24, fontWeight:900, color:'#fff', lineHeight:1.2, marginTop:2 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        {['ALL','ACTIVE','REVOKED'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding:'6px 16px', borderRadius:20, fontSize:12, fontWeight:700,
              border:`2px solid ${filter === f ? '#454D9B' : '#e0e0e0'}`,
              background: filter === f ? '#454D9B' : '#fff',
              color: filter === f ? '#fff' : '#546e7a', cursor:'pointer',
            }}
          >
            {f === 'ALL' ? `All (${tokens.length})` : f === 'ACTIVE' ? `Active (${activeCount})` : `Revoked (${revokedCount})`}
          </button>
        ))}
        <input
          style={{ ...t.input, maxWidth:240, marginLeft:'auto' }}
          placeholder="🔍 Search employee or role…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Token table */}
      <div style={t.card}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#78909c' }}>Loading tokens…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#aab2bd' }}>
            {tokens.length === 0 ? 'No tokens generated yet. Click "Generate QR Token" to create one.' : 'No tokens match the current filter.'}
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Employee','Role','Status','Last Used','Generated','Expires','Actions'].map(h => (
                  <th key={h} style={t.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map(tk => {
                const expired = tk.expires_at && new Date(tk.expires_at) < new Date()
                const isActive = tk.is_active && !expired
                return (
                  <tr key={tk.id} style={{ opacity: isActive ? 1 : 0.65 }}>
                    <td style={t.td}>
                      <div style={{ fontWeight:700 }}>{tk.employee_name || '—'}</div>
                      <div style={{ fontSize:11, color:'#78909c' }}>{tk.designation}</div>
                    </td>
                    <td style={t.td}>
                      <span style={t.badge(ROLE_COLORS[tk.role] || '#546e7a')}>
                        {tk.role}
                      </span>
                    </td>
                    <td style={t.td}>
                      {expired ? (
                        <span style={t.badge('#f57f17')}>EXPIRED</span>
                      ) : isActive ? (
                        <span style={t.badge('#2e7d32')}>ACTIVE</span>
                      ) : (
                        <span style={t.badge('#b71c1c')}>REVOKED</span>
                      )}
                    </td>
                    <td style={t.td}>
                      {tk.last_used_at
                        ? new Date(tk.last_used_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })
                        : <span style={{ color:'#aab2bd' }}>Never</span>}
                    </td>
                    <td style={t.td}>
                      <div>{new Date(tk.generated_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</div>
                      <div style={{ fontSize:11, color:'#aab2bd' }}>{tk.generated_by_name}</div>
                    </td>
                    <td style={t.td}>
                      {tk.expires_at
                        ? <span style={{ color: expired ? '#b71c1c' : '#546e7a' }}>
                            {new Date(tk.expires_at).toLocaleDateString('en-GB',{ day:'2-digit', month:'short', year:'numeric' })}
                          </span>
                        : <span style={{ color:'#aab2bd' }}>—</span>}
                    </td>
                    <td style={t.td}>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {/* QR / Link */}
                        <button
                          onClick={() => setShowQR(tk)}
                          style={t.btn('#1a2540')}
                          title="Show QR code & link"
                        >📱 QR</button>

                        {/* Share WhatsApp */}
                        <button
                          onClick={() => shareWhatsApp(tk.token, tk.employee_name)}
                          style={t.btn('#25d366')}
                          title="Share via WhatsApp"
                        >💬</button>

                        {/* Share Telegram */}
                        <button
                          onClick={() => shareTelegram(tk.token, tk.employee_name)}
                          style={t.btn('#229ed9')}
                          title="Share via Telegram"
                        >✈️</button>

                        {/* Revoke / Reactivate */}
                        {isActive ? (
                          <button
                            onClick={() => { if (window.confirm(`Revoke token for ${tk.employee_name}?`)) handleRevoke(tk.id) }}
                            disabled={revoking === tk.id}
                            style={t.btn('#b71c1c')}
                            title="Revoke access"
                          >{revoking === tk.id ? '…' : '🚫'}</button>
                        ) : (
                          <button
                            onClick={() => handleReactivate(tk.id)}
                            disabled={revoking === tk.id}
                            style={t.btn('#2e7d32')}
                            title="Reactivate"
                          >{revoking === tk.id ? '…' : '✅'}</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── QR Banner ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={()=>setShowBanner(false)}
        onStart={()=>{ setShowBanner(false); resetGen(); setShowGen(true) }}
        chapterL1="#AAAED0"
        chapterL2="#F0F1FA"
        moduleColor="#454D9B"
        chapterLabel="Administration"
        formTitle={['Generate', 'QR Access', 'Token']}
        steps={['Select Employee & Role', 'Token Generated']}
        icon="🔑"
        description="Create a secure QR token for an employee to access field forms. Choose role, set optional expiry, and share the link via WhatsApp or Telegram."
      />

      {/* ── GENERATE MODAL — 6-layer Admin style ─────────────────────────── */}
      {showGen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16, fontFamily:"'Poppins','Segoe UI',sans-serif" }}>
          {/* L1 frame */}
          <div style={{ background:'#AAAED0', borderRadius:20, padding:20, width:'100%', maxWidth:820, boxShadow:'0 24px 70px rgba(0,0,0,0.40)', position:'relative', border:'4px solid #AAAED0' }}>
            {/* L3 accent */}
            <div style={{ position:'absolute', top:0, right:0, width:220, height:110, background:'#454D9B', borderRadius:'0 20px 0 60px', zIndex:1 }} />
            {/* L2 root */}
            <div style={{ background:'#F0F1FA', borderRadius:14, display:'flex', overflow:'hidden', position:'relative', zIndex:2, minHeight:480 }}>
              {/* Sidebar */}
              <div style={{ width:200, flexShrink:0, padding:'24px 18px 18px', display:'flex', flexDirection:'column', background:'#F0F1FA' }}>
                <div style={{ fontSize:9, fontWeight:800, color:'#53666F', letterSpacing:1.8, textTransform:'uppercase', marginBottom:3 }}>Ratal Advanced Technologies</div>
                <div style={{ fontSize:11, fontWeight:900, color:'#454D9B', letterSpacing:1, textTransform:'uppercase', marginBottom:16 }}><strong>Administration</strong></div>
                <div style={{ fontSize:18, fontWeight:900, color:'#172D37', lineHeight:1.1, marginBottom:6 }}>{genResult?'Token Created':'Generate QR Token'}</div>
                <div style={{ fontSize:11, color:'#53666F', lineHeight:1.5, marginBottom:20 }}>{genResult?'Share the QR code or link with the employee':'Assign field access role, expiry and notes'}</div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {['Token Details','Share & Done'].map((n,i)=>(
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:22, height:22, borderRadius:'50%', background:(i===0&&!genResult)||(i===1&&genResult)?'#454D9B':'#C8C8D8', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'#fff', flexShrink:0 }}>{i+1}</div>
                      <div style={{ fontSize:11, fontWeight:(i===0&&!genResult)||(i===1&&genResult)?800:500, color:(i===0&&!genResult)||(i===1&&genResult)?'#454D9B':'#6b7c93' }}>{n}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* White card */}
              <div style={{ flex:1, background:'#fff', borderRadius:'0 14px 14px 0', display:'flex', flexDirection:'column', overflow:'hidden' }}>
                {/* Gradient banner */}
                <div style={{ background:'linear-gradient(120deg,#2d3580 0%,#454D9B 55%,#6b74c8 100%)', padding:'18px 22px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', right:-30, top:-30, width:110, height:110, borderRadius:'50%', background:'rgba(255,255,255,0.07)' }} />
                  <div style={{ display:'flex', alignItems:'center', gap:12, position:'relative', zIndex:1 }}>
                    <div style={{ width:42, height:42, borderRadius:10, background:'rgba(255,255,255,0.18)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🔑</div>
                    <div>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,0.70)', letterSpacing:1.3, textTransform:'uppercase', marginBottom:2 }}>Step {genResult?2:1} of 2 · Administration</div>
                      <div style={{ fontSize:15, fontWeight:900, color:'#fff' }}>{genResult?'Token Generated — Share Now':'QR Access Token Setup'}</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:7, position:'relative', zIndex:1 }}>
                    {[0,1].map(i=><div key={i} style={{ width:28, height:8, borderRadius:4, background:(i===0&&!genResult)||(i===1&&genResult)?'#fff':'rgba(255,255,255,0.3)' }} />)}
                  </div>
                </div>
                {/* Scrollable form body */}
                <div style={{ flex:1, overflowY:'auto', padding:'20px 22px' }}>

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
                <button
                  onClick={() => { resetGen() }}
                  style={{ ...t.btn('#f0f4f8','#1a2e3d'), width:'100%', marginBottom:8 }}
                >Generate Another</button>
                <button
                  onClick={() => { setShowGen(false); resetGen() }}
                  style={{ ...t.btn('#e8f5e9','#2e7d32'), width:'100%' }}
                >Done ✓</button>
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

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <button
                    onClick={() => { setShowGen(false); resetGen() }}
                    style={t.btn('#f0f4f8','#546e7a')}
                  >Cancel</button>
                  <button
                    onClick={handleGenerate}
                    disabled={genBusy || !genEmp}
                    style={{ ...t.btn('#1a2540'), opacity: genBusy || !genEmp ? 0.5 : 1 }}
                  >{genBusy ? '⏳ Generating…' : '🔑 Generate'}</button>
                </div>
              </div>
                ) /* end return */
              })() /* end IIFE */
            )}
                </div>{/* end form body */}
              </div>{/* end white card */}
            </div>{/* end L2 root */}
          </div>{/* end L1 frame */}
        </div>
      )}

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

    </div>
  )
}
