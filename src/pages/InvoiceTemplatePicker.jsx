/**
 * InvoiceTemplatePicker.jsx
 * Generates professional invoice PDFs using html2canvas + jsPDF (browser-side).
 * Downloads PDF automatically and uploads to Google Drive.
 *
 * PDF is generated from the same bilingual HTML template as "Quick Print"
 * so Arabic/English layout is correct, with proper system fonts.
 *
 * Naming: {SHORTNAME}-{INV-YYYY-MM-####}-{T#}-{DDMMYY}.pdf
 * e.g.   SBM-INV-2026-09-0002-RAT-INV-220926.pdf
 */

import { useState, useEffect } from 'react'
import QRCodeLib from 'qrcode'
import { supabase } from '../lib/supabase'
import { buildPrintHTML } from './InvoicePrint'

// ─── Entity config ────────────────────────────────────────────────────────────
// All fields are consumed by buildPrintHTML (from InvoicePrint.jsx):
//   nameEn, nameAr, address, addressAr, phone, crNo, vatNo,
//   beneficiary, bank, accountNo, iban, email, footerAddr
const ENTITY = {
  ACCSYS: {
    nameEn:      'RATAL ADVANCED TECHNOLOGIES',
    nameAr:      'مؤسسة رتل للتقنية المتطورة',
    crNo:        '7001971865',
    vatNo:       '300042611600003',
    beneficiary: 'RATAL ADVANCED TECHNOLOGIES',
    bank:        'ARAB NATIONAL BANK',
    accountNo:   '010800916342001',
    iban:        'SA8930400108009163420015',
    address:     'Aghadir Street, Riyadh 12233, Saudi Arabia.',
    addressAr:   'شارع أغادير، ص.ب 59215 الرياض 11525 المملكة العربية السعودية.',
    phone:       '',
    email:       'info@ratal.net',
    footerAddr:  '4182 Aghadir Street, Malaz, King Abdulaziz Dist, Riyadh-12233, P.O. Box: 59215.',
  },
  RAT: {
    nameEn:      'RATAL TOURS & TRAVELS',
    nameAr:      'رتال للسفر والسياحة',
    crNo:        '7001946511',
    vatNo:       '300000000000001',
    beneficiary: 'RATAL TOURS & TRAVELS',
    bank:        'ARAB NATIONAL BANK',
    accountNo:   '',
    iban:        '',
    address:     'Riyadh, Kingdom of Saudi Arabia',
    addressAr:   'الرياض، المملكة العربية السعودية',
    phone:       '',
    email:       '',
    footerAddr:  'Riyadh, Kingdom of Saudi Arabia',
  },
  GWT: {
    nameEn:      'GREEN WINGS TRAVEL & TOURISM',
    nameAr:      'الأجنحة الخضراء للسفر والسياحة',
    crNo:        '7001971857',
    vatNo:       '300000000000002',
    beneficiary: 'GREEN WINGS TRAVEL & TOURISM',
    bank:        'ARAB NATIONAL BANK',
    accountNo:   '',
    iban:        '',
    address:     'Riyadh, Kingdom of Saudi Arabia',
    addressAr:   'الرياض، المملكة العربية السعودية',
    phone:       '',
    email:       '',
    footerAddr:  'Riyadh, Kingdom of Saudi Arabia',
  },
}

// Templates loaded dynamically from Supabase invoice_templates table.
// To add a new template: insert a row in that table + put the DOCX in /public/templates/.
// No code changes needed!

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n) {
  return parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function numToWords(n) {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  if (n === 0) return 'Zero'
  let w = ''
  if (n >= 1000000) { w += numToWords(Math.floor(n / 1000000)) + ' Million '; n %= 1000000 }
  if (n >= 1000)    { w += numToWords(Math.floor(n / 1000))    + ' Thousand '; n %= 1000    }
  if (n >= 100)     { w += ones[Math.floor(n / 100)]           + ' Hundred ';  n %= 100     }
  if (n >= 20)      { w += tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : ''); n = 0 }
  else if (n > 0)   { w += ones[n] }
  return w.trim()
}

function amountInWords(amount) {
  const n       = Math.round(Math.abs(parseFloat(amount) || 0) * 100)
  const riyals  = Math.floor(n / 100)
  const halalas = n % 100
  let r = numToWords(riyals) + ' Saudi Riyals'
  if (halalas > 0) r += ' and ' + numToWords(halalas) + ' Halalas'
  return r + ' Only'
}

