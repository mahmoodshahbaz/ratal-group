/**
 * FormLanding.jsx  — /forms
 *
 * Public entry point for all field workers.
 * Reads QR token from URL or sessionStorage via useFieldAuth.
 *
 * Screens / Nav tabs:
 *   'home'          — cream: user info card + inbox summary + sites
 *   'inbox'         — dark:  overview panel (notifications/alerts/confirmations)
 *   'notifs'        — dark:  full notification list (sub-view of inbox)
 *   'confirmations' — light: pending confirmations (sub-view of inbox)
 *   'forms'         — dark:  form grid with Daily Expenses hero tile
 *
 * No token → QR scan prompt screen.
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate }                       from 'react-router-dom'
import { supabase }                          from '../lib/supabase'
import { useFieldAuth, ROLE_LABELS, ROLE_COLORS } from '../lib/useFieldAuth'
import { MP }                                from './formTheme'

// ── Form catalogue ─────────────────────────────────────────────────────────────
const FORM_CATALOGUE = [
  {
    key:    'expense_daily',
    title:  'Daily Expense',
    titleAr:'المصروف اليومي',
    desc:   'Record fuel, hotel, food & materials',
    descAr: 'سجّل المصاريف اليومية',
    icon:   '📝',
    accent: MP.yellow,
    accentText: MP.textDark,
    hero:   true,
    route:  '/forms/daily-expense',
  },
  {
    key:    'expense_claim',
    title:  'Expense Claim',
    titleAr:'مطالبة المصاريف',
    desc:   'Monthly claim',
    descAr: 'مطالبة شهرية',
    icon:   '🧾',
    accent: '#3B6FE8',
    route:  '/forms/expense-claim',
  },
  {
    key:    'food_allowance',
    title:  'Food Allowance',
    titleAr:'بدل الطعام',
    desc:   'Daily food allowance',
    descAr: 'بدل طعام يومي',
    icon:   '🍽️',
    accent: '#E07A5F',
    route:  '/forms/food-allowance',
  },
  {
    key:    'overtime',
    title:  'Overtime',
    titleAr:'عمل إضافي',
    desc:   'Request overtime approval',
    descAr: 'طلب اعتماد إضافي',
    icon:   '⏱️',
    accent: '#9B72CF',
    route:  '/forms/overtime',
  },
  {
    key:    'site_completion',
    title:  'Site Completion',
    titleAr:'اكتمال الموقع',
    desc:   'Update milestones',
    descAr: 'تحديث نسبة الاكتمال',
    icon:   '🏗️',
    accent: '#D4763B',
    route:  '/forms/site-completion',
  },
  {
    key:    'money_request',
    title:  'Money Request',
    titleAr:'طلب مالي',
    desc:   'Cash or transfer',
    descAr: 'طلب صرف أو تحويل',
    icon:   '💰',
    accent: '#4CAF82',
    route:  '/forms/money-request',
  },
  {
    key:    'po_request',
    title:  'PO Request',
    titleAr:'طلب أمر شراء',
    desc:   'Request a purchase order',
    descAr: 'طلب إصدار أمر شراء',
    icon:   '📋',
    accent: '#2D9CDB',
    route:  '/forms/po-request',
  },
  {
    key:    'field_payment',
    title:  'Field Payment',
    titleAr:'دفعة ميدانية',
    desc:   'Cash, POS or transfer',
    descAr: 'دفعة نقدية أو تحويل',
    icon:   '🏦',
    accent: '#C06B9A',
    route:  '/forms/field-payment',
  },
  {
    key:    'subcon_claim',
    title:  'Sub-Con Claim',
    titleAr:'مطالبة مقاول الباطن',
    desc:   'Work completion & hours',
    descAr: 'إنجاز الأعمال والساعات',
    icon:   '👷',
    accent: '#5E9E5A',
    route:  '/forms/subcon-claim',
  },
  {
    key:    'car_maintenance',
    title:  'Car Maintenance',
    titleAr:'صيانة السيارة',
    desc:   'Maintenance or incidents',
    descAr: 'صيانة أو حادث',
    icon:   '🚗',
    accent: '#607D8B',
    route:  '/forms/car-maintenance',
  },
  {
    key:    'payment_validation',
    title:  'Payment Confirm',
    titleAr:'تأكيد الدفعة',
    desc:   'Confirm advance receipt',
    descAr: 'تأكيد استلام السلفة',
    icon:   '💳',
    accent: '#43A047',
    route:  '/forms/payment-validation',
  },
  {
    key:    'payment_confirm',
    title:  'Field Receipt',
    titleAr:'استلام الدفعة الميدانية',
    desc:   'Confirm field disbursement',
    descAr: 'تأكيد استلام المبلغ',
    icon:   '✅',
    accent: '#1D6FA8',
    route:  '/forms/payment-confirm',
  },
  {
    key:    'cash_payment',
    title:  'Cash Voucher',
    titleAr:'سند صرف نقدي',
    desc:   'Record a cash payment',
    descAr: 'تسجيل دفعة نقدية',
    icon:   '💵',
    accent: '#8C354B',
    route:  '/forms/cash-payment',
  },
  {
    key:    'dh_dashboard',
    title:  'Command Centre',
    titleAr:'مركز القيادة',
    desc:   'Cash · Sites · Claims · Team',
    descAr: 'نقد · مواقع · مطالبات · فريق',
    icon:   '⚡',
    accent: '#374151',
    route:  '/forms/dh-dashboard',
  },
]

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt      = n => parseFloat(n || 0).toLocaleString('en-SA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtGate  = n => Number(n || 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate  = d => d ? new Date(d).toLocaleDateString('en-SA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const fmtShort = d => d ? new Date(d).toLocaleDateString('en-SA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const initials = name => (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

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

const ERROR_MESSAGES = {
  invalid_token:    { en: 'This QR code is not recognised. Please request a new one from your admin.', ar: 'رمز QR غير معروف. يرجى طلب رمز جديد من المشرف.' },
  token_inactive:   { en: 'This QR code has been deactivated. Contact your admin.', ar: 'تم إلغاء تفعيل رمز QR. تواصل مع المشرف.' },
  employee_inactive:{ en: 'Your account is no longer active. Contact HR.', ar: 'حسابك غير نشط. تواصل مع الموارد البشرية.' },
}

// ── Shared bottom nav ─────────────────────────────────────────────────────────
function BottomNav({ current, onHome, onInbox, onForms, unreadCount, isAr }) {
  const isDark = current === 'inbox' || current === 'notifs' || current === 'forms'
  const navBg     = isDark ? MP.charcoal : MP.cream
  const borderClr = isDark ? '#2D302A'  : '#E4E0D3'
  const inactiveColor = isDark ? MP.textMutedDark : MP.textMutedLight

  const tabs = [
    { key: 'home',  icon: '🏠', label: isAr ? 'الرئيسية' : 'Home',  action: onHome },
    { key: 'inbox', icon: '📥', label: isAr ? 'الوارد'   : 'Inbox', action: onInbox, badge: unreadCount },
    { key: 'forms', icon: '📋', label: isAr ? 'النماذج'  : 'Forms', action: onForms },
  ]

  const activeKey = (current === 'notifs' || current === 'confirmations') ? 'inbox' : current

  return (
    <div style={{
      position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 480,
      background: navBg, borderTop: `1px solid ${borderClr}`,
      display: 'flex', paddingBottom: 'env(safe-area-inset-bottom, 10px)',
      zIndex: 100,
    }}>
      {tabs.map(tab => {
        const active = activeKey === tab.key
        return (
          <button key={tab.key} onClick={tab.action} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 3, padding: '10px 0 6px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            position: 'relative',
          }}>
            {/* Active pill indicator */}
            {active && (
              <div style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                width: 32, height: 3, background: MP.yellow, borderRadius: '0 0 4px 4px',
              }} />
            )}
            <div style={{
              fontSize: 18,
              background: active ? MP.yellow + '22' : 'transparent',
              borderRadius: 10, width: 36, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative',
            }}>
              {tab.icon}
              {tab.badge > 0 && (
                <div style={{
                  position: 'absolute', top: 0, right: -2,
                  background: MP.yellow, color: MP.textDark,
                  borderRadius: 10, minWidth: 16, height: 16, fontSize: 10, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 4px', fontFamily: MP.font,
                }}>
                  {tab.badge > 99 ? '99+' : tab.badge}
                </div>
              )}
            </div>
            <div style={{
              fontSize: 11, fontWeight: active ? 700 : 500,
              color: active ? (isDark ? MP.textOnDark : MP.textDark) : inactiveColor,
              fontFamily: MP.font,
            }}>
              {tab.label}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Scan QR screen ────────────────────────────────────────────────────────────
