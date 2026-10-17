// Deletes the two throwaway test accounts (and their test report/claim)
// created by test-security-fix.mjs. Run from the campusfind repo root:
//
//   $env:SUPABASE_URL="https://muigquisnrhdbvnexyzu.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<paste service role key - never commit this>"
//   node cleanup-sectest.mjs --dry-run     (prints what would be deleted)
//   node cleanup-sectest.mjs                (actually deletes)
//
// Deletion order respects FK constraints: claim -> report -> public.users
// row -> auth.users account, for each of the two test ids below.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.argv.includes('--dry-run')

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const OWNER_ID = 'abc49e1b-c303-441c-a5ac-d8cc32d68bb2'
const ATTACKER_ID = '39b2b208-a240-40c5-ba03-85fb617725c5'
const REPORT_ID = 'c77e3437-9652-47cb-b29f-b0d4fb9b227c'
const CLAIM_ID = 'f8c5a192-3e4f-4d19-9909-f87484310a22'

async function main() {
  console.log(DRY_RUN ? 'DRY RUN - nothing will actually be deleted.\n' : 'LIVE RUN - deleting test data now.\n')

  console.log(`1. claim ${CLAIM_ID}`)
  if (!DRY_RUN) {
    const { error } = await supabase.from('claims').delete().eq('id', CLAIM_ID)
    if (error) console.error('   failed:', error.message)
  }

  console.log(`2. report ${REPORT_ID}`)
  if (!DRY_RUN) {
    const { error } = await supabase.from('reports').delete().eq('id', REPORT_ID)
    if (error) console.error('   failed:', error.message)
  }

  for (const [label, id] of [['owner', OWNER_ID], ['attacker', ATTACKER_ID]]) {
    console.log(`3. public.users row (${label}) ${id}`)
    if (!DRY_RUN) {
      const { error } = await supabase.from('users').delete().eq('id', id)
      if (error) console.error('   failed:', error.message)
    }
    console.log(`4. auth.users account (${label}) ${id}`)
    if (!DRY_RUN) {
      const { error } = await supabase.auth.admin.deleteUser(id)
      if (error) console.error('   failed:', error.message)
    }
  }

  console.log(`\n${DRY_RUN ? 'Would delete' : 'Deleted'} both test accounts and their test data.`)
  if (DRY_RUN) console.log('Re-run without --dry-run to actually delete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
