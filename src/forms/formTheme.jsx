/**
 * formTheme.jsx — Shared UI components for all ACCSYS shareable forms
 *
 * Design system: Poppins typography + cream/charcoal palette (MP)
 * Per-form colour themes are in THEMES (used by individual form headers).
 * Shared layout components (FormPage, Section, Field, SubmitBar, etc.) use MP.
 */

// ── Mobile palette ────────────────────────────────────────────────────────────
export const MP = {
  // Backgrounds
  cream:           '#F0EEE3',   // light screen bg
  lightCard:       '#FFFFFF',   // card on light screen
  charcoal:        '#20221F',   // dark screen bg
  darkCard:        '#2D302A',   // card on dark screen

  // Accents
  yellow:          '#F7D263',   // active nav, step indicator, hero tile, focus
  green:           '#C5E6A0',   // submit button (final review)

  // Text
  textDark:        '#23242D',   // body text on light screens
  textMutedLight:  '#71717B',   // secondary text on light
  textOnDark:      '#F7F7F0',   // primary text on dark screens
  textMutedDark:   '#A7AAA0',   // secondary text on dark

  // Shared
  font:            "'Poppins', sans-serif",
}

// ── Theme colours per form type ───────────────────────────────────────────────
// Used by individual form headers — not the global MP palette.
export const THEMES = {
  expense:        { color:'#1565c0', bg:'#e3f2fd', icon:'💸', title:'Expense Claim',      titleAr:'مطالبة مصروف'    },
  overtime:       { color:'#e65100', bg:'#fff3e0', icon:'⏱️', title:'Overtime Request',   titleAr:'طلب عمل إضافي'   },
  food:           { color:'#880e4f', bg:'#fce4ec', icon:'🍽️', title:'Food Allowance',     titleAr:'بدل الطعام'      },
  money:          { color:'#1a237e', bg:'#e8eaf6', icon:'💰', title:'Money Request',      titleAr:'طلب مالي'        },
  po_request:     { color:'#0097a7', bg:'#e0f7fa', icon:'📦', title:'PO Request',         titleAr:'طلب أمر شراء'    },
  field_payment:  { color:'#1b5e20', bg:'#e8f5e9', icon:'💳', title:'Field Payment',      titleAr:'الدفع الميداني'  },
}

// ── Common input styles (light screen) ───────────────────────────────────────
export const inp = {
  width: '100%',
  padding: '10px 13px',
  border: `1.5px solid #D5D2C5`,
  borderRadius: 10,
  fontSize: 14,
  fontFamily: MP.font,
  fontWeight: 400,
  color: MP.textDark,
  boxSizing: 'border-box',
  minHeight: 44,
  background: MP.lightCard,
  outline: 'none',
  transition: 'border-color 0.15s',
}
export const inpRo = { ...inp, background: '#F5F4EF', color: MP.textMutedLight }

// ── Dark-screen input ─────────────────────────────────────────────────────────
export const inpDark = {
  ...inp,
  background: MP.darkCard,
  border: `1.5px solid #3A3D35`,
  color: MP.textOnDark,
}

// ── Page shell — wraps any form screen ───────────────────────────────────────
// variant: 'light' (cream) | 'dark' (charcoal)
export function FormPage({ theme, isAr, langToggle, children, variant = 'light' }) {
  const bg     = variant === 'dark' ? MP.charcoal : MP.cream
  const hdrBg  = variant === 'dark' ? MP.darkCard  : MP.lightCard
  const hdrClr = variant === 'dark' ? MP.textOnDark : MP.textDark
  const subClr = variant === 'dark' ? MP.textMutedDark : MP.textMutedLight
  return (
    <div style={{ minHeight: '100dvh', background: bg, fontFamily: MP.font, direction: isAr ? 'rtl' : 'ltr' }}>
      {/* Header bar */}
      <div style={{ background: hdrBg, padding: '14px 18px', borderBottom: `1px solid ${variant === 'dark' ? '#3A3D35' : '#E4E0D3'}` }}>
        <div style={{ maxWidth: 520, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38,
              background: variant === 'dark' ? 'rgba(247,210,99,0.15)' : theme.bg,
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, flexShrink: 0,
              border: `1.5px solid ${variant === 'dark' ? 'rgba(247,210,99,0.3)' : 'transparent'}`,
            }}>
              {theme.icon}
            </div>
            <div>
              <div style={{ color: hdrClr, fontWeight: 700, fontSize: 15, fontFamily: MP.font }}>{isAr ? theme.titleAr : theme.title}</div>
              <div style={{ color: subClr, fontSize: 11, fontFamily: MP.font }}>Ratal Group</div>
            </div>
          </div>
          {langToggle}
        </div>
      </div>
      {/* Body */}
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '16px 14px 60px' }}>
        {children}
      </div>
    </div>
  )
}

