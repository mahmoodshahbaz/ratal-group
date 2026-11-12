import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

const L1 = '#B8A5CF'
const L2 = '#F5EFFA'
const L3 = '#7444A3'
const PP = "'Poppins', sans-serif"

const fmt  = n => (+n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtD = d => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'
const today    = () => new Date().toISOString().slice(0,10)
const yearStart= () => `${new Date().getFullYear()}-01-01`

const S = {
  card: {background:'#fff',borderRadius:12,padding:'14px 18px',boxShadow:'0 2px 8px rgba(0,0,0,0.07)',marginBottom:10},
  btn:  (c=L3)=>({background:c,color:'#fff',border:'none',borderRadius:8,padding:'8px 16px',fontSize:12,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',fontFamily:PP}),
  btnO: (c=L3)=>({background:'transparent',color:c,border:`1.5px solid ${c}`,borderRadius:8,padding:'7px 15px',fontSize:12,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',fontFamily:PP}),
  inp:  {padding:'7px 10px',borderRadius:7,border:'1px solid #dde3ec',fontSize:12,outline:'none',background:'#fff',fontFamily:PP},
  sel:  {padding:'7px 10px',borderRadius:7,border:'1px solid #dde3ec',fontSize:12,outline:'none',background:'#fff',minWidth:220,fontFamily:PP},
  lbl:  {display:'block',fontSize:11,fontWeight:600,color:'#6b7c93',marginBottom:4,fontFamily:PP},
}

// ── Shared print opener ─────────────────────────────────────────────
function openPrint(title, body) {
  const w = window.open('','_blank')
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    body{font-family:Arial,sans-serif;padding:28px 32px;font-size:11px;color:#1a2e3d;max-width:960px;margin:0 auto}
    .co{font-size:16px;font-weight:800}.meta{color:#666;font-size:10px;margin-top:3px}
    .hdr{display:flex;justify-content:space-between;margin-bottom:18px;border-bottom:2px solid #1a2e3d;padding-bottom:10px}
    h3{font-size:11px;font-weight:800;background:#1a2e3d;color:#fff;padding:6px 10px;margin:14px 0 0;letter-spacing:.5px}
    table{width:100%;border-collapse:collapse;font-size:10px}
    th{background:#f5f7fa;padding:5px 8px;text-align:left;font-weight:700;border-bottom:1.5px solid #ccc;color:#445}
    th.r,td.r{text-align:right}td{padding:5px 8px;border-bottom:1px solid #f0f0f0}
    .tot td{background:#1a2e3d;color:#fff;font-weight:800;padding:7px 8px;border:none}
    .krow{display:flex;gap:12px;margin-bottom:14px;flex-wrap:wrap}
    .kcard{flex:1;min-width:120px;background:#f9f9f9;border-radius:5px;padding:7px 10px;border-left:3px solid #7444A3}
    .kcard .kv{font-size:13px;font-weight:800}.kcard .kl{font-size:9px;color:#888;margin-bottom:2px}
    .sb{font-size:9px;padding:1px 5px;border-radius:3px;font-weight:700}
    @media print{@page{size:A4;margin:1.2cm}body{padding:0}}
  </style></head><body>${body}
  <p style="margin-top:20px;font-size:9px;color:#aaa">Computer generated statement — ACCSYS by Ratal Group</p>
  <script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script>
  </body></html>`)
  w.document.close()
}

// ── Shared UI components ────────────────────────────────────────────
function KPIs({ items }) {
  return (
    <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(items.length,5)},1fr)`,gap:8,marginBottom:12}}>
      {items.map(k=>(
        <div key={k.label} style={{background:'#fff',borderRadius:10,padding:'10px 14px',boxShadow:'0 1px 5px rgba(0,0,0,0.06)',borderLeft:`3px solid ${k.color||L3}`}}>
          <div style={{fontSize:10,color:'#6b7c93',marginBottom:2,fontFamily:PP}}>{k.label}</div>
          <div style={{fontWeight:800,fontSize:14,color:k.color||'#1a2e3d',fontFamily:PP}}>{k.noFmt?k.val:fmt(k.val)}</div>
          {!k.noFmt&&<div style={{fontSize:9,color:'#aab2bd'}}>SAR</div>}
        </div>
      ))}
    </div>
  )
}

function SecHead({ color=L3, title }) {
  return <div style={{background:color,color:'#fff',padding:'8px 14px',fontWeight:700,fontSize:12,fontFamily:PP,borderRadius:'6px 6px 0 0',marginTop:12}}>{title}</div>
}

function StmtTable({ headers, rows, footer }) {
  return (
    <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
      <thead>
        <tr style={{background:'#f5f7fa'}}>
          {headers.map((h,i)=>(
            <th key={i} style={{padding:'7px 12px',textAlign:h.r?'right':'left',fontWeight:700,fontSize:10,color:'#6b7c93',borderBottom:'1.5px solid #e0e0e0',fontFamily:PP}}>{h.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length===0
          ? <tr><td colSpan={headers.length} style={{padding:'24px',textAlign:'center',color:'#aab2bd',fontFamily:PP}}>No records found</td></tr>
          : rows.map((row,i)=>(
            <tr key={i} style={{borderBottom:'1px solid #f5f5f5',background:i%2===0?'#fff':'#fafbfc'}}>
              {row.map((cell,j)=>(
                <td key={j} style={{padding:'6px 12px',textAlign:headers[j]?.r?'right':'left',fontFamily:PP,fontSize:12,...(cell?.s||{})}}>
                  {cell?.v!==undefined?cell.v:cell}
                </td>
              ))}
            </tr>
          ))
        }
      </tbody>
      {footer&&<tfoot><tr style={{background:'#1a2e3d',color:'#fff'}}>{footer.map((c,j)=><td key={j} style={{padding:'9px 12px',fontWeight:700,fontSize:12,textAlign:headers[j]?.r?'right':'left',fontFamily:PP}}>{c}</td>)}</tr></tfoot>}
    </table>
  )
}

function Empty({ msg }) {
  return <div style={{...S.card,textAlign:'center',padding:48,color:'#aab2bd',fontFamily:PP}}>{msg}</div>
}

function FiltersBar({ onGenerate, loading, hasData, onPrint, children }) {
  return (
    <div style={{...S.card,display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap'}}>
      {children}
      <button style={S.btn()} onClick={onGenerate} disabled={loading}>{loading?'Loading…':'📄 Generate'}</button>
      {hasData&&<button style={S.btnO('#2e7d32')} onClick={onPrint}>🖨 Print / PDF</button>}
    </div>
  )
}

// ── Shared payment-line fetcher ─────────────────────────────────────
// Returns lines from money_request_lines joined with their MR + money_received
async function fetchPaymentLines({ entityId, from, to, partyId, deptId, projectId }) {
  const mrQ = await supabase.from('money_requests')
    .select('id,request_number,request_date,paid_from,status,department_id')
    .eq('entity_id', entityId)
    .gte('request_date', from).lte('request_date', to)
    .neq('status','DRAFT')
  const mrs = mrQ.data || []
  if (!mrs.length) return { lines:[], mrMap:{} }

  let mrIds = mrs.map(m=>m.id)

  // Department filter — only MRs from that dept
  if (deptId) mrIds = mrs.filter(m=>m.department_id===deptId).map(m=>m.id)
  if (!mrIds.length) return { lines:[], mrMap:{} }

  const mrMap = Object.fromEntries(mrs.map(m=>[m.id,m]))

  let lQ = supabase.from('money_request_lines').select('*').in('money_request_id',mrIds)
  if (partyId)   lQ = lQ.eq('party_id', partyId)
  if (projectId) lQ = lQ.eq('project_id', projectId)
  const { data: lines } = await lQ

  // Fetch money_received for reference + actual payment date
  const { data: received } = await supabase.from('money_received').select('*').in('money_request_id', mrIds)
  const rcvByMR = {}
  ;(received||[]).forEach(r=>{ if(!rcvByMR[r.money_request_id]) rcvByMR[r.money_request_id]=r })

  // Enrich each line
  const enriched = (lines||[]).map(l=>{
    const mr  = mrMap[l.money_request_id] || {}
    const rcv = rcvByMR[l.money_request_id] || {}
    return { ...l, mr, rcv,
      payDate:   rcv.received_date || mr.request_date,
      reference: l.bank_ref || rcv.reference || mr.request_number || '—',
      bank:      rcv.bank_account || mr.paid_from || '—',
      mrNumber:  mr.request_number || '—',
      deptId:    mr.department_id,
    }
  })

  return { lines: enriched, mrMap }
}

// ═══════════════════════════════════════════════════════════════════
// TAB 1 — CONTRACTOR STATEMENT
// ═══════════════════════════════════════════════════════════════════
function ContractorStatement({ entityId }) {
  const [list,     setList]     = useState([])
  const [selId,    setSelId]    = useState('')
  const [from,     setFrom]     = useState(yearStart())
  const [to,       setTo]       = useState(today())
  const [ipos,     setIpos]     = useState([])
  const [invs,     setInvs]     = useState([])
  const [receipts, setReceipts] = useState([])
  const [loading,  setLoading]  = useState(false)

  useEffect(()=>{
    supabase.from('contractors').select('id,contractor_name,contractor_code').eq('entity_id',entityId).eq('status','ACTIVE').in('vendor_type',['CONTRACTOR']).order('contractor_name').then(({data})=>setList(data||[]))
  },[entityId])

  async function generate() {
    if(!selId) return
    setLoading(true)
    const [a,b,c] = await Promise.all([
      supabase.from('incoming_pos').select('id,po_number,po_date,total_value,status,contractor_po_number,projects(project_number,project_name)').eq('entity_id',entityId).eq('contractor_id',selId).gte('po_date',from).lte('po_date',to).order('po_date'),
      supabase.from('invoices').select('id,invoice_no,issue_date,due_date,net_payable,vat_amount,status,paid_amount').eq('entity_id',entityId).eq('customer_id',selId).gte('issue_date',from).lte('issue_date',to).order('issue_date'),
      supabase.from('payment_receipts').select('*').eq('entity_id',entityId).eq('customer_id',selId).gte('receipt_date',from).lte('receipt_date',to).order('receipt_date'),
    ])
    setIpos(a.data||[]); setInvs(b.data||[]); setReceipts(c.data||[])
    setLoading(false)
  }

  const party = list.find(x=>x.id===selId)
  const totalPO       = ipos.reduce((s,p)=>s+(+p.total_value||0),0)
  const totalInvoiced = invs.reduce((s,i)=>s+(+i.net_payable||0),0)
  const totalReceived = receipts.reduce((s,r)=>s+(+r.amount||0),0)
  const outstanding   = totalInvoiced - totalReceived
  const hasData       = ipos.length>0||invs.length>0||receipts.length>0

  function doPrint() {
    if(!party) return
    openPrint(`Contractor Statement — ${party.contractor_name}`,`
      <div class="hdr"><div><div class="co">RATAL GROUP / ACCSYS</div><div class="meta">Contractor Statement | ${fmtD(from)} – ${fmtD(to)}</div><div class="meta">Printed: ${fmtD(today())}</div></div>
        <div style="text-align:right"><div class="co">${party.contractor_name}</div><div class="meta">Code: ${party.contractor_code||'—'}</div></div></div>
      <div class="krow">
        <div class="kcard"><div class="kl">PO Value</div><div class="kv">SAR ${fmt(totalPO)}</div></div>
        <div class="kcard"><div class="kl">Total Invoiced</div><div class="kv">SAR ${fmt(totalInvoiced)}</div></div>
        <div class="kcard"><div class="kl">Total Received</div><div class="kv">SAR ${fmt(totalReceived)}</div></div>
        <div class="kcard"><div class="kl">Outstanding</div><div class="kv">SAR ${fmt(outstanding)}</div></div>
      </div>
      <h3>INCOMING PURCHASE ORDERS</h3>
      <table><tr><th>PO Date</th><th>Our PO#</th><th>Client PO#</th><th>Project</th><th>Status</th><th class="r">Value (SAR)</th></tr>
      ${ipos.map(p=>`<tr><td>${fmtD(p.po_date)}</td><td><b>${p.po_number||'—'}</b></td><td>${p.contractor_po_number||'—'}</td><td>${p.projects?.project_number||'—'}</td><td>${p.status}</td><td class="r">${fmt(p.total_value)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="5">Total</td><td class="r">${fmt(totalPO)}</td></tr></table>
      <h3>INVOICES ISSUED</h3>
      <table><tr><th>Date</th><th>Invoice#</th><th>Due Date</th><th>Status</th><th class="r">Amount</th><th class="r">Paid</th><th class="r">Balance</th></tr>
      ${invs.map(i=>{const b=(+i.net_payable||0)-(+i.paid_amount||0);return`<tr><td>${fmtD(i.issue_date)}</td><td><b>${i.invoice_no}</b></td><td>${fmtD(i.due_date)}</td><td>${i.status}</td><td class="r">${fmt(i.net_payable)}</td><td class="r">${fmt(i.paid_amount||0)}</td><td class="r">${fmt(b)}</td></tr>`}).join('')}
      <tr class="tot"><td colspan="4">Totals</td><td class="r">${fmt(totalInvoiced)}</td><td class="r">${fmt(totalReceived)}</td><td class="r">${fmt(outstanding)}</td></tr></table>
      <h3>PAYMENTS RECEIVED</h3>
      <table><tr><th>Date</th><th>Receipt#</th><th>Reference</th><th>Method</th><th>Bank</th><th class="r">Amount (SAR)</th></tr>
      ${receipts.map(r=>`<tr><td>${fmtD(r.receipt_date)}</td><td><b>${r.receipt_number||'—'}</b></td><td>${r.reference||'—'}</td><td>${r.payment_method||'—'}</td><td>${r.bank_account||'—'}</td><td class="r">${fmt(r.amount)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="5">Total Received</td><td class="r">${fmt(totalReceived)}</td></tr></table>`)
  }

  return (
    <div>
      <FiltersBar onGenerate={generate} loading={loading} hasData={hasData} onPrint={doPrint}>
        <div><label style={S.lbl}>Contractor / Customer</label>
          <select value={selId} onChange={e=>setSelId(e.target.value)} style={S.sel}>
            <option value="">— Select Contractor —</option>
            {list.map(c=><option key={c.id} value={c.id}>{c.contractor_name}</option>)}
          </select></div>
        <div><label style={S.lbl}>From</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={S.inp}/></div>
        <div><label style={S.lbl}>To</label><input type="date" value={to} onChange={e=>setTo(e.target.value)} style={S.inp}/></div>
      </FiltersBar>

      {!selId ? <Empty msg="Select a contractor to generate their statement"/> :
       (!hasData&&!loading) ? <Empty msg="No records found in the selected period"/> : hasData ? (
        <>
          <KPIs items={[
            {label:'PO Value',      val:totalPO,       color:'#1565C0'},
            {label:'Total Invoiced',val:totalInvoiced, color:L3},
            {label:'Total Received',val:totalReceived, color:'#2e7d32'},
            {label:'Outstanding',   val:outstanding,   color:outstanding>0?'#c62828':'#2e7d32'},
            {label:'Receipts',      val:receipts.length,noFmt:true,color:'#546e7a'},
          ]}/>
          <div style={{...S.card,padding:0,overflow:'hidden',marginBottom:10}}>
            <SecHead color='#1565C0' title='📋 Incoming Purchase Orders'/>
            <StmtTable
              headers={[{label:'PO Date'},{label:'Our PO#'},{label:'Client PO#'},{label:'Project'},{label:'Status'},{label:'Value (SAR)',r:true}]}
              rows={ipos.map(p=>[fmtD(p.po_date),{v:p.po_number||'—',s:{fontWeight:700,color:'#1565C0'}},p.contractor_po_number||'—',p.projects?.project_number||'—',
                {v:p.status,s:{fontSize:10,color:p.status==='ACTIVE'?'#2e7d32':p.status==='CLOSED'?'#7444A3':'#546e7a'}},
                {v:fmt(p.total_value),s:{fontFamily:'monospace',fontWeight:600}},
              ])}
              footer={['','','','','Total',fmt(totalPO)]}
            />
          </div>
          <div style={{...S.card,padding:0,overflow:'hidden',marginBottom:10}}>
            <SecHead color={L3} title='🧾 Invoices Issued'/>
            <StmtTable
              headers={[{label:'Date'},{label:'Invoice#'},{label:'Due Date'},{label:'Status'},{label:'Amount (SAR)',r:true},{label:'Paid (SAR)',r:true},{label:'Balance (SAR)',r:true}]}
              rows={invs.map(i=>{const b=(+i.net_payable||0)-(+i.paid_amount||0);return[
                fmtD(i.issue_date),{v:i.invoice_no,s:{fontWeight:700,color:L3}},fmtD(i.due_date),
                {v:i.status,s:{fontSize:10,color:i.status==='PAID'?'#2e7d32':i.status==='OVERDUE'?'#c62828':'#1565C0'}},
                {v:fmt(i.net_payable),s:{fontFamily:'monospace'}},
                {v:fmt(i.paid_amount||0),s:{fontFamily:'monospace',color:'#2e7d32'}},
                {v:fmt(b),s:{fontFamily:'monospace',fontWeight:700,color:b>0?'#c62828':'#2e7d32'}},
              ]})}
              footer={['','','','Totals',fmt(totalInvoiced),fmt(totalReceived),fmt(outstanding)]}
            />
          </div>
          <div style={{...S.card,padding:0,overflow:'hidden'}}>
            <SecHead color='#2e7d32' title='💳 Payments Received'/>
            <StmtTable
              headers={[{label:'Date'},{label:'Receipt#'},{label:'Reference'},{label:'Method'},{label:'Bank'},{label:'Amount (SAR)',r:true}]}
              rows={receipts.map(r=>[fmtD(r.receipt_date),{v:r.receipt_number||'—',s:{fontWeight:700,color:'#2e7d32'}},r.reference||'—',r.payment_method||'—',r.bank_account||'—',{v:fmt(r.amount),s:{fontFamily:'monospace',fontWeight:600}}])}
              footer={['','','','','Total Received',fmt(totalReceived)]}
            />
          </div>
        </>
      ):null}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// TAB 2 — SUB-CONTRACTOR STATEMENT
// ═══════════════════════════════════════════════════════════════════
function SubConStatement({ entityId }) {
  const [list,    setList]    = useState([])
  const [selId,   setSelId]   = useState('')
  const [from,    setFrom]    = useState(yearStart())
  const [to,      setTo]      = useState(today())
  const [opos,    setOpos]    = useState([])
  const [claims,  setClaims]  = useState([])
  const [pmtLines,setPmtLines]= useState([])
  const [loading, setLoading] = useState(false)

  useEffect(()=>{
    supabase.from('contractors').select('id,contractor_name,contractor_code').eq('entity_id',entityId).eq('status','ACTIVE').in('vendor_type',['SUB_CONTRACTOR']).order('contractor_name').then(({data})=>setList(data||[]))
  },[entityId])

  async function generate() {
    if(!selId) return
    setLoading(true)
    const [a,b,{lines}] = await Promise.all([
      supabase.from('outgoing_pos').select('id,po_number,po_date,total_value,status,departments(dept_code),projects(project_number)').eq('entity_id',entityId).eq('supplier_id',selId).gte('po_date',from).lte('po_date',to).order('po_date'),
      supabase.from('subcon_claims').select('id,claim_number,claim_month,claim_year,claim_amount,vat_pct,status,submitted_at').eq('entity_id',entityId).eq('contractor_id',selId).gte('submitted_at',from).lte('submitted_at',to).order('submitted_at',{ascending:false}),
      fetchPaymentLines({entityId,from,to,partyId:selId}),
    ])
    setOpos(a.data||[]); setClaims(b.data||[]); setPmtLines(lines)
    setLoading(false)
  }

  const party = list.find(x=>x.id===selId)
  const totalPO      = opos.reduce((s,p)=>s+(+p.total_value||0),0)
  const totalClaimed = claims.reduce((s,c)=>s+(+c.claim_amount||0),0)
  const totalPaid    = pmtLines.reduce((s,l)=>s+(+l.amount||0),0)
  const balance      = totalClaimed - totalPaid
  const hasData      = opos.length>0||claims.length>0||pmtLines.length>0

  function doPrint() {
    if(!party) return
    openPrint(`Sub-Contractor Statement — ${party.contractor_name}`,`
      <div class="hdr"><div><div class="co">RATAL GROUP / ACCSYS</div><div class="meta">Sub-Contractor Statement | ${fmtD(from)} – ${fmtD(to)}</div></div>
        <div style="text-align:right"><div class="co">${party.contractor_name}</div><div class="meta">Code: ${party.contractor_code||'—'}</div></div></div>
      <div class="krow">
        <div class="kcard"><div class="kl">PO Value</div><div class="kv">SAR ${fmt(totalPO)}</div></div>
        <div class="kcard"><div class="kl">Total Claimed</div><div class="kv">SAR ${fmt(totalClaimed)}</div></div>
        <div class="kcard"><div class="kl">Total Paid</div><div class="kv">SAR ${fmt(totalPaid)}</div></div>
        <div class="kcard"><div class="kl">Balance Due</div><div class="kv">SAR ${fmt(balance)}</div></div>
      </div>
      <h3>PURCHASE ORDERS ISSUED</h3>
      <table><tr><th>Date</th><th>PO#</th><th>Department</th><th>Project</th><th>Status</th><th class="r">Value (SAR)</th></tr>
      ${opos.map(p=>`<tr><td>${fmtD(p.po_date)}</td><td><b>${p.po_number||'—'}</b></td><td>${p.departments?.dept_code||'—'}</td><td>${p.projects?.project_number||'—'}</td><td>${p.status}</td><td class="r">${fmt(p.total_value)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="5">Total PO Value</td><td class="r">${fmt(totalPO)}</td></tr></table>
      <h3>CLAIMS / INVOICES SUBMITTED</h3>
      <table><tr><th>Date</th><th>Claim#</th><th>Period</th><th>Status</th><th class="r">Amount (SAR)</th></tr>
      ${claims.map(c=>`<tr><td>${fmtD(c.submitted_at)}</td><td><b>${c.claim_number||'—'}</b></td><td>${c.claim_month||''}/${c.claim_year||''}</td><td>${c.status}</td><td class="r">${fmt(c.claim_amount)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="4">Total Claimed</td><td class="r">${fmt(totalClaimed)}</td></tr></table>
      <h3>PAYMENTS MADE</h3>
      <table><tr><th>Date</th><th>MR#</th><th>Bank Ref</th><th>Bank</th><th>Department</th><th class="r">Amount (SAR)</th></tr>
      ${pmtLines.map(l=>`<tr><td>${fmtD(l.payDate)}</td><td>${l.mrNumber}</td><td><b>${l.reference}</b></td><td>${l.bank}</td><td>${l.mr?.departments?.dept_code||'—'}</td><td class="r">${fmt(l.amount)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="5">Total Paid</td><td class="r">${fmt(totalPaid)}</td></tr></table>`)
  }

  return (
    <div>
      <FiltersBar onGenerate={generate} loading={loading} hasData={hasData} onPrint={doPrint}>
        <div><label style={S.lbl}>Sub-Contractor</label>
          <select value={selId} onChange={e=>setSelId(e.target.value)} style={S.sel}>
            <option value="">— Select Sub-Contractor —</option>
            {list.map(c=><option key={c.id} value={c.id}>{c.contractor_name}</option>)}
          </select></div>
        <div><label style={S.lbl}>From</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={S.inp}/></div>
        <div><label style={S.lbl}>To</label><input type="date" value={to} onChange={e=>setTo(e.target.value)} style={S.inp}/></div>
      </FiltersBar>

      {!selId ? <Empty msg="Select a sub-contractor to generate their statement"/> :
       (!hasData&&!loading) ? <Empty msg="No records found in the selected period"/> : hasData ? (
        <>
          <KPIs items={[
            {label:'Total PO Value', val:totalPO,      color:'#1565C0'},
            {label:'Total Claimed',  val:totalClaimed, color:'#e65100'},
            {label:'Total Paid',     val:totalPaid,    color:'#2e7d32'},
            {label:'Balance Due',    val:balance,      color:balance>0?'#c62828':'#2e7d32'},
            {label:'POs Issued',     val:opos.length,  noFmt:true,color:'#546e7a'},
          ]}/>
          <div style={{...S.card,padding:0,overflow:'hidden',marginBottom:10}}>
            <SecHead color='#1565C0' title='📋 Purchase Orders Issued'/>
            <StmtTable
              headers={[{label:'Date'},{label:'PO#'},{label:'Department'},{label:'Project'},{label:'Status'},{label:'Value (SAR)',r:true}]}
              rows={opos.map(p=>[fmtD(p.po_date),{v:p.po_number||'—',s:{fontWeight:700,color:'#1565C0'}},p.departments?.dept_code||'—',p.projects?.project_number||'—',
                {v:p.status,s:{fontSize:10}},{v:fmt(p.total_value),s:{fontFamily:'monospace',fontWeight:600}},
              ])}
              footer={['','','','','Total',fmt(totalPO)]}
            />
          </div>
          <div style={{...S.card,padding:0,overflow:'hidden',marginBottom:10}}>
            <SecHead color='#e65100' title='📄 Claims / Invoices Submitted'/>
            <StmtTable
              headers={[{label:'Date'},{label:'Claim#'},{label:'Period'},{label:'Status'},{label:'Amount (SAR)',r:true}]}
              rows={claims.map(c=>[fmtD(c.submitted_at),{v:c.claim_number||'—',s:{fontWeight:700,color:'#e65100'}},
                `${c.claim_month||''}/${c.claim_year||''}`,
                {v:c.status,s:{fontSize:10,color:c.status==='APPROVED'?'#2e7d32':c.status==='REJECTED'?'#c62828':'#546e7a'}},
                {v:fmt(c.claim_amount),s:{fontFamily:'monospace',fontWeight:600}},
              ])}
              footer={['','','','Total Claimed',fmt(totalClaimed)]}
            />
          </div>
          <div style={{...S.card,padding:0,overflow:'hidden'}}>
            <SecHead color='#2e7d32' title='💳 Payments Made'/>
            <StmtTable
              headers={[{label:'Date'},{label:'MR#'},{label:'Reference'},{label:'Bank'},{label:'Purpose'},{label:'Amount (SAR)',r:true}]}
              rows={pmtLines.map(l=>[fmtD(l.payDate),l.mrNumber,{v:l.reference,s:{fontWeight:700,color:'#2e7d32'}},l.bank,l.expense_type||l.payment_type||'—',{v:fmt(l.amount),s:{fontFamily:'monospace',fontWeight:600}}])}
              footer={['','','','','Total Paid',fmt(totalPaid)]}
            />
          </div>
        </>
      ):null}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// TAB 3 — SUPPLIER STATEMENT
// ═══════════════════════════════════════════════════════════════════
function SupplierStatement({ entityId }) {
  const [list,     setList]     = useState([])
  const [selId,    setSelId]    = useState('')
  const [from,     setFrom]     = useState(yearStart())
  const [to,       setTo]       = useState(today())
  const [opos,     setOpos]     = useState([])
  const [pmtLines, setPmtLines] = useState([])
  const [loading,  setLoading]  = useState(false)

  useEffect(()=>{
    supabase.from('contractors').select('id,contractor_name,contractor_code,vendor_type').eq('entity_id',entityId).eq('status','ACTIVE').in('vendor_type',['SUPPLIER','VENDOR','LOCAL_SUPPLIER','EQUIPMENT_RENTAL']).order('contractor_name').then(({data})=>setList(data||[]))
  },[entityId])

  async function generate() {
    if(!selId) return
    setLoading(true)
    const [a,{lines}] = await Promise.all([
      supabase.from('outgoing_pos').select('id,po_number,po_date,total_value,status,departments(dept_code),projects(project_number),category').eq('entity_id',entityId).eq('supplier_id',selId).gte('po_date',from).lte('po_date',to).order('po_date'),
      fetchPaymentLines({entityId,from,to,partyId:selId}),
    ])
    setOpos(a.data||[]); setPmtLines(lines)
    setLoading(false)
  }

  const party = list.find(x=>x.id===selId)
  const totalPO   = opos.reduce((s,p)=>s+(+p.total_value||0),0)
  const totalPaid = pmtLines.reduce((s,l)=>s+(+l.amount||0),0)
  const outstanding = totalPO - totalPaid
  const hasData = opos.length>0||pmtLines.length>0

  function doPrint() {
    if(!party) return
    openPrint(`Supplier Statement — ${party.contractor_name}`,`
      <div class="hdr"><div><div class="co">RATAL GROUP / ACCSYS</div><div class="meta">Supplier Statement | ${fmtD(from)} – ${fmtD(to)}</div></div>
        <div style="text-align:right"><div class="co">${party.contractor_name}</div><div class="meta">${party.vendor_type} | Code: ${party.contractor_code||'—'}</div></div></div>
      <div class="krow">
        <div class="kcard"><div class="kl">Total PO Value</div><div class="kv">SAR ${fmt(totalPO)}</div></div>
        <div class="kcard"><div class="kl">Total Paid</div><div class="kv">SAR ${fmt(totalPaid)}</div></div>
        <div class="kcard"><div class="kl">Outstanding</div><div class="kv">SAR ${fmt(outstanding)}</div></div>
        <div class="kcard"><div class="kl">POs Issued</div><div class="kv">${opos.length}</div></div>
      </div>
      <h3>PURCHASE ORDERS ISSUED</h3>
      <table><tr><th>Date</th><th>PO#</th><th>Category</th><th>Department</th><th>Project</th><th>Status</th><th class="r">Value (SAR)</th></tr>
      ${opos.map(p=>`<tr><td>${fmtD(p.po_date)}</td><td><b>${p.po_number||'—'}</b></td><td>${p.category||'—'}</td><td>${p.departments?.dept_code||'—'}</td><td>${p.projects?.project_number||'—'}</td><td>${p.status}</td><td class="r">${fmt(p.total_value)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="6">Total PO Value</td><td class="r">${fmt(totalPO)}</td></tr></table>
      <h3>PAYMENTS MADE</h3>
      <table><tr><th>Date</th><th>MR#</th><th>Reference</th><th>Bank</th><th>Purpose</th><th class="r">Amount (SAR)</th></tr>
      ${pmtLines.map(l=>`<tr><td>${fmtD(l.payDate)}</td><td>${l.mrNumber}</td><td><b>${l.reference}</b></td><td>${l.bank}</td><td>${l.expense_type||l.payment_type||'—'}</td><td class="r">${fmt(l.amount)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="5">Total Paid</td><td class="r">${fmt(totalPaid)}</td></tr></table>`)
  }

  return (
    <div>
      <FiltersBar onGenerate={generate} loading={loading} hasData={hasData} onPrint={doPrint}>
        <div><label style={S.lbl}>Supplier / Vendor</label>
          <select value={selId} onChange={e=>setSelId(e.target.value)} style={S.sel}>
            <option value="">— Select Supplier —</option>
            {list.map(c=><option key={c.id} value={c.id}>{c.contractor_name} ({c.vendor_type})</option>)}
          </select></div>
        <div><label style={S.lbl}>From</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={S.inp}/></div>
        <div><label style={S.lbl}>To</label><input type="date" value={to} onChange={e=>setTo(e.target.value)} style={S.inp}/></div>
      </FiltersBar>

      {!selId ? <Empty msg="Select a supplier to generate their statement"/> :
       (!hasData&&!loading) ? <Empty msg="No records found in the selected period"/> : hasData ? (
        <>
          <KPIs items={[
            {label:'Total PO Value',  val:totalPO,       color:'#1565C0'},
            {label:'Total Paid',      val:totalPaid,     color:'#2e7d32'},
            {label:'Outstanding',     val:outstanding,   color:outstanding>0?'#c62828':'#2e7d32'},
            {label:'POs Issued',      val:opos.length,   noFmt:true,color:'#546e7a'},
            {label:'Payment Entries', val:pmtLines.length,noFmt:true,color:L3},
          ]}/>
          <div style={{...S.card,padding:0,overflow:'hidden',marginBottom:10}}>
            <SecHead color='#1565C0' title='📋 Purchase Orders Issued'/>
            <StmtTable
              headers={[{label:'Date'},{label:'PO#'},{label:'Category'},{label:'Dept'},{label:'Project'},{label:'Status'},{label:'Value (SAR)',r:true}]}
              rows={opos.map(p=>[fmtD(p.po_date),{v:p.po_number||'—',s:{fontWeight:700,color:'#1565C0'}},p.category||'—',p.departments?.dept_code||'—',p.projects?.project_number||'—',
                {v:p.status,s:{fontSize:10}},{v:fmt(p.total_value),s:{fontFamily:'monospace',fontWeight:600}},
              ])}
              footer={['','','','','','Total',fmt(totalPO)]}
            />
          </div>
          <div style={{...S.card,padding:0,overflow:'hidden'}}>
            <SecHead color='#2e7d32' title='💳 Payments Made'/>
            <StmtTable
              headers={[{label:'Date'},{label:'MR#'},{label:'Reference'},{label:'Bank'},{label:'Purpose'},{label:'Amount (SAR)',r:true}]}
              rows={pmtLines.map(l=>[fmtD(l.payDate),l.mrNumber,{v:l.reference,s:{fontWeight:700,color:'#2e7d32'}},l.bank,l.expense_type||l.payment_type||'—',{v:fmt(l.amount),s:{fontFamily:'monospace',fontWeight:600}}])}
              footer={['','','','','Total Paid',fmt(totalPaid)]}
            />
          </div>
        </>
      ):null}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// TAB 4 — EMPLOYEE STATEMENT
// ═══════════════════════════════════════════════════════════════════
function EmployeeStatement({ entityId }) {
  const [list,     setList]     = useState([])
  const [selId,    setSelId]    = useState('')
  const [from,     setFrom]     = useState(yearStart())
  const [to,       setTo]       = useState(today())
  const [pmtLines, setPmtLines] = useState([])
  const [expClaims,setExpClaims]= useState([])
  const [loading,  setLoading]  = useState(false)

  useEffect(()=>{
    supabase.from('employees').select('id,full_name_en,employee_number,departments(dept_code)').eq('entity_id',entityId).eq('is_active',true).order('full_name_en').then(({data})=>setList(data||[]))
  },[entityId])

  async function generate() {
    if(!selId) return
    setLoading(true)
    const [{lines}, b] = await Promise.all([
      fetchPaymentLines({entityId,from,to,partyId:selId}),
      supabase.from('expense_claims').select('id,claim_number,period,submitted_at,total_amount,status').eq('entity_id',entityId).eq('employee_id',selId).gte('submitted_at',from).lte('submitted_at',to).order('submitted_at',{ascending:false}),
    ])
    setPmtLines(lines); setExpClaims(b.data||[])
    setLoading(false)
  }

  const emp = list.find(x=>x.id===selId)
  const totalPaid    = pmtLines.reduce((s,l)=>s+(+l.amount||0),0)
  const totalClaimed = expClaims.reduce((s,c)=>s+(+c.total_amount||0),0)
  const hasData = pmtLines.length>0||expClaims.length>0

  function doPrint() {
    if(!emp) return
    openPrint(`Employee Statement — ${emp.full_name_en}`,`
      <div class="hdr"><div><div class="co">RATAL GROUP / ACCSYS</div><div class="meta">Employee Statement | ${fmtD(from)} – ${fmtD(to)}</div></div>
        <div style="text-align:right"><div class="co">${emp.full_name_en}</div><div class="meta">Emp#: ${emp.employee_number||'—'} | Dept: ${emp.departments?.dept_code||'—'}</div></div></div>
      <div class="krow">
        <div class="kcard"><div class="kl">Total Payments</div><div class="kv">SAR ${fmt(totalPaid)}</div></div>
        <div class="kcard"><div class="kl">Expense Claims</div><div class="kv">SAR ${fmt(totalClaimed)}</div></div>
        <div class="kcard"><div class="kl">Payment Entries</div><div class="kv">${pmtLines.length}</div></div>
        <div class="kcard"><div class="kl">Claims Submitted</div><div class="kv">${expClaims.length}</div></div>
      </div>
      <h3>PAYMENTS RECEIVED</h3>
      <table><tr><th>Date</th><th>MR#</th><th>Reference</th><th>Bank</th><th>Purpose</th><th class="r">Amount (SAR)</th></tr>
      ${pmtLines.map(l=>`<tr><td>${fmtD(l.payDate)}</td><td>${l.mrNumber}</td><td><b>${l.reference}</b></td><td>${l.bank}</td><td>${l.expense_type||l.payment_type||'—'}</td><td class="r">${fmt(l.amount)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="5">Total</td><td class="r">${fmt(totalPaid)}</td></tr></table>
      <h3>EXPENSE CLAIMS SUBMITTED</h3>
      <table><tr><th>Date</th><th>Claim#</th><th>Period</th><th>Status</th><th class="r">Amount (SAR)</th></tr>
      ${expClaims.map(c=>`<tr><td>${fmtD(c.submitted_at)}</td><td><b>${c.claim_number||'—'}</b></td><td>${c.period||'—'}</td><td>${c.status}</td><td class="r">${fmt(c.total_amount)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="4">Total Claimed</td><td class="r">${fmt(totalClaimed)}</td></tr></table>`)
  }

  return (
    <div>
      <FiltersBar onGenerate={generate} loading={loading} hasData={hasData} onPrint={doPrint}>
        <div><label style={S.lbl}>Employee</label>
          <select value={selId} onChange={e=>setSelId(e.target.value)} style={S.sel}>
            <option value="">— Select Employee —</option>
            {list.map(e=><option key={e.id} value={e.id}>{e.full_name_en} {e.departments?.dept_code?`(${e.departments.dept_code})`:''}</option>)}
          </select></div>
        <div><label style={S.lbl}>From</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={S.inp}/></div>
        <div><label style={S.lbl}>To</label><input type="date" value={to} onChange={e=>setTo(e.target.value)} style={S.inp}/></div>
      </FiltersBar>

      {!selId ? <Empty msg="Select an employee to generate their statement"/> :
       (!hasData&&!loading) ? <Empty msg="No records found in the selected period"/> : hasData ? (
        <>
          <KPIs items={[
            {label:'Total Payments',   val:totalPaid,         color:'#2e7d32'},
            {label:'Total Claimed',    val:totalClaimed,      color:'#e65100'},
            {label:'Payment Entries',  val:pmtLines.length,   noFmt:true,color:L3},
            {label:'Claims Submitted', val:expClaims.length,  noFmt:true,color:'#546e7a'},
          ]}/>
          <div style={{...S.card,padding:0,overflow:'hidden',marginBottom:10}}>
            <SecHead color='#2e7d32' title='💳 Payments Received'/>
            <StmtTable
              headers={[{label:'Date'},{label:'MR#'},{label:'Reference'},{label:'Bank'},{label:'Purpose'},{label:'Amount (SAR)',r:true}]}
              rows={pmtLines.map(l=>[fmtD(l.payDate),l.mrNumber,{v:l.reference,s:{fontWeight:700,color:'#2e7d32'}},l.bank,l.expense_type||l.payment_type||'—',{v:fmt(l.amount),s:{fontFamily:'monospace',fontWeight:600}}])}
              footer={['','','','','Total',fmt(totalPaid)]}
            />
          </div>
          <div style={{...S.card,padding:0,overflow:'hidden'}}>
            <SecHead color='#e65100' title='🧾 Expense Claims Submitted'/>
            <StmtTable
              headers={[{label:'Date'},{label:'Claim#'},{label:'Period'},{label:'Status'},{label:'Amount (SAR)',r:true}]}
              rows={expClaims.map(c=>[fmtD(c.submitted_at),{v:c.claim_number||'—',s:{fontWeight:700,color:'#e65100'}},c.period||'—',
                {v:c.status,s:{fontSize:10,color:c.status==='APPROVED'||c.status==='PAID'?'#2e7d32':'#546e7a'}},
                {v:fmt(c.total_amount),s:{fontFamily:'monospace',fontWeight:600}},
              ])}
              footer={['','','','Total Claimed',fmt(totalClaimed)]}
            />
          </div>
        </>
      ):null}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// TAB 5 — DEPARTMENT STATEMENT
// ═══════════════════════════════════════════════════════════════════
function DepartmentStatement({ entityId }) {
  const [depts,   setDepts]   = useState([])
  const [selId,   setSelId]   = useState('')
  const [from,    setFrom]    = useState(yearStart())
  const [to,      setTo]      = useState(today())
  const [lines,   setLines]   = useState([])
  const [claims,  setClaims]  = useState([])
  const [emps,    setEmps]    = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(()=>{
    supabase.from('departments').select('id,dept_code,dept_name').eq('entity_id',entityId).eq('is_active',true).order('dept_code').then(({data})=>setDepts(data||[]))
    supabase.from('employees').select('id,full_name_en,department_id').eq('entity_id',entityId).eq('is_active',true).then(({data})=>setEmps(data||[]))
  },[entityId])

  async function generate() {
    if(!selId) return
    setLoading(true)
    const deptEmpIds = emps.filter(e=>e.department_id===selId).map(e=>e.id)
    const [{lines:fetchedLines}, b] = await Promise.all([
      fetchPaymentLines({entityId,from,to,deptId:selId}),
      deptEmpIds.length
        ? supabase.from('expense_claims').select('id,employee_id,claim_number,period,submitted_at,total_amount,status').eq('entity_id',entityId).in('employee_id',deptEmpIds).gte('submitted_at',from).lte('submitted_at',to).order('submitted_at',{ascending:false})
        : Promise.resolve({data:[]}),
    ])
    setLines(fetchedLines); setClaims(b.data||[])
    setLoading(false)
  }

  const dept = depts.find(d=>d.id===selId)
  const empMap = Object.fromEntries(emps.map(e=>[e.id,e.full_name_en]))

  // Group lines by party_type
  const empLines  = lines.filter(l=>l.party_type==='EMPLOYEE')
  const suppLines = lines.filter(l=>['VENDOR','Supplier','Local-Supplier'].includes(l.party_type))
  const subLines  = lines.filter(l=>['SUBCON','Sub-Contractor'].includes(l.party_type))
  const otherLines= lines.filter(l=>!['EMPLOYEE','VENDOR','Supplier','Local-Supplier','SUBCON','Sub-Contractor'].includes(l.party_type))

  const totalEmp   = empLines.reduce((s,l)=>s+(+l.amount||0),0)
  const totalSupp  = suppLines.reduce((s,l)=>s+(+l.amount||0),0)
  const totalSub   = subLines.reduce((s,l)=>s+(+l.amount||0),0)
  const totalOther = otherLines.reduce((s,l)=>s+(+l.amount||0),0)
  const totalClaims= claims.reduce((s,c)=>s+(+c.total_amount||0),0)
  const grandTotal = totalEmp+totalSupp+totalSub+totalOther
  const hasData = lines.length>0||claims.length>0

  function doPrint() {
    if(!dept) return
    const tableFor = (rows, caption) => `
      <h3>${caption}</h3>
      <table><tr><th>Date</th><th>Name</th><th>MR#</th><th>Reference</th><th>Bank</th><th>Purpose</th><th class="r">Amount (SAR)</th></tr>
      ${rows.map(l=>`<tr><td>${fmtD(l.payDate)}</td><td>${l.party_name||empMap[l.party_id]||'—'}</td><td>${l.mrNumber}</td><td><b>${l.reference}</b></td><td>${l.bank}</td><td>${l.expense_type||l.payment_type||'—'}</td><td class="r">${fmt(l.amount)}</td></tr>`).join('')||'<tr><td colspan="7" style="color:#999;text-align:center">No entries</td></tr>'}
      <tr class="tot"><td colspan="6">Subtotal</td><td class="r">${fmt(rows.reduce((s,l)=>s+(+l.amount||0),0))}</td></tr></table>`
    openPrint(`Department Statement — ${dept.dept_code}`,`
      <div class="hdr"><div><div class="co">RATAL GROUP / ACCSYS</div><div class="meta">Department Statement | ${fmtD(from)} – ${fmtD(to)}</div></div>
        <div style="text-align:right"><div class="co">${dept.dept_code} — ${dept.dept_name}</div></div></div>
      <div class="krow">
        <div class="kcard"><div class="kl">Employee Payments</div><div class="kv">SAR ${fmt(totalEmp)}</div></div>
        <div class="kcard"><div class="kl">Supplier Payments</div><div class="kv">SAR ${fmt(totalSupp)}</div></div>
        <div class="kcard"><div class="kl">Sub-Con Payments</div><div class="kv">SAR ${fmt(totalSub)}</div></div>
        <div class="kcard"><div class="kl">Expense Claims</div><div class="kv">SAR ${fmt(totalClaims)}</div></div>
        <div class="kcard"><div class="kl">Grand Total</div><div class="kv">SAR ${fmt(grandTotal+totalClaims)}</div></div>
      </div>
      ${tableFor(empLines,'EMPLOYEE PAYMENTS')}
      ${tableFor(suppLines,'SUPPLIER / VENDOR PAYMENTS')}
      ${tableFor(subLines,'SUB-CONTRACTOR PAYMENTS')}
      ${otherLines.length?tableFor(otherLines,'OTHER PAYMENTS'):''}
      <h3>EXPENSE CLAIMS</h3>
      <table><tr><th>Date</th><th>Employee</th><th>Claim#</th><th>Period</th><th>Status</th><th class="r">Amount (SAR)</th></tr>
      ${claims.map(c=>`<tr><td>${fmtD(c.submitted_at)}</td><td>${empMap[c.employee_id]||'—'}</td><td><b>${c.claim_number||'—'}</b></td><td>${c.period||'—'}</td><td>${c.status}</td><td class="r">${fmt(c.total_amount)}</td></tr>`).join('')||'<tr><td colspan="6" style="color:#999;text-align:center">No claims</td></tr>'}
      <tr class="tot"><td colspan="5">Total Claims</td><td class="r">${fmt(totalClaims)}</td></tr></table>`)
  }

  const SectionTable = ({rows,color,title,extra=[]}) => rows.length===0?null:(
    <div style={{...S.card,padding:0,overflow:'hidden',marginBottom:10}}>
      <SecHead color={color} title={title}/>
      <StmtTable
        headers={[{label:'Date'},{label:'Name'},{label:'MR#'},{label:'Reference'},{label:'Bank'},...extra,{label:'Amount (SAR)',r:true}]}
        rows={rows.map(l=>[fmtD(l.payDate),l.party_name||empMap[l.party_id]||'—',l.mrNumber,{v:l.reference,s:{fontWeight:700,color}},l.bank,...extra.map(()=>l.expense_type||'—'),{v:fmt(l.amount),s:{fontFamily:'monospace',fontWeight:600}}])}
        footer={['','','','','Subtotal',...extra.map(()=>''),fmt(rows.reduce((s,l)=>s+(+l.amount||0),0))]}
      />
    </div>
  )

  return (
    <div>
      <FiltersBar onGenerate={generate} loading={loading} hasData={hasData} onPrint={doPrint}>
        <div><label style={S.lbl}>Department</label>
          <select value={selId} onChange={e=>setSelId(e.target.value)} style={S.sel}>
            <option value="">— Select Department —</option>
            {depts.map(d=><option key={d.id} value={d.id}>{d.dept_code} — {d.dept_name}</option>)}
          </select></div>
        <div><label style={S.lbl}>From</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={S.inp}/></div>
        <div><label style={S.lbl}>To</label><input type="date" value={to} onChange={e=>setTo(e.target.value)} style={S.inp}/></div>
      </FiltersBar>

      {!selId ? <Empty msg="Select a department to generate their statement"/> :
       (!hasData&&!loading) ? <Empty msg="No records found in the selected period"/> : hasData ? (
        <>
          <KPIs items={[
            {label:'Employee Payments',val:totalEmp,    color:'#2e7d32'},
            {label:'Supplier Payments',val:totalSupp,   color:'#1565C0'},
            {label:'Sub-Con Payments', val:totalSub,    color:'#e65100'},
            {label:'Expense Claims',   val:totalClaims, color:L3},
            {label:'Grand Total',      val:grandTotal+totalClaims,color:'#1a2e3d'},
          ]}/>
          <SectionTable rows={empLines}  color='#2e7d32' title='👤 Employee Payments'/>
          <SectionTable rows={suppLines} color='#1565C0' title='🏭 Supplier / Vendor Payments'/>
          <SectionTable rows={subLines}  color='#e65100' title='🔧 Sub-Contractor Payments'/>
          {otherLines.length>0&&<SectionTable rows={otherLines} color='#546e7a' title='📦 Other Payments'/>}
          {claims.length>0&&(
            <div style={{...S.card,padding:0,overflow:'hidden'}}>
              <SecHead color={L3} title='🧾 Expense Claims'/>
              <StmtTable
                headers={[{label:'Date'},{label:'Employee'},{label:'Claim#'},{label:'Period'},{label:'Status'},{label:'Amount (SAR)',r:true}]}
                rows={claims.map(c=>[fmtD(c.submitted_at),empMap[c.employee_id]||'—',{v:c.claim_number||'—',s:{fontWeight:700,color:L3}},c.period||'—',
                  {v:c.status,s:{fontSize:10,color:c.status==='PAID'?'#2e7d32':'#546e7a'}},
                  {v:fmt(c.total_amount),s:{fontFamily:'monospace',fontWeight:600}},
                ])}
                footer={['','','','','Total Claims',fmt(totalClaims)]}
              />
            </div>
          )}
        </>
      ):null}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// TAB 6 — PROJECT STATEMENT
// ═══════════════════════════════════════════════════════════════════
function ProjectStatement({ entityId }) {
  const [projects, setProjects] = useState([])
  const [selId,    setSelId]    = useState('')
  const [from,     setFrom]     = useState(yearStart())
  const [to,       setTo]       = useState(today())
  const [opos,     setOpos]     = useState([])
  const [pmtLines, setPmtLines] = useState([])
  const [expRecs,  setExpRecs]  = useState([])
  const [loading,  setLoading]  = useState(false)

  useEffect(()=>{
    supabase.from('projects').select('id,project_number,project_name,budget,status').eq('entity_id',entityId).order('project_number').then(({data})=>setProjects(data||[]))
  },[entityId])

  async function generate() {
    if(!selId) return
    setLoading(true)
    const [a,{lines},c] = await Promise.all([
      supabase.from('outgoing_pos').select('id,po_number,po_date,total_value,status,category,contractors!supplier_id(contractor_name),departments(dept_code)').eq('entity_id',entityId).eq('project_id',selId).gte('po_date',from).lte('po_date',to).order('po_date'),
      fetchPaymentLines({entityId,from,to,projectId:selId}),
      supabase.from('expense_records').select('id,employee_id,expense_date,category,vendor_name,amount,status,employees(full_name_en)').eq('entity_id',entityId).eq('project_id',selId).gte('expense_date',from).lte('expense_date',to).order('expense_date'),
    ])
    setOpos(a.data||[]); setPmtLines(lines); setExpRecs(c.data||[])
    setLoading(false)
  }

  const proj = projects.find(p=>p.id===selId)
  const totalPO      = opos.reduce((s,p)=>s+(+p.total_value||0),0)
  const totalPayments= pmtLines.reduce((s,l)=>s+(+l.amount||0),0)
  const totalExpenses= expRecs.reduce((s,r)=>s+(+r.amount||0),0)
  const totalSpend   = totalPayments + totalExpenses
  const budget       = +(proj?.budget||0)
  const hasData = opos.length>0||pmtLines.length>0||expRecs.length>0

  function doPrint() {
    if(!proj) return
    openPrint(`Project Statement — ${proj.project_number}`,`
      <div class="hdr"><div><div class="co">RATAL GROUP / ACCSYS</div><div class="meta">Project Statement | ${fmtD(from)} – ${fmtD(to)}</div></div>
        <div style="text-align:right"><div class="co">${proj.project_number} — ${proj.project_name}</div><div class="meta">Status: ${proj.status||'—'}${budget?` | Budget: SAR ${fmt(budget)}`:''}</div></div></div>
      <div class="krow">
        <div class="kcard"><div class="kl">PO Committed</div><div class="kv">SAR ${fmt(totalPO)}</div></div>
        <div class="kcard"><div class="kl">Payments Made</div><div class="kv">SAR ${fmt(totalPayments)}</div></div>
        <div class="kcard"><div class="kl">Expense Records</div><div class="kv">SAR ${fmt(totalExpenses)}</div></div>
        <div class="kcard"><div class="kl">Total Spend</div><div class="kv">SAR ${fmt(totalSpend)}</div></div>
        ${budget?`<div class="kcard"><div class="kl">vs Budget</div><div class="kv">${((totalSpend/budget)*100).toFixed(1)}%</div></div>`:''}
      </div>
      <h3>PURCHASE ORDERS</h3>
      <table><tr><th>Date</th><th>PO#</th><th>Supplier/Sub-Con</th><th>Category</th><th>Dept</th><th>Status</th><th class="r">Value (SAR)</th></tr>
      ${opos.map(p=>`<tr><td>${fmtD(p.po_date)}</td><td><b>${p.po_number||'—'}</b></td><td>${p.contractors?.contractor_name||'—'}</td><td>${p.category||'—'}</td><td>${p.departments?.dept_code||'—'}</td><td>${p.status}</td><td class="r">${fmt(p.total_value)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="6">Total PO Value</td><td class="r">${fmt(totalPO)}</td></tr></table>
      <h3>PAYMENTS</h3>
      <table><tr><th>Date</th><th>Payee</th><th>Type</th><th>MR#</th><th>Reference</th><th>Bank</th><th class="r">Amount (SAR)</th></tr>
      ${pmtLines.map(l=>`<tr><td>${fmtD(l.payDate)}</td><td>${l.party_name||'—'}</td><td>${l.party_type||'—'}</td><td>${l.mrNumber}</td><td><b>${l.reference}</b></td><td>${l.bank}</td><td class="r">${fmt(l.amount)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="6">Total Payments</td><td class="r">${fmt(totalPayments)}</td></tr></table>
      <h3>EXPENSE RECORDS</h3>
      <table><tr><th>Date</th><th>Employee</th><th>Category</th><th>Vendor</th><th>Status</th><th class="r">Amount (SAR)</th></tr>
      ${expRecs.map(r=>`<tr><td>${fmtD(r.expense_date)}</td><td>${r.employees?.full_name_en||'—'}</td><td>${r.category||'—'}</td><td>${r.vendor_name||'—'}</td><td>${r.status}</td><td class="r">${fmt(r.amount)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="5">Total Expenses</td><td class="r">${fmt(totalExpenses)}</td></tr></table>`)
  }

  return (
    <div>
      <FiltersBar onGenerate={generate} loading={loading} hasData={hasData} onPrint={doPrint}>
        <div><label style={S.lbl}>Project</label>
          <select value={selId} onChange={e=>setSelId(e.target.value)} style={S.sel}>
            <option value="">— Select Project —</option>
            {projects.map(p=><option key={p.id} value={p.id}>{p.project_number} — {p.project_name}</option>)}
          </select></div>
        <div><label style={S.lbl}>From</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={S.inp}/></div>
        <div><label style={S.lbl}>To</label><input type="date" value={to} onChange={e=>setTo(e.target.value)} style={S.inp}/></div>
      </FiltersBar>

      {!selId ? <Empty msg="Select a project to generate its statement"/> :
       (!hasData&&!loading) ? <Empty msg="No records found in the selected period"/> : hasData ? (
        <>
          <KPIs items={[
            {label:'PO Committed',   val:totalPO,       color:'#1565C0'},
            {label:'Payments Made',  val:totalPayments, color:'#2e7d32'},
            {label:'Expense Records',val:totalExpenses, color:'#e65100'},
            {label:'Total Spend',    val:totalSpend,    color:'#c62828'},
            ...(budget?[{label:'Budget Utilised',val:`${((totalSpend/budget)*100).toFixed(1)}%`,noFmt:true,color:totalSpend>budget?'#c62828':L3}]:[]),
          ]}/>
          <div style={{...S.card,padding:0,overflow:'hidden',marginBottom:10}}>
            <SecHead color='#1565C0' title='📋 Purchase Orders'/>
            <StmtTable
              headers={[{label:'Date'},{label:'PO#'},{label:'Supplier / Sub-Con'},{label:'Category'},{label:'Dept'},{label:'Status'},{label:'Value (SAR)',r:true}]}
              rows={opos.map(p=>[fmtD(p.po_date),{v:p.po_number||'—',s:{fontWeight:700,color:'#1565C0'}},p.contractors?.contractor_name||'—',p.category||'—',p.departments?.dept_code||'—',
                {v:p.status,s:{fontSize:10}},{v:fmt(p.total_value),s:{fontFamily:'monospace',fontWeight:600}},
              ])}
              footer={['','','','','','Total',fmt(totalPO)]}
            />
          </div>
          <div style={{...S.card,padding:0,overflow:'hidden',marginBottom:10}}>
            <SecHead color='#2e7d32' title='💳 Payments'/>
            <StmtTable
              headers={[{label:'Date'},{label:'Payee'},{label:'Type'},{label:'MR#'},{label:'Reference'},{label:'Bank'},{label:'Amount (SAR)',r:true}]}
              rows={pmtLines.map(l=>[fmtD(l.payDate),l.party_name||'—',{v:l.party_type,s:{fontSize:10}},l.mrNumber,{v:l.reference,s:{fontWeight:700,color:'#2e7d32'}},l.bank,{v:fmt(l.amount),s:{fontFamily:'monospace',fontWeight:600}}])}
              footer={['','','','','','Total',fmt(totalPayments)]}
            />
          </div>
          <div style={{...S.card,padding:0,overflow:'hidden'}}>
            <SecHead color='#e65100' title='🧾 Expense Records'/>
            <StmtTable
              headers={[{label:'Date'},{label:'Employee'},{label:'Category'},{label:'Vendor'},{label:'Status'},{label:'Amount (SAR)',r:true}]}
              rows={expRecs.map(r=>[fmtD(r.expense_date),r.employees?.full_name_en||'—',r.category||'—',r.vendor_name||'—',
                {v:r.status,s:{fontSize:10,color:r.status==='APPROVED'?'#2e7d32':'#546e7a'}},
                {v:fmt(r.amount),s:{fontFamily:'monospace',fontWeight:600}},
              ])}
              footer={['','','','','Total',fmt(totalExpenses)]}
            />
          </div>
        </>
      ):null}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// MAIN EXPORT — 6-tab wrapper
// ═══════════════════════════════════════════════════════════════════
const TABS = [
  { key:'contractor', icon:'🏢', label:'Contractors'     },
  { key:'subcon',     icon:'🔧', label:'Sub-Contractors' },
  { key:'supplier',   icon:'🏭', label:'Suppliers'       },
  { key:'employee',   icon:'👤', label:'Employees'       },
  { key:'department', icon:'🗂', label:'Department'      },
  { key:'project',    icon:'📐', label:'Project'         },
]

export default function Statements({ entityId, role }) {
  const [tab, setTab] = useState('contractor')

  return (
    <div className="stmt-root" style={{ fontFamily:PP, display:'flex', flexDirection:'column', flex:1, minHeight:0, overflow:'hidden', background:L2 }}>
      <style>{`.stmt-root input,.stmt-root select,.stmt-root button{font-family:'Poppins',sans-serif!important}`}</style>

      {/* ══ UPPER ZONE ══ */}
      <div style={{ flexShrink:0, background:L2, boxShadow:'0 2px 8px rgba(0,0,0,0.07)', zIndex:10 }}>
        <div style={{ padding:'6px 28px 0' }}>
          <div style={{ background:L1, borderRadius:'6px 6px 0 0', padding:'8px 16px', display:'flex', alignItems:'center' }}>
            <span style={{ fontSize:15, fontWeight:700, color:'#fff', letterSpacing:0.3 }}>📄 Statements</span>
          </div>
        </div>
        <div style={{ padding:'6px 28px 8px' }}>
          <div style={{ background:'#fff', padding:'8px 10px', borderRadius:8, boxShadow:'0 1px 4px rgba(0,0,0,0.08)', display:'flex', gap:4, alignItems:'center', flexWrap:'wrap' }}>
            {TABS.map(t=>(
              <button key={t.key} onClick={()=>setTab(t.key)} style={{
                padding:'7px 16px', fontSize:12, fontWeight:700, border:'none', cursor:'pointer',
                borderRadius:7, fontFamily:PP,
                background: tab===t.key ? L3 : 'transparent',
                color:      tab===t.key ? '#fff' : '#6b7c93',
                transition:'all 0.15s',
              }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══ SCROLL ZONE ══ */}
      <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:'10px 28px 24px' }}>
        {tab==='contractor'  && <ContractorStatement  entityId={entityId}/>}
        {tab==='subcon'      && <SubConStatement      entityId={entityId}/>}
        {tab==='supplier'    && <SupplierStatement    entityId={entityId}/>}
        {tab==='employee'    && <EmployeeStatement    entityId={entityId}/>}
        {tab==='department'  && <DepartmentStatement  entityId={entityId}/>}
        {tab==='project'     && <ProjectStatement     entityId={entityId}/>}
      </div>
    </div>
  )
}
