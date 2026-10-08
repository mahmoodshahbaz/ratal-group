/**
 * FIELD OVERTIME FORM
 * Input: Time In + Time Out only
 * System calculates: hours, OT rate (Basic ÷ 30 ÷ 8 × 1.5), total amount
 */

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { postToSheet } from '../lib/googleSheets'

const S = {
  card:  { background:'#fff', borderRadius:20, padding:28, width:'100%', maxWidth:440, boxShadow:'0 4px 20px rgba(0,0,0,0.10)' },
  title: { fontSize:20, fontWeight:800, color:'#1a2540', marginBottom:20 },
  label: { display:'block', fontSize:12, color:'#6b7c93', fontWeight:700, marginBottom:5 },
  inp:   { width:'100%', padding:'13px', borderRadius:10, border:'1.5px solid #dde3ec', fontSize:17, outline:'none', fontFamily:'inherit', boxSizing:'border-box', textAlign:'center' },
  row:   { display:'flex', gap:12, marginBottom:16 },
  col:   { flex:1 },
  calc:  { background:'#f8fafd', borderRadius:12, padding:16, marginBottom:20 },
  bigBtn:{ background:'linear-gradient(135deg,#6a1b9a,#8e24aa)', color:'#fff', border:'none', borderRadius:14, padding:'16px', fontSize:16, fontWeight:800, cursor:'pointer', width:'100%' },
  chip:  (active) => ({ padding:'8px 16px', borderRadius:20, border:`2px solid ${active?'#6a1b9a':'#dde3ec'}`, background: active?'#f3e5f5':'#fff', color: active?'#6a1b9a':'#6b7c93', cursor:'pointer', fontSize:13, fontWeight:700 }),
}

const WORK_TYPES = [
  { key:'NORMAL',  label:'Normal Day',  mult:1.5 },
  { key:'FRIDAY',  label:'Friday',      mult:1.5 },
  { key:'HOLIDAY', label:'Public Holiday', mult:2.0 },
]

function timeDiff(t1, t2) {
  if (!t1 || !t2) return 0
  const [h1, m1] = t1.split(':').map(Number)
  const [h2, m2] = t2.split(':').map(Number)
  let diff = (h2 * 60 + m2) - (h1 * 60 + m1)
  if (diff < 0) diff += 24 * 60   // next day
  return diff / 60
}

export default function FieldOvertime({ person, assignment }) {
  const [timeIn,    setTimeIn]    = useState('')
  const [timeOut,   setTimeOut]   = useState('')
  const [workType,  setWorkType]  = useState('NORMAL')
  const [notes,     setNotes]     = useState('')
  const [submitting,setSubmitting]= useState(false)
  const [submitted, setSubmitted] = useState(false)

  const basic    = parseFloat(person?.basic_salary || 0)
  const hourRate = basic / 30 / 8
  const hours    = timeDiff(timeIn, timeOut)
  const mult     = WORK_TYPES.find(w=>w.key===workType)?.mult || 1.5
  const otRate   = hourRate * mult
  const total    = otRate * hours

  async function submit() {
    if (!timeIn || !timeOut) { alert('Enter time in and time out'); return }
    if (hours <= 0)          { alert('Time out must be after time in'); return }
    setSubmitting(true)

    const today = new Date().toISOString().split('T')[0]
    const otPayload = {
      employee_id:    person.id,
      overtime_date:  today,
      start_time:     timeIn,
      end_time:       timeOut,
      total_hours:    parseFloat(hours.toFixed(2)),
      ot_rate:        parseFloat(otRate.toFixed(2)),
      total_amount:   parseFloat(total.toFixed(2)),
      work_type:      workType,
      basic_salary:   basic,
      multiplier:     mult,
      ot_amount:      parseFloat(total.toFixed(2)),
      site_master_id: assignment?.site_master_id || null,
      sm_id:          assignment?.sm_id || assignment?.site_masters?.sm_id || null,
      notes:          notes || null,
      status:         'PENDING',
    }
    const [{ error }] = await Promise.all([
      supabase.from('overtime_requests').insert(otPayload),
      postToSheet('overtime', otPayload),
    ])

    setSubmitting(false)
    if (error) { alert(error.message); return }
    setSubmitted(true)
  }

  if (submitted) return (
    <div style={{ ...S.card, textAlign:'center' }}>
      <div style={{ fontSize:56 }}>✅</div>
      <div style={{ fontSize:20, fontWeight:800, color:'#6a1b9a', marginTop:12, marginBottom:6 }}>OT Submitted!</div>
      <div style={{ color:'#6b7c93' }}>{hours.toFixed(1)} hrs · SAR {total.toFixed(2)}</div>
    </div>
  )

  return (
    <div style={S.card}>
      <div style={S.title}>⏱️ Overtime</div>

      {/* Work type */}
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {WORK_TYPES.map(w => (
          <button key={w.key} style={S.chip(workType===w.key)} onClick={() => setWorkType(w.key)}>
            {w.label}
          </button>
        ))}
      </div>

      {/* Time In / Out */}
      <div style={S.row}>
        <div style={S.col}>
          <label style={S.label}>Time In</label>
          <input type="time" style={S.inp} value={timeIn} onChange={e => setTimeIn(e.target.value)} />
        </div>
        <div style={S.col}>
          <label style={S.label}>Time Out</label>
          <input type="time" style={S.inp} value={timeOut} onChange={e => setTimeOut(e.target.value)} />
        </div>
      </div>

      {/* Auto-calculations */}
      {hours > 0 && (
        <div style={S.calc}>
          <div style={{ fontSize:11, color:'#6b7c93', fontWeight:800, marginBottom:10, letterSpacing:1 }}>CALCULATED BY SYSTEM</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {[
              { label:'Total Hours',  value:`${hours.toFixed(2)} hrs` },
              { label:'OT Rate',      value:`SAR ${otRate.toFixed(2)}/hr` },
              { label:'Multiplier',   value:`×${mult} (${workType})` },
              { label:'Total Amount', value:`SAR ${total.toFixed(2)}`, bold:true, color:'#6a1b9a' },
            ].map(({ label, value, bold, color }) => (
              <div key={label} style={{ background:'#fff', borderRadius:8, padding:'8px 10px' }}>
                <div style={{ fontSize:10, color:'#aab2bd', marginBottom:2 }}>{label}</div>
                <div style={{ fontSize:14, fontWeight: bold?800:600, color: color||'#1a2540' }}>{value}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize:10, color:'#aab2bd', marginTop:8, textAlign:'center' }}>
            Formula: Basic (SAR {basic.toLocaleString()}) ÷ 30 ÷ 8 × {mult} × {hours.toFixed(2)} hrs
          </div>
        </div>
      )}

      {/* Site */}
      {assignment && (
        <div style={{ marginBottom:14 }}>
          <label style={S.label}>Site (auto-assigned)</label>
          <input style={{ ...S.inp, background:'#f8fafd', color:'#6a1b9a', fontWeight:700, fontSize:14, textAlign:'left', padding:'11px 13px' }}
            value={assignment.site_masters?.site_name || assignment.sm_id || '—'} readOnly />
        </div>
      )}

      {/* Notes */}
      <div style={{ marginBottom:20 }}>
        <label style={S.label}>Notes (optional)</label>
        <textarea rows={2} style={{ ...S.inp, resize:'none', textAlign:'left', fontSize:14 }}
          placeholder="What work was done during OT…"
          value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <button style={S.bigBtn} onClick={submit} disabled={submitting || hours <= 0}>
        {submitting ? 'Submitting…' : 'Submit Overtime'}
      </button>
    </div>
  )
}
