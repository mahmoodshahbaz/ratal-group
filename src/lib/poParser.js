/**
 * poParser.js  v3
 * ─────────────────────────────────────────────────────────────────
 * Parses raw PDF text (from pdfExtract.js) into structured PO data.
 *
 * DETECTED FORMATS:
 *  • Nokia SAP Purchase Doc     — "Doc Date:", European numbers
 *  • Solutions by stc Blanket Release — "Order 40057-2", "DD-MMM-YYYY",
 *                                        line items: "{qty} Each {price} N {total}"
 *  • Generic / STC classic / Cisco / Aramco / SABIC
 *
 * USAGE:
 *  import { parsePO } from '../lib/poParser'
 *  const result = parsePO(fullText)
 */

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

function firstMatch(text, patterns) {
  for (const p of patterns) {
    const m = text.match(p)
    if (m && m[1] && m[1].trim()) return m[1].trim()
  }
  return ''
}

const MONTHS = {
  jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
  jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
}

/**
 * Normalise any date string to YYYY-MM-DD.
 * Handles: 2026-08-15 | 15/08/2026 | 15-Aug-2026 | 29-JUL-2026
 *          17Mar2026 | 15 Aug 2026 | August 15, 2026
 */
function normaliseDate(raw) {
  if (!raw) return ''
  raw = raw.trim()

  // ISO already
  let m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (all-numeric separators)
  m = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/)
  if (m) {
    const [,d,mo,y] = m
    return `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}`
  }

  // 17Mar2026 compact (Nokia — no separators between day/month/year)
  m = raw.match(/^(\d{1,2})([A-Za-z]{3})(\d{4})$/)
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()]
    if (mon) return `${m[3]}-${mon}-${m[1].padStart(2,'0')}`
  }

  // 29-JUL-2026 or 15-Aug-2026 or 15 Aug 2026 (day[sep]month[sep]4-digit year)
  m = raw.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,9})[\s\,\-]+(\d{4})$/)
  if (m) {
    const mon = MONTHS[m[2].toLowerCase().slice(0,3)]
    if (mon) return `${m[3]}-${mon}-${m[1].padStart(2,'0')}`
  }

  // 10-AUG-25 (two-digit year — Cisco format)
  m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/)
  if (m) {
    const mon = MONTHS[m[2].toLowerCase()]
    const yr  = parseInt(m[3]) >= 50 ? `19${m[3]}` : `20${m[3]}`
    if (mon) return `${yr}-${mon}-${m[1].padStart(2,'0')}`
  }

  // August 15, 2026
  m = raw.match(/^([A-Za-z]{3,9})\s+(\d{1,2})[,\s]+(\d{4})$/)
  if (m) {
    const mon = MONTHS[m[1].toLowerCase().slice(0,3)]
    if (mon) return `${m[3]}-${mon}-${m[2].padStart(2,'0')}`
  }

  return raw
}

/**
 * Parse a numeric string handling both European (162.000,00) and standard (162,000.00) formats.
 */
function parseAmount(raw) {
  if (!raw) return 0
  raw = raw.trim()
  // European: groups of 3 digits separated by dots then comma+decimals
  if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(raw))
    return parseFloat(raw.replace(/\./g,'').replace(',','.')) || 0
  // European thousands without decimal: require 2+ groups (e.g. "1.000.000")
  // Single-group "42.000" is treated as plain 42 (SBM/SAP quantity format)
  if (/^\d{1,3}(?:\.\d{3}){2,}$/.test(raw))
    return parseFloat(raw.replace(/\./g,'')) || 0
  // Standard: remove commas
  return parseFloat(raw.replace(/,/g,'').replace(/[^0-9.]/g,'')) || 0
}

function detectCurrency(text) {
  if (/\bUSD\b|\$\s*[\d,]|US Dollar/i.test(text)) return 'USD'
  if (/\bEUR\b|€\s*[\d,]/i.test(text))             return 'EUR'
  if (/\bGBP\b|£\s*[\d,]/i.test(text))             return 'GBP'
  return 'SAR'
}

// ─────────────────────────────────────────────────────────────────
// FORMAT DETECTION
// ─────────────────────────────────────────────────────────────────

function detectFormat(text) {
  if (/Blanket Release|solutions by stc|Solutions by stc/i.test(text)) return 'STC_BLANKET'
  if (/Purchase Doc(ument)? Number|Doc Date:/i.test(text))              return 'NOKIA_SAP'
  // SBM/IBM SAP: unique combination of SAP field labels
  if (/Purchase Order No\./i.test(text) &&
      /Vendor No\./i.test(text) &&
      /Item\s+Material\/Description/i.test(text)) return 'SBM_IBM'
  // Cisco PO: alphanumeric PO reference + Cisco-specific labels
  if (/Cisco\s+Requestor|Cisco\s+Buyer|CISCO\s+\d{3}\s+Rev/i.test(text) ||
      (/Purchase Order:\s+[A-Z]{2,}/i.test(text) && /Cisco/i.test(text))) return 'CISCO'
  // ZTE Engineering Service PO
  if (/Engineering Service Purchase Order/i.test(text) && /ZTE/i.test(text)) return 'ZTE'
  // Mobiserve KSA PO: has "mobiserve" brand + "Purchase Order Number:"
  if (/mobiserve/i.test(text) && /Purchase Order Number:/i.test(text)) return 'MOBISERVE'
  return 'GENERIC'
}

// ─────────────────────────────────────────────────────────────────
// MOBISERVE KSA PO PARSER
// ─────────────────────────────────────────────────────────────────
/**
 * Mobiserve PO table columns (PDF.js row-major):
 *   # | Item Code | Project | PR# | Type | Item Description | Promised Date | UOM | Qty | Unit Price | Amount | Tax | Total
 *
 * Generic parser FAILS because it takes the LAST 3 numbers (Amount, Tax, Total)
 * as (Qty, Unit Price, Total) → produces insane totals like SAR 3.4M instead of SAR 8,498.
 *
 * This parser:
 *  1. Detects rows containing a DD/MM/YYYY date (the "Promised Delivery Date" column)
 *  2. Extracts the LAST 5 numbers on that row as: Qty | Unit Price | Amount | Tax | Total
 *  3. Uses Amount (ex-VAT) as the billable line total
 *  4. Cleans the description (strips item codes, project codes, ",,ref" suffixes)
 *  5. Falls back to Amount+Tax number pairs if PDF.js splits lines
 */
