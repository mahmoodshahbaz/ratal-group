import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Settings page — per-entity configuration
// Company info, VAT, banking, payroll defaults, system preferences

const PRI = '#454D9B'
const L1  = '#AAAED0'
const L2  = '#F0F1FA'
const PP  = "'Poppins','Segoe UI',sans-serif"

const S = {
  card:   { background:'#fff', borderRadius:14, padding:'22px 26px', boxShadow:'0 2px 12px rgba(69,77,155,0.08)', marginBottom:18, border:'1px solid #eaecf5' },
  inp:    { width:'100%', padding:'9px 12px', borderRadius:8, border:`1.5px solid #dde3ec`, fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:PP, color:'#172D37', background:'#fff' },
  btn:    (c=PRI) => ({ background:c, color:'#fff', border:'none', borderRadius:22, padding:'10px 24px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:PP, letterSpacing:0.3 }),
  label:  { display:'block', fontSize:10, color:'#6b7c93', fontWeight:700, marginBottom:5, textTransform:'uppercase', letterSpacing:0.5, fontFamily:PP },
  row:    { display:'flex', gap:14, marginBottom:16 },
  col:    { flex:1 },
  section:{ fontWeight:800, fontSize:12, color:PRI, marginBottom:14, paddingBottom:8, borderBottom:`2px solid ${PRI}22`, display:'flex', alignItems:'center', gap:8, textTransform:'uppercase', letterSpacing:1, fontFamily:PP },
  hint:   { fontSize:10, color:'#aab2bd', marginTop:3, fontFamily:PP },
}

const BANKS = [
  { code:'1060', name:'ANB — Arab National Bank' },
  { code:'1050', name:'SAMBA Financial Group' },
  { code:'1080', name:'Riyad Bank' },
  { code:'1040', name:'Al-Rajhi Bank' },
  { code:'1020', name:'Saudi National Bank' },
  { code:'1030', name:'Saudi British Bank (SABB)' },
  { code:'1010', name:'National Commercial Bank' },
]

const ENTITY_META = {
  RAT:    { name:'Ratal Tours & Travels',        nameAr:'رتال للسفر والسياحة',      type:'TRAVEL',    color:'#1565C0' },
  GWT:    { name:'Green Wings Travel',            nameAr:'الأجنحة الخضراء للسفر',   type:'TRAVEL',    color:'#2E7D32' },
  ACCSYS: { name:'Ratal Advanced Technologies',   nameAr:'رتال للتقنيات المتقدمة',  type:'CORPORATE', color:'#5A32D4' },
}

const DEFAULTS = {
  // Company
  company_name_en:'', company_name_ar:'', vat_number:'', cr_number:'',
  address_en:'', address_ar:'', city:'Riyadh', country:'Saudi Arabia',
  phone:'', email:'', website:'',
  // Banking
  default_bank_code:'1060', wps_entity_name:'', iban:'',
  // Payroll
  payroll_cutoff_day:25, fiscal_year_start:'01', salary_day:1,
  gosi_company_saudi:9, gosi_company_expat:3,
  annual_leave_days:21, sick_leave_days:30, emergency_leave_days:3,
  // System
  currency:'SAR', date_format:'DD/MM/YYYY', timezone:'Asia/Riyadh',
  invoice_prefix:'INV', po_prefix:'PO', sm_prefix:'SM',
  // Telegram
  telegram_bot_token:'', telegram_chat_id:'',
}

export default function Settings({ entityId, entityCode, isSuperAdmin }) {
  const [settings, setSettings] = useState(DEFAULTS)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const [tab,      setTab]      = useState('company') // company|banking|payroll|system|telegram

  const meta = ENTITY_META[entityCode] || ENTITY_META.ACCSYS

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('entity_settings')
      .select('*').eq('entity_id', entityId).maybeSingle()
    if (data) setSettings({ ...DEFAULTS, ...data })
    else      setSettings({ ...DEFAULTS })
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('entity_settings').upsert({
      ...settings, entity_id: entityId
    }, { onConflict:'entity_id' })
    setSaving(false)
    if (error) { alert(error.message); return }
    setSaved(true); setTimeout(()=>setSaved(false), 3000)
  }

  function s(k,v) { setSettings(p=>({...p,[k]:v})) }

  const Tab = ({ k, label }) => (
    <button onClick={()=>setTab(k)} style={{
      padding:'10px 20px', border:'none', cursor:'pointer', fontWeight:700, fontSize:12,
      borderRadius:'8px 8px 0 0', borderBottom: tab===k?`3px solid ${PRI}`:'3px solid transparent',
      background:tab===k?'#fff':'transparent', color:tab===k?PRI:'#8a94a8',
      fontFamily:PP, letterSpacing:0.3, transition:'color .15s',
    }}>{label}</button>
  )

  if (loading) return <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading settings…</div>

  return (
    <div style={{ fontFamily:PP }}>
      {/* Sticky header toolbar */}
      <div style={{ position:'sticky', top:0, zIndex:20, background:'#f4f7fb', paddingBottom:0 }}>
        <div style={{ background:`linear-gradient(120deg,#2d3580 0%,${PRI} 60%,#6b74c8 100%)`, borderRadius:14, padding:'14px 22px', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', right:-20, top:-20, width:100, height:100, borderRadius:'50%', background:'rgba(255,255,255,0.07)' }} />
          <div style={{ position:'relative', zIndex:1 }}>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.65)', letterSpacing:1.5, textTransform:'uppercase', fontFamily:PP, marginBottom:2 }}>Administration · Ratal Advanced Technologies</div>
            <div style={{ fontSize:15, fontWeight:900, color:'#fff', fontFamily:PP }}>⚙️ Settings</div>
          </div>
          <div style={{ display:'flex', gap:10, alignItems:'center', position:'relative', zIndex:1 }}>
            {saved && <span style={{ color:'#b9f6ca', fontWeight:700, fontSize:12, fontFamily:PP }}>✅ Saved!</span>}
            <button style={{ ...S.btn(), background:'#fff', color:PRI, padding:'8px 20px', fontWeight:800 }} onClick={save} disabled={saving}>{saving?'Saving…':'Save Settings'}</button>
          </div>
        </div>
        {/* Entity badge */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, paddingLeft:4 }}>
          <span style={{ background:`${PRI}18`, color:PRI, padding:'3px 12px', borderRadius:20, fontWeight:800, fontSize:11, fontFamily:PP }}>{entityCode}</span>
          <span style={{ fontSize:12, color:'#6b7c93', fontFamily:PP }}>{meta.name}</span>
        </div>
        {/* Tab bar */}
        <div style={{ display:'flex', gap:2, borderBottom:`2px solid ${L1}`, marginBottom:0 }}>
          <Tab k="company"  label="🏢 Company" />
          <Tab k="banking"  label="🏦 Banking & WPS" />
          <Tab k="payroll"  label="💵 Payroll & HR" />
          <Tab k="system"   label="⚙️ System" />
          <Tab k="telegram" label="📱 Telegram" />
        </div>
      </div>

      <div style={{ paddingTop:16 }}>

      {/* ── COMPANY ────────────────────────────────────────────── */}
      {tab==='company' && (
        <div style={S.card}>
          <div style={S.section}><span>🏢</span> Company Information</div>

          <div style={S.row}>
            <div style={S.col}><label style={S.label}>Company Name (English)</label>
              <input style={S.inp} value={settings.company_name_en} onChange={e=>s('company_name_en',e.target.value)} placeholder={meta.name} /></div>
            <div style={S.col}><label style={S.label}>اسم الشركة (عربي)</label>
              <input style={{ ...S.inp, direction:'rtl' }} value={settings.company_name_ar} onChange={e=>s('company_name_ar',e.target.value)} placeholder={meta.nameAr} /></div>
          </div>

          <div style={S.row}>
            <div style={S.col}><label style={S.label}>VAT Registration Number</label>
              <input style={S.inp} value={settings.vat_number} onChange={e=>s('vat_number',e.target.value)} placeholder="3000000000000xx" />
              <div style={S.hint}>15-digit ZATCA number — appears on all invoices</div></div>
            <div style={S.col}><label style={S.label}>Commercial Registration (CR)</label>
              <input style={S.inp} value={settings.cr_number} onChange={e=>s('cr_number',e.target.value)} placeholder="10xxxxxxxxx" /></div>
          </div>

          <div style={S.row}>
            <div style={{ flex:2 }}><label style={S.label}>Address (English)</label>
              <input style={S.inp} value={settings.address_en} onChange={e=>s('address_en',e.target.value)} placeholder="King Fahd Road, Riyadh 12345" /></div>
            <div style={S.col}><label style={S.label}>City</label>
              <input style={S.inp} value={settings.city} onChange={e=>s('city',e.target.value)} /></div>
          </div>

          <div style={S.row}>
            <div style={S.col}><label style={S.label}>Phone</label>
              <input style={S.inp} value={settings.phone} onChange={e=>s('phone',e.target.value)} placeholder="+966 11 xxx xxxx" /></div>
            <div style={S.col}><label style={S.label}>Email</label>
              <input type="email" style={S.inp} value={settings.email} onChange={e=>s('email',e.target.value)} placeholder="info@ratalgroup.com" /></div>
            <div style={S.col}><label style={S.label}>Website</label>
              <input style={S.inp} value={settings.website} onChange={e=>s('website',e.target.value)} placeholder="www.ratalgroup.com" /></div>
          </div>
        </div>
      )}

      {/* ── BANKING ────────────────────────────────────────────── */}
      {tab==='banking' && (
        <div style={S.card}>
          <div style={S.section}><span>🏦</span> Banking & WPS Configuration</div>

          <div style={S.row}>
            <div style={S.col}><label style={S.label}>Default Bank</label>
              <select style={S.inp} value={settings.default_bank_code} onChange={e=>s('default_bank_code',e.target.value)}>
                {BANKS.map(b=><option key={b.code} value={b.code}>{b.name}</option>)}
              </select></div>
            <div style={S.col}><label style={S.label}>Company IBAN</label>
              <input style={S.inp} value={settings.iban} onChange={e=>s('iban',e.target.value)} placeholder="SA00 0000 0000 0000 0000 0000" /></div>
          </div>

          <div style={S.row}>
            <div style={{ flex:2 }}><label style={S.label}>WPS Entity Name (as registered with MOL)</label>
              <input style={S.inp} value={settings.wps_entity_name} onChange={e=>s('wps_entity_name',e.target.value)} placeholder="RATAL GROUP FOR TOURS AND TRAVELS CO" />
              <div style={S.hint}>Must match exactly the name registered on the WPS/MUDAD portal — appears on WPS file H| line</div></div>
          </div>

          <div style={{ background:'#e3f2fd', borderRadius:10, padding:'14px 16px', fontSize:11, color:'#1565C0' }}>
            <div style={{ fontWeight:800, marginBottom:4 }}>WPS File Format (ANB-18)</div>
            <code style={{ fontFamily:'monospace', display:'block', lineHeight:1.8 }}>
              H|{settings.wps_entity_name||'ENTITY NAME'}|YYYYMMDD|count|totalNet|SAR<br/>
              D|empNo|name|iban|{settings.default_bank_code||'1060'}|amount|SAR
            </code>
          </div>
        </div>
      )}

      {/* ── PAYROLL ────────────────────────────────────────────── */}
      {tab==='payroll' && (
        <div style={S.card}>
          <div style={S.section}><span>💵</span> Payroll & HR Defaults</div>

          <div style={S.row}>
            <div style={S.col}><label style={S.label}>Payroll Cutoff Day</label>
              <input type="number" min={1} max={31} style={S.inp} value={settings.payroll_cutoff_day} onChange={e=>s('payroll_cutoff_day',+e.target.value)} />
              <div style={S.hint}>Day of month after which overtime/allowances are locked for processing</div></div>
            <div style={S.col}><label style={S.label}>Salary Transfer Day</label>
              <input type="number" min={1} max={31} style={S.inp} value={settings.salary_day} onChange={e=>s('salary_day',+e.target.value)} />
              <div style={S.hint}>Day salaries are transferred each month (for WPS compliance)</div></div>
            <div style={S.col}><label style={S.label}>Fiscal Year Start Month</label>
              <select style={S.inp} value={settings.fiscal_year_start} onChange={e=>s('fiscal_year_start',e.target.value)}>
                {['01','04','07','10'].map(m=><option key={m} value={m}>{['January','April','July','October'][['01','04','07','10'].indexOf(m)]}</option>)}
              </select></div>
          </div>

          <div style={S.section} style={{ ...S.section, marginTop:10 }}><span>🏛</span> GOSI Rates</div>
          <div style={{ background:'#e3f2fd', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:11, color:'#1565C0' }}>
            GOSI is a <strong>company-borne liability</strong> — not deducted from employee salary. Base = Bank Portion.
          </div>
          <div style={S.row}>
            <div style={S.col}><label style={S.label}>Saudi Employee Rate (%)</label>
              <input type="number" style={S.inp} value={settings.gosi_company_saudi} onChange={e=>s('gosi_company_saudi',+e.target.value)} />
              <div style={S.hint}>Default: 9% company contribution</div></div>
            <div style={S.col}><label style={S.label}>Expat Employee Rate (%)</label>
              <input type="number" style={S.inp} value={settings.gosi_company_expat} onChange={e=>s('gosi_company_expat',+e.target.value)} />
              <div style={S.hint}>Default: 3% company contribution</div></div>
          </div>

          <div style={S.section} style={{ ...S.section, marginTop:10 }}><span>🏖</span> Leave Defaults</div>
          <div style={S.row}>
            <div style={S.col}><label style={S.label}>Annual Leave (days/year)</label>
              <input type="number" style={S.inp} value={settings.annual_leave_days} onChange={e=>s('annual_leave_days',+e.target.value)} />
              <div style={S.hint}>Saudi Labour Law: 21 days (first 5 years), 30 days thereafter</div></div>
            <div style={S.col}><label style={S.label}>Sick Leave (days/year)</label>
              <input type="number" style={S.inp} value={settings.sick_leave_days} onChange={e=>s('sick_leave_days',+e.target.value)} /></div>
            <div style={S.col}><label style={S.label}>Emergency Leave (days/year)</label>
              <input type="number" style={S.inp} value={settings.emergency_leave_days} onChange={e=>s('emergency_leave_days',+e.target.value)} /></div>
          </div>
        </div>
      )}

      {/* ── SYSTEM ─────────────────────────────────────────────── */}
      {tab==='system' && (
        <div style={S.card}>
          <div style={S.section}><span>⚙️</span> System Preferences</div>

          <div style={S.row}>
            <div style={S.col}><label style={S.label}>Currency</label>
              <select style={S.inp} value={settings.currency} onChange={e=>s('currency',e.target.value)}>
                <option value="SAR">SAR — Saudi Riyal</option>
                <option value="USD">USD — US Dollar</option>
                <option value="EUR">EUR — Euro</option>
              </select></div>
            <div style={S.col}><label style={S.label}>Date Format</label>
              <select style={S.inp} value={settings.date_format} onChange={e=>s('date_format',e.target.value)}>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (ISO)</option>
              </select></div>
            <div style={S.col}><label style={S.label}>Timezone</label>
              <select style={S.inp} value={settings.timezone} onChange={e=>s('timezone',e.target.value)}>
                <option value="Asia/Riyadh">Asia/Riyadh (AST +3)</option>
                <option value="Asia/Dubai">Asia/Dubai (GST +4)</option>
                <option value="UTC">UTC</option>
              </select></div>
          </div>

          <div style={S.section} style={{ ...S.section, marginTop:10 }}><span>🔢</span> Number Prefixes</div>
          <div style={S.row}>
            <div style={S.col}><label style={S.label}>Invoice Prefix</label>
              <input style={S.inp} value={settings.invoice_prefix} onChange={e=>s('invoice_prefix',e.target.value)} placeholder="INV" />
              <div style={S.hint}>e.g. INV → INV-26-001</div></div>
            <div style={S.col}><label style={S.label}>Purchase Order Prefix</label>
              <input style={S.inp} value={settings.po_prefix} onChange={e=>s('po_prefix',e.target.value)} placeholder="PO" /></div>
            <div style={S.col}><label style={S.label}>Site Master Prefix</label>
              <input style={S.inp} value={settings.sm_prefix} onChange={e=>s('sm_prefix',e.target.value)} placeholder="SM" />
              <div style={S.hint}>e.g. SM → SM-NISU-26-001</div></div>
          </div>

          <div style={{ background:'#fff3e0', borderRadius:10, padding:'12px 16px', fontSize:11, color:'#e65100', marginTop:8 }}>
            ⚠️ Changing prefixes will not rename existing records — only new ones created after saving will use the new prefix.
          </div>
        </div>
      )}

      {/* ── TELEGRAM ───────────────────────────────────────────── */}
      {tab==='telegram' && (
        <div style={S.card}>
          <div style={S.section}><span>📱</span> Telegram Notifications</div>
          <div style={{ background:'#e8f5e9', borderRadius:10, padding:'12px 16px', marginBottom:16, fontSize:11, color:'#2e7d32' }}>
            Telegram notifications send alerts for: new money requests, PO approvals, compliance expiry, payroll ready, new tickets.
          </div>

          <div style={{ marginBottom:14 }}><label style={S.label}>Bot Token</label>
            <input style={S.inp} value={settings.telegram_bot_token} onChange={e=>s('telegram_bot_token',e.target.value)} placeholder="7xxxxxxxxx:AAF..." type="password" />
            <div style={S.hint}>From @BotFather → /newbot. Store in Supabase Edge Function secrets as TELEGRAM_BOT_TOKEN</div></div>

          <div style={{ marginBottom:16 }}><label style={S.label}>Chat / Group ID</label>
            <input style={S.inp} value={settings.telegram_chat_id} onChange={e=>s('telegram_chat_id',e.target.value)} placeholder="-100xxxxxxxxxx" />
            <div style={S.hint}>Add @getidsbot to your group and send any message. Negative ID = group chat</div></div>

          <div style={{ background:'#f5f7fa', borderRadius:10, padding:'14px 16px', fontSize:11, color:'#546e7a', lineHeight:1.8 }}>
            <div style={{ fontWeight:800, marginBottom:6 }}>Setup Steps</div>
            1. Create a Telegram group for your team<br/>
            2. Create a bot via @BotFather — get the token<br/>
            3. Add the bot to your group as admin<br/>
            4. Get the group ID via @getidsbot<br/>
            5. Set <code>TELEGRAM_BOT_TOKEN</code> in Supabase Edge Function Secrets<br/>
            6. Save the Chat ID here — the Edge Function reads it from this table
          </div>
        </div>
      )}

      {/* Save button (bottom) */}
      <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:4 }}>
        {saved && <span style={{ color:'#2e7d32', fontWeight:700, fontSize:13, alignSelf:'center', fontFamily:PP }}>✅ Settings saved!</span>}
        <button style={S.btn()} onClick={save} disabled={saving}>{saving?'Saving…':'Save Settings'}</button>
      </div>
      </div>{/* end paddingTop wrapper */}
    </div>
  )
}
