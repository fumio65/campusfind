// Deletes the throwaway test accounts/data created by test-confirmation-fix.mjs.
//   $env:SUPABASE_URL="https://muigquisnrhdbvnexyzu.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<paste service role key - never commit this>"
//   node cleanup-sectest2.mjs --dry-run
//   node cleanup-sectest2.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.argv.includes('--dry-run')

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const OWNER_ID = '405988d7-06db-436f-acf6-4e0352bbc5fb'
const STRANGER_ID = 'ec7eae30-1a84-43be-a086-d0d88ef5931e'
const REPORT_ID = 'd71c7aa9-42ab-46d5-9601-959c2b729ba6'
const CONFIRMATION_ID = '3e4b5e18-619c-4ce9-9203-a47ccfd98ecc'

async function main() {
  console.log(DRY_RUN ? 'DRY RUN - nothing will actually be deleted.\n' : 'LIVE RUN - deleting test data now.\n')

  console.log(`1. confirmation_requests row ${CONFIRMATION_ID}`)
  if (!DRY_RUN) {
    const { error } = await supabase.from('confirmation_requests').delete().eq('id', CONFIRMATION_ID)
    if (error) console.error('   failed:', error.message)
  }

  console.log(`2. report ${REPORT_ID}`)
  if (!DRY_RUN) {
    const { error } = await supabase.from('reports').delete().eq('id', REPORT_ID)
    if (error) console.error('   failed:', error.message)
  }

  for (const [label, id] of [['owner', OWNER_ID], ['stranger', STRANGER_ID]]) {
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