function parseMobiserveItems(text) {
  const items  = []
  const allLines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean)

  // Skip these line types
  const SKIP = /^(#|Item\s*Code|Project|PR\s*#|Type|Item\s*Description|Promised|Delivery|UOM|Qty|Unit\s*Price|Amount|Tax\b|Total|Page\s+\d|Note:|Delivery\s+Location|Payment\s+Terms|Special|Inco\s+Terms|Freight|mobiserve|Buyer\s+Name|Order\s+Type|Currency|Vendor|Contact|Address|Telephone|Mob\.|Fax|TO:|Approval)/i
  const IS_TOTAL = /Total\s*\(?\s*SAR\s*\)?|Total\s+including/i

  // Approach 1: find complete table rows that contain a date and end with 5+ numbers
  // Pattern: anything + DD/MM/YYYY + word(UOM) + num num num.dec num.dec num.dec
  const ROW_RE = /^(.*?)\s+(\d{2}\/\d{2}\/\d{4})\s+\w+\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/

  for (const ln of allLines) {
    if (SKIP.test(ln) || IS_TOTAL.test(ln)) continue
    const m = ln.match(ROW_RE)
    if (m) {
      // Groups: [1]=prefix+desc, [2]=date, [3]=qty, [4]=unit_price, [5]=amount, [6]=tax, [7]=total
      const qty       = parseAmount(m[3])
      const unitPrice = parseAmount(m[4])
      const amount    = parseAmount(m[5])   // net ex-VAT — what we bill
      if (amount <= 0) continue

      // Clean description:
      //   m[1] might be "1 09080000099 12201 Rent For TG (30 KVA),,ZAB038-ZJZ616-..."
      //   → strip leading row#, item code (8-12 digits), project# (3-5 digits)
      let desc = m[1]
        .replace(/^\d+\s+/, '')              // row number at start
        .replace(/^\d{8,12}\s+/, '')         // item code
        .replace(/^\d{3,6}\s+/, '')          // project number
        .replace(/,,.*$/,  '')               // ",, project ref" at end
        .replace(/,\s*$/, '')                // trailing comma
        .trim()

      items.push({
        description: desc || 'Service / Supply',
        quantity:    qty   || 1,
        unitPrice:   unitPrice || amount,
        vatRate:     15,
        lineTotal:   amount,
      })
    }
  }

  // Approach 2 (fallback when PDF.js splits table rows across lines):
  // Scan for consecutive lines that are pure number pairs (Amount   Tax)
  // and link them to a preceding description line.
  if (items.length === 0) {
    const AMT_TAX_RE = /^([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/
    let lastDesc = ''
    for (const ln of allLines) {
      if (IS_TOTAL.test(ln)) continue
      const mAt = ln.match(AMT_TAX_RE)
      if (mAt) {
        const amount = parseAmount(mAt[1])
        if (amount >= 100) {
          items.push({
            description: lastDesc || 'Service / Supply',
            quantity:    1,
            unitPrice:   amount,
            vatRate:     15,
            lineTotal:   amount,
          })
          lastDesc = ''
        }
      } else if (!SKIP.test(ln) && !/^[\d,\.\s]+$/.test(ln) && ln.length >= 5) {
        lastDesc = ln.replace(/,,.*$/, '').replace(/^\d+\s+\d{8,12}\s+\d+\s+/, '').trim()
      }
    }
  }

  return items
}

function parseMobiserve(text) {
  // PO number: "Purchase Order Number:\n"11207""  (often in quotes, sometimes on next line)
  const rawPoNumber = firstMatch(text, [
    /Purchase Order Number:\s*\n?\s*"?(\d{4,10})"?/i,
    /Purchase Order Number:\s*"(\d{4,10})"/i,
    /"(\d{4,10})"/,
  ])

  // Date: "Approval Date: 03/05/2026"
  const rawDate = firstMatch(text, [
    /Approval\s+Date:\s*(\d{2}\/\d{2}\/\d{4})/i,
    /\b(\d{2}\/\d{2}\/\d{4})\b/,
  ])

  // Net total ex-VAT: "Total(SAR)  7,390.00  1,108.50"  — first number is net
  let rawTotal = ''
  const mTot = text.match(/Total\s*\(?\s*SAR\s*\)?\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i)
  if (mTot) {
    rawTotal = mTot[1]  // 7,390.00 (net ex-VAT)
  } else {
    // Fallback: "Total including taxes is: ... 8,498.50" — subtract known VAT or just use it
    rawTotal = firstMatch(text, [
      /Total\s+including\s+taxes\s+is:.*?([\d,]+\.\d{2})\s*$/im,
      /Total\s+Amount\s*[:\-]?\s*([\d,]+\.\d{2})/i,
    ])
  }

  // Issuer
  const rawIssuer = firstMatch(text.slice(0, 300), [
    /(Mobiserve\s*[-–]?\s*KSA)/i,
    /(Mobiserve\b[^\n]{0,30})/i,
  ]) || 'Mobiserve KSA'

  const lineItems  = parseMobiserveItems(text)
  const totalValue = parseAmount(rawTotal) ||
    lineItems.reduce((s, l) => s + l.lineTotal, 0)

  return {
    rawPoNumber, rawDate, rawTotal,
    poNumber:   rawPoNumber,
    poDate:     normaliseDate(rawDate),
    totalValue,
    currency:   'SAR',
    vatNumber:  '',
    issuerName: rawIssuer,
    paymentTerms: 30,
    lineItems,
  }
}

// ─────────────────────────────────────────────────────────────────
// SBM / IBM SAP SPECIALISED PARSER
// ─────────────────────────────────────────────────────────────────

/**
 * SBM/IBM PO — SUB-ITEM extraction (the actual invoiceable milestones).
 *
 * Structure per top-level section:
 *   "N   1   Activ."               ← top-level header (lump sum, NOT invoiced directly)
 *   "unit" / "gross   net"         ← top-level lump sum price (skip)
 *   "Category Name"                ← category label (skip)
 *   "The item covers..."           ← skip
 *   "10 Sub-item description"      ← sub-item 10  ← INVOICE LINE
 *     "(AVAYO)" / "PART#..."       ← part ref (strip from desc)
 *     "(UNIT-ROOM)"                ← unit type (skip)
 *     "42.000   EA   4,500.00   189,000.00"  ← qty, UM, unit price, net amount
 *   "20 Sub-item description"      ← sub-item 20  ← INVOICE LINE
 *     ...
 *   "100"                          ← 3-digit sub-item # on own line
 *   "Sub-item description"
 *     "36,000.000"                 ← standalone quantity
 *     "EA   3.00   108,000.00"     ← UM, unit price, net amount
 *
 * Sub-items always end with a "qty EA unitPrice netAmount" line.
 * Sub-item numbers are multiples of 10 (10, 20, 30 ... 100, 110 ...).
 */
function parseSBMIBMItems(text, lines) {
  const items   = []

  // Lines to skip when accumulating sub-item descriptions
  const JUNK = /^(PART#|PART #|PART-|\(UNIT-|\(PART#|PFS-SBM|PSF-SBM|The item covers|unit$|Item\s+Material|Purchase Order|Page \d|VAT\.|Jeddah|Riyadh|Khobar|Dammam|http|P\.O\.Box|Tel:|Fax:|INSTRUCTIONS|Terms of|Your responsible|FOB|Invoice Address|Shipping Address|Vendor Address|_+|---\s*PAGE BREAK|Notes\b|C\.R\.|Attention|Quoat|SOW#|This purchase|Information|>)/i

  let inSection     = false   // true once inside a top-level section
  let pendingQty    = null    // lone quantity line before "EA price price"
  let descLines     = []      // accumulator for current sub-item description
  let subPending    = false   // a sub-item has been started and needs its price
  let inHeader      = false   // collecting main-item description for the section header row
  let mainDescLines = []      // accumulator for the section header description

  // Strip part-number and unit-type fragments from a description string
  function cleanDesc(s) {
    return s
      .replace(/\s+PART\s*[#-]\s*\S*/ig, '')       // PART#xxx, PART# xxx, PART-xxx, PART- Vendor
      .replace(/\s+\(UNIT-[^)]*\)/ig, '')           // (UNIT-LM), (UNIT-ROOM) etc
      .replace(/\s+\(PART[#-][^)]*\)/ig, '')        // (PART#SBM), (PART-xxx)
      .replace(/\s+\([A-Z][A-Z0-9\-]{2,}\)/g, '')  // standalone codes like (AVAYO), (YORK), (HID)
      .trim()
  }

  // Emit the accumulated section header as an is_header row
  function flushHeader() {
    if (!inHeader) return
    inHeader = false
    if (mainDescLines.length === 0) { mainDescLines = []; return }
    const raw = mainDescLines
      .map(cleanDesc)
      // Skip lines that are purely price/amount values (e.g. "57,000.00 57,000.00")
      .filter(d => d.length >= 3 && !JUNK.test(d) && !/^[\d,\.\s]+$/.test(d) && !/^\d[\d,\.]+\s+\d[\d,\.]+$/.test(d))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    mainDescLines = []
    if (raw.length >= 4) {
      items.push({ description: raw, quantity: 0, unitPrice: 0, vatRate: 0, lineTotal: 0, is_header: true })
    }
  }

  function flushSubItem(qty, unitPrice, netAmount) {
    if (!subPending || netAmount <= 0) {
      // Nothing to push — just reset accumulators
      subPending = false; descLines = []; pendingQty = null; return
    }
    const raw = descLines
      .map(cleanDesc)
      .filter(d => d.length >= 2 && !JUNK.test(d))
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/^[&>\s]+/, '')
      .trim()
    if (raw.length >= 4 && !/^[\d\s,\.]+$/.test(raw)) {
      items.push({
        description: raw,
        quantity:    qty || 1,
        unitPrice:   unitPrice || (netAmount / (qty || 1)),
        vatRate:     15,
        lineTotal:   netAmount,
      })
    }
    subPending = false; descLines = []; pendingQty = null
  }

  const allLines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean)

  for (const ln of allLines) {

    // ── Top-level section marker: "1   1   Activ.", "2   1   Activ.", ... ──
    if (/^\d\s+1\s+Activ\./i.test(ln)) {
      flushHeader()                        // flush any previous header (adjacent sections)
      flushSubItem(1, 0, 0)               // close any open sub-item
      inSection = true
      inHeader = true; mainDescLines = [] // start collecting section header description
      pendingQty = null; continue
    }
    if (!inSection) continue

    // Skip "unit" row (continuation of "1 Activ. unit")
    if (/^unit$/i.test(ln)) continue

    // ── Standalone 3-decimal quantity line: "42.000", "5,000.000", "36,000.000" ──
    if (/^\d[\d,]*\.\d{3}$/.test(ln)) {
      pendingQty = parseFloat(ln.replace(/,/g, '')) || 1; continue
    }

    // ── Price line — "qty   EA   unitPrice   netAmount" (all formats) ──
    // Format A: "42.000   EA   4,500.00   189,000.00"
    const mFull  = ln.match(/^([\d,]+\.?\d*)\s+EA\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/i)
    // Format B: "EA   90.00   450,000.00"  (qty on previous standalone line)
    const mShort = !mFull && ln.match(/^EA\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})$/i)

    if (mFull) {
      flushSubItem(
        parseFloat(mFull[1].replace(/,/g, '')) || 1,
        parseAmount(mFull[2]),
        parseAmount(mFull[3]),
      ); continue
    }
    if (mShort) {
      flushSubItem(pendingQty || 1, parseAmount(mShort[1]), parseAmount(mShort[2])); continue
    }

    // ── Sub-item start: "10 Description...", "20 Description..." ──
    const mSubLine = ln.match(/^(\d{1,3})\s+(.+)/)
    if (mSubLine && parseInt(mSubLine[1]) >= 10 && parseInt(mSubLine[1]) % 10 === 0) {
      flushHeader()                        // emit header row before first sub-item
      flushSubItem(1, 0, 0)               // close previous sub-item
      subPending = true
      const d = cleanDesc(mSubLine[2])
      descLines = d && !JUNK.test(d) ? [d] : []
      continue
    }

    // ── Sub-item number alone on its line: "100", "110", "140" ──
    if (/^\d{2,3}$/.test(ln) && parseInt(ln) % 10 === 0) {
      flushHeader()                        // emit header row before first sub-item
      flushSubItem(1, 0, 0)
      subPending = true; descLines = []; continue
    }

    // ── Skip known junk ──
    if (JUNK.test(ln)) continue
    if (/^[\d,\.]+$/.test(ln)) continue   // pure-number lines

    // ── Accumulate description lines ──
    if (inHeader) {
      const d = cleanDesc(ln)
      if (d.length >= 3 && !JUNK.test(d)) mainDescLines.push(d)
    } else if (subPending) {
      const d = cleanDesc(ln)
      if (d.length >= 3 && !JUNK.test(d)) descLines.push(d)
    }
  }

  flushSubItem(1, 0, 0)   // flush last item
  return items
}

function parseSBMIBM(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // PO number:
  //   PDF.js:   "Purchase Order No. 4049608"  (same line)
  //   pdfminer: labels first, then values (separate lines)
  const rawPoNumber = firstMatch(text, [
    /Purchase Order No\.\s*(\d{5,10})\b/i,           // PDF.js same-line
    /Purchase Order No\.[\s\S]{0,300}?^(\d{5,10})$/m, // pdfminer
  ]) || firstMatch(text, [/\b(4\d{6,9})\b/])           // SBM POs often start with 4

  // Date: "Date 04.07.2022" (PDF.js) or bare DD.MM.YYYY
  const rawDate = firstMatch(text, [
    /\bDate\s+(\d{2}\.\d{2}\.\d{4})/i,
    /\b(\d{2}\.\d{2}\.\d{4})\b/,
  ])

  // Total: "Total Value SAR ___ 3,850,000.00"
  const rawTotal = firstMatch(text, [
    /Total Value SAR[\s\S]{0,40}?([\d,]+\.\d{2})/i,
    /Total Value[\s\S]{0,10}?([\d,]+\.\d{2})/i,
  ])

  // VAT: "VAT.3XXXXXXXXXXXXXX" in footer
  const rawVat = firstMatch(text, [
    /VAT\.(3\d{14})/,
    /VAT\s*(?:No\.?)?\s*[:\-]?\s*(3\d{14})/i,
  ])

  // Issuer
  const rawIssuer = firstMatch(text.slice(0, 400), [
    /^(SBM\s*[-–]\s*[^\n]+)/m,
    /^([A-Z][A-Za-z ]+(?:MACHINES|Business Machines)[^\n]*)/m,
  ]) || 'Saudi Business Machines Ltd.'

  const lineItems  = parseSBMIBMItems(text, lines)
  const totalValue = parseAmount(rawTotal) ||
    lineItems.reduce((s, l) => s + l.lineTotal, 0)

  return {
    rawPoNumber, rawDate, rawTotal, rawVat, rawIssuer,
    poNumber:   rawPoNumber,
    poDate:     normaliseDate(rawDate),
    totalValue,
    currency:   'SAR',
    vatNumber:  rawVat || '',
    issuerName: rawIssuer,
    lineItems,
  }
}

// ─────────────────────────────────────────────────────────────────
// CISCO PO SPECIALISED PARSER
// ─────────────────────────────────────────────────────────────────

/**
 * Cisco PO format (PDF.js row-major):
 *   "Purchase Order:   GBR000BL1012394CW   PO Revision   0   Payment Terms   NET 60 ..."
 *   "Date of Order   10-AUG-25   Freight Terms   PREPAY&BILL"
 *   "Supplier Number   283076"
 *   Table header: "Line   Supplier Item/Descr/Ref Num   Delivery Date   Qty   UOM   Unit Price   Extension"
 *   Row: "1   MP-CX PCOGS-59887-...   30-JUN-26   400,000.00   EACH   USD   1   USD   400,000.00"
 *   Footer: "Total :   USD   400,000.00"
 *           "CISCO 003 Rev 5/04   All prices and amounts on this order are expressed in USD"
 */
function parseCiscoItems(text) {
  // PDF.js row-major layout for Cisco POs (confirmed from actual browser extraction):
  //   Table header row:  "Delivery   Date   Qty   UOM   Unit Price   Extension"
  //   Item desc row:     "1   MP-CX PCOGS-...-TO-"
  //   Continuation row:  "30-JUN-2026-NEW-SERVICES"
  //   Amounts row:       "30-JUN-26   400,000.00   EACH   1   400,000.00"   ← no USD tokens
  //   End:               "Total :"
  const items = []
  const allLines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean)

  let inTable = false
  let pendingDesc = null

  for (const ln of allLines) {
    // Table start: header row containing "Delivery Date" and "Unit Price"
    if (/Delivery\s+Date.*Unit\s+Price/i.test(ln)) { inTable = true; continue }
    if (!inTable) continue
    if (/^Total\s*:/i.test(ln)) break

    // New line item: "1   MP-CX PCOGS-..."
    const mDesc = ln.match(/^(\d{1,3})\s+([A-Za-z].{3,})/)
    if (mDesc && parseInt(mDesc[1]) <= 999) {
      pendingDesc = mDesc[2].trim()
      continue
    }

    // Amounts line: "30-JUN-26   400,000.00   EACH   1   400,000.00"
    // (no currency code on this line in PDF.js output)
    const mAmt = ln.match(/^\d{1,2}-[A-Za-z]{3}-\d{2,4}\s+([\d,]+\.\d{2})\s+EACH\s+([\d,]+(?:\.\d*)?)\s+([\d,]+\.\d{2})\s*$/i)
    if (mAmt && pendingDesc) {
      const ext = parseAmount(mAmt[3])
      if (ext > 0) {
        items.push({ description: pendingDesc.replace(/\s*-\s*$/, '').trim(),
          quantity: 1, unitPrice: ext, vatRate: 0, lineTotal: ext })
      }
      pendingDesc = null
      continue
    }

    // Description continuation — skip noise lines
    if (pendingDesc &&
        !/^(USD|Total|CISCO\s+\d|Cost Center|All prices|FAX_INFO)/i.test(ln) &&
        !/^[\d,\.]+$/.test(ln)) {
      pendingDesc += ' ' + ln.trim()
    }
  }

  return items
}

function parseCisco(text) {
  // ── PO Number ──────────────────────────────────────────────────
  // PDF.js produces "Purchase   Order:   GBR000BL1012394CW" (multiple spaces).
  // FAX_INFO hidden printer line is even more reliable: "FAX_INFO:GBR000BL1012394CW:0:..."
  const rawPoNumber = firstMatch(text, [
    /FAX_INFO:([A-Z][A-Z0-9]{5,}):/i,
    /Purchase\s+Order:\s+([A-Z]{2,}[A-Z0-9\-]{4,})/i,
  ])

  // ── Date ───────────────────────────────────────────────────────
  // PDF.js puts the date VALUE first, label after:
  //   "10-AUG-25 Date   of   Order   Freight Terms   PREPAY&BILL"
  // Avoid the broad fallback — line-item description contains "01-AUG-2025"
  // which would be matched first and produce the wrong date.
  const rawDate = firstMatch(text, [
    /(\d{1,2}-[A-Za-z]{3}-\d{2,4})\s+Date\s+of\s+Order/i,   // value-before-label (PDF.js)
    /Date\s+of\s+Order\s+(\d{1,2}-[A-Za-z]{3}-\d{2,4})/i,   // label-before-value (fallback)
  ])

  // ── Payment terms ──────────────────────────────────────────────
  // PDF.js line: "0 PO   Revision   Payment Terms   1 1 of Page NET 60"
  // "1 1 of Page" (= "Page 1 of 1") is mixed in, so match NET directly
  const rawPayTerms = firstMatch(text, [/\bNET\s+(\d{2,3})\b/i])

  // Currency: footer "expressed in USD" or column header
  const rawCurrency = firstMatch(text, [
    /expressed in\s+([A-Z]{3})/i,
    /Total\s*:\s*([A-Z]{3})\s+[\d,]+\.\d{2}/i,
  ]) || detectCurrency(text)

  // Total: PDF.js puts "Total :" alone on one line, "400,000.00" on the next.
  // Match on same line (pdfplumber style) OR across a line break (PDF.js style).
  const rawTotal = firstMatch(text, [
    /Total\s*:\s*(?:[A-Z]{3}\s+)?([\d,]+\.\d{2})/i,       // same-line
    /Total\s*:[\s\S]{0,200}?([\d,]+\.\d{2})/i,             // next-line (up to 200 chars away)
  ])

  // Issuer name from "Cisco International Limited" in Bill To block
  const rawIssuer = firstMatch(text, [
    /(Cisco International[^\n,]*)/i,
    /(Cisco[^\n,]{3,40})/i,
  ]) || 'Cisco International Limited'

  const lineItems  = parseCiscoItems(text)
  const totalValue = parseAmount(rawTotal) ||
    lineItems.reduce((s, l) => s + l.lineTotal, 0)

  return {
    rawPoNumber, rawDate, rawTotal,
    poNumber:     rawPoNumber,
    poDate:       normaliseDate(rawDate),
    totalValue,
    currency:     rawCurrency || 'USD',
    vatNumber:    '',
    issuerName:   rawIssuer,
    paymentTerms: rawPayTerms ? parseInt(rawPayTerms) : 60,
    lineItems,
  }
}

// ─────────────────────────────────────────────────────────────────
// ZTE ENGINEERING SERVICE PO PARSER
// ─────────────────────────────────────────────────────────────────
/**
 * ZTE format (confirmed from pdfplumber / PDF.js row-major):
 *   Header fields:  "PO No.  S2SA20250429004WBF1-\n15"  (split across lines)
 *                   "Currency  SAR"
 *                   "Date:  2026-01-22 16:10:09"
 *   Table header:   "PO Line No.  Purchasing Area  ...  Unit Price  PO Line Subtotal(Excluding tax)"
 *   Item row:       "1  Saudi  XN2024-MN12316  1-270755361730  35000067  Service acceptance  Ho  1  242.68  242.68"
 *   Continuation:   "Arabia  MN12316  270755361730  6050  & Integration with  p"
 *   Total:          "Total Amount:  32589 SAR"
 */
function parseZTEItems(text) {
  // PDF.js row-major extracts each ZTE table CELL on its own line:
  //   "1   Saudi"           ← lineNo + "Saudi" (purchasing area first word, same Y)
  //   "Arabia"              ← purchasing area second word
  //   "XN2024-"             ← delivery object code part 1
  //   "MN12316"             ← delivery object code part 2
  //   "1-"  or "Rep-C0473-" ← delivery object name part 1
  //   "270755361730"        ← delivery object name part 2
  //   "35000067"            ← item code prefix (SENTINEL — description follows)
  //   "6050"                ← item code suffix (skip 1 line)
  //   "Service acceptance"  ← Item Name line 1  ← COLLECT from here
  //   "& Integration with"  ← Item Name line 2
  //   ...
  //   "Ho"                  ← unit first word (skip)
  //   "p"                   ← unit second word (skip)
  //   "1   242.68   242.68" ← qty  unitPrice  subtotal  (same Y → one line)
  const items = []
  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean)

  // State machine
  const S = { WAIT: 0, SEEK_SENTINEL: 1, SKIP_SUFFIX: 2, COLLECT: 3 }
  let inTable = false
  let state   = S.WAIT
  let descLines = [], curPrice = 0

  // Column header fragments to ignore
  const HEADER_FRAG = /^(No\.|Purchasing|Area|Object\s+Code|Object\s+Name|Item\s*Code|Item\s+Name|Un$|it$|Quantit|Subtotal|Excludin|tax\)?|PO\s+Line|g\s+tax)$/i
  const UNIT_LINE   = /^(Ho|Set|Rol|Ea|Pcs?|p)$/i

  function flushItem () {
    if (descLines.length && curPrice > 0) {
      // Join lines, then fix PDF mid-word breaks:
      // e.g. "delivery/acceptanc" + "e) UAT" → "delivery/acceptance) UAT"
      // Pattern: [lowercase] [space] [lowercase][non-letter] → remove the space
      let d = descLines.join(' ')
        .replace(/([a-z]) ([a-z][^a-zA-Z\s])/g, '$1$2')
        .replace(/\s+/g, ' ').replace(/\s*-Mobily\s*$/i, '-Mobily').trim()
      if (d.length >= 3)
        items.push({ description: d, quantity: 1, unitPrice: curPrice,
                     vatRate: 15, lineTotal: curPrice })
    }
    descLines = []; curPrice = 0; state = S.WAIT
  }

  for (const ln of lines) {
    // Table start: "PO Line" alone on one line (column header wraps in PDF)
    if (!inTable && /^PO\s+Line\s*$/i.test(ln)) { inTable = true; continue }
    if (!inTable) continue

    if (/Total\s+Amount:/i.test(ln)) { flushItem(); break }
    if (/---\s*PAGE BREAK/i.test(ln)) continue

    // Repeated page headers — ignore column header fragments
    if (HEADER_FRAG.test(ln)) continue

    // ── State: WAIT — looking for item start "N   Saudi" ──────────
    if (state === S.WAIT) {
      if (/^\d{1,2}\s+Saudi\s*$/.test(ln)) { state = S.SEEK_SENTINEL }
      continue
    }

    // ── State: SEEK_SENTINEL — skip codes until "35000067" ────────
    if (state === S.SEEK_SENTINEL) {
      if (/^35000067$/.test(ln)) { state = S.SKIP_SUFFIX }
      continue
    }

    // ── State: SKIP_SUFFIX — skip one line (4-digit code suffix) ──
    if (state === S.SKIP_SUFFIX) { state = S.COLLECT; continue }

    // ── State: COLLECT — gather description lines ──────────────────
    if (state === S.COLLECT) {
      // Amounts line — two forms:
      //   "1   242.68   242.68"           (Ho/p units split to separate lines)
      //   "Set   1   356.31   356.31"     (Set unit on same line as amounts)
      const mAmt = ln.match(/^(?:(?:Ho|Set|Rol|Ea|Pcs?)\s+)?(\d+(?:\.\d+)?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/i)
      if (mAmt) {
        curPrice = parseAmount(mAmt[3])   // last number = PO Line Subtotal
        flushItem()
        continue
      }

      // Skip unit abbreviations ("Ho", "p", "Set", etc.)
      if (UNIT_LINE.test(ln)) continue

      // Accumulate description
      if (ln.length >= 2) descLines.push(ln)
    }
  }
  flushItem()
  return items
}

function parseZTE(text) {
  // PO#: "PO No.   S2SA20250429004WBF1-\n15" — value may wrap to next line
  // Strategy: find "PO No." then look at same line AND next line for the number
  const lines = text.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean)
  let rawPoNumber = null
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/PO\s+No\.?\s+(\S+)/)
    if (m) {
      let po = m[1].replace(/\s+/g, '')
      // If it ends with "-", the remainder is on the next line
      if (po.endsWith('-') && lines[i + 1] && /^\d+$/.test(lines[i + 1].trim())) {
        po = po + lines[i + 1].trim()
      }
      // Reject bare numbers (like "0" from "Version No. 0")
      if (po.length >= 6) { rawPoNumber = po; break }
    }
  }

  // Date: "Date:   2026-01-22 16:10:09" → take date part only
  const rawDate = firstMatch(text, [
    /\bDate:\s+(\d{4}-\d{2}-\d{2})/i,
    /Planning\s+Start\s+Date\s+(\d{4}-\d{2}-\d{2})/i,
  ])

  // Currency
  const rawCurrency = firstMatch(text, [/Currency\s+(SAR|USD|EUR|GBP)/i]) || detectCurrency(text)

  // Total: "Total Amount:   32589 SAR"
  const rawTotal = firstMatch(text, [/Total\s+Amount:\s*([\d,]+(?:\.\d{2})?)/i])

  // Issuer: always ZTE
  const rawIssuer = firstMatch(text, [/(ZTE\s+HK\s+LIMITED[^\n,]{0,30})/i]) || 'ZTE HK LIMITED SAUDI ARABIA'

  const lineItems  = parseZTEItems(text)
  const totalValue = parseAmount(rawTotal) ||
    lineItems.reduce((s, l) => s + l.lineTotal, 0)

  return {
    rawPoNumber, rawDate, rawTotal,
    poNumber:     rawPoNumber,
    poDate:       normaliseDate(rawDate),
    totalValue,
    currency:     rawCurrency || 'SAR',
    vatNumber:    '',
    issuerName:   rawIssuer,
    paymentTerms: 30,
    lineItems,
  }
}

