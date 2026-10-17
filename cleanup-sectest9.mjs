// Deletes the throwaway student accounts created across the three runs of
// test-users-lockdown-fix.mjs while debugging the enrollment_number/role
// lockdown fix. Run from the repo root:
//   node cleanup-sectest9.mjs --dry-run
//   node cleanup-sectest9.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.argv.includes('--dry-run')

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const USER_IDS = [
  '16664b2e-6711-497e-a4bb-a47c0645d4cc', // 87-99216, run 1
  'd43cb421-e30a-4e18-b17c-a7832838bcc5', // 87-93379, run 2
  'facb3706-ed32-4863-84b4-e2ebc0fb533a', // 87-94476, run 3 (final pass)
]

async function main() {
  console.log(DRY_RUN ? 'DRY RUN - nothing will actually be deleted.\n' : 'LIVE RUN - deleting test data now.\n')
  for (const id of USER_IDS) {
    console.log(`public.users row ${id}`)
    if (!DRY_RUN) {
      const { error } = await supabase.from('users').delete().eq('id', id)
      if (error) console.error('   failed:', error.message)
    }
    console.log(`auth.users account ${id}`)
    if (!DRY_RUN) {
      const { error } = await supabase.auth.admin.deleteUser(id)
      if (error) console.error('   failed:', error.message)
    }
  }
  console.log(`\n${DRY_RUN ? 'Would delete' : 'Deleted'} all users-lockdown test accounts.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
