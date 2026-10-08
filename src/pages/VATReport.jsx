import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// VAT Report — Saudi Arabia (15% standard rate)
// Source 1: ledger_entries where account_type = 'GOVERNMENT'
//   - Output VAT (Sales VAT):   CR side of VAT accounts (liability)
//   - Input VAT (Purchase VAT): DR side of VAT accounts (reclaimable)
// Source 2: invoices.vat_amount for output VAT cross-check
// Source 3: purchase_orders with VAT for input VAT cross-check
//
// Net VAT Payable = Output VAT − Input VAT
// ═══════════════════════════════════════════════════════════════════

const VAT_RATE = 0.15

const S = {
  card: { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:10 },
  btn:  (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  btnO: (c='#1a2e3d') => ({ background:'transparent', color:c, border:`1.5px solid ${c}`, borderRadius:8, padding:'7px 15px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:  { padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff' },
  lbl:  { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
}

const fmt  = n => (+n||0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
const fmtD = d => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'

function currentQuarter() {
  const now = new Date()
  const m = now.getMonth()          // 0-11
  const q = Math.floor(m / 3)       // 0-3
  const y = now.getFullYear()
  const starts = [1,4,7,10]
  const ends   = [3,6,9,12]
  const sm = starts[q], em = ends[q]
  return {
    from: `${y}-${String(sm).padStart(2,'0')}-01`,
    to:   new Date(y, em, 0).toISOString().slice(0,10),
    label: `Q${q+1} ${y}`,
  }
}

function quarterPresets() {
  const now = new Date()
  const y = now.getFullYear()
  const presets = []
  for (let q = 0; q < 4; q++) {
    const starts = [1,4,7,10], ends = [3,6,9,12]
    const sm = starts[q], em = ends[q]
    presets.push({
      label: `Q${q+1} ${y}`,
      from:  `${y}-${String(sm).padStart(2,'0')}-01`,
      to:    new Date(y, em, 0).toISOString().slice(0,10),
    })
  }
  // Add last year's quarters
  const py = y - 1
  for (let q = 0; q < 4; q++) {
    const starts = [1,4,7,10], ends = [3,6,9,12]
    const sm = starts[q], em = ends[q]
    presets.push({
      label: `Q${q+1} ${py}`,
      from:  `${py}-${String(sm).padStart(2,'0')}-01`,
      to:    new Date(py, em, 0).toISOString().slice(0,10),
    })
  }
  return presets
}

export default function VATReport({ entityId }) {
  const cq = currentQuarter()
  const [from,    setFrom]    = useState(cq.from)
  const [to,      setTo]      = useState(cq.to)
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [errors,  setErrors]  = useState([])
  const [tab,     setTab]     = useState('summary')   // 'summary' | 'gl' | 'invoices'

  useEffect(() => { if (entityId) load() }, [entityId, from, to])

  async function load() {
    setLoading(true)
    const errs = []

    const safe = async (label, promise) => {
      try { const r = await promise; return r.data || [] }
      catch (e) { errs.push(`${label}: ${e.message}`); return [] }
    }

    // ── Source 1: GL-based VAT (GOVERNMENT account type) ─────────
    const glEntries = await safe('ledger_entries (VAT)',
      supabase.from('ledger_entries')
        .select('account_code, account_name, debit, credit, entry_date, description, voucher_number')
        .eq('entity_id', entityId)
        .gte('entry_date', from).lte('entry_date', to))

    // Also pull account meta to find GOVERNMENT-typed accounts
    const { data: coa } = await supabase
      .from('chart_of_accounts')
      .select('account_code, account_name, account_type')
      .eq('entity_id', entityId)
      .eq('account_type', 'GOVERNMENT')

    const govCodes = new Set((coa||[]).map(a => a.account_code))

    // Filter GL entries to government/VAT accounts only
    const vatGl = glEntries.filter(e =>
      govCodes.has(e.account_code) ||
      (e.account_name||'').toLowerCase().includes('vat') ||
      (e.account_name||'').toLowerCase().includes('tax')
    )

    // Separate output VAT (CR = liability) and input VAT (DR = reclaimable)
    let outputVatGL = 0, inputVatGL = 0
    const outputRows = [], inputRows = []

    for (const e of vatGl) {
      const cr = +e.credit || 0
      const dr = +e.debit  || 0
      if (cr > 0) {
        outputVatGL += cr
        outputRows.push({ ...e, amount: cr, side: 'output' })
      }
      if (dr > 0) {
        inputVatGL += dr
        inputRows.push({ ...e, amount: dr, side: 'input' })
      }
    }

    // ── Source 2: Invoices VAT ────────────────────────────────────
    const invoices = await safe('invoices',
      supabase.from('invoices')
        .select('invoice_number, issue_date, client_name, total_amount, vat_amount, status')
        .eq('entity_id', entityId)
        .gte('issue_date', from).lte('issue_date', to)
        .not('status', 'eq', 'CANCELLED'))

    // vat_amount may not exist — fall back to estimating from total_amount
    let outputVatInv = 0
    let taxableSupplies = 0
    for (const inv of invoices) {
      if (inv.vat_amount != null) {
        outputVatInv += +inv.vat_amount || 0
        taxableSupplies += ((+inv.total_amount||0) - (+inv.vat_amount||0))
      } else {
        // Assume total_amount includes VAT: VAT = total / (1+rate) * rate
        const vat = (+inv.total_amount||0) / (1 + VAT_RATE) * VAT_RATE
        outputVatInv += vat
        taxableSupplies += (+inv.total_amount||0) - vat
      }
    }

    // ── Source 3: Outgoing POs VAT (vendor purchases) ────────────
    const pos = await safe('outgoing_pos',
      supabase.from('outgoing_pos')
        .select('po_date, total_value, status')
        .eq('entity_id', entityId)
        .gte('po_date', from).lte('po_date', to)
        .in('status', ['APPROVED','ACTIVE','CLOSED','COMPLETED']))

    let inputVatPO = 0, taxablePurchases = 0
    for (const po of pos) {
      // POs may not have vat column — estimate from total_value (incl. VAT)
      const vat = (+po.total_value||0) / (1 + VAT_RATE) * VAT_RATE
      inputVatPO += vat
      taxablePurchases += (+po.total_value||0) - vat
    }

    // ── Determine best VAT figures ───────────────────────────────
    // Prefer GL if VAT accounts are set up; otherwise use invoice/PO estimates
    const hasGlVat = outputVatGL > 0 || inputVatGL > 0
    const outputVat     = hasGlVat ? outputVatGL : outputVatInv
    const inputVat      = hasGlVat ? inputVatGL  : inputVatPO
    const netVatPayable = outputVat - inputVat

    setErrors(errs)
    setData({
      outputVat, inputVat, netVatPayable,
      taxableSupplies, taxablePurchases,
      invoiceCount: invoices.length,
      poCount: pos.length,
      invoices, pos,
      outputRows, inputRows,
      hasGlVat,
      outputVatInv, inputVatPO,   // alt figures for reference
    })
    setLoading(false)
  }

  function exportCSV() {
    if (!data) return
    const d = data
    const rows = [
      [`VAT Return — ${fmtD(from)} to ${fmtD(to)}`],[],
      ['BOX 1 - Standard Rated Supplies (Taxable Supplies)', d.taxableSupplies.toFixed(2), d.outputVat.toFixed(2)],
      ['BOX 2 - Zero Rated Supplies', '0.00', '0.00'],
      ['BOX 3 - Exempt Supplies', '0.00', '0.00'],
      ['BOX 4 - Total Output VAT', '', d.outputVat.toFixed(2)],
      [],[],
      ['BOX 5 - Standard Rated Purchases', d.taxablePurchases.toFixed(2), d.inputVat.toFixed(2)],
      ['BOX 6 - Total Input VAT', '', d.inputVat.toFixed(2)],
      [],[],
      ['BOX 7 - NET VAT PAYABLE / (REFUNDABLE)', '', d.netVatPayable.toFixed(2)],
    ]
    const blob = new Blob([rows.map(r=>r.join(',')).join('\n')], { type:'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `vat-return-${from}-to-${to}.csv`; a.click()
  }

  function printReport() {
    if (!data) return
    const d = data
    const payable = d.netVatPayable >= 0
    const w = window.open('', '_blank')
    w.document.write(`<!DOCTYPE html><html><head><title>VAT Return</title>
    <style>body{font-family:Arial,sans-serif;padding:32px;font-size:11px;max-width:780px;margin:0 auto}
    h2{font-size:18px;margin:0}p{color:#666;margin:2px 0 18px}
    .banner{background:#1a2e3d;color:#fff;padding:14px 18px;border-radius:8px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center}
    .box{border:1px solid #dde3ec;border-radius:8px;margin-bottom:10px;overflow:hidden}
    .box-hdr{background:#f5f7fa;padding:8px 14px;font-weight:700;font-size:11px;color:#1a2e3d;border-bottom:1px solid #dde3ec}
    .box-row{display:flex;justify-content:space-between;padding:7px 14px;border-bottom:1px solid #f5f5f5;font-size:11px}
    .box-row:last-child{border-bottom:none}
    .box-row span:last-child{font-family:monospace;font-weight:700}
    .net{background:${payable?'#e8f5e9':'#fff8e1'};border:2px solid ${payable?'#a5d6a7':'#ffcc80'};padding:14px 18px;border-radius:8px;display:flex;justify-content:space-between;align-items:center}
    .net-label{font-weight:700;font-size:13px;color:${payable?'#2e7d32':'#e65100'}}
    .net-val{font-size:22px;font-weight:800;color:${payable?'#2e7d32':'#e65100'};font-family:monospace}
    @media print{@page{size:A4;margin:1.5cm}}</style></head><body>
    <div class="banner">
      <div><strong style="font-size:16px">VAT Return</strong><br><span style="font-size:11px;opacity:0.8">Period: ${fmtD(from)} – ${fmtD(to)}</span></div>
      <div style="font-size:11px;opacity:0.8">Saudi Arabia — VAT Rate: 15%</div>
    </div>
    <div class="box">
      <div class="box-hdr">OUTPUT VAT (Sales VAT)</div>
      <div class="box-row"><span>Box 1 — Standard Rated Supplies (excl. VAT)</span><span>${fmt(d.taxableSupplies)} SAR</span></div>
      <div class="box-row"><span>Box 1 — Output VAT @ 15%</span><span>${fmt(d.outputVat)} SAR</span></div>
      <div class="box-row"><span>Box 2 — Zero Rated Supplies</span><span>0.00 SAR</span></div>
      <div class="box-row"><span>Box 3 — Exempt Supplies</span><span>0.00 SAR</span></div>
    </div>
    <div class="box">
      <div class="box-hdr">INPUT VAT (Purchase VAT)</div>
      <div class="box-row"><span>Box 5 — Standard Rated Purchases (excl. VAT)</span><span>${fmt(d.taxablePurchases)} SAR</span></div>
      <div class="box-row"><span>Box 6 — Input VAT Reclaimable @ 15%</span><span>${fmt(d.inputVat)} SAR</span></div>
    </div>
    <div class="net">
      <div class="net-label">${payable?'Box 7 — Net VAT Payable to ZATCA':'Box 7 — VAT Refund Due from ZATCA'}</div>
      <div class="net-val">${fmt(d.netVatPayable)} SAR</div>
    </div>
    <p style="margin-top:16px;font-size:10px;color:#999">
      ${d.hasGlVat?'Figures sourced from GL (GOVERNMENT account type entries).':'Figures estimated from invoice and purchase order totals at 15% VAT rate (no dedicated VAT GL accounts found).'}
      ${d.invoiceCount} invoices | ${d.poCount} purchase orders in period.
      Generated: ${new Date().toLocaleDateString()}.
    </p>
    <script>window.onload=()=>window.print()<\/script></body></html>`)
    w.document.close()
  }

  const presets = quarterPresets()

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>VAT Return — Saudi Arabia (ZATCA) · Standard rate 15%</div>

      {/* Controls */}
      <div style={{ ...S.card, display:'flex', gap:8, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div><label style={S.lbl}>From</label><input type="date" value={from} onChange={e=>setFrom(e.target.value)} style={S.inp} /></div>
        <div><label style={S.lbl}>To</label><input type="date" value={to} onChange={e=>setTo(e.target.value)} style={S.inp} /></div>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap', paddingBottom:2 }}>
          {presets.slice(0,4).map(p=>(
            <button key={p.label} onClick={()=>{setFrom(p.from);setTo(p.to)}}
              style={{ ...S.btnO('#1565C0'), fontSize:10, padding:'6px 8px' }}>{p.label}</button>
          ))}
          <span style={{ color:'#dde3ec', fontSize:12, alignSelf:'center' }}>|</span>
          {presets.slice(4).map(p=>(
            <button key={p.label} onClick={()=>{setFrom(p.from);setTo(p.to)}}
              style={{ ...S.btnO('#546e7a'), fontSize:10, padding:'6px 8px' }}>{p.label}</button>
          ))}
        </div>
        <button style={S.btnO()} onClick={exportCSV} disabled={!data}>⬇ CSV</button>
        <button style={S.btnO('#2e7d32')} onClick={printReport} disabled={!data}>🖨 Print</button>
        <button style={S.btn()} onClick={load} disabled={loading}>↻ Refresh</button>
      </div>

      {errors.length > 0 && (
        <div style={{ ...S.card, background:'#fff8e1', border:'1px solid #ffcc80', fontSize:11, color:'#795548' }}>
          ⚠ {errors.join(' | ')}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:80, color:'#6b7c93' }}>Loading VAT data…</div>
      ) : !data ? null : (() => {
        const d = data
        const payable = d.netVatPayable >= 0
        return (
          <>
            {/* Source indicator */}
            {!d.hasGlVat && (
              <div style={{ ...S.card, background:'#fff8e1', border:'1px solid #ffcc80', fontSize:11, color:'#795548' }}>
                ℹ No dedicated VAT GL accounts found (GOVERNMENT type). VAT figures are <strong>estimated</strong> from invoice/PO totals at 15%.
                To get exact GL-based figures, post VAT entries to GOVERNMENT-type accounts in the Chart of Accounts.
              </div>
            )}
            {d.hasGlVat && (
              <div style={{ ...S.card, background:'#e8f5e9', border:'1px solid #a5d6a7', fontSize:11, color:'#2e7d32' }}>
                ✓ VAT figures sourced from GL entries (GOVERNMENT account type). {d.outputRows.length+d.inputRows.length} VAT journal lines in period.
              </div>
            )}

            {/* Net VAT banner */}
            <div style={{ ...S.card, background:payable?'#e8f5e9':'#fff8e1', border:`2px solid ${payable?'#a5d6a7':'#ffcc80'}`, display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:2 }}>
                  {payable ? 'BOX 7 — NET VAT PAYABLE TO ZATCA' : 'BOX 7 — VAT REFUND DUE FROM ZATCA'}
                </div>
                <div style={{ fontSize:32, fontWeight:800, color:payable?'#2e7d32':'#e65100' }}>
                  {fmt(Math.abs(d.netVatPayable))} SAR
                </div>
                <div style={{ fontSize:11, color:'#6b7c93', marginTop:4 }}>
                  Output VAT: {fmt(d.outputVat)} &nbsp;|&nbsp; Input VAT: {fmt(d.inputVat)}
                </div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:11, color:'#6b7c93' }}>Period</div>
                <div style={{ fontWeight:700, color:'#1a2e3d' }}>{fmtD(from)} – {fmtD(to)}</div>
                <div style={{ fontSize:11, color:'#6b7c93', marginTop:6 }}>VAT Rate: 15% (ZATCA)</div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display:'flex', gap:4, marginBottom:12 }}>
              {[['summary','Return Summary'],['gl','GL Entries'],['invoices','Invoices / POs']].map(([k,l])=>(
                <button key={k} onClick={()=>setTab(k)} style={{
                  ...( tab===k ? S.btn('#1a2e3d') : S.btnO('#546e7a') ),
                  fontSize:11, padding:'6px 12px'
                }}>{l}</button>
              ))}
            </div>

            {/* SUMMARY TAB */}
            {tab==='summary' && (
              <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                      <th style={{ padding:'10px 14px', textAlign:'left', fontSize:12, width:'50%' }}>Box</th>
                      <th style={{ padding:'10px 14px', textAlign:'right', fontSize:12 }}>Amount (SAR)</th>
                      <th style={{ padding:'10px 14px', textAlign:'right', fontSize:12 }}>VAT (SAR)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Output */}
                    <tr style={{ background:'#1565C018' }}>
                      <td colSpan={3} style={{ padding:'8px 14px', fontWeight:800, fontSize:11, color:'#1565C0', letterSpacing:1 }}>
                        OUTPUT VAT (Sales)
                      </td>
                    </tr>
                    <tr style={{ borderBottom:'1px solid #f5f5f5' }}>
                      <td style={{ padding:'8px 14px 8px 28px', fontSize:12, color:'#546e7a' }}>
                        Box 1 — Standard Rated Supplies
                      </td>
                      <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12 }}>{fmt(d.taxableSupplies)}</td>
                      <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#1565C0' }}>{fmt(d.outputVat)}</td>
                    </tr>
                    <tr style={{ borderBottom:'1px solid #f5f5f5', background:'#fafafa' }}>
                      <td style={{ padding:'8px 14px 8px 28px', fontSize:12, color:'#aab2bd' }}>Box 2 — Zero Rated Supplies</td>
                      <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12, color:'#aab2bd' }}>0.00</td>
                      <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12, color:'#aab2bd' }}>0.00</td>
                    </tr>
                    <tr style={{ borderBottom:'1px solid #f5f5f5' }}>
                      <td style={{ padding:'8px 14px 8px 28px', fontSize:12, color:'#aab2bd' }}>Box 3 — Exempt Supplies</td>
                      <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12, color:'#aab2bd' }}>0.00</td>
                      <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12, color:'#aab2bd' }}>0.00</td>
                    </tr>
                    <tr style={{ background:'#e3f2fd' }}>
                      <td style={{ padding:'9px 14px', fontWeight:800, fontSize:13 }}>Box 4 — Total Output VAT</td>
                      <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700 }}>{fmt(d.taxableSupplies)}</td>
                      <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:14, color:'#1565C0' }}>{fmt(d.outputVat)}</td>
                    </tr>

                    <tr><td colSpan={3} style={{ height:10, background:'#f9fafb' }} /></tr>

                    {/* Input */}
                    <tr style={{ background:'#fce4ec18' }}>
                      <td colSpan={3} style={{ padding:'8px 14px', fontWeight:800, fontSize:11, color:'#c62828', letterSpacing:1 }}>
                        INPUT VAT (Purchases — Reclaimable)
                      </td>
                    </tr>
                    <tr style={{ borderBottom:'1px solid #f5f5f5' }}>
                      <td style={{ padding:'8px 14px 8px 28px', fontSize:12, color:'#546e7a' }}>
                        Box 5 — Standard Rated Purchases
                      </td>
                      <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12 }}>{fmt(d.taxablePurchases)}</td>
                      <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#c62828' }}>{fmt(d.inputVat)}</td>
                    </tr>
                    <tr style={{ background:'#fce4ec22' }}>
                      <td style={{ padding:'9px 14px', fontWeight:800, fontSize:13 }}>Box 6 — Total Input VAT (Deductible)</td>
                      <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:700 }}>{fmt(d.taxablePurchases)}</td>
                      <td style={{ padding:'9px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:14, color:'#c62828' }}>{fmt(d.inputVat)}</td>
                    </tr>

                    <tr><td colSpan={3} style={{ height:10, background:'#f9fafb' }} /></tr>

                    <tr style={{ background:payable?'#e8f5e9':'#fff8e1' }}>
                      <td style={{ padding:'13px 14px', fontWeight:800, fontSize:15, color:payable?'#2e7d32':'#e65100' }}>
                        Box 7 — {payable ? 'Net VAT Payable' : 'VAT Refund Due'}
                      </td>
                      <td style={{ padding:'13px 14px', textAlign:'right', color:'#6b7c93', fontSize:12 }}>
                        {fmt(d.taxableSupplies)} − {fmt(d.taxablePurchases)}
                      </td>
                      <td style={{ padding:'13px 14px', textAlign:'right', fontFamily:'monospace', fontWeight:800, fontSize:16, color:payable?'#2e7d32':'#e65100' }}>
                        {fmt(d.netVatPayable)} SAR
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {/* GL ENTRIES TAB */}
            {tab==='gl' && (
              <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
                {d.outputRows.length===0 && d.inputRows.length===0 ? (
                  <div style={{ padding:32, textAlign:'center', color:'#aab2bd', fontStyle:'italic' }}>
                    No GOVERNMENT-type GL entries found for this period.<br/>
                    Add accounts with type GOVERNMENT to your Chart of Accounts for GL-based VAT tracking.
                  </div>
                ) : (
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ background:'#1a2e3d', color:'#fff' }}>
                        <th style={{ padding:'9px 14px', textAlign:'left',  fontSize:11 }}>Date</th>
                        <th style={{ padding:'9px 14px', textAlign:'left',  fontSize:11 }}>Account</th>
                        <th style={{ padding:'9px 14px', textAlign:'left',  fontSize:11 }}>Description</th>
                        <th style={{ padding:'9px 14px', textAlign:'left',  fontSize:11 }}>Voucher</th>
                        <th style={{ padding:'9px 14px', textAlign:'right', fontSize:11 }}>Amount</th>
                        <th style={{ padding:'9px 14px', textAlign:'center',fontSize:11 }}>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...d.outputRows, ...d.inputRows]
                        .sort((a,b) => a.entry_date?.localeCompare(b.entry_date))
                        .map((r,i) => (
                        <tr key={i} style={{ borderBottom:'1px solid #f5f5f5', background:i%2?'#fafafa':'#fff' }}>
                          <td style={{ padding:'6px 14px', fontSize:11, color:'#546e7a' }}>{fmtD(r.entry_date)}</td>
                          <td style={{ padding:'6px 14px', fontSize:11 }}>
                            <span style={{ fontSize:9, color:'#9e9e9e', fontFamily:'monospace', marginRight:4 }}>{r.account_code}</span>
                            {r.account_name}
                          </td>
                          <td style={{ padding:'6px 14px', fontSize:11, color:'#546e7a', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.description||'—'}</td>
                          <td style={{ padding:'6px 14px', fontSize:11, color:'#546e7a' }}>{r.voucher_number||'—'}</td>
                          <td style={{ padding:'6px 14px', textAlign:'right', fontFamily:'monospace', fontSize:11, fontWeight:700 }}>{fmt(r.amount)}</td>
                          <td style={{ padding:'6px 14px', textAlign:'center' }}>
                            <span style={{ padding:'2px 7px', borderRadius:10, fontSize:10, fontWeight:700,
                              background:r.side==='output'?'#e3f2fd':'#fce4ec',
                              color:r.side==='output'?'#1565C0':'#c62828' }}>
                              {r.side==='output' ? 'OUTPUT' : 'INPUT'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* INVOICES TAB */}
            {tab==='invoices' && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                {/* Sales / Invoices */}
                <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
                  <div style={{ padding:'10px 14px', background:'#1565C0', color:'#fff', fontWeight:800, fontSize:12 }}>
                    OUTPUT — Sales Invoices ({d.invoices.length})
                  </div>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ background:'#f5f7fa' }}>
                        <th style={{ padding:'7px 14px', textAlign:'left', fontSize:10, color:'#6b7c93' }}>Invoice #</th>
                        <th style={{ padding:'7px 14px', textAlign:'left', fontSize:10, color:'#6b7c93' }}>Date</th>
                        <th style={{ padding:'7px 14px', textAlign:'right', fontSize:10, color:'#6b7c93' }}>Total</th>
                        <th style={{ padding:'7px 14px', textAlign:'right', fontSize:10, color:'#1565C0' }}>VAT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.invoices.length === 0 ? (
                        <tr><td colSpan={4} style={{ padding:20, textAlign:'center', color:'#aab2bd', fontStyle:'italic' }}>No invoices</td></tr>
                      ) : d.invoices.map((inv,i) => {
                        const vatAmt = inv.vat_amount!=null ? +inv.vat_amount : (+inv.total_amount||0)/(1+VAT_RATE)*VAT_RATE
                        return (
                          <tr key={i} style={{ borderBottom:'1px solid #f5f5f5', background:i%2?'#fafafa':'#fff' }}>
                            <td style={{ padding:'6px 14px', fontSize:11, color:'#546e7a' }}>{inv.invoice_number||'—'}</td>
                            <td style={{ padding:'6px 14px', fontSize:11, color:'#546e7a' }}>{fmtD(inv.issue_date)}</td>
                            <td style={{ padding:'6px 14px', textAlign:'right', fontFamily:'monospace', fontSize:11 }}>{fmt(inv.total_amount)}</td>
                            <td style={{ padding:'6px 14px', textAlign:'right', fontFamily:'monospace', fontSize:11, fontWeight:700, color:'#1565C0' }}>{fmt(vatAmt)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    {d.invoices.length > 0 && (
                      <tfoot>
                        <tr style={{ background:'#e3f2fd', fontWeight:800 }}>
                          <td colSpan={3} style={{ padding:'8px 14px', fontSize:12 }}>Total Output VAT</td>
                          <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontSize:13, color:'#1565C0' }}>{fmt(d.outputVatInv)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* Purchases / POs */}
                <div style={{ ...S.card, padding:0, overflow:'hidden' }}>
                  <div style={{ padding:'10px 14px', background:'#c62828', color:'#fff', fontWeight:800, fontSize:12 }}>
                    INPUT — Purchase Orders ({d.pos.length})
                  </div>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ background:'#f5f7fa' }}>
                        <th style={{ padding:'7px 14px', textAlign:'left', fontSize:10, color:'#6b7c93' }}>PO #</th>
                        <th style={{ padding:'7px 14px', textAlign:'left', fontSize:10, color:'#6b7c93' }}>Date</th>
                        <th style={{ padding:'7px 14px', textAlign:'right', fontSize:10, color:'#6b7c93' }}>Total</th>
                        <th style={{ padding:'7px 14px', textAlign:'right', fontSize:10, color:'#c62828' }}>VAT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.pos.length === 0 ? (
                        <tr><td colSpan={4} style={{ padding:20, textAlign:'center', color:'#aab2bd', fontStyle:'italic' }}>No purchase orders</td></tr>
                      ) : d.pos.map((po,i) => {
                        const vatAmt = (+po.total_value||0)/(1+VAT_RATE)*VAT_RATE
                        return (
                          <tr key={i} style={{ borderBottom:'1px solid #f5f5f5', background:i%2?'#fafafa':'#fff' }}>
                            <td style={{ padding:'6px 14px', fontSize:11, color:'#546e7a' }}>—</td>
                            <td style={{ padding:'6px 14px', fontSize:11, color:'#546e7a' }}>{fmtD(po.po_date)}</td>
                            <td style={{ padding:'6px 14px', textAlign:'right', fontFamily:'monospace', fontSize:11 }}>{fmt(po.total_value)}</td>
                            <td style={{ padding:'6px 14px', textAlign:'right', fontFamily:'monospace', fontSize:11, fontWeight:700, color:'#c62828' }}>{fmt(vatAmt)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    {d.pos.length > 0 && (
                      <tfoot>
                        <tr style={{ background:'#fce4ec', fontWeight:800 }}>
                          <td colSpan={3} style={{ padding:'8px 14px', fontSize:12 }}>Total Input VAT</td>
                          <td style={{ padding:'8px 14px', textAlign:'right', fontFamily:'monospace', fontSize:13, color:'#c62828' }}>{fmt(d.inputVatPO)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            )}

            <div style={{ marginTop:4, fontSize:11, color:'#aab2bd' }}>
              Saudi Arabia VAT registered businesses file quarterly returns with ZATCA.
              Standard rate: 15% (effective July 2020). Zero-rate and exempt supplies tracked separately if applicable.
            </div>
          </>
        )
      })()}
    </div>
  )
}
