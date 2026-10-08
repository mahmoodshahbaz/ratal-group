import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// Booking Register — Daily CSV import viewer for GWT / RAT
// Core revenue workflow:
//   trip_records → select by client → Create Invoice → mark billed
// ═══════════════════════════════════════════════════════════════════

const SAR   = v  => `SAR ${(+v || 0).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmt   = d  => d ? new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) : '—'
const today = () => new Date().toISOString().slice(0, 10)
const thisMonth = () => new Date().toISOString().slice(0, 7)

const SERVICE_COLORS = {
  Air:        '#1565C0',
  Hotel:      '#e65100',
  Transfer:   '#2e7d32',
  Visa:       '#6a1b9a',
  Insurance:  '#00695c',
  Package:    '#c62828',
  Rail:       '#37474f',
}

const STATUS_COLORS = {
  CONFIRMED:  { text:'#2e7d32', bg:'#e8f5e9' },
  CANCELLED:  { text:'#c62828', bg:'#ffebee' },
  REFUNDED:   { text:'#546e7a', bg:'#f0f4f8' },
  AMENDED:    { text:'#f57c00', bg:'#fff3e0' },
  PENDING:    { text:'#1565C0', bg:'#e3f2fd' },
}

const S = {
  card:    { background:'#fff', borderRadius:14, padding:'16px 20px', boxShadow:'0 2px 10px rgba(0,0,0,0.07)', marginBottom:12 },
  btn:     (c='#1a2e3d') => ({ background:c, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  btnOut:  (c='#1a2e3d') => ({ background:'transparent', color:c, border:`1.5px solid ${c}`, borderRadius:8, padding:'7px 15px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }),
  inp:     { padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, outline:'none', background:'#fff', boxSizing:'border-box' },
  lbl:     { display:'block', fontSize:11, fontWeight:700, color:'#6b7c93', marginBottom:4 },
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 },
  modal:   { background:'#fff', borderRadius:16, padding:24, width:760, maxWidth:'96vw', maxHeight:'92vh', overflow:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.2)' },
}

// ─── Auto-generate next invoice number ───────────────────────────────────────
async function nextInvoiceNo(entityId, prefix = 'INV') {
  const ym = new Date().toISOString().slice(2, 7).replace('-', '')  // e.g. "2507"
  const pat = `${prefix}-${ym}-%`
  const { data } = await supabase.from('invoices')
    .select('invoice_number')
    .eq('entity_id', entityId)
    .like('invoice_number', pat)
    .order('invoice_number', { ascending: false })
    .limit(1)
  const last = data?.[0]?.invoice_number
  const seq  = last ? parseInt(last.split('-').pop(), 10) + 1 : 1
  return `${prefix}-${ym}-${String(seq).padStart(3, '0')}`
}

// ─── Invoice creation modal ────────────────────────────────────────────────────
function InvoiceModal({ selected, entityId, entityCode, onClose, onCreated }) {
  const [invoiceDate, setInvoiceDate] = useState(today())
  const [dueDate,     setDueDate]     = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10)
  })
  const [notes,    setNotes]    = useState('')
  const [vatRate,  setVatRate]  = useState(15)
  const [creating, setCreating] = useState(false)
  const [err,      setErr]      = useState('')

  // Group by client
  const clients = [...new Set(selected.map(r => r.client_name || 'Unknown'))]
  const multiClient = clients.length > 1

  const subtotal    = selected.reduce((s, r) => s + (+r.sale_amount || 0), 0)
  const vatAmount   = subtotal * (vatRate / 100)
  const totalAmount = subtotal + vatAmount

  async function createInvoice() {
    setErr('')
    if (multiClient) { setErr('Please select bookings for one client only'); return }
    setCreating(true)

    const clientName = clients[0]
    const invNo      = await nextInvoiceNo(entityId)

    // Create invoice header
    const { data: inv, error: invErr } = await supabase.from('invoices').insert({
      entity_id:     entityId,
      invoice_number: invNo,
      customer_name:  clientName,
      issue_date:     invoiceDate,
      due_date:       dueDate,
      subtotal:       subtotal,
      vat_rate:       vatRate,
      vat_amount:     vatAmount,
      total_amount:   totalAmount,
      status:         'DRAFT',
      notes:          notes || null,
      invoice_type:   'STANDARD',
    }).select('id').single()

    if (invErr) { setErr(invErr.message); setCreating(false); return }
    const invoiceId = inv.id

    // Create line items — one per booking
    const lineItems = selected.map((r, i) => ({
      invoice_id:   invoiceId,
      line_number:  i + 1,
      description:  [
        r.service_type,
        r.traveler_name,
        r.destination,
        r.travel_date ? `(${fmt(r.travel_date)})` : '',
        r.ticket_no   ? `Ref: ${r.ticket_no}`     : '',
        r.booking_ref ? `Bkg: ${r.booking_ref}`   : '',
      ].filter(Boolean).join(' — '),
      quantity:     +r.pax_count || 1,
      unit_price:   +(+r.sale_amount / (+r.pax_count || 1)).toFixed(2),
      vat_rate:     vatRate,
      vat_amount:   +(+r.sale_amount * (vatRate / 100)).toFixed(2),
      total_amount: +(+r.sale_amount * (1 + vatRate / 100)).toFixed(2),
    }))

    const { error: itemsErr } = await supabase.from('invoice_lines').insert(lineItems)
    if (itemsErr) { setErr(itemsErr.message); setCreating(false); return }

    // Mark trip_records as billed
    const ids = selected.map(r => r.id)
    await supabase.from('trip_records').update({
      invoice_id:  invoiceId,
      invoiced_at: new Date().toISOString(),
    }).in('id', ids)

    setCreating(false)
    onCreated(invNo, invoiceId)
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={S.modal}>

        <div style={{ fontWeight:800, fontSize:17, color:'#1a2e3d', marginBottom:4 }}>
          🧾 Create Invoice from Bookings
        </div>
        <div style={{ fontSize:12, color:'#6b7c93', marginBottom:16 }}>
          {selected.length} booking{selected.length !== 1 ? 's' : ''} selected
          {multiClient && <span style={{ color:'#c62828', fontWeight:700 }}> · ⚠️ Multiple clients — select one client only</span>}
        </div>

        {/* Client + dates */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:14 }}>
          <div>
            <label style={S.lbl}>Client</label>
            <div style={{ ...S.inp, background:'#f8fafc', fontWeight:700 }}>
              {multiClient ? <span style={{ color:'#c62828' }}>⚠ Multiple clients</span> : clients[0]}
            </div>
          </div>
          <div>
            <label style={S.lbl}>Invoice Date</label>
            <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} style={{ ...S.inp, width:'100%' }} />
          </div>
          <div>
            <label style={S.lbl}>Due Date</label>
            <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ ...S.inp, width:'100%' }} />
          </div>
        </div>

        {/* VAT rate */}
        <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:14 }}>
          <label style={{ ...S.lbl, marginBottom:0 }}>VAT Rate:</label>
          <select value={vatRate} onChange={e => setVatRate(+e.target.value)} style={{ ...S.inp, width:100 }}>
            <option value={15}>15% (Standard)</option>
            <option value={0}>0% (Exempt)</option>
          </select>
        </div>

        {/* Line items preview */}
        <div style={{ border:'1px solid #e8edf2', borderRadius:10, overflow:'hidden', marginBottom:14 }}>
          <div style={{ background:'#f8fafc', padding:'8px 12px', fontWeight:700, fontSize:11, color:'#546e7a', display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:8 }}>
            <span>DESCRIPTION</span><span>QTY</span><span>AMOUNT</span><span>VAT</span>
          </div>
          <div style={{ maxHeight:260, overflowY:'auto' }}>
            {selected.map((r, i) => (
              <div key={r.id} style={{
                padding:'8px 12px', borderTop:'1px solid #f0f4f8', fontSize:11,
                display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:8, alignItems:'center',
              }}>
                <div>
                  <span style={{ fontWeight:700, color: SERVICE_COLORS[r.service_type] || '#1a2e3d' }}>{r.service_type}</span>
                  {r.traveler_name && <span style={{ color:'#546e7a' }}> · {r.traveler_name}</span>}
                  {r.destination   && <span style={{ color:'#546e7a' }}> → {r.destination}</span>}
                  {r.travel_date   && <span style={{ color:'#aab2bd' }}> ({fmt(r.travel_date)})</span>}
                  <div style={{ fontSize:10, color:'#aab2bd', marginTop:1 }}>
                    {r.booking_ref}{r.ticket_no ? ` · ${r.ticket_no}` : ''}
                  </div>
                </div>
                <span style={{ textAlign:'right', color:'#546e7a' }}>{r.pax_count || 1}</span>
                <span style={{ textAlign:'right', fontWeight:700 }}>SAR {(+r.sale_amount || 0).toFixed(2)}</span>
                <span style={{ textAlign:'right', color:'#2e7d32' }}>
                  SAR {((+r.sale_amount || 0) * vatRate / 100).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div style={{ background:'#f8fafc', borderRadius:10, padding:'12px 16px', marginBottom:14 }}>
          {[
            ['Subtotal (excl. VAT)', subtotal],
            [`VAT ${vatRate}%`, vatAmount],
          ].map(([l, v]) => (
            <div key={l} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'3px 0', color:'#546e7a' }}>
              <span>{l}</span><span>{SAR(v)}</span>
            </div>
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:16, fontWeight:800, color:'#1a2e3d', paddingTop:8, borderTop:'2px solid #e0e7ef', marginTop:6 }}>
            <span>Total</span><span>{SAR(totalAmount)}</span>
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom:16 }}>
          <label style={S.lbl}>Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            style={{ ...S.inp, width:'100%', height:60, resize:'vertical' }}
            placeholder="Additional notes for the invoice…" />
        </div>

        {err && <div style={{ color:'#c62828', fontSize:12, marginBottom:10 }}>⚠ {err}</div>}

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button style={S.btnOut()} onClick={onClose}>Cancel</button>
          <button style={S.btn('#2e7d32')} onClick={createInvoice} disabled={creating || multiClient}>
            {creating ? 'Creating Invoice…' : `✓ Create Invoice — ${SAR(totalAmount)}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────
