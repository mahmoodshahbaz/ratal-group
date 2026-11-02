// Test drive-upload edge function
const SUPA_URL = 'https://qjwqoqvbfygmymtiqfnt.supabase.co'
const SUPA_KEY = 'sb_publishable_DQfIGbO-41WIDAqmyUP3OQ_uk6AY8aV'

// Test OPTIONS (CORS preflight)
console.log('Testing CORS preflight (OPTIONS)...')
try {
  const preflight = await fetch(SUPA_URL + '/functions/v1/drive-upload', {
    method: 'OPTIONS',
    headers: {
      'Origin': 'http://localhost:5173',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization,apikey',
    }
  })
  console.log('OPTIONS status:', preflight.status)
  console.log('CORS headers:', {
    'access-control-allow-origin': preflight.headers.get('access-control-allow-origin'),
    'access-control-allow-methods': preflight.headers.get('access-control-allow-methods'),
    'access-control-allow-headers': preflight.headers.get('access-control-allow-headers'),
  })
} catch (e) {
  console.error('OPTIONS failed:', e.message)
}

// ── Debug: inspect service account key ──
console.log('\nTesting DEBUG action...')
try {
  const dr = await fetch(SUPA_URL + '/functions/v1/drive-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + SUPA_KEY, 'apikey': SUPA_KEY },
    body: JSON.stringify({ action: 'debug' })
  })
  const dt = await dr.text()
  console.log('DEBUG response:', dt)
} catch(e) { console.error('DEBUG failed:', e.message) }

// Test POST with minimal payload
console.log('\nTesting POST...')
try {
  const res = await fetch(SUPA_URL + '/functions/v1/drive-upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + SUPA_KEY,
      'apikey': SUPA_KEY,
    },
    body: JSON.stringify({
      file: 'dGVzdA==',
      fileName: 'test.pdf',
      mimeType: 'application/pdf',
      folder: 'vehicle-handovers'
    })
  })
  console.log('POST status:', res.status)
  const text = await res.text()
  // Show full response to see diagnostic errors
  console.log('Response:', text.slice(0, 1000))
} catch (e) {
  console.error('POST failed:', e.message)
}
