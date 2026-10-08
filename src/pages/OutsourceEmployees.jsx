import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.HR
/**
 * OutsourceEmployees.jsx
 *
 * DESIGN PRINCIPLE:
 *  - One PERMANENT person record per individual (UUID + QR never change)
 *  - Multiple ENGAGEMENT records (one per hiring period)
 *  - is_active = true when an ACTIVE engagement exists
 *  - Rehiring = new engagement on same person → same QR reactivates
 *  - Device setup: HR generates 6-digit OTP → tells employee → they register on their phone
 */

import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { QRButton } from '../components/QRCard'

// ── Grid layout ──────────────────────────────────────────────────────────────
const GRID = '90px 1fr 110px 130px 110px 120px 52px'

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  inp:    { width:'100%', padding:'9px 11px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box', background:'#fff' },
  label:  { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4, textTransform:'uppercase', letterSpacing:0.5 },
  row:    { display:'flex', gap:12, marginBottom:13, flexWrap:'wrap' },
  col:    { flex:1, minWidth:130 },
  sec:    { fontSize:11, fontWeight:800, color:'#00695c', marginBottom:8, marginTop:4, paddingBottom:4, borderBottom:'1px solid #e0f2f1', letterSpacing:1, textTransform:'uppercase' },
  btn:    (c='#00695c', outline=false) => ({ background:outline?'transparent':c, color:outline?c:'#fff', border:outline?`2px solid ${c}`:'none', borderRadius:8, padding:'8px 18px', fontSize:13, fontWeight:700, cursor:'pointer' }),
  badge:  (bg,cl) => ({ background:bg, color:cl, borderRadius:5, padding:'2px 8px', fontSize:10, fontWeight:800, display:'inline-block' }),
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modal:  { background:'#fff', borderRadius:18, padding:28, width:720, maxWidth:'100%', maxHeight:'93vh', overflowY:'auto', boxShadow:'0 12px 48px rgba(0,0,0,0.22)' },
  tbl:    { width:'100%', borderCollapse:'collapse', fontSize:12 },
  th:     { background:MC, color:'#fff', padding:'8px 10px', fontWeight:700, textAlign:'left', fontSize:11, textTransform:'uppercase', letterSpacing:0.5, borderBottom:'2px solid #e0e7ef' },
  td:     { padding:'9px 10px', borderBottom:'1px solid #f0f4f8', color:'#1a2e3d', verticalAlign:'middle' },
}

const TRADES = [
  'Fiber Splicer','UTP Technician','Power Technician','Civil Worker','Excavation',
  'Compaction','Steel Structuring','Fencing','Concrete','Transportation',
  'Logistics','Turnkey','Tower Erection','Shelter / Power','Survey',
  'Rigger','Welder','Driver','Security Guard','General Labor','Other',
]

const NATIONALITIES = [
  'Saudi Arabian','Indian','Pakistani','Bangladeshi','Egyptian','Filipino',
  'Indonesian','Yemeni','Syrian','Jordanian','Nepali','Sri Lankan',
  'Ethiopian','Moroccan','Turkish','Other',
]

const SAR = v => `SAR ${(+v||0).toLocaleString('en',{minimumFractionDigits:0,maximumFractionDigits:0})}`
const fmtDate = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-GB') : '—'

function genToken() {
  return 'OUT-' + Math.random().toString(36).substring(2,10).toUpperCase()
}
function genCode(count) {
  return `OUT-${String(count + 1).padStart(4,'0')}`
}
function genEngCode(count) {
  return `OE-${String(count + 1).padStart(4,'0')}`
}

