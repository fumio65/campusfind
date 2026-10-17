// One-off test script for the send-push shared-secret fix.
// Run from the campusfind repo root: node test-send-push-fix.mjs
//
// Checks:
//   A) direct POST to send-push with NO x-webhook-secret header -> expect 401
//   B) direct POST with a WRONG secret value                    -> expect 401
//   C) creating a real user_notifications row (the trigger's own path)
//      -> the trigger should call send-push successfully; we verify this
//      indirectly by confirming the insert succeeds and no error is logged
//      against it (actual FCM delivery requires a real device push token,
//      which this test account won't have, so a "sent: 0" response from
//      send-push itself - meaning it got PAST the secret check and simply
//      found no tokens - is what counts as success here, not a push
//      actually landing on a phone).
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

async function directPush(label, secretHeaderOrNull) {
  const headers = { apikey: ANON, 'Content-Type': 'application/json' }
  if (secretHeaderOrNull) headers['x-webhook-secret'] = secretHeaderOrNull
  const res = await fetch(`${URL_BASE}/functions/v1/send-push`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ user_id: '00000000-0000-0000-0000-000000000000', title: 'test', body: 'test' }),
  })
  const text = await res.text()
  console.log(`\n== ${label} ==`)
  console.log('status:', res.status)
  console.log('body:', text.slice(0, 300))
  return res.status
}

async function main() {
  console.log('== 1. Sign in as admin, create one test account ==')
  const admin = await signin(toEmail('00-00001'), 'Admin@1234')
  const rand = Math.floor(1000 + Math.random() * 8999)
  const sid = `94-9${rand}`
  const enr = `94${rand}006`
  await createAccount(admin.jwt, sid, enr, 'PushTest')
  const testUser = await signin(toEmail(sid), enr)
  console.log('test user id:', testUser.id)

  const statusA = await directPush('TEST A: no secret header', null)
  const statusB = await directPush('TEST B: wrong secret value', 'not-the-real-secret')

  console.log('\n== TEST C: service-role user_notifications insert (fires the trigger) ==')
  // user_notifications only allows service-role inserts (see migration
  // 0009_notifications_rls_and_function_hardening) - that's how it really
  // happens in production (supabaseAdmin.from('user_notifications').insert
  // inside an edge function), not a direct client insert. This needs the
  // service role key, same as the cleanup scripts.
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  let statusC = null
  if (!SERVICE_ROLE_KEY) {
    console.log('SKIPPED - set $env:SUPABASE_SERVICE_ROLE_KEY and re-run to test the real trigger path.')
  } else {
    // The new sb_secret_... key format isn't a JWT, so it goes in `apikey`
    // only - sending it as `Authorization: Bearer` too makes PostgREST try
    // (and fail) to parse it as a JWT. Legacy service_role keys (a JWT)
    // work fine this way too, since apikey alone is enough either way.
    const notifRes = await fetch(`${URL_BASE}/rest/v1/user_notifications`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        user_id: testUser.id, type: 'test', title: 'Push webhook test', body: 'should reach send-push via trigger',
      }),
    })
    const notifBody = await notifRes.text()
    console.log('insert status:', notifRes.status)
    console.log('insert body:', notifBody.slice(0, 300))
    statusC = notifRes.status
  }

  console.log('\n==================== RESULT ====================')
  console.log(statusA === 401 ? 'PASS: no-secret request correctly rejected (401)' : `FAIL: expected 401, got ${statusA}`)
  console.log(statusB === 401 ? 'PASS: wrong-secret request correctly rejected (401)' : `FAIL: expected 401, got ${statusB}`)
  if (statusC === null) {
    console.log('SKIPPED: test C (no service role key provided)')
  } else {
    console.log(statusC === 201 ? 'PASS: notification insert succeeded (trigger path not blocking writes)' : `FAIL: expected 201, got ${statusC}`)
  }
  console.log('=================================================')
  console.log('\nNote: check the Supabase Dashboard -> Edge Functions -> send-push -> Logs')
  console.log('for the invocation the trigger just fired - it should show a 200 (or at')
  console.log("least NOT a 401), confirming the trigger's own secret header is accepted.")
  console.log(`\nCleanup reminder -> test user id ${testUser.id} (student ID ${sid})`)
}

main().catch((err) => {
  console.error('TEST SCRIPT ERROR:', err.message)
  process.exit(1)
})