// ─── Contractor short name ────────────────────────────────────────────────────
// Use explicit abbreviation if present (last all-caps word, 2-6 letters)
// e.g. "Saudi Business Machines Ltd. SBM" → "SBM"
// Fallback: initials of meaningful words
function contractorShortName(contractor) {
  const name = contractor?.contractor_name || 'INV'
  const words = name.trim().split(/\s+/)
  // Look from end for an explicit abbreviation (2-6 all-uppercase letters)
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i].replace(/[^A-Za-z]/g, '')
    if (w.length >= 2 && w.length <= 6 && w === w.toUpperCase() && /[A-Z]/.test(w)) {
      return w
    }
  }
  // Fallback: initials
  const SUFFIX = new Set(['LTD','LLC','CO','COMPANY','CORP','CORPORATION','INC',
    'LIMITED','EST','ESTABLISHMENT','L.L.C','L.L.C.'])
  return words
    .map(w => w.replace(/[^A-Za-z]/g, ''))
    .filter(w => w.length > 0 && !SUFFIX.has(w.toUpperCase()))
    .map(w => w[0].toUpperCase())
    .join('')
    .slice(0, 6) || 'INV'
}

// ─── Filename builder ─────────────────────────────────────────────────────────
function buildFilename(invoice, contractor, templateId) {
  const sn     = contractorShortName(contractor)
  const invNum = (invoice.invoice_number || 'INV').replace(/\//g, '-')
  const d      = new Date(invoice.invoice_date || new Date())
  const dd     = String(d.getDate()).padStart(2, '0')
  const mm     = String(d.getMonth() + 1).padStart(2, '0')
  const yy     = String(d.getFullYear()).slice(2)
  return `${sn}-${invNum}-${templateId}-${dd}${mm}${yy}.docx`
}

// ─── ZATCA TLV QR (base64 string) ────────────────────────────────────────────
function buildZATCAQR(sellerName, vatNo, invoiceDate, totalWithVat, vatAmount) {
  function tlv(tag, value) {
    const bytes = new TextEncoder().encode(value)
    return new Uint8Array([tag, bytes.length, ...bytes])
  }
  const chunks = [
    tlv(1, sellerName),
    tlv(2, vatNo),
    tlv(3, (invoiceDate || '') + 'T00:00:00Z'),
    tlv(4, parseFloat(totalWithVat || 0).toFixed(2)),
    tlv(5, parseFloat(vatAmount    || 0).toFixed(2)),
  ]
  const buf = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0))
  let off = 0
  for (const c of chunks) { buf.set(c, off); off += c.length }
  return btoa(String.fromCharCode(...buf))
}

// ─── Build placeholder map ────────────────────────────────────────────────────
function buildPlaceholders(invoice, contractor, entity) {
  const allLines  = (invoice.invoice_lines || [])
  const dataLines = allLines.filter(l => !l.is_header)
  const sub       = parseFloat(invoice.subtotal || 0)
  const vat       = parseFloat(invoice.vat_amount || 0)
  const disc      = parseFloat(invoice.discount_amount || 0)
  const advance   = parseFloat(invoice.advance_amount || 0)
  const total     = sub + vat - disc - advance

  const qrCode    = buildZATCAQR(entity.nameEn, entity.vatNo, invoice.invoice_date, total, vat)

  const map = {
    // Entity (for TAX_INVOICE_TEMPLATE which has entity placeholders)
    entity_name_en: entity.nameEn,
    entity_name_ar: entity.nameAr || '',
    entity_cr:      entity.crNo,
    entity_cr_ar:   entity.crNo,
    entity_vat:     entity.vatNo,

    // Invoice header
    inv_number:      invoice.invoice_number  || '',
    inv_date:        invoice.invoice_date    || '',
    due_date:        invoice.due_date        || invoice.invoice_date || '',
    po_number:       invoice.po_number       || '',
    po_date:         invoice.po_date         || '',
    dept:            invoice.dept_code       || invoice.department   || '',
    project_number:  invoice.project_no      || '',
    payment_terms:   invoice.payment_terms   || '30 days',

    // Customer
    cust_name_en:    contractor?.contractor_name    || '',
    cust_name_ar:    contractor?.contractor_name_ar || contractor?.contractor_name || '',
    cust_vat:        contractor?.vat_number || '',
    cust_vat_ar:     contractor?.vat_number || '',
    cust_address_en: contractor?.address    || '',
    cust_address_ar: contractor?.address_ar || contractor?.address || '',

    // Amounts
    total_net:        fmt(sub),
    total_taxable:    fmt(sub),
    vat_amount:       fmt(vat),
    discount:         fmt(disc),
    advance_payment:  fmt(advance),
    total_incl_vat:   fmt(total),
    amount_words_en:  amountInWords(total),
    amount_words_ar:  '',

    // Bank
    bank_name:        entity.bank        || '',
    bank_account:     entity.accountNo   || '',
    bank_iban:        entity.iban        || '',
    bank_holder:      entity.beneficiary || '',

    // QR (text — won't render as image in DOCX without image module)
    qr_base64_placeholder: qrCode,
    qr_code_image:         qrCode,
  }

  // ── Per-line placeholders: line1_* through line10_* (fixed templates) ────────
  const MAX_LINES = 10
  let serial = 0
  for (let i = 0; i < MAX_LINES; i++) {
    const lineNum = i + 1
    const row     = allLines[i]
    if (row) {
      if (row.is_header) {
        map[`line${lineNum}_part`]  = ''
        map[`line${lineNum}_desc`]  = '▸ ' + (row.description || '')
        map[`line${lineNum}_qty`]   = ''
        map[`line${lineNum}_price`] = ''
        map[`line${lineNum}_net`]   = ''
      } else {
        serial++
        const qty   = parseFloat(row.quantity   || 0)
        const price = parseFloat(row.unit_price || 0)
        const net   = parseFloat(row.line_total || (qty * price) || 0)
        map[`line${lineNum}_part`]  = row.part_no || ''
        map[`line${lineNum}_desc`]  = row.description || ''
        map[`line${lineNum}_qty`]   = qty   !== 0 ? fmt(qty)   : ''
        map[`line${lineNum}_price`] = price !== 0 ? fmt(price) : ''
        map[`line${lineNum}_net`]   = net   !== 0 ? fmt(net)   : ''
      }
    } else {
      map[`line${lineNum}_part`]  = ''
      map[`line${lineNum}_desc`]  = ''
      map[`line${lineNum}_qty`]   = ''
      map[`line${lineNum}_price`] = ''
      map[`line${lineNum}_net`]   = ''
    }
  }

  // ── Dynamic lines array for loop-based templates (RAT template) ─────────────
  serial = 0
  map.lines = allLines.map(row => {
    if (row.is_header) {
      return { sno:'', part:'', description:'▸ ' + (row.description||''), qty:'', unit_price:'', vat_pct:'', net_amount:'' }
    }
    serial++
    const qty   = parseFloat(row.quantity   || 0)
    const price = parseFloat(row.unit_price || 0)
    const net   = parseFloat(row.line_total || (qty * price) || 0)
    return {
      sno:        String(serial),
      part:       row.part_no || '',
      description:row.description || '',
      qty:        qty   !== 0 ? fmt(qty)   : '',
      unit_price: price !== 0 ? fmt(price) : '',
      vat_pct:    '15%',
      net_amount: net   !== 0 ? fmt(net)   : '',
    }
  })

  return map
}

