// One-off test script for the notifications-table proxy_request spoofing fix.
// Run from the campusfind repo root: node test-notification-spoof-fix.mjs
//
// Checks:
//   A) owner inserts a proxy_request notification for their OWN report -> succeeds
//   B) stranger inserts a proxy_request notification naming the OWNER'S
//      report_id (impersonating them) -> rejected
//   C) stranger inserts one for their own (nonexistent) random report_id -> rejected
//      (report_id doesn't resolve to any report they own either)
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

async function insertNotif(label, jwt, reportId, body) {
  // Prefer: return=minimal matches the real app code (ProxyRequestForm.jsx),
  // which calls .insert({...}) with no .select() chained - supabase-js sends
  // return=minimal by default in that case. Asking for return=representation
  // instead would additionally require a SELECT policy to hand the inserted
  // row back in the response, which this table doesn't grant to normal users
  // (notifications is admin-read-only) - that's a separate, pre-existing
  // characteristic of the table, not something this policy fix changes, so
  // mirroring the app's real request shape is the fair test.
  const res = await fetch(`${URL_BASE}/rest/v1/notifications`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ type: 'proxy_request', title: 'Proxy Pickup Registered', body, report_id: reportId, read: false }),
  })
  const text = await res.text()
  console.log(`\n== ${label} ==`)
  console.log('status:', res.status)
  console.log('body:', text.slice(0, 300))
  return res.status
}

async function main() {
  console.log('== 1. Sign in as admin, create owner + stranger ==')
  const admin = await signin(toEmail('00-00001'), 'Admin@1234')
  const rand = Math.floor(1000 + Math.random() * 8999)
  const ownerSid = `89-9${rand}`, strangerSid = `88-9${rand}`
  const ownerEnr = `89${rand}011`, strangerEnr = `88${rand}012`
  await createAccount(admin.jwt, ownerSid, ownerEnr, 'Owner')
  await createAccount(admin.jwt, strangerSid, strangerEnr, 'Stranger')
  const owner = await signin(toEmail(ownerSid), ownerEnr)
  const stranger = await signin(toEmail(strangerSid), strangerEnr)
  console.log('owner:', owner.id, '| stranger:', stranger.id)

function decodeJwt(jwt) {
  const payload = jwt.split('.')[1]
  const padded = payload.replace(/-/g, '+').replace(/_/g, '/')
  const json = Buffer.from(padded, 'base64').toString('utf8')
  return JSON.parse(json)
}
console.log('owner JWT claims:', decodeJwt(owner.jwt))


  console.log('== 2. Owner files a report ==')
  const reportRes = await fetch(`${URL_BASE}/rest/v1/reports`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${owner.jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ type: 'lost', title: 'NOTIFSPOOFTEST item', description: 'x', location: 'x', reporter_id: owner.id }),
  })
  const report = (await reportRes.json())[0]
  const reportId = report.id
  console.log('report id:', reportId)

  const statusA = await insertNotif('TEST A: owner notifies for own report', owner.jwt, reportId, 'Legit Proxy (00-00001) has been authorized.')
  const statusB = await insertNotif('TEST B: stranger spoofs a notice on OWNER\'s report', stranger.jwt, reportId, 'FAKE Proxy (99-99999) has been authorized - please release the item!')
  const statusC = await insertNotif('TEST C: stranger with a random nonexistent report_id', stranger.jwt, crypto.randomUUID(), 'spoofed notice')

  console.log('\n==================== RESULT ====================')
  console.log(statusA === 201 ? 'PASS: owner can notify for their own report (201)' : `FAIL: expected 201, got ${statusA}`)  // return=minimal -> 201 w/ no body
  console.log(statusB >= 400 ? `PASS: stranger spoofing owner's report rejected (${statusB})` : `FAIL: stranger spoof succeeded! (${statusB})`)
  console.log(statusC >= 400 ? `PASS: stranger with fake report_id rejected (${statusC})` : `FAIL: stranger spoof succeeded! (${statusC})`)
  console.log('=================================================')
  console.log(`\nCleanup reminder -> owner ${owner.id} (${ownerSid}), stranger ${stranger.id} (${strangerSid}), report ${reportId}`)
}

main().catch((err) => {
  console.error('TEST SCRIPT ERROR:', err.message)
  process.exit(1)
})
