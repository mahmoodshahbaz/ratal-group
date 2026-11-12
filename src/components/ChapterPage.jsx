/**
 * ChapterPage.jsx — Standard list/table page wrapper
 *
 * Used by every data-list page in the app (Invoices, Employees, Vehicles, etc.)
 *
 * Structure:
 *   ┌─────────────────────────────────────────────────────┐
 *   │  💳 Finance                          [+ New Invoice] │  ← H1 Chapter header
 *   │  Manage billing, POs and payments                    │
 *   ├─────────────────────────────────────────────────────┤
 *   │  Invoices                                            │  ← H2 Section title
 *   │  [All ▾] [Pending] [Paid] [Overdue]  🔍 Search...   │  ← Filter strip
 *   ├──────┬──────────┬────────┬──────┬──────┬────────────┤
 *   │  #   │ Client   │ Amount │ Date │ Status│    ⋯       │  ← Sticky thead
 *   ├──────┼──────────┼────────┼──────┼──────┼────────────┤
 *   │  row │          │        │      │       │            │  ← tbody rows
 *   │  ▼   │ expanded collapsible detail row              │
 *   └──────┴──────────┴────────┴──────┴──────┴────────────┘
 *
 * The extra-columns collapse pattern:
 *   - Every row has a "⋯" button on the far right
 *   - Clicking it expands a detail row below showing secondary columns
 *   - Primary columns (3-4) always visible; secondary columns in the expand panel
 *
 * Usage:
 *   <ChapterPage
 *     chapterName="Finance"
 *     chapterIcon="💳"
 *     chapterColor={GROUP_COLORS.Finance}
 *     chapterSubtitle="Manage billing, purchase orders and payments"
 *     sectionTitle="Invoices"
 *     onNew={() => setShowBanner(true)}
 *     newLabel="+ New Invoice"
 *     filters={['All','Pending','Paid','Overdue']}
 *     activeFilter={filter}
 *     onFilter={setFilter}
 *     searchValue={search}
 *     onSearch={setSearch}
 *     columns={columns}            // array of { key, label, width, primary }
 *     rows={rows}                  // array of data objects
 *     renderCell={renderCell}      // (row, col) => ReactNode
 *     renderExpand={renderExpand}  // (row) => ReactNode for the collapsed detail
 *     loading={loading}
 *     emptyMessage="No invoices found"
 *   />
 */

import React, { useState } from 'react'
import { GROUP_COLORS, TYPE, TABLE, PAGE, btn, filterChip, searchInput, CHAPTER_PALETTES, kpiCardGradient } from '../styles/appStyles'

