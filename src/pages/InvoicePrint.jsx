/**
 * ZATCA-COMPLIANT INVOICE PRINT — Ratal Group
 * Matches the official ACCSYS Tax Invoice template.
 * Bilingual (EN left, AR right). Phase 1 QR.
 */
import { useState, useEffect } from 'react'
import QRCodeLib from 'qrcode'

// ─── ZATCA QR Generator ──────────────────────────────────────────────────────
function makeTLV(tag, value) {
  const enc = new TextEncoder().encode(value)
  return new Uint8Array([tag, enc.length, ...enc])
}
export function generateZATCAQR({ sellerName, vatNumber, invoiceDate, total, vat }) {
  const all = new Uint8Array([
    ...makeTLV(1, sellerName),
    ...makeTLV(2, vatNumber),
    ...makeTLV(3, invoiceDate + 'T00:00:00Z'),
    ...makeTLV(4, parseFloat(total).toFixed(2)),
    ...makeTLV(5, parseFloat(vat).toFixed(2)),
  ])
  return btoa(String.fromCharCode(...all))
}

// ─── Entity Details ───────────────────────────────────────────────────────────
const ENTITY_INFO = {
  ACCSYS: {
    nameEn:      'RATAL ADVANCED TECHNOLOGIES',
    nameAr:      'مؤسسة رتل للتقنية المتطورة',
    address:     'Aghadir Street, Riyadh 12233, Saudi Arabia.',
    addressAr:   'شارع أغادير، ص.ب 59215 الرياض 11525 المملكة العربية السعودية.',
    phone:       '',
    crNo:        '7001971865',
    vatNo:       '300042611600003',
    beneficiary: 'RATAL ADVANCED TECHNOLOGIES',
    bank:        'ARAB NATIONAL BANK',
    accountNo:   '010800916342001',
    iban:        'SA8930400108009163420015',
    email:       'rashad@accsyscom.com',
    footerAddr:  'المملكة العربية السعودية، الرياض-12233، بشارة أغادير — Aghadir Street, Riyadh, Saudi Arabia',
  },
  RAT: {
    nameEn:      'RATAL TOURS & TRAVELS',
    nameAr:      'رتال للسفر والسياحة',
    address:     'Riyadh, Kingdom of Saudi Arabia',
    addressAr:   'الرياض، المملكة العربية السعودية',
    phone:       '',
    crNo:        '7001946511',
    vatNo:       '300000000000001',
    beneficiary: 'RATAL TOURS & TRAVELS',
    bank:        'ARAB NATIONAL BANK',
    accountNo:   '',
    iban:        '',
    email:       '',
    footerAddr:  'Riyadh, Saudi Arabia',
  },
  GWT: {
    nameEn:      'GREEN WINGS TRAVEL & TOURISM',
    nameAr:      'الأجنحة الخضراء للسفر والسياحة',
    address:     'Riyadh, Kingdom of Saudi Arabia',
    addressAr:   'الرياض، المملكة العربية السعودية',
    phone:       '',
    crNo:        '7001971857',
    vatNo:       '300000000000002',
    beneficiary: 'GREEN WINGS TRAVEL & TOURISM',
    bank:        'ARAB NATIONAL BANK',
    accountNo:   '',
    iban:        '',
    email:       '',
    footerAddr:  'Riyadh, Saudi Arabia',
  },
}

// ─── Invoice type labels ──────────────────────────────────────────────────────
function typeLabel(t) {
  const map = {
    TAX:         { en:'TAX INVOICE',              ar:'فاتورة ضريبية' },
    SIMPLIFIED:  { en:'SIMPLIFIED TAX INVOICE',   ar:'فاتورة ضريبية مبسطة' },
    ZERO_RATED:  { en:'INVOICE (ZERO-RATED)',      ar:'فاتورة (معفاة)' },
    CREDIT_NOTE: { en:'CREDIT NOTE',               ar:'إشعار دائن' },
    DEBIT_NOTE:  { en:'DEBIT NOTE',                ar:'إشعار مدين' },
  }
  return map[t] || map.TAX
}

