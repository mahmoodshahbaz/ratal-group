/**
 * FormSubConClaim.jsx  —  /forms/subcon-claim
 *
 * Phase I: Sub-Contractor Claim Form
 *
 * Allows a subcontractor (or any authorised field role) to:
 *  1. Pick their assigned site
 *  2. Choose claim type: Lump Sum | Hourly | Milestone-based
 *  3. Enter work details + amounts + optional materials
 *  4. Upload completion photos / delivery note
 *  5. Submit → inserts into subcon_claims + notifies DH
 *
 * Auth: requires QR token  (dev bypass: ?dev=1)
 * Roles: SUBCONTRACTOR, STAFF_DH (and any role with 'subcon_claim' in allowedForms)
 */

import { useState, useEffect, useCallback } from 'react'
import { useFieldAuth }                      from '../lib/useFieldAuth'
import { supabase }                          from '../lib/supabase'
import { uploadToDrive }                     from '../hooks/useDriveUpload'

// ── Constants ───────────────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

// Milestone sets — mirrors FormSiteCompletion.jsx
const MILESTONE_SETS = {
  TOWER_INSTALLATION: [
    'Site survey & access',
    'Foundation / base install',
    'Tower erection — section 1',
    'Tower erection — section 2',
    'Tower erection — section 3',
    'Climbing pegs & safety',
    'Platform & railing',
    'Antenna mounting',
    'Feeder cable routing',
    'Grounding & earthing',
    'Lighting & aviation marker',
    'Final inspection',
  ],
  ACTIVE_INSTALLATION: [
    'Equipment unpacking & check',
    'BTS / BBU rack install',
    'RRU / RRH mounting',
    'Antenna alignment',
    'Cable management',
    'Power system setup',
    'Transmission / backhaul',
    'Hardware integration test',
    'Software provisioning',
    'RF optimisation',
    'Drive test',
    'Site handover',
  ],
  CIVIL: [
    'Site clearing & marking',
    'Excavation',
    'Foundation casting',
    'Compound walling',
    'Civil finishes',
    'Access road',
    'Drainage',
    'Generator platform',
  ],
  FIBRE: [
    'Route survey',
    'Trenching',
    'Conduit lay',
    'Fibre pull',
    'Splicing',
    'Testing & OTDR',
    'Duct sealing',
    'As-built documentation',
  ],
  DOCUMENTATION: [
    'As-built drawings',
    'Test reports',
    'Handover certificate',
    'Equipment list',
    'Network diagram',
    'Photo report',
    'Customer sign-off',
  ],
  TESTING: [
    'Power-on test',
    'Link budget check',
    'Signal quality test',
    'Throughput test',
    'Alarm verification',
    'Failover test',
    'Performance baseline',
    'Acceptance test',
  ],
  GENERAL: [
    'Mobilisation',
    'Material delivery',
    'Works commenced',
    '25% complete',
    '50% complete',
    '75% complete',
    'Works completed',
    'Final walkthrough',
  ],
}

const URGENCY_COLORS = { LOW:'#43a047', MEDIUM:'#fb8c00', HIGH:'#e53935', CRITICAL:'#6a1b9a' }

// ── Styles ───────────────────────────────────────────────────────────────────