// ─── Build bilingual HTML invoice matching the RAT DOCX template layout ──────
// Layout: 3-col header | TAX INVOICE banner | Customer table | Meta+QR |
//         7-col line items | Totals | Amount in Words | Bank Details | Footer
function buildTemplateHTML({ invoice, contractor, entity, qrDataUrl }) {
  const c    = contractor || {}
  const lines = (invoice.invoice_lines || [])

  const sub     = parseFloat(invoice.subtotal         || 0)
  const vat     = parseFloat(invoice.vat_amount       || 0)
  const disc    = parseFloat(invoice.discount_amount  || 0)
  const advance = parseFloat(invoice.advance_amount   || 0)
  const total   = sub + vat - disc - advance

  // ── Line rows HTML ───────────────────────────────────────────────────────
  let serial = 0
  const lineRowsHtml = lines.length > 0
    ? lines.map(row => {
        if (row.is_header) {
          return `<tr>
            <td colspan="7" style="background:#e8ecf2;font-weight:bold;text-align:left;padding:4px 8px;font-size:8.5pt;">
              ▸ ${esc(row.description || '')}
            </td>
          </tr>`
        }
        serial++
        const qty   = parseFloat(row.quantity   || 0)
        const price = parseFloat(row.unit_price || 0)
        const net   = parseFloat(row.line_total || (qty * price) || 0)
        return `<tr>
          <td style="text-align:center;font-size:8pt;">${serial}</td>
          <td style="font-size:8pt;">${esc(row.part_no || '')}</td>
          <td style="text-align:left;font-size:8pt;padding:3px 6px;">${esc(row.description || '')}</td>
          <td style="text-align:center;font-size:8pt;">${qty !== 0 ? fmt(qty) : ''}</td>
          <td style="text-align:right;font-size:8pt;">${price !== 0 ? fmt(price) : ''}</td>
          <td style="text-align:center;font-size:8pt;">15%</td>
          <td style="text-align:right;font-size:8pt;font-weight:bold;">${net !== 0 ? fmt(net) : ''}</td>
        </tr>`
      }).join('')
    : `<tr><td colspan="7" style="text-align:center;color:#999;padding:14px;font-style:italic;">No line items found</td></tr>`

  const qrBlock = qrDataUrl
    ? `<img src="${qrDataUrl}" width="108" height="108" alt="ZATCA QR" style="display:block;margin:0 auto 2px;">`
    : `<div style="width:108px;height:108px;border:1px dashed #aaa;display:inline-flex;align-items:center;justify-content:center;font-size:8pt;color:#999;">QR Code</div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family: Arial, 'Helvetica Neue', sans-serif; font-size:9pt; color:#000; background:#fff; }
  .page { width:794px; padding:18px 22px 18px 22px; }
  table { border-collapse:collapse; width:100%; }
  td, th { border:1px solid #000; padding:3px 6px; vertical-align:middle; }
  .nb td { border:none; }
  .ar { direction:rtl; text-align:right; font-family:'Traditional Arabic',Arial,sans-serif; }
  .hdr-bg { background:#1a2e3d; color:#fff; font-weight:bold; text-align:center; font-size:9.5pt; padding:5px 8px; }
  .col-hdr { background:#1a2e3d; color:#fff; font-size:8pt; font-weight:bold; text-align:center; padding:4px 3px; }
  .lbl { font-weight:bold; }
  .tot-row td:first-child { background:#e8ecf2; font-weight:bold; text-align:right; padding-right:10px; }
  .tot-row td:last-child  { text-align:right; padding-right:8px; font-size:9pt; }
  .grand td { background:#1a2e3d; color:#fff; font-weight:bold; }
  .grand td:last-child { text-align:right; padding-right:8px; }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <table class="nb" style="margin-bottom:5px;">
    <colgroup><col style="width:40%"><col style="width:20%"><col style="width:40%"></colgroup>
    <tr>
      <td style="border:none;vertical-align:top;padding:0 6px 0 0;">
        <div style="font-weight:bold;font-size:11pt;margin-bottom:2px;">${esc(entity.nameEn)}</div>
        <div>C.R. No.: ${esc(entity.crNo)}</div>
        <div>VAT Reg. No.: ${esc(entity.vatNo)}</div>
        <div style="margin-top:3px;">${esc(entity.footerAddr || entity.address)}</div>
        ${entity.phone ? `<div>Tel: ${esc(entity.phone)}</div>` : ''}
        ${entity.email ? `<div>Email: ${esc(entity.email)}</div>` : ''}
      </td>
      <td style="border:none;text-align:center;vertical-align:middle;">
        <div style="width:68px;height:68px;border-radius:50%;background:#1a2e3d;color:#fff;font-size:30px;font-weight:bold;line-height:68px;text-align:center;margin:0 auto;">R</div>
      </td>
      <td style="border:none;vertical-align:top;padding:0 0 0 6px;" class="ar">
        <div style="font-weight:bold;font-size:11pt;margin-bottom:2px;">${esc(entity.nameAr)}</div>
        <div>س.ت: ${esc(entity.crNo)}</div>
        <div>الرقم الضريبي: ${esc(entity.vatNo)}</div>
        <div style="margin-top:3px;">${esc(entity.addressAr || entity.address)}</div>
      </td>
    </tr>
  </table>

  <hr style="border:1.5px solid #1a2e3d;margin:4px 0;">
  <div style="text-align:center;font-weight:bold;font-size:13pt;padding:5px 0;">
    TAX INVOICE &nbsp;&nbsp;/&nbsp;&nbsp; <span style="font-family:'Traditional Arabic',Arial,sans-serif;">فاتورة ضريبية</span>
  </div>
  <hr style="border:1.5px solid #1a2e3d;margin:4px 0 7px;">

  <!-- CUSTOMER DETAILS -->
  <table style="margin-bottom:6px;">
    <colgroup><col style="width:22%"><col style="width:28%"><col style="width:22%"><col style="width:28%"></colgroup>
    <tr><td colspan="4" class="hdr-bg">Customer Details &nbsp;/&nbsp; <span style="font-family:'Traditional Arabic',Arial,sans-serif;">بيانات العميل</span></td></tr>
    <tr>
      <td class="lbl">Customer Name:</td>
      <td>${esc(c.contractor_name || '')}</td>
      <td class="lbl ar">اسم العميل:</td>
      <td class="ar">${esc(c.contractor_name_ar || c.contractor_name || '')}</td>
    </tr>
    <tr>
      <td class="lbl">Address:</td>
      <td>${esc(c.address || '')}</td>
      <td class="lbl ar">العنوان:</td>
      <td class="ar">${esc(c.address_ar || c.address || '')}</td>
    </tr>
    <tr>
      <td class="lbl">VAT / Tax ID:</td>
      <td>${esc(c.vat_number || '')}</td>
      <td class="lbl ar">الرقم الضريبي:</td>
      <td class="ar">${esc(c.vat_number || '')}</td>
    </tr>
  </table>

  <!-- INVOICE META + QR -->
  <table style="margin-bottom:6px;">
    <colgroup><col style="width:25%"><col style="width:37%"><col style="width:38%"></colgroup>
    <tr>
      <td colspan="2" style="padding:0;border-right:none;">
        <table style="width:100%;">
          <colgroup><col style="width:45%"><col style="width:55%"></colgroup>
          <tr><td class="lbl">Invoice No.:</td>          <td>${esc(invoice.invoice_number || '')}</td></tr>
          <tr><td class="lbl">Invoice Date:</td>         <td>${esc(invoice.invoice_date   || '')}</td></tr>
          <tr><td class="lbl">Due Date:</td>             <td>${esc(invoice.due_date       || invoice.invoice_date || '')}</td></tr>
          <tr><td class="lbl">P.O. Number:</td>          <td>${esc(invoice.po_number      || '')}</td></tr>
          <tr><td class="lbl">P.O. Date:</td>            <td>${esc(invoice.po_date        || '')}</td></tr>
          <tr><td class="lbl">Payment Terms:</td>        <td>${esc(invoice.payment_terms  || '30 Days')}</td></tr>
        </table>
      </td>
      <td style="text-align:center;vertical-align:middle;padding:10px;border-left:none;">
        ${qrBlock}
        <div style="font-size:7pt;color:#555;margin-top:2px;">ZATCA Compliant QR</div>
      </td>
    </tr>
  </table>

  <!-- LINE ITEMS -->
  <table style="margin-bottom:6px;">
    <colgroup>
      <col style="width:4%">
      <col style="width:11%">
      <col style="width:38%">
      <col style="width:9%">
      <col style="width:15%">
      <col style="width:7%">
      <col style="width:16%">
    </colgroup>
    <tr>
      <th class="col-hdr">S.No</th>
      <th class="col-hdr">Part #</th>
      <th class="col-hdr">Description / الوصف</th>
      <th class="col-hdr">Qty</th>
      <th class="col-hdr">Unit Price<br>(SAR)</th>
      <th class="col-hdr">VAT%</th>
      <th class="col-hdr">Net Amount<br>(SAR)</th>
    </tr>
    ${lineRowsHtml}
  </table>

  <!-- TOTALS (right-aligned block, ~55% width) -->
  <table style="margin-bottom:6px;width:56%;margin-left:auto;border:1px solid #000;">
    <colgroup><col style="width:66%"><col style="width:34%"></colgroup>
    <tr class="tot-row"><td>Total Net Amount (SAR)</td>       <td>${fmt(sub)}</td></tr>
    <tr class="tot-row"><td>Discount (SAR)</td>               <td>${fmt(disc)}</td></tr>
    <tr class="tot-row"><td>Total Taxable Amount (SAR)</td>   <td>${fmt(sub - disc)}</td></tr>
    <tr class="tot-row"><td>VAT 15% (SAR)</td>                <td>${fmt(vat)}</td></tr>
    <tr class="tot-row"><td>Advance Payment (SAR)</td>        <td>${fmt(advance)}</td></tr>
    <tr class="grand">  <td style="padding:5px 10px 5px 8px;">TOTAL INCLUDING VAT (SAR)</td><td style="text-align:right;padding-right:8px;">${fmt(total)}</td></tr>
  </table>

  <!-- AMOUNT IN WORDS -->
  <table style="margin-bottom:6px;">
    <tr>
      <td style="width:32%;font-weight:bold;">Amount in Words (SAR):</td>
      <td colspan="3">${esc(amountInWords(total))}</td>
    </tr>
    <tr>
      <td class="ar lbl">المبلغ بالكلمات:</td>
      <td colspan="3" class="ar" style="color:#555;">—</td>
    </tr>
  </table>

  <!-- BANK DETAILS -->
  <table style="margin-bottom:8px;">
    <colgroup><col style="width:22%"><col style="width:28%"><col style="width:22%"><col style="width:28%"></colgroup>
    <tr><td colspan="4" class="hdr-bg">Bank Details &nbsp;/&nbsp; <span style="font-family:'Traditional Arabic',Arial,sans-serif;">بيانات البنك</span></td></tr>
    <tr>
      <td class="lbl">Beneficiary:</td>
      <td colspan="3">${esc(entity.beneficiary || entity.nameEn)}</td>
    </tr>
    <tr>
      <td class="lbl">Bank:</td>
      <td>${esc(entity.bank || '')}</td>
      <td class="lbl">Account No.:</td>
      <td>${esc(entity.accountNo || '')}</td>
    </tr>
    <tr>
      <td class="lbl">IBAN:</td>
      <td colspan="3">${esc(entity.iban || '')}</td>
    </tr>
  </table>

  <!-- FOOTER -->
  <div style="text-align:center;font-size:7.5pt;color:#555;border-top:1px solid #ccc;padding-top:5px;">
    ${esc(entity.footerAddr || entity.address)}${entity.email ? ' &nbsp;|&nbsp; ' + esc(entity.email) : ''}
  </div>

</div>
</body>
</html>`
}

