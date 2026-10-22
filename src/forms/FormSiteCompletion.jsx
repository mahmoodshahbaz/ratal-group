/**
 * FormSiteCompletion.jsx — Field Site Status / Milestone Update
 * Route: /forms/site-completion
 * Auth:  useFieldAuth (QR token or ?dev=1 bypass)
 *
 * Design: 3-step mobile wizard — orange/amber construction theme
 * Step 1: Site Selection
 * Step 2: Milestone Checklist
 * Step 3: Photo + Notes + Submit
 */

import { useState, useEffect, useRef } from 'react'
import { useFieldAuth }                from '../lib/useFieldAuth'
import { supabase }                    from '../lib/supabase'
import { uploadToDrive }               from '../hooks/useDriveUpload'

// ── Milestone sets per scope ──────────────────────────────────────────────────
const MILESTONE_SETS = {
  TOWER_INSTALLATION: [
    'Site Survey Complete','Civil Foundation Done','Tower Erected','Grounding Complete',
    'Cable Tray Installed','Equipment Mounted','Power Connected','Antenna Installed',
    'Cabling Complete','Testing & Commissioning','Snag List Cleared','Handover',
  ],
  ACTIVE_INSTALLATION: [
    'Site Survey Done','Equipment Delivered','Rack Installation','Power & Battery Setup',
    'BTS/NodeB Installed','Cabling & Patching','RF Connections','Transmission Links',
    'Software Commissioning','Drive Test','Acceptance Test','Handover',
  ],
  CIVIL: [
    'Survey & Layout','Excavation','Foundation Poured','Curing Complete',
    'Backfill & Compaction','Fencing / Boundary Wall','Gate & Access','Final Inspection',
  ],
  FIBRE: [
    'Route Survey','Duct Laying','Manhole Construction','Cable Pulling',
    'Splicing & Termination','OTDR Testing','Documentation Complete','Handover',
  ],
  DOCUMENTATION: [
    'As-Built Drawings','Equipment List','Test Results','Customer Approval',
    'Contractor Sign-off','Portal Upload','Final Submission',
  ],
  TESTING: [
    'Pre-Test Checklist','RF Testing','Transmission Testing','Power Measurement',
    'Alarm Checks','KPI Validation','Drive Test','Acceptance Sign-off',
  ],
  GENERAL: [
    'Mobilisation','Survey','Material Delivery','Installation Started',
    '50% Progress','Installation Complete','Testing','Handover',
  ],
}

const MOCK_ASSIGNMENTS = [
  { id:'a1', site_number:'TW-0042', site_name:'Al Nakheel Tower', scope_type:'TOWER_INSTALLATION', project:{ project_name:'CISU-HQ' } },
  { id:'a2', site_number:'FB-0017', site_name:'Ring Road Fibre', scope_type:'FIBRE', project:{ project_name:'NISU-Site A' } },
]

const SCOPE_ICON = {
  TOWER_INSTALLATION:'📡', ACTIVE_INSTALLATION:'📶', CIVIL:'🏗️',
  FIBRE:'🔌', DOCUMENTATION:'📋', TESTING:'🔬', GENERAL:'🏕️',
}
const SCOPE_COLOR = {
  TOWER_INSTALLATION:'#f97316', ACTIVE_INSTALLATION:'#3b82f6', CIVIL:'#eab308',
  FIBRE:'#a855f7', DOCUMENTATION:'#06b6d4', TESTING:'#10b981', GENERAL:'#64748b',
}

// ── Theme ─────────────────────────────────────────────────────────────────────
const TH = {
  orange:'#f97316', orangeDark:'#c2410c', orangeLight:'#fff7ed',
  orangeMid:'#fed7aa', bg:'#f8fafc', white:'#ffffff',
  text:'#1e293b', muted:'#64748b', border:'#e2e8f0',
  shadow:'0 4px 20px rgba(0,0,0,0.08)',
}

const FF = '"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'

// ── Shared pill progress ──────────────────────────────────────────────────────
function Pills({ step, total }) {
  return (
    <div style={{ display:'flex', gap:6, justifyContent:'center', marginTop:10 }}>
      {Array.from({length:total},(_,i)=>(
        <div key={i} style={{
          width: i===step-1 ? 20 : 6, height:6, borderRadius:3,
          background: i < step ? TH.orange : (i===step-1 ? TH.orange : TH.border),
          transition:'all 0.3s',
        }}/>
      ))}
    </div>
  )
}