// ── OTP Modal ─────────────────────────────────────────────────────────────────
function OTPModal({ otp, expires, onClose }) {
  const [remaining, setRemaining] = useState('')

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, expires - Date.now())
      const m = Math.floor(diff / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setRemaining(`${m}:${String(s).padStart(2,'0')}`)
      if (diff <= 0) onClose()
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [expires, onClose])

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={{ ...S.modal, width:380, textAlign:'center' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:36, marginBottom:8 }}>📱</div>
        <div style={{ fontSize:18, fontWeight:800, color:'#1a2332', marginBottom:4 }}>Device Setup Code</div>
        <div style={{ fontSize:13, color:'#6b7c93', marginBottom:24 }}>
          Read this code to the employee. They will enter it on their phone when they scan their QR.
        </div>
        <div style={{ background:'#e8f5e9', border:'2px dashed #43a047', borderRadius:16, padding:'20px 32px', marginBottom:20 }}>
          <div style={{ fontSize:48, fontWeight:900, color:'#1b5e20', letterSpacing:12, fontFamily:'monospace' }}>{otp}</div>
          <div style={{ fontSize:12, color:'#388e3c', marginTop:8 }}>Expires in {remaining}</div>
        </div>
        <div style={{ fontSize:12, color:'#ff8f00', background:'#fff8e1', borderRadius:8, padding:'8px 12px', marginBottom:20 }}>
          ⚠️ This code disappears when you close this window. Do not close until the employee has registered.
        </div>
        <button style={S.btn('#00695c')} onClick={onClose}>Done — Employee Registered</button>
      </div>
    </div>
  )
}

