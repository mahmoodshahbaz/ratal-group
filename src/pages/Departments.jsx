import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import PageBanner from '../components/PageBanner'
import FormShell from '../components/FormShell'

const PP = "'Poppins','Inter',sans-serif"
const PRI = '#8C601B'   // Masters L3 accent
const L1  = '#C8B48F'   // Masters outer frame
const L2  = '#FAF5E9'   // Masters inner background

const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  inp:     { width:'100%', padding:'9px 11px', borderRadius:20, border:`1px solid ${PRI}44`, fontSize:13, color:'#172D37', background:'#fdfaf6', outline:'none', fontFamily:PP, boxSizing:'border-box' },
  label:   { display:'block', fontSize:11, color:'#53666F', fontWeight:700, marginBottom:4 },
  row:     { display:'flex', gap:12, marginBottom:14, flexWrap:'wrap' },
  col:     { flex:1, minWidth:140 },
  sec:     { fontSize:9, fontWeight:800, color:PRI, marginBottom:8, marginTop:12, paddingBottom:4, borderBottom:`1.5px solid ${PRI}33`, letterSpacing:1.5, textTransform:'uppercase' },
}

const STEPS = ['Department Identity', 'Approval Hierarchy']

function DeptModal({ editing, code, setCode, name, setName, description, setDescription,
  headId, setHeadId, pmId, setPmId, supId, setSupId, isActive, setIsActive,
  employees, empLabel, hasEmployees, saving, onSave, onClose }) {

  const [step, setStep] = useState(1)

  function handleBack() { step > 1 ? setStep(s => s - 1) : onClose() }
  function handleNext() {
    if (step < STEPS.length) { setStep(s => s + 1) }
    else { onSave() }
  }

  return (
    <FormShell
      isOpen
      onClose={onClose}
      chapterName="Masters"
      title={[editing ? 'Edit' : 'New', 'Department', 'Creation']}
      description="Create a department, assign its code, name and optional approval hierarchy."
      steps={STEPS}
      currentStep={step}
      onBack={handleBack}
      onNext={handleNext}
      backLabel={step === 1 ? 'Cancel' : '← Back'}
      nextLabel={step < STEPS.length ? 'Save & Next' : (saving ? 'Saving…' : editing ? 'Update Department' : 'Add Department')}
      nextDisabled={saving}
    >

      {step === 1 && (<>
        <div style={S.row}>
          <div style={S.col}>
            <label style={S.label}>Department Code</label>
            <input style={S.inp} value={code} onChange={e => setCode(e.target.value)} placeholder="IT / FIN / OPS / HR..." />
          </div>
          <div style={S.col}>
            <label style={S.label}>Status</label>
            <select style={S.inp} value={isActive} onChange={e => setIsActive(e.target.value === 'true')}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom:14 }}>
          <label style={S.label}>Department Name *</label>
          <input style={S.inp} value={name} onChange={e => setName(e.target.value)} placeholder="Information Technology, Finance, Field Operations..." />
        </div>
        <div style={{ marginBottom:6 }}>
          <label style={S.label}>Description / Activity</label>
          <textarea style={{ ...S.inp, height:90, resize:'vertical', lineHeight:1.6 }}
            value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Briefly describe what this department does, its responsibilities and activities..." />
          <div style={{ fontSize:11, color:'#9A8070', marginTop:3 }}>For reference only — does not affect operations</div>
        </div>
      </>)}

      {step === 2 && (<>
        {!hasEmployees && (
          <div style={{ background:'#fff8e1', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#f57c00', lineHeight:1.5 }}>
            No employees in this entity yet. Add employees first, then come back to assign Dept Head, PM and Supervisor.
          </div>
        )}
        <div style={{ marginBottom:14 }}>
          <label style={S.label}>Dept Head</label>
          <select style={S.inp} value={headId} onChange={e => setHeadId(e.target.value)} disabled={!hasEmployees}>
            <option value="">-- Not assigned --</option>
            {employees.map(e => <option key={e.id} value={e.id}>{empLabel(e.id)}</option>)}
          </select>
        </div>
        <div style={{ marginBottom:14 }}>
          <label style={S.label}>Primary PM <span style={{ fontWeight:400, color:'#9A8070' }}>(default — overridden per project)</span></label>
          <select style={S.inp} value={pmId} onChange={e => setPmId(e.target.value)} disabled={!hasEmployees}>
            <option value="">-- Not assigned --</option>
            {employees.map(e => <option key={e.id} value={e.id}>{empLabel(e.id)}</option>)}
          </select>
        </div>
        <div style={{ marginBottom:6 }}>
          <label style={S.label}>Primary Supervisor <span style={{ fontWeight:400, color:'#9A8070' }}>(default — overridden per project)</span></label>
          <select style={S.inp} value={supId} onChange={e => setSupId(e.target.value)} disabled={!hasEmployees}>
            <option value="">-- Not assigned --</option>
            {employees.map(e => <option key={e.id} value={e.id}>{empLabel(e.id)}</option>)}
          </select>
        </div>
      </>)}

    </FormShell>
  )
}

