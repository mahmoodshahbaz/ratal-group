import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Schema: airlines(airline_code, numeric_code, airline_name, airline_name_ar,
//         route_type[INT|DOM], account_no, comm_account_no,
//         comm_tier_1[First%], comm_tier_2[Business%],
//         comm_tier_3[Economy%], comm_tier_4[Special%], is_active)

const S = {
  inp: { width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', background:'#fff', boxSizing:'border-box', fontFamily:'inherit' },
  lbl: { display:'block', fontSize:11, color:'#6b7c93', marginBottom:3, fontWeight:600 },
  grp: { marginBottom:12 },
  sel: { width:'100%', padding:'8px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', background:'#fff', boxSizing:'border-box', cursor:'pointer', fontFamily:'inherit' },
}

function AirlineModal({ airline, onClose, onSaved }) {
  const [airlineCode, setAirlineCode] = useState(airline?.airline_code || '')
  const [numericCode, setNumericCode] = useState(airline?.numeric_code  || '')
  const [nameEn,      setNameEn]      = useState(airline?.airline_name  || '')
  const [nameAr,      setNameAr]      = useState(airline?.airline_name_ar || '')
  const [routeType,   setRouteType]   = useState(airline?.route_type    || 'INT')
  const [accountNo,   setAccountNo]   = useState(airline?.account_no    || '')
  const [tier1,       setTier1]       = useState(airline?.comm_tier_1   ?? 0)
  const [tier2,       setTier2]       = useState(airline?.comm_tier_2   ?? 0)
  const [tier3,       setTier3]       = useState(airline?.comm_tier_3   ?? 0)
  const [tier4,       setTier4]       = useState(airline?.comm_tier_4   ?? 0)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setError('')
    const payload = {
      airline_code:    airlineCode.toUpperCase(),
      numeric_code:    numericCode || null,
      airline_name:    nameEn,
      airline_name_ar: nameAr || null,
      route_type:      routeType,
      account_no:      accountNo || null,
      comm_tier_1:     parseFloat(tier1) || 0,  // First class %
      comm_tier_2:     parseFloat(tier2) || 0,  // Business %
      comm_tier_3:     parseFloat(tier3) || 0,  // Economy %
      comm_tier_4:     parseFloat(tier4) || 0,  // Special %
    }
    const { error: err } = airline?.id
      ? await supabase.from('airlines').update(payload).eq('id', airline.id)
      : await supabase.from('airlines').insert(payload)
    if (err) { setError(err.message); setSaving(false); return }
    onSaved(); onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}>
      <div style={{ background:'#fff', borderRadius:14, width:'100%', maxWidth:520, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ padding:'14px 20px', background:'linear-gradient(135deg,#0f1f2e,#1a3a4a)', borderRadius:'14px 14px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center', position:'sticky', top:0 }}>
          <h3 style={{ margin:0, color:'#fff', fontSize:15 }}>{airline ? '✏️ Edit Airline' : '✈️ Add Airline'}</h3>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#fff', borderRadius:6, padding:'4px 12px', cursor:'pointer', fontSize:18 }}>✕</button>
        </div>
        {error && <div style={{ background:'#ffebee', color:'#c62828', padding:'8px 20px', fontSize:13 }}>⚠️ {error}</div>}
        <form onSubmit={handleSubmit} style={{ padding:'16px 20px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0 14px' }}>
            <div style={S.grp}><label style={S.lbl}>IATA Code *</label><input style={S.inp} value={airlineCode} onChange={e=>setAirlineCode(e.target.value)} required placeholder="EK" maxLength={5} /></div>
            <div style={S.grp}><label style={S.lbl}>Numeric Code</label><input style={S.inp} value={numericCode} onChange={e=>setNumericCode(e.target.value)} placeholder="176" maxLength={5} /></div>
            <div style={S.grp}><label style={S.lbl}>Route Type</label><select style={S.sel} value={routeType} onChange={e=>setRouteType(e.target.value)}><option value="INT">International</option><option value="DOM">Domestic</option></select></div>
          </div>
          <div style={S.grp}><label style={S.lbl}>Airline Name (English) *</label><input style={S.inp} value={nameEn} onChange={e=>setNameEn(e.target.value)} required /></div>
          <div style={S.grp}><label style={S.lbl}>اسم شركة الطيران (عربي)</label><input style={{ ...S.inp, direction:'rtl' }} value={nameAr} onChange={e=>setNameAr(e.target.value)} /></div>
          <div style={S.grp}><label style={S.lbl}>Account No.</label><input style={S.inp} value={accountNo} onChange={e=>setAccountNo(e.target.value)} placeholder="e.g. 0401176" /></div>

          <div style={{ fontSize:11, fontWeight:700, color:'#0091ea', margin:'10px 0 8px', letterSpacing:1 }}>COMMISSION TIERS (%)</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'0 12px' }}>
            {[['First (F)', tier1, setTier1],['Business (C)', tier2, setTier2],['Economy (Y)', tier3, setTier3],['Special (W)', tier4, setTier4]].map(([l,v,set])=>(
              <div key={l} style={S.grp}><label style={S.lbl}>{l}</label><input type="number" step="0.01" style={S.inp} value={v} onChange={e=>set(e.target.value)} placeholder="0.00" /></div>
            ))}
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
            <button type="button" onClick={onClose} style={{ padding:'8px 20px', borderRadius:8, border:'1px solid #dde3ec', background:'#fff', cursor:'pointer', fontSize:13, color:'#6b7c93' }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ padding:'8px 22px', borderRadius:8, border:'none', background:saving?'#aaa':'linear-gradient(135deg,#0f1f2e,#1a6aff)', color:'#fff', cursor:'pointer', fontSize:13, fontWeight:700 }}>{saving?'Saving...':'💾 Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Airlines() {
  const [airlines, setAirlines] = useState([])
  const [search,   setSearch]   = useState('')
  const [filter,   setFilter]   = useState('ALL')
  const [editAl,   setEditAl]   = useState(null)
  const [showAdd,  setShowAdd]  = useState(false)
  const [loading,  setLoading]  = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('airlines').select('*').order('airline_name')
    setAirlines(data || [])
    setLoading(false)
  }

  const filtered = airlines.filter(a =>
    (filter === 'ALL' || a.route_type === filter) &&
    (a.airline_code?.toLowerCase().includes(search.toLowerCase()) || a.airline_name?.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div>
      <div style={{ display:'flex', gap:10, marginBottom:16, justifyContent:'space-between', alignItems:'center', flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:10, flex:1 }}>
          <input style={{ ...S.inp, maxWidth:280, border:'1px solid #dde3ec' }} value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍  Search airline..." />
          <select style={{ ...S.sel, width:'auto', minWidth:140 }} value={filter} onChange={e=>setFilter(e.target.value)}>
            <option value="ALL">All Routes</option>
            <option value="INT">International</option>
            <option value="DOM">Domestic</option>
          </select>
        </div>
        <button onClick={()=>setShowAdd(true)} style={{ background:'linear-gradient(135deg,#0f1f2e,#1a6aff)', color:'#fff', border:'none', borderRadius:10, padding:'10px 22px', cursor:'pointer', fontSize:14, fontWeight:700, whiteSpace:'nowrap' }}>+ Add Airline</button>
      </div>
      <div style={{ background:'#fff', borderRadius:14, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', overflow:'hidden' }}>
        <div style={{ padding:'8px 14px', background:'#f8fafd', borderBottom:'1px solid #f0f4f8', fontSize:12, color:'#6b7c93' }}>{filtered.length} airlines</div>
        {loading ? <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>Loading...</div> : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr style={{ background:'#f8fafd' }}>
              {['Code','Numeric','Airline Name','Type','Account No','First%','Business%','Economy%','Special%',''].map(h=>(
                <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:11, color:'#6b7c93', fontWeight:700 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {filtered.map(a=>(
                <tr key={a.id} style={{ borderTop:'1px solid #f0f4f8' }}>
                  <td style={{ padding:'10px 12px', fontWeight:800, color:'#0f1f2e', fontSize:14 }}>{a.airline_code}</td>
                  <td style={{ padding:'10px 12px', fontSize:12, color:'#6b7c93' }}>{a.numeric_code || '—'}</td>
                  <td style={{ padding:'10px 12px', fontSize:13 }}>{a.airline_name}</td>
                  <td style={{ padding:'10px 12px' }}><span style={{ background:a.route_type==='INT'?'#e3f2fd':'#e8f5e9', color:a.route_type==='INT'?'#0277bd':'#2e7d32', borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700 }}>{a.route_type}</span></td>
                  <td style={{ padding:'10px 12px', fontSize:12 }}>{a.account_no || '—'}</td>
                  {[a.comm_tier_1, a.comm_tier_2, a.comm_tier_3, a.comm_tier_4].map((v,i)=>(
                    <td key={i} style={{ padding:'10px 12px', fontSize:13, textAlign:'center', color:(v||0)>0?'#7b1fa2':'#aab2bd', fontWeight:(v||0)>0?700:400 }}>{(v||0).toFixed(2)}%</td>
                  ))}
                  <td style={{ padding:'10px 12px' }}><button onClick={()=>setEditAl(a)} style={{ background:'#e3f2fd', color:'#0277bd', border:'none', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:11, fontWeight:700 }}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showAdd && <AirlineModal onClose={()=>setShowAdd(false)} onSaved={load} />}
      {editAl  && <AirlineModal airline={editAl} onClose={()=>setEditAl(null)} onSaved={()=>{ load(); setEditAl(null) }} />}
    </div>
  )
}
