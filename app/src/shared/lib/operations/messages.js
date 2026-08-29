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
export async function chooseDropoff({ reportId, claimId, claimantId, reporterId, senderId }) {
  const message = {
    id: crypto.randomUUID(),
    claim_id: claimId,
    sender_id: senderId,
    sender_role: 'claimant',
    body: '📍 ISSC_DROPOFF',
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
