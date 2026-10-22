/**
 * RATAL GROUP — Google Sheets Sync
 * Paste this entire file into Google Apps Script, then deploy as Web App.
 *
 * HOW TO DEPLOY:
 *  1. Open your Google Sheet
 *  2. Extensions → Apps Script
 *  3. Delete any existing code, paste this entire file
 *  4. Click Save (💾)
 *  5. Click Deploy → New Deployment
 *  6. Type = Web App
 *  7. Execute as = Me
 *  8. Who has access = Anyone
 *  9. Click Deploy → Copy the Web App URL
 * 10. Paste URL into your .env as VITE_GOOGLE_SCRIPT_URL=<URL>
 *
 * Each form type gets its own tab in the Google Sheet.
 * Headers are auto-created on first submission.
 */

// ─── Column definitions per form type ──────────────────────────────────────
var COLUMNS = {

  expense: [
    'Synced At', 'Date', 'Employee', 'Department', 'Mode',
    'Type', 'Amount (SAR)', 'VAT Amount', 'VAT No', 'Vendor VAT Paid',
    'Site ID', 'Site SM#', 'Notes', 'Status', 'Photo URL',
  ],

  food: [
    'Synced At', 'Date', 'Employee', 'Department', 'Site ID',
    'Site SM#', 'Site Name', 'Daily Rate (SAR)', 'Is Remote', 'Status',
  ],

  overtime: [
    'Synced At', 'Date', 'Employee', 'Department', 'Site ID', 'Site SM#',
    'Time In', 'Time Out', 'Hours', 'Basic Salary', 'OT Rate Multiplier',
    'OT Amount (SAR)', 'Status',
  ],

  po_request: [
    'Synced At', 'Request Date', 'Department', 'Requested By', 'Contact',
    'Project ID', 'Site No', 'Supplier Type', 'Preferred Supplier',
    'Urgency', 'Needed By', 'Est. Total (SAR)', 'Items Count',
    'Justification', 'Status',
  ],

  site_status: [
    'Synced At', 'Date', 'Employee / SubCon', 'Department', 'Site ID',
    'Site SM#', 'Site Name', 'Scope Type', 'Milestones Completed',
    'Photo URL', 'Notes',
  ],
}

// ─── Row builders per form type ────────────────────────────────────────────
function buildRow(formType, d) {
  var now = d.syncedAt || new Date().toISOString()

  if (formType === 'expense') return [
    now,
    d.expense_date || '',
    d.employee_id  || '',
    d.entity_id    || '',
    d.expense_mode || 'EXPENSE',
    d.expense_type || '',
    d.amount       || 0,
    d.vat_amount   || 0,
    d.vendor_vat_no || '',
    d.vat_paid     ? 'Yes' : 'No',
    d.site_master_id || '',
    d.sm_id        || '',
    d.notes        || '',
    d.status       || 'PENDING',
    d.photo_url    || '',
  ]

  if (formType === 'food') return [
    now,
    d.claim_date   || d.date || '',
    d.employee_id  || '',
    d.department   || '',
    d.site_master_id || '',
    d.sm_id        || '',
    d.site_name    || '',
    d.daily_rate   || d.amount || 0,
    d.is_remote    ? 'Yes' : 'No',
    d.status       || 'PENDING',
  ]

  if (formType === 'overtime') return [
    now,
    d.ot_date      || d.date || '',
    d.employee_id  || '',
    d.department   || '',
    d.site_master_id || '',
    d.sm_id        || '',
    d.time_in      || '',
    d.time_out     || '',
    d.hours        || 0,
    d.basic_salary || 0,
    d.multiplier   || 1.5,
    d.ot_amount    || d.amount || 0,
    d.status       || 'PENDING',
  ]

  if (formType === 'po_request') return [
    now,
    d.request_date        || '',
    d.department          || '',
    d.employee_id         || '',
    d.contact_number      || '',
    d.project_id          || '',
    d.site_no             || '',
    d.supplier_type       || '',
    d.preferred_party_name || '',
    d.urgency             || 'NORMAL',
    d.needed_by           || '',
    d.estimated_total     || 0,
    (d.items || []).length,
    d.justification       || '',
    d.status              || 'SUBMITTED',
  ]

  if (formType === 'site_status') return [
    now,
    d.date         || '',
    d.employee_id  || d.subcon_id || '',
    d.department   || '',
    d.site_master_id || '',
    d.sm_id        || '',
    d.site_name    || '',
    d.scope_type   || '',
    (d.milestones_completed || []).join(', '),
    d.photo_url    || '',
    d.notes        || '',
  ]

  // Generic fallback — dump key:value pairs
  return [now, JSON.stringify(d)]
}

// ─── Main entry point ───────────────────────────────────────────────────────
function doPost(e) {
  try {
    var raw  = e.postData ? e.postData.contents : '{}'
    var data = JSON.parse(raw)
    var formType  = data.formType  || 'unknown'
    var sheetName = data.sheetName || formType

    var ss    = SpreadsheetApp.getActiveSpreadsheet()
    var sheet = ss.getSheetByName(sheetName)

    // Auto-create tab if it doesn't exist
    if (!sheet) {
      sheet = ss.insertSheet(sheetName)
    }

    // Auto-create header row if sheet is empty
    if (sheet.getLastRow() === 0) {
      var headers = COLUMNS[formType] || ['Synced At', 'Data']
      sheet.appendRow(headers)
      // Freeze header row + bold it
      sheet.setFrozenRows(1)
      sheet.getRange(1, 1, 1, headers.length)
           .setFontWeight('bold')
           .setBackground('#1a2e4a')
           .setFontColor('#ffffff')
    }

    // Append the data row
    var row = buildRow(formType, data)
    sheet.appendRow(row)

    // Auto-resize columns occasionally (every 50 rows)
    if (sheet.getLastRow() % 50 === 0) {
      sheet.autoResizeColumns(1, sheet.getLastColumn())
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok', sheet: sheetName }))
      .setMimeType(ContentService.MimeType.JSON)

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON)
  }
}

// ─── Test function (run manually from Apps Script editor) ──────────────────
function testSync() {
  var mock = {
    postData: {
      contents: JSON.stringify({
        formType:     'expense',
        sheetName:    'Expenses',
        syncedAt:     new Date().toISOString(),
        expense_date: '2026-07-23',
        employee_id:  'TEST-EMP',
        expense_mode: 'EXPENSE',
        expense_type: 'Transport / Fuel',
        amount:       150,
        vat_amount:   19.57,
        status:       'PENDING',
      })
    }
  }
  var result = doPost(mock)
  Logger.log(result.getContent())
}
