import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import InvoicePrint from './InvoicePrint'
import InvoiceTemplatePicker from './InvoiceTemplatePicker'
import { postInvoiceJE, postCreditNoteJE, postRetentionReleaseJE, voidInvoiceJE } from '../lib/autoPost'
import ChapterPage from '../components/ChapterPage'
import PageBanner from '../components/PageBanner'
import { GROUP_COLORS, btn, inputStyle, labelStyle, sectionLabel, thStyle, thStyleFor, tdStyle, statusBadge } from '../styles/appStyles'

const MC = GROUP_COLORS.Finance

// ─── ZATCA QR (Phase 1 TLV) ─────────────────────────────────────────────────
function makeTLV(tag, value) {
  const encoded = new TextEncoder().encode(value)
  return new Uint8Array([tag, encoded.length, ...encoded])
}
function generateZATCAQR({ sellerName, vatNumber, invoiceDate, total, vat }) {
  const t1 = makeTLV(1, sellerName)
  const t2 = makeTLV(2, vatNumber)
  const t3 = makeTLV(3, invoiceDate + 'T00:00:00Z')
  const t4 = makeTLV(4, parseFloat(total).toFixed(2))
  const t5 = makeTLV(5, parseFloat(vat).toFixed(2))
  const all = new Uint8Array([...t1, ...t2, ...t3, ...t4, ...t5])
  return btoa(String.fromCharCode(...all))
}

// ─── Constants ───────────────────────────────────────────────────────────────
const PREFIX_MAP   = { RAT:'RAT', GWT:'GWTT', ACCSYS:'INV' }
const INV_TYPES    = [
  { key:'TAX',         label:'Tax Invoice (B2B)',         vatDefault:15, badge:'#1565c0' },
  { key:'SIMPLIFIED',  label:'Simplified Tax Invoice',    vatDefault:15, badge:'#0277bd' },
  { key:'ZERO_RATED',  label:'Zero-Rated (International)',vatDefault:0,  badge:'#2e7d32' },
  { key:'CREDIT_NOTE', label:'Credit Note',               vatDefault:15, badge:'#c62828' },
  { key:'DEBIT_NOTE',  label:'Debit Note',                vatDefault:15, badge:'#e65100' },
]
const EMPTY_LINE = { description:'', quantity:'1', unit_price:'', vat_rate:'15', vat_amount:0, line_total:0, po_line_id:null, is_header:false }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n) { return new Intl.NumberFormat('en-SA',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n||0) }

const statusColor = { DRAFT:'#fff8e1', ISSUED:'#e3f2fd', PAID:'#e8f5e9', CANCELLED:'#ffebee', VOID:'#fce4ec' }
const statusText  = { DRAFT:'#f57f17', ISSUED:'#1565c0', PAID:'#2e7d32', CANCELLED:'#c62828', VOID:'#880e4f' }

// ─── Styles ──────────────────────────────────────────────────────────────────
const S = {
  overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,0.52)', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'16px 10px', overflowY:'auto' },
  modal:   { background:'#fff', borderRadius:16, padding:0, width:820, maxWidth:'98vw', boxShadow:'0 8px 40px rgba(0,0,0,0.2)', marginTop:'auto', marginBottom:'auto', overflow:'hidden' },
  inp:     { width:'100%', padding:'8px 11px', borderRadius:7, border:'1px solid #dde3ec', fontSize:13, outline:'none', fontFamily:'inherit', boxSizing:'border-box' },
  label:   { display:'block', fontSize:11, color:'#6b7c93', fontWeight:700, marginBottom:4, textTransform:'uppercase', letterSpacing:0.4 },
  row:     { display:'flex', gap:12, marginBottom:14 },
  col:     { flex:1 },
  badge:   (bg) => ({ background:bg+'22', color:bg, borderRadius:6, padding:'2px 8px', fontSize:11, fontWeight:700 }),
  btn:     (bg, fg='#fff') => ({ background:bg, color:fg, border:'none', borderRadius:9, padding:'9px 20px', cursor:'pointer', fontSize:13, fontWeight:700 }),
  section: { background:'#f8faff', border:'1.5px solid #e8edf5', borderRadius:10, padding:'14px 16px', marginBottom:14 },
}

// ─── Collapsible section ─────────────────────────────────────────────────────
function Collapsible({ title, icon='▸', defaultOpen=false, children, accent='#6b7c93' }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border:'1px solid #e8edf2', borderRadius:10, marginBottom:12, overflow:'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 16px', background: open ? '#f0f7ff' : '#f8faff', border:'none', cursor:'pointer', textAlign:'left' }}>
        <span style={{ fontWeight:800, fontSize:12, color: accent, textTransform:'uppercase', letterSpacing:0.6 }}>{icon} {title}</span>
        <span style={{ fontSize:14, color:'#aab2bd', transform: open?'rotate(180deg)':'none', transition:'transform 0.2s' }}>▾</span>
      </button>
      {open && <div style={{ padding:'14px 16px', background:'#fff' }}>{children}</div>}
    </div>
  )
}