function ScanQRScreen({ error, debugError }) {
  const [lang, setLang] = useState('en')
  const isAr   = lang === 'ar'
  const errMsg = error && error !== 'no_token' ? ERROR_MESSAGES[error] : null

  return (
    <div style={{
      minHeight: '100vh', background: MP.charcoal,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 32, fontFamily: MP.font, textAlign: 'center',
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: MP.textMutedDark, letterSpacing: 3, marginBottom: 48, textTransform: 'uppercase' }}>
        ACCSYS
      </div>
      <div style={{
        width: 110, height: 110,
        background: 'rgba(247,210,99,0.08)',
        borderRadius: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 52, marginBottom: 32,
        border: `1.5px solid rgba(247,210,99,0.25)`,
      }}>
        📱
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: MP.textOnDark, marginBottom: 10, fontFamily: MP.font }}>
        {isAr ? 'امسح رمز QR للمتابعة' : 'Scan Your QR Code'}
      </div>
      <div style={{ fontSize: 14, color: MP.textMutedDark, lineHeight: 1.6, marginBottom: 8, maxWidth: 300 }}>
        {isAr
          ? 'احصل على رمز QR الخاص بك من مشرفك أو قسم الموارد البشرية'
          : 'Get your personal QR code from your supervisor or HR department'}
      </div>
      {errMsg && (
        <div style={{ background: 'rgba(220,50,50,0.12)', border: '1px solid rgba(220,50,50,0.3)', borderRadius: 12, padding: '14px 20px', marginTop: 24, color: '#F5A5A0', fontSize: 13, lineHeight: 1.5, maxWidth: 300, fontFamily: MP.font }}>
          {isAr ? errMsg.ar : errMsg.en}
        </div>
      )}
      {debugError && (
        <div style={{ background: 'rgba(247,210,99,0.1)', border: '1px solid rgba(247,210,99,0.3)', borderRadius: 10, padding: '10px 16px', marginTop: 12, color: MP.textOnDark, fontSize: 11, lineHeight: 1.5, maxWidth: 320, wordBreak: 'break-all', textAlign: 'left', fontFamily: MP.font }}>
          <strong style={{ color: MP.yellow }}>DEBUG:</strong> {debugError}
        </div>
      )}
      <div style={{ fontSize: 12, color: MP.textMutedDark, marginTop: 40, lineHeight: 1.7, fontFamily: MP.font }}>
        {isAr ? 'كل موظف لديه رمز QR شخصي خاص به' : 'Each employee has their own personal QR code'}
      </div>
      <button
        style={{ marginTop: 48, background: 'transparent', border: `1.5px solid ${MP.textMutedDark}`, borderRadius: 20, padding: '10px 24px', fontSize: 13, color: MP.textMutedDark, cursor: 'pointer', fontWeight: 600, fontFamily: MP.font }}
        onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')}
      >
        {isAr ? 'English' : 'عربي'}
      </button>
    </div>
  )
}

