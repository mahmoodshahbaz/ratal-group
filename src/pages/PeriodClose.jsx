import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'

// ═══════════════════════════════════════════════════════════════════
// Period Close & Month-End Checklist — Phase 16
//
// Tab 1 — Checklist     : tick off tasks for a chosen period, then lock
// Tab 2 — Period Status : year-grid showing OPEN/LOCKED months
// Tab 3 — Manage Items  : CRUD for checklist task definitions
//
// GL guard: ledger_entries trigger blocks inserts into locked periods
// ═══════════════════════════════════════════════════════════════════

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const CATEGORIES = ['GL','HR','VAT','BANK','RECON','REVIEW','OTHER']
const CAT_COLOR  = { GL:'#1565C0', HR:'#2e7d32', VAT:'#e65100', BANK:'#00838f', RECON:'#5A32D4', REVIEW:'#c62828', OTHER:'#546e7a' }

// Default checklist items seeded on first load
const DEFAULT_ITEMS = [
  { title:'Bank reconciliation completed',           category:'BANK',  sort_order:1,  description:'All bank accounts reconciled to statements' },
  { title:'Payroll posted to GL',                    category:'HR',    sort_order:2,  description:'Monthly payroll journal entries posted' },
  { title:'Food allowances posted to GL',            category:'HR',    sort_order:3,  description:'Food allowance payments recorded in ledger' },
  { title:'Overtime recorded and approved',          category:'HR',    sort_order:4,  description:'All OT requests approved and posted' },
  { title:'Expenses approved and posted',            category:'GL',    sort_order:5,  description:'All pending expense claims processed' },
  { title:'Fixed asset depreciation posted',         category:'GL',    sort_order:6,  description:'Monthly depreciation journal posted via Fixed Assets' },
  { title:'Petty cash reconciled',                   category:'BANK',  sort_order:7,  description:'Petty cash books closed and differences resolved' },
  { title:'VAT return reviewed',                     category:'VAT',   sort_order:8,  description:'VAT output vs. input checked for accuracy' },
  { title:'Recurring journals posted',               category:'GL',    sort_order:9,  description:'All recurring templates posted for this period' },
  { title:'AR aging reviewed',                       category:'RECON', sort_order:10, description:'Overdue receivables followed up' },
  { title:'AP aging reviewed',                       category:'RECON', sort_order:11, description:'Supplier dues checked and prioritised' },
  { title:'Outstanding cheques reviewed',            category:'BANK',  sort_order:12, description:'Pending cheques cleared or followed up' },
  { title:'Intercompany balances reconciled',        category:'RECON', sort_order:13, description:'IC receivables and payables net to zero' },
  { title:'Trial balance checked (DR = CR)',         category:'GL',    sort_order:14, description:'General ledger in balance before close' },
  { title:'Budget variance reviewed',                category:'REVIEW',sort_order:15, description:'Significant budget variances explained' },
  { title:'Management accounts distributed',         category:'REVIEW',sort_order:16, description:'P&L and balance sheet shared with management' },
]

