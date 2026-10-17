// One-off test script for the proxy/confirmation IDOR fix.
// Run from the campusfind repo root: node test-idor-fix.mjs
//
// Creates two throwaway accounts (owner + stranger), has the owner file a
// test report, then checks:
//
//   PROXY
//   A) stranger GET  /proxy/:reportId              -> expect null body (no leak)
//   B) stranger POST /proxy  (as if they were owner) -> expect 403
//   C) owner    POST /proxy  (register for own report) -> expect 201
//   D) stranger GET  /proxy/:reportId  (after C)    -> still null (no leak)
//   E) owner    GET  /proxy/:reportId  (after C)    -> expect 200 with data
//
//   CONFIRMATION
//   F) stranger POST /confirmation (as if they were owner) -> expect 403
//   G) owner    POST /confirmation (create for own report)  -> expect 201
//   H) stranger GET  /confirmation/:reportId (after G)       -> null (no leak)
//   I) owner    GET  /confirmation/:reportId (after G)       -> 200 with data
//
// Reads the Supabase URL/anon key straight out of app/.env.local.

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
  if (!json.access_token) throw new Error(`Sign-in failed for ${email}: ${JSON.stringify(json)}`)
  return { jwt: json.access_token, id: json.user.id }
}

async function createAccount(adminJwt, studentId, enrollmentNumber, firstName) {
  const res = await fetch(`${URL_BASE}/functions/v1/accounts/single`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${adminJwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId, enrollmentNumber, lastName: 'SecTest', firstName }),
  })
  const json = await res.json()
  if (res.status >= 400) throw new Error(`Account create failed for ${studentId}: ${JSON.stringify(json)}`)
  return json
}

function toEmail(studentId) {
  return `${studentId.toLowerCase().replace('-', '')}@nwssu.local`
}

async function call(label, method, path, jwt, body) {
  const headers = { apikey: ANON, 'Content-Type': 'application/json' }
  if (jwt) headers.Authorization = `Bearer ${jwt}`
  const res = await fetch(`${URL_BASE}/functions/v1${path}`, {
    method, headers, ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  console.log(`\n== ${label} ==`)
  console.log('status:', res.status)
  console.log('body:', text.slice(0, 300))
  return { status: res.status, text }
}

async function main() {
  console.log('== 1. Sign in as admin, create owner + stranger ==')
  const admin = await signin(toEmail('00-00001'), 'Admin@1234')
  const rand = Math.floor(1000 + Math.random() * 8999)
  const ownerSid = `96-9${rand}`
  const strangerSid = `95-9${rand}`
  const ownerEnr = `96${rand}004`
  const strangerEnr = `95${rand}005`
  await createAccount(admin.jwt, ownerSid, ownerEnr, 'Owner')
  await createAccount(admin.jwt, strangerSid, strangerEnr, 'Stranger')
  const owner = await signin(toEmail(ownerSid), ownerEnr)
  const stranger = await signin(toEmail(strangerSid), strangerEnr)
  console.log('owner id:', owner.id, '| stranger id:', stranger.id)

  console.log('== 2. Owner files a test report ==')
  const reportRes = await fetch(`${URL_BASE}/rest/v1/reports`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${owner.jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ type: 'lost', title: 'IDORTEST item', description: 'idortest', location: 'idortest', reporter_id: owner.id }),
  })
  const report = (await reportRes.json())[0]
  if (!report?.id) throw new Error('Report create failed')
  const reportId = report.id
  console.log('report id:', reportId)

  const results = {}

  const a = await call('A: stranger GET /proxy/:reportId (before any proxy registered)', 'GET', `/proxy/${reportId}`, stranger.jwt)
  results.A = a.text.trim() === 'null'

  const b = await call('B: stranger POST /proxy for owner\'s report', 'POST', '/proxy', stranger.jwt, {
    reportId, proxyName: 'Evil Proxy', proxyStudentId: strangerSid,
  })
  results.B = b.status === 403

  const c = await call('C: owner POST /proxy for own report', 'POST', '/proxy', owner.jwt, {
    reportId, proxyName: 'Legit Proxy', proxyStudentId: '00-00001',
  })
  results.C = c.status === 201

  const d = await call('D: stranger GET /proxy/:reportId (after C - should still be hidden)', 'GET', `/proxy/${reportId}`, stranger.jwt)
  results.D = d.text.trim() === 'null'

  const e = await call('E: owner GET /proxy/:reportId (after C - should see it)', 'GET', `/proxy/${reportId}`, owner.jwt)
  results.E = e.status === 200 && e.text.includes('Legit Proxy')

  const f = await call('F: stranger POST /confirmation for owner\'s report', 'POST', '/confirmation', stranger.jwt, {
    reportId, proxyName: 'Evil Proxy', proxyStudentId: strangerSid,
  })
  results.F = f.status === 403

  const g = await call('G: owner POST /confirmation for own report', 'POST', '/confirmation', owner.jwt, {
    reportId, proxyName: 'Legit Proxy 2', proxyStudentId: '00-00001',
  })
  results.G = g.status === 201

  const h = await call('H: stranger GET /confirmation/:reportId (after G - should be hidden)', 'GET', `/confirmation/${reportId}`, stranger.jwt)
  results.H = h.text.trim() === 'null'

  const i = await call('I: owner GET /confirmation/:reportId (after G - should see it)', 'GET', `/confirmation/${reportId}`, owner.jwt)
  results.I = i.status === 200 && i.text.includes('Legit Proxy 2')

  console.log('\n==================== RESULT ====================')
  for (const [k, v] of Object.entries(results)) {
    console.log(`${v ? 'PASS' : 'FAIL'}: test ${k}`)
  }
  console.log('=================================================')
  console.log(`\nCleanup reminder -> owner id ${owner.id} (${ownerSid}), stranger id ${stranger.id} (${strangerSid}), report id ${reportId}`)
}

main().catch((err) => {
  console.error('TEST SCRIPT ERROR:', err.message)
  process.exit(1)
})
