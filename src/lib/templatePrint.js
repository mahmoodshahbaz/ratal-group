/**
 * ACCSYS — Unified Template Print Utility
 * ─────────────────────────────────────────
 * printDocument(templateKey, data, options?)
 *   1. Tries to fetch compiled_html from Supabase document_templates
 *   2. Falls back to built-in templates (BUILTIN_TEMPLATES[key])
 *   3. Replaces {{placeholder}} tokens with real data values
 *   4. Opens a print window — user saves as PDF
 *
 * Usage:
 *   import { printDocument } from '../lib/templatePrint'
 *   printDocument('money_request', { request_number: 'MR-001', ... })
 */

import { supabase } from './supabase'

// Supabase project URL — used by the print window to call edge functions
const SUPA_URL  = import.meta.env.VITE_SUPABASE_URL  || ''
const SUPA_KEY  = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// ─── Token replacer ──────────────────────────────────────────────────────────
function injectData(html, data) {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = data[key]
    return val !== undefined && val !== null ? String(val) : ''
  })
}

// ─── Shared HTML builder (fetch Supabase → built-in fallback) ────────────────
// Returns the raw document HTML string, or null if no template found.
export async function buildDocumentHtml(templateKey, data) {
  let html = null
  try {
    const { data: row } = await supabase
      .from('document_templates')
      .select('compiled_html')
      .eq('template_key', templateKey)
      .eq('is_active', true)
      .single()
    if (row?.compiled_html) html = row.compiled_html
  } catch (_) { /* fall through */ }

  if (!html) {
    const builder = BUILTIN_BUILDERS[templateKey]
    if (!builder) return null
    html = builder(data)
  } else {
    html = injectData(html, data)
  }
  return html
}

// ─── Main entry point ────────────────────────────────────────────────────────
// options.driveFolder   : Drive subfolder key (e.g. 'money-requests')
// options.driveFileName : suggested PDF filename
// options.mrId          : money_request.id — used to write back drive_url
// ── Pre-open a print window SYNCHRONOUSLY (call before any await!) ───────────
// Returns a window handle. Pass it to printDocument via options._preWin.
// Browsers block window.open() when called after async operations.
export function openPrintWindow() {
  try {
    const win = window.open('', '_blank', 'width=1200,height=860')
    if (win) {
      win.document.write(
        '<html><body style="display:flex;align-items:center;justify-content:center;' +
        'height:100vh;font-family:Arial,sans-serif;background:#f5f8ff;">' +
        '<div style="text-align:center;color:#1565c0;">' +
        '<div style="font-size:36px;margin-bottom:10px;">⏳</div>' +
        '<div style="font-size:14px;font-weight:700;">Preparing document…</div>' +
        '<div style="font-size:11px;color:#888;margin-top:6px;">Please wait — do not close this window</div>' +
        '</div></body></html>'
      )
    }
    return win
  } catch (_) { return null }
}

export async function printDocument(templateKey, data, options = {}) {
  let html = await buildDocumentHtml(templateKey, data)
  if (!html) {
    alert(`No template found for key: ${templateKey}`)
    return
  }

  const driveConfig = {
    supaUrl:      SUPA_URL,
    supaKey:      SUPA_KEY,
    folder:       options.driveFolder    || '',
    fileName:     options.driveFileName  || `${templateKey}-${Date.now()}.pdf`,
    mrId:         options.mrId           || '',
    autoRun:      options.autoRun        || false,
    requestDate:  options.requestDate    || '',
    isIframe:     options.autoOnly       || false,
    orientation:  options.orientation    || 'landscape',
    payslipMonth: options.payslipMonth   || '',   // e.g. "September" — for Payroll→Year→Month subfolder
  }
  html = html.replace('</body>', driveToolbarScript(driveConfig) + '\n</body>')

  // ── SILENT MODE: hidden off-screen iframe — no popup, fully automatic ────────
  if (options.autoOnly) {
    const isPortrait = (options.orientation === 'portrait')
    const ifrW = isPortrait ? 794  : 1123
    const ifrH = isPortrait ? 1123 : 794
    const iframe = document.createElement('iframe')
    iframe.style.cssText = [
      'position:fixed', 'left:-9999px', 'top:0',
      `width:${ifrW}px`, `height:${ifrH}px`,
      'border:none',    'pointer-events:none',
      'z-index:-1',
    ].join(';')
    document.body.appendChild(iframe)

    const cleanup = () => { try { document.body.removeChild(iframe) } catch (_) {} }
    const cleanupTimer = setTimeout(cleanup, 90000)   // 90s hard-kill

    window.addEventListener('message', function onMsg(e) {
      if (e.data?.type === 'DRIVE_SAVED' && e.data?.mrId === (options.mrId || '')) {
        clearTimeout(cleanupTimer)
        window.removeEventListener('message', onMsg)
        // Write drive_url back to money_requests row
        if (e.data.driveUrl && options.mrId) {
          supabase.from('money_requests')
            .update({ drive_url: e.data.driveUrl })
            .eq('id', options.mrId)
            .then(() => {})
        }
        setTimeout(cleanup, 500)
      }
    })

    iframe.contentDocument.open()
    iframe.contentDocument.write(html)
    iframe.contentDocument.close()
    return
  }

  // ── MANUAL MODE: popup window (for Print button in detail drawer / library) ──
  // _preWin: pass a pre-opened window (opened synchronously before any await)
  const win = options._preWin || window.open('', '_blank', 'width=1200,height=860')
  if (!win) { alert('Pop-up blocked — please allow pop-ups for this site.'); return }
  win.document.open()
  win.document.write(html)
  win.document.close()
}

// ─── Shared page CSS ─────────────────────────────────────────────────────────
const PAGE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; background: #fff; font-size: 12px; color: #222; }
  .page {
    width: 794px; min-height: 1123px;
    margin: 0 auto; padding: 40px 50px 65px;
    position: relative; background: #fff;
  }
  .page-footer {
    position: absolute; bottom: 0; left: 0; right: 0;
    border-top: 1px solid #ddd; padding: 6px 50px;
    font-size: 9px; color: #888;
    display: flex; justify-content: space-between; align-items: center;
    background: #fff;
  }
  @media print {
    body { background: #fff; }
    .page { width: 100%; min-height: 297mm; padding: 15mm 20mm 20mm; }
    @page { size: A4; margin: 0; }
  }
`

// ─── Number to English Words (for Amount in Words) ───────────────────────────
function numToWordsEn(n) {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  function b1000(x) {
    if (x === 0) return ''
    if (x < 20)  return ones[x]
    if (x < 100) return tens[Math.floor(x/10)] + (x%10 ? '-'+ones[x%10] : '')
    return ones[Math.floor(x/100)] + ' Hundred' + (x%100 ? ' and ' + b1000(x%100) : '')
  }
  const int = Math.floor(Math.abs(n))
  const dec = Math.round((Math.abs(n) - int) * 100)
  let w = ''
  if (int >= 1000000) w += b1000(Math.floor(int/1000000)) + ' Million '
  if (int >= 1000)    w += b1000(Math.floor((int%1000000)/1000)) + ' Thousand '
  w += b1000(int % 1000)
  w = w.trim() + ' Saudi Riyals'
  if (dec > 0) w += ' and ' + b1000(dec) + ' Halalas'
  return (w + ' Only').trim()
}

// ─── Money Request builder — A4 LANDSCAPE ────────────────────────────────────
function buildMoneyRequest(d) {
  const lines  = d.lines || []
  const total  = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const fmtSAR = n => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const words  = numToWordsEn(total)

  // Format date as DD/MM/YYYY for display
  const [rYr, rMo, rDy] = (d.request_date || '').split('-')
  const dateDisplay = rDy && rMo && rYr ? `${rDy}/${rMo}/${rYr}` : (d.request_date || '—')

  // Project numbers from lines (unique, comma-separated) — falls back to header project_list
  const projectNos = (d.project_numbers && d.project_numbers.length > 0)
    ? d.project_numbers.join(', ')
    : (d.project_list || '')

  // QR — api.qrserver.com image (no CDN scripts, works in popup windows)
  const qrLines = [
    'RATAL Advanced Technologies',
    `Request#: ${d.request_number || '—'}`,
    `Date: ${dateDisplay}`,
    d.department        ? `Dept: ${d.department}`                : '',
    d.requested_by_name ? `Requested By: ${d.requested_by_name}` : '',
    projectNos          ? `Project(s): ${projectNos}`            : '',
    `Total: SAR ${fmtSAR(total)}`,
  ].filter(Boolean).join('\n')
  const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&ecc=M&color=1e3a5f&data=${encodeURIComponent(qrLines)}`

  // Line rows — 9 columns for landscape layout
  const lineRows = lines.length
    ? lines.map((l, i) => `
        <tr style="${i % 2 === 1 ? 'background:#f7f9fc;' : ''}">
          <td style="text-align:center;">${i + 1}</td>
          <td>${l.party_type || ''}</td>
          <td style="font-weight:600; color:#1a3a6b;">${l.project_number || '—'}</td>
          <td style="text-align:right; font-weight:700;">${fmtSAR(l.amount)}</td>
          <td>${l.expense_type || ''}</td>
          <td>${l.payment_type || ''}</td>
          <td style="font-weight:600;">${l.party_name || ''}</td>
          <td style="font-size:10px; color:#444; word-break:break-all;">${l.iban || '—'}</td>
          <td style="font-size:10px; color:#666;">${l.remarks || ''}</td>
        </tr>`).join('')
    : `<tr><td colspan="9" style="padding:14px; text-align:center; color:#aaa;">No line items</td></tr>`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Money Request — ${d.request_number || ''}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body { font-family:'Poppins',Arial,sans-serif; background:#fff; font-size:11px; color:#222; }

    /* ── Landscape A4 page ── */
    .page {
      width:1090px; min-height:750px; margin:0 auto;
      padding:30px 40px 55px; position:relative; background:#fff;
    }

    /* Header: single compact row — company name + doc type */
    .hdr { margin-bottom:6px; display:flex; align-items:baseline; gap:16px; }
    .co-name  { font-size:19px; font-weight:800; color:#1a3a6b; line-height:1.2; }
    .doc-type { font-size:16px; font-weight:700; color:#d81b87; }

    /* Divider */
    .divider { border:none; border-top:1.5px solid #ddd; margin:8px 0; }

    /* Meta: 3-column — To (left) | Date/Req#/Dept (center) | QR (right) */
    .meta {
      display:flex; justify-content:space-between; align-items:flex-start;
      margin-bottom:12px; gap:16px;
    }
    .meta > * { flex-shrink:0; }
    .meta-center { flex:1; display:flex; justify-content:flex-end; }

    /* QR — right column, compact size */
    .qr-wrap {
      width:110px; height:110px; border:1.5px solid #bbb;
      padding:5px; background:#fff;
    }
    .to-lbl  { font-size:11px; color:#666; margin-bottom:3px; }
    .to-name { font-size:13px; font-weight:800; color:#1a2540; }
    .to-sub  { font-size:11px; font-weight:600; color:#444; line-height:1.6; }
    .meta-tbl { border-collapse:collapse; font-size:12px; }
    .meta-tbl td { padding:2px 0; }
    .meta-tbl .ml { font-weight:700; color:#555; white-space:nowrap; padding-right:10px; }
    .meta-tbl .mv { font-weight:700; color:#1a3a6b; }

    /* Subject */
    .subj { font-size:12px; margin-bottom:8px; font-weight:500; }
    .subj .sv  { color:#d81b87; font-weight:700; }
    .subj .spv { color:#c62828; font-weight:800; }

    /* Details label */
    .det-lbl { font-size:10px; color:#777; margin-bottom:6px; }

    /* Items table — landscape 9 columns */
    .items-tbl {
      width:100%; border-collapse:collapse; font-size:10.5px;
      margin-bottom:14px; border:2.5px solid #222;
      table-layout:fixed;
    }
    .items-tbl colgroup col:nth-child(1) { width:30px; }
    .items-tbl colgroup col:nth-child(2) { width:70px; }
    .items-tbl colgroup col:nth-child(3) { width:108px; }
    .items-tbl colgroup col:nth-child(4) { width:100px; }
    .items-tbl colgroup col:nth-child(5) { width:148px; }
    .items-tbl colgroup col:nth-child(6) { width:88px; }
    .items-tbl colgroup col:nth-child(7) { width:128px; }
    .items-tbl colgroup col:nth-child(8) { width:178px; }
    .items-tbl colgroup col:nth-child(9) { width:auto; }

    .items-tbl thead tr { background:#1a1a1a; }
    .items-tbl thead th {
      padding:7px 6px; text-align:left; font-size:9.5px;
      font-weight:700; color:#fff; border:1px solid #444;
      white-space:nowrap; overflow:hidden;
    }
    .items-tbl thead th.r { text-align:right; }
    .items-tbl tbody td {
      border:1px solid #ccc; padding:5px 6px; vertical-align:top;
      overflow:hidden;
    }

    /* Total row */
    .items-tbl .tot td {
      background:#1a1a1a; color:#fff; font-weight:800;
      font-size:11px; border:1px solid #444; padding:7px 6px;
    }
    .items-tbl .tot .r { text-align:right; font-size:12px; }

    /* Words row */
    .items-tbl .words td {
      background:#f0f4f8; font-size:10.5px; font-weight:600;
      color:#1a2540; border:1px solid #ccc; padding:7px 8px;
    }

    /* Closing + signature */
    .closing { font-size:11px; color:#555; line-height:1.9; }
    .sig-name { font-size:12px; font-weight:800; color:#1a3a6b; }
    .sig-role { font-size:10px; font-weight:600; color:#1a3a6b; }

    /* Footer */
    .page-footer {
      position:absolute; bottom:0; left:0; right:0;
      border-top:1px solid #ddd; padding:5px 40px;
      font-size:8.5px; color:#999;
      display:flex; justify-content:space-between; align-items:center; background:#fff;
    }

    /* Print overrides */
    @media print {
      body { background:#fff; }
      .page { width:100%; min-height:210mm; padding:10mm 14mm 15mm; }
      @page { size:A4 landscape; margin:0; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header: compact single row -->
  <div class="hdr">
    <div class="co-name">RATAL Advanced Technologies</div>
    <div class="doc-type">Money Request</div>
  </div>
  <hr class="divider">

  <!-- Meta: 3-column — To (left) | Date/Req#/Dept (center) | QR (right) -->
  <div class="meta">
    <div>
      <div class="to-lbl">To</div>
      <div class="to-name">${d.recipient_name || 'The General Manager'}</div>
      <div class="to-sub">${d.recipient_title || 'General Manager'}</div>
      <div class="to-sub">${d.recipient_company || 'Ratal Advanced Technologies'}</div>
    </div>
    <div class="meta-center">
      <table class="meta-tbl">
        <tr><td class="ml">Date:</td>       <td class="mv">${dateDisplay}</td></tr>
        <tr><td class="ml">Request#:</td>   <td class="mv">${d.request_number || '—'}</td></tr>
        <tr><td class="ml">Department:</td> <td class="mv">${d.department || '—'}</td></tr>
      </table>
    </div>
    <img src="${qrImgSrc}" width="110" height="110" style="border:1.5px solid #bbb;border-radius:4px;padding:4px;background:#fff;flex-shrink:0;" alt="QR" />
  </div>

  <!-- Subject -->
  <div class="subj">
    <strong>Subject:</strong> Money Request${projectNos ? ` against Project# <span class="spv">${projectNos}</span>` : ''}
  </div>

  <!-- Details label -->
  <div class="det-lbl">Details of the money request are as follows:</div>

  <!-- Line items table — landscape 9 columns -->
  <table class="items-tbl">
    <colgroup><col><col><col><col><col><col><col><col><col></colgroup>
    <thead>
      <tr>
        <th>#</th>
        <th>Type</th>
        <th>Project #</th>
        <th class="r">Amount (SAR)</th>
        <th>Description</th>
        <th>Txn Type</th>
        <th>Receiver</th>
        <th>IBAN / SADAD</th>
        <th>Remarks</th>
      </tr>
    </thead>
    <tbody>
      ${lineRows}
      <tr class="tot">
        <td colspan="3" style="text-align:right; letter-spacing:.3px; padding-right:8px;">TOTAL AMOUNT (SAR)</td>
        <td class="r">${fmtSAR(total)}</td>
        <td colspan="5"></td>
      </tr>
      <tr class="words">
        <td colspan="9"><strong>Amount in Words:&nbsp;</strong>${words}</td>
      </tr>
    </tbody>
  </table>

  <!-- Closing + signature (all left-aligned, name below double-space gap) -->
  <div class="closing" style="margin-top:12px;">
    If you need any further details please do let me know, I will be pleased to furnish details.<br><br>
    Thanks and Regards
  </div>
  <!-- Double line space for signature gap -->
  <div style="height:36px;"></div>
  <div class="sig-name">${d.requested_by_name || ''}</div>
  <div class="sig-role">${d.requested_by_role || ''}</div>

  <!-- Footer -->
  <div class="page-footer">
    <span>Ratal Advanced Technologies — 4182 Aghadir Street, Malaz, Riyadh-12233, PO Box: 59215</span>
    <span>Request No: ${d.request_number || ''} &nbsp;|&nbsp; Page 1 of 1</span>
  </div>

</div>
</body>
</html>`
}

// ─── Drive Toolbar — injected into every print window ────────────────────────
// Renders a top bar (hidden during printing) with:
//   🖨️ Print   📤 Save to Drive
// Uses html2canvas + jsPDF from CDN to capture the .page div as PDF, then
// POSTs the base64 PDF to the Supabase drive-upload edge function.
function driveToolbarScript(cfg) {
  if (!cfg.folder || !cfg.supaUrl) {
    // No Drive config — just add the print button
    return `<script>
(function(){
  var tb = document.createElement('div');
  tb.id = 'drive-toolbar';
  tb.innerHTML = '<button onclick="window.print()" style="background:#1565c0;color:#fff;border:none;border-radius:7px;padding:9px 20px;font-size:13px;font-weight:700;cursor:pointer;font-family:Poppins,Arial,sans-serif;">🖨️ Print / Save as PDF</button>';
  Object.assign(tb.style, {position:'fixed',top:'12px',right:'16px',zIndex:9999,display:'flex',gap:8,background:'rgba(255,255,255,0.95)',padding:'8px 12px',borderRadius:10,boxShadow:'0 2px 12px rgba(0,0,0,0.18)'});
  document.body.appendChild(tb);
})();
<\/script>`
  }

  const autoRun    = cfg.autoRun    ? 'true' : 'false'
  const isIframe   = cfg.isIframe   ? 'true' : 'false'
  const orientation = cfg.orientation === 'portrait' ? 'portrait' : 'landscape'
  // A4 pixel dimensions at 96dpi: portrait=794×1123, landscape=1123×794
  const winW = orientation === 'portrait' ? 794  : 1123
  const winH = orientation === 'portrait' ? 1123 : 794

  return `
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
<style>
  @media print { #drive-toolbar { display:none !important; } }
  #drive-toolbar { position:fixed; top:12px; right:16px; z-index:9999; display:flex; gap:8px; align-items:center;
    background:rgba(255,255,255,0.97); padding:9px 14px; border-radius:10px;
    box-shadow:0 2px 14px rgba(0,0,0,0.2); font-family:Poppins,Arial,sans-serif; font-size:13px; }
