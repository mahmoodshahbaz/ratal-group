import { GROUP_COLORS } from '../styles/appStyles'
import FormShell from '../components/FormShell'
import PageBanner from '../components/PageBanner'
/**
 * ChartOfAccounts.jsx
 * View, search, and manage the Chart of Accounts.
 * Add / edit accounts inline. Grouped by type with collapsible sections.
 */

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ── Constants ──────────────────────────────────────────────────────────────
const TYPE_META = {
  ASSET:     { label:'Assets',            labelAr:'الأصول',                color:'#1565c0', bg:'#e3f2fd', icon:'🏦' },
  LIABILITY: { label:'Liabilities',       labelAr:'الالتزامات',            color:'#b71c1c', bg:'#ffebee', icon:'📋' },
  EQUITY:    { label:'Equity',            labelAr:'حقوق الملكية',          color:'#4a148c', bg:'#f3e5f5', icon:'💼' },
  REVENUE:   { label:'Revenue',           labelAr:'الإيرادات',             color:'#1b5e20', bg:'#e8f5e9', icon:'📈' },
  EXPENSE:   { label:'Expenses & COGS',   labelAr:'المصروفات والتكاليف',  color:'#e65100', bg:'#fff3e0', icon:'📉' },
}

const TYPE_ORDER = ['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE']

const SUBTYPES = {
  ASSET:     ['CURRENT_ASSET','FIXED_ASSET','OTHER_ASSET'],
  LIABILITY: ['CURRENT_LIABILITY','LONG_TERM_LIABILITY'],
  EQUITY:    ['EQUITY'],
  REVENUE:   ['OPERATING_REVENUE','OTHER_REVENUE'],
  EXPENSE:   ['COGS','OPERATING_EXPENSE','OTHER_EXPENSE'],
}

const BLANK = {
  account_code:'', account_name:'', account_name_ar:'',
  account_type:'ASSET', account_subtype:'CURRENT_ASSET',
  normal_balance:'DEBIT', opening_balance:'0', description:'', is_active:true,
}

// ── Styles ──────────────────────────────────────────────────────────────────
const MC = GROUP_COLORS.Accounting
const L3 = '#606D2C'

