import fs from 'node:fs'
const envText = fs.readFileSync('app/.env.local', 'utf8')
const URL_BASE = envText.match(/VITE_SUPABASE_URL=(.*)/)[1].trim()
const ANON = envText.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()
const REPORT_ID = '47ce9fef-8590-4ea5-885e-1702ba7f04ee'

const r1 = await fetch(`${URL_BASE}/functions/v1/og-preview/${REPORT_ID}`, { headers: { apikey: ANON } })
console.log('servePreviewData status:', r1.status)
console.log('body:', (await r1.text()).slice(0, 300))

const r2 = await fetch(`${URL_BASE}/functions/v1/og-preview/image/${REPORT_ID}`, { headers: { apikey: ANON } })
console.log('\nserveImage status:', r2.status, '| content-type:', r2.headers.get('content-type'), '| content-length:', r2.headers.get('content-length'))

console.log('\n==================== RESULT ====================')
console.log(r1.status === 200 ? 'PASS: servePreviewData works (corsHeaders param intact)' : `FAIL: ${r1.status}`)
console.log(r2.status === 200 ? 'PASS: serveImage works (corsHeaders param intact)' : `FAIL: ${r2.status}`)
console.log('=================================================')
