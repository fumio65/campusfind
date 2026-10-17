// One-off test for the users-table column-grant lockdown fix.
// Run from the campusfind repo root: node test-users-lockdown-fix.mjs
//
// Creates one throwaway student account and checks, as that student:
//   A) SELECT including enrollment_number on ANOTHER user (admin)  -> blocked
//   B) SELECT including enrollment_number on THEIR OWN row         -> blocked
//   C) UPDATE own row: role -> 'admin'                             -> rejected
//   D) UPDATE own row: trust_score -> 999                          -> rejected
//   E) UPDATE own row: force_password_change -> false (legit case) -> succeeds
//   F) basic directory fields (first_name/last_name/student_id) on
//      another user are STILL readable (make sure we didn't overshoot)

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
  const admin = await signin('0000001@nwssu.local', 'Admin@1234')
  const rand = Math.floor(1000 + Math.random() * 8999)
  const sid = `87-9${rand}`
  const enr = `87${rand}013`
  await createAccount(admin.jwt, sid, enr, 'Student')
  const student = await signin(toEmail(sid), enr)
  console.log('student:', student.id, '(', sid, ')')
  console.log('admin:', admin.id)

  async function rest(label, method, path, body, preferMinimal = false) {
    const headers = {
      apikey: ANON,
      Authorization: `Bearer ${student.jwt}`,
      'Content-Type': 'application/json',
    }
    if (method === 'PATCH') {
      // return=minimal matches the real app code (ChangePasswordPage.jsx),
      // which calls .update({...}) with no .select() chained. Only the
      // legit case (E) uses that; C/D intentionally ask for
      // return=representation since they're testing a hostile client that
      // WOULD want the row back to confirm the escalation worked.
      headers.Prefer = preferMinimal ? 'return=minimal' : 'return=representation'
    }
    const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    const text = await res.text()
    console.log(`\n== ${label} ==`)
    console.log('status:', res.status, '| body:', text.slice(0, 250))
    return { status: res.status, text }
  }

  const a = await rest('A: select enrollment_number on ANOTHER user (admin)', 'GET',
    `users?id=eq.${admin.id}&select=id,enrollment_number`)
  const b = await rest('B: select enrollment_number on OWN row', 'GET',
    `users?id=eq.${student.id}&select=id,enrollment_number`)
  const c = await rest('C: PATCH own row - role -> admin', 'PATCH',
    `users?id=eq.${student.id}`, { role: 'admin' })
  const d = await rest('D: PATCH own row - trust_score -> 999', 'PATCH',
    `users?id=eq.${student.id}`, { trust_score: 999 })
  const e = await rest('E: PATCH own row - force_password_change -> false (legit)', 'PATCH',
    `users?id=eq.${student.id}`, { force_password_change: false }, true)
  const f = await rest('F: basic directory fields on ANOTHER user still readable', 'GET',
    `users?id=eq.${admin.id}&select=id,first_name,last_name,student_id`)

  console.log('\n==================== RESULT ====================')
  console.log(a.status >= 400 ? 'PASS: enrollment_number blocked on other user' : `FAIL: got ${a.status}: ${a.text}`)
  console.log(b.status >= 400 ? 'PASS: enrollment_number blocked on own row too' : `FAIL: got ${b.status}: ${b.text}`)
  console.log(c.status >= 400 ? 'PASS: self-promotion to admin rejected' : `FAIL: self-promotion succeeded! ${c.status}: ${c.text}`)
  console.log(d.status >= 400 ? 'PASS: self-set trust_score rejected' : `FAIL: self-set trust_score succeeded! ${d.status}: ${d.text}`)
  console.log(e.status < 400 ? 'PASS: legit force_password_change update still works' : `FAIL: got ${e.status}: ${e.text}`)
  console.log(f.status < 400 && f.text.includes('first_name') ? 'PASS: basic directory read on other user still works' : `FAIL: got ${f.status}: ${f.text}`)
  console.log('=================================================')
  console.log(`\nCleanup reminder -> student ${student.id} (${sid})`)
}

main().catch((err) => {
  console.error('TEST SCRIPT ERROR:', err.message)
  process.exit(1)
})
