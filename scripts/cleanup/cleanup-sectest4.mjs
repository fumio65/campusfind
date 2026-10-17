// Deletes the test data created by test-idor-fix.mjs. Run from the
// campusfind repo root:
//
//   $env:SUPABASE_URL="https://muigquisnrhdbvnexyzu.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<paste service role key - never commit this>"
//   node cleanup-sectest4.mjs --dry-run     (prints what would be deleted)
//   node cleanup-sectest4.mjs                (actually deletes)
//
// Deletion order respects FK constraints: proxy_requests / confirmation_requests
// -> reports -> public.users -> auth.users, for owner + stranger.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.argv.includes('--dry-run')

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const OWNER_ID = '209c5ec6-d62a-4af1-9d7f-9986bc3d6bef'
const STRANGER_ID = '8ed76a3c-5fd4-4258-a99a-0581300eb0f5'
const REPORT_ID = '0477a070-9ffa-4e36-8bb2-bbb04004d33b'

async function main() {
  console.log(DRY_RUN ? 'DRY RUN - nothing will actually be deleted.\n' : 'LIVE RUN - deleting test data now.\n')

  console.log(`1. proxy_requests for report ${REPORT_ID}`)
  if (!DRY_RUN) {
    const { error } = await supabase.from('proxy_requests').delete().eq('report_id', REPORT_ID)
    if (error) console.error('   failed:', error.message)
  }

  console.log(`2. confirmation_requests for report ${REPORT_ID}`)
  if (!DRY_RUN) {
    const { error } = await supabase.from('confirmation_requests').delete().eq('report_id', REPORT_ID)
    if (error) console.error('   failed:', error.message)
  }

  console.log(`3. report ${REPORT_ID}`)
  if (!DRY_RUN) {
    const { error } = await supabase.from('reports').delete().eq('id', REPORT_ID)
    if (error) console.error('   failed:', error.message)
  }

  for (const [label, id] of [['owner', OWNER_ID], ['stranger', STRANGER_ID]]) {
    console.log(`4. public.users row (${label}) ${id}`)
    if (!DRY_RUN) {
      const { error } = await supabase.from('users').delete().eq('id', id)
      if (error) console.error('   failed:', error.message)
    }
    console.log(`5. auth.users account (${label}) ${id}`)
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
