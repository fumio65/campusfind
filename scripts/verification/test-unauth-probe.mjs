// Regression probe (Strix WEB-01..04 follow-up): every Edge Function except
// the intentionally public ones must refuse a caller with no user session.
// Two attempts per route: (1) apikey only, no Authorization header;
// (2) the public anon key sent as the Bearer token (this passes the
// platform's verify_jwt check, so only the in-code guard can stop it).
// Expected: 401 for every route. Read-only - the guards reject before any
// database write, and dummy IDs are used everywhere.
//
// Run from the repo root: node scripts/verification/test-unauth-probe.mjs

import fs from 'node:fs'

const envText = fs.readFileSync('app/.env.local', 'utf8')
const URL_BASE = envText.match(/VITE_SUPABASE_URL=(.*)/)[1].trim()
const ANON = envText.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()
const FN = `${URL_BASE}/functions/v1`
const Z = '00000000-0000-0000-0000-000000000000'

const routes = [
  ['GET', 'dropoff'], ['POST', 'dropoff', { claimId: Z }],
  ['PATCH', `dropoff/${Z}/receive`, { photoPath: 'x' }], ['PATCH', `dropoff/${Z}/pickup`, {}],
  ['PATCH', `tips/${Z}/credit`, {}], ['POST', 'tips/notify', { tipId: Z }],
  ['GET', 'notifications'], ['POST', 'notifications', {}],
  ['PATCH', 'notifications/read-all', {}], ['PATCH', `notifications/${Z}`, {}],
  ['GET', 'reports'], ['PATCH', `reports/${Z}/resolve`, {}], ['POST', 'reports/walkin', {}],
  ['POST', `reports/${Z}/credit-finder`, {}], ['POST', `reports/${Z}/announce`, {}],
  ['POST', 'reports/admin-notify', {}],
  ['POST', 'claims', { reportId: Z }], ['PATCH', `claims/${Z}`, { action: 'approve' }],
  ['POST', `claims/${Z}/message`, {}], ['POST', `claims/${Z}/dropoff`, {}],
  ['POST', 'proxy', {}], ['GET', `proxy/${Z}`],
  ['POST', 'confirmation', {}], ['GET', `confirmation/${Z}`], ['PATCH', `confirmation/${Z}`, {}],
  ['GET', 'overview'], ['GET', 'analytics'], ['GET', 'accounts'], ['GET', 'bulk-import'],
  ['POST', 'send-push', {}],
]

let fails = 0
for (const [method, path, body] of routes) {
  const results = []
  for (const bearer of [false, true]) {
    const headers = { apikey: ANON, 'Content-Type': 'application/json' }
    if (bearer) headers.Authorization = `Bearer ${ANON}`
    const res = await fetch(`${FN}/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
    results.push(res.status)
  }
  const ok = results.every((s) => s === 401)
  if (!ok) fails++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${method.padEnd(5)} /${path.padEnd(40)} no-auth=${results[0]}  anon-as-bearer=${results[1]}`)
}
console.log(`\n${fails === 0 ? 'ALL PASS' : `${fails} route(s) reachable without a user session`} (${routes.length} routes)`)
process.exit(fails ? 1 : 0)
