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
import { GROUP_COLORS, TYPE, TABLE, PAGE, btn, filterChip, searchInput } from '../styles/appStyles'

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
  // Custom table / content override
  children,
}) {
  const [expandedRow, setExpandedRow] = useState(null)

  const primaryCols   = columns.filter(c => c.primary !== false)
  const hasExpandable = !!renderExpand

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%', overflow: 'hidden',
      background: PAGE.BG,
      fontFamily: TYPE.FONT,
    }}>

      {/* H1 is now provided globally by AppShell — ChapterPage starts at H2 */}

      {/* ── KPI bar (optional) ── */}
      {kpis.length > 0 && (
        <div style={{
          display: 'flex', gap: 14, padding: '14px 28px',
          background: '#fff', borderBottom: '1px solid #e8ecf4',
          flexShrink: 0, overflowX: 'auto',
        }}>
          {kpis.map((k, i) => {
            // Vivid distinct colors per card — different from chapter header color
            const VIVID = [
              ['#1565c0','#1976d2'],  // blue
              ['#2e7d32','#388e3c'],  // green
              ['#b45309','#d97706'],  // amber
              ['#7c3aed','#8b5cf6'],  // purple
              ['#0369a1','#0284c7'],  // sky
              ['#b91c1c','#dc2626'],  // red
            ]
            const [c1, c2] = VIVID[i % VIVID.length]
            return (
              <div key={i} style={{
                background: `linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
                borderRadius: 10, padding: '11px 16px',
                boxShadow: `0 3px 12px ${c1}55`,
                minWidth: 120, flex: 1, position: 'relative', overflow: 'hidden',
              }}>
                <div style={{
                  position: 'absolute', right: 8, top: 5,
                  fontSize: 26, opacity: 0.12, color: '#fff',
                  fontFamily: TYPE.FONT,
                }}>{k.icon || '◈'}</div>
                <div style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: 0.9,
                  textTransform: 'uppercase', color: 'rgba(255,255,255,0.72)',
                  marginBottom: 3, fontFamily: TYPE.FONT,
                }}>{k.label}</div>
                <div style={{
                  fontSize: 19, fontWeight: 900, color: '#fff',
                  lineHeight: 1.1, fontFamily: TYPE.FONT,
                }}>{k.value}</div>
                {k.sub && (
                  <div style={{
                    fontSize: 10, color: 'rgba(255,255,255,0.68)', marginTop: 3,
                    fontFamily: TYPE.FONT,
                  }}>{k.sub}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Section H2 + L1 action + filters ── */}
      <div style={{
        padding: '14px 28px 10px',
        flexShrink: 0,
      }}>
        {/* H2 section title row — title left, L1 button right */}
        {(sectionTitle || onNew) && (
          <div style={{
            display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', marginBottom: 10,
          }}>
            {sectionTitle && (
              <h2 style={{
                fontSize: TYPE.H2_SIZE, fontWeight: TYPE.H2_WEIGHT,
                color: TYPE.H2_COLOR, margin: 0,
                fontFamily: TYPE.FONT,
              }}>
                {sectionTitle}
              </h2>
            )}
            {/* Level 1 button — big, module color */}
            {onNew && (
              <button onClick={onNew} style={{ ...btn.L1(chapterColor), marginLeft:'auto' }}>
                {newLabel}
              </button>
            )}
          </div>
        )}

        {/* Filter strip */}
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: 8, flexWrap: 'wrap',
        }}>
          {filters.map(f => (
            <button
              key={f}
              onClick={() => onFilter?.(f)}
              style={filterChip(f === activeFilter, chapterColor)}
            >
              {f}
            </button>
          ))}

          {/* search */}
          {onSearch !== undefined && (
            <div style={{ position: 'relative', marginLeft: 'auto' }}>
              <span style={{
                position: 'absolute', left: 10, top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 13, color: '#94a3b8', pointerEvents: 'none',
              }}>🔍</span>
              <input
                value={searchValue}
                onChange={e => onSearch(e.target.value)}
                placeholder={searchPlaceholder}
                style={searchInput}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Table OR custom children ── */}
      {children ? (
        // Custom table content (used by pages with complex rendering)
        <div style={{ flex: 1, overflow: 'hidden', padding: '0 28px 24px', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      ) : null}

      {!children && <div style={{
        flex: 1, overflow: 'hidden',
        padding: '0 28px 24px',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          flex: 1, overflow: 'auto',
          borderRadius: TABLE.RADIUS,
          boxShadow: PAGE.CARD_SHADOW,
          background: '#fff',
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
                    background: chapterColor,
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
                    background: chapterColor,
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
                          ? `${chapterColor}08`
                          : ri % 2 === 0 ? '#fff' : TABLE.ROW_ALT,
                        transition: 'background 0.1s',
                        cursor: hasExpandable ? 'pointer' : 'default',
                        borderLeft: isExpanded ? `3px solid ${chapterColor}` : '3px solid transparent',
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
                            background: isExpanded ? chapterColor : '#f1f5f9',
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
                            background: `${chapterColor}06`,
                            borderBottom: `1px solid ${chapterColor}22`,
                            borderLeft: `3px solid ${chapterColor}`,
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
