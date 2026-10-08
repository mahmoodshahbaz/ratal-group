/**
 * exportExcel.js — Download data as a formatted .xlsx file
 *
 * Uses SheetJS (xlsx) loaded from CDN at runtime — no npm install needed.
 * Call exportToExcel(rows, columns, filename) from any page.
 *
 * Example:
 *   import { exportToExcel } from '../lib/exportExcel'
 *
 *   exportToExcel(
 *     expenses,                              // array of objects from Supabase
 *     [                                      // column definitions
 *       { key: 'expense_date', label: 'Date' },
 *       { key: 'amount',       label: 'Amount (SAR)', format: 'currency' },
 *       { key: 'status',       label: 'Status' },
 *     ],
 *     'Expenses_July_2026'                   // filename (no .xlsx)
 *   )
 */

// Load SheetJS from CDN at runtime
function loadXLSX() {
  return new Promise((resolve) => {
    if (window.XLSX) { resolve(window.XLSX); return }
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
    s.onload  = () => resolve(window.XLSX)
    s.onerror = () => resolve(null)
    document.head.appendChild(s)
  })
}

/**
 * Export data to Excel
 *
 * @param {object[]} rows       — data array (from Supabase)
 * @param {object[]} columns    — [{ key, label, format? }]
 *   format options: 'currency' | 'date' | 'boolean' | default (plain text)
 * @param {string}   filename   — output filename without .xlsx
 * @param {string}   sheetName  — tab name in Excel (default: 'Data')
 */
export async function exportToExcel(rows, columns, filename, sheetName = 'Data') {
  const XLSX = await loadXLSX()
  if (!XLSX) { alert('Could not load Excel library — check your internet connection'); return }

  // Build header row
  const header = columns.map(c => c.label)

  // Build data rows
  const data = rows.map(row =>
    columns.map(col => {
      const val = row[col.key]
      if (val === null || val === undefined) return ''
      switch (col.format) {
        case 'currency': return parseFloat(val) || 0
        case 'date':     return val ? new Date(val).toLocaleDateString('en-GB') : ''
        case 'boolean':  return val ? 'Yes' : 'No'
        default:         return String(val)
      }
    })
  )

  // Create workbook + worksheet
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([header, ...data])

  // Column widths — auto-size based on content
  const colWidths = columns.map((col, i) => {
    const maxLen = Math.max(
      col.label.length,
      ...rows.map(r => String(r[col.key] ?? '').length)
    )
    return { wch: Math.min(Math.max(maxLen + 2, 10), 50) }
  })
  ws['!cols'] = colWidths

  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  // Download
  const today = new Date().toISOString().split('T')[0]
  XLSX.writeFile(wb, `${filename}_${today}.xlsx`)
}

// ── Pre-built column configs for each form type ──────────────────────────────

export const EXPENSE_COLS = [
  { key: 'expense_date',  label: 'Date',         format: 'date'     },
  { key: 'employee_id',   label: 'Employee ID'                      },
  { key: 'expense_mode',  label: 'Mode'                             },
  { key: 'expense_type',  label: 'Type'                             },
  { key: 'amount',        label: 'Amount (SAR)',  format: 'currency' },
  { key: 'vat_amount',    label: 'VAT (SAR)',     format: 'currency' },
  { key: 'vendor_vat_no', label: 'Vendor VAT No'                    },
  { key: 'vat_paid',      label: 'VAT Paid',      format: 'boolean'  },
  { key: 'sm_id',         label: 'Site SM#'                         },
  { key: 'notes',         label: 'Notes'                            },
  { key: 'status',        label: 'Status'                           },
  { key: 'created_at',    label: 'Submitted At',  format: 'date'     },
]

export const FOOD_COLS = [
  { key: 'claim_date',    label: 'Date',          format: 'date'     },
  { key: 'employee_id',   label: 'Employee ID'                       },
  { key: 'daily_rate',    label: 'Daily Rate (SAR)', format: 'currency' },
  { key: 'is_remote',     label: 'Remote Site',   format: 'boolean'  },
  { key: 'sm_id',         label: 'Site SM#'                          },
  { key: 'status',        label: 'Status'                            },
  { key: 'created_at',    label: 'Submitted At',  format: 'date'     },
]

export const OT_COLS = [
  { key: 'overtime_date', label: 'Date',          format: 'date'     },
  { key: 'employee_id',   label: 'Employee ID'                       },
  { key: 'start_time',    label: 'Time In'                           },
  { key: 'end_time',      label: 'Time Out'                          },
  { key: 'total_hours',   label: 'Hours'                             },
  { key: 'ot_rate',       label: 'OT Rate/hr (SAR)', format: 'currency' },
  { key: 'total_amount',  label: 'Total (SAR)',    format: 'currency' },
  { key: 'work_type',     label: 'Day Type'                          },
  { key: 'sm_id',         label: 'Site SM#'                          },
  { key: 'notes',         label: 'Notes'                             },
  { key: 'status',        label: 'Status'                            },
  { key: 'created_at',    label: 'Submitted At',  format: 'date'     },
]

export const PO_COLS = [
  { key: 'request_number',      label: 'PO Ref#'                        },
  { key: 'request_date',        label: 'Date',        format: 'date'    },
  { key: 'department',          label: 'Department'                      },
  { key: 'employee_id',         label: 'Requested By'                   },
  { key: 'contact_number',      label: 'Contact'                        },
  { key: 'site_no',             label: 'Site #'                         },
  { key: 'supplier_type',       label: 'Supplier Type'                  },
  { key: 'preferred_party_name',label: 'Preferred Supplier'             },
  { key: 'urgency',             label: 'Urgency'                        },
  { key: 'needed_by',           label: 'Needed By',   format: 'date'    },
  { key: 'estimated_total',     label: 'Est. Total (SAR)', format: 'currency' },
  { key: 'justification',       label: 'Justification'                  },
  { key: 'status',              label: 'Status'                         },
  { key: 'created_at',          label: 'Submitted At', format: 'date'   },
]
