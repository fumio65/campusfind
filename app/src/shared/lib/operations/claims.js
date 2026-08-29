import { supabase } from '../supabase'
import { db } from '../db'
import { enqueue, registerHandler, isPrimaryKeyConflict } from '../syncEngine'

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'

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
      const { error: uploadError } = await supabase.storage
        .from('report-photos')
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

  // Note: RLS only lets the report's reporter (not the claimant) update
  // `reports`, so this currently has no effect when run as the claimant -
  // matches existing (pre-offline) app behavior, not something introduced here.
  await supabase.from('reports').update({ status: 'claimed' }).eq('id', claim.report_id)

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

function notifyClaimServer(claim) {
  return fetch(`${SERVER_URL}/claims`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    const ext = file.name.split('.').pop()
    const storage_path = `claims/${claim.id}/${id}.${ext}`
    await db.blobs.put({ id, data: file, mimeType: file.type, createdAt: Date.now() })
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
