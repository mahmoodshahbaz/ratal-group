/**
 * cleanup_drive_quota.js
 * Lists and deletes ALL files owned by the ACCSYS service account in Google Drive.
 * Run this to free up the service account's 15GB storage quota.
 *
 * Usage:
 *   node cleanup_drive_quota.js              (dry run — shows what would be deleted)
 *   node cleanup_drive_quota.js --delete     (actually deletes everything)
 *   node cleanup_drive_quota.js --delete --keep-invoices  (keep files in invoices folder)
 */

const fs   = require('fs')
const path = require('path')
const https = require('https')
const crypto = require('crypto')

const SA_PATH  = path.join(__dirname, 'ACCSYS-Keys', 'inlaid-agility-485614-t6-d72724dbcfc8.json')
const DRY_RUN  = !process.argv.includes('--delete')
const KEEP_INV = process.argv.includes('--keep-invoices')

if (DRY_RUN) {
  console.log('🔍 DRY RUN — pass --delete to actually delete files\n')
}

// ── JWT / OAuth ───────────────────────────────────────────────────────────────
async function getAccessToken() {
  const sa  = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'))
  const now = Math.floor(Date.now() / 1000)

  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600,
  })).toString('base64url')

  const sigInput = `${header}.${payload}`
  const sign     = crypto.createSign('RSA-SHA256')
  sign.update(sigInput)
  const sig = sign.sign(sa.private_key).toString('base64url')
  const jwt = `${sigInput}.${sig}`

  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  const res  = await httpPost('oauth2.googleapis.com', '/token', 'application/x-www-form-urlencoded', body)
  if (!res.access_token) throw new Error(`OAuth failed: ${JSON.stringify(res)}`)
  return res.access_token
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function httpGet(host, path, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host, path, method: 'GET',
      headers: { Authorization: `Bearer ${token}` } }, res => {
      let body = ''
      res.on('data', d => body += d)
      res.on('end', () => resolve(JSON.parse(body)))
    })
    req.on('error', reject)
    req.end()
  })
}

function httpDelete(host, path, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({ host, path, method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` } }, res => {
      res.resume()
      res.on('end', () => resolve(res.statusCode))
    })
    req.on('error', reject)
    req.end()
  })
}

function httpPost(host, path, contentType, body) {
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body)
    const req = https.request({ host, path, method: 'POST',
      headers: { 'Content-Type': contentType, 'Content-Length': buf.length } }, res => {
      let data = ''
      res.on('data', d => data += d)
      res.on('end', () => resolve(JSON.parse(data)))
    })
    req.on('error', reject)
    req.write(buf)
    req.end()
  })
}

// ── Drive: list all files ─────────────────────────────────────────────────────
async function listAllFiles(token) {
  let files = []
  let pageToken = ''
  do {
    const q     = encodeURIComponent(`trashed=false`)
    const pt    = pageToken ? `&pageToken=${pageToken}` : ''
    const res   = await httpGet(
      'www.googleapis.com',
      `/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size,createdTime,parents)&pageSize=1000${pt}`,
      token
    )
    if (res.files) files = files.concat(res.files)
    pageToken = res.nextPageToken || ''
  } while (pageToken)
  return files
}

// ── Drive: get about (quota) ──────────────────────────────────────────────────
async function getQuota(token) {
  const res = await httpGet(
    'www.googleapis.com',
    '/drive/v3/about?fields=storageQuota',
    token
  )
  return res.storageQuota
}

// ── Drive: delete file ────────────────────────────────────────────────────────
async function deleteFile(token, fileId, fileName) {
  const status = await httpDelete('www.googleapis.com', `/drive/v3/files/${fileId}`, token)
  if (status === 204 || status === 200) {
    console.log(`  ✅ Deleted: ${fileName}`)
    return true
  } else {
    console.log(`  ❌ Failed to delete (${status}): ${fileName}`)
    return false
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Authenticating with service account...')
  const token = await getAccessToken()
  console.log('✅ Authenticated\n')

  // Show quota
  try {
    const quota = await getQuota(token)
    const used  = parseInt(quota.usage     || 0)
    const limit = parseInt(quota.limit     || 0)
    const drive = parseInt(quota.usageInDrive || 0)
    const mb = n => (n / 1024 / 1024).toFixed(1) + ' MB'
    const gb = n => (n / 1024 / 1024 / 1024).toFixed(2) + ' GB'
    console.log(`📊 Storage Quota:`)
    console.log(`   Total limit: ${gb(limit)}`)
    console.log(`   Used:        ${gb(used)} (${mb(used)})`)
    console.log(`   In Drive:    ${gb(drive)} (${mb(drive)})`)
    console.log(`   Free:        ${gb(limit - used)}\n`)
  } catch(e) {
    console.log('Could not read quota:', e.message, '\n')
  }

  // List all files
  console.log('Listing all files in service account Drive...')
  const files = await listAllFiles(token)
  console.log(`Found ${files.length} files\n`)

  if (files.length === 0) {
    console.log('✅ Drive is empty — nothing to delete')
    return
  }

  // Group by type
  const googleDocs  = files.filter(f => f.mimeType === 'application/vnd.google-apps.document')
  const pdfs        = files.filter(f => f.mimeType === 'application/pdf')
  const images      = files.filter(f => f.mimeType?.startsWith('image/'))
  const others      = files.filter(f =>
    f.mimeType !== 'application/vnd.google-apps.document' &&
    f.mimeType !== 'application/pdf' &&
    !f.mimeType?.startsWith('image/') &&
    f.mimeType !== 'application/vnd.google-apps.folder'
  )

  let totalSize = files.reduce((sum, f) => sum + parseInt(f.size || 0), 0)

  console.log(`📁 File breakdown:`)
  console.log(`   Google Docs (temp conversion): ${googleDocs.length}`)
  console.log(`   PDFs:                          ${pdfs.length}`)
  console.log(`   Images (expense/site/fleet):   ${images.length}`)
  console.log(`   Other:                         ${others.length}`)
  console.log(`   Total size (approx):           ${(totalSize/1024/1024).toFixed(1)} MB\n`)

  console.log('Files that will be deleted:')
  for (const f of files) {
    const size = f.size ? `(${(parseInt(f.size)/1024).toFixed(0)} KB)` : ''
    console.log(`  • [${f.mimeType?.split('/').pop()?.slice(0,20)}] ${f.name} ${size}`)
  }

  if (DRY_RUN) {
    console.log(`\n⚠️  DRY RUN — run with --delete to delete all ${files.length} files and free the quota`)
    return
  }

  // Delete all files
  console.log(`\n🗑️  Deleting ${files.length} files...`)
  let deleted = 0, failed = 0
  for (const f of files) {
    const ok = await deleteFile(token, f.id, f.name)
    if (ok) deleted++; else failed++
  }

  console.log(`\n✅ Done! Deleted ${deleted} files, failed ${failed}`)
  console.log('Your Drive quota should now be free. Try generating a PDF invoice again.')
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
