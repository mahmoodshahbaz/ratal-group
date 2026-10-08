/**
 * formTheme.jsx — Shared UI components for all Ratal Group shareable forms
 * Each form gets a coloured top bar + dark-navy section headers + consistent field sizes.
 */

// ── Theme colours per form type ──────────────────────────────────────────────
export const THEMES = {
  expense:    { color:'#1565c0', bg:'#e3f2fd', icon:'💸', title:'Expense Claim',    titleAr:'مطالبة مصروف'  },
  overtime:   { color:'#e65100', bg:'#fff3e0', icon:'⏱️', title:'Overtime Request', titleAr:'طلب عمل إضافي' },
  food:       { color:'#880e4f', bg:'#fce4ec', icon:'🍽️', title:'Food Allowance',   titleAr:'بدل الطعام'    },
  money:      { color:'#1a237e', bg:'#e8eaf6', icon:'💰', title:'Money Request',    titleAr:'طلب مالي'      },
  po_request:    { color:'#0097a7', bg:'#e0f7fa', icon:'📦', title:'PO Request',        titleAr:'طلب أمر شراء'   },
  field_payment: { color:'#1b5e20', bg:'#e8f5e9', icon:'💳', title:'Field Payment',     titleAr:'الدفع الميداني' },
}

// ── Common field styles ───────────────────────────────────────────────────────
export const inp = {
  width:'100%', padding:'9px 11px',
  border:'1px solid #c8d0dc', borderRadius:4,
  fontSize:13, fontFamily:'Arial,sans-serif',
  boxSizing:'border-box', minHeight:40, background:'#fff',
}
export const inpRo = { ...inp, background:'#f0f4ff', color:'#5a6a7a' }

