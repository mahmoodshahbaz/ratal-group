import { useState } from 'react'
import { ENTITY_LIST } from '../lib/entityConfig'

const LOGO    = '/ratal-logo.png'
const SKYLINE = '/riyadh-skyline.jpg'

// ── Riyadh skyline SVG silhouette (right panel decoration) ──────────
function SkylineSVG() {
  const c = 'rgba(201,168,76,0.28)'
  return (
    <svg viewBox="0 0 900 80" xmlns="http://www.w3.org/2000/svg"
         style={{ width:'100%', display:'block' }}>
      <g fill={c}>
        <rect x="0"   y="55" width="18" height="25"/><rect x="22" y="45" width="14" height="35"/>
        <rect x="40"  y="52" width="18" height="28"/><rect x="62" y="40" width="16" height="40"/>
        <rect x="82"  y="58" width="12" height="22"/><rect x="98" y="48" width="20" height="32"/>
        <rect x="124" y="25" width="20" height="55"/><polygon points="124,25 144,25 134,5"/>
        <rect x="150" y="52" width="14" height="28"/><rect x="168" y="42" width="18" height="38"/>
        <rect x="196" y="8"  width="26" height="72"/>
        <path d="M196,8 Q209,-5 222,8"/>
        <rect x="228" y="38" width="14" height="42"/><rect x="246" y="48" width="20" height="32"/>
        <rect x="272" y="34" width="18" height="46"/><rect x="294" y="50" width="14" height="30"/>
        <rect x="312" y="42" width="22" height="38"/><rect x="338" y="55" width="16" height="25"/>
        <rect x="358" y="45" width="20" height="35"/><rect x="382" y="58" width="14" height="22"/>
        <rect x="400" y="38" width="18" height="42"/><rect x="422" y="50" width="16" height="30"/>
        <rect x="442" y="42" width="22" height="38"/><rect x="468" y="54" width="14" height="26"/>
        <rect x="486" y="34" width="18" height="46"/><rect x="508" y="48" width="16" height="32"/>
        <rect x="528" y="40" width="20" height="40"/><rect x="552" y="55" width="14" height="25"/>
        <rect x="570" y="46" width="18" height="34"/><rect x="592" y="60" width="16" height="20"/>
        <rect x="612" y="40" width="22" height="40"/><rect x="638" y="52" width="16" height="28"/>
        <rect x="658" y="45" width="18" height="35"/><rect x="680" y="58" width="14" height="22"/>
        <rect x="700" y="48" width="20" height="32"/><rect x="724" y="62" width="16" height="18"/>
        <rect x="744" y="52" width="18" height="28"/><rect x="766" y="65" width="20" height="15"/>
        <rect x="790" y="56" width="16" height="24"/><rect x="810" y="62" width="18" height="18"/>
        <rect x="832" y="58" width="14" height="22"/><rect x="850" y="66" width="20" height="14"/>
        <rect x="874" y="60" width="16" height="20"/><rect x="892" y="68" width="8"  height="12"/>
      </g>
    </svg>
  )
}

