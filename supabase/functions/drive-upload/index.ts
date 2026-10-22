// ================================================================
//  drive-upload/index.ts
//  ACCSYS — Google Drive Upload Edge Function
//
//  Supports two modes:
//
//  1. NORMAL UPLOAD (any file type):
//     { file, fileName, mimeType, folder }
//     → uploads file to the chosen subfolder
//     → returns { success, fileId, viewUrl, directUrl }
//
//  2. PDF CONVERSION (invoice printing):
//     { file, fileName, mimeType, folder, convertToPdf: true }
//     → uploads DOCX to Drive as Google Doc (auto-converts)
//     → exports the Google Doc as PDF bytes
//     → uploads the PDF to the invoices subfolder
//     → deletes the temp Google Doc
//     → returns { success, fileId, viewUrl, directUrl, pdfBase64 }
//        pdfBase64 is used by the browser to trigger an automatic
//        PDF download with the correct filename.
//
//  Request fields:
//    file         : string  — base64 encoded file content
//    fileName     : string  — e.g. "SBM-INV-2026-09-0005-RAT-INV-220926.docx"
//    mimeType     : string  — MIME type of the file
//    folder       : string  — "expenses"|"sites"|"fleet"|"vouchers"|"invoices"
//    convertToPdf : boolean — when true, activate PDF conversion mode
// ================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ── Main handler ─────────────────────────────────────────────
serve(async (req) => {

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Parse request
    const body = await req.json()
    const { file, fileName, mimeType, folder, convertToPdf, action, parentFolderId, year, month } = body

    // Load secrets (needed for all actions)
    const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    const rootFolderId       = Deno.env.get('GOOGLE_DRIVE_FOLDER_ID')
    if (!serviceAccountJson || !rootFolderId) {
      return errorResponse('Server configuration error: Drive secrets not set')
    }
    const serviceAccount = JSON.parse(serviceAccountJson)
    const accessToken    = await getAccessToken(serviceAccount)

    // ── OCR MODE — extract text from receipt image ─────────────────
    // Call with: { action: 'ocr', file: base64, mimeType: 'image/jpeg' }
    if (action === 'ocr') {
      const visionToken = await getAccessTokenOcr(serviceAccount)
      const visionRes = await fetch(
        'https://vision.googleapis.com/v1/images:annotate',
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${visionToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              image: { content: file },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }]
            }]
          })
        }
      )
      const visionData = await visionRes.json()
      if (visionData.error) throw new Error(visionData.error.message || 'Vision API error')

      const fullText = visionData.responses?.[0]?.fullTextAnnotation?.text || ''
      const parsed   = parseReceiptText(fullText)
      return new Response(JSON.stringify({ success: true, ...parsed, rawText: fullText }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── CLEANUP MODE — deletes all files to free quota ─────────────
    // Call with: { action: 'cleanup' }
    if (action === 'cleanup') {
      console.log('[drive-upload] Cleanup mode: removing all Drive files to free quota')
      let pageToken = ''
      let deleted   = 0
      let skipped   = 0
      const deletedNames: string[] = []

      do {
        const q   = encodeURIComponent('trashed=false')
        const pt  = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size)&pageSize=100${pt}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        )
        const data = await res.json()
        for (const f of (data.files || [])) {
          if (f.mimeType === 'application/vnd.google-apps.folder') {
            skipped++
            continue
          }
          await deleteFile(accessToken, f.id)
          deleted++
          deletedNames.push(f.name)
        }
        pageToken = data.nextPageToken || ''
      } while (pageToken)

      console.log(`[drive-upload] Cleanup done: deleted ${deleted}, skipped ${skipped} folders`)
      return new Response(
        JSON.stringify({ success: true, deleted, skipped, deletedNames }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Validate normal upload fields ─────────────────────────────
    if (!file || !fileName || !folder) {
      return errorResponse('Missing required fields: file, fileName, folder')
    }
    if (!convertToPdf && !mimeType) {
      return errorResponse('Missing required field: mimeType')
    }
    const allowedFolders = [
      'expenses', 'sites', 'fleet', 'vouchers', 'invoices',
      'money-requests', 'business-events', 'field-ops', 'hr', 'procurement',
      'project-initiations', 'vehicle-handovers', 'payment-notifications',
      'po-sub-contractors', 'po-vendors', 'po-suppliers',
      'po-local-suppliers', 'po-equipment-rentals',
      'payslips',
      'payroll-dept-reports', 'payroll-summary', 'payroll-wps', 'payroll-mudad',
      'expense-claims', 'food-allowance-claims', 'overtime-reports',
    ]
    if (!allowedFolders.includes(folder)) {
      return errorResponse(`Invalid folder. Must be one of: ${allowedFolders.join(', ')}`)
    }

    // Determine target folder
    // parentFolderId = the form's main Drive folder (e.g. Money Request folder, Payroll folder)
    // year           = "2026"  — creates year subfolder automatically
    // month          = "September" — creates month subfolder inside year (payslips only)
    // → payslips:  parentFolderId / 2026 / September
    // → others:    parentFolderId / 2026
    let targetFolder: string
    if (parentFolderId && year && month) {
      // 3-level: root → year → month  (used by payslips)
      const yearFolder  = await getOrCreateFolder(accessToken, parentFolderId, year)
      targetFolder      = await getOrCreateFolder(accessToken, yearFolder, month)
      console.log(`[drive-upload] Target: ${parentFolderId}/${year}/${month} → ${targetFolder}`)
    } else if (parentFolderId && year) {
      // 2-level: root → year  (all other document types)
      targetFolder = await getOrCreateFolder(accessToken, parentFolderId, year)
      console.log(`[drive-upload] Target: ${parentFolderId}/${year} → ${targetFolder}`)
    } else if (parentFolderId) {
      // No year — upload directly to the form folder
      targetFolder = parentFolderId
    } else {
      // Fallback: find by name under root (legacy path)
      const subFolderId = await getFolderIdByName(accessToken, rootFolderId, folder)
      targetFolder = subFolderId ?? rootFolderId
    }

    // ── PDF CONVERSION MODE ───────────────────────────────────────
    // Strategy: upload DOCX as temp Google Doc → export PDF → delete temp doc
    // Net storage used = 0 (we clean up immediately after export)
    // The PDF is returned as base64 for the browser to download locally.
    if (convertToPdf) {
      console.log('[drive-upload] PDF conversion mode:', fileName)

      // Step A: Upload DOCX to root as a Google Doc (auto-converts)
      const tempDocId = await uploadAsGoogleDoc(accessToken, file, fileName, rootFolderId)
      console.log('[drive-upload] Temp Google Doc created:', tempDocId)

      // Step B: Export the Google Doc as PDF bytes
      const pdfBuffer = await exportAsPdf(accessToken, tempDocId)
      const pdfBase64 = bufferToBase64(pdfBuffer)
      console.log('[drive-upload] PDF exported, size:', pdfBuffer.byteLength, 'bytes')

      // Step C: Delete the temp Google Doc IMMEDIATELY (keep quota clean)
      await deleteFile(accessToken, tempDocId)
      console.log('[drive-upload] Temp Google Doc deleted')

      // Step D: Upload the PDF to the invoices subfolder (permanent copy in Drive)
      let pdfFileId: string | null = null
      let viewUrl:   string | null = null
      let directUrl: string | null = null
      try {
        const pdfFileName = fileName.replace(/\.(docx|doc)$/i, '.pdf')
        pdfFileId = await uploadFile(accessToken, pdfBase64, pdfFileName, 'application/pdf', targetFolder)
        await setViewOnlyPermission(accessToken, pdfFileId)
        viewUrl   = `https://drive.google.com/file/d/${pdfFileId}/preview`
        directUrl = `https://lh3.googleusercontent.com/d/${pdfFileId}`
        console.log('[drive-upload] PDF saved to Drive:', pdfFileId)
      } catch (driveErr) {
        // If Drive storage is full, still return pdfBase64 so the local download works
        console.warn('[drive-upload] Could not save PDF to Drive (quota?):', driveErr)
      }

      return new Response(
        JSON.stringify({ success: true, fileId: pdfFileId, viewUrl, directUrl, pdfBase64 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── NORMAL UPLOAD MODE ────────────────────────────────────────
    const fileId = await uploadFile(accessToken, file, fileName, mimeType, targetFolder)
    await setViewOnlyPermission(accessToken, fileId)

    const viewUrl   = `https://drive.google.com/file/d/${fileId}/preview`
    const directUrl = `https://lh3.googleusercontent.com/d/${fileId}`

    return new Response(
      JSON.stringify({ success: true, fileId, viewUrl, directUrl }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('[drive-upload] Error:', err)
    return errorResponse(err instanceof Error ? err.message : 'Unknown error')
  }
})

// ── Google OAuth2 — Service Account JWT ──────────────────────

async function getAccessToken(sa: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  const header  = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss:   sa.client_email,
    sub:   'info@ratal.net',          // impersonate ratal.net user → uploads use 2TB quota
    scope: 'https://www.googleapis.com/auth/drive',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }

  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const sigInput = `${encode(header)}.${encode(payload)}`

  // Import RSA private key
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(sigInput)
  )

  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${sigInput}.${sig}`

  // Exchange JWT for access token
  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  })

  const data = await res.json()
  if (!data.access_token) {
    throw new Error(`OAuth failed: ${JSON.stringify(data)}`)
  }

  return data.access_token
}

// PEM private key → DER ArrayBuffer
function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

// ── OCR: Vision API token (cloud-platform scope, no user impersonation) ──────
async function getAccessTokenOcr(sa: Record<string, string>): Promise<string> {
  const now     = Math.floor(Date.now() / 1000)
  const header  = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  }
  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const sigInput  = `${encode(header)}.${encode(payload)}`
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', pemToDer(sa.private_key),
    { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' }, false, ['sign']
  )
  const sigBytes = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(sigInput))
  const sig = btoa(String.fromCharCode(...new Uint8Array(sigBytes))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
  const jwt = `${sigInput}.${sig}`
  const res  = await fetch('https://oauth2.googleapis.com/token', {
    method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`OCR OAuth failed: ${JSON.stringify(data)}`)
  return data.access_token
}

// ── OCR: Parse receipt text into structured fields ────────────────────────────
function parseReceiptText(text: string): Record<string, string|null> {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  // VAT registration number: 15 digits starting with 3 (ZATCA format)
  const vatMatch = text.match(/\b3\d{14}\b/)

  // Amounts: find lines with currency-like numbers
  // Pattern: optional SAR/ر.س, then digits.digits
  const amountPattern = /(?:SAR|ر\.?س\.?)?\s*(\d[\d,]*\.\d{2})/gi
  const allAmounts: number[] = []
  let m: RegExpExecArray | null
  while ((m = amountPattern.exec(text)) !== null) {
    allAmounts.push(parseFloat(m[1].replace(',','')))
  }
  allAmounts.sort((a,b) => b - a)   // descending — largest is usually total

  // Look for explicit total / VAT labels (Arabic + English)
  const totalMatch = text.match(/(?:total|الإجمالي|إجمالي|المجموع)\D{0,10}(\d[\d,]*\.\d{2})/i)
  const vatAmtMatch = text.match(/(?:vat|ضريبة|tax|ق\.م\.)?(?:\s*amount|المبلغ)?\D{0,10}(\d[\d,]*\.\d{2})/i)

  const totalWithVat = totalMatch ? parseFloat(totalMatch[1].replace(',','')) : (allAmounts[0] || null)
  const vatAmount    = vatAmtMatch && vatAmtMatch[1] !== totalMatch?.[1]
    ? parseFloat(vatAmtMatch[1].replace(',',''))
    : (totalWithVat ? Math.round(totalWithVat / 1.15 * 0.15 * 100) / 100 : null)

  // Date
  const dateMatch = text.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/)

  // Company name: first non-numeric, non-label line that's > 3 chars
  const skipWords = /^(vat|tax|total|date|invoice|receipt|subtotal|amount|ضريبة|الإجمالي|التاريخ|الفاتورة|رقم|no\.|#)/i
  let seller: string | null = null
  for (const line of lines) {
    if (line.length > 3 && !skipWords.test(line) && !/^\d/.test(line)) {
      seller = line; break
    }
  }

  return {
    vatNumber:    vatMatch ? vatMatch[0] : null,
    seller,
    totalWithVat: totalWithVat ? String(totalWithVat) : null,
    vatAmount:    vatAmount    ? String(vatAmount)    : null,
    date:         dateMatch ? dateMatch[0] : null,
  }
}

// ── Drive API helpers ─────────────────────────────────────────

// Find or create a subfolder by name inside a parent folder
async function getOrCreateFolder(
  token: string,
  parentId: string,
  name: string
): Promise<string> {
  const existing = await getFolderIdByName(token, parentId, name)
  if (existing) return existing

  console.log(`[drive-upload] Creating folder "${name}" under ${parentId}`)
  const res = await fetch(
    'https://www.googleapis.com/drive/v3/files?fields=id',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      }),
    }
  )
  const data = await res.json()
  if (!data.id) throw new Error(`Failed to create folder "${name}": ${JSON.stringify(data)}`)
  return data.id
}

// Find a subfolder by name inside a parent folder
async function getFolderIdByName(
  token: string,
  parentId: string,
  name: string
): Promise<string | null> {
  const q = encodeURIComponent(
    `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  )

  const res  = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  const data = await res.json()
  return data.files?.[0]?.id ?? null
}

// Upload file using multipart upload
async function uploadFile(
  token: string,
  base64: string,
  name: string,
  mime: string,
  folderId: string
): Promise<string> {
  const metadata = JSON.stringify({ name, parents: [folderId] })
  const fileBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const boundary  = 'accsys_drive_upload_boundary'

  const enc  = new TextEncoder()
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`
  )
  const tail  = enc.encode(`\r\n--${boundary}--`)
  const body  = new Uint8Array(head.length + fileBytes.length + tail.length)
  body.set(head, 0)
  body.set(fileBytes, head.length)
  body.set(tail, head.length + fileBytes.length)

  const res  = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  )

  const data = await res.json()
  if (!data.id) throw new Error(`Upload failed: ${JSON.stringify(data)}`)
  return data.id
}

// Upload DOCX to Drive and convert to Google Doc format (for PDF export)
async function uploadAsGoogleDoc(
  token: string,
  base64: string,
  name: string,
  folderId: string
): Promise<string> {
  // Google Doc name: remove .docx extension
  const docName  = name.replace(/\.(docx|doc)$/i, '')
  const metadata = JSON.stringify({
    name:     docName,
    parents:  [folderId],
    mimeType: 'application/vnd.google-apps.document', // forces auto-conversion
  })
  const fileBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0))
  const boundary  = 'accsys_convert_bnd'

  const enc  = new TextEncoder()
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`
  )
  const tail  = enc.encode(`\r\n--${boundary}--`)
  const body  = new Uint8Array(head.length + fileBytes.length + tail.length)
  body.set(head, 0)
  body.set(fileBytes, head.length)
  body.set(tail, head.length + fileBytes.length)

  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  )

  const data = await res.json()
  if (!data.id) throw new Error(`Google Doc upload/convert failed: ${JSON.stringify(data)}`)
  return data.id
}

// Export a Google Doc as PDF — returns ArrayBuffer of PDF bytes
async function exportAsPdf(token: string, fileId: string): Promise<ArrayBuffer> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`PDF export failed (${res.status}): ${err.slice(0, 400)}`)
  }
  return await res.arrayBuffer()
}

// Delete a Drive file (used to clean up temp Google Docs)
async function deleteFile(token: string, fileId: string): Promise<void> {
  try {
    await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
    )
  } catch (_) {
    console.warn('[drive-upload] cleanup: failed to delete temp doc', fileId)
  }
}

// Set file to "anyone with the link can view" — no download button
async function setViewOnlyPermission(token: string, fileId: string): Promise<void> {
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    }
  )

  // Also disable download/print/copy for viewers
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        copyRequiresWriterPermission: true,
        writersCanShare: false,
      }),
    }
  )
}

// Convert ArrayBuffer → base64 string (safe for large buffers)
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary  = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// ── Error helper ─────────────────────────────────────────────
// Returns 200 so the Supabase JS client always parses the body;
// the caller checks data.success to detect failures.
function errorResponse(message: string): Response {
  return new Response(
    JSON.stringify({ success: false, error: message }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
