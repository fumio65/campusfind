import { supabase } from '../supabase'
import { db } from '../db'

function publicUrl(storagePath) {
  if (!storagePath) return null
  const { data } = supabase.storage.from('report-photos').getPublicUrl(storagePath)
  return data?.publicUrl ?? null
}

// Merges onto whatever's already cached rather than overwriting wholesale -
// fetchAll() caches the report twice (once with the raw row, again once the
// reporter's name has resolved), and a second concurrent fetchAll (React's
// StrictMode double-invoke in dev, or an overlapping realtime-triggered
// refresh) can otherwise have its early write land after the enriched one
// and erase the name fields it doesn't know about.
export async function cacheReport(report) {
  const existing = await db.reports.get(report.id)
  await db.reports.put({ ...existing, ...report })
}

export async function cacheReportPhotos(reportId, photos) {
  await db.report_photos.where('report_id').equals(reportId).delete()
  if (photos.length) await db.report_photos.bulkPut(photos)
}

// Same merge reasoning as cacheReport - avoids an early raw write (before
// the claimant's name has resolved) clobbering a later enriched one.
export async function cacheClaim(claim) {
  const existing = await db.claims.get(claim.id)
  await db.claims.put({ ...existing, ...claim })
}

export async function cacheClaimPhotos(claimId, photos) {
  await db.claim_photos.where('claim_id').equals(claimId).delete()
  if (photos.length) await db.claim_photos.bulkPut(photos)
}

export async function cacheClaimMessages(claimId, messages) {
  if (messages.length) await db.claim_messages.bulkPut(messages)
}

export async function cacheTips(reportId, tips) {
  await db.tips.where('report_id').equals(reportId).delete()
  if (tips.length) {
    // Store the joined author info alongside the tip row so names survive
    // an offline read (TipCard falls back to "Anonymous" if this is absent).
    await db.tips.bulkPut(tips.map(({ users, ...tip }) => ({ ...tip, users: users ?? null })))
  }
}

// Reconstructs the same shape fetchAll() builds from the network, from the
// local cache - used as a fallback when the network fetch fails (offline).
// There's no local directory of other users, so the reporter's and
// claimant's names are stashed as extra fields on the cached report/claim
// row (see cacheReport/cacheClaim callers) purely so they can be read back
// here instead of always popping in late on a repeat visit. The walk-in
// finder name isn't stashed anywhere, so it's simply absent offline.
export async function getCachedReportDetail(reportId) {
  const report = await db.reports.get(reportId)
  if (!report) return null

  const photos = await db.report_photos.where('report_id').equals(reportId).sortBy('position')
  const photoUrls = photos.map((p) => publicUrl(p.storage_path))

  const reporter = report.reporter_first_name
    ? { first_name: report.reporter_first_name, last_name: report.reporter_last_name }
    : null

  const claims = await db.claims.where('report_id').equals(reportId).toArray()
  const activeClaim = claims.find((c) => ['pending', 'approved'].includes(c.status)) ?? null
  const rejectedClaim = claims.find((c) => c.status === 'rejected') ?? null

  let claim = null
  let claimant = null
  if (activeClaim) {
    const claimPhotos = await db.claim_photos.where('claim_id').equals(activeClaim.id).sortBy('position')
    const messages = await db.claim_messages.where('claim_id').equals(activeClaim.id).sortBy('created_at')
    const dropOffChosen = messages.some((m) => m.body?.startsWith('📍'))
    const claimantMessage =
      messages.find((m) => m.sender_role === 'claimant' && !m.body?.startsWith('📍'))?.body ?? null
    claim = {
      ...activeClaim,
      photoUrls: claimPhotos.map((p) => publicUrl(p.storage_path)),
      drop_off_chosen: dropOffChosen,
      claimant_message: claimantMessage,
    }
    if (activeClaim.claimant_first_name) {
      claimant = {
        first_name: activeClaim.claimant_first_name,
        last_name: activeClaim.claimant_last_name,
        trust_score: activeClaim.claimant_trust_score,
        student_id: activeClaim.claimant_student_id,
      }
    }
  } else if (rejectedClaim) {
    claim = rejectedClaim
  }

  const tips = await db.tips.where('report_id').equals(reportId).sortBy('created_at')

  return {
    report: { ...report, photoUrls, walkin_finder_name: null },
    reporter,
    claim,
    claimant,
    tips,
  }
}
