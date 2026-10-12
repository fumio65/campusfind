import { useLiveQuery } from 'dexie-react-hooks'
import { supabase } from '../supabase'
import { db } from '../db'
import { isOnline } from '../network'

export async function refreshMessages(claimId) {
  if (!isOnline() || !claimId) return
  const { data } = await supabase
    .from('claim_messages')
    .select('id, body, sender_role, created_at, sender_id')
    .eq('claim_id', claimId)
    .order('created_at', { ascending: true })
  if (data?.length) await db.claim_messages.bulkPut(data.map((m) => ({ ...m, claim_id: claimId })))
}

// Reads reactively from the local cache - reflects whatever refreshMessages
// last wrote, plus any queued-but-not-yet-synced outgoing messages.
export function useMessages(claimId) {
  return useLiveQuery(async () => {
    if (!claimId) return []
    const rows = await db.claim_messages.where('claim_id').equals(claimId).toArray()
    return rows.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  }, [claimId])
}

export async function refreshDropOffStatus(claimId) {
  if (!isOnline() || !claimId) return
  const { data } = await supabase
    .from('dropoff_requests')
    .select('id, claim_id, status, updated_at')
    .eq('claim_id', claimId)
    .maybeSingle()
  if (data) await db.dropoff_requests.put(data)
}

// Returns both the status and the time it last changed (updated_at) - the
// dropoff edge function bumps updated_at on every status transition
// (pending -> received -> resolved), so this is the real "when did this
// status become true" timestamp. Previously only `status` was read out of
// the row, so the banner showing it had nothing but the original chat
// message's created_at to display - the banner text updated live as status
// changed, but its "x ago" timestamp stayed frozen to the moment drop-off
// was first chosen, not when it was actually received/resolved.
export function useDropOffStatus(claimId) {
  const row = useLiveQuery(async () => {
    if (!claimId) return null
    return (await db.dropoff_requests.where('claim_id').equals(claimId).first()) ?? null
  }, [claimId])
  return { status: row?.status ?? null, updatedAt: row?.updated_at ?? null }
}
