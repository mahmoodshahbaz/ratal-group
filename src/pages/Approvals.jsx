import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Unified Approvals Inbox
// Shows everything pending the current user's approval in one place:
// Money Requests | Purchase Orders | Overtime | Food Allowance | Leave | Payroll Runs

const fmt = d => d ? new Date(d).toLocaleDateString('en-GB') : '—'
const SAR = v => `SAR ${(+v||0).toLocaleString('en',{minimumFractionDigits:0,maximumFractionDigits:0})}`

const MODULE_META = {
  money_requests:  { label:'Money Request',   icon:'💰', color:'#6a1b9a', table:'money_requests',  amtCol:'amount',       approveStatus:'ADMIN_APPROVED', rejectStatus:'REJECTED' },
  purchase_orders: { label:'Purchase Order',  icon:'📦', color:'#1565C0', table:'po_requests',     amtCol:'total_amount', approveStatus:'APPROVED',       rejectStatus:'REJECTED' },
  overtime:        { label:'Overtime',        icon:'⏱', color:'#e65100', table:'overtime_requests',amtCol:'hours',        approveStatus:'APPROVED',       rejectStatus:'REJECTED' },
  food_allowance:  { label:'Food Allowance',  icon:'🍽', color:'#2e7d32', table:'food_allowances', amtCol:'total_amount', approveStatus:'APPROVED',       rejectStatus:'REJECTED' },
  vacations:       { label:'Leave Request',   icon:'🏖', color:'#1565C0', table:'vacations',       amtCol:'days_requested',approveStatus:'APPROVED',      rejectStatus:'REJECTED' },
  payroll_runs:    { label:'Payroll Run',     icon:'💵', color:'#1a2e3d', table:'payroll_runs',    amtCol:'total_net',    approveStatus:'APPROVED',       rejectStatus:'REJECTED' },
}

