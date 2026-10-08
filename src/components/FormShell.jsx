/**
 * FormShell.jsx — Universal 6-Layer Form Modal Wrapper
 *
 * Single component used by EVERY form modal in the app.
 * Change colors in CHAPTER_PALETTES → all forms update instantly.
 *
 * Layer structure (matches PDF spec exactly):
 *   L1  Outer teal frame        chapterL1  borderRadius:18  padding:8
 *   L2  Light inner area        chapterL2  flex row
 *   L3  Accent block top-right  chapterL3  absolute, 220×185
 *   ──  Left sidebar            260px      company/chapter/title/steps
 *   L4  White form card         flex:1     sticky header + scrollable body
 *   ──  Button row              in L1      Back (grey) | Primary (L3)
 *
 * Usage:
 *   <FormShell
 *     isOpen={showForm}
 *     onClose={() => setShowForm(false)}
 *     chapterName="Operations"
 *     title={['NEW', 'Money', 'Request']}
 *     description="Request cash funds for field operations."
 *     steps={['Request Details', 'Attachments']}
 *     currentStep={formStep}
 *     onBack={handleBack}
 *     onNext={handleNext}
 *     backLabel="Back"
 *     nextLabel="Save & Next"
 *     nextDisabled={false}
 *   >
 *     {formStepContent}
 *   </FormShell>
 *
 * Rules:
 *   • title[0]  dark (#172D37)
 *   • title[1]  accent (L3 color)   ← the bold visual hook
 *   • title[2+] dark (#172D37)
 *   • Step list: done = checkmark L3, active = bold + L3 left border, future = faded
 *   • Buttons always pill-shaped (borderRadius:22)
 *   • Back always #747474 — NEVER the chapter color
 */

import { CHAPTER_PALETTES, FORM } from '../styles/appStyles'

const PP = "'Poppins', sans-serif"
const MAIN    = '#172D37'
const SUB     = '#53666F'
const BACK_C  = '#747474'

