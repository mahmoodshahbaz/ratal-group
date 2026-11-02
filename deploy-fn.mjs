import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(__dirname, 'supabase/functions/drive-upload/index.ts'), 'utf8')

const TOKEN = process.argv[2]
if (!TOKEN) { console.error('Usage: node deploy-fn.mjs <supabase_access_token>'); process.exit(1) }

const res = await fetch('https://api.supabase.com/v1/projects/qjwqoqvbfygmymtiqfnt/functions/drive-upload', {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ body: source, verify_jwt: false }),
})

const data = await res.json()
if (res.ok) {
  console.log('✅ Deployed successfully:', data.name || JSON.stringify(data))
} else {
  console.error('❌ Failed:', res.status, JSON.stringify(data))
}