const s = {
  root: {
    minHeight:'100vh', background:'#eef2f7',
    fontFamily:'Arial, sans-serif', maxWidth:480, margin:'0 auto',
  },
  header: {
    background:'linear-gradient(145deg, #1b5e20 0%, #2e7d32 60%, #388e3c 100%)',
    padding:'20px 20px 28px',
  },
  logoRow: { display:'flex', alignItems:'center', gap:10, marginBottom:16 },
  logo: { fontSize:28 },
  logoText: { fontSize:15, fontWeight:900, color:'#fff', letterSpacing:2 },
  headerTitle: { fontSize:20, fontWeight:900, color:'#fff', marginBottom:4 },
  headerSub: { fontSize:12, color:'rgba(255,255,255,0.75)' },
  body: { padding:'20px 16px' },
  card: {
    background:'#fff', borderRadius:16, padding:20,
    boxShadow:'0 2px 12px rgba(0,0,0,0.08)', marginBottom:16,
  },
  sectionTitle: { fontSize:14, fontWeight:800, color:'#1b5e20', marginBottom:12 },
  label: { display:'block', fontSize:12, fontWeight:700, color:'#546e7a', marginBottom:4 },
  input: {
    width:'100%', boxSizing:'border-box', padding:'10px 12px',
    border:'1.5px solid #cfd8dc', borderRadius:10, fontSize:14,
    background:'#f8fafc', color:'#1a2e3d', outline:'none',
  },
  textarea: {
    width:'100%', boxSizing:'border-box', padding:'10px 12px',
    border:'1.5px solid #cfd8dc', borderRadius:10, fontSize:14,
    background:'#f8fafc', color:'#1a2e3d', minHeight:80, resize:'vertical', outline:'none',
  },
  row: { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 },
  fieldWrap: { marginBottom:12 },
  typeGrid: {
    display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:16,
  },
  typeBtn: (active, color) => ({
    padding:'14px 8px', borderRadius:12, border:`2px solid ${active ? color : '#e0e0e0'}`,
    background: active ? color + '18' : '#f8fafc', cursor:'pointer',
    textAlign:'center', transition:'all 0.2s',
  }),
  typeBtnLabel: (active, color) => ({
    fontSize:11, fontWeight:700, color: active ? color : '#78909c', marginTop:6, display:'block',
  }),
  milestoneGrid: { display:'flex', flexDirection:'column', gap:6 },
  milestoneItem: (done) => ({
    display:'flex', alignItems:'center', gap:10, padding:'10px 12px',
    borderRadius:10, border:`1.5px solid ${done ? '#c8e6c9' : '#e0e0e0'}`,
    background: done ? '#f1f8e9' : '#fafafa', cursor:'pointer',
  }),
  milestoneCheck: (done) => ({
    width:22, height:22, borderRadius:6,
    background: done ? '#2e7d32' : '#e0e0e0',
    display:'flex', alignItems:'center', justifyContent:'center',
    fontSize:13, color:'#fff', flexShrink:0,
  }),
  milestoneTxt: (done) => ({
    fontSize:13, color: done ? '#1b5e20' : '#546e7a', fontWeight: done ? 700 : 400,
  }),
  matRow: {
    display:'grid', gridTemplateColumns:'1fr 80px 90px 30px',
    gap:6, alignItems:'center', marginBottom:6,
  },
  photoSlot: (filled) => ({
    border:`2px dashed ${filled ? '#2e7d32' : '#b0bec5'}`,
    borderRadius:12, padding:16, textAlign:'center', cursor:'pointer',
    background: filled ? '#f1f8e9' : '#f8fafc',
  }),
  btnPrimary: {
    width:'100%', padding:'14px', background:'#2e7d32',
    color:'#fff', border:'none', borderRadius:12, fontSize:16,
    fontWeight:800, cursor:'pointer', marginTop:8,
  },
  btnSecondary: {
    width:'100%', padding:'12px', background:'#e8f5e9',
    color:'#2e7d32', border:'2px solid #c8e6c9', borderRadius:12,
    fontSize:14, fontWeight:700, cursor:'pointer', marginBottom:8,
  },
  sitePill: (sel) => ({
    padding:'12px 14px', borderRadius:12, marginBottom:8, cursor:'pointer',
    border:`2px solid ${sel ? '#2e7d32' : '#e0e0e0'}`,
    background: sel ? '#f1f8e9' : '#fafafa',
    display:'flex', alignItems:'center', gap:10,
  }),
  successCard: {
    minHeight:'100vh', display:'flex', flexDirection:'column',
    alignItems:'center', justifyContent:'center', padding:32,
    background:'linear-gradient(160deg,#1b5e20,#2e7d32)',
  },
}

// ── Component ────────────────────────────────────────────────────────────────

