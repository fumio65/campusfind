// Live functional test for the Strix WEB-01..03 fixes (dropoff, tips,
// notifications) and the extra reports/claims routes guarded with them.
// Creates three throwaway students (reporter, claimant, outsider), one test
// report, a claim and a tip, then checks that the right person is allowed
// and everyone else is refused. Never calls /reports/:id/announce
// successfully, because that would notify every real student.
//
// Run from the repo root:  node scripts/verification/test-ownership-guards.mjs
// Afterwards:              node scripts/cleanup/cleanup-sectest10.mjs   (reads the ids file below)

import fs from 'node:fs'

const envText = fs.readFileSync('app/.env.local', 'utf8')
const URL_BASE = envText.match(/VITE_SUPABASE_URL=(.*)/)[1].trim()
const ANON = envText.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()
const FN = `${URL_BASE}/functions/v1`
const IDS_FILE = 'scripts/cleanup/sectest10-ids.json'
const created = { users: [], reports: [], claims: [], tips: [], dropoffs: [] }
const save = () => fs.writeFileSync(IDS_FILE, JSON.stringify(created, null, 2))

const toEmail = (sid) => `${sid.toLowerCase().replace('-', '')}@nwssu.local`
async function signin(email, password) {
  const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const j = await r.json()
  if (!j.access_token) throw new Error(`sign-in failed for ${email}: ${JSON.stringify(j)}`)
  return { jwt: j.access_token, id: j.user.id }
}
const call = async (method, path, jwt, body) => {
  const headers = { apikey: ANON, 'Content-Type': 'application/json' }
  if (jwt) headers.Authorization = `Bearer ${jwt}`
  const r = await fetch(`${FN}/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
  let j = null; try { j = await r.json() } catch {}
  return { status: r.status, body: j }
}
const rest = async (method, table, jwt, body, query = '') => {
  const r = await fetch(`${URL_BASE}/rest/v1/${table}${query}`, {
    method,
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: r.status, body: await r.json().catch(() => null) }
}

let pass = 0, fail = 0
function check(label, got, want) {
  const ok = Array.isArray(want) ? want.includes(got) : got === want
  ok ? pass++ : fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${got}, want ${want})`)
}

