import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'
const MC = GROUP_COLORS.Finance
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { postReceiptJE } from '../lib/autoPost'

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.52)', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'20px 10px', overflowY:'auto' },
  modal:   { background:'#fff', borderRadius:16, width:840, maxWidth:'96vw', boxShadow:'0 8px 40px rgba(0,0,0,0.2)', marginTop:'auto', marginBottom:'auto', overflow:'hidden' },
  inp:     { width:'100%', padding:'8px 11px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box' },
  label:   { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4, textTransform:'uppercase', letterSpacing:0.4 },
  row:     { display:'flex', gap:12, marginBottom:14 },
  col:     { flex:1 },
  btn:     (bg, fg='#fff') => ({ background:bg, color:fg, border:'none', borderRadius:9, padding:'9px 20px', cursor:'pointer', fontSize:13, fontWeight:700 }),
  section: { background:'#f8faff', border:'1.5px solid #e8edf5', borderRadius:10, padding:'14px 16px', marginBottom:14 },
  sHead:   { fontSize:11, fontWeight:800, textTransform:'uppercase', letterSpacing:0.8, marginBottom:10 },
  th:      { padding:'9px 10px', textAlign:'left', fontSize:10, fontWeight:800, textTransform:'uppercase', letterSpacing:0.4, background:MC, color:'#fff', borderBottom:'2px solid #e8edf2', whiteSpace:'nowrap' },
  td:      { padding:'9px 10px', fontSize:12, color:'#2d3a45', borderBottom:'1px solid #f0f4f8', verticalAlign:'middle' },
}

