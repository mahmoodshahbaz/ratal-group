import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Schema: customers(entity_id[required], account_no, name_en, name_ar,
//         phone, email, address, payment_type[CASH|CREDIT], credit_limit,
//         current_balance, is_active)

const S = {
  inp: { width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #dde3ec', fontSize:14, outline:'none', background:'#fff', boxSizing:'border-box', fontFamily:'inherit' },
  lbl: { display:'block', fontSize:12, color:'#6b7c93', marginBottom:4, fontWeight:600 },
  grp: { marginBottom:14 },
  sel: { width:'100%', padding:'9px 12px', borderRadius:8, border:'1px solid #dde3ec', fontSize:14, outline:'none', background:'#fff', boxSizing:'border-box', cursor:'pointer', fontFamily:'inherit' },
}

function AddCustomerModal({ onClose, onAdded, entities }) {
  const [entityId,    setEntityId]    = useState(entities[0]?.id || '')
  const [accountNo,   setAccountNo]   = useState('')
  const [nameEn,      setNameEn]      = useState('')
  const [nameAr,      setNameAr]      = useState('')
  const [phone,       setPhone]       = useState('')
  const [email,       setEmail]       = useState('')
  const [address,     setAddress]     = useState('')
  const [paymentType, setPaymentType] = useState('CREDIT')
  const [creditLimit, setCreditLimit] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setError('')
    const { error: err } = await supabase.from('customers').insert({
      entity_id:    entityId,
      account_no:   accountNo,       // ← account_no not account_number
      name_en:      nameEn,          // ← name_en not customer_name
      name_ar:      nameAr || null,  // ← name_ar not customer_name_ar
      phone:        phone || null,
      email:        email || null,
      address:      address || null,
      payment_type: paymentType,
      credit_limit: parseFloat(creditLimit) || 0,
      is_active:    true,
    })
    if (err) { setError(err.message); setSaving(false); return }
    onAdded(); onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:540, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding:'16px 22px', background:'linear-gradient(135deg,#0f1f2e,#1a3a4a)', borderRadius:'16px 16px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0 }}>
          <h3 style={{ margin:0, color:'#fff', fontSize:16 }}>👤 Add New Customer</h3>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#fff', borderRadius:8, padding:'4px 14px', cursor:'pointer', fontSize:18 }}>✕</button>
        </div>
        {error && <div style={{ background:'#ffebee', color:'#c62828', padding:'8px 22px', fontSize:13 }}>⚠️ {error}</div>}
        <form onSubmit={handleSubmit} style={{ padding:'18px 22px' }}>
          <div style={S.grp}>
            <label style={S.lbl}>Entity *</label>
            <select style={S.sel} value={entityId} onChange={e=>setEntityId(e.target.value)}>
              {entities.map(en=><option key={en.id} value={en.id}>{en.code} — {en.name_en}</option>)}
            </select>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' }}>
            <div style={S.grp}><label style={S.lbl}>Account No. *</label><input style={S.inp} value={accountNo} onChange={e=>setAccountNo(e.target.value)} required placeholder="e.g. 0710500" /></div>
            <div style={S.grp}><label style={S.lbl}>Payment Type</label><select style={S.sel} value={paymentType} onChange={e=>setPaymentType(e.target.value)}><option value="CREDIT">Credit</option><option value="CASH">Cash</option></select></div>
          </div>
          <div style={S.grp}><label style={S.lbl}>Name (English) *</label><input style={S.inp} value={nameEn} onChange={e=>setNameEn(e.target.value)} required placeholder="Company or person name" /></div>
          <div style={S.grp}><label style={S.lbl}>الاسم (عربي)</label><input style={{ ...S.inp, direction:'rtl' }} value={nameAr} onChange={e=>setNameAr(e.target.value)} placeholder="اختياري" /></div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' }}>
            <div style={S.grp}><label style={S.lbl}>Phone</label><input style={S.inp} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+966 5x xxx xxxx" /></div>
            <div style={S.grp}><label style={S.lbl}>Email</label><input type="email" style={S.inp} value={email} onChange={e=>setEmail(e.target.value)} /></div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' }}>
            <div style={S.grp}><label style={S.lbl}>Credit Limit (SAR)</label><input type="number" step="0.01" style={S.inp} value={creditLimit} onChange={e=>setCreditLimit(e.target.value)} placeholder="0.00" /></div>
            <div style={S.grp}><label style={S.lbl}>Address</label><input style={S.inp} value={address} onChange={e=>setAddress(e.target.value)} /></div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
            <button type="button" onClick={onClose} style={{ padding:'9px 22px', borderRadius:9, border:'1px solid #dde3ec', background:'#fff', cursor:'pointer', fontSize:14, color:'#6b7c93' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding:'9px 24px', borderRadius:9, border:'none', background:saving?'#aaa':'linear-gradient(135deg,#1a6aff,#00b87a)', color:'#fff', cursor:'pointer', fontSize:14, fontWeight:700 }}>{saving?'Saving...':'💾 Add Customer'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [entities,  setEntities]  = useState([])
  const [search,    setSearch]    = useState('')
  const [filterPay, setFilterPay] = useState('ALL')
  const [showAdd,   setShowAdd]   = useState(false)
  const [loading,   setLoading]   = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: c }, { data: e }] = await Promise.all([
      supabase.from('customers').select('*, entities(code)').order('account_no'),
      supabase.from('entities').select('*'),
    ])
    setCustomers(c || []); setEntities(e || [])
    setLoading(false)
  }

  const filtered = customers.filter(c =>
    (filterPay === 'ALL' || c.payment_type === filterPay) &&
    (
      c.name_en?.toLowerCase().includes(search.toLowerCase()) ||
      c.name_ar?.includes(search) ||
      c.account_no?.toLowerCase().includes(search.toLowerCase()) ||
      c.phone?.includes(search) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
    )
  )

  return (
    <div>
      <div style={{ display:'flex', gap:12, marginBottom:16, overflowX:'auto', flexWrap:'nowrap', paddingBottom:2 }}>
        {[['All', customers.length, '#1a6aff'],['Credit', customers.filter(c=>c.payment_type==='CREDIT').length,'#00897b'],['Cash', customers.filter(c=>c.payment_type==='CASH').length,'#e65100']].map(([l,v,c])=>(
          <div key={l} style={{ background:'#fff', borderRadius:10, padding:'10px 20px', boxShadow:'0 2px 6px rgba(0,0,0,0.07)', textAlign:'center' }}>
            <div style={{ fontSize:10, color:'#6b7c93', marginBottom:2, fontWeight:600 }}>{l}</div>
            <div style={{ fontSize:20, fontWeight:800, color:c }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:10, marginBottom:16, justifyContent:'space-between', alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:10, flex:1 }}>
          <input style={{ ...S.inp, maxWidth:300, border:'1px solid #dde3ec' }} value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Search name, account, phone..." />
          <select style={{ ...S.sel, width:'auto', minWidth:140 }} value={filterPay} onChange={e=>setFilterPay(e.target.value)}>
            <option value="ALL">All Types</option>
            <option value="CREDIT">Credit</option>
            <option value="CASH">Cash</option>
          </select>
        </div>
        <button onClick={()=>setShowAdd(true)} style={{ background:'linear-gradient(135deg,#1a6aff,#00b87a)', color:'#fff', border:'none', borderRadius:10, padding:'10px 22px', cursor:'pointer', fontSize:14, fontWeight:700, whiteSpace:'nowrap' }}>+ Add Customer</button>
      </div>
      <div style={{ background:'#fff', borderRadius:14, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', overflow:'hidden' }}>
        <div style={{ padding:'8px 14px', background:'#f8fafd', borderBottom:'1px solid #f0f4f8', fontSize:12, color:'#6b7c93' }}>Showing {filtered.length} of {customers.length} customers</div>
        {loading ? <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>Loading...</div> : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr style={{ background:'#f8fafd' }}>
              {['Account No','Name (EN)','Arabic Name','Entity','Payment','Phone','Balance (SAR)','Status'].map(h=>(
                <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, color:'#6b7c93', fontWeight:700 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? <tr><td colSpan={8} style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No customers found</td></tr> :
              filtered.map(c=>(
                <tr key={c.id} style={{ borderTop:'1px solid #f0f4f8' }}>
                  <td style={{ padding:'10px 14px', fontWeight:700, color:'#1a6aff', fontSize:13 }}>{c.account_no}</td>
                  <td style={{ padding:'10px 14px', fontSize:13 }}>{c.name_en}</td>
                  <td style={{ padding:'10px 14px', fontSize:13, direction:'rtl' }}>{c.name_ar || '—'}</td>
                  <td style={{ padding:'10px 14px', fontSize:12 }}>{c.entities?.code || '—'}</td>
                  <td style={{ padding:'10px 14px' }}><span style={{ background:c.payment_type==='CREDIT'?'#e3f2fd':'#fff3e0', color:c.payment_type==='CREDIT'?'#0277bd':'#e65100', borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{c.payment_type}</span></td>
                  <td style={{ padding:'10px 14px', fontSize:12 }}>{c.phone || '—'}</td>
                  <td style={{ padding:'10px 14px', fontSize:13, color:(c.current_balance||0)>0?'#c62828':'#2e7d32', fontWeight:600 }}>SAR {(c.current_balance||0).toLocaleString()}</td>
                  <td style={{ padding:'10px 14px' }}><span style={{ background:c.is_active?'#e8f5e9':'#ffebee', color:c.is_active?'#2e7d32':'#c62828', borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{c.is_active?'Active':'Inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showAdd && <AddCustomerModal entities={entities} onClose={()=>setShowAdd(false)} onAdded={load} />}
    </div>
  )
}
