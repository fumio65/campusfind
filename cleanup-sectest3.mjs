// Deletes the one throwaway non-admin test account created by
// test-reports-fix.mjs. Run from the campusfind repo root:
//
//   $env:SUPABASE_URL="https://muigquisnrhdbvnexyzu.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<paste service role key - never commit this>"
//   node cleanup-sectest3.mjs --dry-run     (prints what would be deleted)
//   node cleanup-sectest3.mjs                (actually deletes)
//
// This account never filed a report or claim, so there's no child-row
// cleanup needed first - just public.users then auth.users.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.argv.includes('--dry-run')

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const STRANGER_ID = 'da349262-d782-4f06-81c5-16caebe87489'

async function main() {
  console.log(DRY_RUN ? 'DRY RUN - nothing will actually be deleted.\n' : 'LIVE RUN - deleting test data now.\n')

  console.log(`1. public.users row (stranger) ${STRANGER_ID}`)
  if (!DRY_RUN) {
    const { error } = await supabase.from('users').delete().eq('id', STRANGER_ID)
    if (error) console.error('   failed:', error.message)
  }

  console.log(`2. auth.users account (stranger) ${STRANGER_ID}`)
  if (!DRY_RUN) {
    const { error } = await supabase.auth.admin.deleteUser(STRANGER_ID)
    if (error) console.error('   failed:', error.message)
  }

  console.log(`\n${DRY_RUN ? 'Would delete' : 'Deleted'} the test account.`)
  if (DRY_RUN) console.log('Re-run without --dry-run to actually delete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