// ─── Number to English Words ──────────────────────────────────────────────────
function numberToWordsEn(n) {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  function below1000(num) {
    if (num === 0) return ''
    if (num < 20) return ones[num]
    if (num < 100) return tens[Math.floor(num/10)] + (num%10 ? '-'+ones[num%10] : '')
    return ones[Math.floor(num/100)] + ' Hundred' + (num%100 ? ' and ' + below1000(num%100) : '')
  }
  const int = Math.floor(Math.abs(n))
  const dec = Math.round((Math.abs(n) - int) * 100)
  if (int === 0 && dec === 0) return 'Zero Saudi Riyals Only'
  let w = ''
  if (int >= 1000000) { w += below1000(Math.floor(int/1000000)) + ' Million '; }
  if (int >= 1000)    { w += below1000(Math.floor((int%1000000)/1000)) + ' Thousand '; }
  w += below1000(int % 1000)
  w = w.trim() + ' Saudi Riyals'
  if (dec > 0) w += ' and ' + below1000(dec) + ' Halalas'
  return w + ' Only'
}

// ─── Number to Arabic Words ───────────────────────────────────────────────────
function numberToWordsAr(n) {
  const ones = ['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة',
    'عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر',
    'سبعة عشر','ثمانية عشر','تسعة عشر']
  const tens = ['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون']
  function below1000(num) {
    if (num === 0) return ''
    if (num < 20) return ones[num]
    const t = tens[Math.floor(num/10)]
    const o = ones[num%10]
    if (num < 100) return o ? o + ' و' + t : t
    const h = ['','مئة','مئتان','ثلاثمئة','أربعمئة','خمسمئة','ستمئة','سبعمئة','ثمانمئة','تسعمئة'][Math.floor(num/100)]
    const rest = below1000(num % 100)
    return h + (rest ? ' و' + rest : '')
  }
  const int = Math.floor(Math.abs(n))
  const dec = Math.round((Math.abs(n) - int) * 100)
  if (int === 0 && dec === 0) return 'صفر ريال سعودي فقط'
  let w = ''
  const millions  = Math.floor(int / 1000000)
  const thousands = Math.floor((int % 1000000) / 1000)
  const rem       = int % 1000
  if (millions  > 0) w += (millions === 1 ? 'مليون' : millions === 2 ? 'مليونان' : below1000(millions) + ' ملايين') + ' '
  if (thousands > 0) w += (thousands === 1 ? 'ألف' : thousands === 2 ? 'ألفان' : below1000(thousands) + ' آلاف') + ' '
  w += below1000(rem)
  w = w.trim() + ' ريال سعودي'
  if (dec > 0) w += ' و' + below1000(dec) + ' هللة'
  return w + ' فقط'
}