// ── New / Edit Person Form ────────────────────────────────────────────────────
function PersonForm({ initial, entityId, personCount, onSave, onCancel, saving }) {
  const [f, setF] = useState(initial || {
    full_name_en:'', full_name_ar:'', nationality:'', iqama_number:'',
    iqama_expiry:'', mobile_number:'', emergency_contact:'', trade:'', notes:'',
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <div style={S.sec}>Personal Information</div>
      <div style={S.row}>
        <div style={S.col}><label style={S.label}>Full Name (English) *</label><input style={S.inp} value={f.full_name_en} onChange={set('full_name_en')} /></div>
        <div style={S.col}><label style={S.label}>Full Name (Arabic)</label><input style={S.inp} value={f.full_name_ar} onChange={set('full_name_ar')} dir="rtl" /></div>
      </div>
      <div style={S.row}>
        <div style={S.col}>
          <label style={S.label}>Trade / Skill *</label>
          <select style={S.inp} value={f.trade} onChange={set('trade')}>
            <option value="">— Select —</option>
            {TRADES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div style={S.col}>
          <label style={S.label}>Nationality</label>
          <select style={S.inp} value={f.nationality} onChange={set('nationality')}>
            <option value="">— Select —</option>
            {NATIONALITIES.map(n => <option key={n}>{n}</option>)}
          </select>
        </div>
      </div>
      <div style={S.row}>
        <div style={S.col}><label style={S.label}>Iqama / ID Number</label><input style={S.inp} value={f.iqama_number} onChange={set('iqama_number')} /></div>
        <div style={S.col}><label style={S.label}>Iqama Expiry</label><input style={S.inp} type="date" value={f.iqama_expiry} onChange={set('iqama_expiry')} /></div>
      </div>
      <div style={S.row}>
        <div style={S.col}><label style={S.label}>Mobile Number</label><input style={S.inp} value={f.mobile_number} onChange={set('mobile_number')} /></div>
        <div style={S.col}><label style={S.label}>Emergency Contact</label><input style={S.inp} value={f.emergency_contact} onChange={set('emergency_contact')} /></div>
      </div>
      <div style={S.row}><div style={{ flex:1 }}><label style={S.label}>Notes</label><textarea style={{ ...S.inp, minHeight:60, resize:'vertical' }} value={f.notes} onChange={set('notes')} /></div></div>
      <div style={{ display:'flex', gap:10, marginTop:8 }}>
        <button style={S.btn()} onClick={() => onSave(f)} disabled={saving}>{saving ? 'Saving…' : 'Save Person'}</button>
        <button style={S.btn('#6b7c93', true)} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ── New Engagement Form ───────────────────────────────────────────────────────
function EngagementForm({ entityId, person, projects, departments, engCount, onSave, onCancel, saving }) {
  const [f, setF] = useState({
    project_id:'', department_id:'', start_date:'', end_date:'',
    rate_type:'DAILY', daily_rate:'', package_amount:'', scope:'',
  })
  const set = k => e => setF(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <div style={S.sec}>New Engagement — {person.full_name_en}</div>
      <div style={S.row}>
        <div style={S.col}>
          <label style={S.label}>Department</label>
          <select style={S.inp} value={f.department_id} onChange={set('department_id')}>
            <option value="">— Select —</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div style={S.col}>
          <label style={S.label}>Project</label>
          <select style={S.inp} value={f.project_id} onChange={set('project_id')}>
            <option value="">— Select —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.project_name || p.name}</option>)}
          </select>
        </div>
      </div>
      <div style={S.row}>
        <div style={S.col}><label style={S.label}>Start Date *</label><input style={S.inp} type="date" value={f.start_date} onChange={set('start_date')} /></div>
        <div style={S.col}><label style={S.label}>Expected End Date</label><input style={S.inp} type="date" value={f.end_date} onChange={set('end_date')} /></div>
      </div>
      <div style={S.row}>
        <div style={S.col}>
          <label style={S.label}>Rate Type</label>
          <select style={S.inp} value={f.rate_type} onChange={set('rate_type')}>
            <option value="DAILY">Daily Rate</option>
            <option value="MONTHLY">Monthly Rate</option>
            <option value="PACKAGE">Fixed Package</option>
          </select>
        </div>
        <div style={S.col}>
          {f.rate_type !== 'PACKAGE'
            ? <><label style={S.label}>{f.rate_type === 'DAILY' ? 'Daily Rate (SAR)' : 'Monthly Rate (SAR)'}</label><input style={S.inp} type="number" value={f.daily_rate} onChange={set('daily_rate')} /></>
            : <><label style={S.label}>Package Amount (SAR)</label><input style={S.inp} type="number" value={f.package_amount} onChange={set('package_amount')} /></>
          }
        </div>
      </div>
      <div style={S.row}><div style={{ flex:1 }}><label style={S.label}>Scope of Work</label><textarea style={{ ...S.inp, minHeight:60, resize:'vertical' }} value={f.scope} onChange={set('scope')} /></div></div>
      <div style={{ display:'flex', gap:10, marginTop:8 }}>
        <button style={S.btn()} onClick={() => onSave(f)} disabled={saving || !f.start_date}>{saving ? 'Saving…' : 'Confirm Engagement'}</button>
        <button style={S.btn('#6b7c93', true)} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

// ── Person Detail Modal ───────────────────────────────────────────────────────
function PersonDetail({ person, engagements, projects, departments, entityId, engCount, onClose, onRefresh }) {
  const [tab, setTab] = useState('info') // 'info' | 'engagements' | 'device'
  const [showEngForm, setShowEngForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [otpModal, setOtpModal] = useState(null)

  const activeEng = engagements.find(e => e.status === 'ACTIVE')

  async function setupDevice() {
    const otp = String(Math.floor(100000 + Math.random() * 900000))
    const expires = new Date(Date.now() + 10 * 60 * 1000)
    await supabase.from('outsource_persons').update({
      device_otp: otp,
      device_otp_expires: expires.toISOString(),
    }).eq('id', person.id)
    setOtpModal({ otp, expires: expires.getTime() })
  }

  async function resetDevice() {
    if (!confirm(`Reset device registration for ${person.full_name_en}? They will need to re-register.`)) return
    await supabase.from('outsource_persons').update({
      device_token: null, device_registered_at: null, device_otp: null, device_otp_expires: null,
    }).eq('id', person.id)
    onRefresh()
    alert('Device reset. Generate a new setup code to re-register.')
  }

  async function endEngagement() {
    if (!activeEng) return
    if (!confirm('End active engagement?')) return
    await supabase.from('outsource_engagements').update({
      status: 'COMPLETED', end_date: new Date().toISOString().split('T')[0],
    }).eq('id', activeEng.id)
    await supabase.from('outsource_persons').update({ is_active: false }).eq('id', person.id)
    onRefresh()
  }

  async function saveEngagement(f) {
    setSaving(true)
    const { count } = await supabase.from('outsource_engagements').select('*', { count:'exact', head:true }).eq('entity_id', entityId)
    const { error } = await supabase.from('outsource_engagements').insert({
      entity_id: entityId,
      person_id: person.id,
      engagement_number: genEngCode(count || engCount),
      project_id:     f.project_id || null,
      department_id:  f.department_id || null,
      start_date:     f.start_date,
      end_date:       f.end_date || null,
      rate_type:      f.rate_type,
      daily_rate:     f.daily_rate ? +f.daily_rate : null,
      package_amount: f.package_amount ? +f.package_amount : null,
      scope:          f.scope || null,
      status:         'ACTIVE',
    })
    if (!error) {
      await supabase.from('outsource_persons').update({ is_active: true }).eq('id', person.id)
      setShowEngForm(false)
      onRefresh()
    } else alert(error.message)
    setSaving(false)
  }

  const tabBtn = t => ({
    background: tab===t ? '#00695c' : '#f0f4f8',
    color: tab===t ? '#fff' : '#6b7c93',
    border:'none', borderRadius:8, padding:'7px 16px', fontSize:12, fontWeight:700, cursor:'pointer', marginRight:6
  })

  return (
    <>
      {otpModal && <OTPModal otp={otpModal.otp} expires={otpModal.expires} onClose={() => setOtpModal(null)} />}
      <div style={S.overlay} onClick={onClose}>
        <div style={{ ...S.modal, width:800 }} onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ fontSize:18, fontWeight:900, color:'#1a2332' }}>{person.full_name_en}</div>
                <span style={S.badge(person.is_active ? '#e8f5e9' : '#f5f5f5', person.is_active ? '#2e7d32' : '#9e9e9e')}>
                  {person.is_active ? '● ACTIVE' : '○ INACTIVE'}
                </span>
              </div>
              <div style={{ fontSize:12, color:'#6b7c93', marginTop:4 }}>
                {person.person_code} · {person.trade || '—'} · {person.nationality || '—'}
              </div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {person.qr_token && <QRButton token={person.qr_token} name={person.full_name_en} sub={`${person.trade || 'Outsource'} · ${person.person_code}`} type="employee" />}
              <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#aab2bd' }}>✕</button>
            </div>
          </div>

          {/* Tabs */}
          <div style={{ marginBottom:20 }}>
            <button style={tabBtn('info')} onClick={() => setTab('info')}>Person Info</button>
            <button style={tabBtn('engagements')} onClick={() => setTab('engagements')}>Engagements ({engagements.length})</button>
            <button style={tabBtn('device')} onClick={() => setTab('device')}>Device Setup</button>
          </div>

          {/* Tab: Info */}
          {tab === 'info' && (
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px 24px' }}>
                {[
                  ['Person Code', person.person_code],
                  ['Trade / Skill', person.trade],
                  ['Nationality', person.nationality],
                  ['Iqama Number', person.iqama_number],
                  ['Iqama Expiry', fmtDate(person.iqama_expiry)],
                  ['Mobile', person.mobile_number],
                  ['Emergency Contact', person.emergency_contact],
                  ['Status', person.is_active ? 'Active Engagement' : 'No Active Engagement'],
                  ['Member Since', fmtDate(person.created_at?.split('T')[0])],
                  ['Notes', person.notes],
                ].map(([l,v]) => v ? (
                  <div key={l} style={{ marginBottom:8 }}>
                    <div style={{ fontSize:10, color:'#9e9e9e', fontWeight:700, letterSpacing:0.5 }}>{l}</div>
                    <div style={{ fontSize:13, color:'#1a2332' }}>{v}</div>
                  </div>
                ) : null)}
              </div>

              {/* Active Engagement Summary */}
              {activeEng && (
                <div style={{ marginTop:16, background:'#e8f5e9', borderRadius:12, padding:'14px 16px', border:'1px solid #a5d6a7' }}>
                  <div style={{ fontSize:11, fontWeight:800, color:'#1b5e20', marginBottom:8, letterSpacing:1, textTransform:'uppercase' }}>Current Engagement</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px 16px', fontSize:13 }}>
                    <div><span style={{ color:'#6b7c93', fontSize:11 }}>Number</span><br />{activeEng.engagement_number}</div>
                    <div><span style={{ color:'#6b7c93', fontSize:11 }}>Started</span><br />{fmtDate(activeEng.start_date)}</div>
                    <div><span style={{ color:'#6b7c93', fontSize:11 }}>Rate</span><br />
                      {activeEng.rate_type === 'PACKAGE'
                        ? SAR(activeEng.package_amount) + ' (Package)'
                        : `${SAR(activeEng.daily_rate)}/${activeEng.rate_type === 'DAILY' ? 'day' : 'month'}`}
                    </div>
                  </div>
                  {activeEng.scope && <div style={{ fontSize:12, color:'#2e7d32', marginTop:8 }}>{activeEng.scope}</div>}
                  <button onClick={endEngagement} style={{ ...S.btn('#c62828', true), marginTop:12, fontSize:12, padding:'5px 14px' }}>
                    End Engagement
                  </button>
                </div>
              )}

              {/* Re-hire button */}
              {!person.is_active && !showEngForm && (
                <div style={{ marginTop:16 }}>
                  <button style={S.btn()} onClick={() => setShowEngForm(true)}>
                    ＋ New Engagement (Re-hire)
                  </button>
                </div>
              )}

              {showEngForm && (
                <div style={{ marginTop:16, background:'#f0faf8', borderRadius:12, padding:20 }}>
                  <EngagementForm
                    entityId={entityId} person={person}
                    projects={projects} departments={departments}
                    engCount={engagements.length}
                    onSave={saveEngagement} onCancel={() => setShowEngForm(false)}
                    saving={saving}
                  />
                </div>
              )}
            </div>
          )}

          {/* Tab: Engagements */}
          {tab === 'engagements' && (
            <div>
              {!person.is_active && !showEngForm && (
                <div style={{ marginBottom:14 }}>
                  <button style={S.btn()} onClick={() => setShowEngForm(true)}>＋ New Engagement</button>
                </div>
              )}
              {showEngForm && (
                <div style={{ background:'#f0faf8', borderRadius:12, padding:20, marginBottom:16 }}>
                  <EngagementForm
                    entityId={entityId} person={person}
                    projects={projects} departments={departments}
                    engCount={engagements.length}
                    onSave={saveEngagement} onCancel={() => setShowEngForm(false)}
                    saving={saving}
                  />
                </div>
              )}
              {engagements.length === 0 ? (
                <div style={{ textAlign:'center', color:'#aab2bd', padding:32 }}>No engagements yet</div>
              ) : (
                <table style={S.tbl}>
                  <thead>
                    <tr>
                      {['Eng #','Project','Dept','Start','End','Rate','Scope','Status'].map(h =>
                        <th key={h} style={S.th}>{h}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {engagements.map(e => (
                      <tr key={e.id}>
                        <td style={S.td}><span style={{ fontFamily:'monospace', fontSize:11 }}>{e.engagement_number}</span></td>
                        <td style={S.td}>{e.projects?.project_name || '—'}</td>
                        <td style={S.td}>{e.departments?.name || '—'}</td>
                        <td style={S.td}>{fmtDate(e.start_date)}</td>
                        <td style={S.td}>{e.end_date ? fmtDate(e.end_date) : '—'}</td>
                        <td style={S.td}>
                          {e.rate_type === 'PACKAGE'
                            ? SAR(e.package_amount)
                            : `${SAR(e.daily_rate)}/${e.rate_type === 'DAILY' ? 'd' : 'm'}`}
                        </td>
                        <td style={{ ...S.td, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.scope || '—'}</td>
                        <td style={S.td}>
                          <span style={S.badge(
                            e.status==='ACTIVE' ? '#e8f5e9' : e.status==='COMPLETED' ? '#e3f2fd' : '#ffebee',
                            e.status==='ACTIVE' ? '#2e7d32' : e.status==='COMPLETED' ? '#1565c0' : '#c62828'
                          )}>{e.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Tab: Device */}
          {tab === 'device' && (
            <div>
              <div style={{ background:'#e8f5e9', borderRadius:12, padding:'16px 20px', marginBottom:20, border:'1px solid #a5d6a7' }}>
                <div style={{ fontWeight:800, fontSize:13, color:'#1b5e20', marginBottom:6 }}>📱 Device Binding</div>
                <div style={{ fontSize:12, color:'#388e3c' }}>
                  The employee's phone is bound to their QR code. Only the registered device can access their forms.
                  When they get a new phone or their phone is damaged, HR generates a new setup code here.
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
                <div style={{ background:'#f8f9fa', borderRadius:10, padding:'14px 16px' }}>
                  <div style={{ fontSize:11, color:'#9e9e9e', marginBottom:4 }}>Device Status</div>
                  <div style={{ fontWeight:700, fontSize:13, color: person.device_token ? '#2e7d32' : '#e65100' }}>
                    {person.device_token ? '✓ Registered' : '✗ Not Registered'}
                  </div>
                </div>
                <div style={{ background:'#f8f9fa', borderRadius:10, padding:'14px 16px' }}>
                  <div style={{ fontSize:11, color:'#9e9e9e', marginBottom:4 }}>Last Registered</div>
                  <div style={{ fontWeight:700, fontSize:13 }}>
                    {person.device_registered_at ? new Date(person.device_registered_at).toLocaleDateString('en-GB') : '—'}
                  </div>
                </div>
              </div>

              <div style={{ display:'flex', gap:10 }}>
                <button style={S.btn()} onClick={setupDevice}>
                  📲 {person.device_token ? 'New Device Setup Code' : 'Generate Setup Code'}
                </button>
                {person.device_token && (
                  <button style={S.btn('#c62828', true)} onClick={resetDevice}>
                    Reset Device
                  </button>
                )}
              </div>

              <div style={{ marginTop:20, background:'#fff3e0', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#e65100' }}>
                <strong>How it works:</strong> Click "Generate Setup Code" → A 6-digit code appears (valid 10 minutes).
                Read it to the employee. They scan their QR on their phone → enter the code → their device is registered.
                From that moment, only that specific phone can access their forms. If they get a new phone, generate a new code.
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function OutsourceEmployees({ entityId, entityCode }) {
  const [persons,     setPersons]     = useState([])
  const [engMap,      setEngMap]      = useState({}) // person_id → [engagements]
  const [selected,    setSelected]    = useState(null)
  const [selEngs,     setSelEngs]     = useState([])
  const [showAdd,     setShowAdd]     = useState(false)
  const [search,      setSearch]      = useState('')
  const [filterStatus,setFilter]      = useState('ALL')
  const [projects,    setProjects]    = useState([])
  const [depts,       setDepts]       = useState([])
  const [saving,      setSaving]      = useState(false)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => { if (entityId) { load(); loadRefData() } }, [entityId])

  async function load() {
    setLoading(true)
    const { data: persons } = await supabase
      .from('outsource_persons')
      .select('*')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })

    const { data: engs } = await supabase
      .from('outsource_engagements')
      .select('*, projects(project_name), departments(name)')
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })

    const map = {}
    ;(engs || []).forEach(e => {
      if (!map[e.person_id]) map[e.person_id] = []
      map[e.person_id].push(e)
    })

    setPersons(persons || [])
    setEngMap(map)
    setLoading(false)
  }

  async function loadRefData() {
    const [{ data: prj }, { data: dep }] = await Promise.all([
      supabase.from('projects').select('id,project_name').eq('entity_id', entityId).order('project_name'),
      supabase.from('departments').select('id,name').eq('entity_id', entityId).order('name'),
    ])
    setProjects(prj || [])
    setDepts(dep || [])
  }

  async function savePerson(f) {
    if (!f.full_name_en.trim()) return alert('Full name is required')
    if (!f.trade) return alert('Trade / skill is required')
    setSaving(true)
    const { count } = await supabase.from('outsource_persons').select('*', { count:'exact', head:true }).eq('entity_id', entityId)
    const { error } = await supabase.from('outsource_persons').insert({
      entity_id:         entityId,
      person_code:       genCode(count || 0),
      full_name_en:      f.full_name_en.trim(),
      full_name_ar:      f.full_name_ar || null,
      nationality:       f.nationality || null,
      iqama_number:      f.iqama_number || null,
      iqama_expiry:      f.iqama_expiry || null,
      mobile_number:     f.mobile_number || null,
      emergency_contact: f.emergency_contact || null,
      trade:             f.trade,
      notes:             f.notes || null,
      qr_token:          genToken(),
      is_active:         false,
    })
    if (!error) { setShowAdd(false); load() }
    else alert(error.message)
    setSaving(false)
  }

  function openPerson(person) {
    setSelected(person)
    setSelEngs(engMap[person.id] || [])
  }

  const filtered = useMemo(() => {
    return persons.filter(p => {
      const q = search.toLowerCase()
      const matchSearch = !q || p.full_name_en?.toLowerCase().includes(q) || p.person_code?.toLowerCase().includes(q) || p.trade?.toLowerCase().includes(q) || p.mobile_number?.includes(q)
      const matchStatus = filterStatus === 'ALL' || (filterStatus === 'ACTIVE' && p.is_active) || (filterStatus === 'INACTIVE' && !p.is_active)
      return matchSearch && matchStatus
    })
  }, [persons, search, filterStatus])

  const totalActive   = persons.filter(p => p.is_active).length
  const totalInactive = persons.filter(p => !p.is_active).length
  const totalEngaged  = Object.values(engMap).reduce((sum, arr) => sum + arr.filter(e => e.status === 'ACTIVE').length, 0)

  const statCard = (label, value, color='#1a2332') => (
    <div style={{ background:'#fff', borderRadius:10, padding:'12px 18px', boxShadow:'0 1px 6px rgba(0,0,0,0.06)', minWidth:120 }}>
      <div style={{ fontSize:22, fontWeight:900, color }}>{value}</div>
      <div style={{ fontSize:11, color:'#6b7c93', fontWeight:600, marginTop:2 }}>{label}</div>
    </div>
  )

  return (
    <div>
      {/* ── Sticky header block ── */}
      <div style={{ position:'sticky', top:0, zIndex:10, background:'#f0f4f8', paddingTop:16 }}>

        {/* Toolbar */}
        <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:14, flexWrap:'wrap' }}>
          <input
            style={{ ...S.inp, maxWidth:280, padding:'8px 12px' }}
            placeholder="Search name, code, trade…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
          {['ALL','ACTIVE','INACTIVE'].map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              background: filterStatus===s ? '#00695c' : '#fff',
              color: filterStatus===s ? '#fff' : '#6b7c93',
              border: filterStatus===s ? 'none' : '1px solid #dde3ec',
              borderRadius:7, padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer',
            }}>{s}</button>
          ))}
          <div style={{ marginLeft:'auto' }}>
            <button style={S.btn()} onClick={() => setShowAdd(true)}>＋ Add Person</button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
          {statCard('Total Outsource', persons.length)}
          {statCard('Active Now', totalActive, '#2e7d32')}
          {statCard('Inactive', totalInactive, '#9e9e9e')}
          {statCard('Open Engagements', totalEngaged, '#00695c')}
        </div>

        {/* Column headers */}
        <div style={{ display:'grid', gridTemplateColumns:GRID, gap:'0 12px', background:'#fff', borderTop:'2px solid #e8edf2', borderBottom:'1px solid #e8edf2', padding:'8px 14px', fontSize:11, fontWeight:800, color:'#6b7c93', textTransform:'uppercase', letterSpacing:0.5 }}>
          <div style={{ textAlign:'left' }}>CODE</div>
          <div style={{ textAlign:'left' }}>FULL NAME</div>
          <div style={{ textAlign:'left' }}>NATIONALITY</div>
          <div style={{ textAlign:'left' }}>TRADE</div>
          <div style={{ textAlign:'left' }}>STATUS</div>
          <div style={{ textAlign:'left' }}>ENGAGEMENT</div>
          <div style={{ textAlign:'left' }}>QR</div>
        </div>
      </div>

      {/* ── List ── */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'#aab2bd' }}>
          {persons.length === 0 ? 'No outsource persons yet — click Add Person to start' : 'No results'}
        </div>
      ) : (
        filtered.map(p => {
          const pEngs = engMap[p.id] || []
          const active = pEngs.find(e => e.status === 'ACTIVE')
          return (
            <div
              key={p.id}
              onClick={() => openPerson(p)}
              style={{ display:'grid', gridTemplateColumns:GRID, gap:'0 12px', padding:'10px 14px', borderBottom:'1px solid #f0f4f8', alignItems:'center', cursor:'pointer', transition:'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background='#f8fafd'}
              onMouseLeave={e => e.currentTarget.style.background='transparent'}
            >
              <div style={{ textAlign:'left', fontFamily:'monospace', fontSize:11, color:'#6b7c93' }}>{p.person_code}</div>
              <div style={{ textAlign:'left' }}>
                <div style={{ fontWeight:700, fontSize:13, color:'#1a2332' }}>{p.full_name_en}</div>
                {p.full_name_ar && <div style={{ fontSize:11, color:'#6b7c93', direction:'rtl' }}>{p.full_name_ar}</div>}
              </div>
              <div style={{ textAlign:'left', fontSize:12, color:'#6b7c93' }}>{p.nationality || '—'}</div>
              <div style={{ textAlign:'left', fontSize:12 }}>{p.trade || '—'}</div>
              <div style={{ textAlign:'left' }}>
                <span style={S.badge(p.is_active ? '#e8f5e9' : '#f5f5f5', p.is_active ? '#2e7d32' : '#9e9e9e')}>
                  {p.is_active ? '● ACTIVE' : '○ INACTIVE'}
                </span>
              </div>
              <div style={{ textAlign:'left', fontSize:11 }}>
                {active ? (
                  <span style={{ color:'#00695c' }}>
                    {active.engagement_number} · since {fmtDate(active.start_date)}
                  </span>
                ) : (
                  <span style={{ color:'#aab2bd' }}>{pEngs.length > 0 ? `${pEngs.length} past` : 'None'}</span>
                )}
              </div>
              <div style={{ textAlign:'left' }} onClick={e => e.stopPropagation()}>
                {p.qr_token && (
                  <QRButton token={p.qr_token} name={p.full_name_en} sub={`${p.trade||'Outsource'} · ${p.person_code}`} type="employee" size="sm" />
                )}
              </div>
            </div>
          )
        })
      )}

      {/* ── Add Person Modal ── */}
      {showAdd && (
        <div style={S.overlay} onClick={() => setShowAdd(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div style={{ fontSize:17, fontWeight:800, color:'#1a2332' }}>Add Outsource Person</div>
              <button onClick={() => setShowAdd(false)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#aab2bd' }}>✕</button>
            </div>
            <div style={{ background:'#e8f5e9', borderRadius:10, padding:'10px 14px', marginBottom:20, fontSize:12, color:'#2e7d32' }}>
              This creates a <strong>permanent record</strong> for this person. Their QR code will never change.
              You will add their first engagement in the next step.
            </div>
            <PersonForm
              entityId={entityId} personCount={persons.length}
              onSave={savePerson} onCancel={() => setShowAdd(false)} saving={saving}
            />
          </div>
        </div>
      )}

      {/* ── Person Detail Modal ── */}
      {selected && (
        <PersonDetail
          person={selected}
          engagements={selEngs}
          projects={projects}
          departments={depts}
          entityId={entityId}
          engCount={Object.values(engMap).flat().length}
          onClose={() => setSelected(null)}
          onRefresh={() => { load(); setSelected(null) }}
        />
      )}
    </div>
  )
}
