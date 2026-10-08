/**
 * FormSiteCompletion.jsx — Field Site Status / Milestone Update
 * Route: /forms/site-completion
 * Auth:  useFieldAuth (QR token or ?dev=1 bypass)
 *
 * Flow:
 *  1. Auth guard → employee + assignments from useFieldAuth
 *  2. If >1 assignment → site picker
 *  3. Load previous milestone completions from site_status_logs
 *  4. Milestone checklist (scope-aware) + mandatory photo + notes
 *  5. Submit → site_status_logs INSERT + site_assignments UPDATE
 */

import { useState, useEffect, useRef } from 'react'
import { useFieldAuth, ROLE_COLORS }    from '../lib/useFieldAuth'
import { supabase }                     from '../lib/supabase'
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

// ── Shared styles ─────────────────────────────────────────────────────────────
const S = {
  wrap:    { minHeight:'100vh', background:'#f0f4f8', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start', padding:'20px 16px 40px' },
  card:    { background:'#fff', borderRadius:20, padding:24, width:'100%', maxWidth:440, boxShadow:'0 4px 20px rgba(0,0,0,0.10)' },
  h1:      { fontSize:20, fontWeight:800, color:'#1a2540', marginBottom:4 },
  sub:     { fontSize:13, color:'#6b7c93', marginBottom:20 },
  label:   { display:'block', fontSize:12, color:'#6b7c93', fontWeight:700, marginBottom:5 },
  progress:{ height:10, borderRadius:8, background:'#e3f2fd', overflow:'hidden', marginBottom:20 },
  bar:     (pct) => ({ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#1565c0,#1976d2)', borderRadius:8, transition:'width 0.4s' }),
  ms:      { display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, marginBottom:6, cursor:'pointer', border:'2px solid', transition:'all 0.15s' },
  photoBox:{ border:'2px dashed #dde3ec', borderRadius:14, padding:24, textAlign:'center', cursor:'pointer', marginBottom:16 },
  bigBtn:  { background:'linear-gradient(135deg,#e65100,#f4511e)', color:'#fff', border:'none', borderRadius:14, padding:'16px', fontSize:16, fontWeight:800, cursor:'pointer', width:'100%', marginTop:4 },
  badge:   (color) => ({ background:color+'22', color, fontWeight:700, fontSize:11, padding:'3px 10px', borderRadius:20, display:'inline-block', marginBottom:16 }),
  siteRow: { display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderRadius:14, border:'2px solid #dde3ec', marginBottom:10, cursor:'pointer', background:'#fafbfc', transition:'border-color 0.15s' },
}

// ── Auth guard screen ─────────────────────────────────────────────────────────
function AuthGuard({ error }) {
  const msgs = {
    no_token:          { icon:'🔒', title:'Authentication Required', body:'Please scan the QR code provided to access this form.', color:'#c62828' },
    invalid_token:     { icon:'❌', title:'Invalid QR Code',         body:'This QR code is not recognised. Please contact your DH.',  color:'#c62828' },
    token_inactive:    { icon:'⛔', title:'QR Code Expired',         body:'This QR code has been deactivated. Ask your DH for a new one.', color:'#e65100' },
    employee_inactive: { icon:'🚫', title:'Account Inactive',        body:'Your account is not active. Contact HR.',                  color:'#c62828' },
  }
  const m = msgs[error] || msgs.no_token
  return (
    <div style={S.wrap}>
      <div style={{ ...S.card, textAlign:'center', padding:40 }}>
        <div style={{ fontSize:56, marginBottom:16 }}>{m.icon}</div>
        <div style={{ fontSize:20, fontWeight:800, color:m.color, marginBottom:8 }}>{m.title}</div>
        <div style={{ fontSize:14, color:'#6b7c93' }}>{m.body}</div>
      </div>
    </div>
  )
}

// ── Site picker (when employee has multiple assignments) ──────────────────────
function SitePicker({ assignments, onSelect }) {
  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <div style={S.h1}>📍 Select Site</div>
        <div style={S.sub}>Which site are you updating today?</div>
        {assignments.map(a => (
          <div key={a.id} style={S.siteRow}
            onMouseEnter={e => e.currentTarget.style.borderColor='#e65100'}
            onMouseLeave={e => e.currentTarget.style.borderColor='#dde3ec'}
            onClick={() => onSelect(a)}>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:15, color:'#1a2540' }}>{a.site_number}</div>
              <div style={{ fontSize:12, color:'#6b7c93' }}>{a.site_name}</div>
              {a.project && <div style={{ fontSize:11, color:'#1565c0', marginTop:2 }}>{a.project.project_name}</div>}
            </div>
            <div style={{ fontSize:11, color:'#fff', background:'#37474f', padding:'4px 10px', borderRadius:20 }}>
              {(a.scope_type||'GENERAL').replace(/_/g,' ')}
            </div>
            <div style={{ color:'#e65100', fontSize:18 }}>›</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main form ─────────────────────────────────────────────────────────────────
export default function FormSiteCompletion() {
  const auth = useFieldAuth()

  const [assignment,  setAssignment]  = useState(null)  // selected site_assignment row
  const [prevDone,    setPrevDone]    = useState({})    // milestones already completed (locked)
  const [checked,     setChecked]     = useState({})    // current session ticks
  const [photo,       setPhoto]       = useState(null)  // preview URL
  const [photoFile,   setPhotoFile]   = useState(null)
  const [notes,       setNotes]       = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [submitted,   setSubmitted]   = useState(false)
  const [loadingPrev, setLoadingPrev] = useState(false)
  const fileRef = useRef()

  // Auto-select if only one assignment
  useEffect(() => {
    if (!auth.loading && auth.assignments?.length === 1) {
      setAssignment(auth.assignments[0])
    }
  }, [auth.loading, auth.assignments])

  // Load previously completed milestones for this assignment
  useEffect(() => {
    if (!assignment?.id) return
    setLoadingPrev(true)
    supabase
      .from('site_assignments')
      .select('completed_milestones, completion_pct')
      .eq('id', assignment.id)
      .single()
      .then(({ data }) => {
        if (data?.completed_milestones?.length) {
          const map = {}
          data.completed_milestones.forEach(name => { map[name] = true })
          setPrevDone(map)
          setChecked(map)
        }
        setLoadingPrev(false)
      })
  }, [assignment])

  // ── Loading ────────────────────────────────────────────────
  if (auth.loading) {
    return (
      <div style={S.wrap}>
        <div style={{ ...S.card, textAlign:'center', padding:40 }}>
          <div style={{ fontSize:36, marginBottom:16 }}>⏳</div>
          <div style={{ color:'#6b7c93' }}>Checking authentication…</div>
        </div>
      </div>
    )
  }

  // ── Auth error ─────────────────────────────────────────────
  if (auth.error) return <AuthGuard error={auth.error} />

  // ── Site picker ────────────────────────────────────────────
  if (!assignment) {
    if (!auth.assignments?.length) {
      return (
        <div style={S.wrap}>
          <div style={{ ...S.card, textAlign:'center', padding:40 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📍</div>
            <div style={{ color:'#c62828', fontWeight:700 }}>No site assigned</div>
            <div style={{ color:'#6b7c93', fontSize:13, marginTop:8 }}>Contact your PM to get assigned to a site.</div>
          </div>
        </div>
      )
    }
    return <SitePicker assignments={auth.assignments} onSelect={setAssignment} />
  }

  const scopeType  = assignment.scope_type || 'GENERAL'
  const milestones = MILESTONE_SETS[scopeType] || MILESTONE_SETS.GENERAL

  const checkedCount   = milestones.filter(m => checked[m]).length
  const totalCount     = milestones.length
  const pct            = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0
  const newlyChecked   = milestones.filter(m => checked[m] && !prevDone[m])

  const toggle = (name) => {
    if (prevDone[name]) return   // already completed — locked
    setChecked(prev => ({ ...prev, [name]: !prev[name] }))
  }

  // ── Submit ─────────────────────────────────────────────────
  async function submit() {
    if (newlyChecked.length === 0) { alert('Tick at least one new milestone to update.'); return }
    if (!photo)                    { alert('A site photo is required.'); return }
    setSubmitting(true)

    try {
      // 1. Upload photo
      let photoUrl = null
      if (photoFile) {
        const path = `site-status/${assignment.id}/${Date.now()}.jpg`
        const result = await uploadToDrive(photoFile, 'sites')
        if (result) photoUrl = result.viewUrl
      }

      const today = new Date().toISOString().split('T')[0]
      const now   = new Date().toISOString()

      // 2. Build full milestones snapshot
      const allMilestones = milestones.map(name => ({
        name,
        done:  !!checked[name],
        date:  checked[name] ? (prevDone[name] ? 'previous' : today) : null,
        photo_url: newlyChecked.includes(name) ? photoUrl : null,
        notes: newlyChecked.includes(name) ? (notes || null) : null,
      }))

      // 3. Insert log
      const { error: logErr } = await supabase.from('site_status_logs').insert({
        entity_id:           auth.entityId,
        assignment_id:       assignment.id,
        employee_id:         auth.employee.id,
        scope_type:          scopeType,
        milestones_newly_done: newlyChecked,
        all_milestones:      allMilestones,
        completion_pct:      pct,
        photo_url:           photoUrl,
        notes:               notes || null,
        submitted_at:        now,
      })
      if (logErr) throw logErr

      // 4. Update site_assignments progress
      const allDoneNames = milestones.filter(m => checked[m])
      await supabase.from('site_assignments').update({
        completion_pct:       pct,
        completed_milestones: allDoneNames,
        last_status_at:       now,
      }).eq('id', assignment.id)

      // 5. Send notification to DH / PM (fire and forget)
      if (auth.employee?.id !== (auth.assignments?.[0]?.employee_id)) {
        await supabase.from('notifications').insert({
          entity_id:   auth.entityId,
          employee_id: auth.employee.id,
          type:        'SITE_STATUS',
          title:       `Site ${assignment.site_number} updated to ${pct}%`,
          body:        `${newlyChecked.length} milestone(s) completed: ${newlyChecked.join(', ')}`,
          metadata:    { assignment_id: assignment.id, pct },
        }).then(() => {}) // ignore errors
      }

      setSubmitted(true)
    } catch (err) {
      alert(err.message || 'Submission failed. Please try again.')
    }
    setSubmitting(false)
  }

  // ── Success screen ─────────────────────────────────────────
  if (submitted) {
    return (
      <div style={S.wrap}>
        <div style={{ ...S.card, textAlign:'center', padding:40 }}>
          <div style={{ fontSize:64 }}>✅</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#e65100', marginTop:16, marginBottom:8 }}>
            Site Status Updated!
          </div>
          <div style={{ fontSize:15, color:'#1a2540', fontWeight:700, marginBottom:4 }}>
            {assignment.site_number} · {scopeType.replace(/_/g,' ')}
          </div>
          <div style={{ fontSize:14, color:'#6b7c93', marginBottom:20 }}>
            {pct}% complete · {checkedCount}/{totalCount} milestones
          </div>
          {/* Progress */}
          <div style={{ ...S.progress, marginBottom:24 }}>
            <div style={S.bar(pct)} />
          </div>
          <div style={{ fontSize:13, color:'#2e7d32', fontWeight:700, marginBottom:4 }}>
            ✓ Newly completed ({newlyChecked.length}):
          </div>
          <div style={{ fontSize:12, color:'#6b7c93', marginBottom:24 }}>
            {newlyChecked.join(' · ')}
          </div>
          <button style={{ ...S.bigBtn, background:'#1565c0' }}
            onClick={() => {
              setSubmitted(false)
              setNotes('')
              setPhoto(null)
              setPhotoFile(null)
              // Keep checked state so prev is accurate
              setPrevDone({ ...prevDone, ...Object.fromEntries(newlyChecked.map(m=>[m,true])) })
            }}>
            Update Again
          </button>
        </div>
      </div>
    )
  }

  // ── Main form ──────────────────────────────────────────────
  const roleColor = ROLE_COLORS[auth.role] || '#37474f'

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        {/* Header */}
        <div style={S.badge(roleColor)}>{auth.employee?.designation || auth.role}</div>
        <div style={S.h1}>📍 Site Status Update</div>
        <div style={S.sub}>
          <strong>{assignment.site_number}</strong>
          {assignment.site_name ? ` · ${assignment.site_name}` : ''}
          {auth.assignments?.length > 1 && (
            <span style={{ color:'#e65100', cursor:'pointer', marginLeft:8 }}
              onClick={() => { setAssignment(null); setChecked({}); setPrevDone({}) }}>
              ⬅ change
            </span>
          )}
        </div>

        {/* Scope badge */}
        <div style={{ display:'inline-block', fontSize:11, padding:'4px 12px', borderRadius:20, background:'#37474f22', color:'#37474f', fontWeight:700, marginBottom:16 }}>
          {scopeType.replace(/_/g,' ')}
        </div>

        {/* Progress bar */}
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:6 }}>
          <span style={{ color:'#6b7c93' }}>Overall Progress</span>
          <span style={{ fontWeight:800, color:'#1565c0' }}>{pct}% ({checkedCount}/{totalCount})</span>
        </div>
        <div style={S.progress}><div style={S.bar(pct)} /></div>

        {/* Milestones */}
        {loadingPrev ? (
          <div style={{ textAlign:'center', padding:20, color:'#6b7c93' }}>Loading previous progress…</div>
        ) : (
          <div style={{ marginBottom:20 }}>
            {milestones.map((name, i) => {
              const done   = !!checked[name]
              const locked = !!prevDone[name]
              return (
                <div key={name} style={{
                  ...S.ms,
                  borderColor: done ? '#2e7d32' : '#dde3ec',
                  background:  done ? '#e8f5e9' : '#fafbfc',
                  opacity:     locked ? 0.72 : 1,
                }} onClick={() => toggle(name)}>
                  {/* Checkbox */}
                  <div style={{
                    width:24, height:24, borderRadius:6, flexShrink:0,
                    border:`2px solid ${done ? '#2e7d32' : '#dde3ec'}`,
                    background: done ? '#2e7d32' : '#fff',
                    display:'flex', alignItems:'center', justifyContent:'center',
                  }}>
                    {done && <span style={{ color:'#fff', fontSize:14, fontWeight:900 }}>✓</span>}
                  </div>

                  {/* Step number + name */}
                  <div style={{ flex:1 }}>
                    <span style={{ fontSize:11, color:'#9e9e9e', marginRight:6 }}>{i+1}.</span>
                    <span style={{ fontSize:14, fontWeight: done ? 700 : 400, color: done ? '#2e7d32' : '#1a2540' }}>
                      {name}
                    </span>
                  </div>

                  {locked && (
                    <span style={{ fontSize:10, color:'#2e7d32', background:'#e8f5e9', padding:'2px 8px', borderRadius:10 }}>
                      Done
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Photo */}
        <div style={{ marginBottom:16 }}>
          <label style={S.label}>Site Photo * (mandatory)</label>
          <div style={{ ...S.photoBox, borderColor: photo ? '#e65100' : '#dde3ec' }}
            onClick={() => fileRef.current?.click()}>
            {photo
              ? <img src={photo} alt="site" style={{ maxHeight:180, maxWidth:'100%', borderRadius:10, objectFit:'cover' }} />
              : <>
                  <div style={{ fontSize:40, marginBottom:8 }}>📷</div>
                  <div style={{ fontSize:14, color:'#6b7c93' }}>Tap to take a photo of the site / work done</div>
                  <div style={{ fontSize:11, color:'#bbb', marginTop:4 }}>Required for each update</div>
                </>
            }
          </div>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) { setPhotoFile(f); setPhoto(URL.createObjectURL(f)) }
            }} />
          {photo && (
            <div style={{ fontSize:12, color:'#e65100', cursor:'pointer', textAlign:'right', marginTop:4 }}
              onClick={() => { setPhoto(null); setPhotoFile(null) }}>
              ✕ Remove photo
            </div>
          )}
        </div>

        {/* Notes */}
        <div style={{ marginBottom:20 }}>
          <label style={S.label}>Notes (optional)</label>
          <textarea rows={2} style={{ width:'100%', padding:'11px', borderRadius:10, border:'1.5px solid #dde3ec', fontSize:14, outline:'none', resize:'none', fontFamily:'inherit', boxSizing:'border-box' }}
            placeholder="Any blockers, delays, or observations…"
            value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {/* Newly ticked summary */}
        {newlyChecked.length > 0 && (
          <div style={{ background:'#e8f5e9', borderRadius:12, padding:'10px 14px', marginBottom:16 }}>
            <div style={{ fontSize:12, color:'#2e7d32', fontWeight:700, marginBottom:4 }}>
              ✓ {newlyChecked.length} milestone{newlyChecked.length > 1 ? 's' : ''} to submit:
            </div>
            {newlyChecked.map(m => (
              <div key={m} style={{ fontSize:12, color:'#388e3c' }}>· {m}</div>
            ))}
          </div>
        )}

        <button style={{ ...S.bigBtn, opacity: submitting ? 0.7 : 1 }}
          onClick={submit} disabled={submitting}>
          {submitting ? 'Submitting…' : `Submit Site Update (${pct}% complete)`}
        </button>
      </div>
    </div>
  )
}