// ─── Build full HTML for print window ────────────────────────────────────────
export function buildPrintHTML({ invoice, entity, qrDataUrl }) {
  const sub     = invoice.subtotal     || 0
  const vat     = invoice.vat_amount   || 0
  const disc    = invoice.discount_amount || 0
  const advance = invoice.advance_amount  || 0
  const net     = sub - disc
  const total   = net + vat - advance
  const lbl     = typeLabel(invoice.invoice_type)
  const wordsEn = numberToWordsEn(total)
  const wordsAr = numberToWordsAr(total)

  const linesHtml = (() => {
    const rows = invoice.invoice_lines && invoice.invoice_lines.length > 0
      ? invoice.invoice_lines
      : [{ description: invoice.description || 'Services rendered', quantity:1, unit_price: sub, vat_rate: invoice.invoice_type==='ZERO_RATED'?0:15, vat_amount: vat, line_total: sub+vat, part_no:'' }]

    return rows.map((l, i) => {
      if (l.is_header) {
        return `<tr style="background:#1e3a5f; border-bottom:2px solid #4fc3f7;">
          <td colspan="7" style="padding:8px 14px; font-weight:800; font-size:12px; color:#e3f2fd; letter-spacing:0.5px;">▸ ${l.description||''}</td>
        </tr>`
      }
      return `
      <tr style="border-bottom:1px solid #c8d0da; ${i%2===1?'background:#f8fafd':''}">
        <td style="padding:7px 6px; text-align:center; font-size:12px;">${i+1}</td>
        <td style="padding:7px 6px; font-size:11px; color:#555;">${l.part_no||''}</td>
        <td style="padding:7px 8px; font-size:12px;">${l.description||''}</td>
        <td style="padding:7px 6px; text-align:center; font-size:12px;">${parseFloat(l.quantity||1).toFixed(1)}</td>
        <td style="padding:7px 6px; text-align:right; font-size:12px;">${parseFloat(l.unit_price||0).toFixed(2)}</td>
        <td style="padding:7px 6px; text-align:center; font-size:12px;">${invoice.invoice_type==='ZERO_RATED'?'0%':(l.vat_rate||15)+'%'}</td>
        <td style="padding:7px 8px; text-align:right; font-size:12px; font-weight:700;">${parseFloat(l.line_total||l.unit_price||0).toFixed(2)}</td>
      </tr>`
    }).join('')
  })()

  return `<!DOCTYPE html>
<html dir="ltr">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice.invoice_number||''}</title>
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Segoe UI',Arial,sans-serif; color:#222; font-size:12px; background:#fff; padding:14px 18px; }
    .inv-wrap { border:2px solid #1a2e3d; max-width:820px; margin:0 auto; }
    /* HEADER */
    .hdr { display:flex; align-items:center; justify-content:space-between; padding:12px 16px 6px; border-bottom:2px solid #1a2e3d; }
    .hdr-logo { width:80px; height:80px; display:flex; align-items:center; justify-content:center; border:3px solid #1a2e3d; border-radius:50%; font-size:36px; font-weight:900; color:#1a2e3d; }
    .hdr-title { text-align:center; flex:1; padding:0 12px; }
    .hdr-title h1 { font-size:20px; font-weight:900; color:#1a2e3d; }
    .hdr-title .ar { font-size:18px; color:#1a2e3d; font-weight:800; direction:rtl; }
    .hdr-qr { width:90px; text-align:center; }
    .hdr-qr img { width:85px; height:85px; border:1px solid #ccc; padding:2px; }
    .hdr-qr p { font-size:7px; color:#999; margin-top:2px; }
    /* COMPANY INFO */
    .co-info { display:flex; border-bottom:1px solid #c8d0da; }
    .co-en { flex:1; padding:8px 12px; font-size:11px; border-right:1px solid #c8d0da; }
    .co-ar { flex:1; padding:8px 12px; font-size:11px; text-align:right; direction:rtl; }
    .co-name { font-size:13px; font-weight:900; margin-bottom:3px; }
    .co-row { margin-bottom:2px; color:#333; }
    .co-label { color:#666; }
    /* INV DETAIL GRID */
    .inv-grid { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; border-bottom:2px solid #1a2e3d; }
    .inv-grid-cell { padding:5px 10px; border-right:1px solid #c8d0da; }
    .inv-grid-cell:last-child { border-right:none; }
    .inv-grid-cell .gh { font-size:10px; color:#555; font-weight:700; }
    .inv-grid-cell .gh-ar { font-size:9px; color:#777; direction:rtl; display:block; }
    .inv-grid-cell .gv { font-size:13px; font-weight:800; color:#1a2e3d; margin-top:2px; }
    /* CUSTOMER */
    .cust { border-bottom:1px solid #c8d0da; padding:8px 14px; }
    .cust-name { font-size:18px; font-weight:900; text-align:center; margin-bottom:2px; }
    .cust-name-ar { font-size:14px; text-align:center; direction:rtl; color:#333; margin-bottom:6px; }
    .cust-grid { display:grid; grid-template-columns:1fr 1fr; gap:2px 20px; font-size:11px; }
    .cust-row { display:flex; gap:6px; }
    .cust-label { color:#555; font-weight:700; white-space:nowrap; }
    /* LINE ITEMS TABLE */
    table.lines { width:100%; border-collapse:collapse; }
    table.lines thead tr { background:#1a2e3d; }
    table.lines thead th { padding:7px 6px; color:#fff; font-size:10px; font-weight:700; text-align:left; }
    table.lines thead th.r { text-align:right; }
    table.lines thead th.c { text-align:center; }
    table.lines tbody tr:last-child { border-bottom:2px solid #1a2e3d; }
    /* BOTTOM SECTION */
    .bottom { display:flex; border-top:1px solid #c8d0da; }
    .bank { flex:1; padding:10px 12px; border-right:2px solid #1a2e3d; font-size:11px; }
    .bank-title { font-size:12px; font-weight:900; margin-bottom:6px; text-decoration:underline; text-align:center; background:#e8edf2; padding:3px; }
    .bank-row { margin-bottom:3px; }
    .bank-lbl { font-weight:700; color:#333; }
    .totals { width:280px; padding:8px 12px; }
    .tot-row { display:flex; justify-content:space-between; padding:4px 0; font-size:12px; border-bottom:1px solid #e0e7ef; }
    .tot-row.grand { font-size:14px; font-weight:900; color:#1a2e3d; background:#dde6f0; padding:6px 8px; margin-top:4px; border-radius:4px; }
    .tot-row.grand .ar { direction:rtl; font-size:11px; }
    /* SIGNATURE BAR */
    .sig-bar { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; border-top:2px solid #1a2e3d; }
    .sig-cell { padding:24px 10px 6px; border-right:1px solid #c8d0da; text-align:center; font-size:10px; font-weight:700; color:#555; }
    .sig-cell:last-child { border-right:none; }
    /* FOOTER */
    .footer { background:#f4f7fb; border-top:1px solid #c8d0da; padding:6px 14px; display:flex; justify-content:space-between; font-size:9px; color:#888; }
    @media print {
      body { padding:0; }
      .inv-wrap { border:2px solid #1a2e3d; }
      @page { margin:10mm 8mm 14mm; size:A4; }
      .footer {
        position: running(footer);
      }
      @page { @bottom-left { content: element(footer); } }
    }
  </style>
</head>
<body onload="window.print()">
<div class="inv-wrap">

  <!-- HEADER: Logo | Title | QR -->
  <div class="hdr">
    <div class="hdr-logo">R</div>
    <div class="hdr-title">
      <h1>${lbl.en}</h1>
      <div class="ar">${lbl.ar}/</div>
    </div>
    <div class="hdr-qr">
      ${qrDataUrl ? `<img src="${qrDataUrl}" alt="ZATCA QR"/>` : '<div style="width:85px;height:85px;border:1px solid #ccc;display:flex;align-items:center;justify-content:center;font-size:9px;color:#aaa;">QR</div>'}
      <p>ZATCA Phase 1</p>
    </div>
  </div>

  <!-- COMPANY INFO: EN left | AR right -->
  <div class="co-info">
    <div class="co-en">
      <div class="co-name">${entity.nameEn}</div>
      <div class="co-row">${entity.address}</div>
      ${entity.phone ? `<div class="co-row"><span class="co-label">Phone: </span>${entity.phone}</div>` : ''}
      <div class="co-row"><span class="co-label">CR No: </span>${entity.crNo}</div>
      <div class="co-row"><span class="co-label">VAT No: </span>${entity.vatNo}</div>
    </div>
    <div class="co-ar">
      <div class="co-name">${entity.nameAr}</div>
      <div class="co-row">${entity.addressAr}</div>
      ${entity.phone ? `<div class="co-row">${entity.phone} :هاتف</div>` : ''}
      <div class="co-row">${entity.crNo} :رقم السجل التجاري</div>
      <div class="co-row">${entity.vatNo} :الرقم الضريبي</div>
    </div>
  </div>

  <!-- INVOICE DETAILS GRID -->
  <div class="inv-grid">
    <div class="inv-grid-cell">
      <span class="gh">Invoice Date <span class="gh-ar">تاريخ الفاتورة</span></span>
      <div class="gv">${invoice.invoice_date||''}</div>
    </div>
    <div class="inv-grid-cell">
      <span class="gh">Invoice No <span class="gh-ar">رقم الفاتورة</span></span>
      <div class="gv">${invoice.invoice_number||'-'}</div>
    </div>
    <div class="inv-grid-cell">
      <span class="gh">PO Date <span class="gh-ar">تاريخ الطلب</span></span>
      <div class="gv">${invoice.po_date||invoice.due_date||'-'}</div>
    </div>
    <div class="inv-grid-cell">
      <span class="gh">PO No <span class="gh-ar">رقم الطلب</span></span>
      <div class="gv">${invoice.po_number||'-'}</div>
    </div>
  </div>

  <!-- CUSTOMER SECTION -->
  <div class="cust">
    ${(() => {
      const c = invoice._contractor || {}
      const name = c.contractor_name || invoice.customer_name || '—'
      const vatNo = c.vat_number || c.tax_number || c.vat_reg_no || ''
      const crNo  = c.cr_number || c.commercial_registration_no || ''
      const addr  = [c.address || c.address_line1 || c.street, c.city, c.country].filter(Boolean).join(', ')
      return `
        <div class="cust-name">${name}</div>
        <div class="cust-grid">
          ${vatNo ? `<div class="cust-row"><span class="cust-label">VAT No:</span> ${vatNo}</div>` : ''}
          ${crNo  ? `<div class="cust-row"><span class="cust-label">CR No:</span> ${crNo}</div>`   : ''}
          ${addr  ? `<div class="cust-row"><span class="cust-label">Address:</span> ${addr}</div>` : ''}
          ${invoice.due_date ? `<div class="cust-row"><span class="cust-label">Payment Term:</span> ${invoice.due_date}</div>` : ''}
          ${invoice.project_no ? `<div class="cust-row"><span class="cust-label">Project No:</span> ${invoice.project_no}</div>` : ''}
          ${invoice.department ? `<div class="cust-row"><span class="cust-label">Department:</span> ${invoice.department}</div>` : ''}
          ${invoice.ref_invoice_number ? `<div class="cust-row" style="color:#c62828;font-weight:700;"><span class="cust-label">Ref Invoice:</span> ${invoice.ref_invoice_number}</div>` : ''}
        </div>`
    })()}
  </div>

  <!-- LINE ITEMS TABLE -->
  <table class="lines">
    <thead>
      <tr>
        <th class="c" style="width:32px;">رقم م<br>Sn</th>
        <th style="width:70px;">رقم المادة<br>Part No</th>
        <th>بيـــان<br>Description</th>
        <th class="c" style="width:45px;">الكمية<br>Qty</th>
        <th class="r" style="width:90px;">سعر الوحدة<br>Unit Price</th>
        <th class="c" style="width:55px;">15 % الضريبة<br>VAT %</th>
        <th class="r" style="width:90px;">صافي القيمة<br>Net Amount</th>
      </tr>
    </thead>
    <tbody>
      ${linesHtml}
    </tbody>
  </table>

  <!-- TOTALS + AMOUNT IN WORDS -->
  <div style="display:flex; border-top:1px solid #c8d0da;">
    <div class="totals" style="flex:1; padding:8px 12px;">
      <div class="tot-row"><span>Total Net Amount (SAR) <span style="direction:rtl;font-size:10px;color:#888">الإجمالي الصافي</span></span><span>${net.toFixed(2)}</span></div>
      <div class="tot-row"><span>Discount (SAR) <span style="direction:rtl;font-size:10px;color:#888">الخصـم</span></span><span>${disc > 0 ? disc.toFixed(2) : '—'}</span></div>
      <div class="tot-row"><span>Total Taxable Amount (SAR) <span style="direction:rtl;font-size:10px;color:#888">الوعاء الضريبي</span></span><span>${net.toFixed(2)}</span></div>
      <div class="tot-row"><span>VAT ${invoice.invoice_type==='ZERO_RATED'?'0%':'15%'} (SAR) <span style="direction:rtl;font-size:10px;color:#888">ضريبة قيمة مضافة</span></span><span>${vat.toFixed(2)}</span></div>
      <div class="tot-row"><span>Advance Payment (SAR) <span style="direction:rtl;font-size:10px;color:#888">دفعة مقدم</span></span><span>${advance > 0 ? advance.toFixed(2) : '0.00'}</span></div>
      <div class="tot-row grand">
        <span>TOTAL INC. VAT (SAR)<br><span class="ar" style="font-size:10px;">المجموع شامل الضريبة</span></span>
        <span style="font-size:16px;">${total.toFixed(2)}</span>
      </div>
    </div>
    <div style="width:300px; padding:8px 12px; border-left:1px solid #c8d0da; display:flex; flex-direction:column; justify-content:center; gap:10px;">
      <div style="border:1px solid #c8d0da; border-radius:6px; padding:8px 10px;">
        <div style="font-size:10px; font-weight:700; color:#555; margin-bottom:4px;">Amount in Words (EN):</div>
        <div style="font-size:11px; font-style:italic; color:#1a2e3d; font-weight:600;">${wordsEn}</div>
      </div>
      <div style="border:1px solid #c8d0da; border-radius:6px; padding:8px 10px; direction:rtl; text-align:right;">
        <div style="font-size:10px; font-weight:700; color:#555; margin-bottom:4px;">المبلغ بالكلمات:</div>
        <div style="font-size:11px; font-style:italic; color:#1a2e3d; font-weight:600;">${wordsAr}</div>
      </div>
    </div>
  </div>

  <!-- BANK DETAILS -->
  <div class="bottom" style="border-top:2px solid #1a2e3d;">
    <div class="bank" style="flex:1;">
      <div class="bank-title">Bank Details</div>
      <table style="width:100%; border-collapse:collapse; font-size:11px;">
        <thead><tr style="background:#1a2e3d; color:#fff;">
          <th style="padding:5px 8px; text-align:left;">Account Holder Name</th>
          <th style="padding:5px 8px; text-align:left;">Bank Name</th>
          <th style="padding:5px 8px; text-align:left;">Account No</th>
          <th style="padding:5px 8px; text-align:left;">IBAN</th>
        </tr></thead>
        <tbody><tr style="border-bottom:1px solid #e0e7ef;">
          <td style="padding:5px 8px;">${entity.beneficiary}</td>
          <td style="padding:5px 8px;">${entity.bank}</td>
          <td style="padding:5px 8px;">${entity.accountNo||'—'}</td>
          <td style="padding:5px 8px;">${entity.iban||'—'}</td>
        </tr></tbody>
      </table>
      ${invoice.notes ? `<div style="margin-top:8px;font-size:10px;color:#555;border-top:1px dashed #ccc;padding-top:6px;"><strong>Notes:</strong> ${invoice.notes}</div>` : ''}
    </div>
  </div>

  <!-- SIGNATURE BAR -->
  <div class="sig-bar">
    <div class="sig-cell">Approved By</div>
    <div class="sig-cell">Received By</div>
    <div class="sig-cell">Date</div>
    <div class="sig-cell">Signature</div>
  </div>

  <!-- FOOTER -->
  <div class="footer">
    <span>${entity.footerAddr}</span>
    <span>Invoice No: ${invoice.invoice_number||''} &nbsp;|&nbsp; Page 1 of 1</span>
  </div>

</div>
</body>
</html>`
}