// ─────────────────────────────────────────────────────────────────
// STC BLANKET RELEASE SPECIALISED PARSER
// ─────────────────────────────────────────────────────────────────

/**
 * Extracts every line item from an stc Blanket Release PDF.
 *
 * stc Blanket Release has TWO layout variants:
 *   A) description BEFORE qty  (multi-page releases):
 *        Supplier Item:{code} → Promised/Needed dates → {description} → Item Type → {qty} Each → {price} N → {amount}
 *   B) description AFTER amount (short releases):
 *        Supplier Item:{code} → Promised/Needed dates → {qty} Each → {price} N → {amount} → {description} → Item Type
 *
 * Strategy: split text on "Supplier Item:" boundaries → one block per item.
 * Per block try A first, then B.
 */
function parseSTCBlanketItems(text) {
  const ITEM_RE = /(\d+)\s+Each\s+(\d[\d,]*)\s+N\s+([\d,]+\.[\d]{2})/

  const DESC_SKIP = /^(Item Type|Ship To|Deliver To|Promised|Needed|Page \d|Proprietary|fchennam|Email Address|Use the ship|Blanket Release|\d+-\d+|0500|011\)|Line$|Part Number|Quantity|Unit Price|^Tax$|Amount|Delivery Date|Solutions by stc|Riyadh|Saudi Arabia|Aboobacker|\(SAR\)|STCS|Vat No|Payment Terms|Freight|Effective|Contact|Requester|Notes|TERMS|00:00:00|[-\s]*PAGE BREAK[-\s]*|^-{3,}$)/i

  function pickDesc(raw) {
    for (const ln of raw.split(/[\n\r]+/).map(l => l.trim())) {
      if (!ln || ln.length < 5) continue
      if (DESC_SKIP.test(ln)) continue
      if (/^\(?\d+\)?$|^\d{4}:\d{2}:\d{2}$/.test(ln)) continue
      return ln
    }
    return ''
  }

  // Split on each "Supplier Item:" — each block = one line item
  const blocks = text.split(/(?=Supplier Item:)/i)
  const items  = []

  for (const block of blocks) {
    const m = block.match(ITEM_RE)
    if (!m) continue

    const qty       = parseInt(m[1], 10)
    const unitPrice = parseAmount(m[2])
    const lineTotal = parseAmount(m[3])
    if (qty <= 0 || unitPrice <= 0) continue

    // Supplier code: after "Supplier Item:" up to first blank line / "Promised" / "{n} Each"
    const codeRaw = block.match(/Supplier Item:([\s\S]*?)(?=\n\n|\nPromised|\nNeeded|\d+\s+Each)/i)
    const code    = codeRaw ? codeRaw[1].replace(/\s+/g, ' ').trim() : ''

    // Locate anchors inside the block
    const qtyIdx   = block.indexOf(m[0])
    const beforeQty = block.slice(0, qtyIdx)
    const afterAmt  = block.slice(qtyIdx + m[0].length)

    // Strategy A: description before qty (between last "Needed:" date and "Item Type")
    let desc = ''
    const neededPos   = beforeQty.lastIndexOf('Needed:')
    const itPosBefore = beforeQty.lastIndexOf('Item Type')
    if (neededPos >= 0 && itPosBefore > neededPos) {
      const section = beforeQty.slice(neededPos, itPosBefore)
      // skip the date line itself
      const lines = section.split(/[\n\r]+/).map(l => l.trim())
      let skipDate = true
      for (const ln of lines) {
        if (!ln) continue
        if (skipDate && /Needed:|^\d{2}-[A-Z]{3}-\d{4}|\d{2}:\d{2}:\d{2}/i.test(ln)) {
          skipDate = false; continue
        }
        skipDate = false
        if (ln.length < 5 || DESC_SKIP.test(ln)) continue
        desc = ln; break
      }
    }

    // Strategy B: description after amount (between amount and "Item Type")
    if (!desc) {
      const itPosAfter = afterAmt.indexOf('Item Type')
      const descRaw    = itPosAfter >= 0 ? afterAmt.slice(0, itPosAfter) : afterAmt.slice(0, 300)
      desc = pickDesc(descRaw)
    }

    const label = code
      ? (desc ? `[${code}] ${desc}` : code)
      : (desc || 'Service / Supply')

    items.push({
      description: label,
      quantity:    qty,
      unitPrice,
      vatRate:     0,   // stc POs: "No Tax-Local Supplier"
      lineTotal,
    })
  }

  return items
}