const S = {
  card: { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:10 },
  btn:  (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  btnO: (c='#1a2e3d') => ({ background:'transparent', color:c, border:`1.5px solid ${c}`, borderRadius:8, padding:'7px 15px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:  { padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', width:'100%', boxSizing:'border-box', background:'#fff' },
  lbl:  { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
}

const fmtDT = ts => ts ? new Date(ts).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'
const today  = () => new Date().toISOString().slice(0,10)
const ym     = (y,m) => `${y}-${String(m).padStart(2,'0')}`

// ── Seed default items if entity has none ────────────────────────────────────
async function seedDefaultItems(entityId) {
  const { count } = await supabase.from('period_checklist_items')
    .select('*', { count:'exact', head:true }).eq('entity_id', entityId)
  if (count > 0) return
  await supabase.from('period_checklist_items').insert(
    DEFAULT_ITEMS.map(i=>({ ...i, entity_id:entityId, is_required:true, is_active:true }))
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 1 — Month-End Checklist
// ═══════════════════════════════════════════════════════════════════
function ChecklistTab({ entityId, isSuperAdmin }) {
  const now  = new Date()
  const [year,        setYear]        = useState(now.getFullYear())
  const [month,       setMonth]       = useState(now.getMonth()+1)
  const [items,       setItems]       = useState([])
  const [completions, setCompletions] = useState({})  // itemId → completion row
  const [lock,        setLock]        = useState(null) // period_locks row or null
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState({})
  const [locking,     setLocking]     = useState(false)
  const [lockNote,    setLockNote]    = useState('')
  const [showLockModal, setShowLockModal] = useState(false)
  const { user } = useAuth()

  const load = useCallback(async () => {
    setLoading(true)
    // Seed defaults first run
    await seedDefaultItems(entityId)

    const [itemsRes, compRes, lockRes] = await Promise.all([
      supabase.from('period_checklist_items').select('*')
        .eq('entity_id', entityId).eq('is_active', true).order('sort_order'),
      supabase.from('period_checklist_completions').select('*')
        .eq('entity_id', entityId).eq('year', year).eq('month', month),
      supabase.from('period_locks').select('*')
        .eq('entity_id', entityId).eq('year', year).eq('month', month).maybeSingle(),
    ])

    setItems(itemsRes.data||[])
    const cmap = {}
    for (const c of (compRes.data||[])) cmap[c.item_id] = c
    setCompletions(cmap)
    setLock(lockRes.data)
    setLoading(false)
  }, [entityId, year, month])

  useEffect(() => { load() }, [load])

  async function toggleItem(item) {
    if (lock?.status === 'LOCKED') return
    setSaving(s=>({...s,[item.id]:true}))
    const existing = completions[item.id]
    const nowTs = new Date().toISOString()
    const newVal = !(existing?.completed)

    if (existing) {
      await supabase.from('period_checklist_completions').update({
        completed: newVal,
        completed_by: newVal ? user?.id : null,
        completed_at: newVal ? nowTs : null,
      }).eq('id', existing.id)
    } else {
      await supabase.from('period_checklist_completions').insert({
        entity_id: entityId, item_id: item.id, year, month,
        completed: true, completed_by: user?.id, completed_at: nowTs,
      })
    }

    // Refresh completions only
    const { data } = await supabase.from('period_checklist_completions').select('*')
      .eq('entity_id', entityId).eq('year', year).eq('month', month)
    const cmap = {}
    for (const c of (data||[])) cmap[c.item_id] = c
    setCompletions(cmap)
    setSaving(s=>({...s,[item.id]:false}))
  }

  async function saveNote(item, note) {
    const existing = completions[item.id]
    if (existing) {
      await supabase.from('period_checklist_completions').update({ notes:note }).eq('id', existing.id)
    } else {
      await supabase.from('period_checklist_completions').insert({
        entity_id:entityId, item_id:item.id, year, month, completed:false, notes:note,
      })
    }
  }

  async function lockPeriod() {
    setLocking(true)
    const nowTs = new Date().toISOString()
    const payload = {
      entity_id: entityId, year, month, status:'LOCKED',
      locked_by: user?.id, locked_at: nowTs, lock_notes: lockNote,
    }
    const existing = lock
    if (existing) {
      await supabase.from('period_locks').update({ status:'LOCKED', locked_by:user?.id, locked_at:nowTs, lock_notes:lockNote }).eq('id', existing.id)
    } else {
      await supabase.from('period_locks').insert(payload)
    }
    setLocking(false)
    setShowLockModal(false)
    load()
  }

  async function unlockPeriod(reason) {
    setLocking(true)
    const nowTs = new Date().toISOString()
    await supabase.from('period_locks').update({
      status:'UNLOCKED', unlocked_by:user?.id, unlocked_at:nowTs, unlock_reason:reason,
    }).eq('id', lock.id)
    setLocking(false)
    load()
  }

  const required = items.filter(i=>i.is_required)
  const optional = items.filter(i=>!i.is_required)
  const doneRequired = required.filter(i=>completions[i.id]?.completed).length
  const doneOptional = optional.filter(i=>completions[i.id]?.completed).length
  const totalDone    = doneRequired + doneOptional
  const pct = items.length ? Math.round(totalDone/items.length*100) : 0
  const allRequiredDone = doneRequired === required.length
  const isLocked = lock?.status === 'LOCKED'

  function ItemRow({ item }) {
    const comp  = completions[item.id]
    const done  = comp?.completed || false
    const color = CAT_COLOR[item.category]||'#546e7a'
    const [note, setNote] = useState(comp?.notes||'')
    const [noteOpen, setNoteOpen] = useState(false)

    return (
      <div style={{ borderBottom:'1px solid #f5f5f5', padding:'10px 16px',
        background:done?'#f9fffe':'#fff', opacity:isLocked&&!done?0.7:1 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <button
            onClick={()=>!isLocked&&toggleItem(item)}
            disabled={isLocked||saving[item.id]}
            style={{ width:22, height:22, borderRadius:6, border:`2px solid ${done?color:'#dde3ec'}`,
              background:done?color:'#fff', color:'#fff', fontSize:13, cursor:isLocked?'default':'pointer',
              display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0,
              transition:'all 0.15s' }}>
            {done?'✓':''}
          </button>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:done?600:400, color:done?'#1a2e3d':'#546e7a', fontSize:13,
              textDecoration:done?'none':'none' }}>
              {item.title}
              {item.is_required && <span style={{ color:'#c62828', marginLeft:4, fontSize:11 }}>*</span>}
            </div>
            {item.description && <div style={{ fontSize:11, color:'#9e9e9e', marginTop:1 }}>{item.description}</div>}
          </div>
          <span style={{ padding:'2px 8px', borderRadius:8, fontSize:9, fontWeight:700,
            background:color+'18', color, flexShrink:0 }}>{item.category}</span>
          {done && comp?.completed_at && (
            <span style={{ fontSize:10, color:'#9e9e9e', flexShrink:0 }}>
              {new Date(comp.completed_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}
            </span>
          )}
          <button onClick={()=>setNoteOpen(o=>!o)}
            style={{ fontSize:10, padding:'2px 8px', borderRadius:6, border:'1px solid #dde3ec',
              background:'#f5f7fa', cursor:'pointer', color:comp?.notes?'#1565C0':'#aab2bd', flexShrink:0 }}>
            {comp?.notes?'📝':'+note'}
          </button>
        </div>
        {noteOpen && (
          <div style={{ marginTop:8, marginLeft:32 }}>
            <input style={{ ...S.inp, fontSize:11 }} value={note} onChange={e=>setNote(e.target.value)}
              onBlur={()=>saveNote(item,note)} placeholder="Add a note…" disabled={isLocked} />
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      {/* Period selector */}
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
        <div>
          <label style={S.lbl}>Year</label>
          <select style={{ ...S.inp, width:90 }} value={year} onChange={e=>setYear(+e.target.value)}>
            {[2023,2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={S.lbl}>Month</label>
          <select style={{ ...S.inp, width:120 }} value={month} onChange={e=>setMonth(+e.target.value)}>
            {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          {isLocked ? (
            <>
              <span style={{ fontSize:12, fontWeight:700, color:'#c62828',
                background:'#ffebee', padding:'6px 12px', borderRadius:8 }}>
                🔒 PERIOD LOCKED
              </span>
              {isSuperAdmin && (
                <button onClick={()=>{
                  const reason = window.prompt('Reason for unlocking this period:')
                  if (reason) unlockPeriod(reason)
                }} style={S.btnO('#c62828')}>
                  🔓 Unlock
                </button>
              )}
            </>
          ) : (
            <button
              onClick={()=>setShowLockModal(true)}
              disabled={!allRequiredDone && !isSuperAdmin}
              style={{ ...S.btn(allRequiredDone?'#c62828':'#9e9e9e'),
                cursor:(!allRequiredDone&&!isSuperAdmin)?'not-allowed':'pointer' }}>
              🔒 Lock Period
              {!allRequiredDone && !isSuperAdmin && ` (${doneRequired}/${required.length} required)`}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {!loading && (
        <div style={{ ...S.card, padding:'16px 20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ fontWeight:700, fontSize:14, color:'#1a2e3d' }}>
              Month-End Progress — {MONTHS[month-1]} {year}
            </div>
            <div style={{ fontSize:13, fontWeight:800, color:pct===100?'#2e7d32':'#f57f17' }}>
              {totalDone} / {items.length} &nbsp;({pct}%)
            </div>
          </div>
          <div style={{ height:12, background:'#f0f4f8', borderRadius:8, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${pct}%`, borderRadius:8, transition:'width 0.5s',
              background: pct===100?'#2e7d32':pct>=70?'#f57f17':'#1565C0' }} />
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:6, fontSize:11, color:'#6b7c93' }}>
            <span>Required: {doneRequired}/{required.length}</span>
            <span>Optional: {doneOptional}/{optional.length}</span>
            {isLocked && lock?.locked_at && (
              <span style={{ color:'#c62828', fontWeight:700 }}>Locked {fmtDT(lock.locked_at)}</span>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading checklist…</div>
      ) : items.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:40, color:'#aab2bd' }}>
          No checklist items. Go to Manage Items to add them.
        </div>
      ) : (
        <>
          {/* Required items */}
          {required.length > 0 && (
            <div style={{ ...S.card, padding:0, overflow:'hidden', marginBottom:10 }}>
              <div style={{ padding:'8px 16px', background:'#fff3e0', fontWeight:800,
                fontSize:11, color:'#e65100', letterSpacing:1 }}>
                ⚠️ REQUIRED BEFORE CLOSE ({doneRequired}/{required.length} done)
              </div>
              {required.map(item=><ItemRow key={item.id} item={item} />)}
            </div>
          )}
          {/* Optional items */}
          {optional.length > 0 && (
            <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
              <div style={{ padding:'8px 16px', background:'#f5f7fa', fontWeight:800,
                fontSize:11, color:'#546e7a', letterSpacing:1 }}>
                OPTIONAL ({doneOptional}/{optional.length} done)
              </div>
              {optional.map(item=><ItemRow key={item.id} item={item} />)}
            </div>
          )}
          <div style={{ fontSize:11, color:'#aab2bd', marginTop:6 }}>
            * Required items must all be ticked before the period can be locked.
            {isSuperAdmin && ' (SUPERADMIN can override.)'}
          </div>
        </>
      )}

      {/* Lock confirmation modal */}
      {showLockModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000,
          display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e=>e.target===e.currentTarget&&setShowLockModal(false)}>
          <div style={{ background:'#fff', borderRadius:16, padding:28, width:440, boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize:28, textAlign:'center', marginBottom:12 }}>🔒</div>
            <div style={{ fontWeight:800, fontSize:16, textAlign:'center', color:'#1a2e3d', marginBottom:8 }}>
              Lock {MONTHS[month-1]} {year}?
            </div>
            <div style={{ fontSize:12, color:'#6b7c93', textAlign:'center', marginBottom:16, lineHeight:1.6 }}>
              This will prevent any new GL entries from being posted into this period.
              The trigger will reject any backdated entries automatically.
              {!allRequiredDone && isSuperAdmin && (
                <div style={{ color:'#c62828', fontWeight:700, marginTop:8 }}>
                  ⚠️ {required.length - doneRequired} required item(s) not yet completed. Locking anyway as SUPERADMIN.
                </div>
              )}
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={S.lbl}>Lock notes (optional)</label>
              <input style={S.inp} value={lockNote} onChange={e=>setLockNote(e.target.value)}
                placeholder="e.g. All items reviewed and approved" />
            </div>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={()=>setShowLockModal(false)} style={S.btnO()}>Cancel</button>
              <button onClick={lockPeriod} disabled={locking} style={S.btn('#c62828')}>
                {locking?'Locking…':'🔒 Confirm Lock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 2 — Period Status Grid
// ═══════════════════════════════════════════════════════════════════
function PeriodStatusTab({ entityId, isSuperAdmin }) {
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [locks,    setLocks]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [acting,   setActing]   = useState(null)
  const { user } = useAuth()

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('period_locks')
      .select('*').eq('entity_id', entityId)
      .gte('year', viewYear-1).lte('year', viewYear+1)
    setLocks(data||[])
    setLoading(false)
  }, [entityId, viewYear])

  useEffect(() => { load() }, [load])

  const lockMap = {}
  for (const l of locks) lockMap[`${l.year}-${l.month}`] = l

  async function toggleLock(y, m) {
    const key = `${y}-${m}`
    const existing = lockMap[key]
    setActing(key)
    const nowTs = new Date().toISOString()

    if (!existing || existing.status === 'UNLOCKED') {
      if (!window.confirm(`Lock ${MONTHS[m-1]} ${y}? No GL entries will be permitted in this period.`)) {
        setActing(null); return
      }
      if (existing) {
        await supabase.from('period_locks').update({ status:'LOCKED', locked_by:user?.id, locked_at:nowTs }).eq('id', existing.id)
      } else {
        await supabase.from('period_locks').insert({ entity_id:entityId, year:y, month:m, status:'LOCKED', locked_by:user?.id, locked_at:nowTs })
      }
    } else {
      if (!isSuperAdmin) { alert('Only SUPERADMIN can unlock periods.'); setActing(null); return }
      const reason = window.prompt(`Reason for unlocking ${MONTHS[m-1]} ${y}:`)
      if (!reason) { setActing(null); return }
      await supabase.from('period_locks').update({
        status:'UNLOCKED', unlocked_by:user?.id, unlocked_at:nowTs, unlock_reason:reason,
      }).eq('id', existing.id)
    }
    setActing(null)
    load()
  }

  // Stats
  const thisYearLocks = locks.filter(l=>l.year===viewYear)
  const lockedCount   = thisYearLocks.filter(l=>l.status==='LOCKED').length
  const currentPeriod = `${now.getFullYear()}-${now.getMonth()+1}`
  const currentLocked = lockMap[currentPeriod]?.status === 'LOCKED'

  return (
    <>
      <div style={{ ...S.card, display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
        <div>
          <label style={S.lbl}>Year</label>
          <select style={{ ...S.inp, width:100 }} value={viewYear} onChange={e=>setViewYear(+e.target.value)}>
            {[2023,2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={{ display:'flex', gap:16, marginLeft:'auto', flexWrap:'wrap' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontWeight:800, fontSize:20, color:'#c62828' }}>{lockedCount}</div>
            <div style={{ fontSize:10, color:'#6b7c93' }}>Locked {viewYear}</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontWeight:800, fontSize:20, color:'#2e7d32' }}>{12-lockedCount}</div>
            <div style={{ fontSize:10, color:'#6b7c93' }}>Open {viewYear}</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontWeight:800, fontSize:20, color:currentLocked?'#c62828':'#2e7d32' }}>
              {currentLocked?'🔒':'🔓'}
            </div>
            <div style={{ fontSize:10, color:'#6b7c93' }}>Current period</div>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading…</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
          {MONTHS.map((mLabel,i)=>{
            const m    = i+1
            const key  = `${viewYear}-${m}`
            const lk   = lockMap[key]
            const isLk = lk?.status==='LOCKED'
            const isPast= (viewYear < now.getFullYear()) || (viewYear===now.getFullYear() && m < now.getMonth()+1)
            const isCur = viewYear===now.getFullYear() && m===now.getMonth()+1
            const acting_= acting===key

            return (
              <div key={m} style={{ background:'#fff', borderRadius:12, padding:'16px',
                boxShadow:'0 1px 6px rgba(0,0,0,0.07)',
                border:`2px solid ${isLk?'#ef9a9a':isCur?'#90caf9':'#f0f4f8'}`,
                opacity: acting_?0.6:1 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <div>
                    <div style={{ fontWeight:800, fontSize:15, color:'#1a2e3d' }}>{mLabel}</div>
                    <div style={{ fontSize:10, color:'#aab2bd' }}>{viewYear}</div>
                  </div>
                  <span style={{ fontSize:20 }}>{isLk?'🔒':'🔓'}</span>
                </div>

                <div style={{ margin:'10px 0', fontSize:12, fontWeight:700,
                  color:isLk?'#c62828':'#2e7d32' }}>
                  {isLk?'LOCKED':'OPEN'}
                </div>

                {isLk && lk.locked_at && (
                  <div style={{ fontSize:10, color:'#9e9e9e', marginBottom:6 }}>
                    Locked {new Date(lk.locked_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short'})}
                  </div>
                )}
                {isLk && lk.lock_notes && (
                  <div style={{ fontSize:10, color:'#6b7c93', marginBottom:8, fontStyle:'italic' }}>
                    "{lk.lock_notes}"
                  </div>
                )}

                <button
                  onClick={()=>toggleLock(viewYear, m)}
                  disabled={acting_||(!isSuperAdmin&&isLk)}
                  style={{ width:'100%', padding:'6px', borderRadius:8, fontSize:11, fontWeight:700,
                    cursor:(acting_||(!isSuperAdmin&&isLk))?'not-allowed':'pointer',
                    border:`1.5px solid ${isLk?'#ef9a9a':'#a5d6a7'}`,
                    background:isLk?'#ffebee':'#e8f5e9',
                    color:isLk?'#c62828':'#2e7d32',
                    opacity:(!isSuperAdmin&&isLk)?0.5:1 }}>
                  {acting_?'…':isLk?(isSuperAdmin?'🔓 Unlock':'🔒 Locked'):'🔒 Lock'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 3 — Manage Checklist Items
// ═══════════════════════════════════════════════════════════════════
function ManageItemsTab({ entityId }) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [adding,  setAdding]  = useState(false)
  const [newItem, setNewItem] = useState({ title:'', description:'', category:'GL', is_required:true })
  const [saving,  setSaving]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    await seedDefaultItems(entityId)
    const { data } = await supabase.from('period_checklist_items').select('*')
      .eq('entity_id', entityId).order('sort_order')
    setItems(data||[])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  async function toggleActive(item) {
    await supabase.from('period_checklist_items').update({ is_active:!item.is_active }).eq('id', item.id)
    load()
  }

  async function toggleRequired(item) {
    await supabase.from('period_checklist_items').update({ is_required:!item.is_required }).eq('id', item.id)
    load()
  }

  async function deleteItem(id) {
    if (!window.confirm('Remove this item from the checklist?')) return
    await supabase.from('period_checklist_items').delete().eq('id', id)
    load()
  }

  async function addItem() {
    if (!newItem.title.trim()) return
    setSaving(true)
    const maxOrder = items.length ? Math.max(...items.map(i=>i.sort_order))+1 : 0
    await supabase.from('period_checklist_items').insert({
      ...newItem, entity_id:entityId, is_active:true, sort_order:maxOrder,
    })
    setNewItem({ title:'', description:'', category:'GL', is_required:true })
    setAdding(false)
    setSaving(false)
    load()
  }

  const active   = items.filter(i=>i.is_active)
  const inactive = items.filter(i=>!i.is_active)

  return (
    <>
      <div style={{ ...S.card, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:12, color:'#6b7c93' }}>
          {active.length} active · {inactive.length} disabled
        </div>
        <button onClick={()=>setAdding(a=>!a)} style={S.btn()}>+ Add Item</button>
      </div>

      {adding && (
        <div style={{ ...S.card, border:'2px solid #90caf9' }}>
          <div style={{ fontWeight:700, marginBottom:12 }}>New Checklist Item</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={S.lbl}>Title *</label>
              <input style={S.inp} value={newItem.title} onChange={e=>setNewItem(n=>({...n,title:e.target.value}))}
                placeholder="e.g. Accruals reviewed and posted" />
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={S.lbl}>Description</label>
              <input style={S.inp} value={newItem.description} onChange={e=>setNewItem(n=>({...n,description:e.target.value}))}
                placeholder="Optional guidance note" />
            </div>
            <div>
              <label style={S.lbl}>Category</label>
              <select style={S.inp} value={newItem.category} onChange={e=>setNewItem(n=>({...n,category:e.target.value}))}>
                {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:20 }}>
              <input type="checkbox" checked={newItem.is_required} onChange={e=>setNewItem(n=>({...n,is_required:e.target.checked}))} id="nr" />
              <label htmlFor="nr" style={{ fontSize:12, cursor:'pointer' }}>Required before period lock</label>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>setAdding(false)} style={S.btnO()}>Cancel</button>
            <button onClick={addItem} disabled={saving||!newItem.title} style={S.btn('#2e7d32')}>
              {saving?'Saving…':'Add Item'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading…</div>
      ) : (
        <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11 }}>Title</th>
                <th style={{ padding:'9px 14px', textAlign:'left', fontSize:11, width:80 }}>Category</th>
                <th style={{ padding:'9px 14px', textAlign:'center', fontSize:11, width:80 }}>Required</th>
                <th style={{ padding:'9px 14px', textAlign:'center', fontSize:11, width:70 }}>Active</th>
                <th style={{ padding:'9px 14px', width:80 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item,i)=>{
                const color = CAT_COLOR[item.category]||'#546e7a'
                return (
                  <tr key={item.id} style={{ borderBottom:'1px solid #f5f5f5',
                    background:!item.is_active?'#fafafa':i%2?'#fafafa':'#fff',
                    opacity:!item.is_active?0.5:1 }}>
                    <td style={{ padding:'9px 14px' }}>
                      <div style={{ fontWeight:500 }}>{item.title}</div>
                      {item.description && <div style={{ fontSize:11, color:'#9e9e9e' }}>{item.description}</div>}
                    </td>
                    <td style={{ padding:'9px 14px' }}>
                      <span style={{ padding:'2px 8px', borderRadius:8, fontSize:9, fontWeight:700,
                        background:color+'18', color }}>{item.category}</span>
                    </td>
                    <td style={{ padding:'9px 14px', textAlign:'center' }}>
                      <button onClick={()=>toggleRequired(item)}
                        style={{ padding:'2px 10px', borderRadius:6, fontSize:10, fontWeight:700, cursor:'pointer', border:'none',
                          background:item.is_required?'#ffebee':'#f5f5f5',
                          color:item.is_required?'#c62828':'#9e9e9e' }}>
                        {item.is_required?'Yes':'No'}
                      </button>
                    </td>
                    <td style={{ padding:'9px 14px', textAlign:'center' }}>
                      <button onClick={()=>toggleActive(item)}
                        style={{ padding:'2px 10px', borderRadius:6, fontSize:10, fontWeight:700, cursor:'pointer', border:'none',
                          background:item.is_active?'#e8f5e9':'#f5f5f5',
                          color:item.is_active?'#2e7d32':'#9e9e9e' }}>
                        {item.is_active?'On':'Off'}
                      </button>
                    </td>
                    <td style={{ padding:'9px 14px', textAlign:'center' }}>
                      <button onClick={()=>deleteItem(item.id)}
                        style={{ fontSize:11, padding:'3px 8px', borderRadius:6, border:'1px solid #ef9a9a',
                          background:'#ffebee', color:'#c62828', cursor:'pointer' }}>
                        Remove
                      </button>
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
// Main export
// ═══════════════════════════════════════════════════════════════════
export default function PeriodClose({ entityId }) {
  const [tab, setTab] = useState('checklist')
  const { role } = useAuth()
  const isSuperAdmin = role === 'SUPERADMIN'

  const TABS = [
    { key:'checklist', label:'✅ Month-End Checklist' },
    { key:'status',    label:'📅 Period Status' },
    { key:'items',     label:'⚙️ Manage Items' },
  ]

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>
        Month-end checklist, period locking, and GL guard — prevents backdated entries into closed periods
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
          {tab==='checklist' && <ChecklistTab  entityId={entityId} isSuperAdmin={isSuperAdmin} />}
          {tab==='status'    && <PeriodStatusTab entityId={entityId} isSuperAdmin={isSuperAdmin} />}
          {tab==='items'     && <ManageItemsTab  entityId={entityId} />}
        </>
      )}
    </div>
  )
}
