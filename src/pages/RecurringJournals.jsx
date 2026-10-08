import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// Recurring Journal Entries — Phase 15
//
// Tab 1 — Templates : define recurring JV templates (header + DR/CR lines)
// Tab 2 — Post Now  : run due templates → posts to ledger_entries
// Tab 3 — History   : view all RJV-* postings from ledger_entries
//
// Voucher numbering: RJV-YYYY-MM-NNNN  (e.g. RJV-2026-07-0001)
// next_run_date updated after each successful post
// ═══════════════════════════════════════════════════════════════════

const FREQUENCIES = [
  { code:'WEEKLY',    label:'Weekly',    days:7 },
  { code:'MONTHLY',   label:'Monthly',   days:null },
  { code:'QUARTERLY', label:'Quarterly', days:null },
  { code:'ANNUAL',    label:'Annual',    days:null },
  { code:'CUSTOM',    label:'Custom (specify days)', days:null },
]

const VOUCHER_TYPES = ['JV','ACR','RCL','ADJ']
const FREQ_COLOR = { WEEKLY:'#1565C0', MONTHLY:'#2e7d32', QUARTERLY:'#5A32D4', ANNUAL:'#e65100', CUSTOM:'#546e7a' }

const S = {
  card: { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:10 },
  btn:  (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  btnO: (c='#1a2e3d') => ({ background:'transparent', color:c, border:`1.5px solid ${c}`, borderRadius:8, padding:'7px 15px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:  { padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', width:'100%', boxSizing:'border-box', background:'#fff' },
  lbl:  { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
}

const fmt  = n => (+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtD = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'
const today = () => new Date().toISOString().slice(0,10)

// Calculate next run date after a posting
function calcNextDate(frequency, fromDate, intervalDays) {
  const d = new Date(fromDate + 'T00:00:00')
  switch (frequency) {
    case 'WEEKLY':    d.setDate(d.getDate() + 7); break
    case 'MONTHLY':   d.setMonth(d.getMonth() + 1); break
    case 'QUARTERLY': d.setMonth(d.getMonth() + 3); break
    case 'ANNUAL':    d.setFullYear(d.getFullYear() + 1); break
    case 'CUSTOM':    d.setDate(d.getDate() + (intervalDays||30)); break
    default:          d.setMonth(d.getMonth() + 1)
  }
  return d.toISOString().slice(0,10)
}

// Days until / overdue
const daysUntil = d => d ? Math.ceil((new Date(d) - new Date(today())) / 86400000) : null

// Next voucher number for this month
async function nextRJVNo(entityId) {
  const d    = new Date()
  const ym   = `RJV-${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-`
  const { data } = await supabase
    .from('ledger_entries')
    .select('voucher_number')
    .eq('entity_id', entityId)
    .like('voucher_number', `${ym}%`)
    .order('voucher_number', { ascending:false })
    .limit(1)
  const last = data?.length ? parseInt(data[0].voucher_number.replace(ym,''))||0 : 0
  return `${ym}${String(last+1).padStart(4,'0')}`
}

// ── Blank template line ──────────────────────────────────────────────────────
const blankLine = (order=0) => ({ _id:Math.random(), account_code:'', account_name:'', description:'', debit:'', credit:'', sort_order:order })

// ═══════════════════════════════════════════════════════════════════
// Template Form Modal
// ═══════════════════════════════════════════════════════════════════
function TemplateModal({ entityId, existing, coa, onClose, onSaved }) {
  const isEdit = !!existing
  const [hdr, setHdr] = useState(isEdit ? {
    name:         existing.name,
    description:  existing.description||'',
    voucher_type: existing.voucher_type||'JV',
    frequency:    existing.frequency||'MONTHLY',
    start_date:   existing.start_date||today(),
    next_run_date:existing.next_run_date||today(),
    end_date:     existing.end_date||'',
    interval_days:existing.interval_days||'',
    is_active:    existing.is_active!==false,
  } : {
    name:'', description:'', voucher_type:'JV', frequency:'MONTHLY',
    start_date:today(), next_run_date:today(), end_date:'', interval_days:'', is_active:true,
  })
  const [lines,   setLines]   = useState([blankLine(0), blankLine(1)])
  const [saving,  setSaving]  = useState(false)
  const [err,     setErr]     = useState('')
  const [linesLoaded, setLinesLoaded] = useState(false)

  // Load existing lines when editing
  useEffect(() => {
    if (!isEdit || linesLoaded) return
    supabase.from('recurring_template_lines')
      .select('*').eq('template_id', existing.id).order('sort_order')
      .then(({data})=>{
        if (data?.length) setLines(data.map(l=>({...l, _id:Math.random(), debit:l.debit||'', credit:l.credit||''})))
        setLinesLoaded(true)
      })
  }, [existing, isEdit, linesLoaded])

  const coaMap = Object.fromEntries(coa.map(a=>[a.account_code,a]))

  const set = (k,v) => setHdr(h=>({...h,[k]:v}))

  function updateLine(id, field, value) {
    setLines(ls=>ls.map(l=>{
      if (l._id !== id) return l
      const u = {...l,[field]:value}
      if (field==='account_code') {
        const a = coaMap[value]
        u.account_name = a?.account_name||''
        if (!l.description && a) u.description = a.account_name
      }
      if (field==='debit'  && value) u.credit = ''
      if (field==='credit' && value) u.debit  = ''
      return u
    }))
  }

  function addLine()     { setLines(ls=>[...ls, blankLine(ls.length)]) }
  function removeLine(id){ if (lines.length>2) setLines(ls=>ls.filter(l=>l._id!==id)) }

  const totalDr = lines.reduce((s,l)=>s+(+l.debit||0),0)
  const totalCr = lines.reduce((s,l)=>s+(+l.credit||0),0)
  const balanced = Math.abs(totalDr-totalCr)<0.005 && totalDr>0

  async function save() {
    setErr('')
    if (!hdr.name) { setErr('Template name is required.'); return }
    if (!balanced) { setErr(`Lines are out of balance: DR ${fmt(totalDr)} ≠ CR ${fmt(totalCr)}`); return }
    const filled = lines.filter(l=>l.account_code && ((+l.debit)||(+l.credit)))
    if (filled.length<2) { setErr('At least 2 account lines required.'); return }

    setSaving(true)
    const payload = {
      entity_id:    entityId,
      name:         hdr.name,
      description:  hdr.description,
      voucher_type: hdr.voucher_type,
      frequency:    hdr.frequency,
      start_date:   hdr.start_date,
      next_run_date:hdr.next_run_date,
      end_date:     hdr.end_date||null,
      interval_days:hdr.frequency==='CUSTOM'?+hdr.interval_days||null:null,
      is_active:    hdr.is_active,
    }

    let templateId = existing?.id
    if (isEdit) {
      const { error } = await supabase.from('recurring_templates').update(payload).eq('id', templateId)
      if (error) { setErr(error.message); setSaving(false); return }
      // Delete old lines and re-insert
      await supabase.from('recurring_template_lines').delete().eq('template_id', templateId)
    } else {
      const { data, error } = await supabase.from('recurring_templates').insert(payload).select().single()
      if (error) { setErr(error.message); setSaving(false); return }
      templateId = data.id
    }

    const linePayload = filled.map((l,i)=>({
      template_id:  templateId,
      sort_order:   i,
      account_code: l.account_code,
      account_name: l.account_name||coaMap[l.account_code]?.account_name||l.account_code,
      description:  l.description||'',
      debit:        +l.debit||0,
      credit:       +l.credit||0,
    }))
    const { error: le } = await supabase.from('recurring_template_lines').insert(linePayload)
    setSaving(false)
    if (le) { setErr('Template saved but lines failed: '+le.message); return }
    onSaved()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'#fff', borderRadius:16, padding:28, width:640,
        maxHeight:'92vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ fontWeight:800, fontSize:16, color:'#1a2e3d', marginBottom:20 }}>
          {isEdit?'Edit':'New'} Recurring Template
        </div>
        {err && <div style={{ background:'#ffebee',color:'#c62828',borderRadius:8,padding:'8px 12px',fontSize:12,marginBottom:12 }}>{err}</div>}

        {/* Header */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={S.lbl}>Template Name *</label>
            <input style={S.inp} value={hdr.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. Monthly Office Rent" />
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={S.lbl}>Narration (used in posted JV description)</label>
            <input style={S.inp} value={hdr.description} onChange={e=>set('description',e.target.value)} placeholder="e.g. Monthly rent — Al Nakheel Tower" />
          </div>
          <div>
            <label style={S.lbl}>Voucher Type</label>
            <select style={S.inp} value={hdr.voucher_type} onChange={e=>set('voucher_type',e.target.value)}>
              {VOUCHER_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={S.lbl}>Frequency</label>
            <select style={S.inp} value={hdr.frequency} onChange={e=>set('frequency',e.target.value)}>
              {FREQUENCIES.map(f=><option key={f.code} value={f.code}>{f.label}</option>)}
            </select>
          </div>
          {hdr.frequency==='CUSTOM' && (
            <div>
              <label style={S.lbl}>Repeat every N days</label>
              <input type="number" style={S.inp} value={hdr.interval_days} onChange={e=>set('interval_days',e.target.value)} placeholder="e.g. 14" />
            </div>
          )}
          <div>
            <label style={S.lbl}>Start Date</label>
            <input type="date" style={S.inp} value={hdr.start_date} onChange={e=>{ set('start_date',e.target.value); set('next_run_date',e.target.value) }} />
          </div>
          <div>
            <label style={S.lbl}>Next Run Date</label>
            <input type="date" style={S.inp} value={hdr.next_run_date} onChange={e=>set('next_run_date',e.target.value)} />
          </div>
          <div>
            <label style={S.lbl}>End Date (optional)</label>
            <input type="date" style={S.inp} value={hdr.end_date} onChange={e=>set('end_date',e.target.value)} />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:20 }}>
            <input type="checkbox" checked={hdr.is_active} onChange={e=>set('is_active',e.target.checked)} id="is_active" />
            <label htmlFor="is_active" style={{ fontSize:12, cursor:'pointer' }}>Active (will appear in Post Now)</label>
          </div>
        </div>

        {/* Lines */}
        <div style={{ fontWeight:700, fontSize:12, color:'#1a2e3d', marginBottom:8 }}>Journal Lines</div>
        <div style={{ border:'1px solid #e0e0e0', borderRadius:8, overflow:'hidden', marginBottom:12 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                <th style={{ padding:'7px 10px', textAlign:'left' }}>Account</th>
                <th style={{ padding:'7px 10px', textAlign:'left' }}>Description</th>
                <th style={{ padding:'7px 10px', textAlign:'right', width:110 }}>Debit</th>
                <th style={{ padding:'7px 10px', textAlign:'right', width:110 }}>Credit</th>
                <th style={{ width:28 }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l,i)=>(
                <tr key={l._id} style={{ borderBottom:'1px solid #f0f0f0', background:i%2?'#fafafa':'#fff' }}>
                  <td style={{ padding:'4px 6px' }}>
                    <select style={{ ...S.inp, fontSize:11 }} value={l.account_code}
                      onChange={e=>updateLine(l._id,'account_code',e.target.value)}>
                      <option value="">— account —</option>
                      {coa.map(a=><option key={a.account_code} value={a.account_code}>{a.account_code} {a.account_name}</option>)}
                    </select>
                  </td>
                  <td style={{ padding:'4px 6px' }}>
                    <input style={{ ...S.inp, fontSize:11 }} value={l.description}
                      onChange={e=>updateLine(l._id,'description',e.target.value)} placeholder="Narration" />
                  </td>
                  <td style={{ padding:'4px 6px' }}>
                    <input type="number" min="0" step="0.01"
                      style={{ ...S.inp, textAlign:'right', fontFamily:'monospace', fontSize:11, background:l.debit?'#e8f5e9':'#fff' }}
                      value={l.debit} onChange={e=>updateLine(l._id,'debit',e.target.value)} placeholder="0.00" />
                  </td>
                  <td style={{ padding:'4px 6px' }}>
                    <input type="number" min="0" step="0.01"
                      style={{ ...S.inp, textAlign:'right', fontFamily:'monospace', fontSize:11, background:l.credit?'#fff8e1':'#fff' }}
                      value={l.credit} onChange={e=>updateLine(l._id,'credit',e.target.value)} placeholder="0.00" />
                  </td>
                  <td style={{ padding:'4px 4px', textAlign:'center' }}>
                    {lines.length>2 && (
                      <button onClick={()=>removeLine(l._id)}
                        style={{ background:'none',border:'none',color:'#ef9a9a',fontSize:15,cursor:'pointer' }}>×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} style={{ padding:'6px 10px', borderTop:'1px dashed #e0e0e0' }}>
                  <button onClick={addLine} style={{ ...S.btnO('#546e7a'), fontSize:10, padding:'4px 10px' }}>+ Add Line</button>
                </td>
              </tr>
              <tr style={{ background: balanced?'#e8f5e9':totalDr===0?'#f5f7fa':'#ffebee' }}>
                <td colSpan={2} style={{ padding:'7px 10px', fontWeight:700, fontSize:12 }}>
                  {totalDr===0?'Enter amounts':balanced?'✅ Balanced':'⚠️ Out of balance'}
                </td>
                <td style={{ padding:'7px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#1565C0' }}>{fmt(totalDr)}</td>
                <td style={{ padding:'7px 10px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#c62828' }}>{fmt(totalCr)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={S.btnO()}>Cancel</button>
          <button onClick={save} disabled={saving||!balanced}
            style={{ ...S.btn('#2e7d32'), opacity:(!balanced)?0.5:1, cursor:(!balanced)?'not-allowed':'pointer' }}>
            {saving?'Saving…':isEdit?'Save Changes':'Create Template'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 1 — Templates List
// ═══════════════════════════════════════════════════════════════════
function TemplatesTab({ entityId, coa, onRefresh }) {
  const [templates, setTemplates] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [expanded,  setExpanded]  = useState({})
  const [linesMap,  setLinesMap]  = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('recurring_templates')
      .select('*').eq('entity_id', entityId).order('name')
    setTemplates(data||[])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  async function loadLines(templateId) {
    if (linesMap[templateId]) return
    const { data } = await supabase.from('recurring_template_lines')
      .select('*').eq('template_id', templateId).order('sort_order')
    setLinesMap(m=>({...m,[templateId]:data||[]}))
  }

  async function toggleActive(t) {
    await supabase.from('recurring_templates').update({ is_active:!t.is_active }).eq('id',t.id)
    load()
  }

  async function deleteTemplate(id) {
    if (!window.confirm('Delete this template? This cannot be undone.')) return
    await supabase.from('recurring_templates').delete().eq('id',id)
    load()
    onRefresh()
  }

  function toggleExpand(id) {
    setExpanded(x=>({...x,[id]:!x[id]}))
    loadLines(id)
  }

  const active   = templates.filter(t=>t.is_active)
  const inactive = templates.filter(t=>!t.is_active)

  function TemplateRow({ t }) {
    const days  = daysUntil(t.next_run_date)
    const overdue = days!==null && days<0
    const dueSoon = days!==null && days>=0 && days<=3
    const fc    = FREQ_COLOR[t.frequency]||'#546e7a'
    const lines = linesMap[t.id]
    const totalAmt = lines ? lines.reduce((s,l)=>s+(+l.debit||0),0) : null

    return (
      <>
        <tr style={{ borderBottom:'1px solid #f5f5f5', background:overdue?'#fff8f8':'#fff' }}>
          <td style={{ padding:'10px 14px' }}>
            <div style={{ fontWeight:700, color:'#1a2e3d', marginBottom:2 }}>{t.name}</div>
            {t.description && <div style={{ fontSize:11, color:'#6b7c93' }}>{t.description}</div>}
          </td>
          <td style={{ padding:'10px 14px' }}>
            <span style={{ padding:'2px 8px', borderRadius:8, fontSize:10, fontWeight:700, background:fc+'18', color:fc }}>
              {t.frequency}
            </span>
          </td>
          <td style={{ padding:'10px 14px', fontSize:11 }}>
            <span style={{ color:overdue?'#c62828':dueSoon?'#f57f17':'#2e7d32', fontWeight:overdue||dueSoon?700:400 }}>
              {fmtD(t.next_run_date)}
            </span>
            {overdue  && <div style={{ fontSize:9,color:'#c62828' }}>OVERDUE {Math.abs(days)}d</div>}
            {dueSoon  && <div style={{ fontSize:9,color:'#f57f17' }}>DUE IN {days}d</div>}
          </td>
          <td style={{ padding:'10px 14px', fontSize:11, color:'#6b7c93' }}>{fmtD(t.last_run_date)}</td>
          <td style={{ padding:'10px 14px' }}>
            <span style={{ padding:'2px 8px', borderRadius:8, fontSize:10, fontWeight:700,
              background:t.voucher_type==='ACR'?'#e8f5e9':t.voucher_type==='RCL'?'#ede7f6':'#e3f2fd',
              color:t.voucher_type==='ACR'?'#2e7d32':t.voucher_type==='RCL'?'#5A32D4':'#1565C0' }}>
              {t.voucher_type}
            </span>
          </td>
          <td style={{ padding:'10px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12, fontWeight:600 }}>
            {totalAmt!==null ? `${fmt(totalAmt)} SAR` : '—'}
          </td>
          <td style={{ padding:'10px 14px' }}>
            <div style={{ display:'flex', gap:4, alignItems:'center' }}>
              <button onClick={()=>toggleExpand(t.id)}
                style={{ fontSize:10,padding:'3px 8px',borderRadius:6,border:'1px solid #dde3ec',background:'#f5f7fa',cursor:'pointer' }}>
                {expanded[t.id]?'▲ Lines':'▼ Lines'}
              </button>
              <button onClick={()=>{ setEditing(t); setShowModal(true) }}
                style={{ fontSize:10,padding:'3px 8px',borderRadius:6,border:'1px solid #dde3ec',background:'#f5f7fa',cursor:'pointer' }}>
                Edit
              </button>
              <button onClick={()=>toggleActive(t)}
                style={{ fontSize:10,padding:'3px 8px',borderRadius:6,border:`1px solid ${t.is_active?'#ef9a9a':'#a5d6a7'}`,
                  background:t.is_active?'#ffebee':'#e8f5e9',cursor:'pointer',color:t.is_active?'#c62828':'#2e7d32' }}>
                {t.is_active?'Pause':'Resume'}
              </button>
              <button onClick={()=>deleteTemplate(t.id)}
                style={{ fontSize:10,padding:'3px 8px',borderRadius:6,border:'1px solid #ef9a9a',background:'#ffebee',cursor:'pointer',color:'#c62828' }}>
                Del
              </button>
            </div>
          </td>
        </tr>
        {expanded[t.id] && (
          <tr style={{ background:'#f5f7fa' }}>
            <td colSpan={7} style={{ padding:'8px 28px 12px' }}>
              {!lines ? (
                <span style={{ fontSize:11,color:'#6b7c93' }}>Loading lines…</span>
              ) : lines.length===0 ? (
                <span style={{ fontSize:11,color:'#aab2bd' }}>No lines found.</span>
              ) : (
                <table style={{ fontSize:11, borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ color:'#6b7c93' }}>
                      <th style={{ padding:'3px 12px 3px 0',textAlign:'left' }}>Account</th>
                      <th style={{ padding:'3px 12px',textAlign:'left' }}>Description</th>
                      <th style={{ padding:'3px 12px',textAlign:'right' }}>Debit</th>
                      <th style={{ padding:'3px 0',textAlign:'right' }}>Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l,i)=>(
                      <tr key={i}>
                        <td style={{ padding:'3px 12px 3px 0',fontFamily:'monospace',color:'#546e7a' }}>{l.account_code} {l.account_name}</td>
                        <td style={{ padding:'3px 12px',color:'#6b7c93' }}>{l.description}</td>
                        <td style={{ padding:'3px 12px',textAlign:'right',fontFamily:'monospace',color:'#1565C0' }}>{l.debit?fmt(l.debit):''}</td>
                        <td style={{ padding:'3px 0',textAlign:'right',fontFamily:'monospace',color:'#c62828' }}>{l.credit?fmt(l.credit):''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </td>
          </tr>
        )}
      </>
    )
  }

  const TableHeader = () => (
    <thead>
      <tr style={{ background:'#1a2e3d', color:'#fff' }}>
        <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Template Name</th>
        <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11, width:100 }}>Frequency</th>
        <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11, width:130 }}>Next Run</th>
        <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11, width:130 }}>Last Run</th>
        <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11, width:70 }}>Type</th>
        <th style={{ padding:'9px 14px', textAlign:'right', fontSize:11, width:120 }}>Amount</th>
        <th style={{ padding:'9px 14px', width:240 }}></th>
      </tr>
    </thead>
  )

  return (
    <>
      <div style={{ ...S.card, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:12, color:'#6b7c93' }}>
          {active.length} active · {inactive.length} paused
        </div>
        <button onClick={()=>{ setEditing(null); setShowModal(true) }} style={S.btn('#2e7d32')}>
          + New Template
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading…</div>
      ) : templates.length===0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>
          No recurring templates yet.<br/>
          <span style={{ fontSize:12 }}>Create one for monthly rent, insurance, depreciation, etc.</span>
        </div>
      ) : (
        <>
          {active.length>0 && (
            <div style={{ ...S.card, padding:0, overflow:'hidden', marginBottom:12 }}>
              <div style={{ padding:'8px 14px', background:'#e8f5e9', fontWeight:800, fontSize:11, color:'#2e7d32', letterSpacing:1 }}>
                ✅ ACTIVE TEMPLATES ({active.length})
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <TableHeader />
                <tbody>{active.map(t=><TemplateRow key={t.id} t={t} />)}</tbody>
              </table>
            </div>
          )}
          {inactive.length>0 && (
            <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
              <div style={{ padding:'8px 14px', background:'#f5f5f5', fontWeight:800, fontSize:11, color:'#757575', letterSpacing:1 }}>
                ⏸ PAUSED TEMPLATES ({inactive.length})
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <TableHeader />
                <tbody>{inactive.map(t=><TemplateRow key={t.id} t={t} />)}</tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showModal && (
        <TemplateModal
          entityId={entityId} existing={editing} coa={coa}
          onClose={()=>{ setShowModal(false); setEditing(null) }}
          onSaved={()=>{ setShowModal(false); setEditing(null); load(); onRefresh() }}
        />
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 2 — Post Now
// ═══════════════════════════════════════════════════════════════════
function PostNowTab({ entityId, onPosted }) {
  const [due,      setDue]      = useState([])
  const [lines,    setLines]    = useState({})   // templateId → lines[]
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState({})
  const [postDate, setPostDate] = useState(today())
  const [posting,  setPosting]  = useState(false)
  const [results,  setResults]  = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    // Active templates where next_run_date <= today (or within 3 days ahead for convenience)
    const lookahead = new Date(); lookahead.setDate(lookahead.getDate()+3)
    const { data: temps } = await supabase.from('recurring_templates')
      .select('*').eq('entity_id', entityId).eq('is_active', true)
      .lte('next_run_date', lookahead.toISOString().slice(0,10))
      .order('next_run_date')

    const tlist = (temps||[]).filter(t=>!t.end_date || t.next_run_date<=t.end_date)
    setDue(tlist)

    // Pre-load lines for all due templates
    if (tlist.length) {
      const { data: ldata } = await supabase.from('recurring_template_lines')
        .select('*').in('template_id', tlist.map(t=>t.id)).order('sort_order')
      const lmap = {}
      for (const l of (ldata||[])) {
        if (!lmap[l.template_id]) lmap[l.template_id] = []
        lmap[l.template_id].push(l)
      }
      setLines(lmap)
    }

    // Select all overdue by default
    const sel = {}
    for (const t of (tlist||[])) {
      if (daysUntil(t.next_run_date)<=0) sel[t.id]=true
    }
    setSelected(sel)
    setResults([])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  async function postOne(t) {
    const tLines = lines[t.id]||[]
    if (!tLines.length) return { ok:false, msg:'No lines defined' }

    const vNo = await nextRJVNo(entityId)
    const desc = t.description || t.name

    const payload = tLines.map(l=>({
      entity_id:    entityId,
      entry_date:   postDate,
      voucher_type: t.voucher_type,
      voucher_number: vNo,
      account_code: l.account_code,
      account_name: l.account_name,
      debit:        +l.debit||0,
      credit:       +l.credit||0,
      description:  l.description || desc,
    }))

    const { error } = await supabase.from('ledger_entries').insert(payload)
    if (error) return { ok:false, msg:error.message, vNo }

    // Advance next_run_date
    const nextDate = calcNextDate(t.frequency, t.next_run_date, t.interval_days)
    await supabase.from('recurring_templates').update({
      last_run_date: postDate,
      next_run_date: nextDate,
    }).eq('id', t.id)

    return { ok:true, vNo, nextDate }
  }

  async function postSelected() {
    const toPost = due.filter(t=>selected[t.id])
    if (!toPost.length) return
    setPosting(true)
    const res = []
    for (const t of toPost) {
      const r = await postOne(t)
      res.push({ name:t.name, ...r })
    }
    setResults(res)
    setPosting(false)
    load()
    onPosted()
  }

  const selectedCount = Object.values(selected).filter(Boolean).length

  return (
    <>
      <div style={{ ...S.card, display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div>
          <label style={S.lbl}>Post Date</label>
          <input type="date" style={{ ...S.inp, width:160 }} value={postDate} onChange={e=>setPostDate(e.target.value)} />
        </div>
        <div style={{ flex:1, fontSize:11, color:'#6b7c93', alignSelf:'flex-end', paddingBottom:2 }}>
          {due.length} template{due.length!==1?'s':''} due · {selectedCount} selected
        </div>
        <button onClick={()=>setSelected(Object.fromEntries(due.map(t=>[t.id,true])))}
          style={S.btnO()}>Select All</button>
        <button onClick={postSelected} disabled={posting||selectedCount===0}
          style={{ ...S.btn('#2e7d32'), opacity:selectedCount===0?0.5:1 }}>
          {posting?'Posting…':`▶ Post ${selectedCount} Template${selectedCount!==1?'s':''}`}
        </button>
      </div>

      {/* Results banner */}
      {results.length>0 && (
        <div style={{ ...S.card, background:'#e8f5e9', border:'1px solid #a5d6a7', marginBottom:10 }}>
          <div style={{ fontWeight:700, fontSize:13, color:'#2e7d32', marginBottom:8 }}>Posting complete</div>
          {results.map((r,i)=>(
            <div key={i} style={{ fontSize:12, color:r.ok?'#2e7d32':'#c62828', marginBottom:3 }}>
              {r.ok?'✅':'❌'} {r.name} {r.ok?`→ ${r.vNo} (next: ${fmtD(r.nextDate)})`:r.msg}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading…</div>
      ) : due.length===0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:60 }}>
          <div style={{ fontSize:32, marginBottom:12 }}>✅</div>
          <div style={{ fontWeight:700, color:'#2e7d32' }}>No templates due right now.</div>
          <div style={{ fontSize:12, color:'#aab2bd', marginTop:6 }}>Check back later or go to Templates to adjust schedules.</div>
        </div>
      ) : (
        <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                <th style={{ padding:'9px 14px', width:40 }}>
                  <input type="checkbox"
                    checked={selectedCount===due.length && due.length>0}
                    onChange={e=>setSelected(e.target.checked?Object.fromEntries(due.map(t=>[t.id,true])):{})} />
                </th>
                <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Template</th>
                <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11, width:100 }}>Type</th>
                <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11, width:120 }}>Due Date</th>
                <th style={{ padding:'9px 14px', textAlign:'right', fontSize:11, width:130 }}>Amount (SAR)</th>
                <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Lines</th>
              </tr>
            </thead>
            <tbody>
              {due.map((t,i)=>{
                const days   = daysUntil(t.next_run_date)
                const overdue= days!==null && days<0
                const tLines = lines[t.id]||[]
                const amt    = tLines.reduce((s,l)=>s+(+l.debit||0),0)
                return (
                  <tr key={t.id} style={{ borderBottom:'1px solid #f5f5f5', background:overdue?'#fff8f8':i%2?'#fafafa':'#fff' }}>
                    <td style={{ padding:'10px 14px', textAlign:'center' }}>
                      <input type="checkbox" checked={!!selected[t.id]} onChange={e=>setSelected(s=>({...s,[t.id]:e.target.checked}))} />
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ fontWeight:600 }}>{t.name}</div>
                      {t.description && <div style={{ fontSize:11, color:'#6b7c93' }}>{t.description}</div>}
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <span style={{ fontSize:10, padding:'2px 7px', borderRadius:6, background:'#e3f2fd', color:'#1565C0', fontWeight:700 }}>
                        {t.voucher_type}
                      </span>
                    </td>
                    <td style={{ padding:'10px 14px' }}>
                      <span style={{ color:overdue?'#c62828':days===0?'#f57f17':'#2e7d32', fontWeight:overdue?700:400 }}>
                        {fmtD(t.next_run_date)}
                      </span>
                      {overdue && <div style={{ fontSize:9,color:'#c62828' }}>{Math.abs(days)}d overdue</div>}
                      {days===0 && <div style={{ fontSize:9,color:'#f57f17' }}>Due today</div>}
                    </td>
                    <td style={{ padding:'10px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700 }}>
                      {fmt(amt)}
                    </td>
                    <td style={{ padding:'10px 14px', fontSize:11, color:'#6b7c93' }}>
                      {tLines.slice(0,2).map((l,j)=>(
                        <div key={j}>{l.account_code} {l.debit?`DR ${fmt(l.debit)}`:`CR ${fmt(l.credit)}`}</div>
                      ))}
                      {tLines.length>2 && <div style={{ color:'#aab2bd' }}>+{tLines.length-2} more lines</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 3 — History
// ═══════════════════════════════════════════════════════════════════
function HistoryTab({ entityId, refreshKey }) {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [from,    setFrom]    = useState(()=>{ const d=new Date(); d.setMonth(d.getMonth()-3); return d.toISOString().slice(0,10) })
  const [to,      setTo]      = useState(today())
  const [expand,  setExpand]  = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('ledger_entries')
      .select('voucher_number, voucher_type, entry_date, account_code, account_name, debit, credit, description')
      .eq('entity_id', entityId)
      .like('voucher_number', 'RJV-%')
      .gte('entry_date', from)
      .lte('entry_date', to)
      .order('entry_date', { ascending:false })
      .order('voucher_number', { ascending:false })

    // Group by voucher
    const map = {}
    for (const r of (data||[])) {
      if (!map[r.voucher_number]) map[r.voucher_number] = { voucher_number:r.voucher_number, voucher_type:r.voucher_type, entry_date:r.entry_date, lines:[] }
      map[r.voucher_number].lines.push(r)
    }
    setRows(Object.values(map).sort((a,b)=>b.entry_date.localeCompare(a.entry_date)))
    setLoading(false)
  }, [entityId, from, to, refreshKey])

  useEffect(() => { load() }, [load])

  return (
    <>
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div><label style={S.lbl}>From</label>
          <input type="date" style={{ ...S.inp, width:150 }} value={from} onChange={e=>setFrom(e.target.value)} /></div>
        <div><label style={S.lbl}>To</label>
          <input type="date" style={{ ...S.inp, width:150 }} value={to} onChange={e=>setTo(e.target.value)} /></div>
        <button onClick={load} style={{ ...S.btn(), alignSelf:'flex-end' }}>↻ Load</button>
        <span style={{ alignSelf:'flex-end', fontSize:11, color:'#6b7c93' }}>
          {rows.length} posting{rows.length!==1?'s':''} found
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading…</div>
      ) : rows.length===0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>No recurring postings in this period.</div>
      ) : (
        rows.map(v=>{
          const totalDr = v.lines.reduce((s,l)=>s+(+l.debit||0),0)
          return (
            <div key={v.voucher_number} style={{ ...S.card, padding:0, overflow:'hidden', marginBottom:8, borderLeft:'4px solid #2e7d32' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 16px', cursor:'pointer',
                background:expand[v.voucher_number]?'#f5f7fa':'#fff' }}
                onClick={()=>setExpand(x=>({...x,[v.voucher_number]:!x[v.voucher_number]}))}>
                <span style={{ fontFamily:'monospace', fontWeight:800, fontSize:12, color:'#2e7d32' }}>{v.voucher_number}</span>
                <span style={{ fontSize:10, padding:'2px 7px', borderRadius:6, background:'#e3f2fd', color:'#1565C0', fontWeight:700 }}>{v.voucher_type}</span>
                <span style={{ fontSize:12, color:'#6b7c93' }}>{fmtD(v.entry_date)}</span>
                <span style={{ marginLeft:'auto', fontFamily:'monospace', fontWeight:700 }}>SAR {fmt(totalDr)}</span>
                <span style={{ fontSize:11, color:'#aab2bd' }}>{v.lines.length} lines</span>
                <span style={{ color:'#aab2bd', fontSize:12 }}>{expand[v.voucher_number]?'▲':'▼'}</span>
              </div>
              {expand[v.voucher_number] && (
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                  <tbody>
                    {v.lines.map((l,i)=>(
                      <tr key={i} style={{ borderBottom:'1px solid #f5f5f5', background:i%2?'#fafafa':'#fff' }}>
                        <td style={{ padding:'6px 16px', fontFamily:'monospace', color:'#546e7a', width:200 }}>{l.account_code} {l.account_name}</td>
                        <td style={{ padding:'6px 16px', color:'#6b7c93' }}>{l.description}</td>
                        <td style={{ padding:'6px 16px', textAlign:'right', fontFamily:'monospace', color:'#1565C0' }}>{l.debit?fmt(l.debit):''}</td>
                        <td style={{ padding:'6px 16px', textAlign:'right', fontFamily:'monospace', color:'#c62828' }}>{l.credit?fmt(l.credit):''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        })
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════
export default function RecurringJournals({ entityId }) {
  const [tab,     setTab]     = useState('templates')
  const [coa,     setCoa]     = useState([])
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    if (!entityId) return
    supabase.from('chart_of_accounts')
      .select('account_code,account_name,account_type')
      .eq('entity_id', entityId).eq('is_active', true).order('account_code')
      .then(({data})=>setCoa(data||[]))
  }, [entityId])

  const TABS = [
    { key:'templates', label:'📋 Templates' },
    { key:'post',      label:'▶ Post Now' },
    { key:'history',   label:'📜 History' },
  ]

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>
        Define monthly templates — rent, insurance, accruals — and post them all in one click
      </div>

      <div style={{ display:'flex', gap:4, marginBottom:14, borderBottom:'2px solid #f0f4f8' }}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{ padding:'8px 18px', fontSize:12, fontWeight:700, cursor:'pointer', border:'none',
              background:'transparent', borderBottom:tab===t.key?'3px solid #1a2e3d':'3px solid transparent',
              color:tab===t.key?'#1a2e3d':'#6b7c93', marginBottom:-2 }}>
            {t.label}
          </button>
        ))}
      </div>

      {!entityId ? (
        <div style={{ textAlign:'center', padding:80, color:'#aab2bd' }}>Select an entity to continue.</div>
      ) : (
        <>
          {tab==='templates' && <TemplatesTab entityId={entityId} coa={coa} onRefresh={()=>setRefresh(r=>r+1)} />}
          {tab==='post'      && <PostNowTab   entityId={entityId} onPosted={()=>setRefresh(r=>r+1)} />}
          {tab==='history'   && <HistoryTab   entityId={entityId} refreshKey={refresh} />}
        </>
      )}
    </div>
  )
}
