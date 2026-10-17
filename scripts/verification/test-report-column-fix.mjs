// One-off test script for the reports-table column-grant fix.
// Run from the campusfind repo root: node test-report-column-fix.mjs
//
// Checks, as the report's own reporter:
//   A) updating title/description/location/category (the legitimate app
//      feature) -> expect success
//   B) updating status directly -> expect a Postgres permission error
//   C) updating resolved_via directly -> expect a Postgres permission error
//   D) updating handoff_record directly -> expect a Postgres permission error
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

async function patchReport(label, jwt, reportId, patchBody) {
  const res = await fetch(`${URL_BASE}/rest/v1/reports?id=eq.${reportId}`, {
    method: 'PATCH',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify(patchBody),
  })
  const text = await res.text()
  console.log(`\n== ${label} ==`)
  console.log('status:', res.status)
  console.log('body:', text.slice(0, 300))
  return { status: res.status, text }
}

async function main() {
  console.log('== 1. Sign in as admin, create owner ==')
  const admin = await signin(toEmail('00-00001'), 'Admin@1234')
  const rand = Math.floor(1000 + Math.random() * 8999)
  const ownerSid = `93-9${rand}`
  const ownerEnr = `93${rand}007`
  await createAccount(admin.jwt, ownerSid, ownerEnr, 'Owner')
  const owner = await signin(toEmail(ownerSid), ownerEnr)
  console.log('owner id:', owner.id)

  console.log('== 2. Owner files a test report ==')
  const reportRes = await fetch(`${URL_BASE}/rest/v1/reports`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${owner.jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ type: 'lost', title: 'COLUMNTEST item', description: 'columntest', location: 'columntest', reporter_id: owner.id }),
  })
  const report = (await reportRes.json())[0]
  if (!report?.id) throw new Error('Report create failed')
  const reportId = report.id
  console.log('report id:', reportId)

  const a = await patchReport('TEST A: legitimate edit (title/description/location/category)', owner.jwt, reportId, {
    title: 'COLUMNTEST item (edited)', description: 'updated', location: 'updated', category: 'Electronics',
  })
  const b = await patchReport('TEST B: direct status override attempt', owner.jwt, reportId, { status: 'resolved' })
  const c = await patchReport('TEST C: direct resolved_via override attempt', owner.jwt, reportId, { resolved_via: 'handoff' })
  const d = await patchReport('TEST D: direct handoff_record override attempt', owner.jwt, reportId, { handoff_record: { fake: true } })

  console.log('\n==================== RESULT ====================')
  console.log(a.status === 200 ? 'PASS: legitimate edit succeeded (200)' : `FAIL: expected 200, got ${a.status}`)
  console.log(b.status >= 400 ? `PASS: status override rejected (${b.status})` : `FAIL: status override succeeded! (${b.status})`)
  console.log(c.status >= 400 ? `PASS: resolved_via override rejected (${c.status})` : `FAIL: resolved_via override succeeded! (${c.status})`)
  console.log(d.status >= 400 ? `PASS: handoff_record override rejected (${d.status})` : `FAIL: handoff_record override succeeded! (${d.status})`)
  console.log('=================================================')
  console.log(`\nCleanup reminder -> owner id ${owner.id} (${ownerSid}), report id ${reportId}`)
}

main().catch((err) => {
  console.error('TEST SCRIPT ERROR:', err.message)
  process.exit(1)
})
