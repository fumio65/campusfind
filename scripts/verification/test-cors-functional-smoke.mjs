// Smoke test: confirm the two functions with restructured corsHeaders
// closures (bulk-import, og-preview) still actually work post-redeploy,
// not just that CORS preflight looks right. Also re-checks reports (the
// plain case) with a real authenticated GET to catch any regression there.
//
// Run from the repo root: node test-cors-functional-smoke.mjs

import fs from 'node:fs'

const envText = fs.readFileSync('app/.env.local', 'utf8')
const URL_BASE = envText.match(/VITE_SUPABASE_URL=(.*)/)[1].trim()
const ANON = envText.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()

async function signin(email, password) {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const json = await res.json()
  if (!json.access_token) throw new Error(`Sign-in failed: ${JSON.stringify(json)}`)
  return { jwt: json.access_token, id: json.user.id }
}

async function main() {
  const admin = await signin('0000001@nwssu.local', 'Admin@1234')

  console.log('== TEST 1: bulk-import GET /bulk-import (list batches, admin-only) ==')
  const r1 = await fetch(`${URL_BASE}/functions/v1/bulk-import`, {
    headers: { apikey: ANON, Authorization: `Bearer ${admin.jwt}` },
  })
  const b1 = await r1.text()
  console.log('status:', r1.status)
  console.log('body (first 200 chars):', b1.slice(0, 200))

  console.log('\n== TEST 2: reports GET /reports (plain case, admin) ==')
  const r2 = await fetch(`${URL_BASE}/functions/v1/reports`, {
    headers: { apikey: ANON, Authorization: `Bearer ${admin.jwt}` },
  })
  const b2 = await r2.text()
  console.log('status:', r2.status)
  console.log('body (first 150 chars):', b2.slice(0, 150))

  console.log('\n==================== RESULT ====================')
  console.log(r1.status === 200 ? 'PASS: bulk-import still responds 200 (json() helper intact after refactor)' : `FAIL: bulk-import status ${r1.status}: ${b1.slice(0,300)}`)
  console.log(r2.status === 200 ? 'PASS: reports still responds 200' : `FAIL: reports status ${r2.status}: ${b2.slice(0,300)}`)
  console.log('=================================================')
  console.log('\n(og-preview needs a real report id with a photo to test serveImage - skipping unless you want a specific id checked)')
}

main().catch((err) => {
  console.error('TEST SCRIPT ERROR:', err.message)
  process.exit(1)
})