function fmt(n) {
  return new Intl.NumberFormat('en-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0)
}

const PAYMENT_MODES = [
  { value:'BANK_TRANSFER',       label:'Bank Transfer' },
  { value:'CHEQUE',              label:'Cheque' },
  { value:'INVOICE_DISCOUNTING', label:'Invoice Discounting (Nokia/Citibank SCF)' },
  { value:'CASH',                label:'Cash' },
]

const EMPTY_RECEIPT = {
  receipt_date: new Date().toISOString().split('T')[0],
  customer_id: '', customer_name: '',
  gross_amount: '', payment_mode: 'BANK_TRANSFER',
  bank_reference: '', bank_account: '',
  discounting_charge: '0', net_received: '',
  notes: '',
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PaymentReceipts({ entityId, entityName, entityNameEn, entityVatNumber }) {
  const [receipts,      setReceipts]      = useState([])
  const [contractors,   setContractors]   = useState([])
  const [openInvoices,  setOpenInvoices]  = useState([])  // unpaid invoices for selected customer
  const [allocations,   setAllocations]   = useState([])  // { invoice_id, invoice_number, amount_allocated }
  const [loading,       setLoading]       = useState(true)
  const [showBanner,    setShowBanner]    = useState(false)
  const [open,          setOpen]          = useState(false)
  const [wizardStep,    setWizardStep]    = useState(1)
  const [saving,        setSaving]        = useState(false)
  const [form,          setForm]          = useState(EMPTY_RECEIPT)
  const [viewReceipt,   setViewReceipt]   = useState(null)
  const [searchStr,     setSearchStr]     = useState('')
  const [filterMode,    setFilterMode]    = useState('ALL')
  const [dateFrom,      setDateFrom]      = useState('')
  const [dateTo,        setDateTo]        = useState('')
  // Re-allocate POSTED receipts
  const [allocModal,    setAllocModal]    = useState(null)   // receipt being re-allocated
  const [allocLines,    setAllocLines]    = useState([])     // invoice rows with amount inputs
  const [allocSaving,   setAllocSaving]  = useState(false)
  const [expandedRecRows, setExpandedRecRows] = useState(new Set())

  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const [{ data: recs }, { data: cons }] = await Promise.all([
      supabase.from('payment_receipts')
        .select('*, payment_allocations(*)')
        .eq('entity_id', entityId)
        .order('receipt_date', { ascending:false }),
      supabase.from('contractors')
        .select('id,contractor_name,contractor_code,vendor_type')
        .eq('entity_id', entityId)
        .eq('status','ACTIVE')
        .order('contractor_name'),
    ])
    setReceipts(recs || [])
    setContractors(cons || [])
    setLoading(false)
  }

  async function onCustomerChange(cId) {
    setForm(f => ({ ...f, customer_id: cId, customer_name: '' }))
    setAllocations([])
    if (!cId) { setOpenInvoices([]); return }

    // Load outstanding invoices for this customer
    const { data } = await supabase.from('invoices')
      .select('id,invoice_number,invoice_date,total_amount,net_payable,retention_amount,po_number,status')
      .eq('entity_id', entityId)
      .eq('contractor_id', cId)
      .in('status', ['ISSUED'])
      .order('invoice_date', { ascending:true })
    setOpenInvoices(data || [])

    if (!data || data.length === 0) return

    // Load ALL existing allocations for these invoices to compute balance due
    const invoiceIds = data.map(i => i.id)
    const { data: existingAllocs } = await supabase
      .from('payment_allocations')
      .select('invoice_id, amount_allocated')
      .in('invoice_id', invoiceIds)

    // Sum prior payments per invoice
    const paidMap = {}
    ;(existingAllocs || []).forEach(a => {
      paidMap[a.invoice_id] = (paidMap[a.invoice_id] || 0) + (a.amount_allocated || 0)
    })

    setAllocations(data.map(inv => {
      const netPayable  = inv.net_payable || inv.total_amount || 0
      const alreadyPaid = paidMap[inv.id] || 0
      const balanceDue  = Math.max(0, netPayable - alreadyPaid)
      return {
        invoice_id:       inv.id,
        invoice_number:   inv.invoice_number,
        invoice_date:     inv.invoice_date,
        po_number:        inv.po_number || '—',
        net_payable:      netPayable,
        already_paid:     alreadyPaid,
        balance_due:      balanceDue,
        amount_allocated: '',
        checked:          false,
      }
    }))
  }

  // Auto-calculate net_received when gross or discounting changes
  function handleGrossChange(val) {
    const gross = parseFloat(val) || 0
    const disc  = parseFloat(form.discounting_charge) || 0
    setForm(f => ({ ...f, gross_amount: val, net_received: String((gross - disc).toFixed(2)) }))
  }
  function handleDiscountingChange(val) {
    const gross = parseFloat(form.gross_amount) || 0
    const disc  = parseFloat(val) || 0
    setForm(f => ({ ...f, discounting_charge: val, net_received: String((gross - disc).toFixed(2)) }))
  }

  function toggleAllocation(idx) {
    setAllocations(prev => {
      const nowChecked = !prev[idx].checked
      const alreadyAllocated = prev.reduce((s,a,i) => i===idx ? s : s+(parseFloat(a.amount_allocated)||0), 0)
      const remaining = Math.max(0, (parseFloat(form.gross_amount)||0) - alreadyAllocated)
      return prev.map((a, i) => {
        if (i !== idx) return a
        if (nowChecked) {
          const suggested = Math.min(a.balance_due, remaining)
          return { ...a, checked: true, amount_allocated: suggested > 0 ? String(suggested.toFixed(2)) : '' }
        }
        return { ...a, checked: false, amount_allocated: '' }
      })
    })
  }

  const totalAllocated = allocations.reduce((s,a) => s + (parseFloat(a.amount_allocated)||0), 0)
  const grossAmount    = parseFloat(form.gross_amount) || 0
  const unallocated    = grossAmount - totalAllocated

  // ── Save receipt ──────────────────────────────────────────────────
  async function saveReceipt() {
    if (!form.customer_id) { alert('Select a customer'); return }
    if (!form.gross_amount || parseFloat(form.gross_amount) <= 0) { alert('Enter a valid gross amount'); return }

    // Guard: over-allocation check
    if (totalAllocated > (parseFloat(form.gross_amount)||0) + 0.01) {
      alert(`Over-allocation: you have allocated SAR ${fmt(totalAllocated)} but the gross amount is only SAR ${fmt(parseFloat(form.gross_amount)||0)}. Please reduce allocations.`)
      return
    }

    const allocsToSave = allocations.filter(a => parseFloat(a.amount_allocated) > 0)
    if (allocsToSave.length === 0 && openInvoices.length > 0) {
      if (!window.confirm('No invoice allocations entered. Save as unallocated?')) return
    }
    setSaving(true)

    // Auto-generate receipt number: REC-YYYY-NNNNN
    const year = new Date().getFullYear()
    const { count } = await supabase.from('payment_receipts').select('*', { count:'exact', head:true }).eq('entity_id', entityId)
    const seq = String((count||0) + 1).padStart(4, '0')
    const receiptNumber = `REC-${year}-${seq}`

    const gross = parseFloat(form.gross_amount) || 0
    const disc  = parseFloat(form.discounting_charge) || 0
    const net   = gross - disc
    const allocated = totalAllocated
    const unalloc   = gross - allocated
    const status    = unalloc <= 0.01 ? 'FULLY_ALLOCATED' : 'POSTED'

    const contractor = contractors.find(c => c.id === form.customer_id)

    const { data: rec, error } = await supabase.from('payment_receipts').insert({
      entity_id:          entityId,
      receipt_number:     receiptNumber,
      receipt_date:       form.receipt_date,
      contractor_id:      form.customer_id,
      customer_name:      contractor?.contractor_name || '',
      gross_amount:       gross,
      payment_mode:       form.payment_mode,
      bank_reference:     form.bank_reference || null,
      bank_account:       form.bank_account || null,
      discounting_charge: disc,
      net_received:       net,
      allocated_amount:   allocated,
      unallocated_amount: Math.max(0, unalloc),
      notes:              form.notes || null,
      status,
    }).select().single()

    if (error) { alert(error.message); setSaving(false); return }

    // Save allocations
    if (rec?.id && allocsToSave.length > 0) {
      await supabase.from('payment_allocations').insert(
        allocsToSave.map(a => ({
          receipt_id:       rec.id,
          invoice_id:       a.invoice_id,
          invoice_number:   a.invoice_number,
          amount_allocated: parseFloat(a.amount_allocated),
        }))
      )
      // Mark fully-paid invoices — sum ALL allocations across ALL receipts
      for (const a of allocsToSave) {
        const inv = openInvoices.find(i => i.id === a.invoice_id)
        if (!inv) continue
        const netP = inv.net_payable || inv.total_amount || 0
        // Query total paid to this invoice (includes the allocation we just inserted)
        const { data: allAllocs } = await supabase
          .from('payment_allocations')
          .select('amount_allocated')
          .eq('invoice_id', inv.id)
        const totalPaid = (allAllocs || []).reduce((s, p) => s + (p.amount_allocated || 0), 0)
        if (totalPaid >= netP - 0.02) {
          await supabase.from('invoices').update({ status: 'PAID' }).eq('id', inv.id)
        }
      }
    }

    // Auto-post journal entry for this receipt
    if (rec?.id) {
      // Map bank account selection to COA code
      const bankCoaMap = {
        '1110': '1110', 'ANB-15': '1110', 'ANB Main': '1110',
        '1120': '1120', 'ANB-39': '1120', 'ANB Contra 39': '1120',
        '1130': '1130', 'ANB-77': '1130', 'ANB Contra 77': '1130',
        'CASH': '1140', 'Petty Cash': '1140',
      }
      const bankCode = bankCoaMap[form.bank_account] || '1110'
      postReceiptJE({ entityId, receipt: rec, bankAccountCode: bankCode })
        .catch(e => console.error('autoPost receipt JE failed:', e))
    }

    setSaving(false)
    setOpen(false)
    resetForm()
    load()
  }

  function resetForm() {
    setForm(EMPTY_RECEIPT)
    setOpenInvoices([])
    setAllocations([])
    setWizardStep(1)
  }

  // ── Re-allocate POSTED receipt ────────────────────────────────────
  async function openAllocModal(rec) {
    setAllocModal(rec)
    // Load invoices for this contractor
    const { data: invs } = await supabase.from('invoices')
      .select('id,invoice_number,invoice_date,net_payable,total_amount')
      .eq('entity_id', entityId).eq('contractor_id', rec.contractor_id)
      .in('status', ['ISSUED']).order('invoice_date', { ascending:true })
    // Load existing allocations for these invoices
    const invIds = (invs||[]).map(i => i.id)
    let allocMap = {}
    if (invIds.length > 0) {
      const { data: existAllocs } = await supabase.from('payment_allocations')
        .select('invoice_id, amount_allocated').in('invoice_id', invIds)
      ;(existAllocs||[]).forEach(a => { allocMap[a.invoice_id] = (allocMap[a.invoice_id]||0) + a.amount_allocated })
    }
    const remaining = Math.max(0, (rec.unallocated_amount||0))
    setAllocLines((invs||[]).map(inv => ({
      invoice_id: inv.id, invoice_number: inv.invoice_number, invoice_date: inv.invoice_date,
      net_payable: inv.net_payable || inv.total_amount || 0,
      already_paid: allocMap[inv.id]||0,
      balance_due: Math.max(0, (inv.net_payable||inv.total_amount||0) - (allocMap[inv.id]||0)),
      amount_allocated: '',
    })))
  }

  async function saveReAlloc() {
    if (!allocModal) return
    const lines = allocLines.filter(l => parseFloat(l.amount_allocated) > 0)
    if (lines.length === 0) { alert('Enter at least one allocation amount'); return }
    const totalNew = lines.reduce((s,l) => s + (parseFloat(l.amount_allocated)||0), 0)
    const avail    = allocModal.unallocated_amount || 0
    if (totalNew > avail + 0.01) {
      alert(`Cannot allocate SAR ${fmt(totalNew)} — only SAR ${fmt(avail)} is unallocated on this receipt.`)
      return
    }
    setAllocSaving(true)
    await supabase.from('payment_allocations').insert(lines.map(l => ({
      receipt_id: allocModal.id, invoice_id: l.invoice_id,
      invoice_number: l.invoice_number, amount_allocated: parseFloat(l.amount_allocated),
    })))
    const newAllocated    = (allocModal.allocated_amount||0) + totalNew
    const newUnallocated  = Math.max(0, (allocModal.unallocated_amount||0) - totalNew)
    const newStatus       = newUnallocated <= 0.01 ? 'FULLY_ALLOCATED' : 'POSTED'
    await supabase.from('payment_receipts').update({
      allocated_amount: newAllocated, unallocated_amount: newUnallocated, status: newStatus,
    }).eq('id', allocModal.id)
    // Mark fully-paid invoices
    for (const l of lines) {
      const inv = allocLines.find(x => x.invoice_id === l.invoice_id)
      if (!inv) continue
      const { data: allAllocs } = await supabase.from('payment_allocations')
        .select('amount_allocated').eq('invoice_id', l.invoice_id)
      const total = (allAllocs||[]).reduce((s,a) => s+(a.amount_allocated||0), 0)
      if (total >= inv.net_payable - 0.02) {
        await supabase.from('invoices').update({ status:'PAID' }).eq('id', l.invoice_id)
      }
    }
    setAllocSaving(false)
    setAllocModal(null)
    setAllocLines([])
    load()
  }

  // ── Filters ───────────────────────────────────────────────────────
  const filtered = receipts.filter(r => {
    if (filterMode !== 'ALL' && r.status !== filterMode) return false
    if (dateFrom && r.receipt_date < dateFrom) return false
    if (dateTo   && r.receipt_date > dateTo)   return false
    if (searchStr) {
      const q = searchStr.toLowerCase()
      return (r.customer_name||'').toLowerCase().includes(q) ||
             (r.bank_reference||'').toLowerCase().includes(q) ||
             (r.receipt_number||'').toLowerCase().includes(q)
    }
    return true
  })

  const totalGross     = filtered.reduce((s,r) => s+(r.gross_amount||0), 0)
  const totalDiscount  = filtered.reduce((s,r) => s+(r.discounting_charge||0), 0)
  const totalAllocFilt = filtered.reduce((s,r) => s+(r.allocated_amount||0), 0)

  return (
    <ChapterPage
      chapterName="Finance"
      chapterIcon="💳"
      chapterColor={MC}
      sectionTitle="Payment Receipts"
      onNew={() => { resetForm(); setShowBanner(true) }}
      newLabel="+ Record Receipt"
      filters={['ALL','POSTED','FULLY_ALLOCATED','VOIDED']}
      activeFilter={filterMode}
      onFilter={setFilterMode}
      searchValue={searchStr}
      onSearch={setSearchStr}
      searchPlaceholder="Search receipt#, customer…"
      kpis={[
        { label:'Receipts',    value:filtered.length },
        { label:'Gross',       value:`SAR ${fmt(totalGross)}` },
        { label:'Discounting', value:`SAR ${fmt(totalDiscount)}` },
        { label:'Allocated',   value:`SAR ${fmt(totalAllocFilt)}` },
      ]}
    >
      {/* ── Extra filters (date range) ── */}
      <div style={{ display:'flex', gap:8, marginBottom:10, alignItems:'center' }}>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
          style={{ padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12 }} title="From date" />
        <span style={{ color:'#94a3b8', fontSize:12 }}>–</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
          style={{ padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12 }} title="To date" />
        {(dateFrom||dateTo) && <button onClick={()=>{setDateFrom('');setDateTo('')}} style={{ background:'#f0f4f8', border:'none', borderRadius:7, padding:'7px 10px', cursor:'pointer', fontSize:11, color:'#888' }}>✕</button>}
      </div>

      {/* ── Receipt List — sticky header, collapsible detail ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#fff', borderRadius:14, boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
        {loading ? <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>Loading...</div> : (
          <div style={{ flex:1, overflow:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:MC, position:'sticky', top:0, zIndex:2 }}>
                  {[
                    { h:'Receipt #',  w:'16%', align:'left'  },
                    { h:'Date',       w:'10%', align:'left'  },
                    { h:'Customer',   w:'28%', align:'left'  },
                    { h:'Mode',       w:'12%', align:'left'  },
                    { h:'Gross',      w:'12%', align:'right' },
                    { h:'Status',     w:'12%', align:'left'  },
                    { h:'Details',    w:'10%', align:'center'},
                  ].map(col=>(
                    <th key={col.h} style={{ padding:'10px 10px', textAlign:col.align, fontSize:10, color:'#fff', fontWeight:800, whiteSpace:'nowrap', width:col.w }}>{col.h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0
                  ? <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No payment receipts yet</td></tr>
                  : filtered.map((rec, i) => {
                    const modeLabel = PAYMENT_MODES.find(m=>m.value===rec.payment_mode)?.label || rec.payment_mode
                    const isDisc = rec.payment_mode === 'INVOICE_DISCOUNTING'
                    const isExp  = expandedRecRows.has(rec.id)
                    const toggleRec = () => setExpandedRecRows(prev => {
                      const next = new Set(prev); isExp ? next.delete(rec.id) : next.add(rec.id); return next
                    })
                    const statusBg = rec.status==='FULLY_ALLOCATED'?'#e8f5e9':rec.status==='POSTED'?'#fff3e0':'#ffebee'
                    const statusFg = rec.status==='FULLY_ALLOCATED'?'#2e7d32':rec.status==='POSTED'?'#e65100':'#c62828'
                    return (
                      <React.Fragment key={rec.id}>
                        <tr style={{ borderTop:'1px solid #f0f4f8', background:isExp?`${MC}08`:i%2===0?'#fff':'#fafcff', borderLeft:isExp?`3px solid ${MC}`:'3px solid transparent' }}>
                          <td style={{ ...S.td, fontFamily:'monospace', fontWeight:800, color:'#2e7d32', fontSize:11 }}>{rec.receipt_number||'—'}</td>
                          <td style={{ ...S.td, whiteSpace:'nowrap' }}>{rec.receipt_date}</td>
                          <td style={{ ...S.td, fontWeight:700, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis', maxWidth:0 }}>{rec.customer_name||'—'}</td>
                          <td style={S.td}>
                            <span style={{ fontSize:11, fontWeight:700, color: isDisc?'#c62828':'#0277bd', background: isDisc?'#ffebee':'#e3f2fd', padding:'2px 8px', borderRadius:8 }}>
                              {isDisc ? '🏦 SCF' : modeLabel}
                            </span>
                          </td>
                          <td style={{ ...S.td, fontWeight:700, textAlign:'right', whiteSpace:'nowrap' }}>SAR {fmt(rec.gross_amount)}</td>
                          <td style={S.td}>
                            <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:8, background:statusBg, color:statusFg }}>{rec.status?.replace(/_/g,' ')}</span>
                          </td>
                          <td style={{ ...S.td, textAlign:'center' }}>
                            <button onClick={toggleRec} style={{ background:isExp?MC:'#f1f5f9', color:isExp?'#fff':'#94a3b8', border:'none', borderRadius:'50%', width:24, height:24, cursor:'pointer', fontSize:11, display:'inline-flex', alignItems:'center', justifyContent:'center', transform:isExp?'rotate(180deg)':'none', transition:'all 0.15s' }}>▾</button>
                          </td>
                        </tr>
                        {isExp && (
                          <tr>
                            <td colSpan={7} style={{ padding:'10px 16px 14px 28px', background:`${MC}06`, borderBottom:`1px solid ${MC}22`, borderLeft:`3px solid ${MC}` }}>
                              <div style={{ display:'flex', flexWrap:'wrap', gap:'8px 24px', marginBottom:10 }}>
                                {(rec.discounting_charge||0)>0 && <div><span style={{ fontSize:10, color:'#888', fontWeight:700 }}>DISC. CHARGE </span><span style={{ fontSize:12, color:'#c62828' }}>(SAR {fmt(rec.discounting_charge)})</span></div>}
                                <div><span style={{ fontSize:10, color:'#888', fontWeight:700 }}>NET RECEIVED </span><span style={{ fontSize:13, fontWeight:800, color:'#2e7d32' }}>SAR {fmt(rec.net_received)}</span></div>
                                <div><span style={{ fontSize:10, color:'#888', fontWeight:700 }}>ALLOCATED </span><span style={{ fontSize:12, color:'#1565c0', fontWeight:700 }}>SAR {fmt(rec.allocated_amount)}</span></div>
                                <div><span style={{ fontSize:10, color:'#888', fontWeight:700 }}>UNALLOCATED </span><span style={{ fontSize:12, fontWeight:700, color:(rec.unallocated_amount||0)>0.01?'#e65100':'#aab2bd' }}>{(rec.unallocated_amount||0)>0.01?`SAR ${fmt(rec.unallocated_amount)}`:'✓ Fully allocated'}</span></div>
                                {rec.bank_reference && <div><span style={{ fontSize:10, color:'#888', fontWeight:700 }}>BANK REF </span><span style={{ fontSize:11, fontFamily:'monospace' }}>{rec.bank_reference}</span></div>}
                              </div>
                              <div style={{ display:'flex', gap:6 }}>
                                <button onClick={() => setViewReceipt(rec)}
                                  style={{ background:'#e3f2fd', color:'#1565c0', border:'none', borderRadius:6, padding:'5px 10px', cursor:'pointer', fontSize:11, fontWeight:700 }}>View</button>
                                {rec.status === 'POSTED' && (rec.unallocated_amount||0) > 0.01 && (
                                  <button onClick={() => openAllocModal(rec)}
                                    style={{ background:'#fff8e1', color:'#e65100', border:'none', borderRadius:6, padding:'5px 10px', cursor:'pointer', fontSize:11, fontWeight:700 }}>Allocate</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })
                }
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── View Modal ── */}
      {viewReceipt && (
        <div style={S.overlay} onClick={e => e.target===e.currentTarget && setViewReceipt(null)}>
          <div style={{ ...S.modal, padding:24, maxWidth:560 }}>
            <h3 style={{ margin:'0 0 16px', fontSize:16, fontWeight:900 }}>Payment Receipt — {viewReceipt.receipt_date}</h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16, fontSize:13 }}>
              <div><span style={{ color:'#888' }}>Customer:</span> <strong>{viewReceipt.customer_name}</strong></div>
              <div><span style={{ color:'#888' }}>Mode:</span> {PAYMENT_MODES.find(m=>m.value===viewReceipt.payment_mode)?.label}</div>
              {viewReceipt.bank_reference && <div><span style={{ color:'#888' }}>Bank Ref:</span> {viewReceipt.bank_reference}</div>}
              {viewReceipt.bank_account && <div><span style={{ color:'#888' }}>Account:</span> {viewReceipt.bank_account}</div>}
              <div><span style={{ color:'#888' }}>Gross Received:</span> <strong>SAR {fmt(viewReceipt.gross_amount)}</strong></div>
              {(viewReceipt.discounting_charge||0) > 0 && (
                <div><span style={{ color:'#c62828' }}>Discounting Charge:</span> <strong style={{ color:'#c62828' }}>(SAR {fmt(viewReceipt.discounting_charge)})</strong></div>
              )}
              <div><span style={{ color:'#888' }}>Net Received:</span> <strong style={{ color:'#2e7d32' }}>SAR {fmt(viewReceipt.net_received)}</strong></div>
            </div>
            {viewReceipt.payment_mode === 'INVOICE_DISCOUNTING' && (
              <div style={{ background:'#ffebee', border:'1px solid #ffcdd2', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#c62828' }}>
                🏦 <strong>Invoice Discounting (Supply Chain Finance)</strong><br/>
                The client (Nokia/Citibank) pays the full invoice value. The discounting charge of SAR {fmt(viewReceipt.discounting_charge)} is a financing expense — not a client deduction. The invoice(s) below are considered <strong>fully paid at face value</strong>.
              </div>
            )}
            {/* Allocations */}
            {(viewReceipt.payment_allocations||[]).length > 0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:800, color:'#1565c0', textTransform:'uppercase', marginBottom:8 }}>Invoice Allocations</div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead><tr style={{ background:'#f0f7ff' }}>
                    {['Invoice #','Allocated Amount'].map(h=>(
                      <th key={h} style={{ padding:'5px 8px', textAlign: h==='Invoice #'?'left':'right', fontSize:10, fontWeight:800, color:'#1565c0' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {viewReceipt.payment_allocations.map(a=>(
                      <tr key={a.id} style={{ borderBottom:'1px solid #f0f4f8' }}>
                        <td style={{ padding:'5px 8px', fontFamily:'monospace', color:'#1565c0', fontWeight:700 }}>{a.invoice_number}</td>
                        <td style={{ padding:'5px 8px', textAlign:'right', fontWeight:700 }}>SAR {fmt(a.amount_allocated)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {viewReceipt.notes && (
              <div style={{ background:'#f8faff', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#445566', marginBottom:14 }}>{viewReceipt.notes}</div>
            )}
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <button onClick={() => setViewReceipt(null)} style={S.btn('#f0f4f8','#555')}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Re-Allocate POSTED Receipt Modal ── */}
      {allocModal && (
        <div style={S.overlay} onClick={e => e.target===e.currentTarget && setAllocModal(null)}>
          <div style={{ ...S.modal, padding:0, maxWidth:620 }}>
            <div style={{ background:'linear-gradient(135deg,#e65100,#f57c00)', padding:'18px 22px', borderRadius:'16px 16px 0 0' }}>
              <div style={{ color:'#fff', fontWeight:900, fontSize:16 }}>💸 Allocate Receipt — {allocModal.receipt_number||allocModal.receipt_date}</div>
              <div style={{ color:'rgba(255,255,255,0.75)', fontSize:12, marginTop:2 }}>
                {allocModal.customer_name} · Unallocated: <strong>SAR {fmt(allocModal.unallocated_amount)}</strong>
              </div>
            </div>
            <div style={{ padding:'20px 22px' }}>
              {allocLines.length === 0
                ? <div style={{ textAlign:'center', padding:30, color:'#aab2bd' }}>No open invoices for this client</div>
                : (
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead><tr style={{ background:'#f0f4f8' }}>
                      {['Invoice #','Date','Balance Due','Allocate'].map(h=>(
                        <th key={h} style={{ padding:'7px 10px', textAlign: h==='Allocate'||h==='Balance Due' ? 'right':'left', fontSize:10, fontWeight:800, color:'#546e7a' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {allocLines.map((l,idx) => (
                        <tr key={l.invoice_id} style={{ borderBottom:'1px solid #f0f4f8' }}>
                          <td style={{ padding:'8px 10px', fontWeight:800, color:'#1565c0', fontFamily:'monospace' }}>{l.invoice_number}</td>
                          <td style={{ padding:'8px 10px', color:'#6b7c93' }}>{l.invoice_date}</td>
                          <td style={{ padding:'8px 10px', textAlign:'right', fontWeight:700, color: l.balance_due>0?'#e65100':'#aab2bd' }}>SAR {fmt(l.balance_due)}</td>
                          <td style={{ padding:'8px 10px', textAlign:'right' }}>
                            {l.balance_due <= 0
                              ? <span style={{ fontSize:11, color:'#aab2bd' }}>Fully Paid</span>
                              : <div style={{ display:'flex', gap:5, justifyContent:'flex-end' }}>
                                  <input type="number" min="0" step="0.01"
                                    value={allocLines[idx].amount_allocated}
                                    onChange={e => setAllocLines(prev => prev.map((x,i) => i===idx ? {...x, amount_allocated: e.target.value} : x))}
                                    style={{ width:110, padding:'5px 8px', borderRadius:6, border:'1.5px solid #dde3ec', fontSize:12, textAlign:'right', outline:'none' }}
                                    placeholder="0.00" />
                                  <button onClick={() => setAllocLines(prev => prev.map((x,i) => i===idx ? {...x, amount_allocated: String(x.balance_due)} : x))}
                                    style={{ padding:'4px 8px', borderRadius:6, border:'none', background:'#e3f2fd', color:'#1565c0', fontSize:11, fontWeight:700, cursor:'pointer' }}>Full</button>
                                </div>
                            }
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              }
              {allocLines.length > 0 && (
                <div style={{ marginTop:12, padding:'10px 14px', background:'#f8faff', borderRadius:8, display:'flex', justifyContent:'space-between', fontSize:13 }}>
                  <span style={{ color:'#6b7c93' }}>Total Allocating</span>
                  <strong style={{ color: allocLines.reduce((s,l)=>s+(parseFloat(l.amount_allocated)||0),0) > (allocModal.unallocated_amount||0)+0.01 ? '#c62828':'#2e7d32' }}>
                    SAR {fmt(allocLines.reduce((s,l)=>s+(parseFloat(l.amount_allocated)||0),0))}
                    {' '}<span style={{ fontSize:11, color:'#aab2bd' }}>of SAR {fmt(allocModal.unallocated_amount)} available</span>
                  </strong>
                </div>
              )}
            </div>
            <div style={{ padding:'14px 22px', borderTop:'1px solid #e8edf5', display:'flex', gap:10, justifyContent:'flex-end' }}>
              <button onClick={() => { setAllocModal(null); setAllocLines([]) }} style={S.btn('#f0f4f8','#555')}>Cancel</button>
              <button onClick={saveReAlloc} disabled={allocSaving}
                style={S.btn(allocSaving?'#aab2bd':'linear-gradient(135deg,#e65100,#f57c00)')}>
                {allocSaving ? 'Saving…' : '✓ Save Allocations'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Entry Banner ── */}
      <PageBanner
        isOpen={showBanner}
        onClose={() => setShowBanner(false)}
        onStart={() => { setShowBanner(false); setOpen(true) }}
        chapterL1="#C1A1A9"
        chapterL2="#FAF0F2"
        moduleColor="#8C354B"
        chapterLabel="Finance"
        formTitle={['Record', 'Receipt']}
        steps={['Receipt Details', 'Invoices Covered']}
        icon="💰"
        description="Record client payment receipts and allocate to outstanding invoices."
      />

      {/* ══════════════════════════════════════════════════════════════
          CREATE RECEIPT MODAL — 4-Layer Finance Design
      ══════════════════════════════════════════════════════════════ */}
      {open && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.52)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px 10px' }}>
          {/* L1 — mauve border frame */}
          <div style={{ background:'#C1A1A9', borderRadius:16, width:700, maxWidth:'96vw', height:'86vh', padding:10, display:'flex', boxShadow:'0 24px 64px rgba(0,0,0,0.35)', fontFamily:"'Poppins', sans-serif" }}>
            {/* L2 — light pink inner */}
            <div style={{ flex:1, background:'#FAF0F2', borderRadius:8, display:'flex', overflow:'visible', position:'relative' }}>

              {/* ── Sidebar ── */}
              <div style={{ width:152, flexShrink:0, padding:'16px 14px 16px', display:'flex', flexDirection:'column', alignItems:'flex-start' }}>
                <div style={{ fontSize:13, fontWeight:900, color:'#3e1020', lineHeight:1.2, whiteSpace:'nowrap', position:'relative', zIndex:10 }}>
                  {entityName || entityNameEn || 'Ratal Group'}
                </div>
                <div style={{ marginTop:80, width:'100%', textAlign:'center' }}>
                  <div style={{ fontSize:12, fontWeight:800, color:'#8C354B', marginBottom:2 }}>Finance</div>
                  <div style={{ fontSize:24, fontWeight:900, color:'#3e1020', letterSpacing:0.2, lineHeight:1.15 }}>Record Receipt</div>
                </div>
                <div style={{ flex:1 }} />
                <div style={{ alignSelf:'flex-start', width:'100%' }}>
                  {[{num:1,label:'Receipt Details'},{num:2,label:'Invoices Covered'}].map(s=>(
                    <div key={s.num} onClick={()=>s.num<wizardStep&&setWizardStep(s.num)}
                      style={{ fontSize:11, marginBottom:12, paddingLeft:8, textAlign:'left', width:'100%', boxSizing:'border-box',
                        borderLeft: wizardStep===s.num?'3px solid #8C354B':'3px solid transparent',
                        color: wizardStep===s.num?'#8C354B':s.num<wizardStep?'#5a2030':'#b08090',
                        fontWeight: wizardStep===s.num?700:400,
                        cursor: s.num<wizardStep?'pointer':'default',
                        opacity: s.num>wizardStep?0.5:1, transition:'all 0.15s' }}>
                      {s.label}
                    </div>
                  ))}
                </div>
                <div style={{ flex:1 }} />
              </div>

              {/* ── Right column ── */}
              <div style={{ flex:1, position:'relative', overflow:'hidden' }}>
                {/* L3 — maroon top-right corner, no text */}
                <div style={{ position:'absolute', top:0, right:0, width:'55%', height:200, background:'#8C354B', borderRadius:'0 8px 0 0', zIndex:1 }} />

                {/* L4 — white card */}
                <div style={{ position:'absolute', top:52, left:12, right:12, bottom:12, background:'#fff', borderRadius:12, boxShadow:'0 4px 24px rgba(0,0,0,0.15)', display:'flex', flexDirection:'column', overflow:'hidden', zIndex:2 }}>
                  <div style={{ flex:1, overflowY:'auto', padding:'14px 16px' }}>

                    {/* ─── STEP 1: RECEIPT DETAILS ─── */}
                    {wizardStep===1 && (<>
                      <div style={{ display:'flex', gap:10, marginBottom:10 }}>
                        <div style={{ flex:1 }}>
                          <label style={{ fontSize:10, fontWeight:600, color:'#9b6070', display:'block', marginBottom:3 }}>Receipt Date *</label>
                          <input type="date" style={{ width:'100%', padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, fontFamily:'inherit', boxSizing:'border-box', outline:'none' }}
                            value={form.receipt_date} onChange={e=>setForm(f=>({...f, receipt_date:e.target.value}))} />
                        </div>
                        <div style={{ flex:2 }}>
                          <label style={{ fontSize:10, fontWeight:600, color:'#9b6070', display:'block', marginBottom:3 }}>Customer / Client *</label>
                          <select style={{ width:'100%', padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, fontFamily:'inherit', boxSizing:'border-box', outline:'none' }}
                            value={form.customer_id} onChange={e=>onCustomerChange(e.target.value)}>
                            <option value="">— Select Customer —</option>
                            {contractors.map(c=>(
                              <option key={c.id} value={c.id}>{c.contractor_code?`[${c.contractor_code}] `:''}{c.contractor_name} [{c.vendor_type||'CLIENT'}]</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div style={{ display:'flex', gap:10, marginBottom:10 }}>
                        <div style={{ flex:2 }}>
                          <label style={{ fontSize:10, fontWeight:600, color:'#9b6070', display:'block', marginBottom:3 }}>Payment Mode *</label>
                          <select style={{ width:'100%', padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, fontFamily:'inherit', boxSizing:'border-box', outline:'none' }}
                            value={form.payment_mode} onChange={e=>setForm(f=>({...f, payment_mode:e.target.value}))}>
                            {PAYMENT_MODES.map(m=><option key={m.value} value={m.value}>{m.label}</option>)}
                          </select>
                        </div>
                        <div style={{ flex:1 }}>
                          <label style={{ fontSize:10, fontWeight:600, color:'#9b6070', display:'block', marginBottom:3 }}>Gross Amount (SAR) *</label>
                          <input type="number" min="0" step="0.01"
                            style={{ width:'100%', padding:'7px 10px', borderRadius:7, border:'1.5px solid #8C354B', fontSize:13, fontWeight:800, color:'#3e1020', fontFamily:'inherit', boxSizing:'border-box', outline:'none' }}
                            placeholder="0.00" value={form.gross_amount} onChange={e=>handleGrossChange(e.target.value)} />
                        </div>
                      </div>

                      {form.payment_mode==='INVOICE_DISCOUNTING' && (
                        <div style={{ background:'#fffafa', border:'1.5px solid #ffcdd2', borderRadius:8, padding:'10px 12px', marginBottom:10 }}>
                          <div style={{ fontSize:10, fontWeight:800, color:'#c62828', marginBottom:6, textTransform:'uppercase', letterSpacing:0.5 }}>🏦 Supply Chain Finance (Nokia/Citibank)</div>
                          <div style={{ fontSize:11, color:'#e53935', background:'#ffebee', borderRadius:6, padding:'6px 10px', marginBottom:8 }}>
                            <strong>Note:</strong> Citibank pays less than invoice face value. The discounting charge is a financing expense — invoice remains fully paid at face value.
                          </div>
                          <div style={{ display:'flex', gap:10 }}>
                            <div style={{ flex:1 }}>
                              <label style={{ fontSize:10, fontWeight:600, color:'#9b6070', display:'block', marginBottom:3 }}>Discounting Charge (SAR)</label>
                              <input type="number" min="0" step="0.01"
                                style={{ width:'100%', padding:'7px 10px', borderRadius:7, border:'1px solid #ffcdd2', fontSize:12, fontWeight:700, color:'#c62828', fontFamily:'inherit', boxSizing:'border-box', outline:'none' }}
                                placeholder="0.00" value={form.discounting_charge} onChange={e=>handleDiscountingChange(e.target.value)} />
                            </div>
                            <div style={{ flex:1 }}>
                              <label style={{ fontSize:10, fontWeight:600, color:'#9b6070', display:'block', marginBottom:3 }}>Net Received (SAR)</label>
                              <div style={{ padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, fontWeight:800, color:'#2e7d32', background:'#f0fff4' }}>
                                SAR {fmt(parseFloat(form.net_received)||0)}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div style={{ display:'flex', gap:10, marginBottom:10 }}>
                        <div style={{ flex:1 }}>
                          <label style={{ fontSize:10, fontWeight:600, color:'#9b6070', display:'block', marginBottom:3 }}>Bank Reference / Ref#</label>
                          <input style={{ width:'100%', padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, fontFamily:'monospace', boxSizing:'border-box', outline:'none' }}
                            placeholder="TT/CHQ number or bank ref"
                            value={form.bank_reference} onChange={e=>setForm(f=>({...f, bank_reference:e.target.value}))} />
                        </div>
                        <div style={{ flex:1 }}>
                          <label style={{ fontSize:10, fontWeight:600, color:'#9b6070', display:'block', marginBottom:3 }}>Bank Account <span style={{ color:'#aab2bd' }}>(Optional)</span></label>
                          <input style={{ width:'100%', padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, fontFamily:'inherit', boxSizing:'border-box', outline:'none' }}
                            placeholder="Account name / last 4"
                            value={form.bank_account} onChange={e=>setForm(f=>({...f, bank_account:e.target.value}))} />
                        </div>
                      </div>

                      <div style={{ marginBottom:4 }}>
                        <label style={{ fontSize:10, fontWeight:600, color:'#9b6070', display:'block', marginBottom:3 }}>Notes <span style={{ color:'#aab2bd' }}>(Optional)</span></label>
                        <textarea style={{ width:'100%', padding:'7px 10px', borderRadius:7, border:'1px solid #dde3ec', fontSize:12, fontFamily:'inherit', boxSizing:'border-box', outline:'none', minHeight:52, resize:'vertical' }}
                          value={form.notes} onChange={e=>setForm(f=>({...f, notes:e.target.value}))}
                          placeholder="Reference, special remarks…" />
                      </div>
                    </>)}

                    {/* ─── STEP 2: INVOICES COVERED ─── */}
                    {wizardStep===2 && (<>
                      {!form.customer_id ? (
                        <div style={{ textAlign:'center', padding:30, color:'#b08090', fontSize:12 }}>Please select a customer in Step 1 first.</div>
                      ) : openInvoices.length===0 ? (
                        <div style={{ textAlign:'center', padding:30, color:'#b08090', fontSize:12 }}>No outstanding invoices found for this customer.</div>
                      ) : (<>
                        {/* Summary bar */}
                        <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                          <div style={{ flex:1, background:'#f5e8eb', borderRadius:8, padding:'8px 12px', textAlign:'center' }}>
                            <div style={{ fontSize:9, fontWeight:800, color:'#9b6070', textTransform:'uppercase', letterSpacing:0.5, marginBottom:2 }}>Received</div>
                            <div style={{ fontSize:14, fontWeight:900, color:'#3e1020' }}>SAR {fmt(grossAmount)}</div>
                          </div>
                          <div style={{ flex:1, background:'#faf0f2', borderRadius:8, padding:'8px 12px', textAlign:'center', border:'1.5px solid #C1A1A9' }}>
                            <div style={{ fontSize:9, fontWeight:800, color:'#9b6070', textTransform:'uppercase', letterSpacing:0.5, marginBottom:2 }}>Selected Total</div>
                            <div style={{ fontSize:14, fontWeight:900, color:'#8C354B' }}>SAR {fmt(totalAllocated)}</div>
                          </div>
                          <div style={{ flex:1, background: unallocated<-0.01?'#ffebee':unallocated>0.01?'#fff8e1':'#e8f5e9', borderRadius:8, padding:'8px 12px', textAlign:'center' }}>
                            <div style={{ fontSize:9, fontWeight:800, color:'#9b6070', textTransform:'uppercase', letterSpacing:0.5, marginBottom:2 }}>
                              {unallocated<-0.01?'Over-allocated':unallocated>0.01?'Unallocated':'Balanced ✓'}
                            </div>
                            <div style={{ fontSize:14, fontWeight:900, color: unallocated<-0.01?'#c62828':unallocated>0.01?'#e65100':'#2e7d32' }}>
                              SAR {fmt(Math.abs(unallocated))}
                            </div>
                          </div>
                        </div>
                        {/* Invoice rows */}
                        <div style={{ border:'1px solid #f0e6e9', borderRadius:8, overflow:'hidden' }}>
                          <div style={{ display:'grid', gridTemplateColumns:'28px 1fr 80px 90px 100px', gap:8, padding:'6px 10px', background:'#8C354B' }}>
                            {['','Invoice #','Date','Balance Due','Allocate (SAR)'].map((h,i)=>(
                              <div key={i} style={{ fontSize:9, fontWeight:800, color:'#fff', textTransform:'uppercase', letterSpacing:0.5, textAlign:i>=3?'right':'left' }}>{h}</div>
                            ))}
                          </div>
                          {allocations.map((a,idx)=>{
                            const fullyPaid = a.balance_due<=0.01
                            return (
                              <div key={a.invoice_id} style={{ display:'grid', gridTemplateColumns:'28px 1fr 80px 90px 100px', gap:8, padding:'7px 10px', borderTop:'1px solid #f5e8eb', background: fullyPaid?'#f0fdf4':a.checked?'#fdf5f7':'#fff', alignItems:'center' }}>
                                <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
                                  {fullyPaid
                                    ? <span style={{ fontSize:13, color:'#2e7d32' }}>✓</span>
                                    : <input type="checkbox" checked={!!a.checked} onChange={()=>toggleAllocation(idx)}
                                        style={{ width:14, height:14, accentColor:'#8C354B', cursor:'pointer' }} />
                                  }
                                </div>
                                <div>
                                  <div style={{ fontSize:11, fontWeight:800, color:'#8C354B', fontFamily:'monospace' }}>{a.invoice_number}</div>
                                  {a.po_number&&a.po_number!=='—'&&<div style={{ fontSize:9, color:'#b08090' }}>PO: {a.po_number}</div>}
                                </div>
                                <div style={{ fontSize:11, color:'#7a5060' }}>{a.invoice_date}</div>
                                <div style={{ textAlign:'right', fontSize:12, fontWeight:700, color: fullyPaid?'#2e7d32':'#3e1020' }}>
                                  {fullyPaid?'✓ Paid':`SAR ${fmt(a.balance_due)}`}
                                </div>
                                <div style={{ textAlign:'right' }}>
                                  {fullyPaid
                                    ? <span style={{ fontSize:10, color:'#2e7d32', fontWeight:700 }}>Fully Paid</span>
                                    : a.checked
                                      ? <input type="number" min="0" max={a.balance_due} step="0.01"
                                          style={{ width:'100%', padding:'4px 7px', borderRadius:6, border:'1.5px solid #8C354B', fontSize:11, fontWeight:700, color:'#3e1020', textAlign:'right', fontFamily:'inherit', boxSizing:'border-box', outline:'none' }}
                                          value={a.amount_allocated}
                                          onChange={e=>setAllocations(prev=>prev.map((x,xi)=>xi===idx?{...x,amount_allocated:e.target.value}:x))} />
                                      : <span style={{ fontSize:10, color:'#c0a0a8' }}>—</span>
                                  }
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        {unallocated<-0.01&&(
                          <div style={{ marginTop:8, padding:'7px 12px', background:'#ffebee', borderRadius:7, fontSize:11, color:'#c62828', fontWeight:700 }}>
                            ⚠️ Over-allocation: reduce allocation amounts before posting.
                          </div>
                        )}
                      </>)}
                    </>)}

                  </div>{/* end scrollable content */}

                  {/* Footer buttons */}
                  <div style={{ padding:'10px 16px', borderTop:'1px solid #f0e6e9', display:'flex', gap:8, justifyContent:'flex-end', alignItems:'center' }}>
                    <button
                      onClick={wizardStep===1 ? ()=>{setOpen(false);setWizardStep(1)} : ()=>setWizardStep(s=>s-1)}
                      style={{ background:'#888', color:'#fff', border:'none', borderRadius:8, padding:'8px 20px', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                      {wizardStep===1 ? 'Cancel' : '← Back'}
                    </button>
                    {wizardStep<2&&(
                      <button onClick={()=>{
                        if(!form.customer_id){alert('Please select a customer first.');return}
                        if(!form.gross_amount||parseFloat(form.gross_amount)<=0){alert('Please enter a valid gross amount.');return}
                        setWizardStep(s=>s+1)
                      }}
                        style={{ background:'#8C354B', color:'#fff', border:'none', borderRadius:8, padding:'8px 20px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                        Save & Next →
                      </button>
                    )}
                    {wizardStep===2&&(
                      <button onClick={saveReceipt} disabled={saving}
                        style={{ background:saving?'#C1A1A9':'#8C354B', color:'#fff', border:'none', borderRadius:8, padding:'8px 20px', cursor:saving?'default':'pointer', fontSize:12, fontWeight:700 }}>
                        {saving?'⏳ Saving…':'💰 Post Receipt'}
                      </button>
                    )}
                  </div>

                </div>{/* end L4 white card */}
              </div>{/* end right column */}
            </div>{/* end L2 */}
          </div>{/* end L1 */}
        </div>
      )}
    </ChapterPage>
  )
}