export default function Departments({ entityId }) {
  const [depts,     setDepts]     = useState([])
  const [employees, setEmployees] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showBanner, setShowBanner] = useState(false)
  const [open,      setOpen]      = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [editing,   setEditing]   = useState(null)

  const [code,        setCode]        = useState('')
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [headId,      setHeadId]      = useState('')
  const [pmId,        setPmId]        = useState('')
  const [supId,       setSupId]       = useState('')
  const [isActive,    setIsActive]    = useState(true)

  useEffect(() => { load() }, [entityId])

  async function load() {
    if (!entityId) return
    setLoading(true)
    const [{ data: d }, { data: e }] = await Promise.all([
      supabase.from('departments').select('*').eq('entity_id', entityId).order('dept_name'),
      supabase.from('employees').select('id,full_name_en,employee_number,designation,job_title,department_id,employee_type').eq('entity_id', entityId).eq('is_active', true).order('full_name_en'),
    ])
    setDepts(d||[])
    setEmployees(e||[])
    setLoading(false)
  }

  function empName(id) {
    if (!id) return null
    const e = employees.find(x => x.id === id)
    return e ? e.full_name_en : null
  }

  function empLabel(id) {
    if (!id) return ''
    const e = employees.find(x => x.id === id)
    if (!e) return ''
    const role = e.designation || e.job_title || ''
    return e.full_name_en + (role ? ' — ' + role : '')
  }

  function deptCounts(deptId) {
    const inDept     = employees.filter(e => e.department_id === deptId)
    const sponsored  = inDept.filter(e => e.employee_type && !['OUTSOURCED','CONTRACT'].includes(e.employee_type)).length
    const outsourced = inDept.filter(e => e.employee_type === 'OUTSOURCED').length
    const contract   = inDept.filter(e => e.employee_type === 'CONTRACT').length
    return { sponsored, outsourced, contract, total: inDept.length }
  }

  function resetForm() {
    setCode(''); setName(''); setDescription('')
    setHeadId(''); setPmId(''); setSupId('')
    setIsActive(true)
  }

  function openNew() { resetForm(); setEditing(null); setShowBanner(true) }

  function openEdit(d) {
    setEditing(d)
    setCode(d.dept_code||'')
    setName(d.dept_name||'')
    setDescription(d.description||'')
    setHeadId(d.dept_head_id||'')
    setPmId(d.pm_id||'')
    setSupId(d.supervisor_id||'')
    setIsActive(d.is_active !== false)
    setOpen(true)
  }

  async function save() {
    if (!name.trim()) { alert('Department name is required'); return }
    setSaving(true)
    const payload = {
      entity_id:     entityId,
      dept_code:     code.trim().toUpperCase() || null,
      dept_name:     name.trim(),
      description:   description.trim() || null,
      dept_head_id:  headId || null,
      pm_id:         pmId   || null,
      supervisor_id: supId  || null,
      is_active:     isActive,
    }
    const { error } = editing
      ? await supabase.from('departments').update(payload).eq('id', editing.id)
      : await supabase.from('departments').insert(payload)
    setSaving(false)
    if (error) { alert(error.message); return }
    setOpen(false); resetForm(); setEditing(null); load()
  }

  async function toggleActive(d) {
    await supabase.from('departments').update({ is_active: !d.is_active }).eq('id', d.id)
    load()
  }

  const activeDepts = depts.filter(d => d.is_active)
  const hasEmployees = employees.length > 0

  return (
    <div>
      <div style={{ position:'sticky', top:0, zIndex:20, background:'#f4f7fb', boxShadow:'0 2px 6px rgba(0,0,0,0.06)', padding:'10px 0 10px', marginBottom:10 }}>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <button onClick={openNew}
            style={{ background:PRI, color:'#fff', border:'none', borderRadius:10, padding:'9px 20px', cursor:'pointer', fontSize:13, fontWeight:700 , minWidth:160, textAlign:'center' }}>
            Add New Department
          </button>
          <div style={{ fontSize:13, color:'#6b7c93' }}>
            {activeDepts.length} active {activeDepts.length !== 1 ? 'departments' : 'department'}
            {depts.length > activeDepts.length ? ' · ' + (depts.length - activeDepts.length) + ' inactive' : ''}
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#aab2bd' }}>Loading departments...</div>
      ) : depts.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'#aab2bd' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🏛</div>
          <div style={{ fontWeight:700, marginBottom:6 }}>No departments yet</div>
          <div style={{ fontSize:13 }}>Add departments like IT, Finance, Operations, HR, Field Work etc.</div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap:14 }}>
          {depts.map(d => (
            <div key={d.id} style={{ background:'#fff', borderRadius:14, boxShadow:'0 2px 10px rgba(0,0,0,0.07)', overflow:'hidden', opacity:d.is_active ? 1 : 0.65 }}>
              <div style={{ background:PRI, padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  {d.dept_code && <div style={{ fontSize:20, color:'#fff', fontWeight:800, letterSpacing:1, lineHeight:1.1 }}>{d.dept_code}</div>}
                  <div style={{ color:'rgba(255,255,255,0.75)', fontWeight:400, fontSize:12, marginTop:2 }}>{d.dept_name}</div>
                </div>
                <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                  {!d.is_active && <span style={{ background:'rgba(0,0,0,0.2)', color:'rgba(255,255,255,0.7)', borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:700 }}>INACTIVE</span>}
                  <button onClick={() => openEdit(d)} style={{ background:'rgba(255,255,255,0.15)', border:'none', color:'#fff', borderRadius:7, padding:'5px 12px', cursor:'pointer', fontSize:12, fontWeight:700 }}>Edit</button>
                </div>
              </div>
              <div style={{ padding:'14px 18px' }}>
                {d.description && (
                  <div style={{ fontSize:12, color:'#546e7a', marginBottom:12, lineHeight:1.5, borderBottom:'1px solid #f5f5f5', paddingBottom:10 }}>
                    {d.description}
                  </div>
                )}
                {/* Employee count mini-cards */}
                {(() => {
                  const { sponsored, outsourced, contract, total } = deptCounts(d.id)
                  return (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, marginBottom:14, paddingBottom:12, borderBottom:'1px solid #f5f5f5' }}>
                      {[
                        { label:'Sponsored', value:sponsored,  bg:'#e8f5e9', color:'#2e7d32', icon:'🏷️' },
                        { label:'Outsourced',value:outsourced, bg:'#fff3e0', color:'#e65100', icon:'🔗' },
                        { label:'Contract',  value:contract,   bg:'#e3f2fd', color:'#1565c0', icon:'📄' },
                        { label:'Total',     value:total,      bg:'#ede7f6', color:'#4527a0', icon:'👥' },
                      ].map(({ label, value, bg, color, icon }) => (
                        <div key={label} style={{ background:bg, borderRadius:8, padding:'8px 6px', textAlign:'center' }}>
                          <div style={{ fontSize:18, fontWeight:800, color, lineHeight:1 }}>{value}</div>
                          <div style={{ fontSize:9, fontWeight:700, color, marginTop:3, letterSpacing:0.3 }}>{icon} {label}</div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
                {[
                  { role:'Dept Head',       id:d.dept_head_id, icon:'👔' },
                  { role:'Project Manager', id:d.pm_id,        icon:'📋' },
                  { role:'Supervisor',      id:d.supervisor_id, icon:'🔧' },
                ].map(({ role, id, icon }) => (
                  <div key={role} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                    <span style={{ fontSize:14 }}>{icon}</span>
                    <div>
                      <div style={{ fontSize:10, color:'#aab2bd', fontWeight:700 }}>{role}</div>
                      <div style={{ fontSize:13, fontWeight:id ? 600 : 400, color:id ? '#1a2e3d' : '#ccc' }}>
                        {empName(id) || 'Not assigned'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ borderTop:'1px solid #f5f5f5', padding:'8px 18px', display:'flex', justifyContent:'flex-end' }}>
                <button onClick={() => toggleActive(d)} style={{ background:'none', border:'none', fontSize:11, color:'#aab2bd', cursor:'pointer', fontWeight:700 }}>
                  {d.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── PageBanner ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); setOpen(true) }}
        chapterL1={L1}
        chapterL2={L2}
        moduleColor={PRI}
        chapterLabel="Masters"
        formTitle={['New', 'Department', 'Creation']}
        steps={['Dept Details']}
        icon="🏛"
        description="Create departments like IT, Finance, Field Operations. Assign head, PM and supervisor after adding employees."
      />

      {open && (
        <DeptModal
          editing={editing}
          code={code} setCode={setCode}
          name={name} setName={setName}
          description={description} setDescription={setDescription}
          headId={headId} setHeadId={setHeadId}
          pmId={pmId} setPmId={setPmId}
          supId={supId} setSupId={setSupId}
          isActive={isActive} setIsActive={setIsActive}
          employees={employees} empLabel={empLabel}
          hasEmployees={hasEmployees}
          saving={saving}
          onSave={save}
          onClose={() => { setOpen(false); resetForm(); setEditing(null) }}
        />
      )}
    </div>
  )
}
