import { supabase } from '../supabase'
import { db } from '../db'
import { enqueue, registerHandler, isPrimaryKeyConflict } from '../syncEngine'
import { seedCache } from '../imageCache'

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

// A newly-authored photo's bytes are already sitting locally (this file)
// well before it's ever uploaded to storage - seed the cache with them
// under the same public-URL key CachedImage will later request, so the
// thumbnail/gallery shows the user's own photo instantly instead of
// waiting on the upload to land and a network fetch to complete.
function publicUrl(storagePath) {
  const { data } = supabase.storage.from('report-photos').getPublicUrl(storagePath)
  return data?.publicUrl ?? null
}

registerHandler('createReport', async (payload) => {
  const { report, photos } = payload

  const { error: reportError } = await supabase.from('reports').insert({
    id: report.id,
    title: report.title,
    description: report.description,
    location: report.location,
    category: report.category,
    type: report.type,
    status: report.status,
    reporter_id: report.reporter_id,
  })
  if (reportError && !isPrimaryKeyConflict(reportError)) throw reportError

  for (const photo of photos) {
    const blob = await db.blobs.get(photo.id)
    if (blob) {
      const { error: uploadError } = await supabase.storage
        .from('report-photos')
        .upload(photo.storage_path, blob.data, { cacheControl: '3600', upsert: true })
      if (uploadError) throw uploadError
    }

    const { error: photoError } = await supabase.from('report_photos').insert({
      id: photo.id,
      report_id: report.id,
      storage_path: photo.storage_path,
      position: photo.position,
    })
    if (photoError && !isPrimaryKeyConflict(photoError)) throw photoError

    await db.blobs.delete(photo.id)
  }

  notifyReportServer(report).catch(() => {})
})

function notifyReportServer(report) {
  return fetch(`${SERVER_URL}/reports/${report.id}/announce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reporterId: report.reporter_id,
      title: report.title,
      location: report.location,
      category: report.category,
    }),
  })
}

registerHandler('updateReport', async (payload) => {
  const { reportId, fields, removedPhotos, newPhotos } = payload

  const { error: updateError } = await supabase.from('reports').update(fields).eq('id', reportId)
  if (updateError) throw updateError

  for (const photo of removedPhotos) {
    // Both steps are naturally idempotent: removing an already-removed
    // storage object, or deleting an already-deleted row, is a no-op.
    await supabase.storage.from('report-photos').remove([photo.storage_path])
    const { error } = await supabase.from('report_photos').delete().eq('id', photo.id)
    if (error) throw error
  }

  for (const photo of newPhotos) {
    const blob = await db.blobs.get(photo.id)
    if (blob) {
      const { error: uploadError } = await supabase.storage
        .from('report-photos')
        .upload(photo.storage_path, blob.data, { cacheControl: '3600', upsert: true })
      if (uploadError) throw uploadError
    }

    const { error: photoError } = await supabase.from('report_photos').insert({
      id: photo.id,
      report_id: reportId,
      storage_path: photo.storage_path,
      position: photo.position,
    })
    if (photoError && !isPrimaryKeyConflict(photoError)) throw photoError

    await db.blobs.delete(photo.id)
  }
})

// Writes optimistically to the local cache and queues the compound update
// (report fields + removed photos + new photo uploads). Used for both the
// online-immediate and offline-queued paths.
export async function updateReport({
  reportId,
  title,
  description,
  location,
  category,
  existingPhotos,
  removedPhotoIds,
  newPhotoFiles,
}) {
  const fields = {
    title: title.trim(),
    description: description.trim(),
    location: location.trim(),
    category,
  }

  const removedPhotos = existingPhotos
    .filter((p) => removedPhotoIds.includes(p.id))
    .map(({ id, storage_path }) => ({ id, storage_path }))

  const startPosition = existingPhotos.filter((p) => !removedPhotoIds.includes(p.id)).length
  const newPhotos = []
  for (const [i, file] of newPhotoFiles.entries()) {
    const id = crypto.randomUUID()
    const ext = file.name.split('.').pop()
    // Matches EditReportPage's existing (prefix-less) path convention for
    // edited-in photos - not changed here since bucket layout/permissions
    // for this path shape haven't been verified.
    const storage_path = `${reportId}/${id}.${ext}`
    await db.blobs.put({ id, data: file, mimeType: file.type, createdAt: Date.now() })
    seedCache(publicUrl(storage_path), file)
    newPhotos.push({ id, report_id: reportId, storage_path, position: startPosition + i })
  }

  const cachedReport = await db.reports.get(reportId)
  if (cachedReport) await db.reports.put({ ...cachedReport, ...fields })
  for (const photo of removedPhotos) await db.report_photos.delete(photo.id)
  if (newPhotos.length) await db.report_photos.bulkPut(newPhotos)

  await enqueue({
    id: crypto.randomUUID(),
    opType: 'updateReport',
    entity: 'reports',
    payload: { reportId, fields, removedPhotos, newPhotos },
  })
}

// Writes optimistically to the local cache and queues the compound insert
// (report + photo uploads + photo rows). Used for both the online-immediate
// and offline-queued paths - the queued replay runs the exact same
// 'createReport' handler registered above, and every sub-step is safe to
// re-run (deterministic photo ids/paths, upsert uploads, PK-conflict = done).
export async function createReport({ title, description, location, category, reporterId, photoFiles }) {
  const report = {
    id: crypto.randomUUID(),
    title: title.trim(),
    description: description.trim() || null,
    location: location.trim(),
    category: category || null,
    type: 'lost',
    status: 'open',
    reporter_id: reporterId,
    created_at: new Date().toISOString(),
  }

  const photos = []
  for (const [position, file] of photoFiles.entries()) {
    const id = crypto.randomUUID()
    const ext = file.name.split('.').pop()
    const storage_path = `reports/${report.id}/${id}.${ext}`
    await db.blobs.put({ id, data: file, mimeType: file.type, createdAt: Date.now() })
    seedCache(publicUrl(storage_path), file)
    photos.push({ id, report_id: report.id, storage_path, position })
  }

  report._syncStatus = 'pending'
  await db.reports.put(report)
  if (photos.length) await db.report_photos.bulkPut(photos)

  await enqueue({
    id: report.id,
    opType: 'createReport',
    entity: 'reports',
    payload: { report, photos },
    rows: [{ table: 'reports', id: report.id }],
  })

  return report
}
