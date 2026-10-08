import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.Masters
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { QRButton } from '../components/QRCard'

const S = {
  overlay:      { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modal:        { background:'#fff', borderRadius:16, padding:28, width:660, maxWidth:'100%', maxHeight:'92vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.2)' },
  inp:          { width:'100%', padding:'9px 11px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box' },
  label:        { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4 },
  row:          { display:'flex', gap:12, marginBottom:14, flexWrap:'wrap' },
  col:          { flex:1, minWidth:140 },
  section:      { background:'#f8fafd', borderRadius:10, padding:'14px 16px', marginBottom:14 },
  sTitle:       { fontSize:11, fontWeight:800, color:'#1a2e3d', marginBottom:12, textTransform:'uppercase', letterSpacing:0.6 },
}

const TYPE_CONFIG = {
  CONTRACTOR:     { label:'Contractor',     color:'#5A32D4', bg:'#ede7f6', icon:'🏗️' },
  VENDOR:         { label:'Vendor',         color:'#00695c', bg:'#e0f2f1', icon:'🏢' },
  SUPPLIER:       { label:'Supplier',       color:'#1565c0', bg:'#e3f2fd', icon:'📦' },
  SUB_CONTRACTOR: { label:'Sub-Contractor', color:'#e65100', bg:'#fff3e0', icon:'🔧' },
  LOCAL_SUPPLIER: { label:'Local Supplier', color:'#6d4c41', bg:'#efebe9', icon:'🛒' },
  RENTAL:         { label:'Rentals',        color:'#006064', bg:'#e0f7fa', icon:'🔑' },
}

const VAT_STATUS = {
  REGISTERED: { label:'VAT Registered', color:'#2e7d32', bg:'#e8f5e9' },
  EXEMPT:     { label:'VAT Exempt',     color:'#e65100', bg:'#fff3e0' },
  UNKNOWN:    { label:'VAT Unknown',    color:'#6b7c93', bg:'#f0f4f8' },
}

const SPEC_OPTIONS = [
  'Civil Works','Fencing','Tower Erection','Foundation','Earthworks',
  'Electrical','Mechanical','Plumbing','Painting','Landscaping','Lump Sum / General',
]

const RENTAL_SPEC_OPTIONS = [
  'Car Rentals','Equipment Rentals','Testing Tools',
  'Splicing Machines','Heavy Machinery','Generators',
  'Scaffolding','Survey Equipment','Safety Equipment','Other Rentals',
]

const SA_BANKS = [
  'Al Rajhi Bank','Saudi National Bank (SNB)','Riyad Bank',
  'Saudi British Bank (SABB)','Banque Saudi Fransi','Arab National Bank',
  'Bank AlJazira','Bank Albilad','Gulf International Bank',
  'First Abu Dhabi Bank (FAB)','Emirates NBD','Other',
]

const EMPTY_BANK = {
  account_holder_name:'', bank_name:'', account_number:'',
  iban:'', swift_code:'', currency:'SAR', is_primary:false, notes:'',
}

export default function Contractors({ entityId }) {
  // ── List state ──────────────────────────────────────────────
  const [vendors,      setVendors]      = useState([])
  const [poSummary,    setPoSummary]    = useState({})
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [filterType,   setFilterType]   = useState('ALL')
  const [expanded,     setExpanded]     = useState(null)  // expanded row id

  // ── Modal state ──────────────────────────────────────────────
  const [showBanner, setShowBanner] = useState(false)
  const [open,    setOpen]    = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [editing, setEditing] = useState(null)
  const [step,    setStep]    = useState(1)

  // ── Main form fields ─────────────────────────────────────────
  const [code,         setCode]         = useState('')
  const [name,         setName]         = useState('')
  const [vendorType,   setVendorType]   = useState('CONTRACTOR')
  const [contact,      setContact]      = useState('')
  const [email,        setEmail]        = useState('')
  const [phone,        setPhone]        = useState('')
  const [address,      setAddress]      = useState('')
  const [vatNo,        setVatNo]        = useState('')
  const [terms,        setTerms]        = useState('30')
  const [status,       setStatus]       = useState('ACTIVE')
  const [crNumber,     setCrNumber]     = useState('')
  const [nationalId,   setNationalId]   = useState('')
  const [vatRegStatus, setVatRegStatus] = useState('UNKNOWN')
  const [specs,        setSpecs]        = useState([])

  // ── PO / Billing fields ──────────────────────────────────────
  const [currency,       setCurrency]      = useState('SAR')
  const [portalRequired, setPortalRequired]= useState(false)
  const [portalName,     setPortalName]    = useState('')
  const [billingNotes,   setBillingNotes]  = useState('')

  // ── Bank accounts ────────────────────────────────────────────
  const [bankAccounts, setBankAccounts] = useState([])
  const [bankLoading,  setBankLoading]  = useState(false)
  const [showBankForm, setShowBankForm] = useState(false)
  const [editingBank,  setEditingBank]  = useState(null)
  const [bankForm,     setBankForm]     = useState(EMPTY_BANK)
  const [savingBank,   setSavingBank]   = useState(false)

  useEffect(() => { load() }, [entityId])

  // ── Data loaders ─────────────────────────────────────────────
  async function load() {
    if (!entityId) return
    setLoading(true)
    const [{ data: vList }, { data: pos }] = await Promise.all([
      supabase.from('contractors').select('*').eq('entity_id', entityId).order('contractor_name'),
      supabase.from('incoming_pos').select('contractor_id,total_value,status').eq('entity_id', entityId),
    ])
    const summary = {}
    ;(pos||[]).forEach(po => {
      if (!po.contractor_id) return
      if (!summary[po.contractor_id]) summary[po.contractor_id] = { total:0, paid:0, pending:0, count:0 }
      const amt = po.total_value || 0
      summary[po.contractor_id].total   += amt
      summary[po.contractor_id].count++
      if (po.status === 'PAID') summary[po.contractor_id].paid    += amt
      else                       summary[po.contractor_id].pending += amt
    })
    setPoSummary(summary)
    setVendors(vList || [])
    setLoading(false)
  }

  async function loadBanks(contractorId) {
    setBankLoading(true)
    const { data } = await supabase
      .from('party_bank_accounts')
      .select('*')
      .eq('contractor_id', contractorId)
      .order('is_primary', { ascending: false })
    setBankAccounts(data || [])
    setBankLoading(false)
  }

  // ── Form helpers ─────────────────────────────────────────────
  function resetForm() {
    setStep(1)
    setCode(''); setName(''); setVendorType('CONTRACTOR'); setContact('')
    setEmail(''); setPhone(''); setAddress(''); setVatNo(''); setTerms('30')
    setStatus('ACTIVE'); setCrNumber(''); setNationalId('')
    setVatRegStatus('UNKNOWN'); setSpecs([])
    setCurrency('SAR'); setPortalRequired(false); setPortalName(''); setBillingNotes('')
    setBankAccounts([]); setShowBankForm(false); setEditingBank(null); setBankForm(EMPTY_BANK)
  }

  function openNew() {
    resetForm(); setEditing(null)
    genVendorCode('CONTRACTOR').then(c => setCode(c))
    setShowBanner(true)
  }

  function openEdit(c) {
    setEditing(c)
    setStep(1)
    setCode(c.contractor_code||'')
    setName(c.contractor_name||'')
    setVendorType(c.vendor_type||'CONTRACTOR')
    setContact(c.contact_person||'')
    setEmail(c.contact_email||'')
    setPhone(c.contact_phone||'')
    setAddress(c.address||'')
    setVatNo(c.vat_number||'')
    setTerms(c.payment_terms?.toString()||'30')
    setStatus(c.status||'ACTIVE')
    setCrNumber(c.cr_number||'')
    setNationalId(c.national_id||'')
    setVatRegStatus(c.vat_reg_status||'UNKNOWN')
    setSpecs(c.specializations||[])
    setCurrency(c.currency||'SAR')
    setPortalRequired(!!c.portal_required)
    setPortalName(c.portal_name||'')
    setBillingNotes(c.billing_notes||'')
    setShowBankForm(false); setEditingBank(null); setBankForm(EMPTY_BANK)
    loadBanks(c.id)
    setOpen(true)
  }

  async function genVendorCode(type) {
    const pfx = { CONTRACTOR:'CONT', VENDOR:'VEN', SUPPLIER:'SUP', SUB_CONTRACTOR:'SUB-CON', LOCAL_SUPPLIER:'LOCAL', RENTAL:'RENT' }
    const prefix = pfx[type] || 'VEN'
    const { count } = await supabase.from('contractors')
      .select('id', { count:'exact', head:true })
      .eq('entity_id', entityId).eq('vendor_type', type)
    return `${prefix}-${String((count||0)+1).padStart(3,'0')}`
  }

  function toggleSpec(s) {
    setSpecs(prev => prev.includes(s) ? prev.filter(x=>x!==s) : [...prev, s])
  }

  // ── Save party ───────────────────────────────────────────────
  async function save() {
    if (!name.trim()) { alert('Party name is required'); return }
    setSaving(true)
    let finalCode = code
    if (!finalCode && !editing) finalCode = await genVendorCode(vendorType)
    const payload = {
      entity_id:       entityId,
      contractor_code: finalCode || null,
      contractor_name: name.trim(),
      company_name:    name.trim(),
      vendor_type:     vendorType,
      contact_person:  contact || null,
      contact_email:   email   || null,
      contact_phone:   phone   || null,
      address:         address || null,
      vat_number:      vatNo   || null,
      payment_terms:   parseInt(terms) || 30,
      status,
      cr_number:       crNumber   || null,
      national_id:     nationalId || null,
      vat_reg_status:  vatRegStatus,
      specializations: specs,
      currency:        currency || 'SAR',
      portal_required: portalRequired,
      portal_name:     portalName  || null,
      billing_notes:   billingNotes || null,
    }
    if (editing) {
      const { error } = await supabase.from('contractors').update(payload).eq('id', editing.id)
      setSaving(false)
      if (error) { alert(error.message); return }
      setOpen(false); resetForm(); setEditing(null); load()
    } else {
      const { data, error } = await supabase.from('contractors').insert(payload).select().single()
      setSaving(false)
      if (error) { alert(error.message); return }
      load()
      // Re-open in edit mode so user can immediately add bank accounts
      openEdit(data)
    }
  }

  // ── Bank account CRUD ────────────────────────────────────────
  async function saveBank() {
    if (!bankForm.account_holder_name.trim()) { alert('Account holder name is required'); return }
    if (!bankForm.bank_name)                  { alert('Bank name is required'); return }
    if (!bankForm.iban && !bankForm.account_number) { alert('Enter at least an IBAN or Account Number'); return }
    setSavingBank(true)
    const payload = { ...bankForm, contractor_id: editing.id, entity_id: entityId }
    if (editingBank) {
      await supabase.from('party_bank_accounts').update(payload).eq('id', editingBank.id)
    } else {
      await supabase.from('party_bank_accounts').insert(payload)
    }
    setSavingBank(false)
    setShowBankForm(false); setEditingBank(null); setBankForm(EMPTY_BANK)
    loadBanks(editing.id)
  }

  function startEditBank(b) {
    setEditingBank(b)
    setBankForm({
      account_holder_name: b.account_holder_name || '',
      bank_name:           b.bank_name           || '',
      account_number:      b.account_number      || '',
      iban:                b.iban                || '',
      swift_code:          b.swift_code          || '',
      currency:            b.currency            || 'SAR',
      is_primary:          b.is_primary          || false,
      notes:               b.notes               || '',
    })
    setShowBankForm(true)
  }

  async function setPrimary(bankId) {
    await supabase.from('party_bank_accounts').update({ is_primary:false }).eq('contractor_id', editing.id)
    await supabase.from('party_bank_accounts').update({ is_primary:true  }).eq('id', bankId)
    loadBanks(editing.id)
  }

  async function toggleBankStatus(b) {
    const next = b.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
    await supabase.from('party_bank_accounts').update({ status: next }).eq('id', b.id)
    loadBanks(editing.id)
  }

  // ── Filtering ────────────────────────────────────────────────
  const filtered = vendors.filter(c => {
    const q = search.toLowerCase()
    const ms = !search ||
      c.contractor_name?.toLowerCase().includes(q) ||
      c.contractor_code?.toLowerCase().includes(q) ||
      c.contact_person?.toLowerCase().includes(q)
    return ms &&
      (filterStatus === 'ALL' || c.status === filterStatus) &&
      (filterType   === 'ALL' || (c.vendor_type||'CONTRACTOR') === filterType)
  })

  const countByType = t => vendors.filter(v => (v.vendor_type||'CONTRACTOR') === t).length
  const SAR = v => `SAR ${(v||0).toLocaleString(undefined,{maximumFractionDigits:0})}`

  // ── grid template shared by header + every row ───────────────
  const GRID = '100px 1fr 150px 100px 76px 32px'

  // ── Render ───────────────────────────────────────────────────
  return (
    <div>

      {/* ══ STICKY: toolbar + stats + column headers ════════════ */}
      <div style={{ position:'sticky', top:0, zIndex:20, background:'#f4f7fb', boxShadow:'0 2px 6px rgba(0,0,0,0.06)' }}>

        {/* Row 1: KPIs + Button */}
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', padding:'10px 0 6px', scrollbarWidth:'none', alignItems:'center' }}>
          {[
            { label:'All',         value:vendors.length,               color:'#1a2e3d', bg:'#f0f4f8', icon:'' },
            { label:'Contractors', value:countByType('CONTRACTOR'),     color:'#5A32D4', bg:'#ede7f6', icon:'🏗️' },
            { label:'Vendors',     value:countByType('VENDOR'),         color:'#00695c', bg:'#e0f2f1', icon:'🏢' },
            { label:'Suppliers',   value:countByType('SUPPLIER'),       color:'#1565c0', bg:'#e3f2fd', icon:'📦' },
            { label:'Sub-Con',     value:countByType('SUB_CONTRACTOR'), color:'#e65100', bg:'#fff3e0', icon:'🔧' },
            { label:'Local',       value:countByType('LOCAL_SUPPLIER'), color:'#6d4c41', bg:'#efebe9', icon:'🛒' },
            { label:'Rentals',     value:countByType('RENTAL'),         color:'#006064', bg:'#e0f7fa', icon:'🔑' },
            { label:'Active',      value:vendors.filter(v=>v.status==='ACTIVE').length, color:'#2e7d32', bg:'#e8f5e9' },
          ].map(s => (
            <div key={s.label} style={{ background:s.grad||`linear-gradient(135deg,${s.color}cc 0%,${s.color} 100%)`, borderRadius:10, padding:'10px 16px', flexShrink:0, minWidth:90, boxShadow:`0 3px 10px ${s.color}44`, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', right:8, top:6, fontSize:16, opacity:0.25 }}>{s.icon}</div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.85)', fontWeight:700, whiteSpace:'nowrap', textTransform:'uppercase', letterSpacing:0.8 }}>{s.label}</div>
              <div style={{ fontSize:20, fontWeight:900, color:'#fff', lineHeight:1.2, marginTop:2 }}>{s.value}</div>
            </div>
          ))}
          <button onClick={openNew} style={{ marginLeft:'auto', background:'#8C601B', color:'#fff', border:'none', borderRadius:10, padding:'10px 0', cursor:'pointer', fontSize:13, fontWeight:700, whiteSpace:'nowrap', flexShrink:0, minWidth:160, textAlign:'center', boxShadow:'0 3px 8px rgba(140,96,27,0.35)' }}>
            Add New Party
          </button>
        </div>

        {/* Row 3: Filters */}
        <div style={{ display:'flex', gap:10, paddingBottom:8, alignItems:'center', flexWrap:'wrap' }}>
          <input placeholder="Search name, code, contact…"
            style={{ flex:1, minWidth:160, padding:'8px 12px', borderRadius:8, border:'1px solid #dde3ec', fontSize:13, outline:'none' }}
            value={search} onChange={e=>setSearch(e.target.value)} />
          <select value={filterType} onChange={e=>setFilterType(e.target.value)}
            style={{ ...S.inp, width:'auto', minWidth:150 }}>
            <option value="ALL">All Types</option>
            <option value="CONTRACTOR">🏗️ Contractors</option>
            <option value="VENDOR">🏢 Vendors</option>
            <option value="SUPPLIER">📦 Suppliers</option>
            <option value="SUB_CONTRACTOR">🔧 Sub-Contractors</option>
            <option value="LOCAL_SUPPLIER">🛒 Local Suppliers</option>
            <option value="RENTAL">🔑 Rentals</option>
          </select>
          <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)}
            style={{ ...S.inp, width:'auto', minWidth:110 }}>
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>

        </div>

        {/* Column headers — solid white, sits flush above list rows */}
        <div style={{ display:'grid', gridTemplateColumns:GRID, background:'#8C601B', borderBottom:'2px solid #7a5217', padding:'8px 14px' }}>
          {['Code','Party Name','Type','VAT','Status',''].map(h => (
            <div key={h} style={{ fontSize:10, color:'#fff', fontWeight:800, textTransform:'uppercase', letterSpacing:0.5, textAlign:'left' }}>{h}</div>
          ))}
        </div>
      </div>

      {/* ══ LIST — collapsible single-line rows ══════════════════ */}
      <div style={{ background:'#fff', borderRadius:14, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', overflow:'hidden' }}>
        {loading ? (
          <div style={{ textAlign:'center', padding:50, color:'#aab2bd' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:50, color:'#aab2bd' }}>No parties found.</div>
        ) : filtered.map(c => {
          const isExp = expanded === c.id
          const bal   = poSummary[c.id] || { total:0, paid:0, pending:0, count:0 }
          const tc    = TYPE_CONFIG[c.vendor_type||'CONTRACTOR'] || TYPE_CONFIG.CONTRACTOR
          const vs    = VAT_STATUS[c.vat_reg_status||'UNKNOWN']
          return (
            <div key={c.id}>
              {/* ── Collapsed row (1 line) ── */}
              <div
                onClick={() => setExpanded(isExp ? null : c.id)}
                style={{
                  display:'grid', gridTemplateColumns:GRID,
                  padding:'8px 14px', cursor:'pointer', alignItems:'center',
                  borderBottom:'1px solid #f0f4f8',
                  background: isExp ? '#ede7f6' : 'transparent',
                  transition:'background 0.12s',
                }}
                onMouseEnter={e => { if (!isExp) e.currentTarget.style.background='#faf8ff' }}
                onMouseLeave={e => { if (!isExp) e.currentTarget.style.background='transparent' }}
              >
                {/* Code */}
                <div style={{ fontSize:11, fontWeight:800, color:tc.color, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', textAlign:'left' }}>{c.contractor_code||'—'}</div>
                {/* Name */}
                <div style={{ fontSize:13, fontWeight:600, color:'#1a2e3d', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', paddingRight:12, textAlign:'left' }}>
                  {c.contractor_name}
                </div>
                {/* Type */}
                <div style={{ textAlign:'left' }}><span style={{ background:tc.bg, color:tc.color, borderRadius:5, padding:'2px 8px', fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>{tc.icon} {tc.label}</span></div>
                {/* VAT */}
                <div style={{ textAlign:'left' }}><span style={{ background:vs.bg, color:vs.color, borderRadius:4, padding:'2px 7px', fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>
                  {c.vat_reg_status==='REGISTERED'?'✅ VAT':c.vat_reg_status==='EXEMPT'?'⚠️ Exempt':'❓ ?'}
                </span></div>
                {/* Status */}
                <div style={{ textAlign:'left' }}><span style={{ background:c.status==='ACTIVE'?'#e8f5e9':'#f0f4f8', color:c.status==='ACTIVE'?'#2e7d32':'#aab2bd', borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:700 }}>{c.status}</span></div>
                {/* Expand */}
                <div style={{ textAlign:'center', color:'#aab2bd', fontSize:11, transition:'transform 0.15s', transform:isExp?'rotate(90deg)':'none' }}>▶</div>
              </div>

              {/* ── Expanded detail panel ── */}
              {isExp && (
                <div style={{ background:'#f8fafd', borderBottom:'1px solid #e8edf2', padding:'16px 20px' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'12px 24px' }}>
                    {/* Column 1 */}
                    <div>
                      <div style={{ fontSize:10, color:'#9e9e9e', fontWeight:700, marginBottom:6, letterSpacing:0.5 }}>PARTY IDENTITY</div>
                      <div style={{ fontSize:14, fontWeight:800, color:'#1a2e3d', marginBottom:2 }}>{c.contractor_name}</div>
                      {c.company_name && c.company_name !== c.contractor_name && (
                        <div style={{ fontSize:12, color:'#6b7c93', marginBottom:4 }}>{c.company_name}</div>
                      )}
                      {c.cr_number && <div style={{ fontSize:11, color:'#5a6a7a' }}>CR: <strong>{c.cr_number}</strong></div>}
                      {c.national_id && <div style={{ fontSize:11, color:'#5a6a7a' }}>ID/Iqama: <strong>{c.national_id}</strong></div>}
                      {c.vat_number && <div style={{ fontSize:11, color:'#5a6a7a' }}>VAT#: <strong>{c.vat_number}</strong></div>}
                      {(c.specializations||[]).length > 0 && (
                        <div style={{ marginTop:6, display:'flex', flexWrap:'wrap', gap:4 }}>
                          {c.specializations.map(s => (
                            <span key={s} style={{ fontSize:10, background:'#fff3e0', color:'#e65100', borderRadius:4, padding:'2px 7px', fontWeight:600 }}>{s}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Column 2 */}
                    <div>
                      <div style={{ fontSize:10, color:'#9e9e9e', fontWeight:700, marginBottom:6, letterSpacing:0.5 }}>CONTACT</div>
                      {c.contact_person && <div style={{ fontSize:12, marginBottom:2 }}>👤 {c.contact_person}</div>}
                      {c.contact_phone  && <div style={{ fontSize:12, marginBottom:2 }}>📞 {c.contact_phone}</div>}
                      {c.contact_email  && <div style={{ fontSize:12, marginBottom:2 }}>✉️ {c.contact_email}</div>}
                      {c.address        && <div style={{ fontSize:11, color:'#6b7c93', marginTop:4 }}>📍 {c.address}</div>}
                      <div style={{ marginTop:6, fontSize:11, color:'#6b7c93' }}>
                        Payment Terms: <strong>{c.payment_terms || 30} days</strong>
                      </div>
                    </div>
                    {/* Column 3 — PO Summary */}
                    <div>
                      <div style={{ fontSize:10, color:'#9e9e9e', fontWeight:700, marginBottom:6, letterSpacing:0.5 }}>PO SUMMARY</div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                        {[
                          { label:'Total POs', value:bal.count },
                          { label:'Total Value', value:SAR(bal.total) },
                          { label:'Paid', value:SAR(bal.paid), color:'#2e7d32' },
                          { label:'Outstanding', value:SAR(bal.pending), color: bal.pending>0?'#c62828':'#2e7d32' },
                        ].map(row=>(
                          <div key={row.label} style={{ background:'#fff', borderRadius:6, padding:'6px 10px', border:'1px solid #e8edf2' }}>
                            <div style={{ fontSize:9, color:'#9e9e9e', fontWeight:700 }}>{row.label}</div>
                            <div style={{ fontSize:13, fontWeight:800, color:row.color||'#1a2e3d' }}>{row.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ marginTop:14, display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                    <button onClick={e=>{e.stopPropagation();openEdit(c)}}
                      style={{ background:'linear-gradient(135deg,#5A32D4,#7B52F4)', color:'#fff', border:'none', borderRadius:8, padding:'8px 20px', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                      ✏️ Edit Party
                    </button>
                    {c.qr_token && c.contractor_type === 'SUBCON' && (
                      <QRButton
                        token={c.qr_token}
                        name={c.contractor_name}
                        sub={`Sub-Contractor · ${c.contractor_code||'—'}`}
                        type="subcon"
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>{/* end list */}

      {/* ── Info note ── */}
      <div style={{ marginTop:14, background:'#ede7f6', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#4a148c' }}>
        <strong>6-Type Party Structure:</strong> Contractors (main contract) → Sub-Contractors (field work) → Suppliers (materials/equipment) → Vendors (services) → Local Suppliers 🛒 (small cash) → Rentals 🔑 (car, equipment, tools). All payments consolidate under one party record regardless of which bank account receives them.
      </div>

      {/* ── PageBanner ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); setStep(1); setOpen(true) }}
        chapterL1="#C8B48F"
        chapterL2="#FAF5E9"
        moduleColor="#8C601B"
        chapterLabel="Masters"
        formTitle={['New', 'Party', 'Creation']}
        steps={['Party Identity', 'VAT & Billing', 'Contact & Terms']}
        icon="🏢"
        description="Register a contractor, supplier, vendor or sub-contractor. Party code is automatically assigned."
      />

      {/* ══════════════════════════════════════════════════════════
          MODAL
      ══════════════════════════════════════════════════════════ */}
      {open && (() => {
        const PP  = "'Poppins','Inter',sans-serif"
        const PRI = '#8C601B'   // Masters L3 accent
        const L1  = '#C8B48F'   // Masters outer frame
        const L2  = '#FAF5E9'   // Masters inner background
        const STEP_NAMES = ['','Party Identity','VAT & Billing','Contact & Terms']
        const STEP_DESC  = ['','Type, name, code & registration numbers','VAT status, compliance & billing settings','Contact details, payment terms & address']
        const inp  = (ex={}) => ({ width:'100%', padding:'9px 14px', borderRadius:20, border:`1px solid ${PRI}44`, fontSize:13, color:'#172D37', background:'#fdfaf6', outline:'none', fontFamily:PP, boxSizing:'border-box', ...ex })
        const sec  = { fontSize:9, fontWeight:800, color:PRI, letterSpacing:1.5, textTransform:'uppercase', marginBottom:8, marginTop:12, paddingBottom:4, borderBottom:`1.5px solid ${PRI}33` }
        const lbl  = { display:'block', fontSize:11, fontWeight:600, color:'#53666F', marginBottom:4 }
        const row  = { display:'flex', gap:12, marginBottom:12, flexWrap:'wrap' }
        const col  = { flex:1, minWidth:120 }
        return (
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&(setOpen(false),resetForm())}>
          <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap');`}</style>
          <div style={{ width:860, maxWidth:'calc(100vw - 24px)', borderRadius:18, overflow:'hidden', boxShadow:'0 28px 64px rgba(0,0,0,0.32)', fontFamily:PP, background:L1, padding:8 }}>


            {/* ── STEPS 1–3 — 6-layer layout ── */}
            {step>=1 && (
              <div style={{ background:L2, borderRadius:12, display:'flex', minHeight:560, position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, right:0, width:'55%', height:'36%', background:PRI, borderRadius:'0 12px 0 90px', zIndex:1 }} />

                  {/* Sidebar */}
                  <div style={{ width:220, flexShrink:0, padding:'28px 18px 18px', display:'flex', flexDirection:'column', fontFamily:PP, position:'relative', zIndex:2 }}>
                    <div style={{ fontSize:9, fontWeight:800, color:'#53666F', letterSpacing:1.8, textTransform:'uppercase', marginBottom:3 }}>Ratal Advanced Technologies</div>
                    <div style={{ fontSize:9, fontWeight:800, color:PRI, letterSpacing:1.8, textTransform:'uppercase', marginBottom:16 }}><strong>Masters</strong></div>
                    <div style={{ fontSize:24, fontWeight:900, color:'#172D37', lineHeight:1.1, marginBottom:6 }}>{STEP_NAMES[step]}</div>
                    <div style={{ fontSize:11, color:'#53666F', lineHeight:1.5, marginBottom:8 }}>{STEP_DESC[step]}</div>
                    <div style={{ fontSize:9, fontWeight:800, color:PRI, letterSpacing:1, marginBottom:14 }}>STEP {step} OF 3</div>
                    <div style={{ flex:1, display:'flex', flexDirection:'column', gap:1 }}>
                      {['Party Identity','VAT & Billing','Contact & Terms'].map((nm,idx)=>{
                        const sn=idx+1, isAct=step===sn, isDone=step>sn
                        return (
                          <div key={sn} onClick={()=>isDone&&setStep(sn)} style={{ display:'flex', alignItems:'center', padding:'8px 0 8px 12px', cursor:isDone?'pointer':'default', borderLeft:isAct?`3px solid ${PRI}`:isDone?`3px solid ${PRI}55`:'3px solid rgba(0,0,0,0.08)' }}>
                            <span style={{ fontSize:12, fontWeight:isAct?700:500, color:isAct?'#172D37':isDone?PRI:'#b09070' }}>{nm}</span>
                            {isDone && <span style={{ marginLeft:6, fontSize:10, color:PRI }}>✓</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* White card — L4 */}
                  <div style={{ position:'absolute', top:22, right:22, bottom:22, left:256, background:'#fff', borderRadius:16, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:`0 6px 24px ${PRI}22`, zIndex:3 }}>

                    {/* Card header */}
                    <div style={{ padding:'18px 22px 0', flexShrink:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                        <div>
                          <div style={{ fontSize:17, fontWeight:700, color:'#172D37' }}>
                            {['','Party Identity','VAT & Billing','Contact & Terms'][step]}
                          </div>
                          {code && <div style={{ fontSize:11, color:PRI, fontWeight:700, marginTop:2 }}>{code}</div>}
                        </div>
                        <button onClick={()=>{setOpen(false);resetForm()}} style={{ background:`${PRI}18`, border:'none', color:PRI, borderRadius:8, width:28, height:28, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>✕</button>
                      </div>
                      <div style={{ height:1, background:`${PRI}22` }} />
                    </div>

                    {/* Scrollable form */}
                    <div style={{ flex:1, overflowY:'auto', padding:'14px 22px 10px', fontFamily:PP }}>

                      {/* Step 1 — Party Identity */}
                      {step===1 && <>
                        <div style={sec}>Party Type &amp; Status</div>
                        <div style={row}>
                          <div style={col}>
                            <label style={lbl}>Party Type *</label>
                            <select style={inp()} value={vendorType} onChange={async e=>{ setVendorType(e.target.value); if (!editing) setCode(await genVendorCode(e.target.value)) }}>
                              <option value="CONTRACTOR">🏗️ Contractor</option>
                              <option value="VENDOR">🏢 Vendor</option>
                              <option value="SUPPLIER">📦 Supplier</option>
                              <option value="SUB_CONTRACTOR">🔧 Sub-Contractor</option>
                              <option value="LOCAL_SUPPLIER">🛒 Local Supplier</option>
                              <option value="RENTAL">🔑 Rentals</option>
                            </select>
                          </div>
                          <div style={col}>
                            <label style={lbl}>Status</label>
                            <select style={inp()} value={status} onChange={e=>setStatus(e.target.value)}>
                              <option value="ACTIVE">Active</option>
                              <option value="INACTIVE">Inactive</option>
                            </select>
                          </div>
                        </div>
                        <div style={sec}>Identity</div>
                        <div style={{ marginBottom:12 }}>
                          <label style={lbl}>Party / Company Name *</label>
                          <input style={inp()} value={name} onChange={e=>setName(e.target.value)} placeholder="Full legal name as on CR or contract" />
                        </div>
                        <div style={row}>
                          <div style={col}>
                            <label style={lbl}>Party Code</label>
                            <input style={inp()} value={code} onChange={e=>setCode(e.target.value)} placeholder="Auto-generated" />
                          </div>
                          <div style={col}>
                            <label style={lbl}>CR Number</label>
                            <input style={inp()} value={crNumber} onChange={e=>setCrNumber(e.target.value)} placeholder="1010XXXXXX" />
                          </div>
                        </div>
                        {(vendorType==='SUB_CONTRACTOR'||vendorType==='CONTRACTOR') && (
                          <div style={{ marginBottom:12 }}>
                            <label style={lbl}>National ID / Iqama (for individuals)</label>
                            <input style={inp()} value={nationalId} onChange={e=>setNationalId(e.target.value)} placeholder="If individual, not company" />
                          </div>
                        )}
                      </>}

                      {/* Step 2 — VAT & Billing */}
                      {step===2 && <>
                        <div style={sec}>VAT &amp; Compliance</div>
                        <div style={row}>
                          <div style={col}>
                            <label style={lbl}>VAT Registration Status</label>
                            <select style={inp()} value={vatRegStatus} onChange={e=>setVatRegStatus(e.target.value)}>
                              <option value="REGISTERED">✅ VAT Registered</option>
                              <option value="EXEMPT">⚠️ VAT Exempt</option>
                              <option value="UNKNOWN">❓ Unknown</option>
                            </select>
                          </div>
                          <div style={col}>
                            <label style={lbl}>VAT Number</label>
                            <input style={inp()} value={vatNo} onChange={e=>setVatNo(e.target.value)} placeholder="3XXXXXXXXXX3" />
                          </div>
                        </div>
                        {vatRegStatus==='EXEMPT' && <div style={{ background:'#fff3e0', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#e65100', marginBottom:8 }}>⚠️ VAT-exempt — no input VAT can be claimed.</div>}
                        {(vendorType==='SUB_CONTRACTOR'||vendorType==='RENTAL') && <>
                          <div style={sec}>{vendorType==='RENTAL'?'Rental Specializations':'Specializations'}</div>
                          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:12 }}>
                            {(vendorType==='RENTAL'?RENTAL_SPEC_OPTIONS:SPEC_OPTIONS).map(s=>(
                              <button key={s} type="button" onClick={()=>toggleSpec(s)}
                                style={{ background:specs.includes(s)?(vendorType==='RENTAL'?'#006064':PRI):`${PRI}15`, color:specs.includes(s)?'#fff':PRI, border:'none', borderRadius:20, padding:'5px 14px', fontSize:12, cursor:'pointer', fontWeight:specs.includes(s)?700:400 }}>
                                {specs.includes(s)?'✓ ':''}{s}
                              </button>
                            ))}
                          </div>
                        </>}
                        <div style={sec}>Billing &amp; Portal</div>
                        <div style={row}>
                          <div style={col}>
                            <label style={lbl}>Invoice Currency</label>
                            <select style={inp()} value={currency} onChange={e=>setCurrency(e.target.value)}>
                              <option value="SAR">SAR — Saudi Riyal</option>
                              <option value="USD">USD — US Dollar</option>
                              <option value="EUR">EUR — Euro</option>
                              <option value="GBP">GBP — British Pound</option>
                            </select>
                          </div>
                          <div style={col}>
                            <label style={lbl}>Client Portal Required?</label>
                            <select style={inp()} value={portalRequired?'yes':'no'} onChange={e=>setPortalRequired(e.target.value==='yes')}>
                              <option value="no">No — invoice by email</option>
                              <option value="yes">Yes — submit via portal</option>
                            </select>
                          </div>
                        </div>
                        {portalRequired && (
                          <div style={{ marginBottom:12 }}>
                            <label style={lbl}>Portal Name</label>
                            <input style={inp()} value={portalName} onChange={e=>setPortalName(e.target.value)} placeholder="e.g. Oracle iSupplier, Ariba, SAP Fieldglass" />
                          </div>
                        )}
                        <div style={{ marginBottom:12 }}>
                          <label style={lbl}>Billing Notes</label>
                          <textarea style={{ ...inp(), minHeight:70, resize:'vertical' }} value={billingNotes} onChange={e=>setBillingNotes(e.target.value)} placeholder="e.g. Zero-rated lines, max 3 invoices per release, attach PO copy..." />
                        </div>
                      </>}

                      {/* Step 3 — Contact & Terms */}
                      {step===3 && <>
                        <div style={sec}>Contact Details</div>
                        <div style={row}>
                          <div style={col}><label style={lbl}>Contact Person</label><input style={inp()} value={contact} onChange={e=>setContact(e.target.value)} /></div>
                          <div style={col}><label style={lbl}>Phone</label><input style={inp()} value={phone} onChange={e=>setPhone(e.target.value)} /></div>
                        </div>
                        <div style={row}>
                          <div style={col}><label style={lbl}>Email</label><input type="email" style={inp()} value={email} onChange={e=>setEmail(e.target.value)} /></div>
                          <div style={{ flex:'0 0 160px' }}><label style={lbl}>Payment Terms (days)</label><input type="number" style={inp()} value={terms} onChange={e=>setTerms(e.target.value)} /></div>
                        </div>
                        <div style={{ marginBottom:12 }}><label style={lbl}>Address</label><textarea style={{ ...inp(), minHeight:60, resize:'vertical' }} value={address} onChange={e=>setAddress(e.target.value)} /></div>
                        {editing && (
                          <div style={{ background:`${PRI}12`, borderRadius:8, padding:'10px 14px', fontSize:12, color:PRI, fontWeight:600, marginTop:8 }}>
                            🏦 Bank accounts can be managed from the party's expanded detail row after saving.
                          </div>
                        )}
                        {!editing && (
                          <div style={{ background:'#e8f5e9', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#2e7d32', fontWeight:600, marginTop:8 }}>
                            💡 After saving, you can add bank accounts from the party detail row.
                          </div>
                        )}
                      </>}

                    </div>

                    {/* Footer inside white card */}
                    <div style={{ flexShrink:0, padding:'11px 22px 14px', borderTop:`1px solid ${PRI}22`, display:'flex', justifyContent:'space-between', alignItems:'center', fontFamily:PP }}>
                      <button onClick={step===1?(()=>{setOpen(false);resetForm()}):()=>setStep(s=>s-1)} style={{ background:'#747474', color:'#fff', border:'none', borderRadius:24, padding:'9px 24px', cursor:'pointer', fontSize:13, fontWeight:600 }}>{step===1?'Cancel':'Back'}</button>
                      <span style={{ fontSize:10, color:'#b09070' }}>Complete all three steps to add the party</span>
                      {step<3
                        ? <button onClick={()=>setStep(s=>s+1)} style={{ background:PRI, color:'#fff', border:'none', borderRadius:24, padding:'9px 28px', cursor:'pointer', fontSize:13, fontWeight:700, boxShadow:`0 4px 14px ${PRI}44` }}>Save &amp; Next</button>
                        : <button onClick={async()=>{ await save() }} disabled={saving} style={{ background:saving?'#c7c7c7':PRI, color:'#fff', border:'none', borderRadius:24, padding:'9px 28px', cursor:saving?'not-allowed':'pointer', fontSize:13, fontWeight:700, boxShadow:saving?'none':`0 4px 14px ${PRI}44` }}>{saving?'Saving…':editing?'✓ Update Party':'✓ Add Party'}</button>
                      }
                    </div>
                  </div>
              </div>
            )}

          </div>
        </div>
        )
      })()}
    </div>
  )
}
