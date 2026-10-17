// One-off test script for the proxy-pickup confirmation auth fix.
// Run from the campusfind repo root: node test-confirmation-fix.mjs
//
// Creates two throwaway test student accounts, has one file a test report,
// creates a confirmation_request against it, then checks:
//   A) PATCH /confirmation/:id with NO Authorization header -> expect 401
//   B) same call with a logged-in user who is NOT the reporter -> expect 403
//   C) same call with the REPORTER's JWT (the real owner)    -> expect 200
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

async function main() {
  console.log('== 1. Sign in as admin ==')
  const admin = await signin(toEmail('00-00001'), 'Admin@1234')
  console.log('admin ok')

  const rand = Math.floor(1000 + Math.random() * 8999)
  const ownerSid = `97-9${rand}`
  const strangerSid = `96-9${rand}`
  const ownerEnr = `97${rand}001`
  const strangerEnr = `97${rand}002`

  console.log('== 2. Create two throwaway test accounts ==')
  await createAccount(admin.jwt, ownerSid, ownerEnr, 'Owner')
  await createAccount(admin.jwt, strangerSid, strangerEnr, 'Stranger')
  console.log(`created ${ownerSid} (real reporter) and ${strangerSid} (unrelated user)`)

  console.log('== 3. Sign in as both test accounts (password = enrollment number) ==')
  const owner = await signin(toEmail(ownerSid), ownerEnr)
  const stranger = await signin(toEmail(strangerSid), strangerEnr)
  console.log('owner id:', owner.id)
  console.log('stranger id:', stranger.id)

  console.log('== 4. Owner files a test report ==')
  const reportRes = await fetch(`${URL_BASE}/rest/v1/reports`, {
    method: 'POST',
    headers: {
      apikey: ANON, Authorization: `Bearer ${owner.jwt}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify({
      type: 'lost', title: 'SECTEST confirmation item', description: 'sectest', location: 'sectest',
      reporter_id: owner.id,
    }),
  })
  const report = (await reportRes.json())[0]
  if (!report?.id) throw new Error('Report create failed: ' + JSON.stringify(report))
  console.log('report id:', report.id)

  console.log('== 5. Create a confirmation_request for a proxy pickup on it ==')
  const confirmRes = await fetch(`${URL_BASE}/functions/v1/confirmation`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${owner.jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reportId: report.id, reporterId: owner.id,
      proxyName: 'Test Proxy', proxyStudentId: '00-00099',
    }),
  })
  const confirmation = await confirmRes.json()
  if (!confirmation?.id) throw new Error('Confirmation request create failed: ' + JSON.stringify(confirmation))
  console.log('confirmation request id:', confirmation.id)

  async function tryRespond(label, jwtOrNull) {
    const headers = { apikey: ANON, 'Content-Type': 'application/json' }
    if (jwtOrNull) headers.Authorization = `Bearer ${jwtOrNull}`
    const res = await fetch(`${URL_BASE}/functions/v1/confirmation/${confirmation.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ status: 'approved' }),
    })
    const body = await res.text()
    console.log(`\n== ${label} ==`)
    console.log('status:', res.status)
    console.log('body:', body)
    return res.status
  }

  const statusA = await tryRespond('TEST A: no Authorization header (the old open bug)', null)
  const statusB = await tryRespond('TEST B: a logged-in user who is NOT the reporter', stranger.jwt)
  const statusC = await tryRespond('TEST C: real reporter confirms the proxy pickup', owner.jwt)

  console.log('\n==================== RESULT ====================')
  console.log(statusA === 401 ? 'PASS: no-auth request correctly rejected (401)' : `FAIL: expected 401, got ${statusA}`)
  console.log(statusB === 403 ? 'PASS: wrong-user request correctly rejected (403)' : `FAIL: expected 403, got ${statusB}`)
  console.log(statusC === 200 ? 'PASS: real reporter was able to confirm (200)' : `FAIL: expected 200, got ${statusC}`)
  console.log('=================================================')

  console.log(`\nCleanup ids - report=${report.id} owner=${owner.id} stranger=${stranger.id} confirmation=${confirmation.id}`)
}

main().catch((err) => {
  console.error('TEST SCRIPT ERROR:', err.message)
  process.exit(1)
})
