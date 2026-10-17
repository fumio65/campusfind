// Deletes the four throwaway test accounts created across the
// test-send-push-fix.mjs runs (one succeeded before hitting the account's
// RLS/key issues, three more while debugging the service-role key format).
// None of these ever filed a report/claim, and user_notifications cascades
// on user delete, so this only needs public.users + auth.users per account.
//
//   $env:SUPABASE_URL="https://muigquisnrhdbvnexyzu.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<your key>"
//   node cleanup-sectest5.mjs --dry-run
//   node cleanup-sectest5.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.argv.includes('--dry-run')

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const IDS = [
  ['run2', '45696cc1-db05-4c5f-a2c5-50e3aeea7990'],
  ['run3', '78ddb34a-27bd-4953-85d7-1d1cca27e6d3'],
  ['run4', 'd22983fb-4ef9-45fc-bdb1-ed3cc13aef42'],
  ['run5', 'f3b9b099-30ea-4192-94b6-c0e1cf0ee98b'],
]

async function main() {
  console.log(DRY_RUN ? 'DRY RUN - nothing will actually be deleted.\n' : 'LIVE RUN - deleting test data now.\n')

  for (const [label, id] of IDS) {
    console.log(`public.users row (${label}) ${id}`)
    if (!DRY_RUN) {
      const { error } = await supabase.from('users').delete().eq('id', id)
      if (error) console.error('   failed:', error.message)
    }
    console.log(`auth.users account (${label}) ${id}`)
    if (!DRY_RUN) {
      const { error } = await supabase.auth.admin.deleteUser(id)
      if (error) console.error('   failed:', error.message)
    }
  }

  console.log(`\n${DRY_RUN ? 'Would delete' : 'Deleted'} all four test accounts.`)
  if (DRY_RUN) console.log('Re-run without --dry-run to actually delete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
