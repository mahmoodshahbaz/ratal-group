// ── Entity brand tokens ─────────────────────────────────────────────
// Used by Landing.jsx and Login.jsx to render entity-specific UI.
// These are purely visual/UX configs — actual entity assignment for a
// logged-in user comes from user_profiles.entity_code in Supabase.

export const ENTITY_BRANDS = {
  RAT: {
    code:         'RAT',
    name:         'Ratal Travels',
    sub:          'Domestic & Local Flight Solutions',
    primary:      '#0C1F3F',   // deep navy
    secondary:    '#162B52',
    accent:       '#C9A84C',   // gold
    accentLight:  '#EAD080',
    tagline1:     'Explore More.',
    tagline2:     'Experience More. Live More.',
    desc:         'Delivering seamless travel experiences with care, passion and perfection.',
    loginCaption: 'Welcome Back!',
    loginSub:     'Please sign in to your account',
    cardBg:       '#0D2B5E',
    cardBorder:   '#2979FF',
  },
  GWT: {
    code:         'GWT',
    name:         'Green Wings',
    sub:          'International Travel Solutions',
    primary:      '#0A2A18',   // dark forest green
    secondary:    '#0F3D22',
    accent:       '#4CAF50',   // leaf green
    accentLight:  '#81C784',
    tagline1:     'Fly Beyond Limits.',
    tagline2:     'Travel Beyond Dreams.',
    desc:         'Your trusted partner in global travel. Connecting you to the world with comfort, care and excellence.',
    loginCaption: 'Fly Beyond Limits',
    loginSub:     'Travel Beyond Dreams',
    cardBg:       '#0A2A18',
    cardBorder:   '#4CAF50',
  },
  ACCSYS: {
    code:         'ACCSYS',
    name:         'ACCSYS',
    sub:          'Corporate Accounting & Finance',
    primary:      '#160B2E',   // deep indigo
    secondary:    '#1F0F42',
    accent:       '#9C6DFF',   // purple
    accentLight:  '#C4A8FF',
    tagline1:     'Precision. Performance.',
    tagline2:     'Excellence.',
    desc:         'Integrated corporate accounting and financial management. Empowering your business with clarity and control.',
    loginCaption: 'Welcome Back!',
    loginSub:     'Please sign in to continue',
    cardBg:       '#1A0A2E',
    cardBorder:   '#7C4DFF',
  },
}

// Ordered list for the landing page cards
// landingName / landingSub are what the card shows - entity name inside the app is unchanged
export const ENTITY_LIST = [
  {
    ...ENTITY_BRANDS.RAT,
    landingName: 'RATAL TRAVELS',
    landingSub:  'Domestic & Local Flight Solutions',
    landingIcon: 'plane',
  },
  {
    ...ENTITY_BRANDS.GWT,
    landingName: 'GREEN WINGS',
    landingSub:  'International Travel Solutions',
    landingIcon: 'leaf',
  },
  {
    ...ENTITY_BRANDS.ACCSYS,
    landingName: 'RATAL ADVANCED TECHNOLOGIES',
    landingSub:  'Technology | Innovation | Solutions',
    landingIcon: 'hex',
  },
]
