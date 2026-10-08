/**
 * FIELD SITE STATUS FORM
 * Used by: Tech/Engineer (all milestones) and SubCon (their scope only)
 * Input: milestone checkboxes + mandatory photo
 * System calculates % completion from checked milestones
 */

import { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { uploadToDrive } from '../hooks/useDriveUpload'
import { postToSheet } from '../lib/googleSheets'

// Milestone sets per scope type
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

const S = {
  card:    { background:'#fff', borderRadius:20, padding:24, width:'100%', maxWidth:440, boxShadow:'0 4px 20px rgba(0,0,0,0.10)' },
  title:   { fontSize:20, fontWeight:800, color:'#1a2540', marginBottom:6 },
  site:    { fontSize:13, color:'#6b7c93', marginBottom:20 },
  ms:      { display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, marginBottom:6, cursor:'pointer', border:'2px solid', transition:'all 0.15s' },
  photoBox:{ border:'2px dashed #dde3ec', borderRadius:14, padding:24, textAlign:'center', cursor:'pointer', marginBottom:16 },
  bigBtn:  { background:'linear-gradient(135deg,#e65100,#f4511e)', color:'#fff', border:'none', borderRadius:14, padding:'16px', fontSize:16, fontWeight:800, cursor:'pointer', width:'100%' },
  progress:{ height:10, borderRadius:8, background:'#e3f2fd', overflow:'hidden', marginBottom:20 },
  bar:     (pct) => ({ height:'100%', width:`${pct}%`, background:'linear-gradient(90deg,#1565c0,#1976d2)', borderRadius:8, transition:'width 0.4s' }),
}

export default function FieldSiteStatus({ person, assignment, personType }) {
  const [checked,    setChecked]    = useState({})
  const [photo,      setPhoto]      = useState(null)
  const [photoFile,  setPhotoFile]  = useState(null)
  const [notes,      setNotes]      = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [existing,   setExisting]   = useState({})
  const fileRef = useRef()

  // Determine which milestone set to use
  const scopeType  = assignment?.scope_type || 'GENERAL'
  const milestones = MILESTONE_SETS[scopeType] || MILESTONE_SETS.GENERAL

  // For SubCon: only show milestones matching their scope (already done above)
  // For Employee: show all milestones of the site's scope

  useEffect(() => {
    if (!assignment?.site_master_id) return
    // Load existing milestone state from site_masters.milestones JSONB
    loadExisting()
  }, [assignment])

  async function loadExisting() {
    const { data } = await supabase.from('site_masters')
      .select('milestones')
      .eq('id', assignment.site_master_id)
      .single()
    if (data?.milestones) {
      const map = {}
      data.milestones.forEach(m => { if (m.status === 'DONE') map[m.name] = true })
      setChecked(map)
      setExisting(map)
    }
  }

  const toggle = (name) => {
    if (existing[name]) return   // already completed milestones can't be unchecked
    setChecked(prev => ({ ...prev, [name]: !prev[name] }))
  }

  const checkedCount = Object.values(checked).filter(Boolean).length
  const totalCount   = milestones.length
  const pct          = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0

  async function submit() {
    const newlyChecked = milestones.filter(m => checked[m] && !existing[m])
    if (newlyChecked.length === 0) { alert('Tick at least one new milestone to update'); return }
    if (!photo)                    { alert('A photo is required with site status update'); return }
    setSubmitting(true)

    // Upload photo
    let photoUrl = null
    if (photoFile) {
      const result = await uploadToDrive(photoFile, 'sites', assignment.site_master_id)
      if (result) photoUrl = result.viewUrl
    }

    const today = new Date().toISOString().split('T')[0]

    // Build updated milestones array
    const updatedMilestones = milestones.map(name => ({
      name,
      status:  checked[name] ? 'DONE' : 'PENDING',
      date:    checked[name] ? today : null,
      updated_by: person.id,
      photo_url: checked[name] && newlyChecked.includes(name) ? photoUrl : null,
      notes:   checked[name] && newlyChecked.includes(name) ? notes : null,
    }))

    const statusPayload = {
      site_master_id: assignment.site_master_id,
      sm_id:          assignment.sm_id || assignment.site_masters?.sm_id || null,
      employee_id:    person.id,
      scope_type:     scopeType,
      milestones_done: newlyChecked,
      completion_pct: pct,
      photo_url:      photoUrl,
      notes:          notes || null,
      updated_at:     new Date().toISOString(),
    }

    // Update site_masters milestones + fire Sheets sync in parallel
    const [{ error }] = await Promise.all([
      supabase.from('site_masters').update({
        milestones: updatedMilestones,
        updated_at: new Date().toISOString(),
      }).eq('id', assignment.site_master_id),
      postToSheet('site_status', statusPayload),
    ])

    if (error) { alert(error.message); setSubmitting(false); return }
    setSubmitted(true)
    setSubmitting(false)
  }

  if (!assignment) return (
    <div style={{ ...S.card, textAlign:'center', padding:40 }}>
      <div style={{ fontSize:40, marginBottom:12 }}>📍</div>
      <div style={{ color:'#c62828', fontWeight:700 }}>No site assigned for today</div>
      <div style={{ color:'#6b7c93', fontSize:13, marginTop:8 }}>Contact your PM to get assigned to a site.</div>
    </div>
  )

  if (submitted) return (
    <div style={{ ...S.card, textAlign:'center' }}>
      <div style={{ fontSize:56 }}>✅</div>
      <div style={{ fontSize:20, fontWeight:800, color:'#e65100', marginTop:12, marginBottom:6 }}>Site Status Updated!</div>
      <div style={{ color:'#6b7c93' }}>{pct}% complete · {checkedCount}/{totalCount} milestones</div>
    </div>
  )

  return (
    <div style={S.card}>
      <div style={S.title}>📍 Site Status</div>
      <div style={S.site}>
        {assignment.site_masters?.site_name || assignment.sm_id} · {scopeType.replace(/_/g,' ')}
      </div>

      {/* Progress bar */}
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:6 }}>
        <span style={{ color:'#6b7c93' }}>Progress</span>
        <span style={{ fontWeight:800, color:'#1565c0' }}>{pct}% ({checkedCount}/{totalCount})</span>
      </div>
      <div style={S.progress}><div style={S.bar(pct)} /></div>

      {/* Milestones */}
      <div style={{ marginBottom:20 }}>
        {milestones.map(name => {
          const done    = checked[name]
          const wasOld  = existing[name]
          return (
            <div key={name} style={{ ...S.ms,
              borderColor: done ? '#2e7d32' : '#dde3ec',
              background:  done ? '#e8f5e9' : '#fafbfc',
              opacity:     wasOld ? 0.7 : 1,
            }} onClick={() => toggle(name)}>
              <div style={{ width:24, height:24, borderRadius:6, border:`2px solid ${done?'#2e7d32':'#dde3ec'}`,
                background: done?'#2e7d32':'#fff', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {done && <span style={{ color:'#fff', fontSize:14, fontWeight:800 }}>✓</span>}
              </div>
              <div style={{ flex:1, fontSize:14, fontWeight: done?700:400, color: done?'#2e7d32':'#1a2540' }}>{name}</div>
              {wasOld && <span style={{ fontSize:10, color:'#2e7d32' }}>Previous</span>}
            </div>
          )
        })}
      </div>

      {/* Photo — mandatory */}
      <div style={{ marginBottom:16 }}>
        <label style={{ display:'block', fontSize:12, color:'#6b7c93', fontWeight:700, marginBottom:5 }}>
          Site Photo * (mandatory)
        </label>
        <div style={{ ...S.photoBox, borderColor: photo?'#e65100':'#dde3ec' }}
          onClick={() => fileRef.current?.click()}>
          {photo
            ? <img src={photo} alt="site" style={{ maxHeight:160, maxWidth:'100%', borderRadius:8, objectFit:'cover' }} />
            : <div>
                <div style={{ fontSize:36, marginBottom:8 }}>📷</div>
                <div style={{ fontSize:14, color:'#6b7c93' }}>Take a photo of the site / work done</div>
              </div>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
          onChange={e => {
            if (e.target.files[0]) {
              setPhotoFile(e.target.files[0])
              setPhoto(URL.createObjectURL(e.target.files[0]))
            }
          }} />
      </div>

      {/* Notes */}
      <div style={{ marginBottom:20 }}>
        <label style={{ display:'block', fontSize:12, color:'#6b7c93', fontWeight:700, marginBottom:5 }}>Notes (optional)</label>
        <textarea rows={2} style={{ width:'100%', padding:'11px', borderRadius:10, border:'1.5px solid #dde3ec', fontSize:14, outline:'none', resize:'none', fontFamily:'inherit', boxSizing:'border-box' }}
          placeholder="Any blockers, delays, or comments…"
          value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <button style={S.bigBtn} onClick={submit} disabled={submitting}>
        {submitting ? 'Updating…' : `Update Site Status`}
      </button>
    </div>
  )
}