function parseSTCBlanket(text) {
  // PO Number: "Order 40057-2" or "Blanket Release 40057-2, 0"
  const rawPoNumber =
    firstMatch(text, [
      /^Order\s+([\d\-]+)/im,
      /Blanket Release\s+([\d\-]+)/i,
    ]) ||
    firstMatch(text, [/Order\s+([\d\-]+)/i])

  // Date: "Order Date 29-JUL-2026"
  const rawDate = firstMatch(text, [
    /Order Date\s+(\d{1,2}[\-\s][A-Za-z]{3}[\-\s]\d{4})/i,
    /\b(\d{1,2}-[A-Za-z]{3}-\d{4})\b/,
  ])

  // Total: "Total: 66,300.00  (SAR)" (release-level total at end of doc)
  const rawTotal = firstMatch(text, [
    /Total:\s*([\d,]+\.\d{2})\s*\(SAR\)/i,
    /Amount Agreed\s*\(SAR\)\s*([\d,]+\.\d{2})/i,
  ])

  // VAT numbers
  const rawVat = firstMatch(text, [
    /STCS?\s*Vat No:\s*(\d{15})/i,
    /Supplier\s*Vat No:\s*(\d{15})/i,
    /\b(3\d{14})\b/,
  ])

  // Issuer: first company name in header
  const headerText = text.slice(0, 500)
  const rawIssuer  = firstMatch(headerText, [
    /^([A-Z][a-zA-Z &.]+(?:by stc|stc|GROUP|LLC|LTD|CO\.))/m,
    /^(Solutions by stc)/im,
  ]) || firstMatch(text, [
    /(?:Buyer|Bill To|Issued By|From)\s*[:\-]?\s*([A-Za-z][^\n]{3,60})/i,
  ])

  const lineItems  = parseSTCBlanketItems(text)
  const totalValue = parseAmount(rawTotal) ||
    lineItems.reduce((s, l) => s + l.lineTotal, 0)

  return {
    rawPoNumber, rawDate, rawTotal, rawVat, rawIssuer,
    poNumber:   rawPoNumber,
    poDate:     normaliseDate(rawDate),
    totalValue,
    currency:   'SAR',
    vatNumber:  rawVat?.replace(/\s/g, '') || '',
    issuerName: rawIssuer,
    lineItems,
  }
}

