/**
 * FormSiteJob.jsx — Create a new site job
 * Chapter: Operations
 *
 * PM picks: Service Unit → Job Type → Template (auto) → Job Ref → Site → Notes
 * Calls create_site_job() RPC which seeds milestones from the template.
 */

import { useState, useEffect } from 'react'
import { supabase }            from '../lib/supabase'
import FormShell               from '../components/FormShell'

const SERVICE_UNITS = ['NISU', 'TISU', 'CISU', 'ITSU']

const UNIT_LABELS = {
  NISU: 'NISU — Network Integration & Switch',
  TISU: 'TISU — Tower & Infrastructure',
  CISU: 'CISU — Civil & Structural',
  ITSU: 'ITSU — IT Support',
}

export default function FormSiteJob({ isOpen, onClose, entityId, employeeId, onSaved }) {
  const [step, setStep] = useState(1)

  // Step 1 fields
  const [serviceUnit, setServiceUnit] = useState('')
  const [templates,   setTemplates]   = useState([])
  const [templateId,  setTemplateId]  = useState('')
  const [jobType,     setJobType]     = useState('')
  const [jobRef,      setJobRef]      = useState('')

  // Step 2 fields
  const [sites,          setSites]          = useState([])
  const [siteMasterId,   setSiteMasterId]   = useState('')
  const [notes,          setNotes]          = useState('')

  const [saving,  setSaving]  = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [error,   setError]   = useState('')

  // Load templates when service unit changes
  useEffect(() => {
    if (!serviceUnit || !entityId) { setTemplates([]); setTemplateId(''); setJobType(''); return }
    supabase
      .from('workflow_templates')
      .select('id,job_type,label')
      .eq('entity_id', entityId)
      .eq('service_unit', serviceUnit)
      .eq('is_active', true)
      .order('label')
      .then(({ data }) => {
        setTemplates(data || [])
        setTemplateId('')
        setJobType('')
      })
  }, [serviceUnit, entityId])

  // Load site masters on open
  useEffect(() => {
    if (!entityId || !isOpen) return
    supabase
      .from('site_masters')
      .select('id,sm_id,site_name,dept_id')
      .eq('entity_id', entityId)
      .order('sm_id')
      .then(({ data }) => setSites(data || []))
  }, [entityId, isOpen])

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setStep(1); setServiceUnit(''); setTemplates([]); setTemplateId('')
      setJobType(''); setJobRef(''); setSiteMasterId(''); setNotes('')
      setSaveMsg(''); setError('')
    }
  }, [isOpen])

  // When template selected, populate job_type automatically
  function handleTemplateChange(tid) {
    setTemplateId(tid)
    const tmpl = templates.find(t => t.id === tid)
    setJobType(tmpl?.job_type || '')
  }

  async function handleSubmit() {
    if (!siteMasterId) { setError('Please select a site.'); return }
    if (!serviceUnit)  { setError('Please select a service unit.'); return }
    if (!jobType)      { setError('Please select a job type.'); return }
    setSaving(true); setError('')
    const { data, error: rpcErr } = await supabase.rpc('create_site_job', {
      payload: {
        entity_id:      entityId,
        site_master_id: siteMasterId,
        template_id:    templateId || null,
        job_ref:        jobRef || null,
        service_unit:   serviceUnit,
        job_type:       jobType,
        notes:          notes || null,
        created_by:     employeeId || null,
      }
    })
    setSaving(false)
    if (rpcErr) { setError(rpcErr.message); return }
    setSaveMsg(`Job created — ${data?.milestones_seeded || 0} milestones seeded.`)
    setTimeout(() => { onSaved?.(); onClose() }, 1400)
  }

  const step1Ready = serviceUnit && jobType
  const step2Ready = siteMasterId

  return (
    <FormShell
      isOpen={isOpen}
      onClose={onClose}
      chapterName="Operations"
      title={['NEW', 'Site', 'Job']}
      description="Create a job on a site and seed its milestone checklist."
      steps={['Job Details', 'Site & Notes']}
      currentStep={step}
      backLabel={step === 1 ? 'Cancel' : 'Back'}
      nextLabel={step === 1 ? 'Next →' : saving ? 'Creating…' : 'Create Job'}
      nextDisabled={step === 1 ? !step1Ready : (!step2Ready || saving)}
      onBack={() => { if (step === 1) onClose(); else setStep(1) }}
      onNext={() => { if (step === 1) setStep(2); else handleSubmit() }}
    >
      {step === 1 && (
        <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

          {/* Service Unit */}
          <div>
            <label style={S.label}>Service Unit *</label>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              {SERVICE_UNITS.map(u => (
                <button key={u} onClick={() => setServiceUnit(u)}
                  style={{
                    padding:'8px 16px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                    border: serviceUnit === u ? '2px solid #0079BC' : '2px solid #dde3ec',
                    background: serviceUnit === u ? '#e3f2fd' : '#fff',
                    color: serviceUnit === u ? '#0079BC' : '#546e7a',
                  }}>
                  {u}
                </button>
              ))}
            </div>
            {serviceUnit && <div style={{ fontSize:11, color:'#90a4ae', marginTop:4 }}>{UNIT_LABELS[serviceUnit]}</div>}
          </div>

          {/* Job Type / Template */}
          {serviceUnit && (
            <div>
              <label style={S.label}>Job Type / Workflow *</label>
              {templates.length === 0 ? (
                <div style={{ fontSize:12, color:'#f57f17', padding:'8px 12px', background:'#fff8e1', borderRadius:8 }}>
                  No templates found for {serviceUnit}. Run the SQL seed or add templates first.
                </div>
              ) : (
                <select value={templateId} onChange={e => handleTemplateChange(e.target.value)} style={S.inp}>
                  <option value="">— Select job type —</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Client Job # */}
          {serviceUnit && (
            <div>
              <label style={S.label}>
                Client Job # {['CISU','ITSU'].includes(serviceUnit) ? '(optional)' : ''}
              </label>
              <input
                value={jobRef}
                onChange={e => setJobRef(e.target.value)}
                placeholder={['NISU','TISU'].includes(serviceUnit) ? 'e.g. ZTE-2026-00123' : 'Leave blank if not applicable'}
                style={S.inp}
              />
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div style={{ display:'flex', flexDirection:'column', gap:18 }}>

          {/* Summary pill */}
          <div style={{ background:'#e3f2fd', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#1565c0', fontWeight:600 }}>
            {serviceUnit} · {templates.find(t=>t.id===templateId)?.label || jobType}
            {jobRef && <span style={{ marginLeft:8, fontWeight:400, color:'#546e7a' }}>Job# {jobRef}</span>}
          </div>

          {/* Site */}
          <div>
            <label style={S.label}>Site *</label>
            <select value={siteMasterId} onChange={e => setSiteMasterId(e.target.value)} style={S.inp}>
              <option value="">— Select site —</option>
              {sites.map(s => (
                <option key={s.id} value={s.id}>{s.sm_id} — {s.site_name}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label style={S.label}>Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Any special instructions for this job…"
              style={{ ...S.inp, resize:'vertical', fontFamily:'inherit' }}
            />
          </div>

          {error   && <div style={{ fontSize:12, color:'#c62828', background:'#ffebee', padding:'8px 12px', borderRadius:8 }}>{error}</div>}
          {saveMsg && <div style={{ fontSize:12, color:'#2e7d32', background:'#e8f5e9', padding:'8px 12px', borderRadius:8 }}>{saveMsg}</div>}
        </div>
      )}
    </FormShell>
  )
}

const S = {
  label: { display:'block', fontSize:10, color:'#6b7c93', fontWeight:700, marginBottom:4, textTransform:'uppercase', letterSpacing:0.4 },
  inp: {
    width:'100%', padding:'8px 12px', borderRadius:8, border:'1.5px solid #dde3ec',
    fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box', color:'#1a2e3d',
  },
}
