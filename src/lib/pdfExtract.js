/**
 * pdfExtract.js
 * ─────────────────────────────────────────────────────────────────
 * Extracts all text from a PDF File object using PDF.js (CDN).
 *
 * HOW IT WORKS:
 *  1. Loads the PDF.js library from Cloudflare CDN the first time
 *     it is called (cached in window.pdfjsLib after that).
 *  2. Reads the File into an ArrayBuffer.
 *  3. Opens every page and pulls out the text content.
 *  4. Returns { pages, fullText } so the caller can work with
 *     either individual pages or the whole document at once.
 *
 * USAGE:
 *  import { extractPdfText } from '../lib/pdfExtract'
 *
 *  const { fullText, pages } = await extractPdfText(fileObject)
 *  // fullText → single string, all pages joined with \n\n
 *  // pages    → array of strings, one per page
 */

const PDFJS_URL    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'

// ── Load PDF.js from CDN once, cache it on window ────────────────
function loadPdfJs() {
  // Already loaded
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib)

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = PDFJS_URL
    script.onload = () => {
      // Tell PDF.js where its web worker lives
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
      resolve(window.pdfjsLib)
    }
    script.onerror = () => reject(new Error('Failed to load PDF.js from CDN'))
    document.head.appendChild(script)
  })
}

// ── Read a File into an ArrayBuffer ──────────────────────────────
function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = e => resolve(e.target.result)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

// ── Main export ───────────────────────────────────────────────────
/**
 * @param {File} file  A PDF File object from an <input type="file">
 * @returns {Promise<{ pages: string[], fullText: string, pageCount: number }>}
 */
export async function extractPdfText(file) {
  if (!file || file.type !== 'application/pdf') {
    throw new Error('Please select a valid PDF file.')
  }

  // 1. Ensure PDF.js is loaded
  const pdfjs = await loadPdfJs()

  // 2. Read the file bytes
  const buffer = await readFileAsArrayBuffer(file)

  // 3. Open the PDF document
  const pdf = await pdfjs.getDocument({ data: buffer }).promise

  // 4. Extract text from every page
  const pages = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i)
    const content = await page.getTextContent()

    // Each item has a `str` string and a `transform` array (position).
    // We join items on the same Y-position with a space,
    // and separate rows with a newline — this preserves table structure.
    let lastY   = null
    let pageText = ''
    for (const item of content.items) {
      // item.transform[5] is the Y coordinate on the page
      const y = item.transform[5]
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        pageText += '\n'   // new line when Y position changes
      } else if (pageText && !pageText.endsWith('\n')) {
        pageText += ' '    // same line — add space between words
      }
      pageText += item.str
      lastY = y
    }
    pages.push(pageText.trim())
  }

  return {
    pageCount: pdf.numPages,
    pages,
    fullText: pages.join('\n\n--- PAGE BREAK ---\n\n'),
  }
}
