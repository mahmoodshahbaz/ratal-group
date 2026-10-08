/**
 * appStyles.js — Master Design Tokens
 * Single source of truth for the entire ACCSYS application.
 * ALL components import from here. No hardcoded colors or sizes anywhere else.
 *
 * Chapter colors follow the Module = Chapter rule:
 *   every page inside a chapter uses that chapter's color for:
 *   KPI card accents, table header, form 6-layer design, filter chip active state,
 *   primary buttons, and the form banner accent block.
 *
 * 8 chapters defined in PDF "8 Template Design with Chapters":
 *   Ch01 Operations | Ch02 Masters | Ch03 Administration | Ch04 Finance
 *   Ch05 Reports    | Ch06 Planning | Ch07 Accounting    | Ch08 Human Resources
 *
 * L3 (accent) = primary button = table header = filter chip active
 * L1 (muted)  = outer modal frame
 * L2 (tint)   = inner modal background, KPI card background
 */

// ─────────────────────────────────────────────
// CHAPTER PALETTES  (3-tier per chapter, from PDF spec)
// L3 = accent/primary (button, table header, active chips)
// L1 = muted outer frame (modal Layer 1)
// L2 = light tint (modal Layer 2, KPI card BG)
// ─────────────────────────────────────────────
export const CHAPTER_PALETTES = {
  Operations:     { L1: '#70A5A6', L2: '#EAF3F2', L3: '#0079BC' },
  Masters:        { L1: '#C8B48F', L2: '#FAF5E9', L3: '#8C601B' },
  Administration: { L1: '#AAAED0', L2: '#F0F1FA', L3: '#454D9B' },
  Finance:        { L1: '#C1A1A9', L2: '#FAF0F2', L3: '#8C354B' },
  Reports:        { L1: '#B8A5CF', L2: '#F5EFFA', L3: '#7444A3' },
  Planning:       { L1: '#CDA5B2', L2: '#FFF1F5', L3: '#AF3564' },
  Accounting:     { L1: '#B4BA95', L2: '#F5F6EB', L3: '#606D2C' },
  HR:             { L1: '#BCA99A', L2: '#F7F2ED', L3: '#795338' },
  Main:           { L1: '#8fa5ad', L2: '#eef3f5', L3: '#546e7a' },
}

// ─────────────────────────────────────────────
// CHAPTER COLORS  (L3 shorthand — use as MC on every page)
// ─────────────────────────────────────────────
export const GROUP_COLORS = {
  Main:           CHAPTER_PALETTES.Main.L3,           // #546e7a
  Operations:     CHAPTER_PALETTES.Operations.L3,     // #0079BC
  Masters:        CHAPTER_PALETTES.Masters.L3,         // #8C601B
  Administration: CHAPTER_PALETTES.Administration.L3, // #454D9B
  Finance:        CHAPTER_PALETTES.Finance.L3,         // #8C354B
  Reports:        CHAPTER_PALETTES.Reports.L3,         // #7444A3
  Planning:       CHAPTER_PALETTES.Planning.L3,        // #AF3564
  Accounting:     CHAPTER_PALETTES.Accounting.L3,      // #606D2C
  HR:             CHAPTER_PALETTES.HR.L3,              // #795338
}

// Chapter emoji  (used in page H1 headers and Step 0 banners)
export const GROUP_ICONS = {
  Main:           '🏢',
  Travel:         '✈️',
  Operations:     '🏗️',
  Masters:        '📚',
  Finance:        '💳',
  Accounting:     '📊',
  Reports:        '📈',
  Planning:       '📅',
  HR:             '👥',
  Administration: '⚙️',
}

// Per-form meaningful emoji  (Step 0 right panel icon)
export const FORM_ICONS = {
  // Finance
  invoice:          '🧾',
  incomingPO:       '📋',
  outgoingPO:       '📦',
  moneyRequest:     '💰',
  paymentReceipt:   '✅',
  fieldPayment:     '💵',
  // HR
  employee:         '👤',
  leave:            '🏖️',
  expenseClaim:     '🧳',
  offboarding:      '🚪',
  salarySlip:       '📄',
  // Operations
  project:          '🏗️',
  subConClaim:      '🤝',
  dailyExpense:     '📝',
  siteCompletion:   '🏁',
  fieldPaymentForm: '💵',
  // Fleet
  vehicle:          '🚙',
  fleetAssignment:  '🔑',
  // Masters
  party:            '🏬',
  contractor:       '🦺',
  documentVault:    '🗄️',
  jobType:          '🔧',
  // Travel
  travelRequest:    '🌍',
  ticketBooking:    '🎫',
  // Administration
  userManagement:   '🔐',
  template:         '📑',
}


