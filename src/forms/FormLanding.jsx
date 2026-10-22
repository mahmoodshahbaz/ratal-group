/**
 * FormLanding.jsx  — /forms
 *
 * Public entry point for all field workers.
 * Reads QR token from URL or sessionStorage via useFieldAuth.
 *
 * Screens:
 *   'home'          — inbox + form cards
 *   'notifs'        — full notification list
 *   'confirmations' — pending payment/food confirmations
 *
 * No token → QR scan prompt screen.
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate }                       from 'react-router-dom'
import { supabase }                          from '../lib/supabase'
import { useFieldAuth, ROLE_LABELS, ROLE_COLORS } from '../lib/useFieldAuth'

// ── Form catalogue ─────────────────────────────────────────────────────────────
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
  },
  {
    key:    'payment_validation',
    title:  'Payment Confirmation',
    titleAr:'تأكيد استلام الدفعة',
    desc:   'Confirm receipt of advance',
    descAr: 'تأكيد استلام السلفة',
    icon:   '💳',
    accent: '#2e7d32',
    route:  '/forms/payment-validation',
  },
  {
    key:    'payment_confirm',
    title:  'Field Payment Receipt',
    titleAr:'تأكيد استلام الدفعة الميدانية',
    desc:   'Confirm receipt of your field payment disbursement',
    descAr: 'تأكيد استلام مبلغ الدفعة الميدانية',
    icon:   '✅',
    accent: '#1d4ed8',
    route:  '/forms/payment-confirm',
  },
  {
    key:    'cash_payment',
    title:  'Cash Payment Voucher',
    titleAr:'سند صرف نقدي',
    desc:   'Record a cash payment — company, individual or informal',
    descAr: 'تسجيل دفعة نقدية لشركة أو فرد',
    icon:   '💵',
    accent: '#8C354B',
    route:  '/forms/cash-payment',
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
  },
]

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  bg:      '#eef2f7',
  card:    '#ffffff',
  border:  '#e8edf3',
  text:    '#1a2540',
  muted:   '#6b7c93',
  blue:    '#1565c0',
  green:   '#2e7d32',
  orange:  '#e65100',
  red:     '#c62828',
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt    = (n) => parseFloat(n || 0).toLocaleString('en-SA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const initials = (name) => (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

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

// ── Error messages ─────────────────────────────────────────────────────────────
const ERROR_MESSAGES = {
  invalid_token:    { en: 'This QR code is not recognised. Please request a new one from your admin.', ar: 'رمز QR غير معروف. يرجى طلب رمز جديد من المشرف.' },
  token_inactive:   { en: 'This QR code has been deactivated. Contact your admin.', ar: 'تم إلغاء تفعيل رمز QR. تواصل مع المشرف.' },
  employee_inactive:{ en: 'Your account is no longer active. Contact HR.', ar: 'حسابك غير نشط. تواصل مع الموارد البشرية.' },
}

// ══════════════════════════════════════════════════════════════════════════════
// QR SCAN SCREEN
// ══════════════════════════════════════════════════════════════════════════════
function ScanQRScreen({ error }) {
  const [lang, setLang] = useState('en')
  const isAr  = lang === 'ar'
  const errMsg = error && error !== 'no_token' ? ERROR_MESSAGES[error] : null

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #1a2540 0%, #2d3a6b 50%, #1a4480 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 32, fontFamily: 'Arial, sans-serif', textAlign: 'center',
    }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: 'rgba(255,255,255,0.5)', letterSpacing: 3, marginBottom: 48, textTransform: 'uppercase' }}>
        ACCSYS
      </div>
      <div style={{ width: 120, height: 120, background: 'rgba(255,255,255,0.08)', borderRadius: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56, marginBottom: 32, border: '2px solid rgba(255,255,255,0.15)' }}>
        📱
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 10 }}>
        {isAr ? 'امسح رمز QR للمتابعة' : 'Scan Your QR Code'}
      </div>
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, marginBottom: 8 }}>
        {isAr
          ? 'احصل على رمز QR الخاص بك من مشرفك أو قسم الموارد البشرية'
          : 'Get your personal QR code from your supervisor or HR department'}
      </div>
      {errMsg && (
        <div style={{ background: 'rgba(244,67,54,0.15)', border: '1px solid rgba(244,67,54,0.4)', borderRadius: 12, padding: '14px 20px', marginTop: 24, color: '#ffcdd2', fontSize: 13, lineHeight: 1.5, maxWidth: 300 }}>
          {isAr ? errMsg.ar : errMsg.en}
        </div>
      )}
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 40, lineHeight: 1.7 }}>
        {isAr
          ? 'كل موظف لديه رمز QR شخصي خاص به'
          : 'Each employee has their own personal QR code'}
      </div>
      <button
        style={{ marginTop: 48, background: 'none', border: '1.5px solid rgba(255,255,255,0.2)', borderRadius: 10, padding: '10px 24px', fontSize: 13, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontWeight: 600, fontFamily: 'Arial, sans-serif' }}
        onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')}
      >
        {isAr ? 'English' : 'عربي'}
      </button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// FORM CARD
// ══════════════════════════════════════════════════════════════════════════════
function FormCard({ form, isAr, onClick }) {
  const [pressed, setPressed] = useState(false)

  return (
    <div
      style={{
        background: `linear-gradient(145deg, ${form.accent}ee 0%, ${form.accent}bb 100%)`,
        borderRadius: 20,
        overflow: 'hidden',
        boxShadow: `0 6px 20px ${form.accent}55`,
        cursor: 'pointer',
        transition: 'transform 0.15s',
        transform: pressed ? 'scale(0.96)' : 'scale(1)',
        position: 'relative',
        display: 'block',
        userSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        minHeight: 155,
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => { setPressed(false); onClick() }}
      onPointerLeave={() => setPressed(false)}
    >
      <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
      <div style={{ padding: '18px 16px 16px' }}>
        <div style={{ width: 50, height: 50, borderRadius: 16, background: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10, border: '1.5px solid rgba(255,255,255,0.35)' }}>
          <span style={{ fontSize: 26, lineHeight: 1 }}>{form.icon}</span>
        </div>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', lineHeight: 1.3, marginBottom: 4, textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
          {isAr ? form.titleAr : form.title}
        </div>
        <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.8)', lineHeight: 1.4, marginBottom: 10 }}>
          {isAr ? form.descAr : form.desc}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.22)', borderRadius: 8, padding: '4px 10px', width: 'fit-content', border: '1px solid rgba(255,255,255,0.35)' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#fff' }}>{isAr ? '← فتح' : 'Open →'}</span>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// INBOX ROW
// ══════════════════════════════════════════════════════════════════════════════
function InboxRow({ icon, label, labelAr, count, color, isAr, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '13px 16px',
        borderBottom: `1px solid ${T.border}`,
        cursor: 'pointer',
        background: count > 0 ? color + '08' : T.card,
        transition: 'background 0.15s',
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: 12,
        background: count > 0 ? color + '18' : '#f1f5f9',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, flexShrink: 0,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
          {isAr ? labelAr : label}
        </div>
        <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
          {count > 0
            ? (isAr ? `${count} معلّقة` : `${count} pending`)
            : (isAr ? 'لا يوجد شيء جديد' : 'Nothing new')}
        </div>
      </div>
      {count > 0 && (
        <div style={{
          background: color, color: '#fff',
          borderRadius: 20, minWidth: 26, height: 26,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, padding: '0 8px',
        }}>
          {count}
        </div>
      )}
      <div style={{ color: T.muted, fontSize: 16, flexShrink: 0 }}>›</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS VIEW
// ══════════════════════════════════════════════════════════════════════════════
function NotificationsView({ notifications, isAr, onMarkAllRead, onBack }) {
  const ICONS = {
    SALARY: '💵', PAYMENT: '✅', APPROVAL: '✅',
    EXPENSE: '🧾', CAR: '🚗', FOOD: '🍽️',
    ALERT: '⚠️', GENERAL: '🔔',
  }
  const getIcon = (type) => {
    const k = Object.keys(ICONS).find(k => (type || '').includes(k))
    return ICONS[k] || '🔔'
  }
  const unread = notifications.filter(n => !n.is_read)

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1a2540,#2d3a6b)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10, padding: '8px 14px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Arial, sans-serif' }}>
          ← {isAr ? 'رجوع' : 'Back'}
        </button>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 900, color: '#fff' }}>
          {isAr ? 'الإشعارات' : 'Notifications'}
        </div>
        {unread.length > 0 && (
          <button onClick={onMarkAllRead} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10, padding: '8px 14px', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Arial, sans-serif' }}>
            {isAr ? 'قراءة الكل' : 'Mark all read'}
          </button>
        )}
      </div>

      {notifications.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted, fontSize: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
          {isAr ? 'لا توجد إشعارات' : 'No notifications yet'}
        </div>
      )}

      <div style={{ background: T.card }}>
        {notifications.map(n => (
          <div key={n.id} style={{
            padding: '14px 16px',
            borderBottom: `1px solid ${T.border}`,
            background: n.is_read ? T.card : '#f0f9ff',
            display: 'flex', gap: 12, alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: 22, flexShrink: 0, marginTop: 1 }}>{getIcon(n.type)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: n.is_read ? 600 : 800, color: T.text, marginBottom: 3 }}>{n.title}</div>
              {n.body && <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.4 }}>{n.body}</div>}
              {n.amount && (
                <div style={{ fontSize: 13, fontWeight: 800, color: T.blue, marginTop: 4 }}>
                  SAR {fmt(n.amount)}
                </div>
              )}
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
                {new Date(n.created_at).toLocaleDateString('en-SA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            {!n.is_read && (
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.red, flexShrink: 0, marginTop: 5 }} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CONFIRMATIONS VIEW
// ══════════════════════════════════════════════════════════════════════════════
function ConfirmationsView({ items, confirming, isAr, onConfirm, onBack }) {
  const typeLabel = (item) => {
    if (item.type === 'FOOD') return isAr ? 'بدل طعام' : 'Food Allowance'
    if (item.type === 'PAYMENT') return isAr ? 'دفعة ميدانية' : 'Field Payment'
    return item.type
  }

  const typeIcon  = (type) => type === 'FOOD' ? '🍽️' : '💳'
  const typeColor = (type) => type === 'FOOD' ? T.orange : T.green

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: 'Arial, sans-serif' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1a2540,#2d3a6b)', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
        <button onClick={onBack} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10, padding: '8px 14px', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Arial, sans-serif' }}>
          ← {isAr ? 'رجوع' : 'Back'}
        </button>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 900, color: '#fff' }}>
          {isAr ? 'تأكيد الاستلام' : 'Confirm Receipt'}
        </div>
        {items.length > 0 && (
          <div style={{ background: T.green, color: '#fff', borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 800 }}>
            {items.length}
          </div>
        )}
      </div>

      {/* Info banner */}
      <div style={{ background: '#e8f5e9', borderBottom: `1px solid #c8e6c9`, padding: '12px 16px', fontSize: 12, color: '#2e7d32', lineHeight: 1.5 }}>
        {isAr
          ? 'يرجى مراجعة كل بند والضغط على "تأكيد الاستلام" للتحقق من استلامك للمبلغ.'
          : 'Review each item and tap Confirm Receipt to acknowledge you have received the amount.'}
      </div>

      {items.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: T.muted, fontSize: 14 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          {isAr ? 'لا توجد بنود معلقة' : 'No pending confirmations'}
        </div>
      )}

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(item => {
          const color   = typeColor(item.type)
          const isConf  = confirming === item.id

          return (
            <div key={item.id} style={{ background: T.card, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 10px rgba(0,0,0,0.07)' }}>
              {/* Top stripe */}
              <div style={{ background: color, height: 4 }} />
              <div style={{ padding: '14px 16px' }}>
                {/* Type + date */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 22 }}>{typeIcon(item.type)}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{typeLabel(item)}</div>
                      <div style={{ fontSize: 11, color: T.muted }}>
                        {item.date ? new Date(item.date).toLocaleDateString('en-SA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 900, color }}>SAR {fmt(item.amount)}</div>
                  </div>
                </div>

                {/* Details grid */}
                <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 12px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {item.project && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 11, color: T.muted, minWidth: 80 }}>{isAr ? 'المشروع' : 'Project'}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{item.project}</span>
                    </div>
                  )}
                  {item.submittedBy && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 11, color: T.muted, minWidth: 80 }}>{isAr ? 'قدّم بواسطة' : 'Submitted by'}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{item.submittedBy}</span>
                    </div>
                  )}
                  {item.paymentMethod && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 11, color: T.muted, minWidth: 80 }}>{isAr ? 'طريقة الدفع' : 'Method'}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{item.paymentMethod}</span>
                    </div>
                  )}
                  {item.notes && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span style={{ fontSize: 11, color: T.muted, minWidth: 80 }}>{isAr ? 'ملاحظات' : 'Notes'}</span>
                      <span style={{ fontSize: 11, color: T.text }}>{item.notes}</span>
                    </div>
                  )}
                </div>

                {/* Confirm button */}
                <button
                  onClick={() => onConfirm(item)}
                  disabled={isConf}
                  style={{
                    width: '100%',
                    padding: '14px 0',
                    borderRadius: 14,
                    border: 'none',
                    background: isConf ? '#9e9e9e' : color,
                    color: '#fff',
                    fontSize: 15,
                    fontWeight: 900,
                    cursor: isConf ? 'default' : 'pointer',
                    fontFamily: 'Arial, sans-serif',
                    letterSpacing: 0.3,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  {isConf ? (
                    <>
                      <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                      {isAr ? 'جاري التأكيد…' : 'Confirming…'}
                    </>
                  ) : (
                    <>✅ {isAr ? 'تأكيد الاستلام' : 'Confirm Receipt'}</>
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PAYMENT GATE SCREEN — blocks ALL form access until pending lines confirmed
// ══════════════════════════════════════════════════════════════════════════════
const fmtGate = n => Number(n||0).toLocaleString('en-SA',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtGateDate = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'

function PaymentGateScreen({ items, confirming, onConfirm, onConfirmAll, empName, isAr, onSwitchUser }) {
  const total = items.length
  return (
    <div style={{
      position:'fixed', inset:0, background:'#0f172a',
      display:'flex', flexDirection:'column', fontFamily:'Arial, sans-serif',
      maxWidth:480, margin:'0 auto',
    }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}`}</style>

      {/* Header */}
      <div style={{ flexShrink:0, background:'#1e293b', padding:'36px 24px 20px', borderBottom:'1px solid #334155' }}>
        <div style={{ fontSize:13, fontWeight:900, color:'rgba(255,255,255,0.35)', letterSpacing:3, marginBottom:16 }}>ACCSYS</div>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
          <div style={{
            width:48, height:48, borderRadius:16, flexShrink:0,
            background:'#f59e0b22', border:'2px solid #f59e0b66',
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:24,
            animation:'pulse 2s ease-in-out infinite',
          }}>⚠️</div>
          <div>
            <div style={{ fontSize:18, fontWeight:900, color:'#f1f5f9' }}>
              {isAr ? 'مطلوب تأكيد الاستلام' : 'Confirmation Required'}
            </div>
            <div style={{ fontSize:12, color:'#94a3b8', marginTop:2 }}>{empName}</div>
          </div>
        </div>
        <div style={{
          background:'#f59e0b18', border:'1px solid #f59e0b44',
          borderRadius:12, padding:'12px 14px',
          fontSize:13, color:'#fcd34d', lineHeight:1.6,
        }}>
          {isAr
            ? `لديك ${total} دفعة ميدانية بانتظار التأكيد. يجب تأكيد الاستلام قبل الوصول إلى أي نموذج.`
            : `You have ${total} field payment${total>1?'s':''} pending acknowledgment. You must confirm receipt before accessing any forms.`}
        </div>
      </div>

      {/* Scrollable items */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 16px 12px', WebkitOverflowScrolling:'touch' }}>
        {items.map((item, idx) => {
          const isConf = confirming === item.id
          return (
            <div key={item.id} style={{
              background:'#1e293b', borderRadius:20, overflow:'hidden',
              marginBottom:12, border:'1px solid #334155',
            }}>
              {/* Amount band */}
              <div style={{ background: item.gateType === 'MONEY_REQUEST' ? 'linear-gradient(135deg,#7c3aed,#6d28d9)' : 'linear-gradient(135deg,#1d4ed8,#1e40af)', padding:'18px 20px' }}>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', letterSpacing:1, marginBottom:4 }}>
                  {item.gateType === 'MONEY_REQUEST'
                    ? (isAr ? 'طلب مالي — تم الصرف' : 'MONEY REQUEST — DISBURSED')
                    : (isAr ? 'المبلغ المستلم' : 'FIELD PAYMENT RECEIVED')}
                </div>
                <div style={{ fontSize:32, fontWeight:900, color:'#fff', letterSpacing:-1 }}>
                  SAR {fmtGate(item.amount)}
                </div>
                {Number(item.bank_charge_amount) > 0 && (
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.55)', marginTop:4 }}>
                    + SAR {fmtGate(item.bank_charge_amount)} {isAr ? 'رسوم بنكية' : 'bank charges'}
                  </div>
                )}
              </div>

              {/* Details */}
              <div style={{ padding:'14px 20px 16px' }}>
                <div style={{ display:'flex', gap:20, marginBottom:14 }}>
                  <div>
                    <div style={{ fontSize:10, color:'#64748b', fontWeight:700, letterSpacing:0.6 }}>{isAr?'التاريخ':'DATE'}</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#e2e8f0', marginTop:2 }}>{fmtGateDate(item.sessionDate)}</div>
                  </div>
                  {item.departmentName && (
                    <div>
                      <div style={{ fontSize:10, color:'#64748b', fontWeight:700, letterSpacing:0.6 }}>
                        {item.gateType === 'MONEY_REQUEST' ? (isAr?'رقم الطلب':'REF #') : (isAr?'القسم':'DEPT')}
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#e2e8f0', marginTop:2 }}>{item.departmentName}</div>
                    </div>
                  )}
                </div>

                {/* Confirm button */}
                <button
                  onClick={() => onConfirm(item)}
                  disabled={isConf}
                  style={{
                    width:'100%', padding:'15px', borderRadius:14, border:'none',
                    background: isConf ? '#334155' : 'linear-gradient(135deg,#15803d,#16a34a)',
                    color: isConf ? '#64748b' : '#fff',
                    fontSize:15, fontWeight:900, cursor: isConf ? 'default' : 'pointer',
                    boxShadow: isConf ? 'none' : '0 4px 16px rgba(22,163,74,0.4)',
                    letterSpacing:0.3, display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  }}>
                  {isConf
                    ? <><span style={{display:'inline-block',width:16,height:16,border:'2px solid #475569',borderTop:'2px solid #94a3b8',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>{isAr?'جاري التأكيد…':'Confirming…'}</>
                    : <>{isAr ? '✓ أؤكد استلام هذا المبلغ' : '✓ I Confirm Receipt of This Payment'}</>
                  }
                </button>
              </div>
            </div>
          )
        })}

        {/* Confirm all (if more than 1) */}
        {items.length > 1 && (
          <button
            onClick={onConfirmAll}
            disabled={!!confirming}
            style={{
              width:'100%', padding:'14px', borderRadius:14, border:'1.5px solid #334155',
              background:'transparent', color:'#94a3b8',
              fontSize:13, fontWeight:700, cursor: confirming ? 'default' : 'pointer',
              marginBottom:8,
            }}>
            {isAr ? `✓✓ تأكيد جميع ${items.length} دفعات دفعةً واحدة` : `✓✓ Confirm All ${items.length} Payments at Once`}
          </button>
        )}
      </div>

      {/* Switch user */}
      <div style={{ flexShrink:0, padding:'12px 16px 32px', borderTop:'1px solid #1e293b', textAlign:'center' }}>
        <button
          onClick={onSwitchUser}
          style={{ background:'none', border:'1px solid #334155', borderRadius:10, padding:'10px 24px', fontSize:12, color:'#475569', cursor:'pointer' }}>
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
  const [view,          setView]          = useState('home')   // 'home' | 'notifs' | 'confirmations'
  const [notifications, setNotifications] = useState([])
  const [confirmItems,  setConfirmItems]  = useState([])
  const [confirming,    setConfirming]    = useState(null)     // item.id being confirmed

  // ── Gate state — blocks form grid until all pending lines confirmed ────────
  const [pendingGate,    setPendingGate]    = useState([])
  const [gateReady,      setGateReady]      = useState(false)   // true once gate check done
  const [gateConfirming, setGateConfirming] = useState(null)    // line.id being confirmed in gate

  const isAr = lang === 'ar'

  // ── Load data when auth resolves ─────────────────────────────────────────
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

    // 1. Pending field payments for this employee
    const { data: payments } = await supabase
      .from('field_payments')
      .select(`
        id, payment_date, total_amount, payment_method, notes,
        project:project_id ( project_name ),
        submitter:submitted_by ( full_name_en )
      `)
      .eq('employee_id', empId)
      .eq('ack_status', 'PENDING')
      .order('payment_date', { ascending: false })
      .limit(20)

    for (const p of payments || []) {
      items.push({
        id:            p.id,
        type:          'PAYMENT',
        amount:        p.total_amount,
        date:          p.payment_date,
        paymentMethod: p.payment_method,
        project:       p.project?.project_name,
        submittedBy:   p.submitter?.full_name_en,
        notes:         p.notes,
      })
    }

    // 2. Pending food allowances where this employee is a beneficiary
    const { data: foodAllowances } = await supabase
      .from('food_allowances')
      .select(`
        id, allowance_date, beneficiaries,
        submitter:employee_id ( full_name_en ),
        project:project_id ( project_name )
      `)
      .order('allowance_date', { ascending: false })
      .limit(50)

    for (const fa of foodAllowances || []) {
      const bens = fa.beneficiaries || []
      const mine = bens.find(b => b.id === empId && b.ack_status === 'PENDING')
      if (mine) {
        items.push({
          id:          fa.id,
          type:        'FOOD',
          amount:      20, // OUTSOURCE_RATE
          date:        fa.allowance_date,
          project:     fa.project?.project_name,
          submittedBy: fa.submitter?.full_name_en,
        })
      }
    }

    setConfirmItems(items)
  }, [auth.employee?.id])

  // ── Confirm action ───────────────────────────────────────────────────────
  async function handleConfirm(item) {
    setConfirming(item.id)
    try {
      if (item.type === 'PAYMENT') {
        await supabase
          .from('field_payments')
          .update({
            ack_status: 'CONFIRMED',
            ack_at:     new Date().toISOString(),
            ack_by:     auth.employee.id,
          })
          .eq('id', item.id)
      } else if (item.type === 'FOOD') {
        await supabase.rpc('acknowledge_food_allowance', {
          p_allowance_id: item.id,
          p_employee_id:  auth.employee.id,
        })
      }
      await loadConfirmations()
    } finally {
      setConfirming(null)
    }
  }

  async function markAllNotificationsRead() {
    if (!auth.employee?.id) return
    await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('employee_id', auth.employee.id)
      .eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  // ── Gate: load pending field_payment_lines + money_request DH acks ────────
  const loadGate = useCallback(async () => {
    if (!auth.employee?.id) { setGateReady(true); return }
    const empId = auth.employee.id
    const gateItems = []

    // 1. Pending field payment lines for this employee
    const { data: lines } = await supabase
      .from('field_payment_lines')
      .select('id, amount, bank_charge_amount, session_id, ack_status')
      .eq('employee_id', empId)
      .eq('ack_status', 'PENDING')

    if (lines?.length) {
      // Fetch session details flat (avoid nested join)
      const sessionIds = [...new Set(lines.map(l => l.session_id).filter(Boolean))]
      let sessMap = {}
      if (sessionIds.length) {
        const { data: sessions } = await supabase
          .from('field_payment_sessions')
          .select('id, session_date, department_name')
          .in('id', sessionIds)
        ;(sessions || []).forEach(s => { sessMap[s.id] = s })
      }
      lines.forEach(l => gateItems.push({
        id:             l.id,
        gateType:       'FIELD_LINE',
        amount:         l.amount,
        bank_charge_amount: l.bank_charge_amount,
        sessionDate:    sessMap[l.session_id]?.session_date    || null,
        departmentName: sessMap[l.session_id]?.department_name || null,
      }))
    }

    // 2. Pending DH money-request acknowledgments (only if dh_ack_status column exists)
    const { data: mrs } = await supabase
      .from('money_requests')
      .select('id, request_number, requested_amount, status, dh_ack_status, submitted_at')
      .eq('requested_by', empId)
      .eq('dh_ack_status', 'PENDING')
      .limit(10)

    if (mrs?.length) {
      mrs.forEach(mr => gateItems.push({
        id:             mr.id,
        gateType:       'MONEY_REQUEST',
        amount:         mr.requested_amount,
        bank_charge_amount: 0,
        sessionDate:    mr.submitted_at,
        departmentName: mr.request_number || null,
        label:          'Money Request Disbursed',
      }))
    }

    setPendingGate(gateItems)
    setGateReady(true)
  }, [auth.employee?.id])

  // ── Gate: confirm a single item (field line OR money request) ────────────
  async function confirmGateItem(item) {
    if (gateConfirming) return
    setGateConfirming(item.id)
    const now = new Date().toISOString()
    let error = null

    if (item.gateType === 'FIELD_LINE') {
      ;({ error } = await supabase
        .from('field_payment_lines')
        .update({ ack_status: 'CONFIRMED', ack_at: now })
        .eq('id', item.id)
        .eq('ack_status', 'PENDING'))
    } else if (item.gateType === 'MONEY_REQUEST') {
      ;({ error } = await supabase
        .from('money_requests')
        .update({ dh_ack_status: 'CONFIRMED', dh_ack_at: now, dh_ack_by: auth.employee.id })
        .eq('id', item.id)
        .eq('dh_ack_status', 'PENDING'))
    }

    if (!error) {
      setPendingGate(prev => prev.filter(g => g.id !== item.id))
    } else {
      alert('Could not confirm. Please try again.')
    }
    setGateConfirming(null)
  }

  // ── Gate: confirm all at once (field lines only — MR acks must be one-by-one) ─
  async function confirmAllGateItems() {
    if (gateConfirming || !pendingGate.length) return
    const lineIds = pendingGate.filter(g => g.gateType === 'FIELD_LINE').map(g => g.id)
    const mrItems = pendingGate.filter(g => g.gateType === 'MONEY_REQUEST')

    setGateConfirming('ALL')
    const now = new Date().toISOString()

    // Confirm all field lines in one update
    if (lineIds.length) {
      await supabase
        .from('field_payment_lines')
        .update({ ack_status: 'CONFIRMED', ack_at: now })
        .in('id', lineIds)
        .eq('ack_status', 'PENDING')
    }

    // Confirm each money request ack
    for (const mr of mrItems) {
      await supabase
        .from('money_requests')
        .update({ dh_ack_status: 'CONFIRMED', dh_ack_at: now, dh_ack_by: auth.employee.id })
        .eq('id', mr.id)
        .eq('dh_ack_status', 'PENDING')
    }

    setPendingGate([])
    setGateConfirming(null)
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (auth.loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#1a2540 0%,#2d3a6b 50%,#1a4480 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' }}>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        <div style={{ fontSize: 15, fontWeight: 900, color: 'rgba(255,255,255,0.5)', letterSpacing: 3, marginBottom: 40, textTransform: 'uppercase' }}>ACCSYS</div>
        <div style={{ width: 52, height: 52, border: '4px solid rgba(255,255,255,0.15)', borderTop: '4px solid rgba(255,255,255,0.8)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', marginBottom: 20 }} />
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>Verifying your identity…</div>
      </div>
    )
  }

  // ── No token / error ─────────────────────────────────────────────────────
  if (!auth.employee) return <ScanQRScreen error={auth.error} />

  // ── Gate loading (brief check after auth resolves) ────────────────────────
  if (!gateReady) {
    return (
      <div style={{ minHeight:'100vh', background:'linear-gradient(160deg,#1a2540 0%,#2d3a6b 50%,#1a4480 100%)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontFamily:'Arial, sans-serif' }}>
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        <div style={{ fontSize:15, fontWeight:900, color:'rgba(255,255,255,0.5)', letterSpacing:3, marginBottom:40, textTransform:'uppercase' }}>ACCSYS</div>
        <div style={{ width:52, height:52, border:'4px solid rgba(255,255,255,0.15)', borderTop:'4px solid rgba(255,255,255,0.8)', borderRadius:'50%', animation:'spin 0.8s linear infinite', marginBottom:20 }} />
        <div style={{ color:'rgba(255,255,255,0.6)', fontSize:14 }}>Checking pending confirmations…</div>
      </div>
    )
  }

  // ── GATE: block forms if pending field payment lines exist ────────────────
  if (pendingGate.length > 0) {
    return (
      <PaymentGateScreen
        items={pendingGate}
        confirming={gateConfirming}
        onConfirm={confirmGateItem}
        onConfirmAll={confirmAllGateItems}
        empName={auth.employee?.full_name_en || ''}
        isAr={isAr}
        onSwitchUser={auth.logout}
      />
    )
  }

  // ── Sub-views ────────────────────────────────────────────────────────────
  if (view === 'notifs') {
    return (
      <NotificationsView
        notifications={notifications}
        isAr={isAr}
        onMarkAllRead={markAllNotificationsRead}
        onBack={() => setView('home')}
      />
    )
  }

  if (view === 'confirmations') {
    return (
      <ConfirmationsView
        items={confirmItems}
        confirming={confirming}
        isAr={isAr}
        onConfirm={handleConfirm}
        onBack={() => setView('home')}
      />
    )
  }

  // ── Home view ────────────────────────────────────────────────────────────
  const emp       = auth.employee
  const role      = auth.role
  const roleLabel = ROLE_LABELS[role] || role
  const roleColor = ROLE_COLORS[role] || '#37474f'
  const firstName = (emp.full_name_en || '').split(' ')[0]

  const unreadNotifs  = notifications.filter(n => !n.is_read).length
  const alertCount    = notifications.filter(n => !n.is_read && (n.type || '').includes('ALERT')).length
  const pendingConf   = confirmItems.length

  // Role-filtered form cards
  const visibleForms = FORM_CATALOGUE.filter(f => auth.allowedForms.includes(f.key))

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: 'Arial, sans-serif', maxWidth: 480, margin: '0 auto' }} dir={isAr ? 'rtl' : 'ltr'}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(145deg,#1a2540 0%,#2d3a6b 60%,#1a4480 100%)', padding: '20px 20px 24px' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#fff', letterSpacing: 2, opacity: 0.9 }}>ACCSYS</div>
          <button
            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#fff', fontFamily: 'Arial, sans-serif' }}
            onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')}
          >
            {isAr ? 'EN' : 'عربي'}
          </button>
        </div>

        {/* Employee identity */}
        <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 5, letterSpacing: 0.3 }}>
          {isAr ? (emp.full_name_ar || emp.full_name_en) : emp.full_name_en}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span>🏢</span>
          <span>
            {emp.department?.dept_code
              ? `${emp.department.dept_code} — ${emp.department.dept_name}`
              : (emp.designation || emp.job_title || '')}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ background: roleColor, color: '#fff', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {roleLabel}
          </span>
          <span style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {auth.employmentType}
          </span>
          {auth.assignments?.length > 0 && (
            <span style={{ background: 'rgba(255,255,255,0.12)', color: '#fff', borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 800, letterSpacing: 0.5 }}>
              {auth.assignments.length} {isAr ? 'موقع' : 'site(s)'}
            </span>
          )}
        </div>
      </div>

      {/* ── GREETING ────────────────────────────────────────────────────── */}
      <div style={{ background: T.card, padding: '13px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
            {getGreeting(isAr)}, {firstName} 👋
          </div>
          <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
            {isAr ? 'ماذا تريد أن تفعل اليوم؟' : "What would you like to do today?"}
          </div>
        </div>
        <div style={{ background: '#f8fafc', border: `1px solid ${T.border}`, borderRadius: 10, padding: '6px 12px', fontSize: 11, color: T.muted, textAlign: 'center', minWidth: 70 }}>
          <div style={{ fontWeight: 800, color: T.text, fontSize: 13 }}>
            {new Date().toLocaleDateString('en-SA', { day: 'numeric', month: 'short' })}
          </div>
          <div>{new Date().toLocaleDateString('en-SA', { weekday: 'short' })}</div>
        </div>
      </div>

      {/* ── INBOX SECTION ───────────────────────────────────────────────── */}
      <div style={{ background: T.card, marginTop: 10, borderTop: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ padding: '10px 16px 6px', fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
          {isAr ? 'صندوق الوارد' : 'Inbox'}
        </div>
        <InboxRow
          icon="🔔"
          label="Notifications"    labelAr="الإشعارات"
          count={unreadNotifs}
          color={T.blue}
          isAr={isAr}
          onClick={() => setView('notifs')}
        />
        <InboxRow
          icon="⚠️"
          label="Alerts"           labelAr="التنبيهات"
          count={alertCount}
          color={T.orange}
          isAr={isAr}
          onClick={() => setView('notifs')}
        />
        <InboxRow
          icon="✅"
          label="Confirmations"    labelAr="تأكيدات الاستلام"
          count={pendingConf}
          color={T.green}
          isAr={isAr}
          onClick={() => setView('confirmations')}
        />
      </div>

      {/* ── ACTIVE SITES STRIP ──────────────────────────────────────────── */}
      {auth.assignments?.length > 0 && (
        <div style={{ background: '#fff7ed', borderBottom: '1px solid #fed7aa', padding: '10px 16px', overflowX: 'auto', whiteSpace: 'nowrap', marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#92400e', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            📍 {isAr ? 'مواقعك المخصصة' : 'Your Active Sites'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {auth.assignments.map(a => (
              <div key={a.id} style={{ background: '#fff', border: '1.5px solid #fed7aa', borderRadius: 10, padding: '6px 12px', fontSize: 12, display: 'inline-flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                <span style={{ fontWeight: 800, color: '#92400e' }}>{a.site_number || a.project?.project_number || '—'}</span>
                <span style={{ fontSize: 10, color: '#b45309' }}>{a.project?.project_name?.slice(0, 20) || a.site_name?.slice(0, 20) || ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── FORM CARDS GRID ─────────────────────────────────────────────── */}
      {visibleForms.length > 0 && (
        <div>
          <div style={{ padding: '14px 16px 8px', fontSize: 11, fontWeight: 800, color: T.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {isAr ? 'النماذج المتاحة' : 'Your Forms'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '0 14px 14px' }}>
            {visibleForms.map(form => (
              <FormCard
                key={form.key}
                form={form}
                isAr={isAr}
                onClick={() => navigate(form.route)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '20px 20px 48px', textAlign: 'center' }}>
        <button
          style={{ background: 'none', border: '1.5px solid #cbd5e1', borderRadius: 10, padding: '10px 24px', fontSize: 13, color: '#64748b', cursor: 'pointer', fontWeight: 600, fontFamily: 'Arial, sans-serif' }}
          onClick={auth.logout}
        >
          🔄 {isAr ? 'تغيير المستخدم' : 'Switch User'}
        </button>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 10 }}>
          {isAr ? 'امسح رمز QR الخاص بك مرة أخرى لإعادة تسجيل الدخول' : 'Scan your QR code again to log back in'}
        </div>
      </div>

    </div>
  )
}
