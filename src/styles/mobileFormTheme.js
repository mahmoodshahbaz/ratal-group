/**
 * MOBILE FORM THEME — single source of truth
 * All 13 mobile forms pull from here.
 * To change the design: update this file only.
 *
 * Reference slides: C:\ratal-group\design\overtime\
 */

export const OT_THEME = {
  // ── Page backgrounds ──────────────────────────────────────────────
  pageBg:        '#f0ebe2',   // cream — screens 1, 2, 4, 5
  pageDark:      '#0a0a0a',   // black — screen 3 (work details)

  // ── Cards ─────────────────────────────────────────────────────────
  card:          '#fffde7',   // pale lemon yellow
  cardAlt:       '#fff8e1',   // slightly warmer yellow
  cardBorder:    '#f5e878',
  cardWhite:     '#ffffff',   // white card on dark screen

  // ── Header ────────────────────────────────────────────────────────
  headerBg:      '#000000',
  headerText:    '#ffffff',

  // ── Bottom buttons ────────────────────────────────────────────────
  btnRadius:     10,          // rectangular-rounded (NOT full pill)
  btnHeight:     48,          // px
  btnBack:       '#d32f2f',   // red
  btnNext:       '#000000',   // black
  btnNextDark:   '#ffffff',   // white (on black screen 3)
  btnSubmit:     '#2e7d32',   // green
  btnText:       '#ffffff',
  btnNextDarkText: '#000000',

  // ── Amber calc wrapper (screen 3) ─────────────────────────────────
  amber:         '#f59e0b',
  amberDeep:     '#92400e',

  // ── Text ──────────────────────────────────────────────────────────
  text:          '#111111',
  sub:           '#444444',
  muted:         '#888888',
  muteLight:     '#aaaaaa',

  // ── Read-only fields ──────────────────────────────────────────────
  ro:            '#f5f2ec',
  roBorder:      '#d4cdc2',

  // ── Status ────────────────────────────────────────────────────────
  green:         '#2e7d32',
  error:         '#d32f2f',
  peach:         '#ffcba4',
  navy:          '#1a3a5c',
}
