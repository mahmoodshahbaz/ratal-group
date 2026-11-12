/**
 * PageBanner.jsx — Step 0 Entry Banner (Sign-Style)
 *
 * Sign-style layout matching approved mockup:
 *   • Top branding strip  — "Ratal Advanced Technologies" + chapter name
 *   • Main body           — big form title (left) | vertical divider | circle icon (right)
 *   • Description block   — bold heading + paragraph below divider line on left
 *   • Bottom strip (L3)   — 3 workflow steps + START button
 *
 * Usage:
 *   <PageBanner
 *     isOpen={showBanner}
 *     onClose={() => setShowBanner(false)}
 *     onStart={() => { setShowBanner(false); setShowForm(true) }}
 *     chapterName="Operations"
 *     formTitle={['NEW', 'LOI', 'REQUEST']}
 *     heading="Record Letter of Intent details"
 *     description="Even if you receive a verbal notification or via WhatsApp, fill this in for your own records and to safeguard yourself. Goes through DH approval before filing."
 *     icon={<svg .../>}
 *     iconLabel="DH Approval Required"
 *     workflowSteps={['Fill Details', 'DH Approval', 'Filed & Saved']}
 *     steps={['Request Details', 'Attachments']}
 *   />
 *
 * Backward-compat: still accepts chapterL1/chapterL2/moduleColor/chapterLabel props.
 */

import React from 'react'
import { CHAPTER_PALETTES, FORM } from '../styles/appStyles'
import { getBannerIcon, getStepEmoji } from './BannerIcons'

const PP   = "'Poppins', sans-serif"
const MAIN = '#172D37'
const SUB  = '#53666F'

function darken(hex, amount = 0.18) {
  const n = parseInt((hex || '#70A5A6').replace('#', ''), 16)
  const r = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - amount)))
  const g = Math.max(0, Math.round(((n >>  8) & 0xff) * (1 - amount)))
  const b = Math.max(0, Math.round(( n        & 0xff) * (1 - amount)))
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')
}

