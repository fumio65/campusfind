// Deletes the Supabase Auth accounts (actual login access) for every user
// NOT in the KEEP_IDS list below. Run this AFTER the SQL step that removes
// their public.users row and app data - there's no automatic link between
// public.users and auth.users in this schema, so removing one doesn't
// revoke the other; both steps are needed to fully remove an account.
//
// Uses the Admin API (supabase.auth.admin.deleteUser) rather than deleting
// from auth.users directly via SQL - Supabase manages several internal auth
// tables (sessions, identities, refresh tokens) that the Admin API cleans
// up correctly and a raw SQL delete might not.
//
// Requires the SERVICE ROLE key (Project Settings -> API -> service_role).
// Do not commit this key or put it in the app - local use only.
//
// Usage:
//   npm install @supabase/supabase-js   (skip if already installed)
//   $env:SUPABASE_URL="https://muigquisnrhdbvnexyzu.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<paste service role key>"
//   node delete-auth-users.js --dry-run     (prints who would be deleted)
//   node delete-auth-users.js                (actually deletes them)

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.argv.includes('--dry-run')

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// The 6 accounts to keep - everyone else in Supabase Auth gets deleted.
const KEEP_IDS = new Set([
  '4e66603b-3157-439e-b256-8563fb5b057d', // ISSC Admin
  'bee98756-8856-4b69-b24e-65a2c36075ba', // Al Fhyl Lhester C. Tomenio
  'f3d7fdc9-5935-4f4c-8aa6-1451812f05c3', // Emerson Cabasa
  '2226d703-3236-46e7-828a-a880df20a048', // Viece Francis Barreto
  '168576d6-5e20-4a21-908d-2a85e082c4ff', // Kristine Jill Magan
  '84a20777-44da-43d2-8040-d55a1d6e5f04', // Revin Borjal Domayan
])

async function listAllAuthUsers() {
  let page = 1
  const perPage = 200
  const all = []
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    all.push(...data.users)
    if (data.users.length < perPage) break
    page += 1
  }
  return all
}

async function main() {
  console.log(DRY_RUN ? 'DRY RUN - no accounts will actually be deleted.\n' : 'LIVE RUN - accounts will be permanently deleted.\n')

  const authUsers = await listAllAuthUsers()
  const toDelete = authUsers.filter((u) => !KEEP_IDS.has(u.id))
  const keptCount = authUsers.length - toDelete.length

  console.log(`Auth accounts found: ${authUsers.length}, keeping: ${keptCount}, deleting: ${toDelete.length}\n`)

  if (keptCount !== KEEP_IDS.size) {
    console.warn(
      `WARNING: expected to find ${KEEP_IDS.size} keepers but matched ${keptCount}. ` +
      `Double-check the KEEP_IDS list against the users table before proceeding.\n`
    )
  }

  for (const user of toDelete) {
    console.log(`${user.id}  ${user.email ?? '(no email)'}`)
    if (!DRY_RUN) {
      const { error } = await supabase.auth.admin.deleteUser(user.id)
      if (error) console.error(`  Failed to delete: ${error.message}`)
    }
  }

  console.log(`\n${DRY_RUN ? 'Would delete' : 'Deleted'} ${toDelete.length} account(s).`)
  if (DRY_RUN) console.log('Re-run without --dry-run to actually delete these.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
