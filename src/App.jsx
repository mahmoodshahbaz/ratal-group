import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import FieldPortal from './pages/FieldPortal'
import { useAuth } from './lib/useAuth'
import { supabase } from './lib/supabase'

// Pages
import Landing        from './pages/Landing'
import Login          from './pages/Login'
import Dashboard      from './pages/Dashboard'
import TicketsPage    from './pages/TicketsPage'
import Customers      from './pages/Customers'
import Airlines       from './pages/Airlines'
import Employees      from './pages/Employees'
import Payroll        from './pages/Payroll'
import FoodAllowance  from './pages/FoodAllowance'
import Overtime       from './pages/Overtime'
import MoneyRequests  from './pages/MoneyRequests'
import Projects       from './pages/Projects'
import PurchaseOrders   from './pages/PurchaseOrders'
import Invoices         from './pages/Invoices'
import PaymentReceipts  from './pages/PaymentReceipts'
import Payments       from './pages/Payments'
import Refunds        from './pages/Refunds'
import BSP            from './pages/BSP'
import Reports        from './pages/Reports'
import Contractors    from './pages/Contractors'
import Departments    from './pages/Departments'
import ExpensesPage   from './pages/ExpensesPage'
import ExpenseClaims  from './pages/ExpenseClaims'
import Ledger         from './pages/Ledger'
import Receipts       from './pages/Receipts'
import SiteMaster     from './pages/SiteMaster'
import SiteAssignment from './pages/SiteAssignment'
import Vacations      from './pages/Vacations'
import Loans          from './pages/Loans'
import Compliance     from './pages/Compliance'
import Engagement     from './pages/Engagement'
import LOI           from './pages/LOI'
import Vehicles      from './pages/Vehicles'
import Payslip       from './pages/Payslip'
import UserManagement from './pages/UserManagement'
import Settings       from './pages/Settings'
import Approvals      from './pages/Approvals'
import PnL           from './pages/PnL'
import BankRecon     from './pages/BankRecon'
import AuditLog        from './pages/AuditLog'
import SelfService     from './pages/SelfService'
import DataMigration   from './pages/DataMigration'
import BookingRegister from './pages/BookingRegister'
import VATReturn       from './pages/VATReturn'
import LeaveBalance    from './pages/LeaveBalance'
import TrialBalance    from './pages/TrialBalance'
import ARaging         from './pages/ARaging'
import APaging         from './pages/APaging'
import CashFlow        from './pages/CashFlow'
import BalanceSheet    from './pages/BalanceSheet'
import Statements      from './pages/Statements'
import ProfitLoss      from './pages/ProfitLoss'
import Budget          from './pages/Budget'
import FixedAssets     from './pages/FixedAssets'
import Accounts           from './pages/Accounts'
import ChartOfAccounts   from './pages/ChartOfAccounts'
import BankBook        from './pages/BankBook'
import VATPayment      from './pages/VATPayment'
import PettyCash       from './pages/PettyCash'
import Intercompany         from './pages/Intercompany'
import GroupConsolidation   from './pages/GroupConsolidation'
import Cheques             from './pages/Cheques'
import JournalVoucher     from './pages/JournalVoucher'
import DepartmentPL      from './pages/DepartmentPL'
import RecurringJournals from './pages/RecurringJournals'
import PeriodClose      from './pages/PeriodClose'
import FinancialRatios    from './pages/FinancialRatios'
import CommissionTracker  from './pages/CommissionTracker'
import CashManagement    from './pages/CashManagement'
import DocumentVault     from './pages/DocumentVault'
import ManagementReport  from './pages/ManagementReport'
import CustomerCRM       from './pages/CustomerCRM'
import CostAllocation    from './pages/CostAllocation'
import StaffActions          from './pages/StaffActions'
import OutsourceEmployees    from './pages/OutsourceEmployees'
import VATReport             from './pages/VATReport'
import QRManager             from './pages/QRManager'
import FieldNotifications    from './pages/FieldNotifications'
import FieldPayments         from './pages/FieldPayments'
// IncomingPOImport merged into PurchaseOrders tab (Import from PDF button)
import TemplateLibrary       from './pages/TemplateLibrary'
import BulkUpload            from './pages/BulkUpload'

// Standalone mobile forms (shareable via Telegram / QR)
import FormLanding       from './forms/FormLanding'
import FormFoodAllowance from './forms/FormFoodAllowance'
import FormOvertime      from './forms/FormOvertime'
import FormMoneyRequest  from './forms/FormMoneyRequest'
import FormPORequest     from './forms/FormPORequest'
import FormPayment       from './forms/FormPayment'
import FormFieldPayment    from './forms/FormFieldPayment'
import FormDailyExpense    from './forms/FormDailyExpense'
import FormExpenseClaim    from './forms/FormExpenseClaim'
import FormSiteCompletion  from './forms/FormSiteCompletion'
import FormDHDashboard        from './forms/FormDHDashboard'
import FormPaymentValidation  from './forms/FormPaymentValidation'
import FormCarMaintenance    from './forms/FormCarMaintenance'
import FormSubConClaim       from './forms/FormSubConClaim'

// ─── Entities ────────────────────────────────────────────────────
const ENTITIES = [
  { code:'RAT',    name:'Ratal Tours & Travels',        nameAr:'رتال للسفر',             type:'TRAVEL',    color:'#1565C0', vatNumber:'300000000000001' },
  { code:'GWT',    name:'Green Wings Travel',            nameAr:'الأجنحة الخضراء',        type:'TRAVEL',    color:'#2E7D32', vatNumber:'300000000000002' },
  { code:'ACCSYS', name:'Ratal Advanced Technologies',   nameAr:'رتال للتقنيات المتقدمة', type:'CORPORATE', color:'#5A32D4', vatNumber:'300000000000003' },
]