// ─── Load CDN script (once per session) ──────────────────────────────────────
function loadScript(src) {
  if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error(`Failed to load ${src}`))
    document.head.appendChild(s)
  })
}

// ─── Generate PDF from HTML using html2canvas + jsPDF ────────────────────────
// This renders the invoice HTML exactly as the browser would (correct Arabic,
// system fonts, RTL layout) and captures it as a proper A4 PDF.
async function generatePdfFromHtml(htmlString) {
  // Load both libraries in parallel
  await Promise.all([
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'),
    loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'),
  ])

  // Strip the auto-print trigger so the iframe doesn't open a print dialog
  const html = htmlString.replace(/\s*onload="[^"]*"/, '')

  // Create an off-screen iframe — srcdoc keeps it same-origin so html2canvas can read it
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = [
    'position:fixed', 'left:-9999px', 'top:0',
    'width:794px', 'height:1px',      // A4 at 96dpi
    'border:none', 'visibility:hidden',
    'pointer-events:none', 'z-index:-1',
  ].join(';')
  document.body.appendChild(iframe)

  try {
    // Load HTML into iframe
    await new Promise((resolve, reject) => {
      iframe.onload = resolve
      iframe.onerror = reject
      iframe.srcdoc = html
    })

    // Give fonts / images time to load and layout to stabilise
    await new Promise(r => setTimeout(r, 900))

    const doc  = iframe.contentDocument
    const body = doc.body

    // Expand iframe to the full content height so nothing is clipped
    const fullH = Math.max(body.scrollHeight, body.offsetHeight, 1200)
    iframe.style.height = fullH + 'px'
    await new Promise(r => setTimeout(r, 200))

    // Capture the invoice wrapper (supports both old .inv-wrap and new .page class)
    const target = doc.querySelector('.inv-wrap, .page') || body

    const canvas = await window.html2canvas(target, {
      scale:        2,          // 2× for crisp text
      useCORS:      true,
      allowTaint:   true,
      backgroundColor: '#ffffff',
      logging:      false,
      windowWidth:  794,
      scrollX:      0,
      scrollY:      0,
    })

    // Build A4 PDF — one canvas image split across pages if needed
    const { jsPDF } = window.jspdf
    const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const PW     = 210   // A4 width  mm
    const PH     = 297   // A4 height mm
    const imgW   = PW
    const imgH   = (canvas.height / canvas.width) * imgW
    const imgData = canvas.toDataURL('image/jpeg', 0.92)

    let yMM    = 0
    let isFirst = true
    while (yMM < imgH) {
      if (!isFirst) pdf.addPage()
      // Shift the image up by yMM so the next page section lines up
      pdf.addImage(imgData, 'JPEG', 0, -yMM, imgW, imgH)
      yMM    += PH
      isFirst = false
    }

    return pdf.output('blob')

  } finally {
    document.body.removeChild(iframe)
  }
}