// ─────────────────────────────────────────────
// FORM DIMENSIONS  (locked — consistent across every modal)
// ─────────────────────────────────────────────
export const FORM = {
  WIDTH:          960,   // total modal width  (px)
  SIDEBAR_WIDTH:  260,   // left info panel width  (form sidebar, NOT app nav)
  PANEL_PADDING:  20,    // right panel inner padding
  INPUT_HEIGHT:   36,    // all text inputs, selects, date pickers
  INPUT_RADIUS:   8,     // border-radius for inputs
  INPUT_BORDER:   '1.5px solid #e2e8f0',
  INPUT_FOCUS:    '1.5px solid #94a3b8',
  SECTION_GAP:    16,    // vertical gap between field-group sections
  FIELD_GAP:      12,    // vertical gap between individual field rows
  // L3 accent block dimensions (proportional from 1280×960 spec)
  ACCENT_W:       220,   // accent block width  (right side)
  ACCENT_H:       185,   // accent block height (top portion)
  // L4 card top margin (clears the accent block)
  CARD_TOP:       56,    // px — space between L2 top and L4 card top edge
}


// ─────────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────────
export const TYPE = {
  FONT:            "'Poppins', sans-serif",
  // field labels  (UPPERCASE caps above every input)
  LABEL_SIZE:      '9px',
  LABEL_WEIGHT:    800,
  LABEL_COLOR:     '#94a3b8',
  LABEL_SPACING:   '0.8px',
  // inputs
  INPUT_SIZE:      '12px',
  INPUT_COLOR:     '#1e293b',
  INPUT_WEIGHT:    500,
  // section dividers  (──── PERSONAL INFO ────)
  SECTION_SIZE:    '9px',
  SECTION_WEIGHT:  800,
  SECTION_COLOR:   '#cbd5e1',
  SECTION_SPACING: '1.5px',
  // page H1 (chapter name)
  H1_SIZE:         '24px',
  H1_WEIGHT:       900,
  H1_COLOR:        '#1e293b',
  // page H2 (subcategory / table title)
  H2_SIZE:         '20px',
  H2_WEIGHT:       700,
  H2_COLOR:        '#334155',
}


// ─────────────────────────────────────────────
// BUTTON STYLES  (3 levels — import and call)
// ─────────────────────────────────────────────
/**
 * Level 1 — Main page trigger  (+ New Invoice, + Add Employee)
 *   Large, filled, module color. One per page, top-right.
 *
 * Level 2 — Form progression  (Save & Next, Submit)
 *   Medium, filled, module color. Inside wizard footer only.
 *
 * Level 3 — Navigation / Escape  (Back, Cancel, Close)
 *   Always gray background, dark text. No exceptions. No module color.
 */