// ── Page shell ────────────────────────────────────────────────────────────────
export function FormPage({ theme, isAr, langToggle, children }) {
  return (
    <div style={{ minHeight:'100vh', background:'#edf0f5', fontFamily:'Arial,sans-serif', direction:isAr?'rtl':'ltr' }}>
      {/* Coloured header bar */}
      <div style={{ background:theme.color, padding:'12px 16px 14px' }}>
        <div style={{ maxWidth:520, margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, background:'rgba(255,255,255,0.18)', borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
              {theme.icon}
            </div>
            <div>
              <div style={{ color:'#fff', fontWeight:700, fontSize:15 }}>{isAr ? theme.titleAr : theme.title}</div>
              <div style={{ color:'rgba(255,255,255,0.65)', fontSize:11 }}>Ratal Group</div>
            </div>
          </div>
          {langToggle}
        </div>
      </div>
      {/* Body */}
      <div style={{ maxWidth:520, margin:'0 auto', padding:'14px 12px 40px' }}>
        {children}
      </div>
    </div>
  )
}

// ── Section group (dark navy header + white body) ─────────────────────────────
export function Section({ title, children }) {
  return (
    <div style={{ background:'#fff', borderRadius:6, marginBottom:11, overflow:'hidden', border:'1px solid #dde3ec' }}>
      <div style={{ background:'#1a2e4a', color:'#fff', padding:'8px 14px', fontSize:12, fontWeight:700, letterSpacing:0.3 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// ── Field row inside a section ────────────────────────────────────────────────
export function Row({ children, last }) {
  return (
    <div style={{ display:'flex', gap:10, padding:'10px 14px', borderBottom: last ? 'none' : '1px solid #f4f6f8', flexWrap:'wrap' }}>
      {children}
    </div>
  )
}

// ── Individual labelled field ─────────────────────────────────────────────────
export function Field({ label, flex=1, children }) {
  return (
    <div style={{ flex, minWidth:120 }}>
      <div style={{ fontSize:10, color:'#7a8ea8', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.4px', marginBottom:4 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

// ── Toggle group (e.g. Expense / Receiving) ───────────────────────────────────
export function ToggleRow({ options, value, onChange, theme }) {
  return (
    <div style={{ padding:'10px 14px', borderBottom:'1px solid #f4f6f8', display:'flex', gap:8 }}>
      {options.map(o => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          style={{ flex:1, padding:'8px', borderRadius:4, cursor:'pointer', fontFamily:'Arial,sans-serif', fontWeight:700, fontSize:12,
            border:`1.5px solid ${value===o.value ? theme.color : '#dde3ec'}`,
            background: value===o.value ? theme.bg : '#f8fafd',
            color: value===o.value ? theme.color : '#7a8ea8',
          }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ── Info/total strip ─────────────────────────────────────────────────────────
export function InfoStrip({ theme, children }) {
  return (
    <div style={{ padding:'8px 14px', background:theme.bg, fontSize:13, fontWeight:700, color:theme.color }}>
      {children}
    </div>
  )
}

// ── Submit bar ────────────────────────────────────────────────────────────────
export function SubmitBar({ theme, label, loading }) {
  return (
    <div style={{ background:'#fff', borderRadius:6, border:'1px solid #dde3ec', marginBottom:11 }}>
      <div style={{ padding:'12px 14px' }}>
        <button type="submit" disabled={loading} style={{
          width:'100%', padding:'11px', fontFamily:'Arial,sans-serif',
          background: loading ? '#aab2bd' : theme.color,
          color:'#fff', border:'none', borderRadius:5, fontSize:14, fontWeight:700,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}>
          {loading ? 'Submitting…' : label}
        </button>
      </div>
      <p style={{ textAlign:'center', color:'#bbb', fontSize:11, margin:'0 0 10px' }}>
        Telegram notification sent on submission
      </p>
    </div>
  )
}

// ── Language toggle button ────────────────────────────────────────────────────
export function LangBtn({ isAr, toggle }) {
  return (
    <button onClick={toggle} style={{
      background:'rgba(255,255,255,0.2)', color:'#fff', border:'1px solid rgba(255,255,255,0.35)',
      borderRadius:4, padding:'4px 12px', fontSize:11, fontWeight:700,
      cursor:'pointer', fontFamily:'Arial,sans-serif',
    }}>
      {isAr ? 'English' : 'العربية'}
    </button>
  )
}

// ── Error banner ──────────────────────────────────────────────────────────────
export function ErrorBanner({ msg }) {
  if (!msg) return null
  return (
    <div style={{ background:'#ffebee', border:'1px solid #ffcdd2', borderRadius:5, padding:'9px 12px', color:'#c62828', fontSize:12, marginBottom:11 }}>
      ⚠️ {msg}
    </div>
  )
}

// ── Success screen ────────────────────────────────────────────────────────────
export function SuccessScreen({ theme, reqNumber, isAr, onAnother }) {
  return (
    <div style={{ background:'#fff', borderRadius:6, border:'1px solid #dde3ec', padding:30, textAlign:'center', marginTop:8 }}>
      <div style={{ fontSize:50, marginBottom:10 }}>✅</div>
      <div style={{ fontSize:18, fontWeight:700, color:'#1a2e4a', marginBottom:6 }}>
        {isAr ? 'تم الإرسال بنجاح' : 'Submitted successfully!'}
      </div>
      <div style={{ fontSize:13, color:'#7a8ea8', marginBottom:4 }}>
        {isAr ? 'رقم الطلب' : 'Request #'}: <strong style={{ color:theme.color }}>{reqNumber}</strong>
      </div>
      <div style={{ fontSize:12, color:'#bbb', marginBottom:20 }}>
        {isAr ? 'تم إرسال إشعار تيليجرام' : 'Telegram notification sent.'}
      </div>
      <button onClick={onAnother} style={{
        background:theme.color, color:'#fff', border:'none', borderRadius:5,
        padding:'10px 24px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Arial,sans-serif',
      }}>
        {isAr ? 'إرسال طلب آخر' : 'Submit Another'}
      </button>
    </div>
  )
}

// ── Login required screen ─────────────────────────────────────────────────────
export function LoginRequired() {
  return (
    <div style={{ background:'#fff', borderRadius:6, border:'1px solid #dde3ec', padding:40, textAlign:'center', marginTop:8 }}>
      <div style={{ fontSize:44, marginBottom:12 }}>🔐</div>
      <div style={{ fontSize:16, fontWeight:700, color:'#1a2e4a', marginBottom:8 }}>Sign in required</div>
      <div style={{ fontSize:13, color:'#7a8ea8' }}>
        Open the main Ratal Group app, sign in, then return to this link.
      </div>
    </div>
  )
}
