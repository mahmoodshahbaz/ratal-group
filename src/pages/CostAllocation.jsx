import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'

// ═══════════════════════════════════════════════════════════════════
// Cost Center Allocation — Phase 23
//
// Define allocation rules (% split per dept / project),
// run them against shared GL account balances,
// generate and post allocation journal entries to ledger_entries.
// SQL: allocation_rules + allocation_rule_lines + allocation_runs
// ═══════════════════════════════════════════════════════════════════

const today   = () => new Date().toISOString().slice(0,10)
const MONTHS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const fmt     = n => (+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtD    = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'

const S = {
  card:  { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:12 },
  input: { padding:'8px 10px', borderRadius:8, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff', width:'100%', boxSizing:'border-box' },
  label: { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
  btn:   (c='#1565C0') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }),
}

// ── Fetch source account GL balance for a period ─────────────────
async function fetchAccountBalance(entityId, accountCode, from, to) {
  const [coaRes, leRes] = await Promise.all([
    supabase.from('chart_of_accounts').select('account_type, opening_debit, opening_credit')
      .eq('entity_id', entityId).eq('account_code', accountCode).single(),
    supabase.from('ledger_entries').select('debit, credit')
      .eq('entity_id', entityId).eq('account_code', accountCode)
      .gte('entry_date', from).lte('entry_date', to),
  ])
  if (!coaRes.data) return 0
  const type = (coaRes.data.account_type||'').toUpperCase()
  const DR_NORMAL = new Set(['BANK','CASH','ASSET','CUSTOMER','CONTRACTOR','EMPLOYEE','EXPENSE','CLEARING','INTERNAL','SUBCON'])
  const entries = leRes.data||[]
  const movDr = entries.reduce((s,e)=>s+(+e.debit||0),0)
  const movCr = entries.reduce((s,e)=>s+(+e.credit||0),0)
  // For allocation we want period movement only (not cumulative balance)
  return DR_NORMAL.has(type) ? movDr - movCr : movCr - movDr
}

// ── Rule modal ────────────────────────────────────────────────────
function RuleModal({ entityId, item, coa, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:'', description:'', is_active:true,
    source_account_code:'', source_account_name:'',
    frequency:'MONTHLY', basis:'FIXED_PCT', notes:'',
    ...item,
  })
  const [lines, setLines] = useState(item?.lines||[
    { cost_center_type:'DEPARTMENT', cost_center_name:'', target_account_code:'', target_account_name:'', percentage:'', sort_order:0 },
  ])
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const totalPct = lines.reduce((s,l)=>s+(+l.percentage||0),0)
  const balanced = Math.abs(totalPct - 100) < 0.01

  function addLine() {
    setLines(ls=>[...ls, { cost_center_type:'DEPARTMENT', cost_center_name:'', target_account_code:'', target_account_name:'', percentage:'', sort_order:ls.length }])
  }

  function removeLine(i) {
    setLines(ls=>ls.filter((_,idx)=>idx!==i))
  }

  function updateLine(i, key, val) {
    setLines(ls=>ls.map((l,idx)=>idx===i ? { ...l, [key]:val } : l))
  }

  function applyAccountName(i, code) {
    const acct = coa.find(a=>a.account_code===code)
    if (acct) updateLine(i, 'target_account_name', acct.account_name)
  }

  async function save() {
    if (!form.name) { setErr('Rule name required'); return }
    if (!form.source_account_code) { setErr('Source account required'); return }
    if (!balanced) { setErr(`Percentages must sum to 100 (currently ${totalPct.toFixed(2)}%)`); return }
    if (lines.some(l=>!l.cost_center_name||!l.target_account_code)) { setErr('All lines need a cost center and target account'); return }

    setSaving(true); setErr('')

    const ruleRow = {
      entity_id: entityId,
      name: form.name, description: form.description||null,
      is_active: form.is_active,
      source_account_code: form.source_account_code,
      source_account_name: coa.find(a=>a.account_code===form.source_account_code)?.account_name||form.source_account_name||null,
      frequency: form.frequency, basis: form.basis, notes: form.notes||null,
    }

    let ruleId = item?.id
    if (ruleId) {
      await supabase.from('allocation_rules').update(ruleRow).eq('id', ruleId)
      await supabase.from('allocation_rule_lines').delete().eq('rule_id', ruleId)
    } else {
      const { data, error } = await supabase.from('allocation_rules').insert(ruleRow).select().single()
      if (error) { setErr(error.message); setSaving(false); return }
      ruleId = data.id
    }

    const lineRows = lines.map((l,i)=>({
      rule_id: ruleId,
      cost_center_type: l.cost_center_type,
      cost_center_name: l.cost_center_name,
      target_account_code: l.target_account_code,
      target_account_name: l.target_account_name||null,
      percentage: +l.percentage,
      sort_order: i,
    }))
    const { error: lineErr } = await supabase.from('allocation_rule_lines').insert(lineRows)
    setSaving(false)
    if (lineErr) { setErr(lineErr.message); return }
    onSaved()
  }

  const F = ({label,children,col}) => (
    <div style={{ marginBottom:10, gridColumn:col }}>
      <label style={S.label}>{label}</label>{children}
    </div>
  )

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:780, maxHeight:'92vh', overflow:'auto', padding:28 }}>
        <div style={{ fontWeight:800, fontSize:16, color:'#1a2e3d', marginBottom:20 }}>
          {item?.id?'Edit':'New'} Allocation Rule
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
          <F label="Rule Name *" col="1/-1">
            <input style={{ ...S.input, fontSize:14 }} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Office Rent Allocation, Shared IT Costs" />
          </F>
          <F label="Source Account (shared cost to allocate) *">
            <select style={S.input} value={form.source_account_code}
              onChange={e=>setForm(f=>({...f,source_account_code:e.target.value}))}>
              <option value="">— Select account —</option>
              {coa.filter(a=>['EXPENSE','CLEARING'].includes((a.account_type||'').toUpperCase())).map(a=>(
                <option key={a.account_code} value={a.account_code}>{a.account_code} — {a.account_name}</option>
              ))}
            </select>
          </F>
          <F label="Frequency">
            <select style={S.input} value={form.frequency} onChange={e=>setForm(f=>({...f,frequency:e.target.value}))}>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="MANUAL">Manual (on demand)</option>
            </select>
          </F>
          <F label="Notes">
            <input style={S.input} value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
          </F>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, cursor:'pointer', gridColumn:'1/-1' }}>
            <input type="checkbox" checked={form.is_active} onChange={e=>setForm(f=>({...f,is_active:e.target.checked}))} />
            Active rule (will appear in Run Allocations)
          </label>
        </div>

        {/* Lines */}
        <div style={{ fontWeight:700, fontSize:12, color:'#6b7c93', marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span>ALLOCATION LINES</span>
          <span style={{ fontWeight:800, fontSize:13, color:balanced?'#2e7d32':'#c62828' }}>
            Total: {totalPct.toFixed(2)}% {balanced?'✅':'⚠️ must = 100%'}
          </span>
        </div>

        {lines.map((l,i)=>(
          <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1.5fr 1.5fr 80px 36px', gap:8, marginBottom:8, alignItems:'flex-end' }}>
            <div>
              {i===0 && <label style={S.label}>Type</label>}
              <select style={S.input} value={l.cost_center_type} onChange={e=>updateLine(i,'cost_center_type',e.target.value)}>
                <option value="DEPARTMENT">Department</option>
                <option value="PROJECT">Project</option>
              </select>
            </div>
            <div>
              {i===0 && <label style={S.label}>Cost Center Name</label>}
              <input style={S.input} value={l.cost_center_name}
                onChange={e=>updateLine(i,'cost_center_name',e.target.value)} placeholder="e.g. IT, HR, Project-001" />
            </div>
            <div>
              {i===0 && <label style={S.label}>Target GL Account</label>}
              <select style={S.input} value={l.target_account_code}
                onChange={e=>{ updateLine(i,'target_account_code',e.target.value); applyAccountName(i,e.target.value) }}>
                <option value="">— Select account —</option>
                {coa.map(a=><option key={a.account_code} value={a.account_code}>{a.account_code} — {a.account_name}</option>)}
              </select>
            </div>
            <div>
              {i===0 && <label style={S.label}>% Share</label>}
              <input type="number" style={{ ...S.input, fontWeight:700, color:'#1565C0' }} value={l.percentage}
                onChange={e=>updateLine(i,'percentage',e.target.value)} placeholder="%" min="0" max="100" step="0.01" />
            </div>
            <div style={{ display:'flex', alignItems:'flex-end' }}>
              <button onClick={()=>removeLine(i)} style={{ background:'#ffebee', color:'#c62828', border:'none', borderRadius:6, width:32, height:32, cursor:'pointer', fontSize:14 }}>✕</button>
            </div>
          </div>
        ))}
        <button onClick={addLine} style={{ background:'#f0f4f8', color:'#546e7a', border:'1px dashed #cfd8dc', borderRadius:8, padding:'8px 14px', fontSize:12, cursor:'pointer', width:'100%', marginBottom:12 }}>
          + Add Line
        </button>

        {err && <div style={{ color:'#c62828', fontSize:12, marginBottom:8 }}>{err}</div>}
        <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ background:'#f0f4f8', color:'#546e7a', border:'none', borderRadius:8, padding:'8px 14px', fontWeight:700, cursor:'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={S.btn()}>{saving?'Saving…':'Save Rule'}</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Main export
// ═══════════════════════════════════════════════════════════════════
export default function CostAllocation({ entityId }) {
  const { user } = useAuth()
  const now = new Date()
  const [tab,     setTab]     = useState(0)
  const [rules,   setRules]   = useState([])
  const [lines,   setLines]   = useState({})  // ruleId → lines[]
  const [runs,    setRuns]    = useState([])
  const [coa,     setCoa]     = useState([])
  const [modal,   setModal]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded,setExpanded]= useState(new Set())

  // Run form state
  const [runYear,  setRunYear]  = useState(now.getFullYear())
  const [runMonth, setRunMonth] = useState(now.getMonth()+1)
  const [runDate,  setRunDate]  = useState(today())
  const [selected, setSelected] = useState(new Set())
  const [running,  setRunning]  = useState(false)
  const [runResults, setRunResults] = useState([])
  const [balances, setBalances] = useState({})
  const [loadingBal, setLoadingBal] = useState(false)

  const load = useCallback(async () => {
    if (!entityId) return
    setLoading(true)
    const [rulesRes, runsRes, coaRes] = await Promise.all([
      supabase.from('allocation_rules').select('*').eq('entity_id', entityId).order('name'),
      supabase.from('allocation_runs').select('*').eq('entity_id', entityId).order('created_at', { ascending:false }),
      supabase.from('chart_of_accounts').select('account_code, account_name, account_type').eq('entity_id', entityId).eq('is_active', true),
    ])
    const fetchedRules = rulesRes.data||[]
    setRules(fetchedRules)
    setRuns(runsRes.data||[])
    setCoa(coaRes.data||[])

    // Load lines for all rules
    const lineMap = {}
    for (const r of fetchedRules) {
      const { data } = await supabase.from('allocation_rule_lines').select('*').eq('rule_id', r.id).order('sort_order')
      lineMap[r.id] = data||[]
    }
    setLines(lineMap)
    setLoading(false)
  }, [entityId])

  useEffect(() => { load() }, [load])

  // Load balances when tab changes to Run
  useEffect(() => {
    if (tab !== 1 || !entityId) return
    async function loadBalances() {
      setLoadingBal(true)
      const from = `${runYear}-${String(runMonth).padStart(2,'0')}-01`
      const lastDay = new Date(runYear, runMonth, 0).getDate()
      const to = `${runYear}-${String(runMonth).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
      const balMap = {}
      for (const r of rules.filter(r=>r.is_active)) {
        balMap[r.id] = await fetchAccountBalance(entityId, r.source_account_code, from, to)
      }
      setBalances(balMap)
      setLoadingBal(false)
    }
    loadBalances()
  }, [tab, entityId, rules, runYear, runMonth])

  async function runAllocations() {
    if (selected.size===0) return
    setRunning(true); setRunResults([])
    const from = `${runYear}-${String(runMonth).padStart(2,'0')}-01`
    const lastDay = new Date(runYear, runMonth, 0).getDate()
    const to = `${runYear}-${String(runMonth).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`
    const res = []

    for (const ruleId of selected) {
      const rule    = rules.find(r=>r.id===ruleId)
      const rLines  = lines[ruleId]||[]
      const balance = balances[ruleId]||0

      if (!balance || balance===0) {
        res.push({ ruleId, ok:false, msg:`${rule?.name}: Source account balance is 0 — nothing to allocate` })
        continue
      }

      if (!rLines.length) {
        res.push({ ruleId, ok:false, msg:`${rule?.name}: No allocation lines defined` })
        continue
      }

      const vNum = `ALC-${runYear}-${String(runMonth).padStart(2,'0')}-${Math.floor(Math.random()*9000)+1000}`

      // Build journal: CR source, DR each target
      const leLines = [
        // Credit the source account (clearing out the shared cost)
        {
          entity_id: entityId, entry_date: runDate, voucher_type:'ALC',
          voucher_number: vNum,
          account_code: rule.source_account_code,
          account_name: rule.source_account_name||rule.source_account_code,
          debit: 0, credit: balance,
          description: `Cost allocation — ${rule.name} — ${MONTHS[runMonth-1]} ${runYear}`,
          department: null,
        },
        // Debit each target cost center
        ...rLines.map(l => {
          const amt = +(balance * l.percentage / 100).toFixed(2)
          return {
            entity_id: entityId, entry_date: runDate, voucher_type:'ALC',
            voucher_number: vNum,
            account_code: l.target_account_code,
            account_name: l.target_account_name||l.target_account_code,
            debit: amt, credit: 0,
            description: `Allocation — ${l.cost_center_name} (${l.percentage}%) — ${rule.name}`,
            department: l.cost_center_type==='DEPARTMENT' ? l.cost_center_name : null,
          }
        }),
      ]

      // Adjust last line for rounding
      const allocated = rLines.reduce((s,l)=>s+(+(balance * l.percentage / 100).toFixed(2)),0)
      const diff = +(balance - allocated).toFixed(2)
      if (Math.abs(diff) > 0 && leLines.length > 1) {
        leLines[leLines.length-1].debit = +(leLines[leLines.length-1].debit + diff).toFixed(2)
      }

      const { error: glErr } = await supabase.from('ledger_entries').insert(leLines)
      if (glErr) { res.push({ ruleId, ok:false, msg:`${rule?.name}: GL error — ${glErr.message}` }); continue }

      // Record the run
      await supabase.from('allocation_runs').insert({
        entity_id: entityId, rule_id: ruleId,
        run_date: runDate, period_year: runYear, period_month: runMonth,
        voucher_number: vNum, source_balance: balance, status:'POSTED',
        created_by: user?.id||null,
      })

      res.push({ ruleId, ok:true, msg:`${rule?.name}: ${fmt(balance)} SAR allocated → ${vNum}` })
    }

    setRunResults(res)
    setRunning(false)
    setSelected(new Set())
    load()
  }

  const activeRules = rules.filter(r=>r.is_active)

  const TABS = [
    { label:'📋 Allocation Rules' },
    { label:'▶️ Run Allocations' },
    { label:'📜 History' },
  ]

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:16 }}>
        Define rules to distribute shared costs across departments and projects · post allocation journals to GL
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, background:'#f0f4f8', borderRadius:12, padding:4, marginBottom:14 }}>
        {TABS.map((t,i)=>(
          <button key={i} onClick={()=>setTab(i)} style={{
            padding:'8px 16px', borderRadius:8, fontWeight:700, fontSize:12, cursor:'pointer', border:'none',
            background:tab===i?'#fff':'transparent', color:tab===i?'#1a2e3d':'#6b7c93',
            boxShadow:tab===i?'0 1px 4px rgba(0,0,0,0.1)':'none',
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading…</div>
      ) : tab===0 ? (
        /* ── Rules tab ───────────────────────────────────────────── */
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:10 }}>
            <button onClick={()=>setModal('new')} style={S.btn()}>+ New Rule</button>
          </div>
          {rules.length===0 ? (
            <div style={{ ...S.card, textAlign:'center', padding:60, color:'#6b7c93' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>⚙️</div>
              <div>No allocation rules yet.</div>
              <div style={{ fontSize:12, marginTop:4 }}>Create a rule to distribute shared costs across departments.</div>
            </div>
          ) : rules.map(r=>{
            const rLines = lines[r.id]||[]
            const exp    = expanded.has(r.id)
            const totalPct = rLines.reduce((s,l)=>s+(+l.percentage||0),0)
            return (
              <div key={r.id} style={{ ...S.card }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:8 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <span style={{ fontWeight:800, fontSize:15, color:'#1a2e3d' }}>{r.name}</span>
                      <span style={{ background:r.is_active?'#e8f5e9':'#f5f5f5', color:r.is_active?'#2e7d32':'#757575',
                        borderRadius:20, padding:'1px 10px', fontSize:10, fontWeight:700 }}>
                        {r.is_active?'Active':'Paused'}
                      </span>
                      <span style={{ background:'#e3f2fd', color:'#1565C0', borderRadius:6, padding:'1px 8px', fontSize:10 }}>{r.frequency}</span>
                    </div>
                    <div style={{ fontSize:12, color:'#6b7c93' }}>
                      Source: <strong>{r.source_account_code}</strong> — {r.source_account_name}
                    </div>
                    {r.description && <div style={{ fontSize:11, color:'#6b7c93', marginTop:2 }}>{r.description}</div>}
                  </div>
                  <div style={{ display:'flex', gap:6 }}>
                    <button onClick={()=>setExpanded(s=>{ const n=new Set(s); exp?n.delete(r.id):n.add(r.id); return n })}
                      style={{ background:'#f0f4f8', color:'#546e7a', border:'none', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>
                      {exp?'▲':'▼'} {rLines.length} lines
                    </button>
                    <button onClick={()=>setModal({ ...r, lines:rLines })}
                      style={{ background:'transparent', color:'#1565C0', border:'1px solid #1565C0', borderRadius:6, padding:'5px 10px', fontSize:11, cursor:'pointer' }}>Edit</button>
                  </div>
                </div>

                {exp && (
                  <div style={{ marginTop:12, borderTop:'1px solid #f0f4f8', paddingTop:12 }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr style={{ background:'#f5f7fa' }}>
                          {['Type','Cost Center','Target Account','Share %'].map(h=>(
                            <th key={h} style={{ padding:'6px 8px', textAlign:h==='Share %'?'right':'left', fontSize:11, fontWeight:700, color:'#6b7c93' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rLines.map(l=>(
                          <tr key={l.id} style={{ borderBottom:'1px solid #f0f4f8' }}>
                            <td style={{ padding:'6px 8px', fontSize:11 }}><span style={{ background:'#e3f2fd', color:'#1565C0', borderRadius:4, padding:'1px 6px', fontSize:10 }}>{l.cost_center_type}</span></td>
                            <td style={{ padding:'6px 8px', fontSize:12, fontWeight:600 }}>{l.cost_center_name}</td>
                            <td style={{ padding:'6px 8px', fontSize:11, color:'#546e7a' }}>{l.target_account_code} — {l.target_account_name||''}</td>
                            <td style={{ padding:'6px 8px', textAlign:'right', fontWeight:800, color:'#1565C0', fontSize:13 }}>{l.percentage}%</td>
                          </tr>
                        ))}
                        <tr style={{ background:'#f0f4f8', fontWeight:800 }}>
                          <td colSpan={3} style={{ padding:'6px 8px', fontSize:11 }}>Total</td>
                          <td style={{ padding:'6px 8px', textAlign:'right', fontSize:13, color:Math.abs(totalPct-100)<0.01?'#2e7d32':'#c62828' }}>
                            {totalPct.toFixed(2)}%
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : tab===1 ? (
        /* ── Run Allocations tab ──────────────────────────────────── */
        <div>
          <div style={{ ...S.card }}>
            <div style={{ fontWeight:800, fontSize:13, color:'#1a2e3d', marginBottom:12 }}>Run Allocations for Period</div>
            <div style={{ display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap', marginBottom:14 }}>
              <div>
                <label style={S.label}>Year</label>
                <input type="number" style={{ ...S.input, width:90 }} value={runYear} onChange={e=>setRunYear(+e.target.value)} />
              </div>
              <div>
                <label style={S.label}>Month</label>
                <select style={{ ...S.input, width:110 }} value={runMonth} onChange={e=>setRunMonth(+e.target.value)}>
                  {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Journal Date</label>
                <input type="date" style={{ ...S.input, width:160 }} value={runDate} onChange={e=>setRunDate(e.target.value)} />
              </div>
            </div>

            {runResults.length>0 && (
              <div style={{ background:'#f0f4f8', borderRadius:10, padding:12, marginBottom:12 }}>
                {runResults.map((r,i)=>(
                  <div key={i} style={{ fontSize:12, color:r.ok?'#2e7d32':'#c62828', marginBottom:4 }}>
                    {r.ok?'✅':'❌'} {r.msg}
                  </div>
                ))}
              </div>
            )}

            <div style={{ background:'#fff', borderRadius:12, overflow:'auto', border:'1px solid #f0f4f8' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'#f0f4f8' }}>
                    <th style={{ padding:'10px 10px', width:40 }}>
                      <input type="checkbox"
                        onChange={e=>{ if(e.target.checked) setSelected(new Set(activeRules.map(r=>r.id))); else setSelected(new Set()) }}
                        checked={selected.size===activeRules.length && activeRules.length>0} />
                    </th>
                    {['Rule','Source Account','Period Balance','Lines',''].map(h=>(
                      <th key={h} style={{ padding:'10px 10px', textAlign:h==='Period Balance'?'right':'left', fontSize:11, fontWeight:700, color:'#6b7c93' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activeRules.length===0 ? (
                    <tr><td colSpan={6} style={{ padding:40, textAlign:'center', color:'#6b7c93' }}>No active rules. Create rules in the Rules tab.</td></tr>
                  ) : activeRules.map(r=>{
                    const bal = balances[r.id]
                    const rLines = lines[r.id]||[]
                    return (
                      <tr key={r.id} style={{ borderBottom:'1px solid #f0f4f8', background:selected.has(r.id)?'#e3f2fd':'#fff' }}>
                        <td style={{ padding:'10px 10px' }}>
                          <input type="checkbox" checked={selected.has(r.id)}
                            onChange={e=>{ const s=new Set(selected); e.target.checked?s.add(r.id):s.delete(r.id); setSelected(s) }} />
                        </td>
                        <td style={{ padding:'10px 10px' }}>
                          <div style={{ fontWeight:700, fontSize:13 }}>{r.name}</div>
                          {r.description && <div style={{ fontSize:10, color:'#6b7c93' }}>{r.description}</div>}
                        </td>
                        <td style={{ padding:'10px 10px', fontSize:11, color:'#546e7a' }}>
                          {r.source_account_code} — {r.source_account_name}
                        </td>
                        <td style={{ padding:'10px 10px', textAlign:'right', fontWeight:800,
                          fontSize:14, color:bal>0?'#1565C0':bal<0?'#c62828':'#6b7c93' }}>
                          {loadingBal ? '…' : bal!==undefined ? `${fmt(bal)} SAR` : '—'}
                        </td>
                        <td style={{ padding:'10px 10px', fontSize:11, color:'#6b7c93' }}>
                          {rLines.length} lines
                        </td>
                        <td style={{ padding:'10px 10px' }}>
                          {bal===0 && <span style={{ fontSize:10, color:'#f57f17' }}>⚠️ Zero balance</span>}
                          {bal>0 && selected.has(r.id) && (
                            <div style={{ fontSize:10, color:'#2e7d32' }}>
                              {rLines.map(l=>`${l.cost_center_name}: ${fmt(bal*l.percentage/100)}`).join(' · ')}
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:12 }}>
              <button onClick={runAllocations} disabled={running||selected.size===0}
                style={{ ...S.btn('#2e7d32'), opacity:running||selected.size===0?0.5:1 }}>
                {running?'Running…':`▶️ Run ${selected.size} Selected Allocation${selected.size!==1?'s':''}`}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ── History tab ─────────────────────────────────────────── */
        <div>
          <div style={{ background:'#fff', borderRadius:14, overflow:'auto', boxShadow:'0 2px 10px rgba(0,0,0,0.07)' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#f0f4f8' }}>
                  {['Run Date','Period','Rule','Source Balance','Voucher','Status'].map(h=>(
                    <th key={h} style={{ padding:'10px 10px', textAlign:h==='Source Balance'?'right':'left', fontSize:11, fontWeight:700, color:'#6b7c93' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.length===0 ? (
                  <tr><td colSpan={6} style={{ padding:40, textAlign:'center', color:'#6b7c93' }}>No allocation runs yet</td></tr>
                ) : runs.map(run=>{
                  const rule = rules.find(r=>r.id===run.rule_id)
                  return (
                    <tr key={run.id} style={{ borderBottom:'1px solid #f0f4f8' }}>
                      <td style={{ padding:'10px 10px', fontSize:12 }}>{fmtD(run.run_date)}</td>
                      <td style={{ padding:'10px 10px', fontSize:12 }}>{MONTHS[run.period_month-1]} {run.period_year}</td>
                      <td style={{ padding:'10px 10px', fontSize:13, fontWeight:600 }}>{rule?.name||'—'}</td>
                      <td style={{ padding:'10px 10px', textAlign:'right', fontWeight:800, fontSize:13, color:'#1565C0' }}>{fmt(run.source_balance)} SAR</td>
                      <td style={{ padding:'10px 10px', fontSize:11, color:'#546e7a' }}>{run.voucher_number||'—'}</td>
                      <td style={{ padding:'10px 10px' }}>
                        <span style={{ background:run.status==='POSTED'?'#e8f5e9':'#fce4ec',
                          color:run.status==='POSTED'?'#2e7d32':'#c62828',
                          border:`1.5px solid ${run.status==='POSTED'?'#a5d6a7':'#ef9a9a'}`,
                          borderRadius:20, padding:'2px 10px', fontSize:10, fontWeight:700 }}>
                          {run.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <RuleModal
          entityId={entityId}
          item={modal==='new'?null:modal}
          coa={coa}
          onClose={()=>setModal(null)}
          onSaved={()=>{ setModal(null); load() }}
        />
      )}
    </div>
  )
}
