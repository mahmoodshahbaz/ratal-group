/**
 * FormDailyExpense.jsx — v3 Expense Entry Wizard
 *
 * Screens (6):  Scan → Invoice → Category → Notes → Summary → Success
 * OCR strategy:
 *   1. BarcodeDetector → ZATCA QR TLV (instant, reliable for ZATCA invoices)
 *   2. Tesseract.js    → Text OCR via CDN for printed invoices without QR
 *   3. HANDWRITTEN     → Manual entry only, VAT fully disabled
 *
 * VAT field logic:
 *   disabled  – default before any photo / handwritten invoice
 *   auto      – QR scan succeeded (auto-populated, user can edit)
 *   manual    – QR failed + has photo (fields enabled for manual entry)
 *
 * Duplicate detection:
 *   - Server : check_duplicate_invoice RPC (same employee + invoice_number)
 *   - Session: track submitted numbers in component memory
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase }       from '../lib/supabase'
import { uploadToDrive }  from '../hooks/useDriveUpload'
import { useFieldAuth }   from '../lib/useFieldAuth'
import OTPActivationScreen from '../components/OTPActivationScreen'
import { COA }            from '../lib/autoPost'
import { MP }             from './formTheme'

// ─── Expense categories (exported — used by ExpenseClaims.jsx) ─────────────────
export const EXPENSE_CATEGORIES = [
  { key:'FUEL',          label:'Fuel',              labelAr:'وقود',            icon:'⛽', coa: COA.FIELD_EXPENSES },
  { key:'ACCOMMODATION', label:'Accommodation',     labelAr:'إقامة',           icon:'🏨', coa: COA.TRAVEL },
  { key:'MEALS',         label:'Meals / Food',      labelAr:'وجبات',           icon:'🍽️', coa: COA.FOOD_ALLOWANCE },
  { key:'TRANSPORT',     label:'Transport / Taxi',  labelAr:'مواصلات',         icon:'🚗', coa: COA.TRANSPORT_ALLOWANCE },
  { key:'MATERIALS',     label:'Materials / Tools', labelAr:'مواد وأدوات',     icon:'🔧', coa: COA.MATERIALS },
  { key:'COMMUNICATION', label:'SIM / Internet',    labelAr:'اتصالات',         icon:'📱', coa: COA.TELECOM },
  { key:'OFFICE',        label:'Office Supplies',   labelAr:'مستلزمات مكتبية', icon:'📎', coa: COA.OFFICE_SUPPLIES },
  { key:'GOVT_FEES',     label:'Govt / Visa Fees',  labelAr:'رسوم حكومية',     icon:'🏛️', coa: COA.GOVT_FEES },
  { key:'PARKING',       label:'Parking / Toll',    labelAr:'مواقف / رسوم',    icon:'🅿️', coa: COA.FIELD_EXPENSES },
  { key:'MISC',          label:'Miscellaneous',     labelAr:'متنوعات',         icon:'📦', coa: COA.MISC },
]

// ─── Step config ───────────────────────────────────────────────────────────────
const STEPS = [
  { id:'scan',     icon:'📷', label:'Scan',     num:1 },
  { id:'invoice',  icon:'📄', label:'Invoice',  num:2 },
  { id:'classify', icon:'🏷️', label:'Category', num:3 },
  { id:'notes',    icon:'📝', label:'Notes',    num:4 },
  { id:'summary',  icon:'✅', label:'Review',   num:null }, // not shown in progress bar
]

// ─── Per-step color themes (new MP palette) ────────────────────────────────────
// variant 'light' = cream screen; variant 'dark' = charcoal screen (summary only)
const T = {
  scan:     { variant:'light', bg:MP.cream,    hdrBg:MP.lightCard, color:'#3B6FE8', light:'#EBF0FD', dark:'#1D3A8A', accent:MP.yellow },
  invoice:  { variant:'light', bg:MP.cream,    hdrBg:MP.lightCard, color:'#D4763B', light:'#FDF3EC', dark:'#7C3A12', accent:MP.yellow },
  classify: { variant:'light', bg:MP.cream,    hdrBg:MP.lightCard, color:'#5E9E5A', light:'#EDF7EC', dark:'#285424', accent:MP.yellow },
  notes:    { variant:'light', bg:MP.cream,    hdrBg:MP.lightCard, color:'#9B72CF', light:'#F3EEF9', dark:'#4A1D8C', accent:MP.yellow },
  summary:  { variant:'dark',  bg:MP.charcoal, hdrBg:MP.darkCard,  color:MP.yellow, light:'rgba(247,210,99,0.15)', dark:MP.darkCard, accent:MP.green },
  success:  { variant:'light', bg:MP.cream,    hdrBg:MP.lightCard, color:'#4CAF82', light:'#EAF7F0', dark:'#1A5C38', accent:MP.yellow },
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0] }
function minDate() {
  const d = new Date(); d.setMonth(d.getMonth() - 3, 1)
  return d.toISOString().split('T')[0]
}
function isDevMode() {
  return new URLSearchParams(window.location.search).get('dev') === '1' ||
         localStorage.getItem('accsys_dev_mode') === '1'
}
function daysBetween(a, b) {
  if (!a || !b) return 0
  return Math.floor((new Date(b) - new Date(a)) / 86400000)
}
function lateStatus(invoiceDate) {
  if (!invoiceDate) return { level:'ok', days:0 }
  const d = daysBetween(invoiceDate, today())
  if (d <= 30)  return { level:'ok',    days:d }
  if (d <= 60)  return { level:'warn',  days:d, msg:`Invoice is ${d} days old — reason required` }
  if (d <= 90)  return { level:'block', days:d, msg:`${d} days old — DH must approve. Enter reason below.` }
  return               { level:'hard',  days:d, msg:`${d} days old — cannot submit. Contact Accounts.` }
}
function isValidVATNum(v) { return /^3\d{14}$/.test((v||'').trim()) }
function dateFromZATCA(ts) {
  if (!ts) return null
  const m = ts.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

// ─── ZATCA QR TLV decoder ──────────────────────────────────────────────────────
function decodeZATCAQR(raw) {
  try {
    const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0))
    const tags  = { 1:'seller', 2:'vatNumber', 3:'timestamp', 4:'totalWithVat', 5:'vatAmount' }
    let i = 0; const r = {}
    while (i < bytes.length - 1) {
      const tag = bytes[i++]; const len = bytes[i++]
      if (i + len > bytes.length) break
      r[tags[tag] || `t${tag}`] = new TextDecoder().decode(bytes.slice(i, i + len))
      i += len
    }
    return r
  } catch { return {} }
}

// ─── Canvas-based image preprocessor for better QR detection ──────────────────
// Converts file → contrast-boosted grayscale ImageData for jsQR
async function imageFileToCanvas(file, maxDim = 1800) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      let { width: w, height: h } = img
      if (Math.max(w, h) > maxDim) {
        const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s)
      }
      const cv = document.createElement('canvas')
      cv.width = w; cv.height = h
      const ctx = cv.getContext('2d')
      // Draw original
      ctx.drawImage(img, 0, 0, w, h)
      // Boost contrast for QR detection
      const id = ctx.getImageData(0, 0, w, h)
      const d  = id.data
      for (let i = 0; i < d.length; i += 4) {
        // Grayscale
        const g = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]
        // Contrast stretch + threshold
        const c = Math.min(255, Math.max(0, (g - 128) * 1.5 + 128))
        d[i] = d[i+1] = d[i+2] = c
      }
      ctx.putImageData(id, 0, 0)
      resolve({ canvas: cv, imageData: id, width: w, height: h })
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

// ─── zxing-wasm loader — ZXing-C++ via WebAssembly, far superior to JS port ──
// Tested by ChatGPT against real ZATCA receipts: decoded 3/4 including AlDrees + PDF
let _zxingWasmLoading = false
const _zxingWasmCallbacks = []
function loadZXingWasm() {
  return new Promise((resolve) => {
    if (window.ZXingWASM) { resolve(window.ZXingWASM); return }
    _zxingWasmCallbacks.push(resolve)
    if (_zxingWasmLoading) return
    _zxingWasmLoading = true
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/zxing-wasm@2.2.1/dist/iife/reader/index.js'
    s.onload  = () => {
      _zxingWasmCallbacks.forEach(cb => cb(window.ZXingWASM)); _zxingWasmCallbacks.length = 0
    }
    s.onerror = () => { _zxingWasmCallbacks.forEach(cb => cb(null)); _zxingWasmCallbacks.length = 0 }
    document.head.appendChild(s)
  })
}

// ─── PDF.js loader — renders PDF page 1 → canvas for QR + OCR ─────────────────
let _pdfJSLoading = false
const _pdfJSCallbacks = []
function loadPDFJS() {
  return new Promise((resolve) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return }
    _pdfJSCallbacks.push(resolve)
    if (_pdfJSLoading) return
    _pdfJSLoading = true
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
      _pdfJSCallbacks.forEach(cb => cb(window.pdfjsLib)); _pdfJSCallbacks.length = 0
    }
    s.onerror = () => { _pdfJSCallbacks.forEach(cb => cb(null)); _pdfJSCallbacks.length = 0 }
    document.head.appendChild(s)
  })
}

// ─── Render PDF page 1 → canvas at high DPI (scale 3 = ~300 DPI) ─────────────
async function pdfFileToCanvas(file, scale = 3.0) {
  const pdfjsLib = await loadPDFJS()
  if (!pdfjsLib) throw new Error('PDF.js not loaded')
  const arrayBuffer = await file.arrayBuffer()
  const pdf  = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width  = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  await page.render({ canvasContext: ctx, viewport }).promise
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return { canvas, imageData, width: canvas.width, height: canvas.height }
}

// ─── jsQR loader — lightweight fallback if ZXing fails ───────────────────────
let _jsQRLoading = false
const _jsQRCallbacks = []
function loadJsQR() {
  return new Promise((resolve) => {
    if (window.jsQR) { resolve(window.jsQR); return }
    _jsQRCallbacks.push(resolve)
    if (_jsQRLoading) return
    _jsQRLoading = true
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'
    s.onload  = () => { _jsQRCallbacks.forEach(cb => cb(window.jsQR)); _jsQRCallbacks.length = 0 }
    s.onerror = () => { _jsQRCallbacks.forEach(cb => cb(null)); _jsQRCallbacks.length = 0 }
    document.head.appendChild(s)
  })
}

// ─── Decode QR with zxing-wasm (ZXing-C++ via WebAssembly) ────────────────────
// Handles: upside-down, rotated, dense ZATCA QR codes, multiple binarizer passes
// ChatGPT confirmed: decoded AlDrees photos + PDF; PURE_BARCODE removed (hurts photos)
async function decodeQRWithZXingWasm(canvasOrFile, isFile = false) {
  try {
    const ZXing = await loadZXingWasm()
    if (!ZXing?.readBarcodesFromImageFile) return null

    const baseOpts = {
      formats: ['QRCode'],
      tryHarder: true,
      tryRotate: true,   // handles upside-down receipts
      tryInvert: true,   // handles inverted contrast
    }

    // Pass 1: feed the original file directly — wasm handles its own decoding pipeline
    if (isFile) {
      try {
        const results = await ZXing.readBarcodesFromImageFile(canvasOrFile, baseOpts)
        if (results?.length && results[0].text) return results[0].text
      } catch {}
    }

    // Pass 2: try different binarizers on ImageData from canvas
    if (canvasOrFile?.getContext) {
      const ctx = canvasOrFile.getContext('2d')
      const imageData = ctx.getImageData(0, 0, canvasOrFile.width, canvasOrFile.height)
      for (const binarizer of ['LocalAverage', 'GlobalHistogram', 'FixedThreshold']) {
        try {
          const results = await ZXing.readBarcodesFromImageData(imageData,
            { ...baseOpts, binarizer })
          if (results?.length && results[0].text) return results[0].text
        } catch {}
      }
    }

    return null
  } catch { return null }
}

// ─── Apply grayscale + contrast boost to canvas IN PLACE ─────────────────────
function boostContrast(canvas) {
  const ctx = canvas.getContext('2d')
  const id  = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const d   = id.data
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]
    const c = Math.min(255, Math.max(0, (g - 128) * 2.0 + 128))
    d[i] = d[i+1] = d[i+2] = c
  }
  ctx.putImageData(id, 0, 0)
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}

// ─── OCR text parser — Arabic & English invoices ──────────────────────────────
// Handles: ZATCA/Saudi Arabic receipts, printed English invoices,
// Al-Drees format (RTL: amount-first, label-after with colon)
function parseOCRText(rawText) {
  const r = {}
  if (!rawText) return r

  // Normalize Arabic-Indic / Extended Arabic-Indic numerals to Western digits
  // ٠١٢٣٤٥٦٧٨٩ (U+0660–U+0669) and ۰۱۲۳۴۵۶۷۸۹ (U+06F0–U+06F9)
  const text = rawText
    .replace(/[٠-٩]/g, d => d.charCodeAt(0) - 0x0660)
    .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0)

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // ── Collect ALL valid decimal amounts from the document ──
  // "Valid" = 1-6 digits before decimal, 1-2 after, reasonable range (1–99,999)
  const allAmounts = []
  for (const line of lines) {
    const matches = [...line.matchAll(/(\d{1,6}[,.]?\d{1,6}\.\d{1,2})/g)]
    for (const m of matches) {
      const v = parseFloat(m[1].replace(/,/g,''))
      if (v >= 0.5 && v <= 99999) allAmounts.push({ val: v, line, raw: m[1] })
    }
  }

  // ── Amount (total inc VAT) — 5-priority strategy ──

  // P1: Arabic "total including VAT" line → المبلغ شامل الضريبة
  for (const line of lines) {
    if (/المبلغ.{0,15}شامل.{0,15}(الضريبة|ضريبة)/u.test(line)) {
      const m = line.match(/(\d[\d,]*\.\d{1,2})/)
      if (m) { r.amount = m[1].replace(/,/g,''); break }
    }
  }

  // P2: Line that is ONLY a number (+ optional colon/symbol) — Arabic RTL standalone total
  // e.g. "100.00:" or "﷼173.54" or "173.54﷼" on its own line
  if (!r.amount) {
    for (const line of lines) {
      if (/^[﷼\s]*\d{1,6}\.\d{2}[﷼:\s]*$/.test(line)) {
        const m = line.match(/(\d{1,6}\.\d{2})/)
        if (m) { r.amount = m[1]; break }
      }
    }
  }

  // P3: ﷼ symbol adjacent to number
  if (!r.amount) {
    const arM = text.match(/[﷼]\s*(\d[\d,]*\.\d{2})/) || text.match(/(\d[\d,]*\.\d{2})\s*[﷼]/)
    if (arM) r.amount = (arM[1] || '').replace(/,/g,'')
  }

  // P4: VAT triplet heuristic — find 3 amounts where large ≈ medium + small (VAT = 15%)
  // e.g. net=150.90, vat=22.64, total=173.54
  if (!r.amount && allAmounts.length >= 2) {
    const sorted = [...allAmounts].sort((a,b) => a.val - b.val)
    for (let i = 0; i < sorted.length - 1; i++) {
      const net = sorted[i].val; const total = sorted[sorted.length-1].val
      const expectedVAT = Math.round(net * 0.15 * 100) / 100
      const expectedTotal = Math.round((net + expectedVAT) * 100) / 100
      if (Math.abs(total - expectedTotal) < 0.5) { r.amount = total.toFixed(2); break }
    }
  }

  // P5: English total/SAR keyword patterns
  if (!r.amount) {
    const engPats = [
      /(?:total|grand total|الإجمالي)[\s:]*(?:sar|sr)?\s*(\d[\d,]*\.?\d*)/i,
      /(?:sar|sr)\s*(\d{1,6}\.?\d{0,2})/i,
      /(\d{1,6}\.\d{2})\s*(?:sar|sr)/i,
    ]
    for (const p of engPats) {
      const m = text.match(p); if (m) { r.amount = m[1].replace(/,/g,''); break }
    }
  }

  // Final guard: if amount looks unreasonably large for a field expense (>9999), clear it
  if (r.amount && parseFloat(r.amount) > 9999) {
    // Only keep if we're very confident (P1 or P2 found it)
    // For P3-P5 results that are > 9999, try to find a more reasonable amount
    const reasonable = allAmounts.filter(a => a.val <= 9999 && a.val >= 1)
    if (reasonable.length) r.amount = Math.max(...reasonable.map(a=>a.val)).toFixed(2)
    else delete r.amount
  }

  // ── VAT number (Saudi: 15 digits starting with 3) ──
  // Strategy: extract ALL digit clusters from the text, then assemble a 15-digit TRN.
  // This is robust even when OCR splits "310945024800003" across lines or inserts noise.
  const normText = text
    .replace(/[Oo]/g, '0')       // letter O → digit 0
    .replace(/[IilL]/g, '1')     // letter I/l/L → digit 1

  // Direct pattern match on normalized text
  const directMatch = normText.replace(/[\s\-]/g,'').match(/(3[0-9]{14})/)
  if (directMatch) {
    r.vatNumber = directMatch[1]
  } else {
    // Assemble from digit clusters: OCR may split "310945024800003" as "31094" + "5024800003"
    const clusters = [...normText.matchAll(/[0-9]{2,}/g)].map(m => m[0])
    let assembled = ''
    for (const c of clusters) {
      assembled += c
      // As we accumulate digits, check if we have a valid 15-digit TRN window
      for (let i = 0; i <= assembled.length - 15; i++) {
        const window = assembled.slice(i, i + 15)
        if (window.startsWith('3') && /^[0-9]{15}$/.test(window)) {
          r.vatNumber = window; break
        }
      }
      if (r.vatNumber) break
    }
  }

  // ── VAT amount ──
  for (const line of lines) {
    if (/يشمل ضريبة|vat amount|ضريبة القيمة/i.test(line)) {
      const m = line.match(/(\d[\d,]*\.\d{1,2})/); if (m) { r.vatAmount = m[1]; break }
    }
  }
  if (!r.vatAmount) {
    const m = text.match(/(?:vat|ضريبة)[\s\S]{0,30}?(\d+\.\d{2})/i)
    if (m) r.vatAmount = m[1]
  }

  // ── Date — multiple formats including Arabic month names ──────────────────
  // Arabic month name → 2-digit month map
  const AR_MONTHS = {
    'يناير':'01','جانفي':'01','فبراير':'02','مارس':'03','أبريل':'04','ابريل':'04',
    'مايو':'05','يونيو':'06','يونيه':'06','يوليو':'07','يوليه':'07',
    'أغسطس':'08','اغسطس':'08','سبتمبر':'09','أكتوبر':'10','اكتوبر':'10',
    'نوفمبر':'11','ديسمبر':'12','كانون':'01','شباط':'02','آذار':'03',
    'نيسان':'04','أيار':'05','حزيران':'06','تموز':'07','آب':'08',
    'أيلول':'09','تشرين':'10','كانون الأول':'12'
  }
  // Try Arabic date "10 أكتوبر 2026" or "أكتوبر 10, 2026"
  let dateFound = false
  for (const [arName, moNum] of Object.entries(AR_MONTHS)) {
    const re1 = new RegExp(`(\\d{1,2})\\s+${arName}\\s+(\\d{4})`, 'u')
    const re2 = new RegExp(`${arName}\\s+(\\d{1,2})[,،]?\\s+(\\d{4})`, 'u')
    for (const re of [re1, re2]) {
      const m = text.match(re)
      if (m) {
        const d = (re === re1 ? m[1] : m[1]).padStart(2,'0')
        const y = re === re1 ? m[2] : m[2]
        const candidate = `${y}-${moNum}-${d}`
        const dt = new Date(candidate)
        if (!isNaN(dt) && dt.getFullYear() >= 2020) { r.date = candidate; dateFound = true; break }
      }
    }
    if (dateFound) break
  }
  // Fuzzy Arabic month matching — handles Tesseract garbling last chars
  // e.g. "أكتوين" → should match أكتوبر (prefix أكتو is unique)
  if (!dateFound) {
    const thisYear = new Date().getFullYear()
    const AR_MONTH_PREFIXES = [
      ['يناير','01',4],['فبراير','02',4],['مارس','03',4],['أبريل','04',4],
      ['مايو','05',4],['يونيو','06',4],['يوليو','07',4],
      ['أغسطس','08',4],['سبتمبر','09',5],['أكتوبر','10',4],
      ['نوفمبر','11',5],['ديسمبر','12',4]
    ]
    for (const [fullName, moNum, prefixLen] of AR_MONTH_PREFIXES) {
      const prefix = fullName.slice(0, prefixLen)
      // Try with 4-digit year (required)
      const re1 = new RegExp(`(\\d{1,2})\\s+${prefix}\\S*\\s+(\\d{4})`, 'u')
      const re2 = new RegExp(`${prefix}\\S*\\s+(\\d{1,2})[,،]?\\s+(\\d{4})`, 'u')
      // Day after month (Arabic RTL order in OCR): "أكتوين 01" — year optional
      const re3 = new RegExp(`${prefix}\\S*\\s+(\\d{1,2})(?:[^\\d].*?(\\d{4}))?`, 'u')
      // Day before month, year optional: "01 أكتوين"
      const re4 = new RegExp(`(\\d{1,2})\\s+${prefix}\\S*(?:[^\\d].*?(\\d{4}))?`, 'u')
      for (const re of [re1, re2, re3, re4]) {
        const m = text.match(re)
        if (m) {
          const d = m[1].padStart(2,'0')
          // Year might be garbled — use match or fall back to current year
          const yRaw = m[2]
          const y = (yRaw && /^\d{4}$/.test(yRaw) && parseInt(yRaw) >= 2020 && parseInt(yRaw) <= 2035)
            ? yRaw : String(thisYear)
          const candidate = `${y}-${moNum}-${d}`
          const dt = new Date(candidate)
          if (!isNaN(dt) && dt.getFullYear() >= 2020 && dt.getFullYear() <= 2035
              && parseInt(d) >= 1 && parseInt(d) <= 31) {
            r.date = candidate; dateFound = true; break
          }
        }
      }
      if (dateFound) break
    }
  }
  const datePats = [
    { re: /(\d{2})\.(\d{2})\.(\d{4})/, fn: (_,d,mo,y) => `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}` },
    { re: /(\d{4})[-\/](\d{2})[-\/](\d{2})/, fn: (_,y,mo,d) => `${y}-${mo}-${d}` },
    { re: /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/, fn: (_,d,mo,y) => `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}` },
  ]
  if (!dateFound) {
    for (const { re, fn } of datePats) {
      const m = text.match(re); if (!m) continue
      try {
        const candidate = fn(...m)
        const dt = new Date(candidate)
        if (!isNaN(dt) && dt.getFullYear() >= 2020 && dt.getFullYear() <= 2030) { r.date = candidate; break }
      } catch {}
    }
  }

  // ── Vendor — multiple strategies, best-quality wins ─────────────────────────
  // Quality scorer: higher = better candidate
  function vendorScore(line) {
    if (!line || line.length < 3 || line.length > 100) return 0
    let score = 0
    // Strong signals
    if (/شركة|مؤسسة|مجموعة|Corporation|Company|Co\.|Ltd|LLC/i.test(line)) score += 50
    if (/ALDREES|ADNOC|ARAMCO|Saudi|Markets|Store|Mart|Shop/i.test(line)) score += 40
    // English words (2+ capital letters in a row) — good for mixed receipts
    const engWords = (line.match(/[A-Z][a-zA-Z]{2,}/g) || []).length
    score += engWords * 8
    // Arabic words (3+ Arabic chars) — good for Arabic company names
    const arWords = (line.match(/[؀-ۿ]{3,}/g) || []).length
    score += arWords * 5
    // Penalties
    if (/^\d+$/.test(line.replace(/\s/g,''))) return 0  // pure digits
    if (/^[^؀-ۿa-zA-Z]+$/.test(line)) return 0  // no Arabic or Latin letters
    if ((line.match(/[^a-zA-Z0-9؀-ۿ\s.,&-]/g) || []).length > line.length * 0.3) score -= 20 // too many noise chars
    if (line.length < 5) score -= 10
    return score
  }
  let bestVendor = null; let bestScore = 0
  for (const line of lines) {
    const s = vendorScore(line)
    if (s > bestScore) { bestScore = s; bestVendor = line }
  }
  // Only accept if score is reasonable
  if (bestScore >= 8) r.vendor = bestVendor.trim()

  // ── Invoice number ──
  // Patterns: "Invoice No 0052-001-48920", "طلب 0052-001-48920", long ZATCA numeric IDs
  const invMatch = text.match(/(?:رقم الفاتورة|invoice\s*(?:no|number|#)?)[:\s]*([A-Z0-9\-\/]{4,30})/i)
    || text.match(/(?:طلب|order)[:\s#]*([A-Z0-9\-]{4,30})/i)     // طلب = request/order number
    || text.match(/\b(\d{4}-\d{3}-\d{5,})\b/)                     // dashed invoice like 0052-001-48920
    || text.match(/\b(\d{12,20})\b/)                               // long numeric ZATCA IDs
  if (invMatch) r.invoiceNumber = invMatch[1]

  return r
}

// ─── Tesseract loader (script-tag injection, loaded once) ─────────────────────
let _tesseractLoaded = false
let _tesseractLoading = false
const _tesseractCallbacks = []

function loadTesseract() {
  return new Promise((resolve) => {
    if (window.Tesseract) { resolve(window.Tesseract); return }
    _tesseractCallbacks.push(resolve)
    if (_tesseractLoading) return
    _tesseractLoading = true
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@4.1.4/dist/tesseract.min.js'
    s.onload  = () => { _tesseractLoaded = true; _tesseractCallbacks.forEach(cb => cb(window.Tesseract)) }
    s.onerror = () => { _tesseractCallbacks.forEach(cb => cb(null)) }
    document.head.appendChild(s)
  })
}

// ─── UI primitives ─────────────────────────────────────────────────────────────
// PAGE is a function so each step can apply its own bg color
function getPage(t) {
  return {
    maxWidth:480, margin:'0 auto',
    fontFamily: MP.font,
    background: t.bg || MP.cream, minHeight:'100dvh', boxSizing:'border-box',
    colorScheme: t.variant === 'dark' ? 'dark' : 'light',
  }
}
// Backward compat alias (some render paths use PAGE directly)
const PAGE = {
  maxWidth:480, margin:'0 auto',
  fontFamily: MP.font,
  background: MP.cream, minHeight:'100dvh', boxSizing:'border-box',
}

function SCard({ children, style={}, dark=false }) {
  return (
    <div style={{
      background: dark ? MP.darkCard : MP.lightCard,
      borderRadius:20, border:`1px solid ${dark ? '#3A3D35' : '#E4E0D3'}`,
      marginBottom:12, overflow:'hidden', ...style }}>
      {children}
    </div>
  )
}
function SSection({ title, accent, children, dark=false }) {
  const labelColor = dark ? MP.textMutedDark : MP.textMutedLight
  return (
    <div style={{ padding:'16px 18px' }}>
      {title && (
        <div style={{ fontSize:11, fontWeight:800, color:accent||labelColor, textTransform:'uppercase', letterSpacing:1, marginBottom:14, display:'flex', alignItems:'center', gap:6, fontFamily:MP.font }}>
          <div style={{ width:22, height:2.5, background:accent||labelColor, borderRadius:2 }} />{title}
        </div>
      )}
      {children}
    </div>
  )
}
function FLabel({ children, accent, dark=false }) {
  return (
    <div style={{ fontSize:11, fontWeight:700, color:accent||(dark?MP.textMutedDark:'#5A5D6B'), textTransform:'uppercase', letterSpacing:.9, marginBottom:6, fontFamily:MP.font }}>
      {children}
    </div>
  )
}
function FInp({ accent, style={}, dark=false, ...props }) {
  const bg     = dark ? MP.darkCard : MP.lightCard
  const border = dark ? '#3A3D35'   : '#D5D2C5'
  const clr    = dark ? MP.textOnDark : MP.textDark
  const focusBg  = dark ? '#363830'  : '#FFFFFF'
  const focusBdr = accent || MP.yellow
  return (
    <input
      style={{ padding:'12px 14px', border:`1.5px solid ${border}`, borderRadius:12, fontSize:14, outline:'none', width:'100%', boxSizing:'border-box', minHeight:46, fontFamily:MP.font, background:bg, color:clr, WebkitAppearance:'none', transition:'border-color .15s', ...style }}
      onFocus={e=>{ e.target.style.borderColor=focusBdr; e.target.style.background=focusBg }}
      onBlur={e=>{ e.target.style.borderColor=border; e.target.style.background=bg }}
      {...props}
    />
  )
}
function FSel({ accent, style={}, dark=false, children, ...props }) {
  const bg     = dark ? MP.darkCard : '#F8F7F2'
  const border = dark ? '#3A3D35'   : '#D5D2C5'
  const clr    = dark ? MP.textOnDark : MP.textDark
  return (
    <select style={{ padding:'12px 14px', border:`1.5px solid ${border}`, borderRadius:12, fontSize:14, outline:'none', width:'100%', boxSizing:'border-box', minHeight:46, fontFamily:MP.font, background:bg, color:clr, WebkitAppearance:'none', ...style }} {...props}>
      {children}
    </select>
  )
}
function FArea({ accent, style={}, dark=false, ...props }) {
  const bg     = dark ? MP.darkCard : MP.lightCard
  const border = dark ? '#3A3D35'   : '#D5D2C5'
  const clr    = dark ? MP.textOnDark : MP.textDark
  const focusBg  = dark ? '#363830'  : '#FFFFFF'
  const focusBdr = accent || MP.yellow
  return (
    <textarea
      style={{ padding:'12px 14px', border:`1.5px solid ${border}`, borderRadius:12, fontSize:14, outline:'none', width:'100%', boxSizing:'border-box', fontFamily:MP.font, background:bg, color:clr, resize:'none', transition:'border-color .15s', ...style }}
      onFocus={e=>{ e.target.style.borderColor=focusBdr; e.target.style.background=focusBg }}
      onBlur={e=>{ e.target.style.borderColor=border; e.target.style.background=bg }}
      {...props}
    />
  )
}

// ─── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ stepId, t }) {
  const active  = STEPS.filter(s => s.num !== null)
  const cur     = active.findIndex(s => s.id === stepId)
  const isDark  = t.variant === 'dark'
  const dotDone = MP.yellow
  const dotCur  = t.color
  const dotIdle = isDark ? '#3A3D35' : '#D5D2C5'
  const lineOn  = MP.yellow
  const lineOff = isDark ? '#3A3D35' : '#D5D2C5'
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:0, padding:'14px 20px 0' }}>
      {active.map((s, i) => (
        <div key={s.id} style={{ display:'flex', alignItems:'center', flex: i < active.length-1 ? 1 : 'none' }}>
          {/* Dot */}
          <div style={{
            width: i === cur ? 32 : 26, height: i === cur ? 32 : 26,
            borderRadius:'50%', flexShrink:0,
            background: i < cur ? dotDone : i === cur ? 'transparent' : dotIdle,
            border: i === cur ? `2.5px solid ${dotCur}` : 'none',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize: i < cur ? 13 : 12,
            color: i < cur ? MP.textDark : i === cur ? dotCur : (isDark ? MP.textMutedDark : MP.textMutedLight),
            fontWeight: 700, transition:'all .2s', fontFamily: MP.font,
            boxShadow: i === cur ? `0 0 0 4px ${dotCur}25` : 'none',
          }}>
            {i < cur ? '✓' : s.num}
          </div>
          {/* Connector */}
          {i < active.length - 1 && (
            <div style={{ flex:1, height:2, margin:'0 4px', background: i < cur ? lineOn : lineOff, borderRadius:2 }} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Step header ───────────────────────────────────────────────────────────────
function StepHeader({ stepId, t, emp, devMode, onBack, children }) {
  const s       = STEPS.find(x => x.id === stepId) || {}
  const isDark  = t.variant === 'dark'
  const textClr = isDark ? MP.textOnDark : MP.textDark
  const mutedClr= isDark ? MP.textMutedDark : MP.textMutedLight
  const btnBg   = isDark ? 'rgba(247,210,99,0.1)' : 'transparent'
  const btnBorder = isDark ? `1px solid rgba(247,210,99,0.25)` : `1.5px solid #D5D2C5`
  const btnClr  = isDark ? MP.yellow : MP.textMutedLight
  return (
    <div style={{
      background: t.hdrBg,
      padding: '20px 20px 22px',
      borderBottom: `1px solid ${isDark ? '#3A3D35' : '#E4E0D3'}`,
      marginBottom: 16,
      fontFamily: MP.font,
    }}>
      {/* Back + DEV badge row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        {onBack
          ? <button onClick={onBack} style={{ background:btnBg, border:btnBorder, color:btnClr, borderRadius:20, padding:'6px 14px', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:MP.font }}>
              ← Back
            </button>
          : <div/>}
        {devMode && (
          <div style={{ background:'rgba(247,210,99,0.15)', border:'1px solid rgba(247,210,99,0.35)', borderRadius:8, padding:'3px 10px', fontSize:10, color:MP.yellow, fontWeight:700, letterSpacing:.5, fontFamily:MP.font }}>
            🛠 DEV
          </div>
        )}
      </div>
      {/* Progress bar */}
      {s.num && <ProgressBar stepId={stepId} t={t} />}
      {/* Title area */}
      <div style={{ marginTop:14 }}>
        <div style={{ fontSize:24, fontWeight:800, color:textClr, fontFamily:MP.font }}>
          {s.icon} {s.label}
        </div>
        <div style={{ fontSize:12, color:mutedClr, marginTop:4, fontFamily:MP.font }}>
          {emp?.full_name_en || 'Loading employee…'}
        </div>
        {children && <div style={{ marginTop:10 }}>{children}</div>}
      </div>
    </div>
  )
}

// ─── Info banner ───────────────────────────────────────────────────────────────
function Banner({ type='info', children, dark=false }) {
  const styles = {
    info:    { light:{ bg:'#eff6ff', color:'#1d4ed8', border:'#bfdbfe' },
               dark: { bg:'rgba(59,111,232,0.15)', color:'#93B4F4', border:'rgba(59,111,232,0.3)' } },
    success: { light:{ bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0' },
               dark: { bg:'rgba(76,175,130,0.15)', color:'#86EFAC', border:'rgba(76,175,130,0.3)' } },
    warn:    { light:{ bg:'#fffbeb', color:'#92400e', border:'#fde68a' },
               dark: { bg:'rgba(247,210,99,0.15)', color:MP.yellow, border:'rgba(247,210,99,0.3)' } },
    error:   { light:{ bg:'#fef2f2', color:'#991b1b', border:'#fecaca' },
               dark: { bg:'rgba(239,68,68,0.15)',  color:'#FCA5A5', border:'rgba(239,68,68,0.3)' } },
  }
  const s = (styles[type] || styles.info)[dark ? 'dark' : 'light']
  return (
    <div style={{ background:s.bg, border:`1.5px solid ${s.border}`, borderRadius:12,
      padding:'11px 14px', fontSize:13, color:s.color, lineHeight:1.6, marginBottom:12,
      display:'flex', gap:8 }}>
      {children}
    </div>
  )
}

// ─── Category tile config — pastel bg + dark icon color per category ──────────
const CAT_STYLE = {
  FUEL:          { bg:'#FFF3D4', iconBg:'#F7D263', color:'#7A5C00' },
  ACCOMMODATION: { bg:'#D6EAF8', iconBg:'#85C1E9', color:'#1A5276' },
  MEALS:         { bg:'#D5F5E3', iconBg:'#82E0AA', color:'#1D6A3A' },
  TRANSPORT:     { bg:'#E8DAEF', iconBg:'#C39BD3', color:'#5B2C6F' },
  MATERIALS:     { bg:'#FADBD8', iconBg:'#F1948A', color:'#7B241C' },
  COMMUNICATION: { bg:'#D6EEF8', iconBg:'#7FB3D3', color:'#1A4F6E' },
  OFFICE:        { bg:'#EAEDED', iconBg:'#AEB6BF', color:'#2E4053' },
  GOVT_FEES:     { bg:'#D4EFDF', iconBg:'#76B891', color:'#1E5C38' },
  PARKING:       { bg:'#E8E0F0', iconBg:'#A98CC4', color:'#4A235A' },
  MISC:          { bg:'#F0ECE3', iconBg:'#C8BB9A', color:'#4A3B2A' },
}
function CategoryPicker({ categories, value, onChange }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
      {categories.map(cat => {
        const style = CAT_STYLE[cat.key] || { bg:'#F0EEE3', iconBg:'#D5D2C5', color:'#444' }
        const sel   = value === cat.key
        return (
          <button key={cat.key} type="button" onClick={() => onChange(cat.key)}
            style={{
              padding:'14px 12px', borderRadius:16, cursor:'pointer',
              border: sel ? `2.5px solid ${MP.yellow}` : '2px solid transparent',
              background: sel ? style.bg : style.bg + 'BB',
              display:'flex', flexDirection:'row', alignItems:'center', gap:12,
              transition:'all .15s', fontFamily:MP.font,
              boxShadow: sel ? `0 0 0 3px ${MP.yellow}55` : 'none',
              outline: 'none',
            }}>
            <div style={{
              width:40, height:40, borderRadius:12, flexShrink:0,
              background: style.iconBg,
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:20,
            }}>
              {cat.icon}
            </div>
            <div style={{ textAlign:'left', flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:700, color:style.color, lineHeight:1.3, fontFamily:MP.font }}>
                {cat.label}
              </div>
              {sel && (
                <div style={{ fontSize:10, color:MP.yellow, fontWeight:600, marginTop:2, fontFamily:MP.font }}>✓ Selected</div>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ─── Summary row ───────────────────────────────────────────────────────────────
function SRow({ label, value, mono, color, dark=false }) {
  const border  = dark ? '#3A3D35'     : '#EDE9DE'
  const lblClr  = dark ? MP.textMutedDark : MP.textMutedLight
  const valClr  = color || (dark ? MP.textOnDark : MP.textDark)
  const nullClr = dark ? '#5A5D55' : '#C8C5BC'
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
      padding:'9px 0', borderBottom:`1px solid ${border}`, fontFamily:MP.font }}>
      <span style={{ fontSize:12, color:lblClr, fontWeight:600, minWidth:110 }}>{label}</span>
      <span style={{ fontSize:13, color:valClr, fontWeight:700, textAlign:'right', flex:1,
        fontFamily:mono?'monospace':MP.font }}>
        {value || <span style={{ color:nullClr, fontWeight:400 }}>—</span>}
      </span>
    </div>
  )
}

// ─── Nav buttons ───────────────────────────────────────────────────────────────
function NavBar({ onBack, onNext, nextLabel='Next →', nextColor, disabled, loading, dark=false }) {
  const navBg     = dark ? MP.darkCard  : MP.lightCard
  const navBorder = dark ? '#3A3D35'   : '#E4E0D3'
  const backBg    = dark ? '#2D302A'   : MP.lightCard
  const backBdr   = dark ? '#4A4D45'   : '#D5D2C5'
  const backClr   = dark ? MP.textMutedDark : MP.textMutedLight
  const disabledBg  = dark ? '#3A3D35' : '#E4E0D3'
  const disabledClr = dark ? '#5A5D55' : '#A7AAA0'
  return (
    <div style={{ background:navBg,
      borderTop:`1px solid ${navBorder}`, padding:`12px 14px calc(24px + env(safe-area-inset-bottom, 0px))`, boxSizing:'border-box',
      display:'flex', gap:10 }}>
      {onBack && (
        <button onClick={onBack}
          style={{ padding:'14px 18px', borderRadius:14, border:`1.5px solid ${backBdr}`,
            background:backBg, color:backClr, fontSize:14, fontWeight:700, cursor:'pointer',
            flexShrink:0, fontFamily:MP.font }}>
          ←
        </button>
      )}
      <button onClick={onNext} disabled={disabled || loading}
        style={{ flex:1, padding:'15px', borderRadius:14, border:'none', fontFamily:MP.font,
          background: disabled ? disabledBg : (nextColor || MP.yellow),
          color: disabled ? disabledClr : MP.textDark, fontSize:15, fontWeight:700,
          cursor: disabled ? 'not-allowed' : 'pointer' }}>
        {loading ? '⏳ Please wait…' : nextLabel}
      </button>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function FormDailyExpense() {
  const auth    = useFieldAuth()
  const devMode = isDevMode()
  const DEV_MODE = devMode

  // ── Dev mode ────────────────────────────────────────────────────────────────
  const [devEmployees,   setDevEmployees]   = useState([])
  const [devEmployee,    setDevEmployee]    = useState(null)
  const [devAssignments, setDevAssignments] = useState([])

  const emp         = devMode ? devEmployee    : auth.employee
  const assignments = devMode ? devAssignments : (auth.assignments || [])
  const entityId    = devMode ? (devEmployee?.entity_id || null) : auth.entityId

  // ── Wizard navigation ────────────────────────────────────────────────────────
  const [step, setStep] = useState('scan')

  // ── Scan / OCR state ─────────────────────────────────────────────────────────
  const [photo,         setPhoto]         = useState(null)
  const [photoFile,     setPhotoFile]     = useState(null)
  const [invoiceType,   setInvoiceType]   = useState('QR') // 'QR' | 'PRINTED' | 'HANDWRITTEN'
  // scanStatus: 'idle'|'scanning'|'qr_ok'|'no_scan'|'handwritten'
  const [scanStatus,    setScanStatus]    = useState('idle')
  const [scanData,      setScanData]      = useState(null)   // decoded ZATCA QR fields
  const [ocrParsed,     setOcrParsed]     = useState(null)   // parsed Tesseract output
  const [ocrRawText,    setOcrRawText]    = useState('')     // raw Tesseract output (for debug)
  const [showOcrDebug,  setShowOcrDebug]  = useState(false)
  const [ocrProgress,   setOcrProgress]   = useState(0)      // 0-100

  // ── Invoice fields ────────────────────────────────────────────────────────────
  const [vendorName,    setVendorName]    = useState('')
  const [invoiceDate,   setInvoiceDate]   = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  // vatMode: 'disabled' | 'auto' | 'manual'
  const [vatMode,          setVatMode]          = useState('disabled')
  const [vatNumber,        setVatNumber]        = useState('')
  const [vatPaid,          setVatPaid]          = useState(false)
  const [vatAmountFromQR,  setVatAmountFromQR]  = useState('')  // stores QR vatAmount tag
  const [amount,           setAmount]           = useState('')

  // ── Classification ────────────────────────────────────────────────────────────
  const [category,      setCategory]      = useState('')
  const [assignmentId,  setAssignmentId]  = useState('')

  // ── Notes ─────────────────────────────────────────────────────────────────────
  const [remarks,       setRemarks]       = useState('')
  const [lateReason,    setLateReason]    = useState('')

  // ── Checks & status ───────────────────────────────────────────────────────────
  const [dupWarning,    setDupWarning]    = useState(null)
  const [vatXCheck,     setVatXCheck]     = useState(null)
  const [vatPeriod,     setVatPeriod]     = useState(null)
  const [monthCount,    setMonthCount]    = useState(0)
  const [dupAcked,      setDupAcked]      = useState(false) // user acknowledged duplicate

  // ── Submit ─────────────────────────────────────────────────────────────────────
  const [submitting,    setSubmitting]    = useState(false)
  const [submitErr,     setSubmitErr]     = useState(null)
  const [successData,   setSuccessData]   = useState(null)

  const fileRef         = useRef()
  // ── Crop modal state ─────────────────────────────────────────────────────────
  const [showCrop,        setShowCrop]        = useState(false)
  const [originalPhotoUrl,setOriginalPhotoUrl]= useState(null)
  const originalFileRef   = useRef(null)
  const imgCropRef        = useRef(null)
  const cropperRef        = useRef(null)
  // ── Live QR scan state ───────────────────────────────────────────────────────
  const [liveQRActive,    setLiveQRActive]    = useState(false)
  const videoRef          = useRef(null)
  const streamRef         = useRef(null)

  // ── Derived values ─────────────────────────────────────────────────────────────
  const rawAmount  = parseFloat(amount)  || 0
  const vatAmount  = vatPaid ? Math.round(rawAmount / 1.15 * 0.15 * 100) / 100 : 0
  const netAmount  = vatPaid ? Math.round(rawAmount / 1.15 * 100) / 100 : rawAmount
  const selAssign  = assignments.find(a => a.id === assignmentId)
  const allowFA     = selAssign?.allow_fa     !== false
  const allowOthers = selAssign?.allow_others !== false
  const visCats    = EXPENSE_CATEGORIES.filter(c => {
    if (c.key === 'MEALS')     return allowFA
    if (c.key === 'MATERIALS') return allowOthers
    return true
  })
  const selCat     = visCats.find(c => c.key === category)
  const late       = lateStatus(invoiceDate)
  const t          = T[step] || T.summary // current theme

  // ── Poppins font loader ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!document.getElementById('poppins-font-de')) {
      const link = document.createElement('link')
      link.id   = 'poppins-font-de'
      link.rel  = 'stylesheet'
      link.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&display=swap'
      document.head.appendChild(link)
    }
  }, [])

  // ── Load cropperjs from CDN ────────────────────────────────────────────────────
  useEffect(() => {
    if (!document.getElementById('cropper-css')) {
      const link = document.createElement('link')
      link.id = 'cropper-css'; link.rel = 'stylesheet'
      link.href = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.css'
      document.head.appendChild(link)
    }
    if (!document.getElementById('cropper-js')) {
      const s = document.createElement('script')
      s.id = 'cropper-js'
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.2/cropper.min.js'
      document.head.appendChild(s)
    }
  }, [])

  // ── Initialise Cropper when modal opens ───────────────────────────────────────
  useEffect(() => {
    if (!showCrop) return
    let isMounted = true
    function initCropper() {
      if (!isMounted || !imgCropRef.current) return
      if (cropperRef.current) { cropperRef.current.destroy(); cropperRef.current = null }
      cropperRef.current = new window.Cropper(imgCropRef.current, {
        viewMode: 1, dragMode: 'move', aspectRatio: NaN,
        autoCropArea: 0.92, movable: true, zoomable: true,
        rotatable: false, scalable: false, background: false,
        guides: true, highlight: true,
      })
    }
    if (typeof window.Cropper !== 'undefined') {
      initCropper()
    } else {
      const iv = setInterval(() => { if (typeof window.Cropper !== 'undefined') { clearInterval(iv); initCropper() } }, 80)
    }
    return () => {
      isMounted = false
      if (cropperRef.current) { cropperRef.current.destroy(); cropperRef.current = null }
    }
  }, [showCrop, originalPhotoUrl])

  // ── Dev mode loaders ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!devMode) return
    supabase.rpc('get_dev_employees').then(({ data }) => setDevEmployees(data || []))
  }, [])

  useEffect(() => {
    if (!devEmployee) { setDevAssignments([]); return }
    supabase.from('site_assignments')
      .select('id,site_number,site_name,scope_type,role_on_site,assigned_from,assigned_to,allow_fa,allow_ot,allow_others,project:project_id(id,project_number,project_name),contractor:contractor_id(id,contractor_name)')
      .eq('employee_id', devEmployee.id).eq('is_active', true)
      .then(({ data }) => {
        const a = data || []
        setDevAssignments(a)
        if (a.length === 1) setAssignmentId(a[0].id)
      })
  }, [devEmployee])

  // ── Load month count ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!emp) return
    const period = today().slice(0, 7)
    supabase.from('expense_records').select('id', { count:'exact', head:true })
      .eq('employee_id', emp.id).like('expense_date', `${period}%`)
      .then(({ count }) => setMonthCount(count || 0))
    if (!devMode && assignments.length === 1) setAssignmentId(assignments[0].id)
  }, [emp?.id])

  // ── VAT period check ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!invoiceDate || !entityId) { setVatPeriod(null); return }
    supabase.rpc('check_invoice_vat_period', { p_invoice_date: invoiceDate, p_entity_id: entityId })
      .then(({ data }) => setVatPeriod(data || 'OK'))
  }, [invoiceDate, entityId])

  // ── VAT cross-check ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!vatPaid || !scanData?.totalWithVat || !scanData?.vatAmount) { setVatXCheck(null); return }
    const total  = parseFloat(scanData.totalWithVat) || 0
    const vatAmt = parseFloat(scanData.vatAmount)    || 0
    const exp    = Math.round((total - vatAmt) * 0.15 * 100) / 100
    const diff   = Math.abs(vatAmt - exp)
    setVatXCheck(diff <= 1 ? { ok:true } : { ok:false, expected:exp, actual:vatAmt, diff })
  }, [vatPaid, scanData])

  // ── Duplicate invoice check ────────────────────────────────────────────────────
  const checkDuplicate = useCallback(async (invNum, vendor) => {
    if (!invNum || !emp?.id) { setDupWarning(null); return }
    const { data } = await supabase.rpc('check_duplicate_invoice', {
      p_employee_id: emp.id, p_invoice_number: invNum, p_vendor_name: vendor || null
    }).catch(() => ({ data: null }))
    if (data?.duplicate) setDupWarning(data)
    else setDupWarning(null)
  }, [emp?.id])

  // ─── Helper: apply QR-decoded ZATCA data to state ──────────────────────────
  function applyQRData(parsed) {
    const d = dateFromZATCA(parsed.timestamp)
    setScanData(parsed)
    // Strip BOM / zero-width chars and trim — Arabic text from ZATCA TLV can have invisible prefix bytes
    const cleanStr = s => (s || '').replace(/^﻿/, '').replace(/[​-‍﻿]/g, '').trim()
    setVendorName(cleanStr(parsed.seller))
    setVatNumber(cleanStr(parsed.vatNumber))
    setInvoiceDate(d               || '')
    setAmount(parsed.totalWithVat  ? parseFloat(parsed.totalWithVat).toFixed(2) : '')
    if (parsed.vatAmount)  setVatAmountFromQR(parseFloat(parsed.vatAmount).toFixed(2))
    setVatPaid(!!parsed.totalWithVat)
    setVatMode('auto')
    setInvoiceType('QR')
    setScanStatus('qr_ok')
    // ── QR fingerprint for duplicate detection ───────────────────────────────
    // ZATCA timestamp is unique per transaction — same receipt always produces same key.
    // Stored in invoice_number so check_duplicate_invoice RPC catches repeats.
    const qrKey = parsed.vatNumber && parsed.timestamp
      ? `QR-${parsed.vatNumber}-${parsed.timestamp.replace(/\D/g,'')}`.slice(0, 60)
      : null
    if (qrKey) {
      setInvoiceNumber(qrKey)
      setDupAcked(false)
      setDupWarning(null)
      checkDuplicate(qrKey, parsed.seller || '')
    }
  }

  // ─── CROP MODAL — confirm / skip ─────────────────────────────────────────────
  function skipCrop() {
    setPhoto(originalPhotoUrl)
    setPhotoFile(originalFileRef.current)
    setShowCrop(false)
  }
  async function confirmCrop() {
    if (!cropperRef.current) { skipCrop(); return }
    const canvas = cropperRef.current.getCroppedCanvas({ maxWidth: 2048, maxHeight: 2048, imageSmoothingEnabled: true })
    if (!canvas) { skipCrop(); return }
    canvas.toBlob(blob => {
      if (!blob) { skipCrop(); return }
      const croppedFile = new File([blob], 'invoice_cropped.jpg', { type: 'image/jpeg' })
      setPhoto(URL.createObjectURL(blob))
      setPhotoFile(croppedFile)
      setShowCrop(false)
    }, 'image/jpeg', 0.92)
  }

  // ─── LIVE QR SCAN via BarcodeDetector ────────────────────────────────────────
  async function startLiveQRScan() {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
      alert('Live QR scan not supported in this browser — please take a photo of the invoice instead.')
      return
    }
    try {
      setLiveQRActive(true)
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
      const det = new BarcodeDetector({ formats: ['qr_code'] })
      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return
        try {
          const codes = await det.detect(videoRef.current)
          for (const c of codes) {
            const p = decodeZATCAQR(c.rawValue)
            if (p.vatNumber || p.seller) { applyQRData(p); stopLiveQRScan(); return }
          }
        } catch {}
        if (streamRef.current) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    } catch (e) {
      console.warn('[LiveQR]', e.message)
      setLiveQRActive(false)
    }
  }
  function stopLiveQRScan() {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    setLiveQRActive(false)
  }

  // ─── PHOTO HANDLER — opens crop modal + runs QR/OCR scan in background ───────
  async function handlePhotoSelect(file) {
    if (!file) return
    // Store original file for QR decoding (full resolution) and as crop fallback
    originalFileRef.current = file
    const url = URL.createObjectURL(file)
    setOriginalPhotoUrl(url)
    setPhoto(null); setPhotoFile(null)   // cleared until crop confirmed/skipped
    setShowCrop(true)
    // Start QR + OCR scan immediately on original file (runs while crop modal is open)
    setScanData(null); setOcrParsed(null); setOcrProgress(0); setDupWarning(null)
    setScanStatus('scanning')
    let qrFound = false
    const isPDF = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')

    // ── Step 0: For PDF — render page 1 → canvas via PDF.js ─────────────────
    // PDFs cannot be decoded directly; we need to rasterise first
    let pdfCanvas = null
    let ocrSource = file   // for Tesseract: use original file unless it's a PDF
    if (isPDF) {
      setScanStatus('scanning') // keep scanning spinner while rendering PDF
      try {
        const pp = await pdfFileToCanvas(file, 3.0)  // 3× scale ≈ 300 DPI
        pdfCanvas = pp.canvas
        // Properly await the canvas→blob conversion (fixes async race condition)
        ocrSource = await new Promise(res => pdfCanvas.toBlob(b => res(b || file), 'image/png', 1.0))
        setScanStatus('scanning')
      } catch(e) {
        console.warn('[PDF.js]', e.message)
        // PDF.js failed — we'll fall through to direct OCR on PDF (Tesseract can handle it)
      }
    }

    // ── Step 1: zxing-wasm on original file first (ChatGPT-tested approach) ────
    // Pass the raw file directly — wasm handles rotation, inversion, adaptive binarization
    if (!isPDF) {
      try {
        const raw = await decodeQRWithZXingWasm(file, true)
        if (raw) { const p = decodeZATCAQR(raw); if (p.vatNumber || p.seller) { applyQRData(p); qrFound = true } }
      } catch {}
    }

    // ── Step 2: canvas-based passes (PDF canvas or image at multiple scales) ───
    const canvasesToTry = []
    if (pdfCanvas) {
      canvasesToTry.push(pdfCanvas)
    } else if (!qrFound) {
      try {
        const orig = await imageFileToCanvas(file, 2400)
        canvasesToTry.push(orig.canvas)
      } catch {}
    }

    // Helper: try zxing-wasm (multi-binarizer) → BarcodeDetector → jsQR on a canvas
    async function tryDecoders(cv) {
      // zxing-wasm primary (LocalAverage + GlobalHistogram + FixedThreshold passes built-in)
      try {
        const raw = await decodeQRWithZXingWasm(cv, false)
        if (raw) { const p = decodeZATCAQR(raw); if (p.vatNumber || p.seller) return p }
      } catch {}
      // BarcodeDetector (native browser API — fast on mobile Chrome/Safari)
      if ('BarcodeDetector' in window) {
        try {
          const det = new BarcodeDetector({ formats: ['qr_code'] })
          const codes = await det.detect(await createImageBitmap(cv))
          for (const c of codes) { const p = decodeZATCAQR(c.rawValue); if (p.vatNumber || p.seller) return p }
        } catch {}
      }
      // jsQR fallback
      try {
        const jsQR = await loadJsQR()
        if (jsQR) {
          const id  = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height)
          const res = jsQR(id.data, cv.width, cv.height, { inversionAttempts: 'attemptBoth' })
          if (res?.data) { const p = decodeZATCAQR(res.data); if (p.vatNumber || p.seller) return p }
        }
      } catch {}
      return null
    }

    // Helper: upscale a canvas to target width
    function upscaleCanvas(src, targetW) {
      const scale = targetW / src.width
      const dst = document.createElement('canvas')
      dst.width  = Math.round(src.width  * scale)
      dst.height = Math.round(src.height * scale)
      dst.getContext('2d').drawImage(src, 0, 0, dst.width, dst.height)
      return dst
    }

    for (const cv of canvasesToTry) {
      if (qrFound) break
      const parsed = await tryDecoders(cv)
      if (parsed) { applyQRData(parsed); qrFound = true }
    }

    // ── Bottom-crop retry: upscale bottom 40% to 1800px wide ───────────────────
    // QR codes on Saudi receipts are almost always at the bottom.
    // If the original image was low-res (< 600px wide), the QR is tiny — upscaling
    // just the bottom portion dramatically increases decode success rate.
    if (!qrFound && canvasesToTry.length > 0) {
      const src = canvasesToTry[0]
      const portions = [
        { from: 0.55, to: 1.0, label: 'bottom-45%' },
        { from: 0.35, to: 0.75, label: 'mid-40%' },
        { from: 0.0,  to: 0.45, label: 'top-45%' },
      ]
      for (const { from, to } of portions) {
        if (qrFound) break
        const yStart = Math.round(src.height * from)
        const yEnd   = Math.round(src.height * to)
        const crop   = document.createElement('canvas')
        crop.width   = src.width
        crop.height  = yEnd - yStart
        crop.getContext('2d').drawImage(src, 0, -yStart)
        // Upscale crop to at least 1800px wide for better QR detection
        const upscaled = src.width < 800 ? upscaleCanvas(crop, 1800) : crop
        // Contrast boost the crop
        const boosted = document.createElement('canvas')
        boosted.width = upscaled.width; boosted.height = upscaled.height
        boosted.getContext('2d').drawImage(upscaled, 0, 0)
        boostContrast(boosted)
        for (const c of [upscaled, boosted]) {
          if (qrFound) break
          const parsed = await tryDecoders(c)
          if (parsed) { applyQRData(parsed); qrFound = true }
        }
      }
    }

    if (qrFound) return

    // ── QR not found → OCR fills fields, user verifies ────────────────────────
    setScanStatus('no_scan')
    setVatMode('manual')
    setInvoiceType('PRINTED')

    // Run OCR and fill all extractable fields as a fallback
    ;(async () => {
      try {
        const Tess = await loadTesseract()
        if (!Tess) return
        const { data } = await Tess.recognize(ocrSource, 'eng+ara', {})
        const rawText = data.text || ''
        // DEV_MODE: expose raw text for debugging
        if (DEV_MODE) { setOcrRawText(rawText); setOcrParsed(parseOCRText(rawText)) }
        const parsed = parseOCRText(rawText)
        setOcrParsed(parsed)

        // Fill all fields from OCR — user must verify before proceeding
        if (parsed.vendor)      setVendorName(v  => v  || parsed.vendor)
        if (parsed.date)        setInvoiceDate(v => v  || parsed.date)
        if (parsed.amount)      setAmount(v      => v  || parsed.amount)
        if (parsed.vatNumber)   setVatNumber(v   => v  || parsed.vatNumber)
        if (parsed.vatAmount)   setVatAmountFromQR(v => v || parsed.vatAmount)
        if (parsed.vatNumber || parsed.amount) setVatPaid(true)

        // Duplicate detection
        if (parsed.invoiceNumber) {
          setInvoiceNumber(v => v || parsed.invoiceNumber)
          try {
            const { data: dup } = await supabase.rpc('check_duplicate_invoice',
              { p_employee_id: emp?.id, p_invoice_number: parsed.invoiceNumber,
                p_vendor_name: parsed.vendor || null }).catch(() => ({ data: null }))
            if (dup?.duplicate) setDupWarning(dup)
          } catch {}
        }
      } catch(e) { console.warn('[OCR]', e.message) }
    })()
  }

  function setHandwritten() {
    setInvoiceType('HANDWRITTEN')
    setVatMode('disabled')
    setVatPaid(false)
    setVatNumber('')
    setScanStatus('handwritten')
  }

  // ─── CAN PROCEED per step ────────────────────────────────────────────────────
  function canProceed(s) {
    if (!emp) return false
    switch(s) {
      case 'scan':
        return invoiceType === 'HANDWRITTEN' || !!photo
      case 'invoice':
        return !!invoiceDate && rawAmount > 0 && !!vendorName.trim()
          && !(late.level === 'hard')
          && !((late.level === 'warn' || late.level === 'block') && !lateReason.trim())
      case 'classify':
        return !!category
      case 'notes':
        return true  // notes are optional
      case 'summary':
        return !submitting
      default: return true
    }
  }

  // ─── NAVIGATION ──────────────────────────────────────────────────────────────
  const ORDER = ['scan','invoice','classify','notes','summary']

  function goNext() {
    const i = ORDER.indexOf(step)
    if (i < ORDER.length - 1) {
      if (step === 'invoice') checkDuplicate(invoiceNumber, vendorName)
      setStep(ORDER[i + 1])
      window.scrollTo({ top:0, behavior:'smooth' })
    }
  }
  function goBack() {
    const i = ORDER.indexOf(step)
    if (i > 0) { setStep(ORDER[i - 1]); window.scrollTo({ top:0, behavior:'smooth' }) }
  }

  // ─── SUBMIT ──────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setSubmitErr(null); setSubmitting(true)
    try {
      let receiptUrl = null
      if (photoFile) {
        try {
          const prefix = `${(emp.full_name_en||'').split(' ').slice(0,2).join('_').toUpperCase()}_${category}_SAR${Math.round(rawAmount)}_${today()}`
          const r = await uploadToDrive(photoFile, 'expenses', prefix)
          if (r) receiptUrl = r.viewUrl
        } catch (uploadErr) {
          console.warn('[Drive upload] failed — continuing without receipt URL:', uploadErr?.message)
        }
      }

      const { data: rpc, error: err } = await supabase.rpc('submit_expense_record', {
        payload: {
          entity_id:        entityId,
          employee_id:      emp.id,
          expense_date:     today(),
          invoice_date:     invoiceDate || today(),
          invoice_number:   invoiceNumber.trim() || null,
          project_id:       selAssign?.project?.id || null,
          site_number:      selAssign?.site_number || null,
          category,
          coa_account_code: selCat?.coa || COA.MISC,
          amount:           String(rawAmount),
          vat_paid:         String(vatPaid),
          vat_amount:       String(vatAmountFromQR || vatAmount), // prefer QR-exact value
          vendor_name:      vendorName.trim() || null,
          vat_number:       vatNumber.trim()  || null,
          receipt_url:      receiptUrl,
          remarks:          remarks.trim()    || null,
          late_reason:      lateReason.trim() || null,
          dept_code:        emp?.dept_code    || null,
        }
      })
      if (err)           throw err
      // Ignore JWT-shaped strings — these are notification side-effects, not real errors
      if (rpc?.error && !String(rpc.error).startsWith('eyJ')) throw new Error(rpc.error)

      setMonthCount(c => c + 1)
      setSuccessData({ vatLocked: rpc?.vat_status === 'LOCKED' })
      setStep('success')
      window.scrollTo({ top:0, behavior:'smooth' })
    } catch(e) {
      setSubmitErr(e.message || 'Failed to save expense. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setStep('scan'); setPhoto(null); setPhotoFile(null); setShowCrop(false); setOriginalPhotoUrl(null)
    setLiveQRActive(false); if (streamRef.current) { streamRef.current.getTracks().forEach(t=>t.stop()); streamRef.current=null }
    setInvoiceType('QR'); setScanStatus('idle'); setScanData(null); setOcrParsed(null); setOcrProgress(0)
    setVendorName(''); setInvoiceDate(''); setInvoiceNumber('')
    setVatMode('disabled'); setVatNumber(''); setVatPaid(false); setAmount('')
    setCategory(''); setRemarks(''); setLateReason('')
    setDupWarning(null); setVatXCheck(null); setVatPeriod(null)
    setDupAcked(false); setSubmitErr(null); setSuccessData(null)
    window.scrollTo({ top:0, behavior:'smooth' })
  }

  // ─── AUTH GUARD ───────────────────────────────────────────────────────────────
  if (!devMode && auth.needsActivation) return <OTPActivationScreen auth={auth} />
  if (!devMode) {
    if (auth.loading) return (
      <div style={{ ...PAGE, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ textAlign:'center', color:'#94a3b8' }}>
          <div style={{ fontSize:36, marginBottom:12 }}>⏳</div>
          <div style={{ fontSize:14 }}>Checking access…</div>
        </div>
      </div>
    )
    if (auth.error || !auth.employee) return (
      <div style={{ ...PAGE, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ background:'#fff', borderRadius:20, padding:36, maxWidth:340, textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,.1)' }}>
          <div style={{ fontSize:52 }}>🔒</div>
          <div style={{ fontSize:17, fontWeight:700, color:'#dc2626', marginTop:12 }}>Access Required</div>
          <div style={{ fontSize:13, color:'#64748b', marginTop:8 }}>Scan your QR code to log an expense.</div>
        </div>
      </div>
    )
  }

  // ─── ASSIGNMENT GATE ─────────────────────────────────────────────────────────
  if (!devMode && emp && assignments.length === 0) {
    return (
      <div style={{ background:MP.cream, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:MP.font }}>
        <div style={{ background:'#fff', borderRadius:24, padding:'36px 28px', maxWidth:340, textAlign:'center', boxShadow:'0 8px 32px rgba(0,0,0,.12)', margin:20 }}>
          <div style={{ fontSize:52, marginBottom:12 }}>🏗️</div>
          <div style={{ fontSize:17, fontWeight:800, color:'#1a2e3d', marginBottom:8, fontFamily:MP.font }}>No Active Site Assignment</div>
          <div style={{ fontSize:13, color:'#64748b', lineHeight:1.6, marginBottom:20 }}>
            <strong>{emp.full_name_en}</strong>, you don't have an active site assignment.<br/>
            Expenses must be linked to a site. Please contact your DH.
          </div>
          <button onClick={() => window.location.href='/forms'}
            style={{ background:MP.yellow, color:MP.textDark, border:'none', borderRadius:14, padding:'13px 24px',
              fontSize:14, fontWeight:700, cursor:'pointer', width:'100%', fontFamily:MP.font }}>
            ← Back to Forms
          </button>
        </div>
      </div>
    )
  }

  // ─── CROP MODAL OVERLAY ───────────────────────────────────────────────────────
  if (showCrop) {
    return (
      <div style={{ position:'fixed', inset:0, zIndex:9999, background:'#111', display:'flex', flexDirection:'column', fontFamily:MP.font }}>
        {/* Header */}
        <div style={{ padding:'14px 16px', background:'#000', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <div>
            <div style={{ color:'#fff', fontWeight:800, fontSize:15 }}>Trim Background</div>
            <div style={{ color:'#aaa', fontSize:11, marginTop:1 }}>Drag handles to remove desk / background from the photo</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={skipCrop}
              style={{ padding:'9px 14px', borderRadius:10, border:'1px solid #555', background:'#333',
                color:'#ddd', cursor:'pointer', fontWeight:600, fontSize:12, fontFamily:MP.font }}>
              Skip
            </button>
            <button onClick={confirmCrop}
              style={{ padding:'9px 18px', borderRadius:10, border:'none', background:MP.yellow,
                color:'#000', cursor:'pointer', fontWeight:800, fontSize:13, fontFamily:MP.font }}>
              ✓ Done
            </button>
          </div>
        </div>
        {/* Cropper image area */}
        <div style={{ flex:1, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', background:'#222' }}>
          <img ref={imgCropRef} src={originalPhotoUrl} alt="invoice"
            style={{ maxWidth:'100%', maxHeight:'100%', display:'block' }} />
        </div>
        {/* QR scan status while crop modal is open */}
        <div style={{ padding:'10px 16px', background:'#000', textAlign:'center', flexShrink:0 }}>
          {scanStatus === 'scanning' && (
            <div style={{ color:'#94a3b8', fontSize:12 }}>⏳ Reading QR code in background…</div>
          )}
          {scanStatus === 'qr_ok' && (
            <div style={{ color:'#4ade80', fontSize:12, fontWeight:700 }}>✅ QR decoded — fields auto-filled</div>
          )}
          {scanStatus === 'no_scan' && (
            <div style={{ color:'#fbbf24', fontSize:12 }}>⚠️ No QR found — please verify fields manually</div>
          )}
        </div>
      </div>
    )
  }

  // ─── SUCCESS SCREEN ───────────────────────────────────────────────────────────
  if (step === 'success') {
    const ts = T.success
    return (
      <div style={getPage(ts)}>
        <div style={{ background:MP.lightCard, padding:'52px 22px 34px', borderRadius:'0 0 28px 28px', textAlign:'center', borderBottom:`1px solid #E4E0D3`, marginBottom:20 }}>
          <div style={{ width:72, height:72, background:`${ts.color}18`, borderRadius:20,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:36, margin:'0 auto 14px' }}>✅</div>
          <div style={{ fontSize:22, fontWeight:800, color:MP.textDark, letterSpacing:-.3, fontFamily:MP.font }}>Expense Recorded</div>
          <div style={{ fontSize:26, fontWeight:800, color:ts.color, marginTop:8, fontFamily:MP.font }}>
            SAR {rawAmount.toLocaleString('en-US',{minimumFractionDigits:2})}
          </div>
          <div style={{ fontSize:13, color:MP.textMutedLight, marginTop:4, fontFamily:MP.font }}>
            {selCat?.icon} {selCat?.label}
          </div>
        </div>
        <div style={{ padding:'0 14px' }}>
          <SCard>
            <SSection>
              <SRow label="Vendor"   value={vendorName} />
              <SRow label="Date"     value={invoiceDate} />
              <SRow label="VAT"      value={vatPaid ? `SAR ${vatAmount.toFixed(2)} (15%)` : 'No VAT'} />
              {selAssign && <SRow label="Site" value={`${selAssign.site_number}${selAssign.site_name?' — '+selAssign.site_name:''}`} />}
              <SRow label="Month count" value={`${monthCount} expense${monthCount!==1?'s':''} this month`} color={ts.color} />
            </SSection>
          </SCard>
          {successData?.vatLocked && (
            <Banner type="warn">
              📅 This invoice date falls in a closed VAT quarter. Your Accounts team has been notified.
            </Banner>
          )}
          <button onClick={reset}
            style={{ background:MP.yellow, color:MP.textDark, border:'none', borderRadius:16, fontFamily:MP.font,
              padding:'17px', fontSize:15, fontWeight:700, cursor:'pointer', width:'100%', marginBottom:10 }}>
            + Add Another Expense
          </button>
          <button onClick={() => window.location.href='/forms'}
            style={{ background:MP.lightCard, color:MP.textMutedLight, border:`1.5px solid #D5D2C5`, borderRadius:16,
              padding:'14px', fontSize:14, fontWeight:600, fontFamily:MP.font, cursor:'pointer', width:'100%' }}>
            ← Back to Forms
          </button>
        </div>
      </div>
    )
  }

  // ─── DEV MODE EMPLOYEE PICKER (shown at top of scan step) ────────────────────
  function DevPicker() {
    if (!devMode) return null
    return (
      <SCard style={{ margin:'0 14px 12px', borderColor:'#fbbf24', borderWidth:2 }}>
        <SSection title="DEV — Select Employee" accent="#f59e0b">
          <FSel value={devEmployee?.id||''} onChange={e => setDevEmployee(devEmployees.find(x=>x.id===e.target.value)||null)} accent="#f59e0b">
            <option value="">— pick an employee —</option>
            {devEmployees.map(e => <option key={e.id} value={e.id}>{e.full_name_en} · {e.designation||'—'}</option>)}
          </FSel>
          {devEmployee && (
            <div style={{ fontSize:12, color:'#78350f', marginTop:6 }}>
              ✅ {devEmployee.full_name_en} · {devEmployee.department||'—'} · {devAssignments.length} site(s)
            </div>
          )}
        </SSection>
      </SCard>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // STEP RENDERS
  // ═══════════════════════════════════════════════════════════════════════════════

  // ── STEP 1: SCAN ──────────────────────────────────────────────────────────────
  if (step === 'scan') {
    const ts = T.scan
    return (
      <div style={getPage(ts)}>
        <StepHeader stepId="scan" t={ts} emp={emp} devMode={devMode}
          onBack={null}>
          <div style={{ fontSize:12, color: ts.variant === 'dark' ? 'rgba(255,255,255,.55)' : MP.textMutedLight, marginTop:4 }}>
            {monthCount > 0 ? `${monthCount} expense${monthCount!==1?'s':''} this month` : 'No expenses this month yet'}
          </div>
        </StepHeader>

        <DevPicker />

        {(!devMode || devEmployee) && (
          <div style={{ padding:'0 14px' }}>
            {/* Invoice type selector */}
            <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1, marginBottom:12 }}>
              What type of invoice?
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:16 }}>
              {[
                { key:'QR',          icon:'📱', label:'ZATCA QR',    desc:'Saudi tax invoice' },
                { key:'PRINTED',     icon:'🖨️', label:'Printed',     desc:'No QR code'        },
                { key:'HANDWRITTEN', icon:'✍️', label:'Handwritten', desc:'No VAT'             },
              ].map(it => {
                const sel = invoiceType === it.key
                return (
                  <button key={it.key} type="button"
                    onClick={() => { setInvoiceType(it.key); if (it.key==='HANDWRITTEN') setHandwritten() }}
                    style={{ padding:'13px 6px', borderRadius:14,
                      border: sel ? `2px solid ${MP.yellow}` : `1.5px solid #E4E0D3`,
                      background: sel ? '#FDF8E8' : MP.lightCard, cursor:'pointer',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:5, boxSizing:'border-box',
                      boxShadow: sel ? `0 0 0 3px ${MP.yellow}30` : 'none' }}>
                    <span style={{ fontSize:22 }}>{it.icon}</span>
                    <span style={{ fontSize:10, fontWeight:800, color: sel ? '#7A5C00' : '#475569' }}>{it.label}</span>
                    <span style={{ fontSize:9, color:'#94a3b8', textAlign:'center' }}>{it.desc}</span>
                  </button>
                )
              })}
            </div>

            {/* Handwritten mode — no photo needed */}
            {invoiceType === 'HANDWRITTEN' ? (
              <SCard>
                <SSection title="Handwritten Invoice" accent="#a78bfa">
                  <Banner type="info">
                    <span>✍️</span>
                    <span>Handwritten invoices don't have VAT. You'll record vendor name and amount only.<br/>
                    <strong>No photo required</strong>, but you can still add one.</span>
                  </Banner>
                  {/* Optional photo — also accept PDFs */}
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" style={{ display:'none' }}
                    onChange={e => handlePhotoSelect(e.target.files[0])} />
                  {!photo ? (
                    <button onClick={() => fileRef.current?.click()}
                      style={{ width:'100%', padding:'14px', borderRadius:14, border:'2px dashed #c4b5fd',
                        background:'#f5f3ff', color:'#7c3aed', cursor:'pointer', fontSize:13, fontWeight:700 }}>
                      📷 Add photo (optional)
                    </button>
                  ) : (
                    <div style={{ position:'relative', borderRadius:12, overflow:'hidden' }}>
                      <img src={photo} alt="" style={{ width:'100%', maxHeight:160, objectFit:'cover', display:'block' }} />
                      <button onClick={() => { setPhoto(null); setPhotoFile(null) }}
                        style={{ position:'absolute', top:8, right:8, background:'rgba(0,0,0,.55)',
                          color:'#fff', border:'none', borderRadius:20, width:28, height:28, cursor:'pointer', fontWeight:800 }}>✕</button>
                    </div>
                  )}
                </SSection>
              </SCard>
            ) : (
              /* QR or PRINTED — show photo capture */
              <SCard>
                <SSection title={invoiceType === 'QR' ? 'Photograph the ZATCA QR Code' : 'Photograph the Invoice'} accent={ts.color}>
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" style={{ display:'none' }}
                    onChange={e => handlePhotoSelect(e.target.files[0])} />

                  {/* Live QR camera stream */}
                  {liveQRActive && (
                    <div style={{ position:'relative', borderRadius:14, overflow:'hidden', background:'#000' }}>
                      <video ref={videoRef} style={{ width:'100%', maxHeight:300, display:'block' }} playsInline muted />
                      <div style={{ position:'absolute', inset:0, border:'3px solid #22c55e', borderRadius:14, pointerEvents:'none', opacity:.7 }} />
                      <button onClick={stopLiveQRScan}
                        style={{ position:'absolute', top:10, right:10, background:'rgba(0,0,0,.65)',
                          color:'#fff', border:'none', borderRadius:20, width:30, height:30, cursor:'pointer', fontWeight:800, fontSize:13 }}>✕</button>
                      <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'rgba(0,0,0,.5)',
                        padding:'8px', textAlign:'center', color:'#fff', fontSize:12, fontWeight:700 }}>
                        📱 Point at the QR code…
                      </div>
                    </div>
                  )}
                  {!photo && !liveQRActive ? (
                    <div>
                      {/* Primary: Take Photo */}
                      <button onClick={() => fileRef.current?.click()}
                        style={{ width:'100%', padding:'28px 16px', borderRadius:16, border:`2px dashed ${ts.color}50`,
                          background:`${ts.color}06`, color:ts.color, cursor:'pointer', boxSizing:'border-box',
                          display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                        <div style={{ width:56, height:56, borderRadius:16, background:`${ts.color}15`,
                          display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>📷</div>
                        <span style={{ fontSize:14, fontWeight:800 }}>Tap to photograph invoice</span>
                        <span style={{ fontSize:11, opacity:.6 }}>
                          {invoiceType === 'QR' ? 'Point at the invoice — QR auto-fills fields' : 'Capture the full invoice clearly'}
                        </span>
                      </button>
                      {/* Secondary: Scan QR first */}
                      <div style={{ textAlign:'center', marginTop:12 }}>
                        <button onClick={startLiveQRScan}
                          style={{ background:'none', border:'none', color:'#64748b', fontSize:12, cursor:'pointer',
                            fontFamily:MP.font, textDecoration:'underline', padding:'4px 0' }}>
                          📱 Scan QR code first
                        </button>
                        <div style={{ fontSize:10, color:'#94a3b8', marginTop:2 }}>
                          QR fills fields — you'll still need to photograph the invoice
                        </div>
                      </div>
                    </div>
                  ) : !liveQRActive && photo ? (
                    <div style={{ position:'relative', borderRadius:14, overflow:'hidden',
                      boxShadow:`0 4px 16px ${ts.color}30` }}>
                      <img src={photo} alt="invoice" style={{ width:'100%', maxHeight:220, objectFit:'cover', display:'block' }} />
                      <button onClick={() => { setPhoto(null); setPhotoFile(null); setScanStatus('idle'); setScanData(null); setOcrParsed(null); setInvoiceType('QR') }}
                        style={{ position:'absolute', top:10, right:10, background:'rgba(0,0,0,.55)',
                          color:'#fff', border:'none', borderRadius:20, width:30, height:30, cursor:'pointer', fontWeight:800, fontSize:13 }}>✕</button>
                      <button onClick={() => fileRef.current?.click()}
                        style={{ position:'absolute', bottom:10, right:10, background:'rgba(0,0,0,.55)',
                          color:'#fff', border:'1px solid rgba(255,255,255,.4)', borderRadius:10, padding:'5px 10px',
                          cursor:'pointer', fontWeight:600, fontSize:11 }}>Retake</button>
                    </div>
                  ) : null}

                  {/* Scan status */}
                  {scanStatus === 'scanning' && (
                    <div style={{ background:`${ts.color}10`, border:`1px solid ${ts.color}30`, borderRadius:12,
                      padding:'12px 14px', marginTop:10, fontSize:13, color:ts.dark, display:'flex', gap:8, alignItems:'center' }}>
                      <span style={{ fontSize:18, animation:'spin 1s linear infinite' }}>⏳</span>
                      <span>Reading QR code…</span>
                    </div>
                  )}
                  {/* ocr_running state no longer shown — OCR runs silently */}
                  {scanStatus === 'qr_ok' && (
                    <Banner type="success">
                      <span>✅</span>
                      <div>
                        <strong>Auto-filled from ZATCA QR</strong><br />
                        {scanData?.seller && <span>{scanData.seller}</span>}
                        {scanData?.vatNumber && <span> · VAT# {scanData.vatNumber}</span>}
                        {scanData?.totalWithVat && <span> · SAR {parseFloat(scanData.totalWithVat).toFixed(2)}</span>}
                      </div>
                    </Banner>
                  )}
                  {scanStatus === 'no_scan' && (
                    <Banner type="warn">
                      <span>📋</span>
                      <div>
                        <strong>QR not decoded — reading invoice text (OCR)…</strong><br />
                        Fields will be auto-filled where possible. Please verify before continuing.
                      </div>
                    </Banner>
                  )}
                  {/* DEV_MODE only: OCR debug panel for testing new receipt types */}
                  {DEV_MODE && ocrRawText && (
                    <div style={{ marginTop:6 }}>
                      <button onClick={() => setShowOcrDebug(v => !v)}
                        style={{ fontSize:10, background:'none', border:'1px solid #94a3b8', borderRadius:6,
                          padding:'2px 8px', cursor:'pointer', color:'#64748b' }}>
                        {showOcrDebug ? '▲ Hide' : '▼ Show'} OCR debug
                      </button>
                      {showOcrDebug && (() => {
                        const parsed = parseOCRText(ocrRawText)
                        const fields = [
                          { label:'Vendor',   val:parsed.vendor },
                          { label:'Date',     val:parsed.date },
                          { label:'Amount',   val:parsed.amount },
                          { label:'VAT#',     val:parsed.vatNumber },
                          { label:'Invoice#', val:parsed.invoiceNo },
                          { label:'VAT Amt',  val:parsed.vatAmount },
                        ]
                        return (
                          <div style={{ marginTop:6, border:'1px solid #e2e8f0', borderRadius:6, overflow:'hidden', fontSize:10 }}>
                            <div style={{ background:'#f1f5f9', padding:'4px 8px', fontWeight:600, color:'#475569', fontSize:9 }}>
                              PARSED FIELDS (dev only)
                            </div>
                            <table style={{ width:'100%', borderCollapse:'collapse' }}>
                              <tbody>
                                {fields.map(({ label, val }) => (
                                  <tr key={label} style={{ borderBottom:'1px solid #f1f5f9' }}>
                                    <td style={{ padding:'3px 8px', color:'#64748b', width:'30%', fontWeight:500 }}>{label}</td>
                                    <td style={{ padding:'3px 8px', color: val ? '#166534' : '#dc2626',
                                      fontWeight: val ? 600 : 400, fontFamily:'monospace' }}>
                                      {val || '— not found'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div style={{ background:'#f1f5f9', padding:'4px 8px', fontWeight:600, color:'#475569', fontSize:9, borderTop:'1px solid #e2e8f0' }}>
                              RAW OCR TEXT
                            </div>
                            <pre style={{ margin:0, fontSize:9, background:'#f8fafc', padding:'8px',
                              maxHeight:180, overflow:'auto', whiteSpace:'pre-wrap', wordBreak:'break-all',
                              color:'#334155', direction:'ltr' }}>
                              {ocrRawText}
                            </pre>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                  {!photo && scanStatus === 'idle' && (
                    <Banner type="info">
                      <span>💡</span>
                      <span>Saudi ZATCA invoices have a QR code. Photographing it auto-fills vendor, VAT number, date and total.</span>
                    </Banner>
                  )}
                </SSection>
              </SCard>
            )}
          </div>
        )}

        <NavBar
          onBack={null}
          onNext={goNext}
          nextLabel="Next — Invoice Details →"
          nextColor={ts.color}
          disabled={!canProceed('scan') || (devMode && !devEmployee)}
        />
      </div>
    )
  }

  // ── STEP 2: INVOICE DETAILS ───────────────────────────────────────────────────
  if (step === 'invoice') {
    const ts = T.invoice
    return (
      <div style={getPage(ts)}>
        <StepHeader stepId="invoice" t={ts} emp={emp} devMode={devMode} onBack={goBack} />
        <div style={{ padding:'0 14px' }}>

          <SCard>
            <SSection title="Vendor / Supplier" accent={ts.color}>
              <FLabel accent={ts.color}>Vendor Name *
                {(scanData?.seller || ocrParsed?.vendor) && <span style={{ background:`${ts.color}15`, color:ts.color, borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:700, marginLeft:8 }}>{scanStatus==='qr_ok'?'QR auto-fill':'OCR'}</span>}
              </FLabel>
              <FInp
                placeholder="e.g. ADNOC, Al Jazeera Hotel…"
                value={vendorName}
                onChange={e => setVendorName(e.target.value)}
                accent={ts.color}
                dir="auto"
              />
            </SSection>
          </SCard>

          <SCard>
            <SSection title="Invoice Date" accent={ts.color}>
              <FLabel accent={ts.color}>Date printed on the invoice *
                {(scanData?.timestamp || ocrParsed?.date) && <span style={{ background:`${ts.color}15`, color:ts.color, borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:700, marginLeft:8 }}>{scanStatus==='qr_ok'?'QR':'OCR'}</span>}
              </FLabel>
              <FInp
                type="date" value={invoiceDate} min={minDate()} max={today()}
                onChange={e => { setInvoiceDate(e.target.value); setLateReason('') }}
                accent={late.level==='ok' ? ts.color : late.level==='warn' ? '#f59e0b' : '#ef4444'}
              />
              {!invoiceDate && <div style={{ fontSize:11, color:'#ef4444', marginTop:4, fontWeight:600 }}>⚠️ Invoice date is required</div>}

              {/* Late submission alerts */}
              {invoiceDate && late.level === 'warn' && (
                <Banner type="warn">⚠️ <strong>Late ({late.days} days).</strong> {late.msg}</Banner>
              )}
              {invoiceDate && late.level === 'block' && (
                <Banner type="error">🔶 <strong>Very late ({late.days} days).</strong> {late.msg}</Banner>
              )}
              {invoiceDate && late.level === 'hard' && (
                <Banner type="error">🚫 <strong>Cannot submit.</strong> {late.msg}</Banner>
              )}
              {invoiceDate && (late.level==='warn'||late.level==='block') && (
                <div style={{ marginTop:10 }}>
                  <FLabel>Reason for late submission *</FLabel>
                  <FArea rows={2}
                    placeholder="e.g. Invoice was with site PM, received today."
                    value={lateReason}
                    onChange={e => setLateReason(e.target.value)}
                    accent={lateReason.trim() ? '#22c55e' : '#ef4444'}
                  />
                </div>
              )}

              {/* VAT period warning */}
              {vatPeriod === 'LOCKED' && invoiceDate && (
                <Banner type="warn">📅 <strong>VAT period advisory:</strong> This invoice date falls in a quarter that may already be filed with ZATCA.</Banner>
              )}
            </SSection>
          </SCard>

          <SCard>
            <SSection title="Amount (SAR)" accent={ts.color}>
              {(scanData?.totalWithVat || ocrParsed?.amount) && (
                <div style={{ fontSize:11, color:ts.color, fontWeight:700, marginBottom:8, textTransform:'uppercase', letterSpacing:.5 }}>
                  {scanStatus==='qr_ok' ? '📱 Auto-filled from QR' : '📄 OCR-extracted — please verify'}
                </div>
              )}
              <input
                type="number" inputMode="decimal" placeholder="0.00"
                value={amount} onChange={e => setAmount(e.target.value)}
                style={{ width:'100%', padding:'18px 16px', borderRadius:16,
                  border: `2px solid ${rawAmount > 0 ? ts.color : '#D5D2C5'}`,
                  fontSize:28, fontWeight:800, textAlign:'center',
                  color: rawAmount > 0 ? ts.dark : MP.textMutedLight,
                  outline:'none', boxSizing:'border-box', fontFamily:MP.font,
                  background: MP.lightCard, transition:'border-color .15s, color .15s' }}
              />
              {rawAmount > 0 && (
                <div style={{ textAlign:'center', fontSize:12, color:'#64748b', marginTop:6 }}>
                  SAR {rawAmount.toLocaleString('en-US',{minimumFractionDigits:2})} total
                </div>
              )}

              {/* VAT section */}
              <div style={{ marginTop:16 }}>
                {vatMode === 'disabled' ? (
                  <div style={{ padding:'12px 14px', borderRadius:12, background:'#f8fafc', border:'1.5px solid #e8ecf0',
                    display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:40, height:22, borderRadius:11, background:'#e2e8f0', display:'flex', alignItems:'center', padding:2 }}>
                      <div style={{ width:18, height:18, borderRadius:9, background:'#94a3b8' }} />
                    </div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#94a3b8' }}>VAT — {invoiceType==='HANDWRITTEN'?'Disabled (handwritten invoice)':'Disabled'}</div>
                      {invoiceType==='HANDWRITTEN' && <div style={{ fontSize:11, color:'#94a3b8' }}>Handwritten invoices don't carry VAT</div>}
                      {invoiceType!=='HANDWRITTEN' && <div style={{ fontSize:11, color:'#0ea5e9' }}>Will be enabled after photo is taken</div>}
                    </div>
                  </div>
                ) : (
                  <div>
                    {vatMode === 'manual' && (
                      <div>
                        <Banner type="warn">
                          <span>📄</span>
                          <span>QR not decoded — fields auto-filled from invoice text (OCR). <strong>Please verify all values</strong> before continuing.</span>
                        </Banner>
                        {/* Re-scan QR tip: shown when OCR couldn't decode QR */}
                        <div style={{ marginTop:8, background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10,
                          padding:'10px 14px', fontSize:12, color:'#1d4ed8' }}>
                          <strong>📷 Better QR decode tip:</strong> Re-photograph <em>just the QR code</em> (zoom in close) and upload again — this gives the decoder much more pixels to work with.
                          <button onClick={() => { fileRef.current?.click() }}
                            style={{ display:'block', marginTop:6, background:'#1d4ed8', color:'#fff',
                              border:'none', borderRadius:8, padding:'6px 14px', fontSize:12, cursor:'pointer', fontWeight:600 }}>
                            📷 Re-scan QR code only
                          </button>
                        </div>
                      </div>
                    )}
                    {vatMode === 'auto' && (
                      <Banner type="success">
                        <span>✅</span>
                        <span>VAT auto-detected from ZATCA QR. Verify amounts below.</span>
                      </Banner>
                    )}
                    {/* VAT toggle */}
                    <div onClick={() => setVatPaid(p => !p)}
                      style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                        padding:'13px 15px', borderRadius:13, border:`2px solid ${vatPaid?ts.color+'50':'#e8ecf0'}`,
                        background: vatPaid?`${ts.color}08`:'#fafbfc', cursor:'pointer', marginBottom:vatPaid?12:0 }}>
                      <div>
                        <div style={{ fontWeight:700, fontSize:14, color: vatPaid?ts.dark:'#475569' }}>
                          💳 VAT included in this amount?
                        </div>
                        {vatPaid && rawAmount > 0 && (
                          <div style={{ fontSize:12, color:ts.color, marginTop:2, fontWeight:600 }}>
                            Net: SAR {netAmount.toFixed(2)} + VAT: SAR {vatAmount.toFixed(2)}
                          </div>
                        )}
                      </div>
                      <div style={{ width:46, height:26, borderRadius:13, background:vatPaid?ts.color:'#e2e8f0',
                        display:'flex', alignItems:'center', padding:3, transition:'all .2s',
                        justifyContent:vatPaid?'flex-end':'flex-start', flexShrink:0 }}>
                        <div style={{ width:20, height:20, borderRadius:10, background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,.3)' }} />
                      </div>
                    </div>

                    {/* VAT Number */}
                    {(vatMode === 'manual' || vatMode === 'auto') && (
                      <div style={{ marginTop:vatPaid?0:12 }}>
                        <FLabel accent={ts.color}>
                          VAT Registration No.{' '}
                          {scanData?.vatNumber && <span style={{ background:`${ts.color}15`, color:ts.color, borderRadius:5, padding:'1px 7px', fontSize:9, fontWeight:700, marginLeft:4 }}>QR</span>}
                          {vatNumber && !isValidVATNum(vatNumber) && <span style={{ background:'#fee2e2', color:'#dc2626', borderRadius:5, padding:'1px 7px', fontSize:9, fontWeight:700, marginLeft:4 }}>invalid</span>}
                          {vatNumber && isValidVATNum(vatNumber) && <span style={{ background:'#dcfce7', color:'#15803d', borderRadius:5, padding:'1px 7px', fontSize:9, fontWeight:700, marginLeft:4 }}>✓</span>}
                        </FLabel>
                        <FInp
                          placeholder="3XXXXXXXXXXXXXX (15 digits)"
                          value={vatNumber}
                          onChange={e => setVatNumber(e.target.value)}
                          style={{ fontFamily:'monospace' }}
                          accent={vatNumber ? (isValidVATNum(vatNumber)?'#22c55e':'#ef4444') : ts.color}
                          disabled={vatMode === 'auto' && !!scanData?.vatNumber}
                        />
                      </div>
                    )}

                    {/* VAT Amount — shown when QR decoded it exactly */}
                    {vatAmountFromQR && vatMode === 'auto' && (
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                        background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:10, padding:'10px 14px', marginTop:8 }}>
                        <span style={{ fontSize:12, color:'#15803d', fontWeight:600 }}>VAT Amount (from QR)</span>
                        <span style={{ fontSize:15, fontWeight:700, color:'#15803d' }}>SAR {vatAmountFromQR}</span>
                      </div>
                    )}

                    {/* VAT cross-check */}
                    {vatXCheck && !vatXCheck.ok && (
                      <Banner type="warn">⚠️ VAT mismatch: QR shows SAR {vatXCheck.actual?.toFixed(2)}, expected SAR {vatXCheck.expected?.toFixed(2)} at 15%. Verify the amount.</Banner>
                    )}
                    {vatXCheck?.ok && <Banner type="success">✅ VAT verified — matches 15% of net amount</Banner>}
                  </div>
                )}
              </div>
            </SSection>
          </SCard>

          {/* Invoice number */}
          <SCard>
            <SSection title="Invoice Number (Duplicate Detection)" accent={ts.color}>
              <FLabel accent={ts.color}>
                Invoice No.
                {ocrParsed?.invoiceNumber && <span style={{ background:`${ts.color}15`, color:ts.color, borderRadius:5, padding:'1px 7px', fontSize:9, fontWeight:700, marginLeft:4 }}>OCR</span>}
                <span style={{ textTransform:'none', fontWeight:400, color:'#94a3b8', marginLeft:4 }}> (optional — enables duplicate detection)</span>
              </FLabel>
              <FInp
                placeholder="e.g. INV-2026-00123"
                value={invoiceNumber}
                onChange={e => { setInvoiceNumber(e.target.value); setDupAcked(false); checkDuplicate(e.target.value, vendorName) }}
                accent={ts.color}
                style={{ fontFamily:'monospace' }}
              />
              {dupWarning && !dupAcked && (
                <div style={{ background:'#fef2f2', border:'1.5px solid #fecaca', borderRadius:12,
                  padding:'12px 14px', marginTop:8 }}>
                  <div style={{ fontWeight:800, color:'#dc2626', fontSize:13, marginBottom:4 }}>
                    ⚠️ Possible Duplicate Invoice
                  </div>
                  <div style={{ fontSize:12, color:'#991b1b', lineHeight:1.6 }}>
                    You already submitted invoice <strong>{invoiceNumber}</strong> on <strong>{dupWarning.existing_date}</strong>{' '}
                    for SAR <strong>{dupWarning.existing_amount}</strong>.
                  </div>
                  <button onClick={() => setDupAcked(true)}
                    style={{ marginTop:10, background:'#dc2626', color:'#fff', border:'none', borderRadius:8,
                      padding:'8px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                    I understand — this is a different invoice
                  </button>
                </div>
              )}
              {dupWarning && dupAcked && (
                <Banner type="warn">⚠️ Duplicate acknowledged — proceed only if this is genuinely different.</Banner>
              )}
            </SSection>
          </SCard>

        </div>
        <NavBar
          onBack={goBack}
          onNext={goNext}
          nextLabel="Next — Category →"
          nextColor={ts.color}
          disabled={!canProceed('invoice')}
        />
      </div>
    )
  }

  // ── STEP 3: CATEGORY & SITE ───────────────────────────────────────────────────
  if (step === 'classify') {
    const ts = T.classify
    return (
      <div style={getPage(ts)}>
        <StepHeader stepId="classify" t={ts} emp={emp} devMode={devMode} onBack={goBack} />
        <div style={{ padding:'0 14px' }}>

          <SCard>
            <SSection title="Expense Category" accent={ts.color}>
              <CategoryPicker categories={visCats} value={category} onChange={setCategory} accent={ts.color} />
            </SSection>
          </SCard>

          {selCat && (
            <Banner type="info">
              <span>{selCat.icon}</span>
              <span>{selCat.label} · {selCat.labelAr}</span>
            </Banner>
          )}

          {assignments.length > 0 && (
            <SCard>
              <SSection title="Site / Project" accent={ts.color}>
                <div style={{ fontSize:11, color:'#94a3b8', marginBottom:10 }}>
                  Linking this expense to a site helps with project cost tracking.
                </div>
                <button
                  onClick={() => setAssignmentId('')}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'13px 14px', width:'100%', borderRadius:13,
                    border:`2px solid ${!assignmentId?ts.color:'#e8ecf0'}`, background:!assignmentId?`${ts.color}10`:'#fafbfc',
                    cursor:'pointer', marginBottom:8, boxSizing:'border-box' }}>
                  <span style={{ fontSize:16 }}>🏢</span>
                  <div style={{ textAlign:'left' }}>
                    <div style={{ fontWeight:700, fontSize:13, color:!assignmentId?ts.dark:'#475569' }}>None / General</div>
                    <div style={{ fontSize:11, color:'#94a3b8' }}>Not site-specific</div>
                  </div>
                  {!assignmentId && <span style={{ marginLeft:'auto', color:ts.color, fontWeight:900 }}>✓</span>}
                </button>
                {assignments.map(a => (
                  <button key={a.id}
                    onClick={() => setAssignmentId(a.id)}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'13px 14px', width:'100%', borderRadius:13,
                      border:`2px solid ${assignmentId===a.id?ts.color:'#e8ecf0'}`, background:assignmentId===a.id?`${ts.color}10`:'#fafbfc',
                      cursor:'pointer', marginBottom:8, boxSizing:'border-box' }}>
                    <span style={{ fontSize:16 }}>📍</span>
                    <div style={{ textAlign:'left', flex:1 }}>
                      <div style={{ fontWeight:800, fontSize:13, color:assignmentId===a.id?ts.dark:'#1e293b' }}>
                        {a.site_number}{a.site_name?` — ${a.site_name}`:''}
                      </div>
                      <div style={{ fontSize:11, color:'#64748b', marginTop:1 }}>
                        {a.project?.project_number && `${a.project.project_number} · `}
                        {a.project?.project_name||''}
                        {a.contractor?.contractor_name?` · ${a.contractor.contractor_name}`:''}
                      </div>
                    </div>
                    {assignmentId===a.id && <span style={{ color:ts.color, fontWeight:900 }}>✓</span>}
                  </button>
                ))}
              </SSection>
            </SCard>
          )}
        </div>
        <NavBar
          onBack={goBack}
          onNext={goNext}
          nextLabel="Next — Notes →"
          nextColor={ts.color}
          disabled={!canProceed('classify')}
        />
      </div>
    )
  }

  // ── STEP 4: NOTES ─────────────────────────────────────────────────────────────
  if (step === 'notes') {
    const ts = T.notes
    return (
      <div style={getPage(ts)}>
        <StepHeader stepId="notes" t={ts} emp={emp} devMode={devMode} onBack={goBack} />
        <div style={{ padding:'0 14px' }}>

          <SCard>
            <SSection title="Additional Notes" accent={ts.color}>
              <FLabel>Remarks <span style={{ textTransform:'none', fontWeight:400, color:'#94a3b8' }}>(optional)</span></FLabel>
              <FArea
                rows={3}
                placeholder="Any additional context, approvals, or notes about this expense…"
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                accent={ts.color}
              />
            </SSection>
          </SCard>

          {/* Show late reason here if not already set */}
          {(late.level === 'warn' || late.level === 'block') && !lateReason.trim() && (
            <SCard style={{ borderColor:'#fbbf24', borderWidth:1.5 }}>
              <SSection title="Late Submission Reason" accent="#f59e0b">
                <Banner type="warn">⚠️ Invoice is {late.days} days old — reason required before you can submit.</Banner>
                <FArea
                  rows={2}
                  placeholder="Why is this invoice being submitted late?"
                  value={lateReason}
                  onChange={e => setLateReason(e.target.value)}
                  accent="#f59e0b"
                />
              </SSection>
            </SCard>
          )}

          {/* Quick summary reminder */}
          <SCard style={{ background:'#f8fafc' }}>
            <SSection title="Summary so far" accent={ts.color}>
              <SRow label="Vendor"   value={vendorName || '—'} />
              <SRow label="Date"     value={invoiceDate} />
              <SRow label="Amount"   value={rawAmount>0?`SAR ${rawAmount.toLocaleString('en-US',{minimumFractionDigits:2})}`:'—'} color={ts.color} />
              <SRow label="Category" value={selCat ? `${selCat.icon} ${selCat.label}` : '—'} />
              <SRow label="Site"     value={selAssign?`${selAssign.site_number}${selAssign.site_name?' — '+selAssign.site_name:''}`:'None'} />
            </SSection>
          </SCard>

        </div>
        <NavBar
          onBack={goBack}
          onNext={goNext}
          nextLabel="Review & Submit →"
          nextColor={ts.color}
          disabled={!canProceed('notes')}
        />
      </div>
    )
  }

  // ── STEP 5: SUMMARY / REVIEW ──────────────────────────────────────────────────
  if (step === 'summary') {
    const ts = T.summary
    const isHardBlock = late.level === 'hard'
    const submitReady = !isHardBlock && !!category && rawAmount > 0 && !!vendorName.trim() && !!invoiceDate
      && !(late.level === 'warn' || late.level === 'block' ? !lateReason.trim() : false)
      && !(dupWarning && !dupAcked)

    return (
      <div style={getPage(ts)}>
        <div style={{ background:MP.darkCard, padding:'50px 22px 28px', borderRadius:'0 0 28px 28px', marginBottom:20, borderBottom:`1px solid #3A3D35` }}>
          <div style={{ fontSize:10, color:MP.textMutedDark, textTransform:'uppercase', letterSpacing:1.5, marginBottom:10, fontFamily:MP.font, fontWeight:600 }}>
            Expense Review
          </div>
          <div style={{ fontSize:30, fontWeight:800, color:MP.yellow, letterSpacing:-.5, fontFamily:MP.font }}>
            {selCat?.icon} SAR {rawAmount.toLocaleString('en-US',{minimumFractionDigits:2})}
          </div>
          <div style={{ fontSize:14, color:MP.textMutedDark, marginTop:8, fontFamily:MP.font }}>
            {selCat?.label} · {emp?.full_name_en}
          </div>
        </div>
        <div style={{ padding:'0 14px' }}>

          {/* Duplicate warning in summary */}
          {dupWarning && !dupAcked && (
            <div style={{ background:'#fef2f2', border:'2px solid #fca5a5', borderRadius:16, padding:'14px 16px', marginBottom:12 }}>
              <div style={{ fontWeight:900, color:'#dc2626', fontSize:14, marginBottom:6 }}>⚠️ DUPLICATE INVOICE DETECTED</div>
              <div style={{ fontSize:13, color:'#991b1b', lineHeight:1.7 }}>
                Invoice <strong>{invoiceNumber}</strong> was already submitted on <strong>{dupWarning.existing_date}</strong>{' '}
                for SAR <strong>{dupWarning.existing_amount}</strong>.
              </div>
              <button onClick={() => setDupAcked(true)}
                style={{ marginTop:10, background:'#dc2626', color:'#fff', border:'none', borderRadius:10,
                  padding:'10px 16px', fontSize:13, fontWeight:800, cursor:'pointer', width:'100%' }}>
                Confirm — this is a different invoice
              </button>
            </div>
          )}

          {/* Invoice details */}
          <SCard dark>
            <SSection title="Invoice" accent={ts.color} dark>
              <SRow label="Vendor"         value={vendorName} dark />
              <SRow label="Invoice Date"   value={invoiceDate} dark />
              <SRow label="Invoice No."    value={invoiceNumber} mono dark />
              <SRow label="Invoice Type"   value={invoiceType==='QR'?'📱 ZATCA QR':invoiceType==='PRINTED'?'🖨️ Printed':'✍️ Handwritten'} dark />
            </SSection>
          </SCard>

          {/* Financial */}
          <SCard dark>
            <SSection title="Financial" accent={ts.color} dark>
              <SRow label="Total Amount"  value={`SAR ${rawAmount.toLocaleString('en-US',{minimumFractionDigits:2})}`} color={MP.yellow} dark />
              {vatPaid && <>
                <SRow label="Net (ex-VAT)" value={`SAR ${netAmount.toFixed(2)}`} dark />
                <SRow label="VAT (15%)"    value={`SAR ${vatAmount.toFixed(2)}`} dark />
              </>}
              <SRow label="VAT Registered" value={vatPaid && vatNumber ? (isValidVATNum(vatNumber) ? `✓ ${vatNumber}` : `⚠️ ${vatNumber}`) : vatPaid ? 'Yes (no VAT#)' : 'No'} mono dark />
            </SSection>
          </SCard>

          {/* Classification */}
          <SCard dark>
            <SSection title="Classification" accent={ts.color} dark>
              <SRow label="Category" value={selCat ? `${selCat.icon} ${selCat.label}` : '—'} dark />
              <SRow label="Site"     value={selAssign?`${selAssign.site_number}${selAssign.site_name?' — '+selAssign.site_name:''}`:'None / General'} dark />
              <SRow label="Project"  value={selAssign?.project?.project_name || '—'} dark />
            </SSection>
          </SCard>

          {/* Late / notes */}
          {(remarks || lateReason || late.level !== 'ok') && (
            <SCard dark>
              <SSection title="Notes" accent={ts.color} dark>
                {late.level !== 'ok' && <SRow label="Submission" value={`${late.days} days late`} color={late.level==='warn'?'#F7D263':'#FF7B6B'} dark />}
                {lateReason && <SRow label="Late reason" value={lateReason} dark />}
                {remarks    && <SRow label="Remarks"     value={remarks} dark />}
              </SSection>
            </SCard>
          )}

          {/* Photo thumbnail */}
          {photo && (
            <SCard dark>
              <SSection title="Receipt Photo" accent={ts.color} dark>
                <div style={{ borderRadius:12, overflow:'hidden' }}>
                  <img src={photo} alt="receipt" style={{ width:'100%', maxHeight:160, objectFit:'cover', display:'block' }} />
                </div>
              </SSection>
            </SCard>
          )}

          {/* Errors */}
          {submitErr && <Banner type="error" dark>⛔ {submitErr}</Banner>}
          {isHardBlock && (
            <Banner type="error" dark>🚫 Invoice is {late.days} days old — submission blocked. Contact Accounts.</Banner>
          )}

          {/* Submit */}
          <button onClick={handleSubmit} disabled={!submitReady || submitting}
            style={{ background: (!submitReady||submitting) ? '#3A3D35' : MP.green,
              color: (!submitReady||submitting) ? '#5A5D55' : MP.textDark, border:'none',
              borderRadius:16, padding:'18px', fontSize:16, fontWeight:700, fontFamily:MP.font,
              cursor:(!submitReady||submitting)?'not-allowed':'pointer', width:'100%', marginBottom:8 }}>
            {submitting ? '⏳ Saving…' : isHardBlock ? '🚫 Blocked — Invoice too old' : `✅ Submit SAR ${rawAmount.toLocaleString('en-US',{minimumFractionDigits:2})} ${selCat?.icon||''}`}
          </button>
          <button onClick={goBack}
            style={{ background:'transparent', color:MP.textMutedDark, border:`1.5px solid #3A3D35`, borderRadius:16,
              padding:'14px', fontSize:14, fontWeight:600, fontFamily:MP.font, cursor:'pointer', width:'100%', marginBottom:16 }}>
            ← Edit Details
          </button>

        </div>
      </div>
    )
  }

  return null
}
