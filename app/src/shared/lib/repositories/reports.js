import { useLiveQuery } from 'dexie-react-hooks'
import { supabase } from '../supabase'
import { db } from '../db'
import { isOnline } from '../network'
import { ensureCached } from '../imageCache'

const VISIBLE_STATUSES = ['open', 'claimed', 'approved', 'resolved']

function thumbnailUrl(storagePath) {
  if (!storagePath) return null
  const { data } = supabase.storage.from('report-photos').getPublicUrl(storagePath)
  return data?.publicUrl ?? null
}

// Warms the image cache for the reports list's visible thumbnails (one per
// report, matching what useReports actually renders) so by the time the
// live query below picks up the refreshed data, the thumbnail bytes are
// already on their way in - or already sitting in cache - instead of each
// ReportCard's CachedImage discovering the miss on its own only once mounted.
function prefetchThumbnails(photos) {
  const firstByReport = new Map()
  for (const photo of [...photos].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))) {
    if (!firstByReport.has(photo.report_id)) firstByReport.set(photo.report_id, photo.storage_path)
  }
  for (const storagePath of firstByReport.values()) {
    const url = thumbnailUrl(storagePath)
    if (url) ensureCached(url, url)
  }
}

// Cache-aside refresh: fetches from Supabase when online and writes into
// Dexie. Reads always come from the useReports live query below, whether
// online or offline - there is one rendering code path for both.
export async function refreshReports({ search, category, location, status } = {}) {
  if (!isOnline()) return

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

  const reportIds = data.map((r) => r.id)
  if (!reportIds.length) return
  const { data: photos } = await supabase
    .from('report_photos')
    .select('id, report_id, storage_path, position')
    .in('report_id', reportIds)
    .order('position', { ascending: true })
  if (photos?.length) {
    await db.report_photos.bulkPut(photos)
    prefetchThumbnails(photos)
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
      if (!(photo.report_id in firstPhotoByReport)) firstPhotoByReport[photo.report_id] = photo.storage_path
    }

    return reports
      .filter((r) => matchesFilters(r, { search, category, location, status }))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 30)
      .map((r) => ({ ...r, thumbnail: thumbnailUrl(firstPhotoByReport[r.id]) }))
  }, [search, category, location, status])
}
