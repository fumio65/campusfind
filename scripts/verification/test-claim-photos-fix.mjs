// One-off test script for the claim-photos privacy fix (table RLS +
// private storage bucket). Run from the campusfind repo root:
//   node test-claim-photos-fix.mjs
//
// Creates owner (reporter) + claimant + stranger. Owner files a report,
// claimant submits a claim with one evidence photo uploaded to the new
// claim-photos bucket. Checks:
//   A) claimant can read their own claim_photos row            -> yes
//   B) owner (reporter) can read it too (claim participant)    -> yes
//   C) stranger CANNOT read the claim_photos row                -> empty
//   D) stranger CANNOT upload a file into the claimant's claim  -> rejected
//   E) a signed URL for the photo actually loads real bytes     -> 200
//   F) the SAME path requested from the old public endpoint     -> fails
//      (proves the bucket itself, not just the API listing, is private)
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
  console.log('== 1. Sign in as admin, create owner + claimant + stranger ==')
  const admin = await signin(toEmail('00-00001'), 'Admin@1234')
  const rand = Math.floor(1000 + Math.random() * 8999)
  const ownerSid = `92-9${rand}`, claimantSid = `91-9${rand}`, strangerSid = `90-9${rand}`
  const ownerEnr = `92${rand}008`, claimantEnr = `91${rand}009`, strangerEnr = `90${rand}010`
  await createAccount(admin.jwt, ownerSid, ownerEnr, 'Owner')
  await createAccount(admin.jwt, claimantSid, claimantEnr, 'Claimant')
  await createAccount(admin.jwt, strangerSid, strangerEnr, 'Stranger')
  const owner = await signin(toEmail(ownerSid), ownerEnr)
  const claimant = await signin(toEmail(claimantSid), claimantEnr)
  const stranger = await signin(toEmail(strangerSid), strangerEnr)
  console.log('owner:', owner.id, '| claimant:', claimant.id, '| stranger:', stranger.id)

  console.log('== 2. Owner files a report, claimant files a claim ==')
  const reportRes = await fetch(`${URL_BASE}/rest/v1/reports`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${owner.jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ type: 'lost', title: 'PHOTOTEST item', description: 'phototest', location: 'phototest', reporter_id: owner.id }),
  })
  const report = (await reportRes.json())[0]
  const reportId = report.id
  const claimRes = await fetch(`${URL_BASE}/rest/v1/claims`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${claimant.jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ report_id: reportId, claimant_id: claimant.id }),
  })
  const claim = (await claimRes.json())[0]
  const claimId = claim.id
  console.log('report:', reportId, '| claim:', claimId)

  console.log('== 3. Claimant uploads an evidence photo to claim-photos ==')
  const photoId = crypto.randomUUID()
  const storagePath = `claims/${claimId}/${photoId}.txt`
  const fakeBytes = new TextEncoder().encode('fake evidence photo bytes for testing')
  const uploadRes = await fetch(`${URL_BASE}/storage/v1/object/claim-photos/${storagePath}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${claimant.jwt}`, 'Content-Type': 'text/plain' },
    body: fakeBytes,
  })
  console.log('upload status:', uploadRes.status, await uploadRes.text())
  await fetch(`${URL_BASE}/rest/v1/claim_photos`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${claimant.jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ id: photoId, claim_id: claimId, storage_path: storagePath, position: 0 }),
  })

  async function readClaimPhotosAs(label, jwt) {
    const res = await fetch(`${URL_BASE}/rest/v1/claim_photos?claim_id=eq.${claimId}&select=id,storage_path`, {
      headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
    })
    const rows = await res.json()
    console.log(`\n== ${label} ==`)
    console.log('rows returned:', JSON.stringify(rows))
    return rows
  }

  const rowsA = await readClaimPhotosAs('TEST A: claimant reads own claim_photos row', claimant.jwt)
  const rowsB = await readClaimPhotosAs('TEST B: owner (reporter) reads it too', owner.jwt)
  const rowsC = await readClaimPhotosAs('TEST C: stranger reads it (should be empty)', stranger.jwt)

  console.log('\n== TEST D: stranger tries to upload into the claimant\'s claim folder ==')
  const strangerUploadRes = await fetch(`${URL_BASE}/storage/v1/object/claim-photos/${storagePath.replace(photoId, 'evil-' + photoId)}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${stranger.jwt}`, 'Content-Type': 'text/plain' },
    body: new TextEncoder().encode('malicious upload attempt'),
  })
  console.log('status:', strangerUploadRes.status, await strangerUploadRes.text())

  console.log('\n== TEST E: a signed URL for the photo actually serves the real bytes ==')
  const signRes = await fetch(`${URL_BASE}/storage/v1/object/sign/claim-photos/${storagePath}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${claimant.jwt}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 3600 }),
  })
  const signBody = await signRes.json()
  console.log('sign status:', signRes.status, JSON.stringify(signBody))
  let signedFetchOk = false
  if (signBody.signedURL) {
    const fetchRes = await fetch(`${URL_BASE}${signBody.signedURL}`)
    const fetchedText = await fetchRes.text()
    signedFetchOk = fetchRes.status === 200 && fetchedText === 'fake evidence photo bytes for testing'
    console.log('signed fetch status:', fetchRes.status, 'bytes match:', signedFetchOk)
  }

  console.log('\n== TEST F: the old-style public URL for the same path should fail ==')
  const publicRes = await fetch(`${URL_BASE}/storage/v1/object/public/claim-photos/${storagePath}`)
  console.log('public url status:', publicRes.status)

  console.log('\n==================== RESULT ====================')
  console.log(rowsA.length === 1 ? 'PASS: claimant sees own claim photo row' : `FAIL: claimant saw ${rowsA.length} rows`)
  console.log(rowsB.length === 1 ? 'PASS: reporter (participant) sees claim photo row' : `FAIL: reporter saw ${rowsB.length} rows`)
  console.log(rowsC.length === 0 ? 'PASS: stranger sees NO claim photo rows' : `FAIL: stranger saw ${rowsC.length} rows!`)
  console.log(strangerUploadRes.status >= 400 ? `PASS: stranger upload rejected (${strangerUploadRes.status})` : `FAIL: stranger upload succeeded! (${strangerUploadRes.status})`)
  console.log(signedFetchOk ? 'PASS: signed URL serves real bytes' : 'FAIL: signed URL fetch did not return expected bytes')
  console.log(publicRes.status !== 200 ? `PASS: public URL endpoint rejected (${publicRes.status}) - bucket is genuinely private` : 'FAIL: public URL endpoint returned 200 - bucket is NOT private!')
  console.log('=================================================')
  console.log(`\nCleanup reminder -> owner ${owner.id} (${ownerSid}), claimant ${claimant.id} (${claimantSid}), stranger ${stranger.id} (${strangerSid}), report ${reportId}, claim ${claimId}, photo path ${storagePath}`)
}

main().catch((err) => {
  console.error('TEST SCRIPT ERROR:', err.message)
  process.exit(1)
})
