/**
 * FormWizard.jsx — Universal multi-step form shell
 *
 * LOCKED DIMENSIONS: 920 × 590 px — identical across every form in the app.
 *
 * Layout:
 *   ┌──────────────┬─────────────────────────────────┐
 *   │  LEFT        │  RIGHT PANEL                    │
 *   │  SIDEBAR     │  ┌─────────────────────────┐    │
 *   │  224px       │  │  Panel Header (sticky)  │    │
 *   │              │  ├─────────────────────────┤    │
 *   │  Company     │  │                         │    │
 *   │  Module      │  │   Step Content          │    │
 *   │  Form Title  │  │   (scrolls if needed)   │    │
 *   │  Step X of Y │  │                         │    │
 *   │              │  ├─────────────────────────┤    │
 *   │  ─ step list │  │  Footer (sticky)        │    │
 *   │    ● Step 1  │  │  [Back]  info  [Next →] │    │
 *   │    ○ Step 2  │  └─────────────────────────┘    │
 *   └──────────────┴─────────────────────────────────┘
 *
 * Usage:
 *   <FormWizard
 *     isOpen={open}
 *     onClose={() => setOpen(false)}
 *     moduleColor={GROUP_COLORS.Finance}
 *     moduleName="Finance"
 *     formTitle="New Invoice"
 *     steps={['Header', 'Line Items', 'Tax & Totals', 'Attachments']}
 *     currentStep={step}
 *     onStepClick={(i) => setStep(i)}   // only navigates to completed steps
 *     onBack={handleBack}
 *     onNext={handleNext}
 *     isLastStep={step === 3}
 *     footerInfo="4 rows · SAR 31,300"
 *   >
 *     {renderCurrentStepContent()}
 *   </FormWizard>
 */

import React from 'react'

const W = 920   // total width
const H = 590   // total height
const SW = 224  // sidebar width

// Slightly darken a hex color for the sidebar gradient
function darken(hex, amt = 28) {
  if (!hex || !hex.startsWith('#')) return hex
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amt)
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amt)
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amt)
  return `rgb(${r},${g},${b})`
}

