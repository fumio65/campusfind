import { supabase } from '../supabase'
import { db } from '../db'

function publicUrl(storagePath) {
  if (!storagePath) return null
  const { data } = supabase.storage.from('report-photos').getPublicUrl(storagePath)
  return data?.publicUrl ?? null
}

export async function cacheReport(report) {
  await db.reports.put(report)
}

export async function cacheReportPhotos(reportId, photos) {
  await db.report_photos.where('report_id').equals(reportId).delete()
  if (photos.length) await db.report_photos.bulkPut(photos)
}

export async function cacheClaim(claim) {
  await db.claims.put(claim)
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
// Reporter/claimant display names and the walk-in finder name aren't cached
// (no local directory of other users), so they're simply absent offline.
export async function getCachedReportDetail(reportId) {
  const report = await db.reports.get(reportId)
  if (!report) return null

  const photos = await db.report_photos.where('report_id').equals(reportId).sortBy('position')
  const photoUrls = photos.map((p) => publicUrl(p.storage_path))

  const claims = await db.claims.where('report_id').equals(reportId).toArray()
  const activeClaim = claims.find((c) => ['pending', 'approved'].includes(c.status)) ?? null
  const rejectedClaim = claims.find((c) => c.status === 'rejected') ?? null

  let claim = null
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
  } else if (rejectedClaim) {
    claim = rejectedClaim
  }

  const tips = await db.tips.where('report_id').equals(reportId).sortBy('created_at')

  return {
    report: { ...report, photoUrls, walkin_finder_name: null },
    claim,
    tips,
  }
}
