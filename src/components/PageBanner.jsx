/**
 * PageBanner.jsx — Step 0 entry banner
 *
 * Uses the SAME 6-layer structure as all form modals:
 *   L1 outer frame  → chapterL1 color (e.g. #70A5A6 for Operations)
 *   L2 inner area   → chapterL2 color (e.g. #EAF3F2)
 *   L3 accent block → top-right corner, chapterL3 / moduleColor
 *   Left info panel → company name, chapter label, form title, steps, START
 *   Right panel     → L3 colored, icon + description
 *
 * Usage:
 *   <PageBanner
 *     isOpen={showBanner}
 *     onClose={() => setShowBanner(false)}
 *     onStart={() => { setShowBanner(false); setShowForm(true) }}
 *     chapterL1="#70A5A6"
 *     chapterL2="#EAF3F2"
 *     moduleColor="#0079BC"
 *     chapterLabel="Chapter 01 · Operations"
 *     formTitle={['New', 'Money', 'Request']}
 *     steps={['Request Details', 'Attachments']}
 *     icon={<svg .../>}
 *     description="Request cash funds for field operations."
 *   />
 */

import React from 'react'

const PP = "'Poppins', sans-serif"

export default function PageBanner({
  isOpen,
  onClose,
  onStart,
  onStartAlt      = null,   // optional secondary CTA (e.g. "Import from PDF")
  startAltLabel   = 'Import from PDF',
  chapterL1    = '#70A5A6',
  chapterL2    = '#EAF3F2',
  moduleColor  = '#0079BC',     // L3 accent
  chapterLabel = 'Chapter',
  formTitle    = ['New Form'],  // array of lines
  steps        = [],
  icon         = null,
  description  = '',
}) {
  if (!isOpen) return null

  const titleLines = Array.isArray(formTitle) ? formTitle : [formTitle]

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose?.() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.62)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        fontFamily: PP,
      }}
    >
      {/* ── L1 outer teal frame ── */}
      <div style={{
        background: chapterL1,
        borderRadius: 18,
        padding: 8,
        width: 860,
        maxWidth: '97vw',
        boxShadow: '0 28px 80px rgba(0,0,0,0.35)',
        display: 'flex',
        flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>

        {/* ── L2 inner area ── */}
        <div style={{
          background: chapterL2,
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'row',
          overflow: 'hidden',
          position: 'relative',
          minHeight: 400,
        }}>

          {/* ── L3 accent block — top right ── */}
          <div style={{
            position: 'absolute', top: 0, right: 0,
            width: 220, height: 160,
            background: moduleColor,
            borderRadius: '0 12px 0 90px',
            zIndex: 0,
            pointerEvents: 'none',
          }} />

          {/* ── LEFT INFO PANEL ── */}
          <div style={{
            width: 270, flexShrink: 0,
            padding: '32px 24px 28px',
            display: 'flex', flexDirection: 'column',
            justifyContent: 'center',
            zIndex: 1, position: 'relative',
          }}>
            {/* company name */}
            <div style={{
              fontSize: 9, fontWeight: 800, color: '#53666F',
              letterSpacing: 1.8, textTransform: 'uppercase',
              marginBottom: 3, fontFamily: PP,
            }}>
              Ratal Advanced Technologies
            </div>

            {/* chapter label */}
            <div style={{
              fontSize: 9, fontWeight: 800, color: moduleColor,
              letterSpacing: 1.8, textTransform: 'uppercase',
              marginBottom: 20, fontFamily: PP,
            }}>
              {chapterLabel}
            </div>

            {/* big form title */}
            <div style={{
              fontSize: 30, fontWeight: 900, color: '#172D37',
              lineHeight: 1.15, marginBottom: 18,
              fontFamily: PP, letterSpacing: '-0.3px',
            }}>
              {titleLines.map((line, i) => (
                <span key={i} style={{ display: 'block' }}>
                  {i === 1
                    ? <em style={{ color: moduleColor, fontStyle: 'normal' }}>{line}</em>
                    : line}
                </span>
              ))}
            </div>

            {/* step pills */}
            {steps.length > 0 && (
              <div style={{
                display: 'flex', gap: 6, flexWrap: 'wrap',
                marginBottom: 24,
              }}>
                {steps.map((s, i) => (
                  <div key={i} style={{
                    padding: '5px 13px', borderRadius: 20,
                    background: i === 0 ? moduleColor : 'rgba(0,0,0,0.07)',
                    color: i === 0 ? '#fff' : '#53666F',
                    fontSize: 10, fontWeight: 700,
                    fontFamily: PP, whiteSpace: 'nowrap',
                  }}>
                    {i + 1}. {s}
                  </div>
                ))}
              </div>
            )}

            {/* START button */}
            <div style={{ display:'flex', flexDirection:'column', gap:10, alignItems:'center' }}>
              <button
                onClick={onStart}
                style={{
                  display: 'inline-flex', alignItems: 'center',
                  background: '#fff',
                  borderRadius: 50, border: '2px solid rgba(0,121,188,0.2)',
                  cursor: 'pointer', padding: 6,
                  boxShadow: '0 4px 18px rgba(0,0,0,0.13)',
                  fontFamily: PP,
                }}
              >
                <div style={{
                  width: 42, height: 42, borderRadius: '50%',
                  background: moduleColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, color: '#fff', flexShrink: 0, marginRight: 12,
                }}>▼</div>
                <div style={{
                  fontSize: 14, fontWeight: 800,
                  color: '#172D37', letterSpacing: 1.5, paddingRight: 8,
                }}>START</div>
                <div style={{ width: 1, height: 26, background: 'rgba(0,0,0,0.10)', marginRight: 8 }} />
                <div style={{
                  width: 38, height: 38, borderRadius: '50%',
                  background: moduleColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 15, color: '#fff', flexShrink: 0,
                }}>→</div>
              </button>
              {onStartAlt && (
                <button onClick={onStartAlt} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  background: 'transparent', border: `1.5px solid ${moduleColor}55`,
                  borderRadius: 50, padding: '7px 16px',
                  color: moduleColor, fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', fontFamily: PP, letterSpacing: 0.5,
                  whiteSpace: 'nowrap',
                }}>
                  <span style={{ fontSize: 13 }}>📎</span>
                  {startAltLabel}
                </button>
              )}
            </div>
          </div>

          {/* ── RIGHT ILLUSTRATION PANEL ── */}
          <div style={{
            flex: 1,
            background: moduleColor,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '32px 28px',
            position: 'relative', overflow: 'hidden',
            zIndex: 0,
          }}>
            {/* decorative circles */}
            <div style={{
              position: 'absolute', right: -60, top: -60,
              width: 260, height: 260, borderRadius: '50%',
              background: 'rgba(255,255,255,0.07)', pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', left: -50, bottom: -50,
              width: 200, height: 200, borderRadius: '50%',
              background: 'rgba(255,255,255,0.05)', pointerEvents: 'none',
            }} />

            {/* company top-right */}
            <div style={{
              position: 'absolute', top: 14, right: 14,
              fontSize: 9, fontWeight: 700,
              color: 'rgba(255,255,255,0.32)',
              letterSpacing: 0.5, zIndex: 2,
            }}>
              Ratal Advanced Technologies
            </div>

            {/* icon */}
            <div style={{
              position: 'relative', zIndex: 2,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 16, textAlign: 'center',
            }}>
              <div style={{
                fontSize: 90, lineHeight: 1,
                filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.3))',
              }}>
                {icon}
              </div>

              <div style={{
                width: 40, height: 2, borderRadius: 2,
                background: 'rgba(255,255,255,0.3)',
              }} />

              <div style={{
                fontSize: 12, fontWeight: 500,
                color: 'rgba(255,255,255,0.85)',
                lineHeight: 1.7, maxWidth: 220,
                fontFamily: PP,
              }}>
                {description}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
