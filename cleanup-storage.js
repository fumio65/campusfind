// One-time cleanup: removes orphaned photo files from the `report-photos`
// storage bucket - files left behind after the SQL delete removed their
// report_photos/claim_photos database rows, but Supabase Storage doesn't
// know to delete the underlying files just because the DB row referencing
// them is gone.
//
// SAFETY: this only deletes a folder (reports/<id>/ or claims/<id>/) if
// there is NO remaining report_photos/claim_photos row pointing at that
// same id - i.e. only folders for reports/claims that were actually
// deleted by the SQL script. It never touches a folder still in use.
//
// Run this AFTER the SQL delete, not before - it checks the database to
// decide what's safe to remove.
//
// Requires the SERVICE ROLE key (not the anon/publishable key), because
// bulk-listing and deleting storage objects needs to bypass RLS. Get it
// from: Supabase Dashboard -> Project Settings -> API -> service_role key.
// Do NOT commit this key or put it in the app itself - it's for this
// one-off script only, run locally.
//
// Usage:
//   npm install @supabase/supabase-js
//   SUPABASE_URL=https://muigquisnrhdbvnexyzu.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<paste service role key> \
//   node cleanup-storage.js
//
// Add --dry-run to just print what WOULD be deleted, without deleting
// anything - recommended to run this first to double check the list.

const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.argv.includes('--dry-run')
const BUCKET = 'report-photos'

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

async function listTopLevelFolders(prefix) {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 })
  if (error) throw error
  // Entries with no `id` (and no metadata) are subfolders, not files.
  return data.filter((entry) => !entry.id).map((entry) => entry.name)
}

async function listFilesRecursive(folderPath) {
  const { data, error } = await supabase.storage.from(BUCKET).list(folderPath, { limit: 1000 })
  if (error) throw error
  const files = []
  for (const entry of data) {
    const entryPath = `${folderPath}/${entry.name}`
    if (entry.id) {
      files.push(entryPath)
    } else {
      files.push(...(await listFilesRecursive(entryPath)))
    }
  }
  return files
}

async function idsStillReferenced(table, idColumnExtractor, pathColumn = 'storage_path') {
  const { data, error } = await supabase.from(table).select(pathColumn)
  if (error) throw error
  // The path column looks like "reports/<report_id>/<photo_id>.jpg" or
  // "<report_id>/<photo_id>.jpg" (edited-in photos), "claims/<claim_id>/<photo_id>.jpg",
  // or "dropoff/<request_id>/<file>.jpg" - pull out whichever path segment
  // is the folder id.
  return new Set(data.map((row) => idColumnExtractor(row[pathColumn])).filter(Boolean))
}

function folderIdFromReportPath(path) {
  const parts = path.split('/')
  // "reports/<id>/file" -> parts[1]; "<id>/file" (no "reports/" prefix) -> parts[0]
  return parts[0] === 'reports' ? parts[1] : parts[0]
}

function folderIdFromClaimPath(path) {
  const parts = path.split('/')
  // "claims/<id>/file"
  return parts[0] === 'claims' ? parts[1] : null
}

function folderIdFromDropoffPath(path) {
  const parts = path.split('/')
  // "dropoff/<dropoff_request_id>/file" - keyed by the dropoff_requests row
  // id itself, not report_id/claim_id (see DropoffRequestsPage.jsx).
  return parts[0] === 'dropoff' ? parts[1] : null
}

function folderIdFromResolvedPath(path) {
  const parts = path.split('/')
  // "resolved/<report_id>/file" - the mark-as-resolved proof photo,
  // keyed by report id (see ReportDetailPage.jsx's handleMarkResolved).
  return parts[0] === 'resolved' ? parts[1] : null
}

// Each of these is a separate upload location found in the codebase, keyed
// by a different id. Add a new entry here if another upload flow turns up
// that this script doesn't know about yet - check storage.objects' top-level
// folder names against what this list covers if a cleanup run looks short.
const SOURCES = [
  {
    prefix: 'reports',
    // report_photos.storage_path is "reports/<id>/file" OR "<id>/file"
    // (prefix-less convention used by EditReportPage) - either way the
    // folder id is in report_photos, so this is the right referenced-id set.
    referencedIds: () => idsStillReferenced('report_photos', folderIdFromReportPath),
  },
  {
    prefix: 'claims',
    referencedIds: () => idsStillReferenced('claim_photos', folderIdFromClaimPath),
  },
  {
    prefix: 'dropoff',
    referencedIds: () => idsStillReferenced('dropoff_requests', folderIdFromDropoffPath, 'drop_off_photo_path'),
  },
  {
    prefix: 'resolved',
    // No single column reliably holds this path server-side across every
    // resolve path, so the safest check is simply: does this report id
    // still exist at all.
    referencedIds: async () => {
      const { data, error } = await supabase.from('reports').select('id')
      if (error) throw error
      return new Set(data.map((row) => row.id))
    },
  },
]

async function main() {
  console.log(DRY_RUN ? 'DRY RUN - nothing will actually be deleted.\n' : 'LIVE RUN - files will be permanently deleted.\n')

  let totalFiles = 0
  let totalFolders = 0

  for (const source of SOURCES) {
    const [idsInUse, folders] = await Promise.all([
      source.referencedIds(),
      listTopLevelFolders(source.prefix),
    ])
    const orphaned = folders.filter((id) => !idsInUse.has(id))

    console.log(`${source.prefix}/ folders in storage: ${folders.length}, still referenced: ${idsInUse.size}, orphaned: ${orphaned.length}`)

    for (const id of orphaned) {
      const files = await listFilesRecursive(`${source.prefix}/${id}`)
      totalFiles += files.length
      totalFolders += 1
      console.log(`${source.prefix}/${id}/  (${files.length} file${files.length === 1 ? '' : 's'})`)
      if (!DRY_RUN && files.length) {
        const { error } = await supabase.storage.from(BUCKET).remove(files)
        if (error) console.error(`  Failed to delete: ${error.message}`)
      }
    }
    console.log('')
  }

  console.log(`${DRY_RUN ? 'Would delete' : 'Deleted'} ${totalFiles} file(s) across ${totalFolders} folder(s).`)
  if (DRY_RUN) console.log('Re-run without --dry-run to actually delete these.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
