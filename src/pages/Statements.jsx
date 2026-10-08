import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// Statements Page — two tabs
//   Tab A: Customer Statement  (AR)
//     Select customer → invoices + payments → running balance
//     Print shareable statement (for email to customer)
//
//   Tab B: Supplier Statement (AP)
//     Select contractor/supplier → purchase orders → outstanding
//     Print for internal use
// ═══════════════════════════════════════════════════════════════════

const S = {
  card: { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:10 },
  btn:  (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  btnO: (c='#1a2e3d') => ({ background:'transparent', color:c, border:`1.5px solid ${c}`, borderRadius:8, padding:'7px 15px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:  { padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff' },
  sel:  { padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff', minWidth:200 },
  lbl:  { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
}

const fmt  = n => (+n||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
const fmtD = d => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'
const today = () => new Date().toISOString().slice(0,10)
const monthStart = () => { const n=new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-01` }

// ─────────────────────────────────────────────────────────────────
// CUSTOMER STATEMENT
// ─────────────────────────────────────────────────────────────────
function CustomerStatement({ entityId }) {
  const [customers, setCustomers] = useState([])
  const [custId,    setCustId]    = useState('')
  const [from,      setFrom]      = useState(monthStart())
  const [to,        setTo]        = useState(today())
  const [invoices,  setInvoices]  = useState([])
  const [payments,  setPayments]  = useState([])
  const [loading,   setLoading]   = useState(false)

  useEffect(() => { loadCustomers() }, [entityId])
  async function loadCustomers() {
    const { data } = await supabase.from('customers').select('id, name_en, account_no, email').eq('entity_id', entityId).eq('is_active', true).order('name_en')
    setCustomers(data || [])
  }

  async function loadStatement() {
    if (!custId) return
    setLoading(true)
    const [invRes, pmtRes] = await Promise.all([
      supabase.from('invoices')
        .select('id, invoice_no, issue_date, due_date, total_amount, vat_amount, paid_amount, status, currency')
        .eq('entity_id', entityId)
        .eq('customer_id', custId)
        .gte('issue_date', from)
        .lte('issue_date', to)
        .order('issue_date'),

      supabase.from('payments')
        .select('id, payment_date, payment_type, amount, reference_number, description')
        .eq('entity_id', entityId)
        .eq('customer_id', custId)
        .gte('payment_date', from)
        .lte('payment_date', to)
        .order('payment_date'),
    ])
    setInvoices(invRes.data || [])
    setPayments(pmtRes.data || [])
    setLoading(false)
  }

  // Merge invoices + payments into a chronological ledger
  const ledger = useMemo(() => {
    const rows = [
      ...invoices.map(inv => ({
        date: inv.issue_date, type: 'INVOICE', ref: inv.invoice_no,
        due: inv.due_date, debit: +(inv.total_amount||0), credit: 0,
        status: inv.status, id: inv.id,
      })),
      ...payments.map(p => ({
        date: p.payment_date, type: 'PAYMENT', ref: p.reference_number || 'PMT',
        description: p.description, debit: 0, credit: +(p.amount||0),
        id: p.id,
      })),
    ].sort((a,b) => a.date.localeCompare(b.date))

    let balance = 0
    return rows.map(r => {
      balance += r.debit - r.credit
      return { ...r, balance }
    })
  }, [invoices, payments])

  const customer = customers.find(c => c.id === custId)
  const totalInvoiced = invoices.reduce((s, i) => s + (+i.total_amount||0), 0)
  const totalPaid     = payments.reduce((s, p) => s + (+p.amount||0), 0)
  const closingBal    = totalInvoiced - totalPaid

  function printStatement() {
    if (!customer) return
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>Customer Statement — ${customer.name_en}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:32px;font-size:11px;max-width:720px;margin:0 auto;color:#1a2e3d}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px}
      .co{font-size:18px;font-weight:800;color:#1a2e3d}
      .meta{font-size:11px;color:#666;margin-top:4px}
      .cust{text-align:right}
      .cust .name{font-weight:700;font-size:13px}
      h3{font-size:13px;border-bottom:2px solid #1a2e3d;padding-bottom:6px;margin:20px 0 10px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{background:#1a2e3d;color:#fff;padding:7px 10px;text-align:right}
      th:first-child,th:nth-child(2),th:nth-child(3){text-align:left}
      td{padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right}
      td:first-child,td:nth-child(2),td:nth-child(3){text-align:left}
      .inv{color:#1565C0}
      .pmt{color:#2e7d32}
      .sum{background:#f5f5f5;font-weight:700}
      .closing{background:#1a2e3d;color:#fff;font-weight:800;font-size:13px}
      .closing td{padding:10px;text-align:right}
      .closing td:first-child{text-align:left}
      @media print{@page{size:A4;margin:1.5cm}}
    </style></head><body>
    <div class="header">
      <div>
        <div class="co">RATAL GROUP</div>
        <div class="meta">Statement Period: ${fmtD(from)} – ${fmtD(to)}</div>
        <div class="meta">Printed: ${fmtD(today())}</div>
      </div>
      <div class="cust">
        <div class="name">${customer.name_en}</div>
        ${customer.account_no ? `<div class="meta">Account: ${customer.account_no}</div>`:''}
        ${customer.email ? `<div class="meta">${customer.email}</div>`:''}
      </div>
    </div>
    <h3>ACCOUNT STATEMENT</h3>
    <table>
      <tr><th>Date</th><th>Reference</th><th>Description</th><th>Debit (SAR)</th><th>Credit (SAR)</th><th>Balance (SAR)</th></tr>
      ${ledger.map(r => `<tr>
        <td>${fmtD(r.date)}</td>
        <td class="${r.type==='INVOICE'?'inv':'pmt'}">${r.ref}</td>
        <td>${r.type==='INVOICE' ? 'Invoice' : r.description||'Payment received'}</td>
        <td>${r.debit ? fmt(r.debit) : '—'}</td>
        <td>${r.credit ? fmt(r.credit) : '—'}</td>
        <td>${r.balance < 0 ? `(${fmt(Math.abs(r.balance))})` : fmt(r.balance)}</td>
      </tr>`).join('')}
      <tr class="closing"><td colspan="3">CLOSING BALANCE</td><td></td><td></td><td>${closingBal < 0 ? `(${fmt(Math.abs(closingBal))})` : fmt(closingBal)}</td></tr>
    </table>
    <p style="margin-top:24px;font-size:10px;color:#999">This statement is computer generated. For queries contact accounts@ratal-group.com</p>
    <script>window.onload=()=>window.print()<\/script></body></html>`)
    w.document.close()
  }

  function exportCSV() {
    const rows = [
      [`Customer Statement — ${customer?.name_en} — ${from} to ${to}`],[],
      ['Date','Reference','Type','Debit','Credit','Balance'],
      ...ledger.map(r => [fmtD(r.date), r.ref, r.type, r.debit.toFixed(2), r.credit.toFixed(2), r.balance.toFixed(2)]),
      [],[`Closing Balance`, '', '', '', '', closingBal.toFixed(2)],
    ]
    const blob = new Blob([rows.map(r=>r.join(',')).join('\n')], { type:'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `statement-${customer?.name_en?.replace(/\s+/g,'-')}-${from}.csv`; a.click()
  }

  const STATUS_COLORS = {
    PAID:   { bg:'#e8f5e9', color:'#2e7d32' }, PARTIAL:{ bg:'#fff8e1', color:'#f57c00' },
    SENT:   { bg:'#e3f2fd', color:'#1565C0' }, OVERDUE:{ bg:'#ffebee', color:'#c62828' },
    DRAFT:  { bg:'#f5f5f5', color:'#546e7a' }, UNPAID: { bg:'#ffebee', color:'#e65100' },
  }

  return (
    <div>
      {/* Controls */}
      <div style={{ ...S.card, display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div style={{ minWidth:220 }}>
          <label style={S.lbl}>Customer</label>
          <select value={custId} onChange={e => setCustId(e.target.value)} style={{ ...S.sel, width:'100%' }}>
            <option value="">— Select Customer —</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name_en}</option>)}
          </select>
        </div>
        <div>
          <label style={S.lbl}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={S.inp} />
        </div>
        <div>
          <label style={S.lbl}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={S.inp} />
        </div>
        <button style={S.btn('#1565C0')} onClick={loadStatement} disabled={!custId || loading}>
          {loading ? 'Loading…' : '📄 Generate Statement'}
        </button>
        {ledger.length > 0 && <>
          <button style={S.btnO('#2e7d32')} onClick={printStatement}>🖨 Print / Share</button>
          <button style={S.btnO()} onClick={exportCSV}>⬇ CSV</button>
        </>}
      </div>

      {!custId ? (
        <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>Select a customer to generate their account statement</div>
      ) : ledger.length === 0 && !loading ? (
        <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>No transactions found for this customer in the selected period</div>
      ) : ledger.length > 0 ? (
        <>
          {/* Summary KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12 }}>
            {[
              { label:'Total Invoiced',   val:totalInvoiced, color:'#1565C0' },
              { label:'Total Received',   val:totalPaid,     color:'#2e7d32' },
              { label:'Closing Balance',  val:closingBal,    color: closingBal>0?'#c62828':'#2e7d32' },
              { label:'Transactions',     val:ledger.length, color:'#546e7a', noSAR:true },
            ].map(k => (
              <div key={k.label} style={{ background:'#fff', borderRadius:12, padding:'12px 14px', boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:10, color:'#6b7c93', marginBottom:3 }}>{k.label}</div>
                <div style={{ fontWeight:800, fontSize:15, color:k.color }}>{k.noSAR ? k.val : fmt(k.val)}</div>
                {!k.noSAR && <div style={{ fontSize:9, color:'#aab2bd' }}>SAR</div>}
              </div>
            ))}
          </div>

          {/* Ledger table */}
          <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
            <div style={{ background:'#1565C0', color:'#fff', padding:'10px 14px', fontWeight:800, fontSize:13 }}>
              {customer?.name_en} — Statement {fmtD(from)} to {fmtD(to)}
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#f5f7fa' }}>
                  {['Date','Reference','Description','Due Date','Debit (SAR)','Credit (SAR)','Balance (SAR)'].map(h => (
                    <th key={h} style={{ padding:'8px 12px', textAlign:['Debit (SAR)','Credit (SAR)','Balance (SAR)'].includes(h)?'right':'left', fontWeight:700, fontSize:10, color:'#6b7c93', borderBottom:'1.5px solid #e0e0e0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledger.map((r, i) => {
                  const sc = r.type === 'INVOICE' ? STATUS_COLORS[r.status]||{bg:'#f5f5f5',color:'#546e7a'} : null
                  return (
                    <tr key={r.id} style={{ borderBottom:'1px solid #f5f5f5', background: i%2===0?'#fff':'#fafbfc' }}>
                      <td style={{ padding:'7px 12px', color:'#6b7c93' }}>{fmtD(r.date)}</td>
                      <td style={{ padding:'7px 12px', fontWeight:700, color: r.type==='INVOICE'?'#1565C0':'#2e7d32' }}>
                        {r.ref}
                        {sc && <span style={{ marginLeft:6, background:sc.bg, color:sc.color, fontSize:9, padding:'1px 5px', borderRadius:4 }}>{r.status}</span>}
                      </td>
                      <td style={{ padding:'7px 12px', color:'#546e7a' }}>
                        {r.type === 'INVOICE' ? 'Invoice raised' : r.description || 'Payment received'}
                      </td>
                      <td style={{ padding:'7px 12px', color: r.due && new Date(r.due) < new Date() && r.type==='INVOICE' ? '#c62828' : '#6b7c93' }}>
                        {r.due ? fmtD(r.due) : '—'}
                      </td>
                      <td style={{ padding:'7px 12px', textAlign:'right', fontFamily:'monospace', color: r.debit ? '#c62828' : '#ccc' }}>
                        {r.debit ? fmt(r.debit) : '—'}
                      </td>
                      <td style={{ padding:'7px 12px', textAlign:'right', fontFamily:'monospace', color: r.credit ? '#2e7d32' : '#ccc' }}>
                        {r.credit ? fmt(r.credit) : '—'}
                      </td>
                      <td style={{ padding:'7px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color: r.balance > 0 ? '#c62828' : r.balance < 0 ? '#2e7d32' : '#aab2bd' }}>
                        {r.balance < 0 ? `(${fmt(Math.abs(r.balance))})` : fmt(r.balance)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                  <td colSpan={4} style={{ padding:'10px 12px', fontWeight:800, fontSize:13 }}>CLOSING BALANCE</td>
                  <td style={{ padding:'10px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:700 }}>{fmt(totalInvoiced)}</td>
                  <td style={{ padding:'10px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:700, color:'#a5d6a7' }}>{fmt(totalPaid)}</td>
                  <td style={{ padding:'10px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:14, color: closingBal>0?'#ef9a9a':'#a5d6a7' }}>
                    {closingBal<0 ? `(${fmt(Math.abs(closingBal))})` : fmt(closingBal)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div style={{ marginTop:6, fontSize:11, color:'#aab2bd' }}>
            Debit = invoice raised (amount owed by customer). Credit = payment received. Positive balance = customer owes you.
          </div>
        </>
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// SUPPLIER / CONTRACTOR STATEMENT
// ─────────────────────────────────────────────────────────────────
function SupplierStatement({ entityId }) {
  const [suppliers, setSuppliers] = useState([])
  const [suppId,    setSuppId]    = useState('')
  const [from,      setFrom]      = useState(monthStart())
  const [to,        setTo]        = useState(today())
  const [pos,       setPos]       = useState([])
  const [pmts,      setPmts]      = useState([])
  const [loading,   setLoading]   = useState(false)

  useEffect(() => { loadSuppliers() }, [entityId])
  async function loadSuppliers() {
    const { data } = await supabase.from('contractors')
      .select('id, contractor_name, contractor_code, contractor_type')
      .eq('entity_id', entityId).eq('status','ACTIVE').order('contractor_name')
    setSuppliers(data || [])
  }

  async function loadStatement() {
    if (!suppId) return
    setLoading(true)
    const [poRes, pmtRes] = await Promise.all([
      supabase.from('outgoing_pos')
        .select('id, po_date, total_value, status, notes')
        .eq('entity_id', entityId)
        .eq('supplier_id', suppId)
        .gte('po_date', from)
        .lte('po_date', to)
        .order('po_date'),

      // Airline/supplier payments linked to this contractor (if any)
      supabase.from('payments')
        .select('id, payment_date, amount, reference_number, description, payment_type')
        .eq('entity_id', entityId)
        .in('payment_type', ['AIRLINE_PAYMENT', 'ADVANCE', 'OTHER'])
        .gte('payment_date', from)
        .lte('payment_date', to)
        .order('payment_date'),
    ])
    setPos(poRes.data  || [])
    setPmts(pmtRes.data || [])
    setLoading(false)
  }

  const supplier = suppliers.find(s => s.id === suppId)

  // Ledger: POs = liability raised, Payments = amount paid
  const ledger = useMemo(() => {
    const rows = [
      ...pos.map(po => ({
        date: po.po_date, ref: po.id.slice(0,8),
        type:'PO', dept: '', amount: +(po.total_value||0),
        status: po.status, credit: +(po.total_value||0), debit: 0, id: po.id,
      })),
    ].sort((a,b) => a.date.localeCompare(b.date))

    let balance = 0
    return rows.map(r => {
      balance += r.credit
      return { ...r, balance }
    })
  }, [pos])

  const totalPOs        = pos.reduce((s,p) => s + (+p.total_value||0), 0)
  const totalApproved   = pos.filter(p => ['APPROVED','ACTIVE'].includes(p.status)).reduce((s,p) => s + (+p.total_value||0), 0)
  const totalClosed     = pos.filter(p => p.status === 'CLOSED').reduce((s,p) => s + (+p.total_value||0), 0)
  const outstanding     = totalApproved

  const STATUS_COLORS = {
    DRAFT:    { bg:'#fff3e0', color:'#e65100' }, APPROVED:{ bg:'#e3f2fd', color:'#0277bd' },
    ACTIVE:   { bg:'#e8f5e9', color:'#2e7d32' }, CLOSED:  { bg:'#f3e5f5', color:'#6a1b9a' },
    REJECTED: { bg:'#ffebee', color:'#c62828' },
  }

  function printStatement() {
    if (!supplier) return
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>Supplier Statement — ${supplier.contractor_name}</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;font-size:11px;max-width:720px;margin:0 auto}
    h2{font-size:17px;margin-bottom:2px}p{color:#666;margin:0 0 16px}
    table{width:100%;border-collapse:collapse}
    th{background:#1a2e3d;color:#fff;padding:7px 10px;text-align:right;font-size:10px}
    th:first-child,th:nth-child(2),th:nth-child(3),th:nth-child(4){text-align:left}
    td{padding:6px 10px;border-bottom:1px solid #f0f0f0;text-align:right}
    td:first-child,td:nth-child(2),td:nth-child(3),td:nth-child(4){text-align:left}
    .tot{background:#1a2e3d;color:#fff;font-weight:800}
    @media print{@page{size:A4;margin:1.5cm}}</style></head><body>
    <h2>Supplier Statement — ${supplier.contractor_name}</h2>
    <p>Code: ${supplier.contractor_code||'—'} &nbsp;|&nbsp; Type: ${supplier.contractor_type} &nbsp;|&nbsp; Period: ${fmtD(from)} – ${fmtD(to)}</p>
    <table>
      <tr><th>PO Date</th><th>PO Reference</th><th>Department</th><th>Status</th><th>Amount (SAR)</th><th>Running Total</th></tr>
      ${ledger.map(r => `<tr><td>${fmtD(r.date)}</td><td>${r.ref}</td><td>${r.dept||'—'}</td><td>${r.status}</td><td>${fmt(r.credit)}</td><td>${fmt(r.balance)}</td></tr>`).join('')}
      <tr class="tot"><td colspan="4">TOTALS</td><td>${fmt(totalPOs)}</td><td>${fmt(outstanding)} outstanding</td></tr>
    </table>
    <script>window.onload=()=>window.print()<\/script></body></html>`)
    w.document.close()
  }

  return (
    <div>
      <div style={{ ...S.card, display:'flex', gap:10, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div style={{ minWidth:240 }}>
          <label style={S.lbl}>Supplier / Contractor</label>
          <select value={suppId} onChange={e => setSuppId(e.target.value)} style={{ ...S.sel, width:'100%' }}>
            <option value="">— Select Supplier —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.contractor_name} ({s.contractor_type})</option>)}
          </select>
        </div>
        <div>
          <label style={S.lbl}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={S.inp} />
        </div>
        <div>
          <label style={S.lbl}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={S.inp} />
        </div>
        <button style={S.btn('#5A32D4')} onClick={loadStatement} disabled={!suppId || loading}>
          {loading ? 'Loading…' : '📄 Generate'}
        </button>
        {ledger.length > 0 && <button style={S.btnO('#2e7d32')} onClick={printStatement}>🖨 Print</button>}
      </div>

      {!suppId ? (
        <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>Select a supplier to view their purchase order statement</div>
      ) : ledger.length === 0 && !loading ? (
        <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>No purchase orders found for this supplier in the selected period</div>
      ) : ledger.length > 0 ? (
        <>
          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:12 }}>
            {[
              { label:'Total PO Value',   val:totalPOs,      color:'#5A32D4' },
              { label:'Outstanding',      val:outstanding,   color:'#c62828' },
              { label:'Completed (Closed)',val:totalClosed,  color:'#2e7d32' },
              { label:'No. of POs',       val:pos.length,    color:'#546e7a', noSAR:true },
            ].map(k => (
              <div key={k.label} style={{ background:'#fff', borderRadius:12, padding:'12px 14px', boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:10, color:'#6b7c93', marginBottom:3 }}>{k.label}</div>
                <div style={{ fontWeight:800, fontSize:15, color:k.color }}>{k.noSAR ? k.val : fmt(k.val)}</div>
                {!k.noSAR && <div style={{ fontSize:9, color:'#aab2bd' }}>SAR</div>}
              </div>
            ))}
          </div>

          <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
            <div style={{ background:'#5A32D4', color:'#fff', padding:'10px 14px', fontWeight:800, fontSize:13 }}>
              {supplier?.contractor_name} — PO Statement {fmtD(from)} to {fmtD(to)}
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#f5f7fa' }}>
                  {['PO Date','Reference','Department','Status','Amount (SAR)','Running Total'].map(h => (
                    <th key={h} style={{ padding:'8px 12px', textAlign:['Amount (SAR)','Running Total'].includes(h)?'right':'left', fontWeight:700, fontSize:10, color:'#6b7c93', borderBottom:'1.5px solid #e0e0e0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledger.map((r, i) => {
                  const sc = STATUS_COLORS[r.status] || { bg:'#f5f5f5', color:'#546e7a' }
                  return (
                    <tr key={r.id} style={{ borderBottom:'1px solid #f5f5f5', background: i%2===0?'#fff':'#fafbfc' }}>
                      <td style={{ padding:'7px 12px', color:'#6b7c93' }}>{fmtD(r.date)}</td>
                      <td style={{ padding:'7px 12px', fontWeight:700, color:'#5A32D4' }}>{r.ref}</td>
                      <td style={{ padding:'7px 12px', color:'#546e7a' }}>{r.dept || '—'}</td>
                      <td style={{ padding:'7px 12px' }}>
                        <span style={{ background:sc.bg, color:sc.color, fontSize:10, padding:'2px 8px', borderRadius:5, fontWeight:700 }}>{r.status}</span>
                      </td>
                      <td style={{ padding:'7px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:600 }}>{fmt(r.credit)}</td>
                      <td style={{ padding:'7px 12px', textAlign:'right', fontFamily:'monospace', color:'#5A32D4', fontWeight:700 }}>{fmt(r.balance)}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                  <td colSpan={4} style={{ padding:'10px 12px', fontWeight:800, fontSize:13 }}>TOTAL</td>
                  <td style={{ padding:'10px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:800 }}>{fmt(totalPOs)}</td>
                  <td style={{ padding:'10px 12px', textAlign:'right', fontFamily:'monospace', fontWeight:800, color: outstanding>0?'#ef9a9a':'#a5d6a7' }}>
                    {fmt(outstanding)} outstanding
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      ) : null}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// MAIN EXPORT — Tab wrapper
// ─────────────────────────────────────────────────────────────────
export default function Statements({ entityId, role }) {
  const [tab, setTab] = useState('customer')

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:16 }}>
        Customer AR statements and Supplier PO statements — printable and shareable
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:0, borderRadius:10, overflow:'hidden', border:'1.5px solid #dde3ec', marginBottom:16, width:'fit-content' }}>
        {[
          { key:'customer', label:'👥 Customer Statement', color:'#1565C0' },
          { key:'supplier', label:'🏢 Supplier Statement', color:'#5A32D4' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding:'9px 22px', fontSize:12, fontWeight:700, border:'none', cursor:'pointer',
            background: tab === t.key ? t.color : '#fff',
            color:      tab === t.key ? '#fff'  : '#6b7c93',
            transition: 'all 0.15s',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'customer' && <CustomerStatement entityId={entityId} />}
      {tab === 'supplier' && <SupplierStatement entityId={entityId} />}
    </div>
  )
}