// ─────────────────────────────────────────────────────────────────
// GENERIC FIELD PATTERNS  (Nokia SAP + everything else)
// ─────────────────────────────────────────────────────────────────

const PO_NUMBER_PATTERNS = [
  /Purchase\s+Doc(?:ument)?\s+(?:No|Number|#|No\.)\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
  /Purchase\s+Order\s+(?:No|Number|#|No\.)\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
  /P\.?O\.?\s*(?:No|Number|#|No\.)\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
  /PO\s*#\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
  /Order\s*(?:No|Number|#)\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
  /\b(45\d{8})\b/,
  /Ref(?:erence)?\s*(?:No|#)?\s*[:\-]?\s*([A-Z0-9\-\/]{6,20})/i,
]

const DATE_PATTERNS = [
  // Nokia compact: "Doc Date: 17Mar2026"
  /(?:Doc(?:ument)?\s+Date|PO\s+Date|Order\s+Date|Issue\s+Date|Date\s+of\s+Order)\s*[:\-]?\s*(\d{1,2}[A-Za-z]{3}\d{4})/i,
  // stc: "Order Date 29-JUL-2026"
  /(?:Doc(?:ument)?\s+Date|PO\s+Date|Order\s+Date|Issue\s+Date|Date\s+of\s+Order)\s*[:\-]?\s*(\d{1,2}[\-\s][A-Za-z]{3}[\-\s]\d{4})/i,
  // Standard numeric with label
  /(?:Doc(?:ument)?\s+Date|PO\s+Date|Order\s+Date|Issue\s+Date|Date\s+of\s+Order|Date)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/i,
  /(?:Doc(?:ument)?\s+Date|PO\s+Date|Order\s+Date|Issue\s+Date|Date\s+of\s+Order|Date)\s*[:\-]?\s*(\d{4}[\/\-]\d{2}[\/\-]\d{2})/i,
  /(?:Doc(?:ument)?\s+Date|PO\s+Date|Order\s+Date|Issue\s+Date|Date)\s*[:\-]?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i,
  /(?:Doc(?:ument)?\s+Date|PO\s+Date|Order\s+Date|Issue\s+Date|Date)\s*[:\-]?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})/i,
  // Fallback: DD-MMM-YYYY anywhere
  /\b(\d{1,2}-[A-Za-z]{3}-\d{4})\b/,
  // Fallback: compact
  /\b(\d{1,2}[A-Za-z]{3}\d{4})\b/,
  /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b/,
  /\b(\d{1,2}\.\d{1,2}\.\d{4})\b/,
  /\b(\d{4}[\/\-]\d{2}[\/\-]\d{2})\b/,
]

const TOTAL_PATTERNS = [
  /Total\s+Value\s*[:\-]?\s*(?:SAR|USD|EUR|GBP)?\s*([\d.,]+)/i,
  /Total:\s*([\d,]+\.\d{2})\s*\(?(?:SAR|USD|EUR|GBP)\)?/i,
  /Total\s+(?:Amount|Price)\s*(?:incl\.?\s*(?:VAT|Tax))?\s*[:\-]?\s*(?:SAR|USD|EUR|GBP)?\s*([\d.,]+)/i,
  /Grand\s+Total\s*[:\-]?\s*(?:SAR|USD|EUR|GBP)?\s*([\d.,]+)/i,
  /(?:Net\s+)?Total\s*[:\-]?\s*(?:SAR|USD|EUR|GBP)?\s*([\d.,]+)/i,
  /Amount\s+(?:Due|Payable|Agreed)\s*[:\-]?\s*(?:SAR|USD|EUR|GBP)?\s*\(?\s*([\d.,]+)\s*\)?/i,
  /(?:SAR|USD|EUR|GBP)\s+([\d.,]+(?:\.\d{2}|,\d{2})?)\b/,
  /([\d]{1,3}(?:[\.,]\d{3})+(?:,\d{2})?)\s*(?:SAR|USD|EUR|GBP)/,
  /([\d,]+\.\d{2})\s*(?:SAR|USD|EUR|GBP)/,
]

const VAT_PATTERNS = [
  /VAT\s*(?:Registration\s*)?(?:No|Number|#|No\.)\s*[:\-]?\s*(\d[\d\s]{10,18}\d)/i,
  /Tax\s*(?:Registration\s*)?(?:No|Number|#)\s*[:\-]?\s*(\d[\d\s]{10,18}\d)/i,
  /TRN\s*[:\-]?\s*(\d[\d\s]{10,18}\d)/i,
  /\b(3\d{14})\b/,
]

const ISSUER_PATTERNS = [
  /(?:Buyer|Issued\s+By|From|Bill\s+To|Company\s+Name|Purchaser)\s*[:\-]?\s*([A-Za-z][^\n]{3,60})/i,
  /^([A-Z][A-Z\s&\.,]+(?:CO\.|LLC|LTD|COMPANY|CORPORATION|CORP|GROUP|INC)\.?)/m,
]

// ─────────────────────────────────────────────────────────────────
// GENERIC LINE ITEM PARSER
// ─────────────────────────────────────────────────────────────────

const STATUS_ROW  = /^(Delivered|Open|Closed|Pending|In\s+Process|Partially\s+Delivered|Cancelled|Completed|Released)$/i
const HEADER_WORD = /^(line|item|no\.|s\.no|qty|quantity|unit|price|amount|total|service|material|description|tax|vat)$/i
const DATE_LIKE   = /^\d{1,2}[A-Za-z]{3}\d{4}$|^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$|^\d{1,2}-[A-Za-z]{3}-\d{4}$/

function parseCellNumber(c) {
  if (/^\d{1,3}(?:\.\d{3})+,\d{1,2}$/.test(c)) {
    const v = parseFloat(c.replace(/\./g,'').replace(',','.')) || 0
    return { val: v, isNum: v > 0 }
  }
  if (/^\d{1,3}(?:\.\d{3})+$/.test(c)) {
    const v = parseFloat(c.replace(/\./g,'')) || 0
    return { val: v, isNum: v > 0 }
  }
  if (/^[\d,]+\.?\d*$/.test(c)) {
    const v = parseFloat(c.replace(/,/g,'')) || 0
    return { val: v, isNum: v > 0 }
  }
  return { val: 0, isNum: false }
}

function parseLineItems(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  const items = []

  const HEADER_RE = /(?:desc|item|part|service|qty|quant|unit\s*price|amount|short\s*text)/i
  let headerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (HEADER_RE.test(lines[i]) && lines[i].split(/\s{2,}|\t/).length >= 3) {
      headerIdx = i; break
    }
  }
  if (headerIdx === -1) return items

  const STOP_RE = /^\s*(?:sub.?total|grand\s+total|total\s+(?:amount|value)|vat\s+amount|tax\s+amount|discount|net\s+total|amount\s+due)/i

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (STOP_RE.test(line)) break

    const cols = line.split(/\s{2,}|\t/).map(c => c.trim()).filter(Boolean)
    if (cols.length < 2) continue
    if (cols.every(c => HEADER_WORD.test(c))) continue
    if (STATUS_ROW.test(cols[0])) continue

    const nonDateCols = cols.filter(c => !DATE_LIKE.test(c) && !STATUS_ROW.test(c))
    if (nonDateCols.length === 0) continue

    const numCols = cols.map((c, idx) => {
      const { val, isNum } = parseCellNumber(c)
      return { idx, val, isNum }
    })
    const nums = numCols.filter(c => c.isNum)
    if (nums.length === 0) continue

    const maxNum = Math.max(...nums.map(n => n.val))
    const descCandidate = cols[0]
    if (maxNum <= 100 && (STATUS_ROW.test(descCandidate) || descCandidate.length < 3)) continue
    if (DATE_LIKE.test(descCandidate) && nums.length <= 1 && maxNum <= 100) continue

    let description = descCandidate, quantity = 1, unitPrice = 0, lineTotal = 0

    if (nums.length >= 3) {
      quantity  = nums[nums.length - 3].val || 1
      unitPrice = nums[nums.length - 2].val
      lineTotal = nums[nums.length - 1].val
    } else if (nums.length === 2) {
      const a = nums[0].val, b = nums[1].val
      if (a <= 1000 && b > a) { quantity = a || 1; unitPrice = b; lineTotal = quantity * unitPrice }
      else { unitPrice = Math.min(a,b); lineTotal = Math.max(a,b); quantity = unitPrice > 0 ? Math.round(lineTotal/unitPrice) : 1 }
    } else {
      lineTotal = nums[0].val; unitPrice = lineTotal
    }

    if (lineTotal === 0 && unitPrice === 0) continue
    items.push({
      description: description || 'Service / Supply',
      quantity:    quantity || 1,
      unitPrice,
      vatRate:     15,
      lineTotal:   lineTotal || quantity * unitPrice,
    })
  }
  return items
}

// ─────────────────────────────────────────────────────────────────
// MAIN EXPORT
// ─────────────────────────────────────────────────────────────────

/**
 * @param {string} fullText  — from extractPdfText().fullText
 */
export function parsePO(fullText) {
  const text = fullText || ''
  const fmt  = detectFormat(text)

  // ── SBM / IBM SAP — specialised path ───────────────────────
  if (fmt === 'SBM_IBM') {
    const s = parseSBMIBM(text)
    const found = [s.poNumber, s.poDate, s.totalValue > 0, s.vatNumber].filter(Boolean).length
    return {
      ...s,
      confidence:  found >= 3 ? 'HIGH' : found === 2 ? 'MEDIUM' : 'LOW',
      rawMatches:  { rawPoNumber: s.rawPoNumber, rawDate: s.rawDate, rawTotal: s.rawTotal, rawVat: s.rawVat, rawIssuer: s.rawIssuer, format: 'SBM_IBM' },
    }
  }

  // ── Mobiserve KSA PO ────────────────────────────────────────
  if (fmt === 'MOBISERVE') {
    const s = parseMobiserve(text)
    const found = [s.poNumber, s.poDate, s.totalValue > 0].filter(Boolean).length
    return {
      ...s,
      confidence:  found >= 3 ? 'HIGH' : found === 2 ? 'MEDIUM' : 'LOW',
      rawMatches:  { rawPoNumber: s.rawPoNumber, rawDate: s.rawDate, rawTotal: s.rawTotal, format: 'MOBISERVE' },
    }
  }

  // ── ZTE Engineering Service PO ──────────────────────────────
  if (fmt === 'ZTE') {
    const s = parseZTE(text)
    const found = [s.poNumber, s.poDate, s.totalValue > 0].filter(Boolean).length
    return {
      ...s,
      confidence:  found >= 3 ? 'HIGH' : found === 2 ? 'MEDIUM' : 'LOW',
      rawMatches:  { rawPoNumber: s.rawPoNumber, rawDate: s.rawDate, rawTotal: s.rawTotal, format: 'ZTE' },
    }
  }

  // ── Cisco PO — specialised path ─────────────────────────────
  if (fmt === 'CISCO') {
    const s = parseCisco(text)
    const found = [s.poNumber, s.poDate, s.totalValue > 0].filter(Boolean).length
    return {
      ...s,
      confidence:  found >= 3 ? 'HIGH' : found === 2 ? 'MEDIUM' : 'LOW',
      rawMatches:  { rawPoNumber: s.rawPoNumber, rawDate: s.rawDate, rawTotal: s.rawTotal, format: 'CISCO' },
    }
  }

  // ── STC Blanket Release — specialised path ──────────────────
  if (fmt === 'STC_BLANKET') {
    const r = parseSTCBlanket(text)
    const found = [r.poNumber, r.poDate, r.totalValue > 0, r.vatNumber].filter(Boolean).length
    return {
      ...r,
      confidence:  found >= 3 ? 'HIGH' : found === 2 ? 'MEDIUM' : 'LOW',
      rawMatches:  {
        rawPoNumber: r.rawPoNumber,
        rawDate:     r.rawDate,
        rawTotal:    r.rawTotal,
        rawVat:      r.rawVat,
        rawIssuer:   r.rawIssuer,
        format:      'STC_BLANKET',
      },
    }
  }

  // ── Generic / Nokia SAP ─────────────────────────────────────
  const rawPoNumber = firstMatch(text, PO_NUMBER_PATTERNS)
  const rawDate     = firstMatch(text, DATE_PATTERNS)
  const rawTotal    = firstMatch(text, TOTAL_PATTERNS)
  const rawVat      = firstMatch(text, VAT_PATTERNS)

  const headerText = text.slice(0, 400)
  let rawIssuer = firstMatch(headerText, ISSUER_PATTERNS)
  if (!rawIssuer) rawIssuer = firstMatch(text, ISSUER_PATTERNS)

  const totalValue = parseAmount(rawTotal)
  const lineItems  = parseLineItems(text)

  const found = [rawPoNumber, normaliseDate(rawDate), totalValue > 0, rawVat?.replace(/\s/g,'')].filter(Boolean).length
  return {
    poNumber:   rawPoNumber,
    poDate:     normaliseDate(rawDate),
    totalValue,
    currency:   detectCurrency(text),
    vatNumber:  rawVat?.replace(/\s/g,'') || '',
    issuerName: rawIssuer,
    lineItems,
    confidence: found >= 3 ? 'HIGH' : found === 2 ? 'MEDIUM' : 'LOW',
    rawMatches: { rawPoNumber, rawDate, rawTotal, rawVat, rawIssuer, format: fmt },
  }
}
