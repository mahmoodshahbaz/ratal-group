import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.Accounting
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.52)', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'20px 10px', overflowY:'auto' },
  modal:   { background:'#fff', borderRadius:16, width:720, maxWidth:'96vw', boxShadow:'0 8px 40px rgba(0,0,0,0.2)', marginTop:'auto', marginBottom:'auto', overflow:'hidden' },
  inp:     { width:'100%', padding:'8px 11px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box' },
  label:   { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4, textTransform:'uppercase', letterSpacing:0.4 },
  row:     { display:'flex', gap:12, marginBottom:14 },
  col:     { flex:1 },
  btn:     (bg, fg='#fff') => ({ background:bg, color:fg, border:'none', borderRadius:9, padding:'9px 20px', cursor:'pointer', fontSize:13, fontWeight:700 }),
  th:      { padding:'9px 10px', textAlign:'left', fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:0.4, background:MC, color:'#fff', borderBottom:'2px solid #e8edf2', whiteSpace:'nowrap' },
  td:      { padding:'9px 10px', fontSize:12, color:'#2d3a45', borderBottom:'1px solid #f0f4f8', verticalAlign:'middle' },
}

function fmt(n) {
  return new Intl.NumberFormat('en-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0)
}

// ─────────────────────────────────────────────────────────────────────────────
// BANK ACCOUNTS TAB
// ─────────────────────────────────────────────────────────────────────────────
const EMPTY_BANK = {
  account_name:'', bank_name:'', account_number:'',
  account_type:'BANK', currency:'SAR',
  opening_balance:'0', opening_date: new Date().toISOString().split('T')[0],
  notes:'',
}

function BankAccountsTab({ entityId }) {
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]     = useState(EMPTY_BANK)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('bank_accounts').select('*')
      .eq('entity_id', entityId).order('sort_order').order('created_at')
    setRows(data || [])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  function openNew() { setForm(EMPTY_BANK); setEditId(null); setErr(''); setShowModal(true) }
  function openEdit(r) {
    setForm({
      account_name: r.account_name||'', bank_name: r.bank_name||'',
      account_number: r.account_number||'', account_type: r.account_type||'BANK',
      currency: r.currency||'SAR', opening_balance: r.opening_balance||'0',
      opening_date: r.opening_date||new Date().toISOString().split('T')[0],
      notes: r.notes||'',
    })
    setEditId(r.id); setErr(''); setShowModal(true)
  }

  async function save() {
    if (!form.account_name.trim()) { setErr('Account name is required'); return }
    setSaving(true)
    const payload = { ...form, entity_id: entityId, opening_balance: +form.opening_balance || 0 }
    let error
    if (editId) {
      ;({ error } = await supabase.from('bank_accounts').update(payload).eq('id', editId))
    } else {
      ;({ error } = await supabase.from('bank_accounts').insert(payload))
    }
    setSaving(false)
    if (error) { setErr(error.message); return }
    setShowModal(false); load()
  }

  async function toggleActive(r) {
    await supabase.from('bank_accounts').update({ is_active: !r.is_active }).eq('id', r.id)
    load()
  }

  const typeLabel = { BANK:'Bank', CASH:'Cash', PETTY_CASH:'Petty Cash' }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:13, color:'#6b7c93' }}>{rows.length} account{rows.length!==1?'s':''}</div>
        <button style={S.btn('#1a7f4b')} onClick={openNew}>+ Add Bank Account</button>
      </div>

      {loading ? <div style={{ padding:40, textAlign:'center', color:'#aab2bd' }}>Loading…</div> : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Account Name','Bank','Account No.','Type','Currency','Opening Bal.','Status',''].map(h=>(
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length===0 && (
                <tr><td colSpan={8} style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No bank accounts yet</td></tr>
              )}
              {rows.map(r=>(
                <tr key={r.id} style={{ background: r.is_active ? '#fff' : '#f9f9f9' }}>
                  <td style={S.td}><strong>{r.account_name}</strong></td>
                  <td style={S.td}>{r.bank_name||'—'}</td>
                  <td style={S.td}><code style={{ fontSize:11 }}>{r.account_number||'—'}</code></td>
                  <td style={S.td}><span style={{ background:'#e8f5e9', color:'#2e7d32', padding:'2px 8px', borderRadius:12, fontSize:11, fontWeight:700 }}>{typeLabel[r.account_type]||r.account_type}</span></td>
                  <td style={S.td}>{r.currency||'SAR'}</td>
                  <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace' }}>{fmt(r.opening_balance)}</td>
                  <td style={S.td}>
                    <span style={{ color: r.is_active ? '#27ae60' : '#aab2bd', fontWeight:700, fontSize:11 }}>
                      {r.is_active ? '● Active' : '○ Inactive'}
                    </span>
                  </td>
                  <td style={S.td}>
                    <button onClick={()=>openEdit(r)} style={{ ...S.btn('#e8edf5','#2d3a45'), padding:'4px 12px', fontSize:11, marginRight:6 }}>Edit</button>
                    <button onClick={()=>toggleActive(r)} style={{ ...S.btn(r.is_active?'#fff3e0':'#e8f5e9', r.is_active?'#e65100':'#2e7d32'), padding:'4px 10px', fontSize:11 }}>
                      {r.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
          <div style={S.modal}>
            <div style={{ background:'#1a2e3d', color:'#fff', padding:'18px 24px', fontWeight:800, fontSize:15 }}>
              {editId ? 'Edit Bank Account' : 'Add Bank Account'}
            </div>
            <div style={{ padding:24 }}>
              {err && <div style={{ background:'#fdecea', color:'#c0392b', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>{err}</div>}
              <div style={S.row}>
                <div style={S.col}>
                  <label style={S.label}>Account Name *</label>
                  <input style={S.inp} value={form.account_name} onChange={e=>setForm(f=>({...f,account_name:e.target.value}))} placeholder="e.g. ANB Main Operations" />
                </div>
                <div style={S.col}>
                  <label style={S.label}>Account Type</label>
                  <select style={S.inp} value={form.account_type} onChange={e=>setForm(f=>({...f,account_type:e.target.value}))}>
                    <option value="BANK">Bank</option>
                    <option value="CASH">Cash</option>
                    <option value="PETTY_CASH">Petty Cash</option>
                  </select>
                </div>
              </div>
              <div style={S.row}>
                <div style={S.col}>
                  <label style={S.label}>Bank Name</label>
                  <input style={S.inp} value={form.bank_name} onChange={e=>setForm(f=>({...f,bank_name:e.target.value}))} placeholder="Arab National Bank" />
                </div>
                <div style={S.col}>
                  <label style={S.label}>Account / IBAN Number</label>
                  <input style={S.inp} value={form.account_number} onChange={e=>setForm(f=>({...f,account_number:e.target.value}))} placeholder="SA00 0000 0000 0000" />
                </div>
              </div>
              <div style={S.row}>
                <div style={S.col}>
                  <label style={S.label}>Opening Balance (SAR)</label>
                  <input style={S.inp} type="number" value={form.opening_balance} onChange={e=>setForm(f=>({...f,opening_balance:e.target.value}))} />
                </div>
                <div style={S.col}>
                  <label style={S.label}>Opening Date</label>
                  <input style={S.inp} type="date" value={form.opening_date} onChange={e=>setForm(f=>({...f,opening_date:e.target.value}))} />
                </div>
                <div style={{ width:100 }}>
                  <label style={S.label}>Currency</label>
                  <select style={S.inp} value={form.currency} onChange={e=>setForm(f=>({...f,currency:e.target.value}))}>
                    <option>SAR</option><option>USD</option><option>EUR</option><option>GBP</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={S.label}>Notes</label>
                <textarea style={{ ...S.inp, height:60, resize:'vertical' }} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                <button style={S.btn('#e8edf5','#2d3a45')} onClick={()=>setShowModal(false)}>Cancel</button>
                <button style={S.btn('#1a7f4b')} onClick={save} disabled={saving}>{saving?'Saving…':'Save Account'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FIXED ASSETS TAB
// ─────────────────────────────────────────────────────────────────────────────
const ASSET_CATEGORIES = ['COMPUTER_EQUIPMENT','FURNITURE','VEHICLE','MACHINERY','OFFICE_EQUIPMENT','OTHER']
const EMPTY_ASSET = {
  asset_code:'', asset_name:'', asset_category:'COMPUTER_EQUIPMENT',
  asset_date: new Date().toISOString().split('T')[0],
  purchase_value:'', depreciation_rate:'33.33', useful_life_years:'3',
  salvage_value:'0', current_value:'', notes:'',
}

function FixedAssetsTab({ entityId }) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]       = useState(EMPTY_ASSET)
  const [editId, setEditId]   = useState(null)
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('asset_accounts').select('*')
      .eq('entity_id', entityId).order('asset_date', { ascending:false })
    setRows(data || [])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  function openNew() { setForm(EMPTY_ASSET); setEditId(null); setErr(''); setShowModal(true) }
  function openEdit(r) {
    setForm({
      asset_code: r.asset_code||'', asset_name: r.asset_name||'',
      asset_category: r.asset_category||'COMPUTER_EQUIPMENT',
      asset_date: r.asset_date||new Date().toISOString().split('T')[0],
      purchase_value: r.purchase_value||'', depreciation_rate: r.depreciation_rate||'33.33',
      useful_life_years: r.useful_life_years||'3', salvage_value: r.salvage_value||'0',
      current_value: r.current_value||'', notes: r.notes||'',
    })
    setEditId(r.id); setErr(''); setShowModal(true)
  }

  async function save() {
    if (!form.asset_name.trim()) { setErr('Asset name is required'); return }
    if (!form.purchase_value)    { setErr('Purchase value is required'); return }
    setSaving(true)
    const pv = +form.purchase_value || 0
    const sv = +form.salvage_value  || 0
    const cv = form.current_value !== '' ? +form.current_value : pv
    const payload = {
      ...form, entity_id: entityId,
      purchase_value: pv, salvage_value: sv, current_value: cv,
      depreciation_rate: +form.depreciation_rate || 0,
      useful_life_years: +form.useful_life_years || 0,
      status: 'ACTIVE',
    }
    let error
    if (editId) {
      ;({ error } = await supabase.from('asset_accounts').update(payload).eq('id', editId))
    } else {
      ;({ error } = await supabase.from('asset_accounts').insert(payload))
    }
    setSaving(false)
    if (error) { setErr(error.message); return }
    setShowModal(false); load()
  }

  const catLabel = c => c.replace(/_/g,' ')
  const statusBadge = s => {
    const map = { ACTIVE:['#e8f5e9','#2e7d32'], DISPOSED:['#fce4ec','#c62828'], FULLY_DEPRECIATED:['#f3e5f5','#6a1b9a'] }
    const [bg,fg] = map[s]||['#f5f5f5','#555']
    return <span style={{ background:bg, color:fg, padding:'2px 8px', borderRadius:12, fontSize:11, fontWeight:700 }}>{s?.replace(/_/g,' ')}</span>
  }

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:13, color:'#6b7c93' }}>{rows.length} asset{rows.length!==1?'s':''}</div>
        <button style={S.btn('#1a7f4b')} onClick={openNew}>+ Add Asset</button>
      </div>

      {loading ? <div style={{ padding:40, textAlign:'center', color:'#aab2bd' }}>Loading…</div> : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Code','Asset Name','Category','Date','Purchase Value','Dep. Rate','Current Value','Status',''].map(h=>(
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length===0 && (
                <tr><td colSpan={9} style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No fixed assets yet</td></tr>
              )}
              {rows.map(r=>(
                <tr key={r.id}>
                  <td style={S.td}><code style={{ fontSize:11 }}>{r.asset_code||'—'}</code></td>
                  <td style={S.td}><strong>{r.asset_name}</strong></td>
                  <td style={S.td}>{catLabel(r.asset_category)}</td>
                  <td style={S.td}>{r.asset_date}</td>
                  <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace' }}>{fmt(r.purchase_value)}</td>
                  <td style={{ ...S.td, textAlign:'center' }}>{r.depreciation_rate}%</td>
                  <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color: +r.current_value < +r.purchase_value * 0.2 ? '#e74c3c':'#2d3a45' }}>{fmt(r.current_value)}</td>
                  <td style={S.td}>{statusBadge(r.status)}</td>
                  <td style={S.td}>
                    <button onClick={()=>openEdit(r)} style={{ ...S.btn('#e8edf5','#2d3a45'), padding:'4px 12px', fontSize:11 }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
          <div style={S.modal}>
            <div style={{ background:'#1a2e3d', color:'#fff', padding:'18px 24px', fontWeight:800, fontSize:15 }}>
              {editId ? 'Edit Fixed Asset' : 'Add Fixed Asset'}
            </div>
            <div style={{ padding:24 }}>
              {err && <div style={{ background:'#fdecea', color:'#c0392b', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>{err}</div>}
              <div style={S.row}>
                <div style={{ width:140 }}>
                  <label style={S.label}>Asset Code</label>
                  <input style={S.inp} value={form.asset_code} onChange={e=>setForm(f=>({...f,asset_code:e.target.value}))} placeholder="PC-001" />
                </div>
                <div style={S.col}>
                  <label style={S.label}>Asset Name *</label>
                  <input style={S.inp} value={form.asset_name} onChange={e=>setForm(f=>({...f,asset_name:e.target.value}))} placeholder="Dell Laptop i7" />
                </div>
              </div>
              <div style={S.row}>
                <div style={S.col}>
                  <label style={S.label}>Category</label>
                  <select style={S.inp} value={form.asset_category} onChange={e=>setForm(f=>({...f,asset_category:e.target.value}))}>
                    {ASSET_CATEGORIES.map(c=><option key={c} value={c}>{catLabel(c)}</option>)}
                  </select>
                </div>
                <div style={S.col}>
                  <label style={S.label}>Purchase Date</label>
                  <input style={S.inp} type="date" value={form.asset_date} onChange={e=>setForm(f=>({...f,asset_date:e.target.value}))} />
                </div>
              </div>
              <div style={S.row}>
                <div style={S.col}>
                  <label style={S.label}>Purchase Value (SAR) *</label>
                  <input style={S.inp} type="number" value={form.purchase_value} onChange={e=>{
                    const pv = +e.target.value||0
                    const sv = +form.salvage_value||0
                    const life = +form.useful_life_years||1
                    const annualDep = (pv-sv)/life
                    const cv = Math.max(0, pv - annualDep)
                    setForm(f=>({...f, purchase_value:e.target.value, current_value: String(cv.toFixed(2)) }))
                  }} />
                </div>
                <div style={S.col}>
                  <label style={S.label}>Salvage Value (SAR)</label>
                  <input style={S.inp} type="number" value={form.salvage_value} onChange={e=>setForm(f=>({...f,salvage_value:e.target.value}))} />
                </div>
              </div>
              <div style={S.row}>
                <div style={S.col}>
                  <label style={S.label}>Useful Life (Years)</label>
                  <input style={S.inp} type="number" value={form.useful_life_years} onChange={e=>{
                    const life = +e.target.value||1
                    const rate = +(100/life).toFixed(2)
                    setForm(f=>({...f,useful_life_years:e.target.value, depreciation_rate:String(rate)}))
                  }} />
                </div>
                <div style={S.col}>
                  <label style={S.label}>Depreciation Rate (% p.a.)</label>
                  <input style={S.inp} type="number" value={form.depreciation_rate} onChange={e=>setForm(f=>({...f,depreciation_rate:e.target.value}))} />
                </div>
                <div style={S.col}>
                  <label style={S.label}>Current Book Value</label>
                  <input style={S.inp} type="number" value={form.current_value} onChange={e=>setForm(f=>({...f,current_value:e.target.value}))} />
                </div>
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={S.label}>Notes</label>
                <textarea style={{ ...S.inp, height:50, resize:'vertical' }} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                <button style={S.btn('#e8edf5','#2d3a45')} onClick={()=>setShowModal(false)}>Cancel</button>
                <button style={S.btn('#1a7f4b')} onClick={save} disabled={saving}>{saving?'Saving…':'Save Asset'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CAPITAL ACCOUNTS TAB
// ─────────────────────────────────────────────────────────────────────────────
const EMPTY_CAPITAL = { capital_name:'', opening_balance:'0', notes:'' }

function CapitalAccountsTab({ entityId }) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]       = useState(EMPTY_CAPITAL)
  const [editId, setEditId]   = useState(null)
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('capital_accounts').select('*')
      .eq('entity_id', entityId).order('created_at')
    setRows(data || [])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  function openNew() { setForm(EMPTY_CAPITAL); setEditId(null); setErr(''); setShowModal(true) }
  function openEdit(r) {
    setForm({ capital_name: r.capital_name||'', opening_balance: r.opening_balance||'0', notes: r.notes||'' })
    setEditId(r.id); setErr(''); setShowModal(true)
  }

  async function save() {
    if (!form.capital_name.trim()) { setErr('Capital name is required'); return }
    setSaving(true)
    const payload = { ...form, entity_id: entityId, opening_balance: +form.opening_balance || 0 }
    let error
    if (editId) {
      ;({ error } = await supabase.from('capital_accounts').update(payload).eq('id', editId))
    } else {
      ;({ error } = await supabase.from('capital_accounts').insert(payload))
    }
    setSaving(false)
    if (error) { setErr(error.message); return }
    setShowModal(false); load()
  }

  const total = rows.reduce((s,r) => s + (+r.opening_balance||0), 0)

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:13, color:'#6b7c93' }}>Total Capital: <strong style={{ color:'#1a2e3d' }}>SAR {fmt(total)}</strong></div>
        <button style={S.btn('#1a7f4b')} onClick={openNew}>+ Add Capital Account</button>
      </div>

      {loading ? <div style={{ padding:40, textAlign:'center', color:'#aab2bd' }}>Loading…</div> : (
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              {['Capital / Partner Name','Opening Balance (SAR)','Notes',''].map(h=>(
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length===0 && (
              <tr><td colSpan={4} style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No capital accounts yet</td></tr>
            )}
            {rows.map(r=>(
              <tr key={r.id}>
                <td style={S.td}><strong>{r.capital_name}</strong></td>
                <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', fontSize:13 }}>{fmt(r.opening_balance)}</td>
                <td style={{ ...S.td, color:'#6b7c93' }}>{r.notes||'—'}</td>
                <td style={S.td}>
                  <button onClick={()=>openEdit(r)} style={{ ...S.btn('#e8edf5','#2d3a45'), padding:'4px 12px', fontSize:11 }}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showModal && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
          <div style={{ ...S.modal, width:480 }}>
            <div style={{ background:'#1a2e3d', color:'#fff', padding:'18px 24px', fontWeight:800, fontSize:15 }}>
              {editId ? 'Edit Capital Account' : 'Add Capital Account'}
            </div>
            <div style={{ padding:24 }}>
              {err && <div style={{ background:'#fdecea', color:'#c0392b', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>{err}</div>}
              <div style={{ marginBottom:14 }}>
                <label style={S.label}>Capital / Partner Name *</label>
                <input style={S.inp} value={form.capital_name} onChange={e=>setForm(f=>({...f,capital_name:e.target.value}))} placeholder="e.g. Share Capital – Ratal Group" />
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={S.label}>Opening Balance (SAR)</label>
                <input style={S.inp} type="number" value={form.opening_balance} onChange={e=>setForm(f=>({...f,opening_balance:e.target.value}))} />
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={S.label}>Notes</label>
                <textarea style={{ ...S.inp, height:60, resize:'vertical' }} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                <button style={S.btn('#e8edf5','#2d3a45')} onClick={()=>setShowModal(false)}>Cancel</button>
                <button style={S.btn('#1a7f4b')} onClick={save} disabled={saving}>{saving?'Saving…':'Save'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAN ACCOUNTS TAB
// ─────────────────────────────────────────────────────────────────────────────
const EMPTY_LOAN = {
  loan_name:'', lender_name:'', loan_amount:'',
  outstanding_balance:'', interest_rate:'0',
  start_date: new Date().toISOString().split('T')[0],
  maturity_date:'', status:'ACTIVE', notes:'',
}

function LoanAccountsTab({ entityId }) {
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm]       = useState(EMPTY_LOAN)
  const [editId, setEditId]   = useState(null)
  const [saving, setSaving]   = useState(false)
  const [err, setErr]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('loan_accounts').select('*')
      .eq('entity_id', entityId).order('start_date', { ascending:false })
    setRows(data || [])
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  function openNew() { setForm(EMPTY_LOAN); setEditId(null); setErr(''); setShowModal(true) }
  function openEdit(r) {
    setForm({
      loan_name: r.loan_name||'', lender_name: r.lender_name||'',
      loan_amount: r.loan_amount||'', outstanding_balance: r.outstanding_balance||'',
      interest_rate: r.interest_rate||'0',
      start_date: r.start_date||new Date().toISOString().split('T')[0],
      maturity_date: r.maturity_date||'', status: r.status||'ACTIVE', notes: r.notes||'',
    })
    setEditId(r.id); setErr(''); setShowModal(true)
  }

  async function save() {
    if (!form.loan_name.trim()) { setErr('Loan name is required'); return }
    if (!form.loan_amount)      { setErr('Loan amount is required'); return }
    setSaving(true)
    const la = +form.loan_amount||0
    const payload = {
      ...form, entity_id: entityId,
      loan_amount: la,
      outstanding_balance: form.outstanding_balance !== '' ? +form.outstanding_balance : la,
      interest_rate: +form.interest_rate||0,
      maturity_date: form.maturity_date || null,
    }
    let error
    if (editId) {
      ;({ error } = await supabase.from('loan_accounts').update(payload).eq('id', editId))
    } else {
      ;({ error } = await supabase.from('loan_accounts').insert(payload))
    }
    setSaving(false)
    if (error) { setErr(error.message); return }
    setShowModal(false); load()
  }

  const statusBadge = s => {
    const map = { ACTIVE:['#e3f2fd','#1565c0'], SETTLED:['#e8f5e9','#2e7d32'], WRITTEN_OFF:['#fce4ec','#c62828'] }
    const [bg,fg] = map[s]||['#f5f5f5','#555']
    return <span style={{ background:bg, color:fg, padding:'2px 8px', borderRadius:12, fontSize:11, fontWeight:700 }}>{s}</span>
  }

  const totalOutstanding = rows.filter(r=>r.status==='ACTIVE').reduce((s,r)=>s+(+r.outstanding_balance||0),0)

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div style={{ fontSize:13, color:'#6b7c93' }}>Outstanding: <strong style={{ color:'#c0392b' }}>SAR {fmt(totalOutstanding)}</strong></div>
        <button style={S.btn('#1a7f4b')} onClick={openNew}>+ Add Loan</button>
      </div>

      {loading ? <div style={{ padding:40, textAlign:'center', color:'#aab2bd' }}>Loading…</div> : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                {['Loan Name','Lender','Loan Amount','Outstanding','Rate','Start','Maturity','Status',''].map(h=>(
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length===0 && (
                <tr><td colSpan={9} style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No loans recorded</td></tr>
              )}
              {rows.map(r=>(
                <tr key={r.id}>
                  <td style={S.td}><strong>{r.loan_name}</strong></td>
                  <td style={S.td}>{r.lender_name||'—'}</td>
                  <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace' }}>{fmt(r.loan_amount)}</td>
                  <td style={{ ...S.td, textAlign:'right', fontFamily:'monospace', color: r.status==='ACTIVE' ? '#c0392b':'#27ae60' }}>{fmt(r.outstanding_balance)}</td>
                  <td style={{ ...S.td, textAlign:'center' }}>{r.interest_rate}%</td>
                  <td style={S.td}>{r.start_date||'—'}</td>
                  <td style={S.td}>{r.maturity_date||'—'}</td>
                  <td style={S.td}>{statusBadge(r.status)}</td>
                  <td style={S.td}>
                    <button onClick={()=>openEdit(r)} style={{ ...S.btn('#e8edf5','#2d3a45'), padding:'4px 12px', fontSize:11 }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
          <div style={S.modal}>
            <div style={{ background:'#1a2e3d', color:'#fff', padding:'18px 24px', fontWeight:800, fontSize:15 }}>
              {editId ? 'Edit Loan' : 'Add Loan Account'}
            </div>
            <div style={{ padding:24 }}>
              {err && <div style={{ background:'#fdecea', color:'#c0392b', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>{err}</div>}
              <div style={S.row}>
                <div style={S.col}>
                  <label style={S.label}>Loan Name *</label>
                  <input style={S.inp} value={form.loan_name} onChange={e=>setForm(f=>({...f,loan_name:e.target.value}))} placeholder="ANB Working Capital Facility" />
                </div>
                <div style={S.col}>
                  <label style={S.label}>Lender</label>
                  <input style={S.inp} value={form.lender_name} onChange={e=>setForm(f=>({...f,lender_name:e.target.value}))} placeholder="Arab National Bank" />
                </div>
              </div>
              <div style={S.row}>
                <div style={S.col}>
                  <label style={S.label}>Loan Amount (SAR) *</label>
                  <input style={S.inp} type="number" value={form.loan_amount} onChange={e=>setForm(f=>({...f,loan_amount:e.target.value, outstanding_balance:e.target.value}))} />
                </div>
                <div style={S.col}>
                  <label style={S.label}>Outstanding Balance (SAR)</label>
                  <input style={S.inp} type="number" value={form.outstanding_balance} onChange={e=>setForm(f=>({...f,outstanding_balance:e.target.value}))} />
                </div>
                <div style={{ width:120 }}>
                  <label style={S.label}>Interest Rate %</label>
                  <input style={S.inp} type="number" step="0.01" value={form.interest_rate} onChange={e=>setForm(f=>({...f,interest_rate:e.target.value}))} />
                </div>
              </div>
              <div style={S.row}>
                <div style={S.col}>
                  <label style={S.label}>Start Date</label>
                  <input style={S.inp} type="date" value={form.start_date} onChange={e=>setForm(f=>({...f,start_date:e.target.value}))} />
                </div>
                <div style={S.col}>
                  <label style={S.label}>Maturity Date</label>
                  <input style={S.inp} type="date" value={form.maturity_date} onChange={e=>setForm(f=>({...f,maturity_date:e.target.value}))} />
                </div>
                <div style={{ width:140 }}>
                  <label style={S.label}>Status</label>
                  <select style={S.inp} value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                    <option value="ACTIVE">Active</option>
                    <option value="SETTLED">Settled</option>
                    <option value="WRITTEN_OFF">Written Off</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={S.label}>Notes</label>
                <textarea style={{ ...S.inp, height:50, resize:'vertical' }} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
              </div>
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                <button style={S.btn('#e8edf5','#2d3a45')} onClick={()=>setShowModal(false)}>Cancel</button>
                <button style={S.btn('#1a7f4b')} onClick={save} disabled={saving}>{saving?'Saving…':'Save Loan'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN ACCOUNTS PAGE
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { key:'bank',    label:'🏦 Bank & Cash Accounts' },
  { key:'assets',  label:'🖥 Fixed Assets' },
  { key:'capital', label:'💼 Capital Accounts' },
  { key:'loans',   label:'🏛 Loan Accounts' },
]

export default function Accounts({ entityId }) {
  const [tab, setTab] = useState('bank')

  return (
    <div style={{ padding:24, maxWidth:1200, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:12, color:'#64748b' }}>Manage your bank accounts, fixed assets, capital, and loans</div>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:4, borderBottom:'2px solid #e8edf5', marginBottom:24 }}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{
            padding:'10px 20px', border:'none', background:'none', cursor:'pointer',
            fontSize:13, fontWeight: tab===t.key ? 800 : 500,
            color: tab===t.key ? '#1a7f4b' : '#6b7c93',
            borderBottom: tab===t.key ? '2px solid #1a7f4b' : '2px solid transparent',
            marginBottom:-2, transition:'all 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ background:'#fff', borderRadius:12, border:'1.5px solid #e8edf5', padding:24 }}>
        {tab==='bank'    && <BankAccountsTab  entityId={entityId} />}
        {tab==='assets'  && <FixedAssetsTab   entityId={entityId} />}
        {tab==='capital' && <CapitalAccountsTab entityId={entityId} />}
        {tab==='loans'   && <LoanAccountsTab  entityId={entityId} />}
      </div>
    </div>
  )
}
