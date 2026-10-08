/**
 * FormLanding.jsx  — /forms
 *
 * Public entry point for all field forms.
 * Reads QR token from URL or sessionStorage via useFieldAuth.
 * Shows role-filtered, eligibility-gated form cards.
 * No token → QR scan prompt screen.
 *
 * Design: mobile-first, 2-column card grid, dark header, vibrant cards.
 */

import { useState, useEffect } from 'react'
import { useNavigate }         from 'react-router-dom'
import { supabase }            from '../lib/supabase'
import {
  useFieldAuth,
  ROLE_LABELS,
  ROLE_COLORS,
}                              from '../lib/useFieldAuth'

// ── Form catalogue ────────────────────────────────────────────────────────────

const FORM_CATALOGUE = [
  {
    key:    'expense_daily',
    title:  'Daily Expense',
    titleAr:'المصروف اليومي',
    desc:   'Record fuel, hotel, food & materials',
    descAr: 'سجّل المصاريف اليومية',
    icon:   '📝',
    accent: '#1565c0',
    route:  '/forms/daily-expense',
    status: 'active',
  },
  {
    key:    'expense_claim',
    title:  'Expense Claim',
    titleAr:'مطالبة المصاريف',
    desc:   'Monthly claim — submit your recorded expenses',
    descAr: 'مطالبة شهرية بالمصاريف المسجلة',
    icon:   '🧾',
    accent: '#0277bd',
    route:  '/forms/expense-claim',
    status: 'active',
  },
  {
    key:    'food_allowance',
    title:  'Food Allowance',
    titleAr:'بدل الطعام',
    desc:   'Daily food allowance request',
    descAr: 'طلب بدل الطعام اليومي',
    icon:   '🍽️',
    accent: '#e65100',
    route:  '/forms/food-allowance',
    status: 'active',
  },
  {
    key:    'overtime',
    title:  'Overtime Request',
    titleAr:'طلب العمل الإضافي',
    desc:   'Request overtime hours approval',
    descAr: 'طلب اعتماد ساعات إضافية',
    icon:   '⏱️',
    accent: '#6a1b9a',
    route:  '/forms/overtime',
    status: 'active',
  },
  {
    key:    'site_completion',
    title:  'Site Completion',
    titleAr:'اكتمال الموقع',
    desc:   'Update milestones & site progress',
    descAr: 'تحديث نسبة اكتمال الموقع',
    icon:   '🏗️',
    accent: '#bf360c',
    route:  '/forms/site-completion',
    status: 'active',
  },
  {
    key:    'money_request',
    title:  'Money Request',
    titleAr:'طلب مالي',
    desc:   'Request cash or payment transfer',
    descAr: 'طلب صرف نقدي أو تحويل',
    icon:   '💰',
    accent: '#1b5e20',
    route:  '/forms/money-request',
    status: 'active',
  },
  {
    key:    'po_request',
    title:  'PO Request',
    titleAr:'طلب أمر شراء',
    desc:   'Request a purchase order',
    descAr: 'طلب إصدار أمر شراء',
    icon:   '📋',
    accent: '#004d40',
    route:  '/forms/po-request',
    status: 'active',
  },
  {
    key:    'field_payment',
    title:  'Field Payment',
    titleAr:'دفعة ميدانية',
    desc:   'Record cash, POS or bank transfer',
    descAr: 'تسجيل دفعة نقدية أو تحويل',
    icon:   '🏦',
    accent: '#880e4f',
    route:  '/forms/field-payment',
    status: 'active',
  },
  {
    key:    'subcon_claim',
    title:  'Sub-Con Claim',
    titleAr:'مطالبة مقاول الباطن',
    desc:   'Submit work completion & hours',
    descAr: 'تقديم إنجاز الأعمال والساعات',
    icon:   '👷',
    accent: '#33691e',
    route:  '/forms/subcon-claim',
    status: 'active',
  },
  {
    key:    'car_maintenance',
    title:  'Car Maintenance',
    titleAr:'صيانة السيارة',
    desc:   'Report maintenance or incidents',
    descAr: 'إبلاغ عن صيانة أو حادث',
    icon:   '🚗',
    accent: '#37474f',
    route:  '/forms/car-maintenance',
    status: 'active',
  },
  {
    key:    'payment_validation',
    title:  'Payment Confirmation',
    titleAr:'تأكيد استلام الدفعة',
    desc:   'Confirm receipt of advance — photo voucher',
    descAr: 'تأكيد استلام السلفة بصورة الإيصال',
    icon:   '💳',
    accent: '#2e7d32',
    route:  '/forms/payment-validation',
    status: 'active',
  },
  {
    key:    'dh_dashboard',
    title:  'Command Centre',
    titleAr:'مركز القيادة',
    desc:   'Cash · Sites · Claims · Team · Alerts',
    descAr: 'نقد · مواقع · مطالبات · فريق · تنبيهات',
    icon:   '⚡',
    accent: '#1a2540',
    route:  '/forms/dh-dashboard',
    status: 'active',
  },
]