async function main() {
  const admin = await signin(toEmail('00-00001'), 'Admin@1234')
  const rand = Math.floor(1000 + Math.random() * 8999)
  const people = {}
  for (const [role, prefix, n] of [['reporter', '93', 1], ['claimant', '92', 2], ['outsider', '91', 3]]) {
    const sid = `${prefix}-9${rand}`, enr = `${prefix}${rand}00${n}`
    const r = await call('POST', 'accounts/single', admin.jwt, { studentId: sid, enrollmentNumber: enr, lastName: 'SecTest', firstName: role })
    if (r.status >= 400) throw new Error(`create ${role}: ${JSON.stringify(r.body)}`)
    people[role] = await signin(toEmail(sid), enr)
    created.users.push(people[role].id); save()
  }
  const { reporter, claimant, outsider } = people
  console.log('test students:', Object.fromEntries(Object.entries(people).map(([k, v]) => [k, v.id])))

  // --- setup: report, tip, claim (approved)
  const rep = await rest('POST', 'reports', reporter.jwt, { type: 'lost', title: 'SECTEST10 item', description: 'sectest', location: 'sectest', reporter_id: reporter.id })
  const report = rep.body?.[0]; if (!report) throw new Error(`report: ${JSON.stringify(rep.body)}`)
  created.reports.push(report.id); save()
  const tipR = await rest('POST', 'tips', outsider.jwt, { report_id: report.id, user_id: outsider.id, text: 'sectest tip' })
  const tip = tipR.body?.[0]; if (!tip) throw new Error(`tip: ${JSON.stringify(tipR.body)}`)
  created.tips.push(tip.id); save()
  const clR = await rest('POST', 'claims', claimant.jwt, { report_id: report.id, claimant_id: claimant.id })
  const claim = clR.body?.[0]; if (!claim) throw new Error(`claim: ${JSON.stringify(clR.body)}`)
  created.claims.push(claim.id); save()

  console.log('\n-- claims')
  check('claim notify by claimant with pending claim', (await call('POST', 'claims', claimant.jwt, { reportId: report.id })).status, 200)
  check('claim notify by outsider (no claim)        ', (await call('POST', 'claims', outsider.jwt, { reportId: report.id })).status, 403)

  console.log('\n-- tips')
  check('tip notify by outsider for a tip that is not theirs', (await call('POST', 'tips/notify', claimant.jwt, { tipId: tip.id })).status, 403)
  check('tip notify by tip author                         ', (await call('POST', 'tips/notify', outsider.jwt, { tipId: tip.id })).status, 200)
  const again = await call('POST', 'tips/notify', outsider.jwt, { tipId: tip.id })
  check('tip notify repeated is a no-op (alreadySent)       ', again.body?.alreadySent === true, true)
  check('tip credit by non-reporter                        ', (await call('PATCH', `tips/${tip.id}/credit`, claimant.jwt, { userId: claimant.id, reportId: report.id, resolveReport: true })).status, 403)
  check('tip credit by reporter                            ', (await call('PATCH', `tips/${tip.id}/credit`, reporter.jwt, {})).status, 200)
  const credit2 = await call('PATCH', `tips/${tip.id}/credit`, reporter.jwt, {})
  check('tip credit repeated is a no-op (alreadyCredited)  ', credit2.body?.alreadyCredited === true, true)

  console.log('\n-- reports')
  check('resolve by outsider                    ', (await call('PATCH', `reports/${report.id}/resolve`, outsider.jwt, { resolvedVia: 'handoff' })).status, 403)
  check('announce by outsider                   ', (await call('POST', `reports/${report.id}/announce`, outsider.jwt, {})).status, 403)
  check('credit-finder by a student (admin-only)', (await call('POST', `reports/${report.id}/credit-finder`, reporter.jwt, { finderStudentId: '00-00000' })).status, 403)

  console.log('\n-- notifications (admin-only)')
  check('GET by student', (await call('GET', 'notifications', reporter.jwt)).status, 403)
  check('GET by admin  ', (await call('GET', 'notifications', admin.jwt)).status, 200)

  console.log('\n-- dropoff')
  const appr = await call('PATCH', `claims/${claim.id}`, reporter.jwt, { action: 'approve' })
  check('reporter approves the claim (setup)', appr.status, 200)
  check('drop-off request by outsider       ', (await call('POST', 'dropoff', outsider.jwt, { claimId: claim.id })).status, 403)
  const d = await call('POST', 'dropoff', claimant.jwt, { claimId: claim.id })
  check('drop-off request by claimant       ', d.status, [200, 201])
  if (d.body?.id) { created.dropoffs.push(d.body.id); save() }
  check('drop-off list by student           ', (await call('GET', 'dropoff', claimant.jwt)).status, 403)
  check('drop-off list by admin             ', (await call('GET', 'dropoff', admin.jwt)).status, 200)
  check('mark received by student           ', (await call('PATCH', `dropoff/${d.body?.id}/receive`, claimant.jwt, { photoPath: 'sectest/none.jpg' })).status, 403)
  check('mark received by admin             ', (await call('PATCH', `dropoff/${d.body?.id}/receive`, admin.jwt, { photoPath: 'sectest/none.jpg' })).status, 200)
  check('confirm pickup by admin            ', (await call('PATCH', `dropoff/${d.body?.id}/pickup`, admin.jwt, {})).status, 200)
  check('confirm pickup twice (no double +5)', (await call('PATCH', `dropoff/${d.body?.id}/pickup`, admin.jwt, {})).status, 409)
  check('resolve already-resolved report    ', (await call('PATCH', `reports/${report.id}/resolve`, reporter.jwt, { resolvedVia: 'handoff' })).status, 409)

  console.log(`\n${fail === 0 ? 'ALL PASS' : `${fail} FAILED`} (${pass} passed)`)
  console.log(`Created ids saved to ${IDS_FILE} - run the cleanup script next.`)
}
main().catch((e) => { console.error('TEST SCRIPT ERROR:', e.message); console.log(`Partial ids saved to ${IDS_FILE}`); process.exit(1) })
