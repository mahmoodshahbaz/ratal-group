/**
 * ExpandableRow — Project-wide collapsible table row pattern
 *
 * Usage:
 *   const { toggle, isOpen } = useExpandable()
 *
 *   <tbody>
 *     {items.map((item, i) => (
 *       <ExpandableRow
 *         key={item.id}
 *         id={item.id}
 *         isOpen={isOpen(item.id)}
 *         onToggle={toggle}
 *         colSpan={N}           ← must match header column count
 *         zebra={i % 2 === 0}
 *         summary={<> <td>…</td> <td>…</td> </>}
 *         detail={<div style={{padding:16}}>…full detail…</div>}
 *       />
 *     ))}
 *   </tbody>
 */

import { useState } from 'react'

// ── Hook ────────────────────────────────────────────────────────────────────
export function useExpandable() {
  const [expandedId, setExpandedId] = useState(null)
  const toggle = (id) => setExpandedId(prev => prev === id ? null : id)
  const isOpen = (id) => expandedId === id
  return { toggle, isOpen }
}

// ── Component ────────────────────────────────────────────────────────────────
export function ExpandableRow({ id, isOpen, onToggle, summary, detail, colSpan = 6, zebra = false }) {
  const base = {
    cursor: 'pointer',
    background: isOpen ? '#eef3ff' : zebra ? '#fafbfc' : '#fff',
    borderLeft: isOpen ? '3px solid #1565C0' : '3px solid transparent',
    transition: 'background 0.15s',
  }

  return (
    <>
      <tr style={base} onClick={() => onToggle(id)}>
        {summary}
        {/* Chevron cell — always last */}
        <td style={{ width: 32, textAlign: 'center', color: isOpen ? '#1565C0' : '#c0c8d4', fontSize: 13, userSelect: 'none', padding: '0 6px' }}>
          {isOpen ? '▾' : '▸'}
        </td>
      </tr>

      {isOpen && (
        <tr>
          <td
            colSpan={colSpan + 1}   /* +1 for the chevron column */
            style={{ padding: 0, background: '#f4f7ff', borderLeft: '3px solid #1565C0', borderBottom: '2px solid #dde8ff' }}
          >
            {detail}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Detail layout helpers ────────────────────────────────────────────────────
/** Thin labelled field — use inside a detail panel */
export function DetailField({ label, value, mono = false, color }) {
  return (
    <div style={{ minWidth: 110 }}>
      <div style={{ fontSize: 9, color: '#9eaab8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: color || '#1a2e3d', fontFamily: mono ? 'monospace' : 'inherit' }}>
        {value ?? '—'}
      </div>
    </div>
  )
}

/** Horizontal group of DetailFields */
export function DetailRow({ children, style }) {
  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', ...style }}>
      {children}
    </div>
  )
}

/** Section separator inside a detail panel */
export function DetailSection({ label, children, borderColor = '#dde8ff' }) {
  return (
    <div style={{ borderTop: `1px solid ${borderColor}`, paddingTop: 10, marginTop: 10 }}>
      {label && <div style={{ fontSize: 9, fontWeight: 800, color: '#9eaab8', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>{label}</div>}
      {children}
    </div>
  )
}

/** Action buttons row */
export function DetailActions({ children }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 12, paddingTop: 10, borderTop: '1px solid #dde8ff' }}>
      {children}
    </div>
  )
}
