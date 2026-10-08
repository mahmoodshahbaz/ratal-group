import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// Fixed Assets Register — Phase 8
// Tab 1: Asset Register   — add / edit / dispose assets
// Tab 2: Depreciation     — monthly schedule, NBV at date, Post to GL
// Tab 3: NBV Summary      — book value by category (for Balance Sheet)
// ═══════════════════════════════════════════════════════════════════

const CATEGORIES = ['VEHICLE','EQUIPMENT','FURNITURE','IT','BUILDING','LAND','OTHER']
const METHODS    = ['STRAIGHT_LINE','DECLINING_BALANCE','NONE']
const STATUSES   = ['ACTIVE','FULLY_DEPRECIATED','DISPOSED','IDLE']
const CAT_ICONS  = { VEHICLE:'🚗', EQUIPMENT:'⚙️', FURNITURE:'🪑', IT:'💻', BUILDING:'🏢', LAND:'🌍', OTHER:'📦' }
const STATUS_COLOR = { ACTIVE:'#2e7d32', FULLY_DEPRECIATED:'#1565C0', DISPOSED:'#c62828', IDLE:'#e65100' }

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:10 },
  btn:   (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  btnO:  (c='#1a2e3d') => ({ background:'transparent', color:c, border:`1.5px solid ${c}`, borderRadius:8, padding:'7px 15px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:   { padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff', width:'100%', boxSizing:'border-box', fontFamily:'inherit' },
  lbl:   { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
}

const fmt    = n  => (+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtD   = d  => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'
const MONTHS_LIST = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Depreciation engine ──────────────────────────────────────────────────────
function calcMonthlyDepr(asset, asOfDate) {
  const purchase    = new Date(asset.purchase_date)
  const cost        = +asset.purchase_cost    || 0
  const residual    = +asset.residual_value   || 0
  const life        = +asset.useful_life_months || 1
  const method      = asset.depreciation_method
  const depreciable = Math.max(0, cost - residual)

  if (method === 'NONE' || asset.category === 'LAND') return 0

  const asOf    = asOfDate ? new Date(asOfDate) : new Date()
  const disposal = asset.disposal_date ? new Date(asset.disposal_date) : null
  const endDate  = disposal && disposal < asOf ? disposal : asOf

  // Months elapsed since purchase (minimum 0)
  const elapsed = Math.max(0,
    (endDate.getFullYear() - purchase.getFullYear()) * 12 +
    (endDate.getMonth()   - purchase.getMonth()))

  if (method === 'STRAIGHT_LINE') {
    return depreciable / life   // per month
  }
  if (method === 'DECLINING_BALANCE') {
    const rate = +(asset.depreciation_rate || 0.20)
    return cost * (rate / 12)
  }
  return 0
}

function calcNBV(asset, asOfDate) {
  const cost       = +asset.purchase_cost   || 0
  const residual   = +asset.residual_value  || 0
  const life       = +asset.useful_life_months || 1
  const method     = asset.depreciation_method
  const purchase   = new Date(asset.purchase_date)
  const asOf       = asOfDate ? new Date(asOfDate) : new Date()
  const disposal   = asset.disposal_date ? new Date(asset.disposal_date) : null
  const endDate    = disposal && disposal < asOf ? disposal : asOf

  const elapsed = Math.max(0,
    (endDate.getFullYear() - purchase.getFullYear()) * 12 +
    (endDate.getMonth()    - purchase.getMonth()))

  if (method === 'NONE' || asset.category === 'LAND') return cost

  if (method === 'STRAIGHT_LINE') {
    const monthlyDepr = (cost - residual) / life
    const accum       = Math.min(cost - residual, monthlyDepr * elapsed)
    return cost - accum
  }
  if (method === 'DECLINING_BALANCE') {
    const rate = +(asset.depreciation_rate || 0.20)
    let nbv    = cost
    for (let i = 0; i < Math.min(elapsed, life); i++) nbv -= nbv * (rate / 12)
    return Math.max(residual, nbv)
  }
  return cost
}

// Generate month-by-month schedule for one asset
function buildSchedule(asset) {
  const purchase = new Date(asset.purchase_date)
  const life     = +asset.useful_life_months || 1
  const cost     = +asset.purchase_cost   || 0
  const residual = +asset.residual_value  || 0
  const method   = asset.depreciation_method
  const rows     = []

  if (method === 'NONE' || asset.category === 'LAND') {
    rows.push({ period: 'N/A', depr: 0, accum: 0, nbv: cost })
    return rows
  }

  let accum = 0, nbv = cost
  const depreciable = Math.max(0, cost - residual)

  for (let m = 0; m < life; m++) {
    const d = new Date(purchase.getFullYear(), purchase.getMonth() + m + 1, 1)
    const period = `${MONTHS_LIST[d.getMonth()]} ${d.getFullYear()}`

    let depr = 0
    if (method === 'STRAIGHT_LINE') {
      depr = depreciable / life
    } else if (method === 'DECLINING_BALANCE') {
      const rate = +(asset.depreciation_rate || 0.20)
      depr = nbv * (rate / 12)
    }
    depr  = Math.min(depr, nbv - residual)
    accum += depr
    nbv   -= depr
    rows.push({ period, depr, accum, nbv: Math.max(residual, nbv) })
    if (nbv <= residual) break
  }
  return rows
}

// ── Blank asset form ─────────────────────────────────────────────────────────
const BLANK = {
  asset_code:'', asset_name:'', category:'EQUIPMENT',
  purchase_date: new Date().toISOString().slice(0,10),
  purchase_cost:'', residual_value:'0', supplier_name:'',
  invoice_reference:'', depreciation_method:'STRAIGHT_LINE',
  useful_life_months:'60', depreciation_rate:'',
  department:'', location:'', assigned_to:'', serial_number:'',
  asset_account_code:'', accum_depr_account:'', depr_expense_account:'',
  status:'ACTIVE', disposal_date:'', disposal_proceeds:'', disposal_notes:'', notes:'',
}

// ═══════════════════════════════════════════════════════════════════
// Tab 1 — Asset Register
// ═══════════════════════════════════════════════════════════════════
function AssetRegister({ entityId, assets, reload }) {
  const [modal,  setModal]  = useState(null)   // null | 'add' | {asset}
  const [form,   setForm]   = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [catF,   setCatF]   = useState('ALL')
  const [statF,  setStatF]  = useState('ALL')
  const [search, setSearch] = useState('')
  const [asOf,   setAsOf]   = useState(new Date().toISOString().slice(0,10))

  function openAdd()  { setForm({ ...BLANK }); setModal('add') }
  function openEdit(a){ setForm({ ...BLANK, ...a,
    purchase_date:     a.purchase_date||'',
    disposal_date:     a.disposal_date||'',
    purchase_cost:     a.purchase_cost||'',
    residual_value:    a.residual_value||'0',
    useful_life_months:a.useful_life_months||'60',
    depreciation_rate: a.depreciation_rate||'',
    disposal_proceeds: a.disposal_proceeds||'',
  }); setModal(a) }

  async function save() {
    if (!form.asset_name || !form.purchase_date || !form.purchase_cost) return
    setSaving(true)
    const payload = {
      entity_id: entityId,
      asset_code:             form.asset_code     || `FA-${Date.now()}`,
      asset_name:             form.asset_name,
      category:               form.category,
      purchase_date:          form.purchase_date,
      purchase_cost:          +form.purchase_cost || 0,
      residual_value:         +form.residual_value || 0,
      supplier_name:          form.supplier_name     || null,
      invoice_reference:      form.invoice_reference || null,
      depreciation_method:    form.depreciation_method,
      useful_life_months:     +form.useful_life_months || 60,
      depreciation_rate:      form.depreciation_rate ? +form.depreciation_rate : null,
      department:             form.department  || null,
      location:               form.location    || null,
      assigned_to:            form.assigned_to || null,
      serial_number:          form.serial_number || null,
      asset_account_code:     form.asset_account_code    || null,
      accum_depr_account:     form.accum_depr_account    || null,
      depr_expense_account:   form.depr_expense_account  || null,
      status:                 form.status,
      disposal_date:          form.disposal_date     || null,
      disposal_proceeds:      +form.disposal_proceeds || null,
      disposal_notes:         form.disposal_notes    || null,
      notes:                  form.notes             || null,
    }

    if (modal === 'add') {
      await supabase.from('fixed_assets').insert(payload)
    } else {
      await supabase.from('fixed_assets').update(payload).eq('id', modal.id)
    }
    setSaving(false); setModal(null); reload()
  }

  const visible = assets.filter(a => {
    if (catF  !== 'ALL' && a.category !== catF)    return false
    if (statF !== 'ALL' && a.status   !== statF)   return false
    if (search) {
      const q = search.toLowerCase()
      return a.asset_name.toLowerCase().includes(q) || (a.asset_code||'').toLowerCase().includes(q)
    }
    return true
  })

  const totalCost = visible.reduce((s,a) => s + (+a.purchase_cost||0), 0)
  const totalNBV  = visible.reduce((s,a) => s + calcNBV(a, asOf), 0)
  const totalAccum = totalCost - totalNBV

  function FRow({ label, children, required }) {
    return (
      <div>
        <label style={S.lbl}>{label}{required&&<span style={{color:'#c62828'}}> *</span>}</label>
        {children}
      </div>
    )
  }

  return (
    <>
      {/* Toolbar */}
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search assets…" style={{ ...S.inp, width:200 }} />
        <select value={catF} onChange={e=>setCatF(e.target.value)} style={{ ...S.inp, width:'auto' }}>
          <option value="ALL">All Categories</option>
          {CATEGORIES.map(c=><option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}
        </select>
        <select value={statF} onChange={e=>setStatF(e.target.value)} style={{ ...S.inp, width:'auto' }}>
          <option value="ALL">All Statuses</option>
          {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
        <div>
          <label style={S.lbl}>NBV as-of</label>
          <input type="date" value={asOf} onChange={e=>setAsOf(e.target.value)} style={{ ...S.inp, width:140 }} />
        </div>
        <button onClick={openAdd} style={{ ...S.btn('#2e7d32'), marginLeft:'auto' }}>+ Add Asset</button>
      </div>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:10, marginBottom:12 }}>
        {[
          { label:'Assets',        val:visible.length, color:'#1a2e3d', plain:true },
          { label:'Total Cost',    val:totalCost,      color:'#1565C0' },
          { label:'Accumulated Depr', val:totalAccum,  color:'#c62828' },
          { label:'Net Book Value',val:totalNBV,       color:'#2e7d32' },
        ].map(k=>(
          <div key={k.label} style={{ background:'#fff', borderRadius:12, padding:'12px 14px', boxShadow:'0 1px 6px rgba(0,0,0,0.07)', borderLeft:`4px solid ${k.color}` }}>
            <div style={{ fontSize:10, color:'#6b7c93' }}>{k.label}</div>
            <div style={{ fontWeight:800, fontSize:18, color:k.color }}>
              {k.plain ? k.val : fmt(k.val)}
            </div>
            {!k.plain && <div style={{ fontSize:9, color:'#aab2bd' }}>SAR</div>}
          </div>
        ))}
      </div>

      {/* Asset table */}
      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'#1a2e3d', color:'#fff' }}>
              {['Code','Asset','Category','Purchase Date','Cost (SAR)','NBV (SAR)','Method','Life','Status',''].map((h,i)=>(
                <th key={i} style={{ padding:'9px 12px', textAlign:i>=4&&i<=6?'right':'left', fontSize:11, whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td colSpan={10} style={{ padding:40, textAlign:'center', color:'#aab2bd', fontStyle:'italic' }}>
                No assets found. Add your first asset.
              </td></tr>
            ) : visible.map((a,i)=>{
              const nbv = calcNBV(a, asOf)
              const pctDepr = +a.purchase_cost > 0 ? ((+a.purchase_cost - nbv) / +a.purchase_cost * 100) : 0
              return (
                <tr key={a.id} style={{ borderBottom:'1px solid #f5f5f5', background:i%2?'#fafafa':'#fff' }}>
                  <td style={{ padding:'8px 12px', color:'#9e9e9e', fontFamily:'monospace', fontSize:11 }}>{a.asset_code}</td>
                  <td style={{ padding:'8px 12px', fontWeight:600, color:'#1a2e3d' }}>
                    <div>{CAT_ICONS[a.category]||'📦'} {a.asset_name}</div>
                    {a.department && <div style={{ fontSize:10, color:'#9e9e9e' }}>{a.department}</div>}
                  </td>
                  <td style={{ padding:'8px 12px', color:'#546e7a' }}>{a.category}</td>
                  <td style={{ padding:'8px 12px', color:'#546e7a' }}>{fmtD(a.purchase_date)}</td>
                  <td style={{ padding:'8px 12px', textAlign:'right', fontFamily:'monospace' }}>{fmt(a.purchase_cost)}</td>
                  <td style={{ padding:'8px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#2e7d32' }}>
                    <div>{fmt(nbv)}</div>
                    <div style={{ fontSize:9, color:'#aab2bd' }}>{pctDepr.toFixed(0)}% depr'd</div>
                  </td>
                  <td style={{ padding:'8px 12px', textAlign:'right', fontSize:11, color:'#546e7a' }}>
                    {a.depreciation_method === 'STRAIGHT_LINE' ? 'SL' :
                     a.depreciation_method === 'DECLINING_BALANCE' ? 'DB' : '—'}
                  </td>
                  <td style={{ padding:'8px 12px', textAlign:'right', fontSize:11, color:'#546e7a' }}>
                    {a.depreciation_method !== 'NONE' && a.category !== 'LAND' ? `${a.useful_life_months}m` : '—'}
                  </td>
                  <td style={{ padding:'8px 12px' }}>
                    <span style={{ padding:'2px 8px', borderRadius:10, fontSize:10, fontWeight:700,
                      background: STATUS_COLOR[a.status]+'22', color: STATUS_COLOR[a.status] }}>
                      {a.status.replace('_',' ')}
                    </span>
                  </td>
                  <td style={{ padding:'8px 12px' }}>
                    <button onClick={()=>openEdit(a)} style={{ ...S.btnO('#546e7a'), padding:'4px 10px', fontSize:11 }}>Edit</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {modal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:680, maxHeight:'90vh', overflowY:'auto', padding:24 }}>
            <div style={{ fontSize:18, fontWeight:800, marginBottom:20 }}>
              {modal==='add' ? '➕ Add Fixed Asset' : `✏️ Edit: ${modal.asset_name}`}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <FRow label="Asset Code"><input value={form.asset_code} onChange={e=>setForm(f=>({...f,asset_code:e.target.value}))} style={S.inp} placeholder="Auto-generated if blank" /></FRow>
              <FRow label="Asset Name" required><input value={form.asset_name} onChange={e=>setForm(f=>({...f,asset_name:e.target.value}))} style={S.inp} /></FRow>

              <FRow label="Category">
                <select value={form.category} onChange={e=>setForm(f=>({...f,category:e.target.value}))} style={S.inp}>
                  {CATEGORIES.map(c=><option key={c} value={c}>{CAT_ICONS[c]} {c}</option>)}
                </select>
              </FRow>
              <FRow label="Status">
                <select value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={S.inp}>
                  {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </FRow>

              <FRow label="Purchase Date" required><input type="date" value={form.purchase_date} onChange={e=>setForm(f=>({...f,purchase_date:e.target.value}))} style={S.inp} /></FRow>
              <FRow label="Purchase Cost (SAR)" required><input type="number" min="0" step="0.01" value={form.purchase_cost} onChange={e=>setForm(f=>({...f,purchase_cost:e.target.value}))} style={S.inp} /></FRow>

              <FRow label="Residual / Salvage Value (SAR)"><input type="number" min="0" step="0.01" value={form.residual_value} onChange={e=>setForm(f=>({...f,residual_value:e.target.value}))} style={S.inp} /></FRow>
              <FRow label="Depreciation Method">
                <select value={form.depreciation_method} onChange={e=>setForm(f=>({...f,depreciation_method:e.target.value}))} style={S.inp}>
                  {METHODS.map(m=><option key={m} value={m}>{m.replace('_',' ')}</option>)}
                </select>
              </FRow>

              <FRow label="Useful Life (months)"><input type="number" min="1" value={form.useful_life_months} onChange={e=>setForm(f=>({...f,useful_life_months:e.target.value}))} style={S.inp} /></FRow>
              {form.depreciation_method === 'DECLINING_BALANCE' && (
                <FRow label="Declining Rate (e.g. 0.20 = 20%)"><input type="number" min="0" max="1" step="0.01" value={form.depreciation_rate} onChange={e=>setForm(f=>({...f,depreciation_rate:e.target.value}))} style={S.inp} /></FRow>
              )}

              <FRow label="Supplier"><input value={form.supplier_name} onChange={e=>setForm(f=>({...f,supplier_name:e.target.value}))} style={S.inp} /></FRow>
              <FRow label="Invoice / PO Reference"><input value={form.invoice_reference} onChange={e=>setForm(f=>({...f,invoice_reference:e.target.value}))} style={S.inp} /></FRow>

              <FRow label="Department"><input value={form.department} onChange={e=>setForm(f=>({...f,department:e.target.value}))} style={S.inp} /></FRow>
              <FRow label="Location"><input value={form.location} onChange={e=>setForm(f=>({...f,location:e.target.value}))} style={S.inp} /></FRow>
              <FRow label="Assigned To"><input value={form.assigned_to} onChange={e=>setForm(f=>({...f,assigned_to:e.target.value}))} style={S.inp} /></FRow>
              <FRow label="Serial Number"><input value={form.serial_number} onChange={e=>setForm(f=>({...f,serial_number:e.target.value}))} style={S.inp} /></FRow>

              <div style={{ gridColumn:'1/-1', background:'#f5f7fa', borderRadius:8, padding:12, marginTop:4 }}>
                <div style={{ fontWeight:700, fontSize:11, color:'#6b7c93', marginBottom:8 }}>GL ACCOUNT CODES (optional)</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                  <FRow label="Asset Account"><input value={form.asset_account_code} onChange={e=>setForm(f=>({...f,asset_account_code:e.target.value}))} style={S.inp} placeholder="e.g. 1500" /></FRow>
                  <FRow label="Accum. Depr Account"><input value={form.accum_depr_account} onChange={e=>setForm(f=>({...f,accum_depr_account:e.target.value}))} style={S.inp} placeholder="e.g. 1590" /></FRow>
                  <FRow label="Depr. Expense Account"><input value={form.depr_expense_account} onChange={e=>setForm(f=>({...f,depr_expense_account:e.target.value}))} style={S.inp} placeholder="e.g. 6100" /></FRow>
                </div>
              </div>

              {(form.status === 'DISPOSED') && (
                <div style={{ gridColumn:'1/-1', background:'#ffebee', borderRadius:8, padding:12 }}>
                  <div style={{ fontWeight:700, fontSize:11, color:'#c62828', marginBottom:8 }}>DISPOSAL DETAILS</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    <FRow label="Disposal Date"><input type="date" value={form.disposal_date} onChange={e=>setForm(f=>({...f,disposal_date:e.target.value}))} style={S.inp} /></FRow>
                    <FRow label="Disposal Proceeds (SAR)"><input type="number" min="0" step="0.01" value={form.disposal_proceeds} onChange={e=>setForm(f=>({...f,disposal_proceeds:e.target.value}))} style={S.inp} /></FRow>
                    <div style={{ gridColumn:'1/-1' }}><FRow label="Disposal Notes"><input value={form.disposal_notes} onChange={e=>setForm(f=>({...f,disposal_notes:e.target.value}))} style={S.inp} /></FRow></div>
                  </div>
                </div>
              )}

              <div style={{ gridColumn:'1/-1' }}>
                <FRow label="Notes"><textarea value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} style={{ ...S.inp, height:60, resize:'vertical' }} /></FRow>
              </div>
            </div>

            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:20 }}>
              <button onClick={()=>setModal(null)} style={S.btnO()}>Cancel</button>
              <button onClick={save} disabled={saving} style={S.btn('#2e7d32')}>
                {saving ? 'Saving…' : modal==='add' ? '✓ Save Asset' : '✓ Update Asset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 2 — Depreciation Schedule
// ═══════════════════════════════════════════════════════════════════
function DepreciationSchedule({ entityId, assets, reload }) {
  const [selected,  setSelected]  = useState(null)
  const [asOf,      setAsOf]      = useState(new Date().toISOString().slice(0,10))
  const [postMsg,   setPostMsg]   = useState('')
  const [posting,   setPosting]   = useState(false)

  const active = assets.filter(a => a.status === 'ACTIVE')

  async function postMonthlyDeprToGL(asset) {
    // Post depreciation for current month to ledger_entries
    if (!asset.depr_expense_account || !asset.accum_depr_account) {
      return alert('Please set GL accounts (Depr. Expense + Accum. Depr) on the asset before posting.')
    }
    setPosting(true)
    const now    = new Date()
    const month  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`
    const depr   = calcMonthlyDepr(asset, asOf)
    const date   = `${month}-01`

    const entries = [
      { entity_id:entityId, entry_date:date, voucher_type:'DEP', voucher_number:`DEP-${asset.asset_code}-${month}`,
        account_code:asset.depr_expense_account, account_name:'Depreciation Expense', debit:depr, credit:0,
        description:`Depreciation: ${asset.asset_name} — ${month}` },
      { entity_id:entityId, entry_date:date, voucher_type:'DEP', voucher_number:`DEP-${asset.asset_code}-${month}`,
        account_code:asset.accum_depr_account, account_name:'Accumulated Depreciation', debit:0, credit:depr,
        description:`Depreciation: ${asset.asset_name} — ${month}` },
    ]
    const { error } = await supabase.from('ledger_entries').insert(entries)
    setPosting(false)
    if (!error) setPostMsg(`✓ Posted depreciation for ${asset.asset_name}: SAR ${fmt(depr)} to GL.`)
    else setPostMsg(`✗ Error: ${error.message}`)
  }

  const schedule = selected ? buildSchedule(selected) : []
  const currentNBV = selected ? calcNBV(selected, asOf) : 0
  const currentAccum = selected ? (+selected.purchase_cost||0) - currentNBV : 0

  function exportCSV() {
    if (!selected) return
    const rows = [
      [`Depreciation Schedule — ${selected.asset_name}`],
      [`Cost: ${fmt(selected.purchase_cost)} | Method: ${selected.depreciation_method} | Life: ${selected.useful_life_months} months`],[],
      ['Period','Monthly Depr','Accumulated Depr','Net Book Value'],
      ...schedule.map(r=>[r.period, r.depr.toFixed(2), r.accum.toFixed(2), r.nbv.toFixed(2)]),
    ]
    const blob = new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'})
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob)
    a.download=`depr-${selected.asset_code}.csv`; a.click()
  }

  return (
    <div style={{ display:'grid', gridTemplateColumns:'260px 1fr', gap:12 }}>
      {/* Asset list panel */}
      <div style={{ ...S.card, padding:0, overflow:'hidden', alignSelf:'start' }}>
        <div style={{ padding:'10px 14px', background:'#1a2e3d', color:'#fff', fontWeight:700, fontSize:12 }}>
          Select Asset ({active.length} active)
        </div>
        {active.length === 0 ? (
          <div style={{ padding:24, textAlign:'center', color:'#aab2bd', fontSize:12 }}>No active assets</div>
        ) : active.map(a=>(
          <div key={a.id} onClick={()=>setSelected(a)}
            style={{ padding:'10px 14px', borderBottom:'1px solid #f5f5f5', cursor:'pointer',
              background: selected?.id===a.id ? '#e3f2fd' : 'transparent' }}>
            <div style={{ fontWeight:600, fontSize:12, color:'#1a2e3d' }}>{CAT_ICONS[a.category]} {a.asset_name}</div>
            <div style={{ fontSize:10, color:'#9e9e9e', marginTop:2 }}>
              {a.asset_code} · {a.useful_life_months}m · {a.depreciation_method==='STRAIGHT_LINE'?'SL':'DB'}
            </div>
          </div>
        ))}
      </div>

      {/* Schedule panel */}
      <div>
        {!selected ? (
          <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>
            ← Select an asset to view its depreciation schedule
          </div>
        ) : (
          <>
            {/* Asset header */}
            <div style={{ ...S.card }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>{CAT_ICONS[selected.category]} {selected.asset_name}</div>
                  <div style={{ fontSize:11, color:'#6b7c93' }}>
                    {selected.asset_code} · {selected.category} · {selected.depreciation_method.replace('_',' ')} over {selected.useful_life_months} months
                  </div>
                </div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
                  <div>
                    <label style={{ ...S.lbl, marginBottom:2 }}>NBV as-of</label>
                    <input type="date" value={asOf} onChange={e=>setAsOf(e.target.value)} style={{ ...S.inp, width:140 }} />
                  </div>
                  <button onClick={exportCSV} style={S.btnO()}>⬇ CSV</button>
                  <button onClick={()=>postMonthlyDeprToGL(selected)} disabled={posting} style={S.btn('#1565C0')}>
                    {posting?'Posting…':'📒 Post Month to GL'}
                  </button>
                </div>
              </div>

              {postMsg && (
                <div style={{ marginTop:10, padding:'8px 12px', borderRadius:8, background: postMsg.startsWith('✓')?'#e8f5e9':'#ffebee', fontSize:12, color: postMsg.startsWith('✓')?'#2e7d32':'#c62828' }}>
                  {postMsg}
                </div>
              )}

              {/* Summary cards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginTop:14 }}>
                {[
                  { label:'Purchase Cost',  val:selected.purchase_cost, color:'#1a2e3d' },
                  { label:'Accumulated Depr', val:currentAccum,         color:'#c62828' },
                  { label:`NBV at ${fmtD(asOf)}`, val:currentNBV,       color:'#2e7d32' },
                  { label:'Monthly Depr',   val:calcMonthlyDepr(selected,asOf), color:'#e65100' },
                ].map(k=>(
                  <div key={k.label} style={{ background:'#f5f7fa', borderRadius:8, padding:'10px 12px', borderLeft:`3px solid ${k.color}` }}>
                    <div style={{ fontSize:9, color:'#6b7c93' }}>{k.label}</div>
                    <div style={{ fontWeight:800, fontSize:14, color:k.color }}>{fmt(k.val)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Schedule table */}
            <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
              <div style={{ padding:'10px 14px', background:'#1a2e3d', color:'#fff', fontWeight:700, fontSize:12 }}>
                Depreciation Schedule — {schedule.length} periods
              </div>
              <div style={{ maxHeight:400, overflowY:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead style={{ position:'sticky', top:0 }}>
                    <tr style={{ background:'#37474f', color:'#fff' }}>
                      <th style={{ padding:'8px 14px', textAlign:'left' }}>#</th>
                      <th style={{ padding:'8px 14px', textAlign:'left' }}>Period</th>
                      <th style={{ padding:'8px 14px', textAlign:'right' }}>Monthly Depr</th>
                      <th style={{ padding:'8px 14px', textAlign:'right' }}>Accumulated</th>
                      <th style={{ padding:'8px 14px', textAlign:'right' }}>Net Book Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((r,i)=>(
                      <tr key={i} style={{ borderBottom:'1px solid #f5f5f5', background:i%2?'#fafafa':'#fff' }}>
                        <td style={{ padding:'6px 14px', color:'#9e9e9e', fontSize:11 }}>{i+1}</td>
                        <td style={{ padding:'6px 14px' }}>{r.period}</td>
                        <td style={{ padding:'6px 14px', textAlign:'right', fontFamily:'monospace', color:'#c62828' }}>{fmt(r.depr)}</td>
                        <td style={{ padding:'6px 14px', textAlign:'right', fontFamily:'monospace', color:'#e65100' }}>{fmt(r.accum)}</td>
                        <td style={{ padding:'6px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#2e7d32' }}>{fmt(r.nbv)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Tab 3 — NBV Summary (Balance Sheet view)
// ═══════════════════════════════════════════════════════════════════
function NBVSummary({ assets }) {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0,10))

  const byCategory = CATEGORIES.map(cat => {
    const group = assets.filter(a => a.category === cat && a.status !== 'DISPOSED')
    const cost   = group.reduce((s,a) => s + (+a.purchase_cost||0), 0)
    const nbv    = group.reduce((s,a) => s + calcNBV(a, asOf), 0)
    const accum  = cost - nbv
    return { cat, count:group.length, cost, accum, nbv }
  }).filter(g => g.count > 0)

  const totCost  = byCategory.reduce((s,g) => s+g.cost,  0)
  const totAccum = byCategory.reduce((s,g) => s+g.accum, 0)
  const totNBV   = byCategory.reduce((s,g) => s+g.nbv,   0)

  function printReport() {
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>Fixed Assets Summary</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;font-size:11px;max-width:700px;margin:0 auto}
    h2{font-size:16px;margin:0}p{color:#666;margin:2px 0 16px}
    table{width:100%;border-collapse:collapse}
    th{background:#1a2e3d;color:#fff;padding:8px 12px;text-align:left;font-size:10px}
    td{padding:7px 12px;border-bottom:1px solid #f5f5f5;font-size:11px}
    td:not(:first-child):not(:nth-child(2)){text-align:right;font-family:monospace}
    .tot{background:#f0f4f8;font-weight:800}.tot td{padding:9px 12px}
    @media print{@page{size:A4;margin:1.5cm}}</style></head><body>
    <h2>Fixed Assets — NBV Summary</h2>
    <p>As of ${fmtD(asOf)} | All amounts in SAR</p>
    <table>
      <tr><th>Category</th><th>Assets</th><th>Cost</th><th>Accum. Depr</th><th>Net Book Value</th></tr>
      ${byCategory.map(g=>`<tr><td>${CAT_ICONS[g.cat]} ${g.cat}</td><td>${g.count}</td><td>${fmt(g.cost)}</td><td>(${fmt(g.accum)})</td><td style="font-weight:700;color:#2e7d32">${fmt(g.nbv)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="2">TOTAL</td><td>${fmt(totCost)}</td><td>(${fmt(totAccum)})</td><td style="color:#2e7d32">${fmt(totNBV)}</td></tr>
    </table>
    <script>window.onload=()=>window.print()<\/script></body></html>`)
    w.document.close()
  }

  return (
    <>
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div>
          <label style={S.lbl}>NBV as-of date</label>
          <input type="date" value={asOf} onChange={e=>setAsOf(e.target.value)} style={{ ...S.inp, width:160 }} />
        </div>
        <button onClick={printReport} style={{ ...S.btnO('#2e7d32'), marginLeft:'auto' }}>🖨 Print</button>
      </div>

      {/* Category cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:10, marginBottom:14 }}>
        {byCategory.map(g=>(
          <div key={g.cat} style={{ background:'#fff', borderRadius:12, padding:'14px 16px', boxShadow:'0 1px 6px rgba(0,0,0,0.07)' }}>
            <div style={{ fontSize:22, marginBottom:4 }}>{CAT_ICONS[g.cat]}</div>
            <div style={{ fontSize:11, color:'#6b7c93', fontWeight:700 }}>{g.cat} ({g.count})</div>
            <div style={{ fontWeight:800, fontSize:16, color:'#2e7d32', marginTop:4 }}>{fmt(g.nbv)} SAR</div>
            <div style={{ fontSize:10, color:'#aab2bd', marginTop:2 }}>Cost: {fmt(g.cost)}</div>
            <div style={{ fontSize:10, color:'#c62828' }}>Depr: ({fmt(g.accum)})</div>
          </div>
        ))}
      </div>

      {/* Summary table */}
      <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:'#1a2e3d', color:'#fff' }}>
              {['Category','Assets','Cost (SAR)','Accumulated Depr (SAR)','Net Book Value (SAR)'].map((h,i)=>(
                <th key={i} style={{ padding:'9px 14px', textAlign:i>=2?'right':'left', fontSize:11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byCategory.length === 0 ? (
              <tr><td colSpan={5} style={{ padding:40, textAlign:'center', color:'#aab2bd', fontStyle:'italic' }}>No assets found</td></tr>
            ) : byCategory.map((g,i)=>(
              <tr key={g.cat} style={{ borderBottom:'1px solid #f5f5f5', background:i%2?'#fafafa':'#fff' }}>
                <td style={{ padding:'9px 14px', fontSize:13 }}>{CAT_ICONS[g.cat]} {g.cat}</td>
                <td style={{ padding:'9px 14px', fontSize:12, color:'#546e7a' }}>{g.count}</td>
                <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12 }}>{fmt(g.cost)}</td>
                <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12, color:'#c62828' }}>({fmt(g.accum)})</td>
                <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontSize:13, fontWeight:800, color:'#2e7d32' }}>{fmt(g.nbv)}</td>
              </tr>
            ))}
            <tr style={{ background:'#f0f4f8', borderTop:'2px solid #e0e0e0' }}>
              <td style={{ padding:'11px 14px', fontWeight:800, fontSize:14 }}>TOTAL</td>
              <td style={{ padding:'11px 14px', fontWeight:700 }}>{assets.filter(a=>a.status!=='DISPOSED').length}</td>
              <td style={{ padding:'11px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700, fontSize:13 }}>{fmt(totCost)}</td>
              <td style={{ padding:'11px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700, fontSize:13, color:'#c62828' }}>({fmt(totAccum)})</td>
              <td style={{ padding:'11px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:15, color:'#2e7d32' }}>{fmt(totNBV)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ fontSize:11, color:'#aab2bd', marginTop:6 }}>
        NBV = Net Book Value. Use this total as your Fixed Assets balance for the Balance Sheet.
        LAND assets are not depreciated. DISPOSED assets excluded.
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════
export default function FixedAssets({ entityId }) {
  const [tab,     setTab]    = useState('register')
  const [assets,  setAssets] = useState([])
  const [loading, setLoading]= useState(true)

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('fixed_assets')
      .select('*')
      .eq('entity_id', entityId)
      .order('purchase_date', { ascending:false })
    setAssets(data||[])
    setLoading(false)
  }

  const TABS = [
    { key:'register',    label:'🗂 Asset Register' },
    { key:'depreciation',label:'📉 Depreciation Schedule' },
    { key:'summary',     label:'📋 NBV Summary' },
  ]

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>
        Asset register with straight-line & declining-balance depreciation · NBV tracking · GL posting
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:14 }}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={tab===t.key ? S.btn('#1a2e3d') : S.btnO('#546e7a')}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading assets…</div>
      ) : (
        <>
          {tab === 'register'    && <AssetRegister       entityId={entityId} assets={assets} reload={load} />}
          {tab === 'depreciation'&& <DepreciationSchedule entityId={entityId} assets={assets} reload={load} />}
          {tab === 'summary'     && <NBVSummary           assets={assets} />}
        </>
      )}
    </div>
  )
}