// ── Auth guard ────────────────────────────────────────────────────────────────
function AuthGuard({ error }) {
  const msgs = {
    no_token:          { icon:'🔒', title:'Authentication Required', body:'Scan your QR code to access this form.' },
    invalid_token:     { icon:'❌', title:'Invalid QR Code',          body:'This code was not recognised. Contact your DH.' },
    token_inactive:    { icon:'⛔', title:'QR Code Expired',          body:'Ask your Department Head for a fresh code.' },
    employee_inactive: { icon:'🚫', title:'Account Inactive',         body:'Contact HR to reactivate your account.' },
  }
  const m = msgs[error] || msgs.no_token
  return (
    <div style={{ minHeight:'100dvh', background:TH.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:FF, padding:24 }}>
      <div style={{ background:TH.white, borderRadius:20, padding:'40px 28px', maxWidth:340, width:'100%', textAlign:'center', boxShadow:TH.shadow }}>
        <div style={{ fontSize:52, marginBottom:14 }}>{m.icon}</div>
        <div style={{ fontSize:18, fontWeight:800, color:'#ef4444', marginBottom:8 }}>{m.title}</div>
        <div style={{ fontSize:14, color:TH.muted, lineHeight:1.6 }}>{m.body}</div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function FormSiteCompletion() {
  const auth = useFieldAuth()

  const [step,        setStep]        = useState(1) // 1=site, 2=milestones, 3=photo+notes
  const [assignment,  setAssignment]  = useState(null)
  const [prevDone,    setPrevDone]    = useState({})
  const [checked,     setChecked]     = useState({})
  const [photo,       setPhoto]       = useState(null)
  const [photoFile,   setPhotoFile]   = useState(null)
  const [notes,       setNotes]       = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [submitted,   setSubmitted]   = useState(false)
  const [loadingPrev, setLoadingPrev] = useState(false)
  const [error,       setError]       = useState('')
  const fileRef = useRef()

  const isPreview = new URLSearchParams(window.location.search).get('preview') === '1'
    || new URLSearchParams(window.location.search).get('dev') === '1'

  useEffect(() => {
    if (isPreview) return
    if (!auth.loading && auth.assignments?.length === 1) {
      setAssignment(auth.assignments[0])
      setStep(2)
    }
  }, [auth.loading, auth.assignments])

  useEffect(() => {
    if (!assignment?.id || isPreview) return
    setLoadingPrev(true)
    supabase.from('site_assignments').select('completed_milestones').eq('id', assignment.id).maybeSingle()
      .then(({ data }) => {
        if (data?.completed_milestones?.length) {
          const map = {}
          data.completed_milestones.forEach(n => { map[n] = true })
          setPrevDone(map); setChecked(map)
        }
        setLoadingPrev(false)
      })
  }, [assignment])

  // ── Loading ──────────────────────────────────────────────────────────────
  if (auth.loading && !isPreview) return (
    <div style={{ minHeight:'100dvh', background:TH.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:FF }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:44, height:44, border:`3px solid ${TH.border}`, borderTop:`3px solid ${TH.orange}`,
          borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 14px' }}/>
        <div style={{ color:TH.muted, fontSize:13, letterSpacing:0.5 }}>Verifying…</div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (auth.error && !isPreview) return <AuthGuard error={auth.error} />

  const assignments = isPreview ? MOCK_ASSIGNMENTS : (auth.assignments || [])

  // ── Computed values ───────────────────────────────────────────────────────
  const scopeType    = assignment?.scope_type || 'GENERAL'
  const scopeColor   = SCOPE_COLOR[scopeType] || TH.orange
  const scopeIcon    = SCOPE_ICON[scopeType] || '🏕️'
  const milestones   = MILESTONE_SETS[scopeType] || MILESTONE_SETS.GENERAL
  const checkedCount = milestones.filter(m => checked[m]).length
  const totalCount   = milestones.length
  const pct          = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0
  const newlyChecked = milestones.filter(m => checked[m] && !prevDone[m])

  const toggle = (name) => {
    if (prevDone[name]) return
    setChecked(prev => ({ ...prev, [name]: !prev[name] }))
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submit() {
    setError('')
    if (newlyChecked.length === 0) { setError('Tick at least one new milestone.'); return }
    if (!photo)                    { setError('A site photo is required.'); return }
    if (isPreview) { alert(`Preview: would submit ${newlyChecked.length} milestone(s) at ${pct}%.`); return }
    setSubmitting(true)
    try {
      let photoUrl = null
      if (photoFile) {
        const result = await uploadToDrive(photoFile, 'sites')
        if (result) photoUrl = result.viewUrl
      }
      const today = new Date().toISOString().split('T')[0]
      const now   = new Date().toISOString()
      const allMilestones = milestones.map(name => ({
        name, done: !!checked[name],
        date: checked[name] ? (prevDone[name] ? 'previous' : today) : null,
        photo_url: newlyChecked.includes(name) ? photoUrl : null,
        notes: newlyChecked.includes(name) ? (notes || null) : null,
      }))
      const { error: logErr } = await supabase.from('site_status_logs').insert({
        entity_id: auth.entityId, assignment_id: assignment.id,
        employee_id: auth.employee.id, scope_type: scopeType,
        milestones_newly_done: newlyChecked, all_milestones: allMilestones,
        completion_pct: pct, photo_url: photoUrl,
        notes: notes || null, submitted_at: now,
      })
      if (logErr) throw logErr
      await supabase.from('site_assignments').update({
        completion_pct: pct,
        completed_milestones: milestones.filter(m => checked[m]),
        last_status_at: now,
      }).eq('id', assignment.id)
      setSubmitted(true)
    } catch (err) { setError(err.message || 'Submission failed. Try again.') }
    setSubmitting(false)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HEADER component (shared across steps)
  // ─────────────────────────────────────────────────────────────────────────
  const Header = ({ title, subtitle, showBack=false, onBack }) => (
    <div style={{
      background:`linear-gradient(135deg,${TH.orangeDark},${TH.orange})`,
      padding:'20px 20px 16px', borderRadius:'0 0 24px 24px',
      boxShadow:`0 8px 24px ${TH.orange}40`, flexShrink:0,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:4 }}>
        {showBack && (
          <button onClick={onBack} style={{
            background:'rgba(255,255,255,0.2)', border:'none', borderRadius:10,
            width:34, height:34, cursor:'pointer', color:'#fff', fontSize:18,
            display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
          }}>‹</button>
        )}
        <div style={{
          width:42, height:42, background:'rgba(255,255,255,0.2)', borderRadius:12,
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0,
        }}>🏗️</div>
        <div>
          <div style={{ fontSize:18, fontWeight:800, color:'#fff', letterSpacing:'-0.3px' }}>{title}</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.75)', marginTop:1 }}>{subtitle}</div>
        </div>
      </div>
      <Pills step={step} total={3} />
    </div>
  )

  // ── SUCCESS SCREEN ────────────────────────────────────────────────────────
  if (submitted) return (
    <div style={{ minHeight:'100dvh', background:TH.bg, fontFamily:FF, display:'flex', flexDirection:'column', maxWidth:480, margin:'0 auto' }}>
      {/* Hero */}
      <div style={{
        background:`linear-gradient(135deg,${TH.orangeDark},${TH.orange})`,
        padding:'40px 24px 28px', textAlign:'center',
        boxShadow:`0 8px 32px ${TH.orange}50`,
      }}>
        <div style={{ width:72, height:72, background:'rgba(255,255,255,0.2)', borderRadius:20,
          display:'flex', alignItems:'center', justifyContent:'center', fontSize:38,
          margin:'0 auto 16px' }}>✅</div>
        <div style={{ fontSize:24, fontWeight:900, color:'#fff' }}>Site Updated!</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.8)', marginTop:6 }}>
          {pct}% complete · {checkedCount}/{totalCount} milestones done
        </div>
      </div>

      <div style={{ padding:'16px 16px 24px', flex:1, overflowY:'auto' }}>
        {/* Site card */}
        <div style={{ background:TH.white, borderRadius:16, boxShadow:TH.shadow, overflow:'hidden', marginBottom:12 }}>
          <div style={{ background:TH.orangeLight, padding:'12px 18px', borderBottom:`2px solid ${TH.orange}22` }}>
            <div style={{ fontSize:12, fontWeight:700, color:TH.orange, letterSpacing:1, textTransform:'uppercase' }}>Site Summary</div>
          </div>
          <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:10 }}>
            {[
              { icon:scopeIcon, label:'Site',    val:`${assignment.site_number}${assignment.site_name ? ' · '+assignment.site_name : ''}` },
              { icon:'📊',      label:'Progress', val:`${pct}% · ${checkedCount} of ${totalCount}`, bold:true },
              { icon:'📅',      label:'Date',     val:new Date().toLocaleDateString('en-SA',{day:'numeric',month:'short',year:'numeric'}) },
            ].map(r=>(
              <div key={r.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, color:TH.muted, fontSize:13 }}>
                  <span>{r.icon}</span><span>{r.label}</span>
                </div>
                <div style={{ fontSize:r.bold?15:13, fontWeight:r.bold?800:600, color:r.bold?TH.orange:TH.text }}>{r.val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Newly completed */}
        <div style={{ background:TH.white, borderRadius:16, boxShadow:TH.shadow, overflow:'hidden', marginBottom:16 }}>
          <div style={{ background:`#f0fdf4`, padding:'12px 18px', borderBottom:'2px solid #bbf7d0' }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#16a34a', letterSpacing:1, textTransform:'uppercase' }}>
              ✓ {newlyChecked.length} Newly Completed
            </div>
          </div>
          <div style={{ padding:'12px 18px', display:'flex', flexDirection:'column', gap:8 }}>
            {newlyChecked.map(m=>(
              <div key={m} style={{ display:'flex', alignItems:'center', gap:10, fontSize:14, color:TH.text }}>
                <div style={{ width:22, height:22, borderRadius:6, background:'#16a34a',
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <svg width="11" height="9" viewBox="0 0 11 9"><path d="M1 4.5L3.8 7.5L10 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>
                </div>
                {m}
              </div>
            ))}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ background:TH.white, borderRadius:16, boxShadow:TH.shadow, padding:'16px 18px', marginBottom:16 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
            <span style={{ fontSize:13, color:TH.muted }}>Overall progress</span>
            <span style={{ fontSize:14, fontWeight:800, color:pct===100?'#16a34a':TH.orange }}>{pct}%</span>
          </div>
          <div style={{ height:10, borderRadius:6, background:TH.border, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${pct}%`, borderRadius:6,
              background: pct===100 ? 'linear-gradient(90deg,#16a34a,#22c55e)' : `linear-gradient(90deg,${TH.orangeDark},${TH.orange})`,
              transition:'width 0.6s ease' }}/>
          </div>
        </div>

        <button onClick={() => {
          setSubmitted(false); setNotes(''); setPhoto(null); setPhotoFile(null); setStep(2)
          setPrevDone(prev => ({ ...prev, ...Object.fromEntries(newlyChecked.map(m=>[m,true])) }))
        }} style={{
          width:'100%', padding:18, background:`linear-gradient(135deg,${TH.orangeDark},${TH.orange})`,
          color:'#fff', border:'none', borderRadius:14, fontSize:16, fontWeight:800,
          cursor:'pointer', boxShadow:`0 6px 20px ${TH.orange}40`,
        }}>
          + Submit Another Update
        </button>
      </div>
    </div>
  )

  // ── STEP 1: Site Picker ───────────────────────────────────────────────────
  if (step === 1 || !assignment) {
    if (!assignments.length) return (
      <div style={{ minHeight:'100dvh', background:TH.bg, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:FF, padding:24 }}>
        <div style={{ background:TH.white, borderRadius:20, padding:'40px 28px', maxWidth:340, width:'100%', textAlign:'center', boxShadow:TH.shadow }}>
          <div style={{ fontSize:52, marginBottom:14 }}>📍</div>
          <div style={{ fontSize:18, fontWeight:800, color:'#ef4444', marginBottom:8 }}>No Site Assigned</div>
          <div style={{ fontSize:14, color:TH.muted, lineHeight:1.6 }}>Contact your PM to get assigned to a site.</div>
        </div>
      </div>
    )

    return (
      <div style={{ minHeight:'100dvh', background:TH.bg, fontFamily:FF, display:'flex', flexDirection:'column', maxWidth:480, margin:'0 auto' }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <Header title="Site Completion" subtitle="RATAL GROUP · ACCSYS" />

        <div style={{ padding:'20px 16px 4px' }}>
          <div style={{ fontSize:18, fontWeight:800, color:TH.text }}>Select Your Site</div>
          <div style={{ fontSize:13, color:TH.muted, marginTop:4 }}>Which site are you updating today?</div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'12px 16px 32px' }}>
          {assignments.map((a) => {
            const sc = SCOPE_COLOR[a.scope_type] || TH.orange
            const si = SCOPE_ICON[a.scope_type] || '🏕️'
            return (
              <div key={a.id} onClick={() => { setAssignment(a); setStep(2) }} style={{
                background:TH.white, border:`2px solid ${TH.border}`,
                borderRadius:16, padding:'16px 18px', marginBottom:10,
                cursor:'pointer', display:'flex', alignItems:'center', gap:14,
                boxShadow:TH.shadow, transition:'all 0.18s',
              }}
              onMouseEnter={e=>{ e.currentTarget.style.borderColor=sc; e.currentTarget.style.boxShadow=`0 4px 20px ${sc}30` }}
              onMouseLeave={e=>{ e.currentTarget.style.borderColor=TH.border; e.currentTarget.style.boxShadow=TH.shadow }}
              >
                <div style={{ width:48, height:48, borderRadius:14, background:`${sc}18`,
                  border:`2px solid ${sc}40`, display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:24, flexShrink:0 }}>{si}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:800, fontSize:16, color:TH.text }}>{a.site_number}</div>
                  {a.site_name && <div style={{ fontSize:12, color:TH.muted, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.site_name}</div>}
                  {a.project && <div style={{ fontSize:11, color:sc, marginTop:4, fontWeight:700 }}>{a.project.project_name}</div>}
                </div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
                  <span style={{ fontSize:10, fontWeight:800, letterSpacing:0.5, padding:'4px 10px', borderRadius:20,
                    background:`${sc}15`, color:sc, border:`1px solid ${sc}40` }}>
                    {(a.scope_type||'GENERAL').replace(/_/g,' ')}
                  </span>
                  <span style={{ color:sc, fontSize:20, fontWeight:300 }}>›</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── STEP 2: Milestone Checklist ───────────────────────────────────────────
  if (step === 2) return (
    <div style={{ minHeight:'100dvh', background:TH.bg, fontFamily:FF, display:'flex', flexDirection:'column', maxWidth:480, margin:'0 auto' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes checkPop{0%{transform:scale(0)}70%{transform:scale(1.2)}100%{transform:scale(1)}}`}</style>

      <Header
        title={assignment.site_number}
        subtitle={`${scopeType.replace(/_/g,' ')} · tap milestones to mark done`}
        showBack={assignments.length > 1}
        onBack={() => { setStep(1); setAssignment(null); setChecked({}); setPrevDone({}) }}
      />

      {/* Progress strip */}
      <div style={{ background:TH.white, padding:'12px 20px', borderBottom:`1px solid ${TH.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
          <span style={{ fontSize:12, color:TH.muted, fontWeight:600 }}>Overall Progress</span>
          <span style={{ fontSize:13, fontWeight:800, color: pct===100?'#16a34a':TH.orange }}>{pct}% · {checkedCount}/{totalCount}</span>
        </div>
        <div style={{ height:8, borderRadius:5, background:TH.border, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${pct}%`, borderRadius:5, transition:'width 0.4s ease',
            background: pct===100 ? 'linear-gradient(90deg,#16a34a,#22c55e)' : `linear-gradient(90deg,${TH.orangeDark},${TH.orange})` }}/>
        </div>
        {newlyChecked.length > 0 && (
          <div style={{ fontSize:11, color:TH.orange, fontWeight:700, marginTop:6 }}>
            ✓ {newlyChecked.length} newly ticked this session
          </div>
        )}
      </div>

      {/* Milestone list */}
      <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch', padding:'12px 16px 8px' }}>
        {loadingPrev ? (
          <div style={{ textAlign:'center', padding:40 }}>
            <div style={{ width:36, height:36, border:`3px solid ${TH.border}`, borderTop:`3px solid ${TH.orange}`,
              borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }}/>
            <div style={{ color:TH.muted, fontSize:12 }}>Loading your progress…</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize:11, fontWeight:700, color:TH.muted, letterSpacing:1, marginBottom:10, textTransform:'uppercase' }}>
              Milestones — tap to mark complete
            </div>
            {milestones.map((name, i) => {
              const done   = !!checked[name]
              const locked = !!prevDone[name]
              const isNew  = done && !locked
              return (
                <div key={name} onClick={() => toggle(name)} style={{
                  display:'flex', alignItems:'center', gap:12,
                  background: done ? '#f0fdf4' : TH.white,
                  border: `2px solid ${done ? (isNew ? '#16a34a' : '#86efac') : TH.border}`,
                  borderRadius:14, padding:'13px 14px', marginBottom:8,
                  cursor: locked ? 'default' : 'pointer',
                  boxShadow: isNew ? '0 4px 16px rgba(22,163,74,0.15)' : TH.shadow,
                  transition:'all 0.18s',
                }}>
                  {/* Checkbox */}
                  <div style={{
                    width:30, height:30, borderRadius:9, flexShrink:0,
                    background: done ? '#16a34a' : TH.bg,
                    border: done ? 'none' : `2px solid ${TH.border}`,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    transition:'all 0.2s',
                  }}>
                    {done
                      ? <svg width="13" height="10" viewBox="0 0 13 10" fill="none" style={{ animation:'checkPop 0.25s ease' }}>
                          <path d="M1 5L4.5 8.5L12 1" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      : <span style={{ fontSize:10, fontWeight:700, color:TH.muted }}>{i+1}</span>
                    }
                  </div>
                  {/* Label */}
                  <span style={{ flex:1, fontSize:14, fontWeight: done ? 700 : 500, color: done ? '#15803d' : TH.text, transition:'all 0.18s' }}>
                    {name}
                  </span>
                  {locked && (
                    <span style={{ fontSize:10, color:'#16a34a', fontWeight:800, letterSpacing:0.5,
                      background:'#dcfce7', padding:'3px 8px', borderRadius:10, border:'1px solid #86efac', flexShrink:0 }}>
                      DONE
                    </span>
                  )}
                </div>
              )
            })}
            <div style={{ height:16 }}/>
          </>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{ padding:'12px 16px', background:TH.white, borderTop:`1px solid ${TH.border}`, flexShrink:0 }}>
        <button
          onClick={() => { if(newlyChecked.length===0){ setError('Tick at least one new milestone first.'); return } setError(''); setStep(3) }}
          style={{
            width:'100%', padding:16, borderRadius:14, border:'none',
            background: newlyChecked.length > 0 ? `linear-gradient(135deg,${TH.orangeDark},${TH.orange})` : '#e2e8f0',
            color: newlyChecked.length > 0 ? '#fff' : '#94a3b8',
            fontSize:15, fontWeight:800, cursor: newlyChecked.length > 0 ? 'pointer' : 'not-allowed',
            boxShadow: newlyChecked.length > 0 ? `0 6px 20px ${TH.orange}40` : 'none',
            transition:'all 0.2s',
          }}>
          {newlyChecked.length > 0
            ? `Next → Add Photo & Submit (${newlyChecked.length} milestone${newlyChecked.length>1?'s':''})`
            : 'Tick at least one milestone to continue'
          }
        </button>
        {error && <div style={{ color:'#ef4444', fontSize:12, fontWeight:600, marginTop:8, textAlign:'center' }}>⚠️ {error}</div>}
      </div>
    </div>
  )

  // ── STEP 3: Photo + Notes + Submit ────────────────────────────────────────
  return (
    <div style={{ minHeight:'100dvh', background:TH.bg, fontFamily:FF, display:'flex', flexDirection:'column', maxWidth:480, margin:'0 auto' }}>
      <Header
        title="Photo & Notes"
        subtitle={`${newlyChecked.length} milestone${newlyChecked.length>1?'s':''} ready · ${assignment.site_number}`}
        showBack
        onBack={() => { setStep(2); setError('') }}
      />

      <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch', padding:'16px 16px 8px' }}>

        {/* Newly ticked summary */}
        <div style={{ background:'#f0fdf4', border:'2px solid #86efac', borderRadius:14, padding:'12px 16px', marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#16a34a', letterSpacing:0.8, marginBottom:8, textTransform:'uppercase' }}>
            ✓ Milestones to submit
          </div>
          {newlyChecked.map(m => (
            <div key={m} style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'#15803d', marginBottom:5 }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'#16a34a', flexShrink:0 }}/>
              {m}
            </div>
          ))}
        </div>

        {/* Photo upload */}
        <div style={{ background:TH.white, borderRadius:16, boxShadow:TH.shadow, overflow:'hidden', marginBottom:14 }}>
          <div style={{ padding:'12px 18px', borderBottom:`1px solid ${TH.border}` }}>
            <div style={{ fontSize:13, fontWeight:700, color:TH.text }}>📷 Site Photo <span style={{ color:'#ef4444', fontSize:12 }}>*</span></div>
            <div style={{ fontSize:12, color:TH.muted, marginTop:2 }}>Required for every update · max 10 MB</div>
          </div>
          <div style={{ padding:14 }}>
            <div onClick={() => fileRef.current?.click()} style={{
              border: `2px dashed ${photo ? '#16a34a' : TH.orange}`,
              borderRadius:14, padding: photo ? 8 : 32, textAlign:'center',
              cursor:'pointer', background: photo ? '#f0fdf4' : TH.orangeLight,
              transition:'all 0.2s',
            }}>
              {photo
                ? <img src={photo} alt="site" style={{ maxHeight:220, maxWidth:'100%', borderRadius:10, objectFit:'cover', display:'block', margin:'0 auto' }}/>
                : <>
                    <div style={{ fontSize:36, marginBottom:10 }}>📷</div>
                    <div style={{ fontSize:14, fontWeight:700, color:TH.orangeDark, marginBottom:4 }}>Tap to take a photo</div>
                    <div style={{ fontSize:12, color:TH.muted }}>Camera opens automatically on mobile</div>
                  </>
              }
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) { setPhotoFile(f); setPhoto(URL.createObjectURL(f)) } }}/>
            {photo && (
              <button onClick={() => { setPhoto(null); setPhotoFile(null) }}
                style={{ fontSize:12, color:'#ef4444', cursor:'pointer', background:'none', border:'none',
                  fontWeight:700, marginTop:8, float:'right', padding:0 }}>
                ✕ Remove photo
              </button>
            )}
          </div>
        </div>

        {/* Notes */}
        <div style={{ background:TH.white, borderRadius:16, boxShadow:TH.shadow, overflow:'hidden', marginBottom:14 }}>
          <div style={{ padding:'12px 18px', borderBottom:`1px solid ${TH.border}` }}>
            <div style={{ fontSize:13, fontWeight:700, color:TH.text }}>📝 Notes <span style={{ fontSize:11, color:TH.muted, fontWeight:500 }}>(optional)</span></div>
          </div>
          <div style={{ padding:14 }}>
            <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Blockers, delays, observations, material issues…"
              style={{
                width:'100%', padding:'12px 14px', borderRadius:12,
                border:`2px solid ${TH.border}`, background:TH.bg, color:TH.text,
                fontSize:14, outline:'none', resize:'none', fontFamily:FF,
                boxSizing:'border-box', lineHeight:1.5, transition:'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor=TH.orange}
              onBlur={e => e.target.style.borderColor=TH.border}
            />
          </div>
        </div>

        <div style={{ height:8 }}/>
      </div>

      {/* Bottom bar */}
      <div style={{ padding:'12px 16px', background:TH.white, borderTop:`1px solid ${TH.border}`, flexShrink:0 }}>
        {error && <div style={{ background:'#fef2f2', border:'1px solid #fca5a5', borderRadius:10,
          padding:'10px 14px', color:'#dc2626', fontSize:13, fontWeight:600, marginBottom:10 }}>⛔ {error}</div>}
        <button
          onClick={submit} disabled={submitting || !photo}
          style={{
            width:'100%', padding:18, borderRadius:14, border:'none',
            background: photo ? `linear-gradient(135deg,${TH.orangeDark},${TH.orange})` : '#e2e8f0',
            color: photo ? '#fff' : '#94a3b8',
            fontSize:16, fontWeight:800, cursor: photo ? 'pointer' : 'not-allowed',
            boxShadow: photo ? `0 6px 20px ${TH.orange}40` : 'none',
          }}>
          {submitting ? '⏳ Submitting…' : '✓ Submit Site Update'}
        </button>
      </div>
    </div>
  )
}
