import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { ENTITY_BRANDS } from '../lib/entityConfig'

const LOGO = '/ratal-logo.png'

const inputBase = {
  width: '100%', padding: '11px 14px',
  borderRadius: 9, border: '1.5px solid #E0E4ED',
  background: '#F8FAFC', color: '#1a2e3d',
  fontSize: 14, outline: 'none', boxSizing: 'border-box',
  fontFamily: "'Inter','Segoe UI',sans-serif",
  transition: 'border-color 0.2s',
}

function Ring({ top, right, bottom, left, size, color, opacity = 0.12 }) {
  return (
    <div style={{
      position: 'absolute', top, right, bottom, left,
      width: size, height: size, borderRadius: '50%',
      background: color, opacity, pointerEvents: 'none',
    }} />
  )
}

function BrandLogo({ accent }) {
  return (
    <img src={LOGO} alt="Ratal Group" style={{
      height: 48, width: 'auto',
      filter: `drop-shadow(0 3px 10px ${accent}44)`,
      flexShrink: 0,
    }} />
  )
}

function GWTWings({ color, width }) {
  const c = color || '#2E7D32'
  const w = width || 80
  return (
    <svg viewBox="0 0 120 55" width={w} height={w * 0.46} xmlns="http://www.w3.org/2000/svg">
      <path d="M58 27 C48 18, 30 14, 8 20 C22 18, 40 21, 58 27Z" fill={c}/>
      <path d="M58 31 C46 22, 26 17, 4 25 C20 22, 40 25, 58 31Z" fill={c} opacity="0.75"/>
      <path d="M58 35 C48 27, 28 22, 6 30 C22 27, 42 29, 58 35Z" fill={c} opacity="0.5"/>
      <path d="M62 27 C72 18, 90 14, 112 20 C98 18, 80 21, 62 27Z" fill={c}/>
      <path d="M62 31 C74 22, 94 17, 116 25 C100 22, 80 25, 62 31Z" fill={c} opacity="0.75"/>
      <path d="M62 35 C72 27, 92 22, 114 30 C98 27, 78 29, 62 35Z" fill={c} opacity="0.5"/>
      <ellipse cx="60" cy="29" rx="5" ry="8" fill={c}/>
    </svg>
  )
}