const PAGE = 100

export default function BookingRegister({ entityId, entityCode }) {
  const [bookings,  setBookings]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [selected,  setSelected]  = useState(new Set())
  const [showInv,   setShowInv]   = useState(false)
  const [tab,       setTab]       = useState('all')     // all | unbilled | billed
  const [page,      setPage]      = useState(0)
  const [total,     setTotal]     = useState(0)
  const [flash,     setFlash]     = useState(null)
  const [detailRow, setDetailRow] = useState(null)

  const [filters, setFilters] = useState({
    search:      '',
    service:     '',
    dateFrom:    '',
    dateTo:      '',
    status:      '',
    importDate:  '',
  })

  useEffect(() => { if (entityId) { setSelected(new Set()); loadBookings() } }, [entityId, tab, filters, page])

  async function loadBookings() {
    setLoading(true)

    let q = supabase
      .from('trip_records')
      .select('*', { count:'exact' })
      .eq('entity_id', entityId)
      .order('travel_date', { ascending: false })
      .range(page * PAGE, (page + 1) * PAGE - 1)

    if (tab === 'unbilled') q = q.is('invoiced_at', null).eq('status', 'CONFIRMED')
    if (tab === 'billed')   q = q.not('invoiced_at', 'is', null)

    if (filters.search)     q = q.or(`client_name.ilike.%${filters.search}%,booking_ref.ilike.%${filters.search}%,traveler_name.ilike.%${filters.search}%,ticket_no.ilike.%${filters.search}%`)
    if (filters.service)    q = q.eq('service_type', filters.service)
    if (filters.status)     q = q.eq('status', filters.status)
    if (filters.dateFrom)   q = q.gte('travel_date', filters.dateFrom)
    if (filters.dateTo)     q = q.lte('travel_date', filters.dateTo)
    if (filters.importDate) q = q.eq('import_date', filters.importDate)

    const { data, count, error } = await q
    if (error) console.error(error)
    setBookings(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  function setF(k, v) { setFilters(p => ({ ...p, [k]: v })); setPage(0); setSelected(new Set()) }
  function clearF()   { setFilters({ search:'', service:'', dateFrom:'', dateTo:'', status:'', importDate:'' }); setPage(0) }

  function toggleRow(id) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleAll() {
    const eligible = bookings.filter(r => !r.invoiced_at && r.status === 'CONFIRMED')
    if (selected.size === eligible.length && eligible.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(eligible.map(r => r.id)))
    }
  }

  const selectedRows  = bookings.filter(r => selected.has(r.id))
  const selSubtotal   = selectedRows.reduce((s, r) => s + (+r.sale_amount || 0), 0)
  const selCost       = selectedRows.reduce((s, r) => s + (+r.cost_amount  || 0), 0)
  const selProfit     = selSubtotal - selCost

  // KPIs from current filter result — summary from all (no pagination limit)
  const totalSale   = bookings.reduce((s, r) => s + (+r.sale_amount || 0), 0)
  const totalCost   = bookings.reduce((s, r) => s + (+r.cost_amount  || 0), 0)
  const unbilledCnt = bookings.filter(r => !r.invoiced_at && r.status === 'CONFIRMED').length

  function onInvoiceCreated(invNo, invId) {
    setShowInv(false)
    setSelected(new Set())
    setFlash(`✅ Invoice ${invNo} created successfully!`)
    setTimeout(() => setFlash(null), 5000)
    loadBookings()
  }

  function exportCSV() {
    const rows = bookings
    const headers = ['Booking Ref','Client','Traveler','Service','Destination','Travel Date','Return Date','Pax','Ticket No','Supplier','Cost','Sale','Profit','Status','Invoice']
    const lines = [
      headers.join(','),
      ...rows.map(r => [
        r.booking_ref, r.client_name, r.traveler_name, r.service_type, r.destination,
        r.travel_date, r.return_date, r.pax_count, r.ticket_no, r.supplier,
        r.cost_amount, r.sale_amount, ((+r.sale_amount||0)-(+r.cost_amount||0)).toFixed(2),
        r.status, r.invoiced_at ? 'Billed' : 'Unbilled',
      ].map(v => `"${v || ''}"`.replace(/"/g, '""')).join(','))
    ]
    const blob = new Blob([lines.join('\n')], { type:'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `bookings-${entityCode}-${today()}.csv`
    a.click()
  }

  const TABS = [
    { key:'all',     label:'All Bookings' },
    { key:'unbilled',label:'🟡 Unbilled' },
    { key:'billed',  label:'✅ Billed'   },
  ]

  return (
    <div>
      <div style={{ fontSize:12, color:'#6b7c93', marginBottom:18 }}>
        All imported bookings — select unbilled records to generate invoices
      </div>

      {flash && (
        <div style={{ background:'#e8f5e9', border:'1px solid #a5d6a7', borderRadius:10, padding:'12px 16px', marginBottom:14, fontSize:13, fontWeight:700, color:'#2e7d32' }}>
          {flash}
        </div>
      )}

      {/* KPI row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(140px,1fr))', gap:10, marginBottom:16 }}>
        {[
          { label:'Total Bookings (page)',  value: bookings.length.toLocaleString(), color:'#1a2e3d' },
          { label:'Unbilled (page)',        value: unbilledCnt.toLocaleString(),     color:'#f57c00' },
          { label:'Total Revenue',          value: SAR(totalSale),                   color:'#2e7d32' },
          { label:'Total Cost',             value: SAR(totalCost),                   color:'#c62828' },
          { label:'Margin',                 value: SAR(totalSale - totalCost),       color:'#1565C0' },
        ].map(k => (
          <div key={k.label} style={{ background:'#fff', borderRadius:12, padding:'12px 14px', boxShadow:'0 1px 6px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize:11, color:'#6b7c93', marginBottom:3 }}>{k.label}</div>
            <div style={{ fontWeight:800, fontSize:14, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:14, borderBottom:'2px solid #f0f4f8' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setPage(0); setSelected(new Set()) }} style={{
            padding:'8px 18px', border:'none', borderRadius:'8px 8px 0 0', cursor:'pointer', fontWeight:700, fontSize:12,
            background: tab === t.key ? '#1a2e3d' : 'transparent',
            color:      tab === t.key ? '#fff'    : '#6b7c93',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12, alignItems:'center' }}>
        <input
          placeholder="Search ref / client / traveler / ticket…"
          value={filters.search}
          onChange={e => setF('search', e.target.value)}
          style={{ ...S.inp, width:260 }}
        />
        <select value={filters.service} onChange={e => setF('service', e.target.value)} style={S.inp}>
          <option value="">All Services</option>
          {['Air','Hotel','Transfer','Visa','Insurance','Package','Rail'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={filters.status} onChange={e => setF('status', e.target.value)} style={S.inp}>
          <option value="">All Statuses</option>
          {['CONFIRMED','CANCELLED','REFUNDED','AMENDED','PENDING'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input type="date" value={filters.dateFrom} onChange={e => setF('dateFrom', e.target.value)} style={S.inp} title="Travel date from" />
        <input type="date" value={filters.dateTo}   onChange={e => setF('dateTo', e.target.value)}   style={S.inp} title="Travel date to" />
        <input type="date" value={filters.importDate} onChange={e => setF('importDate', e.target.value)} style={S.inp} title="Import date" />
        <button style={S.btnOut('#78909c')} onClick={clearF}>Clear</button>
        <button style={S.btnOut('#546e7a')} onClick={exportCSV}>⬇ CSV</button>
      </div>

      {/* Selection action bar */}
      {selected.size > 0 && (
        <div style={{
          background:'#1a2e3d', borderRadius:10, padding:'12px 16px', marginBottom:12,
          display:'flex', alignItems:'center', gap:16, flexWrap:'wrap',
        }}>
          <div style={{ color:'#fff', fontWeight:700, fontSize:13, flex:1 }}>
            {selected.size} booking{selected.size !== 1 ? 's' : ''} selected
            <span style={{ marginLeft:12, color:'rgba(255,255,255,0.6)', fontSize:12 }}>
              Sale {SAR(selSubtotal)} · Cost {SAR(selCost)} · Margin {SAR(selProfit)} ({selSubtotal > 0 ? ((selProfit/selSubtotal)*100).toFixed(1) : 0}%)
            </span>
          </div>
          <button style={S.btnOut('rgba(255,255,255,0.6)')} onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
          <button style={{ ...S.btn('#2e7d32'), fontSize:13, padding:'9px 20px' }} onClick={() => setShowInv(true)}>
            🧾 Create Invoice — {SAR(selSubtotal * 1.15)}
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#6b7c93' }}>Loading bookings…</div>
      ) : bookings.length === 0 ? (
        <div style={{ ...S.card, textAlign:'center', padding:60, color:'#aab2bd' }}>
          <div style={{ fontSize:36, marginBottom:10 }}>✈️</div>
          <div style={{ fontWeight:700 }}>No bookings found</div>
          <div style={{ fontSize:12, marginTop:6 }}>Use Data Import → Daily Booking Import to upload CSV files</div>
        </div>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'#f0f4f8', position:'sticky', top:0, zIndex:10 }}>
                <th style={{ padding:'10px 12px', width:32 }}>
                  <input type="checkbox"
                    checked={selected.size > 0 && selected.size === bookings.filter(r => !r.invoiced_at && r.status === 'CONFIRMED').length}
                    onChange={toggleAll}
                  />
                </th>
                {['Booking Ref','Client','Traveler','Service','Destination','Travel Date','Pax','Cost','Sale','Margin','Status','Invoice'].map(h => (
                  <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontWeight:700, color:'#546e7a', fontSize:10, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings.map((row, i) => {
                const isBilled   = !!row.invoiced_at
                const canSelect  = !isBilled && row.status === 'CONFIRMED'
                const isSelected = selected.has(row.id)
                const margin     = (+row.sale_amount || 0) - (+row.cost_amount || 0)
                const stColor    = STATUS_COLORS[row.status] || STATUS_COLORS.PENDING

                return (
                  <tr key={row.id}
                    onClick={() => canSelect && toggleRow(row.id)}
                    style={{
                      borderBottom:'1px solid #f5f5f5',
                      background: isSelected ? '#e3f2fd' : isBilled ? '#f9fff9' : i % 2 === 0 ? '#fff' : '#fafbfc',
                      cursor: canSelect ? 'pointer' : 'default',
                    }}
                  >
                    <td style={{ padding:'9px 12px' }}>
                      {canSelect && (
                        <input type="checkbox" checked={isSelected}
                          onChange={() => toggleRow(row.id)}
                          onClick={e => e.stopPropagation()}
                        />
                      )}
                    </td>
                    <td style={{ padding:'9px 12px', fontWeight:700, fontFamily:'monospace', fontSize:10, color:'#1565C0', whiteSpace:'nowrap' }}>
                      {row.booking_ref}
                    </td>
                    <td style={{ padding:'9px 12px', fontWeight:700, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {row.client_name || '—'}
                    </td>
                    <td style={{ padding:'9px 12px', color:'#546e7a', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {row.traveler_name || '—'}
                    </td>
                    <td style={{ padding:'9px 12px' }}>
                      {row.service_type ? (
                        <span style={{
                          background:`${SERVICE_COLORS[row.service_type] || '#546e7a'}15`,
                          color: SERVICE_COLORS[row.service_type] || '#546e7a',
                          padding:'2px 8px', borderRadius:6, fontWeight:700, fontSize:10,
                        }}>{row.service_type}</span>
                      ) : '—'}
                    </td>
                    <td style={{ padding:'9px 12px', color:'#546e7a', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                      {row.destination || '—'}
                    </td>
                    <td style={{ padding:'9px 12px', whiteSpace:'nowrap', color:'#546e7a' }}>{fmt(row.travel_date)}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color:'#546e7a' }}>{row.pax_count || 1}</td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color:'#546e7a' }}>
                      {(+row.cost_amount || 0).toFixed(0)}
                    </td>
                    <td style={{ padding:'9px 12px', textAlign:'right', fontWeight:700 }}>
                      {(+row.sale_amount || 0).toFixed(0)}
                    </td>
                    <td style={{ padding:'9px 12px', textAlign:'right', color: margin >= 0 ? '#2e7d32' : '#c62828', fontWeight:700 }}>
                      {margin.toFixed(0)}
                    </td>
                    <td style={{ padding:'9px 12px' }}>
                      <span style={{ background: stColor.bg, color: stColor.text, padding:'2px 8px', borderRadius:6, fontWeight:700, fontSize:10 }}>
                        {row.status}
                      </span>
                    </td>
                    <td style={{ padding:'9px 12px', whiteSpace:'nowrap' }}>
                      {isBilled ? (
                        <span style={{ color:'#2e7d32', fontWeight:700, fontSize:11 }}>✅ Billed</span>
                      ) : (
                        <span style={{ color:'#aab2bd', fontSize:11 }}>Unbilled</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && (
        <div style={{ display:'flex', gap:8, justifyContent:'space-between', alignItems:'center', marginTop:12, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, color:'#6b7c93' }}>
            Showing {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} of {total.toLocaleString()} bookings
          </span>
          <div style={{ display:'flex', gap:8 }}>
            {page > 0 && <button style={S.btnOut()} onClick={() => setPage(p => p - 1)}>← Prev</button>}
            {(page + 1) * PAGE < total && <button style={S.btn()} onClick={() => setPage(p => p + 1)}>Next →</button>}
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailRow && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setDetailRow(null)}>
          <div style={{ ...S.modal, width:500 }}>
            <div style={{ fontWeight:800, fontSize:16, marginBottom:14 }}>
              Booking: {detailRow.booking_ref}
            </div>
            {Object.entries(detailRow).filter(([k]) => !['id','entity_id','import_session_id','raw_data'].includes(k)).map(([k,v]) => (
              <div key={k} style={{ display:'flex', gap:10, padding:'5px 0', borderBottom:'1px solid #f5f5f5', fontSize:12 }}>
                <span style={{ color:'#6b7c93', width:160, flexShrink:0, fontFamily:'monospace', fontSize:10 }}>{k}</span>
                <span style={{ fontWeight:v && ['sale_amount','cost_amount'].includes(k) ? 700 : 400 }}>
                  {v != null ? String(v) : '—'}
                </span>
              </div>
            ))}
            <div style={{ textAlign:'right', marginTop:14 }}>
              <button style={S.btn()} onClick={() => setDetailRow(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice creation modal */}
      {showInv && selectedRows.length > 0 && (
        <InvoiceModal
          selected={selectedRows}
          entityId={entityId}
          entityCode={entityCode}
          onClose={() => setShowInv(false)}
          onCreated={onInvoiceCreated}
        />
      )}
    </div>
  )
}
