import { supabase } from '../supabase'
import { db } from '../db'
import { enqueue, registerHandler, isPrimaryKeyConflict } from '../syncEngine'
import { makeDisplayImage } from '../imageThumbnail'

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

registerHandler('submitClaim', async (payload) => {
  const { claim, photos, message, originalTipId } = payload

  const { error: claimError } = await supabase.from('claims').insert({
    id: claim.id,
    report_id: claim.report_id,
    claimant_id: claim.claimant_id,
    status: claim.status,
  })
  if (claimError && !isPrimaryKeyConflict(claimError)) throw claimError

  for (const photo of photos) {
    const blob = await db.blobs.get(photo.id)
    if (blob) {
      // FIX: claim evidence photos are private (reporter + claimant +
      // admin only, see claim_photos RLS) and must live in their own
      // private bucket - report-photos is public, which would make this
      // file fetchable by anyone with the URL regardless of any RLS on
      // the claim_photos table row.
      const { error: uploadError } = await supabase.storage
        .from('claim-photos')
        .upload(photo.storage_path, blob.data, { cacheControl: '3600', upsert: true })
      if (uploadError) throw uploadError
    }

    const { error: photoError } = await supabase.from('claim_photos').insert({
      id: photo.id,
      claim_id: claim.id,
      storage_path: photo.storage_path,
      position: photo.position,
    })
    if (photoError && !isPrimaryKeyConflict(photoError)) throw photoError

    await db.blobs.delete(photo.id)
  }

  // The report is marked 'claimed' by the trg_claims_mark_report_claimed
  // trigger when the claim row is inserted (students can't update status).

  const { error: messageError } = await supabase.from('claim_messages').insert({
    id: message.id,
    claim_id: claim.id,
    sender_id: message.sender_id,
    sender_role: message.sender_role,
    body: message.body,
  })
  if (messageError && !isPrimaryKeyConflict(messageError)) throw messageError

  if (originalTipId) {
    // Note: `tips` has no UPDATE RLS policy, so this currently has no effect -
    // matches existing (pre-offline) app behavior, not something introduced here.
    await supabase.from('tips').update({ converted_to_claim_id: claim.id }).eq('id', originalTipId)
  }

  notifyClaimServer(claim).catch(() => {})
})

// FIX: claims function now requires a valid JWT (verify_jwt=true), so this
// best-effort notify call needs the signed-in user's access token too.
async function notifyClaimServer(claim) {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(`${SERVER_URL}/claims`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ANON_KEY,
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ reportId: claim.report_id, claimantId: claim.claimant_id }),
  })
}

// Writes optimistically to the local cache and queues the compound insert
// (claim + photo uploads + report status + initial message + tip link).
// Used for both the online-immediate and offline-queued paths.
export async function submitClaim({ reportId, claimantId, photoFiles, messageText, originalTipId }) {
  const claim = {
    id: crypto.randomUUID(),
    report_id: reportId,
    claimant_id: claimantId,
    status: 'pending',
    created_at: new Date().toISOString(),
  }

  const photos = []
  for (const [position, file] of photoFiles.entries()) {
    const id = crypto.randomUUID()
    // Downscale the claim proof photo too, for the same reason as report
    // photos - the lightbox fetches this full-size, and claim photos have
    // no separate thumbnail at all, so this is the only version ever
    // fetched for them.
    const displayBlob = await makeDisplayImage(file)
    const ext = displayBlob ? 'jpg' : file.name.split('.').pop()
    const storage_path = `claims/${claim.id}/${id}.${ext}`
    await db.blobs.put({ id, data: displayBlob ?? file, mimeType: displayBlob ? 'image/jpeg' : file.type, createdAt: Date.now() })
    photos.push({ id, claim_id: claim.id, storage_path, position })
  }

  const message = {
    id: crypto.randomUUID(),
    claim_id: claim.id,
    sender_id: claimantId,
    sender_role: 'claimant',
    body: messageText.trim(),
    created_at: new Date().toISOString(),
  }

  claim._syncStatus = 'pending'
  message._syncStatus = 'pending'
  await db.claims.put(claim)
  if (photos.length) await db.claim_photos.bulkPut(photos)
  await db.claim_messages.put(message)

  await enqueue({
    id: claim.id,
    opType: 'submitClaim',
    entity: 'claims',
    payload: { claim, photos, message, originalTipId: originalTipId ?? null },
    rows: [
      { table: 'claims', id: claim.id },
      { table: 'claim_messages', id: message.id },
    ],
  })

  return claim
}