// ── Entity icon (per entity) ─────────────────────────────────────────
function EntityIcon({ code }) {
  if (code === 'RAT') {
    return (
      <img src={LOGO} alt="Ratal Travels"
           style={{ width:40, height:40, objectFit:'contain' }} />
    )
  }
  if (code === 'GWT') {
    return (
      <svg viewBox="0 0 50 50" width="38" height="38">
        <path d="M25 44 C10 33,4 18,10 7 C16 18,22 24,25 44Z"  fill="#2E7D32"/>
        <path d="M25 44 C40 33,46 18,40 7 C34 18,28 24,25 44Z" fill="#4CAF50"/>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 50 50" width="36" height="36">
      <circle cx="25" cy="25" r="5"  fill="#7C4DFF"/>
      <circle cx="10" cy="10" r="3.5" fill="#9C6DFF"/>
      <circle cx="40" cy="10" r="3.5" fill="#9C6DFF"/>
      <circle cx="10" cy="40" r="3.5" fill="#9C6DFF"/>
      <circle cx="40" cy="40" r="3.5" fill="#9C6DFF"/>
      <line x1="25" y1="25" x2="10" y2="10" stroke="#7C4DFF" strokeWidth="2"/>
      <line x1="25" y1="25" x2="40" y2="10" stroke="#7C4DFF" strokeWidth="2"/>
      <line x1="25" y1="25" x2="10" y2="40" stroke="#7C4DFF" strokeWidth="2"/>
      <line x1="25" y1="25" x2="40" y2="40" stroke="#7C4DFF" strokeWidth="2"/>
    </svg>
  )
}

// ── Entity selection card ────────────────────────────────────────────
function EntityCard({ entity, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={() => onClick(entity.code)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display:'flex', alignItems:'center', gap:14,
        background: hover ? '#f7f9ff' : '#ffffff',
        border:`1.5px solid ${hover ? entity.cardBorder+'66' : '#E8ECF4'}`,
        borderRadius:16, padding:'13px 16px', marginBottom:12,
        cursor:'pointer',
        boxShadow: hover ? `0 6px 24px ${entity.cardBorder}28` : '0 2px 10px rgba(0,0,0,0.07)',
        transition:'all 0.18s',
      }}
    >
      <div style={{
        width:58, height:58, borderRadius:'50%',
        background:'#F0F4FA', border:`1.5px solid ${entity.cardBorder}22`,
        display:'flex', alignItems:'center', justifyContent:'center',
        flexShrink:0, overflow:'hidden',
      }}>
        <EntityIcon code={entity.code} />
      </div>

      <div style={{ flex:1, minWidth:0 }}>
        <div style={{
          fontSize:12, fontWeight:800, color:'#0C1A3A',
          letterSpacing:'0.8px', lineHeight:1.25, marginBottom:3,
        }}>
          {entity.landingName}
        </div>
        <div style={{ fontSize:11, color:'#6B7C93', lineHeight:1.45 }}>
          {entity.landingSub}
        </div>
      </div>

      <div style={{
        width:34, height:34, borderRadius:'50%',
        background: entity.cardBorder,
        display:'flex', alignItems:'center', justifyContent:'center',
        color:'#fff', fontSize:18, fontWeight:700, flexShrink:0,
        boxShadow:`0 3px 10px ${entity.cardBorder}55`,
        transform: hover ? 'scale(1.12)' : 'scale(1)',
        transition:'transform 0.15s',
      }}>›</div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────
export default function Landing({ onSelect }) {
  return (
    <div style={{
      minHeight:'100vh', display:'flex',
      background:'#0C1A3A',
      fontFamily:"'Inter','Segoe UI',sans-serif",
    }}>

      {/* ══ LEFT PANEL — Cream background, logo, Riyadh skyline ══ */}
      <div style={{
        width:'42%', minWidth:260,
        background:'#F5EFE0',
        borderRadius:'0 90px 90px 0',
        display:'flex', flexDirection:'column',
        alignItems:'center',
        padding:'44px 28px 0',
        position:'relative', overflow:'hidden',
        zIndex:1,
        boxShadow:'10px 0 50px rgba(0,0,0,0.28)',
      }}>

        {/* Logo — centered, right above the skyline */}
        <img
          src={LOGO}
          alt="Ratal Group"
          style={{
            position:'absolute',
            bottom:'calc(40% + 28px)',
            left:'50%',
            transform:'translateX(-50%)',
            width:280, maxWidth:'80%',
            filter:'drop-shadow(0 6px 20px rgba(0,0,0,0.22))',
            zIndex:2,
          }}
        />

        {/* Riyadh skyline photo — occupies bottom 40% of the panel */}
        <div style={{
          position:'absolute', bottom:0, left:0, right:0, height:'40%',
        }}>
          <img
            src={SKYLINE}
            alt="Riyadh"
            onError={e => { e.target.style.display = 'none' }}
            style={{
              width:'100%', height:'100%',
              objectFit:'cover', objectPosition:'center 30%',
            }}
          />
          {/* Fade the top of the photo into the cream background */}
          <div style={{
            position:'absolute', inset:0,
            background:'linear-gradient(to bottom, #F5EFE0 0%, transparent 40%)',
          }}/>
        </div>
      </div>

      {/* ══ RIGHT PANEL — Dark navy, entity cards ══ */}
      <div style={{
        flex:1, display:'flex', flexDirection:'column',
        justifyContent:'center', padding:'44px 48px',
      }}>

        {/* — WELCOME TO — */}
        <div style={{
          display:'flex', alignItems:'center', gap:10, marginBottom:8,
        }}>
          <div style={{ flex:1, height:1, background:'#C9A84C', opacity:0.5 }}/>
          <div style={{
            fontSize:9, letterSpacing:4, color:'#C9A84C', fontWeight:700,
          }}>WELCOME TO</div>
          <div style={{ flex:1, height:1, background:'#C9A84C', opacity:0.5 }}/>
        </div>

        {/* RATAL GROUP heading */}
        <div style={{ marginBottom:6 }}>
          <span style={{
            fontSize:38, fontWeight:900, color:'#fff',
            letterSpacing:2, fontFamily:'Georgia,serif',
          }}>RATAL </span>
          <span style={{
            fontSize:38, fontWeight:900, color:'#C9A84C',
            letterSpacing:2, fontFamily:'Georgia,serif',
          }}>GROUP</span>
        </div>

        {/* Gold dot divider */}
        <div style={{
          width:7, height:7, borderRadius:'50%',
          background:'#C9A84C', marginBottom:8,
        }}/>

        <div style={{ fontSize:12, color:'rgba(255,255,255,0.48)', marginBottom:24 }}>
          Please select a business to continue
        </div>

        {/* Entity cards */}
        <div style={{ maxWidth:430 }}>
          {ENTITY_LIST.map(e => (
            <EntityCard key={e.code} entity={e} onClick={onSelect} />
          ))}
        </div>

        {/* Trust badges */}
        <div style={{
          display:'flex', alignItems:'center', gap:0,
          marginTop:18, paddingTop:14,
          borderTop:'1px solid rgba(255,255,255,0.08)',
          maxWidth:430,
        }}>
          {[
            { icon:'🛡', label:'Secure Access' },
            { icon:'👥', label:'Trusted Solutions' },
            { icon:'📈', label:'Future Ready' },
          ].map(({ icon, label }, i) => (
            <div key={label} style={{ display:'flex', alignItems:'center' }}>
              {i > 0 && (
                <div style={{
                  height:16, width:1,
                  background:'rgba(255,255,255,0.15)',
                  margin:'0 18px',
                }}/>
              )}
              <div style={{
                display:'flex', alignItems:'center', gap:6,
                fontSize:10, color:'rgba(255,255,255,0.42)',
              }}>
                <span style={{ fontSize:13 }}>{icon}</span>{label}
              </div>
            </div>
          ))}
        </div>

        {/* Skyline silhouette SVG */}
        <div style={{ maxWidth:430, marginTop:10 }}>
          <SkylineSVG />
        </div>

        <div style={{
          fontSize:9, color:'rgba(255,255,255,0.2)',
          marginTop:4, maxWidth:430,
        }}>
          © 2024 Ratal Group. All rights reserved.
        </div>
      </div>
    </div>
  )
}