// ─── Navigation ──────────────────────────────────────────────────
const NAV = [
  // ── MAIN
  { key:'dashboard',       label:'Dashboard',         labelAr:'لوحة التحكم',     icon:'📊', group:'Main',      entities:['RAT','GWT','ACCSYS'], roles:'ALL' },
  { key:'approvals',       label:'Approvals',         labelAr:'الموافقات',        icon:'✅', group:'Main',      entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN','DEPT_HEAD','PROJECT_MANAGER'] },
  // ── TRAVEL
  { key:'new_ticket',      label:'Tickets',           labelAr:'التذاكر',         icon:'🎫', group:'Travel',    entities:['RAT','GWT'],          roles:['SUPERADMIN','ADMIN','TRAVEL_AGENT'] },
  { key:'customers',       label:'Customers',         labelAr:'العملاء',         icon:'👥', group:'Travel',    entities:['RAT','GWT'],          roles:'ALL' },
  { key:'airlines',        label:'Airlines',          labelAr:'شركات الطيران',   icon:'✈️', group:'Travel',    entities:['RAT','GWT'],          roles:['SUPERADMIN','ADMIN'] },
  { key:'bsp',             label:'BSP',               labelAr:'بي إس بي',        icon:'🏦', group:'Travel',    entities:['RAT','GWT'],          roles:['SUPERADMIN','ADMIN'] },
  { key:'refunds',         label:'Refunds',           labelAr:'المسترجعات',      icon:'↩️', group:'Travel',    entities:['RAT','GWT'],          roles:['SUPERADMIN','ADMIN','TRAVEL_AGENT'] },
  // ── CORPORATE
  { key:'loi',             label:'LOI Register',      labelAr:'سجل خطابات النية', icon:'📥', group:'Operations', entities:['ACCSYS'],             roles:['SUPERADMIN','ADMIN','DEPT_HEAD','PROJECT_MANAGER'] },
  { key:'vehicles',        label:'Fleet / Vehicles',  labelAr:'الأسطول',           icon:'🚗', group:'Operations', entities:['RAT','GWT','ACCSYS'],  roles:['SUPERADMIN','ADMIN','DEPT_HEAD'] },
  { key:'projects',        label:'Projects',          labelAr:'المشاريع',        icon:'📁', group:'Masters', entities:['ACCSYS'],             roles:'ALL' },
  { key:'contractors',     label:'Party List',        labelAr:'قائمة الأطراف',   icon:'🏢', group:'Masters', entities:['ACCSYS'],             roles:['SUPERADMIN','ADMIN','DEPT_HEAD'] },
  { key:'purchase_orders', label:'Purchase Orders',   labelAr:'أوامر الشراء',    icon:'📦', group:'Operations', entities:['ACCSYS'],             roles:['SUPERADMIN','ADMIN','DEPT_HEAD'] },
  // po_import removed — merged into Purchase Orders tab (Import from PDF button)
  { key:'template_library',label:'Template Library', labelAr:'مكتبة القوالب',    icon:'📋', group:'Operations', entities:['ACCSYS'],             roles:['SUPERADMIN','ADMIN'] },
  { key:'bulk_upload',     label:'Bulk Data Upload', labelAr:'رفع البيانات',     icon:'📊', group:'Administration', entities:['ACCSYS','RAT','GWT'], roles:['SUPERADMIN','ADMIN'] },
  { key:'money_requests',  label:'Money Requests',    labelAr:'طلبات المال',     icon:'💰', group:'Operations', entities:['ACCSYS'],             roles:['SUPERADMIN','ADMIN','DEPT_HEAD','PROJECT_MANAGER'] },
  { key:'field_payments',  label:'Field Payment Notifications', labelAr:'إشعارات الدفع الميداني', icon:'💳', group:'Operations', entities:['ACCSYS'], roles:['SUPERADMIN','ADMIN','DEPT_HEAD'] },
  // ── ACCOUNTING
  { key:'invoices',         label:'Invoices',           labelAr:'الفواتير',        icon:'🧾', group:'Finance',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'payment_receipts', label:'Payment Receipts',  labelAr:'إيصالات الدفع',   icon:'💵', group:'Finance',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'payments',         label:'Payments',           labelAr:'المدفوعات',       icon:'💳', group:'Finance',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'reports',         label:'Reports',           labelAr:'التقارير',        icon:'📈', group:'Reports',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN','TRAVEL_AGENT'] },
  { key:'bookings',        label:'Booking Register',  labelAr:'سجل الحجوزات',       icon:'✈️', group:'Travel',    entities:['RAT','GWT'],          roles:['SUPERADMIN','ADMIN','TRAVEL_AGENT'] },
  { key:'pnl',             label:'P&L Report',        labelAr:'تقرير الأرباح والخسائر', icon:'📊', group:'Reports',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'income_statement',label:'Income Statement',  labelAr:'قائمة الدخل',         icon:'📈', group:'Reports',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'budget',          label:'Budget',            labelAr:'الميزانية التقديرية', icon:'💼', group:'Planning',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'fixed_assets',   label:'Fixed Assets',      labelAr:'الأصول الثابتة',      icon:'🏗', group:'Planning',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'chart_of_accounts', label:'Chart of Accounts', labelAr:'دليل الحسابات',       icon:'📒', group:'Accounting',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'accounts',       label:'Accounts',           labelAr:'الحسابات',             icon:'🏦', group:'Accounting',entities:['ACCSYS'],             roles:['SUPERADMIN','ADMIN'] },
  { key:'bank_book',      label:'Bank Book',          labelAr:'دفتر البنك',           icon:'📒', group:'Accounting',entities:['ACCSYS'],             roles:['SUPERADMIN','ADMIN'] },
  { key:'vat_payment',    label:'VAT Payments',       labelAr:'مدفوعات الضريبة',      icon:'🏛', group:'Accounting',entities:['ACCSYS'],             roles:['SUPERADMIN','ADMIN'] },
  { key:'petty_cash',     label:'Petty Cash',        labelAr:'النقدية الصغيرة',     icon:'💵', group:'Accounting',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN','DEPT_HEAD'] },
  { key:'intercompany',        label:'Intercompany',        labelAr:'المعاملات البينية',       icon:'🔗', group:'Accounting',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'group_consolidation', label:'Group Consolidation',  labelAr:'التقارير الموحدة للمجموعة', icon:'🌐', group:'Accounting',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN'] },
  { key:'cheques',             label:'Cheque Register',      labelAr:'سجل الشيكات',               icon:'🧾', group:'Accounting',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'journal_voucher',     label:'Journal Vouchers',     labelAr:'قيود اليومية',               icon:'📝', group:'Accounting',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'dept_pl',             label:'Department P&L',       labelAr:'أرباح وخسائر الأقسام',        icon:'🏛', group:'Reports',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN','DEPT_HEAD'] },
  { key:'recurring_journals',  label:'Recurring Journals',   labelAr:'القيود المتكررة',              icon:'🔁', group:'Accounting',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'period_close',        label:'Period Close',          labelAr:'إقفال الفترة المحاسبية',       icon:'🔒', group:'Accounting',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'financial_ratios',    label:'Financial Ratios',     labelAr:'النسب المالية',                  icon:'📐', group:'Reports',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'commission_tracker', label:'Commission Tracker',   labelAr:'متابعة العمولات',                icon:'💸', group:'Planning',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'cash_management',   label:'Cash Management',      labelAr:'إدارة النقدية',                   icon:'🏦', group:'Planning',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'cost_allocation',   label:'Cost Allocation',      labelAr:'توزيع التكاليف',                  icon:'⚙️', group:'Planning',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'management_report', label:'Management Report',    labelAr:'تقرير الإدارة',                   icon:'📊', group:'Reports',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'document_vault',    label:'Document Vault',       labelAr:'خزينة المستندات',                 icon:'🗄️', group:'Administration',     entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'customer_crm',      label:'Customer CRM',         labelAr:'إدارة علاقات العملاء',            icon:'👥', group:'Travel',    entities:['RAT','GWT'],          roles:['SUPERADMIN','ADMIN','TRAVEL_AGENT'] },
  { key:'vat_return',      label:'VAT Return',        labelAr:'الإقرار الضريبي',     icon:'🧮', group:'Reports',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'vat_report',     label:'VAT Analysis',      labelAr:'تحليل ضريبة القيمة',  icon:'📊', group:'Reports',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'bank_recon',      label:'Bank Reconciliation',labelAr:'مطابقة البنك',      icon:'🏦', group:'Accounting',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  // ── MASTERS (reference data)
  { key:'departments',     label:'Departments',       labelAr:'الأقسام',         icon:'🏛️', group:'Masters', entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN','DEPT_HEAD'] },
  { key:'employees',         label:'Employees',         labelAr:'الموظفون',        icon:'👤', group:'Masters', entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN','DEPT_HEAD'] },
  { key:'staff_actions',       label:'Staff Actions',       labelAr:'إجراءات الموظفين',      icon:'📋', group:'Human Resources', entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN','DEPT_HEAD'] },
  { key:'outsource_employees', label:'Outsource Employees', labelAr:'الموظفون الخارجيون',    icon:'🧑‍🔧', group:'Human Resources', entities:['ACCSYS'],             roles:['SUPERADMIN','ADMIN','DEPT_HEAD'] },
  { key:'payroll',         label:'Payroll',           labelAr:'الرواتب',         icon:'💵', group:'Human Resources',        entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'payslip',         label:'Payslip',           labelAr:'قسيمة الراتب',    icon:'🧾', group:'Human Resources',        entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'overtime',        label:'Overtime',          labelAr:'العمل الإضافي',   icon:'⏱️', group:'Human Resources',        entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN','DEPT_HEAD','PROJECT_MANAGER'] },
  { key:'food_allowance',  label:'Food Allowance',    labelAr:'بدل الطعام',      icon:'🍽️', group:'Human Resources',        entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN','DEPT_HEAD','PROJECT_MANAGER'] },
  // ── MASTERS
  { key:'site_master',     label:'Site Master',       labelAr:'سيد الموقع',      icon:'🗂', group:'Masters', entities:['ACCSYS'],             roles:['SUPERADMIN','ADMIN','DEPT_HEAD','PROJECT_MANAGER'] },
  { key:'site_assignment', label:'Site Assignment',   labelAr:'تعيين الموقع',    icon:'📋', group:'Masters', entities:['ACCSYS'],             roles:['SUPERADMIN','ADMIN','DEPT_HEAD','PROJECT_MANAGER'] },
  // ── ACCOUNTING
  { key:'ledger',          label:'General Ledger',    labelAr:'دفتر الأستاذ',    icon:'📒', group:'Accounting',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'trial_balance',   label:'Trial Balance',     labelAr:'ميزان المراجعة',  icon:'⚖️', group:'Accounting',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'ar_aging',        label:'AR Aging',          labelAr:'ذمم العملاء',     icon:'📊', group:'Reports',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'ap_aging',        label:'AP Aging',          labelAr:'ذمم الموردين',    icon:'📋', group:'Reports',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'cash_flow',       label:'Cash Flow',         labelAr:'التدفق النقدي',   icon:'💧', group:'Reports',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'balance_sheet',   label:'Balance Sheet',     labelAr:'الميزانية العمومية',icon:'🏛', group:'Reports',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'statements',      label:'Statements',        labelAr:'كشوف الحسابات',   icon:'📄', group:'Reports',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'receipts',        label:'Receipts',          labelAr:'الإيصالات',        icon:'🧾', group:'Finance',entities:['RAT','GWT'], roles:['SUPERADMIN','ADMIN'] },
  // ── EXPENSES
  { key:'expenses',        label:'Expenses',          labelAr:'المصروفات',       icon:'🧮', group:'Finance',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN','DEPT_HEAD'] },
  { key:'expense_claims',  label:'Expense Claims',    labelAr:'مطالبات المصاريف',icon:'📋', group:'Finance',entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN','DEPT_HEAD'] },
  // ── HR (additional)
  { key:'vacations',       label:'Vacations & Leave', labelAr:'الإجازات',        icon:'🏖', group:'Human Resources',        entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN','DEPT_HEAD'] },
  { key:'leave_balance',   label:'Leave Balance',     labelAr:'رصيد الإجازات',   icon:'🏝', group:'Human Resources',        entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN','DEPT_HEAD'] },
  { key:'loans',           label:'Loans, EOS & Penalties', labelAr:'القروض ومكافآت والغرامات', icon:'💳', group:'Human Resources', entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'compliance',      label:'Compliance Alerts', labelAr:'تنبيهات الامتثال', icon:'⚠️', group:'Human Resources',        entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'engagement',      label:'Notice Board',      labelAr:'لوحة الإعلانات',  icon:'🎯', group:'Human Resources',        entities:['RAT','GWT','ACCSYS'], roles:'ALL' },
  // ── ADMIN
  { key:'qr_manager',      label:'QR Code Manager',   labelAr:'إدارة رموز QR',    icon:'📲', group:'Administration',    entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN','DEPT_HEAD'] },
  { key:'field_notifications', label:'Field Notifications', labelAr:'إشعارات ميدانية', icon:'🔔', group:'Administration', entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN','DEPT_HEAD'] },
  { key:'users',           label:'User Management',   labelAr:'إدارة المستخدمين', icon:'👥', group:'Administration',    entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'settings',        label:'Settings',           labelAr:'الإعدادات',        icon:'⚙️', group:'Administration',    entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'audit_log',       label:'Audit Log',          labelAr:'سجل التدقيق',      icon:'📋', group:'Administration',    entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  { key:'data_import',     label:'Data Import',        labelAr:'استيراد البيانات', icon:'📤', group:'Administration',    entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN'] },
  // ── SELF SERVICE (employees see only this group)
  { key:'self_service',    label:'My Portal',          labelAr:'بوابتي',           icon:'👤', group:'Self Service', entities:['RAT','GWT','ACCSYS'], roles:['FIELD_EMPLOYEE','TRAVEL_AGENT','VIEWER'] },
  // ── FORMS (shareable links)
  { key:'forms',           label:'Shareable Forms',   labelAr:'النماذج',         icon:'📋', group:'Forms',     entities:['RAT','GWT','ACCSYS'], roles:['SUPERADMIN','ADMIN','DEPT_HEAD'] },
]

const GROUP_ICONS = {
  Main:'🏠', Travel:'✈️', Operations:'🏗', Finance:'💰',
  Masters:'🗃️', Accounting:'📒', Reports:'📊', Planning:'📐',
  'Human Resources':'👥', Administration:'⚙️',
  Forms:'📋', 'Self Service':'👤',
}
const GROUP_COLORS = {
  Main:'#546e7a', Travel:'#1565C0', Operations:'#0D5C4E',
  Masters:'#00695c',
  Finance:'#0277bd', Accounting:'#00838f', Reports:'#558b2f',
  Planning:'#6a1b9a', 'Human Resources':'#e65100',
  Administration:'#454D9B', Forms:'#795548', 'Self Service':'#1a6b4e',
}

// ─── Copy-to-clipboard helper ─────────────────────────────────────
function copyLink(path) {
  const url = `${window.location.origin}${path}`
  navigator.clipboard.writeText(url).then(() => alert('Link copied!\n'+url))
}

// ─── Forms Panel ─────────────────────────────────────────────────
function FormsPanel({ isAr }) {
  const base = window.location.origin
  const forms = [
    { label:'Forms Home (QR)',   labelAr:'الصفحة الرئيسية', path:'/forms',               icon:'🏠', color:'#37474f', note:'Entry point — scan QR to authenticate' },
    { label:'Daily Expense',     labelAr:'المصروف اليومي',  path:'/forms/daily-expense', icon:'📝', color:'#1565c0', note:'Phase C — record fuel, hotel, meals, materials' },
    { label:'Expense Claim',     labelAr:'مطالبة المصاريف', path:'/forms/expense-claim', icon:'🧾', color:'#0277bd', note:'Phase C — monthly claim submission' },
    { label:'Food Allowance',    labelAr:'بدل الطعام',      path:'/forms/food-allowance',icon:'🍽️', color:'#880e4f' },
    { label:'Overtime Request',  labelAr:'طلب عمل إضافي',  path:'/forms/overtime',      icon:'⏱️', color:'#e65100' },
    { label:'Money Request',     labelAr:'طلب مالي',        path:'/forms/money-request', icon:'💰', color:'#1a237e' },
    { label:'PO Request',        labelAr:'طلب أمر شراء',   path:'/forms/po-request',    icon:'📦', color:'#0097a7' },
    { label:'Field Payment (DH)',labelAr:'دفع ميداني',      path:'/forms/field-payment',    icon:'💸', color:'#b71c1c', note:'Phase B — DH issues cash advance to employee' },
    { label:'Site Completion',   labelAr:'حالة الموقع',    path:'/forms/site-completion',  icon:'📍', color:'#2e7d32', note:'Phase D — milestone update + photo per assignment' },
    { label:'DH Command Centre',      labelAr:'مركز قيادة المدير',   path:'/forms/dh-dashboard',          icon:'⚡', color:'#1a2540', note:'Phase E — cash, sites, claims, team, notifications' },
    { label:'Payment Confirmation',   labelAr:'تأكيد استلام الدفعة', path:'/forms/payment-validation',    icon:'💳', color:'#2e7d32', note:'Phase G — employee confirms receipt of advance' },
    { label:'Vehicle Report',         labelAr:'تقرير المركبة',        path:'/forms/car-maintenance',        icon:'🚗', color:'#37474f', note:'Phase H — fuel, maintenance, incident, inspection' },
    { label:'Sub-Con Claim',          labelAr:'مطالبة مقاول الباطن', path:'/forms/subcon-claim',           icon:'👷', color:'#33691e', note:'Phase I — work completion, hours, milestones, photos' },
  ]
  return (
    <div>
      <div style={{ marginBottom:16, padding:'12px 16px', background:'#fff3e0', borderRadius:12, border:'1px solid #ffcc80' }}>
        <div style={{ fontWeight:700, fontSize:13, color:'#e65100', marginBottom:4 }}>📱 Mobile-Friendly Shareable Forms</div>
        <div style={{ fontSize:12, color:'#795548' }}>Copy a link and share it via WhatsApp or Telegram. The employee fills it on their phone — no login required.</div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:14 }}>
        {forms.map(f=>(
          <div key={f.path} style={{ background:'#fff', borderRadius:14, padding:'18px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', border:`2px solid ${f.color}22` }}>
            <div style={{ fontSize:28, marginBottom:8 }}>{f.icon}</div>
            <div style={{ fontWeight:800, fontSize:15, color:'#1a2e3d', marginBottom:2 }}>{isAr ? f.labelAr : f.label}</div>
            {f.note && <div style={{ fontSize:11, color:'#6b7c93', marginBottom:4 }}>{f.note}</div>}
            <div style={{ fontSize:11, color:'#aab2bd', marginBottom:14, wordBreak:'break-all' }}>{base}{f.path}</div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>copyLink(f.path)} style={{ flex:1, background:f.color, color:'#fff', border:'none', borderRadius:8, padding:'8px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                📋 Copy Link
              </button>
              <a href={f.path} target="_blank" rel="noreferrer" style={{ flex:1, background:'#f0f4f8', color:'#1a2e3d', border:'none', borderRadius:8, padding:'8px', fontSize:12, fontWeight:700, cursor:'pointer', textDecoration:'none', display:'flex', alignItems:'center', justifyContent:'center' }}>
                🔗 Open
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── App Shell ───────────────────────────────────────────────────
function AppShell() {
  const { session, profile, loading, signOut, role, entityCode, entityId, isSuperAdmin } = useAuth()

  const [page,          setPage]         = useState('dashboard')
  const [entitySwitch,  setEntitySwitch] = useState(null)
  const [sideOpen,      setSideOpen]     = useState(true)
  const [openGroup,     setOpenGroup]    = useState('Main')
  const [mobileSideOpen,setMobileSide]   = useState(false)
  const [lang,          setLang]         = useState('en')
  const [isMobile,      setIsMobile]     = useState(window.innerWidth < 768)
  // ── Pre-auth flow: Landing → entity-specific Login ────────────────
  const [preAuthStep,   setPreAuthStep]  = useState('landing')   // 'landing' | 'login'
  const [preAuthEntity, setPreAuthEntity]= useState(null)        // 'RAT' | 'GWT' | 'ACCSYS'
  // ── Entity UUID map: code → database UUID ────────────────────────
  const [entityMap,     setEntityMap]    = useState({})          // { RAT: 'uuid', GWT: 'uuid', ACCSYS: 'uuid' }

  useEffect(() => {
    supabase.from('entities').select('id, entity_code').then(({ data }) => {
      if (data) {
        const map = {}
        data.forEach(e => { map[e.entity_code] = e.id })
        setEntityMap(map)
      }
    })
  }, [])

  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) setMobileSide(false)
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Auto-open the group of the currently active page
  useEffect(() => {
    const nav = NAV.find(n => n.key === page)
    if (nav) setOpenGroup(nav.group)
  }, [page])

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#1a2e3d', color:'#fff', fontSize:16 }}>
      Loading Ratal Group…
    </div>
  )
  if (!session) {
    if (preAuthStep === 'landing')
      return (
        <Landing
          onSelect={code => { setPreAuthEntity(code); setPreAuthStep('login') }}
        />
      )
    return (
      <Login
        entityCode={preAuthEntity}
        onBack={() => setPreAuthStep('landing')}
      />
    )
  }

  const activeCode     = isSuperAdmin ? (entitySwitch || 'ACCSYS') : (entityCode || 'RAT')
  const activeEntityId = entityMap[activeCode] || entityId   // UUID for the currently active entity
  const entity         = ENTITIES.find(e => e.code === activeCode) || ENTITIES[0]
  const isAr       = lang === 'ar'

  const visibleNav = NAV.filter(n => {
    if (!n.entities.includes(activeCode)) return false
    if (n.roles === 'ALL') return true
    return n.roles.includes(role)
  })
  const groups     = [...new Set(visibleNav.map(n => n.group))]
  const currentNav = visibleNav.find(n => n.key === page) || visibleNav[0]

  const sideWidth  = isMobile ? 0 : (sideOpen ? 232 : 56)

  // ── Sidebar content (shared between desktop + mobile overlay)
  const SidebarContent = ({ inOverlay }) => (
    <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
      {/* Logo */}
      <div style={{ padding:'14px 12px 10px', borderBottom:'1px solid rgba(255,255,255,0.08)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, justifyContent:(sideOpen||inOverlay)?'flex-start':'center' }}>
          <div style={{ width:34, height:34, background:entity.color, borderRadius:9, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0, boxShadow:`0 0 12px ${entity.color}88` }}>
            {entity.type==='TRAVEL' ? '✈' : '💼'}
          </div>
          {(sideOpen||inOverlay) && <div>
            <div style={{ color:'#fff', fontWeight:800, fontSize:13 }}>Ratal Group</div>
            <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)' }}>Travel & Corporate</div>
          </div>}
          {inOverlay && (
            <button onClick={()=>setMobileSide(false)} style={{ marginLeft:'auto', background:'transparent', border:'none', color:'rgba(255,255,255,0.5)', fontSize:20, cursor:'pointer', padding:'0 4px' }}>✕</button>
          )}
        </div>
      </div>

      {/* Entity switcher */}
      <div style={{ padding:(sideOpen||inOverlay)?'8px 12px':'8px 6px', borderBottom:'1px solid rgba(255,255,255,0.08)', flexShrink:0 }}>
        {(sideOpen||inOverlay) && <div style={{ fontSize:9, color:'rgba(255,255,255,0.35)', fontWeight:700, marginBottom:5, letterSpacing:1 }}>ENTITY</div>}
        <div style={{ display:'flex', gap:4, flexDirection:(sideOpen||inOverlay)?'row':'column' }}>
          {(isSuperAdmin ? ENTITIES : ENTITIES.filter(e=>e.code===activeCode)).map(e=>(
            <button key={e.code} onClick={()=>{ isSuperAdmin && setEntitySwitch(e.code); setMobileSide(false); setPage('dashboard') }} style={{
              flex:(sideOpen||inOverlay)?1:undefined,
              background: activeCode===e.code ? '#ffffff' : '#1a56db',
              color: activeCode===e.code ? '#1a2e4a' : '#ffffff',
              border: activeCode===e.code ? '1px solid #fff' : '1px solid #1a56db',
              borderRadius:6,
              padding:(sideOpen||inOverlay)?'5px 0':'5px 3px',
              cursor: isSuperAdmin?'pointer':'default',
              fontSize:10, fontWeight:700,
              transition:'all 0.15s',
            }}>{e.code}</button>
          ))}
        </div>
        {(sideOpen||inOverlay) && <div style={{ marginTop:4, fontSize:10, color:entity.color, fontWeight:700, textAlign:'center' }}>
          {entity.type==='TRAVEL' ? '✈️ Travel' : '💼 Corporate'}
        </div>}
      </div>

      {/* Nav items — accordion */}
      <div style={{ flex:1, overflowY:'auto', padding:'6px 4px', scrollbarWidth:'none' }}>
        {groups.map(group => {
          const gc        = GROUP_COLORS[group] || 'rgba(255,255,255,0.35)'
          const gi        = GROUP_ICONS[group]  || '•'
          const isOpen    = openGroup === group
          const groupItems= visibleNav.filter(n => n.group === group)
          const hasActive = groupItems.some(n => n.key === page)

          // Collapsed sidebar: show only icons, no accordion headers
          if (!sideOpen && !inOverlay) {
            return (
              <div key={group}>
                {groupItems.map(n => {
                  const isActive = page === n.key
                  return (
                    <button key={n.key} title={n.label}
                      onClick={() => { setPage(n.key); if(inOverlay) setMobileSide(false) }}
                      style={{
                        width:'100%', display:'flex', alignItems:'center', justifyContent:'center',
                        background: isActive ? `${gc}30` : 'transparent',
                        border: isActive ? `1px solid ${gc}44` : '1px solid transparent',
                        borderRadius:8, padding:'9px', cursor:'pointer', marginBottom:2,
                      }}>
                      <span style={{ fontSize:16 }}>{n.icon}</span>
                    </button>
                  )
                })}
              </div>
            )
          }

          // Expanded sidebar: accordion
          return (
            <div key={group} style={{ marginBottom:2 }}>
              {/* Group header — clickable */}
              <button
                onClick={() => setOpenGroup(isOpen ? null : group)}
                style={{
                  width:'100%', display:'flex', alignItems:'center', gap:8,
                  background: hasActive ? `${gc}18` : 'transparent',
                  border:'none', borderRadius:8,
                  padding:'8px 8px', cursor:'pointer',
                  marginBottom: isOpen ? 2 : 0,
                  transition:'all 0.15s',
                }}>
                <span style={{ fontSize:14, flexShrink:0 }}>{gi}</span>
                <span style={{ fontSize:11, fontWeight:700, color: hasActive ? gc : 'rgba(255,255,255,0.55)', letterSpacing:0.5, flex:1, textAlign:'left', textTransform:'uppercase' }}>
                  {group}
                </span>
                <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)', transition:'transform 0.2s', display:'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
              </button>

              {/* Group items — shown only when open */}
              {isOpen && (
                <div style={{ paddingLeft:10, borderLeft:`2px solid ${gc}33`, marginLeft:8, marginBottom:4 }}>
                  {groupItems.map(n => {
                    const isActive = page === n.key
                    return (
                      <button key={n.key}
                        onClick={() => { setPage(n.key); if(inOverlay) setMobileSide(false) }}
                        style={{
                          width:'100%', display:'flex', alignItems:'center', gap:8,
                          background: isActive ? `${gc}28` : 'transparent',
                          color: isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                          border: isActive ? `1px solid ${gc}44` : '1px solid transparent',
                          borderRadius:7, padding:'7px 8px',
                          cursor:'pointer', fontSize:12, fontWeight: isActive ? 700 : 400,
                          marginBottom:1, transition:'all 0.1s', textAlign:'left',
                        }}>
                        <span style={{ fontSize:14, flexShrink:0 }}>{n.icon}</span>
                        <span style={{ whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                          {isAr ? n.labelAr : n.label}
                        </span>
                        {isActive && <div style={{ marginLeft:'auto', width:4, height:4, borderRadius:'50%', background:gc, flexShrink:0 }} />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bottom bar */}
      <div style={{ padding:'8px 6px', borderTop:'1px solid rgba(255,255,255,0.10)', flexShrink:0 }}>
        {/* Role badge */}
        {(sideOpen||inOverlay) && (
          <div style={{ textAlign:'center', marginBottom:6 }}>
            <span style={{ background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.5)', fontSize:9, fontWeight:700, borderRadius:5, padding:'2px 8px' }}>
              {role?.replace(/_/g,' ')}
            </span>
          </div>
        )}
        {/* Lang toggle */}
        <button onClick={()=>setLang(l=>l==='en'?'ar':'en')} style={{ width:'100%', background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.4)', border:'none', borderRadius:7, padding:'6px', cursor:'pointer', fontSize:10, marginBottom:3 }}>
          {(sideOpen||inOverlay) ? (isAr?'English':'العربية') : '🌐'}
        </button>
        {/* Collapse toggle (desktop only) */}
        {!isMobile && (
          <button onClick={()=>setSideOpen(v=>!v)} style={{ width:'100%', background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.4)', border:'none', borderRadius:7, padding:'6px', cursor:'pointer', fontSize:10, marginBottom:6 }}>
            {sideOpen ? '◀ Collapse' : '▶'}
          </button>
        )}
        {/* Sign Out — prominent */}
        <button onClick={signOut} style={{
          width:'100%', background:'rgba(220,38,38,0.15)', color:'#fca5a5',
          border:'1px solid rgba(220,38,38,0.3)', borderRadius:8,
          padding: (sideOpen||inOverlay) ? '9px 10px' : '9px',
          cursor:'pointer', fontSize:12, fontWeight:700,
          display:'flex', alignItems:'center', justifyContent:(sideOpen||inOverlay)?'flex-start':'center',
          gap:8, transition:'background 0.15s',
        }}
          onMouseEnter={e => e.currentTarget.style.background='rgba(220,38,38,0.28)'}
          onMouseLeave={e => e.currentTarget.style.background='rgba(220,38,38,0.15)'}
        >
          <span>🚪</span>
          {(sideOpen||inOverlay) && <span>Sign Out</span>}
        </button>
      </div>
    </div>
  )

  // ── Chapter nav: the NAV entry for the current page (null for dashboard)
  const chapterNav = visibleNav.find(n => n.key === page)

  return (
    <div style={{ display:'flex', height:'100vh', fontFamily:"'Segoe UI',system-ui,sans-serif", background:'#f4f7fb', overflow:'hidden', direction:isAr?'rtl':'ltr', position:'relative' }}>

      {/* MOBILE OVERLAY SIDEBAR */}
      {isMobile && mobileSideOpen && (
        <>
          <div onClick={()=>setMobileSide(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:40 }} />
          <div style={{ position:'fixed', top:0, left:0, width:260, height:'100vh', background:'#1a2e3d', zIndex:50, overflow:'hidden' }}>
            <SidebarContent inOverlay />
          </div>
        </>
      )}

      {/* DESKTOP SIDEBAR */}
      {!isMobile && (
        <div style={{ width:sideWidth, background:'#1a2e3d', transition:'width 0.2s', flexShrink:0, overflow:'hidden' }}>
          <SidebarContent inOverlay={false} />
        </div>
      )}

      {/* MAIN CONTENT */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
        {/* Top bar */}
        <div style={{ background:'#fff', borderBottom:'1px solid #e8edf2', padding:'0 16px', height:52, display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0, boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {isMobile && (
              <button onClick={()=>setMobileSide(true)} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', padding:'0 4px', color:'#1a2e3d' }}>☰</button>
            )}
            <div style={{ width:5, height:22, borderRadius:3, background:GROUP_COLORS[currentNav?.group]||entity.color }}></div>
            <span style={{ fontSize:24, fontWeight:800, color:'#1a2e3d', fontFamily:"'Poppins', sans-serif" }}>
              {chapterNav ? (GROUP_ICONS[chapterNav.group] || currentNav?.icon) : currentNav?.icon}
              {' '}
              {chapterNav ? chapterNav.group : (isAr ? currentNav?.labelAr : currentNav?.label)}
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, overflow:'hidden' }}>
            <div style={{ background:entity.color, color:'#fff', borderRadius:8, padding:'4px 12px', fontSize:12, fontWeight:800, flexShrink:0 }}>{entity.code}</div>
            {!isMobile && <div style={{ fontSize:12, color:'#6b7c93', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{isAr?entity.nameAr:entity.name}</div>}
            {!isMobile && <div style={{ fontSize:11, color:'#aab2bd', whiteSpace:'nowrap' }}>{profile?.full_name||''}</div>}
          </div>
        </div>

        {/* ── Global Chapter H1 — auto-applied to every page, zero per-page changes ── */}
        {chapterNav && (
          <div style={{
            background: '#fff',
            borderBottom: '1px solid #e8ecf4',
            padding: '14px 22px 12px',
            flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 10,
            fontFamily: "'Poppins', sans-serif",
          }}>
            {/* chapter color stripe */}
            <div style={{
              width: 4, height: 32, borderRadius: 2, flexShrink: 0,
              background: GROUP_COLORS[chapterNav.group] || '#546e7a',
            }} />
            {/* group icon */}
            <span style={{ fontSize: 20, lineHeight: 1 }}>
              {GROUP_ICONS[chapterNav.group] || '•'}
            </span>
            {/* Page name as H2 — group name is already in the top bar as H1 */}
            <div>
              <h2 style={{
                margin: 0, fontSize: 20, fontWeight: 700, color: '#1e293b',
                lineHeight: 1, fontFamily: "'Poppins', sans-serif",
              }}>
                {isAr ? chapterNav.labelAr : chapterNav.label}
              </h2>
            </div>
          </div>
        )}

        {/* Page content */}
        <div style={{ flex:1, overflowY:'auto', padding: isMobile ? '0 12px 12px' : '0 22px 22px' }}>
          <div style={{ maxWidth:1400, margin:'0 auto' }}>
            {page==='dashboard'       && <Dashboard      entityId={activeEntityId} entityCode={activeCode} isAr={isAr} onNavigate={setPage} />}
            {page==='approvals'       && <Approvals      entityId={activeEntityId} role={role} isAr={isAr} />}
            {page==='new_ticket'      && <TicketsPage    entityId={activeEntityId} isAr={isAr} />}
            {page==='customers'       && <Customers      entityId={activeEntityId} isAr={isAr} />}
            {page==='airlines'        && <Airlines       entityId={activeEntityId} isAr={isAr} />}
            {page==='bsp'             && <BSP            entityId={activeEntityId} isAr={isAr} />}
            {page==='refunds'         && <Refunds        entityId={activeEntityId} isAr={isAr} />}
            {page==='loi'             && <LOI            entityId={activeEntityId} isAr={isAr} />}
            {page==='vehicles'        && <Vehicles       entityId={activeEntityId} isAr={isAr} />}
            {page==='projects'        && <Projects       entityId={activeEntityId} isAr={isAr} role={role} />}
            {page==='contractors'     && <Contractors    entityId={activeEntityId} isAr={isAr} />}
            {page==='purchase_orders' && <PurchaseOrders entityId={activeEntityId} entityCode={activeCode} isAr={isAr} />}
            {/* po_import removed — use Import from PDF button inside Purchase Orders */}
            {page==='template_library'&& <TemplateLibrary  entityId={activeEntityId} />}
            {page==='bulk_upload'     && <BulkUpload       entityId={activeEntityId} />}
            {page==='money_requests'  && <MoneyRequests  entityId={activeEntityId} isAr={isAr} />}
            {page==='field_payments'  && <FieldPayments  entityId={activeEntityId} role={role} userDept={profile?.department_name || ''} />}
            {page==='invoices'         && <Invoices        entityId={activeEntityId} entityCode={activeCode} entityVatNumber={entity.vatNumber} entityName={entity.name} entityNameEn={entity.name} entityNameAr={entity.nameAr} isAr={isAr} />}
            {page==='payment_receipts' && <PaymentReceipts entityId={activeEntityId} entityCode={activeCode} entityVatNumber={entity.vatNumber} entityName={entity.name} entityNameEn={entity.name} isAr={isAr} />}
            {page==='payments'        && <Payments       entityId={activeEntityId} entityName={entity.name} entityNameEn={entity.name} isAr={isAr} />}
            {page==='reports'         && <Reports        entityId={activeEntityId} entityCode={activeCode} isAr={isAr} />}
            {page==='pnl'             && <PnL            entityId={activeEntityId} entityCode={activeCode} isAr={isAr} />}
            {page==='income_statement'&& <PnL            entityId={activeEntityId} entityCode={activeCode} isAr={isAr} />}
            {page==='budget'          && <Budget          entityId={activeEntityId} />}
            {page==='fixed_assets'    && <FixedAssets     entityId={activeEntityId} />}
            {page==='chart_of_accounts' && <ChartOfAccounts entityId={activeEntityId} />}
            {page==='accounts'        && <Accounts        entityId={activeEntityId} />}
            {page==='bank_book'       && <BankBook        entityId={activeEntityId} />}
            {page==='vat_payment'     && <VATPayment      entityId={activeEntityId} />}
            {page==='petty_cash'      && <PettyCash       entityId={activeEntityId} />}
            {page==='intercompany'        && <Intercompany        entityId={activeEntityId} entityCode={activeCode} />}
            {page==='group_consolidation' && <GroupConsolidation />}
            {page==='cheques'             && <Cheques             entityId={activeEntityId} />}
            {page==='journal_voucher'     && <JournalVoucher     entityId={activeEntityId} />}
            {page==='dept_pl'             && <DepartmentPL       entityId={activeEntityId} />}
            {page==='recurring_journals'  && <RecurringJournals  entityId={activeEntityId} />}
            {page==='period_close'        && <PeriodClose        entityId={activeEntityId} />}
            {page==='financial_ratios'    && <FinancialRatios    entityId={activeEntityId} />}
            {page==='commission_tracker' && <CommissionTracker  entityId={activeEntityId} />}
            {page==='cash_management'   && <CashManagement    entityId={activeEntityId} />}
            {page==='cost_allocation'   && <CostAllocation    entityId={activeEntityId} />}
            {page==='management_report' && <ManagementReport  entityId={activeEntityId} />}
            {page==='document_vault'    && <DocumentVault     entityId={activeEntityId} />}
            {page==='customer_crm'      && <CustomerCRM       entityId={activeEntityId} />}
            {page==='bank_recon'      && <BankRecon      entityId={activeEntityId} isAr={isAr} />}
            {page==='departments'     && <Departments    entityId={activeEntityId} isAr={isAr} />}
            {page==='employees'           && <Employees           entityId={activeEntityId} entityCode={activeCode} isAr={isAr} />}
            {page==='payroll'         && <Payroll        entityId={activeEntityId} isAr={isAr} />}
            {page==='payslip'         && <Payslip        entityId={activeEntityId} entityCode={activeCode} isAr={isAr} />}
            {page==='overtime'        && <Overtime        entityId={activeEntityId} isAr={isAr} />}
            {page==='food_allowance'  && <FoodAllowance   entityId={activeEntityId} isAr={isAr} />}
            {page==='site_master'     && <SiteMaster      entityId={activeEntityId} isAr={isAr} />}
            {page==='site_assignment' && <SiteAssignment  entityId={activeEntityId} />}
            {page==='ledger'          && <Ledger          entityId={activeEntityId} isAr={isAr} />}
            {page==='trial_balance'   && <TrialBalance    entityId={activeEntityId} />}
            {page==='ar_aging'        && <ARaging         entityId={activeEntityId} />}
            {page==='ap_aging'        && <APaging         entityId={activeEntityId} />}
            {page==='cash_flow'       && <CashFlow        entityId={activeEntityId} />}
            {page==='balance_sheet'   && <BalanceSheet    entityId={activeEntityId} />}
            {page==='statements'      && <Statements      entityId={activeEntityId} />}
            {page==='receipts'        && <Receipts        entityId={activeEntityId} isAr={isAr} />}
            {page==='expenses'        && <ExpensesPage    entityId={activeEntityId} entityName={entity?.name} isAr={isAr} />}
            {page==='expense_claims'  && <ExpenseClaims   entityId={activeEntityId} entityName={entity?.name} role={role} profile={profile} />}
            {page==='vacations'       && <Vacations       entityId={activeEntityId} isAr={isAr} />}
            {page==='leave_balance'   && <LeaveBalance    entityId={activeEntityId} />}
            {page==='loans'           && <Loans           entityId={activeEntityId} isAr={isAr} />}
            {page==='compliance'      && <Compliance      entityId={activeEntityId} isAr={isAr} />}
            {page==='vat_return'      && <VATReturn        entityId={activeEntityId} />}
            {page==='vat_report'      && <VATReport        entityId={activeEntityId} />}
            {page==='users'           && <UserManagement  entityId={activeEntityId} />}
            {page==='settings'        && <Settings        entityId={activeEntityId} entityCode={activeCode} isAr={isAr} />}
            {page==='audit_log'       && <AuditLog />}
            {page==='qr_manager'          && <QRManager          entityId={activeEntityId} entityCode={activeCode} isAr={isAr} />}
            {page==='field_notifications' && <FieldNotifications entityId={activeEntityId} isAr={isAr} />}
            {page==='self_service'    && <SelfService     entityId={activeEntityId} isAr={isAr} />}
            {page==='data_import'     && <DataMigration   entityId={activeEntityId} />}
            {page==='bookings'        && <BookingRegister entityId={activeEntityId} />}
            {page==='engagement'      && <Engagement      entityId={activeEntityId} isAr={isAr} />}
            {page==='staff_actions'       && <StaffActions        entityId={activeEntityId} />}
            {page==='outsource_employees' && <OutsourceEmployees  entityId={activeEntityId} />}
            {page==='forms'           && <FormsPanel      isAr={isAr} />}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Top-level Router: forms get their own routes, everything else → AppShell
export default function App() {
  return (
    <Routes>
      {/* ── Field Forms — public, QR-authenticated ───────────────── */}
      <Route path="/forms"                element={<FormLanding />} />
      <Route path="/forms/field-payment"    element={<FormFieldPayment />} />
      <Route path="/forms/daily-expense"   element={<FormDailyExpense />} />
      <Route path="/forms/expense-claim"   element={<FormExpenseClaim />} />
      <Route path="/forms/site-completion" element={<FormSiteCompletion />} />
      <Route path="/forms/dh-dashboard"        element={<FormDHDashboard />} />
      <Route path="/forms/payment-validation"  element={<FormPaymentValidation />} />
      <Route path="/forms/car-maintenance"    element={<FormCarMaintenance />} />
      <Route path="/forms/subcon-claim"      element={<FormSubConClaim />} />
      <Route path="/forms/food-allowance" element={<FormFoodAllowance />} />
      <Route path="/forms/overtime"       element={<FormOvertime />} />
      <Route path="/forms/money-request"  element={<FormMoneyRequest />} />
      <Route path="/forms/po-request"     element={<FormPORequest />} />
      <Route path="/forms/payment"        element={<FormPayment />} />
      <Route path="/field"                element={<FieldPortal />} />
      <Route path="*"                     element={<AppShell />} />
    </Routes>
  )
}