export default function PageBanner({
  isOpen,
  onClose,
  onStart,
  onStartAlt    = null,
  startAltLabel = 'Import from PDF',

  // Preferred: derive colors from chapter name
  chapterName   = 'Operations',

  // Legacy / override props (still accepted)
  chapterL1,
  chapterL2,
  moduleColor,
  chapterLabel,

  formTitle      = ['NEW', 'Form'],   // array of title lines
  heading        = '',                 // bold heading above description
  description    = '',                 // paragraph text
  icon           = null,               // JSX element shown in circle
  iconLabel      = 'DH Approval\nRequired',
  workflowSteps  = null,               // 3-item array for bottom strip
  steps          = [],                 // form step names (used as fallback for workflowSteps)
}) {
  if (!isOpen) return null

  const pal     = CHAPTER_PALETTES[chapterName] || CHAPTER_PALETTES.Operations
  const L1      = chapterL1   || pal.L1
  const L2      = chapterL2   || pal.L2
  const L3      = moduleColor || pal.L3
  const chapter = chapterLabel || chapterName

  const titleLines = Array.isArray(formTitle) ? formTitle : [formTitle]
  const wfSteps    = (workflowSteps || steps).slice(0, 3)

  // Resolve the main circle icon:
  //   1. If `icon` prop is a string → render as large emoji
  //   2. If `icon` prop is JSX → render directly
  //   3. Otherwise → auto-lookup colorful SVG from BannerIcons
  //   4. Fallback → defaultIcon SVG
  const colorfulIcon = getBannerIcon(iconLabel, L3)

  // Default icon (document + checkmark) if no match
  const defaultIcon = (
    <svg width="70" height="70" viewBox="0 0 64 64" fill="none">
      <rect x="10" y="6" width="36" height="44" rx="3" fill="white" opacity="0.9"/>
      <rect x="16" y="14" width="24" height="3" rx="1.5" fill={L3}/>
      <rect x="16" y="21" width="18" height="3" rx="1.5" fill={L3}/>
      <rect x="16" y="28" width="20" height="3" rx="1.5" fill={L3}/>
      <circle cx="46" cy="46" r="12" fill="rgba(255,255,255,0.35)"/>
      <path d="M40 46l6 6 8-10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(10,20,30,0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: PP,
      }}
    >
      {/* ── L1 OUTER FRAME ── */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: L1,
          borderRadius: 4,
          padding: 12,
          border: `3px solid ${darken(L1)}`,
          width: `min(${FORM.WIDTH}px, 97vw)`,
          height: 'min(90vh, 680px)',   /* same fixed height as FormShell */
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 28px 80px rgba(0,0,0,0.35)',
        }}
      >
        {/* ── INNER WHITE PANEL ── */}
        <div style={{
          background: '#fff',
          border: `2px solid ${L3}`,
          borderRadius: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flex: 1,
          minHeight: 0,
        }}>

          {/* TOP BRANDING STRIP */}
          <div style={{
            background: L2,
            display: 'flex', alignItems: 'stretch',
            borderBottom: `1px solid ${darken(L2, 0.08)}`,
            flexShrink: 0,
          }}>
            <div style={{
              flex: 1, padding: '14px 28px',
              display: 'flex', alignItems: 'center',
            }}>
              <div style={{
                fontSize: 15, fontWeight: 900, color: L3,
                letterSpacing: 0.3, whiteSpace: 'nowrap', fontFamily: PP,
              }}>
                Ratal Advanced Technologies
              </div>
            </div>
            <div style={{
              padding: '14px 28px',
              display: 'flex', alignItems: 'center',
              borderLeft: `1px solid ${darken(L2, 0.08)}`,
            }}>
              <div style={{
                fontSize: 13, fontWeight: 800, color: L3,
                letterSpacing: 2.5, textTransform: 'uppercase', fontFamily: PP,
              }}>
                {chapter}
              </div>
            </div>
          </div>

          {/* MAIN BODY */}
          <div style={{
            flex: 1,
            display: 'flex', alignItems: 'center',
            padding: '0 44px',
            overflow: 'hidden',
          }}>

            {/* LEFT: big title + description */}
            <div style={{ flex: 1, paddingRight: 40, textAlign: 'left' }}>
              {titleLines.map((line, i) => (
                <div key={i} style={{
                  fontSize:      i === 1 ? 68 : 14,
                  fontWeight:    900,
                  color:         L3,
                  textTransform: 'uppercase',
                  lineHeight:    i === 1 ? 0.9 : 1.3,
                  letterSpacing: i === 1 ? '-3px' : '0.3px',
                  fontFamily:    PP,
                }}>
                  {line}
                </div>
              ))}
              <div style={{
                height: 2, background: L3, width: '100%',
                margin: '14px 0', opacity: 0.2,
              }} />
              {heading && (
                <div style={{
                  fontSize: 12, fontWeight: 700, color: MAIN,
                  marginBottom: 8, fontFamily: PP,
                }}>
                  {heading}
                </div>
              )}
              {description && (
                <div style={{
                  fontSize: 10.5, fontWeight: 400, color: SUB,
                  lineHeight: 1.75, fontFamily: PP,
                }}>
                  {description}
                </div>
              )}
            </div>

            {/* VERTICAL DIVIDER */}
            <div style={{
              width: 2, height: 200,
              background: L3, opacity: 0.15, flexShrink: 0,
            }} />

            {/* RIGHT: circle icon */}
            <div style={{
              flexShrink: 0, paddingLeft: 40,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 14,
            }}>
              <div style={{
                width: 140, height: 140, borderRadius: '50%',
                background: L3,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {typeof icon === 'string'
                  ? <span style={{ fontSize: 60, lineHeight: 1 }}>{icon}</span>
                  : icon
                    ? icon
                    : colorfulIcon
                      ? colorfulIcon
                      : defaultIcon
                }
              </div>
              <div style={{
                fontSize: 9, fontWeight: 700, color: SUB,
                letterSpacing: 1, textTransform: 'uppercase',
                textAlign: 'center', fontFamily: PP,
                whiteSpace: 'pre-line',
              }}>
                {iconLabel}
              </div>
            </div>

          </div>

          {/* BOTTOM WORKFLOW STRIP */}
          <div style={{ background: L3, display: 'flex', flexShrink: 0 }}>
            {wfSteps.map((step, i) => (
              <div key={i} style={{
                flex: 1, padding: '14px 18px',
                display: 'flex', alignItems: 'center', gap: 12,
                borderRight: i < wfSteps.length - 1
                  ? '1px solid rgba(255,255,255,0.2)' : 'none',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'rgba(255,255,255,0.18)',
                  border: '1.5px solid rgba(255,255,255,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 16, lineHeight: 1,
                }}>
                  {getStepEmoji(step)}
                </div>
                <div>
                  <div style={{
                    fontSize: 8, fontWeight: 800,
                    color: 'rgba(255,255,255,0.6)',
                    letterSpacing: 1, textTransform: 'uppercase', fontFamily: PP,
                  }}>
                    Step {i + 1}
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: 700,
                    color: '#fff', textTransform: 'uppercase', fontFamily: PP,
                  }}>
                    {step}
                  </div>
                </div>
              </div>
            ))}

            {/* START button (+ optional secondary CTA) */}
            <div style={{
              padding: '10px 22px',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 8, flexShrink: 0,
              borderLeft: '1px solid rgba(255,255,255,0.2)',
            }}>
              <button
                onClick={onStart}
                style={{
                  background: '#fff', color: L3,
                  border: 'none', borderRadius: 4,
                  padding: '11px 28px',
                  fontSize: 12, fontWeight: 800,
                  cursor: 'pointer', letterSpacing: 0.5,
                  whiteSpace: 'nowrap', fontFamily: PP,
                }}
              >
                START →
              </button>
              {onStartAlt && (
                <button
                  onClick={onStartAlt}
                  style={{
                    background: 'rgba(255,255,255,0.15)',
                    color: '#fff',
                    border: '1px solid rgba(255,255,255,0.3)',
                    borderRadius: 4, padding: '6px 16px',
                    fontSize: 10, fontWeight: 700,
                    cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: PP,
                  }}
                >
                  {startAltLabel}
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
