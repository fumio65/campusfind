// Deletes every throwaway account/report created while testing the
// notification-bell spoofing fix (several runs while debugging a test-script
// bug, not the real fix). Run from the repo root:
//
//   node cleanup-sectest8.mjs --dry-run
//   node cleanup-sectest8.mjs
//
// Needs SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars (service role key
// - never commit it).

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.argv.includes('--dry-run')

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// Every owner/stranger pair + report id from the four test runs above.
const USER_IDS = [
  'adb28039-01c2-49df-a503-cd79762b158b', // owner, run 1
  'fe55896b-59d8-46f6-b3c4-d60b13aad1ba', // stranger, run 1
  'd110ad89-bee2-46e8-8ef6-8424742d74e8', // owner, run 2
  '6402346b-9c5e-4fc3-95d0-8241ee8c6c7e', // stranger, run 2
  'aeb6b7f0-2c14-4e3f-8861-808bcc2505aa', // owner, run 3 (final pass)
  '84a52838-2d0a-483f-86c9-ff50c4f27ad8', // stranger, run 3 (final pass)
]
const REPORT_IDS = [
  'ee4c4fb4-abe0-42b7-b0a3-cd709b0e1dd4',
  'a73ef48c-ece0-44a5-a57e-52ecc9a5681e',
  '08f12b26-a7ed-4b79-b95e-2820c374714f',
]

async function main() {
  console.log(DRY_RUN ? 'DRY RUN - nothing will actually be deleted.\n' : 'LIVE RUN - deleting test data now.\n')

  console.log('1. notifications tied to the test reports')
  if (!DRY_RUN) {
    const { error } = await supabase.from('notifications').delete().in('report_id', REPORT_IDS)
    if (error) console.error('   failed:', error.message)
  }

  for (const id of REPORT_IDS) {
    console.log(`2. report ${id}`)
    if (!DRY_RUN) {
      const { error } = await supabase.from('reports').delete().eq('id', id)
      if (error) console.error('   failed:', error.message)
    }
  }

  for (const id of USER_IDS) {
    console.log(`3. public.users row ${id}`)
    if (!DRY_RUN) {
      const { error } = await supabase.from('users').delete().eq('id', id)
      if (error) console.error('   failed:', error.message)
    }
    console.log(`4. auth.users account ${id}`)
    if (!DRY_RUN) {
      const { error } = await supabase.auth.admin.deleteUser(id)
      if (error) console.error('   failed:', error.message)
    }
  }

  console.log(`\n${DRY_RUN ? 'Would delete' : 'Deleted'} all notification-spoof test data.`)
  if (DRY_RUN) console.log('Re-run without --dry-run to actually delete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