</style>
<script>
(function(){
  var SUPA_URL    = ${JSON.stringify(cfg.supaUrl)};
  var SUPA_KEY    = ${JSON.stringify(cfg.supaKey)};
  var FOLDER      = ${JSON.stringify(cfg.folder)};
  var FILENAME    = ${JSON.stringify(cfg.fileName)};
  var MR_ID       = ${JSON.stringify(cfg.mrId)};
  var AUTO_RUN    = ${autoRun};
  var IS_IFRAME   = ${isIframe};   // true = silent iframe, no toolbar, no print
  var REQ_DATE    = ${JSON.stringify(cfg.requestDate || '')};
  var ORIENTATION = '${orientation}';   // 'portrait' | 'landscape'
  var WIN_W       = ${winW};
  var WIN_H       = ${winH};
  window.__PAYSLIP_MONTH__ = ${JSON.stringify(cfg.payslipMonth || '')};

  var FORM_FOLDER_MAP = {
    'money-requests':        '1xiRP0sNbniCrg_f4oRY8eZIqb3cqu7w0',
    'project-initiations':   '1M7XgCUgVW272j2il7GFS5ClHWhupSpqn',
    'vehicle-handovers':     '1F47facz8p23vgsrVVkpxiDsKzC2Y7GSB',
    'payment-notifications': '1IMNcXGOkaGukB-yYbcXbzjD9R17C0mDB',
    'po-sub-contractors':    '1spNyMqr-tsnf5gGaZV_6YAtBmic3QNPg',
    'po-vendors':            '1tSrFO0gdg_Zr1upqIw78Whj7hURjbh4G',
    'po-suppliers':          '1RCRM-O3_8Ey6rY7y5xCrps6E1ocjImHn',
    'po-local-suppliers':    '1pDe-Pie390xqMQ3tqDoVqqsygyfeGn68',
    'po-equipment-rentals':  '1PYJPSTkld4GtKCSb49IO1tm7ZdyBuLmv',
    'payslips':              '1tt6GLe7NNa7fLc1cZV3wifJibINvd9M1',   // Salary slips → Year → Month auto-created
    // ── Payroll reports — create these 4 folders inside your Payroll Drive folder ──
    'payroll-dept-reports':  '1rTUjgphAclpeRsd8-wDVWuocfGhjyR0u',   // Department_Reports
    'payroll-summary':       '1ZoRvqctWxDgJ-tTpblZFqEak3K7D8UXf',   // Overall_Summary
    'payroll-wps':           '1QU1KvkWcxW0SjdHp7nk0ccT6Y176wHLJ',   // WPS
    'payroll-mudad':         '13i5e3sB8HAiMmu15H6i2r-STV1ahgtMu',   // Mudad
    // ── Claim folders — IDs to be provided by user ──────────────────────────
    'expense-claims':        '1vgO3xYfCxdLs5cvMQnyW2OV7PnZDbZuh',  // Expense Claims
    'food-allowance-claims': '17WsXDTzOrKAWQyTUbxkSfPswTP8_ZocJ',  // Food Allowance Claims
    'overtime-reports':      '1yNvqRJLv2145zcdDfPCX30OtjYCD9Cpd',  // Overtime Reports
  };
  var year           = REQ_DATE.slice(0, 4) || String(new Date().getFullYear());
  var parentFolderId = FORM_FOLDER_MAP[FOLDER] || null;
  // For payslips: month name passed as PAYSLIP_MONTH_NAME (e.g. "September")
  var payslipMonth   = window.__PAYSLIP_MONTH__ || null;

  // ── Silent iframe mode: no toolbar, fire immediately, notify parent ──────────
  if (IS_IFRAME) {
    window.addEventListener('load', function() {
      setTimeout(function() { runDriveSave(null, null, false); }, 1800);
    });
    return;
  }

  // ── Popup mode: build visible toolbar ───────────────────────────────────────
  var tb = document.createElement('div');
  tb.id = 'drive-toolbar';
  var msg = document.createElement('span');
  Object.assign(msg.style, {fontWeight:600, color:'#1a2540'});

  if (!AUTO_RUN) {
    var btnPrint = document.createElement('button');
    btnPrint.textContent = '🖨️ Print';
    Object.assign(btnPrint.style, {background:'#1565c0',color:'#fff',border:'none',borderRadius:7,padding:'8px 18px',fontSize:13,fontWeight:700,cursor:'pointer'});
    btnPrint.onclick = function(){ window.print(); };

    var btnDrive = document.createElement('button');
    btnDrive.textContent = '📤 Save to Drive';
    Object.assign(btnDrive.style, {background:'#2e7d32',color:'#fff',border:'none',borderRadius:7,padding:'8px 18px',fontSize:13,fontWeight:700,cursor:'pointer'});
    btnDrive.onclick = function(){ runDriveSave(btnDrive, msg, false); };

    tb.appendChild(btnPrint);
    tb.appendChild(btnDrive);
    tb.appendChild(msg);
    document.body.appendChild(tb);
  } else {
    msg.textContent = '⏳ Preparing document…';
    tb.appendChild(msg);
    document.body.appendChild(tb);
    window.addEventListener('load', function() {
      setTimeout(function() { runDriveSave(null, msg, true); }, 1800);
    });
  }

  async function runDriveSave(btn, statusEl, autoPrint) {
    if (btn) btn.disabled = true;
    if (statusEl) statusEl.textContent = '⏳ Waiting for libraries…';

    var waited = 0;
    while ((!window.jspdf || !window.html2canvas) && waited < 12000) {
      await new Promise(r => setTimeout(r, 300));
      waited += 300;
    }
    if (!window.jspdf || !window.html2canvas) {
      if (statusEl) statusEl.textContent = '❌ PDF libraries failed to load';
      if (btn) btn.disabled = false;
      return;
    }

    try {
      var page = document.querySelector('.page');
      if (!page) { if (statusEl) statusEl.textContent = '❌ No .page element'; if(btn)btn.disabled=false; return; }

      if (statusEl) statusEl.textContent = '⏳ Capturing document…';
      if (tb) tb.style.display = 'none';

      var canvas = await window.html2canvas(page, {
        scale: 2, useCORS: true, allowTaint: false,
        backgroundColor: '#ffffff', logging: false,
        windowWidth: WIN_W, windowHeight: WIN_H,
      });

      if (tb) tb.style.display = 'flex';
      if (statusEl) statusEl.textContent = '⏳ Building PDF…';

      var { jsPDF } = window.jspdf;
      var pdf = new jsPDF({ orientation: ORIENTATION, unit:'mm', format:'a4' });
      var imgData = canvas.toDataURL('image/jpeg', 0.95);
      var pageW = pdf.internal.pageSize.getWidth();
      var pageH = pdf.internal.pageSize.getHeight();
      // Fit image maintaining aspect ratio (no stretch)
      var canvasAR = canvas.width / canvas.height;
      var pageAR   = pageW / pageH;
      var drawW, drawH;
      if (canvasAR > pageAR) { drawW = pageW; drawH = pageW / canvasAR; }
      else                   { drawH = pageH; drawW = pageH * canvasAR; }
      pdf.addImage(imgData, 'JPEG', 0, 0, drawW, drawH);
      var pdfBase64 = pdf.output('datauristring').split(',')[1];

      if (statusEl) statusEl.textContent = '⏳ Saving to Drive…';

      var res = await fetch(SUPA_URL + '/functions/v1/drive-upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + SUPA_KEY,
          'apikey': SUPA_KEY,
        },
        body: JSON.stringify({
          file: pdfBase64, fileName: FILENAME, mimeType: 'application/pdf',
          folder: FOLDER, parentFolderId: parentFolderId, year: year,
          month: payslipMonth || undefined,
        }),
      });
      var result = await res.json();

      if (result.success) {
        // Notify parent window (works for both popup opener and iframe parent)
        var target = (window.parent !== window) ? window.parent : (window.opener || null);
        if (target && MR_ID) {
          target.postMessage({ type:'DRIVE_SAVED', mrId: MR_ID, driveUrl: result.viewUrl }, '*');
        }

        if (IS_IFRAME) return;   // parent handles cleanup

        if (statusEl) statusEl.innerHTML = '✅ Saved to Drive · <a href="' + result.viewUrl + '" target="_blank" style="color:#1565c0;font-weight:700;">View ↗</a>';
        try { await navigator.clipboard.writeText(result.viewUrl); } catch(_){}
        if (autoPrint) {
          setTimeout(function() {
            if (statusEl) statusEl.textContent = '🖨️ Opening print dialog…';
            if (tb) tb.style.display = 'none';
            window.print();
            setTimeout(function() { window.close(); }, 800);
          }, 600);
        }
      } else {
        if (statusEl) statusEl.textContent = '❌ Drive error: ' + (result.error || 'Unknown');
        if (autoPrint && !IS_IFRAME) {
          setTimeout(function() { window.print(); setTimeout(function(){ window.close(); }, 800); }, 1000);
        }
      }
    } catch(err) {
      if (tb) tb.style.display = 'flex';
      if (statusEl) statusEl.textContent = '❌ ' + err.message;
      if (autoPrint && !IS_IFRAME) {
        setTimeout(function() { window.print(); setTimeout(function(){ window.close(); }, 800); }, 1000);
      }
    }
    if (btn) btn.disabled = false;
  }
})();
<\/script>`
}

// ─── Project Initiation Notice — A4 Portrait ─────────────────────────────────
function buildProjectInitiation(d) {
  const [rYr, rMo, rDy] = (d.generated_date || '').split('-')
  const dateDisplay = rDy && rMo && rYr ? `${rDy}/${rMo}/${rYr}` : (d.generated_date || '')
  const fmtSAR = n => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // QR — api.qrserver.com image (no CDN scripts, works in popup windows)
  const qrLines = [
    'RATAL Advanced Technologies',
    `Project#: ${d.project_number || '—'}`,
    d.project_name_en ? `Project: ${d.project_name_en}` : '',
    d.client_name_en  ? `Client: ${d.client_name_en}`   : '',
    d.department      ? `Dept: ${d.department}`          : '',
    d.project_type    ? `Type: ${d.project_type}`        : '',
    `Date: ${dateDisplay}`,
    d.contract_value  ? `Est. Value: SAR ${fmtSAR(d.contract_value)}` : '',
  ].filter(Boolean).join('\n')
  const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&ecc=M&color=1e3a5f&data=${encodeURIComponent(qrLines)}`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Project Initiation Notice — ${d.project_number || ''}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing:border-box; margin:0; padding:0; font-family:'Poppins',Arial,sans-serif; }
    body { background:#fff; font-size:11px; color:#222; }

    .page {
      width:794px; min-height:1123px; margin:0 auto;
      padding:32px 44px 72px; position:relative; background:#fff;
    }

    /* ── Header ── */
    .hdr-row { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; }
    .hdr-left { flex:1; }
    .co-name  { font-size:20px; font-weight:800; color:#1a3a6b; line-height:1.2; }
    .doc-type { font-size:12px; font-weight:700; color:#d81b87; margin-top:3px; letter-spacing:.6px; }
    .proj-no-hdr { font-size:15px; font-weight:800; color:#d81b87; margin-top:4px; }

    /* ── Divider ── */
    .divider { border:none; border-top:1.5px solid #ddd; margin:8px 0 10px; }

    /* ── Meta: To (left) | Date/Client/Dept (right) ── */
    .meta { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; gap:12px; }
    .to-lbl  { font-size:10px; color:#888; margin-bottom:3px; }
    .to-name { font-size:12px; font-weight:700; color:#1a2540; }
    .to-sub  { font-size:11px; color:#444; line-height:1.8; }
    .to-sub.bold { font-weight:700; }
    .meta-tbl { border-collapse:collapse; font-size:11px; }
    .meta-tbl td { padding:2px 0; }
    .meta-tbl .ml { font-weight:600; color:#666; white-space:nowrap; padding-right:10px; }
    .meta-tbl .mv { font-weight:700; color:#1a3a6b; }

    /* ── Body text ── */
    .body-text { font-size:11px; line-height:1.75; margin-bottom:14px; color:#333; }
    .body-text .hl { color:#d81b87; font-weight:700; }
    .body-text .hb { font-weight:700; color:#1a2540; }

    /* ── Project detail table ── */
    .proj-tbl { width:100%; border-collapse:collapse; font-size:10.5px; margin-bottom:16px; border:1.5px solid #000; }
    .proj-tbl thead tr { background:#000000 !important; }
    .proj-tbl thead th { padding:8px 10px; text-align:left; font-size:10px; font-weight:700; color:#ffffff !important; border:1px solid #333; white-space:nowrap; font-family:'Poppins',Arial,sans-serif; }
    .proj-tbl tbody td { border:1px solid #ccc; padding:7px 8px; vertical-align:top; font-weight:600; color:#1a2540; }
    .proj-tbl .est-row td { background:#f0f4f8; font-size:10.5px; font-weight:700; color:#1a2540; border:1px solid #ccc; padding:7px 10px; }
    .proj-tbl .est-row .amt { color:#d81b87; font-weight:800; }

    /* ── Numbered clauses ── */
    .clause-list { padding-left:20px; margin-bottom:14px; }
    .clause-list li { font-size:11px; line-height:1.75; color:#333; margin-bottom:7px; }
    .clause-list li .hl { color:#d81b87; font-weight:700; }
    .note { font-size:10px; color:#c62828; font-style:italic; margin-bottom:20px; line-height:1.6; }
    .note a { color:#1565c0; text-decoration:none; }

    /* ── Issued by ── */
    .issued     { font-size:10.5px; color:#666; font-style:italic; margin-bottom:4px; }
    .issued-co  { font-size:13px; font-weight:800; color:#1a3a6b; line-height:1.4; }
    .issued-role{ font-size:11px; font-weight:600; color:#d81b87; }

    /* ── Corner triangle decoration ── */
    .tri-outer {
      position:absolute; bottom:0; right:0; width:0; height:0;
      border-style:solid; border-width:0 0 88px 120px;
      border-color:transparent transparent #d81b87 transparent;
    }
    .tri-inner {
      position:absolute; bottom:0; right:0; width:0; height:0;
      border-style:solid; border-width:0 0 52px 72px;
      border-color:transparent transparent #1a3a6b transparent;
    }

    /* ── Footer ── */
    .page-footer {
      position:absolute; bottom:0; left:0; right:0;
      border-top:1px solid #ddd; padding:5px 44px;
      font-size:8.5px; color:#999;
      display:flex; justify-content:space-between; align-items:center; background:#fff;
    }

    @media print {
      body { background:#fff; }
      .page { width:100%; min-height:297mm; padding:12mm 16mm 18mm; }
      @page { size:A4 portrait; margin:0; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="hdr-row">
    <div class="hdr-left">
      <div class="co-name">RATAL Advanced Technologies</div>
      <div class="doc-type">PROJECT INITIATION NOTICE</div>
      <div class="proj-no-hdr">${d.project_number || ''}</div>
    </div>
    <img src="${qrImgSrc}" width="104" height="104" style="border:1.5px solid #bbb;border-radius:4px;padding:4px;background:#fff;flex-shrink:0;" alt="QR" />
  </div>
  <hr class="divider">

  <!-- Meta -->
  <div class="meta">
    <div>
      <div class="to-lbl">To</div>
      <div class="to-name">Mr. ${d.dept_head_en || d.pm_name || 'Department Head'}</div>
      <div class="to-sub">Department Head</div>
      <div class="to-sub bold">Ratal Advanced Technologies</div>
    </div>
    <table class="meta-tbl">
      <tr><td class="ml">Date:</td>       <td class="mv">${dateDisplay}</td></tr>
      <tr><td class="ml">Client:</td>     <td class="mv">${d.client_name_en || '—'}</td></tr>
      <tr><td class="ml">Department:</td> <td class="mv">${d.department || '—'}</td></tr>
    </table>
  </div>

  <!-- Body -->
  <div class="body-text">
    This is to confirm that RATAL Project No.&nbsp;<span class="hl">${d.project_number || ''}</span>&nbsp;has been
    created and assigned to&nbsp;<span class="hb">${d.project_name_en || ''}</span>,
    against the Client/Contractor reference stated below
  </div>

  <!-- Project table -->
  <table class="proj-tbl">
    <thead>
      <tr>
        <th>Project No</th>
        <th>Project Name</th>
        <th>Contractor</th>
        <th>Contractor PO#</th>
        <th>Project Type</th>
        <th>Contractor PM</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${d.project_number || '—'}</td>
        <td>${d.project_name_en || '—'}</td>
        <td>${d.client_name_en || '—'}</td>
        <td>${d.contractor_po || '—'}</td>
        <td>${d.project_type || '—'}</td>
        <td>${d.contractor_pm || '—'}</td>
      </tr>
      <tr class="est-row">
        <td colspan="6">
          <strong>Estimated PO Value:&nbsp;</strong>
          <span class="amt">SAR ${fmtSAR(d.contract_value)}</span>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- Clauses -->
  <ol class="clause-list">
    <li>The project is hereby registered in the RATAL project management system for execution, monitoring and financial control.</li>
    <li>All activities and transactions related to this project shall reference Project No.&nbsp;<span class="hl">${d.project_number || ''}</span>, including project documentation, procurement requests, material issuance, subcontractor activities, manpower deployment, timesheets, expenses, invoices and other project-related records.</li>
    <li>Any additional work, scope variation or expenditure outside the approved project parameters shall be properly documented and processed through the applicable approval procedure before commitment.</li>
  </ol>
  <div class="note">*Note : If any discrepancies found please report immediately to <a href="mailto:info@ratal.net">info@ratal.net</a></div>

  <!-- Issued by -->
  <div class="issued">Issued By:</div>
  <div class="issued-co">RATAL Advanced Technologies</div>
  <div class="issued-role">Project Management / Operations</div>

  <!-- Triangle decoration -->
  <div class="tri-outer"></div>
  <div class="tri-inner"></div>

  <!-- Footer -->
  <div class="page-footer">
    <span>Ratal Advanced Technologies — 4182 Aghadir Street, Malaz, Riyadh-12233, PO Box: 59215</span>
    <span>Project No: ${d.project_number || ''} &nbsp;|&nbsp; Page 1 of 1</span>
  </div>

</div>
</body>
</html>`
}

// ─── Payment Notification — A4 Landscape ─────────────────────────────────────
function buildPaymentNotification(d) {
  const [pYr, pMo, pDy] = (d.payment_date || '').split('-')
  const dateDisplay = pDy && pMo && pYr ? `${pDy}/${pMo}/${pYr}` : (d.payment_date || '')
  const fmtSAR   = n => parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })
  const total    = parseFloat(d.total_amount || 0)
  const words    = numToWordsEn(total)
  const lines    = d.lines || []
  const pmLabel  = d.payment_method === 'CHEQUE' ? 'Cheque' : d.payment_method === 'CASH' ? 'Cash' : 'Bank Transfer'
  // QR — api.qrserver.com image (no CDN scripts, works in popup windows)
  const qrLines = [
    'RATAL Advanced Technologies',
    `Payment Ref#: ${d.payment_reference || d.request_number || '—'}`,
    `Request#: ${d.request_number || '—'}`,
    `Date: ${dateDisplay}`,
    `Method: ${pmLabel}`,
    `Total: SAR ${fmtSAR(total)}`,
    d.initiated_by_name_en ? `Paid By: ${d.initiated_by_name_en}` : '',
  ].filter(Boolean).join('\n')
  const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&ecc=M&color=1e3a5f&data=${encodeURIComponent(qrLines)}`

  // Group lines by party type for display
  const groupOrder = ['Employee','Supplier','Subcontractor','ANB-77','ANB-39','Others']
  const grouped = {}
  lines.forEach(l => {
    const k = l.party_type || 'Others'
    if (!grouped[k]) grouped[k] = []
    grouped[k].push(l)
  })

  const rowsHtml = groupOrder.filter(k => grouped[k]).map(k => {
    const grp = grouped[k]
    const grpTotal = grp.reduce((s, l) => s + (parseFloat(l.amount)||0), 0)
    return `
      <tr>
        <td colspan="6" style="background:#000;color:#fff;font-weight:700;padding:6px 10px;font-size:10px;font-family:'Poppins',Arial,sans-serif;">
          ${k} &nbsp;—&nbsp; SAR ${fmtSAR(grpTotal)}
        </td>
      </tr>
      ${grp.map((l, i) => `
        <tr style="${i % 2 === 1 ? 'background:#f7f9fc;' : ''}">
          <td style="padding:6px 8px; font-weight:700; color:#1a2540;">${l.supplier_name || l.party_name || '—'}</td>
          <td style="padding:6px 8px; font-size:9.5px; font-family:monospace; color:#334155;">${l.iban || '—'}</td>
          <td style="padding:6px 8px; color:#555;">${(l.account_code || l.expense_type || '').replace(/_/g,' ')}</td>
          <td style="padding:6px 8px; text-align:center; color:#555;">${pmLabel}</td>
          <td style="padding:6px 8px; text-align:right; font-weight:800; color:#1a3a6b;">SAR ${fmtSAR(parseFloat(l.amount)||0)}</td>
          <td style="padding:6px 8px; font-size:9.5px; color:#2e7d32; font-weight:600;">${l.trn || l.bank_ref || '—'}</td>
        </tr>
      `).join('')}`
  }).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Payment Notification — ${d.request_number || ''}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing:border-box; margin:0; padding:0; font-family:'Poppins',Arial,sans-serif; }
    body { background:#fff; font-size:11px; color:#222; }

    .page {
      width:1123px; min-height:794px; margin:0 auto;
      padding:30px 44px 60px; position:relative; background:#fff;
    }

    /* ── Header ── */
    .hdr-row { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; }
    .hdr-left { flex:1; }
    .co-name  { font-size:20px; font-weight:800; color:#1a3a6b; line-height:1.2; }
    .doc-type { font-size:13px; font-weight:700; color:#d81b87; margin-top:3px; letter-spacing:.6px; }
    .divider  { border:none; border-top:1.5px solid #ddd; margin:8px 0 10px; }

    /* ── Meta ── */
    .meta { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; gap:12px; }
    .to-lbl  { font-size:10px; color:#888; margin-bottom:2px; }
    .to-name { font-size:12px; font-weight:700; color:#1a2540; }
    .to-sub  { font-size:11px; color:#444; line-height:1.8; }
    .meta-tbl { border-collapse:collapse; font-size:11px; }
    .meta-tbl td { padding:2px 0; }
    .meta-tbl .ml { font-weight:600; color:#666; white-space:nowrap; padding-right:10px; }
    .meta-tbl .mv { font-weight:700; color:#1a3a6b; }

    /* ── Subject ── */
    .subj { font-size:11.5px; color:#333; margin-bottom:4px; }
    .subj strong { color:#d81b87; }
    .body-lbl { font-size:11px; color:#555; margin-bottom:10px; }

    /* ── Payment table ── */
    .pay-tbl { width:100%; border-collapse:collapse; font-size:10.5px; margin-bottom:6px; border:1.5px solid #000; }
    .pay-tbl thead tr { background:#000000 !important; }
    .pay-tbl thead th { padding:8px 8px; text-align:left; font-size:10px; font-weight:700; color:#ffffff !important;
      border:1px solid #333; white-space:nowrap; font-family:'Poppins',Arial,sans-serif; }
    .pay-tbl tbody td { border:1px solid #ddd; vertical-align:top; font-size:10.5px; }
    .pay-tbl .total-row td { background:#f0f4f8; font-weight:800; font-size:11px; padding:7px 8px;
      border:1px solid #ccc; color:#1a2540; }
    .pay-tbl .total-row .amt { color:#d81b87; font-weight:900; font-size:12px; }

    /* ── Words ── */
    .words-row { font-size:10.5px; color:#333; margin-bottom:14px; }
    .words-row span { font-weight:700; color:#1a2540; }

    /* ── Note / Footer ── */
    .note  { font-size:10px; color:#c62828; font-style:italic; margin-bottom:10px; }
    .thanks{ font-size:11px; color:#333; margin-bottom:6px; }
    .paid-by { font-size:11.5px; font-weight:700; color:#1a3a6b; }

    /* ── Corner triangle decoration ── */
    .tri-outer { position:absolute; bottom:0; right:0; width:0; height:0;
      border-style:solid; border-width:0 0 70px 95px; border-color:transparent transparent #d81b87 transparent; }
    .tri-inner { position:absolute; bottom:0; right:0; width:0; height:0;
      border-style:solid; border-width:0 0 40px 56px; border-color:transparent transparent #1a3a6b transparent; }

    /* ── Footer ── */
    .page-footer {
      position:absolute; bottom:0; left:0; right:0;
      border-top:1px solid #ddd; padding:4px 44px;
      font-size:8px; color:#999;
      display:flex; justify-content:space-between; align-items:center; background:#fff;
    }

    @media print {
      body { background:#fff; }
      .page { width:100%; min-height:210mm; padding:10mm 14mm 16mm; }
      @page { size:A4 landscape; margin:0; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="hdr-row">
    <div class="hdr-left">
      <div class="co-name">RATAL Advanced Technologies</div>
      <div class="doc-type">PAYMENT NOTIFICATION</div>
    </div>
    <img src="${qrImgSrc}" width="90" height="90" style="border:1.5px solid #bbb;border-radius:4px;padding:4px;background:#fff;flex-shrink:0;" alt="QR" />
  </div>
  <hr class="divider">

  <!-- Meta -->
  <div class="meta">
    <div>
      <div class="to-lbl">To</div>
      <div class="to-name">${d.dept_head_en || 'Department Head'}</div>
      <div class="to-sub">Department Head</div>
      <div class="to-sub" style="font-weight:700;">Department ${d.requested_by_dept_en || '—'}</div>
    </div>
    <table class="meta-tbl">
      <tr><td class="ml">Date:</td>    <td class="mv">${dateDisplay}</td></tr>
      <tr><td class="ml">Request#:</td><td class="mv">${d.request_number || '—'}</td></tr>
      <tr><td class="ml">Ref#:</td>    <td class="mv">${d.payment_reference || '—'}</td></tr>
    </table>
  </div>

  <!-- Subject -->
  <div class="subj">Subject: Payment Against your Request# <strong>${d.request_number || '—'}</strong></div>
  <div class="body-lbl">Details are as follow</div>

  <!-- Payment Table -->
  <table class="pay-tbl">
    <thead>
      <tr>
        <th style="width:20%;">Beneficiary</th>
        <th style="width:22%;">IBAN / Account</th>
        <th style="width:18%;">Expense Type</th>
        <th style="width:11%;">Method</th>
        <th style="width:14%; text-align:right;">Amount (SAR)</th>
        <th style="width:15%;">Bank TRN #</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="total-row">
        <td colspan="4">TOTAL AMOUNT PAID</td>
        <td style="text-align:right;" class="amt">SAR ${fmtSAR(total)}</td>
        <td>${d.from_account || ''}</td>
      </tr>
    </tbody>
  </table>

  <!-- Amount in Words -->
  <div class="words-row">Amount in Words: <span>${words}</span></div>

  <!-- Note & sign-off -->
  <div class="note">*Note : If you need any further details please do not hesitate to contact the Finance team at <a href="mailto:info@ratal.net" style="color:#1565c0;">info@ratal.net</a></div>
  <div class="thanks">Thanks and Regards</div>
  <div class="paid-by">Paid By: ${d.initiated_by_name_en || ''}</div>

  <!-- Triangle decoration -->
  <div class="tri-outer"></div>
  <div class="tri-inner"></div>

  <!-- Footer -->
  <div class="page-footer">
    <span>Ratal Advanced Technologies — 4182 Aghadir Street, Malaz, Riyadh-12233, PO Box: 59215</span>
    <span>Request: ${d.request_number || ''} &nbsp;|&nbsp; Page 1 of 1</span>
  </div>

</div>
</body>
</html>`
}

// ─── Vehicle Handover & Custody Agreement — A4 Portrait ──────────────────────
function buildVehicleHandover(d) {
  const [rYr, rMo, rDy] = (d.generated_date || '').split('-')
  const dateDisplay = rDy && rMo && rYr ? `${rDy}/${rMo}/${rYr}` : (d.generated_date || '')
  // QR — api.qrserver.com image (no CDN scripts, works in popup windows)
  const vehicle = [d.vehicle_make, d.vehicle_model].filter(Boolean).join(' ')
  const qrLines = [
    'RATAL Advanced Technologies',
    `Ref#: ${d.reference_number || '—'}`,
    `Plate: ${d.vehicle_plate || '—'}`,
    vehicle ? `Vehicle: ${vehicle}` : '',
    d.vehicle_assigned_to_en ? `Assigned To: ${d.vehicle_assigned_to_en}` : '',
    d.vehicle_assigned_dept  ? `Dept: ${d.vehicle_assigned_dept}`         : '',
    `Date: ${dateDisplay}`,
    d.handover_by_name_en ? `Handed Over By: ${d.handover_by_name_en}` : '',
  ].filter(Boolean).join('\n')
  const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&ecc=M&color=1e3a5f&data=${encodeURIComponent(qrLines)}`
  const fmtDate = s => {
    if (!s) return '—'
    const [y, m, dd] = s.split('-')
    return dd && m && y ? `${dd}/${m}/${y}` : s
  }
  const odo = d.vehicle_odometer ? `${Number(d.vehicle_odometer).toLocaleString()} km` : '—'

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Vehicle Handover — ${d.vehicle_plate || ''}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing:border-box; margin:0; padding:0; font-family:'Poppins',Arial,sans-serif; }
    body { background:#fff; font-size:11px; color:#222; }

    .page {
      width:794px; min-height:1123px; margin:0 auto;
      padding:32px 44px 72px; position:relative; background:#fff;
    }

    /* ── Header ── */
    .hdr-row { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px; }
    .hdr-left { flex:1; }
    .co-name  { font-size:20px; font-weight:800; color:#1a3a6b; line-height:1.2; }
    .doc-type { font-size:12px; font-weight:700; color:#d81b87; margin-top:3px; letter-spacing:.6px; }
    .plate-hdr{ font-size:15px; font-weight:800; color:#d81b87; margin-top:4px; }
    .divider  { border:none; border-top:1.5px solid #ddd; margin:8px 0 10px; }

    /* ── Meta ── */
    .meta { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; gap:12px; }
    .to-lbl  { font-size:10px; color:#888; margin-bottom:2px; }
    .to-name { font-size:12px; font-weight:700; color:#1a2540; }
    .to-sub  { font-size:11px; color:#444; line-height:1.85; }
    .to-sub.red { font-weight:700; color:#d81b87; }
    .meta-tbl { border-collapse:collapse; font-size:11px; }
    .meta-tbl td { padding:2px 0; }
    .meta-tbl .ml { font-weight:600; color:#666; white-space:nowrap; padding-right:10px; }
    .meta-tbl .mv { font-weight:700; color:#1a3a6b; }

    /* ── Body text ── */
    .body-text { font-size:11px; line-height:1.75; margin-bottom:14px; color:#333; }
    .body-text .hb { font-weight:700; color:#1a2540; }

    /* ── Vehicle details table ── */
    .veh-tbl { width:100%; border-collapse:collapse; font-size:10.5px; margin-bottom:4px; border:1.5px solid #000; }
    .veh-tbl thead tr { background:#000000 !important; }
    .veh-tbl thead th { padding:8px 10px; text-align:left; font-size:10px; font-weight:700; color:#ffffff !important;
      border:1px solid #333; white-space:nowrap; font-family:'Poppins',Arial,sans-serif; }
    .veh-tbl tbody td { border:1px solid #ccc; padding:7px 8px; vertical-align:top; font-weight:600; color:#1a2540; }
    .veh-tbl .odo-row td { background:#f5f5f5; font-size:11px; font-weight:700; border:1px solid #ccc;
      padding:7px 10px; color:#1a2540; }
    .veh-tbl .odo-row .odo-val { color:#d81b87; font-weight:800; }

    /* ── Clauses ── */
    .clause-list { padding-left:20px; margin-bottom:14px; }
    .clause-list li { font-size:11px; line-height:1.75; color:#333; margin-bottom:7px; }
    .clause-list li strong { color:#1a2540; }

    /* ── Signatures ── */
    .sig-row { display:flex; gap:32px; margin-top:22px; }
    .sig-box { flex:1; }
    .sig-title { font-size:12px; font-weight:800; color:#1a3a6b; margin-bottom:10px; }
    .sig-title.right { color:#d81b87; }
    .sig-line { display:flex; align-items:baseline; gap:6px; margin-bottom:7px; font-size:11px; }
    .sig-line .lbl { color:#666; font-weight:600; white-space:nowrap; min-width:70px; }
    .sig-line .val { font-weight:700; color:#1a2540; }
    .sig-line .line { flex:1; border-bottom:1px dashed #999; min-width:100px; height:14px; }

    /* ── Note ── */
    .note { font-size:10px; color:#c62828; font-style:italic; margin-bottom:22px; line-height:1.6; }

    /* ── Corner triangle ── */
    .tri-outer { position:absolute; bottom:0; right:0; width:0; height:0;
      border-style:solid; border-width:0 0 88px 120px; border-color:transparent transparent #d81b87 transparent; }
    .tri-inner { position:absolute; bottom:0; right:0; width:0; height:0;
      border-style:solid; border-width:0 0 52px 72px; border-color:transparent transparent #1a3a6b transparent; }

    /* ── Footer ── */
    .page-footer {
      position:absolute; bottom:0; left:0; right:0;
      border-top:1px solid #ddd; padding:5px 44px;
      font-size:8.5px; color:#999;
      display:flex; justify-content:space-between; align-items:center; background:#fff;
    }

    @media print {
      body { background:#fff; }
      .page { width:100%; min-height:297mm; padding:12mm 16mm 18mm; }
      @page { size:A4 portrait; margin:0; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="hdr-row">
    <div class="hdr-left">
      <div class="co-name">RATAL Advanced Technologies</div>
      <div class="doc-type">VEHICLE HANDOVER &amp; CUSTODY AGREEMENT</div>
      <div class="plate-hdr">${d.vehicle_plate || ''}</div>
    </div>
    <img src="${qrImgSrc}" width="104" height="104" style="border:1.5px solid #bbb;border-radius:4px;padding:4px;background:#fff;flex-shrink:0;" alt="QR" />
  </div>
  <hr class="divider">

  <!-- Meta -->
  <div class="meta">
    <div>
      <div class="to-lbl">To</div>
      <div class="to-name">Mr. ${d.vehicle_assigned_to_en || '—'}</div>
      <div class="to-sub">Licence No. <span class="red">${d.vehicle_driver_license || '—'}</span></div>
      <div class="to-sub">Mobile# ${d.vehicle_assigned_phone || '—'}</div>
    </div>
    <table class="meta-tbl">
      <tr><td class="ml">Date:</td>       <td class="mv">${dateDisplay}</td></tr>
      <tr><td class="ml">Ref#:</td>       <td class="mv">${d.reference_number || '—'}</td></tr>
      <tr><td class="ml">Department:</td> <td class="mv">${d.vehicle_assigned_dept || '—'}</td></tr>
    </table>
  </div>

  <!-- Body -->
  <div class="body-text">
    This letter serves as formal confirmation that <span class="hb">RATAL Advanced Technologies</span> has assigned
    a company vehicle to you for Performing Official Duties and other authorized company activities.
  </div>
  <div class="body-text" style="margin-bottom:10px;">The vehicle details are as follows:</div>

  <!-- Vehicle table -->
  <table class="veh-tbl">
    <thead>
      <tr>
        <th>Plate No</th>
        <th>Make</th>
        <th>Model</th>
        <th>Chassis#</th>
        <th>Reg. Expiry</th>
        <th>Insurance Expiry</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${d.vehicle_plate || '—'}</td>
        <td>${d.vehicle_make  || '—'}</td>
        <td>${d.vehicle_model || '—'}</td>
        <td>${d.vehicle_vin   || '—'}</td>
        <td>${fmtDate(d.vehicle_reg_expiry)}</td>
        <td>${fmtDate(d.vehicle_insurance_expiry)}</td>
      </tr>
      <tr class="odo-row">
        <td colspan="6"><strong>Odometer :</strong>&nbsp;<span class="odo-val">${odo}</span></td>
      </tr>
    </tbody>
  </table>

  <!-- Clauses -->
  <ol class="clause-list" style="margin-top:14px;">
    <li>Use the vehicle primarily for authorized company/business purposes and in accordance with company policy. Maintain the vehicle in a clean condition, exercise reasonable care at all times. Regularly monitor engine oil, coolant, tyre pressure, warning indicators and other routine operating conditions.</li>
    <li><strong>Traffic Violations:</strong> The employee shall be responsible for traffic violations, penalties or fines arising from his/her driving or conduct while the vehicle is under his/her use, subject to applicable company policy.</li>
    <li><strong>Accident &amp; Damage Reporting:</strong> In case of an accident, the employee must contact the appropriate authorities/Najm where applicable → inform RATAL immediately → obtain the accident report → take photographs → not admit liability on behalf of the company → submit all required documentation promptly.</li>
  </ol>

  <div class="note">*Note : If any discrepancies found please report immediately to <a href="mailto:info@ratal.net" style="color:#1565c0;">info@ratal.net</a></div>

  <!-- Signatures -->
  <div class="sig-row">
    <div class="sig-box">
      <div class="sig-title">Vehicle Received By</div>
      <div class="sig-line"><span class="lbl">Employee:</span> <span class="val">${d.vehicle_assigned_to_en || ''}</span></div>
      <div class="sig-line"><span class="lbl">Signature:</span> <span class="line"></span></div>
      <div class="sig-line"><span class="lbl">Date:</span>      <span class="line"></span></div>
      <div class="sig-line"><span class="lbl">Time:</span>      <span class="line"></span></div>
    </div>
    <div class="sig-box">
      <div class="sig-title right">Vehicle Handed Over By</div>
      <div class="sig-line"><span class="lbl">Name:</span>      <span class="val">${d.handover_by_name_en || ''}</span></div>
      <div class="sig-line"><span class="lbl">Signature:</span> <span class="line"></span></div>
      <div class="sig-line"><span class="lbl">Date:</span>      <span class="line"></span></div>
      <div class="sig-line"><span class="lbl">Time:</span>      <span class="line"></span></div>
    </div>
  </div>

  <!-- Triangle decoration -->
  <div class="tri-outer"></div>
  <div class="tri-inner"></div>

  <!-- Footer -->
  <div class="page-footer">
    <span>Ratal Advanced Technologies — 4182 Aghadir Street, Malaz, Riyadh-12233, PO Box: 59215</span>
    <span>Ref: ${d.reference_number || ''} &nbsp;|&nbsp; Page 1 of 1</span>
  </div>

</div>
</body>
</html>`
}