export default function FormWizard({
  isOpen,
  onClose,
  moduleColor     = '#546e7a',
  moduleName      = 'Module',
  formTitle       = 'New Form',
  steps           = [],
  currentStep     = 0,
  onStepClick,
  onBack,
  onNext,
  nextLabel       = 'Save & Next',
  isLastStep      = false,
  footerInfo      = '',
  footerCenterNode = null,   // optional custom node between Back and Next
  children,
}) {
  if (!isOpen) return null

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.6)',
        backdropFilter: 'blur(5px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        fontFamily: "'Poppins', sans-serif",
      }}
    >
      <div style={{
        width: W, height: H,
        borderRadius: 20,
        overflow: 'hidden',
        display: 'flex',
        boxShadow: '0 28px 72px rgba(0,0,0,0.36)',
        fontFamily: "'Poppins', sans-serif",
      }}>

        {/* ══════════ LEFT SIDEBAR ══════════ */}
        <div style={{
          width: SW, flexShrink: 0,
          background: `linear-gradient(160deg, ${moduleColor} 0%, ${darken(moduleColor)} 100%)`,
          display: 'flex', flexDirection: 'column',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* background circle decorations */}
          <div style={{
            position: 'absolute', right: -48, bottom: -48,
            width: 170, height: 170, borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)', pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', right: 16, top: -36,
            width: 110, height: 110, borderRadius: '50%',
            background: 'rgba(255,255,255,0.04)', pointerEvents: 'none',
          }} />

          {/* ── identity block ── */}
          <div style={{ padding: '26px 20px 0', position: 'relative', zIndex: 1 }}>
            <div style={{
              fontSize: 8, fontWeight: 700, letterSpacing: 1,
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)',
              marginBottom: 8,
            }}>
              Ratal Advanced Technologies
            </div>
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: 2.5,
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)',
              marginBottom: 6,
            }}>
              {moduleName}
            </div>
            <div style={{
              fontSize: 17, fontWeight: 900, color: '#fff',
              lineHeight: 1.25, letterSpacing: '-0.3px',
              marginBottom: steps.length ? 8 : 0,
            }}>
              {formTitle}
            </div>
            {steps.length > 0 && (
              <div style={{
                fontSize: 10, fontWeight: 700,
                color: 'rgba(255,255,255,0.5)',
                letterSpacing: 0.5,
              }}>
                STEP {currentStep + 1} OF {steps.length}
              </div>
            )}
          </div>

          {/* ── divider ── */}
          <div style={{
            height: 1, background: 'rgba(255,255,255,0.12)',
            margin: '16px 0',
          }} />

          {/* ── step list ── */}
          <div style={{
            flex: 1, padding: '0 14px',
            display: 'flex', flexDirection: 'column', gap: 3,
            overflowY: 'auto', position: 'relative', zIndex: 1,
          }}>
            {steps.map((step, i) => {
              const isActive = i === currentStep
              const isDone   = i < currentStep
              return (
                <div
                  key={i}
                  onClick={() => isDone && onStepClick?.(i)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    cursor: isDone ? 'pointer' : 'default',
                    background: isActive ? 'rgba(255,255,255,0.14)' : 'transparent',
                    borderLeft: isActive
                      ? '3px solid rgba(255,255,255,0.85)'
                      : isDone
                      ? '3px solid rgba(255,255,255,0.35)'
                      : '3px solid rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', gap: 9,
                    transition: 'background 0.12s',
                  }}
                >
                  {/* step circle */}
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    flexShrink: 0,
                    background: isActive
                      ? 'rgba(255,255,255,0.22)'
                      : isDone
                      ? 'rgba(255,255,255,0.18)'
                      : 'rgba(255,255,255,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: isDone ? 11 : 9,
                    fontWeight: 800,
                    color: isActive
                      ? '#fff'
                      : isDone
                      ? 'rgba(255,255,255,0.85)'
                      : 'rgba(255,255,255,0.3)',
                  }}>
                    {isDone ? '✓' : i + 1}
                  </div>

                  {/* step name */}
                  <span style={{
                    fontSize: 12, lineHeight: 1,
                    fontWeight: isActive ? 700 : isDone ? 500 : 400,
                    color: isActive
                      ? '#fff'
                      : isDone
                      ? 'rgba(255,255,255,0.75)'
                      : 'rgba(255,255,255,0.42)',
                    fontFamily: "'Poppins', sans-serif",
                  }}>
                    {step}
                  </span>
                </div>
              )
            })}
          </div>

          {/* ── bottom padding ── */}
          <div style={{ height: 20 }} />
        </div>

        {/* ══════════ RIGHT PANEL ══════════ */}
        <div style={{
          flex: 1,
          background: '#fff',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>

          {/* Panel header — sticky */}
          <div style={{
            padding: '16px 24px 14px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
            background: '#fff',
          }}>
            <div>
              <div style={{
                fontSize: 15, fontWeight: 800, color: '#1e293b',
                lineHeight: 1.2,
              }}>
                {steps[currentStep] || formTitle}
              </div>
              <div style={{
                fontSize: 10, color: '#94a3b8', marginTop: 3,
                fontWeight: 500,
              }}>
                {moduleName} · {formTitle}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                width: 30, height: 30, borderRadius: '50%',
                background: '#f1f5f9', border: 'none',
                fontSize: 14, color: '#64748b', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Poppins', sans-serif",
                flexShrink: 0,
              }}
            >✕</button>
          </div>

          {/* Content — scrollable */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 24px',
          }}>
            {children}
          </div>

          {/* Footer — sticky */}
          <div style={{
            padding: '12px 24px',
            borderTop: '1px solid #f1f5f9',
            background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexShrink: 0,
          }}>
            {/* Level 3 — always gray */}
            <button
              onClick={onBack}
              style={{
                padding: '9px 22px', borderRadius: 8,
                background: '#f1f5f9', color: '#475569',
                border: 'none', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
                whiteSpace: 'nowrap',
              }}
            >
              ← Back
            </button>

            {/* Center info or custom node */}
            <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', lineHeight: 1.4 }}>
              {footerCenterNode || footerInfo}
            </div>

            {/* Level 2 — module color */}
            <button
              onClick={onNext}
              style={{
                padding: '9px 22px', borderRadius: 8,
                background: moduleColor, color: '#fff',
                border: 'none', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
                boxShadow: '0 3px 12px rgba(0,0,0,0.14)',
                whiteSpace: 'nowrap',
              }}
            >
              {isLastStep ? 'Submit ✓' : `${nextLabel} →`}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
