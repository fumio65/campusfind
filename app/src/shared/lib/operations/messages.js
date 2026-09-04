import { supabase } from '../supabase'
import { db } from '../db'
import { enqueue, registerHandler, isPrimaryKeyConflict } from '../syncEngine'

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:3001'
const EDGE_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : 'https://muigquisnrhdbvnexyzu.supabase.co/functions/v1'
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

async function insertMessage(message) {
  const { error } = await supabase.from('claim_messages').insert({
    id: message.id,
    claim_id: message.claim_id,
    sender_id: message.sender_id,
    sender_role: message.sender_role,
    body: message.body,
  })
  if (error && !isPrimaryKeyConflict(error)) throw error
}

registerHandler('sendMessage', async (message) => {
  await insertMessage(message)
  notifyMessageServer(message).catch(() => {})
})

function notifyMessageServer(message) {
  return fetch(`${SERVER_URL}/claims/${message.claim_id}/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senderId: message.sender_id, senderRole: message.sender_role }),
  })
}

export async function sendMessage({ claimId, senderId, senderRole, body }) {
  const message = {
    id: crypto.randomUUID(),
    claim_id: claimId,
    sender_id: senderId,
    sender_role: senderRole,
    body,
    created_at: new Date().toISOString(),
  }
  message._syncStatus = 'pending'
  await db.claim_messages.put(message)
  await enqueue({
    id: message.id,
    opType: 'sendMessage',
    entity: 'claim_messages',
    payload: message,
    rows: [{ table: 'claim_messages', id: message.id }],
  })
  return message
}

export const DROPOFF_CHOSEN_BODY    = '📍 ISSC_DROPOFF'
export const DROPOFF_REQUESTED_BODY = '🔔 ISSC_DROPOFF_REQUESTED'
export const DROPOFF_DECLINED_BODY  = '🚫 ISSC_DROPOFF_DECLINED'

registerHandler('chooseDropoff', async (payload) => {
  const { message, reportId, claimId, claimantId, reporterId } = payload
  await insertMessage(message)

  const res = await fetch(`${EDGE_URL}/dropoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
    body: JSON.stringify({ reportId, claimId, claimantId, reporterId }),
  })
  if (!res.ok) {
    const err = new Error(`Drop-off request failed (${res.status})`)
    err.status = res.status
    throw err
  }
})

// Sends the drop-off marker message and registers the drop-off with ISSC via
// the edge function, as one queued/retried unit (previously the edge-function
// call was fire-and-forget and silently lost if it failed while offline).
// Called from the "Accept" action on either side of a suggest/accept exchange
// (see requestDropoff/declineDropoffRequest below) - claimantId/reporterId are
// always the claim's actual roles, independent of who clicked accept, since
// the claimant is the one who will physically bring the item to ISSC.
export async function chooseDropoff({ reportId, claimId, claimantId, reporterId, senderId }) {
  const message = {
    id: crypto.randomUUID(),
    claim_id: claimId,
    sender_id: senderId,
    sender_role: 'claimant',
    body: DROPOFF_CHOSEN_BODY,
    created_at: new Date().toISOString(),
  }
  message._syncStatus = 'pending'
  await db.claim_messages.put(message)
  await enqueue({
    id: message.id,
    opType: 'chooseDropoff',
    entity: 'claim_messages',
    payload: { message, reportId, claimId, claimantId, reporterId },
    rows: [{ table: 'claim_messages', id: message.id }],
  })
  return message
}

// Suggest/decline are plain synced chat messages (reusing sendMessage), not a
// new sync op - either party can send one, and only chooseDropoff above
// actually registers anything with ISSC.
export function requestDropoff({ claimId, senderId, senderRole }) {
  return sendMessage({ claimId, senderId, senderRole, body: DROPOFF_REQUESTED_BODY })
}

export function declineDropoffRequest({ claimId, senderId, senderRole }) {
  return sendMessage({ claimId, senderId, senderRole, body: DROPOFF_DECLINED_BODY })
}