// ─── Outgoing Purchase Order — A4 Portrait ───────────────────────────────────
function buildOutgoingPO(d) {
  const [pYr, pMo, pDy] = (d.po_date || '').split('-')
  const dateDisplay = pDy && pMo && pYr ? `${pDy}/${pMo}/${pYr}` : (d.po_date || '')
  const lines   = Array.isArray(d.lines) ? d.lines : []
  const lineTotal = l => parseFloat(l.line_total) || parseFloat(l.total) || (parseFloat(l.qty)||0)*(parseFloat(l.unit_price)||0)
  const subtotal = lines.reduce((s,l) => s + lineTotal(l), 0)
  // No VAT on PO — VAT is over & above, applied at invoice time if applicable
  const fmt = n => (parseFloat(n)||0).toLocaleString('en-SA', { minimumFractionDigits:2, maximumFractionDigits:2 })

  // Rich QR content — embedded as image URL (no CDN script needed)
  const qrLines = [
    `RATAL Advanced Technologies`,
    `PO#: ${d.po_number || '—'}`,
    `Vendor: ${d.vendor_name_en || '—'}`,
    d.site_number    ? `Site: ${d.site_number}`       : '',
    d.project_number ? `Project: ${d.project_number}` : '',
    `---`,
    ...lines.map((l, i) => `${i+1}. ${l.job_type ? l.job_type+' | ' : ''}${l.description}: SAR ${fmt(lineTotal(l))}`),
    `---`,
    `Total (excl. VAT): SAR ${fmt(subtotal)}`,
  ].filter(Boolean).join('\n')
  const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&ecc=M&color=1e3a5f&data=${encodeURIComponent(qrLines)}`

  // Line item rows
  const lineRows = lines.map((l, i) => `
    <tr class="${i % 2 === 0 ? '' : 'alt'}">
      <td>${i + 1}</td>
      <td class="desc">${l.job_type ? `<span class="jt">${l.job_type}</span> ` : ''}${l.description || ''}</td>
      <td class="num">${(parseFloat(l.qty)||0).toLocaleString('en-SA', { minimumFractionDigits:0, maximumFractionDigits:2 })}</td>
      <td class="num">${fmt(l.unit_price)}</td>
      <td class="num total-col">SAR ${fmt(lineTotal(l))}</td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap');
  @page { size:A4 portrait; margin:0; }
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Poppins',sans-serif; font-size:10px; color:#1a2e3d; background:#fff; width:794px; min-height:1123px; }

  /* ── Corner triangles ── */
  .corner-tl { position:absolute; top:0; left:0; width:0; height:0;
    border-top:90px solid #1e3a5f; border-right:90px solid transparent; }
  .corner-br { position:absolute; bottom:0; right:0; width:0; height:0;
    border-bottom:90px solid #1e3a5f; border-left:90px solid transparent; }

  /* ── Page wrapper ── */
  .page { position:relative; width:794px; min-height:1123px; padding:0; overflow:hidden; }

  /* ── Header band ── */
  .header { display:flex; justify-content:space-between; align-items:flex-start;
    padding:22px 110px 18px 110px; background:#fff; border-bottom:3px solid #1e3a5f; }
  .co-block { display:flex; flex-direction:column; gap:2px; }
  .co-name { font-size:17px; font-weight:900; color:#1e3a5f; letter-spacing:-0.3px; }
  .po-badge { font-size:22px; font-weight:900; color:#d91a60; letter-spacing:1px; margin-top:2px; }
  .co-sub   { font-size:9px; color:#64748b; }
  /* QR pinned to top-right corner */
  .qr-block { position:absolute; top:10px; right:10px; text-align:center; z-index:10;
    background:#fff; border-radius:6px; padding:4px; border:1px solid #e2e8f0; }
  .qr-block canvas, .qr-block img { width:110px; height:110px; display:block; }

  /* ── Meta table ── */
  .meta-section { padding:14px 36px; display:flex; gap:20px; }
  .meta-left  { flex:1; max-width:310px; }
  .meta-right { flex:1; min-width:260px; }
  .meta-box { border:1.5px solid #e2e8f0; border-radius:8px; overflow:hidden; margin-bottom:12px; }
  .meta-box-head { background:#1e3a5f; color:#fff; font-size:9px; font-weight:700;
    text-transform:uppercase; letter-spacing:0.8px; padding:6px 10px; }
  .meta-body { padding:8px 10px; font-size:10px; line-height:1.7; }
  .meta-body b { color:#1e3a5f; }
  .meta-grid { display:grid; grid-template-columns:auto 1fr; gap:2px 10px; font-size:9.5px; }
  .meta-grid .k { color:#64748b; font-weight:600; white-space:nowrap; }
  .meta-grid .v { font-weight:700; color:#1a2e3d; }

  /* ── Line items table ── */
  .table-wrap { padding:0 36px 10px; }
  table { width:100%; border-collapse:collapse; }
  thead tr { background:#1e3a5f; }
  thead th { color:#fff; font-size:9px; font-weight:700; text-transform:uppercase;
    letter-spacing:0.5px; padding:8px 10px; text-align:left; border:none; }
  thead th.num { text-align:right; }
  tbody tr { border-bottom:1px solid #eef2f7; }
  tbody tr.alt { background:#f8faff; }
  tbody td { padding:7px 10px; font-size:9.5px; vertical-align:top; }
  td.num { text-align:right; }
  td.desc { max-width:280px; }
  td.total-col { font-weight:700; color:#1e3a5f; }
  .jt { background:#e8f0fe; color:#1d4ed8; font-size:8.5px; font-weight:700;
    padding:1px 5px; border-radius:4px; margin-right:4px; white-space:nowrap; }

  /* ── Totals ── */
  .totals { padding:0 36px 14px; display:flex; justify-content:flex-end; }
  .totals-box { width:260px; border:1.5px solid #e2e8f0; border-radius:8px; overflow:hidden; }
  .totals-row { display:flex; justify-content:space-between; padding:6px 12px; font-size:10px; border-bottom:1px solid #f0f4f8; }
  .totals-row.total-final { background:#1e3a5f; color:#fff; font-weight:800; font-size:12px; border-bottom:none; }
  .totals-label { color:#64748b; font-weight:600; }
  .totals-val   { font-weight:700; }
  .totals-row.total-final .totals-label, .totals-row.total-final .totals-val { color:#fff; }

  /* ── Notes + Signature ── */
  .bottom-section { padding:0 36px 16px; display:flex; gap:16px; }
  .notes-box { flex:1; border:1.5px solid #e2e8f0; border-radius:8px; padding:8px 12px; }
  .notes-head { font-size:9px; font-weight:700; color:#1e3a5f; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px; }
  .notes-body { font-size:9.5px; color:#374151; line-height:1.6; }
  .sig-wrap  { display:flex; flex-direction:column; align-items:center; padding-top:10px; }
  .sig-space { height:48px; width:200px; }   /* blank area for handwritten signature */
  .sig-box   { width:200px; border-top:2px solid #1e3a5f; padding-top:6px; text-align:center; }
  .sig-label { font-size:9px; color:#64748b; font-weight:600; }
  .sig-name  { font-size:10px; font-weight:800; color:#1e3a5f; margin-top:3px; margin-bottom:2px; }
  .sig-title { font-size:8.5px; color:#94a3b8; font-weight:600; }

  /* ── Footer ── */
  .footer { position:absolute; bottom:26px; left:36px; right:36px;
    display:flex; justify-content:space-between; align-items:center;
    border-top:1.5px solid #e2e8f0; padding-top:8px; }
  .footer-l, .footer-r { font-size:8.5px; color:#94a3b8; }
  .footer-center { font-size:8px; color:#cbd5e1; text-align:center; flex:1; }
</style>
</head><body>
<div class="page">
  <div class="corner-tl"></div>
  <div class="corner-br"></div>

  <!-- QR Code — top right corner -->
  <div class="qr-block">
    <img src="${qrImgSrc}" width="110" height="110" alt="QR" style="display:block;border-radius:4px;" />
    <div style="font-size:7px;color:#64748b;margin-top:2px;font-weight:600;">SCAN TO VERIFY</div>
  </div>

  <!-- Header -->
  <div class="header">
    <div class="co-block">
      <div class="co-name">RATAL Advanced Technologies</div>
      <div class="po-badge">PURCHASE ORDER</div>
      <div class="co-sub">PO Box# {{company_po_box}} · VAT# 310680651700003</div>
      <div class="co-sub">www.ratal.net · info@ratal.net</div>
    </div>
  </div>

  <!-- Meta -->
  <div class="meta-section">
    <div class="meta-left">
      <div class="meta-box">
        <div class="meta-box-head">Vendor / Supplier</div>
        <div class="meta-body">
          <b>${d.vendor_name_en || '—'}</b><br>
          ${d.vendor_type ? `<span style="font-size:9px;color:#6366f1;">${d.vendor_type}</span><br>` : ''}
          ${d.vendor_address ? `${d.vendor_address}<br>` : ''}
          ${d.vendor_code ? `<span style="color:#94a3b8;font-size:9px;">Code: ${d.vendor_code}</span>` : ''}
        </div>
      </div>
      <div class="meta-box">
        <div class="meta-box-head">Ship To</div>
        <div class="meta-body">
          ${d.requested_by_name ? `<span style="font-size:9px;color:#64748b;font-weight:600;">Attn: <b style="color:#1e3a5f;">${d.requested_by_name}</b></span><br>` : ''}
          <b>${d.ship_to_dept || 'RATAL Advanced Technologies'}</b><br>
          RATAL Advanced Technologies<br>
          Kingdom of Saudi Arabia
        </div>
      </div>
    </div>
    <div class="meta-right">
      <div class="meta-box">
        <div class="meta-box-head">PO Details</div>
        <div class="meta-body">
          <div class="meta-grid">
            <span class="k">DATE</span><span class="v">${dateDisplay}</span>
            <span class="k">PO #</span><span class="v" style="color:#d91a60;font-size:11px;">${d.po_number || '—'}</span>
            <span class="k">CATEGORY</span><span class="v">${d.category || '—'}</span>
            <span class="k">PAYMENT</span><span class="v">${d.payment_terms || '—'}</span>
            ${d.project_number ? `<span class="k">PROJECT</span><span class="v">${d.project_number}</span>` : ''}
            ${d.site_number ? `<span class="k">SITE</span><span class="v">${d.site_number}</span>` : ''}
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Line Items Table -->
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th style="width:28px;">#</th>
          <th>Item Description</th>
          <th class="num" style="width:60px;">Qty</th>
          <th class="num" style="width:100px;">Unit Price</th>
          <th class="num" style="width:110px;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows || '<tr><td colspan="5" style="text-align:center;padding:20px;color:#94a3b8;">No items</td></tr>'}
      </tbody>
    </table>
  </div>

  <!-- Totals -->
  <div class="totals">
    <div class="totals-box">
      <div class="totals-row total-final">
        <span class="totals-label">TOTAL (Excl. VAT)</span>
        <span class="totals-val">SAR ${fmt(subtotal)}</span>
      </div>
      <div class="totals-row" style="background:#f8faff;">
        <span class="totals-label" style="color:#64748b;font-size:8.5px;font-style:italic;">VAT if applicable is over &amp; above this amount</span>
        <span class="totals-val" style="color:#94a3b8;font-size:8.5px;"></span>
      </div>
    </div>
  </div>

  <!-- Notes + Signature -->
  <div class="bottom-section">
    ${d.notes ? `
    <div class="notes-box">
      <div class="notes-head">Notes / Terms &amp; Conditions</div>
      <div class="notes-body">${d.notes}</div>
    </div>` : '<div style="flex:1;"></div>'}
    <div class="sig-wrap">
      <div class="sig-space"></div>
      <div class="sig-box">
        <div class="sig-label">Authorized By</div>
        <div class="sig-name">${d.dept_head_name || 'Department Head'}</div>
        <div class="sig-title">Department Head</div>
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-l">RATAL Advanced Technologies · VAT# 310680651700003</div>
    <div class="footer-center">If you have any questions about this PO, please contact info@ratal.net</div>
    <div class="footer-r">${d.po_number || ''}</div>
  </div>
</div>

</body></html>`
}

// ─── Salary Slip (Payslip) — A4 Portrait ─────────────────────────────────────
function buildPayslip(d) {
  const fmt = n => (parseFloat(n)||0).toLocaleString('en-SA', { minimumFractionDigits:2, maximumFractionDigits:2 })

  const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December']
  function monthLabel(ym) {
    if (!ym) return ''
    const [y, m] = ym.split('-')
    return `${MONTHS_EN[+m-1]} ${y}`
  }
  function monthShort(ym) {  // kept for Payroll.jsx filename generation
    if (!ym) return ''
    const [, m] = ym.split('-')
    return MONTHS_EN[+m-1]?.slice(0,3) || ''
  }

  // Number to English words (for amount-in-words line)
  function numToWords(n) {
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
      'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
    const tensW = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
    function b100(x)  { return x<20 ? ones[x] : tensW[Math.floor(x/10)]+(x%10?' '+ones[x%10]:'') }
    function b1k(x)   { return x<100 ? b100(x) : ones[Math.floor(x/100)]+' Hundred'+(x%100?' '+b100(x%100):'') }
    function conv(x)  {
      if (x===0) return 'Zero'
      if (x<1000) return b1k(x)
      if (x<1000000) return b1k(Math.floor(x/1000))+' Thousand'+(x%1000?' '+b1k(x%1000):'')
      return b1k(Math.floor(x/1000000))+' Million'+(x%1000000?' '+conv(x%1000000):'')
    }
    const whole = Math.floor(n), cents = Math.round((n-whole)*100)
    return conv(whole) + (cents>0 ? ` and ${b100(cents)}/100` : '') + ' Saudi Riyals'
  }

  const {
    employee_code='', employee_name='', department='', designation='',
    nationality='', iban='', bank_name='', hire_date='',
    employee_phone='', employee_email='',
    basic_salary=0, bank_portion=0, cash_portion=0,
    housing_allowance=0, transport_allowance=0, food_allowance=0,
    other_allowance=0, ot_amount=0, gross_salary=0,
    gosi_amount=0, gosi_rate=0,
    loan_deduction=0, penalty_deduction=0, leave_deduction=0,
    advance_deduction=0, other_deduction=0,
    unpaid_days=0, net_salary=0,
    payroll_month='', pay_date='', pay_slip_serial='0001',
    entity_name='RATAL Advanced Technologies',
    entity_address='Building 4812, Aghadeer Street Malaz',
    entity_vat='310680651700003',
    hr_signatory='',   // name shown in cursive above HR Department line
  } = d

  // Pay Slip # — format: YYYY-MM-EmpNo-Serial
  const moYear  = payroll_month ? payroll_month.slice(0,4) : new Date().getFullYear()
  const moMonth = payroll_month ? payroll_month.slice(5,7) : String(new Date().getMonth()+1).padStart(2,'0')
  const empNoRaw = (employee_code || '').replace(/[^0-9]/g,'') || '001'
  const empNoPad = empNoRaw.padStart(3,'0')
  const serialPad = String(pay_slip_serial).padStart(4,'0')
  const paySlipNo = `${moYear}-${moMonth}-${empNoPad}-${serialPad}`

  // Earnings rows — always show non-zero
  const totalEarnings = [basic_salary,housing_allowance,transport_allowance,other_allowance,ot_amount,food_allowance]
    .reduce((s,v)=>s+(+v||0),0)
  // Deductions rows — always show fixed list (0.00 if empty, like the template)
  const totalDeductions = (+leave_deduction||0)+(+penalty_deduction||0)+(+advance_deduction||0)+(+loan_deduction||0)+(+other_deduction||0)

  const gosiRateLabel = ((nationality||'').toUpperCase()==='SAUDI'||(nationality||'').toUpperCase()==='SA') ? '9%' : '3%'

  // Amount in words for net salary
  const netWords = numToWords(parseFloat(net_salary)||0)

  // QR payload — exactly what the user wants to see when scanned
  const qrPayload = [
    entity_name,
    `Employee: ${employee_name}`,
    `Month: ${monthLabel(payroll_month)}`,
    `PaySlip#: ${paySlipNo}`,
    `Gross Salary: SAR ${fmt(gross_salary)}`,
    `Net Salary: SAR ${fmt(net_salary)}`,
    `Bank Portion: SAR ${fmt(bank_portion)}`,
    `Cash Portion: SAR ${fmt(cash_portion)}`,
  ].join('\n')

  // Earn/Ded row helpers — always shown (0.00 if empty)
  const eRow = (label, val) =>
    `<tr><td class="el">${label}</td><td class="ea">${fmt(val)}</td></tr>`
  const dRow = (label, val) =>
    `<tr><td class="dl">${label}</td><td class="da">${fmt(val)}</td></tr>`

  // ── HTML return (Image-1 layout: compact landscape, no empty space) ──────────
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Salary Slip — ${employee_name} — ${monthLabel(payroll_month)}</title>
<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Century Gothic','Century Gothic Panose',Futura,'Trebuchet MS',Arial,sans-serif;background:#fff;color:#1a1a2e;font-size:11px;}

/* ── Colors ── */
/* purple: #6B48A0 | light-lav-bg: #EDE7F6 | lighter-lav: #F5F0FA | border: #C5B3E6 */

.page{width:900px;margin:0 auto;border:1.5px solid #C5B3E6;border-radius:8px;overflow:hidden;background:#fff;}

/* ── Company Header ── */
.co-hdr{display:flex;justify-content:space-between;align-items:center;padding:14px 20px 12px;border-bottom:2px solid #C5B3E6;}
.co-name{font-size:25px;font-weight:800;color:#1a1a2e;letter-spacing:-.2px;}
.co-addr{font-size:10px;color:#5c3d8f;margin-top:3px;text-decoration:underline;}

/* ── Body ── */
.body{display:flex;}

/* ── LEFT PANEL ── */
.left{width:268px;min-width:268px;border-right:1.5px solid #C5B3E6;padding:14px 14px 14px 16px;display:flex;flex-direction:column;gap:10px;background:#fff;}
.slip-title{font-size:34px;font-weight:800;color:#1a1a2e;line-height:1.05;}
.slip-month{font-size:12.5px;color:#555;font-weight:600;margin-top:2px;}

.slip-no-box{background:#F5F0FA;border:1px solid #C5B3E6;border-radius:5px;padding:5px 10px;font-size:10px;font-weight:700;color:#3d1a6e;letter-spacing:.3px;}
.slip-paydate{background:#EDE7F6;border:1px solid #C5B3E6;border-radius:5px;padding:4px 10px;font-size:10px;color:#3d1a6e;margin-top:5px;}

.emp-info-box{border:1.5px solid #C5B3E6;border-radius:5px;overflow:hidden;}
.emp-info-hdr{background:#6B48A0;color:#fff;font-size:9px;font-weight:800;letter-spacing:1px;text-align:center;padding:5px 8px;text-transform:uppercase;}
.emp-info-row{display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-bottom:1px solid #EDE7F6;font-size:10.5px;line-height:1.4;}
.emp-info-row:last-child{border-bottom:none;}
.ei-lbl{color:#777;font-weight:500;}
.ei-val{font-weight:700;color:#1a1a2e;}

.gross-box{background:#6B48A0;border-radius:5px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;}
.gross-lbl{color:#fff;font-size:9px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;}
.gross-amt{color:#fff;font-size:16px;font-weight:800;}

.portion-tbl{width:100%;border-collapse:collapse;}
.portion-tbl tr{border-bottom:1px solid #EDE7F6;}
.portion-tbl tr:last-child{border-bottom:none;}
.portion-tbl td{padding:4px 2px;font-size:10.5px;}
.pt-lbl{color:#555;font-weight:700;letter-spacing:.3px;font-size:10px;text-transform:uppercase;}
.pt-amt{text-align:right;font-weight:700;color:#1a1a2e;}

/* ── RIGHT PANEL ── */
.right{flex:1;display:flex;flex-direction:column;}

/* Employee name banner — LIGHT LAVENDER (not dark purple) */
.emp-name-hdr{background:#EDE7F6;border-bottom:1px solid #C5B3E6;padding:9px 16px;text-align:center;}
.emp-name-text{font-size:14px;font-weight:800;color:#1a1a2e;letter-spacing:.2px;}
.emp-contact{font-size:10px;color:#555;margin-top:4px;display:flex;justify-content:center;gap:28px;}

/* ── Earn / Ded ── */
.earn-ded{display:flex;}
.earn-col,.ded-col{flex:1;}
.earn-col{border-right:1px solid #C5B3E6;}
.col-hdr{background:#6B48A0;color:#fff;font-size:11px;font-weight:800;text-align:center;padding:7px 8px;text-transform:uppercase;letter-spacing:.5px;}
table.ed-tbl{width:100%;border-collapse:collapse;font-size:10.5px;}
.ed-tbl td{padding:5.5px 10px;border-bottom:1px solid #EDE7F6;line-height:1.35;}
.ed-tbl .total-row td{border-bottom:none;border-top:1.5px solid #C5B3E6;background:#F5F0FA;font-weight:800;font-size:10px;letter-spacing:.3px;padding:6px 10px;}
.el,.dl{color:#333;}
.ea,.da{text-align:right;font-weight:600;color:#1a1a2e;}

/* ── Bottom strip — 3 columns, fixed widths to prevent clipping ── */
.bottom{border-top:1.5px solid #C5B3E6;display:flex;align-items:stretch;overflow:hidden;}

/* Col 1: icon + NET SALARY + amount — fixed 190px */
.net-col{width:190px;min-width:190px;padding:12px 12px;display:flex;align-items:center;gap:10px;border-right:1px solid #C5B3E6;}
.net-icon{width:44px;height:44px;background:#6B48A0;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff;font-size:20px;}
.net-lbl{font-size:9px;font-weight:800;color:#555;letter-spacing:1px;text-transform:uppercase;margin-bottom:1px;}
.net-amt{font-size:20px;font-weight:800;color:#1a1a2e;line-height:1.1;}

/* Col 2: words + bank info — flex grows, shrinks to give col 3 room */
.bank-col{flex:1;min-width:0;padding:10px 12px;border-right:1px solid #C5B3E6;display:flex;flex-direction:column;justify-content:center;gap:4px;}
.net-words{font-size:9.5px;color:#444;line-height:1.45;font-style:italic;word-break:break-word;}
.bank-row{font-size:10px;color:#1a1a2e;margin-top:3px;word-break:break-all;}
.bank-row b{font-weight:800;margin-right:5px;word-break:normal;}

/* Col 3: signatures — fixed 230px so text never clips */
.sig-col{width:230px;min-width:230px;padding:10px 14px;display:flex;gap:16px;align-items:flex-end;justify-content:center;}
.sig-block{text-align:center;flex:1;}
.sig-script{font-family:'Dancing Script',cursive;font-size:24px;color:#1a1a2e;line-height:1;height:34px;display:flex;align-items:flex-end;justify-content:center;}
.sig-line{border-top:1.5px solid #333;padding-top:4px;font-size:9.5px;font-weight:800;color:#1a1a2e;text-transform:uppercase;letter-spacing:.4px;margin-top:2px;}
.sig-empty{height:34px;}/* blank space for employee ink signature */

/* ── Footer ── */
.footer{border-top:1.5px solid #C5B3E6;background:#F5F0FA;padding:5px 16px;display:flex;justify-content:space-between;font-size:9px;color:#777;letter-spacing:.2px;}

@media print{
  body{background:#fff;}
  .page{width:100%;border:none;border-radius:0;}
  @page{size:A4 landscape;margin:6mm;}
}
</style>
</head>
<body>
<div class="page">

<!-- Company Header -->
<div class="co-hdr">
  <div>
    <div class="co-name">${entity_name}</div>
    <div class="co-addr">${entity_address}</div>
  </div>
  <div id="payslip-qr" style="width:80px;height:80px;border:1px solid #ddd;border-radius:4px;padding:2px;background:#fff;flex-shrink:0;overflow:hidden;"></div>
</div>

<!-- Body -->
<div class="body">

  <!-- LEFT PANEL -->
  <div class="left">

    <div>
      <div class="slip-title">Salary Slip</div>
      <div class="slip-month">${monthLabel(payroll_month)}</div>
    </div>

    <div class="slip-no-box">Pay Slip# &nbsp;${paySlipNo}</div>
    ${pay_date ? `<div class="slip-paydate">Pay Date: &nbsp;<b>${pay_date}</b></div>` : ''}

    <div class="emp-info-box">
      <div class="emp-info-hdr">Employee Information</div>
      <div class="emp-info-row"><span class="ei-lbl">ID</span><span class="ei-val">${employee_code||'—'}</span></div>
      <div class="emp-info-row"><span class="ei-lbl">Department</span><span class="ei-val">${department||'—'}</span></div>
      <div class="emp-info-row"><span class="ei-lbl">Position</span><span class="ei-val">${designation||'—'}</span></div>
    </div>

    <div class="gross-box">
      <span class="gross-lbl">GROSS SALARY</span>
      <span class="gross-amt">${fmt(gross_salary)}</span>
    </div>

    <table class="portion-tbl">
      <tr><td class="pt-lbl">BANK PORTION</td><td class="pt-amt">${fmt(bank_portion)}</td></tr>
      <tr><td class="pt-lbl">CASH PORTION</td><td class="pt-amt">${fmt(cash_portion)}</td></tr>
    </table>

  </div>

  <!-- RIGHT PANEL -->
  <div class="right">

    <!-- Employee name header -->
    <div class="emp-name-hdr">
      <div class="emp-name-text">${employee_name}</div>
      <div class="emp-contact">
        ${employee_phone?`<span>📞 ${employee_phone}</span>`:''}
        ${employee_email?`<span>✉ ${employee_email}</span>`:''}
      </div>
    </div>

    <!-- Earnings / Deductions -->
    <div class="earn-ded">
      <div class="earn-col">
        <div class="col-hdr">Earnings</div>
        <table class="ed-tbl">
          <tbody>
            ${eRow('Basic Salary', basic_salary)}
            ${eRow('Housing', housing_allowance)}
            ${eRow('Transportation', transport_allowance)}
            ${eRow('Technical Allowance', other_allowance)}
            ${eRow('Overtime', ot_amount)}
            ${eRow('Others', food_allowance)}
          </tbody>
          <tfoot>
            <tr class="total-row"><td class="el">TOTAL EARNINGS</td><td class="ea">${fmt(totalEarnings)}</td></tr>
          </tfoot>
        </table>
      </div>
      <div class="ded-col">
        <div class="col-hdr">Deductions</div>
        <table class="ed-tbl">
          <tbody>
            ${dRow('Absent', leave_deduction)}
            ${dRow('Car Penalties', penalty_deduction)}
            ${dRow('Advance', advance_deduction)}
            ${dRow('Loans EMI', loan_deduction)}
            ${dRow('Other Deductions', other_deduction)}
          </tbody>
          <tfoot>
            <tr class="total-row"><td class="dl">TOTAL DEDUCTIONS</td><td class="da">${fmt(totalDeductions)}</td></tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- Bottom strip: 3 columns -->
    <div class="bottom">

      <!-- Col 1: icon + NET SALARY + amount -->
      <div class="net-col">
        <div class="net-icon">💼</div>
        <div>
          <div class="net-lbl">Net Salary</div>
          <div class="net-amt">${fmt(net_salary)}</div>
        </div>
      </div>

      <!-- Col 2: words + bank info -->
      <div class="bank-col">
        <div class="net-words">${netWords}</div>
        <div class="bank-row"><b>BANK</b> ${bank_name||'—'}</div>
        <div class="bank-row"><b>IBAN #</b> ${iban||'—'}</div>
      </div>

      <!-- Col 3: signatures -->
      <div class="sig-col">
        <div class="sig-block">
          ${hr_signatory ? `<div class="sig-script">${hr_signatory}</div>` : '<div class="sig-empty"></div>'}
          <div class="sig-line">HR Department</div>
        </div>
        <div class="sig-block">
          <div class="sig-empty"></div>
          <div class="sig-line">Employee Signature</div>
        </div>
      </div>

    </div>

  </div><!-- /right -->
</div><!-- /body -->

<!-- Footer -->
<div class="footer">
  <span>${employee_name} Salary Slip of ${monthLabel(payroll_month)}</span>
  <span>PaySlip# ${paySlipNo}</span>
</div>

</div>

<script>
(function(){
  var el = document.getElementById('payslip-qr');
  if (!el) return;
  var payload = ${JSON.stringify(qrPayload)};
  try {
    new QRCode(el, {
      text: payload,
      width: 76,
      height: 76,
      colorDark: '#3d1a6e',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  } catch(e) {
    // fallback: show compact text if QRCode library not loaded
    el.innerHTML = '<div style="font-size:7px;color:#666;padding:2px;word-break:break-all;">QR</div>';
  }
})();
</script>
</body>
</html>`
}

// ─── Department Payroll Report — A4 Landscape ────────────────────────────────
// d = { dept_name, payroll_month, pay_date, generated_by, items:[...], status:'PENDING'|'PAID' }
// Each item has: _name, _emp_no, _category, basic_salary, housing_allowance, transport_allowance,
//   other_allowance, ot_amount, gross_salary, deductions, net_salary, _bank_portion, _cash_portion, _slip_type
function buildDeptReport(d) {
  const items    = d.items || []
  const month    = d.payroll_month || ''
  const mo       = monthLabel(month)
  const deptName = d.dept_name || 'Department'
  const status   = d.status   || 'PENDING'
  const fmt = n => (+n||0).toLocaleString('en-SA', { minimumFractionDigits:2, maximumFractionDigits:2 })
  const tot = key => items.reduce((s,i) => s + (+i[key]||0), 0)
  const CAT_L = { '01':'LOCAL','02':'EXPAT','03':'OUTSRC','04':'CONTRACT' }
  const CAT_C = { '01':'#1565c0','02':'#6a1b9a','03':'#e65100','04':'#2e7d32' }

  const rows = items.map((it, i) => `
    <tr class="${i%2===0?'even':'odd'}">
      <td class="l">${i+1}</td>
      <td class="l" style="text-align:left">${it._name||''}</td>
      <td class="l">${it._emp_no||''}</td>
      <td><span style="background:${CAT_C[it._category||'02']}22;color:${CAT_C[it._category||'02']};padding:1px 5px;border-radius:4px;font-size:8px;font-weight:800">${CAT_L[it._category||'02']||''}</span></td>
      <td>${fmt(it.basic_salary)}</td>
      <td>${fmt(it.housing_allowance)}</td>
      <td>${fmt(it.transport_allowance)}</td>
      <td>${fmt((+it.mobile_allowance||0)+(+it.medical_allowance||0)+(+it.technical_allowance||0)+(+it.other_allowance||0)+(+it.food_allowance||0))}</td>
      <td>${fmt(it.ot_amount)}</td>
      <td class="bold teal">${fmt(it.gross_salary)}</td>
      <td class="red">${fmt(it.deductions)}</td>
      <td class="bold green">${fmt(it.net_salary)}</td>
      <td class="blue">${fmt(it._bank_portion||it.basic_salary)}</td>
      <td style="color:#e65100">${fmt(it._cash_portion||it.cash_portion||0)}</td>
    </tr>`).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${deptName} Payroll — ${mo}</title>
<style>
  @page { size: A4 landscape; margin: 12mm 10mm; }
  * { box-sizing: border-box; font-family: Arial, sans-serif; }
  body { margin:0; padding:0; background:#fff; font-size:10px; color:#1a2e3d; }
  .page { padding:12px 14px; }
  .header { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #6B48A0; padding-bottom:8px; margin-bottom:10px; }
  .brand { font-size:18px; font-weight:900; color:#6B48A0; letter-spacing:-0.5px; }
  .brand span { color:#1a2e3d; }
  .title { text-align:center; }
  .title h2 { margin:0; font-size:13px; color:#1a2e3d; }
  .title p { margin:2px 0 0; font-size:9px; color:#6b7c93; }
  .badge { padding:3px 10px; border-radius:12px; font-size:9px; font-weight:800; }
  .badge.pending { background:#fff3e0; color:#e65100; border:1px solid #e65100; }
  .badge.paid    { background:#e8f5e9; color:#2e7d32; border:1px solid #2e7d32; }
  table { width:100%; border-collapse:collapse; font-size:9px; }
  th { background:#6B48A0; color:#fff; padding:5px 4px; text-align:center; white-space:nowrap; }
  th.l { text-align:left; }
  td { padding:4px 4px; text-align:right; border-bottom:1px solid #f0e6ff; white-space:nowrap; }
  td.l { text-align:left; }
  tr.even { background:#fff; }
  tr.odd  { background:#faf7ff; }
  .bold { font-weight:700; }
  .teal { color:#00695c; }
  .green { color:#2e7d32; }
  .red   { color:#c62828; }
  .blue  { color:#1565c0; }
  .totals td { background:#4a148c; color:#fff; font-weight:800; font-size:9.5px; padding:5px 4px; }
  .sigs { display:flex; gap:40px; margin-top:20px; }
  .sig  { flex:1; text-align:center; }
  .sig .line { border-top:1.5px solid #6B48A0; padding-top:5px; margin-top:32px; font-size:9px; color:#546e7a; }
  .note { font-size:8px; color:#90a4ae; margin-top:6px; }
</style></head><body><div class="page">
  <div class="header">
    <div class="brand">RATAL <span>Advanced Technologies</span></div>
    <div class="title">
      <h2>${deptName} — Payroll Report</h2>
      <p>${mo} &nbsp;|&nbsp; Pay Date: ${d.pay_date||'—'} &nbsp;|&nbsp; Generated: ${new Date().toLocaleDateString('en-GB')}</p>
    </div>
    <div>
      <span class="badge ${status.toLowerCase()}">${status}</span>
      <div style="font-size:8px;color:#9e9e9e;margin-top:3px;text-align:right">Employees: ${items.length}</div>
    </div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th><th class="l" style="min-width:110px">Employee Name</th><th>EMP#</th><th>Cat</th>
        <th>Basic</th><th>Housing</th><th>Transport</th><th>Others</th><th>OT</th>
        <th>GROSS</th><th style="color:#ffcdd2">Deductions</th><th style="color:#c8e6c9">NET</th>
        <th style="color:#bbdefb">BANK</th><th style="color:#ffe0b2">CASH</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tr class="totals">
      <td colspan="4" style="text-align:left">TOTALS — ${items.length} Employees</td>
      <td>${fmt(tot('basic_salary'))}</td>
      <td>${fmt(tot('housing_allowance'))}</td>
      <td>${fmt(tot('transport_allowance'))}</td>
      <td></td>
      <td>${fmt(tot('ot_amount'))}</td>
      <td>${fmt(tot('gross_salary'))}</td>
      <td>${fmt(tot('deductions'))}</td>
      <td>${fmt(tot('net_salary'))}</td>
      <td>${fmt(items.reduce((s,i)=>s+(+i._bank_portion||+i.basic_salary||0),0))}</td>
      <td>${fmt(items.reduce((s,i)=>s+(+i._cash_portion||+i.cash_portion||0),0))}</td>
    </tr>
  </table>
  <div class="sigs">
    <div class="sig"><div class="line">Department Head</div></div>
    <div class="sig"><div class="line">HR Manager</div></div>
    <div class="sig"><div class="line">Finance Manager</div></div>
  </div>
  <div class="note">⚠️ ${status==='PENDING'?'DRAFT — figures may change before final payment authorization':'FINAL — Authorized. Figures are immutable. Any amendment requires a new payroll correction run.'}</div>
</div></body></html>`
}

// ─── Overall All-Departments Summary Report — A4 Landscape ───────────────────
// d = { payroll_month, pay_date, generated_by, depts:[{ dept_name, headcount, total_basic,
//   total_housing, total_transport, total_others, total_ot, gross, deductions, net, bank, cash }],
//   status:'PENDING'|'PAID' }
function buildOverallSummaryPDF(d) {
  const depts    = d.depts || []
  const mo       = monthLabel(d.payroll_month || '')
  const status   = d.status || 'PENDING'
  const fmt = n => (+n||0).toLocaleString('en-SA', { minimumFractionDigits:2, maximumFractionDigits:2 })
  const tot = key => depts.reduce((s, r) => s + (+r[key]||0), 0)

  const rows = depts.map((r, i) => `
    <tr class="${i%2===0?'even':'odd'}">
      <td>${i+1}</td>
      <td style="text-align:left;font-weight:600">${r.dept_name||''}</td>
      <td>${r.headcount||0}</td>
      <td>${fmt(r.total_basic)}</td>
      <td>${fmt(r.total_housing)}</td>
      <td>${fmt(r.total_transport)}</td>
      <td>${fmt(r.total_others)}</td>
      <td>${fmt(r.total_ot)}</td>
      <td class="bold teal">${fmt(r.gross)}</td>
      <td class="red">${fmt(r.deductions)}</td>
      <td class="bold green large">${fmt(r.net)}</td>
      <td class="blue">${fmt(r.bank)}</td>
      <td style="color:#e65100">${fmt(r.cash)}</td>
    </tr>`).join('')

  const totalBank = tot('bank'), totalCash = tot('cash'), totalNet = tot('net')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>All Departments Payroll Summary — ${mo}</title>
<style>
  @page { size: A4 landscape; margin: 12mm 10mm; }
  * { box-sizing: border-box; font-family: Arial, sans-serif; }
  body { margin:0; padding:0; background:#fff; font-size:10px; color:#1a2e3d; }
  .page { padding:12px 14px; }
  .header { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #6B48A0; padding-bottom:8px; margin-bottom:10px; }
  .brand { font-size:20px; font-weight:900; color:#6B48A0; }
  .brand span { color:#1a2e3d; }
  .title h2 { margin:0; font-size:14px; text-align:center; }
  .title p  { margin:2px 0 0; font-size:9px; color:#6b7c93; text-align:center; }
  .badge { padding:4px 12px; border-radius:12px; font-size:10px; font-weight:800; }
  .badge.pending { background:#fff3e0; color:#e65100; border:1.5px solid #e65100; }
  .badge.paid    { background:#e8f5e9; color:#2e7d32; border:1.5px solid #2e7d32; }
  table { width:100%; border-collapse:collapse; font-size:9px; }
  th { background:#4a148c; color:#fff; padding:6px 4px; text-align:center; white-space:nowrap; }
  td { padding:5px 4px; text-align:right; border-bottom:1px solid #f0e6ff; }
  tr.even { background:#fff; } tr.odd { background:#faf7ff; }
  .bold { font-weight:700; } .large { font-size:10px; }
  .teal { color:#00695c; } .green { color:#2e7d32; } .red { color:#c62828; } .blue { color:#1565c0; }
  .totals td { background:#4a148c; color:#fff; font-weight:800; font-size:9.5px; padding:6px 4px; }
  .payment-box { display:flex; gap:16px; margin-top:12px; }
  .pbox { flex:1; border-radius:8px; padding:8px 12px; text-align:center; }
  .pbox .amt { font-size:14px; font-weight:900; margin-top:4px; }
  .pbox .lbl { font-size:8px; font-weight:700; letter-spacing:0.5px; }
  .sigs { display:flex; gap:40px; margin-top:16px; }
  .sig  { flex:1; text-align:center; }
  .sig .line { border-top:1.5px solid #6B48A0; padding-top:5px; margin-top:28px; font-size:9px; color:#546e7a; }
  .note { font-size:8px; color:#90a4ae; margin-top:6px; }
</style></head><body><div class="page">
  <div class="header">
    <div class="brand">RATAL <span>Advanced Technologies</span></div>
    <div class="title">
      <h2>All Departments Payroll Summary</h2>
      <p>${mo} &nbsp;|&nbsp; Pay Date: ${d.pay_date||'—'} &nbsp;|&nbsp; Departments: ${depts.length} &nbsp;|&nbsp; Total Employees: ${tot('headcount')}</p>
    </div>
    <div><span class="badge ${status.toLowerCase()}">${status}</span></div>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th><th style="min-width:120px;text-align:left">Department</th><th>Staff</th>
        <th>Basic</th><th>Housing</th><th>Transport</th><th>Others</th><th>OT</th>
        <th>GROSS</th><th style="color:#ffcdd2">Deductions</th>
        <th style="color:#c8e6c9;min-width:80px">NET TOTAL</th>
        <th style="color:#bbdefb">BANK</th><th style="color:#ffe0b2">CASH</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tr class="totals">
      <td colspan="2" style="text-align:left">GRAND TOTAL — ${depts.length} Departments</td>
      <td>${tot('headcount')}</td>
      <td>${fmt(tot('total_basic'))}</td>
      <td>${fmt(tot('total_housing'))}</td>
      <td>${fmt(tot('total_transport'))}</td>
      <td>${fmt(tot('total_others'))}</td>
      <td>${fmt(tot('total_ot'))}</td>
      <td>${fmt(tot('gross'))}</td>
      <td>${fmt(tot('deductions'))}</td>
      <td>${fmt(totalNet)}</td>
      <td>${fmt(totalBank)}</td>
      <td>${fmt(totalCash)}</td>
    </tr>
  </table>
  <div class="payment-box">
    <div class="pbox" style="background:#e3f2fd">
      <div class="lbl" style="color:#1565c0">🏦 WPS BANK TRANSFER</div>
      <div class="amt" style="color:#1565c0">SAR ${fmt(totalBank)}</div>
      <div style="font-size:8px;color:#546e7a;margin-top:2px">Process on 28th · Pay Date: ${d.pay_date||'30th'}</div>
    </div>
    <div class="pbox" style="background:#fff3e0">
      <div class="lbl" style="color:#e65100">💵 CASH DISBURSEMENT</div>
      <div class="amt" style="color:#e65100">SAR ${fmt(totalCash)}</div>
      <div style="font-size:8px;color:#546e7a;margin-top:2px">Outsourced + Contract + EXPAT Cash portions</div>
    </div>
    <div class="pbox" style="background:#e8f5e9">
      <div class="lbl" style="color:#2e7d32">✅ TOTAL NET PAYROLL</div>
      <div class="amt" style="color:#2e7d32">SAR ${fmt(totalNet)}</div>
      <div style="font-size:8px;color:#546e7a;margin-top:2px">Bank + Cash combined</div>
    </div>
  </div>
  <div class="sigs">
    <div class="sig"><div class="line">Finance Manager</div></div>
    <div class="sig"><div class="line">HR Manager</div></div>
    <div class="sig"><div class="line">General Manager</div></div>
  </div>
  <div class="note">⚠️ ${status==='PENDING'?'DRAFT — figures may change before final payment authorization. Not valid for payment processing.':'FINAL AUTHORIZED — Payment authorized and processed on '+d.pay_date+'. This document is immutable.'}</div>
</div></body></html>`
}

// ─── Mudad Submission Log — A4 Portrait ──────────────────────────────────────
// d = { payroll_month, submission_date, submitted_by, gosi_count, wps_count,
//   total_amount, entity_name, notes, status:'SUBMITTED'|'ACCEPTED'|'REJECTED' }
function buildMudadLog(d) {
  const mo     = monthLabel(d.payroll_month || '')
  const status = d.status || 'SUBMITTED'
  const statusColor = status==='ACCEPTED'?'#2e7d32': status==='REJECTED'?'#c62828':'#1565c0'
  const statusBg    = status==='ACCEPTED'?'#e8f5e9': status==='REJECTED'?'#ffebee':'#e3f2fd'
  const fmt = n => (+n||0).toLocaleString('en-SA', { minimumFractionDigits:2, maximumFractionDigits:2 })

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Mudad Submission Log — ${mo}</title>
<style>
  @page { size: A4 portrait; margin: 20mm 15mm; }
  * { box-sizing: border-box; font-family: Arial, sans-serif; }
  body { margin:0; padding:0; background:#fff; font-size:11px; color:#1a2e3d; }
  .page { padding:16px 18px; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #6B48A0; padding-bottom:10px; margin-bottom:14px; }
  .brand { font-size:20px; font-weight:900; color:#6B48A0; }
  .brand span { color:#1a2e3d; }
  .brand sub { font-size:9px; display:block; color:#6b7c93; font-weight:400; margin-top:2px; }
  h2 { margin:0; font-size:15px; text-align:center; color:#1a2e3d; }
  .row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid #f0e6ff; }
  .row .label { color:#6b7c93; font-weight:600; font-size:10px; }
  .row .val { font-weight:700; font-size:11px; }
  .status-box { text-align:center; padding:10px 20px; border-radius:10px; margin:14px 0;
    background:${statusBg}; border:2px solid ${statusColor}; }
  .status-box .s { font-size:18px; font-weight:900; color:${statusColor}; }
  .status-box .note { font-size:9px; color:${statusColor}; margin-top:2px; }
  .warn { background:#fff3e0; border:1px solid #ff8f00; border-radius:8px; padding:10px 14px; margin:12px 0; font-size:10px; color:#e65100; }
  .sig { margin-top:32px; text-align:center; }
  .sig .line { border-top:1.5px solid #6B48A0; padding-top:5px; margin-top:28px; font-size:9px; color:#546e7a; display:inline-block; min-width:180px; }
</style></head><body><div class="page">
  <div class="header">
    <div class="brand">RATAL <span>Advanced Technologies</span><sub>Building 4812, Aghadeer Street Malaz, Riyadh</sub></div>
    <div style="text-align:right"><div style="font-size:10px;color:#6b7c93">Submission Date</div>
    <div style="font-size:13px;font-weight:700">${d.submission_date||new Date().toLocaleDateString('en-GB')}</div></div>
  </div>
  <h2>Mudad GOSI Submission Log</h2>
  <div style="text-align:center;font-size:10px;color:#6b7c93;margin-bottom:14px">${mo} Payroll</div>

  <div class="status-box">
    <div class="s">${status}</div>
    <div class="note">${status==='ACCEPTED'?'GOSI submission accepted. Compliance confirmed.':status==='REJECTED'?'Submission rejected. Review error message and resubmit.':'Submitted to Mudad portal. Awaiting GOSI confirmation.'}</div>
  </div>

  <div class="row"><span class="label">Entity Name</span><span class="val">${d.entity_name||'RATAL Advanced Technologies'}</span></div>
  <div class="row"><span class="label">Payroll Month</span><span class="val">${mo}</span></div>
  <div class="row"><span class="label">WPS Employee Count</span><span class="val">${d.wps_count||'—'}</span></div>
  <div class="row"><span class="label">GOSI Employee Count</span><span class="val">${d.gosi_count||'—'}</span></div>
  <div class="row"><span class="label">Match Status</span><span class="val" style="color:${d.wps_count===d.gosi_count?'#2e7d32':'#c62828'}">${d.wps_count===d.gosi_count?'✅ Counts match':'⚠️ MISMATCH — counts differ'}</span></div>
  <div class="row"><span class="label">Total WPS Amount</span><span class="val">SAR ${fmt(d.total_amount)}</span></div>
  <div class="row"><span class="label">Submitted By</span><span class="val">${d.submitted_by||'Finance'}</span></div>
  <div class="row"><span class="label">Submission Date</span><span class="val">${d.submission_date||'—'}</span></div>
  <div class="row"><span class="label">GOSI Statement File</span><span class="val">ANB_GOSI_Statement_${d.payroll_month||''}.txt</span></div>
  ${d.notes?`<div style="background:#f3e5f5;border-radius:8px;padding:10px;margin-top:10px;font-size:10px"><strong>Notes:</strong> ${d.notes}</div>`:''}
  <div class="warn">⚠️ <strong>Important:</strong> The GOSI .txt bank statement must be uploaded to Mudad without opening or modifying the file. Any change invalidates the submission.</div>
  <div class="warn" style="background:#e8f5e9;border-color:#66bb6a;color:#2e7d32">📋 <strong>Mudad Due Date:</strong> 5th of the following month. If 5th falls on Friday or Saturday → submit on the following Sunday (first working day after the 5th).</div>
  <div class="sig"><div class="line">Finance Manager — ${d.submitted_by||''}</div></div>
</div></body></html>`
}

// ─── Built-in template registry ───────────────────────────────────────────────
// Add more builders here as templates are created.
// When compiled_html exists in Supabase, it takes priority automatically.
// ─── Shared claim helpers ────────────────────────────────────────────────────
function fmtD(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d.padStart(2,'0')}/${m.padStart(2,'0')}/${y}` : iso
}
function fmtN(n) { return parseFloat(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) }

function numberToWords(n) {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const tensW = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  function hw(x) {
    if (!x) return ''
    if (x < 20) return ones[x] + ' '
    if (x < 100) return tensW[Math.floor(x/10)] + (x%10 ? ' '+ones[x%10] : '') + ' '
    return ones[Math.floor(x/100)] + ' Hundred ' + hw(x%100)
  }
  if (!n || n === 0) return 'Zero Saudi Riyals Only'
  const riyal   = Math.floor(Math.abs(n))
  const halala  = Math.round((Math.abs(n) - riyal) * 100)
  let w = ''
  if (riyal >= 1000000) w += hw(Math.floor(riyal/1000000)).trim() + ' Million '
  if (riyal >= 1000)    w += hw(Math.floor((riyal%1000000)/1000)).trim() + ' Thousand '
  w += hw(riyal % 1000)
  w = w.trim() + ' Saudi Riyals'
  if (halala > 0) w += ' and ' + hw(halala).trim() + ' Halalas'
  return w + ' Only'
}

function claimQR(d, docType, extra='') {
  const lines = [
    'Ratal Advanced Technologies',
    `Doc: ${docType}`,
    `Ref: ${d.claim_number||'—'}`,
    `Employee: ${d.employee_name||'—'}`,
    `Dept: ${d.department||'—'}`,
    `Project: ${d.project_no||'—'}`,
    `Period: ${fmtD(d.from_date)} – ${fmtD(d.to_date)}`,
    extra,
  ].filter(Boolean).join('\n')
  return `https://api.qrserver.com/v1/create-qr-code/?size=120x120&ecc=M&color=1a3a6b&data=${encodeURIComponent(lines)}`
}

function claimInfoGrid(d) {
  return `
  <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px;">
    <tr>
      <td style="width:16%;padding:5px 8px;background:#1a3a6b;color:#fff;font-weight:700;border:1px solid #1a3a6b;">Department</td>
      <td style="width:34%;padding:5px 8px;border:1px solid #ccc;font-weight:700;color:#1a3a6b;">${d.department||'—'}</td>
      <td style="width:16%;padding:5px 8px;background:#1a3a6b;color:#fff;font-weight:700;border:1px solid #1a3a6b;">Employee</td>
      <td style="width:34%;padding:5px 8px;border:1px solid #ccc;font-weight:700;color:#c0392b;">${d.employee_name||'—'}</td>
    </tr>
    <tr>
      <td style="padding:5px 8px;background:#f0f4f8;font-weight:700;border:1px solid #ccc;">Emp. No.</td>
      <td style="padding:5px 8px;border:1px solid #ccc;font-weight:700;color:#1a3a6b;">${d.employee_no||'—'}</td>
      <td style="padding:5px 8px;background:#f0f4f8;font-weight:700;border:1px solid #ccc;">Period</td>
      <td style="padding:5px 8px;border:1px solid #ccc;">${d.period||'—'}</td>
    </tr>
    <tr>
      <td style="padding:5px 8px;background:#f0f4f8;font-weight:700;border:1px solid #ccc;">Project No</td>
      <td style="padding:5px 8px;border:1px solid #ccc;font-weight:700;color:#1a3a6b;">${d.project_no||'—'}</td>
      <td style="padding:5px 8px;background:#f0f4f8;font-weight:700;border:1px solid #ccc;">Project Name</td>
      <td style="padding:5px 8px;border:1px solid #ccc;">${d.project_name||'—'}</td>
    </tr>
    <tr>
      <td style="padding:5px 8px;background:#f0f4f8;font-weight:700;border:1px solid #ccc;">From</td>
      <td style="padding:5px 8px;border:1px solid #ccc;">${fmtD(d.from_date)}</td>
      <td style="padding:5px 8px;background:#f0f4f8;font-weight:700;border:1px solid #ccc;">To</td>
      <td style="padding:5px 8px;border:1px solid #ccc;">${fmtD(d.to_date)}</td>
    </tr>
  </table>`
}

function claimRejectionBlock(rejections, submissionRound) {
  if (!rejections || rejections.length === 0) return ''
  const rows = rejections.map((r,i) => `
    <tr style="background:${i%2===0?'#fff8f8':'#fff'};">
      <td style="padding:5px 8px;border:1px solid #f5c6cb;font-weight:700;color:#c0392b;white-space:nowrap;">Round ${r.round||i+1}</td>
      <td style="padding:5px 8px;border:1px solid #f5c6cb;">${r.rejected_by||'—'}</td>
      <td style="padding:5px 8px;border:1px solid #f5c6cb;">${fmtD(r.rejected_on)}</td>
      <td style="padding:5px 8px;border:1px solid #f5c6cb;color:#c0392b;">${r.reason||'—'}</td>
      <td style="padding:5px 8px;border:1px solid #f5c6cb;font-size:10px;color:#555;">${r.resubmitted_by||''} ${r.resubmitted_on?'on '+fmtD(r.resubmitted_on):''}</td>
    </tr>`).join('')
  return `
  <div style="border:1.5px solid #f5c6cb;border-radius:6px;padding:10px 12px;margin-bottom:12px;background:#fff5f5;">
    <div style="font-size:11px;font-weight:800;color:#c0392b;margin-bottom:6px;">
      ⚠ RESUBMISSION ${submissionRound-1} — Rejection History
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:10px;">
      <thead>
        <tr style="background:#c0392b;">
          <th style="padding:4px 8px;color:#fff;text-align:left;border:1px solid #c0392b;">Round</th>
          <th style="padding:4px 8px;color:#fff;text-align:left;border:1px solid #c0392b;">Rejected By</th>
          <th style="padding:4px 8px;color:#fff;text-align:left;border:1px solid #c0392b;">Date</th>
          <th style="padding:4px 8px;color:#fff;text-align:left;border:1px solid #c0392b;">Reason</th>
          <th style="padding:4px 8px;color:#fff;text-align:left;border:1px solid #c0392b;">Corrected By</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`
}

function claimSignatureBlock(submissionRound) {
  const resubLabel = submissionRound > 1 ? ' (Re-approved)' : ''
  return `
  <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:11px;">
    <tr>
      <td style="width:25%;padding:30px 10px 8px;border-top:1.5px solid #1a3a6b;text-align:center;font-weight:700;color:#1a3a6b;">
        Employee${resubLabel}
      </td>
      <td style="width:25%;padding:30px 10px 8px;border-top:1.5px solid #1a3a6b;text-align:center;font-weight:700;color:#1a3a6b;">
        DH — Docs Received
      </td>
      <td style="width:25%;padding:30px 10px 8px;border-top:1.5px solid #1a3a6b;text-align:center;font-weight:700;color:#1a3a6b;">
        DH — Approved${resubLabel}
      </td>
      <td style="width:25%;padding:30px 10px 8px;border-top:1.5px solid #1a3a6b;text-align:center;font-weight:700;color:#1a3a6b;">
        Accounts
      </td>
    </tr>
    <tr>
      <td style="padding:0 10px 4px;text-align:center;font-size:9px;color:#888;">Name / Date</td>
      <td style="padding:0 10px 4px;text-align:center;font-size:9px;color:#888;">Name / Date</td>
      <td style="padding:0 10px 4px;text-align:center;font-size:9px;color:#888;">Name / Date</td>
      <td style="padding:0 10px 4px;text-align:center;font-size:9px;color:#888;">Name / Date</td>
    </tr>
  </table>`
}

const CLAIM_CSS = `
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Poppins',Arial,sans-serif; background:#fff; font-size:11px; color:#222; }
  .page { width:794px; min-height:1123px; margin:0 auto; padding:28px 36px 60px; position:relative; background:#fff; }
  .page-footer { position:absolute; bottom:0; left:0; right:0; border-top:1px solid #ddd; padding:5px 36px;
    font-size:8.5px; color:#999; display:flex; justify-content:space-between; align-items:center; background:#fff; }
  @media print { body{background:#fff;} .page{width:100%;min-height:297mm;padding:12mm 16mm 18mm;}
    @page{size:A4 portrait;margin:0;} }
`

// ─── Template 1: Expense Claim ────────────────────────────────────────────────
function buildExpenseClaim(d) {
  const lines       = d.lines || []
  const rejections  = d.rejections || []
  const sheetNum    = d.sheet_number   || 1
  const totalSheets = d.total_sheets   || 1
  const subRound    = d.submission_round || 1
  const isSheet1    = sheetNum === 1
  const fa          = d.food_allowance  // { amount, show }

  const subtotalNet   = lines.reduce((s,l) => s + (parseFloat(l.net_amount)||0), 0)
  const subtotalVat   = lines.reduce((s,l) => s + (parseFloat(l.vat_amount)||0), 0)
  const subtotalTotal = subtotalNet + subtotalVat + (isSheet1 && fa?.show ? (parseFloat(fa.amount)||0) : 0)

  const qrSrc = claimQR(d, 'EXPENSE CLAIM', `Sheet:${sheetNum}/${totalSheets} Total:SAR ${fmtN(d.grand_total||subtotalTotal)}`)

  const faRow = isSheet1 && fa?.show ? `
    <tr style="background:#fffde7;">
      <td style="text-align:center;font-weight:800;color:#e65100;border:1px solid #ffe082;">FA</td>
      <td colspan="3" style="font-weight:700;color:#e65100;border:1px solid #ffe082;">FOOD ALLOWANCE — Period Summary</td>
      <td style="text-align:right;font-weight:800;color:#e65100;border:1px solid #ffe082;">${fmtN(fa.amount)}</td>
      <td style="text-align:right;border:1px solid #ffe082;">—</td>
      <td style="text-align:right;font-weight:800;color:#e65100;border:1px solid #ffe082;">${fmtN(fa.amount)}</td>
    </tr>` : ''

  // Always render exactly 30 rows — FA row (if present on Sheet 1) counts as 1
  const MAX_ROWS   = 30
  const faSlot     = isSheet1 && fa?.show ? 1 : 0
  const dataSlots  = MAX_ROWS - faSlot           // how many numbered rows to always show
  const blankCell  = `<td style="height:19px;border:1px solid #ddd;"></td>`
  const blankNum   = `<td style="height:19px;text-align:center;color:#ccc;border:1px solid #ddd;">`

  const expRows = Array.from({ length: dataSlots }, (_, i) => {
    const l = lines[i]
    const even = i % 2 === 0
    if (l) return `
    <tr style="${even?'':'background:#f7f9fc;'}">
      <td style="text-align:center;border:1px solid #ddd;">${i+1}</td>
      <td style="border:1px solid #ddd;">${fmtD(l.date)}</td>
      <td style="border:1px solid #ddd;">${l.category||'—'}</td>
      <td style="border:1px solid #ddd;font-size:10px;">${l.vendor||''}</td>
      <td style="text-align:right;border:1px solid #ddd;">${fmtN(l.net_amount)}</td>
      <td style="text-align:right;border:1px solid #ddd;">${fmtN(l.vat_amount)}</td>
      <td style="text-align:right;font-weight:700;border:1px solid #ddd;">${fmtN(l.total)}</td>
    </tr>`
    // blank row
    return `
    <tr style="${even?'':'background:#fafbfc;'}">
      ${blankNum}${i+1}</td>
      ${blankCell}${blankCell}${blankCell}${blankCell}${blankCell}${blankCell}
    </tr>`
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Expense Claim — ${d.employee_name||''} ${d.claim_number||''}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>${CLAIM_CSS}</style></head><body>
  <div class="page">

    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
      <div>
        <div style="font-size:18px;font-weight:800;color:#1a3a6b;line-height:1.1;">Ratal Advanced Technologies</div>
        <div style="font-size:9px;color:#888;margin-top:2px;">Advanced Communication &amp; Computer Systems</div>
        <div style="margin-top:8px;">
          <div style="font-size:15px;font-weight:800;color:#1a3a6b;">EXPENSE CLAIM</div>
          <div style="font-size:12px;font-weight:700;color:#c0392b;">${d.employee_name||''} — ${d.department||''}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <img src="${qrSrc}" width="100" height="100" style="border:1.5px solid #bbb;border-radius:4px;padding:3px;" alt="QR"/>
        <div style="font-size:8.5px;color:#888;margin-top:3px;">${d.claim_number||''}</div>
        ${subRound>1 ? `<div style="font-size:9px;font-weight:800;color:#c0392b;margin-top:2px;">RESUBMISSION ${subRound-1}</div>` : ''}
      </div>
    </div>

    <div style="border-top:2px solid #1a3a6b;margin-bottom:10px;"></div>

    <!-- Meta row -->
    <div style="display:flex;justify-content:space-between;font-size:10px;color:#555;margin-bottom:8px;">
      <span>Generated: ${fmtD(d.generated_date)}</span>
      <span style="font-weight:700;color:#1a3a6b;">Sheet ${sheetNum} of ${totalSheets}</span>
      <span>Ref: <strong>${d.claim_number||'—'}</strong></span>
    </div>

    <!-- Info grid -->
    ${claimInfoGrid(d)}

    <!-- Rejection history (resubmissions only) -->
    ${isSheet1 ? claimRejectionBlock(rejections, subRound) : ''}

    <!-- Expense table -->
    <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:10px;table-layout:fixed;border:2.5px solid #1a3a6b;">
      <colgroup>
        <col style="width:30px"/><col style="width:70px"/>
        <col style="width:180px"/><col style="width:210px"/>
        <col style="width:76px"/><col style="width:62px"/><col style="width:72px"/>
      </colgroup>
      <thead>
        <tr style="background:#1a3a6b;">
          <th style="padding:6px 4px;color:#fff;border:1px solid #14305a;text-align:center;">S/N</th>
          <th style="padding:6px 4px;color:#fff;border:1px solid #14305a;">Date</th>
          <th style="padding:6px 4px;color:#fff;border:1px solid #14305a;">Category</th>
          <th style="padding:6px 4px;color:#fff;border:1px solid #14305a;">Vendor</th>
          <th style="padding:6px 4px;color:#fff;border:1px solid #14305a;text-align:right;">Net (SAR)</th>
          <th style="padding:6px 4px;color:#fff;border:1px solid #14305a;text-align:right;">VAT</th>
          <th style="padding:6px 4px;color:#fff;border:1px solid #14305a;text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${faRow}
        ${expRows}
        <tr style="background:#1a3a6b;">
          <td colspan="4" style="padding:6px 8px;color:#fff;font-weight:800;border:1px solid #14305a;">
            Sub-Total${totalSheets>1?' — Sheet '+sheetNum+' of '+totalSheets:''}
          </td>
          <td style="padding:6px 6px;color:#fff;font-weight:800;text-align:right;border:1px solid #14305a;">${fmtN(subtotalNet)}</td>
          <td style="padding:6px 6px;color:#fff;font-weight:800;text-align:right;border:1px solid #14305a;">${fmtN(subtotalVat)}</td>
          <td style="padding:6px 6px;color:#fff;font-weight:800;text-align:right;border:1px solid #14305a;font-size:11px;">${fmtN(subtotalTotal)}</td>
        </tr>
        ${sheetNum===totalSheets && totalSheets>1 ? `
        <tr style="background:#e8f0fe;">
          <td colspan="4" style="padding:6px 8px;font-weight:800;color:#1a3a6b;border:1px solid #c5d5f5;">Grand Total (All Sheets)</td>
          <td colspan="3" style="padding:6px 8px;font-weight:800;color:#1a3a6b;text-align:right;border:1px solid #c5d5f5;font-size:12px;">SAR ${fmtN(d.grand_total||subtotalTotal)}</td>
        </tr>` : ''}
      </tbody>
    </table>

    <!-- Signatures (last sheet only, or single sheet) -->
    ${sheetNum===totalSheets ? claimSignatureBlock(subRound) : `
      <div style="text-align:center;font-size:10px;color:#888;margin-top:8px;">— continued on sheet ${sheetNum+1} —</div>`}

    <div class="page-footer">
      <span>Ratal Advanced Technologies — Expense Claim</span>
      <span>${d.claim_number||''} · Sheet ${sheetNum}/${totalSheets}</span>
      <span>Generated: ${fmtD(d.generated_date)}</span>
    </div>
  </div>

  </body></html>`
}
// NOTE: Food Allowance Breakdown is printed SEPARATELY via monthly_food_allowance template
// and saved to the 'food-allowance-claims' Drive folder — not embedded in the expense claim.

// ─── Template 2: Food Allowance Claim ────────────────────────────────────────
function buildFoodAllowanceClaim(d) {
  const lines      = d.lines || []
  const rejections = d.rejections || []
  const subRound   = d.submission_round || 1
  const total      = lines.reduce((s,l) => s + (parseFloat(l.amount)||0), 0)
  const totalWords = numberToWords(total)
  const qrSrc      = claimQR(d, 'FOOD ALLOWANCE CLAIM', `Total:SAR ${fmtN(total)}`)

  // 30 rows — keep row height compact so everything fits on one A4 page
  const ROW_H  = '16px'
  const FA_COLS = 7
  const faBlankC = `<td style="height:${ROW_H};border:1px solid #e0e0e0;padding:0 4px;"></td>`
  const faBlankN = `<td style="height:${ROW_H};text-align:center;color:#ccc;border:1px solid #e0e0e0;font-size:9px;padding:0 4px;">`

  const dataRows = Array.from({ length: 30 }, (_, i) => {
    const l    = lines[i]
    const even = i % 2 === 0
    const bg   = even ? '' : 'background:#f7f9fc;'
    if (l) return `
    <tr style="${bg}">
      <td style="height:${ROW_H};text-align:center;border:1px solid #e0e0e0;font-size:9px;padding:0 3px;">${i+1}</td>
      <td style="height:${ROW_H};border:1px solid #e0e0e0;font-size:9px;padding:0 4px;">${fmtD(l.date)}</td>
      <td style="height:${ROW_H};border:1px solid #e0e0e0;font-size:9px;padding:0 4px;">${l.job_no||'—'}</td>
      <td style="height:${ROW_H};border:1px solid #e0e0e0;font-size:9px;padding:0 4px;">${l.location||'—'}</td>
      <td style="height:${ROW_H};border:1px solid #e0e0e0;font-size:9px;padding:0 4px;">${l.job_type||'—'}</td>
      <td style="height:${ROW_H};text-align:center;border:1px solid #e0e0e0;font-size:9px;padding:0 3px;">${l.persons||1}</td>
      <td style="height:${ROW_H};text-align:right;font-weight:700;border:1px solid #e0e0e0;font-size:9px;padding:0 5px;">${fmtN(l.amount)}</td>
    </tr>`
    return `
    <tr style="${bg}">
      ${faBlankN}${i+1}</td>
      ${faBlankC.repeat(FA_COLS - 1)}
    </tr>`
  }).join('')

  // Compact info grid for food allowance — 2 rows × 4 cols
  const faInfoGrid = `
  <table style="width:100%;border-collapse:collapse;font-size:9.5px;margin-bottom:6px;border:2px solid #1a6b3a;">
    <tr>
      <td style="width:15%;padding:3px 6px;background:#eaf3ea;font-weight:700;color:#1a6b3a;border:1px solid #c8e6c9;">Employee</td>
      <td style="width:35%;padding:3px 6px;border:1px solid #c8e6c9;font-weight:600;">${d.employee_name||'—'}</td>
      <td style="width:15%;padding:3px 6px;background:#eaf3ea;font-weight:700;color:#1a6b3a;border:1px solid #c8e6c9;">Emp. No.</td>
      <td style="width:35%;padding:3px 6px;border:1px solid #c8e6c9;">${d.employee_no||'—'}</td>
    </tr>
    <tr>
      <td style="padding:3px 6px;background:#eaf3ea;font-weight:700;color:#1a6b3a;border:1px solid #c8e6c9;">Department</td>
      <td style="padding:3px 6px;border:1px solid #c8e6c9;">${d.department||'—'}</td>
      <td style="padding:3px 6px;background:#eaf3ea;font-weight:700;color:#1a6b3a;border:1px solid #c8e6c9;">Period</td>
      <td style="padding:3px 6px;border:1px solid #c8e6c9;font-weight:600;">${d.period||'—'} &nbsp;(${fmtD(d.from_date)} – ${fmtD(d.to_date)})</td>
    </tr>
    <tr>
      <td style="padding:3px 6px;background:#eaf3ea;font-weight:700;color:#1a6b3a;border:1px solid #c8e6c9;">Project No.</td>
      <td style="padding:3px 6px;border:1px solid #c8e6c9;">${d.project_no||'—'}</td>
      <td style="padding:3px 6px;background:#eaf3ea;font-weight:700;color:#1a6b3a;border:1px solid #c8e6c9;">Project Name</td>
      <td style="padding:3px 6px;border:1px solid #c8e6c9;">${d.project_name||'—'}</td>
    </tr>
  </table>`

  // Signature block — 3 columns: Employee | DH | Accounts
  const faSigBlock = `
  <table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:10px;">
    <tr>
      <td style="width:33.33%;padding:0 10px;">
        <div style="height:44px;border-bottom:1.5px solid #1a6b3a;"></div>
        <div style="padding-top:4px;font-weight:700;color:#1a3a6b;font-size:10px;">Employee</div>
        <div style="font-size:9px;color:#555;margin-top:2px;">Name: ___________________________</div>
        <div style="font-size:9px;color:#555;margin-top:3px;">Date: ____________________________</div>
      </td>
      <td style="width:33.33%;padding:0 10px;">
        <div style="height:44px;border-bottom:1.5px solid #1a6b3a;"></div>
        <div style="padding-top:4px;font-weight:700;color:#1a3a6b;font-size:10px;">Department Head</div>
        <div style="font-size:9px;color:#555;margin-top:2px;">Name: ___________________________</div>
        <div style="font-size:9px;color:#555;margin-top:3px;">Date: ____________________________</div>
      </td>
      <td style="width:33.33%;padding:0 10px;">
        <div style="height:44px;border-bottom:1.5px solid #1a6b3a;"></div>
        <div style="padding-top:4px;font-weight:700;color:#1a3a6b;font-size:10px;">Accounts</div>
        <div style="font-size:9px;color:#555;margin-top:2px;">Name: ___________________________</div>
        <div style="font-size:9px;color:#555;margin-top:3px;">Date: ____________________________</div>
      </td>
    </tr>
  </table>`

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Food Allowance — ${d.employee_name||''} ${d.claim_number||''}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    ${CLAIM_CSS}
    @media print {
      .page { padding: 10mm 14mm 14mm !important; }
    }
  </style></head><body>
  <div class="page">

    <!-- Header: table so right edge aligns perfectly with table below -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:5px;">
      <tr>
        <td style="vertical-align:top;padding:0;">
          <div style="font-size:16px;font-weight:800;color:#1a3a6b;line-height:1.15;">Ratal Advanced Technologies</div>
          <div style="font-size:8px;color:#999;margin-top:1px;">Advanced Communication &amp; Computer Systems</div>
          <div style="margin-top:5px;font-size:13px;font-weight:800;color:#1a6b3a;letter-spacing:.5px;">FOOD ALLOWANCE CLAIM</div>
          <div style="font-size:11px;font-weight:700;color:#c0392b;margin-top:1px;">${d.employee_name||''} — ${d.department||''}</div>
          ${subRound>1 ? `<div style="font-size:9px;font-weight:800;color:#c0392b;margin-top:2px;">RESUBMISSION ${subRound-1}</div>` : ''}
        </td>
        <td style="vertical-align:top;text-align:right;width:104px;padding:0;">
          <img src="${qrSrc}" width="88" height="88" style="border:1.5px solid #bbb;border-radius:4px;padding:3px;display:block;margin-left:auto;" alt="QR"/>
          <div style="font-size:8px;color:#888;margin-top:3px;">${d.claim_number||''}</div>
        </td>
      </tr>
    </table>

    <div style="border-top:2px solid #1a6b3a;margin-bottom:6px;"></div>

    ${faInfoGrid}
    ${claimRejectionBlock(rejections, subRound)}

    <table style="width:100%;border-collapse:collapse;font-size:9.5px;table-layout:fixed;border:2.5px solid #0F6E56;">
      <colgroup>
        <col style="width:28px"/><col style="width:70px"/><col style="width:100px"/>
        <col/><col style="width:150px"/>
        <col style="width:54px"/><col style="width:76px"/>
      </colgroup>
      <thead>
        <tr style="background:#1a6b3a;">
          <th style="padding:5px 3px;color:#fff;border:1px solid #145432;text-align:center;font-size:9px;">S/N</th>
          <th style="padding:5px 4px;color:#fff;border:1px solid #145432;font-size:9px;">Date</th>
          <th style="padding:5px 4px;color:#fff;border:1px solid #145432;font-size:9px;">Job #</th>
          <th style="padding:5px 4px;color:#fff;border:1px solid #145432;font-size:9px;">Location</th>
          <th style="padding:5px 4px;color:#fff;border:1px solid #145432;font-size:9px;">Job Type</th>
          <th style="padding:5px 3px;color:#fff;border:1px solid #145432;text-align:center;font-size:9px;">Persons</th>
          <th style="padding:5px 4px;color:#fff;border:1px solid #145432;text-align:right;font-size:9px;">Amount (SAR)</th>
        </tr>
      </thead>
      <tbody>
        ${dataRows}
        <tr style="background:#1a6b3a;">
          <td colspan="6" style="padding:5px 8px;color:#fff;font-weight:800;border:1px solid #145432;font-size:9.5px;">Total Food Allowance</td>
          <td style="padding:5px 5px;color:#fff;font-weight:800;text-align:right;border:1px solid #145432;font-size:11px;">${fmtN(total)}</td>
        </tr>
        <tr>
          <td colspan="7" style="padding:5px 8px;border:1px solid #e0e0e0;font-size:9px;color:#444;font-style:italic;">
            <strong>Amount in Words:</strong> ${totalWords}
          </td>
        </tr>
      </tbody>
    </table>

    ${faSigBlock}

    <div class="page-footer">
      <span>Ratal Advanced Technologies — Food Allowance Claim</span>
      <span>${d.claim_number||''}</span>
      <span>Generated: ${fmtD(d.generated_date)}</span>
    </div>
  </div>
  </body></html>`
}

// ─── Template 3: Overtime Report ─────────────────────────────────────────────
function buildOvertimeReport(d) {
  const lines      = d.lines || []
  const rejections = d.rejections || []
  const subRound   = d.submission_round || 1
  const totalHrs   = lines.reduce((s,l) => s + (parseFloat(l.total_hours)||0), 0)
  const qrSrc      = claimQR(d, 'OVERTIME REPORT', `Total Hours:${totalHrs}`)

  const OT_COLS   = 8
  const otBlankC  = `<td style="height:19px;border:1px solid #ddd;"></td>`
  const otBlankN  = `<td style="height:19px;text-align:center;color:#ccc;border:1px solid #ddd;">`
  const dataRows  = Array.from({ length: 30 }, (_, i) => {
    const l    = lines[i]
    const even = i % 2 === 0
    if (l) return `
    <tr style="${even?'':'background:#f7f9fc;'}">
      <td style="text-align:center;border:1px solid #ddd;">${i+1}</td>
      <td style="border:1px solid #ddd;">${fmtD(l.date)}</td>
      <td style="border:1px solid #ddd;font-size:10px;">${l.job_no||'—'}</td>
      <td style="border:1px solid #ddd;">${l.job_type||'—'}</td>
      <td style="border:1px solid #ddd;">${l.work_type||'—'}</td>
      <td style="text-align:center;border:1px solid #ddd;">${l.start_time||'—'}</td>
      <td style="text-align:center;border:1px solid #ddd;">${l.end_time||'—'}</td>
      <td style="text-align:center;font-weight:700;border:1px solid #ddd;">${l.total_hours||0}</td>
    </tr>`
    return `
    <tr style="${even?'':'background:#fafbfc;'}">
      ${otBlankN}${i+1}</td>
      ${otBlankC.repeat(OT_COLS - 1)}
    </tr>`
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Overtime Report — ${d.employee_name||''} ${d.claim_number||''}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>${CLAIM_CSS}</style></head><body>
  <div class="page">

    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
      <div>
        <div style="font-size:18px;font-weight:800;color:#1a3a6b;line-height:1.1;">Ratal Advanced Technologies</div>
        <div style="font-size:9px;color:#888;margin-top:2px;">Advanced Communication &amp; Computer Systems</div>
        <div style="margin-top:8px;">
          <div style="font-size:15px;font-weight:800;color:#6b3a1a;">OVERTIME REPORT</div>
          <div style="font-size:12px;font-weight:700;color:#c0392b;">${d.employee_name||''} — ${d.department||''}</div>
        </div>
      </div>
      <div style="text-align:right;">
        <img src="${qrSrc}" width="100" height="100" style="border:1.5px solid #bbb;border-radius:4px;padding:3px;" alt="QR"/>
        <div style="font-size:8.5px;color:#888;margin-top:3px;">${d.claim_number||''}</div>
        ${subRound>1 ? `<div style="font-size:9px;font-weight:800;color:#c0392b;margin-top:2px;">RESUBMISSION ${subRound-1}</div>` : ''}
      </div>
    </div>

    <div style="border-top:2px solid #6b3a1a;margin-bottom:10px;"></div>

    <div style="display:flex;justify-content:space-between;font-size:10px;color:#555;margin-bottom:8px;">
      <span>Generated: ${fmtD(d.generated_date)}</span>
      <span>Ref: <strong>${d.claim_number||'—'}</strong></span>
    </div>

    ${claimInfoGrid(d)}
    ${claimRejectionBlock(rejections, subRound)}

    <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:10px;table-layout:fixed;border:2.5px solid #55300f;">
      <colgroup>
        <col style="width:28px"/><col style="width:68px"/><col style="width:110px"/>
        <col style="width:90px"/><col style="width:110px"/><col style="width:72px"/>
        <col style="width:72px"/><col style="width:72px"/>
      </colgroup>
      <thead>
        <tr style="background:#6b3a1a;">
          <th style="padding:6px 4px;color:#fff;border:1px solid #55300f;text-align:center;">S/N</th>
          <th style="padding:6px 4px;color:#fff;border:1px solid #55300f;">Date</th>
          <th style="padding:6px 4px;color:#fff;border:1px solid #55300f;">Job#</th>
          <th style="padding:6px 4px;color:#fff;border:1px solid #55300f;">Job Type</th>
          <th style="padding:6px 4px;color:#fff;border:1px solid #55300f;">Work Type</th>
          <th style="padding:6px 4px;color:#fff;border:1px solid #55300f;text-align:center;">Start</th>
          <th style="padding:6px 4px;color:#fff;border:1px solid #55300f;text-align:center;">End</th>
          <th style="padding:6px 4px;color:#fff;border:1px solid #55300f;text-align:center;">Hours</th>
        </tr>
      </thead>
      <tbody>
        ${dataRows}
        <tr style="background:#6b3a1a;">
          <td colspan="7" style="padding:6px 8px;color:#fff;font-weight:800;border:1px solid #55300f;">Total Overtime Hours</td>
          <td style="padding:6px 6px;color:#fff;font-weight:800;text-align:center;border:1px solid #55300f;font-size:14px;">${totalHrs}</td>
        </tr>
      </tbody>
    </table>

    ${claimSignatureBlock(subRound)}

    <div class="page-footer">
      <span>Ratal Advanced Technologies — Overtime Report</span>
      <span>${d.claim_number||''}</span>
      <span>Generated: ${fmtD(d.generated_date)}</span>
    </div>
  </div>
  </body></html>`
}

// ─── Cash Payment Voucher — Iqama + QR + informal party support ──────────────
function buildCashPaymentVoucher(d) {
  const fmtSAR = n => parseFloat(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
  const fmtD   = s => { if (!s) return '—'; const p=(s.split('T')[0]||'').split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s }

  // ── Build QR data string — scannable on any phone ────────────────────────
  const qrData = [
    `VOUCHER:${d.voucher_number||'CPV'}`,
    `DATE:${fmtD(d.payment_date)}`,
    `PAYEE:${d.payee_name||''}`,
    d.iqama_number  ? `IQAMA:${d.iqama_number}`    : null,
    d.vat_number    ? `VAT:${d.vat_number}`         : null,
    d.cr_number     ? `CR:${d.cr_number}`           : null,
    `AMOUNT:SAR ${fmtSAR(d.amount||0)}`,
    `METHOD:${d.payment_method||'CASH'}`,
    `PURPOSE:${(d.purpose||'').substring(0,80)}`,
    `ENTITY:${d.entity_name||'Ratal Advanced Technologies'}`,
    `APPROVED:${d.approved_by||''}`,
    `REF:${d.reference_number||d.voucher_number||''}`,
  ].filter(Boolean).join('\n')

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(qrData)}`

  // ── Party type config ────────────────────────────────────────────────────
  const partyType = d.party_type || 'INDIVIDUAL'  // COMPANY | INDIVIDUAL | INFORMAL
  const partyConfig = {
    COMPANY:    { label:'Registered Company', color:'#1565c0', bg:'#e3f2fd', idLabel:'VAT Reg. No', idValue: d.vat_number||'—', id2Label:'CR Number', id2Value: d.cr_number||'—' },
    INDIVIDUAL: { label:'Individual',         color:'#2e7d32', bg:'#e8f5e9', idLabel:'Iqama No',    idValue: d.iqama_number||'—', id2Label:'Mobile',    id2Value: d.payee_mobile||'—' },
    INFORMAL:   { label:'Informal Party',     color:'#e65100', bg:'#fff3e0', idLabel:'Iqama / ID',  idValue: d.iqama_number||d.vat_number||'Not Available', id2Label:'Mobile', id2Value: d.payee_mobile||'—' },
  }
  const pc = partyConfig[partyType] || partyConfig.INDIVIDUAL

  // ── Receipt type config ──────────────────────────────────────────────────
  const rcptType = d.receipt_type || 'INFORMAL'
  const rcptConfig = {
    VAT_INVOICE:      { label:'VAT Invoice',       color:'#2e7d32', bg:'#e8f5e9' },
    SIMPLIFIED:       { label:'Simplified Invoice',color:'#1565c0', bg:'#e3f2fd' },
    INFORMAL_RECEIPT: { label:'Informal Receipt',  color:'#e65100', bg:'#fff3e0' },
    NO_RECEIPT:       { label:'No Receipt',        color:'#b71c1c', bg:'#ffebee' },
  }
  const rc = rcptConfig[rcptType] || rcptConfig.INFORMAL_RECEIPT
  const needsJustification = rcptType === 'INFORMAL_RECEIPT' || rcptType === 'NO_RECEIPT' || partyType === 'INFORMAL'

  // ── Payment method labels ────────────────────────────────────────────────
  const methodLabels = { CASH:'Cash', BANK_TRANSFER:'Bank Transfer', CHEQUE:'Cheque', SADAD:'SADAD' }
  const methodLabel  = methodLabels[d.payment_method] || d.payment_method || 'Cash'

  // ── Iqama photo block (optional) ─────────────────────────────────────────
  const iqamaPhotoBlock = d.iqama_photo_url ? `
    <div style="margin-bottom:12px;">
      <div style="font-size:10px;font-weight:700;color:#1a2e3d;margin-bottom:5px;border-bottom:1px solid #e0e6ef;padding-bottom:4px;">🪪 IQAMA / ID COPY</div>
      <div style="text-align:center;background:#f5f7fa;border:1.5px dashed #c0cad8;border-radius:6px;padding:6px;">
        <img src="${d.iqama_photo_url}" style="max-width:100%;max-height:160px;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.1);" alt="Iqama Copy" onerror="this.style.display='none'"/>
      </div>
    </div>` : ''

  // ── Supporting document photo ─────────────────────────────────────────────
  const docPhotoBlock = d.document_url || d.photo_url ? `
    <div style="margin-bottom:12px;">
      <div style="font-size:10px;font-weight:700;color:#1a2e3d;margin-bottom:5px;border-bottom:1px solid #e0e6ef;padding-bottom:4px;">📄 SUPPORTING DOCUMENT / RECEIPT</div>
      <div style="text-align:center;background:#f5f7fa;border:1.5px dashed #c0cad8;border-radius:6px;padding:6px;">
        <img src="${d.document_url||d.photo_url}" style="max-width:100%;max-height:200px;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,.1);" alt="Receipt/Document" onerror="this.style.display='none';this.nextSibling.style.display='block'"/>
        <div style="display:none;font-size:10px;color:#aaa;padding:16px;">Document on file — Drive URL: ${d.document_url||d.photo_url}</div>
      </div>
    </div>` : `
    <div style="background:#fafafa;border:1.5px dashed #ddd;border-radius:6px;padding:14px;text-align:center;color:#bbb;font-size:10px;margin-bottom:12px;">
      📄 No supporting document attached
    </div>`

  // ── Justification box (red — for informal/no-receipt) ────────────────────
  const justificationBlock = needsJustification ? `
    <div style="background:#ffebee;border:2px solid #ef9a9a;border-radius:6px;padding:10px 14px;margin-bottom:12px;">
      <div style="font-weight:800;color:#b71c1c;font-size:11px;margin-bottom:4px;">
        ⚠️ NON-STANDARD PAYMENT — DH AUTHORISATION REQUIRED
      </div>
      <div style="font-size:10px;color:#c62828;margin-bottom:6px;">
        ${partyType==='INFORMAL'?'Payee has no formal VAT/CR registration. ':''}${rcptType==='NO_RECEIPT'?'No receipt provided. ':''}${rcptType==='INFORMAL_RECEIPT'?'Informal receipt only — not a tax invoice. ':''}
      </div>
      ${d.justification ? `
      <div style="background:#fff;border:1px solid #ef9a9a;border-radius:4px;padding:8px;font-size:10px;color:#1a2e3d;">
        <strong>DH Justification:</strong> ${d.justification}
      </div>` : `
      <div style="background:#fff;border:1px dashed #ef9a9a;border-radius:4px;padding:8px;font-size:10px;color:#9e9e9e;font-style:italic;">
        DH justification to be written here: _______________________________________________
        ___________________________________________________________________________________
      </div>`}
    </div>` : ''

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Cash Payment Voucher — ${d.voucher_number||''}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Poppins',Arial,sans-serif;background:#fff;font-size:11px;color:#1a2e3d;}
    .page{width:794px;min-height:1123px;margin:0 auto;padding:36px 48px 65px;position:relative;background:#fff;}
    .cpv-header{background:linear-gradient(135deg,#212121 0%,#37474f 100%);color:#fff;padding:14px 20px;border-radius:8px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-start;}
    .cpv-number{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.25);border-radius:5px;padding:4px 12px;font-size:13px;font-weight:800;letter-spacing:.5px;margin-top:6px;display:inline-block;}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px 20px;margin-bottom:10px;}
    .info-row{display:flex;gap:6px;font-size:10px;}
    .info-label{color:#7a8a9a;font-weight:600;min-width:100px;}
    .info-val{color:#1a2e3d;font-weight:700;}
    .party-box{border:2px solid ${pc.color};border-radius:8px;padding:10px 14px;margin-bottom:12px;background:${pc.bg};}
    .party-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;}
    .party-type-badge{background:${pc.color};color:#fff;font-size:9px;font-weight:800;padding:2px 10px;border-radius:20px;text-transform:uppercase;}
    .party-name{font-size:14px;font-weight:800;color:#1a2e3d;}
    .iqama-highlight{background:#1a2e3d;color:#fff;padding:4px 12px;border-radius:5px;font-size:12px;font-weight:800;letter-spacing:1px;display:inline-block;margin-top:4px;}
    .amount-box{background:#f0f4ff;border:2px solid #c5d0e6;border-radius:8px;padding:12px 16px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;}
    .amount-main{font-size:22px;font-weight:800;color:#1a2e3d;}
    .amount-words{font-size:9.5px;color:#555;font-style:italic;margin-top:3px;}
    .method-badge{background:#37474f;color:#fff;padding:5px 14px;border-radius:6px;font-size:11px;font-weight:700;}
    .purpose-box{background:#f7f9fc;border-left:3px solid #37474f;padding:8px 12px;margin-bottom:12px;font-size:10px;color:#1a2e3d;}
    .receipt-badge{display:inline-flex;align-items:center;gap:5px;background:${rc.bg};color:${rc.color};border:1.5px solid ${rc.color};border-radius:5px;padding:3px 10px;font-size:10px;font-weight:700;margin-bottom:10px;}
    .sig-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:18px;}
    .sig-box{border-top:1.5px solid #555;padding-top:6px;text-align:center;font-size:9.5px;color:#555;}
    .sig-iqama{font-size:9px;color:#1565c0;font-weight:700;margin-top:3px;letter-spacing:.3px;}
    .page-footer{position:absolute;bottom:0;left:0;right:0;border-top:1px solid #ddd;padding:6px 48px;font-size:9px;color:#888;display:flex;justify-content:space-between;}
    .qr-scan-note{font-size:8px;color:#fff;opacity:.7;text-align:center;margin-top:3px;}
    @media print{body{background:#fff;}.page{width:100%;min-height:297mm;padding:15mm 18mm 20mm;}@page{size:A4;margin:0;}}
  </style></head><body>
  <div class="page">

    <!-- ── HEADER ───────────────────────────────────────────────────────── -->
    <div class="cpv-header">
      <div style="flex:1;">
        <div style="font-size:10px;opacity:.7;text-transform:uppercase;letter-spacing:1px;">${d.entity_name||'Ratal Advanced Technologies'}</div>
        <div style="font-size:20px;font-weight:800;margin:4px 0 2px;">CASH PAYMENT VOUCHER</div>
        <div style="font-size:9px;opacity:.7;">Advanced Communication &amp; Computer Systems</div>
        <div class="cpv-number">${d.voucher_number||'CPV-—'}</div>
      </div>
      <div style="text-align:right;margin-left:16px;">
        <img src="${qrSrc}" width="110" height="110"
          style="border:2px solid rgba(255,255,255,.35);border-radius:6px;padding:3px;background:#fff;"
          alt="Scan to verify"/>
        <div class="qr-scan-note">📱 Scan to verify payment</div>
      </div>
    </div>

    <!-- ── VOUCHER META ──────────────────────────────────────────────────── -->
    <div class="info-grid" style="background:#f7f9fc;border:1px solid #e0e6ef;border-radius:6px;padding:8px 14px;margin-bottom:12px;">
      <div class="info-row"><span class="info-label">Voucher Date:</span><span class="info-val">${fmtD(d.payment_date)}</span></div>
      <div class="info-row"><span class="info-label">Voucher No:</span><span class="info-val">${d.voucher_number||'—'}</span></div>
      <div class="info-row"><span class="info-label">Project / Job:</span><span class="info-val">${d.project_no||d.job_no||'—'} ${d.project_name?'— '+d.project_name:''}</span></div>
      <div class="info-row"><span class="info-label">Department:</span><span class="info-val">${d.department||'—'}</span></div>
      <div class="info-row"><span class="info-label">Paid By:</span><span class="info-val">${d.paid_by||d.prepared_by||'—'}</span></div>
      <div class="info-row"><span class="info-label">Approved By:</span><span class="info-val">${d.approved_by||'—'}</span></div>
    </div>

    <!-- ── PAYEE / PARTY ─────────────────────────────────────────────────── -->
    <div class="party-box">
      <div class="party-header">
        <div style="font-size:9.5px;font-weight:700;color:${pc.color};text-transform:uppercase;">Payment To / المستفيد</div>
        <span class="party-type-badge">${pc.label}</span>
      </div>
      <div class="party-name">${d.payee_name||'—'}</div>
      <div style="display:flex;gap:20px;margin-top:6px;flex-wrap:wrap;">
        <div>
          <div style="font-size:9px;color:#7a8a9a;font-weight:600;">${pc.idLabel}</div>
          <div class="iqama-highlight">${pc.idValue}</div>
        </div>
        <div>
          <div style="font-size:9px;color:#7a8a9a;font-weight:600;margin-top:0;">${pc.id2Label}</div>
          <div style="font-size:11px;font-weight:700;color:#1a2e3d;margin-top:4px;">${pc.id2Value}</div>
        </div>
        ${d.payee_bank_name || d.iban ? `
        <div>
          <div style="font-size:9px;color:#7a8a9a;font-weight:600;">IBAN / Bank</div>
          <div style="font-size:10px;font-weight:700;color:#1a2e3d;margin-top:4px;">${d.iban||'—'} ${d.payee_bank_name?'('+d.payee_bank_name+')':''}</div>
        </div>` : ''}
      </div>
    </div>

    <!-- ── AMOUNT + METHOD ───────────────────────────────────────────────── -->
    <div class="amount-box">
      <div>
        <div style="font-size:9px;color:#7a8a9a;font-weight:600;text-transform:uppercase;margin-bottom:2px;">Amount Paid</div>
        <div class="amount-main">SAR ${fmtSAR(d.amount||0)}</div>
        <div class="amount-words">${numToWordsEn(parseFloat(d.amount||0))}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:9px;color:#7a8a9a;font-weight:600;margin-bottom:4px;">Payment Method</div>
        <div class="method-badge">${methodLabel}</div>
        ${d.reference_number?`<div style="font-size:9px;color:#7a8a9a;margin-top:4px;">Ref: ${d.reference_number}</div>`:''}
        ${d.account_code?`<div style="font-size:9px;color:#7a8a9a;">A/C: ${d.account_code}</div>`:''}
      </div>
    </div>

    <!-- ── PURPOSE / DESCRIPTION ─────────────────────────────────────────── -->
    <div class="purpose-box">
      <div style="font-weight:700;margin-bottom:3px;font-size:10px;">Purpose / سبب الدفع</div>
      <div style="line-height:1.5;">${d.purpose||d.work_description||'—'}</div>
      ${d.notes?`<div style="margin-top:4px;color:#555;font-style:italic;">${d.notes}</div>`:''}
    </div>

    <!-- ── RECEIPT TYPE BADGE ─────────────────────────────────────────────── -->
    <div style="margin-bottom:10px;">
      <span style="font-size:9.5px;color:#7a8a9a;font-weight:600;margin-right:8px;">Receipt Type:</span>
      <span class="receipt-badge">${rc.label}</span>
    </div>

    <!-- ── JUSTIFICATION (if informal / no receipt) ──────────────────────── -->
    ${justificationBlock}

    <!-- ── IQAMA COPY (if uploaded) ──────────────────────────────────────── -->
    ${iqamaPhotoBlock}

    <!-- ── SUPPORTING DOCUMENT ──────────────────────────────────────────── -->
    ${docPhotoBlock}

    <!-- ── SIGNATURES ────────────────────────────────────────────────────── -->
    <div class="sig-grid">
      <div class="sig-box">
        <div style="height:38px;"></div>
        <div style="font-weight:700;">${d.paid_by||d.prepared_by||'Cashier / Finance'}</div>
        <div>Paid By</div>
        <div style="color:#888;font-size:9px;margin-top:2px;">${fmtD(d.payment_date)}</div>
      </div>
      <div class="sig-box">
        <div style="height:38px;"></div>
        <div style="font-weight:700;">${d.approved_by||'Department Head'}</div>
        <div>Approved By</div>
        <div style="color:#888;font-size:9px;margin-top:2px;">${fmtD(d.payment_date)}</div>
      </div>
      <div class="sig-box">
        <div style="height:38px;"></div>
        <div style="font-weight:700;">${d.payee_name||'Payee / المستلم'}</div>
        <div>Received By (Signature)</div>
        ${d.iqama_number?`<div class="sig-iqama">Iqama: ${d.iqama_number}</div>`:''}
        ${d.vat_number&&partyType==='COMPANY'?`<div class="sig-iqama">VAT: ${d.vat_number}</div>`:''}
      </div>
    </div>

    <div class="page-footer">
      <span>${d.entity_name||'Ratal Advanced Technologies'} — Cash Payment Voucher</span>
      <span>${d.voucher_number||''}</span>
      <span>${fmtD(d.payment_date)}</span>
    </div>
  </div></body></html>`
}

// ─── SubCon Payment Certificate ──────────────────────────────────────────────
function buildSubConCert(d) {
  const fmtSAR  = n => parseFloat(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
  const fmtD    = s => { if (!s) return '—'; const p=s.split('T')[0].split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s }
  const milestones = Array.isArray(d.milestones_done) ? d.milestones_done : []
  const materials  = Array.isArray(d.materials_used)  ? d.materials_used  : []
  const claimAmt  = parseFloat(d.claim_amount||0)
  const vatPct    = parseFloat(d.vat_pct||15)
  const vatAmt    = parseFloat(d.vat_amount || claimAmt*(vatPct/100))
  const totalAmt  = parseFloat(d.total_amount || claimAmt + vatAmt)
  const claimTypeLabel = d.claim_type==='HOURLY'?'Hourly Rate':d.claim_type==='MILESTONE'?'Milestone-Based':'Lump Sum'
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(d.claim_number||'CERT')}`

  const milestoneRows = milestones.length
    ? milestones.map((m,i) => `<tr style="background:${i%2?'#f9f9f9':'#fff'}"><td style="padding:5px 8px;border:1px solid #ddd;">${i+1}</td><td style="padding:5px 8px;border:1px solid #ddd;">${m}</td><td style="padding:5px 8px;text-align:center;border:1px solid #ddd;color:#2e7d32;font-weight:700;">✓ Done</td></tr>`).join('')
    : '<tr><td colspan="3" style="padding:8px;text-align:center;color:#aaa;border:1px solid #ddd;">No milestones specified</td></tr>'

  const materialRows = materials.length
    ? materials.map((m,i) => `<tr style="background:${i%2?'#f9f9f9':'#fff'}"><td style="padding:5px 8px;border:1px solid #ddd;">${m.item||'—'}</td><td style="text-align:center;padding:5px 8px;border:1px solid #ddd;">${m.qty||0}</td><td style="text-align:center;padding:5px 8px;border:1px solid #ddd;">${m.unit_cost?fmtSAR(m.unit_cost):'—'}</td><td style="text-align:right;padding:5px 8px;border:1px solid #ddd;">${fmtSAR(m.total||0)}</td></tr>`).join('')
    : ''

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>SubCon Payment Certificate — ${d.claim_number||''}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Poppins',Arial,sans-serif;background:#fff;font-size:11px;color:#1a2e3d;}
    .page{width:794px;min-height:1123px;margin:0 auto;padding:36px 48px 65px;position:relative;background:#fff;}
    .cert-banner{background:linear-gradient(135deg,#1a2e5a 0%,#0e7c61 100%);color:#fff;padding:14px 20px;border-radius:8px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;}
    .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;margin-bottom:12px;}
    .info-row{display:flex;gap:6px;font-size:10px;}
    .info-label{color:#7a8a9a;font-weight:600;min-width:110px;}
    .info-val{color:#1a2e3d;font-weight:700;}
    .section-title{font-size:11px;font-weight:800;color:#fff;background:#1a2e5a;padding:5px 10px;margin:10px 0 4px;border-radius:4px;}
    .amount-box{background:#f0f4ff;border:1.5px solid #c5d0e6;border-radius:6px;padding:10px 14px;margin:10px 0;}
    .amount-row{display:flex;justify-content:space-between;padding:3px 0;font-size:11px;}
    .amount-total{font-size:14px;font-weight:800;color:#1a2e5a;border-top:2px solid #1a2e5a;padding-top:6px;margin-top:4px;display:flex;justify-content:space-between;}
    .sig-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:20px;}
    .sig-box{border-top:1.5px solid #555;padding-top:6px;text-align:center;font-size:9.5px;color:#555;}
    .page-footer{position:absolute;bottom:0;left:0;right:0;border-top:1px solid #ddd;padding:6px 48px;font-size:9px;color:#888;display:flex;justify-content:space-between;}
    @media print{body{background:#fff;}.page{width:100%;min-height:297mm;padding:15mm 18mm 20mm;}@page{size:A4;margin:0;}}
  </style></head><body>
  <div class="page">

    <div class="cert-banner">
      <div>
        <div style="font-size:16px;font-weight:800;letter-spacing:.5px;">SUB-CONTRACTOR PAYMENT CERTIFICATE</div>
        <div style="font-size:10px;opacity:.85;margin-top:3px;">${d.entity_name||'Ratal Advanced Technologies'} — Advanced Communication &amp; Computer Systems</div>
      </div>
      <div style="text-align:right;">
        <img src="${qrSrc}" width="80" height="80" style="border:2px solid rgba(255,255,255,.4);border-radius:4px;padding:2px;" alt="QR"/>
        <div style="font-size:9px;margin-top:3px;opacity:.85;">${d.claim_number||''}</div>
      </div>
    </div>

    <div class="info-grid">
      <div class="info-row"><span class="info-label">Certificate No:</span><span class="info-val">${d.claim_number||'—'}</span></div>
      <div class="info-row"><span class="info-label">Certificate Date:</span><span class="info-val">${fmtD(d.claim_date||d.submitted_at)}</span></div>
      <div class="info-row"><span class="info-label">Contractor:</span><span class="info-val">${d.contractor_name||'—'}</span></div>
      <div class="info-row"><span class="info-label">VAT Reg. No:</span><span class="info-val">${d.contractor_vat||'—'}</span></div>
      <div class="info-row"><span class="info-label">Site Name:</span><span class="info-val">${d.site_name||'—'}</span></div>
      <div class="info-row"><span class="info-label">Site No:</span><span class="info-val">${d.site_number||'—'}</span></div>
      <div class="info-row"><span class="info-label">Scope Type:</span><span class="info-val">${(d.scope_type||'—').replace(/_/g,' ')}</span></div>
      <div class="info-row"><span class="info-label">Claim Type:</span><span class="info-val">${claimTypeLabel}</span></div>
      <div class="info-row"><span class="info-label">Claim Period:</span><span class="info-val">${d.claim_month||'—'} / ${d.claim_year||'—'}</span></div>
      <div class="info-row"><span class="info-label">Submitted By:</span><span class="info-val">${d.employee_name||'—'}</span></div>
    </div>

    ${d.work_description ? `<div style="background:#f7f9fc;border-left:3px solid #0e7c61;padding:8px 12px;margin-bottom:10px;font-size:10px;color:#1a2e3d;"><strong>Work Description:</strong> ${d.work_description}</div>` : ''}

    ${milestones.length ? `
    <div class="section-title">Completed Milestones</div>
    <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:8px;">
      <thead><tr style="background:#0e7c61;color:#fff;"><th style="padding:6px 8px;border:1px solid #0a6050;width:36px;">S/N</th><th style="padding:6px 8px;border:1px solid #0a6050;text-align:left;">Milestone Description</th><th style="padding:6px 8px;border:1px solid #0a6050;width:80px;">Status</th></tr></thead>
      <tbody>${milestoneRows}</tbody>
    </table>` : ''}

    ${d.claim_type==='HOURLY' ? `
    <div class="section-title">Hourly Breakdown</div>
    <div class="info-grid" style="margin-bottom:10px;">
      <div class="info-row"><span class="info-label">Hours Worked:</span><span class="info-val">${d.hours_worked||0} hrs</span></div>
      <div class="info-row"><span class="info-label">Hourly Rate:</span><span class="info-val">SAR ${fmtSAR(d.hourly_rate||0)} / hr</span></div>
    </div>` : ''}

    ${materials.length ? `
    <div class="section-title">Materials Used</div>
    <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:8px;">
      <thead><tr style="background:#1a2e5a;color:#fff;"><th style="padding:5px 8px;border:1px solid #0f1f40;text-align:left;">Item</th><th style="padding:5px 8px;border:1px solid #0f1f40;width:55px;text-align:center;">Qty</th><th style="padding:5px 8px;border:1px solid #0f1f40;width:80px;text-align:center;">Unit Cost</th><th style="padding:5px 8px;border:1px solid #0f1f40;width:85px;text-align:right;">Total SAR</th></tr></thead>
      <tbody>${materialRows}</tbody>
    </table>` : ''}

    <div class="amount-box">
      <div class="amount-row"><span>Claim Amount (Excl. VAT)</span><span>SAR ${fmtSAR(claimAmt)}</span></div>
      <div class="amount-row"><span>VAT (${vatPct}%)</span><span>SAR ${fmtSAR(vatAmt)}</span></div>
      <div class="amount-total"><span>Total Payable</span><span>SAR ${fmtSAR(totalAmt)}</span></div>
    </div>

    ${d.notes ? `<div style="background:#fffde7;border:1px solid #f9c74f;border-radius:5px;padding:8px 12px;font-size:10px;margin-bottom:10px;"><strong>Notes:</strong> ${d.notes}</div>` : ''}

    <div class="sig-grid">
      <div class="sig-box"><div style="height:36px;"></div><div style="font-weight:700;">${d.employee_name||'Sub-Contractor'}</div><div>Submitted By</div></div>
      <div class="sig-box"><div style="height:36px;"></div><div style="font-weight:700;">${d.approved_by||'Department Head'}</div><div>Approved By</div></div>
      <div class="sig-box"><div style="height:36px;"></div><div style="font-weight:700;">Finance / Accounts</div><div>Processed By</div></div>
    </div>

    <div class="page-footer">
      <span>${d.entity_name||'Ratal Advanced Technologies'} — SubCon Payment Certificate</span>
      <span>${d.claim_number||''}</span>
      <span>Date: ${fmtD(d.claim_date||d.submitted_at)}</span>
    </div>
  </div></body></html>`
}

// ─── Expense Record Voucher — with photo + late-submission callout ────────────
function buildExpenseVoucher(d) {
  const fmtSAR = n => parseFloat(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
  const fmtD   = s => { if (!s) return '—'; const p=s.split('T')[0].split('-'); return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:s }

  const expDate  = d.date || d.expense_date || ''
  const invDate  = d.invoice_date || ''
  const subDate  = d.submitted_at ? (d.submitted_at).split('T')[0] : expDate
  const qrData   = `REF:${d.record_number||d.expense_id||'EXP'} EMP:${d.employee_name||''} PRJ:${d.project_no||''} AMT:${d.total||d.total_amount||''} DATE:${expDate}`
  const qrSrc    = `https://api.qrserver.com/v1/create-qr-code/?size=85x85&data=${encodeURIComponent(qrData)}`

  const photoBlock = d.photo_url ? `
    <div style="margin-bottom:0;">
      <div style="font-size:9.5px;font-weight:700;color:#5a6a7a;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;padding-bottom:4px;border-bottom:1px solid #e8edf2;">Receipt / Invoice Photo — Cross-Verification</div>
      <div style="text-align:center;background:#f5f7fa;border:1px solid #d0d8e4;border-radius:6px;padding:10px;min-height:220px;display:flex;align-items:center;justify-content:center;">
        <img src="${d.photo_url}" style="max-width:100%;max-height:380px;border-radius:4px;box-shadow:0 2px 12px rgba(0,0,0,.15);display:block;" alt="Receipt Photo"
          onerror="this.style.display='none';this.nextSibling.style.display='flex'"/>
        <div style="display:none;flex-direction:column;align-items:center;gap:6px;color:#aab;font-size:10px;padding:20px;">
          <div style="font-size:28px;">📷</div>
          <div>Photo stored on Drive — open via link to view</div>
          <div style="font-size:9px;word-break:break-all;color:#bbc;">${d.photo_url}</div>
        </div>
      </div>
      <div style="font-size:9px;color:#8a9ab0;text-align:center;margin-top:5px;">Photo submitted via mobile field form on ${fmtD(subDate)}</div>
    </div>` : `
    <div style="background:#f8f9fa;border:1.5px dashed #d0d8e4;border-radius:6px;padding:32px 20px;text-align:center;color:#b0bec5;">
      <div style="font-size:28px;margin-bottom:6px;">📷</div>
      <div style="font-size:10px;font-weight:600;">No receipt photo attached to this record</div>
      <div style="font-size:9px;margin-top:3px;">Employee should attach photo when submitting via mobile form</div>
    </div>`

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Expense Record — ${d.record_number||d.expense_id||''}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Poppins',Arial,sans-serif;background:#fff;font-size:11px;color:#1a2e3d;}
    .page{width:794px;min-height:1123px;margin:0 auto;padding:28px 40px 60px;position:relative;background:#fff;}
    .hdr{background:#1a2e3d;color:#fff;padding:14px 18px 14px 20px;border-radius:8px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;}
    .hdr-title{font-size:15px;font-weight:800;letter-spacing:.5px;}
    .hdr-sub{font-size:9.5px;opacity:.7;margin-top:3px;}
    .top-strip{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:0;background:#f0f4f8;border:1px solid #d8e2ee;border-radius:7px;margin-bottom:14px;overflow:hidden;}
    .ts-cell{padding:9px 14px;border-right:1px solid #d8e2ee;}
    .ts-cell:last-child{border-right:none;}
    .ts-label{font-size:8.5px;font-weight:700;color:#7a8a9a;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px;}
    .ts-val{font-size:12px;font-weight:700;color:#1a2e3d;}
    .detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #d8e2ee;border-radius:7px;overflow:hidden;margin-bottom:14px;}
    .dg-row{display:contents;}
    .dg-label{padding:7px 14px;font-size:9.5px;font-weight:600;color:#7a8a9a;background:#f7f9fc;border-bottom:1px solid #edf0f5;}
    .dg-val{padding:7px 14px;font-size:10px;font-weight:600;color:#1a2e3d;background:#fff;border-bottom:1px solid #edf0f5;}
    .dg-label:nth-last-child(2),.dg-val:nth-last-child(1){border-bottom:none;}
    .dates-bar{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px;}
    .date-chip{background:#f7f9fc;border:1px solid #d8e2ee;border-radius:6px;padding:8px 12px;text-align:center;}
    .date-chip-label{font-size:8.5px;color:#7a8a9a;font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px;}
    .date-chip-val{font-size:11px;font-weight:700;color:#1a2e3d;}
    .amount-box{background:#e8f5e9;border:1px solid #a5d6a7;border-radius:7px;padding:10px 14px;margin-bottom:14px;}
    .amt-row{display:flex;justify-content:space-between;padding:3px 0;font-size:10.5px;}
    .amt-total{display:flex;justify-content:space-between;border-top:1.5px solid #388e3c;padding-top:7px;margin-top:5px;font-size:14px;font-weight:800;color:#2e7d32;}
    .sig-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:18px;}
    .sig-box{border-top:1.5px solid #555;padding-top:6px;text-align:center;font-size:9.5px;color:#555;}
    .page-footer{position:absolute;bottom:0;left:0;right:0;border-top:1px solid #e0e6ef;padding:6px 40px;font-size:8.5px;color:#8a9ab0;display:flex;justify-content:space-between;}
    @media print{body{background:#fff;}.page{width:100%;min-height:297mm;padding:12mm 15mm 18mm;}@page{size:A4;margin:0;}}
  </style></head><body>
  <div class="page">

    <!-- Header -->
    <div class="hdr">
      <div>
        <div class="hdr-title">EXPENSE RECORD VOUCHER</div>
        <div class="hdr-sub">${d.entity_name||'Ratal Advanced Technologies'} &nbsp;·&nbsp; ${d.record_number||d.expense_id||''}</div>
      </div>
      <img src="${qrSrc}" width="70" height="70" style="border:2px solid rgba(255,255,255,.25);border-radius:5px;padding:2px;" alt="QR"/>
    </div>

    <!-- Top 4 key fields -->
    <div class="top-strip">
      <div class="ts-cell">
        <div class="ts-label">Employee Name</div>
        <div class="ts-val">${d.employee_name||'—'}</div>
      </div>
      <div class="ts-cell">
        <div class="ts-label">Project No.</div>
        <div class="ts-val">${d.project_no||d.job_no||'—'}</div>
      </div>
      <div class="ts-cell">
        <div class="ts-label">Date of Submission</div>
        <div class="ts-val">${fmtD(subDate)}</div>
      </div>
      <div class="ts-cell">
        <div class="ts-label">Site No / Job #</div>
        <div class="ts-val">${d.site_no||d.job_no||d.project_no||'—'}</div>
      </div>
    </div>

    <!-- Expense details -->
    <div class="detail-grid">
      <div class="dg-label">Project Name</div><div class="dg-val">${d.project_name||'—'}</div>
      <div class="dg-label">Department</div><div class="dg-val">${d.department||'—'}</div>
      <div class="dg-label">Vendor / Supplier</div><div class="dg-val">${d.vendor||d.vendor_name||'—'}</div>
      <div class="dg-label">Invoice Number</div><div class="dg-val">${d.invoice_number||'—'}</div>
      <div class="dg-label">Vendor VAT Number</div><div class="dg-val">${d.vat_number||'—'}</div>
      <div class="dg-label">Expense Category</div><div class="dg-val">${d.category||'—'}</div>
    </div>

    <!-- Dates — side by side for cross-check, no alarm styling -->
    <div class="dates-bar">
      <div class="date-chip">
        <div class="date-chip-label">Invoice Date</div>
        <div class="date-chip-val">${fmtD(invDate)||'—'}</div>
      </div>
      <div class="date-chip">
        <div class="date-chip-label">Expense Recorded</div>
        <div class="date-chip-val">${fmtD(expDate)||'—'}</div>
      </div>
      <div class="date-chip">
        <div class="date-chip-label">Submitted On</div>
        <div class="date-chip-val">${fmtD(subDate)||'—'}</div>
      </div>
    </div>

    <!-- Receipt Photo — centrepiece -->
    ${photoBlock}

    <!-- Amounts -->
    <div class="amount-box" style="margin-top:14px;">
      <div class="amt-row"><span>Net Amount (Excl. VAT)</span><span>SAR ${fmtSAR(d.net_amount||d.amount||0)}</span></div>
      <div class="amt-row"><span>VAT Amount (15%)</span><span>SAR ${fmtSAR(d.vat_amount||0)}</span></div>
      <div class="amt-total"><span>Total (Incl. VAT)</span><span>SAR ${fmtSAR(d.total||d.total_amount||(parseFloat(d.net_amount||0)+parseFloat(d.vat_amount||0)))}</span></div>
    </div>

    ${d.notes ? `<div style="background:#f7f9fc;border:1px solid #d8e2ee;border-radius:5px;padding:7px 12px;font-size:10px;margin-bottom:10px;"><strong style="color:#5a6a7a;">Notes:</strong> ${d.notes}</div>` : ''}

    <!-- Signatures -->
    <div class="sig-grid">
      <div class="sig-box"><div style="height:36px;"></div><div style="font-weight:700;">${d.employee_name||'Employee'}</div><div>Submitted By</div></div>
      <div class="sig-box"><div style="height:36px;"></div><div style="font-weight:700;">${d.dh_name||'Department Head'}</div><div>Approved By (DH)</div></div>
      <div class="sig-box"><div style="height:36px;"></div><div style="font-weight:700;">Finance / Accounts</div><div>Verified By</div></div>
    </div>

    <div class="page-footer">
      <span>${d.entity_name||'Ratal Advanced Technologies'} — Expense Record Voucher</span>
      <span>${d.record_number||d.expense_id||''}</span>
      <span>${fmtD(subDate)}</span>
    </div>
  </div></body></html>`
}

// ─── ACCSYS Tax Invoice — Bilingual ──────────────────────────────────────────
function buildInvoiceACCSYS(d) {
  const fmtSAR = n => parseFloat(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
  const lines  = Array.isArray(d.lines) ? d.lines : []
  const qrSrc  = `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(d.invoice_number||'INV')}`
  const isAR   = !!(d.language === 'BILINGUAL' || d.show_arabic)

  const lineRows = lines.map((l,i) => `
    <tr style="background:${i%2?'#f7f9fc':'#fff'}">
      <td style="padding:6px 8px;border:1px solid #d0d8e8;">${l.description||l.item_description||'—'}</td>
      <td style="text-align:center;padding:6px 8px;border:1px solid #d0d8e8;">${l.qty||l.quantity||1}</td>
      <td style="text-align:center;padding:6px 8px;border:1px solid #d0d8e8;">${l.unit||'LS'}</td>
      <td style="text-align:right;padding:6px 8px;border:1px solid #d0d8e8;">SAR ${fmtSAR(l.unit_price||l.rate||0)}</td>
      <td style="text-align:right;padding:6px 8px;border:1px solid #d0d8e8;">SAR ${fmtSAR(l.total||l.amount||(parseFloat(l.qty||1)*parseFloat(l.unit_price||0)))}</td>
    </tr>`).join('')

  const netAmt  = parseFloat(d.total_net||d.net_amount||0)
  const vatAmt  = parseFloat(d.vat_amount||netAmt*0.15)
  const totAmt  = parseFloat(d.total_incl_vat||d.total||netAmt+vatAmt)
  const words   = numToWordsEn(totAmt)

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Tax Invoice — ${d.invoice_number||''}</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:'Poppins',Arial,sans-serif;background:#fff;font-size:11px;color:#1a2e3d;}
    .page{width:794px;min-height:1123px;margin:0 auto;padding:36px 48px 65px;position:relative;background:#fff;}
    .inv-header{background:linear-gradient(135deg,#0a1a3a 0%,#1a3a6b 100%);color:#fff;padding:16px 22px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;margin-bottom:0;}
    .party-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1.5px solid #d0d8e8;border-top:none;border-radius:0 0 8px 8px;overflow:hidden;margin-bottom:14px;}
    .party-box{padding:10px 14px;border-right:1px solid #d0d8e8;}
    .party-box:last-child{border-right:none;}
    .party-label{font-size:9px;font-weight:700;color:#7a8a9a;text-transform:uppercase;margin-bottom:4px;}
    .party-name{font-size:12px;font-weight:800;color:#1a2e3d;}
    .party-detail{font-size:9.5px;color:#555;margin-top:2px;line-height:1.5;}
    .meta-strip{display:flex;gap:0;background:#f0f4ff;border:1.5px solid #d0d8e8;border-radius:6px;overflow:hidden;margin-bottom:12px;}
    .meta-cell{flex:1;padding:6px 12px;border-right:1px solid #d0d8e8;text-align:center;}
    .meta-cell:last-child{border-right:none;}
    .meta-key{font-size:8.5px;color:#7a8a9a;font-weight:600;text-transform:uppercase;}
    .meta-val{font-size:11px;font-weight:800;color:#1a2e3d;margin-top:2px;}
    .vatice-badge{background:#e8f5e9;color:#2e7d32;font-size:9px;font-weight:800;padding:2px 8px;border-radius:4px;border:1px solid #a5d6a7;display:inline-block;}
    .amount-section{margin-top:10px;}
    .amount-row{display:flex;justify-content:space-between;padding:4px 14px;font-size:11px;}
    .amount-total{display:flex;justify-content:space-between;padding:7px 14px;font-size:14px;font-weight:800;color:#fff;background:#0a1a3a;border-radius:0 0 6px 6px;}
    .words-line{font-size:9.5px;color:#555;padding:6px 14px;background:#f7f9fc;border:1px solid #d0d8e8;border-top:none;font-style:italic;}
    .page-footer{position:absolute;bottom:0;left:0;right:0;border-top:1px solid #ddd;padding:6px 48px;font-size:9px;color:#888;display:flex;justify-content:space-between;}
    @media print{body{background:#fff;}.page{width:100%;min-height:297mm;padding:15mm 18mm 20mm;}@page{size:A4;margin:0;}}
  </style></head><body>
  <div class="page">

    <div class="inv-header">
      <div>
        <div style="font-size:10px;opacity:.7;text-transform:uppercase;letter-spacing:1px;">Ratal Advanced Technologies</div>
        <div style="font-size:20px;font-weight:800;letter-spacing:.5px;margin:4px 0;">TAX INVOICE${isAR?`<span dir="rtl" style="margin-right:16px;font-size:15px;opacity:.9;"> / فاتورة ضريبية</span>`:'  '}</div>
        <div style="font-size:9px;opacity:.7;">VAT Registration: ${d.entity_vat||'310680651700003'}</div>
      </div>
      <div style="text-align:right;">
        <img src="${qrSrc}" width="90" height="90" style="border:2px solid rgba(255,255,255,.3);border-radius:4px;padding:2px;" alt="ZATCA QR"/>
        <div style="font-size:8px;margin-top:3px;opacity:.75;">ZATCA e-Invoice QR</div>
      </div>
    </div>

    <div class="party-grid">
      <div class="party-box" style="background:#fafbff;">
        <div class="party-label">Issuer / المورد</div>
        <div class="party-name">${d.entity_name||'Ratal Advanced Technologies'}</div>
        <div class="party-detail">${d.entity_address||'Building 4812, Aghadeer Street, Malaz, Riyadh'}<br/>VAT: ${d.entity_vat||'310680651700003'}</div>
      </div>
      <div class="party-box">
        <div class="party-label">Customer / العميل</div>
        <div class="party-name">${d.client_name||'—'}</div>
        <div class="party-detail">${d.client_address||''} ${d.client_address&&d.client_vat?'<br/>':''} ${d.client_vat?`VAT: ${d.client_vat}`:''}</div>
      </div>
    </div>

    <div class="meta-strip">
      <div class="meta-cell"><div class="meta-key">Invoice No</div><div class="meta-val">${d.invoice_number||'—'}</div></div>
      <div class="meta-cell"><div class="meta-key">Invoice Date</div><div class="meta-val">${d.invoice_date||'—'}</div></div>
      <div class="meta-cell"><div class="meta-key">Due Date</div><div class="meta-val">${d.due_date||'—'}</div></div>
      <div class="meta-cell"><div class="meta-key">PO Reference</div><div class="meta-val">${d.po_number||d.po_ref||'—'}</div></div>
      <div class="meta-cell"><div class="meta-key">Currency</div><div class="meta-val">${d.currency||'SAR'}</div></div>
    </div>

    ${lines.length ? `
    <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:0;border:1.5px solid #d0d8e8;border-radius:6px;overflow:hidden;">
      <thead><tr style="background:#1a3a6b;color:#fff;">
        <th style="padding:7px 8px;text-align:left;border:1px solid #0f2550;">Description</th>
        <th style="padding:7px 8px;width:55px;text-align:center;border:1px solid #0f2550;">Qty</th>
        <th style="padding:7px 8px;width:45px;text-align:center;border:1px solid #0f2550;">Unit</th>
        <th style="padding:7px 8px;width:100px;text-align:right;border:1px solid #0f2550;">Unit Price</th>
        <th style="padding:7px 8px;width:110px;text-align:right;border:1px solid #0f2550;">Amount SAR</th>
      </tr></thead>
      <tbody>${lineRows}</tbody>
    </table>` : ''}

    <div class="amount-section">
      <div style="background:#f7f9fc;border:1.5px solid #d0d8e8;border-top:none;border-radius:0 0 0 0;">
        <div class="amount-row"><span>Net Amount (Excl. VAT)</span><span>SAR ${fmtSAR(netAmt)}</span></div>
        <div class="amount-row"><span>VAT (15%)</span><span>SAR ${fmtSAR(vatAmt)}</span></div>
      </div>
      <div class="amount-total"><span>TOTAL AMOUNT (Incl. VAT)</span><span>SAR ${fmtSAR(totAmt)}</span></div>
      <div class="words-line">Amount in words: ${words}</div>
    </div>

    ${d.terms ? `<div style="margin-top:10px;font-size:9.5px;color:#555;background:#f9f9f9;border:1px solid #e0e0e0;padding:8px 12px;border-radius:4px;"><strong>Terms &amp; Conditions:</strong> ${d.terms}</div>` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:28px;">
      <div style="border-top:1.5px solid #555;padding-top:6px;text-align:center;font-size:9.5px;color:#555;"><div style="height:36px;"></div><div style="font-weight:700;">${d.prepared_by||'Accounts Team'}</div><div>Prepared By</div></div>
      <div style="border-top:1.5px solid #555;padding-top:6px;text-align:center;font-size:9.5px;color:#555;"><div style="height:36px;"></div><div style="font-weight:700;">${d.approved_by||d.entity_name||'Authorized Signatory'}</div><div>Authorised Signatory &amp; Stamp</div></div>
    </div>

    <div class="page-footer">
      <span>${d.entity_name||'Ratal Advanced Technologies'} | VAT: ${d.entity_vat||'310680651700003'}</span>
      <span>${d.invoice_number||''}</span>
      <span>${d.invoice_date||''}</span>
    </div>
  </div></body></html>`
}

// ─── SubCon Statement of Account ─────────────────────────────────────────────
function buildSubConStatement(d) {
  const FIN = '#8C354B'
  const FIN_L = '#FAF0F2'
  const FIN_D = '#C1A1A9'
  const rows = (d.lines||[]).map((r,i)=>`
    <tr style="background:${i%2===0?'#fff':FIN_L};">
      <td style="padding:6px 8px;font-size:9.5px;">${r.date||''}</td>
      <td style="padding:6px 8px;font-size:9.5px;">${r.cert_number||r.ref||''}</td>
      <td style="padding:6px 8px;font-size:9.5px;">${r.description||''}</td>
      <td style="padding:6px 8px;font-size:9.5px;text-align:right;">${r.claimed?.toLocaleString('en-US',{minimumFractionDigits:2})||''}</td>
      <td style="padding:6px 8px;font-size:9.5px;text-align:right;color:${r.payment_amount?'#2e7d32':'#888'};">${r.payment_amount?r.payment_amount.toLocaleString('en-US',{minimumFractionDigits:2}):'-'}</td>
      <td style="padding:6px 8px;font-size:9.5px;text-align:right;font-weight:600;">${r.balance!=null?r.balance.toLocaleString('en-US',{minimumFractionDigits:2}):''}</td>
    </tr>`).join('')
  const totalClaimed  = (d.total_claimed  || (d.lines||[]).reduce((s,r)=>s+(r.claimed||0),0))
  const totalPaid     = (d.total_paid     || (d.lines||[]).reduce((s,r)=>s+(r.payment_amount||0),0))
  const outstanding   = (d.outstanding    || totalClaimed - totalPaid)
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body { margin:0; font-family:'Arial',sans-serif; color:#1a2e3d; background:#fff; }
    .page { width:794px; min-height:1123px; margin:0 auto; padding:32px 36px; box-sizing:border-box; }
    .page-footer { position:fixed; bottom:0; left:0; right:0; padding:8px 36px; font-size:8.5px; color:#888; display:flex; justify-content:space-between; border-top:1px solid #e0e0e0; }
    @media print { .page-footer { position:fixed; bottom:0; } body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    table { width:100%; border-collapse:collapse; }
    th { background:${FIN}; color:#fff; padding:7px 8px; font-size:10px; font-weight:700; text-align:left; }
  </style></head><body><div class="page">

    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
      <div>
        <div style="font-size:20px;font-weight:900;color:${FIN};">${d.entity_name||'Ratal Advanced Technologies'}</div>
        <div style="font-size:9px;color:#777;margin-top:2px;">${d.entity_vat?'VAT: '+d.entity_vat:''}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:16px;font-weight:900;color:#1a2e3d;">SUB-CONTRACTOR STATEMENT</div>
        <div style="font-size:9px;color:#888;margin-top:4px;">Statement Ref: ${d.statement_number||'SC-STMT-001'}</div>
        <div style="font-size:9px;color:#888;">Date: ${d.statement_date||new Date().toLocaleDateString('en-GB')}</div>
      </div>
    </div>

    <!-- Party Info -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
      <div style="background:${FIN_L};border:1px solid ${FIN_D};border-radius:6px;padding:12px;">
        <div style="font-size:9px;font-weight:700;color:${FIN};margin-bottom:6px;text-transform:uppercase;">Sub-Contractor</div>
        <div style="font-size:11px;font-weight:700;">${d.subcon_name||'Sub-Contractor Name'}</div>
        <div style="font-size:9.5px;color:#555;margin-top:2px;">${d.subcon_cr?'CR: '+d.subcon_cr:d.subcon_iqama?'Iqama: '+d.subcon_iqama:''}</div>
        <div style="font-size:9.5px;color:#555;">${d.subcon_vat?'VAT: '+d.subcon_vat:''}</div>
      </div>
      <div style="background:${FIN_L};border:1px solid ${FIN_D};border-radius:6px;padding:12px;">
        <div style="font-size:9px;font-weight:700;color:${FIN};margin-bottom:6px;text-transform:uppercase;">Period</div>
        <div style="font-size:10px;"><strong>From:</strong> ${d.from_date||''}</div>
        <div style="font-size:10px;margin-top:2px;"><strong>To:</strong> ${d.to_date||''}</div>
        ${d.project_name?`<div style="font-size:10px;margin-top:4px;"><strong>Project:</strong> ${d.project_name}</div>`:''}
      </div>
    </div>

    <!-- Table -->
    <table style="margin-bottom:16px;">
      <thead><tr>
        <th style="width:85px;">Date</th>
        <th style="width:100px;">Cert. / Ref</th>
        <th>Description</th>
        <th style="width:100px;text-align:right;">Claimed (SAR)</th>
        <th style="width:100px;text-align:right;">Paid (SAR)</th>
        <th style="width:100px;text-align:right;">Balance (SAR)</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <!-- Totals -->
    <div style="display:flex;justify-content:flex-end;margin-bottom:24px;">
      <table style="width:340px;border-collapse:collapse;">
        <tr style="background:${FIN_L};">
          <td style="padding:7px 12px;font-size:10px;font-weight:600;">Total Claimed</td>
          <td style="padding:7px 12px;font-size:10px;text-align:right;">${totalClaimed.toLocaleString('en-US',{minimumFractionDigits:2})} SAR</td>
        </tr>
        <tr>
          <td style="padding:7px 12px;font-size:10px;font-weight:600;color:#2e7d32;">Total Paid</td>
          <td style="padding:7px 12px;font-size:10px;text-align:right;color:#2e7d32;">(${totalPaid.toLocaleString('en-US',{minimumFractionDigits:2})}) SAR</td>
        </tr>
        <tr style="background:${FIN};color:#fff;">
          <td style="padding:9px 12px;font-size:11px;font-weight:700;">Outstanding Balance</td>
          <td style="padding:9px 12px;font-size:11px;font-weight:700;text-align:right;">${outstanding.toLocaleString('en-US',{minimumFractionDigits:2})} SAR</td>
        </tr>
      </table>
    </div>

    <!-- Signature -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:24px;">
      <div style="border-top:1.5px solid ${FIN};padding-top:6px;text-align:center;font-size:9.5px;color:#555;">
        <div style="height:36px;"></div>
        <div style="font-weight:700;">Accounts Team — ${d.entity_name||'Ratal Advanced Technologies'}</div>
        <div>Prepared By</div>
      </div>
      <div style="border-top:1.5px solid ${FIN};padding-top:6px;text-align:center;font-size:9.5px;color:#555;">
        <div style="height:36px;"></div>
        <div style="font-weight:700;">${d.subcon_name||'Sub-Contractor'}</div>
        <div>Acknowledged By (Stamp &amp; Signature)</div>
      </div>
    </div>

    <div class="page-footer">
      <span>${d.entity_name||'Ratal Advanced Technologies'} | VAT: ${d.entity_vat||''}</span>
      <span>${d.statement_number||''}</span>
      <span>Period: ${d.from_date||''} – ${d.to_date||''}</span>
    </div>
  </div></body></html>`
}

// ─── Supplier Statement of Account ───────────────────────────────────────────
function buildSupplierStatement(d) {
  const FIN = '#8C354B'
  const FIN_L = '#FAF0F2'
  const FIN_D = '#C1A1A9'
  const rows = (d.lines||[]).map((r,i)=>`
    <tr style="background:${i%2===0?'#fff':FIN_L};">
      <td style="padding:6px 8px;font-size:9.5px;">${r.date||''}</td>
      <td style="padding:6px 8px;font-size:9.5px;">${r.ref||r.po_number||''}</td>
      <td style="padding:6px 8px;font-size:9.5px;">${r.description||''}</td>
      <td style="padding:6px 8px;font-size:9.5px;text-align:right;">${r.invoice_amount?.toLocaleString('en-US',{minimumFractionDigits:2})||''}</td>
      <td style="padding:6px 8px;font-size:9.5px;text-align:right;color:${r.payment_amount?'#2e7d32':'#888'};">${r.payment_amount?r.payment_amount.toLocaleString('en-US',{minimumFractionDigits:2}):'-'}</td>
      <td style="padding:6px 8px;font-size:9.5px;text-align:right;font-weight:600;">${r.balance!=null?r.balance.toLocaleString('en-US',{minimumFractionDigits:2}):''}</td>
    </tr>`).join('')
  const totalInvoiced = (d.total_invoiced  || (d.lines||[]).reduce((s,r)=>s+(r.invoice_amount||0),0))
  const totalPaid     = (d.total_paid      || (d.lines||[]).reduce((s,r)=>s+(r.payment_amount||0),0))
  const outstanding   = (d.outstanding     || totalInvoiced - totalPaid)
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body { margin:0; font-family:'Arial',sans-serif; color:#1a2e3d; background:#fff; }
    .page { width:794px; min-height:1123px; margin:0 auto; padding:32px 36px; box-sizing:border-box; }
    .page-footer { position:fixed; bottom:0; left:0; right:0; padding:8px 36px; font-size:8.5px; color:#888; display:flex; justify-content:space-between; border-top:1px solid #e0e0e0; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    table { width:100%; border-collapse:collapse; }
    th { background:${FIN}; color:#fff; padding:7px 8px; font-size:10px; font-weight:700; text-align:left; }
  </style></head><body><div class="page">

    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
      <div>
        <div style="font-size:20px;font-weight:900;color:${FIN};">${d.entity_name||'Ratal Advanced Technologies'}</div>
        <div style="font-size:9px;color:#777;margin-top:2px;">${d.entity_vat?'VAT: '+d.entity_vat:''}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:16px;font-weight:900;color:#1a2e3d;">SUPPLIER STATEMENT</div>
        <div style="font-size:9px;color:#888;margin-top:4px;">Ref: ${d.statement_number||'SUP-STMT-001'}</div>
        <div style="font-size:9px;color:#888;">Date: ${d.statement_date||new Date().toLocaleDateString('en-GB')}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;">
      <div style="background:${FIN_L};border:1px solid ${FIN_D};border-radius:6px;padding:12px;">
        <div style="font-size:9px;font-weight:700;color:${FIN};margin-bottom:6px;text-transform:uppercase;">Supplier</div>
        <div style="font-size:11px;font-weight:700;">${d.supplier_name||'Supplier Name'}</div>
        <div style="font-size:9.5px;color:#555;margin-top:2px;">${d.supplier_vat?'VAT: '+d.supplier_vat:''}</div>
        <div style="font-size:9.5px;color:#555;">${d.supplier_cr?'CR: '+d.supplier_cr:''}</div>
      </div>
      <div style="background:${FIN_L};border:1px solid ${FIN_D};border-radius:6px;padding:12px;">
        <div style="font-size:9px;font-weight:700;color:${FIN};margin-bottom:6px;text-transform:uppercase;">Statement Period</div>
        <div style="font-size:10px;"><strong>From:</strong> ${d.from_date||''}</div>
        <div style="font-size:10px;margin-top:2px;"><strong>To:</strong> ${d.to_date||''}</div>
      </div>
    </div>

    <table style="margin-bottom:16px;">
      <thead><tr>
        <th style="width:85px;">Date</th>
        <th style="width:110px;">PO / Ref</th>
        <th>Description</th>
        <th style="width:100px;text-align:right;">Invoiced (SAR)</th>
        <th style="width:100px;text-align:right;">Paid (SAR)</th>
        <th style="width:100px;text-align:right;">Balance (SAR)</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="display:flex;justify-content:flex-end;margin-bottom:24px;">
      <table style="width:340px;border-collapse:collapse;">
        <tr style="background:${FIN_L};">
          <td style="padding:7px 12px;font-size:10px;font-weight:600;">Total Invoiced</td>
          <td style="padding:7px 12px;font-size:10px;text-align:right;">${totalInvoiced.toLocaleString('en-US',{minimumFractionDigits:2})} SAR</td>
        </tr>
        <tr>
          <td style="padding:7px 12px;font-size:10px;font-weight:600;color:#2e7d32;">Total Paid</td>
          <td style="padding:7px 12px;font-size:10px;text-align:right;color:#2e7d32;">(${totalPaid.toLocaleString('en-US',{minimumFractionDigits:2})}) SAR</td>
        </tr>
        <tr style="background:${FIN};color:#fff;">
          <td style="padding:9px 12px;font-size:11px;font-weight:700;">Outstanding Balance</td>
          <td style="padding:9px 12px;font-size:11px;font-weight:700;text-align:right;">${outstanding.toLocaleString('en-US',{minimumFractionDigits:2})} SAR</td>
        </tr>
      </table>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:24px;">
      <div style="border-top:1.5px solid ${FIN};padding-top:6px;text-align:center;font-size:9.5px;color:#555;">
        <div style="height:36px;"></div>
        <div style="font-weight:700;">Accounts — ${d.entity_name||'Ratal Advanced Technologies'}</div>
        <div>Prepared By</div>
      </div>
      <div style="border-top:1.5px solid ${FIN};padding-top:6px;text-align:center;font-size:9.5px;color:#555;">
        <div style="height:36px;"></div>
        <div style="font-weight:700;">${d.supplier_name||'Supplier'}</div>
        <div>Acknowledged By (Stamp &amp; Signature)</div>
      </div>
    </div>

    <div class="page-footer">
      <span>${d.entity_name||'Ratal Advanced Technologies'}</span>
      <span>${d.statement_number||''}</span>
      <span>Period: ${d.from_date||''} – ${d.to_date||''}</span>
    </div>
  </div></body></html>`
}

// ─── Project Financial Statement ─────────────────────────────────────────────
function buildProjectStatement(d) {
  const OPS = '#0079BC'
  const OPS_L = '#EAF3F2'
  const OPS_D = '#70A5A6'
  const inv_rows = (d.invoices||[]).map((r,i)=>`
    <tr style="background:${i%2===0?'#fff':OPS_L};">
      <td style="padding:6px 8px;font-size:9.5px;">${r.date||''}</td>
      <td style="padding:6px 8px;font-size:9.5px;">${r.invoice_number||''}</td>
      <td style="padding:6px 8px;font-size:9.5px;">${r.description||''}</td>
      <td style="padding:6px 8px;font-size:9.5px;text-align:right;">${r.amount?.toLocaleString('en-US',{minimumFractionDigits:2})||''}</td>
      <td style="padding:6px 8px;font-size:9.5px;text-align:right;color:${r.paid_amount?'#2e7d32':'#e65100'};">${r.paid_amount?r.paid_amount.toLocaleString('en-US',{minimumFractionDigits:2}):'Pending'}</td>
    </tr>`).join('')
  const exp_rows = (d.expenses||[]).map((r,i)=>`
    <tr style="background:${i%2===0?'#fff':OPS_L};">
      <td style="padding:6px 8px;font-size:9.5px;">${r.date||''}</td>
      <td style="padding:6px 8px;font-size:9.5px;">${r.category||''}</td>
      <td style="padding:6px 8px;font-size:9.5px;">${r.description||''}</td>
      <td style="padding:6px 8px;font-size:9.5px;text-align:right;color:#c62828;">${r.amount?.toLocaleString('en-US',{minimumFractionDigits:2})||''}</td>
    </tr>`).join('')
  const totalBilled   = d.total_billed   || (d.invoices||[]).reduce((s,r)=>s+(r.amount||0),0)
  const totalReceived = d.total_received || (d.invoices||[]).reduce((s,r)=>s+(r.paid_amount||0),0)
  const totalExpenses = d.total_expenses || (d.expenses||[]).reduce((s,r)=>s+(r.amount||0),0)
  const poValue       = d.po_value || 0
  const billingUtil   = poValue ? ((totalBilled/poValue)*100).toFixed(1)+'%' : 'N/A'
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body { margin:0; font-family:'Arial',sans-serif; color:#1a2e3d; background:#fff; }
    .page { width:794px; min-height:1123px; margin:0 auto; padding:32px 36px; box-sizing:border-box; }
    .page-footer { position:fixed; bottom:0; left:0; right:0; padding:8px 36px; font-size:8.5px; color:#888; display:flex; justify-content:space-between; border-top:1px solid #e0e0e0; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    table { width:100%; border-collapse:collapse; }
    th { background:${OPS}; color:#fff; padding:7px 8px; font-size:10px; font-weight:700; text-align:left; }
    .section-title { font-size:11px; font-weight:700; color:${OPS}; margin:18px 0 8px; text-transform:uppercase; letter-spacing:0.5px; }
    .kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:20px; }
    .kpi { background:${OPS_L}; border:1px solid ${OPS_D}; border-radius:6px; padding:10px 12px; text-align:center; }
    .kpi-val { font-size:14px; font-weight:700; color:${OPS}; }
    .kpi-lbl { font-size:8.5px; color:#777; margin-top:2px; }
  </style></head><body><div class="page">

    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;">
      <div>
        <div style="font-size:20px;font-weight:900;color:${OPS};">${d.entity_name||'Ratal Advanced Technologies'}</div>
        <div style="font-size:9px;color:#777;margin-top:2px;">${d.entity_vat?'VAT: '+d.entity_vat:''}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:15px;font-weight:900;color:#1a2e3d;">PROJECT FINANCIAL STATEMENT</div>
        <div style="font-size:9px;color:#888;margin-top:4px;">Report Date: ${d.statement_date||new Date().toLocaleDateString('en-GB')}</div>
      </div>
    </div>

    <!-- Project Info -->
    <div style="background:${OPS};color:#fff;border-radius:6px;padding:12px 16px;margin-bottom:16px;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
        <div><div style="font-size:8.5px;opacity:.7;text-transform:uppercase;">Project</div><div style="font-size:11px;font-weight:700;">${d.project_name||'Project Name'}</div></div>
        <div><div style="font-size:8.5px;opacity:.7;text-transform:uppercase;">Project No.</div><div style="font-size:11px;font-weight:700;">${d.project_number||''}</div></div>
        <div><div style="font-size:8.5px;opacity:.7;text-transform:uppercase;">Client</div><div style="font-size:11px;font-weight:700;">${d.client_name||''}</div></div>
        <div><div style="font-size:8.5px;opacity:.7;text-transform:uppercase;">Period</div><div style="font-size:11px;font-weight:700;">${d.from_date||''} – ${d.to_date||''}</div></div>
        <div><div style="font-size:8.5px;opacity:.7;text-transform:uppercase;">PO Value (SAR)</div><div style="font-size:11px;font-weight:700;">${poValue.toLocaleString('en-US',{minimumFractionDigits:2})}</div></div>
        <div><div style="font-size:8.5px;opacity:.7;text-transform:uppercase;">Billing Utilisation</div><div style="font-size:11px;font-weight:700;">${billingUtil}</div></div>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-val">${totalBilled.toLocaleString('en-US',{minimumFractionDigits:0})}</div><div class="kpi-lbl">Total Billed (SAR)</div></div>
      <div class="kpi"><div class="kpi-val" style="color:#2e7d32;">${totalReceived.toLocaleString('en-US',{minimumFractionDigits:0})}</div><div class="kpi-lbl">Received (SAR)</div></div>
      <div class="kpi"><div class="kpi-val" style="color:#c62828;">${totalExpenses.toLocaleString('en-US',{minimumFractionDigits:0})}</div><div class="kpi-lbl">Field Expenses (SAR)</div></div>
      <div class="kpi"><div class="kpi-val" style="color:${(totalReceived-totalExpenses)>=0?'#2e7d32':'#c62828'};">${(totalReceived-totalExpenses).toLocaleString('en-US',{minimumFractionDigits:0})}</div><div class="kpi-lbl">Net (SAR)</div></div>
    </div>

    <!-- Invoices Table -->
    <div class="section-title">Invoices Raised</div>
    <table style="margin-bottom:16px;">
      <thead><tr>
        <th style="width:85px;">Date</th>
        <th style="width:130px;">Invoice No.</th>
        <th>Description</th>
        <th style="width:110px;text-align:right;">Amount (SAR)</th>
        <th style="width:110px;text-align:right;">Received (SAR)</th>
      </tr></thead>
      <tbody>${inv_rows||'<tr><td colspan="5" style="padding:12px;text-align:center;font-size:9.5px;color:#888;">No invoices recorded</td></tr>'}</tbody>
    </table>

    <!-- Expenses Table -->
    ${exp_rows?`<div class="section-title">Field Expenses</div>
    <table style="margin-bottom:16px;">
      <thead><tr>
        <th style="width:85px;">Date</th>
        <th style="width:130px;">Category</th>
        <th>Description</th>
        <th style="width:110px;text-align:right;">Amount (SAR)</th>
      </tr></thead>
      <tbody>${exp_rows}</tbody>
    </table>`:''}

    <div class="page-footer">
      <span>${d.entity_name||'Ratal Advanced Technologies'}</span>
      <span>${d.project_number||''} — ${d.project_name||''}</span>
      <span>${d.statement_date||''}</span>
    </div>
  </div></body></html>`
}

// ─── Employee Profile Letter ──────────────────────────────────────────────────
function buildEmployeeProfileLetter(d) {
  const HR = '#795338'
  const HR_L = '#F7F2ED'
  const HR_D = '#BCA99A'
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body { margin:0; font-family:'Arial',sans-serif; color:#1a2e3d; background:#fff; }
    .page { width:794px; min-height:1123px; margin:0 auto; padding:48px 56px; box-sizing:border-box; position:relative; }
    .page-footer { position:fixed; bottom:0; left:0; right:0; padding:8px 56px; font-size:8.5px; color:#888; display:flex; justify-content:space-between; border-top:1px solid #e0e0e0; }
    @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
  </style></head><body><div class="page">

    <!-- Letterhead -->
    <div style="border-bottom:3px solid ${HR};padding-bottom:14px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-end;">
      <div>
        <div style="font-size:20px;font-weight:900;color:${HR};">${d.entity_name||'Ratal Advanced Technologies'}</div>
        <div style="font-size:9px;color:#777;">VAT: ${d.entity_vat||'310680651700003'} | ${d.entity_address||'Riyadh, Kingdom of Saudi Arabia'}</div>
      </div>
      <div style="text-align:right;font-size:9px;color:#777;">
        <div>Ref: ${d.letter_ref||'HR-PROFILE-001'}</div>
        <div>Date: ${d.letter_date||new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'long',year:'numeric'})}</div>
      </div>
    </div>

    <!-- Title -->
    <div style="text-align:center;margin-bottom:28px;">
      <div style="font-size:15px;font-weight:900;color:#1a2e3d;text-transform:uppercase;letter-spacing:1px;">Employee Profile</div>
      <div style="width:80px;height:3px;background:${HR};margin:8px auto 0;"></div>
    </div>

    <!-- To Whom -->
    <div style="margin-bottom:20px;font-size:10.5px;line-height:1.7;">
      <strong>To Whom It May Concern,</strong>
    </div>

    <!-- Body Text -->
    <div style="font-size:10.5px;line-height:1.85;color:#333;margin-bottom:20px;">
      This is to confirm that <strong>${d.employee_name||'Employee Name'}</strong> ${d.gender&&d.gender.toLowerCase()==='female'?'has':'has'} been employed with <strong>${d.entity_name||'Ratal Advanced Technologies'}</strong>
      ${d.join_date?`since <strong>${d.join_date}</strong>`:'as a member of our team'} and continues to be in the employment of the company as of the date of this letter.
    </div>

    <!-- Details Table -->
    <div style="background:${HR_L};border:1px solid ${HR_D};border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <div style="font-size:9px;font-weight:700;color:${HR};text-transform:uppercase;margin-bottom:12px;letter-spacing:0.5px;">Employee Details</div>
      <table style="width:100%;border-collapse:collapse;">
        ${[
          ['Full Name',          d.employee_name||''],
          ['Nationality',        d.nationality||''],
          ['Iqama / ID Number',  d.iqama_number||d.national_id||''],
          ['Designation / Title',d.designation||d.job_title||''],
          ['Department',         d.department||''],
          ['Employment Type',    d.employment_type||'Full-Time'],
          ['Contract Type',      d.contract_type||'Fixed Term'],
          ['Date of Joining',    d.join_date||''],
          d.end_date?['Contract End Date', d.end_date]:null,
          d.basic_salary?['Basic Salary',    'SAR '+Number(d.basic_salary).toLocaleString('en-US',{minimumFractionDigits:2})+' per month']:null,
          d.gosi_number?['GOSI Registration',d.gosi_number]:null,
          d.iban?['Bank IBAN',            d.iban]:null,
          d.bank_name?['Bank Name',           d.bank_name]:null,
        ].filter(Boolean).map((row,i)=>`
          <tr style="background:${i%2===0?'#fff':HR_L};">
            <td style="padding:7px 10px;font-size:9.5px;font-weight:600;color:#555;width:180px;border-radius:4px 0 0 4px;">${row[0]}</td>
            <td style="padding:7px 10px;font-size:10px;font-weight:600;color:#1a2e3d;border-radius:0 4px 4px 0;">${row[1]}</td>
          </tr>`).join('')}
      </table>
    </div>

    <!-- Closing -->
    <div style="font-size:10.5px;line-height:1.85;color:#333;margin-bottom:32px;">
      This letter is issued upon the request of the employee and is valid for official purposes only. Should you require any further information or verification, please do not hesitate to contact our HR department.
    </div>

    <!-- Signature -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:20px;">
      <div style="border-top:1.5px solid ${HR};padding-top:8px;">
        <div style="height:50px;"></div>
        <div style="font-size:10px;font-weight:700;">${d.hr_manager||'HR Manager'}</div>
        <div style="font-size:9.5px;color:#555;">Human Resources Department</div>
        <div style="font-size:9.5px;color:#555;">${d.entity_name||'Ratal Advanced Technologies'}</div>
      </div>
      <div style="border-top:1.5px solid ${HR};padding-top:8px;">
        <div style="height:50px;"></div>
        <div style="font-size:10px;font-weight:700;">${d.gm_name||'General Manager'}</div>
        <div style="font-size:9.5px;color:#555;">General Manager</div>
        <div style="font-size:9.5px;color:#555;">${d.entity_name||'Ratal Advanced Technologies'} — Official Stamp</div>
      </div>
    </div>

    <div class="page-footer">
      <span>${d.entity_name||'Ratal Advanced Technologies'}</span>
      <span>${d.letter_ref||''}</span>
      <span>${d.letter_date||''}</span>
    </div>
  </div></body></html>`
}

// ─────────────────────────────────────────────────────────────────────────────
const BUILTIN_BUILDERS = {
  money_request:          buildMoneyRequest,
  project_initiation:     buildProjectInitiation,
  new_project_form:       buildProjectInitiation,
  payment_instruction:    buildPaymentNotification,
  vehicle_handover:       buildVehicleHandover,
  new_vehicle_request:    buildVehicleHandover,
  outgoing_po:            buildOutgoingPO,
  salary_slip:            buildPayslip,             // G5 — used by Payroll.jsx printPayslip()
  dept_payroll_report:    buildDeptReport,          // Payroll → "📄 Dept Report" button
  overall_payroll_summary:buildOverallSummaryPDF,   // Payroll → "📊 Overall Summary PDF" button
  mudad_submission_log:   buildMudadLog,            // Mudad tracker submission confirmation
  monthly_expense_claim:  buildExpenseClaim,         // Finance → Expense Claims
  monthly_food_allowance: buildFoodAllowanceClaim,   // Finance → Expense Claims (food)
  overtime_report:        buildOvertimeReport,       // Finance → Expense Claims (overtime)
  // Field Ops aliases — same content, different template_key
  expense_claim:          buildExpenseClaim,         // FIELD_OPS 'expense_claim' key
  food_allowance_claim:   buildFoodAllowanceClaim,   // FIELD_OPS 'food_allowance_claim' key
  ot_summary:             buildOvertimeReport,       // FIELD_OPS 'ot_summary' key
  // New builders
  cash_payment_voucher:     buildCashPaymentVoucher,
  subcon_payment_cert:      buildSubConCert,
  expense_record_voucher:   buildExpenseVoucher,
  invoice_accsys_bilingual: buildInvoiceACCSYS,
  invoice_accsys_en:        buildInvoiceACCSYS,
  invoice_rat_standard:     buildInvoiceACCSYS,
  invoice_gwt_standard:     buildInvoiceACCSYS,
  // Statement builders
  subcon_statement:         buildSubConStatement,
  supplier_statement:       buildSupplierStatement,
  project_statement:        buildProjectStatement,
  // HR letter
  employee_profile_letter:  buildEmployeeProfileLetter,
}
