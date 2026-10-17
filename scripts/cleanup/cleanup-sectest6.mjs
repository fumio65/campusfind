// Deletes the test data created by test-report-column-fix.mjs. Run from
// the campusfind repo root:
//
//   $env:SUPABASE_URL="https://muigquisnrhdbvnexyzu.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<your key>"
//   node cleanup-sectest6.mjs --dry-run
//   node cleanup-sectest6.mjs

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.argv.includes('--dry-run')

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const OWNER_ID = '6946deb7-7a3b-460c-878f-1c981a92244a'
const REPORT_ID = '79898406-7875-420d-b4ca-ae2ab8fc4eea'

async function main() {
  console.log(DRY_RUN ? 'DRY RUN - nothing will actually be deleted.\n' : 'LIVE RUN - deleting test data now.\n')

  console.log(`1. report ${REPORT_ID}`)
  if (!DRY_RUN) {
    const { error } = await supabase.from('reports').delete().eq('id', REPORT_ID)
    if (error) console.error('   failed:', error.message)
  }

  console.log(`2. public.users row (owner) ${OWNER_ID}`)
  if (!DRY_RUN) {
    const { error } = await supabase.from('users').delete().eq('id', OWNER_ID)
    if (error) console.error('   failed:', error.message)
  }
  console.log(`3. auth.users account (owner) ${OWNER_ID}`)
  if (!DRY_RUN) {
    const { error } = await supabase.auth.admin.deleteUser(OWNER_ID)
    if (error) console.error('   failed:', error.message)
  }

  console.log(`\n${DRY_RUN ? 'Would delete' : 'Deleted'} the test account and report.`)
  if (DRY_RUN) console.log('Re-run without --dry-run to actually delete.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
