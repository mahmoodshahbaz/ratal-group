/**
 * FormLanding.jsx  — /forms
 *
 * Three fully-separate views via bottom-nav:
 *   'home'          — cream: employee profile only
 *   'inbox'         — dark:  notifications + alerts inline, confirmations row
 *   'forms'         — dark:  hero tile + pastel 2-col grid
 *
 * Sub-views (no bottom-nav switch, still rendered with nav):
 *   'notifs'        — dark:  full notification list
 *   'confirmations' — light: pending receipt confirmations
 *
 * NOTE: ConfirmationsView is only accessible from the Inbox tab.
 * If that entry point is removed, confirmations would have no UI access
 * (the PaymentGateScreen only covers field_payment_lines and money_requests,
 * not field_payments or food_allowances ack). Keeping Confirmations in Inbox.
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate }                       from 'react-router-dom'
import { supabase }                          from '../lib/supabase'
import { useFieldAuth, ROLE_LABELS, ROLE_COLORS } from '../lib/useFieldAuth'
import { MP }                                from './formTheme'

// ── Pastel card colors per form ────────────────────────────────────────────────
const FORM_COLORS = {
  expense_daily:      '#F7D263',   // hero — Daily Expenses
  expense_claim:      '#BDDDF7',   // Expense Claim
  food_allowance:     '#FFD8B2',   // Food Allowance
  overtime:           '#D8C9F2',   // Overtime
  site_completion:    '#F7C6AE',   // Site Completion
  money_request:      '#C5E2D3',   // Money Request
  po_request:         '#B9E3E3',   // PO Request
  field_payment:      '#F6BEC9',   // Field Payment
  payment_validation: '#D4E6AB',   // Payment Validation
  payment_confirm:    '#D4E6AB',   // Field Receipt
  dh_dashboard:       '#E0C8BA',   // Command Centre
  // extras — neutral pastels
  subcon_claim:       '#D6EFD4',
  car_maintenance:    '#E0E8F0',
  cash_payment:       '#EDE9DE',
}

// ── Form catalogue ─────────────────────────────────────────────────────────────
const FORM_CATALOGUE = [
  { key:'expense_daily',      title:'Daily Expense',      titleAr:'المصروف اليومي',          desc:'Fuel, hotel, food & materials', descAr:'سجّل المصاريف اليومية',          icon:'📝', hero:true,  route:'/forms/daily-expense'      },
  { key:'expense_claim',      title:'Expense Claim',      titleAr:'مطالبة المصاريف',         desc:'Monthly claim',                 descAr:'مطالبة شهرية',                   icon:'🧾', route:'/forms/expense-claim'      },
  { key:'food_allowance',     title:'Food Allowance',     titleAr:'بدل الطعام',              desc:'Daily food allowance',          descAr:'بدل طعام يومي',                  icon:'🍽️', route:'/forms/food-allowance'     },
  { key:'overtime',           title:'Overtime',           titleAr:'عمل إضافي',               desc:'Request overtime approval',     descAr:'طلب اعتماد إضافي',               icon:'⏱️', route:'/forms/overtime'           },
  { key:'site_completion',    title:'Site Completion',    titleAr:'اكتمال الموقع',           desc:'Update milestones',             descAr:'تحديث نسبة الاكتمال',            icon:'🏗️', route:'/forms/site-completion'    },
  { key:'money_request',      title:'Money Request',      titleAr:'طلب مالي',                desc:'Cash or transfer',              descAr:'طلب صرف أو تحويل',               icon:'💰', route:'/forms/money-request'      },
  { key:'po_request',         title:'PO Request',         titleAr:'طلب أمر شراء',            desc:'Request a purchase order',      descAr:'طلب إصدار أمر شراء',             icon:'📋', route:'/forms/po-request'         },
  { key:'field_payment',      title:'Field Payment',      titleAr:'دفعة ميدانية',            desc:'Cash, POS or transfer',         descAr:'دفعة نقدية أو تحويل',            icon:'🏦', route:'/forms/field-payment'      },
  { key:'subcon_claim',       title:'Sub-Con Claim',      titleAr:'مطالبة مقاول الباطن',     desc:'Work completion & hours',       descAr:'إنجاز الأعمال والساعات',         icon:'👷', route:'/forms/subcon-claim'       },
  { key:'car_maintenance',    title:'Car Maintenance',    titleAr:'صيانة السيارة',           desc:'Maintenance or incidents',      descAr:'صيانة أو حادث',                  icon:'🚗', route:'/forms/car-maintenance'    },
  { key:'payment_validation', title:'Payment Confirm',    titleAr:'تأكيد الدفعة',            desc:'Confirm advance receipt',       descAr:'تأكيد استلام السلفة',            icon:'💳', route:'/forms/payment-validation' },
  { key:'payment_confirm',    title:'Field Receipt',      titleAr:'استلام الدفعة الميدانية', desc:'Confirm field disbursement',    descAr:'تأكيد استلام المبلغ',            icon:'✅', route:'/forms/payment-confirm'    },
  { key:'cash_payment',       title:'Cash Voucher',       titleAr:'سند صرف نقدي',            desc:'Record a cash payment',         descAr:'تسجيل دفعة نقدية',               icon:'💵', route:'/forms/cash-payment'       },
  { key:'dh_dashboard',       title:'Command Centre',     titleAr:'مركز القيادة',            desc:'Cash · Sites · Claims · Team',  descAr:'نقد · مواقع · مطالبات · فريق',  icon:'⚡', route:'/forms/dh-dashboard'       },
]

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt      = n => parseFloat(n || 0).toLocaleString('en-SA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtGate  = n => Number(n || 0).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate  = d => d ? new Date(d).toLocaleDateString('en-SA', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
const fmtShort = d => d ? new Date(d).toLocaleDateString('en-SA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const initials = name => (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()

function getGreeting(isAr) {
  const h = new Date().getHours()
  if (isAr) { if (h < 12) return 'صباح الخير'; if (h < 17) return 'مساء الخير'; return 'مساء النور' }
  if (h < 12) return 'Good morning'; if (h < 17) return 'Good afternoon'; return 'Good evening'
}

const ERROR_MESSAGES = {
  invalid_token:    { en: 'This QR code is not recognised. Please request a new one from your admin.', ar: 'رمز QR غير معروف. يرجى طلب رمز جديد من المشرف.' },
  token_inactive:   { en: 'This QR code has been deactivated. Contact your admin.', ar: 'تم إلغاء تفعيل رمز QR. تواصل مع المشرف.' },
  employee_inactive:{ en: 'Your account is no longer active. Contact HR.', ar: 'حسابك غير نشط. تواصل مع الموارد البشرية.' },
}

// ── Bottom navigation ──────────────────────────────────────────────────────────
function BottomNav({ current, onHome, onInbox, onForms, unreadCount, isAr }) {
  const isDark        = current !== 'home'
  const navBg         = isDark ? MP.charcoal : MP.cream
  const borderClr     = isDark ? '#2D302A'  : '#E4E0D3'
  const inactiveColor = isDark ? MP.textMutedDark : MP.textMutedLight
  const activeKey     = (current === 'notifs' || current === 'confirmations') ? 'inbox' : current

  const tabs = [
    { key:'home',  icon:'🏠', label: isAr ? 'الرئيسية' : 'Home',  action: onHome },
    { key:'inbox', icon:'📥', label: isAr ? 'الوارد'   : 'Inbox', action: onInbox, badge: unreadCount },
    { key:'forms', icon:'📋', label: isAr ? 'النماذج'  : 'Forms', action: onForms },
  ]

  return (
    <div style={{
      position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)',
      width:'100%', maxWidth:480,
      background: navBg, borderTop:`1px solid ${borderClr}`,
      display:'flex', paddingBottom:'env(safe-area-inset-bottom, 10px)', zIndex:100,
    }}>
      {tabs.map(tab => {
        const active = activeKey === tab.key
        return (
          <button key={tab.key} onClick={tab.action} style={{
            flex:1, display:'flex', flexDirection:'column', alignItems:'center',
            gap:3, padding:'10px 0 6px',
            background:'transparent', border:'none', cursor:'pointer', position:'relative',
          }}>
            {active && (
              <div style={{ position:'absolute', top:0, left:'50%', transform:'translateX(-50%)', width:32, height:3, background:MP.yellow, borderRadius:'0 0 4px 4px' }} />
            )}
            <div style={{
              fontSize:18, background: active ? MP.yellow+'22' : 'transparent',
              borderRadius:10, width:36, height:28,
              display:'flex', alignItems:'center', justifyContent:'center', position:'relative',
            }}>
              {tab.icon}
              {tab.badge > 0 && (
                <div style={{ position:'absolute', top:0, right:-2, background:MP.yellow, color:MP.textDark, borderRadius:10, minWidth:16, height:16, fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px', fontFamily:MP.font }}>
                  {tab.badge > 99 ? '99+' : tab.badge}
                </div>
              )}
            </div>
            <div style={{ fontSize:11, fontWeight: active ? 700 : 500, color: active ? (isDark ? MP.textOnDark : MP.textDark) : inactiveColor, fontFamily:MP.font }}>
              {tab.label}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Scan QR screen ─────────────────────────────────────────────────────────────
function ScanQRScreen({ error, debugError }) {
  const [lang, setLang] = useState('en')
  const isAr   = lang === 'ar'
  const errMsg = error && error !== 'no_token' ? ERROR_MESSAGES[error] : null
  return (
    <div style={{ minHeight:'100vh', background:MP.charcoal, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:32, fontFamily:MP.font, textAlign:'center' }}>
      <div style={{ fontSize:13, fontWeight:700, color:MP.textMutedDark, letterSpacing:3, marginBottom:48, textTransform:'uppercase' }}>ACCSYS</div>
      <div style={{ width:110, height:110, background:'rgba(247,210,99,0.08)', borderRadius:28, display:'flex', alignItems:'center', justifyContent:'center', fontSize:52, marginBottom:32, border:`1.5px solid rgba(247,210,99,0.25)` }}>📱</div>
      <div style={{ fontSize:22, fontWeight:700, color:MP.textOnDark, marginBottom:10, fontFamily:MP.font }}>{isAr ? 'امسح رمز QR للمتابعة' : 'Scan Your QR Code'}</div>
      <div style={{ fontSize:14, color:MP.textMutedDark, lineHeight:1.6, marginBottom:8, maxWidth:300 }}>
        {isAr ? 'احصل على رمز QR الخاص بك من مشرفك أو قسم الموارد البشرية' : 'Get your personal QR code from your supervisor or HR department'}
      </div>
      {errMsg && <div style={{ background:'rgba(220,50,50,0.12)', border:'1px solid rgba(220,50,50,0.3)', borderRadius:12, padding:'14px 20px', marginTop:24, color:'#F5A5A0', fontSize:13, lineHeight:1.5, maxWidth:300, fontFamily:MP.font }}>{isAr ? errMsg.ar : errMsg.en}</div>}
      {debugError && <div style={{ background:'rgba(247,210,99,0.1)', border:'1px solid rgba(247,210,99,0.3)', borderRadius:10, padding:'10px 16px', marginTop:12, color:MP.textOnDark, fontSize:11, lineHeight:1.5, maxWidth:320, wordBreak:'break-all', textAlign:'left', fontFamily:MP.font }}><strong style={{ color:MP.yellow }}>DEBUG:</strong> {debugError}</div>}
      <div style={{ fontSize:12, color:MP.textMutedDark, marginTop:40, lineHeight:1.7, fontFamily:MP.font }}>{isAr ? 'كل موظف لديه رمز QR شخصي خاص به' : 'Each employee has their own personal QR code'}</div>
      <button style={{ marginTop:48, background:'transparent', border:`1.5px solid ${MP.textMutedDark}`, borderRadius:20, padding:'10px 24px', fontSize:13, color:MP.textMutedDark, cursor:'pointer', fontWeight:600, fontFamily:MP.font }} onClick={() => setLang(l => l==='en'?'ar':'en')}>
        {isAr ? 'English' : 'عربي'}
      </button>
    </div>
  )
}

// ── Loading spinner ────────────────────────────────────────────────────────────
function LoadingScreen({ msg }) {
  return (
    <div style={{ minHeight:'100vh', background:MP.charcoal, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontFamily:MP.font }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <div style={{ fontSize:13, fontWeight:700, color:MP.textMutedDark, letterSpacing:3, marginBottom:40, textTransform:'uppercase' }}>ACCSYS</div>
      <div style={{ width:48, height:48, border:`3px solid rgba(247,210,99,0.2)`, borderTop:`3px solid ${MP.yellow}`, borderRadius:'50%', animation:'spin 0.8s linear infinite', marginBottom:20 }} />
      <div style={{ color:MP.textMutedDark, fontSize:14 }}>{msg || 'Loading…'}</div>
    </div>
  )
}

// ── Hero card — Daily Expenses (full width, yellow) ────────────────────────────
function HeroCard({ form, isAr, onClick }) {
  const [pressed, setPressed] = useState(false)
  return (
    <div style={{ background:MP.yellow, borderRadius:20, cursor:'pointer', transition:'transform 0.12s', transform: pressed ? 'scale(0.97)' : 'scale(1)', padding:'22px 22px 20px', position:'relative', overflow:'hidden', userSelect:'none', WebkitTapHighlightColor:'transparent', marginBottom:12 }}
      onPointerDown={() => setPressed(true)} onPointerUp={() => { setPressed(false); onClick() }} onPointerLeave={() => setPressed(false)}>
      <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.18)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', bottom:-20, left:10, width:70, height:70, borderRadius:'50%', background:'rgba(0,0,0,0.06)', pointerEvents:'none' }} />
      <div style={{ display:'flex', alignItems:'flex-start', gap:16, position:'relative' }}>
        <div style={{ width:58, height:58, borderRadius:18, background:'rgba(255,255,255,0.4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:30, flexShrink:0, border:'1.5px solid rgba(255,255,255,0.5)' }}>
          {form.icon}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:18, fontWeight:700, color:MP.textDark, marginBottom:4, fontFamily:MP.font }}>{isAr ? form.titleAr : form.title}</div>
          <div style={{ fontSize:13, color:MP.textDark, opacity:0.65, lineHeight:1.4, fontFamily:MP.font }}>{isAr ? form.descAr : form.desc}</div>
        </div>
      </div>
      <div style={{ marginTop:18, display:'flex', justifyContent:'flex-end' }}>
        <div style={{ background:'rgba(0,0,0,0.1)', borderRadius:20, padding:'6px 16px', fontSize:12, fontWeight:700, color:MP.textDark, fontFamily:MP.font }}>
          {isAr ? '← فتح' : 'Open →'}
        </div>
      </div>
    </div>
  )
}

// ── Pastel form card (2-col grid) ──────────────────────────────────────────────
function PastelCard({ form, isAr, onClick }) {
  const [pressed, setPressed] = useState(false)
  const bg = FORM_COLORS[form.key] || '#EDE9DE'
  // Derive a slightly darker tone for text/icon from the pastel bg
  return (
    <div style={{ background:bg, borderRadius:18, cursor:'pointer', transition:'transform 0.12s', transform: pressed ? 'scale(0.95)' : 'scale(1)', padding:'18px 16px 16px', position:'relative', overflow:'hidden', userSelect:'none', WebkitTapHighlightColor:'transparent', border:'1.5px solid rgba(0,0,0,0.06)', minHeight:120, display:'flex', flexDirection:'column', justifyContent:'space-between' }}
      onPointerDown={() => setPressed(true)} onPointerUp={() => { setPressed(false); onClick() }} onPointerLeave={() => setPressed(false)}>
      <div>
        <div style={{ fontSize:28, marginBottom:10, lineHeight:1 }}>{form.icon}</div>
        <div style={{ fontSize:13, fontWeight:700, color:MP.textDark, lineHeight:1.3, fontFamily:MP.font, marginBottom:4 }}>
          {isAr ? form.titleAr : form.title}
        </div>
        <div style={{ fontSize:10, color:MP.textDark, opacity:0.6, lineHeight:1.4, fontFamily:MP.font }}>
          {isAr ? form.descAr : form.desc}
        </div>
      </div>
      <div style={{ marginTop:12, display:'flex', justifyContent:'flex-end' }}>
        <div style={{ fontSize:11, fontWeight:700, color:MP.textDark, opacity:0.5, fontFamily:MP.font }}>›</div>
      </div>
    </div>
  )
}

// ── Inbox row ──────────────────────────────────────────────────────────────────
function InboxRow({ icon, label, labelAr, count, color, isAr, onClick }) {
  return (
    <div onClick={onClick} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px', borderBottom:`1px solid #3A3D35`, cursor:'pointer', WebkitTapHighlightColor:'transparent' }}>
      <div style={{ width:40, height:40, borderRadius:12, background: count > 0 ? color+'22' : '#363830', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0, border: count > 0 ? `1px solid ${color}44` : 'none' }}>
        {icon}
      </div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:14, fontWeight:600, color:MP.textOnDark, fontFamily:MP.font }}>{isAr ? labelAr : label}</div>
        <div style={{ fontSize:12, color:MP.textMutedDark, marginTop:2, fontFamily:MP.font }}>
          {count > 0 ? (isAr ? `${count} معلّقة` : `${count} pending`) : (isAr ? 'لا يوجد شيء جديد' : 'Nothing new')}
        </div>
      </div>
      {count > 0 && (
        <div style={{ background:MP.yellow, color:MP.textDark, borderRadius:20, minWidth:26, height:26, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, padding:'0 8px', fontFamily:MP.font }}>
          {count}
        </div>
      )}
      <div style={{ color:MP.textMutedDark, fontSize:16, flexShrink:0 }}>›</div>
    </div>
  )
}

// ── Notifications sub-view ─────────────────────────────────────────────────────
function NotificationsView({ notifications, isAr, onMarkAllRead, onBack }) {
  const ICONS = { SALARY:'💵', PAYMENT:'✅', APPROVAL:'✅', EXPENSE:'🧾', CAR:'🚗', FOOD:'🍽️', ALERT:'⚠️', GENERAL:'🔔' }
  const getIcon = type => { const k = Object.keys(ICONS).find(k => (type||'').includes(k)); return ICONS[k] || '🔔' }
  const unread  = notifications.filter(n => !n.is_read)
  return (
    <div style={{ minHeight:'100vh', background:MP.charcoal, fontFamily:MP.font, paddingBottom:90 }}>
      <div style={{ background:MP.darkCard, padding:'16px 18px', display:'flex', alignItems:'center', gap:14, borderBottom:'1px solid #3A3D35' }}>
        <button onClick={onBack} style={{ background:'rgba(247,210,99,0.12)', border:`1px solid rgba(247,210,99,0.2)`, borderRadius:20, padding:'7px 16px', color:MP.yellow, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:MP.font }}>
          ← {isAr ? 'رجوع' : 'Back'}
        </button>
        <div style={{ flex:1, fontSize:17, fontWeight:700, color:MP.textOnDark, fontFamily:MP.font }}>{isAr ? 'الإشعارات' : 'Notifications'}</div>
        {unread.length > 0 && (
          <button onClick={onMarkAllRead} style={{ background:'transparent', border:`1px solid #3A3D35`, borderRadius:20, padding:'7px 14px', color:MP.textMutedDark, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:MP.font }}>
            {isAr ? 'قراءة الكل' : 'Mark all read'}
          </button>
        )}
      </div>
      {notifications.length === 0 && (
        <div style={{ textAlign:'center', padding:'60px 20px', color:MP.textMutedDark, fontSize:14, fontFamily:MP.font }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🔔</div>
          {isAr ? 'لا توجد إشعارات' : 'No notifications yet'}
        </div>
      )}
      <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:8 }}>
        {notifications.map(n => (
          <div key={n.id} style={{ background: n.is_read ? MP.darkCard : '#2D302A', borderRadius:14, padding:'14px 16px', border:`1px solid ${n.is_read ? '#3A3D35' : 'rgba(247,210,99,0.2)'}`, display:'flex', gap:12, alignItems:'flex-start' }}>
            <span style={{ fontSize:22, flexShrink:0, marginTop:1 }}>{getIcon(n.type)}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight: n.is_read ? 500 : 700, color:MP.textOnDark, marginBottom:3, fontFamily:MP.font }}>{n.title}</div>
              {n.body && <div style={{ fontSize:12, color:MP.textMutedDark, lineHeight:1.4, fontFamily:MP.font }}>{n.body}</div>}
              {n.amount && <div style={{ fontSize:13, fontWeight:700, color:MP.yellow, marginTop:4, fontFamily:MP.font }}>SAR {fmt(n.amount)}</div>}
              <div style={{ fontSize:11, color:MP.textMutedDark, marginTop:5, fontFamily:MP.font }}>{fmtShort(n.created_at)}</div>
            </div>
            {!n.is_read && <div style={{ width:8, height:8, borderRadius:'50%', background:MP.yellow, flexShrink:0, marginTop:5 }} />}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Confirmations sub-view ─────────────────────────────────────────────────────
function ConfirmationsView({ items, confirming, isAr, onConfirm, onBack }) {
  const typeLabel = item => item.type==='FOOD' ? (isAr ? 'بدل طعام' : 'Food Allowance') : (isAr ? 'دفعة ميدانية' : 'Field Payment')
  const typeIcon  = type => type==='FOOD' ? '🍽️' : '💳'
  const typeColor = type => type==='FOOD' ? '#E07A5F' : '#4CAF82'
  return (
    <div style={{ minHeight:'100vh', background:MP.cream, fontFamily:MP.font, paddingBottom:90 }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      <div style={{ background:MP.lightCard, padding:'16px 18px', display:'flex', alignItems:'center', gap:14, borderBottom:'1px solid #E4E0D3' }}>
        <button onClick={onBack} style={{ background:'transparent', border:'1.5px solid #D5D2C5', borderRadius:20, padding:'7px 16px', color:MP.textMutedLight, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:MP.font }}>
          ← {isAr ? 'رجوع' : 'Back'}
        </button>
        <div style={{ flex:1, fontSize:17, fontWeight:700, color:MP.textDark, fontFamily:MP.font }}>{isAr ? 'تأكيد الاستلام' : 'Confirm Receipt'}</div>
        {items.length > 0 && <div style={{ background:MP.yellow, color:MP.textDark, borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:700, fontFamily:MP.font }}>{items.length}</div>}
      </div>
      <div style={{ background:'rgba(197,230,160,0.25)', borderBottom:'1px solid rgba(197,230,160,0.5)', padding:'11px 16px', fontSize:12, color:'#3A6B2A', lineHeight:1.5, fontFamily:MP.font }}>
        {isAr ? 'يرجى مراجعة كل بند والضغط على "تأكيد الاستلام".' : 'Review each item and tap Confirm Receipt to acknowledge.'}
      </div>
      {items.length === 0 && (
        <div style={{ textAlign:'center', padding:'60px 20px', color:MP.textMutedLight, fontSize:14, fontFamily:MP.font }}>
          <div style={{ fontSize:40, marginBottom:12 }}>✅</div>
          {isAr ? 'لا توجد بنود معلقة' : 'No pending confirmations'}
        </div>
      )}
      <div style={{ padding:14, display:'flex', flexDirection:'column', gap:12 }}>
        {items.map(item => {
          const color  = typeColor(item.type)
          const isConf = confirming === item.id
          return (
            <div key={item.id} style={{ background:MP.lightCard, borderRadius:16, overflow:'hidden', border:'1px solid #E4E0D3' }}>
              <div style={{ background:color, height:4 }} />
              <div style={{ padding:'16px 16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:22 }}>{typeIcon(item.type)}</span>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:MP.textDark, fontFamily:MP.font }}>{typeLabel(item)}</div>
                      <div style={{ fontSize:11, color:MP.textMutedLight, fontFamily:MP.font }}>{fmtDate(item.date)}</div>
                    </div>
                  </div>
                  <div style={{ fontSize:20, fontWeight:700, color, fontFamily:MP.font }}>SAR {fmt(item.amount)}</div>
                </div>
                <div style={{ background:'#F8F7F2', borderRadius:10, padding:'10px 12px', marginBottom:14, display:'flex', flexDirection:'column', gap:6 }}>
                  {item.project    && <div style={{ display:'flex', gap:8 }}><span style={{ fontSize:11, color:MP.textMutedLight, minWidth:80, fontFamily:MP.font }}>{isAr ? 'المشروع' : 'Project'}</span><span style={{ fontSize:11, fontWeight:600, color:MP.textDark, fontFamily:MP.font }}>{item.project}</span></div>}
                  {item.submittedBy && <div style={{ display:'flex', gap:8 }}><span style={{ fontSize:11, color:MP.textMutedLight, minWidth:80, fontFamily:MP.font }}>{isAr ? 'قدّم بواسطة' : 'Submitted by'}</span><span style={{ fontSize:11, fontWeight:600, color:MP.textDark, fontFamily:MP.font }}>{item.submittedBy}</span></div>}
                  {item.notes      && <div style={{ display:'flex', gap:8 }}><span style={{ fontSize:11, color:MP.textMutedLight, minWidth:80, fontFamily:MP.font }}>{isAr ? 'ملاحظات' : 'Notes'}</span><span style={{ fontSize:11, color:MP.textDark, fontFamily:MP.font }}>{item.notes}</span></div>}
                </div>
                <button onClick={() => onConfirm(item)} disabled={isConf} style={{ width:'100%', padding:'13px 0', borderRadius:20, border:'none', background: isConf ? '#BBBAB5' : MP.green, color: isConf ? '#888' : MP.textDark, fontSize:14, fontWeight:700, cursor: isConf ? 'default' : 'pointer', fontFamily:MP.font, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  {isConf ? <><span style={{ display:'inline-block', width:16, height:16, border:'2px solid rgba(0,0,0,0.2)', borderTop:'2px solid #555', borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>{isAr ? 'جاري التأكيد…' : 'Confirming…'}</> : <>✅ {isAr ? 'تأكيد الاستلام' : 'Confirm Receipt'}</>}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Payment gate screen ────────────────────────────────────────────────────────
function PaymentGateScreen({ items, confirming, onConfirm, onConfirmAll, empName, isAr, onSwitchUser }) {
  const total = items.length
  return (
    <div style={{ position:'fixed', inset:0, background:MP.charcoal, display:'flex', flexDirection:'column', fontFamily:MP.font, maxWidth:480, margin:'0 auto' }}>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}`}</style>
      <div style={{ flexShrink:0, background:MP.darkCard, padding:'36px 24px 20px', borderBottom:'1px solid #3A3D35' }}>
        <div style={{ fontSize:12, fontWeight:700, color:MP.textMutedDark, letterSpacing:3, marginBottom:16, textTransform:'uppercase' }}>ACCSYS</div>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
          <div style={{ width:48, height:48, borderRadius:16, flexShrink:0, background:'rgba(247,210,99,0.12)', border:`2px solid rgba(247,210,99,0.3)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, animation:'pulse 2s ease-in-out infinite' }}>⚠️</div>
          <div>
            <div style={{ fontSize:18, fontWeight:700, color:MP.textOnDark, fontFamily:MP.font }}>{isAr ? 'مطلوب تأكيد الاستلام' : 'Confirmation Required'}</div>
            <div style={{ fontSize:12, color:MP.textMutedDark, marginTop:2, fontFamily:MP.font }}>{empName}</div>
          </div>
        </div>
        <div style={{ background:'rgba(247,210,99,0.1)', border:`1px solid rgba(247,210,99,0.3)`, borderRadius:12, padding:'12px 14px', fontSize:13, color:MP.yellow, lineHeight:1.6, fontFamily:MP.font }}>
          {isAr ? `لديك ${total} دفعة ميدانية بانتظار التأكيد. يجب تأكيد الاستلام قبل الوصول إلى أي نموذج.` : `You have ${total} field payment${total > 1 ? 's' : ''} pending acknowledgment. You must confirm receipt before accessing any forms.`}
        </div>
      </div>
      <div style={{ flex:1, overflowY:'auto', padding:'16px 16px 12px', WebkitOverflowScrolling:'touch' }}>
        {items.map(item => {
          const isConf = confirming === item.id
          const isMR   = item.gateType === 'MONEY_REQUEST'
          return (
            <div key={item.id} style={{ background:MP.darkCard, borderRadius:20, overflow:'hidden', marginBottom:12, border:'1px solid #3A3D35' }}>
              <div style={{ background: isMR ? 'linear-gradient(135deg,#7c3aed,#6d28d9)' : 'linear-gradient(135deg,#1d4ed8,#1e40af)', padding:'18px 20px' }}>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)', letterSpacing:1, marginBottom:4, fontFamily:MP.font }}>
                  {isMR ? (isAr ? 'طلب مالي — تم الصرف' : 'MONEY REQUEST — DISBURSED') : (isAr ? 'المبلغ المستلم' : 'FIELD PAYMENT RECEIVED')}
                </div>
                <div style={{ fontSize:30, fontWeight:700, color:'#fff', letterSpacing:-1, fontFamily:MP.font }}>SAR {fmtGate(item.amount)}</div>
                {Number(item.bank_charge_amount) > 0 && <div style={{ fontSize:11, color:'rgba(255,255,255,0.55)', marginTop:4, fontFamily:MP.font }}>+ SAR {fmtGate(item.bank_charge_amount)} {isAr ? 'رسوم بنكية' : 'bank charges'}</div>}
              </div>
              <div style={{ padding:'14px 20px 16px' }}>
                <div style={{ display:'flex', gap:20, marginBottom:14 }}>
                  <div>
                    <div style={{ fontSize:10, color:MP.textMutedDark, fontWeight:600, letterSpacing:0.6, fontFamily:MP.font }}>{isAr ? 'التاريخ' : 'DATE'}</div>
                    <div style={{ fontSize:13, fontWeight:600, color:MP.textOnDark, marginTop:2, fontFamily:MP.font }}>
                      {item.sessionDate ? new Date(item.sessionDate).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'}
                    </div>
                  </div>
                  {item.departmentName && (
                    <div>
                      <div style={{ fontSize:10, color:MP.textMutedDark, fontWeight:600, letterSpacing:0.6, fontFamily:MP.font }}>{isMR ? (isAr ? 'رقم الطلب' : 'REF #') : (isAr ? 'القسم' : 'DEPT')}</div>
                      <div style={{ fontSize:13, fontWeight:600, color:MP.textOnDark, marginTop:2, fontFamily:MP.font }}>{item.departmentName}</div>
                    </div>
                  )}
                </div>
                <button onClick={() => onConfirm(item)} disabled={isConf} style={{ width:'100%', padding:'14px', borderRadius:20, border:'none', background: isConf ? '#363830' : MP.green, color: isConf ? MP.textMutedDark : MP.textDark, fontSize:14, fontWeight:700, cursor: isConf ? 'default' : 'pointer', fontFamily:MP.font, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  {isConf ? <><span style={{ display:'inline-block', width:16, height:16, border:`2px solid #3A3D35`, borderTop:`2px solid ${MP.textMutedDark}`, borderRadius:'50%', animation:'spin 0.8s linear infinite' }}/>{isAr ? 'جاري التأكيد…' : 'Confirming…'}</> : <>{isAr ? '✓ أؤكد استلام هذا المبلغ' : '✓ I Confirm Receipt of This Payment'}</>}
                </button>
              </div>
            </div>
          )
        })}
        {items.length > 1 && (
          <button onClick={onConfirmAll} disabled={!!confirming} style={{ width:'100%', padding:'14px', borderRadius:20, border:`1.5px solid #3A3D35`, background:'transparent', color:MP.textMutedDark, fontSize:13, fontWeight:600, cursor: confirming ? 'default' : 'pointer', marginBottom:8, fontFamily:MP.font }}>
            {isAr ? `✓✓ تأكيد جميع ${items.length} دفعات دفعةً واحدة` : `✓✓ Confirm All ${items.length} Payments at Once`}
          </button>
        )}
      </div>
      <div style={{ flexShrink:0, padding:'12px 16px 32px', borderTop:'1px solid #3A3D35', textAlign:'center' }}>
        <button onClick={onSwitchUser} style={{ background:'none', border:`1px solid #3A3D35`, borderRadius:20, padding:'10px 24px', fontSize:12, color:MP.textMutedDark, cursor:'pointer', fontFamily:MP.font }}>
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
  const [view,          setView]          = useState('home')
  const [notifications, setNotifications] = useState([])
  const [confirmItems,  setConfirmItems]  = useState([])
  const [confirming,    setConfirming]    = useState(null)
  const [pendingGate,    setPendingGate]    = useState([])
  const [gateReady,      setGateReady]      = useState(false)
  const [gateConfirming, setGateConfirming] = useState(null)

  const isAr = lang === 'ar'

  useEffect(() => {
    if (auth.employee?.id) { loadNotifications(); loadConfirmations(); loadGate() }
  }, [auth.employee?.id])

  const loadNotifications = useCallback(async () => {
    if (!auth.employee?.id) return
    const { data } = await supabase.from('notifications').select('id,title,body,type,created_at,is_read,amount').eq('employee_id', auth.employee.id).order('created_at', { ascending:false }).limit(30)
    setNotifications(data || [])
  }, [auth.employee?.id])

  const loadConfirmations = useCallback(async () => {
    if (!auth.employee?.id) return
    const empId = auth.employee.id; const items = []
    const { data: payments } = await supabase.from('field_payments').select(`id, payment_date, total_amount, payment_method, notes, project:project_id(project_name), submitter:submitted_by(full_name_en)`).eq('employee_id', empId).eq('ack_status', 'PENDING').order('payment_date', { ascending:false }).limit(20)
    for (const p of payments || []) items.push({ id:p.id, type:'PAYMENT', amount:p.total_amount, date:p.payment_date, paymentMethod:p.payment_method, project:p.project?.project_name, submittedBy:p.submitter?.full_name_en, notes:p.notes })
    const { data: foodAllowances } = await supabase.from('food_allowances').select(`id, allowance_date, beneficiaries, submitter:employee_id(full_name_en), project:project_id(project_name)`).order('allowance_date', { ascending:false }).limit(50)
    for (const fa of foodAllowances || []) { const mine = (fa.beneficiaries || []).find(b => b.id === empId && b.ack_status === 'PENDING'); if (mine) items.push({ id:fa.id, type:'FOOD', amount:20, date:fa.allowance_date, project:fa.project?.project_name, submittedBy:fa.submitter?.full_name_en }) }
    setConfirmItems(items)
  }, [auth.employee?.id])

  async function handleConfirm(item) {
    setConfirming(item.id)
    try {
      if (item.type === 'PAYMENT') await supabase.from('field_payments').update({ ack_status:'CONFIRMED', ack_at:new Date().toISOString(), ack_by:auth.employee.id }).eq('id', item.id)
      else if (item.type === 'FOOD') await supabase.rpc('acknowledge_food_allowance', { p_allowance_id:item.id, p_employee_id:auth.employee.id })
      await loadConfirmations()
    } finally { setConfirming(null) }
  }

  async function markAllNotificationsRead() {
    if (!auth.employee?.id) return
    await supabase.from('notifications').update({ is_read:true, read_at:new Date().toISOString() }).eq('employee_id', auth.employee.id).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read:true })))
  }

  const loadGate = useCallback(async () => {
    if (!auth.employee?.id) { setGateReady(true); return }
    const empId = auth.employee.id; const gateItems = []
    const { data: lines } = await supabase.from('field_payment_lines').select('id, amount, bank_charge_amount, session_id, ack_status').eq('employee_id', empId).eq('ack_status', 'PENDING')
    if (lines?.length) {
      const sessionIds = [...new Set(lines.map(l => l.session_id).filter(Boolean))]; let sessMap = {}
      if (sessionIds.length) { const { data: sessions } = await supabase.from('field_payment_sessions').select('id, session_date, department_name').in('id', sessionIds); (sessions || []).forEach(s => { sessMap[s.id] = s }) }
      lines.forEach(l => gateItems.push({ id:l.id, gateType:'FIELD_LINE', amount:l.amount, bank_charge_amount:l.bank_charge_amount, sessionDate:sessMap[l.session_id]?.session_date||null, departmentName:sessMap[l.session_id]?.department_name||null }))
    }
    const { data: mrs } = await supabase.from('money_requests').select('id, request_number, requested_amount, status, dh_ack_status, submitted_at').eq('requested_by', empId).eq('dh_ack_status', 'PENDING').limit(10)
    if (mrs?.length) mrs.forEach(mr => gateItems.push({ id:mr.id, gateType:'MONEY_REQUEST', amount:mr.requested_amount, bank_charge_amount:0, sessionDate:mr.submitted_at, departmentName:mr.request_number||null }))
    setPendingGate(gateItems); setGateReady(true)
  }, [auth.employee?.id])

  async function confirmGateItem(item) {
    if (gateConfirming) return; setGateConfirming(item.id); const now = new Date().toISOString(); let error = null
    if (item.gateType === 'FIELD_LINE') ;({ error } = await supabase.from('field_payment_lines').update({ ack_status:'CONFIRMED', ack_at:now }).eq('id', item.id).eq('ack_status', 'PENDING'))
    else if (item.gateType === 'MONEY_REQUEST') ;({ error } = await supabase.from('money_requests').update({ dh_ack_status:'CONFIRMED', dh_ack_at:now, dh_ack_by:auth.employee.id }).eq('id', item.id).eq('dh_ack_status', 'PENDING'))
    if (!error) setPendingGate(prev => prev.filter(g => g.id !== item.id)); else alert('Could not confirm. Please try again.'); setGateConfirming(null)
  }

  async function confirmAllGateItems() {
    if (gateConfirming || !pendingGate.length) return
    const lineIds = pendingGate.filter(g => g.gateType === 'FIELD_LINE').map(g => g.id); const mrItems = pendingGate.filter(g => g.gateType === 'MONEY_REQUEST'); setGateConfirming('ALL'); const now = new Date().toISOString()
    if (lineIds.length) await supabase.from('field_payment_lines').update({ ack_status:'CONFIRMED', ack_at:now }).in('id', lineIds).eq('ack_status', 'PENDING')
    for (const mr of mrItems) await supabase.from('money_requests').update({ dh_ack_status:'CONFIRMED', dh_ack_at:now, dh_ack_by:auth.employee.id }).eq('id', mr.id).eq('dh_ack_status', 'PENDING')
    setPendingGate([]); setGateConfirming(null)
  }

  // ── Gate / loading ────────────────────────────────────────────────────────
  if (auth.loading)   return <LoadingScreen msg="Verifying your identity…" />
  if (!auth.employee) return <ScanQRScreen error={auth.error} debugError={auth.debugError} />
  if (!gateReady)     return <LoadingScreen msg="Checking pending confirmations…" />
  if (pendingGate.length > 0) {
    return <PaymentGateScreen items={pendingGate} confirming={gateConfirming} onConfirm={confirmGateItem} onConfirmAll={confirmAllGateItems} empName={auth.employee?.full_name_en||''} isAr={isAr} onSwitchUser={auth.logout} />
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const emp          = auth.employee
  const role         = auth.role
  const roleLabel    = ROLE_LABELS[role] || role
  const roleColor    = ROLE_COLORS[role] || '#374151'
  const unreadNotifs = notifications.filter(n => !n.is_read).length
  const alertCount   = notifications.filter(n => !n.is_read && (n.type||'').includes('ALERT')).length
  const pendingConf  = confirmItems.length
  const totalInbox   = unreadNotifs + pendingConf

  const visibleForms = FORM_CATALOGUE.filter(f => auth.allowedForms.includes(f.key))
  const heroForm     = visibleForms.find(f => f.hero)
  const otherForms   = visibleForms.filter(f => !f.hero)

  const navProps = { onHome:() => setView('home'), onInbox:() => setView('inbox'), onForms:() => setView('forms'), unreadCount:totalInbox, isAr }

  // ── Sub-views ─────────────────────────────────────────────────────────────
  if (view === 'notifs') return (
    <>
      <NotificationsView notifications={notifications} isAr={isAr} onMarkAllRead={markAllNotificationsRead} onBack={() => setView('inbox')} />
      <BottomNav current="notifs" {...navProps} />
    </>
  )
  if (view === 'confirmations') return (
    <>
      <ConfirmationsView items={confirmItems} confirming={confirming} isAr={isAr} onConfirm={handleConfirm} onBack={() => setView('inbox')} />
      <BottomNav current="confirmations" {...navProps} />
    </>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // HOME — profile only
  // ════════════════════════════════════════════════════════════════════════════
  if (view === 'home') return (
    <div style={{ minHeight:'100vh', background:MP.cream, fontFamily:MP.font, maxWidth:480, margin:'0 auto', paddingBottom:100 }} dir={isAr ? 'rtl' : 'ltr'}>

      {/* Top bar */}
      <div style={{ background:MP.cream, padding:'18px 20px 12px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:12, fontWeight:700, color:MP.textMutedLight, letterSpacing:2.5, textTransform:'uppercase', fontFamily:MP.font }}>ACCSYS</div>
        <button onClick={() => setLang(l => l==='en'?'ar':'en')} style={{ background:'transparent', border:`1.5px solid #D5D2C5`, borderRadius:20, padding:'5px 14px', fontSize:11, fontWeight:600, cursor:'pointer', color:MP.textMutedLight, fontFamily:MP.font }}>
          {isAr ? 'EN' : 'عربي'}
        </button>
      </div>

      {/* Greeting strip */}
      <div style={{ padding:'0 20px 20px' }}>
        <div style={{ fontSize:13, color:MP.textMutedLight, fontFamily:MP.font }}>
          {getGreeting(isAr)} 👋
        </div>
      </div>

      {/* Profile photo + name */}
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'0 20px 24px' }}>
        {/* Avatar */}
        <div style={{
          width:96, height:96, borderRadius:28, flexShrink:0, marginBottom:16,
          background: MP.yellow,
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:32, fontWeight:700, color:MP.textDark, fontFamily:MP.font,
          overflow:'hidden', border:`3px solid ${MP.lightCard}`,
          boxShadow:'0 4px 20px rgba(0,0,0,0.1)',
        }}>
          {emp.photo_url
            ? <img src={emp.photo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
            : initials(emp.full_name_en)}
        </div>
        {/* Name */}
        <div style={{ fontSize:22, fontWeight:700, color:MP.textDark, textAlign:'center', fontFamily:MP.font, marginBottom:4 }}>
          {isAr ? (emp.full_name_ar || emp.full_name_en) : emp.full_name_en}
        </div>
        {emp.full_name_ar && !isAr && (
          <div style={{ fontSize:14, color:MP.textMutedLight, fontFamily:MP.font, marginBottom:8, direction:'rtl' }}>{emp.full_name_ar}</div>
        )}
        {/* Role badge */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'center', marginTop:6 }}>
          <span style={{ background:roleColor, color:'#fff', borderRadius:20, padding:'4px 14px', fontSize:11, fontWeight:700, letterSpacing:0.5, textTransform:'uppercase', fontFamily:MP.font }}>
            {roleLabel}
          </span>
          <span style={{ background:'#E8E5DA', color:MP.textMutedLight, borderRadius:20, padding:'4px 14px', fontSize:11, fontWeight:600, fontFamily:MP.font }}>
            {auth.employmentType}
          </span>
        </div>
      </div>

      {/* Details card */}
      <div style={{ margin:'0 16px 16px', background:MP.lightCard, borderRadius:20, border:'1px solid #E4E0D3', overflow:'hidden' }}>
        {/* Section label */}
        <div style={{ padding:'12px 18px 8px', fontSize:10, fontWeight:700, color:MP.textMutedLight, textTransform:'uppercase', letterSpacing:1, fontFamily:MP.font }}>
          {isAr ? 'معلومات الموظف' : 'Employee Details'}
        </div>

        {[
          emp.designation || emp.job_title
            ? { label: isAr ? 'المسمى الوظيفي' : 'Job Title', value: emp.designation || emp.job_title }
            : null,
          (emp.department?.dept_code || emp.department?.dept_name)
            ? { label: isAr ? 'القسم' : 'Department', value: [emp.department.dept_code, emp.department.dept_name].filter(Boolean).join(' — ') }
            : null,
          emp.employee_number || emp.file_number
            ? { label: isAr ? 'رقم الملف' : 'Employee ID', value: emp.employee_number || emp.file_number }
            : null,
          emp.join_date || emp.date_of_joining
            ? { label: isAr ? 'تاريخ الالتحاق' : 'Joined', value: fmtDate(emp.join_date || emp.date_of_joining) }
            : null,
          emp.nationality
            ? { label: isAr ? 'الجنسية' : 'Nationality', value: emp.nationality }
            : null,
          auth.assignments?.length > 0
            ? { label: isAr ? 'المواقع المخصصة' : 'Active Sites', value: `${auth.assignments.length} ${isAr ? 'موقع' : auth.assignments.length === 1 ? 'site' : 'sites'}` }
            : null,
        ].filter(Boolean).map((row, i, arr) => (
          <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'11px 18px', borderTop:'1px solid #EDE9DE' }}>
            <span style={{ fontSize:12, color:MP.textMutedLight, fontFamily:MP.font }}>{row.label}</span>
            <span style={{ fontSize:13, fontWeight:600, color:MP.textDark, fontFamily:MP.font, textAlign:'right', maxWidth:'60%' }}>{row.value}</span>
          </div>
        ))}

        {/* Active site pills (scrollable) */}
        {auth.assignments?.length > 0 && (
          <div style={{ padding:'10px 18px 14px', borderTop:'1px solid #EDE9DE' }}>
            <div style={{ fontSize:10, fontWeight:700, color:MP.textMutedLight, textTransform:'uppercase', letterSpacing:1, marginBottom:8, fontFamily:MP.font }}>
              📍 {isAr ? 'المواقع' : 'Sites'}
            </div>
            <div style={{ overflowX:'auto', display:'flex', gap:8, paddingBottom:2, WebkitOverflowScrolling:'touch' }}>
              {auth.assignments.map(a => (
                <div key={a.id} style={{ background:MP.cream, border:'1px solid #D5D2C5', borderRadius:10, padding:'6px 12px', fontSize:11, display:'flex', flexDirection:'column', gap:2, flexShrink:0 }}>
                  <span style={{ fontWeight:700, color:MP.textDark, fontFamily:MP.font }}>{a.site_number || a.project?.project_number || '—'}</span>
                  <span style={{ fontSize:9, color:MP.textMutedLight, fontFamily:MP.font }}>{(a.project?.project_name || a.site_name || '').slice(0,22)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Date strip */}
      <div style={{ margin:'0 16px 20px', background:MP.lightCard, borderRadius:16, border:'1px solid #E4E0D3', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize:13, color:MP.textMutedLight, fontFamily:MP.font }}>{isAr ? 'اليوم' : 'Today'}</div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:15, fontWeight:700, color:MP.textDark, fontFamily:MP.font }}>
            {new Date().toLocaleDateString('en-SA', { day:'numeric', month:'long', year:'numeric' })}
          </div>
          <div style={{ fontSize:11, color:MP.textMutedLight, fontFamily:MP.font }}>
            {new Date().toLocaleDateString('en-SA', { weekday:'long' })}
          </div>
        </div>
      </div>

      {/* Switch user */}
      <div style={{ padding:'0 16px 8px', textAlign:'center' }}>
        <button onClick={auth.logout} style={{ background:'none', border:`1.5px solid #D5D2C5`, borderRadius:20, padding:'10px 24px', fontSize:12, color:MP.textMutedLight, cursor:'pointer', fontWeight:500, fontFamily:MP.font }}>
          🔄 {isAr ? 'تغيير المستخدم' : 'Switch User'}
        </button>
      </div>

      <BottomNav current="home" {...navProps} />
    </div>
  )

  // ════════════════════════════════════════════════════════════════════════════
  // INBOX — notifications + alerts + confirmations row
  // ════════════════════════════════════════════════════════════════════════════
  if (view === 'inbox') {
    const regularNotifs = notifications.filter(n => !(n.type||'').includes('ALERT'))
    const alertNotifs   = notifications.filter(n => (n.type||'').includes('ALERT'))

    return (
      <div style={{ minHeight:'100vh', background:MP.charcoal, fontFamily:MP.font, maxWidth:480, margin:'0 auto', paddingBottom:100 }} dir={isAr ? 'rtl' : 'ltr'}>

        {/* Header */}
        <div style={{ padding:'24px 20px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:22, fontWeight:700, color:MP.textOnDark, fontFamily:MP.font }}>{isAr ? 'صندوق الوارد' : 'Inbox'}</div>
          {totalInbox > 0 && (
            <div style={{ background:MP.yellow, color:MP.textDark, borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:700, fontFamily:MP.font }}>
              {totalInbox} {isAr ? 'جديد' : 'new'}
            </div>
          )}
        </div>

        {/* Status overview pills */}
        <div style={{ display:'flex', gap:8, padding:'0 16px 16px' }}>
          {[
            { label: isAr ? 'إشعارات' : 'Notifications', count: unreadNotifs, color:'#3B6FE8' },
            { label: isAr ? 'تنبيهات'  : 'Alerts',        count: alertCount,   color:'#E07A5F' },
            { label: isAr ? 'تأكيدات'  : 'Confirm.',      count: pendingConf,  color:MP.green  },
          ].map((pill, i) => (
            <div key={i} style={{ flex:1, background:MP.darkCard, borderRadius:14, padding:'12px 10px', border:`1px solid ${pill.count > 0 ? pill.color+'44' : '#3A3D35'}`, textAlign:'center' }}>
              <div style={{ fontSize:18, fontWeight:800, color: pill.count > 0 ? pill.color : MP.textMutedDark, fontFamily:MP.font, lineHeight:1 }}>{pill.count}</div>
              <div style={{ fontSize:10, color:MP.textMutedDark, fontFamily:MP.font, marginTop:4 }}>{pill.label}</div>
            </div>
          ))}
        </div>

        {/* Confirmations row — only if pending */}
        {pendingConf > 0 && (
          <div style={{ margin:'0 16px 16px', background:MP.darkCard, borderRadius:16, overflow:'hidden', border:'1px solid #3A3D35' }}>
            <div style={{ padding:'10px 18px 6px', fontSize:10, fontWeight:700, color:MP.textMutedDark, textTransform:'uppercase', letterSpacing:1, fontFamily:MP.font }}>
              {isAr ? 'تأكيدات معلقة' : 'Pending Confirmations'}
            </div>
            <InboxRow icon="✅" label="Confirm Receipt" labelAr="تأكيد الاستلام" count={pendingConf} color={MP.green} isAr={isAr} onClick={() => setView('confirmations')} />
          </div>
        )}

        {/* Notifications list */}
        <div style={{ margin:'0 16px 16px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
            <div style={{ fontSize:10, fontWeight:700, color:MP.textMutedDark, textTransform:'uppercase', letterSpacing:1, fontFamily:MP.font }}>
              {isAr ? 'الإشعارات' : 'Notifications'}
              {unreadNotifs > 0 && <span style={{ marginLeft:6, background:MP.yellow, color:MP.textDark, borderRadius:10, padding:'1px 7px', fontSize:10, fontWeight:700 }}>{unreadNotifs}</span>}
            </div>
            {unreadNotifs > 0 && (
              <button onClick={markAllNotificationsRead} style={{ background:'transparent', border:`1px solid #3A3D35`, borderRadius:20, padding:'5px 12px', fontSize:10, color:MP.textMutedDark, cursor:'pointer', fontFamily:MP.font }}>
                {isAr ? 'قراءة الكل' : 'Mark all read'}
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div style={{ background:MP.darkCard, borderRadius:16, padding:'32px 20px', textAlign:'center', border:'1px solid #3A3D35' }}>
              <div style={{ fontSize:32, marginBottom:8 }}>🔔</div>
              <div style={{ fontSize:13, color:MP.textMutedDark, fontFamily:MP.font }}>{isAr ? 'لا توجد إشعارات' : 'No notifications yet'}</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {notifications.map(n => {
                const isAlert = (n.type||'').includes('ALERT')
                return (
                  <div key={n.id} style={{ background:MP.darkCard, borderRadius:14, padding:'14px 16px', border:`1px solid ${!n.is_read ? (isAlert ? '#E07A5F44' : 'rgba(247,210,99,0.2)') : '#3A3D35'}`, display:'flex', gap:12, alignItems:'flex-start' }}>
                    <span style={{ fontSize:20, flexShrink:0, marginTop:1 }}>{isAlert ? '⚠️' : '🔔'}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                        <div style={{ fontSize:14, fontWeight: n.is_read ? 500 : 700, color:MP.textOnDark, fontFamily:MP.font, flex:1 }}>{n.title}</div>
                        {!n.is_read && <div style={{ width:7, height:7, borderRadius:'50%', background: isAlert ? '#E07A5F' : MP.yellow, flexShrink:0, marginTop:4 }} />}
                      </div>
                      {n.body && <div style={{ fontSize:12, color:MP.textMutedDark, lineHeight:1.4, marginTop:3, fontFamily:MP.font }}>{n.body}</div>}
                      {n.amount && <div style={{ fontSize:12, fontWeight:700, color:MP.yellow, marginTop:4, fontFamily:MP.font }}>SAR {fmt(n.amount)}</div>}
                      <div style={{ fontSize:11, color:MP.textMutedDark, marginTop:5, fontFamily:MP.font }}>{fmtShort(n.created_at)}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <BottomNav current="inbox" {...navProps} />
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // FORMS — pastel grid
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ minHeight:'100vh', background:MP.charcoal, fontFamily:MP.font, maxWidth:480, margin:'0 auto', paddingBottom:100 }} dir={isAr ? 'rtl' : 'ltr'}>

      {/* Header */}
      <div style={{ padding:'24px 20px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:22, fontWeight:700, color:MP.textOnDark, fontFamily:MP.font }}>{isAr ? 'النماذج' : 'Your Forms'}</div>
          <div style={{ fontSize:12, color:MP.textMutedDark, fontFamily:MP.font, marginTop:2 }}>
            {visibleForms.length} {isAr ? 'نماذج متاحة' : 'available'}
          </div>
        </div>
        <button onClick={() => setLang(l => l==='en'?'ar':'en')} style={{ background:'transparent', border:`1.5px solid #3A3D35`, borderRadius:20, padding:'5px 14px', fontSize:11, fontWeight:600, cursor:'pointer', color:MP.textMutedDark, fontFamily:MP.font }}>
          {isAr ? 'EN' : 'عربي'}
        </button>
      </div>

      <div style={{ padding:'0 14px' }}>
        {/* Hero card */}
        {heroForm && <HeroCard form={heroForm} isAr={isAr} onClick={() => navigate(heroForm.route)} />}

        {/* Pastel grid */}
        {otherForms.length > 0 && (
          <>
            <div style={{ fontSize:10, fontWeight:700, color:MP.textMutedDark, textTransform:'uppercase', letterSpacing:1, marginBottom:10, marginTop: heroForm ? 4 : 0, fontFamily:MP.font, paddingLeft:2 }}>
              {isAr ? 'جميع النماذج' : 'All Forms'}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {otherForms.map(form => (
                <PastelCard key={form.key} form={form} isAr={isAr} onClick={() => navigate(form.route)} />
              ))}
            </div>
          </>
        )}

        {visibleForms.length === 0 && (
          <div style={{ textAlign:'center', padding:'60px 20px', color:MP.textMutedDark, fontFamily:MP.font }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
            <div style={{ fontSize:14 }}>{isAr ? 'لا توجد نماذج متاحة لدورك الحالي' : 'No forms available for your current role'}</div>
          </div>
        )}

        {/* Bottom spacer so last card clears nav */}
        <div style={{ height:16 }} />
      </div>

      <BottomNav current="forms" {...navProps} />
    </div>
  )
}