// ── Section group ─────────────────────────────────────────────────────────────
// variant: 'light' | 'dark'
export function Section({ title, children, variant = 'light' }) {
  const bg        = variant === 'dark' ? MP.darkCard  : MP.lightCard
  const hdrBg     = variant === 'dark' ? '#363830'    : '#F5F4EF'
  const hdrColor  = variant === 'dark' ? MP.textMutedDark : MP.textMutedLight
  const border    = variant === 'dark' ? '#3A3D35'    : '#E4E0D3'
  return (
    <div style={{ background: bg, borderRadius: 14, marginBottom: 12, overflow: 'hidden', border: `1px solid ${border}` }}>
      <div style={{ background: hdrBg, color: hdrColor, padding: '9px 16px', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: MP.font }}>
        {title}
      </div>
      {children}
    </div>
  )
}

// ── Field row inside a section ────────────────────────────────────────────────
export function Row({ children, last, variant = 'light' }) {
  const border = variant === 'dark' ? '#3A3D35' : '#EDE9DE'
  return (
    <div style={{ display: 'flex', gap: 10, padding: '12px 16px', borderBottom: last ? 'none' : `1px solid ${border}`, flexWrap: 'wrap' }}>
      {children}
    </div>
  )
}

// ── Individual labelled field ─────────────────────────────────────────────────
export function Field({ label, flex = 1, children, variant = 'light' }) {
  const labelColor = variant === 'dark' ? MP.textMutedDark : MP.textMutedLight
  return (
    <div style={{ flex, minWidth: 120 }}>
      <div style={{ fontSize: 11, color: labelColor, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5, fontFamily: MP.font }}>
        {label}
      </div>
      {children}
    </div>
  )
}

// ── Toggle group ─────────────────────────────────────────────────────────────
export function ToggleRow({ options, value, onChange, theme, variant = 'light' }) {
  const border = variant === 'dark' ? '#3A3D35' : '#EDE9DE'
  return (
    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${border}`, display: 'flex', gap: 8 }}>
      {options.map(o => {
        const active = value === o.value
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            style={{
              flex: 1, padding: '9px', borderRadius: 20, cursor: 'pointer',
              fontFamily: MP.font, fontWeight: 600, fontSize: 13,
              border: `1.5px solid ${active ? MP.yellow : (variant === 'dark' ? '#3A3D35' : '#D5D2C5')}`,
              background: active ? MP.yellow : 'transparent',
              color: active ? MP.textDark : (variant === 'dark' ? MP.textMutedDark : MP.textMutedLight),
              transition: 'all 0.15s',
            }}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Info/total strip ──────────────────────────────────────────────────────────
export function InfoStrip({ theme, children, variant = 'light' }) {
  const bg    = variant === 'dark' ? 'rgba(247,210,99,0.1)' : theme.bg
  const color = variant === 'dark' ? MP.yellow              : theme.color
  return (
    <div style={{ padding: '10px 16px', background: bg, fontSize: 13, fontWeight: 600, color, fontFamily: MP.font }}>
      {children}
    </div>
  )
}

// ── Submit bar ────────────────────────────────────────────────────────────────
// finalStep: if true, uses green button + dark text (review screen)
export function SubmitBar({ theme, label, loading, finalStep = false }) {
  const btnBg    = finalStep ? MP.green  : (loading ? '#BBBAB5' : theme.color)
  const btnColor = finalStep ? MP.textDark : '#fff'
  return (
    <div style={{ background: MP.lightCard, borderRadius: 14, border: `1px solid #E4E0D3`, marginBottom: 12 }}>
      <div style={{ padding: '14px 16px' }}>
        <button type="submit" disabled={loading} style={{
          width: '100%', padding: '13px', fontFamily: MP.font,
          background: btnBg, color: btnColor,
          border: 'none', borderRadius: 20,
          fontSize: 15, fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'opacity 0.15s',
        }}>
          {loading ? 'Submitting…' : label}
        </button>
      </div>
      <p style={{ textAlign: 'center', color: MP.textMutedLight, fontSize: 11, margin: '0 0 10px', fontFamily: MP.font }}>
        Telegram notification sent on submission
      </p>
    </div>
  )
}