// ═══════════════════════════════════════════════════════
// RAT LOGIN  (Navy / Gold theme)
// ═══════════════════════════════════════════════════════
function RATLogin({ onBack, isAr, setLang, lang }) {
  const [email,   setEmail]   = useState('')
  const [password,setPassword]= useState('')
  const [showPw,  setShowPw]  = useState(false)
  const [dept,    setDept]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const NAVY = '#0C1F3F'
  const GOLD = '#C9A84C'

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) setError(err.message)
    setLoading(false)
  }

  const fieldWrap = {
    display: 'flex', alignItems: 'center',
    border: '1.5px solid #D8E0EC', borderRadius: 10,
    background: '#fff', marginBottom: 14, overflow: 'hidden',
  }
  const iconBox = {
    width: 44, display: 'flex', alignItems: 'center',
    justifyContent: 'center', flexShrink: 0,
  }
  const fieldIn = {
    flex: 1, border: 'none', outline: 'none',
    padding: '12px 10px 12px 0', fontSize: 14,
    color: '#1a2e3d', background: 'transparent',
    fontFamily: "'Inter','Segoe UI',sans-serif",
  }

  function highlight(e) { e.currentTarget.style.borderColor = GOLD }
  function unhighlight(e) { e.currentTarget.style.borderColor = '#D8E0EC' }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter','Segoe UI',sans-serif",
      background: '#F5F7FA',
      direction: isAr ? 'rtl' : 'ltr',
    }}>
      {/* ── HERO ── */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(160deg,#071428 0%,#0C1F3F 50%,#1a3a6e 100%)',
        minHeight: '46vh',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'flex-end', padding: '20px 32px 70px',
      }}>
        <button onClick={onBack} style={{
          position: 'absolute', top: 14, left: isAr ? 'auto' : 16, right: isAr ? 16 : 'auto',
          background: 'rgba(0,0,0,0.35)', color: 'rgba(255,255,255,0.85)',
          border: 'none', borderRadius: 20, padding: '5px 14px',
          fontSize: 11, cursor: 'pointer', zIndex: 5,
        }}>← {isAr ? 'رجوع' : 'Back'}</button>

        <button onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')} style={{
          position: 'absolute', top: 14, right: isAr ? 'auto' : 16, left: isAr ? 16 : 'auto',
          background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.8)',
          border: 'none', borderRadius: 7, padding: '5px 12px',
          fontSize: 11, fontWeight: 700, cursor: 'pointer', zIndex: 5,
        }}>{lang === 'en' ? 'العربية' : 'English'}</button>

        {/* Full-cover plane photo */}
        <img src="/rat-plane.jpg" alt=""
          onError={e => { e.target.style.display = 'none' }}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center', zIndex: 1,
          }}
        />
        {/* Dark overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom,rgba(7,20,40,0.3) 0%,rgba(7,20,40,0.72) 100%)',
          zIndex: 2,
        }}/>
        {/* Gold ring decoration */}
        <div style={{
          position: 'absolute', top: -60, right: -60, width: 220, height: 220,
          borderRadius: '50%', border: '1px solid rgba(201,168,76,0.18)', zIndex: 3,
        }}/>

        {/* Centered bold italic description */}
        <div style={{ position: 'relative', zIndex: 4, textAlign: 'center' }}>
          <div style={{
            color: '#fff', fontSize: 18, fontWeight: 700, fontStyle: 'italic',
            lineHeight: 1.7, textShadow: '0 2px 14px rgba(0,0,0,0.6)',
            maxWidth: 460, margin: '0 auto',
          }}>
            {isAr
              ? 'تجارب سفر سلسة بالرعاية والشغف والإتقان'
              : 'Delivering seamless travel experiences with care & passion'}
          </div>
        </div>

        {/* White curved bottom */}
        <div style={{
          position: 'absolute', bottom: -2, left: '-8%', right: '-8%',
          height: 80, background: '#F5F7FA',
          borderRadius: '50% 50% 0 0', zIndex: 5,
        }}/>
      </div>

      {/* ── FORM ── */}
      <div style={{
        flex: 1, background: '#F5F7FA',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '0 24px 28px',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ textAlign: 'center', marginBottom: 6 }}>
            <div style={{
              fontFamily: 'Georgia,serif', fontStyle: 'italic',
              color: GOLD, fontSize: 26, fontWeight: 400,
            }}>
              {isAr ? 'مرحباً بعودتك!' : 'Welcome Back!'}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginTop: 4 }}>
              {isAr ? 'يرجى تسجيل الدخول' : 'Please Sign In to Your Account'}
            </div>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: GOLD, margin: '8px auto 18px',
            }}/>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 9, padding: '10px 14px', color: '#c62828',
              fontSize: 12, marginBottom: 14,
            }}>⚠ {error}</div>
          )}

          <form onSubmit={handleLogin}>
            <div style={fieldWrap} onFocus={highlight} onBlur={unhighlight}>
              <div style={iconBox}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="8" r="4" stroke={GOLD} strokeWidth="2"/>
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={GOLD} strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder={isAr ? 'البريد الإلكتروني' : 'User Name'} style={fieldIn}/>
            </div>

            <div style={fieldWrap} onFocus={highlight} onBlur={unhighlight}>
              <div style={iconBox}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="5" y="11" width="14" height="10" rx="2" stroke={GOLD} strokeWidth="2"/>
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke={GOLD} strokeWidth="2"/>
                </svg>
              </div>
              <input type={showPw ? 'text' : 'password'} required value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={isAr ? 'كلمة المرور' : 'Password'} style={fieldIn}/>
              <button type="button" onClick={() => setShowPw(v => !v)}
                style={{ background:'none', border:'none', cursor:'pointer',
                         color:'#aab2bd', fontSize:15, padding:'0 12px', flexShrink:0 }}>
                {showPw ? '🙈' : '👁'}
              </button>
            </div>

            <div style={fieldWrap} onFocus={highlight} onBlur={unhighlight}>
              <div style={iconBox}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke={GOLD} strokeWidth="2"/>
                  <path d="M9 21V9h6v12" stroke={GOLD} strokeWidth="2"/>
                  <rect x="9" y="3" width="6" height="6" stroke={GOLD} strokeWidth="1.5"/>
                </svg>
              </div>
              <select value={dept} onChange={e => setDept(e.target.value)}
                style={{ ...fieldIn, appearance: 'none', cursor: 'pointer' }}>
                <option value="">{isAr ? 'القسم' : 'Department'}</option>
                <option value="ticketing">{isAr ? 'التذاكر' : 'Ticketing'}</option>
                <option value="operations">{isAr ? 'العمليات' : 'Operations'}</option>
                <option value="finance">{isAr ? 'المالية' : 'Finance'}</option>
                <option value="admin">{isAr ? 'الإدارة' : 'Administration'}</option>
              </select>
              <svg width="14" height="14" viewBox="0 0 24 24" style={{ flexShrink:0, marginRight:10 }}>
                <path d="M6 9l6 6 6-6" stroke="#aab2bd" strokeWidth="2" fill="none"/>
              </svg>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <button type="submit" disabled={loading} style={{
                flex: 1, padding: '13px', borderRadius: 10, border: 'none',
                background: loading ? '#6b7c9a' : NAVY,
                color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"
                        stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                {loading ? (isAr ? 'جاري الدخول...' : 'Signing in…') : (isAr ? 'دخول' : 'LOGIN')}
              </button>
              <button type="button" onClick={onBack} style={{
                flex: '0 0 110px', padding: '13px', borderRadius: 10,
                border: '1.5px solid ' + GOLD, background: '#fff', color: NAVY,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke={GOLD} strokeWidth="2.5"/>
                </svg>
                {isAr ? 'إلغاء' : 'CANCEL'}
              </button>
            </div>
          </form>

          <div style={{
            display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 0,
            marginTop: 20, paddingTop: 16, borderTop: '1px solid #DDE4F0',
          }}>
            {[
              { icon: '🛡', label: isAr ? 'وصول آمن' : 'Secure Access' },
              { icon: '🤝', label: isAr ? 'خدمة موثوقة' : 'Trusted Service' },
              { icon: '🌐', label: isAr ? 'انتشار عالمي' : 'Global Reach' },
              { icon: '🎧', label: isAr ? 'دعم 24/7' : '24/7 Support' },
            ].map(({ icon, label }, i) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <div style={{ height: 14, width: 1, background: '#C8D4E8', margin: '0 10px' }}/>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#8a9ab5' }}>
                  <span style={{ fontSize: 12 }}>{icon}</span>{label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// GWT LOGIN  (Green theme)
// ═══════════════════════════════════════════════════════
function GWTLogin({ onBack, isAr, setLang, lang }) {
  const [email,   setEmail]   = useState('')
  const [password,setPassword]= useState('')
  const [showPw,  setShowPw]  = useState(false)
  const [dept,    setDept]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const GREEN      = '#2E7D32'
  const GREEN_DARK = '#1B5E20'
  const GREEN_MID  = '#388E3C'

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) setError(err.message)
    setLoading(false)
  }

  const fieldStyle = {
    display: 'flex', alignItems: 'center',
    border: '1.5px solid #D8E4D8', borderRadius: 10,
    background: '#fff', padding: '0 14px', marginBottom: 14, gap: 10,
  }
  const fieldInput = {
    flex: 1, border: 'none', outline: 'none',
    padding: '12px 0', fontSize: 14,
    color: '#2a3a2a', background: 'transparent',
    fontFamily: "'Inter','Segoe UI',sans-serif",
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter','Segoe UI',sans-serif",
      background: '#F2F7F2',
      direction: isAr ? 'rtl' : 'ltr',
    }}>
      {/* ── HERO ── */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(150deg,#1B5E20 0%,#388E3C 55%,#66BB6A 100%)',
        minHeight: '44vh',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'flex-end', padding: '20px 28px 64px',
      }}>
        <button onClick={onBack} style={{
          position: 'absolute', top: 14, left: isAr ? 'auto' : 16, right: isAr ? 16 : 'auto',
          background: 'rgba(0,0,0,0.28)', color: 'rgba(255,255,255,0.85)',
          border: 'none', borderRadius: 20, padding: '5px 14px',
          fontSize: 11, cursor: 'pointer', zIndex: 4,
        }}>← {isAr ? 'رجوع' : 'Back'}</button>

        <button onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')} style={{
          position: 'absolute', top: 14, right: isAr ? 'auto' : 16, left: isAr ? 16 : 'auto',
          background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)',
          border: 'none', borderRadius: 7, padding: '5px 12px',
          fontSize: 11, fontWeight: 700, cursor: 'pointer', zIndex: 4,
        }}>{lang === 'en' ? 'العربية' : 'English'}</button>

        {/* Full-cover plane photo */}
        <img src="/gwt-plane.jpg" alt=""
          onError={e => { e.target.style.display = 'none' }}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center', zIndex: 2,
          }}
        />
        {/* Dark overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom,rgba(10,60,30,0.25) 0%,rgba(10,60,30,0.65) 100%)',
          zIndex: 3,
        }}/>

        {/* Centered bold italic description — 2 lines */}
        <div style={{ position: 'relative', zIndex: 4, textAlign: 'center' }}>
          <div style={{
            color: '#fff', fontSize: 18, fontWeight: 700, fontStyle: 'italic',
            lineHeight: 1.7, textShadow: '0 2px 12px rgba(0,0,0,0.5)',
            maxWidth: 480, margin: '0 auto',
          }}>
            {isAr
              ? 'شريكك الموثوق في السفر الدولي. نربطك بالعالم بالراحة والرعاية.'
              : 'Green Wings Travels is your trusted partner in global travel. We connect you to the world with comfort & care'}
          </div>
        </div>

        {/* White curved bottom */}
        <div style={{
          position: 'absolute', bottom: -2, left: '-8%', right: '-8%',
          height: 80, background: '#F2F7F2',
          borderRadius: '50% 50% 0 0', zIndex: 5,
        }}/>
      </div>

      {/* ── FORM ── */}
      <div style={{
        flex: 1, background: '#F2F7F2',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', padding: '0 24px 28px',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 10,
          }}>
            <GWTWings color={GREEN} width={72} />
            <div style={{
              fontSize: 20, fontWeight: 900, color: GREEN_DARK,
              letterSpacing: 4, marginTop: 6,
            }}>GREEN WINGS</div>
            <div style={{
              fontSize: 11, letterSpacing: 5, color: GREEN_MID, fontWeight: 600, marginTop: 1,
            }}>TRAVELS</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: '#C8DCC8' }}/>
            <div style={{ fontSize: 11, color: '#7A9A7A', whiteSpace: 'nowrap' }}>
              {isAr ? 'يرجى تسجيل الدخول للمتابعة' : 'Please Sign In to Continue'}
            </div>
            <div style={{ flex: 1, height: 1, background: '#C8DCC8' }}/>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 9, padding: '10px 14px', color: '#c62828',
              fontSize: 12, marginBottom: 14,
            }}>⚠ {error}</div>
          )}

          <form onSubmit={handleLogin}>
            <div style={fieldStyle}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="4" stroke="#9DB09D" strokeWidth="2"/>
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#9DB09D" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder={isAr ? 'البريد الإلكتروني' : 'User Name'} style={fieldInput}
                onFocus={e => e.target.parentElement.style.borderColor = GREEN}
                onBlur={e  => e.target.parentElement.style.borderColor = '#D8E4D8'}/>
            </div>

            <div style={fieldStyle}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <rect x="5" y="11" width="14" height="10" rx="2" stroke="#9DB09D" strokeWidth="2"/>
                <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="#9DB09D" strokeWidth="2"/>
              </svg>
              <input type={showPw ? 'text' : 'password'} required value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={isAr ? 'كلمة المرور' : 'Password'} style={fieldInput}
                onFocus={e => e.target.parentElement.style.borderColor = GREEN}
                onBlur={e  => e.target.parentElement.style.borderColor = '#D8E4D8'}/>
              <button type="button" onClick={() => setShowPw(v => !v)}
                style={{ background:'none', border:'none', cursor:'pointer',
                         color:'#9DB09D', fontSize:15, padding:0, flexShrink:0 }}>
                {showPw ? '🙈' : '👁'}
              </button>
            </div>

            <div style={fieldStyle}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="#9DB09D" strokeWidth="2"/>
                <path d="M9 21V9h6v12" stroke="#9DB09D" strokeWidth="2"/>
                <rect x="9" y="3" width="6" height="6" stroke="#9DB09D" strokeWidth="1.5"/>
              </svg>
              <select value={dept} onChange={e => setDept(e.target.value)}
                style={{ ...fieldInput, appearance: 'none', cursor: 'pointer' }}
                onFocus={e => e.target.parentElement.style.borderColor = GREEN}
                onBlur={e  => e.target.parentElement.style.borderColor = '#D8E4D8'}>
                <option value="">{isAr ? 'القسم' : 'Department'}</option>
                <option value="ticketing">{isAr ? 'التذاكر' : 'Ticketing'}</option>
                <option value="operations">{isAr ? 'العمليات' : 'Operations'}</option>
                <option value="finance">{isAr ? 'المالية' : 'Finance'}</option>
                <option value="admin">{isAr ? 'الإدارة' : 'Administration'}</option>
              </select>
              <svg width="14" height="14" viewBox="0 0 24 24" style={{ flexShrink:0 }}>
                <path d="M6 9l6 6 6-6" stroke="#9DB09D" strokeWidth="2" fill="none"/>
              </svg>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
              <button type="submit" disabled={loading} style={{
                flex: 1, padding: '13px', borderRadius: 10, border: 'none',
                background: loading ? '#A5C6A5' : GREEN,
                color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"
                        stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                {loading ? (isAr ? 'جاري الدخول...' : 'Signing in…') : (isAr ? 'دخول' : 'LOGIN')}
              </button>
              <button type="button" onClick={onBack} style={{
                flex: '0 0 110px', padding: '13px', borderRadius: 10,
                border: '1.5px solid ' + GREEN, background: '#fff', color: GREEN,
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke={GREEN} strokeWidth="2.5"/>
                </svg>
                {isAr ? 'إلغاء' : 'CANCEL'}
              </button>
            </div>
          </form>

          <div style={{
            display: 'flex', justifyContent: 'center', gap: 0, flexWrap: 'wrap',
            marginTop: 20, paddingTop: 16, borderTop: '1px solid #D0E8D0',
          }}>
            {[
              { icon: '🛡', label: isAr ? 'وصول آمن' : 'Secure Access' },
              { icon: '👥', label: isAr ? 'حلول موثوقة' : 'Trusted Solutions' },
              { icon: '🌐', label: isAr ? 'شبكة عالمية' : 'Global Network' },
              { icon: '⭐', label: isAr ? 'خدمة متميزة' : 'Quality Service' },
            ].map(({ icon, label }, i) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
                {i > 0 && <div style={{ height: 14, width: 1, background: '#C8DCC8', margin: '0 10px' }}/>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#7A9A7A' }}>
                  <span style={{ fontSize: 12 }}>{icon}</span>{label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// ACCSYS / fallback entity login
// ═══════════════════════════════════════════════════════
function EntityLogin({ brand, onBack, isAr, setLang, lang }) {
  const [email,   setEmail]   = useState('')
  const [password,setPassword]= useState('')
  const [showPw,  setShowPw]  = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) setError(err.message)
    setLoading(false)
  }

  const inp = { ...inputBase, color: '#1a2e3d', background: '#F8FAFC', border: '1.5px solid #E0E4ED' }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      fontFamily: "'Inter','Segoe UI',sans-serif",
      direction: isAr ? 'rtl' : 'ltr',
    }}>
      <div style={{
        background: brand.primary, flex: '0 0 46%',
        position: 'relative', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'flex-end', padding: '24px 36px 28px',
      }}>
        <button onClick={onBack} style={{
          position: 'absolute', top: 14, ...(isAr ? { right: 16 } : { left: 16 }),
          background: 'rgba(0,0,0,0.35)', color: 'rgba(255,255,255,0.8)',
          border: 'none', borderRadius: 20, padding: '5px 14px', fontSize: 11,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, zIndex: 2,
        }}>← {isAr ? 'رجوع' : 'Back'}</button>
        <button onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')} style={{
          position: 'absolute', top: 14, ...(isAr ? { left: 16 } : { right: 16 }),
          background: 'rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.75)',
          border: 'none', borderRadius: 7, padding: '5px 12px',
          fontSize: 11, fontWeight: 700, cursor: 'pointer', zIndex: 2,
        }}>{lang === 'en' ? 'العربية' : 'English'}</button>
        <Ring top="-50px" right="-50px" size="200px" color={brand.accent} opacity={0.10} />
        <Ring top="28px" right="60px" size="80px" color={brand.accent} opacity={0.07} />
        <Ring bottom="-22px" left="-22px" size="130px" color={brand.accent} opacity={0.07} />
        <div style={{
          position: 'absolute', right: isAr ? 'auto' : 24, left: isAr ? 24 : 'auto',
          bottom: 10, fontSize: 100, fontWeight: 900, lineHeight: 1,
          color: brand.accent, opacity: 0.10, letterSpacing: -3, userSelect: 'none',
        }}>{brand.code}</div>
        <div style={{ marginBottom: 18, position: 'relative' }}>
          <BrandLogo accent={brand.accent} />
        </div>
        <div style={{ position: 'relative' }}>
          <div style={{ color: brand.accentLight, fontStyle: 'italic', fontSize: 15, marginBottom: 3 }}>
            {brand.tagline1}
          </div>
          <div style={{ color: '#fff', fontSize: 22, fontWeight: 900, lineHeight: 1.2, marginBottom: 10 }}>
            {brand.tagline2}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.52)', fontSize: 11, maxWidth: 340, lineHeight: 1.7 }}>
            {brand.desc}
          </div>
        </div>
      </div>

      <div style={{
        flex: 1, background: '#fff',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '24px 36px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontStyle: 'italic', color: brand.accent, marginBottom: 2 }}>
            {isAr ? 'مرحباً بعودتك' : brand.loginCaption}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a2e3d' }}>
            {isAr ? 'يرجى تسجيل الدخول للمتابعة' : brand.loginSub}
          </div>
        </div>
        {error && (
          <div style={{
            width: '100%', maxWidth: 340,
            background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 9, padding: '10px 14px', color: '#c62828',
            fontSize: 12, marginBottom: 14,
          }}>⚠ {error}</div>
          )}
          <form onSubmit={handleLogin} style={{ width: '100%', maxWidth: 340 }}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7c93', marginBottom: 6 }}>
              {isAr ? 'البريد الإلكتروني' : 'Email'}
            </label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="user@ratalgroup.com" style={inp}
              onFocus={e => e.target.style.borderColor = brand.accent}
              onBlur={e  => e.target.style.borderColor = '#E0E4ED'}/>
          </div>
          <div style={{ marginBottom: 20, position: 'relative' }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#6b7c93', marginBottom: 6 }}>
              {isAr ? 'كلمة المرور' : 'Password'}
            </label>
            <input type={showPw ? 'text' : 'password'} required value={password}
              onChange={e => setPassword(e.target.value)} placeholder="••••••••"
              style={{ ...inp, paddingRight: 44 }}
              onFocus={e => e.target.style.borderColor = brand.accent}
              onBlur={e  => e.target.style.borderColor = '#E0E4ED'}/>
            <button type="button" onClick={() => setShowPw(v => !v)} style={{
              position: 'absolute', right: 12, top: 33, background: 'none', border: 'none',
              cursor: 'pointer', color: '#aab2bd', fontSize: 15, padding: 0,
            }}>{showPw ? '🙈' : '👁'}</button>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" disabled={loading} style={{
              flex: 1, padding: '12px', borderRadius: 9, border: 'none',
              background: loading ? '#c8d0dc' : brand.primary,
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}>
              {loading ? (isAr ? 'جاري الدخول...' : 'Signing in…') : (isAr ? 'دخول' : '⇒  LOGIN')}
            </button>
            <button type="button" onClick={onBack} style={{
              flex: '0 0 90px', padding: '12px', borderRadius: 9,
              border: '1.5px solid #E0E4ED', background: '#fff',
              color: '#94a3b8', fontSize: 13, cursor: 'pointer',
            }}>{isAr ? 'إلغاء' : '✕ Cancel'}</button>
          </div>
        </form>
        <div style={{
          display: 'flex', gap: 20, marginTop: 20, paddingTop: 16,
          borderTop: '1px solid #F0F4F8', width: '100%', maxWidth: 340, justifyContent: 'center',
        }}>
          {['🔒 Secure', '🛡 Trusted', '🌐 Global', '⏰ 24/7'].map(t => (
            <div key={t} style={{ fontSize: 9, color: '#c5cdd9', textAlign: 'center' }}>{t}</div>
          ))}
        </div>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════
// RATAL ADVANCED TECHNOLOGIES — Tech/Green themed login
// ═══════════════════════════════════════════════════════
function ACCSYSLogin({ onBack, isAr, setLang, lang }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [department, setDepartment] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) setError(err.message)
    setLoading(false)
  }

  const GREEN = '#2E7D32'
  const DARK  = '#1a2e3d'

  const fld = {
    width: '100%', padding: '11px 14px 11px 40px',
    borderRadius: 9, border: '1.5px solid #E0E4ED',
    background: '#F8FAFC', color: DARK,
    fontSize: 14, outline: 'none', boxSizing: 'border-box',
    fontFamily: "'Inter','Segoe UI',sans-serif",
    transition: 'border-color 0.2s',
  }

  const SERVICES = [
    { emoji: '🖥', label: 'RACKING &\nSTACKING',       sub: 'Precision. Performance.\nPerfection.' },
    { emoji: '🔗', label: 'NETWORK\nSOLUTIONS',        sub: 'Seamless Connectivity.\nLimitless Possibilities.' },
    { emoji: '🏢', label: 'DATA\nCENTERS',             sub: 'Reliable Infrastructure.\nFuture Ready.' },
    { emoji: '⚙',  label: 'SYSTEM\nINTEGRATION',      sub: 'Integrated Today.\nInnovating Tomorrow.' },
  ]

  return (
    <div style={{
      minHeight: '100vh', background: '#f0f4f0',
      fontFamily: "'Inter','Segoe UI',sans-serif",
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    }}>

      {/* ── Hero Photo (photo only — no text) ── */}
      <div style={{ width: '100%', position: 'relative', height: '50vh', minHeight: 280, overflow: 'hidden' }}>
        <img
          src="/accsys-tech.jpg" alt=""
          onError={e => { e.target.style.display = 'none' }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
        />
        {/* Subtle bottom fade into service strip */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.18))', zIndex: 1 }} />

        {/* Back button */}
        <button onClick={onBack} style={{
          position: 'absolute', top: 14, left: 14, zIndex: 3,
          background: 'rgba(0,0,0,0.38)', color: '#fff',
          border: 'none', borderRadius: 20, padding: '5px 14px',
          fontSize: 11, cursor: 'pointer',
        }}>← Back</button>

        {/* Lang toggle */}
        <button onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')} style={{
          position: 'absolute', top: 14, right: 14, zIndex: 3,
          background: 'rgba(255,255,255,0.18)', color: '#fff',
          border: 'none', borderRadius: 7, padding: '5px 12px',
          fontSize: 11, fontWeight: 700, cursor: 'pointer',
        }}>{lang === 'en' ? 'العربية' : 'English'}</button>
      </div>

      {/* ── Service Strip ── */}
      <div style={{
        width: '100%', background: '#fff',
        display: 'flex', justifyContent: 'space-around',
        padding: '10px 6px',
        borderBottom: '2px solid #e8f5e9',
        boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
      }}>
        {SERVICES.map(s => (
          <div key={s.label} style={{ textAlign: 'center', flex: 1, padding: '0 2px' }}>
            <div style={{ fontSize: 16, marginBottom: 3 }}>{s.emoji}</div>
            <div style={{
              fontSize: 6.5, fontWeight: 800, color: DARK,
              letterSpacing: 0.4, lineHeight: 1.4, whiteSpace: 'pre-line',
            }}>{s.label}</div>
            <div style={{
              fontSize: 6, color: '#7a8fa0',
              lineHeight: 1.4, marginTop: 2, whiteSpace: 'pre-line',
            }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Form Section ── */}
      <div style={{
        width: '100%', background: '#fff',
        borderRadius: '40px 40px 0 0',
        padding: '22px 32px 20px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.05)',
        marginTop: -16,
      }}>

        {/* Welcome Back */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
          <div style={{ height: 1, width: 36, background: GREEN, opacity: 0.4 }} />
          <span style={{
            fontFamily: 'Georgia,serif', fontStyle: 'italic',
            fontSize: 20, color: GREEN, fontWeight: 400, whiteSpace: 'nowrap',
          }}>Welcome Back!</span>
          <div style={{ height: 1, width: 36, background: GREEN, opacity: 0.4 }} />
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: DARK, marginBottom: 4 }}>
          Please Sign In to Continue
        </div>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN, marginBottom: 14 }} />

        {error && (
          <div style={{
            width: '100%', maxWidth: 340,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: 9, padding: '10px 14px', color: '#c62828',
            fontSize: 12, marginBottom: 14,
          }}>⚠ {error}</div>
        )}

        <form onSubmit={handleLogin} style={{ width: '100%', maxWidth: 340 }}>

          {/* User Name */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            <input
              type="email" required value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="User Name"
              style={fld}
              onFocus={e => e.target.style.borderColor = GREEN}
              onBlur={e  => e.target.style.borderColor = '#E0E4ED'}
            />
          </div>

          {/* Password */}
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <input
              type={showPw ? 'text' : 'password'} required value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              style={{ ...fld, paddingRight: 38 }}
              onFocus={e => e.target.style.borderColor = GREEN}
              onBlur={e  => e.target.style.borderColor = '#E0E4ED'}
            />
            <button type="button" onClick={() => setShowPw(v => !v)} style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14, padding: 0,
            }}>{showPw ? '🙈' : '👁'}</button>
          </div>

          {/* Department */}
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <svg style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', zIndex: 1 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21h18M3 7l9-4 9 4M4 7v14M20 7v14M9 21v-6h6v6"/></svg>
            <select value={department} onChange={e => setDepartment(e.target.value)}
              style={{ ...fld, paddingLeft: 40, appearance: 'none', cursor: 'pointer', color: department ? DARK : '#94a3b8' }}
              onFocus={e => e.target.style.borderColor = GREEN}
              onBlur={e  => e.target.style.borderColor = '#E0E4ED'}
            >
              <option value="">Department</option>
              <option value="IT">Information Technology</option>
              <option value="FIN">Finance</option>
              <option value="HR">Human Resources</option>
              <option value="OPS">Operations</option>
              <option value="TECH">Technical Integration</option>
              <option value="MGMT">Management</option>
            </select>
            <svg style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" disabled={loading} style={{
              flex: 1, padding: '12px', borderRadius: 9, border: 'none',
              background: loading ? '#9e9e9e' : GREEN,
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              {loading ? 'Signing in…' : 'LOGIN'}
            </button>
            <button type="button" onClick={onBack} style={{
              flex: '0 0 110px', padding: '12px', borderRadius: 9,
              border: '1.5px solid #E0E4ED', background: '#fff',
              color: '#94a3b8', fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              CANCEL
            </button>
          </div>
        </form>

        {/* Trust badges */}
        <div style={{
          display: 'flex', gap: 0, marginTop: 16, paddingTop: 12,
          borderTop: '1px solid #f0f4f0', width: '100%', maxWidth: 340,
          justifyContent: 'space-around', flexWrap: 'nowrap',
        }}>
          {[
            { icon: '🛡', label: 'Secure Access' },
            { icon: '👥', label: 'Trusted Solutions' },
            { icon: '🌐', label: 'Global Reach' },
            { icon: '🎧', label: '24/7 Support' },
          ].map(b => (
            <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: '#94a3b8' }}>
              <span style={{ fontSize: 12 }}>{b.icon}</span>{b.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function GenericLogin({ isAr, setLang, lang }) {
  const [email,   setEmail]   = useState('')
  const [password,setPassword]= useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) setError(err.message)
    setLoading(false)
  }

  const inp = { ...inputBase, background: '#1e293b', color: '#f1f5f9', border: '2px solid #334155' }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg,#0f172a 0%,#1e3a5f 50%,#0f172a 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: "'Inter','Segoe UI',sans-serif",
      direction: isAr ? 'rtl' : 'ltr',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src={LOGO} alt="Ratal Group" style={{
            width: 180, maxWidth: '70%',
            filter: 'drop-shadow(0 6px 20px rgba(201,168,76,0.4))', marginBottom: 10,
          }}/>
          <p style={{ color: '#94a3b8', margin: 0, fontSize: 13 }}>
            {isAr ? 'نظام المحاسبة' : 'Accounting System'}
          </p>
        </div>
        <div style={{
          background: '#1e293b', borderRadius: 20, padding: '28px 24px 24px',
          border: '1px solid #334155', boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ color: '#f1f5f9', margin: 0, fontSize: 18, fontWeight: 700 }}>
              {isAr ? 'تسجيل الدخول' : 'Sign In'}
            </h2>
            <button onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')} style={{
              background: '#334155', border: 'none', color: '#cbd5e1',
              borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 700,
            }}>{lang === 'en' ? 'العربية' : 'English'}</button>
          </div>
          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444',
              borderRadius: 9, padding: '10px 14px', color: '#fca5a5',
              fontSize: 12, marginBottom: 14,
            }}>error</div>
          )}
          <form onSubmit={handleLogin}>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>
              {isAr ? 'البريد الإلكتروني' : 'Email'}
            </label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              style={{ ...inp, marginBottom: 14 }} placeholder="user@ratalgroup.com"
              onFocus={e => e.target.style.borderColor = '#C9A84C'}
              onBlur={e  => e.target.style.borderColor = '#334155'}/>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: 12, marginBottom: 6, fontWeight: 600 }}>
              {isAr ? 'كلمة المرور' : 'Password'}
            </label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              style={{ ...inp, marginBottom: 22 }} placeholder="••••••••"
              onFocus={e => e.target.style.borderColor = '#C9A84C'}
              onBlur={e  => e.target.style.borderColor = '#334155'}/>
            <button type="submit" disabled={loading} style={{
              width: '100%', padding: 13, borderRadius: 10,
              border: '1px solid #C9A84C',
              background: loading ? '#334155' : '#0C1F3F',
              color: '#C9A84C', fontSize: 15, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}>
              {loading ? (isAr ? 'جاري الدخول...' : 'Signing in') : (isAr ? 'دخول' : 'Sign In')}
            </button>
          </form>
        </div>
        <p style={{ textAlign: 'center', color: '#475569', fontSize: 11, marginTop: 14 }}>
          2025 Ratal Group Saudi Arabia v1.0
        </p>
      </div>
    </div>
  )
}

export default function Login({ entityCode = null, onBack = null }) {
  const [lang, setLang] = useState('en')
  const isAr = lang === 'ar'
  const brand = entityCode ? ENTITY_BRANDS[entityCode] : null

  if (entityCode === 'RAT') {
    return <RATLogin onBack={onBack || (() => {})} isAr={isAr} lang={lang} setLang={setLang} />
  }
  if (entityCode === 'GWT') {
    return <GWTLogin onBack={onBack || (() => {})} isAr={isAr} lang={lang} setLang={setLang} />
  }
  if (entityCode === 'ACCSYS') {
    return <ACCSYSLogin onBack={onBack || (() => {})} isAr={isAr} lang={lang} setLang={setLang} />
  }
  if (brand) {
    return <EntityLogin brand={brand} onBack={onBack || (() => {})} isAr={isAr} lang={lang} setLang={setLang} />
  }
  return <GenericLogin isAr={isAr} lang={lang} setLang={setLang} />
}
