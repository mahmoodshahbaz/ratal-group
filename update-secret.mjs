// Update GOOGLE_SERVICE_ACCOUNT_JSON secret in Supabase with local file
// Usage: node update-secret.mjs <supabase_access_token>

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TOKEN = process.argv[2]
if (!TOKEN) { console.error('Usage: node update-secret.mjs <supabase_access_token>'); process.exit(1) }

const PROJECT_REF = 'qjwqoqvbfygmymtiqfnt'
const SA_FILE = join(__dirname, 'ACCSYS-Keys', 'inlaid-agility-485614-t6-1bb0b27d0e73.json')

const sa = JSON.parse(readFileSync(SA_FILE, 'utf8'))
console.log('Updating secret for service account:', sa.client_email)
console.log('Key ID:', sa.private_key_id)

// Supabase Management API: update edge function secrets
const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify([{
    name: 'GOOGLE_SERVICE_ACCOUNT_JSON',
    value: JSON.stringify(sa),
  }])
})

if (res.ok) {
  console.log('✅ Secret updated successfully!')
  console.log('Now run: node test-fn.mjs')
} else {
  const data = await res.text()
  console.error('❌ Failed:', res.status, data)
}
