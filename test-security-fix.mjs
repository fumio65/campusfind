// One-off test script for the claims-approval auth fix.
// Run from the campusfind repo root: node test-security-fix.mjs
//
// Creates two throwaway test student accounts, has one file a test report
// and the other submit a claim on it, then checks:
//   A) PATCH /claims/:id with NO Authorization header         -> expect 401
//   B) same call with the CLAIMANT's own valid JWT (wrong user) -> expect 403
//   C) same call with the REPORTER's JWT (the real owner)       -> expect 200
//
// Reads the Supabase URL/anon key straight out of app/.env.local so it
// always matches whatever project you're actually pointed at.

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
  const ownerSid = `99-9${rand}`
  const attackerSid = `98-9${rand}`
  const ownerEnr = `99${rand}001`
  const attackerEnr = `99${rand}002`

  console.log('== 2. Create two throwaway test accounts ==')
  await createAccount(admin.jwt, ownerSid, ownerEnr, 'Owner')
  await createAccount(admin.jwt, attackerSid, attackerEnr, 'Attacker')
  console.log(`created ${ownerSid} (reporter) and ${attackerSid} (attacker/claimant)`)

  console.log('== 3. Sign in as both test accounts (password = enrollment number) ==')
  const owner = await signin(toEmail(ownerSid), ownerEnr)
  const attacker = await signin(toEmail(attackerSid), attackerEnr)
  console.log('owner id:', owner.id)
  console.log('attacker id:', attacker.id)

  console.log('== 4. Owner files a test report ==')
  const reportRes = await fetch(`${URL_BASE}/rest/v1/reports`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${owner.jwt}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      type: 'lost', title: 'SECTEST item', description: 'sectest', location: 'sectest',
      reporter_id: owner.id,
    }),
  })
  const report = (await reportRes.json())[0]
  if (!report?.id) throw new Error('Report create failed')
  console.log('report id:', report.id)

  console.log('== 5. Attacker submits a claim on it ==')
  const claimRes = await fetch(`${URL_BASE}/rest/v1/claims`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${attacker.jwt}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ report_id: report.id, claimant_id: attacker.id }),
  })
  const claim = (await claimRes.json())[0]
  if (!claim?.id) throw new Error('Claim create failed')
  console.log('claim id:', claim.id)

  async function tryApprove(label, jwtOrNull) {
    const headers = { apikey: ANON, 'Content-Type': 'application/json' }
    if (jwtOrNull) headers.Authorization = `Bearer ${jwtOrNull}`
    const res = await fetch(`${URL_BASE}/functions/v1/claims/${claim.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ action: 'approve' }),
    })
    const body = await res.text()
    console.log(`\n== ${label} ==`)
    console.log('status:', res.status)
    console.log('body:', body)
    return res.status
  }

  const statusA = await tryApprove('TEST A: no Authorization header (the old open bug)', null)
  const statusB = await tryApprove('TEST B: attacker\'s own valid JWT, but not the reporter', attacker.jwt)
  const statusC = await tryApprove('TEST C: real reporter approves their own claim', owner.jwt)

  console.log('\n==================== RESULT ====================')
  console.log(statusA === 401 ? 'PASS: no-auth request correctly rejected (401)' : `FAIL: expected 401, got ${statusA}`)
  console.log(statusB === 403 ? 'PASS: wrong-user request correctly rejected (403)' : `FAIL: expected 403, got ${statusB}`)
  console.log(statusC === 200 ? 'PASS: real reporter was able to approve (200)' : `FAIL: expected 200, got ${statusC}`)
  console.log('=================================================')
}

main().catch((err) => {
  console.error('TEST SCRIPT ERROR:', err.message)
  process.exit(1)
})
