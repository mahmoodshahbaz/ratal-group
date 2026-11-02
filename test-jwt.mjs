// Test JWT signing locally — diagnose key validity
// Usage: node test-jwt.mjs path\to\service-account.json
//
// Download the JSON from: Google Cloud Console → IAM & Admin → Service Accounts
//   → find accsys@inlaid-agility-485614-t6.iam.gserviceaccount.com → Keys → Add Key

import { readFileSync } from 'fs'
import { createSign } from 'crypto'

const saPath = process.argv[2]
if (!saPath) {
  console.error('Usage: node test-jwt.mjs <path-to-service-account.json>')
  process.exit(1)
}

const sa = JSON.parse(readFileSync(saPath, 'utf8'))
console.log('Service account email:', sa.client_email)
console.log('Key ID (private_key_id):', sa.private_key_id)

// Build JWT manually using Node's built-in crypto (no npm needed)
const now = Math.floor(Date.now() / 1000)

function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
const payload = base64url(JSON.stringify({
  iss:   sa.client_email,
  scope: 'https://www.googleapis.com/auth/drive',
  aud:   'https://oauth2.googleapis.com/token',
  iat:   now,
  exp:   now + 3600,
}))

const sigInput = `${header}.${payload}`

const sign = createSign('RSA-SHA256')
sign.update(sigInput)
const sigBuf = sign.sign(sa.private_key)
const sig = sigBuf.toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')
const jwt = `${sigInput}.${sig}`

console.log('JWT created, exchanging for access token...')

const res = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
})
const data = await res.json()

if (data.access_token) {
  console.log('✅ Key is VALID — got access token.')
  console.log('→ The issue is in the Supabase/Deno runtime crypto, not the key itself.')
  console.log('→ We need a workaround for the Deno crypto bug.')
} else {
  console.error('❌ Key FAILED:', JSON.stringify(data))
  if (data.error === 'invalid_grant') {
    console.log('\n→ The key stored in Supabase is stale/revoked.')
    console.log('→ Go to Google Cloud Console → IAM & Admin → Service Accounts')
    console.log('→ Find:', sa.client_email)
    console.log('→ Keys tab → Add Key → Create new key → JSON')
    console.log('→ Update GOOGLE_SERVICE_ACCOUNT_JSON in Supabase:')
    console.log('   Supabase Dashboard → Edge Functions → drive-upload → Settings → Secrets')
  }
}
