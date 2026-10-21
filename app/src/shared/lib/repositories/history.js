import { useLiveQuery } from 'dexie-react-hooks'
import { supabase } from '../supabase'
import { db } from '../db'
import { isOnline } from '../network'
import { thumbnailUrl, prefetchThumbnails, prefetchFullPhotos } from './reports'

// History (its own tab) and Profile (for its report count) both call this
// for the same user whenever either mounts, and with the tab-switch
// crossfade the outgoing and incoming page can both be mounted at once -
// so two overlapping calls can fire within the same tick. Collapse
// concurrent calls for the same user into the one already in flight,
// rather than running two overlapping passes of bulkPut/bulkDelete over
// the same Dexie tables at the same time.
const inFlightByUser = new Map()

export function refreshHistory(userId) {
  if (!isOnline() || !userId) return Promise.resolve()
  if (inFlightByUser.has(userId)) return inFlightByUser.get(userId)
  const promise = doRefreshHistory(userId).finally(() => {
    inFlightByUser.delete(userId)
  })
  inFlightByUser.set(userId, promise)
  return promise
}

async function doRefreshHistory(userId) {
  const [{ data: r }, { data: c }, { data: t }, { data: te }] = await Promise.all([
    // Same field list as refreshReports (Home) below, since both write
    // into the same local db.reports cache - a narrower select here would
    // silently blank out category/description/type on records Home's own
    // refresh had already populated, the next time this one runs after it.
    supabase
      .from('reports')
      .select('id, title, description, location, category, status, created_at, type, reporter_id')
      .eq('reporter_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('claims')
      .select('id, status, created_at, report_id, claimant_id, reports(title, status)')
      .eq('claimant_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('tips')
      .select('id, text, created_at, report_id, user_id, reports(title)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('trust_score_events')
      .select('id, delta, reason, created_at, user_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ])

  // Reconcile deletions per table: bulkPut only ever adds/overwrites, so a
  // row that dropped out of the fetch (deleted server-side, deleted from
  // another device, or anything else that didn't go through this app's own
  // flows) would otherwise linger in the local cache forever - this is the
  // same gap refreshReports (Home) already guards against for db.reports,
  // applied here to every table this function owns. None of these queries
  // are paginated (no .limit()), so the fetch is always the complete set
  // for this user and pruning is always safe. Rows still _syncStatus:
  // 'pending' are excluded where that applies - those are offline-created
  // and legitimately absent from the server fetch until they sync.
  async function pruneMissing(table, freshRows, matchField, userId, { skipPending = false } = {}) {
    const freshIds = new Set(freshRows.map((row) => row.id))
    const cached = await db[table].where(matchField).equals(userId).toArray()
    const staleIds = cached
      .filter((row) => !skipPending || row._syncStatus !== 'pending')
      .filter((row) => !freshIds.has(row.id))
      .map((row) => row.id)
    if (staleIds.length) await db[table].bulkDelete(staleIds)
  }

  if (r) {
    // Merge, don't replace - see the same note in repositories/reports.js.
    const existingReports = await db.reports.bulkGet(r.map((row) => row.id))
    await db.reports.bulkPut(r.map((row, i) => ({ ...(existingReports[i] ?? {}), ...row })))
    await pruneMissing('reports', r, 'reporter_id', userId, { skipPending: true })

    // My Reports (History) reuses Home's ReportCard, which needs a
    // thumbnail - fetch this user's own report photos too.
    const reportIds = r.map((row) => row.id)
    if (reportIds.length) {
      const { data: photos } = await supabase
        .from('report_photos')
        .select('id, report_id, storage_path, thumbnail_path, position')
        .in('report_id', reportIds)
        .order('position', { ascending: true })
      if (photos?.length) {
        await db.report_photos.bulkPut(photos)
        const freshPhotoIds = new Set(photos.map((p) => p.id))
        const cachedPhotos = await db.report_photos.where('report_id').anyOf(reportIds).toArray()
        const stalePhotoIds = cachedPhotos.filter((p) => !freshPhotoIds.has(p.id)).map((p) => p.id)
        if (stalePhotoIds.length) await db.report_photos.bulkDelete(stalePhotoIds)
        // Same thumbnail + full-res cover-photo warm-up as Home's
        // refreshReports, for the same reason: this is an offline-first
        // app, so a photo the user has already seen on a My Reports/History
        // card should feel just as "already loaded" when they tap into it
        // as it does on Home - not a second, inconsistent cold fetch just
        // because this list came from a different refresh function.
        const firstByReport = prefetchThumbnails(reportIds, photos)
        prefetchFullPhotos(reportIds, firstByReport)
      }
    }
  }
  // Strip the joined report title before caching - it's resolved back at
  // read time from the shared `reports` cache (see useHistory below), which
  // stays correct even if the report is later renamed.
  if (c) {
    // Keep the report's status on the claim: an approved claim stays
    // 'approved' after the handoff, so History needs the report's status to
    // say whether the item was actually returned.
    const claims = c.map(({ reports, ...claim }) => ({ ...claim, report_status: reports?.status ?? null }))
    await db.claims.bulkPut(claims)
    await pruneMissing('claims', claims, 'claimant_id', userId, { skipPending: true })
  }
  if (t) {
    const tips = t.map(({ reports: _reports, ...tip }) => tip)
    await db.tips.bulkPut(tips)
    await pruneMissing('tips', tips, 'user_id', userId, { skipPending: true })
  }
  if (te) {
    await db.trust_score_events.bulkPut(te)
    await pruneMissing('trust_score_events', te, 'user_id', userId)
  }
}

// ProfilePage's "30-day rejection window" - reuses the same cached claims
// refreshHistory already populates (it fetches all of a claimant's claims,
// not just non-rejected ones), so no separate network call is needed.
export function useRecentRejections(userId) {
  return useLiveQuery(async () => {
    if (!userId) return []
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const [claims, allReports] = await Promise.all([
      db.claims.where('claimant_id').equals(userId).toArray(),
      db.reports.toArray(),
    ])
    const titleByReportId = Object.fromEntries(allReports.map((r) => [r.id, r.title]))
    return claims
      .filter((c) => c.status === 'rejected' && new Date(c.created_at).getTime() >= thirtyDaysAgo)
      .map((c) => (titleByReportId[c.report_id] ? { ...c, reports: { title: titleByReportId[c.report_id] } } : c))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }, [userId])
}

// Reads reactively from the local cache - reflects whatever refreshHistory
// last wrote, plus any offline-created reports/claims/tips queued locally.
export function useHistory(userId) {
  return useLiveQuery(async () => {
    if (!userId) return { reports: [], claims: [], tips: [], trustEvents: [] }

    const [reports, claims, tips, trustEvents, allReports, photos] = await Promise.all([
      db.reports.where('reporter_id').equals(userId).toArray(),
      db.claims.where('claimant_id').equals(userId).toArray(),
      db.tips.where('user_id').equals(userId).toArray(),
      db.trust_score_events.where('user_id').equals(userId).toArray(),
      db.reports.toArray(),
      db.report_photos.toArray(),
    ])

    const titleByReportId = Object.fromEntries(allReports.map((r) => [r.id, r.title]))
    const statusByReportId = Object.fromEntries(allReports.map((r) => [r.id, r.status]))
    const withTitle = (row) => {
      const withName = titleByReportId[row.report_id] ? { ...row, reports: { title: titleByReportId[row.report_id] } } : row
      // Prefer the cached report's status (refreshed by Home and the report
      // page); fall back to the one stored with the claim.
      const reportStatus = statusByReportId[row.report_id] ?? row.report_status ?? null
      return reportStatus ? { ...withName, report_status: reportStatus } : withName
    }
    const byNewest = (a, b) => new Date(b.created_at) - new Date(a.created_at)

    // Same "first photo by report" pattern as useReports (Home) - reuses
    // the same ReportCard, so it needs the same thumbnail shape.
    const firstPhotoByReport = {}
    for (const photo of [...photos].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
      if (!(photo.report_id in firstPhotoByReport)) firstPhotoByReport[photo.report_id] = photo
    }
    const withThumbnail = (report) => {
      const photo = firstPhotoByReport[report.id]
      return { ...report, thumbnail: thumbnailUrl(photo?.thumbnail_path ?? photo?.storage_path) }
    }

    return {
      reports: [...reports].map(withThumbnail).sort(byNewest),
      claims: claims.map(withTitle).sort(byNewest),
      tips: tips.map(withTitle).sort(byNewest),
      trustEvents: [...trustEvents].sort(byNewest),
    }
  }, [userId])
}