export default function ChapterPage({
  // Chapter identity
  chapterName     = 'Chapter',
  chapterIcon     = '📋',
  chapterColor    = '#546e7a',
  chapterSubtitle = '',
  // Section
  sectionTitle    = '',
  // Action button
  onNew,
  newLabel        = '+ New',
  // Filters
  filters         = [],
  activeFilter    = 'All',
  onFilter,
  searchValue     = '',
  onSearch,
  searchPlaceholder = 'Search…',
  // Table
  columns         = [],   // { key, label, width, primary, align }
  rows            = [],
  renderCell,             // (row, colKey) => ReactNode
  renderExpand,           // (row) => ReactNode — the collapsible detail panel
  loading         = false,
  emptyMessage    = 'No records found',
  // KPI bar (optional)
  kpis            = [],   // [{ label, value, sub }]
  // Extra content rendered below section header (e.g. custom filter bar)
  filterBar,
  // Custom table / content override
  children,
}) {
  const [expandedRow, setExpandedRow] = useState(null)

  // Derive chapter palette — L2 = page bg, L1 = section heading bar, L3 = table headers + buttons
  const pal = CHAPTER_PALETTES[chapterName] || CHAPTER_PALETTES.Main
  const L1  = pal.L1
  const L2  = pal.L2
  const L3  = chapterColor || pal.L3

  const primaryCols   = columns.filter(c => c.primary !== false)
  const hasExpandable = !!renderExpand

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden',
      background: L2,
      fontFamily: TYPE.FONT,
    }}>

      {/* H1 is now provided globally by AppShell — ChapterPage starts at H2 */}

      {/* ══════════════════════════════════════════════════════════
          UPPER ZONE — naturally stationary (flexShrink:0)
          KPI cards + section heading + action button + filters + filterBar
      ══════════════════════════════════════════════════════════ */}
      <div style={{
        flexShrink: 0,
        background: L2,
        boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
        zIndex: 10,
      }}>

        {/* ── Section H2 + action button — L1 bar inset to match table width ── */}
        {(sectionTitle || onNew) && (
          <div style={{ background: L2, padding: '6px 28px 0' }}>
            <div style={{
              background: L1,
              padding: '8px 16px',
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              {sectionTitle && (
                <h2 style={{
                  fontSize: '15px', fontWeight: 700,
                  color: '#fff', margin: 0,
                  fontFamily: TYPE.FONT,
                }}>
                  {sectionTitle}
                </h2>
              )}
              {onNew && (
                <button onClick={onNew} style={{ ...btn.L1(L3), marginLeft: 'auto' }}>
                  {newLabel}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── KPI bar (optional) — 160×62px fixed, dark-to-light chapter gradient ── */}
        {kpis.length > 0 && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 8,
            padding: '14px 28px 10px',
            background: L2,
            borderBottom: `1px solid ${L1}44`,
          }}>
            {kpis.map((k, i) => {
              const cardStyle = kpiCardGradient(i, L1, L2, L3)
              const isLight   = i >= 2
              return (
                <div key={i} style={{
                  ...cardStyle,
                  width: 200, height: 62,
                  borderRadius: 8,
                  padding: '0 14px',
                  display: 'flex', flexDirection: 'column',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: i < 2 ? '0 3px 10px rgba(0,0,0,0.20)' : '0 2px 6px rgba(0,0,0,0.08)',
                  boxSizing: 'border-box',
                }}>
                  <div style={{
                    fontSize: 9, fontWeight: 800, letterSpacing: 0.9,
                    textTransform: 'uppercase', fontFamily: TYPE.FONT,
                    opacity: isLight ? 0.6 : 0.75,
                    marginBottom: 2,
                  }}>{k.label}</div>
                  <div style={{
                    fontSize: 19, fontWeight: 900,
                    lineHeight: 1.1, fontFamily: TYPE.FONT,
                  }}>{k.value}</div>
                  {k.sub && (
                    <div style={{
                      fontSize: 9, opacity: isLight ? 0.55 : 0.65,
                      marginTop: 1, fontFamily: TYPE.FONT,
                    }}>{k.sub}</div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── Built-in filter strip — white bar inset to match table width ── */}
        {(filters.length > 0 || onSearch !== undefined) && (
          <div style={{ background: L2, padding: '0 28px' }}>
            <div style={{ background: '#fff', padding: '8px 16px 10px', borderBottom: '1px solid #e8ecf4' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2 }}>
              {filters.map(f => (
                <button key={f} onClick={() => onFilter?.(f)}
                  style={{ ...filterChip(f === activeFilter, L3), flexShrink: 0 }}>
                  {f}
                </button>
              ))}
              {onSearch !== undefined && (
                <div style={{ position: 'relative', marginLeft: 'auto', flexShrink: 0 }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#94a3b8', pointerEvents: 'none' }}>🔍</span>
                  <input value={searchValue} onChange={e => onSearch(e.target.value)} placeholder={searchPlaceholder} style={searchInput} />
                </div>
              )}
            </div>
            </div>
          </div>
        )}

        {/* ── Custom filter bar — white bar inset to match table width ── */}
        {filterBar && (
          <div style={{ background: L2, padding: '0 28px' }}>
            <div style={{ background: '#fff', padding: '8px 16px 10px', borderBottom: '1px solid #e8ecf4' }}>
              {filterBar}
            </div>
          </div>
        )}

      </div>{/* end upper zone */}

      {/* ══════════════════════════════════════════════════════════
          SCROLL ZONE — only data rows scroll here
      ══════════════════════════════════════════════════════════ */}
      {children ? (
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 28px 24px' }}>
          {children}
        </div>
      ) : null}

      {!children && <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 28px 24px' }}>
        <div style={{
          borderRadius: TABLE.RADIUS,
          boxShadow: PAGE.CARD_SHADOW,
          background: '#fff',
          overflowX: 'auto',
        }}>
          <table style={{
            width: '100%', borderCollapse: 'collapse',
            fontFamily: TYPE.FONT,
          }}>
            {/* Sticky thead */}
            <thead>
              <tr>
                {primaryCols.map(col => (
                  <th key={col.key} style={{
                    background: L3,
                    color: '#fff',
                    fontSize: TABLE.HEADER_SIZE,
                    fontWeight: TABLE.HEADER_WEIGHT,
                    letterSpacing: TABLE.HEADER_SPACING,
                    textTransform: 'uppercase',
                    padding: TABLE.CELL_PADDING,
                    textAlign: col.align || 'left',
                    position: 'sticky', top: 0,
                    zIndex: TABLE.STICKY_Z,
                    whiteSpace: 'nowrap',
                    fontFamily: TYPE.FONT,
                    width: col.width || 'auto',
                  }}>
                    {col.label}
                  </th>
                ))}
                {/* expand column */}
                {hasExpandable && (
                  <th style={{
                    background: L3,
                    color: '#fff',
                    fontSize: TABLE.HEADER_SIZE,
                    fontWeight: TABLE.HEADER_WEIGHT,
                    padding: TABLE.CELL_PADDING,
                    position: 'sticky', top: 0,
                    zIndex: TABLE.STICKY_Z,
                    width: 40, textAlign: 'center',
                  }}>⋯</th>
                )}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={primaryCols.length + (hasExpandable ? 1 : 0)}
                      style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={primaryCols.length + (hasExpandable ? 1 : 0)}
                      style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                    {emptyMessage}
                  </td>
                </tr>
              ) : rows.map((row, ri) => {
                const isExpanded = expandedRow === (row.id ?? ri)
                return (
                  <React.Fragment key={row.id ?? ri}>
                    {/* Main row */}
                    <tr
                      style={{
                        background: isExpanded
                          ? `${L3}08`
                          : '#fff',
                        transition: 'background 0.1s',
                        cursor: hasExpandable ? 'pointer' : 'default',
                        borderLeft: isExpanded ? `3px solid ${L3}` : '3px solid transparent',
                      }}
                      onClick={() => hasExpandable &&
                        setExpandedRow(isExpanded ? null : (row.id ?? ri))
                      }
                    >
                      {primaryCols.map(col => (
                        <td key={col.key} style={{
                          padding: TABLE.CELL_PADDING,
                          fontSize: TABLE.CELL_SIZE,
                          color: TABLE.CELL_COLOR,
                          borderBottom: `1px solid ${TABLE.BORDER}`,
                          fontFamily: TYPE.FONT,
                          verticalAlign: 'middle',
                          textAlign: col.align || 'left',
                        }}>
                          {renderCell ? renderCell(row, col.key) : row[col.key]}
                        </td>
                      ))}
                      {/* expand toggle */}
                      {hasExpandable && (
                        <td style={{
                          padding: TABLE.CELL_PADDING,
                          borderBottom: `1px solid ${TABLE.BORDER}`,
                          textAlign: 'center', verticalAlign: 'middle',
                        }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: isExpanded ? L3 : '#f1f5f9',
                            color: isExpanded ? '#fff' : '#94a3b8',
                            display: 'inline-flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: 11,
                            transition: 'all 0.15s', cursor: 'pointer',
                            transform: isExpanded ? 'rotate(180deg)' : 'none',
                          }}>
                            ▾
                          </div>
                        </td>
                      )}
                    </tr>

                    {/* Expanded detail row */}
                    {hasExpandable && isExpanded && (
                      <tr>
                        <td
                          colSpan={primaryCols.length + 1}
                          style={{
                            padding: '12px 16px 16px 28px',
                            background: `${L3}06`,
                            borderBottom: `1px solid ${L3}22`,
                            borderLeft: `3px solid ${L3}`,
                          }}
                        >
                          {renderExpand(row)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>}

    </div>
  )
}
