// Deletes the test data created by test-claim-photos-fix.mjs. Run from
// the campusfind repo root:
//   $env:SUPABASE_URL="https://muigquisnrhdbvnexyzu.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<your key>"
//   node cleanup-sectest7.mjs --dry-run
//   node cleanup-sectest7.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.argv.includes('--dry-run')

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const OWNER_ID = '69a390c8-bd0d-4631-a672-143f08a6a911'
const CLAIMANT_ID = 'd9bcb77d-4ccc-43f5-bd69-420b3fc9a428'
const STRANGER_ID = 'c32e3d57-4a1d-4409-bbb4-82b03ee22a3d'
const REPORT_ID = 'bc357136-68fd-492a-ab48-ec27dd119932'
const CLAIM_ID = '2e2fa430-8aeb-4156-bacb-96803d73e000'
const PHOTO_PATH = 'claims/2e2fa430-8aeb-4156-bacb-96803d73e000/1295a46f-8ed7-4855-8fab-a22f2cb8948e.txt'

async function main() {
  console.log(DRY_RUN ? 'DRY RUN - nothing will actually be deleted.\n' : 'LIVE RUN - deleting test data now.\n')

  console.log(`1. storage object (claim-photos) ${PHOTO_PATH}`)
  if (!DRY_RUN) {
    const { error } = await supabase.storage.from('claim-photos').remove([PHOTO_PATH])
    if (error) console.error('   failed:', error.message)
  }

  console.log(`2. claim_photos row for claim ${CLAIM_ID}`)
  if (!DRY_RUN) {
    const { error } = await supabase.from('claim_photos').delete().eq('claim_id', CLAIM_ID)
    if (error) console.error('   failed:', error.message)
  }

  console.log(`3. claim ${CLAIM_ID}`)
  if (!DRY_RUN) {
    const { error } = await supabase.from('claims').delete().eq('id', CLAIM_ID)
    if (error) console.error('   failed:', error.message)
  }

  console.log(`4. report ${REPORT_ID}`)
  if (!DRY_RUN) {
    const { error } = await supabase.from('reports').delete().eq('id', REPORT_ID)
    if (error) console.error('   failed:', error.message)
  }

  for (const [label, id] of [['owner', OWNER_ID], ['claimant', CLAIMANT_ID], ['stranger', STRANGER_ID]]) {
    console.log(`5. public.users row (${label}) ${id}`)
    if (!DRY_RUN) {
      const { error } = await supabase.from('users').delete().eq('id', id)
      if (error) console.error('   failed:', error.message)
    }
    console.log(`6. auth.users account (${label}) ${id}`)
    if (!DRY_RUN) {
      const { error } = await supabase.auth.admin.deleteUser(id)
      if (error) console.error('   failed:', error.message)
    }
  }

  console.log(`\n${DRY_RUN ? 'Would delete' : 'Deleted'} all test data.`)
  if (DRY_RUN) console.log('Re-run without --dry-run to actually delete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