export default function FormSubConClaim() {
  const { state } = useFieldAuth()
  const { loading, error, employee, role, assignments, allowedForms } = state

  // Step: 0=site picker, 1=claim type, 2=details, 3=success
  const [step, setStep]       = useState(0)
  const [assignment, setAssignment] = useState(null)
  const [claimType, setClaimType]   = useState('LUMPSUM') // LUMPSUM | HOURLY | MILESTONE

  // Period
  const now = new Date()
  const [claimMonth, setClaimMonth] = useState(now.getMonth() + 1)
  const [claimYear,  setClaimYear]  = useState(now.getFullYear())

  // Work details
  const [workDesc, setWorkDesc]     = useState('')
  const [claimAmount, setClaimAmount] = useState('')
  const [hoursWorked, setHoursWorked] = useState('')
  const [hourlyRate,  setHourlyRate]  = useState('')
  const [notes, setNotes]             = useState('')

  // Milestones
  const [milestones, setMilestones] = useState([])
  const [doneMilestones, setDoneMilestones] = useState(new Set())

  // Materials
  const [materials, setMaterials] = useState([{ item:'', qty:'', unit_cost:'' }])

  // Photos
  const [photo1, setPhoto1]   = useState(null)
  const [photo2, setPhoto2]   = useState(null)
  const [docFile, setDocFile] = useState(null)

  // Submit state
  const [submitting, setSubmitting] = useState(false)
  const [submitErr,  setSubmitErr]  = useState('')
  const [result, setResult]         = useState(null)

  // ── Derived ──────────────────────────────────────────────────────────────
  const scopeMilestones = assignment
    ? (MILESTONE_SETS[assignment.scope_type] || MILESTONE_SETS.GENERAL)
    : []

  const hoursTotal = claimType === 'HOURLY'
    ? (parseFloat(hoursWorked || 0) * parseFloat(hourlyRate || 0)).toFixed(2)
    : null

  const effectiveAmount = claimType === 'HOURLY'
    ? (parseFloat(hoursWorked || 0) * parseFloat(hourlyRate || 0))
    : parseFloat(claimAmount || 0)

  const vatAmt   = (effectiveAmount * 0.15).toFixed(2)
  const totalAmt = (effectiveAmount * 1.15).toFixed(2)

  // ── Milestone init ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!assignment) return
    const scope = assignment.scope_type
    setMilestones(MILESTONE_SETS[scope] || MILESTONE_SETS.GENERAL)
    setDoneMilestones(new Set())
  }, [assignment])

  // ── Photo upload helper ────────────────────────────────────────────────────
  const uploadPhoto = useCallback(async (file, prefix) => {
    if (!file) return null
    const result = await uploadToDrive(file, 'invoices', prefix)
    if (!result) throw new Error('Upload failed')
    return result.viewUrl
  }, [])

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!workDesc.trim()) { setSubmitErr('Please describe the work completed.'); return }
    if (effectiveAmount <= 0) { setSubmitErr('Claim amount must be greater than zero.'); return }
    if (!photo1) { setSubmitErr('At least one completion photo is required.'); return }

    setSubmitting(true)
    setSubmitErr('')

    try {
      const empId  = employee?.id
      const entId  = assignment?.project?.entity_id || employee?.entity_id || null

      // Upload photos
      const [url1, url2, urlDoc] = await Promise.all([
        uploadPhoto(photo1, `subcon/${empId}`),
        uploadPhoto(photo2, `subcon/${empId}`),
        uploadPhoto(docFile, `subcon-docs/${empId}`),
      ])

      // Materials cleanup
      const mats = materials.filter(m => m.item.trim())
        .map(m => ({
          item: m.item.trim(),
          qty: parseFloat(m.qty) || 0,
          unit_cost: parseFloat(m.unit_cost) || 0,
          total: (parseFloat(m.qty) || 0) * (parseFloat(m.unit_cost) || 0),
        }))

      const payload = {
        entity_id:       entId,
        employee_id:     empId,
        contractor_id:   employee?.contractor_id || null,
        assignment_id:   assignment?.id || null,
        site_name:       assignment?.site_name || '',
        scope_type:      assignment?.scope_type || 'GENERAL',
        claim_month:     claimMonth,
        claim_year:      claimYear,
        claim_type:      claimType,
        work_description: workDesc.trim(),
        milestones_done:  claimType === 'MILESTONE' ? Array.from(doneMilestones) : null,
        hours_worked:    claimType === 'HOURLY' ? parseFloat(hoursWorked) || null : null,
        hourly_rate:     claimType === 'HOURLY' ? parseFloat(hourlyRate)  || null : null,
        claim_amount:    effectiveAmount,
        vat_pct:         15,
        materials_used:  mats.length ? mats : null,
        photo_url:       url1,
        photo_url_2:     url2 || null,
        document_url:    urlDoc || null,
        notes:           notes.trim() || null,
        status:          'SUBMITTED',
        submitted_at:    new Date().toISOString(),
      }

      const { data: inserted, error: insErr } = await supabase
        .from('subcon_claims')
        .insert(payload)
        .select('id, claim_number')
        .single()

      if (insErr) throw insErr

      // Notify DH
      if (empId) {
        await supabase.from('notifications').insert({
          entity_id:   entId,
          employee_id: empId,
          type:        'CLAIM_SUBMITTED',
          title:       'Sub-Con Claim Submitted',
          body:        `${employee?.full_name_en || 'Subcontractor'} submitted claim SAR ${totalAmt} for ${assignment?.site_name || 'site'}.`,
          reference_type: 'subcon_claim',
          reference_id:   inserted?.id,
          is_read:        false,
        }).maybeSingle()
      }

      setResult({ id: inserted?.id, claimNumber: inserted?.claim_number, totalAmt })
      setStep(3)
    } catch (e) {
      console.error(e)
      setSubmitErr(e.message || 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Guard: auth ────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={s.root}>
      <div style={{ ...s.header }}>
        <div style={s.logoRow}><span style={s.logo}>👷</span><span style={s.logoText}>ACCSYS</span></div>
        <div style={s.headerTitle}>Sub-Con Claim</div>
      </div>
      <div style={{ padding:40, textAlign:'center', color:'#546e7a' }}>Verifying access…</div>
    </div>
  )

  if (error) return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={s.logoRow}><span style={s.logo}>👷</span><span style={s.logoText}>ACCSYS</span></div>
        <div style={s.headerTitle}>Sub-Con Claim</div>
      </div>
      <div style={{ padding:32 }}>
        <div style={{ background:'#ffebee', borderRadius:12, padding:20, color:'#b71c1c', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>🔒</div>
          <div style={{ fontWeight:800, marginBottom:8 }}>Authentication Required</div>
          <div style={{ fontSize:13 }}>{error}</div>
        </div>
      </div>
    </div>
  )

  if (!allowedForms?.includes('subcon_claim')) return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={s.logoRow}><span style={s.logo}>👷</span><span style={s.logoText}>ACCSYS</span></div>
        <div style={s.headerTitle}>Sub-Con Claim</div>
      </div>
      <div style={{ padding:32 }}>
        <div style={{ background:'#fff3e0', borderRadius:12, padding:20, color:'#e65100', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>⛔</div>
          <div style={{ fontWeight:800 }}>Access Denied</div>
          <div style={{ fontSize:13, marginTop:8 }}>This form is not available for your role.</div>
        </div>
      </div>
    </div>
  )

  // ── Step 3: Success ────────────────────────────────────────────────────────
  if (step === 3) return (
    <div style={s.successCard}>
      <div style={{ fontSize:64, marginBottom:16 }}>✅</div>
      <div style={{ fontSize:22, fontWeight:900, color:'#fff', marginBottom:8 }}>Claim Submitted!</div>
      {result?.claimNumber && (
        <div style={{ fontSize:14, color:'rgba(255,255,255,0.85)', marginBottom:4 }}>
          Ref: <strong>{result.claimNumber}</strong>
        </div>
      )}
      <div style={{ fontSize:16, color:'#a5d6a7', fontWeight:700, marginBottom:24 }}>
        SAR {parseFloat(result?.totalAmt || 0).toLocaleString()} (incl. VAT)
      </div>
      <div style={{ background:'rgba(255,255,255,0.12)', borderRadius:14, padding:20, width:'100%', maxWidth:360, marginBottom:24 }}>
        <div style={{ color:'rgba(255,255,255,0.8)', fontSize:13, textAlign:'center' }}>
          Your claim has been sent for DH review. You will be notified once it is approved.
        </div>
      </div>
      <button
        onClick={() => { setStep(0); setAssignment(null); setClaimType('LUMPSUM'); setWorkDesc(''); setClaimAmount(''); setHoursWorked(''); setHourlyRate(''); setNotes(''); setPhoto1(null); setPhoto2(null); setDocFile(null); setDoneMilestones(new Set()); setMaterials([{ item:'', qty:'', unit_cost:'' }]); setResult(null) }}
        style={{ background:'#fff', color:'#2e7d32', border:'none', borderRadius:12, padding:'14px 32px', fontSize:15, fontWeight:800, cursor:'pointer' }}
      >
        Submit Another Claim
      </button>
    </div>
  )

  // ── Shared header ──────────────────────────────────────────────────────────
  const Header = () => (
    <div style={s.header}>
      <div style={s.logoRow}>
        <span style={s.logo}>👷</span>
        <span style={s.logoText}>ACCSYS</span>
      </div>
      <div style={s.headerTitle}>Sub-Contractor Claim</div>
      <div style={s.headerSub}>
        {employee?.full_name_en} · {employee?.designation}
      </div>
      {/* Step dots */}
      <div style={{ display:'flex', gap:6, marginTop:16 }}>
        {['Site','Type','Details'].map((label, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: step >= i ? '#fff' : 'rgba(255,255,255,0.3)',
            }} />
            <span style={{ fontSize:10, color: step >= i ? '#fff' : 'rgba(255,255,255,0.5)' }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )

  // ── Step 0: Site Picker ────────────────────────────────────────────────────
  if (step === 0) return (
    <div style={s.root}>
      <Header />
      <div style={s.body}>
        <div style={s.card}>
          <div style={s.sectionTitle}>📍 Select Assignment</div>

          {(!assignments || assignments.length === 0) ? (
            <div style={{ color:'#78909c', fontSize:14, textAlign:'center', padding:16 }}>
              No active site assignments found for your account.
            </div>
          ) : (
            assignments.map(a => (
              <div
                key={a.id}
                style={s.sitePill(assignment?.id === a.id)}
                onClick={() => setAssignment(a)}
              >
                <span style={{ fontSize:22 }}>🏗️</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:800, fontSize:14, color:'#1a2e3d' }}>
                    {a.site_name || a.site_number}
                  </div>
                  <div style={{ fontSize:12, color:'#78909c' }}>
                    {a.scope_type} · {a.project?.project_name}
                  </div>
                  {a.contractor?.contractor_name && (
                    <div style={{ fontSize:11, color:'#aab2bd' }}>{a.contractor.contractor_name}</div>
                  )}
                </div>
                {assignment?.id === a.id && (
                  <span style={{ color:'#2e7d32', fontWeight:900 }}>✓</span>
                )}
              </div>
            ))
          )}
        </div>

        <button
          onClick={() => { if (!assignment) return; setStep(1) }}
          style={{ ...s.btnPrimary, opacity: assignment ? 1 : 0.4 }}
          disabled={!assignment}
        >
          Continue →
        </button>
      </div>
    </div>
  )

  // ── Step 1: Claim Type ─────────────────────────────────────────────────────
  if (step === 1) return (
    <div style={s.root}>
      <Header />
      <div style={s.body}>
        {/* Claim period */}
        <div style={s.card}>
          <div style={s.sectionTitle}>📅 Claim Period</div>
          <div style={s.row}>
            <div>
              <label style={s.label}>Month</label>
              <select
                style={s.input}
                value={claimMonth}
                onChange={e => setClaimMonth(+e.target.value)}
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={s.label}>Year</label>
              <select
                style={s.input}
                value={claimYear}
                onChange={e => setClaimYear(+e.target.value)}
              >
                {[2024, 2025, 2026, 2027].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Claim type */}
        <div style={s.card}>
          <div style={s.sectionTitle}>🔖 Claim Type</div>
          <div style={s.typeGrid}>
            {[
              { key:'LUMPSUM',   icon:'💰', label:'Lump Sum'  },
              { key:'HOURLY',    icon:'⏱️', label:'Hourly'    },
              { key:'MILESTONE', icon:'🎯', label:'Milestone' },
            ].map(t => (
              <div
                key={t.key}
                style={s.typeBtn(claimType === t.key, '#2e7d32')}
                onClick={() => setClaimType(t.key)}
              >
                <div style={{ fontSize:26 }}>{t.icon}</div>
                <span style={s.typeBtnLabel(claimType === t.key, '#2e7d32')}>{t.label}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize:12, color:'#78909c', background:'#f8fafc', borderRadius:8, padding:10 }}>
            {claimType === 'LUMPSUM'   && '💰 Fixed amount agreed for a scope of work.'}
            {claimType === 'HOURLY'    && '⏱️ Hours worked × rate per hour. We calculate the total.'}
            {claimType === 'MILESTONE' && '🎯 Select completed milestones from the site scope.'}
          </div>
        </div>

        <div style={{ display:'flex', gap:10 }}>
          <button onClick={() => setStep(0)} style={{ ...s.btnSecondary, flex:1 }}>← Back</button>
          <button onClick={() => setStep(2)} style={{ ...s.btnPrimary, flex:2, marginTop:0 }}>Continue →</button>
        </div>
      </div>
    </div>
  )

  // ── Step 2: Work Details ───────────────────────────────────────────────────
  return (
    <div style={s.root}>
      <Header />
      <div style={s.body}>

        {/* ─ Work description ─ */}
        <div style={s.card}>
          <div style={s.sectionTitle}>📋 Work Description</div>
          <div style={s.fieldWrap}>
            <label style={s.label}>Describe work completed *</label>
            <textarea
              style={s.textarea}
              value={workDesc}
              onChange={e => setWorkDesc(e.target.value)}
              placeholder="e.g. Installed tower sections 1–3, erected platform, mounted antennas, completed cabling and grounding."
            />
          </div>
        </div>

        {/* ─ Milestone picker (only for MILESTONE type) ─ */}
        {claimType === 'MILESTONE' && (
          <div style={s.card}>
            <div style={s.sectionTitle}>🎯 Milestones Completed</div>
            <div style={{ fontSize:12, color:'#78909c', marginBottom:10 }}>
              Scope: <strong>{assignment?.scope_type}</strong> — tap to mark completed
            </div>
            <div style={s.milestoneGrid}>
              {scopeMilestones.map((m, i) => {
                const done = doneMilestones.has(m)
                return (
                  <div
                    key={i}
                    style={s.milestoneItem(done)}
                    onClick={() => {
                      const next = new Set(doneMilestones)
                      done ? next.delete(m) : next.add(m)
                      setDoneMilestones(next)
                    }}
                  >
                    <div style={s.milestoneCheck(done)}>{done ? '✓' : ''}</div>
                    <span style={s.milestoneTxt(done)}>{m}</span>
                  </div>
                )
              })}
            </div>
            {doneMilestones.size > 0 && (
              <div style={{ marginTop:10, fontSize:12, color:'#2e7d32', fontWeight:700 }}>
                {doneMilestones.size} of {scopeMilestones.length} milestones selected
              </div>
            )}
          </div>
        )}

        {/* ─ Amount / Hours ─ */}
        <div style={s.card}>
          <div style={s.sectionTitle}>💵 Claim Amount</div>

          {claimType === 'LUMPSUM' && (
            <div style={s.fieldWrap}>
              <label style={s.label}>Claim Amount (SAR) *</label>
              <input
                style={s.input}
                type="number"
                min="0"
                step="0.01"
                value={claimAmount}
                onChange={e => setClaimAmount(e.target.value)}
                placeholder="e.g. 12500.00"
              />
            </div>
          )}

          {claimType === 'HOURLY' && (
            <div style={s.row}>
              <div>
                <label style={s.label}>Hours Worked</label>
                <input
                  style={s.input}
                  type="number" min="0" step="0.5"
                  value={hoursWorked}
                  onChange={e => setHoursWorked(e.target.value)}
                  placeholder="e.g. 120"
                />
              </div>
              <div>
                <label style={s.label}>Rate / Hour (SAR)</label>
                <input
                  style={s.input}
                  type="number" min="0" step="0.01"
                  value={hourlyRate}
                  onChange={e => setHourlyRate(e.target.value)}
                  placeholder="e.g. 85.00"
                />
              </div>
            </div>
          )}

          {claimType === 'MILESTONE' && (
            <div style={s.fieldWrap}>
              <label style={s.label}>Agreed Amount for Selected Milestones (SAR) *</label>
              <input
                style={s.input}
                type="number" min="0" step="0.01"
                value={claimAmount}
                onChange={e => setClaimAmount(e.target.value)}
                placeholder="e.g. 8750.00"
              />
            </div>
          )}

          {/* VAT summary */}
          {effectiveAmount > 0 && (
            <div style={{ background:'#f1f8e9', borderRadius:10, padding:12, marginTop:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4 }}>
                <span style={{ color:'#546e7a' }}>Subtotal</span>
                <span style={{ fontWeight:700 }}>SAR {effectiveAmount.toLocaleString(undefined,{minimumFractionDigits:2})}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:4 }}>
                <span style={{ color:'#546e7a' }}>VAT 15%</span>
                <span style={{ fontWeight:700 }}>SAR {parseFloat(vatAmt).toLocaleString(undefined,{minimumFractionDigits:2})}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:800, color:'#2e7d32', borderTop:'1px solid #c8e6c9', paddingTop:8 }}>
                <span>Total</span>
                <span>SAR {parseFloat(totalAmt).toLocaleString(undefined,{minimumFractionDigits:2})}</span>
              </div>
            </div>
          )}
        </div>

        {/* ─ Materials (optional) ─ */}
        <div style={s.card}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <div style={s.sectionTitle}>🔩 Materials Used <span style={{ fontSize:11, color:'#aab2bd', fontWeight:400 }}>(optional)</span></div>
            <button
              onClick={() => setMaterials([...materials, { item:'', qty:'', unit_cost:'' }])}
              style={{ background:'#e8f5e9', color:'#2e7d32', border:'none', borderRadius:8, padding:'4px 10px', fontSize:12, fontWeight:700, cursor:'pointer' }}
            >+ Add</button>
          </div>
          {materials.map((m, i) => (
            <div key={i} style={s.matRow}>
              <input
                style={{ ...s.input, fontSize:12 }}
                placeholder="Item name"
                value={m.item}
                onChange={e => {
                  const copy = [...materials]; copy[i] = { ...m, item: e.target.value }; setMaterials(copy)
                }}
              />
              <input
                style={{ ...s.input, fontSize:12 }}
                placeholder="Qty"
                type="number" min="0"
                value={m.qty}
                onChange={e => {
                  const copy = [...materials]; copy[i] = { ...m, qty: e.target.value }; setMaterials(copy)
                }}
              />
              <input
                style={{ ...s.input, fontSize:12 }}
                placeholder="Unit SAR"
                type="number" min="0" step="0.01"
                value={m.unit_cost}
                onChange={e => {
                  const copy = [...materials]; copy[i] = { ...m, unit_cost: e.target.value }; setMaterials(copy)
                }}
              />
              <button
                onClick={() => setMaterials(materials.filter((_, j) => j !== i))}
                style={{ background:'none', border:'none', color:'#e53935', fontSize:18, cursor:'pointer', padding:0 }}
              >×</button>
            </div>
          ))}
          {materials.length > 0 && (
            <div style={{ fontSize:11, color:'#aab2bd', marginTop:4 }}>
              Item name · Qty · Unit cost (SAR)
            </div>
          )}
        </div>

        {/* ─ Photos ─ */}
        <div style={s.card}>
          <div style={s.sectionTitle}>📸 Completion Evidence</div>
          <div style={s.row}>
            <div>
              <label style={s.label}>Photo 1 *</label>
              <label style={s.photoSlot(!!photo1)}>
                <input
                  type="file" accept="image/*" style={{ display:'none' }}
                  onChange={e => setPhoto1(e.target.files[0])}
                />
                {photo1 ? (
                  <>
                    <div style={{ fontSize:24 }}>✅</div>
                    <div style={{ fontSize:11, color:'#2e7d32', marginTop:4, wordBreak:'break-all' }}>
                      {photo1.name}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:28, color:'#90a4ae' }}>📷</div>
                    <div style={{ fontSize:12, color:'#90a4ae', marginTop:6 }}>Tap to upload</div>
                  </>
                )}
              </label>
            </div>
            <div>
              <label style={s.label}>Photo 2</label>
              <label style={s.photoSlot(!!photo2)}>
                <input
                  type="file" accept="image/*" style={{ display:'none' }}
                  onChange={e => setPhoto2(e.target.files[0])}
                />
                {photo2 ? (
                  <>
                    <div style={{ fontSize:24 }}>✅</div>
                    <div style={{ fontSize:11, color:'#2e7d32', marginTop:4, wordBreak:'break-all' }}>
                      {photo2.name}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:28, color:'#90a4ae' }}>📷</div>
                    <div style={{ fontSize:12, color:'#90a4ae', marginTop:6 }}>Optional</div>
                  </>
                )}
              </label>
            </div>
          </div>

          {/* Delivery note / BOQ */}
          <div style={{ marginTop:8 }}>
            <label style={s.label}>Delivery Note / BOQ Document <span style={{ color:'#aab2bd', fontWeight:400 }}>(optional)</span></label>
            <label style={{ ...s.photoSlot(!!docFile), display:'block' }}>
              <input
                type="file" accept="image/*,application/pdf"
                style={{ display:'none' }}
                onChange={e => setDocFile(e.target.files[0])}
              />
              {docFile ? (
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:22 }}>📄</span>
                  <span style={{ fontSize:12, color:'#2e7d32' }}>{docFile.name}</span>
                </div>
              ) : (
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:22, color:'#90a4ae' }}>📎</span>
                  <span style={{ fontSize:12, color:'#90a4ae' }}>Attach signed delivery note or BOQ</span>
                </div>
              )}
            </label>
          </div>
        </div>

        {/* ─ Notes ─ */}
        <div style={s.card}>
          <div style={s.sectionTitle}>📝 Additional Notes</div>
          <textarea
            style={s.textarea}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any additional comments, site conditions, or special notes…"
          />
        </div>

        {/* ─ Summary ─ */}
        <div style={{ background:'#1b5e20', borderRadius:14, padding:16, marginBottom:16 }}>
          <div style={{ color:'rgba(255,255,255,0.7)', fontSize:12, marginBottom:8 }}>Claim Summary</div>
          <div style={{ color:'#fff', fontSize:13, marginBottom:4 }}>
            📍 {assignment?.site_name} · {claimType}
          </div>
          <div style={{ color:'#a5d6a7', fontSize:11, marginBottom:6 }}>
            {MONTHS[claimMonth - 1]} {claimYear} · Scope: {assignment?.scope_type}
          </div>
          {effectiveAmount > 0 && (
            <div style={{ fontSize:20, fontWeight:900, color:'#fff' }}>
              SAR {parseFloat(totalAmt).toLocaleString(undefined,{minimumFractionDigits:2})}
              <span style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginLeft:8 }}>incl. VAT</span>
            </div>
          )}
        </div>

        {/* ─ Error ─ */}
        {submitErr && (
          <div style={{ background:'#ffebee', borderRadius:10, padding:12, color:'#b71c1c', fontSize:13, marginBottom:12 }}>
            ⚠️ {submitErr}
          </div>
        )}

        {/* ─ Actions ─ */}
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={() => setStep(1)} style={{ ...s.btnSecondary, flex:1 }}>← Back</button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{ ...s.btnPrimary, flex:2, marginTop:0, opacity: submitting ? 0.6 : 1 }}
          >
            {submitting ? '⏳ Submitting…' : '✅ Submit Claim'}
          </button>
        </div>

        <div style={{ height:32 }} />
      </div>
    </div>
  )
}