// ─── Upload PDF blob to Google Drive ─────────────────────────────────────────
async function uploadPdfToDrive(pdfBlob, filename) {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(reader.result.split(',')[1])
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(pdfBlob)
  })

  const { data, error } = await supabase.functions.invoke('drive-upload', {
    body: { file: base64, fileName: filename, mimeType: 'application/pdf', folder: 'invoices' },
  })
  if (error || !data?.success) throw new Error(data?.error || error?.message || 'Drive upload failed')
  return data  // { fileId, viewUrl, directUrl }
}

// ─── Auto-download a Blob in the browser ──────────────────────────────────────
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function InvoiceTemplatePicker({
  invoice, contractor, entityCode, entityName, entityVatNumber, onClose, onHtmlPrint,
}) {
  const [busy,      setBusy]      = useState(null)
  const [result,    setResult]    = useState(null)
  const [err,       setErr]       = useState('')
  const [templates, setTemplates] = useState([])
  const [cleaning,  setCleaning]  = useState(false)
  const [cleanMsg,  setCleanMsg]  = useState('')

  async function handleCleanupDrive() {
    if (!window.confirm('This will delete ALL files from the service account\'s Google Drive to free up storage quota.\n\nExpense photos, fleet photos, site photos and previously generated invoices stored there will be removed.\n\nContinue?')) return
    setCleaning(true); setCleanMsg('Cleaning up Drive storage…')
    try {
      const { data, error } = await supabase.functions.invoke('drive-upload', {
        body: { action: 'cleanup' },
      })
      if (error || !data?.success) throw new Error(data?.error || error?.message || 'Cleanup failed')
      setCleanMsg(`✅ Done — deleted ${data.deleted} files. Drive quota is now free. Try generating a PDF again.`)
    } catch (e) {
      setCleanMsg(`❌ Cleanup failed: ${e.message}`)
    } finally {
      setCleaning(false)
    }
  }

  // Load templates from Supabase on mount
  useEffect(() => {
    supabase.from('invoice_templates')
      .select('*').eq('active', true).order('sort_order', { ascending: true })
      .then(({ data }) => { if (data?.length) setTemplates(data) })
  }, [])

  const entity = ENTITY[entityCode] || ENTITY.ACCSYS

  const lineCount = (invoice.invoice_lines || []).filter(l => !l.is_header).length

  async function handleTemplate(tpl) {
    setBusy(tpl.id); setErr(''); setResult(null)
    try {
      // ── 0. Always fetch fresh lines from DB ───────────────────
      // This ensures invoices created before the RLS fix (and any
      // future invoice) show their real line items in the PDF.
      let freshLines = invoice.invoice_lines || []
      try {
        const { data } = await supabase
          .from('invoice_lines').select('*')
          .eq('invoice_id', invoice.id).order('sort_order', { ascending: true })
        if (data) freshLines = data
      } catch (_) { /* fall back to prop data */ }
      const invoiceWithLines = { ...invoice, invoice_lines: freshLines }

      // ── 1. Entity for this template ───────────────────────────
      const tplEntity = ENTITY[tpl.entity] || ENTITY.ACCSYS

      // ── 2. Build ZATCA QR data URL ────────────────────────────
      const sub     = parseFloat(invoiceWithLines.subtotal         || 0)
      const vat     = parseFloat(invoiceWithLines.vat_amount       || 0)
      const disc    = parseFloat(invoiceWithLines.discount_amount  || 0)
      const advance = parseFloat(invoiceWithLines.advance_amount   || 0)
      const total   = sub + vat - disc - advance

      const qrBase64  = buildZATCAQR(tplEntity.nameEn, tplEntity.vatNo, invoiceWithLines.invoice_date, total, vat)
      const qrDataUrl = await QRCodeLib.toDataURL(qrBase64, {
        errorCorrectionLevel: 'M', type: 'image/png', width: 128, margin: 1,
      })

      // ── 3. Build bilingual HTML invoice matching the DOCX template ───
      // Uses buildTemplateHTML which produces the exact same layout as
      // RAT_Tax_Invoice.docx: 3-col header, customer table, meta+QR,
      // 7-col line items, totals, amount in words, bank details, footer.
      const invoiceHtml = buildTemplateHTML({
        invoice:    invoiceWithLines,
        contractor,
        entity:     tplEntity,
        qrDataUrl,
      })

      // ── 4. Render HTML → PDF entirely in the browser ─────────
      // html2canvas captures exact browser rendering (correct Arabic/fonts).
      // jsPDF packages the canvas into a proper A4 PDF.
      // No server conversion → no garbled output.
      const pdfBlob     = await generatePdfFromHtml(invoiceHtml)
      const pdfFilename = buildFilename(invoice, contractor, tpl.id).replace(/\.docx$/i, '.pdf')

      // ── 5. Auto-download to user's Downloads folder ───────────
      downloadBlob(pdfBlob, pdfFilename)

      // ── 6. Upload PDF to Google Drive (direct PDF, no conversion) ──
      let driveUrl = null
      let driveErr = null
      try {
        const driveData = await uploadPdfToDrive(pdfBlob, pdfFilename)
        driveUrl = driveData.viewUrl
        if (driveUrl) {
          await supabase.from('invoices').update({
            attachment_url:  driveUrl,
            attachment_name: pdfFilename,
          }).eq('id', invoice.id)
        }
      } catch (uploadErr) {
        driveErr = uploadErr.message
        console.warn('[InvoiceTemplatePicker] Drive upload failed:', uploadErr.message)
      }

      setResult({ driveUrl, filename: pdfFilename, driveErr })
    } catch (e) {
      console.error('[InvoiceTemplatePicker]', e)
      setErr(e.message || 'Failed to generate PDF')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(10,20,40,0.72)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, maxWidth: 680, width: '100%',
        boxShadow: '0 24px 80px rgba(0,0,0,0.35)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ background: '#1a2e3d', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>🖨️ Select Invoice Template</div>
            <div style={{ fontSize: 12, color: '#90caf9', marginTop: 2 }}>
              {invoice.invoice_number} · {contractor?.contractor_name || '—'}
            </div>
            <div style={{ fontSize: 10, color: '#64b5f6', marginTop: 1 }}>
              {lineCount} line{lineCount !== 1 ? 's' : ''} · Generates PDF in browser · Auto-downloads · Saves to Google Drive
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>
            ×
          </button>
        </div>

        {/* Template grid */}
        <div style={{ padding: 20, maxHeight: '65vh', overflowY: 'auto' }}>
          {/* Quick HTML print */}
          <button onClick={onHtmlPrint}
            style={{ display: 'block', width: '100%', textAlign: 'left', border: '2px solid #1565c0', borderRadius: 10, padding: '10px 14px', background: '#e8f4ff', cursor: 'pointer', marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>🖥️</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: '#1565c0', marginLeft: 8 }}>Quick Print (Browser)</span>
            <span style={{ fontSize: 10, color: '#6b7c93', marginLeft: 8 }}>Open in browser — Ctrl+P to print or save as PDF</span>
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: 10 }}>
            {templates.length === 0
              ? <div style={{ color: '#90a4ae', fontSize: 12, padding: 12 }}>Loading templates…</div>
              : templates.map(tpl => {
              const loading = busy === tpl.id
              return (
                <button
                  key={tpl.id}
                  onClick={() => !busy && handleTemplate(tpl)}
                  disabled={!!busy}
                  style={{
                    border: '1.5px solid #dde3ec', borderRadius: 10, padding: '12px 14px',
                    textAlign: 'left', background: loading ? '#e3f2fd' : '#fff',
                    cursor: busy ? 'not-allowed' : 'pointer',
                    opacity: busy && !loading ? 0.6 : 1, transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{loading ? '⏳' : (tpl.icon || '📄')}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#1a2e3d', marginBottom: 4, lineHeight: 1.3 }}>{tpl.label}</div>
                  <div style={{ fontSize: 10, color: '#6b7c93', lineHeight: 1.4 }}>{tpl.description}</div>
                  <div style={{ fontSize: 9, color: '#90a4ae', marginTop: 3 }}>PDF · renders in browser → auto-downloads + Drive</div>
                  {loading && <div style={{ fontSize: 10, color: '#1565c0', fontWeight: 700, marginTop: 6 }}>Generating PDF…</div>}
                </button>
              )
            })}
          </div>

          {result && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: result.driveErr && !result.driveUrl ? '#fff8e1' : '#e8f5e9', borderRadius: 8, border: `1px solid ${result.driveErr && !result.driveUrl ? '#ffe082' : '#a5d6a7'}` }}>
              {result.filename && !result.driveErr && (
                <div style={{ fontWeight: 800, color: '#2e7d32', marginBottom: 4 }}>✅ PDF downloaded: {result.filename}</div>
              )}
              {result.driveUrl
                ? <div style={{ fontSize: 12, color: '#1b5e20' }}>📂 PDF saved to Google Drive: <a href={result.driveUrl} target="_blank" rel="noreferrer" style={{ color: '#1565c0' }}>View in Drive</a></div>
                : result.driveErr
                  ? <div style={{ fontSize: 12, color: '#c62828' }}>⚠ Drive upload failed: {result.driveErr}</div>
                  : null}
            </div>
          )}
          {err && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#ffebee', borderRadius: 8, color: '#c62828', fontSize: 12, fontWeight: 600 }}>
              ❌ {err}
              {(err.includes('Cannot find module') || err.includes('import') || err.includes('pizzip') || err.includes('docxtemplater')) && (
                <div style={{ fontWeight: 400, marginTop: 4 }}>Run <code style={{ background: '#fee', padding: '1px 4px', borderRadius: 3 }}>npm install</code> in your project folder, then restart the dev server.</div>
              )}
              {(err.toLowerCase().includes('quota') || err.toLowerCase().includes('storage')) && (
                <div style={{ fontWeight: 400, marginTop: 6 }}>
                  The Google Drive storage quota is full. Use the button below to free it up, then try again.
                </div>
              )}
            </div>
          )}

          {/* Drive quota cleanup — shown when quota error detected */}
          {(result?.driveErr?.toLowerCase().includes('quota') || result?.driveErr?.toLowerCase().includes('storage') || err?.toLowerCase().includes('quota') || err?.toLowerCase().includes('storage') || cleanMsg) && (
            <div style={{ marginTop: 10, padding: '10px 14px', background: '#fff3e0', borderRadius: 8, border: '1px solid #ffcc80' }}>
              <div style={{ fontSize: 12, color: '#e65100', fontWeight: 700, marginBottom: 6 }}>
                ⚠️ Google Drive storage quota exceeded
              </div>
              <div style={{ fontSize: 11, color: '#bf360c', marginBottom: 8 }}>
                All files uploaded to Drive (expense photos, fleet photos, invoices, etc.) are stored under the service account and have filled its 15GB limit. Click below to delete all of them and restore the quota.
              </div>
              {cleanMsg
                ? <div style={{ fontSize: 12, fontWeight: 600, color: cleanMsg.startsWith('✅') ? '#2e7d32' : '#c62828' }}>{cleanMsg}</div>
                : <button
                    onClick={handleCleanupDrive}
                    disabled={cleaning}
                    style={{ padding: '6px 14px', background: '#e65100', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
                  >
                    {cleaning ? '⏳ Cleaning…' : '🗑️ Free Drive Storage Now'}
                  </button>
              }
            </div>
          )}
        </div>

        <div style={{ padding: '10px 20px 16px', borderTop: '1px solid #f0f4f8', textAlign: 'right' }}>
          <button onClick={onClose}
            style={{ padding: '7px 20px', borderRadius: 8, border: '1.5px solid #dde3ec', background: '#fff', color: '#445566', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