// ── Styles ────────────────────────────────────────────────────────────────────

const css = {
  root: {
    minHeight: '100vh',
    background: '#eef2f7',
    fontFamily: 'Arial, sans-serif',
    maxWidth: 480,
    margin: '0 auto',
    position: 'relative',
  },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    background: 'linear-gradient(145deg, #1a2540 0%, #2d3a6b 60%, #1a4480 100%)',
    padding: '20px 20px 28px',
    position: 'relative',
  },
  headerTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoText: {
    fontSize: 15,
    fontWeight: 900,
    color: '#fff',
    letterSpacing: 2,
    opacity: 0.9,
  },
  notifBell: {
    position: 'relative',
    background: 'rgba(255,255,255,0.12)',
    border: 'none',
    borderRadius: 12,
    padding: '8px 12px',
    cursor: 'pointer',
    fontSize: 18,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    background: '#f44336',
    color: '#fff',
    borderRadius: '50%',
    width: 18,
    height: 18,
    fontSize: 10,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empName: {
    fontSize: 24,
    fontWeight: 900,
    color: '#fff',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  empMeta: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 12,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  empPhone: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 14,
  },
  badgeRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  badge: (bg) => ({
    background: bg || 'rgba(255,255,255,0.18)',
    color: '#fff',
    borderRadius: 20,
    padding: '4px 12px',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  }),

  // ── Greeting bar ─────────────────────────────────────────────────────────
  greeting: {
    background: '#fff',
    padding: '14px 20px',
    borderBottom: '1px solid #e8eef5',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetText: {
    fontSize: 14,
    color: '#374151',
    fontWeight: 600,
  },
  greetSub: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  langBtn: {
    background: '#f1f5f9',
    border: '1px solid #cbd5e1',
    borderRadius: 8,
    padding: '6px 14px',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    color: '#475569',
  },

  // ── Card grid ─────────────────────────────────────────────────────────────
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
    padding: 16,
  },

  // ── Form card ─────────────────────────────────────────────────────────────
  cardIconWrap: (accent) => ({
    width: 56,
    height: 56,
    borderRadius: 18,
    background: 'rgba(255,255,255,0.22)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    flexShrink: 0,
    border: '1.5px solid rgba(255,255,255,0.35)',
  }),
  card: (accent, isActive) => ({
    background: isActive
      ? `linear-gradient(145deg, ${accent}ee 0%, ${accent}bb 100%)`
      : 'linear-gradient(145deg, #94a3b8dd 0%, #64748bbb 100%)',
    borderRadius: 20,
    overflow: 'hidden',
    boxShadow: isActive
      ? `0 6px 20px ${accent}55`
      : '0 2px 8px rgba(0,0,0,0.12)',
    cursor: isActive ? 'pointer' : 'default',
    opacity: isActive ? 1 : 0.65,
    transition: 'transform 0.15s, box-shadow 0.15s',
    position: 'relative',
    textDecoration: 'none',
    display: 'block',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    minHeight: 160,
  }),
  cardAccentBar: () => ({ display: 'none' }),
  cardBody: {
    padding: '18px 16px 16px',
  },
  cardIcon: {
    fontSize: 30,
    marginBottom: 10,
    display: 'block',
    lineHeight: 1,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: '#ffffff',
    lineHeight: 1.3,
    marginBottom: 4,
    textShadow: '0 1px 3px rgba(0,0,0,0.2)',
  },
  cardDesc: {
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 1.4,
    marginBottom: 12,
  },
  cardArrow: () => ({
    fontSize: 11,
    fontWeight: 800,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  }),
  comingSoonBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    background: 'rgba(255,255,255,0.2)',
    color: 'rgba(255,255,255,0.9)',
    borderRadius: 6,
    padding: '2px 7px',
    fontSize: 9,
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    backdropFilter: 'blur(4px)',
  },

  // ── Footer ─────────────────────────────────────────────────────────────────
  footer: {
    padding: '20px 20px 40px',
    textAlign: 'center',
  },
  logoutBtn: {
    background: 'none',
    border: '1.5px solid #cbd5e1',
    borderRadius: 10,
    padding: '10px 24px',
    fontSize: 13,
    color: '#64748b',
    cursor: 'pointer',
    fontWeight: 600,
    fontFamily: 'Arial, sans-serif',
  },
  footerNote: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 12,
  },

  // ── QR scan screen ─────────────────────────────────────────────────────────
  qrScreen: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg, #1a2540 0%, #2d3a6b 50%, #1a4480 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    fontFamily: 'Arial, sans-serif',
    textAlign: 'center',
  },
  qrLogo: {
    fontSize: 15,
    fontWeight: 900,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 3,
    marginBottom: 48,
    textTransform: 'uppercase',
  },
  qrIconWrap: {
    width: 120,
    height: 120,
    background: 'rgba(255,255,255,0.08)',
    borderRadius: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 56,
    marginBottom: 32,
    border: '2px solid rgba(255,255,255,0.15)',
  },
  qrTitle: {
    fontSize: 22,
    fontWeight: 900,
    color: '#fff',
    marginBottom: 10,
  },
  qrSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 1.6,
    marginBottom: 8,
  },
  qrAr: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 40,
    direction: 'rtl',
  },
  qrHint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.35)',
    marginTop: 40,
    lineHeight: 1.7,
  },
  errorBox: {
    background: 'rgba(244,67,54,0.15)',
    border: '1px solid rgba(244,67,54,0.4)',
    borderRadius: 12,
    padding: '14px 20px',
    marginTop: 24,
    color: '#ffcdd2',
    fontSize: 13,
    lineHeight: 1.5,
    maxWidth: 300,
  },
}

