import { useLiveQuery } from 'dexie-react-hooks'
import { supabase } from '../supabase'
import { db } from '../db'
import { isOnline } from '../network'
import { ensureCachedInOrder } from '../imageCache'

const VISIBLE_STATUSES = ['open', 'claimed', 'approved', 'resolved']

export function thumbnailUrl(storagePath) {
  if (!storagePath) return null
  const { data } = supabase.storage.from('report-photos').getPublicUrl(storagePath)
  return data?.publicUrl ?? null
}

// Warms the image cache for the reports list's visible thumbnails (one per
// report, matching what useReports actually renders) so by the time the
// live query below picks up the refreshed data, the thumbnail bytes are
// already on their way in - or already sitting in cache - instead of each
// ReportCard's CachedImage discovering the miss on its own only once mounted.
// orderedReportIds fixes the fetch priority to match the list's own order
// (newest first) so thumbnails tend to resolve top-to-bottom instead of in
// whatever order the network happens to return them.
export function prefetchThumbnails(orderedReportIds, photos) {
  const firstByReport = new Map()
  for (const photo of [...photos].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
    if (!firstByReport.has(photo.report_id)) firstByReport.set(photo.report_id, photo)
  }
  const entries = orderedReportIds
    .map((id) => firstByReport.get(id))
    .filter(Boolean)
    .map((photo) => {
      const url = thumbnailUrl(photo.thumbnail_path ?? photo.storage_path)
      return url ? { src: url, cacheKey: url } : null
    })
    .filter(Boolean)
  ensureCachedInOrder(entries)
  return firstByReport
}

// Warms the full-resolution version of each report's cover photo too - the
// very same photo the card already shows as a thumbnail. Uploads are now
// capped to ~1920px (see makeDisplayImage in imageThumbnail.js) instead of
// an untouched camera original, so this is a cheap enough fetch to do
// speculatively for the whole visible list. Without this, a user who's
// already looking at a report's cover photo on the card would still hit a
// cold fetch the instant they tap into the report and open the lightbox -
// which reads as "didn't this already load?" even though it's technically
// a different (bigger) version of the same photo. Same concurrency as
// prefetchThumbnails: now that full photos are downscaled too, there's no
// longer a real size difference worth throttling for - and the whole point
// is for this to finish before the user has a chance to tap into a report,
// so it should run exactly as eagerly as the thumbnails do.
export function prefetchFullPhotos(orderedReportIds, firstByReport) {
  const entries = orderedReportIds
    .map((id) => firstByReport.get(id))
    .filter(Boolean)
    .map((photo) => {
      const url = thumbnailUrl(photo.storage_path)
      return url ? { src: url, cacheKey: url } : null
    })
    .filter(Boolean)
  ensureCachedInOrder(entries)
}

// Cache-aside refresh: fetches from Supabase when online and writes into
// Dexie. Reads always come from the useReports live query below, whether
// online or offline - there is one rendering code path for both.
// Home's own realtime listeners/sync triggers can call this again before
// a prior call has finished, and with the tab-switch crossfade a second,
// still-exiting page can briefly overlap a freshly-mounted one too -
// collapse concurrent calls into the one already in flight rather than
// running two overlapping bulkPut/bulkDelete passes over db.reports at
// the same time.
let inFlight = null

export function refreshReports(filters = {}) {
  if (!isOnline()) return Promise.resolve()
  if (inFlight) return inFlight
  inFlight = doRefreshReports(filters).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function doRefreshReports({ search, category, location, status } = {}) {
  let query = supabase
    .from('reports')
    .select('id, title, description, location, category, status, created_at, type, reporter_id')
    .in('status', status ? [status] : VISIBLE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(30)

  if (search?.trim()) {
    query = query.or(
      `title.ilike.%${search}%,description.ilike.%${search}%,location.ilike.%${search}%`,
    )
  }
  if (category) query = query.eq('category', category)
  if (location?.trim()) query = query.ilike('location', `%${location}%`)

  const { data } = await query
  if (!data) return
  await db.reports.bulkPut(data)

  // Reconcile deletions: bulkPut only ever adds/updates, so a report that
  // dropped out of this result set (deleted server-side, or no longer
  // matching these filters/status) would otherwise linger in the local
  // cache forever - e.g. on another user's Home feed, after the reporter
  // deletes it. Prune any previously-synced cached report that matches
  // these same filters but isn't in the fresh fetch. Reports still
  // _syncStatus: 'pending' are excluded - those are offline-created and
  // legitimately absent from the server fetch until they sync; deleting
  // them here would discard real unsynced work.
  const fetchedIds = new Set(data.map((r) => r.id))
  const cached = await db.reports.toArray()
  const staleIds = cached
    .filter((r) => r._syncStatus !== 'pending')
    .filter((r) => matchesFilters(r, { search, category, location, status }))
    .filter((r) => !fetchedIds.has(r.id))
    .map((r) => r.id)
  if (staleIds.length) {
    await db.reports.bulkDelete(staleIds)
    await db.report_photos.where('report_id').anyOf(staleIds).delete()
  }

  const reportIds = data.map((r) => r.id)
  if (!reportIds.length) return
  const { data: photos } = await supabase
    .from('report_photos')
    .select('id, report_id, storage_path, thumbnail_path, position')
    .in('report_id', reportIds)
    .order('position', { ascending: true })
  if (photos?.length) {
    await db.report_photos.bulkPut(photos)
    const firstByReport = prefetchThumbnails(reportIds, photos)
    prefetchFullPhotos(reportIds, firstByReport)
  }
}

export async function fetchAvailableLocations() {
  if (isOnline()) {
    const { data } = await supabase
      .from('reports')
      .select('location')
      .in('status', VISIBLE_STATUSES)
      .not('location', 'is', null)
    if (data) return [...new Set(data.map((r) => r.location).filter(Boolean))].sort()
  }
  const cached = await db.reports.toArray()
  return [...new Set(cached.map((r) => r.location).filter(Boolean))].sort()
}

function matchesFilters(report, { search, category, location, status }) {
  const statuses = status ? [status] : VISIBLE_STATUSES
  if (!statuses.includes(report.status)) return false
  if (category && report.category !== category) return false
  if (location?.trim() && !report.location?.toLowerCase().includes(location.trim().toLowerCase())) {
    return false
  }
  if (search?.trim()) {
    const needle = search.trim().toLowerCase()
    const haystack = `${report.title ?? ''} ${report.description ?? ''} ${report.location ?? ''}`.toLowerCase()
    if (!haystack.includes(needle)) return false
  }
  return true
}

// Reads reactively from the local cache - reflects whatever refreshReports
// last wrote, plus any offline-created reports queued locally.
export function useReports({ search, category, location, status } = {}) {
  return useLiveQuery(async () => {
    const [reports, photos] = await Promise.all([db.reports.toArray(), db.report_photos.toArray()])

    const firstPhotoByReport = {}
    for (const photo of [...photos].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
      if (!(photo.report_id in firstPhotoByReport)) firstPhotoByReport[photo.report_id] = photo
    }

    return reports
      .filter((r) => matchesFilters(r, { search, category, location, status }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 30)
      .map((r) => {
        const photo = firstPhotoByReport[r.id]
        return { ...r, thumbnail: thumbnailUrl(photo?.thumbnail_path ?? photo?.storage_path) }
      })
  }, [search, category, location, status])
}