// ─── React Component ──────────────────────────────────────────────────────────
export default function InvoicePrint({ invoice, entityName, entityNameAr, vatNumber, entityCode, onClose }) {
  if (!invoice) return null

  const sub   = invoice.subtotal     || 0
  const vat   = invoice.vat_amount   || 0
  const total = invoice.total_amount || sub + vat

  const qr = invoice.qr_code || generateZATCAQR({
    sellerName:  entityName || 'Ratal Group',
    vatNumber:   vatNumber  || '300000000000003',
    invoiceDate: invoice.invoice_date,
    total, vat,
  })

  // Generate QR as data URL locally (no external service needed)
  const [qrDataUrl, setQrDataUrl] = useState('')
  useEffect(() => {
    QRCodeLib.toDataURL(qr, { width: 120, margin: 1, errorCorrectionLevel: 'M' })
      .then(url => setQrDataUrl(url))
      .catch(() => {})
  }, [qr])

  // Pick entity info — fall back to generic if not found
  const code   = entityCode || 'ACCSYS'
  const entity = ENTITY_INFO[code] || {
    ...ENTITY_INFO.ACCSYS,
    nameEn: entityName || 'Ratal Group',
    nameAr: entityNameAr || '',
    vatNo:  vatNumber || '',
  }

  function print() {
    const win = window.open('', '_blank', 'width=900,height=1100')
    win.document.write(buildPrintHTML({ invoice, entity, qrDataUrl }))
    win.document.close()
  }

  const lbl = typeLabel(invoice.invoice_type)

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:2000, display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:'20px 10px' }}>
      <div style={{ background:'#fff', borderRadius:14, maxWidth:820, width:'100%', boxShadow:'0 20px 60px rgba(0,0,0,0.35)' }}>

        {/* Action bar */}
        <div style={{ padding:'12px 20px', background:'#1a2e3d', borderRadius:'14px 14px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ color:'#fff', fontWeight:700, fontSize:14 }}>
            🧾 {lbl.en} — {invoice.invoice_number || invoice.id?.slice(0,8)}
          </span>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={print} style={{ background:'#1976d2', color:'#fff', border:'none', borderRadius:8, padding:'8px 20px', cursor:'pointer', fontSize:13, fontWeight:700 }}>🖨️ Print / Save PDF</button>
            <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'none', borderRadius:8, padding:'8px 14px', cursor:'pointer', fontSize:13 }}>✕</button>
          </div>
        </div>

        {/* Preview */}
        <div style={{ padding:'24px 28px', fontFamily:"'Segoe UI',Arial,sans-serif" }}>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'2px solid #1a2e3d', paddingBottom:12, marginBottom:0 }}>
            <div style={{ width:72, height:72, border:'3px solid #1a2e3d', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, fontWeight:900, color:'#1a2e3d' }}>R</div>
            <div style={{ textAlign:'center', flex:1 }}>
              <div style={{ fontSize:20, fontWeight:900, color:'#1a2e3d' }}>{lbl.en}</div>
              <div style={{ fontSize:16, color:'#1a2e3d', fontWeight:800 }}>{lbl.ar}/</div>
            </div>
            <div style={{ textAlign:'center' }}>
              {qrDataUrl
                ? <img src={qrDataUrl} alt="ZATCA QR" style={{ width:80, height:80, border:'1px solid #ccc', padding:2 }} />
                : <div style={{ width:80, height:80, border:'1px solid #ccc', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, color:'#aaa', textAlign:'center' }}>QR<br/>Loading…</div>
              }
              <div style={{ fontSize:8, color:'#aaa' }}>ZATCA Phase 1</div>
            </div>
          </div>

          {/* Company info */}
          <div style={{ display:'flex', borderBottom:'1px solid #c8d0da', border:'1px solid #c8d0da' }}>
            <div style={{ flex:1, padding:'8px 12px', borderRight:'1px solid #c8d0da', fontSize:11 }}>
              <div style={{ fontSize:13, fontWeight:900 }}>{entity.nameEn}</div>
              <div>{entity.address}</div>
              {entity.crNo && <div><strong>CR No: </strong>{entity.crNo}</div>}
              <div><strong>VAT No: </strong>{entity.vatNo}</div>
            </div>
            <div style={{ flex:1, padding:'8px 12px', fontSize:11, textAlign:'right', direction:'rtl' }}>
              <div style={{ fontSize:13, fontWeight:900 }}>{entity.nameAr}</div>
              <div>{entity.addressAr}</div>
              {entity.crNo && <div>{entity.crNo} :رقم السجل التجاري</div>}
              <div>{entity.vatNo} :الرقم الضريبي</div>
            </div>
          </div>

          {/* Invoice detail grid */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', border:'1px solid #c8d0da', borderTop:'none', borderBottom:'2px solid #1a2e3d' }}>
            {[
              { en:'Invoice Date', ar:'تاريخ الفاتورة', val:invoice.invoice_date },
              { en:'Invoice No',   ar:'رقم الفاتورة',   val:invoice.invoice_number },
              { en:'PO Date',      ar:'تاريخ الطلب',    val:invoice.po_date || invoice.due_date || '-' },
              { en:'PO No',        ar:'رقم الطلب',      val:invoice.po_number || '-' },
            ].map((c,i) => (
              <div key={i} style={{ padding:'5px 10px', borderRight: i<3 ? '1px solid #c8d0da' : 'none' }}>
                <div style={{ fontSize:10, color:'#555', fontWeight:700 }}>{c.en} <span style={{ fontSize:9, color:'#777', direction:'rtl', display:'inline-block' }}>{c.ar}</span></div>
                <div style={{ fontSize:13, fontWeight:800, color:'#1a2e3d', marginTop:2 }}>{c.val}</div>
              </div>
            ))}
          </div>

          {/* Customer */}
          {(() => {
            const c = invoice._contractor || {}
            const name = c.contractor_name || invoice.customer_name || '—'
            const vatNo = c.vat_number || c.tax_number || c.vat_reg_no || ''
            const crNo  = c.cr_number || c.commercial_registration_no || ''
            const addr  = [c.address || c.address_line1 || c.street, c.city, c.country].filter(Boolean).join(', ')
            return (
              <div style={{ border:'1px solid #c8d0da', borderTop:'none', padding:'8px 14px' }}>
                <div style={{ fontSize:17, fontWeight:900, textAlign:'center', marginBottom:4 }}>{name}</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2px 20px', fontSize:11 }}>
                  {vatNo && <div><strong>VAT No: </strong>{vatNo}</div>}
                  {crNo  && <div><strong>CR No: </strong>{crNo}</div>}
                  {addr  && <div><strong>Address: </strong>{addr}</div>}
                  {invoice.due_date && <div><strong>Payment Term: </strong>{invoice.due_date}</div>}
                  {invoice.project_no && <div><strong>Project: </strong>{invoice.project_no}</div>}
                  {invoice.department && <div><strong>Dept: </strong>{invoice.department}</div>}
                  {invoice.ref_invoice_number && <div style={{ color:'#c62828', fontWeight:700 }}>Ref: {invoice.ref_invoice_number}</div>}
                </div>
              </div>
            )
          })()}

          {/* Line items */}
          <table style={{ width:'100%', borderCollapse:'collapse', border:'1px solid #c8d0da', borderTop:'none' }}>
            <thead>
              <tr style={{ background:'#1a2e3d' }}>
                {['Sn','Part No','Description / بيان','Qty','Unit Price','VAT%','Net Amount'].map((h,i) => (
                  <th key={h} style={{ padding:'7px 6px', color:'#fff', fontSize:10, fontWeight:700, textAlign: i===0||i===3||i===5?'center':i>=4?'right':'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(invoice.invoice_lines && invoice.invoice_lines.length > 0
                ? invoice.invoice_lines
                : [{ description: invoice.description||'Services rendered', quantity:1, unit_price:sub, vat_rate:invoice.invoice_type==='ZERO_RATED'?0:15, vat_amount:vat, line_total:total, part_no:'' }]
              ).map((l, i) => {
                if (l.is_header) {
                  return (
                    <tr key={i} style={{ background:'#1e3a5f', borderBottom:'2px solid #4fc3f7' }}>
                      <td colSpan={7} style={{ padding:'8px 14px', fontWeight:800, fontSize:12, color:'#e3f2fd', letterSpacing:0.5 }}>▸ {l.description}</td>
                    </tr>
                  )
                }
                return (
                  <tr key={i} style={{ borderBottom:'1px solid #e8edf2', background:i%2===1?'#f9fbff':'#fff' }}>
                    <td style={{ padding:'7px 6px', textAlign:'center', fontSize:12 }}>{i+1}</td>
                    <td style={{ padding:'7px 6px', fontSize:11, color:'#555' }}>{l.part_no||''}</td>
                    <td style={{ padding:'7px 8px', fontSize:12 }}>{l.description}</td>
                    <td style={{ padding:'7px 6px', textAlign:'center', fontSize:12 }}>{parseFloat(l.quantity||1).toFixed(1)}</td>
                    <td style={{ padding:'7px 6px', textAlign:'right', fontSize:12 }}>{parseFloat(l.unit_price||0).toFixed(2)}</td>
                    <td style={{ padding:'7px 6px', textAlign:'center', fontSize:12 }}>{invoice.invoice_type==='ZERO_RATED'?'0%':(l.vat_rate||15)+'%'}</td>
                    <td style={{ padding:'7px 8px', textAlign:'right', fontSize:13, fontWeight:700 }}>{parseFloat(l.line_total||0).toFixed(2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Bank + Totals */}
          <div style={{ display:'flex', border:'1px solid #c8d0da', borderTop:'none' }}>
            <div style={{ flex:1, padding:'10px 12px', borderRight:'2px solid #1a2e3d', fontSize:11 }}>
              <div style={{ fontWeight:900, textDecoration:'underline', textAlign:'center', background:'#e8edf2', padding:'3px', marginBottom:6, fontSize:12 }}>BANK DETAILS</div>
              <div><strong>BENEFICIARY: </strong>{entity.beneficiary}</div>
              <div><strong>BANK NAME: </strong>{entity.bank}</div>
              {entity.accountNo && <div><strong>ACCOUNT NO: </strong>{entity.accountNo}</div>}
              {entity.iban && <div><strong>IBAN NO: </strong>{entity.iban}</div>}
            </div>
            <div style={{ width:260, padding:'8px 12px' }}>
              {[
                { en:'Sub Total',       ar:'الإجمالي',         val: sub.toFixed(2) },
                { en:'Discount',        ar:'الخصـم',            val: (invoice.discount_amount||0) > 0 ? (invoice.discount_amount).toFixed(2) : '—' },
                { en:'Net Amount',      ar:'الإجمالي الصافي',  val: (sub-(invoice.discount_amount||0)).toFixed(2) },
                { en:'VAT '+(invoice.invoice_type==='ZERO_RATED'?'0%':'15%'), ar:'ضريبة قيمة مضافة', val: vat.toFixed(2) },
                { en:'Advance Payment', ar:'دفعة مقدم',        val: (invoice.advance_amount||0) > 0 ? (invoice.advance_amount).toFixed(2) : '0.0' },
              ].map((r,i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', fontSize:12, borderBottom:'1px solid #e8edf2' }}>
                  <span>{r.en} <span style={{ fontSize:9, color:'#888', direction:'rtl' }}>{r.ar}</span></span>
                  <span>{r.val}</span>
                </div>
              ))}
              <div style={{ display:'flex', justifyContent:'space-between', background:'#dde6f0', padding:'6px 8px', marginTop:4, borderRadius:4 }}>
                <span style={{ fontWeight:900, fontSize:14 }}>Total SAR <span style={{ fontSize:10, direction:'rtl', color:'#555' }}>الصافي المجموع</span></span>
                <span style={{ fontWeight:900, fontSize:16, color:'#1a2e3d' }}>{total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Signature bar */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', border:'1px solid #c8d0da', borderTop:'2px solid #1a2e3d' }}>
            {['Approved By','Received By','Date','Signature'].map((s,i) => (
              <div key={s} style={{ padding:'22px 10px 6px', borderRight: i<3?'1px solid #c8d0da':'none', textAlign:'center', fontSize:10, fontWeight:700, color:'#555' }}>{s}</div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ background:'#f4f7fb', borderTop:'1px solid #c8d0da', padding:'5px 14px', display:'flex', justifyContent:'space-between', fontSize:9, color:'#888' }}>
            <span>{entity.email ? entity.email + ' — ' : ''}{entity.footerAddr}</span>
            <span>Page: 1/1 &nbsp;|&nbsp; Powered by Ratal ERP</span>
          </div>
        </div>
      </div>
    </div>
  )
}