// ── Language toggle button ────────────────────────────────────────────────────
export function LangBtn({ isAr, toggle, variant = 'light' }) {
  return (
    <button onClick={toggle} style={{
      background: 'transparent',
      color: variant === 'dark' ? MP.textMutedDark : MP.textMutedLight,
      border: `1.5px solid ${variant === 'dark' ? '#3A3D35' : '#D5D2C5'}`,
      borderRadius: 20, padding: '5px 14px', fontSize: 11, fontWeight: 600,
      cursor: 'pointer', fontFamily: MP.font,
    }}>
      {isAr ? 'English' : 'العربية'}
    </button>
  )
}

// ── Error banner ──────────────────────────────────────────────────────────────
export function ErrorBanner({ msg }) {
  if (!msg) return null
  return (
    <div style={{ background: '#FFF0EE', border: '1.5px solid #F5B8B0', borderRadius: 10, padding: '10px 14px', color: '#C0392B', fontSize: 13, marginBottom: 12, fontFamily: MP.font, fontWeight: 500 }}>
      ⚠️ {msg}
    </div>
  )
}

// ── Success screen ────────────────────────────────────────────────────────────
export function SuccessScreen({ theme, reqNumber, isAr, onAnother }) {
  return (
    <div style={{ background: MP.lightCard, borderRadius: 16, border: `1px solid #E4E0D3`, padding: 32, textAlign: 'center', marginTop: 8 }}>
      <div style={{ fontSize: 52, marginBottom: 12 }}>✅</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: MP.textDark, marginBottom: 6, fontFamily: MP.font }}>
        {isAr ? 'تم الإرسال بنجاح' : 'Submitted successfully!'}
      </div>
      <div style={{ fontSize: 14, color: MP.textMutedLight, marginBottom: 4, fontFamily: MP.font }}>
        {isAr ? 'رقم الطلب' : 'Request #'}: <strong style={{ color: theme.color }}>{reqNumber}</strong>
      </div>
      <div style={{ fontSize: 12, color: '#BBBAB5', marginBottom: 22, fontFamily: MP.font }}>
        {isAr ? 'تم إرسال إشعار تيليجرام' : 'Telegram notification sent.'}
      </div>
      <button onClick={onAnother} style={{
        background: MP.yellow, color: MP.textDark,
        border: 'none', borderRadius: 20,
        padding: '12px 28px', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: MP.font,
      }}>
        {isAr ? 'إرسال طلب آخر' : 'Submit Another'}
      </button>
    </div>
  )
}

// ── Login required screen ─────────────────────────────────────────────────────
export function LoginRequired() {
  return (
    <div style={{ minHeight: '100dvh', background: MP.cream, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MP.font }}>
      <div style={{ background: MP.lightCard, borderRadius: 16, border: `1px solid #E4E0D3`, padding: 40, textAlign: 'center', maxWidth: 340, margin: '20px' }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>🔐</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: MP.textDark, marginBottom: 8 }}>Sign in required</div>
        <div style={{ fontSize: 14, color: MP.textMutedLight, lineHeight: 1.5 }}>
          Open the main ACCSYS app, sign in, then return to this link.
        </div>
      </div>
    </div>
  )
}
