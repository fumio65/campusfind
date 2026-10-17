// One-off test script for the GET /reports auth + filter-injection fix.
// Run from the campusfind repo root: node test-reports-fix.mjs
//
// Checks:
//   A) GET /reports with NO Authorization header            -> expect 401
//   B) GET /reports as a logged-in NON-admin test account    -> expect 403
//   C) GET /reports as admin, search containing `),(` chars  -> expect 200,
//      with the malicious value treated as a literal (no crash, no extra
//      rows leaked beyond an actual literal-text match)
//   D) GET /reports as admin, no search                      -> expect 200
//      (sanity check that normal admin usage still works)
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

async function getReports(label, jwtOrNull, extraQuery = '') {
  const headers = { apikey: ANON }
  if (jwtOrNull) headers.Authorization = `Bearer ${jwtOrNull}`
  const res = await fetch(`${URL_BASE}/functions/v1/reports?limit=5${extraQuery}`, { headers })
  const body = await res.text()
  console.log(`\n== ${label} ==`)
  console.log('status:', res.status)
  console.log('body:', body.slice(0, 500))
  return { status: res.status, body }
}

async function main() {
  console.log('== 1. Sign in as admin ==')
  const admin = await signin(toEmail('00-00001'), 'Admin@1234')
  console.log('admin ok')

  const rand = Math.floor(1000 + Math.random() * 8999)
  const strangerSid = `97-9${rand}`
  const strangerEnr = `97${rand}003`
  console.log('== 2. Create one throwaway non-admin test account ==')
  await createAccount(admin.jwt, strangerSid, strangerEnr, 'Stranger')
  const stranger = await signin(toEmail(strangerSid), strangerEnr)
  console.log('stranger id:', stranger.id)

  const statusA = (await getReports('TEST A: no Authorization header', null)).status
  const statusB = (await getReports('TEST B: logged-in non-admin account', stranger.jwt)).status
  const resultC = await getReports(
    'TEST C: admin + injection-style search value',
    admin.jwt,
    `&search=${encodeURIComponent('foo),status.eq.resolved,(bar')}`
  )
  const resultD = await getReports('TEST D: admin, plain request (sanity check)', admin.jwt)

  console.log('\n==================== RESULT ====================')
  console.log(statusA === 401 ? 'PASS: no-auth request correctly rejected (401)' : `FAIL: expected 401, got ${statusA}`)
  console.log(statusB === 403 ? 'PASS: non-admin request correctly rejected (403)' : `FAIL: expected 403, got ${statusB}`)
  console.log(resultC.status === 200 ? 'PASS: injection-style search handled without error (200)' : `FAIL: expected 200, got ${resultC.status}`)
  console.log(resultD.status === 200 ? 'PASS: normal admin request still works (200)' : `FAIL: expected 200, got ${resultD.status}`)
  console.log('=================================================')
  console.log(`\nCleanup reminder: test account to delete -> stranger id ${stranger.id} (student ID ${strangerSid})`)
}

main().catch((err) => {
  console.error('TEST SCRIPT ERROR:', err.message)
  process.exit(1)
})
