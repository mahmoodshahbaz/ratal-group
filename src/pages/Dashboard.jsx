import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const PF = "'Poppins','Inter',system-ui,sans-serif"
const fmt  = v => Math.round(v||0).toLocaleString()
const fmtK = v => { const n=Math.round(v||0); return n>=1000000?(n/1000000).toFixed(1)+'M':n>=1000?(n/1000).toFixed(0)+'K':String(n) }
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Donut Chart ───────────────────────────────────────────────────────────────
function DonutChart({ slices, centerLabel, centerSub, size=220 }) {
  const r = 72, cx = size/2, cy = size/2, stroke = 20
  let cumAngle = -Math.PI/2
  const paths = []
  const total = slices.reduce((s,x)=>s+(x.value||0), 0)
  if (!total) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:size, color:'#cbd5e1', fontSize:13, fontFamily:PF }}>No data</div>
  )
  slices.forEach((sl, i) => {
    const frac = (sl.value||0)/total
    if (frac===0) return
    const angle = frac * 2 * Math.PI
    const x1 = cx + r*Math.cos(cumAngle)
    const y1 = cy + r*Math.sin(cumAngle)
    const x2 = cx + r*Math.cos(cumAngle+angle)
    const y2 = cy + r*Math.sin(cumAngle+angle)
    const large = angle > Math.PI ? 1 : 0
    paths.push(
      <path key={i} d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`}
        fill={sl.color} stroke="#fff" strokeWidth={2} />
    )
    cumAngle += angle
  })
  return (
    <div style={{ display:'flex', alignItems:'center', gap:20, flexWrap:'wrap', justifyContent:'center' }}>
      <svg width={size} height={size} style={{ flexShrink:0 }}>
        {paths}
        <circle cx={cx} cy={cy} r={r-stroke} fill="#fff" />
        <text x={cx} y={cy-8} textAnchor="middle" fontSize={20} fontWeight={800} fill="#1e293b" fontFamily={PF}>{centerLabel||''}</text>
        <text x={cx} y={cy+12} textAnchor="middle" fontSize={10} fill="#64748b" fontFamily={PF}>{centerSub||''}</text>
      </svg>
      <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
        {slices.map((sl,i)=>(
          <div key={i} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, fontFamily:PF }}>
            <div style={{ width:11, height:11, borderRadius:3, background:sl.color, flexShrink:0 }} />
            <span style={{ color:'#475569', fontWeight:500 }}>{sl.label}</span>
            <span style={{ color:'#1e293b', fontWeight:700, marginLeft:'auto', paddingLeft:12 }}>{fmtK(sl.value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Bar Chart ─────────────────────────────────────────────────────────────────
function BarChart({ bars, colors, labels, height=180 }) {
  if (!bars || !bars.length) return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height, color:'#cbd5e1', fontSize:13, fontFamily:PF }}>No data</div>
  )
  const allVals = bars.map(b=>(Array.isArray(b)?b.reduce((s,x)=>s+x,0):b))
  const maxVal = Math.max(...allVals, 1)
  const curMonth = new Date().getMonth()
  return (
    <div style={{ width:'100%' }}>
      <svg width="100%" height={height} style={{ overflow:'visible' }}>
        {[0,0.25,0.5,0.75,1].map((f,i)=>(
          <line key={i} x1="0" y1={`${(1-f)*80}%`} x2="100%" y2={`${(1-f)*80}%`} stroke="#f1f5f9" strokeWidth={1} />
        ))}
        {bars.map((b,i)=>{
          const stacks = Array.isArray(b)?b:[b]
          const total = stacks.reduce((s,x)=>s+x,0)
          const barH = (total/maxVal)*(height-30)
          const xPct = `${(i/bars.length)*100 + (50/bars.length)}%`
          const bw = `${(100/bars.length)*0.55}%`
          const isCur = i===curMonth
          let yOff = height-30
          return (
            <g key={i}>
              {stacks.map((sv,si)=>{
                const sh = (sv/maxVal)*(height-30)
                yOff -= sh
                return (
                  <rect key={si} x={`calc(${xPct} - ${bw}/2)`} y={yOff} width={bw} height={sh}
                    fill={colors?.[si]||'#6366f1'} rx={si===stacks.length-1?3:0} opacity={isCur?1:0.72} />
                )
              })}
              <text x={xPct} y={height-8} textAnchor="middle" fontSize={9} fontFamily={PF}
                fill={isCur?'#4f46e5':'#94a3b8'} fontWeight={isCur?700:400}>
                {labels?.[i]||MONTHS[i]||i}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function Card({ label, value, sub, color, icon }) {
  return (
    <div style={{ background:`linear-gradient(135deg,${color||'#1a2e3d'} 0%,${color||'#1a2e3d'}cc 100%)`, borderRadius:16, padding:'20px 22px', boxShadow:`0 6px 24px ${color||'#1a2e3d'}44`, flex:1, minWidth:150, position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', right:-18, top:-18, width:90, height:90, borderRadius:'50%', background:'rgba(255,255,255,0.10)', pointerEvents:'none' }} />
      <div style={{ position:'absolute', right:22, bottom:-28, width:110, height:110, borderRadius:'50%', background:'rgba(255,255,255,0.06)', pointerEvents:'none' }} />
      <div style={{ fontSize:26, marginBottom:6, position:'relative' }}>{icon}</div>
      <div style={{ fontSize:26, fontWeight:900, color:'#fff', position:'relative', letterSpacing:-0.5, lineHeight:1.1, fontFamily:PF }}>{value}</div>
      <div style={{ fontSize:11, color:'rgba(255,255,255,0.72)', marginTop:4, fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, fontFamily:PF }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:'rgba(255,255,255,0.50)', marginTop:3, fontFamily:PF }}>{sub}</div>}
    </div>
  )
}

// ── Quick Access items ────────────────────────────────────────────────────────
const QA_ITEMS = [
  { key:'employees',  label:'Employees',  icon:'👥', bg:'linear-gradient(135deg,#e0e7ff,#c7d2fe)', color:'#4338ca' },
  { key:'payroll',    label:'Payroll',    icon:'💰', bg:'linear-gradient(135deg,#d1fae5,#a7f3d0)', color:'#059669' },
  { key:'projects',   label:'Projects',   icon:'🏗️', bg:'linear-gradient(135deg,#fef3c7,#fde68a)', color:'#d97706' },
  { key:'expenses',   label:'Expenses',   icon:'💸', bg:'linear-gradient(135deg,#fee2e2,#fecaca)', color:'#dc2626' },
  { key:'invoices',   label:'Invoices',   icon:'📄', bg:'linear-gradient(135deg,#ede9fe,#ddd6fe)', color:'#7c3aed' },
  { key:'vehicles',   label:'Vehicles',   icon:'🚗', bg:'linear-gradient(135deg,#e0f2fe,#bae6fd)', color:'#0284c7' },
  { key:'hr',         label:'HR & Leave', icon:'🏖️', bg:'linear-gradient(135deg,#fce7f3,#fbcfe8)', color:'#db2777' },
  { key:'accounts',   label:'Accounts',   icon:'🏦', bg:'linear-gradient(135deg,#f0fdf4,#bbf7d0)', color:'#16a34a' },
  { key:'compliance', label:'Compliance', icon:'📋', bg:'linear-gradient(135deg,#fff7ed,#fed7aa)', color:'#ea580c' },
  { key:'reports',    label:'Reports',    icon:'📊', bg:'linear-gradient(135deg,#f8fafc,#e2e8f0)', color:'#475569' },
]

const TABS = [
  { id:'overview',  label:'Overview'   },
  { id:'payroll',   label:'Payroll'    },
  { id:'employees', label:'Employees'  },
  { id:'expenses',  label:'Expenses'   },
  { id:'projects',  label:'Projects'   },
  { id:'invoices',  label:'Invoices'   },
  { id:'accounts',  label:'Accounts'   },
]

const ENTITY_OPTS = [
  { label:'All',    code:'ALL'    },
  { label:'ACCSYS', code:'ACCSYS' },
  { label:'RAT',    code:'RAT'    },
  { label:'GWT',    code:'GWT'    },
]

// ── Status badge helper ───────────────────────────────────────────────────────
function StatusBadge({ v }) {
  const lv = String(v||'').toLowerCase()
  const [bg,col] = lv==='paid'||lv==='approved'||lv==='profit'||lv==='active'
    ? ['#d1fae5','#065f46']
    : lv==='pending'||lv==='outstanding'||lv==='in_progress'
    ? ['#fef3c7','#92400e']
    : ['#f1f5f9','#64748b']
  return v ? <span style={{ background:bg, color:col, padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700, fontFamily:PF }}>{v}</span> : <span style={{ color:'#94a3b8' }}>—</span>
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard({ entityId, entityCode, isAr, onNavigate }) {
  const now = new Date()
  const [activeTab,    setActiveTab]    = useState('overview')
  const [entityFilter, setEntityFilter] = useState('ALL')
  const [selMonth,     setSelMonth]     = useState(now.getMonth())
  const [selYear]                       = useState(now.getFullYear())
  const [allEntities,  setAllEntities]  = useState([])
  const [data,         setData]         = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [entitiesReady,setEntitiesReady]= useState(false)

  // Month dropdown options (last 12)
  const monthOpts = Array.from({ length:12 }, (_,i) => {
    const d = new Date(selYear, now.getMonth()-i, 1)
    return { label:`${MONTHS[d.getMonth()]} ${d.getFullYear()}`, month:d.getMonth() }
  })

  // Fetch entity list once
  useEffect(() => {
    supabase.from('entities').select('id,code,name').then(({ data:rows, error }) => {
      setAllEntities(rows || [])
      setEntitiesReady(true)
    })
  }, [])

  const loadAll = useCallback(async () => {
    if (!entitiesReady) return
    setLoading(true)
    try {
      const targetIds = entityFilter==='ALL'
        ? allEntities.map(e=>e.id)
        : allEntities.filter(e=>e.code===entityFilter).map(e=>e.id)

      // If no entity IDs resolved (e.g. entities table is empty), show empty state
      if (targetIds.length===0) { setData({ payrollRuns:[],employees:[],invoices:[],arRows:[],totalAR:0,totalInvoiced:0,receipts:[],projects:[],expenses:[],loans:[],vacations:[],compDocs:[],payrollByMonth:Array(12).fill(0),expByMonth:Array(12).fill(0),invByMonth:Array(12).fill(0),recByMonth:Array(12).fill(0) }); setLoading(false); return }

      const applyF = q => targetIds.length===1
        ? q.eq('entity_id', targetIds[0])
        : q.in('entity_id', targetIds)

      const [
        { data: payrollRuns  },
        { data: employees    },
        { data: invoices     },
        { data: payAllocs    },
        { data: receipts     },
        { data: projects     },
        { data: expenses     },
        { data: loans        },
        { data: vacations    },
        { data: compDocs     },
        { data: payrollChart },
        { data: expChart     },
        { data: invChart     },
        { data: recChart     },
      ] = await Promise.all([
        applyF(supabase.from('payroll_runs').select('id,entity_id,total_salary,status,month,year'))
          .eq('year',selYear).eq('month',selMonth+1),
        applyF(supabase.from('employees').select('id,entity_id,status,category')),
        applyF(supabase.from('invoices').select('id,entity_id,net_payable,issue_date,status')),
        supabase.from('payment_allocations').select('invoice_id,amount'),
        applyF(supabase.from('payment_receipts').select('id,entity_id,amount,receipt_date')),
        applyF(supabase.from('projects').select('id,entity_id,status,budget,contract_value')),
        applyF(supabase.from('money_requests').select('id,entity_id,amount,status,created_at')),
        applyF(supabase.from('employee_loans').select('id,entity_id,amount,status')),
        applyF(supabase.from('vacations').select('id,entity_id,status')),
        applyF(supabase.from('compliance_docs').select('id,entity_id,status,expiry_date')),
        // Full-year chart data
        applyF(supabase.from('payroll_runs').select('total_salary,month')).eq('year',selYear),
        applyF(supabase.from('money_requests').select('amount,created_at'))
          .gte('created_at',`${selYear}-01-01`).lt('created_at',`${selYear+1}-01-01`),
        applyF(supabase.from('invoices').select('net_payable,issue_date'))
          .gte('issue_date',`${selYear}-01-01`).lt('issue_date',`${selYear+1}-01-01`),
        applyF(supabase.from('payment_receipts').select('amount,receipt_date'))
          .gte('receipt_date',`${selYear}-01-01`).lt('receipt_date',`${selYear+1}-01-01`),
      ])

      // Build AR map
      const allocMap = {}
      ;(payAllocs||[]).forEach(pa => { allocMap[pa.invoice_id] = (allocMap[pa.invoice_id]||0) + (pa.amount||0) })

      const arRows = (invoices||[]).map(inv => ({
        ...inv,
        outstanding: Math.max(0, (inv.net_payable||0) - (allocMap[inv.id]||0))
      }))
      const totalAR       = arRows.reduce((s,r)=>s+r.outstanding,0)
      const totalInvoiced = (invoices||[]).reduce((s,i)=>s+(i.net_payable||0),0)

      // Monthly series
      const payrollByMonth = Array(12).fill(0)
      ;(payrollChart||[]).forEach(r => { payrollByMonth[(r.month||1)-1] += (r.total_salary||0) })
      const expByMonth = Array(12).fill(0)
      ;(expChart||[]).forEach(r => { const m=new Date(r.created_at).getMonth(); if(!isNaN(m)) expByMonth[m]+=(r.amount||0) })
      const invByMonth = Array(12).fill(0)
      ;(invChart||[]).forEach(r => { const m=new Date(r.issue_date).getMonth(); if(!isNaN(m)) invByMonth[m]+=(r.net_payable||0) })
      const recByMonth = Array(12).fill(0)
      ;(recChart||[]).forEach(r => { const m=new Date(r.receipt_date).getMonth(); if(!isNaN(m)) recByMonth[m]+=(r.amount||0) })

      setData({
        payrollRuns:    payrollRuns||[],
        employees:      employees||[],
        invoices:       invoices||[],
        arRows,
        totalAR,
        totalInvoiced,
        receipts:       receipts||[],
        projects:       projects||[],
        expenses:       expenses||[],
        loans:          loans||[],
        vacations:      vacations||[],
        compDocs:       compDocs||[],
        payrollByMonth,
        expByMonth,
        invByMonth,
        recByMonth,
      })
    } catch(e) {
      console.error('Dashboard loadAll error', e)
    }
    setLoading(false)
  }, [allEntities, entityFilter, selMonth, selYear, entitiesReady])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Tab content derivation ──────────────────────────────────────────────────
  const getTabContent = () => {
    if (!data) return null
    const {
      payrollRuns, employees, invoices, arRows, totalAR, totalInvoiced,
      receipts, projects, expenses, loans, vacations, compDocs,
      payrollByMonth, expByMonth, invByMonth, recByMonth
    } = data

    const activeEmp    = employees.filter(e=>e.status==='active')
    const inactiveEmp  = employees.filter(e=>e.status!=='active')
    const onLeave      = vacations.filter(v=>v.status==='approved')
    const totalPayroll = payrollRuns.reduce((s,r)=>s+(r.total_salary||0),0)
    const approvedExp  = expenses.filter(e=>e.status==='approved').reduce((s,e)=>s+(e.amount||0),0)
    const pendingExp   = expenses.filter(e=>e.status==='pending').reduce((s,e)=>s+(e.amount||0),0)
    const totalExpAmt  = expenses.reduce((s,e)=>s+(e.amount||0),0)
    const activeProj   = projects.filter(p=>p.status==='active'||p.status==='in_progress')
    const completedProj= projects.filter(p=>p.status==='completed')
    const totalBudget  = projects.reduce((s,p)=>s+(p.budget||0),0)
    const totalContract= projects.reduce((s,p)=>s+(p.contract_value||0),0)
    const loansActive  = loans.filter(l=>l.status==='active').reduce((s,l)=>s+(l.amount||0),0)
    const totalReceipts= receipts.reduce((s,r)=>s+(r.amount||0),0)
    const compExpired  = compDocs.filter(d=>d.status==='expired'||(d.expiry_date&&new Date(d.expiry_date)<new Date()))
    const collected    = totalInvoiced - totalAR

    if (activeTab==='overview') return {
      kpis:[
        { label:'Total Payroll',    value:'SAR '+fmtK(totalPayroll),   sub:`${payrollRuns.length} run(s) this month`, color:'#1d4ed8', icon:'💰' },
        { label:'Active Employees', value:fmt(activeEmp.length),        sub:`${inactiveEmp.length} inactive`,          color:'#0891b2', icon:'👥' },
        { label:'AR Outstanding',   value:'SAR '+fmtK(totalAR),        sub:`of ${fmtK(totalInvoiced)} invoiced`,       color:'#7c3aed', icon:'📊' },
        { label:'Total Receipts',   value:'SAR '+fmtK(totalReceipts),  sub:'collected',                               color:'#be185d', icon:'📈' },
      ],
      pie:{ title:'Employees by Category',
        slices:[
          { label:'Staff',      value:employees.filter(e=>e.category==='staff').length,      color:'#6366f1' },
          { label:'Labour',     value:employees.filter(e=>e.category==='labour').length,     color:'#06b6d4' },
          { label:'Management', value:employees.filter(e=>e.category==='management').length, color:'#f59e0b' },
          { label:'Other',      value:employees.filter(e=>!['staff','labour','management'].includes(e.category)).length, color:'#10b981' },
        ].filter(s=>s.value),
        centerLabel:fmt(employees.length), centerSub:'Total'
      },
      bar:{ title:'Monthly Payroll (SAR)', bars:payrollByMonth, colors:['#6366f1'], labels:MONTHS },
      tableTitle:'Payroll Runs',
      tableHeaders:['Period','Amount','Status'],
      tableRows: payrollRuns.slice(0,6).map(r=>[`${r.month}/${r.year}`,'SAR '+fmtK(r.total_salary),r.status||'draft']),
      barsTitle:'Key Metrics',
      barsItems:[
        { label:'Approved Expenses', value:approvedExp,       max:Math.max(totalExpAmt,1),     color:'#10b981' },
        { label:'Pending Expenses',  value:pendingExp,        max:Math.max(totalExpAmt,1),     color:'#f59e0b' },
        { label:'AR Outstanding',    value:totalAR,           max:Math.max(totalInvoiced,1),   color:'#6366f1' },
        { label:'Collected',         value:collected,         max:Math.max(totalInvoiced,1),   color:'#0891b2' },
      ],
    }

    if (activeTab==='payroll') {
      const paidPayroll   = payrollRuns.filter(r=>r.status==='paid').reduce((s,r)=>s+(r.total_salary||0),0)
      const pendingPayroll= payrollRuns.filter(r=>r.status==='pending').reduce((s,r)=>s+(r.total_salary||0),0)
      const draftPayroll  = payrollRuns.filter(r=>r.status==='draft').reduce((s,r)=>s+(r.total_salary||0),0)
      return {
        kpis:[
          { label:'Total Paid',      value:'SAR '+fmtK(paidPayroll),   sub:'paid runs',           color:'#1d4ed8', icon:'✅' },
          { label:'Pending',         value:'SAR '+fmtK(pendingPayroll),sub:`${payrollRuns.filter(r=>r.status==='pending').length} runs`, color:'#d97706', icon:'⏳' },
          { label:'Avg Per Employee',value:'SAR '+fmtK(activeEmp.length?totalPayroll/activeEmp.length:0), sub:'per active employee', color:'#0891b2', icon:'📐' },
          { label:'On Payroll',      value:fmt(activeEmp.length),      sub:'active employees',    color:'#7c3aed', icon:'👤' },
        ],
        pie:{ title:'Payroll by Status',
          slices:[
            { label:'Paid',    value:paidPayroll,    color:'#10b981' },
            { label:'Pending', value:pendingPayroll, color:'#f59e0b' },
            { label:'Draft',   value:draftPayroll,   color:'#6366f1' },
          ].filter(s=>s.value),
          centerLabel:'SAR '+fmtK(totalPayroll), centerSub:'Total'
        },
        bar:{ title:'Monthly Payroll Trend (SAR)', bars:payrollByMonth, colors:['#6366f1'], labels:MONTHS },
        tableTitle:'Payroll Runs',
        tableHeaders:['Period','Amount','Status'],
        tableRows: payrollRuns.slice(0,8).map(r=>[`${r.month}/${r.year}`,'SAR '+fmtK(r.total_salary),r.status||'draft']),
        barsTitle:'Category Distribution',
        barsItems:[
          { label:'Staff',      value:employees.filter(e=>e.category==='staff').length,      max:Math.max(employees.length,1), color:'#6366f1', isCount:true },
          { label:'Labour',     value:employees.filter(e=>e.category==='labour').length,     max:Math.max(employees.length,1), color:'#06b6d4', isCount:true },
          { label:'Management', value:employees.filter(e=>e.category==='management').length, max:Math.max(employees.length,1), color:'#f59e0b', isCount:true },
        ],
      }
    }

    if (activeTab==='employees') return {
      kpis:[
        { label:'Active',       value:fmt(activeEmp.length),   sub:'employed',          color:'#1d4ed8', icon:'✅' },
        { label:'On Leave',     value:fmt(onLeave.length),     sub:'approved leave',    color:'#0891b2', icon:'🏖️' },
        { label:'Inactive',     value:fmt(inactiveEmp.length), sub:'inactive/resigned', color:'#dc2626', icon:'❌' },
        { label:'Exp Docs',     value:fmt(compExpired.length), sub:'docs expired',      color:'#d97706', icon:'⚠️' },
      ],
      pie:{ title:'By Status',
        slices:[
          { label:'Active',   value:activeEmp.length,   color:'#10b981' },
          { label:'Inactive', value:inactiveEmp.length, color:'#ef4444' },
          { label:'On Leave', value:onLeave.length,     color:'#f59e0b' },
        ].filter(s=>s.value),
        centerLabel:fmt(employees.length), centerSub:'Total'
      },
      bar:{ title:'Monthly Payroll Cost (SAR)', bars:payrollByMonth, colors:['#6366f1'], labels:MONTHS },
      tableTitle:'Employee List',
      tableHeaders:['ID','Category','Status'],
      tableRows: employees.slice(0,8).map(e=>[e.id?.slice(0,8)||'—', e.category||'—', e.status||'—']),
      barsTitle:'HR Overview',
      barsItems:[
        { label:'Active',     value:activeEmp.length,     max:Math.max(employees.length,1), color:'#10b981', isCount:true },
        { label:'On Leave',   value:onLeave.length,       max:Math.max(employees.length,1), color:'#f59e0b', isCount:true },
        { label:'Compliance', value:compDocs.length-compExpired.length, max:Math.max(compDocs.length,1), color:'#6366f1', isCount:true },
        { label:'Exp Docs',   value:compExpired.length,   max:Math.max(compDocs.length,1), color:'#ef4444', isCount:true },
      ],
    }

    if (activeTab==='expenses') return {
      kpis:[
        { label:'Total Expenses', value:'SAR '+fmtK(totalExpAmt),  sub:`${expenses.length} requests`,                    color:'#dc2626', icon:'💸' },
        { label:'Approved',       value:'SAR '+fmtK(approvedExp),  sub:'approved',                                        color:'#1d4ed8', icon:'✅' },
        { label:'Pending',        value:'SAR '+fmtK(pendingExp),   sub:`${expenses.filter(e=>e.status==='pending').length} pending`, color:'#d97706', icon:'⏳' },
        { label:'Loans Active',   value:'SAR '+fmtK(loansActive),  sub:`${loans.filter(l=>l.status==='active').length} loans`, color:'#7c3aed', icon:'🏦' },
      ],
      pie:{ title:'Expenses by Status',
        slices:[
          { label:'Approved', value:approvedExp, color:'#10b981' },
          { label:'Pending',  value:pendingExp,  color:'#f59e0b' },
          { label:'Rejected', value:expenses.filter(e=>e.status==='rejected').reduce((s,e)=>s+(e.amount||0),0), color:'#ef4444' },
        ].filter(s=>s.value),
        centerLabel:'SAR '+fmtK(totalExpAmt), centerSub:'Total'
      },
      bar:{ title:'Monthly Expenses (SAR)', bars:expByMonth, colors:['#ef4444'], labels:MONTHS },
      tableTitle:'Recent Expense Requests',
      tableHeaders:['Date','Amount','Status'],
      tableRows: expenses.slice(0,8).map(e=>[new Date(e.created_at).toLocaleDateString(),'SAR '+fmtK(e.amount),e.status||'—']),
      barsTitle:'Breakdown',
      barsItems:[
        { label:'Approved', value:approvedExp, max:Math.max(totalExpAmt,1), color:'#10b981' },
        { label:'Pending',  value:pendingExp,  max:Math.max(totalExpAmt,1), color:'#f59e0b' },
        { label:'Loans',    value:loansActive, max:Math.max(totalExpAmt,loansActive,1), color:'#7c3aed' },
      ],
    }

    if (activeTab==='projects') return {
      kpis:[
        { label:'Active Projects', value:fmt(activeProj.length),       sub:`of ${projects.length} total`,    color:'#1d4ed8', icon:'🏗️' },
        { label:'Total Budget',    value:'SAR '+fmtK(totalBudget),     sub:'allocated',                      color:'#d97706', icon:'📦' },
        { label:'Completed',       value:fmt(completedProj.length),    sub:'done',                           color:'#059669', icon:'✅' },
        { label:'Contract Value',  value:'SAR '+fmtK(totalContract),   sub:'total contracts',                color:'#7c3aed', icon:'📋' },
      ],
      pie:{ title:'Projects by Status',
        slices:[
          { label:'Active',    value:activeProj.length,    color:'#6366f1' },
          { label:'Completed', value:completedProj.length, color:'#10b981' },
          { label:'Other',     value:projects.length-activeProj.length-completedProj.length, color:'#94a3b8' },
        ].filter(s=>s.value),
        centerLabel:fmt(projects.length), centerSub:'Total'
      },
      bar:{ title:'Monthly Invoices (SAR)', bars:invByMonth, colors:['#6366f1'], labels:MONTHS },
      tableTitle:'Projects',
      tableHeaders:['Project','Budget','Status'],
      tableRows: projects.slice(0,8).map(p=>[p.id?.slice(0,8)||'—','SAR '+fmtK(p.budget||0),p.status||'—']),
      barsTitle:'Budget Utilization',
      barsItems:[
        { label:'Active Budget',    value:activeProj.reduce((s,p)=>s+(p.budget||0),0),     max:Math.max(totalBudget,1), color:'#6366f1' },
        { label:'Completed Budget', value:completedProj.reduce((s,p)=>s+(p.budget||0),0),  max:Math.max(totalBudget,1), color:'#10b981' },
        { label:'Contract vs Budget', value:totalBudget,                                    max:Math.max(totalContract,1), color:'#f59e0b' },
      ],
    }

    if (activeTab==='invoices') return {
      kpis:[
        { label:'Total Invoiced',  value:'SAR '+fmtK(totalInvoiced), sub:`${invoices.length} invoices`, color:'#1d4ed8', icon:'📄' },
        { label:'Outstanding AR',  value:'SAR '+fmtK(totalAR),       sub:'to collect',                  color:'#dc2626', icon:'⚠️' },
        { label:'Collected',       value:'SAR '+fmtK(collected),     sub:'received',                    color:'#059669', icon:'✅' },
        { label:'Receipts',        value:'SAR '+fmtK(totalReceipts), sub:'this period',                 color:'#7c3aed', icon:'🏦' },
      ],
      pie:{ title:'Invoice Collection Status',
        slices:[
          { label:'Collected',   value:collected, color:'#10b981' },
          { label:'Outstanding', value:totalAR,   color:'#ef4444' },
        ].filter(s=>s.value),
        centerLabel:'SAR '+fmtK(totalInvoiced), centerSub:'Total'
      },
      bar:{ title:'Monthly: Invoiced vs Collected (SAR)',
        bars: MONTHS.map((_,i)=>[invByMonth[i], recByMonth[i]]),
        colors:['#6366f1','#10b981'], labels:MONTHS
      },
      tableTitle:'Invoices',
      tableHeaders:['Date','Invoiced','Outstanding'],
      tableRows: arRows.slice(0,8).map(r=>[
        r.issue_date ? new Date(r.issue_date).toLocaleDateString() : '—',
        'SAR '+fmtK(r.net_payable),
        'SAR '+fmtK(r.outstanding),
      ]),
      barsTitle:'Collection Rate',
      barsItems:[
        { label:'Collected',    value:collected, max:Math.max(totalInvoiced,1), color:'#10b981' },
        { label:'Outstanding',  value:totalAR,   max:Math.max(totalInvoiced,1), color:'#ef4444' },
      ],
    }

    if (activeTab==='accounts') {
      const totalCost = totalPayroll + approvedExp
      const netPL     = totalReceipts - totalCost
      return {
        kpis:[
          { label:'Total Revenue',  value:'SAR '+fmtK(totalReceipts),  sub:'receipts',           color:'#059669', icon:'📈' },
          { label:'Total Cost',     value:'SAR '+fmtK(totalCost),      sub:'payroll + expenses', color:'#dc2626', icon:'📉' },
          { label:'Net P&L',        value:(netPL>=0?'+':'−')+'SAR '+fmtK(Math.abs(netPL)), sub:netPL>=0?'Profit':'Loss', color:netPL>=0?'#1d4ed8':'#b91c1c', icon:netPL>=0?'💹':'🔴' },
          { label:'AR Outstanding', value:'SAR '+fmtK(totalAR),        sub:'receivable',         color:'#7c3aed', icon:'🏦' },
        ],
        pie:{ title:'Revenue vs Cost',
          slices:[
            { label:'Revenue',  value:totalReceipts, color:'#10b981' },
            { label:'Payroll',  value:totalPayroll,  color:'#6366f1' },
            { label:'Expenses', value:approvedExp,   color:'#ef4444' },
          ].filter(s=>s.value),
          centerLabel:(netPL>=0?'+':'-')+fmtK(Math.abs(netPL)), centerSub:'Net P&L'
        },
        bar:{ title:'Monthly Revenue vs Expenses (SAR)',
          bars: MONTHS.map((_,i)=>[recByMonth[i], expByMonth[i]]),
          colors:['#10b981','#ef4444'], labels:MONTHS
        },
        tableTitle:'Financial Summary',
        tableHeaders:['Item','Amount','Note'],
        tableRows:[
          ['Total Revenue', 'SAR '+fmtK(totalReceipts), ''],
          ['Total Payroll', 'SAR '+fmtK(totalPayroll),  ''],
          ['Total Expenses','SAR '+fmtK(approvedExp),   ''],
          ['Net P&L',       'SAR '+fmtK(Math.abs(netPL)), netPL>=0?'Profit':'Loss'],
        ],
        barsTitle:'Cost Breakdown',
        barsItems:[
          { label:'Payroll',  value:totalPayroll,  max:Math.max(totalReceipts,totalCost,1), color:'#6366f1' },
          { label:'Expenses', value:approvedExp,   max:Math.max(totalReceipts,totalCost,1), color:'#ef4444' },
          { label:'Revenue',  value:totalReceipts, max:Math.max(totalReceipts,totalCost,1), color:'#10b981' },
        ],
      }
    }

    return null
  }

  const tc = getTabContent()

  return (
    <div style={{ fontFamily:PF, background:'#f8fafc', minHeight:'100vh' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap');*{box-sizing:border-box}`}</style>

      {/* ── Header ── */}
      <div style={{ background:'linear-gradient(135deg,#1e1b4b 0%,#312e81 50%,#1e1b4b 100%)', padding:'0 24px' }}>

        {/* Entity filter + Month dropdown */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', paddingTop:16, paddingBottom:10, flexWrap:'wrap', gap:10 }}>
          <div style={{ display:'flex', gap:6 }}>
            {ENTITY_OPTS.map(opt=>(
              <button key={opt.code} onClick={()=>setEntityFilter(opt.code)}
                style={{ padding:'6px 16px', borderRadius:20, border:'1.5px solid',
                  borderColor: entityFilter===opt.code?'#818cf8':'rgba(255,255,255,0.25)',
                  background:  entityFilter===opt.code?'rgba(129,140,248,0.25)':'transparent',
                  color:       entityFilter===opt.code?'#e0e7ff':'rgba(255,255,255,0.6)',
                  fontFamily:PF, fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}>
                {opt.label}
              </button>
            ))}
          </div>
          <select value={selMonth} onChange={e=>setSelMonth(Number(e.target.value))}
            style={{ background:'rgba(255,255,255,0.12)', border:'1.5px solid rgba(255,255,255,0.25)', color:'#e0e7ff', borderRadius:20, padding:'6px 14px', fontSize:12, fontFamily:PF, fontWeight:600, cursor:'pointer', outline:'none' }}>
            {monthOpts.map((m,i)=>(
              <option key={i} value={m.month} style={{ background:'#312e81' }}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Tab bar */}
        <div style={{ display:'flex', gap:2, overflowX:'auto', scrollbarWidth:'none' }}>
          {TABS.map(tab=>(
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)}
              style={{ padding:'11px 18px', border:'none',
                borderBottom: activeTab===tab.id?'3px solid #818cf8':'3px solid transparent',
                background:'transparent',
                color: activeTab===tab.id?'#c7d2fe':'rgba(255,255,255,0.5)',
                fontFamily:PF, fontSize:13, fontWeight:activeTab===tab.id?700:500,
                cursor:'pointer', transition:'all 0.15s', whiteSpace:'nowrap', flexShrink:0 }}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sticky Quick Access strip ── */}
      <div style={{ position:'sticky', top:0, zIndex:40, background:'#fff', borderBottom:'1px solid #e2e8f0', boxShadow:'0 2px 12px rgba(0,0,0,0.07)', padding:'10px 24px' }}>
        <div style={{ display:'flex', gap:10, overflowX:'auto', scrollbarWidth:'none' }}>
          {QA_ITEMS.map(item=>(
            <button key={item.key} onClick={()=>onNavigate && onNavigate(item.key)}
              style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'8px 14px', borderRadius:14, border:'none', background:item.bg, cursor:'pointer', flexShrink:0, minWidth:72, transition:'transform 0.12s,box-shadow 0.12s', boxShadow:'0 2px 8px rgba(0,0,0,0.06)' }}
              onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 6px 18px rgba(0,0,0,0.12)' }}
              onMouseLeave={e=>{ e.currentTarget.style.transform='translateY(0)';    e.currentTarget.style.boxShadow='0 2px 8px rgba(0,0,0,0.06)'  }}>
              <span style={{ fontSize:20, lineHeight:1 }}>{item.icon}</span>
              <span style={{ fontSize:10, fontWeight:700, color:item.color, fontFamily:PF, letterSpacing:0.2 }}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ padding:'24px', maxWidth:1400, margin:'0 auto' }}>
        {loading ? (
          <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:320 }}>
            <div style={{ textAlign:'center' }}>
              <div style={{ width:48, height:48, border:'4px solid #e2e8f0', borderTopColor:'#6366f1', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto 12px' }} />
              <div style={{ color:'#94a3b8', fontSize:13, fontFamily:PF }}>Loading dashboard…</div>
            </div>
          </div>
        ) : !tc ? (
          <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:320, color:'#94a3b8', fontSize:14, fontFamily:PF }}>No data available</div>
        ) : (
          <>
            {/* KPI Cards */}
            <div style={{ display:'flex', gap:16, marginBottom:24, flexWrap:'wrap' }}>
              {tc.kpis.map((k,i)=>(
                <Card key={i} label={k.label} value={k.value} sub={k.sub} color={k.color} icon={k.icon} />
              ))}
            </div>

            {/* Charts row */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))', gap:20, marginBottom:24 }}>
              <div style={{ background:'#fff', borderRadius:16, padding:20, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#1e293b', fontFamily:PF, marginBottom:16 }}>{tc.pie.title}</div>
                <DonutChart slices={tc.pie.slices} centerLabel={tc.pie.centerLabel} centerSub={tc.pie.centerSub} />
              </div>
              <div style={{ background:'#fff', borderRadius:16, padding:20, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#1e293b', fontFamily:PF, marginBottom:12 }}>{tc.bar.title}</div>
                <BarChart bars={tc.bar.bars} colors={tc.bar.colors} labels={tc.bar.labels} height={200} />
              </div>
            </div>

            {/* Bottom row: Table + Bar Breakdown */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:20 }}>
              {/* Table */}
              <div style={{ background:'#fff', borderRadius:16, boxShadow:'0 2px 12px rgba(0,0,0,0.06)', overflow:'hidden' }}>
                <div style={{ padding:'14px 20px', borderBottom:'1px solid #f1f5f9' }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'#1e293b', fontFamily:PF }}>{tc.tableTitle}</span>
                </div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:PF }}>
                    <thead>
                      <tr style={{ background:'#f8fafc' }}>
                        {tc.tableHeaders.map((h,i)=>(
                          <th key={i} style={{ padding:'10px 16px', textAlign:'left', fontSize:10, fontWeight:700, color:'#64748b', textTransform:'uppercase', letterSpacing:0.6, borderBottom:'1px solid #f1f5f9' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tc.tableRows.length===0 ? (
                        <tr><td colSpan={tc.tableHeaders.length} style={{ padding:20, textAlign:'center', color:'#94a3b8', fontSize:12 }}>No records</td></tr>
                      ) : tc.tableRows.map((row,ri)=>(
                        <tr key={ri} style={{ borderBottom:'1px solid #f8fafc' }}
                          onMouseEnter={e=>e.currentTarget.style.background='#f8faff'}
                          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                          {row.map((cell,ci)=>(
                            <td key={ci} style={{ padding:'10px 16px', fontSize:12, color:ci===0?'#1e293b':'#475569', fontWeight:ci===0?600:400 }}>
                              {ci===row.length-1 ? <StatusBadge v={cell} /> : cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bar breakdown */}
              <div style={{ background:'#fff', borderRadius:16, padding:20, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:13, fontWeight:700, color:'#1e293b', fontFamily:PF, marginBottom:20 }}>{tc.barsTitle}</div>
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  {tc.barsItems.map((item,i)=>{
                    const pct = Math.min(100, Math.round((item.value/(item.max||1))*100))
                    return (
                      <div key={i}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontFamily:PF }}>
                          <span style={{ fontSize:12, color:'#475569', fontWeight:500 }}>{item.label}</span>
                          <span style={{ fontSize:12, color:'#1e293b', fontWeight:700 }}>
                            {item.isCount ? fmt(item.value) : 'SAR '+fmtK(item.value)}
                            <span style={{ fontSize:10, color:'#94a3b8', marginLeft:5 }}>({pct}%)</span>
                          </span>
                        </div>
                        <div style={{ height:8, background:'#f1f5f9', borderRadius:99, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${pct}%`, background:item.color, borderRadius:99, transition:'width 0.6s ease' }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