// ── Loading spinner ───────────────────────────────────────────────────────────
function LoadingScreen({ msg }) {
  return (
    <div style={{ minHeight: '100vh', background: MP.charcoal, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: MP.font }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontSize: 13, fontWeight: 700, color: MP.textMutedDark, letterSpacing: 3, marginBottom: 40, textTransform: 'uppercase' }}>ACCSYS</div>
      <div style={{ width: 48, height: 48, border: `3px solid rgba(247,210,99,0.2)`, borderTop: `3px solid ${MP.yellow}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 20 }} />
      <div style={{ color: MP.textMutedDark, fontSize: 14 }}>{msg || 'Loading…'}</div>
    </div>
  )
}

// ── Hero form card (Daily Expenses — full width) ──────────────────────────────
function HeroCard({ form, isAr, onClick }) {
  const [pressed, setPressed] = useState(false)
  return (
    <div
      style={{
        background: MP.yellow,
        borderRadius: 20,
        cursor: 'pointer',
        transition: 'transform 0.12s',
        transform: pressed ? 'scale(0.97)' : 'scale(1)',
        padding: '22px 22px 20px',
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        marginBottom: 12,
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => { setPressed(false); onClick() }}
      onPointerLeave={() => setPressed(false)}
    >
      {/* Decorative circle */}
      <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.18)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -20, left: 10, width: 70, height: 70, borderRadius: '50%', background: 'rgba(0,0,0,0.06)', pointerEvents: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, position: 'relative' }}>
        <div style={{
          width: 58, height: 58, borderRadius: 18,
          background: 'rgba(255,255,255,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 30, flexShrink: 0,
          border: '1.5px solid rgba(255,255,255,0.5)',
        }}>
          {form.icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: MP.textDark, marginBottom: 4, fontFamily: MP.font }}>
            {isAr ? form.titleAr : form.title}
          </div>
          <div style={{ fontSize: 13, color: MP.textDark, opacity: 0.65, lineHeight: 1.4, fontFamily: MP.font }}>
            {isAr ? form.descAr : form.desc}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          background: 'rgba(0,0,0,0.1)', borderRadius: 20,
          padding: '6px 16px', fontSize: 12, fontWeight: 700,
          color: MP.textDark, fontFamily: MP.font,
        }}>
          {isAr ? '← فتح' : 'Open →'}
        </div>
      </div>
    </div>
  )
}

// ── Small form card (grid item) ───────────────────────────────────────────────
function SmallCard({ form, isAr, onClick }) {
  const [pressed, setPressed] = useState(false)
  return (
    <div
      style={{
        background: MP.darkCard,
        borderRadius: 16,
        cursor: 'pointer',
        transition: 'transform 0.12s',
        transform: pressed ? 'scale(0.95)' : 'scale(1)',
        padding: '16px 14px',
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        border: '1px solid #3A3D35',
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => { setPressed(false); onClick() }}
      onPointerLeave={() => setPressed(false)}
    >
      {/* Left accent strip */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: form.accent, borderRadius: '4px 0 0 4px' }} />
      <div style={{ marginLeft: 6 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: form.accent + '25',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, marginBottom: 10,
          border: `1px solid ${form.accent}40`,
        }}>
          {form.icon}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: MP.textOnDark, lineHeight: 1.3, fontFamily: MP.font }}>
          {isAr ? form.titleAr : form.title}
        </div>
        <div style={{ fontSize: 10, color: MP.textMutedDark, marginTop: 3, lineHeight: 1.3, fontFamily: MP.font }}>
          {isAr ? form.descAr : form.desc}
        </div>
      </div>
    </div>
  )
}

// ── Inbox row (used in both Home quick-view and Inbox tab) ────────────────────
function InboxRow({ icon, label, labelAr, count, color, isAr, onClick, variant = 'light' }) {
  const bg       = variant === 'dark' ? MP.darkCard   : MP.lightCard
  const textClr  = variant === 'dark' ? MP.textOnDark : '#23242D'
  const mutedClr = variant === 'dark' ? MP.textMutedDark : '#71717B'
  const borderClr = variant === 'dark' ? '#3A3D35'    : '#EDE9DE'
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 18px',
        borderBottom: `1px solid ${borderClr}`,
        cursor: 'pointer',
        background: bg,
        transition: 'background 0.12s',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        background: count > 0 ? color + '22' : (variant === 'dark' ? '#363830' : '#F5F4EF'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, flexShrink: 0,
        border: count > 0 ? `1px solid ${color}44` : 'none',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: textClr, fontFamily: MP.font }}>
          {isAr ? labelAr : label}
        </div>
        <div style={{ fontSize: 12, color: mutedClr, marginTop: 2, fontFamily: MP.font }}>
          {count > 0
            ? (isAr ? `${count} معلّقة` : `${count} pending`)
            : (isAr ? 'لا يوجد شيء جديد' : 'Nothing new')}
        </div>
      </div>
      {count > 0 && (
        <div style={{
          background: MP.yellow, color: MP.textDark,
          borderRadius: 20, minWidth: 26, height: 26,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, padding: '0 8px', fontFamily: MP.font,
        }}>
          {count}
        </div>
      )}
      <div style={{ color: mutedClr, fontSize: 16, flexShrink: 0, fontFamily: MP.font }}>›</div>
    </div>
  )
}

// ── Notifications sub-view ────────────────────────────────────────────────────
function NotificationsView({ notifications, isAr, onMarkAllRead, onBack }) {
  const ICONS = { SALARY:'💵', PAYMENT:'✅', APPROVAL:'✅', EXPENSE:'🧾', CAR:'🚗', FOOD:'🍽️', ALERT:'⚠️', GENERAL:'🔔' }
  const getIcon = type => { const k = Object.keys(ICONS).find(k => (type||'').includes(k)); return ICONS[k] || '🔔' }
  const unread  = notifications.filter(n => !n.is_read)

  return (
    <div style={{ minHeight: '100vh', background: MP.charcoal, fontFamily: MP.font, paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: MP.darkCard, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid #3A3D35' }}>
        <button onClick={onBack} style={{ background: 'rgba(247,210,99,0.12)', border: `1px solid rgba(247,210,99,0.2)`, borderRadius: 20, padding: '7px 16px', color: MP.yellow, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: MP.font }}>
          ← {isAr ? 'رجوع' : 'Back'}
        </button>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: MP.textOnDark, fontFamily: MP.font }}>
          {isAr ? 'الإشعارات' : 'Notifications'}
        </div>
        {unread.length > 0 && (
          <button onClick={onMarkAllRead} style={{ background: 'transparent', border: `1px solid #3A3D35`, borderRadius: 20, padding: '7px 14px', color: MP.textMutedDark, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: MP.font }}>
            {isAr ? 'قراءة الكل' : 'Mark all read'}
          </button>
        )}
      </div>

      {notifications.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: MP.textMutedDark, fontSize: 14, fontFamily: MP.font }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
          {isAr ? 'لا توجد إشعارات' : 'No notifications yet'}
        </div>
      )}

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {notifications.map(n => (
          <div key={n.id} style={{
            background: n.is_read ? MP.darkCard : '#2D302A',
            borderRadius: 14, padding: '14px 16px',
            border: `1px solid ${n.is_read ? '#3A3D35' : 'rgba(247,210,99,0.2)'}`,
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{getIcon(n.type)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: n.is_read ? 500 : 700, color: MP.textOnDark, marginBottom: 3, fontFamily: MP.font }}>{n.title}</div>
              {n.body && <div style={{ fontSize: 12, color: MP.textMutedDark, lineHeight: 1.4, fontFamily: MP.font }}>{n.body}</div>}
              {n.amount && (
                <div style={{ fontSize: 13, fontWeight: 700, color: MP.yellow, marginTop: 4, fontFamily: MP.font }}>
                  SAR {fmt(n.amount)}
                </div>
              )}
              <div style={{ fontSize: 11, color: MP.textMutedDark, marginTop: 5, fontFamily: MP.font }}>
                {fmtShort(n.created_at)}
              </div>
            </div>
            {!n.is_read && (
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: MP.yellow, flexShrink: 0, marginTop: 5 }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Confirmations sub-view ────────────────────────────────────────────────────
function ConfirmationsView({ items, confirming, isAr, onConfirm, onBack }) {
  const typeLabel  = item => item.type === 'FOOD' ? (isAr ? 'بدل طعام' : 'Food Allowance') : (isAr ? 'دفعة ميدانية' : 'Field Payment')
  const typeIcon   = type => type === 'FOOD' ? '🍽️' : '💳'
  const typeColor  = type => type === 'FOOD' ? '#E07A5F' : '#4CAF82'

  return (
    <div style={{ minHeight: '100vh', background: MP.cream, fontFamily: MP.font, paddingBottom: 80 }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      {/* Header */}
      <div style={{ background: MP.lightCard, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, borderBottom: '1px solid #E4E0D3' }}>
        <button onClick={onBack} style={{ background: 'transparent', border: '1.5px solid #D5D2C5', borderRadius: 20, padding: '7px 16px', color: MP.textMutedLight, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: MP.font }}>
          ← {isAr ? 'رجوع' : 'Back'}
        </button>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: MP.textDark, fontFamily: MP.font }}>
          {isAr ? 'تأكيد الاستلام' : 'Confirm Receipt'}
        </div>
        {items.length > 0 && (
          <div style={{ background: MP.yellow, color: MP.textDark, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700, fontFamily: MP.font }}>
            {items.length}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ background: 'rgba(197,230,160,0.25)', borderBottom: '1px solid rgba(197,230,160,0.5)', padding: '11px 16px', fontSize: 12, color: '#3A6B2A', lineHeight: 1.5, fontFamily: MP.font }}>
        {isAr ? 'يرجى مراجعة كل بند والضغط على "تأكيد الاستلام".' : 'Review each item and tap Confirm Receipt to acknowledge.'}
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: MP.textMutedLight, fontSize: 14, fontFamily: MP.font }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          {isAr ? 'لا توجد بنود معلقة' : 'No pending confirmations'}
        </div>
      )}

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(item => {
          const color  = typeColor(item.type)
          const isConf = confirming === item.id
          return (
            <div key={item.id} style={{ background: MP.lightCard, borderRadius: 16, overflow: 'hidden', border: '1px solid #E4E0D3' }}>
              <div style={{ background: color, height: 4 }} />
              <div style={{ padding: '16px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 22 }}>{typeIcon(item.type)}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: MP.textDark, fontFamily: MP.font }}>{typeLabel(item)}</div>
                      <div style={{ fontSize: 11, color: MP.textMutedLight, fontFamily: MP.font }}>{fmtDate(item.date)}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color, fontFamily: MP.font }}>SAR {fmt(item.amount)}</div>
                </div>
                <div style={{ background: '#F8F7F2', borderRadius: 10, padding: '10px 12px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {item.project && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 11, color: MP.textMutedLight, minWidth: 80, fontFamily: MP.font }}>{isAr ? 'المشروع' : 'Project'}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: MP.textDark, fontFamily: MP.font }}>{item.project}</span>
                    </div>
                  )}
                  {item.submittedBy && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 11, color: MP.textMutedLight, minWidth: 80, fontFamily: MP.font }}>{isAr ? 'قدّم بواسطة' : 'Submitted by'}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: MP.textDark, fontFamily: MP.font }}>{item.submittedBy}</span>
                    </div>
                  )}
                  {item.notes && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 11, color: MP.textMutedLight, minWidth: 80, fontFamily: MP.font }}>{isAr ? 'ملاحظات' : 'Notes'}</span>
                      <span style={{ fontSize: 11, color: MP.textDark, fontFamily: MP.font }}>{item.notes}</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onConfirm(item)}
                  disabled={isConf}
                  style={{
                    width: '100%', padding: '13px 0', borderRadius: 20, border: 'none',
                    background: isConf ? '#BBBAB5' : MP.green,
                    color: isConf ? '#888' : MP.textDark,
                    fontSize: 14, fontWeight: 700, cursor: isConf ? 'default' : 'pointer',
                    fontFamily: MP.font, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  {isConf
                    ? <><span style={{ display:'inline-block', width:16, height:16, border:'2px solid rgba(0,0,0,0.2)', borderTop:'2px solid #555', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/> {isAr ? 'جاري التأكيد…' : 'Confirming…'}</>
                    : <>✅ {isAr ? 'تأكيد الاستلام' : 'Confirm Receipt'}</>
                  }
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Payment gate screen ───────────────────────────────────────────────────────
function PaymentGateScreen({ items, confirming, onConfirm, onConfirmAll, empName, isAr, onSwitchUser }) {
  const total = items.length
  return (
    <div style={{
      position: 'fixed', inset: 0, background: MP.charcoal,
      display: 'flex', flexDirection: 'column', fontFamily: MP.font,
      maxWidth: 480, margin: '0 auto',
    }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}`}</style>

      {/* Header */}
      <div style={{ flexShrink: 0, background: MP.darkCard, padding: '36px 24px 20px', borderBottom: '1px solid #3A3D35' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: MP.textMutedDark, letterSpacing: 3, marginBottom: 16, textTransform: 'uppercase' }}>ACCSYS</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 16, flexShrink: 0,
            background: 'rgba(247,210,99,0.12)', border: `2px solid rgba(247,210,99,0.3)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
            animation: 'pulse 2s ease-in-out infinite',
          }}>⚠️</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: MP.textOnDark, fontFamily: MP.font }}>
              {isAr ? 'مطلوب تأكيد الاستلام' : 'Confirmation Required'}
            </div>
            <div style={{ fontSize: 12, color: MP.textMutedDark, marginTop: 2, fontFamily: MP.font }}>{empName}</div>
          </div>
        </div>
        <div style={{ background: 'rgba(247,210,99,0.1)', border: `1px solid rgba(247,210,99,0.3)`, borderRadius: 12, padding: '12px 14px', fontSize: 13, color: MP.yellow, lineHeight: 1.6, fontFamily: MP.font }}>
          {isAr
            ? `لديك ${total} دفعة ميدانية بانتظار التأكيد. يجب تأكيد الاستلام قبل الوصول إلى أي نموذج.`
            : `You have ${total} field payment${total > 1 ? 's' : ''} pending acknowledgment. You must confirm receipt before accessing any forms.`}
        </div>
      </div>

      {/* Scrollable items */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 12px', WebkitOverflowScrolling: 'touch' }}>
        {items.map(item => {
          const isConf = confirming === item.id
          const isMR   = item.gateType === 'MONEY_REQUEST'
          return (
            <div key={item.id} style={{ background: MP.darkCard, borderRadius: 20, overflow: 'hidden', marginBottom: 12, border: '1px solid #3A3D35' }}>
              {/* Amount band */}
              <div style={{ background: isMR ? 'linear-gradient(135deg,#7c3aed,#6d28d9)' : 'linear-gradient(135deg,#1d4ed8,#1e40af)', padding: '18px 20px' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: 1, marginBottom: 4, fontFamily: MP.font }}>
                  {isMR ? (isAr ? 'طلب مالي — تم الصرف' : 'MONEY REQUEST — DISBURSED') : (isAr ? 'المبلغ المستلم' : 'FIELD PAYMENT RECEIVED')}
                </div>
                <div style={{ fontSize: 30, fontWeight: 700, color: '#fff', letterSpacing: -1, fontFamily: MP.font }}>
                  SAR {fmtGate(item.amount)}
                </div>
                {Number(item.bank_charge_amount) > 0 && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', marginTop: 4, fontFamily: MP.font }}>
                    + SAR {fmtGate(item.bank_charge_amount)} {isAr ? 'رسوم بنكية' : 'bank charges'}
                  </div>
                )}
              </div>
              {/* Details */}
              <div style={{ padding: '14px 20px 16px' }}>
                <div style={{ display: 'flex', gap: 20, marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 10, color: MP.textMutedDark, fontWeight: 600, letterSpacing: 0.6, fontFamily: MP.font }}>{isAr ? 'التاريخ' : 'DATE'}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: MP.textOnDark, marginTop: 2, fontFamily: MP.font }}>
                      {item.sessionDate ? new Date(item.sessionDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                    </div>
                  </div>
                  {item.departmentName && (
                    <div>
                      <div style={{ fontSize: 10, color: MP.textMutedDark, fontWeight: 600, letterSpacing: 0.6, fontFamily: MP.font }}>
                        {isMR ? (isAr ? 'رقم الطلب' : 'REF #') : (isAr ? 'القسم' : 'DEPT')}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: MP.textOnDark, marginTop: 2, fontFamily: MP.font }}>{item.departmentName}</div>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => onConfirm(item)}
                  disabled={isConf}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 20, border: 'none',
                    background: isConf ? '#363830' : MP.green,
                    color: isConf ? MP.textMutedDark : MP.textDark,
                    fontSize: 14, fontWeight: 700, cursor: isConf ? 'default' : 'pointer',
                    fontFamily: MP.font, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}>
                  {isConf
                    ? <><span style={{ display:'inline-block', width:16, height:16, border:`2px solid #3A3D35`, borderTop:`2px solid ${MP.textMutedDark}`, borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>{isAr ? 'جاري التأكيد…' : 'Confirming…'}</>
                    : <>{isAr ? '✓ أؤكد استلام هذا المبلغ' : '✓ I Confirm Receipt of This Payment'}</>
                  }
                </button>
              </div>
            </div>
          )
        })}
        {items.length > 1 && (
          <button
            onClick={onConfirmAll}
            disabled={!!confirming}
            style={{
              width: '100%', padding: '14px', borderRadius: 20, border: `1.5px solid #3A3D35`,
              background: 'transparent', color: MP.textMutedDark,
              fontSize: 13, fontWeight: 600, cursor: confirming ? 'default' : 'pointer',
              marginBottom: 8, fontFamily: MP.font,
            }}>
            {isAr ? `✓✓ تأكيد جميع ${items.length} دفعات دفعةً واحدة` : `✓✓ Confirm All ${items.length} Payments at Once`}
          </button>
        )}
      </div>

      {/* Switch user */}
      <div style={{ flexShrink: 0, padding: '12px 16px 32px', borderTop: '1px solid #3A3D35', textAlign: 'center' }}>
        <button onClick={onSwitchUser} style={{ background: 'none', border: `1px solid #3A3D35`, borderRadius: 20, padding: '10px 24px', fontSize: 12, color: MP.textMutedDark, cursor: 'pointer', fontFamily: MP.font }}>
          🔄 {isAr ? 'تغيير المستخدم' : 'Switch User'}
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function FormLanding() {
  const navigate = useNavigate()
  const auth     = useFieldAuth()

  const [lang,          setLang]          = useState('en')
  const [view,          setView]          = useState('home')   // 'home'|'inbox'|'notifs'|'confirmations'|'forms'
  const [notifications, setNotifications] = useState([])
  const [confirmItems,  setConfirmItems]  = useState([])
  const [confirming,    setConfirming]    = useState(null)

  // Gate state
  const [pendingGate,    setPendingGate]    = useState([])
  const [gateReady,      setGateReady]      = useState(false)
  const [gateConfirming, setGateConfirming] = useState(null)

  const isAr = lang === 'ar'

  // ── Load data when auth resolves ──────────────────────────────────────────
  useEffect(() => {
    if (auth.employee?.id) {
      loadNotifications()
      loadConfirmations()
      loadGate()
    }
  }, [auth.employee?.id])

  const loadNotifications = useCallback(async () => {
    if (!auth.employee?.id) return
    const { data } = await supabase
      .from('notifications')
      .select('id,title,body,type,created_at,is_read,amount')
      .eq('employee_id', auth.employee.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifications(data || [])
  }, [auth.employee?.id])

  const loadConfirmations = useCallback(async () => {
    if (!auth.employee?.id) return
    const empId = auth.employee.id
    const items = []

    const { data: payments } = await supabase
      .from('field_payments')
      .select(`id, payment_date, total_amount, payment_method, notes, project:project_id(project_name), submitter:submitted_by(full_name_en)`)
      .eq('employee_id', empId).eq('ack_status', 'PENDING')
      .order('payment_date', { ascending: false }).limit(20)

    for (const p of payments || []) {
      items.push({ id: p.id, type: 'PAYMENT', amount: p.total_amount, date: p.payment_date, paymentMethod: p.payment_method, project: p.project?.project_name, submittedBy: p.submitter?.full_name_en, notes: p.notes })
    }

    const { data: foodAllowances } = await supabase
      .from('food_allowances')
      .select(`id, allowance_date, beneficiaries, submitter:employee_id(full_name_en), project:project_id(project_name)`)
      .order('allowance_date', { ascending: false }).limit(50)

    for (const fa of foodAllowances || []) {
      const mine = (fa.beneficiaries || []).find(b => b.id === empId && b.ack_status === 'PENDING')
      if (mine) items.push({ id: fa.id, type: 'FOOD', amount: 20, date: fa.allowance_date, project: fa.project?.project_name, submittedBy: fa.submitter?.full_name_en })
    }

    setConfirmItems(items)
  }, [auth.employee?.id])

  async function handleConfirm(item) {
    setConfirming(item.id)
    try {
      if (item.type === 'PAYMENT') {
        await supabase.from('field_payments').update({ ack_status: 'CONFIRMED', ack_at: new Date().toISOString(), ack_by: auth.employee.id }).eq('id', item.id)
      } else if (item.type === 'FOOD') {
        await supabase.rpc('acknowledge_food_allowance', { p_allowance_id: item.id, p_employee_id: auth.employee.id })
      }
      await loadConfirmations()
    } finally {
      setConfirming(null)
    }
  }

  async function markAllNotificationsRead() {
    if (!auth.employee?.id) return
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('employee_id', auth.employee.id).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const loadGate = useCallback(async () => {
    if (!auth.employee?.id) { setGateReady(true); return }
    const empId = auth.employee.id
    const gateItems = []

    const { data: lines } = await supabase.from('field_payment_lines').select('id, amount, bank_charge_amount, session_id, ack_status').eq('employee_id', empId).eq('ack_status', 'PENDING')
    if (lines?.length) {
      const sessionIds = [...new Set(lines.map(l => l.session_id).filter(Boolean))]
      let sessMap = {}
      if (sessionIds.length) {
        const { data: sessions } = await supabase.from('field_payment_sessions').select('id, session_date, department_name').in('id', sessionIds)
        ;(sessions || []).forEach(s => { sessMap[s.id] = s })
      }
      lines.forEach(l => gateItems.push({ id: l.id, gateType: 'FIELD_LINE', amount: l.amount, bank_charge_amount: l.bank_charge_amount, sessionDate: sessMap[l.session_id]?.session_date || null, departmentName: sessMap[l.session_id]?.department_name || null }))
    }

    const { data: mrs } = await supabase.from('money_requests').select('id, request_number, requested_amount, status, dh_ack_status, submitted_at').eq('requested_by', empId).eq('dh_ack_status', 'PENDING').limit(10)
    if (mrs?.length) {
      mrs.forEach(mr => gateItems.push({ id: mr.id, gateType: 'MONEY_REQUEST', amount: mr.requested_amount, bank_charge_amount: 0, sessionDate: mr.submitted_at, departmentName: mr.request_number || null }))
    }

    setPendingGate(gateItems)
    setGateReady(true)
  }, [auth.employee?.id])

  async function confirmGateItem(item) {
    if (gateConfirming) return
    setGateConfirming(item.id)
    const now = new Date().toISOString()
    let error = null
    if (item.gateType === 'FIELD_LINE') {
      ;({ error } = await supabase.from('field_payment_lines').update({ ack_status: 'CONFIRMED', ack_at: now }).eq('id', item.id).eq('ack_status', 'PENDING'))
    } else if (item.gateType === 'MONEY_REQUEST') {
      ;({ error } = await supabase.from('money_requests').update({ dh_ack_status: 'CONFIRMED', dh_ack_at: now, dh_ack_by: auth.employee.id }).eq('id', item.id).eq('dh_ack_status', 'PENDING'))
    }
    if (!error) setPendingGate(prev => prev.filter(g => g.id !== item.id))
    else alert('Could not confirm. Please try again.')
    setGateConfirming(null)
  }

  async function confirmAllGateItems() {
    if (gateConfirming || !pendingGate.length) return
    const lineIds = pendingGate.filter(g => g.gateType === 'FIELD_LINE').map(g => g.id)
    const mrItems = pendingGate.filter(g => g.gateType === 'MONEY_REQUEST')
    setGateConfirming('ALL')
    const now = new Date().toISOString()
    if (lineIds.length) await supabase.from('field_payment_lines').update({ ack_status: 'CONFIRMED', ack_at: now }).in('id', lineIds).eq('ack_status', 'PENDING')
    for (const mr of mrItems) await supabase.from('money_requests').update({ dh_ack_status: 'CONFIRMED', dh_ack_at: now, dh_ack_by: auth.employee.id }).eq('id', mr.id).eq('dh_ack_status', 'PENDING')
    setPendingGate([])
    setGateConfirming(null)
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (auth.loading)  return <LoadingScreen msg="Verifying your identity…" />
  if (!auth.employee) return <ScanQRScreen error={auth.error} debugError={auth.debugError} />
  if (!gateReady)    return <LoadingScreen msg="Checking pending confirmations…" />
  if (pendingGate.length > 0) {
    return (
      <PaymentGateScreen
        items={pendingGate} confirming={gateConfirming}
        onConfirm={confirmGateItem} onConfirmAll={confirmAllGateItems}
        empName={auth.employee?.full_name_en || ''} isAr={isAr}
        onSwitchUser={auth.logout}
      />
    )
  }

  // ── Sub-views (notifs / confirmations) ────────────────────────────────────
  if (view === 'notifs') {
    return (
      <>
        <NotificationsView notifications={notifications} isAr={isAr} onMarkAllRead={markAllNotificationsRead} onBack={() => setView('inbox')} />
        <BottomNav current="notifs" onHome={() => setView('home')} onInbox={() => setView('inbox')} onForms={() => setView('forms')} unreadCount={notifications.filter(n => !n.is_read).length} isAr={isAr} />
      </>
    )
  }
  if (view === 'confirmations') {
    return (
      <>
        <ConfirmationsView items={confirmItems} confirming={confirming} isAr={isAr} onConfirm={handleConfirm} onBack={() => setView('inbox')} />
        <BottomNav current="confirmations" onHome={() => setView('home')} onInbox={() => setView('inbox')} onForms={() => setView('forms')} unreadCount={notifications.filter(n => !n.is_read).length} isAr={isAr} />
      </>
    )
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const emp          = auth.employee
  const role         = auth.role
  const roleLabel    = ROLE_LABELS[role] || role
  const roleColor    = ROLE_COLORS[role] || '#374151'
  const firstName    = (emp.full_name_en || '').split(' ')[0]
  const unreadNotifs = notifications.filter(n => !n.is_read).length
  const alertCount   = notifications.filter(n => !n.is_read && (n.type || '').includes('ALERT')).length
  const pendingConf  = confirmItems.length
  const totalInbox   = unreadNotifs + pendingConf

  // Role-filtered forms — hero first
  const visibleForms = FORM_CATALOGUE.filter(f => auth.allowedForms.includes(f.key))
  const heroForm     = visibleForms.find(f => f.hero)
  const otherForms   = visibleForms.filter(f => !f.hero)

  // ══════════════════════════════════════════════════════════════════════════
  // HOME TAB — cream
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'home') return (
    <div style={{ minHeight: '100vh', background: MP.cream, fontFamily: MP.font, maxWidth: 480, margin: '0 auto', paddingBottom: 90 }} dir={isAr ? 'rtl' : 'ltr'}>

      {/* Top bar */}
      <div style={{ background: MP.cream, padding: '18px 20px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: MP.textMutedLight, letterSpacing: 2, textTransform: 'uppercase' }}>ACCSYS</div>
        <button onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')} style={{ background: 'transparent', border: `1.5px solid #D5D2C5`, borderRadius: 20, padding: '5px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: MP.textMutedLight, fontFamily: MP.font }}>
          {isAr ? 'EN' : 'عربي'}
        </button>
      </div>

      {/* User info card */}
      <div style={{ margin: '0 16px 16px', background: MP.lightCard, borderRadius: 20, padding: '18px 20px', border: '1px solid #E4E0D3', position: 'relative', overflow: 'hidden' }}>
        {/* Yellow left accent */}
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: MP.yellow, borderRadius: '4px 0 0 4px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingLeft: 8 }}>
          {/* Avatar */}
          <div style={{
            width: 52, height: 52, borderRadius: 16,
            background: MP.yellow, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 700, color: MP.textDark, fontFamily: MP.font,
          }}>
            {initials(emp.full_name_en)}
          </div>
          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: MP.textDark, fontFamily: MP.font, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {isAr ? (emp.full_name_ar || emp.full_name_en) : emp.full_name_en}
            </div>
            <div style={{ fontSize: 12, color: MP.textMutedLight, fontFamily: MP.font, marginBottom: 6 }}>
              {emp.department?.dept_code
                ? `${emp.department.dept_code} — ${emp.department.dept_name}`
                : (emp.designation || emp.job_title || '')}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ background: roleColor, color: '#fff', borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', fontFamily: MP.font }}>
                {roleLabel}
              </span>
              <span style={{ background: '#F0EEE3', border: '1px solid #D5D2C5', color: MP.textMutedLight, borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 600, fontFamily: MP.font }}>
                {auth.employmentType}
              </span>
              {auth.assignments?.length > 0 && (
                <span style={{ background: '#F0EEE3', border: '1px solid #D5D2C5', color: MP.textMutedLight, borderRadius: 20, padding: '3px 10px', fontSize: 10, fontWeight: 600, fontFamily: MP.font }}>
                  {auth.assignments.length} {isAr ? 'موقع' : 'site(s)'}
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Greeting */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #EDE9DE', paddingLeft: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: MP.textDark, fontFamily: MP.font }}>
            {getGreeting(isAr)}, {firstName} 👋
          </div>
          <div style={{ background: MP.cream, border: '1px solid #E4E0D3', borderRadius: 10, padding: '5px 10px', textAlign: 'center', minWidth: 60 }}>
            <div style={{ fontWeight: 700, color: MP.textDark, fontSize: 13, fontFamily: MP.font }}>
              {new Date().toLocaleDateString('en-SA', { day: 'numeric', month: 'short' })}
            </div>
            <div style={{ fontSize: 10, color: MP.textMutedLight, fontFamily: MP.font }}>
              {new Date().toLocaleDateString('en-SA', { weekday: 'short' })}
            </div>
          </div>
        </div>
      </div>

      {/* Inbox section */}
      <div style={{ margin: '0 16px 16px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: MP.textMutedLight, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, fontFamily: MP.font, paddingLeft: 2 }}>
          {isAr ? 'صندوق الوارد' : 'Inbox'}
        </div>
        <div style={{ background: MP.lightCard, borderRadius: 16, overflow: 'hidden', border: '1px solid #E4E0D3' }}>
          <InboxRow icon="🔔" label="Notifications" labelAr="الإشعارات" count={unreadNotifs} color="#3B6FE8" isAr={isAr} onClick={() => setView('notifs')} variant="light" />
          <InboxRow icon="⚠️" label="Alerts"         labelAr="التنبيهات"   count={alertCount}   color="#E07A5F" isAr={isAr} onClick={() => setView('notifs')} variant="light" />
          <InboxRow icon="✅" label="Confirmations"  labelAr="تأكيدات"     count={pendingConf}  color="#4CAF82" isAr={isAr} onClick={() => setView('confirmations')} variant="light" style={{ borderBottom: 'none' }} />
        </div>
      </div>

      {/* Active sites strip */}
      {auth.assignments?.length > 0 && (
        <div style={{ margin: '0 16px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MP.textMutedLight, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, fontFamily: MP.font, paddingLeft: 2 }}>
            📍 {isAr ? 'مواقعك المخصصة' : 'Your Active Sites'}
          </div>
          <div style={{ overflowX: 'auto', display: 'flex', gap: 8, paddingBottom: 4, WebkitOverflowScrolling: 'touch' }}>
            {auth.assignments.map(a => (
              <div key={a.id} style={{ background: MP.lightCard, border: '1px solid #E4E0D3', borderRadius: 12, padding: '8px 14px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                <span style={{ fontWeight: 700, color: MP.textDark, fontFamily: MP.font }}>{a.site_number || a.project?.project_number || '—'}</span>
                <span style={{ fontSize: 10, color: MP.textMutedLight, fontFamily: MP.font }}>{a.project?.project_name?.slice(0, 22) || a.site_name?.slice(0, 22) || ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick access to forms */}
      <div style={{ margin: '0 16px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MP.textMutedLight, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: MP.font, paddingLeft: 2 }}>
            {isAr ? 'النماذج المتاحة' : 'Your Forms'}
          </div>
          <button onClick={() => setView('forms')} style={{ background: 'transparent', border: 'none', fontSize: 12, fontWeight: 600, color: MP.textMutedLight, cursor: 'pointer', fontFamily: MP.font }}>
            {isAr ? 'عرض الكل ←' : 'See all →'}
          </button>
        </div>
        {heroForm && (
          <HeroCard form={heroForm} isAr={isAr} onClick={() => navigate(heroForm.route)} />
        )}
      </div>

      {/* Switch user */}
      <div style={{ padding: '8px 16px 4px', textAlign: 'center' }}>
        <button onClick={auth.logout} style={{ background: 'none', border: `1.5px solid #D5D2C5`, borderRadius: 20, padding: '10px 24px', fontSize: 12, color: MP.textMutedLight, cursor: 'pointer', fontWeight: 500, fontFamily: MP.font }}>
          🔄 {isAr ? 'تغيير المستخدم' : 'Switch User'}
        </button>
      </div>

      <BottomNav current="home" onHome={() => setView('home')} onInbox={() => setView('inbox')} onForms={() => setView('forms')} unreadCount={totalInbox} isAr={isAr} />
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════
  // INBOX TAB — dark
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'inbox') return (
    <div style={{ minHeight: '100vh', background: MP.charcoal, fontFamily: MP.font, maxWidth: 480, margin: '0 auto', paddingBottom: 90 }} dir={isAr ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div style={{ padding: '24px 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: MP.textOnDark, fontFamily: MP.font }}>
          {isAr ? 'صندوق الوارد' : 'Inbox'}
        </div>
        {totalInbox > 0 && (
          <div style={{ background: MP.yellow, color: MP.textDark, borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 700, fontFamily: MP.font }}>
            {totalInbox} {isAr ? 'جديد' : 'new'}
          </div>
        )}
      </div>

      {/* Overview panel */}
      <div style={{ margin: '0 16px 16px', background: MP.darkCard, borderRadius: 20, overflow: 'hidden', border: '1px solid #3A3D35' }}>
        <div style={{ padding: '12px 18px 8px', fontSize: 11, fontWeight: 600, color: MP.textMutedDark, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: MP.font }}>
          {isAr ? 'نظرة عامة' : 'Overview'}
        </div>
        <InboxRow icon="🔔" label="Notifications" labelAr="الإشعارات" count={unreadNotifs} color="#3B6FE8" isAr={isAr} onClick={() => setView('notifs')} variant="dark" />
        <InboxRow icon="⚠️" label="Alerts"         labelAr="التنبيهات"   count={alertCount}   color="#E07A5F" isAr={isAr} onClick={() => setView('notifs')} variant="dark" />
        <InboxRow icon="✅" label="Confirmations"  labelAr="تأكيدات"     count={pendingConf}  color="#4CAF82" isAr={isAr} onClick={() => setView('confirmations')} variant="dark" />
      </div>

      {/* Recent notifications preview */}
      {notifications.length > 0 && (
        <div style={{ margin: '0 16px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MP.textMutedDark, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, fontFamily: MP.font, paddingLeft: 2 }}>
            {isAr ? 'الأخيرة' : 'Recent'}
          </div>
          {notifications.slice(0, 4).map(n => (
            <div key={n.id} style={{ background: MP.darkCard, borderRadius: 12, padding: '12px 14px', marginBottom: 8, border: n.is_read ? '1px solid #3A3D35' : `1px solid rgba(247,210,99,0.25)`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{n.type?.includes('ALERT') ? '⚠️' : '🔔'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700, color: MP.textOnDark, marginBottom: 2, fontFamily: MP.font }}>{n.title}</div>
                <div style={{ fontSize: 11, color: MP.textMutedDark, fontFamily: MP.font }}>{fmtShort(n.created_at)}</div>
              </div>
              {!n.is_read && <div style={{ width: 7, height: 7, borderRadius: '50%', background: MP.yellow, flexShrink: 0, marginTop: 4 }} />}
            </div>
          ))}
          {notifications.length > 4 && (
            <button onClick={() => setView('notifs')} style={{ background: 'transparent', border: `1px solid #3A3D35`, borderRadius: 20, padding: '9px 20px', fontSize: 12, color: MP.textMutedDark, cursor: 'pointer', fontFamily: MP.font, width: '100%' }}>
              {isAr ? `عرض جميع الإشعارات (${notifications.length})` : `View all notifications (${notifications.length})`}
            </button>
          )}
        </div>
      )}

      <BottomNav current="inbox" onHome={() => setView('home')} onInbox={() => setView('inbox')} onForms={() => setView('forms')} unreadCount={totalInbox} isAr={isAr} />
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════
  // FORMS TAB — dark
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight: '100vh', background: MP.charcoal, fontFamily: MP.font, maxWidth: 480, margin: '0 auto', paddingBottom: 90 }} dir={isAr ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div style={{ padding: '24px 20px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: MP.textOnDark, fontFamily: MP.font }}>
            {isAr ? 'النماذج' : 'Your Forms'}
          </div>
          <div style={{ fontSize: 12, color: MP.textMutedDark, fontFamily: MP.font, marginTop: 2 }}>
            {visibleForms.length} {isAr ? 'نماذج متاحة' : 'available'}
          </div>
        </div>
        <button onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')} style={{ background: 'transparent', border: `1.5px solid #3A3D35`, borderRadius: 20, padding: '5px 14px', fontSize: 11, fontWeight: 600, cursor: 'pointer', color: MP.textMutedDark, fontFamily: MP.font }}>
          {isAr ? 'EN' : 'عربي'}
        </button>
      </div>

      <div style={{ padding: '0 14px' }}>
        {/* Hero card */}
        {heroForm && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: MP.textMutedDark, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, fontFamily: MP.font, paddingLeft: 2 }}>
              {isAr ? 'مميز' : 'Featured'}
            </div>
            <HeroCard form={heroForm} isAr={isAr} onClick={() => navigate(heroForm.route)} />
          </>
        )}

        {/* Other forms grid */}
        {otherForms.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: MP.textMutedDark, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10, marginTop: 4, fontFamily: MP.font, paddingLeft: 2 }}>
              {isAr ? 'جميع النماذج' : 'All Forms'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {otherForms.map(form => (
                <SmallCard key={form.key} form={form} isAr={isAr} onClick={() => navigate(form.route)} />
              ))}
            </div>
          </>
        )}

        {visibleForms.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: MP.textMutedDark, fontFamily: MP.font }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 14 }}>{isAr ? 'لا توجد نماذج متاحة لدورك الحالي' : 'No forms available for your current role'}</div>
          </div>
        )}
      </div>

      <BottomNav current="forms" onHome={() => setView('home')} onInbox={() => setView('inbox')} onForms={() => setView('forms')} unreadCount={totalInbox} isAr={isAr} />
    </div>
  )
}