export const btn = {
  L1: (color) => ({
    padding: '10px 22px',
    background: color,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 700,
    fontFamily: "'Poppins', sans-serif",
    cursor: 'pointer',
    boxShadow: `0 4px 14px rgba(0,0,0,0.16)`,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    letterSpacing: '-0.1px',
    whiteSpace: 'nowrap',
  }),
  L2: (color) => ({
    padding: '9px 22px',
    background: color,
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "'Poppins', sans-serif",
    cursor: 'pointer',
    boxShadow: '0 3px 10px rgba(0,0,0,0.13)',
    whiteSpace: 'nowrap',
  }),
  L3: {
    padding: '9px 22px',
    background: '#f1f5f9',
    color: '#475569',
    border: 'none',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    fontFamily: "'Poppins', sans-serif",
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  // Icon-only (close X, expand ⋯, delete trash)
  ICON: {
    width: 30, height: 30,
    borderRadius: '50%',
    background: '#f1f5f9',
    border: 'none',
    fontSize: 13, color: '#64748b',
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Poppins', sans-serif",
    flexShrink: 0,
  },
}


// ─────────────────────────────────────────────
// GLOBAL TEXT COLORS  (same across all chapters)
// ─────────────────────────────────────────────
export const MAIN_TEXT      = '#172D37'   // titles and labels
export const SECONDARY_TEXT = '#53666F'   // supporting text / descriptions

// ─────────────────────────────────────────────
// 6-LAYER DESIGN SYSTEM  (universal form palette)
// ─────────────────────────────────────────────
/**
 * Returns the precomputed 3-layer palette for any chapter's MC (L3) hex.
 * Falls back to arithmetic derivation for any color not in CHAPTER_PALETTES.
 */
export function getChapterPalette(mc) {
  // Look up precomputed palette by L3 value
  const found = Object.values(CHAPTER_PALETTES).find(p => p.L3 === mc)
  if (found) return found
  // Arithmetic fallback for unlisted colors
  const r = parseInt(mc.slice(1,3), 16)
  const g = parseInt(mc.slice(3,5), 16)
  const b = parseInt(mc.slice(5,7), 16)
  const hex = n => Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0')
  const L1 = '#' + hex((r+136)/2) + hex((g+136)/2) + hex((b+136)/2)
  const L2 = '#' + hex(255 - 0.08*(255-r)) + hex(255 - 0.08*(255-g)) + hex(255 - 0.08*(255-b))
  return { L1, L2, L3: mc }
}

/** Universal Back / Cancel button colour — same across ALL chapters (Layer 5). */
export const BACK_BTN_COLOR = '#747474'


// ─────────────────────────────────────────────
// SHARED INPUT STYLE  (use on every <input> <select> <textarea>)
// ─────────────────────────────────────────────
export const inputStyle = {
  height: FORM.INPUT_HEIGHT,
  border: FORM.INPUT_BORDER,
  borderRadius: FORM.INPUT_RADIUS,
  padding: '0 12px',
  fontSize: 12,
  fontWeight: 500,
  color: TYPE.INPUT_COLOR,
  fontFamily: TYPE.FONT,
  outline: 'none',
  width: '100%',
  background: '#fff',
  boxSizing: 'border-box',
}

export const textareaStyle = {
  ...inputStyle,
  height: 72,
  padding: '8px 12px',
  resize: 'vertical',
  lineHeight: 1.5,
}

export const labelStyle = {
  fontSize: TYPE.LABEL_SIZE,
  fontWeight: TYPE.LABEL_WEIGHT,
  color: TYPE.LABEL_COLOR,
  textTransform: 'uppercase',
  letterSpacing: TYPE.LABEL_SPACING,
  marginBottom: 4,
  display: 'block',
  fontFamily: TYPE.FONT,
}

// Section divider  (horizontal rule + uppercase label)
export const sectionLabel = {
  fontSize: TYPE.SECTION_SIZE,
  fontWeight: TYPE.SECTION_WEIGHT,
  color: TYPE.SECTION_COLOR,
  textTransform: 'uppercase',
  letterSpacing: TYPE.SECTION_SPACING,
  borderBottom: '1px solid #f1f5f9',
  paddingBottom: 6,
  marginBottom: 14,
  marginTop: 6,
  fontFamily: TYPE.FONT,
}

// Field row grid helpers
export const fieldRow = (cols = 2) => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${cols}, 1fr)`,
  gap: FORM.FIELD_GAP,
  marginBottom: FORM.FIELD_GAP,
})


// ─────────────────────────────────────────────
// TABLE STYLES
// ─────────────────────────────────────────────
export const TABLE = {
  HEADER_BG:       '#1e293b',
  HEADER_COLOR:    '#fff',
  HEADER_SIZE:     '9px',
  HEADER_WEIGHT:   700,
  HEADER_SPACING:  '0.8px',
  ROW_HOVER:       '#f8fafc',
  ROW_ALT:         '#fafafa',
  BORDER:          '#f1f5f9',
  CELL_SIZE:       '12px',
  CELL_COLOR:      '#334155',
  CELL_PADDING:    '10px 14px',
  CELL_PADDING_SM: '8px 10px',
  RADIUS:          12,
  // Sticky header z-index
  STICKY_Z:        5,
}

export const thStyle = {
  background: TABLE.HEADER_BG,
  color: TABLE.HEADER_COLOR,
  fontSize: TABLE.HEADER_SIZE,
  fontWeight: TABLE.HEADER_WEIGHT,
  letterSpacing: TABLE.HEADER_SPACING,
  textTransform: 'uppercase',
  padding: TABLE.CELL_PADDING,
  textAlign: 'left',
  position: 'sticky',
  top: 0,
  zIndex: TABLE.STICKY_Z,
  fontFamily: TYPE.FONT,
  whiteSpace: 'nowrap',
}

/**
 * Chapter-colored table header — use this instead of thStyle on all list pages.
 * thStyleFor(MC)  →  same as thStyle but with the chapter's L3 as background.
 */
export const thStyleFor = (mc) => ({ ...thStyle, background: mc })

export const tdStyle = {
  padding: TABLE.CELL_PADDING,
  fontSize: TABLE.CELL_SIZE,
  color: TABLE.CELL_COLOR,
  borderBottom: `1px solid ${TABLE.BORDER}`,
  fontFamily: TYPE.FONT,
  verticalAlign: 'middle',
}


// ─────────────────────────────────────────────
// STATUS BADGES  (universal color coding)
// ─────────────────────────────────────────────
export const STATUS = {
  // Green — positive / approved / paid / active
  APPROVED:  { bg: '#dcfce7', color: '#166534', label: 'Approved' },
  PAID:      { bg: '#dcfce7', color: '#166534', label: 'Paid' },
  ACTIVE:    { bg: '#dcfce7', color: '#166534', label: 'Active' },
  COMPLETED: { bg: '#dcfce7', color: '#166534', label: 'Completed' },
  // Amber — pending / under review
  PENDING:   { bg: '#fef9c3', color: '#854d0e', label: 'Pending' },
  REVIEW:    { bg: '#fef9c3', color: '#854d0e', label: 'Under Review' },
  PARTIAL:   { bg: '#fef9c3', color: '#854d0e', label: 'Partial' },
  // Blue — issued / in progress
  ISSUED:    { bg: '#dbeafe', color: '#1e40af', label: 'Issued' },
  IN_PROG:   { bg: '#dbeafe', color: '#1e40af', label: 'In Progress' },
  // Purple — partial payment / mixed
  POSTED:    { bg: '#ede9fe', color: '#5b21b6', label: 'Posted' },
  // Red — rejected / overdue / urgent
  REJECTED:  { bg: '#fee2e2', color: '#991b1b', label: 'Rejected' },
  OVERDUE:   { bg: '#fee2e2', color: '#991b1b', label: 'Overdue' },
  CANCELLED: { bg: '#fee2e2', color: '#991b1b', label: 'Cancelled' },
  // Gray — draft / inactive
  DRAFT:     { bg: '#f1f5f9', color: '#475569', label: 'Draft' },
  INACTIVE:  { bg: '#f1f5f9', color: '#94a3b8', label: 'Inactive' },
}

// Helper: render a status badge
export function statusBadge(key) {
  const s = STATUS[key?.toUpperCase()] || STATUS.DRAFT
  return {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 20,
    fontSize: 10,
    fontWeight: 700,
    background: s.bg,
    color: s.color,
    fontFamily: TYPE.FONT,
    whiteSpace: 'nowrap',
    letterSpacing: '0.3px',
  }
}


// ─────────────────────────────────────────────
// PAGE LAYOUT  (list pages)
// ─────────────────────────────────────────────
export const PAGE = {
  PADDING:     '24px 28px',
  BG:          '#f0f2f5',
  CARD_RADIUS: 14,
  CARD_SHADOW: '0 2px 12px rgba(0,0,0,0.06)',
  CARD_BG:     '#fff',
}

/**
 * KPI card — chapter-aware.
 * kpiCard(MC)           → white card with L3 top-border accent
 * kpiCard(MC, L2)       → L2-tinted card with L3 top-border (subtle chapter wash)
 */
export const kpiCard = (accentColor, lightBg) => ({
  background: lightBg || '#fff',
  borderRadius: 12,
  padding: '14px 16px',
  borderTop: `3px solid ${accentColor}`,
  boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
  minWidth: 140,
  flex: 1,
})


// ─────────────────────────────────────────────
// FILTER CHIP  (above tables)
// ─────────────────────────────────────────────
export const filterChip = (active, color) => ({
  padding: '5px 14px',
  borderRadius: 20,
  border: active ? `1.5px solid ${color}` : '1.5px solid #e2e8f0',
  background: active ? color : '#fff',
  color: active ? '#fff' : '#64748b',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: TYPE.FONT,
  whiteSpace: 'nowrap',
  transition: 'all 0.15s',
})

export const searchInput = {
  height: 34,
  border: '1.5px solid #e2e8f0',
  borderRadius: 8,
  padding: '0 12px 0 32px',
  fontSize: 12,
  color: '#334155',
  fontFamily: TYPE.FONT,
  outline: 'none',
  background: '#fff',
  minWidth: 200,
}
