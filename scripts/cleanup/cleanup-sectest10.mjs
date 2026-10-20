// Deletes everything test-ownership-guards.mjs created (ids read from
// scripts/cleanup/sectest10-ids.json). Needs the service role key:
//   $env:SUPABASE_URL="https://muigquisnrhdbvnexyzu.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<service role key - never commit>"
//   node scripts/cleanup/cleanup-sectest10.mjs --dry-run
//   node scripts/cleanup/cleanup-sectest10.mjs
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const DRY = process.argv.includes('--dry-run')
const ids = JSON.parse(fs.readFileSync('scripts/cleanup/sectest10-ids.json', 'utf8'))
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const users = ids.users, reports = ids.reports, claims = ids.claims

async function del(label, table, col, values) {
  if (!values.length) return
  console.log(`${DRY ? 'would delete' : 'deleting'} ${label}`)
  if (DRY) return
  const { error } = await sb.from(table).delete().in(col, values)
  if (error) console.error(`  ${table}: ${error.message}`)
}

await del('user notifications', 'user_notifications', 'user_id', users)
await del('report notifications', 'user_notifications', 'report_id', reports)
await del('admin notifications', 'notifications', 'report_id', reports)
await del('trust score events', 'trust_score_events', 'user_id', users)
await del('drop-off requests', 'dropoff_requests', 'report_id', reports)
await del('claim messages', 'claim_messages', 'claim_id', claims)
await del('claim photos', 'claim_photos', 'claim_id', claims)
await del('claims', 'claims', 'report_id', reports)
await del('tips', 'tips', 'report_id', reports)
await del('report photos', 'report_photos', 'report_id', reports)
await del('reports', 'reports', 'id', reports)
await del('public.users rows', 'users', 'id', users)
for (const id of users) {
  console.log(`${DRY ? 'would delete' : 'deleting'} auth user ${id}`)
  if (!DRY) { const { error } = await sb.auth.admin.deleteUser(id); if (error) console.error(`  auth ${id}: ${error.message}`) }
}
console.log(DRY ? '\nDry run only. Re-run without --dry-run to delete.' : '\nDone.')