export default function FormShell({
  isOpen       = false,
  onClose,
  chapterName  = 'Operations',
  title        = ['NEW', 'Form'],
  description  = '',
  steps        = [],
  currentStep  = 1,           // 1-based
  onBack,
  onNext,
  backLabel    = 'Back',
  nextLabel    = 'Save & Next',
  nextDisabled = false,
  children,
}) {
  if (!isOpen) return null

  const pal   = CHAPTER_PALETTES[chapterName] || CHAPTER_PALETTES.Operations
  const { L1, L2, L3 } = pal
  const lines = Array.isArray(title) ? title : [title]

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
          borderRadius: 18,
          padding: 8,
          width: `min(${FORM.WIDTH}px, 97vw)`,
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 28px 80px rgba(0,0,0,0.35)',
        }}
      >
        {/* ── L2 INNER AREA ── */}
        <div style={{
          background: L2,
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'row',
          position: 'relative',
          overflow: 'hidden',
          flex: 1,
          minHeight: 0,
        }}>

          {/* ── L3 ACCENT BLOCK — top-right corner ── */}
          <div style={{
            position: 'absolute', top: 0, right: 0,
            width: FORM.ACCENT_W,
            height: FORM.ACCENT_H,
            background: L3,
            borderRadius: '0 12px 0 90px',
            zIndex: 0,
            pointerEvents: 'none',
          }} />

          {/* ══════════ LEFT SIDEBAR ══════════ */}
          <div style={{
            width: FORM.SIDEBAR_WIDTH,
            flexShrink: 0,
            padding: '28px 22px 24px',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 1,
            position: 'relative',
          }}>

            {/* Company name */}
            <div style={{
              fontSize: 8, fontWeight: 800, color: SUB,
              letterSpacing: 1.6, textTransform: 'uppercase',
              marginBottom: 3, fontFamily: PP,
            }}>
              Ratal Advanced Technologies
            </div>

            {/* Chapter label — just the name, no number */}
            <div style={{
              fontSize: 9, fontWeight: 800, color: L3,
              letterSpacing: 2.2, textTransform: 'uppercase',
              marginBottom: 18, fontFamily: PP,
            }}>
              {chapterName}
            </div>

            {/* Form title — multi-line, line[1] gets L3 accent */}
            <div style={{ marginBottom: 14, fontFamily: PP }}>
              {lines.map((line, i) => (
                <div key={i} style={{
                  fontSize:   i === 1 ? 26 : 13,
                  fontWeight: 900,
                  color:      i === 1 ? L3 : MAIN,
                  lineHeight: i === 1 ? 1.05 : 1.25,
                  textTransform: 'uppercase',
                  letterSpacing: i === 1 ? '-0.5px' : 0.3,
                }}>
                  {line}
                </div>
              ))}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: `${L3}30`, marginBottom: 12 }} />

            {/* Description */}
            {description && (
              <div style={{
                fontSize: 10, color: SUB, lineHeight: 1.65,
                marginBottom: 18, fontFamily: PP,
              }}>
                {description}
              </div>
            )}

            {/* Step counter */}
            {steps.length > 0 && (
              <div style={{
                fontSize: 10, fontWeight: 800, color: SUB,
                marginBottom: 10, fontFamily: PP, letterSpacing: 0.4,
              }}>
                Step {currentStep} of {steps.length}
              </div>
            )}

            {/* Vertical step list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {steps.map((name, i) => {
                const n      = i + 1
                const active = n === currentStep
                const done   = n < currentStep
                return (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 8px', borderRadius: 7,
                    background: active ? `${L3}15` : 'transparent',
                    borderLeft: active ? `3px solid ${L3}` : '3px solid transparent',
                  }}>
                    {/* Step dot */}
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                      background: done || active ? L3 : 'transparent',
                      border: done || active ? 'none' : '2px solid #c9d5da',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, color: '#fff', fontWeight: 800, fontFamily: PP,
                    }}>
                      {done ? '✓' : n}
                    </div>
                    {/* Step name */}
                    <span style={{
                      fontSize: 11,
                      fontWeight: active ? 800 : done ? 600 : 400,
                      color: active ? MAIN : done ? L3 : SUB,
                      fontFamily: PP,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {name}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ══════════ L4 WHITE CARD ══════════ */}
          <div style={{
            flex: 1,
            background: '#FFFFFF',
            borderRadius: 10,
            margin: `${FORM.CARD_TOP}px 10px 10px 0`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 1,
            position: 'relative',
            boxShadow: '0 2px 24px rgba(0,0,0,0.09)',
          }}>

            {/* Card header — sticky, never scrolls */}
            <div style={{
              padding: '11px 18px 9px',
              borderBottom: '1px solid #f0f4f8',
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
              background: '#fff',
            }}>
              <div style={{
                fontSize: 13, fontWeight: 800,
                color: MAIN, fontFamily: PP,
              }}>
                {steps[currentStep - 1] || ''}
              </div>
              <button
                onClick={onClose}
                style={{
                  width: 26, height: 26, borderRadius: '50%',
                  background: '#f1f5f9', border: 'none',
                  fontSize: 12, color: '#64748b', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: PP,
                }}
              >✕</button>
            </div>

            {/* Scrollable form body — children go here */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: `${FORM.PANEL_PADDING}px`,
            }}>
              {children}
            </div>

          </div>
        </div>

        {/* ══════════ BUTTON ROW — in L1 strip below L2 ══════════ */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 16px 4px',
        }}>
          <button
            onClick={onBack}
            style={{
              background: BACK_C, color: '#fff', border: 'none',
              borderRadius: 22, padding: '10px 28px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: PP,
            }}
          >
            {backLabel}
          </button>

          <button
            onClick={onNext}
            disabled={nextDisabled}
            style={{
              background: nextDisabled ? '#b0bec5' : L3,
              color: '#fff', border: 'none',
              borderRadius: 22, padding: '10px 32px',
              fontSize: 13, fontWeight: 700,
              cursor: nextDisabled ? 'not-allowed' : 'pointer',
              fontFamily: PP,
              opacity: nextDisabled ? 0.7 : 1,
            }}
          >
            {nextLabel}
          </button>
        </div>

      </div>
    </div>
  )
}