// ─── Detail field display ─────────────────────────────────────────────────────
function DField({ label, value, mono=false, color, wide=false }) {
  return (
    <div style={{ minWidth: wide?'100%':0 }}>
      <div style={{ fontSize:10, color:'#aab2bd', fontWeight:700, textTransform:'uppercase', letterSpacing:0.4, marginBottom:2 }}>{label}</div>
      <div style={{ fontSize:13, fontWeight:600, color: color||'#1a2e3d', fontFamily: mono?'monospace':undefined, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
        {value || <span style={{ color:'#ccc' }}>—</span>}
      </div>
    </div>
  )
}

// ─── Status pill ─────────────────────────────────────────────────────────────
function SPill({ status }) {
  return <span style={{ background:statusColor[status]||'#eee', color:statusText[status]||'#555', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:800 }}>{status}</span>
}

// ─── Line card (form) ─────────────────────────────────────────────────────────
function LineRow({ line, idx, onChange, onRemove, vatLocked, isOnly, selectedPo }) {
  const isHdr = !!line.is_header
  const fullyBilled = !isHdr && !!line._fully_billed
  const qty  = isHdr ? 0 : (parseFloat(line.quantity)   || 0)
  const up   = isHdr ? 0 : (parseFloat(line.unit_price) || 0)
  const vr   = isHdr ? 0 : (vatLocked ? 0 : (parseFloat(line.vat_rate) || 0))
  const lineEx  = qty * up
  const vatAmt  = lineEx * (vr/100)
  const lineT   = lineEx + vatAmt
  const maxQty  = line._qty_remaining

  useEffect(() => {
    if (isHdr) return
    if (line.vat_amount !== vatAmt || line.line_total !== lineT) {
      onChange(idx, { ...line, vat_amount: vatAmt, line_total: lineT })
    }
  }, [line.quantity, line.unit_price, line.vat_rate, vatLocked])

  // ── Section header card ──
  if (isHdr) {
    return (
      <div style={{ background:'#1e3a5f', borderRadius:8, padding:'8px 14px', marginBottom:6, fontWeight:800, fontSize:12, color:'#e3f2fd', letterSpacing:0.5 }}>
        ▸ {line.description}
      </div>
    )
  }

  const cardBg = fullyBilled ? '#f8f8f8' : '#fff'
  const cardBorder = fullyBilled ? '1px solid #e0e0e0' : '1px solid #ecdde2'

  return (
    <div style={{ background:cardBg, border:cardBorder, borderRadius:8, padding:'10px 12px', marginBottom:8, opacity:fullyBilled?0.6:1 }}>
      {/* Card header: line number + fully billed badge + delete */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <span style={{ fontSize:10, fontWeight:800, color:'#8C354B', background:'#f5e8eb', padding:'2px 8px', borderRadius:10 }}>
          Line {idx+1}
          {fullyBilled && <span style={{ marginLeft:6, background:'#e8f5e9', color:'#2e7d32', borderRadius:4, padding:'1px 5px', fontSize:9 }}>✓ Fully Billed</span>}
        </span>
        {!isOnly && !selectedPo && !fullyBilled && (
          <button onClick={() => onRemove(idx)} style={{ background:'none', border:'none', color:'#e53935', fontSize:18, cursor:'pointer', lineHeight:1, padding:'0 2px' }}>×</button>
        )}
      </div>

      {/* Description — full width */}
      <div style={{ marginBottom:8 }}>
        <label style={{ fontSize:10, fontWeight:600, color:'#9b6070', display:'block', marginBottom:3 }}>Description</label>
        {fullyBilled
          ? <div style={{ padding:'7px 10px', fontSize:12, color:'#888', fontStyle:'italic', background:'#f5f5f5', borderRadius:6, border:'1px solid #e8e8e8' }}>{line.description||'—'}</div>
          : selectedPo
            ? <div style={{ padding:'7px 10px', fontSize:12, color:'#1a2e3d', background:'#f5f0f1', borderRadius:6, border:'1px solid #ecdde2' }}>{line.description||'—'}</div>
            : <input style={{ ...S.inp, fontSize:12, width:'100%', boxSizing:'border-box' }} placeholder="Enter description"
                value={line.description} onChange={e => onChange(idx, {...line, description:e.target.value})} />
        }
      </div>

      {/* Fields grid: Qty | Avl. | Unit Price | VAT% | VAT Amt | Total */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 80px 80px 100px', gap:8 }}>
        {/* Qty */}
        <div>
          <label style={{ fontSize:10, fontWeight:600, color:'#9b6070', display:'block', marginBottom:3 }}>Qty</label>
          {fullyBilled
            ? <div style={{ padding:'6px 8px', fontSize:12, textAlign:'right', color:'#2e7d32', fontWeight:700, background:'#f5f5f5', borderRadius:6, border:'1px solid #e8e8e8' }}>0 / {line._qty_total}</div>
            : <input style={{ ...S.inp, fontSize:12, textAlign:'right', borderColor:maxQty&&qty>maxQty?'#e53935':undefined, width:'100%', boxSizing:'border-box' }}
                type="number" min="0" max={maxQty||undefined} step="0.001"
                value={line.quantity}
                onChange={e => {
                  const v = e.target.value
                  if (maxQty!==undefined && maxQty!==null && parseFloat(v) > maxQty) return
                  onChange(idx, {...line, quantity:v})
                }} />
          }
        </div>

        {/* Avl. */}
        <div>
          <label style={{ fontSize:10, fontWeight:600, color:'#9b6070', display:'block', marginBottom:3 }}>Avl.</label>
          <div style={{ padding:'6px 8px', fontSize:12, textAlign:'right', fontWeight:700, background:'#faf7f8', borderRadius:6, border:'1px solid #ecdde2', color:fullyBilled?'#2e7d32':'#e65100' }}>
            {selectedPo ? (fullyBilled ? '✓ Done' : (maxQty !== undefined ? maxQty : '—')) : '—'}
          </div>
        </div>

        {/* Unit Price */}
        <div>
          <label style={{ fontSize:10, fontWeight:600, color:'#9b6070', display:'block', marginBottom:3 }}>Price</label>
          {selectedPo
            ? <div style={{ padding:'6px 8px', fontSize:12, textAlign:'right', color:'#1a2e3d', background:'#f5f0f1', borderRadius:6, border:'1px solid #ecdde2' }}>{line.unit_price||'—'}</div>
            : <input style={{ ...S.inp, fontSize:12, textAlign:'right', width:'100%', boxSizing:'border-box' }}
                type="number" min="0" step="0.01" placeholder="0.00"
                value={line.unit_price} onChange={e=>onChange(idx,{...line,unit_price:e.target.value})} />
          }
        </div>

        {/* VAT% */}
        <div>
          <label style={{ fontSize:10, fontWeight:600, color:'#9b6070', display:'block', marginBottom:3 }}>VAT%</label>
          {vatLocked
            ? <div style={{ padding:'6px 8px', fontSize:12, textAlign:'center', color:'#2e7d32', fontWeight:700, background:'#e8f5e9', borderRadius:6, border:'1px solid #c8e6c9' }}>0%</div>
            : <select style={{ ...S.inp, fontSize:12, width:'100%', boxSizing:'border-box' }} value={line.vat_rate} disabled={fullyBilled}
                onChange={e => !fullyBilled && onChange(idx, {...line, vat_rate:e.target.value})}>
                <option value="15">15%</option>
                <option value="0">0%</option>
              </select>
          }
        </div>

        {/* VAT Amt */}
        <div>
          <label style={{ fontSize:10, fontWeight:600, color:'#9b6070', display:'block', marginBottom:3 }}>VAT Amt</label>
          <div style={{ padding:'6px 8px', fontSize:12, textAlign:'right', color:'#555', background:'#faf7f8', borderRadius:6, border:'1px solid #ecdde2' }}>{vatAmt.toFixed(2)}</div>
        </div>

        {/* Total */}
        <div>
          <label style={{ fontSize:10, fontWeight:600, color:'#8C354B', display:'block', marginBottom:3 }}>Total</label>
          <div style={{ padding:'6px 8px', fontSize:13, textAlign:'right', fontWeight:800, color:fullyBilled?'#aaa':'#3e1020', background:'#f5e8eb', borderRadius:6, border:'1px solid #d4a8b4' }}>{lineT.toFixed(2)}</div>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// DETAIL VIEW  — elegant compact header + collapsibles + tabs
// ══════════════════════════════════════════════════════════════════════════════
function InvoiceDetail({ inv, contractors, onBack, onPrint, onStatusChange, onCreateNote, entityCode, entityName, entityNameAr, entityVatNumber }) {
  const [activeTab, setActiveTab] = useState('lines')
  const cust     = contractors.find(c => c.id === inv.contractor_id)
  const custName = cust?.contractor_name || '—'
  const typeInfo = INV_TYPES.find(t => t.key === inv.invoice_type)

  // Address from contractor record — try all common field names
  const addrLines = [
    cust?.address || cust?.address_line1 || cust?.street,
    [cust?.city, cust?.country].filter(Boolean).join(', '),
  ].filter(Boolean)
  const vatNo = cust?.vat_number || cust?.tax_number || cust?.vat_reg_no || ''
  const crNo  = cust?.cr_number  || cust?.commercial_registration_no || ''

  const retAmt = inv.retention_amount || 0
  const netP   = inv.net_payable || inv.total_amount || 0

  const TABS = [
    { key:'lines',    label:'Invoice Lines' },
    { key:'einvoice', label:'E-Invoice Information' },
    { key:'other',    label:'Other Info' },
    { key:'zatca',    label:'Zatca Response' },
  ]

  return (
    <div style={{ padding:'0 0 40px' }}>

      {/* ══ ROW 1: Breadcrumb + actions ══ */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexWrap:'wrap', gap:8 }}>
        {/* Breadcrumb */}
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:13 }}>
          <button onClick={onBack}
            style={{ background:'none', border:'none', color:'#1565c0', fontWeight:700, cursor:'pointer', fontSize:13, padding:0 }}>
            🧾 Invoices
          </button>
          <span style={{ color:'#aab2bd' }}>›</span>
          <span style={{ fontWeight:800, color:'#1a2e3d', fontFamily:'monospace' }}>{inv.invoice_number}</span>
          <span style={{ marginLeft:6 }}><SPill status={inv.status} /></span>
          {typeInfo && <span style={{ ...S.badge(typeInfo.badge) }}>{typeInfo.label}</span>}
        </div>

        {/* Action buttons */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
          {inv.status==='DRAFT' && (
            <button onClick={() => onStatusChange(inv,'ISSUED')}
              style={{ background:'#2e7d32', color:'#fff', border:'none', borderRadius:8, padding:'7px 16px', cursor:'pointer', fontSize:12, fontWeight:800 }}>
              ✅ Issue
            </button>
          )}
          {inv.status==='ISSUED' && (
            <button onClick={() => onStatusChange(inv,'PAID')}
              style={{ background:'#1565c0', color:'#fff', border:'none', borderRadius:8, padding:'7px 16px', cursor:'pointer', fontSize:12, fontWeight:800 }}>
              💵 Register Payment
            </button>
          )}
          {['DRAFT','ISSUED'].includes(inv.status) && (<>
            <button onClick={() => onPrint({...inv, _contractor: cust})}
              style={{ background:'#fff', color:'#445566', border:'1px solid #d0d7e2', borderRadius:8, padding:'6px 13px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
              👁️ Preview
            </button>
            <button onClick={() => onCreateNote('CREDIT_NOTE', inv)}
              style={{ background:'#fff', color:'#c62828', border:'1px solid #ffcdd2', borderRadius:8, padding:'6px 13px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
              📉 Credit Note
            </button>
            <button onClick={() => onCreateNote('DEBIT_NOTE', inv)}
              style={{ background:'#fff', color:'#e65100', border:'1px solid #ffe0b2', borderRadius:8, padding:'6px 13px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
              📈 Debit Note
            </button>
            {inv.status === 'ISSUED' && (
              <button onClick={() => onStatusChange(inv, 'VOID')}
                style={{ background:'#fff', color:'#880e4f', border:'1px solid #f48fb1', borderRadius:8, padding:'6px 13px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                🚫 Void
              </button>
            )}
            {inv.status === 'DRAFT' && (
              <button onClick={() => onStatusChange(inv, 'CANCELLED')}
                style={{ background:'#fff', color:'#c62828', border:'1px solid #ef9a9a', borderRadius:8, padding:'6px 13px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
                ✕ Cancel
              </button>
            )}
          </>)}
          <button onClick={() => onPrint({...inv, _contractor: cust})}
            style={{ background:'#1a2e3d', color:'#fff', border:'none', borderRadius:8, padding:'7px 14px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
            🖨️ Print
          </button>
          <button onClick={onBack}
            style={{ background:'#f0f4f8', color:'#445566', border:'none', borderRadius:8, padding:'7px 13px', cursor:'pointer', fontSize:12, fontWeight:700 }}>
            ← Back
          </button>
        </div>
      </div>

      {/* ══ ROW 2: Compact header — fits in the frame ══ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>

        {/* ── Left card: Customer ── */}
        <div style={{ background:'#fff', border:'1px solid #e8edf2', borderRadius:12, padding:'14px 16px', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize:10, fontWeight:800, color:'#1565c0', textTransform:'uppercase', letterSpacing:0.6, marginBottom:8 }}>Customer</div>

          {/* Name + address stacked */}
          <div style={{ fontSize:14, fontWeight:800, color:'#1565c0', marginBottom:3 }}>{custName}</div>
          {addrLines.map((l,i) => <div key={i} style={{ fontSize:11, color:'#546e7a', lineHeight:1.6 }}>{l}</div>)}
          {vatNo && <div style={{ fontSize:11, color:'#546e7a' }}>VAT: {vatNo}</div>}
          {crNo  && <div style={{ fontSize:11, color:'#546e7a' }}>CR: {crNo}</div>}

          <div style={{ height:1, background:'#f0f4f8', margin:'10px 0' }} />

          {/* Key reference fields in a tight 2-col grid */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px 12px' }}>
            {[
              ['PO Number',  inv.po_number,  true],
              ['Department', inv.department, false],
              ['Project No', inv.project_no, true],
              ['Billing',    inv.billing_mode, false],
            ].map(([lbl,val,mono])=>(
              <div key={lbl}>
                <div style={{ fontSize:9, color:'#aab2bd', fontWeight:700, textTransform:'uppercase', letterSpacing:0.3 }}>{lbl}</div>
                <div style={{ fontSize:12, fontWeight:600, color:'#1a2e3d', fontFamily:mono?'monospace':undefined, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {val || <span style={{ color:'#ddd' }}>—</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right card: Invoice financials ── */}
        <div style={{ background:'#fff', border:'1px solid #e8edf2', borderRadius:12, padding:'14px 16px', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize:10, fontWeight:800, color:'#0277bd', textTransform:'uppercase', letterSpacing:0.6, marginBottom:8 }}>Invoice Details</div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 12px', marginBottom:10 }}>
            {[
              ['Invoice Date', inv.invoice_date,  '#1a2e3d'],
              ['Due Date',     inv.due_date,       '#e65100'],
              ['Subtotal (Ex-VAT)', `SAR ${fmt(inv.subtotal)}`,    '#1a2e3d'],
              ['VAT Amount',        `SAR ${fmt(inv.vat_amount)}`,  '#1a2e3d'],
            ].map(([lbl,val,col])=>(
              <div key={lbl}>
                <div style={{ fontSize:9, color:'#aab2bd', fontWeight:700, textTransform:'uppercase', letterSpacing:0.3 }}>{lbl}</div>
                <div style={{ fontSize:12, fontWeight:600, color:col }}>{val || '—'}</div>
              </div>
            ))}
          </div>

          {/* Total + Net payable highlight strip */}
          <div style={{ background:'linear-gradient(135deg,#e3f2fd,#f0f7ff)', borderRadius:8, padding:'10px 12px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:12, color:'#546e7a', fontWeight:700 }}>Total (Incl. VAT)</span>
              <span style={{ fontSize:14, fontWeight:900, color:'#1565c0' }}>SAR {fmt(inv.total_amount)}</span>
            </div>
            {retAmt > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:11, color:'#6a1b9a', fontWeight:700 }}>Less Retention ({inv.retention_pct}%)</span>
                <span style={{ fontSize:12, fontWeight:800, color:'#6a1b9a' }}>(SAR {fmt(retAmt)})</span>
              </div>
            )}
            <div style={{ height:1, background:'rgba(21,101,192,0.15)', margin:'6px 0' }} />
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:13, color:'#2e7d32', fontWeight:800 }}>Net Payable</span>
              <span style={{ fontSize:15, fontWeight:900, color:'#2e7d32' }}>SAR {fmt(netP)}</span>
            </div>
          </div>

          {inv.qr_code && (
            <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}>
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=64x64&data=${encodeURIComponent(inv.qr_code)}`}
                alt="QR" style={{ width:64, height:64, border:'1px solid #e8edf2', borderRadius:6 }} />
            </div>
          )}
        </div>
      </div>

      {/* ══ Collapsible: ZATCA Fields ══ */}
      <Collapsible title="ZATCA & Invoice Classification" icon="🔐" accent="#6a1b9a">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ display:'flex', gap:10 }}>
              <span style={{ fontSize:11, color:'#6b7c93', fontWeight:700, width:130 }}>Invoice Type</span>
              <span style={{ fontSize:12, color:'#1a2e3d', fontWeight:600 }}>{typeInfo?.label?.replace(' (B2B)','') || 'Standard'}</span>
            </div>
            {[['Is Third Party',false],['Is Export',false]].map(([lbl,val])=>(
              <div key={lbl} style={{ display:'flex', gap:10, alignItems:'center' }}>
                <span style={{ fontSize:11, color:'#6b7c93', fontWeight:700, width:130 }}>{lbl}</span>
                <input type="checkbox" disabled checked={val} />
              </div>
            ))}
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[['Is Nominal',false],['Is Summary',false],['Is Self Billed',false]].map(([lbl,val])=>(
              <div key={lbl} style={{ display:'flex', gap:10, alignItems:'center' }}>
                <span style={{ fontSize:11, color:'#6b7c93', fontWeight:700, width:130 }}>{lbl}</span>
                <input type="checkbox" disabled checked={val} />
              </div>
            ))}
          </div>
        </div>
      </Collapsible>

      {/* ══ Collapsible: Payment Info ══ */}
      <Collapsible title="Payment Information" icon="💳" accent="#2e7d32">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
          {[
            ['Payment Reference', inv.invoice_number, true],
            ['Payment Means',     'Bank Account',     false],
            ['Journal',           'Customer Invoices in SAR', false],
            ['Payment Mode',      'Bank Transfer',    false],
          ].map(([lbl,val,mono])=>(
            <div key={lbl}>
              <div style={{ fontSize:9, color:'#aab2bd', fontWeight:700, textTransform:'uppercase', letterSpacing:0.3, marginBottom:2 }}>{lbl}</div>
              <div style={{ fontSize:12, fontWeight:600, color:'#1a2e3d', fontFamily:mono?'monospace':undefined }}>{val || '—'}</div>
            </div>
          ))}
        </div>
      </Collapsible>

      {/* ══ Collapsible: Other Info ══ */}
      <Collapsible title="Billing & Notes" icon="ℹ️" accent="#0277bd">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div style={{ display:'grid', gap:8 }}>
            {[
              ['Incoming PO', inv.incoming_po_id ? 'Linked' : 'Manual Invoice'],
              ['Billing Mode', inv.billing_mode || 'N/A'],
              ['Retention %', inv.retention_pct > 0 ? `${inv.retention_pct}%` : 'None'],
              ['Retention Amt', retAmt > 0 ? `SAR ${fmt(retAmt)}` : '—'],
              ['Discount', inv.discount_amount > 0 ? `SAR ${fmt(inv.discount_amount)}` : '—'],
              ['Advance', inv.advance_amount > 0 ? `SAR ${fmt(inv.advance_amount)}` : '—'],
            ].map(([lbl,val])=>(
              <div key={lbl} style={{ display:'flex', gap:8 }}>
                <span style={{ fontSize:11, color:'#6b7c93', fontWeight:700, width:130, flexShrink:0 }}>{lbl}</span>
                <span style={{ fontSize:12, color:'#1a2e3d', fontWeight:600 }}>{val}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize:10, color:'#aab2bd', fontWeight:700, textTransform:'uppercase', marginBottom:6 }}>Notes</div>
            <div style={{ background:'#f8faff', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#445566', lineHeight:1.6, minHeight:70 }}>
              {inv.notes || <span style={{ color:'#ccc' }}>No notes</span>}
            </div>
            {inv.ref_invoice_number && (
              <div style={{ marginTop:10 }}>
                <div style={{ fontSize:9, color:'#aab2bd', fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>Ref Invoice #</div>
                <div style={{ fontSize:12, fontFamily:'monospace', fontWeight:700, color:'#c62828' }}>{inv.ref_invoice_number}</div>
              </div>
            )}
          </div>
        </div>
      </Collapsible>

      {/* ══ Bottom Tabs ══ */}
      <div style={{ background:'#fff', border:'1px solid #e8edf2', borderRadius:12, boxShadow:'0 1px 4px rgba(0,0,0,0.05)', overflow:'hidden' }}>

        {/* Tab bar */}
        <div style={{ display:'flex', borderBottom:'2px solid #e8edf2', padding:'0 16px', background:'#fafbfc' }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{
                padding:'11px 18px', border:'none', cursor:'pointer', fontSize:12, fontWeight:700,
                background:'transparent', color: activeTab===t.key ? '#1565c0' : '#6b7c93',
                borderBottom: activeTab===t.key ? '3px solid #1565c0' : '3px solid transparent',
                marginBottom:-2, transition:'all 0.15s', whiteSpace:'nowrap',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Invoice Lines ── */}
        {activeTab==='lines' && (
          <div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#f5f7fa', borderBottom:'2px solid #e8edf2' }}>
                  {['Product / Description','Label','Account','VAT Category','Quantity','UoM','Unit Price','Taxes','Subtotal'].map(h=>(
                    <th key={h} style={{ padding:'9px 10px', textAlign:['Quantity','Unit Price','Subtotal'].includes(h)?'right':'left', fontSize:11, color:'#6b7c93', fontWeight:700, whiteSpace:'nowrap', borderRight:'1px solid #f0f4f8' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(inv.invoice_lines||[]).length===0
                  ? <tr><td colSpan={9} style={{ textAlign:'center', padding:32, color:'#aab2bd', fontSize:13 }}>No line items on this invoice</td></tr>
                  : (inv.invoice_lines||[]).map((l,i)=>{
                      if (l.is_header) {
                        return (
                          <tr key={l.id||i} style={{ background:'#1e3a5f', borderBottom:'2px solid #4fc3f7' }}>
                            <td colSpan={9} style={{ padding:'8px 14px', fontWeight:800, fontSize:12, color:'#e3f2fd', letterSpacing:0.5 }}>▸ {l.description}</td>
                          </tr>
                        )
                      }
                      const vr = parseFloat(l.vat_rate)||15
                      const isZero = vr===0
                      const subT = parseFloat(l.line_total || (parseFloat(l.unit_price||0)*parseFloat(l.quantity||0))).toFixed(2)
                      return (
                        <tr key={l.id||i} style={{ borderBottom:'1px solid #f0f4f8', background:i%2===0?'#fff':'#fafcff' }}>
                          <td style={{ padding:'10px', fontSize:12, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'#1565c0', fontWeight:600 }} title={l.description}>{l.description}</td>
                          <td style={{ padding:'10px', fontSize:12, color:'#445566', maxWidth:190 }}>{l.description}</td>
                          <td style={{ padding:'10px', fontSize:11, color:'#6b7c93', fontFamily:'monospace', whiteSpace:'nowrap' }}>479100 Product Sales</td>
                          <td style={{ padding:'10px' }}>
                            <span style={{ background:isZero?'#e8f5e9':'#e8f0fe', color:isZero?'#2e7d32':'#1565c0', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:700, whiteSpace:'nowrap' }}>
                              {isZero ? 'Zero-Rated / Exempt' : 'Standard rate'}
                            </span>
                          </td>
                          <td style={{ padding:'10px', fontSize:12, textAlign:'right' }}>{parseFloat(l.quantity||0).toFixed(6)}</td>
                          <td style={{ padding:'10px', fontSize:11, color:'#6b7c93' }}>Units</td>
                          <td style={{ padding:'10px', fontSize:12, textAlign:'right', fontWeight:600 }}>{fmt(l.unit_price)}</td>
                          <td style={{ padding:'10px' }}>
                            <span style={{ background:'#e8f0fe', color:'#1565c0', borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:700, border:'1px solid #90caf9', whiteSpace:'nowrap' }}>
                              Vat {vr}%
                            </span>
                          </td>
                          <td style={{ padding:'10px', fontSize:13, textAlign:'right', fontWeight:800 }}>{fmt(subT)} SR</td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>

            {/* Totals summary — right-aligned block */}
            {(inv.invoice_lines||[]).length > 0 && (
              <div style={{ display:'flex', justifyContent:'flex-end', borderTop:'1px solid #f0f4f8', padding:'14px 16px 0' }}>
                <div style={{ width:320 }}>
                  {[
                    ['Taxes',          `${fmt(inv.vat_amount)} SR`],
                    ['Untaxed Amount', `${fmt(inv.subtotal)} SR`],
                    ['Discount',       '0.00 SR'],
                    ['Total Discount', '0.00'],
                    ['Advance Amount', `${fmt(inv.advance_amount||0)}`],
                  ].map(([lbl,val])=>(
                    <div key={lbl} style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', fontSize:12, color:'#546e7a' }}>
                      <span style={{ fontWeight:700 }}>{lbl}:</span><span>{val}</span>
                    </div>
                  ))}
                  <div style={{ height:1, background:'#e8edf2', margin:'8px 0' }} />
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:15, fontWeight:900, color:'#1a2e3d' }}>
                    <span>Total:</span><span>{fmt(inv.total_amount)} SR</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:14, fontWeight:900, color:'#1a2e3d' }}>
                    <span>Amount Due:</span><span>{fmt(netP)} SR</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:13, fontWeight:800, color:'#e65100' }}>
                    <span>Taxes (SAR):</span><span>{fmt(inv.vat_amount)} SR</span>
                  </div>
                  {retAmt > 0 && (
                    <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:13, fontWeight:800, color:'#6a1b9a' }}>
                      <span>Less Retention ({inv.retention_pct}%):</span><span>({fmt(retAmt)} SR)</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* KSA Note */}
            <div style={{ padding:'12px 16px', borderTop:'1px solid #f0f4f8', marginTop:8, background:'#fafbfc' }}>
              <div style={{ fontSize:11, fontWeight:800, color:'#546e7a', marginBottom:6 }}>Ksa Note</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, fontSize:12, color:'#546e7a' }}>
                <div><strong>Advance Type : </strong>Percentage</div>
                <div><strong>Advance Rate : </strong>{fmt(inv.advance_amount||0)}</div>
                <div><strong>Discount Type : </strong>Percentage</div>
                <div><strong>Discount Rate : </strong>{fmt(inv.discount_amount||0)}</div>
              </div>
            </div>
          </div>
        )}

        {/* ── E-Invoice Information ── */}
        {activeTab==='einvoice' && (
          <div style={{ padding:'18px 16px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:800, color:'#6a1b9a', textTransform:'uppercase', marginBottom:12 }}>ZATCA Phase 1 QR Code</div>
              {inv.qr_code
                ? <div style={{ textAlign:'center' }}>
                    <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(inv.qr_code)}`}
                      alt="QR" style={{ width:180, height:180, border:'1px solid #e8edf2', borderRadius:12, padding:6 }} />
                    <div style={{ fontSize:11, color:'#aab2bd', marginTop:8 }}>Scan with ZATCA mobile app</div>
                  </div>
                : <div style={{ color:'#aab2bd', fontSize:12 }}>QR not generated (draft invoice)</div>
              }
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:800, color:'#6a1b9a', textTransform:'uppercase', marginBottom:12 }}>E-Invoice Details</div>
              <div style={{ display:'grid', gap:10 }}>
                <DField label="Invoice Type"      value={typeInfo?.label} />
                <DField label="Invoice UUID"      value={inv.id} mono />
                <DField label="Issue Date"        value={inv.invoice_date} />
                <DField label="E-Invoice Status"  value="Not Sent to ZATCA" color='#e65100' />
                <DField label="ZATCA Phase"       value="Phase 1 (Offline QR)" />
                <DField label="Phase 2"           value="Pending portal integration" color='#aab2bd' />
              </div>
            </div>
            {inv.qr_code && (
              <div style={{ gridColumn:'1/-1', background:'#f8faff', borderRadius:8, padding:'10px 14px' }}>
                <div style={{ fontSize:10, fontWeight:800, color:'#6b7c93', textTransform:'uppercase', marginBottom:6 }}>QR Code Data (TLV Base64)</div>
                <div style={{ fontFamily:'monospace', fontSize:10, color:'#445566', wordBreak:'break-all', lineHeight:1.8 }}>{inv.qr_code}</div>
              </div>
            )}
          </div>
        )}

        {/* ── Other Info ── */}
        {activeTab==='other' && (
          <div style={{ padding:'18px 16px' }}>
            <Collapsible title="Billing & PO Details" defaultOpen={true} accent="#0277bd">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {[
                  ['Incoming PO', inv.incoming_po_id ? 'Linked' : 'Manual Invoice'],
                  ['Billing Mode', inv.billing_mode || 'N/A'],
                  ['Retention %', inv.retention_pct > 0 ? `${inv.retention_pct}%` : 'None'],
                  ['Retention Amount', retAmt > 0 ? `SAR ${fmt(retAmt)}` : '—'],
                  ['Discount Amount', inv.discount_amount > 0 ? `SAR ${fmt(inv.discount_amount)}` : '—'],
                  ['Advance Payment', inv.advance_amount > 0 ? `SAR ${fmt(inv.advance_amount)}` : '—'],
                ].map(([lbl,val])=>(<DField key={lbl} label={lbl} value={val} />))}
              </div>
            </Collapsible>
            <Collapsible title="Notes & References" defaultOpen={true} accent="#546e7a">
              <div style={{ background:'#f8faff', borderRadius:8, padding:'10px 12px', fontSize:13, color:'#445566', lineHeight:1.6, minHeight:60, marginBottom:10 }}>
                {inv.notes || <span style={{ color:'#ccc' }}>No notes</span>}
              </div>
              {inv.ref_invoice_number && <DField label="Ref Invoice #" value={inv.ref_invoice_number} mono />}
            </Collapsible>
          </div>
        )}

        {/* ── Zatca Response ── */}
        {activeTab==='zatca' && (
          <div style={{ textAlign:'center', padding:'50px 20px' }}>
            <div style={{ fontSize:52, marginBottom:16 }}>📡</div>
            <div style={{ fontSize:16, fontWeight:800, color:'#1a2e3d', marginBottom:8 }}>ZATCA Portal Integration — Phase 2</div>
            <div style={{ fontSize:13, color:'#6b7c93', maxWidth:400, margin:'0 auto', lineHeight:1.7 }}>
              This section will display the real-time clearance / reporting response from the ZATCA portal once the integration is completed.<br/><br/>
              <strong>Planned for Phase 2</strong> after ZATCA sandbox testing and CCSID certificate setup.
            </div>
            <div style={{ display:'inline-flex', gap:8, marginTop:24, background:'#fff3e0', borderRadius:10, padding:'10px 20px', fontSize:12, color:'#e65100', fontWeight:700 }}>
              ⏳ Status: Not Sent to ZATCA
            </div>
          </div>
        )}

      </div>
    </div>
  )
}


// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function Invoices({ entityId, entityCode, entityVatNumber, entityName, entityNameEn, entityNameAr }) {
  const [invoices,    setInvoices]    = useState([])
  const [contractors, setContractors] = useState([])
  const [allocPaidMap, setAllocPaidMap] = useState({})  // invoiceId → total paid from allocations
  const [allPos,      setAllPos]      = useState([])
  const [loading,     setLoading]     = useState(true)
  const [showBanner,  setShowBanner]  = useState(false)  // Step 0 banner
  const [open,        setOpen]        = useState(false)
  const [wizardStep,  setWizardStep]  = useState(1)      // 1-4 wizard steps
  const [saving,      setSaving]      = useState(false)
  const [detailInv,   setDetailInv]   = useState(null)   // ← detail view state
  const [printInv,    setPrintInv]    = useState(null)
  const [pickerInv,   setPickerInv]   = useState(null)   // ← template picker state
  const [filter,      setFilter]      = useState('ALL')
  const [searchStr,   setSearchStr]   = useState('')
  const [expandedInvRows, setExpandedInvRows] = useState(new Set())

  // Form state
  const [invDate,     setInvDate]     = useState(new Date().toISOString().split('T')[0])
  const [dueDate,     setDueDate]     = useState('')
  const [invType,     setInvType]     = useState('TAX')
  const [custId,      setCustId]      = useState('')
  const [selectedPo,  setSelectedPo]  = useState(null)
  const [billingMode, setBillingMode] = useState('QTY')
  const [dept,        setDept]        = useState('')
  const [projectNo,   setProjectNo]   = useState('')
  const [selDeptKey,  setSelDeptKey]  = useState('')   // cascade: dept filter for project dropdown
  const [selProjNum,  setSelProjNum]  = useState('')   // cascade: project filter for PO dropdown
  const [poNumber,    setPoNumber]    = useState('')
  const [refInvNo,    setRefInvNo]    = useState('')
  const [notes,       setNotes]       = useState('')
  const [currency,    setCurrency]    = useState('SAR')
  const [exchangeRate,setExchangeRate]= useState('')   // SAR per 1 foreign unit (e.g. 3.75 for USD)
  const [retentionPct,setRetentionPct]= useState(0)
  const [lines,       setLines]       = useState([{ ...EMPTY_LINE }])
  const [pctToBill,   setPctToBill]   = useState('')
  const [pctDesc,     setPctDesc]     = useState('')
  const [pctVatRate,  setPctVatRate]  = useState('15')
  const [milestones,  setMilestones]  = useState([])
  // Retention release
  const [retInvoices,      setRetInvoices]      = useState([])   // invoices with retention
  const [selRetInvIds,     setSelRetInvIds]      = useState([])   // selected for release
  // Standalone billing (no PO linked)
  const [contractValue, setContractValue] = useState('')
  const [standaloneMilestones, setStandaloneMilestones] = useState([
    { id:1, name:'', pct:'', amount:'', vatRate:'15', selected:false }
  ])
  const EMPTY_MS = { name:'', pct:'', amount:'', vatRate:'15', selected:false }
  // Entity & contractor auto-fill
  const [entityCR,     setEntityCR]     = useState('')
  const [entityAddr,   setEntityAddr]   = useState('')
  const [custVat,      setCustVat]      = useState('')
  const [custAddr,     setCustAddr]     = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')

  const prefix    = PREFIX_MAP[entityCode] || 'INV'
  const typeInfo  = INV_TYPES.find(t => t.key === invType) || INV_TYPES[0]
  const vatLocked = invType === 'ZERO_RATED'
  const isRefType = invType === 'CREDIT_NOTE' || invType === 'DEBIT_NOTE'

  // ── Derived totals ────────────────────────────────────────────────
  let subtotalExVat=0, vatTotal=0, lineItems=[]
  if (billingMode==='QTY') {
    lines.forEach(l => {
      if (l.is_header) return   // header rows carry no amounts
      const qty=parseFloat(l.quantity)||0, up=parseFloat(l.unit_price)||0
      const vr=vatLocked?0:(parseFloat(l.vat_rate)||0)
      subtotalExVat += qty*up; vatTotal += qty*up*(vr/100)
    })
    lineItems = lines
  } else if (billingMode==='PERCENTAGE') {
    const pct=parseFloat(pctToBill)||0, poVal=selectedPo?.total_value||0
    const amount=pct/100*poVal, vr=vatLocked?0:(parseFloat(pctVatRate)||15)
    subtotalExVat=amount; vatTotal=amount*(vr/100)
    lineItems=[{ description:pctDesc||`${pct}% of PO ${selectedPo?.contractor_po_number||''}`, quantity:'1', unit_price:amount.toFixed(2), vat_rate:String(vr), vat_amount:amount*(vr/100), line_total:amount+(amount*(vr/100)) }]
  } else if (billingMode==='MILESTONE') {
    if (selectedPo) {
      milestones.filter(m=>m.selected).forEach(m => {
        const up=(m.unit_price||0)*(m.qty||1), vr=vatLocked?0:15
        subtotalExVat+=up; vatTotal+=up*(vr/100)
      })
      lineItems=milestones.filter(m=>m.selected).map(m=>({
        description:m.description, quantity:'1', unit_price:String((m.unit_price||0)*(m.qty||1)),
        vat_rate:vatLocked?'0':'15', vat_amount:(m.unit_price||0)*(m.qty||1)*(vatLocked?0:0.15),
        line_total:(m.unit_price||0)*(m.qty||1)*(vatLocked?1:1.15), po_line_id:m.id,
      }))
    } else {
      // Standalone milestones (no PO)
      standaloneMilestones.filter(m=>m.selected).forEach(m => {
        const amt=parseFloat(m.amount)||0, vr=vatLocked?0:(parseFloat(m.vatRate)||15)
        subtotalExVat+=amt; vatTotal+=amt*(vr/100)
      })
      lineItems=standaloneMilestones.filter(m=>m.selected).map((m,i)=>({
        description:m.name||`Milestone ${i+1}`, quantity:'1',
        unit_price:String(parseFloat(m.amount)||0),
        vat_rate:vatLocked?'0':String(parseFloat(m.vatRate)||15),
        vat_amount:(parseFloat(m.amount)||0)*(vatLocked?0:(parseFloat(m.vatRate)||15)/100),
        line_total:(parseFloat(m.amount)||0)*(1+(vatLocked?0:(parseFloat(m.vatRate)||15)/100)),
      }))
    }
  } else if (billingMode==='RETENTION_RELEASE') {
    selRetInvIds.forEach(id => {
      const inv = retInvoices.find(i => i.id === id)
      if (!inv) return
      const retAmt = +inv.retention_amount || 0
      subtotalExVat += retAmt
      // Retention was already taxed on original invoice — release is VAT-exempt (the VAT was already paid)
    })
    lineItems = selRetInvIds.map(id => {
      const inv = retInvoices.find(i => i.id === id)
      if (!inv) return null
      const retAmt = +inv.retention_amount || 0
      return { description:`Retention Release — ${inv.invoice_number}`, quantity:'1', unit_price:String(retAmt), vat_rate:'0', vat_amount:0, line_total:retAmt }
    }).filter(Boolean)
  } else if (billingMode==='PERCENTAGE' && !selectedPo && contractValue) {
    const base=parseFloat(contractValue)||0, pct=parseFloat(pctToBill)||0
    const amount=pct/100*base, vr=vatLocked?0:(parseFloat(pctVatRate)||15)
    subtotalExVat=amount; vatTotal=amount*(vr/100)
    lineItems=[{ description:pctDesc||`${pct}% progress billing`, quantity:'1', unit_price:amount.toFixed(2), vat_rate:String(vr), vat_amount:amount*(vr/100), line_total:amount+(amount*(vr/100)) }]
  }
  const grandTotal   = subtotalExVat + vatTotal
  const retentionAmt = retentionPct > 0 ? subtotalExVat*(retentionPct/100) : 0
  const netPayable   = grandTotal - retentionAmt

  // ── Load ──────────────────────────────────────────────────────────
  useEffect(() => { if (entityId) load() }, [entityId])

  async function load() {
    setLoading(true)
    const [{ data:inv }, { data:cons }, { data:entData }] = await Promise.all([
      supabase.from('invoices').select('*').eq('entity_id',entityId).order('invoice_date',{ascending:false}),
      supabase.from('contractors').select('*').eq('entity_id',entityId).eq('vendor_type','CONTRACTOR').order('contractor_name'),
      supabase.from('entities').select('cr_number,address,entity_address').eq('id',entityId).maybeSingle(),
    ])
    if (entData) { setEntityCR(entData.cr_number||''); setEntityAddr(entData.address||entData.entity_address||'') }
setInvoices(inv||[])
    setContractors(cons||[])
    // Load payment allocations for ISSUED invoices to show outstanding balance
    const issuedIds = (inv||[]).filter(i=>i.status==='ISSUED').map(i=>i.id)
    if (issuedIds.length > 0) {
      const { data:allocs } = await supabase.from('payment_allocations')
        .select('invoice_id, amount_allocated').in('invoice_id', issuedIds)
      const pm = {}
      ;(allocs||[]).forEach(a => { pm[a.invoice_id] = (pm[a.invoice_id]||0) + (a.amount_allocated||0) })
      setAllocPaidMap(pm)
    } else {
      setAllocPaidMap({})
    }
    setLoading(false)
  }

  // ── Open detail — always fetch lines fresh from DB ────────────────
  async function openDetail(inv) {
    const { data:lines } = await supabase
      .from('invoice_lines').select('*')
      .eq('invoice_id', inv.id)
      .order('sort_order', { ascending:true })
    setDetailInv({ ...inv, invoice_lines: lines || [] })
  }

  // ── Customer / PO loading ─────────────────────────────────────────
  async function onCustomerChange(cId) {
    setCustId(cId); setSelectedPo(null); setLines([{...EMPTY_LINE}]); setMilestones([]); setPctToBill(''); setBillingMode('QTY'); setRetentionPct(0); setPoNumber(''); setDept(''); setProjectNo(''); setSelDeptKey(''); setSelProjNum(''); setSelRetInvIds([])
    // Auto-set currency + VAT + address from contractor record
    const con = contractors.find(c => c.id === cId)
    if (con?.currency && con.currency !== 'SAR') { setCurrency(con.currency); setExchangeRate('3.75') }
    else { setCurrency('SAR'); setExchangeRate('') }
    setCustVat(con?.vat_number || con?.tax_number || '')
    setCustAddr(con?.address || con?.contractor_address || '')
    if (!cId) { setAllPos([]); setRetInvoices([]); return }
    const [{ data: pos }, { data: retInvs }] = await Promise.all([
      supabase.from('incoming_pos').select('*, departments(dept_name,dept_code), projects(project_number,project_name), incoming_po_items(*)').eq('entity_id',entityId).eq('contractor_id',cId).in('status',['ACTIVE','INVOICED']).order('po_date',{ascending:false}),
      supabase.from('invoices').select('id,invoice_number,invoice_date,retention_amount,retention_pct,status').eq('entity_id',entityId).eq('contractor_id',cId).gt('retention_amount',0).in('status',['ISSUED','PAID']).order('invoice_date',{ascending:false}),
    ])
    setAllPos(pos||[])
    setRetInvoices(retInvs||[])
  }

  function onPoChange(poId) {
    if (!poId) { setSelectedPo(null); setLines([{...EMPTY_LINE}]); setMilestones([]); setPctToBill(''); setBillingMode('QTY'); setRetentionPct(0); return }
    const po = allPos.find(p=>p.id===poId); if (!po) return
    setSelectedPo(po); setBillingMode(po.billing_mode||'QTY'); setRetentionPct(po.retention_pct||0)
    setPoNumber(po.contractor_po_number||'')
    const dKey=po.departments?.dept_code||po.departments?.dept_name||''; setDept(po.departments?.dept_name||dKey); setSelDeptKey(dKey)
    const pNum=po.projects?.project_number||''; setProjectNo(pNum); setSelProjNum(pNum)
    setPaymentTerms(po.payment_terms || po.payment_condition || '')
    const items = po.incoming_po_items||[]
    if ((po.billing_mode||'QTY')==='QTY') {
      const rem = items.map(item=>{
        if (item.is_header) {
          return { po_line_id:null, description:item.description||'', quantity:'0', unit_price:'0', vat_rate:'0', vat_amount:0, line_total:0, is_header:true, _qty_remaining:0, _qty_total:0, _qty_invoiced:0, _fully_billed:false }
        }
        const qtyInv = item.qty_invoiced || 0
        const qtyRem = Math.max(0, (item.qty||0) - qtyInv)
        return { po_line_id:item.id, description:item.description||'', quantity:'0', unit_price:String(item.unit_price||''), vat_rate:'15', vat_amount:0, line_total:0, is_header:false, _qty_remaining:qtyRem, _qty_total:item.qty||0, _qty_invoiced:qtyInv, _fully_billed:qtyInv>=(item.qty||0) }
      })
      // Show all lines — fully-billed ones pre-filled with 0 so user sees the full picture
      setLines(rem.length>0?rem:[{...EMPTY_LINE}])
    } else if ((po.billing_mode||'QTY')==='PERCENTAGE') {
      setPctToBill(String(Math.max(0,100-(po.pct_invoiced||0)))); setPctDesc(`Progress billing — ${po.contractor_po_number}`)
    } else if ((po.billing_mode||'QTY')==='MILESTONE') {
      setMilestones(items.filter(m=>!m.is_milestone_done).map(m=>({...m,selected:false})))
    }
  }

  // ── Invoice number ────────────────────────────────────────────────
  async function generateInvoiceNumber() {
    const d=new Date(invDate), year=d.getFullYear(), month=String(d.getMonth()+1).padStart(2,'0')
    const pattern=`${prefix}/${year}/${month}/%`
    const { data } = await supabase.from('invoices').select('invoice_number').eq('entity_id',entityId).ilike('invoice_number',pattern).order('invoice_number',{ascending:false}).limit(1)
    const last=data?.[0]?.invoice_number, seq=last?(parseInt(last.split('/').pop())||0)+1:1
    return `${prefix}/${year}/${month}/${String(seq).padStart(4,'0')}`
  }

  function updateLine(idx,updated){ setLines(prev=>prev.map((l,i)=>i===idx?updated:l)) }
  function removeLine(idx)        { setLines(prev=>prev.filter((_,i)=>i!==idx)) }
  function addLine()              { setLines(prev=>[...prev,{...EMPTY_LINE,vat_rate:vatLocked?'0':'15'}]) }

  // ── Save ──────────────────────────────────────────────────────────
  async function save(draft=false) {
    if (!custId&&!isRefType) { alert('Contractor is required'); return }
    // Only keep header rows and data rows where Bill Qty > 0.
    // Lines with Bill Qty = 0 are intentionally skipped for this invoice.
    const validLines = lineItems.filter(l => l.is_header || parseFloat(l.quantity) > 0)
    if (!validLines.some(l=>!l.is_header)) { alert('Add at least one line item'); return }
    setSaving(true)
    const invNumber=await generateInvoiceNumber()
    const sub=parseFloat(subtotalExVat.toFixed(2)), vat=parseFloat(vatTotal.toFixed(2)), tot=parseFloat(grandTotal.toFixed(2)), ret=parseFloat(retentionAmt.toFixed(2)), net=parseFloat(netPayable.toFixed(2))
    const exRate = currency !== 'SAR' ? (parseFloat(exchangeRate)||3.75) : 1
    const totSar = parseFloat((tot * exRate).toFixed(2))
    const vatSar = parseFloat((vat * exRate).toFixed(2))
    // ZATCA QR always in SAR
    const qr=generateZATCAQR({ sellerName:entityNameEn||entityName||'Ratal Group', vatNumber:entityVatNumber||'300000000000003', invoiceDate:invDate, total:totSar, vat:vatSar })
    const { data:inv, error } = await supabase.from('invoices').insert({
      entity_id:entityId, invoice_number:invNumber, invoice_date:invDate, due_date:dueDate||null,
      contractor_id:custId||null, invoice_type:invType, incoming_po_id:selectedPo?.id||null,
      billing_mode:billingMode, department:dept||null, project_no:projectNo||null, po_number:poNumber||null,
      ref_invoice_number:refInvNo||null, subtotal:sub, vat_amount:vat, total_amount:tot,
      retention_pct:retentionPct, retention_amount:ret, net_payable:net, qr_code:qr, notes:notes||null,
      currency:currency||'SAR', exchange_rate_sar:currency!=='SAR'?exRate:1,
      total_amount_sar:totSar,
      status:draft?'DRAFT':'ISSUED',
    }).select().single()
    if (error) { alert(error.message); setSaving(false); return }
    if (inv?.id&&validLines.length>0) {
      const { error: lineErr } = await supabase.from('invoice_lines').insert(validLines.map((l,i)=>({
        invoice_id:inv.id, is_header:!!l.is_header,
        po_line_id:l.is_header?null:(l.po_line_id||null),
        description:l.description||'', part_no:l.part_no||null,
        quantity:l.is_header?0:(parseFloat(l.quantity)||0), unit_price:l.is_header?0:(parseFloat(l.unit_price)||0),
        vat_rate:l.is_header?0:(vatLocked?0:(parseFloat(l.vat_rate)||15)), vat_amount:l.is_header?0:(vatLocked?0:(l.vat_amount||0)),
        line_total:l.is_header?0:(l.line_total||0), sort_order:i,
      })))
      if (lineErr) {
        console.error('[Invoices] line insert error:', lineErr.message)
        alert(`⚠️ Invoice was created (${invNumber}) but line items failed to save.\n\nError: ${lineErr.message}\n\nPlease void this invoice and re-create it.`)
      }
    }
    if (selectedPo&&!draft) await updatePoTracking(sub)
    // Auto-post journal entry if saved directly as ISSUED
    if (!draft && inv?.id) {
      const contractorName = contractors.find(c => c.id === custId)?.contractor_name || ''
      if (invType === 'CREDIT_NOTE') {
        postCreditNoteJE({ entityId, invoice: inv, contractorName })
          .catch(e => console.error('autoPost credit note JE failed:', e))
      } else if (billingMode === 'RETENTION_RELEASE') {
        postRetentionReleaseJE({ entityId, invoice: inv, contractorName })
          .catch(e => console.error('autoPost retention release JE failed:', e))
      } else {
        postInvoiceJE({ entityId, invoice: inv, contractorName })
          .catch(e => console.error('autoPost invoice JE failed:', e))
      }
    }
    setSaving(false); resetForm(); setOpen(false); load()
  }

  async function updatePoTracking(invoicedExVat) {
    const po=selectedPo, newInvoiced=(po.total_invoiced_ex_vat||0)+invoicedExVat
    if (billingMode==='QTY') {
      for (const line of lines.filter(l=>!l.is_header&&parseFloat(l.quantity)>0&&l.po_line_id)) {
        const poItem=(po.incoming_po_items||[]).find(i=>i.id===line.po_line_id); if (!poItem) continue
        const newQ=(poItem.qty_invoiced||0)+(parseFloat(line.quantity)||0)
        await supabase.from('incoming_po_items').update({ qty_invoiced:newQ, line_status:newQ>=poItem.qty?'INVOICED':'PARTIAL' }).eq('id',line.po_line_id)
      }
      const { data:updatedItems } = await supabase.from('incoming_po_items').select('qty,qty_invoiced').eq('incoming_po_id',po.id)
      const allDone=updatedItems?.every(i=>(i.qty_invoiced||0)>=(i.qty||0))
      await supabase.from('incoming_pos').update({ total_invoiced_ex_vat:newInvoiced, billing_status:allDone?'FULLY_INVOICED':'PARTIALLY_INVOICED', status:allDone?'CLOSED':po.status }).eq('id',po.id)
    } else if (billingMode==='PERCENTAGE') {
      const newPct=Math.min(100,(po.pct_invoiced||0)+(parseFloat(pctToBill)||0))
      const done=newPct>=100
      await supabase.from('incoming_pos').update({ pct_invoiced:newPct, total_invoiced_ex_vat:newInvoiced, billing_status:done?'FULLY_INVOICED':'PARTIALLY_INVOICED', status:done?'CLOSED':po.status }).eq('id',po.id)
    } else if (billingMode==='MILESTONE') {
      for (const mid of milestones.filter(m=>m.selected).map(m=>m.id))
        await supabase.from('incoming_po_items').update({ is_milestone_done:true, line_status:'INVOICED' }).eq('id',mid)
      const { data:updatedItems } = await supabase.from('incoming_po_items').select('is_milestone_done').eq('incoming_po_id',po.id)
      const allDone=updatedItems?.every(i=>i.is_milestone_done)
      await supabase.from('incoming_pos').update({ total_invoiced_ex_vat:newInvoiced, billing_status:allDone?'FULLY_INVOICED':'PARTIALLY_INVOICED', status:allDone?'CLOSED':po.status }).eq('id',po.id)
    }
  }

  function resetForm() {
    const today=new Date().toISOString().split('T')[0]
    setInvDate(today); setDueDate(''); setInvType('TAX'); setCustId(''); setSelectedPo(null)
    setBillingMode('QTY'); setDept(''); setProjectNo(''); setPoNumber(''); setRefInvNo(''); setNotes(''); setSelDeptKey(''); setSelProjNum('')
    setCurrency('SAR'); setExchangeRate('')
    setRetentionPct(0); setLines([{...EMPTY_LINE}]); setPctToBill(''); setPctDesc(''); setPctVatRate('15'); setMilestones([]); setAllPos([])
    setContractValue(''); setStandaloneMilestones([{ id:1, ...EMPTY_MS }])
    setSelRetInvIds([]); setRetInvoices([]); setWizardStep(1)
    setCustVat(''); setCustAddr(''); setPaymentTerms('')
  }

  async function updateStatus(inv, newStatus) {
    if (['VOID','CANCELLED'].includes(newStatus)) {
      const confirmed = window.confirm(
        `${newStatus === 'VOID' ? 'Void' : 'Cancel'} invoice ${inv.invoice_number}?\n\nThis will reverse the accounting journal entry if one was posted. This cannot be undone.`
      )
      if (!confirmed) return
    }
    await supabase.from('invoices').update({ status:newStatus }).eq('id',inv.id)
    const contractorName = contractors.find(c => c.id === inv.contractor_id)?.contractor_name || ''
    if (newStatus === 'ISSUED') {
      if (inv.invoice_type === 'CREDIT_NOTE') {
        postCreditNoteJE({ entityId, invoice: inv, contractorName })
          .catch(e => console.error('autoPost credit note JE failed:', e))
      } else if (inv.billing_mode === 'RETENTION_RELEASE') {
        postRetentionReleaseJE({ entityId, invoice: inv, contractorName })
          .catch(e => console.error('autoPost retention release JE failed:', e))
      } else {
        postInvoiceJE({ entityId, invoice: inv, contractorName })
          .catch(e => console.error('autoPost invoice JE failed:', e))
      }
    } else if (['VOID','CANCELLED'].includes(newStatus)) {
      // Reverse the original JE to zero out the books
      voidInvoiceJE({
        entityId,
        invoiceId:     inv.id,
        invoiceNumber: inv.invoice_number,
        date:          new Date().toISOString().split('T')[0],
      }).catch(e => console.error('autoPost void reversal failed:', e))
    }
    load()
    if (detailInv?.id===inv.id) setDetailInv(prev => prev ? {...prev, status:newStatus} : null)
  }

  useEffect(() => { if (vatLocked) setLines(prev=>prev.map(l=>({...l,vat_rate:'0'}))) }, [invType])

  const filtered = invoices.filter(inv => {
    if (filter!=='ALL'&&inv.invoice_type!==filter&&inv.status!==filter) return false
    if (searchStr) {
      const q=searchStr.toLowerCase()
      return (inv.invoice_number||'').toLowerCase().includes(q)||(inv.po_number||'').toLowerCase().includes(q)||(inv.project_no||'').toLowerCase().includes(q)
    }
    return true
  })

  const custName = (id) => contractors.find(c=>c.id===id)?.contractor_name || '—'

  // ── Create Credit/Debit note from detail view ────────────────────
  function handleCreateNote(noteType, sourceInv) {
    resetForm()
    setInvType(noteType)
    setRefInvNo(sourceInv.invoice_number)
    setCustId(sourceInv.contractor_id || '')
    setNotes(`${noteType === 'CREDIT_NOTE' ? 'Credit' : 'Debit'} note against ${sourceInv.invoice_number}`)
    setDetailInv(null)
    setOpen(true)
  }

  // ── Detail view ───────────────────────────────────────────────────
  if (detailInv) {
    return (
      <>
        <InvoiceDetail
          inv={detailInv}
          contractors={contractors}
          onBack={() => setDetailInv(null)}
          onPrint={(inv) => setPickerInv(inv)}
          onStatusChange={updateStatus}
          onCreateNote={handleCreateNote}
          entityCode={entityCode}
          entityName={entityName||entityNameEn}
          entityNameAr={entityNameAr}
          entityVatNumber={entityVatNumber}
        />
        {/* Template picker & HTML print must also render in detail view */}
        {pickerInv && (
          <InvoiceTemplatePicker
            invoice={pickerInv}
            contractor={pickerInv._contractor || contractors.find(c=>c.id===pickerInv.customer_id)}
            entityCode={entityCode}
            entityName={entityName||entityNameEn||'Ratal Group'}
            entityVatNumber={entityVatNumber}
            onClose={() => setPickerInv(null)}
            onHtmlPrint={() => { setPrintInv(pickerInv); setPickerInv(null) }}
          />
        )}
        {printInv && (
          <InvoicePrint invoice={printInv} entityCode={entityCode} entityName={entityName||entityNameEn||'Ratal Group'} entityNameAr={entityNameAr} vatNumber={entityVatNumber} onClose={()=>setPrintInv(null)} />
        )}
      </>
    )
  }

  // ── List view ─────────────────────────────────────────────────────
  return (
    <>
    {/* ── Step 0 Banner ── */}
    <PageBanner
      isOpen={showBanner}
      onClose={() => setShowBanner(false)}
      onStart={() => { setShowBanner(false); resetForm(); setOpen(true) }}
      chapterL1="#C1A1A9"
      chapterL2="#FAF0F2"
      moduleColor={MC}
      chapterLabel="Chapter 04 · Finance"
      formTitle={['New', 'Invoice', 'to Client']}
      steps={['Header', 'Line Items', 'Tax & Totals', 'Attachments']}
      icon="🧾"
      description="Create an official VAT invoice linked to a project and PO. PDF is generated automatically and saved to Google Drive."
    />

    <ChapterPage
      chapterName="Finance"
      chapterIcon="💳"
      chapterColor={MC}
      chapterSubtitle="Invoices, credit notes, debit notes and billing"
      sectionTitle="Invoices"
      onNew={() => setShowBanner(true)}
      newLabel="+ New Invoice"
      filters={['ALL', ...INV_TYPES.map(t=>t.key), 'DRAFT','ISSUED','PAID']}
      activeFilter={filter}
      onFilter={setFilter}
      searchValue={searchStr}
      onSearch={setSearchStr}
      searchPlaceholder="Search invoice#, PO#, project…"
      kpis={[
        { label: 'Invoices',    value: filtered.length },
        { label: 'Total',       value: `SAR ${fmt(filtered.reduce((s,i)=>s+(i.total_amount||0),0))}` },
        { label: 'Net Payable', value: `SAR ${fmt(filtered.reduce((s,i)=>s+(i.net_payable||i.total_amount||0),0))}` },
      ]}
    >{/* custom table content — all original list + detail logic preserved below */}

      {/* ── Invoice List — sticky header, collapsible detail ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#fff', borderRadius:14, boxShadow:'0 2px 8px rgba(0,0,0,0.07)' }}>
        {loading ? <div style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>Loading...</div> : (
          <div style={{ flex:1, overflow:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:MC, position:'sticky', top:0, zIndex:2 }}>
                  {[
                    { h:'Invoice #',  w:'17%', align:'left'  },
                    { h:'Date',       w:'10%', align:'left'  },
                    { h:'Customer',   w:'25%', align:'left'  },
                    { h:'Type',       w:'10%', align:'left'  },
                    { h:'Total',      w:'12%', align:'right' },
                    { h:'Status',     w:'10%', align:'left'  },
                    { h:'Details',    w:'8%',  align:'center'},
                  ].map(col=>(
                    <th key={col.h} style={{ padding:'10px 10px', textAlign:col.align, fontSize:10, color:'#fff', fontWeight:800, whiteSpace:'nowrap', width:col.w }}>{col.h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length===0
                  ? <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'#aab2bd' }}>No invoices yet</td></tr>
                  : filtered.map((inv,i)=>{
                    const t       = INV_TYPES.find(x=>x.key===inv.invoice_type)
                    const name    = custName(inv.contractor_id)
                    const retAmt  = inv.retention_amount||0
                    const netP    = inv.net_payable||inv.total_amount||0
                    const isExp   = expandedInvRows.has(inv.id)
                    const toggleInv = () => setExpandedInvRows(prev => {
                      const next = new Set(prev); isExp ? next.delete(inv.id) : next.add(inv.id); return next
                    })
                    return (
                      <React.Fragment key={inv.id}>
                        <tr style={{ borderTop:'1px solid #f0f4f8', background:isExp?`${MC}08`:i%2===0?'#fff':'#fafcff', borderLeft:isExp?`3px solid ${MC}`:'3px solid transparent' }}>
                          <td style={{ padding:'9px 10px' }}>
                            <button onClick={() => openDetail(inv)}
                              style={{ background:'none', border:'none', color:'#1565c0', fontWeight:800, fontSize:12, cursor:'pointer', padding:0, fontFamily:'monospace', whiteSpace:'nowrap', textOverflow:'ellipsis', overflow:'hidden', maxWidth:'100%', display:'block' }}>
                              {inv.invoice_number||'-'}
                            </button>
                          </td>
                          <td style={{ padding:'9px 10px', fontSize:11, color:'#6b7c93', whiteSpace:'nowrap' }}>{inv.invoice_date}</td>
                          <td style={{ padding:'9px 10px', fontSize:12, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis', maxWidth:0 }} title={name}>{name}</td>
                          <td style={{ padding:'9px 6px' }}>
                            <span style={{ ...S.badge(t?.badge||'#555'), fontSize:9, whiteSpace:'nowrap' }}>{(inv.invoice_type||'').replace(/_/g,' ')}</span>
                          </td>
                          <td style={{ padding:'9px 10px', fontSize:12, fontWeight:800, textAlign:'right', whiteSpace:'nowrap' }}>{fmt(inv.total_amount)}</td>
                          <td style={{ padding:'9px 8px' }}>
                            <span style={{ background:statusColor[inv.status]||'#eee', color:statusText[inv.status]||'#555', borderRadius:6, padding:'3px 8px', fontSize:10, fontWeight:800, whiteSpace:'nowrap' }}>{inv.status}</span>
                          </td>
                          <td style={{ padding:'9px 8px', textAlign:'center' }}>
                            <button onClick={toggleInv} style={{ background:isExp?MC:'#f1f5f9', color:isExp?'#fff':'#94a3b8', border:'none', borderRadius:'50%', width:24, height:24, cursor:'pointer', fontSize:11, display:'inline-flex', alignItems:'center', justifyContent:'center', transform:isExp?'rotate(180deg)':'none', transition:'all 0.15s' }}>▾</button>
                          </td>
                        </tr>
                        {isExp && (
                          <tr>
                            <td colSpan={7} style={{ padding:'10px 16px 14px 28px', background:`${MC}06`, borderBottom:`1px solid ${MC}22`, borderLeft:`3px solid ${MC}` }}>
                              <div style={{ display:'flex', flexWrap:'wrap', gap:'8px 24px', marginBottom:10 }}>
                                <div><span style={{ fontSize:10, color:'#888', fontWeight:700 }}>PO REF </span><span style={{ fontSize:12, fontFamily:'monospace', color:'#0277bd' }}>{inv.po_number||'—'}</span></div>
                                <div><span style={{ fontSize:10, color:'#888', fontWeight:700 }}>EX-VAT </span><span style={{ fontSize:12, fontWeight:700 }}>SAR {fmt(inv.subtotal)}</span></div>
                                <div><span style={{ fontSize:10, color:'#888', fontWeight:700 }}>VAT </span><span style={{ fontSize:12 }}>{fmt(inv.vat_amount)}</span></div>
                                {retAmt>0 && <div><span style={{ fontSize:10, color:'#888', fontWeight:700 }}>RETENTION </span><span style={{ fontSize:12, color:'#6a1b9a' }}>({fmt(retAmt)})</span></div>}
                                <div><span style={{ fontSize:10, color:'#888', fontWeight:700 }}>NET PAYABLE </span><span style={{ fontSize:13, fontWeight:800, color:'#2e7d32' }}>SAR {fmt(netP)}</span></div>
                                {inv.status==='ISSUED' && (allocPaidMap[inv.id]||0) > 0 && (
                                  <div><span style={{ fontSize:10, color:'#888', fontWeight:700 }}>OUTSTANDING </span><span style={{ fontSize:12, fontWeight:700, color:'#e65100' }}>SAR {fmt(Math.max(0, netP-(allocPaidMap[inv.id]||0)))}</span></div>
                                )}
                              </div>
                              <div style={{ display:'flex', gap:6 }}>
                                <button onClick={async () => {
                                  const { data:lines } = await supabase.from('invoice_lines').select('*').eq('invoice_id',inv.id).order('sort_order',{ascending:true})
                                  const cust = contractors.find(c=>c.id===inv.customer_id)
                                  setPickerInv({...inv, invoice_lines:lines||[], _contractor:cust})
                                }} style={{ background:'#e8f5e9', color:'#2e7d32', border:'none', borderRadius:6, padding:'5px 10px', cursor:'pointer', fontSize:11, fontWeight:700 }}>🖨️ Print</button>
                                {inv.status==='ISSUED' && <button onClick={() => updateStatus(inv,'PAID')} style={{ background:'#e3f2fd', color:'#1565c0', border:'none', borderRadius:6, padding:'5px 10px', cursor:'pointer', fontSize:11, fontWeight:700 }}>✓ Mark Paid</button>}
                                {inv.status==='DRAFT'  && <button onClick={() => updateStatus(inv,'ISSUED')} style={{ background:'#e8f5e9', color:'#2e7d32', border:'none', borderRadius:6, padding:'5px 10px', cursor:'pointer', fontSize:11, fontWeight:700 }}>Issue</button>}
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

      {/* ── Template Picker ── */}
      {pickerInv && (
        <InvoiceTemplatePicker
          invoice={pickerInv}
          contractor={pickerInv._contractor || contractors.find(c=>c.id===pickerInv.customer_id)}
          entityCode={entityCode}
          entityName={entityName||entityNameEn||'Ratal Group'}
          entityVatNumber={entityVatNumber}
          onClose={() => setPickerInv(null)}
          onHtmlPrint={() => { setPrintInv(pickerInv); setPickerInv(null) }}
        />
      )}

      {/* ── Quick HTML Print ── */}
      {printInv && (
        <InvoicePrint invoice={printInv} entityCode={entityCode} entityName={entityName||entityNameEn||'Ratal Group'} entityNameAr={entityNameAr} vatNumber={entityVatNumber} onClose={()=>setPrintInv(null)} />
      )}

      {/* ══════════════════════════════════════════════════════════════
          CREATE INVOICE WIZARD — 4 Steps
      ══════════════════════════════════════════════════════════════ */}
      {open && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
             onClick={e=>e.target===e.currentTarget&&(setOpen(false),setWizardStep(1))}>

          {/* ── LAYER 1: Border frame — mauve padding ── */}
          <div style={{ background:'#C1A1A9', borderRadius:16, width:700, maxWidth:'96vw', height:'86vh', padding:10, display:'flex', boxShadow:'0 24px 64px rgba(0,0,0,0.35)', fontFamily:"'Poppins', sans-serif" }}>

            {/* ── LAYER 2: Light pink inner container ── */}
            <div style={{ flex:1, background:'#FAF0F2', borderRadius:8, display:'flex', overflow:'visible', position:'relative' }}>

              {/* ── SIDEBAR ── */}
              <div style={{ width:152, flexShrink:0, padding:'16px 14px 16px', display:'flex', flexDirection:'column', alignItems:'flex-start' }}>

                {/* Company name — top, overflows into right area */}
                <div style={{ fontSize:13, fontWeight:900, color:'#3e1020', lineHeight:1.2, marginBottom:0, whiteSpace:'nowrap', position:'relative', zIndex:10 }}>{entityName||entityNameEn||'Ratal Group'}</div>

                {/* Finance + Invoices — pushed down, center aligned */}
                <div style={{ marginTop:80, width:'100%', textAlign:'center' }}>
                  <div style={{ fontSize:12, fontWeight:800, color:'#8C354B', marginBottom:2 }}>Finance</div>
                  <div style={{ fontSize:24, fontWeight:900, color:'#3e1020', letterSpacing:0.2 }}>Invoices</div>
                </div>

                {/* Spacer — pushes step nav to vertical middle */}
                <div style={{ flex:1 }} />

                {/* Step nav — vertically centred, left aligned */}
                <div style={{ alignSelf:'flex-start', width:'100%' }}>
                  {[
                    { num:1, label:'Entity & Client' },
                    { num:2, label:'Dept & Projects' },
                    { num:3, label:'Line Items' },
                    { num:4, label:'Invoice Summary' },
                  ].map(s=>(
                    <div key={s.num}
                      onClick={()=>s.num<wizardStep&&setWizardStep(s.num)}
                      style={{
                        fontSize:11, marginBottom:12, paddingLeft:8,
                        textAlign:'left', width:'100%', boxSizing:'border-box',
                        borderLeft: wizardStep===s.num ? '3px solid #8C354B' : '3px solid transparent',
                        color: wizardStep===s.num ? '#8C354B' : s.num<wizardStep ? '#5a2030' : '#b08090',
                        fontWeight: wizardStep===s.num ? 700 : 400,
                        cursor: s.num<wizardStep ? 'pointer' : 'default',
                        opacity: s.num>wizardStep ? 0.5 : 1,
                        transition:'all 0.15s',
                      }}>
                      {s.label}
                    </div>
                  ))}
                </div>

                {/* Spacer — VAT# anchored at bottom */}
                <div style={{ flex:1 }} />

                {/* VAT# at bottom */}
                <div style={{ paddingTop:8 }}>
                  <div style={{ fontSize:8, fontWeight:800, color:'#9b6070', textTransform:'uppercase', letterSpacing:0.8, marginBottom:4 }}>VAT#</div>
                  <div style={{ background:'#fff', borderRadius:6, padding:'5px 8px', fontSize:10, color:'#3e1020', fontWeight:600, border:'1px solid #e0ced2', wordBreak:'break-all' }}>{entityVatNumber||'—'}</div>
                </div>
              </div>

              {/* ── RIGHT COLUMN — layers 3 & 4 ── */}
              <div style={{ flex:1, position:'relative', overflow:'hidden' }}>

                {/* ── LAYER 3: Maroon top-right corner — no text, tall ── */}
                <div style={{ position:'absolute', top:0, right:0, width:'55%', height:200, background:'#8C354B', borderRadius:'0 8px 0 0', zIndex:1 }} />

                {/* ── LAYER 4: White card — overlaps Layer 3 ── */}
                <div style={{ position:'absolute', top:52, left:12, right:12, bottom:12, background:'#fff', borderRadius:12, boxShadow:'0 4px 24px rgba(0,0,0,0.15)', display:'flex', flexDirection:'column', overflow:'hidden', zIndex:2 }}>

                  {/* Scrollable form content */}
                  <div style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'12px 14px 8px' }}>

                    {/* ── STEP 1: Entity & Client ── */}
                    {wizardStep===1 && (<>

                      {/* Our Company */}
                      <div style={{ fontSize:8, fontWeight:800, color:'#8C354B', textTransform:'uppercase', letterSpacing:1.2, marginBottom:6, paddingBottom:4, borderBottom:'1px solid #f0e6e9' }}>Our Company</div>
                      <div style={{ display:'flex', gap:10, marginBottom:8 }}>
                        <div style={{ flex:2 }}>
                          <label style={S.label}>Entity</label>
                          <div style={{ ...S.inp, background:'#f5f0f1', fontWeight:700, color:'#3e1020' }}>{entityName||entityNameEn||entityCode}</div>
                        </div>
                        <div style={{ flex:1 }}>
                          <label style={S.label}>CR#</label>
                          <div style={{ ...S.inp, background:'#f5f0f1', color:'#3e1020' }}>{entityCR||'—'}</div>
                        </div>
                      </div>
                      <div style={{ marginBottom:12 }}>
                        <label style={S.label}>Address</label>
                        <textarea style={{ ...S.inp, minHeight:40, resize:'none', fontSize:12 }} readOnly value={entityAddr} placeholder="Entity address from Settings" />
                      </div>

                      {/* Contractor / Client */}
                      <div style={{ fontSize:8, fontWeight:800, color:'#8C354B', textTransform:'uppercase', letterSpacing:1.2, marginBottom:6, paddingBottom:4, borderBottom:'1px solid #f0e6e9' }}>Contractor / Client</div>
                      <div style={{ display:'flex', gap:10, marginBottom:8 }}>
                        <div style={{ flex:2 }}>
                          <label style={S.label}>Contractor / Client *</label>
                          <select style={S.inp} value={custId} onChange={e=>onCustomerChange(e.target.value)}>
                            <option value="">— Select Contractor —</option>
                            {contractors.map(c=><option key={c.id} value={c.id}>{c.contractor_code?`[${c.contractor_code}] `:''}{ c.contractor_name}</option>)}
                          </select>
                          {contractors.length===0&&<div style={{ fontSize:10, color:'#e53935', marginTop:3 }}>⚠ No contractors found</div>}
                        </div>
                        <div style={{ flex:1 }}>
                          <label style={S.label}>VAT#</label>
                          <div style={{ ...S.inp, background:'#f5f0f1', color:'#3e1020' }}>{custVat||'—'}</div>
                        </div>
                      </div>
                      <div style={{ marginBottom:6 }}>
                        <label style={S.label}>Address</label>
                        <textarea style={{ ...S.inp, minHeight:40, resize:'none', fontSize:12 }} readOnly value={custAddr} placeholder="Auto-filled from Party List" />
                      </div>

                    </>)}

                    {/* ── STEP 2: Dept & Projects ── */}
                    {wizardStep===2 && (<>
                      {/* Invoice Type + Currency + Ref */}
                      <div style={S.row}>
                        <div style={S.col}>
                          <label style={S.label}>Invoice Type</label>
                          <select style={S.inp} value={invType} onChange={e=>setInvType(e.target.value)}>
                            {INV_TYPES.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}
                          </select>
                        </div>
                        <div style={S.col}>
                          <label style={S.label}>Currency</label>
                          <select style={S.inp} value={currency} onChange={e=>{ setCurrency(e.target.value); if(e.target.value!=='SAR'&&!exchangeRate) setExchangeRate('3.75') }}>
                            <option value="SAR">SAR</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="GBP">GBP</option>
                          </select>
                        </div>
                        {isRefType && (
                          <div style={S.col}>
                            <label style={S.label}>{invType==='CREDIT_NOTE'?'📉':'📈'} Ref Invoice#</label>
                            <input style={S.inp} placeholder={`${prefix}/2026/08/0001`} value={refInvNo} onChange={e=>setRefInvNo(e.target.value)} />
                          </div>
                        )}
                      </div>
                      {currency!=='SAR'&&(
                        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
                          <label style={{ ...S.label, margin:0, whiteSpace:'nowrap' }}>Rate (SAR/1 {currency})</label>
                          <input type="number" step="0.0001" style={{ ...S.inp, maxWidth:120 }} value={exchangeRate} onChange={e=>setExchangeRate(e.target.value)} placeholder="3.75" />
                          {exchangeRate&&<div style={{ background:'#e3f2fd', borderRadius:6, padding:'4px 8px', fontSize:11, color:'#1565c0', fontWeight:700 }}>≈ SAR {fmt((grandTotal||0)*(parseFloat(exchangeRate)||0))}</div>}
                        </div>
                      )}
                      {/* Invoice# + Dates */}
                      <div style={S.row}>
                        <div style={S.col}>
                          <label style={S.label}>Invoice#</label>
                          <div style={{ ...S.inp, background:'#FAF0F2', fontWeight:800, fontSize:10, fontFamily:'monospace', color:'#8C354B' }}>{prefix}/{new Date(invDate).getFullYear()}/{String(new Date(invDate).getMonth()+1).padStart(2,'0')}/XXXX</div>
                        </div>
                        <div style={S.col}>
                          <label style={S.label}>Invoice Date *</label>
                          <input type="date" style={S.inp} value={invDate} onChange={e=>setInvDate(e.target.value)} />
                        </div>
                        <div style={S.col}>
                          <label style={S.label}>Due Date</label>
                          <input type="date" style={S.inp} value={dueDate} onChange={e=>setDueDate(e.target.value)} />
                        </div>
                      </div>
                      {/* ── CASCADE: Dept → Project → PO ── */}
                      {(()=>{
                        // Derive unique depts from allPos
                        const deptMap = {}
                        allPos.forEach(po=>{ const d=po.departments; if(d){ const k=d.dept_code||d.dept_name||''; if(k&&!deptMap[k]) deptMap[k]=d.dept_name||d.dept_code||k } })
                        const depts = Object.entries(deptMap) // [[code, name], ...]

                        // Projects filtered by selected dept
                        const projMap = {}
                        allPos.filter(po=>!selDeptKey||(po.departments?.dept_code||po.departments?.dept_name||''===selDeptKey)).forEach(po=>{ const p=po.projects; if(p){ const k=p.project_number||''; if(k&&!projMap[k]) projMap[k]=p.project_name||k } })
                        const projs = Object.entries(projMap) // [[num, name], ...]

                        // POs filtered by dept + project
                        const filteredPos = allPos.filter(po=>{
                          const dKey=po.departments?.dept_code||po.departments?.dept_name||''
                          const pKey=po.projects?.project_number||''
                          if(selDeptKey && dKey!==selDeptKey) return false
                          if(selProjNum && pKey!==selProjNum) return false
                          return true
                        })

                        return (<>
                          <div style={S.row}>
                            <div style={S.col}>
                              <label style={S.label}>Department</label>
                              {!custId
                                ? <div style={{ ...S.inp, background:'#f5f5f5', color:'#aab2bd', fontSize:12 }}>Select contractor first</div>
                                : <select style={S.inp} value={selDeptKey} onChange={e=>{
                                    const v=e.target.value; setSelDeptKey(v); setSelProjNum(''); onPoChange(''); setDept(deptMap[v]||v)
                                  }}>
                                    <option value="">— All Departments —</option>
                                    {depts.map(([code,name])=><option key={code} value={code}>{name}</option>)}
                                  </select>
                              }
                            </div>
                            <div style={S.col}>
                              <label style={S.label}>Project No.</label>
                              {!custId
                                ? <div style={{ ...S.inp, background:'#f5f5f5', color:'#aab2bd', fontSize:12 }}>—</div>
                                : <select style={{ ...S.inp, background:selDeptKey?undefined:'#f9f9f9' }} value={selProjNum} disabled={!selDeptKey} onChange={e=>{
                                    const v=e.target.value; setSelProjNum(v); onPoChange(''); setProjectNo(v)
                                  }}>
                                    <option value="">— Select Project —</option>
                                    {projs.map(([num,name])=><option key={num} value={num}>{num}{name&&name!==num?' — '+name:''}</option>)}
                                  </select>
                              }
                            </div>
                          </div>
                          <div style={S.row}>
                            <div style={{ ...S.col, flex:2 }}>
                              <label style={S.label}>Contractor PO#</label>
                              {!custId
                                ? <div style={{ padding:'7px 10px', borderRadius:6, border:'1px solid #dde3ec', fontSize:11, color:'#aab2bd' }}>Select contractor in Step 1 first</div>
                                : <select style={{ ...S.inp, background:selProjNum?undefined:'#f9f9f9' }} value={selectedPo?.id||''} onChange={e=>onPoChange(e.target.value)}>
                                    <option value="">— No PO (manual) —</option>
                                    {filteredPos.map(po=>{
                                      const pct=po.total_value>0?((po.total_invoiced_ex_vat||0)/po.total_value*100).toFixed(0):0
                                      const rem=(po.total_value||0)-(po.total_invoiced_ex_vat||0)
                                      return <option key={po.id} value={po.id}>{po.contractor_po_number} — SAR {new Intl.NumberFormat('en-SA',{maximumFractionDigits:0}).format(rem)} rem ({pct}% billed)</option>
                                    })}
                                  </select>
                              }
                            </div>
                            <div style={S.col}>
                              <label style={S.label}>PO Date</label>
                              <div style={{ padding:'7px 10px', borderRadius:6, border:'1px solid #dde3ec', fontSize:11, color:selectedPo?'#1a2e3d':'#aab2bd', background:selectedPo?'#f1f8e9':undefined }}>{selectedPo?.po_date||'—'}</div>
                            </div>
                          </div>
                          {/* Manual PO# — only visible when no PO selected */}
                          {!selectedPo&&custId&&(
                            <div style={{ marginBottom:8 }}>
                              <label style={S.label}>Manual PO#</label>
                              <input style={{ ...S.inp, fontFamily:'monospace' }} placeholder="Enter PO number manually" value={poNumber} onChange={e=>setPoNumber(e.target.value)} />
                            </div>
                          )}
                        </>)
                      })()}
                      <div style={{ marginBottom:8 }}>
                        <label style={S.label}>Payment Terms{selectedPo&&<span style={{ color:'#2e7d32', marginLeft:4 }}>(from PO)</span>}</label>
                        <input style={{ ...S.inp, background:selectedPo?'#f1f8e9':undefined }} placeholder="e.g. Net 30 days" value={paymentTerms} onChange={e=>setPaymentTerms(e.target.value)} />
                      </div>
                      {custId&&!selectedPo&&(
                        <div style={{ marginTop:8 }}>
                          <label style={S.label}>Billing Mode</label>
                          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:6 }}>
                            {[{key:'QTY',label:'📋 Line Items'},{key:'PERCENTAGE',label:'% Progress'},{key:'MILESTONE',label:'🏁 Milestones'},{key:'RETENTION_RELEASE',label:'🔓 Retention'}].map(m=>(
                              <button key={m.key} onClick={()=>setBillingMode(m.key)} style={{ padding:'5px 11px', borderRadius:7, fontWeight:700, fontSize:11, cursor:'pointer', border:billingMode===m.key?'2px solid #8C354B':'1.5px solid #dde3ec', background:billingMode===m.key?'#FAF0F2':'#fff', color:billingMode===m.key?'#8C354B':'#445566' }}>{m.label}</button>
                            ))}
                          </div>
                          {(billingMode==='PERCENTAGE'||billingMode==='MILESTONE')&&(
                            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                              <label style={{ ...S.label, margin:0, whiteSpace:'nowrap' }}>Contract Total (Ex-VAT) SAR</label>
                              <input type="number" style={{ ...S.inp, maxWidth:180, fontWeight:800 }} placeholder="e.g. 500000" value={contractValue} onChange={e=>setContractValue(e.target.value)} />
                            </div>
                          )}
                        </div>
                      )}
                    </>)}

                    {/* ── STEP 3: Line Items ── */}
                    {wizardStep===3 && (<>

                      {selectedPo&&(
                        <div style={{ background:'#FAF0F2', borderRadius:8, padding:'7px 11px', marginBottom:8, fontSize:11 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}>
                            <strong style={{ color:'#8C354B' }}>📋 {selectedPo.contractor_po_number}</strong>
                            <span style={{ color:'#53666F' }}>Mode: <strong>{billingMode}</strong></span>
                            {retentionPct>0&&<span style={{ color:'#7c3aed' }}>Ret: <strong>{retentionPct}%</strong></span>}
                          </div>
                          <div style={{ display:'flex', gap:12, color:'#546e7a' }}>
                            <span>Total: <strong>SAR {fmt(selectedPo.total_value)}</strong></span>
                            <span>Invoiced: <strong style={{ color:'#e65100' }}>SAR {fmt(selectedPo.total_invoiced_ex_vat||0)}</strong></span>
                            <span>Remaining: <strong style={{ color:'#2e7d32' }}>SAR {fmt((selectedPo.total_value||0)-(selectedPo.total_invoiced_ex_vat||0))}</strong></span>
                          </div>
                        </div>
                      )}
                      {vatLocked&&<div style={{ marginBottom:8, padding:'6px 10px', background:'#e8f5e9', borderRadius:7, fontSize:11, color:'#2e7d32', fontWeight:700 }}>✈️ Zero-Rated — 0% VAT on all lines</div>}

                      {billingMode==='QTY'&&(
                        <div style={{ marginBottom:8 }}>
                          {lines.map((line,idx)=>(
                            <LineRow key={idx} line={line} idx={idx} onChange={updateLine} onRemove={removeLine} vatLocked={vatLocked} isOnly={lines.length===1} selectedPo={!!selectedPo} />
                          ))}
                          {!selectedPo&&(
                            <button onClick={addLine} style={{ width:'100%', padding:'7px', borderRadius:7, border:'1.5px dashed #C1A1A9', background:'transparent', color:'#8C354B', fontWeight:700, fontSize:11, cursor:'pointer', marginTop:2 }}>+ Add Line</button>
                          )}
                        </div>
                      )}

                      {billingMode==='RETENTION_RELEASE'&&!selectedPo&&(
                        <div style={{ marginBottom:8 }}>
                          {retInvoices.length===0
                            ?<div style={{ textAlign:'center', padding:20, color:'#aab2bd', fontSize:12 }}>No invoices with outstanding retention.</div>
                            :<><div style={{ border:'1px solid #e0e7ef', borderRadius:7, overflow:'hidden', marginBottom:8 }}>
                              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                                <thead><tr style={{ background:'#8C354B' }}>
                                  {['✓','Invoice #','Date','Status','Ret %','Amount'].map(h=><th key={h} style={{ padding:'6px 8px', textAlign:'left', fontSize:9, color:'#fff', fontWeight:700 }}>{h}</th>)}
                                </tr></thead>
                                <tbody>{retInvoices.map((ri,i)=>{
                                  const isSel=selRetInvIds.includes(ri.id), retAmt=+ri.retention_amount||0
                                  return <tr key={ri.id} style={{ background:isSel?(i%2===0?'#e8f5e9':'#d4edda'):(i%2===0?'#fff':'#f9fbff'), borderBottom:'1px solid #f0f4f8' }}>
                                    <td style={{ padding:'6px 8px' }}><input type="checkbox" checked={isSel} onChange={e=>setSelRetInvIds(prev=>e.target.checked?[...prev,ri.id]:prev.filter(x=>x!==ri.id))} style={{ width:14, height:14, cursor:'pointer' }} /></td>
                                    <td style={{ padding:'6px 8px', fontFamily:'monospace', fontWeight:700, color:'#8C354B', fontSize:11 }}>{ri.invoice_number}</td>
                                    <td style={{ padding:'6px 8px', fontSize:11, color:'#6b7c93' }}>{ri.invoice_date}</td>
                                    <td style={{ padding:'6px 8px' }}><span style={{ background:ri.status==='PAID'?'#e8f5e9':'#e3f2fd', color:ri.status==='PAID'?'#2e7d32':'#1565c0', borderRadius:5, padding:'2px 7px', fontSize:9, fontWeight:700 }}>{ri.status}</span></td>
                                    <td style={{ padding:'6px 8px', fontSize:11, color:'#7c3aed', fontWeight:700 }}>{ri.retention_pct}%</td>
                                    <td style={{ padding:'6px 8px', fontSize:12, fontWeight:800, color:'#3e1020' }}>SAR {fmt(retAmt)}</td>
                                  </tr>
                                })}</tbody>
                              </table>
                            </div>
                            {selRetInvIds.length>0&&<div style={{ background:'#FAF0F2', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#8C354B' }}>Total to release: <strong>SAR {fmt(selRetInvIds.reduce((s,id)=>{ const inv=retInvoices.find(i=>i.id===id); return s+(+inv?.retention_amount||0) },0))}</strong></div>}
                            </>
                          }
                        </div>
                      )}

                      {billingMode==='PERCENTAGE'&&!selectedPo&&contractValue&&(
                        <div style={{ marginBottom:8 }}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:8 }}>
                            <div><label style={S.label}>Contract Value (Ex-VAT)</label><div style={{ padding:'7px 9px', borderRadius:6, border:'1px solid #dde3ec', fontSize:13, fontWeight:800, background:'#FAF0F2' }}>SAR {fmt(parseFloat(contractValue)||0)}</div></div>
                            <div><label style={S.label}>% to Bill *</label><input type="number" style={{ ...S.inp, fontWeight:800, color:'#8C354B' }} min="0" max="100" step="0.01" placeholder="e.g. 30" value={pctToBill} onChange={e=>setPctToBill(e.target.value)} /></div>
                            <div><label style={S.label}>VAT Rate</label>{vatLocked?<div style={{ padding:'7px 9px', borderRadius:6, border:'1px solid #dde3ec', fontSize:12, fontWeight:700, color:'#2e7d32' }}>0%</div>:<select style={S.inp} value={pctVatRate} onChange={e=>setPctVatRate(e.target.value)}><option value="15">15%</option><option value="0">0%</option></select>}</div>
                          </div>
                          <label style={S.label}>Description</label>
                          <input style={S.inp} value={pctDesc} onChange={e=>setPctDesc(e.target.value)} placeholder="Progress billing — Phase 1" />
                          {pctToBill&&<div style={{ background:'#FAF0F2', borderRadius:7, padding:'6px 10px', fontSize:12, color:'#8C354B', marginTop:6 }}>Invoice Ex-VAT: <strong>SAR {fmt(parseFloat(pctToBill)/100*(parseFloat(contractValue)||0))}</strong></div>}
                        </div>
                      )}

                      {billingMode==='PERCENTAGE'&&selectedPo&&(
                        <div style={{ marginBottom:8 }}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:8 }}>
                            <div><label style={S.label}>PO Value (Ex-VAT)</label><div style={{ padding:'7px 9px', borderRadius:6, border:'1px solid #dde3ec', fontSize:13, fontWeight:800, background:'#FAF0F2' }}>SAR {fmt(selectedPo.total_value)}</div></div>
                            <div><label style={S.label}>Already Billed</label><div style={{ padding:'7px 9px', borderRadius:6, border:'1px solid #e65100', fontSize:13, fontWeight:800, color:'#e65100', background:'#fff3e0' }}>{(selectedPo.pct_invoiced||0).toFixed(1)}%</div></div>
                            <div><label style={S.label}>% to Bill *</label><input type="number" style={{ ...S.inp, fontWeight:800, color:'#8C354B' }} min="0" max={100-(selectedPo.pct_invoiced||0)} step="0.01" placeholder={`Max: ${(100-(selectedPo.pct_invoiced||0)).toFixed(1)}%`} value={pctToBill} onChange={e=>{ if(parseFloat(e.target.value)<=100-(selectedPo.pct_invoiced||0)) setPctToBill(e.target.value) }} /></div>
                          </div>
                          <div style={S.row}>
                            <div style={{ ...S.col, flex:2 }}><label style={S.label}>Description</label><input style={S.inp} value={pctDesc} onChange={e=>setPctDesc(e.target.value)} placeholder={`Progress billing — ${selectedPo.contractor_po_number}`} /></div>
                            <div style={S.col}><label style={S.label}>VAT Rate</label>{vatLocked?<div style={{ padding:'7px 9px', borderRadius:6, border:'1px solid #dde3ec', fontSize:12, fontWeight:700, color:'#2e7d32' }}>0%</div>:<select style={S.inp} value={pctVatRate} onChange={e=>setPctVatRate(e.target.value)}><option value="15">15%</option><option value="0">0%</option></select>}</div>
                          </div>
                          {pctToBill&&<div style={{ background:'#FAF0F2', borderRadius:7, padding:'6px 10px', fontSize:12, color:'#8C354B' }}>Invoice Ex-VAT: <strong>SAR {fmt(parseFloat(pctToBill)/100*(selectedPo.total_value||0))}</strong></div>}
                        </div>
                      )}

                      {billingMode==='MILESTONE'&&!selectedPo&&(
                        <div style={{ marginBottom:8 }}>
                          {!contractValue&&<div style={{ padding:'6px 10px', background:'#fff3e0', borderRadius:7, fontSize:11, color:'#e65100', fontWeight:700, marginBottom:8 }}>⚠ Enter Contract Value in Step 2</div>}
                          <div style={{ border:'1px solid #e0e7ef', borderRadius:7, overflow:'hidden', marginBottom:8 }}>
                            <table style={{ width:'100%', borderCollapse:'collapse' }}>
                              <thead><tr style={{ background:'#8C354B' }}>
                                {['✓','#','Milestone Name','% of Contract','Amount (Ex-VAT)','VAT%','Total',''].map(h=><th key={h} style={{ padding:'6px', textAlign:'left', fontSize:9, color:'#fff', fontWeight:700 }}>{h}</th>)}
                              </tr></thead>
                              <tbody>{standaloneMilestones.map((m,i)=>{
                                const cvNum=parseFloat(contractValue)||0, amt=parseFloat(m.amount)||0
                                const pctV=cvNum>0?(amt/cvNum*100).toFixed(1):(parseFloat(m.pct)||0)
                                const vr=vatLocked?0:(parseFloat(m.vatRate)||15), total=amt*(1+vr/100)
                                return <tr key={m.id} style={{ background:m.selected?(i%2===0?'#e8f5e9':'#d4edda'):(i%2===0?'#fff':'#f9fbff'), borderBottom:'1px solid #f0f4f8' }}>
                                  <td style={{ padding:'5px 6px', textAlign:'center' }}><input type="checkbox" checked={!!m.selected} onChange={e=>setStandaloneMilestones(prev=>prev.map((x,xi)=>xi===i?{...x,selected:e.target.checked}:x))} style={{ width:14, height:14, cursor:'pointer' }} /></td>
                                  <td style={{ padding:'5px 6px', fontSize:10, color:'#aab2bd', fontWeight:700 }}>{i+1}</td>
                                  <td style={{ padding:'3px' }}><input style={{ ...S.inp, fontSize:11 }} placeholder={`Milestone ${i+1}`} value={m.name} onChange={e=>setStandaloneMilestones(prev=>prev.map((x,xi)=>xi===i?{...x,name:e.target.value}:x))} /></td>
                                  <td style={{ padding:'5px 6px', fontSize:11, textAlign:'right', color:'#6b7c93' }}>{cvNum>0?`${pctV}%`:'-'}</td>
                                  <td style={{ padding:'3px', width:110 }}><input type="number" style={{ ...S.inp, fontSize:11, textAlign:'right', fontWeight:700 }} min="0" step="0.01" placeholder="0.00" value={m.amount} onChange={e=>setStandaloneMilestones(prev=>prev.map((x,xi)=>xi===i?{...x,amount:e.target.value}:x))} /></td>
                                  <td style={{ padding:'3px', width:60 }}>{vatLocked?<div style={{ textAlign:'center', fontSize:11, color:'#2e7d32', fontWeight:700 }}>0%</div>:<select style={{ ...S.inp, fontSize:11 }} value={m.vatRate} onChange={e=>setStandaloneMilestones(prev=>prev.map((x,xi)=>xi===i?{...x,vatRate:e.target.value}:x))}><option value="15">15%</option><option value="0">0%</option></select>}</td>
                                  <td style={{ padding:'5px 6px', fontSize:11, fontWeight:700, textAlign:'right', color:'#3e1020' }}>{total>0?fmt(total):''}</td>
                                  <td style={{ padding:'3px', width:24, textAlign:'center' }}>{standaloneMilestones.length>1&&<button onClick={()=>setStandaloneMilestones(prev=>prev.filter((_,xi)=>xi!==i))} style={{ background:'none', border:'none', color:'#e53935', fontSize:14, cursor:'pointer', lineHeight:1 }}>×</button>}</td>
                                </tr>
                              })}</tbody>
                            </table>
                          </div>
                          <button onClick={()=>setStandaloneMilestones(prev=>[...prev,{...EMPTY_MS,id:Date.now()}])} style={{ padding:'5px 14px', borderRadius:7, border:'1.5px solid #8C354B', background:'#fff', color:'#8C354B', fontWeight:700, fontSize:11, cursor:'pointer' }}>+ Add Milestone</button>
                        </div>
                      )}

                      {billingMode==='MILESTONE'&&selectedPo&&(
                        <div style={{ marginBottom:8 }}>
                          {milestones.length===0?<div style={{ textAlign:'center', padding:16, color:'#aab2bd', fontSize:11 }}>All milestones already invoiced.</div>
                            :milestones.map((m,i)=>{
                              const val=(m.unit_price||0)*(m.qty||1)
                              return <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', border:'1px solid #e0e7ef', borderRadius:7, marginBottom:6, background:m.selected?'#FAF0F2':'#fff' }}>
                                <input type="checkbox" checked={m.selected||false} onChange={e=>setMilestones(prev=>prev.map((x,xi)=>xi===i?{...x,selected:e.target.checked}:x))} style={{ width:16, height:16, cursor:'pointer' }} />
                                <div style={{ flex:1 }}><div style={{ fontSize:12, fontWeight:600 }}>{m.description}</div>{m.job_type&&<div style={{ fontSize:10, color:'#6b7c93' }}>{m.job_type}</div>}</div>
                                <div style={{ fontSize:12, fontWeight:800, color:'#8C354B' }}>SAR {fmt(val)}</div>
                              </div>
                            })}
                        </div>
                      )}

                      <div style={{ background:'#FAF0F2', borderRadius:8, padding:'10px 12px' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:4, color:'#546e7a' }}><span>Subtotal (excl. VAT)</span><span style={{ fontWeight:700 }}>SAR {fmt(subtotalExVat)}</span></div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:6, color:'#546e7a' }}><span>VAT</span><span style={{ fontWeight:700 }}>SAR {fmt(vatTotal)}</span></div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:900, color:'#8C354B', borderTop:'1px solid #e0ced2', paddingTop:6 }}><span>Total (incl. VAT)</span><span>SAR {fmt(grandTotal)}</span></div>
                        {retentionPct>0&&<>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginTop:6, color:'#7c3aed' }}><span>Less Retention ({retentionPct}% Ex-VAT)</span><span>(SAR {fmt(retentionAmt)})</span></div>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, fontWeight:900, color:'#2e7d32', borderTop:'1px solid #dde3ec', paddingTop:6, marginTop:6 }}><span>Net Payable</span><span>SAR {fmt(netPayable)}</span></div>
                        </>}
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
                          <label style={{ ...S.label, margin:0, whiteSpace:'nowrap', fontSize:10 }}>Retention %:</label>
                          <input type="number" min="0" max="50" step="0.5" style={{ width:70, padding:'4px 7px', borderRadius:5, border:'1px solid #dde3ec', fontSize:11, fontWeight:700, color:'#7c3aed', textAlign:'right' }} value={retentionPct} onChange={e=>setRetentionPct(parseFloat(e.target.value)||0)} />
                          <span style={{ fontSize:10, color:'#aab2bd' }}>(auto from PO)</span>
                        </div>
                      </div>
                    </>)}

                    {/* ── STEP 4: Invoice Summary ── */}
                    {wizardStep===4 && (<>
                      {/* Invoice details table — centered */}
                      <div style={{ border:'1px solid #f0e6e9', borderRadius:8, overflow:'hidden', marginBottom:10, maxWidth:440, margin:'0 auto 10px' }}>
                        <div style={{ background:'#8C354B', padding:'6px 12px', textAlign:'center' }}>
                          <span style={{ fontSize:9, fontWeight:800, color:'#fff', textTransform:'uppercase', letterSpacing:1 }}>Invoice Details</span>
                        </div>
                        {[
                          { label:'Invoice#',   value:`${prefix}/${new Date(invDate).getFullYear()}/${String(new Date(invDate).getMonth()+1).padStart(2,'0')}/XXXX` },
                          { label:'Date',        value:invDate },
                          { label:'Client',      value:contractors.find(c=>c.id===custId)?.contractor_name||'—' },
                          { label:'Client PO#',  value:selectedPo?.contractor_po_number||poNumber||'—' },
                          { label:'Due Date',    value:dueDate||'—' },
                          { label:'Department',  value:dept||'—' },
                          { label:'Project No.', value:projectNo||'—' },
                          { label:'Sub Total',   value:`SAR ${fmt(subtotalExVat)}` },
                          { label:'VAT Amount',  value:`SAR ${fmt(vatTotal)}` },
                          { label:'Total',       value:`SAR ${fmt(grandTotal)}` },
                        ].map((f,i)=>(
                          <div key={f.label} style={{ display:'flex', justifyContent:'space-between', padding:'5px 12px', background:i%2===0?'#fff':'#FAF0F2', fontSize:11 }}>
                            <span style={{ color:'#7a5060', fontWeight:600 }}>{f.label}</span>
                            <span style={{ color:'#172D37', fontWeight:700 }}>{f.value}</span>
                          </div>
                        ))}
                      </div>

                      {/* Notes / Terms */}
                      <div style={{ marginBottom:10 }}>
                        <label style={S.label}>Notes / Terms</label>
                        <textarea style={{ ...S.inp, minHeight:54, resize:'vertical' }} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Payment terms, special instructions…" />
                      </div>

                      {/* QR code — below Notes */}
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', paddingTop:4 }}>
                        <div style={{ width:88, height:88, border:'2px solid #C1A1A9', borderRadius:8, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#FAF0F2' }}>
                          <div style={{ fontSize:24, lineHeight:1 }}>▦</div>
                          <div style={{ fontSize:7, color:'#aab2bd', fontWeight:700, marginTop:3, textAlign:'center' }}>QR Code</div>
                        </div>
                        <div style={{ fontSize:8, color:'#aab2bd', marginTop:4, textAlign:'center', lineHeight:1.3 }}>ZATCA TLV QR · generated on submit</div>
                      </div>
                    </>)}

                  </div>{/* end scrollable */}

                  {/* ── FOOTER ── */}
                  <div style={{ padding:'8px 14px', borderTop:'1px solid #f0e6e9', background:'#fff', flexShrink:0, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <button
                      onClick={wizardStep===1?()=>{setOpen(false);setWizardStep(1)}:()=>setWizardStep(s=>s-1)}
                      style={{ background:'#888', color:'#fff', border:'none', borderRadius:8, padding:'8px 20px', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                      {wizardStep===1 ? 'Cancel' : '← Back'}
                    </button>
                    <div style={{ display:'flex', gap:8 }}>
                      {wizardStep===4&&(
                        <button onClick={()=>save(true)} disabled={saving}
                          style={{ background:'#C1A1A9', color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontWeight:700, fontSize:12, cursor:'pointer' }}>
                          {saving?'Saving…':'💾 Save as Draft'}
                        </button>
                      )}
                      <button
                        onClick={wizardStep===4?()=>save(false):()=>setWizardStep(s=>s+1)}
                        disabled={saving}
                        style={{ background:'#8C354B', color:'#fff', border:'none', borderRadius:8, padding:'8px 22px', fontWeight:800, fontSize:12, cursor:'pointer', boxShadow:'0 3px 10px rgba(140,53,75,0.3)' }}>
                        {saving?'Submitting…':wizardStep===4?'Save & Submit':'Save & Next →'}
                      </button>
                    </div>
                  </div>

                </div>{/* end Layer 4 white card */}
              </div>{/* end right column */}
            </div>{/* end Layer 2 light pink */}
          </div>{/* end Layer 1 frame */}
        </div>
      )}

    </ChapterPage>
    </>
  )
}
