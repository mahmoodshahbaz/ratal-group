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
import { COA }            from '../lib/autoPost'

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

// ─── Per-step color themes ─────────────────────────────────────────────────────
const T = {
  scan:     { grad:'linear-gradient(135deg,#0f172a,#1e3a5f)', color:'#0ea5e9', light:'#e0f2fe', dark:'#0c4a6e' },
  invoice:  { grad:'linear-gradient(135deg,#7c2d12,#ea580c)', color:'#f97316', light:'#fff7ed', dark:'#7c2d12' },
  classify: { grad:'linear-gradient(135deg,#312e81,#4f46e5)', color:'#818cf8', light:'#eef2ff', dark:'#312e81' },
  notes:    { grad:'linear-gradient(135deg,#14532d,#15803d)', color:'#22c55e', light:'#f0fdf4', dark:'#14532d' },
  summary:  { grad:'linear-gradient(135deg,#1e3a8a,#2563eb)', color:'#60a5fa', light:'#eff6ff', dark:'#1e3a8a' },
  success:  { grad:'linear-gradient(135deg,#134e4a,#0f766e)', color:'#2dd4bf', light:'#f0fdfa', dark:'#134e4a' },
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
const PAGE = {
  maxWidth:480, margin:'0 auto', padding:'0 0 90px',
  fontFamily:"'SF Pro Display',-apple-system,'Segoe UI',system-ui,sans-serif",
  background:'#f5f6fa', minHeight:'100vh', boxSizing:'border-box',
}

function SCard({ children, style={} }) {
  return (
    <div style={{ background:'#fff', borderRadius:20, border:'1px solid rgba(0,0,0,0.06)',
      marginBottom:12, overflow:'hidden', boxShadow:'0 2px 20px rgba(0,0,0,0.07)', ...style }}>
      {children}
    </div>
  )
}
function SSection({ title, accent, children }) {
  return (
    <div style={{ padding:'16px 18px' }}>
      {title && (
        <div style={{ fontSize:10, fontWeight:700, color:accent||'#64748b', textTransform:'uppercase',
          letterSpacing:1, marginBottom:14, display:'flex', alignItems:'center', gap:6 }}>
          <div style={{ width:22, height:2, background:accent||'#64748b', borderRadius:2 }} />{title}
        </div>
      )}
      {children}
    </div>
  )
}
function FLabel({ children, accent }) {
  return (
    <div style={{ fontSize:10, fontWeight:700, color:accent||'#94a3b8', textTransform:'uppercase',
      letterSpacing:.9, marginBottom:6 }}>
      {children}
    </div>
  )
}
function FInp({ accent, style={}, ...props }) {
  return (
    <input
      style={{ padding:'13px 15px', border:`1.5px solid ${accent?accent+'30':'#e8ecf0'}`,
        borderRadius:13, fontSize:14, outline:'none', width:'100%', boxSizing:'border-box',
        minHeight:48, fontFamily:'inherit', background:'#fafbfc', WebkitAppearance:'none',
        transition:'border-color .15s', ...style }}
      onFocus={e=>{ e.target.style.borderColor=accent||'#94a3b8'; e.target.style.background='#fff' }}
      onBlur={e=>{ e.target.style.borderColor=accent?accent+'30':'#e8ecf0'; e.target.style.background='#fafbfc' }}
      {...props}
    />
  )
}
function FSel({ accent, style={}, children, ...props }) {
  return (
    <select style={{ padding:'13px 15px', border:`1.5px solid ${accent?accent+'30':'#e8ecf0'}`,
      borderRadius:13, fontSize:14, outline:'none', width:'100%', boxSizing:'border-box',
      minHeight:48, fontFamily:'inherit', background:'#fafbfc', WebkitAppearance:'none', ...style }} {...props}>
      {children}
    </select>
  )
}
function FArea({ accent, style={}, ...props }) {
  return (
    <textarea
      style={{ padding:'13px 15px', border:`1.5px solid ${accent?accent+'30':'#e8ecf0'}`,
        borderRadius:13, fontSize:14, outline:'none', width:'100%', boxSizing:'border-box',
        fontFamily:'inherit', background:'#fafbfc', resize:'none',
        transition:'border-color .15s', ...style }}
      onFocus={e=>{ e.target.style.borderColor=accent||'#94a3b8'; e.target.style.background='#fff' }}
      onBlur={e=>{ e.target.style.borderColor=accent?accent+'30':'#e8ecf0'; e.target.style.background='#fafbfc' }}
      {...props}
    />
  )
}

// ─── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ stepId, t }) {
  const active = STEPS.filter(s => s.num !== null)
  const cur = active.findIndex(s => s.id === stepId)
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:0, padding:'14px 20px 0' }}>
      {active.map((s, i) => (
        <div key={s.id} style={{ display:'flex', alignItems:'center', flex: i < active.length-1 ? 1 : 'none' }}>
          {/* Dot */}
          <div style={{
            width: i <= cur ? 30 : 26, height: i <= cur ? 30 : 26,
            borderRadius:'50%', flexShrink:0,
            background: i < cur ? t.color : i === cur ? '#fff' : 'rgba(255,255,255,0.2)',
            border: i === cur ? `2.5px solid ${t.color}` : 'none',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize: i < cur ? 13 : 12,
            color: i < cur ? '#fff' : i === cur ? t.color : 'rgba(255,255,255,0.5)',
            fontWeight:800, transition:'all .2s',
            boxShadow: i === cur ? `0 0 0 4px ${t.color}30` : 'none',
          }}>
            {i < cur ? '✓' : s.num}
          </div>
          {/* Connector */}
          {i < active.length - 1 && (
            <div style={{ flex:1, height:2, margin:'0 4px',
              background: i < cur ? t.color : 'rgba(255,255,255,0.2)', borderRadius:2 }} />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Step header ───────────────────────────────────────────────────────────────
function StepHeader({ stepId, t, emp, devMode, onBack, children }) {
  const s = STEPS.find(x => x.id === stepId) || {}
  return (
    <div style={{ background:t.grad, padding:'20px 22px 26px', borderRadius:'0 0 30px 30px',
      boxShadow:'0 8px 40px rgba(0,0,0,0.35)', marginBottom:20 }}>
      {/* DEV badge + back */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        {onBack
          ? <button onClick={onBack} style={{ background:'rgba(255,255,255,.12)', border:'none',
              color:'rgba(255,255,255,.8)', borderRadius:8, padding:'5px 12px', cursor:'pointer', fontSize:12 }}>
              ← Back
            </button>
          : <div/>}
        {devMode && (
          <div style={{ background:'rgba(255,214,0,.15)', border:'1px solid rgba(255,214,0,.3)',
            borderRadius:8, padding:'3px 10px', fontSize:10, color:'#fde68a', fontWeight:700, letterSpacing:.5 }}>
            🛠 DEV
          </div>
        )}
      </div>
      {/* Progress bar */}
      {s.num && <ProgressBar stepId={stepId} t={t} />}
      {/* Title area */}
      <div style={{ marginTop:14 }}>
        <div style={{ fontSize:22, fontWeight:900, color:'#fff', letterSpacing:-.3 }}>
          {s.icon} {s.label}
        </div>
        <div style={{ fontSize:12, color:'rgba(255,255,255,.55)', marginTop:4 }}>
          {emp?.full_name_en || 'Loading employee…'}
        </div>
        {children && <div style={{ marginTop:10 }}>{children}</div>}
      </div>
    </div>
  )
}

// ─── Info banner ───────────────────────────────────────────────────────────────
function Banner({ type='info', children }) {
  const styles = {
    info:    { bg:'#eff6ff', color:'#1d4ed8', border:'#bfdbfe' },
    success: { bg:'#f0fdf4', color:'#15803d', border:'#bbf7d0' },
    warn:    { bg:'#fffbeb', color:'#92400e', border:'#fde68a' },
    error:   { bg:'#fef2f2', color:'#991b1b', border:'#fecaca' },
  }
  const s = styles[type] || styles.info
  return (
    <div style={{ background:s.bg, border:`1.5px solid ${s.border}`, borderRadius:12,
      padding:'11px 14px', fontSize:13, color:s.color, lineHeight:1.6, marginBottom:12,
      display:'flex', gap:8 }}>
      {children}
    </div>
  )
}

// ─── Category tiles ────────────────────────────────────────────────────────────
const CAT_COLORS = {
  FUEL:'#b45309', ACCOMMODATION:'#0369a1', MEALS:'#15803d', TRANSPORT:'#7c3aed',
  MATERIALS:'#b91c1c', COMMUNICATION:'#0284c7', OFFICE:'#475569', GOVT_FEES:'#065f46',
  PARKING:'#4338ca', MISC:'#374151',
}
function CategoryPicker({ categories, value, onChange, accent }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
      {categories.map(cat => {
        const col = CAT_COLORS[cat.key] || accent
        const sel = value === cat.key
        return (
          <button key={cat.key} type="button" onClick={() => onChange(cat.key)}
            style={{ padding:'14px 8px', borderRadius:16, border:`2px solid ${sel?col:col+'30'}`,
              background: sel ? col : `${col}08`, cursor:'pointer',
              display:'flex', flexDirection:'column', alignItems:'center', gap:6,
              boxShadow: sel ? `0 4px 16px ${col}40` : 'none',
              transition:'all .15s' }}>
            <span style={{ fontSize:24 }}>{cat.icon}</span>
            <span style={{ fontSize:10, fontWeight:700, color: sel?'#fff':col, textAlign:'center', lineHeight:1.3 }}>
              {cat.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Summary row ───────────────────────────────────────────────────────────────
function SRow({ label, value, mono, color }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start',
      padding:'9px 0', borderBottom:'1px solid #f1f5f9' }}>
      <span style={{ fontSize:12, color:'#94a3b8', fontWeight:600, minWidth:110 }}>{label}</span>
      <span style={{ fontSize:13, color:color||'#1e293b', fontWeight:700, textAlign:'right', flex:1,
        fontFamily:mono?'monospace':'inherit' }}>
        {value || <span style={{ color:'#cbd5e1', fontWeight:400 }}>—</span>}
      </span>
    </div>
  )
}

// ─── Nav buttons ───────────────────────────────────────────────────────────────
function NavBar({ onBack, onNext, nextLabel='Next →', nextColor, disabled, loading }) {
  return (
    <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'rgba(245,246,250,0.95)',
      backdropFilter:'blur(10px)', padding:'12px 14px', boxSizing:'border-box',
      borderTop:'1px solid #e2e8f0', display:'flex', gap:10, maxWidth:480, margin:'0 auto',
      zIndex:100 }}>
      {onBack && (
        <button onClick={onBack}
          style={{ padding:'14px 18px', borderRadius:14, border:'1.5px solid #e2e8f0',
            background:'#fff', color:'#64748b', fontSize:14, fontWeight:700, cursor:'pointer', flexShrink:0 }}>
          ←
        </button>
      )}
      <button onClick={onNext} disabled={disabled || loading}
        style={{ flex:1, padding:'15px', borderRadius:14, border:'none',
          background: disabled ? '#e2e8f0' : (nextColor || T.summary.grad),
          color: disabled ? '#94a3b8' : '#fff', fontSize:15, fontWeight:800,
          cursor: disabled ? 'not-allowed' : 'pointer',
          boxShadow: disabled ? 'none' : '0 4px 16px rgba(0,0,0,0.2)' }}>
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
  const [invoiceType,   setInvoiceType]   = useState(null) // null | 'QR' | 'PRINTED' | 'HANDWRITTEN'
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

  const fileRef = useRef()

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

  // ─── PHOTO HANDLER — PDF.js → ZXing → BarcodeDetector → jsQR → OCR ─────────
  async function handlePhotoSelect(file) {
    if (!file) return
    setPhotoFile(file)
    setPhoto(URL.createObjectURL(file))
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
    setStep('scan'); setPhoto(null); setPhotoFile(null)
    setInvoiceType(null); setScanStatus('idle'); setScanData(null); setOcrParsed(null); setOcrProgress(0)
    setVendorName(''); setInvoiceDate(''); setInvoiceNumber('')
    setVatMode('disabled'); setVatNumber(''); setVatPaid(false); setAmount('')
    setCategory(''); setRemarks(''); setLateReason('')
    setDupWarning(null); setVatXCheck(null); setVatPeriod(null)
    setDupAcked(false); setSubmitErr(null); setSuccessData(null)
    window.scrollTo({ top:0, behavior:'smooth' })
  }

  // ─── AUTH GUARD ───────────────────────────────────────────────────────────────
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

  // ─── SUCCESS SCREEN ───────────────────────────────────────────────────────────
  if (step === 'success') {
    const ts = T.success
    return (
      <div style={PAGE}>
        <div style={{ background:ts.grad, padding:'52px 22px 34px', borderRadius:'0 0 30px 30px',
          textAlign:'center', boxShadow:'0 8px 40px rgba(0,0,0,0.3)', marginBottom:20 }}>
          <div style={{ width:80, height:80, background:'rgba(255,255,255,.18)', borderRadius:24,
            display:'flex', alignItems:'center', justifyContent:'center', fontSize:42, margin:'0 auto 16px' }}>✅</div>
          <div style={{ fontSize:24, fontWeight:900, color:'#fff', letterSpacing:-.3 }}>Expense Recorded</div>
          <div style={{ fontSize:28, fontWeight:900, color:'rgba(255,255,255,.9)', marginTop:8 }}>
            SAR {rawAmount.toLocaleString('en-US',{minimumFractionDigits:2})}
          </div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,.6)', marginTop:4 }}>
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
            style={{ background:ts.grad, color:'#fff', border:'none', borderRadius:16,
              padding:'17px', fontSize:15, fontWeight:800, cursor:'pointer', width:'100%',
              boxShadow:`0 4px 16px ${ts.color}40`, marginBottom:10 }}>
            + Add Another Expense
          </button>
          <button onClick={() => window.location.href='/forms'}
            style={{ background:'#fff', color:'#64748b', border:'1.5px solid #e2e8f0', borderRadius:16,
              padding:'14px', fontSize:14, fontWeight:700, cursor:'pointer', width:'100%' }}>
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
      <div style={PAGE}>
        <StepHeader stepId="scan" t={ts} emp={emp} devMode={devMode}
          onBack={null}>
          <div style={{ fontSize:12, color:'rgba(255,255,255,.55)', marginTop:4 }}>
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
                { key:'QR',          icon:'📱', label:'ZATCA QR',   desc:'Saudi tax invoice', color:'#0ea5e9' },
                { key:'PRINTED',     icon:'🖨️', label:'Printed',    desc:'No QR code',        color:'#f97316' },
                { key:'HANDWRITTEN', icon:'✍️', label:'Handwritten', desc:'No VAT',            color:'#a78bfa' },
              ].map(it => {
                const sel = invoiceType === it.key
                return (
                  <button key={it.key} type="button"
                    onClick={() => { setInvoiceType(it.key); if (it.key==='HANDWRITTEN') setHandwritten() }}
                    style={{ padding:'13px 6px', borderRadius:14, border:`2px solid ${sel?it.color:it.color+'30'}`,
                      background: sel?`${it.color}15`:'#fff', cursor:'pointer',
                      display:'flex', flexDirection:'column', alignItems:'center', gap:5, boxSizing:'border-box' }}>
                    <span style={{ fontSize:22 }}>{it.icon}</span>
                    <span style={{ fontSize:10, fontWeight:800, color:sel?it.color:'#475569' }}>{it.label}</span>
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

                  {!photo ? (
                    <button onClick={() => { if (!invoiceType) setInvoiceType('QR'); fileRef.current?.click() }}
                      style={{ width:'100%', padding:'28px 16px', borderRadius:16, border:`2px dashed ${ts.color}50`,
                        background:`${ts.color}06`, color:ts.color, cursor:'pointer', boxSizing:'border-box',
                        display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                      <div style={{ width:56, height:56, borderRadius:16, background:`${ts.color}15`,
                        display:'flex', alignItems:'center', justifyContent:'center', fontSize:28 }}>📷</div>
                      <span style={{ fontSize:14, fontWeight:800 }}>Tap to photograph invoice</span>
                      <span style={{ fontSize:11, opacity:.6 }}>
                        {invoiceType === 'QR'
                          ? 'Point directly at the QR code for best results'
                          : 'Capture the full invoice clearly'}
                      </span>
                    </button>
                  ) : (
                    <div style={{ position:'relative', borderRadius:14, overflow:'hidden',
                      boxShadow:`0 4px 16px ${ts.color}30` }}>
                      <img src={photo} alt="invoice" style={{ width:'100%', maxHeight:220, objectFit:'cover', display:'block' }} />
                      <button onClick={() => { setPhoto(null); setPhotoFile(null); setScanStatus('idle'); setScanData(null); setOcrParsed(null); setInvoiceType(null) }}
                        style={{ position:'absolute', top:10, right:10, background:'rgba(0,0,0,.55)',
                          color:'#fff', border:'none', borderRadius:20, width:30, height:30, cursor:'pointer', fontWeight:800, fontSize:13 }}>✕</button>
                    </div>
                  )}

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
          nextColor={ts.grad}
          disabled={!canProceed('scan') || (devMode && !devEmployee)}
        />
      </div>
    )
  }

  // ── STEP 2: INVOICE DETAILS ───────────────────────────────────────────────────
  if (step === 'invoice') {
    const ts = T.invoice
    return (
      <div style={PAGE}>
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
                style={{ width:'100%', padding:'16px', borderRadius:14,
                  border:`2.5px solid ${rawAmount>0?ts.color+'60':'#e8ecf0'}`,
                  fontSize:32, fontWeight:900, textAlign:'center', color:ts.dark,
                  outline:'none', boxSizing:'border-box', fontFamily:'monospace',
                  background: rawAmount>0 ? `${ts.color}06` : '#fafbfc' }}
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
          nextColor={ts.grad}
          disabled={!canProceed('invoice')}
        />
      </div>
    )
  }

  // ── STEP 3: CATEGORY & SITE ───────────────────────────────────────────────────
  if (step === 'classify') {
    const ts = T.classify
    return (
      <div style={PAGE}>
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
          nextColor={ts.grad}
          disabled={!canProceed('classify')}
        />
      </div>
    )
  }

  // ── STEP 4: NOTES ─────────────────────────────────────────────────────────────
  if (step === 'notes') {
    const ts = T.notes
    return (
      <div style={PAGE}>
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
          nextColor={ts.grad}
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
      <div style={PAGE}>
        <div style={{ background:ts.grad, padding:'50px 22px 28px', borderRadius:'0 0 30px 30px',
          boxShadow:'0 8px 40px rgba(0,0,0,0.3)', marginBottom:20 }}>
          <div style={{ fontSize:11, color:'rgba(255,255,255,.5)', textTransform:'uppercase', letterSpacing:1, marginBottom:8 }}>
            Expense Review
          </div>
          <div style={{ fontSize:26, fontWeight:900, color:'#fff', letterSpacing:-.3 }}>
            {selCat?.icon} SAR {rawAmount.toLocaleString('en-US',{minimumFractionDigits:2})}
          </div>
          <div style={{ fontSize:14, color:'rgba(255,255,255,.65)', marginTop:6 }}>
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
          <SCard>
            <SSection title="Invoice" accent={ts.color}>
              <SRow label="Vendor"         value={vendorName} />
              <SRow label="Invoice Date"   value={invoiceDate} />
              <SRow label="Invoice No."    value={invoiceNumber} mono />
              <SRow label="Invoice Type"   value={invoiceType==='QR'?'📱 ZATCA QR':invoiceType==='PRINTED'?'🖨️ Printed':'✍️ Handwritten'} />
            </SSection>
          </SCard>

          {/* Financial */}
          <SCard>
            <SSection title="Financial" accent={ts.color}>
              <SRow label="Total Amount"  value={`SAR ${rawAmount.toLocaleString('en-US',{minimumFractionDigits:2})}`} color={ts.color} />
              {vatPaid && <>
                <SRow label="Net (ex-VAT)" value={`SAR ${netAmount.toFixed(2)}`} />
                <SRow label="VAT (15%)"    value={`SAR ${vatAmount.toFixed(2)}`} />
              </>}
              <SRow label="VAT Registered" value={vatPaid && vatNumber ? (isValidVATNum(vatNumber) ? `✓ ${vatNumber}` : `⚠️ ${vatNumber}`) : vatPaid ? 'Yes (no VAT#)' : 'No'} mono />
            </SSection>
          </SCard>

          {/* Classification */}
          <SCard>
            <SSection title="Classification" accent={ts.color}>
              <SRow label="Category" value={selCat ? `${selCat.icon} ${selCat.label}` : '—'} />
              <SRow label="Site"     value={selAssign?`${selAssign.site_number}${selAssign.site_name?' — '+selAssign.site_name:''}`:'None / General'} />
              <SRow label="Project"  value={selAssign?.project?.project_name || '—'} />
            </SSection>
          </SCard>

          {/* Late / notes */}
          {(remarks || lateReason || late.level !== 'ok') && (
            <SCard>
              <SSection title="Notes" accent={ts.color}>
                {late.level !== 'ok' && <SRow label="Submission" value={`${late.days} days late`} color={late.level==='warn'?'#f59e0b':'#dc2626'} />}
                {lateReason && <SRow label="Late reason" value={lateReason} />}
                {remarks    && <SRow label="Remarks"     value={remarks} />}
              </SSection>
            </SCard>
          )}

          {/* Photo thumbnail */}
          {photo && (
            <SCard>
              <SSection title="Receipt Photo" accent={ts.color}>
                <div style={{ borderRadius:12, overflow:'hidden' }}>
                  <img src={photo} alt="receipt" style={{ width:'100%', maxHeight:160, objectFit:'cover', display:'block' }} />
                </div>
              </SSection>
            </SCard>
          )}

          {/* Errors */}
          {submitErr && <Banner type="error">⛔ {submitErr}</Banner>}
          {isHardBlock && (
            <Banner type="error">🚫 Invoice is {late.days} days old — submission blocked. Contact Accounts.</Banner>
          )}

          {/* Submit */}
          <button onClick={handleSubmit} disabled={!submitReady || submitting}
            style={{ background: (!submitReady||submitting) ? '#e2e8f0' : ts.grad,
              color: (!submitReady||submitting) ? '#94a3b8' : '#fff', border:'none',
              borderRadius:16, padding:'18px', fontSize:16, fontWeight:900,
              cursor:(!submitReady||submitting)?'not-allowed':'pointer', width:'100%',
              boxShadow:(!submitReady||submitting)?'none':'0 4px 20px rgba(0,0,0,0.25)',
              marginBottom:8 }}>
            {submitting ? '⏳ Saving…' : isHardBlock ? '🚫 Blocked — Invoice too old' : `✅ Submit SAR ${rawAmount.toLocaleString('en-US',{minimumFractionDigits:2})} ${selCat?.icon||''}`}
          </button>
          <button onClick={goBack}
            style={{ background:'#fff', color:'#64748b', border:'1.5px solid #e2e8f0', borderRadius:16,
              padding:'14px', fontSize:14, fontWeight:700, cursor:'pointer', width:'100%', marginBottom:16 }}>
            ← Edit Details
          </button>

        </div>
      </div>
    )
  }

  return null
}