const S = {
  card:    { background:'#fff', borderRadius:14, padding:'18px 22px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:14 },
  btn:     (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }),
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' },
  modal:   { background:'#fff', borderRadius:16, padding:28, width:520, maxWidth:'95vw', boxShadow:'0 8px 40px rgba(0,0,0,0.18)' },
  inp:     { width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit' },
}

export default function Approvals({ entityId, role }) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter,  setFilter]  = useState('all') // all | money_requests | purchase_orders | etc
  const [comment, setComment] = useState({ open:false, item:null, action:'', text:'' })
  const [saving,  setSaving]  = useState(false)
  const [flash,   setFlash]   = useState(null)

  useEffect(() => { if (entityId) load() }, [entityId, role])

  async function load() {
    setLoading(true)

    // Determine which statuses this role can approve
    const pendingStatuses = {
      SUPERADMIN:      { money_requests:['PENDING','PM_APPROVED'], purchase_orders:['SUBMITTED','PM_APPROVED'], overtime:['PENDING'], food_allowance:['PENDING'], vacations:['PENDING'], payroll_runs:['DRAFT'] },
      ADMIN:           { money_requests:['PENDING','PM_APPROVED'], purchase_orders:['SUBMITTED','PM_APPROVED'], overtime:['PENDING'], food_allowance:['PENDING'], vacations:['PENDING'], payroll_runs:['DRAFT'] },
      DEPT_HEAD:       { money_requests:['PENDING'], purchase_orders:['SUBMITTED'], overtime:['PENDING'], food_allowance:['PENDING'], vacations:['PENDING'] },
      PROJECT_MANAGER: { money_requests:['PENDING'], overtime:['PENDING'], food_allowance:['PENDING'] },
    }
    const myStatuses = pendingStatuses[role] || {}

    const fetches = Object.entries(myStatuses).map(async ([module, statuses]) => {
      const meta = MODULE_META[module]
      if (!meta) return []
      let q = supabase.from(meta.table).select('id,created_at,status,' + meta.amtCol + ',description,employee_id,employees(full_name,full_name_en)')
        .eq('entity_id', entityId).in('status', statuses).order('created_at', { ascending:false }).limit(50)
      // Special selects per module
      if (module === 'money_requests')  q = supabase.from('money_requests').select('id,created_at,status,amount,description,requested_by,purpose,employees(full_name,full_name_en)').eq('entity_id',entityId).in('status',statuses).order('created_at',{ascending:false}).limit(50)
      if (module === 'purchase_orders') q = supabase.from('po_requests').select('id,created_at,status,total_amount,request_number,description,contractors(contractor_name)').eq('entity_id',entityId).in('status',statuses).order('created_at',{ascending:false}).limit(50)
      if (module === 'payroll_runs')    q = supabase.from('payroll_runs').select('id,payroll_month,status,total_net,total_employees').eq('entity_id',entityId).in('status',statuses).order('payroll_month',{ascending:false}).limit(12)
      if (module === 'vacations')       q = supabase.from('vacations').select('id,created_at,status,leave_type,start_date,end_date,days_requested,employees(full_name,full_name_en)').eq('entity_id',entityId).in('status',statuses).order('created_at',{ascending:false}).limit(50)
      if (module === 'overtime')        q = supabase.from('overtime_requests').select('id,created_at,status,hours,overtime_date,employees(full_name,full_name_en)').eq('entity_id',entityId).in('status',statuses).order('created_at',{ascending:false}).limit(50)
      if (module === 'food_allowance')  q = supabase.from('food_allowances').select('id,created_at,status,total_amount,start_date,end_date,employees(full_name,full_name_en)').eq('entity_id',entityId).in('status',statuses).order('created_at',{ascending:false}).limit(50)

      const { data } = await q
      return (data||[]).map(r=>({ ...r, _module: module }))
    })

    const results = await Promise.all(fetches)
    const all = results.flat().sort((a,b)=>new Date(b.created_at||b.payroll_month)-new Date(a.created_at||a.payroll_month))
    setItems(all)
    setLoading(false)
  }

  function empName(item) {
    return item.employees?.full_name || item.employees?.full_name_en || item.requested_by || '—'
  }

  function itemLabel(item) {
    const m = item._module
    if (m==='purchase_orders') return `PO ${item.request_number||''} — ${item.contractors?.contractor_name||''}`
    if (m==='money_requests')  return `${item.purpose||item.description||'Money Request'}`
    if (m==='payroll_runs')    return `Payroll ${item.payroll_month} — ${item.total_employees||0} employees`
    if (m==='vacations')       return `${item.leave_type} ${fmt(item.start_date)}–${fmt(item.end_date)} (${item.days_requested}d)`
    if (m==='overtime')        return `Overtime ${fmt(item.overtime_date)} — ${item.hours}h`
    if (m==='food_allowance')  return `Food Allowance ${fmt(item.start_date)}–${fmt(item.end_date)}`
    return item.description||'—'
  }

  function itemAmount(item) {
    const m = item._module
    if (m==='overtime')     return `${item.hours||0} hrs`
    if (m==='vacations')    return `${item.days_requested||0} days`
    if (m==='payroll_runs') return SAR(item.total_net)
    return SAR(item.amount||item.total_amount||0)
  }

  function openComment(item, action) {
    setComment({ open:true, item, action, text:'' })
  }

  async function doAction() {
    const { item, action, text } = comment
    if (!item) return
    setSaving(true)
    const meta   = MODULE_META[item._module]
    const status = action==='approve' ? meta.approveStatus : meta.rejectStatus
    const { error } = await supabase.from(meta.table).update({
      status,
      approval_comment: text||null,
      approved_at: action==='approve' ? new Date().toISOString() : null,
    }).eq('id', item.id)
    setSaving(false)
    if (error) { alert(error.message); return }
    const msg = action==='approve' ? '✅ Approved!' : '❌ Rejected'
    setFlash(msg); setTimeout(()=>setFlash(null), 3000)
    setComment({ open:false, item:null, action:'', text:'' })
    load()
  }

  const counts = Object.keys(MODULE_META).reduce((acc,m)=>({ ...acc, [m]: items.filter(i=>i._module===m).length }),{})
  const displayed = filter==='all' ? items : items.filter(i=>i._module===filter)

  return (
    <div>
      {/* Header */}
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:20 }}>Everything awaiting your approval — one place, one click</div>

      {flash && <div style={{ background:'#e8f5e9', border:'1px solid #a5d6a7', borderRadius:10, padding:'12px 16px', marginBottom:14, fontSize:13, fontWeight:700, color:'#2e7d32' }}>{flash}</div>}

      {/* KPI chips */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:18 }}>
        <button onClick={()=>setFilter('all')} style={{
          padding:'8px 18px', borderRadius:20, border:'none', cursor:'pointer', fontWeight:700, fontSize:12,
          background:filter==='all'?'#1a2e3d':'#f0f4f8', color:filter==='all'?'#fff':'#6b7c93'
        }}>All ({items.length})</button>
        {Object.entries(MODULE_META).filter(([k])=>counts[k]>0).map(([k,m])=>(
          <button key={k} onClick={()=>setFilter(filter===k?'all':k)} style={{
            padding:'8px 14px', borderRadius:20, border:`2px solid ${filter===k?m.color:'transparent'}`,
            cursor:'pointer', fontWeight:700, fontSize:11, background:filter===k?`${m.color}18`:'#f0f4f8', color:filter===k?m.color:'#6b7c93'
          }}>{m.icon} {m.label} ({counts[k]})</button>
        ))}
      </div>

      {/* Items list */}
      {loading ? (
        <div style={{ textAlign:'center', padding:50, color:'#6b7c93' }}>Loading…</div>
      ) : displayed.length===0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>
          <div style={{ fontSize:40, marginBottom:10 }}>🎉</div>
          <div style={{ fontWeight:700, fontSize:15 }}>All caught up!</div>
          <div style={{ fontSize:12, marginTop:4 }}>No pending approvals for your role</div>
        </div>
      ) : (
        displayed.map((item,i)=>{
          const meta = MODULE_META[item._module]
          const age  = item.created_at ? Math.floor((Date.now()-new Date(item.created_at))/864e5) : 0
          return (
            <div key={`${item._module}-${item.id}`} style={{
              ...S.card,
              borderLeft:`4px solid ${meta.color}`,
              display:'flex', alignItems:'center', gap:14, flexWrap:'wrap',
              background: age > 3 ? '#fffde7' : '#fff',
            }}>
              <div style={{ fontSize:28, flexShrink:0 }}>{meta.icon}</div>
              <div style={{ flex:1, minWidth:200 }}>
                <div style={{ fontSize:11, color:meta.color, fontWeight:800, marginBottom:2 }}>{meta.label}</div>
                <div style={{ fontWeight:700, color:'#1a2e3d', fontSize:13 }}>{itemLabel(item)}</div>
                <div style={{ fontSize:11, color:'#6b7c93', marginTop:2 }}>
                  {empName(item) !== '—' && <span>👤 {empName(item)} · </span>}
                  {fmt(item.created_at||item.payroll_month)}
                  {age > 0 && <span style={{ color:age>5?'#c62828':'#e65100', fontWeight:700 }}> · {age}d ago</span>}
                </div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontWeight:800, fontSize:15, color:'#1a2e3d' }}>{itemAmount(item)}</div>
                <div style={{ fontSize:10, color:'#aab2bd', marginTop:1 }}>{item.status}</div>
              </div>
              <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                <button onClick={()=>openComment(item,'approve')} style={S.btn('#2e7d32')}>✅ Approve</button>
                <button onClick={()=>openComment(item,'reject')}  style={S.btn('#c62828')}>❌ Reject</button>
              </div>
            </div>
          )
        })
      )}

      {/* Confirm modal */}
      {comment.open && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setComment(p=>({...p,open:false}))}>
          <div style={S.modal}>
            <div style={{ fontWeight:800, fontSize:16, color: comment.action==='approve'?'#2e7d32':'#c62828', marginBottom:6 }}>
              {comment.action==='approve'?'✅ Approve':'❌ Reject'} — {MODULE_META[comment.item?._module]?.label}
            </div>
            <div style={{ fontSize:12, color:'#546e7a', marginBottom:16 }}>{itemLabel(comment.item||{})}</div>
            <div style={{ marginBottom:18 }}>
              <label style={{ display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:5 }}>
                Comment {comment.action==='reject'?'(required)':'(optional)'}
              </label>
              <textarea style={{ ...S.inp, height:80, resize:'vertical' }}
                value={comment.text}
                onChange={e=>setComment(p=>({...p,text:e.target.value}))}
                placeholder={comment.action==='reject'?'State the reason for rejection…':'Add a comment (optional)…'}
              />
            </div>
            {comment.action==='reject' && !comment.text.trim() && (
              <div style={{ color:'#c62828', fontSize:11, marginBottom:12 }}>⚠️ A reason is required when rejecting</div>
            )}
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button style={S.btn('#aab2bd')} onClick={()=>setComment(p=>({...p,open:false}))}>Cancel</button>
              <button
                style={S.btn(comment.action==='approve'?'#2e7d32':'#c62828')}
                onClick={doAction}
                disabled={saving||(comment.action==='reject'&&!comment.text.trim())}
              >
                {saving?'Processing…':comment.action==='approve'?'Confirm Approve':'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