const S = {
  page:     { padding:'24px', fontFamily:"'Poppins',sans-serif" },
  topBar:   { display:'flex', alignItems:'center', gap:12, marginBottom:20, flexWrap:'wrap' },
  title:    { fontSize:22, fontWeight:800, color:'#1a2540', flex:1 },
  searchBox:{ padding:'10px 14px', borderRadius:4, border:'1.5px solid #dde3ec', fontSize:14, outline:'none', width:240, fontFamily:"'Poppins',sans-serif" },
  addBtn:   { background:L3, color:'#fff', border:'none', borderRadius:4, padding:'10px 20px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'Poppins',sans-serif" },
  section:  { marginBottom:20 },
  sHead:    (color, bg) => ({ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', background:bg, borderRadius:'12px 12px 0 0', cursor:'pointer', userSelect:'none' }),
  sTitle:   (color) => ({ fontSize:15, fontWeight:800, color, flex:1 }),
  sBadge:   (color) => ({ background:color, color:'#fff', fontSize:11, fontWeight:700, borderRadius:20, padding:'2px 10px' }),
  sTotal:   (color) => ({ fontSize:13, fontWeight:700, color }),
  table:    { width:'100%', borderCollapse:'collapse', background:'#fff', borderRadius:'0 0 12px 12px', overflow:'hidden', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' },
  th:       { padding:'7px 12px', fontSize:11, fontWeight:700, color:'#fff', textAlign:'left', borderBottom:'2px solid #f0f2f5', textTransform:'uppercase', letterSpacing:'0.5px', background:MC, whiteSpace:'nowrap' },
  td:       { padding:'7px 12px', fontSize:13, color:'#1a2540', borderBottom:'1px solid #f5f6f8', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:200 },
  codeTd:   { padding:'7px 12px', fontSize:12, fontWeight:700, color:'#1565c0', borderBottom:'1px solid #f5f6f8', fontFamily:'monospace', whiteSpace:'nowrap' },
  amtTd:    (pos) => ({ padding:'7px 12px', fontSize:13, fontWeight:700, textAlign:'right', borderBottom:'1px solid #f5f6f8', color: pos>=0?'#2e7d32':'#c62828', whiteSpace:'nowrap' }),
  chip:     (c,bg) => ({ display:'inline-block', padding:'2px 8px', borderRadius:12, fontSize:11, fontWeight:700, color:c, background:bg }),
  editBtn:  { background:'none', border:'none', cursor:'pointer', color:'#1565c0', fontSize:13, fontWeight:600, padding:'4px 8px', borderRadius:4 },
  label:    { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.4px' },
  input:    { width:'100%', padding:'11px 13px', borderRadius:4, border:'1.5px solid #dde3ec', fontSize:14, outline:'none', boxSizing:'border-box', fontFamily:"'Poppins',sans-serif", marginBottom:14 },
  select:   { width:'100%', padding:'11px 13px', borderRadius:4, border:'1.5px solid #dde3ec', fontSize:14, outline:'none', boxSizing:'border-box', fontFamily:"'Poppins',sans-serif", marginBottom:14, background:'#fff' },
  row2:     { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
  err:      { background:'#ffebee', color:'#c62828', borderRadius:4, padding:'10px 13px', fontSize:13, marginBottom:12 },
  emptyRow: { textAlign:'center', padding:'24px', color:'#aab2bd', fontSize:13 },
  toggle:   (on) => ({ display:'inline-flex', alignItems:'center', gap:6, cursor:'pointer', fontSize:13, fontWeight:600, color: on?L3:'#aab2bd' }),
  saveBtn:  { background:L3, color:'#fff', border:'none', borderRadius:4, padding:'13px', fontSize:15, fontWeight:800, cursor:'pointer', width:'100%', marginTop:6, fontFamily:"'Poppins',sans-serif" },
  cancelBtn:{ background:'#f0f2f5', color:'#1a2540', border:'none', borderRadius:4, padding:'13px', fontSize:15, fontWeight:700, cursor:'pointer', width:'100%', marginTop:8, fontFamily:"'Poppins',sans-serif" },
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Component ────────────────────────────────────────────────────────────────
export default function ChartOfAccounts({ entityId }) {
  const [accounts,   setAccounts]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [collapsed,  setCollapsed]  = useState({ ASSET:false, LIABILITY:true, EQUITY:true, REVENUE:true, EXPENSE:true })
  const [modal,      setModal]      = useState(false)   // false | 'add' | account_obj
  const [form,       setForm]       = useState(BLANK)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState(null)
  const [showInactive, setShowInactive] = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('chart_of_accounts')
      .select('*')
      .eq('entity_id', entityId)
      .order('account_code')
    setAccounts(data || [])
    setLoading(false)
  }

  // ── Filtering & grouping ───────────────────────────────────
  const visible = accounts.filter(a => {
    if (!showInactive && !a.is_active) return false
    if (!search) return true
    const q = search.toLowerCase()
    return a.account_code?.toLowerCase().includes(q)
        || a.account_name?.toLowerCase().includes(q)
        || a.account_name_ar?.includes(search)
        || a.account_subtype?.toLowerCase().includes(q)
  })

  const grouped = TYPE_ORDER.reduce((acc, type) => {
    acc[type] = visible.filter(a => a.account_type === type)
    return acc
  }, {})

  // ── Modal helpers ──────────────────────────────────────────
  function openAdd() {
    setForm({ ...BLANK })
    setError(null)
    setShowBanner(true)
  }
  function openEdit(acct) {
    setForm({
      ...acct,
      opening_balance: acct.opening_balance ?? '0',
    })
    setError(null)
    setWizardStep(1)
    setModal(acct)
  }
  function closeModal() { setModal(false); setError(null); setWizardStep(1) }

  async function save() {
    if (!form.account_code.trim()) return setError('Account code is required')
    if (!form.account_name.trim()) return setError('Account name is required')

    setSaving(true)
    setError(null)

    const payload = {
      entity_id:        entityId,
      account_code:     form.account_code.trim(),
      account_name:     form.account_name.trim(),
      account_name_ar:  form.account_name_ar?.trim() || null,
      account_type:     form.account_type,
      account_subtype:  form.account_subtype || null,
      normal_balance:   form.normal_balance,
      opening_balance:  parseFloat(form.opening_balance) || 0,
      description:      form.description?.trim() || null,
      is_active:        form.is_active,
    }

    let err
    if (modal === 'add') {
      ;({ error: err } = await supabase.from('chart_of_accounts').insert(payload))
    } else {
      ;({ error: err } = await supabase.from('chart_of_accounts').update(payload).eq('id', modal.id))
    }

    setSaving(false)
    if (err) return setError(err.message)
    closeModal()
    load()
  }

  async function toggleActive(acct) {
    await supabase.from('chart_of_accounts').update({ is_active: !acct.is_active }).eq('id', acct.id)
    load()
  }

  // ── Sub-type normal balance auto-set ─────────────────────
  function handleTypeChange(type) {
    const nb = ['ASSET','EXPENSE'].includes(type) ? 'DEBIT' : 'CREDIT'
    const sub = SUBTYPES[type]?.[0] || ''
    setForm(f => ({ ...f, account_type: type, account_subtype: sub, normal_balance: nb }))
  }

  // ── Stats bar ──────────────────────────────────────────────
  const totalByType = TYPE_ORDER.reduce((acc, t) => {
    acc[t] = accounts.filter(a => a.account_type === t && a.is_active).length
    return acc
  }, {})

  const STEPS = ['Account Identity', 'Balance & Settings']

  // ── Render ─────────────────────────────────────────────────
  return (
    <div style={S.page}>
      {/* Top bar */}
      <div style={S.topBar}>
        <div style={S.title}>📒 Chart of Accounts</div>
        <input
          placeholder="Search code or name…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={S.searchBox}
        />
        <label style={S.toggle(showInactive)} onClick={() => setShowInactive(v => !v)}>
          <span style={{ fontSize:16 }}>{showInactive ? '👁️' : '🙈'}</span>
          {showInactive ? 'Showing all' : 'Active only'}
        </label>
        <button onClick={openAdd} style={S.addBtn}>+ Add Account</button>
      </div>

      {/* Summary chips */}
      <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        {TYPE_ORDER.map(t => {
          const m = TYPE_META[t]
          return (
            <div key={t} style={{ padding:'8px 16px', background:m.bg, borderRadius:10, display:'flex', alignItems:'center', gap:8 }}>
              <span>{m.icon}</span>
              <span style={{ fontWeight:700, fontSize:13, color:m.color }}>{m.label}</span>
              <span style={S.sBadge(m.color)}>{totalByType[t]}</span>
            </div>
          )
        })}
        <div style={{ padding:'8px 16px', background:'#f0f2f5', borderRadius:10, fontSize:13, fontWeight:700, color:'#1a2540' }}>
          Total: {accounts.filter(a=>a.is_active).length} accounts
        </div>
      </div>

      {loading && <div style={{ color:'#6b7c93', padding:24 }}>Loading…</div>}

      {/* Account groups */}
      {!loading && TYPE_ORDER.map(type => {
        const meta  = TYPE_META[type]
        const rows  = grouped[type]
        const isCol = collapsed[type]
        const total = rows.reduce((s, a) => s + (parseFloat(a.opening_balance) || 0), 0)

        return (
          <div key={type} style={S.section}>
            {/* Section header */}
            <div style={S.sHead(meta.color, meta.bg)} onClick={() => setCollapsed(c => ({ ...c, [type]: !isCol }))}>
              <span style={{ fontSize:20 }}>{meta.icon}</span>
              <span style={S.sTitle(meta.color)}>{meta.label}</span>
              <span style={{ fontSize:11, color:meta.color, opacity:0.7 }}>{meta.labelAr}</span>
              <span style={S.sBadge(meta.color)}>{rows.length}</span>
              {total !== 0 && <span style={S.sTotal(meta.color)}>Opening: SAR {fmt(total)}</span>}
              <span style={{ color:meta.color, fontSize:16 }}>{isCol ? '▶' : '▼'}</span>
            </div>

            {/* Table */}
            {!isCol && (
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Code</th>
                    <th style={S.th}>Account Name</th>
                    <th style={S.th}>Arabic Name</th>
                    <th style={S.th}>Sub-type</th>
                    <th style={S.th}>Normal Bal</th>
                    <th style={{ ...S.th, textAlign:'right' }}>Opening Balance</th>
                    <th style={S.th}>Status</th>
                    <th style={S.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={8} style={S.emptyRow}>No accounts in this category</td></tr>
                  )}
                  {rows.map(a => (
                    <tr key={a.id} style={{ opacity: a.is_active ? 1 : 0.45 }}>
                      <td style={S.codeTd}>{a.account_code}</td>
                      <td style={{ ...S.td, maxWidth:220 }} title={a.account_name}>{a.account_name}</td>
                      <td style={{ ...S.td, fontFamily:'serif', direction:'rtl', maxWidth:160, textAlign:'right' }} title={a.account_name_ar}>{a.account_name_ar || '—'}</td>
                      <td style={{ ...S.td, maxWidth:'unset' }}>
                        <span style={S.chip(meta.color, meta.bg)}>
                          {(a.account_subtype || '').replace(/_/g,' ')}
                        </span>
                      </td>
                      <td style={{ ...S.td, maxWidth:'unset' }}>
                        <span style={S.chip(a.normal_balance==='DEBIT'?'#1565c0':'#6a1b9a', a.normal_balance==='DEBIT'?'#e3f2fd':'#f3e5f5')}>
                          {a.normal_balance}
                        </span>
                      </td>
                      <td style={S.amtTd(parseFloat(a.opening_balance)||0)}>
                        {fmt(a.opening_balance)}
                      </td>
                      <td style={{ ...S.td, maxWidth:'unset' }}>
                        <span style={S.chip(a.is_active?'#2e7d32':'#9e9e9e', a.is_active?'#e8f5e9':'#f5f5f5')}>
                          {a.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ ...S.td, maxWidth:'unset', whiteSpace:'nowrap' }}>
                        <button onClick={() => openEdit(a)} style={S.editBtn}>✏️ Edit</button>
                        {!a.is_system && (
                          <button onClick={() => toggleActive(a)} style={{ ...S.editBtn, color: a.is_active?'#e65100':'#2e7d32' }}>
                            {a.is_active ? '🔒' : '✅'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}

      {/* ── Page Banner — Add Account ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); setWizardStep(1); setModal('add') }}
        chapterName="Accounting"
        formTitle={['Add', 'Account', 'to COA']}
        workflowSteps={STEPS}
        iconLabel="Chart of Accounts"
        description="Register a new account in the Chart of Accounts. Assign its type, sub-type, and opening balance for financial reporting."
      />

      {/* ── FormShell — Add / Edit ── */}
      <FormShell
        isOpen={!!modal}
        onClose={closeModal}
        chapterName="Accounting"
        title={modal === 'add' ? ['Add', 'Account', 'to COA'] : ['Edit', 'Account', form.account_code || '']}
        steps={STEPS}
        currentStep={wizardStep}
        onBack={wizardStep === 1 ? closeModal : () => setWizardStep(s => s - 1)}
        backLabel={wizardStep === 1 ? 'Cancel' : 'Back'}
        onNext={() => {
          if (wizardStep < STEPS.length) {
            if (!form.account_code.trim()) { setError('Account code is required'); return }
            if (!form.account_name.trim()) { setError('Account name is required'); return }
            setError(null)
            setWizardStep(s => s + 1)
          } else {
            save()
          }
        }}
        nextLabel={wizardStep < STEPS.length ? 'Next →' : (saving ? 'Saving…' : modal === 'add' ? 'Add Account' : 'Save Changes')}
        nextDisabled={saving}
        subjectLabel={(form.account_code && form.account_name) ? `${form.account_code} ${form.account_name}` : (form.account_name || null)}
      >
        {error && <div style={S.err}>{error}</div>}

        {wizardStep === 1 && (
          <div>
            <div style={S.row2}>
              <div>
                <label style={S.label}>Account Code *</label>
                <input style={S.input} value={form.account_code}
                  onChange={e => setForm(f => ({ ...f, account_code: e.target.value }))}
                  placeholder="e.g. 110020003" disabled={modal !== 'add'} />
              </div>
              <div>
                <label style={S.label}>Normal Balance</label>
                <select style={S.select} value={form.normal_balance}
                  onChange={e => setForm(f => ({ ...f, normal_balance: e.target.value }))}>
                  <option value="DEBIT">DEBIT</option>
                  <option value="CREDIT">CREDIT</option>
                </select>
              </div>
            </div>

            <label style={S.label}>Account Name (English) *</label>
            <input style={S.input} value={form.account_name}
              onChange={e => setForm(f => ({ ...f, account_name: e.target.value }))}
              placeholder="e.g. Petty Cash" />

            <label style={S.label}>Account Name (Arabic)</label>
            <input style={{ ...S.input, direction:'rtl', fontFamily:'serif' }} value={form.account_name_ar || ''}
              onChange={e => setForm(f => ({ ...f, account_name_ar: e.target.value }))}
              placeholder="اسم الحساب بالعربية" />

            <div style={S.row2}>
              <div>
                <label style={S.label}>Account Type</label>
                <select style={S.select} value={form.account_type} onChange={e => handleTypeChange(e.target.value)}>
                  {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Sub-type</label>
                <select style={S.select} value={form.account_subtype || ''}
                  onChange={e => setForm(f => ({ ...f, account_subtype: e.target.value }))}>
                  {(SUBTYPES[form.account_type] || []).map(s => (
                    <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {wizardStep === 2 && (
          <div>
            <label style={S.label}>Opening Balance (SAR)</label>
            <input style={S.input} type="number" value={form.opening_balance}
              onChange={e => setForm(f => ({ ...f, opening_balance: e.target.value }))}
              placeholder="0.00" />

            <label style={S.label}>Description (optional)</label>
            <input style={S.input} value={form.description || ''}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Notes about this account…" />

            <label style={{ ...S.toggle(form.is_active), marginBottom:16, display:'inline-flex' }}
              onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}>
              <span style={{ fontSize:18 }}>{form.is_active ? '✅' : '⬜'}</span>
              Active account
            </label>
          </div>
        )}
      </FormShell>
    </div>
  )
}