// ── Error messages ────────────────────────────────────────────────────────────

const ERROR_MESSAGES = {
  invalid_token:    { en: 'This QR code is not recognised. Please request a new one from your admin.', ar: 'رمز QR غير معروف. يرجى طلب رمز جديد من المشرف.' },
  token_inactive:   { en: 'This QR code has been deactivated. Contact your admin.', ar: 'تم إلغاء تفعيل رمز QR. تواصل مع المشرف.' },
  employee_inactive:{ en: 'Your account is no longer active. Contact HR.', ar: 'حسابك غير نشط. تواصل مع الموارد البشرية.' },
}

// ── Greeting text ─────────────────────────────────────────────────────────────

function getGreeting(isAr) {
  const h = new Date().getHours()
  if (isAr) {
    if (h < 12) return 'صباح الخير'
    if (h < 17) return 'مساء الخير'
    return 'مساء النور'
  }
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// ── QR Scan Screen ─────────────────────────────────────────────────────────────

function ScanQRScreen({ error }) {
  const [lang, setLang] = useState('en')
  const isAr = lang === 'ar'
  const errMsg = error && error !== 'no_token' ? ERROR_MESSAGES[error] : null

  return (
    <div style={css.qrScreen}>
      <div style={css.qrLogo}>ACCSYS</div>

      <div style={css.qrIconWrap}>📱</div>

      <div style={css.qrTitle}>
        {isAr ? 'امسح رمز QR للمتابعة' : 'Scan Your QR Code'}
      </div>
      <div style={css.qrSubtitle}>
        {isAr
          ? 'احصل على رمز QR الخاص بك من مشرفك أو قسم الموارد البشرية'
          : 'Get your personal QR code from your supervisor or HR department'}
      </div>

      {errMsg && (
        <div style={css.errorBox}>
          {isAr ? errMsg.ar : errMsg.en}
        </div>
      )}

      <div style={css.qrHint}>
        {isAr
          ? 'كل موظف لديه رمز QR شخصي خاص به\nامسح الرمز لفتح نماذج العمل الميدانية'
          : 'Each employee has their own personal QR code\nScan it to access your field forms'}
      </div>

      <button
        style={{ ...css.logoutBtn, marginTop: 48, borderColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.5)' }}
        onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')}
      >
        {isAr ? 'English' : 'عربي'}
      </button>
    </div>
  )
}

// ── Individual Form Card ────────────────────────────────────────────────────────

function FormCard({ form, isAr, onClick }) {
  const isActive = form.status === 'active'
  const [pressed, setPressed] = useState(false)

  return (
    <div
      style={{
        ...css.card(form.accent, isActive),
        transform: pressed && isActive ? 'scale(0.96)' : 'scale(1)',
        boxShadow: pressed && isActive
          ? `0 2px 8px ${form.accent}33`
          : isActive ? `0 6px 20px ${form.accent}55` : '0 2px 8px rgba(0,0,0,0.12)',
      }}
      onPointerDown={() => isActive && setPressed(true)}
      onPointerUp={() => { setPressed(false); if (isActive) onClick() }}
      onPointerLeave={() => setPressed(false)}
    >
      {/* Decorative circle glow in corner */}
      <div style={{ position:'absolute', top:-20, right:-20, width:80, height:80, borderRadius:'50%', background:'rgba(255,255,255,0.1)', pointerEvents:'none' }} />

      <div style={css.cardBody}>
        <div style={css.cardIconWrap(form.accent)}>
          <span style={{ fontSize: 28, lineHeight: 1 }}>{form.icon}</span>
        </div>
        <div style={css.cardTitle}>
          {isAr ? form.titleAr : form.title}
        </div>
        <div style={css.cardDesc}>
          {isAr ? form.descAr : form.desc}
        </div>
        {isActive ? (
          <div style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(255,255,255,0.22)', borderRadius:8, padding:'5px 10px', width:'fit-content', border:'1px solid rgba(255,255,255,0.35)' }}>
            <span style={{ fontSize:11, fontWeight:800, color:'#fff' }}>{isAr ? '← فتح' : 'Open →'}</span>
          </div>
        ) : (
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>
            🔜 {isAr ? 'قريباً' : 'Coming soon'}
          </div>
        )}
      </div>

      {!isActive && (
        <div style={css.comingSoonBadge}>Soon</div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function FormLanding() {
  const navigate  = useNavigate()
  const auth      = useFieldAuth()
  const [lang, setLang] = useState('en')
  const [notifications, setNotifications] = useState([])
  const [showNotifs, setShowNotifs] = useState(false)

  const isAr = lang === 'ar'

  // Load recent notifications when auth resolves
  useEffect(() => {
    if (auth.employee?.id) loadNotifications()
  }, [auth.employee?.id])

  async function loadNotifications() {
    const { data } = await supabase
      .from('notifications')
      .select('id,title,message,type,created_at,is_read,amount')
      .eq('employee_id', auth.employee.id)
      .order('created_at', { ascending: false })
      .limit(10)
    setNotifications(data || [])
  }

  async function markAllRead() {
    if (!auth.employee?.id) return
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('employee_id', auth.employee.id)
      .eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (auth.loading) {
    return (
      <div style={{ ...css.qrScreen }}>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        <div style={css.qrLogo}>ACCSYS</div>
        <div style={{ width: 56, height: 56, border: '4px solid rgba(255,255,255,0.15)', borderTop: '4px solid rgba(255,255,255,0.8)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 24 }} />
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>
          {isAr ? 'جاري التحقق…' : 'Verifying your identity…'}
        </div>
      </div>
    )
  }

  // ── No token / error ─────────────────────────────────────────────────────
  if (!auth.employee) {
    return <ScanQRScreen error={auth.error} />
  }

  const emp        = auth.employee
  const role       = auth.role
  const roleLabel  = ROLE_LABELS[role] || role
  const roleColor  = ROLE_COLORS[role] || '#37474f'
  const unread     = notifications.filter(n => !n.is_read).length

  // Filter catalogue to what this role + eligibility allows
  const visibleForms = FORM_CATALOGUE.filter(f =>
    auth.allowedForms.includes(f.key)
  )

  const greeting = getGreeting(isAr)
  const firstName = (emp.full_name_en || '').split(' ')[0]

  return (
    <div style={css.root} dir={isAr ? 'rtl' : 'ltr'}>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div style={css.header}>
        {/* Top bar: logo + notification bell */}
        <div style={css.headerTop}>
          <div style={css.logoText}>ACCSYS</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              style={{ ...css.langBtn, background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}
              onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')}
            >
              {isAr ? 'EN' : 'عربي'}
            </button>
            <button
              style={css.notifBell}
              onClick={() => { setShowNotifs(s => !s); if (!showNotifs) markAllRead() }}
            >
              🔔
              {unread > 0 && (
                <span style={css.notifBadge}>{unread > 9 ? '9+' : unread}</span>
              )}
            </button>
          </div>
        </div>

        {/* Employee identity */}
        <div style={css.empName}>
          {isAr ? (emp.full_name_ar || emp.full_name_en) : emp.full_name_en}
        </div>
        <div style={css.empMeta}>
          <span>🏢</span>
          <span>
            {emp.department?.dept_code
              ? `${emp.department.dept_code} — ${emp.department.dept_name}`
              : (emp.designation || emp.job_title || '')}
          </span>
        </div>
        {(emp.mobile_number || emp.phone_number) && (
          <div style={css.empPhone}>
            📱 {emp.mobile_number || emp.phone_number}
          </div>
        )}
        <div style={css.badgeRow}>
          <span style={css.badge(roleColor)}>{roleLabel}</span>
          <span style={css.badge('rgba(255,255,255,0.15)')}>
            {isAr
              ? (auth.employmentType === 'STAFF' ? 'موظف' : auth.employmentType === 'OUTSOURCED' ? 'خارجي' : 'مقاول')
              : auth.employmentType}
          </span>
          {auth.assignments.length > 0 && (
            <span style={css.badge('rgba(255,255,255,0.12)')}>
              {auth.assignments.length} {isAr ? 'موقع' : 'site(s)'}
            </span>
          )}
        </div>
      </div>

      {/* ── NOTIFICATION PANEL ─────────────────────────────────────────── */}
      {showNotifs && (
        <div style={{
          background: '#fff',
          borderBottom: '1px solid #e8eef5',
          maxHeight: 280,
          overflowY: 'auto',
        }}>
          {notifications.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              {isAr ? 'لا توجد إشعارات' : 'No notifications yet'}
            </div>
          ) : (
            notifications.map(n => (
              <div key={n.id} style={{
                padding: '12px 16px',
                borderBottom: '1px solid #f1f5f9',
                background: n.is_read ? '#fff' : '#f0f9ff',
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>
                  {n.type?.includes('SALARY') ? '💵'
                    : n.type?.includes('PAYMENT') ? '✅'
                    : n.type?.includes('EXPENSE') ? '🧾'
                    : n.type?.includes('CAR') ? '🚗'
                    : '🔔'}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>
                    {n.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                    {n.message}
                  </div>
                  {n.amount && (
                    <div style={{ fontSize: 13, fontWeight: 800, color: '#1565c0', marginTop: 4 }}>
                      SAR {parseFloat(n.amount).toLocaleString('en-SA', { minimumFractionDigits: 2 })}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
                    {new Date(n.created_at).toLocaleDateString('en-SA', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── GREETING BAR ───────────────────────────────────────────────── */}
      <div style={css.greeting}>
        <div>
          <div style={css.greetText}>
            {greeting}, {firstName} 👋
          </div>
          <div style={css.greetSub}>
            {isAr ? 'ماذا تريد أن تفعل اليوم؟' : 'What would you like to do today?'}
          </div>
        </div>
        <div style={{
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: 10,
          padding: '6px 12px',
          fontSize: 11,
          color: '#64748b',
          textAlign: 'center',
          minWidth: 70,
        }}>
          <div style={{ fontWeight: 800, color: '#1e293b', fontSize: 13 }}>
            {new Date().toLocaleDateString('en-SA', { day: 'numeric', month: 'short' })}
          </div>
          <div>{new Date().toLocaleDateString('en-SA', { weekday: 'short' })}</div>
        </div>
      </div>

      {/* ── SITE ASSIGNMENTS STRIP ─────────────────────────────────────── */}
      {auth.assignments.length > 0 && (
        <div style={{
          background: '#fff7ed',
          borderBottom: '1px solid #fed7aa',
          padding: '10px 16px',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#92400e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            📍 {isAr ? 'مواقعك المخصصة' : 'Your Active Sites'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {auth.assignments.map(a => (
              <div key={a.id} style={{
                background: '#fff',
                border: '1.5px solid #fed7aa',
                borderRadius: 10,
                padding: '6px 12px',
                fontSize: 12,
                display: 'inline-flex',
                flexDirection: 'column',
                gap: 2,
                flexShrink: 0,
              }}>
                <span style={{ fontWeight: 800, color: '#92400e' }}>
                  {a.site_number || a.project?.project_number || '—'}
                </span>
                <span style={{ fontSize: 10, color: '#b45309' }}>
                  {a.project?.project_name?.slice(0, 20) || a.site_name?.slice(0, 20) || ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── FORM CARDS GRID ────────────────────────────────────────────── */}
      <div style={css.grid}>
        {visibleForms.map(form => (
          <FormCard
            key={form.key}
            form={form}
            isAr={isAr}
            onClick={() => navigate(form.route)}
          />
        ))}
      </div>

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <div style={css.footer}>
        <button style={css.logoutBtn} onClick={auth.logout}>
          🔄 {isAr ? 'تغيير المستخدم' : 'Switch User'}
        </button>
        <div style={css.footerNote}>
          {isAr
            ? 'امسح رمز QR الخاص بك مرة أخرى لإعادة تسجيل الدخول'
            : 'Scan your QR code again to log back in'}
        </div>
      </div>

    </div>
  )
}
